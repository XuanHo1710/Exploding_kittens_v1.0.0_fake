import { Injectable, Logger } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import type { Server } from 'socket.io';
import { BET_OPTIONS, CHAT_MAX_LEN, EMOTES, THROWABLES, normalizeRoomRules, roomDeckSummary, type ChatMessage, type Emote, type RoomRules } from '../../../shared/src';
import { RateLimiter } from '../rate-limit';
import { AccountsService } from '../store/accounts.service';
import { Game, GameError, GameHooks } from './game';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);
  private rooms = new Map<string, Game>();
  private starting = new Set<Game>();
  private deferredConnections = new Map<Game, Map<string, boolean>>();
  private refunds = new Map<Game, { playerIds: string[]; bet: number; chargeOp: string; refundOp: string }>();
  private payouts = new Map<Game, Promise<void>>();
  private failedPayouts = new Set<Game>();
  /** Trả thưởng lỗi: tự thử lại (cùng mã thao tác nên không trả 2 lần) */
  private payoutRetry = new Map<Game, NodeJS.Timeout>();
  /** playerId → mã phòng đang ở */
  private playerRoom = new Map<string, string>();
  private server: Server;
  /** Người chơi đã đăng nhập bằng PIN (socket có token đúng) → được dùng xu */
  private verified = new Set<string>();

  constructor(private readonly accounts: AccountsService) {}

  private hooks: GameHooks = {
    changed: (game) => this.broadcast(game),
    notify: (playerId, notice) => this.server.to(`p:${playerId}`).emit('notice', notice),
    fx: (game, fx) => this.members(game).forEach((p) => this.server.to(`p:${p.id}`).emit('fx', fx)),
    removed: (playerId, code) => {
      if (this.playerRoom.get(playerId) !== code) return;
      this.playerRoom.delete(playerId);
      this.server.to(`p:${playerId}`).emit('state', null);
      // bị xoá khỏi phòng khi đã thoát hẳn (vd. chơi lại sau khi rời ván): dọn dữ liệu tạm luôn
      this.server.in(`p:${playerId}`).fetchSockets().then(
        (sockets) => { if (!sockets.length) this.forget(playerId); },
        () => undefined,
      );
    },
  };

  /** Biểu cảm cho bấm dồn dập: tối đa 8 cái liền, hồi 6 cái/giây (chống spam vô hạn) */
  private emoteBucket = new Map<string, { tokens: number; at: number }>();
  /** Chat theo phòng: giữ 100 tin gần nhất */
  private chats = new Map<string, ChatMessage[]>();
  private chatSeq = 0;
  private chatLimit = new RateLimiter(1, 400);
  private typingLimit = new RateLimiter(1, 1000);
  private profileLimit = new RateLimiter(3, 10_000);

  /** Người chơi không còn socket nào và không ở phòng nào: xoá dữ liệu tạm theo người (giữ bộ nhớ có giới hạn) */
  forget(playerId: string) {
    if (this.playerRoom.has(playerId)) return;
    this.verified.delete(playerId);
    this.emoteBucket.delete(playerId);
    this.chatLimit.forget(playerId);
    this.typingLimit.forget(playerId);
  }

  chat(playerId: string, raw: string) {
    const game = this.roomOf(playerId);
    const me = game?.players.find((p) => p.id === playerId) ?? game?.spectator(playerId);
    if (!game || !me) return;
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return;
    const now = Date.now();
    if (!this.chatLimit.hit(playerId, now)) throw new GameError('Gõ chậm thôi nào 😅');
    const msg: ChatMessage = { id: ++this.chatSeq, from: playerId, name: me.name, avatar: me.avatar, text, at: now };
    const list = [...(this.chats.get(game.code) ?? []), msg].slice(-100);
    this.chats.set(game.code, list);
    this.members(game).forEach((p) => this.server.to(`p:${p.id}`).emit('chat', msg));
  }

  typing(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game || !this.typingLimit.hit(playerId)) return;
    this.members(game).filter((p) => p.id !== playerId).forEach((p) => this.server.to(`p:${p.id}`).emit('typing', { from: playerId }));
  }

  /** Gửi lịch sử chat khi vào phòng / kết nối lại */
  sendChatHistory(playerId: string) {
    const game = this.roomOf(playerId);
    this.server.to(`p:${playerId}`).emit('chat:history', game ? (this.chats.get(game.code) ?? []) : []);
  }

  /** Thả biểu cảm / ném đồ: không đổi trạng thái ván, chỉ phát cho cả phòng */
  emote(playerId: string, emoji: string, to?: string) {
    const game = this.roomOf(playerId);
    // Khán giả không có ghế để thả biểu cảm / ném đồ
    if (!game || game.spectator(playerId)) return;
    const now = Date.now();
    const b = this.emoteBucket.get(playerId) ?? { tokens: 8, at: now };
    b.tokens = Math.min(8, b.tokens + ((now - b.at) / 1000) * 6);
    b.at = now;
    if (b.tokens < 1) return;
    const isThrow = !!to;
    const allowed: readonly string[] = isThrow ? THROWABLES : EMOTES;
    if (!allowed.includes(emoji)) return;
    if (isThrow && (to === playerId || !game.players.some((p) => p.id === to))) return;
    b.tokens -= 1;
    this.emoteBucket.set(playerId, b);
    const e: Emote = { from: playerId, emoji, to };
    this.members(game).forEach((p) => this.server.to(`p:${p.id}`).emit('emote', e));
  }

  // ---------- tài khoản & xu ----------

  setVerified(playerId: string, ok: boolean) {
    if (ok) this.verified.add(playerId);
    else this.verified.delete(playerId);
  }

  /** Gửi số xu / thống kê mới nhất cho người chơi */
  pushAccount(playerId: string) {
    const acc = this.verified.has(playerId) ? this.accounts.get(playerId) : undefined;
    this.server.to(`p:${playerId}`).emit('account', acc ? this.accounts.info(acc) : null);
  }

  async claimDaily(playerId: string) {
    if (!this.verified.has(playerId)) throw new GameError('Đăng nhập bằng PIN để nhận xu nhé.');
    if (!await this.accounts.claimDaily(playerId)) throw new GameError('Hôm nay bạn nhận rồi, mai quay lại nhé 😉');
    this.pushAccount(playerId);
    const game = this.roomOf(playerId);
    if (game) this.broadcast(game);
  }

  setBet(playerId: string, amount: number) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    if (game.hostId !== playerId) throw new GameError('Chỉ chủ phòng mới chọn mức cược.');
    if (game.phase !== 'lobby') throw new GameError('Ván đang chơi, không đổi cược được.');
    if (!(BET_OPTIONS as readonly number[]).includes(amount)) throw new GameError('Mức cược không hợp lệ.');
    game.setBet(playerId, amount);
  }

  setRules(playerId: string, raw: unknown) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    game.setRules(playerId, raw);
  }

  setReady(playerId: string, ready: boolean, version: number) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    game.setReady(playerId, ready, version);
  }

  /** Chỉ chia bài sau khi toàn bộ khoản cược đã được lưu thành công. */
  async startGame(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    if (this.starting.has(game)) throw new GameError('Đang lưu xu để bắt đầu ván, đợi một chút nhé.');
    if (game.hostId !== playerId) throw new GameError('Chỉ chủ phòng mới bắt đầu được.');
    if (game.phase !== 'lobby') throw new GameError('Ván đã bắt đầu rồi.');
    this.starting.add(game);
    let attempted = false;
    let playerIds: string[] = [];
    let bet = game.bet;
    const round = randomUUID();
    const chargeOp = `charge:${round}`;
    try {
      const refund = this.refunds.get(game);
      if (refund) {
        await this.accounts.refundGame(refund.playerIds, refund.bet, refund.refundOp, refund.chargeOp);
        this.refunds.delete(game);
        game.pot = 0;
        refund.playerIds.forEach((id) => this.pushAccount(id));
        this.applyDeferredConnections(game);
      }
      bet = game.bet;
      const players = game.players.filter((p) => p.connected);
      game.validateStart(playerId);
      if (bet > 0) {
        const noAcc = players.filter((p) => !this.verified.has(p.id));
        if (noAcc.length) throw new GameError(`Ván có cược: ${noAcc.map((p) => p.name).join(', ')} chưa có tài khoản PIN.`);
        const poor = players.filter((p) => (this.accounts.get(p.id)?.coins ?? 0) < bet);
        if (poor.length) throw new GameError(`Không đủ ${bet} xu: ${poor.map((p) => p.name).join(', ')}.`);
      }
      playerIds = players.map((p) => p.id);
      if (bet > 0) {
        attempted = true;
        await this.accounts.chargeGame(playerIds, bet, chargeOp);
      } else {
        // Ván miễn phí: chỉ cộng số ván đã chơi; lưu lỗi không chặn việc bắt đầu
        void this.accounts.chargeGame(playerIds, 0, chargeOp).catch(() => this.logger.warn('Chưa lưu được số ván của ván miễn phí.'));
      }
      // A grace-period timer created before this request can still change the lobby.
      const currentIds = game.players.filter((p) => p.connected).map((p) => p.id);
      if (game.hostId !== playerId || game.phase !== 'lobby' || currentIds.length !== playerIds.length || currentIds.some((id, i) => id !== playerIds[i])) {
        throw new GameError('Phòng đã thay đổi, vui lòng bắt đầu lại.');
      }
      game.pot = bet * playerIds.length;
      game.paid = false;
      game.roundId = round;
      game.start(playerId);
      if (bet > 0) game.note(`💰 Mỗi người cược ${bet} xu – hũ ${game.pot} xu cho người thắng!`);
      game.players.forEach((p) => this.pushAccount(p.id));
      this.broadcast(game);
    } catch (error) {
      // Kể cả khi lần thu báo lỗi "không rõ kết quả": hoàn xu chỉ áp dụng nếu khoản thu thật sự đã được ghi
      if (attempted && game.phase === 'lobby') {
        const entry = { playerIds, bet, chargeOp, refundOp: `refund:${round}` };
        this.refunds.set(game, entry);
        try {
          await this.accounts.refundGame(entry.playerIds, entry.bet, entry.refundOp, entry.chargeOp);
          this.refunds.delete(game);
          game.pot = 0;
          playerIds.forEach((id) => this.pushAccount(id));
        } catch (refundError) {
          this.logger.error('Không hoàn lại được khoản cược chưa bắt đầu', refundError);
          throw new GameError('Chưa hoàn lại được xu. Chủ phòng hãy bấm bắt đầu lại để thử hoàn xu trước.');
        }
      }
      throw error;
    } finally {
      this.starting.delete(game);
      if (!this.refunds.has(game)) this.applyDeferredConnections(game);
    }
  }

  async restartGame(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    if (game.hostId !== playerId) throw new GameError('Chỉ chủ phòng mới làm được.');
    if (game.phase !== 'ended') throw new GameError('Ván chưa kết thúc.');
    await this.payout(game);
    game.restart(playerId);
  }

  /** Hết ván: giữ khoản thưởng chờ xử lý cho tới khi lưu thành công. */
  private payout(game: Game): Promise<void> {
    if (game.phase !== 'ended' || game.paid) return Promise.resolve();
    const pending = this.payouts.get(game);
    if (pending) return pending;
    const w = game.winner();
    const hasCustomPayouts = Object.keys(game.payouts).length > 0;
    if (!w && !hasCustomPayouts) {
      game.paid = true;
      return Promise.resolve();
    }
    const pot = game.pot;
    const opId = game.roundId ? `payout:${game.roundId}` : undefined;
    const settlement = (async () => {
      try {
        if (hasCustomPayouts) {
          await this.accounts.rewardPayouts(game.payouts, game.winners(), opId);
          game.paid = true;
          this.failedPayouts.delete(game);
          if (pot > 0) {
            const summary = Object.entries(game.payouts)
              .filter(([, amt]) => amt > 0)
              .map(([pid, amt]) => `${game.players.find((p) => p.id === pid)?.name ?? pid}: +${amt} xu`)
              .join(' · ');
            if (summary) game.note(`💰 Trả thưởng: ${summary}`);
          }
          game.players.forEach((p) => this.pushAccount(p.id));
          this.broadcast(game);
        } else if (w) {
          const rewarded = await this.accounts.rewardWinner(w, pot, opId);
          if (!rewarded && pot > 0) throw new Error('Không tìm thấy tài khoản người thắng.');
          game.paid = true;
          this.failedPayouts.delete(game);
          if (pot > 0) game.note(`💰 ${game.players.find((p) => p.id === w)?.name} ăn hũ ${pot} xu!`);
          this.pushAccount(w);
          this.broadcast(game);
        }
      } catch (error) {
        if (pot === 0 && !hasCustomPayouts) {
          // Ván miễn phí: chỉ là thống kê thắng, không giữ phòng vì lỗi lưu
          game.paid = true;
          this.logger.warn('Chưa lưu được thống kê thắng của ván miễn phí.');
          return;
        }
        this.failedPayouts.add(game);
        this.logger.error('Không lưu được phần thưởng của ván', error);
        this.schedulePayoutRetry(game);
        const message = 'Chưa lưu được xu thưởng, hệ thống sẽ tự thử lại. Chủ phòng cũng có thể bấm chơi lại để thử ngay.';
        game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('toast', message));
        throw new GameError(message);
      } finally {
        this.payouts.delete(game);
        this.cleanup(game);
      }
    })();
    this.payouts.set(game, settlement);
    return settlement;
  }

  private schedulePayoutRetry(game: Game) {
    if (this.payoutRetry.has(game)) return;
    this.payoutRetry.set(game, setTimeout(() => {
      this.payoutRetry.delete(game);
      if (game.paid || game.phase !== 'ended') return;
      this.failedPayouts.delete(game);
      void this.payout(game).catch(() => undefined);
    }, 20_000));
  }

  bind(server: Server) {
    this.server = server;
  }

  /** Người đang thực sự ở phòng này, gồm cả khán giả (không tính người đã rời / đã sang phòng khác) */
  private members(game: Game): { id: string }[] {
    return [...game.players.filter((p) => !p.left), ...game.spectators].filter((p) => this.playerRoom.get(p.id) === game.code);
  }

  roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  assertReady(game: Game) {
    if (this.starting.has(game)) throw new GameError('Đang lưu xu để bắt đầu ván, đợi một chút nhé.');
    if (this.refunds.has(game)) throw new GameError('Đang chờ hoàn xu. Chủ phòng hãy bấm bắt đầu lại để thử hoàn xu.');
  }

  setGameMode(playerId: string, mode: string) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    game.setGameMode(playerId, mode as 'exploding_kittens' | 'blackjack_21' | 'tien_len');
  }

  create(playerId: string, name: string, avatar?: string, rules?: unknown, gameMode?: string) {
    const mode = (gameMode === 'blackjack_21' || gameMode === 'tien_len' ? gameMode : 'exploding_kittens') as
      | 'exploding_kittens'
      | 'blackjack_21'
      | 'tien_len';
    let normalized: RoomRules;
    try { normalized = normalizeRoomRules(rules); }
    catch (error) { throw new GameError(error instanceof Error ? error.message : 'Luật phòng không hợp lệ.'); }
    if (mode === 'exploding_kittens') {
      const summary = roomDeckSummary(normalized, 2);
      if (!summary.canStart) throw new GameError(summary.errors.join(' '));
    }
    this.leave(playerId);
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Game(code, this.hooks, normalized, mode);
    this.rooms.set(code, room);
    this.playerRoom.set(playerId, code);
    room.addPlayer(playerId, name, avatar);
    this.sendChatHistory(playerId);
  }

  join(rawCode: string, playerId: string, name: string, avatar?: string) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const game = this.rooms.get(code);
    if (!game) throw new GameError(`Không tìm thấy phòng ${code}.`);
    const prev = this.roomOf(playerId);
    this.assertReady(game);
    if (prev && prev !== game) this.assertReady(prev);
    // Ghi phòng mới trước khi thêm người: trạng thái phòng chỉ gửi cho người đang ở phòng đó
    const prevCode = this.playerRoom.get(playerId);
    this.playerRoom.set(playerId, code);
    try {
      game.addPlayer(playerId, name, avatar);
    } catch (error) {
      if (prevCode) this.playerRoom.set(playerId, prevCode);
      else this.playerRoom.delete(playerId);
      throw error;
    }
    this.sendChatHistory(playerId);
    if (prev && prev !== game) {
      prev.removePlayer(playerId);
      this.cleanup(prev);
    }
  }

  /** Vào phòng để xem (khán giả). Người đang ngồi ở phòng chờ của chính phòng này thì chuyển sang xem. */
  watch(rawCode: string, playerId: string, name: string, avatar?: string) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const game = this.rooms.get(code);
    if (!game) throw new GameError(`Không tìm thấy phòng ${code}.`);
    const prev = this.roomOf(playerId);
    if (prev && !prev.spectator(playerId)) this.assertReady(prev);
    const prevCode = this.playerRoom.get(playerId);
    this.playerRoom.set(playerId, code);
    try {
      game.addSpectator(playerId, name, avatar);
    } catch (error) {
      if (prevCode) this.playerRoom.set(playerId, prevCode);
      else this.playerRoom.delete(playerId);
      throw error;
    }
    this.sendChatHistory(playerId);
    if (prev && prev !== game) {
      prev.removePlayer(playerId);
      this.cleanup(prev);
    }
  }

  leave(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    if (game.spectator(playerId)) {
      game.removeSpectator(playerId);
      this.playerRoom.delete(playerId);
      return;
    }
    this.assertReady(game);
    game.removePlayer(playerId);
    this.playerRoom.delete(playerId);
    this.cleanup(game);
  }

  kick(byId: string, targetId: string) {
    const game = this.roomOf(byId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.assertReady(game);
    game.kickPlayer(byId, targetId);
    this.server.to(`p:${targetId}`).emit('toast', 'Bạn đã bị chủ phòng mời ra khỏi trận.');
    this.cleanup(game);
  }

  connected(playerId: string, name: string, avatar?: string) {
    const game = this.roomOf(playerId);
    if (!game) return false;
    if (game.spectator(playerId)) game.setConnected(playerId, true);
    else if (this.starting.has(game) || this.refunds.has(game)) this.deferConnection(game, playerId, true);
    else {
      try {
        game.addPlayer(playerId, name, avatar);
      } catch {
        // vd: đã rời ván đang chơi → không còn thuộc phòng này
        this.playerRoom.delete(playerId);
        return false;
      }
    }
    this.sendChatHistory(playerId);
    return true;
  }

  async updateProfile(playerId: string, name: string, avatar?: string) {
    if (!this.profileLimit.hit(playerId)) throw new GameError('Đổi hồ sơ chậm thôi nào 😅');
    let profile: { name: string; avatar?: string } = { name, avatar };
    if (this.verified.has(playerId)) {
      const account = await this.accounts.updateProfile(playerId, name, avatar);
      if (account) profile = account;
      this.pushAccount(playerId);
    }
    this.roomOf(playerId)?.updateProfile(playerId, profile.name, profile.avatar);
    return profile;
  }

  disconnected(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    if (!game.spectator(playerId) && (this.starting.has(game) || this.refunds.has(game))) this.deferConnection(game, playerId, false);
    else game.setConnected(playerId, false);
  }

  private deferConnection(game: Game, playerId: string, connected: boolean) {
    let states = this.deferredConnections.get(game);
    if (!states) this.deferredConnections.set(game, states = new Map());
    states.set(playerId, connected);
  }

  private applyDeferredConnections(game: Game) {
    const states = this.deferredConnections.get(game);
    this.deferredConnections.delete(game);
    states?.forEach((connected, playerId) => game.setConnected(playerId, connected));
  }

  private broadcast(game: Game) {
    if (!this.failedPayouts.has(game)) void this.payout(game).catch(() => undefined);
    const coins = new Map(game.players.map((p) => [p.id, this.verified.has(p.id) ? this.accounts.get(p.id)?.coins : undefined]));
    // Chỉ gửi cho người đang ở phòng này: người đã rời giữa ván vẫn giữ ghế (để không lệch lượt)
    // nhưng không được nhận trạng thái phòng cũ, nếu không sẽ bị kéo ngược về phòng cũ.
    for (const p of this.members(game)) {
      const view = game.viewFor(p.id);
      view.players = view.players.map((x) => ({ ...x, coins: coins.get(x.id) }));
      this.server.to(`p:${p.id}`).emit('state', view);
    }
    this.cleanup(game);
  }

  private cleanup(game: Game) {
    const empty = game.players.every((p) => p.left) || game.players.length === 0;
    if (empty && !this.starting.has(game) && !this.refunds.has(game) && !this.payouts.has(game) && !this.failedPayouts.has(game) && this.rooms.get(game.code) === game) {
      game.dispose();
      // Bàn không còn ai chơi: mời khán giả ra
      for (const w of game.spectators) {
        if (this.playerRoom.get(w.id) !== game.code) continue;
        this.playerRoom.delete(w.id);
        this.server?.to(`p:${w.id}`).emit('state', null);
        this.server?.to(`p:${w.id}`).emit('toast', `Phòng ${game.code} đã đóng.`);
      }
      game.spectators = [];
      this.rooms.delete(game.code);
      this.chats.delete(game.code);
      this.deferredConnections.delete(game);
      this.failedPayouts.delete(game);
      clearTimeout(this.payoutRetry.get(game));
      this.payoutRetry.delete(game);
    }
  }
}
