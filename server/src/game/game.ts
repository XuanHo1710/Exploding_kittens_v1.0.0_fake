import { randomInt } from 'crypto';
import {
  ActionKind,
  BlackjackPlayerView,
  BlackjackRoomView,
  CARD_INFO,
  Card,
  CardType,
  BET_OPTIONS,
  GAME_MODES,
  GameMode,
  PlayingCard,
  TienLenCombo,
  TienLenRoomView,
  canBeatTienLenCombo,
  checkTienLenInstantWin,
  compareBlackjackHands,
  createStandard52Deck,
  detectPlayKind,
  detectTienLenCombo,
  evaluateBlackjackHand,
  normalizeRoomRules,
  roomDeckSummary,
  RoomRules,
  MIN_PLAYERS,
  LastPlay,
  Phase,
  PlayRequest,
  GameFx,
  PrivateNotice,
  RoomView,
  SHUFFLE_STYLES,
  ShuffleStyle,
  sortTienLenHand,
} from '../../../shared/src';

export class GameError extends Error {}

const LOBBY_GRACE_MS = 15_000;
const LOG_SIZE = 40;

interface Player {
  id: string;
  name: string;
  connected: boolean;
  alive: boolean;
  hand: Card[];
  left?: boolean;
  avatar?: string;
  readyVersion?: number;
}

interface Pending {
  kind: ActionKind;
  actorId: string;
  targetId?: string;
  namedType?: CardType;
  discardType?: CardType;
  discardCardId?: string;
  shuffleStyle?: ShuffleStyle;
  cards: CardType[];
  nopeCount: number;
  deadline: number;
}

type Waiting =
  | { kind: 'defuse_place'; playerId: string; card: Card; deadline: number }
  | { kind: 'favor_give'; playerId: string; toId: string; deadline: number }
  | { kind: 'alter_future'; playerId: string; cards: Card[]; deadline: number };

export interface GameHooks {
  changed(game: Game): void;
  notify(playerId: string, notice: PrivateNotice): void;
  fx(game: Game, fx: GameFx): void;
  removed(playerId: string, code: string): void;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Game {
  gameMode: GameMode = 'exploding_kittens';
  phase: Phase = 'lobby';
  hostId = '';
  players: Player[] = [];
  private deck: Card[] = []; // deck[0] là lá trên cùng
  private discard: Card[] = [];
  private currentIdx = 0;
  private direction: 1 | -1 = 1;
  private turnsRemaining = 0;
  private attackDebt = false;
  private turnDeadline?: number;
  private pending?: Pending;
  private lastPlay?: LastPlay;
  private playSeq = 0;
  private waiting?: Waiting;
  private winnerId?: string;
  private winnerIds: string[] = [];
  payouts: Record<string, number> = {};
  private log: string[] = [];
  private logTotal = 0;
  /** Cược xu: do RoomsService quản lý (trừ xu lúc bắt đầu, trả hũ cho người thắng) */
  bet = 0;
  pot = 0;
  paid = false;
  private seq = 0;
  private timer?: NodeJS.Timeout;
  private roomRules: RoomRules;
  rulesVersion = 1;

  // --- Trạng thái Rút Bài 21 (Xì Dách) ---
  private bjDeck: PlayingCard[] = [];
  private bjHands = new Map<string, PlayingCard[]>();
  private bjStatus = new Map<string, 'playing' | 'stood' | 'busted' | 'revealed'>();
  private bjOutcomes = new Map<string, { outcome: 'win' | 'lose' | 'push'; text: string; delta: number }>();
  private bjDealerId = '';

  // --- Trạng thái Tiến Lên Miền Nam ---
  private tlHands = new Map<string, PlayingCard[]>();
  private tlTableCombo?: TienLenCombo;
  private tlLastActorId?: string;
  private tlPassedIds = new Set<string>();
  private tlFirstTurnOfMatch = false;
  private tlLowestCardCode?: string;
  private tlChopLog?: string;
  private tlInstantWinText?: string;
  private tlFinishOrder: string[] = [];
  private tlLastWinnerId?: string;

  constructor(
    readonly code: string,
    private hooks: GameHooks,
    rules?: unknown,
    gameMode: GameMode = 'exploding_kittens',
  ) {
    this.roomRules = this.parseRules(rules);
    if (GAME_MODES[gameMode]) {
      this.gameMode = gameMode;
      this.roomRules.maxPlayers = Math.min(this.roomRules.maxPlayers, GAME_MODES[gameMode].maxPlayers);
    }
  }

  /** Return a copy so consumers cannot change the rules during a game. */
  get rules(): RoomRules {
    return { ...this.roomRules, cardCounts: { ...this.roomRules.cardCounts } };
  }

  setGameMode(byId: string, mode: GameMode) {
    this.requireLobbyHost(byId);
    if (!GAME_MODES[mode]) throw new GameError('Chế độ chơi không hợp lệ.');
    if (this.players.length > GAME_MODES[mode].maxPlayers) {
      throw new GameError(`Chế độ ${GAME_MODES[mode].name} tối đa ${GAME_MODES[mode].maxPlayers} người (hiện có ${this.players.length} người).`);
    }
    if (this.gameMode === mode) return;
    this.run(() => {
      this.gameMode = mode;
      this.roomRules.maxPlayers = Math.min(Math.max(2, this.players.length, mode === 'tien_len' ? 4 : mode === 'blackjack_21' ? 6 : this.roomRules.maxPlayers), GAME_MODES[mode].maxPlayers);
      this.invalidateReady();
      this.addLog(`🎮 Chủ phòng đổi sang chế độ: ${GAME_MODES[mode].emoji} ${GAME_MODES[mode].name}.`);
    });
  }

  setRules(byId: string, raw: unknown) {
    this.requireLobbyHost(byId);
    const next = this.parseRules(raw);
    next.maxPlayers = Math.min(next.maxPlayers, GAME_MODES[this.gameMode].maxPlayers);
    if (next.maxPlayers < this.players.length) throw new GameError('Số chỗ không được ít hơn số người đang ở trong phòng.');
    if (JSON.stringify(next) === JSON.stringify(this.roomRules)) return;
    this.run(() => {
      this.roomRules = next;
      this.invalidateReady();
      this.addLog('Chủ phòng cập nhật luật. Mọi người cần xác nhận lại trước khi bắt đầu.');
    });
  }

  setBet(byId: string, amount: number) {
    this.requireLobbyHost(byId);
    if (!(BET_OPTIONS as readonly number[]).includes(amount)) throw new GameError('Mức cược không hợp lệ.');
    if (this.bet === amount) return;
    this.run(() => {
      this.bet = amount;
      this.invalidateReady();
      this.addLog(`Chủ phòng đổi mức cược thành ${amount} xu. Mọi người cần xác nhận lại.`);
    });
  }

  setReady(playerId: string, ready: boolean, version: number) {
    if (this.phase !== 'lobby') throw new GameError('Chỉ xác nhận luật trong phòng chờ.');
    const p = this.player(playerId);
    if (!p?.connected) throw new GameError('Bạn chưa ở trong phòng.');
    if (typeof ready !== 'boolean' || !Number.isInteger(version) || version !== this.rulesVersion) {
      throw new GameError('Luật phòng đã thay đổi. Hãy xem lại và xác nhận phiên bản mới nhất.');
    }
    this.run(() => { p.readyVersion = ready ? version : undefined; });
  }

  /** Validate before charging coins, and again immediately before dealing. */
  validateStart(byId: string) {
    this.requireLobbyHost(byId);
    if (!this.player(byId)?.connected) throw new GameError('Chủ phòng cần kết nối lại trước khi bắt đầu.');
    const players = this.players.filter((p) => p.connected);
    const modeCfg = GAME_MODES[this.gameMode];
    if (players.length < modeCfg.minPlayers) throw new GameError(`Cần ít nhất ${modeCfg.minPlayers} người.`);
    if (players.length > modeCfg.maxPlayers) throw new GameError(`Chế độ ${modeCfg.shortName} tối đa ${modeCfg.maxPlayers} người.`);
    if (this.gameMode === 'exploding_kittens') {
      const summary = roomDeckSummary(this.roomRules, players.length);
      if (!summary.canStart) throw new GameError(summary.errors.join(' '));
    }
    const unready = players.filter((p) => p.id !== this.hostId && p.readyVersion !== this.rulesVersion);
    if (unready.length) throw new GameError(`Chờ xác nhận luật và mức cược: ${unready.map((p) => p.name).join(', ')}.`);
  }

  // ---------- người chơi ----------

  addPlayer(id: string, name: string, avatar?: string) {
    this.run(() => {
      const existing = this.player(id);
      if (existing) {
        existing.name = name;
        existing.avatar = avatar;
        existing.connected = true;
        return;
      }
      if (this.phase !== 'lobby') throw new GameError('Phòng đang chơi, đợi ván sau nhé.');
      const maxP = Math.min(this.roomRules.maxPlayers, GAME_MODES[this.gameMode].maxPlayers);
      if (this.players.length >= maxP) throw new GameError(`Phòng đã đủ ${maxP} người.`);
      this.players.push({ id, name, avatar, connected: true, alive: true, hand: [] });
      if (!this.hostId) this.hostId = id;
      this.addLog(`${name} vào phòng.`);
    });
  }

  setConnected(id: string, connected: boolean) {
    const p = this.player(id);
    if (!p) return;
    this.run(() => {
      p.connected = connected;
      if (!connected && this.phase === 'lobby') {
        setTimeout(() => {
          if (!p.connected && this.phase === 'lobby' && this.player(id)) this.removePlayer(id);
        }, LOBBY_GRACE_MS);
      }
      // Chủ phòng rớt mạng / tải lại trang: đợi một lúc rồi mới chuyển quyền chủ phòng
      if (!connected && this.hostId === id) {
        setTimeout(() => {
          if (!p.connected && this.hostId === id) this.run(() => this.pickHost());
        }, LOBBY_GRACE_MS);
      }
    });
  }

  /** Đổi tên / avatar giữa chừng (không cần kết nối lại) */
  updateProfile(id: string, name: string, avatar?: string) {
    const p = this.player(id);
    if (!p) return;
    this.run(() => {
      p.name = name;
      p.avatar = avatar;
    });
  }

  removePlayer(id: string) {
    const p = this.player(id);
    if (!p) return;
    this.run(() => {
      if (this.phase === 'lobby') {
        this.players = this.players.filter((x) => x.id !== id);
        this.addLog(`${p.name} rời phòng.`);
      } else {
        // Giữa ván: giữ chỗ ngồi để không lệch thứ tự lượt, chỉ đánh dấu đã rời
        p.left = true;
        p.connected = false;
        if (this.phase === 'playing' && p.alive) {
          this.finishWaitingFor(id);
          if (this.pending?.targetId === id) this.pending = undefined;
          this.addLog(`${p.name} bỏ cuộc.`);
          this.eliminate(p);
        }
      }
      if (this.hostId === id) this.pickHost();
    });
    this.hooks.removed(id, this.code);
  }

  kickPlayer(byId: string, targetId: string) {
    if (byId !== this.hostId) throw new GameError('Chỉ chủ phòng mới được kích người chơi.');
    if (!targetId || targetId === byId) throw new GameError('Không thể tự kích chính mình.');
    const p = this.player(targetId);
    if (!p || p.left) throw new GameError('Người chơi không còn trong phòng.');
    this.run(() => {
      if (this.phase === 'lobby') {
        this.players = this.players.filter((x) => x.id !== targetId);
        this.addLog(`👢 Chủ phòng đã mời ${p.name} ra khỏi phòng chờ.`);
      } else {
        p.left = true;
        p.connected = false;
        if (this.phase === 'playing' && p.alive) {
          this.finishWaitingFor(targetId);
          if (this.pending?.targetId === targetId) this.pending = undefined;
          this.addLog(`👢 Chủ phòng đã kích ${p.name} khỏi trận!`);
          this.eliminate(p);
        } else {
          this.addLog(`👢 Chủ phòng đã mời ${p.name} khỏi bàn.`);
        }
      }
    });
    this.hooks.removed(targetId, this.code);
  }

  // ---------- bắt đầu / chơi lại ----------

  start(byId: string) {
    this.run(() => {
      this.validateStart(byId);
      const gone = this.players.filter((p) => !p.connected);
      this.players = this.players.filter((p) => p.connected);
      gone.forEach((p) => this.hooks.removed(p.id, this.code));
      const modeCfg = GAME_MODES[this.gameMode];
      if (this.players.length < modeCfg.minPlayers) throw new GameError(`Cần ít nhất ${modeCfg.minPlayers} người.`);

      this.direction = 1;
      this.pending = undefined;
      this.waiting = undefined;
      this.lastPlay = undefined;
      this.winnerId = undefined;
      this.winnerIds = [];
      this.payouts = {};
      this.log = [];

      if (this.gameMode === 'blackjack_21') {
        this.startBlackjack();
        return;
      }
      if (this.gameMode === 'tien_len') {
        this.startTienLen();
        return;
      }

      const n = this.players.length;
      const pool: Card[] = [];
      for (const [type, count] of Object.entries(this.roomRules.cardCounts) as [CardType, number][]) {
        for (let i = 0; i < count; i++) pool.push(this.newCard(type));
      }
      shuffle(pool);

      for (const p of this.players) {
        p.alive = true;
        p.hand = [
          ...Array.from({ length: this.roomRules.defusesPerPlayer }, () => this.newCard('defuse')),
          ...pool.splice(0, this.roomRules.handSize),
        ];
      }
      // Chỉ thêm Gỡ Bom dự phòng và Mèo Nổ sau khi đã chia tay bài an toàn.
      for (let i = 0; i < this.roomRules.extraDefuses; i++) pool.push(this.newCard('defuse'));
      const bombs = roomDeckSummary(this.roomRules, n).bombs;
      for (let i = 0; i < bombs; i++) pool.push(this.newCard('exploding'));
      this.deck = shuffle(pool);
      this.discard = [];
      this.phase = 'playing';
      this.addLog(`Bắt đầu! ${n} người, mỗi người ${this.roomRules.handSize} lá thường và ${this.roomRules.defusesPerPlayer} Gỡ Bom, ${bombs} Mèo Nổ trong chồng bài.`);
      this.startTurn(this.roomRules.firstPlayer === 'host' ? this.players.findIndex((p) => p.id === this.hostId) : randomInt(n), 1);
    });
  }

  restart(byId: string) {
    this.run(() => {
      if (byId !== this.hostId) throw new GameError('Chỉ chủ phòng mới làm được.');
      if (this.phase !== 'ended') throw new GameError('Ván chưa kết thúc.');
      this.phase = 'lobby';
      this.deck = [];
      this.discard = [];
      this.bjDeck = [];
      this.bjHands.clear();
      this.bjStatus.clear();
      this.bjOutcomes.clear();
      this.tlHands.clear();
      this.tlTableCombo = undefined;
      this.tlLastActorId = undefined;
      this.tlPassedIds.clear();
      this.tlChopLog = undefined;
      this.tlInstantWinText = undefined;
      this.tlFinishOrder = [];
      this.winnerId = undefined;
      this.winnerIds = [];
      this.payouts = {};
      this.direction = 1;
      this.turnDeadline = undefined;
      this.players = this.players.filter((p) => !p.left);
      this.pot = 0;
      this.paid = false;
      for (const p of this.players) {
        p.hand = [];
        p.alive = true;
        p.readyVersion = undefined;
      }
      this.addLog('Quay lại phòng chờ.');
    });
  }

  // ---------- RÚT BÀI 21 (XÌ DÁCH) ----------

  private startBlackjack() {
    this.bjDeck = shuffle(createStandard52Deck());
    this.bjHands.clear();
    this.bjStatus.clear();
    this.bjOutcomes.clear();
    // Chủ phòng làm Nhà Cái (hoặc người đầu tiên nếu chủ phòng vắng)
    this.bjDealerId = this.players.some((p) => p.id === this.hostId) ? this.hostId : this.players[0].id;
    const dealer = this.player(this.bjDealerId)!;

    for (const p of this.players) {
      p.alive = true;
      p.hand = [];
      const c1 = this.bjDeck.shift()!;
      const c2 = this.bjDeck.shift()!;
      this.bjHands.set(p.id, [c1, c2]);
      const ev = evaluateBlackjackHand([c1, c2], p.id === this.bjDealerId);
      if (ev.kind === 'xi_bang' || ev.kind === 'xi_dach') {
        this.bjStatus.set(p.id, 'stood');
      } else {
        this.bjStatus.set(p.id, 'playing');
      }
    }

    this.phase = 'playing';
    this.addLog(`🃏 Bắt đầu Rút Bài 21 (Xì Dách)! ${dealer.name} làm Nhà Cái. Đã chia mỗi người 2 lá Bài Tây.`);

    // Nếu Nhà Cái có Xì Bàng hoặc Xì Dách ngay khi chia -> Mở bài so điểm toàn bàn ngay!
    const dealerEval = evaluateBlackjackHand(this.bjHands.get(this.bjDealerId) ?? [], true);
    if (dealerEval.kind === 'xi_bang' || dealerEval.kind === 'xi_dach') {
      this.addLog(`🔥 Nhà Cái ${dealer.name} có ${dealerEval.labelVi} ngay từ đầu!`);
      this.finishBlackjack();
      return;
    }

    // Thông báo nếu có Nhà Con đạt Xì Bàng / Xì Dách
    for (const p of this.players) {
      if (p.id === this.bjDealerId) continue;
      const ev = evaluateBlackjackHand(this.bjHands.get(p.id) ?? [], false);
      if (ev.kind === 'xi_bang' || ev.kind === 'xi_dach') {
        this.addLog(`⚡ ${p.name} đạt ${ev.labelVi} ngay khi chia bài!`);
      }
    }

    this.advanceBlackjackTurn();
  }

  private advanceBlackjackTurn() {
    // Ưu tiên lượt của tất cả Nhà Con đang 'playing' trước, cuối cùng mới tới lượt Nhà Cái
    const nonDealersPlaying = this.players.filter(
      (p) => p.alive && !p.left && p.id !== this.bjDealerId && this.bjStatus.get(p.id) === 'playing',
    );
    if (nonDealersPlaying.length > 0) {
      const next = nonDealersPlaying[0];
      const idx = this.players.findIndex((p) => p.id === next.id);
      this.startTurn(idx, 1);
      return;
    }
    const dealer = this.player(this.bjDealerId);
    if (dealer && dealer.alive && !dealer.left && this.bjStatus.get(dealer.id) === 'playing') {
      const idx = this.players.findIndex((p) => p.id === dealer.id);
      this.startTurn(idx, 1);
      this.addLog(`👑 Tới lượt Nhà Cái ${dealer.name} rút hoặc xét bài!`);
      return;
    }
    this.finishBlackjack();
  }

  blackjackHit(playerId: string) {
    this.run(() => {
      if (this.gameMode !== 'blackjack_21' || this.phase !== 'playing') throw new GameError('Không phải ván Xì Dách 21.');
      const p = this.requireAlive(playerId);
      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      const cards = this.bjHands.get(playerId) ?? [];
      const isDealer = playerId === this.bjDealerId;
      const ev = evaluateBlackjackHand(cards, isDealer);
      if (!ev.canHit) throw new GameError('Bạn không thể rút thêm bài nữa.');
      const drawn = this.bjDeck.shift();
      if (!drawn) {
        this.bjStatus.set(playerId, 'stood');
        this.advanceBlackjackTurn();
        return;
      }
      cards.push(drawn);
      this.bjHands.set(playerId, cards);
      this.hooks.fx(this, { type: 'draw', playerId });
      const nextEv = evaluateBlackjackHand(cards, isDealer);
      this.addLog(`🃏 ${p.name} rút thêm 1 lá (đang có ${cards.length} lá).`);

      if (nextEv.kind === 'bust') {
        this.bjStatus.set(playerId, 'busted');
        this.addLog(`💥 ${p.name} đã dừng lượt (${cards.length} lá).`);
        this.advanceBlackjackTurn();
      } else if (nextEv.kind === 'ngu_linh' || nextEv.points === 21 || cards.length >= 5) {
        this.bjStatus.set(playerId, 'stood');
        if (nextEv.kind === 'ngu_linh') this.addLog(`🌟 ${p.name} đủ 5 lá! Chốt bài.`);
        else this.addLog(`✅ ${p.name} chốt bài (${cards.length} lá).`);
        this.advanceBlackjackTurn();
      } else {
        this.turnDeadline = Date.now() + this.roomRules.turnSeconds * 1000;
      }
    });
  }

  blackjackStand(playerId: string) {
    this.run(() => {
      if (this.gameMode !== 'blackjack_21' || this.phase !== 'playing') throw new GameError('Không phải ván Xì Dách 21.');
      const p = this.requireAlive(playerId);
      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      const cards = this.bjHands.get(playerId) ?? [];
      const isDealer = playerId === this.bjDealerId;
      const ev = evaluateBlackjackHand(cards, isDealer);
      if (!ev.canStand) {
        throw new GameError(`Bạn mới có ${ev.points} điểm, cần ít nhất ${isDealer ? 15 : 16} điểm mới được dừng!`);
      }
      this.bjStatus.set(playerId, 'stood');
      this.addLog(`✋ ${p.name} dừng rút (${cards.length} lá).`);
      this.advanceBlackjackTurn();
    });
  }

  blackjackRevealOne(playerId: string, targetId: string) {
    this.run(() => {
      if (this.gameMode !== 'blackjack_21' || this.phase !== 'playing') throw new GameError('Không phải ván Xì Dách 21.');
      if (playerId !== this.bjDealerId || this.current()?.id !== playerId) {
        throw new GameError('Chỉ Nhà Cái trong lượt của mình mới được xét bài từng người.');
      }
      const dCards = this.bjHands.get(playerId) ?? [];
      const dEval = evaluateBlackjackHand(dCards, true);
      if (!dEval.canStand) {
        throw new GameError(`Nhà Cái cần đủ ít nhất 15 điểm mới được xét bài (hiện có ${dEval.points} điểm).`);
      }
      const target = this.player(targetId);
      if (!target || target.id === this.bjDealerId || !target.alive) throw new GameError('Người chơi không hợp lệ.');
      if (this.bjStatus.get(target.id) === 'revealed') throw new GameError('Đã xét bài người này rồi.');
      const pCards = this.bjHands.get(target.id) ?? [];
      const pEval = evaluateBlackjackHand(pCards, false);
      const cmp = compareBlackjackHands(dEval, pEval);
      this.bjStatus.set(target.id, 'revealed');
      const outcome = cmp.outcome === 'player' ? 'win' : cmp.outcome === 'dealer' ? 'lose' : 'push';
      this.bjOutcomes.set(target.id, { outcome, text: cmp.reason, delta: 0 });
      this.addLog(`🔍 Nhà Cái xét bài ${target.name} (${pEval.labelVi}): ${cmp.reason}!`);
      this.turnDeadline = Date.now() + this.roomRules.turnSeconds * 1000;

      // Nếu đã xét hết tất cả nhà con -> kết thúc ván luôn
      const remaining = this.players.filter((x) => x.id !== this.bjDealerId && x.alive && !x.left && this.bjStatus.get(x.id) !== 'revealed');
      if (remaining.length === 0) {
        this.finishBlackjack();
      }
    });
  }

  private finishBlackjack() {
    this.phase = 'ended';
    this.turnDeadline = undefined;
    const dCards = this.bjHands.get(this.bjDealerId) ?? [];
    const dEval = evaluateBlackjackHand(dCards, true);

    const activePlayers = this.players.filter((p) => !p.left);
    const nonDealers = activePlayers.filter((p) => p.id !== this.bjDealerId);

    const weights = new Map<string, number>();
    let dealerWinsCount = 0;
    let dealerLossesCount = 0;

    for (const p of nonDealers) {
      const pCards = this.bjHands.get(p.id) ?? [];
      const pEval = evaluateBlackjackHand(pCards, false);
      const existing = this.bjOutcomes.get(p.id);
      const cmp = existing
        ? { outcome: existing.outcome === 'win' ? 'player' : existing.outcome === 'lose' ? 'dealer' : 'push', reason: existing.text }
        : compareBlackjackHands(dEval, pEval);

      this.bjStatus.set(p.id, 'revealed');
      if (cmp.outcome === 'player') {
        const w = pEval.kind === 'xi_bang' ? 3 : pEval.kind === 'xi_dach' || pEval.kind === 'ngu_linh' ? 2 : 1;
        weights.set(p.id, w);
        dealerLossesCount++;
        this.bjOutcomes.set(p.id, { outcome: 'win', text: `Thắng Nhà Cái (${cmp.reason})`, delta: 0 });
      } else if (cmp.outcome === 'dealer') {
        dealerWinsCount++;
        this.bjOutcomes.set(p.id, { outcome: 'lose', text: `Thua Nhà Cái (${cmp.reason})`, delta: 0 });
      } else {
        this.bjOutcomes.set(p.id, { outcome: 'push', text: `Hoà Nhà Cái (${cmp.reason})`, delta: 0 });
      }
    }
    this.bjStatus.set(this.bjDealerId, 'revealed');

    // Phân bổ hũ xu (pot) bảo toàn 100% tổng số xu đã cược
    this.payouts = {};
    if (this.pot > 0 && this.bet > 0) {
      let pool = this.pot;
      // Hoàn lại tiền gốc cho những nhà con Hoà hoặc Thắng trước
      for (const p of nonDealers) {
        const out = this.bjOutcomes.get(p.id)?.outcome;
        if (out === 'push' || out === 'win') {
          const refund = Math.min(pool, this.bet);
          this.payouts[p.id] = (this.payouts[p.id] ?? 0) + refund;
          pool -= refund;
        }
      }
      // Phần pool còn lại gồm tiền cược của Nhà Cái + tiền của các Nhà Con bị thua
      const totalWinWeight = [...weights.values()].reduce((a, b) => a + b, 0);
      if (totalWinWeight > 0 && pool > 0) {
        // Nếu có cả Nhà Con thắng và Nhà Con thua: Nhà Cái giữ phần thắng từ Nhà Con thua nếu còn dư
        const dealerKeep = Math.min(pool, dealerWinsCount * this.bet);
        const forWinners = pool - dealerKeep;
        let distributed = 0;
        const winEntries = [...weights.entries()];
        winEntries.forEach(([pid, w], idx) => {
          const share = idx === winEntries.length - 1 ? forWinners - distributed : Math.floor((forWinners * w) / totalWinWeight);
          distributed += share;
          this.payouts[pid] = (this.payouts[pid] ?? 0) + share;
        });
        if (dealerKeep > 0) {
          this.payouts[this.bjDealerId] = (this.payouts[this.bjDealerId] ?? 0) + dealerKeep;
        }
      } else if (pool > 0) {
        // Không Nhà Con nào thắng -> Nhà Cái ăn toàn bộ phần còn lại
        this.payouts[this.bjDealerId] = (this.payouts[this.bjDealerId] ?? 0) + pool;
      }
    }

    // Cập nhật delta xu và xác định người thắng cuộc
    let bestGain = -Infinity;
    this.winnerIds = [];
    for (const p of activePlayers) {
      const got = this.payouts[p.id] ?? 0;
      const delta = this.bet > 0 ? got - this.bet : 0;
      if (p.id === this.bjDealerId) {
        const dOutcome: 'win' | 'lose' | 'push' =
          dealerWinsCount > dealerLossesCount ? 'win' : dealerLossesCount > dealerWinsCount ? 'lose' : 'push';
        this.bjOutcomes.set(p.id, {
          outcome: dOutcome,
          text: `Nhà Cái: Thắng ${dealerWinsCount} · Thua ${dealerLossesCount}`,
          delta,
        });
      } else {
        const cur = this.bjOutcomes.get(p.id)!;
        this.bjOutcomes.set(p.id, { ...cur, delta });
      }
      const isWinner = this.bjOutcomes.get(p.id)?.outcome === 'win';
      if (isWinner) this.winnerIds.push(p.id);
      if (delta > bestGain && isWinner) {
        bestGain = delta;
        this.winnerId = p.id;
      }
    }
    if (!this.winnerId) {
      this.winnerId = this.winnerIds[0] ?? this.bjDealerId;
    }

    const winnerNames = this.winnerIds.map((id) => this.player(id)?.name).filter(Boolean);
    this.addLog(
      winnerNames.length
        ? `🏆 Kết thúc ván 21! Người thắng: ${winnerNames.join(', ')}.`
        : '🤝 Kết thúc ván 21: Cả bàn hoà nhau!',
    );
  }

  // ---------- TIẾN LÊN MIỀN NAM (4 NGƯỜI) ----------

  private startTienLen() {
    const deck = shuffle(createStandard52Deck());
    this.tlHands.clear();
    this.tlTableCombo = undefined;
    this.tlLastActorId = undefined;
    this.tlPassedIds.clear();
    this.tlChopLog = undefined;
    this.tlInstantWinText = undefined;
    this.tlFinishOrder = [];

    let lowestCard: PlayingCard | undefined;
    let lowestHolderId = this.players[0].id;

    for (const p of this.players) {
      p.alive = true;
      const dealt = sortTienLenHand(deck.splice(0, 13));
      this.tlHands.set(p.id, dealt);
      // Gán bài tượng trưng vào p.hand để handCount hiển thị đúng số lá còn lại
      p.hand = dealt.map((c) => ({ id: c.id, type: 'cat_taco' as CardType }));
      if (dealt[0] && (!lowestCard || dealt[0].tienLenPower < lowestCard.tienLenPower)) {
        lowestCard = dealt[0];
        lowestHolderId = p.id;
      }
    }

    this.phase = 'playing';

    // Kiểm tra Tới Trắng ngay khi chia bài
    for (const p of this.players) {
      const instant = checkTienLenInstantWin(this.tlHands.get(p.id) ?? []);
      if (instant) {
        this.tlInstantWinText = `${p.name} — ${instant.labelVi}`;
        this.tlFinishOrder = [p.id];
        this.phase = 'ended';
        this.winnerId = p.id;
        this.winnerIds = [p.id];
        this.tlLastWinnerId = p.id;
        this.payouts = this.pot > 0 ? { [p.id]: this.pot } : {};
        this.turnDeadline = undefined;
        this.addLog(`🎊 ${p.name} đạt ${instant.labelVi} và thắng trắng ngay lập tức!`);
        return;
      }
    }

    // Ván đầu tiên: người giữ lá nhỏ nhất (3♠ nếu đủ 4 người) đi trước và phải đánh có lá đó
    let starterId = lowestHolderId;
    if (this.tlLastWinnerId && this.players.some((p) => p.id === this.tlLastWinnerId && p.alive)) {
      starterId = this.tlLastWinnerId;
      this.tlFirstTurnOfMatch = false;
      this.tlLowestCardCode = undefined;
    } else {
      this.tlFirstTurnOfMatch = true;
      this.tlLowestCardCode = lowestCard?.code;
    }

    const startIdx = Math.max(0, this.players.findIndex((p) => p.id === starterId));
    const starter = this.players[startIdx];
    this.addLog(
      `🎴 Bắt đầu Tiến Lên Miền Nam (${this.players.length} người, mỗi người 13 lá)! ${starter.name} đi trước${
        this.tlFirstTurnOfMatch && lowestCard ? ` (giữ lá nhỏ nhất ${lowestCard.rank}${lowestCard.suitSymbol})` : ''
      }.`,
    );
    this.startTurn(startIdx, 1);
  }

  tienLenPlay(playerId: string, cardIds: string[]) {
    this.run(() => {
      if (this.gameMode !== 'tien_len' || this.phase !== 'playing') throw new GameError('Không phải ván Tiến Lên Miền Nam.');
      const p = this.requireAlive(playerId);
      const hand = this.tlHands.get(playerId) ?? [];
      const uniqueIds = [...new Set(cardIds)];
      const selected = uniqueIds.map((id) => hand.find((c) => c.id === id || c.code === id)).filter((c): c is PlayingCard => !!c);
      if (!selected.length || selected.length !== uniqueIds.length) {
        throw new GameError('Lá bài đã chọn không hợp lệ.');
      }

      const combo = detectTienLenCombo(selected);
      if (!combo) {
        throw new GameError('Bộ bài không hợp lệ (chỉ được đánh Rác, Đôi, Sám cô, Sảnh ≥3 lá không chứa 2, Tứ Quý, hoặc 3–4 Đôi Thông).');
      }

      // Kiểm tra lượt: 4 Đôi Thông được phép chặt bất cứ lúc nào khi trên bàn có Heo / Hàng; còn lại phải đúng lượt
      const isFourPairsInterrupt = combo.kind === 'four_pairs' && !!this.tlTableCombo;
      if (!isFourPairsInterrupt) {
        if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
        if (this.tlPassedIds.has(playerId) && this.tlTableCombo) {
          throw new GameError('Bạn đã bỏ vòng này, đợi vòng mới nhé.');
        }
      }

      // Lượt mở màn ván đầu tiên: bắt buộc có lá nhỏ nhất (3♠)
      if (this.tlFirstTurnOfMatch && this.tlLowestCardCode) {
        if (!combo.cards.some((c) => c.code === this.tlLowestCardCode)) {
          throw new GameError(`Lượt đầu tiên phải đánh bộ có chứa lá nhỏ nhất (${this.tlLowestCardCode.replace('Spd-', '')}♠ / lá nhỏ nhất trên tay)!`);
        }
      }

      const beat = canBeatTienLenCombo(this.tlTableCombo, combo);
      if (!beat.ok) {
        throw new GameError(beat.reason || 'Bộ bài này không chặt/đè được bài trên bàn.');
      }

      // Xoá các lá vừa đánh khỏi tay
      const playedSet = new Set(combo.cards.map((c) => c.id));
      const nextHand = hand.filter((c) => !playedSet.has(c.id));
      this.tlHands.set(playerId, nextHand);
      p.hand = nextHand.map((c) => ({ id: c.id, type: 'cat_taco' as CardType }));

      const prevActorId = this.tlLastActorId;
      this.tlTableCombo = combo;
      this.tlLastActorId = playerId;
      this.tlFirstTurnOfMatch = false;
      this.tlLowestCardCode = undefined;

      if (beat.isChop && prevActorId && prevActorId !== playerId) {
        const victim = this.player(prevActorId);
        this.tlChopLog = `🔥 ${p.name} dùng ${combo.labelVi} CHẶT ${victim?.name ?? 'đối thủ'}!`;
        this.addLog(this.tlChopLog);
        this.hooks.fx(this, { type: 'explode', playerId: prevActorId });
      } else {
        this.tlChopLog = undefined;
        this.addLog(`🎴 ${p.name} đánh ${combo.labelVi}: ${combo.cards.map((c) => `${c.rank}${c.suitSymbol}`).join(' ')}`);
        this.hooks.fx(this, { type: 'draw', playerId });
      }

      // Kiểm tra hết bài -> Thắng ngay!
      if (nextHand.length === 0) {
        this.tlFinishOrder.push(playerId);
        this.phase = 'ended';
        this.winnerId = playerId;
        this.winnerIds = [playerId];
        this.tlLastWinnerId = playerId;
        this.payouts = this.pot > 0 ? { [playerId]: this.pot } : {};
        this.turnDeadline = undefined;
        this.addLog(`🏆 ${p.name} đã đánh hết 13 lá và VỀ NHẤT!`);
        return;
      }

      // Chuyển lượt sang người tiếp theo chưa bỏ vòng
      const myIdx = this.players.findIndex((x) => x.id === playerId);
      const nextIdx = this.nextTienLenIdx(myIdx);
      this.startTurn(nextIdx, 1);
    });
  }

  tienLenPass(playerId: string) {
    this.run(() => {
      if (this.gameMode !== 'tien_len' || this.phase !== 'playing') throw new GameError('Không phải ván Tiến Lên Miền Nam.');
      const p = this.requireAlive(playerId);
      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      if (!this.tlTableCombo || this.tlLastActorId === playerId) {
        throw new GameError('Bạn đang cầm cái mở vòng mới, không thể bỏ lượt!');
      }

      this.tlPassedIds.add(playerId);
      this.addLog(`⏭️ ${p.name} bỏ lượt.`);

      // Kiểm tra xem tất cả những người khác đã bỏ vòng hết chưa
      const activeOthers = this.players.filter(
        (x) => x.alive && !x.left && x.id !== this.tlLastActorId && !this.tlPassedIds.has(x.id),
      );
      if (activeOthers.length === 0 && this.tlLastActorId) {
        const leaderIdx = this.players.findIndex((x) => x.id === this.tlLastActorId);
        const leader = this.players[leaderIdx];
        this.tlTableCombo = undefined;
        this.tlPassedIds.clear();
        this.tlChopLog = undefined;
        if (leader && leader.alive && !leader.left) {
          this.addLog(`✨ Cả bàn đã bỏ lượt! ${leader.name} thắng vòng này và được đánh bộ mới.`);
          this.startTurn(leaderIdx, 1);
          return;
        }
      }

      const nextIdx = this.nextTienLenIdx(this.currentIdx);
      this.startTurn(nextIdx, 1);
    });
  }

  private nextTienLenIdx(from: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      const p = this.players[idx];
      if (p.alive && !p.left && !this.tlPassedIds.has(p.id)) return idx;
    }
    return this.nextAliveIdx(from);
  }

  // ---------- hành động trong ván Mèo Nổ ----------

  play(playerId: string, req: PlayRequest) {
    this.run(() => {
      const p = this.requireAlive(playerId);
      if (this.waiting) throw new GameError('Đang chờ người khác thao tác.');
      const ids = [...new Set(req.cardIds)];
      const cards = ids.map((id) => p.hand.find((c) => c.id === id));
      if (!cards.length || cards.some((c) => !c)) throw new GameError('Lá bài không hợp lệ.');
      const played = cards as Card[];

      // Nope: đánh được bất cứ lúc nào có hành động đang chờ
      if (played.length === 1 && played[0].type === 'nope') {
        if (!this.pending) throw new GameError('Không có gì để Nope.');
        if (!this.roomRules.nopeChain && this.pending.nopeCount > 0) throw new GameError('Luật phòng không cho phép Nope lại Nope.');
        this.toDiscard(p, played);
        this.pending.nopeCount++;
        this.lastPlay?.nopers.push(p.id);
        this.lastPlay?.nopeCardIds.push(played[0].id);
        this.pending.deadline = Date.now() + this.roomRules.nopeSeconds * 1000;
        this.addLog(this.pending.nopeCount % 2 ? `${p.name} NOPE!` : `${p.name} NOPE lại cái Nope!`);
        return;
      }

      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      if (this.pending) throw new GameError('Đợi hành động trước xử lý xong đã.');

      const types = played.map((c) => c.type);
      const kind = detectPlayKind(types, this.roomRules);
      if (!kind) throw new GameError('Cách đánh này không hợp lệ theo luật phòng.');

      let target: Player | undefined;
      if (kind === 'targeted_attack') {
        target = req.targetId ? this.player(req.targetId) : undefined;
        if (!target || !target.alive || target.id === playerId) throw new GameError('Chọn một người chơi khác.');
      } else if (kind === 'favor' || kind === 'mark' || kind === 'pair' || kind === 'triple') {
        target = req.targetId ? this.player(req.targetId) : undefined;
        if (!target || !target.alive || target.id === playerId) throw new GameError('Chọn một người chơi khác.');
        if (!target.hand.length) throw new GameError(`${target.name} hết bài rồi.`);
      }
      if (kind === 'triple' && (!req.namedType || !CARD_INFO[req.namedType] || req.namedType === 'exploding')) {
        throw new GameError('Chọn tên lá muốn lấy.');
      }
      if ((kind === 'five' || kind === 'grave_robber') && (!req.discardType || req.discardType === 'exploding' || !this.discard.some((c) => c.type === req.discardType))) {
        throw new GameError('Chọn lá muốn lấy từ chồng bài bỏ.');
      }

      // Lock the existing discard before spending the card(s).
      const discardCardId = (kind === 'five' || kind === 'grave_robber')
        ? this.discard.filter((c) => c.type === req.discardType).at(-1)?.id
        : undefined;

      this.toDiscard(p, played);
      this.pending = {
        kind,
        actorId: playerId,
        targetId: target?.id,
        namedType: req.namedType,
        discardType: req.discardType,
        discardCardId,
        shuffleStyle: req.shuffleStyle && SHUFFLE_STYLES[req.shuffleStyle] ? req.shuffleStyle : 'riffle',
        cards: types,
        nopeCount: 0,
        deadline: Date.now() + this.roomRules.nopeSeconds * 1000,
      };
      this.lastPlay = { id: ++this.playSeq, kind, actorId: playerId, targetId: target?.id, cards: types, cardIds: played.map((c) => c.id), nopers: [], nopeCardIds: [] };
      this.addLog(this.describe(p, kind, target, req));
    });
  }

  draw(playerId: string) {
    this.run(() => {
      const p = this.requireAlive(playerId);
      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      if (this.pending || this.waiting) throw new GameError('Đợi xử lý xong đã.');
      this.drawFor(p);
    });
  }

  placeBomb(playerId: string, position: number) {
    this.run(() => {
      const w = this.waiting;
      if (w?.kind !== 'defuse_place' || w.playerId !== playerId) throw new GameError('Không có bom cần nhét.');
      this.doPlaceBomb(position);
    });
  }

  giveFavor(playerId: string, cardId: string) {
    this.run(() => {
      const w = this.waiting;
      if (w?.kind !== 'favor_give' || w.playerId !== playerId) throw new GameError('Không ai xin bài bạn.');
      const card = this.player(playerId)!.hand.find((c) => c.id === cardId);
      if (!card) throw new GameError('Lá bài không hợp lệ.');
      this.doGiveFavor(card);
    });
  }

  alterFuture(playerId: string, cardIds: string[]) {
    this.run(() => {
      const w = this.waiting;
      if (w?.kind !== 'alter_future' || w.playerId !== playerId) {
        throw new GameError('Không có lượt Sửa Tương Lai nào đang chờ.');
      }
      this.doAlterFuture(cardIds);
    });
  }

  // ---------- góc nhìn từng người ----------

  viewFor(id: string): RoomView {
    const w = this.waiting;
    const blackjack: BlackjackRoomView | undefined =
      this.gameMode === 'blackjack_21' && this.phase !== 'lobby'
        ? {
            dealerId: this.bjDealerId,
            deckCount: this.bjDeck.length,
            hand: this.bjHands.get(id) ?? [],
            myEval: evaluateBlackjackHand(this.bjHands.get(id) ?? [], id === this.bjDealerId),
            players: this.players.map((p): BlackjackPlayerView => {
              const pCards = this.bjHands.get(p.id) ?? [];
              const st = this.bjStatus.get(p.id) ?? 'playing';
              const showCards = this.phase === 'ended' || st === 'revealed' || p.id === id;
              const out = this.bjOutcomes.get(p.id);
              return {
                playerId: p.id,
                isDealer: p.id === this.bjDealerId,
                status: st,
                handCount: pCards.length,
                cards: showCards ? pCards : undefined,
                eval: showCards ? evaluateBlackjackHand(pCards, p.id === this.bjDealerId) : undefined,
                betAmount: this.bet,
                outcome: out?.outcome,
                outcomeText: out?.text,
                coinDelta: out?.delta,
              };
            }),
          }
        : undefined;

    const tienLen: TienLenRoomView | undefined =
      this.gameMode === 'tien_len' && this.phase !== 'lobby'
        ? {
            hand: this.tlHands.get(id) ?? [],
            tableCombo: this.tlTableCombo,
            lastActorId: this.tlLastActorId,
            passedIds: [...this.tlPassedIds],
            firstTurnOfMatch: this.tlFirstTurnOfMatch,
            mustIncludeLowest: this.tlLowestCardCode,
            chopLog: this.tlChopLog,
            instantWinText: this.tlInstantWinText,
            finishOrder: this.tlFinishOrder,
          }
        : undefined;

    return {
      code: this.code,
      gameMode: this.gameMode,
      phase: this.phase,
      hostId: this.hostId,
      rules: this.rules,
      rulesVersion: this.rulesVersion,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        connected: p.connected,
        left: !!p.left,
        ready: p.id === this.hostId || p.readyVersion === this.rulesVersion,
        alive: p.alive,
        handCount:
          this.gameMode === 'blackjack_21'
            ? (this.bjHands.get(p.id)?.length ?? 0)
            : this.gameMode === 'tien_len'
              ? (this.tlHands.get(p.id)?.length ?? 0)
              : p.hand.length,
      })),
      hand: this.player(id)?.hand ?? [],
      currentPlayerId: this.phase === 'playing' ? this.current()?.id : undefined,
      turnsRemaining: this.turnsRemaining,
      turnDeadline: this.phase === 'playing' ? this.turnDeadline : undefined,
      deckCount: this.gameMode === 'blackjack_21' ? this.bjDeck.length : this.deck.length,
      discardTop: this.discard.at(-1)?.type,
      discardTopId: this.discard.at(-1)?.id,
      discardTypes: [...new Set(this.discard.map((c) => c.type))].filter((t) => t !== 'exploding'),
      pending: this.pending && {
        kind: this.pending.kind,
        actorId: this.pending.actorId,
        targetId: this.pending.targetId,
        cards: this.pending.cards,
        nopeCount: this.pending.nopeCount,
        deadline: this.pending.deadline,
      },
      lastPlay: this.lastPlay,
      waiting:
        w?.kind === 'defuse_place'
          ? { kind: w.kind, playerId: w.playerId, deckCount: this.deck.length, deadline: w.deadline }
          : w?.kind === 'alter_future'
            ? {
                kind: w.kind,
                playerId: w.playerId,
                count: w.cards.length,
                cards: w.playerId === id ? w.cards : undefined,
                deadline: w.deadline,
              }
            : w,
      winnerId: this.winnerId,
      log: this.log,
      logTotal: this.logTotal,
      bet: this.bet,
      pot: this.pot,
      blackjack,
      tienLen,
      payouts: Object.keys(this.payouts).length ? this.payouts : undefined,
    };
  }

  /** Ghi thêm 1 dòng nhật ký từ bên ngoài (vd: trả hũ xu) – gọi trong lúc đang broadcast */
  note(msg: string) {
    this.addLog(msg);
  }

  winner() {
    return this.winnerId;
  }

  winners() {
    return this.winnerIds.length ? this.winnerIds : this.winnerId ? [this.winnerId] : [];
  }

  dispose() {
    clearTimeout(this.timer);
  }

  // ---------- nội bộ ----------

  /** Mọi thay đổi trạng thái đi qua đây: chạy xong thì hẹn giờ lại và báo cho mọi người */
  private run(fn: () => void) {
    fn();
    this.schedule();
    this.hooks.changed(this);
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.phase !== 'playing') return;
    const at = this.pending?.deadline ?? this.waiting?.deadline ?? this.turnDeadline;
    if (!at) return;
    this.timer = setTimeout(() => this.run(() => this.onTimer()), Math.max(0, at - Date.now()) + 50);
  }

  private onTimer() {
    const now = Date.now();
    if (this.gameMode === 'blackjack_21') {
      const cur = this.current();
      if (cur && this.turnDeadline && now >= this.turnDeadline) {
        const cards = this.bjHands.get(cur.id) ?? [];
        const isDealer = cur.id === this.bjDealerId;
        const ev = evaluateBlackjackHand(cards, isDealer);
        if (!ev.canStand && ev.canHit && this.bjDeck.length > 0) {
          this.addLog(`⏰ ${cur.name} hết giờ và chưa đủ tuổi, tự động rút 1 lá.`);
          const drawn = this.bjDeck.shift()!;
          cards.push(drawn);
          this.bjHands.set(cur.id, cards);
          const nextEv = evaluateBlackjackHand(cards, isDealer);
          if (nextEv.kind === 'bust') this.bjStatus.set(cur.id, 'busted');
          else if (nextEv.canStand || !nextEv.canHit) this.bjStatus.set(cur.id, 'stood');
          else {
            this.bjStatus.set(cur.id, 'stood');
          }
        } else {
          this.addLog(`⏰ ${cur.name} hết giờ, tự động dừng bài.`);
          this.bjStatus.set(cur.id, 'stood');
        }
        this.advanceBlackjackTurn();
      }
      return;
    }

    if (this.gameMode === 'tien_len') {
      const cur = this.current();
      if (cur && this.turnDeadline && now >= this.turnDeadline) {
        if (this.tlTableCombo && this.tlLastActorId !== cur.id) {
          this.addLog(`⏰ ${cur.name} hết giờ, tự động bỏ lượt.`);
          this.tlPassedIds.add(cur.id);
          const activeOthers = this.players.filter(
            (x) => x.alive && !x.left && x.id !== this.tlLastActorId && !this.tlPassedIds.has(x.id),
          );
          if (activeOthers.length === 0 && this.tlLastActorId) {
            const leaderIdx = this.players.findIndex((x) => x.id === this.tlLastActorId);
            this.tlTableCombo = undefined;
            this.tlPassedIds.clear();
            if (leaderIdx >= 0) {
              this.startTurn(leaderIdx, 1);
              return;
            }
          }
          this.startTurn(this.nextTienLenIdx(this.currentIdx), 1);
        } else {
          // Đang cầm cái mở vòng mới -> tự động đánh lá nhỏ nhất trên tay
          const hand = this.tlHands.get(cur.id) ?? [];
          if (hand.length > 0) {
            const card = hand[0];
            const nextHand = hand.slice(1);
            this.tlHands.set(cur.id, nextHand);
            cur.hand = nextHand.map((c) => ({ id: c.id, type: 'cat_taco' as CardType }));
            this.tlTableCombo = detectTienLenCombo([card])!;
            this.tlLastActorId = cur.id;
            this.tlFirstTurnOfMatch = false;
            this.tlLowestCardCode = undefined;
            this.addLog(`⏰ ${cur.name} hết giờ, tự động đánh ${card.nameVi}.`);
            if (nextHand.length === 0) {
              this.phase = 'ended';
              this.winnerId = cur.id;
              this.winnerIds = [cur.id];
              this.payouts = this.pot > 0 ? { [cur.id]: this.pot } : {};
              this.turnDeadline = undefined;
              return;
            }
            this.startTurn(this.nextTienLenIdx(this.currentIdx), 1);
          }
        }
      }
      return;
    }

    if (this.pending) {
      if (now >= this.pending.deadline) this.resolvePending();
      return;
    }
    const w = this.waiting;
    if (w) {
      if (now < w.deadline) return;
      if (w.kind === 'defuse_place') {
        this.doPlaceBomb(randomInt(this.deck.length + 1));
      } else if (w.kind === 'alter_future') {
        this.doAlterFuture();
      } else {
        const hand = this.player(w.playerId)?.hand ?? [];
        if (hand.length) this.doGiveFavor(hand[randomInt(hand.length)]);
        else this.waiting = undefined;
      }
      return;
    }
    const cur = this.current();
    if (cur && this.turnDeadline && now >= this.turnDeadline) {
      this.addLog(`${cur.name} hết giờ, tự động rút bài.`);
      this.drawFor(cur);
    }
  }

  private resolvePending() {
    const pd = this.pending!;
    this.pending = undefined;
    this.extendTurnDeadline();
    const actor = this.player(pd.actorId);
    if (this.lastPlay) this.lastPlay.result = pd.nopeCount % 2 === 1 ? 'noped' : 'done';
    if (!actor?.alive) return;
    if (pd.nopeCount % 2 === 1) {
      this.addLog(`Hành động của ${actor.name} đã bị Nope.`);
      return;
    }
    const target = pd.targetId ? this.player(pd.targetId) : undefined;

    switch (pd.kind) {
      case 'attack': {
        const carry = this.roomRules.attackMode === 'stack' && this.attackDebt ? this.turnsRemaining : 0;
        const next = this.nextAliveIdx(this.currentIdx);
        this.startTurn(next, carry + 2, true);
        this.addLog(`${this.players[next].name} phải chơi ${carry + 2} lượt!`);
        break;
      }
      case 'targeted_attack': {
        const carry = this.roomRules.attackMode === 'stack' && this.attackDebt ? this.turnsRemaining : 0;
        const targetIdx = target?.alive ? this.players.findIndex((p) => p.id === target.id) : -1;
        const next = targetIdx >= 0 ? targetIdx : this.nextAliveIdx(this.currentIdx);
        this.startTurn(next, carry + 2, true);
        this.addLog(`🎯 ${this.players[next].name} bị chỉ định phải chơi ${carry + 2} lượt!`);
        break;
      }
      case 'personal_attack': {
        const carry = this.roomRules.attackMode === 'stack' && this.attackDebt ? this.turnsRemaining : 0;
        const total = carry + 3;
        this.startTurn(this.currentIdx, total, true);
        this.addLog(`⚡ ${actor.name} tự gánh ${total} lượt liên tiếp!`);
        break;
      }
      case 'skip':
        this.endOneTurn();
        break;
      case 'super_skip':
        this.turnsRemaining = 1;
        this.addLog(`⏭️ ${actor.name} bỏ qua toàn bộ số lượt còn lại!`);
        this.endOneTurn();
        break;
      case 'reverse':
        this.direction = (this.direction * -1) as 1 | -1;
        this.addLog(`🔄 ${actor.name} đảo chiều vòng chơi và kết thúc 1 lượt!`);
        this.endOneTurn();
        break;
      case 'draw_bottom':
        this.drawFor(actor, 'bottom');
        break;
      case 'catomic_bomb': {
        const bombs = this.deck.filter((c) => c.type === 'exploding');
        const rest = shuffle(this.deck.filter((c) => c.type !== 'exploding'));
        this.deck = [...bombs, ...rest];
        this.hooks.fx(this, { type: 'shuffle', playerId: actor.id, style: 'riffle' });
        this.addLog(`☢️ ${actor.name} kích hoạt Bom Nguyên Tử: gom toàn bộ ${bombs.length} Mèo Nổ lên đầu chồng bài và kết thúc lượt!`);
        this.endOneTurn();
        break;
      }
      case 'swap_top_bottom': {
        if (this.deck.length >= 2) {
          const last = this.deck.length - 1;
          [this.deck[0], this.deck[last]] = [this.deck[last], this.deck[0]];
        }
        this.hooks.fx(this, { type: 'insert', playerId: actor.id });
        this.addLog(`🔃 ${actor.name} đổi chỗ lá trên cùng và lá dưới đáy chồng bài.`);
        break;
      }
      case 'bury': {
        const topCard = this.deck.shift();
        if (topCard) {
          if (topCard.type !== 'exploding') {
            actor.hand.push(topCard);
            this.hooks.fx(this, { type: 'draw', playerId: actor.id });
            const buryIdx = actor.hand.findIndex((c) => c.type !== 'defuse');
            const buried = actor.hand.splice(buryIdx >= 0 ? buryIdx : 0, 1)[0];
            if (buried) {
              const pos = randomInt(this.deck.length + 1);
              this.deck.splice(pos, 0, buried);
              this.hooks.fx(this, { type: 'insert', playerId: actor.id });
            }
            this.addLog(`🕳️ ${actor.name} rút 1 lá và chôn 1 lá vào lại chồng bài.`);
            this.endOneTurn();
          } else {
            this.deck.unshift(topCard);
            this.drawFor(actor, 'top');
          }
        } else {
          this.endOneTurn();
        }
        break;
      }
      case 'garbage_collection': {
        let returned = 0;
        for (const pl of this.players) {
          if (!pl.alive || !pl.hand.length) continue;
          const nonDefuseIdx = pl.hand.findIndex((c) => c.type !== 'defuse');
          const pickIdx = nonDefuseIdx >= 0 ? nonDefuseIdx : randomInt(pl.hand.length);
          const [given] = pl.hand.splice(pickIdx, 1);
          if (given) {
            this.deck.push(given);
            returned++;
          }
        }
        shuffle(this.deck);
        this.hooks.fx(this, { type: 'shuffle', playerId: actor.id, style: 'overhand' });
        this.addLog(`♻️ ${actor.name} gom ${returned} lá từ mọi người vào chồng rút và xáo đều!`);
        break;
      }
      case 'shuffle': {
        shuffle(this.deck);
        const style = pd.shuffleStyle ?? 'riffle';
        this.hooks.fx(this, { type: 'shuffle', playerId: actor.id, style });
        this.addLog(`${SHUFFLE_STYLES[style].emoji} ${actor.name} xáo bài kiểu ${SHUFFLE_STYLES[style].name}.`);
        break;
      }
      case 'see_future': {
        this.hooks.fx(this, { type: 'future', playerId: actor.id });
        const top3 = this.deck.slice(0, this.roomRules.futureCount);
        const top = top3.map((c) => c.type);
        this.hooks.notify(actor.id, { kind: 'future', cards: top, cardIds: top3.map((c) => c.id), text: `${top.length} lá trên cùng (trái = trên cùng)` });
        break;
      }
      case 'alter_future': {
        this.hooks.fx(this, { type: 'future', playerId: actor.id });
        const count = Math.min(this.roomRules.futureCount, this.deck.length);
        const slice = this.deck.slice(0, count);
        if (slice.length <= 1) {
          this.hooks.notify(actor.id, {
            kind: 'future',
            cards: slice.map((c) => c.type),
            cardIds: slice.map((c) => c.id),
            text: slice.length ? 'Chỉ còn 1 lá trong chồng bài' : 'Chồng bài trống',
          });
          this.addLog(`🔮 ${actor.name} xem chồng bài.`);
          break;
        }
        this.waiting = {
          kind: 'alter_future',
          playerId: actor.id,
          cards: slice,
          deadline: Date.now() + this.roomRules.promptSeconds * 1000,
        };
        this.addLog(`🔮 ${actor.name} đang xem và sắp xếp ${slice.length} lá trên cùng…`);
        break;
      }
      case 'share_future': {
        this.hooks.fx(this, { type: 'future', playerId: actor.id });
        const count = Math.min(this.roomRules.futureCount, this.deck.length);
        const slice = this.deck.slice(0, count);
        const top = slice.map((c) => c.type);
        const ids = slice.map((c) => c.id);
        this.hooks.notify(actor.id, {
          kind: 'future',
          cards: top,
          cardIds: ids,
          text: `${top.length} lá trên cùng (đã chia sẻ với người kế tiếp)`,
        });
        const nextIdx = this.nextAliveIdx(this.currentIdx);
        const nextPl = this.players[nextIdx];
        if (nextPl && nextPl.id !== actor.id) {
          this.hooks.notify(nextPl.id, {
            kind: 'future',
            cards: top,
            cardIds: ids,
            text: `${actor.name} chia sẻ ${top.length} lá trên cùng với bạn`,
          });
        }
        this.addLog(`👁️ ${actor.name} xem và chia sẻ ${top.length} lá trên cùng với ${nextPl?.name ?? 'bàn chơi'}.`);
        break;
      }
      case 'dig_deeper': {
        if (this.deck.length >= 2 && this.deck[0].type === 'exploding' && this.deck[1].type !== 'exploding') {
          [this.deck[0], this.deck[1]] = [this.deck[1], this.deck[0]];
          this.addLog(`⛏️ ${actor.name} Đào Sâu né lá trên cùng và rút lá kế tiếp!`);
        } else {
          this.addLog(`⛏️ ${actor.name} Đào Sâu rút bài!`);
        }
        this.drawFor(actor, 'top');
        break;
      }
      case 'favor':
        if (target?.alive && target.hand.length) {
          this.waiting = { kind: 'favor_give', playerId: target.id, toId: actor.id, deadline: Date.now() + this.roomRules.promptSeconds * 1000 };
        }
        break;
      case 'mark':
        if (target?.alive && target.hand.length) {
          const peeked = target.hand[randomInt(target.hand.length)];
          this.hooks.notify(actor.id, {
            kind: 'future',
            cards: [peeked.type],
            cardIds: [peeked.id],
            text: `Đánh Dấu: bạn soi thấy ${target.name} đang giữ lá ${CARD_INFO[peeked.type].name}`,
          });
          this.addLog(`🎯 ${actor.name} đánh dấu và soi 1 lá trên tay ${target.name}.`);
        }
        break;
      case 'pair':
        if (target?.alive && target.hand.length) {
          this.transfer(target, actor, target.hand[randomInt(target.hand.length)], 'pair');
        }
        break;
      case 'triple': {
        const card = target?.hand.find((c) => c.type === pd.namedType);
        if (target && card) this.transfer(target, actor, card, 'triple');
        else this.addLog(`${target?.name ?? '?'} không có ${CARD_INFO[pd.namedType!].name}.`);
        break;
      }
      case 'grave_robber':
      case 'five': {
        const idx = this.discard.findIndex((c) => c.id === pd.discardCardId);
        if (idx >= 0) {
          const [card] = this.discard.splice(idx, 1);
          actor.hand.push(card);
          this.hooks.fx(this, { type: 'transfer', from: 'discard', to: actor.id, via: 'five' });
          this.hooks.notify(actor.id, { kind: 'received', cards: [card.type], cardIds: [card.id], text: `Bạn lấy ${CARD_INFO[card.type].name} từ chồng bài bỏ` });
          this.addLog(`${actor.name} lấy ${CARD_INFO[card.type].name} từ chồng bài bỏ.`);
        }
        break;
      }
    }
  }

  private drawFor(p: Player, from: 'top' | 'bottom' = 'top') {
    const card = from === 'bottom' ? this.deck.pop() : this.deck.shift();
    if (!card) {
      this.endOneTurn();
      return;
    }
    this.hooks.fx(this, { type: 'draw', playerId: p.id });
    if (card.type !== 'exploding') {
      p.hand.push(card);
      this.addLog(from === 'bottom' ? `${p.name} rút 1 lá dưới đáy chồng bài.` : `${p.name} rút 1 lá.`);
      this.endOneTurn();
      return;
    }
    const defuse = p.hand.find((c) => c.type === 'defuse');
    if (defuse) {
      this.toDiscard(p, [defuse]);
      this.waiting = { kind: 'defuse_place', playerId: p.id, card, deadline: Date.now() + this.roomRules.promptSeconds * 1000 };
      this.hooks.fx(this, { type: 'defuse', playerId: p.id });
      this.addLog(`💣 ${p.name} rút trúng Mèo Nổ${from === 'bottom' ? ' dưới đáy' : ''}… và GỠ BOM thành công!`);
      if (this.roomRules.bombPlacement === 'random') this.doPlaceBomb(randomInt(this.deck.length + 1));
    } else {
      this.addLog(`💥 ${p.name} rút trúng Mèo Nổ${from === 'bottom' ? ' dưới đáy' : ''} và NỔ TUNG!`);
      this.discard.push(card);
      this.hooks.fx(this, { type: 'explode', playerId: p.id });
      this.eliminate(p);
    }
  }

  private doPlaceBomb(position: number) {
    const w = this.waiting as Extract<Waiting, { kind: 'defuse_place' }>;
    const pos = Math.min(Math.max(0, Math.floor(Number(position) || 0)), this.deck.length);
    this.deck.splice(pos, 0, w.card);
    this.waiting = undefined;
    this.hooks.fx(this, { type: 'insert', playerId: w.playerId });
    this.addLog(`${this.player(w.playerId)?.name} đã lén nhét Mèo Nổ lại vào chồng bài.`);
    this.endOneTurn();
  }

  private doGiveFavor(card: Card) {
    const w = this.waiting as Extract<Waiting, { kind: 'favor_give' }>;
    const from = this.player(w.playerId)!;
    const to = this.player(w.toId);
    this.waiting = undefined;
    this.extendTurnDeadline();
    if (to?.alive) this.transfer(from, to, card, 'favor');
  }

  private doAlterFuture(cardIds?: string[]) {
    const w = this.waiting as Extract<Waiting, { kind: 'alter_future' }>;
    const count = Math.min(w.cards.length, this.deck.length);
    const currentSlice = this.deck.slice(0, count);
    if (Array.isArray(cardIds) && cardIds.length === currentSlice.length) {
      const map = new Map(currentSlice.map((c) => [c.id, c]));
      const seen = new Set<string>();
      const reordered: Card[] = [];
      for (const id of cardIds) {
        const card = map.get(id);
        if (!card || seen.has(id)) throw new GameError('Thứ tự các lá bài không hợp lệ.');
        seen.add(id);
        reordered.push(card);
      }
      this.deck.splice(0, count, ...reordered);
    }
    this.waiting = undefined;
    this.extendTurnDeadline();
    this.hooks.fx(this, { type: 'insert', playerId: w.playerId });
    this.addLog(`🔮 ${this.player(w.playerId)?.name} đã sắp xếp xong ${count} lá trên cùng!`);
  }

  private transfer(from: Player, to: Player, card: Card, via: 'favor' | 'pair' | 'triple') {
    from.hand = from.hand.filter((c) => c.id !== card.id);
    to.hand.push(card);
    const name = CARD_INFO[card.type].name;
    this.hooks.fx(this, { type: 'transfer', from: from.id, to: to.id, via });
    this.hooks.notify(to.id, { kind: 'received', cards: [card.type], cardIds: [card.id], text: `Bạn lấy được ${name} từ ${from.name}` });
    this.hooks.notify(from.id, { kind: 'lost', cards: [card.type], cardIds: [card.id], text: `${to.name} đã lấy ${name} của bạn` });
    this.addLog(via === 'favor' ? `${from.name} đưa 1 lá cho ${to.name}.` : `${to.name} lấy 1 lá của ${from.name}.`);
  }


  /** Xử lý nốt việc người này đang bị chờ (khi họ rời phòng giữa ván) */
  private finishWaitingFor(id: string) {
    const w = this.waiting;
    if (w?.playerId !== id) return;
    if (w.kind === 'defuse_place') this.doPlaceBomb(randomInt(this.deck.length + 1));
    else if (w.kind === 'alter_future') this.doAlterFuture();
    else this.waiting = undefined;
  }

  private eliminate(p: Player) {
    const wasCurrent = this.current()?.id === p.id;
    this.discard.push(...p.hand);
    p.hand = [];
    p.alive = false;
    if (this.gameMode === 'blackjack_21') {
      this.bjStatus.set(p.id, 'busted');
      const alive = this.players.filter((x) => x.alive && !x.left);
      if (alive.length <= 1 || p.id === this.bjDealerId) {
        if (alive.length === 1 && p.id === this.bjDealerId) {
          this.bjDealerId = alive[0].id;
        }
        this.finishBlackjack();
        return;
      }
      if (wasCurrent) this.advanceBlackjackTurn();
      return;
    }
    if (this.gameMode === 'tien_len') {
      this.tlHands.delete(p.id);
      this.tlPassedIds.add(p.id);
      const alive = this.players.filter((x) => x.alive && !x.left);
      if (alive.length <= 1) {
        this.phase = 'ended';
        this.winnerId = alive[0]?.id;
        this.winnerIds = alive[0] ? [alive[0].id] : [];
        if (alive[0] && this.pot > 0) this.payouts = { [alive[0].id]: this.pot };
        this.turnDeadline = undefined;
        this.addLog(alive[0] ? `🏆 ${alive[0].name} thắng!` : 'Hết ván.');
        return;
      }
      if (this.tlLastActorId === p.id) {
        this.tlTableCombo = undefined;
        this.tlPassedIds.clear();
      }
      if (wasCurrent) this.startTurn(this.nextTienLenIdx(this.currentIdx), 1);
      return;
    }
    if (this.pending?.actorId === p.id) this.pending = undefined;
    if (this.waiting?.kind === 'favor_give' && this.waiting.toId === p.id) this.waiting = undefined;
    const alive = this.players.filter((x) => x.alive);
    if (alive.length <= 1) {
      this.phase = 'ended';
      this.winnerId = alive[0]?.id;
      this.winnerIds = alive[0] ? [alive[0].id] : [];
      this.pending = undefined;
      this.waiting = undefined;
      this.turnDeadline = undefined;
      this.addLog(alive[0] ? `🏆 ${alive[0].name} thắng!` : 'Hết ván.');
      return;
    }
    if (wasCurrent) this.startTurn(this.nextAliveIdx(this.currentIdx), 1);
  }

  private startTurn(idx: number, turns: number, attacked = false) {
    this.currentIdx = idx;
    this.turnsRemaining = turns;
    this.attackDebt = attacked;
    this.turnDeadline = Date.now() + this.roomRules.turnSeconds * 1000;
  }

  private endOneTurn() {
    this.turnsRemaining--;
    if (this.turnsRemaining <= 0) this.startTurn(this.nextAliveIdx(this.currentIdx), 1);
    else this.turnDeadline = Date.now() + this.roomRules.turnSeconds * 1000;
  }

  private extendTurnDeadline() {
    if (this.turnDeadline) this.turnDeadline = Math.max(this.turnDeadline, Date.now() + Math.min(20_000, this.roomRules.turnSeconds * 1000));
  }

  private nextAliveIdx(from: number) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i * this.direction + n * 2) % n;
      if (this.players[idx].alive) return idx;
    }
    return from;
  }

  private current(): Player | undefined {
    return this.phase === 'playing' ? this.players[this.currentIdx] : undefined;
  }

  private player(id: string) {
    return this.players.find((p) => p.id === id);
  }

  private requireAlive(id: string) {
    if (this.phase !== 'playing') throw new GameError('Ván chưa bắt đầu.');
    const p = this.player(id);
    if (!p?.alive) throw new GameError('Bạn đã bị loại.');
    return p;
  }

  private pickHost() {
    const others = this.players.filter((p) => p.id !== this.hostId && !p.left);
    const next = others.find((p) => p.connected) ?? others[0];
    if (next) this.hostId = next.id;
  }

  private requireLobbyHost(byId: string) {
    if (byId !== this.hostId) throw new GameError('Chỉ chủ phòng mới thay đổi hoặc bắt đầu được.');
    if (this.phase !== 'lobby') throw new GameError('Chỉ thay đổi luật trong phòng chờ.');
  }

  private parseRules(raw: unknown): RoomRules {
    try { return normalizeRoomRules(raw); }
    catch (error) { throw new GameError(error instanceof Error ? error.message : 'Luật phòng không hợp lệ.'); }
  }

  private invalidateReady() {
    this.rulesVersion++;
    this.players.forEach((p) => { p.readyVersion = undefined; });
  }

  private toDiscard(p: Player, cards: Card[]) {
    const ids = new Set(cards.map((c) => c.id));
    p.hand = p.hand.filter((c) => !ids.has(c.id));
    this.discard.push(...cards);
  }

  private newCard(type: CardType): Card {
    return { id: `c${++this.seq}`, type };
  }

  private describe(p: Player, kind: ActionKind, target: Player | undefined, req: PlayRequest) {
    switch (kind) {
      case 'pair':
        return `${p.name} đánh đôi, rút bài của ${target!.name}.`;
      case 'triple':
        return `${p.name} đánh bộ ba, đòi ${target!.name} đưa ${CARD_INFO[req.namedType!].name}.`;
      case 'five':
        return `${p.name} đánh 5 lá khác loại, muốn lấy ${CARD_INFO[req.discardType!].name} từ chồng bài bỏ.`;
      case 'favor':
        return `${p.name} đánh Xin Bài vào ${target!.name}.`;
      case 'targeted_attack':
        return `${p.name} đánh Tấn Công Chỉ Định vào ${target!.name}.`;
      case 'mark':
        return `${p.name} đánh Đánh Dấu vào ${target!.name}.`;
      case 'grave_robber':
        return `${p.name} đánh Trộm Mộ, muốn lấy ${CARD_INFO[req.discardType!].name} từ chồng bài bỏ.`;
      default:
        return `${p.name} đánh ${CARD_INFO[kind as CardType].name}.`;
    }
  }

  private addLog(msg: string) {
    this.log = [...this.log, msg].slice(-LOG_SIZE);
    this.logTotal++;
  }
}
