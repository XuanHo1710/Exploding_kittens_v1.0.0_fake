/**
 * Hiệu ứng Nối Thú (canvas 2D, không thư viện): đường nối phát sáng, ô nổ tung, tia sét bay lên Boss,
 * số sát thương, Siêu Đấm lóe trắng, chiêu bay sang bàn đối thủ, Boss nổi giận, K.O. và pháo hoa.
 * Cùng file: hình Boss Vua Sấm Sét (thiết kế riêng của game).
 */
import { LINK_CRITTERS, type LinkFx } from '../../../shared/src';
import type { FxItem } from './store';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface FxLayout {
  /** tâm ô trên bàn chính */
  cell(i: number): Pt;
  /** điểm lưới (kể cả viền -1 / W / H) → màn hình */
  point(x: number, y: number): Pt;
  tile: number;
  board: Rect;
  /** khung bàn nhỏ của từng đối thủ */
  foeRect(id: string): Rect | undefined;
  boss?: Rect;
  /** người chơi có bàn chính (mình, hoặc người 1 nếu đang xem) */
  mainId?: string;
  /** cỡ khung vẽ (px CSS) */
  w: number;
  h: number;
}

const LIFE: Record<LinkFx['k'], number> = {
  match: 650, hit: 900, super: 1300, skill: 1100, boss: 1500, clear: 1600, ko: 2600, miss: 400,
};

const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const ease = (t: number) => 1 - (1 - t) ** 3;

/** số ngẫu nhiên ổn định theo hạt giống (để hạt không nhảy giữa các khung hình) */
function rand(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bolt(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, seed: number, width: number, color: string, jag = 26) {
  const r = rand(seed);
  const n = 9;
  const pts: Pt[] = [a];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const off = (r() - 0.5) * jag * 2 * Math.sin(Math.PI * t);
    pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  pts.push(b);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 4;
  for (const [w, c] of [[width * 2.4, color], [width, '#ffffff']] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

function burst(ctx: CanvasRenderingContext2D, p: Pt, t: number, seed: number, color: string, n: number, dist: number, size: number) {
  const r = rand(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = dist * (0.4 + r() * 0.6) * ease(t);
    const s = size * (1 - t) * (0.5 + r() * 0.7);
    if (s <= 0.2) continue;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = i % 3 === 0 ? '#fff' : color;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d + t * t * dist * 0.4, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bigText(ctx: CanvasRenderingContext2D, text: string, p: Pt, size: number, color: string, alpha: number, scale = 1) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);
  ctx.font = `900 ${size}px system-ui, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#1a0f2e';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.4;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Vẽ mọi hiệu ứng còn sống, xoá cái đã hết. Trả về độ rung màn hình (px) và độ lóe trắng (0..1).
 */
export function drawFx(ctx: CanvasRenderingContext2D, items: FxItem[], now: number, L: FxLayout): { shake: number; flash: number; keep: FxItem[] } {
  let shake = 0;
  let flash = 0;
  const keep: FxItem[] = [];
  const W = L.w, H = L.h;
  const screenMid: Pt = { x: L.board.x + L.board.w / 2, y: L.board.y + L.board.h / 2 };
  const bossP = L.boss ? center(L.boss) : { x: screenMid.x, y: L.board.y - 40 };
  /** vị trí của một người: bàn chính nếu là mình, không thì bàn nhỏ của họ */
  const posOf = (id: string): Pt => {
    if (id === L.mainId) return screenMid;
    const r = L.foeRect(id);
    return r ? center(r) : { x: W - 60, y: 80 };
  };
  for (const it of items) {
    const f = it.fx;
    const age = now - it.t0;
    const life = LIFE[f.k] ?? 800;
    if (age > life || age < 0) {
      if (age < 0) keep.push(it);
      continue;
    }
    keep.push(it);
    const t = age / life;
    const seed = Math.floor(it.t0 * 1000) % 1e9;
    const mine = 'who' in f && f.who === L.mainId;

    switch (f.k) {
      case 'match': {
        const color = LINK_CRITTERS[f.kind]?.color ?? '#ffd43b';
        if (mine) {
          // đường nối phát sáng
          if (age < 320) {
            ctx.save();
            ctx.globalAlpha = 1 - age / 320;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowColor = '#ffe066';
            ctx.shadowBlur = 18;
            for (const [w, c] of [[L.tile * 0.22, '#ffd43b'], [L.tile * 0.08, '#fff']] as const) {
              ctx.strokeStyle = c;
              ctx.lineWidth = w;
              ctx.beginPath();
              f.path.forEach(([x, y], i) => {
                const p = L.point(x, y);
                if (i) ctx.lineTo(p.x, p.y);
                else ctx.moveTo(p.x, p.y);
              });
              ctx.stroke();
            }
            ctx.restore();
          }
          const pa = L.cell(f.a), pb = L.cell(f.b);
          burst(ctx, pa, t, seed, color, 14, L.tile * 1.1, L.tile * 0.12);
          burst(ctx, pb, t, seed + 7, color, 14, L.tile * 1.1, L.tile * 0.12);
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - t * L.tile * 1.4 };
          const label = f.combo > 1 ? `+${f.pts}  x${f.combo}` : `+${f.pts}`;
          bigText(ctx, label, mid, L.tile * (0.42 + Math.min(f.combo, 6) * 0.05), f.combo > 2 ? '#ff922b' : '#ffe066', 1 - t * t);
        } else {
          // đối thủ nối: lóe sáng nhỏ trên bàn mini của họ
          const r = L.foeRect(f.who);
          if (r) burst(ctx, center(r), t, seed, color, 6, r.w * 0.12, 2.5);
        }
        break;
      }
      case 'hit': {
        const from = mine ? (() => {
          const a = L.cell(f.a), b = L.cell(f.b);
          return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        })() : posOf(f.who);
        const travel = Math.min(1, age / 220);
        if (age < 420) {
          const tip = { x: from.x + (bossP.x - from.x) * travel, y: from.y + (bossP.y - from.y) * travel };
          ctx.save();
          ctx.globalAlpha = age < 220 ? 1 : 1 - (age - 220) / 200;
          bolt(ctx, from, tip, seed + Math.floor(age / 60), mine ? 3.2 : 2, mine ? '#74c0fc' : '#da77f2', mine ? 26 : 16);
          ctx.restore();
        }
        if (age > 200) {
          const tt = (age - 200) / (life - 200);
          const r = rand(seed);
          const off = { x: (r() - 0.5) * (L.boss?.w ?? 200) * 0.35, y: (r() - 0.5) * 20 };
          const size = (mine ? 30 : 22) + Math.min(f.combo, 6) * 4 + (f.long ? 6 : 0);
          bigText(ctx, `-${f.dmg}`, { x: bossP.x + off.x, y: bossP.y + off.y - tt * 50 }, size, mine ? '#ffe066' : '#e599f7', 1 - tt * tt, 1 + (1 - tt) * 0.4);
          if (f.long && mine) bigText(ctx, 'ĐẤM XA!', { x: bossP.x + off.x, y: bossP.y + off.y - 34 - tt * 50 }, 18, '#74c0fc', 1 - tt);
          burst(ctx, bossP, tt, seed + 3, mine ? '#74c0fc' : '#da77f2', 10, 60, 4);
          if (age < 320) shake = Math.max(shake, mine ? 4 : 2);
        }
        break;
      }
      case 'super': {
        if (age < 180) flash = Math.max(flash, 0.85 * (1 - age / 180));
        if (age < 600) shake = Math.max(shake, 14 * (1 - age / 600));
        if (age < 700) {
          for (let i = 0; i < 5; i++) {
            const x = bossP.x + (i - 2) * ((L.boss?.w ?? 300) * 0.12);
            bolt(ctx, { x: x + (i - 2) * 30, y: 0 }, { x, y: bossP.y }, seed + i * 31 + Math.floor(age / 50), 5, '#ffe066', 40);
          }
        }
        bigText(ctx, 'SIÊU ĐẤM!', { x: screenMid.x, y: (L.boss ? L.boss.y + L.boss.h + 20 : H * 0.3) }, 54, '#ffe066', 1 - t * t, 0.6 + ease(Math.min(1, t * 4)) * 0.6);
        bigText(ctx, `-${f.dmg}`, { x: bossP.x, y: bossP.y - t * 60 }, 48, '#fff', 1 - t);
        burst(ctx, bossP, t, seed, '#ffe066', 30, 160, 7);
        break;
      }
      case 'skill': {
        const toMe = f.to === L.mainId;
        const from = posOf(f.from);
        const to = posOf(f.to);
        const travel = ease(Math.min(1, age / 500));
        const p = { x: from.x + (to.x - from.x) * travel, y: from.y + (to.y - from.y) * travel - Math.sin(Math.PI * travel) * 80 };
        const ice = f.kind === 'freeze';
        if (age < 520) {
          ctx.save();
          ctx.shadowColor = ice ? '#a5d8ff' : '#b2f2bb';
          ctx.shadowBlur = 24;
          ctx.fillStyle = ice ? '#d0ebff' : '#c3fae8';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          bigText(ctx, ice ? '❄' : '🌪', p, 22, '#fff', 1);
        } else {
          burst(ctx, to, (age - 520) / (life - 520), seed, ice ? '#a5d8ff' : '#63e6be', 18, 90, 5);
          bigText(ctx, ice ? 'ĐÓNG BĂNG!' : 'BÃO XÁO!', { x: to.x, y: to.y - 20 }, toMe ? 44 : 22, ice ? '#a5d8ff' : '#63e6be', 1 - (age - 520) / (life - 520));
          if (toMe && age < 800) shake = Math.max(shake, 6);
        }
        break;
      }
      case 'boss': {
        const below = L.boss ? { x: screenMid.x, y: L.boss.y + L.boss.h + 26 } : { x: screenMid.x, y: H * 0.25 };
        if (f.kind === 'rage') {
          ctx.save();
          const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
          g.addColorStop(0, 'rgba(255,0,0,0)');
          g.addColorStop(1, `rgba(255,30,30,${0.45 * (1 - t)})`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          if (age < 700) shake = Math.max(shake, 8 * (1 - age / 700));
          bigText(ctx, f.phase === 1 ? 'VUA SẤM SÉT XUẤT HIỆN!' : 'VUA SẤM SÉT NỔI GIẬN!', below, f.phase === 1 ? 40 : 44, '#ff6b6b', 1 - t * t, 0.7 + ease(Math.min(1, t * 3)) * 0.4);
        } else if (f.kind === 'ice') {
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 26; i++) {
            const x = L.board.x + r() * L.board.w;
            const y = L.board.y - 40 + (L.board.h + 80) * ease(Math.min(1, t * 1.4 + r() * 0.2));
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = i % 2 ? '#e7f5ff' : '#a5d8ff';
            ctx.beginPath();
            ctx.moveTo(x, y - 10); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 5, y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
          bigText(ctx, 'MƯA BĂNG!', below, 36, '#a5d8ff', 1 - t);
        } else if (f.kind === 'dark') {
          bigText(ctx, 'BÓNG TỐI!', below, 36, '#b197fc', 1 - t);
        } else {
          ctx.save();
          ctx.translate(screenMid.x, screenMid.y);
          ctx.rotate(t * Math.PI * 4);
          ctx.strokeStyle = `rgba(99,230,190,${0.7 * (1 - t)})`;
          ctx.lineWidth = 6;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, 40 + i * 50 + t * 80, i, i + 2.2);
            ctx.stroke();
          }
          ctx.restore();
          bigText(ctx, 'LỐC XÁO!', below, 36, '#63e6be', 1 - t);
        }
        break;
      }
      case 'clear': {
        const target = mine ? L.board : L.foeRect(f.who);
        if (!target) break;
        for (let k = 0; k < 4; k++) {
          const r = rand(seed + k);
          const p = { x: target.x + target.w * (0.2 + r() * 0.6), y: target.y + target.h * (0.2 + r() * 0.5) };
          const tt = Math.min(1, Math.max(0, (t - k * 0.12) / 0.6));
          if (tt > 0 && tt < 1) burst(ctx, p, tt, seed + k * 13, ['#ffd43b', '#ff6b6b', '#74c0fc', '#69db7c'][k], 24, mine ? 120 : 40, mine ? 5 : 2);
        }
        if (mine) bigText(ctx, 'DỌN SẠCH BÀN!', center(L.board), 48, '#69db7c', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.3);
        break;
      }
      case 'ko': {
        if (age < 220) flash = Math.max(flash, 1 - age / 220);
        if (age < 900) shake = Math.max(shake, 18 * (1 - age / 900));
        burst(ctx, bossP, Math.min(1, t * 1.4), seed, '#ffd43b', 60, 260, 9);
        burst(ctx, bossP, Math.min(1, t * 1.1), seed + 9, '#ff6b6b', 40, 200, 7);
        const s = age < 400 ? 0.4 + ease(age / 400) * 1.0 : 1.4 - Math.min(0.2, (age - 400) / 4000);
        bigText(ctx, 'K.O.!', { x: W / 2, y: H / 2 }, Math.min(110, W * 0.22), '#ffd43b', t < 0.8 ? 1 : (1 - t) * 5, s);
        break;
      }
      case 'miss':
        break;
    }
  }
  return { shake, flash, keep };
}

// ---------------- Boss Vua Sấm Sét ----------------

const PHASE_COLORS = [
  { body: '#ffd43b', dark: '#e8a400', eye: '#fff3bf', glow: '#ffe066' },
  { body: '#ff922b', dark: '#d9480f', eye: '#ffe8cc', glow: '#ffa94d' },
  { body: '#e03131', dark: '#862e9c', eye: '#ffc9c9', glow: '#ff6b6b' },
];

/**
 * Vẽ Boss (thú khổng lồ có sừng tia chớp) vào khung (cx, cy) cao size.
 * hitAge: ms từ cú đấm gần nhất (giật lùi + chớp trắng). dead: đã bị K.O.
 */
export function drawBoss(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, now: number, phase: 1 | 2 | 3, hitAge: number, dead: boolean) {
  const c = PHASE_COLORS[phase - 1];
  const bob = Math.sin(now / 380) * size * 0.025;
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * size * 0.06 : 0;
  const s = size;
  ctx.save();
  ctx.translate(cx + (phase === 3 ? Math.sin(now / 45) * 1.5 : 0), cy + bob - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(0.3);
  }
  // hào quang
  const aura = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.75);
  aura.addColorStop(0, `${c.glow}66`);
  aura.addColorStop(1, `${c.glow}00`);
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2); ctx.fill();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a0f2e';
  ctx.lineWidth = s * 0.03;
  // sừng tia chớp
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff3bf';
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.18, -s * 0.28);
    ctx.lineTo(sx * s * 0.34, -s * 0.52);
    ctx.lineTo(sx * s * 0.3, -s * 0.42);
    ctx.lineTo(sx * s * 0.46, -s * 0.62);
    ctx.lineTo(sx * s * 0.36, -s * 0.36);
    ctx.lineTo(sx * s * 0.4, -s * 0.4);
    ctx.lineTo(sx * s * 0.3, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // tay
  for (const sx of [-1, 1]) {
    const swing = Math.sin(now / 300 + sx) * 0.15;
    ctx.save();
    ctx.translate(sx * s * 0.36, s * 0.05);
    ctx.rotate(sx * (0.5 + swing));
    ctx.fillStyle = c.dark;
    ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.09, s * 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.035, s * 0.23); ctx.lineTo(k * s * 0.035 + s * 0.012, s * 0.29); ctx.lineTo(k * s * 0.035 - s * 0.012, s * 0.24); ctx.fill(); }
    ctx.restore();
  }
  // thân
  const g = ctx.createRadialGradient(-s * 0.12, -s * 0.15, s * 0.05, 0, 0, s * 0.45);
  g.addColorStop(0, '#fff8db');
  g.addColorStop(0.25, c.body);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  // viền lông lởm chởm
  const spikes = 22;
  for (let i = 0; i <= spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    const r = s * (i % 2 ? 0.36 : 0.4) * (1 + (a > Math.PI ? 0.04 : 0));
    ctx.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // vằn sét trên bụng
  ctx.fillStyle = '#1a0f2e';
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  ctx.moveTo(-s * 0.04, s * 0.08); ctx.lineTo(s * 0.06, s * 0.08); ctx.lineTo(0, s * 0.18); ctx.lineTo(s * 0.07, s * 0.18); ctx.lineTo(-s * 0.05, s * 0.33); ctx.lineTo(-s * 0.01, s * 0.21); ctx.lineTo(-s * 0.07, s * 0.21);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = dead ? 0.25 : 1;
  // mắt giận dữ phát sáng
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = s * 0.12;
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.06, -s * 0.12);
    ctx.lineTo(sx * s * 0.22, -s * 0.18);
    ctx.lineTo(sx * s * 0.19, -s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1a0f2e';
    ctx.beginPath(); ctx.arc(sx * s * 0.15, -s * 0.11, s * 0.025, 0, Math.PI * 2); ctx.fill();
  }
  // miệng + nanh
  const open = phase === 1 ? 0.05 : phase === 2 ? 0.07 : 0.1;
  ctx.fillStyle = '#3b0a0a';
  ctx.beginPath(); ctx.ellipse(0, s * 0.02, s * 0.14, s * (open + Math.abs(Math.sin(now / 260)) * 0.02), 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sx * s * 0.09, s * 0.02); ctx.lineTo(sx * s * 0.06, s * 0.09); ctx.lineTo(sx * s * 0.035, s * 0.02); ctx.closePath(); ctx.fill();
  }
  // vương miện
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, -s * 0.31); ctx.lineTo(-s * 0.13, -s * 0.42); ctx.lineTo(-s * 0.065, -s * 0.36); ctx.lineTo(0, -s * 0.46); ctx.lineTo(s * 0.065, -s * 0.36); ctx.lineTo(s * 0.13, -s * 0.42); ctx.lineTo(s * 0.13, -s * 0.31);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e64980';
  ctx.beginPath(); ctx.arc(0, -s * 0.35, s * 0.022, 0, Math.PI * 2); ctx.fill();
  // chớp trắng khi bị đánh
  if (hitAge < 110 && !dead) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - hitAge / 110)})`;
    ctx.fillRect(-s, -s, s * 2, s * 2);
  }
  ctx.restore();
}
