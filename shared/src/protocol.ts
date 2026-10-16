import type { Card, CardType } from './cards';

export type Phase = 'lobby' | 'playing' | 'ended';

export type ActionKind =
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see_future'
  | 'pair'
  | 'triple'
  | 'five';

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  alive: boolean;
  handCount: number;
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
  | { kind: 'defuse_place'; playerId: string; deckCount: number; deadline: number }
  | { kind: 'favor_give'; playerId: string; toId: string; deadline: number };

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
  result?: 'done' | 'noped';
}

export interface RoomView {
  code: string;
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
  /** 5 lá khác loại: lá muốn lấy từ chồng bài bỏ */
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
  | { type: 'transfer'; from: string; to: string; via: 'favor' | 'pair' | 'triple' | 'five' }
  | { type: 'insert'; playerId: string }
  | { type: 'defuse'; playerId: string }
  | { type: 'explode'; playerId: string };

/** Biểu cảm thả trên ghế mình */
export const EMOTES = ['😂', '🤣', '😜', '😏', '🤡', '😱', '😭', '💀', '🔥', '👏', '🙏', '😤', '🫵', '🤫', '😴', '🐱'] as const;
/** Đồ ném vào người khác */
export const THROWABLES = ['🍅', '🥚', '🩴', '💩', '🐟', '💣', '🌹', '💋'] as const;

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
