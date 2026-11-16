/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Bộ dựng hình Đại quân 2.5D: Đội hình Binh sĩ Từng Người (Rank-and-File), Chấm Chiến Thuật Mặt Đất,
 * Võ Đài Đấu Tướng 1v1 (Romance Single Duel), Mưa Tên Cầu Vồng & Đá Lửa Uy Viễn,
 * cùng Huy Hiệu Chân Dung Danh Tướng & Biểu Tượng Binh Chủng Lơ Lửng.
 */

import {
  TW_CLASSES,
  TW_COLORS,
  TW_FACTIONS,
  TW_GENERALS,
  TW_MAX_VETERANCY_RANK,
  TW_UNITS,
  type TwAnimState,
  type TwDeployableFrame,
  type TwDuelFrame,
  type TwDuelStance,
  type TwFireZoneFrame,
  type TwGeneralClass,
  type TwGeneralId,
  type TwProjectileFrame,
  type TwRegimentFrame,
  type TwSideSummary,
  type TwUnitCategory,
  type TwUnitKind,
} from '../../../shared/src/tw';
import {
  TW_ISO_TILT,
  worldToScreen,
  type TwCamera,
  type TwDragLinePreview,
} from './camera';
import {
  drawTwAnimatedSprite,
  getTwPortraitToken,
  getTwProjectileImg,
  getTwStructureImg,
  getTwUiImg,
  isImgReady,
  preloadTwAssets,
} from './sprites';
import { twStore } from './store';

// ============================================================================
// 1. HẰNG SỐ HIỆU NĂNG, MÀU SẮC CHIẾN THUẬT & THÔNG SỐ HOẠT ẢNH
// ============================================================================

const TAU = Math.PI * 2;

/** Ngưỡng zoom bắt đầu vẽ đầy đủ từng binh sĩ hoạt ảnh riêng biệt */
export const TW_SOLDIER_SPRITE_ZOOM_MIN = 0.45;

/** Ngân sách tổng quân số hiển thị trước khi lấy mẫu đều 60 sprite/trung đoàn để giữ cứng 60 FPS */
const MAX_UNTHROTTLED_VISIBLE_SOLDIERS = 1800;
const CAPPED_SPRITES_PER_REGIMENT = 60;
const STRATEGIC_ZOOM_SAMPLE_SPRITES = 10;

/** Bảng màu chấm chiến thuật & huy hiệu chuẩn Total War: Three Kingdoms */
const ALLY_DOT_FILL = '#40c057';
const ALLY_DOT_FILL_BRIGHT = '#51cf66';
const ALLY_DOT_RIM = '#ffffff';

const ENEMY_DOT_FILL = '#e03131';
const ENEMY_DOT_FILL_BRIGHT = '#ff4d4f';
const ENEMY_DOT_RIM = 'rgba(255, 232, 232, 0.82)';

const GOLD_TRIM = '#d4af37';
const GOLD_BRIGHT = '#ffd43b';
const INK_DARK = 'rgba(12, 14, 16, 0.90)';

/** Tốc độ chuyển khung hình (FPS) của từng trạng thái hoạt ảnh */
const ANIM_FPS: Record<TwAnimState, number> = {
  idle: 2.2,
  brace: 2.6,
  march: 6.4,
  shoot: 4.8,
  attack: 7.8,
  duel: 8.6,
  charge: 9.6,
  rout: 9.8,
  dead: 0,
};

// ============================================================================
// 2. KIỂU DỮ LIỆU XUẤT KHẨU (PUBLIC INTERFACES)
// ============================================================================

export interface TwSoldierSlot {
  /** Chỉ số binh sĩ trong trung đoàn (0 .. men - 1) */
  idx: number;
  /** Tọa độ thế giới X của binh sĩ */
  wx: number;
  /** Tọa độ thế giới Y của binh sĩ */
  wy: number;
  /** Góc hướng mặt riêng của binh sĩ (radian; hướng tâm ra ngoài ở Viên Trận) */
  facing: number;
  /** Độ lệch pha hoạt ảnh tất định [0, 1) để hàng trăm lính không bước đều máy móc */
  phase: number;
  /** Hàng (0 = tiền quân) */
  rank: number;
  /** Cột trong hàng */
  col: number;
}

export interface TwRenderUnitsOptions {
  cam: TwCamera;
  regiments: ReadonlyArray<TwRegimentFrame>;
  projectiles?: ReadonlyArray<TwProjectileFrame>;
  duels?: ReadonlyArray<TwDuelFrame>;
  sides?: ReadonlyArray<TwSideSummary>;
  /** Chỉ số người chơi hiện tại (undefined = khán giả) */
  myIdx?: number;
  /** Ghi đè phe Liên Minh của người chơi hiện tại nếu cần */
  myTeam?: number;
  /** Tập hợp ID trung đoàn đang được chọn */
  selectedRegIds?: ReadonlySet<number> | ReadonlyArray<number>;
  /** ID trung đoàn đang trỏ chuột */
  hoveredRegId?: number | null;
  /** Tập hợp Võ Tướng đang phát lời thoại đối đáp (hiện biểu tượng loa/chiếu thư trên huy hiệu) */
  activeBanterGeneralIds?: ReadonlySet<TwGeneralId> | ReadonlyArray<TwGeneralId>;
  /** Thời gian thực tính bằng giây (ví dụ `performance.now() * 0.001`) */
  timeSec?: number;
  /** Bật chế độ làm nổi bật chấm chiến thuật & đường hành quân (phím Space / mặc định bật) */
  showTacticalDots?: boolean;
  /** Hiển thị đường lệnh di chuyển / công kích dưới mặt đất cho quân đang chọn */
  showOrderLines?: boolean;
  /** Xem trước vệt kéo chuột phải dàn trận hình Total War */
  dragPreview?: TwDragLinePreview | null;
  /** Cho phép nhìn xuyên rừng phục kích của địch (dành cho khán giả / tổng kết trận) */
  revealHiddenEnemies?: boolean;
  /** Vùng lửa Hỏa Công đang bùng cháy trên chiến trường */
  fires?: ReadonlyArray<TwFireZoneFrame>;
  /** Các bẫy / công sự dã chiến (Chông Gỗ, Chông Sắt, Bẫy Dầu) trên mặt đất */
  deployables?: ReadonlyArray<TwDeployableFrame>;
  /** Góc hướng gió (radian) đẩy khói lửa Hỏa Công trôi theo chiều gió Đông Nam / Tây Bắc */
  windAngle?: number;
  /** Cường độ gió (mặc định ~1.0) */
  windStrength?: number;
  /** Chỉ số tick khung hình từ máy chủ (tự động làm sạch tàn tích khi trận mới `tick <= 3`) */
  tick?: number;
}

export interface TwHitTestOptions {
  cam?: TwCamera;
  myIdx?: number;
  myTeam?: number;
  sides?: ReadonlyArray<TwSideSummary>;
  revealHiddenEnemies?: boolean;
}

// ============================================================================
// 3. HÀM BĂM TẤT ĐỊNH & TIỆN ÍCH HÌNH HỌC KHÔNG RÁC BỘ NHỚ (ZERO-GC HELPERS)
// ============================================================================

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function normalizeAngle(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  let a = (rad + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Hàm băm giả ngẫu nhiên tất định trong [0, 1) — giữ đội hình ổn định tuyệt đối giữa các frame */
function detHash(regId: number, slotIdx: number, salt: number): number {
  let h = (regId * 374761393 + slotIdx * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function resolveTimeSec(timeSec?: number): number {
  if (timeSec !== undefined && Number.isFinite(timeSec)) return timeSec;
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
}

function hasIdInCollection<T>(
  col: ReadonlySet<T> | ReadonlyArray<T> | undefined,
  item: T,
): boolean {
  if (!col) return false;
  if (col instanceof Set) return col.has(item);
  return (col as ReadonlyArray<T>).includes(item);
}

function resolveViewerTeam(
  myIdx?: number,
  sides?: ReadonlyArray<TwSideSummary>,
  myTeamOverride?: number,
): number | undefined {
  if (myTeamOverride !== undefined && Number.isFinite(myTeamOverride)) {
    return myTeamOverride;
  }
  if (myIdx === undefined || myIdx < 0) return undefined;
  if (sides) {
    for (let i = 0; i < sides.length; i++) {
      if (sides[i].idx === myIdx) return sides[i].team;
    }
    if (sides[myIdx]) return sides[myIdx].team;
  }
  return undefined;
}

function resolveOwnerSide(
  ownerIdx: number,
  sides?: ReadonlyArray<TwSideSummary>,
): TwSideSummary | undefined {
  if (!sides) return undefined;
  for (let i = 0; i < sides.length; i++) {
    if (sides[i].idx === ownerIdx) return sides[i];
  }
  return sides[ownerIdx];
}

/**
 * Kiểm tra trung đoàn thuộc phe Ta / Liên Minh Đồng Minh (chấm xanh ngọc `#40c057`)
 * hay phe Địch (chấm đỏ chu sa `#e03131`).
 */
export function isTwRegimentAllied(
  reg: TwRegimentFrame,
  myIdx?: number,
  sides?: ReadonlyArray<TwSideSummary>,
  myTeamOverride?: number,
): boolean {
  if (myIdx === undefined || myIdx < 0) {
    // Chế độ khán giả: Liên Minh 0 mang sắc Ngọc Bích, các phe đối lập mang sắc Chu Sa
    const ownerSide = resolveOwnerSide(reg.ownerIdx, sides);
    if (ownerSide) return ownerSide.team === 0;
    return reg.ownerIdx === 0;
  }
  if (reg.ownerIdx === myIdx) return true;
  const viewerTeam = resolveViewerTeam(myIdx, sides, myTeamOverride);
  const ownerSide = resolveOwnerSide(reg.ownerIdx, sides);
  if (viewerTeam !== undefined && ownerSide !== undefined) {
    return ownerSide.team === viewerTeam;
  }
  return false;
}

/** Kiểm tra trung đoàn có hiển thị trước tầm mắt người xem hiện tại hay không (ẩn phục binh rừng thông) */
export function isTwRegimentVisibleToViewer(
  reg: TwRegimentFrame,
  myIdx?: number,
  sides?: ReadonlyArray<TwSideSummary>,
  revealHiddenEnemies = false,
  myTeamOverride?: number,
): boolean {
  if (reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead') return false;
  if (!reg.hidden || revealHiddenEnemies || myIdx === undefined || myIdx < 0) {
    return true;
  }
  return isTwRegimentAllied(reg, myIdx, sides, myTeamOverride);
}

function unitBaseSpacing(kind: TwUnitKind, isGeneral: boolean): number {
  if (isGeneral) return 22;
  const cat = TW_UNITS[kind]?.category;
  if (cat === 'cavalry_shock' || cat === 'cavalry_melee') return 17;
  if (cat === 'artillery') return 26;
  return 11;
}

function resolveRegimentSheetKey(reg: TwRegimentFrame): string {
  if (reg.isGeneral) {
    const genSpec = reg.generalId ? TW_GENERALS[reg.generalId] : undefined;
    const cls: TwGeneralClass =
      genSpec?.class ?? TW_UNITS[reg.kind]?.element ?? 'commander';
    return `hero_${cls}`;
  }
  return TW_UNITS[reg.kind]?.spritePrefix ?? 'inf_ji_militia';
}

function resolveSpriteWorldSize(reg: TwRegimentFrame): number {
  if (reg.isGeneral) return 52;
  const cat = TW_UNITS[reg.kind]?.category;
  if (cat === 'artillery') return 58;
  if (cat === 'cavalry_shock' || cat === 'cavalry_melee') return 42;
  return 29;
}

/** Quyết định lật gương ngang: toàn bộ spritesheet gốc nhìn sang PHẢI (+X, cos >= 0) */
function shouldFlipSpriteX(facingRad: number, regId: number): boolean {
  const c = Math.cos(facingRad);
  if (Math.abs(c) > 0.04) return c < 0;
  return (regId & 1) === 1;
}

// ============================================================================
// 4. TÍNH TOÁN VỊ TRÍ ĐỘI HÌNH TỪNG NGƯỜI LÍNH TRONG KHÔNG GIAN THẾ GIỚI
// ============================================================================

/**
 * Tính toán vị trí tất định trong không gian thế giới cho từng binh sĩ (`1..150`) của trung đoàn:
 * - `'wedge'` (Phong Thỉ Chùy): mũi nhọn tam giác `1, 3, 5, 7...` binh sĩ mở rộng dần về phía sau.
 * - `'circle'` (Viên Trận): các vòng tròn đồng tâm phòng thủ 360°, binh sĩ chĩa vũ khí hướng ra ngoài.
 * - `'line'`, `'shieldwall'`, `'spearwall'`, `'loose'`: lưới hàng × cột chỉnh tề theo `facing`,
 *   kèm độ lệch hữu cơ khi giao chiến giáp lá cà (`'attack'`) hoặc vỡ trận tháo chạy (`'rout'`).
 */
export function computeRegimentSoldierSlots(
  reg: TwRegimentFrame,
  timeSec = 0,
): TwSoldierSlot[] {
  const men = clamp(Math.round(reg.men || 0), 0, 180);
  if (men <= 0 || reg.hp <= 0 || reg.anim === 'dead') {
    return [];
  }

  const slots = new Array<TwSoldierSlot>(men);
  const facing = Number.isFinite(reg.facing) ? reg.facing : 0;
  // Véc-tơ tiến về phía trước (fx, fy) & véc-tơ sườn trái->phải (rx, ry) khớp camera.ts
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = -fy;
  const ry = fx;

  const spacing = unitBaseSpacing(reg.kind, reg.isGeneral);
  const isFighting = reg.anim === 'attack' || reg.anim === 'duel';
  const isRouting =
    reg.anim === 'rout' ||
    reg.moraleState === 'routing' ||
    reg.moraleState === 'shattered';

  if (men === 1) {
    const phase = detHash(reg.id, 0, 7);
    let wx = reg.x;
    let wy = reg.y;
    if (isFighting) {
      const lunge = Math.sin(timeSec * 7.4 + phase * TAU) * 2.6;
      wx += fx * lunge;
      wy += fy * lunge;
    }
    slots[0] = {
      idx: 0,
      wx,
      wy,
      facing,
      phase,
      rank: 0,
      col: 0,
    };
    return slots;
  }

  // ---------- TRẬN HÌNH 1: PHONG THỈ CHÙY (FLYING WEDGE: 1, 3, 5, 7...) ----------
  if (reg.formation === 'wedge') {
    const totalRows = Math.max(1, Math.ceil(Math.sqrt(men)));
    const maxWedgeCols = Math.max(1, 2 * (totalRows - 1) + 1);
    const effW = Math.max((maxWedgeCols - 1) * spacing * 0.72, reg.width * 1.12);
    const effD = Math.max((totalRows - 1) * spacing * 0.86, reg.depth * 1.14);
    const colStep = maxWedgeCols > 1 ? effW / (maxWedgeCols - 1) : 0;
    const rowStep = totalRows > 1 ? effD / (totalRows - 1) : 0;

    let idx = 0;
    for (let r = 0; r < totalRows && idx < men; r++) {
      const cap = 2 * r + 1;
      const countInRow = Math.min(cap, men - idx);
      const baseFwd = totalRows > 1 ? effD * 0.5 - r * rowStep : 0;

      for (let c = 0; c < countInRow; c++) {
        const phase = detHash(reg.id, idx, 11);
        const h1 = detHash(reg.id, idx, 23) - 0.5;
        const h2 = detHash(reg.id, idx, 37) - 0.5;

        // Đầu nhọn hàng 0 ở chính diện tiền phương, hai cánh vát chéo ra sau
        const chevronLag = Math.abs(c - (countInRow - 1) * 0.5) * spacing * 0.12;
        let fwd = baseFwd - chevronLag + h1 * 0.9;
        let lat = (c - (countInRow - 1) * 0.5) * colStep + h2 * 0.9;
        let soldierFacing = facing;

        if (isFighting) {
          const lunge = Math.sin(timeSec * 7.2 + phase * TAU) * 2.4;
          fwd += h1 * 4.8 + lunge;
          lat += h2 * 4.2;
        } else if (isRouting) {
          fwd += h1 * 13.0 + Math.sin(timeSec * 8.4 + phase * TAU) * 2.0;
          lat += h2 * 13.0;
          soldierFacing = normalizeAngle(facing + h1 * 0.65);
        }

        slots[idx] = {
          idx,
          wx: reg.x + fx * fwd + rx * lat,
          wy: reg.y + fy * fwd + ry * lat,
          facing: soldierFacing,
          phase,
          rank: r,
          col: c,
        };
        idx++;
      }
    }
    return slots;
  }

  // ---------- TRẬN HÌNH 2: VIÊN TRẬN (CONCENTRIC DEFENSIVE RINGS FACING OUTWARD) ----------
  if (reg.formation === 'circle') {
    const outerR = Math.max(
      15,
      Math.max(reg.width, reg.depth) * 0.52,
      Math.sqrt(men) * spacing * 0.46,
    );
    const numRings = men <= 10 ? 1 : men <= 32 ? 2 : men <= 78 ? 3 : 4;

    // Phân bổ quân số tỷ lệ với chu vi từng vòng tròn từ trong ra ngoài
    const ringCounts = new Array<number>(numRings).fill(0);
    const ringRadii = new Array<number>(numRings).fill(outerR);
    let weightSum = 0;
    const weights = new Array<number>(numRings);
    for (let k = 0; k < numRings; k++) {
      const frac = numRings === 1 ? 1 : 0.30 + (0.70 * k) / (numRings - 1);
      ringRadii[k] = outerR * frac;
      weights[k] = frac;
      weightSum += frac;
    }

    let assigned = 0;
    for (let k = 0; k < numRings - 1; k++) {
      const cnt = Math.max(1, Math.round((men * weights[k]) / weightSum));
      ringCounts[k] = Math.min(cnt, men - assigned - (numRings - 1 - k));
      assigned += ringCounts[k];
    }
    ringCounts[numRings - 1] = Math.max(1, men - assigned);

    let idx = 0;
    // Duyệt từ vòng ngoài (rank = 0) vào vòng tâm
    for (let k = numRings - 1; k >= 0 && idx < men; k--) {
      const cnt = ringCounts[k];
      const baseR = ringRadii[k];
      const ringStagger = ((numRings - 1 - k) % 2) * (Math.PI / Math.max(4, cnt));
      const rankIdx = numRings - 1 - k;

      for (let c = 0; c < cnt && idx < men; c++) {
        const phase = detHash(reg.id, idx, 13);
        const h1 = detHash(reg.id, idx, 29) - 0.5;
        const h2 = detHash(reg.id, idx, 43) - 0.5;

        const theta = facing + (c / cnt) * TAU + ringStagger + h1 * 0.04;
        let rad = baseR + h2 * 1.1;
        if (isFighting) {
          rad += Math.sin(timeSec * 7.0 + phase * TAU) * 2.1 + h1 * 2.8;
        } else if (isRouting) {
          rad += h1 * 12.0 + Math.sin(timeSec * 8.5 + phase * TAU) * 2.2;
        }

        const cTheta = Math.cos(theta);
        const sTheta = Math.sin(theta);
        slots[idx] = {
          idx,
          wx: reg.x + cTheta * rad,
          wy: reg.y + sTheta * rad,
          facing: normalizeAngle(isRouting ? theta + h2 * 0.7 : theta),
          phase,
          rank: rankIdx,
          col: c,
        };
        idx++;
      }
    }
    return slots;
  }

  // ---------- TRẬN HÌNH 3..6: TRẬN NGANG / THUẪN TƯỜNG / THƯƠNG LÂM / TẢN TRẬN ----------
  const cols = clamp(
    Math.round(reg.cols) || Math.ceil(Math.sqrt(men * 3.0)),
    1,
    men,
  );
  const rows = Math.max(1, Math.ceil(men / cols));

  const pad = Math.min(spacing * 0.55, reg.width * 0.15);
  const effW = cols > 1 ? Math.max((cols - 1) * 5.2, reg.width - pad) : 0;
  const effD = rows > 1 ? Math.max((rows - 1) * 5.2, reg.depth - pad) : 0;
  const colStep = cols > 1 ? effW / (cols - 1) : 0;
  const rowStep = rows > 1 ? effD / (rows - 1) : 0;

  const baseJitter =
    reg.formation === 'shieldwall' || reg.formation === 'spearwall'
      ? 0.32
      : reg.formation === 'loose'
        ? 2.25
        : 0.85;

  let idx = 0;
  for (let r = 0; r < rows && idx < men; r++) {
    const rowCount = r === rows - 1 ? men - idx : Math.min(cols, men - idx);
    const baseFwd = rows > 1 ? effD * 0.5 - r * rowStep : 0;

    for (let c = 0; c < rowCount && idx < men; c++) {
      const phase = detHash(reg.id, idx, 17);
      const h1 = detHash(reg.id, idx, 31) - 0.5;
      const h2 = detHash(reg.id, idx, 47) - 0.5;

      let fwd = baseFwd + h1 * baseJitter * 2;
      let lat = (c - (rowCount - 1) * 0.5) * colStep + h2 * baseJitter * 2;
      let soldierFacing = facing;

      if (isFighting) {
        // Tiền quân hàng đầu lao chém mạnh hơn hậu quân giữ tuyến sau
        const frontFactor = r <= 1 ? 1.0 : 0.48;
        const lunge =
          Math.sin(timeSec * 7.3 + phase * TAU) * 2.4 * frontFactor;
        fwd += h1 * 6.4 * frontFactor + lunge;
        lat += h2 * 5.6 * frontFactor;
        soldierFacing = normalizeAngle(facing + h2 * 0.22);
      } else if (isRouting) {
        fwd += h1 * 15.0 + Math.sin(timeSec * 8.8 + phase * TAU) * 2.2;
        lat += h2 * 14.0 + Math.cos(timeSec * 7.6 + phase * TAU) * 1.6;
        soldierFacing = normalizeAngle(facing + h1 * 0.72);
      }

      slots[idx] = {
        idx,
        wx: reg.x + fx * fwd + rx * lat,
        wy: reg.y + fy * fwd + ry * lat,
        facing: soldierFacing,
        phase,
        rank: r,
        col: c,
      };
      idx++;
    }
  }

  return slots;
}

// ============================================================================
// 5. BỘ ĐỆM SẮP XẾP ĐỘ SÂU 2.5D TÁI SỬ DỤNG (REUSABLE PAINTER'S POOL)
// ============================================================================

interface SoldierDrawItem {
  wx: number;
  wy: number;
  sx: number;
  sy: number;
  facing: number;
  phase: number;
  sheetKey: string;
  anim: TwAnimState;
  drawSize: number;
  alpha: number;
  regId: number;
  ownerIdx: number;
  isGeneral: boolean;
  category: TwUnitCategory;
  allied: boolean;
  selected: boolean;
}

const drawPool: SoldierDrawItem[] = [];
const activeDrawList: SoldierDrawItem[] = [];

function acquireDrawItem(poolIdx: number): SoldierDrawItem {
  let item = drawPool[poolIdx];
  if (!item) {
    item = {
      wx: 0,
      wy: 0,
      sx: 0,
      sy: 0,
      facing: 0,
      phase: 0,
      sheetKey: 'inf_ji_militia',
      anim: 'idle',
      drawSize: 24,
      alpha: 1,
      regId: 0,
      ownerIdx: 0,
      isGeneral: false,
      category: 'infantry_polearm',
      allied: true,
      selected: false,
    };
    drawPool[poolIdx] = item;
  }
  return item;
}

// ============================================================================
// 5B. TÀN TÍCH CHIẾN TRƯỜNG VĨNH VIỄN (ZERO-GC RING BUFFER 420), BẪY DÃ CHIẾN & HỎA CÔNG
// ============================================================================

/**
 * Phân loại tàn tích mặt đất:
 * 0 = Tử sĩ ngã gục (Fallen Soldier Silhouette)
 * 1 = Khiên mộc/sắt rơi (Dropped Shield)
 * 2 = Trường thương / Chiến kích cắm đất (Planted Spear / Ji)
 * 3 = Mũi tên / Nỏ / Hỏa tiễn cắm phập trên cỏ (Stuck Arrow Shaft)
 * 4 = Hố bom đá lửa cháy đen xém đất (Blackened Scorch Crater)
 */
type RemnantKindCode = 0 | 1 | 2 | 3 | 4;

interface BattleRemnant {
  kind: RemnantKindCode;
  wx: number;
  wy: number;
  angle: number;
  scale: number;
  ownerIdx: number;
  aux: number;
  spawnTimeSec: number;
}

interface PrevRegSnap {
  men: number;
  x: number;
  y: number;
  facing: number;
  width: number;
  depth: number;
  ownerIdx: number;
  kind: TwUnitKind;
  seenTag: number;
}

const MAX_BATTLE_REMNANTS = 420;
const remnantRing: BattleRemnant[] = Array.from({ length: MAX_BATTLE_REMNANTS }, () => ({
  kind: 0,
  wx: 0,
  wy: 0,
  angle: 0,
  scale: 1,
  ownerIdx: 0,
  aux: 0,
  spawnTimeSec: 0,
}));

let remnantWriteIdx = 0;
let remnantCount = 0;
let remnantSaltCounter = 1;
let remnantHadCasualties = false;
let remnantFrameTag = 1;
let lastHandledEarlyTick = -1;

const prevRegSnaps = new Map<number, PrevRegSnap>();
const snapRecyclePool: PrevRegSnap[] = [];
const stampedProjRing = new Int32Array(128).fill(-1);
let stampedProjWriteIdx = 0;

function resetBattleRemnantsState(): void {
  remnantWriteIdx = 0;
  remnantCount = 0;
  remnantHadCasualties = false;
  stampedProjRing.fill(-1);
  stampedProjWriteIdx = 0;
  prevRegSnaps.forEach((snap) => {
    snapRecyclePool.push(snap);
  });
  prevRegSnaps.clear();
}

function pushRemnant(
  kind: RemnantKindCode,
  wx: number,
  wy: number,
  angle: number,
  scale: number,
  ownerIdx: number,
  aux: number,
  spawnTimeSec: number,
): void {
  const slot = remnantRing[remnantWriteIdx];
  slot.kind = kind;
  slot.wx = wx;
  slot.wy = wy;
  slot.angle = angle;
  slot.scale = scale;
  slot.ownerIdx = ownerIdx;
  slot.aux = aux;
  slot.spawnTimeSec = spawnTimeSec;

  remnantWriteIdx = (remnantWriteIdx + 1) % MAX_BATTLE_REMNANTS;
  if (remnantCount < MAX_BATTLE_REMNANTS) {
    remnantCount++;
  }
}

function spawnCasualtyRemnantsAt(
  regId: number,
  x: number,
  y: number,
  facing: number,
  width: number,
  depth: number,
  ownerIdx: number,
  unitKind: TwUnitKind,
  count: number,
  timeSec: number,
): void {
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const rx = -fy;
  const ry = fx;
  const halfW = Math.max(10, width * 0.46);
  const halfD = Math.max(8, depth * 0.46);
  const cat = TW_UNITS[unitKind]?.category ?? 'infantry_polearm';

  for (let k = 0; k < count; k++) {
    const salt = remnantSaltCounter++;
    const uLat = (detHash(regId, salt, 101) - 0.5) * 2;
    const uFwd = (detHash(regId, salt, 107) - 0.5) * 2;
    const wx = x + fx * (uFwd * halfD) + rx * (uLat * halfW);
    const wy = y + fy * (uFwd * halfD) + ry * (uLat * halfW);
    const roll = detHash(regId, salt, 113);
    const randAng = (detHash(regId, salt, 127) - 0.5) * TAU;
    const scale = 0.86 + detHash(regId, salt, 131) * 0.30;

    let kindCode: RemnantKindCode;
    if (roll < 0.52) {
      kindCode = 0; // Tử sĩ ngã gục
    } else if (roll < 0.76 && cat !== 'ranged_bow' && cat !== 'artillery') {
      kindCode = 1; // Khiên rơi trên mặt cỏ
    } else {
      kindCode = 2; // Thương / kích cắm nghiêng trên chiến trường
    }

    pushRemnant(kindCode, wx, wy, randAng, scale, ownerIdx, salt & 3, timeSec);
  }
}

function ingestProjectilesForRemnants(
  projectiles: ReadonlyArray<TwProjectileFrame> | undefined,
  timeSec: number,
): void {
  if (!projectiles || projectiles.length === 0) return;

  for (let i = 0; i < projectiles.length; i++) {
    const proj = projectiles[i];
    if (proj.progress < 0.92) continue;

    let alreadyStamped = false;
    for (let s = 0; s < 128; s++) {
      if (stampedProjRing[s] === proj.id) {
        alreadyStamped = true;
        break;
      }
    }
    if (alreadyStamped) continue;

    stampedProjRing[stampedProjWriteIdx] = proj.id;
    stampedProjWriteIdx = (stampedProjWriteIdx + 1) & 127;

    if (proj.kind === 'boulder') {
      const rot = detHash(proj.id, 1, 211) * TAU;
      const sc = 0.88 + detHash(proj.id, 2, 223) * 0.34;
      pushRemnant(4, proj.x1, proj.y1, rot, sc, proj.ownerIdx, 1, timeSec);
    } else if (
      proj.kind === 'arrow' ||
      proj.kind === 'fire_arrow' ||
      proj.kind === 'bolt'
    ) {
      if (detHash(proj.id, 0, 229) < 0.65) {
        const flightAng = Math.atan2(proj.y1 - proj.y0, proj.x1 - proj.x0);
        const shaftCount = detHash(proj.id, 3, 233) < 0.42 ? 2 : 1;
        for (let k = 0; k < shaftCount; k++) {
          const jx = (detHash(proj.id, k, 239) - 0.5) * 34;
          const jy = (detHash(proj.id, k, 241) - 0.5) * 28;
          const isFire = proj.kind === 'fire_arrow' ? 1 : 0;
          pushRemnant(
            3,
            proj.x1 + jx,
            proj.y1 + jy,
            flightAng + (detHash(proj.id, k, 251) - 0.5) * 0.28,
            0.85 + detHash(proj.id, k, 257) * 0.3,
            proj.ownerIdx,
            isFire,
            timeSec,
          );
        }
      }
    }
  }
}

function updateBattleRemnants(
  regiments: ReadonlyArray<TwRegimentFrame>,
  projectiles: ReadonlyArray<TwProjectileFrame> | undefined,
  timeSec: number,
  explicitTick?: number,
): void {
  const liveTick = explicitTick ?? twStore.currFrame?.tick;

  if (liveTick !== undefined) {
    if (liveTick <= 3) {
      if (lastHandledEarlyTick !== liveTick && (remnantCount > 0 || prevRegSnaps.size > 0)) {
        resetBattleRemnantsState();
      }
      lastHandledEarlyTick = liveTick;
    } else {
      lastHandledEarlyTick = -1;
    }
  }

  // Phát hiện tự động khi sang ván mới: ID trung đoàn đổi loại/chủ sở hữu, quân số hồi vọt hoặc toàn quân đầy 100%
  if (prevRegSnaps.size > 0 && regiments.length > 0) {
    let mismatchReset = false;
    let allFullMax = true;
    for (let i = 0; i < regiments.length; i++) {
      const r = regiments[i];
      const curMen = Math.max(0, Math.round(r.men || 0));
      if (curMen < r.maxMen) allFullMax = false;
      const prev = prevRegSnaps.get(r.id);
      if (prev) {
        if (prev.kind !== r.kind || prev.ownerIdx !== r.ownerIdx || curMen > prev.men + 1) {
          mismatchReset = true;
          break;
        }
      }
    }
    if (mismatchReset || (remnantHadCasualties && allFullMax && regiments.length >= 2)) {
      resetBattleRemnantsState();
    }
  }

  const tag = ++remnantFrameTag;

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    const curMen = Math.max(0, Math.round(reg.men || 0));
    if (curMen < reg.maxMen) {
      remnantHadCasualties = true;
    }

    let snap = prevRegSnaps.get(reg.id);
    if (!snap) {
      snap = snapRecyclePool.pop() ?? {
        men: curMen,
        x: reg.x,
        y: reg.y,
        facing: reg.facing,
        width: reg.width,
        depth: reg.depth,
        ownerIdx: reg.ownerIdx,
        kind: reg.kind,
        seenTag: tag,
      };
      snap.men = curMen;
      snap.x = reg.x;
      snap.y = reg.y;
      snap.facing = reg.facing;
      snap.width = reg.width;
      snap.depth = reg.depth;
      snap.ownerIdx = reg.ownerIdx;
      snap.kind = reg.kind;
      snap.seenTag = tag;
      prevRegSnaps.set(reg.id, snap);
      continue;
    }

    const delta = snap.men - curMen;
    if (delta > 0) {
      remnantHadCasualties = true;
      spawnCasualtyRemnantsAt(
        reg.id,
        reg.x,
        reg.y,
        reg.facing,
        reg.width,
        reg.depth,
        reg.ownerIdx,
        reg.kind,
        Math.min(delta, 6),
        timeSec,
      );
    }

    snap.men = curMen;
    if (curMen > 0) {
      snap.x = reg.x;
      snap.y = reg.y;
      snap.facing = reg.facing;
      snap.width = reg.width;
      snap.depth = reg.depth;
    }
    snap.seenTag = tag;
  }

  // Nếu một trung đoàn vừa bị tiêu diệt hoàn toàn và bị lược khỏi mảng frame hiện tại
  if (regiments.length > 0) {
    prevRegSnaps.forEach((snap, regId) => {
      if (snap.seenTag !== tag && snap.men > 0) {
        remnantHadCasualties = true;
        spawnCasualtyRemnantsAt(
          regId,
          snap.x,
          snap.y,
          snap.facing,
          snap.width,
          snap.depth,
          snap.ownerIdx,
          snap.kind,
          Math.min(snap.men, 4),
          timeSec,
        );
        snap.men = 0;
      }
    });
  }

  ingestProjectilesForRemnants(projectiles, timeSec);
}

/**
 * Vẽ toàn bộ Tàn Tích Chiến Trường trên mặt cỏ (Zero-GC, lọc khung nhìn tức thì < 0.25ms/khung hình).
 */
function renderBattleRemnantsGround(
  ctx: CanvasRenderingContext2D,
  cam: TwCamera,
  timeSec: number,
): void {
  if (remnantCount <= 0) return;

  const zoom = cam.zoom;
  const zoomTilt = zoom * TW_ISO_TILT;
  const halfW = cam.viewW * 0.5;
  const halfH = cam.viewH * 0.5;
  const camX = cam.x;
  const camY = cam.y;
  const viewW = cam.viewW;
  const viewH = cam.viewH;
  const pad = 48;

  const craterImg = getTwProjectileImg('crater_scorch');
  const craterReady = isImgReady(craterImg);
  const startIdx =
    remnantCount < MAX_BATTLE_REMNANTS ? 0 : remnantWriteIdx;

  ctx.save();

  // Lượt 1: Hố đá lửa cháy đen xém đất nằm sát mặt địa hình
  for (let n = 0; n < remnantCount; n++) {
    const rem = remnantRing[(startIdx + n) % MAX_BATTLE_REMNANTS];
    if (rem.kind !== 4) continue;

    const sx = halfW + (rem.wx - camX) * zoom;
    if (sx < -pad || sx > viewW + pad) continue;
    const sy = halfH + (rem.wy - camY) * zoomTilt;
    if (sy < -pad || sy > viewH + pad) continue;

    const rPx = Math.max(8, 25 * rem.scale * zoom);
    const age = Math.max(0, timeSec - rem.spawnTimeSec);
    const emberGlow = clamp(1 - age / 7.5, 0, 1);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, TW_ISO_TILT);
    ctx.rotate(rem.angle);

    if (craterReady && craterImg) {
      ctx.globalAlpha = 0.88;
      ctx.drawImage(craterImg, -rPx, -rPx, rPx * 2, rPx * 2);
    } else {
      const cg = ctx.createRadialGradient(0, 0, rPx * 0.12, 0, 0, rPx);
      cg.addColorStop(0, 'rgba(14, 11, 9, 0.88)');
      cg.addColorStop(0.58, 'rgba(38, 29, 22, 0.72)');
      cg.addColorStop(1, 'rgba(48, 38, 28, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, rPx, 0, TAU);
      ctx.fill();
    }

    if (emberGlow > 0.02) {
      ctx.globalAlpha = emberGlow * (0.65 + 0.2 * Math.sin(timeSec * 8 + n));
      const eg = ctx.createRadialGradient(0, 0, 1, 0, 0, rPx * 0.58);
      eg.addColorStop(0, 'rgba(255, 220, 110, 0.9)');
      eg.addColorStop(0.55, 'rgba(255, 96, 22, 0.55)');
      eg.addColorStop(1, 'rgba(200, 40, 12, 0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 0, rPx * 0.58, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // Lượt 2: Tử sĩ ngã gục, khiên rơi, trường thương cắm đất & tên cắm trên cỏ
  const visScale = clamp(zoom, 0.42, 1.45);
  for (let n = 0; n < remnantCount; n++) {
    const rem = remnantRing[(startIdx + n) % MAX_BATTLE_REMNANTS];
    if (rem.kind === 4) continue;

    const sx = halfW + (rem.wx - camX) * zoom;
    if (sx < -32 || sx > viewW + 32) continue;
    const sy = halfH + (rem.wy - camY) * zoomTilt;
    if (sy < -32 || sy > viewH + 32) continue;

    const sc = rem.scale * visScale;
    const ownerHex = TW_COLORS[rem.ownerIdx % TW_COLORS.length] ?? '#495057';

    if (rem.kind === 0) {
      // Tử sĩ ngã gục (Fallen Soldier Silhouette)
      const cosA = Math.cos(rem.angle);
      const sinA = Math.sin(rem.angle) * TW_ISO_TILT;
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = 'rgba(12, 14, 12, 0.48)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1.2 * sc, 5.8 * sc, 3.1 * sc, rem.angle * 0.5, 0, TAU);
      ctx.fill();

      // Thân giáp bào sẫm màu thế lực
      ctx.fillStyle = ownerHex;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 4.6 * sc, 2.3 * sc, rem.angle * 0.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(18, 16, 15, 0.45)';
      ctx.fill();

      // Mũ sắt / đầu tử sĩ
      ctx.fillStyle = '#3b3734';
      ctx.beginPath();
      ctx.arc(sx + cosA * 4.5 * sc, sy + sinA * 4.5 * sc, Math.max(1.2, 1.9 * sc), 0, TAU);
      ctx.fill();
    } else if (rem.kind === 1) {
      // Khiên mộc sơn mài rơi nghiêng (Dropped Shield)
      ctx.globalAlpha = 0.84;
      ctx.fillStyle = 'rgba(12, 14, 12, 0.42)';
      ctx.beginPath();
      ctx.ellipse(sx + 0.8, sy + 1.2 * sc, 4.2 * sc, 2.5 * sc, rem.angle, 0, TAU);
      ctx.fill();

      ctx.fillStyle = rem.aux % 2 === 0 ? '#5c3c20' : ownerHex;
      ctx.strokeStyle = '#adb5bd';
      ctx.lineWidth = Math.max(0.7, 0.9 * sc);
      ctx.beginPath();
      ctx.ellipse(sx, sy, 3.8 * sc, 2.2 * sc, rem.angle, 0, TAU);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#dee2e6';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.8, 1.1 * sc), 0, TAU);
      ctx.fill();
    } else if (rem.kind === 2) {
      // Trường thương / Chiến kích cắm xiên trên đất (Planted Spear / Ji)
      const tiltX = Math.cos(rem.angle) * 5.2 * sc;
      const tipY = sy - 11.5 * sc;
      ctx.globalAlpha = 0.86;
      ctx.strokeStyle = 'rgba(14, 16, 14, 0.35)';
      ctx.lineWidth = Math.max(0.8, 1.1 * sc);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tiltX + 3 * sc, sy + 1.4 * sc);
      ctx.stroke();

      // Cán thương gỗ tần bì
      ctx.strokeStyle = '#6b4726';
      ctx.lineWidth = Math.max(1.0, 1.35 * sc);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tiltX, tipY);
      ctx.stroke();

      // Tua rua đỏ / màu phe & mũi thương thép lạnh
      ctx.fillStyle = ownerHex;
      ctx.beginPath();
      ctx.arc(sx + tiltX * 0.82, sy - 9.0 * sc, Math.max(1.0, 1.5 * sc), 0, TAU);
      ctx.fill();

      ctx.strokeStyle = '#e9ecef';
      ctx.lineWidth = Math.max(1.0, 1.4 * sc);
      ctx.beginPath();
      ctx.moveTo(sx + tiltX, tipY);
      ctx.lineTo(sx + tiltX * 1.18, tipY - 2.8 * sc);
      ctx.stroke();
    } else if (rem.kind === 3) {
      // Mũi tên / Hỏa tiễn cắm phập xuống bãi cỏ (Stuck Arrow Shaft)
      const tailDx = -Math.cos(rem.angle) * 5.5 * sc;
      const tailDy = -Math.sin(rem.angle) * TW_ISO_TILT * 2.2 * sc - 5.2 * sc;
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = rem.aux === 1 ? '#3d2516' : '#8d6e48';
      ctx.lineWidth = Math.max(0.85, 1.1 * sc);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + tailDx, sy + tailDy);
      ctx.stroke();

      // Đuôi lông vũ trắng hoặc đốm than hồng của hỏa tiễn vừa chạm đất
      ctx.fillStyle = rem.aux === 1 ? '#ff922b' : '#f1f3f5';
      ctx.beginPath();
      ctx.arc(
        rem.aux === 1 ? sx : sx + tailDx,
        rem.aux === 1 ? sy - 0.5 : sy + tailDy,
        Math.max(0.9, 1.3 * sc),
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  ctx.restore();
}

function isDeployableVisibleToViewer(
  dep: TwDeployableFrame,
  myIdx?: number,
  viewerTeam?: number,
  revealHiddenEnemies = false,
): boolean {
  if (dep.hp <= 0) return false;
  if (!dep.hidden || revealHiddenEnemies || myIdx === undefined || myIdx < 0) {
    return true;
  }
  if (dep.ownerIdx === myIdx) return true;
  if (viewerTeam !== undefined) return dep.team === viewerTeam;
  return false;
}

function drawDeployableDamageBar(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  hp: number,
  maxHp: number,
  zoom: number,
): void {
  if (maxHp <= 0 || hp >= maxHp * 0.995) return;
  const frac = clamp(hp / maxHp, 0, 1);
  const w = clamp(28 * zoom, 18, 36);
  const h = 3.5;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 14, 0.82)';
  ctx.fillRect(sx - w * 0.5 - 1, sy - 1, w + 2, h + 2);
  ctx.fillStyle = frac > 0.5 ? '#74c0fc' : frac > 0.25 ? '#ffd43b' : '#ff6b6b';
  ctx.fillRect(sx - w * 0.5, sy, w * frac, h);
  ctx.restore();
}

/**
 * Vẽ các Công Sự Mặt Đất phẳng (`'oil'` Bẫy Dầu Hỏa & `'caltrops'` Chông Sắt Ám Khí) dưới chân lính.
 */
function renderGroundDeployables(
  ctx: CanvasRenderingContext2D,
  deployables: ReadonlyArray<TwDeployableFrame> | undefined,
  cam: TwCamera,
  myIdx: number | undefined,
  viewerTeam: number | undefined,
  revealHiddenEnemies: boolean,
  timeSec: number,
): void {
  if (!deployables || deployables.length === 0) return;

  for (let i = 0; i < deployables.length; i++) {
    const dep = deployables[i];
    if (dep.kind === 'stakes') continue;
    if (!isDeployableVisibleToViewer(dep, myIdx, viewerTeam, revealHiddenEnemies)) continue;

    const { sx, sy } = worldToScreen(dep.x, dep.y, cam);
    const rxPx = Math.max(8, dep.radius * cam.zoom);
    const ryPx = rxPx * TW_ISO_TILT;
    if (
      sx + rxPx < -40 ||
      sx - rxPx > cam.viewW + 40 ||
      sy + ryPx < -40 ||
      sy - ryPx > cam.viewH + 40
    ) {
      continue;
    }

    const stealthAlpha = dep.hidden
      ? 0.58 + 0.14 * Math.sin(timeSec * 3.8 + dep.id * 1.3)
      : 0.95;

    ctx.save();
    ctx.globalAlpha = stealthAlpha;

    if (dep.kind === 'oil') {
      // Bẫy Dầu Hỏa (`火油`): vũng nhựa dầu đen hổ phách óng ánh trên mặt cỏ
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(1, TW_ISO_TILT);

      const oilGrad = ctx.createRadialGradient(
        -rxPx * 0.14,
        -rxPx * 0.12,
        rxPx * 0.08,
        0,
        0,
        rxPx * 0.96,
      );
      oilGrad.addColorStop(0, 'rgba(20, 12, 6, 0.86)');
      oilGrad.addColorStop(0.52, 'rgba(84, 42, 9, 0.76)');
      oilGrad.addColorStop(0.84, 'rgba(182, 96, 16, 0.48)');
      oilGrad.addColorStop(1, 'rgba(182, 96, 16, 0)');
      ctx.fillStyle = oilGrad;

      ctx.beginPath();
      const lobes = 14;
      for (let k = 0; k <= lobes; k++) {
        const a = (k / lobes) * TAU;
        const radMul =
          0.84 +
          0.1 * Math.sin(a * 3 + dep.id * 1.7) +
          0.06 * Math.cos(a * 5 - dep.id * 0.9);
        const px = Math.cos(a) * rxPx * radMul;
        const py = Math.sin(a) * rxPx * radMul;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Vệt phản quang váng dầu hổ phách lấp lánh
      const sheen = 0.34 + 0.16 * Math.sin(timeSec * 2.4 + dep.id);
      ctx.strokeStyle = `rgba(255, 206, 118, ${sheen.toFixed(3)})`;
      ctx.lineWidth = Math.max(1.1, 2.0 * cam.zoom);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-rxPx * 0.1, -rxPx * 0.08, rxPx * 0.46, -Math.PI * 0.78, -Math.PI * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rxPx * 0.14, rxPx * 0.12, rxPx * 0.28, Math.PI * 0.12, Math.PI * 0.68);
      ctx.stroke();
      ctx.restore();
    } else if (dep.kind === 'caltrops') {
      // Chông Sắt Ám Khí (`鐵蒺藜`): đinh sắt 4 chấu lấp lánh rải kín bán kính (lung linh ẩn hình nếu `dep.hidden`)
      const spikeCount = 18;
      const armPx = clamp(4.2 * cam.zoom, 2.2, 6.2);

      if (dep.hidden) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, TW_ISO_TILT);
        ctx.strokeStyle = 'rgba(130, 236, 178, 0.36)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, rxPx * 0.92, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      for (let k = 0; k < spikeCount; k++) {
        const ang = detHash(dep.id, k, 401) * TAU;
        const distFrac = Math.sqrt((k + 0.35) / spikeCount) * 0.86;
        const px = sx + Math.cos(ang) * rxPx * distFrac;
        const py = sy + Math.sin(ang) * ryPx * distFrac;
        const glint =
          0.62 + 0.38 * Math.max(0, Math.sin(timeSec * 4.5 + dep.id + k * 1.9));

        ctx.fillStyle = 'rgba(12, 14, 16, 0.45)';
        ctx.beginPath();
        ctx.arc(px, py + 1, Math.max(1.0, armPx * 0.45), 0, TAU);
        ctx.fill();

        ctx.strokeStyle = glint > 0.9 ? '#ffffff' : '#ced4da';
        ctx.lineWidth = Math.max(0.95, 1.35 * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(px - armPx, py - armPx * 0.45);
        ctx.lineTo(px + armPx, py + armPx * 0.45);
        ctx.moveTo(px - armPx * 0.35, py + armPx * 0.72);
        ctx.lineTo(px + armPx * 0.35, py - armPx * 0.85);
        ctx.stroke();
      }
    }

    drawDeployableDamageBar(ctx, sx, sy + ryPx * 0.68, dep.hp, dep.maxHp, cam.zoom);
    ctx.restore();
  }
}

/**
 * Vẽ hàng Chông Gỗ Phản Kỵ (`拒馬` Cheval-de-Frise) phối cảnh 2.5D hướng mũi nhọn sắt theo `dep.facing`.
 */
function renderStakesDeployables(
  ctx: CanvasRenderingContext2D,
  deployables: ReadonlyArray<TwDeployableFrame> | undefined,
  cam: TwCamera,
  myIdx: number | undefined,
  viewerTeam: number | undefined,
  revealHiddenEnemies: boolean,
  timeSec: number,
): void {
  if (!deployables || deployables.length === 0) return;
  const palisadeImg = getTwStructureImg('palisade_wall.png');

  for (let i = 0; i < deployables.length; i++) {
    const dep = deployables[i];
    if (dep.kind !== 'stakes') continue;
    if (!isDeployableVisibleToViewer(dep, myIdx, viewerTeam, revealHiddenEnemies)) continue;

    const center = worldToScreen(dep.x, dep.y, cam);
    const bound = dep.radius * cam.zoom + 50;
    if (
      center.sx + bound < 0 ||
      center.sx - bound > cam.viewW ||
      center.sy + bound < 0 ||
      center.sy - bound > cam.viewH
    ) {
      continue;
    }

    const facing = Number.isFinite(dep.facing) ? dep.facing : -Math.PI * 0.5;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);
    const lx = -fy;
    const ly = fx;
    const rowSpan = dep.radius * 0.82;
    const crossCount = 5;

    ctx.save();
    if (dep.hidden) {
      ctx.globalAlpha = 0.65 + 0.1 * Math.sin(timeSec * 3.5 + dep.id);
    }

    // Bóng đổ hào cự mã dưới mặt cỏ
    const pLeft = worldToScreen(dep.x - lx * rowSpan, dep.y - ly * rowSpan, cam);
    const pRight = worldToScreen(dep.x + lx * rowSpan, dep.y + ly * rowSpan, cam);
    ctx.strokeStyle = 'rgba(14, 12, 10, 0.45)';
    ctx.lineWidth = Math.max(3, 8 * cam.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pLeft.sx, pLeft.sy + 2 * cam.zoom);
    ctx.lineTo(pRight.sx, pRight.sy + 2 * cam.zoom);
    ctx.stroke();

    // Tận dụng hoạ tiết gỗ cự mã `palisade_wall.png` lót nhẹ nếu góc dàn ngang gần trục X
    if (isImgReady(palisadeImg) && Math.abs(lx) > 0.82) {
      const pw = dep.radius * 1.7 * cam.zoom;
      const ph = pw * 0.52;
      ctx.save();
      ctx.globalAlpha *= 0.42;
      ctx.drawImage(palisadeImg, center.sx - pw * 0.5, center.sy - ph * 0.72, pw, ph);
      ctx.restore();
    }

    // Trục xà gỗ lim xuyên tâm kết nối các cụm chông chữ X
    const beamLift = 7.5 * cam.zoom;
    ctx.strokeStyle = '#4a321d';
    ctx.lineWidth = Math.max(2.0, 4.2 * cam.zoom);
    ctx.beginPath();
    ctx.moveTo(pLeft.sx, pLeft.sy - beamLift);
    ctx.lineTo(pRight.sx, pRight.sy - beamLift);
    ctx.stroke();

    // Sắp xếp từng cụm Chông Gỗ chữ X từ Bắc xuống Nam theo chiều sâu wy
    const indices = [0, 1, 2, 3, 4];
    indices.sort((a, b) => {
      const wyA = dep.y + ly * (-rowSpan + (2 * rowSpan * a) / (crossCount - 1));
      const wyB = dep.y + ly * (-rowSpan + (2 * rowSpan * b) / (crossCount - 1));
      return wyA - wyB;
    });

    for (let idx = 0; idx < indices.length; idx++) {
      const k = indices[idx];
      const lat = -rowSpan + (2 * rowSpan * k) / (crossCount - 1);
      const baseWx = dep.x + lx * lat;
      const baseWy = dep.y + ly * lat;

      // Chân sau cắm đất (-fx) -> Mũi nhọn vươn cao chĩa thẳng theo hướng `dep.facing` (+fx)
      const tailRear = worldToScreen(baseWx - fx * 12 - lx * 4, baseWy - fy * 12 - ly * 4, cam);
      const tipFront = worldToScreen(baseWx + fx * 17 + lx * 3, baseWy + fy * 17 + ly * 3, cam);
      const tailRear2 = worldToScreen(baseWx - fx * 11 + lx * 5, baseWy - fy * 11 + ly * 5, cam);
      const tipFront2 = worldToScreen(baseWx + fx * 15 - lx * 4, baseWy + fy * 15 - ly * 4, cam);
      const hub = worldToScreen(baseWx, baseWy, cam);

      const tipLift1 = 15.5 * cam.zoom;
      const tipLift2 = 12.5 * cam.zoom;

      // Thanh chông thứ nhất
      ctx.strokeStyle = '#5c3f24';
      ctx.lineWidth = Math.max(1.6, 3.2 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(tailRear.sx, tailRear.sy);
      ctx.lineTo(tipFront.sx, tipFront.sy - tipLift1);
      ctx.stroke();

      // Thanh chông thứ hai đan chéo chữ X
      ctx.strokeStyle = '#7a5633';
      ctx.lineWidth = Math.max(1.5, 2.9 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(tailRear2.sx, tailRear2.sy);
      ctx.lineTo(tipFront2.sx, tipFront2.sy - tipLift2);
      ctx.stroke();

      // Dây thừng gai buộc chặt tâm chữ X
      ctx.fillStyle = '#2b1d11';
      ctx.beginPath();
      ctx.arc(hub.sx, hub.sy - beamLift, Math.max(1.3, 2.4 * cam.zoom), 0, TAU);
      ctx.fill();

      // Mũi bọc sắt nhọn hoắt ánh bạc hướng về tiền phương
      ctx.strokeStyle = '#f1f3f5';
      ctx.lineWidth = Math.max(1.3, 2.2 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(
        tipFront.sx - (tipFront.sx - tailRear.sx) * 0.22,
        tipFront.sy - tipLift1 + tipLift1 * 0.22,
      );
      ctx.lineTo(tipFront.sx, tipFront.sy - tipLift1);
      ctx.moveTo(
        tipFront2.sx - (tipFront2.sx - tailRear2.sx) * 0.22,
        tipFront2.sy - tipLift2 + tipLift2 * 0.22,
      );
      ctx.lineTo(tipFront2.sx, tipFront2.sy - tipLift2);
      ctx.stroke();
    }

    drawDeployableDamageBar(
      ctx,
      center.sx,
      center.sy - 23 * cam.zoom,
      dep.hp,
      dep.maxHp,
      cam.zoom,
    );
    ctx.restore();
  }
}

/**
 * Thảm than hồng cháy xém mặt đất dưới các vùng Hỏa Công (`unitOpts.fires`).
 */
function renderWildfiresGroundBed(
  ctx: CanvasRenderingContext2D,
  fires: ReadonlyArray<TwFireZoneFrame> | undefined,
  cam: TwCamera,
  timeSec: number,
): void {
  if (!fires || fires.length === 0) return;
  const craterImg = getTwProjectileImg('crater_scorch');
  const craterReady = isImgReady(craterImg);

  for (let i = 0; i < fires.length; i++) {
    const fz = fires[i];
    if (fz.leftSec <= 0 || fz.radius <= 0) continue;

    const { sx, sy } = worldToScreen(fz.x, fz.y, cam);
    const rxPx = Math.max(12, fz.radius * cam.zoom);
    const ryPx = rxPx * TW_ISO_TILT;
    if (
      sx + rxPx * 1.4 < 0 ||
      sx - rxPx * 1.4 > cam.viewW ||
      sy + ryPx * 1.4 < 0 ||
      sy - ryPx * 1.4 > cam.viewH
    ) {
      continue;
    }

    const inten = clamp(fz.intensity || 1, 0.3, 1.5);
    const pulse = 0.82 + 0.18 * Math.sin(timeSec * 8.4 + fz.id * 1.7);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, TW_ISO_TILT);

    if (craterReady && craterImg) {
      ctx.globalAlpha = clamp(0.56 * inten, 0.25, 0.78);
      ctx.drawImage(craterImg, -rxPx * 1.05, -rxPx * 1.05, rxPx * 2.1, rxPx * 2.1);
    }

    ctx.globalAlpha = 1;
    const bedGrad = ctx.createRadialGradient(0, 0, rxPx * 0.1, 0, 0, rxPx * 1.15);
    bedGrad.addColorStop(0, `rgba(255, 196, 56, ${(0.46 * inten * pulse).toFixed(3)})`);
    bedGrad.addColorStop(0.45, `rgba(235, 76, 18, ${(0.44 * inten * pulse).toFixed(3)})`);
    bedGrad.addColorStop(0.82, `rgba(28, 18, 14, ${(0.52 * inten).toFixed(3)})`);
    bedGrad.addColorStop(1, 'rgba(20, 14, 10, 0)');
    ctx.fillStyle = bedGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rxPx * 1.15, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Biển Lửa Hỏa Công Đa Tầng, Luồng Khói Đen Cuồn Cuộn Trôi Theo Gió (`windAngle`)
 * và Lưỡi Lửa Thiêu Đốt trên các trung đoàn đang bốc cháy (`reg.burning === true`).
 */
function renderWildfiresFlamesAndSmoke(
  ctx: CanvasRenderingContext2D,
  fires: ReadonlyArray<TwFireZoneFrame> | undefined,
  visibleRegs: ReadonlyArray<TwRegimentFrame>,
  cam: TwCamera,
  windAngle: number | undefined,
  windStrength: number | undefined,
  timeSec: number,
): void {
  const wAng = Number.isFinite(windAngle) ? (windAngle as number) : 0.42;
  const wStr = clamp(Number.isFinite(windStrength) ? (windStrength as number) : 1.0, 0.2, 2.4);
  const windScreenDx = Math.cos(wAng) * wStr;
  const windScreenDy = Math.sin(wAng) * TW_ISO_TILT * wStr;
  const zoomScale = clamp(cam.zoom, 0.42, 1.55);

  // 1. Lưỡi lửa bén trên đội hình trung đoàn đang bị thiêu đốt (`reg.burning === true`)
  for (let r = 0; r < visibleRegs.length; r++) {
    const reg = visibleRegs[r];
    if (!reg.burning) continue;

    const tongueCount = reg.isGeneral ? 3 : clamp(Math.ceil(reg.men / 22), 3, 7);
    const fx = Math.cos(reg.facing);
    const fy = Math.sin(reg.facing);
    const rx = -fy;
    const ry = fx;
    const halfW = Math.max(8, reg.width * 0.38);
    const halfD = Math.max(6, reg.depth * 0.36);

    ctx.save();
    for (let k = 0; k < tongueCount; k++) {
      const uLat = (detHash(reg.id, k, 503) - 0.5) * 2;
      const uFwd = (detHash(reg.id, k, 509) - 0.5) * 2;
      const wx = reg.x + fx * (uFwd * halfD) + rx * (uLat * halfW);
      const wy = reg.y + fy * (uFwd * halfD) + ry * (uLat * halfW);
      const pt = worldToScreen(wx, wy, cam);

      const flick = Math.sin(timeSec * 13.5 + reg.id * 1.7 + k * 2.3);
      const fh = (10 + 3.5 * flick) * zoomScale;
      const fw = 4.2 * zoomScale;
      const lean = (windScreenDx * 3.8 + flick * 1.6) * zoomScale;
      const baseY = pt.sy - 4 * zoomScale;

      ctx.fillStyle = 'rgba(235, 59, 30, 0.86)';
      ctx.beginPath();
      ctx.moveTo(pt.sx - fw, baseY);
      ctx.quadraticCurveTo(pt.sx - fw * 0.7, baseY - fh * 0.6, pt.sx + lean, baseY - fh);
      ctx.quadraticCurveTo(pt.sx + fw * 0.9, baseY - fh * 0.5, pt.sx + fw, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 206, 58, 0.92)';
      ctx.beginPath();
      ctx.moveTo(pt.sx - fw * 0.52, baseY);
      ctx.lineTo(pt.sx + lean * 0.65, baseY - fh * 0.66);
      ctx.lineTo(pt.sx + fw * 0.52, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Ngọn lửa Hỏa Công đa tầng + Tàn lửa đỏ + Cột khói đen dạt theo chiều gió `windAngle`
  if (!fires || fires.length === 0) return;

  for (let i = 0; i < fires.length; i++) {
    const fz = fires[i];
    if (fz.leftSec <= 0 || fz.radius <= 0) continue;

    const center = worldToScreen(fz.x, fz.y, cam);
    const rxPx = Math.max(12, fz.radius * cam.zoom);
    const ryPx = rxPx * TW_ISO_TILT;
    const smokePad = 140 * zoomScale;
    if (
      center.sx + rxPx + smokePad < 0 ||
      center.sx - rxPx - smokePad > cam.viewW ||
      center.sy + ryPx + 40 < 0 ||
      center.sy - ryPx - smokePad > cam.viewH
    ) {
      continue;
    }

    const inten = clamp(fz.intensity || 1, 0.35, 1.5);
    const fadeTail = clamp(fz.leftSec / 1.8, 0.25, 1);
    const flameClusters = clamp(Math.round(fz.radius / 9), 7, 14);

    ctx.save();

    // 2A. Các cụm lưỡi lửa 3 lớp (Đỏ Chu Sa -> Cam Hổ Phách -> Lõi Vàng Trắng) nhảy múa theo gió
    for (let k = 0; k < flameClusters; k++) {
      const ang = detHash(fz.id, k, 601) * TAU + timeSec * 0.18 * (k % 2 === 0 ? 1 : -1);
      const radFrac = Math.sqrt((k + 0.3) / flameClusters) * 0.84;
      const fx = center.sx + Math.cos(ang) * rxPx * radFrac;
      const fy = center.sy + Math.sin(ang) * ryPx * radFrac;

      const wave = Math.sin(timeSec * 11.2 + fz.id * 1.3 + k * 2.1);
      const centerBoost = 1.25 - radFrac * 0.45;
      const fh = (16 + 5.5 * wave) * zoomScale * inten * centerBoost * fadeTail;
      const fw = (6.2 + (k % 3) * 1.4) * zoomScale * Math.min(1.2, inten);
      const windLeanX = (windScreenDx * 7.5 + wave * 2.4) * zoomScale;
      const windLeanY = windScreenDy * 2.5 * zoomScale;

      // Tầng ngoài Đỏ Hỏa Diệm
      ctx.fillStyle = `rgba(226, 52, 24, ${(0.78 * fadeTail).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy);
      ctx.quadraticCurveTo(
        fx - fw * 0.6,
        fy - fh * 0.58,
        fx + windLeanX,
        fy - fh + windLeanY,
      );
      ctx.quadraticCurveTo(fx + fw * 0.9, fy - fh * 0.45, fx + fw, fy);
      ctx.closePath();
      ctx.fill();

      // Tầng giữa Cam Rực
      ctx.fillStyle = `rgba(255, 152, 28, ${(0.86 * fadeTail).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.62, fy);
      ctx.quadraticCurveTo(
        fx - fw * 0.3,
        fy - fh * 0.44,
        fx + windLeanX * 0.72,
        fy - fh * 0.74 + windLeanY * 0.7,
      );
      ctx.quadraticCurveTo(fx + fw * 0.5, fy - fh * 0.35, fx + fw * 0.62, fy);
      ctx.closePath();
      ctx.fill();

      // Tầng lõi Hoàng Kim Trắng
      ctx.fillStyle = `rgba(255, 243, 191, ${(0.9 * fadeTail).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(fx + windLeanX * 0.22, fy - fh * 0.24, Math.max(1.3, fw * 0.34), 0, TAU);
      ctx.fill();
    }

    // 2B. Tàn lửa đỏ rực cuốn bay theo hướng gió
    const sparkCount = 6;
    for (let sp = 0; sp < sparkCount; sp++) {
      const life = (timeSec * (1.1 + (sp % 3) * 0.24) + fz.id * 0.31 + sp * 0.17) % 1;
      const seedX = (detHash(fz.id, sp, 617) - 0.5) * rxPx * 1.1;
      const seedY = (detHash(fz.id, sp, 631) - 0.5) * ryPx * 1.1;
      const sx =
        center.sx +
        seedX +
        windScreenDx * life * 48 * zoomScale +
        Math.sin(timeSec * 7 + sp * 2) * 3 * zoomScale;
      const sy =
        center.sy +
        seedY +
        windScreenDy * life * 48 * zoomScale -
        life * 38 * zoomScale;

      ctx.globalAlpha = (1 - life) * 0.9 * fadeTail;
      ctx.fillStyle = sp % 2 === 0 ? '#ffd43b' : '#ff6b35';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.0, (2.1 - life * 0.9) * zoomScale), 0, TAU);
      ctx.fill();
    }

    // 2C. Đám khói đen đặc cuồn cuộn trôi dạt theo đúng hướng gió `windAngle`
    const smokePuffs = 7;
    for (let sm = 0; sm < smokePuffs; sm++) {
      const life = (timeSec * (0.42 + (sm % 3) * 0.08) + fz.id * 0.23 + sm / smokePuffs) % 1;
      const originX = (detHash(fz.id, sm, 643) - 0.5) * rxPx * 0.85;
      const originY = (detHash(fz.id, sm, 653) - 0.5) * ryPx * 0.85;
      const driftDist = life * 92 * zoomScale;

      const puffX =
        center.sx +
        originX +
        windScreenDx * driftDist +
        Math.sin(timeSec * 2.2 + sm * 1.7) * 5 * zoomScale;
      const puffY =
        center.sy +
        originY -
        14 * zoomScale +
        windScreenDy * driftDist -
        life * 54 * zoomScale;
      const puffR = (10 + life * 22) * zoomScale * Math.min(1.25, 0.75 + inten * 0.35);
      const smokeAlpha = Math.sin(life * Math.PI) * 0.34 * fadeTail;

      if (smokeAlpha <= 0.01) continue;
      ctx.globalAlpha = smokeAlpha;
      const sg = ctx.createRadialGradient(puffX, puffY, puffR * 0.15, puffX, puffY, puffR);
      sg.addColorStop(0, 'rgba(34, 30, 28, 0.92)');
      sg.addColorStop(0.62, 'rgba(48, 43, 40, 0.55)');
      sg.addColorStop(1, 'rgba(48, 43, 40, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(puffX, puffY, puffR, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ============================================================================
// 6. VẼ KHUNG ĐỘI HÌNH MẶT ĐẤT, VÒNG HÀO QUANG NGŨ HÀNH & ĐƯỜNG LỆNH HÀNH QUÂN
// ============================================================================

function drawGroundEllipse(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  radiusWorld: number,
  cam: TwCamera,
): void {
  const { sx, sy } = worldToScreen(wx, wy, cam);
  const rx = Math.max(2, radiusWorld * cam.zoom);
  const ry = Math.max(2, radiusWorld * cam.zoom * TW_ISO_TILT);
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU);
}

function drawRegimentGroundFootprint(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  cam: TwCamera,
  allied: boolean,
  selected: boolean,
  hovered: boolean,
  timeSec: number,
): void {
  // Vòng Ngũ Hành Cuồng Nộ Báo Thù (`guanxiState === 'enraged'`) đập đỏ-vàng dưới chân Tướng chọn/trỏ chuột
  if ((selected || hovered) && reg.guanxiState === 'enraged') {
    const rageBeat = 0.5 + 0.5 * Math.sin(timeSec * 6.8 + reg.id);
    const rageR = (reg.isGeneral ? 34 : Math.max(24, reg.width * 0.55)) * (0.94 + 0.14 * rageBeat);
    ctx.save();
    drawGroundEllipse(ctx, reg.x, reg.y, rageR, cam);
    ctx.fillStyle = `rgba(224, 38, 28, ${(0.14 + 0.1 * rageBeat).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = selected ? 2.6 : 2.0;
    ctx.stroke();

    drawGroundEllipse(ctx, reg.x, reg.y, rageR * 0.82, cam);
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -timeSec * 20;
    ctx.strokeStyle = GOLD_BRIGHT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // Vòng hào quang Ngũ Hành (Wu Xing Command Aura) cho Võ Tướng đang được chọn / trỏ chuột
  if (reg.isGeneral && reg.generalId && (selected || hovered)) {
    const genSpec = TW_GENERALS[reg.generalId];
    const clsSpec = genSpec ? TW_CLASSES[genSpec.class] : TW_CLASSES.commander;
    const isEnraged = reg.guanxiState === 'enraged';
    ctx.save();
    drawGroundEllipse(ctx, reg.x, reg.y, clsSpec.auraRadius, cam);
    ctx.fillStyle = isEnraged
      ? 'rgba(224, 49, 49, 0.085)'
      : allied
        ? 'rgba(64, 192, 87, 0.055)'
        : 'rgba(224, 49, 49, 0.055)';
    ctx.fill();
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -timeSec * (isEnraged ? 24 : 14);
    ctx.strokeStyle = isEnraged ? '#ff4d38' : clsSpec.color;
    ctx.globalAlpha = selected ? 0.72 : 0.44;
    ctx.lineWidth = selected ? 1.9 : 1.3;
    ctx.stroke();
    ctx.restore();
  }

  if (!selected && !hovered && cam.zoom >= TW_SOLDIER_SPRITE_ZOOM_MIN) {
    return;
  }

  const accent = allied
    ? selected
      ? ALLY_DOT_FILL_BRIGHT
      : ALLY_DOT_FILL
    : ENEMY_DOT_FILL_BRIGHT;

  if (reg.formation === 'circle' || reg.isGeneral) {
    const rWorld = reg.isGeneral
      ? 22
      : Math.max(18, Math.max(reg.width, reg.depth) * 0.56);
    ctx.save();
    drawGroundEllipse(ctx, reg.x, reg.y, rWorld, cam);
    if (selected) {
      ctx.fillStyle = allied
        ? 'rgba(64, 192, 87, 0.14)'
        : 'rgba(224, 49, 49, 0.14)';
      ctx.fill();
    }
    ctx.strokeStyle = reg.isGeneral && selected ? GOLD_BRIGHT : accent;
    ctx.globalAlpha = selected ? 0.92 : hovered ? 0.68 : 0.35;
    ctx.lineWidth = selected ? 2.2 : 1.4;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Khung chữ nhật xoay 2.5D + mũi tên hướng mặt chuẩn Total War
  const halfW = Math.max(14, reg.width * 0.5 + 5);
  const halfD = Math.max(10, reg.depth * 0.5 + 5);
  const fx = Math.cos(reg.facing);
  const fy = Math.sin(reg.facing);
  const rx = -fy;
  const ry = fx;

  const pFL = worldToScreen(
    reg.x + fx * halfD - rx * halfW,
    reg.y + fy * halfD - ry * halfW,
    cam,
  );
  const pFR = worldToScreen(
    reg.x + fx * halfD + rx * halfW,
    reg.y + fy * halfD + ry * halfW,
    cam,
  );
  const pBR = worldToScreen(
    reg.x - fx * halfD + rx * halfW,
    reg.y - fy * halfD + ry * halfW,
    cam,
  );
  const pBL = worldToScreen(
    reg.x - fx * halfD - rx * halfW,
    reg.y - fy * halfD - ry * halfW,
    cam,
  );

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pFL.sx, pFL.sy);
  ctx.lineTo(pFR.sx, pFR.sy);
  ctx.lineTo(pBR.sx, pBR.sy);
  ctx.lineTo(pBL.sx, pBL.sy);
  ctx.closePath();

  if (selected || cam.zoom < TW_SOLDIER_SPRITE_ZOOM_MIN) {
    ctx.fillStyle = allied
      ? selected
        ? 'rgba(64, 192, 87, 0.16)'
        : 'rgba(64, 192, 87, 0.10)'
      : hovered
        ? 'rgba(224, 49, 49, 0.15)'
        : 'rgba(224, 49, 49, 0.10)';
    ctx.fill();
  }

  ctx.strokeStyle = accent;
  ctx.globalAlpha = selected ? 0.92 : hovered ? 0.65 : 0.42;
  ctx.lineWidth = selected ? 2.0 : 1.25;
  ctx.stroke();

  // Mũi nhọn chỉ hướng tiền quân ở chính giữa mép trước
  const frontMid = worldToScreen(reg.x + fx * halfD, reg.y + fy * halfD, cam);
  const tipWorld = halfD + Math.min(14, Math.max(7, 9 / cam.zoom));
  const tip = worldToScreen(
    reg.x + fx * tipWorld,
    reg.y + fy * tipWorld,
    cam,
  );
  const wingL = worldToScreen(
    reg.x + fx * halfD - rx * 7,
    reg.y + fy * halfD - ry * 7,
    cam,
  );
  const wingR = worldToScreen(
    reg.x + fx * halfD + rx * 7,
    reg.y + fy * halfD + ry * 7,
    cam,
  );
  ctx.beginPath();
  ctx.moveTo(wingL.sx, wingL.sy);
  ctx.lineTo(tip.sx, tip.sy);
  ctx.lineTo(wingR.sx, wingR.sy);
  ctx.lineTo(frontMid.sx, frontMid.sy);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
}

function drawTacticalOrderLines(
  ctx: CanvasRenderingContext2D,
  opts: TwRenderUnitsOptions,
  regById: Map<number, TwRegimentFrame>,
  timeSec: number,
): void {
  const { cam, regiments, myIdx, myTeam, sides, selectedRegIds, dragPreview } = opts;
  const showAllAlliedOrders = Boolean(opts.showTacticalDots && opts.showOrderLines);

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead') continue;
    const allied = isTwRegimentAllied(reg, myIdx, sides, myTeam);
    if (!allied) continue;

    const selected = hasIdInCollection(selectedRegIds, reg.id);
    if (!selected && !showAllAlliedOrders) continue;

    const from = worldToScreen(reg.x, reg.y, cam);

    // Đường công kích đỏ cam tới trung đoàn mục tiêu
    if (reg.lockedTargetId !== undefined) {
      const target = regById.get(reg.lockedTargetId);
      if (target && target.men > 0 && target.hp > 0 && target.anim !== 'dead') {
        const to = worldToScreen(target.x, target.y, cam);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -timeSec * 28;
        ctx.strokeStyle = 'rgba(255, 92, 92, 0.78)';
        ctx.lineWidth = selected ? 2.1 : 1.4;
        ctx.stroke();

        // Đầu mũi tên công kích
        const ang = Math.atan2(to.sy - from.sy, to.sx - from.sx);
        ctx.setLineDash([]);
        ctx.translate(to.sx, to.sy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-10, -4.5);
        ctx.lineTo(-7.5, 0);
        ctx.lineTo(-10, 4.5);
        ctx.closePath();
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        ctx.restore();
        continue;
      }
    }

    // Đường hành quân ngọc bích/vàng đồng tới tọa độ tập kết
    if (reg.moveTargetX !== undefined && reg.moveTargetY !== undefined) {
      const dist = Math.hypot(reg.moveTargetX - reg.x, reg.moveTargetY - reg.y);
      if (dist > 14) {
        const to = worldToScreen(reg.moveTargetX, reg.moveTargetY, cam);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(from.sx, from.sy);
        ctx.lineTo(to.sx, to.sy);
        ctx.setLineDash([7, 5]);
        ctx.lineDashOffset = -timeSec * 22;
        ctx.strokeStyle = 'rgba(81, 207, 102, 0.72)';
        ctx.lineWidth = selected ? 1.9 : 1.25;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(to.sx, to.sy, 3.6, 0, TAU);
        ctx.fillStyle = ALLY_DOT_FILL_BRIGHT;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Vệt kéo chuột phải dàn hàng quân chuẩn Total War (Right-Click Drag Battle Line)
  if (dragPreview) {
    const sStart = worldToScreen(dragPreview.startWx, dragPreview.startWy, cam);
    const sEnd = worldToScreen(dragPreview.endWx, dragPreview.endWy, cam);
    const sCenter = worldToScreen(dragPreview.centerX, dragPreview.centerY, cam);
    const fx = Math.cos(dragPreview.facing);
    const fy = Math.sin(dragPreview.facing);
    const sTip = worldToScreen(
      dragPreview.centerX + fx * 34,
      dragPreview.centerY + fy * 34,
      cam,
    );

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sStart.sx, sStart.sy);
    ctx.lineTo(sEnd.sx, sEnd.sy);
    ctx.strokeStyle = GOLD_BRIGHT;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Chấm mốc hàng quân xem trước dọc theo đường kéo
    const previewDots = clamp(Math.round(dragPreview.width / 16), 4, 28);
    for (let d = 0; d < previewDots; d++) {
      const t = previewDots > 1 ? d / (previewDots - 1) : 0.5;
      const gx = dragPreview.startWx + (dragPreview.endWx - dragPreview.startWx) * t;
      const gy = dragPreview.startWy + (dragPreview.endWy - dragPreview.startWy) * t;
      const gs = worldToScreen(gx, gy, cam);
      ctx.beginPath();
      ctx.arc(gs.sx, gs.sy, 3.0, 0, TAU);
      ctx.fillStyle = GOLD_BRIGHT;
      ctx.fill();
      ctx.strokeStyle = INK_DARK;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Mũi tên hướng mặt đội hình mới
    ctx.beginPath();
    ctx.moveTo(sCenter.sx, sCenter.sy);
    ctx.lineTo(sTip.sx, sTip.sy);
    ctx.strokeStyle = GOLD_BRIGHT;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    const tipAng = Math.atan2(sTip.sy - sCenter.sy, sTip.sx - sCenter.sx);
    ctx.translate(sTip.sx, sTip.sy);
    ctx.rotate(tipAng);
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(-9, -5.5);
    ctx.lineTo(-6.5, 0);
    ctx.lineTo(-9, 5.5);
    ctx.closePath();
    ctx.fillStyle = GOLD_BRIGHT;
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================================
// 7. VÕ ĐÀI ĐẤU TƯỚNG 1V1 (ROMANCE GENERAL DUEL ARENA)
// ============================================================================

/**
 * Vẽ vòng tròn võ đài Đấu Tướng (`duel_ring.png`) xoay chậm dưới mặt đất 2.5D tại `(duel.x, duel.y)`.
 */
export function renderTwDuelArenasGround(
  ctx: CanvasRenderingContext2D,
  duels: ReadonlyArray<TwDuelFrame> | undefined,
  cam: TwCamera,
  timeSec: number,
): void {
  if (!duels || duels.length === 0) return;
  const ringImg = getTwProjectileImg('duel_ring');

  for (let i = 0; i < duels.length; i++) {
    const duel = duels[i];
    const { sx, sy } = worldToScreen(duel.x, duel.y, cam);
    const radiusPx = Math.max(28, 82 * cam.zoom);

    if (
      sx + radiusPx < -40 ||
      sx - radiusPx > cam.viewW + 40 ||
      sy + radiusPx < -40 ||
      sy - radiusPx > cam.viewH + 40
    ) {
      continue;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, TW_ISO_TILT);

    // Ánh hào quang hoàng kim - chu sa lan tỏa dưới chân hai dũng tướng
    const pulse = 0.85 + 0.15 * Math.sin(timeSec * 4.2 + duel.id);
    const glow = ctx.createRadialGradient(
      0,
      0,
      radiusPx * 0.18,
      0,
      0,
      radiusPx * 1.12,
    );
    glow.addColorStop(0, `rgba(255, 212, 59, ${0.22 * pulse})`);
    glow.addColorStop(0.65, `rgba(212, 175, 55, ${0.14 * pulse})`);
    glow.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radiusPx * 1.12, 0, TAU);
    ctx.fill();

    // Xoay chậm ấn chú Quyết Đấu trên mặt phẳng chiến trường
    ctx.rotate(timeSec * 0.42 + duel.id * 0.9);
    if (isImgReady(ringImg)) {
      const drawD = radiusPx * 2.05;
      ctx.globalAlpha = 0.94;
      ctx.drawImage(ringImg, -drawD * 0.5, -drawD * 0.5, drawD, drawD);
    } else {
      ctx.strokeStyle = GOLD_TRIM;
      ctx.lineWidth = Math.max(2, 3.5 * cam.zoom);
      ctx.beginPath();
      ctx.arc(0, 0, radiusPx * 0.92, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([10, 6]);
      ctx.strokeStyle = GOLD_BRIGHT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, radiusPx * 0.78, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

interface DuelClashBurstTrack {
  prevPhase: number;
  burstAt: number;
  seenAt: number;
}

const duelClashBursts = new Map<number, DuelClashBurstTrack>();

function drawDuelGeneralStanceEffect(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  tx: number,
  ty: number,
  stance: TwDuelStance | undefined,
  cam: TwCamera,
  timeSec: number,
  seedId: number,
  tagSide: -1 | 1,
): void {
  if (!stance || stance === 'balanced') return;

  const gs = worldToScreen(gx, gy, cam);
  const zoomScale = clamp(cam.zoom, 0.55, 1.45);
  const bodyY = gs.sy - 16 * cam.zoom;
  const aimAng = Math.atan2((ty - gy) * TW_ISO_TILT, tx - gx);

  ctx.save();

  if (stance === 'press') {
    // ⚡ Cường Công: đường chém bán nguyệt đỏ thẫm - hoàng kim bùng nổ về phía đối thủ
    const swingOsc = Math.sin(timeSec * 12.5 + seedId * 1.9) * 0.28;
    const arcCenterAng = aimAng + swingOsc;
    const slashR = 23 * zoomScale;

    ctx.save();
    ctx.translate(gs.sx, bodyY);

    // Dải chém chu sa ngoài cùng
    ctx.beginPath();
    ctx.arc(0, 0, slashR, arcCenterAng - 1.05, arcCenterAng + 1.05);
    ctx.strokeStyle = 'rgba(224, 49, 49, 0.88)';
    ctx.lineWidth = 4.2 * zoomScale;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Lưỡi đao hoàng kim sắc lẹm bên trong
    ctx.beginPath();
    ctx.arc(0, 0, slashR * 0.88, arcCenterAng - 0.82, arcCenterAng + 0.82);
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 2.0 * zoomScale;
    ctx.stroke();

    // Tia chớp sát khí bắn ra theo mũi đao
    const tipX = Math.cos(arcCenterAng) * (slashR + 4 * zoomScale);
    const tipY = Math.sin(arcCenterAng) * (slashR + 4 * zoomScale);
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.6 * zoomScale, 0, TAU);
    ctx.fillStyle = '#fff9db';
    ctx.fill();
    ctx.restore();

    if (cam.zoom >= 0.48) {
      const label = '⚡ Cường Công';
      ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      const pw = tw + 10;
      const ph = 14;
      const px = gs.sx + tagSide * (24 * zoomScale) - pw * 0.5;
      const py = gs.sy + 8 * zoomScale;

      ctx.fillStyle = 'rgba(46, 10, 12, 0.88)';
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 107, 107, 0.88)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = '#ffd8a8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + pw * 0.5, py + ph * 0.5 + 0.5);
    }
  } else if (stance === 'guard') {
    // 🛡️ Thủ Kín: vòng kim chung hộ thể xoay kép quanh Võ Tướng
    const wardPulse = 0.86 + 0.14 * Math.sin(timeSec * 6.4 + seedId);
    const wardR = 20 * zoomScale * wardPulse;

    // Vòng trấn thủ dưới vó chiến mã
    ctx.save();
    ctx.translate(gs.sx, gs.sy);
    ctx.scale(1, TW_ISO_TILT);
    ctx.beginPath();
    ctx.arc(0, 0, 24 * zoomScale, 0, TAU);
    ctx.strokeStyle = 'rgba(252, 196, 25, 0.55)';
    ctx.lineWidth = 2.0;
    ctx.stroke();
    ctx.restore();

    // Hộ thuẫn ánh kim xoay quanh thân Võ Tướng
    ctx.save();
    ctx.translate(gs.sx, bodyY);
    const rot = timeSec * 2.2 + seedId;
    for (let seg = 0; seg < 3; seg++) {
      const a0 = rot + (seg * TAU) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, wardR, a0, a0 + 1.35);
      ctx.strokeStyle = seg % 2 === 0 ? 'rgba(255, 212, 59, 0.90)' : 'rgba(255, 249, 219, 0.82)';
      ctx.lineWidth = 2.4 * zoomScale;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.restore();

    if (cam.zoom >= 0.48) {
      const label = '🛡️ Thủ Kín';
      ctx.font = '700 9.5px system-ui, -apple-system, sans-serif';
      const tw = ctx.measureText(label).width;
      const pw = tw + 10;
      const ph = 14;
      const px = gs.sx + tagSide * (22 * zoomScale) - pw * 0.5;
      const py = gs.sy + 8 * zoomScale;

      ctx.fillStyle = 'rgba(32, 26, 10, 0.88)';
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(252, 196, 25, 0.88)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = '#fff3bf';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + pw * 0.5, py + ph * 0.5 + 0.5);
    }
  }

  ctx.restore();
}

/**
 * Vẽ tia lửa binh khí va chạm giữa hai Võ Tướng đang Quyết Đấu, chiêu thế `stanceA`/`stanceB`,
 * vòng sóng xung kích lan tỏa mỗi nhịp `clashPhase` và thanh máu đối kháng trên cao.
 */
export function renderTwDuelArenasSparks(
  ctx: CanvasRenderingContext2D,
  duels: ReadonlyArray<TwDuelFrame> | undefined,
  regiments: ReadonlyArray<TwRegimentFrame>,
  cam: TwCamera,
  timeSec: number,
): void {
  if (!duels || duels.length === 0) return;

  if (duelClashBursts.size > 24) {
    duelClashBursts.forEach((v, k) => {
      if (timeSec - v.seenAt > 8) duelClashBursts.delete(k);
    });
  }

  for (let i = 0; i < duels.length; i++) {
    const duel = duels[i];
    let regA: TwRegimentFrame | undefined;
    let regB: TwRegimentFrame | undefined;
    for (let r = 0; r < regiments.length; r++) {
      const reg = regiments[r];
      if (reg.id === duel.genARegId) regA = reg;
      else if (reg.id === duel.genBRegId) regB = reg;
    }

    const ax = regA ? regA.x : duel.x - 20;
    const ay = regA ? regA.y : duel.y;
    const bx = regB ? regB.x : duel.x + 20;
    const by = regB ? regB.y : duel.y;

    const midWx = (ax + bx) * 0.5;
    const midWy = (ay + by) * 0.5;
    const clashGround = worldToScreen(midWx, midWy, cam);
    const clashY = clashGround.sy - 18 * cam.zoom;

    if (
      clashGround.sx < -140 ||
      clashGround.sx > cam.viewW + 140 ||
      clashGround.sy < -140 ||
      clashGround.sy > cam.viewH + 140
    ) {
      continue;
    }

    const zoomScale = clamp(cam.zoom, 0.55, 1.45);
    const hasPressClash = duel.stanceA === 'press' || duel.stanceB === 'press';
    const bothPress = duel.stanceA === 'press' && duel.stanceB === 'press';

    // Theo dõi bước chuyển `clashPhase` để kích hoạt sóng xung kích lan rộng trên mặt đất & không trung
    let track = duelClashBursts.get(duel.id);
    if (!track) {
      track = {
        prevPhase: duel.clashPhase,
        burstAt: timeSec - 0.08,
        seenAt: timeSec,
      };
      duelClashBursts.set(duel.id, track);
    } else {
      track.seenAt = timeSec;
      if (track.prevPhase !== duel.clashPhase) {
        track.prevPhase = duel.clashPhase;
        track.burstAt = timeSec;
      }
    }

    // 0A. Vòng sóng xung kích mặt đất (Expanding Isometric Shockwave Rings) mỗi đợt `clashPhase`
    const burstAge = timeSec - track.burstAt;
    const shockPeriod = 0.85;
    const waveProg =
      burstAge >= 0 && burstAge <= shockPeriod
        ? burstAge / shockPeriod
        : ((timeSec * 1.35 + duel.clashPhase * 0.37) % 1);
    const waveAlpha = (1 - waveProg) * (hasPressClash ? 0.82 : 0.62);

    if (waveAlpha > 0.03) {
      const groundWaveR = (14 + waveProg * (bothPress ? 78 : hasPressClash ? 66 : 54)) * zoomScale;
      ctx.save();
      ctx.translate(clashGround.sx, clashGround.sy);
      ctx.scale(1, TW_ISO_TILT);

      ctx.beginPath();
      ctx.arc(0, 0, groundWaveR, 0, TAU);
      ctx.strokeStyle = hasPressClash
        ? `rgba(255, 120, 68, ${waveAlpha.toFixed(3)})`
        : `rgba(255, 224, 102, ${waveAlpha.toFixed(3)})`;
      ctx.lineWidth = (bothPress ? 3.2 : 2.3) * (1 - waveProg * 0.45);
      ctx.stroke();

      // Sóng gợn thứ cấp bám sát bên trong
      if (waveProg > 0.14) {
        const innerWaveR = groundWaveR * 0.68;
        ctx.beginPath();
        ctx.arc(0, 0, innerWaveR, 0, TAU);
        ctx.strokeStyle = `rgba(255, 243, 191, ${(waveAlpha * 0.65).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 0B. Hiệu ứng thế đánh riêng của từng Võ Tướng (`stanceA` & `stanceB`)
    const sideSignA: -1 | 1 = ax <= bx ? -1 : 1;
    drawDuelGeneralStanceEffect(
      ctx,
      ax,
      ay,
      bx,
      by,
      duel.stanceA,
      cam,
      timeSec,
      duel.id * 2 + 1,
      sideSignA,
    );
    drawDuelGeneralStanceEffect(
      ctx,
      bx,
      by,
      ax,
      ay,
      duel.stanceB,
      cam,
      timeSec,
      duel.id * 2 + 2,
      (sideSignA * -1) as -1 | 1,
    );

    // 1. Tia lửa hoàng kim / chu sa tóe ra tại điểm giao kích giữa hai chiến mã
    const phaseBeat = Math.abs(Math.sin(timeSec * 9.5 + duel.clashPhase * 1.9));
    const intensityBoost = bothPress ? 1.32 : hasPressClash ? 1.18 : 1.0;
    const burstScale = (0.72 + phaseBeat * 0.65) * zoomScale * intensityBoost;

    ctx.save();
    ctx.translate(clashGround.sx, clashY);

    // Vòng xung chấn ánh kim trên không trung mỗi nhịp giao đao
    if (phaseBeat > 0.5) {
      const waveR = (phaseBeat - 0.45) * 46 * burstScale;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, waveR), 0, TAU);
      ctx.strokeStyle = hasPressClash
        ? `rgba(255, 138, 76, ${((1 - (phaseBeat - 0.45) * 1.55) * 0.82).toFixed(3)})`
        : `rgba(255, 224, 102, ${((1 - (phaseBeat - 0.45) * 1.55) * 0.75).toFixed(3)})`;
      ctx.lineWidth = hasPressClash ? 2.4 : 2.0;
      ctx.stroke();
    }

    // Tia lửa kim thiết bắn tỏa 360 độ (tăng mật độ khi Cường Công)
    const sparkRays = hasPressClash ? 14 : 10;
    for (let s = 0; s < sparkRays; s++) {
      const ang =
        (s / sparkRays) * TAU +
        timeSec * 2.8 +
        detHash(duel.id, s, 91) * 0.5;
      const inner = 3 * burstScale;
      const outer = (10 + detHash(duel.id, s, 97) * 15 * phaseBeat) * burstScale;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
      ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer);
      ctx.strokeStyle =
        hasPressClash && s % 3 === 0
          ? '#ff6b6b'
          : s % 2 === 0
            ? '#fff3bf'
            : '#fcc419';
      ctx.lineWidth = s % 3 === 0 ? 2.2 : 1.35;
      ctx.stroke();
    }

    // Tâm lóe sáng trắng-vàng
    ctx.beginPath();
    ctx.arc(0, 0, 4.4 * burstScale, 0, TAU);
    ctx.fillStyle = '#fff9db';
    ctx.fill();
    ctx.restore();

    // 2. Ấn Quyết Đấu & Tia lửa giao kiếm lơ lửng phía trên võ đài (Overhead Clash Sparks)
    const arenaCenter = worldToScreen(duel.x, duel.y, cam);
    const overX = arenaCenter.sx;
    const overY = arenaCenter.sy - Math.max(54, 72 * cam.zoom);

    ctx.save();
    ctx.translate(overX, overY);

    // Tia chớp sao vàng phía sau biểu tượng song kích giao nhau
    const overPulse = 0.85 + 0.25 * Math.sin(timeSec * 11 + duel.id);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI + timeSec * 1.6;
      const r = (11 + (k % 2) * 5) * overPulse;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a) * r, -Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.strokeStyle = hasPressClash
        ? 'rgba(255, 146, 43, 0.72)'
        : 'rgba(255, 212, 59, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Huy hiệu tròn chạm khắc song kiếm giao phong + viền máu đối kháng A vs B
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fillStyle = INK_DARK;
    ctx.fill();
    ctx.strokeStyle = hasPressClash ? '#ff922b' : GOLD_TRIM;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    const hpFracA = clamp(duel.hpA / Math.max(1, duel.maxHpA), 0, 1);
    const hpFracB = clamp(duel.hpB / Math.max(1, duel.maxHpB), 0, 1);

    // Cung máu Tướng A (bên trái, ngọc bích/lam) & Tướng B (bên phải, chu sa)
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      15.5,
      Math.PI * 0.55,
      Math.PI * 0.55 + Math.PI * 0.9 * hpFracA,
    );
    ctx.strokeStyle = '#51cf66';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      15.5,
      Math.PI * 0.45 - Math.PI * 0.9 * hpFracB,
      Math.PI * 0.45,
    );
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Họa tiết song đao chéo ánh vàng chính giữa
    ctx.strokeStyle = '#fff3bf';
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.lineTo(6, -6);
    ctx.moveTo(6, 6);
    ctx.lineTo(-6, -6);
    ctx.stroke();

    // Ký hiệu thu gọn chiêu thức hai bên ngay cạnh Ấn Quyết Đấu trên cao
    if (duel.stanceA && duel.stanceA !== 'balanced') {
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(duel.stanceA === 'press' ? '⚡' : '🛡️', -23, 0);
    }
    if (duel.stanceB && duel.stanceB !== 'balanced') {
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(duel.stanceB === 'press' ? '⚡' : '🛡️', 23, 0);
    }
    ctx.restore();
  }
}

// ============================================================================
// 8. DỰNG HÌNH ĐỘI HÌNH BINH SĨ & CHẤM CHIẾN THUẬT MẶT ĐẤT
// ============================================================================

function drawFallbackUnitSilhouette(
  ctx: CanvasRenderingContext2D,
  item: SoldierDrawItem,
  flipX: boolean,
): void {
  const s = item.drawSize;
  const ownerColor = TW_COLORS[item.ownerIdx % TW_COLORS.length] ?? '#2b6cb0';
  ctx.save();
  ctx.translate(item.sx, item.sy);
  if (flipX) ctx.scale(-1, 1);

  if (item.category === 'artillery') {
    ctx.fillStyle = '#5c3c1e';
    ctx.fillRect(-s * 0.34, -s * 0.14, s * 0.68, s * 0.24);
    ctx.strokeStyle = GOLD_TRIM;
    ctx.lineWidth = Math.max(1.2, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(-s * 0.1, -s * 0.12);
    ctx.lineTo(s * 0.26, -s * 0.42);
    ctx.stroke();
  } else if (
    item.isGeneral ||
    item.category === 'cavalry_shock' ||
    item.category === 'cavalry_melee'
  ) {
    // Thân chiến mã + kỵ sĩ
    ctx.fillStyle = item.isGeneral ? '#7c2d12' : '#5c3d2e';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.08, s * 0.26, s * 0.14, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ownerColor;
    ctx.beginPath();
    ctx.arc(-s * 0.03, -s * 0.10, s * 0.11, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = Math.max(1.2, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, -s * 0.08);
    ctx.lineTo(s * 0.34, -s * 0.16);
    ctx.stroke();
  } else {
    // Bộ binh / Cung nỏ
    ctx.fillStyle = ownerColor;
    ctx.beginPath();
    ctx.arc(0, -s * 0.02, s * 0.16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1cfa0';
    ctx.beginPath();
    ctx.arc(0, -s * 0.20, s * 0.10, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.02);
    ctx.lineTo(s * 0.28, -s * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Vẽ toàn bộ binh sĩ từng người trong đội hình trung đoàn cùng chấm chiến thuật mặt đất:
 * - Luôn vẽ ĐỦ 100% quân số `men` (`1..150`) bằng chấm ngọc bích viền trắng (`#40c057` + `#ffffff`)
 *   cho quân ta/đồng minh và chấm đỏ chu sa (`#e03131`) cho quân địch.
 * - Khi `cam.zoom >= 0.45`, vẽ từng binh sĩ hoạt ảnh riêng biệt (tự động lấy mẫu đều 60 sprite/trung đoàn
 *   nếu tổng lính trong khung hình vượt 1.800 để bảo đảm tốc độ khung hình mượt 60 FPS).
 */
export function renderTwRegimentSoldiers(
  ctx: CanvasRenderingContext2D,
  opts: TwRenderUnitsOptions,
): void {
  preloadTwAssets();

  const {
    cam,
    regiments,
    sides,
    myIdx,
    myTeam,
    selectedRegIds,
    hoveredRegId,
    revealHiddenEnemies,
  } = opts;
  const timeSec = resolveTimeSec(opts.timeSec);
  const showTacticalDots = opts.showTacticalDots ?? true;
  const viewerTeam = resolveViewerTeam(myIdx, sides, myTeam);
  const reveal = Boolean(revealHiddenEnemies);

  // Lớp 0: Cập nhật & dựng Tàn Tích Chiến Trường Vĩnh Viễn (Zero-GC Ring Buffer 420),
  // Thảm Than Hồng Hỏa Công & Bẫy Dầu / Chông Sắt trên mặt cỏ (lọc khung nhìn < 0.3ms/frame)
  updateBattleRemnants(regiments, opts.projectiles, timeSec, opts.tick);
  renderBattleRemnantsGround(ctx, cam, timeSec);
  renderWildfiresGroundBed(ctx, opts.fires, cam, timeSec);
  renderGroundDeployables(
    ctx,
    opts.deployables,
    cam,
    myIdx,
    viewerTeam,
    reveal,
    timeSec,
  );

  // Bảng tra nhanh phục vụ vẽ đường công kích tới mục tiêu
  const regById = new Map<number, TwRegimentFrame>();
  const visibleRegs: TwRegimentFrame[] = [];
  let totalVisibleSoldiers = 0;

  const cullMarginPx = 150;

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    regById.set(reg.id, reg);

    if (
      !isTwRegimentVisibleToViewer(
        reg,
        myIdx,
        sides,
        revealHiddenEnemies,
        myTeam,
      )
    ) {
      continue;
    }

    const centerScreen = worldToScreen(reg.x, reg.y, cam);
    const boundPx =
      Math.max(48, Math.hypot(reg.width, reg.depth) * 0.65 * cam.zoom) +
      cullMarginPx;

    if (
      centerScreen.sx + boundPx < 0 ||
      centerScreen.sx - boundPx > cam.viewW ||
      centerScreen.sy + boundPx < 0 ||
      centerScreen.sy - boundPx > cam.viewH
    ) {
      continue;
    }

    visibleRegs.push(reg);
    totalVisibleSoldiers += clamp(Math.round(reg.men || 0), 0, 180);
  }

  // Sắp xếp trung đoàn theo trục Y mặt đất tăng dần cho các lớp vẽ nền dưới chân
  visibleRegs.sort((a, b) => a.y - b.y || a.id - b.id);

  // Lớp 1: Đường lệnh hành quân / công kích & vệt kéo chuột phải
  if (opts.showOrderLines !== false || opts.dragPreview) {
    drawTacticalOrderLines(ctx, opts, regById, timeSec);
  }

  // Lớp 2: Khung đội hình mặt đất & vòng hào quang Ngũ Hành
  for (let i = 0; i < visibleRegs.length; i++) {
    const reg = visibleRegs[i];
    const allied = isTwRegimentAllied(reg, myIdx, sides, myTeam);
    const selected = hasIdInCollection(selectedRegIds, reg.id);
    const hovered = hoveredRegId === reg.id;
    drawRegimentGroundFootprint(
      ctx,
      reg,
      cam,
      allied,
      selected,
      hovered,
      timeSec,
    );
  }

  // Lớp 3: Vẽ ĐẦY ĐỦ 100% chấm chiến thuật mặt đất (`1..150`) & gom danh sách sprite binh sĩ
  activeDrawList.length = 0;
  let poolCursor = 0;

  const fullSpriteZoom = cam.zoom >= TW_SOLDIER_SPRITE_ZOOM_MIN;
  const throttleSprites = totalVisibleSoldiers > MAX_UNTHROTTLED_VISIBLE_SOLDIERS;
  const baseDotRadius = clamp(2.25 * Math.pow(cam.zoom, 0.52), 1.55, 3.65);

  for (let i = 0; i < visibleRegs.length; i++) {
    const reg = visibleRegs[i];
    const slots = computeRegimentSoldierSlots(reg, timeSec);
    const slotCount = slots.length;
    if (slotCount === 0) continue;

    const allied = isTwRegimentAllied(reg, myIdx, sides, myTeam);
    const selected = hasIdInCollection(selectedRegIds, reg.id);
    const hovered = hoveredRegId === reg.id;
    const spec = TW_UNITS[reg.kind];
    const category: TwUnitCategory = spec?.category ?? 'infantry_polearm';

    // Độ mờ lấp lánh ẩn thân trong rừng thông (`alpha ≈ 0.72`)
    const stealthAlpha = reg.hidden
      ? 0.72 + 0.04 * Math.sin(timeSec * 3.4 + reg.id * 0.9)
      : 1.0;

    // 3A. Vẽ TẤT CẢ `men` chấm chiến thuật dưới chân từng người lính
    const dotR = reg.isGeneral ? baseDotRadius * 1.42 : baseDotRadius;
    const brightDots = selected || hovered || showTacticalDots;

    ctx.save();
    ctx.globalAlpha = stealthAlpha * (brightDots ? 0.96 : 0.80);

    if (allied) {
      ctx.fillStyle = selected ? ALLY_DOT_FILL_BRIGHT : ALLY_DOT_FILL;
      ctx.strokeStyle = ALLY_DOT_RIM;
      ctx.lineWidth = clamp(cam.zoom * 1.05, 0.85, 1.45);
      for (let s = 0; s < slotCount; s++) {
        const slot = slots[s];
        const { sx, sy } = worldToScreen(slot.wx, slot.wy, cam);
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = hovered ? ENEMY_DOT_FILL_BRIGHT : ENEMY_DOT_FILL;
      ctx.strokeStyle = hovered ? '#ffffff' : ENEMY_DOT_RIM;
      ctx.lineWidth = clamp(cam.zoom * 0.9, 0.75, 1.25);
      for (let s = 0; s < slotCount; s++) {
        const slot = slots[s];
        const { sx, sy } = worldToScreen(slot.wx, slot.wy, cam);
        ctx.beginPath();
        ctx.arc(sx, sy, dotR, 0, TAU);
        ctx.fill();
        if (brightDots) {
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 3B. Tuyển chọn các vị trí vẽ sprite hoạt ảnh (bảo toàn 60 FPS ở đại quân > 1.800 người)
    if (!fullSpriteZoom && !reg.isGeneral && cam.zoom < 0.36) {
      continue;
    }

    const sheetKey = resolveRegimentSheetKey(reg);
    const worldSpriteSize = resolveSpriteWorldSize(reg);
    const drawSize = clamp(
      worldSpriteSize * cam.zoom,
      reg.isGeneral ? 18 : 11,
      reg.isGeneral ? 96 : 84,
    );

    let maxSpritesForReg: number;
    if (!reg.isGeneral && reg.kind === 'trebuchet') {
      // Khẩu đội tối đa 4 cỗ máy bắn đá Uy Viễn (mỗi sprite đã gồm khung xe + pháo thủ)
      maxSpritesForReg = Math.min(slotCount, Math.max(1, Math.ceil(slotCount / 4)));
    } else if (!fullSpriteZoom) {
      maxSpritesForReg = reg.isGeneral
        ? slotCount
        : Math.min(slotCount, STRATEGIC_ZOOM_SAMPLE_SPRITES);
    } else if (throttleSprites && !reg.isGeneral) {
      maxSpritesForReg = Math.min(slotCount, CAPPED_SPRITES_PER_REGIMENT);
    } else {
      maxSpritesForReg = slotCount;
    }

    for (let k = 0; k < maxSpritesForReg; k++) {
      const slotIdx =
        maxSpritesForReg >= slotCount
          ? k
          : Math.min(slotCount - 1, Math.floor((k * slotCount) / maxSpritesForReg));
      const slot = slots[slotIdx];
      const ground = worldToScreen(slot.wx, slot.wy, cam);

      // Neo chân lính/móng ngựa đứng đúng trên tâm chấm chiến thuật mặt đất
      const footLift =
        category === 'artillery'
          ? drawSize * 0.24
          : reg.isGeneral ||
              category === 'cavalry_shock' ||
              category === 'cavalry_melee'
            ? drawSize * 0.25
            : drawSize * 0.28;

      const item = acquireDrawItem(poolCursor++);
      item.wx = slot.wx;
      item.wy = slot.wy;
      item.sx = ground.sx;
      item.sy = ground.sy - footLift;
      item.facing = slot.facing;
      item.phase = slot.phase;
      item.sheetKey = sheetKey;
      item.anim = reg.anim;
      item.drawSize = drawSize;
      item.alpha = stealthAlpha;
      item.regId = reg.id;
      item.ownerIdx = reg.ownerIdx;
      item.isGeneral = reg.isGeneral;
      item.category = category;
      item.allied = allied;
      item.selected = selected;
      activeDrawList.push(item);
    }
  }

  // Lớp 3C: Công sự Chông Gỗ Phản Kỵ (`拒馬` Cheval-de-Frise) phối cảnh 2.5D
  renderStakesDeployables(
    ctx,
    opts.deployables,
    cam,
    myIdx,
    viewerTeam,
    reveal,
    timeSec,
  );

  // Lớp 4: Sắp xếp độ sâu 2.5D (Painter's Algorithm theo wy tăng dần) & vẽ hoạt ảnh mượt
  activeDrawList.sort((a, b) => a.wy - b.wy || a.wx - b.wx);

  let prevAlpha = 1;
  ctx.save();
  for (let i = 0; i < activeDrawList.length; i++) {
    const item = activeDrawList[i];
    if (Math.abs(item.alpha - prevAlpha) > 0.005) {
      ctx.globalAlpha = item.alpha;
      prevAlpha = item.alpha;
    }

    const fps = ANIM_FPS[item.anim] ?? 3.0;
    const frameIdx =
      item.anim === 'dead'
        ? 3
        : Math.floor(timeSec * fps + item.phase * 4.0) % 4;
    const flipX = shouldFlipSpriteX(item.facing, item.regId);

    // Ánh hào quang nhẹ dưới chân Võ Tướng để tách biệt giữa biển bộ binh
    if (item.isGeneral) {
      ctx.save();
      ctx.globalAlpha = item.alpha * (item.selected ? 0.52 : 0.30);
      ctx.beginPath();
      ctx.ellipse(
        item.sx,
        item.sy + item.drawSize * 0.24,
        item.drawSize * 0.30,
        item.drawSize * 0.30 * TW_ISO_TILT,
        0,
        0,
        TAU,
      );
      ctx.strokeStyle = GOLD_BRIGHT;
      ctx.lineWidth = item.selected ? 2.0 : 1.3;
      ctx.stroke();
      ctx.restore();
    }

    const drawn = drawTwAnimatedSprite(
      ctx,
      item.sheetKey,
      item.anim,
      frameIdx,
      item.sx,
      item.sy,
      item.drawSize,
      flipX,
    );
    if (!drawn) {
      drawFallbackUnitSilhouette(ctx, item, flipX);
    }
  }
  ctx.restore();

  // Lớp 5: Biển Lửa Hỏa Công đa tầng, Lưỡi lửa bén trên đội hình `burning` & Cột khói đen dạt theo gió `windAngle`
  renderWildfiresFlamesAndSmoke(
    ctx,
    opts.fires,
    visibleRegs,
    cam,
    opts.windAngle,
    opts.windStrength,
    timeSec,
  );
}

// ============================================================================
// 9. MƯA TÊN CẦU VỒNG & ĐÁ LỬA PHÁO ĐÁ UY VIỄN (2.5D PARABOLIC VOLLEYS)
// ============================================================================

/**
 * Vẽ từng loạt tên cung / hỏa tiễn / nỏ sắt (chùm 10–14 mũi tên so le tạo bão tên Total War)
 * và tảng đá lửa kéo vệt khói đen của Pháo Đá Uy Viễn theo quỹ đạo parabol 2.5D
 * `h = 4 * arcHeight * p * (1 - p)` kèm bóng đổ trên mặt đất!
 */
export function renderTwProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: ReadonlyArray<TwProjectileFrame> | undefined,
  cam: TwCamera,
  timeSec: number,
): void {
  if (!projectiles || projectiles.length === 0) return;

  // Khắc dấu hố bom đá lửa cháy đen & mũi tên cắm phập khi loạt đạn chạm đích (`progress >= 0.92`)
  ingestProjectilesForRemnants(projectiles, resolveTimeSec(timeSec));

  for (let i = 0; i < projectiles.length; i++) {
    const proj = projectiles[i];
    const p = clamp(proj.progress, 0, 1);
    if (p <= 0 || p >= 1) continue;

    const dx = proj.x1 - proj.x0;
    const dy = proj.y1 - proj.y0;
    const worldDist = Math.max(1, Math.hypot(dx, dy));
    // Véc-tơ pháp tuyến ngang mặt đất để rải rộng loạt tên theo bề ngang trung đoàn xạ thủ
    const nx = -dy / worldDist;
    const ny = dx / worldDist;
    const ux = dx / worldDist;
    const uy = dy / worldDist;

    if (proj.kind === 'boulder') {
      // ---------- ĐÁ LỬA CÔNG THÀNH UY VIỄN + VỆT KHÓI ĐEN ----------
      const arcHeight = clamp(worldDist * 0.34, 88, 240);
      const gWx = proj.x0 + dx * p;
      const gWy = proj.y0 + dy * p;
      const ground = worldToScreen(gWx, gWy, cam);
      const hWorld = 4 * arcHeight * p * (1 - p);
      const airSy = ground.sy - hWorld * cam.zoom;

      if (
        ground.sx < -140 ||
        ground.sx > cam.viewW + 140 ||
        airSy > cam.viewH + 140 ||
        ground.sy < -140
      ) {
        continue;
      }

      // Bóng đổ elip dưới đất (đậm và thu gọn khi đá sắp chạm đất)
      const altitudeFrac = clamp(hWorld / Math.max(1, arcHeight), 0, 1);
      const shadowR = (9 + altitudeFrac * 6) * cam.zoom;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        ground.sx,
        ground.sy,
        Math.max(2.5, shadowR),
        Math.max(1.8, shadowR * TW_ISO_TILT),
        0,
        0,
        TAU,
      );
      ctx.fillStyle = `rgba(10, 10, 12, ${0.42 - altitudeFrac * 0.22})`;
      ctx.fill();

      // Dải khói đen & tàn lửa uốn theo quỹ đạo parabol phía sau tảng đá
      const smokeSteps = 9;
      for (let s = smokeSteps; s >= 1; s--) {
        const sp = p - s * 0.022;
        if (sp <= 0) continue;
        const sxW = proj.x0 + dx * sp;
        const syW = proj.y0 + dy * sp;
        const sg = worldToScreen(sxW, syW, cam);
        const sh = 4 * arcHeight * sp * (1 - sp);
        const puffX =
          sg.sx + Math.sin(timeSec * 6 + s * 1.4 + proj.id) * 2.5 * cam.zoom;
        const puffY = sg.sy - sh * cam.zoom;
        const fade = 1 - s / (smokeSteps + 1);
        const puffR = Math.max(2, (5 + (smokeSteps - s) * 0.9) * cam.zoom);

        ctx.beginPath();
        ctx.arc(puffX, puffY, puffR, 0, TAU);
        ctx.fillStyle =
          s <= 3
            ? `rgba(255, 136, 36, ${0.38 * fade})`
            : `rgba(42, 38, 36, ${0.32 * fade})`;
        ctx.fill();
      }

      // Quầng lửa bọc quanh tảng đá xoay trên không
      const boulderSize = clamp(24 * cam.zoom, 11, 42);
      const fireGlow = ctx.createRadialGradient(
        ground.sx,
        airSy,
        boulderSize * 0.12,
        ground.sx,
        airSy,
        boulderSize * 0.82,
      );
      fireGlow.addColorStop(0, 'rgba(255, 244, 180, 0.95)');
      fireGlow.addColorStop(0.45, 'rgba(255, 122, 24, 0.72)');
      fireGlow.addColorStop(1, 'rgba(224, 49, 49, 0)');
      ctx.fillStyle = fireGlow;
      ctx.beginPath();
      ctx.arc(ground.sx, airSy, boulderSize * 0.82, 0, TAU);
      ctx.fill();

      const boulderImg = getTwProjectileImg('boulder');
      ctx.translate(ground.sx, airSy);
      ctx.rotate(timeSec * 7.5 + proj.id);
      if (isImgReady(boulderImg)) {
        ctx.drawImage(
          boulderImg,
          -boulderSize * 0.5,
          -boulderSize * 0.5,
          boulderSize,
          boulderSize,
        );
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, boulderSize * 0.36, 0, TAU);
        ctx.fillStyle = '#495057';
        ctx.fill();
        ctx.strokeStyle = '#ff922b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    // ---------- CHÙM MƯA TÊN / HỎA TIỄN / NỎ SẮT (10–14 MŨI TÊN SO LE) ----------
    const arcHeight =
      proj.kind === 'bolt'
        ? clamp(worldDist * 0.11, 20, 72)
        : proj.kind === 'fire_arrow'
          ? clamp(worldDist * 0.26, 48, 165)
          : clamp(worldDist * 0.24, 42, 150);

    const arrowCount = 10 + (proj.id % 5); // 10..14 mũi tên mỗi loạt bắn
    const arrowImg = getTwProjectileImg(proj.kind);
    const groundAngle = Math.atan2(dy * TW_ISO_TILT, dx);
    const isFire = proj.kind === 'fire_arrow';
    const isBolt = proj.kind === 'bolt';
    const drawW = clamp((isFire ? 23 : isBolt ? 17 : 20) * cam.zoom, 9, 34);
    const drawH = drawW * 0.36;

    ctx.save();
    for (let k = 0; k < arrowCount; k++) {
      const hLat = detHash(proj.id, k, 53) - 0.5;
      const hFwd = detHash(proj.id, k, 67) - 0.5;
      const hProg = (detHash(proj.id, k, 79) - 0.5) * 0.11;

      const pk = clamp(p + hProg, 0.005, 0.995);
      const latWorld = hLat * 46;
      const fwdWorld = hFwd * 18;

      const x0k = proj.x0 + nx * latWorld + ux * fwdWorld;
      const y0k = proj.y0 + ny * latWorld + uy * fwdWorld;
      const x1k = proj.x1 + nx * (latWorld * 0.72) + ux * (fwdWorld * 0.6);
      const y1k = proj.y1 + ny * (latWorld * 0.72) + uy * (fwdWorld * 0.6);

      const dxk = x1k - x0k;
      const dyk = y1k - y0k;
      const gWx = x0k + dxk * pk;
      const gWy = y0k + dyk * pk;
      const ground = worldToScreen(gWx, gWy, cam);
      const hWorld = 4 * arcHeight * pk * (1 - pk);
      const airSx = ground.sx;
      const airSy = ground.sy - hWorld * cam.zoom;

      if (
        airSx < -40 ||
        airSx > cam.viewW + 40 ||
        airSy < -60 ||
        ground.sy > cam.viewH + 60
      ) {
        continue;
      }

      // 1. Bóng mũi tên lướt dưới mặt đất
      const shadowLen = Math.max(4, 10 * cam.zoom);
      ctx.strokeStyle = 'rgba(12, 14, 16, 0.22)';
      ctx.lineWidth = Math.max(1, 1.3 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(
        ground.sx - Math.cos(groundAngle) * shadowLen * 0.5,
        ground.sy - Math.sin(groundAngle) * shadowLen * 0.5,
      );
      ctx.lineTo(
        ground.sx + Math.cos(groundAngle) * shadowLen * 0.5,
        ground.sy + Math.sin(groundAngle) * shadowLen * 0.5,
      );
      ctx.stroke();

      // 2. Góc tiếp tuyến tức thời của đường bay parabol 2.5D
      const vxScreen = dxk * cam.zoom;
      const vyScreen =
        dyk * cam.zoom * TW_ISO_TILT -
        4 * arcHeight * (1 - 2 * pk) * cam.zoom;
      const flightAngle = Math.atan2(vyScreen, vxScreen);

      // 3. Vệt gió trắng ngà hoặc vệt lửa cam rực phía đuôi tên
      const tailLen = drawW * (isFire ? 1.35 : 1.05);
      ctx.strokeStyle = isFire
        ? 'rgba(255, 146, 43, 0.58)'
        : isBolt
          ? 'rgba(222, 226, 230, 0.42)'
          : 'rgba(255, 248, 225, 0.36)';
      ctx.lineWidth = Math.max(1, (isFire ? 2.1 : 1.2) * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(airSx, airSy);
      ctx.lineTo(
        airSx - Math.cos(flightAngle) * tailLen,
        airSy - Math.sin(flightAngle) * tailLen,
      );
      ctx.stroke();

      // 4. Thân mũi tên / hỏa tiễn xoay đúng hướng cắm xuống mục tiêu
      ctx.save();
      ctx.translate(airSx, airSy);
      ctx.rotate(flightAngle);
      if (isImgReady(arrowImg)) {
        ctx.drawImage(arrowImg, -drawW * 0.55, -drawH * 0.5, drawW, drawH);
      } else {
        ctx.strokeStyle = isFire ? '#ff922b' : '#f1f3f5';
        ctx.lineWidth = Math.max(1.2, 1.8 * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(-drawW * 0.5, 0);
        ctx.lineTo(drawW * 0.45, 0);
        ctx.stroke();
        if (isFire) {
          ctx.fillStyle = '#ffd43b';
          ctx.beginPath();
          ctx.arc(drawW * 0.42, 0, Math.max(1.6, 2.4 * cam.zoom), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

// ============================================================================
// 10. HUY HIỆU DANH TƯỚNG 42×42 & BIỂU TƯỢNG BINH CHỦNG 26×26 LƠ LỬNG TRÊN ĐẦU
// ============================================================================

function computeOverheadAnchor(
  reg: TwRegimentFrame,
  cam: TwCamera,
): { sx: number; sy: number; groundSx: number; groundSy: number } {
  const ground = worldToScreen(reg.x, reg.y, cam);
  // Mốc chuẩn `sy - 28` khi zoom chuẩn, nâng thêm nhẹ khi phóng đại gần để không che mũ lông trĩ Võ Tướng
  const zoomLift = Math.max(0, (cam.zoom - 0.55) * (reg.isGeneral ? 26 : 18));
  const baseLift = reg.isGeneral ? 34 : 28;
  return {
    sx: ground.sx,
    sy: ground.sy - baseLift - zoomLift,
    groundSx: ground.sx,
    groundSy: ground.sy,
  };
}

function drawWavingRoutFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeSec: number,
  regId: number,
): void {
  const flash = 0.55 + 0.45 * Math.abs(Math.sin(timeSec * 8.5 + regId));
  const wave = Math.sin(timeSec * 12 + regId * 1.7) * 1.8;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = flash;

  // Cán cờ nhỏ viền mực
  ctx.strokeStyle = '#212529';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-4, 6);
  ctx.lineTo(-4, -7);
  ctx.stroke();

  ctx.strokeStyle = '#f8f9fa';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-4, 6);
  ctx.lineTo(-4, -7);
  ctx.stroke();

  // Lá cờ trắng phấp phới báo hiệu quân vỡ trận tháo chạy (Routing)
  ctx.beginPath();
  ctx.moveTo(-3.5, -7);
  ctx.quadraticCurveTo(2, -8 + wave, 7.5, -5.5 + wave * 0.7);
  ctx.lineTo(6.5, -0.5 + wave * 0.5);
  ctx.quadraticCurveTo(1.5, -2 + wave, -3.5, -1);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 22, 26, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawHiddenStealthEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, TAU);
  ctx.fillStyle = 'rgba(14, 24, 18, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#69db7c';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Hình con mắt ẩn phục binh rừng sâu
  ctx.beginPath();
  ctx.moveTo(-4.6, 0);
  ctx.quadraticCurveTo(0, -3.6, 4.6, 0);
  ctx.quadraticCurveTo(0, 3.6, -4.6, 0);
  ctx.strokeStyle = '#d3f9d8';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, TAU);
  ctx.fillStyle = '#69db7c';
  ctx.fill();

  // Gạch chéo mảnh báo trạng thái tàng hình trước địch
  ctx.beginPath();
  ctx.moveTo(-3.8, 3.6);
  ctx.lineTo(3.8, -3.6);
  ctx.strokeStyle = '#ffd43b';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
}

function drawCategoryFallbackGlyph(
  ctx: CanvasRenderingContext2D,
  category: TwUnitCategory,
): void {
  ctx.save();
  ctx.strokeStyle = '#fff3bf';
  ctx.fillStyle = '#fff3bf';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';

  switch (category) {
    case 'infantry_polearm':
      ctx.beginPath();
      ctx.moveTo(-5, 5);
      ctx.lineTo(5, -5);
      ctx.moveTo(2, -5);
      ctx.lineTo(5.5, -5.5);
      ctx.lineTo(5, -2);
      ctx.stroke();
      break;
    case 'infantry_sword':
      ctx.beginPath();
      ctx.moveTo(-4.5, 4.5);
      ctx.lineTo(4.5, -4.5);
      ctx.moveTo(-3, 0.5);
      ctx.lineTo(0.5, 3);
      ctx.stroke();
      break;
    case 'ranged_bow':
      ctx.beginPath();
      ctx.arc(-1, 0, 5.2, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.moveTo(-4, 0);
      ctx.lineTo(5.5, 0);
      ctx.stroke();
      break;
    case 'ranged_crossbow':
      ctx.beginPath();
      ctx.moveTo(-5, 3);
      ctx.lineTo(4.5, -3);
      ctx.moveTo(-2, -4.5);
      ctx.lineTo(3.5, 3.5);
      ctx.stroke();
      break;
    case 'artillery':
      ctx.beginPath();
      ctx.arc(0, 1.5, 3.8, 0, TAU);
      ctx.moveTo(-5, 5);
      ctx.lineTo(5, -4);
      ctx.stroke();
      break;
    case 'cavalry_shock':
    case 'cavalry_melee':
      ctx.beginPath();
      ctx.moveTo(-5, 4);
      ctx.lineTo(0, -5);
      ctx.lineTo(5, 4);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/**
 * Vẽ Quân Hàm Tinh Nhuệ (Veterancy Chevrons `‹`, `‹‹`, `‹‹‹`):
 * - Cấp 1–3: Đồng Cổ (`Bronze`)
 * - Cấp 4–6: Bạch Ngân (`Silver`)
 * - Cấp 7–9: Hoàng Kim (`Gold`)
 */
function drawVeterancyChevronsBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rawRank: number | undefined,
  isGeneral: boolean,
): void {
  const rank = clamp(Math.floor(rawRank ?? 0), 0, TW_MAX_VETERANCY_RANK);
  if (rank <= 0) return;

  const chevronCount = ((rank - 1) % 3) + 1; // 1..3 vạch chữ V ngang (`‹`, `‹‹`, `‹‹‹`)
  const isGold = rank >= 7;
  const isSilver = rank >= 4 && rank < 7;

  const mainStroke = isGold ? '#fcc419' : isSilver ? '#dee2e6' : '#d9822b';
  const brightStroke = isGold ? '#fff9db' : isSilver ? '#ffffff' : '#ffd8a8';
  const borderTrim = isGold ? '#ffd43b' : isSilver ? '#adb5bd' : '#a8621e';

  const sc = isGeneral ? 1.05 : 0.92;
  const tabW = (9.5 + (chevronCount - 1) * 3.8) * sc;
  const tabH = 11.4 * sc;

  ctx.save();
  ctx.translate(x, y);

  // Thẻ sơn mài đen viền kim loại Đồng / Bạc / Vàng
  ctx.fillStyle = 'rgba(10, 12, 15, 0.92)';
  ctx.beginPath();
  ctx.roundRect(-tabW * 0.5, -tabH * 0.5, tabW, tabH, 3);
  ctx.fill();
  ctx.strokeStyle = borderTrim;
  ctx.lineWidth = 1.15;
  ctx.stroke();

  // Vẽ các mũi vạch Quân Hàm (`‹`, `‹‹`, `‹‹‹`) sắc nét
  const spacing = 3.6 * sc;
  const startX = -((chevronCount - 1) * spacing) * 0.5;
  const armDx = 1.9 * sc;
  const armDy = 3.1 * sc;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < chevronCount; i++) {
    const cx = startX + i * spacing;
    ctx.strokeStyle = mainStroke;
    ctx.lineWidth = 1.9 * sc;
    ctx.beginPath();
    ctx.moveTo(cx + armDx, -armDy);
    ctx.lineTo(cx - armDx * 0.85, 0);
    ctx.lineTo(cx + armDx, armDy);
    ctx.stroke();

    ctx.strokeStyle = brightStroke;
    ctx.lineWidth = 0.85 * sc;
    ctx.beginPath();
    ctx.moveTo(cx + armDx * 0.85, -armDy * 0.85);
    ctx.lineTo(cx - armDx * 0.75, 0);
    ctx.lineTo(cx + armDx * 0.85, armDy * 0.85);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Vẽ Ấn Quan Hệ Kết Nghĩa (`Guanxi` — `'enraged'` Nộ Hỏa Báo Thù `🔥`/`義` hoặc `'harmony'` Đồng Tâm Hiệp Lực `義`).
 */
function drawGuanxiOverheadBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: 'enraged' | 'harmony' | 'neutral' | undefined,
  timeSec: number,
  regId: number,
  isGeneral: boolean,
): void {
  if (state !== 'enraged' && state !== 'harmony') return;

  const isEnraged = state === 'enraged';
  const sc = isGeneral ? 1.06 : 0.9;
  const r = 7.4 * sc;
  const pulse = 0.84 + 0.16 * Math.sin(timeSec * (isEnraged ? 9.5 : 4.2) + regId);

  ctx.save();
  ctx.translate(x, y);

  if (isEnraged) {
    // Vòng nộ hỏa đỏ rực + 3 lưỡi lửa bốc cháy phía trên ấn chữ `義`
    ctx.beginPath();
    ctx.arc(0, 0, (r + 3.2) * pulse, 0, TAU);
    ctx.fillStyle = 'rgba(224, 49, 49, 0.34)';
    ctx.fill();

    for (let f = -1; f <= 1; f++) {
      const sway = Math.sin(timeSec * 14 + regId + f * 1.8) * 1.2 * sc;
      const fx = f * 3.4 * sc;
      const fh = (f === 0 ? 7.2 : 5.2) * sc * pulse;
      ctx.fillStyle = f === 0 ? '#ffd43b' : '#ff6b35';
      ctx.beginPath();
      ctx.moveTo(fx - 2.3 * sc, -r * 0.65);
      ctx.quadraticCurveTo(fx + sway, -r - fh, fx + 2.3 * sc, -r * 0.65);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Quầng ngọc bích êm dịu của Kết Nghĩa Đào Viên (`harmony`)
    ctx.beginPath();
    ctx.arc(0, 0, (r + 2.2) * pulse, 0, TAU);
    ctx.fillStyle = 'rgba(64, 192, 87, 0.28)';
    ctx.fill();
  }

  // Đĩa ấn tròn sơn son (Nộ Hỏa) hoặc lục bảo (Đồng Tâm)
  const grad = ctx.createRadialGradient(0, -2 * sc, 1, 0, 0, r);
  if (isEnraged) {
    grad.addColorStop(0, '#ff6b6b');
    grad.addColorStop(0.65, '#c92a2a');
    grad.addColorStop(1, '#5c0f0f');
  } else {
    grad.addColorStop(0, '#51cf66');
    grad.addColorStop(0.68, '#2b8a3e');
    grad.addColorStop(1, '#133b1d');
  }

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = isEnraged ? '#ffd43b' : '#ffe066';
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Chữ Hán `義` (Nghĩa Khí) sắc nét chính tâm ấn
  ctx.fillStyle = '#fff9db';
  ctx.font = `700 ${Math.round(9.5 * sc)}px "Noto Serif SC", "Songti SC", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('義', 0, 0.5 * sc);

  ctx.restore();
}

/**
 * Vẽ Huy Hiệu Hỏa Tiễn (`reg.fireArrows`) — mũi tên bốc lửa rực sáng bên cạnh cờ hiệu cung nỏ / tướng.
 */
function drawFireArrowsBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeSec: number,
  regId: number,
  isGeneral: boolean,
): void {
  const sc = isGeneral ? 1.02 : 0.88;
  const r = 6.8 * sc;
  const flick = 0.86 + 0.14 * Math.sin(timeSec * 12.5 + regId * 1.4);

  ctx.save();
  ctx.translate(x, y);

  // Đĩa nền hổ phách đen viền lửa cam
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(22, 14, 10, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#ff922b';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Thân mũi tên chéo hướng lên góc phải
  ctx.strokeStyle = '#fff3bf';
  ctx.lineWidth = 1.45 * sc;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3.6 * sc, 3.6 * sc);
  ctx.lineTo(2.8 * sc, -2.8 * sc);
  ctx.stroke();

  // Đuôi lông vũ nhỏ
  ctx.strokeStyle = '#adb5bd';
  ctx.lineWidth = 1.0 * sc;
  ctx.beginPath();
  ctx.moveTo(-4.4 * sc, 2.6 * sc);
  ctx.lineTo(-2.6 * sc, 4.4 * sc);
  ctx.stroke();

  // Đầu mũi tên rực lửa hai tầng (Cam Đỏ + Lõi Hoàng Kim)
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.arc(2.6 * sc, -2.6 * sc, 2.9 * sc * flick, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.moveTo(4.5 * sc, -4.5 * sc);
  ctx.lineTo(0.8 * sc, -3.2 * sc);
  ctx.lineTo(3.2 * sc, -0.8 * sc);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawGeneralMedallion(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  sx: number,
  sy: number,
  groundSy: number,
  allied: boolean,
  selected: boolean,
  hovered: boolean,
  isSpeaking: boolean,
  cam: TwCamera,
  timeSec: number,
): void {
  const genId = reg.generalId ?? 'cao_cao';
  const genSpec = TW_GENERALS[genId] ?? TW_GENERALS.cao_cao;
  const clsSpec = TW_CLASSES[genSpec.class] ?? TW_CLASSES.commander;
  const factionSpec = TW_FACTIONS[genSpec.faction] ?? TW_FACTIONS.wei;

  // Đường kính chuẩn 42×42 px (`r = 21`)
  const r = 21;
  const hpFrac = clamp(reg.hp / Math.max(1, reg.maxHp), 0, 1);
  const moraleFrac = clamp(reg.morale / 100, 0, 1);
  const isRouting =
    reg.moraleState === 'routing' || reg.moraleState === 'shattered';

  ctx.save();
  ctx.translate(sx, sy);

  // Cán đại kỳ mảnh nối từ Võ Tướng lên Huy Hiệu Chân Dung
  const poleLen = Math.max(0, groundSy - sy - r - 8 * cam.zoom);
  if (poleLen > 4) {
    ctx.beginPath();
    ctx.moveTo(0, r + 3);
    ctx.lineTo(0, r + 3 + Math.min(26, poleLen));
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 1. Mũ Kim Quan & Đôi Lông Trĩ Hoàng Kim (Golden Pheasant Plumes) trên đỉnh huy hiệu
  const plumeSway = Math.sin(timeSec * 3.1 + reg.id) * 1.6;
  ctx.save();
  ctx.strokeStyle = GOLD_BRIGHT;
  ctx.lineWidth = 2.0;
  ctx.lineCap = 'round';
  // Lông trĩ trái
  ctx.beginPath();
  ctx.moveTo(-2, -r - 1);
  ctx.quadraticCurveTo(-11, -r - 12 + plumeSway * 0.5, -19, -r - 7 + plumeSway);
  ctx.stroke();
  // Lông trĩ phải
  ctx.beginPath();
  ctx.moveTo(2, -r - 1);
  ctx.quadraticCurveTo(11, -r - 12 - plumeSway * 0.5, 19, -r - 7 - plumeSway);
  ctx.stroke();

  // Đỉnh mão ngọc vàng chính giữa
  ctx.beginPath();
  ctx.moveTo(0, -r - 7);
  ctx.lineTo(4.5, -r - 1);
  ctx.lineTo(0, -r + 2);
  ctx.lineTo(-4.5, -r - 1);
  ctx.closePath();
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.fill();
  ctx.strokeStyle = INK_DARK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 2. Vòng sáng Chọn / Trỏ chuột + Hào quang Nộ Hỏa Quan Hệ (`guanxiState === 'enraged'`)
  if (reg.guanxiState === 'enraged') {
    const ragePulse = 0.55 + 0.35 * Math.sin(timeSec * 8.5 + reg.id);
    ctx.beginPath();
    ctx.arc(0, 0, r + 7.2, 0, TAU);
    ctx.strokeStyle = `rgba(255, 77, 79, ${ragePulse.toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  if (selected || hovered) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 5.5, 0, TAU);
    ctx.strokeStyle = selected
      ? allied
        ? ALLY_DOT_FILL_BRIGHT
        : GOLD_BRIGHT
      : 'rgba(255, 243, 191, 0.85)';
    ctx.lineWidth = selected ? 2.6 : 1.8;
    ctx.stroke();
  }

  // 3. Bóng đổ & Đĩa nền Huy Hiệu Chân Dung 42×42 px
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r + 2.5, 0, TAU);
  ctx.fillStyle = INK_DARK;
  ctx.fill();
  ctx.restore();

  // Nền lụa xanh ngọc (Đồng minh) hoặc đỏ thẫm (Địch) + Chân dung Danh Tướng 42×42 px
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();

  const bgGrad = ctx.createRadialGradient(0, -6, 3, 0, 0, r);
  if (allied) {
    bgGrad.addColorStop(0, '#2f9e44');
    bgGrad.addColorStop(1, '#14381f');
  } else {
    bgGrad.addColorStop(0, '#c92a2a');
    bgGrad.addColorStop(1, '#421010');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const tokenImg = getTwPortraitToken(genId);
  if (isImgReady(tokenImg)) {
    ctx.drawImage(tokenImg, -r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = '#fff3bf';
    ctx.font = '700 15px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(factionSpec.emblemText, 0, 1);
  }

  // Viền sắc cờ mỏng bên trong mặt kính huy hiệu để phân biệt Địch/Ta tức thì
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.2, 0, TAU);
  ctx.strokeStyle = allied
    ? 'rgba(81, 207, 102, 0.72)'
    : 'rgba(255, 107, 107, 0.78)';
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();

  // Viền đồng vàng chạm nổi (42×42 px rim)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = GOLD_TRIM;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // 4. Cung Tròn Sinh Lực (HP Arc ngoài) & Cung Tròn Sĩ Khí (Morale Arc trong/dưới)
  const startAngle = -Math.PI * 0.5;
  ctx.lineCap = 'round';

  // Rãnh nền cung HP
  ctx.beginPath();
  ctx.arc(0, 0, r + 2.6, 0, TAU);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.58)';
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // Cung HP hiện tại
  if (hpFrac > 0.005) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 2.6, startAngle, startAngle + TAU * hpFrac);
    ctx.strokeStyle =
      hpFrac < 0.28
        ? '#ff922b'
        : allied
          ? ALLY_DOT_FILL_BRIGHT
          : ENEMY_DOT_FILL_BRIGHT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  // Cung Sĩ Khí (Morale Arc ôm nửa dưới huy hiệu)
  const moraleSpan = Math.PI * 0.78;
  const moraleLeft = Math.PI * 0.5 + moraleSpan * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 2.6, moraleLeft - moraleSpan, moraleLeft);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 2.0;
  ctx.stroke();

  if (moraleFrac > 0.01) {
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      r - 2.6,
      moraleLeft - moraleSpan * moraleFrac,
      moraleLeft,
    );
    ctx.strokeStyle = isRouting
      ? '#ffffff'
      : reg.moraleState === 'wavering'
        ? '#ff922b'
        : '#ffd43b';
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }

  // 5. Ngọc Ngũ Hành (Wu Xing Element Dot) góc dưới-phải
  const wxAngle = Math.PI * 0.25;
  const elX = Math.cos(wxAngle) * (r + 1);
  const elY = Math.sin(wxAngle) * (r + 1);
  const elR = 6.8;

  ctx.beginPath();
  ctx.arc(elX, elY, elR + 1, 0, TAU);
  ctx.fillStyle = INK_DARK;
  ctx.fill();

  const elImg = getTwUiImg(`el_${genSpec.class}`);
  if (isImgReady(elImg)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(elX, elY, elR, 0, TAU);
    ctx.clip();
    ctx.drawImage(elImg, elX - elR, elY - elR, elR * 2, elR * 2);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(elX, elY, elR - 0.6, 0, TAU);
    ctx.fillStyle = clsSpec.color;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(elX, elY, elR, 0, TAU);
  ctx.strokeStyle = GOLD_BRIGHT;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // 6. Biểu tượng Trạng thái Hoạt động (Đấu Tướng / Đối Thoại / Xung Kích / Ẩn Thân / Vỡ Trận)
  const inCombatOrSkill =
    reg.anim === 'duel' ||
    reg.anim === 'attack' ||
    reg.anim === 'charge' ||
    Boolean(reg.activeBuff) ||
    isSpeaking;

  if (inCombatOrSkill) {
    const stX = r * 0.74;
    const stY = -r * 0.74;
    ctx.save();
    ctx.translate(stX, stY);
    ctx.beginPath();
    ctx.arc(0, 0, 7.0, 0, TAU);
    ctx.fillStyle = isSpeaking || reg.activeBuff ? '#1864ab' : '#7c1d1d';
    ctx.fill();
    ctx.strokeStyle = GOLD_BRIGHT;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (isSpeaking || reg.activeBuff) {
      // Biểu tượng Chiếu Thư / Hiệu Lệnh Tướng Quân
      ctx.fillStyle = '#fff3bf';
      ctx.beginPath();
      ctx.roundRect(-3.6, -2.8, 7.2, 4.8, 1.5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-1.2, 2.0);
      ctx.lineTo(-2.6, 4.2);
      ctx.lineTo(1.0, 2.0);
      ctx.closePath();
      ctx.fill();
    } else {
      // Biểu tượng Song Kiếm Giao Phong
      ctx.strokeStyle = '#fff3bf';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3.4, 3.4);
      ctx.lineTo(3.4, -3.4);
      ctx.moveTo(3.4, 3.4);
      ctx.lineTo(-3.4, -3.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (isRouting) {
    drawWavingRoutFlag(ctx, r + 6, -r + 4, timeSec, reg.id);
  }
  if (reg.hidden) {
    drawHiddenStealthEye(ctx, -r * 0.76, -r * 0.74);
  }

  // 7. Quân Hàm Tinh Nhuệ (Bronze / Silver / Gold Chevrons `‹`, `‹‹`, `‹‹‹`) góc dưới-trái
  if ((reg.rank ?? 0) > 0) {
    drawVeterancyChevronsBadge(ctx, -r * 0.8, r * 0.72, reg.rank, true);
  }

  // 8. Ấn Quan Hệ Kết Nghĩa (`🔥` / `義` Guanxi Enraged / Harmony) bên sườn trái
  if (reg.guanxiState === 'enraged' || reg.guanxiState === 'harmony') {
    drawGuanxiOverheadBadge(
      ctx,
      -(r + 7.5),
      -1.5,
      reg.guanxiState,
      timeSec,
      reg.id,
      true,
    );
  }

  // 9. Ký hiệu Hỏa Tiễn (`reg.fireArrows`) bên sườn phải
  if (reg.fireArrows) {
    drawFireArrowsBadge(ctx, r + 7.5, 1.5, timeSec, reg.id, true);
  }

  // Nhãn Danh Hiệu Võ Tướng gọn nét khi chọn, trỏ chuột hoặc phóng gần
  if (selected || hovered || cam.zoom >= 0.85) {
    const label = genSpec.vnName;
    ctx.font = '600 10.5px system-ui, -apple-system, sans-serif';
    const textW = ctx.measureText(label).width;
    const pillW = textW + 12;
    const pillH = 15;
    const pillY = r + 6;

    ctx.fillStyle = 'rgba(12, 14, 16, 0.86)';
    ctx.beginPath();
    ctx.roundRect(-pillW * 0.5, pillY, pillW, pillH, 4);
    ctx.fill();
    ctx.strokeStyle = allied
      ? 'rgba(81, 207, 102, 0.65)'
      : 'rgba(255, 107, 107, 0.65)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f8f3e6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, pillY + pillH * 0.5 + 0.5);
  }

  ctx.restore();
}

function drawRetinueCategoryBadge(
  ctx: CanvasRenderingContext2D,
  reg: TwRegimentFrame,
  sx: number,
  sy: number,
  allied: boolean,
  selected: boolean,
  hovered: boolean,
  timeSec: number,
): void {
  const spec = TW_UNITS[reg.kind];
  const category: TwUnitCategory = spec?.category ?? 'infantry_polearm';
  // Đường kính chuẩn 26×26 px (`r = 13`)
  const r = 13;
  const hpFrac = clamp(reg.hp / Math.max(1, reg.maxHp), 0, 1);
  const isRouting =
    reg.moraleState === 'routing' || reg.moraleState === 'shattered';

  ctx.save();
  ctx.translate(sx, sy);

  if (reg.guanxiState === 'enraged') {
    const ragePulse = 0.52 + 0.35 * Math.sin(timeSec * 8.5 + reg.id);
    ctx.beginPath();
    ctx.arc(0, 0, r + 5.6, 0, TAU);
    ctx.strokeStyle = `rgba(255, 77, 79, ${ragePulse.toFixed(3)})`;
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }

  if (selected || hovered) {
    const scale = selected ? 1.08 : 1.04;
    ctx.scale(scale, scale);

    ctx.beginPath();
    ctx.arc(0, 0, r + 4.2, 0, TAU);
    ctx.strokeStyle = selected
      ? allied
        ? '#8ce99a'
        : GOLD_BRIGHT
      : 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = selected ? 2.2 : 1.5;
    ctx.stroke();
  }

  // Nền bóng tối mảnh đỡ huy hiệu 26×26 px
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.8, 0, TAU);
  ctx.fillStyle = INK_DARK;
  ctx.fill();

  // Đĩa màu Xanh Ngọc (Đồng minh) hoặc Đỏ Chu Sa (Địch) 26×26 px
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();

  const discGrad = ctx.createRadialGradient(0, -4, 2, 0, 0, r);
  if (allied) {
    discGrad.addColorStop(0, '#51cf66');
    discGrad.addColorStop(0.65, '#2f9e44');
    discGrad.addColorStop(1, '#1b5e2a');
  } else {
    discGrad.addColorStop(0, '#ff6b6b');
    discGrad.addColorStop(0.65, '#e03131');
    discGrad.addColorStop(1, '#7a1616');
  }
  ctx.fillStyle = discGrad;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // Vẽ biểu tượng Binh Chủng (`cls_<category>.png`) hòa quyện trên nền Xanh/Đỏ
  const clsImg = getTwUiImg(`cls_${category}`);
  if (isImgReady(clsImg)) {
    ctx.globalAlpha = 0.82;
    ctx.drawImage(clsImg, -r, -r, r * 2, r * 2);
    // Lớp phủ nhuộm sắc Xanh/Đỏ nhẹ giữ nền chuẩn Total War mà vẫn nổi rõ vũ khí vàng
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = allied
      ? 'rgba(47, 158, 68, 0.34)'
      : 'rgba(224, 49, 49, 0.36)';
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  } else {
    drawCategoryFallbackGlyph(ctx, category);
  }
  ctx.restore();

  // Viền sắc phe trong + Vòng tròn HP mảnh ôm ngoài huy hiệu
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.strokeStyle = allied ? '#b2f2bb' : '#ffc9c9';
  ctx.lineWidth = 1.15;
  ctx.stroke();

  if (hpFrac > 0.005) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 1.8, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * hpFrac);
    ctx.strokeStyle =
      hpFrac < 0.28
        ? '#ffa94d'
        : allied
          ? ALLY_DOT_FILL_BRIGHT
          : ENEMY_DOT_FILL_BRIGHT;
    ctx.lineWidth = 2.1;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Cảnh báo sĩ khí lung lay (chấm cam nhỏ dưới đáy)
  if (reg.moraleState === 'wavering') {
    ctx.beginPath();
    ctx.arc(0, r + 1.5, 2.4, 0, TAU);
    ctx.fillStyle = '#ff922b';
    ctx.fill();
  }

  // Cờ trắng nhấp nháy khi quân tháo chạy vỡ trận (`moraleState === 'routing'`)
  if (isRouting) {
    drawWavingRoutFlag(ctx, r + 4, -r + 3, timeSec, reg.id);
  }

  // Con mắt xanh khi trung đoàn đang ẩn phục kích trong rừng thông (`hidden`)
  if (reg.hidden) {
    drawHiddenStealthEye(ctx, -r + 1, -r + 1);
  }

  // Quân Hàm Tinh Nhuệ (Bronze / Silver / Gold Chevrons `‹`, `‹‹`, `‹‹‹`) góc dưới-trái cờ hiệu
  if ((reg.rank ?? 0) > 0) {
    drawVeterancyChevronsBadge(ctx, -r * 0.84, r * 0.78, reg.rank, false);
  }

  // Ấn Quan Hệ Kết Nghĩa (`🔥` / `義` Guanxi Enraged / Harmony) đội trên đỉnh cờ hiệu
  if (reg.guanxiState === 'enraged' || reg.guanxiState === 'harmony') {
    drawGuanxiOverheadBadge(
      ctx,
      0,
      -(r + 6.8),
      reg.guanxiState,
      timeSec,
      reg.id,
      false,
    );
  }

  // Ký hiệu Hỏa Tiễn (`reg.fireArrows`) góc dưới-phải cờ hiệu cung nỏ
  if (reg.fireArrows) {
    drawFireArrowsBadge(ctx, r * 0.86, r * 0.74, timeSec, reg.id, false);
  }

  ctx.restore();
}

/**
 * Vẽ toàn bộ Huy Hiệu Chân Dung Danh Tướng (`42×42 px`) và Huy Hiệu Binh Chủng (`26×26 px`)
 * lơ lửng phía trên mỗi trung đoàn còn sống.
 */
export function renderTwOverheadBadges(
  ctx: CanvasRenderingContext2D,
  opts: TwRenderUnitsOptions,
): void {
  const {
    cam,
    regiments,
    sides,
    myIdx,
    myTeam,
    selectedRegIds,
    hoveredRegId,
    activeBanterGeneralIds,
    revealHiddenEnemies,
  } = opts;
  const timeSec = resolveTimeSec(opts.timeSec);

  // Sắp xếp để huy hiệu trung đoàn đang chọn / Võ Tướng luôn nổi lên trên cùng không bị che
  const badgeRegs: TwRegimentFrame[] = [];
  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (
      !isTwRegimentVisibleToViewer(
        reg,
        myIdx,
        sides,
        revealHiddenEnemies,
        myTeam,
      )
    ) {
      continue;
    }
    const anchor = computeOverheadAnchor(reg, cam);
    if (
      anchor.sx < -60 ||
      anchor.sx > cam.viewW + 60 ||
      anchor.sy < -60 ||
      anchor.groundSy > cam.viewH + 90
    ) {
      continue;
    }
    badgeRegs.push(reg);
  }

  badgeRegs.sort((a, b) => {
    const aPrio =
      (hoveredRegId === a.id ? 4 : 0) +
      (hasIdInCollection(selectedRegIds, a.id) ? 2 : 0) +
      (a.isGeneral ? 1 : 0);
    const bPrio =
      (hoveredRegId === b.id ? 4 : 0) +
      (hasIdInCollection(selectedRegIds, b.id) ? 2 : 0) +
      (b.isGeneral ? 1 : 0);
    if (aPrio !== bPrio) return aPrio - bPrio;
    return a.y - b.y;
  });

  for (let i = 0; i < badgeRegs.length; i++) {
    const reg = badgeRegs[i];
    const allied = isTwRegimentAllied(reg, myIdx, sides, myTeam);
    const selected = hasIdInCollection(selectedRegIds, reg.id);
    const hovered = hoveredRegId === reg.id;
    const anchor = computeOverheadAnchor(reg, cam);

    if (reg.isGeneral && reg.generalId) {
      const isSpeaking = hasIdInCollection(
        activeBanterGeneralIds,
        reg.generalId,
      );
      drawGeneralMedallion(
        ctx,
        reg,
        anchor.sx,
        anchor.sy,
        anchor.groundSy,
        allied,
        selected,
        hovered,
        isSpeaking,
        cam,
        timeSec,
      );
    } else {
      drawRetinueCategoryBadge(
        ctx,
        reg,
        anchor.sx,
        anchor.sy,
        allied,
        selected,
        hovered,
        timeSec,
      );
    }
  }
}

// ============================================================================
// 11. ĐIỂM VÀO TỔNG HỢP DỰNG HÌNH ĐẠI QUÂN & VFX (`renderTwUnits`)
// ============================================================================

/**
 * Dựng trọn vẹn lớp Đại quân, Võ Đài Đấu Tướng, Mưa Tên Đá Lửa và Huy Hiệu Chiến Thuật
 * theo đúng thứ tự phối cảnh 2.5D của Total War: Three Kingdoms.
 */
export function renderTwUnits(
  ctx: CanvasRenderingContext2D,
  opts: TwRenderUnitsOptions,
): void {
  const timeSec = resolveTimeSec(opts.timeSec);
  const normalizedOpts: TwRenderUnitsOptions =
    opts.timeSec === timeSec ? opts : { ...opts, timeSec };

  // 1. Vòng tròn ấn chú Đấu Tướng xoay chậm trên mặt đất
  renderTwDuelArenasGround(ctx, normalizedOpts.duels, normalizedOpts.cam, timeSec);

  // 2. Đường lệnh, chấm chiến thuật 100% quân số & từng binh sĩ hoạt ảnh sắp xếp độ sâu 2.5D
  renderTwRegimentSoldiers(ctx, normalizedOpts);

  // 3. Tia lửa giao kích giữa hai Võ Tướng & ấn song kiếm trên cao
  renderTwDuelArenasSparks(
    ctx,
    normalizedOpts.duels,
    normalizedOpts.regiments,
    normalizedOpts.cam,
    timeSec,
  );

  // 4. Mưa tên cầu vồng 10–14 mũi/loạt & đá lửa Pháo Đá Uy Viễn
  renderTwProjectiles(
    ctx,
    normalizedOpts.projectiles,
    normalizedOpts.cam,
    timeSec,
  );

  // 5. Huy hiệu Chân Dung Võ Tướng (42×42) & Huy hiệu Binh Chủng Xanh/Đỏ (26×26)
  renderTwOverheadBadges(ctx, normalizedOpts);
}

// ============================================================================
// 12. KIỂM TRA VA CHẠM CHUỘT CHÍNH XÁC (`hitTestTwRegiment`)
// ============================================================================

/**
 * Kiểm tra tọa độ thế giới `(wx, wy)` có trỏ trúng đội hình trung đoàn hoặc huy hiệu lơ lửng phía trên hay không.
 * Hỗ trợ `TwBoard.tsx` click chọn, kéo quét hoặc nhấp phải ra lệnh công kích / thách đấu Võ Tướng chính xác.
 */
export function hitTestTwRegiment(
  wx: number,
  wy: number,
  regiments: ReadonlyArray<TwRegimentFrame>,
  opts?: TwHitTestOptions,
): TwRegimentFrame | null {
  if (!Number.isFinite(wx) || !Number.isFinite(wy) || regiments.length === 0) {
    return null;
  }

  const cam = opts?.cam;
  const cursorScreen = cam ? worldToScreen(wx, wy, cam) : null;

  let bestReg: TwRegimentFrame | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < regiments.length; i++) {
    const reg = regiments[i];
    if (reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead') continue;

    if (
      opts?.myIdx !== undefined &&
      !isTwRegimentVisibleToViewer(
        reg,
        opts.myIdx,
        opts.sides,
        opts.revealHiddenEnemies,
        opts.myTeam,
      )
    ) {
      continue;
    }

    // 1. Kiểm tra nhấp trực tiếp vào Huy Hiệu Tròn lơ lửng phía trên trung đoàn
    if (cam && cursorScreen) {
      const anchor = computeOverheadAnchor(reg, cam);
      const badgeR = reg.isGeneral ? 24 : 16;
      const bDist = Math.hypot(
        cursorScreen.sx - anchor.sx,
        cursorScreen.sy - anchor.sy,
      );
      if (bDist <= badgeR) {
        const badgeScore = (bDist / badgeR) * 0.35 - (reg.isGeneral ? 0.08 : 0);
        if (badgeScore < bestScore) {
          bestScore = badgeScore;
          bestReg = reg;
        }
        continue;
      }
    } else {
      // Dự phòng xấp xỉ huy hiệu trong không gian thế giới khi gọi 3 tham số thuần `(wx, wy, regiments)`
      const badgeWy = reg.y - (reg.isGeneral ? 52 : 42);
      const badgeWorldR = reg.isGeneral ? 28 : 20;
      const bWorldDist = Math.hypot(wx - reg.x, wy - badgeWy);
      if (bWorldDist <= badgeWorldR) {
        const badgeScore =
          (bWorldDist / badgeWorldR) * 0.45 - (reg.isGeneral ? 0.08 : 0);
        if (badgeScore < bestScore) {
          bestScore = badgeScore;
          bestReg = reg;
        }
        continue;
      }
    }

    // 2. Kiểm tra hộp bao định hướng (Oriented Bounding Box / Vòng tròn đội hình) dưới mặt đất
    const dx = wx - reg.x;
    const dy = wy - reg.y;

    if (reg.isGeneral || reg.formation === 'circle') {
      const hitRadius = reg.isGeneral
        ? 26
        : Math.max(22, Math.max(reg.width, reg.depth) * 0.56 + 10);
      const dist = Math.hypot(dx, dy);
      if (dist <= hitRadius) {
        const score = dist / hitRadius - (reg.isGeneral ? 0.12 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestReg = reg;
        }
      }
      continue;
    }

    const fx = Math.cos(reg.facing);
    const fy = Math.sin(reg.facing);
    const forwardDist = dx * fx + dy * fy;
    const lateralDist = -dx * fy + dy * fx;

    const pad = 12;
    const halfW = Math.max(18, reg.width * 0.5 + pad);
    const halfD = Math.max(16, reg.depth * 0.5 + pad);

    if (Math.abs(lateralDist) <= halfW && Math.abs(forwardDist) <= halfD) {
      const normDist = Math.hypot(lateralDist / halfW, forwardDist / halfD);
      if (normDist < bestScore) {
        bestScore = normDist;
        bestReg = reg;
      }
    }
  }

  return bestReg;
}

export default renderTwUnits;
