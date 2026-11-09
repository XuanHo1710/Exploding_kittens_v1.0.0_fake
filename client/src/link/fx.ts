/**
 * Hiệu ứng Nối Thú (canvas 2D, không thư viện): đường nối phát sáng, ô nổ tung, tia sét bay lên Boss,
 * số sát thương, Siêu Đấm lóe trắng, chiêu bay sang bàn đối thủ, Boss nổi giận, K.O. và pháo hoa.
 * Cùng file: hình 3 Boss Vua Sấm Sét, Nữ Hoàng Nhện, Bạo Chúa và kiểu ô bị khoá (thiết kế riêng của game).
 */
import { LINK_BOSSES, LINK_BOSS_BLACKHOLE, LINK_CELLS, LINK_CRITTERS, type LinkBossId, type LinkFx, type LinkLock } from '../../../shared/src';
import { drawOverlord } from './overlord';
import { drawTitan, TITAN_EYES, TITAN_HANDS_FIRE } from './titan';
import type { FxItem } from './store';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface FxLayout {
  /** tâm ô trên bàn chính */
  cell(i: number): Pt;
  /** điểm lưới (kể cả viền -1 / W / H) → màn hình */
  /** side: bàn trái (0) / phải (1) khi đánh Cự Thần */
  point(x: number, y: number, side?: number): Pt;
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
  match: 650, hit: 900, super: 1300, skill: 1100, boss: 1500, clear: 1600, ko: 2600, miss: 400, shuffle: 900,
};

/** màu chữ / hạt của từng Boss */
const BOSS_TINT: Record<LinkBossId, string> = { thunder: '#ffd43b', spider: '#da77f2', tyrant: '#ff6b2c', twins: '#e599f7', overlord: '#f783ac', titan: '#74c0fc' };
/** 4 màu linh hồn Boss trong Trùm Cuối */
const SOULS = ['#ffd43b', '#da77f2', '#ff6b2c', '#74c0fc'];
const bossName = (id?: LinkBossId) => (LINK_BOSSES.find((b) => b.id === id) ?? LINK_BOSSES[0]).name.toUpperCase();

const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** điểm trên Cự Thần (toạ độ tương đối theo cỡ vẽ) → màn hình; khớp drawBoss: tâm 0.55h + 0.2h, cỡ 0.82h */
const titanAt = (L: FxLayout, rel: readonly [number, number]): Pt | undefined => {
  if (!L.boss) return undefined;
  const h = L.boss.h, sz = h * 1.05 * 0.78;
  return { x: L.boss.x + L.boss.w / 2 + rel[0] * sz, y: L.boss.y + h * 0.55 + h * 1.05 * 0.19 + rel[1] * sz };
};
/** sắp các ô trúng theo cột trên bàn (để tia quét đi đúng thứ tự dù bàn xoay dọc) */
const byCol = (gs: number[]) => [...gs].sort((a, b) => ((a % LINK_CELLS) % 16) - ((b % LINK_CELLS) % 16));
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
  ctx.font = `900 ${size}px system-ui, "Segoe UI", sans-serif`;
  // màn hình hẹp: thu nhỏ để chữ không tràn ra ngoài
  const maxW = (ctx.canvas.clientWidth || ctx.canvas.width) * 0.94;
  const fitK = Math.min(1, maxW / Math.max(1, ctx.measureText(text).width * scale));
  ctx.translate(p.x, p.y);
  ctx.scale(scale * fitK, scale * fitK);
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
          // đường nối phát sáng (đỏ cam viền vàng nổi bật trên nền sáng chuẩn Pikachu cổ điển)
          if (age < 320) {
            ctx.save();
            ctx.globalAlpha = 1 - age / 320;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowColor = 'rgba(239,68,68,0.65)';
            ctx.shadowBlur = 12;
            for (const [w, c] of [[L.tile * 0.16, '#ef4444'], [L.tile * 0.06, '#fef08a']] as const) {
              ctx.strokeStyle = c;
              ctx.lineWidth = w;
              ctx.beginPath();
              f.path.forEach(([x, y], i) => {
                const p = L.point(x, y, f.side ?? 0);
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
        }
        break;
      }
      case 'super': {
        if (age < 180) flash = Math.max(flash, 0.85 * (1 - age / 180));
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
          ctx.shadowColor = ice ? '#a5d8ff' : '#dee2e6';
          ctx.shadowBlur = 24;
          ctx.fillStyle = ice ? '#d0ebff' : '#f1f3f5';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          bigText(ctx, ice ? '❄' : '🌫', p, 22, '#fff', 1);
        } else {
          burst(ctx, to, (age - 520) / (life - 520), seed, ice ? '#a5d8ff' : '#adb5bd', 18, 90, 5);
          bigText(ctx, ice ? 'ĐÓNG BĂNG!' : 'MÂY MÙ!', { x: to.x, y: to.y - 20 }, toMe ? 44 : 22, ice ? '#a5d8ff' : '#dee2e6', 1 - (age - 520) / (life - 520));
        }
        break;
      }
      case 'boss': {
        const below = L.boss ? { x: screenMid.x, y: L.boss.y + L.boss.h + 26 } : { x: screenMid.x, y: H * 0.25 };
        const tint = BOSS_TINT[f.boss] ?? '#ff6b6b';
        if (f.boss === 'twins' && f.kind !== 'rage' && age < 650) {
          // Song Sát ra chiêu: 2 Boss cùng giáng sét tím + vàng xuống bàn, màn hình rung mạnh
          if (age < 140) flash = Math.max(flash, 0.45 * (1 - age / 140));
          shake = Math.max(shake, 12 * (1 - age / 650));
          const mid = center(L.board);
          const flick = Math.floor(age / 50);
          bolt(ctx, { x: bossP.x - 60, y: bossP.y }, { x: mid.x - L.board.w * 0.2, y: mid.y }, seed + flick, 4, '#b197fc', 42);
          bolt(ctx, { x: bossP.x + 60, y: bossP.y }, { x: mid.x + L.board.w * 0.2, y: mid.y }, seed + 7 + flick, 4, '#ffd43b', 42);
          ctx.save();
          ctx.globalAlpha = 0.5 * (1 - age / 650);
          ctx.strokeStyle = '#e599f7';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, Math.max(L.board.w, L.board.h) * 0.7 * ease(age / 650), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        if (f.kind === 'rage' && f.boss === 'titan') {
          // Cự Thần giáng lâm / thịnh nộ: bầu trời tối, mưa sao, vòng thiên hà loé sáng
          ctx.save();
          ctx.fillStyle = `rgba(3,4,20,${0.65 * (1 - t)})`;
          ctx.fillRect(0, 0, W, H);
          const r = rand(seed);
          for (let i = 0; i < 70; i++) {
            const x = r() * W, y = r() * H;
            ctx.globalAlpha = (1 - t) * (0.4 + 0.6 * Math.abs(Math.sin(now / 120 + i)));
            ctx.fillStyle = i % 5 ? '#ffffff' : '#ffe066';
            ctx.beginPath();
            ctx.arc(x, y, 1 + r() * 2, 0, Math.PI * 2);
            ctx.fill();
          }
          for (let i = 0; i < 6; i++) {
            const sx = r() * W, k = Math.min(1, t * 2 + r() * 0.3);
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = '#a5d8ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sx, -20 + k * H * 0.6);
            ctx.lineTo(sx - 60, -20 + k * H * 0.6 - 60);
            ctx.stroke();
          }
          ctx.restore();
          if (age < 260) flash = Math.max(flash, 0.9 * (1 - age / 260));
          if (age < 1300) shake = Math.max(shake, 18 * (1 - age / 1300));
          ctx.save();
          for (let k = 0; k < 4; k++) {
            const tt = Math.min(1, Math.max(0, t * 1.5 - k * 0.15));
            if (tt <= 0 || tt >= 1) continue;
            ctx.globalAlpha = 1 - tt;
            ctx.strokeStyle = ['#74c0fc', '#ffd43b', '#da77f2', '#ffffff'][k];
            ctx.lineWidth = 8 * (1 - tt) + 1;
            ctx.beginPath();
            ctx.ellipse(bossP.x, bossP.y, Math.max(W, H) * ease(tt), Math.max(W, H) * ease(tt) * 0.55, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
          const title = f.phase === 1 ? '🌌 CỰ THẦN THIÊN HÀ GIÁNG LÂM!' : `🌌 CỰ THẦN THỊNH NỘ! CÒN ${f.left ?? '?'}/10 THANH MÁU`;
          const sub = f.phase === 1 ? 'TRÙM CUỐI · 10 THANH MÁU · 2 BÀN TRÁI + PHẢI · SÁT THƯƠNG x2' : f.phase === 2 ? 'SONG NHÃN BẮN MẠNH HƠN · MƯA SAO BĂNG DÀY HƠN' : 'CƠN THỊNH NỘ CỦA VŨ TRỤ · DỐC HẾT SỨC!';
          bigText(ctx, title, below, Math.min(38, (W * 1.5) / title.length), f.phase === 1 ? '#a5d8ff' : '#ff6b6b', 1 - t * t, 0.75 + ease(Math.min(1, t * 3)) * 0.4);
          bigText(ctx, sub, { x: below.x, y: below.y + 36 }, Math.min(20, (W * 1.5) / sub.length), '#ffe066', 1 - t);
        } else if (f.kind === 'bar') {
          // vỡ 1 thanh máu: mảnh vỡ văng ra từ Boss
          if (age < 160) flash = Math.max(flash, 0.4 * (1 - age / 160));
          if (age < 600) shake = Math.max(shake, 9 * (1 - age / 600));
          burst(ctx, bossP, Math.min(1, t * 1.3), seed, tint, 40, 220, 6);
          burst(ctx, bossP, Math.min(1, t * 1.1), seed + 5, '#ffffff', 20, 160, 4);
          const bars = LINK_BOSSES.find((b) => b.id === f.boss)?.bars ?? 1;
          bigText(ctx, `💥 VỠ THANH MÁU! CÒN ${f.left ?? 0}/${bars}`, below, Math.min(40, (W * 1.5) / 24), '#ffe066', 1 - t * t, 0.7 + ease(Math.min(1, t * 3)) * 0.45);
        } else if (f.kind === 'rage') {
          ctx.save();
          if (f.boss === 'overlord') {
            // màn hình tối sầm, 4 quầng màu linh hồn Boss xoay quanh
            ctx.fillStyle = `rgba(5,2,15,${0.55 * (1 - t)})`;
            ctx.fillRect(0, 0, W, H);
            SOULS.forEach((col, i) => {
              const a = (i / 4) * Math.PI * 2 + now / 600;
              const gx = W / 2 + Math.cos(a) * W * 0.4, gy = H / 2 + Math.sin(a) * H * 0.4;
              const g = ctx.createRadialGradient(gx, gy, 10, gx, gy, Math.max(W, H) * 0.45);
              g.addColorStop(0, `${col}${Math.round(110 * (1 - t)).toString(16).padStart(2, '0')}`);
              g.addColorStop(1, `${col}00`);
              ctx.fillStyle = g;
              ctx.fillRect(0, 0, W, H);
            });
          } else if (f.boss === 'twins') {
            const gL = ctx.createRadialGradient(W * 0.25, H * 0.35, 30, W * 0.25, H * 0.35, Math.max(W, H) * 0.75);
            gL.addColorStop(0, `rgba(151,117,250,${0.48 * (1 - t)})`);
            gL.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gL;
            ctx.fillRect(0, 0, W, H);
            const gR = ctx.createRadialGradient(W * 0.75, H * 0.35, 30, W * 0.75, H * 0.35, Math.max(W, H) * 0.75);
            gR.addColorStop(0, `rgba(255,107,107,${0.48 * (1 - t)})`);
            gR.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gR;
            ctx.fillRect(0, 0, W, H);
          } else {
            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
            g.addColorStop(0, 'rgba(255,0,0,0)');
            g.addColorStop(1, `rgba(255,30,30,${0.45 * (1 - t)})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
          }
          ctx.restore();
          if (f.boss === 'thunder' && age < 900) {
            // Vua Sấm Sét xuất hiện / nổi giận: sét giáng khắp màn
            if (age < 120) flash = Math.max(flash, 0.5 * (1 - age / 120));
            const r = rand(seed + Math.floor(age / 90));
            for (let i = 0; i < 4; i++) {
              const x = r() * W;
              bolt(ctx, { x: x + (r() - 0.5) * 80, y: 0 }, { x, y: H * (0.4 + r() * 0.5) }, seed + i * 13 + Math.floor(age / 70), 3, '#ffe066', 40);
            }
          } else if (f.boss === 'twins' && age < 1200) {
            // 2 Boss Co-op xuất hiện / nổi giận: Sấm Hư Không tím-cyan + Lửa Hỗn Mang vàng-đỏ giáng toàn màn hình
            if (age < 160) flash = Math.max(flash, 0.65 * (1 - age / 160));
            if (age < 800) shake = Math.max(shake, 11 * (1 - age / 800));
            const r = rand(seed + Math.floor(age / 80));
            for (let i = 0; i < 6; i++) {
              const x = r() * W;
              const isVoid = i % 2 === 0;
              bolt(
                ctx,
                { x: x + (r() - 0.5) * 100, y: 0 },
                { x, y: H * (0.35 + r() * 0.55) },
                seed + i * 19 + Math.floor(age / 65),
                3.5,
                isVoid ? '#b197fc' : '#ffd43b',
                44,
              );
            }
            burst(ctx, { x: bossP.x - 60, y: bossP.y }, t, seed + 11, '#9775fa', 22, 130, 6);
            burst(ctx, { x: bossP.x + 60, y: bossP.y }, t, seed + 23, '#ff6b6b', 22, 130, 6);
          }
          if (f.boss === 'overlord' && age < 1400) {
            // Trùm Cuối giáng thế / vỡ thanh máu: sét 4 màu giáng khắp màn + vòng sóng xung kích
            if (age < 200) flash = Math.max(flash, 0.8 * (1 - age / 200));
            if (age < 1100) shake = Math.max(shake, 15 * (1 - age / 1100));
            const r = rand(seed + Math.floor(age / 70));
            for (let i = 0; i < 8; i++) {
              const x = r() * W;
              bolt(ctx, { x: x + (r() - 0.5) * 120, y: 0 }, { x, y: H * (0.3 + r() * 0.6) }, seed + i * 23 + Math.floor(age / 60), 3.5, SOULS[i % 4], 46);
            }
            ctx.save();
            for (let k = 0; k < 3; k++) {
              const tt = Math.min(1, Math.max(0, t * 1.6 - k * 0.18));
              if (tt <= 0 || tt >= 1) continue;
              ctx.globalAlpha = 1 - tt;
              ctx.strokeStyle = SOULS[k];
              ctx.lineWidth = 6 * (1 - tt) + 1;
              ctx.beginPath();
              ctx.arc(bossP.x, bossP.y, Math.max(W, H) * ease(tt), 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }
          if (f.boss === 'overlord') {
            const title = f.phase === 1 ? '👑 ĐẠI MA VƯƠNG HỖN NGUYÊN GIÁNG THẾ!' : `💥 VỠ THANH MÁU! CÒN ${f.left ?? 4 - f.phase}/3`;
            const sub = f.phase === 1 ? 'TỨ ĐẠI BOSS HỢP THỂ · 3 THANH MÁU · TẬN THẾ TỨ LINH' : f.phase === 2 ? 'GIÁP HỖN NGUYÊN DỰNG LÊN · MA NHÃN BẮN 4 PHÁT' : 'CƠN THỊNH NỘ CUỐI CÙNG · MA NHÃN BẮN 5 PHÁT';
            bigText(ctx, title, below, Math.min(38, (W * 1.5) / title.length), f.phase === 1 ? '#ffe066' : '#ff6b6b', 1 - t * t, 0.75 + ease(Math.min(1, t * 3)) * 0.4);
            bigText(ctx, sub, { x: below.x, y: below.y + 36 }, Math.min(20, W / 26), '#f783ac', 1 - t);
          } else if (f.boss === 'twins') {
            const title = f.phase === 1 ? '🐉 HẮC LONG × 🔥 PHƯỢNG HOÀNG XUẤT HIỆN!' : `🐉🔥 SONG SÁT CO-OP NỔI GIẬN! (P${f.phase})`;
            bigText(ctx, title, below, Math.min(36, (W * 1.55) / title.length), f.phase === 1 ? '#ffe066' : '#ff6b6b', 1 - t * t, 0.75 + ease(Math.min(1, t * 3)) * 0.35);
            bigText(ctx, '⚔️ 2 BOSS CO-OP SIÊU KHÓ · BỘ KỸ NĂNG HỦY DIỆT ⚔️', { x: below.x, y: below.y + 34 }, Math.min(20, W / 24), '#e599f7', 1 - t);
          } else {
            const name = bossName(f.boss);
            bigText(ctx, f.phase === 1 ? `${name} XUẤT HIỆN!` : `${name} NỔI GIẬN!`, below, Math.min(f.phase === 1 ? 40 : 44, (W * 1.6) / name.length), f.phase === 1 ? tint : '#ff6b6b', 1 - t * t, 0.7 + ease(Math.min(1, t * 3)) * 0.4);
          }
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
        } else if (f.kind === 'bolt' || f.kind === 'chain') {
          // Sét Đánh: nhiều tia sét từ trời đánh xuống bàn mình; Sét Lan: một tia to nhảy qua bàn người bị nhắm
          const chain = f.kind === 'chain';
          const onMe = !chain || f.to === L.mainId;
          const target = onMe ? L.board : f.to ? L.foeRect(f.to) : undefined;
          const color = f.boss === 'tyrant' ? '#ff6b6b' : '#ffe066';
          if (age < 140) flash = Math.max(flash, (chain && onMe ? 0.55 : 0.35) * (1 - age / 140));
          if (target) {
            const r = rand(seed);
            const n = chain ? 5 : 6;
            const pts: Pt[] = [];
            for (let i = 0; i < n; i++) pts.push({ x: target.x + target.w * (0.1 + r() * 0.8), y: target.y + target.h * (0.1 + r() * 0.8) });
            const live = age < 650;
            if (live) {
              const flick = Math.floor(age / 60);
              if (chain) {
                // tia từ Boss nhảy lần lượt qua các điểm
                let from = bossP;
                const upto = Math.min(n, Math.floor(age / 70) + 1);
                for (let i = 0; i < upto; i++) {
                  bolt(ctx, from, pts[i], seed + i * 17 + flick, onMe ? 4 : 2, color, onMe ? 30 : 12);
                  from = pts[i];
                }
              } else {
                for (let i = 0; i < n; i++) {
                  const start = { x: pts[i].x + (r() - 0.5) * 120, y: Math.min(target.y - 60, (L.boss?.y ?? 0) + 10) };
                  if (age > i * 45) bolt(ctx, start, pts[i], seed + i * 31 + flick, 3.5, color, 34);
                }
              }
            }
            for (let i = 0; i < n; i++) burst(ctx, pts[i], Math.min(1, age / 700), seed + i, color, 10, onMe ? 50 : 20, onMe ? 4 : 2);
            const label = chain ? (onMe ? 'SÉT LAN TRÚNG BẠN!' : 'SÉT LAN!') : 'SÉT ĐÁNH!';
            bigText(ctx, label, onMe ? below : { x: center(target).x, y: center(target).y - 16 }, onMe ? 40 : 20, color, 1 - t, onMe ? 0.8 + ease(Math.min(1, t * 4)) * 0.3 : 1);
          }
        } else if (f.kind === 'drain') {
          // Hút Sinh Lực: hạt xanh lá bay từ bàn về Boss
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 30; i++) {
            const from = { x: L.board.x + r() * L.board.w, y: L.board.y + r() * L.board.h };
            const k = ease(Math.min(1, Math.max(0, t * 1.6 - r() * 0.5)));
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = i % 2 ? '#8ce99a' : '#e599f7';
            ctx.beginPath();
            ctx.arc(from.x + (bossP.x - from.x) * k, from.y + (bossP.y - from.y) * k - Math.sin(Math.PI * k) * 60, 3 + (1 - k) * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          bigText(ctx, 'HÚT SINH LỰC! BOSS HỒI MÁU', below, Math.min(32, W / 16), '#8ce99a', 1 - t);
        } else if (f.kind === 'roar') {
          // Gầm Thét: sóng âm toả ra từ Boss, rung mạnh
          if (age < 700) shake = Math.max(shake, 12 * (1 - age / 700));
          ctx.save();
          ctx.strokeStyle = '#ff8787';
          for (let i = 0; i < 4; i++) {
            const k = Math.min(1, t * 1.5 - i * 0.12);
            if (k <= 0) continue;
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.lineWidth = 8 * (1 - k) + 1;
            ctx.beginPath();
            ctx.arc(bossP.x, bossP.y, 40 + k * Math.max(W, H) * 0.7, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
          bigText(ctx, 'GẦM THÉT! CHOÁNG!', below, 40, '#ff8787', 1 - t, 0.8 + ease(Math.min(1, t * 4)) * 0.4);
        } else if (f.kind === 'web' || f.kind === 'cocoon') {
          // tơ bắn từ Boss xuống bàn (Kén Tơ: chỉ người bị nhắm)
          const cocoon = f.kind === 'cocoon';
          const onMe = !cocoon || f.to === L.mainId;
          const target = onMe ? L.board : f.to ? L.foeRect(f.to) : undefined;
          if (target) {
            const c = center(target);
            const reach = ease(Math.min(1, t * 2.2));
            ctx.save();
            ctx.globalAlpha = 1 - t * t;
            ctx.strokeStyle = '#f8f9fa';
            ctx.lineWidth = cocoon ? 2.5 : 1.6;
            const r = rand(seed);
            for (let i = 0; i < (cocoon ? 14 : 9); i++) {
              const end = { x: target.x + r() * target.w, y: target.y + r() * target.h };
              ctx.beginPath();
              ctx.moveTo(bossP.x, bossP.y);
              ctx.quadraticCurveTo((bossP.x + end.x) / 2 + (r() - 0.5) * 80, (bossP.y + end.y) / 2, bossP.x + (end.x - bossP.x) * reach, bossP.y + (end.y - bossP.y) * reach);
              ctx.stroke();
            }
            if (reach >= 1) webPattern(ctx, c, Math.min(target.w, target.h) * (cocoon ? 0.5 : 0.7), 1 - t);
            ctx.restore();
            bigText(ctx, cocoon ? (onMe ? 'BẠN BỊ KÉN TƠ!' : 'KÉN TƠ!') : 'LƯỚI TƠ!', onMe ? below : { x: c.x, y: c.y - 16 }, onMe ? 38 : 20, '#e9ecef', 1 - t);
          }
        } else if (f.kind === 'venom') {
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 22; i++) {
            const x = L.board.x + r() * L.board.w;
            const y = L.board.y + (L.board.h + 40) * ease(Math.min(1, t * 1.3 + r() * 0.3)) - 20;
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = i % 2 ? '#94d82d' : '#5c940d';
            ctx.beginPath();
            ctx.ellipse(x, y, 4, 8, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          bigText(ctx, 'NỌC ĐỘC! −50% SÁT THƯƠNG', below, Math.min(32, W / 16), '#94d82d', 1 - t);
        } else if (f.kind === 'meteor') {
          const r = rand(seed);
          for (let i = 0; i < 7; i++) {
            const tt = Math.min(1, Math.max(0, t * 1.8 - i * 0.08));
            if (tt <= 0) continue;
            const end = { x: L.board.x + r() * L.board.w, y: L.board.y + r() * L.board.h };
            const start = { x: end.x + 160, y: L.board.y - 220 };
            if (tt < 0.55) {
              const k = tt / 0.55;
              const p = { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k };
              ctx.save();
              const g = ctx.createLinearGradient(p.x, p.y, p.x + 60, p.y - 80);
              g.addColorStop(0, 'rgba(255,212,59,0.95)');
              g.addColorStop(1, 'rgba(255,80,0,0)');
              ctx.strokeStyle = g;
              ctx.lineWidth = 10;
              ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 60, p.y - 80); ctx.stroke();
              ctx.fillStyle = '#fff3bf';
              ctx.shadowColor = '#ff922b';
              ctx.shadowBlur = 20;
              ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
              ctx.restore();
            } else burst(ctx, end, (tt - 0.55) / 0.45, seed + i, '#ff922b', 14, 50, 5);
          }
          if (t > 0.3 && t < 0.5) shake = Math.max(shake, 7);
          bigText(ctx, 'THIÊN THẠCH!', below, 38, '#ff922b', 1 - t);
        } else if (f.kind === 'quake') {
          if (age < 900) shake = Math.max(shake, 14 * (1 - age / 900));
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#ffa94d';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ff6b2c';
          ctx.shadowBlur = 12;
          const r = rand(seed);
          for (let i = 0; i < 5; i++) {
            let x = L.board.x + r() * L.board.w, y = L.board.y + L.board.h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            const steps = Math.floor(2 + ease(Math.min(1, t * 2)) * 6);
            for (let k = 0; k < steps; k++) {
              x += (r() - 0.5) * 50;
              y -= L.board.h / 9;
              ctx.lineTo(x, y);
            }
            ctx.stroke();
          }
          ctx.restore();
          bigText(ctx, 'ĐỘNG ĐẤT! MẤT COMBO', below, Math.min(36, W / 14), '#ffa94d', 1 - t);
        } else if (f.kind === 'shield') {
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#a5d8ff';
          ctx.shadowColor = '#74c0fc';
          ctx.shadowBlur = 18;
          ctx.lineWidth = 4;
          const rad = (L.boss ? L.boss.h * 0.45 : 60) * (0.6 + ease(Math.min(1, t * 3)) * 0.5);
          ctx.beginPath();
          for (let i = 0; i <= 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
            ctx.lineTo(bossP.x + Math.cos(a) * rad, bossP.y + Math.sin(a) * rad);
          }
          ctx.stroke();
          ctx.restore();
          bigText(ctx, 'KHIÊN ĐÁ!', below, 36, '#a5d8ff', 1 - t);
        } else if (f.kind === 'blackhole') {
          // Hố Đen Hư Không: xoáy chân không hút năng lượng từ bàn vào tâm + khóa 8 ô Ấn Hư Không
          if (age < 700) shake = Math.max(shake, 8 * (1 - age / 700));
          const mid = center(L.board);
          const maxR = Math.min(L.board.w, L.board.h) * 0.42;
          ctx.save();
          ctx.translate(mid.x, mid.y);
          ctx.rotate(-now / 180);
          for (let ring = 3; ring >= 1; ring--) {
            const rr = maxR * (ring / 3) * (1 - t * 0.35);
            ctx.strokeStyle = ring === 1 ? '#74c0fc' : ring === 2 ? '#b197fc' : '#845ef7';
            ctx.globalAlpha = (1 - t) * (0.9 - ring * 0.18);
            ctx.lineWidth = 4 - ring * 0.7;
            ctx.beginPath();
            ctx.ellipse(0, 0, rr * 1.25, rr * 0.78, ring * 0.6, 0, Math.PI * 1.7);
            ctx.stroke();
          }
          const core = ctx.createRadialGradient(0, 0, 4, 0, 0, maxR * 0.48);
          core.addColorStop(0, `rgba(5, 2, 18, ${0.95 * (1 - t)})`);
          core.addColorStop(0.55, `rgba(95, 61, 196, ${0.72 * (1 - t)})`);
          core.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(0, 0, maxR * 0.48, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 32; i++) {
            const a = r() * Math.PI * 2 + t * 4;
            const d = maxR * 1.4 * (1 - ease(Math.min(1, t * 1.3)));
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = i % 2 ? '#e599f7' : '#74c0fc';
            ctx.beginPath();
            ctx.arc(mid.x + Math.cos(a) * d, mid.y + Math.sin(a) * d, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          bigText(ctx, `🌀 HỐ ĐEN HƯ KHÔNG! −${LINK_BOSS_BLACKHOLE.thunder} SẤM`, below, Math.min(36, W / 14), '#d0bfff', 1 - t);
        } else if (f.kind === 'hellfire') {
          // Bão Lửa Địa Ngục: Phượng Hoàng Hỗn Mang quạt bão lửa đỏ-vàng-tím thiêu đốt 9 ô
          if (age < 750) shake = Math.max(shake, 10 * (1 - age / 750));
          const r = rand(seed);
          for (let i = 0; i < 9; i++) {
            const tt = Math.min(1, Math.max(0, t * 1.9 - i * 0.06));
            if (tt <= 0) continue;
            const end = { x: L.board.x + (0.1 + r() * 0.8) * L.board.w, y: L.board.y + (0.12 + r() * 0.76) * L.board.h };
            const start = { x: bossP.x + 50, y: bossP.y };
            if (tt < 0.5) {
              const k = tt / 0.5;
              const p = { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k };
              ctx.save();
              ctx.strokeStyle = i % 2 ? '#ff6b6b' : '#ffd43b';
              ctx.shadowColor = '#ff922b';
              ctx.shadowBlur = 18;
              ctx.lineWidth = 8;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x - (end.x - start.x) * 0.16, p.y - (end.y - start.y) * 0.16);
              ctx.stroke();
              ctx.restore();
            } else {
              burst(ctx, end, (tt - 0.5) / 0.5, seed + i * 7, i % 2 ? '#ff6b6b' : '#ffd43b', 16, 65, 5.5);
            }
          }
          bigText(ctx, '🔥 BÃO LỬA ĐỊA NGỤC!', below, 38, '#ff8787', 1 - t);
        } else if (f.kind === 'soul_chain') {
          // Xiềng Xích Linh Hồn: trói người dẫn đầu sát thương bằng 14 ô Ấn Hư Không + choáng
          const onMe = !f.to || f.to === L.mainId;
          const target = onMe ? L.board : f.to ? L.foeRect(f.to) : undefined;
          if (onMe && age < 600) shake = Math.max(shake, 10 * (1 - age / 600));
          if (target) {
            const c = center(target);
            const reach = ease(Math.min(1, t * 2.4));
            const r = rand(seed);
            ctx.save();
            ctx.globalAlpha = 1 - t * t;
            ctx.strokeStyle = '#da77f2';
            ctx.shadowColor = '#9775fa';
            ctx.shadowBlur = 16;
            ctx.lineWidth = onMe ? 3.5 : 2;
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2 + 0.3;
              const rad = Math.min(target.w, target.h) * 0.48 * reach;
              ctx.beginPath();
              ctx.moveTo(c.x - Math.cos(a) * rad, c.y - Math.sin(a) * rad);
              ctx.lineTo(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad);
              ctx.stroke();
            }
            ctx.strokeStyle = '#74c0fc';
            ctx.lineWidth = onMe ? 3 : 1.5;
            ctx.beginPath();
            ctx.arc(c.x, c.y, Math.min(target.w, target.h) * 0.34 * reach, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 4; i++) {
              const end = { x: target.x + (0.15 + r() * 0.7) * target.w, y: target.y + (0.15 + r() * 0.7) * target.h };
              bolt(ctx, { x: bossP.x - 40, y: bossP.y }, end, seed + i * 29 + Math.floor(age / 70), onMe ? 3 : 1.5, '#e599f7', 24);
            }
            ctx.restore();
            bigText(
              ctx,
              onMe ? '⛓️ XIỀNG XÍCH LINH HỒN! CHOÁNG!' : '⛓️ XIỀNG XÍCH!',
              onMe ? below : { x: c.x, y: c.y - 16 },
              onMe ? 36 : 20,
              '#e599f7',
              1 - t,
            );
          }
        } else if (f.kind === 'nirvana') {
          // Niết Bàn Tái Sinh: hồi 8% máu + dựng Khiên Hỗn Mang 10% máu
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 32; i++) {
            const from = { x: bossP.x + (r() - 0.5) * 280, y: bossP.y + 90 - ease(t) * 140 };
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = i % 2 ? '#ffd43b' : '#ff8787';
            ctx.beginPath();
            ctx.arc(from.x, from.y, 3.5 + (1 - t) * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1 - t;
          const rad = (L.boss ? L.boss.h * 0.52 : 66) * (0.65 + ease(Math.min(1, t * 3)) * 0.45);
          for (const [dx, col] of [[-52, '#b197fc'], [52, '#ffd43b']] as const) {
            ctx.strokeStyle = col;
            ctx.shadowColor = col;
            ctx.shadowBlur = 18;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            for (let i = 0; i <= 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              ctx.lineTo(bossP.x + dx + Math.cos(a) * rad, bossP.y + Math.sin(a) * rad * 0.85);
            }
            ctx.stroke();
          }
          ctx.restore();
          bigText(ctx, '🛡️ NIẾT BÀN TÁI SINH! HỒI MÁU + KHIÊN', below, Math.min(34, W / 15), '#ffd43b', 1 - t);
        } else if (f.kind === 'eclipse') {
          // Nhật Thực Vĩnh Cửu: Mặt Trời Đen che phủ bàn + Độc Hư Không
          const mid = center(L.board);
          const rad = Math.min(L.board.w, L.board.h) * 0.28 * (0.7 + ease(Math.min(1, t * 2.5)) * 0.3);
          ctx.save();
          ctx.globalAlpha = 1 - t * t;
          const corona = ctx.createRadialGradient(mid.x, mid.y, rad * 0.85, mid.x, mid.y, rad * 2.1);
          corona.addColorStop(0, '#ffd43b');
          corona.addColorStop(0.35, 'rgba(177, 151, 252, 0.75)');
          corona.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = corona;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, rad * 2.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#070312';
          ctx.strokeStyle = '#ffe066';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(mid.x, mid.y, rad * 0.88, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          bigText(ctx, '🌑 NHẬT THỰC VĨNH CỬU! MÙ + ĐỘC', below, Math.min(34, W / 15), '#e599f7', 1 - t);
        } else if (f.kind === 'vortex') {
          // Lốc Xoáy Hỗn Nguyên: cơn lốc khổng lồ cuốn qua bàn, thú bay tán loạn rồi rơi lại chỗ mới
          if (age < 1100) shake = Math.max(shake, 9 * (1 - age / 1100));
          const mid = center(L.board);
          const maxR = Math.max(L.board.w, L.board.h) * 0.6;
          const grow = ease(Math.min(1, t * 2.2));
          ctx.save();
          ctx.translate(mid.x, mid.y);
          ctx.rotate(now / 140);
          for (let k = 0; k < 6; k++) {
            ctx.save();
            ctx.rotate((k / 6) * Math.PI * 2);
            ctx.strokeStyle = SOULS[k % 4];
            ctx.globalAlpha = (1 - t) * 0.85;
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i <= 30; i++) {
              const u = i / 30;
              const a = u * Math.PI * 2.2;
              const rr = maxR * grow * (0.06 + u * 0.9);
              if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.62);
              else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.62);
            }
            ctx.stroke();
            ctx.restore();
          }
          const eye = ctx.createRadialGradient(0, 0, 2, 0, 0, maxR * 0.2 * grow + 1);
          eye.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - t)})`);
          eye.addColorStop(0.5, `rgba(247,131,172,${0.6 * (1 - t)})`);
          eye.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = eye;
          ctx.beginPath();
          ctx.arc(0, 0, maxR * 0.2 * grow + 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          // mảnh vụn 4 màu bị cuốn bay quanh tâm lốc
          const r = rand(seed);
          ctx.save();
          for (let i = 0; i < 28; i++) {
            const a = r() * Math.PI * 2 + t * (6 + r() * 4);
            const d = maxR * (0.15 + r() * 0.6) * Math.sin(Math.PI * Math.min(1, t * 1.2));
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = SOULS[i % 4];
            ctx.beginPath();
            ctx.roundRect(mid.x + Math.cos(a) * d - L.tile * 0.18, mid.y + Math.sin(a) * d * 0.62 - L.tile * 0.18, L.tile * 0.36, L.tile * 0.36, L.tile * 0.08);
            ctx.fill();
          }
          ctx.restore();
          bigText(ctx, '🌪️ LỐC XOÁY HỖN NGUYÊN! BÀN ĐẢO LỘN', below, Math.min(36, (W * 1.5) / 34), '#f783ac', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.3);
        } else if (f.kind === 'eye_laser' || f.kind === 'twin_laser') {
          // Ma Nhãn Laze (Đại Ma Vương, 1 mắt) / Song Nhãn Diệt Thế (Cự Thần, 2 mắt – mỗi mắt bắn 1 bàn)
          const twin = f.kind === 'twin_laser';
          const eyeAt = (g: number): Pt => {
            if (!L.boss) return bossP;
            if (!twin) return { x: L.boss.x + L.boss.w / 2, y: L.boss.y + L.boss.h * 0.5 };
            // khớp drawBoss: Cự Thần vẽ tại cy = 0.55h + 0.2h, cỡ 0.82h
            const e = TITAN_EYES[g >= LINK_CELLS ? 1 : 0];
            const sz = L.boss.h * 1.05 * 0.78;
            return { x: L.boss.x + L.boss.w / 2 + e[0] * sz, y: L.boss.y + L.boss.h * 0.55 + L.boss.h * 1.05 * 0.19 + e[1] * sz };
          };
          const eyeP = eyeAt(0);
          const myHits = (L.mainId && f.hits?.[L.mainId]) || [];
          const charge = 260;
          if (age < charge) {
            const k = age / charge;
            ctx.save();
            for (const e of twin ? [eyeAt(0), eyeAt(LINK_CELLS)] : [eyeP]) {
              const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, 10 + k * 46);
              g.addColorStop(0, '#ffffff');
              g.addColorStop(0.4, twin ? 'rgba(102,217,232,0.9)' : 'rgba(255,45,85,0.9)');
              g.addColorStop(1, 'rgba(255,45,85,0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(e.x, e.y, 10 + k * 46, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            const ft = (age - charge) / (life - charge);
            if (age < charge + 120) flash = Math.max(flash, 0.35);
            if (age < charge + 500) shake = Math.max(shake, 6);
            const beamA = Math.max(0, 1 - ft * 1.3);
            const targets: Pt[] = myHits.map((i) => L.cell(i));
            // bàn nhỏ của đối thủ: mỗi người 1 tia mảnh
            const from: Pt[] = myHits.map((g) => eyeAt(g));
            for (const [id, cells] of Object.entries(f.hits ?? {})) {
              if (id === L.mainId || !cells.length) continue;
              const fr = L.foeRect(id);
              if (fr) {
                targets.push(center(fr));
                from.push(eyeAt(targets.length % 2 ? 0 : LINK_CELLS));
              }
            }
            ctx.save();
            ctx.lineCap = 'round';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            targets.forEach((to, n) => {
              const main = n < myHits.length;
              const wob = Math.sin(now / 30 + n) * 1.5;
              const src = from[n] ?? eyeP;
              const core = twin ? (src.x < (L.boss ? L.boss.x + L.boss.w / 2 : 0) ? '#66d9e8' : '#ff2d55') : '#ff2d55';
              for (const [w, col] of [[main ? 16 : 6, `${core}73`], [main ? 8 : 3, core], [main ? 3 : 1.2, '#ffffff']] as const) {
                ctx.globalAlpha = beamA;
                ctx.strokeStyle = col;
                ctx.lineWidth = Math.max(0.5, w + wob);
                ctx.shadowColor = core;
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.moveTo(src.x, src.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
              }
              if (main) {
                burst(ctx, to, Math.min(1, ft * 1.4), seed + n * 17, '#ff6b6b', 14, L.tile * 1.1, L.tile * 0.1);
                // sao choáng xoay quanh ô
                ctx.globalAlpha = Math.max(0, 1 - ft);
                ctx.fillStyle = '#ffe066';
                ctx.shadowBlur = 0;
                ctx.font = `${Math.round(L.tile * 0.3)}px system-ui`;
                for (let k = 0; k < 3; k++) {
                  const a = now / 160 + (k / 3) * Math.PI * 2;
                  ctx.fillText('★', to.x + Math.cos(a) * L.tile * 0.42, to.y - L.tile * 0.35 + Math.sin(a) * L.tile * 0.12);
                }
              }
            });
            ctx.restore();
          }
          const n = myHits.length || (twin ? [4, 6, 8] : [3, 4, 5])[Math.max(0, Math.min(2, f.phase - 1))];
          bigText(ctx, twin ? `👀 SONG NHÃN DIỆT THẾ! CHOÁNG ${n} THÚ` : `👁️ MA NHÃN LAZE! CHOÁNG ${n} THÚ`, below, Math.min(36, (W * 1.5) / 30), twin ? '#66d9e8' : '#ff6b6b', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.3);
        } else if (f.kind === 'apocalypse') {
          // Tận Thế Tứ Linh: 4 linh hồn Boss bay từ 4 góc màn hình, giáng 4 loại đòn xuống bàn
          if (age < 200) flash = Math.max(flash, 0.6 * (1 - age / 200));
          if (age < 1200) shake = Math.max(shake, 14 * (1 - age / 1200));
          const mid = center(L.board);
          const corners: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
          const k = ease(Math.min(1, t * 2));
          const flick = Math.floor(age / 55);
          corners.forEach((c0, i) => {
            const pos = { x: c0.x + (mid.x - c0.x) * k, y: c0.y + (mid.y - c0.y) * k };
            if (t < 0.55) bolt(ctx, c0, pos, seed + i * 31 + flick, 4, SOULS[i], 50);
            ctx.save();
            ctx.globalAlpha = 1 - t;
            const g = ctx.createRadialGradient(pos.x, pos.y, 2, pos.x, pos.y, 34);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.4, SOULS[i]);
            g.addColorStop(1, `${SOULS[i]}00`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 34, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
          // vòng ấn 4 màu xoay quanh tâm bàn
          ctx.save();
          ctx.translate(mid.x, mid.y);
          ctx.rotate(now / 300);
          const rad = Math.min(L.board.w, L.board.h) * 0.45 * k;
          for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = SOULS[i];
            ctx.globalAlpha = 1 - t;
            ctx.lineWidth = 5;
            ctx.shadowColor = SOULS[i];
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(0, 0, rad, (i / 4) * Math.PI * 2, (i / 4) * Math.PI * 2 + Math.PI * 0.4);
            ctx.stroke();
          }
          ctx.restore();
          const myHits = (L.mainId && f.hits?.[L.mainId]) || [];
          const per = Math.max(1, Math.ceil(myHits.length / 4));
          myHits.forEach((g, n) => burst(ctx, L.cell(g), Math.min(1, t * 1.6), seed + n * 13, SOULS[Math.floor(n / per) % 4], 10, L.tile, L.tile * 0.1));
          bigText(ctx, '☠️ TẬN THẾ TỨ LINH! BĂNG · TƠ · LỬA · SÉT', below, Math.min(36, (W * 1.5) / 36), '#ffe066', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'meteor_rain') {
          // Mưa Sao Băng Thiên Hà: sao băng lao chéo xuống đúng các ô bị thiêu
          if (age < 1100) shake = Math.max(shake, 8 * (1 - age / 1100));
          const myHits = (L.mainId && f.hits?.[L.mainId]) || [];
          const r = rand(seed);
          const targets: Pt[] = myHits.map((g) => L.cell(g));
          for (let i = 0; i < 10; i++) targets.push({ x: L.board.x + r() * L.board.w, y: L.board.y + r() * L.board.h });
          ctx.save();
          ctx.lineCap = 'round';
          targets.forEach((to, n) => {
            const delay = (n % 8) * 0.06;
            const k = Math.min(1, Math.max(0, (t - delay) / 0.45));
            if (k <= 0) return;
            if (k < 1) {
              const sx = to.x + 260 * (1 - k), sy = to.y - 320 * (1 - k);
              const g = ctx.createLinearGradient(sx + 70, sy - 85, sx, sy);
              g.addColorStop(0, 'rgba(255,255,255,0)');
              g.addColorStop(1, n < myHits.length ? '#ffd43b' : '#a5d8ff');
              ctx.strokeStyle = g;
              ctx.lineWidth = n < myHits.length ? 6 : 3;
              ctx.beginPath();
              ctx.moveTo(sx + 70, sy - 85);
              ctx.lineTo(sx, sy);
              ctx.stroke();
              ctx.fillStyle = '#fff';
              ctx.beginPath();
              ctx.arc(sx, sy, n < myHits.length ? 5 : 3, 0, Math.PI * 2);
              ctx.fill();
            } else if (n < myHits.length) {
              burst(ctx, to, Math.min(1, (t - delay - 0.45) * 2.5), seed + n * 7, '#ff922b', 12, L.tile * 1.2, L.tile * 0.12);
            }
          });
          ctx.restore();
          bigText(ctx, '☄️ MƯA SAO BĂNG THIÊN HÀ!', below, Math.min(38, (W * 1.5) / 24), '#ffd43b', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'gravity') {
          // Trọng Lực Đảo Chiều: 2 nửa bàn bị bẻ cong rồi đổi chỗ
          if (age < 900) shake = Math.max(shake, 10 * (1 - age / 900));
          const B = L.board;
          ctx.save();
          ctx.globalAlpha = 0.55 * (1 - t);
          const g = ctx.createLinearGradient(B.x, 0, B.x + B.w, 0);
          g.addColorStop(0, '#7048e8');
          g.addColorStop(0.5, 'rgba(0,0,0,0)');
          g.addColorStop(1, '#1971c2');
          ctx.fillStyle = g;
          ctx.fillRect(B.x, B.y, B.w, B.h);
          ctx.globalAlpha = 1 - t;
          ctx.strokeStyle = '#e5dbff';
          ctx.lineWidth = 6;
          ctx.shadowColor = '#b197fc';
          ctx.shadowBlur = 20;
          const k = ease(Math.min(1, t * 1.8));
          for (const dir of [1, -1]) {
            const y = B.y + B.h * (dir > 0 ? 0.3 : 0.7);
            const x0 = B.x + B.w * (dir > 0 ? 0.2 : 0.8);
            const x1 = x0 + dir * B.w * 0.6 * k;
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.quadraticCurveTo((x0 + x1) / 2, y - dir * B.h * 0.25, x1, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x1 - dir * 18, y - 12);
            ctx.moveTo(x1, y);
            ctx.lineTo(x1 - dir * 18, y + 12);
            ctx.stroke();
          }
          ctx.restore();
          bigText(ctx, '🔄 TRỌNG LỰC ĐẢO CHIỀU! 2 BÀN ĐỔI CHỖ', below, Math.min(36, (W * 1.5) / 34), '#d0bfff', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'supernova') {
          // Siêu Tân Tinh: Boss nổ sáng loá, sóng ánh sáng quét qua màn hình
          if (age < 450) flash = Math.max(flash, 0.95 * (1 - age / 450));
          if (age < 800) shake = Math.max(shake, 10 * (1 - age / 800));
          ctx.save();
          for (let k = 0; k < 3; k++) {
            const tt = Math.min(1, Math.max(0, t * 1.4 - k * 0.12));
            if (tt <= 0 || tt >= 1) continue;
            const R = Math.max(W, H) * 1.1 * ease(tt);
            const g = ctx.createRadialGradient(bossP.x, bossP.y, R * 0.7, bossP.x, bossP.y, R);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.8, `rgba(255,243,191,${0.6 * (1 - tt)})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
          }
          ctx.restore();
          bigText(ctx, '💫 SIÊU TÂN TINH! CHÓI LOÁ + KHIÊN SAO', below, Math.min(36, (W * 1.5) / 34), '#fff3bf', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'board_spin') {
          // Xoay Chuyển Càn Khôn: vương miện phóng sét xuống 2 bàn, vòng xoáy vàng quấn quanh (bàn tự lật trên canvas bàn chính)
          if (age < 800) shake = Math.max(shake, 8 * (1 - age / 800));
          const B = L.board;
          const mid = center(B);
          const crown = titanAt(L, [0, -0.58]) ?? bossP;
          if (age < 600) {
            const flick = Math.floor(age / 60);
            bolt(ctx, crown, { x: B.x + B.w * 0.25, y: mid.y }, seed + flick, 3.5, '#ffd43b', 50);
            bolt(ctx, crown, { x: B.x + B.w * 0.75, y: mid.y }, seed + 9 + flick, 3.5, '#ffd43b', 50);
          }
          ctx.save();
          ctx.translate(mid.x, mid.y);
          for (let k = 0; k < 3; k++) {
            ctx.save();
            ctx.rotate((now / (140 + k * 50)) * (k % 2 ? -1 : 1));
            ctx.globalAlpha = (1 - t) * 0.85;
            ctx.strokeStyle = ['#ffd43b', '#74c0fc', '#f783ac'][k];
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 18;
            ctx.lineWidth = 5 - k;
            ctx.beginPath();
            ctx.ellipse(0, 0, B.w * (0.55 + k * 0.05), B.h * (0.6 + k * 0.06), 0, 0, Math.PI * 1.3);
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
          bigText(ctx, '🌀 XOAY CHUYỂN CÀN KHÔN! BÀN BỊ LẬT', below, Math.min(36, (W * 1.5) / 32), '#ffd43b', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'eye_storm') {
          // Bão Sét Thiên Nhãn: trời tối sầm, sét giật liên hồi từ 2 mắt xuống từng con thú bị khoá
          const eyes = [titanAt(L, TITAN_EYES[0]) ?? bossP, titanAt(L, TITAN_EYES[1]) ?? bossP];
          const myHits = (L.mainId && f.hits?.[L.mainId]) || [];
          ctx.save();
          ctx.fillStyle = `rgba(8,10,28,${0.5 * (1 - t)})`;
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
          const flick = Math.floor(age / 55);
          if (age < 1150) {
            if (flick % 4 === 0) flash = Math.max(flash, 0.4 * (1 - t));
            shake = Math.max(shake, 10 * (1 - t));
            myHits.forEach((g, n) => {
              if ((flick + n) % 3 === 0) return;
              bolt(ctx, eyes[g >= LINK_CELLS ? 1 : 0], L.cell(g), seed + n * 29 + flick, 3, n % 2 ? '#ffe066' : '#a5d8ff', 60);
            });
            // sét lạc đánh lung tung xuống bàn
            const r = rand(seed + flick);
            for (let i = 0; i < 3; i++) {
              bolt(ctx, eyes[i % 2], { x: L.board.x + r() * L.board.w, y: L.board.y + r() * L.board.h }, seed + flick * 3 + i, 1.8, '#e7f5ff', 70);
            }
            let n = 0;
            for (const [id, cells] of Object.entries(f.hits ?? {})) {
              if (id === L.mainId || !cells.length) continue;
              const fr = L.foeRect(id);
              if (fr && (flick + n) % 2 === 0) bolt(ctx, eyes[n % 2], center(fr), seed + flick + n * 41, 2, '#ffe066', 40);
              n++;
            }
          }
          myHits.forEach((g, n) => burst(ctx, L.cell(g), Math.min(1, t * 1.5), seed + n * 5, '#ffe066', 10, L.tile, L.tile * 0.1));
          bigText(ctx, '⚡ BÃO SÉT THIÊN NHÃN! CHOÁNG + KHOÁ ĐIỆN', below, Math.min(36, (W * 1.5) / 36), '#ffe066', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'arm_cannon') {
          // Song Thủ Pháo Tinh Hà: 2 tay giơ hành tinh nạp năng lượng, rồi mỗi tay bắn 1 tia lửa quét ngang 1 hàng của 1 bàn
          const hands = [titanAt(L, TITAN_HANDS_FIRE[0]) ?? bossP, titanAt(L, TITAN_HANDS_FIRE[1]) ?? bossP];
          const myHits = (L.mainId && f.hits?.[L.mainId]) || [];
          const charge = 380;
          if (age < charge) {
            const k = age / charge;
            ctx.save();
            for (const hp of hands) {
              const g = ctx.createRadialGradient(hp.x, hp.y, 1, hp.x, hp.y, 8 + k * 54);
              g.addColorStop(0, '#ffffff');
              g.addColorStop(0.4, 'rgba(255,146,43,0.9)');
              g.addColorStop(1, 'rgba(255,146,43,0)');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(hp.x, hp.y, 8 + k * 54, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          } else {
            const ft = (age - charge) / (life - charge);
            if (age < charge + 150) flash = Math.max(flash, 0.45);
            shake = Math.max(shake, 13 * (1 - ft));
            const alpha = Math.max(0, 1 - Math.max(0, ft - 0.55) / 0.45);
            const sweep = Math.min(1, ft * 2.2);
            ctx.save();
            ctx.lineCap = 'round';
            for (const side of [0, 1]) {
              const pts = byCol(myHits.filter((g) => Math.floor(g / LINK_CELLS) === side)).map((g) => L.cell(g));
              if (!pts.length) continue;
              // tay trái quét từ trái sang, tay phải quét từ phải sang
              const a = side ? pts[pts.length - 1] : pts[0];
              const b = side ? pts[0] : pts[pts.length - 1];
              const to = { x: a.x + (b.x - a.x) * sweep, y: a.y + (b.y - a.y) * sweep };
              // vệt cháy dọc phần hàng đã quét
              ctx.globalAlpha = alpha * 0.55;
              ctx.strokeStyle = '#ff6b2c';
              ctx.shadowColor = '#ff922b';
              ctx.shadowBlur = 20;
              ctx.lineWidth = L.tile * 0.55;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(to.x, to.y);
              ctx.stroke();
              const wob = Math.sin(now / 25 + side) * 2;
              for (const [w, col] of [[30, 'rgba(255,146,43,0.4)'], [15, '#ff922b'], [5, '#ffffff']] as const) {
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = col;
                ctx.lineWidth = w + wob;
                ctx.beginPath();
                ctx.moveTo(hands[side].x, hands[side].y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
              }
              pts.forEach((p, n) => {
                const passed = Math.hypot(p.x - a.x, p.y - a.y) <= Math.hypot(to.x - a.x, to.y - a.y) + 1;
                if (passed) burst(ctx, p, Math.min(1, ft * 1.5), seed + n * 11 + side * 97, '#ff922b', 8, L.tile * 0.9, L.tile * 0.09);
              });
            }
            let n = 0;
            for (const [id, cells] of Object.entries(f.hits ?? {})) {
              if (id === L.mainId || !cells.length) continue;
              const fr = L.foeRect(id);
              if (fr && ft < 0.6) {
                ctx.globalAlpha = 1 - ft / 0.6;
                ctx.strokeStyle = '#ff922b';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(hands[n % 2].x, hands[n % 2].y);
                const c0 = center(fr);
                ctx.lineTo(c0.x, c0.y);
                ctx.stroke();
              }
              n++;
            }
            ctx.restore();
          }
          bigText(ctx, '🪐 SONG THỦ PHÁO TINH HÀ!', below, Math.min(38, (W * 1.5) / 24), '#ff922b', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.35);
        } else if (f.kind === 'judgment') {
          // Song Tuyệt Hủy Diệt: 2 Boss Co-op cùng phóng đại tuyệt kỹ giao thoa nổ tung bàn chơi
          if (age < 220) flash = Math.max(flash, 0.75 * (1 - age / 220));
          if (age < 1000) shake = Math.max(shake, 16 * (1 - age / 1000));
          const mid = center(L.board);
          const leftBoss = { x: bossP.x - 56, y: bossP.y };
          const rightBoss = { x: bossP.x + 56, y: bossP.y };
          if (age < 850) {
            const flick = Math.floor(age / 55);
            bolt(ctx, leftBoss, mid, seed + 11 + flick, 5, '#b197fc', 38);
            bolt(ctx, rightBoss, mid, seed + 29 + flick, 5, '#ff922b', 38);
            const r = rand(seed);
            for (let i = 0; i < 6; i++) {
              const pt = { x: L.board.x + (0.1 + r() * 0.8) * L.board.w, y: L.board.y + (0.1 + r() * 0.8) * L.board.h };
              bolt(ctx, mid, pt, seed + i * 41 + flick, 3, i % 2 ? '#74c0fc' : '#ffd43b', 28);
            }
          }
          burst(ctx, mid, t, seed + 3, '#b197fc', 28, 190, 7);
          burst(ctx, mid, t, seed + 17, '#ffd43b', 28, 190, 7);
          bigText(
            ctx,
            '⚔️ SONG TUYỆT HỦY DIỆT! CO-OP ULTIMATE!',
            below,
            Math.min(38, W / 14),
            '#ffe066',
            1 - t * t,
            0.8 + ease(Math.min(1, t * 4)) * 0.35,
          );
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
        burst(ctx, bossP, Math.min(1, t * 1.4), seed, '#ffd43b', 60, 260, 9);
        burst(ctx, bossP, Math.min(1, t * 1.1), seed + 9, '#ff6b6b', 40, 200, 7);
        const s = age < 400 ? 0.4 + ease(age / 400) * 1.0 : 1.4 - Math.min(0.2, (age - 400) / 4000);
        if (age < 600) {
          const r = rand(seed + Math.floor(age / 80));
          for (let i = 0; i < 6; i++) {
            const a = r() * Math.PI * 2;
            bolt(ctx, bossP, { x: bossP.x + Math.cos(a) * 220, y: bossP.y + Math.sin(a) * 160 }, seed + i * 7 + Math.floor(age / 60), 3, '#ffe066', 28);
          }
        }
        bigText(ctx, 'K.O.!', { x: W / 2, y: H / 2 }, Math.min(110, W * 0.22), '#ffd43b', t < 0.8 ? 1 : (1 - t) * 5, s);
        break;
      }
      case 'shuffle': {
        const target = mine ? L.board : L.foeRect(f.who);
        if (!target) break;
        const c = center(target);
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(t * Math.PI * 3);
        ctx.strokeStyle = `rgba(105,219,124,${0.8 * (1 - t)})`;
        ctx.lineWidth = mine ? 6 : 3;
        const rad = Math.min(target.w, target.h) * 0.25;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, rad * (0.6 + i * 0.45) + t * rad * 0.5, i * 2, i * 2 + 2);
          ctx.stroke();
        }
        ctx.restore();
        if (mine) bigText(ctx, 'ĐẢO BÀN!', c, 44, '#69db7c', 1 - t * t, 0.8 + ease(Math.min(1, t * 3)) * 0.3);
        break;
      }
      case 'miss':
        break;
    }
  }
  return { shake, flash, keep };
}

// ---------------- ô bị khoá ----------------

/** mạng nhện tròn tâm c, bán kính rad */
function webPattern(ctx: CanvasRenderingContext2D, c: Pt, rad: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = 'rgba(248,249,250,0.85)';
  ctx.lineWidth = 1.2;
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a) * rad, c.y + Math.sin(a) * rad); ctx.stroke();
  }
  for (let ring = 1; ring <= 4; ring++) {
    const rr = (rad * ring) / 4;
    ctx.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      // dây võng vào trong giữa 2 nan
      const mid = a - Math.PI / spokes;
      if (i) ctx.quadraticCurveTo(c.x + Math.cos(mid) * rr * 0.82, c.y + Math.sin(mid) * rr * 0.82, c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
      else ctx.moveTo(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Phủ lên 1 ô bị khoá: băng (0), tơ nhện (1), lửa (2). (px, py) góc trên trái ô, cỡ tile. */
export function drawLock(ctx: CanvasRenderingContext2D, px: number, py: number, tile: number, kind: LinkLock, now: number) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px + 1, py + 1, tile * 0.9, tile * 0.9, tile * 0.14);
  if (kind === 1) {
    ctx.fillStyle = 'rgba(222,226,230,0.55)';
    ctx.fill();
    ctx.clip();
    webPattern(ctx, { x: px + tile * 0.45, y: py + tile * 0.45 }, tile * 0.62, 1);
  } else if (kind === 3) {
    // điện giật: nền vàng tím + tia điện chập chờn
    const g = ctx.createLinearGradient(px, py, px + tile, py + tile);
    g.addColorStop(0, 'rgba(255,224,102,0.55)');
    g.addColorStop(1, 'rgba(132,94,247,0.55)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    const r = rand(Math.floor(now / 70));
    ctx.strokeStyle = '#fff9db';
    ctx.shadowColor = '#ffd43b';
    ctx.shadowBlur = tile * 0.25;
    ctx.lineWidth = Math.max(1.2, tile * 0.04);
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      let x = px + tile * (0.15 + r() * 0.2), y = py + tile * (0.1 + r() * 0.2);
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += tile * (0.12 + r() * 0.1);
        y += tile * (r() - 0.3) * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 4) {
    // Ấn Hư Không / Xiềng Xích Hắc Ám (Boss Co-op): hố đen xoáy tím-cyan + xích chéo phát sáng
    const g = ctx.createRadialGradient(px + tile * 0.45, py + tile * 0.45, tile * 0.06, px + tile * 0.45, py + tile * 0.45, tile * 0.56);
    g.addColorStop(0, 'rgba(15, 5, 32, 0.88)');
    g.addColorStop(0.55, 'rgba(103, 65, 217, 0.72)');
    g.addColorStop(1, 'rgba(218, 119, 242, 0.55)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    // 2 đường xích chéo
    ctx.strokeStyle = '#e599f7';
    ctx.shadowColor = '#74c0fc';
    ctx.shadowBlur = tile * 0.18;
    ctx.lineWidth = Math.max(1.5, tile * 0.055);
    ctx.beginPath();
    ctx.moveTo(px + tile * 0.1, py + tile * 0.1);
    ctx.lineTo(px + tile * 0.82, py + tile * 0.82);
    ctx.moveTo(px + tile * 0.82, py + tile * 0.1);
    ctx.lineTo(px + tile * 0.1, py + tile * 0.82);
    ctx.stroke();
    // tâm sao Hư Không xoay
    ctx.save();
    ctx.translate(px + tile * 0.46, py + tile * 0.46);
    ctx.rotate(now / 360);
    ctx.fillStyle = '#74c0fc';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? tile * 0.2 : tile * 0.07;
      if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (kind === 5) {
    // choáng laze (Trùm Cuối): vết cháy đỏ hình mắt + 3 ngôi sao choáng xoay
    const g = ctx.createRadialGradient(px + tile * 0.45, py + tile * 0.45, tile * 0.04, px + tile * 0.45, py + tile * 0.45, tile * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.3, 'rgba(255,45,85,0.62)');
    g.addColorStop(1, 'rgba(92,0,17,0.55)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,240,240,0.9)';
    ctx.lineWidth = Math.max(1.2, tile * 0.04);
    ctx.beginPath();
    ctx.ellipse(px + tile * 0.45, py + tile * 0.45, tile * 0.3, tile * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1a0008';
    ctx.beginPath();
    ctx.ellipse(px + tile * 0.45, py + tile * 0.45, tile * 0.04, tile * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.shadowColor = '#ffd43b';
    ctx.shadowBlur = tile * 0.2;
    ctx.font = `${Math.round(tile * 0.24)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) {
      const a = now / 220 + (k / 3) * Math.PI * 2;
      ctx.fillText('★', px + tile * 0.45 + Math.cos(a) * tile * 0.3, py + tile * 0.2 + Math.sin(a) * tile * 0.09);
    }
  } else if (kind === 2) {
    const flick = 0.75 + Math.sin(now / 90) * 0.12;
    const g = ctx.createLinearGradient(px, py + tile, px, py);
    g.addColorStop(0, `rgba(255,107,0,${0.85 * flick})`);
    g.addColorStop(0.6, `rgba(255,169,77,${0.6 * flick})`);
    g.addColorStop(1, 'rgba(255,224,102,0.25)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,244,230,0.9)';
    for (let k = 0; k < 3; k++) {
      const fx = px + tile * (0.22 + k * 0.23);
      const h = tile * (0.32 + Math.abs(Math.sin(now / 120 + k * 1.7)) * 0.22);
      ctx.beginPath();
      ctx.moveTo(fx - tile * 0.08, py + tile * 0.9);
      ctx.quadraticCurveTo(fx - tile * 0.06, py + tile * 0.9 - h * 0.6, fx, py + tile * 0.9 - h);
      ctx.quadraticCurveTo(fx + tile * 0.06, py + tile * 0.9 - h * 0.6, fx + tile * 0.08, py + tile * 0.9);
      ctx.fill();
    }
  } else {
    const g = ctx.createLinearGradient(px, py, px + tile, py + tile);
    g.addColorStop(0, 'rgba(208,235,255,0.82)');
    g.addColorStop(1, 'rgba(116,192,252,0.7)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + tile * 0.2, py + tile * 0.25); ctx.lineTo(px + tile * 0.45, py + tile * 0.5); ctx.lineTo(px + tile * 0.35, py + tile * 0.75);
    ctx.moveTo(px + tile * 0.45, py + tile * 0.5); ctx.lineTo(px + tile * 0.75, py + tile * 0.4);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------- Boss ----------------

/**
 * Vẽ Boss `id` vào khung (cx, cy) cao size.
 * hitAge: ms từ cú đấm gần nhất (giật lùi + chớp trắng). dead: đã bị K.O. shielded: đang có Khiên Đá.
 */
export function drawBoss(
  ctx: CanvasRenderingContext2D,
  id: LinkBossId,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: 1 | 2 | 3,
  hitAge: number,
  dead: boolean,
  shielded = false,
  /** chiêu Boss vừa ra (để Boss diễn theo: giơ tay, mắt toé sét…) */
  cast?: { kind: string; age: number },
) {
  if (id === 'titan') {
    drawTitan(ctx, cx, cy + size * 0.19, size * 0.78, now, phase, hitAge, dead, shielded, cast);
    return;
  }
  if (id === 'overlord') {
    drawOverlord(ctx, cx, cy + size * 0.12, size * 0.76, now, phase, hitAge, dead, shielded);
    return;
  }
  if (id === 'twins') {
    drawTwins(ctx, cx, cy + size * 0.04, size * 0.88, now, phase, hitAge, dead, shielded);
    return;
  }
  // sừng / vương miện của Bạo Chúa và chân Nhện vươn xa hơn: thu nhỏ để không bị cắt mép khung
  if (id === 'spider') drawSpider(ctx, cx, cy + size * 0.04, size * 0.9, now, phase, hitAge, dead);
  else if (id === 'tyrant') drawTyrant(ctx, cx, cy + size * 0.1, size * 0.78, now, phase, hitAge, dead);
  else drawThunder(ctx, cx, cy, size, now, phase, hitAge, dead);
  if (shielded && !dead) {
    // Khiên Đá: lục giác xanh phát sáng xoay chậm quanh Boss
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now / 2400);
    ctx.strokeStyle = 'rgba(165,216,255,0.85)';
    ctx.fillStyle = 'rgba(116,192,252,0.12)';
    ctx.shadowColor = '#74c0fc';
    ctx.shadowBlur = size * 0.08;
    ctx.lineWidth = size * 0.025;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.42);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------- 2 Boss Co-op: Hắc Long Hư Không & Phượng Hoàng Hỗn Mang ----------------

function drawTwins(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: 1 | 2 | 3,
  hitAge: number,
  dead: boolean,
  shielded: boolean,
) {
  const dx = size * 0.56;
  const leftX = cx - dx;
  const rightX = cx + dx;

  // Cổng Giao Thoa Hư Không - Hỗn Mang (Co-op Nexus) ở giữa 2 Boss
  if (!dead) {
    ctx.save();
    ctx.translate(cx, cy - size * 0.04);
    const pulse = 0.85 + Math.sin(now / 180) * 0.15;
    const g = ctx.createRadialGradient(0, 0, size * 0.02, 0, 0, size * 0.36 * pulse);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, 'rgba(229, 153, 247, 0.75)');
    g.addColorStop(0.7, 'rgba(255, 146, 43, 0.45)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.36 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Vòng cổ ngữ xoay ngược chiều
    ctx.rotate(now / 900);
    ctx.strokeStyle = 'rgba(177, 151, 252, 0.75)';
    ctx.lineWidth = Math.max(1.2, size * 0.018);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.16, 0, Math.PI * 1.4);
    ctx.stroke();
    ctx.rotate(-now / 450);
    ctx.strokeStyle = 'rgba(255, 212, 59, 0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.11, 0, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();

    // Tia năng lượng nối liền 2 Boss Co-op
    const tick = Math.floor(now / 90);
    bolt(ctx, { x: leftX + size * 0.12, y: cy - size * 0.05 }, { x: cx, y: cy - size * 0.04 }, tick * 13 + 1, Math.max(1.4, size * 0.018), '#b197fc', size * 0.09);
    bolt(ctx, { x: rightX - size * 0.12, y: cy - size * 0.05 }, { x: cx, y: cy - size * 0.04 }, tick * 17 + 2, Math.max(1.4, size * 0.018), '#ffd43b', size * 0.09);
  }

  // Boss Trái: 🐉 Hắc Long Hư Không
  drawAbyssDragon(ctx, leftX, cy, size * 0.78, now, phase, hitAge, dead);
  // Boss Phải: 🔥 Phượng Hoàng Hỗn Mang
  drawChaosPhoenix(ctx, rightX, cy, size * 0.78, now, phase, hitAge, dead);

  if (shielded && !dead) {
    for (const [bx, stroke, fill, rot] of [
      [leftX, 'rgba(208, 191, 255, 0.9)', 'rgba(132, 94, 247, 0.16)', now / 1800],
      [rightX, 'rgba(255, 236, 153, 0.9)', 'rgba(255, 146, 43, 0.16)', -now / 1800],
    ] as const) {
      ctx.save();
      ctx.translate(bx, cy);
      ctx.rotate(rot);
      ctx.strokeStyle = stroke;
      ctx.fillStyle = fill;
      ctx.shadowColor = stroke;
      ctx.shadowBlur = size * 0.08;
      ctx.lineWidth = size * 0.022;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * size * 0.42, Math.sin(a) * size * 0.36);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawAbyssDragon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: 1 | 2 | 3,
  hitAge: number,
  dead: boolean,
) {
  const s = size;
  const hover = Math.sin(now / 340) * s * 0.03;
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * s * 0.06 : 0;
  const wingFlap = Math.sin(now / 210) * 0.18 * (phase === 3 ? 1.4 : 1);
  const coreCol = phase === 3 ? '#ff6b6b' : phase === 2 ? '#da77f2' : '#9775fa';
  const neonCol = phase === 3 ? '#ffe066' : '#74c0fc';

  ctx.save();
  ctx.translate(cx + (phase >= 2 ? Math.sin(now / 38) * 1.2 : 0), cy + hover - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(-0.4);
  }

  // Hào quang Hố Đen sau lưng Hắc Long
  const aura = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.72);
  aura.addColorStop(0, 'rgba(15, 5, 35, 0.9)');
  aura.addColorStop(0.5, `${coreCol}66`);
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2);
  ctx.fill();

  // 3 quả cầu Hắc Tinh xoay quanh
  if (!dead) {
    for (let i = 0; i < 3; i++) {
      const a = now / 620 + (i * Math.PI * 2) / 3;
      const ox = Math.cos(a) * s * 0.48;
      const oy = Math.sin(a) * s * 0.28 - s * 0.08;
      ctx.fillStyle = '#0b031a';
      ctx.strokeStyle = neonCol;
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      ctx.arc(ox, oy, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Đôi cánh Rồng Hư Không căng rộng
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.rotate(sx * wingFlap);
    const wg = ctx.createLinearGradient(0, -s * 0.2, sx * s * 0.72, s * 0.25);
    wg.addColorStop(0, '#240b47');
    wg.addColorStop(0.6, coreCol);
    wg.addColorStop(1, '#110426');
    ctx.fillStyle = wg;
    ctx.strokeStyle = neonCol;
    ctx.lineWidth = s * 0.022;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.12, -s * 0.06);
    ctx.lineTo(sx * s * 0.46, -s * 0.36);
    ctx.lineTo(sx * s * 0.68, -s * 0.14);
    ctx.quadraticCurveTo(sx * s * 0.5, -s * 0.02, sx * s * 0.56, s * 0.16);
    ctx.quadraticCurveTo(sx * s * 0.34, s * 0.06, sx * s * 0.32, s * 0.24);
    ctx.quadraticCurveTo(sx * s * 0.18, s * 0.1, sx * s * 0.12, s * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 4 Sừng Hắc Long uốn cong phát sáng
  for (const sx of [-1, 1]) {
    const hg = ctx.createLinearGradient(0, -s * 0.2, sx * s * 0.45, -s * 0.6);
    hg.addColorStop(0, '#190733');
    hg.addColorStop(0.5, coreCol);
    hg.addColorStop(1, neonCol);
    ctx.fillStyle = hg;
    ctx.strokeStyle = '#090214';
    ctx.lineWidth = s * 0.022;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.1, -s * 0.2);
    ctx.quadraticCurveTo(sx * s * 0.44, -s * 0.28, sx * s * 0.42, -s * 0.58);
    ctx.quadraticCurveTo(sx * s * 0.26, -s * 0.34, sx * s * 0.05, -s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Đầu & giáp ngực Hắc Long
  const bg = ctx.createLinearGradient(0, -s * 0.3, 0, s * 0.32);
  bg.addColorStop(0, '#3b156e');
  bg.addColorStop(0.5, '#1b0838');
  bg.addColorStop(1, '#090214');
  ctx.fillStyle = bg;
  ctx.strokeStyle = neonCol;
  ctx.lineWidth = s * 0.022;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.32);
  ctx.lineTo(s * 0.22, -s * 0.16);
  ctx.lineTo(s * 0.26, s * 0.08);
  ctx.lineTo(s * 0.14, s * 0.3);
  ctx.lineTo(0, s * 0.36);
  ctx.lineTo(-s * 0.14, s * 0.3);
  ctx.lineTo(-s * 0.26, s * 0.08);
  ctx.lineTo(-s * 0.22, -s * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Ấn Hư Không trên trán
  ctx.save();
  ctx.shadowColor = neonCol;
  ctx.shadowBlur = s * 0.09;
  ctx.fillStyle = neonCol;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.25);
  ctx.lineTo(s * 0.05, -s * 0.16);
  ctx.lineTo(0, -s * 0.07);
  ctx.lineTo(-s * 0.05, -s * 0.16);
  ctx.closePath();
  ctx.fill();

  // 4 mắt rồng sắc lẹm rực sáng
  for (const sx of [-1, 1]) {
    ctx.fillStyle = neonCol;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.05, -s * 0.05);
    ctx.lineTo(sx * s * 0.2, -s * 0.12);
    ctx.lineTo(sx * s * 0.17, -s * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.07, -s * 0.14);
    ctx.lineTo(sx * s * 0.18, -s * 0.2);
    ctx.lineTo(sx * s * 0.15, -s * 0.13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Hàm rồng phun Hắc Hỏa
  ctx.fillStyle = '#0d021f';
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, s * 0.08);
  ctx.lineTo(s * 0.13, s * 0.08);
  ctx.lineTo(s * 0.08, s * 0.25);
  ctx.lineTo(-s * 0.08, s * 0.25);
  ctx.closePath();
  ctx.fill();
  const breath = ctx.createRadialGradient(0, s * 0.16, 0, 0, s * 0.16, s * 0.14);
  breath.addColorStop(0, '#ffffff');
  breath.addColorStop(0.5, neonCol);
  breath.addColorStop(1, 'rgba(151, 117, 250, 0)');
  ctx.fillStyle = breath;
  ctx.beginPath();
  ctx.arc(0, s * 0.16, s * 0.12, 0, Math.PI * 2);
  ctx.fill();

  hitFlash(ctx, s, hitAge, dead);
  ctx.restore();
}

function drawChaosPhoenix(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: 1 | 2 | 3,
  hitAge: number,
  dead: boolean,
) {
  const s = size;
  const hover = Math.cos(now / 310) * s * 0.032;
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * s * 0.06 : 0;
  const wingFlap = Math.cos(now / 190) * 0.22 * (phase === 3 ? 1.45 : 1);
  const fireCore = '#fff3bf';
  const fireMid = phase === 3 ? '#ff2a2a' : '#ff6b2c';
  const fireTip = phase === 3 ? '#862e9c' : '#c92a2a';

  ctx.save();
  ctx.translate(cx + (phase >= 2 ? Math.cos(now / 36) * 1.2 : 0), cy + hover - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(0.4);
  }

  // Hào quang Lửa Hỗn Mang
  const aura = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.74);
  aura.addColorStop(0, 'rgba(255, 224, 102, 0.65)');
  aura.addColorStop(0.55, 'rgba(255, 107, 44, 0.35)');
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.74, 0, Math.PI * 2);
  ctx.fill();

  // Đôi cánh Phượng Hoàng 5 tầng lông vũ rực lửa
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.rotate(sx * wingFlap);
    const wg = ctx.createLinearGradient(0, 0, sx * s * 0.75, -s * 0.35);
    wg.addColorStop(0, fireCore);
    wg.addColorStop(0.45, '#ffd43b');
    wg.addColorStop(0.75, fireMid);
    wg.addColorStop(1, fireTip);
    ctx.fillStyle = wg;
    ctx.strokeStyle = '#3b0a0a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.1, 0);
    ctx.quadraticCurveTo(sx * s * 0.38, -s * 0.44, sx * s * 0.72, -s * 0.28);
    ctx.lineTo(sx * s * 0.54, -s * 0.12);
    ctx.lineTo(sx * s * 0.68, -s * 0.04);
    ctx.lineTo(sx * s * 0.48, s * 0.06);
    ctx.lineTo(sx * s * 0.56, s * 0.18);
    ctx.quadraticCurveTo(sx * s * 0.28, s * 0.18, sx * s * 0.1, s * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Đuôi lửa Phượng Hoàng rủ phía dưới
  for (let k = -1; k <= 1; k++) {
    const sway = Math.sin(now / 220 + k) * s * 0.05;
    ctx.fillStyle = k === 0 ? '#ffd43b' : fireMid;
    ctx.beginPath();
    ctx.moveTo(k * s * 0.06, s * 0.18);
    ctx.quadraticCurveTo(k * s * 0.14 + sway, s * 0.36, k * s * 0.09 + sway, s * 0.52);
    ctx.quadraticCurveTo(k * s * 0.02, s * 0.36, k * s * 0.02, s * 0.18);
    ctx.closePath();
    ctx.fill();
  }

  // Thân & Đầu Phượng Hoàng
  const bg = ctx.createRadialGradient(0, -s * 0.08, s * 0.03, 0, s * 0.04, s * 0.32);
  bg.addColorStop(0, '#fff9db');
  bg.addColorStop(0.35, '#ffd43b');
  bg.addColorStop(0.75, fireMid);
  bg.addColorStop(1, '#5c0b0b');
  ctx.fillStyle = bg;
  ctx.strokeStyle = '#2b0505';
  ctx.lineWidth = s * 0.022;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.02, s * 0.2, s * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Mào Phượng Hoàng 3 ngọn lửa Hoàng Kim
  ctx.fillStyle = '#ffe066';
  ctx.strokeStyle = '#d9480f';
  ctx.lineWidth = s * 0.018;
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.2);
  ctx.lineTo(-s * 0.18, -s * 0.44);
  ctx.lineTo(-s * 0.05, -s * 0.28);
  ctx.lineTo(0, -s * 0.54);
  ctx.lineTo(s * 0.05, -s * 0.28);
  ctx.lineTo(s * 0.18, -s * 0.44);
  ctx.lineTo(s * 0.12, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mắt Phượng Hoàng rực cháy + Mỏ sắc
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = s * 0.09;
  ctx.fillStyle = '#ffffff';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.04, -s * 0.06);
    ctx.lineTo(sx * s * 0.17, -s * 0.14);
    ctx.lineTo(sx * s * 0.14, -s * 0.02);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Mỏ Hoàng Kim
  ctx.fillStyle = '#fcc419';
  ctx.strokeStyle = '#2b0505';
  ctx.beginPath();
  ctx.moveTo(-s * 0.055, -s * 0.01);
  ctx.lineTo(s * 0.055, -s * 0.01);
  ctx.lineTo(0, s * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  hitFlash(ctx, s, hitAge, dead);
  ctx.restore();
}

/** chớp trắng khi bị đánh (gọi cuối cùng, trong save/translate của Boss) */
function hitFlash(ctx: CanvasRenderingContext2D, s: number, hitAge: number, dead: boolean) {
  if (hitAge < 110 && !dead) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - hitAge / 110)})`;
    ctx.fillRect(-s, -s, s * 2, s * 2);
  }
}

// ---------------- Nữ Hoàng Nhện ----------------

const SPIDER_COLORS = [
  { body: '#7048e8', dark: '#2b1a5c', mark: '#f06595', eye: '#ff8787' },
  { body: '#ae3ec9', dark: '#4a1559', mark: '#ff922b', eye: '#ffa94d' },
  { body: '#c2255c', dark: '#3d0a1f', mark: '#ffe066', eye: '#fff3bf' },
];

function drawSpider(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, now: number, phase: 1 | 2 | 3, hitAge: number, dead: boolean) {
  const c = SPIDER_COLORS[phase - 1];
  const s = size;
  // treo trên sợi tơ, đung đưa nhẹ
  const sway = Math.sin(now / 700) * s * 0.03;
  const bob = Math.sin(now / 420) * s * 0.02;
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * s * 0.06 : 0;
  ctx.save();
  ctx.strokeStyle = 'rgba(248,249,250,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + sway, cy + bob - s * 0.36); ctx.stroke();
  ctx.translate(cx + sway + (phase === 3 ? Math.sin(now / 45) * 1.5 : 0), cy + bob - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(Math.PI);
  }
  // hào quang
  const aura = ctx.createRadialGradient(0, 0, s * 0.15, 0, 0, s * 0.7);
  aura.addColorStop(0, `${c.mark}55`);
  aura.addColorStop(1, `${c.mark}00`);
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.fill();

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#140a24';
  // 8 chân gập khúc, cử động lệch nhịp
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const wiggle = Math.sin(now / 160 + k * 1.3 + (sx > 0 ? 0.6 : 0)) * 0.12 * (phase === 3 ? 1.6 : 1);
      const base = { x: sx * s * 0.12, y: -s * 0.02 + k * s * 0.05 };
      const ang = (-0.75 + k * 0.42 + wiggle) * 1;
      const knee = { x: sx * (s * 0.34 + k * s * 0.02), y: base.y - s * 0.22 + k * s * 0.1 + Math.sin(ang) * s * 0.05 };
      const foot = { x: sx * (s * 0.52 + (k === 1 || k === 2 ? s * 0.04 : 0)), y: base.y + s * 0.08 + k * s * 0.07 + wiggle * s * 0.2 };
      ctx.lineWidth = s * 0.045;
      ctx.strokeStyle = '#140a24';
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.lineWidth = s * 0.026;
      ctx.strokeStyle = c.dark;
      ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      // khớp gối có gai
      ctx.fillStyle = c.mark;
      ctx.beginPath(); ctx.arc(knee.x, knee.y, s * 0.014, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineWidth = s * 0.025;
  ctx.strokeStyle = '#140a24';
  // bụng to phía sau
  const g = ctx.createRadialGradient(-s * 0.06, s * 0.08, s * 0.03, 0, s * 0.16, s * 0.3);
  g.addColorStop(0, '#e5dbff');
  g.addColorStop(0.3, c.body);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, s * 0.17, s * 0.24, s * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // hoa văn đồng hồ cát phát sáng
  ctx.save();
  ctx.shadowColor = c.mark;
  ctx.shadowBlur = s * 0.06;
  ctx.fillStyle = c.mark;
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, s * 0.08); ctx.lineTo(s * 0.06, s * 0.08); ctx.lineTo(0, s * 0.17); ctx.lineTo(s * 0.06, s * 0.27); ctx.lineTo(-s * 0.06, s * 0.27); ctx.lineTo(0, s * 0.17);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // đầu ngực
  const hg = ctx.createRadialGradient(-s * 0.04, -s * 0.12, s * 0.02, 0, -s * 0.07, s * 0.17);
  hg.addColorStop(0, '#d0bfff');
  hg.addColorStop(0.4, c.body);
  hg.addColorStop(1, c.dark);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.08, s * 0.16, s * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // vương miện gai
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.18);
  for (let i = 0; i <= 4; i++) {
    const x = -s * 0.1 + (i * s * 0.2) / 4;
    ctx.lineTo(x - s * 0.025, -s * 0.18);
    ctx.lineTo(x, -s * (i === 2 ? 0.31 : 0.26));
    ctx.lineTo(x + s * 0.025, -s * 0.18);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 8 mắt: 2 to, 6 nhỏ, phát sáng và chớp
  const blink = Math.sin(now / 1900) > 0.97 ? 0.2 : 1;
  ctx.save();
  ctx.shadowColor = c.eye;
  ctx.shadowBlur = s * 0.07;
  ctx.fillStyle = c.eye;
  for (const [x, y, rr] of [
    [-0.045, -0.1, 0.026], [0.045, -0.1, 0.026],
    [-0.1, -0.12, 0.014], [0.1, -0.12, 0.014],
    [-0.075, -0.15, 0.012], [0.075, -0.15, 0.012],
    [-0.03, -0.155, 0.01], [0.03, -0.155, 0.01],
  ] as const) {
    ctx.beginPath(); ctx.ellipse(x * s, y * s, rr * s, rr * s * blink, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // nanh nhỏ giọt độc
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#f8f9fa';
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.055, -s * 0.03);
    ctx.quadraticCurveTo(sx * s * 0.075, s * 0.02, sx * s * 0.03, s * 0.05);
    ctx.lineTo(sx * s * 0.025, -s * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const drip = (now / 900 + (sx > 0 ? 0.5 : 0)) % 1;
    ctx.fillStyle = '#94d82d';
    ctx.globalAlpha = (dead ? 0.25 : 1) * (1 - drip);
    ctx.beginPath(); ctx.arc(sx * s * 0.03, s * 0.06 + drip * s * 0.12, s * 0.012, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = dead ? 0.25 : 1;
  }
  hitFlash(ctx, s, hitAge, dead);
  ctx.restore();
}

// ---------------- Bạo Chúa ----------------

const TYRANT_COLORS = [
  { skin: '#495057', dark: '#1a1b1e', lava: '#ff922b', eye: '#ffd43b' },
  { skin: '#5c2b1a', dark: '#1f0d08', lava: '#ff6b2c', eye: '#ffe066' },
  { skin: '#3b0d0d', dark: '#0d0202', lava: '#ff2a2a', eye: '#ffffff' },
];

function drawTyrant(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, now: number, phase: 1 | 2 | 3, hitAge: number, dead: boolean) {
  const c = TYRANT_COLORS[phase - 1];
  const s = size;
  const breathe = Math.sin(now / 520);
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * s * 0.06 : 0;
  ctx.save();
  ctx.translate(cx + (phase >= 2 ? Math.sin(now / 40) * phase * 0.7 : 0), cy + breathe * s * 0.015 - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(-0.35);
  }
  // hào quang lửa
  const aura = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.8);
  aura.addColorStop(0, `${c.lava}55`);
  aura.addColorStop(1, `${c.lava}00`);
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2); ctx.fill();
  // tàn lửa bay lên
  const r = rand(7);
  for (let i = 0; i < 10 + phase * 4; i++) {
    const life = ((now / 1600 + r()) % 1);
    const x = (r() - 0.5) * s * 0.9;
    const y = s * 0.35 - life * s * 0.8;
    ctx.globalAlpha = (dead ? 0.25 : 1) * (1 - life) * 0.8;
    ctx.fillStyle = i % 2 ? c.lava : c.eye;
    ctx.beginPath(); ctx.arc(x, y, s * 0.008 * (1 + r()), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = dead ? 0.25 : 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = s * 0.025;
  // giáp vai gai nhọn
  for (const sx of [-1, 1]) {
    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.18, s * 0.08);
    ctx.lineTo(sx * s * 0.5, s * 0.02);
    ctx.lineTo(sx * s * 0.62, -s * 0.1);
    ctx.lineTo(sx * s * 0.52, s * 0.04);
    ctx.lineTo(sx * s * 0.56, s * 0.14);
    ctx.lineTo(sx * s * 0.44, s * 0.12);
    ctx.lineTo(sx * s * 0.42, s * 0.28);
    ctx.lineTo(sx * s * 0.2, s * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // đinh tán
    ctx.fillStyle = c.lava;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(sx * s * (0.27 + k * 0.07), s * (0.1 + k * 0.02), s * 0.012, 0, Math.PI * 2); ctx.fill(); }
  }
  // sừng cong lớn
  for (const sx of [-1, 1]) {
    const hg = ctx.createLinearGradient(sx * s * 0.12, -s * 0.2, sx * s * 0.4, -s * 0.55);
    hg.addColorStop(0, '#e9ecef');
    hg.addColorStop(1, '#868e96');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.12, -s * 0.18);
    ctx.quadraticCurveTo(sx * s * 0.42, -s * 0.24, sx * s * 0.38, -s * 0.56);
    ctx.quadraticCurveTo(sx * s * 0.3, -s * 0.32, sx * s * 0.09, -s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // đầu: khối giáp góc cạnh
  const g = ctx.createLinearGradient(0, -s * 0.32, 0, s * 0.25);
  g.addColorStop(0, c.skin);
  g.addColorStop(1, c.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.3);
  ctx.lineTo(s * 0.16, -s * 0.3);
  ctx.lineTo(s * 0.24, -s * 0.12);
  ctx.lineTo(s * 0.2, s * 0.12);
  ctx.lineTo(s * 0.1, s * 0.26);
  ctx.lineTo(-s * 0.1, s * 0.26);
  ctx.lineTo(-s * 0.2, s * 0.12);
  ctx.lineTo(-s * 0.24, -s * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // vết nứt dung nham phát sáng (sáng hơn khi nổi giận)
  ctx.save();
  ctx.shadowColor = c.lava;
  ctx.shadowBlur = s * 0.05 * phase;
  ctx.strokeStyle = c.lava;
  ctx.lineWidth = s * 0.012;
  ctx.globalAlpha *= 0.65 + 0.35 * Math.abs(Math.sin(now / 300));
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3); ctx.lineTo(-s * 0.02, -s * 0.22); ctx.lineTo(s * 0.02, -s * 0.17); ctx.lineTo(0, -s * 0.13);
  ctx.moveTo(-s * 0.2, -s * 0.02); ctx.lineTo(-s * 0.14, s * 0.02); ctx.lineTo(-s * 0.16, s * 0.08);
  ctx.moveTo(s * 0.21, -s * 0.05); ctx.lineTo(s * 0.15, 0); ctx.lineTo(s * 0.17, s * 0.06);
  ctx.stroke();
  ctx.restore();
  // mày giận + mắt rực
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.03, -s * 0.1); ctx.lineTo(sx * s * 0.19, -s * 0.16); ctx.lineTo(sx * s * 0.2, -s * 0.12); ctx.lineTo(sx * s * 0.05, -s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.shadowColor = c.eye;
    ctx.shadowBlur = s * 0.1;
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.06, -s * 0.06); ctx.lineTo(sx * s * 0.17, -s * 0.1); ctx.lineTo(sx * s * 0.15, -s * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // hàm há, lửa trong họng, răng nanh
  const open = s * (0.05 + phase * 0.015 + Math.abs(breathe) * 0.015);
  ctx.fillStyle = '#1a0000';
  ctx.beginPath();
  ctx.moveTo(-s * 0.13, s * 0.06); ctx.lineTo(s * 0.13, s * 0.06); ctx.lineTo(s * 0.08, s * 0.06 + open * 2); ctx.lineTo(-s * 0.08, s * 0.06 + open * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const fire = ctx.createRadialGradient(0, s * 0.06 + open, 0, 0, s * 0.06 + open, open * 1.6);
  fire.addColorStop(0, '#fff3bf');
  fire.addColorStop(0.5, c.lava);
  fire.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fire;
  ctx.beginPath(); ctx.ellipse(0, s * 0.06 + open, s * 0.08, open, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1f3f5';
  for (let k = -2; k <= 2; k++) {
    const x = k * s * 0.045;
    ctx.beginPath(); ctx.moveTo(x - s * 0.018, s * 0.06); ctx.lineTo(x, s * 0.06 + s * (k % 2 ? 0.035 : 0.055)); ctx.lineTo(x + s * 0.018, s * 0.06); ctx.fill();
  }
  // vương miện sắt nhọn
  ctx.fillStyle = '#343a40';
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.29);
  for (let i = 0; i < 5; i++) {
    const x = -s * 0.16 + (i * s * 0.32) / 4;
    ctx.lineTo(x, -s * (i === 2 ? 0.48 : i % 2 ? 0.38 : 0.42));
    ctx.lineTo(x + s * 0.04, -s * 0.31);
  }
  ctx.lineTo(s * 0.16, -s * 0.29);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = c.lava;
  ctx.shadowBlur = s * 0.06;
  ctx.fillStyle = c.lava;
  ctx.beginPath(); ctx.arc(0, -s * 0.34, s * 0.02, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  hitFlash(ctx, s, hitAge, dead);
  ctx.restore();
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
function drawThunder(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, now: number, phase: 1 | 2 | 3, hitAge: number, dead: boolean) {
  const c = PHASE_COLORS[phase - 1];
  if (!dead) {
    // tia chớp lượn quanh thân, càng nổi giận càng nhiều
    const tick = Math.floor(now / 110);
    const r = rand(tick);
    for (let i = 0; i < phase + 1; i++) {
      if (r() > 0.55) continue;
      const a = r() * Math.PI * 2;
      const from = { x: cx + Math.cos(a) * size * 0.3, y: cy + Math.sin(a) * size * 0.28 };
      const to = { x: cx + Math.cos(a + 0.6) * size * 0.62, y: cy + Math.sin(a + 0.6) * size * 0.5 };
      bolt(ctx, from, to, tick * 7 + i, Math.max(1.2, size * 0.012), c.glow, size * 0.08);
    }
  }
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
  hitFlash(ctx, s, hitAge, dead);
  ctx.restore();
}
