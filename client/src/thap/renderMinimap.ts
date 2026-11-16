/**
 * Bộ vẽ bản đồ thu nhỏ chiến trường ngang 2040×800 của Miragine War (`.thap-lane-bar`):
 * - Cân chỉnh kích thước buffer HiDPI (`devicePixelRatio`) chỉ khi `(cssW, cssH, dpr)` thay đổi.
 * - Lát nền `terrain.jpg` (170×135) mượt theo tỷ lệ, phủ lớp tối dịu khi đang nạp.
 * - Vẽ Cổng Triệu Hồi (`THAP_DOORS`) & Trụ Pha Lê (`THAP_CRYSTALS`) hai phe Đỏ/Xanh.
 * - Chấm từng đơn vị lính sống từ `thapStore.units` thành điểm 2×2 px sắc nét và vẽ khung camera hiện tại.
 */

import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_COLORS,
  THAP_CRYSTALS,
  THAP_DOORS,
  THAP_LANE_Y_MAX,
  THAP_LANE_Y_MIN,
} from '../../../shared/src';
import { ZERO_PADDING, screenToWorld, type Camera, type ViewportPadding } from './camera';
import { getTerrainImage, isDrawableReady } from './sprites';
import { rgba, roundRectPath } from './renderUtils';
import { thapStore } from './store';

/** Tùy chọn vẽ bản đồ thu nhỏ chiến trường ngang Miragine War. */
export interface RenderLaneMinimapOpts {
  cam: Camera;
  viewportW: number;
  viewportH: number;
  pad?: ViewportPadding;
  dpr?: number;
  mapW?: number;
  mapH?: number;
  laneYMin?: number;
  laneYMax?: number;
  colors?: readonly string[];
  myIdx?: number;
  dark?: boolean;
  now?: number;
}

interface BackingSizeState {
  cssW: number;
  cssH: number;
  dpr: number;
}

const DEFAULT_UNIT_COLORS: readonly [string, string] = ['#ff4d4f', '#339af0'];
const HIT_FLASH_MS = 350;
const canvasSizeCache = new WeakMap<HTMLCanvasElement, BackingSizeState>();

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function resolveDpr(rawDpr?: number): number {
  const candidate = rawDpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  return clamp(Number.isFinite(candidate) ? candidate : 1, 1, 3);
}

function syncBackingBuffer(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const targetW = Math.max(1, Math.round(cssW * dpr));
  const targetH = Math.max(1, Math.round(cssH * dpr));
  const prev = canvasSizeCache.get(canvas);

  if (
    !prev ||
    prev.cssW !== cssW ||
    prev.cssH !== cssH ||
    prev.dpr !== dpr ||
    canvas.width !== targetW ||
    canvas.height !== targetH
  ) {
    canvas.width = targetW;
    canvas.height = targetH;
    canvasSizeCache.set(canvas, { cssW, cssH, dpr });
  }
}

function drawTerrainBackdrop(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dark?: boolean,
): void {
  const fallbackGrad = ctx.createLinearGradient(0, 0, cssW, 0);
  fallbackGrad.addColorStop(0, 'rgba(72, 22, 24, 0.92)');
  fallbackGrad.addColorStop(0.14, '#233b1d');
  fallbackGrad.addColorStop(0.5, '#2b4a22');
  fallbackGrad.addColorStop(0.86, '#233b1d');
  fallbackGrad.addColorStop(1, 'rgba(20, 56, 98, 0.92)');
  ctx.fillStyle = fallbackGrad;
  ctx.fillRect(0, 0, cssW, cssH);

  const terrainImg = getTerrainImage('terrain');
  if (isDrawableReady(terrainImg)) {
    const srcW = terrainImg.naturalWidth || terrainImg.width || 170;
    const srcH = terrainImg.naturalHeight || terrainImg.height || 135;
    const tileH = Math.max(1, cssH);
    const tileW = Math.max(1, (srcW / srcH) * tileH);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let x = 0; x < cssW; x += tileW) {
      ctx.drawImage(terrainImg, x, 0, tileW, tileH);
    }
    ctx.restore();

    ctx.fillStyle = dark ? 'rgba(6, 12, 8, 0.34)' : 'rgba(6, 12, 8, 0.2)';
    ctx.fillRect(0, 0, cssW, cssH);
  } else {
    ctx.fillStyle = dark ? 'rgba(8, 12, 16, 0.45)' : 'rgba(8, 12, 16, 0.34)';
    ctx.fillRect(0, 0, cssW, cssH);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(0, Math.round(cssH * 0.5) - 0.5, cssW, 1);
}

function drawPortalMarker(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  cssW: number,
  cssH: number,
  color: string,
): void {
  const pw = clamp(cssW * 0.022, 3, 5);
  const ph = clamp(cssH * 0.46, 6, 16);
  const x = mx - pw * 0.5;
  const y = my - ph * 0.5;

  ctx.save();
  roundRectPath(ctx, x, y, pw, ph, Math.min(2, pw * 0.45));
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillRect(mx - 0.5, y + 2, 1, Math.max(2, ph - 4));
  ctx.restore();
}

function drawCrystalMarker(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  cssH: number,
  color: string,
  isMine: boolean,
  isDead: boolean,
  hitRatio: number,
): void {
  const r = clamp(cssH * 0.22, 3.5, 7.5);

  ctx.save();
  if (hitRatio > 0) {
    ctx.strokeStyle = rgba('#ffd43b', 0.9 * hitRatio);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, r + (1 - hitRatio) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(mx, my - r);
  ctx.lineTo(mx + r * 0.85, my);
  ctx.lineTo(mx, my + r);
  ctx.lineTo(mx - r * 0.85, my);
  ctx.closePath();

  ctx.fillStyle = isDead ? '#495057' : color;
  ctx.fill();
  ctx.strokeStyle = isMine ? '#ffd43b' : 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = isMine ? 1.4 : 1;
  ctx.stroke();

  if (isDead) {
    const cr = r * 0.55;
    ctx.strokeStyle = '#ff8787';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx - cr, my - cr);
    ctx.lineTo(mx + cr, my + cr);
    ctx.moveTo(mx + cr, my - cr);
    ctx.lineTo(mx - cr, my + cr);
    ctx.stroke();
  }
  ctx.restore();
}

function drawViewportRect(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  opts: RenderLaneMinimapOpts,
  toMiniX: (wx: number) => number,
  toMiniY: (wy: number) => number,
): void {
  if (opts.viewportW <= 0 || opts.viewportH <= 0) return;
  const pad = opts.pad ?? ZERO_PADDING;
  const rightScreen = Math.max(pad.left + 1, opts.viewportW - pad.right);
  const bottomScreen = Math.max(pad.top + 1, opts.viewportH - pad.bottom);
  const tl = screenToWorld(pad.left, pad.top, opts.cam, opts.viewportW, opts.viewportH, pad);
  const br = screenToWorld(rightScreen, bottomScreen, opts.cam, opts.viewportW, opts.viewportH, pad);

  const inset = 1;
  const maxX = Math.max(inset + 4, cssW - inset);
  const maxY = Math.max(inset + 4, cssH - inset);

  const x1 = clamp(toMiniX(tl.x), inset, maxX - 4);
  const x2 = clamp(toMiniX(br.x), x1 + 4, maxX);
  const y1 = clamp(toMiniY(tl.y), inset, maxY - 4);
  const y2 = clamp(toMiniY(br.y), y1 + 4, maxY);
  const rw = Math.max(4, x2 - x1);
  const rh = Math.max(4, y2 - y1);

  ctx.save();
  ctx.fillStyle = 'rgba(255, 232, 133, 0.12)';
  ctx.fillRect(x1, y1, rw, rh);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x1, y1, rw, rh);

  ctx.strokeStyle = '#fff3bf';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x1, y1, rw, rh);
  ctx.restore();
}

/**
 * Vẽ bản đồ thu nhỏ chiến trường ngang (`2040×800`) vào `canvas` với kích thước logic `(cssW, cssH)`.
 * Chỉ cấp phát lại backing buffer HiDPI khi `(cssW, cssH, dpr)` thay đổi.
 */
export function renderLaneMinimap(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  opts: RenderLaneMinimapOpts,
): void {
  if (cssW <= 0 || cssH <= 0) return;
  const dpr = resolveDpr(opts.dpr);
  syncBackingBuffer(canvas, cssW, cssH, dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const mapW = opts.mapW && opts.mapW > 0 ? opts.mapW : thapStore.mapW || THAP_ARENA_W;
  const mapH = opts.mapH && opts.mapH > 0 ? opts.mapH : thapStore.mapH || THAP_ARENA_H;
  const scaleY = mapH / THAP_ARENA_H;
  const laneYMin = opts.laneYMin ?? THAP_LANE_Y_MIN * scaleY;
  const laneYMax = opts.laneYMax ?? THAP_LANE_Y_MAX * scaleY;
  const laneSpanY = Math.max(1, laneYMax - laneYMin);
  const yPad = Math.min(2, cssH * 0.15);
  const yUsable = Math.max(1, cssH - yPad * 2);

  const toMiniX = (wx: number): number => (wx / mapW) * cssW;
  const toMiniY = (wy: number): number => yPad + ((wy - laneYMin) / laneSpanY) * yUsable;

  const now = opts.now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const unitColors = opts.colors ?? DEFAULT_UNIT_COLORS;
  const aliveFlags = thapStore.frame?.al;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  drawTerrainBackdrop(ctx, cssW, cssH, opts.dark);

  for (const side of [0, 1] as const) {
    const color = THAP_COLORS[side];
    const [doorX, doorY] = THAP_DOORS[side];
    const [crystalX, crystalY] = THAP_CRYSTALS[side];
    const isDead = aliveFlags ? aliveFlags[side] !== 1 : false;
    const hitAt = thapStore.baseHitAt[side] ?? 0;
    const hitElapsed = hitAt > 0 ? now - hitAt : -1;
    const hitRatio = hitElapsed >= 0 && hitElapsed < HIT_FLASH_MS ? 1 - hitElapsed / HIT_FLASH_MS : 0;

    drawPortalMarker(
      ctx,
      clamp(toMiniX(doorX), 2, cssW - 2),
      clamp(toMiniY(doorY), 2, cssH - 2),
      cssW,
      cssH,
      color,
    );
    drawCrystalMarker(
      ctx,
      clamp(toMiniX(crystalX), 3, cssW - 3),
      clamp(toMiniY(crystalY), 3, cssH - 3),
      cssH,
      color,
      opts.myIdx === side,
      isDead,
      hitRatio,
    );
  }

  for (const u of thapStore.units.values()) {
    const pos = thapStore.interpPos(u, now);
    const mx = clamp(toMiniX(pos.x), 1, cssW - 1);
    const my = clamp(toMiniY(pos.y), 1, cssH - 1);
    ctx.fillStyle = u.owner === 1 ? (unitColors[1] ?? '#339af0') : (unitColors[0] ?? '#ff4d4f');
    ctx.fillRect(Math.round(mx - 1), Math.round(my - 1), 2, 2);
  }

  drawViewportRect(ctx, cssW, cssH, opts, toMiniX, toMiniY);
  ctx.restore();
}
