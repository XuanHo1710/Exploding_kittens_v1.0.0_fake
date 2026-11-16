/**
 * Hệ thống kinh tế theo đợt (wave) và xuất quân từ Cổng Triệu Hồi của Miragine War 1:1 (30 FPS).
 */

import {
  THAP_BASE,
  THAP_BOT_NAMES,
  THAP_COLORS,
  THAP_INCOME_LIMIT,
  THAP_MAX_PLAYERS,
  THAP_MAX_POP,
  THAP_ROUND_FRAMES,
  THAP_SIDE_NAMES,
  THAP_SPAWN_INTERVAL_FRAMES,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_UNITS,
  type ThapConfig,
  type ThapUnitKind,
} from '../../../../shared/src';
import { doorSpawnPos } from './steering';
import { isUnitInPlay, type SideState, type SimWorldState, type Unit } from './types';

const DEFAULT_AUTO_KIND: ThapUnitKind = 'newbie';

function resolvePlayerSlot(
  players: Array<{ id: string; name: string; bot: boolean }>,
  idx: number,
  config: ThapConfig,
): { id: string; name: string; bot: boolean } {
  const provided = players[idx];
  if (provided) return provided;
  const isBot = idx === 1 && (config.mode === 'solo' || config.bots > 0);
  return {
    id: isBot ? 'bot:thap0' : `player:${idx}`,
    name: isBot ? THAP_BOT_NAMES[0] : (THAP_SIDE_NAMES[idx] ?? `Phe ${idx + 1}`),
    bot: isBot,
  };
}

function createSideState(idx: number, info: { id: string; name: string; bot: boolean }): SideState {
  return {
    idx,
    id: info.id,
    name: info.name,
    color: THAP_COLORS[idx % THAP_COLORS.length],
    team: idx,
    bot: info.bot,
    alive: true,
    gold: THAP_START_GOLD,
    roundIncome: THAP_START_ROUND_INCOME,
    totalEarned: THAP_START_GOLD,
    auto: DEFAULT_AUTO_KIND,
    baseHp: THAP_BASE.hp,
    baseMaxHp: THAP_BASE.hp,
    crystalCd: 0,
    spawnPending: 0,
    spawnUnitKind: DEFAULT_AUTO_KIND,
    spawnTimer: 0,
    lastWaveUnits: -1,
    kills: 0,
    lost: 0,
    spawned: 0,
    killsValue: 0,
    damageToCrystal: 0,
    blockedPop: false,
  };
}

/**
 * Khởi tạo 2 phe chuẩn Miragine War cổ điển: Phe 0 (Đỏ bên trái) và Phe 1 (Xanh bên phải).
 */
export function createInitialSides(
  players: Array<{ id: string; name: string; bot: boolean }>,
  config: ThapConfig,
): SideState[] {
  const sides: SideState[] = [];
  for (let idx = 0; idx < THAP_MAX_PLAYERS; idx++) {
    sides.push(createSideState(idx, resolvePlayerSlot(players, idx, config)));
  }
  return sides;
}

/**
 * Tính tổng dân số hiện tại của các đơn vị lính còn sống thuộc phe `owner`.
 */
export function sidePop(world: SimWorldState, owner: number): number {
  let pop = 0;
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (u.owner === owner && isUnitInPlay(u)) {
      pop += THAP_UNITS[u.kind].pop;
    }
  }
  return pop;
}

/**
 * Kiểm tra phe `s` có đang bị kẹt trần dân số (`THAP_MAX_POP = 60`) cho loại lính đang chọn `s.auto` hay không.
 */
export function isBlockedByPop(world: SimWorldState, s: SideState): boolean {
  return sidePop(world, s.idx) + THAP_UNITS[s.auto].pop > THAP_MAX_POP;
}

/**
 * Cập nhật loại lính tự động mua ở đợt tiếp theo cho phe `idx` và tính lại cờ `blockedPop`.
 */
export function setSideAuto(world: SimWorldState, idx: number, kind: ThapUnitKind): boolean {
  const s = world.sides[idx];
  if (!s || !s.alive) return false;
  if (!Object.prototype.hasOwnProperty.call(THAP_UNITS, kind)) return false;
  s.auto = kind;
  s.blockedPop = isBlockedByPop(world, s);
  return true;
}

/**
 * Triệu hồi một đơn vị lính mới thuộc phe `owner` tại tọa độ `(x, y)` hoặc mặc định tại Cổng Triệu Hồi.
 */
export function spawnUnit(
  world: SimWorldState,
  owner: number,
  kind: ThapUnitKind,
  x?: number,
  y?: number,
): Unit {
  const stats = THAP_UNITS[kind];
  const s = world.sides[owner];
  const spawnedOrder = s ? s.spawned++ : 0;
  const pos = x === undefined || y === undefined ? doorSpawnPos(owner, spawnedOrder) : { x, y };

  const unit: Unit = {
    id: world.nextUnitId++,
    owner,
    kind,
    x: x ?? pos.x,
    y: y ?? pos.y,
    vx: 0,
    vy: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    cd: 0,
    windupLeft: 0,
    windupTargetId: 0,
    windupTargetBase: -1,
    radius: stats.radius,
    atkAt: 0,
    atkStartPending: false,
    attacking: false,
    moving: false,
    left: owner === 1,
    spawnedOrder,
  };
  world.units.push(unit);
  return unit;
}

function processSideWaveBoundary(world: SimWorldState, s: SideState): void {
  s.gold += s.roundIncome;
  s.totalEarned += s.roundIncome;

  const kind = s.auto;
  const stats = THAP_UNITS[kind];
  const curPop = sidePop(world, s.idx);
  const byGold = stats.cost > 0 ? Math.floor(s.gold / stats.cost) : 0;
  const byPop = stats.pop > 0 ? Math.floor(Math.max(0, THAP_MAX_POP - curPop) / stats.pop) : 0;
  const count = Math.max(0, Math.min(byGold, byPop));

  s.gold -= count * stats.cost;
  s.roundIncome = Math.min(THAP_INCOME_LIMIT, s.roundIncome + count * stats.incomeBonus);
  s.spawnUnitKind = kind;
  s.spawnPending = count;
  s.spawnTimer = 0;
  s.lastWaveUnits = count;
  s.blockedPop = count === 0 && byGold >= 1 && byPop === 0;
}

/**
 * Kích hoạt mốc chuyển đợt (wave boundary): phát vàng vòng, mua quân theo `auto`, cộng thưởng thu nhập
 * và đặt lại bộ đếm vòng `THAP_ROUND_FRAMES` (900 khung hình = 30 giây).
 */
export function triggerWaveBoundary(world: SimWorldState): void {
  world.wave += 1;
  for (let i = 0; i < world.sides.length; i++) {
    const s = world.sides[i];
    if (!s.alive) continue;
    processSideWaveBoundary(world, s);
  }
  world.roundFramesLeft = THAP_ROUND_FRAMES;
  world.roundTotalFrames = THAP_ROUND_FRAMES;
}

function stepSideSpawning(world: SimWorldState, s: SideState): void {
  if (s.spawnPending > 0) {
    if (s.spawnTimer > 0) {
      s.spawnTimer -= 1;
    }
    if (s.spawnTimer <= 0) {
      const unitPop = THAP_UNITS[s.spawnUnitKind].pop;
      if (sidePop(world, s.idx) + unitPop <= THAP_MAX_POP) {
        spawnUnit(world, s.idx, s.spawnUnitKind);
        s.spawnPending -= 1;
        s.spawnTimer = THAP_SPAWN_INTERVAL_FRAMES;
      } else {
        // Giữ lại hàng đợi để thử xuất quân ở khung hình sau nếu dân số vừa chạm trần.
        s.spawnTimer = 1;
      }
    }
  }
  s.blockedPop = isBlockedByPop(world, s);
}

/**
 * Thực hiện một bước 30Hz cho kinh tế vòng vàng và nhịp xuất quân từng con từ Cổng Triệu Hồi.
 */
export function stepEconomyAndSpawning(world: SimWorldState): void {
  world.roundFramesLeft -= 1;
  if (world.roundFramesLeft <= 0) {
    triggerWaveBoundary(world);
  }
  for (let i = 0; i < world.sides.length; i++) {
    const s = world.sides[i];
    if (!s.alive) continue;
    stepSideSpawning(world, s);
  }
}
