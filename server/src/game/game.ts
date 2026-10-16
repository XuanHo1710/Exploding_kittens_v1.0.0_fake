import { randomInt } from 'crypto';
import {
  ActionKind,
  CARD_INFO,
  Card,
  CardType,
  DECK_COUNTS,
  EXTRA_DEFUSES_IN_DECK,
  bombCount,
  HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NOPE_WINDOW_MS,
  PROMPT_MS,
  TURN_MS,
  LastPlay,
  Phase,
  PlayRequest,
  GameFx,
  PrivateNotice,
  RoomView,
  SHUFFLE_STYLES,
  ShuffleStyle,
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
}

interface Pending {
  kind: ActionKind;
  actorId: string;
  targetId?: string;
  namedType?: CardType;
  discardType?: CardType;
  shuffleStyle?: ShuffleStyle;
  cards: CardType[];
  nopeCount: number;
  deadline: number;
}

type Waiting =
  | { kind: 'defuse_place'; playerId: string; card: Card; deadline: number }
  | { kind: 'favor_give'; playerId: string; toId: string; deadline: number };

export interface GameHooks {
  changed(game: Game): void;
  notify(playerId: string, notice: PrivateNotice): void;
  fx(game: Game, fx: GameFx): void;
  removed(playerId: string, code: string): void;
}

const SINGLE_ACTIONS: CardType[] = ['attack', 'skip', 'favor', 'shuffle', 'see_future'];

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Game {
  phase: Phase = 'lobby';
  hostId = '';
  players: Player[] = [];
  private deck: Card[] = []; // deck[0] là lá trên cùng
  private discard: Card[] = [];
  private currentIdx = 0;
  private turnsRemaining = 0;
  private turnDeadline?: number;
  private pending?: Pending;
  private lastPlay?: LastPlay;
  private playSeq = 0;
  private waiting?: Waiting;
  private winnerId?: string;
  private log: string[] = [];
  private logTotal = 0;
  /** Cược xu: do RoomsService quản lý (trừ xu lúc bắt đầu, trả hũ cho người thắng) */
  bet = 0;
  pot = 0;
  paid = false;
  private seq = 0;
  private timer?: NodeJS.Timeout;

  constructor(
    readonly code: string,
    private hooks: GameHooks,
  ) {}

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
      if (this.players.length >= MAX_PLAYERS) throw new GameError(`Phòng đã đủ ${MAX_PLAYERS} người.`);
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
          this.addLog(`${p.name} bỏ cuộc.`);
          this.eliminate(p);
        }
      }
      if (this.hostId === id) this.pickHost();
    });
    this.hooks.removed(id, this.code);
  }

  // ---------- bắt đầu / chơi lại ----------

  start(byId: string) {
    this.run(() => {
      if (byId !== this.hostId) throw new GameError('Chỉ chủ phòng mới bắt đầu được.');
      if (this.phase !== 'lobby') throw new GameError('Ván đã bắt đầu rồi.');
      const gone = this.players.filter((p) => !p.connected);
      this.players = this.players.filter((p) => p.connected);
      gone.forEach((p) => this.hooks.removed(p.id, this.code));
      if (this.players.length < MIN_PLAYERS) throw new GameError(`Cần ít nhất ${MIN_PLAYERS} người.`);

      const n = this.players.length;
      const pool: Card[] = [];
      for (const [type, count] of Object.entries(DECK_COUNTS) as [CardType, number][]) {
        if (type === 'defuse') continue;
        for (let i = 0; i < count; i++) pool.push(this.newCard(type));
      }
      shuffle(pool);

      for (const p of this.players) {
        p.alive = true;
        p.hand = [this.newCard('defuse'), ...pool.splice(0, HAND_SIZE)];
      }
      // Luật nhà: mỗi người 1 Gỡ Bom (đã chia ở trên), mỗi người 1 Mèo Nổ trong chồng bài
      for (let i = 0; i < EXTRA_DEFUSES_IN_DECK; i++) pool.push(this.newCard('defuse'));
      const bombs = bombCount(n);
      for (let i = 0; i < bombs; i++) pool.push(this.newCard('exploding'));
      this.deck = shuffle(pool);
      this.discard = [];
      this.pending = undefined;
      this.waiting = undefined;
      this.lastPlay = undefined;
      this.winnerId = undefined;
      this.log = [];
      this.phase = 'playing';
      this.addLog(`Bắt đầu! ${n} người, mỗi người 1 Gỡ Bom, ${bombs} Mèo Nổ trong chồng bài.`);
      this.startTurn(randomInt(n), 1);
    });
  }

  restart(byId: string) {
    this.run(() => {
      if (byId !== this.hostId) throw new GameError('Chỉ chủ phòng mới làm được.');
      if (this.phase !== 'ended') throw new GameError('Ván chưa kết thúc.');
      this.phase = 'lobby';
      this.deck = [];
      this.discard = [];
      this.turnDeadline = undefined;
      this.players = this.players.filter((p) => !p.left);
      this.pot = 0;
      this.paid = false;
      for (const p of this.players) {
        p.hand = [];
        p.alive = true;
      }
      this.addLog('Quay lại phòng chờ.');
    });
  }

  // ---------- hành động trong ván ----------

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
        this.toDiscard(p, played);
        this.pending.nopeCount++;
        this.lastPlay?.nopers.push(p.id);
        this.lastPlay?.nopeCardIds.push(played[0].id);
        this.pending.deadline = Date.now() + NOPE_WINDOW_MS;
        this.addLog(this.pending.nopeCount % 2 ? `${p.name} NOPE!` : `${p.name} NOPE lại cái Nope!`);
        return;
      }

      if (this.current()?.id !== playerId) throw new GameError('Chưa tới lượt bạn.');
      if (this.pending) throw new GameError('Đợi hành động trước xử lý xong đã.');

      const types = played.map((c) => c.type);
      let kind: ActionKind;
      if (played.length === 1 && SINGLE_ACTIONS.includes(types[0])) {
        kind = types[0] as ActionKind;
      } else if ((played.length === 2 || played.length === 3) && types.every((t) => t === types[0]) && CARD_INFO[types[0]].isCat) {
        kind = played.length === 2 ? 'pair' : 'triple';
      } else if (played.length === 5 && new Set(types).size === 5) {
        kind = 'five';
      } else {
        throw new GameError('Cách đánh này không hợp lệ.');
      }

      let target: Player | undefined;
      if (kind === 'favor' || kind === 'pair' || kind === 'triple') {
        target = req.targetId ? this.player(req.targetId) : undefined;
        if (!target || !target.alive || target.id === playerId) throw new GameError('Chọn một người chơi khác.');
        if (!target.hand.length) throw new GameError(`${target.name} hết bài rồi.`);
      }
      if (kind === 'triple' && (!req.namedType || !CARD_INFO[req.namedType] || req.namedType === 'exploding')) {
        throw new GameError('Chọn tên lá muốn lấy.');
      }
      if (kind === 'five' && (!req.discardType || req.discardType === 'exploding' || !this.discard.some((c) => c.type === req.discardType))) {
        throw new GameError('Chọn lá muốn lấy từ chồng bài bỏ.');
      }

      this.toDiscard(p, played);
      this.pending = {
        kind,
        actorId: playerId,
        targetId: target?.id,
        namedType: req.namedType,
        discardType: req.discardType,
        shuffleStyle: req.shuffleStyle && SHUFFLE_STYLES[req.shuffleStyle] ? req.shuffleStyle : 'riffle',
        cards: types,
        nopeCount: 0,
        deadline: Date.now() + NOPE_WINDOW_MS,
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

  // ---------- góc nhìn từng người ----------

  viewFor(id: string): RoomView {
    const w = this.waiting;
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        connected: p.connected,
        alive: p.alive,
        handCount: p.hand.length,
      })),
      hand: this.player(id)?.hand ?? [],
      currentPlayerId: this.phase === 'playing' ? this.current()?.id : undefined,
      turnsRemaining: this.turnsRemaining,
      turnDeadline: this.phase === 'playing' ? this.turnDeadline : undefined,
      deckCount: this.deck.length,
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
          : w,
      winnerId: this.winnerId,
      log: this.log,
      logTotal: this.logTotal,
      bet: this.bet,
      pot: this.pot,
    };
  }

  /** Ghi thêm 1 dòng nhật ký từ bên ngoài (vd: trả hũ xu) – gọi trong lúc đang broadcast */
  note(msg: string) {
    this.addLog(msg);
  }

  winner() {
    return this.winnerId;
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
    if (this.pending) {
      if (now >= this.pending.deadline) this.resolvePending();
      return;
    }
    const w = this.waiting;
    if (w) {
      if (now < w.deadline) return;
      if (w.kind === 'defuse_place') {
        this.doPlaceBomb(randomInt(this.deck.length + 1));
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
        const carry = this.turnsRemaining > 1 ? this.turnsRemaining : 0;
        const next = this.nextAliveIdx(this.currentIdx);
        this.startTurn(next, carry + 2);
        this.addLog(`${this.players[next].name} phải chơi ${carry + 2} lượt!`);
        break;
      }
      case 'skip':
        this.endOneTurn();
        break;
      case 'shuffle':
        shuffle(this.deck);
        const style = pd.shuffleStyle ?? 'riffle';
        this.hooks.fx(this, { type: 'shuffle', playerId: actor.id, style });
        this.addLog(`${SHUFFLE_STYLES[style].emoji} ${actor.name} xáo bài kiểu ${SHUFFLE_STYLES[style].name}.`);
        break;
      case 'see_future': {
        this.hooks.fx(this, { type: 'future', playerId: actor.id });
        const top3 = this.deck.slice(0, 3);
        const top = top3.map((c) => c.type);
        this.hooks.notify(actor.id, { kind: 'future', cards: top, cardIds: top3.map((c) => c.id), text: '3 lá trên cùng (trái = trên cùng)' });
        break;
      }
      case 'favor':
        if (target?.alive && target.hand.length) {
          this.waiting = { kind: 'favor_give', playerId: target.id, toId: actor.id, deadline: Date.now() + PROMPT_MS };
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
      case 'five': {
        const idx = this.discard.map((c) => c.type).lastIndexOf(pd.discardType!);
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

  private drawFor(p: Player) {
    const card = this.deck.shift();
    if (!card) {
      this.endOneTurn();
      return;
    }
    this.hooks.fx(this, { type: 'draw', playerId: p.id });
    if (card.type !== 'exploding') {
      p.hand.push(card);
      this.addLog(`${p.name} rút 1 lá.`);
      this.endOneTurn();
      return;
    }
    const defuse = p.hand.find((c) => c.type === 'defuse');
    if (defuse) {
      this.toDiscard(p, [defuse]);
      this.waiting = { kind: 'defuse_place', playerId: p.id, card, deadline: Date.now() + PROMPT_MS };
      this.hooks.fx(this, { type: 'defuse', playerId: p.id });
      this.addLog(`💣 ${p.name} rút trúng Mèo Nổ… và GỠ BOM thành công!`);
    } else {
      this.addLog(`💥 ${p.name} rút trúng Mèo Nổ và NỔ TUNG!`);
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
    else this.waiting = undefined;
  }

  private eliminate(p: Player) {
    const wasCurrent = this.current()?.id === p.id;
    this.discard.push(...p.hand);
    p.hand = [];
    p.alive = false;
    if (this.pending?.actorId === p.id) this.pending = undefined;
    if (this.waiting?.kind === 'favor_give' && this.waiting.toId === p.id) this.waiting = undefined;
    const alive = this.players.filter((x) => x.alive);
    if (alive.length <= 1) {
      this.phase = 'ended';
      this.winnerId = alive[0]?.id;
      this.pending = undefined;
      this.waiting = undefined;
      this.turnDeadline = undefined;
      this.addLog(alive[0] ? `🏆 ${alive[0].name} thắng!` : 'Hết ván.');
      return;
    }
    if (wasCurrent) this.startTurn(this.nextAliveIdx(this.currentIdx), 1);
  }

  private startTurn(idx: number, turns: number) {
    this.currentIdx = idx;
    this.turnsRemaining = turns;
    this.turnDeadline = Date.now() + TURN_MS;
  }

  private endOneTurn() {
    this.turnsRemaining--;
    if (this.turnsRemaining <= 0) this.startTurn(this.nextAliveIdx(this.currentIdx), 1);
    else this.turnDeadline = Date.now() + TURN_MS;
  }

  private extendTurnDeadline() {
    if (this.turnDeadline) this.turnDeadline = Math.max(this.turnDeadline, Date.now() + 20_000);
  }

  private nextAliveIdx(from: number) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
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
        return `${p.name} đánh đôi mèo, rút bài của ${target!.name}.`;
      case 'triple':
        return `${p.name} đánh bộ ba, đòi ${target!.name} đưa ${CARD_INFO[req.namedType!].name}.`;
      case 'five':
        return `${p.name} đánh 5 lá khác loại, muốn lấy ${CARD_INFO[req.discardType!].name} từ chồng bài bỏ.`;
      case 'favor':
        return `${p.name} đánh Xin Bài vào ${target!.name}.`;
      default:
        return `${p.name} đánh ${CARD_INFO[kind as CardType].name}.`;
    }
  }

  private addLog(msg: string) {
    this.log = [...this.log, msg].slice(-LOG_SIZE);
    this.logTotal++;
  }
}
