/**
 * Đế Chế Kiến – chiến thuật thời gian thực, tối đa 10 đế chế (người + máy).
 * Lối chơi: nhận vàng mỗi 1 phút (càng về sau càng nhiều) → chọn 1 ô kiến là trại tự nở loại đó liên tục (trừ vàng từng con khi bắt đầu nở)
 * → đẩy quân phá 3 trụ của địch. Mỗi đế chế có 1 Trụ Chính + 2 Trụ Phụ, mỗi phát đạn hạ gọn 1 con kiến, hồi 5 giây.
 * File này dùng chung cho server (mô phỏng) và client (vẽ, nút bấm, giá tiền).
 */

/** Mô phỏng 10 nhịp/giây, client nội suy giữa 2 nhịp cho mượt */
export const ANTS_TICK_MS = 100;
export const ANTS_MAX_EMPIRES = 10;
export const ANTS_START_GOLD = 500;
/** Giây giữa 2 lần cấp vàng */
export const ANTS_INCOME_EVERY_S = 60;
/** Lần cấp vàng thứ n (bắt đầu từ 1): 225, 300, 375, … */
export const antsIncome = (n: number) => 150 + 75 * n;
/** Giới hạn quân cùng lúc (theo dân số) */
export const ANTS_MAX_POP = 50;
export const ANTS_MAX_QUEUE = 20;

export type AntUnitKind = 'soldier' | 'fire' | 'spitter' | 'flier' | 'shield' | 'sniper' | 'medic' | 'bomber' | 'tank' | 'champion';
export type AntTowerKind = 'main' | 'side';

/** Thứ tự mã số gửi qua mạng = thứ tự ô trong danh sách quân */
export const UNIT_KINDS: AntUnitKind[] = ['soldier', 'fire', 'spitter', 'flier', 'shield', 'sniper', 'medic', 'bomber', 'tank', 'champion'];
export const TOWER_KINDS: AntTowerKind[] = ['main', 'side'];

export interface AntUnitStats {
  name: string;
  desc: string;
  cost: number;
  /** giây nở */
  time: number;
  pop: number;
  hp: number;
  atk: number;
  /** giây giữa 2 đòn */
  cd: number;
  /** tầm đánh tính từ mép thân (0 = cận chiến) */
  range: number;
  speed: number;
  radius: number;
  sight: number;
  hotkey: string;
  /** bay qua đá */
  fly?: boolean;
  /** sát thương lan quanh mục tiêu */
  splash?: number;
  /** nhân sát thương lên trụ */
  siege?: number;
  /** hồi máu đồng đội mỗi giây */
  heal?: number;
}

export const ANT_UNITS: Record<AntUnitKind, AntUnitStats> = {
  soldier: {
    name: 'Kiến Lính', desc: 'Lính cận chiến cơ bản, rẻ và chắc.',
    cost: 50, time: 2, pop: 1, hp: 120, atk: 12, cd: 1, range: 0, speed: 76, radius: 8, sight: 200, hotkey: '1',
  },
  fire: {
    name: 'Kiến Lửa', desc: 'Chạy rất nhanh, cắn liên tục nhưng máu mỏng.',
    cost: 60, time: 2, pop: 1, hp: 80, atk: 9, cd: 0.55, range: 0, speed: 108, radius: 7, sight: 200, hotkey: '2',
  },
  spitter: {
    name: 'Kiến Phun Axit', desc: 'Phun axit từ xa (tầm 150).',
    cost: 90, time: 3, pop: 1, hp: 70, atk: 14, cd: 1.4, range: 150, speed: 70, radius: 8, sight: 230, hotkey: '3',
  },
  flier: {
    name: 'Kiến Cánh', desc: 'Bay qua đá, nhanh, nhìn xa – do thám và đánh úp.',
    cost: 80, time: 3, pop: 1, hp: 60, atk: 8, cd: 0.9, range: 0, speed: 140, radius: 7, sight: 300, hotkey: '4', fly: true,
  },
  shield: {
    name: 'Kiến Khiên', desc: 'Máu rất trâu, đi đầu đỡ đòn cho cả đội.',
    cost: 120, time: 4, pop: 1, hp: 340, atk: 8, cd: 1.2, range: 0, speed: 60, radius: 11, sight: 190, hotkey: '5',
  },
  sniper: {
    name: 'Kiến Bắn Tỉa', desc: 'Bắn cực xa (tầm 260), một phát đau.',
    cost: 150, time: 4, pop: 1, hp: 60, atk: 32, cd: 2.5, range: 260, speed: 62, radius: 8, sight: 300, hotkey: '6',
  },
  medic: {
    name: 'Kiến Y Tá', desc: 'Không đánh, hồi máu cho đồng đội xung quanh.',
    cost: 140, time: 4, pop: 1, hp: 90, atk: 0, cd: 1, range: 120, speed: 72, radius: 8, sight: 220, hotkey: '7', heal: 14,
  },
  bomber: {
    name: 'Kiến Bom Độc', desc: 'Ném bom độc nổ lan, mạnh khi địch đứng dồn cục.',
    cost: 180, time: 4, pop: 1, hp: 90, atk: 22, cd: 2, range: 130, speed: 64, radius: 9, sight: 230, hotkey: '8', splash: 55,
  },
  tank: {
    name: 'Kiến Đầu Đạn', desc: 'Khổng lồ, chuyên phá trụ (×3 sát thương lên trụ).',
    cost: 220, time: 5, pop: 2, hp: 520, atk: 30, cd: 1.8, range: 0, speed: 50, radius: 13, sight: 200, hotkey: '9', siege: 3,
  },
  champion: {
    name: 'Kiến Chúa Chiến', desc: 'Chiến binh huyền thoại: máu khủng, chém lan.',
    cost: 450, time: 8, pop: 4, hp: 1500, atk: 45, cd: 1.2, range: 0, speed: 58, radius: 16, sight: 240, hotkey: '0', splash: 40, siege: 1.5,
  },
};

export interface AntTowerStats {
  name: string;
  hp: number;
  radius: number;
  sight: number;
  range: number;
  /** giây hồi đạn */
  cd: number;
  /** tốc độ bay của đạn */
  bulletSpeed: number;
}

/**
 * Mỗi phát đạn của trụ hạ gọn 1 con kiến, hồi 5 giây.
 * Tầm bắn = tầm nhìn, và phải xa hơn tầm đánh (range + radius + 2) của mọi loại kiến (xa nhất: Bắn Tỉa 270)
 * để không con nào đánh được trụ mà đứng ngoài tầm trụ.
 */
export const ANT_TOWERS: Record<AntTowerKind, AntTowerStats> = {
  main: { name: 'Trụ Chính', hp: 2200, radius: 42, sight: 360, range: 360, cd: 5, bulletSpeed: 380 },
  side: { name: 'Trụ Phụ', hp: 1100, radius: 28, sight: 320, range: 320, cd: 5, bulletSpeed: 460 },
};

/** 10 màu đế chế dễ phân biệt trên nền đất */
export const EMPIRE_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f2c200', '#0ca5a5', '#e03174', '#7048e8', '#f08c00', '#495057'];
export const EMPIRE_NAMES_BOT = ['Kiến Lửa', 'Kiến Vàng', 'Kiến Đen', 'Kiến Riện', 'Kiến Cắn Lá', 'Kiến Thợ Dệt', 'Kiến Quân Đội', 'Kiến Mật', 'Kiến Gai', 'Kiến Sét'];

export interface AntsConfig {
  /** Số đế chế máy */
  bots: number;
  /** 0 = không giới hạn, hết giờ ai điểm cao nhất thắng */
  minutes: number;
  /** Máy dễ / thường / khó */
  botLevel: 'easy' | 'normal' | 'hard';
}
export const DEFAULT_ANTS_CONFIG: AntsConfig = { bots: 1, minutes: 30, botLevel: 'normal' };
export const ANTS_MINUTE_OPTIONS = [0, 10, 15, 20, 30, 45];

export function normalizeAntsConfig(raw: unknown, humans: number): AntsConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AntsConfig>;
  const maxBots = Math.max(0, ANTS_MAX_EMPIRES - humans);
  const bots = Math.max(0, Math.min(maxBots, Math.floor(Number(r.bots ?? DEFAULT_ANTS_CONFIG.bots)) || 0));
  const minutes = ANTS_MINUTE_OPTIONS.includes(Number(r.minutes)) ? Number(r.minutes) : DEFAULT_ANTS_CONFIG.minutes;
  const botLevel = r.botLevel === 'easy' || r.botLevel === 'hard' ? r.botLevel : 'normal';
  return { bots, minutes, botLevel };
}

export interface AntsEmpireInfo {
  idx: number;
  /** playerId; máy thì là "bot:<n>" */
  id: string;
  name: string;
  color: string;
  bot: boolean;
  alive: boolean;
}

/** Phần trạng thái Đế Chế Kiến gửi kèm RoomView (ít thay đổi) */
export interface AntsRoomView {
  config: AntsConfig;
  mapW?: number;
  mapH?: number;
  /** đá: x, y, r liên tiếp */
  rocks?: number[];
  empires?: AntsEmpireInfo[];
  /** đế chế của mình (undefined = khán giả / đã rời) */
  myIdx?: number;
  startedAt?: number;
  endsAt?: number;
  /** Kết quả: idx thắng (-1 = không ai) và lý do */
  result?: { winnerIdx: number; reason: string; scores: number[] };
}

/** Một nhịp mô phỏng gửi riêng cho từng người (chỉ những gì mình nhìn thấy) */
export interface AntsFrame {
  tick: number;
  /** ms đã chơi */
  elapsed: number;
  /** id, chủ, loại, x, y, %máu, cờ (2 = đang đánh, 4 = bay) */
  u: number[];
  /** trụ: id, chủ, loại (0 chính, 1 phụ), x, y, %máu, giây hồi đạn ×10 */
  b: number[];
  /** phát bắn trong nhịp này: x1, y1, x2, y2, loại, id mục tiêu, ms bay */
  s: number[];
  /** chỗ vừa chết: x, y, loại (0 kiến, 1 trụ) */
  d: number[];
  /** điểm từng đế chế */
  sc: number[];
  /** sống/chết từng đế chế (1/0) */
  al: number[];
  me?: AntsPrivate;
  /** Khán giả / người đã thua: nhìn toàn bản đồ */
  full?: boolean;
}

/** Loại phát bắn */
export const SHOT_ACID = 0;
export const SHOT_SIDE = 1;
export const SHOT_MAIN = 2;
export const SHOT_SNIPE = 3;
export const SHOT_BOMB = 4;
export const SHOT_HEAL = 5;

export interface AntsQueueItem {
  kind: AntUnitKind;
  /** giây còn lại (chỉ con đầu hàng đã trả vàng mới đếm) */
  left: number;
  total: number;
  /** đã trừ vàng và đang nở */
  paid: boolean;
}

export interface AntsPrivate {
  gold: number;
  /** lần cấp vàng kế tiếp: còn bao nhiêu giây, được bao nhiêu */
  incomeIn: number;
  incomeAmount: number;
  pop: number;
  popCap: number;
  queue: AntsQueueItem[];
  /** con đầu hàng đang chờ gì */
  waiting?: 'gold' | 'pop';
  rally: [number, number];
  kills: number;
  spent: number;
  /** lệnh chung cho cả đạo quân */
  stance: AntsStance;
  /** đế chế đang nhắm (-1 = gần nhất) */
  target: number;
  /** trụ đang đánh khi tổng tấn công */
  targetPos?: [number, number];
  /** đế chế thật sự đang bị đánh (khi chọn "gần nhất") */
  targetIdx?: number;
  /** loại kiến đang tự ra (null = không) */
  auto: AntUnitKind | null;
  /** đếm số con đã nở (client so sánh để hiện "+1") */
  hatched: number;
}

/** Lệnh chung: cả đạo quân tự di chuyển, không cần điều khiển từng con */
export type AntsStance = 'attack' | 'defend';

/** Lệnh từ client */
export type AntsCommand =
  | { t: 'move'; ids: number[]; x: number; y: number; attack?: boolean }
  | { t: 'target'; ids: number[]; target: number }
  | { t: 'stop'; ids: number[] }
  /** gọi thêm count con (mặc định 1) vào hàng chờ */
  | { t: 'train'; kind: AntUnitKind; count?: number }
  /** bỏ 1 con loại này khỏi cuối hàng chờ (con đã trả vàng thì hoàn vàng) */
  | { t: 'untrain'; kind: AntUnitKind }
  | { t: 'rally'; x: number; y: number }
  /** Tổng tấn công (target = idx đế chế, -1 = gần nhất) hoặc phòng thủ chung */
  | { t: 'stance'; stance: AntsStance; target?: number }
  /** Tự ra quân: trại nở loại này liên tục, từng con một (null = dừng) */
  | { t: 'auto'; kind: AntUnitKind | null };

export const ANTS_UNIT_FIELDS = 7;
export const ANTS_TOWER_FIELDS = 7;
export const ANTS_SHOT_FIELDS = 7;
