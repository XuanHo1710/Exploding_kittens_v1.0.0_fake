/**
 * Authoritative 30Hz dodge-dash physics (0.28s ease-out burst, i-frames,
 * input buffer, substepped circle-vs-AABB wall slide) and active Q/RMB
 * gadgets (`stun_bomb`, `cluster_bomb`, `auto_turret`, `heal_drone`) for
 * Ban Sung Co-op (`bansung`, specs d20, d30).
 */
import {
  BANSUNG_BFLAG_ENERGY,
  BANSUNG_BFLAG_EXPLOSIVE,
  BANSUNG_DASH,
  BANSUNG_DMG_HEAL,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_DRONE_PULSE,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_BLAST_TURRET_EXPIRE,
  BANSUNG_FX_BLAST_TURRET_THUNDER,
  BANSUNG_GADGETS,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PROJECTILE_CONFIGS,
  BANSUNG_PROP_INDEX,
  BANSUNG_STATUS_DASH,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  FX_BLAST,
  FX_DMG,
  FX_IMPACT,
  FX_MUZZLE,
  FX_STATUS,
  computeDashStepDistance,
  getBansungHero,
  getGadgetSpec,
  quantizeAim,
  ticksToMs,
  type BansungGadgetDeployableState,
  type BansungGadgetHud,
  type BansungGadgetId,
  type BansungGadgetProjState,
  type BansungGadgetState,
  type BansungHeroDashSpec,
  type BansungHeroId,
  type BansungPlayerGadgetSlot,
  type GadgetFxType,
} from '../../../../shared/src';
import {
  BANSUNG_AFFINITY,
  applyBansungDamage,
  type BansungCombatTarget,
  type BansungDamageKind,
  type BansungDamageResult,
  type BansungDmgEvent,
} from './damage';
import {
  ActorGrid,
  LAYER_ENEMY,
  LAYER_PET,
  ObstacleGrid,
  hasLineOfSight,
  moveCircleWithSlide,
  queryAoeObstacles,
  queryAoeTargets,
  raycastObstacles,
  resolveObstacles,
  stepSweptBullet,
  type AoeObstacleTarget,
  type AoeTarget,
  type ArenaObstacle,
  type CircleBody,
  type SpatialActor,
  type SweepBulletResult,
  type SweptBulletInput,
} from './spatial';

// ============================================================================
// 1. Constants & Shared FX Codes
// ============================================================================

export const BANSUNG_GADGET_DT = 1 / BANSUNG_TICK_HZ;
export const BANSUNG_DASH_MIN_DIR_LEN = 0.1;

export const BANSUNG_BLAST_HE = BANSUNG_FX_BLAST_HE;
export const BANSUNG_BLAST_STUN = BANSUNG_FX_BLAST_STUN;
export const BANSUNG_BLAST_CLUSTER_SUB = BANSUNG_FX_BLAST_CLUSTER;
export const BANSUNG_BLAST_TURRET_THUNDER = BANSUNG_FX_BLAST_TURRET_THUNDER;
export const BANSUNG_BLAST_TURRET_EXPIRE = BANSUNG_FX_BLAST_TURRET_EXPIRE;
export const BANSUNG_BLAST_DRONE_PULSE = BANSUNG_FX_BLAST_DRONE_PULSE;

const GADGET_PROJ_KIND_STUN = 0 as const;
const GADGET_PROJ_KIND_CLUSTER = 1 as const;
const GADGET_PROJ_KIND_CLUSTER_SUB = 2 as const;

const DEPLOYABLE_KIND_TURRET = 0 as const;
const DEPLOYABLE_KIND_DRONE = 1 as const;

const TURRET_SPATIAL_ID_BASE = 100_000;
const INITIAL_DEPLOYABLE_ID = 2000;
const INITIAL_GADGET_PROJ_ID = 300_000;
const INITIAL_TURRET_SHOT_ID = 400_000;
const STUN_BOUNCE_Z_PEAK_PX = 12;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist2D(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

// ============================================================================
// 2. Dodge-Dash State Machine & Substepped Wall Slide (d20)
// ============================================================================

export interface HeroDashState {
  /** Remaining active dash burst duration (s, 0..0.28). */
  dashLeft: number;
  /** Remaining dash invulnerability duration (s). */
  invulnLeft: number;
  /** Remaining dash cooldown duration (s). */
  cdLeft: number;
  /** Queued pre-buffer window before cooldown ends (s, 0..0.10). */
  bufferLeft: number;
  /** Locked unit direction X for the active dash. */
  dirX: number;
  /** Locked unit direction Y for the active dash. */
  dirY: number;
  /** Wrapping uint8 dash sequence counter (0..255). */
  seq: number;
}

export interface HeroDashQueueGate {
  dead?: boolean;
  downed?: boolean;
  stunLeftS?: number;
  stunMs?: number;
  bufferS?: number;
}

export interface HeroDashStepInput {
  body: CircleBody;
  mx: number;
  my: number;
  aimRad: number;
  obsGrid: ObstacleGrid;
  dt?: number;
  dashDx?: number;
  dashDy?: number;
  dead?: boolean;
  downed?: boolean;
  stunLeftS?: number;
  stunMs?: number;
  heroId?: BansungHeroId;
  dashSpec?: Partial<BansungHeroDashSpec>;
  /** Cooldown multiplier from perks (e.g. Swift Boots, clamped >= 0.35). */
  dashCdMul?: number;
  /** Optional override for i-frame duration in seconds. */
  iframeS?: number;
  arenaMargin?: number;
  /** Optional player index + FX stream for emitting FX_STATUS on dash start. */
  playerIdx?: number;
  fx?: number[];
}

export interface HeroDashStepResult {
  active: boolean;
  justStarted: boolean;
  justEnded: boolean;
  invulnActive: boolean;
  interruptedAction: boolean;
  movedDist: number;
  leftoverDt: number;
}

/** Creates a fresh per-hero dash runtime state. */
export function createHeroDashState(): HeroDashState {
  return {
    dashLeft: 0,
    invulnLeft: 0,
    cdLeft: 0,
    bufferLeft: 0,
    dirX: 1,
    dirY: 0,
    seq: 0,
  };
}

function isHeroIncapacitated(gate: {
  dead?: boolean;
  downed?: boolean;
  stunLeftS?: number;
  stunMs?: number;
}): boolean {
  return Boolean(
    gate.dead ||
      gate.downed ||
      (gate.stunLeftS ?? 0) > 0 ||
      (gate.stunMs ?? 0) > 0,
  );
}

/** Buffers a dash press (`0.10s` pre-buffer) unless dead, downed, or stunned. */
export function queueHeroDash(dash: HeroDashState, gate: HeroDashQueueGate = {}): boolean {
  if (isHeroIncapacitated(gate)) {
    return false;
  }
  const buf = gate.bufferS ?? BANSUNG_DASH.BUFFER_S;
  dash.bufferLeft = Number.isFinite(buf) && buf > 0 ? buf : BANSUNG_DASH.BUFFER_S;
  return true;
}

/** Cancels an active dash and i-frames (e.g., on downed/death), preserving cooldown & seq. */
export function cancelHeroDash(dash: HeroDashState): void {
  dash.dashLeft = 0;
  dash.invulnLeft = 0;
  dash.bufferLeft = 0;
}

/** Returns true while the hero retains dash i-frames (skip mob separation & hits). */
export function isDashInvulnerable(dash: HeroDashState): boolean {
  return dash.invulnLeft > 0;
}

/** Returns true while the 0.28s dash burst is actively moving the hero. */
export function isDashing(dash: HeroDashState): boolean {
  return dash.dashLeft > 0;
}

/** Returns quantized `BANSUNG_PFLAG_DASHING | BANSUNG_PFLAG_INVULN` bits for `BansungFrame.p`. */
export function getHeroDashFlags(dash: HeroDashState): number {
  let flags = 0;
  if (dash.dashLeft > 0) flags |= BANSUNG_PFLAG_DASHING;
  if (dash.invulnLeft > 0) flags |= BANSUNG_PFLAG_INVULN;
  return flags;
}

/** Synchronizes dash i-frame milliseconds onto a `BansungCombatTarget`. */
export function syncDashToCombatTarget(
  dash: HeroDashState,
  target: Pick<BansungCombatTarget, 'dashIframesMs'>,
): void {
  target.dashIframesMs = dash.invulnLeft > 0 ? Math.max(1, Math.round(dash.invulnLeft * 1000)) : 0;
}

function resolveDashDirection(
  mx: number,
  my: number,
  aimRad: number,
  dashDx?: number,
  dashDy?: number,
): readonly [number, number] {
  if (Number.isFinite(dashDx) && Number.isFinite(dashDy)) {
    const dLen = Math.hypot(dashDx!, dashDy!);
    if (dLen > BANSUNG_DASH_MIN_DIR_LEN) {
      return [dashDx! / dLen, dashDy! / dLen];
    }
  }
  if (Number.isFinite(mx) && Number.isFinite(my)) {
    const mLen = Math.hypot(mx, my);
    if (mLen > BANSUNG_DASH_MIN_DIR_LEN) {
      return [mx / mLen, my / mLen];
    }
  }
  const safeAim = Number.isFinite(aimRad) ? aimRad : 0;
  return [Math.cos(safeAim), Math.sin(safeAim)];
}

/**
 * Advances a hero's 0.28s dodge-dash state machine by `dt` seconds:
 * - Ticks cooldown, evaluates `0.10s` pre-buffered triggers
 * - Integrates analytical ease-out velocity (`v(u) = 1.4 - 0.8u`, `140px`)
 * - Slides cleanly along AABB walls/pillars via `<= 11.5px` substeps (`spatial.ts`)
 * - Returns `leftoverDt` on the final dash tick so normal walk resumes seamlessly
 */
export function stepHeroDash(
  dash: HeroDashState,
  input: HeroDashStepInput,
): HeroDashStepResult {
  const dt = Number.isFinite(input.dt) && (input.dt ?? 0) > 0 ? input.dt! : BANSUNG_GADGET_DT;

  if (input.dead || input.downed) {
    cancelHeroDash(dash);
    dash.cdLeft = Math.max(0, dash.cdLeft - dt);
    return {
      active: false,
      justStarted: false,
      justEnded: false,
      invulnActive: false,
      interruptedAction: false,
      movedDist: 0,
      leftoverDt: dt,
    };
  }

  dash.cdLeft = Math.max(0, dash.cdLeft - dt);

  const heroBaseDash = input.heroId ? getBansungHero(input.heroId).dash : undefined;
  const durationS = input.dashSpec?.durationS ?? heroBaseDash?.durationS ?? BANSUNG_DASH.DURATION_S;
  const distancePx = input.dashSpec?.distancePx ?? heroBaseDash?.distancePx ?? BANSUNG_DASH.DISTANCE_PX;
  const iframeS =
    input.iframeS ??
    input.dashSpec?.iframeS ??
    heroBaseDash?.iframeS ??
    BANSUNG_DASH.IFRAME_S;
  const baseCdS = input.dashSpec?.cooldownS ?? heroBaseDash?.cooldownS ?? BANSUNG_DASH.COOLDOWN_S;
  const cdMul = Math.max(0.35, Number.isFinite(input.dashCdMul) ? input.dashCdMul! : 1);
  const cooldownS = baseCdS * cdMul;
  const maxSubstepPx =
    input.dashSpec?.maxSubstepPx ?? heroBaseDash?.maxSubstepPx ?? BANSUNG_DASH.MAX_SUBSTEP_PX;

  let justStarted = false;
  if (
    dash.bufferLeft > 0 &&
    dash.dashLeft <= 0 &&
    dash.cdLeft <= 0 &&
    !isHeroIncapacitated(input)
  ) {
    const [dx, dy] = resolveDashDirection(
      input.mx,
      input.my,
      input.aimRad,
      input.dashDx,
      input.dashDy,
    );
    dash.dirX = dx;
    dash.dirY = dy;
    dash.dashLeft = durationS;
    dash.invulnLeft = iframeS;
    dash.cdLeft = cooldownS;
    dash.bufferLeft = 0;
    dash.seq = (dash.seq + 1) & 255;
    justStarted = true;

    if (input.fx && input.playerIdx !== undefined) {
      input.fx.push(
        FX_STATUS,
        input.playerIdx,
        BANSUNG_STATUS_DASH,
        dash.seq,
        Math.round(input.body.x),
        Math.round(input.body.y),
      );
    }
  } else {
    dash.bufferLeft = Math.max(0, dash.bufferLeft - dt);
  }

  if (dash.dashLeft <= 0) {
    dash.invulnLeft = Math.max(0, dash.invulnLeft - dt);
    return {
      active: false,
      justStarted: false,
      justEnded: false,
      invulnActive: dash.invulnLeft > 0,
      interruptedAction: false,
      movedDist: 0,
      leftoverDt: dt,
    };
  }

  const startX = input.body.x;
  const startY = input.body.y;
  let stepDist: number;
  let dashLeftNext: number;
  let stepDt: number;
  if (durationS === BANSUNG_DASH.DURATION_S && distancePx === BANSUNG_DASH.DISTANCE_PX) {
    ({ stepDist, dashLeftNext, stepDt } = computeDashStepDistance(dash.dashLeft, dt));
  } else {
    // computeDashStepDistance's durationS parameter infers literal 0.28 from BANSUNG_DASH as const;
    // rescale custom hero/perk durations into [0, 0.28] and distancePx proportionally.
    const scaleT = BANSUNG_DASH.DURATION_S / Math.max(1e-6, durationS);
    const scaled = computeDashStepDistance(dash.dashLeft * scaleT, dt * scaleT);
    stepDist = scaled.stepDist * (distancePx / BANSUNG_DASH.DISTANCE_PX);
    dashLeftNext = scaled.dashLeftNext / scaleT;
    stepDt = scaled.stepDt / scaleT;
  }
  dash.dashLeft = dashLeftNext;
  dash.invulnLeft = Math.max(0, dash.invulnLeft - dt);

  if (stepDist > 0) {
    const totalDx = dash.dirX * stepDist;
    const totalDy = dash.dirY * stepDist;
    const subSteps = Math.max(1, Math.ceil(stepDist / Math.max(1, maxSubstepPx)));
    const subDx = totalDx / subSteps;
    const subDy = totalDy / subSteps;
    const margin = input.arenaMargin ?? 0;

    for (let i = 0; i < subSteps; i++) {
      moveCircleWithSlide(
        input.body,
        subDx,
        subDy,
        input.obsGrid,
        input.obsGrid.mapW,
        input.obsGrid.mapH,
        margin,
      );
    }
  }

  const movedDist = Math.hypot(input.body.x - startX, input.body.y - startY);
  const justEnded = dash.dashLeft <= 0;
  const leftoverDt = Math.max(0, dt - stepDt);

  return {
    active: dash.dashLeft > 0,
    justStarted,
    justEnded,
    invulnActive: dash.invulnLeft > 0,
    interruptedAction: justStarted,
    movedDist,
    leftoverDt,
  };
}

// ============================================================================
// 3. Gadget Runtime Schemas & Actor Adapters (d30)
// ============================================================================

export interface GadgetPlayerActor extends BansungCombatTarget {
  idx: number;
  x: number;
  y: number;
  radius: number;
  aimRad: number;
  energy: number;
  maxEnergy: number;
  stunTicks?: number;
  /** Energy cost multiplier from perks (default 1). */
  energyCostMult?: number;
  /** Blast radius multiplier from perks (default 1). */
  blastRadiusMult?: number;
  /** Outgoing damage multiplier from perks (default 1). */
  dmgMult?: number;
  /** Extra concurrent deployables permitted by perks (default 0). */
  extraDeployables?: number;
}

export interface GadgetEnemyActor extends BansungCombatTarget {
  numId: number;
  x: number;
  y: number;
  radius: number;
  kbResist?: number;
  stunMult?: number;
  knockVx?: number;
  knockVy?: number;
  accuracyDebuffTicks?: number;
  accuracyDebuffMult?: number;
}

export interface GadgetTurretShotState {
  id: number;
  ownerIdx: number;
  turretId: number;
  kind: 'turret_bolt' | 'turret_thunder';
  kindId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  distLeft: number;
  ttlTicks: number;
  damage: readonly [light: number, armored: number];
  knockback: number;
  isOvercharge: boolean;
  splashRadius: number;
  stunMs: number;
  dmgMult: number;
  blastRadiusMult: number;
}

export interface TurretSpawnShotRequest {
  ownerIdx: number;
  turretId: number;
  projKind: 'turret_bolt' | 'turret_thunder';
  kindId: number;
  x: number;
  y: number;
  aimRad: number;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  range: number;
  ttlTicks: number;
  damagePair: readonly [light: number, armored: number];
  knockback: number;
  isOvercharge: boolean;
  splashRadius: number;
  stunMs: number;
  dmgMult: number;
  blastRadiusMult: number;
}

export interface GadgetFxEvent {
  type: GadgetFxType;
  x: number;
  y: number;
  radius: number;
  ownerIdx: number;
  targetId?: number;
}

export type GadgetDamageSource =
  | 'stun_bomb'
  | 'cluster_bomb'
  | 'cluster_sub'
  | 'turret_bolt'
  | 'turret_thunder'
  | 'turret_expire';

export interface GadgetActivateContext {
  obsGrid: ObstacleGrid;
  rng?: () => number;
  arenaMargin?: number;
  fx?: number[];
  onEnergySpent?: (player: GadgetPlayerActor, cost: number) => void;
  onSfx?: (sfxId: string, x: number, y: number, ownerIdx: number) => void;
}

export interface GadgetStepContext {
  obsGrid: ObstacleGrid;
  actorGrid: ActorGrid;
  players: readonly GadgetPlayerActor[];
  getEnemyById?: (actorId: number) => GadgetEnemyActor | undefined;
  enemies?: readonly GadgetEnemyActor[];
  rng?: () => number;
  arenaMargin?: number;
  fx?: number[];
  fxEvents?: GadgetFxEvent[];
  popups?: BansungDmgEvent[];
  onDamage?: (
    target: GadgetEnemyActor | GadgetPlayerActor,
    result: BansungDamageResult,
    ownerIdx: number,
    source: GadgetDamageSource,
  ) => void;
  onStunInterrupt?: (
    enemy: GadgetEnemyActor,
    info: {
      stunAppliedMs: number;
      cancelCast: boolean;
      resetFuse: boolean;
      accuracyDebuffTicks: number;
      accuracyDebuffMult: number;
    },
  ) => void;
  onKnockback?: (enemy: GadgetEnemyActor, dvx: number, dvy: number) => void;
  onObstacleDamage?: (
    obstacle: ArenaObstacle,
    dmg: number,
    ownerIdx: number,
    source: GadgetDamageSource,
  ) => void;
  onEnergyGrant?: (player: GadgetPlayerActor, amount: number) => void;
  onSfx?: (sfxId: string, x: number, y: number, ownerIdx: number) => void;
  spawnTurretShot?: (shot: TurretSpawnShotRequest) => void;
}

export interface GadgetSlotTickOptions {
  /** Extra charges granted by perks (default 0). */
  extraCharges?: number;
  /** Cooldown multiplier from perks (default 1, clamped >= 0.35). */
  cdMult?: number;
}

export interface GadgetWorldState {
  tickNo: number;
  nextProjId: number;
  nextDeployableId: number;
  nextClusterGroupId: number;
  nextShotId: number;
  projectiles: BansungGadgetProjState[];
  deployables: BansungGadgetDeployableState[];
  turretShots: GadgetTurretShotState[];
  /** Internal `clusterGroupId -> Map<enemyNumId, hitCount>` multi-hit clamp. */
  clusterHitCounts: Map<number, Map<number, number>>;
  /** Internal `projId -> total bounce ticks` for Z-bounce rendering. */
  projBounceTotal: Map<number, number>;
  /** Internal `projId -> owner multipliers snapshot`. */
  projMods: Map<number, { dmgMult: number; blastRadiusMult: number }>;
  /** Internal `deployableId -> owner modifiers + drone tether target kind`. */
  deployableMeta: Map<
    number,
    {
      dmgMult: number;
      blastRadiusMult: number;
      tetherKind: 'none' | 'player' | 'turret';
      tetherKey: number;
    }
  >;
}

export interface DroneDownedSupport {
  tethered: boolean;
  bleedSlowMult: number;
  reviveSpeedBonus: number;
  droneId: number;
}

// Module-scoped zero-GC scratch buffers for 30Hz queries
const tmpObsList: ArenaObstacle[] = [];
const tmpContactActors: SpatialActor[] = [];
const tmpAoeTargets: AoeTarget[] = [];
const tmpAoeObstacles: AoeObstacleTarget[] = [];
const tmpSweepRes: SweepBulletResult = {
  endX: 0,
  endY: 0,
  stopped: false,
  stoppedBy: 'none',
  actorHits: [],
  obstacleHits: [],
  bouncesUsed: 0,
};
const tmpBulletInput: SweptBulletInput = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 4,
  team: 0,
  layerMask: LAYER_ENEMY,
  maxHits: 1,
  bouncesLeft: 0,
};

// ============================================================================
// 4. Slot & World Initialization / HUD Projections
// ============================================================================

/** Creates a player's Q/RMB gadget slot initialized at full charges. */
export function createPlayerGadgetSlot(id: BansungGadgetId = 'stun_bomb'): BansungPlayerGadgetSlot {
  const spec = getGadgetSpec(id);
  return {
    id: spec.id,
    charges: spec.maxCharges,
    cdTicksLeft: 0,
  };
}

/** Creates an empty authoritative 30Hz gadget & deployable simulation state. */
export function createGadgetWorldState(): GadgetWorldState {
  return {
    tickNo: 0,
    nextProjId: INITIAL_GADGET_PROJ_ID,
    nextDeployableId: INITIAL_DEPLOYABLE_ID,
    nextClusterGroupId: 1,
    nextShotId: INITIAL_TURRET_SHOT_ID,
    projectiles: [],
    deployables: [],
    turretShots: [],
    clusterHitCounts: new Map(),
    projBounceTotal: new Map(),
    projMods: new Map(),
    deployableMeta: new Map(),
  };
}

/** Advances a player gadget slot's charge recharge timer by 1 server tick (30Hz). */
export function tickGadgetSlot(
  slot: BansungPlayerGadgetSlot,
  opts?: GadgetSlotTickOptions,
): void {
  const spec = getGadgetSpec(slot.id);
  const effMaxCharges = Math.max(1, spec.maxCharges + (opts?.extraCharges ?? 0));
  const cdMult = Math.max(0.35, Number.isFinite(opts?.cdMult) ? opts!.cdMult! : 1);
  const effCdTicks = Math.max(1, Math.round(spec.cooldownTicks * cdMult));

  if (slot.charges >= effMaxCharges) {
    slot.cdTicksLeft = 0;
    return;
  }

  if (slot.cdTicksLeft <= 0) {
    slot.cdTicksLeft = effCdTicks;
  }
  slot.cdTicksLeft -= 1;
  if (slot.cdTicksLeft <= 0) {
    slot.charges += 1;
    slot.cdTicksLeft = slot.charges < effMaxCharges ? effCdTicks : 0;
  }
}

/** Counts active thrown projectiles or deployables owned by `ownerIdx` for `gadgetId`. */
export function countActiveOwnerGadgets(
  state: GadgetWorldState,
  ownerIdx: number,
  gadgetId: BansungGadgetId,
): number {
  let count = 0;
  if (gadgetId === 'auto_turret' || gadgetId === 'heal_drone') {
    const depKind = gadgetId === 'auto_turret' ? DEPLOYABLE_KIND_TURRET : DEPLOYABLE_KIND_DRONE;
    for (let i = 0; i < state.deployables.length; i++) {
      const d = state.deployables[i];
      if (d.ownerIdx === ownerIdx && d.kind === depKind && d.hp > 0 && d.lifeTicks > 0) {
        count++;
      }
    }
    return count;
  }

  const projKind = gadgetId === 'stun_bomb' ? GADGET_PROJ_KIND_STUN : GADGET_PROJ_KIND_CLUSTER;
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    if (p.ownerIdx === ownerIdx && (p.kind === projKind || (gadgetId === 'cluster_bomb' && p.kind === GADGET_PROJ_KIND_CLUSTER_SUB))) {
      count++;
    }
  }
  return count;
}

/** Converts a slot into `BansungGadgetState` for `BansungFrame.me.gadget`. */
export function toBansungGadgetState(
  slot: BansungPlayerGadgetSlot,
  opts?: GadgetSlotTickOptions,
): BansungGadgetState {
  const spec = getGadgetSpec(slot.id);
  const cdMult = Math.max(0.35, Number.isFinite(opts?.cdMult) ? opts!.cdMult! : 1);
  const effCdTicks = Math.max(1, Math.round(spec.cooldownTicks * cdMult));
  return {
    id: slot.id,
    cdMs: ticksToMs(slot.cdTicksLeft),
    cdMaxMs: ticksToMs(effCdTicks),
    charges: slot.charges,
  };
}

/** Converts a slot + world active count into detailed `BansungGadgetHud`. */
export function buildGadgetHud(
  state: GadgetWorldState,
  ownerIdx: number,
  slot: BansungPlayerGadgetSlot,
  opts?: GadgetSlotTickOptions,
): BansungGadgetHud {
  const spec = getGadgetSpec(slot.id);
  const effMaxCharges = Math.max(1, spec.maxCharges + (opts?.extraCharges ?? 0));
  const cdMult = Math.max(0.35, Number.isFinite(opts?.cdMult) ? opts!.cdMult! : 1);
  const effCdTicks = Math.max(1, Math.round(spec.cooldownTicks * cdMult));
  return {
    id: slot.id,
    charges: slot.charges,
    maxCharges: effMaxCharges,
    cdLeftMs: ticksToMs(slot.cdTicksLeft),
    cdTotalMs: ticksToMs(effCdTicks),
    active: countActiveOwnerGadgets(state, ownerIdx, slot.id),
  };
}

// ============================================================================
// 5. Aim Clamping, Wall Pullback & Gadget Activation
// ============================================================================

function isPointBlockedByMove(
  obsGrid: ObstacleGrid,
  x: number,
  y: number,
  radius: number,
): boolean {
  obsGrid.queryCircle(x, y, radius, tmpObsList, 'move');
  return tmpObsList.length > 0;
}

function pullPointOutOfWalls(
  obsGrid: ObstacleGrid,
  sx: number,
  sy: number,
  rawTx: number,
  rawTy: number,
  bodyRadius: number,
  arenaMargin: number,
  raycastPath: boolean,
): readonly [number, number] {
  const pad = Math.max(1, bodyRadius);
  const minX = arenaMargin + pad;
  const maxX = Math.max(minX, obsGrid.mapW - arenaMargin - pad);
  const minY = arenaMargin + pad;
  const maxY = Math.max(minY, obsGrid.mapH - arenaMargin - pad);

  let tx = clamp(rawTx, minX, maxX);
  let ty = clamp(rawTy, minY, maxY);

  if (raycastPath) {
    const hit = raycastObstacles(obsGrid, sx, sy, tx, ty, pad, 'move');
    if (hit) {
      tx = hit.x + hit.nx * 2;
      ty = hit.y + hit.ny * 2;
    }
  }

  // 4-step binary pullback from player -> target when landing coords lie inside solid walls
  if (isPointBlockedByMove(obsGrid, tx, ty, pad)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 4; i++) {
      const mid = (lo + hi) * 0.5;
      const mx = sx + (tx - sx) * mid;
      const my = sy + (ty - sy) * mid;
      if (isPointBlockedByMove(obsGrid, mx, my, pad)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    tx = sx + (tx - sx) * lo;
    ty = sy + (ty - sy) * lo;
  }

  const body: CircleBody = { x: tx, y: ty, radius: pad };
  resolveObstacles(body, obsGrid, obsGrid.mapW, obsGrid.mapH, arenaMargin);
  return [body.x, body.y];
}

function removeOldestDeployable(
  state: GadgetWorldState,
  ownerIdx: number,
  depKind: 0 | 1,
): void {
  for (let i = 0; i < state.deployables.length; i++) {
    const d = state.deployables[i];
    if (d.ownerIdx === ownerIdx && d.kind === depKind) {
      state.deployableMeta.delete(d.id);
      state.deployables.splice(i, 1);
      return;
    }
  }
}

function removeOldestOwnerProj(
  state: GadgetWorldState,
  ownerIdx: number,
  projKind: 0 | 1,
): void {
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    if (p.ownerIdx === ownerIdx && p.kind === projKind) {
      state.projBounceTotal.delete(p.id);
      state.projMods.delete(p.id);
      state.projectiles.splice(i, 1);
      return;
    }
  }
}

/**
 * Validates and activates the player's equipped Q/RMB gadget (`stun_bomb`,
 * `cluster_bomb`, `auto_turret`, `heal_drone`) against 30Hz constraints.
 */
export function activateGadget(
  state: GadgetWorldState,
  player: GadgetPlayerActor,
  slot: BansungPlayerGadgetSlot,
  targetX: number | undefined,
  targetY: number | undefined,
  ctx: GadgetActivateContext,
  slotOpts?: GadgetSlotTickOptions,
): boolean {
  if (!player.alive || player.downed || player.hp <= 0) return false;
  if ((player.stunTicks ?? 0) > 0 || (player.stunMs ?? 0) > 0) return false;
  if (slot.charges < 1) return false;

  const spec = getGadgetSpec(slot.id);
  const costMult = Math.max(0.4, Number.isFinite(player.energyCostMult) ? player.energyCostMult! : 1);
  const effEnergyCost = Math.max(0, Math.ceil(spec.energyCost * costMult));
  if (player.energy < effEnergyCost) return false;

  const cdMult = Math.max(0.35, Number.isFinite(slotOpts?.cdMult) ? slotOpts!.cdMult! : 1);
  const effCdTicks = Math.max(1, Math.round(spec.cooldownTicks * cdMult));
  const safeAim = Number.isFinite(player.aimRad) ? player.aimRad : 0;
  const aimUx = Math.cos(safeAim);
  const aimUy = Math.sin(safeAim);

  let rawDist: number;
  let dirX = aimUx;
  let dirY = aimUy;

  if (targetX !== undefined && targetY !== undefined && Number.isFinite(targetX) && Number.isFinite(targetY)) {
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    rawDist = Math.hypot(dx, dy);
    if (rawDist > 1e-4) {
      dirX = dx / rawDist;
      dirY = dy / rawDist;
    }
  } else if (spec.id === 'auto_turret' && spec.turret) {
    rawDist = spec.turret.deployOffsetPx;
  } else if (spec.id === 'heal_drone' && spec.drone) {
    rawDist = spec.drone.followBehindPx;
    dirX = -aimUx;
    dirY = -aimUy;
  } else {
    rawDist = spec.maxRange * 0.75;
  }

  const clampedDist = clamp(rawDist, spec.minRange, spec.maxRange);
  const rawTx = player.x + dirX * clampedDist;
  const rawTy = player.y + dirY * clampedDist;

  player.energy -= effEnergyCost;
  ctx.onEnergySpent?.(player, effEnergyCost);
  slot.charges -= 1;
  if (slot.cdTicksLeft <= 0) {
    slot.cdTicksLeft = effCdTicks;
  }

  const dmgMult = Number.isFinite(player.dmgMult) ? Math.max(0.1, player.dmgMult!) : 1;
  const blastRadiusMult = Number.isFinite(player.blastRadiusMult)
    ? Math.max(0.5, player.blastRadiusMult!)
    : 1;
  const arenaMargin = ctx.arenaMargin ?? 0;

  if (spec.kind === 'thrown') {
    const projKind =
      spec.id === 'stun_bomb' ? GADGET_PROJ_KIND_STUN : GADGET_PROJ_KIND_CLUSTER;
    const activeThrown = countActiveOwnerGadgets(state, player.idx, spec.id);
    if (activeThrown >= spec.maxActive) {
      removeOldestOwnerProj(state, player.idx, projKind);
    }

    const [tx, ty] = pullPointOutOfWalls(
      ctx.obsGrid,
      player.x,
      player.y,
      rawTx,
      rawTy,
      8,
      arenaMargin,
      false,
    );
    const flightDist = dist2D(player.x, player.y, tx, ty);
    const throwSpeed = Math.max(1, spec.throwSpeed ?? 420);
    const minF = spec.minFlightTicks ?? 10;
    const maxF = spec.maxFlightTicks ?? 24;
    const flightTicks = clamp(Math.round((flightDist / throwSpeed) * BANSUNG_TICK_HZ), minF, maxF);
    const fuseTicks = spec.id === 'stun_bomb' ? (spec.bounceTicks ?? 4) : (spec.fuseTicks ?? 6);
    const id = state.nextProjId++;

    state.projectiles.push({
      id,
      ownerIdx: player.idx,
      kind: projKind,
      clusterGroupId: 0,
      sx: player.x,
      sy: player.y,
      tx,
      ty,
      x: player.x,
      y: player.y,
      z: 0,
      tick: 0,
      flightTicks,
      fuseTicks,
      peakZ: spec.peakZ ?? 56,
    });
    if (spec.id === 'stun_bomb' && fuseTicks > 0) {
      state.projBounceTotal.set(id, fuseTicks);
    }
    state.projMods.set(id, { dmgMult, blastRadiusMult });
    ctx.onSfx?.(spec.sfxDeploy, player.x, player.y, player.idx);
    return true;
  }

  // Deployables: auto_turret | heal_drone
  const depKind =
    spec.id === 'auto_turret' ? DEPLOYABLE_KIND_TURRET : DEPLOYABLE_KIND_DRONE;
  const maxActive = spec.maxActive + (player.extraDeployables ?? 0);
  while (countActiveOwnerGadgets(state, player.idx, spec.id) >= maxActive) {
    removeOldestDeployable(state, player.idx, depKind);
  }

  const depId = state.nextDeployableId++;
  if (spec.id === 'auto_turret' && spec.turret) {
    const [tx, ty] = pullPointOutOfWalls(
      ctx.obsGrid,
      player.x,
      player.y,
      rawTx,
      rawTy,
      spec.turret.bodyRadius,
      arenaMargin,
      true,
    );
    const lifeTicks = spec.durationTicks ?? 540;
    state.deployables.push({
      id: depId,
      ownerIdx: player.idx,
      kind: DEPLOYABLE_KIND_TURRET,
      x: tx,
      y: ty,
      z: 0,
      hp: spec.turret.hp,
      maxHp: spec.turret.hp,
      lifeTicks,
      maxLifeTicks: lifeTicks,
      aimRad: safeAim,
      actionCdTicks: 0,
      shotSeq: 0,
      targetId: -1,
      pulseTicks: 0,
    });
    state.deployableMeta.set(depId, {
      dmgMult,
      blastRadiusMult,
      tetherKind: 'none',
      tetherKey: -1,
    });
    ctx.onSfx?.(spec.sfxDeploy, tx, ty, player.idx);
    return true;
  }

  if (spec.id === 'heal_drone' && spec.drone) {
    const [tx, ty] = pullPointOutOfWalls(
      ctx.obsGrid,
      player.x,
      player.y,
      rawTx,
      rawTy,
      10,
      arenaMargin,
      false,
    );
    const lifeTicks = spec.durationTicks ?? 420;
    state.deployables.push({
      id: depId,
      ownerIdx: player.idx,
      kind: DEPLOYABLE_KIND_DRONE,
      x: tx,
      y: ty,
      z: spec.drone.hoverZ,
      hp: 100,
      maxHp: 100,
      lifeTicks,
      maxLifeTicks: lifeTicks,
      aimRad: safeAim,
      actionCdTicks: spec.drone.healIntervalTicks,
      shotSeq: 0,
      targetId: -1,
      pulseTicks: 0,
    });
    state.deployableMeta.set(depId, {
      dmgMult,
      blastRadiusMult,
      tetherKind: 'none',
      tetherKey: -1,
    });
    ctx.onSfx?.(spec.sfxDeploy, tx, ty, player.idx);
    return true;
  }

  return false;
}

// ============================================================================
// 6. Blast Falloff, Damage Affinity & AoE Helpers
// ============================================================================

/** Computes linear distance falloff from `coreR` (1.0) to `blastR` (`minFalloff`). */
export function computeGadgetBlastFalloff(
  edgeDist: number,
  coreR: number,
  blastR: number,
  minFalloff: number,
): number {
  if (edgeDist <= coreR) return 1;
  if (edgeDist >= blastR) return 0;
  const span = Math.max(1, blastR - coreR);
  const t = (edgeDist - coreR) / span;
  return Math.max(minFalloff, 1 - t * (1 - minFalloff));
}

function buildEnemyResolver(ctx: GadgetStepContext): (id: number) => GadgetEnemyActor | undefined {
  if (ctx.getEnemyById) return ctx.getEnemyById;
  const list = ctx.enemies;
  if (!list || list.length === 0) return () => undefined;
  const map = new Map<number, GadgetEnemyActor>();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    map.set(e.numId, e);
  }
  return (id: number) => map.get(id);
}

function findPlayerByIdx(
  players: readonly GadgetPlayerActor[],
  idx: number,
): GadgetPlayerActor | undefined {
  for (let i = 0; i < players.length; i++) {
    if (players[i].idx === idx) return players[i];
  }
  return undefined;
}

function applyEnemyKnockback(
  enemy: GadgetEnemyActor,
  cx: number,
  cy: number,
  speed: number,
  falloff: number,
  ctx: GadgetStepContext,
): void {
  if (speed <= 0 || !enemy.alive || enemy.hp <= 0) return;
  const dx = enemy.x - cx;
  const dy = enemy.y - cy;
  const len = Math.hypot(dx, dy);
  const nx = len > 1e-4 ? dx / len : 1;
  const ny = len > 1e-4 ? dy / len : 0;
  const resist = clamp(enemy.kbResist ?? (enemy.tier === 'boss' ? 1 : 0), 0, 1);
  const mag = speed * falloff * (1 - resist);
  if (mag <= 0) return;
  const dvx = nx * mag;
  const dvy = ny * mag;
  if (ctx.onKnockback) {
    ctx.onKnockback(enemy, dvx, dvy);
  } else if (enemy.knockVx !== undefined && enemy.knockVy !== undefined) {
    enemy.knockVx += dvx;
    enemy.knockVy += dvy;
  }
}

function applyPairDamageToEnemy(
  enemy: GadgetEnemyActor,
  damagePair: readonly [number, number],
  dmgKind: BansungDamageKind,
  dmgScale: number,
  stunMs: number,
  ownerIdx: number,
  source: GadgetDamageSource,
  ctx: GadgetStepContext,
): BansungDamageResult {
  const [lightDmg, armoredDmg] = damagePair;
  const baseDmg = Math.max(0, Math.round(lightDmg * dmgScale));
  const affinity: readonly [number, number] =
    lightDmg > 0 ? [1, armoredDmg / lightDmg] : [0, 0];

  const result = applyBansungDamage(
    enemy,
    {
      baseDmg,
      dmgKind,
      affinity,
      stunMs: stunMs > 0 ? stunMs : undefined,
      attackerId: `p:${ownerIdx}`,
    },
    {
      rng: ctx.rng,
      popups: ctx.popups,
      fx: ctx.fx,
    },
  );
  ctx.onDamage?.(enemy, result, ownerIdx, source);
  return result;
}

function damageObstaclesInBlast(
  ctx: GadgetStepContext,
  cx: number,
  cy: number,
  blastR: number,
  coreR: number,
  minFalloff: number,
  baseDmg: number,
  ownerIdx: number,
  source: GadgetDamageSource,
): void {
  queryAoeObstacles(ctx.obsGrid, cx, cy, blastR, 'los', tmpAoeObstacles);
  for (let i = 0; i < tmpAoeObstacles.length; i++) {
    const hit = tmpAoeObstacles[i];
    const falloff = computeGadgetBlastFalloff(hit.edgeDist, coreR, blastR, minFalloff);
    const dmg = Math.max(1, Math.round(baseDmg * falloff));
    if (ctx.onObstacleDamage) {
      ctx.onObstacleDamage(hit.obstacle, dmg, ownerIdx, source);
    } else {
      hit.obstacle.hp -= dmg;
      if (hit.obstacle.hp <= 0) {
        hit.obstacle.hp = 0;
        ctx.obsGrid.setAlive(hit.obstacle.id, false);
      }
    }
  }
}

function applySingleObstacleDamage(
  ctx: GadgetStepContext,
  obstacle: ArenaObstacle,
  dmg: number,
  ownerIdx: number,
  source: GadgetDamageSource,
): void {
  if (!obstacle.alive || !obstacle.destructible || dmg <= 0) return;
  if (ctx.onObstacleDamage) {
    ctx.onObstacleDamage(obstacle, dmg, ownerIdx, source);
  } else {
    obstacle.hp -= dmg;
    if (obstacle.hp <= 0) {
      obstacle.hp = 0;
      ctx.obsGrid.setAlive(obstacle.id, false);
    }
  }
}

// ============================================================================
// 7. Thrown Bomb Detonation & Parabolic Z-Arc Stepping
// ============================================================================

function detonateStunBomb(
  proj: BansungGadgetProjState,
  mods: { dmgMult: number; blastRadiusMult: number },
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const spec = BANSUNG_GADGETS.stun_bomb;
  const projCfg = BANSUNG_PROJECTILE_CONFIGS.stun_bomb_proj;
  const blastR = Math.round(spec.radius * mods.blastRadiusMult);
  const coreR = projCfg.coreRadius;
  const minFalloff = projCfg.outerFalloffMin;
  const debuffTicks = spec.accuracyDebuffTicks ?? 45;
  const debuffMult = spec.accuracyDebuffMult ?? 0.65;

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, proj.x, proj.y, blastR, 'los', LAYER_ENEMY, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const aoe = tmpAoeTargets[i];
    const enemy = resolveEnemy(aoe.actor.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;

    const tierStunTicks =
      enemy.tier === 'boss'
        ? (spec.bossStunTicks ?? 24)
        : enemy.tier === 'elite'
          ? (spec.eliteStunTicks ?? 42)
          : (spec.stunTicks ?? 66);
    const rawStunMs = Math.max(
      0,
      Math.round(tierStunTicks * BANSUNG_TICK_EXACT_MS * (enemy.stunMult ?? 1)),
    );
    const falloff = computeGadgetBlastFalloff(aoe.edgeDist, coreR, blastR, minFalloff);
    const res = applyPairDamageToEnemy(
      enemy,
      spec.damage,
      'energy',
      falloff * mods.dmgMult,
      rawStunMs,
      proj.ownerIdx,
      'stun_bomb',
      ctx,
    );

    if (!res.killed && enemy.alive) {
      enemy.accuracyDebuffTicks = Math.max(enemy.accuracyDebuffTicks ?? 0, debuffTicks);
      enemy.accuracyDebuffMult = debuffMult;
      if (res.stunAppliedMs > 0) {
        ctx.onStunInterrupt?.(enemy, {
          stunAppliedMs: res.stunAppliedMs,
          cancelCast: true,
          resetFuse: true,
          accuracyDebuffTicks: debuffTicks,
          accuracyDebuffMult: debuffMult,
        });
      }
    }
    applyEnemyKnockback(enemy, proj.x, proj.y, spec.knockback, falloff, ctx);
  }

  damageObstaclesInBlast(
    ctx,
    proj.x,
    proj.y,
    blastR,
    coreR,
    minFalloff,
    Math.round(spec.damage[0] * mods.dmgMult),
    proj.ownerIdx,
    'stun_bomb',
  );

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_STUN,
    Math.round(proj.x),
    Math.round(proj.y),
    blastR,
    proj.ownerIdx,
  );
  ctx.fxEvents?.push({
    type: 'stun_blast',
    x: Math.round(proj.x),
    y: Math.round(proj.y),
    radius: blastR,
    ownerIdx: proj.ownerIdx,
  });
  ctx.onSfx?.(spec.sfxTrigger, proj.x, proj.y, proj.ownerIdx);
}

function detonateClusterPrimary(
  state: GadgetWorldState,
  proj: BansungGadgetProjState,
  mods: { dmgMult: number; blastRadiusMult: number },
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const spec = BANSUNG_GADGETS.cluster_bomb;
  const projCfg = BANSUNG_PROJECTILE_CONFIGS.cluster_bomb_proj;
  const blastR = Math.round(spec.radius * mods.blastRadiusMult);
  const coreR = projCfg.coreRadius;
  const minFalloff = projCfg.outerFalloffMin;

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, proj.x, proj.y, blastR, 'los', LAYER_ENEMY, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const aoe = tmpAoeTargets[i];
    const enemy = resolveEnemy(aoe.actor.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;

    const falloff = computeGadgetBlastFalloff(aoe.edgeDist, coreR, blastR, minFalloff);
    applyPairDamageToEnemy(
      enemy,
      spec.damage,
      'explosive',
      falloff * mods.dmgMult,
      0,
      proj.ownerIdx,
      'cluster_bomb',
      ctx,
    );
    applyEnemyKnockback(enemy, proj.x, proj.y, spec.knockback, falloff, ctx);
  }

  damageObstaclesInBlast(
    ctx,
    proj.x,
    proj.y,
    blastR,
    coreR,
    minFalloff,
    Math.round(spec.damage[1] * mods.dmgMult),
    proj.ownerIdx,
    'cluster_bomb',
  );

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_CLUSTER_SUB,
    Math.round(proj.x),
    Math.round(proj.y),
    blastR,
    proj.ownerIdx,
  );
  ctx.fxEvents?.push({
    type: 'cluster_blast',
    x: Math.round(proj.x),
    y: Math.round(proj.y),
    radius: blastR,
    ownerIdx: proj.ownerIdx,
  });
  ctx.onSfx?.(spec.sfxTrigger, proj.x, proj.y, proj.ownerIdx);

  // Spawn 5 sub-bomblets in a jittered 360-degree ring
  const cluster = spec.cluster;
  if (!cluster || cluster.count <= 0) return;

  const rng = ctx.rng ?? Math.random;
  const groupId = state.nextClusterGroupId++;
  state.clusterHitCounts.set(groupId, new Map());

  const theta0 = rng() * Math.PI * 2;
  const stepAng = (Math.PI * 2) / cluster.count;
  const arenaMargin = ctx.arenaMargin ?? 0;

  for (let i = 0; i < cluster.count; i++) {
    const angle = theta0 + i * stepAng + (rng() * 0.44 - 0.22);
    const subDist = lerp(cluster.minDist, cluster.maxDist, rng());
    const rawTx = proj.x + Math.cos(angle) * subDist;
    const rawTy = proj.y + Math.sin(angle) * subDist;
    const [tx, ty] = pullPointOutOfWalls(
      ctx.obsGrid,
      proj.x,
      proj.y,
      rawTx,
      rawTy,
      6,
      arenaMargin,
      false,
    );
    const flightTicks = Math.max(
      1,
      Math.round(lerp(cluster.minFlightTicks, cluster.maxFlightTicks, rng())),
    );
    const fuseTicks = Math.floor(rng() * (cluster.maxFuseJitterTicks + 1));
    const subId = state.nextProjId++;

    state.projectiles.push({
      id: subId,
      ownerIdx: proj.ownerIdx,
      kind: GADGET_PROJ_KIND_CLUSTER_SUB,
      clusterGroupId: groupId,
      sx: proj.x,
      sy: proj.y,
      tx,
      ty,
      x: proj.x,
      y: proj.y,
      z: 0,
      tick: 0,
      flightTicks,
      fuseTicks,
      peakZ: cluster.peakZ,
    });
    state.projMods.set(subId, { ...mods });
  }
}

function detonateClusterSub(
  state: GadgetWorldState,
  proj: BansungGadgetProjState,
  mods: { dmgMult: number; blastRadiusMult: number },
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const spec = BANSUNG_GADGETS.cluster_bomb;
  const cluster = spec.cluster;
  if (!cluster) return;
  const projCfg = BANSUNG_PROJECTILE_CONFIGS.cluster_sub_proj;
  const blastR = Math.round(cluster.radius * mods.blastRadiusMult);
  const coreR = projCfg.coreRadius;
  const minFalloff = projCfg.outerFalloffMin;

  let groupMap = state.clusterHitCounts.get(proj.clusterGroupId);
  if (!groupMap) {
    groupMap = new Map();
    state.clusterHitCounts.set(proj.clusterGroupId, groupMap);
  }

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, proj.x, proj.y, blastR, 'los', LAYER_ENEMY, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const aoe = tmpAoeTargets[i];
    const enemy = resolveEnemy(aoe.actor.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;

    const prevHits = groupMap.get(enemy.numId) ?? 0;
    if (prevHits >= cluster.maxHitsPerTarget) continue;
    groupMap.set(enemy.numId, prevHits + 1);

    const clampMult = cluster.multiHitClamp[prevHits] ?? 0.5;
    const falloff = computeGadgetBlastFalloff(aoe.edgeDist, coreR, blastR, minFalloff);

    applyPairDamageToEnemy(
      enemy,
      cluster.damage,
      'explosive',
      falloff * clampMult * mods.dmgMult,
      0,
      proj.ownerIdx,
      'cluster_sub',
      ctx,
    );
    applyEnemyKnockback(enemy, proj.x, proj.y, cluster.knockback, falloff * clampMult, ctx);
  }

  damageObstaclesInBlast(
    ctx,
    proj.x,
    proj.y,
    blastR,
    coreR,
    minFalloff,
    Math.round(cluster.damage[1] * mods.dmgMult),
    proj.ownerIdx,
    'cluster_sub',
  );

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_CLUSTER_SUB,
    Math.round(proj.x),
    Math.round(proj.y),
    blastR,
    proj.ownerIdx,
  );
  ctx.fxEvents?.push({
    type: 'cluster_blast',
    x: Math.round(proj.x),
    y: Math.round(proj.y),
    radius: blastR,
    ownerIdx: proj.ownerIdx,
  });
  ctx.onSfx?.(spec.sfxTrigger, proj.x, proj.y, proj.ownerIdx);
}

function stepGadgetProjectiles(
  state: GadgetWorldState,
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const activeGroups = new Set<number>();

  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    if (p.tick < p.flightTicks) {
      p.tick += 1;
      const u = Math.min(1, p.tick / Math.max(1, p.flightTicks));
      p.x = p.sx + (p.tx - p.sx) * u;
      p.y = p.sy + (p.ty - p.sy) * u;
      p.z = Math.round(4 * p.peakZ * u * (1 - u));

      // Stun bomb detonates immediately on direct contact with Elite/Boss
      if (p.kind === GADGET_PROJ_KIND_STUN && p.tick >= 2) {
        ctx.actorGrid.queryCircle(p.x, p.y, 14, LAYER_ENEMY, tmpContactActors);
        let directHeavy = false;
        for (let k = 0; k < tmpContactActors.length; k++) {
          const enemy = resolveEnemy(tmpContactActors[k].id);
          if (enemy && enemy.alive && (enemy.tier === 'elite' || enemy.tier === 'boss')) {
            directHeavy = true;
            break;
          }
        }
        if (directHeavy) {
          p.tick = p.flightTicks;
          p.fuseTicks = 0;
          p.z = 0;
        }
      }
    } else if (p.fuseTicks > 0) {
      p.fuseTicks -= 1;
      if (p.kind === GADGET_PROJ_KIND_STUN) {
        const bounceTotal = Math.max(1, state.projBounceTotal.get(p.id) ?? 4);
        const bu = 1 - p.fuseTicks / bounceTotal;
        p.z = Math.round(4 * STUN_BOUNCE_Z_PEAK_PX * bu * (1 - bu));
      } else {
        p.z = 0;
      }
    }

    if (p.tick >= p.flightTicks && p.fuseTicks <= 0) {
      const mods = state.projMods.get(p.id) ?? { dmgMult: 1, blastRadiusMult: 1 };
      state.projBounceTotal.delete(p.id);
      state.projMods.delete(p.id);
      state.projectiles.splice(i, 1);

      if (p.kind === GADGET_PROJ_KIND_STUN) {
        detonateStunBomb(p, mods, ctx, resolveEnemy);
      } else if (p.kind === GADGET_PROJ_KIND_CLUSTER) {
        detonateClusterPrimary(state, p, mods, ctx, resolveEnemy);
      } else {
        detonateClusterSub(state, p, mods, ctx, resolveEnemy);
      }
    }
  }

  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    if (p.clusterGroupId > 0) {
      activeGroups.add(p.clusterGroupId);
    }
  }
  for (const gid of state.clusterHitCounts.keys()) {
    if (!activeGroups.has(gid)) {
      state.clusterHitCounts.delete(gid);
    }
  }
}

// ============================================================================
// 8. Auto-Turret & Healing Drone Deployables (30Hz)
// ============================================================================

function detonateTurretExpiry(
  dep: BansungGadgetDeployableState,
  mods: { dmgMult: number; blastRadiusMult: number },
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const turretCfg = BANSUNG_GADGETS.auto_turret.turret;
  if (!turretCfg) return;
  const blastR = Math.round(turretCfg.expiryBlastRadius * mods.blastRadiusMult);
  const coreR = Math.round(blastR * 0.35);

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, dep.x, dep.y, blastR, 'los', LAYER_ENEMY, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const aoe = tmpAoeTargets[i];
    const enemy = resolveEnemy(aoe.actor.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;

    const falloff = computeGadgetBlastFalloff(aoe.edgeDist, coreR, blastR, 0.45);
    applyPairDamageToEnemy(
      enemy,
      turretCfg.expiryBlastDamage,
      'explosive',
      falloff * mods.dmgMult,
      0,
      dep.ownerIdx,
      'turret_expire',
      ctx,
    );
    applyEnemyKnockback(enemy, dep.x, dep.y, 140, falloff, ctx);
  }

  damageObstaclesInBlast(
    ctx,
    dep.x,
    dep.y,
    blastR,
    coreR,
    0.45,
    Math.round(turretCfg.expiryBlastDamage[1] * mods.dmgMult),
    dep.ownerIdx,
    'turret_expire',
  );

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_TURRET_EXPIRE,
    Math.round(dep.x),
    Math.round(dep.y),
    blastR,
    dep.ownerIdx,
  );
  ctx.fxEvents?.push({
    type: 'cluster_blast',
    x: Math.round(dep.x),
    y: Math.round(dep.y),
    radius: blastR,
    ownerIdx: dep.ownerIdx,
  });
}

function selectTurretTarget(
  dep: BansungGadgetDeployableState,
  range: number,
  hysteresisPct: number,
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): GadgetEnemyActor | undefined {
  ctx.actorGrid.queryCircle(dep.x, dep.y, range, LAYER_ENEMY, tmpContactActors);

  let currentEnemy: GadgetEnemyActor | undefined;
  let currentDist = Infinity;
  let bestEnemy: GadgetEnemyActor | undefined;
  let bestDist = Infinity;

  for (let i = 0; i < tmpContactActors.length; i++) {
    const sa = tmpContactActors[i];
    const enemy = resolveEnemy(sa.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;

    const d = dist2D(dep.x, dep.y, enemy.x, enemy.y);
    if (d > range + enemy.radius) continue;
    if (!hasLineOfSight(ctx.obsGrid, dep.x, dep.y, enemy.x, enemy.y, 'los')) continue;

    if (enemy.numId === dep.targetId) {
      currentEnemy = enemy;
      currentDist = d;
    }
    if (d < bestDist || (d === bestDist && bestEnemy && enemy.numId < bestEnemy.numId)) {
      bestDist = d;
      bestEnemy = enemy;
    }
  }

  if (currentEnemy && bestEnemy && currentEnemy.numId !== bestEnemy.numId) {
    if (bestDist >= currentDist * (1 - hysteresisPct)) {
      return currentEnemy;
    }
  } else if (currentEnemy) {
    return currentEnemy;
  }

  return bestEnemy;
}

function stepAutoTurret(
  state: GadgetWorldState,
  dep: BansungGadgetDeployableState,
  mods: { dmgMult: number; blastRadiusMult: number },
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const spec = BANSUNG_GADGETS.auto_turret;
  const turretCfg = spec.turret;
  if (!turretCfg) return;

  if (dep.actionCdTicks > 0) {
    dep.actionCdTicks -= 1;
  }

  const target = selectTurretTarget(
    dep,
    spec.radius,
    turretCfg.hysteresisPct,
    ctx,
    resolveEnemy,
  );
  if (!target) {
    dep.targetId = -1;
    return;
  }

  dep.targetId = target.numId;
  dep.aimRad = Math.atan2(target.y - dep.y, target.x - dep.x);

  if (dep.actionCdTicks > 0) return;

  dep.actionCdTicks = turretCfg.fireIntervalTicks;
  dep.shotSeq += 1;

  const isOvercharge = dep.shotSeq % turretCfg.overchargeInterval === 0;
  const rng = ctx.rng ?? Math.random;
  const jitter = (rng() * 2 - 1) * turretCfg.spreadRad;
  const fireAim = dep.aimRad + jitter;
  const projKind = isOvercharge ? turretCfg.overchargeProjKind : turretCfg.projKind;
  const projCfg = BANSUNG_PROJECTILE_CONFIGS[projKind];
  const speed = projCfg.speed;
  const vx = Math.cos(fireAim) * speed;
  const vy = Math.sin(fireAim) * speed;
  const dmgPair = isOvercharge ? turretCfg.overchargeDamage : spec.damage;
  const stunMs = isOvercharge
    ? Math.round(turretCfg.overchargeStunTicks * BANSUNG_TICK_EXACT_MS)
    : 0;
  const splashRadius = isOvercharge ? turretCfg.overchargeSplashRadius : 0;
  const knockback = isOvercharge ? projCfg.knockback : spec.knockback;
  const ttlTicks = Math.max(1, Math.round(projCfg.ttlMs / BANSUNG_TICK_EXACT_MS));

  if (ctx.spawnTurretShot) {
    ctx.spawnTurretShot({
      ownerIdx: dep.ownerIdx,
      turretId: dep.id,
      projKind,
      kindId: projCfg.kindId,
      x: dep.x,
      y: dep.y,
      aimRad: fireAim,
      vx,
      vy,
      speed,
      radius: projCfg.radius,
      range: projCfg.range,
      ttlTicks,
      damagePair: dmgPair,
      knockback,
      isOvercharge,
      splashRadius,
      stunMs,
      dmgMult: mods.dmgMult,
      blastRadiusMult: mods.blastRadiusMult,
    });
  } else {
    state.turretShots.push({
      id: state.nextShotId++,
      ownerIdx: dep.ownerIdx,
      turretId: dep.id,
      kind: projKind,
      kindId: projCfg.kindId,
      x: dep.x,
      y: dep.y,
      vx,
      vy,
      radius: projCfg.radius,
      speed,
      distLeft: projCfg.range,
      ttlTicks,
      damage: dmgPair,
      knockback,
      isOvercharge,
      splashRadius,
      stunMs,
      dmgMult: mods.dmgMult,
      blastRadiusMult: mods.blastRadiusMult,
    });
  }

  ctx.fx?.push(
    FX_MUZZLE,
    dep.id,
    projCfg.kindId,
    Math.round(dep.x),
    Math.round(dep.y),
    quantizeAim(fireAim),
  );
  ctx.onSfx?.(
    isOvercharge ? (spec.sfxExtra ?? spec.sfxTrigger) : spec.sfxTrigger,
    dep.x,
    dep.y,
    dep.ownerIdx,
  );
}

function stepTurretShots(
  state: GadgetWorldState,
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  for (let i = state.turretShots.length - 1; i >= 0; i--) {
    const s = state.turretShots[i];
    if (s.ttlTicks <= 0 || s.distLeft <= 0) {
      state.turretShots.splice(i, 1);
      continue;
    }

    const stepDt = Math.min(BANSUNG_GADGET_DT, s.distLeft / Math.max(1, s.speed));
    tmpBulletInput.x = s.x;
    tmpBulletInput.y = s.y;
    tmpBulletInput.vx = s.vx;
    tmpBulletInput.vy = s.vy;
    tmpBulletInput.radius = s.radius;
    tmpBulletInput.team = 0;
    tmpBulletInput.layerMask = LAYER_ENEMY;
    tmpBulletInput.maxHits = 1;
    tmpBulletInput.bouncesLeft = 0;

    const prevX = s.x;
    const prevY = s.y;
    const res = stepSweptBullet(ctx.obsGrid, ctx.actorGrid, tmpBulletInput, stepDt, tmpSweepRes);
    s.x = res.endX;
    s.y = res.endY;
    s.distLeft -= Math.hypot(s.x - prevX, s.y - prevY);
    s.ttlTicks -= 1;

    if (res.actorHits.length > 0) {
      const hit = res.actorHits[0];
      const primary = resolveEnemy(hit.actor.id);
      if (s.isOvercharge) {
        triggerThunderSplash(s, hit.x, hit.y, primary, ctx, resolveEnemy);
      } else if (primary && primary.alive && primary.hp > 0) {
        applyPairDamageToEnemy(
          primary,
          s.damage,
          'kinetic',
          s.dmgMult,
          0,
          s.ownerIdx,
          'turret_bolt',
          ctx,
        );
        applyEnemyKnockback(primary, prevX, prevY, s.knockback, 1, ctx);
        ctx.fx?.push(
          FX_IMPACT,
          0,
          Math.round(hit.x),
          Math.round(hit.y),
          quantizeAim(Math.atan2(s.vy, s.vx)),
          1,
        );
      }
      state.turretShots.splice(i, 1);
      continue;
    }

    if (res.stoppedBy === 'obstacle') {
      const obsHit = res.obstacleHits[0];
      if (obsHit) {
        applySingleObstacleDamage(
          ctx,
          obsHit.obstacle,
          Math.round(s.damage[0] * s.dmgMult),
          s.ownerIdx,
          s.isOvercharge ? 'turret_thunder' : 'turret_bolt',
        );
      }
      if (s.isOvercharge) {
        triggerThunderSplash(s, s.x, s.y, undefined, ctx, resolveEnemy);
      } else {
        ctx.fx?.push(
          FX_IMPACT,
          0,
          Math.round(s.x),
          Math.round(s.y),
          quantizeAim(Math.atan2(s.vy, s.vx)),
          0,
        );
      }
      state.turretShots.splice(i, 1);
      continue;
    }

    if (s.ttlTicks <= 0 || s.distLeft <= 0.5) {
      state.turretShots.splice(i, 1);
    }
  }
}

function triggerThunderSplash(
  shot: GadgetTurretShotState,
  hx: number,
  hy: number,
  primary: GadgetEnemyActor | undefined,
  ctx: GadgetStepContext,
  resolveEnemy: (id: number) => GadgetEnemyActor | undefined,
): void {
  const splashR = Math.round(shot.splashRadius * shot.blastRadiusMult);
  const projCfg = BANSUNG_PROJECTILE_CONFIGS.turret_thunder;
  const coreR = projCfg.coreRadius;
  const minFalloff = projCfg.outerFalloffMin;

  if (primary && primary.alive && primary.hp > 0) {
    applyPairDamageToEnemy(
      primary,
      shot.damage,
      'energy',
      shot.dmgMult,
      shot.stunMs,
      shot.ownerIdx,
      'turret_thunder',
      ctx,
    );
    applyEnemyKnockback(primary, shot.x, shot.y, shot.knockback, 1, ctx);
  }

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, hx, hy, splashR, 'los', LAYER_ENEMY, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const aoe = tmpAoeTargets[i];
    const enemy = resolveEnemy(aoe.actor.id);
    if (!enemy || !enemy.alive || enemy.hp <= 0) continue;
    if (primary && enemy.numId === primary.numId) continue;

    const falloff = computeGadgetBlastFalloff(aoe.edgeDist, coreR, splashR, minFalloff);
    applyPairDamageToEnemy(
      enemy,
      shot.damage,
      'energy',
      falloff * shot.dmgMult,
      Math.round(shot.stunMs * falloff),
      shot.ownerIdx,
      'turret_thunder',
      ctx,
    );
    applyEnemyKnockback(enemy, hx, hy, shot.knockback, falloff, ctx);
  }

  damageObstaclesInBlast(
    ctx,
    hx,
    hy,
    splashR,
    coreR,
    minFalloff,
    Math.round(shot.damage[0] * shot.dmgMult),
    shot.ownerIdx,
    'turret_thunder',
  );

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_TURRET_THUNDER,
    Math.round(hx),
    Math.round(hy),
    splashR,
    shot.ownerIdx,
  );
  ctx.fxEvents?.push({
    type: 'turret_thunder',
    x: Math.round(hx),
    y: Math.round(hy),
    radius: splashR,
    ownerIdx: shot.ownerIdx,
    targetId: primary?.numId,
  });
}

function stepHealDrone(
  state: GadgetWorldState,
  dep: BansungGadgetDeployableState,
  meta: {
    dmgMult: number;
    blastRadiusMult: number;
    tetherKind: 'none' | 'player' | 'turret';
    tetherKey: number;
  },
  ctx: GadgetStepContext,
): void {
  const spec = BANSUNG_GADGETS.heal_drone;
  const droneCfg = spec.drone;
  if (!droneCfg) return;

  const owner = findPlayerByIdx(ctx.players, dep.ownerIdx);
  if (owner && owner.alive) {
    const safeAim = Number.isFinite(owner.aimRad) ? owner.aimRad : dep.aimRad;
    dep.aimRad = safeAim;
    const desiredX = owner.x - Math.cos(safeAim) * droneCfg.followBehindPx;
    const desiredY = owner.y - Math.sin(safeAim) * droneCfg.followBehindPx;
    dep.x = clamp(dep.x + (desiredX - dep.x) * droneCfg.springK, 0, ctx.obsGrid.mapW);
    dep.y = clamp(dep.y + (desiredY - dep.y) * droneCfg.springK, 0, ctx.obsGrid.mapH);
  }

  const bobPhase = (state.tickNo + dep.id * 5) * ((2 * Math.PI * droneCfg.hoverBobHz) / BANSUNG_TICK_HZ);
  dep.z = Math.round(droneCfg.hoverZ + droneCfg.hoverBobAmpPx * Math.sin(bobPhase));

  // Select tether target every tick: lowest hp/maxHp ally (including downed) or injured turret
  let bestPlayer: GadgetPlayerActor | undefined;
  let bestPlayerRatio = Infinity;
  let bestPlayerShieldRatio = Infinity;
  let bestPlayerDist = Infinity;
  let nearbyAliveCoop = 0;

  for (let i = 0; i < ctx.players.length; i++) {
    const p = ctx.players[i];
    if (!p.alive) continue;
    const d = dist2D(dep.x, dep.y, p.x, p.y);
    if (!p.downed && p.hp > 0 && d <= droneCfg.coopBonusRadius) {
      nearbyAliveCoop++;
    }
    if (d > spec.radius) continue;
    if (!p.downed && p.hp >= p.maxHp && p.shield >= p.maxShield) continue;

    const hpRatio = p.downed ? 0 : p.hp / Math.max(1, p.maxHp);
    const shieldRatio = p.maxShield > 0 ? p.shield / p.maxShield : 1;
    if (
      hpRatio < bestPlayerRatio ||
      (hpRatio === bestPlayerRatio &&
        (shieldRatio < bestPlayerShieldRatio ||
          (shieldRatio === bestPlayerShieldRatio && d < bestPlayerDist)))
    ) {
      bestPlayer = p;
      bestPlayerRatio = hpRatio;
      bestPlayerShieldRatio = shieldRatio;
      bestPlayerDist = d;
    }
  }

  let bestTurret: BansungGadgetDeployableState | undefined;
  if (!bestPlayer) {
    let bestTurretRatio = Infinity;
    for (let i = 0; i < state.deployables.length; i++) {
      const other = state.deployables[i];
      if (other.kind !== DEPLOYABLE_KIND_TURRET || other.hp <= 0 || other.lifeTicks <= 0) continue;
      if (other.hp >= other.maxHp) continue;
      if (dist2D(dep.x, dep.y, other.x, other.y) > spec.radius) continue;
      const ratio = other.hp / Math.max(1, other.maxHp);
      if (ratio < bestTurretRatio) {
        bestTurretRatio = ratio;
        bestTurret = other;
      }
    }
  }

  if (bestPlayer) {
    meta.tetherKind = 'player';
    meta.tetherKey = bestPlayer.idx;
    dep.targetId = bestPlayer.numId ?? bestPlayer.idx;
  } else if (bestTurret) {
    meta.tetherKind = 'turret';
    meta.tetherKey = bestTurret.id;
    dep.targetId = bestTurret.id;
  } else {
    meta.tetherKind = 'none';
    meta.tetherKey = -1;
    dep.targetId = -1;
  }

  // Co-op heal pulse every 10 ticks (0.33s)
  dep.actionCdTicks -= 1;
  if (dep.actionCdTicks <= 0) {
    dep.actionCdTicks = droneCfg.healIntervalTicks;
    const coopMult = nearbyAliveCoop >= 2 ? droneCfg.coopBonusMult : 1;

    if (bestPlayer && !bestPlayer.downed && bestPlayer.hp > 0) {
      const hpAdd = Math.min(
        Math.max(0, bestPlayer.maxHp - bestPlayer.hp),
        Math.round(droneCfg.healHp * coopMult),
      );
      const shieldAdd = Math.min(
        Math.max(0, bestPlayer.maxShield - bestPlayer.shield),
        Math.round(droneCfg.healArmor * coopMult),
      );
      bestPlayer.hp += hpAdd;
      bestPlayer.shield += shieldAdd;
      const total = hpAdd + shieldAdd;
      if (total > 0) {
        ctx.fx?.push(
          FX_DMG,
          Math.round(bestPlayer.x),
          Math.round(bestPlayer.y),
          total,
          BANSUNG_DMG_HEAL,
          bestPlayer.numId ?? bestPlayer.idx,
        );
      }
    } else if (bestTurret && bestTurret.hp > 0) {
      const hpAdd = Math.min(
        Math.max(0, bestTurret.maxHp - bestTurret.hp),
        Math.max(1, Math.round(droneCfg.healHp * droneCfg.turretHealMult * coopMult)),
      );
      bestTurret.hp += hpAdd;
      if (hpAdd > 0) {
        ctx.fx?.push(
          FX_DMG,
          Math.round(bestTurret.x),
          Math.round(bestTurret.y),
          hpAdd,
          BANSUNG_DMG_HEAL,
          bestTurret.id,
        );
      }
    }
  }

  // Energy aura pulse every 105 ticks (3.5s)
  dep.pulseTicks += 1;
  if (dep.pulseTicks >= droneCfg.energyPulseIntervalTicks) {
    dep.pulseTicks = 0;
    for (let i = 0; i < ctx.players.length; i++) {
      const p = ctx.players[i];
      if (!p.alive || p.downed || p.hp <= 0) continue;
      if (dist2D(dep.x, dep.y, p.x, p.y) > droneCfg.energyPulseRadius) continue;

      const gain = Math.min(Math.max(0, p.maxEnergy - p.energy), droneCfg.energyPulseAmount);
      if (gain > 0) {
        p.energy += gain;
        ctx.onEnergyGrant?.(p, gain);
      }
    }

    ctx.fx?.push(
      FX_BLAST,
      BANSUNG_BLAST_DRONE_PULSE,
      Math.round(dep.x),
      Math.round(dep.y),
      droneCfg.energyPulseRadius,
      dep.ownerIdx,
    );
    ctx.fxEvents?.push({
      type: 'drone_pulse',
      x: Math.round(dep.x),
      y: Math.round(dep.y),
      radius: droneCfg.energyPulseRadius,
      ownerIdx: dep.ownerIdx,
    });
    ctx.onSfx?.(spec.sfxTrigger, dep.x, dep.y, dep.ownerIdx);
  }
}

// ============================================================================
// 9. Authoritative 30Hz Step & Turret / Drone Queries
// ============================================================================

/**
 * Advances all active thrown gadget projectiles, auto-turrets, turret bolts,
 * and healing drones by 1 server tick (30Hz).
 */
export function stepGadgetWorld(
  state: GadgetWorldState,
  ctx: GadgetStepContext,
): void {
  state.tickNo += 1;
  const resolveEnemy = buildEnemyResolver(ctx);

  stepGadgetProjectiles(state, ctx, resolveEnemy);

  for (let i = state.deployables.length - 1; i >= 0; i--) {
    const dep = state.deployables[i];
    dep.lifeTicks -= 1;

    const meta = state.deployableMeta.get(dep.id) ?? {
      dmgMult: 1,
      blastRadiusMult: 1,
      tetherKind: 'none' as const,
      tetherKey: -1,
    };

    if (dep.lifeTicks <= 0 || dep.hp <= 0) {
      state.deployableMeta.delete(dep.id);
      state.deployables.splice(i, 1);
      if (dep.kind === DEPLOYABLE_KIND_TURRET) {
        detonateTurretExpiry(dep, meta, ctx, resolveEnemy);
      }
      continue;
    }

    if (dep.kind === DEPLOYABLE_KIND_TURRET) {
      stepAutoTurret(state, dep, meta, ctx, resolveEnemy);
    } else {
      stepHealDrone(state, dep, meta, ctx);
    }
  }

  if (state.turretShots.length > 0) {
    stepTurretShots(state, ctx, resolveEnemy);
  }
}

/** Applies damage to an auto-turret using armored affinity and `armor: 1`. */
export function damageGadgetDeployable(
  dep: BansungGadgetDeployableState,
  dmg: number,
  dmgKind: BansungDamageKind,
  ctx?: { popups?: BansungDmgEvent[]; fx?: number[]; rng?: () => number },
): BansungDamageResult {
  if (dep.kind !== DEPLOYABLE_KIND_TURRET || dep.hp <= 0 || dep.lifeTicks <= 0) {
    return {
      hpDmg: 0,
      shieldDmg: 0,
      totalDmg: 0,
      rawDmg: 0,
      blocked: true,
      isCrit: false,
      brokeShield: false,
      killed: false,
      stunAppliedMs: 0,
      flags: 0,
      fxFlags: 0,
      dmgKindIdx: 0,
    };
  }

  const turretCfg = BANSUNG_GADGETS.auto_turret.turret;
  const target: BansungCombatTarget = {
    id: dep.id,
    numId: dep.id,
    x: dep.x,
    y: dep.y,
    tier: 'mob',
    armorType: turretCfg?.armorType ?? 'armored',
    flatArmor: turretCfg?.armor ?? 1,
    alive: true,
    hp: dep.hp,
    maxHp: dep.maxHp,
    shield: 0,
    maxShield: 0,
    ccImmune: true,
  };

  const res = applyBansungDamage(
    target,
    { baseDmg: dmg, dmgKind, affinity: BANSUNG_AFFINITY[dmgKind] },
    ctx,
  );
  dep.hp = Math.max(0, target.hp);
  return res;
}

/**
 * Enforces `d30` soft-decoy rule: enemies only aggro a turret when no alive
 * non-downed player stands within `90px` (`aggroDecoyClearRadius`) of the enemy.
 */
export function canEnemyAggroTurret(
  enemyX: number,
  enemyY: number,
  players: readonly Pick<GadgetPlayerActor, 'x' | 'y' | 'alive' | 'downed' | 'hp'>[],
): boolean {
  const clearR = BANSUNG_GADGETS.auto_turret.turret?.aggroDecoyClearRadius ?? 90;
  const clearR2 = clearR * clearR;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const dx = p.x - enemyX;
    const dy = p.y - enemyY;
    if (dx * dx + dy * dy <= clearR2) {
      return false;
    }
  }
  return true;
}

/**
 * Returns bleedout slowdown (`0.5x`) and revive speed bonus (`+0.25`) while
 * a downed player is actively tethered by a friendly `heal_drone`.
 */
export function getDroneDownedSupport(
  state: GadgetWorldState,
  playerIdx: number,
): DroneDownedSupport {
  const droneCfg = BANSUNG_GADGETS.heal_drone.drone;
  for (let i = 0; i < state.deployables.length; i++) {
    const d = state.deployables[i];
    if (d.kind !== DEPLOYABLE_KIND_DRONE || d.hp <= 0 || d.lifeTicks <= 0) continue;
    const meta = state.deployableMeta.get(d.id);
    if (meta && meta.tetherKind === 'player' && meta.tetherKey === playerIdx) {
      return {
        tethered: true,
        bleedSlowMult: droneCfg?.downedBleedSlowMult ?? 0.5,
        reviveSpeedBonus: droneCfg?.downedReviveSpeedBonus ?? 0.25,
        droneId: d.id,
      };
    }
  }
  return {
    tethered: false,
    bleedSlowMult: 1,
    reviveSpeedBonus: 0,
    droneId: -1,
  };
}

/** Appends active auto-turrets as `SpatialActor` entries (`LAYER_PET`) for `ActorGrid`. */
export function collectTurretSpatialActors(
  state: GadgetWorldState,
  out: SpatialActor[],
  idOffset = TURRET_SPATIAL_ID_BASE,
): SpatialActor[] {
  const radius = BANSUNG_GADGETS.auto_turret.turret?.bodyRadius ?? 14;
  for (let i = 0; i < state.deployables.length; i++) {
    const d = state.deployables[i];
    if (d.kind !== DEPLOYABLE_KIND_TURRET || d.hp <= 0 || d.lifeTicks <= 0) continue;
    out.push({
      id: idOffset + d.id,
      x: d.x,
      y: d.y,
      radius,
      team: 0,
      layer: LAYER_PET,
      alive: true,
    });
  }
  return out;
}

// ============================================================================
// 10. Frame Packing Helpers (`pr` stride 5, `b` stride 6, `gProj`/`gDep`)
// ============================================================================

/** Appends active deployables into `BansungFrame.pr` stride-5 format `[id, propKindIdx, x, y, hpPct]`. */
export function packGadgetProps(state: GadgetWorldState, out: number[]): number[] {
  for (let i = 0; i < state.deployables.length; i++) {
    const d = state.deployables[i];
    if (d.hp <= 0 || d.lifeTicks <= 0) continue;
    const propKindIdx =
      d.kind === DEPLOYABLE_KIND_TURRET ? BANSUNG_PROP_INDEX.turret : BANSUNG_PROP_INDEX.drone;
    const hpPct = clamp(Math.round((d.hp / Math.max(1, d.maxHp)) * 100), 0, 100);
    out.push(d.id, propKindIdx, Math.round(d.x), Math.round(d.y), hpPct);
  }
  return out;
}

/** Appends active thrown gadget bombs & turret shots into `BansungFrame.b` stride-6 format. */
export function packGadgetBullets(state: GadgetWorldState, out: number[]): number[] {
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    const kindId =
      p.kind === GADGET_PROJ_KIND_STUN
        ? BANSUNG_PROJECTILE_CONFIGS.stun_bomb_proj.kindId
        : p.kind === GADGET_PROJ_KIND_CLUSTER
          ? BANSUNG_PROJECTILE_CONFIGS.cluster_bomb_proj.kindId
          : BANSUNG_PROJECTILE_CONFIGS.cluster_sub_proj.kindId;
    const aimQ = quantizeAim(Math.atan2(p.ty - p.sy, p.tx - p.sx));
    out.push(
      p.id,
      kindId,
      Math.round(p.x),
      Math.round(p.y - p.z),
      aimQ,
      BANSUNG_BFLAG_EXPLOSIVE,
    );
  }

  for (let i = 0; i < state.turretShots.length; i++) {
    const s = state.turretShots[i];
    const flags = s.isOvercharge ? BANSUNG_BFLAG_ENERGY : 0;
    out.push(
      s.id,
      s.kindId,
      Math.round(s.x),
      Math.round(s.y),
      quantizeAim(Math.atan2(s.vy, s.vx)),
      flags,
    );
  }
  return out;
}

/** Packs d30 `gProj` stride-7 array: `[id, ownerIdx, kind, x, y, z, fusePct(0..100)]`. */
export function packGadgetProjFrames(state: GadgetWorldState, out: number[]): number[] {
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    const total = p.flightTicks + (state.projBounceTotal.get(p.id) ?? (p.kind === 0 ? 4 : 6));
    const fusePct = clamp(Math.round(((p.tick) / Math.max(1, total)) * 100), 0, 100);
    out.push(
      p.id,
      p.ownerIdx,
      p.kind,
      Math.round(p.x),
      Math.round(p.y),
      Math.round(p.z),
      fusePct,
    );
  }
  return out;
}

/** Packs d30 `gDep` stride-8 array: `[id, ownerIdx, kind, x, y, hpPct, aimDeg, (activeBit<<8)|lifePct]`. */
export function packGadgetDepFrames(state: GadgetWorldState, out: number[]): number[] {
  for (let i = 0; i < state.deployables.length; i++) {
    const d = state.deployables[i];
    const hpPct = clamp(Math.round((d.hp / Math.max(1, d.maxHp)) * 100), 0, 100);
    const lifePct = clamp(Math.round((d.lifeTicks / Math.max(1, d.maxLifeTicks)) * 100), 0, 100);
    const aimDeg = Math.round(((d.aimRad * 180) / Math.PI) % 360);
    const activeBit = d.targetId >= 0 ? 1 : 0;
    out.push(
      d.id,
      d.ownerIdx,
      d.kind,
      Math.round(d.x),
      Math.round(d.y),
      hpPct,
      aimDeg,
      (activeBit << 8) | lifePct,
    );
  }
  return out;
}
