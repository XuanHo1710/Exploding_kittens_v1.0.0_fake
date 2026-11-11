/**
 * Miragine War (Thập Hùng Tranh Bá) – chiến thuật ra quân tự động thời gian thực, tối đa 10 phe (người + máy).
 * Sao chép 100% hệ thống 16 loại lính, thông số Giáp Nhẹ (Light) / Giáp Nặng (Armored), công thức sát thương,
 * chu kỳ thu nhập 30 giây, Trụ Pha Lê (A_crystal / B_crystal), Cổng Triệu Hồi (door) và hoạt ảnh từ Miragine War gốc
 * (trong thư mục database-miraginewar/*), mở rộng lên bản đồ rộng 10 người realtime (Co-op / Solo Hỗn Chiến / Lập Đội)
 * có nút Hành Quân Tấn Công Chỉ Định và Phòng Thủ.
 */

/** Mô phỏng 10 nhịp/giây, client nội suy giữa 2 nhịp */
export const THAP_TICK_MS = 100;
export const THAP_MAX_PLAYERS = 10;
export const THAP_MAX_TEAMS = 5;
/** Khởi đầu 0 vàng, sau 6 giây đầu tiên nhận 100 vàng (chuẩn 100% Miragine War: startMoney = 0, firstRoundSeconds = 6) */
export const THAP_START_GOLD = 0;
export const THAP_BASE_INCOME = 0;
export const THAP_ECO_PER_LEVEL = 0;
/** Đợt xuất quân đầu tiên sau 6 giây (60 nhịp), các đợt tiếp theo mỗi 30 giây (300 nhịp) */
export const THAP_FIRST_ROUND_S = 6;
/** Chu kỳ vòng 30 giây chuẩn Miragine War (hết 30s nhận thêm roundIncome vàng) */
export const THAP_ROUND_S = 30;
/** Thu nhập mỗi vòng 30s khởi đầu chuẩn Miragine War (tăng thêm khi gọi lính, tối đa 8000) */
export const THAP_START_ROUND_INCOME = 100;
export const THAP_INCOME_LIMIT = 8000;
/** Giới hạn dân số chuẩn Miragine War (60 dân số) */
export const THAP_MAX_POP = 60;
export const THAP_MAX_QUEUE = 10;
/** Khoảng cách nhịp giữa 2 con lính bước ra từ Cổng Triệu Hồi (door.png) */
export const THAP_SPAWN_INTERVAL_TICKS = 2;
/** Bán kính lính tự lao vào đánh địch (tính từ tâm lính) */
export const THAP_AGGRO = 240;
/** Phòng Thủ: lính đứng quanh Pha Lê & Cổng trong bán kính này, chỉ đuổi địch trong THAP_DEFEND_CHASE */
export const THAP_DEFEND_RADIUS = 320;
export const THAP_DEFEND_CHASE = 520;
/** Chống spam lệnh: túi 40 lệnh, hồi 15 lệnh/giây */
export const THAP_CMD_BURST = 40;
export const THAP_CMD_REFILL = 15;

/** 16 loại lính nguyên bản của Miragine War (theo đúng thứ tự ô 0..15 trong bảng 2x8) */
export type ThapUnitKind =
  | 'newbie'
  | 'veteran'
  | 'zombie'
  | 'samurai'
  | 'swordman'
  | 'ninja'
  | 'novice'
  | 'heavysword'
  | 'monk'
  | 'vampire'
  | 'cavalry'
  | 'immortal'
  | 'mage'
  | 'ironknight'
  | 'dreadlord'
  | 'highlord';

/** Thứ tự mã số gửi qua mạng = thứ tự 0..15 trong bảng 2x8 của Miragine War */
export const THAP_UNIT_KINDS: ThapUnitKind[] = [
  'newbie',
  'veteran',
  'zombie',
  'samurai',
  'swordman',
  'ninja',
  'novice',
  'heavysword',
  'monk',
  'vampire',
  'cavalry',
  'immortal',
  'mage',
  'ironknight',
  'dreadlord',
  'highlord',
];

/** Loại giáp chuẩn Miragine War: 0 = Light (Giáp Nhẹ), 1 = Armored (Giáp Nặng) */
export type ThapArmorType = 'light' | 'armored';

export interface ThapUnitStats {
  /** Mã thứ tự 0..15 trong bảng Miragine War */
  id: number;
  /** Tên gốc tiếng Anh trong Miragine War */
  name: string;
  /** Tên tiếng Việt hiển thị kèm */
  vnName: string;
  desc: string;
  cost: number;
  /** giây huấn luyện / xuất quân */
  time: number;
  /** Dân số (Population 1..7) */
  pop: number;
  /** Thu nhập cộng thêm mỗi khi gọi lính này (+Income chuẩn Miragine War: 4..160) */
  incomeBonus: number;
  hp: number;
  /** 0 = Light (Giáp Nhẹ), 1 = Armored (Giáp Nặng) */
  armorTypeID: 0 | 1;
  armorType: ThapArmorType;
  /** Giáp giảm sát thương trực tiếp (0..4) */
  armor: number;
  /** Sát thương chuẩn Miragine War: [sát thương lên Giáp Nhẹ, sát thương lên Giáp Nặng] */
  damage: [number, number];
  /** Sát thương cơ bản (dùng hiển thị nhanh = max(damage)) */
  atk: number;
  /** giây giữa 2 đòn (weaponSpeed * 20 / 30) */
  cd: number;
  /** Tốc đánh gốc trong Miragine War */
  weaponSpeed: number;
  /** Độ trễ tung đòn gốc (frames) */
  delayAttack: number;
  /** tầm đánh tính từ mép thân tới mép mục tiêu (0 = cận chiến) */
  range: number;
  /** Tầm đánh gốc trong Miragine War (1..5.5) */
  rawRange: number;
  /** không bắn được mục tiêu gần hơn (mép–mép) */
  minRange?: number;
  /** Tốc độ di chuyển trên bản đồ (px/giây = moveSpeed * 1.3 * 30) */
  speed: number;
  /** Tốc chạy gốc trong Miragine War (2.25..4.0) */
  moveSpeed: number;
  radius: number;
  hotkey: string;
  /** Chỉ số SpriteSheet gốc (0..15 -> A{ss}_* / B{ss}_* trong database-miraginewar/sheets/) */
  ss: number;
  /** Đạn phép gốc ('fb' = fireball, 'tb' = thunderball, 'storm' = storm) */
  wss?: 'fb' | 'tb' | 'storm';
  /** sát thương lan quanh điểm trúng (bán kính) */
  splash?: number;
  /** nhân sát thương lên Pha Lê Chính */
  siege?: number;
  /** hồi máu/giây cho 1 đồng minh yếu nhất trong tầm */
  heal?: number;
  /** loại đạn gửi qua mạng (THAP_SHOT_*), không có = cận chiến */
  shot?: number;
}

/** Mã đạn bay: 0 = Thunderball (tb), 1 = Fireball (fb), 2 = Storm (storm), 3 = Heal, 4 = Đạn Pha Lê Chính */
export const THAP_SHOT_ARROW = 0;
export const THAP_SHOT_MAGIC = 1;
export const THAP_SHOT_STONE = 2;
export const THAP_SHOT_HEAL = 3;
export const THAP_SHOT_BASE = 4;

/**
 * Toàn bộ 16 loại lính chuẩn 100% từ lớp Grid (Method 68) của Miragine War (game.abc).
 */
export const THAP_UNITS: Record<ThapUnitKind, ThapUnitStats> = {
  newbie: {
    id: 0, name: 'Newbie', vnName: 'Tân Binh',
    desc: 'Lính cận chiến cơ bản, giá rẻ, tốc đánh nhanh. Giáp Nhẹ.',
    cost: 20, time: 1.5, pop: 1, incomeBonus: 4, hp: 45,
    armorTypeID: 0, armorType: 'light', armor: 0,
    damage: [5, 5], atk: 5, cd: 0.55, weaponSpeed: 0.83, delayAttack: 0,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 9, hotkey: '1', ss: 5,
  },
  veteran: {
    id: 1, name: 'Veteran', vnName: 'Cựu Binh',
    desc: 'Chiến binh dày dạn, đánh Giáp Nặng tốt hơn Tân Binh. Giáp Nhẹ.',
    cost: 30, time: 1.8, pop: 1, incomeBonus: 5, hp: 65,
    armorTypeID: 0, armorType: 'light', armor: 0,
    damage: [6, 10], atk: 10, cd: 0.57, weaponSpeed: 0.86, delayAttack: 0,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 9, hotkey: '2', ss: 15,
  },
  zombie: {
    id: 2, name: 'Zombie', vnName: 'Xác Sống',
    desc: 'Máu trâu 125, Giáp Nặng (1), chém đều cả Nhẹ lẫn Nặng nhưng ra đòn chậm.',
    cost: 35, time: 2.0, pop: 1, incomeBonus: 6, hp: 125,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [16, 16], atk: 16, cd: 1.33, weaponSpeed: 2.0, delayAttack: 10,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 10, hotkey: '3', ss: 6,
  },
  samurai: {
    id: 3, name: 'Samurai', vnName: 'Võ Sĩ Samurai',
    desc: 'Chuyên chém Giáp Nhẹ (17 sát thương), yếu trước Giáp Nặng (5).',
    cost: 30, time: 2.0, pop: 1, incomeBonus: 6, hp: 96,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [17, 5], atk: 17, cd: 0.8, weaponSpeed: 1.2, delayAttack: 10,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 10, hotkey: '4', ss: 12,
  },
  swordman: {
    id: 4, name: 'Sword Man', vnName: 'Kiếm Sĩ',
    desc: 'Khắc tinh của Giáp Nặng đầu trận (20 sát thương lên Giáp Nặng).',
    cost: 40, time: 2.2, pop: 1, incomeBonus: 7, hp: 100,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [10, 20], atk: 20, cd: 0.87, weaponSpeed: 1.3, delayAttack: 10,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 10, hotkey: '5', ss: 0,
  },
  ninja: {
    id: 5, name: 'Ninja', vnName: 'Nhẫn Giả Ninja',
    desc: 'Chạy rất nhanh (3.2), tầm đánh 1.5, sát thủ diệt Giáp Nhẹ (22 sát thương).',
    cost: 45, time: 2.2, pop: 1, incomeBonus: 8, hp: 100,
    armorTypeID: 0, armorType: 'light', armor: 0,
    damage: [22, 10], atk: 22, cd: 0.87, weaponSpeed: 1.3, delayAttack: 10,
    range: 28, rawRange: 1.5, speed: 125, moveSpeed: 3.2, radius: 9, hotkey: '6', ss: 11,
  },
  novice: {
    id: 6, name: 'Novice', vnName: 'Pháp Sư Tập Sự',
    desc: 'Bắn Cầu Sét (Thunderball) tầm cực xa 5.5, hỗ trợ tuyến sau.',
    cost: 45, time: 2.4, pop: 1, incomeBonus: 8, hp: 75,
    armorTypeID: 0, armorType: 'light', armor: 0,
    damage: [11, 12], atk: 12, cd: 1.6, weaponSpeed: 2.4, delayAttack: 5,
    range: 260, rawRange: 5.5, speed: 88, moveSpeed: 2.25, radius: 9, hotkey: '7',
    ss: 7, wss: 'tb', shot: THAP_SHOT_ARROW,
  },
  heavysword: {
    id: 7, name: 'Heavy Sword Man', vnName: 'Trọng Kiếm Sĩ',
    desc: 'Giáp Nặng máu dày 160, tốc chạy 2.5, giữ tuyến đầu cực tốt.',
    cost: 45, time: 2.4, pop: 1, incomeBonus: 8, hp: 160,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [12, 15], atk: 15, cd: 0.96, weaponSpeed: 1.44, delayAttack: 10,
    range: 0, rawRange: 1, speed: 98, moveSpeed: 2.5, radius: 11, hotkey: '8', ss: 1,
  },
  monk: {
    id: 8, name: 'Monk', vnName: 'Võ Tăng',
    desc: 'Máu 225, Giáp Nhẹ (1), đấm nát Giáp Nặng (38 sát thương).',
    cost: 100, time: 3.0, pop: 2, incomeBonus: 15, hp: 225,
    armorTypeID: 0, armorType: 'light', armor: 1,
    damage: [18, 38], atk: 38, cd: 1.0, weaponSpeed: 1.5, delayAttack: 10,
    range: 0, rawRange: 1, speed: 105, moveSpeed: 2.69, radius: 11, hotkey: '9', ss: 14,
  },
  vampire: {
    id: 9, name: 'Vampire', vnName: 'Ma Cà Rồng',
    desc: 'Triệu hồi Bão Đêm (Storm) tầm xa 5.0, khắc chế cứng Giáp Nặng (42 sát thương).',
    cost: 125, time: 3.2, pop: 2, incomeBonus: 19, hp: 140,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [11, 42], atk: 42, cd: 1.6, weaponSpeed: 2.4, delayAttack: 5,
    range: 230, rawRange: 5, speed: 88, moveSpeed: 2.25, radius: 10, hotkey: '0',
    ss: 10, wss: 'storm', shot: THAP_SHOT_STONE, splash: 38,
  },
  cavalry: {
    id: 10, name: 'Cavalry', vnName: 'Kỵ Binh',
    desc: 'Tốc chạy nhanh nhất game (4.0), chém nhanh 30/30, đột kích thần tốc.',
    cost: 150, time: 3.5, pop: 2, incomeBonus: 21, hp: 240,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [30, 30], atk: 30, cd: 0.67, weaponSpeed: 1.0, delayAttack: 10,
    range: 0, rawRange: 1, speed: 156, moveSpeed: 4.0, radius: 12, hotkey: 'Q', ss: 8,
  },
  immortal: {
    id: 11, name: 'Immortal', vnName: 'Bất Tử Quân',
    desc: 'Máu 350, chuyên gia hủy diệt Giáp Nặng (50 sát thương).',
    cost: 180, time: 3.8, pop: 2, incomeBonus: 27, hp: 350,
    armorTypeID: 1, armorType: 'armored', armor: 1,
    damage: [20, 50], atk: 50, cd: 0.97, weaponSpeed: 1.45, delayAttack: 10,
    range: 0, rawRange: 1, speed: 88, moveSpeed: 2.25, radius: 12, hotkey: 'E', ss: 9,
  },
  mage: {
    id: 12, name: 'Mage', vnName: 'Đại Pháp Sư',
    desc: 'Chưởng Cầu Lửa (Fireball) tầm xa 5.0 nổ lan, thiêu rụi Giáp Nhẹ (50 sát thương).',
    cost: 220, time: 4.0, pop: 2, incomeBonus: 33, hp: 210,
    armorTypeID: 1, armorType: 'armored', armor: 0,
    damage: [50, 25], atk: 50, cd: 1.6, weaponSpeed: 2.4, delayAttack: 5,
    range: 230, rawRange: 5, speed: 88, moveSpeed: 2.25, radius: 10, hotkey: 'F',
    ss: 4, wss: 'fb', shot: THAP_SHOT_MAGIC, splash: 45,
  },
  ironknight: {
    id: 13, name: 'Iron Knight', vnName: 'Thiết Kỵ Sĩ',
    desc: 'Pháo đài di động: 450 máu, Giáp 3 siêu cứng, tốc chạy 2.95, 36 sát thương lên Giáp Nặng.',
    cost: 295, time: 4.5, pop: 2, incomeBonus: 41, hp: 450,
    armorTypeID: 1, armorType: 'armored', armor: 3,
    damage: [15, 36], atk: 36, cd: 0.72, weaponSpeed: 1.08, delayAttack: 10,
    range: 0, rawRange: 1, speed: 115, moveSpeed: 2.95, radius: 13, hotkey: 'G', ss: 3,
  },
  dreadlord: {
    id: 14, name: 'Dread Lord', vnName: 'Chúa Tể Hắc Ám',
    desc: 'Siêu chiến binh 800 máu, Giáp 2, vung đại đao 80/80 sát thương tầm 1.4.',
    cost: 800, time: 6.0, pop: 4, incomeBonus: 100, hp: 800,
    armorTypeID: 1, armorType: 'armored', armor: 2,
    damage: [80, 80], atk: 80, cd: 0.79, weaponSpeed: 1.18, delayAttack: 10,
    range: 24, rawRange: 1.4, speed: 88, moveSpeed: 2.25, radius: 15, hotkey: 'V', ss: 13, siege: 1.5,
  },
  highlord: {
    id: 15, name: 'High Lord', vnName: 'Thánh Chiến Vương',
    desc: 'Trùm cuối Miragine War: 1200 máu, Giáp 4, 155/155 sát thương, càn quét mọi chiến trường!',
    cost: 1500, time: 7.5, pop: 7, incomeBonus: 160, hp: 1200,
    armorTypeID: 1, armorType: 'armored', armor: 4,
    damage: [155, 155], atk: 155, cd: 1.06, weaponSpeed: 1.59, delayAttack: 10,
    range: 28, rawRange: 1.5, speed: 110, moveSpeed: 2.81, radius: 16, hotkey: 'B', ss: 2, siege: 2.0,
  },
};

/**
 * Công thức sát thương chuẩn 100% Miragine War (Method 493 trong game.abc):
 * nowHP -= (attacker.damage[victim.armorTypeID] - victim.armor)
 */
export function miragineDamage(attacker: ThapUnitKind, target: ThapUnitKind, atkMult = 1): number {
  const a = THAP_UNITS[attacker];
  const t = THAP_UNITS[target];
  const raw = a.damage[t.armorTypeID] * atkMult;
  return Math.max(1, Math.round(raw - t.armor));
}

/** Bảng AI chọn quân khắc chế trích xuất 100% từ Method 481 của Miragine War gốc (theo id 0..15) */
export const MIRAGINE_AI_COUNTERS: Record<number, number[]> = {
  0: [3, 5, 6, 7],
  1: [3, 5, 6, 7],
  2: [4, 6, 7, 8, 9],
  3: [4, 7, 8],
  4: [7, 8, 9],
  5: [3, 7, 8],
  6: [5, 10, 13],
  7: [4, 8, 9, 11],
  8: [5, 10, 12],
  9: [5, 10, 12, 13],
  10: [8, 11, 13],
  11: [8, 9, 12, 14],
  12: [10, 13, 14],
  13: [9, 11, 14, 15],
  14: [9, 11, 15],
  15: [9, 11, 14, 15],
};

/** Khắc chế tương đối giữa 2 loại lính (dùng cho hiển thị tooltip & tương thích): tỉ lệ sát thương thực / sát thương gốc */
export const THAP_COUNTER: Partial<Record<ThapUnitKind, Partial<Record<ThapUnitKind, number>>>> = Object.fromEntries(
  THAP_UNIT_KINDS.map((ak) => {
    const a = THAP_UNITS[ak];
    const base = (a.damage[0] + a.damage[1]) / 2;
    const row: Partial<Record<ThapUnitKind, number>> = {};
    for (const tk of THAP_UNIT_KINDS) {
      const t = THAP_UNITS[tk];
      const d = a.damage[t.armorTypeID];
      if (d > base * 1.15) row[tk] = Number((d / base).toFixed(2));
      else if (d < base * 0.85) row[tk] = Number((d / base).toFixed(2));
    }
    return [ak, row];
  }),
);

export const thapCounter = (attacker: ThapUnitKind, target: ThapUnitKind) => {
  const a = THAP_UNITS[attacker];
  const t = THAP_UNITS[target];
  return a.damage[t.armorTypeID] / Math.max(1, a.atk);
};

/** Trụ Pha Lê Chính (A_crystal / B_crystal chuẩn Miragine War: 3500 HP, 100 sát thương, tầm 600, hồi 1.0s) */
export const THAP_BASE = { name: 'Pha Lê Chính', hp: 3500, radius: 64, atk: 100, range: 600, cd: 1.0 } as const;
/** Mỏ Vàng trên bản đồ rộng 10 người: đứng trong bán kính để chiếm; 20%/giây (5 giây chiếm mỏ trống) */
export const THAP_MINE = { radius: 90, capturePerS: 20, income: 4, bigIncome: 9 } as const;

export type ThapUpgradeTrack = 'atk' | 'hp' | 'eco';
export const THAP_UPGRADE_TRACKS: ThapUpgradeTrack[] = ['atk', 'hp', 'eco'];
export const THAP_UPGRADES: Record<ThapUpgradeTrack, { name: string; desc: string; max: number; base: number; step: number; hotkey: string }> = {
  atk: { name: 'Rèn Binh Khí', desc: '+10% sát thương mọi lính', max: 5, base: 150, step: 100, hotkey: 'Z' },
  hp: { name: 'Giáp Trụ', desc: '+12% máu mọi lính (cả lính đang sống)', max: 5, base: 150, step: 100, hotkey: 'X' },
  eco: { name: 'Kho Lương', desc: `+${THAP_ECO_PER_LEVEL} vàng/giây & +25 vàng/vòng`, max: 3, base: 200, step: 150, hotkey: 'C' },
};
/** Giá lên cấp kế tiếp khi đang ở cấp `level` */
export const thapUpgradeCost = (track: ThapUpgradeTrack, level: number) => THAP_UPGRADES[track].base + THAP_UPGRADES[track].step * level;
export const THAP_ATK_PER_LEVEL = 0.1;
export const THAP_HP_PER_LEVEL = 0.12;

/** 10 màu người chơi dễ phân biệt trên nền đất Miragine War */
export const THAP_COLORS = ['#e03131', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#e64980', '#fab005', '#5c940d', '#364fc7', '#495057'];
export const THAP_TEAM_NAMES = ['Đội Đỏ (Red)', 'Đội Xanh (Blue)', 'Đội Hoàng Kim', 'Đội Tử Lôi', 'Đội Lục Bảo'];
export const THAP_TEAM_COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#da77f2', '#69db7c'];
export const THAP_BOT_NAMES = ['Tướng Đỏ Miragine', 'Tướng Xanh Dragon', 'Chúa Tể Bóng Đêm', 'Thánh Kỵ Sĩ', 'Đại Pháp Sư Lửa', 'Võ Thần Samurai', 'Tộc Trưởng Vampire', 'Thống Soái Kỵ Binh', 'Bất Tử Chiến Thần', 'Hộ Vệ Pha Lê'];
export const THAP_BOT_LABEL = { easy: 'Dễ', normal: 'Thường', hard: 'Khó' } as const;

/** ffa = Solo 10 người hỗn chiến; teams = tự chọn đội ở phòng chờ; coop = Co-op 10 người cùng đánh máy */
export type ThapMode = 'ffa' | 'teams' | 'coop';
export const THAP_MODE_LABEL: Record<ThapMode, string> = {
  ffa: 'Solo 10 người (Hỗn chiến)',
  teams: 'Lập đội (Chia phe)',
  coop: 'Co-op 10 người (Cùng đánh máy)',
};

export interface ThapConfig {
  bots: number;
  botLevel: 'easy' | 'normal' | 'hard';
  mode: ThapMode;
  /** 0 = không giới hạn; hết giờ phe điểm cao nhất thắng */
  minutes: number;
}
export const DEFAULT_THAP_CONFIG: ThapConfig = { bots: 3, botLevel: 'normal', mode: 'ffa', minutes: 20 };
export const THAP_MINUTE_OPTIONS = [0, 10, 15, 20, 30];

export function normalizeThapConfig(raw: unknown, humans: number): ThapConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ThapConfig>;
  const maxBots = Math.max(0, THAP_MAX_PLAYERS - Math.max(0, Math.floor(humans) || 0));
  const n = Math.floor(Number(r.bots ?? DEFAULT_THAP_CONFIG.bots));
  const bots = Math.max(0, Math.min(maxBots, Number.isFinite(n) ? n : 0));
  const botLevel = r.botLevel === 'easy' || r.botLevel === 'hard' ? r.botLevel : 'normal';
  const mode: ThapMode = r.mode === 'teams' || r.mode === 'coop' ? r.mode : 'ffa';
  const minutes = THAP_MINUTE_OPTIONS.includes(Number(r.minutes)) ? Number(r.minutes) : DEFAULT_THAP_CONFIG.minutes;
  return { bots, botLevel, mode, minutes };
}

export function normalizeThapTeam(raw: unknown): number {
  const t = Math.floor(Number(raw));
  return Number.isFinite(t) && t >= 0 && t < THAP_MAX_TEAMS ? t : 0;
}

/**
 * Đội của từng phe theo thứ tự [người..., máy...].
 * ffa: mỗi phe một đội riêng (0..n-1). coop: người = 0 (Phe Đỏ), máy = 1 (Phe Xanh).
 * teams: người theo lựa chọn; mỗi máy vào đội đang ít người nhất (nếu người chỉ dùng 1 đội thì máy sang đội khác để có đối thủ).
 */
export function assignThapTeams(humanTeams: number[], bots: number, mode: ThapMode): number[] {
  const n = humanTeams.length + bots;
  if (mode === 'ffa') return Array.from({ length: n }, (_, i) => i);
  if (mode === 'coop') return [...humanTeams.map(() => 0), ...Array.from({ length: bots }, () => 1)];
  const teams = humanTeams.map(normalizeThapTeam);
  const count = Array.from({ length: THAP_MAX_TEAMS }, (_, t) => teams.filter((x) => x === t).length);
  const used = new Set(teams);
  for (let b = 0; b < bots; b++) {
    let pick = -1;
    if (used.size === 1) pick = [...Array(THAP_MAX_TEAMS).keys()].find((t) => !used.has(t))!;
    else {
      const pool = used.size ? [...used] : [0, 1];
      pick = pool.sort((a, c) => count[a] - count[c] || a - c)[0];
    }
    teams.push(pick);
    count[pick]++;
    used.add(pick);
  }
  return teams;
}

/** Bản đồ rộng (tỉ lệ ~16:9) theo số phe */
export function thapMapSize(n: number) {
  const W = 2800 + 320 * Math.max(2, Math.min(THAP_MAX_PLAYERS, n));
  return { W, H: Math.round(W * 0.56) };
}

/**
 * Bố cục chuẩn Miragine War mở rộng 10 người: Căn cứ Pha Lê & Cổng Triệu Hồi xếp trên elip quanh bản đồ rộng.
 * Không có mỏ vàng hay công trình phụ (thu nhập hoàn toàn từ chu kỳ 30 giây & gọi lính qua Cổng Triệu Hồi).
 */
export function thapLayout(n: number): { W: number; H: number; bases: [number, number][]; mines: { x: number; y: number; big: boolean }[] } {
  const { W, H } = thapMapSize(n);
  const cx = W / 2, cy = H / 2, rx = W / 2 - 260, ry = H / 2 - 240;
  const bases: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI + (2 * Math.PI * i) / n;
    bases.push([Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)]);
  }
  return { W, H, bases, mines: [] };
}

export interface ThapPlayerInfo {
  idx: number;
  /** playerId; máy là "bot:thap<n>" */
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
}

/** Gửi kèm RoomView (ít thay đổi). Ở phòng chờ chỉ có config + teams. */
export interface ThapRoomView {
  config: ThapConfig;
  /** Phòng chờ, chế độ "teams": đội từng playerId đã chọn */
  teams?: Record<string, number>;
  mapW?: number;
  mapH?: number;
  /** x, y Pha Lê Chính theo idx phe */
  bases?: number[];
  /** x, y, big(0/1) từng mỏ */
  mines?: number[];
  players?: ThapPlayerInfo[];
  /** phe của mình (undefined = khán giả / đã rời) */
  myIdx?: number;
  startedAt?: number;
  endsAt?: number;
  /** winnerTeam -1 = không ai; winnerIdxs = các phe thuộc đội thắng */
  result?: { winnerTeam: number; winnerIdxs: number[]; reason: string; scores: number[] };
}

export const THAP_UNIT_FIELDS = 7;
export const THAP_MINE_FIELDS = 3;
export const THAP_SHOT_FIELDS = 7;
export const THAP_DEATH_FIELDS = 3;
/** cờ trong u[6] */
export const THAP_FLAG_ATTACK = 1;
export const THAP_FLAG_HEAL = 2;
export const THAP_FLAG_LEFT = 4;

/** Khung hình mỗi nhịp (bản đồ sáng toàn bộ, khung chung + phần riêng `me`) */
export interface ThapFrame {
  tick: number;
  /** ms đã chơi */
  elapsed: number;
  /** lính: id, chủ (idx), loại (index THAP_UNIT_KINDS 0..15), x, y, %máu (1..100), cờ */
  u: number[];
  /** %máu Pha Lê Chính theo idx (0 = đã nổ) */
  bh: number[];
  /** mỏ theo thứ tự ThapRoomView.mines: chủ (-1), phe đang chiếm (-1), tiến độ 0..100 */
  m: number[];
  /** đạn trong nhịp: x1, y1, x2, y2, loại (THAP_SHOT_*), id mục tiêu (-1 = Pha Lê/điểm), ms bay */
  s: number[];
  /** vừa chết: x, y, loại (1 = Pha Lê Chính, <= 0 = mã lính -(kindIdx * 16 + owner)) */
  d: number[];
  /** điểm từng phe */
  sc: number[];
  /** còn sống 1/0 theo idx */
  al: number[];
  me?: ThapPrivate;
  full?: boolean;
}

export type ThapStance = 'advance' | 'attack' | 'defend' | 'rally';

export interface ThapQueueItem {
  kind: ThapUnitKind;
  /** giây còn lại (chỉ con đầu hàng đếm) */
  left: number;
  total: number;
}

export interface ThapPrivate {
  gold: number;
  /** vàng/giây hiện tại (gốc + Kho Lương + mỏ) */
  income: number;
  /** vàng thưởng mỗi vòng 30s chuẩn Miragine War (khởi đầu 100, tăng thêm khi mua lính) */
  roundIncome: number;
  /** số giây còn lại tới đợt cấp vàng 30s kế tiếp (1..30) */
  roundLeft: number;
  pop: number;
  popCap: number;
  queue: ThapQueueItem[];
  /** con đầu hàng bị chặn vì đủ quân số */
  blocked?: 'pop';
  /** loại tự huấn luyện liên tục chuẩn Miragine War (null = tắt) */
  auto: ThapUnitKind | null;
  stance: ThapStance;
  /** idx phe đang nhắm khi 'attack' (Hành Quân Tấn Công Chỉ Định) */
  target: number;
  rally: [number, number];
  upgrades: Record<ThapUpgradeTrack, number>;
  mines: number;
  kills: number;
  lost: number;
}

/** Lệnh client → server ('thap:cmd') */
export type ThapCommand =
  /** mua count (mặc định 1, tối đa 5) con – TRỪ VÀNG NGAY & TĂNG THU NHẬP VÒNG chuẩn Miragine War */
  | { t: 'train'; kind: ThapUnitKind; count?: number }
  /** bỏ con cuối hàng loại này, hoàn đủ vàng */
  | { t: 'cancel'; kind: ThapUnitKind }
  /** chọn ô lính tự xuất quân liên tục chuẩn Miragine War (null = tắt) */
  | { t: 'auto'; kind: ThapUnitKind | null }
  /** lệnh chung: Tự Hành Quân ('advance') hoặc Phòng Thủ ('defend') */
  | { t: 'stance'; stance: 'advance' | 'defend' }
  /** Hành Quân Tấn Công Chỉ Định vào Pha Lê của phe idx (không được là mình/đồng minh/đã đổ) */
  | { t: 'attack'; target: number }
  /** đặt điểm Tập Kết, chuyển stance = 'rally' */
  | { t: 'rally'; x: number; y: number }
  | { t: 'upgrade'; track: ThapUpgradeTrack };
