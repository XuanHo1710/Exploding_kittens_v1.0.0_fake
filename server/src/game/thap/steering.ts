/**
 * Lưới không gian (SpatialGrid) và hệ thống di chuyển làn ngang Miragine War cổ điển:
 * xuất quân từ Cổng Triệu Hồi (door.png), tìm mục tiêu, tách va chạm mềm, né Trụ Pha Lê.
 */

import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTAL_HALF_W,
  THAP_CRYSTALS,
  THAP_LANE_Y_MAX,
  THAP_LANE_Y_MIN,
  THAP_SPAWN_X,
  THAP_UNITS,
} from '../../../../shared/src';
import { enemyOf, isUnitInPlay, type HitTarget, type SimWorldState, type Unit } from './types';

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
const GOLDEN_ANGLE = 2.399963229728653;
const MAX_UNIT_RADIUS = 16;
const SPAWN_X_JITTER = 10;
const SPAWN_Y_MARGIN = 15;
const SPAWN_Y_JITTER = 8;
const ARENA_X_MARGIN = 24;
const DEFAULT_CELL_SIZE = 80;

const targetQueryScratch: Unit[] = [];
const sepQueryScratch: Unit[] = [];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Lưới băm không gian phẳng 1D (kích thước ô mặc định 80px) để truy vấn lính lân cận nhanh,
 * hạn chế cấp phát mảng rác trong vòng lặp 30 FPS.
 */
export class SpatialGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly buckets: Unit[][];
  private readonly dirtyIndices: number[] = [];

  constructor(mapW = THAP_ARENA_W, mapH = THAP_ARENA_H, cellSize = DEFAULT_CELL_SIZE) {
    this.cellSize = Math.max(1, cellSize);
    this.cols = Math.max(1, Math.ceil(mapW / this.cellSize));
    this.rows = Math.max(1, Math.ceil(mapH / this.cellSize));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  /** Xóa toàn bộ đơn vị khỏi lưới mà không giải phóng mảng bucket đã cấp phát. */
  clear(): void {
    for (let i = 0; i < this.dirtyIndices.length; i++) {
      this.buckets[this.dirtyIndices[i]].length = 0;
    }
    this.dirtyIndices.length = 0;
  }

  /** Chèn một đơn vị còn sống vào ô lưới tương ứng với vị trí hiện tại. */
  insert(unit: Unit): void {
    if (!isUnitInPlay(unit)) return;
    const cx = clamp(Math.floor(unit.x / this.cellSize), 0, this.cols - 1);
    const cy = clamp(Math.floor(unit.y / this.cellSize), 0, this.rows - 1);
    const idx = cy * this.cols + cx;
    const bucket = this.buckets[idx];
    if (bucket.length === 0) {
      this.dirtyIndices.push(idx);
    }
    bucket.push(unit);
  }

  /**
   * Truy vấn các đơn vị còn sống có tâm nằm trong bán kính `radius` quanh `(x, y)`.
   * Nếu truyền `out`, mảng `out` sẽ được làm rỗng trước khi ghi kết quả và trả về lại.
   */
  query(x: number, y: number, radius: number, out: Unit[] = []): Unit[] {
    out.length = 0;
    const r = Math.max(0, radius);
    const r2 = r * r;
    const x0 = clamp(Math.floor((x - r) / this.cellSize), 0, this.cols - 1);
    const x1 = clamp(Math.floor((x + r) / this.cellSize), 0, this.cols - 1);
    const y0 = clamp(Math.floor((y - r) / this.cellSize), 0, this.rows - 1);
    const y1 = clamp(Math.floor((y + r) / this.cellSize), 0, this.rows - 1);

    for (let cy = y0; cy <= y1; cy++) {
      const rowOffset = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets[rowOffset + cx];
        for (let i = 0; i < bucket.length; i++) {
          const u = bucket[i];
          if (!isUnitInPlay(u)) continue;
          const dx = u.x - x;
          const dy = u.y - y;
          if (dx * dx + dy * dy <= r2) {
            out.push(u);
          }
        }
      }
    }
    return out;
  }
}

/**
 * Tính vị trí xuất quân tại Cổng Triệu Hồi (`door.png`) cho phe `idx`:
 * `x` quanh `THAP_SPAWN_X[idx]` ±10px, `y` trải đều theo chuỗi tỷ lệ vàng trên `order`
 * trong khoảng `[THAP_LANE_Y_MIN + 15, THAP_LANE_Y_MAX - 15]` kèm nhiễu nhỏ.
 */
export function doorSpawnPos(
  idx: number,
  order: number,
  rng: () => number = Math.random,
): { x: number; y: number } {
  const baseX = THAP_SPAWN_X[idx] ?? THAP_SPAWN_X[0];
  const x = clamp(
    baseX + (rng() * 2 - 1) * SPAWN_X_JITTER,
    ARENA_X_MARGIN,
    THAP_ARENA_W - ARENA_X_MARGIN,
  );
  const yMin = THAP_LANE_Y_MIN + SPAWN_Y_MARGIN;
  const yMax = THAP_LANE_Y_MAX - SPAWN_Y_MARGIN;
  const frac = (((0.5 + order * GOLDEN_RATIO_CONJUGATE) % 1) + 1) % 1;
  const baseY = yMin + frac * (yMax - yMin);
  const y = clamp(baseY + (rng() * 2 - 1) * SPAWN_Y_JITTER, yMin, yMax);
  return { x, y };
}

/**
 * Khoảng cách từ điểm `(x, y)` đến rìa vòng tròn va chạm của Pha Lê phe `crystalOwner`
 * (bán kính `THAP_CRYSTAL_HALF_W = 48`).
 */
export function crystalEdgeDistance(x: number, y: number, crystalOwner: number): number {
  const crystal = THAP_CRYSTALS[crystalOwner];
  if (!crystal) return Infinity;
  return Math.max(0, Math.hypot(x - crystal[0], y - crystal[1]) - THAP_CRYSTAL_HALF_W);
}

/** Khoảng cách mép-tới-mép giữa hai đơn vị lính (`>= 0`). */
export function unitEdgeDistance(a: Unit, b: Unit): number {
  return Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius);
}

function findNearestEnemyInRange(
  u: Unit,
  grid: SpatialGrid,
  engageRange: number,
): { unit: Unit; dist: number } | null {
  const candidates = grid.query(u.x, u.y, engageRange + u.radius + MAX_UNIT_RADIUS + 4, targetQueryScratch);
  let bestUnit: Unit | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const other = candidates[i];
    if (other.owner === u.owner || !isUnitInPlay(other)) continue;
    const dist = unitEdgeDistance(u, other);
    if (dist > engageRange) continue;
    if (dist < bestDist || (dist === bestDist && bestUnit && other.id < bestUnit.id)) {
      bestDist = dist;
      bestUnit = other;
    }
  }

  return bestUnit ? { unit: bestUnit, dist: bestDist } : null;
}

/**
 * Tìm mục tiêu ưu tiên cho lính `u`:
 * - Nếu có lính địch trong tầm đánh `stats.range`, ưu tiên lính địch gần nhất.
 * - Ngược lại nếu Pha Lê địch đã nằm trong tầm đánh, ưu tiên đánh Pha Lê (tránh bỏ trụ đuổi lính sau trụ).
 * - Nếu chưa có gì trong tầm đánh, truy đuổi lính địch gần nhất trong `engageRange` hoặc tiến tới Pha Lê địch.
 */
export function findTargetForUnit(u: Unit, world: SimWorldState, grid: SpatialGrid): HitTarget | null {
  if (!isUnitInPlay(u)) return null;
  const stats = THAP_UNITS[u.kind];
  const engageRange = Math.max(220, stats.range + 90);
  const enemyIdx = enemyOf(u.owner);
  const enemySide = world.sides[enemyIdx];
  const baseAlive = Boolean(enemySide && enemySide.alive && enemySide.baseHp > 0);
  const baseDist = baseAlive
    ? Math.max(0, crystalEdgeDistance(u.x, u.y, enemyIdx) - u.radius)
    : Infinity;

  const nearestEnemy = findNearestEnemyInRange(u, grid, engageRange);
  if (nearestEnemy && nearestEnemy.dist <= stats.range) {
    return { kind: 'unit', unit: nearestEnemy.unit, dist: nearestEnemy.dist };
  }
  if (baseAlive && baseDist <= stats.range) {
    return { kind: 'base', owner: enemyIdx, dist: baseDist };
  }
  if (nearestEnemy) {
    return { kind: 'unit', unit: nearestEnemy.unit, dist: nearestEnemy.dist };
  }
  if (baseAlive) {
    return { kind: 'base', owner: enemyIdx, dist: baseDist };
  }
  return null;
}

/**
 * Đẩy lính `u` ra khỏi phạm vi va chạm cứng của cả hai Trụ Pha Lê (`THAP_CRYSTAL_HALF_W + u.radius`)
 * để lính không đi xuyên qua `A_crystal` / `B_crystal`.
 */
export function resolveCrystalOverlap(u: Unit): void {
  const minDist = THAP_CRYSTAL_HALF_W + u.radius;
  const minDist2 = minDist * minDist;

  for (let i = 0; i < THAP_CRYSTALS.length; i++) {
    const [cx, cy] = THAP_CRYSTALS[i];
    const dx = u.x - cx;
    const dy = u.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist2) continue;

    if (d2 < 1e-6) {
      const signY = u.spawnedOrder % 2 === 0 ? -1 : 1;
      u.x = cx;
      u.y = cy + signY * minDist;
    } else {
      const d = Math.sqrt(d2);
      u.x = cx + (dx / d) * minDist;
      u.y = cy + (dy / d) * minDist;
    }
  }
}

function targetCenterX(target: HitTarget): number {
  return target.kind === 'unit' ? target.unit.x : (THAP_CRYSTALS[target.owner]?.[0] ?? THAP_CRYSTALS[0][0]);
}

function computeCrystalAvoidanceY(
  u: Unit,
  dirX: number,
  dirY: number,
  target: HitTarget | null,
): number {
  let avoidY = 0;
  const clear = THAP_CRYSTAL_HALF_W + u.radius + 10;
  const look = clear + 42;

  for (let i = 0; i < THAP_CRYSTALS.length; i++) {
    // Không né Pha Lê nếu bản thân Pha Lê đó chính là mục tiêu đang hành quân tới.
    if (target?.kind === 'base' && target.owner === i) continue;
    const [cx, cy] = THAP_CRYSTALS[i];
    const rx = cx - u.x;
    const ry = cy - u.y;
    const along = rx * dirX + ry * dirY;
    if (along <= -u.radius || along >= look) continue;

    const offY = u.y - cy;
    if (Math.abs(offY) >= clear) continue;
    const side = offY < 0 ? -1 : offY > 0 ? 1 : u.spawnedOrder % 2 === 0 ? -1 : 1;
    const weight = (1 - Math.abs(offY) / clear) * 1.8;
    avoidY += side * weight;
  }

  return avoidY;
}

function computeSeparation(
  u: Unit,
  grid: SpatialGrid,
): { sepX: number; sepY: number; nudgeX: number; nudgeY: number } {
  const queryRadius = u.radius + MAX_UNIT_RADIUS + 4;
  const neighbors = grid.query(u.x, u.y, queryRadius, sepQueryScratch);
  let sepX = 0;
  let sepY = 0;
  let nudgeX = 0;
  let nudgeY = 0;

  for (let i = 0; i < neighbors.length; i++) {
    const other = neighbors[i];
    if (other.id === u.id || !isUnitInPlay(other)) continue;

    const minSep = u.radius + other.radius + 4;
    const dx = u.x - other.x;
    const dy = u.y - other.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minSep * minSep) continue;

    let nx: number;
    let ny: number;
    let d: number;
    if (d2 < 1e-4) {
      const sign = u.id < other.id ? -1 : 1;
      const angle = (Math.min(u.id, other.id) * GOLDEN_ANGLE) % (Math.PI * 2);
      nx = Math.cos(angle) * sign;
      ny = Math.sin(angle) * sign;
      d = 0;
    } else {
      d = Math.sqrt(d2);
      nx = dx / d;
      ny = dy / d;
    }

    const overlapRatio = (minSep - d) / minSep;
    sepX += nx * overlapRatio;
    // Khi hai lính thẳng hàng ngang, thêm độ lệch dọc nhỏ để tự lách đội hình thay vì dồn một điểm.
    const lateralSlide = Math.abs(dy) < 1 ? (u.id < other.id ? -1 : 1) * 0.35 * overlapRatio : 0;
    sepY += ny * overlapRatio + lateralSlide;

    nudgeX += nx * overlapRatio * 0.6;
    nudgeY += ny * overlapRatio * 0.6;
  }

  const sepLen = Math.hypot(sepX, sepY);
  if (sepLen > 1.2) {
    const scale = 1.2 / sepLen;
    sepX *= scale;
    sepY *= scale;
  }

  const nudgeLen = Math.hypot(nudgeX, nudgeY);
  if (nudgeLen > 2.5) {
    const scale = 2.5 / nudgeLen;
    nudgeX *= scale;
    nudgeY *= scale;
  }

  return { sepX, sepY, nudgeX, nudgeY };
}

function updateFacing(u: Unit, vx: number, fallbackLeft: boolean): void {
  if (vx < -0.5) {
    u.left = true;
  } else if (vx > 0.5) {
    u.left = false;
  } else {
    u.left = fallbackLeft;
  }
}

function haltUnit(u: Unit, faceLeft: boolean): void {
  u.vx = 0;
  u.vy = 0;
  u.moving = false;
  u.left = faceLeft;
}

/**
 * Cập nhật bước di chuyển của một đơn vị lính trên làn ngang Miragine War.
 *
 * Hợp đồng với `world.ts` / `combat.ts`:
 * - Hàm tự động đứng yên (`vx = 0, vy = 0, moving = false`) nếu lính đã chết, đang đóng băng trong
 *   windup/đòn đánh (`u.attacking` hoặc `u.windupLeft > 0`), hoặc `target` đã ở trong tầm đánh (`dist <= range`).
 * - `world.ts` / `combat.ts` chịu trách nhiệm điều phối trạng thái công kích (`attacking`, `windupLeft`, `cd`)
 *   và quyết định thời điểm gọi hàm khi lính cần hành quân.
 */
export function stepUnitMovement(
  u: Unit,
  target: HitTarget | null,
  world: SimWorldState,
  grid: SpatialGrid,
  dt: number,
): void {
  const enemyIdx = enemyOf(u.owner);
  const defaultLeft = enemyIdx === 0;

  if (!isUnitInPlay(u) || !Number.isFinite(dt) || dt <= 0) {
    haltUnit(u, u.left);
    return;
  }

  if (u.attacking || u.windupLeft > 0) {
    haltUnit(u, target ? targetCenterX(target) < u.x : u.left);
    return;
  }

  const stats = THAP_UNITS[u.kind];
  if (target && target.dist <= stats.range) {
    const tx = targetCenterX(target);
    const faceLeft = tx < u.x ? true : tx > u.x ? false : defaultLeft;
    haltUnit(u, faceLeft);
    resolveCrystalOverlap(u);
    u.x = clamp(u.x, ARENA_X_MARGIN, THAP_ARENA_W - ARENA_X_MARGIN);
    u.y = clamp(u.y, THAP_LANE_Y_MIN, THAP_LANE_Y_MAX);
    return;
  }

  let goalX: number;
  let goalY: number;
  let activeTarget: HitTarget | null = target;

  if (activeTarget?.kind === 'unit') {
    goalX = activeTarget.unit.x;
    goalY = activeTarget.unit.y;
  } else {
    const engageRange = Math.max(220, stats.range + 90);
    const nearbyEnemy = activeTarget === null ? findNearestEnemyInRange(u, grid, engageRange) : null;
    if (nearbyEnemy) {
      activeTarget = { kind: 'unit', unit: nearbyEnemy.unit, dist: nearbyEnemy.dist };
      goalX = nearbyEnemy.unit.x;
      goalY = nearbyEnemy.unit.y;
    } else {
      const enemySide = world.sides[enemyIdx];
      const crystal = THAP_CRYSTALS[enemyIdx];
      if (!crystal || (!activeTarget && (!enemySide || !enemySide.alive || enemySide.baseHp <= 0))) {
        haltUnit(u, defaultLeft);
        return;
      }
      goalX = crystal[0];
      goalY = u.y * 0.65 + crystal[1] * 0.35;
    }
  }

  const toGoalX = goalX - u.x;
  const toGoalY = goalY - u.y;
  const goalDist = Math.hypot(toGoalX, toGoalY);
  const dirX = goalDist > 1e-4 ? toGoalX / goalDist : 0;
  const dirY = goalDist > 1e-4 ? toGoalY / goalDist : 0;

  const avoidY = computeCrystalAvoidanceY(u, dirX, dirY, activeTarget);
  const { sepX, sepY, nudgeX, nudgeY } = computeSeparation(u, grid);

  // Giữ trọng số tách ngang nhỏ hơn 1 để lực tách không làm lính đang tiến bị giật quay mặt ngược lại.
  const steerX = dirX + sepX * 0.75;
  const steerY = dirY + avoidY + sepY * 1.35;
  const steerLen = Math.hypot(steerX, steerY);

  if (steerLen > 1e-4) {
    u.vx = (steerX / steerLen) * stats.speed;
    u.vy = (steerY / steerLen) * stats.speed;
  } else {
    u.vx = 0;
    u.vy = 0;
  }

  u.x += u.vx * dt + nudgeX;
  u.y += u.vy * dt + nudgeY;
  resolveCrystalOverlap(u);
  u.x = clamp(u.x, ARENA_X_MARGIN, THAP_ARENA_W - ARENA_X_MARGIN);
  u.y = clamp(u.y, THAP_LANE_Y_MIN, THAP_LANE_Y_MAX);

  updateFacing(u, u.vx, defaultLeft);
  u.moving = Math.hypot(u.vx, u.vy) > 0.5;
}
