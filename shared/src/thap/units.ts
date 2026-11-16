/**
 * Bảng thông số 16 loại lính nguyên bản của Miragine War (`database-miraginewar/mapping.json`),
 * công thức sát thương Method 493 và bảng AI khắc chế Method 481.
 */

import {
  THAP_BASE,
  THAP_MOVE_SPEED_MULT,
  THAP_RANGE_MULT,
  THAP_SHOT_FB,
  THAP_SHOT_STORM,
  THAP_SHOT_TB,
  THAP_WEAPON_SPEED_MULT,
} from './constants';

/** 16 loại lính nguyên bản của Miragine War theo đúng thứ tự ô 0..15 trong bảng 2x8. */
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

/** Thứ tự mã số gửi qua mạng = thứ tự 0..15 trong bảng 2x8 của Miragine War. */
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

/** Loại giáp chuẩn Miragine War: 0 = Light (Giáp Nhẹ), 1 = Armored (Giáp Nặng). */
export type ThapArmorType = 'light' | 'armored';

export interface ThapUnitStats {
  id: number;
  name: string;
  vnName: string;
  desc: string;
  cost: number;
  pop: number;
  incomeBonus: number;
  hp: number;
  armorTypeID: 0 | 1;
  armorType: ThapArmorType;
  armor: number;
  damage: [number, number];
  weaponSpeed: number;
  weaponFrames: number;
  cd: number;
  delayAttack: number;
  rawRange: number;
  range: number;
  moveSpeed: number;
  speed: number;
  radius: number;
  hotkey: string;
  ss: number;
  wss?: 'fb' | 'tb' | 'storm';
  splash?: number;
  shot?: number;
}

type RawUnitSpec = Omit<ThapUnitStats, 'armorType' | 'weaponFrames' | 'cd' | 'range' | 'speed'>;

/** Quy đổi thông số gốc từ `mapping.json` sang đơn vị mô phỏng 30 FPS (tốc chạy, tầm đánh, hồi chiêu). */
function buildUnitStats(u: RawUnitSpec): ThapUnitStats {
  return {
    ...u,
    armorType: u.armorTypeID === 0 ? 'light' : 'armored',
    weaponFrames: Math.round(u.weaponSpeed * THAP_WEAPON_SPEED_MULT),
    cd: (u.weaponSpeed * THAP_WEAPON_SPEED_MULT) / 30,
    range: Math.round(u.rawRange * THAP_RANGE_MULT),
    speed: Number((u.moveSpeed * THAP_MOVE_SPEED_MULT * 30).toFixed(2)),
  };
}

/** Toàn bộ 16 loại lính chuẩn 1:1 từ `database-miraginewar/mapping.json`. */
export const THAP_UNITS: Record<ThapUnitKind, ThapUnitStats> = {
  newbie: buildUnitStats({
    id: 0,
    name: 'Newbie',
    vnName: 'Tân Binh',
    desc: 'Lính cận chiến cơ bản, giá rẻ, tốc đánh nhanh. Giáp Nhẹ.',
    cost: 20,
    pop: 1,
    incomeBonus: 4,
    hp: 45,
    armorTypeID: 0,
    armor: 0,
    damage: [5, 5],
    weaponSpeed: 0.83,
    delayAttack: 0,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 9,
    hotkey: '1',
    ss: 5,
  }),
  veteran: buildUnitStats({
    id: 1,
    name: 'Veteran',
    vnName: 'Cựu Binh',
    desc: 'Chiến binh dày dạn, đánh Giáp Nặng tốt hơn Tân Binh. Giáp Nhẹ.',
    cost: 30,
    pop: 1,
    incomeBonus: 5,
    hp: 65,
    armorTypeID: 0,
    armor: 0,
    damage: [6, 10],
    weaponSpeed: 0.86,
    delayAttack: 0,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 9,
    hotkey: '2',
    ss: 15,
  }),
  zombie: buildUnitStats({
    id: 2,
    name: 'Zombie',
    vnName: 'Xác Sống',
    desc: 'Máu trâu 125, Giáp Nặng (1), chém đều cả Nhẹ lẫn Nặng nhưng ra đòn chậm.',
    cost: 35,
    pop: 1,
    incomeBonus: 6,
    hp: 125,
    armorTypeID: 1,
    armor: 1,
    damage: [16, 16],
    weaponSpeed: 2.0,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 10,
    hotkey: '3',
    ss: 6,
  }),
  samurai: buildUnitStats({
    id: 3,
    name: 'Samurai',
    vnName: 'Võ Sĩ Samurai',
    desc: 'Chuyên chém Giáp Nhẹ (17 sát thương), yếu trước Giáp Nặng (5).',
    cost: 30,
    pop: 1,
    incomeBonus: 6,
    hp: 96,
    armorTypeID: 1,
    armor: 1,
    damage: [17, 5],
    weaponSpeed: 1.2,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 10,
    hotkey: '4',
    ss: 12,
  }),
  swordman: buildUnitStats({
    id: 4,
    name: 'Sword Man',
    vnName: 'Kiếm Sĩ',
    desc: 'Khắc tinh của Giáp Nặng đầu trận (20 sát thương lên Giáp Nặng).',
    cost: 40,
    pop: 1,
    incomeBonus: 7,
    hp: 100,
    armorTypeID: 1,
    armor: 1,
    damage: [10, 20],
    weaponSpeed: 1.3,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 10,
    hotkey: '5',
    ss: 0,
  }),
  ninja: buildUnitStats({
    id: 5,
    name: 'Ninja',
    vnName: 'Nhẫn Giả Ninja',
    desc: 'Chạy rất nhanh (3.2), tầm đánh 1.5, sát thủ diệt Giáp Nhẹ (22 sát thương).',
    cost: 45,
    pop: 1,
    incomeBonus: 8,
    hp: 100,
    armorTypeID: 0,
    armor: 0,
    damage: [22, 10],
    weaponSpeed: 1.3,
    delayAttack: 10,
    rawRange: 1.5,
    moveSpeed: 3.2,
    radius: 9,
    hotkey: '6',
    ss: 11,
  }),
  novice: buildUnitStats({
    id: 6,
    name: 'Novice',
    vnName: 'Pháp Sư Tập Sự',
    desc: 'Bắn Cầu Sét (Thunderball) tầm cực xa 5.5, hỗ trợ tuyến sau.',
    cost: 45,
    pop: 1,
    incomeBonus: 8,
    hp: 75,
    armorTypeID: 0,
    armor: 0,
    damage: [11, 12],
    weaponSpeed: 2.4,
    delayAttack: 5,
    rawRange: 5.5,
    moveSpeed: 2.25,
    radius: 9,
    hotkey: '7',
    ss: 7,
    wss: 'tb',
    shot: THAP_SHOT_TB,
  }),
  heavysword: buildUnitStats({
    id: 7,
    name: 'Heavy Sword Man',
    vnName: 'Trọng Kiếm Sĩ',
    desc: 'Giáp Nặng máu dày 160, tốc chạy 2.5, giữ tuyến đầu cực tốt.',
    cost: 45,
    pop: 1,
    incomeBonus: 8,
    hp: 160,
    armorTypeID: 1,
    armor: 1,
    damage: [12, 15],
    weaponSpeed: 1.44,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.5,
    radius: 11,
    hotkey: '8',
    ss: 1,
  }),
  monk: buildUnitStats({
    id: 8,
    name: 'Monk',
    vnName: 'Võ Tăng',
    desc: 'Máu 225, Giáp Nhẹ (1), đấm nát Giáp Nặng (38 sát thương).',
    cost: 100,
    pop: 2,
    incomeBonus: 15,
    hp: 225,
    armorTypeID: 0,
    armor: 1,
    damage: [18, 38],
    weaponSpeed: 1.5,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.69,
    radius: 11,
    hotkey: '9',
    ss: 14,
  }),
  vampire: buildUnitStats({
    id: 9,
    name: 'Vampire',
    vnName: 'Ma Cà Rồng',
    desc: 'Triệu hồi Bão Đêm (Storm) tầm xa 5.0, khắc chế cứng Giáp Nặng (42 sát thương).',
    cost: 125,
    pop: 2,
    incomeBonus: 19,
    hp: 140,
    armorTypeID: 1,
    armor: 1,
    damage: [11, 42],
    weaponSpeed: 2.4,
    delayAttack: 5,
    rawRange: 5,
    moveSpeed: 2.25,
    radius: 10,
    hotkey: '0',
    ss: 10,
    wss: 'storm',
    splash: 38,
    shot: THAP_SHOT_STORM,
  }),
  cavalry: buildUnitStats({
    id: 10,
    name: 'Cavalry',
    vnName: 'Kỵ Binh',
    desc: 'Tốc chạy nhanh nhất game (4.0), chém nhanh 30/30, đột kích thần tốc.',
    cost: 150,
    pop: 2,
    incomeBonus: 21,
    hp: 240,
    armorTypeID: 1,
    armor: 1,
    damage: [30, 30],
    weaponSpeed: 1.0,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 4.0,
    radius: 12,
    hotkey: 'Q',
    ss: 8,
  }),
  immortal: buildUnitStats({
    id: 11,
    name: 'Immortal',
    vnName: 'Bất Tử Quân',
    desc: 'Máu 350, chuyên gia hủy diệt Giáp Nặng (50 sát thương).',
    cost: 180,
    pop: 2,
    incomeBonus: 27,
    hp: 350,
    armorTypeID: 1,
    armor: 1,
    damage: [20, 50],
    weaponSpeed: 1.45,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.25,
    radius: 12,
    hotkey: 'E',
    ss: 9,
  }),
  mage: buildUnitStats({
    id: 12,
    name: 'Mage',
    vnName: 'Đại Pháp Sư',
    desc: 'Chưởng Cầu Lửa (Fireball) tầm xa 5.0 nổ lan, thiêu rụi Giáp Nhẹ (50 sát thương).',
    cost: 220,
    pop: 2,
    incomeBonus: 33,
    hp: 210,
    armorTypeID: 1,
    armor: 0,
    damage: [50, 25],
    weaponSpeed: 2.4,
    delayAttack: 5,
    rawRange: 5,
    moveSpeed: 2.25,
    radius: 10,
    hotkey: 'F',
    ss: 4,
    wss: 'fb',
    splash: 45,
    shot: THAP_SHOT_FB,
  }),
  ironknight: buildUnitStats({
    id: 13,
    name: 'Iron Knight',
    vnName: 'Thiết Kỵ Sĩ',
    desc: 'Pháo đài di động: 450 máu, Giáp 3 siêu cứng, tốc chạy 2.95, 36 sát thương lên Giáp Nặng.',
    cost: 295,
    pop: 2,
    incomeBonus: 41,
    hp: 450,
    armorTypeID: 1,
    armor: 3,
    damage: [15, 36],
    weaponSpeed: 1.08,
    delayAttack: 10,
    rawRange: 1,
    moveSpeed: 2.95,
    radius: 13,
    hotkey: 'G',
    ss: 3,
  }),
  dreadlord: buildUnitStats({
    id: 14,
    name: 'Dread Lord',
    vnName: 'Chúa Tể Hắc Ám',
    desc: 'Siêu chiến binh 800 máu, Giáp 2, vung đại đao 80/80 sát thương tầm 1.4.',
    cost: 800,
    pop: 4,
    incomeBonus: 100,
    hp: 800,
    armorTypeID: 1,
    armor: 2,
    damage: [80, 80],
    weaponSpeed: 1.18,
    delayAttack: 10,
    rawRange: 1.4,
    moveSpeed: 2.25,
    radius: 15,
    hotkey: 'V',
    ss: 13,
  }),
  highlord: buildUnitStats({
    id: 15,
    name: 'High Lord',
    vnName: 'Thánh Chiến Vương',
    desc: 'Trùm cuối Miragine War: 1200 máu, Giáp 4, 155/155 sát thương, càn quét mọi chiến trường!',
    cost: 1500,
    pop: 7,
    incomeBonus: 160,
    hp: 1200,
    armorTypeID: 1,
    armor: 4,
    damage: [155, 155],
    weaponSpeed: 1.59,
    delayAttack: 10,
    rawRange: 1.5,
    moveSpeed: 2.81,
    radius: 16,
    hotkey: 'B',
    ss: 2,
  }),
};

/** Công thức sát thương chuẩn Miragine War (Method 493): `damage[armorTypeID] - armor`, tối thiểu 1. */
export function miragineDamage(attacker: ThapUnitKind, target: ThapUnitKind): number {
  const a = THAP_UNITS[attacker];
  const t = THAP_UNITS[target];
  return Math.max(1, a.damage[t.armorTypeID] - t.armor);
}

/** Sát thương của lính lên Trụ Pha Lê Chính (Giáp Nặng armorTypeID = 1, armor = 0). */
export function miragineCrystalDamage(attacker: ThapUnitKind): number {
  return Math.max(1, THAP_UNITS[attacker].damage[THAP_BASE.armorTypeID] - THAP_BASE.armor);
}

/** Bảng AI chọn quân khắc chế trích xuất 1:1 từ Method 481 của Miragine War gốc (theo id 0..15). */
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

/** Khắc chế tương đối giữa 2 loại lính: tỉ lệ sát thương theo loại giáp so với trung bình 2 loại giáp. */
export const THAP_COUNTER: Partial<Record<ThapUnitKind, Partial<Record<ThapUnitKind, number>>>> = Object.fromEntries(
  THAP_UNIT_KINDS.map((ak) => {
    const a = THAP_UNITS[ak];
    const base = (a.damage[0] + a.damage[1]) / 2;
    const row: Partial<Record<ThapUnitKind, number>> = {};
    for (const tk of THAP_UNIT_KINDS) {
      const t = THAP_UNITS[tk];
      const d = a.damage[t.armorTypeID];
      if (d > base * 1.15 || d < base * 0.85) row[tk] = Number((d / base).toFixed(2));
    }
    return [ak, row];
  }),
);

/** Hệ số sát thương của `attacker` lên `target` so với sát thương tối đa của `attacker`. */
export const thapCounter = (attacker: ThapUnitKind, target: ThapUnitKind): number => {
  const a = THAP_UNITS[attacker];
  const t = THAP_UNITS[target];
  return a.damage[t.armorTypeID] / Math.max(1, Math.max(a.damage[0], a.damage[1]));
};
