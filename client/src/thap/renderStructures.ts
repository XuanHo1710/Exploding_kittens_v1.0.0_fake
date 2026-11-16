/**
 * Vẽ các công trình cố định Miragine War bằng Canvas 2D thuần (hỗ trợ sắp xếp theo trục Y):
 * - Cổng Triệu Hồi (`door.png`: `150 × 296`, Phe Đỏ trái vẽ nguyên bản mở sang phải; Phe Xanh phải lật ngang).
 * - Trụ Pha Lê Chính (`A_crystal.png` luôn thuộc Phe Đỏ `owner === 0`; `B_crystal.png` luôn thuộc Phe Xanh `owner === 1`).
 * - Đổ nát pha lê cháy xém khi bị phá hủy, hiệu ứng lóe trúng đòn, khói hư hại, thanh máu `drawHpBar` và nhãn phe.
 */

import { THAP_COLORS } from '../../../shared/src';
import { drawHpBar, drawLabel, rgba, shade } from './renderUtils';
import { MIRAGINE_STRUCTURES, getStructureImage, isDrawableReady, type StructureMeta } from './sprites';

const HIT_FLASH_MS = 180;
const SMOKE_HP_THRESHOLD = 55;
const CRYSTAL_HP_BAR_W = 86;
const CRYSTAL_HP_BAR_H = 8;
const CRYSTAL_HP_BAR_Y_OFFSET = -160;
const CRYSTAL_LABEL_Y_OFFSET = -174;
const LABEL_FONT = '700 11px system-ui, -apple-system, "Segoe UI", sans-serif';

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function unitPhase(now: number, periodMs: number, offset = 0): number {
  const raw = now / periodMs + offset;
  return raw - Math.floor(raw);
}

function teamPalette(owner: number): {
  readonly isBlue: boolean;
  readonly teamColor: string;
  readonly crystalKey: 'A_crystal' | 'B_crystal';
} {
  const isBlue = owner === 1;
  return {
    isBlue,
    teamColor: THAP_COLORS[isBlue ? 1 : 0],
    crystalKey: isBlue ? 'B_crystal' : 'A_crystal',
  };
}

function drawSmokePuffs(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  puffCount: number,
  maxAlpha: number,
  riseHeight: number,
  periodMs: number,
  spreadX: number,
  now: number,
  seed: number,
): void {
  for (let i = 0; i < puffCount; i++) {
    const t = unitPhase(now, periodMs, i / puffCount);
    const fade = Math.sin(t * Math.PI);
    const px = (hash(i * 7.3 + seed) - 0.5) * spreadX + Math.sin(now / 460 + i * 1.9) * 5 + t * 14;
    const py = baseY - (i % 2) * 14 - t * riseHeight;
    const radius = 6 + t * 14;

    ctx.fillStyle = `rgba(34, 34, 38, ${maxAlpha * fade})`;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPortalFallback(ctx: CanvasRenderingContext2D, teamColor: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(58, 62, 54, 0.92)';
  ctx.strokeStyle = 'rgba(20, 22, 18, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(-20, -45, 36, 56, 0, Math.PI, 0);
  ctx.lineTo(16, 14);
  ctx.lineTo(-56, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = rgba(teamColor, 0.35);
  ctx.beginPath();
  ctx.ellipse(-20, -42, 22, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPortalShimmer(
  ctx: CanvasRenderingContext2D,
  teamColor: string,
  owner: number,
  now: number,
  wavePulse: boolean,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 360 + owner * 1.7);
  const boost = wavePulse ? 1.55 : 1;
  const cx = -24;
  const cy = -48;
  const glowR = 40 * (wavePulse ? 1.18 : 1);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.62, 1.05);
  const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, glowR);
  grad.addColorStop(0, `rgba(210, 255, 232, ${(0.28 + 0.14 * pulse) * boost * 0.72})`);
  grad.addColorStop(0.45, rgba(teamColor, (0.18 + 0.1 * pulse) * boost));
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 3; i++) {
    const p = unitPhase(now, 1200, i / 3 + owner * 0.4);
    const mx = cx + Math.sin(p * Math.PI * 2 + i * 2.1) * 10;
    const my = cy + 26 - p * 54;
    const alpha = Math.sin(p * Math.PI) * (wavePulse ? 0.65 : 0.38);
    ctx.fillStyle = `rgba(225, 255, 240, ${alpha})`;
    ctx.beginPath();
    ctx.arc(mx, my, wavePulse ? 2.4 : 1.7, 0, Math.PI * 2);
    ctx.fill();
  }

  if (wavePulse) {
    const ringT = unitPhase(now, 650);
    ctx.strokeStyle = rgba(teamColor, 0.45 * (1 - ringT));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18 + ringT * 14, 34 + ringT * 18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCrystalAura(ctx: CanvasRenderingContext2D, teamColor: string, owner: number, now: number, bob: number): void {
  const shadowScale = 1 - bob * 0.015;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 38 * shadowScale, 13 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  const pulse = 0.72 + 0.28 * Math.sin(now / 420 + owner * 1.4);
  ctx.save();
  ctx.translate(0, 2);
  ctx.scale(1, 0.42);
  const auraGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 54);
  auraGrad.addColorStop(0, rgba(teamColor, 0.34 * pulse));
  auraGrad.addColorStop(0.65, rgba(teamColor, 0.14 * pulse));
  auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = rgba(teamColor, 0.52 * pulse);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 3, 40, 14, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCrystalFallback(ctx: CanvasRenderingContext2D, teamColor: string, bob: number): void {
  const cy = -64 + bob;
  ctx.save();
  ctx.fillStyle = teamColor;
  ctx.strokeStyle = shade(teamColor, 0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cy - 48);
  ctx.lineTo(28, cy - 10);
  ctx.lineTo(18, cy + 44);
  ctx.lineTo(0, cy + 58);
  ctx.lineTo(-18, cy + 44);
  ctx.lineTo(-28, cy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCrystalHitFlash(
  ctx: CanvasRenderingContext2D,
  crystalImg: HTMLImageElement | null,
  meta: StructureMeta,
  bob: number,
  hitElapsed: number,
): void {
  const strength = 1 - hitElapsed / HIT_FLASH_MS;
  const cy = -66 + bob;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  if (isDrawableReady(crystalImg)) {
    ctx.globalAlpha = 0.72 * strength;
    ctx.drawImage(crystalImg, meta.offX, meta.offY + bob, meta.w, meta.h);
  }

  ctx.globalAlpha = 1;
  const flashGrad = ctx.createRadialGradient(0, cy, 4, 0, cy, 56);
  flashGrad.addColorStop(0, `rgba(255, 252, 224, ${0.72 * strength})`);
  flashGrad.addColorStop(0.45, `rgba(255, 214, 102, ${0.34 * strength})`);
  flashGrad.addColorStop(1, 'rgba(255, 214, 102, 0)');
  ctx.fillStyle = flashGrad;
  ctx.beginPath();
  ctx.arc(0, cy, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Vẽ Cổng Triệu Hồi (`door.png`) tại chân `(x, y)` với đúng hướng mở vào chiến trường:
 * - Phe Đỏ trái (`owner === 0`): vẽ nguyên bản (mở sang phải).
 * - Phe Xanh phải (`owner === 1`): lật ngang `ctx.scale(-1, 1)` để cổng mở sang trái.
 */
export function drawPortalDoor(
  ctx: CanvasRenderingContext2D,
  owner: number,
  x: number,
  y: number,
  now: number,
  wavePulse = false,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const t = Number.isFinite(now) ? now : 0;
  const { teamColor } = teamPalette(owner);
  const doorMeta = MIRAGINE_STRUCTURES.door;
  const doorImg = getStructureImage('door');

  ctx.save();
  ctx.translate(x, y);
  if (owner === 1) {
    ctx.scale(-1, 1);
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(4, 18, 62, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isDrawableReady(doorImg)) {
    ctx.drawImage(doorImg, doorMeta.offX, doorMeta.offY, doorMeta.w, doorMeta.h);
  } else {
    drawPortalFallback(ctx, teamColor);
  }

  drawPortalShimmer(ctx, teamColor, owner, t, Boolean(wavePulse));
  ctx.restore();
}

/** Vẽ tàn tích Trụ Pha Lê cháy xém khi trụ đã bị phá hủy. */
export function drawCrystalRuins(
  ctx: CanvasRenderingContext2D,
  owner: number,
  x: number,
  y: number,
  now: number,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const t = Number.isFinite(now) ? now : 0;
  const { teamColor } = teamPalette(owner);

  ctx.save();
  ctx.translate(x, y);

  ctx.save();
  ctx.translate(0, 4);
  ctx.scale(1, 0.42);
  const scorch = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
  scorch.addColorStop(0, 'rgba(16, 12, 10, 0.78)');
  scorch.addColorStop(0.6, 'rgba(28, 22, 18, 0.45)');
  scorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = scorch;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const shardColor = shade(teamColor, -0.58);
  for (let i = 0; i < 18; i++) {
    const rx = (hash(i * 3.7 + owner) - 0.5) * 86;
    const ry = (hash(i * 5.1 + owner) - 0.5) * 28 + 4;
    const r = 3 + hash(i * 1.9 + owner) * 5;
    ctx.fillStyle = i % 5 === 0 ? shardColor : i % 2 === 0 ? '#2a2623' : '#413b36';
    ctx.beginPath();
    ctx.ellipse(rx, ry, r * 1.35, r * 0.85, hash(i + owner) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const stumps: readonly [number, number, number, number][] = [
    [-16, 2, -6, -24],
    [0, 5, 4, -30],
    [14, 2, 22, -20],
  ];
  for (const [bx, by, tx, ty] of stumps) {
    ctx.fillStyle = '#232020';
    ctx.strokeStyle = rgba(teamColor, 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - 7, by);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx + 7, by + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  drawSmokePuffs(ctx, -10, 3, 0.34, 72, 2400, 44, t, owner + 11);
  ctx.restore();
}

/**
 * Vẽ Trụ Pha Lê Chính của phe (`owner === 0` luôn dùng `A_crystal`, `owner === 1` luôn dùng `B_crystal`):
 * bao gồm bóng & hào quang phe, nhịp nhấp nhô, lóe trúng đòn (`180ms`), khói khi `hpPct < 55`,
 * thanh máu sắc nét (`drawHpBar`, không dùng `bar_frame.png`) và nhãn phe tùy chọn (`drawLabel`).
 */
export function drawCrystalStructure(
  ctx: CanvasRenderingContext2D,
  owner: number,
  x: number,
  y: number,
  hpPct: number,
  hitAt: number,
  alive: boolean,
  now: number,
  label?: string,
): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const t = Number.isFinite(now) ? now : 0;
  const safeHp = Number.isFinite(hpPct) ? Math.max(0, Math.min(100, hpPct)) : 0;

  if (!alive || safeHp <= 0) {
    drawCrystalRuins(ctx, owner, x, y, t);
    return;
  }

  const { teamColor, crystalKey } = teamPalette(owner);
  const meta = MIRAGINE_STRUCTURES[crystalKey];
  const crystalImg = getStructureImage(crystalKey);
  const bob = Math.sin(t / 480 + owner * 1.3) * 3;

  ctx.save();
  ctx.translate(x, y);

  drawCrystalAura(ctx, teamColor, owner, t, bob);

  if (isDrawableReady(crystalImg)) {
    ctx.drawImage(crystalImg, meta.offX, meta.offY + bob, meta.w, meta.h);
  } else {
    drawCrystalFallback(ctx, teamColor, bob);
  }

  const hitElapsed = Number.isFinite(hitAt) ? t - hitAt : -1;
  if (hitAt > 0 && hitElapsed >= 0 && hitElapsed < HIT_FLASH_MS) {
    drawCrystalHitFlash(ctx, crystalImg, meta, bob, hitElapsed);
  }

  if (safeHp < SMOKE_HP_THRESHOLD) {
    const puffCount = safeHp < 25 ? 6 : 3;
    const maxAlpha = safeHp < 25 ? 0.5 : 0.38;
    drawSmokePuffs(ctx, -44, puffCount, maxAlpha, 76, 1700, 44, t, owner + 1);
  }

  ctx.restore();

  const barX = x - CRYSTAL_HP_BAR_W * 0.5;
  const barY = y + CRYSTAL_HP_BAR_Y_OFFSET;
  drawHpBar(ctx, barX, barY, CRYSTAL_HP_BAR_W, CRYSTAL_HP_BAR_H, safeHp, teamColor);

  if (label && label.trim().length > 0) {
    drawLabel(ctx, label, x, y + CRYSTAL_LABEL_Y_OFFSET, {
      color: '#f8f9fa',
      bg: 'rgba(8, 10, 15, 0.74)',
      font: LABEL_FONT,
    });
  }
}
