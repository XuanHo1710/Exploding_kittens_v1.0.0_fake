/**
 * Mighty Knight 2.5D Pixel (`mighty_knight`) — Shared constants, 10–15 frame budget,
 * 640×360 virtual pixel world, wire protocol, hero/skill/relic schemas & room config.
 */

export const MK_MODE_ID = 'mighty_knight' as const;
export const MK_STATIC_ROOT = '/database-mighty-knight-pixel' as const;

export const MK_EVT_FRAME = 'mk:frame' as const;
export const MK_EVT_CMD = 'mk:cmd' as const;
export const MK_EVT_CONFIG = 'mk:config' as const;
export const MK_EVT_HERO = 'mk:hero' as const;

export const MK_TICK_HZ = 30;
export const MK_TICK_MS = Math.round(1000 / MK_TICK_HZ);
export const MK_TICK_EXACT_MS = 1000 / MK_TICK_HZ;

/** Crisp 16:9 virtual pixel camera & 2.5D belt-scroller arena dimensions. */
export const MK_VIEW_W = 640;
export const MK_VIEW_H = 360;
export const MK_ARENA_W = 1280;
export const MK_ARENA_H = 360;
export const MK_LANE_TOP = 156;
export const MK_LANE_BOTTOM = 326;
export const MK_PLAYABLE_MIN_X = 32;
export const MK_PLAYABLE_MAX_X = 1248;

/** Hard sprite frame-budget gate: every character has strictly 10..15 pixel frames. */
export const MK_MIN_CHAR_FRAMES = 10;
export const MK_MAX_CHAR_FRAMES = 15;
export const MK_HERO_CELL_PX = 48;
export const MK_ENEMY_CELL_PX = 48;
export const MK_BOSS_CELL_PX = 80;
export const MK_HERO_ANCHOR_X = 24;
export const MK_HERO_ANCHOR_Y = 44;
export const MK_ENEMY_ANCHOR_X = 24;
export const MK_ENEMY_ANCHOR_Y = 44;
export const MK_BOSS_ANCHOR_X = 40;
export const MK_BOSS_ANCHOR_Y = 74;

/** Combat & party gameplay constants. */
export const MK_MAX_PLAYERS = 6;
export const MK_MAX_COM_BOTS = 3;
export const MK_MAX_PARTY_SIZE = 6;
export const MK_FURY_MAX = 100;
export const MK_PARRY_WINDOW_MS = 180;
export const MK_GUARD_DURATION_MS = 450;
export const MK_GUARD_COOLDOWN_MS = 1400;
export const MK_COMBO_RESET_MS = 900;
export const MK_REVIVE_RADIUS_PX = 44;
export const MK_REVIVE_DURATION_MS = 2500;
export const MK_RELIC_DRAFT_MS = 12000;
export const MK_WAVE_INTRO_MS = 1800;
export const MK_WAVE_CLEAR_MS = 1500;

export const MK_HERO_IDS = ['knight', 'archer', 'rogue', 'barbarian', 'mage', 'lancer'] as const;
export type MkHeroId = (typeof MK_HERO_IDS)[number];

export const MK_HERO_ACTIONS = [
  'idle',
  'walk',
  'combo1',
  'combo2',
  'combo3',
  'dash_atk',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'ultimate',
  'dash',
  'guard',
  'parry_ok',
  'hit',
  'dead',
] as const;
export type MkHeroActionId = (typeof MK_HERO_ACTIONS)[number];

export const MK_ENEMY_IDS = [
  'skull_imp',
  'goblin_raider',
  'shield_orc',
  'bone_brute',
  'tribal_shaman',
  'frost_archer',
  'bomber_imp',
  'nether_ghost',
] as const;
export type MkEnemyId = (typeof MK_ENEMY_IDS)[number];

export const MK_BOSS_IDS = [
  'boss_elder_shaman',
  'boss_war_chieftain',
  'boss_lava_golem',
  'boss_abyss_lord',
] as const;
export type MkBossId = (typeof MK_BOSS_IDS)[number];

export type MkAnyEnemyId = MkEnemyId | MkBossId;

export const MK_ENEMY_ACTIONS = [
  'idle',
  'walk',
  'windup',
  'attack',
  'slam',
  'special',
  'charge',
  'enrage',
  'hit',
  'dead',
] as const;
export type MkEnemyActionId = (typeof MK_ENEMY_ACTIONS)[number];

export type MkActionId = MkHeroActionId | MkEnemyActionId;

export const MK_BIOMES = ['grasslands', 'jungle', 'volcano', 'citadel'] as const;
export type MkBiome = (typeof MK_BIOMES)[number];

export const MK_PLAY_MODES = ['endless', 'boss_rush'] as const;
export type MkPlayMode = (typeof MK_PLAY_MODES)[number];

export const MK_DIFFICULTIES = ['normal', 'hard', 'nightmare'] as const;
export type MkDifficulty = (typeof MK_DIFFICULTIES)[number];

export const MK_STAT_KEYS = ['atk', 'hp', 'def', 'spd'] as const;
export type MkStatKey = (typeof MK_STAT_KEYS)[number];

export const MK_UPGRADE_TARGETS = [
  'atk',
  'hp',
  'def',
  'spd',
  's1',
  's2',
  's3',
  's4',
  'p1',
  'p2',
] as const;
export type MkUpgradeTarget = (typeof MK_UPGRADE_TARGETS)[number];

export const MK_RELIC_IDS = [
  'vampiric_fang',
  'chrono_crystal',
  'phantom_cloak',
  'thunder_sigil',
  'parry_emblem',
  'fury_core',
  'giant_slayer',
  'frost_brand',
  'midas_coin',
  'phoenix_feather',
  'aegis_rune',
  'combo_master',
] as const;
export type MkRelicId = (typeof MK_RELIC_IDS)[number];

export const MK_PICKUP_KINDS = ['gold', 'exp', 'potion', 'fury', 'relic_chest'] as const;
export type MkPickupKind = (typeof MK_PICKUP_KINDS)[number];

export const MK_DMG_KINDS = [
  'normal',
  'crit',
  'skill',
  'parry',
  'burn',
  'poison',
  'shock',
  'heal',
  'evade',
  'block',
] as const;
export type MkDmgKind = (typeof MK_DMG_KINDS)[number];

export const MK_VFX_IDS = [
  'slash_crescent',
  'slash_cross_x',
  'whirlwind_360',
  'holy_pillar',
  'ground_fissure',
  'fire_meteor',
  'lightning_bolt',
  'frost_nova',
  'gravity_vortex',
  'dragon_spirit',
  'phoenix_flame',
  'magic_rune_25d',
  'parry_ring',
  'aura_fury',
  'hit_spark',
  'dust_puff',
] as const;
export type MkVfxId = (typeof MK_VFX_IDS)[number];

export type MkVfxLayer = 'ground' | 'behind' | 'front' | 'screen';

export type MkZoneKind =
  | 'arrow_rain'
  | 'storm_snare'
  | 'gravity_well'
  | 'lava_pool'
  | 'decoy_clone'
  | 'boss_hazard';

export type MkProjectileKind =
  | 'arrow'
  | 'pierce_arrow'
  | 'frost_arrow'
  | 'sword_wave'
  | 'shuriken'
  | 'tomahawk'
  | 'arcane_bolt'
  | 'soul_lance'
  | 'phoenix_wave'
  | 'dragon_wave'
  | 'shaman_hex'
  | 'boss_fireball'
  | 'boss_boulder'
  | 'boss_shadow_blade';

export interface MkConfig {
  playMode: MkPlayMode;
  comBots: number;
  difficulty: MkDifficulty;
  biome: MkBiome | 'auto';
  allowSwitchCom: boolean;
}

export const DEFAULT_MK_CONFIG: MkConfig = {
  playMode: 'endless',
  comBots: 2,
  difficulty: 'normal',
  biome: 'auto',
  allowSwitchCom: true,
};

export interface MkUpgradeLevels {
  atk: number;
  hp: number;
  def: number;
  spd: number;
  /** s1 starts unlocked at 1; s2..s4 start locked at 0 (or 1 in Boss Rush). Max 5. */
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  p1: number;
  p2: number;
}

export interface MkRelicStack {
  id: MkRelicId;
  stacks: number;
}

export interface MkFighterCooldowns {
  dash: number;
  dashMax: number;
  guard: number;
  guardMax: number;
  s1: number;
  s1Max: number;
  s2: number;
  s2Max: number;
  s3: number;
  s3Max: number;
  s4: number;
  s4Max: number;
}

export interface MkFighterView {
  id: string;
  ownerId?: string;
  badge: string;
  name: string;
  heroId: MkHeroId;
  isCom: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  actionId: MkHeroActionId;
  actionTick: number;
  comboStep: number;
  hp: number;
  maxHp: number;
  shieldHp: number;
  atk: number;
  def: number;
  spd: number;
  fury: number;
  level: number;
  exp: number;
  expToNext: number;
  gold: number;
  sp: number;
  kills: number;
  parries: number;
  damageDealt: number;
  combo: number;
  comboTimerMs: number;
  cds: MkFighterCooldowns;
  invulnMs: number;
  guardMs: number;
  superArmorMs: number;
  furyBuffMs: number;
  evadeVisMs: number;
  counterReadyMs: number;
  downed: boolean;
  reviveProgress: number;
  upgrades: MkUpgradeLevels;
  relics: MkRelicStack[];
  pendingRelicChoices?: MkRelicId[];
}

export interface MkEnemyView {
  id: number;
  kind: MkAnyEnemyId;
  isBoss: boolean;
  isElite: boolean;
  name?: string;
  x: number;
  y: number;
  z: number;
  dir: 1 | -1;
  actionId: MkEnemyActionId;
  actionTick: number;
  hp: number;
  maxHp: number;
  bossPhase?: 1 | 2 | 3;
  hitFlashMs: number;
  slowMs: number;
  burnMs: number;
  poisonMs: number;
  stunMs: number;
  armorBreakMs: number;
  telegraphMs: number;
  telegraphX?: number;
  telegraphY?: number;
  telegraphR?: number;
}

export interface MkZoneView {
  id: number;
  kind: MkZoneKind;
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  maxMs: number;
  tint?: string;
}

export interface MkProjectileView {
  id: number;
  kind: MkProjectileKind;
  fromEnemy: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  radius: number;
  tint?: string;
}

export interface MkPickupView {
  id: number;
  kind: MkPickupKind;
  x: number;
  y: number;
  z: number;
  amount: number;
}

export interface MkDamageEvent {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
  kind: MkDmgKind;
  label?: string;
  targetId?: string | number;
}

export interface MkFxEvent {
  id: number;
  vfxId: MkVfxId;
  layer: MkVfxLayer;
  x: number;
  y: number;
  z?: number;
  dir: 1 | -1;
  radius: number;
  tint?: string;
  scale?: number;
  skillLevel?: number;
  heroId?: MkHeroId;
  chainTargets?: Array<{ x: number; y: number }>;
  hitstopMs?: number;
}

export interface MkUltCutInEvent {
  id: number;
  fighterId: string;
  heroId: MkHeroId;
  heroName: string;
  skillNameVi: string;
  accentColor: string;
}

export type MkWorldPhase = 'wave_intro' | 'combat' | 'wave_clear' | 'relic_draft' | 'ended';

export interface MkBossHudView {
  entityId: number;
  kind: MkBossId;
  nameVi: string;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  enraged: boolean;
}

export interface MkFrame {
  tick: number;
  elapsedMs: number;
  phase: MkWorldPhase;
  playMode: MkPlayMode;
  wave: number;
  biome: MkBiome;
  phaseLeftMs: number;
  enemiesRemaining: number;
  totalWaveEnemies: number;
  partyGold: number;
  partyScore: number;
  totalKills: number;
  boss?: MkBossHudView;
  fighters: MkFighterView[];
  enemies: MkEnemyView[];
  zones: MkZoneView[];
  projectiles: MkProjectileView[];
  pickups: MkPickupView[];
  fx: MkFxEvent[];
  damages: MkDamageEvent[];
  ultCutIns: MkUltCutInEvent[];
  sfx: string[];
  banner?: string;
}

export type MkCommand =
  | { t: 'move'; mx: number; my: number; dir?: 1 | -1; atk?: boolean }
  | { t: 'attack'; hold?: boolean; mx?: number; my?: number }
  | { t: 'skill'; slot: 1 | 2 | 3 | 4 }
  | { t: 'ultimate' }
  | { t: 'dash'; mx?: number; my?: number }
  | { t: 'guard' }
  | { t: 'switch_com'; targetId?: string }
  | { t: 'upgrade'; target: MkUpgradeTarget; fighterId?: string }
  | { t: 'pick_relic'; relicId: MkRelicId }
  | { t: 'skip_phase' }
  | { t: 'resign' };

export interface MkPlayerSummary {
  id: string;
  name: string;
  heroId: MkHeroId;
  badge: string;
  isCom: boolean;
  level: number;
  kills: number;
  parries: number;
  damageDealt: number;
  goldEarned: number;
  relics: MkRelicStack[];
  coinDelta?: number;
}

export interface MkResultSummary {
  victory: boolean;
  playMode: MkPlayMode;
  waveReached: number;
  totalKills: number;
  partyScore: number;
  elapsedMs: number;
  mvpId?: string;
  players: MkPlayerSummary[];
}

export interface MkRoomView {
  config: MkConfig;
  heroes: Record<string, MkHeroId>;
  result?: MkResultSummary;
}

export function normalizeMkHero(raw: unknown, fallbackIdx = 0): MkHeroId {
  if (typeof raw === 'string' && (MK_HERO_IDS as readonly string[]).includes(raw)) {
    return raw as MkHeroId;
  }
  return MK_HERO_IDS[Math.abs(fallbackIdx) % MK_HERO_IDS.length];
}

export function normalizeMkConfig(raw: unknown, humanCount = 1): MkConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const playMode: MkPlayMode = src.playMode === 'boss_rush' ? 'boss_rush' : 'endless';
  const maxBotsAllowed = Math.max(
    0,
    Math.min(MK_MAX_COM_BOTS, MK_MAX_PARTY_SIZE - Math.max(1, humanCount)),
  );
  const rawBots =
    typeof src.comBots === 'number' && Number.isFinite(src.comBots)
      ? Math.floor(src.comBots)
      : DEFAULT_MK_CONFIG.comBots;
  const comBots = Math.max(0, Math.min(maxBotsAllowed, rawBots));
  const difficulty: MkDifficulty =
    src.difficulty === 'hard' || src.difficulty === 'nightmare' ? src.difficulty : 'normal';
  const biome: MkBiome | 'auto' =
    src.biome === 'grasslands' ||
    src.biome === 'jungle' ||
    src.biome === 'volcano' ||
    src.biome === 'citadel'
      ? src.biome
      : 'auto';
  const allowSwitchCom = typeof src.allowSwitchCom === 'boolean' ? src.allowSwitchCom : true;
  return { playMode, comBots, difficulty, biome, allowSwitchCom };
}
