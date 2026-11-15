/**
 * Boss 2: Dread Colossus (`boss_colossus`) 30Hz authoritative FSM for `bansung`
 * mode (spec d38).
 *
 * Implements:
 * - Armored boss (`armor: 4`, `radius: 34`, co-op & difficulty HP scaling)
 * - Priority selector in `march` with 120-deg `Dread Cleave` (`+10` Heat)
 * - Swept `Heavy Dash Charge` (`24t` windup locking on tick 8, `18t` dash at 680 px/s,
 *   wall-crash `+35` Heat + 75px debris shockwave, Phase 2 `<= 55%` HP double charge)
 * - Predictive + zoning `Mortar Bomb Barrage` (4/6 shells, 42t flight, `+30` Heat once)
 * - `55%` / `25%` HP `Iron Aegis` Shield Drone Phalanx (3/4 orbiting drones, 85% DR,
 *   crits blocked, 180 self-dmg + 135t shatter overheat stun, 660t anti-softlock timeout)
 * - `Overheat Stun` window (`0` armor, `1.5x` damage taken, guaranteed crits,
 *   15t steam ring telegraph + 110px radial steam vent on exit)
 */
import {
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_DIFFICULTY_SCALE,
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BLAST_BOSS_MORTAR,
  BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
  BANSUNG_FX_BLAST_STEAM,
  BANSUNG_FX_STATUS_BOSS_OVERHEAT,
  BANSUNG_FX_STATUS_BOSS_SHIELD_UP,
  BANSUNG_IRON_DRONE_CFG,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  DREAD_COLOSSUS_CFG,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  FX_STATUS,
  computeBossHpMult,
  quantizeAim,
  type ArenaObstacle,
  type BansungBossFrame,
  type BansungBossView,
  type BansungDifficulty,
  type BansungDifficultyKey,
  type BansungTelegraph,
  type BansungUnitState,
  type ColossusState,
} from '../../../../shared/src';
import {
  applyBansungDamage,
  tickStatuses,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageHit,
  type BansungDamageResult,
  type BansungDotEntry,
  type BansungDotKind,
  type BansungStatusContext,
} from './damage';
import {
  LAYER_ENEMY,
  ObstacleGrid,
  distPointToSegmentSq,
  moveCircleWithSlide,
  queryAoeObstacles,
  raycastObstacles,
  resolveObstacles,
  sweepCircleSegment,
  type ActorGrid,
  type AoeObstacleTarget,
  type CircleBody,
  type SpatialActor,
} from './spatial';
import type { DanmakuMotionSpec } from './danmaku';

// ============================================================================
// 1. Constants & State Enums (d38)
// ============================================================================

/** Numeric `ColossusState` constants matching `d38` wire values `0..10`. */
export const COLOSSUS_STATE = {
  MARCH: 0 as ColossusState,
  CLEAVE_WINDUP: 1 as ColossusState,
  CLEAVE_HIT: 2 as ColossusState,
  DASH_WINDUP: 3 as ColossusState,
  DASH_CHARGE: 4 as ColossusState,
  DASH_RECOVER: 5 as ColossusState,
  MORTAR_WINDUP: 6 as ColossusState,
  MORTAR_BARRAGE: 7 as ColossusState,
  DRONE_SUMMON: 8 as ColossusState,
  OVERHEAT_STUN: 9 as ColossusState,
  DEAD: 10 as ColossusState,
} as const;

export const COLOSSUS_TUNING = {
  CLEAVE_TRIGGER_DIST: 95,
  CLEAVE_WINDUP_TICKS: 12,
  CLEAVE_DURATION_TICKS: 12,
  CLEAVE_HIT_TICK: 2,
  CLEAVE_CD_TICKS: 54,
  CLEAVE_HEAT: 10,
  CLEAVE_KNOCKBACK_PX: 70,

  DASH_MIN_RANGE: 120,
  DASH_MAX_RANGE: 560,
  DASH_LOCK_TICK: 8,
  DASH_CHAIN_WINDUP_TICKS: 14,
  DASH_RECOVER_TICKS: 15,
  DASH_CD_P1_TICKS: 150,
  DASH_CD_P2_TICKS: 120,
  DASH_KNOCKBACK_PX: 140,
  DASH_TELEGRAPH_WIDTH: 68,
  DASH_TELEGRAPH_LEN: 408,
  WALL_CRASH_RADIUS: 75,
  WALL_CRASH_DMG: 20,

  MORTAR_WINDUP_TICKS: 18,
  MORTAR_SHELL_INTERVAL_TICKS: 4,
  MORTAR_TAIL_TICKS: 6,
  MORTAR_CD_P1_TICKS: 225,
  MORTAR_CD_P2_TICKS: 165,
  MORTAR_P1_COUNT: 4,
  MORTAR_P2_COUNT: 6,
  MORTAR_LEAD_S: 0.45,
  MORTAR_INNER_RADIUS: 36,
  MORTAR_EDGE_MULT: 0.6,
  MORTAR_KNOCKBACK_PX: 90,
  MORTAR_SCATTER_MIN: 110,
  MORTAR_SCATTER_MAX: 260,

  DRONE_SUMMON_TICKS: 20,
  DRONE_PUSHBACK_PX: 140,
  DRONE_P1_COUNT: 3,
  DRONE_P2_COUNT: 4,
  DRONE_TIMEOUT_STUN_TICKS: 60,
  DRONE_FAN_INTERVAL_TICKS: 72,
  DRONE_FAN_PAUSE_TICKS: 12,
  DRONE_FAN_SPREAD_DEG: 14,
  BOSS_SHIELD_BOLT_CD_TICKS: 54,
  BOSS_SHIELD_BOLT_DMG: 18,
  BOSS_SHIELD_BOLT_SPEED: 340,
  BOLT_RADIUS: 10,
  BOLT_TTL_TICKS: 90,

  STEAM_TELEGRAPH_TICKS: 15,
  STEAM_VENT_RADIUS: 110,
  STEAM_VENT_DMG: 10,
  STEAM_VENT_PUSHBACK_PX: 60,
} as const;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const TAU = Math.PI * 2;
const DT_S = 1 / 30;

// ============================================================================
// 2. Public Interfaces
// ============================================================================

export type ColossusSfxId =
  | 'boss_charge_horn'
  | 'boss_wall_crash'
  | 'mortar_launch'
  | 'mortar_explode'
  | 'shield_up'
  | 'shield_shatter'
  | 'boss_overheat_hiss'
  | 'boss_cleave'
  | 'boss_bolt'
  | 'boss_death';

export interface ColossusArenaBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Minimal hero/bot player target interface accepted by Dread Colossus. */
export interface ColossusPlayerTarget extends BansungCombatTarget {
  id: number;
  x: number;
  y: number;
  radius: number;
  vx?: number;
  vy?: number;
  team?: number;
  layer?: number;
}

/** Orbiting `iron_drone` escort compatible with both `ActorGrid` and `applyBansungDamage`. */
export interface ColossusDrone extends BansungCombatTarget, SpatialActor {
  id: number;
  bossId: number;
  kind: 'iron_drone';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  team: number;
  layer: number;
  alive: boolean;
  orbitIndex: number;
  orbitCount: number;
  orbitAngle: number;
  pauseTicks: number;
  facingLeft: boolean;
}

/** Active high-arc mortar hazard queued for 42-tick detonation. */
export interface ColossusMortarHazard {
  id: number;
  barrageId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  radius: number;
  ticksLeft: number;
  maxTicks: number;
  damage: number;
  knockbackPx: number;
}

/** Projectile emission request produced by boss shield bolts or drone fans. */
export interface ColossusProjectileSpawn {
  ownerId: number;
  kind: 'thunderball';
  x: number;
  y: number;
  vx: number;
  vy: number;
  angleRad: number;
  speed: number;
  radius: number;
  damage: number;
  ttlTicks: number;
  fromDrone: boolean;
  danmaku?: DanmakuMotionSpec;
}

/** Discrete boss combat event emitted for world hooks, logs, and tests. */
export type ColossusEvent =
  | { type: 'cleave'; x: number; y: number; aimDeg: number }
  | { type: 'dash_start'; x: number; y: number; aimDeg: number; chain: 0 | 1 }
  | { type: 'wall_crash'; x: number; y: number; heat: number }
  | { type: 'mortar_launch'; id: number; x: number; y: number }
  | { type: 'mortar_explode'; id: number; x: number; y: number; radius: number }
  | { type: 'drone_summon_start'; count: number }
  | { type: 'drones_spawned'; count: number }
  | { type: 'drone_shatter'; bossSelfDmg: number }
  | { type: 'drone_timeout' }
  | { type: 'overheat_start'; durationTicks: number; reason: 'heat' | 'shatter' | 'timeout' }
  | { type: 'overheat_end'; x: number; y: number }
  | { type: 'dead'; x: number; y: number };

/** Authoritative 30Hz state for Boss 2: Dread Colossus. */
export interface DreadColossusState extends BansungCombatTarget, SpatialActor {
  id: number;
  idStr: string;
  kind: 'boss_colossus';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  team: number;
  layer: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  tier: 'boss';
  armorType: 'armored';
  flatArmor: number;
  damageReduction: number;
  vulnMult: number;
  ccImmune: true;
  hitFlashMs: number;
  dots: Partial<Record<BansungDotKind, BansungDotEntry>>;
  facingLeft: boolean;
  phase: 1 | 2;
  state: ColossusState;
  stateTick: number;
  aimRad: number;
  aimDeg: number;
  heat: number;
  cleaveCd: number;
  dashCd: number;
  mortarCd: number;
  dashWindupTicks: number;
  dashLockTick: number;
  dashChainIndex: 0 | 1;
  dashHitPlayerIds: Set<number>;
  mortarTotalShells: number;
  mortarLaunched: number;
  mortarBarrageId: number;
  mortarHeatClaimedBarrageId: number;
  mortars: ColossusMortarHazard[];
  drones: ColossusDrone[];
  dronePhasesTriggered: [boolean, boolean];
  pendingDroneCount: number;
  droneMaxHp: number;
  droneTimerTicks: number;
  droneOrbitAngle: number;
  droneFireCycleIdx: number;
  bossBoltCd: number;
  droneFanCd: number;
  stunDurationTicks: number;
  targetId: number | null;
  telegraphs: BansungTelegraph[];
  arenaBounds: ColossusArenaBounds;
  rngState: number;
  nextSeqId: number;
  deathEmitted: boolean;
}

export interface CreateDreadColossusOptions {
  id?: number;
  idStr?: string;
  x?: number;
  y?: number;
  playerCount?: number;
  difficulty?: BansungDifficulty | BansungDifficultyKey;
  endlessTier?: number;
  hpMult?: number;
  scale?: number;
  seed?: number;
  arenaBounds?: ColossusArenaBounds;
}

export interface ColossusStepContext {
  obsGrid: ObstacleGrid;
  actorGrid?: ActorGrid;
  players: readonly ColossusPlayerTarget[];
  damageCtx?: BansungDamageContext;
  statusCtx?: BansungStatusContext;
  rng?: () => number;
  onSpawnDrones?: (drones: readonly ColossusDrone[], boss: DreadColossusState) => void;
  onDroneDestroyed?: (
    drone: ColossusDrone,
    byTimeout: boolean,
    boss: DreadColossusState,
  ) => void;
  onProjectile?: (proj: ColossusProjectileSpawn, boss: DreadColossusState) => void;
  onObstacleHit?: (
    obstacle: ArenaObstacle,
    damage: number,
    boss: DreadColossusState,
  ) => void;
  onSfx?: (sfxId: ColossusSfxId, x: number, y: number, boss: DreadColossusState) => void;
  onBossDead?: (boss: DreadColossusState) => void;
}

export interface ColossusStepResult {
  state: ColossusState;
  stateTick: number;
  heat: number;
  activeDrones: number;
  projectiles: ColossusProjectileSpawn[];
  sfx: Array<{ id: ColossusSfxId; x: number; y: number }>;
  fx: number[];
  events: ColossusEvent[];
  telegraphs: BansungTelegraph[];
}

// ============================================================================
// 3. Internal Helpers & Scratch Buffers
// ============================================================================

const tmpObsTargets: AoeObstacleTarget[] = [];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function normalizeAngle(rad: number): number {
  let a = rad % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function nextPrng(boss: DreadColossusState, externalRng?: () => number): number {
  if (externalRng) return externalRng();
  let t = (boss.rngState += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function nextSeq(boss: DreadColossusState): number {
  const id = boss.nextSeqId;
  boss.nextSeqId += 1;
  return id;
}

function clampToBounds(body: CircleBody, bounds: ColossusArenaBounds): void {
  const minX = bounds.x0 + body.radius;
  const maxX = bounds.x1 - body.radius;
  const minY = bounds.y0 + body.radius;
  const maxY = bounds.y1 - body.radius;
  body.x = minX <= maxX ? clamp(body.x, minX, maxX) : (minX + maxX) * 0.5;
  body.y = minY <= maxY ? clamp(body.y, minY, maxY) : (minY + maxY) * 0.5;
}

function moveBodyClamped(
  body: CircleBody,
  dx: number,
  dy: number,
  obsGrid: ObstacleGrid,
  bounds: ColossusArenaBounds,
): void {
  moveCircleWithSlide(body, dx, dy, obsGrid, obsGrid.mapW, obsGrid.mapH, 0);
  clampToBounds(body, bounds);
}

function resolveBodyClamped(
  body: CircleBody,
  obsGrid: ObstacleGrid,
  bounds: ColossusArenaBounds,
): void {
  resolveObstacles(body, obsGrid, obsGrid.mapW, obsGrid.mapH, 0);
  clampToBounds(body, bounds);
}

function isPlayerTargetable(p: ColossusPlayerTarget): boolean {
  return (
    p.alive &&
    !p.downed &&
    p.hp > 0 &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  );
}

function findNearestPlayer(
  boss: DreadColossusState,
  players: readonly ColossusPlayerTarget[],
): { player: ColossusPlayerTarget; dist: number } | null {
  let best: ColossusPlayerTarget | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!isPlayerTargetable(p)) continue;
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && p.id < best.id)) {
      bestD2 = d2;
      best = p;
    }
  }
  return best ? { player: best, dist: Math.sqrt(bestD2) } : null;
}

function findFarthestDashTarget(
  boss: DreadColossusState,
  players: readonly ColossusPlayerTarget[],
): { player: ColossusPlayerTarget; dist: number } | null {
  const minD2 = COLOSSUS_TUNING.DASH_MIN_RANGE * COLOSSUS_TUNING.DASH_MIN_RANGE;
  const maxD2 = COLOSSUS_TUNING.DASH_MAX_RANGE * COLOSSUS_TUNING.DASH_MAX_RANGE;
  let best: ColossusPlayerTarget | null = null;
  let bestD2 = -1;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!isPlayerTargetable(p)) continue;
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD2 && d2 <= maxD2) {
      if (d2 > bestD2 || (d2 === bestD2 && best !== null && p.id < best.id)) {
        bestD2 = d2;
        best = p;
      }
    }
  }
  return best ? { player: best, dist: Math.sqrt(bestD2) } : null;
}

function setAimToward(boss: DreadColossusState, tx: number, ty: number): void {
  const dx = tx - boss.x;
  const dy = ty - boss.y;
  if (dx * dx + dy * dy <= 1e-8) return;
  const rad = Math.atan2(dy, dx);
  boss.aimRad = rad;
  boss.aimDeg = Math.round(rad * RAD_TO_DEG);
  if (Math.abs(dx) > 1e-3) {
    boss.facingLeft = dx < 0;
  }
}

function pushFx(
  outFx: number[],
  dmgCtx: BansungDamageContext | undefined,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): void {
  outFx.push(a, b, c, d, e, f);
  if (dmgCtx?.fx) {
    dmgCtx.fx.push(a, b, c, d, e, f);
  }
}

function emitSfx(
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  ctx: ColossusStepContext,
  boss: DreadColossusState,
  id: ColossusSfxId,
  x = boss.x,
  y = boss.y,
): void {
  outSfx.push({ id, x, y });
  ctx.onSfx?.(id, x, y, boss);
}

function applyRadialPushback(
  player: ColossusPlayerTarget,
  cx: number,
  cy: number,
  pushPx: number,
  obsGrid: ObstacleGrid,
  bounds: ColossusArenaBounds,
): void {
  if (!isPlayerTargetable(player) || pushPx <= 0) return;
  let dx = player.x - cx;
  let dy = player.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-4) {
    dx /= dist;
    dy /= dist;
  } else {
    dx = 1;
    dy = 0;
  }
  moveBodyClamped(player, dx * pushPx, dy * pushPx, obsGrid, bounds);
}

function syncBossDefenseStats(boss: DreadColossusState): void {
  boss.phase = boss.hp <= boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[0] ? 2 : 1;
  if (boss.drones.length > 0) {
    boss.damageReduction = DREAD_COLOSSUS_CFG.shieldDr;
    boss.flatArmor = DREAD_COLOSSUS_CFG.armorNormal;
    boss.vulnMult = 1.0;
  } else if (boss.state === COLOSSUS_STATE.OVERHEAT_STUN) {
    boss.damageReduction = 0;
    boss.flatArmor = DREAD_COLOSSUS_CFG.armorStunned;
    boss.vulnMult = DREAD_COLOSSUS_CFG.stunDmgMult;
  } else {
    boss.damageReduction = DREAD_COLOSSUS_CFG.baseDr;
    boss.flatArmor = DREAD_COLOSSUS_CFG.armorNormal;
    boss.vulnMult = 1.0;
  }
}

function finalizeDeath(
  boss: DreadColossusState,
  ctx: ColossusStepContext,
  outFx: number[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  events: ColossusEvent[],
): void {
  boss.alive = false;
  boss.hp = 0;
  boss.vx = 0;
  boss.vy = 0;
  boss.state = COLOSSUS_STATE.DEAD;
  boss.damageReduction = 0;
  boss.telegraphs.length = 0;
  boss.mortars.length = 0;

  if (boss.drones.length > 0) {
    for (let i = 0; i < boss.drones.length; i++) {
      const d = boss.drones[i];
      d.alive = false;
      d.hp = 0;
      ctx.onDroneDestroyed?.(d, true, boss);
    }
    boss.drones.length = 0;
  }

  if (!boss.deathEmitted) {
    boss.deathEmitted = true;
    pushFx(
      outFx,
      ctx.damageCtx,
      FX_DEATH,
      BANSUNG_ENEMIES.boss_colossus.kindId,
      Math.round(boss.x),
      Math.round(boss.y),
      3,
      0,
    );
    emitSfx(outSfx, ctx, boss, 'boss_death');
    events.push({ type: 'dead', x: boss.x, y: boss.y });
    ctx.onBossDead?.(boss);
  }
}

function enterOverheatStun(
  boss: DreadColossusState,
  durationTicks: number,
  reason: 'heat' | 'shatter' | 'timeout',
  ctx: ColossusStepContext,
  outFx: number[],
  events: ColossusEvent[],
): void {
  boss.state = COLOSSUS_STATE.OVERHEAT_STUN;
  boss.stateTick = 0;
  boss.vx = 0;
  boss.vy = 0;
  boss.dashChainIndex = 0;
  boss.dashHitPlayerIds.clear();
  boss.stunDurationTicks = durationTicks;
  boss.flatArmor = DREAD_COLOSSUS_CFG.armorStunned;
  boss.vulnMult = DREAD_COLOSSUS_CFG.stunDmgMult;
  boss.damageReduction = 0;
  boss.telegraphs.length = 0;
  pushFx(
    outFx,
    ctx.damageCtx,
    FX_STATUS,
    boss.id,
    BANSUNG_FX_STATUS_BOSS_OVERHEAT,
    durationTicks,
    Math.round(boss.x),
    Math.round(boss.y),
  );
  events.push({ type: 'overheat_start', durationTicks, reason });
}

function pushPlayersOutsideRadius(
  boss: DreadColossusState,
  radiusPx: number,
  ctx: ColossusStepContext,
): void {
  for (let i = 0; i < ctx.players.length; i++) {
    const p = ctx.players[i];
    if (!isPlayerTargetable(p)) continue;
    const dist = Math.hypot(p.x - boss.x, p.y - boss.y);
    if (dist < radiusPx) {
      applyRadialPushback(
        p,
        boss.x,
        boss.y,
        radiusPx - dist,
        ctx.obsGrid,
        boss.arenaBounds,
      );
    }
  }
}

function enterDroneSummon(
  boss: DreadColossusState,
  droneCount: number,
  ctx: ColossusStepContext,
  events: ColossusEvent[],
): void {
  boss.state = COLOSSUS_STATE.DRONE_SUMMON;
  boss.stateTick = 0;
  boss.vx = 0;
  boss.vy = 0;
  boss.pendingDroneCount = droneCount;
  boss.telegraphs.length = 0;
  pushPlayersOutsideRadius(boss, COLOSSUS_TUNING.DRONE_PUSHBACK_PX, ctx);
  boss.telegraphs.push({
    id: nextSeq(boss),
    kind: 1,
    phase: 0,
    color: 2,
    prog: 0,
    x0: boss.x,
    y0: boss.y,
    x1: boss.x,
    y1: boss.y,
    r: COLOSSUS_TUNING.DRONE_PUSHBACK_PX,
  });
  events.push({ type: 'drone_summon_start', count: droneCount });
}

function spawnShieldDrones(
  boss: DreadColossusState,
  count: number,
  ctx: ColossusStepContext,
  outFx: number[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  events: ColossusEvent[],
): void {
  boss.drones.length = 0;
  boss.droneTimerTicks = 0;
  boss.bossBoltCd = COLOSSUS_TUNING.BOSS_SHIELD_BOLT_CD_TICKS;
  boss.droneFanCd = COLOSSUS_TUNING.DRONE_FAN_INTERVAL_TICKS;
  boss.droneFireCycleIdx = 0;

  const stepAngle = TAU / count;
  for (let i = 0; i < count; i++) {
    const angle = boss.droneOrbitAngle + i * stepAngle;
    const body: CircleBody = {
      x: boss.x + Math.cos(angle) * DREAD_COLOSSUS_CFG.droneOrbitRadius,
      y: boss.y + Math.sin(angle) * DREAD_COLOSSUS_CFG.droneOrbitRadius,
      radius: BANSUNG_IRON_DRONE_CFG.radius,
    };
    resolveBodyClamped(body, ctx.obsGrid, boss.arenaBounds);

    const droneId = nextSeq(boss);
    const drone: ColossusDrone = {
      id: droneId,
      numId: droneId,
      bossId: boss.id,
      kind: 'iron_drone',
      x: body.x,
      y: body.y,
      vx: 0,
      vy: 0,
      radius: BANSUNG_IRON_DRONE_CFG.radius,
      team: 1,
      layer: LAYER_ENEMY,
      alive: true,
      tier: 'mob',
      armorType: BANSUNG_IRON_DRONE_CFG.armorType,
      flatArmor: BANSUNG_IRON_DRONE_CFG.armor,
      hp: boss.droneMaxHp,
      maxHp: boss.droneMaxHp,
      shield: 0,
      maxShield: 0,
      ccImmune: false,
      hitFlashMs: 0,
      dots: {},
      orbitIndex: i,
      orbitCount: count,
      orbitAngle: angle,
      pauseTicks: 0,
      facingLeft: Math.cos(angle) < 0,
    };
    boss.drones.push(drone);
  }

  boss.damageReduction = DREAD_COLOSSUS_CFG.shieldDr;
  pushFx(
    outFx,
    ctx.damageCtx,
    FX_STATUS,
    boss.id,
    BANSUNG_FX_STATUS_BOSS_SHIELD_UP,
    count,
    Math.round(boss.x),
    Math.round(boss.y),
  );
  emitSfx(outSfx, ctx, boss, 'shield_up');
  events.push({ type: 'drones_spawned', count });
  ctx.onSpawnDrones?.(boss.drones, boss);
}

function emitThunderBolt(
  boss: DreadColossusState,
  sx: number,
  sy: number,
  angleRad: number,
  speed: number,
  damage: number,
  fromDrone: boolean,
  outProj: ColossusProjectileSpawn[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  ctx: ColossusStepContext,
  fanSlot = 0,
): void {
  const vx = Math.cos(angleRad) * speed;
  const vy = Math.sin(angleRad) * speed;
  const danmaku: DanmakuMotionSpec = fromDrone
    ? {
        danmakuKind: 'danmaku_lance',
        palette: BANSUNG_DANMAKU_PALETTE.CYAN,
        scaleTier: 1,
        angVel: fanSlot * 0.42,
      }
    : {
        danmakuKind: 'danmaku_ring',
        palette: BANSUNG_DANMAKU_PALETTE.GOLD,
        scaleTier: 2,
        splitAfterTicks: 22,
        splitMode: 'rose_flower',
        splitCount: 8,
        splitSpeed: 280,
        splitChildKind: 'danmaku_star',
        splitChildPalette: BANSUNG_DANMAKU_PALETTE.FLAME,
      };
  const proj: ColossusProjectileSpawn = {
    ownerId: boss.id,
    kind: 'thunderball',
    x: sx,
    y: sy,
    vx,
    vy,
    angleRad,
    speed,
    radius: COLOSSUS_TUNING.BOLT_RADIUS,
    damage,
    ttlTicks: COLOSSUS_TUNING.BOLT_TTL_TICKS,
    fromDrone,
    danmaku,
  };
  outProj.push(proj);
  ctx.onProjectile?.(proj, boss);
  emitSfx(outSfx, ctx, boss, 'boss_bolt', sx, sy);
}

function pickMortarLandingSpot(
  boss: DreadColossusState,
  shellIdx: number,
  alivePlayers: readonly ColossusPlayerTarget[],
  ctx: ColossusStepContext,
): { x: number; y: number } {
  const predictiveCount = Math.min(alivePlayers.length, 3);
  let tx = boss.x;
  let ty = boss.y;

  if (shellIdx < predictiveCount) {
    const p = alivePlayers[shellIdx];
    tx = p.x + (p.vx ?? 0) * COLOSSUS_TUNING.MORTAR_LEAD_S;
    ty = p.y + (p.vy ?? 0) * COLOSSUS_TUNING.MORTAR_LEAD_S;
  } else {
    const anchor =
      alivePlayers.length > 0 ? alivePlayers[shellIdx % alivePlayers.length] : { x: boss.x, y: boss.y };
    const hexAng = (shellIdx * TAU) / 6 + (nextPrng(boss, ctx.rng) - 0.5) * 0.32;
    const dist =
      Math.max(150, COLOSSUS_TUNING.MORTAR_SCATTER_MIN) +
      nextPrng(boss, ctx.rng) *
        (COLOSSUS_TUNING.MORTAR_SCATTER_MAX - Math.max(150, COLOSSUS_TUNING.MORTAR_SCATTER_MIN));
    tx = anchor.x + Math.cos(hexAng) * dist;
    ty = anchor.y + Math.sin(hexAng) * dist;
  }

  const body: CircleBody = { x: tx, y: ty, radius: 16 };
  resolveBodyClamped(body, ctx.obsGrid, boss.arenaBounds);
  return { x: body.x, y: body.y };
}

function stepShieldDrones(
  boss: DreadColossusState,
  ctx: ColossusStepContext,
  outProj: ColossusProjectileSpawn[],
  outFx: number[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  events: ColossusEvent[],
): boolean {
  if (boss.drones.length === 0) return false;

  boss.droneTimerTicks += 1;
  if (boss.droneTimerTicks >= DREAD_COLOSSUS_CFG.droneTimeoutTicks) {
    for (let i = 0; i < boss.drones.length; i++) {
      const d = boss.drones[i];
      d.alive = false;
      d.hp = 0;
      ctx.onDroneDestroyed?.(d, true, boss);
    }
    boss.drones.length = 0;
    boss.damageReduction = 0;
    emitSfx(outSfx, ctx, boss, 'shield_shatter');
    events.push({ type: 'drone_timeout' });
    enterOverheatStun(
      boss,
      COLOSSUS_TUNING.DRONE_TIMEOUT_STUN_TICKS,
      'timeout',
      ctx,
      outFx,
      events,
    );
    return true;
  }

  boss.droneOrbitAngle =
    (boss.droneOrbitAngle + DREAD_COLOSSUS_CFG.droneOrbitRadPerS * DT_S) % TAU;

  boss.droneFanCd -= 1;
  if (boss.droneFanCd <= 0) {
    boss.droneFanCd = COLOSSUS_TUNING.DRONE_FAN_INTERVAL_TICKS;
    const idx = boss.droneFireCycleIdx % boss.drones.length;
    boss.droneFireCycleIdx += 1;
    boss.drones[idx].pauseTicks = COLOSSUS_TUNING.DRONE_FAN_PAUSE_TICKS;
  }

  const nearest = findNearestPlayer(boss, ctx.players);

  for (let i = 0; i < boss.drones.length; i++) {
    const d = boss.drones[i];
    tickStatuses(d, BANSUNG_TICK_EXACT_MS, ctx.statusCtx ?? ctx.damageCtx);

    if (d.pauseTicks > 0) {
      d.pauseTicks -= 1;
      d.vx = 0;
      d.vy = 0;
      if (nearest) {
        d.facingLeft = nearest.player.x < d.x;
      }
      if (d.pauseTicks === 0 && nearest) {
        const baseAim = Math.atan2(nearest.player.y - d.y, nearest.player.x - d.x);
        const spreadRad = COLOSSUS_TUNING.DRONE_FAN_SPREAD_DEG * DEG_TO_RAD;
        for (let k = -1; k <= 1; k++) {
          const ang = baseAim + k * spreadRad;
          emitThunderBolt(
            boss,
            d.x + Math.cos(ang) * (d.radius + 4),
            d.y + Math.sin(ang) * (d.radius + 4),
            ang,
            BANSUNG_IRON_DRONE_CFG.boltSpeed,
            BANSUNG_IRON_DRONE_CFG.boltDmg,
            true,
            outProj,
            outSfx,
            ctx,
            k,
          );
        }
      }
      continue;
    }

    const angle = boss.droneOrbitAngle + (TAU * d.orbitIndex) / d.orbitCount;
    d.orbitAngle = angle;
    const prevX = d.x;
    const prevY = d.y;
    const body: CircleBody = {
      x: boss.x + Math.cos(angle) * DREAD_COLOSSUS_CFG.droneOrbitRadius,
      y: boss.y + Math.sin(angle) * DREAD_COLOSSUS_CFG.droneOrbitRadius,
      radius: d.radius,
    };
    resolveBodyClamped(body, ctx.obsGrid, boss.arenaBounds);
    d.x = body.x;
    d.y = body.y;
    d.vx = (d.x - prevX) * 30;
    d.vy = (d.y - prevY) * 30;
    d.facingLeft = nearest ? nearest.player.x < d.x : Math.cos(angle) < 0;

    // Soul Knight Zulan Rotating Drone Laser Pinwheel (vanishes per drone as destroyed!)
    const pinCycle = boss.droneTimerTicks % 44;
    const pinActive = pinCycle >= 20;
    const pinLen = 185;
    const rawEx = d.x + Math.cos(angle) * pinLen;
    const rawEy = d.y + Math.sin(angle) * pinLen;
    const rayHit = raycastObstacles(ctx.obsGrid, d.x, d.y, rawEx, rawEy, 0, 'los');
    const ex = rayHit ? rayHit.x : rawEx;
    const ey = rayHit ? rayHit.y : rawEy;
    boss.telegraphs.push({
      id: boss.id * 1000 + 300 + d.orbitIndex,
      kind: 0,
      shape: 'line',
      phase: pinActive || pinCycle >= 14 ? 1 : 0,
      color: 2,
      prog: pinActive ? 255 : Math.round((pinCycle / 20) * 235),
      x0: Math.round(d.x),
      y0: Math.round(d.y),
      x1: Math.round(ex),
      y1: Math.round(ey),
      r: 12,
      halfW: 12,
      active: pinActive,
      danger: 1,
      sourceKind: 'boss_colossus',
    });
    if (pinActive && pinCycle % 3 === 0) {
      pushFx(
        outFx,
        ctx.damageCtx,
        FX_BEAM,
        Math.round(d.x),
        Math.round(d.y),
        Math.round(ex),
        Math.round(ey),
        BANSUNG_FX_BEAM_SHOCK,
      );
    }
    if (pinActive && pinCycle % 6 === 2) {
      for (let pi = 0; pi < ctx.players.length; pi++) {
        const pl = ctx.players[pi];
        if (!isPlayerTargetable(pl)) continue;
        const hitR = 12 + pl.radius;
        if (distPointToSegmentSq(pl.x, pl.y, d.x, d.y, ex, ey) <= hitR * hitR) {
          applyBansungDamage(
            pl,
            {
              baseDmg: 9,
              dmgKind: 'energy',
              attackerId: boss.idStr,
            },
            ctx.damageCtx,
          );
        }
      }
    }
  }

  boss.bossBoltCd -= 1;
  if (boss.bossBoltCd <= 0 && boss.state === COLOSSUS_STATE.MARCH) {
    boss.bossBoltCd = COLOSSUS_TUNING.BOSS_SHIELD_BOLT_CD_TICKS;
    if (nearest) {
      const aim = Math.atan2(nearest.player.y - boss.y, nearest.player.x - boss.x);
      setAimToward(boss, nearest.player.x, nearest.player.y);
      emitThunderBolt(
        boss,
        boss.x + Math.cos(aim) * (boss.radius + 6),
        boss.y + Math.sin(aim) * (boss.radius + 6),
        aim,
        COLOSSUS_TUNING.BOSS_SHIELD_BOLT_SPEED,
        COLOSSUS_TUNING.BOSS_SHIELD_BOLT_DMG,
        false,
        outProj,
        outSfx,
        ctx,
      );
    }
  }

  return false;
}

function pushMortarTelegraph(
  boss: DreadColossusState,
  m: ColossusMortarHazard,
): void {
  boss.telegraphs.push({
    id: m.id,
    kind: 1,
    shape: 'circle',
    phase: m.ticksLeft <= 12 ? 1 : 0,
    color: 0,
    prog: Math.round(((m.maxTicks - m.ticksLeft) / m.maxTicks) * 255),
    x0: m.startX,
    y0: m.startY,
    x1: m.x,
    y1: m.y,
    r: m.radius,
    danger: 1,
    sourceKind: 'boss_colossus',
  });
}

function pushDashLaneTelegraph(boss: DreadColossusState): void {
  boss.telegraphs.push({
    id: nextSeq(boss),
    kind: 0,
    shape: 'line',
    phase: boss.stateTick >= boss.dashLockTick ? 1 : 0,
    color: 0,
    prog: Math.round((boss.stateTick / Math.max(1, boss.dashWindupTicks)) * 255),
    x0: boss.x,
    y0: boss.y,
    x1: boss.x + Math.cos(boss.aimRad) * COLOSSUS_TUNING.DASH_TELEGRAPH_LEN,
    y1: boss.y + Math.sin(boss.aimRad) * COLOSSUS_TUNING.DASH_TELEGRAPH_LEN,
    r: COLOSSUS_TUNING.DASH_TELEGRAPH_WIDTH * 0.5,
    halfW: COLOSSUS_TUNING.DASH_TELEGRAPH_WIDTH * 0.5,
    danger: 1,
    sourceKind: 'boss_colossus',
  });
}

function stepMortars(
  boss: DreadColossusState,
  ctx: ColossusStepContext,
  outFx: number[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  events: ColossusEvent[],
): void {
  for (let i = boss.mortars.length - 1; i >= 0; i--) {
    const m = boss.mortars[i];
    m.ticksLeft -= 1;
    if (m.ticksLeft > 0) {
      continue;
    }

    boss.mortars.splice(i, 1);
    pushFx(
      outFx,
      ctx.damageCtx,
      FX_BLAST,
      BANSUNG_FX_BLAST_BOSS_MORTAR,
      Math.round(m.x),
      Math.round(m.y),
      m.radius,
      boss.id,
    );
    emitSfx(outSfx, ctx, boss, 'mortar_explode', m.x, m.y);
    events.push({ type: 'mortar_explode', id: m.id, x: m.x, y: m.y, radius: m.radius });

    const r2 = m.radius * m.radius;
    for (let j = 0; j < ctx.players.length; j++) {
      const p = ctx.players[j];
      if (!isPlayerTargetable(p)) continue;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const dist = Math.sqrt(d2);
      const mult = dist <= COLOSSUS_TUNING.MORTAR_INNER_RADIUS ? 1.0 : COLOSSUS_TUNING.MORTAR_EDGE_MULT;
      const dmgRes = applyBansungDamage(
        p,
        {
          baseDmg: m.damage * mult,
          dmgKind: 'explosive',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
      if (!dmgRes.blocked) {
        applyRadialPushback(p, m.x, m.y, m.knockbackPx, ctx.obsGrid, boss.arenaBounds);
      }
    }

    queryAoeObstacles(ctx.obsGrid, m.x, m.y, m.radius, 'none', tmpObsTargets);
    for (let k = 0; k < tmpObsTargets.length; k++) {
      const t = tmpObsTargets[k];
      ctx.onObstacleHit?.(t.obstacle, Math.round(m.damage * t.falloff), boss);
    }

    if (boss.mortarHeatClaimedBarrageId < m.barrageId) {
      boss.mortarHeatClaimedBarrageId = m.barrageId;
      if (
        boss.state !== COLOSSUS_STATE.DRONE_SUMMON &&
        boss.state !== COLOSSUS_STATE.OVERHEAT_STUN &&
        boss.state !== COLOSSUS_STATE.DEAD
      ) {
        boss.heat = Math.min(100, boss.heat + DREAD_COLOSSUS_CFG.mortarHeat);
        if (boss.heat >= 100) {
          const stunTicks =
            boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
              ? DREAD_COLOSSUS_CFG.stunTicksP2
              : DREAD_COLOSSUS_CFG.stunTicksP1;
          enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
        }
      }
    }
  }

  for (let i = 0; i < boss.mortars.length; i++) {
    pushMortarTelegraph(boss, boss.mortars[i]);
  }
}

function checkDashWallBounds(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  radius: number,
  bounds: ColossusArenaBounds,
): { t: number; nx: number; ny: number } | null {
  const minX = bounds.x0 + radius;
  const maxX = bounds.x1 - radius;
  const minY = bounds.y0 + radius;
  const maxY = bounds.y1 - radius;

  let bestT = Infinity;
  let nx = 0;
  let ny = 0;

  if (dx < -1e-6 && x0 + dx < minX) {
    const t = Math.max(0, (minX - x0) / dx);
    if (t < bestT) {
      bestT = t;
      nx = 1;
      ny = 0;
    }
  } else if (dx > 1e-6 && x0 + dx > maxX) {
    const t = Math.max(0, (maxX - x0) / dx);
    if (t < bestT) {
      bestT = t;
      nx = -1;
      ny = 0;
    }
  }

  if (dy < -1e-6 && y0 + dy < minY) {
    const t = Math.max(0, (minY - y0) / dy);
    if (t < bestT) {
      bestT = t;
      nx = 0;
      ny = 1;
    }
  } else if (dy > 1e-6 && y0 + dy > maxY) {
    const t = Math.max(0, (maxY - y0) / dy);
    if (t < bestT) {
      bestT = t;
      nx = 0;
      ny = -1;
    }
  }

  return bestT <= 1 ? { t: bestT, nx, ny } : null;
}

function triggerDashWallCrash(
  boss: DreadColossusState,
  ctx: ColossusStepContext,
  outFx: number[],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }>,
  events: ColossusEvent[],
): void {
  boss.vx = 0;
  boss.vy = 0;
  boss.dashHitPlayerIds.clear();

  pushFx(
    outFx,
    ctx.damageCtx,
    FX_BLAST,
    BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
    Math.round(boss.x),
    Math.round(boss.y),
    COLOSSUS_TUNING.WALL_CRASH_RADIUS,
    boss.id,
  );
  emitSfx(outSfx, ctx, boss, 'boss_wall_crash');

  const r = COLOSSUS_TUNING.WALL_CRASH_RADIUS;
  for (let i = 0; i < ctx.players.length; i++) {
    const p = ctx.players[i];
    if (!isPlayerTargetable(p)) continue;
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    if (Math.hypot(dx, dy) <= r + p.radius) {
      const dmgRes = applyBansungDamage(
        p,
        {
          baseDmg: COLOSSUS_TUNING.WALL_CRASH_DMG,
          dmgKind: 'explosive',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
      if (!dmgRes.blocked) {
        applyRadialPushback(p, boss.x, boss.y, 70, ctx.obsGrid, boss.arenaBounds);
      }
    }
  }

  boss.heat = Math.min(100, boss.heat + DREAD_COLOSSUS_CFG.wallCrashHeat);
  events.push({ type: 'wall_crash', x: boss.x, y: boss.y, heat: boss.heat });

  if (boss.heat >= 100) {
    const stunTicks =
      boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
        ? DREAD_COLOSSUS_CFG.stunTicksP2
        : DREAD_COLOSSUS_CFG.stunTicksP1;
    enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
  } else {
    boss.state = COLOSSUS_STATE.DASH_RECOVER;
    boss.stateTick = 0;
  }
}

// ============================================================================
// 4. Public Lifecycle, Damage & Tick Functions
// ============================================================================

/**
 * Instantiates Boss 2: Dread Colossus (`boss_colossus`) with co-op and
 * difficulty HP scaling (`d38`).
 */
export function createDreadColossus(
  opts: CreateDreadColossusOptions = {},
): DreadColossusState {
  const playerCount = opts.playerCount ?? 1;
  const difficulty = opts.difficulty ?? 'normal';
  const endlessTier = opts.endlessTier ?? 0;
  const hpMult = opts.hpMult ?? 1;

  const bossScale = computeBossHpMult(playerCount, difficulty, endlessTier);
  const maxHp = Math.max(1, Math.round(DREAD_COLOSSUS_CFG.baseHp * bossScale * hpMult));

  const clampedPlayers = Math.max(1, Math.min(4, Math.round(playerCount)));
  const diffScale =
    BANSUNG_DIFFICULTY_SCALE[difficulty as BansungDifficultyKey]?.bossHp ?? 1.0;
  const endlessDroneMult = 1 + 0.35 * Math.max(0, endlessTier);
  const droneMaxHp = Math.max(
    1,
    Math.round(
      DREAD_COLOSSUS_CFG.droneBaseHp *
        (1 + 0.45 * (clampedPlayers - 1)) *
        diffScale *
        endlessDroneMult *
        hpMult,
    ),
  );

  const arenaBounds: ColossusArenaBounds = opts.arenaBounds
    ? { ...opts.arenaBounds }
    : {
        x0: BANSUNG_PLAYABLE_BOUNDS.x0,
        y0: BANSUNG_PLAYABLE_BOUNDS.y0,
        x1: BANSUNG_PLAYABLE_BOUNDS.x1,
        y1: BANSUNG_PLAYABLE_BOUNDS.y1,
      };

  const id = opts.id ?? 9002;
  const scale = Math.max(0.45, Math.min(2.2, opts.scale ?? 1));
  const scaledRadius = Math.max(20, Math.round(DREAD_COLOSSUS_CFG.radius * scale));
  const x = clamp(
    opts.x ?? BANSUNG_ARENA_CX,
    arenaBounds.x0 + scaledRadius,
    arenaBounds.x1 - scaledRadius,
  );
  const y = clamp(
    opts.y ?? BANSUNG_ARENA_CY,
    arenaBounds.y0 + scaledRadius,
    arenaBounds.y1 - scaledRadius,
  );

  return {
    id,
    numId: id,
    idStr: opts.idStr ?? 'boss_colossus',
    kind: 'boss_colossus',
    x,
    y,
    vx: 0,
    vy: 0,
    radius: scaledRadius,
    team: 1,
    layer: LAYER_ENEMY,
    alive: true,
    hp: maxHp,
    maxHp,
    shield: 0,
    maxShield: 0,
    tier: 'boss',
    armorType: 'armored',
    flatArmor: DREAD_COLOSSUS_CFG.armorNormal,
    damageReduction: DREAD_COLOSSUS_CFG.baseDr,
    vulnMult: 1.0,
    ccImmune: true,
    hitFlashMs: 0,
    dots: {},
    facingLeft: true,
    phase: 1,
    state: COLOSSUS_STATE.MARCH,
    stateTick: 0,
    aimRad: Math.PI,
    aimDeg: 180,
    heat: 0,
    cleaveCd: 0,
    dashCd: 45,
    mortarCd: 105,
    dashWindupTicks: DREAD_COLOSSUS_CFG.dashWindupTicks,
    dashLockTick: COLOSSUS_TUNING.DASH_LOCK_TICK,
    dashChainIndex: 0,
    dashHitPlayerIds: new Set<number>(),
    mortarTotalShells: COLOSSUS_TUNING.MORTAR_P1_COUNT,
    mortarLaunched: 0,
    mortarBarrageId: 0,
    mortarHeatClaimedBarrageId: 0,
    mortars: [],
    drones: [],
    dronePhasesTriggered: [false, false],
    pendingDroneCount: 0,
    droneMaxHp,
    droneTimerTicks: 0,
    droneOrbitAngle: 0,
    droneFireCycleIdx: 0,
    bossBoltCd: COLOSSUS_TUNING.BOSS_SHIELD_BOLT_CD_TICKS,
    droneFanCd: COLOSSUS_TUNING.DRONE_FAN_INTERVAL_TICKS,
    stunDurationTicks: 0,
    targetId: null,
    telegraphs: [],
    arenaBounds,
    rngState: (opts.seed ?? 0x9e3779b9) | 0,
    nextSeqId: id * 100 + 1,
    deathEmitted: false,
  };
}

/**
 * Applies damage against Dread Colossus while enforcing `shieldDr = 0.85`
 * (crit-blocking while drones live) and `overheat_stun` (`0` armor, `1.5x`
 * damage taken, guaranteed weak-point crits).
 */
export function damageDreadColossus(
  boss: DreadColossusState,
  hit: BansungDamageHit,
  ctx?: BansungDamageContext,
): BansungDamageResult {
  syncBossDefenseStats(boss);

  let effectiveHit = hit;
  if (boss.drones.length > 0 && !hit.isDot) {
    effectiveHit = {
      ...hit,
      forceCrit: false,
      critChance: 0,
      atkCritBonus: 0,
    };
  } else if (boss.state === COLOSSUS_STATE.OVERHEAT_STUN && !hit.isDot) {
    effectiveHit = {
      ...hit,
      forceCrit: true,
    };
  }

  const res = applyBansungDamage(boss, effectiveHit, ctx);
  if (res.killed || boss.hp <= 0) {
    boss.hp = 0;
    boss.alive = false;
    boss.state = COLOSSUS_STATE.DEAD;
    boss.vx = 0;
    boss.vy = 0;
  }
  return res;
}

/**
 * Reconciles externally damaged/killed `iron_drone` escorts and triggers the
 * `180` HP boss shatter burst + `135t` `overheat_stun` when the last drone dies.
 */
export function syncColossusDrones(
  boss: DreadColossusState,
  ctx?: Partial<ColossusStepContext>,
  outFx: number[] = [],
  outSfx: Array<{ id: ColossusSfxId; x: number; y: number }> = [],
  events: ColossusEvent[] = [],
): boolean {
  if (boss.drones.length === 0) return false;

  const hadDrones = boss.drones.length;
  for (let i = boss.drones.length - 1; i >= 0; i--) {
    const d = boss.drones[i];
    if (!d.alive || d.hp <= 0) {
      d.alive = false;
      d.hp = 0;
      boss.drones.splice(i, 1);
      ctx?.onDroneDestroyed?.(d, false, boss);
    }
  }

  if (hadDrones > 0 && boss.drones.length === 0 && boss.alive && boss.hp > 0) {
    boss.damageReduction = 0;
    boss.hp = Math.max(0, boss.hp - BANSUNG_IRON_DRONE_CFG.shatterBossSelfDmg);
    pushFx(
      outFx,
      ctx?.damageCtx,
      FX_BLAST,
      BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
      Math.round(boss.x),
      Math.round(boss.y),
      95,
      boss.id,
    );
    outSfx.push({ id: 'shield_shatter', x: boss.x, y: boss.y });
    ctx?.onSfx?.('shield_shatter', boss.x, boss.y, boss);
    events.push({
      type: 'drone_shatter',
      bossSelfDmg: BANSUNG_IRON_DRONE_CFG.shatterBossSelfDmg,
    });

    if (boss.hp <= 0) {
      boss.hp = 0;
      boss.alive = false;
      boss.state = COLOSSUS_STATE.DEAD;
      boss.vx = 0;
      boss.vy = 0;
      return true;
    }

    boss.heat = 100;
    if (boss.state !== COLOSSUS_STATE.DRONE_SUMMON && boss.state !== COLOSSUS_STATE.DEAD) {
      boss.state = COLOSSUS_STATE.OVERHEAT_STUN;
      boss.stateTick = 0;
      boss.vx = 0;
      boss.vy = 0;
      boss.dashChainIndex = 0;
      boss.dashHitPlayerIds.clear();
      boss.stunDurationTicks = DREAD_COLOSSUS_CFG.stunTicksShatter;
      boss.flatArmor = DREAD_COLOSSUS_CFG.armorStunned;
      boss.vulnMult = DREAD_COLOSSUS_CFG.stunDmgMult;
      boss.telegraphs.length = 0;
      pushFx(
        outFx,
        ctx?.damageCtx,
        FX_STATUS,
        boss.id,
        BANSUNG_FX_STATUS_BOSS_OVERHEAT,
        DREAD_COLOSSUS_CFG.stunTicksShatter,
        Math.round(boss.x),
        Math.round(boss.y),
      );
      events.push({
        type: 'overheat_start',
        durationTicks: DREAD_COLOSSUS_CFG.stunTicksShatter,
        reason: 'shatter',
      });
    }
    return true;
  }

  return false;
}

export function stunColossusBoss(boss: DreadColossusState, durationMs: number): void {
  if (!boss.alive) return;
  const ticks = Math.max(18, Math.round((durationMs * 30) / 1000));
  boss.state = COLOSSUS_STATE.OVERHEAT_STUN;
  boss.stateTick = 0;
  boss.vx = 0;
  boss.vy = 0;
  boss.dashChainIndex = 0;
  boss.dashHitPlayerIds.clear();
  boss.stunDurationTicks = Math.max(boss.stunDurationTicks, ticks);
  boss.flatArmor = DREAD_COLOSSUS_CFG.armorStunned;
  boss.vulnMult = DREAD_COLOSSUS_CFG.stunDmgMult;
  boss.telegraphs.length = 0;
}

/**
 * Applies damage to a specific `iron_drone` escort and triggers phalanx shatter
 * immediately if that hit destroys the final active drone.
 */
export function damageColossusDrone(
  boss: DreadColossusState,
  droneOrId: ColossusDrone | number,
  hit: BansungDamageHit,
  ctx?: Partial<ColossusStepContext>,
): BansungDamageResult {
  const targetId = typeof droneOrId === 'number' ? droneOrId : droneOrId.id;
  const drone = boss.drones.find((d) => d.id === targetId);
  if (!drone) {
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

  const res = applyBansungDamage(drone, hit, ctx?.damageCtx);
  if (res.killed || !drone.alive || drone.hp <= 0) {
    syncColossusDrones(boss, ctx);
  }
  return res;
}

/**
 * Advances Dread Colossus by one authoritative `30 Hz` (`33.33 ms`) tick.
 */
export function stepDreadColossus(
  boss: DreadColossusState,
  ctx: ColossusStepContext,
): ColossusStepResult {
  const outProj: ColossusProjectileSpawn[] = [];
  const outSfx: Array<{ id: ColossusSfxId; x: number; y: number }> = [];
  const outFx: number[] = [];
  const events: ColossusEvent[] = [];

  boss.telegraphs.length = 0;

  if (!boss.alive || boss.hp <= 0 || boss.state === COLOSSUS_STATE.DEAD) {
    finalizeDeath(boss, ctx, outFx, outSfx, events);
    return {
      state: boss.state,
      stateTick: boss.stateTick,
      heat: boss.heat,
      activeDrones: 0,
      projectiles: outProj,
      sfx: outSfx,
      fx: outFx,
      events,
      telegraphs: boss.telegraphs,
    };
  }

  tickStatuses(boss, BANSUNG_TICK_EXACT_MS, ctx.statusCtx ?? ctx.damageCtx);
  if (!boss.alive || boss.hp <= 0) {
    finalizeDeath(boss, ctx, outFx, outSfx, events);
    return {
      state: boss.state,
      stateTick: boss.stateTick,
      heat: boss.heat,
      activeDrones: 0,
      projectiles: outProj,
      sfx: outSfx,
      fx: outFx,
      events,
      telegraphs: boss.telegraphs,
    };
  }

  syncColossusDrones(boss, ctx, outFx, outSfx, events);
  if (!boss.alive || boss.hp <= 0) {
    finalizeDeath(boss, ctx, outFx, outSfx, events);
    return {
      state: boss.state,
      stateTick: boss.stateTick,
      heat: boss.heat,
      activeDrones: 0,
      projectiles: outProj,
      sfx: outSfx,
      fx: outFx,
      events,
      telegraphs: boss.telegraphs,
    };
  }

  syncBossDefenseStats(boss);

  if (boss.cleaveCd > 0) boss.cleaveCd -= 1;
  if (boss.dashCd > 0) boss.dashCd -= 1;
  if (boss.mortarCd > 0) boss.mortarCd -= 1;

  // Step active orbiting shield drones & boss barrier bolts
  stepShieldDrones(boss, ctx, outProj, outFx, outSfx, events);

  // Step in-flight mortar hazards
  stepMortars(boss, ctx, outFx, outSfx, events);

  // Global heat >= 100 guard (outside drone_summon / overheat_stun / dead;
  // in march we check HP threshold triggers first per d38 priority order)
  if (
    boss.heat >= 100 &&
    boss.state !== COLOSSUS_STATE.MARCH &&
    boss.state !== COLOSSUS_STATE.DRONE_SUMMON &&
    boss.state !== COLOSSUS_STATE.OVERHEAT_STUN &&
    boss.state !== COLOSSUS_STATE.DEAD
  ) {
    const stunTicks =
      boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
        ? DREAD_COLOSSUS_CFG.stunTicksP2
        : DREAD_COLOSSUS_CFG.stunTicksP1;
    enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
  }

  // Advance active FSM state
  switch (boss.state) {
    case COLOSSUS_STATE.MARCH: {
      boss.stateTick += 1;

      if (boss.drones.length === 0) {
        if (
          !boss.dronePhasesTriggered[1] &&
          boss.hp <= boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
        ) {
          boss.dronePhasesTriggered[0] = true;
          boss.dronePhasesTriggered[1] = true;
          enterDroneSummon(boss, COLOSSUS_TUNING.DRONE_P2_COUNT, ctx, events);
          break;
        }
        if (
          !boss.dronePhasesTriggered[0] &&
          boss.hp <= boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[0]
        ) {
          boss.dronePhasesTriggered[0] = true;
          enterDroneSummon(boss, COLOSSUS_TUNING.DRONE_P1_COUNT, ctx, events);
          break;
        }
      }

      if (boss.heat >= 100) {
        const stunTicks =
          boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
            ? DREAD_COLOSSUS_CFG.stunTicksP2
            : DREAD_COLOSSUS_CFG.stunTicksP1;
        enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
        break;
      }

      const nearest = findNearestPlayer(boss, ctx.players);
      const dashTarget = findFarthestDashTarget(boss, ctx.players);

      if (boss.drones.length === 0) {
        if (boss.mortarCd <= 0 && nearest !== null) {
          boss.state = COLOSSUS_STATE.MORTAR_WINDUP;
          boss.stateTick = 0;
          boss.vx = 0;
          boss.vy = 0;
          boss.targetId = nearest.player.id;
          setAimToward(boss, nearest.player.x, nearest.player.y);
          break;
        }

        if (boss.dashCd <= 0 && dashTarget !== null) {
          boss.state = COLOSSUS_STATE.DASH_WINDUP;
          boss.stateTick = 0;
          boss.vx = 0;
          boss.vy = 0;
          boss.dashChainIndex = 0;
          boss.dashWindupTicks = DREAD_COLOSSUS_CFG.dashWindupTicks;
          boss.dashLockTick = COLOSSUS_TUNING.DASH_LOCK_TICK;
          boss.targetId = dashTarget.player.id;
          setAimToward(boss, dashTarget.player.x, dashTarget.player.y);
          pushDashLaneTelegraph(boss);
          emitSfx(outSfx, ctx, boss, 'boss_charge_horn');
          events.push({
            type: 'dash_start',
            x: boss.x,
            y: boss.y,
            aimDeg: boss.aimDeg,
            chain: 0,
          });
          break;
        }

        if (
          nearest !== null &&
          nearest.dist <= COLOSSUS_TUNING.CLEAVE_TRIGGER_DIST &&
          boss.cleaveCd <= 0
        ) {
          boss.state = COLOSSUS_STATE.CLEAVE_WINDUP;
          boss.stateTick = 0;
          boss.vx = 0;
          boss.vy = 0;
          boss.targetId = nearest.player.id;
          setAimToward(boss, nearest.player.x, nearest.player.y);
          break;
        }
      }

      if (nearest !== null) {
        boss.targetId = nearest.player.id;
        const speed =
          boss.drones.length > 0
            ? DREAD_COLOSSUS_CFG.shieldWalkSpeed
            : DREAD_COLOSSUS_CFG.walkSpeed;
        const dx = nearest.player.x - boss.x;
        const dy = nearest.player.y - boss.y;
        const dist = nearest.dist;
        if (dist > 1e-4) {
          const ux = dx / dist;
          const uy = dy / dist;
          boss.vx = ux * speed;
          boss.vy = uy * speed;
          setAimToward(boss, nearest.player.x, nearest.player.y);
          moveBodyClamped(boss, boss.vx * DT_S, boss.vy * DT_S, ctx.obsGrid, boss.arenaBounds);
        } else {
          boss.vx = 0;
          boss.vy = 0;
        }
      } else {
        boss.vx = 0;
        boss.vy = 0;
      }
      break;
    }

    case COLOSSUS_STATE.CLEAVE_WINDUP: {
      boss.vx = 0;
      boss.vy = 0;
      boss.telegraphs.push({
        id: nextSeq(boss),
        kind: 1,
        phase: boss.stateTick >= COLOSSUS_TUNING.CLEAVE_WINDUP_TICKS - 4 ? 1 : 0,
        color: 0,
        prog: Math.round(
          (boss.stateTick / COLOSSUS_TUNING.CLEAVE_WINDUP_TICKS) * 255,
        ),
        x0: boss.x,
        y0: boss.y,
        x1: boss.x + Math.cos(boss.aimRad) * DREAD_COLOSSUS_CFG.cleaveRange,
        y1: boss.y + Math.sin(boss.aimRad) * DREAD_COLOSSUS_CFG.cleaveRange,
        r: DREAD_COLOSSUS_CFG.cleaveRange,
      });
      boss.stateTick += 1;
      if (boss.stateTick >= COLOSSUS_TUNING.CLEAVE_WINDUP_TICKS) {
        boss.state = COLOSSUS_STATE.CLEAVE_HIT;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.CLEAVE_HIT: {
      boss.vx = 0;
      boss.vy = 0;
      if (boss.stateTick === COLOSSUS_TUNING.CLEAVE_HIT_TICK) {
        const halfArcRad = (DREAD_COLOSSUS_CFG.cleaveArcDeg * 0.5) * DEG_TO_RAD;
        emitSfx(outSfx, ctx, boss, 'boss_cleave');
        events.push({ type: 'cleave', x: boss.x, y: boss.y, aimDeg: boss.aimDeg });

        for (let i = 0; i < ctx.players.length; i++) {
          const p = ctx.players[i];
          if (!isPlayerTargetable(p)) continue;
          const dx = p.x - boss.x;
          const dy = p.y - boss.y;
          const dist = Math.hypot(dx, dy);
          if (dist > DREAD_COLOSSUS_CFG.cleaveRange) continue;
          const ang = Math.atan2(dy, dx);
          const diff = Math.abs(normalizeAngle(ang - boss.aimRad));
          if (dist <= boss.radius + p.radius || diff <= halfArcRad) {
            const dmgRes = applyBansungDamage(
              p,
              {
                baseDmg: DREAD_COLOSSUS_CFG.cleaveDmg,
                dmgKind: 'melee',
                attackerId: boss.idStr,
              },
              ctx.damageCtx,
            );
            if (!dmgRes.blocked) {
              applyRadialPushback(
                p,
                boss.x,
                boss.y,
                COLOSSUS_TUNING.CLEAVE_KNOCKBACK_PX,
                ctx.obsGrid,
                boss.arenaBounds,
              );
            }
          }
        }

        boss.heat = Math.min(100, boss.heat + COLOSSUS_TUNING.CLEAVE_HEAT);
        boss.cleaveCd = COLOSSUS_TUNING.CLEAVE_CD_TICKS;
        if (boss.heat >= 100) {
          const stunTicks =
            boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
              ? DREAD_COLOSSUS_CFG.stunTicksP2
              : DREAD_COLOSSUS_CFG.stunTicksP1;
          enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
          break;
        }
      }

      boss.stateTick += 1;
      if (boss.stateTick >= COLOSSUS_TUNING.CLEAVE_DURATION_TICKS) {
        boss.cleaveCd = COLOSSUS_TUNING.CLEAVE_CD_TICKS;
        boss.state = COLOSSUS_STATE.MARCH;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.DASH_WINDUP: {
      boss.vx = 0;
      boss.vy = 0;
      if (boss.stateTick < boss.dashLockTick) {
        const dashTarget = findFarthestDashTarget(boss, ctx.players);
        const fallback = dashTarget ?? findNearestPlayer(boss, ctx.players);
        if (fallback) {
          boss.targetId = fallback.player.id;
          setAimToward(boss, fallback.player.x, fallback.player.y);
        }
      }

      pushDashLaneTelegraph(boss);

      boss.stateTick += 1;
      if (boss.stateTick >= boss.dashWindupTicks) {
        boss.state = COLOSSUS_STATE.DASH_CHARGE;
        boss.stateTick = 0;
        boss.dashHitPlayerIds.clear();
      }
      break;
    }

    case COLOSSUS_STATE.DASH_CHARGE: {
      const dirX = Math.cos(boss.aimRad);
      const dirY = Math.sin(boss.aimRad);
      const stepDist = DREAD_COLOSSUS_CFG.dashSpeed * DT_S;
      const stepDx = dirX * stepDist;
      const stepDy = dirY * stepDist;

      boss.vx = dirX * DREAD_COLOSSUS_CFG.dashSpeed;
      boss.vy = dirY * DREAD_COLOSSUS_CFG.dashSpeed;

      const prevX = boss.x;
      const prevY = boss.y;

      // Ensure we start cleanly outside grazing walls so t=0 back-wall graze won't false-crash
      resolveBodyClamped(boss, ctx.obsGrid, boss.arenaBounds);

      let obsHit = raycastObstacles(
        ctx.obsGrid,
        boss.x,
        boss.y,
        boss.x + stepDx,
        boss.y + stepDy,
        boss.radius,
        'move',
      );
      if (obsHit && obsHit.obstacle.destructible) {
        ctx.onObstacleHit?.(obsHit.obstacle, DREAD_COLOSSUS_CFG.dashDmg, boss);
        if (!obsHit.obstacle.alive) {
          obsHit = raycastObstacles(
            ctx.obsGrid,
            boss.x,
            boss.y,
            boss.x + stepDx,
            boss.y + stepDy,
            boss.radius,
            'move',
          );
        }
      }

      const boundHit = checkDashWallBounds(
        boss.x,
        boss.y,
        stepDx,
        stepDy,
        boss.radius,
        boss.arenaBounds,
      );

      let wallCrash = false;
      let crashT = 1;

      if (obsHit) {
        const intoDot = dirX * obsHit.nx + dirY * obsHit.ny;
        if (intoDot < -0.15) {
          wallCrash = true;
          crashT = obsHit.t;
        }
      }
      if (boundHit && (!wallCrash || boundHit.t < crashT)) {
        const intoDot = dirX * boundHit.nx + dirY * boundHit.ny;
        if (intoDot < -0.15) {
          wallCrash = true;
          crashT = boundHit.t;
        }
      }

      if (wallCrash) {
        boss.x += stepDx * Math.max(0, crashT);
        boss.y += stepDy * Math.max(0, crashT);
        resolveBodyClamped(boss, ctx.obsGrid, boss.arenaBounds);
      } else {
        moveBodyClamped(boss, stepDx, stepDy, ctx.obsGrid, boss.arenaBounds);
      }

      const endX = boss.x;
      const endY = boss.y;

      // Swept player collision along prev -> end
      for (let i = 0; i < ctx.players.length; i++) {
        const p = ctx.players[i];
        if (!isPlayerTargetable(p) || boss.dashHitPlayerIds.has(p.id)) continue;
        const hitT = sweepCircleSegment(
          prevX,
          prevY,
          endX,
          endY,
          boss.radius,
          p.x,
          p.y,
          p.radius,
        );
        if (hitT >= 0) {
          const dmgRes = applyBansungDamage(
            p,
            {
              baseDmg: DREAD_COLOSSUS_CFG.dashDmg,
              dmgKind: 'melee',
              attackerId: boss.idStr,
            },
            ctx.damageCtx,
          );
          if (!dmgRes.blocked) {
            boss.dashHitPlayerIds.add(p.id);
            const hitX = prevX + (endX - prevX) * hitT;
            const hitY = prevY + (endY - prevY) * hitT;
            // Bias knockback laterally off the charge lane so player clears the path
            const cross = dirX * (p.y - hitY) - dirY * (p.x - hitX);
            const side = cross >= 0 ? 1 : -1;
            const perpX = -dirY * side;
            const perpY = dirX * side;
            const toPX = p.x - hitX;
            const toPY = p.y - hitY;
            const toLen = Math.hypot(toPX, toPY);
            const rx = toLen > 1e-4 ? toPX / toLen : perpX;
            const ry = toLen > 1e-4 ? toPY / toLen : perpY;
            const kx = rx * 0.65 + perpX * 0.35;
            const ky = ry * 0.65 + perpY * 0.35;
            const kLen = Math.hypot(kx, ky) || 1;
            moveBodyClamped(
              p,
              (kx / kLen) * COLOSSUS_TUNING.DASH_KNOCKBACK_PX,
              (ky / kLen) * COLOSSUS_TUNING.DASH_KNOCKBACK_PX,
              ctx.obsGrid,
              boss.arenaBounds,
            );
          }
        }
      }

      if (wallCrash) {
        triggerDashWallCrash(boss, ctx, outFx, outSfx, events);
        break;
      }

      boss.stateTick += 1;
      if (boss.stateTick >= DREAD_COLOSSUS_CFG.dashMaxTicks) {
        boss.vx = 0;
        boss.vy = 0;
        boss.dashHitPlayerIds.clear();
        boss.heat = Math.min(100, boss.heat + DREAD_COLOSSUS_CFG.dashHeat);

        if (boss.heat >= 100) {
          const stunTicks =
            boss.hp < boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[1]
              ? DREAD_COLOSSUS_CFG.stunTicksP2
              : DREAD_COLOSSUS_CFG.stunTicksP1;
          enterOverheatStun(boss, stunTicks, 'heat', ctx, outFx, events);
          break;
        }

        if (
          boss.hp <= boss.maxHp * DREAD_COLOSSUS_CFG.dronePhaseHps[0] &&
          boss.dashChainIndex === 0
        ) {
          const nextTarget =
            findFarthestDashTarget(boss, ctx.players) ??
            findNearestPlayer(boss, ctx.players);
          if (nextTarget) {
            boss.targetId = nextTarget.player.id;
            setAimToward(boss, nextTarget.player.x, nextTarget.player.y);
          }
          boss.dashChainIndex = 1;
          boss.state = COLOSSUS_STATE.DASH_WINDUP;
          boss.stateTick = 0;
          boss.dashWindupTicks = COLOSSUS_TUNING.DASH_CHAIN_WINDUP_TICKS;
          boss.dashLockTick = 0;
          pushDashLaneTelegraph(boss);
          emitSfx(outSfx, ctx, boss, 'boss_charge_horn');
          events.push({
            type: 'dash_start',
            x: boss.x,
            y: boss.y,
            aimDeg: boss.aimDeg,
            chain: 1,
          });
          break;
        }

        boss.state = COLOSSUS_STATE.DASH_RECOVER;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.DASH_RECOVER: {
      boss.vx = 0;
      boss.vy = 0;
      boss.stateTick += 1;
      if (boss.stateTick >= COLOSSUS_TUNING.DASH_RECOVER_TICKS) {
        boss.dashCd =
          boss.phase === 2
            ? COLOSSUS_TUNING.DASH_CD_P2_TICKS
            : COLOSSUS_TUNING.DASH_CD_P1_TICKS;
        boss.dashChainIndex = 0;
        boss.state = COLOSSUS_STATE.MARCH;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.MORTAR_WINDUP: {
      boss.vx = 0;
      boss.vy = 0;
      const nearest = findNearestPlayer(boss, ctx.players);
      if (nearest) {
        setAimToward(boss, nearest.player.x, nearest.player.y);
      }
      boss.stateTick += 1;
      if (boss.stateTick >= COLOSSUS_TUNING.MORTAR_WINDUP_TICKS) {
        boss.state = COLOSSUS_STATE.MORTAR_BARRAGE;
        boss.stateTick = 0;
        boss.mortarTotalShells =
          boss.phase === 2
            ? COLOSSUS_TUNING.MORTAR_P2_COUNT
            : COLOSSUS_TUNING.MORTAR_P1_COUNT;
        boss.mortarLaunched = 0;
        boss.mortarBarrageId += 1;
      }
      break;
    }

    case COLOSSUS_STATE.MORTAR_BARRAGE: {
      boss.vx = 0;
      boss.vy = 0;
      if (
        boss.mortarLaunched < boss.mortarTotalShells &&
        boss.stateTick % COLOSSUS_TUNING.MORTAR_SHELL_INTERVAL_TICKS === 0
      ) {
        const alivePlayers = ctx.players
          .filter(isPlayerTargetable)
          .sort((a, b) => a.id - b.id);
        const spot = pickMortarLandingSpot(boss, boss.mortarLaunched, alivePlayers, ctx);
        const mortarId = nextSeq(boss);
        const mortar: ColossusMortarHazard = {
          id: mortarId,
          barrageId: boss.mortarBarrageId,
          startX: boss.x,
          startY: boss.y,
          x: spot.x,
          y: spot.y,
          radius: DREAD_COLOSSUS_CFG.mortarRadius,
          ticksLeft: DREAD_COLOSSUS_CFG.mortarFlightTicks,
          maxTicks: DREAD_COLOSSUS_CFG.mortarFlightTicks,
          damage: DREAD_COLOSSUS_CFG.mortarDmg,
          knockbackPx: COLOSSUS_TUNING.MORTAR_KNOCKBACK_PX,
        };
        boss.mortars.push(mortar);
        pushMortarTelegraph(boss, mortar);
        emitSfx(outSfx, ctx, boss, 'mortar_launch');
        events.push({ type: 'mortar_launch', id: mortarId, x: spot.x, y: spot.y });
        boss.mortarLaunched += 1;
      }

      boss.stateTick += 1;
      const endTick =
        (boss.mortarTotalShells - 1) * COLOSSUS_TUNING.MORTAR_SHELL_INTERVAL_TICKS +
        COLOSSUS_TUNING.MORTAR_TAIL_TICKS;
      if (boss.mortarLaunched >= boss.mortarTotalShells && boss.stateTick >= endTick) {
        boss.mortarCd =
          boss.phase === 2
            ? COLOSSUS_TUNING.MORTAR_CD_P2_TICKS
            : COLOSSUS_TUNING.MORTAR_CD_P1_TICKS;
        boss.state = COLOSSUS_STATE.MARCH;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.DRONE_SUMMON: {
      boss.vx = 0;
      boss.vy = 0;
      pushPlayersOutsideRadius(boss, COLOSSUS_TUNING.DRONE_PUSHBACK_PX, ctx);

      boss.telegraphs.push({
        id: nextSeq(boss),
        kind: 1,
        phase: 0,
        color: 2,
        prog: Math.round(
          (boss.stateTick / COLOSSUS_TUNING.DRONE_SUMMON_TICKS) * 255,
        ),
        x0: boss.x,
        y0: boss.y,
        x1: boss.x,
        y1: boss.y,
        r: COLOSSUS_TUNING.DRONE_PUSHBACK_PX,
      });

      boss.stateTick += 1;
      if (boss.stateTick >= COLOSSUS_TUNING.DRONE_SUMMON_TICKS) {
        spawnShieldDrones(
          boss,
          boss.pendingDroneCount || COLOSSUS_TUNING.DRONE_P1_COUNT,
          ctx,
          outFx,
          outSfx,
          events,
        );
        boss.state = COLOSSUS_STATE.MARCH;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.OVERHEAT_STUN: {
      boss.vx = 0;
      boss.vy = 0;
      const ticksRemaining = Math.max(0, boss.stunDurationTicks - boss.stateTick);
      if (
        ticksRemaining > 0 &&
        ticksRemaining <= COLOSSUS_TUNING.STEAM_TELEGRAPH_TICKS
      ) {
        const elapsedTel = COLOSSUS_TUNING.STEAM_TELEGRAPH_TICKS - ticksRemaining;
        boss.telegraphs.push({
          id: nextSeq(boss),
          kind: 1,
          phase: 1,
          color: 1,
          prog: Math.round(
            (elapsedTel / COLOSSUS_TUNING.STEAM_TELEGRAPH_TICKS) * 255,
          ),
          x0: boss.x,
          y0: boss.y,
          x1: boss.x,
          y1: boss.y,
          r: COLOSSUS_TUNING.STEAM_VENT_RADIUS,
        });
      }

      boss.stateTick += 1;
      if (boss.stateTick >= boss.stunDurationTicks) {
        boss.flatArmor = DREAD_COLOSSUS_CFG.armorNormal;
        boss.vulnMult = 1.0;
        boss.heat = 0;

        for (let i = 0; i < ctx.players.length; i++) {
          const p = ctx.players[i];
          if (!isPlayerTargetable(p)) continue;
          const dist = Math.hypot(p.x - boss.x, p.y - boss.y);
          if (dist <= COLOSSUS_TUNING.STEAM_VENT_RADIUS + p.radius) {
            const dmgRes = applyBansungDamage(
              p,
              {
                baseDmg: COLOSSUS_TUNING.STEAM_VENT_DMG,
                dmgKind: 'fire',
                attackerId: boss.idStr,
              },
              ctx.damageCtx,
            );
            if (!dmgRes.blocked) {
              applyRadialPushback(
                p,
                boss.x,
                boss.y,
                COLOSSUS_TUNING.STEAM_VENT_PUSHBACK_PX,
                ctx.obsGrid,
                boss.arenaBounds,
              );
            }
          }
        }

        pushFx(
          outFx,
          ctx.damageCtx,
          FX_BLAST,
          BANSUNG_FX_BLAST_STEAM,
          Math.round(boss.x),
          Math.round(boss.y),
          COLOSSUS_TUNING.STEAM_VENT_RADIUS,
          boss.id,
        );
        emitSfx(outSfx, ctx, boss, 'boss_overheat_hiss');
        events.push({ type: 'overheat_end', x: boss.x, y: boss.y });
        boss.state = COLOSSUS_STATE.MARCH;
        boss.stateTick = 0;
      }
      break;
    }

    case COLOSSUS_STATE.DEAD:
    default: {
      finalizeDeath(boss, ctx, outFx, outSfx, events);
      break;
    }
  }

  syncBossDefenseStats(boss);

  return {
    state: boss.state,
    stateTick: boss.stateTick,
    heat: boss.heat,
    activeDrones: boss.drones.length,
    projectiles: outProj,
    sfx: outSfx,
    fx: outFx,
    events,
    telegraphs: boss.telegraphs,
  };
}

// ============================================================================
// 5. Snapshot Serialization Helpers (d38 / d02)
// ============================================================================

/** Serializes Dread Colossus into the detailed `d38` `BansungBossView` payload. */
export function toColossusBossView(boss: DreadColossusState): BansungBossView {
  let shieldHp = 0;
  for (let i = 0; i < boss.drones.length; i++) {
    const d = boss.drones[i];
    if (d.alive && d.hp > 0) {
      shieldHp += Math.round(d.hp);
    }
  }
  return {
    id: boss.id,
    kind: boss.kind,
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    vx: Math.round(boss.vx),
    vy: Math.round(boss.vy),
    facingLeft: boss.facingLeft,
    hp: Math.max(0, Math.round(boss.hp)),
    maxHp: Math.round(boss.maxHp),
    shieldHp,
    heat: Math.max(0, Math.min(100, Math.round(boss.heat))),
    state: boss.state,
    stateTick: boss.stateTick,
    aimDeg: boss.aimDeg,
  };
}

/** Maps `ColossusState` to coarse `BansungUnitState` (`0..6`) for `BansungBossFrame`. */
export function colossusStateToUnitState(boss: DreadColossusState): BansungUnitState {
  switch (boss.state) {
    case COLOSSUS_STATE.MARCH:
      return Math.hypot(boss.vx, boss.vy) > 1 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
    case COLOSSUS_STATE.DASH_WINDUP:
      return BANSUNG_STATE_ATK;
    case COLOSSUS_STATE.DASH_CHARGE:
      return BANSUNG_STATE_DASH;
    case COLOSSUS_STATE.DASH_RECOVER:
      return BANSUNG_STATE_IDLE;
    case COLOSSUS_STATE.OVERHEAT_STUN:
      return BANSUNG_STATE_STUN;
    case COLOSSUS_STATE.DEAD:
      return BANSUNG_STATE_DEAD;
    default:
      return BANSUNG_STATE_ATK;
  }
}

/** Serializes Dread Colossus into the compact `BansungFrame.bs` header (`BansungBossFrame`). */
export function toColossusBossFrame(boss: DreadColossusState): BansungBossFrame {
  return {
    id: boss.id,
    kind: boss.kind,
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.max(0, Math.round(boss.hp)),
    maxHp: Math.round(boss.maxHp),
    phase: boss.phase,
    state: colossusStateToUnitState(boss),
    aimQ: quantizeAim(boss.aimRad),
    telegraph:
      boss.telegraphs.length > 0
        ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100))
        : undefined,
    stagger: Math.max(0, Math.min(100, Math.round(boss.heat))),
    maxStagger: 100,
  };
}

// Keep unused-import-free reference for BANSUNG_MAP_W / BANSUNG_MAP_H when needed
export const COLOSSUS_DEFAULT_ARENA_SIZE = {
  w: BANSUNG_MAP_W,
  h: BANSUNG_MAP_H,
} as const;
