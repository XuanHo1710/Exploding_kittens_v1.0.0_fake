import type { Card, CardType } from './cards';
import type { BlackjackEval, PlayingCard, TienLenCombo } from './playing-cards';
import type { RoomRules } from './room-rules';

export type Phase = 'lobby' | 'playing' | 'ended';

export type GameMode = 'exploding_kittens' | 'blackjack_21' | 'tien_len';

export const GAME_MODES: Record<
  GameMode,
  { name: string; shortName: string; emoji: string; minPlayers: number; maxPlayers: number; desc: string }
> = {
  exploding_kittens: {
    name: 'Mèo Nổ (Exploding Kittens)',
    shortName: 'Mèo Nổ',
    emoji: '🐱💣',
    minPlayers: 2,
    maxPlayers: 10,
    desc: 'Tránh Mèo Nổ, dùng Gỡ Bom, Nope và 29 lá chức năng để sống sót cuối cùng.',
  },
  blackjack_21: {
    name: 'Rút Bài 21 (Xì Dách)',
    shortName: 'Xì Dách 21',
    emoji: '🃏21',
    minPlayers: 2,
    maxPlayers: 10,
    desc: 'Bài Tây 52 lá: Rút bài sát 21 điểm, ăn thua với Nhà Cái – Xì Bàng ăn ×3, Xì Dách & Ngũ Linh ăn ×2!',
  },
  tien_len: {
    name: 'Tiến Lên Miền Nam (4 Người)',
    shortName: 'Tiến Lên',
    emoji: '🎴♠️',
    minPlayers: 2,
    maxPlayers: 4,
    desc: 'Bài Tây 52 lá chuẩn 4 người (13 lá/người): Đánh Sảnh, Đôi thông, Tứ Quý chặt Heo ăn xu!',
  },
};

export interface BlackjackPlayerView {
  playerId: string;
  isDealer: boolean;
  status: 'playing' | 'stood' | 'busted' | 'revealed';
  handCount: number;
  /** Chỉ hiện bài thật khi là chính mình, hoặc khi đã bị xét bài / kết thúc ván */
  cards?: PlayingCard[];
  eval?: BlackjackEval;
  doubled?: boolean;
  betAmount: number;
  outcome?: 'win' | 'lose' | 'push';
  outcomeText?: string;
  coinDelta?: number;
}

export interface BlackjackRoomView {
  dealerId: string;
  deckCount: number;
  hand: PlayingCard[];
  myEval: BlackjackEval;
  players: BlackjackPlayerView[];
}

export interface TienLenRoomView {
  hand: PlayingCard[];
  tableCombo?: TienLenCombo;
  lastActorId?: string;
  passedIds: string[];
  firstTurnOfMatch: boolean;
  mustIncludeLowest?: string;
  chopLog?: string;
  instantWinText?: string;
  finishOrder: string[];
}

export type ActionKind =
  | 'attack'
  | 'targeted_attack'
  | 'personal_attack'
  | 'skip'
  | 'super_skip'
  | 'reverse'
  | 'draw_bottom'
  | 'catomic_bomb'
  | 'swap_top_bottom'
  | 'bury'
  | 'garbage_collection'
  | 'shuffle'
  | 'see_future'
  | 'alter_future'
  | 'share_future'
  | 'dig_deeper'
  | 'favor'
  | 'mark'
  | 'grave_robber'
  | 'clone'
  | 'pair'
  | 'triple'
  | 'five';

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  alive: boolean;
  handCount: number;
  /** Đã rời phòng hoặc bị kích giữa ván */
  left?: boolean;
  /** Đã đồng ý phiên bản luật hiện tại trong phòng chờ. Chủ phòng tự đồng ý. */
  ready?: boolean;
  /** "cat:<seed>" = mèo vẽ sẵn, "/avatars/<file>" = ảnh đã tải lên */
  avatar?: string;
  /** Số xu (chỉ có khi người chơi đã có tài khoản) */
  coins?: number;
}

/** Thông tin tài khoản (xu ảo, không phải tiền thật) */
export interface AccountInfo {
  playerId: string;
  name: string;
  avatar?: string;
  coins: number;
  games: number;
  wins: number;
  canClaimDaily: boolean;
}
/** Các mức cược xu chủ phòng được chọn (0 = chơi miễn phí) */
export const BET_OPTIONS = [0, 50, 100, 200, 500, 1000] as const;

/** Avatar hợp lệ: mèo vẽ theo seed hoặc ảnh đã tải lên server */
export function isValidAvatar(a: unknown): a is string {
  return typeof a === 'string' && (/^cat:[\w-]{1,40}$/.test(a) || /^\/avatars\/[\w.-]{1,120}$/.test(a));
}

/** Hành động đang chờ hết thời gian Nope */
export interface PendingView {
  kind: ActionKind;
  actorId: string;
  targetId?: string;
  cards: CardType[];
  nopeCount: number;
  deadline: number;
}

/** Game đang đợi một người làm gì đó */
export type WaitingView =
  /** bury = Chôn Bài: nhét lại lá vừa rút (không phải Mèo Nổ do Gỡ Bom) */
  | { kind: 'defuse_place'; playerId: string; deckCount: number; deadline: number; bury?: boolean }
  /** Đào Sâu: đã xem lá trên cùng, chọn giữ hay rút lá kế tiếp. card chỉ gửi cho người đang chọn */
  | { kind: 'dig_choice'; playerId: string; card?: Card; canDig: boolean; deadline: number }
  /** Thu Gom Rác / Trộm Mộ: những người trong pendingIds phải tự chọn 1 lá xáo vào chồng rút */
  | { kind: 'return_card'; playerId: string; source: 'garbage' | 'grave'; pendingIds: string[]; deadline: number }
  | { kind: 'favor_give'; playerId: string; toId: string; deadline: number }
  | { kind: 'alter_future'; playerId: string; count: number; cards?: Card[]; deadline: number }
  /** Cướp Nhắm / Đôi: người cướp chọn 1 trong `count` lá úp của đối phương */
  | { kind: 'steal_pick'; playerId: string; targetId: string; via: 'mark' | 'pair'; count: number; deadline: number };

/** Lần đánh bài gần nhất, hiện ở giữa bàn cho mọi người cùng thấy */
export interface LastPlay {
  id: number;
  kind: ActionKind;
  actorId: string;
  targetId?: string;
  cards: CardType[];
  /** id từng lá (để giữ đúng tranh biến thể khi lá rời tay) */
  cardIds: string[];
  /** Những người đã đánh Nope, theo thứ tự */
  nopers: string[];
  nopeCardIds: string[];
  /** Loại lá Nope theo thứ tự (Nope / Siêu Nope) */
  nopeCardTypes?: CardType[];
  result?: 'done' | 'noped' | 'cancelled';
}

export interface RoomView {
  code: string;
  gameMode: GameMode;
  rules: RoomRules;
  rulesVersion: number;
  phase: Phase;
  hostId: string;
  players: PublicPlayer[];
  hand: Card[];
  currentPlayerId?: string;
  turnsRemaining: number;
  turnDeadline?: number;
  deckCount: number;
  discardTop?: CardType;
  discardTopId?: string;
  discardTypes: CardType[];
  pending?: PendingView;
  lastPlay?: LastPlay;
  waiting?: WaitingView;
  winnerId?: string;
  /** 40 dòng gần nhất */
  log: string[];
  /** Tổng số dòng đã ghi từ đầu ván (để client biết có bao nhiêu dòng mới) */
  logTotal: number;
  /** Mức cược mỗi người (xu) và hũ của ván đang chơi */
  bet: number;
  pot: number;
  /** Trạng thái riêng cho Xì Dách 21 */
  blackjack?: BlackjackRoomView;
  /** Trạng thái riêng cho Tiến Lên Miền Nam */
  tienLen?: TienLenRoomView;
  /** Thưởng xu từng người sau ván */
  payouts?: Record<string, number>;
}

/** Kiểu xáo bài: kết quả đều ngẫu nhiên hoàn toàn, chỉ khác hiệu ứng */
export type ShuffleStyle = 'riffle' | 'overhand' | 'pile';
export const SHUFFLE_STYLES: Record<ShuffleStyle, { name: string; emoji: string; desc: string }> = {
  riffle: { name: 'Riffle', emoji: '🌀', desc: 'Tách đôi chồng bài, đan 2 nửa vào nhau như dân chuyên.' },
  overhand: { name: 'Xáo tay', emoji: '🤲', desc: 'Bốc từng tập nhỏ từ dưới lên trên, xáo kiểu bàn nhậu.' },
  pile: { name: 'Chia đống', emoji: '🃏', desc: 'Chia bài ra 4 đống rồi gom lại theo thứ tự ngẫu nhiên.' },
};

export interface PlayRequest {
  cardIds: string[];
  targetId?: string;
  /** Bộ ba: tên lá muốn lấy */
  namedType?: CardType;
  /** 5 lá khác nhau: lá muốn lấy từ chồng bài bỏ */
  discardType?: CardType;
  /** Xáo Bài: kiểu xáo */
  shuffleStyle?: ShuffleStyle;
}

export interface PrivateNotice {
  kind: 'future' | 'received' | 'lost';
  cards: CardType[];
  cardIds?: string[];
  text: string;
}

/** Sự kiện hiệu ứng gửi cho cả phòng (để mọi người thấy chuyện gì vừa xảy ra) */
export type GameFx =
  | { type: 'draw'; playerId: string }
  | { type: 'shuffle'; playerId: string; style: ShuffleStyle }
  | { type: 'future'; playerId: string }
  | { type: 'transfer'; from: string; to: string; via: 'favor' | 'pair' | 'triple' | 'five' | 'mark' }
  | { type: 'insert'; playerId: string }
  | { type: 'defuse'; playerId: string }
  | { type: 'explode'; playerId: string };

/** Biểu cảm thả trên ghế mình */
export const EMOTES = ['😂', '🤣', '😜', '😏', '🤡', '😱', '😭', '💀', '🔥', '👏', '🙏', '😤', '🫵', '🤫', '😴', '🐱'] as const;
/** Đồ ném vào người khác */
export const THROWABLES = ['🍅', '🥚', '🧱', '🩴', '💩', '🐟', '💣', '🌹', '💋'] as const;

export interface Emote {
  from: string;
  emoji: string;
  /** Có thì là ném vào người này */
  to?: string;
}

export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  avatar?: string;
  text: string;
  at: number;
}
export const CHAT_MAX_LEN = 200;
/** 6 biểu cảm bấm nhanh */
export const QUICK_EMOTES = ['😂', '🤡', '😱', '🔥', '👏', '💀'] as const;

export interface Identity {
  playerId: string;
  name: string;
  avatar?: string;
  /** token đăng nhập (có sau khi tạo tài khoản / đăng nhập bằng PIN) */
  token?: string;
}
