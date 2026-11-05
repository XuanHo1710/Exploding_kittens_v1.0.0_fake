/**
 * Nối Thú Đại Chiến – nối hình (thể loại hay gọi là "Pikachu"), 2–10 người đấu realtime (solo 1v1 khi chỉ 2 người).
 * Màn 1 đua dọn bàn, rồi cả phòng đánh liên hoàn 3 Boss: Vua Sấm Sét → Nữ Hoàng Nhện → Bạo Chúa.
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
/**
 * Đồng hồ chung cho cả 3 Boss (không tính lúc nghỉ giữa 2 Boss): Boss trước gục thì Boss sau ra ngay,
 * hạ nhanh thì dư giờ cho Boss sau. Hết giờ mà chưa hạ hết thì trận kết thúc.
 */
export const LINK_RAID_S = 360;
export const LINK_INTERMISSION_S = 5;
/** Nối cặp kế tiếp trong vòng 3 giây thì tính combo */
export const LINK_COMBO_WINDOW_S = 3;
/** Máu gốc của Boss với 2 người (mỗi Boss nhân thêm hệ số riêng) */
export const LINK_BOSS_HP = 3000;
export const LINK_MAX_PLAYERS = 10;
/** Máu gốc theo số người: 2 người 3000, mỗi người thêm +900 (6 người = 6600, 10 người = 10200) */
export const linkBossHp = (players: number) => LINK_BOSS_HP + 900 * Math.max(0, Math.min(LINK_MAX_PLAYERS, players) - 2);
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
/** Giây giữa 2 đòn của Boss đầu tiên theo giai đoạn 1 / 2 / 3 */
export const LINK_BOSS_SKILL_S = [12, 9, 6] as const;

export const LINK_FREEZE = { cells: 6, ms: 8000 } as const;
/** Mây Mù (chiêu Màn 1): che bàn 1 đối thủ */
export const LINK_FOG_MS = 4000;
export const LINK_BOSS_ICE = { cells: 4, ms: 6000 } as const;
export const LINK_BOSS_DARK_MS = 3000;
export const LINK_BOSS_WEB = { cells: 5, ms: 7000 } as const;
export const LINK_BOSS_COCOON = { cells: 12, ms: 8000 } as const;
export const LINK_BOSS_METEOR = { cells: 6, ms: 5000 } as const;
export const LINK_BOSS_VENOM_MS = 6000;
export const LINK_BOSS_QUAKE_THUNDER = 25;
/** Sét Đánh: giật điện vài ô của mọi người */
export const LINK_BOSS_BOLT = { cells: 4, ms: 5000 } as const;
/** Sét Lan: sét nhảy vào người đang dẫn đầu sát thương, mất combo */
export const LINK_BOSS_CHAIN = { cells: 9, ms: 6000 } as const;
/** Hút Sinh Lực: Boss hồi % máu tối đa */
export const LINK_BOSS_DRAIN = 0.05;
/** Gầm Thét: mọi người choáng, không nối được */
export const LINK_BOSS_ROAR_MS = 2500;
/** Khiên Đá: % máu tối đa */
export const LINK_BOSS_SHIELD = 0.06;
/** Đảo Bàn (chiêu người chơi): tự đảo bàn mình, hồi chiêu 1 phút (đầu trận cũng phải chờ 1 phút) */
export const LINK_SHUFFLE_CD_S = 60;

export type LinkBossId = 'thunder' | 'spider' | 'tyrant';
export type LinkBossSkill =
  | 'ice' | 'dark' | 'bolt' | 'chain'
  | 'web' | 'venom' | 'cocoon' | 'drain'
  | 'meteor' | 'quake' | 'shield' | 'roar';
/** Loại ô bị khoá: 0 băng, 1 tơ nhện, 2 lửa, 3 điện giật */
export type LinkLock = 0 | 1 | 2 | 3;

export interface LinkBossDef {
  id: LinkBossId;
  name: string;
  emoji: string;
  /** hệ số máu so với linkBossHp */
  hpMul: number;
  /** chiêu ra lần lượt (xoay vòng) */
  skills: LinkBossSkill[];
  /** giây giữa 2 đòn theo giai đoạn 1 / 2 / 3 */
  skillS: readonly [number, number, number];
}

/** 3 Boss đánh lần lượt (Boss cuối là trùm) */
export const LINK_BOSSES: readonly LinkBossDef[] = [
  { id: 'thunder', name: 'Vua Sấm Sét', emoji: '⚡', hpMul: 0.7, skills: ['bolt', 'ice', 'chain', 'dark'], skillS: LINK_BOSS_SKILL_S },
  { id: 'spider', name: 'Nữ Hoàng Nhện', emoji: '🕷️', hpMul: 1, skills: ['web', 'venom', 'cocoon', 'drain'], skillS: [11, 8, 6] },
  {
    id: 'tyrant', name: 'Bạo Chúa', emoji: '👹', hpMul: 1.4,
    skills: ['meteor', 'quake', 'bolt', 'shield', 'ice', 'roar', 'dark', 'venom'], skillS: [10, 7, 5],
  },
];
export const LINK_BOSS_SKILL_NAME: Record<LinkBossSkill, string> = {
  ice: 'Mưa Băng', dark: 'Bóng Tối', bolt: 'Sét Đánh', chain: 'Sét Lan',
  web: 'Lưới Tơ', venom: 'Nọc Độc', cocoon: 'Kén Tơ', drain: 'Hút Sinh Lực',
  meteor: 'Thiên Thạch', quake: 'Động Đất', shield: 'Khiên Đá', roar: 'Gầm Thét',
};
/** Máu của Boss thứ `no` (0, 1, 2) theo số người */
export const linkBossMaxHp = (no: number, players: number) => Math.round(linkBossHp(players) * (LINK_BOSSES[no]?.hpMul ?? 1));

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
  /** số máy thêm vào cho đủ người (tổng người + máy: 2–10) */
  bots: number;
}
export const DEFAULT_LINK_CONFIG: LinkConfig = { botLevel: 'normal', bots: 0 };
export const LINK_BOT_LABEL: Record<LinkBotLevel, string> = { easy: 'Dễ', normal: 'Thường', hard: 'Khó' };

/** humans: số người trong phòng – số máy bị giới hạn để tổng không quá LINK_MAX_PLAYERS (10), và có ít nhất 1 máy khi chỉ có 1 người */
export function normalizeLinkConfig(raw: unknown, humans = 1): LinkConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<LinkConfig>;
  const botLevel = r.botLevel === 'easy' || r.botLevel === 'hard' || r.botLevel === 'normal' ? r.botLevel : 'normal';
  const h = Math.max(1, Math.min(LINK_MAX_PLAYERS, Math.floor(humans) || 1));
  const n = Math.floor(Number(r.bots));
  const bots = Math.max(h < 2 ? 1 : 0, Math.min(LINK_MAX_PLAYERS - h, Number.isFinite(n) ? n : 0));
  return { botLevel, bots };
}

export type LinkSkill = 'freeze' | 'fog';

export type LinkCommand =
  | { t: 'match'; a: number; b: number }
  | { t: 'hint' }
  /** target: id người bị đánh (bỏ trống = người đang dẫn đầu) */
  | { t: 'skill'; kind: LinkSkill; target?: string }
  | { t: 'super' }
  /** Đảo Bàn: tự đảo bàn mình, hồi chiêu 1 phút */
  | { t: 'shuffle' }
  | { t: 'resign' };

/** Hiệu ứng mới để client vẽ (server chỉ báo, không tính gì thêm) */
export type LinkFx =
  /** path: các điểm gấp khúc, mỗi điểm là [x, y] trong lưới có viền (-1..W, -1..H) */
  | { k: 'match'; who: string; a: number; b: number; kind: number; path: [number, number][]; combo: number; pts: number }
  | { k: 'hit'; who: string; a: number; b: number; dmg: number; long: boolean; combo: number }
  | { k: 'super'; who: string; dmg: number }
  | { k: 'skill'; from: string; to: string; kind: LinkSkill }
  /** to: người bị nhắm riêng (Kén Tơ) */
  | { k: 'boss'; boss: LinkBossId; kind: LinkBossSkill | 'rage'; phase: number; to?: string }
  | { k: 'shuffle'; who: string }
  | { k: 'clear'; who: string }
  | { k: 'ko'; who: string }
  | { k: 'miss'; who: string; a: number; b: number };

export interface LinkMe {
  cells: number[];
  /** [ô, ms còn khoá, loại khoá] */
  ice: [number, number, LinkLock][];
  /** ms còn bị Bóng Tối che bàn */
  dark: number;
  score1: number;
  damage: number;
  combo: number;
  thunder: number;
  hintIn: number;
  hint?: [number, number];
  /** ms nữa thì Đảo Bàn hồi xong (0 = dùng được) */
  shuffleIn: number;
  /** ms còn trúng Nọc Độc */
  venom: number;
  /** ms còn bị choáng (Gầm Thét): chưa nối được */
  stun: number;
  /** số Boss mình đã kết liễu */
  kos: number;
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
  /** số Boss đã kết liễu */
  kos: number;
  /** đã bỏ cuộc / rời trận */
  out: boolean;
}

export interface LinkStatePlayer extends LinkFoe {
  cells: number[];
}

export interface LinkBossView {
  id: LinkBossId;
  /** thứ tự Boss (0, 1, 2) */
  no: number;
  hp: number;
  shield: number;
  maxShield: number;
  /** ms còn lại của đồng hồ đánh Boss (lúc nghỉ giữa 2 Boss vẫn biết còn bao nhiêu) */
  raidLeft: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  nextSkillIn: number;
  nextSkill: LinkBossSkill;
}

export interface LinkResult {
  winnerId?: string;
  totals: Record<string, number>;
  /** người kết liễu Boss cuối (Bạo Chúa) */
  ko?: string;
  /** số Boss cả phòng đã hạ */
  bossesDown: number;
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
