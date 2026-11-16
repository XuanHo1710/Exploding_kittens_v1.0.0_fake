/**
 * Bộ tổng hợp cảnh Canvas 2D thuần cho Miragine War 1:1:
 * - Tôn trọng vùng đệm HUD (`ViewportPadding`) và biến đổi camera qua `camera.ts`.
 * - Vẽ theo đúng thứ tự chiều sâu: phông nền vực tối -> địa hình 2040×800 -> bóng lính ->
 *   các thực thể sắp xếp theo trục Y (Cổng Triệu Hồi, Trụ Pha Lê, xác lính, lính sống) ->
 *   hiệu ứng đạn phép & nổ trên cùng -> nhãn cảnh báo trên lớp màn hình.
 */

import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTALS,
  THAP_DOORS,
  THAP_LANE_Y_MAX,
  THAP_LANE_Y_MIN,
} from '../../../shared/src';
import {
  ZERO_PADDING,
  screenToWorld,
  viewportSafeCenter,
  type Camera,
  type ViewportPadding,
} from './camera';
import { drawMiragineEffect } from './renderEffects';
import { renderLaneMinimap, type RenderLaneMinimapOpts } from './renderMinimap';
import { drawCrystalStructure, drawPortalDoor } from './renderStructures';
import { drawMiragineBackdrop, drawMiragineTerrain } from './renderTerrain';
import { drawUnitCorpse, drawUnitShadow, drawUnitSprite } from './renderUnits';
import { drawLabel } from './renderUtils';
import { preloadMiragineAssets } from './sprites';
import { thapStore } from './store';

export type { Camera, ViewportPadding } from './camera';
export { renderLaneMinimap, type RenderLaneMinimapOpts } from './renderMinimap';

/** Tham số vẽ một khung hình chiến trường Miragine War lên Canvas 2D. */
export interface RenderOpts {
  w: number;
  h: number;
  dpr: number;
  cam: Camera;
  pad?: ViewportPadding;
  bases: readonly [number, number][];
  doors?: readonly [number, number][];
  names: readonly string[];
  myIdx?: number;
  showAlert?: boolean;
}

interface DepthEntity {
  sortY: number;
  draw: () => void;
}

interface WorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const UNIT_CULL_MARGIN = 130;
const STRUCTURE_CULL_MARGIN = 240;
const ALERT_DURATION_MS = 2600;
const ALERT_FADE_MS = 400;
const WAVE_PULSE_WINDOW_S = 2;
const ALERT_FONT = '700 13px system-ui, -apple-system, "Segoe UI", sans-serif';

const depthEntities: DepthEntity[] = [];

function isInView(x: number, y: number, margin: number, bounds: WorldBounds): boolean {
  return (
    x + margin >= bounds.left &&
    x - margin <= bounds.right &&
    y + margin >= bounds.top &&
    y - margin <= bounds.bottom
  );
}

function isWavePulseActive(sideIdx: number, alive: boolean): boolean {
  if (!alive || !thapStore.frame) return false;
  if (thapStore.roundLeft <= 1) return true;
  if (
    thapStore.wave > 0 &&
    thapStore.roundTotalS > 0 &&
    thapStore.roundLeft >= thapStore.roundTotalS - WAVE_PULSE_WINDOW_S
  ) {
    return (thapStore.lastWaveUnits[sideIdx] ?? -1) !== 0;
  }
  return false;
}

function renderShadowsAndQueueUnits(
  ctx: CanvasRenderingContext2D,
  now: number,
  bounds: WorldBounds,
  entities: DepthEntity[],
): void {
  for (const u of thapStore.units.values()) {
    const pos = thapStore.interpPos(u, now);
    if (!isInView(pos.x, pos.y, UNIT_CULL_MARGIN, bounds)) continue;

    drawUnitShadow(ctx, u.kind, pos.x, pos.y);
    entities.push({
      sortY: pos.y,
      draw: () => drawUnitSprite(ctx, u, pos.x, pos.y, now),
    });
  }
}

function queueStructuresAndCorpses(
  ctx: CanvasRenderingContext2D,
  o: RenderOpts,
  now: number,
  bounds: WorldBounds,
  entities: DepthEntity[],
): void {
  const doors = o.doors && o.doors.length > 0 ? o.doors : THAP_DOORS;
  for (let i = 0; i < doors.length; i++) {
    const [dx, dy] = doors[i];
    if (!isInView(dx, dy, STRUCTURE_CULL_MARGIN, bounds)) continue;

    const alive = (thapStore.frame?.al[i] ?? 1) === 1;
    const wavePulse = isWavePulseActive(i, alive);
    entities.push({
      sortY: dy + 4,
      draw: () => drawPortalDoor(ctx, i, dx, dy, now, wavePulse),
    });
  }

  const bases = o.bases.length > 0 ? o.bases : THAP_CRYSTALS;
  for (let i = 0; i < bases.length; i++) {
    const [cx, cy] = bases[i];
    if (!isInView(cx, cy, STRUCTURE_CULL_MARGIN, bounds)) continue;

    const hpPct = thapStore.baseHp[i] ?? 100;
    const hitAt = thapStore.baseHitAt[i] ?? 0;
    const alive = (thapStore.frame?.al[i] ?? 1) === 1;
    const label = o.names[i];
    entities.push({
      sortY: cy + 8,
      draw: () => drawCrystalStructure(ctx, i, cx, cy, hpPct, hitAt, alive, now, label),
    });
  }

  for (let i = 0; i < thapStore.effects.length; i++) {
    const e = thapStore.effects[i];
    if (e.kind !== 'death' || now - e.t0 > e.dur) continue;
    if (!isInView(e.x1, e.y1, UNIT_CULL_MARGIN, bounds)) continue;

    entities.push({
      sortY: e.y1,
      draw: () => drawUnitCorpse(ctx, e, now),
    });
  }
}

function renderEffectsPass(ctx: CanvasRenderingContext2D, now: number): void {
  const resolveTargetPos = (id: number) => {
    const u = thapStore.units.get(id);
    return u ? thapStore.interpPos(u, now) : undefined;
  };

  for (let i = 0; i < thapStore.effects.length; i++) {
    const e = thapStore.effects[i];
    if (e.kind === 'death') continue;
    drawMiragineEffect(ctx, e, now, resolveTargetPos);
  }
}

function renderAlertOverlay(
  ctx: CanvasRenderingContext2D,
  now: number,
  safeCenterX: number,
  padTop: number,
): void {
  const alert = thapStore.alert;
  if (!alert) return;

  const age = now - alert.at;
  if (age < 0 || age >= ALERT_DURATION_MS) return;

  const remaining = ALERT_DURATION_MS - age;
  const alpha = remaining < ALERT_FADE_MS ? Math.max(0, remaining / ALERT_FADE_MS) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  drawLabel(ctx, alert.text, safeCenterX, padTop + 14, {
    color: '#fff5f5',
    bg: 'rgba(180, 24, 28, 0.9)',
    font: ALERT_FONT,
  });
  ctx.restore();
}

/**
 * Vẽ toàn bộ cảnh chiến trường Miragine War vào `ctx` ở độ phân giải HiDPI `o.dpr`.
 * Thực hiện đầy đủ 9 bước: phông nền -> biến đổi camera theo vùng an toàn -> địa hình ->
 * bóng lính -> sắp xếp thực thể theo trục Y -> hiệu ứng đạn/nổ -> cảnh báo màn hình.
 */
export function renderScene(ctx: CanvasRenderingContext2D, o: RenderOpts): void {
  if (!Number.isFinite(o.w) || !Number.isFinite(o.h) || o.w <= 0 || o.h <= 0) return;

  preloadMiragineAssets();

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const pad = o.pad ?? ZERO_PADDING;
  const dpr = Number.isFinite(o.dpr) && o.dpr > 0 ? o.dpr : 1;
  const mapW = thapStore.mapW || THAP_ARENA_W;
  const mapH = thapStore.mapH || THAP_ARENA_H;
  const safeCam: Camera = {
    x: Number.isFinite(o.cam.x) ? o.cam.x : mapW * 0.5,
    y: Number.isFinite(o.cam.y) ? o.cam.y : mapH * 0.5,
    zoom: Number.isFinite(o.cam.zoom) && o.cam.zoom > 0 ? o.cam.zoom : 1,
  };
  const safeCenter = viewportSafeCenter(o.w, o.h, pad);
  const topLeft = screenToWorld(0, 0, safeCam, o.w, o.h, pad);
  const bottomRight = screenToWorld(o.w, o.h, safeCam, o.w, o.h, pad);
  const bounds: WorldBounds = {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
  };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMiragineBackdrop(ctx, o.w, o.h);

  ctx.save();
  ctx.translate(safeCenter.x, safeCenter.y);
  ctx.scale(safeCam.zoom, safeCam.zoom);
  ctx.translate(-safeCam.x, -safeCam.y);

  drawMiragineTerrain(ctx, mapW, mapH, THAP_LANE_Y_MIN, THAP_LANE_Y_MAX);

  depthEntities.length = 0;
  queueStructuresAndCorpses(ctx, o, now, bounds, depthEntities);
  renderShadowsAndQueueUnits(ctx, now, bounds, depthEntities);

  depthEntities.sort((a, b) => a.sortY - b.sortY);
  for (let i = 0; i < depthEntities.length; i++) {
    depthEntities[i].draw();
  }
  depthEntities.length = 0;

  renderEffectsPass(ctx, now);
  ctx.restore();

  if (o.showAlert !== false) {
    renderAlertOverlay(ctx, now, safeCenter.x, pad.top);
  }
}

/** @deprecated Dùng `renderLaneMinimap` từ `./renderMinimap` trực tiếp. */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  mw: number,
  mh: number,
  dpr: number,
  cam: Camera,
  viewW: number,
  viewH: number,
  o?: Pick<RenderOpts, 'pad' | 'myIdx'>,
): void {
  if (!ctx.canvas) return;
  renderLaneMinimap(ctx.canvas, mw, mh, {
    cam,
    viewportW: viewW,
    viewportH: viewH,
    pad: o?.pad,
    dpr,
    myIdx: o?.myIdx,
  });
}
