/**
 * Bộ nạp, sửa lỗi màu phe (`B0_idle.png`) và quản lý tài nguyên đồ họa nguyên bản Miragine War
 * từ `/database-miraginewar/*` (128 sheet lính, 32 chân dung, 4 công trình, 3 đạn phép, 2 địa hình, 12 UI).
 */

import { THAP_UNITS, type ThapUnitKind } from '../../../shared/src';
import {
  MIRAGINE_ANIMS,
  MIRAGINE_PROJECTILES,
  MIRAGINE_STRUCTURES,
  MIRAGINE_TERRAINS,
  MIRAGINE_UI_ASSETS,
  miragineAnimKey,
  miragineSheetUrl,
  portraitUrl,
  type AnimMeta,
  type MiragineAct,
  type ProjectileMeta,
  type StructureMeta,
} from './animMeta';

export {
  MIRAGINE_ANIMS,
  MIRAGINE_PROJECTILES,
  MIRAGINE_STRUCTURES,
  MIRAGINE_TERRAINS,
  MIRAGINE_UI_ASSETS,
  type AnimMeta,
  type MiragineAct,
  type ProjectileMeta,
  type StructureMeta,
};

const UNIT_ACTS: readonly MiragineAct[] = ['idle', 'run', 'attack', 'dead'];
const PROJECTILE_KEY_BY_ANIM: Record<string, keyof typeof MIRAGINE_PROJECTILES> = {
  fireball: 'fb',
  thunderball: 'tb',
  storm: 'storm',
};
const B0_IDLE_KEY = 'B0_idle';
const B0_IDLE_URL = miragineSheetUrl(B0_IDLE_KEY);

const imgCache = new Map<string, HTMLImageElement>();
const imgReady = new Map<string, boolean>();
const imgFailed = new Set<string>();
const recoloredSheetCache = new Map<string, CanvasImageSource>();
const loadListeners = new Set<() => void>();

/** Danh sách 181 đường dẫn tài nguyên đồ họa gốc cần nạp trước của Miragine War. */
function buildPreloadUrls(): string[] {
  const urls = new Set<string>();
  for (let ss = 0; ss < 16; ss++) {
    for (const owner of [0, 1] as const) {
      for (const act of UNIT_ACTS) {
        urls.add(miragineSheetUrl(miragineAnimKey(owner, ss, act)));
      }
    }
  }
  for (let id = 0; id < 16; id++) {
    urls.add(portraitUrl(id, 'a'));
    urls.add(portraitUrl(id, 'b'));
  }
  for (const structure of Object.values(MIRAGINE_STRUCTURES)) {
    urls.add(structure.file);
  }
  for (const projectile of Object.values(MIRAGINE_PROJECTILES)) {
    urls.add(projectile.file);
  }
  for (const terrainUrl of Object.values(MIRAGINE_TERRAINS)) {
    urls.add(terrainUrl);
  }
  for (const uiUrl of Object.values(MIRAGINE_UI_ASSETS)) {
    urls.add(uiUrl);
  }
  return Array.from(urls);
}

const PRELOAD_URLS = buildPreloadUrls();

function notifyLoadListeners(): void {
  loadListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* Bỏ qua lỗi từ listener lẻ để không chặn các listener khác */
    }
  });
}

/** Chuyển kênh màu RGB (`0..255`) sang không gian HSV (`hDeg ∈ [0, 360)`, `s ∈ [0, 1]`, `v ∈ [0, 1]`). */
export function rgbToHsv(r: number, g: number, b: number): [hDeg: number, s: number, v: number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  const v = max;
  const s = max === 0 ? 0 : delta / max;
  if (delta === 0) return [0, s, v];

  let hPrime = 0;
  if (max === rn) {
    hPrime = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hPrime = (bn - rn) / delta + 2;
  } else {
    hPrime = (rn - gn) / delta + 4;
  }
  const rawDeg = hPrime * 60;
  const hDeg = ((rawDeg % 360) + 360) % 360;
  return [hDeg >= 360 ? 0 : hDeg, s, v];
}

/** Chuyển màu HSV (`hDeg ∈ [0, 360)`, `s ∈ [0, 1]`, `v ∈ [0, 1]`) về kênh RGB (`0..255`). */
export function hsvToRgb(hDeg: number, s: number, v: number): [r: number, g: number, b: number] {
  const h = (((hDeg % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 1) {
    rp = c;
    gp = x;
  } else if (h < 2) {
    rp = x;
    gp = c;
  } else if (h < 3) {
    gp = c;
    bp = x;
  } else if (h < 4) {
    gp = x;
    bp = c;
  } else if (h < 5) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return [
    Math.max(0, Math.min(255, Math.round((rp + m) * 255))),
    Math.max(0, Math.min(255, Math.round((gp + m) * 255))),
    Math.max(0, Math.min(255, Math.round((bp + m) * 255))),
  ];
}

/**
 * Đổi pixel viền giáp đỏ đặc trưng của Phe Đỏ sang xanh lam chuẩn Phe Xanh (`targetH = 210°`),
 * giữ nguyên độ sáng `v`, độ trong suốt `a` và bỏ qua da/tóc/kim loại trung tính.
 */
export function remapRedPixelToBlue(
  r: number,
  g: number,
  b: number,
  a: number,
): [r: number, g: number, b: number, a: number] {
  if (a <= 0 || r - Math.max(g, b) < 6) return [r, g, b, a];
  const [hDeg, s, v] = rgbToHsv(r, g, b);
  if (!((hDeg >= 325 || hDeg <= 12) && s >= 0.14)) return [r, g, b, a];

  const targetH = 210;
  const targetS = Math.min(1, s * 0.88);
  const [nr, ng, nb] = hsvToRgb(targetH, targetS, v);
  return [nr, ng, nb, a];
}

/**
 * Sửa lỗi file `/database-miraginewar/sheets/B0_idle.png` trên đĩa bị trùng byte với `A0_idle.png`:
 * vẽ sang canvas ngoài màn hình và đổi toàn bộ viền giáp đỏ sang xanh lam Phe Xanh.
 */
export function recolorRedSheetToBlue(img: HTMLImageElement): CanvasImageSource {
  if (typeof document === 'undefined') return img;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w <= 0 || h <= 0) return img;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return img;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const [nr, ng, nb] = remapRedPixelToBlue(data[i], data[i + 1], data[i + 2], data[i + 3]);
      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } catch {
    return img;
  }
}

function ensureB0IdleRecolored(img: HTMLImageElement): CanvasImageSource {
  const hit = recoloredSheetCache.get(B0_IDLE_KEY);
  if (hit) return hit;
  const remapped = recolorRedSheetToBlue(img);
  recoloredSheetCache.set(B0_IDLE_KEY, remapped);
  return remapped;
}

/** Kiểm tra nguồn vẽ Canvas (`HTMLImageElement` hoặc `HTMLCanvasElement`) đã sẵn sàng để `drawImage`. */
export function isDrawableReady(src: CanvasImageSource | null | undefined): src is CanvasImageSource {
  if (!src) return false;
  if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
    return src.complete && src.naturalWidth > 0;
  }
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    return src.width > 0 && src.height > 0;
  }
  const duck = src as { complete?: boolean; naturalWidth?: number; width?: number; height?: number };
  if (typeof duck.naturalWidth === 'number') {
    return Boolean(duck.complete) && duck.naturalWidth > 0;
  }
  if (typeof duck.width === 'number' && typeof duck.height === 'number') {
    return duck.width > 0 && duck.height > 0;
  }
  return false;
}

/** Đăng ký callback được gọi mỗi khi một tài nguyên đồ họa Miragine War tải xong. */
export function onMiragineAssetLoad(fn: () => void): () => void {
  loadListeners.add(fn);
  return () => {
    loadListeners.delete(fn);
  };
}

/** Nạp lười & lưu cache `HTMLImageElement` theo đường dẫn `url`. */
export function getMiragineImage(url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !url) return null;
  let img = imgCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgFailed.delete(url);
      if (url === B0_IDLE_URL) ensureB0IdleRecolored(img!);
      imgReady.set(url, true);
      notifyLoadListeners();
    };
    img.onerror = () => {
      imgFailed.add(url);
      notifyLoadListeners();
    };
    img.src = url;
    imgCache.set(url, img);
  }
  if (imgFailed.has(url)) return null;
  if (imgReady.get(url) || isDrawableReady(img)) {
    if (!imgReady.get(url)) {
      if (url === B0_IDLE_URL) ensureB0IdleRecolored(img);
      imgReady.set(url, true);
    }
    return img;
  }
  return null;
}

/** Trả về đường dẫn ảnh chân dung (`a0..a15` hoặc `b0..b15`) theo loại lính và phe. */
export function getPortraitUrl(kind: ThapUnitKind, owner?: number): string;
export function getPortraitUrl(unitId: number, side?: 'a' | 'b'): string;
export function getPortraitUrl(kindOrId: ThapUnitKind | number, ownerOrSide: number | 'a' | 'b' = 0): string {
  if (typeof kindOrId === 'number') {
    const side: 'a' | 'b' = ownerOrSide === 'b' || ownerOrSide === 1 ? 'b' : 'a';
    return portraitUrl(kindOrId, side);
  }
  const spec = THAP_UNITS[kindOrId] ?? THAP_UNITS.swordman;
  const side: 'a' | 'b' = ownerOrSide === 1 || ownerOrSide === 'b' ? 'b' : 'a';
  return portraitUrl(spec.id, side);
}

/** Lấy ảnh chân dung đã tải xong của loại lính (`kind`, `owner`) hoặc theo `unitId` gốc. */
export function getPortraitImage(kind: ThapUnitKind, owner?: number): HTMLImageElement | null;
export function getPortraitImage(unitId: number, side?: 'a' | 'b'): HTMLImageElement | null;
export function getPortraitImage(
  kindOrId: ThapUnitKind | number,
  ownerOrSide: number | 'a' | 'b' = 0,
): HTMLImageElement | null {
  const url =
    typeof kindOrId === 'number'
      ? getPortraitUrl(kindOrId, ownerOrSide === 'b' || ownerOrSide === 1 ? 'b' : 'a')
      : getPortraitUrl(kindOrId, typeof ownerOrSide === 'number' ? ownerOrSide : ownerOrSide === 'b' ? 1 : 0);
  return getMiragineImage(url);
}

/** Lấy nguồn vẽ của sprite sheet theo khóa (tự trả về canvas đã đổi màu xanh cho `B0_idle`). */
export function getSheetImage(key: string): CanvasImageSource | null {
  const projKey = PROJECTILE_KEY_BY_ANIM[key];
  if (projKey) return getProjectileImage(projKey);

  const img = getMiragineImage(miragineSheetUrl(key));
  if (!img) return null;
  if (key === B0_IDLE_KEY) {
    const resolved = ensureB0IdleRecolored(img);
    return isDrawableReady(resolved) ? resolved : null;
  }
  return img;
}

/** Lấy ảnh công trình hoặc bóng đổ (`A_crystal`, `B_crystal`, `door`, `shadow`). */
export function getStructureImage(key: keyof typeof MIRAGINE_STRUCTURES): HTMLImageElement | null {
  const meta = MIRAGINE_STRUCTURES[key];
  return meta ? getMiragineImage(meta.file) : null;
}

/** Lấy ảnh sprite sheet đạn phép (`fb`, `tb`, `storm`). */
export function getProjectileImage(key: 'fb' | 'tb' | 'storm'): HTMLImageElement | null {
  const meta = MIRAGINE_PROJECTILES[key];
  return meta ? getMiragineImage(meta.file) : null;
}

/** Lấy ảnh nền chiến trường (`terrain`, `terrain2`). */
export function getTerrainImage(key: keyof typeof MIRAGINE_TERRAINS): HTMLImageElement | null {
  const url = MIRAGINE_TERRAINS[key];
  return url ? getMiragineImage(url) : null;
}

/** Lấy ảnh thành phần giao diện gốc Miragine War từ `MIRAGINE_UI_ASSETS`. */
export function getUiImage(key: keyof typeof MIRAGINE_UI_ASSETS): HTMLImageElement | null {
  const url = MIRAGINE_UI_ASSETS[key];
  return url ? getMiragineImage(url) : null;
}

let preloaded = false;

/** Nạp trước toàn bộ 181 tài nguyên đồ họa Miragine War (128 sheet, 32 chân dung, 4 công trình, 3 đạn, 2 nền, 12 UI). */
export function preloadMiragineAssets(): void {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  for (const url of PRELOAD_URLS) {
    getMiragineImage(url);
  }
}

/** Báo cáo tiến độ nạp tài nguyên đồ họa Miragine War (`loaded` / `total`). */
export function getSpriteLoadProgress(): { loaded: number; total: number } {
  const seen = new Set<string>();
  let loaded = 0;
  let extra = 0;

  for (const url of PRELOAD_URLS) {
    seen.add(url);
    if (imgReady.get(url)) loaded++;
  }
  for (const url of imgCache.keys()) {
    if (seen.has(url)) continue;
    extra++;
    if (imgReady.get(url)) loaded++;
  }
  return { loaded, total: PRELOAD_URLS.length + extra };
}

/**
 * Vẽ 1 frame của animation Miragine War tại tọa độ chân `(worldX, worldY)` theo `MIRAGINE_ANIMS[key]`.
 * Trong `mapping.json` (`nativeFacingDirection: "left"`), toàn bộ sheet gốc đều hướng mặt sang TRÁI (`left = true`);
 * khi hướng sang PHẢI (`left = false`), lật ngang quanh `(worldX, worldY)` bằng `ctx.scale(-scale, scale)`.
 */
export function drawMiragineSheetFrame(
  ctx: CanvasRenderingContext2D,
  key: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
  left: boolean,
  scale = 1,
): boolean {
  const meta = MIRAGINE_ANIMS[key];
  const img = getSheetImage(key);
  if (!meta || !isDrawableReady(img)) return false;

  const [frames, cellW, cellH, offX, offY] = meta;
  if (frames <= 0 || cellW <= 0 || cellH <= 0) return false;
  const f = ((Math.floor(frameIndex) % frames) + frames) % frames;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(worldX, worldY);
  ctx.scale(left ? scale : -scale, scale);
  ctx.drawImage(img, f * cellW, 0, cellW, cellH, offX, offY, cellW, cellH);
  ctx.restore();
  return true;
}
