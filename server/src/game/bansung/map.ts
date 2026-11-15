/**
 * Authoritative server runtime arena state, destructible props, chain-explosive
 * barrel queue with spatial-grid AoE blast + LOS occlusion, wave-checkpoint
 * prop respawn, obstacle query helpers, and line-of-sight wrappers for `bansung`
 * (specs d05, d06, d32, d33).
 */
import {
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_PROP_INDEX,
  BANSUNG_STATUS_CRATE,
  FX_BLAST,
  FX_STATUS,
  generateArenaLayout,
  packStaticObstacles,
  type ArenaBlock,
  type ArenaEnemyGate,
  type ArenaMapDef,
  type ArenaObstacle,
  type ArenaPedestalSpawn,
  type ArenaPropSpawn,
  type BansungArmorType,
  type BansungBiome,
  type BansungPropKind,
  type PropKind,
} from '../../../../shared/src';
import {
  applyBansungDamage,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageResult,
} from './damage';
import {
  ActorGrid,
  GRID_CELL,
  LAYER_ENEMY,
  LAYER_PET,
  LAYER_PLAYER,
  ObstacleGrid,
  distCircleToAabbSq,
  hasLineOfSight,
  moveCircleWithSlide,
  queryAoeObstacles,
  queryAoeTargets,
  raycastObstacles,
  resolveObstacles,
  type AoeLosMode,
  type AoeObstacleTarget,
  type AoeTarget,
  type CircleBody,
  type RayMode,
  type RayObstacleHit,
  type SpatialActor,
} from './spatial';

// ============================================================================
// 1. Constants & Runtime Schemas (d06)
// ============================================================================

/** Chain-reaction barrel stagger delay in 30Hz ticks (~133ms, d06). */
export const BARREL_CHAIN_DELAY_TICKS = 4;
/** Maximum chain-reaction depth to prevent runaway cascades (d06). */
export const BARREL_MAX_CHAIN_DEPTH = 8;
/** Shield-only chip damage dealt to players by barrel blasts (0: zero environmental player damage). */
export const BARREL_PLAYER_SHIELD_CHIP = 0;
/** Knockback impulse (px/s) applied to mobs by barrel blasts. */
export const BARREL_KNOCKBACK_MOB = 260;
/** Knockback impulse (px/s) applied to players by barrel blasts (0: zero environmental player knockback). */
export const BARREL_KNOCKBACK_PLAYER = 0;
/** Knockback impulse (px/s) on spiny cactus thorn contact (0: zero environmental player knockback). */
export const CACTUS_THORN_KNOCKBACK = 0;
/** Surface contact tolerance (px) outside solid cactus AABB. */
export const CACTUS_CONTACT_PAD_PX = 2.5;
/** Hit-flash duration (ms) for damaged destructible props (d06). */
export const PROP_HIT_FLASH_MS = 80;
/** Standard checkpoint waves that respawn destroyed barrels & 50% of crates (d06). */
export const WAVE_CHECKPOINT_RESPAWN_WAVES: readonly number[] = [4, 7, 10];
/** Minimum extra clearance (px) beyond `propHalf + entityR` for safe respawn (d06). */
export const PROP_RESPAWN_CLEAR_PAD_PX = 8;

/** `FX_BLAST` `blastKind` codes for barrel detonations. */
export const BARREL_BLAST_KIND_EXPLOSIVE = BANSUNG_FX_BLAST_HE;
export const BARREL_BLAST_KIND_EMP = BANSUNG_FX_BLAST_STUN;

export type BarrelPropKind = 'barrel_explosive' | 'barrel_emp';
export type PropLootTable = 'pot' | 'common' | 'rare' | 'none';

/** Mutable server-side prop state synchronized with `ObstacleGrid`. */
export interface PropState {
  idx: number;
  /** Wire/snapshot identifier (matches `obstacleId` for solid props). */
  id: number;
  /** Corresponding `ArenaObstacle.id` in `ObstacleGrid`, or `-1` for decor. */
  obstacleId: number;
  kind: PropKind;
  propKind: BansungPropKind;
  propKindIdx: number;
  /** Center X in world pixels. */
  x: number;
  /** Center Y in world pixels. */
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  solid: boolean;
  destructible: boolean;
  alive: boolean;
  spriteId: string;
  armorType: BansungArmorType;
  hitFlashMs: number;
  detonated: boolean;
  thornDmg: number;
  blastDmg: number;
  blastRadius: number;
  stunMs: number;
}

/** Pending barrel blast scheduled on `arena.pendingBarrels`. */
export interface PendingBarrelDetonation {
  propIdx: number;
  propId: number;
  obstacleId: number;
  kind: BarrelPropKind;
  x: number;
  y: number;
  blastDmg: number;
  blastRadius: number;
  stunMs: number;
  chainDepth: number;
  triggerTick: number;
  ownerIdx: number;
  attackerId?: string;
}

/** Authoritative server arena state initialized once per match via `buildServerArena`. */
export interface ServerArena {
  biome: BansungBiome;
  seed: number;
  w: number;
  h: number;
  tileSize: number;
  playable: { x0: number; y0: number; x1: number; y1: number };
  map: ArenaMapDef;
  blocks: ArenaBlock[];
  obstacles: ArenaObstacle[];
  obsGrid: ObstacleGrid;
  props: PropState[];
  destructibles: PropState[];
  barrels: PropState[];
  cacti: PropState[];
  crates: PropState[];
  pedestals: ArenaPedestalSpawn[];
  playerSpawns: [number, number][];
  enemyGates: ArenaEnemyGate[];
  bossPad: [number, number];
  pendingBarrels: PendingBarrelDetonation[];
  propByIdx: Map<number, PropState>;
  propById: Map<number, PropState>;
  propByObstacleId: Map<number, PropState>;
  propsDirty: boolean;
  tickNo: number;
}

/** Optional actor combat shape accepted by barrel blasts (compatible with `damage.ts`). */
export interface BarrelCombatActor extends BansungCombatTarget {
  layer?: number;
  team?: number;
  vx?: number;
  vy?: number;
  knockbackMult?: number;
}

/** Event emitted when any destructible prop breaks (hooks `pickups.ts` / `world.ts`). */
export interface PropBreakEvent {
  prop: PropState;
  chainDepth: number;
  shouldDropLoot: boolean;
  lootTable: PropLootTable;
  ownerIdx: number;
  attackerId?: string;
}

/** Per-actor outcome recorded during a barrel blast. */
export interface BarrelActorBlastHit {
  actor: SpatialActor;
  target?: BarrelCombatActor;
  isPlayer: boolean;
  edgeDist: number;
  falloff: number;
  rawDamage: number;
  shieldDmg: number;
  hpDmg: number;
  stunAppliedMs: number;
  killed: boolean;
  knockbackX: number;
  knockbackY: number;
  damageResult?: BansungDamageResult;
}

/** Aggregate result emitted when a barrel detonates. */
export interface BarrelDetonationEvent {
  detonation: PendingBarrelDetonation;
  actorHits: BarrelActorBlastHit[];
  propBreaks: PropBreakEvent[];
  chainedBarrels: number;
}

/** Context supplied when damaging a prop directly or via bullet/AoE obstacle hit. */
export interface PropDamageContext {
  nowTick?: number;
  ownerIdx?: number;
  attackerId?: string;
  fx?: number[];
  onPropBreak?: (event: PropBreakEvent) => void;
  /** If true, `chainDepth === 0` barrels detonate immediately instead of waiting for `stepBarrelDetonations`. */
  autoDetonate?: boolean;
  blastCtx?: BarrelBlastContext;
}

/** Return value from `damageProp` and `damagePropByObstacleId`. */
export interface PropDamageResult {
  hit: boolean;
  broken: boolean;
  dmgApplied: number;
  remainingHp: number;
  prop?: PropState;
  queuedBarrel: boolean;
  detonation?: BarrelDetonationEvent;
}

/** Context passed to `detonateBarrel` / `stepBarrelDetonations`. */
export interface BarrelBlastContext {
  nowTick?: number;
  actorGrid?: ActorGrid;
  losMode?: AoeLosMode;
  layerMask?: number;
  resolveActor?: (actor: SpatialActor) => BarrelCombatActor | undefined;
  damageCtx?: BansungDamageContext;
  fx?: number[];
  onKnockback?: (
    actor: SpatialActor,
    kx: number,
    ky: number,
    target?: BarrelCombatActor,
  ) => void;
  onActorHit?: (hit: BarrelActorBlastHit) => void;
  onPropBreak?: (event: PropBreakEvent) => void;
  onBarrelDetonate?: (event: BarrelDetonationEvent) => void;
}

/** Minimal entity circle descriptor for safe prop respawn clearance checks. */
export interface RespawnCheckEntity {
  x: number;
  y: number;
  radius: number;
  alive?: boolean;
}

/** Options controlling checkpoint/wave prop respawn. */
export interface WaveRespawnContext {
  entities?: readonly RespawnCheckEntity[];
  actorGrid?: ActorGrid;
  clearPadPx?: number;
  crateRatio?: number;
  includeBarrels?: boolean;
  includeCrates?: boolean;
  includeCacti?: boolean;
  force?: boolean;
  rng?: () => number;
}

/** Summary returned by `respawnWaveProps`. */
export interface WaveRespawnResult {
  triggered: boolean;
  barrelsRestored: number;
  cratesRestored: number;
  cactiRestored: number;
  restoredProps: PropState[];
}

/** Cactus thorn contact output from `checkCactusThornContact`. */
export interface CactusContactHit {
  prop: PropState;
  thornDmg: number;
  nx: number;
  ny: number;
  knockbackX: number;
  knockbackY: number;
}

// ============================================================================
// 2. Internal Helpers & Scratch Buffers
// ============================================================================

const tmpObsAabb: ArenaObstacle[] = [];
const tmpObsCircle: ArenaObstacle[] = [];
const tmpClearActors: SpatialActor[] = [];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function isBarrelKind(kind: PropKind): kind is BarrelPropKind {
  return kind === 'barrel_explosive' || kind === 'barrel_emp';
}

function resolveLootTable(prop: PropState): PropLootTable {
  if (prop.kind === 'urn') return 'pot';
  if (prop.kind === 'crate') return prop.maxHp >= 75 ? 'rare' : 'common';
  return 'none';
}

function isCombatTargetDuck(actor: SpatialActor): actor is SpatialActor & BarrelCombatActor {
  const candidate = actor as unknown as Partial<BarrelCombatActor>;
  return (
    typeof candidate.hp === 'number' &&
    typeof candidate.shield === 'number' &&
    typeof candidate.tier === 'string' &&
    typeof candidate.armorType === 'string'
  );
}

function resolvePropObstacleId(
  spawn: ArenaPropSpawn,
  obstacles: readonly ArenaObstacle[],
  startScanIdx: number,
): { obstacleId: number; nextScanIdx: number } {
  if (!spawn.solid || spawn.hp <= 0) {
    return { obstacleId: -1, nextScanIdx: startScanIdx };
  }

  const targetX = spawn.x - spawn.w * 0.5;
  const targetY = spawn.y - spawn.h * 0.5;

  for (let i = startScanIdx; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (
      o.destructible &&
      Math.abs(o.x - targetX) < 1e-3 &&
      Math.abs(o.y - targetY) < 1e-3 &&
      Math.abs(o.w - spawn.w) < 1e-3 &&
      Math.abs(o.h - spawn.h) < 1e-3
    ) {
      return { obstacleId: o.id, nextScanIdx: i + 1 };
    }
  }

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (
      o.destructible &&
      Math.abs(o.x - targetX) < 1e-3 &&
      Math.abs(o.y - targetY) < 1e-3
    ) {
      return { obstacleId: o.id, nextScanIdx: startScanIdx };
    }
  }

  return { obstacleId: -1, nextScanIdx: startScanIdx };
}

function computeOutwardNormal(
  px: number,
  py: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
): [number, number] {
  const qx = clamp(px, ox, ox + ow);
  const qy = clamp(py, oy, oy + oh);
  const dx = px - qx;
  const dy = py - qy;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) {
    return [dx / len, dy / len];
  }
  const cx = ox + ow * 0.5;
  const cy = oy + oh * 0.5;
  const cdx = px - cx;
  const cdy = py - cy;
  const cLen = Math.hypot(cdx, cdy);
  if (cLen > 1e-6) {
    return [cdx / cLen, cdy / cLen];
  }
  return [1, 0];
}

function isWaveCheckpoint(wave: number): boolean {
  if (WAVE_CHECKPOINT_RESPAWN_WAVES.includes(wave)) return true;
  // In endless mode (wave 11+), checkpoint every 3 waves (13, 16, 19, ...).
  return wave > 10 && (wave - 10) % 3 === 0;
}

function shuffleWithRng<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ============================================================================
// 3. Server Arena Builder (`buildServerArena`)
// ============================================================================

/**
 * Builds an isolated authoritative `ServerArena` for `biome` and `seed`:
 * - Generates fresh static blocks, solid destructibles, decor, pedestals, and spawns
 * - Builds the 64px `ObstacleGrid` (with collinear wall merging)
 * - Initializes runtime `PropState[]` linked 1:1 to `ObstacleGrid` obstacle IDs
 */
export function buildServerArena(biome: BansungBiome, seed = 0): ServerArena {
  const map = generateArenaLayout(biome, seed);
  const obsGrid = new ObstacleGrid(map.obstacles, map.w, map.h, GRID_CELL, true);

  const props: PropState[] = [];
  const destructibles: PropState[] = [];
  const barrels: PropState[] = [];
  const cacti: PropState[] = [];
  const crates: PropState[] = [];
  const propByIdx = new Map<number, PropState>();
  const propById = new Map<number, PropState>();
  const propByObstacleId = new Map<number, PropState>();

  let scanIdx = map.blocks.length;
  for (let i = 0; i < map.props.length; i++) {
    const sp = map.props[i];
    const resolved = resolvePropObstacleId(sp, map.obstacles, scanIdx);
    scanIdx = resolved.nextScanIdx;

    const destructible = sp.solid && sp.hp > 0 && resolved.obstacleId >= 0;
    const id = destructible ? resolved.obstacleId : 10000 + sp.idx;
    const state: PropState = {
      idx: sp.idx,
      id,
      obstacleId: resolved.obstacleId,
      kind: sp.kind,
      propKind: sp.propKind,
      propKindIdx: BANSUNG_PROP_INDEX[sp.propKind],
      x: sp.x,
      y: sp.y,
      w: sp.w,
      h: sp.h,
      hp: sp.hp,
      maxHp: sp.hp,
      solid: sp.solid,
      destructible,
      alive: destructible,
      spriteId: sp.spriteId,
      armorType: 'light',
      hitFlashMs: 0,
      detonated: false,
      thornDmg: sp.thornDmg ?? 0,
      blastDmg: sp.blastDmg ?? (sp.kind === 'barrel_emp' ? 120 : sp.kind === 'barrel_explosive' ? 140 : 0),
      blastRadius: sp.blastRadius ?? (sp.kind === 'barrel_emp' ? 170 : sp.kind === 'barrel_explosive' ? 160 : 0),
      stunMs: sp.stunMs ?? (sp.kind === 'barrel_emp' ? 1200 : 0),
    };

    props.push(state);
    propByIdx.set(state.idx, state);
    propById.set(state.id, state);

    if (destructible) {
      destructibles.push(state);
      propByObstacleId.set(state.obstacleId, state);
      if (isBarrelKind(state.kind)) {
        barrels.push(state);
      } else if (state.kind === 'cactus') {
        cacti.push(state);
      } else if (state.kind === 'crate' || state.kind === 'urn') {
        crates.push(state);
      }
    }
  }

  return {
    biome: map.biome,
    seed: map.seed,
    w: map.w,
    h: map.h,
    tileSize: map.tileSize,
    playable: { ...map.playable },
    map,
    blocks: map.blocks,
    obstacles: map.obstacles,
    obsGrid,
    props,
    destructibles,
    barrels,
    cacti,
    crates,
    pedestals: map.pedestals,
    playerSpawns: map.playerSpawns,
    enemyGates: map.enemyGates,
    bossPad: map.bossPad,
    pendingBarrels: [],
    propByIdx,
    propById,
    propByObstacleId,
    propsDirty: destructibles.length > 0,
    tickNo: 0,
  };
}

// ============================================================================
// 4. Destructibles, Chain-Explosive Barrels & Wave Prop Respawn
// ============================================================================

/** Looks up a runtime `PropState` by its `props[]` index (`prop.idx`). */
export function getPropByIdx(arena: ServerArena, propIdx: number): PropState | undefined {
  return arena.propByIdx.get(propIdx);
}

/** Looks up a runtime `PropState` by its `ObstacleGrid` `ArenaObstacle.id`. */
export function getPropByObstacleId(arena: ServerArena, obstacleId: number): PropState | undefined {
  return arena.propByObstacleId.get(obstacleId);
}

/**
 * Applies `dmg` to destructible prop `propIdx`, updating `ObstacleGrid` in-place
 * on break, emitting `FX_STATUS` (`BANSUNG_STATUS_CRATE`), firing `onPropBreak`
 * for crate/urn loot drops, and queuing explosive/EMP barrel detonations with
 * 4-tick (~133ms) stagger up to `chainDepth <= 8` (`d06`).
 */
export function damageProp(
  arena: ServerArena,
  propIdx: number,
  dmg: number,
  chainDepth = 0,
  ctx?: PropDamageContext,
): PropDamageResult {
  const prop = arena.propByIdx.get(propIdx);
  if (!prop || !prop.alive || !prop.destructible || prop.hp <= 0) {
    return {
      hit: false,
      broken: false,
      dmgApplied: 0,
      remainingHp: prop ? prop.hp : 0,
      prop,
      queuedBarrel: false,
    };
  }

  if (!Number.isFinite(dmg) || dmg <= 0) {
    return {
      hit: false,
      broken: false,
      dmgApplied: 0,
      remainingHp: prop.hp,
      prop,
      queuedBarrel: false,
    };
  }

  const prevHp = prop.hp;
  const nextHp = Math.max(0, prop.hp - dmg);
  const dmgApplied = prevHp - nextHp;
  prop.hp = nextHp;
  arena.propsDirty = true;

  const obs = prop.obstacleId >= 0 ? arena.obsGrid.getById(prop.obstacleId) : undefined;
  if (obs) {
    obs.hp = nextHp;
  }

  if (nextHp > 0) {
    prop.hitFlashMs = PROP_HIT_FLASH_MS;
    return {
      hit: true,
      broken: false,
      dmgApplied,
      remainingHp: nextHp,
      prop,
      queuedBarrel: false,
    };
  }

  // Prop destroyed
  prop.alive = false;
  prop.hitFlashMs = 0;
  if (prop.obstacleId >= 0) {
    arena.obsGrid.setAlive(prop.obstacleId, false);
  }

  const ownerIdx = ctx?.ownerIdx ?? -1;
  ctx?.fx?.push(
    FX_STATUS,
    prop.propKindIdx,
    BANSUNG_STATUS_CRATE,
    prop.id,
    Math.round(prop.x),
    Math.round(prop.y),
  );

  const lootTable = resolveLootTable(prop);
  const breakEvent: PropBreakEvent = {
    prop,
    chainDepth,
    shouldDropLoot: lootTable !== 'none',
    lootTable,
    ownerIdx,
    attackerId: ctx?.attackerId,
  };
  ctx?.onPropBreak?.(breakEvent);

  let queuedBarrel = false;
  let detonationEvent: BarrelDetonationEvent | undefined;
  if (isBarrelKind(prop.kind) && !prop.detonated && chainDepth <= BARREL_MAX_CHAIN_DEPTH) {
    prop.detonated = true;
    const nowTick = ctx?.nowTick ?? arena.tickNo;
    const triggerTick = nowTick + (chainDepth > 0 ? BARREL_CHAIN_DELAY_TICKS : 0);
    const pending: PendingBarrelDetonation = {
      propIdx: prop.idx,
      propId: prop.id,
      obstacleId: prop.obstacleId,
      kind: prop.kind,
      x: prop.x,
      y: prop.y,
      blastDmg: prop.blastDmg,
      blastRadius: prop.blastRadius,
      stunMs: prop.stunMs,
      chainDepth,
      triggerTick,
      ownerIdx,
      attackerId: ctx?.attackerId,
    };

    if (ctx?.autoDetonate && chainDepth === 0) {
      detonationEvent = detonateBarrel(arena, pending, {
        ...ctx.blastCtx,
        nowTick,
        fx: ctx.blastCtx?.fx ?? ctx.fx,
        onPropBreak: ctx.blastCtx?.onPropBreak ?? ctx.onPropBreak,
      });
    } else {
      arena.pendingBarrels.push(pending);
      queuedBarrel = true;
    }
  }

  return {
    hit: true,
    broken: true,
    dmgApplied,
    remainingHp: 0,
    prop,
    queuedBarrel,
    detonation: detonationEvent,
  };
}

/**
 * Looks up a destructible prop by its `ObstacleGrid` `ArenaObstacle.id` and applies `damageProp`.
 */
export function damagePropByObstacleId(
  arena: ServerArena,
  obstacleId: number,
  dmg: number,
  chainDepth = 0,
  ctx?: PropDamageContext,
): PropDamageResult {
  const prop = arena.propByObstacleId.get(obstacleId);
  if (!prop) {
    return {
      hit: false,
      broken: false,
      dmgApplied: 0,
      remainingHp: 0,
      queuedBarrel: false,
    };
  }
  return damageProp(arena, prop.idx, dmg, chainDepth, ctx);
}

/**
 * Executes a single queued barrel explosion:
 * - Queries living enemy actors in `blastRadius` via `ActorGrid` + LOS occlusion (`queryAoeTargets`)
 * - Applies `140` explosive (`120` + `1200ms` stun for EMP) + knockback to enemies via `damage.ts`
 * - Deals 0 damage and 0 knockback to players (environmental explosions blast monsters & props only)
 * - Queries destructible obstacles via `ObstacleGrid` (`queryAoeObstacles`) and chains at `chainDepth + 1`
 * - Emits `FX_BLAST` wire event
 */
export function detonateBarrel(
  arena: ServerArena,
  detonation: PendingBarrelDetonation,
  ctx?: BarrelBlastContext,
): BarrelDetonationEvent {
  const nowTick = ctx?.nowTick ?? arena.tickNo;
  const losMode: AoeLosMode = ctx?.losMode ?? 'los';
  const layerMask = ctx?.layerMask ?? LAYER_ENEMY;
  const isEmp = detonation.kind === 'barrel_emp';
  const fxStream = ctx?.fx ?? ctx?.damageCtx?.fx;
  const dmgCtx: BansungDamageContext | undefined =
    ctx?.damageCtx ?? (fxStream ? { fx: fxStream } : undefined);

  const actorHits: BarrelActorBlastHit[] = [];
  if (ctx?.actorGrid) {
    const aoeTargets: AoeTarget[] = [];
    queryAoeTargets(
      ctx.actorGrid,
      arena.obsGrid,
      detonation.x,
      detonation.y,
      detonation.blastRadius,
      losMode,
      layerMask,
      aoeTargets,
    );

    for (let i = 0; i < aoeTargets.length; i++) {
      const entry = aoeTargets[i];
      const actor = entry.actor;
      const target =
        ctx.resolveActor?.(actor) ?? (isCombatTargetDuck(actor) ? actor : undefined);

      const dx = actor.x - detonation.x;
      const dy = actor.y - detonation.y;
      const dist = Math.hypot(dx, dy);
      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;

      const isPlayer =
        (actor.layer & LAYER_PLAYER) !== 0 || target?.tier === 'hero';

      if (isPlayer) {
        continue;
      }

      const rawDamage = Math.max(1, Math.round(detonation.blastDmg * entry.falloff));
      let damageResult: BansungDamageResult | undefined;
      if (target) {
        damageResult = applyBansungDamage(
          target,
          {
            baseDmg: rawDamage,
            dmgKind: isEmp ? 'energy' : 'explosive',
            stunMs: isEmp ? detonation.stunMs : 0,
            attackerId: detonation.attackerId,
          },
          dmgCtx,
        );
      }

      const blocked = damageResult?.blocked ?? false;
      const kbScale = blocked ? 0 : BARREL_KNOCKBACK_MOB * entry.falloff * (target?.knockbackMult ?? 1);
      const kx = nx * kbScale;
      const ky = ny * kbScale;
      if (!blocked) {
        if (ctx.onKnockback) {
          ctx.onKnockback(actor, kx, ky, target);
        } else if (target && typeof target.vx === 'number' && typeof target.vy === 'number') {
          target.vx += kx;
          target.vy += ky;
        }
      }

      const hit: BarrelActorBlastHit = {
        actor,
        target,
        isPlayer: false,
        edgeDist: entry.edgeDist,
        falloff: entry.falloff,
        rawDamage,
        shieldDmg: damageResult?.shieldDmg ?? 0,
        hpDmg: damageResult?.hpDmg ?? 0,
        stunAppliedMs: damageResult?.stunAppliedMs ?? 0,
        killed: damageResult?.killed ?? false,
        knockbackX: kx,
        knockbackY: ky,
        damageResult,
      };
      actorHits.push(hit);
      ctx.onActorHit?.(hit);
    }
  }

  const aoeObstacles: AoeObstacleTarget[] = [];
  queryAoeObstacles(
    arena.obsGrid,
    detonation.x,
    detonation.y,
    detonation.blastRadius,
    losMode,
    aoeObstacles,
  );

  const propBreaks: PropBreakEvent[] = [];
  let chainedBarrels = 0;

  for (let i = 0; i < aoeObstacles.length; i++) {
    const obHit = aoeObstacles[i];
    if (obHit.obstacle.id === detonation.obstacleId) continue;

    const hitProp = arena.propByObstacleId.get(obHit.obstacle.id);
    if (!hitProp || !hitProp.alive) continue;

    const propDmg = Math.max(1, Math.round(detonation.blastDmg * obHit.falloff));
    const dmgRes = damageProp(arena, hitProp.idx, propDmg, detonation.chainDepth + 1, {
      nowTick,
      ownerIdx: detonation.ownerIdx,
      attackerId: detonation.attackerId,
      fx: fxStream,
      onPropBreak: (evt) => {
        propBreaks.push(evt);
        ctx?.onPropBreak?.(evt);
      },
    });
    if (dmgRes.queuedBarrel) {
      chainedBarrels++;
    }
  }

  fxStream?.push(
    FX_BLAST,
    isEmp ? BARREL_BLAST_KIND_EMP : BARREL_BLAST_KIND_EXPLOSIVE,
    Math.round(detonation.x),
    Math.round(detonation.y),
    Math.round(detonation.blastRadius),
    detonation.ownerIdx,
  );

  const event: BarrelDetonationEvent = {
    detonation,
    actorHits,
    propBreaks,
    chainedBarrels,
  };
  ctx?.onBarrelDetonate?.(event);
  return event;
}

/**
 * Processes all queued barrels whose `triggerTick <= nowTick`, returning the
 * detonation events produced during this tick. Newly chained barrels are
 * scheduled at `nowTick + BARREL_CHAIN_DELAY_TICKS` for future ticks.
 */
export function stepBarrelDetonations(
  arena: ServerArena,
  nowTick: number,
  ctx?: BarrelBlastContext,
): BarrelDetonationEvent[] {
  arena.tickNo = nowTick;
  if (arena.pendingBarrels.length === 0) return [];

  const due: PendingBarrelDetonation[] = [];
  let writeIdx = 0;
  for (let i = 0; i < arena.pendingBarrels.length; i++) {
    const item = arena.pendingBarrels[i];
    if (item.triggerTick <= nowTick) {
      due.push(item);
    } else {
      arena.pendingBarrels[writeIdx++] = item;
    }
  }
  arena.pendingBarrels.length = writeIdx;

  if (due.length === 0) return [];

  const events: BarrelDetonationEvent[] = [];
  const nextCtx: BarrelBlastContext = ctx ? { ...ctx, nowTick } : { nowTick };
  for (let i = 0; i < due.length; i++) {
    events.push(detonateBarrel(arena, due[i], nextCtx));
  }
  return events;
}

/**
 * Advances hit-flash timers on destructible props by `dtMs`.
 */
export function tickArenaProps(arena: ServerArena, dtMs: number): void {
  if (dtMs <= 0) return;
  for (let i = 0; i < arena.destructibles.length; i++) {
    const p = arena.destructibles[i];
    if (p.hitFlashMs > 0) {
      p.hitFlashMs = Math.max(0, p.hitFlashMs - dtMs);
    }
  }
}

/**
 * Drains all remaining queued chain-barrel detonations (advancing `nowTick`
 * across stagger steps), useful for wave cleanup or deterministic unit tests.
 */
export function flushBarrelDetonations(
  arena: ServerArena,
  ctx?: BarrelBlastContext,
  maxSteps = 32,
): BarrelDetonationEvent[] {
  const all: BarrelDetonationEvent[] = [];
  for (let step = 0; step < maxSteps && arena.pendingBarrels.length > 0; step++) {
    let minTick = arena.pendingBarrels[0].triggerTick;
    for (let i = 1; i < arena.pendingBarrels.length; i++) {
      if (arena.pendingBarrels[i].triggerTick < minTick) {
        minTick = arena.pendingBarrels[i].triggerTick;
      }
    }
    const tick = Math.max(arena.tickNo, minTick);
    const batch = stepBarrelDetonations(arena, tick, ctx);
    for (let i = 0; i < batch.length; i++) {
      all.push(batch[i]);
    }
  }
  return all;
}

/**
 * Returns `true` iff `prop`'s AABB has at least `clearPadPx` + `entity.radius`
 * clearance from all living entities (`minDist > propHalf + entityR + 8`, d06).
 */
export function isPropAreaClear(
  arena: ServerArena,
  prop: PropState,
  entities?: readonly RespawnCheckEntity[],
  actorGrid?: ActorGrid,
  clearPadPx = PROP_RESPAWN_CLEAR_PAD_PX,
): boolean {
  const box = {
    x: prop.x - prop.w * 0.5,
    y: prop.y - prop.h * 0.5,
    w: prop.w,
    h: prop.h,
  };

  if (entities) {
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.alive === false) continue;
      const minClear = e.radius + clearPadPx;
      if (distCircleToAabbSq(e.x, e.y, box) <= minClear * minClear) {
        return false;
      }
    }
  }

  if (actorGrid) {
    const queryR = Math.hypot(prop.w * 0.5, prop.h * 0.5) + clearPadPx;
    actorGrid.queryCircle(
      prop.x,
      prop.y,
      queryR,
      LAYER_PLAYER | LAYER_ENEMY | LAYER_PET,
      tmpClearActors,
    );
    for (let i = 0; i < tmpClearActors.length; i++) {
      const a = tmpClearActors[i];
      if (!a.alive) continue;
      const minClear = a.radius + clearPadPx;
      if (distCircleToAabbSq(a.x, a.y, box) <= minClear * minClear) {
        return false;
      }
    }
  }

  // Also ensure no other alive destructible obstacle occupies the exact footprint
  if (prop.obstacleId >= 0) {
    arena.obsGrid.queryAabb(box.x + 1, box.y + 1, box.x + box.w - 1, box.y + box.h - 1, tmpObsAabb);
    for (let i = 0; i < tmpObsAabb.length; i++) {
      if (tmpObsAabb[i].id !== prop.obstacleId) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Restores a single destroyed prop back to full HP and re-enables it in `ObstacleGrid`.
 */
export function restoreProp(arena: ServerArena, propIdx: number): PropState | undefined {
  const prop = arena.propByIdx.get(propIdx);
  if (!prop || !prop.destructible) return undefined;

  prop.hp = prop.maxHp;
  prop.alive = true;
  prop.detonated = false;
  prop.hitFlashMs = 0;

  if (prop.obstacleId >= 0) {
    const obs = arena.obsGrid.getById(prop.obstacleId);
    if (obs) {
      obs.hp = prop.maxHp;
    }
    arena.obsGrid.setAlive(prop.obstacleId, true);
  }

  if (arena.pendingBarrels.length > 0) {
    arena.pendingBarrels = arena.pendingBarrels.filter((b) => b.propIdx !== prop.idx);
  }

  arena.propsDirty = true;
  return prop;
}

/**
 * At checkpoint Waves `4, 7, 10` (and every 3 waves in endless), restores
 * destroyed barrels and `50%` of broken crates/urns whose AABB is clear of
 * living heroes/mobs (`minDist > propHalf + entityR + 8`, d06).
 */
export function respawnWaveProps(
  arena: ServerArena,
  wave: number,
  ctx?: WaveRespawnContext,
): WaveRespawnResult {
  const triggered = Boolean(ctx?.force) || isWaveCheckpoint(wave);
  if (!triggered) {
    return {
      triggered: false,
      barrelsRestored: 0,
      cratesRestored: 0,
      cactiRestored: 0,
      restoredProps: [],
    };
  }

  const clearPadPx = ctx?.clearPadPx ?? PROP_RESPAWN_CLEAR_PAD_PX;
  const crateRatio = clamp(ctx?.crateRatio ?? 0.5, 0, 1);
  const includeBarrels = ctx?.includeBarrels ?? true;
  const includeCrates = ctx?.includeCrates ?? true;
  const includeCacti = ctx?.includeCacti ?? false;
  const rng = ctx?.rng ?? Math.random;

  const restoredProps: PropState[] = [];
  let barrelsRestored = 0;
  let cratesRestored = 0;
  let cactiRestored = 0;

  if (includeBarrels) {
    for (let i = 0; i < arena.barrels.length; i++) {
      const b = arena.barrels[i];
      if (b.alive) continue;
      if (!isPropAreaClear(arena, b, ctx?.entities, ctx?.actorGrid, clearPadPx)) continue;
      if (restoreProp(arena, b.idx)) {
        restoredProps.push(b);
        barrelsRestored++;
      }
    }
  }

  if (includeCrates && crateRatio > 0) {
    const brokenCrates: PropState[] = [];
    for (let i = 0; i < arena.crates.length; i++) {
      const c = arena.crates[i];
      if (c.alive) continue;
      if (isPropAreaClear(arena, c, ctx?.entities, ctx?.actorGrid, clearPadPx)) {
        brokenCrates.push(c);
      }
    }
    if (brokenCrates.length > 0) {
      shuffleWithRng(brokenCrates, rng);
      const targetCount = Math.min(
        brokenCrates.length,
        Math.round(brokenCrates.length * crateRatio),
      );
      for (let i = 0; i < targetCount; i++) {
        const c = brokenCrates[i];
        if (restoreProp(arena, c.idx)) {
          restoredProps.push(c);
          cratesRestored++;
        }
      }
    }
  }

  if (includeCacti) {
    for (let i = 0; i < arena.cacti.length; i++) {
      const k = arena.cacti[i];
      if (k.alive) continue;
      if (!isPropAreaClear(arena, k, ctx?.entities, ctx?.actorGrid, clearPadPx)) continue;
      if (restoreProp(arena, k.idx)) {
        restoredProps.push(k);
        cactiRestored++;
      }
    }
  }

  return {
    triggered: true,
    barrelsRestored,
    cratesRestored,
    cactiRestored,
    restoredProps,
  };
}

/**
 * Checks whether circular actor `(x, y, radius)` touches any alive spiny cactus
 * (`thornDmg: 5` + outward knockback vector, d06). Returns `null` if none touched.
 */
export function checkCactusThornContact(
  arena: ServerArena,
  x: number,
  y: number,
  radius: number,
  contactPadPx = CACTUS_CONTACT_PAD_PX,
): CactusContactHit | null {
  if (arena.cacti.length === 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const queryR = Math.max(0, radius) + Math.max(0, contactPadPx);
  arena.obsGrid.queryCircle(x, y, queryR, tmpObsCircle, 'move');

  for (let i = 0; i < tmpObsCircle.length; i++) {
    const o = tmpObsCircle[i];
    if (o.kind !== 'cactus' || !o.alive) continue;
    const prop = arena.propByObstacleId.get(o.id);
    if (!prop || !prop.alive || prop.thornDmg <= 0) continue;

    const [nx, ny] = computeOutwardNormal(x, y, o.x, o.y, o.w, o.h);
    return {
      prop,
      thornDmg: prop.thornDmg,
      nx,
      ny,
      knockbackX: nx * CACTUS_THORN_KNOCKBACK,
      knockbackY: ny * CACTUS_THORN_KNOCKBACK,
    };
  }

  return null;
}

// ============================================================================
// 5. Snapshot Packing Helpers (d02 / d06)
// ============================================================================

/**
 * Packs static cover blocks (`[x, y, w, h, propKindIdx]`) for `BansungRoomView.obstacles`.
 */
export function packStaticArenaObstacles(
  arena: ServerArena,
  includePerimeter = false,
): number[] {
  return packStaticObstacles(arena.map, includePerimeter);
}

/**
 * Packs alive destructible props as stride-5 `[id, propKindIdx, x, y, hpPct]`
 * for `BansungFrame.pr` (`BANSUNG_PROP_FIELDS = 5`).
 */
export function packBreakableProps(
  arena: ServerArena,
  out: number[] = [],
  clearDirty = false,
): number[] {
  out.length = 0;
  for (let i = 0; i < arena.destructibles.length; i++) {
    const p = arena.destructibles[i];
    if (!p.alive || p.hp <= 0) continue;
    const hpPct =
      p.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((p.hp / p.maxHp) * 100))) : 100;
    out.push(p.id, p.propKindIdx, Math.round(p.x), Math.round(p.y), hpPct);
  }
  if (clearDirty) {
    arena.propsDirty = false;
  }
  return out;
}

// ============================================================================
// 6. Obstacle Queries, Movement & Line-of-Sight Wrappers (d05, d06)
// ============================================================================

/** Queries alive obstacles overlapping AABB `[x0, x1] x [y0, y1]`. */
export function queryArenaObstaclesAabb(
  arena: ServerArena,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: ArenaObstacle[] = [],
): ArenaObstacle[] {
  return arena.obsGrid.queryAabb(x0, y0, x1, y1, out);
}

/** Queries alive obstacles overlapping circle `(x, y, radius)` filtered by `mode`. */
export function queryArenaObstaclesCircle(
  arena: ServerArena,
  x: number,
  y: number,
  radius: number,
  mode?: RayMode,
  out: ArenaObstacle[] = [],
): ArenaObstacle[] {
  return arena.obsGrid.queryCircle(x, y, radius, out, mode);
}

/** Queries alive solid props overlapping circle `(x, y, radius)`. */
export function queryArenaPropsCircle(
  arena: ServerArena,
  x: number,
  y: number,
  radius: number,
  out: PropState[] = [],
): PropState[] {
  out.length = 0;
  arena.obsGrid.queryCircle(x, y, radius, tmpObsCircle, 'move');
  for (let i = 0; i < tmpObsCircle.length; i++) {
    const prop = arena.propByObstacleId.get(tmpObsCircle[i].id);
    if (prop && prop.alive) {
      out.push(prop);
    }
  }
  return out;
}

/** Queries alive destructible props overlapping AABB `[x0, x1] x [y0, y1]`. */
export function queryArenaDestructiblesAabb(
  arena: ServerArena,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  out: PropState[] = [],
): PropState[] {
  out.length = 0;
  arena.obsGrid.queryAabb(x0, y0, x1, y1, tmpObsAabb);
  for (let i = 0; i < tmpObsAabb.length; i++) {
    const o = tmpObsAabb[i];
    if (!o.destructible || !o.alive) continue;
    const prop = arena.propByObstacleId.get(o.id);
    if (prop && prop.alive) {
      out.push(prop);
    }
  }
  return out;
}

/** Raycasts segment `(x0, y0) -> (x1, y1)` (expanded by `radius`) against `arena.obsGrid`. */
export function raycastArena(
  arena: ServerArena,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius = 0,
  mode: RayMode = 'bullet',
): RayObstacleHit | null {
  return raycastObstacles(arena.obsGrid, x0, y0, x1, y1, radius, mode);
}

/**
 * Returns `true` iff segment `(x0, y0) -> (x1, y1)` is unobstructed by
 * `arena.obsGrid` blockers matching `mode` (`'los'` by default).
 */
export function hasArenaLineOfSight(
  arena: ServerArena,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: RayMode = 'los',
): boolean {
  return hasLineOfSight(arena.obsGrid, x0, y0, x1, y1, mode);
}

/** Alias for `hasArenaLineOfSight`. */
export const checkLineOfSight = hasArenaLineOfSight;

/** Queries actors inside AoE `(cx, cy, radius)` passing LOS cover occlusion (`d05`). */
export function queryArenaAoeTargets(
  arena: ServerArena,
  actorGrid: ActorGrid,
  cx: number,
  cy: number,
  radius: number,
  losMode: AoeLosMode = 'los',
  layerMask = LAYER_PLAYER | LAYER_ENEMY,
  out: AoeTarget[] = [],
): AoeTarget[] {
  return queryAoeTargets(actorGrid, arena.obsGrid, cx, cy, radius, losMode, layerMask, out);
}

/** Queries destructible obstacles inside AoE `(cx, cy, radius)` passing LOS occlusion (`d05`). */
export function queryArenaAoeObstacles(
  arena: ServerArena,
  cx: number,
  cy: number,
  radius: number,
  losMode: AoeLosMode = 'los',
  out: AoeObstacleTarget[] = [],
): AoeObstacleTarget[] {
  return queryAoeObstacles(arena.obsGrid, cx, cy, radius, losMode, out);
}

/** Returns `true` if `(x, y)` lies inside the walkable interior bounds (`arena.playable`). */
export function isPointInPlayableBounds(
  arena: ServerArena,
  x: number,
  y: number,
  pad = 0,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (
    x >= arena.playable.x0 + pad &&
    x <= arena.playable.x1 - pad &&
    y >= arena.playable.y0 + pad &&
    y <= arena.playable.y1 - pad
  );
}

/** Clamps `(x, y)` inside `arena.playable` inset by `pad`. */
export function clampPointToPlayable(
  arena: ServerArena,
  x: number,
  y: number,
  pad = 0,
): [number, number] {
  const minX = arena.playable.x0 + pad;
  const maxX = arena.playable.x1 - pad;
  const minY = arena.playable.y0 + pad;
  const maxY = arena.playable.y1 - pad;
  return [
    minX <= maxX ? clamp(x, minX, maxX) : (minX + maxX) * 0.5,
    minY <= maxY ? clamp(y, minY, maxY) : (minY + maxY) * 0.5,
  ];
}

/**
 * Returns `true` if circular probe `(x, y, radius)` is outside playable bounds
 * or overlaps any alive obstacle matching `mode`.
 */
export function isPointBlocked(
  arena: ServerArena,
  x: number,
  y: number,
  radius = 0,
  mode: RayMode = 'move',
): boolean {
  if (!isPointInPlayableBounds(arena, x, y, Math.max(0, radius))) {
    return true;
  }
  arena.obsGrid.queryCircle(x, y, Math.max(0, radius), tmpObsCircle, mode);
  return tmpObsCircle.length > 0;
}

/** Resolves circle overlap against alive `blocksMove` obstacles and clamps to arena bounds. */
export function resolveArenaObstacles(
  arena: ServerArena,
  body: CircleBody,
  margin = 0,
): CircleBody {
  return resolveObstacles(body, arena.obsGrid, arena.w, arena.h, margin);
}

/** Moves `body` by `(dx, dy)` using <=8px substeps and 2-pass AABB sliding against `arena.obsGrid`. */
export function moveArenaCircle(
  arena: ServerArena,
  body: CircleBody,
  dx: number,
  dy: number,
  margin = 0,
): CircleBody {
  return moveCircleWithSlide(body, dx, dy, arena.obsGrid, arena.w, arena.h, margin);
}
