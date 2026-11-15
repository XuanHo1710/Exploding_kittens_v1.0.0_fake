/**
 * Zero-allocation 30Hz Miragine-style army flocking, crescent flanking rings,
 * role-based range bands, bounded spatial-hash boids separation (cap 10),
 * AABB whisker obstacle avoidance + stuck recovery, and 2-pass mass-weighted
 * hard circle projection for `bansung` (spec d36).
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_FLOCK_CONSTS,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_MELEE_SPECIALS,
  type ArenaObstacle,
  type BansungEnemyId,
  type BansungEnemyRole,
  type BansungEnemyState,
  type EnemyFlockState,
} from '../../../../shared/src';
import {
  ActorGrid,
  ObstacleGrid,
  hasLineOfSight,
  moveCircleWithSlide,
  resolveCircleObstacles,
  type CircleBody,
  type SpatialActor,
} from './spatial';

export { BANSUNG_FLOCK_CONSTS, type EnemyFlockState };

export type EnemyFlockRole = BansungEnemyRole;

// ============================================================================
// 1. Constants & Schemas (d36)
// ============================================================================

export const FLOCK_TARGET_LOAD_PENALTY = 48;
export const FLOCK_BOMBER_LOAD_PENALTY = 20;
export const FLOCK_HYSTERESIS_PX = 60;
export const FLOCK_BOMBER_RUSH_DIST = 90;
export const FLOCK_BOMBER_W_FLANK = 0.25;
export const FLOCK_BOMBER_W_SEP = 0.9;
export const FLOCK_FLANK_MIN_DIST = 70;
export const FLOCK_FLANK_MAX_DIST = 240;
export const FLOCK_CROWD_RADIUS = 44;
export const FLOCK_CROWD_FRONT_DOT = 0.75;
export const FLOCK_CROWD_MIN_ALLIES = 2;
export const FLOCK_PLATOON_MIN_DIST = 180;
export const FLOCK_PLATOON_SPEED_BAND = 35;
export const FLOCK_WHISKER_PAD_PX = 28;
export const FLOCK_STUCK_CHECK_TICKS = 15;
export const FLOCK_MIN_STUCK_MOVE_PX = 6;
export const FLOCK_DETOUR_TICKS = 12;
export const FLOCK_DETOUR_SPEED_MULT = 0.85;
export const FLOCK_DEFAULT_KNOCK_DECAY = 0.78;
export const FLOCK_HARD_RELAX = 0.85;
export const FLOCK_HARD_PAD_PX = 2;
export const FLOCK_HARD_QUERY_PAD_PX = 32;

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const GOLDEN_ANGLE = 2.399963229728653;
const SLAB_EPS = 1e-12;
const DIRECT_ID_CAP = 65536;

const ROLE_DEFAULT_MASS: Readonly<Record<EnemyFlockRole, number>> = {
  bomber: 0.8,
  melee: 1.0,
  ranged: 1.0,
  caster: 1.0,
  brute: 2.6,
  boss: Infinity,
};

const ROLE_CODE_MAP: Readonly<Record<EnemyFlockRole, number>> = {
  melee: 0,
  bomber: 1,
  brute: 2,
  ranged: 3,
  caster: 4,
  boss: 5,
};

/** Enemy shape consumed and updated in-place by `stepEnemyFlocking`. */
export interface FlockEnemy extends SpatialActor, Partial<EnemyFlockState> {
  kind?: BansungEnemyId;
  role?: EnemyFlockRole;
  /** Movement speed in px/s (falls back to `moveSpeed`, `BANSUNG_ENEMIES[kind].speed`, else 100). */
  speed?: number;
  moveSpeed?: number;
  /** Boids mass (`Infinity` or `>= 999` produces `invMass = 0`). */
  mass?: number;
  /** Ranged/caster preferred band: `[min, max]` tuple or scalar midpoint (`d36`). */
  preferredRange?: readonly [number, number] | number;
  /** Distance below which ranged/casters backpedal (`d35` `backoffDist` / `d36` `minRange`). */
  minRange?: number;
  backoffDist?: number;
  /** Optional AI state (`'fuse'`, `'stunned'`, `'windup'`, `'attack'`, `'lunge'`, `'dead'`, etc.). */
  state?: BansungEnemyState | string;
  /** Optional nested flock state; when omitted, flat `EnemyFlockState` fields on `this` are used. */
  flock?: EnemyFlockState;
  /** Knockback velocity in px/s integrated & decayed each tick. */
  knockVx?: number;
  knockVy?: number;
  /** True or positive remaining duration disables active steering (keeps knockback + hard separation). */
  stunned?: boolean;
  stunTicks?: number;
  stunMs?: number;
  /** True while rooted for windup/telegraph/cast (zeros steering velocity, keeps separation). */
  stationary?: boolean;
  /** Attack cooldown in ticks; stuck detector only triggers when `<= 0`. */
  attackCooldown?: number;
  cooldownTicks?: number;
  /** Multiplier on `W_SEPARATION` (e.g. `0.25` for Bomb Goblin during fuse). */
  sepWeightScale?: number;
  /** Optional caller-provided steering bias (e.g. scarab zig-zag from d34). */
  steerBiasX?: number;
  steerBiasY?: number;
  /** Optional flag to force facing toward target during attack windup/fire. */
  attackFacingTarget?: boolean;
  /** Optional lock preventing initial clear->blocked auto-orientation of `wallSlideSign`. */
  lockWallSlideSign?: boolean;
  /** Optional authoritative target actor ID (prevents split-brain retargeting with external AI). */
  lockedTargetId?: number;
  /** Output: facing direction updated with `FACING_HYSTERESIS_PX_S` (18 px/s). */
  facingLeft?: boolean;
  /** Output: resolved net displacement speed (px/s) for Miragine walk-frame sync. */
  actualSpeed?: number;
}

/** Living target entity scored by enemy flocking (player, bot, or decoy turret). */
export interface FlockTarget {
  id: number;
  x: number;
  y: number;
  radius?: number;
  alive: boolean;
  downed?: boolean;
  /** Optional additive distance penalty/bonus in px (e.g. `-60` threat tie-breaker). */
  scoreOffset?: number;
}

/** Optional configuration overrides for `stepEnemyFlocking`. */
export interface StepEnemyFlockingOptions {
  /** Override tick step in seconds (defaults to `BANSUNG_FLOCK_CONSTS.FLOCK_DT`). */
  dt?: number;
  /** Arena width in px for bounds clamp (defaults to `obsGrid.mapW` or `BANSUNG_MAP_W`). */
  mapW?: number;
  /** Arena height in px for bounds clamp (defaults to `obsGrid.mapH` or `BANSUNG_MAP_H`). */
  mapH?: number;
  /** Inner arena margin in px passed to `resolveCircleObstacles`. */
  margin?: number;
  /** Set `true` when `enemyGrid` contains ONLY enemies and may be rebuilt in-place for hard projection. */
  enemyOnlyGrid?: boolean;
  /** Per-tick knockback retention factor (defaults to `0.78`). */
  knockDecay?: number;
  /** Bypass staggered `RETARGET_INTERVAL` so every enemy scores targets this tick. */
  forceRetarget?: boolean;
  /** Overload shedding flag (`d47`): halves soft boids queries on odd ticks. */
  reducedLoad?: boolean;
}

// ============================================================================
// 2. Module-Scoped Zero-GC Scratch Buffers
// ============================================================================

const neighborBuf = new Int32Array(BANSUNG_FLOCK_CONSTS.MAX_NEIGHBORS);
const cohesionBuf = new Int32Array(BANSUNG_FLOCK_CONSTS.MAX_NEIGHBORS);
const hardNeighborBuf = new Int32Array(128);
let targetLoadBuf = new Int32Array(32);

const validTargets: FlockTarget[] = [];
const tmpWhiskerObs: ArenaObstacle[] = [];
const tmpBody: CircleBody = { x: 0, y: 0, radius: 12 };

// Generation-stamped flat lookup for O(1) zero-alloc enemy ID -> index & wall-block state
let lookupGen = 1;
const idGen = new Uint32Array(DIRECT_ID_CAP);
const idSlot = new Int32Array(DIRECT_ID_CAP);
const prevSeenGen = new Uint32Array(DIRECT_ID_CAP);
const wallBlockedFlags = new Uint8Array(DIRECT_ID_CAP);
const lastWallNx = new Int8Array(DIRECT_ID_CAP);
const lastWallNy = new Int8Array(DIRECT_ID_CAP);
const overflowIdSlot = new Map<number, number>();
const overflowWallBlocked = new Set<number>();
const overflowWallNormal = new Map<number, number>();

// Per-step cached resolved fields (parallel flat typed arrays grown only if pool expands)
let enemyCap = 128;
let cachedRadius = new Float32Array(enemyCap);
let cachedSpeed = new Float32Array(enemyCap);
let cachedInvMass = new Float32Array(enemyCap);
let cachedRoleCode = new Uint8Array(enemyCap); // 0=melee, 1=bomber, 2=brute, 3=ranged, 4=caster, 5=boss
let cachedPrevX = new Float32Array(enemyCap);
let cachedPrevY = new Float32Array(enemyCap);
let cachedTargetIdx = new Int32Array(enemyCap);
let cachedStunned = new Uint8Array(enemyCap);
let cachedStationary = new Uint8Array(enemyCap);

let internalEnemyGrid = new ActorGrid(BANSUNG_MAP_W, BANSUNG_MAP_H);

const goldenOut = { x: 1, y: 0 };

const boidsOut = {
  sepX: 0,
  sepY: 0,
  frontCrowdCount: 0,
  cohX: 0,
  cohY: 0,
  alignX: 0,
  alignY: 0,
};

const whiskerOut = {
  hit: false,
  t: 1,
  nx: 0,
  ny: 0,
  obstacle: null as ArenaObstacle | null,
};

const avoidOut = {
  avoidX: 0,
  avoidY: 0,
  tangX: 0,
  tangY: 0,
  wallNx: 0,
  wallNy: 0,
  wallT: 1,
  hasWallHit: false,
};

const seekOut = {
  seekX: 0,
  seekY: 0,
  flankX: 0,
  flankY: 0,
  wSeek: BANSUNG_FLOCK_CONSTS.W_SEEK as number,
  wFlank: BANSUNG_FLOCK_CONSTS.W_FLANK as number,
  probeDirX: 0,
  probeDirY: 0,
  wantsMove: false,
  distToTarget: Infinity,
  targetX: 0,
  targetY: 0,
  hasTarget: false,
};

// ============================================================================
// 3. Deterministic State, Mass & Lookup Helpers
// ============================================================================

/** Computes deterministic unsigned 32-bit Knuth hash used for flanking slots. */
export function computeFlankSeed(id: number): number {
  return Math.imul(id | 0, 2654435761) >>> 0;
}

/** Computes inverse boids mass (`0` for immovable bosses). */
export function computeEnemyInvMass(role: EnemyFlockRole, mass?: number): number {
  if (role === 'boss') return 0;
  const resolved =
    mass !== undefined && (Number.isFinite(mass) || mass === Infinity)
      ? mass
      : ROLE_DEFAULT_MASS[role];
  if (!Number.isFinite(resolved) || resolved >= 999) return 0;
  return resolved > 0 ? 1 / resolved : 1;
}

/** Allocates a fresh `EnemyFlockState` initialized for entity `id` at `(x, y)`. */
export function createEnemyFlockState(id: number, x = 0, y = 0): EnemyFlockState {
  const flankSeed = computeFlankSeed(id);
  return {
    vx: 0,
    vy: 0,
    targetId: -1,
    flankSeed,
    wallSlideSign: (flankSeed & 2) !== 0 ? 1 : -1,
    stuckTicks: 0,
    detourTicks: 0,
    anchorX: x,
    anchorY: y,
  };
}

/** Resets internal generation/wall-latch caches (useful between isolated test runs). */
export function resetFlockingScratch(): void {
  idGen.fill(0);
  prevSeenGen.fill(0);
  wallBlockedFlags.fill(0);
  lastWallNx.fill(0);
  lastWallNy.fill(0);
  overflowIdSlot.clear();
  overflowWallBlocked.clear();
  overflowWallNormal.clear();
  lookupGen = 1;
}

function ensureEnemyScratchCapacity(count: number): void {
  if (count <= enemyCap) return;
  while (enemyCap < count) enemyCap *= 2;
  cachedRadius = new Float32Array(enemyCap);
  cachedSpeed = new Float32Array(enemyCap);
  cachedInvMass = new Float32Array(enemyCap);
  cachedRoleCode = new Uint8Array(enemyCap);
  cachedPrevX = new Float32Array(enemyCap);
  cachedPrevY = new Float32Array(enemyCap);
  cachedTargetIdx = new Int32Array(enemyCap);
  cachedStunned = new Uint8Array(enemyCap);
  cachedStationary = new Uint8Array(enemyCap);
}

function ensureTargetLoadCapacity(count: number): void {
  if (count <= targetLoadBuf.length) return;
  let nextCap = targetLoadBuf.length;
  while (nextCap < count) nextCap *= 2;
  targetLoadBuf = new Int32Array(nextCap);
}

function ensureInternalGridSize(mapW: number, mapH: number): ActorGrid {
  if (internalEnemyGrid.mapW !== mapW || internalEnemyGrid.mapH !== mapH) {
    internalEnemyGrid = new ActorGrid(mapW, mapH);
  }
  return internalEnemyGrid;
}

function getFlockState(e: FlockEnemy): EnemyFlockState {
  const f = (e.flock ?? e) as EnemyFlockState;
  if (f.flankSeed === undefined || !Number.isFinite(f.flankSeed)) {
    f.flankSeed = computeFlankSeed(e.id);
  }
  if (f.wallSlideSign !== 1 && f.wallSlideSign !== -1) {
    f.wallSlideSign = (f.flankSeed & 2) !== 0 ? 1 : -1;
  }
  if (!Number.isFinite(f.vx)) f.vx = 0;
  if (!Number.isFinite(f.vy)) f.vy = 0;
  if (f.targetId === undefined || !Number.isFinite(f.targetId)) f.targetId = -1;
  if (!Number.isFinite(f.stuckTicks)) f.stuckTicks = 0;
  if (!Number.isFinite(f.detourTicks)) f.detourTicks = 0;
  if (!Number.isFinite(f.anchorX)) f.anchorX = e.x;
  if (!Number.isFinite(f.anchorY)) f.anchorY = e.y;
  return f;
}

function isLivingEnemy(e: FlockEnemy): boolean {
  return e.alive && e.state !== 'dead' && Number.isFinite(e.x) && Number.isFinite(e.y);
}

function beginIdLookup(enemies: readonly FlockEnemy[]): void {
  const prevGen = lookupGen;
  if (lookupGen >= 0xfffffffe) {
    idGen.fill(0);
    prevSeenGen.fill(0);
    wallBlockedFlags.fill(0);
    lastWallNx.fill(0);
    lastWallNy.fill(0);
    lookupGen = 1;
  } else {
    lookupGen += 1;
  }
  overflowIdSlot.clear();

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!isLivingEnemy(e)) continue;
    const id = e.id;
    if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
      idGen[id] = lookupGen;
      idSlot[id] = i;
      if (prevSeenGen[id] !== prevGen) {
        wallBlockedFlags[id] = 0;
        lastWallNx[id] = 0;
        lastWallNy[id] = 0;
      }
      prevSeenGen[id] = lookupGen;
    } else {
      overflowIdSlot.set(id, i);
    }
  }
}

function lookupEnemyIndex(id: number): number {
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    return idGen[id] === lookupGen ? idSlot[id] : -1;
  }
  return overflowIdSlot.get(id) ?? -1;
}

function isWallBlocked(id: number): boolean {
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    return wallBlockedFlags[id] !== 0;
  }
  return overflowWallBlocked.has(id);
}

function setWallBlocked(id: number, blocked: boolean): void {
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    wallBlockedFlags[id] = blocked ? 1 : 0;
    if (!blocked) {
      lastWallNx[id] = 0;
      lastWallNy[id] = 0;
    }
    return;
  }
  if (blocked) {
    overflowWallBlocked.add(id);
  } else {
    overflowWallBlocked.delete(id);
    overflowWallNormal.delete(id);
  }
}

function setLastWallNormal(id: number, nx: number, ny: number): void {
  const ax = Math.abs(nx) >= Math.abs(ny) ? Math.sign(nx) : 0;
  const ay = Math.abs(ny) > Math.abs(nx) ? Math.sign(ny) : 0;
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    lastWallNx[id] = ax;
    lastWallNy[id] = ay;
    return;
  }
  overflowWallNormal.set(id, ((ax + 1) << 2) | (ay + 1));
}

function getLastWallNx(id: number): number {
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    return lastWallNx[id];
  }
  const packed = overflowWallNormal.get(id);
  return packed !== undefined ? ((packed >> 2) & 3) - 1 : 0;
}

function getLastWallNy(id: number): number {
  if (id >= 0 && id < DIRECT_ID_CAP && Number.isInteger(id)) {
    return lastWallNy[id];
  }
  const packed = overflowWallNormal.get(id);
  return packed !== undefined ? (packed & 3) - 1 : 0;
}

function resolveEnemyRole(e: FlockEnemy): EnemyFlockRole {
  if (e.role) return e.role;
  const stats = e.kind ? BANSUNG_ENEMIES[e.kind] : undefined;
  return stats?.role ?? 'melee';
}

function resolveEnemySpeed(e: FlockEnemy): number {
  if (e.moveSpeed !== undefined && Number.isFinite(e.moveSpeed)) {
    return Math.max(0, e.moveSpeed);
  }
  if (e.speed !== undefined && Number.isFinite(e.speed)) {
    return Math.max(0, e.speed);
  }
  if (e.kind === 'bomb_goblin' && e.state === 'fuse') {
    return BANSUNG_MELEE_SPECIALS.bomb_goblin.fuseSpeed;
  }
  const stats = e.kind ? BANSUNG_ENEMIES[e.kind] : undefined;
  return stats ? stats.speed : 100;
}

function resolveEnemyRadius(e: FlockEnemy): number {
  if (Number.isFinite(e.radius) && e.radius > 0) return e.radius;
  const stats = e.kind ? BANSUNG_ENEMIES[e.kind] : undefined;
  return stats ? stats.radius : 12;
}

function isEnemyStunned(e: FlockEnemy): boolean {
  return (
    e.stunned === true ||
    e.state === 'stunned' ||
    (e.stunTicks !== undefined && e.stunTicks > 0) ||
    (e.stunMs !== undefined && e.stunMs > 0)
  );
}

function isEnemyStationary(e: FlockEnemy): boolean {
  if (e.stationary) return true;
  return e.state === 'windup' || e.state === 'attack';
}

function findValidTargetIndex(id: number): number {
  if (id === -1) return -1;
  for (let i = 0; i < validTargets.length; i++) {
    if (validTargets[i].id === id) return i;
  }
  return -1;
}

function shortestAngleDiff(target: number, source: number): number {
  let diff = (target - source) % TAU;
  if (diff > Math.PI) diff -= TAU;
  if (diff < -Math.PI) diff += TAU;
  return diff;
}

function writeGoldenAngleUnit(idA: number, idB: number): void {
  const ang = (((idA ^ idB) >>> 0) * GOLDEN_ANGLE) % TAU;
  const sign = idA < idB ? -1 : 1;
  goldenOut.x = Math.cos(ang) * sign;
  goldenOut.y = Math.sin(ang) * sign;
}

// ============================================================================
// 4. Staggered Target Scoring & Load Distribution (d36 §4.1)
// ============================================================================

function selectTargetForEnemy(
  e: FlockEnemy,
  flock: EnemyFlockState,
  role: EnemyFlockRole,
  curIdx: number,
  tickNo: number,
  forceRetarget: boolean,
): number {
  const nTargets = validTargets.length;
  if (nTargets === 0) {
    flock.targetId = -1;
    return -1;
  }

  if (e.lockedTargetId !== undefined) {
    const lockedIdx = findValidTargetIndex(e.lockedTargetId);
    if (lockedIdx !== -1) {
      if (curIdx !== lockedIdx) {
        if (curIdx !== -1 && curIdx < targetLoadBuf.length && targetLoadBuf[curIdx] > 0) {
          targetLoadBuf[curIdx] -= 1;
        }
        targetLoadBuf[lockedIdx] += 1;
      }
      flock.targetId = validTargets[lockedIdx].id;
      return lockedIdx;
    }
  }

  const interval = BANSUNG_FLOCK_CONSTS.RETARGET_INTERVAL;
  const modTick = ((tickNo % interval) + interval) % interval;
  const modId = ((e.id % interval) + interval) % interval;
  if (!forceRetarget && curIdx !== -1 && modId !== modTick) {
    return curIdx;
  }

  const loadPenalty = role === 'bomber' ? FLOCK_BOMBER_LOAD_PENALTY : FLOCK_TARGET_LOAD_PENALTY;
  let bestIdx = 0;
  let bestScore = Infinity;
  let currentScore = Infinity;

  for (let t = 0; t < nTargets; t++) {
    const tgt = validTargets[t];
    const dist = Math.hypot(tgt.x - e.x, tgt.y - e.y);
    // Exclude self from current target's load so units do not repel themselves across targets
    const load = t === curIdx && targetLoadBuf[t] > 0 ? targetLoadBuf[t] - 1 : targetLoadBuf[t];
    const score = dist + load * loadPenalty + (tgt.scoreOffset ?? 0);
    if (t === curIdx) {
      currentScore = score;
    }
    if (score < bestScore) {
      bestScore = score;
      bestIdx = t;
    }
  }

  if (curIdx !== -1 && bestIdx !== curIdx && bestScore >= currentScore - FLOCK_HYSTERESIS_PX) {
    return curIdx;
  }

  if (curIdx !== -1 && curIdx !== bestIdx && targetLoadBuf[curIdx] > 0) {
    targetLoadBuf[curIdx] -= 1;
  }
  if (curIdx !== bestIdx) {
    targetLoadBuf[bestIdx] += 1;
  }
  flock.targetId = validTargets[bestIdx].id;
  return bestIdx;
}

// ============================================================================
// 5. Role-Based Range Bands & Flanking Vector (d36 §4.1, §4.2)
// ============================================================================

function computeRangedSeek(
  e: FlockEnemy,
  tx: number,
  ty: number,
  dist: number,
  toTargetX: number,
  toTargetY: number,
  tanX: number,
  tanY: number,
  frontCrowdCount: number,
  obsGrid: ObstacleGrid | null | undefined,
): void {
  const stats = e.kind ? BANSUNG_ENEMIES[e.kind] : undefined;
  const rawPref = e.preferredRange ?? stats?.preferredRange;
  let bandMin = 180;
  let bandMax = 280;
  if (typeof rawPref === 'number' && Number.isFinite(rawPref)) {
    bandMin = rawPref * 0.85;
    bandMax = rawPref * 1.05;
  } else if (Array.isArray(rawPref) && rawPref.length >= 2) {
    bandMin = rawPref[0];
    bandMax = rawPref[1];
  }
  const rawMin = e.minRange ?? e.backoffDist ?? stats?.backoffDist ?? 110;
  const minRange = Math.min(rawMin, bandMin);

  if (dist > bandMax) {
    seekOut.seekX = toTargetX;
    seekOut.seekY = toTargetY;
    seekOut.wantsMove = true;
    if (frontCrowdCount >= FLOCK_CROWD_MIN_ALLIES) {
      seekOut.flankX = tanX * 0.5;
      seekOut.flankY = tanY * 0.5;
    }
    seekOut.probeDirX = toTargetX;
    seekOut.probeDirY = toTargetY;
    return;
  }

  if (dist < minRange) {
    // Radial retreat + tangential strafe so ranged units stay behind frontline brutes
    const rx = -toTargetX + tanX * 0.65;
    const ry = -toTargetY + tanY * 0.65;
    const rLen = Math.hypot(rx, ry) || 1;
    seekOut.seekX = rx / rLen;
    seekOut.seekY = ry / rLen;
    seekOut.wantsMove = true;
    seekOut.probeDirX = seekOut.seekX;
    seekOut.probeDirY = seekOut.seekY;
    return;
  }

  const hasLos = obsGrid ? hasLineOfSight(obsGrid, e.x, e.y, tx, ty, 'los') : true;
  if (!hasLos) {
    const px = toTargetX * 0.45 + tanX * 0.85;
    const py = toTargetY * 0.45 + tanY * 0.85;
    const pLen = Math.hypot(px, py) || 1;
    seekOut.seekX = px / pLen;
    seekOut.seekY = py / pLen;
    seekOut.wantsMove = true;
    seekOut.probeDirX = seekOut.seekX;
    seekOut.probeDirY = seekOut.seekY;
    return;
  }

  if (dist < bandMin) {
    const rx = -toTargetX * 0.5 + tanX * 0.5;
    const ry = -toTargetY * 0.5 + tanY * 0.5;
    const rLen = Math.hypot(rx, ry) || 1;
    seekOut.seekX = rx / rLen;
    seekOut.seekY = ry / rLen;
    seekOut.wantsMove = true;
    seekOut.probeDirX = seekOut.seekX;
    seekOut.probeDirY = seekOut.seekY;
    return;
  }

  // Inside preferred annulus with clear LOS: seek = 0, gentle orbit + separation only
  seekOut.seekX = 0;
  seekOut.seekY = 0;
  seekOut.flankX = tanX * 0.25;
  seekOut.flankY = tanY * 0.25;
  seekOut.wFlank = 0.25;
  seekOut.wantsMove = false;
}

function computeSeekAndFlank(
  e: FlockEnemy,
  flock: EnemyFlockState,
  role: EnemyFlockRole,
  eRadius: number,
  targetIdx: number,
  obsGrid: ObstacleGrid | null | undefined,
  frontCrowdCount: number,
): void {
  seekOut.seekX = 0;
  seekOut.seekY = 0;
  seekOut.flankX = 0;
  seekOut.flankY = 0;
  seekOut.wSeek = BANSUNG_FLOCK_CONSTS.W_SEEK;
  seekOut.wFlank = BANSUNG_FLOCK_CONSTS.W_FLANK;
  seekOut.probeDirX = 0;
  seekOut.probeDirY = 0;
  seekOut.wantsMove = false;
  seekOut.distToTarget = Infinity;
  seekOut.hasTarget = false;

  if (targetIdx < 0 || targetIdx >= validTargets.length) {
    return;
  }

  const tgt = validTargets[targetIdx];
  const tx = tgt.x;
  const ty = tgt.y;
  const tr = tgt.radius !== undefined && Number.isFinite(tgt.radius) ? tgt.radius : 14;
  const dx = tx - e.x;
  const dy = ty - e.y;
  const dist = Math.hypot(dx, dy);

  seekOut.hasTarget = true;
  seekOut.targetX = tx;
  seekOut.targetY = ty;
  seekOut.distToTarget = dist;

  const toTargetX = dist > 1e-4 ? dx / dist : 1;
  const toTargetY = dist > 1e-4 ? dy / dist : 0;
  const side: -1 | 1 = (flock.flankSeed & 1) !== 0 ? 1 : -1;
  const tanX = -toTargetY * side;
  const tanY = toTargetX * side;

  if (role === 'boss') {
    const stopDist = tr + eRadius + 4;
    if (dist > stopDist) {
      seekOut.seekX = toTargetX;
      seekOut.seekY = toTargetY;
      seekOut.wantsMove = true;
    }
    seekOut.wFlank = 0;
    seekOut.probeDirX = toTargetX;
    seekOut.probeDirY = toTargetY;
    return;
  }

  if (role === 'bomber') {
    if (dist > 4) {
      seekOut.seekX = toTargetX;
      seekOut.seekY = toTargetY;
      seekOut.wantsMove = true;
    }
    seekOut.wFlank = FLOCK_BOMBER_W_FLANK;
    if (
      frontCrowdCount >= FLOCK_CROWD_MIN_ALLIES &&
      dist >= FLOCK_FLANK_MIN_DIST &&
      dist <= FLOCK_FLANK_MAX_DIST
    ) {
      seekOut.flankX = tanX;
      seekOut.flankY = tanY;
    }
    seekOut.probeDirX = toTargetX;
    seekOut.probeDirY = toTargetY;
    return;
  }

  if (role === 'ranged' || role === 'caster') {
    computeRangedSeek(e, tx, ty, dist, toTargetX, toTargetY, tanX, tanY, frontCrowdCount, obsGrid);
    return;
  }

  // 'melee' | 'brute': 10-slot crescent flanking ring around target
  const slot = flock.flankSeed % BANSUNG_FLOCK_CONSTS.RING_SLOTS;
  const slotAng = (slot / BANSUNG_FLOCK_CONSTS.RING_SLOTS) * TAU;
  const ringDist = tr + eRadius + 4;
  const baseAng = Math.atan2(e.y - ty, e.x - tx);

  if (dist <= tr + eRadius) {
    seekOut.seekX = -toTargetX;
    seekOut.seekY = -toTargetY;
    seekOut.wantsMove = true;
  } else {
    let aimAng = slotAng;
    if (dist <= 140) {
      const diff = shortestAngleDiff(slotAng, baseAng);
      if (Math.abs(diff) > Math.PI * 0.45) {
        aimAng = baseAng + (diff > 0 ? Math.PI * 0.45 : -Math.PI * 0.45);
      }
    }
    const goalX = tx + Math.cos(aimAng) * ringDist;
    const goalY = ty + Math.sin(aimAng) * ringDist;
    const gdx = goalX - e.x;
    const gdy = goalY - e.y;
    const gDist = Math.hypot(gdx, gdy);

    if (gDist > 3) {
      const taper = gDist < 8 ? gDist / 8 : 1;
      seekOut.seekX = (gdx / gDist) * taper;
      seekOut.seekY = (gdy / gDist) * taper;
      seekOut.wantsMove = gDist > 5 && dist > ringDist + 2;
    }
  }

  if (
    frontCrowdCount >= FLOCK_CROWD_MIN_ALLIES &&
    dist >= FLOCK_FLANK_MIN_DIST &&
    dist <= FLOCK_FLANK_MAX_DIST
  ) {
    const flankDeg = 35 + Math.min(60, (frontCrowdCount - 2) * 15 + ((flock.flankSeed >>> 1) % 31));
    const flankRad = side * flankDeg * DEG_TO_RAD;
    const cosA = Math.cos(flankRad);
    const sinA = Math.sin(flankRad);
    seekOut.flankX = toTargetX * cosA - toTargetY * sinA;
    seekOut.flankY = toTargetX * sinA + toTargetY * cosA;
    seekOut.wSeek = Math.max(0.35, 1.0 - 0.15 * frontCrowdCount);
    seekOut.wFlank = Math.max(BANSUNG_FLOCK_CONSTS.W_FLANK, 0.85);
    seekOut.wantsMove = true;
  }

  const pX = seekOut.seekX * seekOut.wSeek + seekOut.flankX * seekOut.wFlank;
  const pY = seekOut.seekY * seekOut.wSeek + seekOut.flankY * seekOut.wFlank;
  const pLen = Math.hypot(pX, pY);
  if (pLen > 1e-4) {
    seekOut.probeDirX = pX / pLen;
    seekOut.probeDirY = pY / pLen;
  } else {
    seekOut.probeDirX = toTargetX;
    seekOut.probeDirY = toTargetY;
  }
}

// ============================================================================
// 6. Bounded Boids Pass (d36 §4.3)
// ============================================================================

function computeBoidsForces(
  enemies: readonly FlockEnemy[],
  activeGrid: ActorGrid,
  e: FlockEnemy,
  eIdx: number,
  eRadius: number,
  eSpeed: number,
  isBoss: boolean,
  hasTarget: boolean,
  targetX: number,
  targetY: number,
  skipBoids: boolean,
): void {
  boidsOut.sepX = 0;
  boidsOut.sepY = 0;
  boidsOut.frontCrowdCount = 0;
  boidsOut.cohX = 0;
  boidsOut.cohY = 0;
  boidsOut.alignX = 0;
  boidsOut.alignY = 0;

  if (skipBoids) return;

  let toTargetX = 0;
  let toTargetY = 0;
  let distToTarget = Infinity;
  if (hasTarget) {
    const dxT = targetX - e.x;
    const dyT = targetY - e.y;
    distToTarget = Math.hypot(dxT, dyT);
    if (distToTarget > 1e-4) {
      toTargetX = dxT / distToTarget;
      toTargetY = dyT / distToTarget;
    }
  }

  const queryR = Math.max(BANSUNG_FLOCK_CONSTS.NEIGHBOR_RADIUS, eRadius + 38);
  const nCount = activeGrid.queryEnemies(
    e.x,
    e.y,
    queryR,
    neighborBuf,
    BANSUNG_FLOCK_CONSTS.MAX_NEIGHBORS,
    e.id,
  );

  for (let k = 0; k < nCount; k++) {
    const oid = neighborBuf[k];
    if (oid === e.id) continue;
    const oIdx = lookupEnemyIndex(oid);
    if (oIdx < 0 || oIdx === eIdx) continue;
    const o = enemies[oIdx];
    const oRadius = cachedRadius[oIdx];
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const d = Math.hypot(dx, dy);

    if (hasTarget && distToTarget > 1e-4 && d >= 0.05 && d < FLOCK_CROWD_RADIUS) {
      const frontDot = ((-dx) * toTargetX + (-dy) * toTargetY) / d;
      if (frontDot > FLOCK_CROWD_FRONT_DOT) {
        boidsOut.frontCrowdCount += 1;
      }
    }

    if (isBoss && cachedRoleCode[oIdx] !== 5) continue;

    const desired = eRadius + oRadius + 10;
    if (d < desired) {
      const mag = ((desired - d) / desired) ** 2;
      if (d < 0.05) {
        writeGoldenAngleUnit(e.id, o.id);
        boidsOut.sepX += goldenOut.x * mag;
        boidsOut.sepY += goldenOut.y * mag;
      } else {
        boidsOut.sepX += (dx / d) * mag;
        boidsOut.sepY += (dy / d) * mag;
      }
    }
  }

  // Far-field platoon march cohesion & alignment (dist > 180px, non-boss)
  if (isBoss || !hasTarget || distToTarget <= FLOCK_PLATOON_MIN_DIST) {
    return;
  }

  const cCount = activeGrid.queryEnemies(
    e.x,
    e.y,
    BANSUNG_FLOCK_CONSTS.COHESION_RADIUS,
    cohesionBuf,
    BANSUNG_FLOCK_CONSTS.MAX_NEIGHBORS,
    e.id,
  );

  let matchCount = 0;
  let sumPosX = 0;
  let sumPosY = 0;
  let sumVelX = 0;
  let sumVelY = 0;

  for (let k = 0; k < cCount; k++) {
    const oid = cohesionBuf[k];
    if (oid === e.id) continue;
    const oIdx = lookupEnemyIndex(oid);
    if (oIdx < 0 || cachedRoleCode[oIdx] === 5 || cachedStationary[oIdx] !== 0) continue;
    if (Math.abs(cachedSpeed[oIdx] - eSpeed) > FLOCK_PLATOON_SPEED_BAND) continue;

    const o = enemies[oIdx];
    const oFlock = o.flock ?? o;
    const ovx = oFlock.vx;
    const ovy = oFlock.vy;
    sumPosX += o.x;
    sumPosY += o.y;
    sumVelX += ovx !== undefined && Number.isFinite(ovx) ? ovx : 0;
    sumVelY += ovy !== undefined && Number.isFinite(ovy) ? ovy : 0;
    matchCount += 1;
  }

  if (matchCount > 0) {
    const cx = sumPosX / matchCount - e.x;
    const cy = sumPosY / matchCount - e.y;
    const cLen = Math.hypot(cx, cy);
    if (cLen > 1e-4) {
      boidsOut.cohX = (cx / cLen) * BANSUNG_FLOCK_CONSTS.W_COHESION;
      boidsOut.cohY = (cy / cLen) * BANSUNG_FLOCK_CONSTS.W_COHESION;
    }
    const aLen = Math.hypot(sumVelX, sumVelY);
    if (aLen > 1e-4) {
      boidsOut.alignX = (sumVelX / aLen) * BANSUNG_FLOCK_CONSTS.W_ALIGN;
      boidsOut.alignY = (sumVelY / aLen) * BANSUNG_FLOCK_CONSTS.W_ALIGN;
    }
  }
}

// ============================================================================
// 7. Zero-Alloc AABB Whisker Probe & Stuck Recovery (d36 §4.4)
// ============================================================================

function probeObstacleWhisker(
  obsGrid: ObstacleGrid,
  x0: number,
  y0: number,
  dirX: number,
  dirY: number,
  look: number,
  radius: number,
): boolean {
  whiskerOut.hit = false;
  whiskerOut.t = 1;
  whiskerOut.nx = 0;
  whiskerOut.ny = 0;
  whiskerOut.obstacle = null;

  if (obsGrid.obstacles.length === 0 || look <= 0) return false;

  const dx = dirX * look;
  const dy = dirY * look;
  const x1 = x0 + dx;
  const y1 = y0 + dy;
  obsGrid.queryAabb(
    (x0 < x1 ? x0 : x1) - radius,
    (y0 < y1 ? y0 : y1) - radius,
    (x0 > x1 ? x0 : x1) + radius,
    (y0 > y1 ? y0 : y1) + radius,
    tmpWhiskerObs,
  );

  let bestT = Infinity;
  let bestNx = 0;
  let bestNy = 0;
  let bestObs: ArenaObstacle | null = null;

  for (let i = 0; i < tmpWhiskerObs.length; i++) {
    const o = tmpWhiskerObs[i];
    if (!o.alive || !o.blocksMove) continue;

    const bMinX = o.x - radius;
    const bMaxX = o.x + o.w + radius;
    const bMinY = o.y - radius;
    const bMaxY = o.y + o.h + radius;

    if (x0 > bMinX && x0 < bMaxX && y0 > bMinY && y0 < bMaxY) {
      const penLeft = x0 - bMinX;
      const penRight = bMaxX - x0;
      const penTop = y0 - bMinY;
      const penBot = bMaxY - y0;
      let minPen = penLeft;
      bestNx = -1;
      bestNy = 0;
      if (penRight < minPen) {
        minPen = penRight;
        bestNx = 1;
        bestNy = 0;
      }
      if (penTop < minPen) {
        minPen = penTop;
        bestNx = 0;
        bestNy = -1;
      }
      if (penBot < minPen) {
        bestNx = 0;
        bestNy = 1;
      }
      bestT = 0;
      bestObs = o;
      break;
    }

    let txMin = -Infinity;
    let txMax = Infinity;
    let nxEnter = 0;
    if (Math.abs(dx) < SLAB_EPS) {
      if (x0 <= bMinX || x0 >= bMaxX) continue;
    } else {
      const invDx = 1 / dx;
      const t1 = (bMinX - x0) * invDx;
      const t2 = (bMaxX - x0) * invDx;
      if (t1 <= t2) {
        txMin = t1;
        txMax = t2;
        nxEnter = -1;
      } else {
        txMin = t2;
        txMax = t1;
        nxEnter = 1;
      }
    }

    let tyMin = -Infinity;
    let tyMax = Infinity;
    let nyEnter = 0;
    if (Math.abs(dy) < SLAB_EPS) {
      if (y0 <= bMinY || y0 >= bMaxY) continue;
    } else {
      const invDy = 1 / dy;
      const t1 = (bMinY - y0) * invDy;
      const t2 = (bMaxY - y0) * invDy;
      if (t1 <= t2) {
        tyMin = t1;
        tyMax = t2;
        nyEnter = -1;
      } else {
        tyMin = t2;
        tyMax = t1;
        nyEnter = 1;
      }
    }

    const tEnter = txMin > tyMin ? txMin : tyMin;
    const tExit = txMax < tyMax ? txMax : tyMax;
    if (tEnter > tExit || tExit <= 0 || tEnter < 0 || tEnter > 1) continue;

    if (tEnter < bestT) {
      bestT = tEnter;
      bestObs = o;
      if (txMin > tyMin) {
        bestNx = nxEnter;
        bestNy = 0;
      } else if (tyMin > txMin) {
        bestNx = 0;
        bestNy = nyEnter;
      } else {
        const scale = nxEnter !== 0 && nyEnter !== 0 ? Math.SQRT1_2 : 1;
        bestNx = nxEnter * scale;
        bestNy = nyEnter * scale;
      }
    }
  }

  if (!bestObs) return false;
  whiskerOut.hit = true;
  whiskerOut.t = bestT;
  whiskerOut.nx = bestNx;
  whiskerOut.ny = bestNy;
  whiskerOut.obstacle = bestObs;
  return true;
}

function chooseInitialWallSlideSign(
  e: FlockEnemy,
  flock: EnemyFlockState,
  eRadius: number,
  obs: ArenaObstacle,
  nx: number,
  ny: number,
  dirX: number,
  dirY: number,
  targetX: number,
  targetY: number,
  mapW: number,
  mapH: number,
): void {
  if (e.lockWallSlideSign) return;

  const cwX = -ny;
  const cwY = nx;

  // For bounded obstacles/pillars, always commit to the shorter path around the obstacle edges
  // before consulting noisy tangent/flank probe components.
  if (obs.w < mapW * 0.5 && obs.h < mapH * 0.5) {
    if (Math.abs(nx) >= Math.abs(ny)) {
      const topY = obs.y - eRadius;
      const botY = obs.y + obs.h + eRadius;
      const costTop = Math.abs(e.y - topY) + Math.abs(targetY - topY);
      const costBot = Math.abs(e.y - botY) + Math.abs(targetY - botY);
      if (Math.abs(costTop - costBot) > 4) {
        flock.wallSlideSign = (costTop < costBot) === (cwY < 0) ? 1 : -1;
        return;
      }
    } else {
      const leftX = obs.x - eRadius;
      const rightX = obs.x + obs.w + eRadius;
      const costLeft = Math.abs(e.x - leftX) + Math.abs(targetX - leftX);
      const costRight = Math.abs(e.x - rightX) + Math.abs(targetX - rightX);
      if (Math.abs(costLeft - costRight) > 4) {
        flock.wallSlideSign = (costLeft < costRight) === (cwX < 0) ? 1 : -1;
        return;
      }
    }
  }

  const dotCw = dirX * cwX + dirY * cwY;
  const dotCcw = -dotCw;
  if (Math.abs(dotCw - dotCcw) > 0.15) {
    flock.wallSlideSign = dotCw >= dotCcw ? 1 : -1;
  }
}

function computeAvoidanceAndStuck(
  e: FlockEnemy,
  flock: EnemyFlockState,
  eRadius: number,
  obsGrid: ObstacleGrid | null | undefined,
  mapW: number,
  mapH: number,
): void {
  avoidOut.avoidX = 0;
  avoidOut.avoidY = 0;
  avoidOut.tangX = 0;
  avoidOut.tangY = 0;
  avoidOut.wallNx = 0;
  avoidOut.wallNy = 0;
  avoidOut.wallT = 1;
  avoidOut.hasWallHit = false;

  if (
    obsGrid &&
    (seekOut.wantsMove || flock.detourTicks > 0) &&
    (seekOut.probeDirX !== 0 || seekOut.probeDirY !== 0)
  ) {
    const look = eRadius + FLOCK_WHISKER_PAD_PX;
    const hit = probeObstacleWhisker(
      obsGrid,
      e.x,
      e.y,
      seekOut.probeDirX,
      seekOut.probeDirY,
      look,
      eRadius,
    );
    if (hit && whiskerOut.obstacle) {
      let wallNx = whiskerOut.nx;
      let wallNy = whiskerOut.ny;
      let wallT = whiskerOut.t;

      if (!isWallBlocked(e.id)) {
        chooseInitialWallSlideSign(
          e,
          flock,
          eRadius,
          whiskerOut.obstacle,
          wallNx,
          wallNy,
          seekOut.probeDirX,
          seekOut.probeDirY,
          seekOut.targetX,
          seekOut.targetY,
          mapW,
          mapH,
        );
        setWallBlocked(e.id, true);
      }

      let tx = flock.wallSlideSign > 0 ? -wallNy : wallNy;
      let ty = flock.wallSlideSign > 0 ? wallNx : -wallNx;

      // Secondary corner-turn feeler along the chosen slide tangent prevents corner/U-pocket traps.
      if (probeObstacleWhisker(obsGrid, e.x, e.y, tx, ty, eRadius + 14, eRadius)) {
        const dotN = whiskerOut.nx * wallNx + whiskerOut.ny * wallNy;
        if (dotN < 0.5) {
          wallNx = whiskerOut.nx;
          wallNy = whiskerOut.ny;
          if (whiskerOut.t < wallT) wallT = whiskerOut.t;
          tx = flock.wallSlideSign > 0 ? -wallNy : wallNy;
          ty = flock.wallSlideSign > 0 ? wallNx : -wallNx;
        }
      }

      setLastWallNormal(e.id, wallNx, wallNy);
      avoidOut.hasWallHit = true;
      avoidOut.wallNx = wallNx;
      avoidOut.wallNy = wallNy;
      avoidOut.wallT = wallT;
      avoidOut.tangX = tx;
      avoidOut.tangY = ty;
      avoidOut.avoidX = tx * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
      avoidOut.avoidY = ty * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
    } else if (
      isWallBlocked(e.id) &&
      seekOut.hasTarget &&
      !hasLineOfSight(obsGrid, e.x, e.y, seekOut.targetX, seekOut.targetY, 'move')
    ) {
      const prevNx = getLastWallNx(e.id);
      const prevNy = getLastWallNy(e.id);
      if (prevNx !== 0 || prevNy !== 0) {
        const tx = flock.wallSlideSign > 0 ? -prevNy : prevNy;
        const ty = flock.wallSlideSign > 0 ? prevNx : -prevNx;
        // 1) Side wall-hug feeler: stay on the wall surface until past its corner.
        if (probeObstacleWhisker(obsGrid, e.x, e.y, -prevNx, -prevNy, eRadius + 12, eRadius)) {
          setLastWallNormal(e.id, whiskerOut.nx, whiskerOut.ny);
          avoidOut.hasWallHit = true;
          avoidOut.wallNx = whiskerOut.nx;
          avoidOut.wallNy = whiskerOut.ny;
          avoidOut.wallT = 0.2;
          avoidOut.tangX = flock.wallSlideSign > 0 ? -whiskerOut.ny : whiskerOut.ny;
          avoidOut.tangY = flock.wallSlideSign > 0 ? whiskerOut.nx : -whiskerOut.nx;
          avoidOut.avoidX = avoidOut.tangX * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
          avoidOut.avoidY = avoidOut.tangY * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
        } else {
          // 2) Corner-wrap feeler: if we just stepped past an edge while still LOS-blocked, hug around it.
          const backX = -tx * 0.5 - prevNx * 0.866;
          const backY = -ty * 0.5 - prevNy * 0.866;
          if (probeObstacleWhisker(obsGrid, e.x, e.y, backX, backY, eRadius + 24, eRadius)) {
            const wx = tx - prevNx * 1.4;
            const wy = ty - prevNy * 1.4;
            const wLen = Math.hypot(wx, wy) || 1;
            const ux = wx / wLen;
            const uy = wy / wLen;
            avoidOut.hasWallHit = true;
            avoidOut.wallNx = prevNx;
            avoidOut.wallNy = prevNy;
            avoidOut.wallT = 0.5;
            avoidOut.tangX = ux;
            avoidOut.tangY = uy;
            avoidOut.avoidX = ux * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
            avoidOut.avoidY = uy * BANSUNG_FLOCK_CONSTS.W_WALL_AVOID;
          } else {
            setWallBlocked(e.id, false);
          }
        }
      } else {
        setWallBlocked(e.id, false);
      }
    } else {
      setWallBlocked(e.id, false);
    }
  } else {
    setWallBlocked(e.id, false);
  }

  const atkCd = e.attackCooldown ?? e.cooldownTicks ?? 0;
  if (seekOut.wantsMove && atkCd <= 0 && flock.detourTicks <= 0) {
    flock.stuckTicks += 1;
    if (flock.stuckTicks >= FLOCK_STUCK_CHECK_TICKS) {
      if (Math.hypot(e.x - flock.anchorX, e.y - flock.anchorY) < FLOCK_MIN_STUCK_MOVE_PX) {
        flock.wallSlideSign = flock.wallSlideSign > 0 ? -1 : 1;
        flock.detourTicks = FLOCK_DETOUR_TICKS;
      }
      flock.stuckTicks = 0;
      flock.anchorX = e.x;
      flock.anchorY = e.y;
    }
  } else if (!seekOut.wantsMove || atkCd > 0) {
    flock.stuckTicks = 0;
    flock.anchorX = e.x;
    flock.anchorY = e.y;
  }
}

// ============================================================================
// 8. Integration, 2-Pass Hard Separation & Final Clamp (d36 §4.5, §5)
// ============================================================================

function applyKnockbackAndIntegrate(
  e: FlockEnemy,
  flock: EnemyFlockState,
  eRadius: number,
  obsGrid: ObstacleGrid | null | undefined,
  dt: number,
  mapW: number,
  mapH: number,
  margin: number,
  knockDecay: number,
): void {
  const kvx = e.knockVx !== undefined && Number.isFinite(e.knockVx) ? e.knockVx : 0;
  const kvy = e.knockVy !== undefined && Number.isFinite(e.knockVy) ? e.knockVy : 0;
  const stepDx = (flock.vx + kvx) * dt;
  const stepDy = (flock.vy + kvy) * dt;

  if (obsGrid && (stepDx !== 0 || stepDy !== 0)) {
    tmpBody.x = e.x;
    tmpBody.y = e.y;
    tmpBody.radius = eRadius;
    moveCircleWithSlide(tmpBody, stepDx, stepDy, obsGrid, mapW, mapH, margin);
    e.x = tmpBody.x;
    e.y = tmpBody.y;
  } else {
    e.x += stepDx;
    e.y += stepDy;
  }

  if (e.knockVx !== undefined) {
    const nextKx = kvx * knockDecay;
    e.knockVx = Math.abs(nextKx) < 1 ? 0 : nextKx;
  }
  if (e.knockVy !== undefined) {
    const nextKy = kvy * knockDecay;
    e.knockVy = Math.abs(nextKy) < 1 ? 0 : nextKy;
  }
}

function runHardSeparationPasses(
  enemies: readonly FlockEnemy[],
  hardGrid: ActorGrid,
): void {
  const nEnemies = enemies.length;
  const maxIters = BANSUNG_FLOCK_CONSTS.SEP_SOLVER_ITERS + 4;
  for (let iter = 0; iter < maxIters; iter++) {
    hardGrid.rebuild(enemies);
    const reverse = (iter & 1) !== 0;
    let needsPolish = false;

    for (let step = 0; step < nEnemies; step++) {
      const i = reverse ? nEnemies - 1 - step : step;
      const e = enemies[i];
      if (!isLivingEnemy(e)) continue;

      const eRadius = cachedRadius[i];
      const invMassE = cachedInvMass[i];
      const nCount = hardGrid.queryEnemies(
        e.x,
        e.y,
        eRadius + FLOCK_HARD_PAD_PX + 0.5,
        hardNeighborBuf,
        hardNeighborBuf.length,
        e.id,
      );

      for (let k = 0; k < nCount; k++) {
        const oid = hardNeighborBuf[k];
        const oIdx = lookupEnemyIndex(oid);
        if (oIdx < 0) continue;
        if (reverse ? oIdx >= i : oIdx <= i) continue;

        const o = enemies[oIdx];
        const oRadius = cachedRadius[oIdx];
        const sumRadii = eRadius + oRadius;
        const minDist = sumRadii + FLOCK_HARD_PAD_PX;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        const d = Math.sqrt(d2);
        const overlap = (minDist - d) * FLOCK_HARD_RELAX;
        const invMassO = cachedInvMass[oIdx];
        const invSum = invMassE + invMassO;
        const wE = invSum > 0 ? invMassE / invSum : 0.5;
        const wO = 1 - wE;

        if (d < sumRadii * 0.9 || overlap * (wE > wO ? wE : wO) > 2.5) {
          needsPolish = true;
        }

        let nx: number;
        let ny: number;
        if (d < 0.05) {
          writeGoldenAngleUnit(e.id, o.id);
          nx = goldenOut.x;
          ny = goldenOut.y;
        } else {
          nx = dx / d;
          ny = dy / d;
        }

        e.x -= nx * overlap * wE;
        e.y -= ny * overlap * wE;
        o.x += nx * overlap * wO;
        o.y += ny * overlap * wO;
      }
    }

    if (iter >= BANSUNG_FLOCK_CONSTS.SEP_SOLVER_ITERS - 1 && !needsPolish) {
      break;
    }
  }
}

function clampAndSyncAnimation(
  enemies: readonly FlockEnemy[],
  obsGrid: ObstacleGrid | null | undefined,
  dt: number,
  mapW: number,
  mapH: number,
  margin: number,
): void {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!isLivingEnemy(e)) continue;

    const eRadius = cachedRadius[i];
    if (obsGrid) {
      tmpBody.x = e.x;
      tmpBody.y = e.y;
      tmpBody.radius = eRadius;
      resolveCircleObstacles(tmpBody, obsGrid, mapW, mapH, margin);
      e.x = tmpBody.x;
      e.y = tmpBody.y;
    } else {
      const minX = margin + eRadius;
      const maxX = mapW - margin - eRadius;
      const minY = margin + eRadius;
      const maxY = mapH - margin - eRadius;
      if (minX <= maxX) {
        if (e.x < minX) e.x = minX;
        else if (e.x > maxX) e.x = maxX;
      }
      if (minY <= maxY) {
        if (e.y < minY) e.y = minY;
        else if (e.y > maxY) e.y = maxY;
      }
    }

    const flock = getFlockState(e);
    e.actualSpeed = dt > 0 ? Math.hypot(e.x - cachedPrevX[i], e.y - cachedPrevY[i]) / dt : 0;

    const tIdx = cachedTargetIdx[i];
    if (cachedStunned[i]) {
      // Preserve existing facing while stunned
    } else if (e.attackFacingTarget && tIdx !== -1) {
      e.facingLeft = validTargets[tIdx].x < e.x;
    } else if (
      cachedStationary[i] ||
      e.state === 'windup' ||
      e.state === 'attack' ||
      e.state === 'fuse' ||
      e.state === 'lunge'
    ) {
      if (
        e.lockedTargetId === undefined &&
        tIdx !== -1 &&
        (e.state === 'windup' || e.state === 'attack' || e.state === 'lunge')
      ) {
        e.facingLeft = validTargets[tIdx].x < e.x;
      }
    } else if (Math.abs(flock.vx) > BANSUNG_FLOCK_CONSTS.FACING_HYSTERESIS_PX_S) {
      e.facingLeft = flock.vx < 0;
    }
  }
}

/**
 * Advances all living enemies for one 30Hz tick:
 * 1. Staggered co-op target scoring with crowd-load balancing & hysteresis
 * 2. Role-based range bands & 10-slot crescent flanking arcs
 * 3. Bounded spatial-hash soft separation + far-field platoon march (cap 10)
 * 4. AABB whisker tangent avoidance + 15-tick stuck detour recovery
 * 5. Exponential velocity blending, knockback integration & slide movement
 * 6. 2-pass mass-weighted hard circle projection (`SEP_SOLVER_ITERS = 2`)
 * 7. Final `resolveCircleObstacles` bounds/wall clamp + facing/speed sync
 */
export function stepEnemyFlocking(
  enemies: readonly FlockEnemy[],
  targets: readonly FlockTarget[],
  obsGrid: ObstacleGrid | null | undefined,
  enemyGrid: ActorGrid | null | undefined,
  tickNo: number,
  options?: StepEnemyFlockingOptions,
): void {
  const nEnemies = enemies.length;
  if (nEnemies === 0) return;

  const dt = options?.dt ?? BANSUNG_FLOCK_CONSTS.FLOCK_DT;
  const mapW = options?.mapW ?? obsGrid?.mapW ?? BANSUNG_MAP_W;
  const mapH = options?.mapH ?? obsGrid?.mapH ?? BANSUNG_MAP_H;
  const margin = options?.margin ?? 0;
  const knockDecay = options?.knockDecay ?? FLOCK_DEFAULT_KNOCK_DECAY;
  const forceRetarget = options?.forceRetarget ?? false;
  const reducedLoad = options?.reducedLoad ?? false;

  ensureEnemyScratchCapacity(nEnemies);
  beginIdLookup(enemies);

  validTargets.length = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (t.alive && !t.downed && Number.isFinite(t.x) && Number.isFinite(t.y)) {
      validTargets.push(t);
    }
  }
  ensureTargetLoadCapacity(validTargets.length);
  targetLoadBuf.fill(0, 0, validTargets.length);

  for (let i = 0; i < nEnemies; i++) {
    const e = enemies[i];
    if (!isLivingEnemy(e)) {
      cachedTargetIdx[i] = -1;
      continue;
    }
    const flock = getFlockState(e);
    const role = resolveEnemyRole(e);
    cachedRoleCode[i] = ROLE_CODE_MAP[role];
    cachedRadius[i] = resolveEnemyRadius(e);
    cachedSpeed[i] = resolveEnemySpeed(e);
    cachedInvMass[i] = computeEnemyInvMass(role, e.mass);
    cachedPrevX[i] = e.x;
    cachedPrevY[i] = e.y;
    cachedStunned[i] = isEnemyStunned(e) ? 1 : 0;
    cachedStationary[i] = isEnemyStationary(e) ? 1 : 0;

    const tIdx = findValidTargetIndex(flock.targetId);
    cachedTargetIdx[i] = tIdx;
    if (tIdx !== -1) targetLoadBuf[tIdx] += 1;
  }

  let activeGrid: ActorGrid;
  if (enemyGrid && enemyGrid.items.length > 0) {
    activeGrid = enemyGrid;
  } else {
    activeGrid = ensureInternalGridSize(mapW, mapH);
    activeGrid.rebuild(enemies);
  }

  for (let i = 0; i < nEnemies; i++) {
    const e = enemies[i];
    if (!isLivingEnemy(e)) continue;

    const flock = getFlockState(e);
    const role = resolveEnemyRole(e);
    const eRadius = cachedRadius[i];
    const eSpeed = cachedSpeed[i];
    const isBoss = cachedRoleCode[i] === 5;
    const tIdx = selectTargetForEnemy(e, flock, role, cachedTargetIdx[i], tickNo, forceRetarget);
    cachedTargetIdx[i] = tIdx;

    if (cachedStunned[i] !== 0 || cachedStationary[i] !== 0) {
      flock.vx = 0;
      flock.vy = 0;
      flock.stuckTicks = 0;
      flock.anchorX = e.x;
      flock.anchorY = e.y;
      if (cachedStationary[i] !== 0 && e.attackFacingTarget !== false && tIdx !== -1) {
        e.facingLeft = validTargets[tIdx].x < e.x;
      }
      applyKnockbackAndIntegrate(e, flock, eRadius, obsGrid, dt, mapW, mapH, margin, knockDecay);
      continue;
    }

    const tgt = tIdx !== -1 ? validTargets[tIdx] : null;
    computeBoidsForces(
      enemies,
      activeGrid,
      e,
      i,
      eRadius,
      eSpeed,
      isBoss,
      tgt !== null,
      tgt ? tgt.x : 0,
      tgt ? tgt.y : 0,
      reducedLoad && ((tickNo + i) & 1) !== 0,
    );

    computeSeekAndFlank(e, flock, role, eRadius, tIdx, obsGrid, boidsOut.frontCrowdCount);
    computeAvoidanceAndStuck(e, flock, eRadius, obsGrid, mapW, mapH);

    let wSep: number = BANSUNG_FLOCK_CONSTS.W_SEPARATION;
    if (role === 'bomber' && seekOut.distToTarget < FLOCK_BOMBER_RUSH_DIST) {
      wSep = FLOCK_BOMBER_W_SEP;
    }
    if (e.sepWeightScale !== undefined && Number.isFinite(e.sepWeightScale)) {
      wSep *= e.sepWeightScale;
    } else if (e.state === 'fuse') {
      wSep *= BANSUNG_MELEE_SPECIALS.bomb_goblin.fuseSepWeight;
    }

    let targetVx = 0;
    let targetVy = 0;

    if (flock.detourTicks > 0) {
      flock.detourTicks -= 1;
      let tx = avoidOut.tangX;
      let ty = avoidOut.tangY;
      if (!avoidOut.hasWallHit) {
        const refX = seekOut.probeDirX !== 0 || seekOut.probeDirY !== 0 ? seekOut.probeDirX : 1;
        const refY = seekOut.probeDirX !== 0 || seekOut.probeDirY !== 0 ? seekOut.probeDirY : 0;
        tx = flock.wallSlideSign > 0 ? -refY : refY;
        ty = flock.wallSlideSign > 0 ? refX : -refX;
      }
      const dxDetour = tx + boidsOut.sepX * 0.45;
      const dyDetour = ty + boidsOut.sepY * 0.45;
      const dLen = Math.hypot(dxDetour, dyDetour) || 1;
      const detourSpeed = eSpeed * FLOCK_DETOUR_SPEED_MULT;
      targetVx = (dxDetour / dLen) * detourSpeed;
      targetVy = (dyDetour / dLen) * detourSpeed;
    } else {
      let steerX =
        seekOut.seekX * seekOut.wSeek +
        seekOut.flankX * seekOut.wFlank +
        boidsOut.sepX * wSep +
        boidsOut.cohX +
        boidsOut.alignX +
        avoidOut.avoidX +
        (e.steerBiasX ?? 0);
      let steerY =
        seekOut.seekY * seekOut.wSeek +
        seekOut.flankY * seekOut.wFlank +
        boidsOut.sepY * wSep +
        boidsOut.cohY +
        boidsOut.alignY +
        avoidOut.avoidY +
        (e.steerBiasY ?? 0);

      if (avoidOut.hasWallHit && avoidOut.wallT < 0.75) {
        const dotInward = steerX * avoidOut.wallNx + steerY * avoidOut.wallNy;
        if (dotInward < 0) {
          const cancel = Math.min(1, (0.75 - avoidOut.wallT) / 0.5);
          steerX -= avoidOut.wallNx * dotInward * cancel;
          steerY -= avoidOut.wallNy * dotInward * cancel;
        }
      }

      const steerLen = Math.hypot(steerX, steerY);
      if (steerLen > 1e-4) {
        // Inside ranged standoff deadzone (`wantsMove === false`), keep small separation/orbit proportional
        const speedScale = seekOut.wantsMove ? 1 : Math.min(1, steerLen);
        if (speedScale >= 0.02) {
          targetVx = (steerX / steerLen) * eSpeed * speedScale;
          targetVy = (steerY / steerLen) * eSpeed * speedScale;
        }
      }
    }

    flock.vx += (targetVx - flock.vx) * BANSUNG_FLOCK_CONSTS.VEL_BLEND;
    flock.vy += (targetVy - flock.vy) * BANSUNG_FLOCK_CONSTS.VEL_BLEND;
    applyKnockbackAndIntegrate(e, flock, eRadius, obsGrid, dt, mapW, mapH, margin, knockDecay);
  }

  const hardGrid =
    options?.enemyOnlyGrid && enemyGrid
      ? enemyGrid
      : ensureInternalGridSize(mapW, mapH);
  runHardSeparationPasses(enemies, hardGrid);
  clampAndSyncAnimation(enemies, obsGrid, dt, mapW, mapH, margin);
}
