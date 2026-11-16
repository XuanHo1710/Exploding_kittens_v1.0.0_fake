/**
 * Bộ điều khiển Camera 2D thuần cho Miragine War:
 * - Tôn trọng vùng đệm HUD (`ViewportPadding`) để thanh trạng thái trên và thanh lệnh dưới
 *   không bao giờ che khuất đường hành quân.
 * - Hỗ trợ fit màn hình desktop/mobile, kéo pan, thu phóng neo theo điểm trỏ và âm lượng không gian.
 */

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const ZERO_PADDING: ViewportPadding = { top: 0, bottom: 0, left: 0, right: 0 };

const MIN_USABLE_PX = 120;
const MIN_ZOOM_FLOOR = 0.28;
const MAX_ZOOM = 2.2;
const SPATIAL_MARGIN_MIN_PX = 32;
const SPATIAL_MARGIN_MAX_PX = 80;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function usableViewport(vw: number, vh: number, pad: ViewportPadding): { uw: number; uh: number } {
  return {
    uw: Math.max(MIN_USABLE_PX, vw - pad.left - pad.right),
    uh: Math.max(MIN_USABLE_PX, vh - pad.top - pad.bottom),
  };
}

/** Tính giới hạn zoom `[minZoom, maxZoom]` thích nghi theo vùng chơi an toàn và kích thước đấu trường. */
export function computeZoomBounds(
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
): { minZoom: number; maxZoom: number } {
  const safeW = Math.max(1, arenaW);
  const safeH = Math.max(1, arenaH);
  const { uw, uh } = usableViewport(vw, vh, pad);
  const fitRatio = Math.min(uw / safeW, uh / safeH) * 0.9;
  const minZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM_FLOOR, fitRatio));
  return { minZoom, maxZoom: MAX_ZOOM };
}

/** Tọa độ tâm màn hình của vùng chơi an toàn nằm giữa các thanh HUD (`[pad.left..vw-pad.right]`). */
export function viewportSafeCenter(
  vw: number,
  vh: number,
  pad: ViewportPadding = ZERO_PADDING,
): { x: number; y: number } {
  return {
    x: (pad.left + vw - pad.right) * 0.5,
    y: (pad.top + vh - pad.bottom) * 0.5,
  };
}

/** Kẹp zoom và tâm camera để vùng chơi an toàn luôn bám trong đấu trường (hoặc căn giữa khi thu nhỏ hết cỡ). */
export function clampCamera(
  cam: Camera,
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
): Camera {
  const safeW = Math.max(1, arenaW);
  const safeH = Math.max(1, arenaH);
  const { minZoom, maxZoom } = computeZoomBounds(vw, vh, safeW, safeH, pad);
  const zoom = clamp(Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1, minZoom, maxZoom);

  const { uw, uh } = usableViewport(vw, vh, pad);
  const halfWorldW = uw / (2 * zoom);
  const halfWorldH = uh / (2 * zoom);

  const rawX = Number.isFinite(cam.x) ? cam.x : safeW * 0.5;
  const rawY = Number.isFinite(cam.y) ? cam.y : safeH * 0.5;

  const x = halfWorldW * 2 >= safeW ? safeW * 0.5 : clamp(rawX, halfWorldW, safeW - halfWorldW);
  const y = halfWorldH * 2 >= safeH ? safeH * 0.5 : clamp(rawY, halfWorldH, safeH - halfWorldH);

  return { x, y, zoom };
}

/** Tạo camera vừa khung chiều cao (hoặc toàn đấu trường trên màn hình rộng), căn theo `focusX` nếu truyền vào. */
export function fitCamera(
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
  focusX?: number,
): Camera {
  const safeW = Math.max(1, arenaW);
  const safeH = Math.max(1, arenaH);
  const { uw, uh } = usableViewport(vw, vh, pad);
  const fitW = uw / safeW;
  const fitH = uh / safeH;
  const targetZoom = uw >= uh && fitW >= 0.5 ? Math.min(fitW, fitH) : fitH;

  return clampCamera(
    {
      x: focusX !== undefined && Number.isFinite(focusX) ? focusX : safeW * 0.5,
      y: safeH * 0.5,
      zoom: targetZoom,
    },
    vw,
    vh,
    safeW,
    safeH,
    pad,
  );
}

/** Dịch chuyển tâm camera theo độ dời pixel màn hình `(dxScreen, dyScreen)` và kẹp biên. */
export function panCameraBy(
  cam: Camera,
  dxScreen: number,
  dyScreen: number,
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
): Camera {
  const { minZoom, maxZoom } = computeZoomBounds(vw, vh, arenaW, arenaH, pad);
  const zoom = clamp(Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1, minZoom, maxZoom);
  return clampCamera(
    {
      x: cam.x + dxScreen / zoom,
      y: cam.y + dyScreen / zoom,
      zoom,
    },
    vw,
    vh,
    arenaW,
    arenaH,
    pad,
  );
}

/** Thu phóng camera theo hệ số `factor` tại điểm neo màn hình `(screenX, screenY)`. */
export function zoomCameraAt(
  cam: Camera,
  screenX: number,
  screenY: number,
  factor: number,
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
): Camera {
  const { minZoom, maxZoom } = computeZoomBounds(vw, vh, arenaW, arenaH, pad);
  const prevZoom = clamp(Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1, minZoom, maxZoom);
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const nextZoom = clamp(prevZoom * safeFactor, minZoom, maxZoom);

  const baseCam: Camera = { x: cam.x, y: cam.y, zoom: prevZoom };
  const anchor = screenToWorld(screenX, screenY, baseCam, vw, vh, pad);
  const center = viewportSafeCenter(vw, vh, pad);

  return clampCamera(
    {
      x: anchor.x - (screenX - center.x) / nextZoom,
      y: anchor.y - (screenY - center.y) / nextZoom,
      zoom: nextZoom,
    },
    vw,
    vh,
    arenaW,
    arenaH,
    pad,
  );
}

/** Hướng camera trực tiếp tới tọa độ thế giới `(worldX, worldY)` ở mức `zoom` cho trước và kẹp biên. */
export function focusCameraOn(
  worldX: number,
  worldY: number,
  zoom: number,
  vw: number,
  vh: number,
  arenaW: number,
  arenaH: number,
  pad: ViewportPadding = ZERO_PADDING,
): Camera {
  return clampCamera({ x: worldX, y: worldY, zoom }, vw, vh, arenaW, arenaH, pad);
}

/** Chuyển tọa độ thế giới `(wx, wy)` sang tọa độ điểm ảnh trên màn hình `(x, y)`. */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  vw: number,
  vh: number,
  pad: ViewportPadding = ZERO_PADDING,
): { x: number; y: number } {
  const center = viewportSafeCenter(vw, vh, pad);
  return {
    x: center.x + (wx - cam.x) * cam.zoom,
    y: center.y + (wy - cam.y) * cam.zoom,
  };
}

/** Chuyển tọa độ màn hình `(sx, sy)` về tọa độ thế giới `(x, y)` (nghịch đảo chính xác của `worldToScreen`). */
export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  vw: number,
  vh: number,
  pad: ViewportPadding = ZERO_PADDING,
): { x: number; y: number } {
  const center = viewportSafeCenter(vw, vh, pad);
  const zoom = Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : 1;
  return {
    x: cam.x + (sx - center.x) / zoom,
    y: cam.y + (sy - center.y) / zoom,
  };
}

/**
 * Tính hệ số âm lượng không gian cho sự kiện tại `(worldX, worldY)`:
 * - Trả về `0` khi nằm ngoài khung nhìn quá một khoảng đệm nhỏ.
 * - Trả về `0.03..1.0` suy giảm mượt từ tâm ra rìa vùng chơi an toàn.
 */
export function computeSpatialVolume(
  worldX: number,
  worldY: number,
  cam: Camera,
  vw: number,
  vh: number,
  pad: ViewportPadding = ZERO_PADDING,
): number {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || vw <= 0 || vh <= 0) {
    return 0;
  }

  const screen = worldToScreen(worldX, worldY, cam, vw, vh, pad);
  const left = pad.left;
  const right = Math.max(left + 1, vw - pad.right);
  const top = pad.top;
  const bottom = Math.max(top + 1, vh - pad.bottom);

  const halfW = Math.max(60, (right - left) * 0.5);
  const halfH = Math.max(60, (bottom - top) * 0.5);
  const margin = clamp(Math.min(halfW, halfH) * 0.2, SPATIAL_MARGIN_MIN_PX, SPATIAL_MARGIN_MAX_PX);

  const outX = Math.max(0, left - screen.x, screen.x - right);
  const outY = Math.max(0, top - screen.y, screen.y - bottom);
  if (outX > margin || outY > margin) return 0;

  const center = viewportSafeCenter(vw, vh, pad);
  const nx = Math.min(1, Math.abs(screen.x - center.x) / halfW);
  const ny = Math.min(1, Math.abs(screen.y - center.y) / halfH);
  const norm = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2);
  const insideVol = 0.03 + 0.97 * (1 - norm) * (1 - norm * 0.35);

  const out = Math.max(outX, outY);
  if (out === 0) return clamp(insideVol, 0.03, 1);

  return clamp(insideVol * (1 - out / margin), 0, 1);
}
