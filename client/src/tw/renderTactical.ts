/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Bộ dựng Lớp Phủ Chiến Thuật Mặt Đất (Tactical Underlays) & Quỹ Đạo Khai Hỏa Đỏ Thẫm 3D (Crimson Trajectories).
 *
 * Phụ trách:
 * 1. `renderTwTacticalUnderlays`:
 *    - Vòng tầm bắn Trắng Sắc Nét (Crisp White Firing Range Circle & Forward Sector Arc) quanh trung đoàn cung/nỏ/pháo đang chọn.
 *    - Vòng hào quang Ngũ Hành (Wu Xing Aura Ring) quanh Danh Tướng đang chọn.
 *    - Véc-tơ hành quân Xanh Ngọc / Trắng Sáng + khung vị trí đích (`moveTargetX, moveTargetY`).
 *    - Xem trước Dàn Quân Kéo Chuột Phải (`dragPreview`): tính toán chính xác ô đội hình đa trung đoàn và vẽ từng chấm lính
 *      (Individual Soldier Dots) phát sáng Xanh Ngọc & Hoàng Kim theo đúng Hàng × Cột (Ranks × Files) kèm mũi tên hướng mặt!
 * 2. `renderTwRedTrajectories`:
 *    - Dải lụa quỹ đạo cong vòm 3D màu Đỏ Thẫm đặc trưng Total War: Three Kingdoms (`rgba(210, 38, 30, 0.72)` viền đỏ sẫm
 *      kèm xung ánh sáng chạy dọc chiều bắn) nối từ hàng quân đầu của mọi trung đoàn đang bắn / xung kích tới mục tiêu địch!
 */

import {
  TW_CLASSES,
  TW_DEPLOYABLES,
  TW_FORMATIONS,
  TW_GENERALS,
  TW_UNITS,
  type TwBattlePhase,
  type TwDeployZoneSpec,
  type TwDeployableKind,
  type TwMapSpec,
  type TwRegimentFrame,
  type TwSideSummary,
  type TwUnitCategory,
  type TwUnitKind,
} from '../../../shared/src/tw';
import { TW_ISO_TILT, worldToScreen, type TwCamera, type TwDragLinePreview } from './camera';

/** Tùy chọn lớp phủ Pha Bố Trận Đại Quân & Đặt Bẫy Công Binh Chiến Trường (tùy chọn tham số thứ 10) */
export interface TwTacticalDeployOverlay {
  battlePhase?: TwBattlePhase;
  myDeployZone?: TwDeployZoneSpec;
  mapSpec?: TwMapSpec;
  hasVanguardSelected?: boolean;
  placementKind?: TwDeployableKind | null;
  hoverWorld?: { wx: number; wy: number } | null;
  hoveredRegId?: number | null;
  placementFacing?: number;
}

// ============================================================================
// 1. HẰNG SỐ HÌNH HỌC ĐỘI HÌNH (ĐỒNG BỘ 100% VỚI MÁY CHỦ `formations.ts`)
// ============================================================================

const SPACING_INFANTRY = 11;
const SPACING_CAVALRY = 18;
const SPACING_ARTILLERY = 26;
const SPACING_GENERAL = 24;

const LINE_LATERAL_GAP = 18;
const LINE_ECHELON_GAP = 38;

const HIGH_GROUND_RANGE_MUL = 1.2;

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function normalizeAngle(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function shortestAngleDiff(fromRad: number, toRad: number): number {
  return normalizeAngle(toRad - fromRad);
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(240, 180, 60, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isAliveReg(reg: TwRegimentFrame): boolean {
  return reg.men > 0 && reg.hp > 0 && reg.anim !== 'dead';
}

function isBrokenReg(reg: TwRegimentFrame): boolean {
  return reg.moraleState === 'routing' || reg.moraleState === 'shattered' || reg.anim === 'rout';
}

// ============================================================================
// 2. TÍNH TOÁN Ô ĐỘI HÌNH & TỌA ĐỘ TỪNG CHẤM LÍNH KHI KÉO CHUỘT PHẢI
// ============================================================================

interface PreviewFootprint {
  cols: number;
  rows: number;
  width: number;
  depth: number;
  spacing: number;
}

interface PreviewRegimentSlot {
  reg: TwRegimentFrame;
  x: number;
  y: number;
  facing: number;
  fp: PreviewFootprint;
}

function getUnitBaseSpacing(kind: TwUnitKind, isGeneral: boolean): number {
  if (isGeneral) return SPACING_GENERAL;
  const spec = TW_UNITS[kind];
  switch (spec.category) {
    case 'cavalry_shock':
    case 'cavalry_melee':
      return SPACING_CAVALRY;
    case 'artillery':
      return SPACING_ARTILLERY;
    default:
      return SPACING_INFANTRY;
  }
}

function measurePreviewFootprint(
  reg: TwRegimentFrame,
  overrideWidth?: number,
  ignoreCurrentCols = false,
): PreviewFootprint {
  const activeMen = Math.max(1, Math.round(Number.isFinite(reg.men) ? reg.men : 1));
  const formSpec = TW_FORMATIONS[reg.formation] ?? TW_FORMATIONS.line;
  const baseSpacing = getUnitBaseSpacing(reg.kind, reg.isGeneral);
  const spacing = baseSpacing * formSpec.spreadMul;

  if (activeMen <= 1) {
    const single = Math.max(baseSpacing, spacing);
    return { cols: 1, rows: 1, width: single, depth: single, spacing };
  }

  if (reg.formation === 'circle') {
    const cols = clamp(Math.round(Math.sqrt(activeMen * formSpec.defaultColsRatio)), 1, activeMen);
    const rows = Math.max(1, Math.ceil(activeMen / cols));
    return {
      cols,
      rows,
      width: cols * spacing,
      depth: rows * spacing,
      spacing,
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
    minRanks = Math.min(activeMen, 2);
    maxRanks = Math.max(minRanks, Math.min(activeMen, 15));
    minColsHard = Math.min(activeMen, 4);
  }

  const maxCols = Math.max(1, Math.ceil(activeMen / minRanks));
  const minCols = Math.min(maxCols, Math.max(minColsHard, Math.ceil(activeMen / maxRanks)));

  const rawCols =
    overrideWidth !== undefined && Number.isFinite(overrideWidth) && overrideWidth > 0
      ? Math.round(overrideWidth / Math.max(1, spacing))
      : !ignoreCurrentCols && reg.cols > 0
        ? reg.cols
        : Math.round(Math.sqrt(activeMen * formSpec.defaultColsRatio));

  const cols = clamp(rawCols, minCols, Math.min(activeMen, maxCols));
  const rows = Math.max(1, Math.ceil(activeMen / cols));

  return {
    cols,
    rows,
    width: cols * spacing,
    depth: rows * spacing,
    spacing,
  };
}

function isRearSupportReg(reg: TwRegimentFrame): boolean {
  if (reg.isGeneral) {
    const genSpec = reg.generalId ? TW_GENERALS[reg.generalId] : undefined;
    return genSpec?.class === 'strategist';
  }
  const cat = TW_UNITS[reg.kind].category;
  return cat === 'ranged_bow' || cat === 'ranged_crossbow' || cat === 'artillery';
}

function isWingCavalryReg(reg: TwRegimentFrame): boolean {
  if (reg.isGeneral) return false;
  const cat = TW_UNITS[reg.kind].category;
  return cat === 'cavalry_shock' || cat === 'cavalry_melee';
}

function orderRankRegs(
  regs: TwRegimentFrame[],
  centerX: number,
  centerY: number,
  latX: number,
  latY: number,
): TwRegimentFrame[] {
  const byLateral = [...regs].sort((a, b) => {
    const pa = (a.x - centerX) * latX + (a.y - centerY) * latY;
    const pb = (b.x - centerX) * latX + (b.y - centerY) * latY;
    if (Math.abs(pa - pb) > 0.5) return pa - pb;
    return a.id - b.id;
  });

  const cavs = byLateral.filter(isWingCavalryReg);
  const nonCavs = byLateral.filter((r) => !isWingCavalryReg(r));
  if (cavs.length === 0 || nonCavs.length === 0) return byLateral;

  const leftCount = Math.ceil(cavs.length / 2);
  return [...cavs.slice(0, leftCount), ...nonCavs, ...cavs.slice(leftCount)];
}

function layoutPreviewRank(
  orderedRegs: TwRegimentFrame[],
  originX: number,
  originY: number,
  facing: number,
  latX: number,
  latY: number,
  targetSpanWidth?: number,
): { slots: PreviewRegimentSlot[]; totalSpan: number; maxDepth: number } {
  if (orderedRegs.length === 0) {
    return { slots: [], totalSpan: 0, maxDepth: 0 };
  }

  const count = orderedRegs.length;
  const totalGap = LINE_LATERAL_GAP * (count - 1);
  const defaultFps = orderedRegs.map((r) => {
    const formSpec = TW_FORMATIONS[r.formation] ?? TW_FORMATIONS.line;
    const sp = getUnitBaseSpacing(r.kind, r.isGeneral) * formSpec.spreadMul;
    const defCols = Math.max(1, Math.round(Math.sqrt(Math.max(1, r.men) * formSpec.defaultColsRatio)));
    return Math.max(sp, defCols * sp);
  });
  const sumDefaultW = defaultFps.reduce((a, b) => a + b, 0);

  const resolved: PreviewFootprint[] = [];
  if (targetSpanWidth !== undefined && targetSpanWidth > 0) {
    const availBody = Math.max(count * SPACING_INFANTRY, targetSpanWidth - totalGap);
    for (let i = 0; i < count; i++) {
      const share = sumDefaultW > 0 ? defaultFps[i] / sumDefaultW : 1 / count;
      resolved.push(measurePreviewFootprint(orderedRegs[i], availBody * share));
    }
  } else {
    for (let i = 0; i < count; i++) {
      resolved.push(measurePreviewFootprint(orderedRegs[i]));
    }
  }

  const actualSpan = resolved.reduce((acc, fp) => acc + fp.width, 0) + totalGap;
  let maxDepth = 0;
  for (const fp of resolved) {
    if (fp.depth > maxDepth) maxDepth = fp.depth;
  }

  const slots: PreviewRegimentSlot[] = [];
  let cursor = -actualSpan * 0.5;
  for (let i = 0; i < count; i++) {
    const fp = resolved[i];
    const latOffset = cursor + fp.width * 0.5;
    cursor += fp.width + LINE_LATERAL_GAP;
    slots.push({
      reg: orderedRegs[i],
      x: originX + latX * latOffset,
      y: originY + latY * latOffset,
      facing,
      fp,
    });
  }

  return { slots, totalSpan: actualSpan, maxDepth };
}

function computeDragPreviewSlots(
  selectedRegs: TwRegimentFrame[],
  preview: TwDragLinePreview,
): PreviewRegimentSlot[] {
  if (selectedRegs.length === 0) return [];

  const normFacing = normalizeAngle(preview.facing);
  const fwdX = Math.cos(normFacing);
  const fwdY = Math.sin(normFacing);
  const latX = -Math.sin(normFacing);
  const latY = Math.cos(normFacing);
  const draggedW =
    preview.width > 0 ? clamp(Math.round(preview.width), 28, 1900) : undefined;

  if (selectedRegs.length === 1) {
    return [
      {
        reg: selectedRegs[0],
        x: preview.centerX,
        y: preview.centerY,
        facing: normFacing,
        fp: measurePreviewFootprint(selectedRegs[0], draggedW),
      },
    ];
  }

  const frontRegs = selectedRegs.filter((r) => !isRearSupportReg(r));
  const rearRegs = selectedRegs.filter(isRearSupportReg);
  const isMixed = frontRegs.length > 0 && rearRegs.length > 0;

  if (!isMixed) {
    const ordered = orderRankRegs(selectedRegs, preview.centerX, preview.centerY, latX, latY);
    return layoutPreviewRank(
      ordered,
      preview.centerX,
      preview.centerY,
      normFacing,
      latX,
      latY,
      draggedW,
    ).slots;
  }

  const allDefaultSpan =
    selectedRegs.reduce((acc, r) => acc + measurePreviewFootprint(r, undefined, true).width, 0) +
    LINE_LATERAL_GAP * (selectedRegs.length - 1);

  if (draggedW !== undefined && draggedW >= allDefaultSpan * 0.92) {
    const orderedAll = orderRankRegs(selectedRegs, preview.centerX, preview.centerY, latX, latY);
    return layoutPreviewRank(
      orderedAll,
      preview.centerX,
      preview.centerY,
      normFacing,
      latX,
      latY,
      draggedW,
    ).slots;
  }

  const orderedFront = orderRankRegs(frontRegs, preview.centerX, preview.centerY, latX, latY);
  const orderedRear = orderRankRegs(rearRegs, preview.centerX, preview.centerY, latX, latY);

  const frontLayout = layoutPreviewRank(
    orderedFront,
    preview.centerX,
    preview.centerY,
    normFacing,
    latX,
    latY,
    draggedW,
  );

  const rearNatSpan =
    orderedRear.reduce((acc, r) => acc + measurePreviewFootprint(r, undefined, true).width, 0) +
    LINE_LATERAL_GAP * (orderedRear.length - 1);
  const rearTargetSpan =
    draggedW !== undefined ? Math.min(frontLayout.totalSpan, rearNatSpan) : undefined;

  const tempRear = layoutPreviewRank(
    orderedRear,
    preview.centerX,
    preview.centerY,
    normFacing,
    latX,
    latY,
    rearTargetSpan,
  );

  const echelonDist = frontLayout.maxDepth * 0.5 + LINE_ECHELON_GAP + tempRear.maxDepth * 0.5;
  const rearLayout = layoutPreviewRank(
    orderedRear,
    preview.centerX - fwdX * echelonDist,
    preview.centerY - fwdY * echelonDist,
    normFacing,
    latX,
    latY,
    rearTargetSpan,
  );

  return [...frontLayout.slots, ...rearLayout.slots];
}

// ============================================================================
// 3. CÁC LỚP VẼ CHIẾN THUẬT MẶT ĐẤT (TACTICAL UNDERLAYS)
// ============================================================================

/**
 * Vòng Hào Quang Ngũ Hành Cuồng Nộ Báo Thù (`guanxiState === 'enraged'`) đỏ thẫm - hoàng kim
 * đập mạnh dưới chân Danh Tướng đang được chọn / trỏ chuột.
 */
function renderEnragedGuanxiUnderRing(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  cam: TwCamera,
  timeSec: number,
): void {
  const invZoom = 1 / cam.zoom;
  const beat = 0.5 + 0.5 * Math.sin(timeSec * 6.8 + reg.id * 1.1);
  const baseR = reg.isGeneral ? 36 : Math.max(24, Math.max(reg.width, reg.depth) * 0.58);
  const pulseR = baseR * (0.94 + 0.16 * beat);

  ctx.save();
  ctx.translate(reg.x, reg.y);

  // Vầng lửa đỏ thẫm pha ánh kim rực cháy dưới móng chiến mã
  const rageGrad = ctx.createRadialGradient(0, 0, baseR * 0.25, 0, 0, pulseR * 1.28);
  rageGrad.addColorStop(0, 'rgba(255, 212, 59, 0.34)');
  rageGrad.addColorStop(0.55, `rgba(224, 42, 32, ${(0.28 + 0.16 * beat).toFixed(3)})`);
  rageGrad.addColorStop(1, 'rgba(180, 20, 14, 0)');
  ctx.fillStyle = rageGrad;
  ctx.beginPath();
  ctx.arc(0, 0, pulseR * 1.28, 0, Math.PI * 2);
  ctx.fill();

  // 8 cánh hỏa liên Ngũ Hành xoay ngược chiều nhau
  ctx.save();
  ctx.rotate(-timeSec * 0.85);
  const petals = 8;
  for (let k = 0; k < petals; k++) {
    const a = (k * Math.PI * 2) / petals;
    const tipR = pulseR + (7 + 4 * beat) * invZoom;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.16) * (pulseR * 0.86), Math.sin(a - 0.16) * (pulseR * 0.86));
    ctx.lineTo(Math.cos(a) * tipR, Math.sin(a) * tipR);
    ctx.lineTo(Math.cos(a + 0.16) * (pulseR * 0.86), Math.sin(a + 0.16) * (pulseR * 0.86));
    ctx.closePath();
    ctx.fillStyle = k % 2 === 0 ? 'rgba(255, 72, 42, 0.78)' : 'rgba(255, 212, 59, 0.78)';
    ctx.fill();
  }
  ctx.restore();

  // Vòng đôi Đỏ Chu Sa & Hoàng Kim đập nhịp báo thù
  ctx.strokeStyle = `rgba(224, 38, 28, ${(0.88 - 0.2 * beat).toFixed(3)})`;
  ctx.lineWidth = 3.1 * invZoom;
  ctx.beginPath();
  ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 218, 76, ${(0.72 + 0.25 * beat).toFixed(3)})`;
  ctx.lineWidth = 1.6 * invZoom;
  ctx.setLineDash([8 * invZoom, 5 * invZoom]);
  ctx.lineDashOffset = -timeSec * 22 * invZoom;
  ctx.beginPath();
  ctx.arc(0, 0, baseR * 0.84, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

function renderSelectedGeneralAura(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  cam: TwCamera,
  timeSec: number,
): void {
  const genSpec = reg.generalId ? TW_GENERALS[reg.generalId] : undefined;
  const clsSpec = genSpec ? TW_CLASSES[genSpec.class] : TW_CLASSES.commander;
  const radius = clsSpec.auraRadius;
  const isEnraged = reg.guanxiState === 'enraged';
  const color = isEnraged ? '#ff4028' : clsSpec.color;
  const pulse = 0.82 + 0.18 * Math.sin(timeSec * (isEnraged ? 5.2 : 2.8) + reg.id);

  ctx.save();
  ctx.translate(reg.x, reg.y);

  // Vầng hào quang Ngũ Hành chuyển sắc mịn ở rìa ngoài
  const auraGrad = ctx.createRadialGradient(0, 0, radius * 0.66, 0, 0, radius);
  auraGrad.addColorStop(0, hexToRgba(color, 0));
  auraGrad.addColorStop(0.75, hexToRgba(color, (isEnraged ? 0.11 : 0.06) * pulse));
  auraGrad.addColorStop(1, hexToRgba(isEnraged ? '#ffd43b' : color, (isEnraged ? 0.28 : 0.20) * pulse));
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // Viền ngoài tinh tế màu hành (Hỏa/Mộc/Kim/Thổ/Thủy — hoặc Đỏ Kim Cuồng Nộ)
  ctx.strokeStyle = 'rgba(12, 16, 14, 0.36)';
  ctx.lineWidth = 3.2 / cam.zoom;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(color, (isEnraged ? 0.88 : 0.68) * pulse);
  ctx.lineWidth = (isEnraged ? 2.4 : 1.7) / cam.zoom;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Vòng bát quái nét đứt xoay chậm bên trong
  ctx.save();
  ctx.rotate(timeSec * (isEnraged ? 0.42 : 0.16));
  ctx.strokeStyle = isEnraged ? `rgba(255, 212, 59, ${(0.62 * pulse).toFixed(3)})` : hexToRgba(color, 0.36);
  ctx.lineWidth = (isEnraged ? 1.7 : 1.2) / cam.zoom;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.restore();
}

/**
 * Vòng Tầm Bắn Trắng Sắc Nét (Crisp White Firing Range Circle + Forward Sector Arc)
 * tái hiện chuẩn xác giao diện chiến trường Total War: Three Kingdoms (Trận Bình Nguyên).
 */
function renderWhiteFiringRangeRing(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  cam: TwCamera,
  timeSec: number,
): void {
  if (reg.isGeneral) return;
  const spec = TW_UNITS[reg.kind];
  if (!spec || spec.range <= 0) return;

  const effRange = spec.range * (reg.onHighGround ? HIGH_GROUND_RANGE_MUL : 1.0);
  const hasAmmo = reg.ammo > 0;
  const invZoom = 1 / cam.zoom;
  const halfSector = spec.category === 'artillery' ? 0.56 : 0.78;
  const sectorStart = reg.facing - halfSector;
  const sectorEnd = reg.facing + halfSector;
  const subtlePulse = 0.92 + 0.08 * Math.sin(timeSec * 3.0 + reg.id * 0.7);

  ctx.save();
  ctx.translate(reg.x, reg.y);

  // 1. Dải sương trắng mảnh bên trong mép vòng tầm bắn (tạo độ sâu sa bàn Total War)
  const featherInner = Math.max(0, effRange - 22 * invZoom);
  const rimGrad = ctx.createRadialGradient(0, 0, featherInner, 0, 0, effRange);
  rimGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  rimGrad.addColorStop(0.65, hasAmmo ? 'rgba(255, 255, 255, 0.05)' : 'rgba(200, 200, 200, 0.02)');
  rimGrad.addColorStop(1, hasAmmo ? 'rgba(255, 255, 255, 0.16)' : 'rgba(200, 200, 200, 0.06)');
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(0, 0, effRange, 0, Math.PI * 2);
  ctx.fill();

  // 2. Nền quạt bắn chính diện (Forward Firing Cone) phủ sáng rất nhẹ
  if (hasAmmo) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.032)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, effRange, sectorStart, sectorEnd);
    ctx.closePath();
    ctx.fill();

    // Hai tia giới hạn góc bắn trước mặt trung đoàn
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1.15 * invZoom;
    ctx.setLineDash([12 * invZoom, 9 * invZoom]);
    ctx.beginPath();
    ctx.moveTo(
      Math.cos(sectorStart) * Math.max(24, reg.width * 0.45),
      Math.sin(sectorStart) * Math.max(24, reg.width * 0.45),
    );
    ctx.lineTo(Math.cos(sectorStart) * effRange, Math.sin(sectorStart) * effRange);
    ctx.moveTo(
      Math.cos(sectorEnd) * Math.max(24, reg.width * 0.45),
      Math.sin(sectorEnd) * Math.max(24, reg.width * 0.45),
    );
    ctx.lineTo(Math.cos(sectorEnd) * effRange, Math.sin(sectorEnd) * effRange);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. Viền lót tối mỏng bên dưới giúp vòng trắng nổi bật sắc lẹm trên cả nắng vàng lẫn tuyết trắng
  ctx.strokeStyle = 'rgba(12, 16, 15, 0.46)';
  ctx.lineWidth = 3.8 * invZoom;
  ctx.beginPath();
  ctx.arc(0, 0, effRange, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Vòng Tròn Tầm Bắn Trắng Sắc Nét 360 độ (Crisp White Range Ring)
  ctx.strokeStyle = hasAmmo
    ? `rgba(255, 255, 255, ${(0.84 * subtlePulse).toFixed(3)})`
    : 'rgba(215, 220, 222, 0.42)';
  ctx.lineWidth = 1.9 * invZoom;
  if (!hasAmmo) {
    ctx.setLineDash([10 * invZoom, 8 * invZoom]);
  }
  ctx.beginPath();
  ctx.arc(0, 0, effRange, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 5. Nhấn sáng cung bắn chính diện + vạch chia độ tinh xảo
  if (hasAmmo) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.lineWidth = 2.7 * invZoom;
    ctx.beginPath();
    ctx.arc(0, 0, effRange, sectorStart, sectorEnd);
    ctx.stroke();

    const tickCount = 7;
    const tickLen = 7 * invZoom;
    ctx.lineWidth = 1.5 * invZoom;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    for (let i = 0; i <= tickCount; i++) {
      const ang = sectorStart + ((sectorEnd - sectorStart) * i) / tickCount;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(ca * (effRange - tickLen), sa * (effRange - tickLen));
      ctx.lineTo(ca * effRange, sa * effRange);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderRegimentSelectionFootprint(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  isFriendly: boolean,
  cam: TwCamera,
): void {
  const invZoom = 1 / cam.zoom;
  const hw = Math.max(12, reg.width * 0.5 + 5);
  const hd = Math.max(10, reg.depth * 0.5 + 5);
  const mainStroke = isFriendly ? 'rgba(116, 242, 148, 0.88)' : 'rgba(255, 196, 78, 0.86)';
  const fillTint = isFriendly ? 'rgba(64, 192, 87, 0.11)' : 'rgba(245, 159, 0, 0.11)';

  ctx.save();
  ctx.translate(reg.x, reg.y);
  ctx.rotate(reg.facing);

  // Trong hệ trục xoay theo `reg.facing`: +X là hướng tiến (front), +Y là cánh phải (lateral)
  ctx.fillStyle = fillTint;
  ctx.fillRect(-hd, -hw, hd * 2, hw * 2);

  ctx.strokeStyle = 'rgba(10, 18, 12, 0.48)';
  ctx.lineWidth = 3.2 * invZoom;
  ctx.strokeRect(-hd, -hw, hd * 2, hw * 2);

  ctx.strokeStyle = mainStroke;
  ctx.lineWidth = 1.65 * invZoom;
  ctx.strokeRect(-hd, -hw, hd * 2, hw * 2);

  // Dấu mũi nhọn hướng mặt ở chính giữa hàng tiền quân (+hd)
  const chevBaseX = hd + 4 * invZoom;
  const chevTipX = hd + 11 * invZoom;
  const chevHalfY = Math.min(hw * 0.35, 14);
  ctx.fillStyle = mainStroke;
  ctx.beginPath();
  ctx.moveTo(chevTipX, 0);
  ctx.lineTo(chevBaseX, -chevHalfY);
  ctx.lineTo(chevBaseX + 2.5 * invZoom, 0);
  ctx.lineTo(chevBaseX, chevHalfY);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderMovementVectors(
  ctx: CanvasRenderingContext2D,
  regiments: TwRegimentFrame[],
  selectedIds: Set<number>,
  myIdx: number | undefined,
  showAllTrajectories: boolean,
  cam: TwCamera,
  timeSec: number,
): void {
  const invZoom = 1 / cam.zoom;

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (!isAliveReg(reg) || isBrokenReg(reg)) continue;
    if (reg.moveTargetX === undefined || reg.moveTargetY === undefined) continue;

    const isMine = myIdx === undefined || reg.ownerIdx === myIdx;
    const isSelected = selectedIds.has(reg.id);
    if (!isMine && !isSelected) continue;
    if (!isSelected && !showAllTrajectories) continue;

    const tx = reg.moveTargetX;
    const ty = reg.moveTargetY;
    const dx = tx - reg.x;
    const dy = ty - reg.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) continue;

    const alphaMul = isSelected ? 0.95 : 0.58;
    const dirAngle = Math.atan2(dy, dx);
    const destFacing =
      reg.moveTargetFacing !== undefined && Number.isFinite(reg.moveTargetFacing)
        ? reg.moveTargetFacing
        : dirAngle;

    ctx.save();

    // 1. Khung dấu chân đội hình tại điểm đến (Destination Footprint)
    const hw = Math.max(11, reg.width * 0.5);
    const hd = Math.max(9, reg.depth * 0.5);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(destFacing);

    ctx.fillStyle = `rgba(72, 214, 112, ${(0.12 * alphaMul).toFixed(3)})`;
    ctx.fillRect(-hd, -hw, hd * 2, hw * 2);

    ctx.strokeStyle = `rgba(148, 248, 174, ${(0.76 * alphaMul).toFixed(3)})`;
    ctx.lineWidth = 1.5 * invZoom;
    ctx.setLineDash([8 * invZoom, 6 * invZoom]);
    ctx.strokeRect(-hd, -hw, hd * 2, hw * 2);
    ctx.setLineDash([]);

    // Mũi tên hướng mặt tại vị trí tập kết
    const tipX = hd + 9 * invZoom;
    const baseX = hd + 2 * invZoom;
    const spanY = Math.min(hw * 0.34, 12);
    ctx.fillStyle = `rgba(218, 255, 226, ${(0.88 * alphaMul).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tipX, 0);
    ctx.lineTo(baseX, -spanY);
    ctx.lineTo(baseX + 2 * invZoom, 0);
    ctx.lineTo(baseX, spanY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 2. Đường véc-tơ hành quân Xanh Ngọc -> Trắng Sáng sắc nét
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(8, 24, 14, ${(0.45 * alphaMul).toFixed(3)})`;
    ctx.lineWidth = 3.4 * invZoom;
    ctx.beginPath();
    ctx.moveTo(reg.x, reg.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    const lineGrad = ctx.createLinearGradient(reg.x, reg.y, tx, ty);
    lineGrad.addColorStop(0, `rgba(92, 232, 132, ${(0.82 * alphaMul).toFixed(3)})`);
    lineGrad.addColorStop(0.65, `rgba(168, 250, 190, ${(0.88 * alphaMul).toFixed(3)})`);
    lineGrad.addColorStop(1, `rgba(238, 255, 242, ${(0.95 * alphaMul).toFixed(3)})`);
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.8 * invZoom;
    ctx.beginPath();
    ctx.moveTo(reg.x, reg.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Xung mũi tên xanh ngọc chạy dọc đường hành quân
    const stepSpacing = 75;
    const count = Math.min(8, Math.max(1, Math.floor(dist / stepSpacing)));
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const phase = (timeSec * 0.9) % 1;

    ctx.strokeStyle = `rgba(232, 255, 238, ${(0.85 * alphaMul).toFixed(3)})`;
    ctx.lineWidth = 1.6 * invZoom;
    for (let k = 0; k < count; k++) {
      const frac = (k + phase) / count;
      if (frac < 0.08 || frac > 0.94) continue;
      const cx = reg.x + dx * frac;
      const cy = reg.y + dy * frac;
      const size = 5.5 * invZoom;
      ctx.beginPath();
      ctx.moveTo(cx - ux * size + px * size * 0.85, cy - uy * size + py * size * 0.85);
      ctx.lineTo(cx + ux * size * 0.45, cy + uy * size * 0.45);
      ctx.lineTo(cx - ux * size - px * size * 0.85, cy - uy * size - py * size * 0.85);
      ctx.stroke();
    }

    // Đầu mũi tên kết thúc tại tâm đích
    const headLen = 10 * invZoom;
    const headHalf = 5.5 * invZoom;
    ctx.fillStyle = `rgba(232, 255, 238, ${(0.95 * alphaMul).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * headLen + px * headHalf, ty - uy * headLen + py * headHalf);
    ctx.lineTo(tx - ux * headLen * 0.72, ty - uy * headLen * 0.72);
    ctx.lineTo(tx - ux * headLen - px * headHalf, ty - uy * headLen - py * headHalf);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

interface SoldierDotWorld {
  wx: number;
  wy: number;
  isGoldFront: boolean;
}

function generateSlotSoldierDots(slot: PreviewRegimentSlot): SoldierDotWorld[] {
  const { reg, x, y, facing, fp } = slot;
  const activeMen = clamp(Math.round(reg.men), 1, 160);
  const fwdX = Math.cos(facing);
  const fwdY = Math.sin(facing);
  const latX = -Math.sin(facing);
  const latY = Math.cos(facing);

  const dots: SoldierDotWorld[] = [];

  if (reg.isGeneral && activeMen <= 4) {
    // Tướng lĩnh & hộ vệ thân cận: chấm tướng Hoàng Kim dẫn đầu
    dots.push({ wx: x + fwdX * 4, wy: y + fwdY * 4, isGoldFront: true });
    for (let i = 1; i < activeMen; i++) {
      const lat = (i - (activeMen - 1) * 0.5) * fp.spacing * 0.7;
      dots.push({
        wx: x - fwdX * 6 + latX * lat,
        wy: y - fwdY * 6 + latY * lat,
        isGoldFront: false,
      });
    }
    return dots;
  }

  // Viên Trận (Circle Formation): xếp các vòng tròn đồng tâm 360 độ
  if (reg.formation === 'circle' && activeMen >= 8) {
    const outerCount = Math.max(8, Math.min(activeMen - 1, Math.round(activeMen * 0.58)));
    const innerCount = activeMen - outerCount;
    const rOuter = Math.max(fp.spacing * 0.9, Math.min(fp.width, fp.depth) * 0.46);
    const rInner = rOuter * 0.56;

    for (let i = 0; i < outerCount; i++) {
      const ang = facing + (i * Math.PI * 2) / outerCount;
      dots.push({
        wx: x + Math.cos(ang) * rOuter,
        wy: y + Math.sin(ang) * rOuter,
        isGoldFront: i === 0 || i === 1 || i === outerCount - 1,
      });
    }
    for (let i = 0; i < innerCount; i++) {
      const ang = facing + (i * Math.PI * 2) / Math.max(1, innerCount);
      dots.push({
        wx: x + Math.cos(ang) * (innerCount === 1 ? 0 : rInner),
        wy: y + Math.sin(ang) * (innerCount === 1 ? 0 : rInner),
        isGoldFront: i === 0 && reg.isGeneral,
      });
    }
    return dots;
  }

  // Phong Thỉ Chùy (Flying Wedge): mũi nhọn tam giác kỵ binh xung kích
  if (reg.formation === 'wedge' && activeMen >= 6) {
    let placed = 0;
    let rank = 0;
    const totalRanksEst = Math.max(2, Math.ceil(Math.sqrt(activeMen * 1.6)));
    const frontStart = ((totalRanksEst - 1) * fp.spacing * 0.86) * 0.5;
    while (placed < activeMen) {
      const inRank = Math.min(activeMen - placed, 1 + rank * 2);
      const fwdOffset = frontStart - rank * fp.spacing * 0.86;
      for (let c = 0; c < inRank; c++) {
        const latOffset = (c - (inRank - 1) * 0.5) * fp.spacing * 0.84;
        dots.push({
          wx: x + fwdX * fwdOffset + latX * latOffset,
          wy: y + fwdY * fwdOffset + latY * latOffset,
          isGoldFront: rank === 0 || c === 0 || c === inRank - 1,
        });
        placed++;
      }
      rank++;
    }
    return dots;
  }

  // Đội hình Hàng × Cột tiêu chuẩn (Ranks × Files: Trận Ngang, Thuẫn Tường, Thương Lâm, Tản Trận)
  const cols = Math.max(1, fp.cols);
  const rows = Math.max(1, Math.ceil(activeMen / cols));
  const frontMost = ((rows - 1) * fp.spacing) * 0.5;

  // Chấm chỉ huy / hiệu kỳ Hoàng Kim đứng nhích nhẹ phía trước hàng đầu
  if (reg.isGeneral) {
    dots.push({
      wx: x + fwdX * (frontMost + fp.spacing * 0.55),
      wy: y + fwdY * (frontMost + fp.spacing * 0.55),
      isGoldFront: true,
    });
  }

  let remaining = activeMen;
  for (let r = 0; r < rows && remaining > 0; r++) {
    const rowCols = Math.min(cols, remaining);
    const fwdOffset = frontMost - r * fp.spacing;
    for (let c = 0; c < rowCols; c++) {
      const latOffset = (c - (rowCols - 1) * 0.5) * fp.spacing;
      dots.push({
        wx: x + fwdX * fwdOffset + latX * latOffset,
        wy: y + fwdY * fwdOffset + latY * latOffset,
        // Hàng đầu tiên (r === 0) mang sắc Hoàng Kim dẫn trận, các hàng sau Xanh Ngọc Total War
        isGoldFront: r === 0,
      });
    }
    remaining -= rowCols;
  }

  return dots;
}

/**
 * Xem trước Dàn Quân Kéo Chuột Phải (Right-Click Drag Formation Soldier-Dot Preview):
 * Hiển thị từng chấm binh sĩ phát sáng Xanh Ngọc & Hoàng Kim theo đúng Hàng × Cột + Mũi tên hướng mặt.
 */
function renderDragFormationPreview(
  ctx: CanvasRenderingContext2D,
  regiments: TwRegimentFrame[],
  selectedIds: Set<number>,
  myIdx: number | undefined,
  dragPreview: TwDragLinePreview,
  cam: TwCamera,
  timeSec: number,
): void {
  let dragRegs = regiments.filter(
    (r) =>
      selectedIds.has(r.id) &&
      isAliveReg(r) &&
      !isBrokenReg(r) &&
      (myIdx === undefined || r.ownerIdx === myIdx),
  );
  if (dragRegs.length === 0) {
    dragRegs = regiments.filter((r) => selectedIds.has(r.id) && isAliveReg(r));
  }
  if (dragRegs.length === 0) return;

  const slots = computeDragPreviewSlots(dragRegs, dragPreview);
  if (slots.length === 0) return;

  const invZoom = 1 / cam.zoom;
  const pulse = 0.86 + 0.14 * Math.sin(timeSec * 5.0);

  // 1. Vẽ khung ô đội hình, đường nối mờ & Mũi tên hướng mặt trên mặt đất thế giới 2.5D
  ctx.save();
  ctx.translate(cam.viewW * 0.5, cam.viewH * 0.5);
  ctx.scale(cam.zoom, cam.zoom * TW_ISO_TILT);
  ctx.translate(-cam.x, -cam.y);

  // Đường gióng ngang hai đầu cánh trái - cánh phải khi người chơi đang kéo chuột
  const rawDragSpan = Math.hypot(
    dragPreview.endWx - dragPreview.startWx,
    dragPreview.endWy - dragPreview.startWy,
  );
  if (rawDragSpan > 12) {
    ctx.strokeStyle = 'rgba(255, 224, 102, 0.42)';
    ctx.lineWidth = 1.6 * invZoom;
    ctx.setLineDash([10 * invZoom, 7 * invZoom]);
    ctx.beginPath();
    ctx.moveTo(dragPreview.startWx, dragPreview.startWy);
    ctx.lineTo(dragPreview.endWx, dragPreview.endWy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const hw = Math.max(10, slot.fp.width * 0.5 + 4);
    const hd = Math.max(8, slot.fp.depth * 0.5 + 4);

    // Dây dẫn mờ từ vị trí hiện tại của trung đoàn tới ô dàn quân mới
    ctx.strokeStyle = 'rgba(130, 240, 162, 0.34)';
    ctx.lineWidth = 1.3 * invZoom;
    ctx.setLineDash([7 * invZoom, 7 * invZoom]);
    ctx.beginPath();
    ctx.moveTo(slot.reg.x, slot.reg.y);
    ctx.lineTo(slot.x, slot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Khung góc & Mũi tên Chevron hướng mặt phía trước mỗi ô trung đoàn
    ctx.save();
    ctx.translate(slot.x, slot.y);
    ctx.rotate(slot.facing);

    ctx.fillStyle = 'rgba(46, 160, 72, 0.10)';
    ctx.fillRect(-hd, -hw, hd * 2, hw * 2);

    // 4 ngoặc vuông góc ô đội hình chuẩn Total War
    const corner = Math.min(12, hw * 0.35, hd * 0.45);
    ctx.strokeStyle = `rgba(142, 246, 168, ${(0.78 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.7 * invZoom;
    ctx.beginPath();
    // Trước - Trái
    ctx.moveTo(hd - corner, -hw);
    ctx.lineTo(hd, -hw);
    ctx.lineTo(hd, -hw + corner);
    // Trước - Phải
    ctx.moveTo(hd - corner, hw);
    ctx.lineTo(hd, hw);
    ctx.lineTo(hd, hw - corner);
    // Sau - Trái
    ctx.moveTo(-hd + corner, -hw);
    ctx.lineTo(-hd, -hw);
    ctx.lineTo(-hd, -hw + corner);
    // Sau - Phải
    ctx.moveTo(-hd + corner, hw);
    ctx.lineTo(-hd, hw);
    ctx.lineTo(-hd, hw - corner);
    ctx.stroke();

    // Forward Direction Chevron (Mũi nhọn chỉ hướng tiến quân Hoàng Kim viền Xanh Ngọc)
    const chevStart = hd + 7 * invZoom;
    const chevTip = hd + 21 * invZoom;
    const chevWing = clamp(hw * 0.34, 9, 26);

    ctx.fillStyle = `rgba(255, 216, 76, ${(0.88 * pulse).toFixed(3)})`;
    ctx.strokeStyle = 'rgba(20, 38, 22, 0.72)';
    ctx.lineWidth = 1.5 * invZoom;
    ctx.beginPath();
    ctx.moveTo(chevTip, 0);
    ctx.lineTo(chevStart, -chevWing);
    ctx.lineTo(chevStart + 5 * invZoom, 0);
    ctx.lineTo(chevStart, chevWing);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mũi nhọn phụ thứ hai tạo nhịp hướng tiến rõ nét
    const chev2Start = chevTip + 3 * invZoom;
    const chev2Tip = chevTip + 11 * invZoom;
    const chev2Wing = chevWing * 0.62;
    ctx.fillStyle = `rgba(136, 246, 164, ${(0.76 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(chev2Tip, 0);
    ctx.lineTo(chev2Start, -chev2Wing);
    ctx.lineTo(chev2Start + 3 * invZoom, 0);
    ctx.lineTo(chev2Start, chev2Wing);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();

  // 2. Vẽ từng chấm lính tròn sắc nét (Jade-Green & Imperial Gold Soldier Dots) trong không gian màn hình
  const coreRadius = clamp(2.35 * cam.zoom, 1.55, 3.6);
  const haloRadius = coreRadius * 2.05;

  ctx.save();
  for (let i = 0; i < slots.length; i++) {
    const dots = generateSlotSoldierDots(slots[i]);

    // Lớp quầng sáng mềm bên ngoài
    for (let d = 0; d < dots.length; d++) {
      const pt = dots[d];
      const { sx, sy } = worldToScreen(pt.wx, pt.wy, cam);
      if (sx < -20 || sx > cam.viewW + 20 || sy < -20 || sy > cam.viewH + 20) continue;

      ctx.fillStyle = pt.isGoldFront
        ? `rgba(255, 206, 58, ${(0.38 * pulse).toFixed(3)})`
        : `rgba(64, 206, 98, ${(0.36 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, haloRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lớp nhân ngọc sắc nét có viền tối mỏng tách biệt từng binh sĩ
    ctx.strokeStyle = 'rgba(10, 22, 14, 0.72)';
    ctx.lineWidth = 0.9;
    for (let d = 0; d < dots.length; d++) {
      const pt = dots[d];
      const { sx, sy } = worldToScreen(pt.wx, pt.wy, cam);
      if (sx < -20 || sx > cam.viewW + 20 || sy < -20 || sy > cam.viewH + 20) continue;

      ctx.fillStyle = pt.isGoldFront ? '#ffe066' : '#8ce99a';
      ctx.beginPath();
      ctx.arc(sx, sy, coreRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Ranh giới Khu Vực Bố Trận Đại Quân (Allied Deployment Zone) & Vùng Rừng Tiên Phong Phục Kích
 * trên mặt phẳng thế giới nghiêng 2.5D chuẩn Total War: Three Kingdoms.
 */
function renderDeploymentZonesWorld(
  ctx: CanvasRenderingContext2D,
  deployOverlay: TwTacticalDeployOverlay,
  cam: TwCamera,
  timeSec: number,
): void {
  const dz = deployOverlay.myDeployZone;
  if (!dz) return;

  const invZoom = 1 / cam.zoom;
  const rx = Math.max(12, dz.rx);
  const ry = Math.max(12, dz.ry);
  const pulse = 0.84 + 0.16 * Math.sin(timeSec * 3.2);

  // 1. Vùng Bố Trận Đại Quân Đồng Minh (Isometric Rotated Ellipse: Ngọc Bích - Hoàng Kim)
  ctx.save();
  ctx.translate(dz.x, dz.y);
  ctx.rotate(dz.rot);

  ctx.save();
  ctx.scale(rx, ry);
  const rimGrad = ctx.createRadialGradient(0, 0, 0.72, 0, 0, 1.0);
  rimGrad.addColorStop(0, 'rgba(212, 184, 92, 0)');
  rimGrad.addColorStop(0.68, `rgba(92, 224, 136, ${(0.07 * pulse).toFixed(3)})`);
  rimGrad.addColorStop(1, `rgba(250, 206, 78, ${(0.24 * pulse).toFixed(3)})`);
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Viền lót tối tương phản cao
  ctx.strokeStyle = 'rgba(10, 18, 14, 0.56)';
  ctx.lineWidth = 5.4 * invZoom;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Viền ngọc bích mảnh bên trong + viền nét đứt Hoàng Kim - Ngọc Bích chuyển động
  ctx.strokeStyle = `rgba(116, 242, 148, ${(0.52 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.6 * invZoom;
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(4, rx - 5 * invZoom), Math.max(4, ry - 5 * invZoom), 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 218, 84, ${(0.92 * pulse).toFixed(3)})`;
  ctx.lineWidth = 2.8 * invZoom;
  ctx.setLineDash([22 * invZoom, 11 * invZoom]);
  ctx.lineDashOffset = -timeSec * 26 * invZoom;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 12 vạch mốc chiến tuyến hướng vào lòng khu bố trận
  const tickLen = 9 * invZoom;
  ctx.strokeStyle = `rgba(255, 232, 148, ${(0.72 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.8 * invZoom;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI * 2) / 12;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(ca * (rx - tickLen), sa * (ry - tickLen));
    ctx.lineTo(ca * rx, sa * ry);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Nổi bật các Rừng Thông / Rừng Trúc phía trước cho quân Tiên Phong Phục Kích
  if (deployOverlay.hasVanguardSelected && deployOverlay.mapSpec) {
    const zones = deployOverlay.mapSpec.terrainZones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (z.kind !== 'forest') continue;
      const zrx = Math.max(10, z.rx);
      const zry = Math.max(10, z.ry);

      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.rot);

      ctx.save();
      ctx.scale(zrx, zry);
      const stealthGrad = ctx.createRadialGradient(0, 0, 0.74, 0, 0, 1.0);
      stealthGrad.addColorStop(0, 'rgba(46, 204, 113, 0)');
      stealthGrad.addColorStop(1, `rgba(64, 224, 130, ${(0.21 * pulse).toFixed(3)})`);
      ctx.fillStyle = stealthGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(8, 22, 14, 0.56)';
      ctx.lineWidth = 4.6 * invZoom;
      ctx.beginPath();
      ctx.ellipse(0, 0, zrx, zry, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(81, 232, 132, ${(0.88 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.4 * invZoom;
      ctx.setLineDash([16 * invZoom, 9 * invZoom]);
      ctx.lineDashOffset = -timeSec * 20 * invZoom;
      ctx.beginPath();
      ctx.ellipse(0, 0, zrx, zry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    }
  }
}

/**
 * Nhãn mặt đất sắc nét cho Khu Vực Bố Trận Đại Quân & Rừng Tiên Phong Phục Kích trong không gian màn hình.
 */
function renderDeploymentZonesLabels(
  ctx: CanvasRenderingContext2D,
  deployOverlay: TwTacticalDeployOverlay,
  cam: TwCamera,
  timeSec: number,
): void {
  const dz = deployOverlay.myDeployZone;
  if (!dz) return;

  const pulse = 0.88 + 0.12 * Math.sin(timeSec * 3.2);
  const mapCx = (deployOverlay.mapSpec?.width ?? 3200) * 0.5;
  const mapCy = (deployOverlay.mapSpec?.height ?? 2200) * 0.5;
  const toMidAng = Math.atan2(mapCy - dz.y, mapCx - dz.x);
  const labelWx = dz.x + Math.cos(toMidAng) * dz.rx * 0.56;
  const labelWy = dz.y + Math.sin(toMidAng) * dz.ry * 0.56;
  const pos = worldToScreen(labelWx, labelWy, cam);

  ctx.save();
  const fontSize = Math.round(clamp(12 * cam.zoom, 10, 14));
  ctx.font = `700 ${fontSize}px "Noto Serif", Georgia, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const mainLabel = 'KHU VỰC BỐ TRẬN ĐẠI QUÂN';
  const mainW = ctx.measureText(mainLabel).width + 26;
  const mainH = fontSize + 10;
  ctx.fillStyle = 'rgba(12, 20, 16, 0.80)';
  ctx.beginPath();
  ctx.roundRect(pos.sx - mainW * 0.5, pos.sy - mainH * 0.5, mainW, mainH, 5);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 216, 84, ${(0.86 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#ffe89e';
  ctx.fillText(mainLabel, pos.sx, pos.sy + 0.5);

  if (deployOverlay.hasVanguardSelected && deployOverlay.mapSpec) {
    const forestLabel = '🌲 BỐ TRẬN TIÊN PHONG PHỤC KÍCH';
    const subFont = Math.round(clamp(11 * cam.zoom, 9.5, 13));
    ctx.font = `700 ${subFont}px system-ui, -apple-system, sans-serif`;
    const subW = ctx.measureText(forestLabel).width + 22;
    const subH = subFont + 9;

    for (const z of deployOverlay.mapSpec.terrainZones) {
      if (z.kind !== 'forest') continue;
      const fp = worldToScreen(z.x, z.y, cam);
      if (fp.sx < -120 || fp.sx > cam.viewW + 120 || fp.sy < -60 || fp.sy > cam.viewH + 60) {
        continue;
      }
      ctx.fillStyle = 'rgba(10, 26, 16, 0.82)';
      ctx.beginPath();
      ctx.roundRect(fp.sx - subW * 0.5, fp.sy - subH * 0.5, subW, subH, 5);
      ctx.fill();
      ctx.strokeStyle = `rgba(81, 232, 132, ${(0.86 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.fillStyle = '#b2f2bb';
      ctx.fillText(forestLabel, fp.sx, fp.sy + 0.5);
    }
  }

  ctx.restore();
}

/**
 * Xem trước bóng ma đặt Công Sự Dã Chiến (`stakes` | `caltrops` | `oil`) tại con trỏ `(hoverWorld.wx, hoverWorld.wy)`.
 */
function renderDeployablePlacementGhostWorld(
  ctx: CanvasRenderingContext2D,
  kind: TwDeployableKind,
  wx: number,
  wy: number,
  facing: number,
  cam: TwCamera,
  timeSec: number,
): void {
  const spec = TW_DEPLOYABLES[kind];
  if (!spec) return;
  const r = spec.radius;
  const invZoom = 1 / cam.zoom;
  const pulse = 0.84 + 0.16 * Math.sin(timeSec * 5.2);

  ctx.save();
  ctx.translate(wx, wy);

  // Vòng ranh giới đặt công sự dã chiến
  const ringColor =
    kind === 'oil'
      ? 'rgba(255, 168, 38, 0.90)'
      : kind === 'caltrops'
        ? 'rgba(165, 243, 252, 0.88)'
        : 'rgba(255, 216, 76, 0.92)';
  const fillTint =
    kind === 'oil'
      ? 'rgba(196, 108, 18, 0.12)'
      : kind === 'caltrops'
        ? 'rgba(102, 217, 232, 0.10)'
        : 'rgba(116, 242, 148, 0.11)';

  ctx.fillStyle = fillTint;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(10, 16, 14, 0.55)';
  ctx.lineWidth = 3.8 * invZoom;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2.0 * invZoom;
  ctx.setLineDash([12 * invZoom, 7 * invZoom]);
  ctx.lineDashOffset = -timeSec * 20 * invZoom;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (kind === 'stakes') {
    // Hàng Chông Gỗ Phản Kỵ (`拒馬` X-beams + mũi sắt chĩa theo hướng `facing`)
    ctx.save();
    ctx.rotate(facing);
    const spanHalf = r * 0.78;
    const count = 5;

    // Xà ngang gỗ lim nối hàng cự mã
    ctx.strokeStyle = `rgba(182, 138, 82, ${(0.88 * pulse).toFixed(3)})`;
    ctx.lineWidth = 4.2 * invZoom;
    ctx.beginPath();
    ctx.moveTo(-2, -spanHalf);
    ctx.lineTo(-2, spanHalf);
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const ly = count > 1 ? -spanHalf + (2 * spanHalf * i) / (count - 1) : 0;
      // Hai thanh gỗ vắt chéo chữ X phóng mũi nhọn về +X (tiền phương)
      ctx.strokeStyle = `rgba(218, 174, 106, ${(0.92 * pulse).toFixed(3)})`;
      ctx.lineWidth = 3.0 * invZoom;
      ctx.beginPath();
      ctx.moveTo(-12, ly - 7);
      ctx.lineTo(15, ly + 4);
      ctx.moveTo(-12, ly + 7);
      ctx.lineTo(15, ly - 4);
      ctx.stroke();

      // Bọc mũi sắt sáng loáng
      ctx.fillStyle = '#f1f3f5';
      ctx.beginPath();
      ctx.arc(15.5, ly + 4, 2.2 * invZoom, 0, Math.PI * 2);
      ctx.arc(15.5, ly - 4, 2.2 * invZoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mũi tên cảnh báo hướng xiên kỵ binh (+X)
    ctx.fillStyle = `rgba(255, 216, 76, ${(0.86 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(r * 0.62, 0);
    ctx.lineTo(r * 0.36, -9);
    ctx.lineTo(r * 0.42, 0);
    ctx.lineTo(r * 0.36, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (kind === 'caltrops') {
    // Bãi Chông Sắt Ám Khí (`鐵蒺藜`) 4 nhánh lấp lánh rải khắp bán kính
    const spikeCount = 16;
    for (let i = 0; i < spikeCount; i++) {
      const goldenAng = i * 2.399963 + 0.4;
      const dist = Math.sqrt((i + 0.5) / spikeCount) * r * 0.82;
      const sx = Math.cos(goldenAng) * dist;
      const sy = Math.sin(goldenAng) * dist;
      const arm = 5.4 * invZoom;
      const rot = i * 0.65;

      ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : 'rgba(206, 232, 244, 0.88)';
      ctx.lineWidth = 1.65 * invZoom;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(rot) * arm, sy - Math.sin(rot) * arm);
      ctx.lineTo(sx + Math.cos(rot) * arm, sy + Math.sin(rot) * arm);
      ctx.moveTo(sx + Math.sin(rot) * arm, sy - Math.cos(rot) * arm);
      ctx.lineTo(sx - Math.sin(rot) * arm, sy + Math.cos(rot) * arm);
      ctx.stroke();
    }
  } else if (kind === 'oil') {
    // Vũng Bẫy Dầu Hỏa Công (`火油`) đen hổ phách óng ánh chờ châm lửa
    const oilGrad = ctx.createRadialGradient(-r * 0.15, -r * 0.12, r * 0.08, 0, 0, r * 0.9);
    oilGrad.addColorStop(0, 'rgba(38, 22, 10, 0.72)');
    oilGrad.addColorStop(0.58, 'rgba(138, 68, 12, 0.56)');
    oilGrad.addColorStop(0.88, 'rgba(232, 136, 24, 0.38)');
    oilGrad.addColorStop(1, 'rgba(232, 136, 24, 0)');
    ctx.fillStyle = oilGrad;
    ctx.beginPath();
    const lobes = 14;
    for (let k = 0; k <= lobes; k++) {
      const a = (k / lobes) * Math.PI * 2;
      const wobble = 0.82 + 0.11 * Math.sin(a * 3 + 0.8) + 0.06 * Math.cos(a * 5 - timeSec * 1.6);
      const px = Math.cos(a) * r * wobble;
      const py = Math.sin(a) * r * wobble;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Vân phản quang váng dầu hổ phách
    ctx.strokeStyle = `rgba(255, 206, 112, ${(0.58 * pulse).toFixed(3)})`;
    ctx.lineWidth = 2.1 * invZoom;
    ctx.beginPath();
    ctx.arc(-r * 0.08, -r * 0.06, r * 0.44, -Math.PI * 0.75, -Math.PI * 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 0.12, r * 0.1, r * 0.28, Math.PI * 0.15, Math.PI * 0.72);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Dựng toàn bộ các chỉ báo chiến thuật nằm dưới chân binh sĩ (Tactical Underlays):
 * - Vùng Bố Trận Đại Quân & Rừng Tiên Phong Phục Kích (khi `battlePhase === 'deployment'`).
 * - Bóng ma đặt Công Sự Dã Chiến (`stakes`, `caltrops`, `oil`).
 * - Vòng hào quang Ngũ Hành & Vòng Cuồng Nộ Quan Hệ (`guanxiState === 'enraged'`) quanh Danh Tướng.
 * - Vòng tầm bắn Trắng Sắc Nét quanh trung đoàn cung nỏ / máy bắn đá đang chọn.
 * - Khung chọn mặt đất, véc-tơ hành quân Xanh Ngọc (`moveTargetX, moveTargetY`) và
 *   bản xem trước từng chấm lính Hàng × Cột khi kéo chuột phải dàn quân (`dragPreview`).
 */
export function renderTwTacticalUnderlays(
  ctx: CanvasRenderingContext2D,
  regiments: TwRegimentFrame[],
  selectedIds: Set<number>,
  myIdx: number | undefined,
  myTeam: number | undefined,
  dragPreview: TwDragLinePreview | null,
  showAllTrajectories: boolean = true,
  cam: TwCamera,
  timeSec: number,
  deployOverlay?: TwTacticalDeployOverlay,
): void {
  const hoveredId = deployOverlay?.hoveredRegId ?? null;

  // 1. Các vòng trên mặt phẳng chiến trường nghiêng 2.5D
  ctx.save();
  ctx.translate(cam.viewW * 0.5, cam.viewH * 0.5);
  ctx.scale(cam.zoom, cam.zoom * TW_ISO_TILT);
  ctx.translate(-cam.x, -cam.y);

  // 1.0. Ranh giới Khu Vực Bố Trận Đại Quân & Rừng Phục Kích Tiên Phong
  if (deployOverlay?.battlePhase === 'deployment' && deployOverlay.myDeployZone) {
    renderDeploymentZonesWorld(ctx, deployOverlay, cam, timeSec);
  }

  // 1a. Hào quang Ngũ Hành & Vòng Cuồng Nộ Báo Thù (`guanxiState === 'enraged'`) của Tướng chọn / trỏ chuột
  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (!isAliveReg(reg)) continue;
    const isSel = selectedIds.has(reg.id);
    const isHov = hoveredId === reg.id;
    if (!isSel && !isHov) continue;

    if (reg.guanxiState === 'enraged') {
      renderEnragedGuanxiUnderRing(ctx, reg, cam, timeSec);
    }
    if (isSel && reg.isGeneral) {
      renderSelectedGeneralAura(ctx, reg, cam, timeSec);
    }
  }

  // 1b. Vòng tầm bắn Trắng Sắc Nét của cung / nỏ / pháo đang chọn
  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (!isAliveReg(reg) || !selectedIds.has(reg.id)) continue;
    renderWhiteFiringRangeRing(ctx, reg, cam, timeSec);
  }

  // 1c. Véc-tơ hành quân Xanh Ngọc & khung đích đến
  renderMovementVectors(
    ctx,
    regiments,
    selectedIds,
    myIdx,
    showAllTrajectories,
    cam,
    timeSec,
  );

  // 1d. Đế chọn mặt đất dưới chân các trung đoàn đang chọn
  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (!isAliveReg(reg) || !selectedIds.has(reg.id)) continue;
    const isFriendly =
      myIdx !== undefined
        ? reg.ownerIdx === myIdx
        : myTeam !== undefined
          ? reg.ownerIdx % 2 === myTeam % 2
          : true;
    renderRegimentSelectionFootprint(ctx, reg, isFriendly, cam);
  }

  // 1e. Bóng ma xem trước đặt Công Sự Dã Chiến (`stakes`, `caltrops`, `oil`)
  if (deployOverlay?.placementKind && deployOverlay.hoverWorld) {
    const hw = deployOverlay.hoverWorld;
    const dz = deployOverlay.myDeployZone;
    const mapCx = (deployOverlay.mapSpec?.width ?? 3200) * 0.5;
    const mapCy = (deployOverlay.mapSpec?.height ?? 2200) * 0.5;
    const defaultFacing =
      deployOverlay.placementFacing !== undefined && Number.isFinite(deployOverlay.placementFacing)
        ? deployOverlay.placementFacing
        : dz
          ? Math.atan2(mapCy - dz.y, mapCx - dz.x)
          : Math.atan2(mapCy - hw.wy, mapCx - hw.wx);
    renderDeployablePlacementGhostWorld(
      ctx,
      deployOverlay.placementKind,
      hw.wx,
      hw.wy,
      defaultFacing,
      cam,
      timeSec,
    );
  }

  ctx.restore();

  // Nhãn mặt đất sắc nét cho Pha Bố Trận & Bóng ma Công Sự
  if (deployOverlay?.battlePhase === 'deployment' && deployOverlay.myDeployZone) {
    renderDeploymentZonesLabels(ctx, deployOverlay, cam, timeSec);
  }

  if (deployOverlay?.placementKind && deployOverlay.hoverWorld) {
    const spec = TW_DEPLOYABLES[deployOverlay.placementKind];
    if (spec) {
      const anchor = worldToScreen(
        deployOverlay.hoverWorld.wx,
        deployOverlay.hoverWorld.wy + spec.radius + 14,
        cam,
      );
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = `${spec.glyph} ${spec.vnName}`;
      const tw = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(12, 16, 18, 0.84)';
      ctx.beginPath();
      ctx.roundRect(anchor.sx - tw * 0.5, anchor.sy - 10, tw, 20, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 216, 84, 0.78)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#fff3bf';
      ctx.fillText(txt, anchor.sx, anchor.sy + 0.5);
      ctx.restore();
    }
  }

  // 2. Chấm lính Xanh Ngọc & Hoàng Kim xem trước khi kéo chuột phải dàn trận
  if (dragPreview) {
    renderDragFormationPreview(
      ctx,
      regiments,
      selectedIds,
      myIdx,
      dragPreview,
      cam,
      timeSec,
    );
  }
}

// ============================================================================
// 4. QUỸ ĐẠO KHAI HỎA & XUNG KÍCH CONG VÒM 3D ĐỎ THẪM (RED TRAJECTORIES)
// ============================================================================

type TrajectoryStyleKind = 'artillery' | 'bow' | 'crossbow' | 'charge';

interface ResolvedTrajectory {
  shooter: TwRegimentFrame;
  target: TwRegimentFrame;
  style: TrajectoryStyleKind;
  isSelectedOrFriendly: boolean;
}

function classifyRangedStyle(cat: TwUnitCategory): TrajectoryStyleKind {
  if (cat === 'artillery') return 'artillery';
  if (cat === 'ranged_crossbow') return 'crossbow';
  return 'bow';
}

function resolveActiveTrajectories(
  regiments: TwRegimentFrame[],
  teamByOwner: Map<number, number>,
  selectedIds: Set<number>,
  myTeam: number | undefined,
  showAllTrajectories: boolean,
): ResolvedTrajectory[] {
  const regById = new Map<number, TwRegimentFrame>();
  for (let i = 0; i < regiments.length; i++) {
    regById.set(regiments[i].id, regiments[i]);
  }

  const getTeam = (ownerIdx: number): number =>
    teamByOwner.get(ownerIdx) ?? (ownerIdx >= 0 ? ownerIdx % 2 : 0);

  const isVisibleToViewer = (reg: TwRegimentFrame): boolean => {
    if (!isAliveReg(reg)) return false;
    if (reg.hidden && myTeam !== undefined && getTeam(reg.ownerIdx) !== myTeam) {
      return false;
    }
    return true;
  };

  const results: ResolvedTrajectory[] = [];

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (!isVisibleToViewer(reg) || isBrokenReg(reg)) continue;

    const regTeam = getTeam(reg.ownerIdx);
    const isSelected = selectedIds.has(reg.id);
    if (!showAllTrajectories && !isSelected) continue;

    const isFriendly = myTeam === undefined || regTeam === myTeam;
    const spec = TW_UNITS[reg.kind];
    const isRangedCapable = !reg.isGeneral && spec.range > 0 && reg.ammo > 0;

    // Ưu tiên 1: Trung đoàn có mục tiêu khóa cứng (`lockedTargetId`)
    if (reg.lockedTargetId !== undefined) {
      const target = regById.get(reg.lockedTargetId);
      if (target && isVisibleToViewer(target) && getTeam(target.ownerIdx) !== regTeam) {
        const dist = Math.hypot(target.x - reg.x, target.y - reg.y);
        if (dist >= 18) {
          const style: TrajectoryStyleKind =
            isRangedCapable && dist > 52 ? classifyRangedStyle(spec.category) : 'charge';
          results.push({
            shooter: reg,
            target,
            style,
            isSelectedOrFriendly: isSelected || isFriendly,
          });
          continue;
        }
      }
    }

    // Ưu tiên 2: Trung đoàn tầm xa đang khai hỏa (`anim === 'shoot'`) hoặc tự động bắn (`fireAtWill`) vào địch trong tầm
    if (isRangedCapable && (reg.anim === 'shoot' || reg.fireAtWill)) {
      const baseRange = spec.range * (reg.onHighGround ? HIGH_GROUND_RANGE_MUL : 1.0);
      const maxCheckRange = reg.anim === 'shoot' ? baseRange * 1.08 : baseRange;
      const maxConeRad = reg.anim === 'shoot' ? 1.18 : 0.90;

      let bestTarget: TwRegimentFrame | null = null;
      let bestScore = Infinity;

      for (let j = 0; j < regiments.length; j++) {
        const cand = regiments[j];
        if (cand.id === reg.id || !isVisibleToViewer(cand)) continue;
        if (getTeam(cand.ownerIdx) === regTeam) continue;

        const dx = cand.x - reg.x;
        const dy = cand.y - reg.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 30 || dist > maxCheckRange) continue;

        const angleToCand = Math.atan2(dy, dx);
        const angleDiff = Math.abs(shortestAngleDiff(reg.facing, angleToCand));
        if (angleDiff > maxConeRad) continue;

        const score = dist * (1 + angleDiff * 0.55);
        if (score < bestScore) {
          bestScore = score;
          bestTarget = cand;
        }
      }

      if (bestTarget) {
        results.push({
          shooter: reg,
          target: bestTarget,
          style: classifyRangedStyle(spec.category),
          isSelectedOrFriendly: isSelected || isFriendly,
        });
        continue;
      }
    }

    // Ưu tiên 3: Trung đoàn bộ/kỵ/tướng đang xung phong (`anim === 'charge'`) thẳng vào đội hình địch phía trước
    if (reg.anim === 'charge') {
      let bestChargeTarget: TwRegimentFrame | null = null;
      let bestDist = 215;
      for (let j = 0; j < regiments.length; j++) {
        const cand = regiments[j];
        if (cand.id === reg.id || !isVisibleToViewer(cand)) continue;
        if (getTeam(cand.ownerIdx) === regTeam) continue;

        const dx = cand.x - reg.x;
        const dy = cand.y - reg.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 18 || dist > bestDist) continue;

        const angleDiff = Math.abs(shortestAngleDiff(reg.facing, Math.atan2(dy, dx)));
        if (angleDiff > 0.72) continue;

        bestDist = dist;
        bestChargeTarget = cand;
      }

      if (bestChargeTarget) {
        results.push({
          shooter: reg,
          target: bestChargeTarget,
          style: 'charge',
          isSelectedOrFriendly: isSelected || isFriendly,
        });
      }
    }
  }

  return results;
}

/**
 * Dựng một dải lụa parabol 3D màu Đỏ Thẫm có viền đỏ sẫm sắc nét, đầu mũi tên hội tụ
 * và xung ánh sáng chạy dọc chiều bắn từ tiền quân người bắn tới đội hình mục tiêu.
 */
function drawCrimson3DTrajectoryRibbon(
  ctx: CanvasRenderingContext2D,
  item: ResolvedTrajectory,
  isSelected: boolean,
  cam: TwCamera,
  timeSec: number,
): void {
  const { shooter, target, style, isSelectedOrFriendly } = item;

  // Điểm xuất phát ngay chính giữa hàng quân đầu (front ranks) của trung đoàn
  const frontAdvance = Math.max(6, shooter.depth * 0.42);
  const startWx = shooter.x + Math.cos(shooter.facing) * frontAdvance;
  const startWy = shooter.y + Math.sin(shooter.facing) * frontAdvance;

  // Điểm chạm hơi nhích về mặt đón đạn của trung đoàn mục tiêu
  const toShooterAng = Math.atan2(startWy - target.y, startWx - target.x);
  const impactInset = Math.min(10, target.depth * 0.16);
  const endWx = target.x + Math.cos(toShooterAng) * impactInset;
  const endWy = target.y + Math.sin(toShooterAng) * impactInset;

  const worldDist = Math.hypot(endWx - startWx, endWy - startWy);
  if (worldDist < 14) return;

  const p0 = worldToScreen(startWx, startWy, cam);
  const p1 = worldToScreen(endWx, endWy, cam);

  // Loại bỏ nhanh nếu cả đoạn cong nằm ngoài khung nhìn
  const minSx = Math.min(p0.sx, p1.sx);
  const maxSx = Math.max(p0.sx, p1.sx);
  const minSy = Math.min(p0.sy, p1.sy) - 280 * cam.zoom;
  const maxSy = Math.max(p0.sy, p1.sy) + 40;
  if (maxSx < -80 || minSx > cam.viewW + 80 || maxSy < -80 || minSy > cam.viewH + 80) {
    return;
  }

  // Độ vồng cao độ parabol 3D theo chủng loại vũ khí chuẩn Total War: Three Kingdoms
  let apexWorldH: number;
  let baseHalfW: number;
  let pulseSpeed: number;
  switch (style) {
    case 'artillery':
      apexWorldH = clamp(worldDist * 0.35, 85, 255);
      baseHalfW = 5.4;
      pulseSpeed = 0.52;
      break;
    case 'bow':
      apexWorldH = clamp(worldDist * 0.23, 46, 170);
      baseHalfW = 4.3;
      pulseSpeed = 0.72;
      break;
    case 'crossbow':
      apexWorldH = clamp(worldDist * 0.125, 24, 96);
      baseHalfW = 3.6;
      pulseSpeed = 0.92;
      break;
    case 'charge':
    default:
      apexWorldH = clamp(worldDist * 0.06, 11, 42);
      baseHalfW = 3.8;
      pulseSpeed = 1.05;
      break;
  }

  const apexPx = apexWorldH * cam.zoom;
  const zoomWidthScale = clamp(cam.zoom, 0.55, 1.35);
  const halfWidthPx = baseHalfW * zoomWidthScale * (isSelected ? 1.18 : 1.0);
  const opacityScale = isSelected ? 1.08 : isSelectedOrFriendly ? 1.0 : 0.86;

  // Hàm lấy tọa độ & tiếp tuyến chính xác trên đường cong parabol 3D chiếu lên màn hình
  const samplePoint = (t: number): { x: number; y: number; tx: number; ty: number } => {
    const x = p0.sx + (p1.sx - p0.sx) * t;
    const y = p0.sy + (p1.sy - p0.sy) * t - 4 * apexPx * t * (1 - t);
    const dxdt = p1.sx - p0.sx;
    const dydt = p1.sy - p0.sy - 4 * apexPx * (1 - 2 * t);
    const len = Math.hypot(dxdt, dydt) || 1;
    return { x, y, tx: dxdt / len, ty: dydt / len };
  };

  ctx.save();

  // 1. Bóng mờ của quỹ đạo in dưới mặt cỏ giúp mắt người cảm nhận tức thì chiều cao vòm 3D
  ctx.strokeStyle = `rgba(24, 8, 8, ${(0.14 * opacityScale).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.4, halfWidthPx * 0.95);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.sx, p0.sy);
  ctx.lineTo(p1.sx, p1.sy);
  ctx.stroke();

  // 2. Vòng tâm chấn đỏ thẫm nhấp nháy nhẹ dưới chân trung đoàn mục tiêu bị khóa bắn
  const targetRingR = clamp(target.width * 0.34, 14, 34) * cam.zoom;
  const ringPulse = 0.75 + 0.25 * Math.sin(timeSec * 4.4 + shooter.id);
  ctx.strokeStyle = `rgba(210, 38, 30, ${(0.42 * ringPulse * opacityScale).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.2, 1.8 * zoomWidthScale);
  ctx.beginPath();
  ctx.ellipse(p1.sx, p1.sy, targetRingR, targetRingR * TW_ISO_TILT, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Xây dựng đa giác dải lụa 3D thuôn nhọn (Tapered 3D Crimson Ribbon) từ t = 0 -> t = 0.95
  const steps = 24;
  const tipStartT = 0.94;
  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];

  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * tipStartT;
    const pt = samplePoint(t);
    const nx = -pt.ty;
    const ny = pt.tx;
    // Rộng ở tiền quân & đỉnh vòm, thuôn gọn dần khi lao xuống mục tiêu
    const envelope = (1.16 - 0.72 * t) * (0.82 + 0.34 * Math.sin(Math.PI * t));
    const hw = Math.max(1.1, halfWidthPx * envelope);
    leftPts.push({ x: pt.x + nx * hw, y: pt.y + ny * hw });
    rightPts.push({ x: pt.x - nx * hw, y: pt.y - ny * hw });
  }

  const neckPt = samplePoint(tipStartT);
  const neckNx = -neckPt.ty;
  const neckNy = neckPt.tx;
  const headHalfW = Math.max(3.6, halfWidthPx * 1.55);

  // Vẽ hình dải lụa khép kín nối liền đầu mũi tên đỏ thẫm cắm xuống (p1.sx, p1.sy)
  ctx.beginPath();
  ctx.moveTo(leftPts[0].x, leftPts[0].y);
  for (let i = 1; i < leftPts.length; i++) {
    ctx.lineTo(leftPts[i].x, leftPts[i].y);
  }
  // Cánh trái đầu mũi tên
  ctx.lineTo(neckPt.x + neckNx * headHalfW, neckPt.y + neckNy * headHalfW);
  // Đỉnh nhọn chạm mục tiêu
  ctx.lineTo(p1.sx, p1.sy);
  // Cánh phải đầu mũi tên
  ctx.lineTo(neckPt.x - neckNx * headHalfW, neckPt.y - neckNy * headHalfW);
  for (let i = rightPts.length - 1; i >= 0; i--) {
    ctx.lineTo(rightPts[i].x, rightPts[i].y);
  }
  ctx.closePath();

  // Màu lõi chuẩn `rgba(210, 38, 30, 0.72)` theo đúng đặc tả screenshot Trận Bình Nguyên
  const coreAlpha = clamp(0.72 * opacityScale, 0.55, 0.86);
  const ribbonGrad = ctx.createLinearGradient(p0.sx, p0.sy, p1.sx, p1.sy);
  ribbonGrad.addColorStop(0, `rgba(210, 38, 30, ${(coreAlpha * 0.62).toFixed(3)})`);
  ribbonGrad.addColorStop(0.22, `rgba(210, 38, 30, ${coreAlpha.toFixed(3)})`);
  ribbonGrad.addColorStop(
    0.78,
    style === 'artillery'
      ? `rgba(226, 56, 28, ${coreAlpha.toFixed(3)})`
      : `rgba(210, 38, 30, ${coreAlpha.toFixed(3)})`,
  );
  ribbonGrad.addColorStop(1, `rgba(228, 44, 32, ${Math.min(0.94, coreAlpha * 1.15).toFixed(3)})`);

  ctx.fillStyle = ribbonGrad;
  ctx.fill();

  // Viền Đỏ Sẫm (Dark Crimson Edge) bao quanh hai mép dải lụa tạo độ sắc nét tuyệt đối
  ctx.strokeStyle = `rgba(98, 12, 10, ${clamp(0.84 * opacityScale, 0.65, 0.94).toFixed(3)})`;
  ctx.lineWidth = Math.max(1.05, 1.35 * zoomWidthScale);
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Sợi gân sáng mảnh chính giữa vòm parabol
  const cpSx = (p0.sx + p1.sx) * 0.5;
  const cpSy = (p0.sy + p1.sy) * 0.5 - 2 * apexPx;
  ctx.strokeStyle = `rgba(255, 118, 96, ${(0.34 * opacityScale).toFixed(3)})`;
  ctx.lineWidth = Math.max(0.9, 1.1 * zoomWidthScale);
  ctx.beginPath();
  ctx.moveTo(p0.sx, p0.sy);
  ctx.quadraticCurveTo(cpSx, cpSy, p1.sx, p1.sy);
  ctx.stroke();

  // 4. Xung ánh sáng định hướng (Animated Directional Pulse) lướt từ tiền quân tới mục tiêu địch
  const pulseCount = worldDist > 340 ? 3 : 2;
  const basePhase = timeSec * pulseSpeed + (shooter.id * 0.23) % 1;

  for (let p = 0; p < pulseCount; p++) {
    const tHead = (basePhase + p / pulseCount) % 1;
    if (tHead < 0.06 || tHead > 0.96) continue;
    const tTail = Math.max(0.02, tHead - 0.11);

    const head = samplePoint(tHead);
    const mid = samplePoint((tHead + tTail) * 0.5);
    const tail = samplePoint(tTail);

    // Vệt sao băng đỏ rực chạy dọc dải lụa
    const pulseGrad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    pulseGrad.addColorStop(0, 'rgba(210, 38, 30, 0)');
    pulseGrad.addColorStop(0.65, `rgba(255, 112, 88, ${(0.72 * opacityScale).toFixed(3)})`);
    pulseGrad.addColorStop(1, `rgba(255, 214, 188, ${(0.92 * opacityScale).toFixed(3)})`);

    ctx.strokeStyle = pulseGrad;
    ctx.lineWidth = Math.max(1.6, halfWidthPx * 0.85);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.quadraticCurveTo(mid.x, mid.y, head.x, head.y);
    ctx.stroke();

    // Mũi nhọn chevron nhỏ định hướng tại đầu xung ánh sáng
    const chevSize = Math.max(3.2, halfWidthPx * 1.05);
    const hnx = -head.ty;
    const hny = head.tx;
    ctx.strokeStyle = `rgba(255, 224, 204, ${(0.86 * opacityScale).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.1, 1.35 * zoomWidthScale);
    ctx.beginPath();
    ctx.moveTo(head.x - head.tx * chevSize + hnx * chevSize * 0.8, head.y - head.ty * chevSize + hny * chevSize * 0.8);
    ctx.lineTo(head.x + head.tx * chevSize * 0.35, head.y + head.ty * chevSize * 0.35);
    ctx.lineTo(head.x - head.tx * chevSize - hnx * chevSize * 0.8, head.y - head.ty * chevSize - hny * chevSize * 0.8);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Dựng hệ thống Dải Quỹ Đạo Cong Vòm 3D Đỏ Thẫm (Signature Crimson 3D-Arched Trajectories)
 * nối từ hàng quân đầu của mọi trung đoàn đang bắn / xung kích tới trung đoàn địch mục tiêu.
 * - Mặc định `showAllTrajectories = true` để toàn chiến trường tái hiện ngay lập tức những vòm cung tên đỏ
 *   biểu tượng của Total War: Three Kingdoms (Trận Bình Nguyên).
 */
export function renderTwRedTrajectories(
  ctx: CanvasRenderingContext2D,
  regiments: TwRegimentFrame[],
  sides: TwSideSummary[],
  selectedIds: Set<number>,
  myTeam: number | undefined,
  showAllTrajectories: boolean = true,
  cam: TwCamera,
  timeSec: number,
): void {
  if (regiments.length === 0) return;

  const teamByOwner = new Map<number, number>();
  for (let i = 0; i < sides.length; i++) {
    teamByOwner.set(sides[i].idx, sides[i].team);
  }

  const trajectories = resolveActiveTrajectories(
    regiments,
    teamByOwner,
    selectedIds,
    myTeam,
    showAllTrajectories,
  );
  if (trajectories.length === 0) return;

  // Vẽ các dải không chọn trước, dải của trung đoàn đang chọn nổi lên trên cùng
  trajectories.sort((a, b) => {
    const sa = selectedIds.has(a.shooter.id) ? 1 : 0;
    const sb = selectedIds.has(b.shooter.id) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return a.shooter.y - b.shooter.y;
  });

  for (let i = 0; i < trajectories.length; i++) {
    const tr = trajectories[i];
    drawCrimson3DTrajectoryRibbon(
      ctx,
      tr,
      selectedIds.has(tr.shooter.id),
      cam,
      timeSec,
    );
  }
}
