/**
 * Vẽ Miragine War (Thập Hùng Tranh Bá) bằng Canvas 2D:
 * - Kết hợp 100% tài nguyên đồ họa gốc từ `/database-miraginewar/*`:
 *   + 16 binh chủng (`A0..A15`, `B0..B15`) với đủ 4 trạng thái `idle`, `run`, `attack`, `dead`
 *   + Pha Lê Thành (`A_crystal.png`, `B_crystal.png`), Cổng Ra Quân (`door.png`), Bóng (`shadow.png`)
 *   + Đạn phép (`fireball.png`, `thunderball.png`, `storm.png`)
 *   + Nền chiến trường (`terrain.jpg`, `terrain2.jpg`), đường hành quân, Mỏ Vàng và bản đồ nhỏ.
 */
import { THAP_BASE, THAP_UNITS, type ThapUnitKind } from '../../../shared/src';
import {
  MIRAGINE_ANIMS,
  drawMiragineSheetFrame,
  getPortraitImage,
  getSheetImage,
  getStructureImage,
  getTerrainImage,
  getUiImage,
  preloadMiragineAssets,
} from './sprites';
import { thapStore, type ThapEffect, type ThapUnitState } from './store';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface MineInfo {
  x: number;
  y: number;
  big: boolean;
}

export interface RenderOpts {
  w: number;
  h: number;
  dpr: number;
  cam: Camera;
  colors: string[];
  names: string[];
  /** đội theo idx */
  teams: number[];
  /** vẽ vòng màu đội quanh Thành (chế độ lập đội / cùng đánh máy) */
  teamColors?: string[];
  bases: [number, number][];
  mines: MineInfo[];
  myIdx?: number;
  rally?: [number, number];
  showRally: boolean;
  /** idx Thành đang tổng tấn công */
  targetIdx?: number;
  /** đang chọn điểm Tập Kết: vẽ cờ mờ theo chuột */
  ghostRally?: { x: number; y: number };
  dark: boolean;
}

// ---------- tiện ích ----------

const shadeCache = new Map<string, string>();
/** Làm sáng (amt > 0) / tối (amt < 0) một màu hex */
export function shade(hex: string, amt: number) {
  const key = hex + amt;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) {
    r = Math.round(r * (1 + amt)); g = Math.round(g * (1 + amt)); b = Math.round(b * (1 + amt));
  } else {
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
  }
  const out = `rgb(${r},${g},${b})`;
  shadeCache.set(key, out);
  return out;
}

export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- Nền chiến trường lặp vô hạn chuẩn Miragine War (`database-miraginewar/terrains/terrain2.jpg`) ----------

function drawInfiniteMiragineTerrain(
  ctx: CanvasRenderingContext2D,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
  dark: boolean,
) {
  preloadMiragineAssets();
  const rx = vx0 - 256;
  const ry = vy0 - 256;
  const rw = vx1 - vx0 + 512;
  const rh = vy1 - vy0 + 512;

  ctx.fillStyle = dark ? '#2a4620' : '#64a348';
  ctx.fillRect(rx, ry, rw, rh);

  const tex = getTerrainImage('terrain2') ?? getTerrainImage('terrain');
  if (tex) {
    const pat = ctx.createPattern(tex, 'repeat');
    if (pat) {
      ctx.save();
      ctx.fillStyle = pat;
      ctx.fillRect(rx, ry, rw, rh);
      if (dark) {
        ctx.fillStyle = 'rgba(8, 20, 8, 0.28)';
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }
  }
}

// ---------- huy hiệu phe ----------

function emblem(ctx: CanvasRenderingContext2D, idx: number, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = s * 0.28;
  ctx.beginPath();
  switch (idx % 10) {
    case 0: ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.fill(); break;
    case 1: ctx.moveTo(0, -s * 0.8); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s * 0.8); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill(); break;
    case 2: ctx.moveTo(0, -s * 0.75); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); ctx.fill(); break;
    case 3:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.35 : s * 0.8;
        if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill(); break;
    case 4: ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.stroke(); break;
    case 5: ctx.arc(0, 0, s * 0.65, Math.PI * 0.3, Math.PI * 1.7); ctx.arc(s * 0.3, 0, s * 0.5, Math.PI * 1.55, Math.PI * 0.45, true); ctx.closePath(); ctx.fill(); break;
    case 6: ctx.rect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1); ctx.fill(); break;
    case 7: ctx.moveTo(-s * 0.7, s * 0.1); ctx.lineTo(0, -s * 0.55); ctx.lineTo(s * 0.7, s * 0.1); ctx.moveTo(-s * 0.7, s * 0.65); ctx.lineTo(0, 0); ctx.lineTo(s * 0.7, s * 0.65); ctx.stroke(); break;
    case 8: ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2); ctx.stroke(); break;
    default: ctx.arc(-s * 0.35, 0, s * 0.3, 0, Math.PI * 2); ctx.arc(s * 0.35, 0, s * 0.3, 0, Math.PI * 2); ctx.fill(); break;
  }
  ctx.restore();
}

// ---------- Pha Lê Chính + Cổng Triệu Hồi chuẩn 100% Miragine War (`A_crystal.png`, `B_crystal.png`, `door.png`) ----------

function isFriendlySide(owner: number, myIdx?: number, teams?: number[]) {
  if (myIdx === undefined) return owner % 2 === 0;
  if (owner === myIdx) return true;
  if (teams && teams[owner] !== undefined && teams[myIdx] !== undefined && teams[owner] === teams[myIdx]) return true;
  return false;
}

function drawCastle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  idx: number,
  color: string,
  hp: number,
  now: number,
  _dark: boolean,
  isFriendly: boolean,
) {
  ctx.save();
  ctx.translate(x, y);

  // Vòng hào quang màu phe dưới chân Cổng Triệu Hồi & Pha Lê để phân biệt 10 người chơi
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 22, 86, 34, 0, 0, Math.PI * 2); ctx.fill();

  const pulse = 0.72 + 0.28 * Math.sin(now / 420 + idx);
  const ringGrad = ctx.createRadialGradient(0, 10, 14, 0, 10, 88);
  ringGrad.addColorStop(0, rgba(color, 0.42 * pulse));
  ringGrad.addColorStop(0.7, rgba(color, 0.18));
  ringGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ringGrad;
  ctx.beginPath(); ctx.ellipse(0, 10, 88, 42, 0, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = rgba(color, 0.85);
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 12, 72, 28, 0, 0, Math.PI * 2); ctx.stroke();

  // Cổng Triệu Hồi `door.png` nguyên bản Miragine War (150x296)
  const doorImg = getStructureImage('door');
  if (doorImg) {
    ctx.drawImage(doorImg, -56, -162, 112, 220);
  }

  // Pha Lê Chính `A_crystal.png` (Đỏ) / `B_crystal.png` (Xanh) nguyên bản Miragine War (96x144)
  const crystalImg = getStructureImage(isFriendly ? 'A_crystal' : 'B_crystal');
  const bob = Math.sin(now / 480 + idx * 1.3) * 3.5;
  if (crystalImg) {
    ctx.drawImage(crystalImg, -48, -138 + bob, 96, 144);
  } else {
    ctx.fillStyle = isFriendly ? '#e03131' : '#1c7ed6';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -105 + bob);
    ctx.lineTo(34, -45 + bob);
    ctx.lineTo(0, 5 + bob);
    ctx.lineTo(-34, -45 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Hai cờ hiệu nhỏ màu phe hai bên
  for (const bx of [-64, 64]) {
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(bx, 16); ctx.lineTo(bx, -48); ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx - 9, -46);
    ctx.lineTo(bx + 9, -46);
    ctx.lineTo(bx + 9, -18);
    ctx.lineTo(bx, -24);
    ctx.lineTo(bx - 9, -18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    emblem(ctx, idx, bx, -34, 4);
  }

  if (hp < 55) {
    const n = hp < 25 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const t = (now / 1800 + i / n) % 1;
      const sx = (hash(i + idx) - 0.5) * 64 + Math.sin(now / 500 + i) * 4;
      ctx.fillStyle = `rgba(60,60,60,${0.45 * (1 - t)})`;
      ctx.beginPath(); ctx.arc(sx + t * 18, -50 - t * 80, 7 + t * 16, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawRuins(ctx: CanvasRenderingContext2D, x: number, y: number, idx: number, color: string, now: number, dark: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30,20,10,0.45)';
  ctx.beginPath(); ctx.ellipse(0, 10, 88, 44, 0, 0, Math.PI * 2); ctx.fill();
  const stone = dark ? '#6f6a62' : '#9d968a';
  const stoneDark = dark ? '#4a463f' : '#6e675c';
  for (let i = 0; i < 24; i++) {
    const rx = (hash(i * 3.7 + idx) - 0.5) * 140, ry = (hash(i * 5.1 + idx) - 0.5) * 64 + 10;
    const r = 4 + hash(i * 1.3) * 7;
    ctx.fillStyle = i % 4 === 0 ? shade(color, -0.15) : i % 2 ? stone : stoneDark;
    ctx.beginPath(); ctx.ellipse(rx, ry, r * 1.3, r, hash(i) * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#3b2a1a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(30, -6); ctx.stroke();
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath(); ctx.moveTo(30, -6); ctx.lineTo(48, 4); ctx.lineTo(40, 10); ctx.lineTo(34, 6); ctx.lineTo(24, 10); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const t = (now / 2600 + i / 3) % 1;
    ctx.fillStyle = `rgba(70,70,70,${0.35 * (1 - t)})`;
    ctx.beginPath(); ctx.arc((i - 1) * 28 + t * 14, -10 - t * 75, 8 + t * 15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- 16 binh chủng Miragine War (`A0..A15` / `B0..B15`) ----------

const DRAW_SCALE = 1.25;

/**
 * Vẽ 1 lính Miragine War tại `(x, y)` bằng đúng sprite sheet trích xuất từ `/database-miraginewar/sheets/{A|B}{ss}_{idle|run|attack}.png`.
 * Kèm theo vòng màu phe dưới chân để phân biệt rõ 10 người chơi trong chế độ Solo 10 người.
 */
export function drawSoldier(
  ctx: CanvasRenderingContext2D,
  kind: ThapUnitKind,
  color: string,
  x: number,
  y: number,
  left: boolean,
  phase: number,
  moving: boolean,
  swing: number,
  R: number,
  heal = false,
  now = 0,
  isFriendly = true,
  unitId = 0,
) {
  const spec = THAP_UNITS[kind] ?? THAP_UNITS.swordman;
  const ss = spec.ss;
  const prefix = isFriendly ? 'A' : 'B';
  const attacking = swing > 0;
  const action = attacking ? 'attack' : moving ? 'run' : 'idle';
  const sheetKey = `${prefix}${ss}_${action}`;
  const meta = MIRAGINE_ANIMS[sheetKey];
  const frames = meta ? meta[0] : 3;

  let frameIdx = 0;
  if (attacking) {
    frameIdx = Math.min(frames - 1, Math.floor((1 - swing) * frames));
  } else if (moving) {
    frameIdx = Math.floor(phase * 1.55) % frames;
  } else {
    frameIdx = Math.floor(now / 210 + unitId * 1.3) % frames;
  }

  const footY = y + R * 0.42;
  const scale = Math.max(0.55, (R / 14.5) * 0.96);

  // Vòng màu phe + bóng dưới chân (`shadow.png`)
  ctx.save();
  const shadowImg = getStructureImage('shadow');
  const ringRx = R * (kind === 'cavalry' || kind === 'ironknight' ? 1.15 : 0.85);
  const ringRy = R * 0.36;
  if (shadowImg) {
    ctx.globalAlpha = 0.55;
    ctx.drawImage(shadowImg, x - ringRx * 1.1, footY - ringRy * 1.1, ringRx * 2.2, ringRy * 2.2);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = rgba(color, 0.32);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, R * 0.11);
  ctx.beginPath();
  ctx.ellipse(x, footY, ringRx, ringRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Vẽ sprite sheet Miragine War
  const drawn = drawMiragineSheetFrame(ctx, sheetKey, frameIdx, x, footY, left, scale);
  if (!drawn) {
    // Dự phòng khi ảnh đang tải
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - R * 0.2, R * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Hiệu ứng hồi máu xanh lá khi được Novice / Monk chữa trị
  if (heal) {
    ctx.save();
    ctx.translate(x, y);
    for (let k = 0; k < 3; k++) {
      const t = (now / 650 + k / 3) % 1;
      ctx.fillStyle = `rgba(105,219,124,${1 - t})`;
      const px = Math.cos(k * 2.1 + now / 380) * R * 0.75;
      const py = -R * 0.4 - t * R * 1.5;
      ctx.fillRect(px - R * 0.06, py - R * 0.18, R * 0.12, R * 0.36);
      ctx.fillRect(px - R * 0.18, py - R * 0.06, R * 0.36, R * 0.12);
    }
    ctx.restore();
  }
}

function swingOf(u: ThapUnitState, now: number) {
  const elapsed = now - u.atkAt;
  const dur = 420;
  if (elapsed < 0 || elapsed > dur) return 0;
  return 1 - elapsed / dur;
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, h: number, useFrame = false) {
  ctx.fillStyle = 'rgba(0,0,0,0.68)';
  ctx.fillRect(x - w / 2 - h * 0.25, y - h * 0.25, w + h * 0.5, h * 1.5);
  ctx.fillStyle = pct > 60 ? '#51cf66' : pct > 30 ? '#fcc419' : '#ff6b6b';
  ctx.fillRect(x - w / 2, y, (w * Math.max(0, pct)) / 100, h);
  if (useFrame) {
    const frameImg = getUiImage('bar_frame');
    if (frameImg) {
      ctx.drawImage(frameImg, x - w / 2 - 4, y - 3, w + 8, h + 6);
    }
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = '#fff') {
  ctx.font = `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.28;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

// ---------- đạn & hiệu ứng Miragine War (`fireball.png`, `thunderball.png`, `storm.png`, `{A|B}{ss}_dead.png`) ----------

function shotPos(e: ThapEffect, p: number, arc: number) {
  if (e.target !== undefined) {
    const tp = thapStore.unitPos(e.target);
    if (tp) { e.x2 = tp.x; e.y2 = tp.y - 6; }
  }
  const q = Math.max(0, Math.min(1, p));
  return { x: e.x1 + (e.x2 - e.x1) * q, y: e.y1 + (e.y2 - e.y1) * q - Math.sin(q * Math.PI) * arc, q };
}

const BOOM_MS = 450;

function drawEffect(ctx: CanvasRenderingContext2D, e: ThapEffect, now: number, z: number, myIdx?: number, teams?: number[]) {
  const age = now - e.t0;
  const p = age / e.dur;
  switch (e.kind) {
    case 'arrow':
    case 'base': {
      if (p >= 1) break;
      const big = e.kind === 'base';
      const dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      const arc = Math.min(60, dist * (big ? 0.18 : 0.12));
      const a = shotPos(e, p, arc);
      const b = shotPos(e, p - 0.06, arc);
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      const L = big ? 18 : 13;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(ang);
      ctx.strokeStyle = big ? '#ff922b' : '#6b3f1d';
      ctx.lineWidth = Math.max(1.5, 1.3 / z) * (big ? 1.4 : 1);
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = big ? '#ffd43b' : '#dee2e6';
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-1, -3); ctx.lineTo(-1, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'magic': {
      // Cầu lửa Miragine War (`fireball.png`: 3 frame 32x32)
      const fbImg = getSheetImage('fireball');
      if (p < 1) {
        const sp = shotPos(e, p, 14);
        const prev = shotPos(e, p - 0.05, 14);
        const ang = Math.atan2(sp.y - prev.y, sp.x - prev.x);
        if (fbImg) {
          const f = Math.floor(now / 60) % 3;
          ctx.save();
          ctx.translate(sp.x, sp.y);
          ctx.rotate(ang);
          ctx.drawImage(fbImg, f * 32, 0, 32, 32, -18, -18, 36, 36);
          ctx.restore();
        } else {
          ctx.fillStyle = '#ff922b';
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const b = Math.min(1, (age - e.dur) / BOOM_MS);
        const R = 48 * (0.35 + b * 0.75);
        const g = ctx.createRadialGradient(e.x2, e.y2, 0, e.x2, e.y2, R);
        g.addColorStop(0, `rgba(255,240,180,${0.85 * (1 - b)})`);
        g.addColorStop(0.5, `rgba(255,120,30,${0.6 * (1 - b)})`);
        g.addColorStop(1, 'rgba(200,40,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.x2, e.y2, R, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'thunder': {
      // Đạn sấm sét của Immortal (`thunderball.png`: 16 frame 128x128)
      const tbImg = getSheetImage('thunderball');
      const sp = p < 1 ? shotPos(e, p, 8) : { x: e.x2, y: e.y2 };
      const totalAge = age / (e.dur + BOOM_MS);
      if (tbImg) {
        const f = Math.min(15, Math.floor(totalAge * 16));
        const sc = p < 1 ? 0.55 : 0.85;
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.scale(sc, sc);
        ctx.drawImage(tbImg, f * 128, 0, 128, 128, -64, -64, 128, 128);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(116,192,252,0.85)';
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 12, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'storm': {
      // Bão sét của HighLord (`storm.png`: 9 frame 153x261)
      const stImg = getSheetImage('storm');
      const sp = p < 1 ? shotPos(e, p, 4) : { x: e.x2, y: e.y2 };
      const totalAge = Math.min(0.999, age / (e.dur + BOOM_MS));
      if (stImg) {
        const f = Math.min(8, Math.floor(totalAge * 9));
        const sc = 0.68;
        ctx.save();
        ctx.translate(sp.x, sp.y + 10);
        ctx.scale(sc, sc);
        ctx.drawImage(stImg, f * 153, 0, 153, 261, -76, -245, 153, 261);
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(255,243,191,0.9)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 120); ctx.lineTo(sp.x, sp.y); ctx.stroke();
      }
      break;
    }
    case 'stone': {
      const dist = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (p < 1) {
        const q = Math.max(0, Math.min(1, p));
        const gx = e.x1 + (e.x2 - e.x1) * q, gy = e.y1 + (e.y2 - e.y1) * q;
        const hgt = Math.sin(q * Math.PI) * Math.max(60, dist * 0.45);
        ctx.fillStyle = '#6c6f73';
        ctx.beginPath(); ctx.arc(gx, gy - hgt, 7, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'heal': {
      if (p < 1) {
        const sp = shotPos(e, p, 18);
        ctx.fillStyle = 'rgba(140,233,154,0.9)';
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2); ctx.fill();
      } else {
        const b = (age - e.dur) / BOOM_MS;
        ctx.fillStyle = `rgba(81,207,102,${1 - b})`;
        const cx = e.x2, cy = e.y2 - 16 - b * 16;
        ctx.fillRect(cx - 2, cy - 6, 4, 12);
        ctx.fillRect(cx - 6, cy - 2, 12, 4);
      }
      break;
    }
    case 'death': {
      // Vẽ animation gục ngã nguyên bản `{A|B}{ss}_dead.png` của Miragine War
      const kind = e.unitKind ?? 'swordman';
      const spec = THAP_UNITS[kind] ?? THAP_UNITS.swordman;
      const friendly = isFriendlySide(e.unitOwner ?? 0, myIdx, teams);
      const key = `${friendly ? 'A' : 'B'}${spec.ss}_dead`;
      const meta = MIRAGINE_ANIMS[key];
      const frames = meta ? meta[0] : 3;
      const frameIdx = Math.min(frames - 1, Math.floor(Math.min(0.999, p * 1.35) * frames));
      const boost = Math.min(2.2, Math.max(1, 0.55 / z));
      const R = spec.radius * DRAW_SCALE * boost;
      const scale = Math.max(0.55, (R / 14.5) * 0.96);
      const alpha = p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3);
      ctx.save();
      ctx.globalAlpha = alpha;
      const ok = drawMiragineSheetFrame(ctx, key, frameIdx, e.x1, e.y1 + R * 0.42, e.left ?? true, scale);
      if (!ok) {
        ctx.fillStyle = `rgba(180,40,40,${0.55 * alpha})`;
        ctx.beginPath(); ctx.ellipse(e.x1, e.y1 + 4, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'rubble': {
      const flash = Math.max(0, 1 - p * 4);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,200,90,${0.6 * flash})`;
        ctx.beginPath(); ctx.arc(e.x1, e.y1 - 30, 120 * (1.2 - flash * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + i;
        ctx.fillStyle = `rgba(130,115,95,${0.6 * (1 - p)})`;
        ctx.beginPath(); ctx.arc(e.x1 + Math.cos(a) * p * 120, e.y1 - 20 + Math.sin(a) * p * 70, 22 * (1 - p) + 4, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'ping': {
      ctx.strokeStyle = `rgba(255,80,80,${1 - p})`;
      ctx.lineWidth = 4 / z;
      for (const k of [0, 0.33]) {
        const q = (p * 3 + k) % 1;
        ctx.beginPath(); ctx.arc(e.x1, e.y1, 80 + q * 140, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
  }
}

const effectLife = (e: ThapEffect) =>
  e.dur + (e.kind === 'magic' || e.kind === 'stone' || e.kind === 'heal' || e.kind === 'thunder' || e.kind === 'storm' ? BOOM_MS : 0);

// ---------- vẽ cả cảnh ----------

export function renderScene(ctx: CanvasRenderingContext2D, o: RenderOpts) {
  const { w, h, dpr, cam } = o;
  const st = thapStore;
  const now = performance.now();
  const a = st.alpha(now);
  const z = cam.zoom;
  const W = st.mapW, H = st.mapH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = o.dark ? '#0d1a0b' : '#1f3a18';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
  const vx0 = cam.x - w / 2 / z, vy0 = cam.y - h / 2 / z, vx1 = cam.x + w / 2 / z, vy1 = cam.y + h / 2 / z;
  const onScreen = (x: number, y: number, r: number) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

  // Nền chiến trường lặp vô hạn chuẩn Miragine War (`database-miraginewar/terrains/terrain2.jpg`)
  ctx.imageSmoothingEnabled = true;
  drawInfiniteMiragineTerrain(ctx, vx0, vy0, vx1, vy1, o.dark);
  ctx.strokeStyle = 'rgba(255,212,59,0.28)';
  ctx.lineWidth = 4 / z;
  ctx.strokeRect(0, 0, W, H);

  const al = st.frame?.al;
  const isAlive = (i: number) => (al ? al[i] === 1 : true);

  // vòng đội + vòng tầm bắn Thành mình
  for (let i = 0; i < o.bases.length; i++) {
    const [bx, by] = o.bases[i];
    if (!onScreen(bx, by, 300)) continue;
    if (o.teamColors && isAlive(i)) {
      const tc = o.teamColors[o.teams[i] ?? 0] ?? '#fff';
      ctx.strokeStyle = rgba(tc, 0.9);
      ctx.lineWidth = Math.max(4, 3 / z);
      ctx.setLineDash([18, 10]);
      ctx.beginPath(); ctx.ellipse(bx, by + 12, 112, 72, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (i === o.myIdx && isAlive(i)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2 / z;
      ctx.setLineDash([12 / z, 10 / z]);
      ctx.beginPath(); ctx.arc(bx, by, THAP_BASE.range + THAP_BASE.radius * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 0.5 + 0.5 * Math.sin(now / 500);
      ctx.fillStyle = `rgba(255,236,153,${0.1 + 0.08 * pulse})`;
      ctx.beginPath(); ctx.ellipse(bx, by + 12, 100, 62, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // đường hành quân tới Thành mục tiêu chỉ định
  if (o.targetIdx !== undefined && o.myIdx !== undefined && o.bases[o.targetIdx] && o.bases[o.myIdx]) {
    const [x1, y1] = o.bases[o.myIdx];
    const [x2, y2] = o.bases[o.targetIdx];
    ctx.strokeStyle = 'rgba(255,90,90,0.52)';
    ctx.lineWidth = Math.max(3.5, 3 / z);
    ctx.setLineDash([22, 16]);
    ctx.lineDashOffset = -now / 30;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  // sắp theo y để vật phía trước che vật phía sau
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (let i = 0; i < o.bases.length; i++) {
    const [bx, by] = o.bases[i];
    if (!onScreen(bx, by - 50, 170)) continue;
    const hp = st.baseHp[i] ?? 100;
    const dead = !isAlive(i) || (st.frame && hp <= 0);
    const col = o.colors[i] ?? '#888';
    const friendly = isFriendlySide(i, o.myIdx, o.teamColors ? o.teams : undefined);
    items.push({
      y: by + 30,
      draw: () => (dead ? drawRuins(ctx, bx, by, i, col, now, o.dark) : drawCastle(ctx, bx, by, i, col, hp, now, o.dark, friendly)),
    });
  }

  // lính
  const boost = Math.min(2.2, Math.max(1, 0.55 / z));
  const lod = z * boost < 0.36;
  const units: { u: ThapUnitState; x: number; y: number }[] = [];
  for (const u of st.units.values()) {
    const x = u.px + (u.x - u.px) * a, y = u.py + (u.y - u.py) * a;
    if (!onScreen(x, y, 48 * boost)) continue;
    const moved = Math.hypot(u.x - u.px, u.y - u.py);
    u.phase += moved * 0.05 + (moved > 0.3 ? 0.18 : 0);
    units.push({ u, x, y });
  }
  for (const it of units) {
    const { u, x, y } = it;
    const col = o.colors[u.owner] ?? '#888';
    const spec = THAP_UNITS[u.kind] ?? THAP_UNITS.swordman;
    const R = spec.radius * DRAW_SCALE * boost;
    const friendly = isFriendlySide(u.owner, o.myIdx, o.teamColors ? o.teams : undefined);
    items.push({
      y,
      draw: () => {
        if (lod) {
          ctx.fillStyle = col;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 1.2 / z;
          const r = R * 0.72;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const moving = Math.abs(u.x - u.px) + Math.abs(u.y - u.py) > 0.3;
          drawSoldier(ctx, u.kind, col, x, y, (u.flags & 4) !== 0, u.phase, moving, swingOf(u, now), R, (u.flags & 2) !== 0, now, friendly, u.id);
        }
      },
    });
  }
  items.sort((p, q) => p.y - q.y);
  for (const it of items) it.draw();

  // thanh máu lính bị thương
  if (!lod) {
    for (const { u, x, y } of units) {
      if (u.hp >= 100) continue;
      const spec = THAP_UNITS[u.kind] ?? THAP_UNITS.swordman;
      const R = spec.radius * DRAW_SCALE * boost;
      hpBar(ctx, x, y - R * (u.kind === 'cavalry' || u.kind === 'ironknight' ? 1.85 : 1.65), Math.max(16, R * 1.8), u.hp, Math.max(2.5, R * 0.18));
    }
  }

  // điểm Tập Kết
  const flag = (rx: number, ry: number, alpha: number) => {
    const col = o.myIdx !== undefined ? o.colors[o.myIdx] ?? '#69db7c' : '#69db7c';
    const s = Math.max(1, 0.7 / z);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([8 / z, 6 / z]);
    ctx.beginPath(); ctx.ellipse(rx, ry, 46, 28, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.scale(s, s);
    ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -46); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -46);
    for (let k = 0; k <= 6; k++) ctx.lineTo(k * 5, -46 + Math.sin(now / 200 - k) * 2 * (k / 6));
    for (let k = 6; k >= 0; k--) ctx.lineTo(k * 5, -30 + Math.sin(now / 200 - k) * 2 * (k / 6));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    label(ctx, 'Tập Kết', rx, ry + 16 * s, 12 * s, '#d3f9d8');
    ctx.globalAlpha = 1;
  };
  if (o.rally && o.showRally) flag(o.rally[0], o.rally[1], 1);
  if (o.ghostRally) flag(o.ghostRally.x, o.ghostRally.y, 0.55);

  // tâm ngắm Thành mục tiêu chỉ định
  if (o.targetIdx !== undefined && o.bases[o.targetIdx]) {
    const [tx, ty0] = o.bases[o.targetIdx];
    const ty = ty0 - 20;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    ctx.strokeStyle = `rgba(255,70,70,${0.65 + 0.35 * pulse})`;
    ctx.lineWidth = Math.max(4, 3 / z);
    const R = 120 + pulse * 10;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const an = (i / 4) * Math.PI * 2 + now / 1500;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(an) * (R - 18), ty + Math.sin(an) * (R - 18));
      ctx.lineTo(tx + Math.cos(an) * (R + 22), ty + Math.sin(an) * (R + 22));
      ctx.stroke();
    }
  }

  // tên + máu Pha Lê Chính
  const fpx = Math.max(15, 13 / z);
  for (let i = 0; i < o.bases.length; i++) {
    const [bx, by] = o.bases[i];
    if (!onScreen(bx, by, 220)) continue;
    const hp = st.baseHp[i] ?? 100;
    const alive = isAlive(i) && hp > 0;
    const name = (i === o.myIdx ? '★ ' : '') + (o.names[i] ?? `Phe ${i + 1}`);
    label(ctx, alive ? name : `${name} – đã vỡ`, bx, by - 148 - (fpx - 15) * 0.6, fpx, alive ? shade(o.colors[i] ?? '#888888', 0.55) : '#adb5bd');
    if (alive) hpBar(ctx, bx, by + 44, 128, hp, Math.max(8, 6 / z), true);
  }

  // hiệu ứng
  st.effects = st.effects.filter((e) => now - e.t0 < effectLife(e));
  for (const e of st.effects) {
    if (onScreen(e.x1, e.y1, 360) || onScreen(e.x2, e.y2, 140)) {
      drawEffect(ctx, e, now, z, o.myIdx, o.teamColors ? o.teams : undefined);
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- bản đồ nhỏ ----------

export function renderMinimap(
  ctx: CanvasRenderingContext2D, mw: number, mh: number, dpr: number, cam: Camera, viewW: number, viewH: number,
  o: Pick<RenderOpts, 'colors' | 'bases' | 'mines' | 'myIdx' | 'targetIdx' | 'rally' | 'showRally' | 'dark'>,
) {
  const st = thapStore;
  const W = st.mapW || 1;
  const k = mw / W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = o.dark ? '#233b1b' : '#58943e';
  ctx.fillRect(0, 0, mw, mh);
  const tex = getTerrainImage('terrain2') ?? getTerrainImage('terrain');
  if (tex) {
    const pat = ctx.createPattern(tex, 'repeat');
    if (pat) {
      ctx.save();
      ctx.scale(0.18, 0.18);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, mw / 0.18, mh / 0.18);
      ctx.restore();
    }
  }
  ctx.fillStyle = o.dark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.1)';
  ctx.fillRect(0, 0, mw, mh);
  const now = performance.now();
  // lính
  for (const u of st.units.values()) {
    ctx.fillStyle = o.colors[u.owner] ?? '#888';
    ctx.fillRect(u.x * k - 1.2, u.y * k - 1.2, 2.4, 2.4);
  }
  // Pha Lê Chính
  const al = st.frame?.al;
  for (let i = 0; i < o.bases.length; i++) {
    const [bx, by] = o.bases[i];
    const dead = al ? al[i] !== 1 : false;
    const s = 8;
    ctx.fillStyle = dead ? '#495057' : o.colors[i] ?? '#888';
    ctx.strokeStyle = i === o.myIdx ? '#fff' : 'rgba(0,0,0,0.7)';
    ctx.lineWidth = i === o.myIdx ? 2 : 1;
    ctx.fillRect(bx * k - s / 2, by * k - s / 2, s, s);
    ctx.strokeRect(bx * k - s / 2, by * k - s / 2, s, s);
    if (dead) {
      ctx.strokeStyle = '#ff8787';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx * k - 4, by * k - 4); ctx.lineTo(bx * k + 4, by * k + 4); ctx.moveTo(bx * k + 4, by * k - 4); ctx.lineTo(bx * k - 4, by * k + 4); ctx.stroke();
    }
  }
  for (const e of st.effects) {
    if (e.kind !== 'ping') continue;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x1 * k, e.y1 * k, 7 + ((now - e.t0) / 120) % 8, 0, Math.PI * 2); ctx.stroke();
  }
  if (o.targetIdx !== undefined && o.bases[o.targetIdx]) {
    const [tx, ty] = o.bases[o.targetIdx];
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    const r = 8 + Math.sin(now / 220) * 1.5;
    ctx.beginPath(); ctx.arc(tx * k, ty * k, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (o.rally && o.showRally) {
    ctx.fillStyle = '#69db7c';
    ctx.strokeStyle = '#1b3d1f';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(o.rally[0] * k, o.rally[1] * k, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.strokeRect((cam.x - viewW / 2 / cam.zoom) * k, (cam.y - viewH / 2 / cam.zoom) * k, (viewW / cam.zoom) * k, (viewH / cam.zoom) * k);
}

/** Vẽ chân dung hoặc lính Miragine War vào ô mua lính */
export function drawUnitIcon(canvas: HTMLCanvasElement, kind: ThapUnitKind, color: string) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 44;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const spec = THAP_UNITS[kind] ?? THAP_UNITS.swordman;
  const pImg = getPortraitImage(spec.id, 'a');
  if (pImg) {
    ctx.drawImage(pImg, 0, 0, size, size);
    return;
  }
  drawSoldier(ctx, kind, color, size / 2, size * 0.62, false, 0, false, 0, size * 0.34, false, 0, true, spec.ss);
}
