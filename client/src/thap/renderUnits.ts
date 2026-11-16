/**
 * Bộ vẽ binh chủng Miragine War 1:1 sắc nét theo từng điểm ảnh:
 * - Bóng đổ tiếp đất (`shadow.png`) theo kích thước binh chủng.
 * - Hoạt ảnh `idle` / `run` / `attack` đúng hướng gốc (`nativeFacingDirection: "left"`) và phe (`A`/`B` theo `owner`).
 * - Thanh máu sắc nét dùng `drawHpBar` (tuyệt đối không vẽ `bar_frame.png` lên lính).
 * - Xác lính ngã xuống (`{A|B}{ss}_dead`) phát hết chuỗi frame, giữ dáng nằm và mờ dần trước khi biến mất.
 */

import {
  THAP_COLORS,
  THAP_FLAG_ATTACKING,
  THAP_FLAG_LEFT,
  THAP_FLAG_MOVING,
  THAP_SIM_FPS,
  THAP_UNITS,
  type ThapUnitKind,
  type ThapUnitStats,
} from '../../../shared/src';
import { miragineAnimKey, type MiragineAct } from './animMeta';
import { drawHpBar, shade } from './renderUtils';
import {
  MIRAGINE_ANIMS,
  MIRAGINE_STRUCTURES,
  drawMiragineSheetFrame,
  getStructureImage,
} from './sprites';
import type { ThapEffect, ThapUnitState } from './store';

const SHADOW_ALPHA = 0.52;
const SHADOW_OFFSET_Y = 2;
const SHADOW_WIDE_KINDS: ReadonlySet<ThapUnitKind> = new Set([
  'cavalry',
  'ironknight',
  'dreadlord',
  'highlord',
]);

const CORPSE_FRAME_MS = 115;
const CORPSE_FADE_MS = 250;
const MIN_ATTACK_DUR_MS = 260;
const RUN_FRAME_MS = 95;
const IDLE_FRAME_MS = 220;
const DEFAULT_FRAMES = 3;
const DEFAULT_CELL_H = 52;

function unitShadowScale(kind: ThapUnitKind): { sx: number; sy: number } {
  const spec = THAP_UNITS[kind] ?? THAP_UNITS.newbie;
  const base = 0.82 + Math.max(0, spec.radius - 9) * 0.06;
  const wideMult = SHADOW_WIDE_KINDS.has(kind) ? 1.16 : 1;
  return {
    sx: base * wideMult,
    sy: Math.min(1.15, base * 0.96),
  };
}

function normalizeFrame(rawIdx: number, frames: number): number {
  if (frames <= 1) return 0;
  return ((Math.floor(rawIdx) % frames) + frames) % frames;
}

function unitOwnerColor(owner: number): string {
  return owner === 1 ? THAP_COLORS[1] : THAP_COLORS[0];
}

function resolveUnitAnim(
  spec: ThapUnitStats,
  u: ThapUnitState,
  now: number,
  moving: boolean,
  attackingFlag: boolean,
): { key: string; frameIdx: number; cellH: number } {
  const attackDurMs = Math.max(
    MIN_ATTACK_DUR_MS,
    (spec.delayAttack + Math.min(8, spec.weaponFrames)) * (1000 / THAP_SIM_FPS),
  );
  const elapsedAtk = now - u.atkAt;
  const isAttacking = u.atkAt > 0 && (attackingFlag || elapsedAtk < attackDurMs);

  const act: MiragineAct = isAttacking ? 'attack' : moving ? 'run' : 'idle';
  const key = miragineAnimKey(u.owner, spec.ss, act);
  const meta = MIRAGINE_ANIMS[key];
  const frames = meta ? meta[0] : DEFAULT_FRAMES;
  const cellH = meta ? meta[2] : DEFAULT_CELL_H;

  let frameIdx = 0;
  if (act === 'attack') {
    const progress = Math.min(0.999, Math.max(0, elapsedAtk / attackDurMs));
    frameIdx = Math.floor(progress * frames);
  } else if (act === 'run') {
    frameIdx = normalizeFrame(now / RUN_FRAME_MS + u.phase * 1.4, frames);
  } else {
    frameIdx = normalizeFrame(now / IDLE_FRAME_MS + u.id * 1.7, frames);
  }

  return { key, frameIdx, cellH };
}

function drawUnitFallbackCircle(
  ctx: CanvasRenderingContext2D,
  owner: number,
  radius: number,
  x: number,
  y: number,
  drawScale: number,
): void {
  const color = unitOwnerColor(owner);
  const r = Math.max(6, radius * 0.8 * drawScale);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y - r - 2 * drawScale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawUnitHpBar(
  ctx: CanvasRenderingContext2D,
  u: ThapUnitState,
  radius: number,
  cellH: number,
  x: number,
  y: number,
  drawScale: number,
): void {
  if (u.hp >= 100) return;
  const barW = Math.round(Math.max(24, Math.min(44, radius * 2.1)));
  const barH = 4;
  const barY = Math.round(y - Math.max(36, Math.round(cellH * 0.78 * drawScale)));
  const barX = Math.round(x - barW * 0.5);
  const fillColor = u.owner === 0 ? '#ff5252' : '#4dabf7';
  drawHpBar(ctx, barX, barY, barW, barH, u.hp, fillColor);
}

/** Vẽ bóng đổ dưới chân binh chủng (`shadow.png`) tại `(x, y + 2)` ở độ mờ `0.52`. */
export function drawUnitShadow(
  ctx: CanvasRenderingContext2D,
  kind: ThapUnitKind,
  x: number,
  y: number,
): void {
  const meta = MIRAGINE_STRUCTURES.shadow;
  const { sx, sy } = unitShadowScale(kind);
  const w = meta.w * sx;
  const h = meta.h * sy;
  const anchorY = y + SHADOW_OFFSET_Y;
  const shadowImg = getStructureImage('shadow');

  ctx.save();
  ctx.globalAlpha *= SHADOW_ALPHA;
  if (shadowImg) {
    ctx.drawImage(shadowImg, x + meta.offX * sx, anchorY + meta.offY * sy, w, h);
  } else {
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x, anchorY, w * 0.45, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Vẽ sprite binh chủng Miragine War tại tọa độ chân `(x, y)` cùng thanh máu khi bị thương (`hp < 100`).
 * Luôn chọn sheet `A`/`B` theo `u.owner` (`owner === 1 ? 'B' : 'A'`) và truyền thẳng `left` vào `drawMiragineSheetFrame`.
 */
export function drawUnitSprite(
  ctx: CanvasRenderingContext2D,
  u: ThapUnitState,
  x: number,
  y: number,
  now: number,
  drawScale = 1,
): void {
  const spec = THAP_UNITS[u.kind] ?? THAP_UNITS.newbie;
  const moving = (u.flags & THAP_FLAG_MOVING) !== 0;
  const attackingFlag = (u.flags & THAP_FLAG_ATTACKING) !== 0;
  const left = (u.flags & THAP_FLAG_LEFT) !== 0;

  const { key, frameIdx, cellH } = resolveUnitAnim(spec, u, now, moving, attackingFlag);
  const drawn = drawMiragineSheetFrame(ctx, key, frameIdx, x, y, left, drawScale);
  if (!drawn) {
    drawUnitFallbackCircle(ctx, u.owner, spec.radius, x, y, drawScale);
  }

  drawUnitHpBar(ctx, u, spec.radius, cellH, x, y, drawScale);
}

/**
 * Vẽ hoạt ảnh xác lính ngã xuống (`{A|B}{ss}_dead`):
 * - Phát hết các frame chết trong `frames * 115ms` đầu, giữ frame nằm cuối,
 *   và làm mờ dần `globalAlpha` trong `250ms` cuối của `eff.dur`.
 * - Trả về `false` nếu hiệu ứng đã hết hạn (`now - eff.t0 > eff.dur`).
 */
export function drawUnitCorpse(
  ctx: CanvasRenderingContext2D,
  eff: ThapEffect,
  now: number,
  drawScale = 1,
): boolean {
  const age = now - eff.t0;
  if (age > eff.dur || eff.dur <= 0) return false;

  const safeAge = Math.max(0, age);
  const kind = eff.unitKind ?? 'newbie';
  const spec = THAP_UNITS[kind] ?? THAP_UNITS.newbie;
  const owner = eff.unitOwner ?? 0;
  const key = miragineAnimKey(owner, spec.ss, 'dead');
  const meta = MIRAGINE_ANIMS[key];
  const frames = meta ? meta[0] : DEFAULT_FRAMES;

  const frameIdx = Math.min(frames - 1, Math.floor(safeAge / CORPSE_FRAME_MS));
  const fadeWindow = Math.min(CORPSE_FADE_MS, eff.dur);
  const remaining = eff.dur - safeAge;
  const alpha = remaining < fadeWindow ? Math.max(0, remaining / fadeWindow) : 1;

  ctx.save();
  ctx.globalAlpha *= alpha;
  const drawn = drawMiragineSheetFrame(
    ctx,
    key,
    frameIdx,
    eff.x1,
    eff.y1,
    eff.left ?? false,
    drawScale,
  );
  if (!drawn) {
    ctx.fillStyle = unitOwnerColor(owner);
    ctx.beginPath();
    ctx.ellipse(eff.x1, eff.y1, 12 * drawScale, 5 * drawScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return true;
}
