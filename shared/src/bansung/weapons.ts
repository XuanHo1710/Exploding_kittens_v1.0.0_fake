import { BANSUNG_TICK_EXACT_MS } from './types';
import type {
  BansungGachaCard,
  BansungGachaCategory,
  BansungGachaRarity,
  BansungGadgetId,
  BansungWeaponId,
} from './types';

/**
 * Ban Sung Co-op weapon, gadget, projectile, active-reload, and blue-energy specs.
 * Derived from d02 (canonical IDs) and d26-d31 (30 Hz authoritative combat specs).
 */

/** Convert milliseconds to integer 30 Hz server ticks (minimum 0). */
export function msToTicks(ms: number): number {
  if (ms <= 0) return 0;
  return Math.round(ms / BANSUNG_TICK_EXACT_MS);
}

/** Convert 30 Hz server ticks to rounded milliseconds. */
export function ticksToMs(ticks: number): number {
  if (ticks <= 0) return 0;
  return Math.round(ticks * BANSUNG_TICK_EXACT_MS);
}

// ============================================================================
// 1. Shared Blue Energy, Active Reload & Energy Orb Constants (d31)
// ============================================================================

/** Passive blue Energy regeneration per second (+1 Energy every 15 ticks). */
export const BANSUNG_ENERGY_REGEN_PER_S = 2.0;
/** Delay after last Energy spend before passive regen resumes (1.2s at 30 Hz). */
export const BANSUNG_ENERGY_REGEN_DELAY_TICKS = 36;
/** Fraction of maxEnergy restored when clearing a wave (+25%). */
export const BANSUNG_WAVE_ENERGY_RESTORE = 0.25;
/** Minimum Energy floor restored when a downed hero is revived (40%). */
export const BANSUNG_REVIVE_ENERGY_FLOOR = 0.40;

/** Anti-double-tap lockout window at start of reload (<28% ignores R tap). */
export const BANSUNG_RELOAD_LOCKOUT_U = 0.28;
/** Default active-reload sweet-spot window start (normalized 0..1). */
export const BANSUNG_RELOAD_SWEET_MIN = 0.48;
/** Default active-reload sweet-spot window end (normalized 0..1). */
export const BANSUNG_RELOAD_SWEET_MAX = 0.64;
/** Extra duration fraction added as freeze penalty when missing active reload (+45%). */
export const BANSUNG_RELOAD_JAM_PENALTY_MULT = 0.45;
/** Damage multiplier for the next magazine after a perfect active reload (+15%). */
export const BANSUNG_ACTIVE_EMPOWER_DMG_MULT = 1.15;
/** Bonus blue Energy granted on a perfect active reload. */
export const BANSUNG_ACTIVE_ENERGY_BONUS = 12;
/** Quick Hands perk multiplier on reload duration (0.75x). */
export const BANSUNG_QUICK_HANDS_RELOAD_MULT = 0.75;
/** Quick Hands perk widened active-reload sweet-spot [min, max]. */
export const BANSUNG_QUICK_HANDS_SWEET_SPOT: readonly [number, number] = [0.44, 0.68];
/** Minimum 30 Hz ticks between dry-fire SFX/FX prompts (~400ms). */
export const BANSUNG_DRY_FIRE_COOLDOWN_TICKS = 12;

export const BANSUNG_RELOAD_STATE_ACTIVE = 0 as const;
export const BANSUNG_RELOAD_STATE_JAMMED = 1 as const;

/** Blue Energy restored by each Energy Orb tier (d31 / d32). */
export const BANSUNG_ORB_VALUES = {
  energy_s: 8,
  energy_m: 20,
  energy_l: 50,
} as const;
/** Fraction of Energy Orb value shared to nearby co-op allies (40%). */
export const BANSUNG_ORB_COOP_SHARE = 0.40;
/** Radius in px for co-op Energy Orb resonance sharing. */
export const BANSUNG_ORB_COOP_RADIUS = 450;
/** Default Energy Orb magnet pull radius (px). */
export const BANSUNG_ORB_MAGNET_RADIUS = 110;
/** Expanded Energy Orb magnet radius with Tiger Pet companion (px). */
export const BANSUNG_ORB_MAGNET_RADIUS_PET = 140;
/** Expanded Energy Orb magnet radius with Magnet perk (px). */
export const BANSUNG_ORB_MAGNET_RADIUS_PERK = 180;
/** Contact pickup radius for Energy Orbs (px). */
export const BANSUNG_ORB_PICKUP_RADIUS = 18;
/** Energy Orb ground lifetime in ticks (22s; blinks during final 120 ticks). */
export const BANSUNG_ORB_TTL_TICKS = 660;
/** Initial scatter bounce lock before magnetizing (0.33s). */
export const BANSUNG_ORB_SPAWN_LOCK_TICKS = 10;
/** Maximum ground pickup count before merging oldest low-tier orbs (d32). */
export const BANSUNG_ORB_PICKUP_CAP = 96;

export interface BansungWeaponRuntime {
  weaponId: BansungWeaponId;
  ammoInMag: number; // 0..magSize (-1 if magSize === 0 melee)
  empowered: boolean; // true after perfect active reload until empty/swap
}

export interface BansungReloadRuntime {
  slot: number;
  progressTicks: number;
  durationTicks: number;
  jamTicksLeft: number;
  attempted: boolean;
  sweetMinU: number;
  sweetMaxU: number;
}

export interface BansungAmmoPrivate {
  en: number;
  maxEn: number;
  slot: number;
  mags: number[];
  maxMags: number[];
  empMask: number;
  /** Present only while reloading: [pct 0..100, sweetMinPct, sweetMaxPct, stateFlag] */
  rel?: [number, number, number, 0 | 1];
}

// ============================================================================
// 2. Category Unions, Projectile Configs & Helper Constants (d26-d30)
// ============================================================================

export type BansungWeaponCategory = 'kinetic' | 'explosive' | 'energy' | 'melee';
export type BansungWeaponRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'celestial'
  | 'mythic';

export type BansungKineticWeaponId = Extract<
  BansungWeaponId,
  | 'pistol'
  | 'rifle'
  | 'smg'
  | 'shotgun'
  | 'sniper_rifle'
  | 'dual_pistols'
  | 'minigun'
  | 'saw_launcher'
  | 'plasma_shotgun'
  | 'twin_smg'
  | 'ricochet_disc'
  | 'phantom_bow'
>;
export type BansungExplosiveWeaponId = Extract<
  BansungWeaponId,
  'grenade_launcher' | 'stun_launcher' | 'bazooka' | 'mine_gun' | 'cluster_rpg' | 'orbital_cannon'
>;
export type BansungEnergyWeaponId = Extract<
  BansungWeaponId,
  | 'plasma_rifle'
  | 'railgun'
  | 'lightning_staff'
  | 'arcane_book'
  | 'laser_cannon'
  | 'electric_gun'
  | 'flamethrower'
  | 'cryo_cannon'
  | 'gravity_gun'
  | 'ion_beam'
  | 'tesla_coil'
  | 'void_cannon'
  | 'blizzard_carbine'
  | 'magma_spitter'
  | 'chronos_rifle'
>;
export type BansungMeleeWeaponId = Extract<
  BansungWeaponId,
  'crescent_blade' | 'reaper_scythe' | 'shock_baton'
>;

export const BANSUNG_KINETIC_WEAPON_IDS: readonly BansungKineticWeaponId[] = [
  'pistol',
  'rifle',
  'smg',
  'shotgun',
  'sniper_rifle',
  'dual_pistols',
  'minigun',
  'saw_launcher',
  'plasma_shotgun',
  'twin_smg',
  'ricochet_disc',
  'phantom_bow',
] as const;

export const BANSUNG_EXPLOSIVE_WEAPON_IDS: readonly BansungExplosiveWeaponId[] = [
  'grenade_launcher',
  'stun_launcher',
  'bazooka',
  'mine_gun',
  'cluster_rpg',
  'orbital_cannon',
] as const;

export const BANSUNG_ENERGY_WEAPON_IDS: readonly BansungEnergyWeaponId[] = [
  'plasma_rifle',
  'railgun',
  'lightning_staff',
  'arcane_book',
  'laser_cannon',
  'electric_gun',
  'flamethrower',
  'cryo_cannon',
  'gravity_gun',
  'ion_beam',
  'tesla_coil',
  'void_cannon',
  'blizzard_carbine',
  'magma_spitter',
  'chronos_rifle',
] as const;

export const BANSUNG_MELEE_WEAPON_IDS: readonly BansungMeleeWeaponId[] = [
  'crescent_blade',
  'reaper_scythe',
  'shock_baton',
] as const;

export type BansungProjectileKind =
  | 'kinetic_sm'
  | 'kinetic_md'
  | 'shotgun_pellet'
  | 'frag_grenade'
  | 'frag_shrapnel'
  | 'stun_canister'
  | 'rocket'
  | 'prox_mine'
  | 'rail_beam'
  | 'turret_bolt'
  | 'plasma_bolt'
  | 'thunder_orb'
  | 'arcane_fireball'
  | 'arcane_ember'
  | 'turret_thunder'
  | 'stun_bomb_proj'
  | 'cluster_bomb_proj'
  | 'cluster_sub_proj'
  | 'sniper_slug'
  | 'laser_map_beam'
  | 'electric_arc_bolt'
  | 'flame_stream_orb'
  | 'cryo_shard'
  | 'saw_disc'
  | 'gravity_orb'
  | 'plasma_pellet'
  | 'twin_smg_bullet'
  | 'ion_lance'
  | 'cluster_rocket'
  | 'tesla_arc'
  | 'void_cannon_orb'
  | 'blizzard_bolt'
  | 'ricochet_blade'
  | 'phantom_arrow'
  | 'magma_glob'
  | 'chronos_slug'
  | 'orbital_shell';

/**
 * Ordered projectile kinds matching net `shotKind` / `kindId` values.
 * Reserves 10..13 for d28, 18..20 for sniper/laser/electric, 21..24 for flame/cryo/saw/gravity.
 */
export const BANSUNG_PROJECTILE_KINDS: readonly BansungProjectileKind[] = [
  'kinetic_sm',        // 0
  'kinetic_md',        // 1
  'shotgun_pellet',    // 2
  'frag_grenade',      // 3
  'frag_shrapnel',     // 4
  'stun_canister',     // 5
  'rocket',            // 6
  'prox_mine',         // 7
  'rail_beam',         // 8
  'turret_bolt',       // 9
  'plasma_bolt',       // 10 (d28)
  'thunder_orb',       // 11 (d28)
  'arcane_fireball',   // 12 (d28)
  'arcane_ember',      // 13 (d28)
  'turret_thunder',    // 14
  'stun_bomb_proj',    // 15
  'cluster_bomb_proj', // 16
  'cluster_sub_proj',  // 17
  'sniper_slug',       // 18
  'laser_map_beam',    // 19
  'electric_arc_bolt', // 20
  'flame_stream_orb',  // 21
  'cryo_shard',        // 22
  'saw_disc',          // 23
  'gravity_orb',       // 24
  'plasma_pellet',     // 25
  'twin_smg_bullet',   // 26
  'ion_lance',         // 27
  'cluster_rocket',    // 28
  'tesla_arc',         // 29
  'void_cannon_orb',   // 30
  'blizzard_bolt',     // 31
  'ricochet_blade',    // 32
  'phantom_arrow',     // 33
  'magma_glob',        // 34
  'chronos_slug',      // 35
  'orbital_shell',     // 36
] as const;

export interface BansungFalloffConfig {
  startPx: number;
  minMult: number;
}

export interface BansungTracerConfig {
  color: string;
  core: string;
  lenPx: number;
  widthPx: number;
  fadeMs: number;
}

export interface BansungCasingConfig {
  color: string;
  size: readonly [width: number, height: number];
  ejectDelayTicks: number;
}

export interface BansungSpriteAnimMeta {
  frames: number;
  cellW: number;
  cellH: number;
  offX: number;
  offY: number;
  fps: number;
}

export interface BansungProjectileConfig {
  kind: BansungProjectileKind;
  kindId: number;
  trajectory: 'linear' | 'lob' | 'rocket' | 'mine' | 'beam' | 'homing';
  speed: number;
  accel: number;
  maxSpeed: number;
  radius: number;
  range: number;
  ttlMs: number;
  substeps: number;
  pierceCount: number;
  destructibleByMelee: boolean;
  gravityZ: number;
  initVZ: number;
  bouncesMax: number;
  restitution: number;
  contactDetonate: boolean;
  blastRadius: number;
  coreRadius: number;
  outerFalloffMin: number;
  damagePair?: readonly [light: number, armored: number];
  knockback: number;
  stunMs: number;
  falloff?: BansungFalloffConfig;
  tracer?: BansungTracerConfig;
  spriteKey: string;
  anim?: BansungSpriteAnimMeta;
}

export const BANSUNG_PROJECTILE_CONFIGS: Readonly<
  Record<BansungProjectileKind, BansungProjectileConfig>
> = {
  kinetic_sm: {
    kind: 'kinetic_sm',
    kindId: 0,
    trajectory: 'linear',
    speed: 780,
    accel: 0,
    maxSpeed: 860,
    radius: 4,
    range: 680,
    ttlMs: 900,
    substeps: 4,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    knockback: 70,
    stunMs: 0,
    tracer: { color: '#ffe066', core: '#fff7cc', lenPx: 34, widthPx: 2, fadeMs: 75 },
    spriteKey: 'bullet_kinetic_sm',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  kinetic_md: {
    kind: 'kinetic_md',
    kindId: 1,
    trajectory: 'linear',
    speed: 920,
    accel: 0,
    maxSpeed: 920,
    radius: 4,
    range: 760,
    ttlMs: 850,
    substeps: 4,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    knockback: 55,
    stunMs: 0,
    tracer: { color: '#ffae34', core: '#ffffff', lenPx: 48, widthPx: 2.5, fadeMs: 85 },
    spriteKey: 'bullet_kinetic_md',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  shotgun_pellet: {
    kind: 'shotgun_pellet',
    kindId: 2,
    trajectory: 'linear',
    speed: 740,
    accel: 0,
    maxSpeed: 777,
    radius: 4,
    range: 380,
    ttlMs: 550,
    substeps: 4,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    knockback: 28,
    stunMs: 0,
    falloff: { startPx: 240, minMult: 0.55 },
    tracer: { color: '#ff7b29', core: '#fff1a8', lenPx: 28, widthPx: 3, fadeMs: 90 },
    spriteKey: 'bullet_shotgun_pellet',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  frag_grenade: {
    kind: 'frag_grenade',
    kindId: 3,
    trajectory: 'lob',
    speed: 460,
    accel: 0,
    maxSpeed: 460,
    radius: 6,
    range: 400,
    ttlMs: 1100,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 680,
    initVZ: 210,
    bouncesMax: 1,
    restitution: 0.55,
    contactDetonate: true,
    blastRadius: 92,
    coreRadius: 34,
    outerFalloffMin: 0.40,
    knockback: 340,
    stunMs: 0,
    spriteKey: 'p_frag_grenade',
    anim: { frames: 4, cellW: 16, cellH: 16, offX: -8, offY: -8, fps: 15 },
  },
  frag_shrapnel: {
    kind: 'frag_shrapnel',
    kindId: 4,
    trajectory: 'linear',
    speed: 520,
    accel: 0,
    maxSpeed: 520,
    radius: 3,
    range: 94,
    ttlMs: 180,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [9, 9],
    knockback: 45,
    stunMs: 0,
    tracer: { color: '#ff922b', core: '#fff3bf', lenPx: 18, widthPx: 1.5, fadeMs: 55 },
    spriteKey: 'bullet_kinetic_sm',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  stun_canister: {
    kind: 'stun_canister',
    kindId: 5,
    trajectory: 'lob',
    speed: 500,
    accel: 0,
    maxSpeed: 500,
    radius: 6,
    range: 400,
    ttlMs: 850,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 680,
    initVZ: 195,
    bouncesMax: 1,
    restitution: 0.55,
    contactDetonate: true,
    blastRadius: 128,
    coreRadius: 56,
    outerFalloffMin: 0.50,
    knockback: 410,
    stunMs: 1800,
    spriteKey: 'p_stun_canister',
    anim: { frames: 4, cellW: 16, cellH: 16, offX: -8, offY: -8, fps: 15 },
  },
  rocket: {
    kind: 'rocket',
    kindId: 6,
    trajectory: 'rocket',
    speed: 340,
    accel: 900,
    maxSpeed: 640,
    radius: 7,
    range: 800,
    ttlMs: 1600,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 76,
    coreRadius: 28,
    outerFalloffMin: 0.45,
    knockback: 280,
    stunMs: 0,
    tracer: { color: '#ff6b35', core: '#ffd166', lenPx: 32, widthPx: 4, fadeMs: 110 },
    spriteKey: 'p_rocket',
    anim: { frames: 2, cellW: 24, cellH: 16, offX: -12, offY: -8, fps: 20 },
  },
  prox_mine: {
    kind: 'prox_mine',
    kindId: 7,
    trajectory: 'mine',
    speed: 380,
    accel: 0,
    maxSpeed: 380,
    radius: 7,
    range: 400,
    ttlMs: 25000,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 720,
    initVZ: 130,
    bouncesMax: 0,
    restitution: 0.55,
    contactDetonate: false,
    blastRadius: 108,
    coreRadius: 42,
    outerFalloffMin: 0.45,
    knockback: 460,
    stunMs: 350,
    spriteKey: 'p_prox_mine',
    anim: { frames: 4, cellW: 16, cellH: 16, offX: -8, offY: -8, fps: 6 },
  },
  rail_beam: {
    kind: 'rail_beam',
    kindId: 8,
    trajectory: 'beam',
    speed: 0,
    accel: 0,
    maxSpeed: 0,
    radius: 10,
    range: 860,
    ttlMs: 240,
    substeps: 1,
    pierceCount: 99,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [62, 95],
    knockback: 110,
    stunMs: 450,
    tracer: { color: '#38bdf8', core: '#ffffff', lenPx: 860, widthPx: 6, fadeMs: 240 },
    spriteKey: 'rail_beam',
  },
  turret_bolt: {
    kind: 'turret_bolt',
    kindId: 9,
    trajectory: 'linear',
    speed: 680,
    accel: 0,
    maxSpeed: 680,
    radius: 4,
    range: 310,
    ttlMs: 500,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [14, 18],
    knockback: 40,
    stunMs: 0,
    tracer: { color: '#7dd3fc', core: '#ffffff', lenPx: 28, widthPx: 2, fadeMs: 70 },
    spriteKey: 'bullet_kinetic_sm',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  plasma_bolt: {
    kind: 'plasma_bolt',
    kindId: 10,
    trajectory: 'linear',
    speed: 680,
    accel: 0,
    maxSpeed: 680,
    radius: 5,
    range: 620,
    ttlMs: 920,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [18, 24],
    knockback: 45,
    stunMs: 0,
    tracer: { color: '#22d3ee', core: '#e7f5ff', lenPx: 28, widthPx: 5, fadeMs: 90 },
    spriteKey: 'plasma_bolt',
  },
  thunder_orb: {
    kind: 'thunder_orb',
    kindId: 11,
    trajectory: 'homing',
    speed: 460,
    accel: 0,
    maxSpeed: 460,
    radius: 8,
    range: 560,
    ttlMs: 1250,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [26, 36],
    knockback: 50,
    stunMs: 280,
    tracer: { color: '#7dd3fc', core: '#e0f2fe', lenPx: 24, widthPx: 4, fadeMs: 100 },
    spriteKey: 'thunderball',
    anim: { frames: 16, cellW: 128, cellH: 128, offX: -64, offY: -64, fps: 24 },
  },
  arcane_fireball: {
    kind: 'arcane_fireball',
    kindId: 12,
    trajectory: 'linear',
    speed: 420,
    accel: 0,
    maxSpeed: 420,
    radius: 9,
    range: 520,
    ttlMs: 1250,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 58,
    coreRadius: 16,
    outerFalloffMin: 0.60,
    damagePair: [44, 30],
    knockback: 75,
    stunMs: 0,
    tracer: { color: '#fb923c', core: '#fff7ed', lenPx: 24, widthPx: 4, fadeMs: 100 },
    spriteKey: 'fireball',
    anim: { frames: 3, cellW: 32, cellH: 32, offX: -16, offY: -16, fps: 17 },
  },
  arcane_ember: {
    kind: 'arcane_ember',
    kindId: 13,
    trajectory: 'linear',
    speed: 320,
    accel: 0,
    maxSpeed: 320,
    radius: 5,
    range: 95,
    ttlMs: 300,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [12, 8],
    knockback: 25,
    stunMs: 0,
    tracer: { color: '#fdba74', core: '#ffffff', lenPx: 14, widthPx: 2.5, fadeMs: 70 },
    spriteKey: 'fireball',
    anim: { frames: 3, cellW: 32, cellH: 32, offX: -16, offY: -16, fps: 17 },
  },
  turret_thunder: {
    kind: 'turret_thunder',
    kindId: 14,
    trajectory: 'linear',
    speed: 620,
    accel: 0,
    maxSpeed: 620,
    radius: 7,
    range: 310,
    ttlMs: 520,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 48,
    coreRadius: 16,
    outerFalloffMin: 0.6,
    damagePair: [28, 34],
    knockback: 80,
    stunMs: 467,
    tracer: { color: '#38bdf8', core: '#e0f2fe', lenPx: 24, widthPx: 3.5, fadeMs: 90 },
    spriteKey: 'thunderball',
    anim: { frames: 16, cellW: 128, cellH: 128, offX: -64, offY: -64, fps: 24 },
  },
  stun_bomb_proj: {
    kind: 'stun_bomb_proj',
    kindId: 15,
    trajectory: 'lob',
    speed: 420,
    accel: 0,
    maxSpeed: 420,
    radius: 8,
    range: 340,
    ttlMs: 933,
    substeps: 1,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 680,
    initVZ: 220,
    bouncesMax: 1,
    restitution: 0.5,
    contactDetonate: true,
    blastRadius: 135,
    coreRadius: 48,
    outerFalloffMin: 0.6,
    damagePair: [22, 14],
    knockback: 180,
    stunMs: 2200,
    spriteKey: 'gadget_bombs',
    anim: { frames: 4, cellW: 32, cellH: 32, offX: -16, offY: -16, fps: 15 },
  },
  cluster_bomb_proj: {
    kind: 'cluster_bomb_proj',
    kindId: 16,
    trajectory: 'lob',
    speed: 400,
    accel: 0,
    maxSpeed: 400,
    radius: 9,
    range: 320,
    ttlMs: 1067,
    substeps: 1,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 680,
    initVZ: 240,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 105,
    coreRadius: 36,
    outerFalloffMin: 0.45,
    damagePair: [65, 95],
    knockback: 240,
    stunMs: 0,
    spriteKey: 'gadget_bombs',
    anim: { frames: 4, cellW: 32, cellH: 32, offX: -16, offY: -16, fps: 15 },
  },
  cluster_sub_proj: {
    kind: 'cluster_sub_proj',
    kindId: 17,
    trajectory: 'lob',
    speed: 220,
    accel: 0,
    maxSpeed: 260,
    radius: 6,
    range: 95,
    ttlMs: 633,
    substeps: 1,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 680,
    initVZ: 150,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 68,
    coreRadius: 24,
    outerFalloffMin: 0.5,
    damagePair: [32, 45],
    knockback: 130,
    stunMs: 0,
    spriteKey: 'gadget_bombs',
    anim: { frames: 4, cellW: 32, cellH: 32, offX: -16, offY: -16, fps: 15 },
  },
  sniper_slug: {
    kind: 'sniper_slug',
    kindId: 18,
    trajectory: 'linear',
    speed: 1550,
    accel: 0,
    maxSpeed: 1550,
    radius: 4.5,
    range: 1200,
    ttlMs: 850,
    substeps: 6,
    pierceCount: 3,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [95, 128],
    knockback: 160,
    stunMs: 0,
    tracer: { color: '#fde047', core: '#ffffff', lenPx: 88, widthPx: 3.5, fadeMs: 110 },
    spriteKey: 'bullet_kinetic_md',
    anim: { frames: 2, cellW: 12, cellH: 8, offX: -6, offY: -4, fps: 30 },
  },
  laser_map_beam: {
    kind: 'laser_map_beam',
    kindId: 19,
    trajectory: 'beam',
    speed: 0,
    accel: 0,
    maxSpeed: 0,
    radius: 16,
    range: 5400,
    ttlMs: 260,
    substeps: 1,
    pierceCount: 99,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [145, 181],
    knockback: 120,
    stunMs: 150,
    tracer: { color: '#ef4444', core: '#fff5f5', lenPx: 140, widthPx: 8, fadeMs: 220 },
    spriteKey: 'rail_beam',
  },
  electric_arc_bolt: {
    kind: 'electric_arc_bolt',
    kindId: 20,
    trajectory: 'homing',
    speed: 780,
    accel: 0,
    maxSpeed: 780,
    radius: 6,
    range: 680,
    ttlMs: 900,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [32, 46],
    knockback: 45,
    stunMs: 360,
    tracer: { color: '#38bdf8', core: '#e0f2fe', lenPx: 36, widthPx: 3.5, fadeMs: 95 },
    spriteKey: 'thunderball',
    anim: { frames: 16, cellW: 128, cellH: 128, offX: -64, offY: -64, fps: 24 },
  },
  flame_stream_orb: {
    kind: 'flame_stream_orb',
    kindId: 21,
    trajectory: 'linear',
    speed: 520,
    accel: -140,
    maxSpeed: 540,
    radius: 10,
    range: 360,
    ttlMs: 750,
    substeps: 3,
    pierceCount: 3,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [24, 15],
    knockback: 25,
    stunMs: 0,
    tracer: { color: '#fb923c', core: '#fef08a', lenPx: 26, widthPx: 5.5, fadeMs: 95 },
    spriteKey: 'flame_stream_orb',
    anim: { frames: 4, cellW: 24, cellH: 24, offX: -12, offY: -12, fps: 20 },
  },
  cryo_shard: {
    kind: 'cryo_shard',
    kindId: 22,
    trajectory: 'linear',
    speed: 740,
    accel: 0,
    maxSpeed: 740,
    radius: 7,
    range: 640,
    ttlMs: 950,
    substeps: 4,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 76,
    coreRadius: 24,
    outerFalloffMin: 0.65,
    damagePair: [57, 60],
    knockback: 80,
    stunMs: 0,
    tracer: { color: '#2dd4bf', core: '#ecfeff', lenPx: 40, widthPx: 4, fadeMs: 110 },
    spriteKey: 'cryo_shard',
    anim: { frames: 4, cellW: 24, cellH: 24, offX: -12, offY: -12, fps: 20 },
  },
  saw_disc: {
    kind: 'saw_disc',
    kindId: 23,
    trajectory: 'linear',
    speed: 820,
    accel: 0,
    maxSpeed: 820,
    radius: 9,
    range: 1150,
    ttlMs: 1450,
    substeps: 4,
    pierceCount: 3,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 3,
    restitution: 1,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [44, 42],
    knockback: 95,
    stunMs: 0,
    tracer: { color: '#e2e8f0', core: '#ffffff', lenPx: 28, widthPx: 3.5, fadeMs: 90 },
    spriteKey: 'saw_disc',
    anim: { frames: 4, cellW: 24, cellH: 24, offX: -12, offY: -12, fps: 24 },
  },
  gravity_orb: {
    kind: 'gravity_orb',
    kindId: 24,
    trajectory: 'linear',
    speed: 440,
    accel: 0,
    maxSpeed: 440,
    radius: 10,
    range: 760,
    ttlMs: 1750,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 150,
    coreRadius: 42,
    outerFalloffMin: 0.55,
    damagePair: [97, 101],
    knockback: 0,
    stunMs: 420,
    tracer: { color: '#ef4444', core: '#fbcfe8', lenPx: 44, widthPx: 5, fadeMs: 130 },
    spriteKey: 'gravity_orb',
    anim: { frames: 4, cellW: 28, cellH: 28, offX: -14, offY: -14, fps: 18 },
  },
  plasma_pellet: {
    kind: 'plasma_pellet',
    kindId: 25,
    trajectory: 'linear',
    speed: 760,
    accel: 0,
    maxSpeed: 760,
    radius: 6,
    range: 460,
    ttlMs: 650,
    substeps: 3,
    pierceCount: 2,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [25.2, 32.4],
    knockback: 185,
    stunMs: 0,
    tracer: { color: '#f97316', core: '#ffedd5', lenPx: 28, widthPx: 4, fadeMs: 90 },
    spriteKey: 'plasma_bolt',
  },
  twin_smg_bullet: {
    kind: 'twin_smg_bullet',
    kindId: 26,
    trajectory: 'linear',
    speed: 980,
    accel: 0,
    maxSpeed: 980,
    radius: 4,
    range: 560,
    ttlMs: 600,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [16.8, 11.9],
    knockback: 28,
    stunMs: 0,
    tracer: { color: '#38bdf8', core: '#ffffff', lenPx: 30, widthPx: 2.5, fadeMs: 75 },
    spriteKey: 'bullet_kinetic_sm',
    anim: { frames: 2, cellW: 10, cellH: 6, offX: -5, offY: -3, fps: 30 },
  },
  ion_lance: {
    kind: 'ion_lance',
    kindId: 27,
    trajectory: 'beam',
    speed: 0,
    accel: 0,
    maxSpeed: 0,
    radius: 12,
    range: 840,
    ttlMs: 220,
    substeps: 1,
    pierceCount: 6,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [76, 110.2],
    knockback: 90,
    stunMs: 120,
    tracer: { color: '#22d3ee', core: '#ecfeff', lenPx: 120, widthPx: 6, fadeMs: 180 },
    spriteKey: 'rail_beam',
  },
  cluster_rocket: {
    kind: 'cluster_rocket',
    kindId: 28,
    trajectory: 'linear',
    speed: 420,
    accel: 760,
    maxSpeed: 740,
    radius: 8,
    range: 860,
    ttlMs: 1650,
    substeps: 2,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 92,
    coreRadius: 34,
    outerFalloffMin: 0.45,
    damagePair: [71.4, 91.8],
    knockback: 340,
    stunMs: 220,
    tracer: { color: '#facc15', core: '#fef9c3', lenPx: 28, widthPx: 4.5, fadeMs: 110 },
    spriteKey: 'p_rocket',
    anim: { frames: 2, cellW: 24, cellH: 16, offX: -12, offY: -8, fps: 20 },
  },
  tesla_arc: {
    kind: 'tesla_arc',
    kindId: 29,
    trajectory: 'homing',
    speed: 820,
    accel: 0,
    maxSpeed: 820,
    radius: 7,
    range: 640,
    ttlMs: 850,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [45.6, 62.7],
    knockback: 55,
    stunMs: 320,
    tracer: { color: '#60a5fa', core: '#eff6ff', lenPx: 38, widthPx: 4, fadeMs: 95 },
    spriteKey: 'thunderball',
    anim: { frames: 16, cellW: 128, cellH: 128, offX: -64, offY: -64, fps: 24 },
  },
  void_cannon_orb: {
    kind: 'void_cannon_orb',
    kindId: 30,
    trajectory: 'linear',
    speed: 480,
    accel: 0,
    maxSpeed: 480,
    radius: 12,
    range: 800,
    ttlMs: 1700,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 175,
    coreRadius: 48,
    outerFalloffMin: 0.45,
    damagePair: [134.4, 151.2],
    knockback: 0,
    stunMs: 360,
    tracer: { color: '#a855f7', core: '#faf5ff', lenPx: 38, widthPx: 7, fadeMs: 130 },
    spriteKey: 'gravity_orb',
    anim: { frames: 4, cellW: 28, cellH: 28, offX: -14, offY: -14, fps: 18 },
  },
  blizzard_bolt: {
    kind: 'blizzard_bolt',
    kindId: 31,
    trajectory: 'linear',
    speed: 860,
    accel: 0,
    maxSpeed: 860,
    radius: 6,
    range: 660,
    ttlMs: 820,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 64,
    coreRadius: 20,
    outerFalloffMin: 0.65,
    damagePair: [29.4, 33.6],
    knockback: 45,
    stunMs: 0,
    tracer: { color: '#38bdf8', core: '#e0f2fe', lenPx: 34, widthPx: 3.5, fadeMs: 90 },
    spriteKey: 'cryo_shard',
    anim: { frames: 4, cellW: 24, cellH: 24, offX: -12, offY: -12, fps: 22 },
  },
  ricochet_blade: {
    kind: 'ricochet_blade',
    kindId: 32,
    trajectory: 'linear',
    speed: 900,
    accel: 0,
    maxSpeed: 900,
    radius: 8,
    range: 1350,
    ttlMs: 1650,
    substeps: 4,
    pierceCount: 3,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 5,
    restitution: 1,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [56.7, 54],
    knockback: 85,
    stunMs: 0,
    tracer: { color: '#c084fc', core: '#ffffff', lenPx: 30, widthPx: 3.5, fadeMs: 95 },
    spriteKey: 'saw_disc',
    anim: { frames: 4, cellW: 24, cellH: 24, offX: -12, offY: -12, fps: 28 },
  },
  phantom_arrow: {
    kind: 'phantom_arrow',
    kindId: 33,
    trajectory: 'linear',
    speed: 1240,
    accel: 0,
    maxSpeed: 1240,
    radius: 5,
    range: 920,
    ttlMs: 850,
    substeps: 5,
    pierceCount: 4,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [96, 120],
    knockback: 110,
    stunMs: 0,
    tracer: { color: '#a78bfa', core: '#f5f3ff', lenPx: 54, widthPx: 4, fadeMs: 120 },
    spriteKey: 'bullet_kinetic_sm',
    anim: { frames: 2, cellW: 10, cellH: 6, offX: -5, offY: -3, fps: 30 },
  },
  magma_glob: {
    kind: 'magma_glob',
    kindId: 34,
    trajectory: 'linear',
    speed: 680,
    accel: 0,
    maxSpeed: 680,
    radius: 9,
    range: 620,
    ttlMs: 960,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: true,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 68,
    coreRadius: 22,
    outerFalloffMin: 0.55,
    damagePair: [46, 55.2],
    knockback: 75,
    stunMs: 0,
    tracer: { color: '#fb923c', core: '#fef08a', lenPx: 34, widthPx: 5, fadeMs: 110 },
    spriteKey: 'plasma_bolt',
  },
  chronos_slug: {
    kind: 'chronos_slug',
    kindId: 35,
    trajectory: 'linear',
    speed: 960,
    accel: 0,
    maxSpeed: 960,
    radius: 6,
    range: 780,
    ttlMs: 900,
    substeps: 4,
    pierceCount: 2,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    damagePair: [44.1, 56.7],
    knockback: 60,
    stunMs: 0,
    tracer: { color: '#2dd4bf', core: '#ecfeff', lenPx: 42, widthPx: 4, fadeMs: 105 },
    spriteKey: 'plasma_bolt',
  },
  orbital_shell: {
    kind: 'orbital_shell',
    kindId: 36,
    trajectory: 'rocket',
    speed: 520,
    accel: 820,
    maxSpeed: 880,
    radius: 11,
    range: 960,
    ttlMs: 1750,
    substeps: 3,
    pierceCount: 1,
    destructibleByMelee: false,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    blastRadius: 180,
    coreRadius: 56,
    outerFalloffMin: 0.45,
    damagePair: [152.25, 203],
    knockback: 420,
    stunMs: 560,
    tracer: { color: '#fbbf24', core: '#fffbeb', lenPx: 48, widthPx: 6.5, fadeMs: 140 },
    spriteKey: 'p_rocket',
    anim: { frames: 2, cellW: 24, cellH: 16, offX: -12, offY: -8, fps: 24 },
  },
} as const;

/** Lookup projectile config by quantized network kindId (0..20). */
export function getProjectileConfigByKindId(
  kindId: number
): BansungProjectileConfig | undefined {
  const kind = BANSUNG_PROJECTILE_KINDS[kindId];
  return kind ? BANSUNG_PROJECTILE_CONFIGS[kind] : undefined;
}

// ============================================================================
// 3. Weapon Base & Category Specifications (d26, d27, d28, d29)
// ============================================================================

export interface BansungWeaponSfx {
  fire: string;
  reload: string;
  extra?: string;
}

export interface BansungWeaponBase {
  id: BansungWeaponId;
  idx: number;
  category: BansungWeaponCategory;
  name: string;
  vnName: string;
  rarity: BansungWeaponRarity;
  slotHint: number;
  damage: number;
  armorMult: readonly [light: number, armored: number];
  damagePair: readonly [light: number, armored: number];
  critChance: number;
  critMult: number;
  knockback: number;
  energyCost: number;
  magSize: number;
  reloadTicks: number;
  reloadMs: number;
  sweetSpot: readonly [number, number];
  cooldownTicks: number;
  cooldownMs: number;
  range: number;
  recoilKickPx: number;
  camImpulsePx: number;
  muzzleSnapDeg: number;
  muzzleOffset: readonly [x: number, y: number];
  spriteKey: string;
  hotbarIcon: string;
  anim: BansungSpriteAnimMeta;
  sfxFire: string;
  sfxReload: string;
  sfxHit?: string;
  sfxExtra?: string;
}

// --- d26: Kinetic Firearms ---

export type BansungKineticFireMode = 'semi' | 'auto' | 'burst' | 'pump';

export interface BansungKineticWeaponSpec extends BansungWeaponBase {
  id: BansungKineticWeaponId;
  category: 'kinetic';
  fireMode: BansungKineticFireMode;
  burstCount: number;
  burstStepTicks: number;
  pellets: number;
  projKind: BansungProjectileKind;
  projSpeed: number;
  projRadius: number;
  falloff?: BansungFalloffConfig;
  dotOnHit?: { kind: 'burn' | 'poison' | 'shock' | 'bleed'; dps: number; ms: number };
  armorPiercePct?: number;
  baseSpreadDeg: number;
  fanArcDeg?: number;
  bloomPerShotDeg: number;
  maxBloomDeg: number;
  bloomDecayDegPerSec: number;
  moveSpreadMult: number;
  tracer: BansungTracerConfig;
  casing: BansungCasingConfig;
  sfx: BansungWeaponSfx;
}

export const BANSUNG_KINETIC_WEAPONS: Readonly<
  Record<BansungKineticWeaponId, BansungKineticWeaponSpec>
> = {
  pistol: {
    id: 'pistol',
    idx: 0,
    category: 'kinetic',
    name: 'Sidearm Pistol',
    vnName: 'Súng Lục Phụ',
    rarity: 'common',
    slotHint: 0,
    fireMode: 'semi',
    damage: 14,
    armorMult: [1.0, 0.8],
    damagePair: [14, 11.2],
    critChance: 0.15,
    critMult: 1.5,
    knockback: 70,
    cooldownTicks: 7,
    cooldownMs: 233,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 12,
    reloadTicks: 29,
    reloadMs: 967,
    sweetSpot: [0.45, 0.68],
    projKind: 'kinetic_sm',
    projSpeed: 780,
    projRadius: 4,
    range: 680,
    baseSpreadDeg: 2.0,
    bloomPerShotDeg: 1.4,
    maxBloomDeg: 7.5,
    bloomDecayDegPerSec: 16,
    moveSpreadMult: 1.15,
    recoilKickPx: 3.5,
    camImpulsePx: 2.0,
    muzzleSnapDeg: 6,
    muzzleOffset: [17, -2],
    spriteKey: 'gun_pistol',
    hotbarIcon: 'gun_pistol',
    anim: { frames: 3, cellW: 24, cellH: 16, offX: -6, offY: -8, fps: 30 },
    tracer: { color: '#ffe066', core: '#fff7cc', lenPx: 34, widthPx: 2, fadeMs: 75 },
    casing: { color: '#d4af37', size: [3, 2], ejectDelayTicks: 0 },
    sfxFire: 'sfx_pistol_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfx: { fire: 'sfx_pistol_fire', reload: 'sfx_reload_kinetic' },
  },
  rifle: {
    id: 'rifle',
    idx: 1,
    category: 'kinetic',
    name: 'Assault Rifle',
    vnName: 'Súng Trường Tấn Công',
    rarity: 'uncommon',
    slotHint: 1,
    fireMode: 'auto',
    damage: 18,
    armorMult: [1.0, 1.0],
    damagePair: [18, 18],
    critChance: 0.14,
    critMult: 1.5,
    knockback: 58,
    cooldownTicks: 3,
    cooldownMs: 100,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 30,
    reloadTicks: 36,
    reloadMs: 1200,
    sweetSpot: [0.50, 0.70],
    projKind: 'kinetic_md',
    projSpeed: 960,
    projRadius: 4,
    range: 780,
    baseSpreadDeg: 2.2,
    bloomPerShotDeg: 1.0,
    maxBloomDeg: 8.5,
    bloomDecayDegPerSec: 18,
    moveSpreadMult: 1.2,
    recoilKickPx: 4.5,
    camImpulsePx: 3.0,
    muzzleSnapDeg: 4,
    muzzleOffset: [28, -2],
    spriteKey: 'gun_rifle',
    hotbarIcon: 'gun_rifle',
    anim: { frames: 3, cellW: 40, cellH: 18, offX: -10, offY: -9, fps: 30 },
    tracer: { color: '#ffae34', core: '#ffffff', lenPx: 48, widthPx: 2.5, fadeMs: 85 },
    casing: { color: '#d4af37', size: [4, 2], ejectDelayTicks: 0 },
    sfxFire: 'sfx_rifle_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfx: { fire: 'sfx_rifle_fire', reload: 'sfx_reload_kinetic' },
  },
  smg: {
    id: 'smg',
    idx: 2,
    category: 'kinetic',
    name: 'Burst SMG',
    vnName: 'Tiểu Liên SMG',
    rarity: 'uncommon',
    slotHint: 1,
    fireMode: 'burst',
    damage: 11,
    armorMult: [1.2, 0.75],
    damagePair: [13.2, 8.25],
    critChance: 0.18,
    critMult: 1.5,
    knockback: 30,
    cooldownTicks: 5,
    cooldownMs: 170,
    burstCount: 3,
    burstStepTicks: 2,
    pellets: 1,
    energyCost: 0,
    magSize: 36,
    reloadTicks: 33,
    reloadMs: 1100,
    sweetSpot: [0.45, 0.65],
    projKind: 'kinetic_sm',
    projSpeed: 880,
    projRadius: 3.5,
    range: 640,
    baseSpreadDeg: 1.8,
    bloomPerShotDeg: 1.6,
    maxBloomDeg: 11.0,
    bloomDecayDegPerSec: 24,
    moveSpreadMult: 1.10,
    recoilKickPx: 3.0,
    camImpulsePx: 1.8,
    muzzleSnapDeg: 3.5,
    muzzleOffset: [23, -2],
    spriteKey: 'gun_smg',
    hotbarIcon: 'gun_smg',
    anim: { frames: 3, cellW: 34, cellH: 18, offX: -9, offY: -9, fps: 30 },
    tracer: { color: '#ffd166', core: '#ffffff', lenPx: 38, widthPx: 2, fadeMs: 65 },
    casing: { color: '#d4af37', size: [3, 2], ejectDelayTicks: 0 },
    sfxFire: 'sfx_smg_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfx: { fire: 'sfx_smg_fire', reload: 'sfx_reload_kinetic' },
  },
  shotgun: {
    id: 'shotgun',
    idx: 3,
    category: 'kinetic',
    name: 'Pump Shotgun',
    vnName: 'Shotgun Bơm',
    rarity: 'rare',
    slotHint: 2,
    fireMode: 'pump',
    damage: 11,
    armorMult: [1.1, 0.8],
    damagePair: [12.1, 8.8],
    critChance: 0.10,
    critMult: 1.5,
    knockback: 28,
    cooldownTicks: 20,
    cooldownMs: 667,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 6,
    energyCost: 0,
    magSize: 6,
    reloadTicks: 44,
    reloadMs: 1467,
    sweetSpot: [0.55, 0.75],
    projKind: 'shotgun_pellet',
    projSpeed: 740,
    projRadius: 4,
    range: 380,
    falloff: { startPx: 240, minMult: 0.55 },
    baseSpreadDeg: 1.8,
    fanArcDeg: 22,
    bloomPerShotDeg: 2.5,
    maxBloomDeg: 5.0,
    bloomDecayDegPerSec: 10,
    moveSpreadMult: 1.15,
    recoilKickPx: 8.5,
    camImpulsePx: 7.5,
    muzzleSnapDeg: 11,
    muzzleOffset: [30, -2],
    spriteKey: 'gun_shotgun',
    hotbarIcon: 'gun_shotgun',
    anim: { frames: 4, cellW: 42, cellH: 18, offX: -10, offY: -9, fps: 30 },
    tracer: { color: '#ff7b29', core: '#fff1a8', lenPx: 28, widthPx: 3, fadeMs: 90 },
    casing: { color: '#c92a2a', size: [5, 3], ejectDelayTicks: 8 },
    sfxFire: 'sfx_shotgun_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExtra: 'sfx_shotgun_pump',
    sfx: { fire: 'sfx_shotgun_fire', reload: 'sfx_reload_kinetic', extra: 'sfx_shotgun_pump' },
  },
  sniper_rifle: {
    id: 'sniper_rifle',
    idx: 15,
    category: 'kinetic',
    name: 'AWP Sniper Rifle',
    vnName: 'Súng Bắn Tỉa AWP',
    rarity: 'epic',
    slotHint: 1,
    fireMode: 'semi',
    damage: 95,
    armorMult: [1.0, 1.35],
    damagePair: [95, 128],
    critChance: 0.35,
    critMult: 2.1,
    knockback: 160,
    cooldownTicks: 26,
    cooldownMs: 860,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 6,
    reloadTicks: 48,
    reloadMs: 1600,
    sweetSpot: [0.48, 0.68],
    projKind: 'sniper_slug',
    projSpeed: 1550,
    projRadius: 4.5,
    range: 1200,
    baseSpreadDeg: 0.2,
    bloomPerShotDeg: 0.6,
    maxBloomDeg: 2.5,
    bloomDecayDegPerSec: 16,
    moveSpreadMult: 1.35,
    recoilKickPx: 11.0,
    camImpulsePx: 9.0,
    muzzleSnapDeg: 10,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_sniper_rifle',
    hotbarIcon: 'gun_sniper_rifle',
    anim: { frames: 3, cellW: 48, cellH: 18, offX: -12, offY: -9, fps: 24 },
    tracer: { color: '#fde047', core: '#ffffff', lenPx: 88, widthPx: 3.5, fadeMs: 110 },
    casing: { color: '#f59e0b', size: [6, 2], ejectDelayTicks: 10 },
    sfxFire: 'shot_sniper',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
    sfx: { fire: 'shot_sniper', reload: 'sfx_reload_kinetic' },
  },
  dual_pistols: {
    id: 'dual_pistols',
    idx: 18,
    category: 'kinetic',
    name: 'Dual Enforcers',
    vnName: 'Súng Lục Đôi',
    rarity: 'rare',
    slotHint: 0,
    fireMode: 'auto',
    damage: 16,
    armorMult: [1.05, 0.85],
    damagePair: [16.8, 13.6],
    critChance: 0.22,
    critMult: 1.65,
    knockback: 55,
    cooldownTicks: 4,
    cooldownMs: 133,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 2,
    energyCost: 0,
    magSize: 24,
    reloadTicks: 34,
    reloadMs: 1133,
    sweetSpot: [0.44, 0.68],
    projKind: 'kinetic_sm',
    projSpeed: 840,
    projRadius: 4,
    range: 700,
    baseSpreadDeg: 2.2,
    fanArcDeg: 5,
    bloomPerShotDeg: 1.1,
    maxBloomDeg: 6.5,
    bloomDecayDegPerSec: 18,
    moveSpreadMult: 1.12,
    recoilKickPx: 4.0,
    camImpulsePx: 2.4,
    muzzleSnapDeg: 6,
    muzzleOffset: [21, -2],
    spriteKey: 'gun_dual_pistols',
    hotbarIcon: 'gun_dual_pistols',
    anim: { frames: 3, cellW: 28, cellH: 18, offX: -7, offY: -9, fps: 30 },
    tracer: { color: '#fde047', core: '#ffffff', lenPx: 36, widthPx: 2.2, fadeMs: 75 },
    casing: { color: '#d4af37', size: [3, 2], ejectDelayTicks: 0 },
    sfxFire: 'sfx_pistol_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfx: { fire: 'sfx_pistol_fire', reload: 'sfx_reload_kinetic' },
  },
  minigun: {
    id: 'minigun',
    idx: 19,
    category: 'kinetic',
    name: 'Vulcan Minigun',
    vnName: 'Súng Máy Sáu Nòng',
    rarity: 'epic',
    slotHint: 1,
    fireMode: 'auto',
    damage: 14,
    armorMult: [1.0, 0.92],
    damagePair: [14, 12.9],
    critChance: 0.14,
    critMult: 1.6,
    knockback: 38,
    cooldownTicks: 2,
    cooldownMs: 67,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 80,
    reloadTicks: 54,
    reloadMs: 1800,
    sweetSpot: [0.46, 0.66],
    projKind: 'kinetic_md',
    projSpeed: 980,
    projRadius: 4,
    range: 780,
    baseSpreadDeg: 4.8,
    bloomPerShotDeg: 0.6,
    maxBloomDeg: 8.5,
    bloomDecayDegPerSec: 14,
    moveSpreadMult: 1.18,
    recoilKickPx: 3.2,
    camImpulsePx: 2.0,
    muzzleSnapDeg: 4,
    muzzleOffset: [38, 1],
    spriteKey: 'gun_minigun',
    hotbarIcon: 'gun_minigun',
    anim: { frames: 3, cellW: 44, cellH: 20, offX: -11, offY: -10, fps: 30 },
    tracer: { color: '#fb923c', core: '#fffbeb', lenPx: 44, widthPx: 2.5, fadeMs: 70 },
    casing: { color: '#f59e0b', size: [4, 2], ejectDelayTicks: 0 },
    sfxFire: 'sfx_smg_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfx: { fire: 'sfx_smg_fire', reload: 'sfx_reload_kinetic' },
  },
  saw_launcher: {
    id: 'saw_launcher',
    idx: 20,
    category: 'kinetic',
    name: 'Ricochet Ripper',
    vnName: 'Súng Bắn Đĩa Cưa',
    rarity: 'epic',
    slotHint: 1,
    fireMode: 'semi',
    damage: 44,
    armorMult: [1.0, 0.95],
    damagePair: [44, 41.8],
    critChance: 0.24,
    critMult: 1.75,
    knockback: 95,
    cooldownTicks: 10,
    cooldownMs: 333,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 12,
    reloadTicks: 38,
    reloadMs: 1267,
    sweetSpot: [0.46, 0.66],
    projKind: 'saw_disc',
    projSpeed: 820,
    projRadius: 9,
    range: 1150,
    dotOnHit: { kind: 'bleed', dps: 12, ms: 3000 },
    baseSpreadDeg: 0.8,
    bloomPerShotDeg: 1.2,
    maxBloomDeg: 4.0,
    bloomDecayDegPerSec: 16,
    moveSpreadMult: 1.1,
    recoilKickPx: 6.0,
    camImpulsePx: 4.5,
    muzzleSnapDeg: 7,
    muzzleOffset: [32, -1],
    spriteKey: 'gun_saw_launcher',
    hotbarIcon: 'gun_saw_launcher',
    anim: { frames: 3, cellW: 40, cellH: 20, offX: -10, offY: -10, fps: 24 },
    tracer: { color: '#e2e8f0', core: '#ffffff', lenPx: 30, widthPx: 3.5, fadeMs: 90 },
    casing: { color: '#94a3b8', size: [4, 4], ejectDelayTicks: 4 },
    sfxFire: 'sfx_shotgun_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'hit_flesh',
    sfx: { fire: 'sfx_shotgun_fire', reload: 'sfx_reload_kinetic' },
  },
  plasma_shotgun: {
    id: 'plasma_shotgun',
    idx: 24,
    category: 'kinetic',
    name: 'Plasma Shotgun',
    vnName: 'Shotgun Plasma Nhiệt',
    rarity: 'epic',
    slotHint: 1,
    fireMode: 'pump',
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 6,
    damage: 24,
    armorMult: [1.05, 1.35],
    damagePair: [25.2, 32.4],
    critChance: 0.14,
    critMult: 1.65,
    knockback: 185,
    energyCost: 4,
    magSize: 6,
    reloadMs: 1450,
    reloadTicks: 44,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 560,
    cooldownTicks: 17,
    projKind: 'plasma_pellet',
    projSpeed: 760,
    projRadius: 6,
    range: 460,
    baseSpreadDeg: 4.5,
    fanArcDeg: 28,
    bloomPerShotDeg: 2.0,
    maxBloomDeg: 7.0,
    bloomDecayDegPerSec: 10,
    moveSpreadMult: 1.15,
    dotOnHit: { kind: 'burn', dps: 10, ms: 2000 },
    recoilKickPx: 8.5,
    camImpulsePx: 6.0,
    muzzleSnapDeg: 10,
    muzzleOffset: [32, -1],
    spriteKey: 'gun_plasma_shotgun',
    hotbarIcon: 'gun_plasma_shotgun',
    anim: { frames: 3, cellW: 40, cellH: 18, offX: -10, offY: -9, fps: 22 },
    tracer: { color: '#f97316', core: '#ffedd5', lenPx: 28, widthPx: 4, fadeMs: 90 },
    casing: { color: '#fb923c', size: [4, 3], ejectDelayTicks: 3 },
    sfxFire: 'sfx_shotgun_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
    sfx: { fire: 'sfx_shotgun_fire', reload: 'sfx_reload_kinetic' },
  },
  twin_smg: {
    id: 'twin_smg',
    idx: 25,
    category: 'kinetic',
    name: 'Twin Viper SMG',
    vnName: 'Tiểu Liên Đôi Tốc Xạ',
    rarity: 'rare',
    slotHint: 2,
    fireMode: 'auto',
    burstCount: 2,
    burstStepTicks: 1,
    pellets: 1,
    damage: 14,
    armorMult: [1.20, 0.85],
    damagePair: [16.8, 11.9],
    critChance: 0.14,
    critMult: 1.60,
    knockback: 28,
    energyCost: 1,
    magSize: 48,
    reloadMs: 1200,
    reloadTicks: 36,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 75,
    cooldownTicks: 2,
    projKind: 'twin_smg_bullet',
    projSpeed: 980,
    projRadius: 4,
    range: 560,
    baseSpreadDeg: 3.4,
    bloomPerShotDeg: 0.5,
    maxBloomDeg: 8.0,
    bloomDecayDegPerSec: 18,
    moveSpreadMult: 1.15,
    recoilKickPx: 2.0,
    camImpulsePx: 1.2,
    muzzleSnapDeg: 3,
    muzzleOffset: [28, -1],
    spriteKey: 'gun_twin_smg',
    hotbarIcon: 'gun_twin_smg',
    anim: { frames: 3, cellW: 36, cellH: 16, offX: -8, offY: -8, fps: 26 },
    tracer: { color: '#38bdf8', core: '#ffffff', lenPx: 30, widthPx: 2.5, fadeMs: 75 },
    casing: { color: '#eab308', size: [3, 2], ejectDelayTicks: 1 },
    sfxFire: 'sfx_smg_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'hit_flesh',
    sfx: { fire: 'sfx_smg_fire', reload: 'sfx_reload_kinetic' },
  },
  ricochet_disc: {
    id: 'ricochet_disc',
    idx: 31,
    category: 'kinetic',
    name: 'Hyperion Ricochet',
    vnName: 'Súng Đĩa Nảy Phản Xạ',
    rarity: 'legendary',
    slotHint: 1,
    fireMode: 'semi',
    damage: 54,
    armorMult: [1.05, 1.0],
    damagePair: [56.7, 54],
    critChance: 0.28,
    critMult: 1.85,
    knockback: 85,
    cooldownTicks: 9,
    cooldownMs: 300,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 0,
    magSize: 14,
    reloadTicks: 38,
    reloadMs: 1267,
    sweetSpot: [0.46, 0.66],
    projKind: 'ricochet_blade',
    projSpeed: 900,
    projRadius: 8,
    range: 1350,
    dotOnHit: { kind: 'bleed', dps: 16, ms: 3000 },
    baseSpreadDeg: 0.6,
    bloomPerShotDeg: 1.0,
    maxBloomDeg: 3.5,
    bloomDecayDegPerSec: 16,
    moveSpreadMult: 1.08,
    recoilKickPx: 5.5,
    camImpulsePx: 4.0,
    muzzleSnapDeg: 6,
    muzzleOffset: [34, -1],
    spriteKey: 'gun_ricochet_disc',
    hotbarIcon: 'gun_ricochet_disc',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 24 },
    tracer: { color: '#c084fc', core: '#ffffff', lenPx: 30, widthPx: 3.5, fadeMs: 95 },
    casing: { color: '#cbd5e1', size: [4, 4], ejectDelayTicks: 4 },
    sfxFire: 'sfx_shotgun_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'hit_flesh',
    sfx: { fire: 'sfx_shotgun_fire', reload: 'sfx_reload_kinetic' },
  },
  phantom_bow: {
    id: 'phantom_bow',
    idx: 32,
    category: 'kinetic',
    name: 'Phantom Crescent Bow',
    vnName: 'Cung Bóng Ma Xuyên Phá',
    rarity: 'celestial',
    slotHint: 1,
    fireMode: 'semi',
    damage: 96,
    armorMult: [1.0, 1.25],
    damagePair: [96, 120],
    critChance: 0.42,
    critMult: 2.35,
    knockback: 110,
    cooldownTicks: 13,
    cooldownMs: 433,
    burstCount: 1,
    burstStepTicks: 0,
    pellets: 1,
    energyCost: 2,
    magSize: 10,
    reloadTicks: 34,
    reloadMs: 1133,
    sweetSpot: [0.46, 0.68],
    projKind: 'phantom_arrow',
    projSpeed: 1240,
    projRadius: 5,
    range: 920,
    armorPiercePct: 0.45,
    baseSpreadDeg: 0.25,
    bloomPerShotDeg: 0.6,
    maxBloomDeg: 2.5,
    bloomDecayDegPerSec: 18,
    moveSpreadMult: 1.05,
    recoilKickPx: 4.5,
    camImpulsePx: 3.5,
    muzzleSnapDeg: 4,
    muzzleOffset: [34, -2],
    spriteKey: 'gun_phantom_bow',
    hotbarIcon: 'gun_phantom_bow',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 22 },
    tracer: { color: '#a78bfa', core: '#f5f3ff', lenPx: 54, widthPx: 4, fadeMs: 120 },
    casing: { color: '#a78bfa', size: [3, 2], ejectDelayTicks: 2 },
    sfxFire: 'shot_sniper',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'hit_flesh',
    sfx: { fire: 'shot_sniper', reload: 'sfx_reload_kinetic' },
  },
} as const;

// --- d27: Explosive Weapons ---

export type BansungExplosiveFireMode = 'lob' | 'ripple_rocket' | 'mine';

/** Shared co-op & chain-detonation rules for all explosive weapons (d27). */
export const BANSUNG_EXPLOSIVE_COOP_RULES = {
  friendlyFire: false,
  selfDamagePct: 0,
  selfKnockbackPct: 0.35,
  lobAimMinPx: 80,
  lobAimMaxPx: 400,
  lobSpawnZ: 14,
  rocketSpawnZ: 16,
  lobGroundBounceVZMult: 0.45,
  lobGroundBounceHorizMult: 0.72,
  rocketMultiHitDecay: [1.0, 0.85, 0.70] as const,
  rocketMultiHitWindowMs: 150,
  maxMinesPerOwner: 8,
  maxMinesGlobal: 24,
  barrelChainDelayMs: 60,
  barrelMaxChainDepth: 4,
} as const;

/** Compute linear radial blast falloff from edge distance (d27). */
export function computeBlastFalloff(
  distEdge: number,
  coreR: number,
  blastR: number,
  minF: number
): number {
  if (distEdge <= coreR) return 1;
  if (distEdge >= blastR) return 0;
  const t = (distEdge - coreR) / Math.max(1, blastR - coreR);
  return 1 - t * (1 - minF);
}

export interface BansungExplosiveWeaponSpec extends BansungWeaponBase {
  id: BansungExplosiveWeaponId;
  category: 'explosive';
  fireMode: BansungExplosiveFireMode;
  spreadDeg: number;
  burstCount: number;
  burstIntervalMs: number;
  burstStepTicks: number;
  fanDeg: number;
  projKind: BansungProjectileKind;
  projSpeed: number;
  projAccel: number;
  projMaxSpeed: number;
  projRadius: number;
  gravityZ: number;
  initVZ: number;
  bouncesMax: number;
  restitution: number;
  contactDetonate: boolean;
  fuseMs: number;
  fuseTicks: number;
  blastRadius: number;
  coreRadius: number;
  outerFalloffMin: number;
  stunFalloffMin?: number;
  knockbackSpeed: number;
  stunMs: number;
  stunTicks: number;
  shrapnelCount: number;
  shrapnelDamage: number;
  shrapnelSpeed: number;
  shrapnelTtlMs: number;
  armDelayMs: number;
  triggerRadius: number;
  detonateDelayMs: number;
  maxActivePerOwner: number;
  mineTtlMs: number;
  recoilPush: number;
  camShakePx: number;
  sfxExplode: string;
}

export const BANSUNG_EXPLOSIVE_WEAPONS: Readonly<
  Record<BansungExplosiveWeaponId, BansungExplosiveWeaponSpec>
> = {
  grenade_launcher: {
    id: 'grenade_launcher',
    idx: 4,
    category: 'explosive',
    name: 'Frag Grenade Launcher',
    vnName: 'Súng Phóng Lựu Mảnh',
    rarity: 'uncommon',
    slotHint: 2,
    fireMode: 'lob',
    damage: 58,
    armorMult: [1.15, 0.85],
    damagePair: [66.7, 49.3],
    critChance: 0.08,
    critMult: 1.5,
    knockback: 340,
    energyCost: 4,
    magSize: 6,
    reloadMs: 1650,
    reloadTicks: 50,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 480,
    cooldownTicks: 14,
    spreadDeg: 3.5,
    burstCount: 1,
    burstIntervalMs: 0,
    burstStepTicks: 0,
    fanDeg: 0,
    projKind: 'frag_grenade',
    projSpeed: 460,
    projAccel: 0,
    projMaxSpeed: 460,
    projRadius: 6,
    range: 400,
    gravityZ: 680,
    initVZ: 210,
    bouncesMax: 1,
    restitution: 0.55,
    contactDetonate: true,
    fuseMs: 1100,
    fuseTicks: 33,
    blastRadius: 92,
    coreRadius: 34,
    outerFalloffMin: 0.40,
    knockbackSpeed: 340,
    stunMs: 0,
    stunTicks: 0,
    shrapnelCount: 6,
    shrapnelDamage: 9,
    shrapnelSpeed: 520,
    shrapnelTtlMs: 180,
    armDelayMs: 0,
    triggerRadius: 0,
    detonateDelayMs: 0,
    maxActivePerOwner: 0,
    mineTtlMs: 0,
    recoilPush: 30,
    recoilKickPx: 5.5,
    camImpulsePx: 4,
    camShakePx: 4,
    muzzleSnapDeg: 7,
    muzzleOffset: [24, -2],
    spriteKey: 'w_frag_launcher',
    hotbarIcon: 'w_frag_launcher',
    anim: { frames: 2, cellW: 32, cellH: 24, offX: -8, offY: -12, fps: 22 },
    sfxFire: 'sfx_gl_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_boom_heavy',
    sfxHit: 'sfx_boom_heavy',
  },
  stun_launcher: {
    id: 'stun_launcher',
    idx: 5,
    category: 'explosive',
    name: 'Stun Concussion Launcher',
    vnName: 'Súng Phóng Choáng',
    rarity: 'rare',
    slotHint: 2,
    fireMode: 'lob',
    damage: 26,
    armorMult: [0.85, 1.00],
    damagePair: [22.1, 26],
    critChance: 0.05,
    critMult: 1.5,
    knockback: 410,
    energyCost: 5,
    magSize: 4,
    reloadMs: 1750,
    reloadTicks: 53,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 620,
    cooldownTicks: 19,
    spreadDeg: 2.5,
    burstCount: 1,
    burstIntervalMs: 0,
    burstStepTicks: 0,
    fanDeg: 0,
    projKind: 'stun_canister',
    projSpeed: 500,
    projAccel: 0,
    projMaxSpeed: 500,
    projRadius: 6,
    range: 400,
    gravityZ: 680,
    initVZ: 195,
    bouncesMax: 1,
    restitution: 0.55,
    contactDetonate: true,
    fuseMs: 850,
    fuseTicks: 26,
    blastRadius: 128,
    coreRadius: 56,
    outerFalloffMin: 0.50,
    stunFalloffMin: 0.65,
    knockbackSpeed: 410,
    stunMs: 1800,
    stunTicks: 54,
    shrapnelCount: 0,
    shrapnelDamage: 0,
    shrapnelSpeed: 0,
    shrapnelTtlMs: 0,
    armDelayMs: 0,
    triggerRadius: 0,
    detonateDelayMs: 0,
    maxActivePerOwner: 0,
    mineTtlMs: 0,
    recoilPush: 35,
    recoilKickPx: 6.0,
    camImpulsePx: 5,
    camShakePx: 5,
    muzzleSnapDeg: 8,
    muzzleOffset: [24, -2],
    spriteKey: 'w_stun_launcher',
    hotbarIcon: 'w_stun_launcher',
    anim: { frames: 2, cellW: 32, cellH: 24, offX: -8, offY: -12, fps: 22 },
    sfxFire: 'sfx_stun_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_stun_burst',
    sfxHit: 'sfx_stun_burst',
  },
  bazooka: {
    id: 'bazooka',
    idx: 6,
    category: 'explosive',
    name: 'Triple Bazooka',
    vnName: 'Bazooka Tam Nòng',
    rarity: 'epic',
    slotHint: 3,
    fireMode: 'ripple_rocket',
    damage: 44,
    armorMult: [0.95, 1.35],
    damagePair: [41.8, 59.4],
    critChance: 0.10,
    critMult: 1.5,
    knockback: 280,
    energyCost: 8,
    magSize: 3,
    reloadMs: 2200,
    reloadTicks: 66,
    sweetSpot: [0.50, 0.70],
    cooldownMs: 950,
    cooldownTicks: 29,
    spreadDeg: 1.5,
    burstCount: 3,
    burstIntervalMs: 50,
    burstStepTicks: 2,
    fanDeg: 6,
    projKind: 'rocket',
    projSpeed: 340,
    projAccel: 900,
    projMaxSpeed: 640,
    projRadius: 7,
    range: 800,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    fuseMs: 1600,
    fuseTicks: 48,
    blastRadius: 76,
    coreRadius: 28,
    outerFalloffMin: 0.45,
    knockbackSpeed: 280,
    stunMs: 0,
    stunTicks: 0,
    shrapnelCount: 0,
    shrapnelDamage: 0,
    shrapnelSpeed: 0,
    shrapnelTtlMs: 0,
    armDelayMs: 0,
    triggerRadius: 0,
    detonateDelayMs: 0,
    maxActivePerOwner: 0,
    mineTtlMs: 0,
    recoilPush: 95,
    recoilKickPx: 10.0,
    camImpulsePx: 7,
    camShakePx: 7,
    muzzleSnapDeg: 12,
    muzzleOffset: [28, -2],
    spriteKey: 'w_triple_bazooka',
    hotbarIcon: 'w_triple_bazooka',
    anim: { frames: 2, cellW: 40, cellH: 24, offX: -12, offY: -12, fps: 16 },
    sfxFire: 'sfx_bazooka_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_boom_heavy',
    sfxHit: 'sfx_boom_heavy',
  },
  mine_gun: {
    id: 'mine_gun',
    idx: 7,
    category: 'explosive',
    name: 'Proximity Mine Gun',
    vnName: 'Súng Đặt Mìn Cảm Ứng',
    rarity: 'rare',
    slotHint: 3,
    fireMode: 'mine',
    damage: 72,
    armorMult: [1.10, 1.20],
    damagePair: [79.2, 86.4],
    critChance: 0.08,
    critMult: 1.5,
    knockback: 460,
    energyCost: 5,
    magSize: 5,
    reloadMs: 1800,
    reloadTicks: 54,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 520,
    cooldownTicks: 16,
    spreadDeg: 2.0,
    burstCount: 1,
    burstIntervalMs: 0,
    burstStepTicks: 0,
    fanDeg: 0,
    projKind: 'prox_mine',
    projSpeed: 380,
    projAccel: 0,
    projMaxSpeed: 380,
    projRadius: 7,
    range: 400,
    gravityZ: 720,
    initVZ: 130,
    bouncesMax: 0,
    restitution: 0.55,
    contactDetonate: false,
    fuseMs: 25000,
    fuseTicks: 750,
    blastRadius: 108,
    coreRadius: 42,
    outerFalloffMin: 0.45,
    knockbackSpeed: 460,
    stunMs: 350,
    stunTicks: 11,
    shrapnelCount: 0,
    shrapnelDamage: 0,
    shrapnelSpeed: 0,
    shrapnelTtlMs: 0,
    armDelayMs: 450,
    triggerRadius: 46,
    detonateDelayMs: 180,
    maxActivePerOwner: 8,
    mineTtlMs: 25000,
    recoilPush: 25,
    recoilKickPx: 4.5,
    camImpulsePx: 3,
    camShakePx: 3,
    muzzleSnapDeg: 6,
    muzzleOffset: [22, -2],
    spriteKey: 'w_mine_gun',
    hotbarIcon: 'w_mine_gun',
    anim: { frames: 2, cellW: 32, cellH: 24, offX: -8, offY: -12, fps: 22 },
    sfxFire: 'sfx_mine_deploy',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_boom_heavy',
    sfxExtra: 'sfx_mine_beep',
    sfxHit: 'sfx_boom_heavy',
  },
  cluster_rpg: {
    id: 'cluster_rpg',
    idx: 27,
    category: 'explosive',
    name: 'Cluster Hydra RPG',
    vnName: 'Tên Lửa Chùm RPG',
    rarity: 'legendary',
    slotHint: 3,
    fireMode: 'ripple_rocket',
    damage: 68,
    armorMult: [1.05, 1.35],
    damagePair: [71.4, 91.8],
    critChance: 0.14,
    critMult: 1.65,
    knockback: 340,
    energyCost: 8,
    magSize: 4,
    reloadMs: 1850,
    reloadTicks: 56,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 680,
    cooldownTicks: 20,
    spreadDeg: 1.2,
    burstCount: 1,
    burstIntervalMs: 0,
    burstStepTicks: 0,
    fanDeg: 0,
    projKind: 'cluster_rocket',
    projSpeed: 420,
    projAccel: 760,
    projMaxSpeed: 740,
    projRadius: 8,
    range: 860,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: true,
    fuseMs: 1650,
    fuseTicks: 50,
    blastRadius: 92,
    coreRadius: 34,
    outerFalloffMin: 0.45,
    knockbackSpeed: 340,
    stunMs: 220,
    stunTicks: 7,
    shrapnelCount: 4,
    shrapnelDamage: 26,
    shrapnelSpeed: 300,
    shrapnelTtlMs: 420,
    armDelayMs: 0,
    triggerRadius: 0,
    detonateDelayMs: 0,
    maxActivePerOwner: 0,
    mineTtlMs: 0,
    recoilPush: 80,
    recoilKickPx: 9.0,
    camImpulsePx: 6.5,
    camShakePx: 6.5,
    muzzleSnapDeg: 10,
    muzzleOffset: [32, -2],
    spriteKey: 'gun_cluster_rpg',
    hotbarIcon: 'gun_cluster_rpg',
    anim: { frames: 2, cellW: 42, cellH: 24, offX: -12, offY: -12, fps: 18 },
    sfxFire: 'sfx_bazooka_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_boom_heavy',
    sfxHit: 'sfx_boom_heavy',
  },
  orbital_cannon: {
    id: 'orbital_cannon',
    idx: 35,
    category: 'explosive',
    name: 'Orbital Obliterator',
    vnName: 'Pháo Quỹ Đạo Thần Sấm',
    rarity: 'mythic',
    slotHint: 2,
    fireMode: 'ripple_rocket',
    damage: 145,
    armorMult: [1.05, 1.4],
    damagePair: [152.25, 203],
    critChance: 0.22,
    critMult: 1.9,
    knockback: 420,
    energyCost: 10,
    magSize: 4,
    reloadMs: 1950,
    reloadTicks: 59,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 740,
    cooldownTicks: 22,
    spreadDeg: 0.8,
    burstCount: 1,
    burstIntervalMs: 0,
    burstStepTicks: 0,
    fanDeg: 0,
    projKind: 'orbital_shell',
    projSpeed: 520,
    projAccel: 820,
    projMaxSpeed: 880,
    projRadius: 11,
    range: 960,
    gravityZ: 0,
    initVZ: 0,
    bouncesMax: 0,
    restitution: 0,
    contactDetonate: false,
    fuseMs: 1750,
    fuseTicks: 53,
    blastRadius: 180,
    coreRadius: 56,
    outerFalloffMin: 0.45,
    knockbackSpeed: 420,
    stunMs: 560,
    stunTicks: 17,
    shrapnelCount: 6,
    shrapnelDamage: 28,
    shrapnelSpeed: 340,
    shrapnelTtlMs: 440,
    armDelayMs: 0,
    triggerRadius: 0,
    detonateDelayMs: 0,
    maxActivePerOwner: 0,
    mineTtlMs: 0,
    recoilPush: 95,
    recoilKickPx: 11.0,
    camImpulsePx: 8.5,
    camShakePx: 8.5,
    muzzleSnapDeg: 11,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_orbital_cannon',
    hotbarIcon: 'gun_orbital_cannon',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 22 },
    sfxFire: 'sfx_bazooka_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxExplode: 'sfx_boom_heavy',
    sfxHit: 'sfx_boom_heavy',
  },
} as const;

// --- d28: Energy & Magic Weapons ---

export type BansungEnergySubCategory = 'energy' | 'magic';

export interface BansungRailChargeConfig {
  minTapMult: number;
  minEnergyCost: number;
  fullEnergyCost: number;
  minHoldMs: number;
  fullHoldMs: number;
  moveMult: number;
  minPierce: number;
  maxPierce: number;
  fullCritBonus: number;
  fullStunMs: number;
  fullStunTicks: number;
}

export interface BansungHomingConfig {
  turnRateRadPerS: number;
  coneHalfDeg: number;
  coneCosThreshold: number;
  detectRangePx: number;
}

export interface BansungChainConfig {
  maxHops: number;
  radius: number;
  dmgDecay: number;
  hitStunMs: number;
  hitStunTicks: number;
  hopStunMs: number;
  hopStunTicks: number;
}

export interface BansungFireballSplashConfig {
  radius: number;
  edgeRatio: number;
  splitCount: number;
  splitAnglesDeg: readonly [number, number, number];
  emberKind: 'arcane_ember';
  emberDmg: readonly [light: number, armored: number];
  emberSpeed: number;
  emberRange: number;
  burnDps: number;
  burnMs: number;
  burnTickMs: number;
}

export interface BansungCritBurnConfig {
  dps: number;
  durationMs: number;
}

export interface BansungEnergyWeaponSpec extends BansungWeaponBase {
  id: BansungEnergyWeaponId;
  category: 'energy';
  subCategory: BansungEnergySubCategory;
  projKind:
    | 'plasma_bolt'
    | 'rail_beam'
    | 'thunder_orb'
    | 'arcane_fireball'
    | 'laser_map_beam'
    | 'electric_arc_bolt'
    | 'flame_stream_orb'
    | 'cryo_shard'
    | 'gravity_orb'
    | 'ion_lance'
    | 'tesla_arc'
    | 'void_cannon_orb'
    | 'blizzard_bolt'
    | 'magma_glob'
    | 'chronos_slug';
  projSpeed: number;
  projRadius: number;
  spreadDeg: number;
  minEnergyCost: number;
  armorPiercePct?: number;
  burstCount?: number;
  burstStepTicks?: number;
  charge?: BansungRailChargeConfig;
  homing?: BansungHomingConfig;
  chain?: BansungChainConfig;
  splash?: BansungFireballSplashConfig;
  critBurn?: BansungCritBurnConfig;
  slowOnHit?: { pct: number; ms: number; splashRadius?: number };
  gravityPull?: { radius: number; impulse: number; splashRadius: number };
  flameDot?: { dps: number; ms: number };
  sfxCharge?: string;
}

export const BANSUNG_ENERGY_WEAPONS: Readonly<
  Record<BansungEnergyWeaponId, BansungEnergyWeaponSpec>
> = {
  plasma_rifle: {
    id: 'plasma_rifle',
    idx: 8,
    category: 'energy',
    subCategory: 'energy',
    name: 'Plasma Rifle',
    vnName: 'Súng Plasma',
    rarity: 'uncommon',
    slotHint: 2,
    damage: 20,
    armorMult: [0.9, 1.2],
    damagePair: [18, 24],
    critChance: 0.15,
    critMult: 1.8,
    knockback: 45,
    energyCost: 2,
    minEnergyCost: 2,
    magSize: 24,
    reloadMs: 1250,
    reloadTicks: 38,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 150,
    cooldownTicks: 5,
    projKind: 'plasma_bolt',
    projSpeed: 680,
    projRadius: 5,
    range: 620,
    spreadDeg: 3.5,
    critBurn: { dps: 8, durationMs: 1500 },
    recoilKickPx: 3.5,
    camImpulsePx: 2.2,
    muzzleSnapDeg: 4,
    muzzleOffset: [30, 6],
    spriteKey: 'plasma_rifle',
    hotbarIcon: 'plasma_rifle',
    anim: { frames: 2, cellW: 32, cellH: 16, offX: -8, offY: -10, fps: 20 },
    sfxFire: 'wpn_plasma_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
  railgun: {
    id: 'railgun',
    idx: 9,
    category: 'energy',
    subCategory: 'energy',
    name: 'Railgun Piercer',
    vnName: 'Súng Điện Từ Xuyên Giáp',
    rarity: 'epic',
    slotHint: 3,
    damage: 100,
    armorMult: [0.62, 0.95],
    damagePair: [62, 95],
    critChance: 0.25,
    critMult: 2.0,
    knockback: 110,
    energyCost: 10,
    minEnergyCost: 6,
    magSize: 6,
    reloadMs: 1500,
    reloadTicks: 45,
    sweetSpot: [0.50, 0.66],
    cooldownMs: 480,
    cooldownTicks: 14,
    projKind: 'rail_beam',
    projSpeed: 0,
    projRadius: 10,
    range: 860,
    spreadDeg: 0,
    charge: {
      minTapMult: 0.55,
      minEnergyCost: 6,
      fullEnergyCost: 10,
      minHoldMs: 100,
      fullHoldMs: 650,
      moveMult: 0.78,
      minPierce: 3,
      maxPierce: 99,
      fullCritBonus: 0.25,
      fullStunMs: 450,
      fullStunTicks: 14,
    },
    recoilKickPx: 9.0,
    camImpulsePx: 7.0,
    muzzleSnapDeg: 9,
    muzzleOffset: [36, 7],
    spriteKey: 'railgun_piercer',
    hotbarIcon: 'railgun_piercer',
    anim: { frames: 3, cellW: 38, cellH: 16, offX: -9, offY: -10, fps: 18 },
    sfxFire: 'wpn_rail_fire',
    sfxCharge: 'wpn_rail_charge',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
  lightning_staff: {
    id: 'lightning_staff',
    idx: 10,
    category: 'energy',
    subCategory: 'magic',
    name: 'Lightning Staff',
    vnName: 'Quyền Trượng Sấm Sét',
    rarity: 'rare',
    slotHint: 3,
    damage: 20,
    armorMult: [1.3, 1.8],
    damagePair: [26, 36],
    critChance: 0.18,
    critMult: 1.75,
    knockback: 50,
    energyCost: 5,
    minEnergyCost: 5,
    magSize: 12,
    reloadMs: 1350,
    reloadTicks: 41,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 360,
    cooldownTicks: 11,
    projKind: 'thunder_orb',
    projSpeed: 460,
    projRadius: 8,
    range: 560,
    spreadDeg: 2.0,
    homing: {
      turnRateRadPerS: 1.6,
      coneHalfDeg: 55,
      coneCosThreshold: 0.57,
      detectRangePx: 180,
    },
    chain: {
      maxHops: 3,
      radius: 150,
      dmgDecay: 0.72,
      hitStunMs: 280,
      hitStunTicks: 8,
      hopStunMs: 120,
      hopStunTicks: 4,
    },
    recoilKickPx: 3.0,
    camImpulsePx: 2.5,
    muzzleSnapDeg: 5,
    muzzleOffset: [34, 7],
    spriteKey: 'lightning_staff',
    hotbarIcon: 'lightning_staff',
    anim: { frames: 2, cellW: 36, cellH: 14, offX: -10, offY: -7, fps: 16 },
    sfxFire: 'wpn_lightning_cast',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_thunder_arc',
  },
  arcane_book: {
    id: 'arcane_book',
    idx: 11,
    category: 'energy',
    subCategory: 'magic',
    name: 'Arcane Book',
    vnName: 'Ma Pháp Thư Hỏa Cầu',
    rarity: 'legendary',
    slotHint: 3,
    damage: 40,
    armorMult: [1.1, 0.75],
    damagePair: [44, 30],
    critChance: 0.20,
    critMult: 1.8,
    knockback: 75,
    energyCost: 7,
    minEnergyCost: 7,
    magSize: 10,
    reloadMs: 1400,
    reloadTicks: 42,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 420,
    cooldownTicks: 13,
    projKind: 'arcane_fireball',
    projSpeed: 420,
    projRadius: 9,
    range: 520,
    spreadDeg: 1.5,
    splash: {
      radius: 58,
      edgeRatio: 0.6,
      splitCount: 3,
      splitAnglesDeg: [-38, 0, 38],
      emberKind: 'arcane_ember',
      emberDmg: [12, 8],
      emberSpeed: 320,
      emberRange: 95,
      burnDps: 12,
      burnMs: 2500,
      burnTickMs: 500,
    },
    recoilKickPx: 0,
    camImpulsePx: 3.0,
    muzzleSnapDeg: 0,
    muzzleOffset: [16, 0],
    spriteKey: 'arcane_book',
    hotbarIcon: 'arcane_book',
    anim: { frames: 2, cellW: 20, cellH: 20, offX: -10, offY: -10, fps: 8 },
    sfxFire: 'wpn_arcane_cast',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_fireball_boom',
  },
  laser_cannon: {
    id: 'laser_cannon',
    idx: 16,
    category: 'energy',
    subCategory: 'energy',
    name: 'Orbital Laser Cannon',
    vnName: 'Súng Laze Xuyên Bản Đồ',
    rarity: 'legendary',
    slotHint: 3,
    damage: 145,
    armorMult: [1.0, 1.25],
    damagePair: [145, 181],
    critChance: 0.25,
    critMult: 1.9,
    knockback: 120,
    energyCost: 14,
    minEnergyCost: 10,
    magSize: 5,
    reloadMs: 1900,
    reloadTicks: 57,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 1450,
    cooldownTicks: 44,
    projKind: 'laser_map_beam',
    projSpeed: 0,
    projRadius: 16,
    range: 7800,
    spreadDeg: 0,
    recoilKickPx: 10.0,
    camImpulsePx: 8.5,
    muzzleSnapDeg: 8,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_laser_cannon',
    hotbarIcon: 'gun_laser_cannon',
    anim: { frames: 3, cellW: 44, cellH: 20, offX: -10, offY: -10, fps: 20 },
    sfxFire: 'sfx_wpn_laser',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'sfx_laser_beam',
  },
  electric_gun: {
    id: 'electric_gun',
    idx: 17,
    category: 'energy',
    subCategory: 'energy',
    name: 'Arc Tesla Rifle',
    vnName: 'Súng Điện Cao Áp',
    rarity: 'rare',
    slotHint: 3,
    damage: 28,
    armorMult: [1.15, 1.65],
    damagePair: [32.2, 46.2],
    critChance: 0.22,
    critMult: 1.8,
    knockback: 45,
    energyCost: 4,
    minEnergyCost: 4,
    magSize: 16,
    reloadMs: 1250,
    reloadTicks: 38,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 260,
    cooldownTicks: 8,
    projKind: 'electric_arc_bolt',
    projSpeed: 780,
    projRadius: 6,
    range: 680,
    spreadDeg: 1.6,
    homing: {
      turnRateRadPerS: 1.2,
      coneHalfDeg: 35,
      coneCosThreshold: 0.82,
      detectRangePx: 150,
    },
    chain: {
      maxHops: 4,
      radius: 190,
      dmgDecay: 0.78,
      hitStunMs: 360,
      hitStunTicks: 11,
      hopStunMs: 180,
      hopStunTicks: 6,
    },
    recoilKickPx: 4.0,
    camImpulsePx: 3.0,
    muzzleSnapDeg: 5,
    muzzleOffset: [34, -2],
    spriteKey: 'gun_electric_gun',
    hotbarIcon: 'gun_electric_gun',
    anim: { frames: 3, cellW: 40, cellH: 18, offX: -10, offY: -9, fps: 24 },
    sfxFire: 'sfx_shock_zap',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'stun_elec_arc',
  },
  flamethrower: {
    id: 'flamethrower',
    idx: 21,
    category: 'energy',
    subCategory: 'magic',
    name: 'Inferno Torch',
    vnName: 'Súng Phun Lửa Địa Ngục',
    rarity: 'epic',
    slotHint: 2,
    damage: 19,
    armorMult: [1.25, 0.8],
    damagePair: [23.8, 15.2],
    critChance: 0.16,
    critMult: 1.65,
    knockback: 22,
    energyCost: 1,
    minEnergyCost: 1,
    magSize: 45,
    reloadMs: 1350,
    reloadTicks: 41,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 100,
    cooldownTicks: 3,
    projKind: 'flame_stream_orb',
    projSpeed: 520,
    projRadius: 10,
    range: 360,
    spreadDeg: 6.5,
    flameDot: { dps: 14, ms: 3200 },
    critBurn: { dps: 20, durationMs: 3200 },
    recoilKickPx: 2.0,
    camImpulsePx: 1.5,
    muzzleSnapDeg: 3,
    muzzleOffset: [34, -1],
    spriteKey: 'gun_flamethrower',
    hotbarIcon: 'gun_flamethrower',
    anim: { frames: 3, cellW: 42, cellH: 18, offX: -10, offY: -9, fps: 24 },
    sfxFire: 'shot_flame',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'hit_flesh',
  },
  cryo_cannon: {
    id: 'cryo_cannon',
    idx: 22,
    category: 'energy',
    subCategory: 'energy',
    name: 'Cryo Zero Cannon',
    vnName: 'Pháo Băng Tuyệt Đối',
    rarity: 'celestial',
    slotHint: 3,
    damage: 52,
    armorMult: [1.1, 1.15],
    damagePair: [57.2, 59.8],
    critChance: 0.2,
    critMult: 1.8,
    knockback: 80,
    energyCost: 5,
    minEnergyCost: 4,
    magSize: 14,
    reloadMs: 1450,
    reloadTicks: 44,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 420,
    cooldownTicks: 13,
    projKind: 'cryo_shard',
    projSpeed: 740,
    projRadius: 7,
    range: 640,
    spreadDeg: 1.2,
    slowOnHit: { pct: 0.44, ms: 2800, splashRadius: 80 },
    recoilKickPx: 5.5,
    camImpulsePx: 4.0,
    muzzleSnapDeg: 6,
    muzzleOffset: [36, -2],
    spriteKey: 'gun_cryo_cannon',
    hotbarIcon: 'gun_cryo_cannon',
    anim: { frames: 3, cellW: 42, cellH: 18, offX: -10, offY: -9, fps: 22 },
    sfxFire: 'wpn_plasma_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
  gravity_gun: {
    id: 'gravity_gun',
    idx: 23,
    category: 'energy',
    subCategory: 'energy',
    name: 'Singularity Core',
    vnName: 'Súng Hố Đen Vũ Trụ',
    rarity: 'mythic',
    slotHint: 3,
    damage: 88,
    armorMult: [1.1, 1.15],
    damagePair: [96.8, 101.2],
    critChance: 0.26,
    critMult: 2.0,
    knockback: 0,
    energyCost: 10,
    minEnergyCost: 7,
    magSize: 6,
    reloadMs: 1750,
    reloadTicks: 53,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 760,
    cooldownTicks: 23,
    projKind: 'gravity_orb',
    projSpeed: 440,
    projRadius: 10,
    range: 760,
    spreadDeg: 0.5,
    gravityPull: { radius: 220, impulse: 420, splashRadius: 150 },
    recoilKickPx: 9.0,
    camImpulsePx: 7.5,
    muzzleSnapDeg: 9,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_gravity_gun',
    hotbarIcon: 'gun_gravity_gun',
    anim: { frames: 3, cellW: 44, cellH: 20, offX: -10, offY: -10, fps: 20 },
    sfxFire: 'sfx_wpn_plasma',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'sfx_fx_explosion',
  },
  ion_beam: {
    id: 'ion_beam',
    idx: 26,
    category: 'energy',
    subCategory: 'energy',
    name: 'Ion Lance Cannon',
    vnName: 'Pháo Chùm Ion Xuyên Thấu',
    rarity: 'epic',
    slotHint: 3,
    damage: 76,
    armorMult: [1.0, 1.45],
    damagePair: [76, 110.2],
    critChance: 0.24,
    critMult: 1.9,
    knockback: 90,
    energyCost: 7,
    minEnergyCost: 6,
    magSize: 10,
    reloadMs: 1400,
    reloadTicks: 42,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 420,
    cooldownTicks: 13,
    projKind: 'ion_lance',
    projSpeed: 0,
    projRadius: 12,
    range: 840,
    spreadDeg: 0,
    recoilKickPx: 7.0,
    camImpulsePx: 5.5,
    muzzleSnapDeg: 7,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_ion_beam',
    hotbarIcon: 'gun_ion_beam',
    anim: { frames: 3, cellW: 42, cellH: 18, offX: -10, offY: -9, fps: 22 },
    sfxFire: 'wpn_rail_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
  tesla_coil: {
    id: 'tesla_coil',
    idx: 28,
    category: 'energy',
    subCategory: 'energy',
    name: 'Tesla Storm Coil',
    vnName: 'Súng Cuộn Tesla Giật 5 Mục Tiêu',
    rarity: 'legendary',
    slotHint: 3,
    damage: 38,
    armorMult: [1.2, 1.65],
    damagePair: [45.6, 62.7],
    critChance: 0.22,
    critMult: 1.85,
    knockback: 55,
    energyCost: 4,
    minEnergyCost: 4,
    magSize: 22,
    reloadMs: 1300,
    reloadTicks: 39,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 260,
    cooldownTicks: 8,
    projKind: 'tesla_arc',
    projSpeed: 820,
    projRadius: 7,
    range: 640,
    spreadDeg: 1.5,
    homing: {
      turnRateRadPerS: 2.4,
      coneHalfDeg: 65,
      coneCosThreshold: 0.42,
      detectRangePx: 230,
    },
    chain: {
      maxHops: 5,
      radius: 195,
      dmgDecay: 0.85,
      hitStunMs: 320,
      hitStunTicks: 10,
      hopStunMs: 240,
      hopStunTicks: 8,
    },
    recoilKickPx: 4.0,
    camImpulsePx: 3.0,
    muzzleSnapDeg: 5,
    muzzleOffset: [36, -2],
    spriteKey: 'gun_tesla_coil',
    hotbarIcon: 'gun_tesla_coil',
    anim: { frames: 3, cellW: 42, cellH: 18, offX: -10, offY: -9, fps: 24 },
    sfxFire: 'shot_elec',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'stun_elec_arc',
  },
  void_cannon: {
    id: 'void_cannon',
    idx: 29,
    category: 'energy',
    subCategory: 'magic',
    name: 'Void Annihilator',
    vnName: 'Đại Bác Hư Không Hút Quái',
    rarity: 'mythic',
    slotHint: 3,
    damage: 112,
    armorMult: [1.2, 1.35],
    damagePair: [134.4, 151.2],
    critChance: 0.28,
    critMult: 2.1,
    knockback: 0,
    energyCost: 11,
    minEnergyCost: 8,
    magSize: 6,
    reloadMs: 1700,
    reloadTicks: 51,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 690,
    cooldownTicks: 21,
    projKind: 'void_cannon_orb',
    projSpeed: 480,
    projRadius: 12,
    range: 800,
    spreadDeg: 0.4,
    gravityPull: { radius: 260, impulse: 520, splashRadius: 175 },
    recoilKickPx: 10.5,
    camImpulsePx: 8.5,
    muzzleSnapDeg: 10,
    muzzleOffset: [40, -2],
    spriteKey: 'gun_void_cannon',
    hotbarIcon: 'gun_void_cannon',
    anim: { frames: 3, cellW: 46, cellH: 22, offX: -12, offY: -11, fps: 20 },
    sfxFire: 'sfx_wpn_plasma',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'sfx_fx_explosion',
  },
  blizzard_carbine: {
    id: 'blizzard_carbine',
    idx: 30,
    category: 'energy',
    subCategory: 'energy',
    name: 'Blizzard Pulse Carbine',
    vnName: 'Súng Xung Băng Giá',
    rarity: 'epic',
    slotHint: 3,
    damage: 28,
    armorMult: [1.05, 1.2],
    damagePair: [29.4, 33.6],
    critChance: 0.18,
    critMult: 1.75,
    knockback: 45,
    energyCost: 2,
    minEnergyCost: 1,
    magSize: 32,
    reloadMs: 1200,
    reloadTicks: 36,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 130,
    cooldownTicks: 4,
    projKind: 'blizzard_bolt',
    projSpeed: 860,
    projRadius: 6,
    range: 660,
    spreadDeg: 1.8,
    slowOnHit: { pct: 0.45, ms: 2600, splashRadius: 64 },
    recoilKickPx: 3.0,
    camImpulsePx: 2.0,
    muzzleSnapDeg: 4,
    muzzleOffset: [34, -2],
    spriteKey: 'gun_blizzard_carbine',
    hotbarIcon: 'gun_blizzard_carbine',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 24 },
    sfxFire: 'wpn_plasma_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
  magma_spitter: {
    id: 'magma_spitter',
    idx: 33,
    category: 'energy',
    subCategory: 'energy',
    name: 'Magma Core Cannon',
    vnName: 'Pháo Dung Nham Nung Chảy',
    rarity: 'legendary',
    slotHint: 3,
    damage: 46,
    armorMult: [1.0, 1.2],
    damagePair: [46, 55.2],
    critChance: 0.22,
    critMult: 1.85,
    knockback: 75,
    energyCost: 3,
    minEnergyCost: 2,
    magSize: 20,
    reloadMs: 1350,
    reloadTicks: 41,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 220,
    cooldownTicks: 7,
    projKind: 'magma_glob',
    projSpeed: 680,
    projRadius: 9,
    range: 620,
    spreadDeg: 2.2,
    flameDot: { dps: 22, ms: 3400 },
    critBurn: { dps: 28, durationMs: 3200 },
    recoilKickPx: 5.0,
    camImpulsePx: 3.8,
    muzzleSnapDeg: 6,
    muzzleOffset: [36, -2],
    spriteKey: 'gun_magma_spitter',
    hotbarIcon: 'gun_magma_spitter',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 22 },
    sfxFire: 'shot_flame',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'sfx_fx_explosion',
  },
  chronos_rifle: {
    id: 'chronos_rifle',
    idx: 34,
    category: 'energy',
    subCategory: 'energy',
    name: 'Chronos Dual-Burst Rifle',
    vnName: 'Súng Trường Thời Không ×2',
    rarity: 'celestial',
    slotHint: 3,
    damage: 42,
    armorMult: [1.05, 1.35],
    damagePair: [44.1, 56.7],
    critChance: 0.28,
    critMult: 2.0,
    knockback: 60,
    energyCost: 3,
    minEnergyCost: 2,
    magSize: 24,
    reloadMs: 1300,
    reloadTicks: 39,
    sweetSpot: [BANSUNG_RELOAD_SWEET_MIN, BANSUNG_RELOAD_SWEET_MAX],
    cooldownMs: 260,
    cooldownTicks: 8,
    burstCount: 2,
    burstStepTicks: 2,
    projKind: 'chronos_slug',
    projSpeed: 960,
    projRadius: 6,
    range: 780,
    spreadDeg: 0.9,
    armorPiercePct: 0.45,
    slowOnHit: { pct: 0.35, ms: 2200 },
    recoilKickPx: 4.5,
    camImpulsePx: 3.2,
    muzzleSnapDeg: 5,
    muzzleOffset: [38, -2],
    spriteKey: 'gun_chronos_rifle',
    hotbarIcon: 'gun_chronos_rifle',
    anim: { frames: 4, cellW: 38, cellH: 18, offX: -10, offY: -9, fps: 24 },
    sfxFire: 'wpn_rail_fire',
    sfxReload: 'sfx_reload_kinetic',
    sfxHit: 'fx_plasma_spark',
  },
} as const;

// --- d29: Melee & Bullet-Destruction Weapons ---

/** Swept-sector melee & bullet-slice constants at 30 Hz (d29). */
export const BANSUNG_MELEE_SWEEP_CONSTANTS = {
  padRad: 0.14,
  bulletPadRad: 0.12,
  bulletSliceRadiusPadPx: 4,
  spatialQueryPadPx: 36,
  shoulderOffsetY: -14,
  maxSliceFxPerPlayerPerTick: 6,
  hitstopMinMultiKills: 3,
  hitstopMs: 30,
  bossStunScale: 0.35,
} as const;

export interface BansungMeleeWeaponSpec extends BansungWeaponBase {
  id: BansungMeleeWeaponId;
  category: 'melee';
  dryDamageMult: number;
  crateMult: number;
  windupTicks: number;
  activeTicks: number;
  recoveryTicks: number;
  reach: number;
  arcDeg: number;
  lungePx: number;
  canDestroyBullets: boolean;
  bulletEnergyGain: number;
  maxBulletEnergy: number;
  stunTicks: number;
  chainRange: number;
  chainDmg: number;
  chainStunTicks: number;
  slashFxKey: string;
  slashAnim: BansungSpriteAnimMeta;
  slashTint: string;
}

export const BANSUNG_MELEE_WEAPONS: Readonly<
  Record<BansungMeleeWeaponId, BansungMeleeWeaponSpec>
> = {
  crescent_blade: {
    id: 'crescent_blade',
    idx: 12,
    category: 'melee',
    name: 'Crescent Blade',
    vnName: 'Nguyệt Đao',
    rarity: 'common',
    slotHint: 4,
    damage: 28,
    armorMult: [1.25, 0.85],
    damagePair: [35, 23.8],
    crateMult: 1.0,
    critChance: 0.15,
    critMult: 1.60,
    knockback: 140,
    energyCost: 0,
    dryDamageMult: 1.0,
    magSize: 0,
    reloadTicks: 0,
    reloadMs: 0,
    sweetSpot: [0, 0],
    cooldownTicks: 9,
    cooldownMs: 300,
    windupTicks: 1,
    activeTicks: 3,
    recoveryTicks: 2,
    reach: 68,
    range: 68,
    arcDeg: 130,
    lungePx: 6,
    canDestroyBullets: true,
    bulletEnergyGain: 0,
    maxBulletEnergy: 0,
    stunTicks: 0,
    chainRange: 0,
    chainDmg: 0,
    chainStunTicks: 0,
    recoilKickPx: 0,
    camImpulsePx: 2.0,
    muzzleSnapDeg: 0,
    muzzleOffset: [0, -14],
    spriteKey: 'wpn_crescent_blade',
    hotbarIcon: 'wpn_crescent_blade',
    anim: { frames: 4, cellW: 48, cellH: 48, offX: -10, offY: -24, fps: 30 },
    slashFxKey: 'fx_slash_crescent',
    slashAnim: { frames: 4, cellW: 96, cellH: 96, offX: -48, offY: -48, fps: 30 },
    slashTint: '#74c0fc',
    sfxFire: 'sfx_melee_crescent',
    sfxReload: '',
    sfxHit: 'sfx_bullet_slice',
  },
  reaper_scythe: {
    id: 'reaper_scythe',
    idx: 13,
    category: 'melee',
    name: 'Reaper Scythe',
    vnName: 'Lưỡi Hái Tử Thần',
    rarity: 'epic',
    slotHint: 4,
    damage: 52,
    armorMult: [1.15, 1.10],
    damagePair: [59.8, 57.2],
    crateMult: 1.5,
    critChance: 0.12,
    critMult: 1.75,
    knockback: 220,
    energyCost: 2,
    dryDamageMult: 0.60,
    magSize: 0,
    reloadTicks: 0,
    reloadMs: 0,
    sweetSpot: [0, 0],
    cooldownTicks: 18,
    cooldownMs: 600,
    windupTicks: 3,
    activeTicks: 5,
    recoveryTicks: 4,
    reach: 112,
    range: 112,
    arcDeg: 220,
    lungePx: 4,
    canDestroyBullets: true,
    bulletEnergyGain: 1,
    maxBulletEnergy: 4,
    stunTicks: 0,
    chainRange: 0,
    chainDmg: 0,
    chainStunTicks: 0,
    recoilKickPx: 0,
    camImpulsePx: 4.5,
    muzzleSnapDeg: 0,
    muzzleOffset: [0, -14],
    spriteKey: 'wpn_reaper_scythe',
    hotbarIcon: 'wpn_reaper_scythe',
    anim: { frames: 4, cellW: 64, cellH: 64, offX: -14, offY: -32, fps: 30 },
    slashFxKey: 'fx_slash_scythe',
    slashAnim: { frames: 6, cellW: 160, cellH: 160, offX: -80, offY: -80, fps: 30 },
    slashTint: '#e64980',
    sfxFire: 'sfx_melee_scythe',
    sfxReload: '',
    sfxHit: 'sfx_bullet_slice',
  },
  shock_baton: {
    id: 'shock_baton',
    idx: 14,
    category: 'melee',
    name: 'Shock Baton',
    vnName: 'Dùi Cui Điện',
    rarity: 'rare',
    slotHint: 4,
    damage: 22,
    armorMult: [0.95, 1.35],
    damagePair: [20.9, 29.7],
    crateMult: 1.0,
    critChance: 0.10,
    critMult: 1.50,
    knockback: 90,
    energyCost: 2,
    dryDamageMult: 0.65,
    magSize: 0,
    reloadTicks: 0,
    reloadMs: 0,
    sweetSpot: [0, 0],
    cooldownTicks: 12,
    cooldownMs: 400,
    windupTicks: 1,
    activeTicks: 3,
    recoveryTicks: 2,
    reach: 60,
    range: 60,
    arcDeg: 100,
    lungePx: 14,
    canDestroyBullets: true,
    bulletEnergyGain: 0,
    maxBulletEnergy: 0,
    stunTicks: 36,
    chainRange: 55,
    chainDmg: 10,
    chainStunTicks: 15,
    recoilKickPx: 0,
    camImpulsePx: 2.5,
    muzzleSnapDeg: 0,
    muzzleOffset: [0, -14],
    spriteKey: 'wpn_shock_baton',
    hotbarIcon: 'wpn_shock_baton',
    anim: { frames: 4, cellW: 48, cellH: 48, offX: -10, offY: -24, fps: 30 },
    slashFxKey: 'fx_slash_shock',
    slashAnim: { frames: 4, cellW: 96, cellH: 96, offX: -48, offY: -48, fps: 30 },
    slashTint: '#3bc9db',
    sfxFire: 'sfx_melee_baton',
    sfxReload: '',
    sfxHit: 'sfx_shock_zap',
  },
} as const;

export type BansungWeaponSpec =
  | BansungKineticWeaponSpec
  | BansungExplosiveWeaponSpec
  | BansungEnergyWeaponSpec
  | BansungMeleeWeaponSpec;

/** Unified registry of all 18 Ban Sung weapons keyed by canonical BansungWeaponId. */
export const BANSUNG_WEAPONS: Readonly<Record<BansungWeaponId, BansungWeaponSpec>> = {
  ...BANSUNG_KINETIC_WEAPONS,
  ...BANSUNG_EXPLOSIVE_WEAPONS,
  ...BANSUNG_ENERGY_WEAPONS,
  ...BANSUNG_MELEE_WEAPONS,
} as const;

const WEAPON_BY_IDX: readonly BansungWeaponSpec[] = [
  BANSUNG_KINETIC_WEAPONS.pistol,
  BANSUNG_KINETIC_WEAPONS.rifle,
  BANSUNG_KINETIC_WEAPONS.smg,
  BANSUNG_KINETIC_WEAPONS.shotgun,
  BANSUNG_EXPLOSIVE_WEAPONS.grenade_launcher,
  BANSUNG_EXPLOSIVE_WEAPONS.stun_launcher,
  BANSUNG_EXPLOSIVE_WEAPONS.bazooka,
  BANSUNG_EXPLOSIVE_WEAPONS.mine_gun,
  BANSUNG_ENERGY_WEAPONS.plasma_rifle,
  BANSUNG_ENERGY_WEAPONS.railgun,
  BANSUNG_ENERGY_WEAPONS.lightning_staff,
  BANSUNG_ENERGY_WEAPONS.arcane_book,
  BANSUNG_MELEE_WEAPONS.crescent_blade,
  BANSUNG_MELEE_WEAPONS.reaper_scythe,
  BANSUNG_MELEE_WEAPONS.shock_baton,
  BANSUNG_KINETIC_WEAPONS.sniper_rifle,
  BANSUNG_ENERGY_WEAPONS.laser_cannon,
  BANSUNG_ENERGY_WEAPONS.electric_gun,
  BANSUNG_KINETIC_WEAPONS.dual_pistols,
  BANSUNG_KINETIC_WEAPONS.minigun,
  BANSUNG_KINETIC_WEAPONS.saw_launcher,
  BANSUNG_ENERGY_WEAPONS.flamethrower,
  BANSUNG_ENERGY_WEAPONS.cryo_cannon,
  BANSUNG_ENERGY_WEAPONS.gravity_gun,
  BANSUNG_KINETIC_WEAPONS.plasma_shotgun,
  BANSUNG_KINETIC_WEAPONS.twin_smg,
  BANSUNG_ENERGY_WEAPONS.ion_beam,
  BANSUNG_EXPLOSIVE_WEAPONS.cluster_rpg,
  BANSUNG_ENERGY_WEAPONS.tesla_coil,
  BANSUNG_ENERGY_WEAPONS.void_cannon,
  BANSUNG_ENERGY_WEAPONS.blizzard_carbine,
  BANSUNG_KINETIC_WEAPONS.ricochet_disc,
  BANSUNG_KINETIC_WEAPONS.phantom_bow,
  BANSUNG_ENERGY_WEAPONS.magma_spitter,
  BANSUNG_ENERGY_WEAPONS.chronos_rifle,
  BANSUNG_EXPLOSIVE_WEAPONS.orbital_cannon,
] as const;

export function getWeaponSpec(id: BansungWeaponId): BansungWeaponSpec {
  return BANSUNG_WEAPONS[id];
}

export function getWeaponByIdx(idx: number): BansungWeaponSpec | undefined {
  return WEAPON_BY_IDX[idx];
}

// ============================================================================
// 4. Active Gadgets: Bombs, Turret & Healing Drone (d30)
// ============================================================================

export type BansungGadgetKind = 'thrown' | 'deployable';
export type GadgetFxType =
  | 'stun_blast'
  | 'cluster_blast'
  | 'turret_thunder'
  | 'drone_pulse';

export interface BansungGadgetClusterConfig {
  count: number;
  projKind: 'cluster_sub_proj';
  radius: number;
  damage: readonly [light: number, armored: number];
  knockback: number;
  minDist: number;
  maxDist: number;
  minFlightTicks: number;
  maxFlightTicks: number;
  peakZ: number;
  maxFuseJitterTicks: number;
  multiHitClamp: readonly [first: number, second: number, third: number];
  maxHitsPerTarget: number;
}

export interface BansungTurretConfig {
  deployOffsetPx: number;
  hp: number;
  bodyRadius: number;
  armor: number;
  armorType: 'armored';
  aggroDecoyClearRadius: number;
  fireIntervalTicks: number;
  projKind: 'turret_bolt';
  projSpeed: number;
  spreadRad: number;
  hysteresisPct: number;
  overchargeInterval: number;
  overchargeProjKind: 'turret_thunder';
  overchargeDamage: readonly [light: number, armored: number];
  overchargeSplashRadius: number;
  overchargeStunTicks: number;
  expiryBlastDamage: readonly [light: number, armored: number];
  expiryBlastRadius: number;
}

export interface BansungHealDroneConfig {
  followBehindPx: number;
  hoverZ: number;
  hoverBobAmpPx: number;
  hoverBobHz: number;
  springK: number;
  healIntervalTicks: number;
  healHp: number;
  healArmor: number;
  turretHealMult: number;
  coopBonusRadius: number;
  coopBonusMult: number;
  downedBleedSlowMult: number;
  downedReviveSpeedBonus: number;
  energyPulseIntervalTicks: number;
  energyPulseRadius: number;
  energyPulseAmount: number;
}

export interface BansungGadgetSpec {
  id: BansungGadgetId;
  idx: 0 | 1 | 2 | 3;
  kind: BansungGadgetKind;
  name: string;
  vnName: string;
  energyCost: number;
  cooldownTicks: number;
  cooldownMs: number;
  maxCharges: number;
  maxActive: number;
  minRange: number;
  maxRange: number;
  radius: number;
  damage: readonly [light: number, armored: number];
  knockback: number;
  stunTicks?: number;
  eliteStunTicks?: number;
  bossStunTicks?: number;
  accuracyDebuffTicks?: number;
  accuracyDebuffMult?: number;
  durationTicks?: number;
  projKind?: BansungProjectileKind;
  throwSpeed?: number;
  minFlightTicks?: number;
  maxFlightTicks?: number;
  peakZ?: number;
  bounceTicks?: number;
  fuseTicks?: number;
  cluster?: BansungGadgetClusterConfig;
  turret?: BansungTurretConfig;
  drone?: BansungHealDroneConfig;
  spriteKey: string;
  sfxDeploy: string;
  sfxTrigger: string;
  sfxExtra?: string;
}

export type BansungGadgetDef = BansungGadgetSpec;

export interface BansungGadgetHud {
  id: BansungGadgetId;
  charges: number;
  maxCharges: number;
  cdLeftMs: number;
  cdTotalMs: number;
  active: number;
}

export interface BansungPlayerGadgetSlot {
  id: BansungGadgetId;
  charges: number;
  cdTicksLeft: number;
}

export interface BansungGadgetProjState {
  id: number;
  ownerIdx: number;
  kind: 0 | 1 | 2;
  clusterGroupId: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  z: number;
  tick: number;
  flightTicks: number;
  fuseTicks: number;
  peakZ: number;
}

export interface BansungGadgetDeployableState {
  id: number;
  ownerIdx: number;
  kind: 0 | 1; // 0 = auto_turret, 1 = heal_drone
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  lifeTicks: number;
  maxLifeTicks: number;
  aimRad: number;
  actionCdTicks: number;
  shotSeq: number;
  targetId: number;
  pulseTicks: number;
}

/** Unified registry of all 4 active gadgets keyed by canonical BansungGadgetId. */
export const BANSUNG_GADGETS: Readonly<Record<BansungGadgetId, BansungGadgetSpec>> = {
  stun_bomb: {
    id: 'stun_bomb',
    idx: 0,
    kind: 'thrown',
    name: 'Concussion Stun Bomb',
    vnName: 'Lựu Đạn Choáng',
    energyCost: 15,
    cooldownTicks: 240,
    cooldownMs: 8000,
    maxCharges: 2,
    maxActive: 4,
    minRange: 48,
    maxRange: 340,
    radius: 135,
    damage: [22, 14],
    knockback: 180,
    stunTicks: 66,
    eliteStunTicks: 42,
    bossStunTicks: 24,
    accuracyDebuffTicks: 45,
    accuracyDebuffMult: 0.65,
    projKind: 'stun_bomb_proj',
    throwSpeed: 420,
    minFlightTicks: 10,
    maxFlightTicks: 24,
    peakZ: 56,
    bounceTicks: 4,
    spriteKey: 'gadget_stun_bomb',
    sfxDeploy: 'gadget_throw',
    sfxTrigger: 'gadget_stun_pop',
  },
  cluster_bomb: {
    id: 'cluster_bomb',
    idx: 1,
    kind: 'thrown',
    name: 'Cluster HE Bomb',
    vnName: 'Bom Chùm Nổ Mảnh',
    energyCost: 25,
    cooldownTicks: 360,
    cooldownMs: 12000,
    maxCharges: 2,
    maxActive: 6,
    minRange: 56,
    maxRange: 320,
    radius: 105,
    damage: [65, 95],
    knockback: 240,
    projKind: 'cluster_bomb_proj',
    throwSpeed: 400,
    minFlightTicks: 12,
    maxFlightTicks: 26,
    peakZ: 64,
    fuseTicks: 6,
    cluster: {
      count: 5,
      projKind: 'cluster_sub_proj',
      radius: 68,
      damage: [32, 45],
      knockback: 130,
      minDist: 55,
      maxDist: 95,
      minFlightTicks: 11,
      maxFlightTicks: 15,
      peakZ: 34,
      maxFuseJitterTicks: 4,
      multiHitClamp: [1.0, 0.5, 0.5],
      maxHitsPerTarget: 3,
    },
    spriteKey: 'gadget_cluster_bomb',
    sfxDeploy: 'gadget_throw',
    sfxTrigger: 'gadget_cluster_boom',
  },
  auto_turret: {
    id: 'auto_turret',
    idx: 2,
    kind: 'deployable',
    name: 'Auto-Turret',
    vnName: 'Trụ Súng Tự Động',
    energyCost: 30,
    cooldownTicks: 480,
    cooldownMs: 16000,
    maxCharges: 1,
    maxActive: 1,
    minRange: 24,
    maxRange: 72,
    radius: 290,
    damage: [14, 18],
    knockback: 40,
    durationTicks: 540,
    turret: {
      deployOffsetPx: 28,
      hp: 180,
      bodyRadius: 14,
      armor: 1,
      armorType: 'armored',
      aggroDecoyClearRadius: 90,
      fireIntervalTicks: 7,
      projKind: 'turret_bolt',
      projSpeed: 680,
      spreadRad: 0.04,
      hysteresisPct: 0.15,
      overchargeInterval: 6,
      overchargeProjKind: 'turret_thunder',
      overchargeDamage: [28, 34],
      overchargeSplashRadius: 48,
      overchargeStunTicks: 14,
      expiryBlastDamage: [25, 30],
      expiryBlastRadius: 60,
    },
    spriteKey: 'gadget_auto_turret',
    sfxDeploy: 'gadget_turret_deploy',
    sfxTrigger: 'gadget_turret_shot',
    sfxExtra: 'gadget_turret_thunder',
  },
  heal_drone: {
    id: 'heal_drone',
    idx: 3,
    kind: 'deployable',
    name: 'Healing Drone',
    vnName: 'Drone Hồi Máu',
    energyCost: 25,
    cooldownTicks: 540,
    cooldownMs: 18000,
    maxCharges: 1,
    maxActive: 1,
    minRange: 0,
    maxRange: 48,
    radius: 190,
    damage: [0, 0],
    knockback: 0,
    durationTicks: 420,
    drone: {
      followBehindPx: 24,
      hoverZ: 26,
      hoverBobAmpPx: 3,
      hoverBobHz: 2,
      springK: 0.18,
      healIntervalTicks: 10,
      healHp: 4,
      healArmor: 2,
      turretHealMult: 0.5,
      coopBonusRadius: 150,
      coopBonusMult: 1.15,
      downedBleedSlowMult: 0.5,
      downedReviveSpeedBonus: 0.25,
      energyPulseIntervalTicks: 105,
      energyPulseRadius: 150,
      energyPulseAmount: 6,
    },
    spriteKey: 'gadget_heal_drone',
    sfxDeploy: 'gadget_drone_deploy',
    sfxTrigger: 'gadget_drone_pulse',
  },
} as const;

const GADGET_BY_IDX: readonly BansungGadgetSpec[] = [
  BANSUNG_GADGETS.stun_bomb,
  BANSUNG_GADGETS.cluster_bomb,
  BANSUNG_GADGETS.auto_turret,
  BANSUNG_GADGETS.heal_drone,
] as const;

export function getGadgetSpec(id: BansungGadgetId): BansungGadgetSpec {
  return BANSUNG_GADGETS[id];
}

export function getGadgetByIdx(idx: number): BansungGadgetSpec | undefined {
  return GADGET_BY_IDX[idx];
}

// ============================================================================
// 5. Gun Evolution Tier System (Survival Mk.I -> Mk.IV)
// ============================================================================

export const BANSUNG_WEAPON_MAX_TIER = 4 as const;
export type BansungWeaponTier = 1 | 2 | 3 | 4;

export interface BansungWeaponTierSpec {
  tier: BansungWeaponTier;
  rarity: BansungGachaRarity;
  badge: string;
  enName: string;
  vnName: string;
  enPrefix: string;
  vnPrefix: string;
  dmgMult: number;
  fireRateMult: number;
  extraProjectiles: number;
  extraPierce: number;
  energyCostMult: number;
  blastRadiusMult: number;
  barrelCount: number;
  muzzleScale: number;
  auraColor: string;
  tracerColor: string;
  barrelAccentColor: string;
  glowAlpha: number;
}

/**
 * Four-tier Gun Evolution scaling table (Mk.I -> Mk.IV Mythic).
 * Used both by authoritative server combat and client dual-layer gun/tracer rendering.
 */
export const BANSUNG_WEAPON_TIERS: Readonly<
  Record<BansungWeaponTier, BansungWeaponTierSpec>
> = {
  1: {
    tier: 1,
    rarity: 'common',
    badge: 'Mk.I',
    enName: 'Base Mk.I',
    vnName: 'Cơ Bản Mk.I',
    enPrefix: 'Mk.I',
    vnPrefix: '',
    dmgMult: 1.0,
    fireRateMult: 1.0,
    extraProjectiles: 0,
    extraPierce: 0,
    energyCostMult: 1.0,
    blastRadiusMult: 1.0,
    barrelCount: 1,
    muzzleScale: 1.0,
    auraColor: '#94a3b8',
    tracerColor: '#94a3b8',
    barrelAccentColor: '#94a3b8',
    glowAlpha: 0,
  },
  2: {
    tier: 2,
    rarity: 'rare',
    badge: 'Mk.II',
    enName: 'Mk.II Overclocked',
    vnName: 'Cường Hóa Mk.II',
    enPrefix: 'Mk.II Overclocked',
    vnPrefix: 'Cường Hóa',
    dmgMult: 1.32,
    fireRateMult: 1.15,
    extraProjectiles: 1,
    extraPierce: 1,
    energyCostMult: 0.92,
    blastRadiusMult: 1.12,
    barrelCount: 1,
    muzzleScale: 1.2,
    auraColor: '#38bdf8',
    tracerColor: '#38bdf8',
    barrelAccentColor: '#38bdf8',
    glowAlpha: 0.28,
  },
  3: {
    tier: 3,
    rarity: 'epic',
    badge: 'Mk.III',
    enName: 'Mk.III Awakened',
    vnName: 'Thức Tỉnh Mk.III',
    enPrefix: 'Mk.III Awakened',
    vnPrefix: 'Thức Tỉnh',
    dmgMult: 1.72,
    fireRateMult: 1.30,
    extraProjectiles: 2,
    extraPierce: 1,
    energyCostMult: 0.82,
    blastRadiusMult: 1.25,
    barrelCount: 2,
    muzzleScale: 1.4,
    auraColor: '#c084fc',
    tracerColor: '#c084fc',
    barrelAccentColor: '#c084fc',
    glowAlpha: 0.48,
  },
  4: {
    tier: 4,
    rarity: 'legendary',
    badge: 'Mk.IV',
    enName: 'Mk.IV Mythic',
    vnName: 'Tối Thượng Mk.IV',
    enPrefix: 'Mk.IV Mythic',
    vnPrefix: 'Tối Thượng',
    dmgMult: 2.25,
    fireRateMult: 1.48,
    extraProjectiles: 3,
    extraPierce: 2,
    energyCostMult: 0.70,
    blastRadiusMult: 1.40,
    barrelCount: 3,
    muzzleScale: 1.65,
    auraColor: '#fbbf24',
    tracerColor: '#fbbf24',
    barrelAccentColor: '#fbbf24',
    glowAlpha: 0.72,
  },
} as const;

/** Clamp an arbitrary tier input into `[1, BANSUNG_WEAPON_MAX_TIER]`. */
export function normalizeWeaponTier(tier?: number): BansungWeaponTier {
  const n = Math.floor(Number(tier) || 1);
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 4;
}

export interface BansungWeaponEvolutionStats {
  weaponId: BansungWeaponId;
  tier: BansungWeaponTier;
  tierSpec: BansungWeaponTierSpec;
  name: string;
  vnName: string;
  badge: string;
  dmgMult: number;
  fireRateMult: number;
  cooldownTicks: number;
  energyCost: number;
  energyCostMult: number;
  extraProjectiles: number;
  totalProjectiles: number;
  extraPierce: number;
  blastRadiusMult: number;
  meleeReachMult: number;
  meleeArcBonusDeg: number;
  barrelCount: number;
  barrelAccentColor: string;
  muzzleScale: number;
  auraColor: string;
  tracerColor: string;
  glowAlpha: number;
}

/**
 * Resolve evolved display names, combat multipliers, and visual rig accents
 * for a given weapon at `tier` (1..4).
 */
export function getWeaponEvolutionStats(
  weaponId: BansungWeaponId,
  tier: number
): BansungWeaponEvolutionStats {
  const t = normalizeWeaponTier(tier);
  const tierSpec = BANSUNG_WEAPON_TIERS[t];
  const spec = BANSUNG_WEAPONS[weaponId] ?? BANSUNG_WEAPONS.pistol;

  const baseCooldown = Math.max(1, spec.cooldownTicks);
  const cooldownTicks = Math.max(1, Math.round(baseCooldown / tierSpec.fireRateMult));
  const energyCost =
    spec.energyCost <= 0
      ? 0
      : Math.max(1, Math.round(spec.energyCost * tierSpec.energyCostMult));

  let baseProj = 1;
  if (spec.category === 'kinetic') {
    baseProj = spec.pellets;
  } else if (spec.category === 'explosive') {
    baseProj = spec.burstCount;
  } else if (spec.category === 'melee') {
    baseProj = 0;
  }

  let baseTracerColor = tierSpec.tracerColor;
  if (t === 1) {
    if (spec.category === 'kinetic') {
      baseTracerColor = spec.tracer.color;
    } else if (spec.category === 'melee') {
      baseTracerColor = spec.slashTint;
    } else {
      baseTracerColor =
        BANSUNG_PROJECTILE_CONFIGS[spec.projKind]?.tracer?.color ?? tierSpec.tracerColor;
    }
  }

  return {
    weaponId: spec.id,
    tier: t,
    tierSpec,
    name: t === 1 ? spec.name : `${tierSpec.enPrefix} ${spec.name}`,
    vnName: t === 1 ? spec.vnName : `${tierSpec.vnPrefix} ${spec.vnName}`,
    badge: tierSpec.badge,
    dmgMult: tierSpec.dmgMult,
    fireRateMult: tierSpec.fireRateMult,
    cooldownTicks,
    energyCost,
    energyCostMult: tierSpec.energyCostMult,
    extraProjectiles: tierSpec.extraProjectiles,
    totalProjectiles: baseProj + tierSpec.extraProjectiles,
    extraPierce: tierSpec.extraPierce,
    blastRadiusMult: tierSpec.blastRadiusMult,
    meleeReachMult: tierSpec.blastRadiusMult,
    meleeArcBonusDeg: (t - 1) * 18,
    barrelCount: tierSpec.barrelCount,
    barrelAccentColor: tierSpec.barrelAccentColor,
    muzzleScale: tierSpec.muzzleScale,
    auraColor: tierSpec.auraColor,
    tracerColor: baseTracerColor,
    glowAlpha: tierSpec.glowAlpha,
  };
}

// ============================================================================
// 6. Survival XP Curve & 3-Card Level-Up Gacha System
// ============================================================================

export type BansungGachaSkillCategory = Exclude<
  BansungGachaCategory,
  'weapon_upgrade'
>;

export const BANSUNG_GACHA_SKILL_CATEGORIES: readonly BansungGachaSkillCategory[] = [
  'skill_damage',
  'skill_hp',
  'skill_firerate',
  'skill_stamina',
  'skill_shield',
  'skill_multishot',
  'skill_crit',
  'skill_mobility',
] as const;

export interface BansungGachaSkillSpec {
  id: string;
  category: BansungGachaSkillCategory;
  rarity: BansungGachaRarity;
  title: string;
  vnTitle: string;
  desc: string;
  vnDesc: string;
  icon: string;
  badge: string;
  /** Primary stat value (dmgMult, maxHp, fireRateMult, extraProjectiles, critChance, moveSpeedMult). */
  value: number;
  /** Secondary stat value (maxShield, reloadSpeedMult, energySave, critMult, magnetRadiusPx). */
  secondaryValue: number;
  /** Optional third stat (instantHeal for skill_hp, pierceBonus for skill_crit, dashCdRed for skill_mobility). */
  tertiaryValue?: number;
  maxStacks: number;
}

type BaseGachaRarity = 'common' | 'rare' | 'epic' | 'legendary';
type ExtendedGachaRarity = 'celestial' | 'mythic' | 'prismatic';

const GACHA_RARITIES: readonly BansungGachaRarity[] = [
  'common',
  'rare',
  'epic',
  'legendary',
  'celestial',
  'mythic',
  'prismatic',
] as const;

interface ExtendedTierSpec {
  suffixEn: string;
  suffixVn: string;
  badge: string;
  desc: string;
  vnDesc: string;
  value: number;
  secondaryValue: number;
  tertiaryValue?: number;
}

const EXTENDED_SKILL_TIERS: Readonly<
  Record<BansungGachaSkillCategory, Readonly<Record<ExtendedGachaRarity, ExtendedTierSpec>>>
> = {
  skill_damage: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+65% DMG',
      desc: '+65% all weapon & gadget damage',
      vnDesc: '+65% Sát thương súng & kỹ năng',
      value: 0.65,
      secondaryValue: 0,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+85% DMG',
      desc: '+85% all weapon & gadget damage',
      vnDesc: '+85% Sát thương súng & kỹ năng',
      value: 0.85,
      secondaryValue: 0,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+120% DMG',
      desc: '+120% all weapon & gadget damage',
      vnDesc: '+120% Sát thương súng & kỹ năng',
      value: 1.20,
      secondaryValue: 0,
    },
  },
  skill_hp: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+165 HP',
      desc: '+165 Max HP, +85 Shield & Full Heal',
      vnDesc: '+165 Máu tối đa, +85 Giáp & Hồi Đầy Máu',
      value: 165,
      secondaryValue: 85,
      tertiaryValue: 999,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+220 HP',
      desc: '+220 Max HP, +115 Shield & Full Heal',
      vnDesc: '+220 Máu tối đa, +115 Giáp & Hồi Đầy Máu',
      value: 220,
      secondaryValue: 115,
      tertiaryValue: 999,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+300 HP',
      desc: '+300 Max HP, +160 Shield & Full Heal',
      vnDesc: '+300 Máu tối đa, +160 Giáp & Hồi Đầy Máu',
      value: 300,
      secondaryValue: 160,
      tertiaryValue: 999,
    },
  },
  skill_firerate: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+60% ROF',
      desc: '+60% Fire Rate, +55% Reload Speed',
      vnDesc: '+60% Tốc độ bắn & +55% Tốc độ nạp đạn',
      value: 0.60,
      secondaryValue: 0.55,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+78% ROF',
      desc: '+78% Fire Rate, +68% Reload Speed',
      vnDesc: '+78% Tốc độ bắn & +68% Tốc độ nạp đạn',
      value: 0.78,
      secondaryValue: 0.68,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+100% ROF',
      desc: '+100% Fire Rate, +85% Reload Speed',
      vnDesc: '+100% Tốc độ bắn & +85% Tốc độ nạp đạn',
      value: 1.00,
      secondaryValue: 0.85,
    },
  },
  skill_multishot: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+2 TIA',
      desc: '+2 Extra Projectiles & -16% Energy Cost',
      vnDesc: '+2 Tia đạn & -16% Năng Lượng',
      value: 2,
      secondaryValue: 0.16,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+2 TIA',
      desc: '+2 Extra Projectiles & -22% Energy Cost',
      vnDesc: '+2 Tia đạn & -22% Năng Lượng',
      value: 2,
      secondaryValue: 0.22,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+3 TIA',
      desc: '+3 Extra Projectiles & -28% Energy Cost',
      vnDesc: '+3 Tia đạn & -28% Năng Lượng',
      value: 3,
      secondaryValue: 0.28,
    },
  },
  skill_crit: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+42% CRIT',
      desc: '+42% Crit Chance, +80% Crit Dmg, +2 Pierce',
      vnDesc: '+42% Chí mạng, +80% ST chí mạng & +2 Xuyên thấu',
      value: 0.42,
      secondaryValue: 0.80,
      tertiaryValue: 2,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+55% CRIT',
      desc: '+55% Crit Chance, +105% Crit Dmg, +3 Pierce',
      vnDesc: '+55% Chí mạng, +105% ST chí mạng & +3 Xuyên thấu',
      value: 0.55,
      secondaryValue: 1.05,
      tertiaryValue: 3,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+75% CRIT',
      desc: '+75% Crit Chance, +140% Crit Dmg, +4 Pierce',
      vnDesc: '+75% Chí mạng, +140% ST chí mạng & +4 Xuyên thấu',
      value: 0.75,
      secondaryValue: 1.40,
      tertiaryValue: 4,
    },
  },
  skill_mobility: {
    celestial: {
      suffixEn: 'Celestial IV',
      suffixVn: 'Thiên Thanh IV',
      badge: '+40% SPD',
      desc: '+40% Speed, +250px Magnet, -30% Dash CD',
      vnDesc: '+40% Tốc chạy, +250px hút XP & -30% hồi Lướt',
      value: 0.40,
      secondaryValue: 250,
      tertiaryValue: 0.30,
    },
    mythic: {
      suffixEn: 'Mythic V',
      suffixVn: 'Huyết Thần V',
      badge: '+50% SPD',
      desc: '+50% Speed, +310px Magnet, -35% Dash CD',
      vnDesc: '+50% Tốc chạy, +310px hút XP & -35% hồi Lướt',
      value: 0.50,
      secondaryValue: 310,
      tertiaryValue: 0.35,
    },
    prismatic: {
      suffixEn: 'Prismatic 777',
      suffixVn: 'Cầu Vồng 777',
      badge: '+65% SPD',
      desc: '+65% Speed, +400px Magnet, -42% Dash CD',
      vnDesc: '+65% Tốc chạy, +400px hút XP & -42% hồi Lướt',
      value: 0.65,
      secondaryValue: 400,
      tertiaryValue: 0.42,
    },
  },
  skill_stamina: {
    celestial: {
      suffixEn: 'Celestial IV (x3)',
      suffixVn: 'Thể Lực Thiên Thanh (x3)',
      badge: 'x3 +140 STA',
      desc: '+140 Max Stamina, +85% Regen, -6 Dash Cost',
      vnDesc: '+140 Thể lực tối đa, +85% hồi & -6 tốn Dash',
      value: 140,
      secondaryValue: 0.85,
      tertiaryValue: 6,
    },
    mythic: {
      suffixEn: 'Mythic V (x4)',
      suffixVn: 'Thể Lực Huyết Thần (x4)',
      badge: 'x4 +185 STA',
      desc: '+185 Max Stamina, +110% Regen, -8 Dash Cost',
      vnDesc: '+185 Thể lực tối đa, +110% hồi & -8 tốn Dash',
      value: 185,
      secondaryValue: 1.10,
      tertiaryValue: 8,
    },
    prismatic: {
      suffixEn: 'Prismatic 777 (x5)',
      suffixVn: 'Thể Lực Cầu Vồng (x5)',
      badge: 'x5 +250 STA',
      desc: '+250 Max Stamina, +145% Regen, -10 Dash Cost',
      vnDesc: '+250 Thể lực tối đa, +145% hồi & -10 tốn Dash',
      value: 250,
      secondaryValue: 1.45,
      tertiaryValue: 10,
    },
  },
  skill_shield: {
    celestial: {
      suffixEn: 'Celestial Aegis (x3)',
      suffixVn: 'Khiên Thiên Thanh (x3)',
      badge: 'x3 +145 SH',
      desc: '+145 Max Shield, +21% DR, -1.6s Regen Delay',
      vnDesc: '+145 Lưu trữ Khiên, +21% Giảm dame & -1.6s chờ hồi',
      value: 145,
      secondaryValue: 0.21,
      tertiaryValue: 1600,
    },
    mythic: {
      suffixEn: 'Mythic Aegis (x4)',
      suffixVn: 'Khiên Huyết Thần (x4)',
      badge: 'x4 +200 SH',
      desc: '+200 Max Shield, +26% DR, -2.0s Regen Delay',
      vnDesc: '+200 Lưu trữ Khiên, +26% Giảm dame & -2.0s chờ hồi',
      value: 200,
      secondaryValue: 0.26,
      tertiaryValue: 2000,
    },
    prismatic: {
      suffixEn: 'Prismatic 777 (x5)',
      suffixVn: 'Khiên Cầu Vồng (x5)',
      badge: 'x5 +280 SH',
      desc: '+280 Max Shield, +32% DR, -2.6s Regen Delay',
      vnDesc: '+280 Lưu trữ Khiên, +32% Giảm dame & -2.6s chờ hồi',
      value: 280,
      secondaryValue: 0.32,
      tertiaryValue: 2600,
    },
  },
} as const;

const BASE_GACHA_SKILL_MAP: Readonly<
  Record<BansungGachaSkillCategory, Readonly<Record<BaseGachaRarity, BansungGachaSkillSpec>>>
> = {
  skill_damage: {
    common: {
      id: 'skill_damage:common',
      category: 'skill_damage',
      rarity: 'common',
      title: 'Overcharged Rounds',
      vnTitle: 'Hỏa Lực Cường Hóa',
      desc: '+12% all weapon & gadget damage',
      vnDesc: '+12% Sát thương súng & kỹ năng',
      icon: 'skill_damage',
      badge: '+12% DMG',
      value: 0.12,
      secondaryValue: 0,
      maxStacks: 12,
    },
    rare: {
      id: 'skill_damage:rare',
      category: 'skill_damage',
      rarity: 'rare',
      title: 'Overcharged Rounds II',
      vnTitle: 'Hỏa Lực Cường Hóa II',
      desc: '+20% all weapon & gadget damage',
      vnDesc: '+20% Sát thương súng & kỹ năng',
      icon: 'skill_damage',
      badge: '+20% DMG',
      value: 0.20,
      secondaryValue: 0,
      maxStacks: 12,
    },
    epic: {
      id: 'skill_damage:epic',
      category: 'skill_damage',
      rarity: 'epic',
      title: 'Overcharged Rounds III',
      vnTitle: 'Hỏa Lực Cường Hóa III',
      desc: '+32% all weapon & gadget damage',
      vnDesc: '+32% Sát thương súng & kỹ năng',
      icon: 'skill_damage',
      badge: '+32% DMG',
      value: 0.32,
      secondaryValue: 0,
      maxStacks: 12,
    },
    legendary: {
      id: 'skill_damage:legendary',
      category: 'skill_damage',
      rarity: 'legendary',
      title: 'Apex Ordinance',
      vnTitle: 'Hỏa Lực Tối Thượng',
      desc: '+50% all weapon & gadget damage',
      vnDesc: '+50% Sát thương súng & kỹ năng',
      icon: 'skill_damage',
      badge: '+50% DMG',
      value: 0.50,
      secondaryValue: 0,
      maxStacks: 12,
    },
  },
  skill_hp: {
    common: {
      id: 'skill_hp:common',
      category: 'skill_hp',
      rarity: 'common',
      title: 'Vitality & Aegis',
      vnTitle: 'Sinh Lực & Giáp Năng Lượng',
      desc: '+25 Max HP, +10 Shield, Heal 40 HP',
      vnDesc: '+25 Máu tối đa, +10 Giáp & Hồi 40 Máu',
      icon: 'skill_hp',
      badge: '+25 HP',
      value: 25,
      secondaryValue: 10,
      tertiaryValue: 40,
      maxStacks: 12,
    },
    rare: {
      id: 'skill_hp:rare',
      category: 'skill_hp',
      rarity: 'rare',
      title: 'Vitality & Aegis II',
      vnTitle: 'Sinh Lực & Giáp Năng Lượng II',
      desc: '+45 Max HP, +20 Shield, Heal 65 HP',
      vnDesc: '+45 Máu tối đa, +20 Giáp & Hồi 65 Máu',
      icon: 'skill_hp',
      badge: '+45 HP',
      value: 45,
      secondaryValue: 20,
      tertiaryValue: 65,
      maxStacks: 12,
    },
    epic: {
      id: 'skill_hp:epic',
      category: 'skill_hp',
      rarity: 'epic',
      title: 'Vitality & Aegis III',
      vnTitle: 'Sinh Lực & Giáp Năng Lượng III',
      desc: '+75 Max HP, +35 Shield, Heal 100 HP',
      vnDesc: '+75 Máu tối đa, +35 Giáp & Hồi 100 Máu',
      icon: 'skill_hp',
      badge: '+75 HP',
      value: 75,
      secondaryValue: 35,
      tertiaryValue: 100,
      maxStacks: 12,
    },
    legendary: {
      id: 'skill_hp:legendary',
      category: 'skill_hp',
      rarity: 'legendary',
      title: 'Immortal Bastion',
      vnTitle: 'Pháo Đài Bất Tử',
      desc: '+120 Max HP, +60 Shield & Full Heal',
      vnDesc: '+120 Máu tối đa, +60 Giáp & Hồi Đầy Máu',
      icon: 'skill_hp',
      badge: '+120 HP',
      value: 120,
      secondaryValue: 60,
      tertiaryValue: 999,
      maxStacks: 12,
    },
  },
  skill_firerate: {
    common: {
      id: 'skill_firerate:common',
      category: 'skill_firerate',
      rarity: 'common',
      title: 'Rapid Trigger',
      vnTitle: 'Xạ Kích Siêu Tốc',
      desc: '+12% Fire Rate, +15% Reload Speed',
      vnDesc: '+12% Tốc độ bắn & +15% Tốc độ nạp đạn',
      icon: 'skill_firerate',
      badge: '+12% ROF',
      value: 0.12,
      secondaryValue: 0.15,
      maxStacks: 8,
    },
    rare: {
      id: 'skill_firerate:rare',
      category: 'skill_firerate',
      rarity: 'rare',
      title: 'Rapid Trigger II',
      vnTitle: 'Xạ Kích Siêu Tốc II',
      desc: '+20% Fire Rate, +22% Reload Speed',
      vnDesc: '+20% Tốc độ bắn & +22% Tốc độ nạp đạn',
      icon: 'skill_firerate',
      badge: '+20% ROF',
      value: 0.20,
      secondaryValue: 0.22,
      maxStacks: 8,
    },
    epic: {
      id: 'skill_firerate:epic',
      category: 'skill_firerate',
      rarity: 'epic',
      title: 'Rapid Trigger III',
      vnTitle: 'Xạ Kích Siêu Tốc III',
      desc: '+30% Fire Rate, +32% Reload Speed',
      vnDesc: '+30% Tốc độ bắn & +32% Tốc độ nạp đạn',
      icon: 'skill_firerate',
      badge: '+30% ROF',
      value: 0.30,
      secondaryValue: 0.32,
      maxStacks: 8,
    },
    legendary: {
      id: 'skill_firerate:legendary',
      category: 'skill_firerate',
      rarity: 'legendary',
      title: 'Hyper Cyclotron',
      vnTitle: 'Liên Thanh Cuồng Bạo',
      desc: '+45% Fire Rate, +45% Reload Speed',
      vnDesc: '+45% Tốc độ bắn & +45% Tốc độ nạp đạn',
      icon: 'skill_firerate',
      badge: '+45% ROF',
      value: 0.45,
      secondaryValue: 0.45,
      maxStacks: 8,
    },
  },
  skill_multishot: {
    common: {
      id: 'skill_multishot:common',
      category: 'skill_multishot',
      rarity: 'common',
      title: 'Split Shot +1',
      vnTitle: 'Thêm +1 Tia Đạn',
      desc: '+1 Extra Projectile per shot',
      vnDesc: '+1 Tia đạn mỗi phát',
      icon: 'skill_multishot',
      badge: '+1 TIA',
      value: 1,
      secondaryValue: 0,
      maxStacks: 4,
    },
    rare: {
      id: 'skill_multishot:rare',
      category: 'skill_multishot',
      rarity: 'rare',
      title: 'Split Shot +1',
      vnTitle: 'Thêm +1 Tia Đạn',
      desc: '+1 Extra Projectile & -5% Energy Cost',
      vnDesc: '+1 Tia đạn & -5% Năng Lượng',
      icon: 'skill_multishot',
      badge: '+1 TIA',
      value: 1,
      secondaryValue: 0.05,
      maxStacks: 4,
    },
    epic: {
      id: 'skill_multishot:epic',
      category: 'skill_multishot',
      rarity: 'epic',
      title: 'Twin Split +2',
      vnTitle: 'Thêm +2 Tia Đạn',
      desc: '+2 Extra Projectiles & -8% Energy Cost',
      vnDesc: '+2 Tia đạn & -8% Năng Lượng',
      icon: 'skill_multishot',
      badge: '+2 TIA',
      value: 2,
      secondaryValue: 0.08,
      maxStacks: 4,
    },
    legendary: {
      id: 'skill_multishot:legendary',
      category: 'skill_multishot',
      rarity: 'legendary',
      title: 'Twin Overdrive +2',
      vnTitle: 'Thêm +2 Tia Cực Đại',
      desc: '+2 Extra Projectiles & -12% Energy Cost',
      vnDesc: '+2 Tia đạn & -12% Năng Lượng',
      icon: 'skill_multishot',
      badge: '+2 TIA',
      value: 2,
      secondaryValue: 0.12,
      maxStacks: 4,
    },
  },
  skill_crit: {
    common: {
      id: 'skill_crit:common',
      category: 'skill_crit',
      rarity: 'common',
      title: 'Precision Optics',
      vnTitle: 'Ngắm Bắn Chí Mạng',
      desc: '+8% Crit Chance, +15% Crit Damage',
      vnDesc: '+8% Tỉ lệ chí mạng & +15% Sát thương chí mạng',
      icon: 'skill_crit',
      badge: '+8% CRIT',
      value: 0.08,
      secondaryValue: 0.15,
      tertiaryValue: 0,
      maxStacks: 8,
    },
    rare: {
      id: 'skill_crit:rare',
      category: 'skill_crit',
      rarity: 'rare',
      title: 'Piercing Optics',
      vnTitle: 'Xuyên Tâm Chí Mạng',
      desc: '+14% Crit Chance, +25% Crit Dmg, +1 Pierce',
      vnDesc: '+14% Chí mạng, +25% ST chí mạng & +1 Xuyên thấu',
      icon: 'skill_crit',
      badge: '+14% CRIT',
      value: 0.14,
      secondaryValue: 0.25,
      tertiaryValue: 1,
      maxStacks: 8,
    },
    epic: {
      id: 'skill_crit:epic',
      category: 'skill_crit',
      rarity: 'epic',
      title: 'Lethal Penetration',
      vnTitle: 'Đoạt Mệnh Xuyên Giáp',
      desc: '+22% Crit Chance, +40% Crit Dmg, +1 Pierce',
      vnDesc: '+22% Chí mạng, +40% ST chí mạng & +1 Xuyên thấu',
      icon: 'skill_crit',
      badge: '+22% CRIT',
      value: 0.22,
      secondaryValue: 0.40,
      tertiaryValue: 1,
      maxStacks: 8,
    },
    legendary: {
      id: 'skill_crit:legendary',
      category: 'skill_crit',
      rarity: 'legendary',
      title: 'Executioner Eye',
      vnTitle: 'Thần Nhãn Xuyên Phá',
      desc: '+32% Crit Chance, +60% Crit Dmg, +2 Pierce',
      vnDesc: '+32% Chí mạng, +60% ST chí mạng & +2 Xuyên thấu',
      icon: 'skill_crit',
      badge: '+32% CRIT',
      value: 0.32,
      secondaryValue: 0.60,
      tertiaryValue: 2,
      maxStacks: 8,
    },
  },
  skill_mobility: {
    common: {
      id: 'skill_mobility:common',
      category: 'skill_mobility',
      rarity: 'common',
      title: 'Swift Magnet',
      vnTitle: 'Thân Pháp & Hút XP',
      desc: '+8% Move Speed, +45px XP/Orb Magnet',
      vnDesc: '+8% Tốc chạy & +45px tầm hút XP/Năng lượng',
      icon: 'skill_mobility',
      badge: '+8% SPD',
      value: 0.08,
      secondaryValue: 45,
      tertiaryValue: 0,
      maxStacks: 8,
    },
    rare: {
      id: 'skill_mobility:rare',
      category: 'skill_mobility',
      rarity: 'rare',
      title: 'Swift Magnet II',
      vnTitle: 'Thân Pháp & Hút XP II',
      desc: '+14% Move Speed, +80px XP/Orb Magnet',
      vnDesc: '+14% Tốc chạy & +80px tầm hút XP/Năng lượng',
      icon: 'skill_mobility',
      badge: '+14% SPD',
      value: 0.14,
      secondaryValue: 80,
      tertiaryValue: 0.08,
      maxStacks: 8,
    },
    epic: {
      id: 'skill_mobility:epic',
      category: 'skill_mobility',
      rarity: 'epic',
      title: 'Phantom Stride',
      vnTitle: 'Ảnh Bộ Từ Trường',
      desc: '+22% Speed, +130px Magnet, -15% Dash CD',
      vnDesc: '+22% Tốc chạy, +130px hút XP & -15% hồi Lướt',
      icon: 'skill_mobility',
      badge: '+22% SPD',
      value: 0.22,
      secondaryValue: 130,
      tertiaryValue: 0.15,
      maxStacks: 8,
    },
    legendary: {
      id: 'skill_mobility:legendary',
      category: 'skill_mobility',
      rarity: 'legendary',
      title: 'Warp Singularity',
      vnTitle: 'Lực Hút Vũ Trụ',
      desc: '+32% Speed, +200px Magnet, -25% Dash CD',
      vnDesc: '+32% Tốc chạy, +200px hút XP & -25% hồi Lướt',
      icon: 'skill_mobility',
      badge: '+32% SPD',
      value: 0.32,
      secondaryValue: 200,
      tertiaryValue: 0.25,
      maxStacks: 8,
    },
  },
  skill_stamina: {
    common: {
      id: 'skill_stamina:common',
      category: 'skill_stamina',
      rarity: 'common',
      title: 'Tactical Endurance',
      vnTitle: 'Thể Lực Chiến Thuật',
      desc: '+20 Max Stamina, +15% Stamina Regen',
      vnDesc: '+20 Thể lực tối đa & +15% tốc hồi Dash',
      icon: 'skill_stamina',
      badge: '+20 STA',
      value: 20,
      secondaryValue: 0.15,
      tertiaryValue: 0,
      maxStacks: 10,
    },
    rare: {
      id: 'skill_stamina:rare',
      category: 'skill_stamina',
      rarity: 'rare',
      title: 'Tactical Endurance II',
      vnTitle: 'Thể Lực Chiến Thuật II',
      desc: '+35 Max Stamina, +25% Stamina Regen',
      vnDesc: '+35 Thể lực tối đa & +25% tốc hồi Dash',
      icon: 'skill_stamina',
      badge: '+35 STA',
      value: 35,
      secondaryValue: 0.25,
      tertiaryValue: 2,
      maxStacks: 10,
    },
    epic: {
      id: 'skill_stamina:epic',
      category: 'skill_stamina',
      rarity: 'epic',
      title: 'Turbo Reactor (x1)',
      vnTitle: 'Khoang Thể Lực Tím (x1)',
      desc: '+50 Max Stamina, +35% Regen, -2 Dash Cost',
      vnDesc: '+50 Thể lực tối đa, +35% hồi & -2 tốn Dash',
      icon: 'skill_stamina',
      badge: 'x1 +50 STA',
      value: 50,
      secondaryValue: 0.35,
      tertiaryValue: 2,
      maxStacks: 10,
    },
    legendary: {
      id: 'skill_stamina:legendary',
      category: 'skill_stamina',
      rarity: 'legendary',
      title: 'Hyper Core (x2)',
      vnTitle: 'Siêu Thể Lực Vàng (x2)',
      desc: '+100 Max Stamina, +65% Regen, -5 Dash Cost',
      vnDesc: '+100 Thể lực tối đa, +65% hồi & -5 tốn Dash',
      icon: 'skill_stamina',
      badge: 'x2 +100 STA',
      value: 100,
      secondaryValue: 0.65,
      tertiaryValue: 5,
      maxStacks: 10,
    },
  },
  skill_shield: {
    common: {
      id: 'skill_shield:common',
      category: 'skill_shield',
      rarity: 'common',
      title: 'Aegis Capacitor',
      vnTitle: 'Khoang Khiên Dự Phòng',
      desc: '+20 Max Shield Storage, +4% Bullet DR',
      vnDesc: '+20 Lưu trữ Khiên & +4% Giảm sát thương đạn',
      icon: 'skill_shield',
      badge: '+20 SH',
      value: 20,
      secondaryValue: 0.04,
      tertiaryValue: 0,
      maxStacks: 10,
    },
    rare: {
      id: 'skill_shield:rare',
      category: 'skill_shield',
      rarity: 'rare',
      title: 'Aegis Capacitor II',
      vnTitle: 'Khoang Khiên Dự Phòng II',
      desc: '+35 Max Shield, +7% Bullet DR, -0.4s Regen Delay',
      vnDesc: '+35 Lưu trữ Khiên, +7% Giảm dame & -0.4s chờ hồi',
      icon: 'skill_shield',
      badge: '+35 SH',
      value: 35,
      secondaryValue: 0.07,
      tertiaryValue: 400,
      maxStacks: 10,
    },
    epic: {
      id: 'skill_shield:epic',
      category: 'skill_shield',
      rarity: 'epic',
      title: 'Nanoweave Barrier (x1)',
      vnTitle: 'Giáp Khiên Nano Tím (x1)',
      desc: '+55 Max Shield, +10% DR, -0.7s Regen Delay',
      vnDesc: '+55 Lưu trữ Khiên, +10% Giảm dame & -0.7s chờ hồi',
      icon: 'skill_shield',
      badge: 'x1 +55 SH',
      value: 55,
      secondaryValue: 0.10,
      tertiaryValue: 700,
      maxStacks: 10,
    },
    legendary: {
      id: 'skill_shield:legendary',
      category: 'skill_shield',
      rarity: 'legendary',
      title: 'Impervious Matrix (x2)',
      vnTitle: 'Ma Trận Khiên Vàng (x2)',
      desc: '+100 Max Shield, +16% DR, -1.2s Regen Delay',
      vnDesc: '+100 Lưu trữ Khiên, +16% Giảm dame & -1.2s chờ hồi',
      icon: 'skill_shield',
      badge: 'x2 +100 SH',
      value: 100,
      secondaryValue: 0.16,
      tertiaryValue: 1200,
      maxStacks: 10,
    },
  },
} as const;

function buildExtendedGachaSkillMap(): Readonly<
  Record<BansungGachaSkillCategory, Readonly<Record<BansungGachaRarity, BansungGachaSkillSpec>>>
> {
  const result = {} as Record<
    BansungGachaSkillCategory,
    Readonly<Record<BansungGachaRarity, BansungGachaSkillSpec>>
  >;
  const extRarities: readonly ExtendedGachaRarity[] = ['celestial', 'mythic', 'prismatic'];
  for (const cat of BANSUNG_GACHA_SKILL_CATEGORIES) {
    const base = BASE_GACHA_SKILL_MAP[cat];
    const ext = EXTENDED_SKILL_TIERS[cat];
    const merged = { ...base } as Record<BansungGachaRarity, BansungGachaSkillSpec>;
    for (const rar of extRarities) {
      const spec = ext[rar];
      merged[rar] = {
        id: `${cat}:${rar}`,
        category: cat,
        rarity: rar,
        title: `${base.common.title} · ${spec.suffixEn}`,
        vnTitle: `${base.common.vnTitle} · ${spec.suffixVn}`,
        desc: spec.desc,
        vnDesc: spec.vnDesc,
        icon: base.common.icon,
        badge: spec.badge,
        value: spec.value,
        secondaryValue: spec.secondaryValue,
        ...(spec.tertiaryValue !== undefined ? { tertiaryValue: spec.tertiaryValue } : {}),
        maxStacks: base.common.maxStacks,
      };
    }
    result[cat] = merged;
  }
  return result;
}

export const BANSUNG_GACHA_SKILL_MAP: Readonly<
  Record<BansungGachaSkillCategory, Readonly<Record<BansungGachaRarity, BansungGachaSkillSpec>>>
> = buildExtendedGachaSkillMap();

/** Flat readonly list of all 56 Survival Gacha Skill specs (8 categories x 7 rarities). */
export const BANSUNG_GACHA_SKILLS: readonly BansungGachaSkillSpec[] = (() => {
  const out: BansungGachaSkillSpec[] = [];
  for (const cat of BANSUNG_GACHA_SKILL_CATEGORIES) {
    for (const rar of GACHA_RARITIES) {
      out.push(BANSUNG_GACHA_SKILL_MAP[cat][rar]);
    }
  }
  return out;
})();

const GACHA_SKILL_BY_ID = new Map<string, BansungGachaSkillSpec>(
  BANSUNG_GACHA_SKILLS.map((s) => [s.id, s])
);

/** Look up a gacha skill spec by exact card `id` (`skill_damage:rare`) or `(category, rarity)`. */
export function getGachaSkillSpec(
  idOrCategory: string,
  rarity: BansungGachaRarity = 'common'
): BansungGachaSkillSpec | undefined {
  const direct = GACHA_SKILL_BY_ID.get(idOrCategory);
  if (direct) return direct;
  const map = (
    BANSUNG_GACHA_SKILL_MAP as Record<
      string,
      Readonly<Record<BansungGachaRarity, BansungGachaSkillSpec>> | undefined
    >
  )[idOrCategory];
  return map?.[rarity];
}

/**
 * Progressive XP threshold required to advance from `level` to `level + 1`.
 * Starts at 60 XP for Lv1 -> Lv2 and scales smoothly through endless waves.
 */
export function getXpToNextLevel(level: number): number {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(60 + (lv - 1) * 32 + Math.pow(lv - 1, 1.45) * 14);
}

function clampRng(rng: () => number): number {
  const v = Number(rng());
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 0.9999999;
  return v;
}

export function formatWeaponDmgText(spec: BansungWeaponSpec, dmgMult = 1): string {
  const baseDmg = Math.max(1, Math.round(spec.damage * dmgMult));
  if (spec.category === 'kinetic' && spec.pellets > 1) {
    return `DMG ${baseDmg}×${spec.pellets}`;
  }
  if ((spec.category === 'kinetic' || spec.category === 'explosive') && spec.burstCount > 1) {
    return `DMG ${baseDmg}×${spec.burstCount}`;
  }
  if (spec.id === 'laser_cannon') {
    return `DMG ${baseDmg} · Toàn Map`;
  }
  if (spec.id === 'sniper_rifle') {
    return `DMG ${baseDmg} · Xuyên 3`;
  }
  if (spec.id === 'electric_gun') {
    return `DMG ${baseDmg} · Giật 4`;
  }
  if (spec.id === 'saw_launcher') {
    return `DMG ${baseDmg} · Nảy 4`;
  }
  if (spec.id === 'flamethrower') {
    return `DMG ${baseDmg} · Cháy`;
  }
  if (spec.id === 'cryo_cannon') {
    return `DMG ${baseDmg} · Băng`;
  }
  if (spec.id === 'gravity_gun') {
    return `DMG ${baseDmg} · Hút`;
  }
  if (spec.id === 'plasma_shotgun') {
    return `DMG ${baseDmg}×${spec.pellets} · Cháy`;
  }
  if (spec.id === 'twin_smg') {
    return `DMG ${baseDmg}×${spec.burstCount} · Liên Thanh`;
  }
  if (spec.id === 'ion_beam') {
    return `DMG ${baseDmg} · Chùm Ion`;
  }
  if (spec.id === 'cluster_rpg') {
    return `DMG ${baseDmg} · Bom Chùm ×4`;
  }
  if (spec.id === 'tesla_coil') {
    return `DMG ${baseDmg} · Giật 5`;
  }
  if (spec.id === 'void_cannon') {
    return `DMG ${baseDmg} · Hố Đen`;
  }
  if (spec.id === 'blizzard_carbine') {
    return `DMG ${baseDmg} · Bão Băng`;
  }
  if (spec.id === 'ricochet_disc') {
    return `DMG ${baseDmg} · Nảy 5`;
  }
  if (spec.id === 'phantom_bow') {
    return `DMG ${baseDmg} · Xuyên 4`;
  }
  if (spec.id === 'magma_spitter') {
    return `DMG ${baseDmg} · Dung Nham`;
  }
  if (spec.id === 'chronos_rifle') {
    return `DMG ${baseDmg}×2 · Thời Không`;
  }
  if (spec.id === 'orbital_cannon') {
    return `DMG ${baseDmg} · Quỹ Đạo ×6`;
  }
  return `DMG ${baseDmg}`;
}

function rollGachaRarity(rng: () => number, level: number): BansungGachaRarity {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const prismaticProb = Math.min(0.06, 0.015 + Math.max(0, lv - 2) * 0.005);
  const mythicProb = Math.min(0.11, 0.035 + Math.max(0, lv - 1) * 0.008);
  const celestialProb = Math.min(0.16, 0.06 + Math.max(0, lv - 1) * 0.01);
  const legendaryProb = Math.min(0.22, 0.12 + Math.max(0, lv - 2) * 0.012);
  const epicProb = 0.24;
  const rareProb = 0.18;
  const roll = clampRng(rng);
  let acc = prismaticProb;
  if (roll < acc) return 'prismatic';
  acc += mythicProb;
  if (roll < acc) return 'mythic';
  acc += celestialProb;
  if (roll < acc) return 'celestial';
  acc += legendaryProb;
  if (roll < acc) return 'legendary';
  acc += epicProb;
  if (roll < acc) return 'epic';
  acc += rareProb;
  if (roll < acc) return 'rare';
  return 'common';
}

function buildWeaponUpgradeCard(
  weaponId: BansungWeaponId,
  slotIdx: number,
  fromTier: BansungWeaponTier
): BansungGachaCard {
  const toTier = normalizeWeaponTier(fromTier + 1);
  const spec = BANSUNG_WEAPONS[weaponId] ?? BANSUNG_WEAPONS.pistol;
  const prevTier = BANSUNG_WEAPON_TIERS[fromTier];
  const nextTier = BANSUNG_WEAPON_TIERS[toTier];

  const dmgPct = Math.round((nextTier.dmgMult / prevTier.dmgMult - 1) * 100);
  const rofPct = Math.round((nextTier.fireRateMult / prevTier.fireRateMult - 1) * 100);
  const extraProjDelta = Math.max(0, nextTier.extraProjectiles - prevTier.extraProjectiles);
  const enPct = Math.round((1 - nextTier.energyCostMult / prevTier.energyCostMult) * 100);

  return {
    id: `weapon_upgrade:${slotIdx}:${spec.id}:${toTier}`,
    category: 'weapon_upgrade',
    rarity: nextTier.rarity,
    title: `Evolve ${spec.name} → ${nextTier.badge}`,
    vnTitle: `Tiến Hóa ${spec.vnName} → ${nextTier.vnPrefix}`,
    desc: `+${dmgPct}% DMG, +${rofPct}% ROF, +${extraProjDelta} Proj, -${enPct}% Energy`,
    vnDesc: `+${dmgPct}% Sát thương, +${rofPct}% Tốc bắn, +${extraProjDelta} Tia đạn, -${enPct}% Năng lượng`,
    weaponId: spec.id,
    slotIdx,
    fromTier,
    toTier,
    icon: spec.hotbarIcon,
    badge: nextTier.badge,
    value: toTier,
    multLabel: nextTier.rarity === 'legendary' ? 'x3' : nextTier.rarity === 'epic' ? 'x2' : undefined,
    dmgText: `${formatWeaponDmgText(spec, prevTier.dmgMult)} → ${formatWeaponDmgText(spec, nextTier.dmgMult)}`,
  };
}

function buildWeaponUnlockCard(
  weaponId: BansungWeaponId,
  slotIdx: number
): BansungGachaCard {
  const spec = BANSUNG_WEAPONS[weaponId] ?? BANSUNG_WEAPONS.rifle;
  const rar: BansungGachaRarity =
    spec.rarity === 'mythic'
      ? 'mythic'
      : spec.rarity === 'celestial'
        ? 'celestial'
        : spec.rarity === 'legendary'
          ? 'legendary'
          : spec.rarity === 'epic' || spec.rarity === 'rare'
            ? 'epic'
            : 'rare';
  const multLabel: BansungGachaCard['multLabel'] =
    rar === 'mythic' ? 'x4' : rar === 'celestial' ? 'x3' : rar === 'legendary' ? 'x2' : 'x1';
  const badge =
    rar === 'mythic'
      ? 'MỚI x4'
      : rar === 'celestial'
        ? 'MỚI x3'
        : rar === 'legendary'
          ? 'MỚI x2'
          : 'SÚNG MỚI';
  return {
    id: `weapon_unlock:${slotIdx}:${spec.id}:1`,
    category: 'weapon_upgrade',
    rarity: rar,
    title: `Unlock ${spec.name}`,
    vnTitle: `Mở Khóa ${spec.vnName}`,
    desc: `Equip in slot ${slotIdx + 1} (${formatWeaponDmgText(spec)})`,
    vnDesc: `Trang bị vào ô ${slotIdx + 1} · ${formatWeaponDmgText(spec)}`,
    weaponId: spec.id,
    slotIdx,
    fromTier: 0,
    toTier: 1,
    icon: spec.hotbarIcon,
    badge,
    value: 1,
    multLabel,
    dmgText: formatWeaponDmgText(spec),
  };
}

function buildSkillCard(spec: BansungGachaSkillSpec): BansungGachaCard {
  let multLabel: BansungGachaCard['multLabel'];
  if (spec.category === 'skill_multishot') {
    multLabel = spec.value >= 3 ? '+3' : spec.value >= 2 ? '+2' : '+1';
  } else if (spec.rarity === 'prismatic') {
    multLabel = '777';
  } else if (spec.rarity === 'mythic') {
    multLabel = 'x4';
  } else if (spec.rarity === 'celestial' || spec.rarity === 'legendary') {
    multLabel = 'x3';
  } else if (spec.rarity === 'epic') {
    multLabel = 'x2';
  }
  return {
    id: spec.id,
    category: spec.category,
    rarity: spec.rarity,
    title: spec.title,
    vnTitle: spec.vnTitle,
    desc: spec.desc,
    vnDesc: spec.vnDesc,
    icon: spec.icon,
    badge: spec.badge,
    value: spec.value,
    secondaryValue: spec.secondaryValue,
    multLabel,
  };
}

const FEATURED_UNLOCK_ARSENAL: readonly BansungWeaponId[] = [
  'blizzard_carbine',
  'ricochet_disc',
  'phantom_bow',
  'magma_spitter',
  'chronos_rifle',
  'orbital_cannon',
  'plasma_shotgun',
  'twin_smg',
  'ion_beam',
  'cluster_rpg',
  'tesla_coil',
  'void_cannon',
  'dual_pistols',
  'minigun',
  'saw_launcher',
  'flamethrower',
  'cryo_cannon',
  'gravity_gun',
  'rifle',
  'smg',
  'electric_gun',
  'sniper_rifle',
  'laser_cannon',
  'shotgun',
  'plasma_rifle',
  'railgun',
] as const;

/**
 * Roll 3 distinct Survival Gacha Cards combining held Weapon Evolutions,
 * new weapon unlocks (`laser_cannon`, `electric_gun`, `sniper_rifle`, `rifle`, `smg`),
 * and core stat upgrades (HP, Stamina, Shield, Damage, Fire Speed) formatted for the 777 reel.
 */
export function rollSurvivalGachaCards(opts: {
  rng: () => number;
  level: number;
  slots: readonly { id: BansungWeaponId; tier?: number }[];
  activeSlotIdx: number;
  skillStacks?: Record<string, number>;
}): BansungGachaCard[] {
  const { rng, level, slots, activeSlotIdx, skillStacks } = opts;
  const cards: BansungGachaCard[] = [];
  const usedSkillCats = new Set<BansungGachaSkillCategory>();
  const usedWeaponSlots = new Set<number>();
  const ownedIds = new Set<BansungWeaponId>();

  const upgradable: { slotIdx: number; id: BansungWeaponId; tier: BansungWeaponTier; weight: number }[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || !BANSUNG_WEAPONS[slot.id]) continue;
    ownedIds.add(slot.id);
    const tier = normalizeWeaponTier(slot.tier ?? 1);
    if (tier < BANSUNG_WEAPON_MAX_TIER) {
      upgradable.push({
        slotIdx: i,
        id: slot.id,
        tier,
        weight: i === activeSlotIdx ? 2.6 : 1.0,
      });
    }
  }

  const pickUpgradableSlot = () => {
    const pool = upgradable.filter((u) => !usedWeaponSlots.has(u.slotIdx));
    if (pool.length === 0) return undefined;
    let totalW = 0;
    for (const u of pool) totalW += u.weight;
    let pick = clampRng(rng) * totalW;
    for (const u of pool) {
      pick -= u.weight;
      if (pick <= 0) return u;
    }
    return pool[pool.length - 1];
  };

  const unlockableWeapons = FEATURED_UNLOCK_ARSENAL.filter((id) => !ownedIds.has(id));
  if (slots.length < 5 && unlockableWeapons.length > 0 && clampRng(rng) < 0.45) {
    const pickIdx = Math.floor(clampRng(rng) * unlockableWeapons.length);
    const wId = unlockableWeapons[pickIdx] ?? unlockableWeapons[0];
    cards.push(buildWeaponUnlockCard(wId, slots.length));
  }

  // Strongly favor at least 1 Weapon Evolution card when the player has upgradable guns.
  if (cards.length < 2 && upgradable.length > 0 && (level >= 2 ? clampRng(rng) < 0.85 : clampRng(rng) < 0.78)) {
    const chosen = pickUpgradableSlot();
    if (chosen) {
      usedWeaponSlots.add(chosen.slotIdx);
      cards.push(buildWeaponUpgradeCard(chosen.id, chosen.slotIdx, chosen.tier));
    }
  }

  const skillWeights: Partial<Record<BansungGachaSkillCategory, number>> = {
    skill_hp: 1.5,
    skill_stamina: 1.5,
    skill_shield: 1.5,
    skill_damage: 1.6,
    skill_firerate: 1.6,
    skill_multishot: 0.55,
    skill_crit: 0.9,
    skill_mobility: 0.8,
  };

  const pickSkillCategory = (allowCapped: boolean): BansungGachaSkillCategory | undefined => {
    const available = BANSUNG_GACHA_SKILL_CATEGORIES.filter((cat) => {
      if (usedSkillCats.has(cat)) return false;
      if (allowCapped) return true;
      const curStacks = Math.max(0, Math.floor(Number(skillStacks?.[cat]) || 0));
      return curStacks < BANSUNG_GACHA_SKILL_MAP[cat].common.maxStacks;
    });
    if (available.length === 0) return undefined;
    let totalW = 0;
    for (const c of available) totalW += skillWeights[c] ?? 1;
    let r = clampRng(rng) * totalW;
    for (const c of available) {
      r -= skillWeights[c] ?? 1;
      if (r <= 0) return c;
    }
    return available[available.length - 1];
  };

  while (cards.length < 3) {
    const cat = pickSkillCategory(false) ?? pickSkillCategory(true);
    if (!cat) {
      const chosen = pickUpgradableSlot();
      if (chosen) {
        usedWeaponSlots.add(chosen.slotIdx);
        cards.push(buildWeaponUpgradeCard(chosen.id, chosen.slotIdx, chosen.tier));
        continue;
      }
      break;
    }
    usedSkillCats.add(cat);
    const rarity = rollGachaRarity(rng, level);
    cards.push(buildSkillCard(BANSUNG_GACHA_SKILL_MAP[cat][rarity]));
  }

  // Deterministic Fisher-Yates shuffle so weapon card isn't always stuck at slot 0.
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(clampRng(rng) * (i + 1));
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }

  return cards;
}
