/**
 * Hệ thống phòng thủ và phá hủy Trụ Pha Lê Chính (`A_crystal` / `B_crystal`)
 * theo đúng thông số Miragine War (`mapping.json`): tầm bắn 600px, sát thương [100, 100],
 * hồi chiêu 30 khung hình (1.0s ở 30Hz).
 */

import {
  THAP_BASE,
  THAP_CRYSTALS,
  THAP_CRYSTAL_PROJECTILE,
  THAP_SHOT_CRYSTAL_FLAG,
  THAP_SHOT_FB,
  THAP_SHOT_TB,
  THAP_UNITS,
} from '../../../../shared/src';
import type { SpatialGrid } from './steering';
import { isUnitInPlay, type SimWorldState, type Unit } from './types';

const CRYSTAL_TIP_OFFSET_Y = 72;
const TARGET_HIT_OFFSET_Y = 16;
const CRYSTAL_QUERY_PADDING = 60;
const MIN_SHOT_TRAVEL_MS = 120;
const MAX_SHOT_TRAVEL_MS = 280;
const SHOT_TRAVEL_MS_PER_PX = 0.45;

const CRYSTAL_SHOT_TYPE: Record<(typeof THAP_CRYSTAL_PROJECTILE)[number], number> = {
  fb: THAP_SHOT_FB | THAP_SHOT_CRYSTAL_FLAG,
  tb: THAP_SHOT_TB | THAP_SHOT_CRYSTAL_FLAG,
};

const crystalQueryScratch: Unit[] = [];

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function crystalShotType(sideIdx: number): number {
  const proj = THAP_CRYSTAL_PROJECTILE[sideIdx] ?? THAP_CRYSTAL_PROJECTILE[0];
  return CRYSTAL_SHOT_TYPE[proj];
}

function computeCrystalDamage(target: Unit): number {
  const stats = THAP_UNITS[target.kind];
  return Math.max(1, THAP_BASE.damage[stats.armorTypeID] - stats.armor);
}

function findCrystalTarget(
  sideIdx: number,
  cx: number,
  cy: number,
  grid: SpatialGrid,
): { unit: Unit; dist: number } | null {
  const candidates = grid.query(cx, cy, THAP_BASE.range + CRYSTAL_QUERY_PADDING, crystalQueryScratch);
  let bestUnit: Unit | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i];
    if (u.owner === sideIdx || !isUnitInPlay(u)) continue;
    const dist = Math.hypot(u.x - cx, u.y - cy);
    if (dist > THAP_BASE.range + u.radius) continue;
    if (dist < bestDist || (dist === bestDist && bestUnit && u.id < bestUnit.id)) {
      bestDist = dist;
      bestUnit = u;
    }
  }

  return bestUnit ? { unit: bestUnit, dist: bestDist } : null;
}

/**
 * Gây sát thương lên Trụ Pha Lê Chính của phe `targetIdx` bởi phe `attackerIdx`.
 * Trả về `true` nếu Trụ Pha Lê vừa bị phá hủy trong lần đánh này (kích hoạt kết thúc trận).
 */
export function damageCrystal(
  world: SimWorldState,
  attackerIdx: number,
  targetIdx: number,
  amount: number,
): boolean {
  const target = world.sides[targetIdx];
  const attacker = world.sides[attackerIdx];
  if (
    world.winnerTeam !== undefined ||
    !target ||
    !attacker ||
    !attacker.alive ||
    !target.alive ||
    target.baseHp <= 0 ||
    attackerIdx === targetIdx ||
    !(amount > 0)
  ) {
    return false;
  }

  const dealt = Math.min(target.baseHp, amount);
  target.baseHp -= dealt;
  attacker.damageToCrystal += dealt;

  if (target.baseHp <= 0) {
    target.baseHp = 0;
    target.alive = false;
    const crystal = THAP_CRYSTALS[targetIdx];
    if (crystal) {
      world.pendingDeaths.push(Math.round(crystal[0]), Math.round(crystal[1]), targetIdx + 1);
    }
    world.winnerTeam = attacker.team;
    world.winReason = 'crystal';
    return true;
  }

  return false;
}

/**
 * Cập nhật lượt phòng thủ của hai Trụ Pha Lê Chính mỗi khung hình 30Hz:
 * giảm hồi chiêu, tìm lính địch gần nhất trong tầm 600px, phóng đạn phép (`fb`/`tb` + cờ trụ)
 * và áp dụng sát thương thông qua callback `applyUnitDamage` để tránh phụ thuộc vòng với `combat.ts`.
 */
export function stepCrystals(
  world: SimWorldState,
  grid: SpatialGrid,
  applyUnitDamage: (world: SimWorldState, attackerIdx: number, victim: Unit, amount: number) => boolean,
): void {
  for (let i = 0; i < world.sides.length; i++) {
    const s = world.sides[i];
    if (!s.alive || s.baseHp <= 0) continue;

    if (s.crystalCd > 0) {
      s.crystalCd -= 1;
    }
    if (s.crystalCd > 0 || world.winnerTeam !== undefined) {
      continue;
    }

    const crystal = THAP_CRYSTALS[s.idx];
    if (!crystal) continue;
    const [cx, cy] = crystal;

    const found = findCrystalTarget(s.idx, cx, cy, grid);
    if (!found) continue;

    const { unit: target, dist } = found;
    const dmg = computeCrystalDamage(target);
    const travelMs = clamp(
      Math.round(dist * SHOT_TRAVEL_MS_PER_PX),
      MIN_SHOT_TRAVEL_MS,
      MAX_SHOT_TRAVEL_MS,
    );

    world.pendingShots.push(
      Math.round(cx),
      Math.round(cy - CRYSTAL_TIP_OFFSET_Y),
      Math.round(target.x),
      Math.round(target.y - TARGET_HIT_OFFSET_Y),
      crystalShotType(s.idx),
      target.id,
      travelMs,
    );
    applyUnitDamage(world, s.idx, target, dmg);
    s.crystalCd = THAP_BASE.weaponSpeedFrames;
  }
}
