/**
 * Bộ vẽ hiệu ứng đạn phép & nổ công trình chuẩn Miragine War:
 * - `'fb'` (`fireball.png`, 3x 32×32): frame 0 hướng TRÁI khi bay (xoay `ang + Math.PI` + đuôi tàn lửa),
 *   frame 1–2 dựng thẳng khi nổ kèm quầng sáng cam-vàng trong `BOOM_MS`.
 * - `'tb'` (`thunderball.png`, 16x 128×128): phát mượt 16 frame theo đường bay -> lóe tia sét tại đích.
 * - `'storm'` (`storm.png`, 9x 153×261): căn tâm `(-76, -130)` ngay tại điểm tác động `(x2, y2)`.
 * - `'rubble'`: mảnh pha lê & chớp sáng tỏa tròn khi Pha Lê Chính vỡ.
 */

import { THAP_COLORS } from '../../../shared/src';
import { MIRAGINE_PROJECTILES, getProjectileImage, isDrawableReady, type ProjectileMeta } from './sprites';
import { rgba } from './renderUtils';
import {
  THAP_FB_BOOM_MS,
  THAP_STORM_LINGER_MS,
  THAP_TB_LINGER_MS,
  type ThapEffect,
} from './store';

/** Thời gian duy trì hiệu ứng nổ sau va chạm (ms). */
export const BOOM_MS = THAP_FB_BOOM_MS;

const FB_ARC_HEIGHT = 14;
const TB_ARC_HEIGHT = 8;
const TB_LINGER_MS = THAP_TB_LINGER_MS;
const STORM_LINGER_MS = THAP_STORM_LINGER_MS;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function drawProjectileCell(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  meta: ProjectileMeta,
  frameIdx: number,
  pixelArt = false,
): void {
  const f = Math.max(0, Math.min(meta.frames - 1, Math.floor(frameIdx)));
  if (pixelArt) ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    f * meta.cellW,
    0,
    meta.cellW,
    meta.cellH,
    meta.centerOffX,
    meta.centerOffY,
    meta.cellW,
    meta.cellH,
  );
}

function shotPointAt(e: ThapEffect, p: number, arc: number): { x: number; y: number } {
  const q = clamp01(p);
  return {
    x: e.x1 + (e.x2 - e.x1) * q,
    y: e.y1 + (e.y2 - e.y1) * q - Math.sin(q * Math.PI) * arc,
  };
}

function shotTangentAngle(e: ThapEffect, p: number, arc: number): number {
  const tPrev = Math.max(0, Math.min(0.95, p - 0.05));
  const tNext = Math.min(1, tPrev + 0.05);
  const prev = shotPointAt(e, tPrev, arc);
  const next = shotPointAt(e, tNext, arc);
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

function drawFireballEmberTrail(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  p: number,
  arc: number,
): void {
  const crystal = Boolean(e.isCrystal);
  const baseAlpha = crystal ? 0.72 : 0.44;
  const baseRadius = crystal ? 5.2 : 3.6;

  ctx.save();
  for (let i = 1; i <= 5; i++) {
    const tp = p - i * 0.042;
    if (tp < 0) break;
    const pt = shotPointAt(e, tp, arc);
    const fade = 1 - i / 6;
    const r = Math.max(1, baseRadius * fade);
    ctx.fillStyle = i <= 2
      ? `rgba(255, 212, 92, ${baseAlpha * fade})`
      : `rgba(255, 108, 28, ${baseAlpha * fade * 0.85})`;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (crystal) {
    const head = shotPointAt(e, p, arc);
    const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 18);
    glow.addColorStop(0, 'rgba(255, 224, 120, 0.45)');
    glow.addColorStop(1, 'rgba(255, 92, 24, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 18, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFireballFallback(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createRadialGradient(-2, 0, 1, 0, 0, 11);
  grad.addColorStop(0, '#fff3bf');
  grad.addColorStop(0.55, '#ff922b');
  grad.addColorStop(1, 'rgba(224, 49, 49, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFireballEffect(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  age: number,
  dur: number,
): void {
  const p = age / dur;
  const meta = MIRAGINE_PROJECTILES.fb;
  const img = getProjectileImage('fb');

  if (p < 1) {
    const cur = shotPointAt(e, p, FB_ARC_HEIGHT);
    const ang = shotTangentAngle(e, p, FB_ARC_HEIGHT);
    const scale = e.isCrystal ? 1.2 : 1.0;

    drawFireballEmberTrail(ctx, e, p, FB_ARC_HEIGHT);

    ctx.save();
    ctx.translate(cur.x, cur.y);
    ctx.rotate(ang + Math.PI);
    ctx.scale(scale, scale);
    if (isDrawableReady(img)) {
      drawProjectileCell(ctx, img, meta, 0, true);
    } else {
      drawFireballFallback(ctx);
    }
    ctx.restore();
    return;
  }

  const boomAge = age - dur;
  if (boomAge > BOOM_MS) return;

  const b = clamp01(boomAge / BOOM_MS);
  const burstR = (e.isCrystal ? 44 : 34) * (0.4 + b * 0.75);

  ctx.save();
  const grad = ctx.createRadialGradient(e.x2, e.y2, 0, e.x2, e.y2, burstR);
  grad.addColorStop(0, `rgba(255, 244, 185, ${0.9 * (1 - b)})`);
  grad.addColorStop(0.5, `rgba(255, 138, 36, ${0.65 * (1 - b)})`);
  grad.addColorStop(1, 'rgba(215, 42, 16, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(e.x2, e.y2, burstR, 0, Math.PI * 2);
  ctx.fill();

  if (isDrawableReady(img)) {
    const frameIdx = b < 0.48 ? 1 : 2;
    const burstScale = (e.isCrystal ? 1.45 : 1.15) * (0.88 + b * 0.42);
    ctx.globalAlpha = b < 0.65 ? 1 : Math.max(0, (1 - b) / 0.35);
    ctx.translate(e.x2, e.y2);
    ctx.scale(burstScale, burstScale);
    drawProjectileCell(ctx, img, meta, frameIdx, true);
  }
  ctx.restore();
}

function drawThunderFlash(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lingerP: number,
  isCrystal?: boolean,
): void {
  const fade = 1 - lingerP;
  const r = (isCrystal ? 42 : 30) * (0.55 + lingerP * 0.65);

  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(224, 245, 255, ${0.72 * fade})`);
  grad.addColorStop(0.5, `rgba(77, 171, 247, ${0.48 * fade})`);
  grad.addColorStop(1, 'rgba(25, 113, 194, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(165, 216, 255, ${0.85 * fade})`;
  ctx.lineWidth = isCrystal ? 2 : 1.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + lingerP * 1.4;
    const inner = r * 0.35;
    const mid = r * 0.68;
    const outer = r * 0.98;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    ctx.lineTo(x + Math.cos(a + 0.18) * mid, y + Math.sin(a + 0.18) * mid);
    ctx.lineTo(x + Math.cos(a - 0.1) * outer, y + Math.sin(a - 0.1) * outer);
    ctx.stroke();
  }
}

function drawThunderFallback(ctx: CanvasRenderingContext2D, isCrystal?: boolean): void {
  const r = isCrystal ? 28 : 22;
  const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
  grad.addColorStop(0, 'rgba(240, 250, 255, 0.95)');
  grad.addColorStop(0.55, 'rgba(77, 171, 247, 0.8)');
  grad.addColorStop(1, 'rgba(25, 113, 194, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawThunderballEffect(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  age: number,
  dur: number,
): void {
  const totalDur = dur + TB_LINGER_MS;
  if (age > totalDur) return;

  const meta = MIRAGINE_PROJECTILES.tb;
  const img = getProjectileImage('tb');
  const p = age / dur;
  const inFlight = p < 1;
  const totalP = clamp01(age / totalDur);
  const frameIdx = Math.min(meta.frames - 1, Math.floor(totalP * meta.frames));
  const pos = inFlight ? shotPointAt(e, p, TB_ARC_HEIGHT) : { x: e.x2, y: e.y2 };
  const lingerP = inFlight ? 0 : clamp01((age - dur) / TB_LINGER_MS);
  const baseScale = e.isCrystal ? 0.65 : 0.48;
  const scale = inFlight ? baseScale : baseScale * (1 + lingerP * 0.16);
  const alpha = inFlight ? 1 : lingerP < 0.55 ? 1 : Math.max(0, (1 - lingerP) / 0.45);

  ctx.save();
  if (!inFlight) {
    drawThunderFlash(ctx, e.x2, e.y2, lingerP, e.isCrystal);
  }
  ctx.globalAlpha = alpha;
  ctx.translate(pos.x, pos.y);
  ctx.scale(scale, scale);
  if (isDrawableReady(img)) {
    drawProjectileCell(ctx, img, meta, frameIdx);
  } else {
    drawThunderFallback(ctx, e.isCrystal);
  }
  ctx.restore();
}

function drawStormFallback(ctx: CanvasRenderingContext2D, totalP: number): void {
  const fade = 1 - totalP;
  const r = 46 * (0.4 + totalP * 0.7);
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
  grad.addColorStop(0, `rgba(224, 248, 255, ${0.85 * fade})`);
  grad.addColorStop(0.55, `rgba(77, 171, 247, ${0.55 * fade})`);
  grad.addColorStop(1, 'rgba(25, 113, 194, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.35, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawStormEffect(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  age: number,
  dur: number,
): void {
  const totalDur = dur + STORM_LINGER_MS;
  if (age > totalDur) return;

  const meta = MIRAGINE_PROJECTILES.storm;
  const img = getProjectileImage('storm');
  const totalP = clamp01(age / totalDur);
  const frameIdx = Math.min(meta.frames - 1, Math.floor(totalP * meta.frames));
  const alpha = totalP > 0.78 ? Math.max(0, (1 - totalP) / 0.22) : 1;
  const scale = 0.68;

  ctx.save();
  const ringAlpha = Math.max(0, (1 - totalP) * 0.45);
  if (ringAlpha > 0.01) {
    ctx.strokeStyle = `rgba(116, 192, 252, ${ringAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(e.x2, e.y2 + 12, 26 + totalP * 32, 10 + totalP * 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalAlpha = alpha;
  ctx.translate(e.x2, e.y2);
  ctx.scale(scale, scale);
  if (isDrawableReady(img)) {
    drawProjectileCell(ctx, img, meta, frameIdx);
  } else {
    drawStormFallback(ctx, totalP);
  }
  ctx.restore();
}

function drawCrystalShatterEffect(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  age: number,
  dur: number,
): void {
  const p = age / dur;
  if (p > 1) return;

  const owner = e.unitOwner === 1 ? 1 : 0;
  const shardHex = THAP_COLORS[owner] ?? '#e03131';
  const brightHex = owner === 1 ? '#a5d8ff' : '#ffc9c9';
  const cx = e.x1;
  const cy = e.y1 - 18;

  ctx.save();

  const flash = Math.max(0, 1 - p * 4.2);
  if (flash > 0) {
    const flashR = 115 * (0.45 + (1 - flash) * 0.8);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
    grad.addColorStop(0, `rgba(255, 250, 225, ${0.9 * flash})`);
    grad.addColorStop(0.45, rgba(brightHex, 0.72 * flash));
    grad.addColorStop(1, rgba(shardHex, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (p < 0.45) {
    const rp = p / 0.45;
    ctx.strokeStyle = rgba(brightHex, 0.75 * (1 - rp));
    ctx.lineWidth = 3 * (1 - rp) + 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 24 + rp * 110, 12 + rp * 52, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const shardCount = 16;
  const fade = Math.max(0, 1 - p);
  for (let i = 0; i < shardCount; i++) {
    const angle = (i / shardCount) * Math.PI * 2 + (i % 3) * 0.22;
    const speed = 78 + (i % 4) * 26;
    const dist = speed * Math.pow(p, 0.72);
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist * 0.72 - Math.sin(p * Math.PI) * 18 + p * p * 26;
    const size = (1 - p * 0.55) * (6 + (i % 3) * 3);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle + p * (i % 2 === 0 ? 4.2 : -4.2));
    ctx.fillStyle = i % 2 === 0 ? rgba(shardHex, 0.9 * fade) : rgba(brightHex, 0.92 * fade);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 * fade})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.35, -size * 0.48);
    ctx.lineTo(-size * 0.8, 0);
    ctx.lineTo(-size * 0.35, size * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Vẽ một hiệu ứng đạn phép (`fb`, `tb`, `storm`) hoặc nổ Pha Lê Chính (`rubble`) của Miragine War.
 * Nếu hiệu ứng đang bám mục tiêu (`e.target !== undefined`), tự cập nhật `(e.x2, e.y2)` theo tọa độ sống.
 */
export function drawMiragineEffect(
  ctx: CanvasRenderingContext2D,
  e: ThapEffect,
  now: number,
  resolveTargetPos?: (id: number) => { x: number; y: number } | undefined,
): void {
  if (e.target !== undefined && resolveTargetPos) {
    const tp = resolveTargetPos(e.target);
    if (tp) {
      e.x2 = tp.x;
      e.y2 = tp.y - 16;
    }
  }

  const age = now - e.t0;
  if (age < 0) return;
  const dur = Math.max(1, e.dur);

  switch (e.kind) {
    case 'fb':
      drawFireballEffect(ctx, e, age, dur);
      break;
    case 'tb':
      drawThunderballEffect(ctx, e, age, dur);
      break;
    case 'storm':
      drawStormEffect(ctx, e, age, dur);
      break;
    case 'rubble':
      drawCrystalShatterEffect(ctx, e, age, dur);
      break;
    case 'death':
      break;
  }
}
