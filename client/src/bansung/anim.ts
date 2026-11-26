/**
 * client/src/bansung/anim.ts
 *
 * Miragine-cadence hero animator, 360-degree parallax-solved shoulder aim rig,
 * anti-inversion weapon orientation, behind-body Z-order switching, and
 * dual-layer draw helpers via `drawBansungSprite` (d18, d19, d20, d21, d29).
 */

import {
  BANSUNG_AIM_CONSTANTS,
  BANSUNG_DASH,
  BANSUNG_HERO_ANIM_SPECS,
  BANSUNG_HERO_DASH_CADENCE,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_PIXEL_SCALE,
  BANSUNG_HERO_RUN_CADENCE,
  BANSUNG_HEROES,
  BANSUNG_MELEE_WEAPONS,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_FIRING,
  BANSUNG_PFLAG_HIT_FLASH,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_LEFT,
  BANSUNG_SHADOW_META,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_WEAPON_MAX_TIER,
  BANSUNG_WEAPON_TIERS,
  getBansungHero,
  getWeaponByIdx,
  getWeaponEvolutionStats,
  getWeaponSpec,
  normalizeWeaponTier,
  sampleDashVisualTransform,
  solveAimRig,
  solveFacing,
  solveMuzzleWorld,
  wrapPi,
  type BansungAimRigResult,
  type BansungHeroAnimSpec,
  type BansungHeroAnimState,
  type BansungHeroId,
  type BansungHeroRigSpec,
  type BansungHeroSpec,
  type BansungMeleeWeaponSpec,
  type BansungMiragineHeroUnitId,
  type BansungUnitState,
  type BansungWeaponEvolutionStats,
  type BansungWeaponId,
  type BansungWeaponRigSpec,
  type BansungWeaponTier,
  type BansungWeaponTierSpec,
} from '../../../shared/src';
import {
  bansungMotion,
  MOTION_CFG,
  sampleHeroMotionTransform,
  type HeroMotionTransform,
  type RecoilPivotResult,
} from './motion';
import {
  drawBansungSprite,
  getClipMeta,
  getSpriteImage,
  type DrawSpriteOpts,
  type TintMode,
} from './sprites';
import type { InterpPlayer } from './store';

// ---------------------------------------------------------------------------
// Re-exports & Spec Aliases (d18, d19)
// ---------------------------------------------------------------------------

export {
  BANSUNG_AIM_CONSTANTS,
  BANSUNG_DASH,
  BANSUNG_HERO_ANIM_SPECS,
  BANSUNG_HERO_DASH_CADENCE,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_PIXEL_SCALE,
  BANSUNG_HERO_RUN_CADENCE,
  BANSUNG_HEROES,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_FIRING,
  BANSUNG_PFLAG_HIT_FLASH,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_LEFT,
  BANSUNG_SHADOW_META,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_WEAPON_MAX_TIER,
  BANSUNG_WEAPON_TIERS,
  getBansungHero,
  getWeaponEvolutionStats,
  normalizeWeaponTier,
  sampleDashVisualTransform,
  solveAimRig,
  solveFacing,
  solveMuzzleWorld,
  wrapPi,
};

export type {
  BansungAimRigResult,
  BansungHeroAnimSpec,
  BansungHeroAnimState,
  BansungHeroRigSpec,
  BansungHeroSpec,
  BansungMiragineHeroUnitId,
  BansungWeaponEvolutionStats,
  BansungWeaponRigSpec,
  BansungWeaponTier,
  BansungWeaponTierSpec,
};

export type HeroRigSpec = BansungHeroRigSpec;
export type WeaponRigSpec = BansungWeaponRigSpec;
export type AimRigResult = BansungAimRigResult;

export const AIM_CONSTANTS = BANSUNG_AIM_CONSTANTS;
export const HERO_PIXEL_SCALE = BANSUNG_HERO_PIXEL_SCALE;

// ---------------------------------------------------------------------------
// Animation Cadence Constants
// ---------------------------------------------------------------------------

/** Shoot kickback / stationary shoot strip duration in ms (d18 §4.5). */
export const HERO_SHOOT_KICK_MS = MOTION_CFG.SHOOT_KICK_MS;
/** Co-op downed transition duration before holding on dead frame 2 with pulse. */
export const HERO_DOWNED_HOLD_MS = 300;
/** Thời gian ngã gục hẳn (6 frame dead) khi chết hẳn — chậm hơn để ngã có trọng lượng. */
export const HERO_DEAD_FALL_MS = 520;
/** Hysteresis chuyển sang dải nhìn xuống/lên: vào khi |sin(aim)| > ENTER, ra khi < EXIT. */
export const HERO_VIEW_DIR_ENTER = 0.8;
export const HERO_VIEW_DIR_EXIT = 0.55;
/** Hit-flash overlay decay duration in ms (d18 §8). */
export const HERO_HIT_FLASH_MS = 90;
/** Minimum world displacement in px within a frame to count as moving. */
export const HERO_MOVE_EPS_PX = 0.35;
/** Run stride phase advance per displaced pixel (d18 §4.3). */
export const HERO_PHASE_PER_PX = 0.07;
/** Run stride phase advance per second (d18 §4.3). */
export const HERO_PHASE_PER_SEC = 10.5;
/** 30 Hz fixed simulation tick duration in ms (used for melee phases). */
const TICK_MS = 1000 / 30;

/** Tier-2 Miragine fallback sheet action mapping for each hero animation state. */
export const MIRAGINE_HERO_ACTION_MAP: Readonly<
  Record<BansungHeroAnimState, 'idle' | 'run' | 'attack' | 'dead'>
> = {
  idle: 'idle',
  run: 'run',
  shoot: 'attack',
  dash: 'run',
  stunned: 'idle',
  dead: 'dead',
};

// ---------------------------------------------------------------------------
// Weapon Rig Metadata (aligned with manifest.json pivots & shared/weapons.ts)
// ---------------------------------------------------------------------------

function makeWeaponRig(
  id: BansungWeaponId,
  holdType: BansungWeaponRigSpec['holdType'],
  gripX: number,
  gripY: number,
  muzzleX: number,
  muzzleY: number,
  ejectX: number,
  ejectY: number,
  shoulderR: number,
  restTiltRad?: number,
): BansungWeaponRigSpec {
  const spec = getWeaponSpec(id);
  return {
    id,
    holdType,
    cellW: spec.anim.cellW,
    cellH: spec.anim.cellH,
    gripX,
    gripY,
    muzzleX,
    muzzleY,
    ejectX,
    ejectY,
    shoulderR,
    recoilKick: spec.recoilKickPx,
    ...(restTiltRad !== undefined ? { restTiltRad } : {}),
    scale: 1,
  };
}

/** Canonical shoulder-pivot rig specs for all 15 `ban_sung` weapons. */
export const WEAPON_RIG_SPECS: Readonly<Record<BansungWeaponId, BansungWeaponRigSpec>> = {
  pistol: makeWeaponRig('pistol', 'pistol', 6, 8, 23, 6, 9, 5, 7),
  rifle: makeWeaponRig('rifle', 'rifle', 10, 9, 38, 7, 16, 6, 8),
  smg: makeWeaponRig('smg', 'pistol', 9, 9, 32, 7, 14, 6, 7),
  shotgun: makeWeaponRig('shotgun', 'rifle', 10, 9, 40, 7, 17, 6, 8),
  grenade_launcher: makeWeaponRig('grenade_launcher', 'heavy', 8, 12, 32, 10, 14, 8, 9),
  stun_launcher: makeWeaponRig('stun_launcher', 'heavy', 8, 12, 32, 10, 14, 8, 9),
  bazooka: makeWeaponRig('bazooka', 'heavy', 12, 12, 40, 10, 4, 10, 10),
  mine_gun: makeWeaponRig('mine_gun', 'heavy', 8, 12, 30, 10, 13, 9, 8),
  plasma_rifle: makeWeaponRig('plasma_rifle', 'rifle', 8, 10, 30, 6, 15, 6, 8),
  railgun: makeWeaponRig('railgun', 'rifle', 9, 10, 36, 7, 17, 7, 9),
  lightning_staff: makeWeaponRig('lightning_staff', 'staff', 10, 7, 34, 7, 10, 7, 8, -0.22),
  arcane_book: makeWeaponRig('arcane_book', 'staff', 10, 10, 18, 10, 10, 10, 10, 0),
  crescent_blade: makeWeaponRig('crescent_blade', 'melee', 10, 24, 42, 24, 10, 24, 7, -0.35),
  reaper_scythe: makeWeaponRig('reaper_scythe', 'melee', 14, 32, 54, 22, 14, 32, 8, -0.4),
  shock_baton: makeWeaponRig('shock_baton', 'melee', 10, 24, 40, 24, 10, 24, 7, -0.25),
  sniper_rifle: makeWeaponRig('sniper_rifle', 'rifle', 12, 9, 48, 7, 18, 6, 9),
  laser_cannon: makeWeaponRig('laser_cannon', 'heavy', 10, 9, 41, 8, 19, 7, 10),
  electric_gun: makeWeaponRig('electric_gun', 'rifle', 10, 9, 37, 8, 17, 6, 9),
  dual_pistols: makeWeaponRig('dual_pistols', 'pistol', 9, 9, 29, 6, 9, 5, 8),
  minigun: makeWeaponRig('minigun', 'heavy', 11, 10, 38, 10, 17, 7, 10),
  saw_launcher: makeWeaponRig('saw_launcher', 'rifle', 9, 9, 36, 10, 16, 6, 9),
  flamethrower: makeWeaponRig('flamethrower', 'heavy', 10, 9, 37, 8, 17, 6, 9),
  cryo_cannon: makeWeaponRig('cryo_cannon', 'heavy', 10, 9, 35, 8, 17, 6, 9),
  gravity_gun: makeWeaponRig('gravity_gun', 'heavy', 9, 9, 35, 9, 18, 7, 10),
  plasma_shotgun: makeWeaponRig('plasma_shotgun', 'rifle', 10, 9, 34, 8, 17, 6, 9),
  twin_smg: makeWeaponRig('twin_smg', 'pistol', 9, 9, 34, 7, 14, 6, 8),
  ion_beam: makeWeaponRig('ion_beam', 'heavy', 10, 9, 36, 8, 19, 7, 10),
  cluster_rpg: makeWeaponRig('cluster_rpg', 'heavy', 10, 9, 35, 8, 14, 8, 10),
  tesla_coil: makeWeaponRig('tesla_coil', 'rifle', 10, 9, 35, 8, 17, 6, 9),
  void_cannon: makeWeaponRig('void_cannon', 'heavy', 10, 9, 35, 8, 18, 8, 11),
  blizzard_carbine: makeWeaponRig('blizzard_carbine', 'rifle', 10, 9, 34, 7, 17, 6, 9),
  ricochet_disc: makeWeaponRig('ricochet_disc', 'rifle', 10, 9, 35, 8, 16, 6, 9),
  phantom_bow: makeWeaponRig('phantom_bow', 'rifle', 10, 9, 36, 8, 17, 6, 9),
  magma_spitter: makeWeaponRig('magma_spitter', 'heavy', 10, 9, 35, 8, 17, 6, 9),
  chronos_rifle: makeWeaponRig('chronos_rifle', 'rifle', 10, 9, 36, 8, 18, 6, 9),
  orbital_cannon: makeWeaponRig('orbital_cannon', 'heavy', 10, 9, 36, 8, 18, 8, 11),
};

/** Resolve weapon ID from an optional ID or wire index, defaulting to `pistol`. */
export function resolveWeaponId(weapon?: BansungWeaponId | number | null): BansungWeaponId {
  if (typeof weapon === 'number' && Number.isFinite(weapon)) {
    return getWeaponByIdx(weapon)?.id ?? 'pistol';
  }
  if (typeof weapon === 'string' && Object.prototype.hasOwnProperty.call(WEAPON_RIG_SPECS, weapon)) {
    return weapon as BansungWeaponId;
  }
  return 'pistol';
}

/** Return the `BansungWeaponRigSpec` for a weapon ID or wire index. */
export function getWeaponRigSpec(weapon?: BansungWeaponId | number | null): BansungWeaponRigSpec {
  return WEAPON_RIG_SPECS[resolveWeaponId(weapon)];
}

/** Resolve the manifest clip key for a weapon, falling back across known naming prefixes. */
export function resolveWeaponClipKey(weapon?: BansungWeaponId | number | null): string {
  const spec = getWeaponSpec(resolveWeaponId(weapon));
  if (getClipMeta(spec.spriteKey)) return spec.spriteKey;
  if (getClipMeta(spec.id)) return spec.id;
  const prefixed = `wpn_${spec.id}`;
  if (getClipMeta(prefixed)) return prefixed;
  return spec.spriteKey;
}

/**
 * Resolve the active clip key for a hero + animation state using the 3-tier strategy (d18 §7):
 * Tier 1: custom `hero_${heroId}_${state}` sheet when loaded;
 * Tier 2: Miragine fallback (`A0`/`A11`/`A5`/`A8`) if ready while custom sheet loads/fails;
 * Tier 3: returns primary key so `drawBansungSprite` draws the crisp procedural silhouette.
 */
export function resolveHeroClipKey(heroId: BansungHeroId, animState: BansungHeroAnimState): string {
  const hero = getBansungHero(heroId);
  const primaryKey = `hero_${hero.id}_${animState}`;
  const primaryMeta = getClipMeta(primaryKey);
  if (primaryMeta && getSpriteImage(primaryMeta.url)) {
    return primaryKey;
  }

  const miragineAction = MIRAGINE_HERO_ACTION_MAP[animState];
  const manifestMiragineKey = `miragine_${hero.miragineFallback.unitId.toLowerCase()}_${miragineAction}`;
  const manifestFallbackMeta = getClipMeta(manifestMiragineKey);
  if (manifestFallbackMeta && getSpriteImage(manifestFallbackMeta.url)) {
    return manifestMiragineKey;
  }

  const miragineKey = `${hero.miragineFallback.unitId}_${miragineAction}`;
  const fallbackMeta = getClipMeta(miragineKey);
  if (fallbackMeta && getSpriteImage(fallbackMeta.url)) {
    return miragineKey;
  }

  return primaryKey;
}

// ---------------------------------------------------------------------------
// Interfaces & Per-Entity Animation State
// ---------------------------------------------------------------------------

export interface HeroAnimStepInput {
  readonly entityId: number;
  readonly heroId: BansungHeroId;
  readonly weaponId?: BansungWeaponId | number;
  readonly x: number;
  readonly y: number;
  /** World aim target X (used with targetY for parallax aim solve). */
  readonly targetX?: number;
  /** World aim target Y (used with targetX for parallax aim solve). */
  readonly targetY?: number;
  /** Fallback quantized aim angle in radians when targetX/Y is omitted. */
  readonly aimRad?: number;
  readonly state?: BansungUnitState;
  readonly flags?: number;
  readonly hp?: number;
  readonly movedPx?: number;
  readonly speedPxPerSec?: number;
  readonly dtMs?: number;
  readonly visualTimeMs?: number;
  readonly dashElapsedMs?: number;
  readonly dashDurationMs?: number;
  readonly dashDirSign?: 1 | -1;
  readonly stunRemainMs?: number;
  readonly shootAgeMs?: number;
  readonly atkAtMs?: number;
  readonly hitFlashAtMs?: number;
  readonly hitFlashAlpha?: number;
  readonly downed?: boolean;
  readonly dead?: boolean;
  readonly meleeSwingAgeMs?: number;
  readonly meleeComboDir?: 1 | -1;
  readonly recoilPx?: number;
  readonly recoilSnapRad?: number;
}

export interface HeroAnimEntityState {
  entityId: number;
  heroId: BansungHeroId;
  weaponId: BansungWeaponId;
  prevState: BansungHeroAnimState;
  prevX: number;
  prevY: number;
  hasPos: boolean;
  phase: number;
  facingRight: boolean;
  shootAgeMs: number;
  lastAtkAtMs: number;
  dashElapsedMs: number;
  wasDashing: boolean;
  downedAgeMs: number;
  wasDownedOrDead: boolean;
  hitFlashRemainMs: number;
  lastHitFlashAtMs: number;
  meleeSwingAgeMs: number;
  meleeComboDir: 1 | -1;
  lastStepFrame: number;
  lastDashFrame: number;
  /** Hướng nhìn đang dùng (atlas 4 hướng) — giữ có trễ (hysteresis) để không nháy qua lại. */
  viewDir: HeroViewDir;
}

/** `null` = dải nghiêng trái/phải; `'down'`/`'up'` = dải nhìn thẳng / sau lưng. */
export type HeroViewDir = 'down' | 'up' | null;

export interface HeroAnimPose {
  readonly heroId: BansungHeroId;
  readonly weaponId: BansungWeaponId;
  readonly animState: BansungHeroAnimState;
  readonly clipKey: string;
  readonly weaponClipKey: string;
  readonly frameIdx: number;
  readonly weaponFrameIdx: number;
  readonly animTimeSec: number;
  readonly weaponAnimTimeSec: number;
  readonly phase: number;
  readonly facingRight: boolean;
  readonly downed: boolean;
  readonly dead: boolean;
  readonly isDashing: boolean;
  readonly isMoving: boolean;
  readonly isShooting: boolean;
  readonly shootAgeMs: number;
  readonly hitFlashAlpha: number;
  readonly swingRad: number;
  readonly stepSfx: boolean;
  readonly dashDust: boolean;
  readonly motion: HeroMotionTransform;
}

export interface SolveAimFromAngleOpts {
  readonly entX: number;
  readonly entY: number;
  readonly aimRad: number;
  readonly prevRight: boolean;
  readonly hero: BansungHeroRigSpec;
  readonly weapon: BansungWeaponRigSpec;
  readonly frameIdx?: number;
  readonly recoilPx?: number;
  readonly swingRad?: number;
}

export interface HeroShadowDrawOpts {
  readonly x: number;
  readonly y: number;
  readonly heroId?: BansungHeroId;
  readonly shadowScale?: number;
  readonly heroScale?: number;
  readonly alpha?: number;
  readonly teamRingColor?: string;
  readonly teamRingRadius?: number;
}

export interface HeroBodyDrawOpts {
  readonly x: number;
  readonly y: number;
  readonly heroId: BansungHeroId;
  readonly animState: BansungHeroAnimState;
  readonly frameIdx?: number;
  readonly animTimeSec?: number;
  readonly facingRight: boolean;
  readonly heroScale?: number;
  readonly alpha?: number;
  readonly hitFlashAlpha?: number;
  readonly tint?: TintMode;
  readonly clipKey?: string;
  /** Góc ngắm (rad) — chọn dải nhìn xuống/nhìn lên (`hero_<id>_{idle,walk}_{down,up}`). */
  readonly aimTheta?: number;
  /** Hướng nhìn đã có hysteresis từ tracker; ưu tiên hơn `aimTheta` khi được truyền (kể cả `null`). */
  readonly viewDir?: HeroViewDir;
  readonly motion?: Partial<
    Pick<HeroMotionTransform, 'dx' | 'dy' | 'hopY' | 'sx' | 'sy' | 'leanRad' | 'alpha'>
  >;
}

export interface WeaponLayerDrawOpts {
  readonly rig: BansungAimRigResult;
  readonly weaponId: BansungWeaponId | number;
  readonly weaponTier?: number;
  readonly heroId?: BansungHeroId;
  readonly clipKey?: string;
  readonly frameIdx?: number;
  readonly animTimeSec?: number;
  readonly visualTimeMs?: number;
  readonly scale?: number;
  readonly snapAngle?: number;
  readonly alpha?: number;
  readonly hitFlashAlpha?: number;
  readonly tint?: TintMode;
  readonly drawFrontHand?: boolean;
}

export interface DrawHeroWithWeaponOpts {
  readonly x: number;
  readonly y: number;
  readonly heroId: BansungHeroId;
  readonly weaponId: BansungWeaponId | number;
  readonly weaponTier?: number;
  readonly pose: HeroAnimPose;
  readonly rig: BansungAimRigResult;
  readonly heroScale?: number;
  readonly weaponScale?: number;
  readonly snapAngle?: number;
  readonly alpha?: number;
  readonly hitFlashAlpha?: number;
  readonly tint?: TintMode;
  readonly drawShadow?: boolean;
  readonly shadowAlpha?: number;
  readonly teamRingColor?: string;
  readonly hideWeaponWhenDead?: boolean;
  readonly hideWeaponWhenDowned?: boolean;
  readonly drawFrontHand?: boolean;
  readonly visualTimeMs?: number;
  /** Hướng nhìn có hysteresis (xem `HeroViewDir`). */
  readonly viewDir?: HeroViewDir;
}

export interface HeroHeadAnchor {
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Aim & Melee Curve Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function easeOutCubic(u: number): number {
  const t = clamp(u, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Compute shoulder swing angle offset in radians for melee weapons (d29).
 * Uses windup -> active easeOutCubic sweep -> recovery to `restTiltRad`.
 */
export function sampleMeleeSwingOffsetRad(
  weaponId: BansungWeaponId,
  swingAgeMs: number,
  comboDir: 1 | -1 = 1,
): { readonly active: boolean; readonly swingRad: number; readonly frameIdx: number } {
  const rig = getWeaponRigSpec(weaponId);
  const restTilt = rig.restTiltRad ?? 0;
  if (rig.holdType !== 'melee' || swingAgeMs < 0) {
    return { active: false, swingRad: 0, frameIdx: 0 };
  }

  const meleeSpec: BansungMeleeWeaponSpec | undefined =
    BANSUNG_MELEE_WEAPONS[weaponId as keyof typeof BANSUNG_MELEE_WEAPONS];
  if (!meleeSpec) {
    return { active: false, swingRad: 0, frameIdx: 0 };
  }

  const windupMs = meleeSpec.windupTicks * TICK_MS;
  const activeMs = Math.max(1, meleeSpec.activeTicks * TICK_MS);
  const recoveryMs = Math.max(1, meleeSpec.recoveryTicks * TICK_MS);
  const totalMs = windupMs + activeMs + recoveryMs;
  if (swingAgeMs >= totalMs) {
    return { active: false, swingRad: 0, frameIdx: 0 };
  }

  const halfArc = ((meleeSpec.arcDeg * Math.PI) / 180) * 0.5;
  const startTheta = -halfArc * comboDir;
  const endTheta = halfArc * comboDir;

  if (swingAgeMs < windupMs) {
    const u = windupMs > 0 ? swingAgeMs / windupMs : 1;
    const pullback = startTheta * (0.7 + 0.3 * u);
    return { active: true, swingRad: pullback - restTilt, frameIdx: 0 };
  }

  if (swingAgeMs < windupMs + activeMs) {
    const u = (swingAgeMs - windupMs) / activeMs;
    const theta = startTheta + (endTheta - startTheta) * easeOutCubic(u);
    const frameIdx = Math.min(3, Math.floor(u * 4));
    return { active: true, swingRad: theta - restTilt, frameIdx };
  }

  const recU = (swingAgeMs - windupMs - activeMs) / recoveryMs;
  const easedRec = easeOutCubic(recU);
  const theta = endTheta + (restTilt - endTheta) * easedRec;
  return { active: true, swingRad: theta - restTilt, frameIdx: 3 };
}

/**
 * Solve aim rig from a quantized wire aim angle (`p.aim`) when no cursor `(targetX, targetY)` exists.
 * Projects a far synthetic target along `aimRad` so `solveAimRig` handles facing hysteresis,
 * `gunFlipY`, `zOrder`, recoil orbit reduction, and muzzle/eject anchors uniformly.
 */
export function solveAimRigFromAngle(opts: SolveAimFromAngleOpts): BansungAimRigResult {
  const { entX, entY, aimRad, prevRight, hero, weapon } = opts;
  const frameIdx = opts.frameIdx ?? 0;
  const bobLen = hero.bobY.length;
  const bob = bobLen > 0 ? (hero.bobY[((frameIdx % bobLen) + bobLen) % bobLen] ?? 0) : 0;
  const theta = Number.isFinite(aimRad) ? wrapPi(aimRad) : prevRight ? 0 : Math.PI;
  const farDist = 1_000_000;
  return solveAimRig(
    entX,
    entY,
    entX + Math.cos(theta) * farDist,
    entY - hero.shoulderLiftY + bob + Math.sin(theta) * farDist,
    prevRight,
    hero,
    weapon,
    frameIdx,
    opts.recoilPx ?? 0,
    opts.swingRad ?? 0,
  );
}

/**
 * Convenience aim-rig solver accepting either cursor `(targetX, targetY)` for full
 * barrel parallax compensation OR quantized `aimRad` for remote actors / bots.
 */
export function solveHeroAimRig(opts: {
  readonly entX: number;
  readonly entY: number;
  readonly heroId: BansungHeroId;
  readonly weaponId: BansungWeaponId | number;
  readonly prevRight: boolean;
  readonly targetX?: number;
  readonly targetY?: number;
  readonly aimRad?: number;
  readonly pose?: Pick<HeroAnimPose, 'animState' | 'frameIdx' | 'swingRad' | 'motion'>;
  readonly recoilPx?: number;
}): BansungAimRigResult {
  const heroSpec = getBansungHero(opts.heroId);
  const weaponRig = getWeaponRigSpec(opts.weaponId);
  const animState = opts.pose?.animState ?? 'idle';
  const bobFrameIdx = animState === 'run' ? (opts.pose?.frameIdx ?? 0) : 0;
  const dx = opts.pose?.motion.dx ?? 0;
  const hopY = opts.pose?.motion.hopY ?? 0;
  const tuck = opts.pose?.motion.weaponTuckPx ?? 0;
  const recoilPx = Math.max(opts.recoilPx ?? 0, tuck);
  const swingRad = opts.pose?.swingRad ?? 0;

  if (
    opts.targetX !== undefined &&
    opts.targetY !== undefined &&
    Number.isFinite(opts.targetX) &&
    Number.isFinite(opts.targetY)
  ) {
    return solveAimRig(
      opts.entX + dx,
      opts.entY + hopY,
      opts.targetX,
      opts.targetY,
      opts.prevRight,
      heroSpec.rig,
      weaponRig,
      bobFrameIdx,
      recoilPx,
      swingRad,
    );
  }

  return solveAimRigFromAngle({
    entX: opts.entX + dx,
    entY: opts.entY + hopY,
    aimRad: opts.aimRad ?? (opts.prevRight ? 0 : Math.PI),
    prevRight: opts.prevRight,
    hero: heroSpec.rig,
    weapon: weaponRig,
    frameIdx: bobFrameIdx,
    recoilPx,
    swingRad,
  });
}

// ---------------------------------------------------------------------------
// Stateless + Managed Hero Animation Stepper (d18 §4)
// ---------------------------------------------------------------------------

function createHeroAnimState(entityId: number, heroId: BansungHeroId): HeroAnimEntityState {
  return {
    entityId,
    heroId,
    weaponId: getBansungHero(heroId).starterWeapon,
    prevState: 'idle',
    prevX: 0,
    prevY: 0,
    hasPos: false,
    phase: 0,
    facingRight: true,
    shootAgeMs: -1,
    lastAtkAtMs: 0,
    dashElapsedMs: 0,
    wasDashing: false,
    downedAgeMs: 0,
    wasDownedOrDead: false,
    hitFlashRemainMs: 0,
    lastHitFlashAtMs: 0,
    meleeSwingAgeMs: -1,
    meleeComboDir: 1,
    lastStepFrame: -1,
    lastDashFrame: -1,
    viewDir: null,
  };
}

function defaultVisualTimeMs(): number {
  return bansungMotion.getVisualTimeMs();
}

function resolveEventAgeMs(visualTimeMs: number, eventAtMs?: number): number {
  if (!eventAtMs || !Number.isFinite(eventAtMs) || eventAtMs <= 0) return -1;
  if (eventAtMs <= visualTimeMs) {
    return visualTimeMs - eventAtMs;
  }
  // `store.ts` timestamps `atkAt` and `hitFlashAt` on `performance.now()` while
  // `render.ts` passes match-elapsed `visualTimeMs` starting at 0.
  if (typeof performance !== 'undefined') {
    const perfNow = performance.now();
    if (eventAtMs <= perfNow) {
      return perfNow - eventAtMs;
    }
  }
  return -1;
}

function resolveMovedPx(input: HeroAnimStepInput, tracker?: HeroAnimEntityState): number {
  if (input.movedPx !== undefined && Number.isFinite(input.movedPx)) {
    return Math.max(0, input.movedPx);
  }
  if (tracker && tracker.hasPos) {
    return Math.hypot(input.x - tracker.prevX, input.y - tracker.prevY);
  }
  if (input.speedPxPerSec !== undefined && Number.isFinite(input.speedPxPerSec)) {
    const dtSec = Math.max(0, input.dtMs ?? 0) / 1000;
    return Math.max(0, input.speedPxPerSec) * dtSec;
  }
  return 0;
}

function computeFacingForInput(input: HeroAnimStepInput, prevRight: boolean, flags: number): boolean {
  if (
    input.targetX !== undefined &&
    input.targetY !== undefined &&
    Number.isFinite(input.targetX) &&
    Number.isFinite(input.targetY)
  ) {
    const hero = getBansungHero(input.heroId);
    return solveFacing(
      prevRight,
      input.targetX - input.x,
      input.targetY - (input.y - hero.rig.shoulderLiftY),
    );
  }
  if (input.aimRad !== undefined && Number.isFinite(input.aimRad)) {
    return solveFacing(prevRight, Math.cos(input.aimRad), Math.sin(input.aimRad));
  }
  if ((flags & BANSUNG_PFLAG_LEFT) !== 0) return false;
  return prevRight;
}

/**
 * Resolve hero animation frame, Miragine run cadence, shoot kick overlay,
 * stunned jitter, downed frame-2 hold, and dead clip state (d18).
 * Updates `tracker` in place when provided, or runs statelessly when omitted.
 */
export function resolveHeroAnim(
  input: HeroAnimStepInput,
  tracker?: HeroAnimEntityState,
): HeroAnimPose {
  const dtMs = Math.max(0, input.dtMs ?? 0);
  const dtSec = dtMs / 1000;
  const visualTimeMs = input.visualTimeMs ?? defaultVisualTimeMs();
  const flags = input.flags ?? 0;
  const weaponId = resolveWeaponId(input.weaponId ?? tracker?.weaponId);
  const unitState = input.state;

  const isDead =
    input.dead === true ||
    unitState === BANSUNG_STATE_DEAD ||
    (input.hp !== undefined && input.hp <= 0 && !input.downed && unitState !== BANSUNG_STATE_DOWNED);
  const isDowned = !isDead && (input.downed === true || unitState === BANSUNG_STATE_DOWNED);
  const isStunned = !isDead && !isDowned && (unitState === BANSUNG_STATE_STUN || (input.stunRemainMs ?? 0) > 0);
  const isDashing =
    !isDead &&
    !isDowned &&
    !isStunned &&
    (unitState === BANSUNG_STATE_DASH ||
      (flags & BANSUNG_PFLAG_DASHING) !== 0 ||
      (input.dashElapsedMs !== undefined && input.dashElapsedMs >= 0));

  const movedPx = resolveMovedPx(input, tracker);
  const isMoving =
    !isDead &&
    !isDowned &&
    !isStunned &&
    !isDashing &&
    (unitState === BANSUNG_STATE_RUN || movedPx > HERO_MOVE_EPS_PX);

  // Sync shoot kickback / fire pulse age
  let shootAgeMs = input.shootAgeMs ?? -1;
  if (shootAgeMs < 0) {
    const rawAge = resolveEventAgeMs(visualTimeMs, input.atkAtMs);
    if (rawAge >= 0 && rawAge < HERO_SHOOT_KICK_MS * 2) {
      shootAgeMs = rawAge;
    }
  }
  if (tracker) {
    if (input.atkAtMs && input.atkAtMs > tracker.lastAtkAtMs) {
      tracker.lastAtkAtMs = input.atkAtMs;
      tracker.shootAgeMs = 0;
      if (getWeaponRigSpec(weaponId).holdType === 'melee') {
        tracker.meleeSwingAgeMs = 0;
        tracker.meleeComboDir = tracker.meleeComboDir === 1 ? -1 : 1;
      }
    } else if ((flags & BANSUNG_PFLAG_FIRING) !== 0 && tracker.shootAgeMs < 0) {
      tracker.shootAgeMs = 0;
      if (getWeaponRigSpec(weaponId).holdType === 'melee' && tracker.meleeSwingAgeMs < 0) {
        tracker.meleeSwingAgeMs = 0;
        tracker.meleeComboDir = tracker.meleeComboDir === 1 ? -1 : 1;
      }
    } else if (unitState === BANSUNG_STATE_ATK && tracker.shootAgeMs < 0) {
      tracker.shootAgeMs = 0;
    } else if (tracker.shootAgeMs >= 0) {
      tracker.shootAgeMs += dtMs;
      if (tracker.shootAgeMs >= HERO_SHOOT_KICK_MS) {
        tracker.shootAgeMs = -1;
      }
    }
    if (shootAgeMs < 0) shootAgeMs = tracker.shootAgeMs;

    if (tracker.meleeSwingAgeMs >= 0) {
      tracker.meleeSwingAgeMs += dtMs;
    }
  } else if (shootAgeMs < 0 && ((flags & BANSUNG_PFLAG_FIRING) !== 0 || unitState === BANSUNG_STATE_ATK)) {
    shootAgeMs = 0;
  }

  const isShooting = !isDead && !isDowned && !isStunned && !isDashing && shootAgeMs >= 0 && shootAgeMs < HERO_SHOOT_KICK_MS;

  // Dash elapsed progression
  let dashElapsedMs = input.dashElapsedMs ?? 0;
  if (tracker) {
    if (isDashing) {
      if (!tracker.wasDashing) {
        tracker.dashElapsedMs = input.dashElapsedMs ?? 0;
        tracker.lastDashFrame = -1;
      } else {
        tracker.dashElapsedMs = input.dashElapsedMs ?? tracker.dashElapsedMs + dtMs;
      }
      dashElapsedMs = tracker.dashElapsedMs;
    } else {
      tracker.dashElapsedMs = 0;
      tracker.lastDashFrame = -1;
    }
    tracker.wasDashing = isDashing;
  }

  // Downed/dead progression
  let downedAgeMs = HERO_DEAD_FALL_MS;
  if (tracker) {
    if (isDowned || isDead) {
      tracker.downedAgeMs = tracker.wasDownedOrDead ? tracker.downedAgeMs + dtMs : 0;
      downedAgeMs = tracker.downedAgeMs;
    } else {
      tracker.downedAgeMs = 0;
    }
    tracker.wasDownedOrDead = isDowned || isDead;
  }

  // State resolution priority (d18 §4.2): dead/downed -> stunned -> dash -> run -> shoot -> idle
  let animState: BansungHeroAnimState = 'idle';
  if (isDead || isDowned) {
    animState = 'dead';
  } else if (isStunned) {
    animState = 'stunned';
  } else if (isDashing) {
    animState = 'dash';
  } else if (isMoving) {
    animState = 'run';
  } else if (isShooting) {
    animState = 'shoot';
  }

  // Run phase reset on idle -> run transition & cadence update (d18 §4.3)
  let phase = tracker ? tracker.phase : 0;
  if (animState === 'run') {
    if (tracker && tracker.prevState !== 'run') {
      phase = 0;
    } else {
      phase += movedPx * HERO_PHASE_PER_PX + dtSec * HERO_PHASE_PER_SEC;
    }
  } else if (animState === 'idle') {
    phase = 0;
  }

  // Frame index calculation matching d18 anim specs
  const animTimeSec = Math.max(0, visualTimeMs) / 1000;
  const spec = BANSUNG_HERO_ANIM_SPECS[animState];
  let rawFrameIdx = 0;
  if (animState === 'run') {
    rawFrameIdx = Math.floor(phase) % spec.frames;
  } else if (animState === 'shoot') {
    const ratio = clamp(shootAgeMs / HERO_SHOOT_KICK_MS, 0, 0.999);
    rawFrameIdx = Math.floor(ratio * spec.frames);
  } else if (animState === 'dash') {
    const dashDurMs = Math.max(1, input.dashDurationMs ?? BANSUNG_DASH.DURATION_MS);
    const ratio = clamp(dashElapsedMs / dashDurMs, 0, 0.999);
    rawFrameIdx = Math.floor(ratio * spec.frames);
  } else if (animState === 'stunned') {
    rawFrameIdx = Math.floor(animTimeSec * spec.fps) % spec.frames;
  } else if (animState === 'dead') {
    if (isDowned) {
      // Gục (chờ đồng đội cứu): khuỵu xuống tới frame 3 rồi giữ
      rawFrameIdx =
        downedAgeMs < HERO_DOWNED_HOLD_MS
          ? Math.min(3, Math.floor((downedAgeMs / HERO_DOWNED_HOLD_MS) * 4))
          : 3;
    } else {
      // Chết hẳn: ngã đủ 6 frame
      rawFrameIdx =
        downedAgeMs < HERO_DEAD_FALL_MS
          ? Math.min(5, Math.floor((downedAgeMs / HERO_DEAD_FALL_MS) * 6))
          : 5;
    }
  } else {
    rawFrameIdx = Math.floor(animTimeSec * spec.fps) % spec.frames;
  }

  const prevRight = tracker ? tracker.facingRight : (flags & BANSUNG_PFLAG_LEFT) === 0;
  const facingRight = computeFacingForInput(input, prevRight, flags);
  const isIframe = (flags & BANSUNG_PFLAG_INVULN) !== 0;

  const motion = sampleHeroMotionTransform({
    animState: isDowned ? 'dead' : animState,
    frameIdx: rawFrameIdx,
    dashElapsedS: dashElapsedMs / 1000,
    dashDurationS: (input.dashDurationMs ?? BANSUNG_DASH.DURATION_MS) / 1000,
    shootAgeMs: isShooting ? shootAgeMs : -1,
    downed: isDowned,
    isIframe,
    facingRight,
    dashDirSign: input.dashDirSign ?? (facingRight ? 1 : -1),
    visualTimeMs,
  });

  // Preserve progressive frames 0->1->2 during initial 300ms downed / 0->3 death collapse
  let frameIdx = motion.frameIdx;
  if (isDowned && downedAgeMs < HERO_DOWNED_HOLD_MS) {
    frameIdx = rawFrameIdx;
  } else if (isDead && downedAgeMs < HERO_DEAD_FALL_MS) {
    frameIdx = rawFrameIdx;
  }

  // Hit-flash alpha (d18 §8)
  let hitFlashAlpha = input.hitFlashAlpha ?? 0;
  if (tracker) {
    if (input.hitFlashAtMs && input.hitFlashAtMs > tracker.lastHitFlashAtMs) {
      tracker.lastHitFlashAtMs = input.hitFlashAtMs;
      tracker.hitFlashRemainMs = HERO_HIT_FLASH_MS;
    } else if ((flags & BANSUNG_PFLAG_HIT_FLASH) !== 0) {
      tracker.hitFlashRemainMs = HERO_HIT_FLASH_MS;
    } else if (tracker.hitFlashRemainMs > 0) {
      tracker.hitFlashRemainMs = Math.max(0, tracker.hitFlashRemainMs - dtMs);
    }
    if (input.hitFlashAlpha === undefined) {
      hitFlashAlpha = clamp(tracker.hitFlashRemainMs / HERO_HIT_FLASH_MS, 0, 1);
    }
  } else if (input.hitFlashAlpha === undefined) {
    const age = resolveEventAgeMs(visualTimeMs, input.hitFlashAtMs);
    if (age >= 0) {
      hitFlashAlpha = age < HERO_HIT_FLASH_MS ? 1 - age / HERO_HIT_FLASH_MS : 0;
    } else if ((flags & BANSUNG_PFLAG_HIT_FLASH) !== 0) {
      hitFlashAlpha = 0.85;
    }
  }

  // Edge-triggered step SFX & dash landing dust events
  let stepSfx = false;
  if (animState === 'run' && motion.stepSfx) {
    stepSfx = tracker ? tracker.lastStepFrame !== frameIdx : true;
  }
  const dashDust =
    animState === 'dash' &&
    frameIdx === 4 &&
    (tracker ? tracker.lastDashFrame !== 4 : true);

  // Melee swing arc & weapon strip frame
  const meleeAgeMs = input.meleeSwingAgeMs ?? (tracker ? tracker.meleeSwingAgeMs : -1);
  const comboDir = input.meleeComboDir ?? (tracker ? tracker.meleeComboDir : 1);
  const meleeSample = sampleMeleeSwingOffsetRad(weaponId, meleeAgeMs, comboDir);
  if (tracker && !meleeSample.active && tracker.meleeSwingAgeMs >= 0) {
    tracker.meleeSwingAgeMs = -1;
  }

  const weaponSpec = getWeaponSpec(weaponId);
  let weaponFrameIdx = 0;
  let weaponAnimTimeSec = 0;
  if (meleeSample.active) {
    weaponFrameIdx = meleeSample.frameIdx;
  } else if (isShooting) {
    const wFrames = Math.max(1, weaponSpec.anim.frames);
    weaponFrameIdx = Math.min(
      wFrames - 1,
      Math.floor((clamp(shootAgeMs, 0, HERO_SHOOT_KICK_MS - 1) / HERO_SHOOT_KICK_MS) * wFrames),
    );
    weaponAnimTimeSec = shootAgeMs / 1000;
  } else if (weaponId === 'arcane_book') {
    weaponAnimTimeSec = animTimeSec;
    weaponFrameIdx = Math.floor(animTimeSec * weaponSpec.anim.fps) % Math.max(1, weaponSpec.anim.frames);
  }

  // Commit tracker state
  if (tracker) {
    tracker.heroId = input.heroId;
    tracker.weaponId = weaponId;
    tracker.prevState = animState;
    tracker.prevX = input.x;
    tracker.prevY = input.y;
    tracker.hasPos = true;
    tracker.phase = phase;
    tracker.facingRight = facingRight;
    tracker.lastStepFrame = animState === 'run' ? frameIdx : -1;
    tracker.lastDashFrame = animState === 'dash' ? frameIdx : -1;
  }

  return {
    heroId: input.heroId,
    weaponId,
    animState,
    clipKey: resolveHeroClipKey(input.heroId, animState),
    weaponClipKey: resolveWeaponClipKey(weaponId),
    frameIdx,
    weaponFrameIdx,
    animTimeSec,
    weaponAnimTimeSec,
    phase,
    facingRight,
    downed: isDowned,
    dead: isDead,
    isDashing,
    isMoving,
    isShooting,
    shootAgeMs,
    hitFlashAlpha,
    swingRad: meleeSample.swingRad,
    stepSfx,
    dashDust,
    motion,
  };
}

// ---------------------------------------------------------------------------
// Dual-Layer Draw Helpers via `drawBansungSprite` (d18, d19, d41)
// ---------------------------------------------------------------------------

/**
 * Draw grounded shadow (Pass 2 ground plane) plus optional co-op team ring under hero feet.
 */
export function drawHeroShadow(ctx: CanvasRenderingContext2D, opts: HeroShadowDrawOpts): boolean {
  if (!ctx || !Number.isFinite(opts.x) || !Number.isFinite(opts.y)) return false;
  const hero = getBansungHero(opts.heroId ?? 'mascot');
  const baseScale = opts.heroScale ?? hero.pixelScale;
  const scaleRatio = baseScale / HERO_PIXEL_SCALE;
  const shadowScale = Math.max(0.25, opts.shadowScale ?? 1) * scaleRatio;
  const alpha = clamp(opts.alpha ?? 0.45, 0, 1);

  if (opts.teamRingColor && alpha > 0.01) {
    const r = (opts.teamRingRadius ?? 14) * shadowScale;
    ctx.save();
    ctx.globalAlpha *= alpha * 0.85;
    ctx.strokeStyle = opts.teamRingColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(Math.round(opts.x), Math.round(opts.y) + 1, r, r * 0.48, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  return drawBansungSprite(ctx, {
    clipKey: 'shadow',
    category: 'ui',
    x: opts.x,
    y: opts.y,
    animTimeSec: 0,
    frameIdx: 0,
    scale: shadowScale * 0.9,
    alpha,
  });
}

/**
 * Draw the upright hero body layer (`48x48` custom sheet, Tier-2 Miragine fallback, or Tier-3 silhouette).
 * Body sprites NEVER spin 360°; only subtle kickback/dash `leanRad` around foot pivot is applied.
 */
/**
 * Đêm Zombie (spec 007): chọn clip hướng NHÌN XUỐNG / NHÌN LÊN từ atlas 6×8
 * (`hero_<id>_{idle,walk}_{down,up}`) khi người chơi ngắm gần thẳng đứng.
 * Hướng trái/phải vẫn dùng dải nghiêng (khớp rig súng xoay 360°).
 */
const DIRECTIONAL_SIN_THRESHOLD = HERO_VIEW_DIR_ENTER;

/** Cập nhật hướng nhìn có hysteresis: vào ở |sin| > ENTER, chỉ thoát khi |sin| < EXIT. */
export function stepHeroViewDir(prev: HeroViewDir, aimTheta: number): HeroViewDir {
  if (!Number.isFinite(aimTheta)) return prev;
  const sv = Math.sin(aimTheta);
  if (prev === 'down' && sv > HERO_VIEW_DIR_EXIT) return 'down';
  if (prev === 'up' && sv < -HERO_VIEW_DIR_EXIT) return 'up';
  if (sv > HERO_VIEW_DIR_ENTER) return 'down';
  if (sv < -HERO_VIEW_DIR_ENTER) return 'up';
  return null;
}

export function resolveDirectionalHeroClip(
  heroId: BansungHeroId,
  animState: BansungHeroAnimState,
  aimTheta: number | undefined,
  viewDir?: HeroViewDir,
): string | null {
  // Chỉ idle / chạy / bắn mới dùng dải 4 hướng; dash, choáng, gục, chết luôn dùng dải nghiêng.
  const stateKey =
    animState === 'run' ? 'walk' : animState === 'idle' || animState === 'shoot' ? 'idle' : null;
  if (!stateKey) return null;
  let dir: HeroViewDir;
  if (viewDir !== undefined) {
    dir = viewDir;
  } else {
    if (aimTheta === undefined || !Number.isFinite(aimTheta)) return null;
    const sv = Math.sin(aimTheta);
    dir = sv > DIRECTIONAL_SIN_THRESHOLD ? 'down' : sv < -DIRECTIONAL_SIN_THRESHOLD ? 'up' : null;
  }
  if (!dir) return null;
  const key = `hero_${heroId}_${stateKey}_${dir}`;
  const meta = getClipMeta(key);
  if (!meta || !getSpriteImage(meta.url)) return null;
  return key;
}

export function drawHeroBodyLayer(ctx: CanvasRenderingContext2D, opts: HeroBodyDrawOpts): boolean {
  if (!ctx || !Number.isFinite(opts.x) || !Number.isFinite(opts.y)) return false;

  const hero = getBansungHero(opts.heroId);
  const directionalKey = resolveDirectionalHeroClip(
    opts.heroId,
    opts.animState,
    opts.aimTheta,
    opts.viewDir,
  );
  // Đang bắn trong dải nhìn thẳng/sau lưng: dùng nhịp thở idle theo thời gian (dải shoot chỉ có ở hướng nghiêng)
  const bodyFrameIdx = directionalKey && opts.animState === 'shoot' ? undefined : opts.frameIdx;
  const clipKey = directionalKey ?? opts.clipKey ?? resolveHeroClipKey(opts.heroId, opts.animState);
  const meta = getClipMeta(clipKey);
  const isMiragineSheet = meta?.nativeFacing === 'left' || clipKey.startsWith('miragine_');
  const baseScale = opts.heroScale ?? (isMiragineSheet ? 1 : hero.pixelScale);

  const m = opts.motion;
  const drawX = opts.x + (m?.dx ?? 0);
  const drawY = opts.y + (m?.dy ?? 0) + (m?.hopY ?? 0);
  const sx = m?.sx ?? 1;
  const sy = m?.sy ?? 1;
  const leanRad = m?.leanRad ?? 0;
  const alpha = clamp((opts.alpha ?? 1) * (m?.alpha ?? 1), 0, 1);
  if (alpha <= 0.005) return false;

  const spriteOpts: DrawSpriteOpts = {
    clipKey,
    category: 'hero',
    x: drawX,
    y: drawY,
    animTimeSec: opts.animTimeSec ?? 0,
    frameIdx: bodyFrameIdx,
    facingRight: opts.facingRight,
    scale: baseScale,
    scaleX: sx,
    scaleY: sy,
    alpha,
    hitFlashAlpha: opts.hitFlashAlpha ?? 0,
    tint: opts.tint ?? 'white',
  };

  // Apply subtle kickback/dash lean around foot pivot without using `opts.rotationRad`
  // (since `drawBansungSprite` disables `facingRight` horizontal mirroring when `rotationRad` is set).
  if (leanRad !== 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(drawX), Math.round(drawY));
    ctx.rotate(leanRad);
    const drawn = drawBansungSprite(ctx, { ...spriteOpts, x: 0, y: 0 });
    ctx.restore();
    return drawn;
  }

  return drawBansungSprite(ctx, spriteOpts);
}

/**
 * Draw zero-GC pixel evolution visuals in aligned weapon-local space for Mk.II-Mk.IV weapons:
 * - Guns (`pistol`/`rifle`/`heavy`): rail highlights, twin fins / dual-barrel, tri-barrel halo + muzzle flare
 * - Melee (`crescent_blade`/`reaper_scythe`/`shock_baton`): crossguard rune, crescent edge gleam & tip star
 * - Tomes (`arcane_book`): grimoire aura & orbiting arcane sigil diamonds
 * - Staves (`lightning_staff`): shaft rune bands, tip crystal flare & orbiting mythic crest
 */
function drawWeaponEvolutionAccents(
  ctx: CanvasRenderingContext2D,
  rig: BansungAimRigResult,
  weaponRig: BansungWeaponRigSpec,
  evo: BansungWeaponEvolutionStats,
  theta: number,
  scale: number,
  alpha: number,
  tSec: number,
  pass: 'back' | 'front',
): void {
  if (evo.tier <= 1) return;

  const barrelLenX = Math.max(8, weaponRig.muzzleX - weaponRig.gripX);
  const muzzleLocalY = weaponRig.muzzleY - weaponRig.gripY;
  const pulse = 0.72 + 0.28 * Math.sin(tSec * 7.5);
  const prevComp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(rig.gripX), Math.round(rig.gripY));
  ctx.rotate(theta);
  ctx.scale(scale, scale * rig.gunFlipY);

  if (weaponRig.holdType === 'melee') {
    const tipX = barrelLenX;
    const tipY = muzzleLocalY;
    const midX = barrelLenX * 0.56;
    const midY = muzzleLocalY * 0.5;
    const arcR = Math.max(11, barrelLenX * 0.44);

    if (pass === 'back') {
      if (evo.tier >= 3) {
        ctx.globalCompositeOperation = 'lighter';
        if (evo.tier >= 4) {
          ctx.globalAlpha = prevAlpha * alpha * (0.3 + 0.14 * pulse);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(midX, midY, arcR + 2, -1.05, 0.85);
          ctx.stroke();
        }
        ctx.globalAlpha = prevAlpha * alpha * (0.38 + 0.14 * pulse);
        ctx.strokeStyle = evo.auraColor;
        ctx.lineWidth = evo.tier >= 4 ? 1.8 : 1.5;
        ctx.beginPath();
        ctx.arc(midX, midY, arcR, -1.0, 0.8);
        ctx.stroke();

        ctx.globalCompositeOperation = prevComp;
        ctx.globalAlpha = prevAlpha * alpha * 0.9;
        ctx.fillStyle = evo.tier >= 4 ? '#ef4444' : '#7e22ce';
        ctx.fillRect(1, -3, 4, 6);
        ctx.fillStyle = evo.barrelAccentColor;
        ctx.fillRect(2, -2, 2, 4);
      }
    } else {
      ctx.globalAlpha = prevAlpha * alpha * (0.78 + 0.14 * pulse);
      ctx.strokeStyle = evo.barrelAccentColor;
      ctx.lineWidth = evo.tier >= 4 ? 2.2 : 1.6;
      ctx.beginPath();
      ctx.moveTo(4, -1);
      ctx.quadraticCurveTo(midX, midY - 5, tipX, tipY);
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = prevAlpha * alpha * (0.55 + 0.2 * pulse);
      ctx.fillStyle = evo.tier >= 4 ? '#fffbeb' : '#faf5ff';
      ctx.fillRect(Math.round(tipX) - 1, Math.round(tipY) - 1, 3, 3);

      if (evo.tier >= 4) {
        const orbitAng = tSec * 4.5;
        const sx = midX + Math.cos(orbitAng) * 7;
        const sy = midY + Math.sin(orbitAng) * 7;
        ctx.globalCompositeOperation = prevComp;
        ctx.globalAlpha = prevAlpha * alpha * 0.95;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(sx) - 2, Math.round(sy), 5, 1);
        ctx.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 5);
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  } else if (weaponRig.id === 'arcane_book') {
    const bookX = 8;
    const bookY = 0;

    if (pass === 'back') {
      if (evo.tier >= 3) {
        ctx.globalCompositeOperation = 'lighter';
        if (evo.tier >= 4) {
          ctx.globalAlpha = prevAlpha * alpha * (0.3 + 0.12 * pulse);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(bookX, bookY, 11, 12, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = prevAlpha * alpha * (0.38 + 0.15 * pulse);
        ctx.strokeStyle = evo.auraColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(bookX, bookY, 9, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = prevAlpha * alpha * 0.88;
      ctx.fillStyle = evo.barrelAccentColor;
      ctx.fillRect(bookX - 1, bookY - 3, 2, 6);

      const runeCount = evo.tier >= 4 ? 4 : evo.tier;
      const baseAng = tSec * 3.4;
      for (let i = 0; i < runeCount; i++) {
        const ang = baseAng + (i * Math.PI * 2) / runeCount;
        const rx = Math.round(bookX + Math.cos(ang) * 9);
        const ry = Math.round(bookY + Math.sin(ang) * 10);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = prevAlpha * alpha * (0.58 + 0.2 * pulse);
        ctx.fillStyle = evo.tier >= 4 && (i & 1) === 1 ? '#ef4444' : evo.auraColor;
        ctx.fillRect(rx - 1, ry - 1, 3, 3);
        ctx.globalCompositeOperation = prevComp;
        ctx.globalAlpha = prevAlpha * alpha * 0.95;
        ctx.fillStyle = evo.tier >= 4 ? '#fffbeb' : '#ffffff';
        ctx.fillRect(rx, ry, 1, 1);
      }
    }
  } else if (weaponRig.holdType === 'staff') {
    if (pass === 'back') {
      if (evo.tier >= 3) {
        ctx.globalCompositeOperation = 'lighter';
        if (evo.tier >= 4) {
          ctx.globalAlpha = prevAlpha * alpha * (0.28 + 0.12 * pulse);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(barrelLenX, muzzleLocalY, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = prevAlpha * alpha * (0.38 + 0.14 * pulse);
        ctx.strokeStyle = evo.auraColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(barrelLenX, muzzleLocalY, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalCompositeOperation = prevComp;
        ctx.globalAlpha = prevAlpha * alpha * 0.88;
        ctx.fillStyle = evo.barrelAccentColor;
        ctx.fillRect(Math.round(barrelLenX * 0.3), muzzleLocalY - 3, 2, 6);
        ctx.fillRect(Math.round(barrelLenX * 0.6), muzzleLocalY - 3, 2, 6);
      }
    } else {
      ctx.globalAlpha = prevAlpha * alpha * 0.82;
      ctx.fillStyle = evo.barrelAccentColor;
      ctx.fillRect(5, muzzleLocalY - 1, Math.max(4, barrelLenX - 8), 2);

      const mScale = evo.muzzleScale;
      ctx.globalCompositeOperation = 'lighter';
      if (evo.tier >= 4) {
        ctx.globalAlpha = prevAlpha * alpha * (0.48 + 0.18 * pulse);
        ctx.fillStyle = '#ef4444';
        const rOuter = 4.6 * mScale;
        ctx.fillRect(barrelLenX - rOuter * 0.5, muzzleLocalY - rOuter * 0.5, rOuter, rOuter);
      }
      ctx.globalAlpha = prevAlpha * alpha * (0.62 + 0.18 * pulse);
      ctx.fillStyle = evo.auraColor;
      const rInner = 3 * mScale;
      ctx.fillRect(barrelLenX - rInner * 0.5, muzzleLocalY - rInner * 0.5, rInner, rInner);
      ctx.fillStyle = evo.tier >= 4 ? '#fffbeb' : '#ffffff';
      ctx.fillRect(barrelLenX - 1, muzzleLocalY - 1, 2, 2);

      if (evo.tier >= 4) {
        const orbitAng = tSec * 4.2;
        const sx = barrelLenX * 0.72 + Math.cos(orbitAng) * 7;
        const sy = muzzleLocalY + Math.sin(orbitAng) * 6;
        ctx.globalCompositeOperation = prevComp;
        ctx.globalAlpha = prevAlpha * alpha * 0.95;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(sx) - 2, Math.round(sy), 5, 1);
        ctx.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 5);
        ctx.fillStyle = '#fffbeb';
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
    }
  } else if (pass === 'back') {
    if (evo.tier === 3) {
      // Twin violet wing fins flanking receiver + dual-barrel silhouette
      ctx.globalAlpha = prevAlpha * alpha * 0.88;
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(1, muzzleLocalY - 6, 8, 2);
      ctx.fillRect(1, muzzleLocalY + 4, 8, 2);
      ctx.fillStyle = evo.barrelAccentColor; // #c084fc
      ctx.fillRect(3, muzzleLocalY - 4, barrelLenX - 1, 2);
      ctx.fillRect(3, muzzleLocalY + 2, barrelLenX - 1, 2);
    } else if (evo.tier >= 4) {
      // Mythic golden-crimson evolution halo + tri-barrel base frame
      const midX = barrelLenX * 0.48;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = prevAlpha * alpha * (0.28 + 0.12 * pulse);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(midX, muzzleLocalY, Math.max(10, barrelLenX * 0.52), 9, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = prevAlpha * alpha * (0.36 + 0.14 * pulse);
      ctx.strokeStyle = evo.auraColor; // #fbbf24
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(midX, muzzleLocalY, Math.max(8, barrelLenX * 0.44), 7, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalCompositeOperation = prevComp;
      ctx.globalAlpha = prevAlpha * alpha * 0.92;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(2, muzzleLocalY - 5, barrelLenX + 2, 2);
      ctx.fillRect(2, muzzleLocalY + 3, barrelLenX + 2, 2);
      ctx.fillStyle = evo.barrelAccentColor; // #fbbf24
      ctx.fillRect(3, muzzleLocalY - 1, barrelLenX + 3, 2);
    }
  } else {
    // Front accents: glowing barrel core + muzzle flare + mythic orbiting pixel star crest
    const mScale = evo.muzzleScale;
    if (evo.tier === 2) {
      ctx.globalAlpha = prevAlpha * alpha * 0.78;
      ctx.fillStyle = evo.barrelAccentColor; // #38bdf8
      ctx.fillRect(4, muzzleLocalY - 1, Math.max(5, barrelLenX - 2), 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(barrelLenX - 1, muzzleLocalY - 1, 4, 2);

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = prevAlpha * alpha * (0.45 + 0.15 * pulse);
      ctx.fillStyle = evo.auraColor;
      const r = 3 * mScale;
      ctx.fillRect(barrelLenX - r * 0.5, muzzleLocalY - r * 0.5, r, r);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(barrelLenX - 1, muzzleLocalY - 1, 2, 2);
    } else if (evo.tier === 3) {
      ctx.globalAlpha = prevAlpha * alpha * 0.85;
      ctx.fillStyle = evo.barrelAccentColor; // #c084fc
      ctx.fillRect(barrelLenX - 3, muzzleLocalY - 4, 5, 2);
      ctx.fillRect(barrelLenX - 3, muzzleLocalY + 2, 5, 2);

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = prevAlpha * alpha * (0.52 * pulse);
      ctx.fillStyle = evo.auraColor;
      const r = 3.2 * mScale;
      ctx.fillRect(barrelLenX - r * 0.5, muzzleLocalY - r * 0.5, r, r);
      ctx.fillStyle = '#faf5ff';
      ctx.fillRect(barrelLenX - 1, muzzleLocalY - 1, 2, 2);
    } else if (evo.tier >= 4) {
      // Dramatic 1.65x golden-crimson muzzle anchor glow
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = prevAlpha * alpha * (0.48 + 0.18 * pulse);
      ctx.fillStyle = '#ef4444';
      const rOuter = 4.6 * mScale;
      ctx.fillRect(barrelLenX - rOuter * 0.5, muzzleLocalY - rOuter * 0.5, rOuter, rOuter);

      ctx.globalAlpha = prevAlpha * alpha * (0.68 + 0.18 * pulse);
      ctx.fillStyle = evo.auraColor; // #fbbf24
      const rInner = 3.2 * mScale;
      ctx.fillRect(barrelLenX - rInner * 0.5, muzzleLocalY - rInner * 0.5, rInner, rInner);
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(barrelLenX - 1.5, muzzleLocalY - 1.5, 3, 3);

      // Orbiting mythic pixel star crest
      const orbitAng = tSec * 4.2;
      const sx = barrelLenX * 0.45 + Math.cos(orbitAng) * 8;
      const sy = muzzleLocalY + Math.sin(orbitAng) * 6;
      ctx.globalCompositeOperation = prevComp;
      ctx.globalAlpha = prevAlpha * alpha * 0.95;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(Math.round(sx) - 2, Math.round(sy), 5, 1);
      ctx.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 5);
      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  ctx.globalCompositeOperation = prevComp;
  ctx.globalAlpha = prevAlpha;
  ctx.restore();
}

/** Màu tay áo + găng của tay cầm súng (khớp art `tools/bansung/night_art/heroes.py`). */
const HERO_ARM_OUTLINE = '#1b1726';
const HERO_ARM_COLORS: Readonly<
  Record<BansungHeroId, { readonly sleeve: string; readonly sleeveLight: string; readonly glove: string; readonly gloveLight: string }>
> = {
  ranger: { sleeve: '#2b3a55', sleeveLight: '#4a5c7a', glove: '#1f2937', gloveLight: '#22d3ee' },
  knight: { sleeve: '#3b5bdb', sleeveLight: '#7b93f0', glove: '#8b98ad', gloveLight: '#e9ecef' },
  pyro: { sleeve: '#a61e1e', sleeveLight: '#d9534a', glove: '#3b2a24', gloveLight: '#ff922b' },
  laser: { sleeve: '#e9ecef', sleeveLight: '#ffffff', glove: '#343a40', gloveLight: '#e64980' },
  mascot: { sleeve: '#f1f3f5', sleeveLight: '#ffffff', glove: '#1f2a44', gloveLight: '#22b8cf' },
};

/**
 * Tay cầm súng vẽ bằng pixel nguyên từ vai → báng súng (zero-alloc, không anti-alias),
 * để súng luôn "dính" vào người ở mọi góc 360° thay vì lơ lửng trước bụng.
 */
function drawGunArm(
  ctx: CanvasRenderingContext2D,
  rig: BansungAimRigResult,
  heroId: BansungHeroId,
  alpha: number,
): void {
  if (!Number.isFinite(rig.shoulderX) || !Number.isFinite(rig.shoulderY)) return;
  const arm = HERO_ARM_COLORS[heroId] ?? HERO_ARM_COLORS.mascot;
  const x0 = Math.round(rig.shoulderX);
  const y0 = Math.round(rig.shoulderY);
  const x1 = Math.round(rig.gripX);
  const y1 = Math.round(rig.gripY);
  const steps = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = HERO_ARM_OUTLINE;
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / steps);
    const y = Math.round(y0 + ((y1 - y0) * k) / steps);
    ctx.fillRect(x - 2, y - 2, 5, 5);
  }
  ctx.fillStyle = arm.sleeve;
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / steps);
    const y = Math.round(y0 + ((y1 - y0) * k) / steps);
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  ctx.fillStyle = arm.sleeveLight;
  ctx.fillRect(x0 - 1, y0 - 1, 2, 1);
  ctx.globalAlpha = prevAlpha;
}

/**
 * Draw the shoulder-pivoted weapon layer (`d19 §4`):
 * - Uses hysteresis-coupled `rig.gunFlipY` instead of `cos(aim) < 0` (`flipAimY: false`)
 * - Strict `imageSmoothingEnabled = false` crisp pixel rotation
 * - Recoil displacement acts strictly via reduced `orbit` (never non-uniform weapon scale)
 * - Optional crisp pixel hand/glove drawn over weapon grip when front-layered
 * - Renders zero-GC Tier 2-4 Gun Evolution accents when `weaponTier > 1`
 */
export function drawWeaponLayer(ctx: CanvasRenderingContext2D, opts: WeaponLayerDrawOpts): boolean {
  const { rig } = opts;
  if (!ctx || !Number.isFinite(rig.gripX) || !Number.isFinite(rig.gripY)) return false;

  const alpha = clamp(opts.alpha ?? 1, 0, 1);
  if (alpha <= 0.005) return false;

  const weaponId = resolveWeaponId(opts.weaponId);
  const weaponRig = getWeaponRigSpec(weaponId);
  const clipKey = opts.clipKey ?? resolveWeaponClipKey(weaponId);
  const scale = opts.scale ?? weaponRig.scale;
  const snapOffset = (opts.snapAngle ?? 0) * rig.gunFlipY;
  const theta = wrapPi(rig.drawTheta + snapOffset);
  const evo = getWeaponEvolutionStats(weaponId, opts.weaponTier ?? 1);
  const tSec =
    opts.visualTimeMs !== undefined && Number.isFinite(opts.visualTimeMs)
      ? opts.visualTimeMs / 1000
      : (opts.animTimeSec ?? defaultVisualTimeMs() / 1000);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts.drawFrontHand !== false) {
    drawGunArm(ctx, rig, opts.heroId ?? 'mascot', alpha);
  }
  if (evo.tier > 1) {
    drawWeaponEvolutionAccents(ctx, rig, weaponRig, evo, theta, scale, alpha, tSec, 'back');
  }

  const drawn = drawBansungSprite(ctx, {
    clipKey,
    category: 'weapon',
    x: rig.gripX,
    y: rig.gripY,
    animTimeSec: opts.animTimeSec ?? 0,
    frameIdx: opts.frameIdx ?? 0,
    rotationRad: theta,
    flipAimY: false,
    scale,
    scaleX: 1,
    scaleY: rig.gunFlipY,
    alpha,
    hitFlashAlpha: opts.hitFlashAlpha ?? 0,
    tint: opts.tint ?? 'white',
  });

  if (evo.tier > 1) {
    drawWeaponEvolutionAccents(ctx, rig, weaponRig, evo, theta, scale, alpha, tSec, 'front');
  }

  if (opts.drawFrontHand !== false && rig.zOrder === 'front') {
    const arm = HERO_ARM_COLORS[opts.heroId ?? 'mascot'] ?? HERO_ARM_COLORS.mascot;
    const handX = Math.round(rig.gripX);
    const handY = Math.round(rig.gripY);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = HERO_ARM_OUTLINE;
    ctx.fillRect(handX - 2, handY - 2, 5, 5);
    ctx.fillStyle = arm.glove;
    ctx.fillRect(handX - 1, handY - 1, 3, 3);
    ctx.fillStyle = arm.gloveLight;
    ctx.fillRect(handX - 1, handY - 1, 2, 1);
  }

  ctx.restore();
  return drawn;
}

/**
 * Complete dual-layer hero + weapon renderer (d18 + d19 + d41 Pass 3):
 * - Draws behind-body weapon BEFORE body when `rig.zOrder === 'behind'` (`sin(aim) < -0.15`)
 * - Draws body BEFORE front weapon + front grip glove when `rig.zOrder === 'front'`
 */
export function drawHeroWithWeapon(
  ctx: CanvasRenderingContext2D,
  opts: DrawHeroWithWeaponOpts,
): void {
  const { pose, rig } = opts;
  const alpha = clamp(opts.alpha ?? 1, 0, 1);
  if (alpha <= 0.005) return;

  if (opts.drawShadow) {
    drawHeroShadow(ctx, {
      x: opts.x + pose.motion.dx,
      y: opts.y,
      heroId: opts.heroId,
      shadowScale: pose.motion.shadowScale,
      heroScale: opts.heroScale,
      alpha: (opts.shadowAlpha ?? 0.45) * alpha,
      teamRingColor: opts.teamRingColor,
    });
  }

  const hideWeapon =
    (opts.hideWeaponWhenDead ?? true) && pose.dead
      ? true
      : (opts.hideWeaponWhenDowned ?? false) && pose.downed;

  const hitFlashAlpha = opts.hitFlashAlpha ?? pose.hitFlashAlpha;
  const bodyOpts: HeroBodyDrawOpts = {
    x: opts.x,
    y: opts.y,
    heroId: opts.heroId,
    animState: pose.animState,
    frameIdx: pose.frameIdx,
    animTimeSec: pose.animTimeSec,
    facingRight: rig.facingRight,
    heroScale: opts.heroScale,
    alpha,
    hitFlashAlpha,
    tint: opts.tint,
    clipKey: pose.clipKey,
    aimTheta: rig.aimTheta,
    viewDir: opts.viewDir,
    motion: pose.motion,
  };

  const weaponOpts: WeaponLayerDrawOpts = {
    rig,
    weaponId: opts.weaponId,
    weaponTier: opts.weaponTier,
    heroId: opts.heroId,
    clipKey: pose.weaponClipKey,
    frameIdx: pose.weaponFrameIdx,
    animTimeSec: pose.weaponAnimTimeSec,
    visualTimeMs: opts.visualTimeMs ?? pose.animTimeSec * 1000,
    scale: opts.weaponScale,
    snapAngle: opts.snapAngle,
    alpha: alpha * pose.motion.alpha,
    hitFlashAlpha,
    tint: opts.tint,
    drawFrontHand: opts.drawFrontHand,
  };

  if (hideWeapon) {
    drawHeroBodyLayer(ctx, bodyOpts);
    return;
  }

  if (rig.zOrder === 'behind') {
    drawWeaponLayer(ctx, weaponOpts);
    drawHeroBodyLayer(ctx, bodyOpts);
  } else {
    drawHeroBodyLayer(ctx, bodyOpts);
    drawWeaponLayer(ctx, weaponOpts);
  }
}

/** Alias matching `d18` / `d41` naming conventions for dual-layer hero drawing. */
export const drawHeroRig = drawHeroWithWeapon;

/**
 * Compute world anchor above hero head (`hero.rig.headTopY`) for stun stars,
 * health bars, and revive indicators (d18 §5.4).
 */
export function getHeroHeadAnchor(
  x: number,
  y: number,
  heroId: BansungHeroId,
  motion?: Pick<HeroMotionTransform, 'dx' | 'dy' | 'hopY' | 'sy'>,
  heroScale?: number,
): HeroHeadAnchor {
  const hero = getBansungHero(heroId);
  const scale = (heroScale ?? hero.pixelScale) / HERO_PIXEL_SCALE;
  const dx = motion?.dx ?? 0;
  const dy = (motion?.dy ?? 0) + (motion?.hopY ?? 0);
  const sy = motion?.sy ?? 1;
  return {
    x: Math.round(x + dx),
    y: Math.round(y + dy + hero.rig.headTopY * scale * sy),
  };
}

// ---------------------------------------------------------------------------
// Managed Per-Entity Animator Controller (integrates Store + Motion + Rig)
// ---------------------------------------------------------------------------

export interface DrawInterpPlayerOpts {
  readonly targetX?: number;
  readonly targetY?: number;
  readonly dtMs?: number;
  readonly visualTimeMs?: number;
  readonly drawShadow?: boolean;
  readonly teamRingColor?: string;
  readonly tint?: TintMode;
  readonly weaponTier?: number;
}

/**
 * Stateful per-entity manager keeping Miragine run phase, shoot kick timer,
 * hysteresis facing, and melee swing cycles synchronized across client frames.
 */
export class BansungHeroAnimManager {
  private readonly entities = new Map<number, HeroAnimEntityState>();
  private readonly recoilScratch: RecoilPivotResult = {
    kickPos: 0,
    snapAngle: 0,
    pivotOffsetX: 0,
    pivotOffsetY: 0,
  };

  getOrCreate(entityId: number, heroId: BansungHeroId = 'mascot'): HeroAnimEntityState {
    let state = this.entities.get(entityId);
    if (!state) {
      state = createHeroAnimState(entityId, heroId);
      this.entities.set(entityId, state);
    }
    return state;
  }

  get(entityId: number): HeroAnimEntityState | undefined {
    return this.entities.get(entityId);
  }

  /** Step animation state for an arbitrary entity and solve its pose. */
  stepHero(input: HeroAnimStepInput): HeroAnimPose {
    const tracker = this.getOrCreate(input.entityId, input.heroId);
    return resolveHeroAnim(input, tracker);
  }

  /** Notify manager that a local or remote player fired/swung at `nowMs`. */
  triggerShot(entityId: number, weaponId?: BansungWeaponId | number, nowMs = defaultVisualTimeMs()): void {
    const tracker = this.entities.get(entityId);
    if (!tracker) return;
    tracker.lastAtkAtMs = nowMs;
    tracker.shootAgeMs = 0;
    const wid = resolveWeaponId(weaponId ?? tracker.weaponId);
    tracker.weaponId = wid;
    if (getWeaponRigSpec(wid).holdType === 'melee') {
      tracker.meleeSwingAgeMs = 0;
      tracker.meleeComboDir = tracker.meleeComboDir === 1 ? -1 : 1;
    }
  }

  /** Build step pose and 360-deg shoulder rig from an interpolated snapshot player. */
  evaluatePlayer(
    player: InterpPlayer,
    opts?: {
      readonly targetX?: number;
      readonly targetY?: number;
      readonly dtMs?: number;
      readonly visualTimeMs?: number;
    },
  ): {
    readonly pose: HeroAnimPose;
    readonly rig: BansungAimRigResult;
    readonly snapAngle: number;
    readonly viewDir: HeroViewDir;
  } {
    const heroId = BANSUNG_HERO_IDS[player.heroIdx] ?? 'mascot';
    const weaponId = resolveWeaponId(player.weaponIdx);
    const visualTimeMs = opts?.visualTimeMs ?? defaultVisualTimeMs();
    const tracker = this.getOrCreate(player.id, heroId);

    const recoil = bansungMotion.readGunRecoil(player.id, player.aim, this.recoilScratch);

    const pose = resolveHeroAnim(
      {
        entityId: player.id,
        heroId,
        weaponId,
        x: player.x,
        y: player.y,
        targetX: opts?.targetX,
        targetY: opts?.targetY,
        aimRad: player.aim,
        state: player.state,
        flags: player.flags,
        hp: player.hp,
        dtMs: opts?.dtMs,
        visualTimeMs,
        atkAtMs: player.atkAt,
        hitFlashAtMs: player.hitFlashAt,
        recoilPx: recoil.kickPos,
        recoilSnapRad: recoil.snapAngle,
      },
      tracker,
    );

    const rig = solveHeroAimRig({
      entX: player.x,
      entY: player.y,
      heroId,
      weaponId,
      prevRight: tracker.facingRight,
      targetX: opts?.targetX,
      targetY: opts?.targetY,
      aimRad: player.aim,
      pose,
      recoilPx: recoil.kickPos,
    });

    // Keep hysteresis facing aligned with the final solved rig
    tracker.facingRight = rig.facingRight;
    tracker.viewDir = stepHeroViewDir(tracker.viewDir, rig.aimTheta);

    return { pose, rig, snapAngle: recoil.snapAngle, viewDir: tracker.viewDir };
  }

  /** Evaluate and draw an interpolated `InterpPlayer` in one call. */
  drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: InterpPlayer,
    opts?: DrawInterpPlayerOpts,
  ): { readonly pose: HeroAnimPose; readonly rig: BansungAimRigResult } {
    const { pose, rig, snapAngle, viewDir } = this.evaluatePlayer(player, opts);
    const playerTier = (player as InterpPlayer & { readonly weaponTier?: number }).weaponTier;
    drawHeroWithWeapon(ctx, {
      x: player.x,
      y: player.y,
      heroId: pose.heroId,
      weaponId: pose.weaponId,
      weaponTier: opts?.weaponTier ?? playerTier,
      pose,
      rig,
      snapAngle,
      alpha: player.spawnAlpha,
      tint: opts?.tint,
      drawShadow: opts?.drawShadow,
      teamRingColor: opts?.teamRingColor,
      visualTimeMs: opts?.visualTimeMs,
      viewDir,
    });
    return { pose, rig };
  }

  /** Remove trackers for entities no longer present in active snapshots. */
  pruneMissing(activeIds: ReadonlySet<number>): void {
    for (const id of this.entities.keys()) {
      if (!activeIds.has(id)) {
        this.entities.delete(id);
      }
    }
  }

  reset(): void {
    this.entities.clear();
  }
}

export const bansungHeroAnim = new BansungHeroAnimManager();
