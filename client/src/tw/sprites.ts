/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) – Bộ nạp Tài nguyên Đồ họa & Hoạt ảnh Binh chủng
 * Nạp bất đồng bộ (lazy-load + preload), lưu đệm (`Map<string, HTMLImageElement>`) và vẽ spritesheet 4x6
 * cho toàn bộ 12 Danh Tướng, 18 Binh Chủng, 23 Spritesheets, Địa hình, Công trình, Tên đạn & Giao diện
 * trong `/database-total-war/*`.
 */
import {
  TW_CLASSES,
  TW_GENERAL_IDS,
  TW_UNITS,
  TW_UNIT_KINDS,
  type TwAnimState,
  type TwGeneralClass,
  type TwGeneralId,
  type TwUnitKind,
} from '../../../shared/src/tw';

const BASE_PATH = '/database-total-war';

/** Danh sách đầy đủ 23 spritesheets (4 cột x 6 hàng) trong `/database-total-war/sheets/` */
export const TW_SHEET_KEYS = [
  // 8 Bộ binh trường kích & đao kiếm
  'inf_ji_militia',
  'inf_spear_guards',
  'inf_heavy_ji_infantry',
  'inf_azure_dragons',
  'inf_sabre_militia',
  'inf_sabre_infantry',
  'inf_jian_sword_guards',
  'inf_yellow_dragons',
  // 5 Cung nỏ & máy bắn đá công thành
  'rng_archer_militia',
  'rng_yi_archers',
  'rng_crossbowmen',
  'rng_onyx_dragons',
  'rng_trebuchet',
  // 5 Kỵ binh xung kích & cận chiến
  'cav_raider_cavalry',
  'cav_lance_cavalry',
  'cav_jade_dragons',
  'cav_sabre_cavalry',
  'cav_imperial_cataphracts',
  // 5 Danh tướng Ngũ Hành (Wu Xing Heroes)
  'hero_vanguard',
  'hero_champion',
  'hero_sentinel',
  'hero_commander',
  'hero_strategist',
] as const;

export type TwSheetKey = (typeof TW_SHEET_KEYS)[number];

/** 6 chất liệu mặt đất chiến trường trong `/database-total-war/terrains/` */
export const TW_TERRAIN_FILES = [
  'pingyuan_grass.jpg',
  'autumn_mud.jpg',
  'forest_floor.jpg',
  'ridge_rock.jpg',
  'river_water.jpg',
  'winter_frost.jpg',
] as const;

/** 11 vật thể kiến trúc & địa vật chiến thuật trong `/database-total-war/structures/` */
export const TW_STRUCTURE_FILES = [
  'pine_tree_1.png',
  'pine_tree_2.png',
  'pine_tree_3.png',
  'pine_tree_4.png',
  'bamboo_clump.png',
  'watchtower.png',
  'capture_outpost.png',
  'palisade_wall.png',
  'war_tent.png',
  'boulder_1.png',
  'boulder_2.png',
] as const;

/** 6 loại đạn tên, hỏa tiễn, đá công thành & vòng đấu tướng trong `/database-total-war/projectiles/` */
export const TW_PROJECTILE_FILES = [
  'arrow.png',
  'fire_arrow.png',
  'bolt.png',
  'boulder.png',
  'crater_scorch.png',
  'duel_ring.png',
] as const;

/** 22 biểu tượng Ngũ Hành, Binh chủng, Trận hình & Bảng thủy mặc trong `/database-total-war/ui/` */
export const TW_UI_FILES = [
  // Ngũ Hành (5)
  'el_fire.png',
  'el_wood.png',
  'el_metal.png',
  'el_earth.png',
  'el_water.png',
  // Phân lớp binh chủng (7)
  'cls_infantry_polearm.png',
  'cls_infantry_sword.png',
  'cls_ranged_bow.png',
  'cls_ranged_crossbow.png',
  'cls_artillery.png',
  'cls_cavalry_shock.png',
  'cls_cavalry_melee.png',
  // Trận hình chiến thuật (6)
  'fmt_line.png',
  'fmt_shieldwall.png',
  'fmt_spearwall.png',
  'fmt_wedge.png',
  'fmt_circle.png',
  'fmt_loose.png',
  // Phông nền & đại kỳ thắng bại (4)
  'ink_plaque.png',
  'title_bg.jpg',
  'banner_victory.png',
  'banner_defeat.png',
] as const;

/**
 * Bảng ánh xạ trạng thái hoạt ảnh `TwAnimState` sang dòng (row 0..5) trên spritesheet 4x6:
 * - Row 0: `idle` (Đứng giữ hàng ngũ)
 * - Row 1: `march` (Hành quân đều bước)
 * - Row 2: `charge` / `rout` (Xung phong / Vỡ trận chạy tán loạn)
 * - Row 3: `attack` / `shoot` / `duel` (Giáp lá cà / Bắn cung nỏ / Đấu tướng)
 * - Row 4: `brace` (Dựng Thương Lâm / Thuẫn Tường kìm kỵ binh)
 * - Row 5: `dead` (Tử trận ngã gục)
 */
export const TW_ANIM_ROW: Record<TwAnimState, number> = {
  idle: 0,
  march: 1,
  charge: 2,
  rout: 2,
  attack: 3,
  shoot: 3,
  duel: 3,
  brace: 4,
  dead: 5,
};

const TERRAIN_SHORTHAND_MAP: Record<string, string> = {
  grass: 'pingyuan_grass.jpg',
  pingyuan: 'pingyuan_grass.jpg',
  mud: 'autumn_mud.jpg',
  marsh: 'autumn_mud.jpg',
  forest: 'forest_floor.jpg',
  woods: 'forest_floor.jpg',
  ridge: 'ridge_rock.jpg',
  rock: 'ridge_rock.jpg',
  river: 'river_water.jpg',
  water: 'river_water.jpg',
  frost: 'winter_frost.jpg',
  winter: 'winter_frost.jpg',
  chibi: 'winter_frost.jpg',
};

const UI_ELEMENT_CLASS_SHORTHAND: Record<string, string> = {
  el_vanguard: 'el_fire.png',
  el_champion: 'el_wood.png',
  el_sentinel: 'el_metal.png',
  el_commander: 'el_earth.png',
  el_strategist: 'el_water.png',
};

const imgCache = new Map<string, HTMLImageElement>();
const imgFailed = new Set<string>();
const loadListeners = new Set<() => void>();

/** Đăng ký lắng nghe mỗi khi một ảnh Tam Quốc Toàn Chiến tải xong (tiện cho Canvas/HUD vẽ lại) */
export function onTwAssetLoad(fn: () => void): () => void {
  loadListeners.add(fn);
  return () => {
    loadListeners.delete(fn);
  };
}

/** Kiểm tra ảnh đã giải mã hoàn tất và hợp lệ (`img.complete && img.naturalWidth > 0`) */
export function isImgReady(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

/**
 * Tải bất đồng bộ & lưu cache `HTMLImageElement` theo đường dẫn `url`.
 * Chỉ trả về `HTMLImageElement` khi ảnh đã sẵn sàng (`isImgReady(img)`);
 * trả về `null` khi đang tải, chạy môi trường không có DOM, hoặc đường dẫn lỗi.
 */
export function loadTwImage(url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined' || !url) return null;
  let img = imgCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgFailed.delete(url);
      loadListeners.forEach((fn) => {
        try {
          fn();
        } catch {
          /* bỏ qua lỗi listener lẻ */
        }
      });
    };
    img.onerror = () => {
      imgFailed.add(url);
    };
    img.src = url;
    imgCache.set(url, img);
  }
  if (imgFailed.has(url)) return null;
  return isImgReady(img) ? img : null;
}

function hasImageExt(name: string): boolean {
  return /\.(png|jpe?g|webp|svg)$/i.test(name);
}

function resolveTerrainUrl(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('/')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (TERRAIN_SHORTHAND_MAP[lower]) {
    return `${BASE_PATH}/terrains/${TERRAIN_SHORTHAND_MAP[lower]}`;
  }
  if (hasImageExt(trimmed)) {
    return `${BASE_PATH}/terrains/${trimmed}`;
  }
  return `${BASE_PATH}/terrains/${trimmed}.jpg`;
}

function resolveStructureUrl(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('/')) return trimmed;
  if (hasImageExt(trimmed)) {
    return `${BASE_PATH}/structures/${trimmed}`;
  }
  return `${BASE_PATH}/structures/${trimmed}.png`;
}

function resolveProjectileUrl(kind: string): string {
  const trimmed = kind.trim();
  if (trimmed.startsWith('/')) return trimmed;
  if (hasImageExt(trimmed)) {
    return `${BASE_PATH}/projectiles/${trimmed}`;
  }
  return `${BASE_PATH}/projectiles/${trimmed}.png`;
}

function resolveUiUrl(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith('/')) return trimmed;
  const lower = trimmed.toLowerCase();
  if (UI_ELEMENT_CLASS_SHORTHAND[lower]) {
    return `${BASE_PATH}/ui/${UI_ELEMENT_CLASS_SHORTHAND[lower]}`;
  }
  if (hasImageExt(trimmed)) {
    return `${BASE_PATH}/ui/${trimmed}`;
  }
  if (lower === 'title_bg') {
    return `${BASE_PATH}/ui/title_bg.jpg`;
  }
  return `${BASE_PATH}/ui/${trimmed}.png`;
}

function resolveSheetUrl(sheetKey: string): string {
  const trimmed = sheetKey.trim();
  if (trimmed.startsWith('/')) return trimmed;
  const stem = trimmed.replace(/\.png$/i, '');
  if (Object.prototype.hasOwnProperty.call(TW_UNITS, stem)) {
    return `${BASE_PATH}/sheets/${TW_UNITS[stem as TwUnitKind].spritePrefix}.png`;
  }
  if (Object.prototype.hasOwnProperty.call(TW_CLASSES, stem)) {
    return `${BASE_PATH}/sheets/hero_${stem as TwGeneralClass}.png`;
  }
  return `${BASE_PATH}/sheets/${stem}.png`;
}

let preloaded = false;

/**
 * Nạp trước toàn bộ 110 tài nguyên đồ họa Tam Quốc Toàn Chiến vào bộ nhớ đệm trình duyệt:
 * - 24 chân dung Danh Tướng (`_card.png` & `_token.png`)
 * - 18 thẻ bài Binh Chủng (`units/<kind>.png`)
 * - 23 spritesheets hoạt ảnh 4x6 (`sheets/<prefix>.png`)
 * - 6 nền địa hình, 11 công trình/cây đá, 6 tên đạn/hiệu ứng và 22 biểu tượng giao diện.
 */
export function preloadTwAssets(): void {
  if (preloaded || typeof Image === 'undefined') return;
  preloaded = true;

  for (const genId of TW_GENERAL_IDS) {
    loadTwImage(`${BASE_PATH}/portraits/${genId}_card.png`);
    loadTwImage(`${BASE_PATH}/portraits/${genId}_token.png`);
  }

  for (const kind of TW_UNIT_KINDS) {
    loadTwImage(`${BASE_PATH}/units/${kind}.png`);
  }

  for (const sheetKey of TW_SHEET_KEYS) {
    loadTwImage(`${BASE_PATH}/sheets/${sheetKey}.png`);
  }

  for (const file of TW_TERRAIN_FILES) {
    loadTwImage(`${BASE_PATH}/terrains/${file}`);
  }

  for (const file of TW_STRUCTURE_FILES) {
    loadTwImage(`${BASE_PATH}/structures/${file}`);
  }

  for (const file of TW_PROJECTILE_FILES) {
    loadTwImage(`${BASE_PATH}/projectiles/${file}`);
  }

  for (const file of TW_UI_FILES) {
    loadTwImage(`${BASE_PATH}/ui/${file}`);
  }
}

/** Lấy ảnh thẻ chân dung bán thân của Danh Tướng (`/database-total-war/portraits/<id>_card.png`) */
export function getTwPortraitCard(id: TwGeneralId): HTMLImageElement | null {
  return loadTwImage(`${BASE_PATH}/portraits/${id}_card.png`);
}

/** Lấy ảnh huy hiệu tròn của Danh Tướng trên chiến trường (`/database-total-war/portraits/<id>_token.png`) */
export function getTwPortraitToken(id: TwGeneralId): HTMLImageElement | null {
  return loadTwImage(`${BASE_PATH}/portraits/${id}_token.png`);
}

/** Lấy ảnh thẻ bài Binh Chủng kiểu thủy mặc (`/database-total-war/units/<kind>.png`) */
export function getTwUnitCard(kind: TwUnitKind): HTMLImageElement | null {
  return loadTwImage(`${BASE_PATH}/units/${kind}.png`);
}

/** Lấy ảnh chất liệu địa hình (`/database-total-war/terrains/<name>.jpg`) */
export function getTwTerrainImg(name: string): HTMLImageElement | null {
  return loadTwImage(resolveTerrainUrl(name));
}

/** Lấy ảnh công trình, rừng cây, tảng đá, vọng lâu (`/database-total-war/structures/<name>.png`) */
export function getTwStructureImg(name: string): HTMLImageElement | null {
  return loadTwImage(resolveStructureUrl(name));
}

/** Lấy ảnh tên cung, hỏa tiễn, nỏ sắt, đá lửa, hố cháy hoặc vòng đấu tướng (`/database-total-war/projectiles/<kind>.png`) */
export function getTwProjectileImg(kind: string): HTMLImageElement | null {
  return loadTwImage(resolveProjectileUrl(kind));
}

/** Lấy ảnh biểu tượng Ngũ Hành, Binh Chủng, Trận Hình hoặc đại kỳ UI (`/database-total-war/ui/<name>`) */
export function getTwUiImg(name: string): HTMLImageElement | null {
  return loadTwImage(resolveUiUrl(name));
}

/** Lấy ảnh spritesheet 4x6 của binh chủng hoặc danh tướng (`/database-total-war/sheets/<sheetKey>.png`) */
export function getTwSheetImg(sheetKey: string): HTMLImageElement | null {
  return loadTwImage(resolveSheetUrl(sheetKey));
}

/**
 * Vẽ 1 khung hình hoạt ảnh từ spritesheet 4 cột x 6 hàng của binh sĩ / danh tướng tại tâm `(sx, sy)`.
 * - Hàng (row 0..5): `idle`->0, `march`->1, `charge`/`rout`->2, `attack`/`shoot`/`duel`->3, `brace`->4, `dead`->5.
 * - Cột (col 0..3): `frameIdx % 4` (`cellW = img.naturalWidth / 4`, `cellH = img.naturalHeight / 6`).
 * - Hỗ trợ lật gương ngang `flipX` quanh tâm `(sx, sy)`.
 * - Trả về `false` nếu spritesheet đang tải để bộ dựng hình vẽ bóng dáng dự phòng mượt mà.
 */
export function drawTwAnimatedSprite(
  ctx: CanvasRenderingContext2D,
  sheetKey: string,
  anim: TwAnimState,
  frameIdx: number,
  sx: number,
  sy: number,
  drawSize: number,
  flipX = false,
): boolean {
  if (drawSize <= 0) return false;
  const img = getTwSheetImg(sheetKey);
  if (!isImgReady(img)) return false;

  const cellW = img.naturalWidth / 4;
  const cellH = img.naturalHeight / 6;
  if (cellW <= 0 || cellH <= 0) return false;

  const row = TW_ANIM_ROW[anim] ?? 0;
  const col = ((Math.floor(frameIdx) % 4) + 4) % 4;
  const srcX = col * cellW;
  const srcY = row * cellH;
  const drawW = drawSize;
  const drawH = cellW === cellH ? drawSize : drawSize * (cellH / cellW);

  if (flipX) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, srcX, srcY, cellW, cellH, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
    ctx.restore();
  } else {
    ctx.drawImage(img, srcX, srcY, cellW, cellH, sx - drawW * 0.5, sy - drawH * 0.5, drawW, drawH);
  }
  return true;
}
