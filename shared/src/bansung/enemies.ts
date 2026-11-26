/**
 * Shared enemy, boss, wave director, endless mutator, perk, crate, and pickup
 * definitions for Ban Sung (`bansung`) 30Hz co-op mode.
 *
 * Aligns design specs d02, d32, d34-d40 with zero runtime dependencies.
 */

import type {
  BansungBiome,
  BansungEnemyId,
  BansungHazardWire,
  BansungPerkId,
  BansungPickupKind,
  BansungPropKind,
  BansungSurvivalStageId,
  BansungTelegraphWire,
} from './types';

// ---------------------------------------------------------------------------
// 1. Enemies & Bosses (d34, d35, d36, d37, d38, d39)
// ---------------------------------------------------------------------------

export type BansungArmorType = 'light' | 'armored';
export type BansungEnemyRole = 'melee' | 'bomber' | 'brute' | 'ranged' | 'caster' | 'boss';
export type BansungMeleeKind =
  | 'scarab'
  | 'skirmisher'
  | 'bomb_goblin'
  | 'cactus_brute'
  | 'venom_stalker'
  | 'shield_warden'
  | 'saw_berserker'
  | 'mirror_knight'
  | 'blight_bomber'
  | 'volt_stalker'
  | 'magma_brute';
export type BansungRangedKind =
  | 'cactus_spitter'
  | 'laser_sniper'
  | 'pyro_shaman'
  | 'thunder_mage'
  | 'frost_mage'
  | 'mortar_beetle'
  | 'void_acolyte'
  | 'healing_priest'
  | 'shock_drone_mk2'
  | 'magnet_drone'
  | 'solar_priest';
export type BansungBossKind =
  | 'boss_arsenal'
  | 'boss_beholder'
  | 'boss_colossus'
  | 'boss_overlord'
  | 'boss_tempest'
  | 'boss_destroyer'
  | 'boss_frost_empress'
  | 'boss_abyssal_leviathan'
  | 'boss_storm_herald';

export type BansungEnemyState =
  | 'idle'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'lunge'
  | 'fuse'
  | 'stunned'
  | 'dead';

export const BANSUNG_ENEMY_STATE_INDEX: Readonly<Record<BansungEnemyState, number>> = {
  idle: 0,
  chase: 1,
  windup: 2,
  attack: 3,
  lunge: 4,
  fuse: 5,
  stunned: 6,
  dead: 7,
};

/** `[frames, cellW, cellH, offX, offY, fps?, hitFrame?]` matching Miragine sheet conventions. */
export type BansungEnemyAnimMeta = readonly [
  frames: number,
  cellW: number,
  cellH: number,
  offX: number,
  offY: number,
  fps?: number,
  hitFrame?: number,
];

export interface BansungEnemyStats {
  /** Wire index 0..11 matching BANSUNG_ENEMY_IDS order */
  kindId: number;
  id: BansungEnemyId;
  name: string;
  vnName: string;
  /** Tên hiển thị tiếng Anh ngắn gọn (1–2 từ) cho HUD / thanh máu boss — spec 007 Đêm Zombie. */
  shortName?: string;
  isBoss: boolean;
  role: BansungEnemyRole;
  /** First wave this unit naturally enters spawn rotation */
  unlockWave: number;
  /** Wave director budget cost (0 for bosses) */
  cost: number;
  /** Base 1P Wave-1 HP */
  hp: number;
  /** 0 = light, 1 = armored (Miragine War parity) */
  armorTypeID: 0 | 1;
  armorType: BansungArmorType;
  /** Flat reduction per hit (min 1 dmg) */
  armor: number;
  /** Movement speed in px/s at 30Hz */
  speed: number;
  /** Collision circle radius in px */
  radius: number;
  /** Boids / knockback weight (bosses use 999 and invMass=0) */
  mass: number;
  /** 0..1 knockback reduction */
  kbResist: number;
  /** Stun duration multiplier / DR */
  stunMult: number;
  /** Primary melee / projectile / detonation damage */
  damage: number;
  /** Center-to-center engagement / max attack trigger range in px */
  attackRange: number;
  /** Preferred standoff band [min, max] in px for ranged/caster/boss */
  preferredRange?: readonly [number, number];
  /** Distance below which ranged/casters backpedal (px) */
  backoffDist?: number;
  /** Telegraph / windup duration in 30Hz ticks */
  windupTicks: number;
  /** Recovery cooldown between attacks in 30Hz ticks */
  cooldownTicks: number;
  /** Kill score & drop weight */
  score: number;
  /** Multiplier on Miragine shadow.png (38x16) */
  shadowScale: number;
  /** Canonical sprite facing ('right' for normalized sheets, 'left' for Miragine A/B sheets) */
  nativeFacing: 'left' | 'right';
  /** Per-state Miragine-style frame specs */
  anims: Record<string, BansungEnemyAnimMeta>;
}

export const BANSUNG_ENEMY_ORDER: readonly BansungEnemyId[] = [
  'scarab',
  'skirmisher',
  'bomb_goblin',
  'cactus_brute',
  'cactus_spitter',
  'laser_sniper',
  'pyro_shaman',
  'thunder_mage',
  'boss_beholder',
  'boss_colossus',
  'boss_overlord',
  'iron_drone',
  'boss_arsenal',
  'frost_mage',
  'venom_stalker',
  'shield_warden',
  'mortar_beetle',
  'void_acolyte',
  'saw_berserker',
  'healing_priest',
  'shock_drone_mk2',
  'chrono_mage',
  'plasma_golem',
  'sniper_mech',
  'plague_bearer',
  'crimson_lancer',
  'void_reaper',
  'boss_tempest',
  'boss_destroyer',
  'boss_frost_empress',
  'boss_abyssal_leviathan',
  'mirror_knight',
  'magnet_drone',
  'blight_bomber',
  'volt_stalker',
  'solar_priest',
  'magma_brute',
  'boss_storm_herald',
] as const;

export const BANSUNG_MOB_IDS: readonly BansungEnemyId[] = [
  ...BANSUNG_ENEMY_ORDER.slice(0, 8),
  'frost_mage',
  'venom_stalker',
  'shield_warden',
  'mortar_beetle',
  'void_acolyte',
  'saw_berserker',
  'healing_priest',
  'shock_drone_mk2',
  'chrono_mage',
  'plasma_golem',
  'sniper_mech',
  'plague_bearer',
  'crimson_lancer',
  'void_reaper',
  'mirror_knight',
  'magnet_drone',
  'blight_bomber',
  'volt_stalker',
  'solar_priest',
  'magma_brute',
  'boss_storm_herald',
] as const;
export const BANSUNG_BOSS_IDS: readonly BansungEnemyId[] = [
  'boss_arsenal',
  'boss_overlord',
  'boss_colossus',
  'boss_beholder',
  'boss_tempest',
  'boss_destroyer',
  'boss_frost_empress',
  'boss_abyssal_leviathan',
  'boss_storm_herald',
] as const;
export const BANSUNG_SUMMON_IDS: readonly BansungEnemyId[] = ['iron_drone'] as const;

/** Authoritative stats & sprite metadata for all 8 regular mobs, 4 bosses, and boss summons. */
export const BANSUNG_ENEMIES: Record<BansungEnemyId, BansungEnemyStats> = {
  scarab: {
    kindId: 0,
    id: 'scarab',
    name: 'Desert Scarab',
    vnName: 'Bọ Hung Sa Mạc',
    shortName: 'Crawler',
    isBoss: false,
    role: 'melee',
    unlockWave: 1,
    cost: 1,
    hp: 72,
    armorTypeID: 0,
    armorType: 'light',
    armor: 2,
    speed: 148,
    radius: 10,
    mass: 0.7,
    kbResist: 0,
    stunMult: 1.0,
    damage: 12,
    attackRange: 24,
    windupTicks: 5,
    cooldownTicks: 22,
    score: 10,
    shadowScale: 0.75,
    nativeFacing: 'right',
    anims: {
      idle: [6, 32, 32, -16, -28, 4],
      run: [8, 32, 32, -16, -28, 12],
      attack: [8, 32, 32, -16, -28, 16, 2],
      dead: [8, 32, 32, -16, -28, 10],
    },
  },
  skirmisher: {
    kindId: 1,
    id: 'skirmisher',
    name: 'Bone Skirmisher',
    vnName: 'Kỵ Xương Sa Mạc',
    shortName: 'Runner',
    isBoss: false,
    role: 'melee',
    unlockWave: 1,
    cost: 2,
    hp: 138,
    armorTypeID: 0,
    armorType: 'light',
    armor: 3,
    speed: 118,
    radius: 12,
    mass: 1.0,
    kbResist: 0.15,
    stunMult: 1.0,
    damage: 15,
    attackRange: 28,
    windupTicks: 8,
    cooldownTicks: 27,
    score: 22,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 5],
      run: [8, 48, 48, -24, -44, 12],
      attack: [8, 48, 48, -24, -44, 15, 3],
      lunge: [6, 48, 48, -24, -44, 14],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  bomb_goblin: {
    kindId: 2,
    id: 'bomb_goblin',
    name: 'Bomb Goblin',
    vnName: 'Goblin Ôm Bom',
    shortName: 'Bloater',
    isBoss: false,
    role: 'bomber',
    unlockWave: 2,
    cost: 3,
    hp: 115,
    armorTypeID: 0,
    armorType: 'light',
    armor: 2,
    speed: 104,
    radius: 12,
    mass: 0.9,
    kbResist: 0.1,
    stunMult: 1.15,
    damage: 42,
    attackRange: 180,
    windupTicks: 42,
    cooldownTicks: 30,
    score: 30,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 5],
      run: [8, 48, 48, -24, -44, 12],
      fuse_run: [8, 48, 48, -24, -44, 16],
      spark: [4, 48, 48, -24, -44, 18],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  cactus_brute: {
    kindId: 3,
    id: 'cactus_brute',
    name: 'Heavy Cactus Brute',
    vnName: 'Xương Rồng Khổng Lồ',
    shortName: 'Tank',
    isBoss: false,
    role: 'brute',
    unlockWave: 3,
    cost: 6,
    hp: 480,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 3,
    speed: 72,
    radius: 18,
    mass: 3.5,
    kbResist: 0.65,
    stunMult: 0.5,
    damage: 28,
    attackRange: 38,
    windupTicks: 14,
    cooldownTicks: 45,
    score: 65,
    shadowScale: 1.45,
    nativeFacing: 'right',
    anims: {
      idle: [6, 64, 64, -32, -58, 4],
      run: [8, 64, 64, -32, -58, 8],
      attack: [8, 64, 64, -32, -58, 12, 4],
      slam: [8, 64, 64, -32, -58, 12, 4],
      dead: [8, 64, 64, -32, -58, 8],
    },
  },
  cactus_spitter: {
    kindId: 4,
    id: 'cactus_spitter',
    name: 'Cactus Spitter',
    vnName: 'Xương Rồng Phun Gai',
    shortName: 'Spitter',
    isBoss: false,
    role: 'ranged',
    unlockWave: 1,
    cost: 3,
    hp: 135,
    armorTypeID: 0,
    armorType: 'light',
    armor: 2,
    speed: 78,
    radius: 13,
    mass: 1.0,
    kbResist: 0.1,
    stunMult: 1.0,
    damage: 15,
    attackRange: 320,
    preferredRange: [210, 320],
    backoffDist: 140,
    windupTicks: 8,
    cooldownTicks: 54,
    score: 28,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -46, 5],
      run: [8, 48, 48, -24, -46, 12],
      attack: [8, 48, 48, -24, -46, 15, 3],
      dead: [8, 48, 48, -24, -46, 10],
    },
  },
  laser_sniper: {
    kindId: 5,
    id: 'laser_sniper',
    name: 'Red-Laser Sniper',
    vnName: 'Xạ Thủ Tia Đỏ',
    shortName: 'Sniper',
    isBoss: false,
    role: 'ranged',
    unlockWave: 2,
    cost: 6,
    hp: 125,
    armorTypeID: 0,
    armorType: 'light',
    armor: 2,
    speed: 84,
    radius: 12,
    mass: 1.0,
    kbResist: 0.1,
    stunMult: 1.0,
    damage: 34,
    attackRange: 560,
    preferredRange: [360, 560],
    backoffDist: 220,
    windupTicks: 33,
    cooldownTicks: 78,
    score: 45,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -46, 5],
      run: [8, 48, 48, -24, -46, 12],
      attack: [8, 48, 48, -24, -46, 12, 5],
      dead: [8, 48, 48, -24, -46, 10],
    },
  },
  pyro_shaman: {
    kindId: 6,
    id: 'pyro_shaman',
    name: 'Pyro Shaman',
    vnName: 'Pháp Sư Hỏa Ngục',
    shortName: 'Burner',
    isBoss: false,
    role: 'caster',
    unlockWave: 3,
    cost: 5,
    hp: 210,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 4,
    speed: 74,
    radius: 13,
    mass: 1.1,
    kbResist: 0.2,
    stunMult: 0.9,
    damage: 24,
    attackRange: 380,
    preferredRange: [240, 380],
    backoffDist: 160,
    windupTicks: 14,
    cooldownTicks: 72,
    score: 48,
    shadowScale: 1.0,
    nativeFacing: 'left',
    anims: {
      idle: [6, 42, 58, -26, -60, 6],
      run: [8, 63, 56, -33, -57, 12],
      attack: [8, 65, 59, -45, -61, 14, 4],
      dead: [8, 92, 55, -29, -56, 10],
    },
  },
  thunder_mage: {
    kindId: 7,
    id: 'thunder_mage',
    name: 'Thunder Mage',
    vnName: 'Pháp Sư Sấm Sét',
    shortName: 'Shocker',
    isBoss: false,
    role: 'caster',
    unlockWave: 4,
    cost: 7,
    hp: 195,
    armorTypeID: 0,
    armorType: 'light',
    armor: 3,
    speed: 80,
    radius: 12,
    mass: 1.0,
    kbResist: 0.15,
    stunMult: 0.9,
    damage: 30,
    attackRange: 440,
    preferredRange: [280, 440],
    backoffDist: 175,
    windupTicks: 12,
    cooldownTicks: 81,
    score: 55,
    shadowScale: 1.0,
    nativeFacing: 'left',
    anims: {
      idle: [6, 29, 56, -17, -55, 6],
      run: [8, 52, 52, -27, -52, 12],
      attack: [8, 41, 56, -27, -56, 14, 4],
      dead: [8, 71, 61, -25, -52, 10],
    },
  },
  boss_beholder: {
    kindId: 8,
    id: 'boss_beholder',
    name: 'Sand Beholder — King Cactus',
    vnName: 'Nhãn Ma Xương Rồng',
    shortName: 'Brood Eye',
    isBoss: true,
    role: 'boss',
    unlockWave: 4,
    cost: 0,
    hp: 6400,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 16,
    speed: 72,
    radius: 34,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.0,
    damage: 26,
    attackRange: 640,
    preferredRange: [190, 280],
    backoffDist: 140,
    windupTicks: 15,
    cooldownTicks: 108,
    score: 1500,
    shadowScale: 2.4,
    nativeFacing: 'left',
    anims: {
      idle: [4, 96, 96, -48, -86, 6],
      move: [6, 96, 96, -48, -86, 8],
      volley_cast: [5, 96, 96, -48, -86, 10, 3],
      slam_leap: [6, 96, 96, -48, -86, 8, 4],
      beam_windup: [4, 96, 96, -48, -86, 6],
      enrage_roar: [5, 96, 96, -48, -86, 8],
      stagger: [3, 96, 96, -48, -86, 5],
      dead: [6, 96, 96, -48, -86, 6],
    },
  },
  boss_colossus: {
    kindId: 9,
    id: 'boss_colossus',
    name: 'Dread Colossus',
    vnName: 'Cự Nhân Thiết Giáp',
    shortName: 'Iron Hulk',
    isBoss: true,
    role: 'boss',
    unlockWave: 7,
    cost: 0,
    hp: 10500,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 22,
    speed: 86,
    radius: 34,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.0,
    damage: 42,
    attackRange: 560,
    preferredRange: [95, 280],
    backoffDist: 0,
    windupTicks: 24,
    cooldownTicks: 54,
    score: 2200,
    shadowScale: 2.2,
    nativeFacing: 'left',
    anims: {
      idle: [3, 81, 63, -54, -62, 6],
      run: [6, 103, 55, -65, -55, 10],
      attack: [4, 112, 96, -64, -96, 12, 2],
      dead: [3, 91, 61, -56, -56, 8],
    },
  },
  boss_overlord: {
    kindId: 10,
    id: 'boss_overlord',
    name: 'Overlord Gunship Core',
    vnName: 'Pháo Đài Lõi Tối Thượng',
    shortName: 'Plague Core',
    isBoss: true,
    role: 'boss',
    unlockWave: 10,
    cost: 0,
    hp: 14500,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 22,
    speed: 95,
    radius: 44,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.45,
    damage: 28,
    attackRange: 640,
    preferredRange: [220, 300],
    backoffDist: 160,
    windupTicks: 40,
    cooldownTicks: 108,
    score: 3500,
    shadowScale: 2.8,
    nativeFacing: 'right',
    anims: {
      idle: [4, 128, 128, -64, -84, 8],
      charge: [4, 128, 128, -64, -84, 12],
      stun: [2, 128, 128, -64, -84, 10],
      dead: [6, 128, 128, -64, -84, 10],
    },
  },
  iron_drone: {
    kindId: 11,
    id: 'iron_drone',
    name: 'Iron Aegis Drone',
    vnName: 'Drone Khiên Sắt',
    shortName: 'Crow',
    isBoss: false,
    role: 'ranged',
    unlockWave: 7,
    cost: 0,
    hp: 320,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 2,
    speed: 110,
    radius: 14,
    mass: 2.0,
    kbResist: 0.4,
    stunMult: 0.5,
    damage: 14,
    attackRange: 340,
    preferredRange: [150, 240],
    backoffDist: 100,
    windupTicks: 12,
    cooldownTicks: 60,
    score: 120,
    shadowScale: 0.9,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -46, 8],
      run: [8, 48, 48, -24, -46, 12],
      attack: [8, 48, 48, -24, -46, 12, 2],
      dead: [8, 48, 48, -24, -46, 10],
    },
  },
  boss_arsenal: {
    kindId: 12,
    id: 'boss_arsenal',
    name: 'Arsenal Dread Gunner',
    vnName: 'Boss Súng Hủy Diệt',
    shortName: 'Gunner',
    isBoss: true,
    role: 'boss',
    unlockWave: 2,
    cost: 0,
    hp: 7200,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 18,
    speed: 88,
    radius: 42,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.55,
    damage: 22,
    attackRange: 620,
    preferredRange: [200, 310],
    backoffDist: 140,
    windupTicks: 30,
    cooldownTicks: 54,
    score: 2200,
    shadowScale: 2.8,
    nativeFacing: 'right',
    anims: {
      idle: [4, 128, 128, -64, -90, 8],
      run: [4, 128, 128, -64, -90, 10],
      attack: [4, 128, 128, -64, -90, 12, 1],
      dead: [4, 128, 128, -64, -90, 8],
    },
  },
  frost_mage: {
    kindId: 13,
    id: 'frost_mage',
    name: 'Cryo Arcanist',
    vnName: 'Pháp Sư Băng Giá',
    shortName: 'Frost',
    isBoss: false,
    role: 'caster',
    unlockWave: 3,
    cost: 4,
    hp: 190,
    armorTypeID: 0,
    armorType: 'light',
    armor: 4,
    speed: 96,
    radius: 14,
    mass: 1.0,
    kbResist: 0.15,
    stunMult: 0.9,
    damage: 20,
    attackRange: 360,
    preferredRange: [210, 320],
    backoffDist: 135,
    windupTicks: 16,
    cooldownTicks: 54,
    score: 65,
    shadowScale: 1.0,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 12],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  venom_stalker: {
    kindId: 14,
    id: 'venom_stalker',
    name: 'Venom Stalker',
    vnName: 'Sát Thủ Độc Dược',
    shortName: 'Stalker',
    isBoss: false,
    role: 'melee',
    unlockWave: 2,
    cost: 3,
    hp: 165,
    armorTypeID: 0,
    armorType: 'light',
    armor: 3,
    speed: 148,
    radius: 13,
    mass: 0.9,
    kbResist: 0.1,
    stunMult: 1.0,
    damage: 18,
    attackRange: 250,
    preferredRange: [30, 80],
    backoffDist: 0,
    windupTicks: 10,
    cooldownTicks: 42,
    score: 52,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 14],
      attack: [8, 48, 48, -24, -44, 14, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  shield_warden: {
    kindId: 15,
    id: 'shield_warden',
    name: 'Aegis Shield Warden',
    vnName: 'Hộ Vệ Khiên Thép',
    shortName: 'Riot',
    isBoss: false,
    role: 'brute',
    unlockWave: 5,
    cost: 6,
    hp: 540,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 10,
    speed: 78,
    radius: 19,
    mass: 3.5,
    kbResist: 0.72,
    stunMult: 0.5,
    damage: 28,
    attackRange: 135,
    preferredRange: [40, 100],
    backoffDist: 0,
    windupTicks: 22,
    cooldownTicks: 78,
    score: 95,
    shadowScale: 1.35,
    nativeFacing: 'right',
    anims: {
      idle: [6, 56, 56, -28, -50, 7],
      run: [8, 56, 56, -28, -50, 10],
      attack: [8, 56, 56, -28, -50, 11, 2],
      dead: [8, 56, 56, -28, -50, 9],
    },
  },
  mortar_beetle: {
    kindId: 16,
    id: 'mortar_beetle',
    name: 'Artillery Mortar Beetle',
    vnName: 'Bọ Pháo Cối Hạng Nặng',
    shortName: 'Mortar',
    isBoss: false,
    role: 'ranged',
    unlockWave: 4,
    cost: 5,
    hp: 240,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 6,
    speed: 82,
    radius: 16,
    mass: 1.8,
    kbResist: 0.35,
    stunMult: 0.8,
    damage: 28,
    attackRange: 460,
    preferredRange: [260, 400],
    backoffDist: 160,
    windupTicks: 30,
    cooldownTicks: 72,
    score: 78,
    shadowScale: 1.15,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 7],
      run: [8, 48, 48, -24, -44, 11],
      attack: [8, 48, 48, -24, -44, 11, 2],
      dead: [8, 48, 48, -24, -44, 9],
    },
  },
  void_acolyte: {
    kindId: 17,
    id: 'void_acolyte',
    name: 'Void Singularity Acolyte',
    vnName: 'Giáo Đồ Hư Không',
    shortName: 'Acolyte',
    isBoss: false,
    role: 'caster',
    unlockWave: 6,
    cost: 6,
    hp: 215,
    armorTypeID: 0,
    armorType: 'light',
    armor: 4,
    speed: 94,
    radius: 14,
    mass: 1.0,
    kbResist: 0.15,
    stunMult: 0.85,
    damage: 24,
    attackRange: 400,
    preferredRange: [230, 340],
    backoffDist: 140,
    windupTicks: 24,
    cooldownTicks: 70,
    score: 82,
    shadowScale: 1.0,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 12],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  saw_berserker: {
    kindId: 18,
    id: 'saw_berserker',
    name: 'Sawblade Berserker',
    vnName: 'Cuồng Chiến Máy Cưa',
    shortName: 'Sawman',
    isBoss: false,
    role: 'melee',
    unlockWave: 4,
    cost: 5,
    hp: 300,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 6,
    speed: 132,
    radius: 16,
    mass: 1.6,
    kbResist: 0.35,
    stunMult: 0.75,
    damage: 26,
    attackRange: 185,
    preferredRange: [30, 90],
    backoffDist: 0,
    windupTicks: 15,
    cooldownTicks: 46,
    score: 76,
    shadowScale: 1.15,
    nativeFacing: 'right',
    anims: {
      idle: [6, 56, 56, -28, -50, 8],
      run: [8, 56, 56, -28, -50, 14],
      attack: [8, 56, 56, -28, -50, 14, 2],
      dead: [8, 56, 56, -28, -50, 10],
    },
  },
  healing_priest: {
    kindId: 19,
    id: 'healing_priest',
    name: 'Verdant Cleric',
    vnName: 'Tế Tư Hồi Sinh',
    shortName: 'Priest',
    isBoss: false,
    role: 'caster',
    unlockWave: 5,
    cost: 5,
    hp: 225,
    armorTypeID: 0,
    armorType: 'light',
    armor: 4,
    speed: 92,
    radius: 14,
    mass: 1.0,
    kbResist: 0.2,
    stunMult: 0.9,
    damage: 18,
    attackRange: 380,
    preferredRange: [230, 340],
    backoffDist: 150,
    windupTicks: 26,
    cooldownTicks: 84,
    score: 85,
    shadowScale: 1.0,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 7],
      run: [8, 48, 48, -24, -44, 11],
      attack: [8, 48, 48, -24, -44, 11, 2],
      dead: [8, 48, 48, -24, -44, 9],
    },
  },
  shock_drone_mk2: {
    kindId: 20,
    id: 'shock_drone_mk2',
    name: 'Shock Drone Mk.II',
    vnName: 'Drone Sấm Sét Mk.II',
    shortName: 'Volt Crow',
    isBoss: false,
    role: 'ranged',
    unlockWave: 6,
    cost: 5,
    hp: 250,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 6,
    speed: 126,
    radius: 14,
    mass: 1.4,
    kbResist: 0.3,
    stunMult: 0.65,
    damage: 20,
    attackRange: 360,
    preferredRange: [180, 290],
    backoffDist: 120,
    windupTicks: 16,
    cooldownTicks: 50,
    score: 80,
    shadowScale: 0.95,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -46, 9],
      run: [8, 48, 48, -24, -46, 13],
      attack: [8, 48, 48, -24, -46, 13, 2],
      dead: [8, 48, 48, -24, -46, 10],
    },
  },
  chrono_mage: {
    kindId: 21,
    id: 'chrono_mage',
    name: 'Chrono Weaver',
    vnName: 'Pháp Sư Thời Không',
    shortName: 'Warper',
    isBoss: false,
    role: 'caster',
    unlockWave: 3,
    cost: 5,
    hp: 220,
    armorTypeID: 0,
    armorType: 'light',
    armor: 4,
    speed: 102,
    radius: 14,
    mass: 1.0,
    kbResist: 0.2,
    stunMult: 0.85,
    damage: 22,
    attackRange: 400,
    preferredRange: [220, 340],
    backoffDist: 145,
    windupTicks: 18,
    cooldownTicks: 60,
    score: 85,
    shadowScale: 1.0,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 12],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  plasma_golem: {
    kindId: 22,
    id: 'plasma_golem',
    name: 'Plasma Colossus',
    vnName: 'Khổng Lồ Plasma',
    shortName: 'Void Tank',
    isBoss: false,
    role: 'brute',
    unlockWave: 4,
    cost: 7,
    hp: 560,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 11,
    speed: 68,
    radius: 22,
    mass: 2.6,
    kbResist: 0.72,
    stunMult: 0.6,
    damage: 34,
    attackRange: 280,
    preferredRange: [80, 220],
    backoffDist: 0,
    windupTicks: 22,
    cooldownTicks: 64,
    score: 130,
    shadowScale: 1.45,
    nativeFacing: 'right',
    anims: {
      idle: [6, 64, 64, -32, -56, 7],
      run: [8, 64, 64, -32, -56, 10],
      attack: [8, 64, 64, -32, -56, 12, 2],
      dead: [8, 64, 64, -32, -56, 10],
    },
  },
  sniper_mech: {
    kindId: 23,
    id: 'sniper_mech',
    name: 'Rail Sniper Mech',
    vnName: 'Robot Bắn Tỉa',
    shortName: 'Marksman',
    isBoss: false,
    role: 'ranged',
    unlockWave: 5,
    cost: 6,
    hp: 245,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 7,
    speed: 88,
    radius: 15,
    mass: 1.3,
    kbResist: 0.35,
    stunMult: 0.85,
    damage: 36,
    attackRange: 640,
    preferredRange: [340, 560],
    backoffDist: 210,
    windupTicks: 34,
    cooldownTicks: 76,
    score: 110,
    shadowScale: 1.05,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 7],
      run: [8, 48, 48, -24, -44, 11],
      attack: [8, 48, 48, -24, -44, 14, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  plague_bearer: {
    kindId: 24,
    id: 'plague_bearer',
    name: 'Plague Alchemist',
    vnName: 'Sứ Giả Dịch Bệnh',
    shortName: 'Plaguer',
    isBoss: false,
    role: 'caster',
    unlockWave: 5,
    cost: 6,
    hp: 295,
    armorTypeID: 0,
    armorType: 'light',
    armor: 6,
    speed: 86,
    radius: 16,
    mass: 1.4,
    kbResist: 0.3,
    stunMult: 0.9,
    damage: 22,
    attackRange: 360,
    preferredRange: [180, 310],
    backoffDist: 115,
    windupTicks: 20,
    cooldownTicks: 62,
    score: 95,
    shadowScale: 1.1,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 11],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  crimson_lancer: {
    kindId: 25,
    id: 'crimson_lancer',
    name: 'Crimson Vanguard',
    vnName: 'Kỵ Sĩ Huyết Thương',
    shortName: 'Lancer',
    isBoss: false,
    role: 'melee',
    unlockWave: 6,
    cost: 6,
    hp: 320,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 7,
    speed: 146,
    radius: 15,
    mass: 1.5,
    kbResist: 0.45,
    stunMult: 0.8,
    damage: 30,
    attackRange: 210,
    windupTicks: 16,
    cooldownTicks: 52,
    score: 105,
    shadowScale: 1.1,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 14],
      attack: [8, 48, 48, -24, -44, 16, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  void_reaper: {
    kindId: 26,
    id: 'void_reaper',
    name: 'Void Reaper',
    vnName: 'Tử Thần Hư Không',
    shortName: 'Reaper',
    isBoss: false,
    role: 'melee',
    unlockWave: 7,
    cost: 7,
    hp: 350,
    armorTypeID: 0,
    armorType: 'light',
    armor: 6,
    speed: 140,
    radius: 16,
    mass: 1.3,
    kbResist: 0.4,
    stunMult: 0.75,
    damage: 34,
    attackRange: 240,
    windupTicks: 14,
    cooldownTicks: 48,
    score: 120,
    shadowScale: 1.15,
    nativeFacing: 'right',
    anims: {
      idle: [6, 64, 64, -32, -56, 8],
      run: [8, 64, 64, -32, -56, 13],
      attack: [8, 64, 64, -32, -56, 15, 2],
      dead: [8, 64, 64, -32, -56, 10],
    },
  },
  boss_tempest: {
    kindId: 27,
    id: 'boss_tempest',
    name: 'Tempest Stormlord',
    vnName: 'Chúa Tể Bão Tố',
    shortName: 'Storm Wraith',
    isBoss: true,
    role: 'boss',
    unlockWave: 6,
    cost: 0,
    hp: 24000,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 24,
    speed: 98,
    radius: 46,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.5,
    damage: 26,
    attackRange: 660,
    preferredRange: [210, 330],
    backoffDist: 140,
    windupTicks: 28,
    cooldownTicks: 48,
    score: 4800,
    shadowScale: 3.1,
    nativeFacing: 'right',
    anims: {
      idle: [4, 160, 160, -80, -112, 8],
      run: [4, 160, 160, -80, -112, 10],
      attack: [4, 160, 160, -80, -112, 12, 1],
      dead: [4, 160, 160, -80, -112, 8],
    },
  },
  boss_destroyer: {
    kindId: 28,
    id: 'boss_destroyer',
    name: 'Doomsday Destroyer',
    vnName: 'Trùm Hủy Diệt',
    shortName: 'Butcher',
    isBoss: true,
    role: 'boss',
    unlockWave: 10,
    cost: 0,
    hp: 44000,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 32,
    speed: 78,
    radius: 56,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.45,
    damage: 34,
    attackRange: 720,
    preferredRange: [220, 360],
    backoffDist: 150,
    windupTicks: 32,
    cooldownTicks: 46,
    score: 10000,
    shadowScale: 3.8,
    nativeFacing: 'right',
    anims: {
      idle: [4, 192, 192, -96, -132, 8],
      run: [4, 192, 192, -96, -132, 10],
      attack: [4, 192, 192, -96, -132, 12, 1],
      dead: [4, 192, 192, -96, -132, 8],
    },
  },
  boss_frost_empress: {
    kindId: 29,
    id: 'boss_frost_empress',
    name: 'Frost Empress',
    vnName: 'Nữ Hoàng Băng Tuyết',
    shortName: 'Frost Queen',
    isBoss: true,
    role: 'boss',
    unlockWave: 8,
    cost: 0,
    hp: 32000,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 26,
    speed: 96,
    radius: 50,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.5,
    damage: 30,
    attackRange: 700,
    preferredRange: [220, 360],
    backoffDist: 145,
    windupTicks: 28,
    cooldownTicks: 46,
    score: 7200,
    shadowScale: 3.4,
    nativeFacing: 'right',
    anims: {
      idle: [3, 96, 96, -48, -76, 8],
      run: [3, 96, 96, -48, -76, 10],
      attack: [3, 96, 96, -48, -76, 12, 1],
      dead: [3, 96, 96, -48, -76, 8],
    },
  },
  boss_abyssal_leviathan: {
    kindId: 30,
    id: 'boss_abyssal_leviathan',
    name: 'Abyssal Leviathan Omega',
    vnName: 'Thủy Quái Vực Thẳm Omega',
    shortName: 'Drowned Maw',
    isBoss: true,
    role: 'boss',
    unlockWave: 12,
    cost: 0,
    hp: 58000,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 38,
    speed: 82,
    radius: 60,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.4,
    damage: 38,
    attackRange: 760,
    preferredRange: [240, 380],
    backoffDist: 160,
    windupTicks: 30,
    cooldownTicks: 44,
    score: 14000,
    shadowScale: 4.1,
    nativeFacing: 'right',
    anims: {
      idle: [3, 96, 96, -48, -76, 8],
      run: [3, 96, 96, -48, -76, 10],
      attack: [3, 96, 96, -48, -76, 12, 1],
      dead: [3, 96, 96, -48, -76, 8],
    },
  },
  mirror_knight: {
    kindId: 31,
    id: 'mirror_knight',
    name: 'Mirror Knight',
    vnName: 'Hiệp Sĩ Phản Đòn',
    shortName: 'Knight',
    isBoss: false,
    role: 'melee',
    unlockWave: 3,
    cost: 5,
    hp: 360,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 10,
    speed: 98,
    radius: 17,
    mass: 2.2,
    kbResist: 0.65,
    stunMult: 0.7,
    damage: 26,
    attackRange: 195,
    preferredRange: [70, 145],
    backoffDist: 35,
    windupTicks: 22,
    cooldownTicks: 58,
    score: 85,
    shadowScale: 1.2,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 10],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  magnet_drone: {
    kindId: 32,
    id: 'magnet_drone',
    name: 'Magnet Drone',
    vnName: 'Drone Từ Trường',
    shortName: 'Mag Crow',
    isBoss: false,
    role: 'caster',
    unlockWave: 3,
    cost: 4,
    hp: 210,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 6,
    speed: 132,
    radius: 14,
    mass: 1.0,
    kbResist: 0.25,
    stunMult: 0.9,
    damage: 20,
    attackRange: 280,
    preferredRange: [155, 240],
    backoffDist: 95,
    windupTicks: 26,
    cooldownTicks: 76,
    score: 75,
    shadowScale: 1.0,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 10],
      run: [8, 48, 48, -24, -44, 12],
      attack: [8, 48, 48, -24, -44, 14, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  blight_bomber: {
    kindId: 33,
    id: 'blight_bomber',
    name: 'Blight Bomber',
    vnName: 'Quái Bom Độc',
    shortName: 'Boomer',
    isBoss: false,
    role: 'bomber',
    unlockWave: 4,
    cost: 5,
    hp: 240,
    armorTypeID: 0,
    armorType: 'light',
    armor: 4,
    speed: 112,
    radius: 15,
    mass: 1.2,
    kbResist: 0.3,
    stunMult: 0.9,
    damage: 26,
    attackRange: 340,
    preferredRange: [185, 290],
    backoffDist: 105,
    windupTicks: 24,
    cooldownTicks: 74,
    score: 88,
    shadowScale: 1.08,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 10],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  volt_stalker: {
    kindId: 34,
    id: 'volt_stalker',
    name: 'Volt Stalker',
    vnName: 'Sát Thủ Sấm Chớp',
    shortName: 'Sparker',
    isBoss: false,
    role: 'melee',
    unlockWave: 5,
    cost: 6,
    hp: 275,
    armorTypeID: 0,
    armorType: 'light',
    armor: 5,
    speed: 158,
    radius: 14,
    mass: 1.1,
    kbResist: 0.3,
    stunMult: 0.85,
    damage: 28,
    attackRange: 250,
    windupTicks: 20,
    cooldownTicks: 56,
    score: 96,
    shadowScale: 1.05,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 10],
      run: [8, 48, 48, -24, -44, 16],
      attack: [8, 48, 48, -24, -44, 16, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  solar_priest: {
    kindId: 35,
    id: 'solar_priest',
    name: 'Solar Priest',
    vnName: 'Tư Tế Mặt Trời',
    shortName: 'Sunburnt',
    isBoss: false,
    role: 'caster',
    unlockWave: 5,
    cost: 6,
    hp: 250,
    armorTypeID: 0,
    armorType: 'light',
    armor: 5,
    speed: 108,
    radius: 15,
    mass: 1.1,
    kbResist: 0.3,
    stunMult: 0.85,
    damage: 25,
    attackRange: 400,
    preferredRange: [220, 350],
    backoffDist: 120,
    windupTicks: 22,
    cooldownTicks: 64,
    score: 98,
    shadowScale: 1.08,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 8],
      run: [8, 48, 48, -24, -44, 10],
      attack: [8, 48, 48, -24, -44, 12, 2],
      dead: [8, 48, 48, -24, -44, 10],
    },
  },
  magma_brute: {
    kindId: 36,
    id: 'magma_brute',
    name: 'Magma Brute',
    vnName: 'Khổng Lồ Dung Nham',
    shortName: 'Magma Tank',
    isBoss: false,
    role: 'brute',
    unlockWave: 6,
    cost: 7,
    hp: 520,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 12,
    speed: 88,
    radius: 19,
    mass: 2.8,
    kbResist: 0.75,
    stunMult: 0.65,
    damage: 35,
    attackRange: 175,
    preferredRange: [65, 130],
    backoffDist: 28,
    windupTicks: 32,
    cooldownTicks: 76,
    score: 115,
    shadowScale: 1.32,
    nativeFacing: 'right',
    anims: {
      idle: [6, 48, 48, -24, -44, 7],
      run: [8, 48, 48, -24, -44, 9],
      attack: [8, 48, 48, -24, -44, 11, 2],
      dead: [8, 48, 48, -24, -44, 9],
    },
  },
  boss_storm_herald: {
    kindId: 37,
    id: 'boss_storm_herald',
    name: 'Twin-Volt Storm Herald',
    vnName: 'Lôi Thần Bão Sét',
    shortName: 'Volt Twins',
    isBoss: true,
    role: 'boss',
    unlockWave: 9,
    cost: 0,
    hp: 38000,
    armorTypeID: 1,
    armorType: 'armored',
    armor: 28,
    speed: 96,
    radius: 52,
    mass: 999,
    kbResist: 1.0,
    stunMult: 0.48,
    damage: 30,
    attackRange: 720,
    preferredRange: [230, 380],
    backoffDist: 150,
    windupTicks: 28,
    cooldownTicks: 42,
    score: 8400,
    shadowScale: 3.5,
    nativeFacing: 'right',
    anims: {
      idle: [4, 160, 160, -80, -112, 8],
      run: [4, 160, 160, -80, -112, 10],
      attack: [4, 160, 160, -80, -112, 12, 1],
      dead: [4, 160, 160, -80, -112, 8],
    },
  },
};


/** Tên tiếng Anh ngắn gọn của quái/boss (fallback: `name`). */
export function getBansungEnemyShortName(id: BansungEnemyId | string): string {
  const spec = (BANSUNG_ENEMIES as Record<string, BansungEnemyStats | undefined>)[id];
  return spec?.shortName ?? spec?.name ?? String(id);
}

const ENEMY_ID_ALIASES: Record<string, BansungEnemyId> = {
  bomber: 'bomb_goblin',
  brute: 'cactus_brute',
  sand_beholder: 'boss_beholder',
  boss_sand_beholder: 'boss_beholder',
  dread_colossus: 'boss_colossus',
  overlord_core: 'boss_overlord',
  arsenal_warden: 'boss_arsenal',
  boss_gunner: 'boss_arsenal',
  frost_empress: 'boss_frost_empress',
  abyssal_leviathan: 'boss_abyssal_leviathan',
  leviathan: 'boss_abyssal_leviathan',
  storm_herald: 'boss_storm_herald',
};

/** Resolves either a canonical `BansungEnemyId` or a design-doc alias to canonical ID. */
export function resolveBansungEnemyId(raw: string): BansungEnemyId | undefined {
  if (Object.prototype.hasOwnProperty.call(BANSUNG_ENEMIES, raw)) {
    return raw as BansungEnemyId;
  }
  return ENEMY_ID_ALIASES[raw];
}

export const BANSUNG_BOSS_BY_BIOME: Record<BansungBiome, BansungEnemyId> = {
  desert: 'boss_beholder',
  crypt: 'boss_colossus',
  cyber: 'boss_overlord',
};

// ============================================================================
// 2b. Mob Leveling (Every 2/4/6/8/10...), Boss Multi-Bar HP & Body Parts
// ============================================================================

export interface MobLevelScaling {
  level: number;
  hpMult: number;
  armorBonus: number;
  dmgMult: number;
  speedMult: number;
}

/**
 * Computes enemy level from Wave index (1-based):
 * W1 -> Lv1, W2 -> Lv2, W4 -> Lv3, W6 -> Lv4, W8 -> Lv5, W10 -> Lv6, ...
 */
export function computeMobLevelFromWave(wave: number): number {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return 1 + Math.floor(w / 2);
}

/**
 * Computes enemy level from Survival elapsed seconds:
 * 0..119s -> Lv1, 2m -> Lv2, 4m -> Lv3, 6m -> Lv4, 8m -> Lv5, 10m -> Lv6, ...
 */
export function computeMobLevelFromTimeS(elapsedS: number): number {
  const t = Math.max(0, Number(elapsedS) || 0);
  return 1 + Math.floor(t / 120);
}

/**
 * Returns HP, Armor, Damage, and Speed scaling for an enemy at `level` (>= 1).
 * At level 1 all bonuses are neutral (hpMult=1, armorBonus=0) to preserve base stats.
 */
export function computeMobLevelScaling(level: number): MobLevelScaling {
  const lv = Math.max(1, Math.min(31, Math.floor(Number(level) || 1)));
  const steps = lv - 1;
  return {
    level: lv,
    hpMult: 1 + steps * 0.16,
    armorBonus: steps * 2,
    dmgMult: 1 + steps * 0.05,
    speedMult: Math.min(1.30, 1 + steps * 0.025),
  };
}

/** Multi-bar boss HP counts escalating from x2 up to x12 (Thủy Quái Vực Thẳm Omega). */
export const BANSUNG_BOSS_HP_BARS: Readonly<Record<BansungBossKind, number>> = {
  boss_arsenal: 2,
  boss_overlord: 3,
  boss_colossus: 4,
  boss_beholder: 5,
  boss_tempest: 6,
  boss_frost_empress: 7,
  boss_storm_herald: 8,
  boss_destroyer: 10,
  boss_abyssal_leviathan: 12,
} as const;

export function getBossHpBars(kind: BansungEnemyId | string, mini = false): number {
  const base = (BANSUNG_BOSS_HP_BARS as Record<string, number>)[kind] ?? 2;
  if (mini) return Math.max(2, Math.floor(base / 2));
  return base;
}

export interface BansungBossBarColorSpec {
  readonly color: string;
  readonly textOnColor: '#ffffff' | '#0b101d';
  readonly vnName: string;
}

/**
 * Ordered multi-bar boss HP palette:
 * - Always starts from Tím (`#a855f7`) at full HP (`seqIdx = 0`)
 * - Steps through Vàng (`#facc15`), Xanh (`#22c55e`), Cam (`#f97316`), extended high-contrast
 *   colors when > 5 bars, and ALWAYS finishes on Đỏ (`#ef4444`) as the final bar:
 *   - 2 bars: Tím -> Đỏ
 *   - 3 bars: Tím -> Vàng -> Đỏ
 *   - 4 bars: Tím -> Vàng -> Xanh -> Đỏ
 *   - 5 bars: Tím -> Vàng -> Xanh -> Cam -> Đỏ
 */
export const BANSUNG_BOSS_BAR_PALETTE: readonly BansungBossBarColorSpec[] = [
  { color: '#a855f7', textOnColor: '#ffffff', vnName: 'Tím' },
  { color: '#facc15', textOnColor: '#0b101d', vnName: 'Vàng' },
  { color: '#22c55e', textOnColor: '#0b101d', vnName: 'Xanh' },
  { color: '#f97316', textOnColor: '#0b101d', vnName: 'Cam' },
  { color: '#ef4444', textOnColor: '#ffffff', vnName: 'Đỏ' },
  { color: '#06b6d4', textOnColor: '#0b101d', vnName: 'Ngọc' },
  { color: '#ec4899', textOnColor: '#ffffff', vnName: 'Hồng' },
  { color: '#3b82f6', textOnColor: '#ffffff', vnName: 'Xanh dương' },
  { color: '#84cc16', textOnColor: '#0b101d', vnName: 'Chanh' },
  { color: '#e879f9', textOnColor: '#0b101d', vnName: 'Tím hồng' },
  { color: '#14b8a6', textOnColor: '#0b101d', vnName: 'Ngọc bích' },
  { color: '#f43f5e', textOnColor: '#ffffff', vnName: 'Ruby' },
] as const;

export function getBossBarColorSpec(seqIdx: number, totalBars?: number): BansungBossBarColorSpec {
  const safeTotal = totalBars !== undefined ? Math.max(1, Math.floor(totalBars)) : undefined;
  const idx = Math.max(0, Math.floor(seqIdx));
  if (safeTotal !== undefined) {
    if (safeTotal <= 1 || idx >= safeTotal - 1) {
      return BANSUNG_BOSS_BAR_PALETTE[4]; // Always end on Đỏ (#ef4444)
    }
    if (safeTotal === 2) {
      return idx === 0 ? BANSUNG_BOSS_BAR_PALETTE[0] : BANSUNG_BOSS_BAR_PALETTE[4]; // Tím -> Đỏ
    }
    if (safeTotal === 3) {
      const order = [0, 1, 4] as const; // Tím -> Vàng -> Đỏ
      return BANSUNG_BOSS_BAR_PALETTE[order[Math.min(idx, 2)]];
    }
    if (safeTotal === 4) {
      const order = [0, 1, 2, 4] as const; // Tím -> Vàng -> Xanh -> Đỏ
      return BANSUNG_BOSS_BAR_PALETTE[order[Math.min(idx, 3)]];
    }
    if (safeTotal === 5) {
      return BANSUNG_BOSS_BAR_PALETTE[Math.min(idx, 4)]; // Tím -> Vàng -> Xanh -> Cam -> Đỏ
    }
    // >5 bars: start with Tím -> Vàng -> Xanh -> Cam, then extended colors, always ending on Đỏ
    if (idx < 4) return BANSUNG_BOSS_BAR_PALETTE[idx];
    const extCount = BANSUNG_BOSS_BAR_PALETTE.length - 5;
    return BANSUNG_BOSS_BAR_PALETTE[5 + ((idx - 4) % extCount)];
  }
  const len = BANSUNG_BOSS_BAR_PALETTE.length;
  const normalized = ((idx % len) + len) % len;
  return BANSUNG_BOSS_BAR_PALETTE[normalized];
}

export interface BansungBossBarState {
  readonly totalBars: number;
  readonly hpPerBar: number;
  readonly activeBarIdx: number;
  readonly activeSeqIdx: number;
  readonly remainingBars: number;
  readonly curBarHp: number;
  readonly barColor: string;
  readonly barTextColor: '#ffffff' | '#0b101d';
  readonly underBarColor: string | undefined;
}

/**
 * Resolves the active stacked HP bar, top-to-bottom sequence index (`0` = first
 * bar burned), remaining bar count, current bar HP, and underneath reveal color.
 */
export function resolveBossBarState(hp: number, maxHp: number, totalBars: number): BansungBossBarState {
  const safeBars = Math.max(1, Math.floor(totalBars));
  const safeMax = Math.max(1, maxHp);
  const clampedHp = Math.max(0, Math.min(safeMax, hp));
  const hpPerBar = Math.max(1, safeMax / safeBars);
  const activeBarIdx =
    clampedHp > 0
      ? Math.min(safeBars - 1, Math.floor(Math.max(0, clampedHp - 0.001) / hpPerBar))
      : 0;
  const remainingBars = clampedHp <= 0 ? 0 : activeBarIdx + 1;
  const curBarHp = clampedHp <= 0 ? 0 : Math.min(hpPerBar, clampedHp - activeBarIdx * hpPerBar);
  const activeSeqIdx = Math.max(0, safeBars - 1 - activeBarIdx);
  const activeSpec = getBossBarColorSpec(activeSeqIdx, safeBars);
  const underSpec = activeBarIdx > 0 ? getBossBarColorSpec(activeSeqIdx + 1, safeBars) : undefined;
  return {
    totalBars: safeBars,
    hpPerBar,
    activeBarIdx,
    activeSeqIdx,
    remainingBars,
    curBarHp,
    barColor: activeSpec.color,
    barTextColor: activeSpec.textOnColor,
    underBarColor: underSpec?.color,
  };
}

export interface BansungBossBodyPartDef {
  id: string;
  name: string;
  vnName: string;
  hpRatio: number;
  offsetR: number;
  angleOffsetDeg: number;
  radius: number;
  stunMs: number;
  shatterBossHpRatio: number;
  unlocksSkill: string;
  unlocksSkillVn: string;
}

/** Destructible boss body parts: breaking any part stuns the boss and unlocks a new enraged skill. */
export const BANSUNG_BOSS_BODY_PARTS: Readonly<Record<string, readonly BansungBossBodyPartDef[]>> = {
  boss_arsenal: [
    {
      id: 'gatling_arm',
      name: 'Gatling Arm',
      vnName: 'Tay Súng Gatling',
      hpRatio: 0.16,
      offsetR: 34,
      angleOffsetDeg: -95,
      radius: 17,
      stunMs: 2400,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'overclock_salvo',
      unlocksSkillVn: 'Loạt Tên Lửa Cuồng Nộ',
    },
    {
      id: 'missile_pod',
      name: 'Missile Pod',
      vnName: 'Khoang Tên Lửa',
      hpRatio: 0.16,
      offsetR: 34,
      angleOffsetDeg: 95,
      radius: 17,
      stunMs: 2400,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'bullet_storm_360',
      unlocksSkillVn: 'Bão Đạn 360°',
    },
    {
      id: 'optic_visor',
      name: 'Laser Visor',
      vnName: 'Kính Ngắm Laze',
      hpRatio: 0.18,
      offsetR: 22,
      angleOffsetDeg: 0,
      radius: 16,
      stunMs: 2600,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'twin_sweep_laser',
      unlocksSkillVn: 'Laze Quét Kép',
    },
  ],
  boss_overlord: [
    {
      id: 'port_emitter',
      name: 'Port EMP Emitter',
      vnName: 'Ổ Phát EMP Trái',
      hpRatio: 0.15,
      offsetR: 36,
      angleOffsetDeg: -110,
      radius: 18,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'emp_overload_ring',
      unlocksSkillVn: 'Sóng Xung Quá Tải',
    },
    {
      id: 'starboard_laser',
      name: 'Starboard Laser',
      vnName: 'Pháo Laze Phải',
      hpRatio: 0.15,
      offsetR: 36,
      angleOffsetDeg: 110,
      radius: 18,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'twin_sweep_laser',
      unlocksSkillVn: 'Tia Laze Quét Kép',
    },
    {
      id: 'shield_reactor',
      name: 'Shield Reactor',
      vnName: 'Lò Phản Ứng Giáp',
      hpRatio: 0.18,
      offsetR: 24,
      angleOffsetDeg: 0,
      radius: 19,
      stunMs: 2800,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'bullet_storm_360',
      unlocksSkillVn: 'Xoáy Đạn Năng Lượng',
    },
  ],
  boss_colossus: [
    {
      id: 'siege_shield_arm',
      name: 'Siege Shield Arm',
      vnName: 'Tay Khiên Công Thành',
      hpRatio: 0.16,
      offsetR: 36,
      angleOffsetDeg: -100,
      radius: 18,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'seismic_aftershock',
      unlocksSkillVn: 'Chấn Động Nứt Địa',
    },
    {
      id: 'mortar_shoulder',
      name: 'Mortar Shoulder',
      vnName: 'Vai Pháo Cối',
      hpRatio: 0.15,
      offsetR: 36,
      angleOffsetDeg: 100,
      radius: 18,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'heavy_mortar_rain',
      unlocksSkillVn: 'Mưa Đạn Pháo Hạng Nặng',
    },
    {
      id: 'furnace_core',
      name: 'Molten Furnace Core',
      vnName: 'Lò Nhiệt Trung Tâm',
      hpRatio: 0.18,
      offsetR: 24,
      angleOffsetDeg: 0,
      radius: 19,
      stunMs: 2800,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'thermal_nova',
      unlocksSkillVn: 'Bùng Nổ Lò Nhiệt',
    },
  ],
  boss_beholder: [
    {
      id: 'left_tentacle',
      name: 'Void Tendril Left',
      vnName: 'Xúc Tu Hư Vô Trái',
      hpRatio: 0.15,
      offsetR: 38,
      angleOffsetDeg: -120,
      radius: 18,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'void_orb_shower',
      unlocksSkillVn: 'Mưa Cầu Hư Không',
    },
    {
      id: 'right_tentacle',
      name: 'Void Tendril Right',
      vnName: 'Xúc Tu Hư Vô Phải',
      hpRatio: 0.15,
      offsetR: 38,
      angleOffsetDeg: 120,
      radius: 18,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'summon_vanguard',
      unlocksSkillVn: 'Triệu Hồi Cận Vệ',
    },
    {
      id: 'third_eye',
      name: 'Abyssal Third Eye',
      vnName: 'Con Mắt Thứ Ba',
      hpRatio: 0.18,
      offsetR: 24,
      angleOffsetDeg: 0,
      radius: 20,
      stunMs: 2800,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'twin_sweep_laser',
      unlocksSkillVn: 'Quét Laze Hư Vô',
    },
  ],
  boss_tempest: [
    {
      id: 'storm_left_wing',
      name: 'Storm Wing Left',
      vnName: 'Cánh Bão Trái',
      hpRatio: 0.15,
      offsetR: 42,
      angleOffsetDeg: -108,
      radius: 19,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'chain_thunderstorm',
      unlocksSkillVn: 'Sấm Sét Liên Hoàn',
    },
    {
      id: 'storm_right_wing',
      name: 'Storm Wing Right',
      vnName: 'Cánh Bão Phải',
      hpRatio: 0.15,
      offsetR: 42,
      angleOffsetDeg: 108,
      radius: 19,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'cyclone_ring',
      unlocksSkillVn: 'Lốc Xoáy Vòng Tròn',
    },
    {
      id: 'tempest_crown',
      name: 'Lightning Crown',
      vnName: 'Vương Miện Sấm Sét',
      hpRatio: 0.18,
      offsetR: 26,
      angleOffsetDeg: 0,
      radius: 20,
      stunMs: 2900,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'supercell_judgment',
      unlocksSkillVn: 'Phán Quyết Siêu Bão',
    },
  ],
  boss_destroyer: [
    {
      id: 'left_cannon',
      name: 'Omega Left Cannon',
      vnName: 'Pháo Năng Lượng Trái',
      hpRatio: 0.12,
      offsetR: 48,
      angleOffsetDeg: -115,
      radius: 21,
      stunMs: 2800,
      shatterBossHpRatio: 0.07,
      unlocksSkill: 'doomsday_barrage',
      unlocksSkillVn: 'Mưa Tên Lửa Hủy Diệt',
    },
    {
      id: 'right_launcher',
      name: 'Hellfire Pod Right',
      vnName: 'Bệ Tên Lửa Phải',
      hpRatio: 0.12,
      offsetR: 48,
      angleOffsetDeg: 115,
      radius: 21,
      stunMs: 2800,
      shatterBossHpRatio: 0.07,
      unlocksSkill: 'laser_cross',
      unlocksSkillVn: 'Laze Chữ Thập Tử Thần',
    },
    {
      id: 'rear_thruster',
      name: 'Hyper Thruster Core',
      vnName: 'Động Cơ Phản Lực',
      hpRatio: 0.12,
      offsetR: 44,
      angleOffsetDeg: 170,
      radius: 20,
      stunMs: 2800,
      shatterBossHpRatio: 0.07,
      unlocksSkill: 'meteor_apocalypse',
      unlocksSkillVn: 'Mưa Thiên Thạch Tận Thế',
    },
    {
      id: 'omega_core',
      name: 'Destroyer Omega Core',
      vnName: 'Lõi Hủy Diệt Omega',
      hpRatio: 0.15,
      offsetR: 26,
      angleOffsetDeg: 0,
      radius: 22,
      stunMs: 3200,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'blackhole_collapse',
      unlocksSkillVn: 'Bùng Nổ Hố Đen',
    },
  ],
  boss_frost_empress: [
    {
      id: 'ice_scepter',
      name: 'Cryo Scepter',
      vnName: 'Quyền Trượng Băng',
      hpRatio: 0.16,
      offsetR: 42,
      angleOffsetDeg: -65,
      radius: 18,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'blizzard_ring',
      unlocksSkillVn: 'Bão Tuyết Khóa Vòng',
    },
    {
      id: 'frost_crown',
      name: 'Glacier Crown',
      vnName: 'Vương Miện Băng Giá',
      hpRatio: 0.16,
      offsetR: 34,
      angleOffsetDeg: 0,
      radius: 18,
      stunMs: 2800,
      shatterBossHpRatio: 0.09,
      unlocksSkill: 'glacier_nova',
      unlocksSkillVn: 'Bùng Nổ Sông Băng',
    },
    {
      id: 'left_crystal_wing',
      name: 'Left Crystal Wing',
      vnName: 'Cánh Tinh Thể Trái',
      hpRatio: 0.15,
      offsetR: 48,
      angleOffsetDeg: -135,
      radius: 19,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'ice_shard_barrage',
      unlocksSkillVn: 'Mưa Mảnh Băng',
    },
    {
      id: 'right_crystal_wing',
      name: 'Right Crystal Wing',
      vnName: 'Cánh Tinh Thể Phải',
      hpRatio: 0.15,
      offsetR: 48,
      angleOffsetDeg: 135,
      radius: 19,
      stunMs: 2500,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'permafrost_summon',
      unlocksSkillVn: 'Triệu Hồi Băng Vệ',
    },
  ],
  boss_abyssal_leviathan: [
    {
      id: 'abyss_maw',
      name: 'Abyssal Maw',
      vnName: 'Hàm Thú Vực Thẳm',
      hpRatio: 0.14,
      offsetR: 44,
      angleOffsetDeg: 0,
      radius: 21,
      stunMs: 3000,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'leviathan_devour_wave',
      unlocksSkillVn: 'Sóng Nuốt Chửng',
    },
    {
      id: 'left_tentacle',
      name: 'Left Leviathan Tentacle',
      vnName: 'Xúc Tu Trái',
      hpRatio: 0.15,
      offsetR: 54,
      angleOffsetDeg: -95,
      radius: 20,
      stunMs: 2800,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'abyss_tentacle_cross',
      unlocksSkillVn: 'Tứ Xúc Tu Hủy Diệt',
    },
    {
      id: 'right_tentacle',
      name: 'Right Leviathan Tentacle',
      vnName: 'Xúc Tu Phải',
      hpRatio: 0.15,
      offsetR: 54,
      angleOffsetDeg: 95,
      radius: 20,
      stunMs: 2800,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'void_surge_ring',
      unlocksSkillVn: 'Vòng Xoáy Biển Sâu',
    },
    {
      id: 'abyssal_heart',
      name: 'Omega Abyssal Heart',
      vnName: 'Trái Tim Biển Thẳm Omega',
      hpRatio: 0.14,
      offsetR: 28,
      angleOffsetDeg: 180,
      radius: 22,
      stunMs: 3400,
      shatterBossHpRatio: 0.10,
      unlocksSkill: 'cataclysm_vortex',
      unlocksSkillVn: 'Đại Hồng Thủy Hố Đen',
    },
  ],
  boss_storm_herald: [
    {
      id: 'yellow_condenser',
      name: 'Gold Storm Condenser',
      vnName: 'Lõi Tụ Sét Vàng',
      hpRatio: 0.14,
      offsetR: 44,
      angleOffsetDeg: -90,
      radius: 19,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'golden_tempest_overload',
      unlocksSkillVn: 'Đại Bão Sét Vàng',
    },
    {
      id: 'blue_condenser',
      name: 'Azure Storm Condenser',
      vnName: 'Lõi Tụ Sét Xanh',
      hpRatio: 0.14,
      offsetR: 44,
      angleOffsetDeg: 90,
      radius: 19,
      stunMs: 2600,
      shatterBossHpRatio: 0.08,
      unlocksSkill: 'azure_storm_vortex',
      unlocksSkillVn: 'Xoáy Bão Sét Xanh',
    },
    {
      id: 'twin_storm_crown',
      name: 'Twin-Storm Crown',
      vnName: 'Vương Miện Song Lôi',
      hpRatio: 0.16,
      offsetR: 26,
      angleOffsetDeg: 0,
      radius: 21,
      stunMs: 3000,
      shatterBossHpRatio: 0.09,
      unlocksSkill: 'dual_storm_cataclysm',
      unlocksSkillVn: 'Cộng Hưởng Song Bão Sét',
    },
  ],
} as const;

/** Returns the biome-signature boss ID. */
export function getBossIdForBiome(biome: BansungBiome): BansungEnemyId {
  return BANSUNG_BOSS_BY_BIOME[biome] ?? 'boss_beholder';
}

// --- Mob Special Mechanics & Telegraphs (d34, d35, d36) ---

export const BANSUNG_MELEE_SPECIALS = {
  scarab: {
    zigzagDistThreshold: 110,
    zigzagFreq: 0.22,
    zigzagAmp: 0.45,
    hitConfirmRange: 34,
  },
  skirmisher: {
    lungeCdTicks: 78,
    lungeMinDist: 52,
    lungeMaxDist: 95,
    lungeDurationTicks: 10,
    lungeSpeed: 310,
    lungeDmg: 14,
    lungeExtraRadius: 8,
    swipeWindupTicks: 6,
  },
  bomb_goblin: {
    triggerDist: 180,
    lowHpTriggerRatio: 0.35,
    lowHpTriggerDist: 260,
    fuseTicks: 42,
    armTicks: 14,
    fuseSpeed: 162,
    fuseSepWeight: 0.25,
    detonateDist: 28,
    blastRadius: 88,
    innerFullRadius: 40,
    minFalloffRatio: 0.5,
    knockbackSpeed: 320,
    friendlyFireDmg: 14,
    stunFuseResetCdTicks: 30,
  },
  cactus_brute: {
    thornyHideRange: 28,
    thornyHideDmg: 4,
    thornyHideIcdS: 0.5,
    slamCdTicks: 135,
    slamTriggerDist: 58,
    slamWindupTicks: 20,
    slamRadius: 76,
    slamDmg: 24,
    slamKnockback: 240,
    slamStunTicks: 10,
    needleCount: 6,
    needleSpeed: 170,
    needleDmg: 10,
    needleRange: 190,
    needleRadius: 4,
    cleaveConeDeg: 110,
    cleaveReach: 44,
  },
} as const;

export const BANSUNG_RANGED_PROJ_ANIMS = {
  needle_orb: [2, 16, 16, -8, -8] as BansungEnemyAnimMeta,
  sniper_slug: [2, 24, 10, -12, -5] as BansungEnemyAnimMeta,
  fireball: [3, 32, 32, -16, -16] as BansungEnemyAnimMeta,
  thunderball: [16, 128, 128, -64, -64] as BansungEnemyAnimMeta,
  storm: [9, 153, 261, -76, -240] as BansungEnemyAnimMeta,
} as const;

export const BANSUNG_RANGED_ATTACKS = {
  cactus_spitter: {
    windupTicks: 8,
    recoverTicks: 4,
    spreadDeg: [-14, 0, 14] as const,
    eliteSpreadDeg: [-24, -12, 0, 12, 24] as const,
    projSpeed: 300,
    projRadius: 5,
    projTtlTicks: 54,
    projDmg: 10,
  },
  laser_sniper: {
    trackEndTick: 22,
    fireTick: 33,
    omegaMaxRadPerS: 1.6,
    projSpeed: 960,
    projRadius: 4,
    projTtlTicks: 27,
    projDmg: 28,
    knockbackSpeed: 180,
    armorPierce: 0.25,
    eliteBurstDelayTicks: 5,
  },
  pyro_shaman: {
    windupTicks: 14,
    leadTimeS: 0.35,
    maxLeadPx: 110,
    projSpeed: 250,
    projRadius: 8,
    projTtlTicks: 48,
    maxDist: 380,
    splashRadius: 48,
    centerDmg: 18,
    edgeDmg: 11,
    splitDeg: [-12, 12] as const,
    splitSplashRadius: 38,
    splitDmg: 14,
    burnDps: 3,
    burnDurationS: 3,
    firePoolRadius: 40,
    firePoolTtlTicks: 90,
    firePoolTickInterval: 15,
    firePoolTickDmg: 4,
    maxPoolsPerCaster: 2,
  },
  thunder_mage: {
    thunderballWeight: 0.6,
    ballWindupTicks: 12,
    ballSpreadDeg: [-10, 10] as const,
    ballSpeed: 205,
    ballWobbleAmp: 18,
    ballWobbleFreq: 6,
    ballRadius: 9,
    ballTtlTicks: 66,
    ballDmg: 14,
    ballSlowPct: 0.35,
    ballSlowS: 0.45,
    ballMicroStunS: 0.15,
    stormWindupTicks: 27,
    stormRadius: 46,
    stormFlankOffsetPx: 75,
    stormDmg: 24,
    stormStunS: 0.4,
    stormShockedMul: 0.15,
    stormShockedS: 2.0,
  },
  frost_mage: {
    boltWindupTicks: 15,
    boltSpeed: 260,
    boltRadius: 7,
    boltTtlTicks: 54,
    boltDmg: 13,
    slowPct: 0.42,
    slowMs: 2000,
    novaWindupTicks: 26,
    novaRadius: 68,
    novaDmg: 17,
  },
  venom_stalker: {
    spitWindupTicks: 10,
    spitSpreadDeg: [-10, 10] as const,
    spitSpeed: 330,
    spitRadius: 6,
    spitTtlTicks: 38,
    spitDmg: 11,
    poisonTickDmg: 4,
    poisonDurMs: 2500,
  },
  shield_warden: {
    windupTicks: 22,
    pulseRadius: 135,
    shieldGrant: 36,
    bashDmg: 19,
    bashKnockback: 260,
  },
  mortar_beetle: {
    windupTicks: 30,
    blastRadius: 60,
    blastDmg: 22,
    knockbackSpeed: 210,
  },
  void_acolyte: {
    windupTicks: 24,
    singularityRadius: 78,
    pullImpulse: 185,
    implosionDmg: 18,
  },
  saw_berserker: {
    windupTicks: 15,
    lungeSpeed: 345,
    lungeDurationTicks: 11,
    lungeDmg: 19,
    bleedTickDmg: 5,
    bleedDurMs: 2500,
    lungeCdTicks: 58,
  },
  healing_priest: {
    windupTicks: 26,
    healRadius: 130,
    healPct: 0.18,
    smiteSpeed: 310,
    smiteDmg: 12,
  },
  shock_drone_mk2: {
    windupTicks: 16,
    spreadDeg: [-8, 8] as const,
    projSpeed: 420,
    projDmg: 13,
    slowPct: 0.3,
    slowMs: 700,
    microStunMs: 140,
  },
  chrono_mage: {
    windupTicks: 18,
    boltSpeed: 310,
    boltRadius: 8,
    boltTtlTicks: 54,
    boltDmg: 16,
    slowPct: 0.45,
    slowMs: 2200,
    warpCdTicks: 120,
    warpMinRange: 140,
  },
  plasma_golem: {
    windupTicks: 22,
    orbCount: 3,
    spreadDeg: [-16, 0, 16] as const,
    orbSpeed: 290,
    orbRadius: 9,
    orbDmg: 20,
    slamRadius: 95,
    slamDmg: 24,
  },
  sniper_mech: {
    windupTicks: 34,
    beamLength: 720,
    beamHalfW: 8,
    shotDmg: 28,
    projSpeed: 840,
  },
  plague_bearer: {
    windupTicks: 20,
    lobSpeed: 290,
    poolRadius: 68,
    poolDurationTicks: 135,
    poolDps: 8,
    boltDmg: 15,
    poisonDurMs: 3000,
  },
  crimson_lancer: {
    windupTicks: 16,
    dashSpeed: 420,
    dashTicks: 12,
    dashDmg: 22,
    bleedTickDmg: 6,
    bleedDurMs: 2500,
  },
  void_reaper: {
    windupTicks: 14,
    blinkRange: 170,
    arcBolts: 3,
    spreadDeg: [-18, 0, 18] as const,
    boltSpeed: 360,
    boltDmg: 22,
    slashDmg: 25,
  },
  mirror_knight: {
    windupTicks: 22,
    fanSpreadDeg: [-20, 0, 20] as const,
    boltSpeed: 340,
    boltDmg: 17,
    slashRange: 62,
    slashDmg: 20,
  },
  magnet_drone: {
    windupTicks: 26,
    pulseRadius: 120,
    pulseDmg: 15,
    slowPct: 0.4,
    slowMs: 1400,
    pullPx: 34,
  },
  blight_bomber: {
    windupTicks: 24,
    poolRadius: 74,
    poolDurationTicks: 135,
    poolDps: 10,
    boltSpeed: 310,
    boltDmg: 18,
    poisonDurMs: 3200,
  },
  volt_stalker: {
    windupTicks: 20,
    dashSpeed: 460,
    dashTicks: 11,
    dashDmg: 23,
    shockStunMs: 280,
  },
  solar_priest: {
    windupTicks: 22,
    spreadDeg: [-22, 0, 22] as const,
    orbSpeed: 350,
    orbDmg: 19,
    burnDps: 8,
    burnMs: 2800,
  },
  magma_brute: {
    windupTicks: 32,
    slamRadius: 112,
    slamDmg: 26,
    ringDurationTicks: 120,
    ringDps: 10,
  },
} as const;

export type BansungTelegraph = BansungTelegraphWire;

export interface BansungHazard extends BansungHazardWire {
  ttlTicks: number;
}

export interface EnemyFlockState {
  vx: number;
  vy: number;
  targetId: number;
  flankSeed: number;
  wallSlideSign: -1 | 1;
  stuckTicks: number;
  detourTicks: number;
  anchorX: number;
  anchorY: number;
}

export const BANSUNG_FLOCK_CONSTS = {
  FLOCK_DT: 1 / 30,
  RETARGET_INTERVAL: 6,
  NEIGHBOR_RADIUS: 56,
  COHESION_RADIUS: 110,
  MAX_NEIGHBORS: 10,
  W_SEEK: 1.0,
  W_FLANK: 0.55,
  W_SEPARATION: 1.85,
  W_COHESION: 0.25,
  W_ALIGN: 0.2,
  W_WALL_AVOID: 1.6,
  VEL_BLEND: 0.28,
  SEP_SOLVER_ITERS: 2,
  RING_SLOTS: 10,
  FACING_HYSTERESIS_PX_S: 18,
} as const;

// --- Boss 1: Sand Beholder (d37) ---

export type BeholderState =
  | 'intro'
  | 'move'
  | 'volley_cast'
  | 'slam_leap'
  | 'beam_windup'
  | 'beam_sweep'
  | 'enrage_roar'
  | 'stagger'
  | 'dead';

export interface BossSandBeholderState {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  state: BeholderState;
  stateTick: number;
  aimAngle: number;
  sweepDir: 1 | -1;
  volleyCd: number;
  slamCd: number;
  beamCd: number;
  lastMove: string;
  slamStartX: number;
  slamStartY: number;
  slamTargetX: number;
  slamTargetY: number;
  slamBounceLeft: 0 | 1;
  stagger: number;
  staggerImmuneTicks: number;
  targetId: string | null;
  retargetTicks: number;
  summonIds: string[];
}

export const BOSS_BEHOLDER_CFG = {
  radius: 34,
  baseHp: 6400,
  armor: 16,
  baseDr: 0.25,
  introTicks: 27,
  p1MoveSpeed: 72,
  p2MoveSpeed: 96,
  p1RecoveryTicks: 27,
  p2RecoveryTicks: 17,
  volleyCdTicks: 108,
  slamCdTicks: 180,
  beamCdTicks: 225,
  beamRange: 640,
  beamHalfW: 12,
  slamRadiusP1: 155,
  slamRadiusP2: 170,
  maxAdds: 4,
  staggerMax: 100,
  staggerDecayPerSec: 8,
  staggerDurationTicks: 45,
  staggerImmuneTicks: 300,
  staggerDmgMult: 1.25,
  enrageHpRatio: 0.5,
  enrageRoarTicks: 36,
} as const;

// --- Boss 2: Dread Colossus (d38) ---

export type ColossusState = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface BansungBossView {
  id: number;
  kind: BansungBossKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingLeft: boolean;
  hp: number;
  maxHp: number;
  shieldHp: number;
  heat: number;
  state: number;
  stateTick: number;
  aimDeg?: number;
}

export const DREAD_COLOSSUS_CFG = {
  baseHp: 10500,
  radius: 34,
  walkSpeed: 86,
  shieldWalkSpeed: 55,
  armorNormal: 22,
  armorStunned: 0,
  baseDr: 0.28,
  stunDmgMult: 1.5,
  shieldDr: 0.85,
  cleaveRange: 105,
  cleaveArcDeg: 120,
  cleaveDmg: 34,
  dashSpeed: 680,
  dashMaxTicks: 18,
  dashWindupTicks: 24,
  dashDmg: 42,
  dashHeat: 25,
  wallCrashHeat: 35,
  mortarRadius: 72,
  mortarFlightTicks: 42,
  mortarDmg: 36,
  mortarHeat: 30,
  dronePhaseHps: [0.55, 0.25] as const,
  droneOrbitRadius: 95,
  droneOrbitRadPerS: 1.6,
  droneBaseHp: 320,
  droneTimeoutTicks: 660,
  stunTicksP1: 120,
  stunTicksP2: 90,
  stunTicksShatter: 135,
} as const;

export const BANSUNG_IRON_DRONE_CFG = {
  id: 'iron_drone',
  name: 'Iron Aegis Drone',
  armorType: 'armored' as BansungArmorType,
  armor: 2,
  radius: 14,
  baseHp: DREAD_COLOSSUS_CFG.droneBaseHp,
  boltDmg: 14,
  boltSpeed: 340,
  shatterBossSelfDmg: 180,
  anims: {
    idle: [3, 58, 53, -29, -48, 6] as BansungEnemyAnimMeta,
    run: [6, 64, 61, -32, -54, 12] as BansungEnemyAnimMeta,
    attack: [4, 93, 60, -46, -54, 12, 2] as BansungEnemyAnimMeta,
    dead: [3, 86, 66, -43, -58, 10] as BansungEnemyAnimMeta,
  },
} as const;

// --- Boss 1: Arsenal Dread Gunner (Weaponized Gun-Baron) ---

export const BOSS_ARSENAL_CFG = {
  baseHp: 7200,
  radius: 42,
  baseArmor: 18,
  baseDr: 0.25,
  speedP1: 88,
  speedP2: 112,
  phase2Ratio: 0.55,
  stunMult: 0.55,
  /** 2.0s fuse @ 30Hz */
  grenadeFuseTicks: 60,
  grenadeCount: 3,
  grenadeBlastR: 78,
  grenadeDmg: 24,
  /** Red-circle missile salvo with DANGER warning */
  missileCount: 4,
  missileWarningTicks: 42,
  missileRadius: 58,
  missileDmg: 28,
  /** Red aim-line laser telegraph + fire */
  laserTelegraphTicks: 38,
  laserFireTicks: 10,
  laserHalfW: 22,
  laserLength: 920,
  laserDmg: 30,
  /** Gapped radial bullet ring leaving clear dodge corridors */
  ringTotalSectors: 20,
  ringGapSectors: [0, 1, 2, 10, 11, 12] as const,
  ringSpeed: 235,
  ringDmg: 16,
  /** Summon squad skill */
  summonCount: 3,
  summonCooldownTicks: 270,
} as const;

export const BOSS_TEMPEST_CFG = {
  baseHp: 24000,
  hpBars: 6,
  radius: 46,
  armor: 24,
  baseDr: 0.32,
  speedP1: 98,
  speedP2: 124,
  phase2Ratio: 0.55,
  stunMult: 0.5,
  lightningCount: 5,
  lightningWarningTicks: 34,
  lightningRadius: 62,
  lightningDmg: 30,
  cycloneBolts: 18,
  cycloneGapSectors: [0, 1, 9, 10] as const,
  cycloneSpeed: 265,
  cycloneDmg: 18,
  arcBeamTelegraphTicks: 32,
  arcBeamLength: 880,
  arcBeamHalfW: 24,
  arcBeamDmg: 34,
  summonCount: 3,
  summonCooldownTicks: 240,
} as const;

export const BOSS_DESTROYER_CFG = {
  baseHp: 44000,
  hpBars: 10,
  radius: 56,
  armor: 32,
  baseDr: 0.40,
  speedP1: 78,
  speedP2: 104,
  phase2Ratio: 0.55,
  stunMult: 0.45,
  meteorCount: 6,
  meteorWarningTicks: 36,
  meteorRadius: 72,
  meteorDmg: 38,
  laserCrossTelegraphTicks: 34,
  laserCrossLength: 960,
  laserCrossHalfW: 26,
  laserCrossDmg: 36,
  ringBolts: 24,
  ringGapSectors: [0, 1, 2, 12, 13, 14] as const,
  ringSpeed: 280,
  ringDmg: 20,
  blackholePullRadius: 340,
  blackholePullForce: 210,
  blackholeBurstDmg: 42,
  blackholeRadius: 115,
  summonCount: 4,
  summonCooldownTicks: 225,
} as const;

export const BOSS_FROST_EMPRESS_CFG = {
  baseHp: 32000,
  hpBars: 7,
  radius: 50,
  armor: 26,
  baseDr: 0.35,
  speedP1: 96,
  speedP2: 122,
  phase2Ratio: 0.55,
  stunMult: 0.5,
  icicleCount: 6,
  icicleWarningTicks: 34,
  icicleRadius: 64,
  icicleDmg: 32,
  cycloneBolts: 20,
  cycloneGapSectors: [0, 1, 2, 10, 11] as const,
  cycloneSpeed: 260,
  cycloneDmg: 19,
  cryoBeamTelegraphTicks: 32,
  cryoBeamLength: 900,
  cryoBeamHalfW: 24,
  cryoBeamDmg: 34,
  summonCount: 3,
  summonCooldownTicks: 230,
} as const;

export const BOSS_LEVIATHAN_CFG = {
  baseHp: 58000,
  hpBars: 12,
  radius: 60,
  armor: 38,
  baseDr: 0.45,
  speedP1: 82,
  speedP2: 110,
  phase2Ratio: 0.55,
  stunMult: 0.4,
  meteorCount: 7,
  meteorWarningTicks: 36,
  meteorRadius: 74,
  meteorDmg: 40,
  tentacleCrossTelegraphTicks: 34,
  tentacleCrossLength: 980,
  tentacleCrossHalfW: 28,
  tentacleCrossDmg: 38,
  ringBolts: 26,
  ringGapSectors: [0, 1, 2, 13, 14, 15] as const,
  ringSpeed: 285,
  ringDmg: 22,
  vortexPullRadius: 360,
  vortexPullForce: 225,
  vortexBurstDmg: 44,
  vortexRadius: 122,
  summonCount: 4,
  summonCooldownTicks: 215,
} as const;

export const BOSS_STORM_HERALD_CFG = {
  baseHp: 38000,
  hpBars: 8,
  radius: 52,
  armor: 28,
  baseDr: 0.36,
  speedP1: 96,
  speedP2: 122,
  phase2Ratio: 0.55,
  stunMult: 0.48,
  yellowStormCount: 5,
  yellowWarningTicks: 34,
  yellowRadius: 68,
  yellowBurstDmg: 32,
  yellowHazardTtlMs: 3800,
  yellowHazardDps: 22,
  blueStormCount: 5,
  blueWarningTicks: 32,
  blueRadius: 64,
  blueBurstDmg: 26,
  blueHazardTtlMs: 4200,
  blueHazardDps: 18,
} as const;

// --- Boss 3: Overlord Gunship Core (d39) ---

export type OverlordState =
  | 'enter'
  | 'patrol_spiral'
  | 'emp_deploy'
  | 'laser_telegraph'
  | 'laser_fire'
  | 'weakpoint_matrix'
  | 'breach_stun'
  | 'phase_shift'
  | 'dead';

export const OVERLORD_STATS = {
  baseHp: 14500,
  coOpHpPerExtraPlayer: 0.55,
  endlessHpScale: 0.35,
  radius: 44,
  hoverZ: 18,
  armorType: 'armored' as const,
  baseArmor: 22,
  matrixArmor: 38,
  baseDr: 0.30,
  speedP1: 95,
  speedP2: 120,
  phase2Ratio: 0.6,
  stunEffectiveness: 0.45,
  weakPointOrbitR: 54,
  weakPointRadius: 16,
  weakPointBaseHp: 280,
  weakPointWindowTicks: 420,
  breachStunTicks: 120,
  breachBurstPct: 0.08,
  breachDamageMul: 1.65,
  maxActiveProjectiles: 160,
} as const;

export const OVERLORD_ANIMS: Record<string, BansungEnemyAnimMeta> = {
  overlord_hull_idle: [4, 128, 128, -64, -84, 8],
  overlord_hull_charge: [4, 128, 128, -64, -84, 12],
  overlord_hull_stun: [2, 128, 128, -64, -84, 10],
  overlord_hull_dead: [6, 128, 128, -64, -84, 10],
  overlord_weakpoint: [3, 32, 32, -16, -16, 8],
  emp_pylon: [4, 48, 64, -24, -56, 8],
};

export interface BansungWeakPointView {
  idx: number;
  /** Quantized angle 0..255 -> 0..2PI */
  angQ: number;
  hp: number;
  maxHp: number;
}

export interface BansungEmpPylon {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 0..100 (fires EMP pulse at 100) */
  chargeQ: number;
}

export interface BansungLaserLane {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  halfW: number;
  phase: 'telegraph' | 'lock' | 'active';
  ticksLeft: number;
}

// ---------------------------------------------------------------------------
// 2. 10-Wave Director & Endless Mutators (d40)
// ---------------------------------------------------------------------------

export const BANSUNG_TOTAL_WAVES = 10;
export const BANSUNG_WARMUP_S = 5;
export const BANSUNG_INTERMISSION_S = 6;
export const BANSUNG_BOSS_INTERMISSION_S = 9;
export const BANSUNG_STRAGGLER_ENRAGE_S = 12;

export type BansungDirectorPhase =
  | 'warmup'
  | 'intermission'
  | 'spawning'
  | 'cleanup'
  | 'victory'
  | 'defeat';

export type BansungSiegeKind = 'none' | 'portal_rush' | 'supply_beacon' | 'artillery_siege';
export type BansungEliteAffix = 'armored' | 'swift' | 'volatile';

export interface BansungWaveHud {
  wave: number;
  maxWave: number;
  phase: BansungDirectorPhase;
  phaseLeftMs: number;
  mobsLeft: number;
  siege: BansungSiegeKind;
  siegeProg: number;
  bossId?: string;
}

export interface WaveRosterEntry {
  kind: BansungEnemyId;
  weight: number;
}

export interface WaveRewardSpec {
  perkDraft: boolean;
  weaponPedestal: boolean;
  crates: number;
  healPulse?: boolean;
  bonusCoins?: number;
  energyRefill?: boolean;
  fullRestock?: boolean;
}

export type BansungBossEncounterMode =
  | 'single'
  | 'duo'
  | 'trio'
  | 'mini_swarm_5'
  | 'splitter_giant';

export interface WaveSpec {
  wave: number;
  arc: string;
  burstCadenceS: number;
  roster: readonly WaveRosterEntry[];
  eliteChance: number;
  eliteAffixes: readonly BansungEliteAffix[];
  maxElitesPerSquad: number;
  siege: BansungSiegeKind;
  secondarySiege?: BansungSiegeKind;
  siegeConfig?: {
    gateCount?: number;
    gateBaseHp?: number;
    gateSpawnIntervalS?: number;
    gateSpawnCount?: number;
    midWaveGateAtBudgetPct?: number;
    beaconRadius?: number;
    beaconHoldS?: number;
    artilleryIntervalS?: number;
    artilleryFuseS?: number;
  };
  miniBoss?: {
    hpMult: number;
    count?: number;
    scale?: number;
    splitTier?: number;
    bossMode?: BansungBossEncounterMode;
    addKinds: readonly BansungEnemyId[];
    maxAdds: number;
    addIntervalS: number;
    bossByBiome: Record<BansungBiome, { id: BansungEnemyId; label: string }>;
  };
  boss?: {
    count?: number;
    hpMult?: number;
    scale?: number;
    splitTier?: number;
    bossMode?: BansungBossEncounterMode;
    extraKinds?: readonly BansungEnemyId[];
    bossByBiome: Record<BansungBiome, BansungEnemyId>;
    addKinds: readonly BansungEnemyId[];
    maxAdds: number;
  };
  reward: WaveRewardSpec;
  endlessCycle?: number;
  mutators?: readonly string[];
}

/** Canonical 10-wave progression blueprint (`d40`). */
export const BANSUNG_WAVES: readonly WaveSpec[] = [
  {
    wave: 1,
    arc: 'Swarm Intro',
    burstCadenceS: 3.2,
    roster: [
      { kind: 'scarab', weight: 55 },
      { kind: 'skirmisher', weight: 35 },
      { kind: 'cactus_spitter', weight: 10 },
    ],
    eliteChance: 0,
    eliteAffixes: [],
    maxElitesPerSquad: 0,
    siege: 'none',
    reward: { perkDraft: false, weaponPedestal: false, crates: 2 },
  },
  {
    wave: 2,
    arc: 'Rushers',
    burstCadenceS: 3.0,
    roster: [
      { kind: 'scarab', weight: 35 },
      { kind: 'skirmisher', weight: 30 },
      { kind: 'bomb_goblin', weight: 20 },
      { kind: 'cactus_spitter', weight: 15 },
    ],
    eliteChance: 0,
    eliteAffixes: [],
    maxElitesPerSquad: 0,
    siege: 'none',
    reward: { perkDraft: true, weaponPedestal: false, crates: 0 },
  },
  {
    wave: 3,
    arc: 'Heavy Mix',
    burstCadenceS: 2.8,
    roster: [
      { kind: 'skirmisher', weight: 16 },
      { kind: 'bomb_goblin', weight: 14 },
      { kind: 'cactus_spitter', weight: 14 },
      { kind: 'cactus_brute', weight: 14 },
      { kind: 'pyro_shaman', weight: 10 },
      { kind: 'venom_stalker', weight: 10 },
      { kind: 'frost_mage', weight: 10 },
      { kind: 'chrono_mage', weight: 12 },
    ],
    eliteChance: 0,
    eliteAffixes: [],
    maxElitesPerSquad: 0,
    siege: 'none',
    reward: { perkDraft: false, weaponPedestal: true, crates: 3 },
  },
  {
    wave: 4,
    arc: 'Mini-Boss',
    burstCadenceS: 14.0,
    roster: [
      { kind: 'scarab', weight: 50 },
      { kind: 'skirmisher', weight: 35 },
      { kind: 'plasma_golem', weight: 15 },
    ],
    eliteChance: 0,
    eliteAffixes: [],
    maxElitesPerSquad: 0,
    siege: 'none',
    miniBoss: {
      hpMult: 0.48,
      addKinds: ['scarab', 'skirmisher'],
      maxAdds: 6,
      addIntervalS: 14,
      bossByBiome: {
        desert: { id: 'boss_beholder', label: 'mini_sand_beholder' },
        crypt: { id: 'boss_colossus', label: 'mini_dread_warden' },
        cyber: { id: 'boss_overlord', label: 'mini_core_drone' },
      },
    },
    reward: { perkDraft: true, weaponPedestal: false, crates: 2, healPulse: true },
  },
  {
    wave: 5,
    arc: 'Siege I — Portal Rush',
    burstCadenceS: 2.6,
    roster: [
      { kind: 'skirmisher', weight: 14 },
      { kind: 'cactus_spitter', weight: 10 },
      { kind: 'pyro_shaman', weight: 10 },
      { kind: 'laser_sniper', weight: 10 },
      { kind: 'cactus_brute', weight: 10 },
      { kind: 'saw_berserker', weight: 10 },
      { kind: 'mortar_beetle', weight: 8 },
      { kind: 'frost_mage', weight: 8 },
      { kind: 'chrono_mage', weight: 6 },
      { kind: 'sniper_mech', weight: 7 },
      { kind: 'plague_bearer', weight: 7 },
    ],
    eliteChance: 0.1,
    eliteAffixes: ['armored'],
    maxElitesPerSquad: 1,
    siege: 'portal_rush',
    siegeConfig: {
      gateCount: 2,
      gateBaseHp: 450,
      gateSpawnIntervalS: 5,
      gateSpawnCount: 2,
    },
    reward: { perkDraft: false, weaponPedestal: false, crates: 3, bonusCoins: 20 },
  },
  {
    wave: 6,
    arc: 'Siege II — Supply Beacon',
    burstCadenceS: 2.5,
    roster: [
      { kind: 'bomb_goblin', weight: 16 },
      { kind: 'cactus_brute', weight: 16 },
      { kind: 'laser_sniper', weight: 14 },
      { kind: 'thunder_mage', weight: 14 },
      { kind: 'plasma_golem', weight: 14 },
      { kind: 'crimson_lancer', weight: 14 },
      { kind: 'scarab', weight: 12 },
    ],
    eliteChance: 0.15,
    eliteAffixes: ['armored', 'swift'],
    maxElitesPerSquad: 1,
    siege: 'supply_beacon',
    siegeConfig: {
      beaconRadius: 150,
      beaconHoldS: 20,
    },
    reward: { perkDraft: true, weaponPedestal: true, crates: 2, energyRefill: true },
  },
  {
    wave: 7,
    arc: 'Siege III — Artillery',
    burstCadenceS: 2.4,
    roster: [
      { kind: 'bomb_goblin', weight: 12 },
      { kind: 'cactus_brute', weight: 12 },
      { kind: 'pyro_shaman', weight: 10 },
      { kind: 'thunder_mage', weight: 10 },
      { kind: 'sniper_mech', weight: 10 },
      { kind: 'shield_warden', weight: 10 },
      { kind: 'mortar_beetle', weight: 10 },
      { kind: 'healing_priest', weight: 10 },
      { kind: 'plague_bearer', weight: 8 },
      { kind: 'void_reaper', weight: 8 },
      { kind: 'mirror_knight', weight: 8 },
      { kind: 'magnet_drone', weight: 8 },
    ],
    eliteChance: 0.2,
    eliteAffixes: ['armored', 'swift'],
    maxElitesPerSquad: 2,
    siege: 'artillery_siege',
    siegeConfig: {
      artilleryIntervalS: 4.5,
      artilleryFuseS: 1.4,
    },
    reward: { perkDraft: false, weaponPedestal: true, crates: 3 },
  },
  {
    wave: 8,
    arc: 'Elites I',
    burstCadenceS: 2.3,
    roster: [
      { kind: 'crimson_lancer', weight: 14 },
      { kind: 'plasma_golem', weight: 12 },
      { kind: 'void_reaper', weight: 12 },
      { kind: 'chrono_mage', weight: 10 },
      { kind: 'sniper_mech', weight: 10 },
      { kind: 'plague_bearer', weight: 10 },
      { kind: 'pyro_shaman', weight: 10 },
      { kind: 'thunder_mage', weight: 12 },
      { kind: 'cactus_brute', weight: 10 },
      { kind: 'blight_bomber', weight: 10 },
      { kind: 'volt_stalker', weight: 10 },
    ],
    eliteChance: 0.35,
    eliteAffixes: ['armored', 'swift'],
    maxElitesPerSquad: 2,
    siege: 'none',
    reward: { perkDraft: true, weaponPedestal: false, crates: 2 },
  },
  {
    wave: 9,
    arc: 'Elites II',
    burstCadenceS: 2.1,
    roster: [
      { kind: 'plasma_golem', weight: 10 },
      { kind: 'sniper_mech', weight: 10 },
      { kind: 'plague_bearer', weight: 9 },
      { kind: 'crimson_lancer', weight: 10 },
      { kind: 'void_reaper', weight: 10 },
      { kind: 'chrono_mage', weight: 9 },
      { kind: 'laser_sniper', weight: 8 },
      { kind: 'thunder_mage', weight: 8 },
      { kind: 'void_acolyte', weight: 9 },
      { kind: 'shock_drone_mk2', weight: 9 },
      { kind: 'healing_priest', weight: 8 },
      { kind: 'solar_priest', weight: 9 },
      { kind: 'magma_brute', weight: 9 },
    ],
    eliteChance: 0.55,
    eliteAffixes: ['armored', 'swift', 'volatile'],
    maxElitesPerSquad: 2,
    siege: 'portal_rush',
    siegeConfig: {
      gateCount: 1,
      gateBaseHp: 520,
      gateSpawnIntervalS: 5,
      gateSpawnCount: 2,
      midWaveGateAtBudgetPct: 0.5,
    },
    reward: { perkDraft: false, weaponPedestal: true, crates: 4, fullRestock: true },
  },
  {
    wave: 10,
    arc: 'Final Boss',
    burstCadenceS: 10.0,
    roster: [
      { kind: 'scarab', weight: 30 },
      { kind: 'skirmisher', weight: 30 },
      { kind: 'cactus_spitter', weight: 20 },
      { kind: 'bomb_goblin', weight: 20 },
    ],
    eliteChance: 0.25,
    eliteAffixes: ['armored', 'swift'],
    maxElitesPerSquad: 1,
    siege: 'none',
    boss: {
      bossByBiome: BANSUNG_BOSS_BY_BIOME,
      addKinds: ['scarab', 'skirmisher', 'cactus_spitter'],
      maxAdds: 8,
    },
    reward: { perkDraft: false, weaponPedestal: false, crates: 0 },
  },
];

export interface EndlessWaveMutator {
  id: string;
  name: string;
  vnName: string;
  desc: string;
  /** Optional declarative stat adjustments read by wave/world systems */
  mobSpeedMul?: number;
  energyCostMul?: number;
  crateCountMul?: number;
  eliteChanceAdd?: number;
  onWaveStart?(dir: unknown, spec: WaveSpec): void;
  onTick?(dir: unknown, ctx: unknown): void;
}

export const BANSUNG_ENDLESS_MUTATORS: Record<string, EndlessWaveMutator> = {
  speed_blitz: {
    id: 'speed_blitz',
    name: 'Speed Blitz',
    vnName: 'Cuồng Phong Tốc Độ',
    desc: 'Enemies move +25% faster and attack 15% more frequently.',
    mobSpeedMul: 1.25,
  },
  low_energy: {
    id: 'low_energy',
    name: 'Mana Drought',
    vnName: 'Khô Cạn Năng Lượng',
    desc: 'Weapon energy costs +25%; energy orbs restore extra on elites.',
    energyCostMul: 1.25,
  },
  double_crates: {
    id: 'double_crates',
    name: 'Supply Surge',
    vnName: 'Mưa Tiếp Tế',
    desc: 'Doubles breakable crate replenishment each wave.',
    crateCountMul: 2,
  },
  elite_surge: {
    id: 'elite_surge',
    name: 'Crimson Vanguard',
    vnName: 'Tinh Anh Trỗi Dậy',
    desc: '+20% Elite spawn chance with volatile affixes.',
    eliteChanceAdd: 0.2,
  },
};

/** Extensible mutator registry (`d40` / `d46`) pre-seeded with built-in endless mutators. */
export const ENDLESS_MUTATOR_REGISTRY: Record<string, EndlessWaveMutator> = {
  ...BANSUNG_ENDLESS_MUTATORS,
};

/** Registers or overrides an endless mutator without touching core director code. */
export function registerEndlessMutator(mutator: EndlessWaveMutator): void {
  ENDLESS_MUTATOR_REGISTRY[mutator.id] = mutator;
}

export const BANSUNG_ENDLESS_BOSS_ROTATION: readonly BansungEnemyId[] = [
  'boss_arsenal',
  'boss_overlord',
  'boss_colossus',
  'boss_beholder',
  'boss_tempest',
  'boss_frost_empress',
  'boss_storm_herald',
  'boss_destroyer',
  'boss_abyssal_leviathan',
];

const ENDLESS_SIEGE_ROTATION: readonly BansungSiegeKind[] = [
  'portal_rush',
  'supply_beacon',
  'artillery_siege',
];

const ENDLESS_MUTATOR_IDS = Object.keys(BANSUNG_ENDLESS_MUTATORS);

/** Builds a wave spec for standard waves 1..10 or endless 5-wave cycles (11+). */
export function getBansungWaveSpec(wave: number): WaveSpec {
  const clamped = Math.max(1, Math.floor(wave));
  if (clamped <= BANSUNG_TOTAL_WAVES) {
    return BANSUNG_WAVES[clamped - 1];
  }

  const offset = clamped - 11;
  const cycle = Math.floor(offset / 5);
  const step = offset % 5;
  const mutatorId = ENDLESS_MUTATOR_IDS[offset % ENDLESS_MUTATOR_IDS.length];
  const eliteChance = Math.min(0.85, 0.55 + 0.08 * cycle);
  const openPerkDraft = clamped % 2 === 0;
  const fullRoster = BANSUNG_WAVES[8].roster;

  if (step === 2) {
    const siege = ENDLESS_SIEGE_ROTATION[cycle % ENDLESS_SIEGE_ROTATION.length];
    const secondarySiege = ENDLESS_SIEGE_ROTATION[(cycle + 1) % ENDLESS_SIEGE_ROTATION.length];
    return {
      wave: clamped,
      arc: `Endless Cycle ${cycle + 1} — Double Siege`,
      burstCadenceS: Math.max(1.6, 2.1 - cycle * 0.08),
      roster: fullRoster,
      eliteChance,
      eliteAffixes: ['armored', 'swift', 'volatile'],
      maxElitesPerSquad: 3,
      siege,
      secondarySiege,
      siegeConfig: {
        gateCount: 2,
        gateBaseHp: Math.round(520 * (1 + 0.25 * cycle)),
        gateSpawnIntervalS: 4.5,
        gateSpawnCount: 2,
        beaconRadius: 150,
        beaconHoldS: 20,
        artilleryIntervalS: 4.0,
        artilleryFuseS: 1.4,
      },
      reward: { perkDraft: openPerkDraft, weaponPedestal: true, crates: 2 },
      endlessCycle: cycle,
      mutators: mutatorId ? [mutatorId] : [],
    };
  }

  if (step === 3) {
    const miniVariant = cycle % 3;
    const miniCount = miniVariant === 0 ? 2 : miniVariant === 1 ? 5 : 3;
    const miniScale = miniVariant === 0 ? 0.92 : miniVariant === 1 ? 0.72 : 0.86;
    const miniHpPerUnit = miniVariant === 0 ? 0.6 : miniVariant === 1 ? 0.36 : 0.52;
    const miniMode: BansungBossEncounterMode =
      miniVariant === 0 ? 'duo' : miniVariant === 1 ? 'mini_swarm_5' : 'trio';
    const arcTag =
      miniCount === 5
        ? '5 Mini-Bosses'
        : miniCount === 3
          ? 'Triple Vanguard'
          : 'Twin Vanguard';
    return {
      wave: clamped,
      arc: `Endless Cycle ${cycle + 1} — ${arcTag}`,
      burstCadenceS: 2.2,
      roster: BANSUNG_WAVES[7].roster,
      eliteChance,
      eliteAffixes: ['armored', 'swift', 'volatile'],
      maxElitesPerSquad: 2,
      siege: 'none',
      miniBoss: {
        hpMult: miniHpPerUnit * (1 + 0.38 * cycle + 0.08 * cycle * cycle),
        count: miniCount,
        scale: miniScale,
        bossMode: miniMode,
        addKinds: ['scarab', 'skirmisher', 'bomb_goblin', 'venom_stalker'],
        maxAdds: 8,
        addIntervalS: 10,
        bossByBiome: BANSUNG_WAVES[3].miniBoss!.bossByBiome,
      },
      reward: { perkDraft: openPerkDraft, weaponPedestal: false, crates: 2, healPulse: true },
      endlessCycle: cycle,
      mutators: mutatorId ? [mutatorId] : [],
    };
  }

  if (step === 4) {
    const bossId = BANSUNG_ENDLESS_BOSS_ROTATION[cycle % BANSUNG_ENDLESS_BOSS_ROTATION.length];
    const bossVariant = cycle % 4;
    const bossMode: BansungBossEncounterMode =
      bossVariant === 0
        ? 'single'
        : bossVariant === 1
          ? 'splitter_giant'
          : bossVariant === 2
            ? 'duo'
            : 'trio';
    const bossCount = bossVariant === 2 ? 2 : bossVariant === 3 ? 3 : 1;
    const bossScale =
      bossVariant === 1 ? 1.68 : bossVariant === 2 ? 0.98 : bossVariant === 3 ? 0.90 : 1.18 + Math.min(0.42, cycle * 0.06);
    const bossHpPerUnit =
      bossVariant === 1
        ? 1.15 * (1 + 0.35 * cycle)
        : bossVariant === 2
          ? 0.72 * (1 + 0.35 * cycle)
          : bossVariant === 3
            ? 0.58 * (1 + 0.35 * cycle)
            : 1 + 0.4 * cycle;
    const splitTier = bossVariant === 1 ? 2 : 0;
    const extraKinds =
      bossCount > 1
        ? BANSUNG_ENDLESS_BOSS_ROTATION.map(
            (_, idx) => BANSUNG_ENDLESS_BOSS_ROTATION[(cycle + idx) % BANSUNG_ENDLESS_BOSS_ROTATION.length],
          ).slice(0, bossCount)
        : undefined;
    const apexTag =
      bossMode === 'splitter_giant'
        ? 'Boss Khổng Lồ Phân Thân (1→4→16)'
        : bossCount === 3
          ? '3 Đại Boss'
          : bossCount === 2
            ? '2 Đại Boss'
            : 'Apex Boss';
    return {
      wave: clamped,
      arc: `Endless Cycle ${cycle + 1} — ${apexTag}`,
      burstCadenceS: 8.5,
      roster: BANSUNG_WAVES[9].roster,
      eliteChance: Math.min(0.75, 0.3 + 0.06 * cycle),
      eliteAffixes: ['armored', 'swift', 'volatile'],
      maxElitesPerSquad: 2,
      siege: 'none',
      boss: {
        count: bossCount,
        hpMult: bossHpPerUnit,
        scale: bossScale,
        splitTier,
        bossMode,
        ...(extraKinds ? { extraKinds } : {}),
        bossByBiome: { desert: bossId, crypt: bossId, cyber: bossId },
        addKinds: ['scarab', 'skirmisher', 'cactus_spitter', 'frost_mage'],
        maxAdds: 8,
      },
      reward: { perkDraft: openPerkDraft, weaponPedestal: true, crates: 3, fullRestock: true },
      endlessCycle: cycle,
      mutators: mutatorId ? [mutatorId] : [],
    };
  }

  return {
    wave: clamped,
    arc: `Endless Cycle ${cycle + 1} — Elite Swarm`,
    burstCadenceS: Math.max(1.5, 2.0 - cycle * 0.08),
    roster: fullRoster,
    eliteChance,
    eliteAffixes: ['armored', 'swift', 'volatile'],
    maxElitesPerSquad: 3,
    siege: 'none',
    reward: { perkDraft: openPerkDraft, weaponPedestal: false, crates: 2 },
    endlessCycle: cycle,
    mutators: mutatorId ? [mutatorId] : [],
  };
}

// --- Difficulty & Wave Scaling Formulas (d37, d39, d40) ---

export type BansungDifficultyKey = 'easy' | 'normal' | 'hard' | 'hell' | 'insane';

export interface BansungDifficultyScale {
  budget: number;
  hp: number;
  dmg: number;
  bossHp: number;
}

export const BANSUNG_DIFFICULTY_SCALE: Record<BansungDifficultyKey, BansungDifficultyScale> = {
  easy: { budget: 0.75, hp: 0.75, dmg: 0.75, bossHp: 0.8 },
  normal: { budget: 1.0, hp: 1.0, dmg: 1.0, bossHp: 1.0 },
  hard: { budget: 1.35, hp: 1.3, dmg: 1.25, bossHp: 1.35 },
  hell: { budget: 1.6, hp: 1.6, dmg: 1.5, bossHp: 1.75 },
  insane: { budget: 1.6, hp: 1.6, dmg: 1.5, bossHp: 1.75 },
};

function getDiffScale(diff: string): BansungDifficultyScale {
  return BANSUNG_DIFFICULTY_SCALE[diff as BansungDifficultyKey] ?? BANSUNG_DIFFICULTY_SCALE.normal;
}

function clampCoopPlayers(playerCount: number): number {
  return Math.max(1, Math.min(4, Math.round(playerCount)));
}

/** Computes total spawn budget for `(wave, playerCount, difficulty)` (`d40`). */
export function computeWaveBudget(wave: number, playerCount: number, difficulty = 'normal'): number {
  const n = clampCoopPlayers(playerCount);
  const w = Math.max(1, wave);
  const d = getDiffScale(difficulty);
  return Math.round((24 + 10 * w + 1.8 * w * w) * (1 + 0.55 * (n - 1)) * d.budget);
}

/**
 * Computes maximum concurrent/wave monsters using linear progression:
 * Wave 1 = 10, Wave 2 = 15, Wave 3 = 20, ... capped at 72.
 */
export function computeWaveMaxMobs(wave: number): number {
  const safeWave = Number.isFinite(wave) ? Math.max(1, Math.round(wave)) : 1;
  return Math.min(72, 10 + (safeWave - 1) * 5);
}

/** Computes active mob concurrency cap (`10` on Wave 1, `+5` per wave, max `72`). */
export function computeActiveMobCap(wave: number, _playerCount: number): number {
  return computeWaveMaxMobs(wave);
}

/** Computes regular mob HP multiplier (`d40`). */
export function computeMobHpMult(wave: number, playerCount: number, difficulty = 'normal'): number {
  const n = clampCoopPlayers(playerCount);
  const w = Math.max(1, wave);
  const d = getDiffScale(difficulty);
  return (1 + 0.14 * (w - 1)) * (1 + 0.28 * (n - 1)) * d.hp;
}

/** Computes boss HP multiplier (`d37`–`d40`). */
export function computeBossHpMult(
  playerCount: number,
  difficulty = 'normal',
  endlessTier = 0,
): number {
  const n = clampCoopPlayers(playerCount);
  const d = getDiffScale(difficulty);
  return (1 + 0.72 * (n - 1)) * d.bossHp * (1 + 0.45 * Math.max(0, endlessTier));
}

/** Computes regular mob damage multiplier (`d40`). */
export function computeMobDmgMult(wave: number, difficulty = 'normal'): number {
  const w = Math.max(1, wave);
  const d = getDiffScale(difficulty);
  return Math.min(1.85, (1 + 0.045 * (w - 1)) * d.dmg);
}

// ---------------------------------------------------------------------------
// 2b. Survival Milestones (1/3/5/7/9/11m Special Mobs, 2/5/8/12m 4 Bosses)
// ---------------------------------------------------------------------------

export const BANSUNG_SURVIVAL_CYCLE_S = 1200;
export const BANSUNG_SURVIVAL_STAGE_S = 300;

/** Special monster unlock milestones inside each 20-minute cycle: 1, 3, 5, 7, 9, 11 min */
export const BANSUNG_SURVIVAL_SPECIAL_MILESTONES_S = [60, 180, 300, 420, 540, 660] as const;

export const BANSUNG_SURVIVAL_SPECIAL_ORDER: readonly BansungEnemyId[] = [
  'cactus_spitter',
  'bomb_goblin',
  'cactus_brute',
  'laser_sniper',
  'pyro_shaman',
  'thunder_mage',
] as const;

/** Boss spawn milestones inside each cycle: 3m/5m/7m = 1 Boss; 9m+ onward = 2 Co-op Bosses. */
export const BANSUNG_SURVIVAL_BOSS_MILESTONES_S = [180, 300, 420, 540] as const;
export const BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S = [180, 300, 420, 540, 660, 780, 900, 1020, 1140] as const;

export const BANSUNG_SURVIVAL_BOSS_ORDER: readonly BansungEnemyId[] = [
  'boss_arsenal',
  'boss_overlord',
  'boss_colossus',
  'boss_beholder',
  'boss_frost_empress',
  'boss_tempest',
  'boss_storm_herald',
  'boss_destroyer',
  'boss_abyssal_leviathan',
  'boss_destroyer',
] as const;

export interface BansungSurvivalStageSpec {
  /** Stage index 0..3 inside each 20-minute cycle */
  idx: 0 | 1 | 2 | 3;
  id: BansungSurvivalStageId;
  name: string;
  vnName: string;
  /** Inclusive cycle start second (0, 120, 300, 480) */
  startSec: number;
  /** Exclusive cycle end second (120, 300, 480, 1200) */
  endSec: number;
  /** Linearly interpolated HP multiplier across the stage */
  hpMultRange: readonly [number, number];
  /** Linearly interpolated damage multiplier across the stage */
  dmgMultRange: readonly [number, number];
  /** Movement speed multiplier for spawned mobs */
  speedMult: number;
  /** Extra flat armor added to spawned mobs */
  bonusArmor: number;
  /** Linearly interpolated elite chance across the stage */
  eliteChanceRange: readonly [number, number];
  /** True for 8m+ Evolved New-Edition hordes (`BANSUNG_EFLAG_EVOLVED`) */
  evolvedFlag: boolean;
  /** Burst spawn interval in seconds */
  burstCadenceS: number;
  /** Concurrent active-mob cap multiplier */
  mobCapScale: number;
  /** Weighted enemy spawn table */
  roster: readonly WaveRosterEntry[];
  /** Seconds between boss spawns if rotating */
  bossIntervalS?: number;
  /** Boss rotation order */
  bossRotation?: readonly BansungEnemyId[];
}

export const BANSUNG_SURVIVAL_STAGES: readonly [
  BansungSurvivalStageSpec,
  BansungSurvivalStageSpec,
  BansungSurvivalStageSpec,
  BansungSurvivalStageSpec,
] = [
  {
    idx: 0,
    id: 'swarm_light',
    name: 'Warmup & Boss I Prep',
    vnName: '2p Đầu Nhẹ Nhàng · Farm Cấp',
    startSec: 0,
    endSec: 120,
    hpMultRange: [1.15, 1.5],
    dmgMultRange: [0.95, 1.15],
    speedMult: 0.98,
    bonusArmor: 1,
    eliteChanceRange: [0, 0.05],
    evolvedFlag: false,
    burstCadenceS: 2.6,
    mobCapScale: 0.9,
    roster: [
      { kind: 'scarab', weight: 55 },
      { kind: 'skirmisher', weight: 30 },
      { kind: 'cactus_spitter', weight: 15 },
    ],
  },
  {
    idx: 1,
    id: 'heavy_brute',
    name: 'Arsenal Boss & Specials',
    vnName: '2-5p Boss Súng & Đặc Chủng',
    startSec: 120,
    endSec: 300,
    hpMultRange: [1.65, 2.3],
    dmgMultRange: [1.15, 1.4],
    speedMult: 1.04,
    bonusArmor: 4,
    eliteChanceRange: [0.10, 0.22],
    evolvedFlag: false,
    burstCadenceS: 2.2,
    mobCapScale: 1.0,
    roster: [
      { kind: 'scarab', weight: 22 },
      { kind: 'skirmisher', weight: 20 },
      { kind: 'cactus_spitter', weight: 18 },
      { kind: 'bomb_goblin', weight: 18 },
      { kind: 'venom_stalker', weight: 12 },
      { kind: 'frost_mage', weight: 10 },
    ],
    bossRotation: ['boss_arsenal'],
  },
  {
    idx: 2,
    id: 'boss_hunt',
    name: 'Overlord & Colossus Surge',
    vnName: '5-8p Boss Công Nghệ & Quái Trâu',
    startSec: 300,
    endSec: 480,
    hpMultRange: [2.5, 3.45],
    dmgMultRange: [1.35, 1.65],
    speedMult: 1.08,
    bonusArmor: 8,
    eliteChanceRange: [0.22, 0.34],
    evolvedFlag: false,
    burstCadenceS: 2.1,
    mobCapScale: 1.1,
    roster: [
      { kind: 'cactus_brute', weight: 20 },
      { kind: 'bomb_goblin', weight: 14 },
      { kind: 'cactus_spitter', weight: 12 },
      { kind: 'laser_sniper', weight: 14 },
      { kind: 'skirmisher', weight: 12 },
      { kind: 'shield_warden', weight: 10 },
      { kind: 'shock_drone_mk2', weight: 10 },
      { kind: 'saw_berserker', weight: 8 },
    ],
    bossRotation: ['boss_overlord', 'boss_colossus'],
  },
  {
    idx: 3,
    id: 'evolved_horde',
    name: 'Apex Bosses & Evolved Horde',
    vnName: '8-12p+ Đại Boss & Tiến Hóa',
    startSec: 480,
    endSec: 1200,
    hpMultRange: [3.6, 5.4],
    dmgMultRange: [1.55, 1.95],
    speedMult: 1.14,
    bonusArmor: 14,
    eliteChanceRange: [0.35, 0.45],
    evolvedFlag: true,
    burstCadenceS: 1.85,
    mobCapScale: 1.2,
    roster: [
      { kind: 'cactus_brute', weight: 14 },
      { kind: 'thunder_mage', weight: 12 },
      { kind: 'pyro_shaman', weight: 12 },
      { kind: 'laser_sniper', weight: 10 },
      { kind: 'bomb_goblin', weight: 8 },
      { kind: 'mortar_beetle', weight: 10 },
      { kind: 'void_acolyte', weight: 10 },
      { kind: 'healing_priest', weight: 8 },
      { kind: 'shield_warden', weight: 8 },
      { kind: 'saw_berserker', weight: 8 },
    ],
    bossRotation: ['boss_colossus', 'boss_beholder'],
  },
];

export interface BansungSurvivalBossEncounter {
  mode: BansungBossEncounterMode;
  count: number;
  mini: boolean;
  scale: number;
  splitTier: number;
  hpPerBossMult: number;
  dmgMult: number;
  kinds: readonly BansungEnemyId[];
  label: string;
}

export interface BansungSurvivalScheduleState {
  elapsedMs: number;
  elapsedS: number;
  cycle: number;
  cycleSec: number;
  stageIdx: 0 | 1 | 2 | 3;
  stageId: BansungSurvivalStageId;
  stageProgress: number;
  stageRemS: number;
  cycleMult: number;
  hpMult: number;
  bossHpMult: number;
  dmgMult: number;
  speedMult: number;
  bonusArmor: number;
  eliteChance: number;
  evolvedFlag: boolean;
  mobCap: number;
  burstCadenceS: number;
  roster: readonly WaveRosterEntry[];
  bossSlotIdx: number;
  bossKind?: BansungEnemyId;
  bossEncounter?: BansungSurvivalBossEncounter;
  unlockedSpecialCount: number;
  nextBossInS: number;
  mobLevel: number;
  stageSpec: BansungSurvivalStageSpec;
}

function lerpRange(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * Math.max(0, Math.min(1, t));
}

const SURVIVAL_NEW_MOB_UNLOCKS: ReadonlyArray<{ sec: number; kind: BansungEnemyId; weight: number }> = [
  { sec: 60, kind: 'venom_stalker', weight: 15 },
  { sec: 120, kind: 'chrono_mage', weight: 14 },
  { sec: 180, kind: 'frost_mage', weight: 14 },
  { sec: 180, kind: 'shock_drone_mk2', weight: 13 },
  { sec: 240, kind: 'plasma_golem', weight: 12 },
  { sec: 240, kind: 'magnet_drone', weight: 12 },
  { sec: 300, kind: 'shield_warden', weight: 13 },
  { sec: 300, kind: 'saw_berserker', weight: 12 },
  { sec: 360, kind: 'sniper_mech', weight: 12 },
  { sec: 360, kind: 'mirror_knight', weight: 12 },
  { sec: 420, kind: 'mortar_beetle', weight: 12 },
  { sec: 480, kind: 'plague_bearer', weight: 12 },
  { sec: 480, kind: 'blight_bomber', weight: 12 },
  { sec: 540, kind: 'healing_priest', weight: 11 },
  { sec: 540, kind: 'volt_stalker', weight: 12 },
  { sec: 600, kind: 'crimson_lancer', weight: 12 },
  { sec: 660, kind: 'void_acolyte', weight: 12 },
  { sec: 660, kind: 'solar_priest', weight: 11 },
  { sec: 720, kind: 'void_reaper', weight: 12 },
  { sec: 780, kind: 'magma_brute', weight: 12 },
];

function buildDynamicSurvivalRoster(cycleSec: number, cycle = 0): {
  roster: WaveRosterEntry[];
  unlockedSpecialCount: number;
} {
  const roster: WaveRosterEntry[] = [
    { kind: 'scarab', weight: cycle === 0 && cycleSec < 60 ? 60 : cycleSec < 300 ? 30 : 14 },
    { kind: 'skirmisher', weight: cycle === 0 && cycleSec < 60 ? 40 : cycleSec < 300 ? 24 : 14 },
  ];
  let unlocked = 0;
  for (let i = 0; i < BANSUNG_SURVIVAL_SPECIAL_MILESTONES_S.length; i++) {
    if (cycle > 0 || cycleSec >= BANSUNG_SURVIVAL_SPECIAL_MILESTONES_S[i]) {
      unlocked++;
      roster.push({ kind: BANSUNG_SURVIVAL_SPECIAL_ORDER[i], weight: 20 - i });
    }
  }
  for (let i = 0; i < SURVIVAL_NEW_MOB_UNLOCKS.length; i++) {
    const entry = SURVIVAL_NEW_MOB_UNLOCKS[i];
    if (cycle > 0 || cycleSec >= entry.sec) {
      roster.push({ kind: entry.kind, weight: entry.weight });
    }
  }
  return { roster, unlockedSpecialCount: unlocked };
}

function buildSurvivalBossEncounter(
  primaryKind: BansungEnemyId,
  slotIdx: number,
  cycle: number,
  dmgMult: number,
): BansungSurvivalBossEncounter {
  const bossDmgMult = dmgMult * (1 + 0.14 * cycle + 0.05 * slotIdx);
  // Minutes 3, 5, 7 (slots 0, 1, 2 in cycle 0) always spawn a single Boss; 9m+ onward spawns 2 Co-op Bosses.
  if (cycle > 0 || slotIdx >= 3) {
    const partnerIdx = (slotIdx + 1 + cycle) % BANSUNG_SURVIVAL_BOSS_ORDER.length;
    const rawPartner = BANSUNG_SURVIVAL_BOSS_ORDER[partnerIdx];
    const k2 = rawPartner === primaryKind ? 'boss_tempest' === primaryKind ? 'boss_colossus' : 'boss_tempest' : rawPartner;
    return {
      mode: 'duo',
      count: 2,
      mini: false,
      scale: 0.96,
      splitTier: 0,
      hpPerBossMult: 0.72,
      dmgMult: bossDmgMult * 0.92,
      kinds: [primaryKind, k2],
      label: `${BANSUNG_ENEMIES[primaryKind]?.vnName ?? primaryKind} + ${BANSUNG_ENEMIES[k2]?.vnName ?? k2}`,
    };
  }
  return {
    mode: 'single',
    count: 1,
    mini: false,
    scale: 1.0,
    splitTier: 0,
    hpPerBossMult: 1.0,
    dmgMult: bossDmgMult,
    kinds: [primaryKind],
    label: BANSUNG_ENEMIES[primaryKind]?.vnName ?? BANSUNG_ENEMIES[primaryKind]?.name ?? primaryKind,
  };
}

/**
 * Resolves Survival stage, Special Mob unlocks (`1/3/5/7/9/11` min),
 * infinite escalating cycle scaling (`cycle -> ∞`), and Boss encounters
 * (`3m/5m/7m` = 1 Boss; `9m+` onward = 2 Co-op Bosses).
 */
export function getSurvivalScheduleState(
  elapsedMs: number,
  difficulty = 'normal',
  playersN = 1,
  waveOverride?: number,
): BansungSurvivalScheduleState {
  const safeMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const elapsedS = Math.floor(safeMs / 1000);
  const cycle = Math.floor(elapsedS / BANSUNG_SURVIVAL_CYCLE_S);
  const cycleSec = elapsedS % BANSUNG_SURVIVAL_CYCLE_S;

  let stageIdx: 0 | 1 | 2 | 3 = 0;
  if (cycleSec >= 480) stageIdx = 3;
  else if (cycleSec >= 300) stageIdx = 2;
  else if (cycleSec >= 120) stageIdx = 1;

  const stageSpec = BANSUNG_SURVIVAL_STAGES[stageIdx];
  const stageSpan = Math.max(1, stageSpec.endSec - stageSpec.startSec);
  const stageElapsedS = Math.max(0, cycleSec - stageSpec.startSec);
  const stageProgress = Math.max(0, Math.min(1, stageElapsedS / stageSpan));
  const stageRemS = Math.max(0, stageSpec.endSec - cycleSec);

  const n = clampCoopPlayers(playersN);
  const d = getDiffScale(difficulty);
  // Infinite cycle multiplier grows endlessly across cycles without hard plateau
  const cycleMult = 1 + 0.65 * cycle + 0.18 * cycle * cycle;
  const coopMobHp = 1 + 0.35 * (n - 1);

  const hpMult = lerpRange(stageSpec.hpMultRange, stageProgress) * coopMobHp * d.hp * cycleMult;
  const dmgMult = Math.min(
    8.5,
    lerpRange(stageSpec.dmgMultRange, stageProgress) * d.dmg * (1 + 0.28 * cycle),
  );
  const speedMult = stageSpec.speedMult * (1 + Math.min(0.32, 0.05 * cycle));
  const bonusArmor = stageSpec.bonusArmor + cycle * 2;
  const eliteChance = Math.min(
    0.85,
    lerpRange(stageSpec.eliteChanceRange, stageProgress) + 0.08 * cycle,
  );
  const effectiveWave =
    waveOverride !== undefined ? Math.max(1, Math.round(waveOverride)) : stageIdx + 1 + cycle * 4;
  const mobCap = computeWaveMaxMobs(effectiveWave);

  let bossSlotIdx = -1;
  let bossKind: BansungEnemyId | undefined;
  let nextBossInS = Math.max(0, BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S[0] - cycleSec);
  for (let i = BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S.length - 1; i >= 0; i--) {
    if (cycleSec >= BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S[i]) {
      bossSlotIdx = i;
      bossKind = BANSUNG_SURVIVAL_BOSS_ORDER[i % BANSUNG_SURVIVAL_BOSS_ORDER.length];
      const nextMilestone = BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S[i + 1];
      nextBossInS =
        nextMilestone !== undefined
          ? Math.max(0, nextMilestone - cycleSec)
          : BANSUNG_SURVIVAL_CYCLE_S - cycleSec + BANSUNG_SURVIVAL_EXTENDED_BOSS_MILESTONES_S[0];
      break;
    }
  }

  const { roster, unlockedSpecialCount } = buildDynamicSurvivalRoster(cycleSec, cycle);
  const bossHpMult =
    computeBossHpMult(n, difficulty, cycle) *
    cycleMult *
    (bossSlotIdx > 0 ? 1 + 0.24 * bossSlotIdx : 1);
  const bossEncounter =
    bossKind && bossSlotIdx >= 0
      ? buildSurvivalBossEncounter(bossKind, bossSlotIdx, cycle, dmgMult)
      : undefined;

  return {
    elapsedMs: safeMs,
    elapsedS,
    cycle,
    cycleSec,
    stageIdx,
    stageId: stageSpec.id,
    stageProgress,
    stageRemS,
    cycleMult,
    hpMult,
    bossHpMult,
    dmgMult,
    speedMult,
    bonusArmor,
    eliteChance,
    evolvedFlag: stageSpec.evolvedFlag,
    mobCap,
    burstCadenceS: Math.max(1.15, stageSpec.burstCadenceS - Math.min(0.55, cycle * 0.1)),
    roster,
    bossSlotIdx,
    bossKind,
    ...(bossEncounter ? { bossEncounter } : {}),
    unlockedSpecialCount,
    nextBossInS,
    mobLevel: computeMobLevelFromTimeS(elapsedS),
    stageSpec,
  };
}

export interface EnemyXpReward {
  kind: 'xp_orb_s' | 'xp_orb_m' | 'xp_orb_l';
  count: number;
  totalXp: number;
}

const ENEMY_BASE_XP_ORB: Record<
  BansungEnemyId,
  { kind: 'xp_orb_s' | 'xp_orb_m' | 'xp_orb_l'; count: number }
> = {
  scarab: { kind: 'xp_orb_s', count: 1 },
  skirmisher: { kind: 'xp_orb_s', count: 1 },
  bomb_goblin: { kind: 'xp_orb_s', count: 2 },
  cactus_spitter: { kind: 'xp_orb_s', count: 2 },
  pyro_shaman: { kind: 'xp_orb_m', count: 1 },
  laser_sniper: { kind: 'xp_orb_m', count: 1 },
  thunder_mage: { kind: 'xp_orb_m', count: 1 },
  cactus_brute: { kind: 'xp_orb_m', count: 2 },
  boss_beholder: { kind: 'xp_orb_l', count: 4 },
  boss_colossus: { kind: 'xp_orb_l', count: 5 },
  boss_overlord: { kind: 'xp_orb_l', count: 6 },
  boss_arsenal: { kind: 'xp_orb_l', count: 5 },
  iron_drone: { kind: 'xp_orb_m', count: 1 },
  frost_mage: { kind: 'xp_orb_m', count: 1 },
  venom_stalker: { kind: 'xp_orb_s', count: 2 },
  shield_warden: { kind: 'xp_orb_m', count: 2 },
  mortar_beetle: { kind: 'xp_orb_m', count: 2 },
  void_acolyte: { kind: 'xp_orb_m', count: 2 },
  saw_berserker: { kind: 'xp_orb_m', count: 2 },
  healing_priest: { kind: 'xp_orb_m', count: 2 },
  shock_drone_mk2: { kind: 'xp_orb_m', count: 2 },
  chrono_mage: { kind: 'xp_orb_m', count: 2 },
  plasma_golem: { kind: 'xp_orb_m', count: 3 },
  sniper_mech: { kind: 'xp_orb_m', count: 2 },
  plague_bearer: { kind: 'xp_orb_m', count: 2 },
  crimson_lancer: { kind: 'xp_orb_m', count: 2 },
  void_reaper: { kind: 'xp_orb_m', count: 3 },
  mirror_knight: { kind: 'xp_orb_m', count: 2 },
  magnet_drone: { kind: 'xp_orb_m', count: 2 },
  blight_bomber: { kind: 'xp_orb_m', count: 2 },
  volt_stalker: { kind: 'xp_orb_m', count: 2 },
  solar_priest: { kind: 'xp_orb_m', count: 2 },
  magma_brute: { kind: 'xp_orb_m', count: 3 },
  boss_tempest: { kind: 'xp_orb_l', count: 8 },
  boss_destroyer: { kind: 'xp_orb_l', count: 14 },
  boss_frost_empress: { kind: 'xp_orb_l', count: 10 },
  boss_storm_herald: { kind: 'xp_orb_l', count: 12 },
  boss_abyssal_leviathan: { kind: 'xp_orb_l', count: 18 },
};

/** Computes guaranteed XP orb drop tier, orb count, and exact total XP on enemy defeat. */
export function getEnemyXpReward(
  enemyId: BansungEnemyId,
  isElite: boolean,
  isEvolved: boolean,
  cycle: number,
): EnemyXpReward {
  const base = ENEMY_BASE_XP_ORB[enemyId] ?? { kind: 'xp_orb_s' as const, count: 1 };
  const mult =
    (isElite ? 2.0 : 1) * (isEvolved ? 1.5 : 1) * (1 + 0.35 * Math.max(0, Math.floor(cycle)));

  let kind: 'xp_orb_s' | 'xp_orb_m' | 'xp_orb_l' = base.kind;
  let count = Math.max(1, Math.round(base.count * mult));

  if (kind === 'xp_orb_s' && count * BANSUNG_PICKUPS.xp_orb_s.amount >= BANSUNG_PICKUPS.xp_orb_m.amount) {
    const xpTarget = count * BANSUNG_PICKUPS.xp_orb_s.amount;
    kind = 'xp_orb_m';
    count = Math.max(1, Math.round(xpTarget / BANSUNG_PICKUPS.xp_orb_m.amount));
  }
  if (kind === 'xp_orb_m' && count * BANSUNG_PICKUPS.xp_orb_m.amount >= BANSUNG_PICKUPS.xp_orb_l.amount) {
    const xpTarget = count * BANSUNG_PICKUPS.xp_orb_m.amount;
    kind = 'xp_orb_l';
    count = Math.max(1, Math.round(xpTarget / BANSUNG_PICKUPS.xp_orb_l.amount));
  }

  return {
    kind,
    count,
    totalXp: BANSUNG_PICKUPS[kind].amount * count,
  };
}

// ---------------------------------------------------------------------------
// 3. Modular Wave-Clear Perks (d32)
// ---------------------------------------------------------------------------

export type PerkId = BansungPerkId;

export const BANSUNG_STARTER_PERK_IDS = [
  'vitality_boost',
  'iron_bastion',
  'energy_overflow',
  'quick_hands',
  'swift_boots',
  'magnet_aura',
  'piercing_rounds',
  'blast_master',
  'vampiric_fang',
  'coop_med_aura',
  'ricochet_shot',
  'static_shield',
] as const;

export type BansungStarterPerkId = (typeof BANSUNG_STARTER_PERK_IDS)[number];

export interface PerkMods {
  maxHpAdd?: number;
  maxArmorAdd?: number;
  armorRegenMul?: number;
  maxEnergyAdd?: number;
  dmgMul?: number;
  fireRateMul?: number;
  reloadSpeedMul?: number;
  moveSpeedMul?: number;
  critChanceAdd?: number;
  dashCdMul?: number;
  extraPierce?: number;
  extraBounce?: number;
  blastRadiusMul?: number;
  energyCostMul?: number;
  magnetMul?: number;
  pickupValueMul?: number;
  reviveSpeedMul?: number;
  coopAuraDmg?: number;
  killHealEvery?: number;
  staticShield?: boolean;
}

export interface PerkDef {
  id: BansungPerkId;
  name: string;
  vnName: string;
  rarity: 'common' | 'rare' | 'epic';
  maxStacks: number;
  icon: string;
  desc: string;
  mods: PerkMods;
}

export const BANSUNG_PERK_RARITY_WEIGHTS = {
  common: 60,
  rare: 30,
  epic: 10,
} as const;

/** Starter 12 modular perks (`d32`); supports runtime extension via `registerBansungPerk`. */
export const BANSUNG_PERKS: Record<BansungStarterPerkId, PerkDef> & Record<BansungPerkId, PerkDef> = {
  vitality_boost: {
    id: 'vitality_boost',
    name: 'Vitality Boost',
    vnName: 'Sinh Lực Dồi Dào',
    rarity: 'common',
    maxStacks: 3,
    icon: 'perk_vitality',
    desc: '+40 Max HP and instantly heal 40 HP.',
    mods: { maxHpAdd: 40 },
  },
  iron_bastion: {
    id: 'iron_bastion',
    name: 'Iron Bastion',
    vnName: 'Pháo Đài Thép',
    rarity: 'common',
    maxStacks: 3,
    icon: 'perk_bastion',
    desc: '+30 Max Armor and +30% armor regen speed.',
    mods: { maxArmorAdd: 30, armorRegenMul: 0.3 },
  },
  energy_overflow: {
    id: 'energy_overflow',
    name: 'Energy Overflow',
    vnName: 'Tràn Trề Năng Lượng',
    rarity: 'common',
    maxStacks: 2,
    icon: 'perk_energy',
    desc: '+60 Max Energy and -20% weapon energy cost.',
    mods: { maxEnergyAdd: 60, energyCostMul: -0.2 },
  },
  quick_hands: {
    id: 'quick_hands',
    name: 'Quick Hands',
    vnName: 'Tay Nhanh Thần Tốc',
    rarity: 'common',
    maxStacks: 3,
    icon: 'perk_quick_hands',
    desc: '+20% fire rate and +25% reload speed.',
    mods: { fireRateMul: 0.2, reloadSpeedMul: 0.25 },
  },
  swift_boots: {
    id: 'swift_boots',
    name: 'Swift Boots',
    vnName: 'Giày Gió Lướt',
    rarity: 'common',
    maxStacks: 2,
    icon: 'perk_swift_boots',
    desc: '+15% move speed and -20% dash cooldown.',
    mods: { moveSpeedMul: 0.15, dashCdMul: -0.2 },
  },
  magnet_aura: {
    id: 'magnet_aura',
    name: 'Magnet Aura',
    vnName: 'Từ Trường Hút Vật Phẩm',
    rarity: 'common',
    maxStacks: 2,
    icon: 'perk_magnet',
    desc: '+50% pickup magnet radius and +25% pickup value.',
    mods: { magnetMul: 0.5, pickupValueMul: 0.25 },
  },
  piercing_rounds: {
    id: 'piercing_rounds',
    name: 'Piercing Rounds',
    vnName: 'Đạn Xuyên Phá',
    rarity: 'rare',
    maxStacks: 2,
    icon: 'perk_pierce',
    desc: '+1 projectile pierce and +15% critical chance.',
    mods: { extraPierce: 1, critChanceAdd: 0.15 },
  },
  blast_master: {
    id: 'blast_master',
    name: 'Blast Master',
    vnName: 'Bậc Thầy Thuốc Nổ',
    rarity: 'rare',
    maxStacks: 2,
    icon: 'perk_blast',
    desc: '+25% explosion radius and +12% all damage.',
    mods: { blastRadiusMul: 0.25, dmgMul: 0.12 },
  },
  vampiric_fang: {
    id: 'vampiric_fang',
    name: 'Vampiric Fang',
    vnName: 'Nanh Hút Máu',
    rarity: 'rare',
    maxStacks: 2,
    icon: 'perk_vampiric',
    desc: 'Restore 1 HP every 8 enemy kills.',
    mods: { killHealEvery: 8 },
  },
  coop_med_aura: {
    id: 'coop_med_aura',
    name: 'Co-op Med Aura',
    vnName: 'Hào Quang Đồng Đội',
    rarity: 'rare',
    maxStacks: 1,
    icon: 'perk_coop_aura',
    desc: '+40% revive speed and +10% damage aura within 140px of allies.',
    mods: { reviveSpeedMul: 0.4, coopAuraDmg: 0.1 },
  },
  ricochet_shot: {
    id: 'ricochet_shot',
    name: 'Ricochet Shot',
    vnName: 'Đạn Nảy Tường',
    rarity: 'epic',
    maxStacks: 1,
    icon: 'perk_ricochet',
    desc: 'Projectiles bounce 1 extra time off walls and crates.',
    mods: { extraBounce: 1 },
  },
  static_shield: {
    id: 'static_shield',
    name: 'Static Shield',
    vnName: 'Giáp Tĩnh Điện',
    rarity: 'epic',
    maxStacks: 1,
    icon: 'perk_static_shield',
    desc: 'Emit a 90px 1.2s stun shockwave when armor breaks (10s CD).',
    mods: { staticShield: true },
  },
};

/** Registers a modular perk definition (`d46` extension hook). */
export function registerBansungPerk(perk: PerkDef): void {
  (BANSUNG_PERKS as Record<string, PerkDef>)[perk.id] = perk;
}

/** Safely looks up a perk definition by ID. */
export function getBansungPerk(id: BansungPerkId): PerkDef | undefined {
  return Object.prototype.hasOwnProperty.call(BANSUNG_PERKS, id) ? BANSUNG_PERKS[id] : undefined;
}

export interface AggregatedPerkMods {
  maxHpAdd: number;
  maxArmorAdd: number;
  armorRegenMul: number;
  maxEnergyAdd: number;
  dmgMul: number;
  fireRateMul: number;
  reloadSpeedMul: number;
  moveSpeedMul: number;
  critChanceAdd: number;
  dashCdMul: number;
  extraPierce: number;
  extraBounce: number;
  blastRadiusMul: number;
  energyCostMul: number;
  magnetMul: number;
  pickupValueMul: number;
  reviveSpeedMul: number;
  coopAuraDmg: number;
  killHealEvery: number;
  staticShield: boolean;
}

/**
 * Sums stacked perk modifiers into flat/multiplicative fields for O(1) combat reads (`d32`).
 * Multiplier fields resolve as `1 + sum(delta)` so baseline is `1.0`.
 */
export function aggregatePerkMods(
  perkIds: readonly BansungPerkId[],
  registry: Record<string, PerkDef> = BANSUNG_PERKS,
): AggregatedPerkMods {
  const out: AggregatedPerkMods = {
    maxHpAdd: 0,
    maxArmorAdd: 0,
    armorRegenMul: 1,
    maxEnergyAdd: 0,
    dmgMul: 1,
    fireRateMul: 1,
    reloadSpeedMul: 1,
    moveSpeedMul: 1,
    critChanceAdd: 0,
    dashCdMul: 1,
    extraPierce: 0,
    extraBounce: 0,
    blastRadiusMul: 1,
    energyCostMul: 1,
    magnetMul: 1,
    pickupValueMul: 1,
    reviveSpeedMul: 1,
    coopAuraDmg: 0,
    killHealEvery: 0,
    staticShield: false,
  };

  const stacks = new Map<string, number>();
  for (const id of perkIds) {
    const def = Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : undefined;
    if (!def) continue;
    const count = stacks.get(id) ?? 0;
    if (count >= def.maxStacks) continue;
    stacks.set(id, count + 1);

    const m = def.mods;
    if (m.maxHpAdd) out.maxHpAdd += m.maxHpAdd;
    if (m.maxArmorAdd) out.maxArmorAdd += m.maxArmorAdd;
    if (m.armorRegenMul) out.armorRegenMul += m.armorRegenMul;
    if (m.maxEnergyAdd) out.maxEnergyAdd += m.maxEnergyAdd;
    if (m.dmgMul) out.dmgMul += m.dmgMul;
    if (m.fireRateMul) out.fireRateMul += m.fireRateMul;
    if (m.reloadSpeedMul) out.reloadSpeedMul += m.reloadSpeedMul;
    if (m.moveSpeedMul) out.moveSpeedMul += m.moveSpeedMul;
    if (m.critChanceAdd) out.critChanceAdd += m.critChanceAdd;
    if (m.dashCdMul) out.dashCdMul += m.dashCdMul;
    if (m.extraPierce) out.extraPierce += m.extraPierce;
    if (m.extraBounce) out.extraBounce += m.extraBounce;
    if (m.blastRadiusMul) out.blastRadiusMul += m.blastRadiusMul;
    if (m.energyCostMul) out.energyCostMul += m.energyCostMul;
    if (m.magnetMul) out.magnetMul += m.magnetMul;
    if (m.pickupValueMul) out.pickupValueMul += m.pickupValueMul;
    if (m.reviveSpeedMul) out.reviveSpeedMul += m.reviveSpeedMul;
    if (m.coopAuraDmg) out.coopAuraDmg += m.coopAuraDmg;
    if (m.killHealEvery && (out.killHealEvery === 0 || m.killHealEvery < out.killHealEvery)) {
      out.killHealEvery = m.killHealEvery;
    } else if (m.killHealEvery && count > 0) {
      out.killHealEvery = Math.max(2, Math.floor(out.killHealEvery * 0.65));
    }
    if (m.staticShield) out.staticShield = true;
  }

  out.dashCdMul = Math.max(0.35, out.dashCdMul);
  out.energyCostMul = Math.max(0.4, out.energyCostMul);
  return out;
}

// ---------------------------------------------------------------------------
// 4. Breakable Crates, Pickups & Loot Tables (d32)
// ---------------------------------------------------------------------------

/** Packed crate/prop stride: [id, kindIdx, x, y, hpPct(0..100)] (matches BANSUNG_PROP_FIELDS in ./types). */
export const BANSUNG_CRATE_FIELDS = 5;

export const BANSUNG_CRATE_KINDS = ['clay_pot', 'wood_crate', 'iron_crate'] as const;
export type CrateKind = (typeof BANSUNG_CRATE_KINDS)[number];

export interface CrateDef {
  kindIdx: number;
  kind: CrateKind;
  propKind: BansungPropKind;
  name: string;
  vnName: string;
  hp: number;
  armorType: BansungArmorType;
  halfW: number;
  halfH: number;
  minDrops: number;
  maxDrops: number;
  table: 'pot' | 'common' | 'rare';
  spriteByBiome: Record<BansungBiome, string>;
  anim: BansungEnemyAnimMeta;
}

export const BANSUNG_CRATES: Record<CrateKind, CrateDef> = {
  clay_pot: {
    kindIdx: 0,
    kind: 'clay_pot',
    propKind: 'pot',
    name: 'Clay Pot',
    vnName: 'Chum Gốm',
    hp: 15,
    armorType: 'light',
    halfW: 11,
    halfH: 10,
    minDrops: 1,
    maxDrops: 1,
    table: 'pot',
    spriteByBiome: {
      desert: 'desert_pot',
      crypt: 'crypt_urn',
      cyber: 'cyber_canister',
    },
    anim: [3, 24, 28, -12, -24],
  },
  wood_crate: {
    kindIdx: 1,
    kind: 'wood_crate',
    propKind: 'crate',
    name: 'Wood Crate',
    vnName: 'Thùng Gỗ',
    hp: 30,
    armorType: 'light',
    halfW: 16,
    halfH: 14,
    minDrops: 1,
    maxDrops: 2,
    table: 'common',
    spriteByBiome: {
      desert: 'wood_crate',
      crypt: 'crypt_crate',
      cyber: 'cyber_crate',
    },
    anim: [3, 32, 36, -16, -32],
  },
  iron_crate: {
    kindIdx: 2,
    kind: 'iron_crate',
    propKind: 'crate',
    name: 'Iron Supply Crate',
    vnName: 'Rương Sắt Tiếp Tế',
    hp: 75,
    armorType: 'armored',
    halfW: 18,
    halfH: 15,
    minDrops: 2,
    maxDrops: 3,
    table: 'rare',
    spriteByBiome: {
      desert: 'iron_crate',
      crypt: 'crypt_iron_crate',
      cyber: 'cyber_vault_crate',
    },
    anim: [3, 36, 40, -18, -36],
  },
};

export const BANSUNG_PICKUP_KINDS = [
  'hp_orb',
  'hp_pack',
  'energy_orb',
  'energy_cell',
  'armor_plate',
  'coin',
  'gem_coin',
  'weapon_pedestal',
  'xp_orb_s',
  'xp_orb_m',
  'xp_orb_l',
] as const;

export type PickupKind = (typeof BANSUNG_PICKUP_KINDS)[number];
export type PickupNeedsFilter = 'hp' | 'energy' | 'armor' | 'always' | 'interact';

export interface PickupDef {
  kindIdx: number;
  kind: PickupKind;
  /** Coarse protocol category (`./types`) */
  netKind: BansungPickupKind;
  name: string;
  vnName: string;
  amount: number;
  magnetized: boolean;
  needsFilter: PickupNeedsFilter;
  /** Fraction of coin value shared with living co-op teammates */
  sharedCoopRatio: number;
  ttlS: number;
  spriteKey: string;
  sfxKey: string;
  anim: BansungEnemyAnimMeta;
}

export const BANSUNG_PICKUPS: Record<PickupKind, PickupDef> = {
  hp_orb: {
    kindIdx: 0,
    kind: 'hp_orb',
    netKind: 'hp',
    name: 'HP Orb',
    vnName: 'Ngọc Sinh Lực',
    amount: 20,
    magnetized: true,
    needsFilter: 'hp',
    sharedCoopRatio: 0,
    ttlS: 22,
    spriteKey: 'pk_hp_orb',
    sfxKey: 'sfx_pickup_hp',
    anim: [4, 16, 16, -8, -14, 8],
  },
  hp_pack: {
    kindIdx: 1,
    kind: 'hp_pack',
    netKind: 'hp',
    name: 'Med Pack',
    vnName: 'Hộp Cứu Thương',
    amount: 40,
    magnetized: true,
    needsFilter: 'hp',
    sharedCoopRatio: 0,
    ttlS: 22,
    spriteKey: 'pk_hp_pack',
    sfxKey: 'sfx_pickup_hp',
    anim: [4, 16, 16, -8, -14, 8],
  },
  energy_orb: {
    kindIdx: 2,
    kind: 'energy_orb',
    netKind: 'energy',
    name: 'Energy Orb',
    vnName: 'Ngọc Năng Lượng',
    amount: 10,
    magnetized: true,
    needsFilter: 'energy',
    sharedCoopRatio: 0,
    ttlS: 22,
    spriteKey: 'pk_energy_orb',
    sfxKey: 'sfx_pickup_energy',
    anim: [4, 16, 16, -8, -14, 8],
  },
  energy_cell: {
    kindIdx: 3,
    kind: 'energy_cell',
    netKind: 'energy',
    name: 'Energy Cell',
    vnName: 'Pin Năng Lượng Lớn',
    amount: 30,
    magnetized: true,
    needsFilter: 'energy',
    sharedCoopRatio: 0,
    ttlS: 22,
    spriteKey: 'pk_energy_cell',
    sfxKey: 'sfx_pickup_energy',
    anim: [4, 16, 16, -8, -14, 8],
  },
  armor_plate: {
    kindIdx: 4,
    kind: 'armor_plate',
    netKind: 'armor',
    name: 'Aegis Shield (30s)',
    vnName: 'Khiên Bảo Hộ 30s',
    amount: 30,
    magnetized: true,
    needsFilter: 'armor',
    sharedCoopRatio: 0,
    ttlS: 22,
    spriteKey: 'pk_armor_plate',
    sfxKey: 'sfx_pickup_armor',
    anim: [4, 16, 16, -8, -14, 10],
  },
  coin: {
    kindIdx: 5,
    kind: 'coin',
    netKind: 'coin',
    name: 'Gold Coin',
    vnName: 'Xu Vàng',
    amount: 1,
    magnetized: true,
    needsFilter: 'always',
    sharedCoopRatio: 0.5,
    ttlS: 22,
    spriteKey: 'pk_coin',
    sfxKey: 'sfx_pickup_coin',
    anim: [6, 16, 16, -8, -14, 10],
  },
  gem_coin: {
    kindIdx: 6,
    kind: 'gem_coin',
    netKind: 'coin',
    name: 'Gem Coin',
    vnName: 'Ngọc Bội Vàng',
    amount: 5,
    magnetized: true,
    needsFilter: 'always',
    sharedCoopRatio: 0.5,
    ttlS: 22,
    spriteKey: 'pk_gem_coin',
    sfxKey: 'sfx_pickup_coin',
    anim: [6, 16, 16, -8, -14, 10],
  },
  weapon_pedestal: {
    kindIdx: 7,
    kind: 'weapon_pedestal',
    netKind: 'weapon',
    name: 'Weapon Pedestal',
    vnName: 'Bệ Vũ Khí',
    amount: 1,
    magnetized: false,
    needsFilter: 'interact',
    sharedCoopRatio: 0,
    ttlS: 45,
    spriteKey: 'prop_pedestal',
    sfxKey: 'sfx_pedestal_swap',
    anim: [2, 32, 36, -16, -30, 4],
  },
  xp_orb_s: {
    kindIdx: 8,
    kind: 'xp_orb_s',
    netKind: 'xp',
    name: 'XP Shard',
    vnName: 'Mảnh Kinh Nghiệm',
    amount: 14,
    magnetized: true,
    needsFilter: 'always',
    sharedCoopRatio: 0.4,
    ttlS: 35,
    spriteKey: 'pk_xp_orb',
    sfxKey: 'sfx_pickup_coin',
    anim: [4, 16, 16, -8, -14, 10],
  },
  xp_orb_m: {
    kindIdx: 9,
    kind: 'xp_orb_m',
    netKind: 'xp',
    name: 'XP Crystal',
    vnName: 'Tinh Thể Kinh Nghiệm',
    amount: 40,
    magnetized: true,
    needsFilter: 'always',
    sharedCoopRatio: 0.4,
    ttlS: 35,
    spriteKey: 'pk_xp_orb',
    sfxKey: 'sfx_pickup_coin',
    anim: [4, 16, 16, -8, -14, 10],
  },
  xp_orb_l: {
    kindIdx: 10,
    kind: 'xp_orb_l',
    netKind: 'xp',
    name: 'XP Core',
    vnName: 'Lõi Kinh Nghiệm',
    amount: 145,
    magnetized: true,
    needsFilter: 'always',
    sharedCoopRatio: 0.4,
    ttlS: 35,
    spriteKey: 'pk_xp_orb',
    sfxKey: 'sfx_pickup_coin',
    anim: [4, 16, 16, -8, -14, 12],
  },
};

export const BANSUNG_PICKUP_CONSTS = {
  R_COLLECT: 20,
  R_MAGNET: 110,
  PET_MAGNET_BONUS: 56,
  R_INTERACT: 48,
  MAGNET_ACCEL: 1150,
  MAGNET_MAX_SPEED: 480,
  TTL_ORB_S: 28,
  TTL_BLINK_S: 5,
  TTL_PEDESTAL_S: 50,
  MAX_PICKUPS: 96,
  MERGE_RADIUS: 48,
  MAX_STACK: 8,
  PEDESTAL_SWAP_CD_S: 0.35,
  PERK_DRAFT_S: 12,
  WAVE_CRATE_RESPAWN_CAP: 6,
} as const;

export const BANSUNG_LOOT_TABLES = {
  pot: {
    none: 18,
    energy_orb: 37,
    coin: 22,
    xp_orb_s: 12,
    hp_orb: 9,
    armor_plate: 2,
  },
  common: {
    none: 4,
    coin: 30,
    energy_orb: 26,
    xp_orb_s: 12,
    hp_orb: 13,
    armor_plate: 3,
    weapon_pedestal: 12,
  },
  rare: {
    coin: 20,
    energy_cell: 18,
    hp_pack: 16,
    armor_plate: 8,
    xp_orb_m: 10,
    weapon_pedestal: 28,
  },
  mob_kill: {
    dropChance: 0.36,
    weights: {
      energy_orb: 37,
      coin: 31,
      xp_orb_s: 16,
      hp_orb: 12,
      armor_plate: 2,
      weapon_pedestal: 2,
    },
  },
  elite_kill: {
    dropChance: 0.92,
    weights: {
      coin: 17,
      gem_coin: 17,
      energy_cell: 21,
      hp_orb: 16,
      xp_orb_m: 14,
      weapon_pedestal: 15,
    },
  },
  boss_kill: {
    orbBurstCount: 16,
    guaranteedPedestalWaves: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const,
  },
} as const;

export const BANSUNG_PEDESTAL_TIER_WEIGHTS = {
  waves1to3: { common: 25, rare: 42, epic: 23, legendary: 10 },
  waves4to7: { common: 10, rare: 34, epic: 36, legendary: 20 },
  waves8plus: { common: 0, rare: 20, epic: 42, legendary: 38 },
} as const;
