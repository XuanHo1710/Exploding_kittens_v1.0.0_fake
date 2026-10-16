import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { Server } from 'socket.io';
import { BET_OPTIONS, CHAT_MAX_LEN, EMOTES, THROWABLES, type ChatMessage, type Emote } from '../../../shared/src';
import { AccountsService } from '../store/accounts.service';
import { Game, GameError, GameHooks } from './game';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Game>();
  /** playerId → mã phòng đang ở */
  private playerRoom = new Map<string, string>();
  private server: Server;
  /** Người chơi đã đăng nhập bằng PIN (socket có token đúng) → được dùng xu */
  private verified = new Set<string>();

  constructor(private readonly accounts: AccountsService) {}

  private hooks: GameHooks = {
    changed: (game) => this.broadcast(game),
    notify: (playerId, notice) => this.server.to(`p:${playerId}`).emit('notice', notice),
    fx: (game, fx) => game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('fx', fx)),
    removed: (playerId, code) => {
      if (this.playerRoom.get(playerId) !== code) return;
      this.playerRoom.delete(playerId);
      this.server.to(`p:${playerId}`).emit('state', null);
    },
  };

  /** Biểu cảm cho bấm dồn dập: tối đa 8 cái liền, hồi 6 cái/giây (chống spam vô hạn) */
  private emoteBucket = new Map<string, { tokens: number; at: number }>();
  /** Chat theo phòng: giữ 100 tin gần nhất */
  private chats = new Map<string, ChatMessage[]>();
  private chatSeq = 0;
  private lastChat = new Map<string, number>();

  chat(playerId: string, raw: string) {
    const game = this.roomOf(playerId);
    const me = game?.players.find((p) => p.id === playerId);
    if (!game || !me) return;
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return;
    const now = Date.now();
    if (now - (this.lastChat.get(playerId) ?? 0) < 400) throw new GameError('Gõ chậm thôi nào 😅');
    this.lastChat.set(playerId, now);
    const msg: ChatMessage = { id: ++this.chatSeq, from: playerId, name: me.name, avatar: me.avatar, text, at: now };
    const list = [...(this.chats.get(game.code) ?? []), msg].slice(-100);
    this.chats.set(game.code, list);
    game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('chat', msg));
  }

  typing(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    game.players.filter((p) => p.id !== playerId).forEach((p) => this.server.to(`p:${p.id}`).emit('typing', { from: playerId }));
  }

  /** Gửi lịch sử chat khi vào phòng / kết nối lại */
  sendChatHistory(playerId: string) {
    const game = this.roomOf(playerId);
    this.server.to(`p:${playerId}`).emit('chat:history', game ? (this.chats.get(game.code) ?? []) : []);
  }

  /** Thả biểu cảm / ném đồ: không đổi trạng thái ván, chỉ phát cho cả phòng */
  emote(playerId: string, emoji: string, to?: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
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
    game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('emote', e));
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

  claimDaily(playerId: string) {
    if (!this.verified.has(playerId)) throw new GameError('Đăng nhập bằng PIN để nhận xu nhé.');
    if (!this.accounts.claimDaily(playerId)) throw new GameError('Hôm nay bạn nhận rồi, mai quay lại nhé 😉');
    this.pushAccount(playerId);
    const game = this.roomOf(playerId);
    if (game) this.broadcast(game);
  }

  setBet(playerId: string, amount: number) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    if (game.hostId !== playerId) throw new GameError('Chỉ chủ phòng mới chọn mức cược.');
    if (game.phase !== 'lobby') throw new GameError('Ván đang chơi, không đổi cược được.');
    if (!(BET_OPTIONS as readonly number[]).includes(amount)) throw new GameError('Mức cược không hợp lệ.');
    game.bet = amount;
    this.broadcast(game);
  }

  /** Bắt đầu ván: có cược thì kiểm tra đủ xu → bắt đầu → trừ xu mọi người vào hũ */
  startGame(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    const bet = game.bet;
    if (bet > 0 && game.hostId === playerId && game.phase === 'lobby') {
      const players = game.players.filter((p) => p.connected);
      const noAcc = players.filter((p) => !this.verified.has(p.id));
      if (noAcc.length) throw new GameError(`Ván có cược: ${noAcc.map((p) => p.name).join(', ')} chưa có tài khoản PIN.`);
      const poor = players.filter((p) => (this.accounts.get(p.id)?.coins ?? 0) < bet);
      if (poor.length) throw new GameError(`Không đủ ${bet} xu: ${poor.map((p) => p.name).join(', ')}.`);
    }
    game.start(playerId);
    if (bet > 0) {
      for (const p of game.players) this.accounts.addCoins(p.id, -bet, 'game');
      game.pot = bet * game.players.length;
      game.paid = false;
      game.note(`💰 Mỗi người cược ${bet} xu – hũ ${game.pot} xu cho người thắng!`);
    } else {
      for (const p of game.players) this.accounts.addCoins(p.id, 0, 'game');
    }
    game.players.forEach((p) => this.pushAccount(p.id));
    this.broadcast(game);
  }

  /** Hết ván: trả hũ cho người thắng (1 lần) */
  private payout(game: Game) {
    if (game.phase !== 'ended' || game.paid) return;
    game.paid = true;
    const w = game.winner();
    if (!w) return;
    this.accounts.addCoins(w, game.pot, 'win');
    if (game.pot > 0) game.note(`💰 ${game.players.find((p) => p.id === w)?.name} ăn hũ ${game.pot} xu!`);
    this.pushAccount(w);
  }

  bind(server: Server) {
    this.server = server;
  }

  roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  create(playerId: string, name: string, avatar?: string) {
    this.leave(playerId);
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const game = new Game(code, this.hooks);
    this.rooms.set(code, game);
    this.playerRoom.set(playerId, code);
    game.addPlayer(playerId, name, avatar);
    this.sendChatHistory(playerId);
  }

  join(rawCode: string, playerId: string, name: string, avatar?: string) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const game = this.rooms.get(code);
    if (!game) throw new GameError(`Không tìm thấy phòng ${code}.`);
    const prev = this.roomOf(playerId);
    game.addPlayer(playerId, name, avatar);
    this.playerRoom.set(playerId, code);
    this.sendChatHistory(playerId);
    if (prev && prev !== game) {
      prev.removePlayer(playerId);
      this.cleanup(prev);
    }
  }

  leave(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    game.removePlayer(playerId);
    this.playerRoom.delete(playerId);
    this.cleanup(game);
  }

  connected(playerId: string, name: string, avatar?: string) {
    const game = this.roomOf(playerId);
    if (!game) return false;
    game.addPlayer(playerId, name, avatar);
    this.sendChatHistory(playerId);
    return true;
  }

  updateProfile(playerId: string, name: string, avatar?: string) {
    if (this.verified.has(playerId)) {
      this.accounts.updateProfile(playerId, name, avatar);
      this.pushAccount(playerId);
    }
    this.roomOf(playerId)?.updateProfile(playerId, name, avatar);
  }

  disconnected(playerId: string) {
    this.roomOf(playerId)?.setConnected(playerId, false);
  }

  private broadcast(game: Game) {
    this.payout(game);
    const coins = new Map(game.players.map((p) => [p.id, this.verified.has(p.id) ? this.accounts.get(p.id)?.coins : undefined]));
    for (const p of game.players) {
      const view = game.viewFor(p.id);
      view.players = view.players.map((x) => ({ ...x, coins: coins.get(x.id) }));
      this.server.to(`p:${p.id}`).emit('state', view);
    }
    this.cleanup(game);
  }

  private cleanup(game: Game) {
    const empty = game.players.every((p) => p.left) || game.players.length === 0;
    if (empty && this.rooms.get(game.code) === game) {
      game.dispose();
      this.rooms.delete(game.code);
      this.chats.delete(game.code);
    }
  }
}
