/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) – Địa hình Chiến trường & Vật lý Không gian (Server).
 *
 * Cung cấp các hàm thuần (pure/fast helpers) chạy ở nhịp 15 Hz trên máy chủ:
 * 1. `sampleTerrainAt`: lấy mẫu hiệu ứng địa hình (Rừng thông phục kích, Đồi cao lợi thế tầm bắn & xung kích,
 *    Khúc sông cạn giảm tốc & giảm thủ, Đầm lầy lầy lội).
 * 2. `isRegimentHidden`: cơ chế ẩn quân phục kích trong rừng chuẩn Total War: Three Kingdoms
 *    (vô hình trước địch trừ phi là Pháo Đá, đang bắn/giao chiến/đấu tướng, hoặc có địch sống trong tầm 280).
 * 3. `computeSpawnPositions`: triển khai thế trận Khai Chiến cho 2 chế độ Lịch Sử Đối Kháng (Tây Nam vs Đông Bắc)
 *    và Quần Hùng Trục Lộc (elip nội tiếp hướng tâm).
 * 4. `stepCapturePoints`: mô phỏng tranh chấp & chiếm giữ Đài Hiệu Lệnh / Kho Lương / Cửa Ải (tiến độ 0..100).
 * 5. `clampToBattlefield`: giới hạn tọa độ an toàn trong biên chiến trường.
 */

import {
  TW_MAPS,
  TW_UNITS,
  twPointInTerrainZone,
  type TwCaptureState,
  type TwDeployZoneSpec,
  type TwMapId,
  type TwMapSpec,
  type TwMode,
  type TwTerrainZone,
  type TwUnitKind,
} from '../../../../shared/src/tw';
import type { TwSimRegiment } from './formations';

// ============================================================================
// HẰNG SỐ ĐỊA HÌNH & CHIẾM ĐÀI HIỆU LỆNH
// ============================================================================

/** Khoảng cách tối đa (đơn vị bản đồ) mà quân địch phát hiện phục binh trong rừng */
export const TW_FOREST_SPOT_RADIUS = 280;
const TW_FOREST_SPOT_RADIUS_SQ = TW_FOREST_SPOT_RADIUS * TW_FOREST_SPOT_RADIUS;

/** Lề an toàn mặc định tính từ mép chiến trường 3200×2200 */
export const TW_DEFAULT_MAP_MARGIN = 40;

/** Hệ số địa hình chuẩn Total War: Three Kingdoms */
const FOREST_SPEED_MUL = 0.82;
const FOREST_MISSILE_BLOCK_BONUS = 0.45;

const RIDGE_RANGE_MUL = 1.2;
const RIDGE_CHARGE_ELEVATION_BONUS = 0.25;
const RIDGE_MELEE_DEF_BONUS = 6;

const RIVER_SPEED_MUL = 0.55;
const RIVER_MELEE_DEF_BONUS = -8;

const MUD_SPEED_MUL = 0.7;
const MUD_MELEE_DEF_BONUS = -4;

/** Tốc độ chiếm điểm chiến lược (%/giây) */
const CAPTURE_BASE_RATE_PER_SEC = 10;
const CAPTURE_EXTRA_REG_RATE_PER_SEC = 4;
const CAPTURE_MAX_RATE_PER_SEC = 20;
const CAPTURE_IDLE_RECOVER_RATE_PER_SEC = 5;
/** Tỷ lệ áp đảo tối thiểu để vừa giao tranh vừa đẩy thanh chiếm điểm trong vòng tranh chấp */
const CAPTURE_OVERWHELM_RATIO = 2.0;

/**
 * Lưu phe đang chiếm dở điểm trung lập (`ownerTeam === -1`, `0 < progress < 100`) theo tham chiếu đối tượng
 * để không thêm trường lạ vào gói tin `TwCaptureState` gửi qua Socket.IO và tự thu hồi bộ nhớ khi hết trận.
 */
const neutralCapturingTeamMap = new WeakMap<TwCaptureState, number>();

interface BastionTowerReloadState {
  cooldownLeft: number;
  suppressedSec: number;
}

/**
 * Lưu trạng thái nạp tên & chấn áp Tháp Tiễn Thành Lũy (0 A.D. Han China defense_tower + TW3K Bastion)
 * theo từng đối tượng `TwCaptureState` qua `WeakMap` để không rò rỉ bộ nhớ hoặc làm bẩn JSON.
 */
const bastionTowerStateMap = new WeakMap<TwCaptureState, BastionTowerReloadState>();

const BASTION_TOWER_RELOAD_SEC = 2.5;
const BASTION_TOWER_RANGE = 420;
const BASTION_TOWER_RANGE_SQ = BASTION_TOWER_RANGE * BASTION_TOWER_RANGE;
const BASTION_SUPPRESS_RADIUS = 145;
const BASTION_SUPPRESS_DURATION_SEC = 7;
const BASTION_BOULDER_PROGRESS_DMG = 14;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ============================================================================
// KIỂU DỮ LIỆU XUẤT KHẨU
// ============================================================================

export interface TwTerrainSample {
  inForest: boolean;
  onHighGround: boolean;
  inRiver: boolean;
  inMud: boolean;
  speedMul: number;
  missileBlockBonus: number;
  rangeMul: number;
  chargeElevationBonus: number;
  meleeDefBonus: number;
}

export interface TwSpawnPose {
  x: number;
  y: number;
  facing: number;
}

export interface TwHideableRegiment {
  x: number;
  y: number;
  inForest: boolean;
  anim: string;
  isGeneral: boolean;
  kind?: TwUnitKind | string;
  men?: number;
  burning?: boolean;
}

export interface TwSpottingEnemyRegiment {
  x: number;
  y: number;
  men: number;
  team: number;
}

export interface TwCapturingRegiment {
  x: number;
  y: number;
  men: number;
  moraleState: string;
  team: number;
}

// ============================================================================
// 1. LẤY MẪU VẬT LÝ ĐỊA HÌNH TẠI (X, Y)
// ============================================================================

/** Kiểm tra nhanh hộp bao trước khi tính lượng giác elip xoay */
function pointInZoneFast(x: number, y: number, zone: TwTerrainZone): boolean {
  const maxRadius = zone.rx >= zone.ry ? zone.rx : zone.ry;
  if (Math.abs(x - zone.x) > maxRadius || Math.abs(y - zone.y) > maxRadius) {
    return false;
  }
  return twPointInTerrainZone(x, y, zone);
}

/**
 * Lấy mẫu toàn bộ hiệu ứng vật lý & chiến thuật của địa hình tại tọa độ `(x, y)`:
 * - `forest`: `inForest: true`, `speedMul: 0.82`, `missileBlockBonus: 0.45` (+45% tán thông chắn tên), cho phép ẩn phục binh.
 * - `ridge`: `onHighGround: true`, `rangeMul: 1.2` (+20% tầm bắn), `chargeElevationBonus: 0.25` (+25% xung kích đổ dốc), `meleeDefBonus: 6`.
 * - `river`: `inRiver: true`, `speedMul: 0.62`, `meleeDefBonus: -8`.
 * - `mud`: `inMud: true`, `speedMul: 0.72`, `meleeDefBonus: -4`.
 */
export function sampleTerrainAt(map: TwMapSpec, x: number, y: number): TwTerrainSample {
  let inForest = false;
  let onHighGround = false;
  let inRiver = false;
  let inMud = false;

  const zones = map.terrainZones;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    if (!pointInZoneFast(x, y, zone)) continue;
    switch (zone.kind) {
      case 'forest':
        inForest = true;
        break;
      case 'ridge':
        onHighGround = true;
        break;
      case 'river':
        inRiver = true;
        break;
      case 'mud':
        inMud = true;
        break;
    }
  }

  let speedMul = 1;
  if (inForest && FOREST_SPEED_MUL < speedMul) speedMul = FOREST_SPEED_MUL;
  if (inMud && MUD_SPEED_MUL < speedMul) speedMul = MUD_SPEED_MUL;
  if (inRiver && RIVER_SPEED_MUL < speedMul) speedMul = RIVER_SPEED_MUL;

  const missileBlockBonus = inForest ? FOREST_MISSILE_BLOCK_BONUS : 0;
  const rangeMul = onHighGround ? RIDGE_RANGE_MUL : 1;
  const chargeElevationBonus = onHighGround ? RIDGE_CHARGE_ELEVATION_BONUS : 0;

  let meleeDefBonus = 0;
  if (onHighGround) meleeDefBonus += RIDGE_MELEE_DEF_BONUS;
  if (inRiver) meleeDefBonus += RIVER_MELEE_DEF_BONUS;
  if (inMud) meleeDefBonus += MUD_MELEE_DEF_BONUS;

  return {
    inForest,
    onHighGround,
    inRiver,
    inMud,
    speedMul,
    missileBlockBonus,
    rangeMul,
    chargeElevationBonus,
    meleeDefBonus,
  };
}

// ============================================================================
// 2. ẨN QUÂN PHỤC KÍCH TRONG RỪNG (FOREST STEALTH / AMBUSH)
// ============================================================================

/** Kiểm tra đơn vị có phải Pháo Đá công thành (không thể ẩn mình trong rừng) hay không */
function isArtilleryRegiment(reg: TwHideableRegiment): boolean {
  if (reg.isGeneral || !reg.kind) return false;
  if (reg.kind === 'trebuchet') return true;
  const spec = (TW_UNITS as Record<string, { category: string } | undefined>)[reg.kind];
  return spec?.category === 'artillery';
}

/**
 * Xác định trung đoàn có đang ẩn kín trong rừng (`hidden = true`) trước tầm mắt quân địch hay không:
 * - Phải đứng trong vùng `forest` (`reg.inForest === true`), còn sống và không phải Pháo Đá (`artillery`).
 * - Lập tức lộ diện nếu đang khai hỏa (`shoot`), giáp lá cà (`attack`) hoặc Đấu Tướng (`duel`).
 * - Lộ diện nếu có bất kỳ trung đoàn địch còn sống (`men > 0`, `team !== regTeam`) trong bán kính `280` đơn vị.
 */
export function isRegimentHidden(
  reg: TwHideableRegiment,
  enemyRegs: ReadonlyArray<TwSpottingEnemyRegiment>,
  regTeam: number,
): boolean {
  if (reg.burning === true) return false;
  if (!reg.inForest) return false;
  if (typeof reg.men === 'number' && reg.men <= 0) return false;
  if (isArtilleryRegiment(reg)) return false;

  const anim = reg.anim;
  if (anim === 'shoot' || anim === 'attack' || anim === 'duel' || anim === 'dead') {
    return false;
  }

  const rx = reg.x;
  const ry = reg.y;
  for (let i = 0; i < enemyRegs.length; i++) {
    const enemy = enemyRegs[i];
    if (enemy.men <= 0 || enemy.team === regTeam) continue;
    const dx = enemy.x - rx;
    const dy = enemy.y - ry;
    if (dx * dx + dy * dy <= TW_FOREST_SPOT_RADIUS_SQ) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// 3. TRIỂN KHAI ĐỘI HÌNH KHAI CHIẾN (SPAWN DEPLOYMENT)
// ============================================================================

/**
 * Tính tọa độ & góc hướng mặt xuất trận `{ x, y, facing }` cho `count` chư hầu:
 * - `'historical_2teams'`:
 *   + Liên Minh 0 dàn trận dọc chiến tuyến Tây Nam / Tây hướng mặt về Đông Bắc.
 *   + Liên Minh 1 dàn trận dọc dải đồi Đông Bắc / Đông hướng mặt về Tây Nam (chuẩn bố cục Trận Bình Nguyên).
 *   + Các đồng minh cùng Liên Minh được chia đều cự ly dọc theo chính diện trận tuyến của phe mình.
 * - `'ffa'`:
 *   + Chia đều các chư hầu quanh đường elip nội tiếp của chiến trường 3200×2200, tất cả hướng mặt về trung tâm `(1600, 1100)`.
 */
export function computeSpawnPositions(
  map: TwMapSpec,
  count: number,
  mode: TwMode,
  teams: number[],
): TwSpawnPose[] {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) return [];

  const w = map.width;
  const h = map.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const safeMargin = Math.min(200, Math.min(w, h) * 0.12);

  if (mode === 'ffa') {
    const rx = w * 0.36;
    const ry = h * 0.35;
    // Khởi đầu ở góc Tây Nam (3π/4) để người chơi đầu tiên có góc nhìn thuận mắt hướng lên trung tâm
    const startAngle = Math.PI * 0.75;
    const poses: TwSpawnPose[] = new Array(safeCount);

    for (let i = 0; i < safeCount; i++) {
      const theta = startAngle + (i * Math.PI * 2) / safeCount;
      const rawX = cx + Math.cos(theta) * rx;
      const rawY = cy + Math.sin(theta) * ry;
      const pos = clampToBattlefield(map, rawX, rawY, safeMargin);
      const facing = Math.atan2(cy - pos.y, cx - pos.x);
      poses[i] = { x: pos.x, y: pos.y, facing };
    }
    return poses;
  }

  // Chế độ 'historical_2teams': Liên Minh 0 (Tây Nam / Tây -> Đông Bắc) vs Liên Minh 1 (Đông Bắc / Đông -> Tây Nam)
  const c0x = w * 0.225;
  const c0y = h * 0.62;
  const c1x = w * 0.775;
  const c1y = h * 0.38;

  const axisDx = c1x - c0x;
  const axisDy = c1y - c0y;
  const axisLen = Math.hypot(axisDx, axisDy) || 1;
  const fx = axisDx / axisLen;
  const fy = axisDy / axisLen;

  // Véc-tơ đơn vị vuông góc với trục đối kháng (chạy dọc chiến tuyến từ Tây-Tây-Bắc xuống Nam-Tây-Nam)
  const lateralX = -fy;
  const lateralY = fx;

  const facing0 = Math.atan2(axisDy, axisDx);
  const facing1 = Math.atan2(-axisDy, -axisDx);

  const coalition0: number[] = [];
  const coalition1: number[] = [];
  for (let i = 0; i < safeCount; i++) {
    const rawTeam = Number.isFinite(teams[i]) ? Math.floor(teams[i]) : i;
    const normalizedTeam = ((rawTeam % 2) + 2) % 2;
    if (normalizedTeam === 0) {
      coalition0.push(i);
    } else {
      coalition1.push(i);
    }
  }

  const poses: TwSpawnPose[] = new Array(safeCount);

  const placeCoalition = (
    members: number[],
    anchorX: number,
    anchorY: number,
    facing: number,
  ): void => {
    const m = members.length;
    if (m === 0) return;
    const idealStep = h * 0.2;
    const maxTotalSpan = h * 0.48;
    const step = m > 1 ? Math.min(idealStep, maxTotalSpan / (m - 1)) : 0;
    const halfSpan = ((m - 1) * step) * 0.5;

    for (let k = 0; k < m; k++) {
      const offset = k * step - halfSpan;
      const rawX = anchorX + lateralX * offset;
      const rawY = anchorY + lateralY * offset;
      const pos = clampToBattlefield(map, rawX, rawY, safeMargin);
      poses[members[k]] = { x: pos.x, y: pos.y, facing };
    }
  };

  placeCoalition(coalition0, c0x, c0y, facing0);
  placeCoalition(coalition1, c1x, c1y, facing1);

  return poses;
}

// ============================================================================
// 4. TRANH CHẤP & CHIẾM ĐÀI HIỆU LỆNH (STRATEGIC CAPTURE POINTS)
// ============================================================================

/** Khởi tạo mảng trạng thái chiếm điểm ban đầu từ cấu hình bản đồ */
export function createInitialCaptureStates(map: TwMapSpec): TwCaptureState[] {
  return map.capturePoints.map((cp) => ({
    id: cp.id,
    ownerTeam: -1,
    progress: 0,
  }));
}

function roundProgress(value: number): number {
  if (value <= 0.0001) return 0;
  if (value >= 99.9999) return 100;
  return Math.round(value * 100) / 100;
}

/**
 * Cập nhật tiến độ tranh chấp & chiếm giữ các điểm chiến lược trên bản đồ mỗi nhịp `dtSec`:
 * - Chỉ các trung đoàn còn sống (`men > 0`, `team >= 0`) và KHÔNG bỏ chạy (`moraleState !== 'routing'`
 *   & `moraleState !== 'shattered'`) đứng trong `cp.radius` mới tham gia chiếm/tranh chấp.
 * - Khi nhiều phe cùng hiện diện trong vòng: nếu phe mạnh nhất chưa áp đảo gấp đôi (`< 2.0x` trọng số)
 *   thì điểm bị khóa tranh chấp (tạm dừng thanh `progress`); nếu áp đảo `>= 2.0x` thì tiến độ tăng theo hiệu lực chênh lệch.
 * - Nếu điểm đang thuộc địch (`ownerTeam !== -1 && ownerTeam !== domTeam`), tiến độ hạ dần từ `100` về `0`
 *   để trung lập hóa (`ownerTeam = -1`), sau đó đẩy từ `0` lên `100` để cắm đại kỳ phe mới (`ownerTeam = domTeam`).
 */
export function stepCapturePoints(
  map: TwMapSpec,
  captures: TwCaptureState[],
  regiments: ReadonlyArray<TwCapturingRegiment>,
  dtSec: number,
): void {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return;

  const specs = map.capturePoints;
  for (let cIdx = 0; cIdx < specs.length; cIdx++) {
    const cp = specs[cIdx];
    let state = captures[cIdx];
    if (!state || state.id !== cp.id) {
      const found = captures.find((item) => item.id === cp.id);
      if (found) {
        state = found;
      } else {
        state = { id: cp.id, ownerTeam: -1, progress: 0 };
        captures.push(state);
      }
    }

    const rSq = cp.radius * cp.radius;
    const teamWeights = new Map<number, number>();
    const teamRegCounts = new Map<number, number>();

    for (let rIdx = 0; rIdx < regiments.length; rIdx++) {
      const reg = regiments[rIdx];
      if (reg.men <= 0 || reg.team < 0) continue;
      if (
        reg.moraleState === 'routing' ||
        reg.moraleState === 'shattered' ||
        reg.moraleState === 'dead'
      ) {
        continue;
      }
      const dx = reg.x - cp.x;
      const dy = reg.y - cp.y;
      if (dx * dx + dy * dy > rSq) continue;

      // Trọng số kết hợp số trung đoàn và quân số thực tế để đại quân chiếm ưu thế trước tàn quân
      const regWeight = 0.5 + Math.min(1.5, reg.men / 80);
      teamWeights.set(reg.team, (teamWeights.get(reg.team) ?? 0) + regWeight);
      teamRegCounts.set(reg.team, (teamRegCounts.get(reg.team) ?? 0) + 1);
    }

    // Trường hợp 1: Không có trung đoàn hợp lệ nào trong vòng chiếm điểm
    if (teamWeights.size === 0) {
      if (state.ownerTeam === -1) {
        if (state.progress > 0) {
          state.progress = roundProgress(
            Math.max(0, state.progress - CAPTURE_IDLE_RECOVER_RATE_PER_SEC * dtSec),
          );
          if (state.progress === 0) {
            neutralCapturingTeamMap.delete(state);
          }
        }
      } else if (state.progress < 100) {
        state.progress = roundProgress(
          Math.min(100, state.progress + CAPTURE_IDLE_RECOVER_RATE_PER_SEC * dtSec),
        );
      }
      continue;
    }

    // Tìm phe chiếm ưu thế lớn nhất trong vòng
    let domTeam = -1;
    let domWeight = 0;
    let totalWeight = 0;
    for (const [team, weight] of teamWeights.entries()) {
      totalWeight += weight;
      if (weight > domWeight) {
        domWeight = weight;
        domTeam = team;
      }
    }

    const oppWeight = totalWeight - domWeight;
    // Nếu có quân đối phương trong vòng mà chưa áp đảo >= 2.0x thì điểm đang giằng co (Contested)
    if (oppWeight > 0 && domWeight < oppWeight * CAPTURE_OVERWHELM_RATIO) {
      continue;
    }

    const domRegs = teamRegCounts.get(domTeam) ?? 1;
    const contestScale = oppWeight > 0 ? Math.max(0.25, (domWeight - oppWeight) / domWeight) : 1;
    const rawRate =
      CAPTURE_BASE_RATE_PER_SEC + Math.max(0, domRegs - 1) * CAPTURE_EXTRA_REG_RATE_PER_SEC;
    const rate = Math.min(CAPTURE_MAX_RATE_PER_SEC, rawRate) * contestScale;
    const delta = rate * dtSec;

    if (state.ownerTeam === domTeam) {
      // Củng cố lại điểm của phe mình nếu trước đó bị địch kéo tụt một phần
      state.progress = roundProgress(Math.min(100, state.progress + delta));
      neutralCapturingTeamMap.delete(state);
      continue;
    }

    if (state.ownerTeam !== -1) {
      // Đang thuộc về phe địch -> hạ cờ địch về 0 trước
      const next = state.progress - delta;
      if (next > 0) {
        state.progress = roundProgress(next);
      } else {
        const carry = Math.min(100, -next);
        state.ownerTeam = -1;
        if (carry >= 100) {
          state.ownerTeam = domTeam;
          state.progress = 100;
          neutralCapturingTeamMap.delete(state);
        } else {
          state.progress = roundProgress(carry);
          if (state.progress > 0) {
            neutralCapturingTeamMap.set(state, domTeam);
          } else {
            neutralCapturingTeamMap.delete(state);
          }
        }
      }
      continue;
    }

    // Điểm đang trung lập (ownerTeam === -1)
    const pendingTeam = neutralCapturingTeamMap.get(state);
    if (pendingTeam !== undefined && pendingTeam !== domTeam && state.progress > 0) {
      // Xóa tiến độ chiếm dở của phe trước rồi mới tích lũy cho phe mới
      const next = state.progress - delta;
      if (next > 0) {
        state.progress = roundProgress(next);
      } else {
        const carry = Math.min(100, -next);
        if (carry >= 100) {
          state.ownerTeam = domTeam;
          state.progress = 100;
          neutralCapturingTeamMap.delete(state);
        } else {
          state.progress = roundProgress(carry);
          if (state.progress > 0) {
            neutralCapturingTeamMap.set(state, domTeam);
          } else {
            neutralCapturingTeamMap.delete(state);
          }
        }
      }
      continue;
    }

    neutralCapturingTeamMap.set(state, domTeam);
    const next = state.progress + delta;
    if (next >= 100) {
      state.ownerTeam = domTeam;
      state.progress = 100;
      neutralCapturingTeamMap.delete(state);
    } else {
      state.progress = roundProgress(next);
    }
  }
}

// ============================================================================
// 5. GIỚI HẠN BIÊN CHIẾN TRƯỜNG & TIỆN ÍCH BẢN ĐỒ
// ============================================================================

/**
 * Giới hạn tọa độ `(x, y)` nằm gọn trong biên bản đồ với khoảng cách lề `margin` (mặc định `40`).
 */
export function clampToBattlefield(
  map: TwMapSpec,
  x: number,
  y: number,
  margin: number = TW_DEFAULT_MAP_MARGIN,
): { x: number; y: number } {
  const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : TW_DEFAULT_MAP_MARGIN;
  const mx = Math.min(safeMargin, map.width * 0.5);
  const my = Math.min(safeMargin, map.height * 0.5);
  const safeX = Number.isFinite(x) ? x : map.width * 0.5;
  const safeY = Number.isFinite(y) ? y : map.height * 0.5;

  return {
    x: Math.max(mx, Math.min(map.width - mx, safeX)),
    y: Math.max(my, Math.min(map.height - my, safeY)),
  };
}

/** Tra cứu thông số chiến trường theo `mapId` (mặc định rơi về Trận Bình Nguyên nếu không khớp) */
export function getTwMapSpec(mapId: TwMapId | string): TwMapSpec {
  if (mapId in TW_MAPS) {
    return TW_MAPS[mapId as TwMapId];
  }
  return TW_MAPS.pingyuan;
}

// ============================================================================
// 6. VÙNG BỐ TRẬN TIỀN CHIẾN & PHỤC KÍCH TIÊN PHONG (DEPLOYMENT & VANGUARD)
// ============================================================================

/**
 * Tính vùng elip Bố Trận (`TwDeployZoneSpec`) xoay theo hướng mặt xuất quân `pose.facing`
 * và được kẹp an toàn bên trong biên bản đồ `map`.
 */
export function computeDeployZoneForPose(
  map: TwMapSpec,
  pose: TwSpawnPose,
  multiWarlord = false,
): TwDeployZoneSpec {
  const rx = multiWarlord ? 420 : 540;
  const ry = multiWarlord ? 340 : 460;
  const clamped = clampToBattlefield(map, pose.x, pose.y, 120);
  return {
    x: clamped.x,
    y: clamped.y,
    rx,
    ry,
    rot: pose.facing + Math.PI * 0.5,
  };
}

/**
 * Kiểm định tọa độ `(x, y)` có hợp lệ trong Pha Bố Trận hay không:
 * - Hợp lệ nếu nằm gọn trong vùng bố trận tiêu chuẩn `zone`.
 * - Hoặc nếu đơn vị có đặc quyền Tiên Phong (`vanguardAllowed === true`), được phép bố trí trong
 *   vùng rừng (`'forest'`) trên bản đồ miễn là cách mọi vị trí xuất quân địch (`enemyPoses`) ít nhất `620` đơn vị!
 */
export function isValidDeploymentPosition(
  map: TwMapSpec,
  zone: TwDeployZoneSpec,
  x: number,
  y: number,
  vanguardAllowed: boolean,
  enemyPoses?: ReadonlyArray<TwSpawnPose>,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0 || x > map.width || y < 0 || y > map.height) return false;

  if (twPointInTerrainZone(x, y, { id: 'deploy', kind: 'ridge', ...zone })) {
    return true;
  }

  if (!vanguardAllowed) return false;

  let insideForest = false;
  const zones = map.terrainZones;
  for (let i = 0; i < zones.length; i++) {
    const tz = zones[i];
    if (tz.kind === 'forest' && pointInZoneFast(x, y, tz)) {
      insideForest = true;
      break;
    }
  }
  if (!insideForest) return false;

  if (enemyPoses && enemyPoses.length > 0) {
    for (let i = 0; i < enemyPoses.length; i++) {
      const ep = enemyPoses[i];
      if (Math.hypot(x - ep.x, y - ep.y) < 620) {
        return false;
      }
    }
  }

  return true;
}

// ============================================================================
// 7. THÁP TIỄN THÀNH LŨY ĐÀI HIỆU LỆNH (0 A.D. HAN DEFENSE TOWER & TW3K BASTION)
// ============================================================================

function getOrCreateBastionState(cap: TwCaptureState): BastionTowerReloadState {
  let st = bastionTowerStateMap.get(cap);
  if (!st) {
    st = { cooldownLeft: BASTION_TOWER_RELOAD_SEC, suppressedSec: 0 };
    bastionTowerStateMap.set(cap, st);
  }
  return st;
}

/**
 * Đá lửa Pháo Đá Uy Viễn bắn trúng trong bán kính `145` đơn vị quanh Đài Hiệu Lệnh của địch
 * sẽ chấn áp Tháp Tiễn suốt `7s` và đập sụt `-14` tiến độ chiếm giữ công sự!
 */
export function suppressBastionTowerAt(
  map: TwMapSpec,
  captures: TwCaptureState[],
  impactX: number,
  impactY: number,
  attackerTeam: number,
): void {
  const specs = map.capturePoints;
  for (let cIdx = 0; cIdx < specs.length; cIdx++) {
    const cpSpec = specs[cIdx];
    const cap =
      captures[cIdx]?.id === cpSpec.id
        ? captures[cIdx]
        : captures.find((item) => item.id === cpSpec.id);
    if (!cap || cap.ownerTeam < 0 || cap.ownerTeam === attackerTeam) continue;

    if (Math.hypot(impactX - cpSpec.x, impactY - cpSpec.y) <= BASTION_SUPPRESS_RADIUS) {
      const st = getOrCreateBastionState(cap);
      st.suppressedSec = Math.max(st.suppressedSec, BASTION_SUPPRESS_DURATION_SEC);
      st.cooldownLeft = BASTION_TOWER_RELOAD_SEC;
      cap.progress = roundProgress(Math.max(0, cap.progress - BASTION_BOULDER_PROGRESS_DMG));
      if (cap.progress <= 0) {
        cap.progress = 0;
        cap.ownerTeam = -1;
        neutralCapturingTeamMap.delete(cap);
      }
      cap.towerCooldownPct = 0;
    }
  }
}

/**
 * Mô phỏng Tháp Tiễn Thành Lũy tự động nạp tên (`2.5s`/loạt) và bắn hạ quân địch lộ diện
 * trong bán kính `420` đơn vị khi Đài Hiệu Lệnh đã được chiếm giữ vững chắc (`ownerTeam >= 0 && progress >= 95`).
 */
export function stepBastionWatchtowers(
  map: TwMapSpec,
  captures: TwCaptureState[],
  regs: ReadonlyArray<TwSimRegiment>,
  emitTowerShot: (x0: number, y0: number, target: TwSimRegiment, ownerTeam: number) => void,
  dtSec: number,
): void {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return;

  const specs = map.capturePoints;
  for (let cIdx = 0; cIdx < specs.length; cIdx++) {
    const cpSpec = specs[cIdx];
    const cap =
      captures[cIdx]?.id === cpSpec.id
        ? captures[cIdx]
        : captures.find((item) => item.id === cpSpec.id);
    if (!cap) continue;

    const st = getOrCreateBastionState(cap);
    if (st.suppressedSec > 0) {
      st.suppressedSec = Math.max(0, st.suppressedSec - dtSec);
    }

    if (cap.ownerTeam < 0) {
      st.cooldownLeft = BASTION_TOWER_RELOAD_SEC;
      cap.towerCooldownPct = 0;
      continue;
    }

    if (cap.progress >= 95 && st.suppressedSec <= 0) {
      st.cooldownLeft = Math.max(0, st.cooldownLeft - dtSec);

      if (st.cooldownLeft <= 0) {
        let nearestEnemy: TwSimRegiment | undefined;
        let bestDistSq = BASTION_TOWER_RANGE_SQ;

        for (let rIdx = 0; rIdx < regs.length; rIdx++) {
          const r = regs[rIdx];
          if (
            r.team === cap.ownerTeam ||
            r.men <= 0 ||
            r.hp <= 0 ||
            r.anim === 'dead' ||
            r.moraleState === 'shattered' ||
            r.hidden ||
            r.duelId !== undefined
          ) {
            continue;
          }
          const dx = r.x - cpSpec.x;
          const dy = r.y - cpSpec.y;
          const dSq = dx * dx + dy * dy;
          if (dSq <= bestDistSq) {
            bestDistSq = dSq;
            nearestEnemy = r;
          }
        }

        if (nearestEnemy) {
          emitTowerShot(cpSpec.x, cpSpec.y, nearestEnemy, cap.ownerTeam);
          st.cooldownLeft = BASTION_TOWER_RELOAD_SEC;
        }
      }

      cap.towerCooldownPct =
        Math.round(clamp01(1 - st.cooldownLeft / BASTION_TOWER_RELOAD_SEC) * 100) / 100;
    } else {
      cap.towerCooldownPct =
        st.suppressedSec > 0
          ? 0
          : Math.round(clamp01(1 - st.cooldownLeft / BASTION_TOWER_RELOAD_SEC) * 100) / 100;
    }
  }
}
