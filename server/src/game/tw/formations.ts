/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) — Động cơ Đội hình, Xoay cánh (Wheeling) & Điều hướng Trung đoàn.
 *
 * Phụ trách:
 * 1. Hợp đồng trạng thái mô phỏng trung đoàn chuẩn máy chủ (`TwSimRegiment`) dùng chung cho `world.ts`, `combat.ts`, `duel.ts`, `bot.ts`.
 * 2. Tính toán kích thước hình học động (`cols`, `width`, `depth`) theo quân số, binh chủng, trận hình và bề ngang kéo chuột (`customWidth`).
 * 3. Dàn trận tuyến đa trung đoàn (`computeMultiRegimentLineTargets`) phân tầng Bộ binh cận chiến – Kỵ binh hai cánh – Cung Pháo hậu tuyến không chồng lấn.
 * 4. Mô phỏng di chuyển 15 Hz (`stepRegimentMovement`): tháo chạy vỡ trận, thả diều cung nỏ (`skirmishMode`), truy kích & xung phong (`charge`),
 *    xoay trục đội hình (`wheeling`), dựng thương/thuẫn chống cự (`brace`), tách va chạm mềm đồng minh và thể lực (`fatigue`).
 * 5. Xác định vùng tiếp chiến Chính diện / Tạt sườn / Bọc hậu (`computeFlankZone`) có xét Viên Trận (`antiFlank`).
 */

import {
  TW_FORMATIONS,
  TW_GENERALS,
  TW_UNITS,
  type TwAnimState,
  type TwFatigueState,
  type TwFormation,
  type TwGeneralId,
  type TwMoraleState,
  type TwUnitKind,
} from '../../../../shared/src/tw';

// ============================================================================
// 1. GIAO DIỆN TRUNG ĐOÀN MÔ PHỎNG MÁY CHỦ (CANONICAL SERVER REGIMENT)
// ============================================================================

export interface TwSimRegiment {
  id: number;
  ownerIdx: number;
  team: number;
  generalSlot: number;
  kind: TwUnitKind;
  isGeneral: boolean;
  generalId?: TwGeneralId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  width: number;
  depth: number;
  cols: number;
  men: number;
  maxMen: number;
  hp: number;
  maxHp: number;
  morale: number;
  moraleState: TwMoraleState;
  fatigueVal: number;
  fatigue: TwFatigueState;
  ammo: number;
  maxAmmo: number;
  formation: TwFormation;
  anim: TwAnimState;
  hidden: boolean;
  inForest: boolean;
  onHighGround: boolean;
  inRiver: boolean;
  inMud: boolean;
  guardMode: boolean;
  fireAtWill: boolean;
  skirmishMode: boolean;
  runOrder: boolean;
  lockedTargetId?: number;
  moveTargetX?: number;
  moveTargetY?: number;
  moveTargetFacing?: number;
  customWidth?: number;
  reloadLeftSec: number;
  chargeTicks: number;
  bracedTicks: number;
  engagedWithId?: number;
  duelId?: number;
  skillCooldownLeft: number;
  activeBuff?: string;
  activeBuffLeftSec: number;
  auraAtkMul: number;
  auraDefAdd: number;
  auraSpeedMul: number;
  auraMoraleAdd: number;
  fireArrowActive: boolean;
  kills: number;
  /** Cấp Tinh nhuệ trung đoàn (0..9 — Tân Binh -> Đồng -> Bạc -> Vàng Cấm Vệ) */
  rank?: number;
  /** Đang bốc cháy trong vùng Hỏa Công */
  burning?: boolean;
  /** Hệ số làm chậm từ Đạo cụ Chiến thuật (1.0 bình thường, 0.45 chông sắt, 0.72 cự mã, 0.75 dầu) */
  deploySlowMul?: number;
  /** Trạng thái Quan Hệ Ngũ Hành Tướng Lĩnh (Guanxi) */
  guanxiState?: 'harmony' | 'enraged' | 'rival';
  /** Thời gian còn lại của trạng thái Cuồng Nộ Báo Thù khi huynh đệ tử trận (giây) */
  guanxiEnrageLeftSec?: number;
}

export interface TwSteeringHazard {
  x: number;
  y: number;
  radius: number;
  kind: 'fire' | 'stakes';
  team?: number;
}

export interface TwLineTarget {
  regId: number;
  x: number;
  y: number;
  facing: number;
  width?: number;
}

export type TwFlankZone = 'front' | 'flank' | 'rear';

// ============================================================================
// HẰNG SỐ ĐỘI HÌNH & ĐIỀU HƯỚNG CHIẾN THUẬT
// ============================================================================

const SPACING_INFANTRY = 11;
const SPACING_CAVALRY = 18;
const SPACING_ARTILLERY = 26;
const SPACING_GENERAL = 24;

/** Khoảng hở ngang giữa hai trung đoàn đứng cạnh nhau trên cùng một tuyến */
const LINE_LATERAL_GAP = 18;
/** Khoảng hở dọc giữa tuyến bộ binh tiền phương và tuyến cung/pháo hậu phương */
const LINE_ECHELON_GAP = 38;

/** Khoảng cách kích hoạt cung nỏ tự lùi giữ cự ly khi bộ/kỵ địch áp sát */
const SKIRMISH_TRIGGER_DIST = 135;
/** Khoảng cách chuyển sang trạng thái xung phong (charge) khi truy kích mục tiêu */
const CHARGE_TRIGGER_DIST = 190;
/** Ngưỡng sai số đến điểm tập kết (đơn vị bản đồ) */
const MOVE_ARRIVE_EPS = 4.0;
/** Ngưỡng vận tốc được coi là đứng yên giữ trận (brace / idle) */
const STATIONARY_SPEED_EPS = 3.0;

// ============================================================================
// HÀM TIỆN ÍCH TOÁN HỌC & THÔNG SỐ ĐƠN VỊ
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/** Chuẩn hóa góc radian về khoảng [-PI, PI] */
export function normalizeAngle(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Độ lệch góc ngắn nhất từ `fromRad` tới `toRad` trong khoảng [-PI, PI] */
export function shortestAngleDiff(fromRad: number, toRad: number): number {
  return normalizeAngle(toRad - fromRad);
}

/** Cự ly cơ sở mỗi binh sĩ/chiến mã theo chủng loại */
export function getUnitBaseSpacing(kind: TwUnitKind, isGeneral: boolean): number {
  if (isGeneral) return SPACING_GENERAL;
  const spec = TW_UNITS[kind];
  switch (spec.category) {
    case 'cavalry_shock':
    case 'cavalry_melee':
      return SPACING_CAVALRY;
    case 'artillery':
      return SPACING_ARTILLERY;
    case 'infantry_polearm':
    case 'infantry_sword':
    case 'ranged_bow':
    case 'ranged_crossbow':
    default:
      return SPACING_INFANTRY;
  }
}

/** Kiểm tra trận hình có khả năng cắm thương / dựng khiên chống xung kích khi đứng yên hay không */
export function isBraceFormation(formation: TwFormation): boolean {
  return formation === 'spearwall' || formation === 'shieldwall' || formation === 'circle';
}

/** Quy đổi chỉ số mệt mỏi (0..100) sang cấp thể lực Total War */
export function fatigueStateFromVal(fatigueVal: number): TwFatigueState {
  if (fatigueVal < 25) return 'fresh';
  if (fatigueVal < 55) return 'active';
  if (fatigueVal < 80) return 'winded';
  return 'exhausted';
}

/** Hệ số tốc độ hành quân theo mức thể lực hiện tại */
export function fatigueSpeedMul(fatigue: TwFatigueState): number {
  switch (fatigue) {
    case 'fresh':
      return 1.0;
    case 'active':
      return 0.95;
    case 'winded':
      return 0.86;
    case 'exhausted':
      return 0.72;
  }
}

interface RegimentFootprint {
  cols: number;
  rows: number;
  width: number;
  depth: number;
}

/**
 * Tính toán thuần túy số cột, số hàng, chiều ngang và chiều sâu của trung đoàn
 * mà không gây tác dụng phụ (dùng chung cho cả `recomputeRegimentDimensions` và dàn trận tuyến).
 */
function measureRegimentFootprint(
  reg: Pick<TwSimRegiment, 'men' | 'kind' | 'isGeneral' | 'formation' | 'customWidth'>,
  overrideWidth?: number,
): RegimentFootprint {
  const activeMen = Math.max(1, Math.round(Number.isFinite(reg.men) ? reg.men : 1));
  const formSpec = TW_FORMATIONS[reg.formation] ?? TW_FORMATIONS.line;
  const baseSpacing = getUnitBaseSpacing(reg.kind, reg.isGeneral);
  const spacing = baseSpacing * formSpec.spreadMul;

  if (activeMen <= 1) {
    const singleSize = Math.max(baseSpacing, spacing);
    return {
      cols: 1,
      rows: 1,
      width: Math.round(singleSize * 10) / 10,
      depth: Math.round(singleSize * 10) / 10,
    };
  }

  // Viên Trận (Circle): duy trì khối vuông/tròn đồng tâm 360 độ
  if (reg.formation === 'circle') {
    const cols = clamp(Math.round(Math.sqrt(activeMen * formSpec.defaultColsRatio)), 1, activeMen);
    const rows = Math.max(1, Math.ceil(activeMen / cols));
    return {
      cols,
      rows,
      width: Math.round(cols * spacing * 10) / 10,
      depth: Math.round(rows * spacing * 10) / 10,
    };
  }

  const category = TW_UNITS[reg.kind].category;
  let minRanks: number;
  let maxRanks: number;
  let minColsHard: number;

  if (reg.isGeneral) {
    minRanks = 1;
    maxRanks = Math.min(activeMen, 6);
    minColsHard = 1;
  } else if (category === 'artillery') {
    minRanks = 1;
    maxRanks = Math.max(1, Math.min(activeMen, 4));
    minColsHard = Math.min(activeMen, 2);
  } else if (category === 'cavalry_shock' || category === 'cavalry_melee') {
    minRanks = Math.min(activeMen, 2);
    maxRanks = Math.max(minRanks, Math.min(activeMen, 9));
    minColsHard = Math.min(activeMen, 3);
  } else {
    // Bộ binh cận chiến & Cung nỏ: cho phép kéo mỏng tới 2 hàng hoặc xếp dọc sâu tới 15 hàng
    minRanks = Math.min(activeMen, 2);
    maxRanks = Math.max(minRanks, Math.min(activeMen, 15));
    minColsHard = Math.min(activeMen, 4);
  }

  const maxCols = Math.max(1, Math.ceil(activeMen / minRanks));
  const minCols = Math.min(maxCols, Math.max(minColsHard, Math.ceil(activeMen / maxRanks)));

  const requestedWidth =
    overrideWidth !== undefined && Number.isFinite(overrideWidth) && overrideWidth > 0
      ? overrideWidth
      : reg.customWidth !== undefined && Number.isFinite(reg.customWidth) && reg.customWidth > 0
        ? reg.customWidth
        : undefined;

  const rawCols =
    requestedWidth !== undefined
      ? Math.round(requestedWidth / Math.max(1, spacing))
      : Math.round(Math.sqrt(activeMen * formSpec.defaultColsRatio));

  const cols = clamp(rawCols, minCols, Math.min(activeMen, maxCols));
  const rows = Math.max(1, Math.ceil(activeMen / cols));

  return {
    cols,
    rows,
    width: Math.round(cols * spacing * 10) / 10,
    depth: Math.round(rows * spacing * 10) / 10,
  };
}

// ============================================================================
// 2. CẬP NHẬT HÌNH HỌC TRUNG ĐOÀN (DYNAMIC REGIMENT DIMENSIONS)
// ============================================================================

/**
 * Tính lại `cols`, `width`, `depth` động theo quân số hiện tại (`reg.men`), cự ly chủng loại,
 * hệ số giãn trận (`spreadMul`, `defaultColsRatio`) và độ rộng kéo tay (`reg.customWidth`).
 */
export function recomputeRegimentDimensions(reg: TwSimRegiment): void {
  const fp = measureRegimentFootprint(reg);
  reg.cols = fp.cols;
  reg.width = fp.width;
  reg.depth = fp.depth;
}

// ============================================================================
// 3. DÀN TRẬN TUYẾN ĐA TRUNG ĐOÀN (MULTI-REGIMENT BATTLE LINE)
// ============================================================================

function isRearSupportUnit(reg: TwSimRegiment): boolean {
  if (reg.isGeneral) {
    const genSpec = reg.generalId ? TW_GENERALS[reg.generalId] : undefined;
    return genSpec?.class === 'strategist';
  }
  const cat = TW_UNITS[reg.kind].category;
  return cat === 'ranged_bow' || cat === 'ranged_crossbow' || cat === 'artillery';
}

function isWingCavalryUnit(reg: TwSimRegiment): boolean {
  if (reg.isGeneral) return false;
  const cat = TW_UNITS[reg.kind].category;
  return cat === 'cavalry_shock' || cat === 'cavalry_melee';
}

/**
 * Sắp xếp thứ tự trung đoàn trong một tuyến ngang sao cho giữ nguyên vị trí tương đối trái-phải
 * (tránh cắt chéo đường hành quân) đồng thời bố trí Kỵ binh bảo vệ hai cánh nếu đi cùng Bộ binh.
 */
function orderRankRegiments(
  regs: TwSimRegiment[],
  centerX: number,
  centerY: number,
  latX: number,
  latY: number,
): TwSimRegiment[] {
  const byLateral = [...regs].sort((a, b) => {
    const pa = (a.x - centerX) * latX + (a.y - centerY) * latY;
    const pb = (b.x - centerX) * latX + (b.y - centerY) * latY;
    if (Math.abs(pa - pb) > 0.5) return pa - pb;
    return a.id - b.id;
  });

  const cavs = byLateral.filter(isWingCavalryUnit);
  const nonCavs = byLateral.filter((r) => !isWingCavalryUnit(r));

  if (cavs.length === 0 || nonCavs.length === 0) {
    return byLateral;
  }

  const leftCount = Math.ceil(cavs.length / 2);
  const leftWing = cavs.slice(0, leftCount);
  const rightWing = cavs.slice(leftCount);
  return [...leftWing, ...nonCavs, ...rightWing];
}

interface RankPlacement {
  targets: TwLineTarget[];
  totalSpan: number;
  maxDepth: number;
}

function layoutSingleRank(
  orderedRegs: TwSimRegiment[],
  rankOriginX: number,
  rankOriginY: number,
  facing: number,
  latX: number,
  latY: number,
  targetSpanWidth: number | undefined,
  emitCustomWidth: boolean,
): RankPlacement {
  if (orderedRegs.length === 0) {
    return { targets: [], totalSpan: 0, maxDepth: 0 };
  }

  const naturalFootprints = orderedRegs.map((r) =>
    measureRegimentFootprint(r, targetSpanWidth !== undefined ? r.width : undefined),
  );
  const naturalWidths = orderedRegs.map((r, i) => {
    const fp = measureRegimentFootprint({ ...r, customWidth: undefined });
    return fp.width > 0 ? fp.width : naturalFootprints[i].width;
  });

  const count = orderedRegs.length;
  const totalGap = LINE_LATERAL_GAP * (count - 1);
  const sumNaturalBody = naturalWidths.reduce((acc, w) => acc + w, 0);

  const resolvedFootprints: RegimentFootprint[] = [];
  if (targetSpanWidth !== undefined && Number.isFinite(targetSpanWidth) && targetSpanWidth > 0) {
    const availableBody = Math.max(count * SPACING_INFANTRY, targetSpanWidth - totalGap);
    for (let i = 0; i < count; i++) {
      const share = sumNaturalBody > 0 ? naturalWidths[i] / sumNaturalBody : 1 / count;
      const desiredW = availableBody * share;
      resolvedFootprints.push(measureRegimentFootprint(orderedRegs[i], desiredW));
    }
  } else {
    for (let i = 0; i < count; i++) {
      resolvedFootprints.push(measureRegimentFootprint(orderedRegs[i]));
    }
  }

  const actualTotalSpan =
    resolvedFootprints.reduce((acc, fp) => acc + fp.width, 0) + totalGap;
  let maxDepth = 0;
  for (const fp of resolvedFootprints) {
    if (fp.depth > maxDepth) maxDepth = fp.depth;
  }

  const targets: TwLineTarget[] = [];
  let cursor = -actualTotalSpan * 0.5;

  for (let i = 0; i < count; i++) {
    const reg = orderedRegs[i];
    const fp = resolvedFootprints[i];
    const latOffset = cursor + fp.width * 0.5;
    cursor += fp.width + LINE_LATERAL_GAP;

    const entry: TwLineTarget = {
      regId: reg.id,
      x: Math.round((rankOriginX + latX * latOffset) * 10) / 10,
      y: Math.round((rankOriginY + latY * latOffset) * 10) / 10,
      facing,
    };
    if (emitCustomWidth) {
      entry.width = fp.width;
    }
    targets.push(entry);
  }

  return {
    targets,
    totalSpan: actualTotalSpan,
    maxDepth,
  };
}

/**
 * Tính tọa độ dàn hàng ngang cho 1..15+ trung đoàn quanh `(centerX, centerY)` hướng `facing`:
 * - Khi chọn hỗn hợp Bộ/Kỵ + Cung/Pháo với bề ngang thường: Bộ binh & Kỵ binh đứng tuyến đầu,
 *   Cung nỏ / Pháo đá / Mưu sĩ lùi nhẹ về tuyến hai phía sau không chồng lấn.
 * - Khi người chơi kéo đường dàn quân rất rộng (`totalDraggedWidth` đủ trải toàn quân):
 *   xếp toàn bộ trung đoàn sát cánh trên cùng một tuyến ngang theo vector `(-sin(facing), cos(facing))`.
 */
export function computeMultiRegimentLineTargets(
  regs: TwSimRegiment[],
  centerX: number,
  centerY: number,
  facing: number,
  totalDraggedWidth?: number,
): TwLineTarget[] {
  if (regs.length === 0) return [];

  const normFacing = normalizeAngle(facing);
  const fwdX = Math.cos(normFacing);
  const fwdY = Math.sin(normFacing);
  const latX = -Math.sin(normFacing);
  const latY = Math.cos(normFacing);

  const hasDraggedWidth =
    totalDraggedWidth !== undefined && Number.isFinite(totalDraggedWidth) && totalDraggedWidth > 0;

  if (regs.length === 1) {
    const singleFp = measureRegimentFootprint(regs[0], hasDraggedWidth ? totalDraggedWidth : undefined);
    const singleTarget: TwLineTarget = {
      regId: regs[0].id,
      x: Math.round(centerX * 10) / 10,
      y: Math.round(centerY * 10) / 10,
      facing: normFacing,
    };
    if (hasDraggedWidth) {
      singleTarget.width = singleFp.width;
    }
    return [singleTarget];
  }

  const frontRegs = regs.filter((r) => !isRearSupportUnit(r));
  const rearRegs = regs.filter(isRearSupportUnit);
  const isMixed = frontRegs.length > 0 && rearRegs.length > 0;

  if (!isMixed) {
    const ordered = orderRankRegiments(regs, centerX, centerY, latX, latY);
    return layoutSingleRank(
      ordered,
      centerX,
      centerY,
      normFacing,
      latX,
      latY,
      hasDraggedWidth ? totalDraggedWidth : undefined,
      hasDraggedWidth,
    ).targets;
  }

  // Kiểm tra người chơi có kéo vệt dàn quân đủ rộng để trải tất cả trung đoàn lên 1 hàng ngang hay không
  const allDefaultSpan =
    regs.reduce((acc, r) => acc + measureRegimentFootprint({ ...r, customWidth: undefined }).width, 0) +
    LINE_LATERAL_GAP * (regs.length - 1);

  if (hasDraggedWidth && totalDraggedWidth! >= allDefaultSpan * 0.92) {
    const orderedAll = orderRankRegiments(regs, centerX, centerY, latX, latY);
    return layoutSingleRank(
      orderedAll,
      centerX,
      centerY,
      normFacing,
      latX,
      latY,
      totalDraggedWidth,
      true,
    ).targets;
  }

  // Bố cục 2 tuyến chuẩn Total War: Tuyến 1 Cận chiến/Kỵ binh, Tuyến 2 Cung nỏ/Pháo đá
  const orderedFront = orderRankRegiments(frontRegs, centerX, centerY, latX, latY);
  const orderedRear = orderRankRegiments(rearRegs, centerX, centerY, latX, latY);

  const frontLayout = layoutSingleRank(
    orderedFront,
    centerX,
    centerY,
    normFacing,
    latX,
    latY,
    hasDraggedWidth ? totalDraggedWidth : undefined,
    hasDraggedWidth,
  );

  // Đo độ sâu thực tế của tuyến sau để đảm bảo không bao giờ chạm hộp va chạm tuyến đầu
  const rearNaturalSpan =
    orderedRear.reduce((acc, r) => acc + measureRegimentFootprint(r).width, 0) +
    LINE_LATERAL_GAP * (orderedRear.length - 1);
  const rearTargetSpan = hasDraggedWidth
    ? Math.min(frontLayout.totalSpan, rearNaturalSpan)
    : undefined;

  const tempRearLayout = layoutSingleRank(
    orderedRear,
    centerX,
    centerY,
    normFacing,
    latX,
    latY,
    rearTargetSpan,
    hasDraggedWidth,
  );

  const echelonDist =
    frontLayout.maxDepth * 0.5 + LINE_ECHELON_GAP + tempRearLayout.maxDepth * 0.5;
  const rearOriginX = centerX - fwdX * echelonDist;
  const rearOriginY = centerY - fwdY * echelonDist;

  const rearLayout = layoutSingleRank(
    orderedRear,
    rearOriginX,
    rearOriginY,
    normFacing,
    latX,
    latY,
    rearTargetSpan,
    hasDraggedWidth,
  );

  // Giữ thứ tự kết quả ổn định theo danh sách đầu vào để thuận tiện tra cứu phía gọi
  const byId = new Map<number, TwLineTarget>();
  for (const t of frontLayout.targets) byId.set(t.regId, t);
  for (const t of rearLayout.targets) byId.set(t.regId, t);
  return regs.map((r) => byId.get(r.id)!);
}

// ============================================================================
// 4. MÔ PHỎNG DI CHUYỂN, XOAY CÁNH, XUNG KÍCH & THỂ LỰC 15 HZ
// ============================================================================

function isAliveRegiment(r: TwSimRegiment): boolean {
  return r.men > 0 && r.hp > 0 && r.anim !== 'dead';
}

function isRoutingRegiment(r: TwSimRegiment): boolean {
  return r.moraleState === 'routing' || r.moraleState === 'shattered';
}

function getRegimentRawSpeed(reg: TwSimRegiment): number {
  if (reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]) {
    return TW_GENERALS[reg.generalId].speed;
  }
  return TW_UNITS[reg.kind].speed;
}

function getRegimentTurnRate(reg: TwSimRegiment, routing: boolean): number {
  if (routing) return 4.2;
  if (reg.isGeneral) return 3.4;
  const cat = TW_UNITS[reg.kind].category;
  if (cat === 'cavalry_shock' || cat === 'cavalry_melee') return 3.2;
  if (cat === 'artillery') return 1.35;
  // Trung đoàn kéo hàng quá rộng sẽ xoay cánh chậm hơn đôi chút đúng chất Total War
  const widthPenalty = reg.width > 260 ? clamp(260 / reg.width, 0.65, 1.0) : 1.0;
  return 2.45 * widthPenalty;
}

function rotateToward(currentFacing: number, targetFacing: number, maxStepRad: number): number {
  const diff = shortestAngleDiff(currentFacing, targetFacing);
  if (Math.abs(diff) <= maxStepRad) {
    return normalizeAngle(targetFacing);
  }
  return normalizeAngle(currentFacing + Math.sign(diff) * maxStepRad);
}

/** Bán kính hiệu dụng theo hướng đơn vị `(ux, uy)` của hình chữ nhật bo góc đại diện trung đoàn */
function directionalRegimentExtent(
  reg: Pick<TwSimRegiment, 'width' | 'depth' | 'facing'>,
  ux: number,
  uy: number,
): number {
  const fx = Math.cos(reg.facing);
  const fy = Math.sin(reg.facing);
  const lx = -fy;
  const ly = fx;
  const projF = Math.abs(ux * fx + uy * fy);
  const projL = Math.abs(ux * lx + uy * ly);
  const hd = Math.max(12, reg.depth * 0.45);
  const hw = Math.max(12, reg.width * 0.45);
  const denom = Math.hypot(projF / hd, projL / hw);
  return denom > 1e-6 ? 1 / denom : hd;
}

function steerAwayFromBounds(
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  mapW: number,
  mapH: number,
): [number, number] {
  let sx = dirX;
  let sy = dirY;
  const edgePad = Math.min(110, Math.min(mapW, mapH) * 0.12);

  if (x < edgePad && sx < 0) {
    sx *= Math.max(0, (x - 24) / edgePad);
    sy += (y < mapH * 0.5 ? 1 : -1) * 0.65;
  } else if (x > mapW - edgePad && sx > 0) {
    sx *= Math.max(0, (mapW - 24 - x) / edgePad);
    sy += (y < mapH * 0.5 ? 1 : -1) * 0.65;
  }

  if (y < edgePad && sy < 0) {
    sy *= Math.max(0, (y - 24) / edgePad);
    sx += (x < mapW * 0.5 ? 1 : -1) * 0.65;
  } else if (y > mapH - edgePad && sy > 0) {
    sy *= Math.max(0, (mapH - 24 - y) / edgePad);
    sx += (x < mapW * 0.5 ? 1 : -1) * 0.65;
  }

  const len = Math.hypot(sx, sy);
  if (len < 1e-5) return [dirX, dirY];
  return [sx / len, sy / len];
}

function updateRegimentFatigue(reg: TwSimRegiment, speedNow: number, dtSec: number): void {
  const isMoving = speedNow > STATIONARY_SPEED_EPS;
  let ratePerSec = 0;

  if (reg.duelId !== undefined || reg.anim === 'duel') {
    ratePerSec = 1.4;
  } else if (reg.anim === 'charge') {
    ratePerSec = 3.6;
  } else if (reg.engagedWithId !== undefined || reg.anim === 'attack') {
    ratePerSec = 2.2;
  } else if (reg.anim === 'rout') {
    ratePerSec = 2.8;
  } else if (reg.anim === 'shoot') {
    ratePerSec = 1.1;
  } else if (isMoving) {
    ratePerSec = reg.runOrder ? 1.4 : 0.25;
  } else {
    // Nghỉ tại chỗ hoặc đứng giữ trận giúp hồi phục thể lực
    ratePerSec = -2.6;
  }

  if (isMoving) {
    if (reg.inMud) ratePerSec += 1.6;
    if (reg.inRiver) ratePerSec += 1.8;
  }

  const prevVal = Number.isFinite(reg.fatigueVal) ? reg.fatigueVal : 0;
  reg.fatigueVal = clamp(prevVal + ratePerSec * dtSec, 0, 100);
  reg.fatigue = fatigueStateFromVal(reg.fatigueVal);
}

/**
 * Tính toán vector lách vật cản Yuka (`ObstacleAvoidanceBehavior`) giúp trung đoàn hành quân
 * tự động uốn cong tránh vùng Hỏa Công (`'fire'`) và Chông Gỗ Phản Kỵ của địch (`'stakes'`, `h.team !== reg.team`),
 * trừ khi đang xung phong thẳng vào mục tiêu địch đứng ngay bên trong vùng nguy hiểm (`< 55u`).
 */
function applyYukaHazardAvoidance(
  reg: TwSimRegiment,
  desiredDirX: number,
  desiredDirY: number,
  hazards: ReadonlyArray<TwSteeringHazard> | undefined,
  isMountedUnit: boolean,
  goalPoint?: { x: number; y: number; isEnemyTarget: boolean },
): [number, number] {
  if (!hazards || hazards.length === 0) {
    return [desiredDirX, desiredDirY];
  }

  const latAxisX = -desiredDirY;
  const latAxisY = desiredDirX;
  const selfPad = Math.min(34, reg.width * 0.25) + (isMountedUnit ? 24 : 14);

  let steerLat = 0;
  let repulseX = 0;
  let repulseY = 0;

  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h.kind === 'stakes' && h.team !== undefined && h.team === reg.team) {
      continue;
    }

    // Nếu đang truy kích mục tiêu đứng ngay trong bẫy/lửa (< 55u) thì lao thẳng vào quyết chiến
    if (goalPoint) {
      const distGoalToHaz = Math.hypot(goalPoint.x - h.x, goalPoint.y - h.y);
      if (goalPoint.isEnemyTarget && distGoalToHaz < 55) {
        continue;
      }
      if (!goalPoint.isEnemyTarget && distGoalToHaz < 36) {
        continue;
      }
    }

    const toHazX = h.x - reg.x;
    const toHazY = h.y - reg.y;
    const dist = Math.hypot(toHazX, toHazY);
    const detectLimit = h.radius + 95;
    if (dist >= detectLimit) continue;

    // Chiếu tâm chướng ngại vật lên hệ trục cục bộ Yuka (fwd, lat) của hướng hành quân
    const localFwd = toHazX * desiredDirX + toHazY * desiredDirY;
    if (localFwd < -h.radius * 0.35) continue;

    const localLat = toHazX * latAxisX + toHazY * latAxisY;
    const expandedR = h.radius + selfPad;
    if (Math.abs(localLat) >= expandedR) continue;

    const proximity = clamp(1 - (dist - h.radius) / 95, 0.15, 1.0);
    const latOverlap = clamp(1 - Math.abs(localLat) / Math.max(1, expandedR), 0.15, 1.0);
    const mountWeight = isMountedUnit ? (h.kind === 'stakes' ? 2.45 : 1.9) : 1.35;

    // Lách sang bên thoáng hơn (nếu đi chính diện tâm thì tách chẵn/lẻ theo reg.id)
    const avoidSign =
      Math.abs(localLat) > 2 ? -Math.sign(localLat) : reg.id % 2 === 0 ? 1 : -1;
    steerLat += avoidSign * mountWeight * (0.55 + 0.85 * proximity) * latOverlap;

    if (dist < h.radius + 36 && dist > 1e-4) {
      const pushOut = ((h.radius + 36 - dist) / 36) * (isMountedUnit ? 1.4 : 0.95);
      repulseX -= (toHazX / dist) * pushOut;
      repulseY -= (toHazY / dist) * pushOut;
    }
  }

  if (steerLat === 0 && repulseX === 0 && repulseY === 0) {
    return [desiredDirX, desiredDirY];
  }

  const outX = desiredDirX + latAxisX * steerLat + repulseX;
  const outY = desiredDirY + latAxisY * steerLat + repulseY;
  const outLen = Math.hypot(outX, outY);
  if (outLen < 1e-5) {
    return [desiredDirX, desiredDirY];
  }
  return [outX / outLen, outY / outLen];
}

/**
 * Mô phỏng một bước di chuyển & định hướng đội hình của trung đoàn `reg`:
 * - Tháo chạy (`routing` / `shattered`) ngược hướng quân địch gần nhất.
 * - Cung nỏ thả diều (`skirmishMode && ammo > 0`) lùi giãn cách khi bộ/kỵ địch vào trong `135` đơn vị.
 * - Truy kích mục tiêu khóa (`lockedTargetId`), bật `anim = 'charge'` & cộng `chargeTicks` khi áp sát `<= 190` đơn vị.
 * - Hành quân / chạy tới `(moveTargetX, moveTargetY)` với giảm tốc mượt Yuka `Arrive` ở `28` đơn vị cuối
 *   và lách chướng ngại vật Yuka `ObstacleAvoidance` quanh biển lửa & chông gỗ địch.
 * - Cộng `bracedTicks` & đặt `anim = 'brace'` khi đứng yên trong `spearwall`, `shieldwall`, `circle`.
 * - Đẩy tách mềm giữa các trung đoàn đồng minh không phá vỡ đội hình đang dựng thương.
 * - Cập nhật `fatigueVal` (0..100) sang `fatigue` (`fresh` | `active` | `winded` | `exhausted`).
 */
export function stepRegimentMovement(
  reg: TwSimRegiment,
  allRegs: ReadonlyArray<TwSimRegiment>,
  terrainSpeedMul: number,
  mapW: number,
  mapH: number,
  dtSec: number,
  hazards?: ReadonlyArray<TwSteeringHazard>,
): void {
  if (!(dtSec > 0) || !Number.isFinite(dtSec)) return;

  if (!isAliveRegiment(reg)) {
    reg.vx = 0;
    reg.vy = 0;
    reg.chargeTicks = 0;
    reg.bracedTicks = 0;
    reg.anim = 'dead';
    return;
  }

  const safeMapW = Math.max(100, Number.isFinite(mapW) ? mapW : 3200);
  const safeMapH = Math.max(100, Number.isFinite(mapH) ? mapH : 2200);
  const margin = Math.min(36, Math.max(16, Math.min(safeMapW, safeMapH) * 0.02));

  // Tướng đang Đấu Tướng (Single Duel) đứng khóa vị trí trong võ đài
  if (reg.duelId !== undefined) {
    reg.vx = 0;
    reg.vy = 0;
    reg.chargeTicks = 0;
    reg.bracedTicks = 0;
    reg.anim = 'duel';
    updateRegimentFatigue(reg, 0, dtSec);
    reg.x = clamp(reg.x, margin, safeMapW - margin);
    reg.y = clamp(reg.y, margin, safeMapH - margin);
    return;
  }

  const routing = isRoutingRegiment(reg);
  const formSpec = TW_FORMATIONS[reg.formation] ?? TW_FORMATIONS.line;
  const safeTerrainMul = Number.isFinite(terrainSpeedMul)
    ? clamp(terrainSpeedMul, 0.25, 1.5)
    : 1.0;
  const safeDeploySlow =
    reg.deploySlowMul !== undefined && Number.isFinite(reg.deploySlowMul)
      ? clamp(reg.deploySlowMul, 0.2, 1.2)
      : 1.0;
  const effectiveTerrainMul = safeTerrainMul * safeDeploySlow;
  const safeAuraSpeed =
    Number.isFinite(reg.auraSpeedMul) && reg.auraSpeedMul > 0 ? reg.auraSpeedMul : 1.0;
  const currentFatigue = fatigueStateFromVal(Number.isFinite(reg.fatigueVal) ? reg.fatigueVal : 0);

  const isMountedUnit =
    reg.isGeneral ||
    TW_UNITS[reg.kind].category === 'cavalry_shock' ||
    TW_UNITS[reg.kind].category === 'cavalry_melee';
  const mudCavalryDrag = reg.inMud && isMountedUnit ? 0.8 : 1.0;

  const baseSpeed =
    getRegimentRawSpeed(reg) *
    (routing ? 1.05 : formSpec.speedMul) *
    effectiveTerrainMul *
    mudCavalryDrag *
    safeAuraSpeed *
    fatigueSpeedMul(currentFatigue);

  const turnRate = getRegimentTurnRate(reg, routing);
  const maxTurnStep = turnRate * dtSec;

  // --------------------------------------------------------------------------
  // CHẾ ĐỘ 1: VỠ TRẬN THÁO CHẠY (ROUTING / SHATTERED)
  // --------------------------------------------------------------------------
  if (routing) {
    reg.lockedTargetId = undefined;
    reg.moveTargetX = undefined;
    reg.moveTargetY = undefined;
    reg.moveTargetFacing = undefined;
    reg.engagedWithId = undefined;
    reg.chargeTicks = 0;
    reg.bracedTicks = 0;
    reg.anim = 'rout';

    let nearestEnemy: TwSimRegiment | undefined;
    let nearestDist = Infinity;
    let repulseX = 0;
    let repulseY = 0;

    for (let i = 0; i < allRegs.length; i++) {
      const other = allRegs[i];
      if (other.id === reg.id || other.team === reg.team || !isAliveRegiment(other)) continue;
      const dx = reg.x - other.x;
      const dy = reg.y - other.y;
      const dist = Math.hypot(dx, dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = other;
      }
      if (dist < 320 && dist > 1e-4) {
        const w = 1 / Math.max(20, dist);
        repulseX += (dx / dist) * w;
        repulseY += (dy / dist) * w;
      }
    }

    let fleeX: number;
    let fleeY: number;
    if (nearestEnemy) {
      const dx = reg.x - nearestEnemy.x;
      const dy = reg.y - nearestEnemy.y;
      const d = Math.hypot(dx, dy);
      const primaryX = d > 1e-4 ? dx / d : -Math.cos(reg.facing);
      const primaryY = d > 1e-4 ? dy / d : -Math.sin(reg.facing);
      const bx = primaryX * 1.5 + repulseX;
      const by = primaryY * 1.5 + repulseY;
      const blen = Math.hypot(bx, by);
      fleeX = blen > 1e-4 ? bx / blen : primaryX;
      fleeY = blen > 1e-4 ? by / blen : primaryY;
      [fleeX, fleeY] = steerAwayFromBounds(reg.x, reg.y, fleeX, fleeY, safeMapW, safeMapH);
    } else {
      fleeX = Math.cos(reg.facing);
      fleeY = Math.sin(reg.facing);
    }

    const fleeAngle = Math.atan2(fleeY, fleeX);
    reg.facing = rotateToward(reg.facing, fleeAngle, maxTurnStep);
    reg.vx = fleeX * baseSpeed;
    reg.vy = fleeY * baseSpeed;
    reg.x = clamp(reg.x + reg.vx * dtSec, margin, safeMapW - margin);
    reg.y = clamp(reg.y + reg.vy * dtSec, margin, safeMapH - margin);
    updateRegimentFatigue(reg, baseSpeed, dtSec);
    return;
  }

  // Làm sạch trạng thái giao chiến cận chiến cũ nếu đối phương đã chết, vỡ trận hoặc rời xa
  let engagedEnemy: TwSimRegiment | undefined;
  if (reg.engagedWithId !== undefined) {
    for (let i = 0; i < allRegs.length; i++) {
      const cand = allRegs[i];
      if (cand.id === reg.engagedWithId) {
        engagedEnemy = cand;
        break;
      }
    }
    if (
      !engagedEnemy ||
      engagedEnemy.team === reg.team ||
      !isAliveRegiment(engagedEnemy) ||
      isRoutingRegiment(engagedEnemy) ||
      Math.hypot(engagedEnemy.x - reg.x, engagedEnemy.y - reg.y) > 140
    ) {
      reg.engagedWithId = undefined;
      engagedEnemy = undefined;
    }
  }

  const unitSpec = TW_UNITS[reg.kind];
  const unitRange = reg.isGeneral ? 0 : unitSpec.range;
  const isRangedWithAmmo = unitRange > 0 && reg.ammo > 0;

  // --------------------------------------------------------------------------
  // CHẾ ĐỘ 2: THẢ DIỀU GIỮ KHOẢNG CÁCH (SKIRMISH KITING <= 135 ĐƠN VỊ)
  // --------------------------------------------------------------------------
  if (reg.skirmishMode && isRangedWithAmmo) {
    let kiteX = 0;
    let kiteY = 0;
    let threatCount = 0;

    for (let i = 0; i < allRegs.length; i++) {
      const other = allRegs[i];
      if (
        other.id === reg.id ||
        other.team === reg.team ||
        !isAliveRegiment(other) ||
        isRoutingRegiment(other)
      ) {
        continue;
      }
      const isEnemyMelee = other.isGeneral || TW_UNITS[other.kind].range === 0;
      if (!isEnemyMelee) continue;

      const dx = reg.x - other.x;
      const dy = reg.y - other.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= SKIRMISH_TRIGGER_DIST) {
        threatCount++;
        if (dist > 1e-4) {
          const weight = (SKIRMISH_TRIGGER_DIST + 25 - dist) / SKIRMISH_TRIGGER_DIST;
          kiteX += (dx / dist) * weight;
          kiteY += (dy / dist) * weight;
        } else {
          kiteX -= Math.cos(reg.facing);
          kiteY -= Math.sin(reg.facing);
        }
      }
    }

    if (threatCount > 0) {
      // Nếu người chơi đang ra lệnh chạy lùi cùng chiều thoát hiểm thì ưu tiên lệnh tay;
      // ngược lại tự động kích hoạt lùi chiến thuật giữ khoảng cách bắn.
      let manualRetreatAligned = false;
      if (reg.moveTargetX !== undefined && reg.moveTargetY !== undefined) {
        const mdx = reg.moveTargetX - reg.x;
        const mdy = reg.moveTargetY - reg.y;
        if (mdx * kiteX + mdy * kiteY > 0 && Math.hypot(mdx, mdy) > 25) {
          manualRetreatAligned = true;
        }
      }

      if (!manualRetreatAligned) {
        const kLen = Math.hypot(kiteX, kiteY);
        let dirX = kLen > 1e-4 ? kiteX / kLen : -Math.cos(reg.facing);
        let dirY = kLen > 1e-4 ? kiteY / kLen : -Math.sin(reg.facing);
        [dirX, dirY] = steerAwayFromBounds(reg.x, reg.y, dirX, dirY, safeMapW, safeMapH);

        const kiteSpeed = baseSpeed * (engagedEnemy ? 0.6 : 1.0);
        reg.facing = rotateToward(reg.facing, Math.atan2(dirY, dirX), maxTurnStep);
        reg.vx = dirX * kiteSpeed;
        reg.vy = dirY * kiteSpeed;
        reg.chargeTicks = 0;
        reg.bracedTicks = 0;
        reg.anim = 'march';

        reg.x += reg.vx * dtSec;
        reg.y += reg.vy * dtSec;
        applyFriendlySoftSeparation(reg, allRegs, dtSec);
        reg.x = clamp(reg.x, margin, safeMapW - margin);
        reg.y = clamp(reg.y, margin, safeMapH - margin);
        updateRegimentFatigue(reg, kiteSpeed, dtSec);
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // CHẾ ĐỘ 3: TRUY KÍCH & XUNG PHONG MỤC TIÊU KHÓA (LOCKED TARGET PURSUIT)
  // --------------------------------------------------------------------------
  if (reg.lockedTargetId !== undefined) {
    let target: TwSimRegiment | undefined;
    for (let i = 0; i < allRegs.length; i++) {
      const cand = allRegs[i];
      if (cand.id === reg.lockedTargetId) {
        target = cand;
        break;
      }
    }

    const invalidTarget =
      !target ||
      target.team === reg.team ||
      !isAliveRegiment(target) ||
      target.hidden ||
      target.moraleState === 'shattered' ||
      (reg.guardMode && isRoutingRegiment(target));

    if (invalidTarget) {
      reg.lockedTargetId = undefined;
      reg.chargeTicks = 0;
    } else if (target) {
      const dx = target.x - reg.x;
      const dy = target.y - reg.y;
      const dist = Math.hypot(dx, dy);
      const angleToTarget = dist > 1e-4 ? Math.atan2(dy, dx) : reg.facing;

      if (isRangedWithAmmo) {
        // Đơn vị tầm xa còn tên đạn: tiến tới tầm bắn hiệu quả (có tính +20% tầm đồi cao) rồi dừng xoay mặt xạ kích
        const effectiveStopRange = unitRange * (reg.onHighGround ? 1.2 : 1.0) * 0.92;
        if (dist > effectiveStopRange) {
          let ux = dx / dist;
          let uy = dy / dist;
          if (!engagedEnemy && dist > 140) {
            [ux, uy] = applyYukaHazardAvoidance(reg, ux, uy, hazards, isMountedUnit, {
              x: target.x,
              y: target.y,
              isEnemyTarget: true,
            });
          }
          const steerAngle = Math.atan2(uy, ux);
          reg.facing = rotateToward(reg.facing, steerAngle, maxTurnStep);
          const angleErr = Math.abs(shortestAngleDiff(reg.facing, steerAngle));
          const wheelMul = Math.max(0.4, Math.cos(Math.min(angleErr, 1.2)));
          const moveSpd = baseSpeed * (reg.runOrder ? 1.0 : 0.72) * wheelMul;
          reg.vx = ux * moveSpd;
          reg.vy = uy * moveSpd;
          reg.chargeTicks = 0;
          reg.bracedTicks = 0;
          reg.anim = 'march';
          reg.x += reg.vx * dtSec;
          reg.y += reg.vy * dtSec;
        } else {
          reg.vx = 0;
          reg.vy = 0;
          reg.chargeTicks = 0;
          reg.bracedTicks = 0;
          reg.facing = rotateToward(reg.facing, angleToTarget, maxTurnStep);
          const preserveShoot =
            reg.anim === 'shoot' && reg.reloadLeftSec > unitSpec.reloadSec * 0.55;
          reg.anim = preserveShoot ? 'shoot' : 'idle';
        }
      } else {
        // Đơn vị cận chiến / Kỵ binh / Tướng (hoặc cung binh đã cạn sạch tên): áp sát & Xung phong!
        let ux = dist > 1e-4 ? dx / dist : Math.cos(reg.facing);
        let uy = dist > 1e-4 ? dy / dist : Math.sin(reg.facing);
        const selfExt = clamp(directionalRegimentExtent(reg, ux, uy), 16, 54);
        const tgtExt = clamp(directionalRegimentExtent(target, -ux, -uy), 16, 60);
        const contactDist = Math.max(32, (selfExt + tgtExt) * 0.85);

        if (!engagedEnemy && dist > 140) {
          [ux, uy] = applyYukaHazardAvoidance(reg, ux, uy, hazards, isMountedUnit, {
            x: target.x,
            y: target.y,
            isEnemyTarget: true,
          });
        }

        const steerAngle = Math.atan2(uy, ux);
        reg.facing = rotateToward(reg.facing, dist > 140 ? steerAngle : angleToTarget, maxTurnStep);
        reg.bracedTicks = 0;

        if (dist > contactDist) {
          const isCharging = dist <= CHARGE_TRIGGER_DIST;
          if (isCharging) {
            reg.anim = 'charge';
            reg.chargeTicks = Math.min(600, reg.chargeTicks + 1);
          } else {
            reg.anim = 'march';
            reg.chargeTicks = 0;
          }

          const angleErr = Math.abs(
            shortestAngleDiff(reg.facing, dist > 140 ? steerAngle : angleToTarget),
          );
          const wheelMul = Math.max(0.4, Math.cos(Math.min(angleErr, 1.2)));
          const chargeBurst = isCharging ? 1.18 : 1.0;
          const pursuitSpd = baseSpeed * chargeBurst * wheelMul;
          const stepDist = Math.min(pursuitSpd * dtSec, Math.max(0, dist - contactDist * 0.94));
          const actualSpd = stepDist / dtSec;

          reg.vx = ux * actualSpd;
          reg.vy = uy * actualSpd;
          reg.x += ux * stepDist;
          reg.y += uy * stepDist;
        } else {
          // Đã chạm mặt tuyến địch: giữ `chargeTicks` ở nhịp va chạm đầu để `combat.ts` tính sát thương húc!
          reg.vx = 0;
          reg.vy = 0;
          if (reg.engagedWithId === undefined) {
            reg.chargeTicks = Math.max(1, reg.chargeTicks + 1);
            reg.anim = 'charge';
          } else {
            reg.chargeTicks = Math.max(0, reg.chargeTicks - 1);
            reg.anim = 'attack';
          }
        }
      }

      applyFriendlySoftSeparation(reg, allRegs, dtSec);
      reg.x = clamp(reg.x, margin, safeMapW - margin);
      reg.y = clamp(reg.y, margin, safeMapH - margin);
      updateRegimentFatigue(reg, Math.hypot(reg.vx, reg.vy), dtSec);
      return;
    }
  }

  // --------------------------------------------------------------------------
  // CHẾ ĐỘ 4: HÀNH QUÂN / CHẠY TỚI ĐIỂM ĐẾN & XOAY ĐỘI HÌNH KHI ĐẾN ĐÍCH
  // --------------------------------------------------------------------------
  if (reg.moveTargetX !== undefined && reg.moveTargetY !== undefined) {
    const dx = reg.moveTargetX - reg.x;
    const dy = reg.moveTargetY - reg.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= MOVE_ARRIVE_EPS) {
      reg.x = reg.moveTargetX;
      reg.y = reg.moveTargetY;
      reg.moveTargetX = undefined;
      reg.moveTargetY = undefined;
      reg.vx = 0;
      reg.vy = 0;
    } else {
      let ux = dx / dist;
      let uy = dy / dist;
      if (!engagedEnemy && dist > 28) {
        [ux, uy] = applyYukaHazardAvoidance(reg, ux, uy, hazards, isMountedUnit, {
          x: reg.moveTargetX,
          y: reg.moveTargetY,
          isEnemyTarget: false,
        });
      }

      const travelAngle = Math.atan2(uy, ux);
      reg.facing = rotateToward(reg.facing, travelAngle, maxTurnStep);

      const angleErr = Math.abs(shortestAngleDiff(reg.facing, travelAngle));
      const wheelMul =
        reg.formation === 'circle' ? 1.0 : Math.max(0.35, Math.cos(Math.min(angleErr, 1.25)));
      const paceMul = reg.runOrder ? 1.0 : 0.68;
      // Rút quân khỏi cận chiến bị ghìm tốc độ nhẹ cho đến khi thoát hẳn vòng vây
      const disengageMul = engagedEnemy ? 0.64 : 1.0;
      // Giảm tốc mượt Yuka Arrive ở 28 đơn vị cuối giúp đội hình khép hàng gọn gàng không rung giật
      const arriveMul = !engagedEnemy && dist < 28 ? clamp(0.32 + 0.68 * (dist / 28), 0.32, 1.0) : 1.0;
      const moveSpd = baseSpeed * paceMul * wheelMul * disengageMul * arriveMul;
      const stepDist = moveSpd * dtSec;

      reg.chargeTicks = 0;
      reg.bracedTicks = 0;
      reg.anim = 'march';

      if (stepDist >= dist) {
        reg.vx = (dx / dtSec) * 0.5;
        reg.vy = (dy / dtSec) * 0.5;
        reg.x = reg.moveTargetX;
        reg.y = reg.moveTargetY;
        reg.moveTargetX = undefined;
        reg.moveTargetY = undefined;
        reg.vx = 0;
        reg.vy = 0;
      } else {
        // Pha trộn nhẹ hướng mặt hiện tại khi góc lệch nhỏ để tạo quỹ đạo xoay cánh cong tự nhiên (tắt khi đang phanh Arrive < 28u)
        const blend = dist >= 28 && angleErr < 0.65 && reg.formation !== 'circle' ? 0.25 : 0;
        const bx = ux * (1 - blend) + Math.cos(reg.facing) * blend;
        const by = uy * (1 - blend) + Math.sin(reg.facing) * blend;
        const blen = Math.hypot(bx, by) || 1;
        reg.vx = (bx / blen) * moveSpd;
        reg.vy = (by / blen) * moveSpd;
        reg.x += reg.vx * dtSec;
        reg.y += reg.vy * dtSec;
      }

      if (engagedEnemy && Math.hypot(engagedEnemy.x - reg.x, engagedEnemy.y - reg.y) > 95) {
        reg.engagedWithId = undefined;
      }

      applyFriendlySoftSeparation(reg, allRegs, dtSec);
      reg.x = clamp(reg.x, margin, safeMapW - margin);
      reg.y = clamp(reg.y, margin, safeMapH - margin);
      updateRegimentFatigue(reg, Math.hypot(reg.vx, reg.vy), dtSec);
      return;
    }
  }

  // --------------------------------------------------------------------------
  // CHẾ ĐỘ 5: ĐỨNG YÊN TẠI CHỖ — XOAY HƯỚNG ĐÍCH, CẬN CHIẾN HOẶC DỰNG THƯƠNG (BRACE)
  // --------------------------------------------------------------------------
  reg.vx = 0;
  reg.vy = 0;

  if (reg.moveTargetFacing !== undefined) {
    const diff = shortestAngleDiff(reg.facing, reg.moveTargetFacing);
    if (Math.abs(diff) <= maxTurnStep || Math.abs(diff) < 0.015) {
      reg.facing = normalizeAngle(reg.moveTargetFacing);
      reg.moveTargetFacing = undefined;
    } else {
      reg.facing = rotateToward(reg.facing, reg.moveTargetFacing, maxTurnStep);
    }
  } else if (engagedEnemy && !isBraceFormation(reg.formation)) {
    const faceEnemy = Math.atan2(engagedEnemy.y - reg.y, engagedEnemy.x - reg.x);
    reg.facing = rotateToward(reg.facing, faceEnemy, maxTurnStep * 0.65);
  }

  if (engagedEnemy) {
    reg.chargeTicks = Math.max(0, reg.chargeTicks - 1);
    if (isBraceFormation(reg.formation)) {
      reg.bracedTicks = Math.min(900, reg.bracedTicks + 1);
    } else {
      reg.bracedTicks = 0;
    }
    reg.anim = 'attack';
  } else {
    reg.chargeTicks = 0;
    if (isBraceFormation(reg.formation)) {
      reg.bracedTicks = Math.min(900, reg.bracedTicks + 1);
      reg.anim = 'brace';
    } else {
      reg.bracedTicks = 0;
      const preserveShoot =
        isRangedWithAmmo && reg.anim === 'shoot' && reg.reloadLeftSec > unitSpec.reloadSec * 0.55;
      reg.anim = preserveShoot ? 'shoot' : 'idle';
    }
  }

  applyFriendlySoftSeparation(reg, allRegs, dtSec);
  reg.x = clamp(reg.x, margin, safeMapW - margin);
  reg.y = clamp(reg.y, margin, safeMapH - margin);
  updateRegimentFatigue(reg, 0, dtSec);
}

/**
 * Tách va chạm mềm giữa các trung đoàn đồng minh dựa trên bán kính hình học có hướng (elip đội hình).
 * Trung đoàn đang cắm thương / dựng khiên đứng yên (`bracedTicks > 0`) được ưu tiên giữ vững vị trí
 * để đồng minh hành quân ngang qua tự lách vòng mà không làm mất trạng thái `brace`.
 */
function applyFriendlySoftSeparation(
  reg: TwSimRegiment,
  allRegs: ReadonlyArray<TwSimRegiment>,
  dtSec: number,
): void {
  const selfStationaryBraced =
    Math.hypot(reg.vx, reg.vy) < STATIONARY_SPEED_EPS && reg.bracedTicks > 0;

  let pushX = 0;
  let pushY = 0;

  for (let i = 0; i < allRegs.length; i++) {
    const other = allRegs[i];
    if (
      other.id === reg.id ||
      other.team !== reg.team ||
      !isAliveRegiment(other) ||
      other.duelId !== undefined
    ) {
      continue;
    }

    const dx = reg.x - other.x;
    const dy = reg.y - other.y;
    const maxPossible = (reg.width + other.width) * 0.52;
    if (Math.abs(dx) > maxPossible || Math.abs(dy) > maxPossible) continue;

    const dist = Math.hypot(dx, dy);
    const ux = dist > 1e-3 ? dx / dist : reg.id > other.id ? 1 : -1;
    const uy = dist > 1e-3 ? dy / dist : 0;

    const minSep =
      (directionalRegimentExtent(reg, ux, uy) + directionalRegimentExtent(other, -ux, -uy)) * 0.88;
    if (dist >= minSep) continue;

    const otherMoving = Math.hypot(other.vx, other.vy) >= STATIONARY_SPEED_EPS;
    if (selfStationaryBraced && otherMoving) {
      // Nhường toàn bộ lực tách cho đơn vị đồng minh đang di chuyển để bảo toàn đội hình dựng thương
      continue;
    }

    const otherBraced =
      !otherMoving && other.bracedTicks > 0 && isBraceFormation(other.formation);
    const share = otherBraced && !selfStationaryBraced ? 0.9 : 0.5;
    const overlap = minSep - dist;
    const pushMag = Math.min(overlap * share, 38 * dtSec);

    pushX += ux * pushMag;
    pushY += uy * pushMag;
  }

  if (pushX !== 0 || pushY !== 0) {
    const maxStep = 42 * dtSec;
    const pLen = Math.hypot(pushX, pushY);
    if (pLen > maxStep) {
      pushX = (pushX / pLen) * maxStep;
      pushY = (pushY / pLen) * maxStep;
    }
    reg.x += pushX;
    reg.y += pushY;
  }
}

// ============================================================================
// 5. XÁC ĐỊNH VÙNG TIẾP CHIẾN: CHÍNH DIỆN / TẠT SƯỜN / BỌC HẬU (FLANKING)
// ============================================================================

/**
 * Xác định hướng đòn tấn công từ `(attackerX, attackerY)` lên trung đoàn `defender`:
 * - Nếu trận hình của `defender` có `antiFlank: true` (`circle` – Viên Trận), luôn trả về `'front'`.
 * - Dùng tích vô hướng giữa vector đơn vị `(attacker - defender)` và hướng mặt `(cos(facing), sin(facing))`:
 *   + `dot >= 0.5` (cung 120° phía trước): `'front'`
 *   + `-0.5 < dot < 0.5` (hai cánh trái/phải): `'flank'`
 *   + `dot <= -0.5` (cung 120° phía sau lưng): `'rear'`
 */
export function computeFlankZone(
  attackerX: number,
  attackerY: number,
  defender: Pick<TwSimRegiment, 'x' | 'y' | 'facing' | 'formation'>,
): TwFlankZone {
  const formSpec = TW_FORMATIONS[defender.formation];
  if (formSpec?.antiFlank) {
    return 'front';
  }

  const dx = attackerX - defender.x;
  const dy = attackerY - defender.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return 'front';
  }

  const ux = dx / len;
  const uy = dy / len;
  const fx = Math.cos(defender.facing);
  const fy = Math.sin(defender.facing);
  const dot = ux * fx + uy * fy;

  if (dot >= 0.5) return 'front';
  if (dot <= -0.5) return 'rear';
  return 'flank';
}
