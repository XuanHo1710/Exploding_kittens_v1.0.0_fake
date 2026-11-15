/**
 * Bansung Co-op (Soul & Steel) non-boss mob AI, specials, projectiles, and hazards (30 Hz).
 *
 * Implements all 8 non-boss enemy archetypes cleanly atop `flocking.ts`, `damage.ts`,
 * and `spatial.ts`:
 * - Melee / Bomber (`0..3`): `scarab`, `skirmisher`, `bomb_goblin`, `cactus_brute`
 * - Ranged / Caster (`4..7`): `cactus_spitter`, `laser_sniper`, `pyro_shaman`, `thunder_mage`
 */

import {
  BANSUNG_ENEMIES,
  BANSUNG_EFLAG_ARMORED,
  BANSUNG_EFLAG_BURNING,
  BANSUNG_EFLAG_ELITE,
  BANSUNG_EFLAG_EVOLVED,
  BANSUNG_EFLAG_HIT_FLASH,
  BANSUNG_EFLAG_LEFT,
  BANSUNG_EFLAG_SHIELDED,
  BANSUNG_EFLAG_STUNNED,
  BANSUNG_EFLAG_TELEGRAPH,
  encodeEnemyMobLevelFlags,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_THUNDER_STORM,
  BANSUNG_FX_BLAST_VOLATILE,
  BANSUNG_FX_IMPACT_FLESH,
  BANSUNG_FX_IMPACT_WALL,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_MELEE_SPECIALS,
  BANSUNG_MOB_IDS,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_RANGED_ATTACKS,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  FX_IMPACT,
  computeMobDmgMult,
  computeMobHpMult,
  computeMobLevelFromWave,
  computeMobLevelScaling,
  quantizeAim,
  resolveBansungEnemyId,
  type BansungArmorType,
  type BansungEnemyStats,
  type BansungHazard,
  type BansungTelegraph,
  type BansungUnitState,
  type EnemyFlockState,
} from '../../../../shared/src';
import {
  applyBansungDamage,
  applyDot,
  applyStunWithDR,
  tickStatuses,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageHit,
  type BansungDamageKind,
  type BansungDamageResult,
  type BansungStatusContext,
  type BansungStunOptions,
} from './damage';
import {
  createEnemyFlockState,
  stepEnemyFlocking,
  type FlockEnemy,
  type FlockTarget,
  type StepEnemyFlockingOptions,
} from './flocking';
import {
  ActorGrid,
  LAYER_ENEMY,
  LAYER_PET,
  LAYER_PLAYER,
  ObstacleGrid,
  checkMuzzleWallGuard,
  distPointToSegmentSq,
  hasLineOfSight,
  moveCircleWithSlide,
  queryAoeObstacles,
  queryAoeTargets,
  raycastObstacles,
  resolveObstacles,
  stepSweptBullet,
  type AoeObstacleTarget,
  type AoeTarget,
  type CircleBody,
  type SpatialActor,
  type SweepBulletResult,
  type SweptBulletInput,
} from './spatial';

// ---------------------------------------------------------------------------
// Constants & Type Definitions
// ---------------------------------------------------------------------------

/** Canonical 8 non-boss mob archetype IDs (`0..7`). */
export type BansungMobId = (typeof BANSUNG_MOB_IDS)[number];

/** 8-element enemy wire tuple `[id, enemyIdx, x, y, hpPct, aimQ, state, flags]`. */
export type BansungEnemyTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** AI finite-state-machine states used across melee and ranged mobs. */
export type MobAiState =
  | 'idle'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'lunge'
  | 'fuse'
  | 'recover'
  | 'cooldown'
  | 'stunned'
  | 'dead';

/** Elite stat & cooldown scaling per d35 specification. */
export const MOB_ELITE_DEFAULTS = {
  hpMult: 1.8,
  cdMult: 0.82,
} as const;

/** Stun interrupt cooldown reset fraction per d35 §4.5. */
export const MOB_STUN_INTERRUPT_CD_MULT = 0.4;

/** Threat tie-breaker distance bonus (px) for recent attackers per d35 §4.1. */
export const MOB_THREAT_OFFSET_PX = -60;

/** How long (ticks, 3s at 30 Hz) a recent attacker keeps the -60 px threat bonus. */
export const MOB_THREAT_DURATION_TICKS = 90;

/** 30 Hz fixed step duration in seconds. */
const DT_SEC = 1 / BANSUNG_TICK_HZ;
const TWO_PI = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const MOB_CONTACT_ICD_TICKS = 24;

const TELEGRAPH_KIND_LINE = 0;
const TELEGRAPH_KIND_CIRCLE = 1;
const TELEGRAPH_COLOR_SNIPER = 0;
const TELEGRAPH_COLOR_FIRE = 1;
const TELEGRAPH_COLOR_STORM = 2;
const TELEGRAPH_COLOR_POISON = 3;
const TELEGRAPH_COLOR_VOID = 4;
const TELEGRAPH_COLOR_SLAM = 1;
const TELEGRAPH_COLOR_BOMB = 1;

/** Projectile species spawned by mob ranged/radial attacks. */
export type MobProjectileKind =
  | 'cactus_needle'
  | 'needle_orb'
  | 'sniper_slug'
  | 'fireball'
  | 'fireball_split'
  | 'thunderball'
  | 'frost_bolt'
  | 'venom_spit'
  | 'void_bolt'
  | 'smite_bolt'
  | 'shock_bolt'
  | 'chrono_bolt'
  | 'plague_acid'
  | 'void_arc'
  | 'mirror_slash'
  | 'blight_glob'
  | 'solar_orb';

/** Combat entity targeted by mobs (hero, pet, or turret). */
export interface MobCombatEntity extends BansungCombatTarget {
  id: string;
  numId: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  team: number;
  layer: number;
  alive: boolean;
  downed?: boolean;
  invulnMs?: number;
  kbResist?: number;
  knockVx?: number;
  knockVy?: number;
  scoreOffset?: number;
  /** Damage vulnerability multiplier (bumped to 1.15 on Thunder Mage storm strike). */
  vulnMult?: number;
  vulnMs?: number;
  /** Temporary slow percentage (0..1) and remaining ms (set by Thunderball). */
  slowPct?: number;
  slowMs?: number;
}

/** Active projectile owned by a mob. */
export interface MobProjectile {
  id: number;
  ownerMobId: string;
  ownerNumId: number;
  team: number;
  kind: MobProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseAngle: number;
  speed: number;
  radius: number;
  dmg: number;
  dmgKind: BansungDamageKind;
  armorPiercePct: number;
  knockbackSpeed: number;
  maxDist: number;
  distTraveled: number;
  ttlTicks: number;
  ageTicks: number;
  destructibleByMelee: boolean;
  /** Splash detonation params (Pyro Shaman fireballs). */
  splashRadius: number;
  edgeDmg: number;
  spawnsFirePool: boolean;
  appliesBurn: boolean;
  burnDps: number;
  burnDurationS: number;
  /** Lateral wobble params (Thunder Mage thunderball). */
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  /** On-hit crowd-control & DOT hooks (Thunderball, Frost Bolt, Venom Spit). */
  slowPct: number;
  slowMs: number;
  microStunMs: number;
  dotKind?: 'poison' | 'burn' | 'bleed';
  dotTickDmg?: number;
  dotDurMs?: number;
}

/** Internal tracked `fire_pool` ground hazard (extends shared `BansungHazard`). */
export interface MobHazard extends BansungHazard {
  kind: 'fire_pool';
  ownerMobId: string;
  team: number;
  tickInterval: number;
  tickDmg: number;
  dmgKind?: BansungDamageKind;
  ticksUntilPulse: number;
  createdTick: number;
}

/** Active telegraph entry owned by a specific mob. */
export interface MobTelegraphEntry extends BansungTelegraph {
  ownerMobId: string;
}

/** FX event emitted by mob actions for client FX dispatch. */
export interface MobFxEvent {
  type: number;
  subKind?: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  value?: number;
  kind?: string;
  sourceId?: string;
  targetId?: string;
}

/** Optional callbacks wired by `world.ts` or test harnesses. */
export interface MobStepCallbacks {
  damageCtx?: BansungDamageContext;
  statusCtx?: BansungStatusContext;
  /**
   * Optional hook invoked when a mob damages a player-team target (`team === 0`),
   * allowing `BansungWorld.applyHeroIncomingDamage` to enforce i-frames, dash invuln, and HUD flash.
   */
  onDamagePlayer?: (
    target: MobCombatEntity,
    hit: BansungDamageHit,
    sourceMob: MobState,
  ) => BansungDamageResult | undefined;
  /** Hook when a mob AoE damages a destructible obstacle (`obs` from ObstacleGrid). */
  onDamageObstacle?: (
    obstacle: AoeObstacleTarget['obstacle'],
    damage: number,
    sourceMob: MobState,
    dmgKind: BansungDamageKind,
  ) => void;
  /** Hook when Thunderball slows a target (`0.35` for `450 ms`). */
  onApplySlow?: (target: MobCombatEntity, slowPct: number, durationMs: number, sourceMob: MobState) => void;
  /** Hook when Storm Strike shocks a target (`+0.15` vulnerability for `2000 ms`). */
  onApplyShocked?: (target: MobCombatEntity, bonusDmgPct: number, durationMs: number, sourceMob: MobState) => void;
  /** Hook for knockback application if caller manages hero velocity externally. */
  onKnockback?: (target: MobCombatEntity, dvx: number, dvy: number, sourceMob: MobState) => void;
  /** Hook invoked whenever any FX event (`FX_BLAST`, `FX_IMPACT`, `FX_DEATH`, `FX_BEAM`) triggers. */
  onFx?: (fx: MobFxEvent) => void;
  /** Hook invoked when a mob dies (non-fuse or defused kills). */
  onMobKilled?: (mob: MobState, killerId?: string) => void;
}

/** Options when spawning a mob directly via `spawnMob`. */
export interface SpawnMobOptions {
  id?: string;
  numId?: number;
  kind: string;
  x: number;
  y: number;
  team?: number;
  elite?: boolean;
  evolved?: boolean;
  eliteAffix?: 'armored' | 'swift' | 'volatile' | string;
  playerCount?: number;
  wave?: number;
  difficulty?: string;
  hpMult?: number;
  dmgMult?: number;
  speedMult?: number;
  scaleMult?: number;
  armorAdd?: number;
  mobLevel?: number;
  armorType?: BansungArmorType;
  deathNova?: { radius: number; damage: number };
  enraged?: boolean;
  enrageSpeedMult?: number;
}

/** Director-compatible spawn payload (matches `DirectorMobSpawn` in `director.ts`). */
export interface DirectorSpawnPayload {
  id?: string;
  kind: string;
  x: number;
  y: number;
  hpMult?: number;
  dmgMult?: number;
  speedMult?: number;
  scaleMult?: number;
  armorAdd?: number;
  mobLevel?: number;
  armorType?: BansungArmorType;
  elite?: 'armored' | 'swift' | 'volatile';
  evolved?: boolean;
  deathNova?: { radius: number; damage: number };
}

/** Alias matching director spawn option contracts. */
export type SpawnMobFromDirectorOpts = DirectorSpawnPayload;

/** Alias matching `MobState`. */
export type MobEntity = MobState;

/** Full per-mob simulation state implementing `BansungCombatTarget` + synced flock/spatial proxies. */
export interface MobState extends BansungCombatTarget {
  id: string;
  numId: number;
  kind: BansungMobId;
  role: BansungEnemyStats['role'];
  team: number;
  layer: number;
  x: number;
  y: number;
  radius: number;
  mass: number;
  speed: number;
  baseSpeed: number;
  kbResist: number;
  stunMult: number;
  armorType: BansungArmorType;
  flatArmor: number;
  damageReduction?: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  alive: boolean;

  elite: boolean;
  evolved: boolean;
  level: number;
  eliteAffix?: string;
  dmgMult: number;
  cdMult: number;
  enraged: boolean;
  enrageSpeedMult: number;
  deathNova?: { radius: number; damage: number };

  state: MobAiState;
  stateTicks: number;
  cooldownTicks: number;
  attackCooldown: number;
  aimAngle: number;
  facingLeft: boolean;
  stationary: boolean;
  sepWeightScale: number;
  steerBiasX: number;
  steerBiasY: number;
  knockVx: number;
  knockVy: number;
  actualSpeed: number;
  flock: EnemyFlockState;
  /** Persistent `FlockEnemy` proxy (`id = mob.numId`) mutated in-place by `stepEnemyFlocking`. */
  flockProxy: FlockEnemy;
  /** Persistent `SpatialActor` view (`id = mob.numId`) for `ActorGrid` insertion. */
  spatialActor: SpatialActor;

  preferredRange?: readonly [number, number];
  backoffDist?: number;

  /** Threat & targeting bookkeeping. */
  targetId?: string;
  threatTargetId?: string;
  threatUntilTick: number;
  lastDamagedBy?: string;

  /** Archetype-specific timers & counters. */
  pendingAttack:
    | 'none'
    | 'melee_basic'
    | 'skirmisher_swipe'
    | 'skirmisher_lunge'
    | 'brute_cleave'
    | 'brute_slam'
    | 'spitter_fan'
    | 'sniper_shot'
    | 'pyro_fireball'
    | 'thunder_ball'
    | 'thunder_storm'
    | 'frost_bolt'
    | 'frost_nova'
    | 'venom_spit'
    | 'warden_pulse'
    | 'mortar_shell'
    | 'void_singularity'
    | 'saw_lunge'
    | 'priest_heal'
    | 'shock_twin'
    | 'chrono_bolt'
    | 'golem_slam'
    | 'golem_plasma'
    | 'sniper_mech_shot'
    | 'plague_acid'
    | 'lancer_dash'
    | 'reaper_blink'
    | 'mirror_slash'
    | 'mirror_fan'
    | 'magnet_pulse'
    | 'blight_lob'
    | 'volt_dash'
    | 'solar_cone'
    | 'magma_slam';
  lungeCooldownTicks: number;
  lungeHitDone: boolean;
  fuseCooldownTicks: number;
  armTicks: number;
  slamCooldownTicks: number;
  thornyHideIcdByTarget: Map<string, number>;
  contactIcdByTarget: Map<string, number>;
  sniperTick: number;
  burstRemaining: number;
  burstDelayTicks: number;
  castCount: number;
  predTargetX: number;
  predTargetY: number;
  stormPoints: Array<{ x: number; y: number }>;
}

/** Options accepted by `stepMobs`. */
export interface StepMobsOptions {
  tick: number;
  targets: readonly MobCombatEntity[];
  obsGrid?: ObstacleGrid | null;
  enemyGrid?: ActorGrid | null;
  targetGrid?: ActorGrid | null;
  rng?: () => number;
  flockingOptions?: StepEnemyFlockingOptions;
  callbacks?: MobStepCallbacks;
  /** Default `true`. Set `false` to step projectiles/hazards separately. */
  stepProjectilesAndHazards?: boolean;
}

/** Deterministic manager holding active mobs, telegraphs, projectiles, hazards, and FX queue. */
export interface MobManager {
  mobs: MobState[];
  mobById: Map<string, MobState>;
  mobByNumId: Map<number, MobState>;
  projectiles: MobProjectile[];
  telegraphs: Map<string, MobTelegraphEntry[]>;
  hazards: MobHazard[];
  fxQueue: MobFxEvent[];
  prevTargetPos: Map<string, { x: number; y: number; tick: number }>;
  emptyObsGrid: ObstacleGrid;
  emptyActorGrid: ActorGrid;
  nextNumId: number;
  nextProjId: number;
  nextTelegraphId: number;
  nextHazardId: number;
  mapW: number;
  mapH: number;
  rng: () => number;
}

// ---------------------------------------------------------------------------
// Geometry & Scaling Helpers
// ---------------------------------------------------------------------------

function normalizeAngle(rad: number): number {
  let a = rad % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}

function angleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function clampPlayableX(x: number, radius: number, mapW: number): number {
  const minX = Math.max(BANSUNG_PLAYABLE_BOUNDS.x0 + radius, radius);
  const maxX = Math.min(BANSUNG_PLAYABLE_BOUNDS.x1 - radius, mapW - radius);
  return x < minX ? minX : x > maxX ? maxX : x;
}

function clampPlayableY(y: number, radius: number, mapH: number): number {
  const minY = Math.max(BANSUNG_PLAYABLE_BOUNDS.y0 + radius, radius);
  const maxY = Math.min(BANSUNG_PLAYABLE_BOUNDS.y1 - radius, mapH - radius);
  return y < minY ? minY : y > maxY ? maxY : y;
}

function getEffectiveCd(baseTicks: number, mob: MobState): number {
  return Math.max(1, Math.round(baseTicks * mob.cdMult));
}

function getScaledDmg(baseDmg: number, mob: MobState): number {
  return Math.max(1, Math.round(baseDmg * mob.dmgMult));
}

function isTargetValid(t: MobCombatEntity): boolean {
  return t.alive && !t.downed && t.hp > 0;
}

function hasClearLos(
  obsGrid: ObstacleGrid | null | undefined,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: 'los' | 'bullet',
): boolean {
  if (!obsGrid) return true;
  return hasLineOfSight(obsGrid, x0, y0, x1, y1, mode);
}

function computeWallClippedEnd(
  obsGrid: ObstacleGrid | null | undefined,
  x0: number,
  y0: number,
  angle: number,
  maxDist: number,
): { x: number; y: number } {
  const ex = x0 + Math.cos(angle) * maxDist;
  const ey = y0 + Math.sin(angle) * maxDist;
  if (!obsGrid) return { x: ex, y: ey };
  const hit = raycastObstacles(obsGrid, x0, y0, ex, ey, 0, 'bullet');
  if (!hit) return { x: ex, y: ey };
  return { x: hit.x, y: hit.y };
}

function applyKnockbackToEntity(
  target: MobCombatEntity,
  fromX: number,
  fromY: number,
  speed: number,
  sourceMob: MobState,
  callbacks?: MobStepCallbacks,
): void {
  if (speed <= 0) return;
  const dx = target.x - fromX;
  const dy = target.y - fromY;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 1e-4 ? dx / dist : Math.cos(sourceMob.aimAngle);
  const ny = dist > 1e-4 ? dy / dist : Math.sin(sourceMob.aimAngle);
  const resist = target.kbResist ?? 0;
  const effSpeed = speed * Math.max(0, 1 - resist);
  if (effSpeed <= 0) return;
  const dvx = nx * effSpeed;
  const dvy = ny * effSpeed;
  target.knockVx = (target.knockVx ?? 0) + dvx;
  target.knockVy = (target.knockVy ?? 0) + dvy;
  callbacks?.onKnockback?.(target, dvx, dvy, sourceMob);
}

function emitFx(mgr: MobManager, fx: MobFxEvent, callbacks?: MobStepCallbacks): void {
  mgr.fxQueue.push(fx);
  callbacks?.onFx?.(fx);
}

function clearMobTelegraphs(mgr: MobManager, mobId: string): void {
  mgr.telegraphs.delete(mobId);
}

function setMobTelegraph(mgr: MobManager, mobId: string, entry: MobTelegraphEntry): void {
  mgr.telegraphs.set(mobId, [entry]);
}

function setMobTelegraphs(mgr: MobManager, mobId: string, entries: MobTelegraphEntry[]): void {
  mgr.telegraphs.set(mobId, entries);
}

function damageMobTarget(
  target: MobCombatEntity,
  hit: BansungDamageHit,
  sourceMob: MobState | undefined,
  callbacks?: MobStepCallbacks,
): BansungDamageResult {
  if (sourceMob && target.team === 0 && callbacks?.onDamagePlayer) {
    const custom = callbacks.onDamagePlayer(target, hit, sourceMob);
    if (custom) return custom;
  }
  return applyBansungDamage(target, hit, callbacks?.damageCtx);
}

function syncFlockProxyIn(
  mob: MobState,
  targetNumIdById?: ReadonlyMap<string, number>,
): void {
  const p = mob.flockProxy;
  p.x = mob.x;
  p.y = mob.y;
  p.radius = mob.radius;
  p.team = mob.team;
  p.layer = mob.layer;
  p.alive = mob.alive;
  const slowFactor = (mob.slowMs ?? 0) > 0 ? Math.max(0.25, 1 - Math.min(0.75, mob.slowPct ?? 0)) : 1;
  const effSpeed = mob.speed * slowFactor;
  p.speed = effSpeed;
  p.moveSpeed = effSpeed;
  p.mass = mob.mass;
  p.state = mob.state;
  p.knockVx = mob.knockVx;
  p.knockVy = mob.knockVy;
  p.stunned = (mob.stunMs ?? 0) > 0 || mob.state === 'stunned';
  p.stunMs = mob.stunMs;
  p.stationary =
    mob.stationary ||
    mob.state === 'windup' ||
    mob.state === 'attack' ||
    mob.state === 'recover' ||
    mob.state === 'lunge' ||
    mob.state === 'stunned';
  p.attackCooldown = mob.attackCooldown;
  p.cooldownTicks = mob.cooldownTicks;
  p.sepWeightScale = mob.sepWeightScale;
  p.steerBiasX = mob.steerBiasX;
  p.steerBiasY = mob.steerBiasY;
  p.facingLeft = mob.facingLeft;
  p.actualSpeed = mob.actualSpeed;
  if (mob.targetId && targetNumIdById) {
    const targetNumId = targetNumIdById.get(mob.targetId);
    if (targetNumId !== undefined) {
      p.lockedTargetId = targetNumId;
      mob.flock.targetId = targetNumId;
    } else {
      p.lockedTargetId = undefined;
    }
  } else {
    p.lockedTargetId = undefined;
    if (!mob.targetId) mob.flock.targetId = -1;
  }
}

function syncFlockProxyOut(mob: MobState): void {
  const p = mob.flockProxy;
  mob.x = p.x;
  mob.y = p.y;
  mob.knockVx = p.knockVx ?? 0;
  mob.knockVy = p.knockVy ?? 0;
  if (
    !mob.stationary &&
    mob.state !== 'windup' &&
    mob.state !== 'attack' &&
    mob.state !== 'recover' &&
    mob.state !== 'lunge' &&
    mob.state !== 'fuse' &&
    mob.state !== 'stunned' &&
    (mob.stunMs ?? 0) <= 0
  ) {
    mob.facingLeft = Boolean(p.facingLeft);
  }
  mob.actualSpeed = p.actualSpeed ?? 0;
  mob.spatialActor.x = mob.x;
  mob.spatialActor.y = mob.y;
  mob.spatialActor.alive = mob.alive;
}

function buildTargetByNumId(targets: readonly MobCombatEntity[]): Map<number, MobCombatEntity> {
  const map = new Map<number, MobCombatEntity>();
  for (let i = 0; i < targets.length; i++) {
    map.set(targets[i].numId, targets[i]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Manager Creation & Spawning
// ---------------------------------------------------------------------------

/** Starting numeric ID for mobs, strictly disjoint from player actorIds (1000..1999) and boss/gadget spatial ranges. */
export const MOB_INITIAL_NUM_ID = 1_000_000;

/** Create a clean MobManager for a room or standalone simulation. */
export function createMobManager(opts?: {
  mapW?: number;
  mapH?: number;
  rng?: () => number;
}): MobManager {
  const mapW = opts?.mapW ?? BANSUNG_MAP_W;
  const mapH = opts?.mapH ?? BANSUNG_MAP_H;
  return {
    mobs: [],
    mobById: new Map(),
    mobByNumId: new Map(),
    projectiles: [],
    telegraphs: new Map(),
    hazards: [],
    fxQueue: [],
    prevTargetPos: new Map(),
    emptyObsGrid: new ObstacleGrid([], mapW, mapH),
    emptyActorGrid: new ActorGrid(mapW, mapH),
    nextNumId: MOB_INITIAL_NUM_ID,
    nextProjId: 1,
    nextTelegraphId: 1,
    nextHazardId: 1,
    mapW,
    mapH,
    rng: opts?.rng ?? Math.random,
  };
}

/** Resolve whether an enemy kind string belongs to one of the 8 non-boss mobs. */
export function isMobArchetype(rawKind: string): boolean {
  const canonical = resolveBansungEnemyId(rawKind);
  if (!canonical) return false;
  return (BANSUNG_MOB_IDS as readonly string[]).includes(canonical);
}

/** Return the `SpatialActor` handle (`id: mob.numId`) for `ActorGrid` insertion. */
export function toMobSpatialActor(mob: MobState): SpatialActor {
  mob.spatialActor.x = mob.x;
  mob.spatialActor.y = mob.y;
  mob.spatialActor.alive = mob.alive;
  return mob.spatialActor;
}

/**
 * Spawn a non-boss mob into `mgr`.
 * Accepts canonical names (`bomb_goblin`, `cactus_brute`) or spec aliases (`bomber`, `brute`).
 */
export function spawnMob(mgr: MobManager, opts: SpawnMobOptions): MobState {
  const resolved = resolveBansungEnemyId(opts.kind);
  if (!resolved || !(BANSUNG_MOB_IDS as readonly string[]).includes(resolved)) {
    throw new Error(`Unsupported mob kind: "${opts.kind}"`);
  }
  const kind = resolved as BansungMobId;
  const stats = BANSUNG_ENEMIES[kind];
  const isElite = Boolean(opts.elite || opts.eliteAffix);
  const isEvolved = Boolean(opts.evolved);
  const radScale =
    opts.scaleMult !== undefined && opts.scaleMult > 0
      ? opts.scaleMult
      : isEvolved
        ? 1.15
        : 1;
  const radius =
    radScale !== 1
      ? Math.max(stats.radius + (radScale > 1 ? 2 : 0), Math.round(stats.radius * radScale))
      : stats.radius;
  const mass = radScale !== 1 ? stats.mass * radScale : stats.mass;

  const numId = opts.numId ?? mgr.nextNumId++;
  if (numId >= mgr.nextNumId) mgr.nextNumId = numId + 1;
  const id = opts.id ?? `mob_${numId}`;

  const playerCount = opts.playerCount ?? 1;
  const wave = opts.wave ?? 1;
  const rawMobLevel = opts.mobLevel ?? (opts.wave !== undefined ? computeMobLevelFromWave(wave) : 1);
  const lvScaling = computeMobLevelScaling(rawMobLevel);
  const defaultHpMult =
    (opts.playerCount !== undefined || opts.wave !== undefined || opts.difficulty !== undefined
      ? computeMobHpMult(wave, playerCount, opts.difficulty)
      : 1) * (isElite ? MOB_ELITE_DEFAULTS.hpMult : 1);
  const defaultDmgMult =
    opts.playerCount !== undefined || opts.wave !== undefined || opts.difficulty !== undefined
      ? computeMobDmgMult(wave, opts.difficulty)
      : 1;

  const hpMult = (opts.hpMult ?? defaultHpMult) * lvScaling.hpMult;
  const dmgMult = (opts.dmgMult ?? defaultDmgMult) * lvScaling.dmgMult;
  const speedMult = (opts.speedMult ?? 1) * lvScaling.speedMult;
  const enrageSpeedMult = opts.enrageSpeedMult ?? 1;
  const cdMult = isElite ? MOB_ELITE_DEFAULTS.cdMult : 1;

  const maxHp = Math.max(1, Math.round(stats.hp * hpMult));
  const baseSpeed = stats.speed * speedMult;
  const initialSpeed = baseSpeed * (opts.enraged ? enrageSpeedMult : 1);
  const flatArmor = Math.max(0, stats.armor + (opts.armorAdd ?? 0) + lvScaling.armorBonus);
  const armorType = opts.armorType ?? stats.armorType;
  const clampedX = clampPlayableX(opts.x, radius, mgr.mapW);
  const clampedY = clampPlayableY(opts.y, radius, mgr.mapH);
  const team = opts.team ?? 1;
  const flock = createEnemyFlockState(numId, clampedX, clampedY);

  const flockProxy: FlockEnemy = {
    id: numId,
    x: clampedX,
    y: clampedY,
    radius,
    team,
    layer: LAYER_ENEMY,
    alive: true,
    kind,
    role: stats.role,
    speed: initialSpeed,
    moveSpeed: initialSpeed,
    mass,
    preferredRange: stats.preferredRange,
    backoffDist: stats.backoffDist,
    state: 'chase',
    flock,
    knockVx: 0,
    knockVy: 0,
    stunned: false,
    stunMs: 0,
    stationary: false,
    attackCooldown: 0,
    cooldownTicks: 0,
    sepWeightScale: 1,
    steerBiasX: 0,
    steerBiasY: 0,
    facingLeft: false,
    actualSpeed: 0,
  };

  const spatialActor: SpatialActor = {
    id: numId,
    x: clampedX,
    y: clampedY,
    radius,
    team,
    layer: LAYER_ENEMY,
    alive: true,
  };

  const mob: MobState = {
    id,
    numId,
    kind,
    role: stats.role,
    tier: isElite ? 'elite' : 'mob',
    team,
    layer: LAYER_ENEMY,
    x: clampedX,
    y: clampedY,
    radius,
    mass,
    speed: initialSpeed,
    baseSpeed,
    kbResist: stats.kbResist,
    stunMult: stats.stunMult,
    armorType,
    flatArmor,
    damageReduction: Math.min(
      0.52,
      Number(
        (
          (armorType === 'armored' ? 0.14 : stats.role === 'brute' ? 0.12 : 0.04) +
          Math.min(0.26, Math.max(0, lvScaling.level - 1) * 0.024) +
          (isElite ? 0.12 : isEvolved ? 0.06 : 0)
        ).toFixed(3),
      ),
    ),
    hp: maxHp,
    maxHp,
    shield: 0,
    maxShield: 0,
    alive: true,

    elite: isElite,
    evolved: isEvolved,
    level: lvScaling.level,
    eliteAffix: opts.eliteAffix,
    dmgMult,
    cdMult,
    enraged: Boolean(opts.enraged),
    enrageSpeedMult,
    deathNova: opts.deathNova,

    state: 'chase',
    stateTicks: 0,
    cooldownTicks: 0,
    attackCooldown: 0,
    aimAngle: 0,
    facingLeft: false,
    stationary: false,
    sepWeightScale: 1,
    steerBiasX: 0,
    steerBiasY: 0,
    knockVx: 0,
    knockVy: 0,
    actualSpeed: 0,
    flock,
    flockProxy,
    spatialActor,

    preferredRange: stats.preferredRange,
    backoffDist: stats.backoffDist,

    threatUntilTick: -1,
    pendingAttack: 'none',
    lungeCooldownTicks: 0,
    lungeHitDone: false,
    fuseCooldownTicks: 0,
    armTicks: 0,
    slamCooldownTicks: 0,
    thornyHideIcdByTarget: new Map(),
    contactIcdByTarget: new Map(),
    sniperTick: 0,
    burstRemaining: 0,
    burstDelayTicks: 0,
    castCount: 0,
    predTargetX: clampedX,
    predTargetY: clampedY,
    stormPoints: [],
  };

  mgr.mobs.push(mob);
  mgr.mobById.set(mob.id, mob);
  mgr.mobByNumId.set(mob.numId, mob);
  return mob;
}

/**
 * Convenience adapter for `director.ts` `DirectorMobSpawn` payloads.
 * Preserves director-computed `hpMult`, `dmgMult`, `speedMult`, `armorAdd`,
 * `armorType`, `elite` affix, and `deathNova` without double-scaling `1.8x`.
 */
export function spawnMobFromDirector(
  mgr: MobManager,
  spawn: DirectorSpawnPayload,
  extra?: { team?: number; numId?: number },
): MobState {
  return spawnMob(mgr, {
    id: spawn.id,
    numId: extra?.numId,
    kind: spawn.kind,
    x: spawn.x,
    y: spawn.y,
    team: extra?.team,
    elite: Boolean(spawn.elite),
    evolved: Boolean(spawn.evolved),
    eliteAffix: spawn.elite,
    hpMult: spawn.hpMult ?? (spawn.elite ? MOB_ELITE_DEFAULTS.hpMult : 1),
    dmgMult: spawn.dmgMult ?? 1,
    speedMult: spawn.speedMult ?? 1,
    scaleMult: spawn.scaleMult,
    armorAdd: spawn.armorAdd,
    mobLevel: spawn.mobLevel,
    armorType: spawn.armorType,
    deathNova: spawn.deathNova,
  });
}

// ---------------------------------------------------------------------------
// Damage, Stun Interrupts, Defusal & Thorny Hide
// ---------------------------------------------------------------------------

/** Cancel any active telegraph/cast/lunge/fuse on stun or death. */
function cancelMobChanneling(
  mgr: MobManager,
  mob: MobState,
  reason: 'stun' | 'death',
): void {
  const wasFusing = mob.state === 'fuse';
  const wasCasting =
    mob.state === 'windup' ||
    mob.state === 'attack' ||
    mob.state === 'recover' ||
    mob.burstRemaining > 0;

  clearMobTelegraphs(mgr, mob.id);
  mob.burstRemaining = 0;
  mob.burstDelayTicks = 0;
  mob.stormPoints.length = 0;
  mob.sepWeightScale = 1;
  mob.stationary = false;

  if (reason === 'death') {
    // Bomb Goblin killed during fuse defuses safely without exploding!
    mob.state = 'dead';
    mob.pendingAttack = 'none';
    mob.spatialActor.alive = false;
    return;
  }

  // Stun interrupt transitions into 'stunned' and applies appropriate cooldowns.
  if (wasFusing && mob.kind === 'bomb_goblin') {
    mob.fuseCooldownTicks = BANSUNG_MELEE_SPECIALS.bomb_goblin.stunFuseResetCdTicks;
  } else if (wasCasting || mob.state === 'lunge') {
    const baseCd = BANSUNG_ENEMIES[mob.kind].cooldownTicks;
    const interruptedCd = Math.max(
      1,
      Math.round(getEffectiveCd(baseCd, mob) * MOB_STUN_INTERRUPT_CD_MULT),
    );
    mob.cooldownTicks = Math.max(mob.cooldownTicks, interruptedCd);
    if (mob.pendingAttack === 'brute_slam') {
      mob.slamCooldownTicks = Math.max(
        mob.slamCooldownTicks,
        Math.round(
          getEffectiveCd(BANSUNG_MELEE_SPECIALS.cactus_brute.slamCdTicks, mob) *
            MOB_STUN_INTERRUPT_CD_MULT,
        ),
      );
    } else if (mob.pendingAttack === 'skirmisher_lunge' || mob.state === 'lunge') {
      mob.lungeCooldownTicks = Math.max(
        mob.lungeCooldownTicks,
        Math.round(
          getEffectiveCd(BANSUNG_MELEE_SPECIALS.skirmisher.lungeCdTicks, mob) *
            MOB_STUN_INTERRUPT_CD_MULT,
        ),
      );
    }
  }

  mob.pendingAttack = 'none';
  mob.state = 'stunned';
  mob.speed = mob.baseSpeed * (mob.enraged ? mob.enrageSpeedMult : 1);
}

/**
 * Trigger `cactus_brute` Thorny Hide melee reflect against an attacker.
 * Enforces `thornyHideRange` (`28 px` clearance) and `0.5s` (15t) per-target ICD.
 * Safe to invoke directly from hero melee weapons as well as `applyMobDamage`.
 */
export function triggerThornyHide(
  mgr: MobManager,
  mob: MobState,
  attacker: MobCombatEntity,
  tick: number,
  callbacks?: MobStepCallbacks,
): BansungDamageResult | null {
  if (!mob.alive || mob.kind !== 'cactus_brute' || !isTargetValid(attacker)) {
    return null;
  }
  const spec = BANSUNG_MELEE_SPECIALS.cactus_brute;
  const dist = Math.hypot(attacker.x - mob.x, attacker.y - mob.y);
  const edgeDist = Math.max(0, dist - mob.radius - (attacker.radius ?? 0));
  if (edgeDist > spec.thornyHideRange) return null;

  const icdTicks = Math.round(spec.thornyHideIcdS * BANSUNG_TICK_HZ);
  const readyAt = mob.thornyHideIcdByTarget.get(attacker.id) ?? -Infinity;
  if (tick < readyAt) return null;

  mob.thornyHideIcdByTarget.set(attacker.id, tick + icdTicks);
  const hit: BansungDamageHit = {
    baseDmg: spec.thornyHideDmg,
    dmgKind: 'pierce',
    attackerId: mob.id,
  };
  const res = damageMobTarget(attacker, hit, mob, callbacks);
  if (res.totalDmg > 0) {
    emitFx(
      mgr,
      {
        type: FX_IMPACT,
        subKind: BANSUNG_FX_IMPACT_FLESH,
        x: attacker.x,
        y: attacker.y,
        value: res.totalDmg,
        kind: 'thorny_hide',
        sourceId: mob.id,
        targetId: attacker.id,
      },
      callbacks,
    );
  }
  return res;
}

/** Handle death cleanup (safe fuse defusal, optional Volatile death nova, FX). */
function handleMobDeath(
  mgr: MobManager,
  mob: MobState,
  killerId: string | undefined,
  targets: readonly MobCombatEntity[] | undefined,
  obsGrid: ObstacleGrid | null | undefined,
  actorGrid: ActorGrid | null | undefined,
  callbacks?: MobStepCallbacks,
): void {
  cancelMobChanneling(mgr, mob, 'death');
  mob.alive = false;
  mob.hp = 0;

  emitFx(
    mgr,
    { type: FX_DEATH, x: mob.x, y: mob.y, sourceId: killerId, targetId: mob.id, kind: mob.kind },
    callbacks,
  );

  // Director volatile elite affix death nova (distinct from Bomb Goblin fuse explosion).
  if (mob.deathNova && mob.deathNova.radius > 0 && mob.deathNova.damage > 0) {
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_VOLATILE,
        x: mob.x,
        y: mob.y,
        value: mob.deathNova.radius,
        kind: 'volatile_nova',
        sourceId: mob.id,
      },
      callbacks,
    );
    const hitTargets = gatherAoeTargets(
      actorGrid,
      obsGrid,
      targets ?? [],
      mob.x,
      mob.y,
      mob.deathNova.radius,
      'los',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hitTargets) {
      if (!isTargetValid(h.target) || h.target.team === mob.team) continue;
      damageMobTarget(
        h.target,
        {
          baseDmg: mob.deathNova.damage,
          dmgKind: 'explosive',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
    }
  }

  callbacks?.onMobKilled?.(mob, killerId);
}

/**
 * Apply damage to a mob through `damage.ts`, updating threat priority (-60 px bonus),
 * Thorny Hide melee reflection, optional stun + stun-interrupt, and safe fuse defusal on death.
 */
export function applyMobDamage(
  mgr: MobManager,
  mob: MobState,
  hit: BansungDamageHit,
  opts?: {
    tick?: number;
    attacker?: MobCombatEntity;
    isMelee?: boolean;
    sourceX?: number;
    sourceY?: number;
    knockbackSpeed?: number;
    stunMs?: number;
    targets?: readonly MobCombatEntity[];
    obsGrid?: ObstacleGrid | null;
    actorGrid?: ActorGrid | null;
    callbacks?: MobStepCallbacks;
  },
): BansungDamageResult {
  const tick = opts?.tick ?? 0;
  const result = applyBansungDamage(mob, hit, opts?.callbacks?.damageCtx);

  if (result.totalDmg > 0 && hit.attackerId) {
    mob.lastDamagedBy = hit.attackerId;
    mob.threatTargetId = hit.attackerId;
    mob.threatUntilTick = tick + MOB_THREAT_DURATION_TICKS;
  }

  // Knockback scaled by `mob.kbResist` (`cactus_brute` has 0.65 resistance).
  const srcX = opts?.sourceX ?? opts?.attacker?.x;
  const srcY = opts?.sourceY ?? opts?.attacker?.y;
  if (
    opts?.knockbackSpeed &&
    opts.knockbackSpeed > 0 &&
    mob.alive &&
    srcX !== undefined &&
    srcY !== undefined
  ) {
    const dx = mob.x - srcX;
    const dy = mob.y - srcY;
    const d = Math.hypot(dx, dy);
    if (d > 1e-4) {
      const k = opts.knockbackSpeed * Math.max(0, 1 - mob.kbResist);
      mob.knockVx += (dx / d) * k;
      mob.knockVy += (dy / d) * k;
    }
  }

  // Thorny Hide reflect triggers on melee contact within range.
  if (opts?.attacker && (opts.isMelee || hit.dmgKind === 'melee')) {
    triggerThornyHide(mgr, mob, opts.attacker, tick, opts.callbacks);
  }

  if (result.killed || !mob.alive || mob.hp <= 0) {
    handleMobDeath(
      mgr,
      mob,
      hit.attackerId,
      opts?.targets,
      opts?.obsGrid,
      opts?.actorGrid,
      opts?.callbacks,
    );
    return result;
  }

  if (opts?.stunMs && opts.stunMs > 0) {
    stunMob(mgr, mob, opts.stunMs, opts.callbacks?.statusCtx);
  }

  return result;
}

/**
 * Apply stun with diminishing returns (`damage.ts`) and trigger immediate
 * stun-interrupt on `bomb_goblin` fuse and ranged/caster telegraphs & casts.
 */
export function stunMob(
  mgr: MobManager,
  mob: MobState,
  rawMs: number,
  opts?: BansungStunOptions,
): number {
  if (!mob.alive || rawMs <= 0) return 0;
  const applied = applyStunWithDR(mob, rawMs, {
    ...opts,
    entityStunMult: (opts?.entityStunMult ?? 1) * mob.stunMult,
  });
  if (applied > 0 || (mob.stunMs ?? 0) > 0) {
    cancelMobChanneling(mgr, mob, 'stun');
  }
  return applied;
}

/** Trigger straggler enrage boost (`director.ts` straggler rule). */
export function setMobEnraged(mob: MobState, enraged: boolean, speedMult = 1.2): void {
  mob.enraged = enraged;
  mob.enrageSpeedMult = speedMult;
  if (mob.state !== 'fuse' && mob.alive) {
    mob.speed = mob.baseSpeed * (enraged ? speedMult : 1);
  }
}

// ---------------------------------------------------------------------------
// Target Selection (with -60 px Recent-Attacker Tie-Breaker)
// ---------------------------------------------------------------------------

function pickBestTargetForMob(
  mob: MobState,
  targets: readonly MobCombatEntity[],
  tick: number,
): { target: MobCombatEntity; dist: number; dx: number; dy: number } | null {
  let best: MobCombatEntity | null = null;
  let bestScore = Infinity;
  let bestDist = Infinity;
  let bestDx = 0;
  let bestDy = 0;

  const threatId = mob.threatUntilTick >= tick ? mob.threatTargetId : undefined;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!isTargetValid(t) || t.team === mob.team) continue;
    const dx = t.x - mob.x;
    const dy = t.y - mob.y;
    const dist = Math.hypot(dx, dy);
    const threatBias = threatId && t.id === threatId ? MOB_THREAT_OFFSET_PX : 0;
    const score = dist + threatBias + (t.scoreOffset ?? 0);
    if (score < bestScore) {
      bestScore = score;
      best = t;
      bestDist = dist;
      bestDx = dx;
      bestDy = dy;
    }
  }

  if (!best) return null;
  return { target: best, dist: bestDist, dx: bestDx, dy: bestDy };
}

function findNearestAliveTarget(
  x: number,
  y: number,
  team: number,
  targets: readonly MobCombatEntity[],
): { target: MobCombatEntity; dist: number } | null {
  let best: MobCombatEntity | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!isTargetValid(t) || t.team === team) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best ? { target: best, dist: bestDist } : null;
}

// ---------------------------------------------------------------------------
// Projectile & Hazard Spawning
// ---------------------------------------------------------------------------

function spawnMobProjectile(
  mgr: MobManager,
  mob: MobState,
  obsGrid: ObstacleGrid | null | undefined,
  params: {
    kind: MobProjectileKind;
    angle: number;
    speed: number;
    radius: number;
    ttlTicks: number;
    dmg: number;
    dmgKind: BansungDamageKind;
    armorPiercePct?: number;
    knockbackSpeed?: number;
    maxDist?: number;
    destructibleByMelee?: boolean;
    splashRadius?: number;
    edgeDmg?: number;
    spawnsFirePool?: boolean;
    appliesBurn?: boolean;
    burnDps?: number;
    burnDurationS?: number;
    wobbleAmp?: number;
    wobbleFreq?: number;
    wobblePhase?: number;
    slowPct?: number;
    slowMs?: number;
    microStunMs?: number;
    dotKind?: 'poison' | 'burn' | 'bleed';
    dotTickDmg?: number;
    dotDurMs?: number;
  },
): MobProjectile | null {
  const cos = Math.cos(params.angle);
  const sin = Math.sin(params.angle);
  const muzzleOffset = mob.radius + params.radius + 2;
  const mx = mob.x + cos * muzzleOffset;
  const my = mob.y + sin * muzzleOffset;

  if (obsGrid) {
    const guardHit = checkMuzzleWallGuard(obsGrid, mob.x, mob.y, mx, my, params.radius, 'bullet');
    if (guardHit) {
      // Primary fireball detonates immediately against wall if clipped at muzzle.
      if (params.kind === 'fireball' || params.kind === 'fireball_split') {
        const proj: MobProjectile = {
          id: mgr.nextProjId++,
          ownerMobId: mob.id,
          ownerNumId: mob.numId,
          team: mob.team,
          kind: params.kind,
          x: guardHit.x,
          y: guardHit.y,
          vx: cos * params.speed,
          vy: sin * params.speed,
          baseAngle: params.angle,
          speed: params.speed,
          radius: params.radius,
          dmg: params.dmg,
          dmgKind: params.dmgKind,
          armorPiercePct: params.armorPiercePct ?? 0,
          knockbackSpeed: params.knockbackSpeed ?? 0,
          maxDist: 0,
          distTraveled: 0,
          ttlTicks: 1,
          ageTicks: 0,
          destructibleByMelee: Boolean(params.destructibleByMelee),
          splashRadius: params.splashRadius ?? 0,
          edgeDmg: params.edgeDmg ?? params.dmg,
          spawnsFirePool: Boolean(params.spawnsFirePool),
          appliesBurn: Boolean(params.appliesBurn),
          burnDps: params.burnDps ?? 0,
          burnDurationS: params.burnDurationS ?? 0,
          wobbleAmp: 0,
          wobbleFreq: 0,
          wobblePhase: 0,
          slowPct: 0,
          slowMs: 0,
          microStunMs: 0,
        };
        mgr.projectiles.push(proj);
        return proj;
      }
      return null;
    }
  }

  const proj: MobProjectile = {
    id: mgr.nextProjId++,
    ownerMobId: mob.id,
    ownerNumId: mob.numId,
    team: mob.team,
    kind: params.kind,
    x: mx,
    y: my,
    vx: cos * params.speed,
    vy: sin * params.speed,
    baseAngle: params.angle,
    speed: params.speed,
    radius: params.radius,
    dmg: params.dmg,
    dmgKind: params.dmgKind,
    armorPiercePct: params.armorPiercePct ?? 0,
    knockbackSpeed: params.knockbackSpeed ?? 0,
    maxDist: params.maxDist ?? Infinity,
    distTraveled: 0,
    ttlTicks: params.ttlTicks,
    ageTicks: 0,
    destructibleByMelee: Boolean(params.destructibleByMelee),
    splashRadius: params.splashRadius ?? 0,
    edgeDmg: params.edgeDmg ?? params.dmg,
    spawnsFirePool: Boolean(params.spawnsFirePool),
    appliesBurn: Boolean(params.appliesBurn),
    burnDps: params.burnDps ?? 0,
    burnDurationS: params.burnDurationS ?? 0,
    wobbleAmp: params.wobbleAmp ?? 0,
    wobbleFreq: params.wobbleFreq ?? 0,
    wobblePhase: params.wobblePhase ?? 0,
    slowPct: params.slowPct ?? 0,
    slowMs: params.slowMs ?? 0,
    microStunMs: params.microStunMs ?? 0,
    dotKind: params.dotKind,
    dotTickDmg: params.dotTickDmg,
    dotDurMs: params.dotDurMs,
  };
  mgr.projectiles.push(proj);
  return proj;
}

function queueSingleCircleTelegraph(
  mgr: MobManager,
  mob: MobState,
  x: number,
  y: number,
  r: number,
  color: 0 | 1 | 2 | 3 | 4,
  danger?: 0 | 1,
  label?: string,
): void {
  setMobTelegraph(mgr, mob.id, {
    id: mgr.nextTelegraphId++,
    ownerMobId: mob.id,
    kind: TELEGRAPH_KIND_CIRCLE,
    x0: x,
    y0: y,
    x1: x,
    y1: y,
    r,
    phase: 0,
    color,
    prog: 0,
    shape: 'circle',
    active: false,
    sourceKind: mob.kind,
    ...(danger ? { danger } : {}),
    ...(label ? { label } : {}),
  });
}

function queueSingleLineTelegraph(
  mgr: MobManager,
  mob: MobState,
  obsGrid: ObstacleGrid | null | undefined,
  angle: number,
  range: number,
  halfW: number,
  color: 0 | 1 | 2 | 3 | 4,
): void {
  const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, angle, range);
  setMobTelegraph(mgr, mob.id, {
    id: mgr.nextTelegraphId++,
    ownerMobId: mob.id,
    kind: TELEGRAPH_KIND_LINE,
    x0: mob.x,
    y0: mob.y,
    x1: end.x,
    y1: end.y,
    r: halfW,
    phase: 0,
    color,
    prog: 0,
    shape: 'line',
    halfW,
    active: false,
    sourceKind: mob.kind,
  });
}

function spawnFirePoolHazard(
  mgr: MobManager,
  ownerMobId: string,
  team: number,
  x: number,
  y: number,
  tick: number,
  dmgMult: number,
  custom?: {
    radius?: number;
    ttlTicks?: number;
    tickInterval?: number;
    tickDmg?: number;
    dmgKind?: BansungDamageKind;
  },
): MobHazard {
  const pyroSpec = BANSUNG_RANGED_ATTACKS.pyro_shaman;
  // Evict oldest active pool(s) owned by this caster to enforce maxPoolsPerCaster = 2.
  while (true) {
    let ownedCount = 0;
    let oldestIdx = -1;
    let oldestTick = Infinity;
    for (let i = 0; i < mgr.hazards.length; i++) {
      const h = mgr.hazards[i];
      if (h.ownerMobId !== ownerMobId) continue;
      ownedCount++;
      if (h.createdTick < oldestTick) {
        oldestTick = h.createdTick;
        oldestIdx = i;
      }
    }
    if (ownedCount < pyroSpec.maxPoolsPerCaster || oldestIdx < 0) break;
    mgr.hazards.splice(oldestIdx, 1);
  }

  const radius = custom?.radius ?? pyroSpec.firePoolRadius;
  const tickInterval = custom?.tickInterval ?? pyroSpec.firePoolTickInterval;
  const hazard: MobHazard = {
    id: mgr.nextHazardId++,
    kind: 'fire_pool',
    ownerMobId,
    team,
    x: clampPlayableX(x, radius * 0.5, mgr.mapW),
    y: clampPlayableY(y, radius * 0.5, mgr.mapH),
    r: radius,
    ttlTicks: custom?.ttlTicks ?? pyroSpec.firePoolTtlTicks,
    tickInterval,
    tickDmg: custom?.tickDmg ?? Math.max(1, Math.round(pyroSpec.firePoolTickDmg * dmgMult)),
    dmgKind: custom?.dmgKind ?? 'fire',
    ticksUntilPulse: tickInterval,
    createdTick: tick,
  };
  mgr.hazards.push(hazard);
  return hazard;
}

// ---------------------------------------------------------------------------
// AoE Shared Query & Detonation Helpers
// ---------------------------------------------------------------------------

function gatherAoeTargets(
  actorGrid: ActorGrid | null | undefined,
  obsGrid: ObstacleGrid | null | undefined,
  targets: readonly MobCombatEntity[],
  cx: number,
  cy: number,
  radius: number,
  losMode: 'los' | 'none',
  layerMask: number,
  fallbackObsGrid: ObstacleGrid,
): Array<{ target: MobCombatEntity; dist: number }> {
  if (actorGrid) {
    const byNumId = buildTargetByNumId(targets);
    const hits: AoeTarget[] = [];
    queryAoeTargets(actorGrid, obsGrid ?? fallbackObsGrid, cx, cy, radius, losMode, layerMask, hits);
    const out: Array<{ target: MobCombatEntity; dist: number }> = [];
    for (const h of hits) {
      const resolved = byNumId.get(h.actor.id);
      if (resolved) {
        out.push({ target: resolved, dist: Math.hypot(resolved.x - cx, resolved.y - cy) });
      }
    }
    return out;
  }

  const out: Array<{ target: MobCombatEntity; dist: number }> = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive || (t.layer & layerMask) === 0) continue;
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d > radius + t.radius) continue;
    if (losMode === 'los' && !hasClearLos(obsGrid, cx, cy, t.x, t.y, 'los')) continue;
    out.push({ target: t, dist: d });
  }
  return out;
}

function damageObstaclesInRadius(
  obsGrid: ObstacleGrid | null | undefined,
  cx: number,
  cy: number,
  radius: number,
  damage: number,
  sourceMob: MobState,
  dmgKind: BansungDamageKind,
  callbacks?: MobStepCallbacks,
): void {
  if (!obsGrid || !callbacks?.onDamageObstacle) return;
  const obsHits: AoeObstacleTarget[] = [];
  queryAoeObstacles(obsGrid, cx, cy, radius, 'los', obsHits);
  for (const h of obsHits) {
    callbacks.onDamageObstacle(h.obstacle, damage, sourceMob, dmgKind);
  }
}

/** Detonate `bomb_goblin` with 88px LOS-checked AoE + friendly fire to allied mobs. */
function detonateBombGoblin(
  mgr: MobManager,
  mob: MobState,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  enemyGrid: ActorGrid | null | undefined,
  callbacks?: MobStepCallbacks,
): void {
  const spec = BANSUNG_MELEE_SPECIALS.bomb_goblin;
  clearMobTelegraphs(mgr, mob.id);
  mob.sepWeightScale = 1;
  mob.stationary = false;
  mob.pendingAttack = 'none';
  mob.alive = false;
  mob.hp = 0;
  mob.state = 'dead';
  mob.spatialActor.alive = false;

  emitFx(
    mgr,
    {
      type: FX_BLAST,
      subKind: BANSUNG_FX_BLAST_HE,
      x: mob.x,
      y: mob.y,
      value: spec.blastRadius,
      kind: 'bomb_goblin',
      sourceId: mob.id,
    },
    callbacks,
  );
  emitFx(mgr, { type: FX_DEATH, x: mob.x, y: mob.y, sourceId: mob.id, targetId: mob.id, kind: mob.kind }, callbacks);

  const heroDmgFull = getScaledDmg(BANSUNG_ENEMIES.bomb_goblin.damage, mob);
  const friendlyDmg = getScaledDmg(spec.friendlyFireDmg, mob);

  // Damage heroes / pets / turrets with distance falloff (40 px full -> 0.5x at 88 px).
  const enemyTeamHits = gatherAoeTargets(
    targetGrid,
    obsGrid,
    targets,
    mob.x,
    mob.y,
    spec.blastRadius,
    'los',
    LAYER_PLAYER | LAYER_PET,
    mgr.emptyObsGrid,
  );
  for (const h of enemyTeamHits) {
    const tgt = h.target;
    if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
    const falloff =
      h.dist <= spec.innerFullRadius
        ? 1
        : Math.max(
            spec.minFalloffRatio,
            1 -
              ((h.dist - spec.innerFullRadius) / (spec.blastRadius - spec.innerFullRadius)) *
                (1 - spec.minFalloffRatio),
          );
    const dmg = Math.max(1, Math.round(heroDmgFull * falloff));
    damageMobTarget(
      tgt,
      {
        baseDmg: dmg,
        dmgKind: 'explosive',
        attackerId: mob.id,
      },
      mob,
      callbacks,
    );
    applyKnockbackToEntity(tgt, mob.x, mob.y, spec.knockbackSpeed, mob, callbacks);
  }

  // Friendly fire to nearby allied enemy mobs (14 dmg + knockback, LOS-checked).
  const alliedMobs: MobState[] = [];
  if (enemyGrid) {
    const tmp: AoeTarget[] = [];
    queryAoeTargets(enemyGrid, obsGrid ?? mgr.emptyObsGrid, mob.x, mob.y, spec.blastRadius, 'los', LAYER_ENEMY, tmp);
    for (const h of tmp) {
      const ally = mgr.mobByNumId.get(h.actor.id);
      if (ally && ally.id !== mob.id && ally.alive && ally.team === mob.team) {
        alliedMobs.push(ally);
      }
    }
  } else {
    for (const other of mgr.mobs) {
      if (other.id === mob.id || !other.alive || other.team !== mob.team) continue;
      const dist = Math.hypot(other.x - mob.x, other.y - mob.y);
      if (dist > spec.blastRadius + other.radius) continue;
      if (!hasClearLos(obsGrid, mob.x, mob.y, other.x, other.y, 'los')) continue;
      alliedMobs.push(other);
    }
  }

  for (const ally of alliedMobs) {
    applyMobDamage(
      mgr,
      ally,
      {
        baseDmg: friendlyDmg,
        dmgKind: 'explosive',
        attackerId: mob.id,
      },
      {
        sourceX: mob.x,
        sourceY: mob.y,
        knockbackSpeed: spec.knockbackSpeed,
        targets,
        obsGrid,
        actorGrid: targetGrid,
        callbacks,
      },
    );
  }

  damageObstaclesInRadius(obsGrid, mob.x, mob.y, spec.blastRadius, heroDmgFull, mob, 'explosive', callbacks);
  callbacks?.onMobKilled?.(mob, mob.lastDamagedBy);
}

// ---------------------------------------------------------------------------
// Per-Archetype AI Decisions & Execution
// ---------------------------------------------------------------------------

function startWindup(
  mob: MobState,
  windupTicks: number,
  pendingAttack: MobState['pendingAttack'],
  aimAngle: number,
): void {
  mob.state = 'windup';
  mob.stateTicks = windupTicks;
  mob.pendingAttack = pendingAttack;
  mob.aimAngle = aimAngle;
  mob.facingLeft = Math.cos(aimAngle) < 0;
  mob.stationary = true;
  mob.steerBiasX = 0;
  mob.steerBiasY = 0;
}

function finishToCooldown(mob: MobState, cooldownTicks: number): void {
  mob.state = 'cooldown';
  mob.stateTicks = cooldownTicks;
  mob.cooldownTicks = cooldownTicks;
  mob.pendingAttack = 'none';
  mob.stationary = false;
}

function stepMobTargetingAndDecisions(
  mgr: MobManager,
  mob: MobState,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  tick: number,
): void {
  const best = pickBestTargetForMob(mob, targets, tick);
  if (!best) {
    mob.targetId = undefined;
    mob.steerBiasX = 0;
    mob.steerBiasY = 0;
    if (mob.state === 'chase') mob.state = 'idle';
    return;
  }

  const { target, dist, dx, dy } = best;
  mob.targetId = target.id;
  if (mob.state === 'idle') mob.state = 'chase';

  const toTargetAngle = Math.atan2(dy, dx);
  const specStats = BANSUNG_ENEMIES[mob.kind];

  if (mob.state === 'chase') {
    mob.aimAngle = toTargetAngle;
    mob.facingLeft = dx < 0;
  }

  // Only start new attacks when chasing (not already winding up, lunging, fusing, etc.).
  if (mob.state !== 'chase') {
    mob.steerBiasX = 0;
    mob.steerBiasY = 0;
    return;
  }

  // 1. Scarab: zigzag swarm + quick melee bite
  if (mob.kind === 'scarab') {
    const s = BANSUNG_MELEE_SPECIALS.scarab;
    if (dist > s.zigzagDistThreshold && dist > 1e-4) {
      const px = -dy / dist;
      const py = dx / dist;
      const amp = Math.sin(tick * s.zigzagFreq + mob.numId) * s.zigzagAmp;
      mob.steerBiasX = px * amp;
      mob.steerBiasY = py * amp;
    } else {
      mob.steerBiasX = 0;
      mob.steerBiasY = 0;
    }

    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, specStats.windupTicks, 'melee_basic', toTargetAngle);
    }
    return;
  }

  // 2. Skirmisher: telegraphed 310 px/s lunge (52..95 px) + fallback melee swipe
  if (mob.kind === 'skirmisher') {
    const s = BANSUNG_MELEE_SPECIALS.skirmisher;
    if (
      mob.lungeCooldownTicks <= 0 &&
      dist >= s.lungeMinDist &&
      dist <= s.lungeMaxDist &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, specStats.windupTicks, 'skirmisher_lunge', toTargetAngle);
      const reach = s.lungeSpeed * (s.lungeDurationTicks * DT_SEC);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, reach);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: mob.radius,
        phase: 0,
        color: TELEGRAPH_COLOR_STORM,
        prog: 0,
        shape: 'line',
        halfW: mob.radius,
        active: false,
        sourceKind: mob.kind,
      });
      return;
    }
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, s.swipeWindupTicks, 'skirmisher_swipe', toTargetAngle);
    }
    return;
  }

  // 3. Bomb Goblin: 42t fuse rush on <=180 px w/ LOS OR <=35% HP within 260 px
  if (mob.kind === 'bomb_goblin') {
    const s = BANSUNG_MELEE_SPECIALS.bomb_goblin;
    if (mob.fuseCooldownTicks <= 0) {
      const normalTrigger =
        dist <= s.triggerDist && hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los');
      const lowHpTrigger = mob.hp / mob.maxHp <= s.lowHpTriggerRatio && dist <= s.lowHpTriggerDist;
      if (normalTrigger || lowHpTrigger) {
        mob.state = 'fuse';
        mob.stateTicks = s.fuseTicks;
        mob.armTicks = s.armTicks;
        mob.speed = s.fuseSpeed * (mob.speed / mob.baseSpeed);
        mob.sepWeightScale = s.fuseSepWeight;
        mob.stationary = false;
        mob.aimAngle = toTargetAngle;
        setMobTelegraph(mgr, mob.id, {
          id: mgr.nextTelegraphId++,
          ownerMobId: mob.id,
          kind: TELEGRAPH_KIND_CIRCLE,
          x0: mob.x,
          y0: mob.y,
          x1: mob.x,
          y1: mob.y,
          r: s.blastRadius,
          phase: 0,
          color: TELEGRAPH_COLOR_BOMB,
          prog: 0,
          shape: 'circle',
          active: false,
          sourceKind: mob.kind,
        });
      }
    }
    return;
  }

  // 4. Cactus Brute: Thorny Slam (58 px, 135t CD) + 110° Forward Cleave (38 px)
  if (mob.kind === 'cactus_brute') {
    const s = BANSUNG_MELEE_SPECIALS.cactus_brute;
    if (
      mob.slamCooldownTicks <= 0 &&
      dist <= s.slamTriggerDist &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, s.slamWindupTicks, 'brute_slam', toTargetAngle);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: mob.x,
        y0: mob.y,
        x1: mob.x,
        y1: mob.y,
        r: s.slamRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_SLAM,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
      return;
    }
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, specStats.windupTicks, 'brute_cleave', toTargetAngle);
      const cx = mob.x + Math.cos(toTargetAngle) * (s.cleaveReach * 0.45);
      const cy = mob.y + Math.sin(toTargetAngle) * (s.cleaveReach * 0.45);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: cx,
        y0: cy,
        x1: cx,
        y1: cy,
        r: Math.round(s.cleaveReach * 0.65),
        phase: 0,
        color: TELEGRAPH_COLOR_SLAM,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 5. Cactus Spitter: 3-orb (elite 5-orb) fan volley
  if (mob.kind === 'cactus_spitter') {
    const sp = BANSUNG_RANGED_ATTACKS.cactus_spitter;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange + 60 &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, sp.windupTicks, 'spitter_fan', toTargetAngle);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, specStats.attackRange + 60);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: sp.projRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_FIRE,
        prog: 0,
        shape: 'line',
        halfW: sp.projRadius,
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 6. Laser Sniper: 733ms (22t) slew-capped tracking + 367ms (11t) lock -> high-speed slug
  if (mob.kind === 'laser_sniper') {
    const s = BANSUNG_RANGED_ATTACKS.laser_sniper;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange + 60 &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      mob.sniperTick = 0;
      startWindup(mob, s.fireTick, 'sniper_shot', toTargetAngle);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, 960);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: s.projRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_SNIPER,
        prog: 0,
        shape: 'line',
        halfW: s.projRadius * 2,
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 7. Pyro Shaman: Lead-predicted fireball + 48 px ground telegraph
  if (mob.kind === 'pyro_shaman') {
    const s = BANSUNG_RANGED_ATTACKS.pyro_shaman;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= s.maxDist &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      let tvx = target.vx;
      let tvy = target.vy;
      if (tvx === undefined || tvy === undefined) {
        const prev = mgr.prevTargetPos.get(target.id);
        if (prev && tick > prev.tick) {
          const dt = (tick - prev.tick) * DT_SEC;
          tvx = (target.x - prev.x) / dt;
          tvy = (target.y - prev.y) / dt;
        } else {
          tvx = 0;
          tvy = 0;
        }
      }
      let ldx = tvx * s.leadTimeS;
      let ldy = tvy * s.leadTimeS;
      const leadLen = Math.hypot(ldx, ldy);
      if (leadLen > s.maxLeadPx && leadLen > 1e-4) {
        const scale = s.maxLeadPx / leadLen;
        ldx *= scale;
        ldy *= scale;
      }
      let px = clampPlayableX(target.x + ldx, s.splashRadius * 0.4, mgr.mapW);
      let py = clampPlayableY(target.y + ldy, s.splashRadius * 0.4, mgr.mapH);
      const pdx = px - mob.x;
      const pdy = py - mob.y;
      const pDist = Math.hypot(pdx, pdy);
      if (pDist > s.maxDist && pDist > 1e-4) {
        px = mob.x + (pdx / pDist) * s.maxDist;
        py = mob.y + (pdy / pDist) * s.maxDist;
      }
      const aim = Math.atan2(py - mob.y, px - mob.x);
      mob.predTargetX = px;
      mob.predTargetY = py;
      startWindup(mob, s.windupTicks, 'pyro_fireball', aim);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: px,
        y0: py,
        x1: px,
        y1: py,
        r: s.splashRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_FIRE,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 8. Thunder Mage: 60% Thunderball Volley / 40% Storm Strike (prioritizes Storm behind cover)
  if (mob.kind === 'thunder_mage') {
    const s = BANSUNG_RANGED_ATTACKS.thunder_mage;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange + 40) {
      const clearLos = hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los');
      const chooseStorm = !clearLos || mgr.rng() >= s.thunderballWeight;
      if (chooseStorm) {
        const sx = clampPlayableX(target.x, 8, mgr.mapW);
        const sy = clampPlayableY(target.y, 8, mgr.mapH);
        const pts: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
        if (mob.elite) {
          const perp = toTargetAngle + Math.PI * 0.5;
          pts.push({
            x: clampPlayableX(sx + Math.cos(perp) * s.stormFlankOffsetPx, 8, mgr.mapW),
            y: clampPlayableY(sy + Math.sin(perp) * s.stormFlankOffsetPx, 8, mgr.mapH),
          });
          pts.push({
            x: clampPlayableX(sx - Math.cos(perp) * s.stormFlankOffsetPx, 8, mgr.mapW),
            y: clampPlayableY(sy - Math.sin(perp) * s.stormFlankOffsetPx, 8, mgr.mapH),
          });
        }
        mob.stormPoints = pts;
        startWindup(mob, s.stormWindupTicks, 'thunder_storm', toTargetAngle);
        setMobTelegraphs(
          mgr,
          mob.id,
          pts.map((pt) => ({
            id: mgr.nextTelegraphId++,
            ownerMobId: mob.id,
            kind: TELEGRAPH_KIND_CIRCLE,
            x0: pt.x,
            y0: pt.y,
            x1: pt.x,
            y1: pt.y,
            r: s.stormRadius,
            phase: 0,
            color: TELEGRAPH_COLOR_STORM,
            prog: 0,
            shape: 'circle',
            active: false,
            sourceKind: mob.kind,
          })),
        );
      } else {
        startWindup(mob, s.ballWindupTicks, 'thunder_ball', toTargetAngle);
        const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, specStats.attackRange + 40);
        setMobTelegraph(mgr, mob.id, {
          id: mgr.nextTelegraphId++,
          ownerMobId: mob.id,
          kind: TELEGRAPH_KIND_LINE,
          x0: mob.x,
          y0: mob.y,
          x1: end.x,
          y1: end.y,
          r: s.ballRadius,
          phase: 0,
          color: TELEGRAPH_COLOR_STORM,
          prog: 0,
          shape: 'line',
          halfW: s.ballRadius,
          active: false,
          sourceKind: mob.kind,
        });
      }
    }
    return;
  }

  // 9. Frost Mage: Ice Nova when near, else Frost Bolt line
  if (mob.kind === 'frost_mage') {
    const s = BANSUNG_RANGED_ATTACKS.frost_mage;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange + 30) {
      if (dist <= 190 || !hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')) {
        const tx = clampPlayableX(target.x, 12, mgr.mapW);
        const ty = clampPlayableY(target.y, 12, mgr.mapH);
        mob.predTargetX = tx;
        mob.predTargetY = ty;
        startWindup(mob, s.novaWindupTicks, 'frost_nova', toTargetAngle);
        queueSingleCircleTelegraph(mgr, mob, tx, ty, s.novaRadius, TELEGRAPH_COLOR_STORM);
      } else {
        startWindup(mob, s.boltWindupTicks, 'frost_bolt', toTargetAngle);
        queueSingleLineTelegraph(
          mgr,
          mob,
          obsGrid,
          toTargetAngle,
          specStats.attackRange,
          s.boltRadius,
          TELEGRAPH_COLOR_STORM,
        );
      }
    }
    return;
  }

  // 10. Venom Stalker: zigzag flanking + mid-range twin acid spit + close melee bite
  if (mob.kind === 'venom_stalker') {
    const s = BANSUNG_RANGED_ATTACKS.venom_stalker;
    if (dist > 64 && dist > 1e-4) {
      const px = -dy / dist;
      const py = dx / dist;
      mob.steerBiasX = px * Math.sin(tick * 0.16 + mob.numId) * 0.45;
      mob.steerBiasY = py * Math.sin(tick * 0.16 + mob.numId) * 0.45;
    } else {
      mob.steerBiasX = 0;
      mob.steerBiasY = 0;
    }
    if (mob.cooldownTicks <= 0) {
      if (dist <= 44 && hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')) {
        startWindup(mob, specStats.windupTicks, 'melee_basic', toTargetAngle);
      } else if (
        dist <= specStats.attackRange &&
        hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
      ) {
        startWindup(mob, s.spitWindupTicks, 'venom_spit', toTargetAngle);
        queueSingleLineTelegraph(
          mgr,
          mob,
          obsGrid,
          toTargetAngle,
          specStats.attackRange,
          12,
          TELEGRAPH_COLOR_POISON,
        );
      }
    }
    return;
  }

  // 11. Shield Warden: AoE Bastion shield pulse for allies + close knockback bash
  if (mob.kind === 'shield_warden') {
    const s = BANSUNG_RANGED_ATTACKS.shield_warden;
    if (mob.cooldownTicks <= 0 && dist <= s.pulseRadius * 1.45) {
      startWindup(mob, s.windupTicks, 'warden_pulse', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, mob.x, mob.y, s.pulseRadius, TELEGRAPH_COLOR_STORM);
    }
    return;
  }

  // 12. Mortar Beetle: locks ground target with danger warning ring before landing shell
  if (mob.kind === 'mortar_beetle') {
    const s = BANSUNG_RANGED_ATTACKS.mortar_beetle;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange) {
      const mx = clampPlayableX(target.x, 16, mgr.mapW);
      const my = clampPlayableY(target.y, 16, mgr.mapH);
      mob.predTargetX = mx;
      mob.predTargetY = my;
      startWindup(mob, s.windupTicks, 'mortar_shell', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, mx, my, s.blastRadius, TELEGRAPH_COLOR_BOMB, 1, 'PHÁO CỐI');
    }
    return;
  }

  // 13. Void Acolyte: telegraphed singularity circle pulling & imploding heroes
  if (mob.kind === 'void_acolyte') {
    const s = BANSUNG_RANGED_ATTACKS.void_acolyte;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange) {
      const vx = clampPlayableX(target.x, 16, mgr.mapW);
      const vy = clampPlayableY(target.y, 16, mgr.mapH);
      mob.predTargetX = vx;
      mob.predTargetY = vy;
      startWindup(mob, s.windupTicks, 'void_singularity', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, vx, vy, s.singularityRadius, TELEGRAPH_COLOR_VOID);
    }
    return;
  }

  // 14. Saw Berserker: rapid bleeding chainsaw dash along locked corridor
  if (mob.kind === 'saw_berserker') {
    const s = BANSUNG_RANGED_ATTACKS.saw_berserker;
    if (
      mob.cooldownTicks <= 0 &&
      mob.lungeCooldownTicks <= 0 &&
      dist <= specStats.attackRange + 30 &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      const reach = s.lungeSpeed * (s.lungeDurationTicks * DT_SEC);
      startWindup(mob, s.windupTicks, 'saw_lunge', toTargetAngle);
      queueSingleLineTelegraph(
        mgr,
        mob,
        obsGrid,
        toTargetAngle,
        reach,
        mob.radius + 4,
        TELEGRAPH_COLOR_SNIPER,
      );
    }
    return;
  }

  // 15. Healing Priest: emerald Sanctum healing injured nearby allies + punitive smite bolt
  if (mob.kind === 'healing_priest') {
    const s = BANSUNG_RANGED_ATTACKS.healing_priest;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange) {
      let healAnchorX = mob.x;
      let healAnchorY = mob.y;
      let lowestRatio = 0.92;
      for (let ai = 0; ai < mgr.mobs.length; ai++) {
        const ally = mgr.mobs[ai];
        if (!ally.alive || ally.team !== mob.team || ally.hp <= 0 || ally.maxHp <= 0) continue;
        if (Math.hypot(ally.x - mob.x, ally.y - mob.y) > s.healRadius * 2) continue;
        const r = ally.hp / ally.maxHp;
        if (r < lowestRatio) {
          lowestRatio = r;
          healAnchorX = ally.x;
          healAnchorY = ally.y;
        }
      }
      mob.predTargetX = clampPlayableX(healAnchorX, 16, mgr.mapW);
      mob.predTargetY = clampPlayableY(healAnchorY, 16, mgr.mapH);
      startWindup(mob, s.windupTicks, 'priest_heal', toTargetAngle);
      queueSingleCircleTelegraph(
        mgr,
        mob,
        mob.predTargetX,
        mob.predTargetY,
        s.healRadius,
        TELEGRAPH_COLOR_POISON,
      );
    }
    return;
  }

  // 16. Shock Drone Mk.II: twin electric shock lines with micro-slow & brief shock
  if (mob.kind === 'shock_drone_mk2') {
    const s = BANSUNG_RANGED_ATTACKS.shock_drone_mk2;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, s.windupTicks, 'shock_twin', toTargetAngle);
      setMobTelegraphs(
        mgr,
        mob.id,
        s.spreadDeg.map((deg) => {
          const ang = toTargetAngle + deg * DEG_TO_RAD;
          const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, ang, specStats.attackRange);
          return {
            id: mgr.nextTelegraphId++,
            ownerMobId: mob.id,
            kind: TELEGRAPH_KIND_LINE,
            x0: mob.x,
            y0: mob.y,
            x1: end.x,
            y1: end.y,
            r: 7,
            phase: 0,
            color: TELEGRAPH_COLOR_STORM,
            prog: 0,
            shape: 'line',
            halfW: 7,
            active: false,
            sourceKind: mob.kind,
          };
        }),
      );
    }
  }

  // 17. Chrono Mage: stasis slow bolt + defensive teleport warp when cornered
  if (mob.kind === 'chrono_mage') {
    const s = BANSUNG_RANGED_ATTACKS.chrono_mage;
    if (dist < s.warpMinRange && mob.slamCooldownTicks <= 0) {
      mob.slamCooldownTicks = s.warpCdTicks;
      const escapeAng = toTargetAngle + Math.PI + ((mob.numId % 2 === 0 ? 1 : -1) * 0.45);
      const warpX = clampPlayableX(mob.x + Math.cos(escapeAng) * 150, mob.radius, mgr.mapW);
      const warpY = clampPlayableY(mob.y + Math.sin(escapeAng) * 150, mob.radius, mgr.mapH);
      emitFx(mgr, { type: FX_IMPACT, subKind: 4, x: mob.x, y: mob.y, kind: 'chrono_warp' });
      mob.x = warpX;
      mob.y = warpY;
      mob.spatialActor.x = mob.x;
      mob.spatialActor.y = mob.y;
      emitFx(mgr, { type: FX_IMPACT, subKind: 4, x: mob.x, y: mob.y, kind: 'chrono_warp' });
    } else if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, s.windupTicks, 'chrono_bolt', toTargetAngle);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, specStats.attackRange);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: s.boltRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_VOID,
        prog: 0,
        shape: 'line',
        halfW: s.boltRadius,
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 18. Plasma Golem: close shockwave slam OR 3-way plasma orb fan
  if (mob.kind === 'plasma_golem') {
    const s = BANSUNG_RANGED_ATTACKS.plasma_golem;
    if (mob.cooldownTicks <= 0 && dist <= s.slamRadius * 0.95) {
      startWindup(mob, s.windupTicks, 'golem_slam', toTargetAngle);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: mob.x,
        y0: mob.y,
        x1: mob.x,
        y1: mob.y,
        r: s.slamRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_FIRE,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
    } else if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, s.windupTicks, 'golem_plasma', toTargetAngle);
      setMobTelegraphs(
        mgr,
        mob.id,
        s.spreadDeg.map((deg) => {
          const ang = toTargetAngle + deg * DEG_TO_RAD;
          const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, ang, specStats.attackRange);
          return {
            id: mgr.nextTelegraphId++,
            ownerMobId: mob.id,
            kind: TELEGRAPH_KIND_LINE,
            x0: mob.x,
            y0: mob.y,
            x1: end.x,
            y1: end.y,
            r: s.orbRadius,
            phase: 0,
            color: TELEGRAPH_COLOR_FIRE,
            prog: 0,
            shape: 'line',
            halfW: s.orbRadius,
            active: false,
            sourceKind: mob.kind,
          };
        }),
      );
    }
    return;
  }

  // 19. Rail Sniper Mech: long-range piercing sniper laser line + hyper slug
  if (mob.kind === 'sniper_mech') {
    const s = BANSUNG_RANGED_ATTACKS.sniper_mech;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange + 80 &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, s.windupTicks, 'sniper_mech_shot', toTargetAngle);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, s.beamLength);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: s.beamHalfW,
        phase: 0,
        color: TELEGRAPH_COLOR_SNIPER,
        prog: 0,
        shape: 'line',
        halfW: s.beamHalfW * 2,
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 20. Plague Bearer: acid flask telegraph -> poison puddle hazard + DOT bolt
  if (mob.kind === 'plague_bearer') {
    const s = BANSUNG_RANGED_ATTACKS.plague_bearer;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange) {
      const tx = clampPlayableX(target.x, s.poolRadius * 0.5, mgr.mapW);
      const ty = clampPlayableY(target.y, s.poolRadius * 0.5, mgr.mapH);
      mob.predTargetX = tx;
      mob.predTargetY = ty;
      startWindup(mob, s.windupTicks, 'plague_acid', toTargetAngle);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: tx,
        y0: ty,
        x1: tx,
        y1: ty,
        r: s.poolRadius,
        phase: 0,
        color: TELEGRAPH_COLOR_POISON,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 21. Crimson Lancer: telegraphed lance charge dash + bleed strike
  if (mob.kind === 'crimson_lancer') {
    const s = BANSUNG_RANGED_ATTACKS.crimson_lancer;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, s.windupTicks, 'lancer_dash', toTargetAngle);
      const dashDist = s.dashSpeed * (s.dashTicks * DT_SEC);
      const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, toTargetAngle, dashDist);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_LINE,
        x0: mob.x,
        y0: mob.y,
        x1: end.x,
        y1: end.y,
        r: mob.radius + 4,
        phase: 0,
        color: TELEGRAPH_COLOR_BOMB,
        prog: 0,
        shape: 'line',
        halfW: mob.radius + 4,
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 22. Void Reaper: shadow blink ambush + 3-arc void wave
  if (mob.kind === 'void_reaper') {
    const s = BANSUNG_RANGED_ATTACKS.void_reaper;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange + 90) {
      startWindup(mob, s.windupTicks, 'reaper_blink', toTargetAngle);
      setMobTelegraph(mgr, mob.id, {
        id: mgr.nextTelegraphId++,
        ownerMobId: mob.id,
        kind: TELEGRAPH_KIND_CIRCLE,
        x0: mob.x,
        y0: mob.y,
        x1: mob.x,
        y1: mob.y,
        r: 48,
        phase: 0,
        color: TELEGRAPH_COLOR_VOID,
        prog: 0,
        shape: 'circle',
        active: false,
        sourceKind: mob.kind,
      });
    }
    return;
  }

  // 23. Mirror Knight: close deflect cleave OR 3-way mirror blade fan
  if (mob.kind === 'mirror_knight') {
    const s = BANSUNG_RANGED_ATTACKS.mirror_knight;
    if (mob.cooldownTicks <= 0 && dist <= s.slashRange) {
      startWindup(mob, s.windupTicks, 'mirror_slash', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, mob.x, mob.y, s.slashRange, TELEGRAPH_COLOR_STORM);
    } else if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, s.windupTicks, 'mirror_fan', toTargetAngle);
      setMobTelegraphs(
        mgr,
        mob.id,
        s.fanSpreadDeg.map((deg) => {
          const ang = toTargetAngle + deg * DEG_TO_RAD;
          const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, ang, specStats.attackRange);
          return {
            id: mgr.nextTelegraphId++,
            ownerMobId: mob.id,
            kind: TELEGRAPH_KIND_LINE,
            x0: mob.x,
            y0: mob.y,
            x1: end.x,
            y1: end.y,
            r: 7,
            phase: 0,
            color: TELEGRAPH_COLOR_STORM,
            prog: 0,
            shape: 'line',
            halfW: 7,
            active: false,
            sourceKind: mob.kind,
          };
        }),
      );
    }
    return;
  }

  // 24. Magnet Drone: gravity pull pulse + magnetic slow field
  if (mob.kind === 'magnet_drone') {
    const s = BANSUNG_RANGED_ATTACKS.magnet_drone;
    if (mob.cooldownTicks <= 0 && dist <= s.pulseRadius * 1.25) {
      startWindup(mob, s.windupTicks, 'magnet_pulse', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, mob.x, mob.y, s.pulseRadius, TELEGRAPH_COLOR_VOID);
    }
    return;
  }

  // 25. Blight Bomber: toxic glob + fading acid hazard pool
  if (mob.kind === 'blight_bomber') {
    const s = BANSUNG_RANGED_ATTACKS.blight_bomber;
    if (mob.cooldownTicks <= 0 && dist <= specStats.attackRange) {
      const tx = clampPlayableX(target.x, 24, mgr.mapW);
      const ty = clampPlayableY(target.y, 24, mgr.mapH);
      mob.predTargetX = tx;
      mob.predTargetY = ty;
      startWindup(mob, s.windupTicks, 'blight_lob', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, tx, ty, s.poolRadius, TELEGRAPH_COLOR_POISON);
    }
    return;
  }

  // 26. Volt Stalker: high-speed electric corridor dash + micro-stun
  if (mob.kind === 'volt_stalker') {
    const s = BANSUNG_RANGED_ATTACKS.volt_stalker;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      startWindup(mob, s.windupTicks, 'volt_dash', toTargetAngle);
      queueSingleLineTelegraph(
        mgr,
        mob,
        obsGrid,
        toTargetAngle,
        s.dashSpeed * (s.dashTicks * DT_SEC),
        mob.radius + 5,
        TELEGRAPH_COLOR_STORM,
      );
    }
    return;
  }

  // 27. Solar Priest: 3-way scorching solar orbs applying burn DoT
  if (mob.kind === 'solar_priest') {
    const s = BANSUNG_RANGED_ATTACKS.solar_priest;
    if (
      mob.cooldownTicks <= 0 &&
      dist <= specStats.attackRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'bullet')
    ) {
      startWindup(mob, s.windupTicks, 'solar_cone', toTargetAngle);
      setMobTelegraphs(
        mgr,
        mob.id,
        s.spreadDeg.map((deg) => {
          const ang = toTargetAngle + deg * DEG_TO_RAD;
          const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, ang, specStats.attackRange);
          return {
            id: mgr.nextTelegraphId++,
            ownerMobId: mob.id,
            kind: TELEGRAPH_KIND_LINE,
            x0: mob.x,
            y0: mob.y,
            x1: end.x,
            y1: end.y,
            r: 8,
            phase: 0,
            color: TELEGRAPH_COLOR_FIRE,
            prog: 0,
            shape: 'line',
            halfW: 8,
            active: false,
            sourceKind: mob.kind,
          };
        }),
      );
    }
    return;
  }

  // 28. Magma Brute: seismic magma slam leaving a <=4s lava pool
  if (mob.kind === 'magma_brute') {
    const s = BANSUNG_RANGED_ATTACKS.magma_brute;
    if (mob.cooldownTicks <= 0 && dist <= s.slamRadius * 1.1) {
      startWindup(mob, s.windupTicks, 'magma_slam', toTargetAngle);
      queueSingleCircleTelegraph(mgr, mob, mob.x, mob.y, s.slamRadius, TELEGRAPH_COLOR_FIRE, 1, 'DUNG NHAM');
    }
  }
}

/** Advance ongoing windup, lunge, fuse, burst, recover, and cooldown states for one mob. */
function stepMobActiveChannel(
  mgr: MobManager,
  mob: MobState,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  enemyGrid: ActorGrid | null | undefined,
  tick: number,
  callbacks?: MobStepCallbacks,
): void {
  const target = mob.targetId
    ? targets.find((t) => t.id === mob.targetId && isTargetValid(t))
    : undefined;

  // Decrement auxiliary special cooldowns outside stunned state.
  if (mob.state !== 'stunned') {
    if (mob.lungeCooldownTicks > 0) mob.lungeCooldownTicks--;
    if (mob.slamCooldownTicks > 0) mob.slamCooldownTicks--;
    if (mob.fuseCooldownTicks > 0) mob.fuseCooldownTicks--;
  }

  // Handle Laser Sniper elite 2nd staggered round (+5t delay).
  if (mob.burstRemaining > 0) {
    if (mob.burstDelayTicks > 0) {
      mob.burstDelayTicks--;
    } else {
      const s = BANSUNG_RANGED_ATTACKS.laser_sniper;
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'sniper_slug',
        angle: mob.aimAngle,
        speed: s.projSpeed,
        radius: s.projRadius,
        ttlTicks: s.projTtlTicks,
        dmg: getScaledDmg(s.projDmg, mob),
        dmgKind: 'kinetic',
        armorPiercePct: s.armorPierce,
        knockbackSpeed: s.knockbackSpeed,
        destructibleByMelee: false,
      });
      const burstEnd = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, 960);
      emitFx(
        mgr,
        {
          type: FX_BEAM,
          subKind: BANSUNG_FX_BEAM_RAIL,
          x: mob.x,
          y: mob.y,
          x2: burstEnd.x,
          y2: burstEnd.y,
          kind: 'sniper_shot',
          sourceId: mob.id,
        },
        callbacks,
      );
      mob.burstRemaining--;
      mob.burstDelayTicks = mob.burstRemaining > 0 ? s.eliteBurstDelayTicks : 0;
    }
  }

  if (mob.state === 'stunned') {
    mob.stationary = true;
    if ((mob.stunMs ?? 0) <= 0) {
      mob.stationary = false;
      mob.state = mob.cooldownTicks > 0 ? 'cooldown' : 'chase';
      mob.stateTicks = mob.cooldownTicks;
      mob.speed = mob.baseSpeed * (mob.enraged ? mob.enrageSpeedMult : 1);
    }
    return;
  }

  if (mob.state === 'cooldown' || mob.state === 'recover') {
    if (mob.stateTicks > 0) mob.stateTicks--;
    if (mob.state === 'cooldown' && mob.cooldownTicks > 0) mob.cooldownTicks--;
    if (mob.stateTicks <= 0) {
      if (mob.state === 'recover' && mob.cooldownTicks > 0) {
        mob.state = 'cooldown';
        mob.stateTicks = mob.cooldownTicks;
        mob.stationary = false;
      } else {
        mob.state = 'chase';
        mob.stationary = false;
      }
    }
    return;
  }

  if (mob.state === 'chase' || mob.state === 'idle') {
    if (mob.cooldownTicks > 0) mob.cooldownTicks--;
    return;
  }

  // Fuse rush (`bomb_goblin`)
  if (mob.state === 'fuse') {
    const s = BANSUNG_MELEE_SPECIALS.bomb_goblin;
    if (mob.armTicks > 0) mob.armTicks--;
    mob.stateTicks--;

    const tList = mgr.telegraphs.get(mob.id);
    if (tList && tList[0]) {
      tList[0].x0 = mob.x;
      tList[0].y0 = mob.y;
      tList[0].x1 = mob.x;
      tList[0].y1 = mob.y;
      tList[0].prog = Math.min(255, Math.max(0, Math.round((1 - mob.stateTicks / s.fuseTicks) * 255)));
    }

    const nearest = findNearestAliveTarget(mob.x, mob.y, mob.team, targets);
    const proximityTrigger = mob.armTicks === 0 && nearest !== null && nearest.dist <= s.detonateDist;
    if (mob.stateTicks <= 0 || proximityTrigger) {
      detonateBombGoblin(mgr, mob, targets, obsGrid, targetGrid, enemyGrid, callbacks);
    }
    return;
  }

  // Lunge active movement (`skirmisher` & `saw_berserker`, explicit straight slide along locked aimAngle)
  if (mob.state === 'lunge') {
    const isSaw = mob.kind === 'saw_berserker';
    const skirmisherSpec = BANSUNG_MELEE_SPECIALS.skirmisher;
    const sawSpec = BANSUNG_RANGED_ATTACKS.saw_berserker;
    const lungeSpd = isSaw ? sawSpec.lungeSpeed : skirmisherSpec.lungeSpeed;
    const step = lungeSpd * DT_SEC;
    const dx = Math.cos(mob.aimAngle) * step;
    const dy = Math.sin(mob.aimAngle) * step;
    const prevX = mob.x;
    const prevY = mob.y;

    if (obsGrid) {
      const body: CircleBody = { x: mob.x, y: mob.y, radius: mob.radius };
      const slid = moveCircleWithSlide(body, dx, dy, obsGrid, mgr.mapW, mgr.mapH, BANSUNG_PLAYABLE_BOUNDS.x0);
      mob.x = clampPlayableX(slid.x, mob.radius, mgr.mapW);
      mob.y = clampPlayableY(slid.y, mob.radius, mgr.mapH);
    } else {
      mob.x = clampPlayableX(mob.x + dx, mob.radius, mgr.mapW);
      mob.y = clampPlayableY(mob.y + dy, mob.radius, mgr.mapH);
    }
    mob.actualSpeed = Math.hypot(mob.x - prevX, mob.y - prevY) / DT_SEC;

    // Check overlap against any alive enemy-team target
    if (!mob.lungeHitDone) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!isTargetValid(t) || t.team === mob.team) continue;
        const d = Math.hypot(t.x - mob.x, t.y - mob.y);
        if (d <= mob.radius + t.radius + skirmisherSpec.lungeExtraRadius) {
          mob.lungeHitDone = true;
          const dmg = getScaledDmg(isSaw ? sawSpec.lungeDmg : skirmisherSpec.lungeDmg, mob);
          const dmgRes = damageMobTarget(
            t,
            {
              baseDmg: dmg,
              dmgKind: 'melee',
              attackerId: mob.id,
            },
            mob,
            callbacks,
          );
          if (isSaw && !dmgRes.blocked && t.alive && !t.downed) {
            applyDot(t, 'bleed', mob.id, {
              ...callbacks?.damageCtx,
              durMs: sawSpec.bleedDurMs,
              tickDmgOverride: sawSpec.bleedTickDmg,
            });
          }
          mob.contactIcdByTarget.set(t.id, tick + MOB_CONTACT_ICD_TICKS);
          emitFx(
            mgr,
            {
              type: FX_IMPACT,
              subKind: BANSUNG_FX_IMPACT_FLESH,
              x: t.x,
              y: t.y,
              value: dmg,
              kind: isSaw ? 'saw_lunge' : 'skirmisher_lunge',
              sourceId: mob.id,
              targetId: t.id,
            },
            callbacks,
          );
          break;
        }
      }
    }

    mob.stateTicks--;
    const blocked = Math.hypot(mob.x - prevX, mob.y - prevY) < step * 0.2;
    if (mob.lungeHitDone || mob.stateTicks <= 0 || blocked) {
      clearMobTelegraphs(mgr, mob.id);
      mob.lungeHitDone = false;
      mob.lungeCooldownTicks = getEffectiveCd(isSaw ? sawSpec.lungeCdTicks : skirmisherSpec.lungeCdTicks, mob);
      finishToCooldown(mob, getEffectiveCd(BANSUNG_ENEMIES[mob.kind].cooldownTicks, mob));
    }
    return;
  }

  // Windup state (all remaining melee & ranged windups)
  if (mob.state === 'windup') {
    mob.stationary = true;

    // Laser Sniper tracking & telegraph update
    if (mob.kind === 'laser_sniper' && mob.pendingAttack === 'sniper_shot') {
      const s = BANSUNG_RANGED_ATTACKS.laser_sniper;
      mob.sniperTick++;
      if (mob.sniperTick <= s.trackEndTick && target) {
        const desired = Math.atan2(target.y - mob.y, target.x - mob.x);
        const diff = angleDiff(mob.aimAngle, desired);
        const maxDelta = s.omegaMaxRadPerS * DT_SEC;
        const delta = Math.abs(diff) <= maxDelta ? diff : Math.sign(diff) * maxDelta;
        mob.aimAngle = normalizeAngle(mob.aimAngle + delta);
        mob.facingLeft = Math.cos(mob.aimAngle) < 0;
      }
      const tList = mgr.telegraphs.get(mob.id);
      if (tList && tList[0]) {
        const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, 960);
        tList[0].x0 = mob.x;
        tList[0].y0 = mob.y;
        tList[0].x1 = end.x;
        tList[0].y1 = end.y;
        if (mob.sniperTick <= s.trackEndTick) {
          tList[0].phase = 0;
          tList[0].prog = Math.min(255, Math.max(0, Math.round((mob.sniperTick / s.trackEndTick) * 255)));
        } else {
          tList[0].phase = 1;
          const lockTotal = Math.max(1, s.fireTick - s.trackEndTick);
          tList[0].prog = Math.min(
            255,
            Math.max(0, Math.round(((mob.sniperTick - s.trackEndTick) / lockTotal) * 255)),
          );
        }
      }
    } else {
      const total = getWindupDurationForPending(mob);
      const tList = mgr.telegraphs.get(mob.id);
      if (tList && total > 0) {
        const prog = Math.min(255, Math.max(0, Math.round((1 - (mob.stateTicks - 1) / total) * 255)));
        for (const tg of tList) tg.prog = prog;
      }
    }

    mob.stateTicks--;
    if (mob.stateTicks > 0) return;

    executePendingAttack(mgr, mob, targets, target, obsGrid, targetGrid, tick, callbacks);
  }
}

function getWindupDurationForPending(mob: MobState): number {
  switch (mob.pendingAttack) {
    case 'skirmisher_lunge':
      return BANSUNG_ENEMIES.skirmisher.windupTicks;
    case 'skirmisher_swipe':
      return BANSUNG_MELEE_SPECIALS.skirmisher.swipeWindupTicks;
    case 'brute_slam':
      return BANSUNG_MELEE_SPECIALS.cactus_brute.slamWindupTicks;
    case 'brute_cleave':
      return BANSUNG_ENEMIES.cactus_brute.windupTicks;
    case 'spitter_fan':
      return BANSUNG_RANGED_ATTACKS.cactus_spitter.windupTicks;
    case 'sniper_shot':
      return BANSUNG_RANGED_ATTACKS.laser_sniper.fireTick;
    case 'pyro_fireball':
      return BANSUNG_RANGED_ATTACKS.pyro_shaman.windupTicks;
    case 'thunder_ball':
      return BANSUNG_RANGED_ATTACKS.thunder_mage.ballWindupTicks;
    case 'thunder_storm':
      return BANSUNG_RANGED_ATTACKS.thunder_mage.stormWindupTicks;
    case 'frost_bolt':
      return BANSUNG_RANGED_ATTACKS.frost_mage.boltWindupTicks;
    case 'frost_nova':
      return BANSUNG_RANGED_ATTACKS.frost_mage.novaWindupTicks;
    case 'venom_spit':
      return BANSUNG_RANGED_ATTACKS.venom_stalker.spitWindupTicks;
    case 'warden_pulse':
      return BANSUNG_RANGED_ATTACKS.shield_warden.windupTicks;
    case 'mortar_shell':
      return BANSUNG_RANGED_ATTACKS.mortar_beetle.windupTicks;
    case 'void_singularity':
      return BANSUNG_RANGED_ATTACKS.void_acolyte.windupTicks;
    case 'saw_lunge':
      return BANSUNG_RANGED_ATTACKS.saw_berserker.windupTicks;
    case 'priest_heal':
      return BANSUNG_RANGED_ATTACKS.healing_priest.windupTicks;
    case 'shock_twin':
      return BANSUNG_RANGED_ATTACKS.shock_drone_mk2.windupTicks;
    case 'chrono_bolt':
      return BANSUNG_RANGED_ATTACKS.chrono_mage.windupTicks;
    case 'golem_slam':
    case 'golem_plasma':
      return BANSUNG_RANGED_ATTACKS.plasma_golem.windupTicks;
    case 'sniper_mech_shot':
      return BANSUNG_RANGED_ATTACKS.sniper_mech.windupTicks;
    case 'plague_acid':
      return BANSUNG_RANGED_ATTACKS.plague_bearer.windupTicks;
    case 'lancer_dash':
      return BANSUNG_RANGED_ATTACKS.crimson_lancer.windupTicks;
    case 'reaper_blink':
      return BANSUNG_RANGED_ATTACKS.void_reaper.windupTicks;
    case 'mirror_slash':
    case 'mirror_fan':
      return BANSUNG_RANGED_ATTACKS.mirror_knight.windupTicks;
    case 'magnet_pulse':
      return BANSUNG_RANGED_ATTACKS.magnet_drone.windupTicks;
    case 'blight_lob':
      return BANSUNG_RANGED_ATTACKS.blight_bomber.windupTicks;
    case 'volt_dash':
      return BANSUNG_RANGED_ATTACKS.volt_stalker.windupTicks;
    case 'solar_cone':
      return BANSUNG_RANGED_ATTACKS.solar_priest.windupTicks;
    case 'magma_slam':
      return BANSUNG_RANGED_ATTACKS.magma_brute.windupTicks;
    default:
      return BANSUNG_ENEMIES[mob.kind].windupTicks;
  }
}

function executePendingAttack(
  mgr: MobManager,
  mob: MobState,
  targets: readonly MobCombatEntity[],
  target: MobCombatEntity | undefined,
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  tick: number,
  callbacks?: MobStepCallbacks,
): void {
  const kindStats = BANSUNG_ENEMIES[mob.kind];
  const pending = mob.pendingAttack;

  if (pending === 'melee_basic') {
    clearMobTelegraphs(mgr, mob.id);
    const confirmRange = BANSUNG_MELEE_SPECIALS.scarab.hitConfirmRange;
    if (
      target &&
      Math.hypot(target.x - mob.x, target.y - mob.y) <= confirmRange &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      const dmg = getScaledDmg(kindStats.damage, mob);
      damageMobTarget(
        target,
        {
          baseDmg: dmg,
          dmgKind: 'melee',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
      mob.contactIcdByTarget.set(target.id, tick + MOB_CONTACT_ICD_TICKS);
      emitFx(
        mgr,
        {
          type: FX_IMPACT,
          subKind: BANSUNG_FX_IMPACT_FLESH,
          x: target.x,
          y: target.y,
          value: dmg,
          kind: 'scarab_bite',
          sourceId: mob.id,
          targetId: target.id,
        },
        callbacks,
      );
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'skirmisher_lunge') {
    clearMobTelegraphs(mgr, mob.id);
    mob.state = 'lunge';
    mob.stateTicks = BANSUNG_MELEE_SPECIALS.skirmisher.lungeDurationTicks;
    mob.lungeHitDone = false;
    mob.stationary = true;
    return;
  }

  if (pending === 'skirmisher_swipe') {
    clearMobTelegraphs(mgr, mob.id);
    const reach = kindStats.attackRange + (target?.radius ?? 12);
    if (
      target &&
      Math.hypot(target.x - mob.x, target.y - mob.y) <= reach &&
      hasClearLos(obsGrid, mob.x, mob.y, target.x, target.y, 'los')
    ) {
      const dmg = getScaledDmg(kindStats.damage, mob);
      damageMobTarget(
        target,
        {
          baseDmg: dmg,
          dmgKind: 'melee',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
      mob.contactIcdByTarget.set(target.id, tick + MOB_CONTACT_ICD_TICKS);
      emitFx(
        mgr,
        {
          type: FX_IMPACT,
          subKind: BANSUNG_FX_IMPACT_FLESH,
          x: target.x,
          y: target.y,
          value: dmg,
          kind: 'skirmisher_swipe',
          sourceId: mob.id,
          targetId: target.id,
        },
        callbacks,
      );
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'brute_cleave') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_MELEE_SPECIALS.cactus_brute;
    const halfCone = s.cleaveConeDeg * 0.5 * DEG_TO_RAD;
    const dmg = getScaledDmg(kindStats.damage, mob);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!isTargetValid(t) || t.team === mob.team) continue;
      const d = Math.hypot(t.x - mob.x, t.y - mob.y);
      if (d > s.cleaveReach + t.radius) continue;
      const dir = Math.atan2(t.y - mob.y, t.x - mob.x);
      if (Math.abs(angleDiff(mob.aimAngle, dir)) > halfCone) continue;
      if (!hasClearLos(obsGrid, mob.x, mob.y, t.x, t.y, 'los')) continue;
      damageMobTarget(
        t,
        {
          baseDmg: dmg,
          dmgKind: 'melee',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
      mob.contactIcdByTarget.set(t.id, tick + MOB_CONTACT_ICD_TICKS);
      emitFx(
        mgr,
        {
          type: FX_IMPACT,
          subKind: BANSUNG_FX_IMPACT_FLESH,
          x: t.x,
          y: t.y,
          value: dmg,
          kind: 'brute_cleave',
          sourceId: mob.id,
          targetId: t.id,
        },
        callbacks,
      );
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'brute_slam') {
    const s = BANSUNG_MELEE_SPECIALS.cactus_brute;
    clearMobTelegraphs(mgr, mob.id);
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_HE,
        x: mob.x,
        y: mob.y,
        value: s.slamRadius,
        kind: 'thorny_slam',
        sourceId: mob.id,
      },
      callbacks,
    );

    const slamDmg = getScaledDmg(s.slamDmg, mob);
    const hits = gatherAoeTargets(
      targetGrid,
      obsGrid,
      targets,
      mob.x,
      mob.y,
      s.slamRadius,
      'los',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hits) {
      if (!isTargetValid(h.target) || h.target.team === mob.team) continue;
      damageMobTarget(
        h.target,
        {
          baseDmg: slamDmg,
          dmgKind: 'melee',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
      mob.contactIcdByTarget.set(h.target.id, tick + MOB_CONTACT_ICD_TICKS);
      applyKnockbackToEntity(h.target, mob.x, mob.y, s.slamKnockback, mob, callbacks);
      applyStunWithDR(h.target, s.slamStunTicks * BANSUNG_TICK_EXACT_MS, callbacks?.statusCtx);
    }
    damageObstaclesInRadius(obsGrid, mob.x, mob.y, s.slamRadius, slamDmg, mob, 'melee', callbacks);

    // Fire 6 radial cactus needles every 60 degrees (max range 190 px).
    const needleTtl = Math.ceil((s.needleRange / s.needleSpeed) * BANSUNG_TICK_HZ) + 1;
    const needleDmg = getScaledDmg(s.needleDmg, mob);
    for (let i = 0; i < s.needleCount; i++) {
      const ang = (i * TWO_PI) / s.needleCount;
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'cactus_needle',
        angle: ang,
        speed: s.needleSpeed,
        radius: s.needleRadius,
        ttlTicks: needleTtl,
        dmg: needleDmg,
        dmgKind: 'kinetic',
        maxDist: s.needleRange,
        destructibleByMelee: true,
      });
    }

    mob.slamCooldownTicks = getEffectiveCd(s.slamCdTicks, mob);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'spitter_fan') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.cactus_spitter;
    const angles = mob.elite ? s.eliteSpreadDeg : s.spreadDeg;
    const dmg = getScaledDmg(s.projDmg, mob);
    for (const deg of angles) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'needle_orb',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.projSpeed,
        radius: s.projRadius,
        ttlTicks: s.projTtlTicks,
        dmg,
        dmgKind: 'kinetic',
        destructibleByMelee: true,
      });
    }
    mob.cooldownTicks = getEffectiveCd(kindStats.cooldownTicks, mob);
    mob.state = 'recover';
    mob.stateTicks = s.recoverTicks;
    mob.pendingAttack = 'none';
    mob.stationary = true;
    return;
  }

  if (pending === 'sniper_shot') {
    const s = BANSUNG_RANGED_ATTACKS.laser_sniper;
    clearMobTelegraphs(mgr, mob.id);
    const dmg = getScaledDmg(s.projDmg, mob);
    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'sniper_slug',
      angle: mob.aimAngle,
      speed: s.projSpeed,
      radius: s.projRadius,
      ttlTicks: s.projTtlTicks,
      dmg,
      dmgKind: 'kinetic',
      armorPiercePct: s.armorPierce,
      knockbackSpeed: s.knockbackSpeed,
      destructibleByMelee: false,
    });
    const sniperEnd = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, 960);
    emitFx(
      mgr,
      {
        type: FX_BEAM,
        subKind: BANSUNG_FX_BEAM_RAIL,
        x: mob.x,
        y: mob.y,
        x2: sniperEnd.x,
        y2: sniperEnd.y,
        kind: 'sniper_shot',
        sourceId: mob.id,
      },
      callbacks,
    );

    if (mob.elite) {
      mob.burstRemaining = 1;
      mob.burstDelayTicks = s.eliteBurstDelayTicks;
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'pyro_fireball') {
    const s = BANSUNG_RANGED_ATTACKS.pyro_shaman;
    clearMobTelegraphs(mgr, mob.id);
    mob.castCount++;

    const predDist = Math.hypot(mob.predTargetX - mob.x, mob.predTargetY - mob.y);
    const muzzleGap = mob.radius + s.projRadius + 2;
    const clampedMaxDist = Math.max(8, Math.min(s.maxDist, predDist - muzzleGap));

    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'fireball',
      angle: mob.aimAngle,
      speed: s.projSpeed,
      radius: s.projRadius,
      ttlTicks: s.projTtlTicks,
      dmg: getScaledDmg(s.centerDmg, mob),
      dmgKind: 'fire',
      maxDist: clampedMaxDist,
      destructibleByMelee: true,
      splashRadius: s.splashRadius,
      edgeDmg: getScaledDmg(s.edgeDmg, mob),
      spawnsFirePool: true,
      appliesBurn: true,
      burnDps: s.burnDps,
      burnDurationS: s.burnDurationS,
    });

    // Every 3rd cast or elite fires dual +/-12 deg split projectiles (38 px splash, 14 dmg, no fire_pool).
    if (mob.elite || mob.castCount % 3 === 0) {
      const splitDmg = getScaledDmg(s.splitDmg, mob);
      for (const deg of s.splitDeg) {
        spawnMobProjectile(mgr, mob, obsGrid, {
          kind: 'fireball_split',
          angle: mob.aimAngle + deg * DEG_TO_RAD,
          speed: s.projSpeed,
          radius: s.projRadius,
          ttlTicks: s.projTtlTicks,
          dmg: splitDmg,
          dmgKind: 'fire',
          maxDist: s.maxDist,
          destructibleByMelee: true,
          splashRadius: s.splitSplashRadius,
          edgeDmg: splitDmg,
          spawnsFirePool: false,
          appliesBurn: true,
          burnDps: s.burnDps,
          burnDurationS: s.burnDurationS,
        });
      }
    }

    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'thunder_ball') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.thunder_mage;
    const dmg = getScaledDmg(s.ballDmg, mob);
    for (let i = 0; i < s.ballSpreadDeg.length; i++) {
      const deg = s.ballSpreadDeg[i];
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'thunderball',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.ballSpeed,
        radius: s.ballRadius,
        ttlTicks: s.ballTtlTicks,
        dmg,
        dmgKind: 'energy',
        destructibleByMelee: true,
        wobbleAmp: s.ballWobbleAmp,
        wobbleFreq: s.ballWobbleFreq,
        wobblePhase: i === 0 ? 0 : Math.PI,
        slowPct: s.ballSlowPct,
        slowMs: Math.round(s.ballSlowS * 1000),
        microStunMs: Math.round(s.ballMicroStunS * 1000),
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'thunder_storm') {
    const s = BANSUNG_RANGED_ATTACKS.thunder_mage;
    clearMobTelegraphs(mgr, mob.id);
    const dmg = getScaledDmg(s.stormDmg, mob);
    const stunMs = Math.round(s.stormStunS * 1000);
    const shockMs = Math.round(s.stormShockedS * 1000);

    // Deduplicate hits across overlapping flanking storm pillars on the same cast.
    const struckTargetIds = new Set<string>();
    for (const pt of mob.stormPoints) {
      emitFx(
        mgr,
        {
          type: FX_BLAST,
          subKind: BANSUNG_FX_BLAST_THUNDER_STORM,
          x: pt.x,
          y: pt.y,
          value: s.stormRadius,
          kind: 'thunder_storm',
          sourceId: mob.id,
        },
        callbacks,
      );
      const hits = gatherAoeTargets(
        targetGrid,
        obsGrid,
        targets,
        pt.x,
        pt.y,
        s.stormRadius,
        'none',
        LAYER_PLAYER | LAYER_PET,
        mgr.emptyObsGrid,
      );
      for (const h of hits) {
        const tgt = h.target;
        if (!isTargetValid(tgt) || tgt.team === mob.team || struckTargetIds.has(tgt.id)) continue;
        struckTargetIds.add(tgt.id);
        damageMobTarget(
          tgt,
          {
            baseDmg: dmg,
            dmgKind: 'energy',
            attackerId: mob.id,
          },
          mob,
          callbacks,
        );
        applyStunWithDR(tgt, stunMs, callbacks?.statusCtx);
        tgt.vulnMult = Math.max(tgt.vulnMult ?? 1, 1 + s.stormShockedMul);
        tgt.vulnMs = Math.max(tgt.vulnMs ?? 0, shockMs);
        callbacks?.onApplyShocked?.(tgt, s.stormShockedMul, shockMs, mob);
      }
      damageObstaclesInRadius(obsGrid, pt.x, pt.y, s.stormRadius, dmg, mob, 'energy', callbacks);
    }
    mob.stormPoints.length = 0;
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'frost_bolt') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.frost_mage;
    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'frost_bolt',
      angle: mob.aimAngle,
      speed: s.boltSpeed,
      radius: s.boltRadius,
      ttlTicks: s.boltTtlTicks,
      dmg: getScaledDmg(s.boltDmg, mob),
      dmgKind: 'energy',
      destructibleByMelee: true,
      slowPct: s.slowPct,
      slowMs: s.slowMs,
    });
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'frost_nova') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.frost_mage;
    const dmg = getScaledDmg(s.novaDmg, mob);
    const hits = gatherAoeTargets(
      targetGrid,
      obsGrid,
      targets,
      mob.predTargetX,
      mob.predTargetY,
      s.novaRadius,
      'none',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hits) {
      const tgt = h.target;
      if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
      damageMobTarget(tgt, { baseDmg: dmg, dmgKind: 'energy', attackerId: mob.id }, mob, callbacks);
      tgt.slowPct = Math.max(tgt.slowPct ?? 0, s.slowPct);
      tgt.slowMs = Math.max(tgt.slowMs ?? 0, s.slowMs);
      callbacks?.onApplySlow?.(tgt, s.slowPct, s.slowMs, mob);
    }
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_THUNDER_STORM,
        x: mob.predTargetX,
        y: mob.predTargetY,
        value: s.novaRadius,
        kind: 'frost_nova',
        sourceId: mob.id,
      },
      callbacks,
    );
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'venom_spit') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.venom_stalker;
    const dmg = getScaledDmg(s.spitDmg, mob);
    for (const deg of s.spitSpreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'venom_spit',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.spitSpeed,
        radius: s.spitRadius,
        ttlTicks: s.spitTtlTicks,
        dmg,
        dmgKind: 'kinetic',
        destructibleByMelee: true,
        dotKind: 'poison',
        dotTickDmg: s.poisonTickDmg,
        dotDurMs: s.poisonDurMs,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'warden_pulse') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.shield_warden;
    for (let ai = 0; ai < mgr.mobs.length; ai++) {
      const ally = mgr.mobs[ai];
      if (!ally.alive || ally.team !== mob.team) continue;
      if (Math.hypot(ally.x - mob.x, ally.y - mob.y) <= s.pulseRadius) {
        const cap = Math.max(s.shieldGrant, Math.round(ally.maxHp * 0.3));
        ally.maxShield = Math.max(ally.maxShield, cap);
        ally.shield = Math.min(ally.maxShield, ally.shield + s.shieldGrant);
      }
    }
    const bashDmg = getScaledDmg(s.bashDmg, mob);
    const hits = gatherAoeTargets(
      targetGrid,
      obsGrid,
      targets,
      mob.x,
      mob.y,
      s.pulseRadius,
      'los',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hits) {
      const tgt = h.target;
      if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
      damageMobTarget(tgt, { baseDmg: bashDmg, dmgKind: 'melee', attackerId: mob.id }, mob, callbacks);
      applyKnockbackToEntity(tgt, mob.x, mob.y, s.bashKnockback, mob, callbacks);
    }
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_THUNDER_STORM,
        x: mob.x,
        y: mob.y,
        value: s.pulseRadius,
        kind: 'warden_pulse',
        sourceId: mob.id,
      },
      callbacks,
    );
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'mortar_shell') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.mortar_beetle;
    const dmg = getScaledDmg(s.blastDmg, mob);
    const hits = gatherAoeTargets(
      targetGrid,
      obsGrid,
      targets,
      mob.predTargetX,
      mob.predTargetY,
      s.blastRadius,
      'none',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hits) {
      const tgt = h.target;
      if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
      damageMobTarget(tgt, { baseDmg: dmg, dmgKind: 'explosive', attackerId: mob.id }, mob, callbacks);
      applyKnockbackToEntity(tgt, mob.predTargetX, mob.predTargetY, s.knockbackSpeed, mob, callbacks);
    }
    damageObstaclesInRadius(obsGrid, mob.predTargetX, mob.predTargetY, s.blastRadius, dmg, mob, 'explosive', callbacks);
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_HE,
        x: mob.predTargetX,
        y: mob.predTargetY,
        value: s.blastRadius,
        kind: 'mortar_shell',
        sourceId: mob.id,
      },
      callbacks,
    );
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'void_singularity') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.void_acolyte;
    const dmg = getScaledDmg(s.implosionDmg, mob);
    const hits = gatherAoeTargets(
      targetGrid,
      obsGrid,
      targets,
      mob.predTargetX,
      mob.predTargetY,
      s.singularityRadius,
      'none',
      LAYER_PLAYER | LAYER_PET,
      mgr.emptyObsGrid,
    );
    for (const h of hits) {
      const tgt = h.target;
      if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
      const dx = mob.predTargetX - tgt.x;
      const dy = mob.predTargetY - tgt.y;
      const d = Math.hypot(dx, dy);
      if (d > 6) {
        const pullV = Math.min(s.pullImpulse, d * 3);
        const resist = tgt.kbResist ?? 0;
        const effPull = pullV * Math.max(0, 1 - resist);
        if (effPull > 0) {
          const dvx = (dx / d) * effPull;
          const dvy = (dy / d) * effPull;
          tgt.knockVx = (tgt.knockVx ?? 0) + dvx;
          tgt.knockVy = (tgt.knockVy ?? 0) + dvy;
          callbacks?.onKnockback?.(tgt, dvx, dvy, mob);
        }
      }
      damageMobTarget(tgt, { baseDmg: dmg, dmgKind: 'energy', attackerId: mob.id }, mob, callbacks);
    }
    emitFx(
      mgr,
      {
        type: FX_BLAST,
        subKind: BANSUNG_FX_BLAST_VOLATILE,
        x: mob.predTargetX,
        y: mob.predTargetY,
        value: s.singularityRadius,
        kind: 'void_singularity',
        sourceId: mob.id,
      },
      callbacks,
    );
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'saw_lunge') {
    clearMobTelegraphs(mgr, mob.id);
    mob.state = 'lunge';
    mob.stateTicks = BANSUNG_RANGED_ATTACKS.saw_berserker.lungeDurationTicks;
    mob.lungeHitDone = false;
    mob.stationary = true;
    return;
  }

  if (pending === 'priest_heal') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.healing_priest;
    for (let ai = 0; ai < mgr.mobs.length; ai++) {
      const ally = mgr.mobs[ai];
      if (!ally.alive || ally.team !== mob.team) continue;
      if (Math.hypot(ally.x - mob.predTargetX, ally.y - mob.predTargetY) <= s.healRadius) {
        const healAmt = Math.max(8, Math.round(ally.maxHp * s.healPct));
        ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
      }
    }
    if (target) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'smite_bolt',
        angle: mob.aimAngle,
        speed: s.smiteSpeed,
        radius: 6,
        ttlTicks: 42,
        dmg: getScaledDmg(s.smiteDmg, mob),
        dmgKind: 'energy',
        destructibleByMelee: true,
      });
    }
    emitFx(
      mgr,
      {
        type: FX_IMPACT,
        subKind: BANSUNG_FX_IMPACT_FLESH,
        x: mob.predTargetX,
        y: mob.predTargetY,
        kind: 'priest_heal',
        sourceId: mob.id,
      },
      callbacks,
    );
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'shock_twin') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.shock_drone_mk2;
    const dmg = getScaledDmg(s.projDmg, mob);
    for (const deg of s.spreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'shock_bolt',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.projSpeed,
        radius: 5,
        ttlTicks: 42,
        dmg,
        dmgKind: 'energy',
        destructibleByMelee: true,
        slowPct: s.slowPct,
        slowMs: s.slowMs,
        microStunMs: s.microStunMs,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'chrono_bolt') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.chrono_mage;
    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'chrono_bolt',
      angle: mob.aimAngle,
      speed: s.boltSpeed,
      radius: s.boltRadius,
      ttlTicks: s.boltTtlTicks,
      dmg: getScaledDmg(s.boltDmg, mob),
      dmgKind: 'energy',
      destructibleByMelee: true,
      slowPct: s.slowPct,
      slowMs: s.slowMs,
    });
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'golem_slam') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.plasma_golem;
    emitFx(mgr, {
      type: FX_BLAST,
      subKind: BANSUNG_FX_BLAST_FIREBALL,
      x: mob.x,
      y: mob.y,
      value: s.slamRadius,
      kind: 'golem_slam',
      sourceId: mob.id,
    }, callbacks);
    const hits = gatherAoeTargets(targetGrid, obsGrid, targets, mob.x, mob.y, s.slamRadius, 'los', LAYER_PLAYER | LAYER_PET, mgr.emptyObsGrid);
    for (const h of hits) {
      if (!isTargetValid(h.target) || h.target.team === mob.team) continue;
      damageMobTarget(h.target, { baseDmg: getScaledDmg(s.slamDmg, mob), dmgKind: 'explosive', attackerId: mob.id }, mob, callbacks);
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'golem_plasma') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.plasma_golem;
    const dmg = getScaledDmg(s.orbDmg, mob);
    for (const deg of s.spreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'fireball',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.orbSpeed,
        radius: s.orbRadius,
        ttlTicks: 48,
        dmg,
        edgeDmg: Math.round(dmg * 0.6),
        splashRadius: 34,
        dmgKind: 'energy',
        destructibleByMelee: true,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'sniper_mech_shot') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.sniper_mech;
    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'sniper_slug',
      angle: mob.aimAngle,
      speed: s.projSpeed,
      radius: 5,
      ttlTicks: 32,
      dmg: getScaledDmg(s.shotDmg, mob),
      dmgKind: 'kinetic',
      armorPiercePct: 0.4,
      destructibleByMelee: false,
    });
    const beamEnd = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, s.beamLength);
    emitFx(mgr, { type: FX_BEAM, subKind: BANSUNG_FX_BEAM_RAIL, x: mob.x, y: mob.y, x2: beamEnd.x, y2: beamEnd.y, kind: 'sniper_mech', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'plague_acid') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.plague_bearer;
    const px = mob.predTargetX ?? mob.x + Math.cos(mob.aimAngle) * 160;
    const py = mob.predTargetY ?? mob.y + Math.sin(mob.aimAngle) * 160;
    const tickDmg = Math.max(1, Math.round(s.poolDps * 0.5 * mob.dmgMult));
    spawnFirePoolHazard(mgr, mob.id, mob.team, px, py, tick, mob.dmgMult, {
      radius: s.poolRadius,
      ttlTicks: s.poolDurationTicks,
      tickInterval: 10,
      tickDmg,
      dmgKind: 'true',
    });
    emitFx(mgr, { type: FX_BLAST, subKind: BANSUNG_FX_BLAST_VOLATILE, x: px, y: py, value: s.poolRadius, kind: 'poison_pool', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'lancer_dash') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.crimson_lancer;
    const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, s.dashSpeed * (s.dashTicks * DT_SEC));
    mob.x = clampPlayableX(end.x, mob.radius, mgr.mapW);
    mob.y = clampPlayableY(end.y, mob.radius, mgr.mapH);
    mob.spatialActor.x = mob.x;
    mob.spatialActor.y = mob.y;
    if (target && isTargetValid(target) && Math.hypot(target.x - mob.x, target.y - mob.y) <= mob.radius + (target.radius ?? 14) + 34) {
      const dmgRes = damageMobTarget(target, { baseDmg: getScaledDmg(s.dashDmg, mob), dmgKind: 'melee', attackerId: mob.id }, mob, callbacks);
      if (dmgRes && !dmgRes.blocked && target.alive) {
        applyDot(target, 'bleed', mob.id, { durMs: s.bleedDurMs, tickDmgOverride: s.bleedTickDmg });
      }
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'reaper_blink') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.void_reaper;
    if (target && isTargetValid(target)) {
      const flankAng = mob.aimAngle + Math.PI;
      const bx = clampPlayableX(target.x + Math.cos(flankAng) * 58, mob.radius, mgr.mapW);
      const by = clampPlayableY(target.y + Math.sin(flankAng) * 58, mob.radius, mgr.mapH);
      mob.x = bx;
      mob.y = by;
      mob.spatialActor.x = mob.x;
      mob.spatialActor.y = mob.y;
      mob.aimAngle = Math.atan2(target.y - mob.y, target.x - mob.x);
    }
    const dmg = getScaledDmg(s.boltDmg, mob);
    for (const deg of s.spreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'void_arc',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.boltSpeed,
        radius: 7,
        ttlTicks: 38,
        dmg,
        dmgKind: 'energy',
        destructibleByMelee: true,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'mirror_slash') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.mirror_knight;
    const hits = gatherAoeTargets(targetGrid, obsGrid, targets, mob.x, mob.y, s.slashRange, 'los', LAYER_PLAYER | LAYER_PET, mgr.emptyObsGrid);
    for (const h of hits) {
      if (!isTargetValid(h.target) || h.target.team === mob.team) continue;
      damageMobTarget(h.target, { baseDmg: getScaledDmg(s.slashDmg, mob), dmgKind: 'melee', attackerId: mob.id }, mob, callbacks);
    }
    emitFx(mgr, { type: FX_BLAST, subKind: BANSUNG_FX_BLAST_THUNDER_STORM, x: mob.x, y: mob.y, value: s.slashRange, kind: 'mirror_slash', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'mirror_fan') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.mirror_knight;
    const dmg = getScaledDmg(s.boltDmg, mob);
    for (const deg of s.fanSpreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'mirror_slash',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.boltSpeed,
        radius: 7,
        ttlTicks: 42,
        dmg,
        dmgKind: 'energy',
        destructibleByMelee: true,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'magnet_pulse') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.magnet_drone;
    const hits = gatherAoeTargets(targetGrid, obsGrid, targets, mob.x, mob.y, s.pulseRadius, 'none', LAYER_PLAYER | LAYER_PET, mgr.emptyObsGrid);
    for (const h of hits) {
      const tgt = h.target;
      if (!isTargetValid(tgt) || tgt.team === mob.team) continue;
      const dx = mob.x - tgt.x;
      const dy = mob.y - tgt.y;
      const d = Math.hypot(dx, dy);
      if (d > 14) {
        const pullV = Math.min(s.pullPx * 3.5, d * 3);
        const resist = tgt.kbResist ?? 0;
        const effPull = pullV * Math.max(0, 1 - resist);
        if (effPull > 0) {
          const dvx = (dx / d) * effPull;
          const dvy = (dy / d) * effPull;
          tgt.knockVx = (tgt.knockVx ?? 0) + dvx;
          tgt.knockVy = (tgt.knockVy ?? 0) + dvy;
          callbacks?.onKnockback?.(tgt, dvx, dvy, mob);
        }
      }
      const res = damageMobTarget(tgt, { baseDmg: getScaledDmg(s.pulseDmg, mob), dmgKind: 'energy', attackerId: mob.id }, mob, callbacks);
      if (!res.blocked && tgt.alive) {
        tgt.slowPct = Math.max(tgt.slowPct ?? 0, s.slowPct);
        tgt.slowMs = Math.max(tgt.slowMs ?? 0, s.slowMs);
        callbacks?.onApplySlow?.(tgt, s.slowPct, s.slowMs, mob);
      }
    }
    emitFx(mgr, { type: FX_BLAST, subKind: BANSUNG_FX_BLAST_THUNDER_STORM, x: mob.x, y: mob.y, value: s.pulseRadius, kind: 'magnet_pulse', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'blight_lob') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.blight_bomber;
    const px = mob.predTargetX ?? mob.x + Math.cos(mob.aimAngle) * 140;
    const py = mob.predTargetY ?? mob.y + Math.sin(mob.aimAngle) * 140;
    spawnMobProjectile(mgr, mob, obsGrid, {
      kind: 'blight_glob',
      angle: mob.aimAngle,
      speed: s.boltSpeed,
      radius: 8,
      ttlTicks: 38,
      dmg: getScaledDmg(s.boltDmg, mob),
      dmgKind: 'energy',
      destructibleByMelee: true,
      dotKind: 'poison',
      dotTickDmg: Math.max(1, Math.round(s.poolDps * 0.5 * mob.dmgMult)),
      dotDurMs: s.poisonDurMs,
    });
    spawnFirePoolHazard(mgr, mob.id, mob.team, px, py, tick, mob.dmgMult, {
      radius: s.poolRadius,
      ttlTicks: Math.min(135, s.poolDurationTicks),
      tickInterval: 10,
      tickDmg: Math.max(1, Math.round(s.poolDps * 0.5 * mob.dmgMult)),
      dmgKind: 'true',
    });
    emitFx(mgr, { type: FX_BLAST, subKind: BANSUNG_FX_BLAST_VOLATILE, x: px, y: py, value: s.poolRadius, kind: 'poison_pool', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'volt_dash') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.volt_stalker;
    const startX = mob.x;
    const startY = mob.y;
    const end = computeWallClippedEnd(obsGrid, mob.x, mob.y, mob.aimAngle, s.dashSpeed * (s.dashTicks * DT_SEC));
    mob.x = clampPlayableX(end.x, mob.radius, mgr.mapW);
    mob.y = clampPlayableY(end.y, mob.radius, mgr.mapH);
    mob.spatialActor.x = mob.x;
    mob.spatialActor.y = mob.y;
    for (const t of targets) {
      if (!isTargetValid(t) || t.team === mob.team) continue;
      const hitRad = mob.radius + (t.radius ?? 14) + 12;
      if (distPointToSegmentSq(t.x, t.y, startX, startY, mob.x, mob.y) <= hitRad * hitRad) {
        const res = damageMobTarget(t, { baseDmg: getScaledDmg(s.dashDmg, mob), dmgKind: 'energy', attackerId: mob.id }, mob, callbacks);
        if (!res.blocked && t.alive && !t.ccImmune && (t.stunImmuneMs ?? 0) <= 0) {
          t.stunMs = Math.max(t.stunMs ?? 0, s.shockStunMs);
        }
      }
    }
    emitFx(mgr, { type: FX_BEAM, subKind: BANSUNG_FX_BEAM_RAIL, x: startX, y: startY, x2: mob.x, y2: mob.y, kind: 'volt_dash', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'solar_cone') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.solar_priest;
    const dmg = getScaledDmg(s.orbDmg, mob);
    for (const deg of s.spreadDeg) {
      spawnMobProjectile(mgr, mob, obsGrid, {
        kind: 'solar_orb',
        angle: mob.aimAngle + deg * DEG_TO_RAD,
        speed: s.orbSpeed,
        radius: 8,
        ttlTicks: 46,
        dmg,
        dmgKind: 'fire',
        destructibleByMelee: true,
        appliesBurn: true,
        burnDps: s.burnDps,
        burnDurationS: s.burnMs / 1000,
        dotKind: 'burn',
        dotTickDmg: Math.max(1, Math.round(s.burnDps * 0.5 * mob.dmgMult)),
        dotDurMs: s.burnMs,
      });
    }
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
    return;
  }

  if (pending === 'magma_slam') {
    clearMobTelegraphs(mgr, mob.id);
    const s = BANSUNG_RANGED_ATTACKS.magma_brute;
    const hits = gatherAoeTargets(targetGrid, obsGrid, targets, mob.x, mob.y, s.slamRadius, 'los', LAYER_PLAYER | LAYER_PET, mgr.emptyObsGrid);
    for (const h of hits) {
      if (!isTargetValid(h.target) || h.target.team === mob.team) continue;
      damageMobTarget(h.target, { baseDmg: getScaledDmg(s.slamDmg, mob), dmgKind: 'explosive', attackerId: mob.id }, mob, callbacks);
      applyKnockbackToEntity(h.target, mob.x, mob.y, 220, mob, callbacks);
    }
    spawnFirePoolHazard(mgr, mob.id, mob.team, mob.x, mob.y, tick, mob.dmgMult, {
      radius: Math.round(s.slamRadius * 0.78),
      ttlTicks: Math.min(120, s.ringDurationTicks),
      tickInterval: 10,
      tickDmg: Math.max(1, Math.round(s.ringDps * 0.5 * mob.dmgMult)),
      dmgKind: 'fire',
    });
    emitFx(mgr, { type: FX_BLAST, subKind: BANSUNG_FX_BLAST_FIREBALL, x: mob.x, y: mob.y, value: s.slamRadius, kind: 'magma_slam', sourceId: mob.id }, callbacks);
    finishToCooldown(mob, getEffectiveCd(kindStats.cooldownTicks, mob));
  }
}

// ---------------------------------------------------------------------------
// Projectile & Hazard Simulation
// ---------------------------------------------------------------------------

function detonateFireball(
  mgr: MobManager,
  proj: MobProjectile,
  x: number,
  y: number,
  tick: number,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  callbacks?: MobStepCallbacks,
): void {
  const owner = mgr.mobById.get(proj.ownerMobId);
  const dmgMult = owner?.dmgMult ?? 1;
  emitFx(
    mgr,
    {
      type: FX_BLAST,
      subKind: BANSUNG_FX_BLAST_FIREBALL,
      x,
      y,
      value: proj.splashRadius,
      kind: proj.kind,
      sourceId: proj.ownerMobId,
    },
    callbacks,
  );

  const hits = gatherAoeTargets(
    targetGrid,
    obsGrid,
    targets,
    x,
    y,
    proj.splashRadius,
    'los',
    LAYER_PLAYER | LAYER_PET,
    mgr.emptyObsGrid,
  );
  for (const h of hits) {
    const tgt = h.target;
    if (!isTargetValid(tgt) || tgt.team === proj.team) continue;
    const t = proj.splashRadius > 0 ? Math.min(1, h.dist / proj.splashRadius) : 0;
    const dmg = Math.max(1, Math.round(proj.dmg + (proj.edgeDmg - proj.dmg) * t));
    damageMobTarget(
      tgt,
      {
        baseDmg: dmg,
        dmgKind: proj.dmgKind,
        attackerId: proj.ownerMobId,
      },
      owner,
      callbacks,
    );

    if (proj.appliesBurn && proj.burnDps > 0 && proj.burnDurationS > 0 && tgt.alive) {
      applyDot(tgt, 'burn', proj.ownerMobId, {
        durMs: Math.round(proj.burnDurationS * 1000),
        tickDmgOverride: Math.max(1, Math.round(proj.burnDps * 0.5)),
        ...callbacks?.statusCtx,
      });
    }
  }

  if (owner) {
    damageObstaclesInRadius(obsGrid, x, y, proj.splashRadius, proj.dmg, owner, proj.dmgKind, callbacks);
  }

  if (proj.spawnsFirePool) {
    spawnFirePoolHazard(mgr, proj.ownerMobId, proj.team, x, y, tick, dmgMult);
  }
}

/** Step all active mob projectiles using swept circle-vs-wall/target collision (`spatial.ts`). */
export function stepMobProjectiles(
  mgr: MobManager,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  tick: number,
  callbacks?: MobStepCallbacks,
): void {
  const activeObsGrid = obsGrid ?? mgr.emptyObsGrid;
  const activeActorGrid = targetGrid ?? mgr.emptyActorGrid;
  const targetByNumId = targetGrid ? buildTargetByNumId(targets) : null;

  const sweepOut: SweepBulletResult = {
    endX: 0,
    endY: 0,
    stopped: false,
    stoppedBy: 'none',
    actorHits: [],
    obstacleHits: [],
    bouncesUsed: 0,
  };

  for (let i = mgr.projectiles.length - 1; i >= 0; i--) {
    const p = mgr.projectiles[i];
    p.ageTicks++;
    p.ttlTicks--;

    // Apply sinusoidal lateral velocity for Thunderball while preserving forward speed.
    if (p.wobbleAmp !== 0 && p.wobbleFreq !== 0) {
      const t0 = (p.ageTicks - 1) * DT_SEC;
      const t1 = p.ageTicks * DT_SEC;
      const lat0 = p.wobbleAmp * Math.sin(p.wobbleFreq * t0 + p.wobblePhase);
      const lat1 = p.wobbleAmp * Math.sin(p.wobbleFreq * t1 + p.wobblePhase);
      const vLat = (lat1 - lat0) / DT_SEC;
      const cos = Math.cos(p.baseAngle);
      const sin = Math.sin(p.baseAngle);
      p.vx = cos * p.speed - sin * vLat;
      p.vy = sin * p.speed + cos * vLat;
    }

    const bulletIn: SweptBulletInput = {
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      radius: p.radius,
      team: p.team,
      layerMask: LAYER_PLAYER | LAYER_PET,
      maxHits: 1,
      bouncesLeft: 0,
    };

    const res = stepSweptBullet(activeObsGrid, activeActorGrid, bulletIn, DT_SEC, sweepOut);

    let hitTarget: MobCombatEntity | null = null;
    let endX = res.endX;
    let endY = res.endY;
    let stoppedBy = res.stoppedBy;

    if (targetGrid && targetByNumId && res.actorHits.length > 0) {
      hitTarget = targetByNumId.get(res.actorHits[0].actor.id) ?? null;
    } else if (!targetGrid && stoppedBy !== 'obstacle') {
      // Swept segment-vs-circle fallback when no ActorGrid is supplied.
      let bestDistSq = Infinity;
      const segDx = endX - p.x;
      const segDy = endY - p.y;
      const segLenSq = segDx * segDx + segDy * segDy;
      let bestT = 2;

      for (let j = 0; j < targets.length; j++) {
        const tgt = targets[j];
        if (!isTargetValid(tgt) || tgt.team === p.team) continue;
        const sumR = p.radius + tgt.radius;
        const dSq = distPointToSegmentSq(tgt.x, tgt.y, p.x, p.y, endX, endY);
        if (dSq > sumR * sumR) continue;
        const t =
          segLenSq > 1e-8
            ? Math.max(0, Math.min(1, ((tgt.x - p.x) * segDx + (tgt.y - p.y) * segDy) / segLenSq))
            : 0;
        if (t < bestT || (t === bestT && dSq < bestDistSq)) {
          bestT = t;
          bestDistSq = dSq;
          hitTarget = tgt;
          endX = p.x + segDx * t;
          endY = p.y + segDy * t;
          stoppedBy = 'actor';
        }
      }
    }

    const moved = Math.hypot(endX - p.x, endY - p.y);
    p.distTraveled += moved;
    p.x = endX;
    p.y = endY;

    const isFireball = p.kind === 'fireball' || p.kind === 'fireball_split';
    const reachedMaxDist = p.distTraveled >= p.maxDist;
    const expired = p.ttlTicks <= 0;
    const outOfBounds = p.x < 0 || p.x > mgr.mapW || p.y < 0 || p.y > mgr.mapH;

    if (stoppedBy === 'actor' && hitTarget && isTargetValid(hitTarget)) {
      if (isFireball) {
        detonateFireball(mgr, p, p.x, p.y, tick, targets, obsGrid, targetGrid, callbacks);
      } else {
        const owner = mgr.mobById.get(p.ownerMobId);
        const dmgRes = damageMobTarget(
          hitTarget,
          {
            baseDmg: p.dmg,
            dmgKind: p.dmgKind,
            armorPiercePct: p.armorPiercePct > 0 ? p.armorPiercePct : undefined,
            attackerId: p.ownerMobId,
          },
          owner,
          callbacks,
        );
        emitFx(
          mgr,
          {
            type: FX_IMPACT,
            subKind: BANSUNG_FX_IMPACT_FLESH,
            x: p.x,
            y: p.y,
            value: dmgRes.totalDmg,
            kind: p.kind,
            sourceId: p.ownerMobId,
            targetId: hitTarget.id,
          },
          callbacks,
        );

        if (p.knockbackSpeed > 0 && owner) {
          applyKnockbackToEntity(hitTarget, p.x - p.vx * DT_SEC, p.y - p.vy * DT_SEC, p.knockbackSpeed, owner, callbacks);
        }
        if (p.slowPct > 0 && p.slowMs > 0) {
          hitTarget.slowPct = Math.max(hitTarget.slowPct ?? 0, p.slowPct);
          hitTarget.slowMs = Math.max(hitTarget.slowMs ?? 0, p.slowMs);
          if (owner) callbacks?.onApplySlow?.(hitTarget, p.slowPct, p.slowMs, owner);
        }
        if (p.microStunMs > 0 && !hitTarget.ccImmune && (hitTarget.stunImmuneMs ?? 0) <= 0) {
          // Fixed 150 ms micro-stun interrupt: apply directly instead of tripping damage.ts 150 ms scaled floor.
          hitTarget.stunMs = Math.max(hitTarget.stunMs ?? 0, p.microStunMs);
        }
        if (p.dotKind && p.dotDurMs && !dmgRes.blocked && hitTarget.alive && !hitTarget.downed) {
          applyDot(hitTarget, p.dotKind, p.ownerMobId, {
            ...callbacks?.damageCtx,
            durMs: p.dotDurMs,
            tickDmgOverride: p.dotTickDmg,
          });
        }
      }
      mgr.projectiles.splice(i, 1);
      continue;
    }

    if (stoppedBy === 'obstacle' || reachedMaxDist || expired || outOfBounds) {
      if (isFireball) {
        detonateFireball(mgr, p, p.x, p.y, tick, targets, obsGrid, targetGrid, callbacks);
      } else if (stoppedBy === 'obstacle') {
        emitFx(
          mgr,
          {
            type: FX_IMPACT,
            subKind: BANSUNG_FX_IMPACT_WALL,
            x: p.x,
            y: p.y,
            kind: `${p.kind}_wall`,
            sourceId: p.ownerMobId,
          },
          callbacks,
        );
      }
      mgr.projectiles.splice(i, 1);
    }
  }
}

/** Step active ground hazards (`fire_pool`: 90t TTL, deals 4 fire dmg every 15 ticks). */
export function stepMobHazards(
  mgr: MobManager,
  targets: readonly MobCombatEntity[],
  obsGrid: ObstacleGrid | null | undefined,
  targetGrid: ActorGrid | null | undefined,
  callbacks?: MobStepCallbacks,
): void {
  for (let i = mgr.hazards.length - 1; i >= 0; i--) {
    const h = mgr.hazards[i];
    h.ttlTicks--;
    h.ticksUntilPulse--;

    if (h.ticksUntilPulse <= 0) {
      h.ticksUntilPulse = h.tickInterval;
      const hits = gatherAoeTargets(
        targetGrid,
        obsGrid,
        targets,
        h.x,
        h.y,
        h.r,
        'none',
        LAYER_PLAYER | LAYER_PET,
        mgr.emptyObsGrid,
      );
      const hazardOwner = mgr.mobById.get(h.ownerMobId);
      for (const hit of hits) {
        const tgt = hit.target;
        if (!isTargetValid(tgt) || tgt.team === h.team) continue;
        damageMobTarget(
          tgt,
          {
            baseDmg: h.tickDmg,
            dmgKind: h.dmgKind ?? 'fire',
            attackerId: h.ownerMobId,
          },
          hazardOwner,
          callbacks,
        );
      }
    }

    if (h.ttlTicks <= 0) {
      mgr.hazards.splice(i, 1);
    }
  }
}

/** Destroy destructible mob projectiles within `(cx, cy, radius)` (e.g. hero melee sweep). */
export function destroyMobProjectilesInRadius(
  mgr: MobManager,
  cx: number,
  cy: number,
  radius: number,
): number {
  let removed = 0;
  for (let i = mgr.projectiles.length - 1; i >= 0; i--) {
    const p = mgr.projectiles[i];
    if (!p.destructibleByMelee) continue;
    const sumR = radius + p.radius;
    const dx = p.x - cx;
    const dy = p.y - cy;
    if (dx * dx + dy * dy <= sumR * sumR) {
      mgr.projectiles.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/**
 * Resolve physical body-touch/contact damage when an alive, non-stunned,
 * non-frozen mob physically collides with an opposing entity (per-target 24t / 0.8s ICD).
 */
function stepMobContactDamage(
  mgr: MobManager,
  targets: readonly MobCombatEntity[],
  tick: number,
  callbacks?: MobStepCallbacks,
): void {
  if (targets.length === 0 || mgr.mobs.length === 0) return;

  for (let i = 0; i < mgr.mobs.length; i++) {
    const mob = mgr.mobs[i];
    if (!mob.alive || mob.hp <= 0 || mob.stationary) continue;
    if ((mob.stunMs ?? 0) > 0) continue;
    const frozenMs = (mob as MobState & { frozenMs?: number }).frozenMs ?? 0;
    if (frozenMs > 0) continue;
    if (
      mob.state === 'stunned' ||
      mob.state === 'dead' ||
      mob.state === 'windup' ||
      mob.state === 'attack' ||
      mob.state === 'recover' ||
      mob.state === 'lunge' ||
      mob.state === 'fuse'
    ) {
      continue;
    }

    const baseDmg = Math.max(4, Math.round(getScaledDmg(BANSUNG_ENEMIES[mob.kind].damage, mob)));
    // Slight +2px overlap margin while chasing; strict radius overlap on idle/cooldown
    const extraTouch = mob.state === 'chase' ? 2 : 0;

    for (let j = 0; j < targets.length; j++) {
      const t = targets[j];
      if (!isTargetValid(t) || t.team === mob.team) continue;
      const touchR = mob.radius + t.radius + extraTouch;
      const dx = t.x - mob.x;
      const dy = t.y - mob.y;
      if (dx * dx + dy * dy > touchR * touchR) continue;

      const readyAt = mob.contactIcdByTarget.get(t.id) ?? -Infinity;
      if (tick < readyAt) continue;

      const dmgRes = damageMobTarget(
        t,
        {
          baseDmg,
          dmgKind: 'melee',
          attackerId: mob.id,
        },
        mob,
        callbacks,
      );
      if (!dmgRes.blocked) {
        mob.contactIcdByTarget.set(t.id, tick + MOB_CONTACT_ICD_TICKS);
        emitFx(
          mgr,
          {
            type: FX_IMPACT,
            subKind: BANSUNG_FX_IMPACT_FLESH,
            x: t.x,
            y: t.y,
            value: dmgRes.totalDmg,
            kind: 'mob_contact',
            sourceId: mob.id,
            targetId: t.id,
          },
          callbacks,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main 30 Hz Step Entrypoint
// ---------------------------------------------------------------------------

/**
 * Advance all mobs by one 30 Hz server tick (`BANSUNG_TICK_EXACT_MS = 33.333 ms`):
 * 1. Tick statuses & DOTs (`damage.ts`), defusing `bomb_goblin` safely if killed by DOT
 *    or stunned by status effects.
 * 2. Evaluate target threat & AI transitions for all 8 mob archetypes.
 * 3. Run `stepEnemyFlocking` (`flocking.ts`) & enforce playable bounds (`resolveObstacles`).
 * 4. Step ongoing windups, `skirmisher` explicit lunge slides, `bomb_goblin` 42t fuse, and bursts.
 * 5. Step active mob projectiles & `fire_pool` hazards (unless `stepProjectilesAndHazards === false`).
 */
export function stepMobs(mgr: MobManager, opts: StepMobsOptions): void {
  const { tick, targets, obsGrid, enemyGrid, targetGrid, callbacks } = opts;

  // 1. Status / DOT ticks & death/stun checks
  for (let i = 0; i < mgr.mobs.length; i++) {
    const mob = mgr.mobs[i];
    if (!mob.alive) continue;

    const prevStun = mob.stunMs ?? 0;
    tickStatuses(mob, BANSUNG_TICK_EXACT_MS, callbacks?.statusCtx);

    if (!mob.alive || mob.hp <= 0) {
      handleMobDeath(mgr, mob, mob.lastDamagedBy, targets, obsGrid, targetGrid, callbacks);
      continue;
    }

    if ((mob.stunMs ?? 0) > 0 && ((mob.state !== 'stunned' && prevStun <= 0) || mob.state === 'fuse')) {
      cancelMobChanneling(mgr, mob, 'stun');
    }
  }

  // 2. AI targeting & state trigger evaluation
  const targetNumIdById = new Map<string, number>();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (isTargetValid(t)) {
      targetNumIdById.set(t.id, t.numId);
    }
  }
  const aliveMobs: MobState[] = [];
  const flockProxies: FlockEnemy[] = [];
  for (let i = 0; i < mgr.mobs.length; i++) {
    const mob = mgr.mobs[i];
    if (!mob.alive) continue;
    stepMobTargetingAndDecisions(mgr, mob, targets, obsGrid, tick);
    mob.attackCooldown = mob.cooldownTicks;
    syncFlockProxyIn(mob, targetNumIdById);
    aliveMobs.push(mob);
    flockProxies.push(mob.flockProxy);
  }

  // 3. Flocking & steering integration (lunge mobs set `stationary = true` and move explicitly in step 4)
  if (aliveMobs.length > 0) {
    const flockTargets: FlockTarget[] = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!isTargetValid(t)) continue;
      flockTargets.push({
        id: t.numId,
        x: t.x,
        y: t.y,
        radius: t.radius,
        alive: t.alive,
        downed: t.downed,
        scoreOffset: t.scoreOffset,
      });
    }

    stepEnemyFlocking(flockProxies, flockTargets, obsGrid, enemyGrid, tick, {
      mapW: mgr.mapW,
      mapH: mgr.mapH,
      ...opts.flockingOptions,
    });

    for (let i = 0; i < aliveMobs.length; i++) {
      const mob = aliveMobs[i];
      syncFlockProxyOut(mob);
      if (obsGrid) {
        const body: CircleBody = { x: mob.x, y: mob.y, radius: mob.radius };
        const fixed = resolveObstacles(body, obsGrid, mgr.mapW, mgr.mapH, BANSUNG_PLAYABLE_BOUNDS.x0);
        mob.x = clampPlayableX(fixed.x, mob.radius, mgr.mapW);
        mob.y = clampPlayableY(fixed.y, mob.radius, mgr.mapH);
        mob.spatialActor.x = mob.x;
        mob.spatialActor.y = mob.y;
      }
    }
  }

  // 4. Advance active windups, fuse countdown, explicit lunge, sniper bursts, cooldowns, and body contact damage
  for (let i = 0; i < mgr.mobs.length; i++) {
    const mob = mgr.mobs[i];
    if (!mob.alive) continue;
    stepMobActiveChannel(mgr, mob, targets, obsGrid, targetGrid, enemyGrid, tick, callbacks);
  }
  stepMobContactDamage(mgr, targets, tick, callbacks);

  // 5. Projectiles & hazards
  if (opts.stepProjectilesAndHazards !== false) {
    stepMobProjectiles(mgr, targets, obsGrid, targetGrid, tick, callbacks);
    stepMobHazards(mgr, targets, obsGrid, targetGrid, callbacks);
  }

  // Snapshot target positions for Pyro Shaman fallback velocity lead estimation next tick
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (isTargetValid(t)) {
      mgr.prevTargetPos.set(t.id, { x: t.x, y: t.y, tick });
    }
  }
}

/** Remove dead mobs from `mgr` arrays/maps while preserving telegraphs/hazards cleanup. */
export function pruneDeadMobs(mgr: MobManager): number {
  let removed = 0;
  for (let i = mgr.mobs.length - 1; i >= 0; i--) {
    const mob = mgr.mobs[i];
    if (mob.alive) continue;
    mgr.mobs.splice(i, 1);
    mgr.mobById.delete(mob.id);
    mgr.mobByNumId.delete(mob.numId);
    mgr.telegraphs.delete(mob.id);
    removed++;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Wire Serialization & Snapshot Packing
// ---------------------------------------------------------------------------

function mapAiStateToWireByte(mob: MobState): BansungUnitState {
  if (!mob.alive || mob.state === 'dead') return BANSUNG_STATE_DEAD;
  if (mob.state === 'stunned' || (mob.stunMs ?? 0) > 0) return BANSUNG_STATE_STUN;
  if (mob.state === 'lunge') return BANSUNG_STATE_DASH;
  if (mob.state === 'windup' || mob.state === 'attack' || mob.state === 'fuse' || mob.state === 'recover') {
    return BANSUNG_STATE_ATK;
  }
  if (mob.state === 'idle' || (mob.actualSpeed <= 1 && mob.state === 'cooldown')) {
    return BANSUNG_STATE_IDLE;
  }
  return BANSUNG_STATE_RUN;
}

/** Pack a single mob into the 8-element `BansungEnemyTuple` wire format. */
export function toEnemyTuple(mob: MobState): BansungEnemyTuple {
  let flags = 0;
  if (mob.facingLeft) flags |= BANSUNG_EFLAG_LEFT;
  if (mob.elite) flags |= BANSUNG_EFLAG_ELITE;
  if (mob.armorType === 'armored' || mob.flatArmor > 0) flags |= BANSUNG_EFLAG_ARMORED;
  if (mob.state === 'stunned' || (mob.stunMs ?? 0) > 0) flags |= BANSUNG_EFLAG_STUNNED;
  if ((mob.dots?.burn?.leftMs ?? 0) > 0) flags |= BANSUNG_EFLAG_BURNING;
  if ((mob.hitFlashMs ?? 0) > 0) flags |= BANSUNG_EFLAG_HIT_FLASH;
  if (mob.state === 'windup' || mob.state === 'fuse') flags |= BANSUNG_EFLAG_TELEGRAPH;
  if (mob.shield > 0) flags |= BANSUNG_EFLAG_SHIELDED;
  if (mob.evolved) flags |= BANSUNG_EFLAG_EVOLVED;
  flags = encodeEnemyMobLevelFlags(flags, mob.level ?? 1);

  const hpPct = mob.alive && mob.maxHp > 0 ? Math.max(0, Math.min(100, Math.ceil((mob.hp / mob.maxHp) * 100))) : 0;

  return [
    mob.numId,
    BANSUNG_ENEMIES[mob.kind].kindId,
    Math.round(mob.x),
    Math.round(mob.y),
    hpPct,
    quantizeAim(mob.aimAngle),
    mapAiStateToWireByte(mob),
    flags,
  ];
}

/** Pack all alive mobs into `BansungEnemyTuple[]` for snapshot serialization. */
export function packMobs(mgr: MobManager, includeDead = false): BansungEnemyTuple[] {
  const out: BansungEnemyTuple[] = [];
  for (let i = 0; i < mgr.mobs.length; i++) {
    const mob = mgr.mobs[i];
    if (!includeDead && !mob.alive) continue;
    out.push(toEnemyTuple(mob));
  }
  return out;
}

/** Export flat `BansungTelegraph[]` array for snapshot broadcasting. */
export function getMobTelegraphs(mgr: MobManager): BansungTelegraph[] {
  const out: BansungTelegraph[] = [];
  for (const list of mgr.telegraphs.values()) {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      out.push({
        id: t.id,
        kind: t.kind,
        x0: Math.round(t.x0),
        y0: Math.round(t.y0),
        x1: Math.round(t.x1),
        y1: Math.round(t.y1),
        r: Math.round(t.r),
        phase: t.phase,
        color: t.color,
        prog: Math.min(255, Math.max(0, Math.round(t.prog))),
        ...(t.shape !== undefined ? { shape: t.shape } : {}),
        ...(t.halfW !== undefined ? { halfW: Math.round(t.halfW) } : {}),
        ...(t.active !== undefined ? { active: t.active } : {}),
        ...(t.sourceKind !== undefined ? { sourceKind: t.sourceKind } : {}),
      });
    }
  }
  return out;
}

/** Export active `BansungHazard[]` (`fire_pool`) for snapshot broadcasting. */
export function getMobHazards(mgr: MobManager): BansungHazard[] {
  return mgr.hazards.map((h) => ({
    id: h.id,
    kind: h.kind,
    x: Math.round(h.x),
    y: Math.round(h.y),
    r: h.r,
    ttlTicks: h.ttlTicks,
  }));
}

/** Drain queued FX events emitted during the last step(s). */
export function drainMobFx(mgr: MobManager): MobFxEvent[] {
  if (mgr.fxQueue.length === 0) return [];
  const out = mgr.fxQueue.slice();
  mgr.fxQueue.length = 0;
  return out;
}
