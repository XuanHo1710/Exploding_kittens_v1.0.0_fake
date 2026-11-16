/**
 * Vẽ phông nền vực đá và địa hình đấu trường Miragine War (`2040 × 800`):
 * - Tô nền vực tối `#080a0f` trước khi biến đổi camera.
 * - Cắt chính xác vùng `[0, 0, mapW, mapH]` và ghép 3×1 tấm `terrain2.jpg` (`680 × 800` tại `x = 0, 680, 1360`).
 * - Vẽ nền chuyển sắc dự phòng khi ảnh chưa tải xong, đường dẫn làn mờ và viền khung mảnh.
 */

import { getTerrainImage, isDrawableReady } from './sprites';

const BACKDROP_COLOR = '#080a0f';
const TERRAIN_TILE_W = 680;
const TERRAIN_TILE_H = 800;
const LANE_GUIDE_COLOR = 'rgba(255, 255, 255, 0.06)';

function drawFallbackGradient(ctx: CanvasRenderingContext2D, mapW: number, mapH: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, mapH);
  grad.addColorStop(0, '#49641f');
  grad.addColorStop(0.5, '#64852a');
  grad.addColorStop(1, '#4b6820');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, mapW, mapH);
}

function drawLaneGuides(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  laneYMin: number,
  laneYMax: number,
): void {
  ctx.save();
  ctx.strokeStyle = LANE_GUIDE_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();

  for (const y of [laneYMin, laneYMax]) {
    if (Number.isFinite(y) && y > 0 && y < mapH) {
      ctx.moveTo(0, y);
      ctx.lineTo(mapW, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function drawArenaBorder(ctx: CanvasRenderingContext2D, mapW: number, mapH: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, mapW, mapH);

  if (mapW > 3 && mapH > 3) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, 1.5, mapW - 3, mapH - 3);
  }
  ctx.restore();
}

/** Tô phông nền đá tối / vực thẳm `#080a0f` phủ kín màn hình trước khi áp biến đổi camera. */
export function drawMiragineBackdrop(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void {
  if (cssW <= 0 || cssH <= 0) return;
  ctx.save();
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();
}

/**
 * Vẽ mặt sân chiến trường Miragine War bên trong vùng cắt nghiêm ngặt `[0, 0, mapW, mapH]`:
 * ghép 3×1 tấm `terrain2.jpg` (`680 × 800`), đường dẫn làn mờ (`rgba(255,255,255,0.06)`) và viền khung mảnh.
 */
export function drawMiragineTerrain(
  ctx: CanvasRenderingContext2D,
  mapW: number,
  mapH: number,
  laneYMin: number,
  laneYMax: number,
): void {
  if (mapW <= 0 || mapH <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, mapW, mapH);
  ctx.clip();

  drawFallbackGradient(ctx, mapW, mapH);

  const terrainImg = getTerrainImage('terrain2');
  if (isDrawableReady(terrainImg)) {
    for (let x = 0; x < mapW; x += TERRAIN_TILE_W) {
      for (let y = 0; y < mapH; y += TERRAIN_TILE_H) {
        ctx.drawImage(terrainImg, x, y, TERRAIN_TILE_W, TERRAIN_TILE_H);
      }
    }
  }

  drawLaneGuides(ctx, mapW, mapH, laneYMin, laneYMax);
  drawArenaBorder(ctx, mapW, mapH);
  ctx.restore();
}
