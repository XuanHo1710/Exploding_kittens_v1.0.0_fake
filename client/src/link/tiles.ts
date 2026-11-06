/**
 * Hình ô Nối Thú: emoji con vật to, rõ trên nền xanh than tối (đỡ chói mắt), mỗi con có quầng màu và viền màu riêng
 * nên phân biệt được bằng cả hình lẫn màu. Máy không có font emoji màu thì tự dùng bộ thú vẽ tay (drawCritter) bên dưới.
 */
import { LINK_CRITTERS } from '../../../shared/src';

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

const OUT = '#2b1d14';

function eyes(ctx: CanvasRenderingContext2D, s: number, y: number, gap: number, style: number) {
  for (const sx of [-1, 1]) {
    const x = sx * gap;
    if (style === 2) {
      // mắt cười ^^
      ctx.strokeStyle = OUT;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(x, y + s * 0.03, s * 0.07, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.085, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = s * 0.025; ctx.stroke();
    ctx.fillStyle = OUT;
    ctx.beginPath(); ctx.ellipse(x + sx * s * 0.012, y + s * 0.015, s * 0.05, s * (style === 1 ? 0.035 : 0.065), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + sx * s * 0.005 - s * 0.018, y - s * 0.02, s * 0.018, 0, Math.PI * 2); ctx.fill();
  }
}

function mouth(ctx: CanvasRenderingContext2D, s: number, y: number, kind: number) {
  ctx.strokeStyle = OUT;
  ctx.lineWidth = s * 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 0) ctx.arc(0, y - s * 0.03, s * 0.07, Math.PI * 0.2, Math.PI * 0.8);
  else if (kind === 1) { ctx.moveTo(-s * 0.07, y); ctx.quadraticCurveTo(-s * 0.035, y + s * 0.05, 0, y); ctx.quadraticCurveTo(s * 0.035, y + s * 0.05, s * 0.07, y); }
  else { ctx.ellipse(0, y + s * 0.01, s * 0.04, s * 0.035, 0, 0, Math.PI * 2); }
  ctx.stroke();
}

function blob(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, s: number) {
  const g = ctx.createRadialGradient(-w * 0.3, -h * 0.35, s * 0.05, 0, 0, Math.max(w, h));
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = s * 0.045; ctx.stroke();
}

/** Vẽ 1 con thú, tâm ở (x, y), khung vuông cỡ size */
export function drawCritter(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, size: number) {
  const c = LINK_CRITTERS[id] ?? LINK_CRITTERS[0];
  const color = c.color;
  const body = id % 6;
  const acc = Math.floor(id / 6);
  const s = size;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const dark = shade(color, -0.25);

  // --- phần sau thân (tai, cánh, vây) ---
  ctx.strokeStyle = OUT;
  ctx.lineWidth = s * 0.045;
  if (body === 1) {
    // mèo: tai nhọn
    for (const sx of [-1, 1]) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(sx * s * 0.12, -s * 0.22); ctx.lineTo(sx * s * 0.33, -s * 0.42); ctx.lineTo(sx * s * 0.32, -s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3c6';
      ctx.beginPath(); ctx.moveTo(sx * s * 0.18, -s * 0.22); ctx.lineTo(sx * s * 0.3, -s * 0.34); ctx.lineTo(sx * s * 0.29, -s * 0.18); ctx.closePath(); ctx.fill();
    }
  } else if (body === 2) {
    // thỏ: tai dài
    for (const sx of [-1, 1]) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.ellipse(sx * s * 0.13, -s * 0.36, s * 0.07, s * 0.17, sx * 0.18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffc9d6';
      ctx.beginPath(); ctx.ellipse(sx * s * 0.13, -s * 0.35, s * 0.035, s * 0.12, sx * 0.18, 0, Math.PI * 2); ctx.fill();
    }
  } else if (body === 3) {
    // chim: mào + cánh
    ctx.fillStyle = dark;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.ellipse(i * s * 0.07, -s * 0.33, s * 0.04, s * 0.1, i * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (const sx of [-1, 1]) {
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(sx * s * 0.3, s * 0.06, s * 0.1, s * 0.16, sx * -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (body === 4) {
    // cá / thuỷ quái: vây hai bên + vây lưng
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.24); ctx.quadraticCurveTo(0, -s * 0.46, s * 0.12, -s * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * s * 0.26, -s * 0.02); ctx.lineTo(sx * s * 0.42, -s * 0.12); ctx.lineTo(sx * s * 0.4, s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (body === 5) {
    // bọ: râu + cánh trong
    ctx.strokeStyle = OUT;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * s * 0.08, -s * 0.24); ctx.quadraticCurveTo(sx * s * 0.14, -s * 0.42, sx * s * 0.26, -s * 0.4); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx * s * 0.26, -s * 0.4, s * 0.04, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(220,245,255,0.85)';
      ctx.beginPath(); ctx.ellipse(sx * s * 0.3, -s * 0.05, s * 0.13, s * 0.08, sx * -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // --- thân ---
  const bw = body === 4 ? s * 0.3 : body === 0 ? s * 0.31 : s * 0.28;
  const bh = body === 4 ? s * 0.26 : s * 0.28;
  blob(ctx, bw, bh, color, s);
  // bụng sáng
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.1, bw * 0.55, bh * 0.45, 0, 0, Math.PI * 2); ctx.fill();

  // --- phụ kiện ---
  if (acc === 1) {
    // má hồng
    ctx.fillStyle = 'rgba(255,90,110,0.55)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * s * 0.17, s * 0.06, s * 0.05, s * 0.033, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (acc === 2) {
    // ngọn lửa / tia sét trên đầu
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = OUT;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.46); ctx.lineTo(s * 0.07, -s * 0.33); ctx.lineTo(s * 0.02, -s * 0.33); ctx.lineTo(s * 0.06, -s * 0.24); ctx.lineTo(-s * 0.07, -s * 0.36); ctx.lineTo(-s * 0.02, -s * 0.36); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } else if (acc === 3) {
    // lá trên đầu
    ctx.fillStyle = '#40c057';
    ctx.beginPath(); ctx.ellipse(s * 0.05, -s * 0.33, s * 0.05, s * 0.11, 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.27); ctx.lineTo(s * 0.05, -s * 0.33); ctx.stroke();
  } else if (acc === 4) {
    // ngôi sao trên trán
    ctx.fillStyle = '#fff3bf';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.035 : s * 0.075;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, -s * 0.17 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.lineWidth = s * 0.025; ctx.stroke();
  } else if (acc === 5) {
    // vằn trên thân
    ctx.strokeStyle = shade(color, -0.4);
    ctx.lineWidth = s * 0.035;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sx * bw * 0.95, -s * 0.05); ctx.lineTo(sx * bw * 0.6, -s * 0.02); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx * bw * 0.92, s * 0.08); ctx.lineTo(sx * bw * 0.62, s * 0.09); ctx.stroke();
    }
  }

  // --- mặt ---
  const eyeStyle = (id * 7) % 3;
  eyes(ctx, s, -s * 0.06, s * 0.105, eyeStyle);
  if (body === 3) {
    // mỏ
    ctx.fillStyle = '#ff922b'; ctx.strokeStyle = OUT; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(-s * 0.06, s * 0.04); ctx.lineTo(s * 0.06, s * 0.04); ctx.lineTo(0, s * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    mouth(ctx, s, s * 0.08, (id * 5) % 3);
  }
  ctx.restore();
}

const cache = new Map<string, HTMLCanvasElement>();
const pikaImages = new Map<number, HTMLImageElement>();

/** Tải trước ảnh Pikachu 1-1 từ thư mục database-pikachu/ và xoá cache của ô đó ngay khi ảnh tải xong */
function getPikaImage(id: number): HTMLImageElement | undefined {
  if (typeof Image === 'undefined') return undefined;
  let img = pikaImages.get(id);
  if (!img) {
    const c = LINK_CRITTERS[id] ?? LINK_CRITTERS[0];
    img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      for (const k of cache.keys()) {
        if (k.startsWith(`${id}:`)) cache.delete(k);
      }
    };
    img.src = c.image;
    pikaImages.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : undefined;
}

if (typeof Image !== 'undefined') {
  for (const c of LINK_CRITTERS) getPikaImage(c.id);
}

/** Màu nhận diện đủ sáng để nổi trên nền tối (con màu đen / xám đậm thì nâng sáng lên) */
function markColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum >= 110) return hex;
  // nâng sáng, trả về dạng #rrggbb để còn ghép thêm độ trong suốt (#rrggbbaa)
  const up = (v: number) => Math.min(255, Math.round(v + 140 - lum)).toString(16).padStart(2, '0');
  return `#${up(r)}${up(g)}${up(b)}`;
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla","EmojiOne Color",sans-serif';
let emojiSupport: boolean | undefined;

/** Máy có font emoji màu không (vẽ thử 1 con rồi xem có điểm ảnh màu nào) */
function emojiOk() {
  if (emojiSupport !== undefined) return emojiSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.font = `24px ${EMOJI_FONT}`;
    g.textBaseline = 'middle';
    g.fillText('🐸', 2, 16);
    const d = g.getImageData(0, 0, 32, 32).data;
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 50 && Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) > 60) colored++;
    emojiSupport = colored > 20;
  } catch {
    emojiSupport = false;
  }
  return emojiSupport;
}

/** Ô dựng sẵn (nền nổi khối + ảnh Pikachu từ database-pikachu/), cache theo id / cỡ / dpr */
export function tileCanvas(id: number, size: number, dpr: number, back = false): HTMLCanvasElement {
  const img = back ? undefined : getPikaImage(id);
  const key = `${id}:${Math.round(size)}:${dpr}:${back ? 1 : 0}:${img ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const px = Math.max(8, Math.round(size * dpr));
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const s = size;
  const r = s * 0.14;
  const rr = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  const c0 = LINK_CRITTERS[id] ?? LINK_CRITTERS[0];
  const mark = markColor(c0.color);
  // đáy (bóng nổi khối)
  ctx.fillStyle = back ? '#2b1a45' : '#0c1222';
  rr(s * 0.06, s * 0.08, s * 0.9, s * 0.9);
  ctx.fill();
  // mặt ô: xanh than tối, không chói
  const g = ctx.createLinearGradient(0, 0, s, s);
  if (back) {
    g.addColorStop(0, '#6a45a8');
    g.addColorStop(1, '#43297a');
  } else {
    g.addColorStop(0, '#36425f');
    g.addColorStop(1, '#232c44');
  }
  ctx.fillStyle = g;
  rr(s * 0.03, s * 0.03, s * 0.88, s * 0.88);
  ctx.fill();
  if (!back) {
    // quầng màu riêng của từng con sau hình
    const halo = ctx.createRadialGradient(s * 0.47, s * 0.45, s * 0.04, s * 0.47, s * 0.45, s * 0.42);
    halo.addColorStop(0, `${mark}66`);
    halo.addColorStop(1, `${mark}00`);
    ctx.fillStyle = halo;
    rr(s * 0.03, s * 0.03, s * 0.88, s * 0.88);
    ctx.fill();
  }
  // viền: màu riêng của con thú (ô úp: viền trắng mờ)
  ctx.strokeStyle = back ? 'rgba(255,255,255,0.35)' : `${mark}cc`;
  ctx.lineWidth = Math.max(1.2, s * 0.04);
  rr(s * 0.05, s * 0.05, s * 0.84, s * 0.84);
  ctx.stroke();
  // ánh sáng mép trên (nhẹ)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, s * 0.025);
  ctx.beginPath();
  ctx.moveTo(s * 0.12, s * 0.07);
  ctx.lineTo(s * 0.78, s * 0.07);
  ctx.stroke();
  if (back) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `900 ${s * 0.42}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', s * 0.47, s * 0.5);
  } else if (img) {
    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.roundRect(s * 0.22, s * 0.79, s * 0.5, s * 0.06, s * 0.03);
    ctx.fill();
    const ih = s * 0.68;
    const iw = ih * (img.naturalWidth / Math.max(1, img.naturalHeight));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = s * 0.05;
    ctx.shadowOffsetY = s * 0.02;
    ctx.drawImage(img, s * 0.47 - iw / 2, s * 0.43 - ih / 2, iw, ih);
    ctx.restore();
  } else if (emojiOk()) {
    // vệt màu riêng của từng con ở đáy ô: thêm một dấu hiệu nữa để phân biệt nhanh
    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.roundRect(s * 0.22, s * 0.79, s * 0.5, s * 0.06, s * 0.03);
    ctx.fill();
    ctx.font = `${Math.round(s * 0.62)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = s * 0.06;
    ctx.shadowOffsetY = s * 0.02;
    ctx.fillText(c0.emoji, s * 0.47, s * 0.44);
    ctx.shadowColor = 'transparent';
  } else {
    drawCritter(ctx, id, s * 0.47, s * 0.5, s * 0.84);
  }
  cache.set(key, c);
  if (cache.size > 600) cache.delete(cache.keys().next().value!);
  return c;
}
