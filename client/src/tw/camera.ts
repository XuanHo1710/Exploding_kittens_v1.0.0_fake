/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Bộ điều khiển Camera chiến thuật 2.5D nghiêng phối cảnh (TW_ISO_TILT = 0.80),
 * phép chiếu Tọa độ Thế giới <-> Màn hình, thu phóng neo theo con trỏ chuột,
 * và tính toán đường kéo chuột phải dàn trận hình (Total War Right-Click Drag Battle Line).
 */

/** Hệ số nén trục Y tạo phối cảnh chiến trường nghiêng 2.5D chuẩn Total War */
export const TW_ISO_TILT = 0.80;

/** Giới hạn thu phóng ống kính chiến thuật */
export const TW_ZOOM_MIN = 0.34;
export const TW_ZOOM_MAX = 1.85;
export const TW_DEFAULT_ZOOM = 0.68;

/** Độ rộng tối thiểu mặc định khi kéo chuột phải dàn hàng quân */
const DEFAULT_DRAG_LINE_MIN_WIDTH = 80;

/**
 * Trạng thái Camera chiến trường:
 * - `(x, y)`: tọa độ thế giới nằm chính giữa khung nhìn màn hình `(viewW * 0.5, viewH * 0.5)`
 * - `zoom`: hệ số phóng đại trong khoảng `[0.34, 1.85]`
 * - `viewW`, `viewH`: kích thước khung nhìn CSS pixel của Canvas
 */
export interface TwCamera {
  x: number;
  y: number;
  zoom: number;
  viewW: number;
  viewH: number;
}

/**
 * Thông tin xem trước đường kéo dàn quân chuột phải (Right-Click Drag Formation Line):
 * - `(startWx, startWy)` -> `(endWx, endWy)`: hai đầu cánh trái -> cánh phải trên mặt đất
 * - `(centerX, centerY)`: tâm đội hình mới
 * - `facing`: góc hướng mặt đội hình (radian, vuông góc với véc-tơ kéo từ trái sang phải)
 * - `width`: bề ngang mặt trận
 */
export interface TwDragLinePreview {
  startWx: number;
  startWy: number;
  endWx: number;
  endWy: number;
  centerX: number;
  centerY: number;
  facing: number;
  width: number;
}

/** Kẹp hệ số thu phóng camera trong biên hợp lệ `[0.34, 1.85]` */
export function clampTwZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return TW_DEFAULT_ZOOM;
  return Math.max(TW_ZOOM_MIN, Math.min(TW_ZOOM_MAX, zoom));
}

/** Khởi tạo đối tượng camera mặc định nhìn vào trung tâm chiến trường */
export function createTwCamera(
  mapW = 3200,
  mapH = 2200,
  viewW = 1280,
  viewH = 720,
  zoom = TW_DEFAULT_ZOOM,
): TwCamera {
  const cam: TwCamera = {
    x: mapW * 0.5,
    y: mapH * 0.5,
    zoom: clampTwZoom(zoom),
    viewW: Math.max(1, viewW),
    viewH: Math.max(1, viewH),
  };
  clampTwCamera(cam, mapW, mapH);
  return cam;
}

/**
 * Chuyển đổi tọa độ thế giới `(wx, wy)` sang tọa độ điểm ảnh trên màn hình `(sx, sy)`
 * áp dụng phối cảnh nghiêng 2.5D `TW_ISO_TILT` trên trục Y.
 */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: TwCamera,
): { sx: number; sy: number } {
  const sx = cam.viewW * 0.5 + (wx - cam.x) * cam.zoom;
  const sy = cam.viewH * 0.5 + (wy - cam.y) * cam.zoom * TW_ISO_TILT;
  return { sx, sy };
}

/**
 * Phép nghịch đảo chính xác của `worldToScreen`:
 * chuyển tọa độ màn hình `(sx, sy)` về tọa độ mặt đất thế giới `(wx, wy)`.
 */
export function screenToWorld(
  sx: number,
  sy: number,
  cam: TwCamera,
): { wx: number; wy: number } {
  const z = Number.isFinite(cam.zoom) && cam.zoom > 0 ? cam.zoom : TW_DEFAULT_ZOOM;
  const wx = cam.x + (sx - cam.viewW * 0.5) / z;
  const wy = cam.y + (sy - cam.viewH * 0.5) / (z * TW_ISO_TILT);
  return { wx, wy };
}

/**
 * Giới hạn `zoom` trong `[0.34, 1.85]` và giữ tâm camera `(x, y)` trong biên chiến trường,
 * có chừa khoảng đệm hợp lý (nhất là mép dưới cho thanh thẻ bài đại quân HUD) để người chơi
 * dễ dàng quan sát và điều khiển các trung đoàn đóng sát rìa bản đồ.
 */
export function clampTwCamera(cam: TwCamera, mapW: number, mapH: number): void {
  cam.zoom = clampTwZoom(cam.zoom);

  const mw = Number.isFinite(mapW) && mapW > 0 ? mapW : 3200;
  const mh = Number.isFinite(mapH) && mapH > 0 ? mapH : 2200;

  if (!Number.isFinite(cam.x)) cam.x = mw * 0.5;
  if (!Number.isFinite(cam.y)) cam.y = mh * 0.5;

  const vw = Number.isFinite(cam.viewW) ? cam.viewW : 0;
  const vh = Number.isFinite(cam.viewH) ? cam.viewH : 0;

  if (vw <= 0 || vh <= 0) {
    cam.x = Math.max(0, Math.min(mw, cam.x));
    cam.y = Math.max(0, Math.min(mh, cam.y));
    return;
  }

  // Cho phép khoảng đệm viền (28% ngang, 25% trên, 36% dưới bù thanh thẻ quân HUD)
  // giúp kéo mượt ở mọi mức zoom nhưng không bao giờ trôi bản đồ khỏi màn hình.
  const minX = Math.max(0, (vw * 0.22) / cam.zoom);
  const maxX = Math.min(mw, mw - (vw * 0.22) / cam.zoom);
  if (minX <= maxX) {
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
  } else {
    const slackX = Math.min(mw * 0.18, 240);
    cam.x = Math.max(mw * 0.5 - slackX, Math.min(mw * 0.5 + slackX, cam.x));
  }

  const denomY = cam.zoom * TW_ISO_TILT;
  const minY = Math.max(0, (vh * 0.25) / denomY);
  const maxY = Math.min(mh, mh - (vh * 0.14) / denomY);
  if (minY <= maxY) {
    cam.y = Math.max(minY, Math.min(maxY, cam.y));
  } else {
    const slackY = Math.min(mh * 0.2, 220);
    cam.y = Math.max(mh * 0.5 - slackY, Math.min(mh * 0.5 + slackY, cam.y));
  }

  cam.x = Math.max(0, Math.min(mw, cam.x));
  cam.y = Math.max(0, Math.min(mh, cam.y));
}

/**
 * Thu phóng camera tới `nextZoom` giữ cố định điểm thế giới nằm dưới tọa độ neo màn hình
 * `(anchorSx, anchorSy)` (vị trí con trỏ chuột hoặc tâm chụm hai ngón tay), sau đó kẹp biên.
 */
export function zoomTwCameraAt(
  cam: TwCamera,
  nextZoom: number,
  anchorSx: number,
  anchorSy: number,
  mapW: number,
  mapH: number,
): void {
  cam.zoom = clampTwZoom(cam.zoom);
  const anchorWorld = screenToWorld(anchorSx, anchorSy, cam);

  const clampedNext = clampTwZoom(nextZoom);
  cam.zoom = clampedNext;

  cam.x = anchorWorld.wx - (anchorSx - cam.viewW * 0.5) / clampedNext;
  cam.y = anchorWorld.wy - (anchorSy - cam.viewH * 0.5) / (clampedNext * TW_ISO_TILT);

  clampTwCamera(cam, mapW, mapH);
}

/**
 * Tính toán đường kéo chuột phải dàn đội hình chuẩn Total War:
 * - Kéo từ cánh trái `(startWx, startWy)` sang cánh phải `(endWx, endWy)` tạo mặt trận rộng `width`
 *   có tâm tại `(centerX, centerY)`.
 * - Véc-tơ hướng mặt `facing` vuông góc sang phía trước của đường kéo:
 *   kéo từ trái sang phải (`dx > 0, dy = 0`) -> quân quay mặt lên phía Bắc (`facing = -PI/2`).
 */
export function computeDragLinePreview(
  startWx: number,
  startWy: number,
  endWx: number,
  endWy: number,
  minWidth: number = DEFAULT_DRAG_LINE_MIN_WIDTH,
): TwDragLinePreview {
  const dx = endWx - startWx;
  const dy = endWy - startWy;
  const rawDist = Math.hypot(dx, dy);
  const floorWidth = Number.isFinite(minWidth) ? Math.max(0, minWidth) : DEFAULT_DRAG_LINE_MIN_WIDTH;

  if (rawDist < 1e-4) {
    return {
      startWx,
      startWy,
      endWx,
      endWy,
      centerX: startWx,
      centerY: startWy,
      facing: -Math.PI * 0.5,
      width: floorWidth,
    };
  }

  const centerX = (startWx + endWx) * 0.5;
  const centerY = (startWy + endWy) * 0.5;
  // Pháp tuyến phía trước của véc-tơ cánh trái -> cánh phải (dx, dy) trong hệ trục (+X phải, +Y xuống)
  const negDx = dx === 0 ? 0 : -dx;
  const facing = Math.atan2(negDx, dy);
  const width = Math.max(floorWidth, rawDist);

  return {
    startWx,
    startWy,
    endWx,
    endWy,
    centerX,
    centerY,
    facing,
    width,
  };
}
