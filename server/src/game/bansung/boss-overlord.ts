/**
 * Boss 3: Overlord Gunship Core (`boss_overlord` / `overlord_core`) 30Hz FSM.
 *
 * Implements design spec d39 with zero dependencies on unbuilt sibling modules:
 * - Co-op (1..4+), difficulty, and endless HP & weak-point scaling
 * - Threat-weighted target selection (+40% reviver priority, 15%/s decay) & hover orbit
 * - 4-arm P1 / 6+3-arm counter-rotating P2 bullet-hell spirals (160-projectile cap)
 * - Destructible EMP stun pylons with 30t landing ring, 90t pulse cycle & 150px backlash
 * - LOS-clipped P1 parallel / P2 cross-hatch lane laser grid with lock & burn ticks
 * - Co-op 2..4 orbiting weak-point break loop -> 8% shatter + 2x energy orbs + 1.65x breach stun
 */
import {
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_DIFFICULTY_SCALE,
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_BOSS_LASER,
  BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_STATUS_BOSS_MATRIX,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  FX_DMG,
  FX_STATUS,
  OVERLORD_STATS,
  quantizeAim,
  type ArenaObstacle,
  type BansungArmorType,
  type BansungBossFrame,
  type BansungBossView,
  type BansungDifficultyKey,
  type BansungEmpPylon,
  type BansungLaserLane,
  type BansungTelegraph,
  type BansungUnitState,
  type BansungWeakPointView,
  type OverlordState,
} from '../../../../shared/src';
import {
  BANSUNG_DAMAGE_KIND_INDEX,
  applyBansungDamage,
  applyDot,
  applyStunWithDR,
  tickStatuses,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageHit,
  type BansungDamageKind,
  type BansungDamageResult,
  type BansungDmgEvent,
} from './damage';
import {
  ActorGrid,
  LAYER_ENEMY,
  ObstacleGrid,
  distPointToSegmentSq,
  raycastObstacles,
  type SpatialActor,
} from './spatial';
import type { DanmakuMotionSpec } from './danmaku';
import {
  bulletAngleSpeed,
  createZombieSkillState,
  splitDanmakuMotion,
  stepZombieBossSkills,
  type ZombieSkillState,
} from './boss-zombie-skills';

// ============================================================================
// 1. Constants & Config
// ============================================================================

const DT = 1 / BANSUNG_TICK_HZ;
const TAU = Math.PI * 2;
const PLAYABLE_WALL_MARGIN = 80;

export const OVERLORD_CFG = {
  enterTicks: 15,
  phaseShiftTicks: 30,
  spiralBurstTicks: 108,
  spiralRecoveryP1Ticks: 18,
  spiralRecoveryP2Ticks: 12,
  spiralSpawnOffsetPx: 38,
  spiralProjTtlTicks: 150,
  spiralP1Arms: 4,
  spiralP1Omega: 1.65,
  spiralP1FireEvery: 4,
  spiralP1Speed: 230,
  spiralP2OuterArms: 6,
  spiralP2OuterOmega: 1.85,
  spiralP2OuterFireEvery: 4,
  spiralP2OuterSpeed: 265,
  spiralP2InnerArms: 3,
  spiralP2InnerOmega: -1.45,
  spiralP2InnerFireEvery: 6,
  spiralP2InnerSpeed: 195,
  spiralOrbRadius: 7,
  spiralOrbDmg: 14,
  spiralHeavyRadius: 9,
  spiralHeavyDmg: 18,
  spiralSfxThrottleTicks: 5,

  empInitialCdTicks: 210,
  empCdTicks: 480,
  empDeployAnimTicks: 18,
  empMaxAliveP1: 2,
  empMaxAliveP2: 3,
  empLandingTicks: 30,
  empChargeTicks: 90,
  empMinDistPx: 180,
  empMaxDistPx: 360,
  empPylonBaseHp: 160,
  empPylonRadius: 18,
  empPylonArmor: 2,
  empPulseRadius: 135,
  empPulseDmg: 16,
  empPulseEnergyDrain: 20,
  empPulseStunTicks: 42,
  empBacklashRadius: 150,
  empBacklashMobDmg: 90,
  empBacklashBossStunAdd: 25,
  empBacklashBossRange: 220,
  empBacklashBossBonusDmg: 120,

  laserInitialCdTicks: 108,
  laserCdP1Ticks: 270,
  laserCdP2Ticks: 210,
  laserTelegraphTicks: 40,
  laserLockTicks: 8,
  laserFireTicks: 27,
  laserDamageIntervalTicks: 3,
  laserHalfWidth: 22,
  laserP1Spacing: 140,
  laserP2Spacing: 150,
  laserDmg: 12,
  laserBurnDurMs: 1000,
  laserTrackMaxOmega: 0.75,
  laserMaxRayLen: 2600,

  weakPointCdTicks: 540,
  weakPointAngularSpeed: 0.45,
  weakPointCritMult: 1.5,
  weakPointEnergyOrbAmount: 25,
  weakPointEnergyOrbCount: 2,
  overloadRadius: 220,
  overloadDmg: 28,
  overloadSlowMs: 800,
  overloadSlowPct: 0.35,

  stunGaugeMax: 100,
  stunGaugeDecayPerSec: 4,
  stunGaugeGraceTicks: 120,
  stunGaugeBreakStunTicks: 45,

  threatDecayPerSec: 0.15,
  reviverThreatMult: 1.4,
  retargetIntervalTicks: 15,
  orbitDistPreferred: 260,
  orbitAngularSpeed: 0.55,
  velBlend: 0.22,
} as const;

// ============================================================================
// 2. Public Types & Contracts
// ============================================================================

export interface PlayableBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OverlordSpawnOptions {
  id?: number;
  x?: number;
  y?: number;
  playerCount?: number;
  difficulty?: BansungDifficultyKey | string;
  endlessTier?: number;
  hpMult?: number;
  scale?: number;
  seed?: number;
  nextEntityId?: () => number;
}

export interface OverlordWeakPoint extends BansungWeakPointView {
  angle: number;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
  hitFlashMs: number;
}

export interface OverlordPylon extends BansungEmpPylon {
  radius: number;
  armor: number;
  armorType: BansungArmorType;
  alive: boolean;
  landingTicksLeft: number;
  chargeTicks: number;
  dischargedCount: number;
  hitFlashMs: number;
}

export interface OverlordPlayerTarget extends BansungCombatTarget {
  id: number | string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  reviving?: boolean;
  energy?: number;
  maxEnergy?: number;
  slowMs?: number;
  slowPct?: number;
  reloadMs?: number;
  reloading?: boolean;
  dashTicksLeft?: number;
}

export interface OverlordProjectileSpawn {
  bossId: number;
  kind: 'plasma_orb' | 'heavy_bolt';
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  radius: number;
  dmg: number;
  dmgKind: BansungDamageKind;
  ttlTicks: number;
  team: 1;
  armored: boolean;
  danmaku?: DanmakuMotionSpec;
}

export interface OverlordEnergyOrbDrop {
  x: number;
  y: number;
  energy: number;
}

export interface OverlordEmpPulseEvent {
  pylonId: number;
  x: number;
  y: number;
  radius: number;
  hitPlayerIds: (number | string)[];
}

export interface OverlordBacklashEvent {
  pylonId: number;
  x: number;
  y: number;
  radius: number;
  hitMobIds: number[];
  bossBonusDmg: number;
}

export interface OverlordShockwaveEvent {
  x: number;
  y: number;
  radius: number;
  dmg: number;
  slowMs: number;
}

export interface OverlordLaserHitEvent {
  playerId: number | string;
  laneId: number;
  dmg: number;
}

export interface OverlordCombatContext extends BansungDamageContext {
  actorGrid?: ActorGrid;
  mobs?: readonly (BansungCombatTarget & SpatialActor)[] | ReadonlyMap<number, BansungCombatTarget & SpatialActor>;
  spawnEnergyOrb?: (orb: OverlordEnergyOrbDrop) => void;
  onDamageMob?: (mobId: number, hit: BansungDamageHit) => BansungDamageResult | void;
  onSfx?: (key: string, x: number, y: number) => void;
}

export interface OverlordStepContext extends OverlordCombatContext {
  players: readonly OverlordPlayerTarget[];
  obsGrid: ObstacleGrid;
  activeBossProjectiles?: number;
  playableBounds?: PlayableBounds;
  spawnProjectile?: (proj: OverlordProjectileSpawn) => void;
  onDamagePlayer?: (player: OverlordPlayerTarget, hit: BansungDamageHit) => BansungDamageResult | void;
  onSlowPlayer?: (player: OverlordPlayerTarget, durationMs: number, slowPct: number) => void;
  onDrainEnergy?: (player: OverlordPlayerTarget, amount: number) => void;
  onCancelPlayerAction?: (player: OverlordPlayerTarget) => void;
}

export interface OverlordStepResult {
  stateChanged: boolean;
  enteredPhase2: boolean;
  died: boolean;
  projectiles: OverlordProjectileSpawn[];
  energyOrbs: OverlordEnergyOrbDrop[];
  sfx: { key: string; x: number; y: number }[];
  empPulses: OverlordEmpPulseEvent[];
  backlashes: OverlordBacklashEvent[];
  overloadShockwave?: OverlordShockwaveEvent;
  laserHits: OverlordLaserHitEvent[];
  weakPointBroken: boolean;
  breachTriggered: boolean;
}

export interface OverlordBossView extends BansungBossView {
  overlordState: OverlordState;
  hoverZ: number;
  armor: number;
  damageTakenMul: number;
  stunGauge: number;
  breachTicksLeft: number;
  weakPoints: BansungWeakPointView[];
  pylons: BansungEmpPylon[];
  laserLanes: BansungLaserLane[];
}

export interface OverlordBossState extends BansungCombatTarget, SpatialActor {
  id: number;
  numId: number;
  kind: 'boss_overlord';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hoverZ: number;
  facingLeft: boolean;
  phase: 1 | 2;
  state: OverlordState;
  stateTick: number;
  stateDuration: number;
  aimAngle: number;
  diffMul: number;
  endlessTier: number;
  hpMult: number;
  playerCount: number;
  wpCount: number;
  wpBaseHp: number;
  wpBaseAngle: number;
  weakPoints: OverlordWeakPoint[];
  pylons: OverlordPylon[];
  laserLanes: BansungLaserLane[];
  laserBaseAngle: number;
  laserAnchorX: number;
  laserAnchorY: number;
  spiralOuterAngle: number;
  spiralInnerAngle: number;
  spiralShotSeq: number;
  spiralSfxCd: number;
  recoveryTicks: number;
  empCd: number;
  laserCd: number;
  weakPointCd: number;
  stunGauge: number;
  stunGaugeGraceTicks: number;
  shockStunTicks: number;
  phase2Triggered: boolean;
  pendingPhaseShift: boolean;
  orbitAngle: number;
  orbitDir: 1 | -1;
  targetId: number | string | null;
  retargetTicks: number;
  threatById: Map<number | string, number>;
  rngState: number;
  nextLocalId: number;
  pendingBacklashes: OverlordPylon[];
  /** Đêm Zombie v2: skill mới Plague Galaxy / Toxic Bloom (xem boss-zombie-skills.ts). */
  zombieSkills?: ZombieSkillState;
  zombieTelegraphs?: BansungTelegraph[];
}

// ============================================================================
// 3. Scratch Buffers & Internal Utilities
// ============================================================================

const tmpObs: ArenaObstacle[] = [];
const tmpActors: SpatialActor[] = [];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  if (r > Math.PI) r -= TAU;
  return r;
}

function quantizeAngle255(rad: number): number {
  const norm = ((rad % TAU) + TAU) % TAU;
  return Math.round((norm / TAU) * 255) & 255;
}

function nextDeterministicRand(boss: OverlordBossState, extRng?: () => number): number {
  if (extRng) return extRng();
  let s = (boss.rngState + 0x6d2b79f5) >>> 0;
  boss.rngState = s;
  s = Math.imul(s ^ (s >>> 15), 1 | s);
  s = (s + Math.imul(s ^ (s >>> 7), 61 | s)) ^ s;
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

function allocSubId(boss: OverlordBossState): number {
  boss.nextLocalId += 1;
  return boss.nextLocalId;
}

function resolveBounds(obsGrid: ObstacleGrid, custom?: PlayableBounds): PlayableBounds {
  if (custom) return custom;
  if (obsGrid.mapW === BANSUNG_MAP_W && obsGrid.mapH === BANSUNG_MAP_H) {
    return BANSUNG_PLAYABLE_BOUNDS;
  }
  return { x0: 0, y0: 0, x1: obsGrid.mapW, y1: obsGrid.mapH };
}

function clampBossInsideBounds(boss: OverlordBossState, bounds: PlayableBounds): void {
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  const padX = spanX > PLAYABLE_WALL_MARGIN * 2 + 16 ? PLAYABLE_WALL_MARGIN : boss.radius + 4;
  const padY = spanY > PLAYABLE_WALL_MARGIN * 2 + 16 ? PLAYABLE_WALL_MARGIN : boss.radius + 4;
  const minX = bounds.x0 + padX;
  const maxX = bounds.x1 - padX;
  const minY = bounds.y0 + padY;
  const maxY = bounds.y1 - padY;
  boss.x = minX <= maxX ? clamp(boss.x, minX, maxX) : (bounds.x0 + bounds.x1) * 0.5;
  boss.y = minY <= maxY ? clamp(boss.y, minY, maxY) : (bounds.y0 + bounds.y1) * 0.5;
}

function isTallSolidObstacle(o: ArenaObstacle): boolean {
  if (!o.alive || !o.blocksMove) return false;
  // Hovering gunship collides with tall cover/walls (blocksLos) and ignores low ground props.
  return o.blocksLos || (o.kind === 'wall' && !o.destructible);
}

function pushCircleOutOfObstacle(boss: OverlordBossState, o: ArenaObstacle): void {
  const r = boss.radius;
  const qx = clamp(boss.x, o.x, o.x + o.w);
  const qy = clamp(boss.y, o.y, o.y + o.h);
  const vx = boss.x - qx;
  const vy = boss.y - qy;
  const d2 = vx * vx + vy * vy;

  if (d2 > 0) {
    if (d2 < r * r) {
      const d = Math.sqrt(d2);
      const push = r - d;
      boss.x += (vx / d) * push;
      boss.y += (vy / d) * push;
    }
    return;
  }

  const dl = boss.x - o.x;
  const dr = o.x + o.w - boss.x;
  const dt = boss.y - o.y;
  const db = o.y + o.h - boss.y;
  const minD = Math.min(dl, dr, dt, db);
  if (minD === dl) boss.x -= dl + r;
  else if (minD === dr) boss.x += dr + r;
  else if (minD === dt) boss.y -= dt + r;
  else boss.y += db + r;
}

function moveHoverCircle(
  boss: OverlordBossState,
  dx: number,
  dy: number,
  obsGrid: ObstacleGrid,
  bounds: PlayableBounds,
): void {
  const dist = Math.hypot(dx, dy);
  const steps = dist <= 0 ? 1 : Math.min(8, Math.max(1, Math.ceil(dist / 8)));
  const sx = dx / steps;
  const sy = dy / steps;
  const r = boss.radius;

  for (let s = 0; s < steps; s++) {
    if (dist > 0) {
      boss.x += sx;
      boss.y += sy;
    }
    obsGrid.queryAabb(boss.x - r, boss.y - r, boss.x + r, boss.y + r, tmpObs);
    for (let i = 0; i < tmpObs.length; i++) {
      const o = tmpObs[i];
      if (isTallSolidObstacle(o)) {
        pushCircleOutOfObstacle(boss, o);
      }
    }
    clampBossInsideBounds(boss, bounds);
  }
}

function clipRayToBox(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDist: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): [number, number] {
  let tEnd = maxDist;
  if (Math.abs(dx) > 1e-9) {
    const tX = dx > 0 ? (maxX - ox) / dx : (minX - ox) / dx;
    if (tX >= 0 && tX < tEnd) tEnd = tX;
  }
  if (Math.abs(dy) > 1e-9) {
    const tY = dy > 0 ? (maxY - oy) / dy : (minY - oy) / dy;
    if (tY >= 0 && tY < tEnd) tEnd = tY;
  }
  const safeT = Math.max(0, tEnd);
  return [ox + dx * safeT, oy + dy * safeT];
}

function clipRayWithLos(
  obsGrid: ObstacleGrid,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  maxDist: number,
): [number, number] {
  const [ex, ey] = clipRayToBox(ox, oy, dirX, dirY, maxDist, 0, 0, obsGrid.mapW, obsGrid.mapH);
  const hit = raycastObstacles(obsGrid, ox, oy, ex, ey, 0, 'los');
  if (hit) {
    return [hit.x, hit.y];
  }
  return [ex, ey];
}

function emitFx(
  ctx: OverlordCombatContext | undefined,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  if (ctx?.fx) {
    ctx.fx.push(a, b, c, d, e, f);
  }
}

function emitSfx(
  key: string,
  x: number,
  y: number,
  ctx?: OverlordCombatContext,
  res?: OverlordStepResult,
): void {
  ctx?.onSfx?.(key, x, y);
  res?.sfx.push({ key, x, y });
}

function syncBossCombatProfile(boss: OverlordBossState): void {
  if (boss.state === 'dead' || !boss.alive) {
    boss.alive = false;
    boss.flatArmor = OVERLORD_STATS.baseArmor;
    boss.damageReduction = 0;
    boss.vulnMult = 1;
    boss.ccImmune = true;
    return;
  }
  if (boss.state === 'weakpoint_matrix') {
    boss.flatArmor = OVERLORD_STATS.matrixArmor;
    boss.damageReduction = 0.55;
    boss.vulnMult = 1;
    boss.ccImmune = false;
    return;
  }
  if (boss.state === 'breach_stun') {
    boss.flatArmor = 0;
    boss.damageReduction = 0;
    boss.vulnMult = OVERLORD_STATS.breachDamageMul;
    boss.ccImmune = true;
    return;
  }
  if (boss.state === 'enter' || boss.state === 'phase_shift') {
    boss.flatArmor = OVERLORD_STATS.baseArmor;
    boss.damageReduction = OVERLORD_STATS.baseDr;
    boss.vulnMult = 1;
    boss.ccImmune = true;
    return;
  }
  boss.flatArmor = OVERLORD_STATS.baseArmor;
  boss.damageReduction = OVERLORD_STATS.baseDr;
  boss.vulnMult = 1;
  boss.ccImmune = false;
}

// ============================================================================
// 4. Spawn & Threat Helpers
// ============================================================================

/** Creates a newly spawned Overlord Gunship Core boss scaled by players, difficulty, and endless tier. */
export function createOverlordBoss(opts: OverlordSpawnOptions = {}): OverlordBossState {
  const nPlayers = Math.max(1, Math.min(10, Math.round(opts.playerCount ?? 1)));
  const diffKey = (opts.difficulty ?? 'normal') as BansungDifficultyKey;
  const diffMul = BANSUNG_DIFFICULTY_SCALE[diffKey]?.bossHp ?? 1.0;
  const endlessTier = Math.max(0, Math.floor(opts.endlessTier ?? 0));
  const hpMult = Math.max(0.1, opts.hpMult ?? 1.0);

  const maxHp = Math.max(
    1,
    Math.round(
      OVERLORD_STATS.baseHp *
        (1 + OVERLORD_STATS.coOpHpPerExtraPlayer * (nPlayers - 1)) *
        diffMul *
        (1 + OVERLORD_STATS.endlessHpScale * endlessTier) *
        hpMult,
    ),
  );
  const wpCount = Math.min(4, 1 + nPlayers);
  const wpBaseHp = Math.max(
    40,
    Math.round(OVERLORD_STATS.weakPointBaseHp * diffMul * (1 + 0.25 * endlessTier) * hpMult),
  );

  const id = opts.id ?? 9003;
  const x = opts.x ?? BANSUNG_ARENA_CX;
  const y = opts.y ?? BANSUNG_ARENA_CY;
  const scale = Math.max(0.45, Math.min(2.2, opts.scale ?? 1));
  const scaledRadius = Math.max(20, Math.round(OVERLORD_STATS.radius * scale));

  return {
    id,
    numId: id,
    kind: 'boss_overlord',
    x,
    y,
    vx: 0,
    vy: 0,
    hoverZ: OVERLORD_STATS.hoverZ,
    radius: scaledRadius,
    team: 1,
    layer: LAYER_ENEMY,
    tier: 'boss',
    armorType: OVERLORD_STATS.armorType,
    flatArmor: OVERLORD_STATS.baseArmor,
    alive: true,
    downed: false,
    hp: maxHp,
    maxHp,
    shield: 0,
    maxShield: 0,
    hitIframesMs: 0,
    hitFlashMs: 0,
    ccImmune: true,
    stunMs: 0,
    stunImmuneMs: 0,
    stunDrStage: 0,
    stunDrResetMs: 0,
    dots: {},
    speed: OVERLORD_STATS.speedP1,
    vulnMult: 1.0,
    damageReduction: 0,
    facingLeft: false,
    phase: 1,
    state: 'enter',
    stateTick: OVERLORD_CFG.enterTicks,
    stateDuration: OVERLORD_CFG.enterTicks,
    aimAngle: 0,
    diffMul,
    endlessTier,
    hpMult,
    playerCount: nPlayers,
    wpCount,
    wpBaseHp,
    wpBaseAngle: 0,
    weakPoints: [],
    pylons: [],
    laserLanes: [],
    laserBaseAngle: 0,
    laserAnchorX: x,
    laserAnchorY: y,
    spiralOuterAngle: 0,
    spiralInnerAngle: 0,
    spiralShotSeq: 0,
    spiralSfxCd: 0,
    recoveryTicks: 0,
    empCd: OVERLORD_CFG.empInitialCdTicks,
    laserCd: OVERLORD_CFG.laserInitialCdTicks,
    weakPointCd: OVERLORD_CFG.weakPointCdTicks,
    stunGauge: 0,
    stunGaugeGraceTicks: 0,
    shockStunTicks: 0,
    phase2Triggered: false,
    pendingPhaseShift: false,
    orbitAngle: 0,
    orbitDir: 1,
    targetId: null,
    retargetTicks: 0,
    threatById: new Map(),
    rngState: (opts.seed ?? 0x51a7b055) >>> 0,
    nextLocalId: id * 100 + 1,
    pendingBacklashes: [],
    zombieSkills: createZombieSkillState(opts.difficulty ?? 'normal'),
    zombieTelegraphs: [],
  };
}

/** Records player damage/aggro threat toward the Overlord. */
export function addOverlordThreat(
  boss: OverlordBossState,
  attackerId: number | string | undefined,
  amount: number,
): void {
  if (attackerId === undefined || !Number.isFinite(amount) || amount <= 0) return;
  const prev = boss.threatById.get(attackerId) ?? 0;
  boss.threatById.set(attackerId, prev + amount);
}

function selectOverlordTarget(
  boss: OverlordBossState,
  players: readonly OverlordPlayerTarget[],
): OverlordPlayerTarget | undefined {
  const decayFactor = Math.pow(1 - OVERLORD_CFG.threatDecayPerSec, DT);
  for (const [k, val] of boss.threatById) {
    const next = val * decayFactor;
    if (next <= 0.05) boss.threatById.delete(k);
    else boss.threatById.set(k, next);
  }

  let best: OverlordPlayerTarget | undefined;
  let bestScore = -1;
  let currentTargetAlive: OverlordPlayerTarget | undefined;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.alive || p.downed || p.hp <= 0) continue;
    if (p.id === boss.targetId) currentTargetAlive = p;

    const d = Math.hypot(p.x - boss.x, p.y - boss.y);
    const threat = boss.threatById.get(p.id) ?? 0;
    const baseScore = threat + 800 / Math.max(80, d);
    const reviverMult = p.reviving ? OVERLORD_CFG.reviverThreatMult : 1.0;
    const score = baseScore * reviverMult;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best) {
    boss.targetId = null;
    return undefined;
  }

  if (boss.retargetTicks > 0 && currentTargetAlive) {
    boss.retargetTicks -= 1;
    // Still immediately prioritize an active reviver if they beat current score
    if (!best.reviving) {
      return currentTargetAlive;
    }
  }

  boss.targetId = best.id;
  boss.retargetTicks = OVERLORD_CFG.retargetIntervalTicks;
  return best;
}

// ============================================================================
// 5. State Transitions, Weak-Points, Pylons & Laser Grid
// ============================================================================

function clearActiveAttacks(boss: OverlordBossState): void {
  boss.laserLanes.length = 0;
  boss.vx = 0;
  boss.vy = 0;
}

function enterDeadState(
  boss: OverlordBossState,
  ctx?: OverlordCombatContext,
  res?: OverlordStepResult,
): void {
  if (boss.state === 'dead') return;
  boss.state = 'dead';
  boss.alive = false;
  boss.hp = 0;
  boss.stateTick = 0;
  boss.stateDuration = 0;
  boss.weakPoints.length = 0;
  boss.pylons.length = 0;
  clearActiveAttacks(boss);
  syncBossCombatProfile(boss);
  emitFx(ctx, FX_DEATH, BANSUNG_ENEMIES.boss_overlord.kindId, Math.round(boss.x), Math.round(boss.y), 3, 0);
  if (res) {
    res.died = true;
    res.stateChanged = true;
  }
}

function enterPhaseShiftState(
  boss: OverlordBossState,
  ctx?: OverlordCombatContext,
  res?: OverlordStepResult,
): void {
  boss.phase = 2;
  boss.phase2Triggered = true;
  boss.pendingPhaseShift = false;
  boss.speed = OVERLORD_STATS.speedP2;
  boss.state = 'phase_shift';
  boss.stateTick = OVERLORD_CFG.phaseShiftTicks;
  boss.stateDuration = OVERLORD_CFG.phaseShiftTicks;
  clearActiveAttacks(boss);
  syncBossCombatProfile(boss);
  emitFx(
    ctx,
    FX_BLAST,
    BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
    Math.round(boss.x),
    Math.round(boss.y),
    180,
    boss.id,
  );
  if (res) res.enteredPhase2 = true;
}

function updateWeakPointPositions(boss: OverlordBossState): void {
  const count = boss.weakPoints.length;
  if (count === 0) return;
  const r = OVERLORD_STATS.weakPointOrbitR;
  for (let i = 0; i < count; i++) {
    const wp = boss.weakPoints[i];
    const ang = wrapAngle(boss.wpBaseAngle + (i * TAU) / count);
    wp.angle = ang;
    wp.angQ = quantizeAngle255(ang);
    wp.x = boss.x + Math.cos(ang) * r;
    wp.y = boss.y + Math.sin(ang) * r;
  }
}

/** Enters `weakpoint_matrix` and spawns `2..4` orbiting weak-point nodes. */
export function enterWeakPointMatrix(
  boss: OverlordBossState,
  ctx?: OverlordCombatContext,
  res?: OverlordStepResult,
): void {
  if (!boss.alive || boss.state === 'dead') return;
  boss.state = 'weakpoint_matrix';
  boss.stateTick = OVERLORD_STATS.weakPointWindowTicks;
  boss.stateDuration = OVERLORD_STATS.weakPointWindowTicks;
  boss.weakPointCd = OVERLORD_CFG.weakPointCdTicks;
  boss.laserLanes.length = 0;
  boss.wpBaseAngle = 0;

  boss.weakPoints.length = 0;
  for (let i = 0; i < boss.wpCount; i++) {
    boss.weakPoints.push({
      idx: i,
      angQ: 0,
      hp: boss.wpBaseHp,
      maxHp: boss.wpBaseHp,
      angle: 0,
      x: boss.x,
      y: boss.y,
      radius: OVERLORD_STATS.weakPointRadius,
      alive: true,
      hitFlashMs: 0,
    });
  }
  updateWeakPointPositions(boss);
  syncBossCombatProfile(boss);
  emitFx(
    ctx,
    FX_STATUS,
    boss.id,
    BANSUNG_FX_STATUS_BOSS_MATRIX,
    1,
    Math.round(boss.x),
    Math.round(boss.y),
  );
  emitSfx('sfx_laser_charge', boss.x, boss.y, ctx, res);
}

function triggerWeakPointBreach(
  boss: OverlordBossState,
  ctx?: OverlordStepContext | OverlordCombatContext,
  res?: OverlordStepResult,
): OverlordEnergyOrbDrop[] {
  clearActiveAttacks(boss);
  boss.weakPoints.length = 0;

  // Instant 8% maxHp shatter burst bypassing matrix armor & shield DR
  const shatterDmg = Math.max(1, Math.round(boss.maxHp * OVERLORD_STATS.breachBurstPct));
  const applied = Math.min(boss.hp, shatterDmg);
  boss.hp -= applied;
  boss.hitFlashMs = 90;

  emitFx(ctx, FX_DMG, Math.round(boss.x), Math.round(boss.y), applied, 1, boss.id);
  emitFx(
    ctx,
    FX_BLAST,
    BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
    Math.round(boss.x),
    Math.round(boss.y),
    140,
    boss.id,
  );
  emitSfx('sfx_weakpoint_break', boss.x, boss.y, ctx, res);
  ctx?.popups?.push([boss.id, applied, 1, BANSUNG_DAMAGE_KIND_INDEX.true]);

  const orbs: OverlordEnergyOrbDrop[] = [
    { x: boss.x - 32, y: boss.y + 14, energy: OVERLORD_CFG.weakPointEnergyOrbAmount },
    { x: boss.x + 32, y: boss.y + 14, energy: OVERLORD_CFG.weakPointEnergyOrbAmount },
  ];
  for (let i = 0; i < orbs.length; i++) {
    ctx?.spawnEnergyOrb?.(orbs[i]);
    res?.energyOrbs.push(orbs[i]);
  }

  if (res) {
    res.weakPointBroken = true;
    res.stateChanged = true;
  }

  if (boss.hp <= 0) {
    enterDeadState(boss, ctx, res);
    return orbs;
  }

  boss.state = 'breach_stun';
  boss.stateTick = OVERLORD_STATS.breachStunTicks;
  boss.stateDuration = OVERLORD_STATS.breachStunTicks;
  boss.stunMs = Math.max(boss.stunMs ?? 0, OVERLORD_STATS.breachStunTicks * BANSUNG_TICK_EXACT_MS);
  syncBossCombatProfile(boss);
  if (res) res.breachTriggered = true;
  return orbs;
}

function findClearPylonPoint(
  boss: OverlordBossState,
  obsGrid: ObstacleGrid,
  bounds: PlayableBounds,
  extRng?: () => number,
): [number, number] {
  const pad = 48;
  const minX = bounds.x0 + pad;
  const maxX = bounds.x1 - pad;
  const minY = bounds.y0 + pad;
  const maxY = bounds.y1 - pad;
  const rCheck = OVERLORD_CFG.empPylonRadius + 12;

  for (let attempt = 0; attempt < 24; attempt++) {
    const ang = nextDeterministicRand(boss, extRng) * TAU;
    const dist =
      OVERLORD_CFG.empMinDistPx +
      nextDeterministicRand(boss, extRng) * (OVERLORD_CFG.empMaxDistPx - OVERLORD_CFG.empMinDistPx);
    const px = clamp(boss.x + Math.cos(ang) * dist, minX, maxX);
    const py = clamp(boss.y + Math.sin(ang) * dist, minY, maxY);

    obsGrid.queryCircle(px, py, rCheck, tmpObs, 'move');
    if (tmpObs.length > 0) continue;

    let tooClose = false;
    for (let j = 0; j < boss.pylons.length; j++) {
      const ex = boss.pylons[j];
      if (!ex.alive) continue;
      if (Math.hypot(px - ex.x, py - ex.y) < 90) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      return [Math.round(px), Math.round(py)];
    }
  }

  return [
    Math.round(clamp(boss.x + 180, minX, maxX)),
    Math.round(clamp(boss.y, minY, maxY)),
  ];
}

function deployEmpPylons(
  boss: OverlordBossState,
  ctx: OverlordStepContext,
  bounds: PlayableBounds,
  res: OverlordStepResult,
): void {
  const maxAlive = boss.phase === 1 ? OVERLORD_CFG.empMaxAliveP1 : OVERLORD_CFG.empMaxAliveP2;
  let aliveCount = 0;
  for (let i = 0; i < boss.pylons.length; i++) {
    if (boss.pylons[i].alive) aliveCount++;
  }
  const toSpawn = Math.max(0, maxAlive - aliveCount);
  const pylonHp = Math.max(40, Math.round(OVERLORD_CFG.empPylonBaseHp * boss.diffMul));

  for (let i = 0; i < toSpawn; i++) {
    const [px, py] = findClearPylonPoint(boss, ctx.obsGrid, bounds, ctx.rng);
    boss.pylons.push({
      id: allocSubId(boss),
      x: px,
      y: py,
      hp: pylonHp,
      maxHp: pylonHp,
      chargeQ: 0,
      radius: OVERLORD_CFG.empPylonRadius,
      armor: OVERLORD_CFG.empPylonArmor,
      armorType: 'armored',
      alive: true,
      landingTicksLeft: OVERLORD_CFG.empLandingTicks,
      chargeTicks: 0,
      dischargedCount: 0,
      hitFlashMs: 0,
    });
  }

  boss.empCd = OVERLORD_CFG.empCdTicks;
  if (toSpawn > 0) {
    emitSfx('sfx_emp_charge', boss.x, boss.y, ctx, res);
  }
}

function resolvePylonBacklash(
  boss: OverlordBossState,
  pylon: OverlordPylon,
  ctx?: OverlordCombatContext,
  res?: OverlordStepResult,
): void {
  const hitMobIds: number[] = [];
  const dmgCtx: BansungDamageContext = {
    rng: ctx?.rng,
    popups: ctx?.popups,
    fx: ctx?.fx,
  };

  if (ctx?.actorGrid) {
    ctx.actorGrid.queryCircle(
      pylon.x,
      pylon.y,
      OVERLORD_CFG.empBacklashRadius,
      LAYER_ENEMY,
      tmpActors,
    );
    for (let i = 0; i < tmpActors.length; i++) {
      const actor = tmpActors[i];
      if (!actor.alive || actor.id === boss.id) continue;
      hitMobIds.push(actor.id);
      const shockHit: BansungDamageHit = {
        baseDmg: OVERLORD_CFG.empBacklashMobDmg,
        dmgKind: 'energy',
        bypassShield: true,
      };
      if (ctx.onDamageMob) {
        ctx.onDamageMob(actor.id, shockHit);
      } else if (ctx.mobs) {
        const target =
          'get' in ctx.mobs
            ? ctx.mobs.get(actor.id)
            : ctx.mobs.find((m) => m.id === actor.id);
        if (target) applyBansungDamage(target, shockHit, dmgCtx);
      }
    }
  } else if (ctx?.mobs) {
    const r2 = OVERLORD_CFG.empBacklashRadius * OVERLORD_CFG.empBacklashRadius;
    const list = 'get' in ctx.mobs ? [...ctx.mobs.values()] : ctx.mobs;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.alive || m.id === boss.id) continue;
      const dx = m.x - pylon.x;
      const dy = m.y - pylon.y;
      if (dx * dx + dy * dy <= r2) {
        hitMobIds.push(m.id);
        const shockHit: BansungDamageHit = {
          baseDmg: OVERLORD_CFG.empBacklashMobDmg,
          dmgKind: 'energy',
          bypassShield: true,
        };
        if (ctx.onDamageMob) ctx.onDamageMob(m.id, shockHit);
        else applyBansungDamage(m, shockHit, dmgCtx);
      }
    }
  }

  let bossBonusDmg = 0;
  if (boss.alive && boss.state !== 'dead') {
    boss.stunGauge = Math.min(OVERLORD_CFG.stunGaugeMax, boss.stunGauge + OVERLORD_CFG.empBacklashBossStunAdd);
    boss.stunGaugeGraceTicks = OVERLORD_CFG.stunGaugeGraceTicks;

    const dBoss = Math.hypot(boss.x - pylon.x, boss.y - pylon.y);
    if (dBoss <= OVERLORD_CFG.empBacklashBossRange) {
      const bonusRes = damageOverlordBoss(
        boss,
        { baseDmg: OVERLORD_CFG.empBacklashBossBonusDmg, dmgKind: 'energy', bypassShield: true },
        ctx,
      );
      bossBonusDmg = bonusRes.totalDmg;
    }

    if (boss.alive && boss.stunGauge >= OVERLORD_CFG.stunGaugeMax && !boss.ccImmune) {
      boss.stunGauge = 0;
      boss.shockStunTicks = Math.max(boss.shockStunTicks, OVERLORD_CFG.stunGaugeBreakStunTicks);
      boss.stunMs = Math.max(
        boss.stunMs ?? 0,
        OVERLORD_CFG.stunGaugeBreakStunTicks * BANSUNG_TICK_EXACT_MS,
      );
      clearActiveAttacks(boss);
    }
  }

  emitFx(
    ctx,
    FX_BLAST,
    BANSUNG_FX_BLAST_STUN,
    Math.round(pylon.x),
    Math.round(pylon.y),
    OVERLORD_CFG.empBacklashRadius,
    boss.id,
  );
  emitSfx('sfx_emp_pulse', pylon.x, pylon.y, ctx, res);
  res?.backlashes.push({
    pylonId: pylon.id,
    x: pylon.x,
    y: pylon.y,
    radius: OVERLORD_CFG.empBacklashRadius,
    hitMobIds,
    bossBonusDmg,
  });
}

function tickPylons(
  boss: OverlordBossState,
  ctx: OverlordStepContext,
  res: OverlordStepResult,
): void {
  // Drain any pylon backlashes queued outside step()
  while (boss.pendingBacklashes.length > 0) {
    const p = boss.pendingBacklashes.shift()!;
    resolvePylonBacklash(boss, p, ctx, res);
  }

  const pauseCharge = boss.state === 'breach_stun' || boss.state === 'phase_shift';

  for (let i = boss.pylons.length - 1; i >= 0; i--) {
    const p = boss.pylons[i];
    if (!p.alive || p.hp <= 0) {
      boss.pylons.splice(i, 1);
      continue;
    }
    if (p.hitFlashMs > 0) {
      p.hitFlashMs = Math.max(0, p.hitFlashMs - BANSUNG_TICK_EXACT_MS);
    }
    if (p.landingTicksLeft > 0) {
      p.landingTicksLeft -= 1;
      continue;
    }
    if (pauseCharge) continue;

    p.chargeTicks += 1;
    p.chargeQ = Math.min(100, Math.round((p.chargeTicks / OVERLORD_CFG.empChargeTicks) * 100));

    if (p.chargeTicks >= OVERLORD_CFG.empChargeTicks) {
      p.chargeTicks = 0;
      p.chargeQ = 0;
      p.dischargedCount += 1;

      const hitPlayerIds: (number | string)[] = [];
      const pulseR = OVERLORD_CFG.empPulseRadius;
      for (let j = 0; j < ctx.players.length; j++) {
        const hero = ctx.players[j];
        if (!hero.alive || hero.downed || hero.hp <= 0) continue;
        if ((hero.dashIframesMs ?? 0) > 0 || (hero.shieldBuffMs ?? 0) > 0) continue;
        const d = Math.hypot(hero.x - p.x, hero.y - p.y);
        if (d > pulseR + hero.radius) continue;

        hitPlayerIds.push(hero.id);
        const empHit: BansungDamageHit = {
          baseDmg: OVERLORD_CFG.empPulseDmg,
          dmgKind: 'energy',
        };
        if (ctx.onDamagePlayer) {
          ctx.onDamagePlayer(hero, empHit);
        } else {
          applyBansungDamage(hero, empHit, { rng: ctx.rng, popups: ctx.popups, fx: ctx.fx });
        }

        if (ctx.onDrainEnergy) {
          ctx.onDrainEnergy(hero, OVERLORD_CFG.empPulseEnergyDrain);
        } else if (typeof hero.energy === 'number') {
          hero.energy = Math.max(0, hero.energy - OVERLORD_CFG.empPulseEnergyDrain);
        }

        if (ctx.onCancelPlayerAction) {
          ctx.onCancelPlayerAction(hero);
        } else {
          hero.reloading = false;
          hero.reloadMs = 0;
          hero.dashTicksLeft = 0;
        }

        applyStunWithDR(hero, OVERLORD_CFG.empPulseStunTicks * BANSUNG_TICK_EXACT_MS, {
          popups: ctx.popups,
          fx: ctx.fx,
        });
      }

      emitFx(ctx, FX_BLAST, BANSUNG_FX_BLAST_STUN, Math.round(p.x), Math.round(p.y), pulseR, p.id);
      emitSfx('sfx_emp_pulse', p.x, p.y, ctx, res);
      res.empPulses.push({
        pylonId: p.id,
        x: p.x,
        y: p.y,
        radius: pulseR,
        hitPlayerIds,
      });
    }
  }

  // Zulan / Ikaruga Destructible EMP Pylon Laser Tethers:
  // When >= 2 landed pylons are alive and charged >= 56t, project active plasma walls between pairs!
  // Shooting down a pylon immediately collapses its laser wall.
  if (!pauseCharge && boss.pylons.length >= 2) {
    const landed: OverlordPylon[] = [];
    for (let i = 0; i < boss.pylons.length; i++) {
      const py = boss.pylons[i];
      if (py.alive && py.hp > 0 && py.landingTicksLeft <= 0) landed.push(py);
    }
    if (landed.length >= 2) {
      const pairLimit = landed.length === 2 ? 1 : landed.length;
      for (let k = 0; k < pairLimit; k++) {
        const pA = landed[k];
        const pB = landed[(k + 1) % landed.length];
        const maxChg = Math.max(pA.chargeTicks, pB.chargeTicks);
        if (maxChg < 56) continue;
        // Skip tether if blocked by solid cover pillar
        if (raycastObstacles(ctx.obsGrid, pA.x, pA.y, pB.x, pB.y, 0, 'los') !== null) continue;
        if (maxChg % 4 === 0) {
          emitFx(
            ctx,
            FX_BEAM,
            Math.round(pA.x),
            Math.round(pA.y),
            Math.round(pB.x),
            Math.round(pB.y),
            BANSUNG_FX_BEAM_BOSS_LASER,
          );
        }
        if (maxChg % 6 === 2) {
          for (let j = 0; j < ctx.players.length; j++) {
            const hero = ctx.players[j];
            if (!hero.alive || hero.downed || hero.hp <= 0) continue;
            if ((hero.dashIframesMs ?? 0) > 0 || (hero.shieldBuffMs ?? 0) > 0) continue;
            const hitR = 13 + hero.radius;
            if (distPointToSegmentSq(hero.x, hero.y, pA.x, pA.y, pB.x, pB.y) <= hitR * hitR) {
              const tetherHit: BansungDamageHit = { baseDmg: 9, dmgKind: 'energy' };
              if (ctx.onDamagePlayer) {
                ctx.onDamagePlayer(hero, tetherHit);
              } else {
                applyBansungDamage(hero, tetherHit, { rng: ctx.rng, popups: ctx.popups, fx: ctx.fx });
              }
            }
          }
        }
      }
    }
  }
}

function selectPlayerClusterTarget(
  boss: OverlordBossState,
  players: readonly OverlordPlayerTarget[],
): { x: number; y: number; angle: number } {
  const living: OverlordPlayerTarget[] = [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.alive && !p.downed && p.hp > 0) living.push(p);
  }
  if (living.length === 0) {
    return {
      x: boss.x + Math.cos(boss.aimAngle) * 240,
      y: boss.y + Math.sin(boss.aimAngle) * 240,
      angle: boss.aimAngle,
    };
  }
  if (living.length === 1) {
    const p = living[0];
    return { x: p.x, y: p.y, angle: Math.atan2(p.y - boss.y, p.x - boss.x) };
  }

  let bestScore = -1;
  let cx = living[0].x;
  let cy = living[0].y;
  for (let i = 0; i < living.length; i++) {
    const a = living[i];
    let weightSum = 0;
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < living.length; j++) {
      const b = living[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= 280) {
        const w = 1 / (1 + d / 180);
        weightSum += w;
        sx += b.x * w;
        sy += b.y * w;
      }
    }
    if (weightSum > bestScore) {
      bestScore = weightSum;
      cx = sx / weightSum;
      cy = sy / weightSum;
    }
  }
  return { x: cx, y: cy, angle: Math.atan2(cy - boss.y, cx - boss.x) };
}

function buildClippedLane(
  id: number,
  obsGrid: ObstacleGrid,
  mx: number,
  my: number,
  ux: number,
  uy: number,
  phase: BansungLaserLane['phase'],
  ticksLeft: number,
): BansungLaserLane {
  const maxLen = OVERLORD_CFG.laserMaxRayLen;
  const cx = Math.max(0, Math.min(obsGrid.mapW, mx));
  const cy = Math.max(0, Math.min(obsGrid.mapH, my));
  const [x1, y1] = clipRayWithLos(obsGrid, cx, cy, -ux, -uy, maxLen);
  const [x2, y2] = clipRayWithLos(obsGrid, cx, cy, ux, uy, maxLen);
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    halfW: OVERLORD_CFG.laserHalfWidth,
    phase,
    ticksLeft,
  };
}

function rebuildLaserGrid(
  boss: OverlordBossState,
  obsGrid: ObstacleGrid,
  phase: BansungLaserLane['phase'],
  ticksLeft: number,
): void {
  const cos = Math.cos(boss.laserBaseAngle);
  const sin = Math.sin(boss.laserBaseAngle);
  const nx = -sin;
  const ny = cos;

  const preserveIds = boss.laserLanes.length > 0;
  let nextIdx = 0;

  if (boss.phase === 1) {
    const offsets = [-1.5, -0.5, 0.5, 1.5];
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i] * OVERLORD_CFG.laserP1Spacing;
      const mx = boss.x + nx * off;
      const my = boss.y + ny * off;
      const id = preserveIds && boss.laserLanes[nextIdx] ? boss.laserLanes[nextIdx].id : allocSubId(boss);
      const lane = buildClippedLane(id, obsGrid, mx, my, cos, sin, phase, ticksLeft);
      if (nextIdx < boss.laserLanes.length) boss.laserLanes[nextIdx] = lane;
      else boss.laserLanes.push(lane);
      nextIdx++;
    }
  } else {
    const offsets = [-1, 0, 1];
    // 3 parallel lanes along baseAngle
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i] * OVERLORD_CFG.laserP2Spacing;
      const mx = boss.x + nx * off;
      const my = boss.y + ny * off;
      const id = preserveIds && boss.laserLanes[nextIdx] ? boss.laserLanes[nextIdx].id : allocSubId(boss);
      const lane = buildClippedLane(id, obsGrid, mx, my, cos, sin, phase, ticksLeft);
      if (nextIdx < boss.laserLanes.length) boss.laserLanes[nextIdx] = lane;
      else boss.laserLanes.push(lane);
      nextIdx++;
    }
    // 3 cross lanes orthogonal to baseAngle anchored at player cluster
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i] * OVERLORD_CFG.laserP2Spacing;
      const mx = boss.laserAnchorX + cos * off;
      const my = boss.laserAnchorY + sin * off;
      const id = preserveIds && boss.laserLanes[nextIdx] ? boss.laserLanes[nextIdx].id : allocSubId(boss);
      const lane = buildClippedLane(id, obsGrid, mx, my, nx, ny, phase, ticksLeft);
      if (nextIdx < boss.laserLanes.length) boss.laserLanes[nextIdx] = lane;
      else boss.laserLanes.push(lane);
      nextIdx++;
    }
  }

  boss.laserLanes.length = nextIdx;
}

function enterLaserTelegraph(
  boss: OverlordBossState,
  ctx: OverlordStepContext,
  res: OverlordStepResult,
): void {
  const cluster = selectPlayerClusterTarget(boss, ctx.players);
  boss.state = 'laser_telegraph';
  boss.stateTick = OVERLORD_CFG.laserTelegraphTicks;
  boss.stateDuration = OVERLORD_CFG.laserTelegraphTicks;
  boss.laserBaseAngle = cluster.angle;
  boss.aimAngle = cluster.angle;
  boss.laserAnchorX = cluster.x;
  boss.laserAnchorY = cluster.y;
  boss.vx = 0;
  boss.vy = 0;
  boss.laserLanes.length = 0;
  boss.laserCd = boss.phase === 1 ? OVERLORD_CFG.laserCdP1Ticks : OVERLORD_CFG.laserCdP2Ticks;
  rebuildLaserGrid(
    boss,
    ctx.obsGrid,
    'telegraph',
    OVERLORD_CFG.laserTelegraphTicks - OVERLORD_CFG.laserLockTicks,
  );
  syncBossCombatProfile(boss);
  emitSfx('sfx_laser_telegraph', boss.x, boss.y, ctx, res);
}

// ============================================================================
// 6. Spiral Emitter & Hover Steering
// ============================================================================

function emitSpiralRing(
  boss: OverlordBossState,
  arms: number,
  angleOffset: number,
  speed: number,
  ctx: OverlordStepContext,
  res: OverlordStepResult,
): void {
  const baseActive = ctx.activeBossProjectiles ?? 0;
  for (let i = 0; i < arms; i++) {
    if (baseActive + res.projectiles.length >= OVERLORD_STATS.maxActiveProjectiles) {
      return;
    }
    const ang = wrapAngle(angleOffset + (i * TAU) / arms);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const sx = boss.x + ux * OVERLORD_CFG.spiralSpawnOffsetPx;
    const sy = boss.y + uy * OVERLORD_CFG.spiralSpawnOffsetPx;

    // Wall/pillar guard between boss center and bullet muzzle
    if (raycastObstacles(ctx.obsGrid, boss.x, boss.y, sx, sy, 0, 'bullet') !== null) {
      continue;
    }

    const isHeavy = (boss.spiralShotSeq & 3) === 3;
    const isLance = !isHeavy && (boss.spiralShotSeq & 1) === 1;
    const curveSign = arms === OVERLORD_CFG.spiralP2InnerArms ? -1 : 1;
    boss.spiralShotSeq += 1;

    const danmaku: DanmakuMotionSpec = isHeavy
      ? {
          // NieR: Automata Slow Hollow Crimson Ring
          danmakuKind: 'danmaku_ring',
          palette: BANSUNG_DANMAKU_PALETTE.CRIMSON,
          scaleTier: 2,
          angVel: 0.44 * curveSign,
        }
      : isLance
        ? {
            // NieR Fast Accelerated Golden Lance
            danmakuKind: 'danmaku_lance',
            palette: BANSUNG_DANMAKU_PALETTE.GOLD,
            scaleTier: 1,
            accel: 72,
            maxSpeed: 385,
          }
        : {
            danmakuKind: (i & 1) === 0 ? 'danmaku_orb' : 'danmaku_crescent',
            palette: BANSUNG_DANMAKU_PALETTE.VIOLET,
            scaleTier: 1,
            angVel: 0.3 * curveSign,
          };

    const proj: OverlordProjectileSpawn = {
      bossId: boss.id,
      kind: isHeavy ? 'heavy_bolt' : 'plasma_orb',
      x: sx,
      y: sy,
      vx: ux * speed,
      vy: uy * speed,
      angle: ang,
      speed,
      radius: isHeavy ? OVERLORD_CFG.spiralHeavyRadius : OVERLORD_CFG.spiralOrbRadius,
      dmg: isHeavy ? OVERLORD_CFG.spiralHeavyDmg : OVERLORD_CFG.spiralOrbDmg,
      dmgKind: isHeavy ? 'kinetic' : 'energy',
      ttlTicks: OVERLORD_CFG.spiralProjTtlTicks,
      team: 1,
      armored: isHeavy,
      danmaku,
    };
    ctx.spawnProjectile?.(proj);
    res.projectiles.push(proj);
  }

  if (boss.spiralSfxCd <= 0 && res.projectiles.length > 0) {
    boss.spiralSfxCd = OVERLORD_CFG.spiralSfxThrottleTicks;
    emitSfx('sfx_boss_spiral_tick', boss.x, boss.y, ctx, res);
  }
}

function stepSpirals(
  boss: OverlordBossState,
  elapsedTicks: number,
  cadenceMul: number,
  ctx: OverlordStepContext,
  res: OverlordStepResult,
): void {
  if (boss.spiralSfxCd > 0) boss.spiralSfxCd -= 1;

  if (boss.phase === 1) {
    boss.spiralOuterAngle = wrapAngle(boss.spiralOuterAngle + OVERLORD_CFG.spiralP1Omega * DT);
    const every = Math.max(1, Math.round(OVERLORD_CFG.spiralP1FireEvery * cadenceMul));
    if (elapsedTicks % every === 0) {
      emitSpiralRing(
        boss,
        OVERLORD_CFG.spiralP1Arms,
        boss.spiralOuterAngle,
        OVERLORD_CFG.spiralP1Speed,
        ctx,
        res,
      );
    }
    return;
  }

  boss.spiralOuterAngle = wrapAngle(boss.spiralOuterAngle + OVERLORD_CFG.spiralP2OuterOmega * DT);
  boss.spiralInnerAngle = wrapAngle(boss.spiralInnerAngle + OVERLORD_CFG.spiralP2InnerOmega * DT);

  const outerEvery = Math.max(1, Math.round(OVERLORD_CFG.spiralP2OuterFireEvery * cadenceMul));
  if (elapsedTicks % outerEvery === 0) {
    emitSpiralRing(
      boss,
      OVERLORD_CFG.spiralP2OuterArms,
      boss.spiralOuterAngle,
      OVERLORD_CFG.spiralP2OuterSpeed,
      ctx,
      res,
    );
  }

  const innerEvery = Math.max(1, Math.round(OVERLORD_CFG.spiralP2InnerFireEvery * cadenceMul));
  if (elapsedTicks % innerEvery === 0) {
    emitSpiralRing(
      boss,
      OVERLORD_CFG.spiralP2InnerArms,
      boss.spiralInnerAngle,
      OVERLORD_CFG.spiralP2InnerSpeed,
      ctx,
      res,
    );
  }
}

function stepHoverMovement(
  boss: OverlordBossState,
  target: OverlordPlayerTarget | undefined,
  speedScale: number,
  obsGrid: ObstacleGrid,
  bounds: PlayableBounds,
): void {
  if (!target) {
    boss.vx *= 0.8;
    boss.vy *= 0.8;
    moveHoverCircle(boss, boss.vx * DT, boss.vy * DT, obsGrid, bounds);
    return;
  }

  boss.aimAngle = Math.atan2(target.y - boss.y, target.x - boss.x);
  if (Math.abs(Math.cos(boss.aimAngle)) > 0.08) {
    boss.facingLeft = Math.cos(boss.aimAngle) < 0;
  }

  boss.orbitAngle = wrapAngle(boss.orbitAngle + boss.orbitDir * OVERLORD_CFG.orbitAngularSpeed * DT);
  const spanX = bounds.x1 - bounds.x0;
  const spanY = bounds.y1 - bounds.y0;
  const padX = spanX > PLAYABLE_WALL_MARGIN * 2 + 16 ? PLAYABLE_WALL_MARGIN : boss.radius + 4;
  const padY = spanY > PLAYABLE_WALL_MARGIN * 2 + 16 ? PLAYABLE_WALL_MARGIN : boss.radius + 4;

  const goalX = clamp(
    target.x + Math.cos(boss.orbitAngle) * OVERLORD_CFG.orbitDistPreferred,
    bounds.x0 + padX,
    bounds.x1 - padX,
  );
  const goalY = clamp(
    target.y + Math.sin(boss.orbitAngle) * OVERLORD_CFG.orbitDistPreferred,
    bounds.y0 + padY,
    bounds.y1 - padY,
  );

  const dx = goalX - boss.x;
  const dy = goalY - boss.y;
  const dist = Math.hypot(dx, dy);
  const maxSpeed =
    (boss.phase === 1 ? OVERLORD_STATS.speedP1 : OVERLORD_STATS.speedP2) * speedScale;

  const desVx = dist > 6 ? (dx / dist) * maxSpeed : 0;
  const desVy = dist > 6 ? (dy / dist) * maxSpeed : 0;
  boss.vx += (desVx - boss.vx) * OVERLORD_CFG.velBlend;
  boss.vy += (desVy - boss.vy) * OVERLORD_CFG.velBlend;

  moveHoverCircle(boss, boss.vx * DT, boss.vy * DT, obsGrid, bounds);
}

// ============================================================================
// 7. Authoritative 30Hz Tick (`stepOverlordBoss`)
// ============================================================================

function pickNextPatrolAttack(
  boss: OverlordBossState,
  ctx: OverlordStepContext,
  bounds: PlayableBounds,
  res: OverlordStepResult,
): void {
  if (boss.phase === 2 && boss.weakPointCd <= 0) {
    enterWeakPointMatrix(boss, ctx, res);
    res.stateChanged = true;
    return;
  }

  const maxPylons = boss.phase === 1 ? OVERLORD_CFG.empMaxAliveP1 : OVERLORD_CFG.empMaxAliveP2;
  let alivePylons = 0;
  for (let i = 0; i < boss.pylons.length; i++) {
    if (boss.pylons[i].alive) alivePylons++;
  }

  if (boss.empCd <= 0 && alivePylons < maxPylons) {
    boss.state = 'emp_deploy';
    boss.stateTick = OVERLORD_CFG.empDeployAnimTicks;
    boss.stateDuration = OVERLORD_CFG.empDeployAnimTicks;
    syncBossCombatProfile(boss);
    deployEmpPylons(boss, ctx, bounds, res);
    res.stateChanged = true;
    return;
  }

  if (boss.laserCd <= 0) {
    enterLaserTelegraph(boss, ctx, res);
    res.stateChanged = true;
    return;
  }

  boss.state = 'patrol_spiral';
  boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
  boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
  boss.recoveryTicks =
    boss.phase === 1 ? OVERLORD_CFG.spiralRecoveryP1Ticks : OVERLORD_CFG.spiralRecoveryP2Ticks;
  syncBossCombatProfile(boss);
}

/** Advances the Overlord Gunship Core state machine by exactly one 30Hz tick. */
export function stepOverlordBoss(
  boss: OverlordBossState,
  ctx: OverlordStepContext,
): OverlordStepResult {
  const res: OverlordStepResult = {
    stateChanged: false,
    enteredPhase2: false,
    died: false,
    projectiles: [],
    energyOrbs: [],
    sfx: [],
    empPulses: [],
    backlashes: [],
    laserHits: [],
    weakPointBroken: false,
    breachTriggered: false,
  };

  if (!boss.alive || boss.state === 'dead' || boss.hp <= 0) {
    enterDeadState(boss, ctx, res);
    return res;
  }

  const prevState = boss.state;
  const bounds = resolveBounds(ctx.obsGrid, ctx.playableBounds);

  // Tick DOTs, flashes & stun DR timers via shared d33 damage module
  tickStatuses(boss, BANSUNG_TICK_EXACT_MS, {
    rng: ctx.rng,
    popups: ctx.popups,
    fx: ctx.fx,
  });

  if (!boss.alive || boss.hp <= 0) {
    enterDeadState(boss, ctx, res);
    return res;
  }

  // Trigger Phase 2 shift immediately when crossing <= 60% HP outside breach_stun
  if (
    boss.phase === 1 &&
    !boss.phase2Triggered &&
    boss.hp <= boss.maxHp * OVERLORD_STATS.phase2Ratio
  ) {
    if (boss.state === 'breach_stun') {
      boss.pendingPhaseShift = true;
    } else {
      enterPhaseShiftState(boss, ctx, res);
    }
  }

  // Cooldowns & stun gauge grace decay
  if (boss.empCd > 0) boss.empCd -= 1;
  if (boss.laserCd > 0) boss.laserCd -= 1;
  if (boss.phase === 2 && boss.weakPointCd > 0 && boss.state !== 'weakpoint_matrix') {
    boss.weakPointCd -= 1;
  }
  if (boss.stunGaugeGraceTicks > 0) {
    boss.stunGaugeGraceTicks -= 1;
  } else if (boss.stunGauge > 0) {
    boss.stunGauge = Math.max(0, boss.stunGauge - OVERLORD_CFG.stunGaugeDecayPerSec * DT);
  }

  // Tick active EMP pylons (even while boss maneuvers or channels)
  tickPylons(boss, ctx, res);

  if (!boss.alive || boss.hp <= 0) {
    enterDeadState(boss, ctx, res);
    return res;
  }

  const target = selectOverlordTarget(boss, ctx.players);

  // Brief shock/player stun pause (distinct from weak-point breach_stun)
  if (boss.state !== 'breach_stun' && boss.state !== 'phase_shift' && boss.state !== 'enter') {
    if (boss.shockStunTicks > 0) {
      boss.shockStunTicks -= 1;
      boss.vx = 0;
      boss.vy = 0;
      updateWeakPointPositions(boss);
      return res;
    }
    if ((boss.stunMs ?? 0) > 0) {
      boss.vx = 0;
      boss.vy = 0;
      updateWeakPointPositions(boss);
      return res;
    }
  }

  // Đêm Zombie v2: Plague Galaxy (thiên hà xoắn ốc nhiều cánh) / Toxic Bloom (vòng hoa độc).
  // Chạy trong khoảng nghỉ của patrol_spiral, chỉ sau 20 s giao tranh; tôn trọng trần 160 đạn.
  if (!boss.zombieSkills) boss.zombieSkills = createZombieSkillState();
  if (!boss.zombieTelegraphs) boss.zombieTelegraphs = [];
  boss.zombieTelegraphs.length = 0;
  const zombieActive = stepZombieBossSkills(boss.zombieSkills, {
    bossId: boss.id,
    kind: 'boss_overlord',
    x: boss.x,
    y: boss.y,
    radius: boss.radius,
    phase: boss.phase,
    roaming: boss.state === 'patrol_spiral' && boss.stateTick <= 0,
    players: ctx.players,
    projectileBudget:
      OVERLORD_STATS.maxActiveProjectiles - (ctx.activeBossProjectiles ?? 0) - res.projectiles.length,
    emit: (b) => {
      const { angle, speed } = bulletAngleSpeed(b);
      const proj: OverlordProjectileSpawn = {
        bossId: boss.id,
        kind: 'plasma_orb',
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        angle,
        speed,
        radius: b.radius,
        dmg: b.damage,
        dmgKind: b.dmgKind,
        ttlTicks: b.ttlTicks,
        team: 1,
        armored: false,
        danmaku: splitDanmakuMotion(b),
      };
      ctx.spawnProjectile?.(proj);
      res.projectiles.push(proj);
    },
    fx: ctx.fx,
    telegraphsOut: boss.zombieTelegraphs,
    onSfx: (key, x, y) => emitSfx(key, x, y, ctx, res),
  });
  if (zombieActive) {
    // Giữ boss trong khoảng nghỉ (không chọn đòn gốc) cho tới khi skill mới kết thúc
    boss.recoveryTicks = Math.max(boss.recoveryTicks, 2);
  }

  switch (boss.state) {
    case 'enter': {
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        boss.state = 'patrol_spiral';
        boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
        boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
        boss.recoveryTicks = 0;
        syncBossCombatProfile(boss);
        emitSfx('sfx_boss_overlord_spawn', boss.x, boss.y, ctx, res);
      }
      break;
    }

    case 'phase_shift': {
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        enterWeakPointMatrix(boss, ctx, res);
      }
      break;
    }

    case 'patrol_spiral': {
      stepHoverMovement(boss, target, 1.0, ctx.obsGrid, bounds);
      if (boss.stateTick > 0) {
        const elapsed = boss.stateDuration - boss.stateTick;
        stepSpirals(boss, elapsed, 1.0, ctx, res);
        boss.stateTick -= 1;
      } else if (boss.recoveryTicks > 0) {
        boss.recoveryTicks -= 1;
      } else {
        pickNextPatrolAttack(boss, ctx, bounds, res);
      }
      break;
    }

    case 'emp_deploy': {
      stepHoverMovement(boss, target, 0.5, ctx.obsGrid, bounds);
      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        boss.state = 'patrol_spiral';
        boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
        boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
        boss.recoveryTicks =
          boss.phase === 1 ? OVERLORD_CFG.spiralRecoveryP1Ticks : OVERLORD_CFG.spiralRecoveryP2Ticks;
        syncBossCombatProfile(boss);
      }
      break;
    }

    case 'laser_telegraph': {
      boss.vx = 0;
      boss.vy = 0;
      const elapsed = boss.stateDuration - boss.stateTick;
      const lockStart = OVERLORD_CFG.laserTelegraphTicks - OVERLORD_CFG.laserLockTicks;

      if (elapsed < lockStart) {
        const cluster = selectPlayerClusterTarget(boss, ctx.players);
        const delta = wrapAngle(cluster.angle - boss.laserBaseAngle);
        const maxStep = OVERLORD_CFG.laserTrackMaxOmega * DT;
        boss.laserBaseAngle = wrapAngle(boss.laserBaseAngle + clamp(delta, -maxStep, maxStep));
        boss.aimAngle = boss.laserBaseAngle;
        boss.laserAnchorX = cluster.x;
        boss.laserAnchorY = cluster.y;
        rebuildLaserGrid(boss, ctx.obsGrid, 'telegraph', lockStart - elapsed);
      } else {
        // Angle & endpoints freeze during 8-tick lock phase
        const lockLeft = OVERLORD_CFG.laserTelegraphTicks - elapsed;
        for (let i = 0; i < boss.laserLanes.length; i++) {
          boss.laserLanes[i].phase = 'lock';
          boss.laserLanes[i].ticksLeft = lockLeft;
        }
        if (elapsed === lockStart) {
          emitSfx('sfx_laser_charge', boss.x, boss.y, ctx, res);
        }
      }

      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        boss.state = 'laser_fire';
        boss.stateTick = OVERLORD_CFG.laserFireTicks;
        boss.stateDuration = OVERLORD_CFG.laserFireTicks;
        for (let i = 0; i < boss.laserLanes.length; i++) {
          boss.laserLanes[i].phase = 'active';
          boss.laserLanes[i].ticksLeft = OVERLORD_CFG.laserFireTicks;
        }
        syncBossCombatProfile(boss);
        emitSfx('sfx_laser_beam', boss.x, boss.y, ctx, res);
      }
      break;
    }

    case 'laser_fire': {
      boss.vx = 0;
      boss.vy = 0;
      const fireElapsed = boss.stateDuration - boss.stateTick;

      // Phase 2 runs spiral at 50% cadence while laser grid fires
      if (boss.phase === 2) {
        stepSpirals(boss, fireElapsed, 2.0, ctx, res);
      }

      for (let i = 0; i < boss.laserLanes.length; i++) {
        boss.laserLanes[i].phase = 'active';
        boss.laserLanes[i].ticksLeft = boss.stateTick;
      }

      if (fireElapsed % OVERLORD_CFG.laserDamageIntervalTicks === 0) {
        for (let l = 0; l < boss.laserLanes.length; l++) {
          const lane = boss.laserLanes[l];
          emitFx(
            ctx,
            FX_BEAM,
            Math.round(lane.x1),
            Math.round(lane.y1),
            Math.round(lane.x2),
            Math.round(lane.y2),
            BANSUNG_FX_BEAM_BOSS_LASER,
          );
        }
        for (let j = 0; j < ctx.players.length; j++) {
          const hero = ctx.players[j];
          if (!hero.alive || hero.downed || hero.hp <= 0) continue;
          if ((hero.dashIframesMs ?? 0) > 0 || (hero.shieldBuffMs ?? 0) > 0) continue;

          for (let l = 0; l < boss.laserLanes.length; l++) {
            const lane = boss.laserLanes[l];
            const hitR = lane.halfW + hero.radius;
            const d2 = distPointToSegmentSq(hero.x, hero.y, lane.x1, lane.y1, lane.x2, lane.y2);
            if (d2 <= hitR * hitR) {
              const hit: BansungDamageHit = {
                baseDmg: OVERLORD_CFG.laserDmg,
                dmgKind: 'energy',
              };
              const dmgRes = ctx.onDamagePlayer
                ? ctx.onDamagePlayer(hero, hit)
                : applyBansungDamage(hero, hit, { rng: ctx.rng, popups: ctx.popups, fx: ctx.fx });

              if (!dmgRes || !dmgRes.blocked) {
                applyDot(hero, 'burn', `boss:${boss.id}`, {
                  durMs: OVERLORD_CFG.laserBurnDurMs,
                  popups: ctx.popups,
                  fx: ctx.fx,
                });
              }
              res.laserHits.push({ playerId: hero.id, laneId: lane.id, dmg: OVERLORD_CFG.laserDmg });
              break;
            }
          }
        }
      }

      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        boss.laserLanes.length = 0;
        boss.state = 'patrol_spiral';
        boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
        boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
        boss.recoveryTicks =
          boss.phase === 1 ? OVERLORD_CFG.spiralRecoveryP1Ticks : OVERLORD_CFG.spiralRecoveryP2Ticks;
        syncBossCombatProfile(boss);
      }
      break;
    }

    case 'weakpoint_matrix': {
      stepHoverMovement(boss, target, 0.7, ctx.obsGrid, bounds);
      boss.wpBaseAngle = wrapAngle(boss.wpBaseAngle + OVERLORD_CFG.weakPointAngularSpeed * DT);

      let aliveNodes = 0;
      for (let i = 0; i < boss.weakPoints.length; i++) {
        const wp = boss.weakPoints[i];
        if (wp.hitFlashMs > 0) wp.hitFlashMs = Math.max(0, wp.hitFlashMs - BANSUNG_TICK_EXACT_MS);
        if (wp.alive && wp.hp > 0) aliveNodes++;
      }
      updateWeakPointPositions(boss);

      if (aliveNodes === 0) {
        triggerWeakPointBreach(boss, ctx, res);
        break;
      }

      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        // Timeout Failure: Overload Shockwave
        boss.weakPoints.length = 0;
        const r = OVERLORD_CFG.overloadRadius;
        for (let j = 0; j < ctx.players.length; j++) {
          const hero = ctx.players[j];
          if (!hero.alive || hero.downed || hero.hp <= 0) continue;
          if ((hero.dashIframesMs ?? 0) > 0 || (hero.shieldBuffMs ?? 0) > 0) continue;
          if (Math.hypot(hero.x - boss.x, hero.y - boss.y) > r + hero.radius) continue;

          const shockHit: BansungDamageHit = { baseDmg: OVERLORD_CFG.overloadDmg, dmgKind: 'energy' };
          if (ctx.onDamagePlayer) {
            ctx.onDamagePlayer(hero, shockHit);
          } else {
            applyBansungDamage(hero, shockHit, { rng: ctx.rng, popups: ctx.popups, fx: ctx.fx });
          }

          if (ctx.onSlowPlayer) {
            ctx.onSlowPlayer(hero, OVERLORD_CFG.overloadSlowMs, OVERLORD_CFG.overloadSlowPct);
          } else {
            hero.slowMs = Math.max(hero.slowMs ?? 0, OVERLORD_CFG.overloadSlowMs);
            hero.slowPct = Math.max(hero.slowPct ?? 0, OVERLORD_CFG.overloadSlowPct);
          }
        }

        emitFx(
          ctx,
          FX_BLAST,
          BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
          Math.round(boss.x),
          Math.round(boss.y),
          r,
          boss.id,
        );
        emitSfx('sfx_emp_pulse', boss.x, boss.y, ctx, res);
        res.overloadShockwave = {
          x: boss.x,
          y: boss.y,
          radius: r,
          dmg: OVERLORD_CFG.overloadDmg,
          slowMs: OVERLORD_CFG.overloadSlowMs,
        };

        boss.state = 'patrol_spiral';
        boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
        boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
        boss.recoveryTicks = OVERLORD_CFG.spiralRecoveryP2Ticks;
        syncBossCombatProfile(boss);
      }
      break;
    }

    case 'breach_stun': {
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTick -= 1;
      if (boss.stateTick <= 0) {
        boss.stunMs = 0;
        if (boss.pendingPhaseShift && !boss.phase2Triggered) {
          enterPhaseShiftState(boss, ctx, res);
        } else {
          boss.state = 'patrol_spiral';
          boss.stateTick = OVERLORD_CFG.spiralBurstTicks;
          boss.stateDuration = OVERLORD_CFG.spiralBurstTicks;
          boss.recoveryTicks = OVERLORD_CFG.spiralRecoveryP2Ticks;
          syncBossCombatProfile(boss);
        }
      }
      break;
    }
  }

  if (boss.state !== prevState) {
    res.stateChanged = true;
  }
  return res;
}

// ============================================================================
// 8. Damage Entrypoints (Hull, Weak-Points, EMP Pylons)
// ============================================================================

/** Applies an incoming hit to the Overlord's armored hull, respecting active matrix/breach modifiers and 0.45 stun effectiveness. */
export function damageOverlordBoss(
  boss: OverlordBossState,
  hit: BansungDamageHit,
  ctx?: OverlordCombatContext,
): BansungDamageResult {
  syncBossCombatProfile(boss);

  const scaledHit: BansungDamageHit =
    hit.stunMs && hit.stunMs > 0
      ? { ...hit, stunMs: hit.stunMs * OVERLORD_STATS.stunEffectiveness }
      : hit;

  const res = applyBansungDamage(boss, scaledHit, ctx);

  if (res.totalDmg > 0) {
    addOverlordThreat(boss, hit.attackerId, res.totalDmg);
  }

  if (res.killed || boss.hp <= 0) {
    enterDeadState(boss, ctx);
    return res;
  }

  if (
    boss.phase === 1 &&
    !boss.phase2Triggered &&
    boss.hp <= boss.maxHp * OVERLORD_STATS.phase2Ratio
  ) {
    if (boss.state === 'breach_stun') {
      boss.pendingPhaseShift = true;
    } else {
      enterPhaseShiftState(boss, ctx);
    }
  }

  return res;
}

export interface WeakPointHitResult {
  hit: boolean;
  destroyed: boolean;
  allBroken: boolean;
  dmgResult: BansungDamageResult;
  energyOrbs: OverlordEnergyOrbDrop[];
}

/** Applies a hit to a specific orbiting weak-point node (ignores hull armor, takes 1.5x crit). */
export function damageOverlordWeakPoint(
  boss: OverlordBossState,
  wpIdx: number,
  hit: BansungDamageHit,
  ctx?: OverlordCombatContext,
): WeakPointHitResult {
  const wp = boss.weakPoints.find((node) => node.idx === wpIdx);
  if (!boss.alive || boss.state !== 'weakpoint_matrix' || !wp || !wp.alive || wp.hp <= 0) {
    return {
      hit: false,
      destroyed: false,
      allBroken: false,
      dmgResult: {
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
        dmgKindIdx: BANSUNG_DAMAGE_KIND_INDEX[hit.dmgKind] ?? 0,
      },
      energyOrbs: [],
    };
  }

  const wpTarget: BansungCombatTarget = {
    id: `${boss.id}:wp:${wp.idx}`,
    numId: wp.idx + 1,
    x: wp.x,
    y: wp.y,
    tier: 'boss',
    armorType: 'light',
    flatArmor: 0,
    alive: true,
    hp: wp.hp,
    maxHp: wp.maxHp,
    shield: 0,
    maxShield: 0,
    ccImmune: true,
  };

  const wpHit: BansungDamageHit = {
    ...hit,
    stunMs: undefined,
    forceCrit: true,
    critMult: Math.max(OVERLORD_CFG.weakPointCritMult, hit.critMult ?? OVERLORD_CFG.weakPointCritMult),
  };

  const dmgResult = applyBansungDamage(wpTarget, wpHit, ctx);
  wp.hp = wpTarget.hp;
  wp.hitFlashMs = wpTarget.hitFlashMs ?? 90;
  const destroyed = wp.hp <= 0 || dmgResult.killed;
  if (destroyed) {
    wp.hp = 0;
    wp.alive = false;
  }

  if (dmgResult.totalDmg > 0) {
    addOverlordThreat(boss, hit.attackerId, dmgResult.totalDmg * 1.2);
  }

  let allBroken = true;
  for (let i = 0; i < boss.weakPoints.length; i++) {
    if (boss.weakPoints[i].alive && boss.weakPoints[i].hp > 0) {
      allBroken = false;
      break;
    }
  }

  const energyOrbs = allBroken ? triggerWeakPointBreach(boss, ctx) : [];

  return { hit: true, destroyed, allBroken, dmgResult, energyOrbs };
}

export interface PylonHitResult {
  hit: boolean;
  destroyed: boolean;
  backlashTriggered: boolean;
  dmgResult: BansungDamageResult;
}

/** Damages a landed EMP pylon; destroying it before discharge triggers Short-Circuit Backlash. */
export function damageOverlordPylon(
  boss: OverlordBossState,
  pylonId: number,
  hit: BansungDamageHit,
  ctx?: OverlordCombatContext,
): PylonHitResult {
  const pylon = boss.pylons.find((p) => p.id === pylonId);
  if (!pylon || !pylon.alive || pylon.hp <= 0 || pylon.landingTicksLeft > 0) {
    return {
      hit: false,
      destroyed: false,
      backlashTriggered: false,
      dmgResult: {
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
        dmgKindIdx: BANSUNG_DAMAGE_KIND_INDEX[hit.dmgKind] ?? 0,
      },
    };
  }

  const pylonTarget: BansungCombatTarget = {
    id: pylon.id,
    numId: pylon.id,
    x: pylon.x,
    y: pylon.y,
    tier: 'elite',
    armorType: pylon.armorType,
    flatArmor: pylon.armor,
    alive: true,
    hp: pylon.hp,
    maxHp: pylon.maxHp,
    shield: 0,
    maxShield: 0,
    ccImmune: true,
  };

  const dmgResult = applyBansungDamage(pylonTarget, { ...hit, stunMs: undefined }, ctx);
  pylon.hp = pylonTarget.hp;
  pylon.hitFlashMs = pylonTarget.hitFlashMs ?? 90;

  if (dmgResult.totalDmg > 0) {
    addOverlordThreat(boss, hit.attackerId, dmgResult.totalDmg);
  }

  const destroyed = pylon.hp <= 0 || dmgResult.killed;
  let backlashTriggered = false;
  if (destroyed) {
    pylon.hp = 0;
    pylon.alive = false;
    backlashTriggered = true;
    if (ctx?.actorGrid || ctx?.mobs || ctx?.onDamageMob || boss.alive) {
      resolvePylonBacklash(boss, pylon, ctx);
    } else {
      boss.pendingBacklashes.push(pylon);
    }
  }

  return { hit: true, destroyed, backlashTriggered, dmgResult };
}

export type OverlordGeometryHitTarget = 'none' | 'weakpoint' | 'pylon' | 'boss';

export interface OverlordGeometryHitResult {
  targetKind: OverlordGeometryHitTarget;
  targetId: number;
  dmgResult?: BansungDamageResult;
  weakPointResult?: WeakPointHitResult;
  pylonResult?: PylonHitResult;
}

/**
 * Resolves a circular projectile/melee impact at `(x, y, radius)` against the Overlord's
 * active weak-points first, then landed EMP pylons, then the Gunship Core hull.
 */
export function resolveOverlordEntityHit(
  boss: OverlordBossState,
  x: number,
  y: number,
  hitRadius: number,
  hit: BansungDamageHit,
  ctx?: OverlordCombatContext,
): OverlordGeometryHitResult {
  if (boss.state === 'weakpoint_matrix') {
    for (let i = 0; i < boss.weakPoints.length; i++) {
      const wp = boss.weakPoints[i];
      if (!wp.alive || wp.hp <= 0) continue;
      const r = hitRadius + wp.radius;
      const dx = x - wp.x;
      const dy = y - wp.y;
      if (dx * dx + dy * dy <= r * r) {
        const weakPointResult = damageOverlordWeakPoint(boss, wp.idx, hit, ctx);
        return {
          targetKind: 'weakpoint',
          targetId: wp.idx,
          dmgResult: weakPointResult.dmgResult,
          weakPointResult,
        };
      }
    }
  }

  for (let i = 0; i < boss.pylons.length; i++) {
    const p = boss.pylons[i];
    if (!p.alive || p.hp <= 0 || p.landingTicksLeft > 0) continue;
    const r = hitRadius + p.radius;
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy <= r * r) {
      const pylonResult = damageOverlordPylon(boss, p.id, hit, ctx);
      return {
        targetKind: 'pylon',
        targetId: p.id,
        dmgResult: pylonResult.dmgResult,
        pylonResult,
      };
    }
  }

  if (boss.alive && boss.state !== 'dead') {
    const r = hitRadius + boss.radius;
    const dx = x - boss.x;
    const dy = y - boss.y;
    if (dx * dx + dy * dy <= r * r) {
      const dmgResult = damageOverlordBoss(boss, hit, ctx);
      return { targetKind: 'boss', targetId: boss.id, dmgResult };
    }
  }

  return { targetKind: 'none', targetId: -1 };
}

// ============================================================================
// 9. Snapshot & Telegraph Serializers
// ============================================================================

export function mapOverlordToUnitState(boss: OverlordBossState): BansungUnitState {
  if (boss.state === 'dead' || !boss.alive) return BANSUNG_STATE_DEAD;
  if (boss.state === 'breach_stun' || boss.shockStunTicks > 0 || (boss.stunMs ?? 0) > 0) {
    return BANSUNG_STATE_STUN;
  }
  if (boss.state === 'enter') return BANSUNG_STATE_IDLE;
  if (boss.state === 'patrol_spiral' && boss.stateTick <= 0) return BANSUNG_STATE_RUN;
  return BANSUNG_STATE_ATK;
}

/** Converts Overlord runtime state into the compact `BansungBossFrame` protocol header. */
export function toOverlordBossFrame(boss: OverlordBossState): BansungBossFrame {
  let telegraph: number | undefined;
  if (boss.state === 'laser_telegraph' && boss.stateDuration > 0) {
    telegraph = Math.round(((boss.stateDuration - boss.stateTick) / boss.stateDuration) * 100);
  } else if (boss.state === 'weakpoint_matrix' && boss.stateDuration > 0) {
    telegraph = Math.round((boss.stateTick / boss.stateDuration) * 100);
  } else if (boss.state === 'emp_deploy') {
    telegraph = 100;
  }

  return {
    id: boss.id,
    kind: 'boss_overlord',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.max(0, Math.round(boss.hp)),
    maxHp: boss.maxHp,
    phase: boss.phase,
    state: mapOverlordToUnitState(boss),
    aimQ: quantizeAim(boss.aimAngle),
    ...(telegraph !== undefined ? { telegraph } : {}),
    stagger: Math.round(boss.stunGauge),
    maxStagger: OVERLORD_CFG.stunGaugeMax,
  };
}

/** Converts Overlord runtime state into the extended `OverlordBossView` for HUD & client rendering. */
export function toOverlordView(boss: OverlordBossState): OverlordBossView {
  return {
    id: boss.id,
    kind: 'boss_overlord',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    vx: Math.round(boss.vx),
    vy: Math.round(boss.vy),
    facingLeft: boss.facingLeft,
    hp: Math.max(0, Math.round(boss.hp)),
    maxHp: boss.maxHp,
    shieldHp: boss.weakPoints.reduce((sum, wp) => sum + (wp.alive ? wp.hp : 0), 0),
    heat: Math.round(boss.stunGauge),
    state: mapOverlordToUnitState(boss),
    stateTick: boss.stateTick,
    aimDeg: Math.round((boss.aimAngle * 180) / Math.PI),
    overlordState: boss.state,
    hoverZ: boss.hoverZ,
    armor: boss.flatArmor,
    damageTakenMul: boss.vulnMult ?? 1.0,
    stunGauge: Math.round(boss.stunGauge),
    breachTicksLeft: boss.state === 'breach_stun' ? boss.stateTick : 0,
    weakPoints: boss.weakPoints
      .filter((wp) => wp.alive && wp.hp > 0)
      .map((wp) => ({ idx: wp.idx, angQ: wp.angQ, hp: Math.round(wp.hp), maxHp: wp.maxHp })),
    pylons: boss.pylons
      .filter((p) => p.alive && p.hp > 0)
      .map((p) => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        chargeQ: p.chargeQ,
      })),
    laserLanes: boss.laserLanes.map((l) => ({
      id: l.id,
      x1: Math.round(l.x1),
      y1: Math.round(l.y1),
      x2: Math.round(l.x2),
      y2: Math.round(l.y2),
      halfW: l.halfW,
      phase: l.phase,
      ticksLeft: l.ticksLeft,
    })),
  };
}

/** Emits standardized `BansungTelegraph` entries for active laser lanes and landing/charging EMP pylons. */
export function getOverlordTelegraphs(boss: OverlordBossState): BansungTelegraph[] {
  const out: BansungTelegraph[] = [];

  for (let i = 0; i < boss.laserLanes.length; i++) {
    const lane = boss.laserLanes[i];
    let prog = 0;
    if (lane.phase === 'telegraph') {
      const total = OVERLORD_CFG.laserTelegraphTicks - OVERLORD_CFG.laserLockTicks;
      prog = Math.round(((total - lane.ticksLeft) / Math.max(1, total)) * 200);
    } else if (lane.phase === 'lock') {
      prog = 235;
    } else {
      prog = 255;
    }
    out.push({
      id: lane.id,
      kind: 0,
      shape: 'line',
      phase: lane.phase === 'telegraph' ? 0 : 1,
      color: 0,
      prog: clamp(prog, 0, 255),
      x0: Math.round(lane.x1),
      y0: Math.round(lane.y1),
      x1: Math.round(lane.x2),
      y1: Math.round(lane.y2),
      r: lane.halfW,
      halfW: lane.halfW,
      active: lane.phase === 'active',
      danger: 1,
      sourceKind: 'boss_overlord',
    });
  }

  const landedPylons: OverlordPylon[] = [];
  for (let i = 0; i < boss.pylons.length; i++) {
    const p = boss.pylons[i];
    if (!p.alive || p.hp <= 0) continue;
    const isLanding = p.landingTicksLeft > 0;
    if (!isLanding) landedPylons.push(p);
    const prog = isLanding
      ? Math.round(((OVERLORD_CFG.empLandingTicks - p.landingTicksLeft) / OVERLORD_CFG.empLandingTicks) * 255)
      : Math.round((p.chargeTicks / OVERLORD_CFG.empChargeTicks) * 255);
    out.push({
      id: p.id,
      kind: 1,
      shape: 'circle',
      phase: !isLanding && p.chargeTicks >= OVERLORD_CFG.empChargeTicks - 15 ? 1 : 0,
      color: 2,
      prog: clamp(prog, 0, 255),
      x0: Math.round(p.x),
      y0: Math.round(p.y),
      x1: Math.round(p.x),
      y1: Math.round(p.y),
      r: isLanding ? OVERLORD_CFG.empPylonRadius : OVERLORD_CFG.empPulseRadius,
      danger: 1,
      sourceKind: 'boss_overlord',
    });
  }

  // Zulan / Ikaruga EMP Pylon Laser Tether Sightlines & Active Plasma Walls
  if (landedPylons.length >= 2) {
    const pairLimit = landedPylons.length === 2 ? 1 : landedPylons.length;
    for (let k = 0; k < pairLimit; k++) {
      const pA = landedPylons[k];
      const pB = landedPylons[(k + 1) % landedPylons.length];
      const maxChg = Math.max(pA.chargeTicks, pB.chargeTicks);
      if (maxChg < 28) continue;
      const active = maxChg >= 56;
      const prog = active ? 255 : Math.round(((maxChg - 28) / 28) * 235);
      out.push({
        id: boss.id * 1000 + 600 + k,
        kind: 0,
        shape: 'line',
        phase: active || maxChg >= 46 ? 1 : 0,
        color: 3,
        prog: clamp(prog, 0, 255),
        x0: Math.round(pA.x),
        y0: Math.round(pA.y),
        x1: Math.round(pB.x),
        y1: Math.round(pB.y),
        r: 13,
        halfW: 13,
        active,
        danger: 1,
        sourceKind: 'boss_overlord',
      });
    }
  }

  // Đêm Zombie v2: telegraph của Plague Galaxy / Toxic Bloom
  if (boss.zombieTelegraphs) {
    for (let i = 0; i < boss.zombieTelegraphs.length; i++) out.push(boss.zombieTelegraphs[i]);
  }

  return out;
}
