/**
 * Client tactile motion, dodge-dash afterimages, Miragine squash-stretch curves,
 * damped gun/camera springs, 30ms visual hitstop, and dynamic crosshair bloom
 * for `bansung` mode (specs d18, d20, d21).
 *
 * Purely visual/local feedback—never mutates authoritative server state and uses
 * pre-allocated pools/buffers for zero per-frame GC pressure.
 */
import {
  BANSUNG_DASH,
  BANSUNG_HERO_RUN_CADENCE,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_LEFT,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_WEAPONS,
  getBansungHero,
  getWeaponByIdx,
  sampleDashVisualTransform,
  type BansungBiome,
  type BansungHeroAnimState,
  type BansungHeroId,
  type BansungUnitState,
  type BansungWeaponId,
} from '../../../shared/src';

// ============================================================================
// 1. Tuning Constants & Recoil Profiles (d20, d21)
// ============================================================================

/** Motion, spring, trauma, hitstop, and pooled VFX constants (d20 / d21). */
export const MOTION_CFG = {
  GUN_STIFFNESS: 420,
  GUN_DAMPING: 28,
  SNAP_STIFFNESS: 360,
  SNAP_DAMPING: 26,
  MAX_SNAP_RAD: 0.52,
  MAX_KICK_PX: 16,
  MIN_KICK_PX: -8,
  GUN_IDLE_PRUNE_MS: 2000,
  CAM_STIFFNESS: 260,
  CAM_DAMPING: 24,
  MAX_CAM_KICK_PX: 0,
  MAX_SHAKE_PX: 0,
  TRAUMA_DECAY: 2.4,
  BLAST_TRAUMA_RANGE_PX: 480,
  BLAST_HITSTOP_RANGE_PX: 420,
  DASH_CAM_KICK_PX: 0,
  HITSTOP_CRIT_MS: 30,
  HITSTOP_EXPLOSION_MS: 30,
  HITSTOP_BOSS_MS: 45,
  HITSTOP_COOLDOWN_MS: 140,
  HITSTOP_TREMOR_PX: 0,
  MOVE_BLOOM_PX: 3.5,
  DASH_BLOOM_PX: 4.0,
  HIT_MARKER_MS: 110,
  SPRING_DT_CAP_S: 0.05,
  MAX_SPRING_SUBSTEP_S: 0.025,
  GHOST_POOL_SIZE: BANSUNG_DASH.GHOST_POOL_SIZE,
  GHOST_PER_DASH: BANSUNG_DASH.GHOST_U.length,
  GHOST_LIFE_S: BANSUNG_DASH.GHOST_LIFE_S,
  GHOST_BASE_ALPHA: 0.58,
  GHOST_TINT_CACHE_MAX: 64,
  DUST_RING_POOL_SIZE: 32,
  DUST_RING_LIFE_S: 0.26,
  DUST_RING_RX_START: 8,
  DUST_RING_RX_END: 34,
  DUST_RING_ASPECT_Y: 0.45,
  DUST_PUFF_QUEUE_SIZE: 64,
  DASH_PREDICT_TIMEOUT_MS: 120,
  DASH_TRACKER_PRUNE_MS: 4000,
  REDUCED_SHAKE_SCALE: 0.25,
  SHOOT_KICK_MS: 125,
  TOUCH_RETICLE_DIST_PX: 140,
} as const;

/** Biome-matched takeoff ground ring stroke/fill hex colors (d20). */
export const DUST_RING_COLORS: Readonly<Record<BansungBiome, string>> = {
  desert: '#f1e4c3',
  crypt: '#c9b8a8',
  cyber: '#99e9f2',
};

export type RecoilPresetId =
  | 'pistol'
  | 'rifle'
  | 'smg'
  | 'shotgun'
  | 'railgun'
  | 'launcher'
  | 'melee';

export interface WeaponRecoilProfile {
  readonly kickPx: number;
  readonly muzzleSnapRad: number;
  readonly camKickPx: number;
  readonly traumaAdd: number;
  readonly bloomAdd: number;
  readonly bloomBase: number;
  readonly bloomMax: number;
  readonly bloomDecay: number;
}

/** Canonical d21 weapon recoil & crosshair bloom presets (screen shake/cam kick disabled). */
export const RECOIL_PROFILES: Readonly<Record<RecoilPresetId, WeaponRecoilProfile>> = {
  pistol: {
    kickPx: 4.0,
    muzzleSnapRad: 0.14,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 4.5,
    bloomBase: 5,
    bloomMax: 20,
    bloomDecay: 12.0,
  },
  rifle: {
    kickPx: 5.5,
    muzzleSnapRad: 0.11,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 3.2,
    bloomBase: 6,
    bloomMax: 22,
    bloomDecay: 11.0,
  },
  smg: {
    kickPx: 3.0,
    muzzleSnapRad: 0.08,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 2.6,
    bloomBase: 7,
    bloomMax: 24,
    bloomDecay: 12.5,
  },
  shotgun: {
    kickPx: 11.0,
    muzzleSnapRad: 0.32,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 10.0,
    bloomBase: 11,
    bloomMax: 28,
    bloomDecay: 8.5,
  },
  railgun: {
    kickPx: 13.0,
    muzzleSnapRad: 0.28,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 8.0,
    bloomBase: 4,
    bloomMax: 22,
    bloomDecay: 7.5,
  },
  launcher: {
    kickPx: 12.0,
    muzzleSnapRad: 0.35,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 9.0,
    bloomBase: 8,
    bloomMax: 26,
    bloomDecay: 7.5,
  },
  melee: {
    kickPx: -6.0,
    muzzleSnapRad: 0.0,
    camKickPx: 0,
    traumaAdd: 0,
    bloomAdd: 0.0,
    bloomBase: 4,
    bloomMax: 10,
    bloomDecay: 14.0,
  },
};

function buildWeaponRecoilProfiles(): Readonly<Record<BansungWeaponId, WeaponRecoilProfile>> {
  const out = {} as Record<BansungWeaponId, WeaponRecoilProfile>;
  const ids = Object.keys(BANSUNG_WEAPONS) as BansungWeaponId[];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    const spec = BANSUNG_WEAPONS[id];
    if (id === 'pistol' || id === 'rifle' || id === 'smg' || id === 'shotgun' || id === 'railgun') {
      out[id] = RECOIL_PROFILES[id];
    } else if (spec.category === 'explosive') {
      const ratio = clamp(spec.recoilKickPx / 10, 0.45, 1.0);
      const base = RECOIL_PROFILES.launcher;
      out[id] = {
        kickPx: Number((base.kickPx * ratio).toFixed(2)),
        muzzleSnapRad: Number((base.muzzleSnapRad * ratio).toFixed(3)),
        camKickPx: 0,
        traumaAdd: 0,
        bloomAdd: Number((base.bloomAdd * (0.7 + 0.3 * ratio)).toFixed(2)),
        bloomBase: base.bloomBase,
        bloomMax: base.bloomMax,
        bloomDecay: base.bloomDecay,
      };
    } else if (spec.category === 'melee') {
      out[id] = {
        ...RECOIL_PROFILES.melee,
        camKickPx: 0,
        traumaAdd: 0,
      };
    } else {
      // plasma_rifle, lightning_staff, arcane_book
      const snapRad = Number(((spec.muzzleSnapDeg * Math.PI) / 180).toFixed(3));
      out[id] = {
        kickPx: Math.max(2.5, spec.recoilKickPx),
        muzzleSnapRad: Math.max(0.06, snapRad),
        camKickPx: 0,
        traumaAdd: 0,
        bloomAdd: id === 'plasma_rifle' ? 2.8 : 2.4,
        bloomBase: 5,
        bloomMax: 20,
        bloomDecay: 12.0,
      };
    }
  }
  return out;
}

/** Precomputed recoil/bloom profiles for all 15 canonical `BansungWeaponId`s. */
export const WEAPON_RECOIL_PROFILES: Readonly<Record<BansungWeaponId, WeaponRecoilProfile>> =
  buildWeaponRecoilProfiles();

/** Resolve a `WeaponRecoilProfile` from a preset name, canonical `BansungWeaponId`, or numeric weapon index. */
export function resolveWeaponRecoilProfile(
  weaponOrPreset?: BansungWeaponId | RecoilPresetId | number | null,
): WeaponRecoilProfile {
  if (typeof weaponOrPreset === 'number') {
    const spec = getWeaponByIdx(weaponOrPreset);
    if (spec) return WEAPON_RECOIL_PROFILES[spec.id];
    return RECOIL_PROFILES.pistol;
  }
  if (typeof weaponOrPreset === 'string') {
    if (weaponOrPreset in WEAPON_RECOIL_PROFILES) {
      return WEAPON_RECOIL_PROFILES[weaponOrPreset as BansungWeaponId];
    }
    if (weaponOrPreset in RECOIL_PROFILES) {
      return RECOIL_PROFILES[weaponOrPreset as RecoilPresetId];
    }
  }
  return RECOIL_PROFILES.pistol;
}

// ============================================================================
// 2. Public Data Schemas
// ============================================================================

export interface GunSpringState {
  kickPos: number;
  kickVel: number;
  snapAngle: number;
  snapVel: number;
  lastActiveMs: number;
  idleMs?: number;
}

export interface HitstopState {
  remMs: number;
  lastAtMs: number;
  visualTimeMs: number;
  totalFrozenMs: number;
  active: boolean;
}

export interface CameraJuiceState {
  rx: number;
  ry: number;
  rvx: number;
  rvy: number;
  trauma: number;
  hitstopRemMs: number;
  lastHitstopAt: number;
  visualTimeMs: number;
  shakeX: number;
  shakeY: number;
  offsetX: number;
  offsetY: number;
}

export interface CrosshairState {
  bloomPx: number;
  hitMarkerMs: number;
  hitCrit: boolean;
  reloadRatio: number;
  sweetMin: number;
  sweetMax: number;
  reloadJammed: boolean;
  emptyOrLowEnergy: boolean;
  dryPulseMs: number;
  speedNorm: number;
  isDashing: boolean;
}

export interface HeroMotionTransform {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  hopY: number;
  leanRad: number;
  rollStepRad: number;
  shadowScale: number;
  alpha: number;
  weaponTuckPx: number;
  frameIdx: number;
  stepSfx: boolean;
}

export interface HeroMotionSampleInput {
  animState: BansungHeroAnimState | BansungUnitState;
  frameIdx?: number;
  dashElapsedS?: number;
  dashDurationS?: number;
  shootAgeMs?: number;
  downed?: boolean;
  isIframe?: boolean;
  facingRight?: boolean;
  dashDirSign?: 1 | -1;
  visualTimeMs?: number;
}

export interface HeroDashTracker {
  entityId: number;
  heroId: BansungHeroId;
  active: boolean;
  elapsedS: number;
  durationS: number;
  dirX: number;
  dirY: number;
  dirSign: 1 | -1;
  left: boolean;
  lastX: number;
  lastFootY: number;
  prevX: number;
  prevFootY: number;
  hasPos: boolean;
  ghostEmittedMask: number;
  landDustEmitted: boolean;
  wasDashing: boolean;
  lastSeq: number;
  predictedAtMs: number;
  serverConfirmed: boolean;
  lastSeenMs: number;
  idleMs?: number;
  biome: BansungBiome;
}

export interface DashGhost {
  active: boolean;
  slot: number;
  entityId: number;
  heroId: BansungHeroId;
  x: number;
  footY: number;
  hopY: number;
  left: boolean;
  sheetKey: string;
  frameIdx: number;
  sx: number;
  sy: number;
  leanRad: number;
  tint: string;
  ageS: number;
  lifeS: number;
  alpha: number;
}

export interface DashDustRing {
  active: boolean;
  slot: number;
  x: number;
  footY: number;
  biome: BansungBiome;
  color: string;
  ageS: number;
  lifeS: number;
  rx: number;
  ry: number;
  strokeAlpha: number;
  fillAlpha: number;
}

export interface DashPuffHint {
  active: boolean;
  kind: 'takeoff' | 'landing';
  x: number;
  footY: number;
  dirX: number;
  dirY: number;
  biome: BansungBiome;
  color: string;
  count: number;
}

export interface SyncHeroDashOpts {
  entityId: number;
  heroId: BansungHeroId;
  x: number;
  footY: number;
  flags: number;
  aimRad: number;
  state?: BansungUnitState;
  dashSeq?: number;
  moveVx?: number;
  moveVy?: number;
  nowMs?: number;
  biome?: BansungBiome;
}

export interface TriggerShotJuiceOpts {
  entityId: number;
  aimRad: number;
  weapon?: BansungWeaponId | RecoilPresetId | number | null;
  isLocal: boolean;
  isSpectated?: boolean;
  nowMs?: number;
}

export interface TriggerExplosionJuiceOpts {
  isBossEvent?: boolean;
  triggerHitstop?: boolean;
  strength?: number;
}

export interface RecoilPivotResult {
  kickPos: number;
  snapAngle: number;
  pivotOffsetX: number;
  pivotOffsetY: number;
}

export interface DrawGhostSpriteOpts {
  source?: HTMLImageElement | HTMLCanvasElement | null;
  srcX?: number;
  srcY?: number;
  cellW?: number;
  cellH?: number;
  offX?: number;
  offY?: number;
  nativeFacing?: 'right' | 'left';
  pixelScale?: number;
}

export interface DrawCrosshairOpts {
  nowMs?: number;
  emptyOrLowEnergy?: boolean;
  reloadRatio?: number;
  sweetMin?: number;
  sweetMax?: number;
  reloadJammed?: boolean;
}

// ============================================================================
// 3. Internal Math, Spring & Offscreen Silhouette Cache Helpers
// ============================================================================

const SPRING_SCRATCH: [number, number] = [0, 0];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nowDefault(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function normalizeAnimState(
  state: BansungHeroAnimState | BansungUnitState,
  downed?: boolean,
): BansungHeroAnimState | 'downed' {
  if (typeof state === 'string') {
    return downed && state === 'dead' ? 'downed' : state;
  }
  switch (state) {
    case BANSUNG_STATE_RUN:
      return 'run';
    case BANSUNG_STATE_ATK:
      return 'shoot';
    case BANSUNG_STATE_DASH:
      return 'dash';
    case BANSUNG_STATE_STUN:
      return 'stunned';
    case BANSUNG_STATE_DOWNED:
      return 'downed';
    case BANSUNG_STATE_DEAD:
      return downed ? 'downed' : 'dead';
    case BANSUNG_STATE_IDLE:
    default:
      return 'idle';
  }
}

function sampleDashCurve(elapsedS: number, dirSign: 1 | -1, durationS: number) {
  const scaledElapsedS =
    durationS <= 0
      ? BANSUNG_DASH.DURATION_S
      : durationS === BANSUNG_DASH.DURATION_S
        ? elapsedS
        : elapsedS * (BANSUNG_DASH.DURATION_S / durationS);
  return sampleDashVisualTransform(scaledElapsedS, dirSign);
}

/**
 * Semi-implicit Euler damped spring step with substepping for frame-drop stability
 * and zero-snap deadzone settling. Writes `[nextPos, nextVel]` into `out`.
 */
function advanceSpring1D(
  pos: number,
  vel: number,
  stiffness: number,
  damping: number,
  dtS: number,
  minPos: number,
  maxPos: number,
  posEps: number,
  velEps: number,
  out: [number, number],
): void {
  if (pos === 0 && vel === 0) {
    out[0] = 0;
    out[1] = 0;
    return;
  }
  const steps = dtS > MOTION_CFG.MAX_SPRING_SUBSTEP_S ? 2 : 1;
  const subDt = dtS / steps;
  let p = pos;
  let v = vel;
  for (let i = 0; i < steps; i++) {
    v += (-stiffness * p - damping * v) * subDt;
    p = clamp(p + v * subDt, minPos, maxPos);
  }
  if (Math.abs(p) < posEps && Math.abs(v) < velEps) {
    p = 0;
    v = 0;
  }
  out[0] = p;
  out[1] = v;
}

const ghostTintCache = new Map<string, HTMLCanvasElement>();
const ghostTintBlocked = new WeakSet<object>();

/**
 * Create or fetch a cached solid silhouette (`source-atop` fill) for a single hero dash frame.
 * Returns `null` safely in headless Node environments or when the image is not yet loaded/tainted.
 */
export function getGhostTintCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  srcX: number,
  srcY: number,
  cellW: number,
  cellH: number,
  cacheKey: string,
  tint: string,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || cellW <= 0 || cellH <= 0) return null;
  if ('naturalWidth' in source && source.naturalWidth === 0) return null;
  if (ghostTintBlocked.has(source)) return null;

  const fullKey = `${cacheKey}::${tint}`;
  const hit = ghostTintCache.get(fullKey);
  if (hit) {
    // Refresh LRU insertion order
    ghostTintCache.delete(fullKey);
    ghostTintCache.set(fullKey, hit);
    return hit;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cellW;
  canvas.height = cellH;
  const tctx = canvas.getContext('2d');
  if (!tctx) return null;

  try {
    tctx.imageSmoothingEnabled = false;
    tctx.globalCompositeOperation = 'copy';
    tctx.drawImage(source, srcX, srcY, cellW, cellH, 0, 0, cellW, cellH);
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = tint;
    tctx.fillRect(0, 0, cellW, cellH);
  } catch {
    canvas.width = 0;
    canvas.height = 0;
    ghostTintBlocked.add(source);
    return null;
  }

  if (ghostTintCache.size >= MOTION_CFG.GHOST_TINT_CACHE_MAX) {
    const oldestKey = ghostTintCache.keys().next().value;
    if (oldestKey !== undefined) {
      const evicted = ghostTintCache.get(oldestKey);
      ghostTintCache.delete(oldestKey);
      if (evicted) {
        evicted.width = 0;
        evicted.height = 0;
      }
    }
  }
  ghostTintCache.set(fullKey, canvas);
  return canvas;
}

/** Clear cached offscreen ghost silhouette canvases (used on cleanup/tests). */
export function clearGhostTintCache(): void {
  for (const canvas of ghostTintCache.values()) {
    canvas.width = 0;
    canvas.height = 0;
  }
  ghostTintCache.clear();
}

// ============================================================================
// 4. Miragine Foot-Pivot Squash-Stretch Curves (d18, d20)
// ============================================================================

/**
 * Sample Miragine foot-pivot squash-stretch, hop, lean, i-frame shimmer, and gun tuck
 * transforms across hero animation states (`idle`, `run`, `shoot`, `dash`, `stunned`, `downed`, `dead`).
 */
export function sampleHeroMotionTransform(
  input: HeroMotionSampleInput,
  out?: HeroMotionTransform,
): HeroMotionTransform {
  const res: HeroMotionTransform = out ?? {
    sx: 1,
    sy: 1,
    dx: 0,
    dy: 0,
    hopY: 0,
    leanRad: 0,
    rollStepRad: 0,
    shadowScale: 1,
    alpha: 1,
    weaponTuckPx: 0,
    frameIdx: 0,
    stepSfx: false,
  };

  res.sx = 1;
  res.sy = 1;
  res.dx = 0;
  res.dy = 0;
  res.hopY = 0;
  res.leanRad = 0;
  res.rollStepRad = 0;
  res.shadowScale = 1;
  res.alpha = 1;
  res.weaponTuckPx = 0;
  res.frameIdx = Math.max(0, Math.floor(input.frameIdx ?? 0));
  res.stepSfx = false;

  const state = normalizeAnimState(input.animState, input.downed);
  const visualTimeMs = input.visualTimeMs ?? 0;
  const aimSign: 1 | -1 = input.facingRight === false ? -1 : 1;

  if (state === 'dash') {
    const durationS = input.dashDurationS ?? BANSUNG_DASH.DURATION_S;
    const elapsedS = input.dashElapsedS ?? 0;
    const dirSign: 1 | -1 = input.dashDirSign ?? aimSign;
    const dashSample = sampleDashCurve(elapsedS, dirSign, durationS);
    const u = durationS > 0 ? clamp(elapsedS / durationS, 0, 1) : 1;

    res.frameIdx = dashSample.frameIdx;
    res.sx = dashSample.sx;
    res.sy = dashSample.sy;
    res.hopY = dashSample.hopY;
    res.leanRad = dashSample.leanRad;
    res.rollStepRad = Math.round(u * 4) * (Math.PI * 0.5) * dirSign;
    res.shadowScale = dashSample.shadowScale;
    if (input.isIframe) {
      res.alpha = 0.82 + 0.12 * Math.sin(u * 28);
      res.weaponTuckPx = 4;
    }
    return res;
  }

  if (state === 'run') {
    const cadenceLen = BANSUNG_HERO_RUN_CADENCE.length;
    const idx = ((res.frameIdx % cadenceLen) + cadenceLen) % cadenceLen;
    const step = BANSUNG_HERO_RUN_CADENCE[idx];
    if (step) {
      res.frameIdx = idx;
      res.dy = step.dy;
      res.sx = step.sx;
      res.sy = step.sy;
      res.stepSfx = step.stepSfx;
    }
  } else if (state === 'stunned') {
    res.dx = Math.floor(visualTimeMs / 50) % 2 === 0 ? -2 : 2;
    res.sx = 0.96;
    res.sy = 1.04;
    res.frameIdx = Math.floor(visualTimeMs / 100) % 2;
  } else if (state === 'downed') {
    res.alpha = 0.78 + 0.14 * Math.sin(visualTimeMs / 220);
    res.frameIdx = 2;
  } else if (state === 'dead') {
    res.alpha = 0.55;
    res.frameIdx = 3;
  }

  // Run-and-gun / stationary shoot kick overlay (d18 §4.5)
  const shootAgeMs = input.shootAgeMs;
  if (
    shootAgeMs !== undefined &&
    shootAgeMs >= 0 &&
    shootAgeMs < MOTION_CFG.SHOOT_KICK_MS &&
    state !== 'stunned' &&
    state !== 'downed' &&
    state !== 'dead'
  ) {
    const kick = 1 - shootAgeMs / MOTION_CFG.SHOOT_KICK_MS;
    res.dx += -aimSign * 3 * kick;
    res.leanRad += -aimSign * 0.08 * kick;
    res.sx *= 1 + 0.08 * kick;
    res.sy *= 1 - 0.07 * kick;
  }

  if (input.isIframe) {
    res.alpha *= 0.82 + 0.12 * Math.sin((visualTimeMs / 1000) * 28);
    res.weaponTuckPx = 4;
  }

  return res;
}

/**
 * Project mobile twin-stick reticle `140px` ahead of hero screen coordinates along `aimRad`.
 */
export function projectTouchReticle(
  heroScreenX: number,
  heroScreenY: number,
  aimRad: number,
  distPx = MOTION_CFG.TOUCH_RETICLE_DIST_PX,
  out?: { x: number; y: number },
): { x: number; y: number } {
  const x = heroScreenX + Math.cos(aimRad) * distPx;
  const y = heroScreenY + Math.sin(aimRad) * distPx;
  if (out) {
    out.x = x;
    out.y = y;
    return out;
  }
  return { x, y };
}

// ============================================================================
// 5. Canvas Draw Helpers (Dash Ghosts, 2.5D Dust Rings, Pixel Crosshair)
// ============================================================================

/**
 * Draw a single pooled dash ghost silhouette anchored at Miragine foot-pivot `(x, footY + hopY)`.
 * Uses cached `source-atop` offscreen silhouette when `opts.source` is ready, or a crisp
 * procedural pixel-hero silhouette fallback otherwise.
 */
export function drawDashGhost(
  ctx: CanvasRenderingContext2D,
  ghost: Readonly<DashGhost>,
  opts?: DrawGhostSpriteOpts,
): void {
  if (!ghost.active || ghost.alpha <= 0.005) return;

  const hero = getBansungHero(ghost.heroId);
  const scale = opts?.pixelScale ?? hero.pixelScale;
  const isNativeLeft = opts?.nativeFacing === 'left';
  const flipX = isNativeLeft ? (ghost.left ? 1 : -1) : ghost.left ? -1 : 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= ghost.alpha;
  ctx.translate(Math.round(ghost.x), Math.round(ghost.footY + ghost.hopY));
  if (ghost.leanRad !== 0) {
    ctx.rotate(ghost.leanRad);
  }
  ctx.scale(flipX * ghost.sx * scale, ghost.sy * scale);

  const source = opts?.source;
  const cw = opts?.cellW ?? 48;
  const ch = opts?.cellH ?? 48;
  const sx = opts?.srcX ?? ghost.frameIdx * cw;
  const sy = opts?.srcY ?? 0;
  const offX = opts?.offX ?? -24;
  const offY = opts?.offY ?? -44;

  let drewSprite = false;
  if (source && cw > 0 && ch > 0) {
    const tinted = getGhostTintCanvas(
      source,
      sx,
      sy,
      cw,
      ch,
      `${ghost.sheetKey}#${ghost.frameIdx}`,
      ghost.tint,
    );
    if (tinted) {
      ctx.drawImage(tinted, 0, 0, cw, ch, offX, offY, cw, ch);
      drewSprite = true;
    }
  }

  if (!drewSprite) {
    // Crisp foot-anchored pixel-hero silhouette fallback
    ctx.fillStyle = ghost.tint;
    ctx.fillRect(-7, -26, 14, 16); // hooded head/torso
    ctx.fillRect(-5, -30, 10, 4); // crown/ears top
    ctx.fillRect(-6, -10, 5, 8); // back boot
    ctx.fillRect(1, -10, 5, 8); // lead boot
  }

  ctx.restore();
}

/**
 * Draw all active 2.5D takeoff ground dust rings (Pass 1 ground decal pass, under actors).
 */
export function drawDashDustRings(
  ctx: CanvasRenderingContext2D,
  rings: readonly DashDustRing[],
): void {
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r || !r.active) continue;
    const x = Math.round(r.x);
    const y = Math.round(r.footY);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.ellipse(x, y, r.rx, r.ry, 0, 0, Math.PI * 2);
    if (r.fillAlpha > 0.005) {
      ctx.globalAlpha = r.fillAlpha;
      ctx.fillStyle = r.color;
      ctx.fill();
    }
    if (r.strokeAlpha > 0.005) {
      ctx.globalAlpha = r.strokeAlpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Draw crisp pixel-art reticle with dynamic bloom gap, 2x2 center dot,
 * diagonal crit/hit markers, dry/low-energy pulse, and active-reload progress bar (d21 §5).
 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  cursorX: number,
  cursorY: number,
  state: Readonly<CrosshairState>,
  opts?: DrawCrosshairOpts,
): void {
  const cx = Math.round(cursorX);
  const cy = Math.round(cursorY);
  const gap = Math.max(1, Math.round(state.bloomPx));
  const nowMs = opts?.nowMs ?? nowDefault();
  const emptyOrLow = opts?.emptyOrLowEnergy ?? state.emptyOrLowEnergy;
  const reloadRatio = opts?.reloadRatio ?? state.reloadRatio;
  const sweetMin = opts?.sweetMin ?? state.sweetMin;
  const sweetMax = opts?.sweetMax ?? state.sweetMax;
  const reloadJammed = opts?.reloadJammed ?? state.reloadJammed;

  const dryPulsing =
    (emptyOrLow || state.dryPulseMs > 0) && Math.floor(nowMs / 90) % 2 === 0;
  const reticleFill = dryPulsing ? '#ff6b6b' : '#ffffff';

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 1px black pixel outline behind 4 cardinal ticks (5x2 horiz, 2x5 vert)
  ctx.fillStyle = '#000000';
  ctx.fillRect(cx - gap - 6, cy - 2, 7, 4); // left
  ctx.fillRect(cx + gap - 1, cy - 2, 7, 4); // right
  ctx.fillRect(cx - 2, cy - gap - 6, 4, 7); // top
  ctx.fillRect(cx - 2, cy + gap - 1, 4, 7); // bottom
  ctx.fillRect(cx - 2, cy - 2, 4, 4); // center dot border

  ctx.fillStyle = reticleFill;
  ctx.fillRect(cx - gap - 5, cy - 1, 5, 2);
  ctx.fillRect(cx + gap, cy - 1, 5, 2);
  ctx.fillRect(cx - 1, cy - gap - 5, 2, 5);
  ctx.fillRect(cx - 1, cy + gap, 2, 5);
  ctx.fillRect(cx - 1, cy - 1, 2, 2);

  // Diagonal 4px hit markers
  if (state.hitMarkerMs > 0) {
    const markerColor = state.hitCrit ? '#ffd43b' : '#ffffff';
    const d0 = gap + 2;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * Math.min(1, state.hitMarkerMs / 40);

    for (let q = 0; q < 4; q++) {
      const sx = q === 0 || q === 2 ? -1 : 1;
      const sy = q === 0 || q === 1 ? -1 : 1;
      for (let step = 0; step < 4; step++) {
        const px = cx + sx * (d0 + step);
        const py = cy + sy * (d0 + step);
        ctx.fillStyle = '#000000';
        ctx.fillRect(px - 1, py - 1, 3, 3);
      }
      for (let step = 0; step < 4; step++) {
        const px = cx + sx * (d0 + step);
        const py = cy + sy * (d0 + step);
        ctx.fillStyle = markerColor;
        ctx.fillRect(px, py, 2, 2);
      }
    }
    ctx.globalAlpha = prevAlpha;
  }

  // Active reload bar (20x3px strip 14px below reticle)
  if (reloadRatio > 0) {
    const barX = cx - 10;
    const barY = cy + 14;
    const ratio = clamp(reloadRatio, 0, 1);
    const progW = Math.round(ratio * 20);

    ctx.fillStyle = '#000000';
    ctx.fillRect(barX - 1, barY - 1, 22, 5);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, 20, 3);

    if (sweetMax > sweetMin) {
      const swX = clamp(Math.round(sweetMin * 20), 0, 19);
      const swW = clamp(Math.round((sweetMax - sweetMin) * 20), 2, 20 - swX);
      ctx.fillStyle = '#fcc419';
      ctx.fillRect(barX + swX, barY, swW, 3);
    }

    ctx.fillStyle = reloadJammed ? '#ff6b6b' : '#38bdf8';
    ctx.fillRect(barX, barY, progW, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(barX + Math.min(19, progW), barY - 1, 1, 5);
  }

  ctx.restore();
}

// ============================================================================
// 6. BansungMotionController (Stateful Pools, Springs, Hitstop & Bloom)
// ============================================================================

/**
 * Coordinates all client-side motion juice for `bansung`:
 * - 64-slot pooled dash ghost ring (4 silhouettes per dash at `GHOST_U`)
 * - 32-slot pooled 2.5D takeoff dust rings & dust puff emitter hints
 * - Per-shooter weapon kickback & rotational muzzle-snap damped springs
 * - Local directional camera recoil + deterministic `trauma^2` screen shake
 * - 30ms visual hitstop (45ms boss) with 140ms anti-stack cooldown
 * - Dynamic crosshair bloom & hit markers unaffected by hitstop freeze
 */
export class BansungMotionController {
  private biome: BansungBiome = 'desert';
  private reducedScreenShake = false;

  private readonly dashTrackers = new Map<number, HeroDashTracker>();
  private readonly dashTrackerPruneIds: number[] = [];

  private readonly ghostPool: DashGhost[];
  private ghostCursor = 0;

  private readonly dustRingPool: DashDustRing[];
  private dustRingCursor = 0;

  private readonly puffQueue: DashPuffHint[];
  private puffHead = 0;
  private puffCount = 0;

  private readonly gunSprings = new Map<number, GunSpringState>();
  private readonly gunSpringFreePool: GunSpringState[] = [];
  private readonly gunPruneIds: number[] = [];

  private activeWeaponProfile: WeaponRecoilProfile = RECOIL_PROFILES.pistol;

  private readonly camera: CameraJuiceState = {
    rx: 0,
    ry: 0,
    rvx: 0,
    rvy: 0,
    trauma: 0,
    hitstopRemMs: 0,
    lastHitstopAt: -MOTION_CFG.HITSTOP_COOLDOWN_MS,
    visualTimeMs: 0,
    shakeX: 0,
    shakeY: 0,
    offsetX: 0,
    offsetY: 0,
  };

  private totalFrozenMs = 0;

  private readonly crosshair: CrosshairState = {
    bloomPx: RECOIL_PROFILES.pistol.bloomBase,
    hitMarkerMs: 0,
    hitCrit: false,
    reloadRatio: 0,
    sweetMin: 0,
    sweetMax: 0,
    reloadJammed: false,
    emptyOrLowEnergy: false,
    dryPulseMs: 0,
    speedNorm: 0,
    isDashing: false,
  };

  constructor() {
    this.ghostPool = new Array<DashGhost>(MOTION_CFG.GHOST_POOL_SIZE);
    for (let i = 0; i < this.ghostPool.length; i++) {
      this.ghostPool[i] = {
        active: false,
        slot: i,
        entityId: 0,
        heroId: 'mascot',
        x: 0,
        footY: 0,
        hopY: 0,
        left: false,
        sheetKey: 'mascot_dash',
        frameIdx: 0,
        sx: 1,
        sy: 1,
        leanRad: 0,
        tint: '#ffd43b',
        ageS: 0,
        lifeS: MOTION_CFG.GHOST_LIFE_S,
        alpha: 0,
      };
    }

    this.dustRingPool = new Array<DashDustRing>(MOTION_CFG.DUST_RING_POOL_SIZE);
    for (let i = 0; i < this.dustRingPool.length; i++) {
      this.dustRingPool[i] = {
        active: false,
        slot: i,
        x: 0,
        footY: 0,
        biome: 'desert',
        color: DUST_RING_COLORS.desert,
        ageS: 0,
        lifeS: MOTION_CFG.DUST_RING_LIFE_S,
        rx: MOTION_CFG.DUST_RING_RX_START,
        ry: MOTION_CFG.DUST_RING_RX_START * MOTION_CFG.DUST_RING_ASPECT_Y,
        strokeAlpha: 0,
        fillAlpha: 0,
      };
    }

    this.puffQueue = new Array<DashPuffHint>(MOTION_CFG.DUST_PUFF_QUEUE_SIZE);
    for (let i = 0; i < this.puffQueue.length; i++) {
      this.puffQueue[i] = {
        active: false,
        kind: 'takeoff',
        x: 0,
        footY: 0,
        dirX: 1,
        dirY: 0,
        biome: 'desert',
        color: DUST_RING_COLORS.desert,
        count: 0,
      };
    }
  }

  /** Set active arena biome for dust ring and puff color selection. */
  setBiome(biome: BansungBiome): void {
    this.biome = biome;
  }

  /** Toggle accessibility reduced-motion mode (0.25x camera shake/kick, 0ms hitstop). */
  setReducedScreenShake(enabled: boolean): void {
    this.reducedScreenShake = enabled;
    if (enabled) {
      this.camera.hitstopRemMs = 0;
    }
  }

  getReducedScreenShake(): boolean {
    return this.reducedScreenShake;
  }

  /** Reset all motion trackers, pooled afterimages, springs, hitstop, and crosshair state. */
  reset(): void {
    this.dashTrackers.clear();
    this.ghostCursor = 0;
    for (let i = 0; i < this.ghostPool.length; i++) {
      const g = this.ghostPool[i];
      if (g) g.active = false;
    }

    this.dustRingCursor = 0;
    for (let i = 0; i < this.dustRingPool.length; i++) {
      const r = this.dustRingPool[i];
      if (r) r.active = false;
    }

    this.puffHead = 0;
    this.puffCount = 0;
    for (let i = 0; i < this.puffQueue.length; i++) {
      const p = this.puffQueue[i];
      if (p) p.active = false;
    }

    for (const s of this.gunSprings.values()) {
      this.recycleGunSpring(s);
    }
    this.gunSprings.clear();

    this.camera.rx = 0;
    this.camera.ry = 0;
    this.camera.rvx = 0;
    this.camera.rvy = 0;
    this.camera.trauma = 0;
    this.camera.hitstopRemMs = 0;
    this.camera.lastHitstopAt = -MOTION_CFG.HITSTOP_COOLDOWN_MS;
    this.camera.visualTimeMs = 0;
    this.camera.shakeX = 0;
    this.camera.shakeY = 0;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
    this.totalFrozenMs = 0;

    this.activeWeaponProfile = RECOIL_PROFILES.pistol;
    this.crosshair.bloomPx = RECOIL_PROFILES.pistol.bloomBase;
    this.crosshair.hitMarkerMs = 0;
    this.crosshair.hitCrit = false;
    this.crosshair.reloadRatio = 0;
    this.crosshair.sweetMin = 0;
    this.crosshair.sweetMax = 0;
    this.crosshair.reloadJammed = false;
    this.crosshair.emptyOrLowEnergy = false;
    this.crosshair.dryPulseMs = 0;
    this.crosshair.speedNorm = 0;
    this.crosshair.isDashing = false;
  }

  // --------------------------------------------------------------------------
  // Dash Afterimage & Squash-Stretch Tracking (d20)
  // --------------------------------------------------------------------------

  private getOrCreateTracker(
    entityId: number,
    heroId: BansungHeroId,
    x: number,
    footY: number,
    nowMs: number,
    biome: BansungBiome,
  ): HeroDashTracker {
    let t = this.dashTrackers.get(entityId);
    if (!t) {
      t = {
        entityId,
        heroId,
        active: false,
        elapsedS: 0,
        durationS: BANSUNG_DASH.DURATION_S,
        dirX: 1,
        dirY: 0,
        dirSign: 1,
        left: false,
        lastX: x,
        lastFootY: footY,
        prevX: x,
        prevFootY: footY,
        hasPos: true,
        ghostEmittedMask: 0,
        landDustEmitted: false,
        wasDashing: false,
        lastSeq: -1,
        predictedAtMs: 0,
        serverConfirmed: false,
        lastSeenMs: nowMs,
        idleMs: 0,
        biome,
      };
      this.dashTrackers.set(entityId, t);
    }
    return t;
  }

  private startDashVisual(
    tracker: HeroDashTracker,
    x: number,
    footY: number,
    dirX: number,
    dirY: number,
    biome: BansungBiome,
    isPrediction: boolean,
    nowMs: number,
  ): void {
    const len = Math.hypot(dirX, dirY);
    const nx = len > 1e-4 ? dirX / len : tracker.left ? -1 : 1;
    const ny = len > 1e-4 ? dirY / len : 0;

    tracker.active = true;
    tracker.elapsedS = 0;
    tracker.durationS = getBansungHero(tracker.heroId).dash.durationS;
    tracker.dirX = nx;
    tracker.dirY = ny;
    tracker.dirSign = nx >= 0 ? 1 : -1;
    tracker.left = nx < 0;
    tracker.lastX = x;
    tracker.lastFootY = footY;
    tracker.prevX = x;
    tracker.prevFootY = footY;
    tracker.hasPos = true;
    tracker.ghostEmittedMask = 0;
    tracker.landDustEmitted = false;
    tracker.biome = biome;
    tracker.predictedAtMs = isPrediction ? nowMs : 0;
    tracker.serverConfirmed = !isPrediction;
    tracker.lastSeenMs = nowMs;
    tracker.idleMs = 0;

    this.spawnDustRing(x, footY, biome);
    this.enqueueDustPuff('takeoff', x, footY, -nx, -ny, biome, 7);
  }

  /**
   * Immediately start local predicted dash visuals on keypress (reconciled within 120ms if server rejects),
   * emitting the 2.5D takeoff dust ring and a 1.5px directional camera kickoff impulse.
   */
  predictLocalDash(
    entityId: number,
    x: number,
    footY: number,
    dirX: number,
    dirY: number,
    heroId: BansungHeroId = 'mascot',
    nowMs = nowDefault(),
    biome = this.biome,
  ): HeroDashTracker {
    const tracker = this.getOrCreateTracker(entityId, heroId, x, footY, nowMs, biome);
    tracker.heroId = heroId;
    tracker.lastSeenMs = nowMs;
    tracker.idleMs = 0;
    if (!tracker.active) {
      this.startDashVisual(tracker, x, footY, dirX, dirY, biome, true, nowMs);
    }
    return tracker;
  }

  /**
   * Synchronize a hero's dash visual state from snapshot flags/state/dashSeq.
   * Detects dash edges and reconciles local predictions without restarting an active predicted burst.
   */
  syncHeroDash(opts: SyncHeroDashOpts): HeroDashTracker {
    const nowMs = opts.nowMs ?? nowDefault();
    const biome = opts.biome ?? this.biome;
    const tracker = this.getOrCreateTracker(
      opts.entityId,
      opts.heroId,
      opts.x,
      opts.footY,
      nowMs,
      biome,
    );

    tracker.heroId = opts.heroId;
    tracker.biome = biome;
    if (!tracker.hasPos) {
      tracker.prevX = opts.x;
      tracker.prevFootY = opts.footY;
      tracker.hasPos = true;
    }
    tracker.lastX = opts.x;
    tracker.lastFootY = opts.footY;
    tracker.left = (opts.flags & BANSUNG_PFLAG_LEFT) !== 0 || Math.cos(opts.aimRad) < 0;
    tracker.lastSeenMs = nowMs;
    tracker.idleMs = 0;

    const isDashing =
      (opts.flags & BANSUNG_PFLAG_DASHING) !== 0 || opts.state === BANSUNG_STATE_DASH;
    const seqChanged =
      opts.dashSeq !== undefined && tracker.lastSeq >= 0 && opts.dashSeq !== tracker.lastSeq;

    if (tracker.active && !tracker.serverConfirmed) {
      const predictDelta = nowMs - tracker.predictedAtMs;
      const predictTimedOut =
        tracker.elapsedS * 1000 > MOTION_CFG.DASH_PREDICT_TIMEOUT_MS ||
        (predictDelta > MOTION_CFG.DASH_PREDICT_TIMEOUT_MS && predictDelta < 5000);
      if (isDashing || seqChanged) {
        tracker.serverConfirmed = true;
      } else if (predictTimedOut) {
        tracker.active = false;
      }
    }

    const dashStarted = (isDashing && !tracker.wasDashing) || (seqChanged && isDashing);
    if (dashStarted && !tracker.active) {
      const vx = opts.moveVx ?? 0;
      const vy = opts.moveVy ?? 0;
      const hasMove = Math.hypot(vx, vy) > 10;
      const dirX = hasMove ? vx : Math.cos(opts.aimRad);
      const dirY = hasMove ? vy : Math.sin(opts.aimRad);
      this.startDashVisual(tracker, opts.x, opts.footY, dirX, dirY, biome, false, nowMs);
    }

    tracker.wasDashing = isDashing;
    if (opts.dashSeq !== undefined) {
      tracker.lastSeq = opts.dashSeq;
    }

    return tracker;
  }

  /**
   * Sample Miragine foot-pivot squash-stretch transform for a tracked hero entity,
   * automatically injecting active dash elapsed time, direction sign, and i-frame shimmer.
   */
  sampleHeroMotion(
    entityId: number,
    input: HeroMotionSampleInput,
    out?: HeroMotionTransform,
  ): HeroMotionTransform {
    const tracker = this.dashTrackers.get(entityId);
    if (tracker && tracker.active) {
      return sampleHeroMotionTransform(
        {
          ...input,
          animState: 'dash',
          dashElapsedS: input.dashElapsedS ?? tracker.elapsedS,
          dashDurationS: input.dashDurationS ?? tracker.durationS,
          dashDirSign: input.dashDirSign ?? tracker.dirSign,
          isIframe:
            input.isIframe ?? tracker.elapsedS < getBansungHero(tracker.heroId).dash.iframeS,
          visualTimeMs: input.visualTimeMs ?? this.camera.visualTimeMs,
        },
        out,
      );
    }
    return sampleHeroMotionTransform(
      {
        ...input,
        visualTimeMs: input.visualTimeMs ?? this.camera.visualTimeMs,
      },
      out,
    );
  }

  /**
   * Sample transform directly from raw player flags & state without building a temporary input object.
   */
  samplePlayerTransform(
    entityId: number,
    state: BansungUnitState,
    flags: number,
    frameIdx: number,
    shootAgeMs = -1,
    out?: HeroMotionTransform,
  ): HeroMotionTransform {
    const tracker = this.dashTrackers.get(entityId);
    const isIframe = (flags & BANSUNG_PFLAG_INVULN) !== 0;
    const facingRight = (flags & BANSUNG_PFLAG_LEFT) === 0;
    const isDashing =
      (tracker && tracker.active) ||
      (flags & BANSUNG_PFLAG_DASHING) !== 0 ||
      state === BANSUNG_STATE_DASH;

    return sampleHeroMotionTransform(
      {
        animState: isDashing ? 'dash' : state,
        frameIdx,
        dashElapsedS: tracker?.active ? tracker.elapsedS : 0,
        dashDurationS: tracker?.durationS ?? BANSUNG_DASH.DURATION_S,
        dashDirSign: tracker?.dirSign ?? (facingRight ? 1 : -1),
        shootAgeMs,
        downed: state === BANSUNG_STATE_DOWNED,
        isIframe,
        facingRight,
        visualTimeMs: this.camera.visualTimeMs,
      },
      out,
    );
  }

  private spawnDashGhost(
    tracker: HeroDashTracker,
    ghostU: number,
    x: number,
    footY: number,
    ageS: number,
  ): void {
    const slot = this.ghostPool[this.ghostCursor];
    this.ghostCursor = (this.ghostCursor + 1) % this.ghostPool.length;
    if (!slot) return;

    const hero = getBansungHero(tracker.heroId);
    const tx = sampleDashCurve(
      ghostU * tracker.durationS,
      tracker.dirSign,
      tracker.durationS,
    );

    slot.active = true;
    slot.entityId = tracker.entityId;
    slot.heroId = tracker.heroId;
    slot.x = x;
    slot.footY = footY;
    slot.hopY = tx.hopY;
    slot.left = tracker.left;
    slot.sheetKey = `${tracker.heroId}_dash`;
    slot.frameIdx = tx.frameIdx;
    slot.sx = tx.sx;
    slot.sy = tx.sy;
    slot.leanRad = tx.leanRad;
    slot.tint = hero.dash.ghostTint;
    slot.ageS = Math.max(0, ageS);
    slot.lifeS = MOTION_CFG.GHOST_LIFE_S;
    const rem = Math.max(0, 1 - slot.ageS / slot.lifeS);
    slot.alpha = MOTION_CFG.GHOST_BASE_ALPHA * Math.pow(rem, 1.5);
  }

  private spawnDustRing(x: number, footY: number, biome: BansungBiome): void {
    const slot = this.dustRingPool[this.dustRingCursor];
    this.dustRingCursor = (this.dustRingCursor + 1) % this.dustRingPool.length;
    if (!slot) return;

    const color = DUST_RING_COLORS[biome];
    slot.active = true;
    slot.x = x;
    slot.footY = footY;
    slot.biome = biome;
    slot.color = color;
    slot.ageS = 0;
    slot.lifeS = MOTION_CFG.DUST_RING_LIFE_S;
    slot.rx = MOTION_CFG.DUST_RING_RX_START;
    slot.ry = MOTION_CFG.DUST_RING_RX_START * MOTION_CFG.DUST_RING_ASPECT_Y;
    slot.strokeAlpha = 1;
    slot.fillAlpha = 0.28;
  }

  private enqueueDustPuff(
    kind: 'takeoff' | 'landing',
    x: number,
    footY: number,
    dirX: number,
    dirY: number,
    biome: BansungBiome,
    count: number,
  ): void {
    const idx = (this.puffHead + this.puffCount) % this.puffQueue.length;
    const slot = this.puffQueue[idx];
    if (!slot) return;

    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.footY = footY;
    slot.dirX = dirX;
    slot.dirY = dirY;
    slot.biome = biome;
    slot.color = DUST_RING_COLORS[biome];
    slot.count = count;

    if (this.puffCount < this.puffQueue.length) {
      this.puffCount++;
    } else {
      this.puffHead = (this.puffHead + 1) % this.puffQueue.length;
    }
  }

  /** Iterate active dash ghost silhouettes without allocating arrays. */
  forEachActiveGhost(cb: (ghost: Readonly<DashGhost>) => void): void {
    for (let i = 0; i < this.ghostPool.length; i++) {
      const g = this.ghostPool[i];
      if (g && g.active) cb(g);
    }
  }

  /** Read-only view of the 64-slot pooled ghost ring buffer. */
  getGhostPool(): readonly DashGhost[] {
    return this.ghostPool;
  }

  /** Count currently active ghost silhouettes in the pool. */
  getActiveGhostCount(): number {
    let n = 0;
    for (let i = 0; i < this.ghostPool.length; i++) {
      if (this.ghostPool[i]?.active) n++;
    }
    return n;
  }

  /** Read-only view of the pooled 2.5D takeoff ground dust rings. */
  getDustRingPool(): readonly DashDustRing[] {
    return this.dustRingPool;
  }

  /** Draw all active 2.5D dash takeoff dust rings into `ctx`. */
  drawDustRings(ctx: CanvasRenderingContext2D): void {
    drawDashDustRings(ctx, this.dustRingPool);
  }

  /**
   * Consume queued takeoff/landing dust puff bursts (`d20 §6`) for `particles.ts`
   * without heap allocations.
   */
  drainDashPuffHints(cb: (hint: Readonly<DashPuffHint>) => void): void {
    while (this.puffCount > 0) {
      const slot = this.puffQueue[this.puffHead];
      this.puffHead = (this.puffHead + 1) % this.puffQueue.length;
      this.puffCount--;
      if (slot && slot.active) {
        cb(slot);
        slot.active = false;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Gun Kickback & Rotational Muzzle-Snap Springs (d21 §2)
  // --------------------------------------------------------------------------

  private acquireGunSpring(nowMs: number): GunSpringState {
    const reused = this.gunSpringFreePool.pop();
    if (reused) {
      reused.kickPos = 0;
      reused.kickVel = 0;
      reused.snapAngle = 0;
      reused.snapVel = 0;
      reused.lastActiveMs = nowMs;
      reused.idleMs = 0;
      return reused;
    }
    return {
      kickPos: 0,
      kickVel: 0,
      snapAngle: 0,
      snapVel: 0,
      lastActiveMs: nowMs,
      idleMs: 0,
    };
  }

  private recycleGunSpring(s: GunSpringState): void {
    if (this.gunSpringFreePool.length < 64) {
      this.gunSpringFreePool.push(s);
    }
  }

  /** Apply weapon kickback & screen-upward rotational muzzle-snap spring impulse for a shooter. */
  triggerGunRecoil(
    entityId: number,
    aimRad: number,
    weapon?: BansungWeaponId | RecoilPresetId | number | null,
    nowMs = nowDefault(),
  ): void {
    const profile = resolveWeaponRecoilProfile(weapon);
    let s = this.gunSprings.get(entityId);
    if (!s) {
      s = this.acquireGunSpring(nowMs);
      this.gunSprings.set(entityId, s);
    }
    const facing = Math.cos(aimRad) >= 0 ? 1 : -1;
    s.kickPos = clamp(
      s.kickPos + profile.kickPx * 0.65,
      MOTION_CFG.MIN_KICK_PX,
      MOTION_CFG.MAX_KICK_PX,
    );
    s.kickVel += profile.kickPx * 18;
    s.snapAngle = clamp(
      s.snapAngle - facing * profile.muzzleSnapRad * 0.7,
      -MOTION_CFG.MAX_SNAP_RAD,
      MOTION_CFG.MAX_SNAP_RAD,
    );
    s.snapVel -= facing * profile.muzzleSnapRad * 14;
    s.lastActiveMs = nowMs;
    s.idleMs = 0;
  }

  /** Read current damped spring state for an entity, if active. */
  getGunSpring(entityId: number): Readonly<GunSpringState> | undefined {
    return this.gunSprings.get(entityId);
  }

  /**
   * Populate `out` with current gun recoil displacement along `-aimRad` and muzzle snap angle.
   * Zero-alloc when caller passes a reusable `out` object.
   */
  readGunRecoil(
    entityId: number,
    aimRad: number,
    out?: RecoilPivotResult,
  ): RecoilPivotResult {
    const s = this.gunSprings.get(entityId);
    const kickPos = s ? s.kickPos : 0;
    const snapAngle = s ? s.snapAngle : 0;
    const pivotOffsetX = kickPos !== 0 ? -Math.cos(aimRad) * kickPos : 0;
    const pivotOffsetY = kickPos !== 0 ? -Math.sin(aimRad) * kickPos : 0;
    if (out) {
      out.kickPos = kickPos;
      out.snapAngle = snapAngle;
      out.pivotOffsetX = pivotOffsetX;
      out.pivotOffsetY = pivotOffsetY;
      return out;
    }
    return { kickPos, snapAngle, pivotOffsetX, pivotOffsetY };
  }

  // --------------------------------------------------------------------------
  // Unified Shot Juice, Camera Recoil, Trauma Shake, Hitstop & Bloom (d21)
  // --------------------------------------------------------------------------

  /**
   * Trigger weapon shot feedback:
   * - Gun kickback + rotational muzzle-snap spring for any visible shooter
   * - Crosshair bloom expansion for local shooter
   * (Camera kick & trauma screen shake disabled.)
   */
  triggerShotJuice(opts: TriggerShotJuiceOpts): void {
    const nowMs = opts.nowMs ?? nowDefault();
    const profile = resolveWeaponRecoilProfile(opts.weapon);
    this.triggerGunRecoil(opts.entityId, opts.aimRad, opts.weapon, nowMs);

    if (!opts.isLocal) return;

    this.activeWeaponProfile = profile;
    this.crosshair.bloomPx = Math.min(
      profile.bloomMax,
      this.crosshair.bloomPx + profile.bloomAdd,
    );
  }

  /** No-op: directional camera dash kick disabled to prevent screen shake/wobble. */
  triggerDashCameraKick(_dirX: number, _dirY: number, _isSpectated = false): void {
    // Screen/camera shake disabled
  }

  /** No-op: camera trauma/impulse disabled to prevent screen shake/wobble. */
  addCameraTrauma(
    _traumaAmount: number,
    _impulseVx = 0,
    _impulseVy = 0,
    _isSpectated = false,
  ): void {
    // Screen/camera shake disabled
  }

  /**
   * Trigger optional `30ms`/`45ms` visual hitstop (`420px`) gated by `140ms` cooldown
   * on explosions (camera kick & screen shake disabled).
   */
  triggerExplosionJuice(
    bx: number,
    by: number,
    camX: number,
    camY: number,
    nowMs = nowDefault(),
    opts?: TriggerExplosionJuiceOpts,
  ): void {
    const dist = Math.hypot(camX - bx, camY - by);

    if (opts?.triggerHitstop !== false && dist <= MOTION_CFG.BLAST_HITSTOP_RANGE_PX) {
      const dur = opts?.isBossEvent
        ? MOTION_CFG.HITSTOP_BOSS_MS
        : MOTION_CFG.HITSTOP_EXPLOSION_MS;
      this.triggerHitstop(dur, nowMs);
    }
  }

  /**
   * Request visual hitstop (`30ms` default, `45ms` boss) subject to `140ms` cooldown gate
   * and `reducedScreenShake` accessibility disable. Returns `true` if activated.
   */
  triggerHitstop(durMs: number = MOTION_CFG.HITSTOP_CRIT_MS, nowMs = nowDefault()): boolean {
    if (this.reducedScreenShake || durMs <= 0) return false;
    if (nowMs - this.camera.lastHitstopAt < MOTION_CFG.HITSTOP_COOLDOWN_MS) {
      return false;
    }
    this.camera.hitstopRemMs = Math.max(this.camera.hitstopRemMs, durMs);
    this.camera.lastHitstopAt = nowMs;
    return true;
  }

  /** Trigger crit hitstop (`30ms` or `45ms` boss) plus golden crosshair crit marker. */
  triggerCritHitstop(nowMs = nowDefault(), isBoss = false): boolean {
    this.triggerHitMarker(true);
    return this.triggerHitstop(
      isBoss ? MOTION_CFG.HITSTOP_BOSS_MS : MOTION_CFG.HITSTOP_CRIT_MS,
      nowMs,
    );
  }

  /** Flash diagonal hit marker ticks on the reticle (`110ms`). */
  triggerHitMarker(crit = false): void {
    this.crosshair.hitMarkerMs = MOTION_CFG.HIT_MARKER_MS;
    this.crosshair.hitCrit = this.crosshair.hitCrit || crit;
  }

  /** Update active weapon profile used for resting crosshair bloom & decay rate. */
  setCrosshairWeapon(weapon?: BansungWeaponId | RecoilPresetId | number | null): void {
    this.activeWeaponProfile = resolveWeaponRecoilProfile(weapon);
  }

  /** Update movement, dash, reload bar, and low-ammo context feeding crosshair bloom/draw. */
  setCrosshairContext(opts: {
    speedNorm?: number;
    isDashing?: boolean;
    reloadRatio?: number;
    sweetMin?: number;
    sweetMax?: number;
    reloadJammed?: boolean;
    emptyOrLowEnergy?: boolean;
  }): void {
    if (opts.speedNorm !== undefined) this.crosshair.speedNorm = Math.max(0, opts.speedNorm);
    if (opts.isDashing !== undefined) this.crosshair.isDashing = opts.isDashing;
    if (opts.reloadRatio !== undefined) this.crosshair.reloadRatio = clamp(opts.reloadRatio, 0, 1);
    if (opts.sweetMin !== undefined) this.crosshair.sweetMin = clamp(opts.sweetMin, 0, 1);
    if (opts.sweetMax !== undefined) this.crosshair.sweetMax = clamp(opts.sweetMax, 0, 1);
    if (opts.reloadJammed !== undefined) this.crosshair.reloadJammed = opts.reloadJammed;
    if (opts.emptyOrLowEnergy !== undefined) {
      this.crosshair.emptyOrLowEnergy = opts.emptyOrLowEnergy;
    }
  }

  /** Trigger brief `#ff6b6b` dry-fire pulse on reticle when attempting to fire empty/low energy. */
  triggerDryFirePulse(durationMs = 240): void {
    this.crosshair.dryPulseMs = Math.max(this.crosshair.dryPulseMs, durationMs);
  }

  // --------------------------------------------------------------------------
  // Per-Frame Step & Readouts
  // --------------------------------------------------------------------------

  /**
   * Advance all motion springs, dash afterimages, dust rings, hitstop timer,
   * and crosshair bloom by `rawDtMs`.
   */
  step(rawDtMs: number, nowMs = nowDefault()): void {
    const clampedRawMs =
      Number.isFinite(rawDtMs) && rawDtMs > 0
        ? Math.min(rawDtMs, MOTION_CFG.SPRING_DT_CAP_S * 1000)
        : 0;
    const rawDtS = clampedRawMs / 1000;

    // 1. Crosshair bloom & hit marker always advance on rawDt (unaffected by hitstop)
    const prof = this.activeWeaponProfile;
    const targetFloor =
      prof.bloomBase +
      clamp(this.crosshair.speedNorm, 0, 1.5) * MOTION_CFG.MOVE_BLOOM_PX +
      (this.crosshair.isDashing ? MOTION_CFG.DASH_BLOOM_PX : 0);
    if (rawDtS > 0) {
      const settleAlpha = 1 - Math.exp(-prof.bloomDecay * rawDtS);
      this.crosshair.bloomPx += (targetFloor - this.crosshair.bloomPx) * settleAlpha;
    }
    if (this.crosshair.hitMarkerMs > 0) {
      this.crosshair.hitMarkerMs = Math.max(0, this.crosshair.hitMarkerMs - clampedRawMs);
      if (this.crosshair.hitMarkerMs === 0) {
        this.crosshair.hitCrit = false;
      }
    }
    if (this.crosshair.dryPulseMs > 0) {
      this.crosshair.dryPulseMs = Math.max(0, this.crosshair.dryPulseMs - clampedRawMs);
    }

    // 2. Hitstop countdown & visualTimeMs isolation
    let visualDtMs = clampedRawMs;
    if (this.camera.hitstopRemMs > 0 && clampedRawMs > 0) {
      const consumed = Math.min(this.camera.hitstopRemMs, clampedRawMs);
      this.camera.hitstopRemMs -= consumed;
      this.totalFrozenMs += consumed;
      visualDtMs = clampedRawMs - consumed;
    }
    this.camera.visualTimeMs += visualDtMs;
    const visualDtS = visualDtMs / 1000;

    // 3. Visual-time systems (frozen during hitstop)
    if (visualDtS > 0) {
      this.stepDashTrackers(visualDtS, nowMs);
      this.stepGhostPool(visualDtS);
      this.stepDustRings(visualDtS);
      this.stepGunSprings(visualDtS, nowMs);
      this.stepCameraSprings(visualDtS);
    }

    // 4. Screen shake & camera kick disabled
    this.camera.rx = 0;
    this.camera.ry = 0;
    this.camera.rvx = 0;
    this.camera.rvy = 0;
    this.camera.trauma = 0;
    this.camera.shakeX = 0;
    this.camera.shakeY = 0;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
  }

  private stepDashTrackers(dtS: number, nowMs: number): void {
    this.dashTrackerPruneIds.length = 0;

    for (const [id, tracker] of this.dashTrackers) {
      if (tracker.active) {
        const prevElapsed = tracker.elapsedS;
        const nextElapsed = prevElapsed + dtS;
        const dur = tracker.durationS > 0 ? tracker.durationS : BANSUNG_DASH.DURATION_S;
        const uPrev = clamp(prevElapsed / dur, 0, 1);
        const uNext = clamp(nextElapsed / dur, 0, 1);

        // Emit up to 4 pooled silhouettes at GHOST_U = [0.08, 0.28, 0.48, 0.68]
        for (let i = 0; i < BANSUNG_DASH.GHOST_U.length; i++) {
          const bit = 1 << i;
          if ((tracker.ghostEmittedMask & bit) !== 0) continue;
          const ghostU = BANSUNG_DASH.GHOST_U[i];
          if (ghostU === undefined || uNext < ghostU) continue;

          tracker.ghostEmittedMask |= bit;
          const span = uNext - uPrev;
          const frac = span > 1e-4 ? clamp((ghostU - uPrev) / span, 0, 1) : 1;
          const gx = tracker.prevX + (tracker.lastX - tracker.prevX) * frac;
          const gy = tracker.prevFootY + (tracker.lastFootY - tracker.prevFootY) * frac;
          const ageS = Math.max(0, (uNext - ghostU) * dur);
          this.spawnDashGhost(tracker, ghostU, gx, gy, ageS);
        }

        if (!tracker.landDustEmitted && uNext >= 0.88) {
          tracker.landDustEmitted = true;
          this.enqueueDustPuff(
            'landing',
            tracker.lastX,
            tracker.lastFootY,
            tracker.dirX,
            tracker.dirY,
            tracker.biome,
            2,
          );
        }

        tracker.elapsedS = nextElapsed;
        if (nextElapsed >= dur) {
          tracker.active = false;
        }
      } else {
        tracker.idleMs = (tracker.idleMs ?? 0) + dtS * 1000;
        const seenDelta = nowMs - tracker.lastSeenMs;
        const sameDomainTimedOut =
          seenDelta > MOTION_CFG.DASH_TRACKER_PRUNE_MS && seenDelta < 30_000;
        if (tracker.idleMs > MOTION_CFG.DASH_TRACKER_PRUNE_MS || sameDomainTimedOut) {
          this.dashTrackerPruneIds.push(id);
        }
      }

      tracker.prevX = tracker.lastX;
      tracker.prevFootY = tracker.lastFootY;
    }

    for (let i = 0; i < this.dashTrackerPruneIds.length; i++) {
      const id = this.dashTrackerPruneIds[i];
      if (id !== undefined) this.dashTrackers.delete(id);
    }
  }

  private stepGhostPool(dtS: number): void {
    for (let i = 0; i < this.ghostPool.length; i++) {
      const g = this.ghostPool[i];
      if (!g || !g.active) continue;
      g.ageS += dtS;
      if (g.ageS >= g.lifeS) {
        g.active = false;
        g.alpha = 0;
      } else {
        g.alpha = MOTION_CFG.GHOST_BASE_ALPHA * Math.pow(1 - g.ageS / g.lifeS, 1.5);
      }
    }
  }

  private stepDustRings(dtS: number): void {
    for (let i = 0; i < this.dustRingPool.length; i++) {
      const r = this.dustRingPool[i];
      if (!r || !r.active) continue;
      r.ageS += dtS;
      if (r.ageS >= r.lifeS) {
        r.active = false;
        r.strokeAlpha = 0;
        r.fillAlpha = 0;
      } else {
        const p = r.ageS / r.lifeS;
        const ease = 1 - (1 - p) * (1 - p);
        r.rx =
          MOTION_CFG.DUST_RING_RX_START +
          (MOTION_CFG.DUST_RING_RX_END - MOTION_CFG.DUST_RING_RX_START) * ease;
        r.ry = r.rx * MOTION_CFG.DUST_RING_ASPECT_Y;
        r.strokeAlpha = 1 - p;
        r.fillAlpha = 0.28 * (1 - p);
      }
    }
  }

  private stepGunSprings(dtS: number, nowMs: number): void {
    this.gunPruneIds.length = 0;

    for (const [id, s] of this.gunSprings) {
      advanceSpring1D(
        s.kickPos,
        s.kickVel,
        MOTION_CFG.GUN_STIFFNESS,
        MOTION_CFG.GUN_DAMPING,
        dtS,
        MOTION_CFG.MIN_KICK_PX,
        MOTION_CFG.MAX_KICK_PX,
        0.05,
        0.5,
        SPRING_SCRATCH,
      );
      s.kickPos = SPRING_SCRATCH[0];
      s.kickVel = SPRING_SCRATCH[1];

      advanceSpring1D(
        s.snapAngle,
        s.snapVel,
        MOTION_CFG.SNAP_STIFFNESS,
        MOTION_CFG.SNAP_DAMPING,
        dtS,
        -MOTION_CFG.MAX_SNAP_RAD,
        MOTION_CFG.MAX_SNAP_RAD,
        0.002,
        0.02,
        SPRING_SCRATCH,
      );
      s.snapAngle = SPRING_SCRATCH[0];
      s.snapVel = SPRING_SCRATCH[1];

      if (
        s.kickPos === 0 &&
        s.kickVel === 0 &&
        s.snapAngle === 0 &&
        s.snapVel === 0
      ) {
        s.idleMs = (s.idleMs ?? 0) + dtS * 1000;
        const activeDelta = nowMs - s.lastActiveMs;
        const sameDomainTimedOut =
          activeDelta > MOTION_CFG.GUN_IDLE_PRUNE_MS && activeDelta < 30_000;
        if (s.idleMs > MOTION_CFG.GUN_IDLE_PRUNE_MS || sameDomainTimedOut) {
          this.gunPruneIds.push(id);
        }
      } else {
        s.idleMs = 0;
      }
    }

    for (let i = 0; i < this.gunPruneIds.length; i++) {
      const id = this.gunPruneIds[i];
      if (id === undefined) continue;
      const s = this.gunSprings.get(id);
      if (s) this.recycleGunSpring(s);
      this.gunSprings.delete(id);
    }
  }

  private stepCameraSprings(_dtS: number): void {
    this.camera.rx = 0;
    this.camera.rvx = 0;
    this.camera.ry = 0;
    this.camera.rvy = 0;
    this.camera.trauma = 0;
  }

  /**
   * Epoch-aligned visual timestamp (`now - totalFrozenMs`) that freezes during hitstop
   * without stalling underlying network interpolation clocks.
   */
  visualNow(nowMs = nowDefault()): number {
    return nowMs - this.totalFrozenMs;
  }

  /** Monotonic accumulated non-frozen visual milliseconds starting from 0. */
  getVisualTimeMs(): number {
    return this.camera.visualTimeMs;
  }

  /** True while a 30ms/45ms visual hitstop freeze is active. */
  isHitstopActive(): boolean {
    return this.camera.hitstopRemMs > 0;
  }

  /** Read current camera recoil, trauma, hitstop, and shake offsets. */
  getCameraJuice(): Readonly<CameraJuiceState> {
    return this.camera;
  }

  /** Read current hitstop timing slice. */
  getHitstopState(out?: HitstopState): HitstopState {
    if (out) {
      out.remMs = this.camera.hitstopRemMs;
      out.lastAtMs = this.camera.lastHitstopAt;
      out.visualTimeMs = this.camera.visualTimeMs;
      out.totalFrozenMs = this.totalFrozenMs;
      out.active = this.camera.hitstopRemMs > 0;
      return out;
    }
    return {
      remMs: this.camera.hitstopRemMs,
      lastAtMs: this.camera.lastHitstopAt,
      visualTimeMs: this.camera.visualTimeMs,
      totalFrozenMs: this.totalFrozenMs,
      active: this.camera.hitstopRemMs > 0,
    };
  }

  /** Read current dynamic crosshair bloom, hit-marker, and reload state. */
  getCrosshairState(): Readonly<CrosshairState> {
    return this.crosshair;
  }

  /** Draw pixel-art dynamic crosshair directly at screen coordinates `(cursorX, cursorY)`. */
  drawCrosshair(
    ctx: CanvasRenderingContext2D,
    cursorX: number,
    cursorY: number,
    opts?: DrawCrosshairOpts,
  ): void {
    drawCrosshair(ctx, cursorX, cursorY, this.crosshair, opts);
  }
}

// ============================================================================
// 7. Shared Singleton & Module-Level Convenience Wrappers (d21)
// ============================================================================

/** Default singleton motion controller consumed by `store.ts`, `render.ts`, and `BansungBoard.tsx`. */
export const bansungMotion = new BansungMotionController();

/** Step the default `bansungMotion` controller by `rawDtMs`. */
export function stepJuice(rawDtMs: number, nowMs = nowDefault()): void {
  bansungMotion.step(rawDtMs, nowMs);
}

/** Trigger shot feedback on the default `bansungMotion` controller. */
export function triggerShotJuice(opts: TriggerShotJuiceOpts): void {
  bansungMotion.triggerShotJuice(opts);
}

/** Trigger visual hitstop on the default `bansungMotion` controller. */
export function triggerHitstop(
  durMs: number = MOTION_CFG.HITSTOP_CRIT_MS,
  nowMs = nowDefault(),
): boolean {
  return bansungMotion.triggerHitstop(durMs, nowMs);
}

/** Trigger distance-attenuated explosion recoil, trauma, and hitstop on `bansungMotion`. */
export function triggerExplosionJuice(
  bx: number,
  by: number,
  camX: number,
  camY: number,
  nowMs = nowDefault(),
  opts?: TriggerExplosionJuiceOpts,
): void {
  bansungMotion.triggerExplosionJuice(bx, by, camX, camY, nowMs, opts);
}

/** Trigger crosshair hit-marker ticks on `bansungMotion`. */
export function triggerHitMarker(crit = false): void {
  bansungMotion.triggerHitMarker(crit);
}

/** Return visual-time-adjusted timestamp from `bansungMotion` (pauses during hitstop). */
export function visualNow(nowMs = nowDefault()): number {
  return bansungMotion.visualNow(nowMs);
}
