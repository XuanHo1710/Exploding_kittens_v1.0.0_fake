/**
 * 60 FPS Diagonal 2D Pixel Battle Canvas Renderer (`battleRenderer.ts`)
 * - Logical viewport: `780x360` (`imageSmoothingEnabled = false`)
 * - 8-frame living `ambient-anim.png` backdrop
 * - Heroes (192px BACK, 6 rows), Gatekeepers / monsters / animals (192px FRONT, 4 rows), Bosses (256px, 6 rows)
 * - Per-unit pose overrides (attack / hurt / parry / dodge / faint), status icons with stacks,
 *   Resonance pips, enemy intent target markers, charge-up aura.
 * - Strict z-layering: enemy telegraph warnings ALWAYS render above player VFX (`FR-013`).
 */

import {
  STATUS_DEFS,
  type BattleSessionState,
  type CombatantRuntime,
  type StatusId,
  type TurnResolutionEvent,
} from '../../../shared/src';
import { getCachedImage, loadExpeditionImage } from './assetLoader';
import { drawBattleStatusIcons } from './battle-status';

export const BATTLE_CANVAS_W = 780;
export const BATTLE_CANVAS_H = 360;

export interface FloatingCombatPopup {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  bornMs: number;
  durationMs: number;
  big?: boolean;
}

export interface ActiveVisualPlayback {
  kind: 'player_skill' | 'player_item' | 'enemy_turn';
  actorUid: string;
  targetUid?: string;
  vfxKey?: string;
  heroPoseOverrides: Record<string, { row: number; startedMs: number }>;
  enemyPoseOverrides: Record<string, { row: number; startedMs: number }>;
  fxTargets: string[];
  riposteHeroUid?: string;
  riposteTargetUid?: string;
  startedMs: number;
  durationMs: number;
}

export interface BattleVisualState {
  popups: FloatingCombatPopup[];
  nextPopupId: number;
  playback: ActiveVisualPlayback | null;
  phaseBanner: { titleVi: string; untilMs: number } | null;
  telegraphBanner: { moveNameVi: string; detailVi: string } | null;
  shakeUntilMs: number;
  flashUntilMs: number;
  flashColor: string;
  motion?: { actorUid: string; targetUids: string[]; startMs: number; beats: readonly number[]; melee: boolean; cast?: boolean; anim?: string; skillId?: string };
  response?: { targetUids: string[]; row: 3 | 4; at: number; landed: boolean };
  /** sân khấu 3D (three.js) khi bật; lớp phủ 2D khi đó được chiếu theo camera 3D */
  view3d?: Battle3DView;
  /** HUD báo cho camera biết ai đang được chọn ra đòn và đang nhắm ai */
  /** kỹ năng anh hùng vừa tung (để sân khấu 3D chọn hiệu ứng hỗ trợ) */
  castSkillId?: string;
  cameraFocus?: { actorUid?: string; targetUid?: string; menu: boolean; mode?: 'command' | 'skills' | 'items' | 'aim' };
}

/** Tư thế vẽ của một đơn vị trong khung hiện tại (dùng chung cho 2D và 3D). */
export interface UnitPose {
  unit: CombatantRuntime;
  sheetPath?: string;
  cell: number;
  rows: number;
  row: number;
  frame: number;
  drawW: number;
  /** vị trí bàn chân tính từ đáy ô vẽ (0..1) */
  footFrac: number;
  home: { x: number; y: number };
  lunge: { x: number; y: number };
  lift: number;
  alpha: number;
  moving: boolean;
}

export interface Battle3DView {
  frame(now: number, session: BattleSessionState, vis: BattleVisualState, poses: readonly UnitPose[]): void;
  /** vị trí bàn chân của đơn vị chiếu về tọa độ canvas 780×360 kèm hệ số tỉ lệ */
  project(uid: string): { x: number; y: number; s: number } | null;
}

export function createBattleVisualState(): BattleVisualState {
  return {
    popups: [],
    nextPopupId: 1,
    playback: null,
    phaseBanner: null,
    telegraphBanner: null,
    shakeUntilMs: 0,
    flashUntilMs: 0,
    flashColor: '#fff',
  };
}

function isBossUnit(session: BattleSessionState, u: CombatantRuntime): boolean {
  return Boolean(u.isBoss) || (session.encounterKind === 'boss' && u.side === 'enemy');
}

export function getCombatantScreenAnchor(session: BattleSessionState, unit: CombatantRuntime): { x: number; y: number } {
  if (unit.side === 'party') {
    const party = session.combatants.filter((c) => c.side === 'party');
    const idx = Math.max(0, party.findIndex((p) => p.unitUid === unit.unitUid));
    const coords: readonly [number, number][] = [
      [211, 226],
      [270, 265],
      [183, 296],
      [325, 303],
    ];
    const [x, y] = coords[idx % coords.length];
    return { x, y };
  }
  const enemies = session.combatants.filter((c) => c.side === 'enemy');
  const idx = Math.max(0, enemies.findIndex((e) => e.unitUid === unit.unitUid));
  if (session.encounterKind === 'boss') return { x: 546, y: 196 };
  const coords: readonly [number, number][] = [
    [514, 176],
    [585, 211],
    [474, 235],
  ];
  const [x, y] = coords[idx % coords.length];
  return { x, y };
}

/** Quái "to" (gác cổng, trùm) dùng thanh máu lớn giữa trên; quái thường dùng thanh trên đầu. */
export function isBigEnemy(session: BattleSessionState, u: CombatantRuntime): boolean {
  return u.side === 'enemy' && (isBossUnit(session, u) || !u.isMinion);
}

function drawHeadBar(ctx: CanvasRenderingContext2D, u: CombatantRuntime, x: number, y: number, targeted: boolean, now: number): void {
  const w = 58;
  const left = Math.round(x - w / 2);
  const top = Math.round(y);
  if (targeted) {
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#09090b';
    ctx.fillText(u.nameVi, x + 1, top - 5);
    ctx.fillStyle = '#f2d896';
    ctx.fillText(u.nameVi, x, top - 6);
    const bob = Math.round(Math.sin(now / 160) * 2);
    ctx.fillStyle = '#f2d896';
    ctx.beginPath();
    ctx.moveTo(x - 5, top - 22 + bob);
    ctx.lineTo(x + 5, top - 22 + bob);
    ctx.lineTo(x, top - 16 + bob);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(7, 7, 10, 0.85)';
  ctx.fillRect(left - 1, top - 1, w + 2, 8);
  ctx.fillStyle = '#3a1512';
  ctx.fillRect(left, top, w, 4);
  ctx.fillStyle = targeted ? '#ec6b55' : '#c2382f';
  ctx.fillRect(left, top, Math.round(w * Math.max(0, u.hp / u.maxHp)), 4);
  ctx.fillStyle = '#a87a2a';
  ctx.fillRect(left, top + 5, Math.round(w * Math.max(0, Math.min(1, u.breakGauge / Math.max(1, u.maxBreak)))), 1);
  if (targeted) {
    ctx.strokeStyle = '#f2d896';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 1.5, top - 1.5, w + 3, 9);
  }
}

const FX_TINT: Record<string, string> = {
  verdant: '#7dffa8', frost: '#9fdcff', solar: '#ffe07a', tide: '#6fe7ff', pyre: '#ff8a4c', astral: '#d59bff',
};

/** Số giả ngẫu nhiên ổn định theo hạt giống (để tia sét không nhảy loạn mỗi khung). */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bolt(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, seed: number, spread: number, depth: number): void {
  const segs = 9;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (hash(seed + i) - 0.5) * spread * Math.sin(t * Math.PI);
    const x = x1 + (x2 - x1) * t + off;
    const y = y1 + (y2 - y1) * t;
    ctx.lineTo(x, y);
    if (depth > 0 && hash(seed + i * 7) > 0.72) {
      ctx.stroke();
      bolt(ctx, x, y, x + (hash(seed + i * 3) - 0.5) * 70, y + 26 + hash(seed + i) * 30, seed + i * 31, spread * 0.5, depth - 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function spikes(ctx: CanvasRenderingContext2D, x: number, y: number, count: number, inner: number, outer: number, seed: number): void {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hash(seed + i) * 0.3;
    const len = outer * (0.55 + hash(seed + i * 5) * 0.45);
    const w = 0.09;
    ctx.moveTo(x + Math.cos(a - w) * inner, y + Math.sin(a - w) * inner);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a + w) * inner, y + Math.sin(a + w) * inner);
  }
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.12, y - r * 0.12);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.12, y + r * 0.12);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.12, y + r * 0.12);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.12, y - r * 0.12);
  ctx.closePath();
  ctx.fill();
}

/** Hiệu ứng kỹ năng nét trắng kiểu truyện tranh, viền màu nguyên tố. */
function drawSkillFx(ctx: CanvasRenderingContext2D, style: string, tint: string, x: number, y: number, p: number, now: number, seed: number): void {
  if (p < 0.18 || p > 0.98) return;
  const k = (p - 0.18) / 0.8; // 0..1
  const fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const glow = (fn: () => void, width: number) => {
    ctx.globalAlpha = 0.55 * fade;
    ctx.strokeStyle = tint;
    ctx.fillStyle = tint;
    ctx.lineWidth = width * 2.6;
    fn();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = width;
    fn();
  };
  const flick = Math.floor(now / 55);
  if (style === 'ray') {
    // sét giáng từ trời xuống mục tiêu, nhiều nhánh
    glow(() => bolt(ctx, x + (hash(seed) - 0.5) * 60, -10, x, y + 20, seed + flick * 13, 46, 2), 2.2);
    glow(() => spikes(ctx, x, y + 24, 14, 5, 34 + k * 26, seed + 5), 1);
  } else if (style === 'meteor') {
    // nổ gai tỏa tia + vòng xung chấn
    glow(() => spikes(ctx, x, y + 10, 22, 8, 30 + k * 70, seed), 1);
    glow(() => { ctx.beginPath(); ctx.ellipse(x, y + 46, 20 + k * 90, 6 + k * 22, 0, 0, Math.PI * 2); ctx.stroke(); }, 2);
    glow(() => sparkle(ctx, x, y, 14 + (1 - k) * 22), 1);
  } else if (style === 'wave') {
    // các vòng sóng loang ra + xoáy
    for (let i = 0; i < 3; i++) {
      const r = ((k * 1.4 + i * 0.28) % 1) * 92 + 10;
      glow(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }, 1.6);
    }
    glow(() => {
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.2) {
        const r = 4 + a * 4.2;
        const ang = a + now / 160;
        const px = x + Math.cos(ang) * r;
        const py = y + Math.sin(ang) * r * 0.8;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }, 1.4);
  } else if (style === 'sigil') {
    // vòng phù chú xoay dưới chân + cột sáng
    const rot = now / 520;
    const cy = y + 58;
    glow(() => {
      ctx.beginPath();
      ctx.ellipse(x, cy, 62, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x, cy, 48, 14, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * Math.PI * 2;
        const b = rot + ((i + 2) / 6) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a) * 48, cy + Math.sin(a) * 14);
        ctx.lineTo(x + Math.cos(b) * 48, cy + Math.sin(b) * 14);
      }
      ctx.stroke();
    }, 1.2);
    glow(() => { ctx.fillRect(x - 3 - k * 6, -10, 6 + k * 12, cy + 10); }, 1);
    glow(() => sparkle(ctx, x, y - 10, 10 + k * 26), 1);
  } else {
    // chém chéo hình chữ X + tia sáng chữ thập
    const len = 34 + k * 40;
    glow(() => {
      ctx.beginPath();
      ctx.moveTo(x - len, y - len * 0.7);
      ctx.lineTo(x + len, y + len * 0.7);
      ctx.stroke();
      if (k > 0.2) {
        ctx.beginPath();
        ctx.moveTo(x + len, y - len * 0.7);
        ctx.lineTo(x - len, y + len * 0.7);
        ctx.stroke();
      }
    }, 2.4 * (1 - k * 0.6));
    glow(() => spikes(ctx, x, y, 12, 4, 20 + k * 34, seed + 9), 1);
    glow(() => sparkle(ctx, x, y, 8 + (1 - k) * 26), 1);
  }
  ctx.restore();
}

function nearestBeatOffset(motion: NonNullable<BattleVisualState['motion']>, now: number): number {
  let best = Infinity;
  for (const beat of motion.beats) {
    const off = now - (motion.startMs + beat);
    if (Math.abs(off) < Math.abs(best)) best = off;
  }
  return best;
}

function drawGlint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.2, y - r * 0.2);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.2, y + r * 0.2);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.2, y + r * 0.2);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.2, y - r * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, melee: boolean): void {
  const k = Math.max(0, Math.min(1, t));
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = melee ? '#fff2d0' : '#ffd0e6';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 5 - i * 1.6;
    ctx.beginPath();
    ctx.arc(x + 10 + i * 3, y - 6 + i * 2, 30 + i * 6, Math.PI * (1.05 + k * 0.15), Math.PI * (1.05 + 0.75 + k * 0.15));
    ctx.stroke();
  }
  ctx.restore();
}

/** Khiên hộ thể: một chiếc khiên kim loại lơ lửng cạnh nhân vật, phía trước có màn chắn ánh sáng. */
function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, now: number): void {
  const bob = Math.sin(now / 420) * 2;
  const shimmer = 0.5 + 0.5 * Math.sin(now / 260);
  // màn chắn hướng về phía địch
  ctx.save();
  ctx.globalAlpha = 0.22 + shimmer * 0.12;
  ctx.strokeStyle = '#9fd3ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x - 4, y - 62, 62, -0.95, 0.95);
  ctx.stroke();
  ctx.globalAlpha = 0.1 + shimmer * 0.06;
  ctx.fillStyle = '#9fd3ff';
  ctx.beginPath();
  ctx.arc(x - 4, y - 62, 62, -0.95, 0.95);
  ctx.arc(x - 4, y - 62, 50, 0.95, -0.95, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // khiên
  const sx = x + 46;
  const sy = y - 66 + bob;
  const w = 13;
  const h = 18;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx - w, sy - h);
  ctx.lineTo(sx + w, sy - h);
  ctx.lineTo(sx + w, sy - 2);
  ctx.quadraticCurveTo(sx + w, sy + h * 0.7, sx, sy + h);
  ctx.quadraticCurveTo(sx - w, sy + h * 0.7, sx - w, sy - 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(sx - w, sy - h, sx + w, sy + h);
  g.addColorStop(0, '#d9ecfb');
  g.addColorStop(0.45, '#5f94c3');
  g.addColorStop(1, '#1d3d5f');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e9c77b';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#1b1726';
  ctx.stroke();
  // gờ giữa + ánh kim chạy qua
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(sx, sy - h + 3);
  ctx.lineTo(sx, sy + h - 4);
  ctx.stroke();
  const sweep = ((now / 900) % 1) * (h * 2 + 10) - h - 5;
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx - w + 2, sy + sweep, w * 2 - 4, 2);
  ctx.globalAlpha = 1;
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#09090b';
  ctx.fillText(String(value), sx + 1, sy + h + 13);
  ctx.fillStyle = '#cfe9ff';
  ctx.fillText(String(value), sx, sy + h + 12);
  ctx.restore();
}

function nearestPose(poses: readonly UnitPose[], x: number, y: number): UnitPose | undefined {
  let best: UnitPose | undefined;
  let bestD = Infinity;
  for (const p of poses) {
    const d = Math.hypot(p.home.x - x, (p.home.y - y) * 0.6);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function enemyPose(session: BattleSessionState, vis: BattleVisualState, enemy: CombatantRuntime, nowMs: number, index: number, idleFrame6: number): UnitPose {
  const home = getCombatantScreenAnchor(session, enemy);
  const motion = enemy.alive ? motionPose(session, vis, enemy, nowMs) : undefined;
  const boss = isBossUnit(session, enemy);
  const rows = boss ? ROW.boss : ROW.enemy4;
  let row: number = rows.idle;
  let frame = (idleFrame6 + index * 2) % 6;
  const ov = vis.playback?.enemyPoseOverrides[enemy.unitUid];
  if (!enemy.alive) {
    row = rows.dead;
    frame = ov ? Math.min(5, Math.floor((nowMs - ov.startedMs) / 110)) : 5;
  } else if (enemy.staggerTurns > 0 || (enemy.statuses ?? []).some((s) => s.id === 'stun')) {
    row = rows.hurt;
    frame = Math.floor(nowMs / 160) % 6;
  } else if (motion) {
    row = rows.attack;
    frame = motion.frame;
  } else if (ov) {
    row = ov.row;
    frame = Math.min(5, Math.max(0, Math.floor((nowMs - ov.startedMs) / 125)));
  }
  const drawW = boss ? 236 : enemy.isMinion ? 136 : 168;
  return {
    unit: enemy, sheetPath: enemy.spriteRef, cell: boss ? 256 : 192, rows: boss ? 6 : 4, row, frame, drawW, footFrac: 34 / drawW,
    home, lunge: { x: motion?.x ?? 0, y: motion?.y ?? 0 }, lift: motion?.lift ?? 0,
    alpha: enemy.alive ? 1 : 0.75, moving: Boolean(motion && (motion.x || motion.y)),
  };
}

function heroPose(session: BattleSessionState, vis: BattleVisualState, hero: CombatantRuntime, nowMs: number, index: number, idleFrame6: number, partySize: number): UnitPose {
  const anchor = getCombatantScreenAnchor(session, hero);
  const motion = hero.alive ? motionPose(session, vis, hero, nowMs) : undefined;
  const response = vis.response?.targetUids.includes(hero.unitUid) && nowMs - vis.response.at < 350 ? vis.response : undefined;
  let row = 0;
  let frame = (idleFrame6 + index * 2) % 6;
  let lungeX = 0;
  let lungeY = 0;
  let lift = 0;
  if (!hero.alive) {
    row = 5;
    frame = 5;
  } else if (response) {
    row = response.row;
    const phase = Math.max(0, Math.min(1, (nowMs - response.at) / 350));
    frame = Math.min(5, Math.floor(phase * 6));
    if (row === 4) {
      lungeX = -Math.sin(phase * Math.PI) * (response.landed ? 47 : 24);
      lungeY = Math.sin(phase * Math.PI) * 13;
    }
  } else if (motion) {
    row = vis.motion?.cast ? 2 : 1;
    frame = motion.frame;
    lungeX = motion.x;
    lungeY = motion.y;
    lift = motion.lift;
  } else if (vis.playback?.heroPoseOverrides[hero.unitUid]) {
    const ov = vis.playback.heroPoseOverrides[hero.unitUid];
    row = ov.row;
    const elapsed = Math.max(0, nowMs - ov.startedMs);
    frame = row === 5 ? Math.min(2, Math.floor(elapsed / 120)) : Math.min(5, Math.floor(elapsed / 125));
    if (vis.playback.riposteHeroUid === hero.unitUid) {
      const target = session.combatants.find((unit) => unit.unitUid === vis.playback?.riposteTargetUid);
      const other = target ? getCombatantScreenAnchor(session, target) : anchor;
      const reach = Math.max(0, 1 - 108 / Math.max(1, Math.hypot(other.x - anchor.x, other.y - anchor.y)));
      const dash = Math.sin(Math.min(1, elapsed / 730) * Math.PI);
      lungeX = (other.x - anchor.x) * reach * dash;
      lift = 13 * dash;
      lungeY = (other.y - anchor.y) * reach * dash - lift;
    }
  } else if ((hero.statuses ?? []).some((s) => s.id === 'stun')) {
    row = 5;
    frame = 0;
  }
  const drawW = partySize > 3 ? 138 : 150;
  return {
    unit: hero, sheetPath: hero.spriteRef ?? `units/heroes/${hero.templateId}-battle.png`, cell: 192, rows: 6, row, frame, drawW, footFrac: 28 / drawW,
    home: anchor, lunge: { x: lungeX, y: lungeY }, lift, alpha: 1, moving: Boolean(lungeX || lungeY),
  };
}

const ROW = {
  enemy4: { idle: 0, attack: 1, hurt: 2, dead: 3 },
  boss: { idle: 0, attack: 1, cast: 2, phase: 3, hurt: 4, dead: 5 },
};

function motionPose(session: BattleSessionState, vis: BattleVisualState, unit: CombatantRuntime, now: number) {
  const motion = vis.motion;
  if (!motion || motion.actorUid !== unit.unitUid) return;
  const first = motion.startMs + motion.beats[0];
  const last = motion.startMs + motion.beats[motion.beats.length - 1];
  if (now > last + 460) return;
  const target = session.combatants.find((candidate) => motion.targetUids.includes(candidate.unitUid));
  const home = getCombatantScreenAnchor(session, unit);
  const other = target ? getCombatantScreenAnchor(session, target) : home;
  const dx = other.x - home.x;
  const dy = other.y - home.y;
  const ratio = motion.melee ? Math.max(0, 1 - (isBossUnit(session, unit) ? 110 : 88) / Math.max(1, Math.hypot(dx, dy))) : 0;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const approach = clamp((now - first + 510) / 450);
  const retreat = clamp((now - last - 80) / 380);
  const progress = approach * approach * (3 - 2 * approach) * (1 - retreat);
  const nearest = motion.beats.reduce((current, beat) =>
    Math.abs(motion.startMs + beat - now) < Math.abs(motion.startMs + current - now) ? beat : current,
  );
  const offset = now - (motion.startMs + nearest);
  const frame = offset < -260 ? 0 : offset < -130 ? 1 : offset < -54 ? 2 : offset < 65 ? 3 : offset < 150 ? 4 : 5;
  const lift = ratio > 0 ? Math.sin(approach * Math.PI) * 16 : 0;
  return { x: dx * ratio * progress, y: dy * ratio * progress - lift, lift, frame };
}

export function enqueueEventsIntoVisuals(params: {
  vis: BattleVisualState;
  session: BattleSessionState;
  events: readonly TurnResolutionEvent[];
  actorUid: string;
  kind: 'player_skill' | 'player_item' | 'enemy_turn';
  skillSlotKind?: 'basic' | 'active' | 'ultimate' | 'passive';
  vfxKey?: string;
  nowMs: number;
}): number {
  const { vis, session, events, actorUid, kind, skillSlotKind, vfxKey, nowMs } = params;
  if (vfxKey) {
    void loadExpeditionImage(`vfx/skills/${vfxKey}-cast.png`).catch(() => {});
    void loadExpeditionImage(`vfx/skills/${vfxKey}-effect.png`).catch(() => {});
  }

  const heroPoseOverrides: Record<string, { row: number; startedMs: number }> = {};
  const enemyPoseOverrides: Record<string, { row: number; startedMs: number }> = {};
  const fxTargets: string[] = [];
  let riposteHeroUid: string | undefined;
  let riposteTargetUid: string | undefined;
  const unitOf = (uid?: string) => session.combatants.find((c) => c.unitUid === uid);
  const anchorOf = (uid?: string) => {
    const u = unitOf(uid);
    return u ? getCombatantScreenAnchor(session, u) : { x: 400, y: 180 };
  };
  const push = (uid: string | undefined, text: string, color: string, born: number, dy = -68, dur = 1150, big = false) => {
    const a = anchorOf(uid);
    vis.popups.push({ id: vis.nextPopupId++, x: a.x, y: a.y + dy, text, color, bornMs: born, durationMs: dur, big });
  };

  const actor = unitOf(actorUid);
  if (kind === 'player_skill') {
    heroPoseOverrides[actorUid] = { row: skillSlotKind === 'basic' ? 1 : 2, startedMs: nowMs };
  } else if (actor && kind === 'enemy_turn') {
    const boss = isBossUnit(session, actor);
    enemyPoseOverrides[actorUid] = { row: boss ? (session.bossMoveCursor % 2 === 0 ? ROW.boss.cast : ROW.boss.attack) : ROW.enemy4.attack, startedMs: nowMs };
  }

  let delayIdx = 0;
  for (const ev of events) {
    const born = nowMs + delayIdx * 110;
    const tgt = unitOf(ev.targetUid ?? ev.actorUid);

    if (ev.kind === 'hit') {
      const aff = ev.affinity === 'weak' ? ' KHẮC!' : ev.affinity === 'resist' ? ' KHÁNG' : '';
      const label = `${ev.isCrit ? '✦ ' : ''}-${ev.amount ?? 0}${aff}`;
      const a = anchorOf(ev.targetUid);
      vis.popups.push({
        id: vis.nextPopupId++,
        x: a.x + ((delayIdx % 3) - 1) * 18,
        y: a.y - 68,
        text: label,
        color: ev.grade === 'perfect' ? '#fde047' : ev.affinity === 'weak' ? '#38bdf8' : ev.affinity === 'resist' ? '#94a3b8' : '#f87171',
        bornMs: born,
        durationMs: 1150,
        big: Boolean(ev.isCrit),
      });
      if (tgt?.side === 'party') heroPoseOverrides[tgt.unitUid] = { row: 5, startedMs: born };
      else if (tgt?.side === 'enemy') {
        enemyPoseOverrides[tgt.unitUid] = { row: isBossUnit(session, tgt) ? ROW.boss.hurt : ROW.enemy4.hurt, startedMs: born };
        if (!fxTargets.includes(tgt.unitUid)) fxTargets.push(tgt.unitUid);
      }
      if (ev.isCrit) vis.shakeUntilMs = Math.max(vis.shakeUntilMs, born + 160);
      delayIdx += 1;
    } else if (ev.kind === 'parry') {
      heroPoseOverrides[ev.actorUid] = { row: 3, startedMs: born };
      delayIdx += 1;
    } else if (ev.kind === 'parry_counter') {
      riposteHeroUid = ev.actorUid;
      riposteTargetUid = ev.targetUid;
      heroPoseOverrides[ev.actorUid] = { row: 3, startedMs: born };
      push(ev.targetUid, `−${ev.amount ?? 0}`, '#facc15', born, -96, 950, true);
      vis.flashUntilMs = born + 120;
      vis.flashColor = '#fde68a';
      delayIdx += 1;
    } else if (ev.kind === 'dodge' || ev.kind === 'evade') {
      heroPoseOverrides[ev.actorUid] = { row: 4, startedMs: born };
      delayIdx += 1;
    } else if (ev.kind === 'heal' || ev.kind === 'shield' || ev.kind === 'ap_grant') {
      push(
        ev.targetUid,
        ev.kind === 'heal' ? `+${ev.amount} HP` : ev.kind === 'shield' ? `+${ev.amount} GIÁP` : `+${ev.amount} AP`,
        ev.kind === 'heal' ? '#4ade80' : ev.kind === 'shield' ? '#93c5fd' : '#fde047',
        born,
      );
    } else if (ev.kind === 'break_stagger') {
      if (tgt) enemyPoseOverrides[tgt.unitUid] = { row: isBossUnit(session, tgt) ? ROW.boss.hurt : ROW.enemy4.hurt, startedMs: born };
      push(ev.targetUid, '💥 PHÁ THẾ CHOÁNG!', '#fb923c', born, -114, 1500, true);
      vis.shakeUntilMs = Math.max(vis.shakeUntilMs, born + 320);
      vis.flashUntilMs = born + 140;
      vis.flashColor = '#fdba74';
    } else if (ev.kind === 'boss_phase_shift' && ev.phaseTitleVi) {
      enemyPoseOverrides[ev.actorUid] = { row: ROW.boss.phase, startedMs: nowMs };
      vis.phaseBanner = { titleVi: ev.phaseTitleVi, untilMs: nowMs + 2800 };
      vis.shakeUntilMs = nowMs + 600;
    } else if (ev.kind === 'status_apply' && ev.statusId) {
      const d = STATUS_DEFS[ev.statusId as StatusId];
      if (d) push(ev.targetUid, `${d.icon} ${d.nameVi}${(ev.stacks ?? 1) > 1 ? ' ×' + ev.stacks : ''}`, d.color, born + 220, -40, 1000);
    } else if (ev.kind === 'status_tick' && ev.statusId) {
      const d = STATUS_DEFS[ev.statusId as StatusId];
      push(ev.targetUid, `${d?.icon ?? ''} -${ev.amount ?? 0}`, d?.color ?? '#fb923c', born, -60, 1000);
      if (tgt?.side === 'party') heroPoseOverrides[tgt.unitUid] = { row: 5, startedMs: born };
      delayIdx += 1;
    } else if (ev.kind === 'detonate') {
      push(ev.targetUid, `💥 KÍCH NỔ -${ev.amount ?? 0}`, '#f97316', born + 200, -100, 1300, true);
      vis.shakeUntilMs = Math.max(vis.shakeUntilMs, born + 300);
      delayIdx += 1;
    } else if (ev.kind === 'freeze') {
      push(ev.targetUid, '❄ ĐÓNG BĂNG!', '#bae6fd', born + 260, -120, 1400, true);
    } else if (ev.kind === 'charging') {
      push(ev.actorUid, '⚠ ĐANG GỒNG SỨC!', '#fb923c', born, -120, 1500, true);
    } else if (ev.kind === 'charge_interrupt') {
      push(ev.targetUid, '✂ NGẮT GỒNG!', '#a7f3d0', born + 240, -132, 1500, true);
    } else if (ev.kind === 'charge_burst') {
      push(ev.actorUid, `✺ BỘC PHÁT ×${ev.amount ?? 0}${ev.stacks ? ' (ĐẦY!)' : ''}`, '#f0abfc', born, -104, 1300, true);
    } else if (ev.kind === 'last_stand') {
      push(ev.actorUid, 'BẤT KHUẤT!', '#fde047', born, -100, 1400, true);
    } else if (ev.kind === 'thorns') {
      push(ev.targetUid, `🌹 -${ev.amount ?? 0}`, '#fb7185', born + 120, -50, 1000);
    } else if (ev.kind === 'cleanse') {
      push(ev.targetUid, '✧ THANH TẨY', '#e0f2fe', born + 200, -30, 1000);
    } else if (ev.kind === 'dispel') {
      push(ev.targetUid, '✂ XÓA BUFF', '#e9d5ff', born + 200, -30, 1000);
    } else if (ev.kind === 'stagger_skip') {
      push(ev.actorUid, ev.statusId === 'stun' ? '✸ MẤT LƯỢT' : '… CHOÁNG', '#e2e8f0', born, -90, 1100);
    }
  }

  const totalDurationMs = Math.max(920, 680 + delayIdx * 130);
  vis.playback = {
    kind,
    actorUid,
    vfxKey,
    heroPoseOverrides,
    enemyPoseOverrides,
    fxTargets,
    riposteHeroUid,
    riposteTargetUid,
    startedMs: nowMs,
    durationMs: totalDurationMs,
  };
  return totalDurationMs;
}

function drawChargePips(ctx: CanvasRenderingContext2D, u: CombatantRuntime, x: number, y: number): void {
  const max = u.chargeMax ?? 0;
  if (!max) return;
  const cur = u.charge ?? 0;
  const s = 6;
  const gap = 3;
  let cx = x - (max * (s + gap)) / 2;
  for (let i = 0; i < max; i++) {
    ctx.save();
    ctx.translate(cx + s / 2, y + s / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i < cur ? (cur >= max ? '#f0abfc' : '#c084fc') : '#2a2540';
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = '#a78bfa';
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    cx += s + gap;
  }
}

export function renderBattleCanvas(params: {
  ctx: CanvasRenderingContext2D;
  nowMs: number;
  session: BattleSessionState;
  vis: BattleVisualState;
  hoverTargetUid?: string;
}): void {
  const { ctx, nowMs, session, vis } = params;
  ctx.imageSmoothingEnabled = false;

  if (vis.playback && nowMs - vis.playback.startedMs >= vis.playback.durationMs) vis.playback = null;
  vis.popups = vis.popups.filter((p) => nowMs - p.bornMs < p.durationMs);
  if (vis.phaseBanner && nowMs >= vis.phaseBanner.untilMs) vis.phaseBanner = null;

  const view = vis.view3d;
  if (view) ctx.clearRect(0, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H);
  ctx.save();
  if (nowMs < vis.shakeUntilMs && !view) {
    ctx.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 4));
  }

  // 1. Backdrop + ambient (chế độ 3D: sân khấu three.js tự vẽ nền và sprite, canvas này chỉ còn lớp phủ)
  if (!view) {
    const backdrop = getCachedImage(`battle-scenes/${session.mapId}/backdrop.png`);
    const ambient = getCachedImage(`battle-scenes/${session.mapId}/ambient-anim.png`);
    if (backdrop) ctx.drawImage(backdrop, 0, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H);
    else {
      ctx.fillStyle = '#141229';
      ctx.fillRect(0, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H);
    }
    if (ambient) {
      const f8 = Math.floor(nowMs / 135) % 8;
      ctx.drawImage(ambient, f8 * BATTLE_CANVAS_W, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H, 0, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H);
    }
  }

  const idleFrame6 = Math.floor(nowMs / 135) % 6;
  const intent = session.enemyIntent && session.enemyIntent.actorUid === session.activeActorUid ? session.enemyIntent : null;

  const enemies = session.combatants.filter((c) => c.side === 'enemy');
  const drawOrder = [...enemies].sort((a, b) => getCombatantScreenAnchor(session, a).y - getCombatantScreenAnchor(session, b).y);
  const party = session.combatants.filter((c) => c.side === 'party');
  const enemyPoses = drawOrder.map((enemy) => enemyPose(session, vis, enemy, nowMs, enemies.indexOf(enemy), idleFrame6));
  const heroPoses = party.map((hero, i) => heroPose(session, vis, hero, nowMs, i, idleFrame6, party.length));
  const allPoses = [...enemyPoses, ...heroPoses];
  if (view) view.frame(nowMs, session, vis, allPoses);
  const poseOf = (uid: string) => allPoses.find((p) => p.unit.unitUid === uid);
  /** Vẽ `fn` trong hệ tọa độ quanh đơn vị; ở chế độ 3D, điểm đứng của đơn vị được chiếu theo camera. */
  const at = (p: UnitPose | undefined, fn: () => void, home = false) => {
    if (!view || !p) { fn(); return; }
    const t = view.project(p.unit.unitUid);
    if (!t) return;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.s, t.s);
    ctx.translate(-(p.home.x + (home ? 0 : p.lunge.x)), -(p.home.y + (home ? 0 : p.lunge.y)));
    fn();
    ctx.restore();
  };
  // khi đang ra đòn, giấu thanh máu / trạng thái trên đầu để khung hình gọn
  const m0 = vis.motion;
  const cinematic = Boolean(m0 && nowMs < m0.startMs + m0.beats[m0.beats.length - 1] + 460);

  // 2. Enemies (back to front)
  for (const p of enemyPoses) {
    const enemy = p.unit;
    const anchor = { x: p.home.x + p.lunge.x, y: p.home.y + p.lunge.y };
    const drawW = p.drawW;
    const motion = p.moving || vis.motion?.actorUid === enemy.unitUid;
    at(p, () => {
      if (session.activeActorUid === enemy.unitUid && enemy.alive) {
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(anchor.x - 12, anchor.y + 23);
        ctx.lineTo(anchor.x + 12, anchor.y + 23);
        ctx.stroke();
      }
      if (params.hoverTargetUid === enemy.unitUid && enemy.alive && !cinematic) {
        ctx.strokeStyle = '#fde047';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(anchor.x - 18, anchor.y + 22);
        ctx.lineTo(anchor.x - 11, anchor.y + 28);
        ctx.moveTo(anchor.x + 18, anchor.y + 22);
        ctx.lineTo(anchor.x + 11, anchor.y + 28);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (enemy.aiCharging && enemy.alive) {
        const pulse = 0.45 + 0.35 * Math.sin(nowMs / 120);
        ctx.strokeStyle = `rgba(251, 146, 60, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(anchor.x, anchor.y - drawW * 0.32, drawW * 0.42, drawW * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const sheet = !view && p.sheetPath ? getCachedImage(p.sheetPath) : undefined;
      if (sheet) {
        ctx.globalAlpha = p.alpha;
        ctx.drawImage(sheet, p.frame * p.cell, p.row * p.cell, p.cell, p.cell, anchor.x - drawW / 2, anchor.y - drawW + 34, drawW, drawW);
        ctx.globalAlpha = 1;
      }
      if (motion && vis.motion) {
        const offset = nearestBeatOffset(vis.motion, nowMs);
        // lóe sáng báo trước ~0,2 s trước mỗi nhịp đánh: nhìn thấy lóe là chuẩn bị Đỡ
        if (offset > -240 && offset < -90) {
          const k = 1 - Math.abs(offset + 165) / 75;
          drawGlint(ctx, anchor.x - drawW * 0.22, anchor.y - drawW * 0.5, 7 + k * 9, Math.max(0, k));
        }
      }
      if (enemy.alive && enemy.breakShieldActive) {
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(anchor.x, anchor.y - 54, 72, 82, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (enemy.alive && !cinematic && !isBigEnemy(session, enemy)) drawBattleStatusIcons(ctx, enemy, anchor.x, anchor.y + 23);
      // quái thường: thanh máu ngay trên đầu (quái to dùng thanh lớn giữa trên của HUD)
      if (enemy.alive && !cinematic && !isBigEnemy(session, enemy)) {
        drawHeadBar(ctx, enemy, anchor.x, anchor.y - drawW * 0.74, params.hoverTargetUid === enemy.unitUid, nowMs);
      }
    });
  }

  // 3. Party
  for (const p of heroPoses) {
    const hero = p.unit;
    const anchor = { x: p.home.x + p.lunge.x, y: p.home.y + p.lunge.y };
    const response = vis.response?.targetUids.includes(hero.unitUid) && nowMs - vis.response.at < 350 ? vis.response : undefined;
    at(p, () => {
      if (session.activeActorUid === hero.unitUid && hero.alive) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(anchor.x - 11, anchor.y + 18);
        ctx.lineTo(anchor.x + 11, anchor.y + 18);
        ctx.stroke();
      }
      if (intent && hero.alive && intent.targetUids.includes(hero.unitUid)) {
        const bob = Math.sin(nowMs / 140) * 3;
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.moveTo(anchor.x - 9, anchor.y - 150 + bob);
        ctx.lineTo(anchor.x + 9, anchor.y - 150 + bob);
        ctx.lineTo(anchor.x, anchor.y - 136 + bob);
        ctx.closePath();
        ctx.fill();
      }
      const sheet = !view && p.sheetPath ? getCachedImage(p.sheetPath) : undefined;
      if (sheet) {
        ctx.drawImage(sheet, p.frame * 192, p.row * 192, 192, 192, anchor.x - p.drawW / 2, anchor.y - p.drawW + 28, p.drawW, p.drawW);
      }
      if (response?.row === 3 && response.landed && nowMs - response.at < 130) {
        ctx.strokeStyle = '#fff0c0';
        ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.moveTo(anchor.x + 42, anchor.y - 58);
          ctx.lineTo(anchor.x + 59, anchor.y - 62 + i * 12);
          ctx.stroke();
        }
      }
      if (hero.alive && !cinematic) {
        drawBattleStatusIcons(ctx, hero, anchor.x, anchor.y + 20);
        if ((hero.charge ?? 0) > 0) drawChargePips(ctx, hero, anchor.x, anchor.y + (hero.statuses?.length ? 46 : 26));
      }
      if (hero.alive && hero.shieldHp > 0) drawShield(ctx, anchor.x, anchor.y, hero.shieldHp, nowMs);
    });
  }

  // 3b. Vệt chém theo nhịp va chạm của quái.
  const m = vis.motion;
  const attacker = m ? session.combatants.find((c) => c.unitUid === m.actorUid) : undefined;
  if (m && attacker?.side === 'enemy') {
    const offset = nearestBeatOffset(m, nowMs);
    if (offset > -30 && offset < 110) {
      for (const uid of m.targetUids) {
        const t = session.combatants.find((c) => c.unitUid === uid);
        if (!t) continue;
        const a = getCombatantScreenAnchor(session, t);
        at(poseOf(t.unitUid), () => drawSlash(ctx, a.x, a.y - 66, (offset + 30) / 140, m.melee), true);
      }
    }
  }

  // 4. Skill VFX
  if (vis.playback?.vfxKey) {
    const castStrip = getCachedImage(`vfx/skills/${vis.playback.vfxKey}-cast.png`);
    const fxStrip = getCachedImage(`vfx/skills/${vis.playback.vfxKey}-effect.png`);
    const actor = session.combatants.find((c) => c.unitUid === vis.playback!.actorUid);
    const progress = (nowMs - vis.playback.startedMs) / vis.playback.durationMs;
    const vf = Math.min(7, Math.max(0, Math.floor(progress * 8)));
    if (actor && castStrip && progress < 0.65) {
      const aPos = getCombatantScreenAnchor(session, actor);
      at(poseOf(actor.unitUid), () => ctx.drawImage(castStrip, vf * 96, 0, 96, 96, aPos.x - 56, aPos.y - 102, 112, 112), true);
    }
    if (fxStrip && progress >= 0.22) {
      const targets = vis.playback.fxTargets.length
        ? vis.playback.fxTargets
        : vis.playback.kind === 'enemy_turn'
          ? (intent?.targetUids ?? [])
          : [];
      for (const uid of targets) {
        const t = session.combatants.find((c) => c.unitUid === uid);
        if (!t) continue;
        const tPos = getCombatantScreenAnchor(session, t);
        const pb = vis.playback;
        at(poseOf(t.unitUid), () => {
          if (pb.kind === 'player_skill') {
            const [element, style] = pb.vfxKey!.split('_');
            drawSkillFx(ctx, style, FX_TINT[element] ?? '#f2d896', tPos.x, tPos.y - 64, progress, nowMs, pb.startedMs);
          }
          const direction = pb.kind === 'enemy_turn' ? -1 : 1;
          ctx.save();
          ctx.translate(tPos.x, tPos.y);
          ctx.scale(direction, 1);
          ctx.drawImage(fxStrip, vf * 96, 0, 96, 96, -68, -122, 136, 136);
          ctx.restore();
        }, true);
      }
    }
  }

  // 5. Telegraph & phase banners (always above VFX)
  if (vis.telegraphBanner) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(150, 44, 480, 48);
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2;
    ctx.strokeRect(150, 44, 480, 48);
    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ ${vis.telegraphBanner.moveNameVi}`, 390, 63);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '11px sans-serif';
    ctx.fillText(vis.telegraphBanner.detailVi.slice(0, 92), 390, 81);
  }
  if (vis.phaseBanner) {
    ctx.fillStyle = 'rgba(17, 12, 36, 0.9)';
    ctx.fillRect(110, 138, 560, 54);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(110, 138, 560, 54);
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`✦ ĐẠI TRÙM CHUYỂN PHA: ${vis.phaseBanner.titleVi.toUpperCase()} ✦`, 390, 170);
  }

  // 6. Floating numbers
  for (const p of vis.popups) {
    const age = nowMs - p.bornMs;
    if (age < 0) continue;
    const t = Math.min(1, age / p.durationMs);
    const py = p.y - t * 34;
    const near = view ? nearestPose(allPoses, p.x, p.y + 68) : undefined;
    at(near, () => {
      ctx.globalAlpha = 1 - t * 0.65;
      ctx.font = p.big ? 'bold 18px sans-serif' : 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#09090b';
      ctx.fillText(p.text, p.x + 2, py + 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, py);
      ctx.globalAlpha = 1;
    }, true);
  }

  ctx.restore();
  if (nowMs < vis.flashUntilMs && !view) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = vis.flashColor;
    ctx.fillRect(0, 0, BATTLE_CANVAS_W, BATTLE_CANVAS_H);
    ctx.globalAlpha = 1;
  }
}
