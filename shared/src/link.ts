/**
 * Nối Thú Đại Chiến – nối hình (thể loại hay gọi là "Pikachu"), 2–6 người đấu realtime (solo 1v1 khi chỉ 2 người).
 * Màn 1 đua dọn bàn, Màn 2 cả phòng cùng đấm Boss Vua Sấm Sét.
 * Ô dùng emoji con vật (font hệ thống) – không dùng nhân vật có bản quyền.
 * File này dùng chung cho server (luật) và client (vẽ, HUD).
 */

export const LINK_W = 16;
export const LINK_H = 9;
export const LINK_CELLS = LINK_W * LINK_H;
export const LINK_KINDS = 36;
/** Đường nối được gấp khúc tối đa 2 lần (tức 3 đoạn thẳng) */
export const LINK_MAX_TURNS = 2;

export const LINK_STAGE1_S = 150;
export const LINK_STAGE2_S = 180;
export const LINK_INTERMISSION_S = 5;
/** Nối cặp kế tiếp trong vòng 3 giây thì tính combo */
export const LINK_COMBO_WINDOW_S = 3;
export const LINK_BOSS_HP = 4000;
export const LINK_MAX_PLAYERS = 6;
/** Máu Boss theo số người: 2 người 4000, mỗi người thêm +1250 (6 người = 9000) */
export const linkBossHp = (players: number) => LINK_BOSS_HP + 1250 * Math.max(0, Math.min(LINK_MAX_PLAYERS, players) - 2);
/** Số lệnh tối đa mỗi giây (chống bot ngoài / spam) */
export const LINK_CMD_RATE = 8;
export const LINK_HINT_CD_S = 15;
export const LINK_HINT_COST = 5;
export const LINK_KO_BONUS = 500;
export const LINK_CLEAR_BONUS = 300;
export const LINK_CLEAR_PER_S = 20;
export const LINK_SUPER_DMG = 400;
export const LINK_THUNDER_PER_PAIR = 8;
/** Đường nối dài hơn số ô này là "Cú Đấm Xa" (+20 sát thương) */
export const LINK_LONG_PATH = 10;
/** Giây giữa 2 đòn của boss theo giai đoạn 1 / 2 / 3 */
export const LINK_BOSS_SKILL_S = [12, 9, 6] as const;

export const LINK_FREEZE = { cells: 6, ms: 8000 } as const;
export const LINK_BOSS_ICE = { cells: 4, ms: 6000 } as const;
export const LINK_BOSS_DARK_MS = 3000;

/** Điểm Màn 1 của 1 cặp (combo = số cặp liên tiếp trước đó: 0, 1, 2…) */
export const linkPairPoints = (combo: number) => 10 + 5 * Math.min(combo, 6);
/** Sát thương Màn 2 của 1 cặp */
export const linkPairDamage = (combo: number, long: boolean) => Math.round(25 * (1 + 0.15 * Math.min(combo, 6))) + (long ? 20 : 0);
/** Sấm nạp được sau 1 cặp */
export const linkThunderGain = (combo: number) => LINK_THUNDER_PER_PAIR + 2 * Math.min(combo, 6);
export const linkIdx = (x: number, y: number) => y * LINK_W + x;

export interface LinkCritter {
  id: number;
  name: string;
  /** hình hiển thị trên ô (emoji con vật – mỗi con một dáng riêng, rất dễ phân biệt) */
  emoji: string;
  /** màu chủ đạo (hạt nổ, viền) */
  color: string;
}

/** 36 con vật, chọn sao cho không con nào giống con nào (không lấy 2 con cùng dáng / cùng màu) */
export const LINK_CRITTERS: LinkCritter[] = ([
  ['Cún', '🐶', '#c68642'], ['Mèo', '🐱', '#ffb84d'], ['Chuột', '🐭', '#adb5bd'], ['Thỏ', '🐰', '#f8f9fa'], ['Cáo', '🦊', '#fd7e14'], ['Gấu', '🐻', '#8d5524'],
  ['Gấu Trúc', '🐼', '#343a40'], ['Koala', '🐨', '#868e96'], ['Hổ', '🐯', '#f76707'], ['Sư Tử', '🦁', '#fab005'], ['Bò', '🐮', '#f1f3f5'], ['Heo', '🐷', '#faa2c1'],
  ['Ếch', '🐸', '#51cf66'], ['Khỉ', '🐵', '#a0522d'], ['Gà', '🐔', '#fa5252'], ['Cánh Cụt', '🐧', '#212529'], ['Gà Con', '🐤', '#ffd43b'], ['Vịt', '🦆', '#2f9e44'],
  ['Cú', '🦉', '#9c6644'], ['Kỳ Lân', '🦄', '#e599f7'], ['Ong', '🐝', '#fcc419'], ['Bọ Rùa', '🐞', '#e03131'], ['Bướm', '🦋', '#339af0'], ['Ốc Sên', '🐌', '#d9a066'],
  ['Rùa', '🐢', '#2b8a3e'], ['Rắn', '🐍', '#94d82d'], ['Bạch Tuộc', '🐙', '#e64980'], ['Cua', '🦀', '#f03e3e'], ['Cá Cảnh', '🐠', '#ff922b'], ['Cá Heo', '🐬', '#4dabf7'],
  ['Cá Mập', '🦈', '#748ffc'], ['Voi', '🐘', '#909296'], ['Hươu Cao Cổ', '🦒', '#e8a33d'], ['Ngựa Vằn', '🦓', '#495057'], ['Nhím', '🦔', '#a47148'], ['Vẹt', '🦜', '#37b24d'],
] as const).map(([name, emoji, color], id) => ({ id, name, emoji, color }));

export type LinkStage = 'stage1' | 'intermission' | 'stage2' | 'ended';
export type LinkBotLevel = 'easy' | 'normal' | 'hard';

export interface LinkConfig {
  botLevel: LinkBotLevel;
  /** số máy thêm vào cho đủ người (tổng người + máy: 2–6) */
  bots: number;
}
export const DEFAULT_LINK_CONFIG: LinkConfig = { botLevel: 'normal', bots: 0 };
export const LINK_BOT_LABEL: Record<LinkBotLevel, string> = { easy: 'Dễ', normal: 'Thường', hard: 'Khó' };

/** humans: số người trong phòng – số máy bị giới hạn để tổng không quá 6, và có ít nhất 1 máy khi chỉ có 1 người */
export function normalizeLinkConfig(raw: unknown, humans = 1): LinkConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LinkConfig>;
  const botLevel = r.botLevel === 'easy' || r.botLevel === 'hard' || r.botLevel === 'normal' ? r.botLevel : 'normal';
  const h = Math.max(1, Math.min(LINK_MAX_PLAYERS, Math.floor(humans) || 1));
  const n = Math.floor(Number(r.bots));
  const bots = Math.max(h < 2 ? 1 : 0, Math.min(LINK_MAX_PLAYERS - h, Number.isFinite(n) ? n : 0));
  return { botLevel, bots };
}

export type LinkSkill = 'freeze' | 'storm';
export type LinkBossSkill = 'ice' | 'dark' | 'shuffle';

export type LinkCommand =
  | { t: 'match'; a: number; b: number }
  | { t: 'hint' }
  /** target: id người bị đánh (bỏ trống = người đang dẫn đầu) */
  | { t: 'skill'; kind: LinkSkill; target?: string }
  | { t: 'super' }
  | { t: 'resign' };

/** Hiệu ứng mới để client vẽ (server chỉ báo, không tính gì thêm) */
export type LinkFx =
  /** path: các điểm gấp khúc, mỗi điểm là [x, y] trong lưới có viền (-1..W, -1..H) */
  | { k: 'match'; who: string; a: number; b: number; kind: number; path: [number, number][]; combo: number; pts: number }
  | { k: 'hit'; who: string; a: number; b: number; dmg: number; long: boolean; combo: number }
  | { k: 'super'; who: string; dmg: number }
  | { k: 'skill'; from: string; to: string; kind: LinkSkill }
  | { k: 'boss'; kind: LinkBossSkill | 'rage'; phase: number }
  | { k: 'clear'; who: string }
  | { k: 'ko'; who: string }
  | { k: 'miss'; who: string; a: number; b: number };

export interface LinkMe {
  cells: number[];
  /** [ô, ms còn băng] */
  ice: [number, number][];
  /** ms còn bị Bóng Tối che bàn */
  dark: number;
  score1: number;
  damage: number;
  combo: number;
  thunder: number;
  hintIn: number;
  hint?: [number, number];
}

export interface LinkFoe {
  id: string;
  name: string;
  bot: boolean;
  /** 144 số 0/1: ô còn hình hay đã trống (không lộ loại thú) */
  filled: number[];
  /** ô đang băng */
  ice: number[];
  score1: number;
  damage: number;
  combo: number;
  thunder: number;
  /** đã bỏ cuộc / rời trận */
  out: boolean;
}

export interface LinkStatePlayer extends LinkFoe {
  cells: number[];
}

export interface LinkBossView {
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  nextSkillIn: number;
  nextSkill: LinkBossSkill;
}

export interface LinkResult {
  winnerId?: string;
  totals: Record<string, number>;
  ko?: string;
  reason: string;
}

export interface LinkState {
  stage: LinkStage;
  /** ms còn lại của màn hiện tại */
  left: number;
  /** đếm số lần gửi để client bỏ gói cũ */
  seq: number;
  me?: LinkMe;
  /** các đối thủ (không lộ loại thú trên bàn) */
  foes?: LinkFoe[];
  /** chỉ người xem nhận */
  players?: LinkStatePlayer[];
  boss?: LinkBossView;
  fx: LinkFx[];
  result?: LinkResult;
}

export interface LinkRoomView {
  config: LinkConfig;
  stage?: LinkStage;
  startedAt?: number;
  players?: { id: string; name: string; bot: boolean }[];
  result?: LinkResult;
}
