/**
 * Hệ thống chiến đấu 30 FPS khớp chuẩn Miragine War gốc:
 * - `delayAttack` windup + khóa/hủy mục tiêu khi mục tiêu chết trước khi ra đòn
 * - Công thức sát thương Method 493 (`damage[armorTypeID] - armor`, tối thiểu 1)
 * - Đạn phép tầm xa (`fb`, `tb`, `storm`) và sát thương lan 50% (`Mage` 45px, `Vampire` 38px)
 */

import {
  THAP_CRYSTAL_HALF_W,
  THAP_CRYSTALS,
  THAP_SHOT_FB,
  THAP_SHOT_STORM,
  THAP_SHOT_TB,
  THAP_SPLASH_FACTOR,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  encodeUnitDeath,
  miragineCrystalDamage,
  miragineDamage,
  type ThapUnitStats,
} from '../../../../shared/src';
import { crystalEdgeDistance, findTargetForUnit, unitEdgeDistance, type SpatialGrid } from './steering';
import { isUnitInPlay, type HitTarget, type SimWorldState, type Unit } from './types';

const WINDUP_RETARGET_SLACK = 16;
const STORM_TRAVEL_MS = 380;
const SHOT_TRAVEL_MIN_MS = 120;
const SHOT_TRAVEL_MAX_MS = 320;
const SHOT_ORIGIN_Y_OFFSET = 22;
const SHOT_UNIT_TARGET_Y_OFFSET = 16;
const SHOT_CRYSTAL_TARGET_Y_OFFSET = 48;

const splashQueryScratch: Unit[] = [];

/** Callback xử lý sát thương lên Trụ Pha Lê (tiêm từ `structures.ts` để tránh phụ thuộc vòng). */
export type CrystalHitCallback = (attackerIdx: number, targetIdx: number, dmg: number) => void;

function encodeShotKind(wss: 'fb' | 'tb' | 'storm'): number {
  switch (wss) {
    case 'fb':
      return THAP_SHOT_FB;
    case 'tb':
      return THAP_SHOT_TB;
    case 'storm':
      return THAP_SHOT_STORM;
  }
}

function computeTravelMs(
  wss: 'fb' | 'tb' | 'storm',
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (wss === 'storm') return STORM_TRAVEL_MS;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  return Math.round(Math.min(SHOT_TRAVEL_MAX_MS, Math.max(SHOT_TRAVEL_MIN_MS, 120 + dist * 0.6)));
}

function getTargetX(target: HitTarget): number {
  if (target.kind === 'unit') return target.unit.x;
  return THAP_CRYSTALS[target.owner]?.[0] ?? THAP_CRYSTALS[0][0];
}

function lockWindupTarget(u: Unit, target: HitTarget): void {
  if (target.kind === 'unit') {
    u.windupTargetId = target.unit.id;
    u.windupTargetBase = -1;
    return;
  }
  u.windupTargetId = 0;
  u.windupTargetBase = target.owner;
}

function clearWindupLock(u: Unit): void {
  u.windupTargetId = 0;
  u.windupTargetBase = -1;
}

function buildLiveUnitMap(units: Unit[]): Map<number, Unit> {
  const unitById = new Map<number, Unit>();
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (isUnitInPlay(unit)) {
      unitById.set(unit.id, unit);
    }
  }
  return unitById;
}

function resolveLockedTarget(
  u: Unit,
  world: SimWorldState,
  unitById: Map<number, Unit>,
): HitTarget | null {
  if (u.windupTargetId > 0) {
    const locked = unitById.get(u.windupTargetId);
    if (locked && isUnitInPlay(locked) && locked.owner !== u.owner) {
      return { kind: 'unit', unit: locked, dist: unitEdgeDistance(u, locked) };
    }
    return null;
  }

  if (u.windupTargetBase >= 0) {
    const side = world.sides[u.windupTargetBase];
    if (side && side.alive && side.baseHp > 0 && side.idx !== u.owner) {
      const dist = Math.max(0, crystalEdgeDistance(u.x, u.y, u.windupTargetBase) - u.radius);
      return { kind: 'base', owner: u.windupTargetBase, dist };
    }
    return null;
  }

  return null;
}

/**
 * Gây sát thương trực tiếp lên một đơn vị lính `victim` và ghi nhận thống kê/sự kiện chết nếu hạ gục.
 * Không cộng vàng thưởng khi hạ gục theo đúng luật gốc Miragine War.
 * Trả về `true` nếu `victim` chết sau đòn đánh.
 */
export function applyDamageToUnit(
  world: SimWorldState,
  attackerIdx: number,
  victim: Unit,
  amount: number,
): boolean {
  if (!isUnitInPlay(victim) || !Number.isFinite(amount) || amount <= 0 || victim.owner === attackerIdx) {
    return false;
  }

  victim.hp -= amount;
  if (victim.hp <= 0) {
    victim.hp = 0;

    const attackerSide = world.sides[attackerIdx];
    if (attackerSide) {
      attackerSide.kills += 1;
      attackerSide.killsValue += THAP_UNITS[victim.kind].cost;
    }

    const victimSide = world.sides[victim.owner];
    if (victimSide) {
      victimSide.lost += 1;
    }

    world.pendingDeaths.push(
      Math.round(victim.x),
      Math.round(victim.y),
      encodeUnitDeath(THAP_UNIT_KINDS.indexOf(victim.kind), victim.owner, victim.left),
    );
    return true;
  }

  return false;
}

function applySplashDamage(
  attacker: Unit,
  impactX: number,
  impactY: number,
  radius: number,
  primaryTargetId: number,
  world: SimWorldState,
  grid: SpatialGrid,
): void {
  const candidates = grid.query(impactX, impactY, radius, splashQueryScratch);
  for (let i = 0; i < candidates.length; i++) {
    const other = candidates[i];
    if (other.owner === attacker.owner || other.id === primaryTargetId || !isUnitInPlay(other)) {
      continue;
    }
    const splashDmg = Math.max(1, Math.round(miragineDamage(attacker.kind, other.kind) * THAP_SPLASH_FACTOR));
    applyDamageToUnit(world, attacker.owner, other, splashDmg);
  }
}

function executeAttack(
  u: Unit,
  target: HitTarget,
  world: SimWorldState,
  grid: SpatialGrid,
  onCrystalHit?: CrystalHitCallback,
): void {
  const stats = THAP_UNITS[u.kind];

  if (target.kind === 'unit') {
    const impactX = target.unit.x;
    const impactY = target.unit.y;
    const targetId = target.unit.id;
    const primaryDmg = miragineDamage(u.kind, target.unit.kind);
    applyDamageToUnit(world, u.owner, target.unit, primaryDmg);

    if (stats.wss) {
      const x1 = Math.round(u.x);
      const y1 = Math.round(u.y - SHOT_ORIGIN_Y_OFFSET);
      const x2 = Math.round(impactX);
      const y2 = Math.round(impactY - SHOT_UNIT_TARGET_Y_OFFSET);
      const shotCode = encodeShotKind(stats.wss);
      const travelMs = computeTravelMs(stats.wss, x1, y1, x2, y2);
      world.pendingShots.push(x1, y1, x2, y2, shotCode, targetId, travelMs);
    }

    if (stats.splash && stats.splash > 0) {
      applySplashDamage(u, impactX, impactY, stats.splash, targetId, world, grid);
    }
    return;
  }

  const crystalDmg = miragineCrystalDamage(u.kind);
  onCrystalHit?.(u.owner, target.owner, crystalDmg);

  const crystal = THAP_CRYSTALS[target.owner];
  if (!crystal) return;
  const [cx, cy] = crystal;

  if (stats.wss) {
    const x1 = Math.round(u.x);
    const y1 = Math.round(u.y - SHOT_ORIGIN_Y_OFFSET);
    const x2 = Math.round(cx);
    const y2 = Math.round(cy - SHOT_CRYSTAL_TARGET_Y_OFFSET);
    const shotCode = encodeShotKind(stats.wss);
    const travelMs = computeTravelMs(stats.wss, x1, y1, x2, y2);
    world.pendingShots.push(x1, y1, x2, y2, shotCode, 0, travelMs);
  }

  if (stats.splash && stats.splash > 0) {
    const dx = u.x - cx;
    const dy = u.y - cy;
    const d = Math.hypot(dx, dy);
    const impactX = d > 1e-4 ? cx + (dx / d) * THAP_CRYSTAL_HALF_W : cx;
    const impactY = d > 1e-4 ? cy + (dy / d) * THAP_CRYSTAL_HALF_W : cy;
    applySplashDamage(u, impactX, impactY, stats.splash, 0, world, grid);
  }
}

function stepUnitWindup(
  u: Unit,
  stats: ThapUnitStats,
  world: SimWorldState,
  grid: SpatialGrid,
  unitById: Map<number, Unit>,
  onCrystalHit?: CrystalHitCallback,
): void {
  u.windupLeft -= 1;

  let resolvedTarget = resolveLockedTarget(u, world, unitById);
  if (!resolvedTarget) {
    const retarget = findTargetForUnit(u, world, grid);
    if (!retarget || retarget.dist > stats.range + WINDUP_RETARGET_SLACK) {
      clearWindupLock(u);
      u.windupLeft = 0;
      u.attacking = false;
      return;
    }
    resolvedTarget = retarget;
    lockWindupTarget(u, retarget);
  }

  u.left = getTargetX(resolvedTarget) < u.x;
  u.attacking = true;

  if (u.windupLeft === 0) {
    executeAttack(u, resolvedTarget, world, grid, onCrystalHit);
    u.cd = stats.weaponFrames;
    clearWindupLock(u);
  }
}

function stepUnitCombatReady(
  u: Unit,
  stats: ThapUnitStats,
  world: SimWorldState,
  grid: SpatialGrid,
  onCrystalHit?: CrystalHitCallback,
): void {
  const target = findTargetForUnit(u, world, grid);
  const inRange = target !== null && target.dist <= stats.range;

  if (!inRange || !target) {
    u.attacking = false;
    return;
  }

  u.left = getTargetX(target) < u.x;

  if (u.cd === 0) {
    u.atkStartPending = true;
    u.atkAt = world.simTick;
    u.attacking = true;

    if (stats.delayAttack > 0) {
      u.windupLeft = stats.delayAttack;
      lockWindupTarget(u, target);
      return;
    }

    executeAttack(u, target, world, grid, onCrystalHit);
    u.cd = stats.weaponFrames;
    return;
  }

  const swingRecoveryEnd = Math.max(0, stats.weaponFrames - Math.max(4, stats.delayAttack + 4));
  u.attacking = u.cd > swingRecoveryEnd;
}

/**
 * Cập nhật một khung hình chiến đấu 30 FPS cho toàn bộ đơn vị còn sống trên đấu trường.
 */
export function stepCombat(
  world: SimWorldState,
  grid: SpatialGrid,
  onCrystalHit?: CrystalHitCallback,
): void {
  const unitById = buildLiveUnitMap(world.units);

  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (!isUnitInPlay(u)) continue;

    u.cd = Math.max(0, u.cd - 1);
    const stats = THAP_UNITS[u.kind];

    if (u.windupLeft > 0) {
      stepUnitWindup(u, stats, world, grid, unitById, onCrystalHit);
      continue;
    }

    stepUnitCombatReady(u, stats, world, grid, onCrystalHit);
  }
}
