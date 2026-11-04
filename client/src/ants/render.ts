/**
 * Vẽ Đế Chế Kiến bằng canvas 2D nhìn từ trên xuống: nền đất, đá, trụ, kiến (vẽ bằng code), đạn, sương mù, bản đồ nhỏ.
 */
import { ANT_TOWERS, ANT_UNITS, type AntUnitKind } from '../../../shared/src';
import { antsStore, type Effect, type TowerState, type UnitState } from './store';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface RenderOpts {
  w: number;
  h: number;
  dpr: number;
  cam: Camera;
  rocks: number[];
  colors: string[];
  selected: Set<number>;
  hover?: number;
  box?: { x0: number; y0: number; x1: number; y1: number };
  /** điểm tập kết của mình */
  rally?: [number, number];
  showRally: boolean;
  /** trụ đang tổng tấn công */
  target?: [number, number];
  dark: boolean;
}

// ---------- tiện ích màu ----------

const shadeCache = new Map<string, string>();
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

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------- nền đất (lát lặp lại) ----------

let soil: CanvasPattern | null = null;
let soilDark = false;
function soilPattern(ctx: CanvasRenderingContext2D, dark: boolean) {
  if (soil && soilDark === dark) return soil;
  const S = 320;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = dark ? '#3a2c1f' : '#b48a5a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = hash(i) * S, y = hash(i + 50) * S, r = 20 + hash(i + 99) * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = hash(i + 7) > 0.5 ? (dark ? 'rgba(70,52,34,0.5)' : 'rgba(150,108,64,0.45)') : (dark ? 'rgba(40,30,20,0.45)' : 'rgba(196,158,110,0.4)');
    grad.addColorStop(0, tone);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  for (let i = 0; i < 420; i++) {
    const x = hash(i * 3.1) * S, y = hash(i * 7.7) * S;
    const r = 0.6 + hash(i * 1.3) * 1.6;
    g.fillStyle = hash(i * 2.2) > 0.5 ? (dark ? 'rgba(20,14,8,0.55)' : 'rgba(110,78,44,0.5)') : (dark ? 'rgba(120,96,70,0.35)' : 'rgba(230,206,170,0.55)');
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 22; i++) {
    const x = hash(i * 9.1) * S, y = hash(i * 4.3) * S, r = 2 + hash(i * 5.5) * 3.5;
    g.fillStyle = dark ? '#5a4a3a' : '#9c8a74';
    g.beginPath(); g.ellipse(x, y, r * 1.3, r, hash(i) * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = hash(i * 13.7) * S, y = hash(i * 17.3) * S;
    g.strokeStyle = dark ? 'rgba(90,120,60,0.55)' : 'rgba(96,128,52,0.75)';
    g.lineWidth = 1.4;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.32;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5, x + Math.cos(a) * 10, y + Math.sin(a) * 11); g.stroke();
    }
  }
  soil = ctx.createPattern(c, 'repeat');
  soilDark = dark;
  return soil;
}

// ---------- đá ----------

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, dark: boolean) {
  const path = new Path2D();
  for (let i = 0; i <= 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const rr = r * (0.82 + hash(seed + i) * 0.22);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.86;
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  path.closePath();
  ctx.save();
  ctx.translate(4, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill(path);
  ctx.restore();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, dark ? '#8a8a8e' : '#b9b6ae');
  g.addColorStop(1, dark ? '#45464d' : '#6e6b65');
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke(path);
}

// ---------- trụ ----------

function drawTower(ctx: CanvasRenderingContext2D, t: TowerState, color: string, now: number) {
  const s = ANT_TOWERS[t.kind];
  const r = s.radius;
  const main = t.kind === 'main';
  ctx.save();
  ctx.translate(t.x, t.y);
  // bóng
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(6, 9, r * 1.08, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  // tường đá
  const stones = main ? 14 : 10;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? '#8d8478' : '#a39a8c';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, a, a + (Math.PI * 2) / stones + 0.02);
    ctx.arc(0, 0, r * 0.74, a + (Math.PI * 2) / stones + 0.02, a, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // sân trong
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, 2, 0, 0, r * 0.74);
  g.addColorStop(0, '#9a6b3e');
  g.addColorStop(1, '#5e3e22');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2); ctx.fill();
  // viền màu đế chế
  ctx.strokeStyle = color;
  ctx.lineWidth = main ? 4 : 3;
  ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, Math.PI * 2); ctx.stroke();
  // tháp pháo
  const tr = r * (main ? 0.5 : 0.48);
  const dome = ctx.createRadialGradient(-tr * 0.35, -tr * 0.4, 1, 0, 0, tr);
  dome.addColorStop(0, shade(color, 0.35));
  dome.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = dome;
  ctx.beginPath(); ctx.arc(0, -r * 0.1, tr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // nòng pháo (lên trên)
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(-tr * 0.22, -r * 0.1 - tr * 1.55, tr * 0.44, tr * 1.1);
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(0, -r * 0.1 - tr * 1.55, tr * 0.24, tr * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  if (main) {
    // vương miện + cờ
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#a07400';
    ctx.lineWidth = 1;
    const cy = -r * 0.1 + tr * 0.15;
    ctx.beginPath();
    ctx.moveTo(-9, cy); ctx.lineTo(-9, cy - 8); ctx.lineTo(-4.5, cy - 4); ctx.lineTo(0, cy - 10); ctx.lineTo(4.5, cy - 4); ctx.lineTo(9, cy - 8); ctx.lineTo(9, cy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(r * 0.82, -r * 0.2); ctx.lineTo(r * 0.82, -r * 1.25); ctx.stroke();
    const wave = Math.sin(now / 300) * 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r * 0.82, -r * 1.25);
    ctx.quadraticCurveTo(r * 1.1, -r * 1.2 + wave, r * 1.4, -r * 1.12);
    ctx.lineTo(r * 0.82, -r * 0.92);
    ctx.fill();
  }
  // vòng nạp đạn
  {
    const ready = 1 - Math.min(1, t.cd / s.cd);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(0, 0, r + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ready >= 1 ? '#ff6b6b' : '#ffd43b';
    ctx.beginPath(); ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ready); ctx.stroke();
  }
  ctx.restore();
}

// ---------- kiến ----------

/** Vẽ kiến to hơn thân va chạm một chút cho dễ nhìn */
const ANT_DRAW_SCALE = 1.35;

function drawAnt(ctx: CanvasRenderingContext2D, u: UnitState, x: number, y: number, color: string, t: number) {
  const s = ANT_UNITS[u.kind];
  const R = s.radius * ANT_DRAW_SCALE;
  const k = u.kind;
  const moving = Math.abs(u.x - u.px) + Math.abs(u.y - u.py) > 0.3;
  const leg = moving ? Math.sin(u.phase) : 0;
  const atk = (u.flags & 2) !== 0;
  const fly = !!s.fly;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  const so = fly ? 9 : 2.5;
  ctx.beginPath(); ctx.ellipse(so, so + 1, R * 1.25, R * 0.7, u.angle, 0, Math.PI * 2); ctx.fill();
  if (k === 'champion') {
    // hào quang
    ctx.fillStyle = `rgba(255,212,59,${0.18 + 0.08 * Math.sin(t / 200)})`;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.7, 0, Math.PI * 2); ctx.fill();
  }
  if (fly) ctx.translate(0, -4 - Math.sin(t / 120 + u.id) * 1.5);
  ctx.rotate(u.angle);

  const base = k === 'fire' ? '#e8590c' : color;
  const body = shade(base, -0.55);
  const bodyHi = shade(base, -0.25);
  const L = R / 7;
  // chân
  ctx.strokeStyle = shade(base, -0.7);
  ctx.lineWidth = Math.max(1, 1.1 * L);
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const swing = leg * (i === 0 ? -1 : 1) * 2.4 * L;
    for (const side of [-1, 1]) {
      const sw = side === 1 ? swing : -swing;
      ctx.beginPath();
      ctx.moveTo(i * 2.2 * L, 0);
      ctx.lineTo(i * 3 * L + sw * 0.5, side * 4.5 * L);
      ctx.lineTo(i * 4.6 * L + sw, side * 7.2 * L);
      ctx.stroke();
    }
  }
  // bụng
  const abd = k === 'bomber' ? 1.55 + 0.08 * Math.sin(t / 150 + u.id) : k === 'spitter' ? 1.35 : k === 'sniper' ? 0.85 : k === 'tank' || k === 'champion' ? 1.15 : 1;
  const abdLen = k === 'sniper' ? 1.35 : 1;
  ctx.fillStyle = k === 'bomber' ? '#5c940d' : color;
  ctx.beginPath(); ctx.ellipse(-6.4 * L, 0, 4.4 * L * abd * abdLen, 3.4 * L * abd, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(color, -0.5);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (k === 'spitter') {
    ctx.fillStyle = 'rgba(140,255,90,0.75)';
    ctx.beginPath(); ctx.ellipse(-7.4 * L, 0, 2.2 * L, 1.6 * L, 0, 0, Math.PI * 2); ctx.fill();
  } else if (k === 'bomber') {
    ctx.fillStyle = 'rgba(200,255,120,0.6)';
    for (const [dx, dy] of [[-8, -1.5], [-5.5, 1.8], [-9.5, 2]]) { ctx.beginPath(); ctx.arc(dx * L, dy * L, 1 * L, 0, Math.PI * 2); ctx.fill(); }
  } else if (k === 'medic') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(-6.4 * L, 0, 2.8 * L, 2.4 * L, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e03131';
    ctx.fillRect(-7.4 * L, -0.5 * L, 2 * L, 1 * L);
    ctx.fillRect(-6.9 * L, -1 * L, 1 * L, 2 * L);
  } else if (k === 'fire') {
    const fl = 0.7 + 0.3 * Math.sin(t / 60 + u.id);
    ctx.fillStyle = `rgba(255,200,60,${0.7 * fl})`;
    ctx.beginPath(); ctx.ellipse(-10.5 * L, 0, 2.6 * L * fl, 1.3 * L, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(-5.2 * L, -3 * L); ctx.lineTo(-5.2 * L, 3 * L); ctx.moveTo(-7.4 * L, -3 * L); ctx.lineTo(-7.4 * L, 3 * L); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath(); ctx.ellipse(-7.2 * L, -1.4 * L, 1.8 * L, 0.9 * L, 0, 0, Math.PI * 2); ctx.fill();
  // ngực
  ctx.fillStyle = bodyHi;
  ctx.beginPath(); ctx.ellipse(0, 0, 2.8 * L, 1.9 * L, 0, 0, Math.PI * 2); ctx.fill();
  if (fly) {
    const flap = Math.sin(t / 35 + u.id) * 0.5;
    ctx.fillStyle = 'rgba(220,240,255,0.55)';
    ctx.strokeStyle = 'rgba(120,150,180,0.7)';
    ctx.lineWidth = 0.6;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.rotate(side * (0.5 + flap));
      ctx.beginPath(); ctx.ellipse(-5 * L, side * 4.2 * L, 6.5 * L, 2.4 * L, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  // đầu
  const head = k === 'tank' ? 1.7 : k === 'champion' ? 1.5 : k === 'soldier' || k === 'shield' ? 1.3 : 1;
  const hx = 4.3 * L + (head - 1) * 2 * L;
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(hx, 0, 2.6 * L * head, 2.3 * L * head, 0, 0, Math.PI * 2); ctx.fill();
  // hàm
  const bite = atk ? Math.abs(Math.sin(t / 60)) * 0.6 : 0.15;
  ctx.strokeStyle = head > 1 ? '#2b1a0e' : body;
  ctx.lineWidth = Math.max(1.1, (k === 'tank' || k === 'champion' ? 2 : 1.3) * L);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + 2 * L * head, side * 1.2 * L * head);
    ctx.quadraticCurveTo(hx + 4.2 * L * head, side * (1.8 + bite * 3) * L * head, hx + 4.6 * L * head, side * (0.2 + bite) * L * head);
    ctx.stroke();
  }
  // râu
  ctx.strokeStyle = shade(base, -0.6);
  ctx.lineWidth = Math.max(0.8, 0.8 * L);
  const wig = Math.sin(t / 180 + u.id) * 0.25;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(hx + 1.5 * L, side * 1.2 * L);
    ctx.lineTo(hx + 4 * L, side * (3.4 + wig) * L);
    ctx.lineTo(hx + 7 * L, side * (3.2 - wig) * L);
    ctx.stroke();
  }
  if (k === 'sniper') {
    // ống ngắm dài
    ctx.strokeStyle = '#212529';
    ctx.lineWidth = 1.6 * L;
    ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx + 10 * L, 0); ctx.stroke();
    ctx.fillStyle = '#74c0fc';
    ctx.beginPath(); ctx.arc(hx + 1.5 * L, -1.5 * L, 1 * L, 0, Math.PI * 2); ctx.fill();
  }
  if (k === 'shield') {
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 2.4 * L;
    ctx.beginPath(); ctx.arc(hx - 1 * L, 0, 5 * L, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = '#868e96';
    ctx.lineWidth = 0.8 * L;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(hx + 0.8 * L * head, -1.2 * L * head, 0.7 * L * head, 0, Math.PI * 2); ctx.arc(hx + 0.8 * L * head, 1.2 * L * head, 0.7 * L * head, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (k === 'champion') {
    // vương miện không xoay
    ctx.save();
    ctx.translate(x, y - R - 6);
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#a07400';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(-7, -6); ctx.lineTo(-3.5, -3); ctx.lineTo(0, -8); ctx.lineTo(3.5, -3); ctx.lineTo(7, -6); ctx.lineTo(7, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, pct: number, h = 3) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = pct > 60 ? '#51cf66' : pct > 30 ? '#fcc419' : '#ff6b6b';
  ctx.fillRect(x - w / 2, y, (w * pct) / 100, h);
}

// ---------- đạn ----------

/** Vị trí đạn bám theo mục tiêu; mục tiêu chết thì bay tới chỗ cuối cùng thấy nó */
function shotPos(e: Effect, p: number, arc: number) {
  if (e.target !== undefined) {
    const tp = antsStore.unitPos(e.target);
    if (tp) { e.x2 = tp.x; e.y2 = tp.y; }
  }
  const q = Math.max(0, Math.min(1, p));
  return { x: e.x1 + (e.x2 - e.x1) * q, y: e.y1 + (e.y2 - e.y1) * q - Math.sin(q * Math.PI) * arc };
}

const BOOM_MS = 380;

function drawEffect(ctx: CanvasRenderingContext2D, e: Effect, now: number, z: number) {
  const age = now - e.t0;
  const p = age / e.dur;
  switch (e.kind) {
    case 'main':
    case 'side': {
      const big = e.kind === 'main';
      if (p < 1) {
        // vệt khói
        for (let i = 5; i >= 1; i--) {
          const tp = shotPos(e, p - i * 0.05, big ? 40 : 26);
          ctx.fillStyle = big ? `rgba(255,140,40,${0.12 * (6 - i)})` : `rgba(80,80,80,${0.1 * (6 - i)})`;
          ctx.beginPath(); ctx.arc(tp.x, tp.y, (big ? 7 : 4) * (1 - i * 0.12), 0, Math.PI * 2); ctx.fill();
        }
        const sp = shotPos(e, p, big ? 40 : 26);
        if (big) {
          ctx.shadowColor = '#ff922b';
          ctx.shadowBlur = 18;
          const g = ctx.createRadialGradient(sp.x - 2, sp.y - 2, 1, sp.x, sp.y, 11);
          g.addColorStop(0, '#fff3bf');
          g.addColorStop(0.5, '#ff922b');
          g.addColorStop(1, '#c92a2a');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 11, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = '#212529';
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath(); ctx.arc(sp.x - 1.6, sp.y - 1.6, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        const b = (age - e.dur) / BOOM_MS;
        const R = (big ? 46 : 28) * (0.4 + b);
        ctx.fillStyle = `rgba(255,${big ? 140 : 190},60,${0.7 * (1 - b)})`;
        ctx.beginPath(); ctx.arc(e.x2, e.y2, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - b)})`;
        ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.arc(e.x2, e.y2, R * 1.15, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    case 'acid':
    case 'snipe':
    case 'bomb':
    case 'heal': {
      if (p < 1) {
        const sp = shotPos(e, p, e.kind === 'bomb' ? 30 : e.kind === 'snipe' ? 0 : 12);
        if (e.kind === 'snipe') {
          ctx.strokeStyle = 'rgba(255,255,200,0.9)';
          ctx.lineWidth = 2 / z + 1;
          const back = shotPos(e, p - 0.12, 0);
          ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(sp.x, sp.y); ctx.stroke();
        } else {
          ctx.fillStyle = e.kind === 'heal' ? '#ff8787' : e.kind === 'bomb' ? '#82c91e' : '#a3ff6b';
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, e.kind === 'bomb' ? 5 : 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (e.kind === 'bomb') {
        const b = (age - e.dur) / BOOM_MS;
        ctx.fillStyle = `rgba(130,201,30,${0.5 * (1 - b)})`;
        ctx.beginPath(); ctx.arc(e.x2, e.y2, 55 * (0.5 + b * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'heal') {
        const b = (age - e.dur) / BOOM_MS;
        ctx.fillStyle = `rgba(255,135,135,${1 - b})`;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('+', e.x2 - 3, e.y2 - 10 - b * 12);
      }
      break;
    }
    case 'death': {
      ctx.fillStyle = `rgba(90,60,40,${0.6 * (1 - p)})`;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(e.x1 + Math.cos(a) * p * 14, e.y1 + Math.sin(a) * p * 14, 3.5 * (1 - p) + 1, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'rubble': {
      ctx.fillStyle = `rgba(140,120,100,${0.6 * (1 - p)})`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + i;
        ctx.beginPath(); ctx.arc(e.x1 + Math.cos(a) * p * 70, e.y1 + Math.sin(a) * p * 55, 16 * (1 - p) + 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'ping': {
      ctx.strokeStyle = `rgba(255,80,80,${1 - p})`;
      ctx.lineWidth = 3 / z;
      for (const k of [0, 0.33]) {
        const q = (p * 3 + k) % 1;
        ctx.beginPath(); ctx.arc(e.x1, e.y1, 30 + q * 90, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

const effectLife = (e: Effect) => e.dur + (e.kind === 'main' || e.kind === 'side' || e.kind === 'bomb' || e.kind === 'heal' ? BOOM_MS : 0);

// ---------- vẽ cả cảnh ----------

export function renderScene(ctx: CanvasRenderingContext2D, o: RenderOpts) {
  const { w, h, dpr, cam } = o;
  const st = antsStore;
  const now = performance.now();
  const a = st.alpha(now);
  const z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = o.dark ? '#120d09' : '#3b2a1c';
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
  const vx0 = cam.x - w / 2 / z, vy0 = cam.y - h / 2 / z, vx1 = cam.x + w / 2 / z, vy1 = cam.y + h / 2 / z;
  const onScreen = (x: number, y: number, r: number) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;

  ctx.fillStyle = soilPattern(ctx, o.dark) ?? '#b48a5a';
  ctx.fillRect(Math.max(0, vx0), Math.max(0, vy0), Math.min(st.mapW, vx1) - Math.max(0, vx0), Math.min(st.mapH, vy1) - Math.max(0, vy0));
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 8 / z;
  ctx.strokeRect(0, 0, st.mapW, st.mapH);

  for (let i = 0; i < o.rocks.length; i += 3) {
    if (onScreen(o.rocks[i], o.rocks[i + 1], o.rocks[i + 2])) drawRock(ctx, o.rocks[i], o.rocks[i + 1], o.rocks[i + 2], i, o.dark);
  }

  // tầm bắn của trụ đang chọn / đang trỏ
  for (const t of st.towers.values()) {
    if (!o.selected.has(t.id) && o.hover !== t.id) continue;
    const s = ANT_TOWERS[t.kind];
    ctx.fillStyle = 'rgba(255,107,107,0.06)';
    ctx.strokeStyle = 'rgba(255,107,107,0.5)';
    ctx.setLineDash([10 / z, 8 / z]);
    ctx.lineWidth = 2 / z;
    ctx.beginPath(); ctx.arc(t.x, t.y, s.range + s.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }

  // điểm tập kết
  if (o.rally && o.showRally) {
    const [rx, ry] = o.rally;
    ctx.fillStyle = '#69db7c';
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 24); ctx.lineTo(rx + 14, ry - 18); ctx.lineTo(rx, ry - 13); ctx.fill();
    ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry - 24); ctx.stroke();
    ctx.strokeStyle = 'rgba(105,219,124,0.6)';
    ctx.lineWidth = 1.5 / z;
    ctx.beginPath(); ctx.ellipse(rx, ry, 16, 10, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // dấu mục tiêu tổng tấn công
  if (o.target) {
    const [tx, ty] = o.target;
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    ctx.strokeStyle = `rgba(255,70,70,${0.55 + 0.4 * pulse})`;
    ctx.lineWidth = 4 / z;
    const R = 64 + pulse * 8;
    ctx.beginPath(); ctx.arc(tx, ty, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + now / 1500;
      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(a) * (R - 14), ty + Math.sin(a) * (R - 14));
      ctx.lineTo(tx + Math.cos(a) * (R + 16), ty + Math.sin(a) * (R + 16));
      ctx.stroke();
    }
  }

  for (const t of st.towers.values()) {
    if (o.selected.has(t.id)) {
      ctx.strokeStyle = '#69db7c';
      ctx.lineWidth = 3 / z;
      ctx.beginPath(); ctx.arc(t.x, t.y, ANT_TOWERS[t.kind].radius + 14, 0, Math.PI * 2); ctx.stroke();
    }
    if (onScreen(t.x, t.y, 80)) drawTower(ctx, t, o.colors[t.owner] ?? '#888', now);
  }

  const units = [...st.units.values()].sort((p, q) => ANT_UNITS[p.kind].radius - ANT_UNITS[q.kind].radius || (p.flags & 4) - (q.flags & 4));
  for (const u of units) {
    const x = u.px + (u.x - u.px) * a, y = u.py + (u.y - u.py) * a;
    if (!onScreen(x, y, 40)) continue;
    const moved = Math.hypot(u.x - u.px, u.y - u.py);
    u.phase += moved * 0.06 + (moved > 0.3 ? 0.25 : 0);
    const R = ANT_UNITS[u.kind].radius;
    if (o.selected.has(u.id) || o.hover === u.id) {
      ctx.strokeStyle = o.selected.has(u.id) ? '#69db7c' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.8 / z;
      ctx.beginPath(); ctx.ellipse(x, y + 2, R + 4, (R + 4) * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
    }
    drawAnt(ctx, u, x, y, o.colors[u.owner] ?? '#888', now);
  }
  for (const u of units) {
    if (u.hp >= 100 && !o.selected.has(u.id)) continue;
    const x = u.px + (u.x - u.px) * a, y = u.py + (u.y - u.py) * a;
    if (!onScreen(x, y, 40)) continue;
    const R = ANT_UNITS[u.kind].radius;
    hpBar(ctx, x, y - R - (u.kind === 'champion' ? 18 : 9), Math.max(16, R * 2.4), u.hp);
  }
  for (const t of st.towers.values()) {
    if (!onScreen(t.x, t.y, 90)) continue;
    const r = ANT_TOWERS[t.kind].radius;
    hpBar(ctx, t.x, t.y + r + 14, r * 2.2, t.hp, 5);
  }

  st.effects = st.effects.filter((e) => now - e.t0 < effectLife(e));
  for (const e of st.effects) {
    if (onScreen(e.x1, e.y1, 400) || onScreen(e.x2, e.y2, 100)) drawEffect(ctx, e, now, z);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (o.box) {
    const x = Math.min(o.box.x0, o.box.x1), y = Math.min(o.box.y0, o.box.y1);
    const bw = Math.abs(o.box.x1 - o.box.x0), bh = Math.abs(o.box.y1 - o.box.y0);
    ctx.fillStyle = 'rgba(105,219,124,0.12)';
    ctx.strokeStyle = 'rgba(105,219,124,0.9)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeRect(x + 0.5, y + 0.5, bw, bh);
  }
}

// ---------- bản đồ nhỏ ----------

export function renderMinimap(ctx: CanvasRenderingContext2D, size: number, dpr: number, cam: Camera, viewW: number, viewH: number, rocks: number[], colors: string[], target?: [number, number]) {
  const st = antsStore;
  const k = size / Math.max(st.mapW, st.mapH, 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5a4128';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#7d6a58';
  for (let i = 0; i < rocks.length; i += 3) {
    ctx.beginPath(); ctx.arc(rocks[i] * k, rocks[i + 1] * k, Math.max(1.5, rocks[i + 2] * k), 0, Math.PI * 2); ctx.fill();
  }
  for (const u of st.units.values()) {
    ctx.fillStyle = colors[u.owner] ?? '#888';
    ctx.fillRect(u.x * k - 1, u.y * k - 1, 2.2, 2.2);
  }
  // trụ luôn vẽ trên cùng
  for (const t of st.towers.values()) {
    const s = t.kind === 'main' ? 9 : 6;
    ctx.fillStyle = colors[t.owner] ?? '#888';
    ctx.beginPath(); ctx.arc(t.x * k, t.y * k, s / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = t.kind === 'main' ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const e of st.effects) {
    if (e.kind !== 'ping') continue;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.x1 * k, e.y1 * k, 6 + ((performance.now() - e.t0) / 120) % 8, 0, Math.PI * 2); ctx.stroke();
  }
  if (target) {
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    const r = 7 + Math.sin(performance.now() / 220) * 1.5;
    ctx.beginPath(); ctx.arc(target[0] * k, target[1] * k, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(target[0] * k - r - 3, target[1] * k); ctx.lineTo(target[0] * k + r + 3, target[1] * k);
    ctx.moveTo(target[0] * k, target[1] * k - r - 3); ctx.lineTo(target[0] * k, target[1] * k + r + 3); ctx.stroke();
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.2;
  ctx.strokeRect((cam.x - viewW / 2 / cam.zoom) * k, (cam.y - viewH / 2 / cam.zoom) * k, (viewW / cam.zoom) * k, (viewH / cam.zoom) * k);
}

export const UNIT_ICON: Record<AntUnitKind, string> = {
  soldier: '🛡️', fire: '🔥', spitter: '🧪', flier: '🪽', shield: '🪨', sniper: '🎯', medic: '💉', bomber: '💣', tank: '🦏', champion: '👑',
};

/** Vẽ một con kiến đứng yên vào ô danh sách quân */
export function drawAntIcon(canvas: HTMLCanvasElement, kind: AntUnitKind, color: string) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 44;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const R = ANT_UNITS[kind].radius * ANT_DRAW_SCALE;
  // thân kiến dài khoảng 3.2 lần bán kính (cả râu và hàm)
  const scale = (size * 0.86) / (R * 3.3);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, (dpr * size) / 2, (dpr * size) / 2 + (kind === 'champion' ? dpr * 4 : 0));
  const u: UnitState = { id: 1, owner: 0, kind, x: 0, y: 0, px: 0, py: 0, hp: 100, flags: 0, angle: -Math.PI / 2, phase: 0 };
  drawAnt(ctx, u, 0, 0, color, 0);
}
