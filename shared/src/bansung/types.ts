/**
 * Bắn Súng Co-op (Soul & Steel) – shared constants, canonical IDs, quantized
 * 30Hz snapshot/command protocol, room view, post-game scoreboard, and registry.
 */

import type {
  BansungEmpPylon,
  BansungLaserLane,
  BansungWeakPointView,
} from './enemies';
import type { BansungPetKind, BansungPetNetTuple, BansungPetStateId } from './heroes';

// ============================================================================
// 1. Core Simulation & Protocol Constants
// ============================================================================

export const BANSUNG_MODE_ID = 'bansung' as const;
export const BANSUNG_STATIC_ROOT = '/database-ban-sung' as const;

export const BANSUNG_EVT_FRAME = 'bansung:frame' as const;
export const BANSUNG_EVT_CMD = 'bansung:cmd' as const;
export const BANSUNG_EVT_HERO = 'bansung:hero' as const;
export const BANSUNG_EVT_CONFIG = 'bansung:config' as const;

export const BANSUNG_HERO_STAT_SCALE = 10;

export const BANSUNG_TICK_HZ = 30;
/** Nominal integer ms per tick (33ms); use BANSUNG_TICK_EXACT_MS for drift-free clock sync. */
export const BANSUNG_TICK_MS = Math.round(1000 / BANSUNG_TICK_HZ);
export const BANSUNG_TICK_EXACT_MS = 1000 / BANSUNG_TICK_HZ;

export const BANSUNG_MAX_PLAYERS = 10;
export const BANSUNG_LOBBY_MAX_PLAYERS = 4;
export const BANSUNG_MAX_BOTS = 4;

export const BANSUNG_ARENA_W = 6336;
export const BANSUNG_ARENA_H = 4032;

/** 12-bit quantized aim resolution (~0.088 deg; ~1px error at 700px). */
export const BANSUNG_AIM_STEPS = 4096;

/** Command rate-limit token bucket: burst 45, refill 35/s. */
export const BANSUNG_CMD_BURST = 45;
export const BANSUNG_CMD_REFILL = 35;

// ============================================================================
// 2. Canonical ID Tables & Union Types
// ============================================================================

export const BANSUNG_HERO_IDS = ['mascot', 'ranger', 'pyro', 'knight'] as const;
export type BansungHeroId = (typeof BANSUNG_HERO_IDS)[number];

export const BANSUNG_BIOMES = ['desert', 'crypt', 'cyber'] as const;
export type BansungBiome = (typeof BANSUNG_BIOMES)[number];

export const BANSUNG_DIFFICULTIES = ['normal', 'hard', 'hell'] as const;
export type BansungDifficulty = (typeof BANSUNG_DIFFICULTIES)[number];

export const BANSUNG_BOT_LEVELS = ['easy', 'normal', 'hard'] as const;
export type BansungBotLevel = (typeof BANSUNG_BOT_LEVELS)[number];

export const BANSUNG_REVIVE_MODES = ['coop', 'circle', 'wave_only', 'hardcore'] as const;
export type BansungReviveMode = (typeof BANSUNG_REVIVE_MODES)[number];

export const BANSUNG_GAME_MODES = ['survival', 'waves'] as const;
export type BansungGameMode = (typeof BANSUNG_GAME_MODES)[number];

export const BANSUNG_WEAPON_IDS = [
  'pistol',
  'rifle',
  'smg',
  'shotgun',
  'sniper_rifle',
  'grenade_launcher',
  'stun_launcher',
  'bazooka',
  'mine_gun',
  'plasma_rifle',
  'railgun',
  'laser_cannon',
  'electric_gun',
  'lightning_staff',
  'arcane_book',
  'crescent_blade',
  'reaper_scythe',
  'shock_baton',
  'dual_pistols',
  'minigun',
  'saw_launcher',
  'flamethrower',
  'cryo_cannon',
  'gravity_gun',
  'plasma_shotgun',
  'twin_smg',
  'ion_beam',
  'cluster_rpg',
  'tesla_coil',
  'void_cannon',
  'blizzard_carbine',
  'ricochet_disc',
  'phantom_bow',
  'magma_spitter',
  'chronos_rifle',
  'orbital_cannon',
] as const;
export type BansungWeaponId = (typeof BANSUNG_WEAPON_IDS)[number];

export const BANSUNG_GADGET_IDS = ['stun_bomb', 'cluster_bomb', 'auto_turret', 'heal_drone'] as const;
export type BansungGadgetId = (typeof BANSUNG_GADGET_IDS)[number];

export const BANSUNG_ENEMY_IDS = [
  'scarab',
  'skirmisher',
  'bomb_goblin',
  'cactus_brute',
  'cactus_spitter',
  'laser_sniper',
  'pyro_shaman',
  'thunder_mage',
  'boss_arsenal',
  'boss_beholder',
  'boss_colossus',
  'boss_overlord',
  'iron_drone',
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
export type BansungEnemyId = (typeof BANSUNG_ENEMY_IDS)[number];

export const BANSUNG_PROP_IDS = [
  'crate',
  'pot',
  'barrel',
  'pillar',
  'cactus',
  'rock',
  'turret',
  'drone',
  'mine',
] as const;
export type BansungPropKind = (typeof BANSUNG_PROP_IDS)[number];

export const BANSUNG_PICKUP_IDS = ['hp', 'energy', 'armor', 'coin', 'weapon', 'ammo', 'xp'] as const;
export type BansungPickupKind = (typeof BANSUNG_PICKUP_IDS)[number];

/** Extensible registry key for modular upgrades/perks (d32/d46). */
export type BansungPerkId = string;

/** 0:idle 1:run 2:atk 3:dash 4:stun 5:downed 6:dead */
export type BansungUnitState = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const BANSUNG_STATE_IDLE: BansungUnitState = 0;
export const BANSUNG_STATE_RUN: BansungUnitState = 1;
export const BANSUNG_STATE_ATK: BansungUnitState = 2;
export const BANSUNG_STATE_DASH: BansungUnitState = 3;
export const BANSUNG_STATE_STUN: BansungUnitState = 4;
export const BANSUNG_STATE_DOWNED: BansungUnitState = 5;
export const BANSUNG_STATE_DEAD: BansungUnitState = 6;

function buildIndexMap<T extends string>(ids: readonly T[]): Readonly<Record<T, number>> {
  const out = {} as Record<T, number>;
  for (let i = 0; i < ids.length; i++) {
    out[ids[i]] = i;
  }
  return Object.freeze(out);
}

export const BANSUNG_HERO_INDEX = buildIndexMap(BANSUNG_HERO_IDS);
export const BANSUNG_WEAPON_INDEX = buildIndexMap(BANSUNG_WEAPON_IDS);
export const BANSUNG_GADGET_INDEX = buildIndexMap(BANSUNG_GADGET_IDS);
export const BANSUNG_ENEMY_INDEX = buildIndexMap(BANSUNG_ENEMY_IDS);
export const BANSUNG_PROP_INDEX = buildIndexMap(BANSUNG_PROP_IDS);
export const BANSUNG_PICKUP_INDEX = buildIndexMap(BANSUNG_PICKUP_IDS);

// ============================================================================
// 3. Lobby Config & Normalization
// ============================================================================

export interface BansungConfig {
  biome: BansungBiome;
  difficulty: BansungDifficulty;
  /** 0..min(BANSUNG_MAX_BOTS, BANSUNG_MAX_PLAYERS - humans) */
  bots: number;
  botLevel: BansungBotLevel;
  reviveMode: BansungReviveMode;
  endless?: boolean;
  gameMode?: BansungGameMode;
}

export const DEFAULT_BANSUNG_CONFIG: BansungConfig = {
  biome: 'desert',
  difficulty: 'normal',
  bots: 1,
  botLevel: 'normal',
  reviveMode: 'coop',
};

function pickEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Validates and normalizes untrusted lobby config input, clamping `bots` to
 * `[0, min(BANSUNG_MAX_BOTS, BANSUNG_MAX_PLAYERS - humans)]`.
 */
export function normalizeBansungConfig(raw: unknown, humans = 1): BansungConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof BansungConfig, unknown>>;
  const safeHumans = Math.max(0, Math.floor(Number(humans) || 0));
  const maxBots = Math.min(BANSUNG_MAX_BOTS, Math.max(0, BANSUNG_MAX_PLAYERS - safeHumans));

  const rawBots =
    r.bots === undefined || r.bots === null || r.bots === ''
      ? DEFAULT_BANSUNG_CONFIG.bots
      : Number(r.bots);
  const parsedBots = Number.isFinite(rawBots) ? Math.floor(rawBots) : DEFAULT_BANSUNG_CONFIG.bots;
  const bots = Math.max(0, Math.min(maxBots, parsedBots));

  const config: BansungConfig = {
    biome: pickEnum(r.biome, BANSUNG_BIOMES, DEFAULT_BANSUNG_CONFIG.biome),
    difficulty: pickEnum(r.difficulty, BANSUNG_DIFFICULTIES, DEFAULT_BANSUNG_CONFIG.difficulty),
    bots,
    botLevel: pickEnum(r.botLevel, BANSUNG_BOT_LEVELS, DEFAULT_BANSUNG_CONFIG.botLevel),
    reviveMode: pickEnum(r.reviveMode, BANSUNG_REVIVE_MODES, DEFAULT_BANSUNG_CONFIG.reviveMode),
  };

  if (r.endless !== undefined) {
    config.endless = Boolean(r.endless);
  }
  if (r.gameMode !== undefined) {
    config.gameMode = pickEnum(r.gameMode, BANSUNG_GAME_MODES, 'survival');
  }
  return config;
}

export function resolveBansungGameMode(cfg?: Partial<BansungConfig>): BansungGameMode {
  return pickEnum(cfg?.gameMode, BANSUNG_GAME_MODES, 'survival');
}

export function normalizeBansungHero(raw: unknown): BansungHeroId {
  return pickEnum(raw, BANSUNG_HERO_IDS, BANSUNG_HERO_IDS[0]);
}

// ============================================================================
// 4. Room View & Post-Game Scoreboard
// ============================================================================

export interface BansungPlayerInfo {
  idx: number;
  id: string;
  name: string;
  avatar?: string;
  hero: BansungHeroId;
  color: string;
  bot: boolean;
  alive: boolean;
}

export interface BansungPlayerResult {
  idx: number;
  id: string;
  kills: number;
  damage: number;
  stuns: number;
  revives: number;
  coinPayout: number;
}

export type BansungBadgeId = 'mvp' | 'slayer' | 'medic' | 'stunner' | 'boss_breaker';

export const BANSUNG_MVP_WEIGHTS = {
  kill: 10,
  elite: 35,
  damage: 0.15,
  bossDamage: 0.10,
  stun: 25,
  revive: 120,
  death: -40,
} as const;

export interface BansungPlayerStats {
  /** playerId or "bot:bs<n>" */
  id: string;
  name: string;
  /** HERO_REGISTRY key */
  heroId: BansungHeroId | (string & {});
  bot: boolean;
  left?: boolean;
  kills: number;
  elitesKilled: number;
  damageDealt: number;
  bossDamage: number;
  damageTaken: number;
  stunsInflicted: number;
  revives: number;
  deaths: number;
  score: number;
  badges: BansungBadgeId[];
  /** Net xu delta (payout - bet) when bet > 0 */
  coinDelta: number;
}

export interface BansungResult {
  victory: boolean;
  reason: string;
  wavesCleared: number;
  totalWaves: number;
  /** Optional wave alias matching d02 summary field */
  wave?: number;
  /** Authoritative mode for settlement formatting (`survival` vs `waves`) */
  mode?: BansungGameMode;
  /** 0-based repeating survival cycle reached */
  cycle?: number;
  /** Final survival stage ID reached */
  stageId?: BansungSurvivalStageId;
  /** Peak or final survival level reached */
  level?: number;
  durationMs: number;
  /** Highest-scoring non-left human (fallback: top scorer) */
  mvpId?: string;
  /** Sorted by score desc */
  players: BansungPlayerStats[];
  /** Optional compact stats alias matching d02 */
  stats?: BansungPlayerResult[];
}

export interface BansungRoomView {
  config: BansungConfig;
  /** Lobby hero picks keyed by playerId */
  heroes?: Record<string, BansungHeroId>;
  mapW?: number;
  mapH?: number;
  arenaSeed?: number;
  /** Static obstacles sent once on start: stride 5 [x, y, w, h, propKindIdx] */
  obstacles?: number[];
  players?: BansungPlayerInfo[];
  /** Undefined for spectators */
  myIdx?: number;
  startedAt?: number;
  result?: BansungResult;
}

// ============================================================================
// 5. Quantization, Packed Strides, Bitflags & Delta FX Constants
// ============================================================================

const TAU = Math.PI * 2;
const AIM_MASK = BANSUNG_AIM_STEPS - 1;

/** Quantizes radians to a 12-bit integer in `[0, 4095]`. */
export function quantizeAim(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  const wrapped = ((rad % TAU) + TAU) % TAU;
  return Math.round(wrapped * (BANSUNG_AIM_STEPS / TAU)) & AIM_MASK;
}

/** Dequantizes a 12-bit aim integer `[0, 4095]` back into radians `[0, 2π)`. */
export function dequantizeAim(q: number): number {
  if (!Number.isFinite(q)) return 0;
  return ((q | 0) & AIM_MASK) * (TAU / BANSUNG_AIM_STEPS);
}

/** [x, y, w, h, propKindIdx] */
export const BANSUNG_OBSTACLE_FIELDS = 5;
/** [idx, x, y, aimQ, hp, shield, state, flags, heroIdx, weaponIdx, revivePct, weaponTier] */
export const BANSUNG_PLAYER_FIELDS = 12;
/** [id, enemyIdx, x, y, hpPct, aimQ, state, flags] */
export const BANSUNG_ENEMY_FIELDS = 8;
/** [id, shotKind, x, y, aimQ, flags] */
export const BANSUNG_BULLET_FIELDS = 6;
/** [id, propKindIdx, x, y, hpPct] */
export const BANSUNG_PROP_FIELDS = 5;
/** [id, pickupKindIdx, x, y, subId] */
export const BANSUNG_PICKUP_FIELDS = 5;
/** [fxType, a, b, c, d, e] */
export const BANSUNG_FX_FIELDS = 6;

// Player flags (p[+7])
export const BANSUNG_PFLAG_LEFT = 1;
export const BANSUNG_PFLAG_FIRING = 2;
export const BANSUNG_PFLAG_DASHING = 4;
export const BANSUNG_PFLAG_HIT_FLASH = 8;
export const BANSUNG_PFLAG_INVULN = 16;
export const BANSUNG_PFLAG_BOT = 32;
export const BANSUNG_PFLAG_RELOADING = 64;
export const BANSUNG_PFLAG_DISCONNECTED = 128;
export const BANSUNG_PFLAG_SHIELD_BARRIER = 256;

/** Duration (ms) of the pickup Aegis full-protection shield (`armor_plate`). */
export const BANSUNG_SHIELD_BARRIER_MS = 30_000;

// Enemy flags (e[+7])
export const BANSUNG_EFLAG_LEFT = 1;
export const BANSUNG_EFLAG_ELITE = 2;
export const BANSUNG_EFLAG_ARMORED = 4;
export const BANSUNG_EFLAG_STUNNED = 8;
export const BANSUNG_EFLAG_BURNING = 16;
export const BANSUNG_EFLAG_HIT_FLASH = 32;
export const BANSUNG_EFLAG_TELEGRAPH = 64;
export const BANSUNG_EFLAG_SHIELDED = 128;
export const BANSUNG_EFLAG_EVOLVED = 256;
/** Upper bit packing on enemy tuple flags e[+7] for Mob Level (1..31 -> +1 level every 2/4/6/8/10/...). */
export const BANSUNG_EFLAG_LEVEL_SHIFT = 10;
export const BANSUNG_EFLAG_LEVEL_MASK = 0x1f;

export function encodeEnemyMobLevelFlags(flags: number, level: number): number {
  const clampedLv = Math.max(0, Math.min(BANSUNG_EFLAG_LEVEL_MASK, Math.floor(level) || 0));
  return (flags & 0x3ff) | (clampedLv << BANSUNG_EFLAG_LEVEL_SHIFT);
}

export function decodeEnemyMobLevelFromFlags(flags: number): number {
  const lv = (flags >>> BANSUNG_EFLAG_LEVEL_SHIFT) & BANSUNG_EFLAG_LEVEL_MASK;
  return lv > 0 ? lv : 1;
}

// Bullet flags (b[+5])
export const BANSUNG_BFLAG_FROM_ENEMY = 1;
export const BANSUNG_BFLAG_PIERCE = 2;
export const BANSUNG_BFLAG_EXPLOSIVE = 4;
export const BANSUNG_BFLAG_CRIT = 8;
export const BANSUNG_BFLAG_ENERGY = 16;
export const BANSUNG_BFLAG_HOMING = 32;

// Uniform 6-int delta FX types
/** [0, ownerId, weaponIdx, x, y, aimQ] */
export const FX_MUZZLE = 0;
/** [1, x, y, amount, dmgFlags, targetId] */
export const FX_DMG = 1;
/** [2, blastKind, x, y, radius, ownerIdx] */
export const FX_BLAST = 2;
/** [3, impactKind, x, y, aimQ, mat] */
export const FX_IMPACT = 3;
/** [4, kindIdx, x, y, tier, killerIdx] */
export const FX_DEATH = 4;
/** [5, playerIdx, statusKind, val, x, y] */
export const FX_STATUS = 5;
/** [6, playerIdx, pingKind, x, y, 0] */
export const FX_PING = 6;
/** [7, x1, y1, x2, y2, beamKind] */
export const FX_BEAM = 7;

export type BansungFxType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// FX_DMG dmgFlags
export const BANSUNG_DMG_CRIT = 1;
export const BANSUNG_DMG_ARMOR = 2;
export const BANSUNG_DMG_HEAL = 4;
export const BANSUNG_DMG_STUN = 8;
export const BANSUNG_DMG_BURN = 16;
export const BANSUNG_DMG_SHOCK = 32;

// FX_STATUS statusKind (distinct non-colliding codes; keep BANSUNG_STATUS_* aliases)
export const BANSUNG_FX_STATUS_DASH = 0;
export const BANSUNG_FX_STATUS_RELOAD_START = 1;
export const BANSUNG_FX_STATUS_RELOAD_PERFECT = 2;
export const BANSUNG_FX_STATUS_DOWNED = 3;
export const BANSUNG_FX_STATUS_REVIVED = 4;
export const BANSUNG_FX_STATUS_PERK = 5;
export const BANSUNG_FX_STATUS_CRATE = 6;
export const BANSUNG_FX_STATUS_LEVELUP = 7;
export const BANSUNG_FX_STATUS_GACHA = 8;
export const BANSUNG_FX_STATUS_RESTOCK = 9;
export const BANSUNG_FX_STATUS_BOSS_OVERHEAT = 10;
export const BANSUNG_FX_STATUS_BOSS_SHIELD_UP = 11;
export const BANSUNG_FX_STATUS_BOSS_MATRIX = 12;
export const BANSUNG_FX_STATUS_BOSS_PHASE = 13;
export const BANSUNG_FX_STATUS_HERO_SKILL = 14;
export const BANSUNG_FX_STATUS_BOSS_PART_BREAK = 15;
export const BANSUNG_FX_STATUS_FROST_NOVA = 16;
export const BANSUNG_FX_STATUS_ABYSS_VORTEX = 17;

export const BANSUNG_STATUS_DASH = BANSUNG_FX_STATUS_DASH;
export const BANSUNG_STATUS_RELOAD_START = BANSUNG_FX_STATUS_RELOAD_START;
export const BANSUNG_STATUS_RELOAD_PERFECT = BANSUNG_FX_STATUS_RELOAD_PERFECT;
export const BANSUNG_STATUS_DOWNED = BANSUNG_FX_STATUS_DOWNED;
export const BANSUNG_STATUS_REVIVED = BANSUNG_FX_STATUS_REVIVED;
export const BANSUNG_STATUS_PERK = BANSUNG_FX_STATUS_PERK;
export const BANSUNG_STATUS_CRATE = BANSUNG_FX_STATUS_CRATE;
export const BANSUNG_STATUS_LEVELUP = BANSUNG_FX_STATUS_LEVELUP;
export const BANSUNG_STATUS_GACHA = BANSUNG_FX_STATUS_GACHA;
export const BANSUNG_STATUS_RESTOCK = BANSUNG_FX_STATUS_RESTOCK;
export const BANSUNG_STATUS_BOSS_OVERHEAT = BANSUNG_FX_STATUS_BOSS_OVERHEAT;
export const BANSUNG_STATUS_BOSS_SHIELD_UP = BANSUNG_FX_STATUS_BOSS_SHIELD_UP;
export const BANSUNG_STATUS_BOSS_MATRIX = BANSUNG_FX_STATUS_BOSS_MATRIX;
export const BANSUNG_STATUS_BOSS_PHASE = BANSUNG_FX_STATUS_BOSS_PHASE;
export const BANSUNG_STATUS_HERO_SKILL = BANSUNG_FX_STATUS_HERO_SKILL;
export const BANSUNG_STATUS_BOSS_PART_BREAK = BANSUNG_FX_STATUS_BOSS_PART_BREAK;
export const BANSUNG_STATUS_FROST_NOVA = BANSUNG_FX_STATUS_FROST_NOVA;
export const BANSUNG_STATUS_ABYSS_VORTEX = BANSUNG_FX_STATUS_ABYSS_VORTEX;

// FX_BLAST blastKind (non-colliding codes across weapons, gadgets, traps, mobs & bosses)
export const BANSUNG_FX_BLAST_HE = 0;
export const BANSUNG_FX_BLAST_STUN = 1;
export const BANSUNG_FX_BLAST_CLUSTER = 2;
export const BANSUNG_FX_BLAST_STEAM = 3;
export const BANSUNG_FX_BLAST_FIREBALL = 4;
export const BANSUNG_FX_BLAST_DRONE_PULSE = 5;
export const BANSUNG_FX_BLAST_MINE = 6;
export const BANSUNG_FX_BLAST_TURRET_THUNDER = 7;
export const BANSUNG_FX_BLAST_TURRET_EXPIRE = 8;
export const BANSUNG_FX_BLAST_BOSS_SHOCKWAVE = 9;
export const BANSUNG_FX_BLAST_BOSS_MORTAR = 10;
export const BANSUNG_FX_BLAST_VOLATILE = 11;
export const BANSUNG_FX_BLAST_THUNDER_STORM = 12;
export const BANSUNG_FX_BLAST_DESTROYER_METEOR = 13;
export const BANSUNG_FX_BLAST_HERO_NOVA = 14;
export const BANSUNG_FX_BLAST_FROST_SHATTER = 15;
export const BANSUNG_FX_BLAST_ABYSS_NOVA = 16;
export const BANSUNG_FX_BLAST_ORBITAL = 17;
export const BANSUNG_FX_BLAST_STORM_YELLOW = 18;

// FX_IMPACT impactKind
export const BANSUNG_FX_IMPACT_WALL = 0;
export const BANSUNG_FX_IMPACT_FLESH = 1;
export const BANSUNG_FX_IMPACT_SLASH = 2;
export const BANSUNG_FX_IMPACT_SLICE = 3;
export const BANSUNG_FX_IMPACT_SPARK = 4;

// FX_BEAM beamKind
export const BANSUNG_FX_BEAM_RAIL = 0;
export const BANSUNG_FX_BEAM_CHAIN = 1;
export const BANSUNG_FX_BEAM_SHOCK = 2;
export const BANSUNG_FX_BEAM_BOSS_EYE = 3;
export const BANSUNG_FX_BEAM_BOSS_LASER = 4;
export const BANSUNG_FX_BEAM_LASER_MAP = 5;
export const BANSUNG_FX_BEAM_YELLOW_LIGHTNING = 6;

// FX_PING pingKind
export const BANSUNG_PING_HELP = 0;
export const BANSUNG_PING_ENEMY = 1;
export const BANSUNG_PING_LOOT = 2;
export const BANSUNG_PING_REVIVE = 3;
export type BansungPingKind = 0 | 1 | 2 | 3;

// ============================================================================
// 6. Realtime Snapshot (`BansungFrame`) & Client Commands (`BansungCommand`)
// ============================================================================

export type BansungWavePhase = 'combat' | 'intermission' | 'perk_pick' | 'boss';

export const BANSUNG_SURVIVAL_STAGE_IDS = [
  'swarm_light',
  'heavy_brute',
  'boss_hunt',
  'evolved_horde',
] as const;
export type BansungSurvivalStageId = (typeof BANSUNG_SURVIVAL_STAGE_IDS)[number];

export type BansungGachaRarity =
  | 'common'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'celestial'
  | 'mythic'
  | 'prismatic';

export type BansungGachaCategory =
  | 'weapon_upgrade'
  | 'skill_damage'
  | 'skill_hp'
  | 'skill_firerate'
  | 'skill_multishot'
  | 'skill_crit'
  | 'skill_mobility'
  | 'skill_stamina'
  | 'skill_shield'
  | 'skill_lightning_orb'
  | 'skill_fire_orb'
  | 'skill_spirit_sword'
  | 'skill_magnet';

export interface BansungGachaCard {
  id: string;
  category: BansungGachaCategory;
  rarity: BansungGachaRarity;
  title: string;
  vnTitle: string;
  desc: string;
  vnDesc: string;
  weaponId?: BansungWeaponId;
  slotIdx?: number;
  fromTier?: number;
  toTier?: number;
  icon: string;
  badge?: string;
  value?: number;
  secondaryValue?: number;
  multLabel?: '^' | '^^' | 'x1' | 'x1.5' | 'x2' | 'x3' | 'x4' | 'x5' | '777' | '+1' | '+2' | '+3';
  dmgText?: string;
}

export interface BansungSurvivalClock {
  mode: BansungGameMode;
  elapsedMs: number;
  cycle: number;
  cycleSec: number;
  stageIdx: 0 | 1 | 2 | 3;
  stageId: BansungSurvivalStageId;
  stageRemS: number;
}

export type BansungTelegraphKind = 0 | 1;
export type BansungTelegraphPhase = 0 | 1;
export type BansungTelegraphColor = 0 | 1 | 2 | 3 | 4 | 5;
export type BansungTelegraphShape = 'line' | 'circle' | 'cone' | 'ring';

/**
 * Compact wire warning telegraph supporting ALL monster projectiles, AOEs & lasers:
 * - `kind=0`: directional line / laser beam / projectile corridor `(x0,y0 -> x1,y1)` with half-width `r` (or `halfW`)
 * - `kind=1`: ground AOE circle / ring at `(x1,y1)` with radius `r` (and optional caster origin `(x0,y0)`)
 * - `shape`: optional geometry specialization (`'line' | 'circle' | 'cone' | 'ring'`)
 */
export interface BansungTelegraphWire {
  id: number;
  /** 0 = directional line/beam/trajectory, 1 = radial ground AOE/ring */
  kind: BansungTelegraphKind;
  /** 0 = tracking/charging, 1 = locked/imminent */
  phase: BansungTelegraphPhase;
  /** 0 = crimson, 1 = pyro orange, 2 = thunder cyan, 3 = toxic/acid green, 4 = violet/emp, 5 = thunder yellow */
  color: BansungTelegraphColor;
  /** 0..255 progress */
  prog: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  /** Optional explicit visual geometry hint without breaking `0 | 1` handlers */
  shape?: BansungTelegraphShape;
  /** Optional explicit half-width override for thick beams / projectile cones */
  halfW?: number;
  /** True while attack/beam is actively discharging */
  active?: boolean;
  /** Optional enemy ID emitting this telegraph for tailored trajectory FX */
  sourceKind?: BansungEnemyId;
  /** Optional short warning label rendered over the telegraph (e.g. "DANGER", "2.0s") */
  label?: string;
  /** 1 = high-lethality zone flashing explicit DANGER alert */
  danger?: 0 | 1;
}

export const BANSUNG_HAZARD_KINDS = [
  'fire_pool',
  'acid_pool',
  'shock_field',
  'void_zone',
  'storm_yellow',
  'storm_blue',
] as const;
export type BansungHazardKind = (typeof BANSUNG_HAZARD_KINDS)[number];
export const BANSUNG_HAZARD_INDEX = buildIndexMap(BANSUNG_HAZARD_KINDS);

export interface BansungHazardWire {
  id: number;
  kind: BansungHazardKind | (string & {});
  x: number;
  y: number;
  r: number;
  ttlTicks?: number;
  /** Optional quantized remaining life 0..255 */
  ttlQ?: number;
}

export interface BansungPetFrame {
  ownerId: number;
  kind?: BansungPetKind;
  tuple?: BansungPetNetTuple;
  x?: number;
  y?: number;
  state?: BansungPetStateId | number;
  left?: 0 | 1 | number;
}

export interface BansungBossPartView {
  id: string;
  idx: number;
  name: string;
  vnName: string;
  hp: number;
  maxHp: number;
  broken: boolean;
  /** World coordinates (or computed offset) for canvas rendering + hit indicators */
  x: number;
  y: number;
  radius: number;
  unlocksSkill: string;
  unlocksSkillVn: string;
}

export interface BansungBossFrame {
  id: number;
  kind: BansungEnemyId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Layered multi-bar HP count (x2, x3, ..., x6, ..., x10 for Destroyer Titan). */
  hpBars?: number;
  phase: number;
  state: BansungUnitState;
  aimQ: number;
  telegraph?: number;
  stagger?: number;
  maxStagger?: number;
  telegraphs?: BansungTelegraphWire[];
  weakPoints?: BansungWeakPointView[];
  /** Compact alias for Overlord weakPoints */
  wp?: BansungWeakPointView[];
  /** Destructible body parts (cannons, armor plates, cores) whose break stuns boss & unlocks skills */
  parts?: BansungBossPartView[];
  /** Unlocked enraged skill IDs activated after body parts break */
  unlockedSkills?: string[];
  pylons?: BansungEmpPylon[];
  laserLanes?: BansungLaserLane[];
  /** Compact alias for Overlord laserLanes */
  lanes?: BansungLaserLane[];
  /** Optional display title / subtitle / boss tier (1..4) / scale / split tier for HUD & rendering */
  title?: string;
  subtitle?: string;
  tier?: number;
  scale?: number;
  splitTier?: number;
}

export interface BansungWeaponSlot {
  id: BansungWeaponId;
  clip: number;
  maxClip: number;
  tier?: number;
  evolvedName?: string;
}

export interface BansungGadgetState {
  id: BansungGadgetId;
  cdMs: number;
  cdMaxMs: number;
  charges: number;
}

export interface BansungPrivate {
  maxHp: number;
  maxShield: number;
  energy: number;
  maxEnergy: number;
  slots: BansungWeaponSlot[];
  slotIdx: number;
  gadget: BansungGadgetState;
  dashCdMs: number;
  dashMaxMs: number;
  reloadMs: number;
  reloadTotalMs: number;
  sweetSpot?: [number, number];
  perkChoices?: BansungPerkId[];
  perks: BansungPerkId[];
  kills: number;
  damage: number;
  stuns: number;
  revives: number;
  coins: number;
  lastAckSeq: number;
  xp?: number;
  xpToNext?: number;
  level?: number;
  gachaChoices?: BansungGachaCard[];
  gachaPending?: number;
  gachaRemMs?: number;
  skillStacks?: Record<string, number>;
  weaponTiers?: number[];
  /** Dash Stamina current / max / cost */
  stamina?: number;
  maxStamina?: number;
  dashCost?: number;
  /** Shield damage-reduction % (0..1) and remaining out-of-combat regen delay (ms) */
  shieldDrPct?: number;
  shieldDelayMs?: number;
  shieldRegenTotalMs?: number;
  /** Remaining 30s Aegis full-protection barrier duration (ms), if active */
  shieldBuffMs?: number;
  /** Hero Signature Active Skill ([F] / HUD button) state */
  skillCdMs?: number;
  skillMaxMs?: number;
  skillActiveMs?: number;
  skillName?: string;
}

export interface BansungFrame {
  t: number;
  ms: number;
  w: number;
  wp: BansungWavePhase;
  rem: number;
  /** All players, stride 12 [idx, x, y, aimQ, hp, shield, state, flags, heroIdx, weaponIdx, revivePct, weaponTier] */
  p: number[];
  /** Viewport-culled enemies, stride 8 */
  e?: number[];
  /** Viewport-culled projectiles, stride 6 */
  b?: number[];
  /** Breakable/deployed props, stride 5 (omitted if unchanged unless full=true) */
  pr?: number[];
  /** Pickups, stride 5 (omitted if unchanged unless full=true) */
  pk?: number[];
  /** One-shot delta FX since last tick, stride 6 */
  fx?: number[];
  bs?: BansungBossFrame;
  /** Secondary simultaneous active bosses in multi-boss fights */
  bs2?: BansungBossFrame[];
  /** Active co-op companion pets for live client synchronization */
  pets?: BansungPetFrame[];
  /** Viewport-culled persistent ground hazards (`fire_pool`, `acid_pool`, etc.) */
  hz?: BansungHazardWire[];
  /** Viewport-culled mob/boss/siege/artillery telegraphs & projectile trajectories */
  tg?: BansungTelegraphWire[];
  /** Packed orbital & magnet stacks per player: [playerIdx, lightningOrb, fireOrb, spiritSword, magnetStacks] (stride 5) */
  orbs?: number[];
  /** Packed summoned spirit swords: [id, x, y, aimQ, stateFlag] (stride 5; stateFlag: 0=orbit_windup, 1=dash, 2=pull) */
  sw?: number[];
  me?: BansungPrivate;
  srv?: BansungSurvivalClock;
  full?: boolean;
}

export type BansungCommand =
  /** mx,my in [-100..100], aim in [0..4095] */
  | { t: 'in'; seq: number; mx: number; my: number; aim: number; fire: 0 | 1 }
  | { t: 'dash'; dx?: number; dy?: number }
  /** Hotbar slot 0..4 */
  | { t: 'slot'; idx: number }
  /** Start reload or trigger active-reload sweet-spot */
  | { t: 'reload' }
  | { t: 'gadget'; x?: number; y?: number }
  /** Hero Signature Active Skill ([F] / HUD Skill button) */
  | { t: 'skill'; x?: number; y?: number }
  /** Pick up weapon pedestal / interact */
  | { t: 'use' }
  /** Choose wave-clear perk */
  | { t: 'perk'; id: BansungPerkId }
  /** Choose survival XP level-up gacha card (0..2) */
  | { t: 'gacha'; pick: 0 | 1 | 2 }
  /** In-match coin armory shop actions */
  | {
      t: 'shop';
      op: 'buy_weapon' | 'upgrade_active' | 'supply_heal';
      weaponId?: BansungWeaponId;
      slotIdx?: number;
    }
  | { t: 'ping'; kind: BansungPingKind; x: number; y: number }
  /** Spectator follow & viewport-cull target */
  | { t: 'spec'; targetIdx: number };

// ============================================================================
// 7. Modular Registry & Extension Hooks
// ============================================================================

export interface RegistryEntry {
  readonly id: string;
  readonly numId: number;
}

/**
 * Immutable lookup registry keyed by string `id` and compact network `numId`.
 * Populated at boot and sealed via `freeze()` before matches start.
 */
export class BansungRegistry<T extends RegistryEntry> {
  readonly kind: string;
  private readonly byId = new Map<string, T>();
  private readonly byNumMap = new Map<number, T>();
  private frozen = false;

  constructor(kind: string, initial: readonly T[] = []) {
    this.kind = kind;
    for (const entry of initial) {
      this.register(entry);
    }
  }

  register(entry: T): T {
    if (this.frozen) {
      throw new Error(`[${this.kind}] Registry is frozen`);
    }
    if (this.byId.has(entry.id) || this.byNumMap.has(entry.numId)) {
      throw new Error(`[${this.kind}] Duplicate id=${entry.id} or numId=${entry.numId}`);
    }
    const frozenEntry = Object.freeze(entry) as T;
    this.byId.set(entry.id, frozenEntry);
    this.byNumMap.set(entry.numId, frozenEntry);
    return frozenEntry;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  must(id: string): T {
    const v = this.byId.get(id);
    if (!v) {
      throw new Error(`[${this.kind}] Unknown ${id}`);
    }
    return v;
  }

  byNum(numId: number): T | undefined {
    return this.byNumMap.get(numId);
  }

  list(): readonly T[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }

  freeze(): void {
    this.frozen = true;
  }
}

export type BansungEndlessScaler = (wave: number) => {
  hpMult: number;
  dmgMult: number;
  countMult: number;
  eliteChance: number;
};
