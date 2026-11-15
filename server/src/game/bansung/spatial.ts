/**
 * Spatial hash grids (`ActorGrid`, `ObstacleGrid`), substepped circle-vs-AABB
 * sliding movement with inside-escape, swept bullet anti-tunneling, and
 * Amanatides-Woo DDA line-of-sight / AoE solvers for `bansung` (specs d05, d06).
 */
import {
  BANSUNG_GRID_CELL,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  type ArenaObstacle,
  type BansungObstacleKind,
} from '../../../../shared/src';

export type { ArenaObstacle, BansungObstacleKind };

// ============================================================================
// 1. Constants & Spatial Schemas (d05)
// ============================================================================

/** Spatial hash cell size in px (aligns with 48px tiles and 64px queries). */
export const GRID_CELL = BANSUNG_GRID_CELL;
/** Maximum linear step per movement substep (px) to prevent wall tunneling. */
export const MAX_MOVE_SUBSTEP_PX = 8;
/** Maximum movement substeps per tick. */
export const MAX_MOVE_SUBSTEPS = 8;
/** Maximum projectile wall reflections processed in a single 30Hz tick. */
export const MAX_BOUNCES_PER_TICK = 3;
/** Minimum AoE damage falloff at the outer blast perimeter. */
export const AOE_MIN_FALLOFF = 0.35;

/** Collision layer bit for heroes and co-op AI bots. */
export const LAYER_PLAYER = 1 << 0;
/** Collision layer bit for enemies and bosses. */
export const LAYER_ENEMY = 1 << 1;
/** Collision layer bit for turrets and targetable deployables. */
export const LAYER_PET = 1 << 2;

/** Minimal actor shape indexed by `ActorGrid`. */
export interface SpatialActor {
  id: number;
  x: number;
  y: number;
  /** Collision radius in px (hero ~14, mob 14..24, boss 36..52). */
  radius: number;
  /** 0 = co-op players/pets, 1 = enemies. */
  team: number;
  /** Bitmask combining `LAYER_*` flags. */
  layer: number;
  alive: boolean;
}

/** Mutable circular body solved against arena AABBs. */
export interface CircleBody {
  x: number;
  y: number;
  radius: number;
}

/** Ray/sweep obstacle filter mode. */
export type RayMode = 'bullet' | 'los' | 'move';

/** AoE line-of-sight occlusion mode (`'none'` bypasses cover checks). */
export type AoeLosMode = RayMode | 'none';

/** Closest obstacle contact produced by `raycastObstacles`. */
export interface RayObstacleHit {
  /** Normalized fraction `[0, 1]` along the queried segment. */
  t: number;
  x: number;
  y: number;
  /** Unit outward surface normal X. */
  nx: number;
  /** Unit outward surface normal Y. */
  ny: number;
  obstacle: ArenaObstacle;
}

/** Actor intersection produced by swept segment queries. */
export interface RayActorHit {
  actor: SpatialActor;
  /** Normalized fraction `[0, 1]` along the queried segment. */
  t: number;
  x: number;
  y: number;
}

/** Mutable projectile state consumed by `stepSweptBullet`. */
export interface SweptBulletInput {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  team: number;
  /** Target layer mask (defaults to opposing team layers if omitted). */
  layerMask?: number;
  /** Maximum distinct actors hit before stopping (`1` = standard non-piercing). */
  maxHits?: number;
  /** Remaining wall ricochets (`0` = stop on first wall impact). */
  bouncesLeft?: number;
  /** Optional already-hit actor IDs (for piercing shots across ticks). */
  hitIds?: Set<number>;
  /** When true, allows hitting same-team actors (e.g. healing bolts). */
  friendlyHeal?: boolean;
}

/** Obstacle contact recorded during `stepSweptBullet`. */
export interface SweptObstacleHit extends RayObstacleHit {
  bounceIndex: number;
}

/** Combined tick output for `stepSweptBullet`. */
export interface SweepBulletResult {
  endX: number;
  endY: number;
  stopped: boolean;
  stoppedBy: 'none' | 'actor' | 'obstacle';
  actorHits: RayActorHit[];
  obstacleHits: SweptObstacleHit[];
  bouncesUsed: number;
}

/** AoE blast candidate surviving radius and LOS occlusion checks. */
export interface AoeTarget {
  actor: SpatialActor;
  edgeDist: number;
  falloff: number;
}

/** Destructible obstacle hit within an AoE blast. */
export interface AoeObstacleTarget {
  obstacle: ArenaObstacle;
  edgeDist: number;
  falloff: number;
}

// ============================================================================
// 2. Internal Utilities & Zero-GC Scratch Buffers
// ============================================================================

const EPS = 1e-6;
const SLAB_EPS = 1e-12;

const tmpMoveObs: ArenaObstacle[] = [];
const tmpOverlapObs: ArenaObstacle[] = [];
const tmpOverlapDepth: number[] = [];
const tmpRayObs: ArenaObstacle[] = [];
const tmpSweepCandidates: SpatialActor[] = [];
const tmpSegHits: RayActorHit[] = [];
const tmpAoeCandidates: SpatialActor[] = [];
const tmpAoeObs: ArenaObstacle[] = [];

const slabOut = { t: 0, nx: 0, ny: 0 };
let clipT0 = 0;
let clipT1 = 1;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function matchesMode(o: ArenaObstacle, mode: RayMode): boolean {
  if (!o.alive) return false;
  if (mode === 'bullet') return o.blocksBullet;
  if (mode === 'los') return o.blocksLos;
  return o.blocksMove;
}

function clipSegmentToBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < SLAB_EPS) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    const inv = 1 / dx;
    const a = (minX - x0) * inv;
    const b = (maxX - x0) * inv;
    const enter = a < b ? a : b;
    const exit = a > b ? a : b;
    if (enter > t0) t0 = enter;
    if (exit < t1) t1 = exit;
    if (t0 > t1) return false;
  }
  if (Math.abs(dy) < SLAB_EPS) {
    if (y0 < minY || y0 > maxY) return false;
  } else {
    const inv = 1 / dy;
    const a = (minY - y0) * inv;
    const b = (maxY - y0) * inv;
    const enter = a < b ? a : b;
    const exit = a > b ? a : b;
    if (enter > t0) t0 = enter;
    if (exit < t1) t1 = exit;
    if (t0 > t1) return false;
  }
  clipT0 = t0;
  clipT1 = t1;
  return true;
}

/**
 * Kay-Kajiya slab intersection against a Minkowski-expanded AABB.
 * Writes `t`, `nx`, `ny` into module-scoped `slabOut` on hit.
 */
function testRayExpandedAabb(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  radius: number,
): boolean {
  const minX = ox - radius;
  const maxX = ox + ow + radius;
  const minY = oy - radius;
  const maxY = oy + oh + radius;

  if (x0 > minX && x0 < maxX && y0 > minY && y0 < maxY) {
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      slabOut.nx = -dx / len;
      slabOut.ny = -dy / len;
    } else {
      const dl = x0 - minX;
      const dr = maxX - x0;
      const dt = y0 - minY;
      const db = maxY - y0;
      const minD = Math.min(dl, dr, dt, db);
      if (minD === dl) {
        slabOut.nx = -1;
        slabOut.ny = 0;
      } else if (minD === dr) {
        slabOut.nx = 1;
        slabOut.ny = 0;
      } else if (minD === dt) {
        slabOut.nx = 0;
        slabOut.ny = -1;
      } else {
        slabOut.nx = 0;
        slabOut.ny = 1;
      }
    }
    slabOut.t = 0;
    return true;
  }

  if (Math.abs(dx) < SLAB_EPS && Math.abs(dy) < SLAB_EPS) {
    return false;
  }

  let txMin = -Infinity;
  let txMax = Infinity;
  let nxEnter = 0;
  if (Math.abs(dx) < SLAB_EPS) {
    if (x0 <= minX || x0 >= maxX) return false;
  } else {
    const invDx = 1 / dx;
    const t1 = (minX - x0) * invDx;
    const t2 = (maxX - x0) * invDx;
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
    if (y0 <= minY || y0 >= maxY) return false;
  } else {
    const invDy = 1 / dy;
    const t1 = (minY - y0) * invDy;
    const t2 = (maxY - y0) * invDy;
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
  if (tEnter > tExit || tExit <= 0 || tEnter < 0 || tEnter > 1) {
    return false;
  }

  slabOut.t = tEnter === 0 ? 0 : tEnter;
  if (txMin > tyMin) {
    slabOut.nx = nxEnter;
    slabOut.ny = 0;
  } else if (tyMin > txMin) {
    slabOut.nx = 0;
    slabOut.ny = nyEnter;
  } else {
    const scale = nxEnter !== 0 && nyEnter !== 0 ? Math.SQRT1_2 : 1;
    slabOut.nx = nxEnter * scale;
    slabOut.ny = nyEnter * scale;
  }
  return true;
}

// ============================================================================
// 3. ActorGrid (Zero-GC Int32Array Flat Linked List, 64px Cell)
// ============================================================================

/**
 * Per-tick zero-allocation spatial hash for living `SpatialActor` entities.
 * Uses flat `Int32Array` `head` and `next` linked-list buffers.
 */
export class ActorGrid {
  readonly mapW: number;
  readonly mapH: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  head: Int32Array;
  next: Int32Array;
  items: SpatialActor[] = [];
  maxRadius = 16;

  private readonly cellEpoch: Int32Array;
  private epoch = 0;

  constructor(mapW = BANSUNG_MAP_W, mapH = BANSUNG_MAP_H, cellSize = GRID_CELL) {
    this.mapW = Math.max(1, mapW);
    this.mapH = Math.max(1, mapH);
    this.cellSize = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(this.mapW / this.cellSize));
    this.rows = Math.max(1, Math.ceil(this.mapH / this.cellSize));
    const cellCount = this.cols * this.rows;
    this.head = new Int32Array(cellCount);
    this.head.fill(-1);
    this.next = new Int32Array(512);
    this.cellEpoch = new Int32Array(cellCount);
  }

  private nextCellEpoch(): number {
    if (this.epoch >= 0x7fffffff) {
      this.cellEpoch.fill(0);
      this.epoch = 1;
    } else {
      this.epoch += 1;
    }
    return this.epoch;
  }

  /** Rebuilds the flat linked list from `actors` in-place with zero per-tick GC. */
  rebuild(actors: readonly SpatialActor[]): void {
    this.head.fill(-1);
    this.items.length = 0;
    this.maxRadius = 16;

    const cs = this.cellSize;
    const maxC = this.cols - 1;
    const maxR = this.rows - 1;
    const cols = this.cols;

    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!a.alive || !Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;

      const idx = this.items.length;
      this.items.push(a);

      if (idx >= this.next.length) {
        const grown = new Int32Array(this.next.length * 2);
        grown.set(this.next);
        this.next = grown;
      }

      const cx = clampInt(Math.floor(a.x / cs), 0, maxC);
      const cy = clampInt(Math.floor(a.y / cs), 0, maxR);
      const cellIdx = cy * cols + cx;
      this.next[idx] = this.head[cellIdx];
      this.head[cellIdx] = idx;

      if (Number.isFinite(a.radius) && a.radius > this.maxRadius) {
        this.maxRadius = a.radius;
      }
    }
  }

  /**
   * Queries living actors overlapping circle `(x, y, r)` matching `layerMask`.
   * Appends results into caller-supplied `out` (cleared first) with zero heap allocations.
   */
  queryCircle(
    x: number,
    y: number,
    r: number,
    layerMask: number,
    out: SpatialActor[],
  ): SpatialActor[] {
    out.length = 0;
    if (
      this.items.length === 0 ||
      r < 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(r)
    ) {
      return out;
    }

    const cs = this.cellSize;
    const pad = r + this.maxRadius;
    const c0 = clampInt(Math.floor((x - pad) / cs), 0, this.cols - 1);
    const c1 = clampInt(Math.floor((x + pad) / cs), 0, this.cols - 1);
    const r0 = clampInt(Math.floor((y - pad) / cs), 0, this.rows - 1);
    const r1 = clampInt(Math.floor((y + pad) / cs), 0, this.rows - 1);

    for (let cy = r0; cy <= r1; cy++) {
      const rowOff = cy * this.cols;
      for (let cx = c0; cx <= c1; cx++) {
        let idx = this.head[rowOff + cx];
        while (idx !== -1) {
          const a = this.items[idx];
          if ((a.layer & layerMask) !== 0) {
            const dx = a.x - x;
            const dy = a.y - y;
            const sumR = r + a.radius;
            if (dx * dx + dy * dy <= sumR * sumR) {
              out.push(a);
            }
          }
          idx = this.next[idx];
        }
      }
    }
    return out;
  }

  /**
   * Queries living actors overlapping AABB `[x0, x1] x [y0, y1]` matching `layerMask`.
   * Clears `out` first and allocates zero heap memory.
   */
  queryAabb(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    layerMask: number,
    out: SpatialActor[],
  ): SpatialActor[] {
    out.length = 0;
    if (
      this.items.length === 0 ||
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      return out;
    }

    const minX = x0 < x1 ? x0 : x1;
    const maxX = x0 > x1 ? x0 : x1;
    const minY = y0 < y1 ? y0 : y1;
    const maxY = y0 > y1 ? y0 : y1;
    const cs = this.cellSize;
    const pad = this.maxRadius;

    const c0 = clampInt(Math.floor((minX - pad) / cs), 0, this.cols - 1);
    const c1 = clampInt(Math.floor((maxX + pad) / cs), 0, this.cols - 1);
    const r0 = clampInt(Math.floor((minY - pad) / cs), 0, this.rows - 1);
    const r1 = clampInt(Math.floor((maxY + pad) / cs), 0, this.rows - 1);

    for (let cy = r0; cy <= r1; cy++) {
      const rowOff = cy * this.cols;
      for (let cx = c0; cx <= c1; cx++) {
        let idx = this.head[rowOff + cx];
        while (idx !== -1) {
          const a = this.items[idx];
          if ((a.layer & layerMask) !== 0) {
            const qx = clamp(a.x, minX, maxX);
            const qy = clamp(a.y, minY, maxY);
            const dx = a.x - qx;
            const dy = a.y - qy;
            if (dx * dx + dy * dy <= a.radius * a.radius) {
              out.push(a);
            }
          }
          idx = this.next[idx];
        }
      }
    }
    return out;
  }

  /**
   * Walks Amanatides-Woo DDA cells along `(x0, y0) -> (x1, y1)` with a
   * `ceil((padRadius + maxRadius) / cellSize)` cell neighborhood pad, using
   * an internal cell epoch so each cell is visited at most once.
   */
  querySegmentCells(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    padRadius: number,
    layerMask: number,
    out: SpatialActor[],
  ): SpatialActor[] {
    out.length = 0;
    if (
      this.items.length === 0 ||
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      return out;
    }

    const cs = this.cellSize;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const padCells = Math.max(0, Math.ceil((Math.max(0, padRadius) + this.maxRadius) / cs));
    const padWorld = padCells * cs;
    const gridW = this.cols * cs;
    const gridH = this.rows * cs;

    if (!clipSegmentToBox(x0, y0, dx, dy, -padWorld, -padWorld, gridW + padWorld, gridH + padWorld)) {
      return out;
    }

    const sx = x0 + dx * clipT0;
    const sy = y0 + dy * clipT0;
    let cx = Math.floor(sx / cs);
    let cy = Math.floor(sy / cs);

    const stepX = Math.abs(dx) < SLAB_EPS ? 0 : dx > 0 ? 1 : -1;
    const stepY = Math.abs(dy) < SLAB_EPS ? 0 : dy > 0 ? 1 : -1;
    const tDeltaX = stepX !== 0 ? Math.abs(cs / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(cs / dy) : Infinity;
    let tMaxX =
      stepX > 0
        ? ((cx + 1) * cs - x0) / dx
        : stepX < 0
          ? (cx * cs - x0) / dx
          : Infinity;
    let tMaxY =
      stepY > 0
        ? ((cy + 1) * cs - y0) / dy
        : stepY < 0
          ? (cy * cs - y0) / dy
          : Infinity;

    const minCellX = -padCells;
    const maxCellX = this.cols - 1 + padCells;
    const minCellY = -padCells;
    const maxCellY = this.rows - 1 + padCells;
    const epoch = this.nextCellEpoch();
    const maxSteps = (this.cols + this.rows + padCells * 4) * 2 + 8;

    for (let step = 0; step < maxSteps; step++) {
      const nx0 = Math.max(0, cx - padCells);
      const nx1 = Math.min(this.cols - 1, cx + padCells);
      const ny0 = Math.max(0, cy - padCells);
      const ny1 = Math.min(this.rows - 1, cy + padCells);

      for (let ry = ny0; ry <= ny1; ry++) {
        const rowOff = ry * this.cols;
        for (let rx = nx0; rx <= nx1; rx++) {
          const cellIdx = rowOff + rx;
          if (this.cellEpoch[cellIdx] === epoch) continue;
          this.cellEpoch[cellIdx] = epoch;

          let idx = this.head[cellIdx];
          while (idx !== -1) {
            const a = this.items[idx];
            if ((a.layer & layerMask) !== 0) {
              out.push(a);
            }
            idx = this.next[idx];
          }
        }
      }

      if (tMaxX < tMaxY) {
        if (tMaxX > clipT1 + 1e-7) break;
        cx += stepX;
        tMaxX += tDeltaX;
      } else {
        if (tMaxY > clipT1 + 1e-7) break;
        cy += stepY;
        tMaxY += tDeltaY;
      }

      if (cx < minCellX || cx > maxCellX || cy < minCellY || cy > maxCellY) {
        break;
      }
    }

    return out;
  }

  /**
   * Fills pre-allocated `outIds` with up to `maxCount` matching actor IDs within
   * circle `(x, y, r)` for the specified `layerMask`. Returns count written.
   */
  queryLayerIds(
    x: number,
    y: number,
    r: number,
    layerMask: number,
    outIds: Int32Array | number[],
    maxCount = outIds.length,
    excludeId = -1,
  ): number {
    if (
      this.items.length === 0 ||
      r < 0 ||
      maxCount <= 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(r)
    ) {
      if (Array.isArray(outIds)) outIds.length = 0;
      return 0;
    }

    const limit = Math.min(maxCount, outIds.length);
    const cs = this.cellSize;
    const pad = r + this.maxRadius;
    const c0 = clampInt(Math.floor((x - pad) / cs), 0, this.cols - 1);
    const c1 = clampInt(Math.floor((x + pad) / cs), 0, this.cols - 1);
    const r0 = clampInt(Math.floor((y - pad) / cs), 0, this.rows - 1);
    const r1 = clampInt(Math.floor((y + pad) / cs), 0, this.rows - 1);

    let count = 0;
    for (let cy = r0; cy <= r1 && count < limit; cy++) {
      const rowOff = cy * this.cols;
      for (let cx = c0; cx <= c1 && count < limit; cx++) {
        let idx = this.head[rowOff + cx];
        while (idx !== -1 && count < limit) {
          const a = this.items[idx];
          if ((a.layer & layerMask) !== 0 && a.id !== excludeId) {
            const dx = a.x - x;
            const dy = a.y - y;
            const sumR = r + a.radius;
            if (dx * dx + dy * dy <= sumR * sumR) {
              outIds[count++] = a.id;
            }
          }
          idx = this.next[idx];
        }
      }
    }

    if (Array.isArray(outIds)) outIds.length = count;
    return count;
  }

  /**
   * Fills `outIds` with up to `maxCount` enemy (`LAYER_ENEMY`) IDs within `(x, y, r)`.
   * Matches `d36` flocking AI neighbor query contract.
   */
  queryEnemies(
    x: number,
    y: number,
    r: number,
    outIds: Int32Array | number[],
    maxCount = outIds.length,
    excludeId = -1,
  ): number {
    return this.queryLayerIds(x, y, r, LAYER_ENEMY, outIds, maxCount, excludeId);
  }
}

// ============================================================================
// 4. ObstacleGrid (Built Once at Arena Load, Epoch-Deduped)
// ============================================================================

function wallFlagsKey(o: ArenaObstacle): number {
  return (o.blocksMove ? 1 : 0) | (o.blocksBullet ? 2 : 0) | (o.blocksLos ? 4 : 0);
}

/**
 * Merges contiguous collinear static (`!destructible`) `'wall'` AABBs into
 * maximal horizontal and vertical rectangles to eliminate internal seam snagging.
 * Non-wall obstacles keep their original object references intact.
 */
export function mergeCollinearWalls(obstacles: readonly ArenaObstacle[]): ArenaObstacle[] {
  const staticWalls: ArenaObstacle[] = [];
  const others: ArenaObstacle[] = [];

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.kind === 'wall' && !o.destructible && o.alive && o.w > 0 && o.h > 0) {
      staticWalls.push(o);
    } else {
      others.push(o);
    }
  }

  if (staticWalls.length <= 1) {
    return obstacles.slice();
  }

  // Horizontal pass: merge flush segments sharing (flags, y, h)
  const hSorted = staticWalls.slice().sort((a, b) => {
    const fk = wallFlagsKey(a) - wallFlagsKey(b);
    if (fk !== 0) return fk;
    if (a.y !== b.y) return a.y - b.y;
    if (a.h !== b.h) return a.h - b.h;
    return a.x - b.x;
  });

  const hMerged: ArenaObstacle[] = [];
  let cur = hSorted[0];
  let mergedAny = false;

  for (let i = 1; i < hSorted.length; i++) {
    const nxt = hSorted[i];
    if (
      wallFlagsKey(cur) === wallFlagsKey(nxt) &&
      Math.abs(cur.y - nxt.y) <= EPS &&
      Math.abs(cur.h - nxt.h) <= EPS &&
      nxt.x <= cur.x + cur.w + EPS
    ) {
      const right = Math.max(cur.x + cur.w, nxt.x + nxt.w);
      cur = { ...cur, w: right - cur.x };
      mergedAny = true;
    } else {
      hMerged.push(cur);
      cur = nxt;
    }
  }
  hMerged.push(cur);

  // Vertical pass: merge flush segments sharing (flags, x, w)
  const vSorted = hMerged.slice().sort((a, b) => {
    const fk = wallFlagsKey(a) - wallFlagsKey(b);
    if (fk !== 0) return fk;
    if (a.x !== b.x) return a.x - b.x;
    if (a.w !== b.w) return a.w - b.w;
    return a.y - b.y;
  });

  const vMerged: ArenaObstacle[] = [];
  cur = vSorted[0];
  for (let i = 1; i < vSorted.length; i++) {
    const nxt = vSorted[i];
    if (
      wallFlagsKey(cur) === wallFlagsKey(nxt) &&
      Math.abs(cur.x - nxt.x) <= EPS &&
      Math.abs(cur.w - nxt.w) <= EPS &&
      nxt.y <= cur.y + cur.h + EPS
    ) {
      const bottom = Math.max(cur.y + cur.h, nxt.y + nxt.h);
      cur = { ...cur, h: bottom - cur.y };
      mergedAny = true;
    } else {
      vMerged.push(cur);
      cur = nxt;
    }
  }
  vMerged.push(cur);

  if (!mergedAny) {
    return obstacles.slice();
  }
  return [...vMerged, ...others];
}

/**
 * Static 64px spatial hash over arena blocks and destructible props.
 * Supports zero-rebuild in-place `alive` toggling and `Int32Array` epoch deduplication.
 */
export class ObstacleGrid {
  readonly mapW: number;
  readonly mapH: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly obstacles: readonly ArenaObstacle[];
  readonly cells: readonly number[][];
  readonly seenEpoch: Int32Array;

  private readonly byId = new Map<number, ArenaObstacle>();
  private epoch = 0;

  constructor(
    obstacles: readonly ArenaObstacle[],
    mapW = BANSUNG_MAP_W,
    mapH = BANSUNG_MAP_H,
    cellSize = GRID_CELL,
    mergeWalls = true,
  ) {
    this.mapW = Math.max(1, mapW);
    this.mapH = Math.max(1, mapH);
    this.cellSize = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(this.mapW / this.cellSize));
    this.rows = Math.max(1, Math.ceil(this.mapH / this.cellSize));

    const prepared = mergeWalls ? mergeCollinearWalls(obstacles) : obstacles.slice();
    this.obstacles = prepared;
    this.seenEpoch = new Int32Array(prepared.length);

    const cells: number[][] = new Array(this.cols * this.rows);
    for (let i = 0; i < cells.length; i++) {
      cells[i] = [];
    }

    const maxC = this.cols - 1;
    const maxR = this.rows - 1;
    const cs = this.cellSize;

    for (let i = 0; i < prepared.length; i++) {
      const o = prepared[i];
      this.byId.set(o.id, o);
      if (o.w < 0 || o.h < 0) continue;

      const c0 = clampInt(Math.floor(o.x / cs), 0, maxC);
      const c1 = clampInt(Math.floor((o.x + o.w) / cs), 0, maxC);
      const r0 = clampInt(Math.floor(o.y / cs), 0, maxR);
      const r1 = clampInt(Math.floor((o.y + o.h) / cs), 0, maxR);

      for (let cy = r0; cy <= r1; cy++) {
        const rowOff = cy * this.cols;
        for (let cx = c0; cx <= c1; cx++) {
          cells[rowOff + cx].push(i);
        }
      }
    }

    this.cells = cells;
  }

  /** Advances and returns a monotonically increasing epoch token (wrapping cleanly). */
  nextEpoch(): number {
    if (this.epoch >= 0x7fffffff) {
      this.seenEpoch.fill(0);
      this.epoch = 1;
    } else {
      this.epoch += 1;
    }
    return this.epoch;
  }

  /** Looks up an indexed obstacle by its numeric ID (`O(1)`). */
  getById(id: number): ArenaObstacle | undefined {
    return this.byId.get(id);
  }

  /** Toggles an obstacle's `alive` flag in-place without rebuilding the grid. */
  setAlive(id: number, alive: boolean): boolean {
    const obs = this.byId.get(id);
    if (!obs) return false;
    obs.alive = alive;
    return true;
  }

  /**
   * Returns unique alive obstacles overlapping `[x0, x1] x [y0, y1]`,
   * deduplicated across multi-cell AABBs via `seenEpoch`.
   */
  queryAabb(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    out: ArenaObstacle[],
  ): ArenaObstacle[] {
    out.length = 0;
    if (
      this.obstacles.length === 0 ||
      !Number.isFinite(x0) ||
      !Number.isFinite(y0) ||
      !Number.isFinite(x1) ||
      !Number.isFinite(y1)
    ) {
      return out;
    }

    const minX = x0 < x1 ? x0 : x1;
    const maxX = x0 > x1 ? x0 : x1;
    const minY = y0 < y1 ? y0 : y1;
    const maxY = y0 > y1 ? y0 : y1;
    const cs = this.cellSize;

    const c0 = clampInt(Math.floor(minX / cs), 0, this.cols - 1);
    const c1 = clampInt(Math.floor(maxX / cs), 0, this.cols - 1);
    const r0 = clampInt(Math.floor(minY / cs), 0, this.rows - 1);
    const r1 = clampInt(Math.floor(maxY / cs), 0, this.rows - 1);

    const epoch = this.nextEpoch();

    for (let cy = r0; cy <= r1; cy++) {
      const rowOff = cy * this.cols;
      for (let cx = c0; cx <= c1; cx++) {
        const bucket = this.cells[rowOff + cx];
        for (let i = 0; i < bucket.length; i++) {
          const obsIdx = bucket[i];
          if (this.seenEpoch[obsIdx] === epoch) continue;
          this.seenEpoch[obsIdx] = epoch;

          const o = this.obstacles[obsIdx];
          if (
            o.alive &&
            o.x <= maxX &&
            o.x + o.w >= minX &&
            o.y <= maxY &&
            o.y + o.h >= minY
          ) {
            out.push(o);
          }
        }
      }
    }

    return out;
  }

  /**
   * Returns unique alive obstacles overlapping circle `(x, y, r)`,
   * optionally filtered by `RayMode` (`'move' | 'bullet' | 'los'`).
   */
  queryCircle(
    x: number,
    y: number,
    r: number,
    out: ArenaObstacle[],
    mode?: RayMode,
  ): ArenaObstacle[] {
    out.length = 0;
    if (
      this.obstacles.length === 0 ||
      r < 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(r)
    ) {
      return out;
    }

    const cs = this.cellSize;
    const c0 = clampInt(Math.floor((x - r) / cs), 0, this.cols - 1);
    const c1 = clampInt(Math.floor((x + r) / cs), 0, this.cols - 1);
    const r0 = clampInt(Math.floor((y - r) / cs), 0, this.rows - 1);
    const r1 = clampInt(Math.floor((y + r) / cs), 0, this.rows - 1);
    const r2 = r * r;
    const epoch = this.nextEpoch();

    for (let cy = r0; cy <= r1; cy++) {
      const rowOff = cy * this.cols;
      for (let cx = c0; cx <= c1; cx++) {
        const bucket = this.cells[rowOff + cx];
        for (let i = 0; i < bucket.length; i++) {
          const obsIdx = bucket[i];
          if (this.seenEpoch[obsIdx] === epoch) continue;
          this.seenEpoch[obsIdx] = epoch;

          const o = this.obstacles[obsIdx];
          if (!o.alive) continue;
          if (mode && !matchesMode(o, mode)) continue;

          const qx = clamp(x, o.x, o.x + o.w);
          const qy = clamp(y, o.y, o.y + o.h);
          const dx = x - qx;
          const dy = y - qy;
          if (dx * dx + dy * dy <= r2) {
            out.push(o);
          }
        }
      }
    }

    return out;
  }
}

// ============================================================================
// 5. Circle-vs-AABB Sliding Movement & Inside-Escape (d05)
// ============================================================================

function clampBodyToArena(
  body: CircleBody,
  mapW: number,
  mapH: number,
  margin: number,
): void {
  const minX = margin + body.radius;
  const maxX = mapW - margin - body.radius;
  if (minX <= maxX) {
    body.x = clamp(body.x, minX, maxX);
  } else {
    body.x = (minX + maxX) * 0.5;
  }

  const minY = margin + body.radius;
  const maxY = mapH - margin - body.radius;
  if (minY <= maxY) {
    body.y = clamp(body.y, minY, maxY);
  } else {
    body.y = (minY + maxY) * 0.5;
  }
}

function pushBodyOutOfObstacle(body: CircleBody, o: ArenaObstacle): void {
  const r = body.radius;
  const qx = clamp(body.x, o.x, o.x + o.w);
  const qy = clamp(body.y, o.y, o.y + o.h);
  const vx = body.x - qx;
  const vy = body.y - qy;
  const d2 = vx * vx + vy * vy;

  if (d2 > 0) {
    if (d2 < r * r) {
      const d = Math.sqrt(d2);
      const push = r - d;
      body.x += (vx / d) * push;
      body.y += (vy / d) * push;
    }
    return;
  }

  // Inside-AABB escape (center lies inside or on obstacle bounds)
  const dl = body.x - o.x;
  const dr = o.x + o.w - body.x;
  const dt = body.y - o.y;
  const db = o.y + o.h - body.y;
  const minDepth = Math.min(dl, dr, dt, db);

  if (minDepth === dl) {
    body.x -= dl + r;
  } else if (minDepth === dr) {
    body.x += dr + r;
  } else if (minDepth === dt) {
    body.y -= dt + r;
  } else {
    body.y += db + r;
  }
}

function resolveObstaclesPassSorted(body: CircleBody, obsGrid: ObstacleGrid): number {
  const r = body.radius;
  obsGrid.queryAabb(body.x - r, body.y - r, body.x + r, body.y + r, tmpMoveObs);

  tmpOverlapObs.length = 0;
  tmpOverlapDepth.length = 0;

  const r2 = r * r;
  for (let i = 0; i < tmpMoveObs.length; i++) {
    const o = tmpMoveObs[i];
    if (!o.alive || !o.blocksMove) continue;

    const qx = clamp(body.x, o.x, o.x + o.w);
    const qy = clamp(body.y, o.y, o.y + o.h);
    const vx = body.x - qx;
    const vy = body.y - qy;
    const d2 = vx * vx + vy * vy;

    let depth = 0;
    if (d2 === 0) {
      const minFace = Math.min(
        body.x - o.x,
        o.x + o.w - body.x,
        body.y - o.y,
        o.y + o.h - body.y,
      );
      depth = r + minFace;
    } else if (d2 < r2) {
      depth = r - Math.sqrt(d2);
    }

    if (depth > 0) {
      // Insertion sort descending by overlap depth (zero allocations)
      let insertAt = tmpOverlapObs.length;
      while (insertAt > 0 && tmpOverlapDepth[insertAt - 1] < depth) {
        tmpOverlapObs[insertAt] = tmpOverlapObs[insertAt - 1];
        tmpOverlapDepth[insertAt] = tmpOverlapDepth[insertAt - 1];
        insertAt--;
      }
      tmpOverlapObs[insertAt] = o;
      tmpOverlapDepth[insertAt] = depth;
    }
  }

  for (let i = 0; i < tmpOverlapObs.length; i++) {
    pushBodyOutOfObstacle(body, tmpOverlapObs[i]);
  }
  return tmpOverlapObs.length;
}

function resolveObstaclesPassUnsorted(body: CircleBody, obsGrid: ObstacleGrid): void {
  const r = body.radius;
  obsGrid.queryAabb(body.x - r, body.y - r, body.x + r, body.y + r, tmpMoveObs);
  for (let i = 0; i < tmpMoveObs.length; i++) {
    const o = tmpMoveObs[i];
    if (!o.alive || !o.blocksMove) continue;
    pushBodyOutOfObstacle(body, o);
  }
}

/**
 * Resolves circle overlap against alive `blocksMove` obstacles using 2 passes
 * (deepest-first on pass 1 to prevent corner oscillation) and clamps to arena bounds.
 */
export function resolveObstacles(
  body: CircleBody,
  obsGrid: ObstacleGrid,
  mapW = obsGrid.mapW,
  mapH = obsGrid.mapH,
  margin = 0,
): CircleBody {
  if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || !Number.isFinite(body.radius)) {
    return body;
  }

  const hits = resolveObstaclesPassSorted(body, obsGrid);
  if (hits > 0) {
    resolveObstaclesPassUnsorted(body, obsGrid);
  }
  clampBodyToArena(body, mapW, mapH, margin);
  return body;
}

/** Alias for `resolveObstacles` matching `d36` naming. */
export const resolveCircleObstacles = resolveObstacles;

/**
 * Moves a circular body by `(dx, dy)` using <=8px substeps, 2-pass circle-vs-AABB
 * sliding resolution with inside-AABB escape, and arena boundary clamping.
 */
export function moveCircleWithSlide(
  body: CircleBody,
  dx: number,
  dy: number,
  obsGrid: ObstacleGrid,
  mapW = obsGrid.mapW,
  mapH = obsGrid.mapH,
  margin = 0,
): CircleBody {
  const safeDx = Number.isFinite(dx) ? dx : 0;
  const safeDy = Number.isFinite(dy) ? dy : 0;
  const dist = Math.hypot(safeDx, safeDy);

  if (dist === 0) {
    return resolveObstacles(body, obsGrid, mapW, mapH, margin);
  }

  const stepLimit = Math.max(1, Math.min(MAX_MOVE_SUBSTEP_PX, body.radius * 0.5));
  const steps = Math.min(MAX_MOVE_SUBSTEPS, Math.max(1, Math.ceil(dist / stepLimit)));
  const sx = safeDx / steps;
  const sy = safeDy / steps;

  for (let s = 0; s < steps; s++) {
    body.x += sx;
    body.y += sy;
    const hits = resolveObstaclesPassSorted(body, obsGrid);
    if (hits > 0) {
      resolveObstaclesPassUnsorted(body, obsGrid);
    }
    clampBodyToArena(body, mapW, mapH, margin);
  }

  return body;
}

// ============================================================================
// 6. Amanatides-Woo DDA Raycast & Line of Sight (d05)
// ============================================================================

/**
 * Raycasts segment `(x0, y0) -> (x1, y1)` expanded by `radius` against `obsGrid`.
 * Uses Amanatides-Woo 2D DDA with safe early exit when `radius === 0` or `len > 128`.
 */
export function raycastObstacles(
  obsGrid: ObstacleGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius = 0,
  mode: RayMode = 'bullet',
): RayObstacleHit | null {
  if (
    obsGrid.obstacles.length === 0 ||
    !Number.isFinite(x0) ||
    !Number.isFinite(y0) ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(radius)
  ) {
    return null;
  }

  const r = Math.max(0, radius);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;

  let bestT = Infinity;
  let bestNx = 0;
  let bestNy = 0;
  let bestObs: ArenaObstacle | null = null;

  // Short swept circle rays use direct epoch-deduped AABB span
  if (r > 0 && lenSq <= 128 * 128) {
    const minX = (x0 < x1 ? x0 : x1) - r;
    const maxX = (x0 > x1 ? x0 : x1) + r;
    const minY = (y0 < y1 ? y0 : y1) - r;
    const maxY = (y0 > y1 ? y0 : y1) + r;
    obsGrid.queryAabb(minX, minY, maxX, maxY, tmpRayObs);

    for (let i = 0; i < tmpRayObs.length; i++) {
      const o = tmpRayObs[i];
      if (!matchesMode(o, mode)) continue;
      if (testRayExpandedAabb(x0, y0, dx, dy, o.x, o.y, o.w, o.h, r)) {
        if (slabOut.t < bestT) {
          bestT = slabOut.t;
          bestNx = slabOut.nx;
          bestNy = slabOut.ny;
          bestObs = o;
        }
      }
    }

    if (!bestObs) return null;
    return {
      t: bestT,
      x: x0 + dx * bestT,
      y: y0 + dy * bestT,
      nx: bestNx,
      ny: bestNy,
      obstacle: bestObs,
    };
  }

  // Amanatides-Woo 2D DDA traversal
  const cs = obsGrid.cellSize;
  const padCells = r > 0 ? Math.ceil(r / cs) : 0;
  const padWorld = padCells * cs;
  const gridW = obsGrid.cols * cs;
  const gridH = obsGrid.rows * cs;

  if (!clipSegmentToBox(x0, y0, dx, dy, -padWorld, -padWorld, gridW + padWorld, gridH + padWorld)) {
    return null;
  }

  const sx = x0 + dx * clipT0;
  const sy = y0 + dy * clipT0;
  let cx = Math.floor(sx / cs);
  let cy = Math.floor(sy / cs);
  if (r === 0) {
    cx = clampInt(cx, 0, obsGrid.cols - 1);
    cy = clampInt(cy, 0, obsGrid.rows - 1);
  }

  const stepX = Math.abs(dx) < SLAB_EPS ? 0 : dx > 0 ? 1 : -1;
  const stepY = Math.abs(dy) < SLAB_EPS ? 0 : dy > 0 ? 1 : -1;
  const tDeltaX = stepX !== 0 ? Math.abs(cs / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(cs / dy) : Infinity;
  let tMaxX =
    stepX > 0
      ? ((cx + 1) * cs - x0) / dx
      : stepX < 0
        ? (cx * cs - x0) / dx
        : Infinity;
  let tMaxY =
    stepY > 0
      ? ((cy + 1) * cs - y0) / dy
      : stepY < 0
        ? (cy * cs - y0) / dy
        : Infinity;

  const epoch = obsGrid.nextEpoch();
  const seenEpoch = obsGrid.seenEpoch;
  const minCellX = -padCells;
  const maxCellX = obsGrid.cols - 1 + padCells;
  const minCellY = -padCells;
  const maxCellY = obsGrid.rows - 1 + padCells;
  const len = lenSq > 0 ? Math.sqrt(lenSq) : 0;
  const radiusT = len > 1e-9 ? r / len : 1;
  const maxSteps = (obsGrid.cols + obsGrid.rows + padCells * 4) * 2 + 8;

  for (let step = 0; step < maxSteps; step++) {
    const nx0 = Math.max(0, cx - padCells);
    const nx1 = Math.min(obsGrid.cols - 1, cx + padCells);
    const ny0 = Math.max(0, cy - padCells);
    const ny1 = Math.min(obsGrid.rows - 1, cy + padCells);

    for (let ry = ny0; ry <= ny1; ry++) {
      const rowOff = ry * obsGrid.cols;
      for (let rx = nx0; rx <= nx1; rx++) {
        const bucket = obsGrid.cells[rowOff + rx];
        for (let i = 0; i < bucket.length; i++) {
          const obsIdx = bucket[i];
          if (seenEpoch[obsIdx] === epoch) continue;
          seenEpoch[obsIdx] = epoch;

          const o = obsGrid.obstacles[obsIdx];
          if (!matchesMode(o, mode)) continue;
          if (testRayExpandedAabb(x0, y0, dx, dy, o.x, o.y, o.w, o.h, r)) {
            if (slabOut.t < bestT) {
              bestT = slabOut.t;
              bestNx = slabOut.nx;
              bestNy = slabOut.ny;
              bestObs = o;
            }
          }
        }
      }
    }

    const tNext = tMaxX < tMaxY ? tMaxX : tMaxY;
    if (bestObs !== null) {
      const exitThreshold = r === 0 ? bestT + 1e-7 : bestT + radiusT + 1e-6;
      if ((tNext < 1 ? tNext : 1) >= exitThreshold) {
        break;
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX > clipT1 + 1e-7) break;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      if (tMaxY > clipT1 + 1e-7) break;
      cy += stepY;
      tMaxY += tDeltaY;
    }

    if (cx < minCellX || cx > maxCellX || cy < minCellY || cy > maxCellY) {
      break;
    }
  }

  if (!bestObs) return null;
  return {
    t: bestT,
    x: x0 + dx * bestT,
    y: y0 + dy * bestT,
    nx: bestNx,
    ny: bestNy,
    obstacle: bestObs,
  };
}

/**
 * Returns `true` iff segment `(x0, y0) -> (x1, y1)` is unobstructed by obstacles
 * matching `mode` (`'los'` by default). Exits immediately on first obstacle hit.
 */
export function hasLineOfSight(
  obsGrid: ObstacleGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: RayMode = 'los',
): boolean {
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return false;
  }
  if (obsGrid.obstacles.length === 0) return true;

  const cs = obsGrid.cellSize;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const gridW = obsGrid.cols * cs;
  const gridH = obsGrid.rows * cs;

  if (!clipSegmentToBox(x0, y0, dx, dy, 0, 0, gridW, gridH)) {
    return true;
  }

  const sx = x0 + dx * clipT0;
  const sy = y0 + dy * clipT0;
  let cx = clampInt(Math.floor(sx / cs), 0, obsGrid.cols - 1);
  let cy = clampInt(Math.floor(sy / cs), 0, obsGrid.rows - 1);

  const stepX = Math.abs(dx) < SLAB_EPS ? 0 : dx > 0 ? 1 : -1;
  const stepY = Math.abs(dy) < SLAB_EPS ? 0 : dy > 0 ? 1 : -1;
  const tDeltaX = stepX !== 0 ? Math.abs(cs / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(cs / dy) : Infinity;
  let tMaxX =
    stepX > 0
      ? ((cx + 1) * cs - x0) / dx
      : stepX < 0
        ? (cx * cs - x0) / dx
        : Infinity;
  let tMaxY =
    stepY > 0
      ? ((cy + 1) * cs - y0) / dy
      : stepY < 0
        ? (cy * cs - y0) / dy
        : Infinity;

  const epoch = obsGrid.nextEpoch();
  const seenEpoch = obsGrid.seenEpoch;
  const maxSteps = (obsGrid.cols + obsGrid.rows) * 2 + 8;

  for (let step = 0; step < maxSteps; step++) {
    const bucket = obsGrid.cells[cy * obsGrid.cols + cx];
    for (let i = 0; i < bucket.length; i++) {
      const obsIdx = bucket[i];
      if (seenEpoch[obsIdx] === epoch) continue;
      seenEpoch[obsIdx] = epoch;

      const o = obsGrid.obstacles[obsIdx];
      if (!matchesMode(o, mode)) continue;
      if (testRayExpandedAabb(x0, y0, dx, dy, o.x, o.y, o.w, o.h, 0)) {
        return false;
      }
    }

    if (tMaxX < tMaxY) {
      if (tMaxX > clipT1 + 1e-7) break;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      if (tMaxY > clipT1 + 1e-7) break;
      cy += stepY;
      tMaxY += tDeltaY;
    }

    if (cx < 0 || cx >= obsGrid.cols || cy < 0 || cy >= obsGrid.rows) {
      break;
    }
  }

  return true;
}

// ============================================================================
// 7. Swept Bullet Ray-Step Anti-Tunneling (d05)
// ============================================================================

/**
 * Wall-hug muzzle guard: checks segment from actor center `(ax, ay)` to weapon
 * muzzle `(mx, my)` so hugging cover cannot spawn bullets behind thin walls.
 */
export function checkMuzzleWallGuard(
  obsGrid: ObstacleGrid,
  ax: number,
  ay: number,
  mx: number,
  my: number,
  radius = 0,
  mode: RayMode = 'bullet',
): RayObstacleHit | null {
  return raycastObstacles(obsGrid, ax, ay, mx, my, radius, mode);
}

/**
 * Computes exact continuous entry fraction `t in [0, 1]` for a swept circle of
 * `radiusA` along `(x0, y0) -> (x1, y1)` against stationary circle `(cx, cy, radiusB)`.
 * Returns `-1` if no intersection occurs.
 */
export function sweepCircleSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusA: number,
  cx: number,
  cy: number,
  radiusB: number,
): number {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const R = radiusA + radiusB;
  const c = fx * fx + fy * fy - R * R;
  if (c <= 0) return 0;

  const dx = x1 - x0;
  const dy = y1 - y0;
  const a2 = dx * dx + dy * dy;
  if (a2 <= 1e-6) return -1;

  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a2 * c;
  if (disc < 0) return -1;

  const t = (-b - Math.sqrt(disc)) / (2 * a2);
  if (t >= 0 && t <= 1) return t;
  return -1;
}

/**
 * Queries swept segment `(x0, y0) -> (x1, y1)` with radius `br` against `actorGrid`.
 * Uses padded bbox query for segments `<= 128px` and padded DDA for longer beams.
 */
export function sweepSegmentActors(
  actorGrid: ActorGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  br: number,
  layerMask: number,
  team: number,
  out: RayActorHit[],
  options?: {
    hitIds?: ReadonlySet<number>;
    friendlyHeal?: boolean;
    sort?: boolean;
  },
): RayActorHit[] {
  out.length = 0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  const r = Math.max(0, br);

  if (lenSq <= 128 * 128) {
    const minX = (x0 < x1 ? x0 : x1) - r;
    const maxX = (x0 > x1 ? x0 : x1) + r;
    const minY = (y0 < y1 ? y0 : y1) - r;
    const maxY = (y0 > y1 ? y0 : y1) + r;
    actorGrid.queryAabb(minX, minY, maxX, maxY, layerMask, tmpSweepCandidates);
  } else {
    actorGrid.querySegmentCells(x0, y0, x1, y1, r, layerMask, tmpSweepCandidates);
  }

  const hitIds = options?.hitIds;
  const friendlyHeal = options?.friendlyHeal ?? false;

  for (let i = 0; i < tmpSweepCandidates.length; i++) {
    const a = tmpSweepCandidates[i];
    if (!a.alive) continue;
    if (!friendlyHeal && a.team === team) continue;
    if (hitIds && hitIds.has(a.id)) continue;

    const t = sweepCircleSegment(x0, y0, x1, y1, r, a.x, a.y, a.radius);
    if (t >= 0) {
      out.push({
        actor: a,
        t,
        x: x0 + dx * t,
        y: y0 + dy * t,
      });
    }
  }

  if ((options?.sort ?? true) && out.length > 1) {
    out.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.actor.id - b.actor.id));
  }
  return out;
}

/**
 * Advances a projectile over `dt` seconds with exact swept obstacle/actor checks
 * and up to `MAX_BOUNCES_PER_TICK` ricochets. Zero-allocation on non-piercing shots
 * when `out` is reused.
 */
export function stepSweptBullet(
  obsGrid: ObstacleGrid,
  actorGrid: ActorGrid,
  bullet: SweptBulletInput,
  dt: number,
  out?: SweepBulletResult,
): SweepBulletResult {
  const res: SweepBulletResult = out ?? {
    endX: bullet.x,
    endY: bullet.y,
    stopped: false,
    stoppedBy: 'none',
    actorHits: [],
    obstacleHits: [],
    bouncesUsed: 0,
  };
  res.actorHits.length = 0;
  res.obstacleHits.length = 0;
  res.stopped = false;
  res.stoppedBy = 'none';
  res.bouncesUsed = 0;
  res.endX = bullet.x;
  res.endY = bullet.y;

  if (!Number.isFinite(dt) || dt <= 0) {
    return res;
  }

  const br = Math.max(0, bullet.radius);
  const maxHits = Math.max(1, bullet.maxHits ?? 1);
  const layerMask =
    bullet.layerMask ?? (bullet.team === 0 ? LAYER_ENEMY | LAYER_PET : LAYER_PLAYER | LAYER_PET);
  const hitIds = bullet.hitIds;
  const friendlyHeal = bullet.friendlyHeal ?? false;

  let curX = bullet.x;
  let curY = bullet.y;
  let tBase = 0;
  let remFrac = 1;
  let bouncesLeft = Math.max(0, bullet.bouncesLeft ?? 0);
  const maxSegments = 1 + Math.min(MAX_BOUNCES_PER_TICK, bouncesLeft);

  for (let segIdx = 0; segIdx < maxSegments && remFrac > 1e-6; segIdx++) {
    const segDx = bullet.vx * dt * remFrac;
    const segDy = bullet.vy * dt * remFrac;
    const targetX = curX + segDx;
    const targetY = curY + segDy;

    const wallHit = raycastObstacles(obsGrid, curX, curY, targetX, targetY, br, 'bullet');
    const tWall = wallHit ? wallHit.t : 1;
    const ex = curX + segDx * tWall;
    const ey = curY + segDy * tWall;
    const truncDx = ex - curX;
    const truncDy = ey - curY;
    const truncLenSq = truncDx * truncDx + truncDy * truncDy;

    if (truncLenSq <= 128 * 128) {
      const minX = (curX < ex ? curX : ex) - br;
      const maxX = (curX > ex ? curX : ex) + br;
      const minY = (curY < ey ? curY : ey) - br;
      const maxY = (curY > ey ? curY : ey) + br;
      actorGrid.queryAabb(minX, minY, maxX, maxY, layerMask, tmpSweepCandidates);
    } else {
      actorGrid.querySegmentCells(curX, curY, ex, ey, br, layerMask, tmpSweepCandidates);
    }

    if (maxHits === 1) {
      let bestActor: SpatialActor | null = null;
      let bestEntryT = Infinity;

      for (let i = 0; i < tmpSweepCandidates.length; i++) {
        const a = tmpSweepCandidates[i];
        if (!a.alive) continue;
        if (!friendlyHeal && a.team === bullet.team) continue;
        if (hitIds && hitIds.has(a.id)) continue;

        const tEntry = sweepCircleSegment(curX, curY, ex, ey, br, a.x, a.y, a.radius);
        if (
          tEntry >= 0 &&
          (tEntry < bestEntryT || (tEntry === bestEntryT && bestActor !== null && a.id < bestActor.id))
        ) {
          bestEntryT = tEntry;
          bestActor = a;
        }
      }

      if (bestActor !== null) {
        const hitX = curX + truncDx * bestEntryT;
        const hitY = curY + truncDy * bestEntryT;
        const tTick = tBase + remFrac * (bestEntryT * tWall);
        res.actorHits.push({ actor: bestActor, t: tTick, x: hitX, y: hitY });
        if (hitIds) hitIds.add(bestActor.id);
        curX = hitX;
        curY = hitY;
        res.stopped = true;
        res.stoppedBy = 'actor';
        break;
      }
    } else {
      tmpSegHits.length = 0;
      for (let i = 0; i < tmpSweepCandidates.length; i++) {
        const a = tmpSweepCandidates[i];
        if (!a.alive) continue;
        if (!friendlyHeal && a.team === bullet.team) continue;
        if (hitIds && hitIds.has(a.id)) continue;

        const tEntry = sweepCircleSegment(curX, curY, ex, ey, br, a.x, a.y, a.radius);
        if (tEntry >= 0) {
          tmpSegHits.push({
            actor: a,
            t: tEntry,
            x: curX + truncDx * tEntry,
            y: curY + truncDy * tEntry,
          });
        }
      }

      if (tmpSegHits.length > 1) {
        tmpSegHits.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.actor.id - b.actor.id));
      }

      for (let i = 0; i < tmpSegHits.length; i++) {
        const h = tmpSegHits[i];
        res.actorHits.push({
          actor: h.actor,
          t: tBase + remFrac * (h.t * tWall),
          x: h.x,
          y: h.y,
        });
        if (hitIds) hitIds.add(h.actor.id);
        if (res.actorHits.length >= maxHits) {
          curX = h.x;
          curY = h.y;
          res.stopped = true;
          res.stoppedBy = 'actor';
          break;
        }
      }

      if (res.stopped) break;
    }

    // No actor stopped the projectile before `tWall`
    if (wallHit && tWall < 1) {
      res.obstacleHits.push({
        t: tBase + remFrac * tWall,
        x: wallHit.x,
        y: wallHit.y,
        nx: wallHit.nx,
        ny: wallHit.ny,
        obstacle: wallHit.obstacle,
        bounceIndex: res.bouncesUsed,
      });

      if (bouncesLeft > 0 && res.bouncesUsed < MAX_BOUNCES_PER_TICK) {
        const vn = bullet.vx * wallHit.nx + bullet.vy * wallHit.ny;
        if (vn < 0) {
          bullet.vx -= 2 * vn * wallHit.nx;
          bullet.vy -= 2 * vn * wallHit.ny;
        }
        curX = wallHit.x + wallHit.nx * 0.5;
        curY = wallHit.y + wallHit.ny * 0.5;
        bouncesLeft -= 1;
        res.bouncesUsed += 1;
        tBase += remFrac * tWall;
        remFrac *= 1 - tWall;
        continue;
      }

      curX = wallHit.x;
      curY = wallHit.y;
      res.stopped = true;
      res.stoppedBy = 'obstacle';
      break;
    }

    curX = ex;
    curY = ey;
    break;
  }

  bullet.x = curX;
  bullet.y = curY;
  if (bullet.bouncesLeft !== undefined) {
    bullet.bouncesLeft = bouncesLeft;
  }
  res.endX = curX;
  res.endY = curY;
  return res;
}

// ============================================================================
// 8. AoE Line-of-Sight Queries & Geometric Helpers (d05, d37)
// ============================================================================

/**
 * Queries actors inside AoE blast `(cx, cy, radius)` passing LOS cover occlusion.
 * Heavy/boss actors (`radius >= 28`) probe lateral `+-0.6 * radius` offsets so tiny
 * cover corners cannot cheese-block boss hits.
 */
export function queryAoeTargets(
  actorGrid: ActorGrid,
  obsGrid: ObstacleGrid,
  cx: number,
  cy: number,
  radius: number,
  losMode: AoeLosMode,
  layerMask: number,
  out: AoeTarget[],
): AoeTarget[] {
  out.length = 0;
  if (radius <= 0 || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius)) {
    return out;
  }

  actorGrid.queryCircle(cx, cy, radius, layerMask, tmpAoeCandidates);

  for (let i = 0; i < tmpAoeCandidates.length; i++) {
    const a = tmpAoeCandidates[i];
    const dx = a.x - cx;
    const dy = a.y - cy;
    const centerDist = Math.hypot(dx, dy);

    if (losMode !== 'none') {
      let visible = hasLineOfSight(obsGrid, cx, cy, a.x, a.y, losMode);
      if (!visible && a.radius >= 28) {
        const off = 0.6 * a.radius;
        let px = 1;
        let py = 0;
        if (centerDist > 1e-6) {
          px = -dy / centerDist;
          py = dx / centerDist;
        }
        visible =
          hasLineOfSight(obsGrid, cx, cy, a.x + px * off, a.y + py * off, losMode) ||
          hasLineOfSight(obsGrid, cx, cy, a.x - px * off, a.y - py * off, losMode);
      }
      if (!visible) continue;
    }

    const edgeDist = Math.max(0, centerDist - a.radius);
    const falloff = clamp(1 - edgeDist / radius, AOE_MIN_FALLOFF, 1);
    out.push({ actor: a, edgeDist, falloff });
  }

  return out;
}

/**
 * Queries destructible obstacles (`crate` / `barrel` / `cactus`) within AoE blast
 * `(cx, cy, radius)` whose centers pass LOS checks against `losMode` blockers.
 */
export function queryAoeObstacles(
  obsGrid: ObstacleGrid,
  cx: number,
  cy: number,
  radius: number,
  losMode: AoeLosMode,
  out: AoeObstacleTarget[],
): AoeObstacleTarget[] {
  out.length = 0;
  if (radius <= 0 || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius)) {
    return out;
  }

  obsGrid.queryAabb(cx - radius, cy - radius, cx + radius, cy + radius, tmpAoeObs);
  const r2 = radius * radius;

  for (let i = 0; i < tmpAoeObs.length; i++) {
    const o = tmpAoeObs[i];
    if (!o.alive || !o.destructible) continue;

    const qx = clamp(cx, o.x, o.x + o.w);
    const qy = clamp(cy, o.y, o.y + o.h);
    const dx = cx - qx;
    const dy = cy - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;

    if (losMode !== 'none' && d2 > 0) {
      const tx = o.x + o.w * 0.5;
      const ty = o.y + o.h * 0.5;
      if (!hasLineOfSight(obsGrid, cx, cy, tx, ty, losMode)) continue;
    }

    const edgeDist = Math.sqrt(d2);
    const falloff = clamp(1 - edgeDist / radius, AOE_MIN_FALLOFF, 1);
    out.push({ obstacle: o, edgeDist, falloff });
  }

  return out;
}

/**
 * Convenience wrapper for `actorGrid.queryEnemies(...)`.
 */
export function queryEnemies(
  actorGrid: ActorGrid,
  x: number,
  y: number,
  r: number,
  outIds: Int32Array | number[],
  maxCount = outIds.length,
  excludeId = -1,
): number {
  return actorGrid.queryEnemies(x, y, r, outIds, maxCount, excludeId);
}

/** Squared Euclidean distance from point `(px, py)` to segment `(x0, y0) -> (x1, y1)`. */
export function distPointToSegmentSq(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-12) {
    const dx = px - x0;
    const dy = py - y0;
    return dx * dx + dy * dy;
  }
  const t = clamp(((px - x0) * vx + (py - y0) * vy) / lenSq, 0, 1);
  const projX = x0 + vx * t;
  const projY = y0 + vy * t;
  const dx = px - projX;
  const dy = py - projY;
  return dx * dx + dy * dy;
}

/** Squared Euclidean distance from point `(cx, cy)` to obstacle AABB `[o.x, o.x+o.w] x [o.y, o.y+o.h]`. */
export function distCircleToAabbSq(
  cx: number,
  cy: number,
  o: Pick<ArenaObstacle, 'x' | 'y' | 'w' | 'h'>,
): number {
  const qx = clamp(cx, o.x, o.x + o.w);
  const qy = clamp(cy, o.y, o.y + o.h);
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy;
}
