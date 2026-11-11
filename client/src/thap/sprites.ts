/**
 * Bộ nạp & quản lý tài nguyên đồ họa nguyên bản Miragine War từ `/database-miraginewar/*`.
 * - Chứa bảng metadata `MIRAGINE_ANIMS` (`[frames, cellW, cellH, offX, offY]`) trích xuất 100% từ `mws_10.swf`.
 * - Nạp bất đồng bộ (lazy-load + preload) các sprite sheet lính (`A0..A15`, `B0..B15`),
 *   công trình (`A_crystal`, `B_crystal`, `door`, `shadow`), đạn (`fireball`, `thunderball`, `storm`),
 *   chân dung (`a0..a15`, `b0..b15`) và địa hình (`terrain.jpg`, `terrain2.jpg`).
 */

export type AnimMeta = readonly [frames: number, cellW: number, cellH: number, offX: number, offY: number];

export const MIRAGINE_ANIMS: Record<string, AnimMeta> = {
  A0_idle: [3, 62, 53, -31, -53],
  A0_run: [6, 46, 52, -26, -49],
  A0_attack: [5, 88, 66, -63, -65],
  A0_dead: [6, 99, 74, -26, -60],
  A1_idle: [3, 63, 53, -31, -55],
  A1_run: [6, 44, 52, -26, -52],
  A1_attack: [5, 91, 61, -62, -62],
  A1_dead: [5, 100, 72, -27, -60],
  A2_idle: [3, 58, 51, -32, -51],
  A2_run: [6, 64, 60, -37, -57],
  A2_attack: [6, 120, 61, -92, -60],
  A2_dead: [3, 86, 61, -32, -50],
  A3_idle: [3, 58, 53, -31, -55],
  A3_run: [6, 64, 61, -36, -55],
  A3_attack: [4, 93, 60, -67, -62],
  A3_dead: [3, 86, 66, -34, -57],
  A4_idle: [3, 42, 58, -26, -60],
  A4_run: [6, 63, 56, -33, -57],
  A4_attack: [6, 65, 59, -45, -61],
  A4_dead: [3, 92, 55, -29, -56],
  A5_idle: [3, 57, 49, -40, -48],
  A5_run: [6, 49, 58, -28, -56],
  A5_attack: [5, 70, 60, -53, -59],
  A5_dead: [3, 93, 53, -42, -51],
  A6_idle: [3, 40, 52, -26, -52],
  A6_run: [6, 47, 49, -25, -49],
  A6_attack: [6, 72, 52, -56, -51],
  A6_dead: [3, 58, 43, -30, -41],
  A7_idle: [3, 29, 56, -17, -55],
  A7_run: [6, 52, 52, -27, -52],
  A7_attack: [6, 41, 56, -27, -56],
  A7_dead: [3, 71, 61, -25, -52],
  A8_idle: [3, 63, 64, -32, -63],
  A8_run: [6, 71, 65, -37, -62],
  A8_attack: [6, 88, 67, -56, -66],
  A8_dead: [2, 73, 64, -32, -64],
  A9_idle: [3, 63, 59, -37, -60],
  A9_run: [6, 63, 63, -33, -61],
  A9_attack: [5, 84, 70, -61, -67],
  A9_dead: [3, 77, 69, -30, -58],
  A10_idle: [3, 45, 60, -27, -60],
  A10_run: [3, 60, 65, -32, -69],
  A10_attack: [5, 74, 60, -42, -58],
  A10_dead: [6, 71, 63, -27, -57],
  A11_idle: [3, 62, 51, -32, -51],
  A11_run: [3, 56, 48, -34, -46],
  A11_attack: [6, 82, 51, -56, -51],
  A11_dead: [4, 78, 60, -26, -53],
  A12_idle: [3, 54, 45, -32, -46],
  A12_run: [6, 53, 46, -34, -46],
  A12_attack: [6, 78, 71, -52, -72],
  A12_dead: [3, 87, 47, -40, -47],
  A13_idle: [3, 81, 63, -54, -62],
  A13_run: [6, 103, 55, -65, -55],
  A13_attack: [4, 112, 96, -64, -96],
  A13_dead: [3, 91, 61, -56, -56],
  A14_idle: [3, 41, 49, -26, -50],
  A14_run: [6, 44, 51, -26, -50],
  A14_attack: [7, 76, 57, -46, -57],
  A14_dead: [3, 66, 52, -24, -51],
  A15_idle: [3, 57, 49, -39, -47],
  A15_run: [6, 49, 58, -26, -56],
  A15_attack: [5, 70, 60, -51, -59],
  A15_dead: [3, 95, 51, -42, -50],
  B0_idle: [3, 62, 53, -31, -53],
  B0_run: [6, 46, 52, -26, -49],
  B0_attack: [5, 88, 66, -63, -65],
  B0_dead: [6, 99, 74, -26, -60],
  B1_idle: [3, 63, 53, -31, -55],
  B1_run: [6, 44, 52, -26, -52],
  B1_attack: [5, 91, 61, -62, -62],
  B1_dead: [5, 100, 72, -27, -60],
  B2_idle: [3, 58, 51, -32, -51],
  B2_run: [6, 64, 60, -37, -57],
  B2_attack: [6, 120, 61, -92, -60],
  B2_dead: [3, 86, 61, -32, -50],
  B3_idle: [3, 58, 53, -31, -55],
  B3_run: [6, 64, 61, -36, -59],
  B3_attack: [4, 93, 60, -67, -62],
  B3_dead: [3, 86, 66, -34, -57],
  B4_idle: [3, 42, 58, -26, -60],
  B4_run: [6, 63, 56, -33, -57],
  B4_attack: [6, 65, 59, -45, -61],
  B4_dead: [3, 92, 55, -29, -56],
  B5_idle: [3, 57, 49, -40, -48],
  B5_run: [6, 49, 58, -28, -56],
  B5_attack: [5, 70, 60, -53, -59],
  B5_dead: [3, 93, 53, -42, -51],
  B6_idle: [3, 40, 52, -26, -52],
  B6_run: [6, 47, 49, -25, -49],
  B6_attack: [6, 72, 52, -56, -51],
  B6_dead: [3, 58, 43, -30, -43],
  B7_idle: [3, 29, 56, -17, -55],
  B7_run: [6, 52, 52, -27, -52],
  B7_attack: [6, 41, 56, -27, -56],
  B7_dead: [3, 71, 61, -25, -52],
  B8_idle: [3, 63, 64, -35, -63],
  B8_run: [6, 71, 65, -37, -62],
  B8_attack: [6, 88, 67, -56, -66],
  B8_dead: [2, 73, 64, -32, -64],
  B9_idle: [3, 63, 59, -37, -60],
  B9_run: [6, 63, 63, -33, -61],
  B9_attack: [5, 84, 70, -61, -67],
  B9_dead: [3, 77, 69, -30, -58],
  B10_idle: [3, 45, 60, -27, -60],
  B10_run: [3, 60, 65, -32, -68],
  B10_attack: [5, 74, 60, -42, -58],
  B10_dead: [6, 71, 63, -27, -57],
  B11_idle: [3, 62, 51, -32, -51],
  B11_run: [3, 56, 48, -34, -46],
  B11_attack: [6, 82, 51, -56, -51],
  B11_dead: [4, 78, 60, -26, -53],
  B12_idle: [3, 54, 45, -32, -46],
  B12_run: [6, 53, 46, -34, -46],
  B12_attack: [6, 78, 71, -52, -72],
  B12_dead: [3, 87, 47, -40, -47],
  B13_idle: [3, 81, 63, -54, -62],
  B13_run: [6, 103, 55, -65, -55],
  B13_attack: [4, 112, 96, -64, -96],
  B13_dead: [3, 91, 61, -56, -56],
  B14_idle: [3, 41, 49, -26, -50],
  B14_run: [6, 44, 51, -26, -50],
  B14_attack: [7, 76, 57, -46, -57],
  B14_dead: [3, 66, 52, -24, -51],
  B15_idle: [3, 57, 49, -39, -47],
  B15_run: [6, 49, 58, -26, -56],
  B15_attack: [5, 70, 60, -51, -59],
  B15_dead: [3, 95, 51, -42, -50],
  fireball: [3, 32, 32, -16, -16],
  thunderball: [16, 128, 128, -64, -64],
  storm: [9, 153, 261, -76, -240],
};

const imgCache = new Map<string, HTMLImageElement>();
const imgReady = new Map<string, boolean>();
const loadListeners = new Set<() => void>();

export function onMiragineAssetLoad(fn: () => void) {
  loadListeners.add(fn);
  return () => {
    loadListeners.delete(fn);
  };
}

export function getMiragineImage(url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = imgCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgReady.set(url, true);
      loadListeners.forEach((fn) => fn());
    };
    img.src = url;
    imgCache.set(url, img);
  }
  return imgReady.get(url) ? img : null;
}

export function getSheetImage(key: string): HTMLImageElement | null {
  if (key === 'fireball' || key === 'thunderball' || key === 'storm') {
    return getMiragineImage(`/database-miraginewar/projectiles/${key}.png`);
  }
  return getMiragineImage(`/database-miraginewar/sheets/${key}.png`);
}

export function getStructureImage(name: 'A_crystal' | 'B_crystal' | 'door' | 'shadow'): HTMLImageElement | null {
  return getMiragineImage(`/database-miraginewar/structures/${name}.png`);
}

export function getPortraitUrl(unitId: number, side: 'a' | 'b' = 'a'): string {
  return `/database-miraginewar/portraits/${side}${unitId}.png`;
}

export function getPortraitImage(unitId: number, side: 'a' | 'b' = 'a'): HTMLImageElement | null {
  return getMiragineImage(getPortraitUrl(unitId, side));
}

export function getTerrainImage(name: 'terrain' | 'terrain2'): HTMLImageElement | null {
  return getMiragineImage(`/database-miraginewar/terrains/${name}.jpg`);
}

export function getUiImage(name: 'bar_frame' | 'timebg' | 'win' | 'lose'): HTMLImageElement | null {
  return getMiragineImage(`/database-miraginewar/ui/${name}.png`);
}

let preloaded = false;
export function preloadMiragineAssets() {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;
  getStructureImage('A_crystal');
  getStructureImage('B_crystal');
  getStructureImage('door');
  getStructureImage('shadow');
  getTerrainImage('terrain');
  getTerrainImage('terrain2');
  getUiImage('bar_frame');
  getUiImage('timebg');
  getSheetImage('fireball');
  getSheetImage('thunderball');
  getSheetImage('storm');
  for (let i = 0; i < 16; i++) {
    getPortraitImage(i, 'a');
    getPortraitImage(i, 'b');
    for (const side of ['A', 'B'] as const) {
      getSheetImage(`${side}${i}_idle`);
      getSheetImage(`${side}${i}_run`);
      getSheetImage(`${side}${i}_attack`);
      getSheetImage(`${side}${i}_dead`);
    }
  }
}

/**
 * Vẽ 1 frame của animation Miragine War tại toạ độ chân `(x, y)`.
 * Trong `mws_10.swf`, các sprite lính đều hướng mặt sang TRÁI (`left = true`) ở `scaleX = 1`.
 * Khi hướng sang PHẢI (`left = false`), lật ngang quanh gốc `(x, y)` bằng `ctx.scale(-scale, scale)`.
 */
export function drawMiragineSheetFrame(
  ctx: CanvasRenderingContext2D,
  key: string,
  frameIdx: number,
  x: number,
  y: number,
  left: boolean,
  scale = 1,
): boolean {
  const meta = MIRAGINE_ANIMS[key];
  const img = getSheetImage(key);
  if (!meta || !img) return false;
  const [frames, cellW, cellH, offX, offY] = meta;
  const f = ((Math.floor(frameIdx) % frames) + frames) % frames;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(left ? scale : -scale, scale);
  ctx.drawImage(img, f * cellW, 0, cellW, cellH, offX, offY, cellW, cellH);
  ctx.restore();
  return true;
}
