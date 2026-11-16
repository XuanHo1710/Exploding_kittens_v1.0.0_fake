/**
 * Tiện ích vẽ Canvas 2D thuần dùng chung cho Miragine War:
 * - Chuyển đổi/cache màu (`shade`, `rgba`).
 * - Đường dẫn bo góc (`roundRectPath`), thanh máu sắc nét (`drawHpBar`, không dùng `bar_frame.png`)
 *   và nhãn chữ viền/nền (`drawLabel`).
 */

const CACHE_LIMIT = 512;
const shadeCache = new Map<string, string>();
const rgbaCache = new Map<string, string>();

function parseHex(hex: string): readonly [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
  } else if (clean.length >= 6) {
    const n = parseInt(clean.slice(0, 6), 16);
    if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [136, 136, 136];
}

function setBoundedCache(cache: Map<string, string>, key: string, val: string): void {
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, val);
}

/** Làm sáng (`amt > 0`) hoặc tối (`amt < 0`) một mã màu hex, có bộ nhớ đệm. */
export function shade(hex: string, amt: number): string {
  const a = Math.max(-1, Math.min(1, amt));
  const key = `${hex}:${a}`;
  const hit = shadeCache.get(key);
  if (hit) return hit;

  const [r0, g0, b0] = parseHex(hex);
  const adjust = (c: number) =>
    a < 0 ? Math.round(c * (1 + a)) : Math.round(c + (255 - c) * a);

  const out = `rgb(${adjust(r0)},${adjust(g0)},${adjust(b0)})`;
  setBoundedCache(shadeCache, key, out);
  return out;
}

/** Chuyển mã màu hex sang chuỗi `rgba(...)` theo độ mờ `a` (`0..1`), có bộ nhớ đệm. */
export function rgba(hex: string, a: number): string {
  const alpha = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1));
  const key = `${hex}:${Math.round(alpha * 1000) / 1000}`;
  const hit = rgbaCache.get(key);
  if (hit) return hit;

  const [r, g, b] = parseHex(hex);
  const out = `rgba(${r},${g},${b},${alpha})`;
  setBoundedCache(rgbaCache, key, out);
  return out;
}

/** Tạo path hình chữ nhật bo góc chuẩn Canvas 2D (tương thích mọi môi trường, không lệ thuộc `ctx.roundRect`). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rw = Math.max(0, w);
  const rh = Math.max(0, h);
  const radius = Math.max(0, Math.min(r, rw * 0.5, rh * 0.5));

  ctx.beginPath();
  if (radius === 0) {
    ctx.rect(x, y, rw, rh);
    return;
  }

  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + rw - radius, y);
  ctx.arcTo(x + rw, y, x + rw, y + radius, radius);
  ctx.lineTo(x + rw, y + rh - radius);
  ctx.arcTo(x + rw, y + rh, x + rw - radius, y + rh, radius);
  ctx.lineTo(x + radius, y + rh);
  ctx.arcTo(x, y + rh, x, y + rh - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** Vẽ thanh máu có nền tối và viền sắc nét (tuyệt đối không dùng ảnh `bar_frame.png`). */
export function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: string,
): void {
  if (w <= 0 || h <= 0) return;
  const clampedPct = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const ratio = clampedPct / 100;
  const radius = Math.min(h * 0.35, 3);

  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.fillStyle = 'rgba(10, 12, 16, 0.82)';
  ctx.fill();

  const pad = w > 8 && h >= 4 ? 1 : 0;
  const innerW = Math.max(0, w - pad * 2);
  const innerH = Math.max(0, h - pad * 2);
  const fillW = innerW * ratio;

  if (fillW > 0.25 && innerH > 0) {
    const fillColor = color || (clampedPct > 60 ? '#51cf66' : clampedPct > 30 ? '#fcc419' : '#ff6b6b');
    roundRectPath(ctx, x + pad, y + pad, fillW, innerH, Math.max(0, radius - pad));
    ctx.fillStyle = fillColor;
    ctx.fill();

    if (innerH >= 3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(x + pad, y + pad, fillW, Math.max(1, innerH * 0.32));
    }
  }

  roundRectPath(ctx, x, y, w, h, radius);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Vẽ nhãn chữ Canvas sắc nét, hỗ trợ tùy chọn màu chữ, nền bo góc, font và căn lề. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts?: { color?: string; bg?: string; font?: string; align?: CanvasTextAlign },
): void {
  const font = opts?.font ?? '700 12px system-ui, -apple-system, "Segoe UI", sans-serif';
  const color = opts?.color ?? '#ffffff';
  const align = opts?.align ?? 'center';
  const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(font);
  const fontSize = sizeMatch ? Number(sizeMatch[1]) : 12;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (opts?.bg) {
    const padX = Math.max(5, fontSize * 0.45);
    const padY = Math.max(2, fontSize * 0.25);
    const textW = ctx.measureText(text).width;
    const pillW = textW + padX * 2;
    const pillH = fontSize + padY * 2;
    let pillX = x - pillW * 0.5;
    if (align === 'left' || align === 'start') {
      pillX = x - padX;
    } else if (align === 'right' || align === 'end') {
      pillX = x - textW - padX;
    }

    roundRectPath(ctx, pillX, y - pillH * 0.5, pillW, pillH, Math.min(6, pillH * 0.4));
    ctx.fillStyle = opts.bg;
    ctx.fill();
  } else {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.5, fontSize * 0.25);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.strokeText(text, x, y);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
