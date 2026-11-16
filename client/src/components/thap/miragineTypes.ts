/**
 * Kiểu dữ liệu, hằng số lưới 2×8, ánh xạ phím tắt 16 binh chủng và props HUD
 * cho chế độ Miragine War cổ điển (1P vs AI / 1v1 PvP).
 */
import type { ReactNode, RefObject } from 'react';
import {
  THAP_UNITS,
  THAP_UNIT_GRID_COLS,
  THAP_UNIT_GRID_ROWS,
  THAP_UNIT_KINDS,
  type PublicPlayer,
  type ThapConfig,
  type ThapPlayerInfo,
  type ThapPrivate,
  type ThapResult,
  type ThapRoomView,
  type ThapUnitKind,
} from '../../../../shared/src';
import type { Camera, ViewportPadding } from '../../thap/camera';

/** Khoảng đệm các thanh HUD che lên canvas (khớp `ViewportPadding` của `camera.ts`). */
export interface HudInsets extends ViewportPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const DEFAULT_HUD_INSETS: HudInsets = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

/** Kích thước lưới chọn binh chủng cổ điển 2 hàng × 8 cột. */
export const GRID_COLS = THAP_UNIT_GRID_COLS;
export const GRID_ROWS = THAP_UNIT_GRID_ROWS;

/** Kích thước hiển thị CSS pixel của canvas chiến trường. */
export interface MiragineViewportSize {
  width: number;
  height: number;
}

/** Chuyển chỉ số ô `0..15` trong `THAP_UNIT_KINDS` sang tọa độ `{ row, col }` trên lưới 2×8. */
export function gridIndexToCoords(idx: number): { row: number; col: number } {
  const total = GRID_ROWS * GRID_COLS;
  const normalized = Number.isFinite(idx) ? ((Math.trunc(idx) % total) + total) % total : 0;
  return {
    row: Math.floor(normalized / GRID_COLS),
    col: normalized % GRID_COLS,
  };
}

/** Chuyển tọa độ `{ row, col }` (tự cuộn vòng trong lưới 2×8) về chỉ số `0..15`. */
export function coordsToGridIndex(row: number, col: number): number {
  const safeRow = Number.isFinite(row) ? Math.trunc(row) : 0;
  const safeCol = Number.isFinite(col) ? Math.trunc(col) : 0;
  const wrappedRow = ((safeRow % GRID_ROWS) + GRID_ROWS) % GRID_ROWS;
  const wrappedCol = ((safeCol % GRID_COLS) + GRID_COLS) % GRID_COLS;
  return wrappedRow * GRID_COLS + wrappedCol;
}

/** Di chuyển ô con trỏ chọn quân theo bước `(dr, dc)` và cuộn vòng gọn trong lưới 2×8. */
export function moveGridSelection(current: ThapUnitKind, dr: number, dc: number): ThapUnitKind {
  const curIdx = THAP_UNIT_KINDS.indexOf(current);
  const { row, col } = gridIndexToCoords(curIdx >= 0 ? curIdx : 0);
  const nextIdx = coordsToGridIndex(row + dr, col + dc);
  return THAP_UNIT_KINDS[nextIdx] ?? THAP_UNIT_KINDS[0];
}

/**
 * Bảng ánh xạ phím tắt (`1..9, 0, Q, E, F, G, V, B`) -> `ThapUnitKind`,
 * sinh tự động từ `THAP_UNIT_KINDS` và `THAP_UNITS[k].hotkey` (không phân biệt hoa/thường).
 */
export const HOTKEY_TO_KIND: Readonly<Record<string, ThapUnitKind>> = (() => {
  const map: Record<string, ThapUnitKind> = {};
  for (const kind of THAP_UNIT_KINDS) {
    const hotkey = THAP_UNITS[kind].hotkey;
    map[hotkey.toLowerCase()] = kind;
    map[hotkey.toUpperCase()] = kind;
  }
  return map;
})();

/** Tra cứu `ThapUnitKind` từ `KeyboardEvent` (`e.key` ưu tiên, fallback `e.code` cho bộ gõ IME). */
export function resolveUnitHotkey(e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>): ThapUnitKind | undefined {
  const byKey = HOTKEY_TO_KIND[e.key];
  if (byKey) return byKey;
  if (e.shiftKey) return undefined;

  if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
    const digit = e.code.slice(-1);
    return HOTKEY_TO_KIND[digit];
  }
  if (e.code.startsWith('Key') && e.code.length === 4) {
    return HOTKEY_TO_KIND[e.code.slice(3)];
  }
  return undefined;
}

/** Tham số đầu vào của hook `useMiragineControls`. */
export interface UseMiragineControlsOptions {
  roomCode: string;
  thap: ThapRoomView;
  playing: boolean;
  ended: boolean;
  myIdx: number | undefined;
  winnerTeam?: number | undefined;
  result?: ThapResult;
  myTeam: number | undefined;
  selectedUnit: ThapUnitKind;
  inspectedUnit?: ThapUnitKind;
  onSelectUnit: (kind: ThapUnitKind) => void;
  onInspectUnit?: (kind: ThapUnitKind) => void;
  emit: (ev: string, payload?: unknown) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  topHudRef?: RefObject<HTMLElement | null>;
  bottomHudRef?: RefObject<HTMLElement | null>;
}

/** Trạng thái & hàm điều khiển trả về từ `useMiragineControls`. */
export interface MiragineControlState {
  camRef: RefObject<Camera>;
  hudInsets: HudInsets;
  hudInsetsRef: RefObject<HudInsets>;
  viewportSize: MiragineViewportSize;
  isPanning: boolean;
  selectedUnit: ThapUnitKind;
  inspectedUnit: ThapUnitKind;
  selectUnit: (kind: ThapUnitKind) => void;
  inspectUnit: (kind: ThapUnitKind) => void;
  panLeft: () => void;
  panRight: () => void;
  focusWorldX: (wx: number) => void;
  focusCrystal: (sideIdx: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  flushSpatialAudio: (cssW?: number, cssH?: number) => void;
}

/** Props cho thanh HUD phía trên (`MiragineTopHud`). */
export interface MiragineTopHudProps {
  players: readonly ThapPlayerInfo[];
  myIdx?: number;
  me?: ThapPrivate;
  baseHp: readonly number[];
  wave: number;
  roundLeft: number;
  roundTotalS: number;
  lastWaveUnits: readonly [number, number];
  elapsedMs: number;
  endsAt?: number;
  alive: boolean;
  ended: boolean;
  pot?: number;
  bet?: number;
  tutorialOpen?: boolean;
  chatOpen?: boolean;
  unreadCount?: number;
  dock?: ReactNode;
  onFocusCrystal?: (sideIdx: number) => void;
  onOpenTutorial?: () => void;
  onToggleChat?: () => void;
  onLeave?: () => void;
}

/** Props cho thanh cuộn chiến trường ngang 2040px & cụm nút zoom (`MiragineLaneBar`). */
export interface MiragineLaneBarProps {
  mapW?: number;
  mapH?: number;
  cam: Camera;
  viewportSize: MiragineViewportSize;
  hudInsets: HudInsets;
  bases?: readonly (readonly [number, number])[];
  myIdx?: number;
  onFocusWorldX: (wx: number) => void;
  onPanLeft?: () => void;
  onPanRight?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
}

/** Props cho khung soi thông số binh chủng (`MiragineUnitInfo`). */
export interface MiragineUnitInfoProps {
  unitKind: ThapUnitKind;
  selectedUnit: ThapUnitKind;
  gold?: number;
  pop?: number;
  popCap?: number;
}

/** Props cho bảng lưới chọn 16 binh chủng 2×8 (`MiragineUnitGrid`). */
export interface MiragineUnitGridProps {
  selectedUnit: ThapUnitKind;
  inspectedUnit: ThapUnitKind;
  gold?: number;
  pop?: number;
  popCap?: number;
  disabled?: boolean;
  onSelectUnit: (kind: ThapUnitKind) => void;
  onInspectUnit?: (kind: ThapUnitKind) => void;
}

/** Props cho màn hình tiêu đề 4:3 (`MiragineTitleScreen`). */
export interface MiragineTitleScreenProps {
  config: ThapConfig;
  isHost: boolean;
  players?: readonly PublicPlayer[];
  canStart?: boolean;
  onChangeConfig?: (patch: Partial<ThapConfig>) => void;
  onStart: () => void;
  onOpenTutorial: () => void;
  onLeave?: () => void;
}

/** Props cho hộp thoại Hướng dẫn & Bách khoa 16 binh chủng (`MiragineTutorialModal`). */
export interface MiragineTutorialModalProps {
  open: boolean;
  initialTab?: 'guide' | 'almanac';
  initialUnit?: ThapUnitKind;
  onClose: () => void;
}

/** Props cho bảng tổng kết Thắng / Thua (`MiragineResultModal`). */
export interface MiragineResultModalProps {
  result: ThapResult;
  players: readonly ThapPlayerInfo[];
  myIdx?: number;
  myTeam?: number;
  isHost: boolean;
  pot?: number;
  bet?: number;
  payouts?: Readonly<Record<string, number>>;
  winnerId?: string;
  onRestart: () => void;
  onLeave: () => void;
}
