/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) – Hợp đồng dữ liệu & giao thức thời gian thực dùng chung
 * giữa Server mô phỏng chiến trường (15 Hz) và Client hiển thị chiến thuật đội hình đại quân.
 *
 * Thiết kế chuẩn Total War: Three Kingdoms:
 * - Hệ Ngũ Hành Tướng Lĩnh (Wu Xing: Hỏa Tiên Phong, Mộc Dũng Tướng, Kim Hộ Vệ, Thổ Thống Soái, Thủy Mưu Sĩ).
 * - 6 Thế lực Chư hầu, 12 Danh tướng Tam Quốc (chân dung + kỹ năng + Đấu Tướng / Single Duel).
 * - 18 Binh chủng bộ binh trường thương/kích, đao kiếm khiên, cung nỏ, máy bắn đá Uy Viễn và kỵ binh xung kích.
 * - 6 Trận hình chiến thuật (Trận Ngang, Thuẫn Tường, Thương Lâm phản xung kích, Phong Thỉ Chùy, Viên Trận, Tản Trận).
 * - 4 Chiến trường lịch sử rộng 3200x2200 (Bình Nguyên, Quan Độ, Trường Bản, Xích Bích) có rừng phục kích, đồi cao, sông cạn, đầm lầy.
 */

// ============================================================================
// 1. HẰNG SỐ HỆ THỐNG & MÀU CỜ CHƯ HẦU
// ============================================================================

export const TW_MAX_PLAYERS = 8;
export const TW_MAX_TEAMS = 4;
/** Nhịp mô phỏng máy chủ: 15 Hz (~66.67ms mỗi nhịp) */
export const TW_TICK_HZ = 15;
export const TW_TICK_MS = Math.round(1000 / TW_TICK_HZ);

export const TW_GENERALS_PER_PLAYER = 3;
export const TW_RETINUE_PER_GENERAL = 4;

/** Giới hạn chống spam lệnh điều quân mỗi người chơi */
export const TW_CMD_BURST = 45;
export const TW_CMD_REFILL = 18;

export const TW_FACTION_IDS = ['wei', 'shu', 'wu', 'yuan', 'lubu', 'jin'] as const;
export type TwFactionId = (typeof TW_FACTION_IDS)[number];

/** 8 màu đại kỳ chư hầu Tam Quốc phân biệt rõ trên nền chiến trường thu vàng & sương mù */
export const TW_COLORS: string[] = [
  '#2b6cb0', // Lam Tào Ngụy
  '#2f9e44', // Lục Thục Hán
  '#c92a2a', // Xích Đông Ngô
  '#e6b800', // Hoàng Viên Thiệu
  '#5f3dc4', // Tử Lữ Bố
  '#0ca678', // Ngọc Tư Mã Tấn
  '#d9480f', // Cam Tây Lương
  '#862e9c', // Tím Kinh Châu
];

/** 4 màu Liên Minh Chư Hầu (Coalition Colors) */
export const TW_TEAM_COLORS: string[] = [
  '#339af0', // Liên Minh Phương Bắc
  '#fa5252', // Liên Minh Giang Đông - Hán Thất
  '#fcc419', // Liên Minh Hà Bắc
  '#20c997', // Liên Minh Trung Nguyên
];

export const TW_TEAM_NAMES: string[] = [
  'Liên Minh Thanh Long (Phe 1)',
  'Liên Minh Chu Tước (Phe 2)',
  'Liên Minh Hoàng Kim (Phe 3)',
  'Liên Minh Huyền Vũ (Phe 4)',
];

/** 10 danh hiệu máy (AI Warlords) chuẩn tên tự Tam Quốc */
export const TW_BOT_NAMES: string[] = [
  '🤖 Tào Mạnh Đức',
  '🤖 Lưu Huyền Đức',
  '🤖 Tôn Văn Đài',
  '🤖 Viên Bản Sơ',
  '🤖 Lữ Phụng Tiên',
  '🤖 Tư Mã Tương An',
  '🤖 Gia Cát Khổng Minh',
  '🤖 Chu Công Cẩn',
  '🤖 Quan Vân Trường',
  '🤖 Triệu Tử Long',
];

// ============================================================================
// 2. NGŨ HÀNH TƯỚNG LĨNH (WU XING 5 GENERAL CLASSES)
// ============================================================================

export const TW_GENERAL_CLASSES = [
  'vanguard',
  'champion',
  'sentinel',
  'commander',
  'strategist',
] as const;

export type TwGeneralClass = (typeof TW_GENERAL_CLASSES)[number];

export type TwWuXingElement = 'Hỏa' | 'Mộc' | 'Kim' | 'Thổ' | 'Thủy';

export interface TwClassSpec {
  id: TwGeneralClass;
  vnName: string;
  enName: string;
  element: TwWuXingElement;
  color: string;
  auraRadius: number;
  auraDesc: string;
}

export const TW_CLASSES: Record<TwGeneralClass, TwClassSpec> = {
  vanguard: {
    id: 'vanguard',
    vnName: 'Tiên Phong',
    enName: 'Vanguard',
    element: 'Hỏa',
    color: '#e03131',
    auraRadius: 185,
    auraDesc: '+15% Sát thương Xung kích (Charge) & +8% Tốc độ hành quân cho trung đoàn lân cận.',
  },
  champion: {
    id: 'champion',
    vnName: 'Dũng Tướng',
    enName: 'Champion',
    element: 'Mộc',
    color: '#2f9e44',
    auraRadius: 175,
    auraDesc: '+12 Công cận chiến cho bộ binh trường thương & ưu thế tuyệt đối khi Đấu Tướng (Single Duel).',
  },
  sentinel: {
    id: 'sentinel',
    vnName: 'Hộ Vệ',
    enName: 'Sentinel',
    element: 'Kim',
    color: '#7950f2',
    auraRadius: 185,
    auraDesc: '+15 Thủ cận chiến & +15% Chắn tên cho các trung đoàn giữ tuyến xung quanh.',
  },
  commander: {
    id: 'commander',
    vnName: 'Thống Soái',
    enName: 'Commander',
    element: 'Thổ',
    color: '#f08c00',
    auraRadius: 245,
    auraDesc: '+14 Sĩ khí (Morale) & giảm hao hụt thể lực cho toàn quân dưới bóng đại kỳ.',
  },
  strategist: {
    id: 'strategist',
    vnName: 'Mưu Sĩ',
    enName: 'Strategist',
    element: 'Thủy',
    color: '#1c7ed6',
    auraRadius: 225,
    auraDesc: '+20% Cơ số tên đạn, +12% Tốc bắn & chỉ huy Máy Bắn Đá / Hỏa Tiễn.',
  },
};

// ============================================================================
// 3. 6 TRẬN HÌNH CHIẾN THUẬT (FORMATIONS)
// ============================================================================

export const TW_FORMATION_IDS = [
  'line',
  'shieldwall',
  'spearwall',
  'wedge',
  'circle',
  'loose',
] as const;

export type TwFormation = (typeof TW_FORMATION_IDS)[number];

export interface TwFormationSpec {
  id: TwFormation;
  vnName: string;
  enName: string;
  speedMul: number;
  meleeDefAdd: number;
  missileBlockAdd: number;
  chargeMul: number;
  chargeReflect: boolean;
  antiFlank: boolean;
  spreadMul: number;
  defaultColsRatio: number;
  desc: string;
}

export const TW_FORMATIONS: Record<TwFormation, TwFormationSpec> = {
  line: {
    id: 'line',
    vnName: 'Trận Ngang',
    enName: 'Line Formation',
    speedMul: 1.0,
    meleeDefAdd: 0,
    missileBlockAdd: 0,
    chargeMul: 1.0,
    chargeReflect: false,
    antiFlank: false,
    spreadMul: 1.0,
    defaultColsRatio: 3.4,
    desc: 'Đội hình tác chiến tiêu chuẩn, cân bằng giữa chiều ngang tiếp chiến và cơ động xoay hướng.',
  },
  shieldwall: {
    id: 'shieldwall',
    vnName: 'Thuẫn Tường',
    enName: 'Shield Wall',
    speedMul: 0.6,
    meleeDefAdd: 14,
    missileBlockAdd: 30,
    chargeMul: 0.5,
    chargeReflect: false,
    antiFlank: false,
    spreadMul: 0.72,
    defaultColsRatio: 2.8,
    desc: 'Khép chặt mộc thuẫn thành tường đồng vách sắt: +14 Thủ cận chiến, +30% Chắn tên nhưng tiến quân chậm.',
  },
  spearwall: {
    id: 'spearwall',
    vnName: 'Thương Lâm',
    enName: 'Spear Wall',
    speedMul: 0.55,
    meleeDefAdd: 18,
    missileBlockAdd: 10,
    chargeMul: 0.4,
    chargeReflect: true,
    antiFlank: false,
    spreadMul: 0.75,
    defaultColsRatio: 3.0,
    desc: 'Dựng rừng trường thương phản ngược sát thương xung kích kỵ binh (Charge Reflect) và +18 Thủ cận chiến.',
  },
  wedge: {
    id: 'wedge',
    vnName: 'Phong Thỉ Chùy',
    enName: 'Flying Wedge',
    speedMul: 1.08,
    meleeDefAdd: -6,
    missileBlockAdd: 0,
    chargeMul: 1.35,
    chargeReflect: false,
    antiFlank: false,
    spreadMul: 0.82,
    defaultColsRatio: 0.85,
    desc: 'Đội hình mũi tên nhọn của kỵ binh tinh nhuệ: +35% Sát thương Xung kích và +8% Tốc độ lao vào trung tâm địch.',
  },
  circle: {
    id: 'circle',
    vnName: 'Viên Trận',
    enName: 'Circle Formation',
    speedMul: 0.35,
    meleeDefAdd: 16,
    missileBlockAdd: 15,
    chargeMul: 0.25,
    chargeReflect: false,
    antiFlank: true,
    spreadMul: 0.85,
    defaultColsRatio: 1.0,
    desc: 'Kết vòng tròn tử thủ 360 độ: miễn nhiễm hoàn toàn phạt đánh tạt sườn / bọc hậu (Anti-Flank).',
  },
  loose: {
    id: 'loose',
    vnName: 'Tản Trận',
    enName: 'Loose Formation',
    speedMul: 1.05,
    meleeDefAdd: -10,
    missileBlockAdd: 0,
    chargeMul: 0.7,
    chargeReflect: false,
    antiFlank: false,
    spreadMul: 1.65,
    defaultColsRatio: 4.0,
    desc: 'Giãn thưa cự ly binh sĩ giúp giảm mạnh thương vong trước mưa tên và đá bắn công thành, nhưng yếu khi giáp lá cà.',
  },
};

// ============================================================================
// 4. 18 BINH CHỦNG BỘ TÙY (RETINUE UNIT KINDS)
// ============================================================================

export type TwUnitKind =
  // Bộ binh (8)
  | 'ji_militia'
  | 'spear_guards'
  | 'heavy_ji_infantry'
  | 'azure_dragons'
  | 'sabre_militia'
  | 'sabre_infantry'
  | 'jian_sword_guards'
  | 'yellow_dragons'
  // Cung nỏ & Công thành (5)
  | 'archer_militia'
  | 'yi_archers'
  | 'crossbowmen'
  | 'onyx_dragons'
  | 'trebuchet'
  // Kỵ binh (5)
  | 'raider_cavalry'
  | 'lance_cavalry'
  | 'jade_dragons'
  | 'sabre_cavalry'
  | 'imperial_cataphracts';

export const TW_UNIT_KINDS: TwUnitKind[] = [
  'ji_militia',
  'spear_guards',
  'heavy_ji_infantry',
  'azure_dragons',
  'sabre_militia',
  'sabre_infantry',
  'jian_sword_guards',
  'yellow_dragons',
  'archer_militia',
  'yi_archers',
  'crossbowmen',
  'onyx_dragons',
  'trebuchet',
  'raider_cavalry',
  'lance_cavalry',
  'jade_dragons',
  'sabre_cavalry',
  'imperial_cataphracts',
];

export type TwUnitCategory =
  | 'infantry_polearm'
  | 'infantry_sword'
  | 'ranged_bow'
  | 'ranged_crossbow'
  | 'artillery'
  | 'cavalry_shock'
  | 'cavalry_melee';

export type TwSpritePrefix =
  | `inf_${TwUnitKind}`
  | `rng_${TwUnitKind}`
  | `cav_${TwUnitKind}`;

export interface TwUnitSpec {
  kind: TwUnitKind;
  vnName: string;
  enName: string;
  category: TwUnitCategory;
  element: TwGeneralClass;
  maxMen: number;
  hpPerMan: number;
  meleeAtk: number;
  meleeDef: number;
  /** Giáp giảm sát thương thường (0..80%) */
  armor: number;
  /** Tỉ lệ khiên chắn đạn tên trực diện (0..65%) */
  shieldMissileBlock: number;
  chargeBonus: number;
  /** Sát thương khắc chế kỵ binh (0 cho đơn vị không cầm trường thương/kích) */
  AntiCavalryBonus: number;
  /** Bản sao camelCase để tương thích mọi nơi đọc thông số */
  antiCavalryBonus: number;
  /** Tầm bắn (0 = cận chiến, 340..460 = cung/nỏ, 680 = máy bắn đá) */
  range: number;
  missileDmg: number;
  armorPiercingDmg: number;
  maxAmmo: number;
  reloadSec: number;
  speed: number;
  mass: number;
  /** Chi phí chiêu mộ bộ tùy trong Ngân quỹ Chiến trận (Lượng) */
  cost: number;
  /** Có khả năng Bố Trận Tiên Phong (Vanguard Deployment) ẩn sát rừng tiền tuyến */
  vanguardDeploy?: boolean;
  /** Sĩ khí nền (35..85) */
  moraleBase: number;
  allowedFormations: TwFormation[];
  cardImg: `/database-total-war/units/${TwUnitKind}.png`;
  unitCard: `/database-total-war/units/${TwUnitKind}.png`;
  spritePrefix: TwSpritePrefix;
  desc: string;
}

export const TW_UNITS: Record<TwUnitKind, TwUnitSpec> = {
  // ---------------- BỘ BINH TRƯỜNG KÍCH / THƯƠNG (4) ----------------
  ji_militia: {
    kind: 'ji_militia',
    vnName: 'Dân Binh Trường Kích',
    enName: 'Ji Militia',
    category: 'infantry_polearm',
    element: 'champion',
    maxMen: 120,
    hpPerMan: 95,
    meleeAtk: 22,
    meleeDef: 26,
    armor: 15,
    shieldMissileBlock: 0,
    chargeBonus: 8,
    AntiCavalryBonus: 18,
    antiCavalryBonus: 18,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 8,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 72,
    mass: 95,
    cost: 360,
    moraleBase: 38,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/ji_militia.png',
    unitCard: '/database-total-war/units/ji_militia.png',
    spritePrefix: 'inf_ji_militia',
    desc: 'Lực lượng nghĩa dũng cầm trường kích giữ sườn đội hình, khắc chế kỵ binh nhưng giáp mỏng dễ trúng tên.',
  },
  spear_guards: {
    kind: 'spear_guards',
    vnName: 'Thuẫn Thương Hộ Vệ',
    enName: 'Spear Guards',
    category: 'infantry_polearm',
    element: 'champion',
    maxMen: 120,
    hpPerMan: 115,
    meleeAtk: 24,
    meleeDef: 42,
    armor: 38,
    shieldMissileBlock: 55,
    chargeBonus: 6,
    AntiCavalryBonus: 24,
    antiCavalryBonus: 24,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 9,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 68,
    mass: 115,
    cost: 640,
    moraleBase: 56,
    allowedFormations: ['line', 'shieldwall', 'spearwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/spear_guards.png',
    unitCard: '/database-total-war/units/spear_guards.png',
    spritePrefix: 'inf_spear_guards',
    desc: 'Bộ binh khiên lớn kết hợp trường thương: vừa chắn mưa tên 55% vừa dựng Thương Lâm bẻ gãy kỵ binh.',
  },
  heavy_ji_infantry: {
    kind: 'heavy_ji_infantry',
    vnName: 'Trọng Giáp Trường Kích',
    enName: 'Heavy Ji Infantry',
    category: 'infantry_polearm',
    element: 'champion',
    maxMen: 120,
    hpPerMan: 125,
    meleeAtk: 30,
    meleeDef: 38,
    armor: 55,
    shieldMissileBlock: 0,
    chargeBonus: 12,
    AntiCavalryBonus: 28,
    antiCavalryBonus: 28,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 16,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 65,
    mass: 130,
    cost: 840,
    moraleBase: 62,
    allowedFormations: ['line', 'spearwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/heavy_ji_infantry.png',
    unitCard: '/database-total-war/units/heavy_ji_infantry.png',
    spritePrefix: 'inf_heavy_ji_infantry',
    desc: 'Trọng bộ binh mặc thiết giáp dày cầm đại kích xuyên giáp, trụ vững nơi trung quân khốc liệt nhất.',
  },
  azure_dragons: {
    kind: 'azure_dragons',
    vnName: 'Thanh Long Quân',
    enName: 'Azure Dragons',
    category: 'infantry_polearm',
    element: 'champion',
    maxMen: 96,
    hpPerMan: 145,
    meleeAtk: 42,
    meleeDef: 48,
    armor: 60,
    shieldMissileBlock: 0,
    chargeBonus: 18,
    AntiCavalryBonus: 32,
    antiCavalryBonus: 32,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 20,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 70,
    mass: 140,
    cost: 1120,
    moraleBase: 78,
    allowedFormations: ['line', 'spearwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/azure_dragons.png',
    unitCard: '/database-total-war/units/azure_dragons.png',
    spritePrefix: 'inf_azure_dragons',
    desc: 'Tinh binh Ngũ Hành hệ Mộc cầm Yển Nguyệt Đao: công thủ toàn diện, khắc tinh tuyệt đối của thiết kỵ.',
  },

  // ---------------- BỘ BINH ĐAO KIẾM KHIÊN (4) ----------------
  sabre_militia: {
    kind: 'sabre_militia',
    vnName: 'Dân Binh Đao Thuẫn',
    enName: 'Sabre Militia',
    category: 'infantry_sword',
    element: 'sentinel',
    maxMen: 120,
    hpPerMan: 95,
    meleeAtk: 26,
    meleeDef: 24,
    armor: 20,
    shieldMissileBlock: 35,
    chargeBonus: 14,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 5,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 74,
    mass: 95,
    cost: 380,
    vanguardDeploy: true,
    moraleBase: 40,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/sabre_militia.png',
    unitCard: '/database-total-war/units/sabre_militia.png',
    spritePrefix: 'inf_sabre_militia',
    desc: 'Bộ binh đao mộc cơ động, xung phong chém bộ binh nhẹ và cung thủ tốt ở giai đoạn đầu giao tranh.',
  },
  sabre_infantry: {
    kind: 'sabre_infantry',
    vnName: 'Đao Thuẫn Bộ Binh',
    enName: 'Sabre Infantry',
    category: 'infantry_sword',
    element: 'sentinel',
    maxMen: 120,
    hpPerMan: 115,
    meleeAtk: 34,
    meleeDef: 34,
    armor: 42,
    shieldMissileBlock: 50,
    chargeBonus: 18,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 7,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 72,
    mass: 110,
    cost: 620,
    moraleBase: 56,
    allowedFormations: ['line', 'shieldwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/sabre_infantry.png',
    unitCard: '/database-total-war/units/sabre_infantry.png',
    spritePrefix: 'inf_sabre_infantry',
    desc: 'Quân chính quy cầm hoàn thủ đao và thuẫn lớn, tiến công tuyến đầu dưới làn tên địch hiệu quả.',
  },
  jian_sword_guards: {
    kind: 'jian_sword_guards',
    vnName: 'Trường Kiếm Cấm Vệ',
    enName: 'Jian Sword Guards',
    category: 'infantry_sword',
    element: 'sentinel',
    maxMen: 120,
    hpPerMan: 125,
    meleeAtk: 38,
    meleeDef: 48,
    armor: 52,
    shieldMissileBlock: 60,
    chargeBonus: 20,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 9,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 72,
    mass: 115,
    cost: 880,
    moraleBase: 68,
    allowedFormations: ['line', 'shieldwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/jian_sword_guards.png',
    unitCard: '/database-total-war/units/jian_sword_guards.png',
    spritePrefix: 'inf_jian_sword_guards',
    desc: 'Cấm vệ quân kiếm khiên tinh nhuệ: chắn tên 60%, thủ cận chiến cực cao, nghiền nát bộ binh đối phương.',
  },
  yellow_dragons: {
    kind: 'yellow_dragons',
    vnName: 'Hoàng Long Quân',
    enName: 'Yellow Dragons',
    category: 'infantry_sword',
    element: 'commander',
    maxMen: 96,
    hpPerMan: 140,
    meleeAtk: 46,
    meleeDef: 44,
    armor: 58,
    shieldMissileBlock: 55,
    chargeBonus: 26,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 14,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 74,
    mass: 125,
    cost: 1140,
    moraleBase: 80,
    allowedFormations: ['line', 'shieldwall', 'circle', 'loose'],
    cardImg: '/database-total-war/units/yellow_dragons.png',
    unitCard: '/database-total-war/units/yellow_dragons.png',
    spritePrefix: 'inf_yellow_dragons',
    desc: 'Thần quân Ngũ Hành hệ Thổ khoác hoàng kim giáp: sĩ khí thép 80, đao thuẫn càn quét trung lộ.',
  },

  // ---------------- CUNG NỎ & PHÁO ĐÁ CÔNG THÀNH (5) ----------------
  archer_militia: {
    kind: 'archer_militia',
    vnName: 'Dân Binh Cung Thủ',
    enName: 'Archer Militia',
    category: 'ranged_bow',
    element: 'strategist',
    maxMen: 120,
    hpPerMan: 78,
    meleeAtk: 12,
    meleeDef: 14,
    armor: 10,
    shieldMissileBlock: 0,
    chargeBonus: 4,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 350,
    missileDmg: 16,
    armorPiercingDmg: 4,
    maxAmmo: 24,
    reloadSec: 4.5,
    speed: 76,
    mass: 80,
    cost: 350,
    moraleBase: 35,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/archer_militia.png',
    unitCard: '/database-total-war/units/archer_militia.png',
    spritePrefix: 'rng_archer_militia',
    desc: 'Cung thủ dân binh bắn cầu vồng qua đầu bộ binh, gây sát thương lớn lên lính không khiên giáp.',
  },
  yi_archers: {
    kind: 'yi_archers',
    vnName: 'Di Tộc Thiện Xạ',
    enName: 'Yi Archers',
    category: 'ranged_bow',
    element: 'strategist',
    maxMen: 96,
    hpPerMan: 92,
    meleeAtk: 22,
    meleeDef: 24,
    armor: 22,
    shieldMissileBlock: 0,
    chargeBonus: 10,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 390,
    missileDmg: 22,
    armorPiercingDmg: 7,
    maxAmmo: 28,
    reloadSec: 4.0,
    speed: 82,
    mass: 88,
    cost: 680,
    vanguardDeploy: true,
    moraleBase: 56,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/yi_archers.png',
    unitCard: '/database-total-war/units/yi_archers.png',
    spritePrefix: 'rng_yi_archers',
    desc: 'Xạ thủ vùng Ích Châu – Giang Nam thiện chiến, tốc chạy nhanh, ẩn nấp rừng sâu bắn tỉa cực rát.',
  },
  crossbowmen: {
    kind: 'crossbowmen',
    vnName: 'Liên Châu Nỏ Binh',
    enName: 'Crossbowmen',
    category: 'ranged_crossbow',
    element: 'strategist',
    maxMen: 120,
    hpPerMan: 85,
    meleeAtk: 14,
    meleeDef: 18,
    armor: 25,
    shieldMissileBlock: 0,
    chargeBonus: 4,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 430,
    missileDmg: 14,
    armorPiercingDmg: 18,
    maxAmmo: 24,
    reloadSec: 5.6,
    speed: 72,
    mass: 88,
    cost: 650,
    moraleBase: 48,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/crossbowmen.png',
    unitCard: '/database-total-war/units/crossbowmen.png',
    spritePrefix: 'rng_crossbowmen',
    desc: 'Nỏ cứng bắn tên sắt tầm xa 430 xuyên thủng trọng giáp và thiết kỵ đối phương.',
  },
  onyx_dragons: {
    kind: 'onyx_dragons',
    vnName: 'Hắc Long Thần Cung',
    enName: 'Onyx Dragons',
    category: 'ranged_bow',
    element: 'strategist',
    maxMen: 96,
    hpPerMan: 105,
    meleeAtk: 24,
    meleeDef: 28,
    armor: 38,
    shieldMissileBlock: 0,
    chargeBonus: 8,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 460,
    missileDmg: 24,
    armorPiercingDmg: 14,
    maxAmmo: 32,
    reloadSec: 3.8,
    speed: 78,
    mass: 95,
    cost: 1080,
    vanguardDeploy: true,
    moraleBase: 75,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/onyx_dragons.png',
    unitCard: '/database-total-war/units/onyx_dragons.png',
    spritePrefix: 'rng_onyx_dragons',
    desc: 'Thần cung Ngũ Hành hệ Thủy: tầm bắn 460 xa nhất bộ cung, tốc bắn dồn dập xuyên cả giáp nặng.',
  },
  trebuchet: {
    kind: 'trebuchet',
    vnName: 'Pháo Đá Uy Viễn',
    enName: 'Trebuchet',
    category: 'artillery',
    element: 'strategist',
    maxMen: 16,
    hpPerMan: 140,
    meleeAtk: 8,
    meleeDef: 10,
    armor: 15,
    shieldMissileBlock: 0,
    chargeBonus: 0,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 680,
    missileDmg: 65,
    armorPiercingDmg: 110,
    maxAmmo: 18,
    reloadSec: 9.5,
    speed: 38,
    mass: 260,
    cost: 1180,
    moraleBase: 45,
    allowedFormations: ['line', 'loose'],
    cardImg: '/database-total-war/units/trebuchet.png',
    unitCard: '/database-total-war/units/trebuchet.png',
    spritePrefix: 'rng_trebuchet',
    desc: 'Khẩu đội 4 cỗ máy bắn đá tầm cực xa 680 (16 pháo thủ), ném tảng đá lửa nghiền nát đội hình dày đặc.',
  },

  // ---------------- KỴ BINH XUNG KÍCH & CẬN CHIẾN (5) ----------------
  raider_cavalry: {
    kind: 'raider_cavalry',
    vnName: 'Đột Kích Khinh Kỵ',
    enName: 'Raider Cavalry',
    category: 'cavalry_shock',
    element: 'vanguard',
    maxMen: 36,
    hpPerMan: 165,
    meleeAtk: 26,
    meleeDef: 20,
    armor: 22,
    shieldMissileBlock: 0,
    chargeBonus: 65,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 10,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 142,
    mass: 240,
    cost: 620,
    vanguardDeploy: true,
    moraleBase: 46,
    allowedFormations: ['line', 'wedge', 'loose'],
    cardImg: '/database-total-war/units/raider_cavalry.png',
    unitCard: '/database-total-war/units/raider_cavalry.png',
    spritePrefix: 'cav_raider_cavalry',
    desc: 'Khinh kỵ tốc độ cao nhất chiến trường (142), chuyên vòng ra hậu phương truy sát cung nỏ và pháo đá.',
  },
  lance_cavalry: {
    kind: 'lance_cavalry',
    vnName: 'Trường Thương Xung Kỵ',
    enName: 'Lance Cavalry',
    category: 'cavalry_shock',
    element: 'vanguard',
    maxMen: 36,
    hpPerMan: 195,
    meleeAtk: 32,
    meleeDef: 24,
    armor: 45,
    shieldMissileBlock: 0,
    chargeBonus: 92,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 16,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 134,
    mass: 290,
    cost: 890,
    moraleBase: 62,
    allowedFormations: ['line', 'wedge', 'loose'],
    cardImg: '/database-total-war/units/lance_cavalry.png',
    unitCard: '/database-total-war/units/lance_cavalry.png',
    spritePrefix: 'cav_lance_cavalry',
    desc: 'Xung kỵ cầm trường mâu kết Phong Thỉ Chùy húc tung sườn và lưng bộ binh địch.',
  },
  jade_dragons: {
    kind: 'jade_dragons',
    vnName: 'Ngọc Long Xung Kỵ',
    enName: 'Jade Dragons',
    category: 'cavalry_shock',
    element: 'vanguard',
    maxMen: 36,
    hpPerMan: 225,
    meleeAtk: 38,
    meleeDef: 32,
    armor: 65,
    shieldMissileBlock: 25,
    chargeBonus: 115,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 22,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 128,
    mass: 330,
    cost: 1160,
    moraleBase: 80,
    allowedFormations: ['line', 'wedge', 'loose'],
    cardImg: '/database-total-war/units/jade_dragons.png',
    unitCard: '/database-total-war/units/jade_dragons.png',
    spritePrefix: 'cav_jade_dragons',
    desc: 'Thiết kỵ Ngũ Hành hệ Hỏa: lực xung kích 115 kinh hoàng kèm giáp dày kháng tên tốt.',
  },
  sabre_cavalry: {
    kind: 'sabre_cavalry',
    vnName: 'Chiến Đao Kỵ Binh',
    enName: 'Sabre Cavalry',
    category: 'cavalry_melee',
    element: 'commander',
    maxMen: 36,
    hpPerMan: 190,
    meleeAtk: 36,
    meleeDef: 42,
    armor: 48,
    shieldMissileBlock: 55,
    chargeBonus: 48,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 10,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 132,
    mass: 275,
    cost: 820,
    vanguardDeploy: true,
    moraleBase: 64,
    allowedFormations: ['line', 'wedge', 'loose'],
    cardImg: '/database-total-war/units/sabre_cavalry.png',
    unitCard: '/database-total-war/units/sabre_cavalry.png',
    spritePrefix: 'cav_sabre_cavalry',
    desc: 'Kỵ binh đao thuẫn chắn tên 55%, bền bỉ quần thảo cận chiến và áp sát tiêu diệt cung thủ.',
  },
  imperial_cataphracts: {
    kind: 'imperial_cataphracts',
    vnName: 'Thiết Giáp Trọng Kỵ',
    enName: 'Imperial Cataphracts',
    category: 'cavalry_shock',
    element: 'commander',
    maxMen: 30,
    hpPerMan: 260,
    meleeAtk: 42,
    meleeDef: 40,
    armor: 80,
    shieldMissileBlock: 35,
    chargeBonus: 125,
    AntiCavalryBonus: 0,
    antiCavalryBonus: 0,
    range: 0,
    missileDmg: 0,
    armorPiercingDmg: 26,
    maxAmmo: 0,
    reloadSec: 0,
    speed: 112,
    mass: 390,
    cost: 1240,
    moraleBase: 85,
    allowedFormations: ['line', 'wedge', 'loose'],
    cardImg: '/database-total-war/units/imperial_cataphracts.png',
    unitCard: '/database-total-war/units/imperial_cataphracts.png',
    spritePrefix: 'cav_imperial_cataphracts',
    desc: 'Đỉnh cao trọng kỵ bọc sắt cả người lẫn ngựa (Giáp 80%, Khối lượng 390), nghiền nát mọi chiến tuyến trừ Thương Lâm.',
  },
};

// ============================================================================
// 5. 12 DANH TƯỚNG HUYỀN THOẠI (LEGENDARY GENERALS)
// ============================================================================

export const TW_GENERAL_IDS = [
  'cao_cao',
  'xiahou_dun',
  'liu_bei',
  'guan_yu',
  'zhang_fei',
  'zhao_yun',
  'zhuge_liang',
  'sun_jian',
  'zhou_yu',
  'lu_bu',
  'yuan_shao',
  'sima_xiangan',
] as const;

export type TwGeneralId = (typeof TW_GENERAL_IDS)[number];

export type TwSkillEffectKind =
  | 'aoe_smash'
  | 'duel_buff'
  | 'iron_evasion'
  | 'rally_horn'
  | 'fire_volley';

export interface TwGeneralSkillSpec {
  id: string;
  vnName: string;
  enName: string;
  cooldownSec: number;
  radius: number;
  durationSec: number;
  effectKind: TwSkillEffectKind;
  desc: string;
}

export interface TwGeneralSpec {
  id: TwGeneralId;
  vnName: string;
  enName: string;
  courtesyName: string;
  faction: TwFactionId;
  class: TwGeneralClass;
  hp: number;
  meleeAtk: number;
  meleeDef: number;
  armor: number;
  chargeBonus: number;
  /** Chỉ số quyết định ưu thế Đấu Tướng (1..100) */
  duelPower: number;
  speed: number;
  cardPortrait: `/database-total-war/portraits/${TwGeneralId}_card.png`;
  tokenPortrait: `/database-total-war/portraits/${TwGeneralId}_token.png`;
  skill: TwGeneralSkillSpec;
  defaultRetinue: [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind];
}

export const TW_GENERALS: Record<TwGeneralId, TwGeneralSpec> = {
  cao_cao: {
    id: 'cao_cao',
    vnName: 'Tào Tháo',
    enName: 'Cao Cao',
    courtesyName: 'Mạnh Đức',
    faction: 'wei',
    class: 'commander',
    hp: 2250,
    meleeAtk: 58,
    meleeDef: 64,
    armor: 65,
    chargeBonus: 48,
    duelPower: 76,
    speed: 128,
    cardPortrait: '/database-total-war/portraits/cao_cao_card.png',
    tokenPortrait: '/database-total-war/portraits/cao_cao_token.png',
    skill: {
      id: 'imperial_shadow',
      vnName: 'Ngụy Võ Hiệu Lệnh',
      enName: 'Shadow of the Emperor',
      cooldownSec: 45,
      radius: 240,
      durationSec: 15,
      effectKind: 'rally_horn',
      desc: 'Phất cờ hiệu triệu toàn quân: hồi +25 Sĩ khí, tăng +18 Công/Thủ cận chiến và +15% Tốc chạy trong 15 giây.',
    },
    defaultRetinue: ['jian_sword_guards', 'heavy_ji_infantry', 'crossbowmen', 'sabre_cavalry'],
  },
  xiahou_dun: {
    id: 'xiahou_dun',
    vnName: 'Hạ Hầu Đôn',
    enName: 'Xiahou Dun',
    courtesyName: 'Nguyên Nhượng',
    faction: 'wei',
    class: 'champion',
    hp: 2600,
    meleeAtk: 76,
    meleeDef: 62,
    armor: 68,
    chargeBonus: 62,
    duelPower: 90,
    speed: 124,
    cardPortrait: '/database-total-war/portraits/xiahou_dun_card.png',
    tokenPortrait: '/database-total-war/portraits/xiahou_dun_token.png',
    skill: {
      id: 'vengeful_eye',
      vnName: 'Độc Nhãn Cuồng Nộ',
      enName: 'Vengeful Fury',
      cooldownSec: 40,
      radius: 140,
      durationSec: 14,
      effectKind: 'duel_buff',
      desc: 'Bộc phát huyết khí Độc Nhãn Tướng Quân: +45% Công cận chiến, +20 Đấu Tướng và bất khuất suốt 14 giây.',
    },
    defaultRetinue: ['spear_guards', 'sabre_infantry', 'ji_militia', 'lance_cavalry'],
  },
  liu_bei: {
    id: 'liu_bei',
    vnName: 'Lưu Bị',
    enName: 'Liu Bei',
    courtesyName: 'Huyền Đức',
    faction: 'shu',
    class: 'commander',
    hp: 2300,
    meleeAtk: 56,
    meleeDef: 68,
    armor: 62,
    chargeBonus: 45,
    duelPower: 74,
    speed: 126,
    cardPortrait: '/database-total-war/portraits/liu_bei_card.png',
    tokenPortrait: '/database-total-war/portraits/liu_bei_token.png',
    skill: {
      id: 'han_unity',
      vnName: 'Nhân Nghĩa Hưng Hán',
      enName: 'Unity of the Han',
      cooldownSec: 45,
      radius: 260,
      durationSec: 16,
      effectKind: 'rally_horn',
      desc: 'Khích lệ nghĩa quân Hán Thất: hồi +30 Sĩ khí, ổn định quân đang dao động và +20 Thủ cận chiến trong 16 giây.',
    },
    defaultRetinue: ['ji_militia', 'sabre_militia', 'yi_archers', 'jian_sword_guards'],
  },
  guan_yu: {
    id: 'guan_yu',
    vnName: 'Quan Vũ',
    enName: 'Guan Yu',
    courtesyName: 'Vân Trường',
    faction: 'shu',
    class: 'champion',
    hp: 2750,
    meleeAtk: 86,
    meleeDef: 70,
    armor: 72,
    chargeBonus: 70,
    duelPower: 97,
    speed: 126,
    cardPortrait: '/database-total-war/portraits/guan_yu_card.png',
    tokenPortrait: '/database-total-war/portraits/guan_yu_token.png',
    skill: {
      id: 'god_of_war',
      vnName: 'Thanh Long Trảm Nguyệt',
      enName: 'God of War',
      cooldownSec: 42,
      radius: 135,
      durationSec: 12,
      effectKind: 'aoe_smash',
      desc: 'Vung Thanh Long Yển Nguyệt Đao bổ sấm sét, gây sát thương xuyên giáp diện rộng và trấn áp sĩ khí địch.',
    },
    defaultRetinue: ['azure_dragons', 'heavy_ji_infantry', 'spear_guards', 'jade_dragons'],
  },
  zhang_fei: {
    id: 'zhang_fei',
    vnName: 'Trương Phi',
    enName: 'Zhang Fei',
    courtesyName: 'Ích Đức',
    faction: 'shu',
    class: 'vanguard',
    hp: 2680,
    meleeAtk: 84,
    meleeDef: 56,
    armor: 66,
    chargeBonus: 88,
    duelPower: 95,
    speed: 130,
    cardPortrait: '/database-total-war/portraits/zhang_fei_card.png',
    tokenPortrait: '/database-total-war/portraits/zhang_fei_token.png',
    skill: {
      id: 'changban_roar',
      vnName: 'Tiếng Thét Trường Bản',
      enName: 'Roar of the Beast',
      cooldownSec: 38,
      radius: 175,
      durationSec: 10,
      effectKind: 'aoe_smash',
      desc: 'Gầm vang chấn động chiến trường, gây sát thương xung chấn và trừ thẳng -28 Sĩ khí quân địch lân cận.',
    },
    defaultRetinue: ['heavy_ji_infantry', 'sabre_infantry', 'ji_militia', 'raider_cavalry'],
  },
  zhao_yun: {
    id: 'zhao_yun',
    vnName: 'Triệu Vân',
    enName: 'Zhao Yun',
    courtesyName: 'Tử Long',
    faction: 'shu',
    class: 'sentinel',
    hp: 2550,
    meleeAtk: 78,
    meleeDef: 88,
    armor: 74,
    chargeBonus: 76,
    duelPower: 96,
    speed: 134,
    cardPortrait: '/database-total-war/portraits/zhao_yun_card.png',
    tokenPortrait: '/database-total-war/portraits/zhao_yun_token.png',
    skill: {
      id: 'silver_dragon',
      vnName: 'Đơn Kỵ Cứu Chúa',
      enName: 'Elemental Vigor',
      cooldownSec: 36,
      radius: 150,
      durationSec: 14,
      effectKind: 'iron_evasion',
      desc: 'Thương pháp Thường Sơn biến ảo: +45 Thủ cận chiến, +40% Chắn tên và xuyên phá vòng vây trong 14 giây.',
    },
    defaultRetinue: ['spear_guards', 'jian_sword_guards', 'yi_archers', 'jade_dragons'],
  },
  zhuge_liang: {
    id: 'zhuge_liang',
    vnName: 'Gia Cát Lượng',
    enName: 'Zhuge Liang',
    courtesyName: 'Khổng Minh',
    faction: 'shu',
    class: 'strategist',
    hp: 1800,
    meleeAtk: 34,
    meleeDef: 48,
    armor: 38,
    chargeBonus: 22,
    duelPower: 35,
    speed: 118,
    cardPortrait: '/database-total-war/portraits/zhuge_liang_card.png',
    tokenPortrait: '/database-total-war/portraits/zhuge_liang_token.png',
    skill: {
      id: 'southeast_wind',
      vnName: 'Kỳ Môn Hỏa Tiễn',
      enName: 'Way of the Wind',
      cooldownSec: 44,
      radius: 200,
      durationSec: 10,
      effectKind: 'fire_volley',
      desc: 'Mượn gió Đông trút mưa tên lửa xuống vùng chỉ định, thiêu đốt đội hình địch và tăng tốc bắn cung nỏ.',
    },
    defaultRetinue: ['crossbowmen', 'onyx_dragons', 'spear_guards', 'trebuchet'],
  },
  sun_jian: {
    id: 'sun_jian',
    vnName: 'Tôn Kiên',
    enName: 'Sun Jian',
    courtesyName: 'Văn Đài',
    faction: 'wu',
    class: 'sentinel',
    hp: 2580,
    meleeAtk: 76,
    meleeDef: 80,
    armor: 72,
    chargeBonus: 68,
    duelPower: 89,
    speed: 128,
    cardPortrait: '/database-total-war/portraits/sun_jian_card.png',
    tokenPortrait: '/database-total-war/portraits/sun_jian_token.png',
    skill: {
      id: 'tiger_of_jiangdong',
      vnName: 'Mãnh Hổ Giang Đông',
      enName: 'Tiger of Jiangdong',
      cooldownSec: 40,
      radius: 165,
      durationSec: 14,
      effectKind: 'iron_evasion',
      desc: 'Uy phong Mãnh Hổ bất khuất: tăng +35 Thủ cận chiến, +25% Giáp và giữ vững trận địa trong 14 giây.',
    },
    defaultRetinue: ['jian_sword_guards', 'sabre_infantry', 'archer_militia', 'sabre_cavalry'],
  },
  zhou_yu: {
    id: 'zhou_yu',
    vnName: 'Chu Du',
    enName: 'Zhou Yu',
    courtesyName: 'Công Cẩn',
    faction: 'wu',
    class: 'strategist',
    hp: 1950,
    meleeAtk: 46,
    meleeDef: 56,
    armor: 48,
    chargeBonus: 32,
    duelPower: 58,
    speed: 122,
    cardPortrait: '/database-total-war/portraits/zhou_yu_card.png',
    tokenPortrait: '/database-total-war/portraits/zhou_yu_token.png',
    skill: {
      id: 'red_cliffs_flame',
      vnName: 'Hỏa Thiêu Xích Bích',
      enName: 'Flames of Red Cliffs',
      cooldownSec: 42,
      radius: 210,
      durationSec: 10,
      effectKind: 'fire_volley',
      desc: 'Đại Đô Đốc hạ lệnh Hỏa Công trút bão lửa xuống mục tiêu, gây cháy lan và rút mạnh sĩ khí quân địch.',
    },
    defaultRetinue: ['archer_militia', 'onyx_dragons', 'spear_guards', 'trebuchet'],
  },
  lu_bu: {
    id: 'lu_bu',
    vnName: 'Lữ Bố',
    enName: 'Lu Bu',
    courtesyName: 'Phụng Tiên',
    faction: 'lubu',
    class: 'vanguard',
    hp: 2800,
    meleeAtk: 95,
    meleeDef: 68,
    armor: 78,
    chargeBonus: 98,
    duelPower: 100,
    speed: 140,
    cardPortrait: '/database-total-war/portraits/lu_bu_card.png',
    tokenPortrait: '/database-total-war/portraits/lu_bu_token.png',
    skill: {
      id: 'rage_of_lu_bu',
      vnName: 'Phương Thiên Vô Song',
      enName: 'Rage of Lu Bu',
      cooldownSec: 36,
      radius: 165,
      durationSec: 10,
      effectKind: 'aoe_smash',
      desc: 'Cưỡi Xích Thố vung Phương Thiên Họa Kích quét ngang 360 độ, gây sát thương hủy diệt giữa muôn trùng vây!',
    },
    defaultRetinue: ['heavy_ji_infantry', 'sabre_infantry', 'azure_dragons', 'lance_cavalry'],
  },
  yuan_shao: {
    id: 'yuan_shao',
    vnName: 'Viên Thiệu',
    enName: 'Yuan Shao',
    courtesyName: 'Bản Sơ',
    faction: 'yuan',
    class: 'commander',
    hp: 2350,
    meleeAtk: 55,
    meleeDef: 66,
    armor: 70,
    chargeBonus: 46,
    duelPower: 70,
    speed: 124,
    cardPortrait: '/database-total-war/portraits/yuan_shao_card.png',
    tokenPortrait: '/database-total-war/portraits/yuan_shao_token.png',
    skill: {
      id: 'noble_lineage',
      vnName: 'Tứ Thế Tam Công',
      enName: 'Lineage of Yuan',
      cooldownSec: 44,
      radius: 250,
      durationSec: 16,
      effectKind: 'rally_horn',
      desc: 'Danh vọng minh chủ Hà Bắc: cộng +24 Sĩ khí, +16 Giáp và hồi phục thể lực cho toàn bộ bộ tùy.',
    },
    defaultRetinue: ['yellow_dragons', 'heavy_ji_infantry', 'crossbowmen', 'ji_militia'],
  },
  sima_xiangan: {
    id: 'sima_xiangan',
    vnName: 'Tư Mã Tương An',
    enName: "Sima Xiang'an",
    courtesyName: 'Trọng Hòa',
    faction: 'jin',
    class: 'vanguard',
    hp: 2520,
    meleeAtk: 74,
    meleeDef: 66,
    armor: 78,
    chargeBonus: 84,
    duelPower: 85,
    speed: 126,
    cardPortrait: '/database-total-war/portraits/sima_xiangan_card.png',
    tokenPortrait: '/database-total-war/portraits/sima_xiangan_token.png',
    skill: {
      id: 'jin_iron_decree',
      vnName: 'Thiết Kỵ Đại Tấn',
      enName: 'Imperial Cataphract Decree',
      cooldownSec: 40,
      radius: 170,
      durationSec: 14,
      effectKind: 'duel_buff',
      desc: 'Thúc giục thiết kỵ vương tộc Tư Mã: +40% Công cận chiến, +30 Xung kích và xuyên thủng hàng ngũ địch.',
    },
    defaultRetinue: ['yellow_dragons', 'jian_sword_guards', 'crossbowmen', 'imperial_cataphracts'],
  },
};

// ============================================================================
// 6. 6 THẾ LỰC CHƯ HẦU (FACTIONS)
// ============================================================================

export interface TwFactionSpec {
  id: TwFactionId;
  name: string;
  vnName: string;
  leaderName: string;
  color: string;
  secondaryColor: string;
  emblemText: '魏' | '蜀' | '吳' | '袁' | '呂' | '晉';
  defaultGenerals: [TwGeneralId, TwGeneralId, TwGeneralId];
  availableUnits: TwUnitKind[];
  desc: string;
  bonusDesc: string;
}

export const TW_FACTIONS: Record<TwFactionId, TwFactionSpec> = {
  wei: {
    id: 'wei',
    name: 'Cao Wei',
    vnName: 'Tào Ngụy',
    leaderName: 'Tào Tháo (Mạnh Đức)',
    color: '#2b6cb0',
    secondaryColor: '#e2e8f0',
    emblemText: '魏',
    defaultGenerals: ['cao_cao', 'xiahou_dun', 'sima_xiangan'],
    availableUnits: [
      'jian_sword_guards',
      'sabre_infantry',
      'spear_guards',
      'heavy_ji_infantry',
      'yellow_dragons',
      'crossbowmen',
      'trebuchet',
      'sabre_cavalry',
      'lance_cavalry',
      'imperial_cataphracts',
    ],
    desc: 'Đại quân chính quy vùng Trung Nguyên với kỷ luật sắt đá, bộ binh kiếm khiên tinh nhuệ, nỏ cứng và thiết kỵ.',
    bonusDesc: '+8% Giáp toàn quân & +10% Tốc độ chỉnh đốn đội hình.',
  },
  shu: {
    id: 'shu',
    name: 'Shu Han',
    vnName: 'Thục Hán',
    leaderName: 'Lưu Bị (Huyền Đức)',
    color: '#2f9e44',
    secondaryColor: '#f59f00',
    emblemText: '蜀',
    defaultGenerals: ['liu_bei', 'guan_yu', 'zhuge_liang'],
    availableUnits: [
      'ji_militia',
      'spear_guards',
      'heavy_ji_infantry',
      'azure_dragons',
      'sabre_militia',
      'yi_archers',
      'crossbowmen',
      'onyx_dragons',
      'trebuchet',
      'jade_dragons',
    ],
    desc: 'Nghĩa quân Hán Thất quy tụ Ngũ Hổ Tướng và Ngọa Long Gia Cát Lượng, sĩ khí kiên cường cùng liên nỏ – pháo đá.',
    bonusDesc: '+8 Sĩ khí nền cho dân binh & +12% Sức mạnh Đấu Tướng.',
  },
  wu: {
    id: 'wu',
    name: 'Eastern Wu',
    vnName: 'Đông Ngô',
    leaderName: 'Tôn Kiên (Văn Đài)',
    color: '#c92a2a',
    secondaryColor: '#f08c00',
    emblemText: '吳',
    defaultGenerals: ['sun_jian', 'zhou_yu', 'zhao_yun'],
    availableUnits: [
      'sabre_militia',
      'sabre_infantry',
      'jian_sword_guards',
      'spear_guards',
      'archer_militia',
      'yi_archers',
      'onyx_dragons',
      'trebuchet',
      'raider_cavalry',
      'jade_dragons',
    ],
    desc: 'Mãnh Hổ Giang Đông tinh thông Hỏa Công và cung nỏ tầm xa kết hợp bộ binh đao kiếm cơ động.',
    bonusDesc: '+10% Sát thương tên/hỏa tiễn & +8% Tốc độ hành quân.',
  },
  yuan: {
    id: 'yuan',
    name: 'House of Yuan',
    vnName: 'Viên Thiệu',
    leaderName: 'Viên Thiệu (Bản Sơ)',
    color: '#e6b800',
    secondaryColor: '#343a40',
    emblemText: '袁',
    defaultGenerals: ['yuan_shao', 'xiahou_dun', 'zhuge_liang'],
    availableUnits: [
      'ji_militia',
      'spear_guards',
      'heavy_ji_infantry',
      'yellow_dragons',
      'sabre_infantry',
      'archer_militia',
      'crossbowmen',
      'onyx_dragons',
      'trebuchet',
      'lance_cavalry',
    ],
    desc: 'Danh gia Tứ Thế Tam Công thống lĩnh biển người Hà Bắc với Hoàng Long Quân, trọng kích và pháo đá hùng hậu.',
    bonusDesc: '+6 Sĩ khí khi đứng gần trung đoàn đồng minh & +10% Đạn dự trữ.',
  },
  lubu: {
    id: 'lubu',
    name: 'Lu Bu Warband',
    vnName: 'Lữ Bố',
    leaderName: 'Lữ Bố (Phụng Tiên)',
    color: '#5f3dc4',
    secondaryColor: '#c92a2a',
    emblemText: '呂',
    defaultGenerals: ['lu_bu', 'zhang_fei', 'zhou_yu'],
    availableUnits: [
      'heavy_ji_infantry',
      'azure_dragons',
      'sabre_infantry',
      'yi_archers',
      'onyx_dragons',
      'trebuchet',
      'raider_cavalry',
      'lance_cavalry',
      'jade_dragons',
      'imperial_cataphracts',
    ],
    desc: 'Đạo quân Chiến Thần Vô Song lấy thế công vũ bão đè bẹp mọi phòng tuyến bằng kỵ binh xung kích và mãnh tướng.',
    bonusDesc: '+18% Sát thương Xung kích (Charge Bonus) & hồi sĩ khí khi hạ tướng địch.',
  },
  jin: {
    id: 'jin',
    name: 'Sima Jin',
    vnName: 'Tư Mã Tấn',
    leaderName: 'Tư Mã Tương An (Trọng Hòa)',
    color: '#0ca678',
    secondaryColor: '#ffd43b',
    emblemText: '晉',
    defaultGenerals: ['sima_xiangan', 'zhao_yun', 'cao_cao'],
    availableUnits: [
      'spear_guards',
      'heavy_ji_infantry',
      'jian_sword_guards',
      'yellow_dragons',
      'crossbowmen',
      'onyx_dragons',
      'trebuchet',
      'sabre_cavalry',
      'jade_dragons',
      'imperial_cataphracts',
    ],
    desc: 'Vương triều Đại Tấn sở hữu Thiết Giáp Trọng Kỵ bọc sắt hạng nặng và đội hình Cấm Vệ kỷ luật bậc nhất.',
    bonusDesc: '+10% Khối lượng húc kỵ binh & +8 Thủ cận chiến cho trọng binh.',
  },
};

// ============================================================================
// 7. 4 CHIẾN TRƯỜNG LỊCH SỬ (HISTORICAL MAPS - 3200 x 2200)
// ============================================================================

export const TW_MAP_IDS = ['pingyuan', 'guandu', 'changban', 'chibi'] as const;
export type TwMapId = (typeof TW_MAP_IDS)[number];

export type TwTerrainKind = 'forest' | 'ridge' | 'river' | 'mud';

export interface TwTerrainZone {
  id: string;
  kind: TwTerrainKind;
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Góc xoay elip (radian) */
  rot: number;
}

export interface TwCapturePointSpec {
  id: number;
  name: string;
  x: number;
  y: number;
  radius: number;
}

export interface TwMapSpec {
  id: TwMapId;
  vnName: string;
  enName: string;
  seasonYear: string;
  vnSeasonYear: string;
  width: number;
  height: number;
  desc: string;
  terrainZones: TwTerrainZone[];
  capturePoints: TwCapturePointSpec[];
}

export const TW_MAPS: Record<TwMapId, TwMapSpec> = {
  pingyuan: {
    id: 'pingyuan',
    vnName: 'Trận Bình Nguyên – Tiểu Thành',
    enName: 'BATTLE OF PINGYUAN, SMALL CITY',
    seasonYear: 'AUTUMN 196',
    vnSeasonYear: 'THU 196',
    width: 3200,
    height: 2200,
    desc: 'Đồng bằng mùa thu Bình Nguyên rộng mở ở trung tâm, Rừng Thông lớn hướng Tây Bắc để giấu phục binh và Đồi Cao Đông Bắc khống chế tầm pháo đá.',
    terrainZones: [
      { id: 'pingyuan_nw_pine_forest', kind: 'forest', x: 680, y: 520, rx: 460, ry: 300, rot: -0.22 },
      { id: 'pingyuan_ne_elevated_ridge', kind: 'ridge', x: 2460, y: 540, rx: 480, ry: 270, rot: 0.25 },
      { id: 'pingyuan_sw_autumn_woods', kind: 'forest', x: 800, y: 1690, rx: 290, ry: 185, rot: 0.16 },
      { id: 'pingyuan_se_bluff', kind: 'ridge', x: 2390, y: 1650, rx: 330, ry: 195, rot: -0.18 },
      { id: 'pingyuan_south_lowland_mud', kind: 'mud', x: 1600, y: 1780, rx: 250, ry: 125, rot: 0.04 },
    ],
    capturePoints: [
      { id: 0, name: 'Đài Hiệu Lệnh Bình Nguyên', x: 1600, y: 1100, radius: 130 },
      { id: 1, name: 'Đồi Cao Đông Bắc', x: 2420, y: 560, radius: 115 },
      { id: 2, name: 'Rừng Thông Tây Bắc', x: 740, y: 560, radius: 115 },
    ],
  },
  guandu: {
    id: 'guandu',
    vnName: 'Chiến Dịch Quan Độ – Đại Doanh',
    enName: 'BATTLE OF GUANDU, FORTIFIED CAMP',
    seasonYear: 'AUTUMN 200',
    vnSeasonYear: 'THU 200',
    width: 3200,
    height: 2200,
    desc: 'Trận quyết chiến định đoạt phương Bắc bên bờ Hoàng Hà và rừng kho lương Ô Sào giữa Tào Tháo và Viên Thiệu.',
    terrainZones: [
      { id: 'guandu_yellow_river_ford', kind: 'river', x: 1600, y: 250, rx: 920, ry: 145, rot: 0.03 },
      { id: 'guandu_wuchao_woods', kind: 'forest', x: 2500, y: 640, rx: 380, ry: 250, rot: -0.18 },
      { id: 'guandu_west_earthworks', kind: 'ridge', x: 760, y: 1100, rx: 330, ry: 430, rot: 0.06 },
      { id: 'guandu_floodplain_mud', kind: 'mud', x: 1580, y: 610, rx: 300, ry: 145, rot: 0.08 },
      { id: 'guandu_south_copse', kind: 'forest', x: 1850, y: 1730, rx: 360, ry: 205, rot: 0.12 },
    ],
    capturePoints: [
      { id: 0, name: 'Trung Quân Quan Độ', x: 1600, y: 1120, radius: 130 },
      { id: 1, name: 'Kho Lương Ô Sào', x: 2460, y: 660, radius: 120 },
      { id: 2, name: 'Bến Cạn Hoàng Hà', x: 1100, y: 540, radius: 115 },
    ],
  },
  changban: {
    id: 'changban',
    vnName: 'Dốc Trường Bản – Cầu Đương Dương',
    enName: 'BATTLE OF CHANGBAN, DANGYANG BRIDGE',
    seasonYear: 'SUMMER 208',
    vnSeasonYear: 'HẠ 208',
    width: 3200,
    height: 2200,
    desc: 'Triền dốc Đương Dương hiểm trở, rừng trúc hai bên sườn phục kích và dòng sông chặn ngang lối rút về Giang Lăng.',
    terrainZones: [
      { id: 'changban_north_slope', kind: 'ridge', x: 1580, y: 600, rx: 560, ry: 280, rot: -0.05 },
      { id: 'changban_dangyang_river', kind: 'river', x: 1600, y: 1680, rx: 760, ry: 155, rot: -0.1 },
      { id: 'changban_bamboo_west', kind: 'forest', x: 640, y: 1000, rx: 400, ry: 330, rot: 0.2 },
      { id: 'changban_ambush_east', kind: 'forest', x: 2560, y: 1040, rx: 390, ry: 310, rot: -0.22 },
      { id: 'changban_bridge_mire', kind: 'mud', x: 1600, y: 1400, rx: 250, ry: 125, rot: 0.0 },
    ],
    capturePoints: [
      { id: 0, name: 'Đầu Cầu Trường Bản', x: 1600, y: 1160, radius: 130 },
      { id: 1, name: 'Đỉnh Dốc Đương Dương', x: 1580, y: 600, radius: 120 },
      { id: 2, name: 'Rừng Trúc Phục Quân', x: 680, y: 1000, radius: 115 },
    ],
  },
  chibi: {
    id: 'chibi',
    vnName: 'Đại Chiến Xích Bích – Bờ Trường Giang',
    enName: 'BATTLE OF RED CLIFFS, YANGTZE SHORE',
    seasonYear: 'WINTER 208',
    vnSeasonYear: 'ĐÔNG 208',
    width: 3200,
    height: 2200,
    desc: 'Bờ bắc – bờ nam Trường Giang rực lửa mùa đông 208, Nam Bình Sơn cầu gió Đông và lối mòn Hoa Dung lầy lội.',
    terrainZones: [
      { id: 'chibi_yangtze_shoreline', kind: 'river', x: 1600, y: 1960, rx: 1180, ry: 210, rot: 0.0 },
      { id: 'chibi_red_cliffs_bluff', kind: 'ridge', x: 2480, y: 1380, rx: 450, ry: 275, rot: -0.22 },
      { id: 'chibi_nanping_altar_hill', kind: 'ridge', x: 720, y: 1360, rx: 420, ry: 255, rot: 0.22 },
      { id: 'chibi_huarong_woods', kind: 'forest', x: 1600, y: 460, rx: 580, ry: 245, rot: 0.03 },
      { id: 'chibi_huarong_marsh', kind: 'mud', x: 1120, y: 820, rx: 300, ry: 160, rot: -0.14 },
    ],
    capturePoints: [
      { id: 0, name: 'Bến Chiến Thuyền Xích Bích', x: 1600, y: 1150, radius: 135 },
      { id: 1, name: 'Đài Cầu Gió Nam Bình Sơn', x: 740, y: 1350, radius: 120 },
      { id: 2, name: 'Cửa Ải Hoa Dung Đạo', x: 2460, y: 1360, radius: 120 },
    ],
  },
};

// ============================================================================
// 8. CẤU HÌNH PHÒNG CHỜ & CHUẨN HÓA CHIA ĐỘI (LOBBY CONFIG & NORMALIZATION)
// ============================================================================

export type TwMode = 'historical_2teams' | 'ffa';
export type TwDurationMin = 10 | 15 | 20;
export type TwArmyScale = 'normal' | 'grand';
export type TwBotDifficulty = 'easy' | 'normal' | 'hard';
export type TwBattlePhase = 'deployment' | 'battle';
export type TwBattleSpeed = 0 | 0.5 | 1 | 2 | 3;
export const TW_BATTLE_SPEEDS: readonly TwBattleSpeed[] = [0, 0.5, 1, 2, 3];
export type TwDuelStance = 'balanced' | 'press' | 'guard';

export const TW_DURATION_OPTIONS: TwDurationMin[] = [10, 15, 20];

/** Ngân quỹ Chiến trận tối đa để tự do chiêu mộ 12 trung đoàn Bộ tùy chuẩn Custom Battle TW3K */
export const TW_BATTLE_FUNDS = 12_500;
/** Cấp Tinh nhuệ trung đoàn tối đa (0 = Tân Binh, 1..3 = Đồng, 4..6 = Bạc, 7..9 = Vàng Cấm Vệ) */
export const TW_MAX_VETERANCY_RANK = 9;

export interface TwConfig {
  mode: TwMode;
  mapId: TwMapId;
  bots: number;
  botDifficulty?: TwBotDifficulty;
  durationMin: 10 | 15 | 20;
  romanceMode: boolean;
  armyScale: 'normal' | 'grand';
  /** Pha Bố Trận & Đặt Bẫy trước khi khai chiến (25 giây + nút Khai Chiến) */
  deploymentPhase?: boolean;
}

export const DEFAULT_TW_CONFIG: TwConfig = {
  mode: 'historical_2teams',
  mapId: 'pingyuan',
  bots: 1,
  botDifficulty: 'normal',
  durationMin: 15,
  romanceMode: true,
  armyScale: 'normal',
};

export const TW_MODE_LABEL: Record<TwMode, string> = {
  historical_2teams: 'Lịch Sử Đối Kháng (2 Liên Minh)',
  ffa: 'Quần Hùng Trục Lộc (Hỗn Chiến)',
};

export function normalizeTwConfig(raw: unknown, humans = 1): TwConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TwConfig>;
  const safeHumans = Math.max(0, Math.floor(Number(humans) || 0));
  const maxBots = Math.max(0, TW_MAX_PLAYERS - safeHumans);
  const parsedBots = Math.floor(Number(r.bots ?? DEFAULT_TW_CONFIG.bots));
  const bots = Math.max(0, Math.min(maxBots, Number.isFinite(parsedBots) ? parsedBots : DEFAULT_TW_CONFIG.bots));
  const botDifficulty: TwBotDifficulty =
    r.botDifficulty === 'easy' || r.botDifficulty === 'normal' || r.botDifficulty === 'hard'
      ? r.botDifficulty
      : 'normal';

  const mode: TwMode =
    r.mode === 'ffa' || r.mode === 'historical_2teams' ? r.mode : DEFAULT_TW_CONFIG.mode;
  const mapId: TwMapId = (TW_MAP_IDS as readonly string[]).includes(String(r.mapId))
    ? (r.mapId as TwMapId)
    : DEFAULT_TW_CONFIG.mapId;
  const dur = Number(r.durationMin);
  const durationMin: 10 | 15 | 20 =
    dur === 10 || dur === 15 || dur === 20 ? dur : DEFAULT_TW_CONFIG.durationMin;
  const romanceMode =
    typeof r.romanceMode === 'boolean' ? r.romanceMode : DEFAULT_TW_CONFIG.romanceMode;
  const armyScale: 'normal' | 'grand' =
    r.armyScale === 'grand' || r.armyScale === 'normal' ? r.armyScale : DEFAULT_TW_CONFIG.armyScale;

  const base: TwConfig = { mode, mapId, bots, botDifficulty, durationMin, romanceMode, armyScale };
  if (typeof r.deploymentPhase === 'boolean') {
    base.deploymentPhase = r.deploymentPhase;
  }
  return base;
}

// ============================================================================
// 8B. QUAN HỆ NGŨ HÀNH TƯỚNG LĨNH (GUANXI), THĂNG CẤP 0 A.D., ĐẠO CỤ & CHIÊU MỘ
// ============================================================================

export type TwGuanxiKind = 'oath' | 'kin' | 'rival';

export interface TwGuanxiBond {
  a: TwGeneralId;
  b: TwGeneralId;
  kind: TwGuanxiKind;
  vnTitle: string;
}

/** Hệ thống Quan Hệ Tướng Lĩnh (Guanxi) chuẩn Total War: Three Kingdoms */
export const TW_GUANXI_BONDS: readonly TwGuanxiBond[] = [
  { a: 'liu_bei', b: 'guan_yu', kind: 'oath', vnTitle: 'Kết Nghĩa Đào Viên' },
  { a: 'liu_bei', b: 'zhang_fei', kind: 'oath', vnTitle: 'Kết Nghĩa Đào Viên' },
  { a: 'guan_yu', b: 'zhang_fei', kind: 'oath', vnTitle: 'Huynh Đệ Sinh Tử' },
  { a: 'liu_bei', b: 'zhao_yun', kind: 'kin', vnTitle: 'Đơn Kỵ Trung Nghĩa' },
  { a: 'liu_bei', b: 'zhuge_liang', kind: 'oath', vnTitle: 'Cá Nước Quân Thần' },
  { a: 'guan_yu', b: 'zhao_yun', kind: 'kin', vnTitle: 'Ngũ Hổ Huynh Đệ' },
  { a: 'cao_cao', b: 'xiahou_dun', kind: 'oath', vnTitle: 'Thân Tộc Huyết Thống' },
  { a: 'cao_cao', b: 'sima_xiangan', kind: 'kin', vnTitle: 'Trụ Cột Triều Đình' },
  { a: 'sun_jian', b: 'zhou_yu', kind: 'oath', vnTitle: 'Giang Đông Bá Nghiệp' },
  { a: 'cao_cao', b: 'yuan_shao', kind: 'rival', vnTitle: 'Kình Địch Quan Độ' },
  { a: 'zhou_yu', b: 'zhuge_liang', kind: 'rival', vnTitle: 'Kỳ Phùng Địch Thủ' },
  { a: 'lu_bu', b: 'guan_yu', kind: 'rival', vnTitle: 'Huyết Chiến Hổ Lao' },
  { a: 'lu_bu', b: 'zhang_fei', kind: 'rival', vnTitle: 'Tử Địch Tam Anh' },
];

export function findTwGuanxiBond(a?: TwGeneralId, b?: TwGeneralId): TwGuanxiBond | undefined {
  if (!a || !b || a === b) return undefined;
  return TW_GUANXI_BONDS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

/** Tính chỉ số cộng thêm theo cấp Tinh nhuệ trung đoàn (0..9, kế thừa 0 A.D. Basic->Advanced->Elite & TW3K) */
export function twRankFromKills(kills: number): number {
  const safeKills = Math.max(0, Math.floor(Number(kills) || 0));
  if (safeKills <= 0) return 0;
  const thresholds = [14, 30, 50, 75, 105, 140, 180, 225, 275];
  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (safeKills >= thresholds[i]) rank = i + 1;
    else break;
  }
  return Math.min(TW_MAX_VETERANCY_RANK, rank);
}

export function twVeterancyBonuses(rank: number): {
  meleeAtkAdd: number;
  meleeDefAdd: number;
  moraleAdd: number;
  reloadMul: number;
} {
  const r = Math.max(0, Math.min(TW_MAX_VETERANCY_RANK, Math.floor(Number(rank) || 0)));
  return {
    meleeAtkAdd: Math.round(r * 1.4),
    meleeDefAdd: Math.round(r * 1.5),
    moraleAdd: r * 2,
    reloadMul: Math.max(0.76, 1 - r * 0.025),
  };
}

export type TwDeployableKind = 'stakes' | 'caltrops' | 'oil';
export const TW_DEPLOYABLE_KINDS: readonly TwDeployableKind[] = ['stakes', 'caltrops', 'oil'];

export interface TwDeployableSpec {
  kind: TwDeployableKind;
  vnName: string;
  enName: string;
  glyph: string;
  radius: number;
  maxHp: number;
  slowMul: number;
  antiCavReflect: boolean;
  flammable: boolean;
  stealthUntilDist: number;
  desc: string;
}

export const TW_DEPLOYABLES: Record<TwDeployableKind, TwDeployableSpec> = {
  stakes: {
    kind: 'stakes',
    vnName: 'Chông Gỗ Phản Kỵ',
    enName: 'Wooden Stakes',
    glyph: '🪵',
    radius: 56,
    maxHp: 520,
    slowMul: 0.72,
    antiCavReflect: true,
    flammable: true,
    stealthUntilDist: 9999,
    desc: 'Hàng rào cự mã vót nhọn: xiên thủng Kỵ binh lao vào (phản sát thương nặng & chặn xung kích), dễ bén lửa.',
  },
  caltrops: {
    kind: 'caltrops',
    vnName: 'Chông Sắt Ám Khí',
    enName: 'Iron Caltrops',
    glyph: '✴️',
    radius: 62,
    maxHp: 420,
    slowMul: 0.45,
    antiCavReflect: false,
    flammable: false,
    stealthUntilDist: 165,
    desc: 'Thiết tật lê rải ngầm trên cỏ: tàng hình từ xa, làm chậm -55% tốc chạy, triệt tiêu đà xung kích và rút máu.',
  },
  oil: {
    kind: 'oil',
    vnName: 'Bẫy Dầu Hỏa Công',
    enName: 'Flammable Oil',
    glyph: '🛢️',
    radius: 74,
    maxHp: 360,
    slowMul: 0.75,
    antiCavReflect: false,
    flammable: true,
    stealthUntilDist: 210,
    desc: 'Bãi dầu trơn dễ cháy: gặp Tên Lửa, Kỳ Môn Hỏa Tiễn hay Đá Lửa lập tức bùng nổ thành biển lửa thiêu rụi địch!',
  },
};

export interface TwArmyLoadout {
  generals: [TwGeneralId, TwGeneralId, TwGeneralId];
  retinues: [
    [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind],
    [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind],
    [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind],
  ];
}

export function defaultTwLoadoutForFaction(faction: TwFactionId): TwArmyLoadout {
  const fSpec = TW_FACTIONS[faction] ?? TW_FACTIONS.wei;
  const generals: [TwGeneralId, TwGeneralId, TwGeneralId] = [...fSpec.defaultGenerals];
  const retinues = generals.map(
    (gid) => [...TW_GENERALS[gid].defaultRetinue] as [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind],
  ) as TwArmyLoadout['retinues'];
  return { generals, retinues };
}

/** Danh sách binh chủng được phép chiêu mộ dưới trướng một Danh tướng (Thế lực + Hệ Ngũ Hành mở khóa) */
export function twAllowedUnitsForGeneral(faction: TwFactionId, generalId: TwGeneralId): TwUnitKind[] {
  const fSpec = TW_FACTIONS[faction] ?? TW_FACTIONS.wei;
  const gSpec = TW_GENERALS[generalId];
  const set = new Set<TwUnitKind>(fSpec.availableUnits);
  if (gSpec) {
    for (const defU of gSpec.defaultRetinue) set.add(defU);
    switch (gSpec.class) {
      case 'strategist':
        set.add('archer_militia');
        set.add('crossbowmen');
        set.add('onyx_dragons');
        set.add('trebuchet');
        break;
      case 'vanguard':
        set.add('raider_cavalry');
        set.add('lance_cavalry');
        break;
      case 'champion':
        set.add('ji_militia');
        set.add('spear_guards');
        set.add('heavy_ji_infantry');
        break;
      case 'sentinel':
        set.add('sabre_militia');
        set.add('sabre_infantry');
        set.add('jian_sword_guards');
        break;
      case 'commander':
        set.add('sabre_cavalry');
        set.add('yellow_dragons');
        break;
    }
  }
  return TW_UNIT_KINDS.filter((u) => set.has(u));
}

export function twLoadoutCost(loadout: TwArmyLoadout): number {
  let sum = 0;
  for (let s = 0; s < 3; s++) {
    const ret = loadout.retinues[s];
    if (!ret) continue;
    for (let u = 0; u < 4; u++) {
      const spec = TW_UNITS[ret[u]];
      if (spec) sum += spec.cost;
    }
  }
  return sum;
}

/** Chuẩn hóa đội hình chiêu mộ tùy chỉnh: đảm bảo 3 Danh tướng không trùng lặp & tổng chi phí <= TW_BATTLE_FUNDS */
export function normalizeTwLoadout(raw: unknown, faction: TwFactionId): TwArmyLoadout {
  const fallback = defaultTwLoadoutForFaction(faction);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<TwArmyLoadout>;

  const pickedGens: TwGeneralId[] = [];
  const rawGens = Array.isArray(r.generals) ? r.generals : [];
  for (let i = 0; i < 3; i++) {
    const cand = String(rawGens[i] ?? '');
    if ((TW_GENERAL_IDS as readonly string[]).includes(cand) && !pickedGens.includes(cand as TwGeneralId)) {
      pickedGens.push(cand as TwGeneralId);
    } else {
      const fb =
        fallback.generals.find((g) => !pickedGens.includes(g)) ??
        TW_GENERAL_IDS.find((g) => !pickedGens.includes(g))!;
      pickedGens.push(fb);
    }
  }
  const generals = pickedGens as [TwGeneralId, TwGeneralId, TwGeneralId];

  const retinues = generals.map((gid, slot) => {
    const allowed = twAllowedUnitsForGeneral(faction, gid);
    const allowedSet = new Set<TwUnitKind>(allowed);
    const rawSlot = Array.isArray(r.retinues?.[slot]) ? r.retinues![slot] : [];
    const defRet = TW_GENERALS[gid].defaultRetinue;
    const out: TwUnitKind[] = [];
    for (let u = 0; u < 4; u++) {
      const cand = String(rawSlot[u] ?? '');
      if ((TW_UNIT_KINDS as readonly string[]).includes(cand) && allowedSet.has(cand as TwUnitKind)) {
        out.push(cand as TwUnitKind);
      } else {
        out.push(defRet[u] ?? allowed[0] ?? 'ji_militia');
      }
    }
    return out as [TwUnitKind, TwUnitKind, TwUnitKind, TwUnitKind];
  }) as TwArmyLoadout['retinues'];

  const result: TwArmyLoadout = { generals, retinues };

  // Nếu vượt quá Ngân quỹ Chiến trận 12.500 Lượng -> tự hạ bậc slot đắt nhất về dân binh rẻ nhất của tướng đó
  let guard = 0;
  while (twLoadoutCost(result) > TW_BATTLE_FUNDS && guard++ < 24) {
    let bestS = -1;
    let bestU = -1;
    let bestSaving = 0;
    let bestReplacement: TwUnitKind = 'ji_militia';

    for (let s = 0; s < 3; s++) {
      const allowed = twAllowedUnitsForGeneral(faction, result.generals[s]);
      let cheapest = allowed[0] ?? 'ji_militia';
      for (const a of allowed) {
        if (TW_UNITS[a].cost < TW_UNITS[cheapest].cost) cheapest = a;
      }
      for (let u = 0; u < 4; u++) {
        const cur = result.retinues[s][u];
        const saving = TW_UNITS[cur].cost - TW_UNITS[cheapest].cost;
        if (saving > bestSaving) {
          bestSaving = saving;
          bestS = s;
          bestU = u;
          bestReplacement = cheapest;
        }
      }
    }
    if (bestS < 0 || bestSaving <= 0) break;
    result.retinues[bestS][bestU] = bestReplacement;
  }

  return result;
}

export function normalizeTwFaction(raw: unknown, fallbackIdx = 0): TwFactionId {
  if (typeof raw === 'string' && (TW_FACTION_IDS as readonly string[]).includes(raw)) {
    return raw as TwFactionId;
  }
  const idx = Math.abs(Math.floor(Number(fallbackIdx) || 0)) % TW_FACTION_IDS.length;
  return TW_FACTION_IDS[idx];
}

export function normalizeTwTeam(raw: unknown): number {
  const t = Math.floor(Number(raw));
  return Number.isFinite(t) && t >= 0 && t < TW_MAX_TEAMS ? t : 0;
}

/**
 * Phân bổ Liên Minh (team) theo thứ tự [người..., máy...]:
 * - `ffa`: mỗi thế lực là một phe độc lập (0..n-1).
 * - `historical_2teams`: chia thành 2 Liên Minh đối kháng (0 và 1). Người giữ phe đã chọn (0/1);
 *   máy tự động bù vào Liên Minh ít người hơn. Nếu không có máy mà tất cả người cùng chọn 1 bên thì tự tách chẵn/lẻ.
 */
export function assignTwTeams(humanTeams: number[], bots: number, mode: TwMode): number[] {
  const safeBots = Math.max(0, Math.floor(bots) || 0);
  const total = humanTeams.length + safeBots;
  if (mode === 'ffa') {
    return Array.from({ length: total }, (_, i) => i);
  }

  const teams = humanTeams.map((t) => normalizeTwTeam(t) % 2);
  if (safeBots === 0 && teams.length >= 2 && new Set(teams).size === 1) {
    return teams.map((_, i) => i % 2);
  }

  const counts: [number, number] = [
    teams.filter((t) => t === 0).length,
    teams.filter((t) => t === 1).length,
  ];
  for (let b = 0; b < safeBots; b++) {
    const pick = counts[0] <= counts[1] ? 0 : 1;
    teams.push(pick);
    counts[pick]++;
  }
  return teams;
}

/** Tính quân số tối đa của một trung đoàn theo quy mô đại quân ('normal' | 'grand') */
export function twScaledMaxMen(kind: TwUnitKind, armyScale: TwArmyScale = 'normal'): number {
  const base = TW_UNITS[kind].maxMen;
  if (armyScale !== 'grand') return base;
  return Math.max(4, Math.round((base * 1.25) / 4) * 4);
}

/** Kiểm tra tọa độ (px, py) có nằm trong vùng địa hình elip xoay hay không */
export function twPointInTerrainZone(px: number, py: number, zone: TwTerrainZone): boolean {
  const dx = px - zone.x;
  const dy = py - zone.y;
  const c = Math.cos(zone.rot);
  const s = Math.sin(zone.rot);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const nx = lx / Math.max(1, zone.rx);
  const ny = ly / Math.max(1, zone.ry);
  return nx * nx + ny * ny <= 1;
}

// ============================================================================
// 9. GIAO THỨC THỜI GIAN THỰC (REALTIME PROTOCOL TYPES)
// ============================================================================

export type TwMoraleState = 'eager' | 'steady' | 'wavering' | 'routing' | 'shattered';
export type TwFatigueState = 'fresh' | 'active' | 'winded' | 'exhausted';
export type TwAnimState =
  | 'idle'
  | 'march'
  | 'charge'
  | 'attack'
  | 'shoot'
  | 'brace'
  | 'rout'
  | 'duel'
  | 'dead';

export interface TwRegimentFrame {
  id: number;
  ownerIdx: number;
  /** Ô tướng chỉ huy (0..2) */
  generalSlot: number;
  kind: TwUnitKind;
  isGeneral: boolean;
  generalId?: TwGeneralId;
  x: number;
  y: number;
  facing: number;
  width: number;
  depth: number;
  cols: number;
  men: number;
  maxMen: number;
  hp: number;
  maxHp: number;
  morale: number;
  moraleState: TwMoraleState;
  fatigue: TwFatigueState;
  ammo: number;
  maxAmmo: number;
  formation: TwFormation;
  anim: TwAnimState;
  hidden: boolean;
  inForest: boolean;
  onHighGround: boolean;
  guardMode: boolean;
  fireAtWill: boolean;
  skirmishMode: boolean;
  /** Bật chế độ bắn Tên Lửa (Fire Arrows) cho cung thủ để đốt rừng / bẫy dầu & khủng bố sĩ khí */
  fireArrows?: boolean;
  /** Cấp Tinh nhuệ trung đoàn (0..9 — Đồng / Bạc / Vàng) */
  rank?: number;
  /** Đang bị thiêu đốt trong vùng Hỏa Công */
  burning?: boolean;
  /** Trạng thái Quan Hệ Tướng Lĩnh (Đồng Tâm / Cuồng Nộ Báo Thù / Kình Địch) */
  guanxiState?: 'harmony' | 'enraged' | 'rival';
  lockedTargetId?: number;
  moveTargetX?: number;
  moveTargetY?: number;
  moveTargetFacing?: number;
  skillCooldownLeft?: number;
  activeBuff?: string;
  kills: number;
}

export type TwProjectileKind = 'arrow' | 'fire_arrow' | 'bolt' | 'boulder';

export interface TwProjectileFrame {
  id: number;
  kind: TwProjectileKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  progress: number;
  ownerIdx: number;
}

export interface TwDuelFrame {
  id: number;
  genARegId: number;
  genBRegId: number;
  generalA: TwGeneralId;
  generalB: TwGeneralId;
  ownerA: number;
  ownerB: number;
  x: number;
  y: number;
  hpA: number;
  maxHpA: number;
  hpB: number;
  maxHpB: number;
  timerLeft: number;
  clashPhase: number;
  stanceA?: TwDuelStance;
  stanceB?: TwDuelStance;
}

export interface TwBanterEvent {
  id: number;
  leftGeneral: TwGeneralId;
  leftOwnerIdx: number;
  leftLine: string;
  rightGeneral: TwGeneralId;
  rightOwnerIdx: number;
  rightLine: string;
  atTick: number;
}

export interface TwCaptureState {
  id: number;
  ownerTeam: number | -1;
  progress: number;
  /** Tiến độ nạp loạt tên Tháp Tiễn Thành Lũy (0..1) khi đài đã được chiếm giữ */
  towerCooldownPct?: number;
}

export interface TwFireZoneFrame {
  id: number;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  leftSec: number;
  ownerIdx: number;
}

export interface TwDeployableFrame {
  id: number;
  kind: TwDeployableKind;
  ownerIdx: number;
  team: number;
  x: number;
  y: number;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  hidden?: boolean;
}

export interface TwDeployZoneSpec {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
}

export interface TwSideSummary {
  idx: number;
  id: string;
  name: string;
  bot: boolean;
  faction: TwFactionId;
  team: number;
  color: string;
  alive: boolean;
  totalMen: number;
  initialMen: number;
  regimentsAlive: number;
  kills: number;
  score: number;
  readyDeploy?: boolean;
  deployablesLeft?: Record<TwDeployableKind, number>;
}

export type TwSfxEvent =
  | 'horn'
  | 'drums'
  | 'clash'
  | 'volley'
  | 'charge'
  | 'boulder'
  | 'duel_gong'
  | 'rout'
  | 'cheer'
  | 'fire';

export interface TwFrame {
  tick: number;
  timeRemainingSec: number;
  battlePhase?: TwBattlePhase;
  deploymentLeftSec?: number;
  battleSpeed?: TwBattleSpeed;
  windAngle?: number;
  windStrength?: number;
  myDeployZone?: TwDeployZoneSpec;
  balanceOfPower: number[];
  sides: TwSideSummary[];
  regiments: TwRegimentFrame[];
  projectiles: TwProjectileFrame[];
  duels: TwDuelFrame[];
  banters: TwBanterEvent[];
  captures: TwCaptureState[];
  fires?: TwFireZoneFrame[];
  deployables?: TwDeployableFrame[];
  sfxEvents: TwSfxEvent[];
}

export type TwStanceKind = 'guard' | 'fire_at_will' | 'skirmish';

export type TwCommand =
  | { t: 'move_line'; regIds: number[]; x: number; y: number; facing: number; width?: number; run?: boolean }
  | { t: 'attack_target'; regIds: number[]; targetRegId: number }
  | { t: 'halt'; regIds: number[] }
  | { t: 'set_formation'; regIds: number[]; formation: TwFormation }
  | { t: 'toggle_stance'; regIds: number[]; stance: 'guard' | 'fire_at_will' | 'skirmish'; value: boolean }
  | { t: 'toggle_fire_arrows'; regIds: number[]; value: boolean }
  | { t: 'place_deployable'; kind: TwDeployableKind; x: number; y: number; facing?: number }
  | { t: 'ready_deploy'; ready?: boolean }
  | { t: 'set_speed'; speed: TwBattleSpeed }
  | { t: 'duel_action'; duelId: number; action: 'press' | 'guard' | 'retreat' }
  | { t: 'use_skill'; generalRegId: number; targetX?: number; targetY?: number; targetRegId?: number }
  | { t: 'challenge_duel'; generalRegId: number; targetGeneralRegId: number }
  | { t: 'resign' };

export interface TwPlayerInfo {
  idx: number;
  /** playerId; máy là "bot:tw<n>" */
  id: string;
  name: string;
  faction: TwFactionId;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
  generals?: [TwGeneralId, TwGeneralId, TwGeneralId];
}

export interface TwResult {
  winnerTeam: number;
  winnerIdxs: number[];
  reason: string;
  scores: number[];
  kills?: number[];
  remainingMen?: number[];
  durationSec?: number;
  victoryKind?: 'heroic' | 'decisive' | 'close' | 'pyrrhic' | 'draw';
}

export interface TwRoomView {
  config: TwConfig;
  /** Phòng chờ: thế lực (TwFactionId) từng playerId đã chọn */
  factions?: Record<string, TwFactionId>;
  /** Phòng chờ: liên minh / đội từng playerId đã chọn */
  teams?: Record<string, number>;
  /** Phòng chờ: đội hình Danh tướng & Bộ tùy tùy chỉnh của từng người chơi */
  loadouts?: Record<string, TwArmyLoadout>;
  mapId?: TwMapId;
  mapW?: number;
  mapH?: number;
  players?: TwPlayerInfo[];
  /** Chỉ số phe của mình (undefined = khán giả / đã rời) */
  myIdx?: number;
  startedAt?: number;
  endsAt?: number;
  result?: TwResult;
}
