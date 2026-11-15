#!/usr/bin/env node
/**
 * Wave 2B (`w13`) sprite fetcher, builder & normalizer for Ban Sung Co-op:
 *  - Fetches verified CC0 OSS packs/files (`oga_skeletons_rework`, `spritepilot_pickups`,
 *    `superpowers_asset_packs`, `oga_scifi_tiles`, `kenney_desert_shooter`,
 *    `kenney_tiny_dungeon`, `kenney_rts_scifi`) into an ephemeral OS temp cache
 *    with deterministic pure-Node fallback for any unreachable URL.
 *  - Builds & normalizes crisp pixel strips (#181425 1px 4-conn outline, 48-color LUT,
 *    integer cell grids, right-facing, feet/center-anchored) for:
 *      * 8 regular mobs -> database-ban-sung/sprites/mobs/
 *      * 3 bosses + boss sub-units -> database-ban-sung/sprites/bosses/
 *      * 9 biome tiles + cover obstacles + destructibles + barrels + decor
 *        + 7 pickups + shrine pedestal -> database-ban-sung/sprites/tiles/
 *  - Writes slice manifest metadata -> database-ban-sung/sprites/mobs/meta-mobs.json
 *
 * Strictly does NOT modify manifest.json or LICENSES.md (owned by w14).
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

import {
  BANSUNG_PALETTE_48,
  NORM_CONSTANTS,
  hexToRgba,
  decodePng,
  encodePng,
  writePngFile,
  createImage,
  cloneImage,
  cropImage,
  resizeImage,
  scaleImage,
  flipImageX,
  blitImage,
  sliceSpriteSheet,
  hardenAlpha,
  getOpaqueBBox,
  stripDarkOutline,
  applyOutline4Conn,
  quantizeImageToPalette48,
  normalizeFrame,
  packStrip,
  packFeetAnchorSheet,
  mulberry32,
  sha256Hex,
  fetchBuffer,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const MOBS_DIR = path.join(DB_ROOT, 'sprites', 'mobs');
const BOSSES_DIR = path.join(DB_ROOT, 'sprites', 'bosses');
const TILES_DIR = path.join(DB_ROOT, 'sprites', 'tiles');
const META_PATH = path.join(MOBS_DIR, 'meta-mobs.json');
const CACHE_DIR = path.join(os.tmpdir(), 'bansung-w13-oss-cache');

const ARGS = new Set(process.argv.slice(2));
const OFFLINE_MODE = ARGS.has('--offline');
const FORCE_FETCH = ARGS.has('--force');

// Exact BANSUNG_PALETTE_48 hex constants from BANSUNG_PALETTE_RAMPS (d14)
const C = {
  OUTLINE: '#181425',
  // Sand & Bone (R1_SAND / R2_EARTH / R5_ENERGY[5])
  BONE_LIGHT: '#ffffff',
  BONE: '#fff0c2',
  SAND_LIGHT: '#f5d89e',
  SAND: '#e8b878',
  SAND_MID: '#c9885b',
  SAND_DARK: '#733e39',
  // Flesh / Cactus / Toxic (R4_GREEN)
  LEAF_BRIGHT: '#63c74d',
  LEAF: '#3e8948',
  LEAF_DARK: '#265c42',
  TEAL_DARK: '#193c3e',
  // Crimson / Fire / Beholder Orange Eye (R3_CRIMSON)
  RED_DARK: '#8a1c31',
  RED_MID: '#c72936',
  RED_BRIGHT: '#e43b44',
  ORANGE: '#ff7a3d',
  GOLD: '#e8b878',
  YELLOW: '#fee761',
  // Cyber / Storm / Shield (R0_MONO / R5_ENERGY)
  NAVY_DEEP: '#181425',
  SLATE_DARK: '#262b44',
  SLATE_MID: '#3a4466',
  STEEL: '#5a6988',
  STEEL_LIGHT: '#8b9bb4',
  SILVER: '#e6eef8',
  BLUE_DARK: '#124e89',
  CYAN_MID: '#0095e9',
  CYAN: '#2ce8f5',
  // Arcane / Magenta (R6_ARCANE)
  PLUM_DARK: '#381d4a',
  PLUM: '#622c73',
  MAGENTA: '#cf61b8',
  PINK: '#ff9ee2',
};

const RGBA_CACHE = new Map();
function rgba(hex, alpha = 255) {
  const key = `${hex}_${alpha}`;
  let val = RGBA_CACHE.get(key);
  if (!val) {
    val = hexToRgba(hex, alpha);
    RGBA_CACHE.set(key, val);
  }
  return val;
}

// ============================================================================
// Pure-Node Pixel Art Primitives
// ============================================================================

function setPx(img, x, y, col) {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return;
  const c = typeof col === 'string' ? rgba(col) : col;
  const idx = (iy * img.width + ix) * 4;
  if (c[3] === 0) {
    img.data[idx + 3] = 0;
    return;
  }
  img.data[idx] = c[0];
  img.data[idx + 1] = c[1];
  img.data[idx + 2] = c[2];
  img.data[idx + 3] = c[3];
}

function getPx(img, x, y) {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return [0, 0, 0, 0];
  const idx = (iy * img.width + ix) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

function fillRect(img, x, y, w, h, col) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(img.width, Math.floor(x + w));
  const y1 = Math.min(img.height, Math.floor(y + h));
  const c = typeof col === 'string' ? rgba(col) : col;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPx(img, px, py, c);
    }
  }
}

function fillEllipse(img, cx, cy, rx, ry, col) {
  if (rx <= 0 || ry <= 0) return;
  const c = typeof col === 'string' ? rgba(col) : col;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + ry));
  for (let py = y0; py <= y1; py++) {
    const dy = (py - cy) / ry;
    for (let px = x0; px <= x1; px++) {
      const dx = (px - cx) / rx;
      if (dx * dx + dy * dy <= 1.02) setPx(img, px, py, c);
    }
  }
}

function fillShadedEllipse(img, cx, cy, rx, ry, { dark, mid, light, rim }) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + ry));
  for (let py = y0; py <= y1; py++) {
    const dy = (py - cy) / ry;
    for (let px = x0; px <= x1; px++) {
      const dx = (px - cx) / rx;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1.02) continue;
      // Top-left key light directional term
      const shade = -dx * 0.45 - dy * 0.65;
      let col = mid;
      if (rim && d2 > 0.72 && shade > 0.28) col = rim;
      else if (light && shade > 0.18) col = light;
      else if (dark && shade < -0.22) col = dark;
      setPx(img, px, py, col);
    }
  }
}

function fillRoundedRect(img, x, y, w, h, r, col) {
  const rr = Math.min(r, w / 2, h / 2);
  fillRect(img, x + rr, y, w - 2 * rr, h, col);
  fillRect(img, x, y + rr, w, h - 2 * rr, col);
  fillEllipse(img, x + rr, y + rr, rr, rr, col);
  fillEllipse(img, x + w - 1 - rr, y + rr, rr, rr, col);
  fillEllipse(img, x + rr, y + h - 1 - rr, rr, rr, col);
  fillEllipse(img, x + w - 1 - rr, y + h - 1 - rr, rr, rr, col);
}

function drawLine(img, x0, y0, x1, y1, col) {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const sx = ix0 < ix1 ? 1 : -1;
  const dy = -Math.abs(iy1 - iy0);
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 1024; guard++) {
    setPx(img, ix0, iy0, col);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ix0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

function drawThickLine(img, x0, y0, x1, y1, radius, col) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    if (radius <= 0.6) setPx(img, px, py, col);
    else fillEllipse(img, px, py, radius, radius, col);
  }
}

function drawSpike(img, bx, by, tx, ty, halfW, darkCol, lightCol) {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const steps = Math.max(2, Math.ceil(len * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = halfW * (1 - t);
    const cx = bx + dx * t;
    const cy = by + dy * t;
    const sSteps = Math.max(1, Math.ceil(w * 2));
    for (let j = -sSteps; j <= sSteps; j++) {
      const s = j / sSteps;
      const px = cx + nx * s * w;
      const py = cy + ny * s * w;
      setPx(img, px, py, s <= 0 ? lightCol : darkCol);
    }
  }
}

function drawArcSlash(img, cx, cy, rInner, rOuter, aStart, aEnd, outerCol, innerCol, tipCol) {
  const minX = Math.max(0, Math.floor(cx - rOuter - 1));
  const maxX = Math.min(img.width - 1, Math.ceil(cx + rOuter + 1));
  const minY = Math.max(0, Math.floor(cy - rOuter - 1));
  const maxY = Math.min(img.height - 1, Math.ceil(cy + rOuter + 1));
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < rInner || dist > rOuter) continue;
      let ang = Math.atan2(dy, dx);
      while (ang < aStart - Math.PI) ang += Math.PI * 2;
      while (ang > aStart + Math.PI * 2) ang -= Math.PI * 2;
      if (ang < aStart || ang > aEnd) continue;
      const t = (ang - aStart) / Math.max(0.001, aEnd - aStart);
      const radialT = (dist - rInner) / Math.max(0.001, rOuter - rInner);
      if (t > 0.78 && radialT > 0.4) setPx(img, px, py, tipCol);
      else if (radialT > 0.55) setPx(img, px, py, innerCol);
      else setPx(img, px, py, outerCol);
    }
  }
}

function shiftImage(img, dx, dy) {
  const out = createImage(img.width, img.height);
  blitImage(out, img, Math.round(dx), Math.round(dy));
  return out;
}

function remapNonTransparent(img, mapperFn) {
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < 128) continue;
    const mapped = mapperFn(out.data[i], out.data[i + 1], out.data[i + 2], out.data[i + 3]);
    if (!mapped) continue;
    const c = typeof mapped === 'string' ? rgba(mapped) : mapped;
    out.data[i] = c[0];
    out.data[i + 1] = c[1];
    out.data[i + 2] = c[2];
    out.data[i + 3] = c[3] ?? 255;
  }
  return out;
}

function fitToBoxKeepAspect(img, maxW, maxH) {
  const bbox = getOpaqueBBox(img, 128);
  if (bbox.empty) return cloneImage(img);
  const cropped = cropImage(img, bbox.minX, bbox.minY, bbox.width, bbox.height);
  const scale = Math.min(1, maxW / cropped.width, maxH / cropped.height);
  if (scale >= 0.999) return cropped;
  const nw = Math.max(1, Math.round(cropped.width * scale));
  const nh = Math.max(1, Math.round(cropped.height * scale));
  return resizeImage(cropped, nw, nh);
}

// ============================================================================
// Pure-Node Minimal Zip Entry Extractor (zero external deps, read-only buffer)
// ============================================================================

function extractZipFilesMap(zipBuf, wantedNamesSet) {
  const out = new Map();
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65558); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const total = zipBuf.readUInt16LE(eocd + 10);
  const cdOff = zipBuf.readUInt32LE(eocd + 16);
  let p = cdOff;
  for (let i = 0; i < total && p + 46 <= zipBuf.length; i++) {
    if (zipBuf.readUInt32LE(p) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(p + 10);
    const compSize = zipBuf.readUInt32LE(p + 20);
    const nlen = zipBuf.readUInt16LE(p + 28);
    const elen = zipBuf.readUInt16LE(p + 30);
    const clen = zipBuf.readUInt16LE(p + 32);
    const lfhOff = zipBuf.readUInt32LE(p + 42);
    const name = zipBuf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    if (wantedNamesSet.has(name)) {
      const ln = zipBuf.readUInt16LE(lfhOff + 26);
      const le = zipBuf.readUInt16LE(lfhOff + 28);
      const start = lfhOff + 30 + ln + le;
      const comp = zipBuf.subarray(start, start + compSize);
      const raw = method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
      out.set(name, raw);
    }
    p += 46 + nlen + elen + clen;
  }
  return out;
}

// ============================================================================
// Verified CC0 OSS Asset Fetcher w/ Cache & Deterministic Fallback
// ============================================================================

const OSS_SOURCES = {
  skeletonZip: {
    sourceId: 'oga_skeletons_rework',
    license: 'CC0-1.0',
    url: 'https://opengameart.org/sites/default/files/skeleton-1.4.zip',
    cacheFile: 'skeleton-1.4.zip',
  },
  pickupsZip: {
    sourceId: 'spritepilot_pickups',
    license: 'CC0-1.0',
    url: 'https://spritepilot.com/free-assets/pickups/spritepilot-pickups-pack.zip',
    cacheFile: 'spritepilot-pickups-pack.zip',
  },
  scifiTilesZip: {
    sourceId: 'oga_scifi_tiles',
    license: 'CC0-1.0',
    url: 'https://opengameart.org/sites/default/files/Sci-Fi%20Platformer%20Tileset%20%5B16x16%5D%5BFREE%5D%20-%20RottingPixels.zip',
    cacheFile: 'rottingpixels-scifi.zip',
  },
};

const RAW_OSS_FILES = {
  sp_western_tiles: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/0-tileset-32x32.png',
    cacheFile: 'sp-western-tiles.png',
  },
  sp_cactus: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/cactus-1.png',
    cacheFile: 'sp-cactus-1.png',
  },
  sp_barrel_exp: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/explosive-barrel.png',
    cacheFile: 'sp-explosive-barrel.png',
  },
  sp_crate: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/crate-2.png',
    cacheFile: 'sp-crate-2.png',
  },
  sp_jar: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/jar-1.png',
    cacheFile: 'sp-jar-1.png',
  },
  sp_rock: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/rock-1.png',
    cacheFile: 'sp-rock-1.png',
  },
  sp_grave: {
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/background-elements/grave-1.png',
    cacheFile: 'sp-grave-1.png',
  },
  kenney_desert_floor: {
    sourceId: 'kenney_desert_shooter',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/Tiles/Tiles/tile_0000.png',
    cacheFile: 'kenney-desert-0000.png',
  },
  kenney_desert_wall: {
    sourceId: 'kenney_desert_shooter',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/Tiles/Tiles/tile_0012.png',
    cacheFile: 'kenney-desert-0012.png',
  },
  kenney_desert_enemy: {
    sourceId: 'kenney_desert_shooter',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/Enemies/Tiles/tile_0000.png',
    cacheFile: 'kenney-desert-enemy-0000.png',
  },
  kenney_dungeon_floor: {
    sourceId: 'kenney_tiny_dungeon',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Tiny%20Dungeon/Tiles/tile_0048.png',
    cacheFile: 'kenney-dungeon-0048.png',
  },
  kenney_dungeon_wall: {
    sourceId: 'kenney_tiny_dungeon',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Tiny%20Dungeon/Tiles/tile_0000.png',
    cacheFile: 'kenney-dungeon-0000.png',
  },
  kenney_scifi_floor: {
    sourceId: 'kenney_rts_scifi',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/RTS%20Sci-fi/Tile/scifiTile_01.png',
    cacheFile: 'kenney-scifi-tile01.png',
  },
  kenney_scifi_server: {
    sourceId: 'kenney_rts_scifi',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/RTS%20Sci-fi/Structure/scifiStructure_01.png',
    cacheFile: 'kenney-scifi-struct01.png',
  },
};

async function fetchOrCacheBuffer(spec) {
  const dest = path.join(CACHE_DIR, spec.cacheFile);
  if (!FORCE_FETCH && existsSync(dest)) {
    return fs.readFile(dest);
  }
  if (OFFLINE_MODE) return null;
  try {
    const { buffer } = await fetchBuffer(spec.url, {
      timeoutMs: 25000,
      retries: 2,
      maxBytes: 25 * 1024 * 1024,
      expect: spec.cacheFile.endsWith('.zip') ? 'zip' : 'png',
    });
    await fs.writeFile(dest, buffer);
    return buffer;
  } catch (err) {
    console.warn(`[w13][warn] fetch failed (${spec.sourceId}): ${err.message}`);
    return null;
  }
}

async function loadOssAssets() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const assets = {
    skeletonEast: null,
    pickups: {},
    scifiTileset: null,
    raw: {},
    fetchLog: [],
  };

  // Fetch raw direct PNG files concurrently in batches
  const rawEntries = Object.entries(RAW_OSS_FILES);
  await Promise.all(
    rawEntries.map(async ([key, spec]) => {
      const buf = await fetchOrCacheBuffer(spec);
      if (!buf) {
        assets.fetchLog.push({ key, sourceId: spec.sourceId, ok: false, url: spec.url });
        return;
      }
      try {
        assets.raw[key] = decodePng(buf);
        assets.fetchLog.push({ key, sourceId: spec.sourceId, ok: true, url: spec.url });
      } catch (e) {
        assets.fetchLog.push({ key, sourceId: spec.sourceId, ok: false, url: spec.url, err: e.message });
      }
    }),
  );

  // Skeleton 1.4 CC0 zip
  const skelZip = await fetchOrCacheBuffer(OSS_SOURCES.skeletonZip);
  if (skelZip) {
    try {
      const m = extractZipFilesMap(skelZip, new Set(['PNG/24x32/skeleton-NESW.png']));
      const png = m.get('PNG/24x32/skeleton-NESW.png');
      if (png) {
        const sheet = decodePng(png);
        const cells = sliceSpriteSheet(sheet, 24, 32, { cols: 3, rows: 4, count: 12 });
        // Row 1 (indices 3,4,5) is East (right-facing)
        assets.skeletonEast = [cells[3], cells[4], cells[5]];
        assets.fetchLog.push({ key: 'skeletonEast', sourceId: 'oga_skeletons_rework', ok: true, url: OSS_SOURCES.skeletonZip.url });
      }
    } catch (e) {
      assets.fetchLog.push({ key: 'skeletonEast', sourceId: 'oga_skeletons_rework', ok: false, err: e.message });
    }
  } else {
    assets.fetchLog.push({ key: 'skeletonEast', sourceId: 'oga_skeletons_rework', ok: false });
  }

  // SpritePilot pickups zip
  const pkZip = await fetchOrCacheBuffer(OSS_SOURCES.pickupsZip);
  if (pkZip) {
    try {
      const pkFiles = [
        ['coin', 'spritepilot-pickups-pack/32px/coin-32px_strip8.png', 8],
        ['gem', 'spritepilot-pickups-pack/32px/gem-32px_strip8.png', 8],
        ['heart', 'spritepilot-pickups-pack/32px/heart-32px_strip5.png', 5],
        ['shield', 'spritepilot-pickups-pack/32px/shield-32px_strip8.png', 8],
        ['lightning', 'spritepilot-pickups-pack/32px/lightning-32px_strip8.png', 8],
        ['potion', 'spritepilot-pickups-pack/32px/potion-32px_strip8.png', 8],
      ];
      const map = extractZipFilesMap(pkZip, new Set(pkFiles.map((f) => f[1])));
      for (const [k, entryName, count] of pkFiles) {
        const raw = map.get(entryName);
        if (raw) {
          assets.pickups[k] = sliceSpriteSheet(decodePng(raw), 32, 32, { cols: count, rows: 1, count });
        }
      }
      assets.fetchLog.push({ key: 'pickupsZip', sourceId: 'spritepilot_pickups', ok: Object.keys(assets.pickups).length > 0, url: OSS_SOURCES.pickupsZip.url });
    } catch (e) {
      assets.fetchLog.push({ key: 'pickupsZip', sourceId: 'spritepilot_pickups', ok: false, err: e.message });
    }
  } else {
    assets.fetchLog.push({ key: 'pickupsZip', sourceId: 'spritepilot_pickups', ok: false });
  }

  // RottingPixels Sci-Fi tileset zip
  const sfZip = await fetchOrCacheBuffer(OSS_SOURCES.scifiTilesZip);
  if (sfZip) {
    try {
      const entry = 'Sci-Fi Platformer Tileset [16x16][FREE] - RottingPixels/sci-fi-tileset.png';
      const map = extractZipFilesMap(sfZip, new Set([entry]));
      const raw = map.get(entry);
      if (raw) {
        const img = decodePng(raw);
        assets.scifiTileset = sliceSpriteSheet(img, 16, 16, { cols: 8, rows: 8, count: 64 });
        assets.fetchLog.push({ key: 'scifiTileset', sourceId: 'oga_scifi_tiles', ok: true, url: OSS_SOURCES.scifiTilesZip.url });
      }
    } catch (e) {
      assets.fetchLog.push({ key: 'scifiTileset', sourceId: 'oga_scifi_tiles', ok: false, err: e.message });
    }
  } else {
    assets.fetchLog.push({ key: 'scifiTileset', sourceId: 'oga_scifi_tiles', ok: false });
  }

  return assets;
}

// ============================================================================
// Normalization & Disk Serialization Helper
// ============================================================================

async function emitStrip({
  id,
  dir,
  rawFrames,
  cellW,
  cellH,
  fps,
  loop,
  category,
  tier,
  pivotMode = 'feet',
  outlineMode = '4conn',
  stripExistingOutline = true,
  lockFirstFrameFoot = true,
  footPadBottom = 2,
  lutStrength = 1.0,
  sourceId,
  license,
  url,
  fallback = false,
  aliases = undefined,
}) {
  let packed;
  if (outlineMode === 'none' && pivotMode === 'tile') {
    // Seamless tile strip: enforce opaque pixels -> preserve #181425 -> LUT quantize
    const norm = rawFrames.map((f) => {
      const cloned = f.width === cellW && f.height === cellH ? cloneImage(f) : resizeImage(f, cellW, cellH);
      const hardened = hardenAlpha(cloned, 128);
      if (category === 'tile') {
        for (let i = 0; i < hardened.data.length; i += 4) {
          hardened.data[i + 3] = 255;
        }
      }
      const quantized = quantizeImageToPalette48(hardened, { lutStrength, preserveOutline: true });
      if (category === 'tile') {
        for (let i = 0; i < quantized.data.length; i += 4) {
          if (quantized.data[i + 3] < 255) {
            throw new Error(`Tile ${id} contains transparent pixel at byte ${i}`);
          }
        }
      }
      return quantized;
    });
    const strip = packStrip(norm, cellW, cellH);
    packed = {
      ...strip,
      offX: -Math.round(cellW / 2),
      offY: -Math.round(cellH / 2),
      tier,
    };
  } else {
    packed = packFeetAnchorSheet(rawFrames, {
      tier,
      cellW,
      cellH,
      preScale: 1,
      flipX: false,
      pivotMode,
      outlineMode,
      stripExistingOutline,
      lockFirstFrameFoot,
      footPadBottom,
      lutStrength,
      autoPromote: false,
    });
  }

  const outPath = path.join(dir, `${id}.png`);
  await fs.writeFile(outPath, packed.pngBuffer);

  const relPath = path.relative(DB_ROOT, outPath).replace(/\\/g, '/');
  return {
    id,
    path: relPath,
    frames: packed.frames,
    cellW: packed.cellW,
    cellH: packed.cellH,
    offX: packed.offX,
    offY: packed.offY,
    fps,
    loop,
    nativeFacing: NORM_CONSTANTS.NATIVE_FACING,
    category,
    tier: tier ?? cellW,
    sourceId,
    license,
    url,
    fallback,
    bytes: packed.pngBuffer.length,
    sha256: sha256Hex(packed.pngBuffer),
    ...(aliases && aliases.length > 0 ? { aliases } : {}),
  };
}

// ============================================================================
// Chibi Humanoid / Monster Drawing Helpers (48x48 / 32x32 / 64x64)
// ============================================================================

function drawBoots(img, cx, footY, strideOffset, colMain, colLight) {
  const lx = cx - 4 - strideOffset;
  const rx = cx + 3 + strideOffset;
  const ly = footY - 3 - Math.max(0, strideOffset);
  const ry = footY - 3 - Math.max(0, -strideOffset);
  fillRect(img, lx - 2, ly, 5, 4, colMain);
  fillRect(img, lx - 1, ly, 2, 1, colLight);
  fillRect(img, rx - 2, ry, 5, 4, colMain);
  fillRect(img, rx - 1, ry, 2, 1, colLight);
}

// ============================================================================
// 8 REGULAR MOBS (sprites/mobs/)
// ============================================================================

function buildScarabMob(oss) {
  // 32x32 cells, footPadBottom: 4 -> offX: -16, offY: -28 (matches enemies.ts scarab!)
  // Right-facing golden-amber armored desert scarab beetle
  const hasKenney = Boolean(oss.raw.kenney_desert_enemy);
  const drawScarab = ({ bob = 0, wingOpen = 0, legPhase = 0, lunge = 0, mandOpen = 0, deadStage = -1 }) => {
    const f = createImage(32, 32);
    const cx = 16 + lunge;
    const cy = 22 + bob;

    if (deadStage >= 0) {
      const y = 24 + Math.min(2, deadStage);
      // Flipped cracked shell
      fillShadedEllipse(f, cx, y, 7, 4, { dark: C.SAND_DARK, mid: C.SAND_MID, light: C.SAND });
      drawLine(f, cx - 3, y - 3, cx + 2, y + 3, C.OUTLINE);
      drawLine(f, cx + 1, y - 3, cx - 2, y + 2, C.OUTLINE);
      // Twitched legs pointing up
      for (const lx of [-5, -1, 4]) {
        drawLine(f, cx + lx, y - 3, cx + lx + (deadStage % 2 ? 1 : -1), y - 6, C.SAND_DARK);
      }
      if (deadStage < 2) {
        fillEllipse(f, cx - 5, y + 1, 2, 2, C.SAND_LIGHT);
        fillEllipse(f, cx + 6, y, 2, 1, C.SAND_LIGHT);
      }
      return f;
    }

    // 6 scuttling legs
    for (let i = -1; i <= 1; i++) {
      const phase = ((i + legPhase) % 2 === 0) ? 1 : -1;
      const lx = cx + i * 4;
      drawLine(f, lx, cy + 1, lx + phase * 2, cy + 5, C.SAND_DARK);
      drawLine(f, lx - 1, cy - 3, lx - phase, cy - 6, C.SAND_DARK);
    }

    // Fluttering translucent-style bright elytra wing flaps
    if (wingOpen > 0) {
      fillEllipse(f, cx - 4, cy - 5 - wingOpen, 5, 3, C.YELLOW);
      fillEllipse(f, cx - 2, cy - 4 - wingOpen, 4, 2, C.SAND_LIGHT);
    }

    // Armored ovoid carapace (facing right)
    fillShadedEllipse(f, cx - 1, cy - 1, 8, 5, {
      dark: C.SAND_DARK,
      mid: C.ORANGE,
      light: C.GOLD,
      rim: C.YELLOW,
    });
    // Wing-seam & armor crest
    drawLine(f, cx - 8, cy - 1, cx + 3, cy - 1, C.SAND_DARK);
    fillRect(f, cx + 2, cy - 4, 3, 6, C.GOLD);

    // Head plate + pincer mandibles facing right (+x)
    fillShadedEllipse(f, cx + 6, cy, 4, 3, {
      dark: C.SAND_DARK,
      mid: C.SAND_MID,
      light: C.SAND_LIGHT,
    });
    // Glowing amber eyes
    setPx(f, cx + 8, cy - 1, C.YELLOW);
    setPx(f, cx + 8, cy + 1, C.YELLOW);

    // Mandibles
    drawLine(f, cx + 7, cy - 2 - mandOpen, cx + 10, cy - 1 - mandOpen, C.BONE);
    drawLine(f, cx + 7, cy + 2 + mandOpen, cx + 10, cy + 1 + mandOpen, C.BONE);
    if (lunge > 0) {
      setPx(f, cx + 11, cy, C.YELLOW);
    }
    return f;
  };

  return {
    sourceId: hasKenney ? 'kenney_desert_shooter' : 'generated_synth',
    license: 'CC0-1.0',
    url: hasKenney ? RAW_OSS_FILES.kenney_desert_enemy.url : 'local://generated/scarab',
    fallback: false,
    cellW: 32,
    cellH: 32,
    footPadBottom: 4,
    tier: 32,
    anims: {
      idle: {
        fps: 4,
        loop: true,
        frames: [
          drawScarab({ bob: 0, wingOpen: 0 }),
          drawScarab({ bob: -1, wingOpen: 1 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [
          drawScarab({ bob: 0, wingOpen: 1, legPhase: 0 }),
          drawScarab({ bob: -1, wingOpen: 2, legPhase: 1 }),
          drawScarab({ bob: 0, wingOpen: 1, legPhase: 0 }),
          drawScarab({ bob: -1, wingOpen: 0, legPhase: 1 }),
        ],
      },
      attack: {
        fps: 16,
        loop: false,
        frames: [
          drawScarab({ bob: 0, lunge: -1, mandOpen: 1 }),
          drawScarab({ bob: -1, lunge: 0, mandOpen: 1, wingOpen: 1 }),
          drawScarab({ bob: 0, lunge: 1, mandOpen: 1, wingOpen: 1 }),
          drawScarab({ bob: 0, lunge: 0, mandOpen: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [
          drawScarab({ deadStage: 0 }),
          drawScarab({ deadStage: 1 }),
          drawScarab({ deadStage: 2 }),
        ],
      },
    },
  };
}

function buildSkirmisherMob(oss) {
  // 48x48 Raider Skeleton w/ real CC0 oga_skeletons_rework base + crimson bandana + scimitar
  const baseWalk = oss.skeletonEast;
  const hasOss = Array.isArray(baseWalk) && baseWalk.length === 3;

  function drawSkelFrame({ walkIdx = 1, bob = 0, shiftX = 0, armPose = 'ready', slashStage = 0, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 22 + shiftX;
    const footY = 44;

    if (deadStage >= 0) {
      const drop = Math.min(4, deadStage * 2);
      // Collapsed bone pile & crimson scarf
      fillShadedEllipse(f, cx - 2, footY - 3, 9, 3, { dark: C.SAND_MID, mid: C.BONE, light: C.BONE_LIGHT });
      fillRect(f, cx - 7, footY - 4, 8, 3, C.RED_MID);
      // Detached skull rolling right
      fillShadedEllipse(f, cx + 6 + deadStage, footY - 6 + drop, 5, 4, { dark: C.SAND_MID, mid: C.BONE, light: C.BONE_LIGHT });
      setPx(f, cx + 7 + deadStage, footY - 6 + drop, C.RED_BRIGHT);
      // Dropped scimitar
      drawThickLine(f, cx - 10, footY - 2, cx - 1, footY - 5 + drop, 0.8, C.SILVER);
      return f;
    }

    if (hasOss) {
      // Composite real 24x32 CC0 skeleton-NESW East frame stripped of its old dark outline,
      // centered cleanly on (cx, footY) inside 48x48
      const rawCell = cloneImage(baseWalk[walkIdx % 3]);
      stripDarkOutline(rawCell, { lumaMax: 52, alphaCutoff: 128 });
      blitImage(f, rawCell, Math.round(cx - 12), Math.round(footY - 31 + bob));
    } else {
      // Fallback pure-Node skeleton silhouette matching 24x32 proportions
      const by = footY - 26 + bob;
      drawBoots(f, cx, footY, (walkIdx - 1) * 2, C.BONE, C.BONE_LIGHT);
      fillRect(f, cx - 4, by + 11, 8, 9, C.BONE);
      drawLine(f, cx - 2, by + 13, cx + 3, by + 13, C.SAND_DARK);
      drawLine(f, cx - 2, by + 16, cx + 3, by + 16, C.SAND_DARK);
      fillShadedEllipse(f, cx, by + 5, 6, 6, { dark: C.SAND, mid: C.BONE, light: C.BONE_LIGHT });
    }

    // Add glowing crimson eyes + Desert Raider crimson bandana RIGHT across brow & trailing tails
    const headY = footY - 22 + bob;
    fillRect(f, cx - 3, headY - 2, 7, 2, C.RED_MID);
    fillRect(f, cx - 2, headY - 2, 5, 1, C.RED_BRIGHT);
    drawLine(f, cx - 4, headY - 2, cx - 8 - (walkIdx % 2), headY - 1, C.RED_BRIGHT);
    drawLine(f, cx - 4, headY - 1, cx - 7, headY + 1, C.RED_DARK);
    // Glowing eye on right face
    setPx(f, cx + 2, headY + 1, C.RED_BRIGHT);
    setPx(f, cx + 3, headY + 1, C.YELLOW);
    // Crimson sash belt
    fillRect(f, cx - 3, footY - 13 + bob, 7, 2, C.RED_MID);

    // Curved Steel Scimitar & Attack Slash Arc (right-facing, keeps <=42 for zero clip)
    const hx = cx + 5;
    const hy = footY - 15 + bob;
    if (armPose === 'ready') {
      drawThickLine(f, hx - 1, hy, hx + 6, hy - 6, 0.9, C.STEEL_LIGHT);
      drawLine(f, hx + 5, hy - 7, hx + 8, hy - 5, C.BONE_LIGHT);
      fillRect(f, hx - 2, hy - 1, 3, 3, C.GOLD);
    } else if (armPose === 'windup') {
      drawThickLine(f, cx - 2, hy - 2, cx - 8, hy - 9, 0.9, C.SILVER);
      fillRect(f, cx - 3, hy - 3, 3, 3, C.GOLD);
    } else if (armPose === 'slash') {
      drawThickLine(f, hx, hy, hx + 7, hy + 2, 1.0, C.BONE_LIGHT);
      fillRect(f, hx - 1, hy - 1, 3, 3, C.GOLD);
      drawArcSlash(f, cx + 1, hy, 6, 11 - slashStage, -0.9, 0.85, C.STEEL_LIGHT, C.SILVER, C.BONE_LIGHT);
    } else if (armPose === 'lunge') {
      // Forward horizontal spear/scimitar thrust + red speed streaks
      drawThickLine(f, hx - 1, hy, hx + 8, hy, 1.0, C.BONE_LIGHT);
      fillRect(f, hx - 2, hy - 2, 3, 4, C.GOLD);
      drawLine(f, cx - 12, hy - 4, cx - 4, hy - 4, C.RED_BRIGHT);
      drawLine(f, cx - 14, hy + 1, cx - 6, hy + 1, C.ORANGE);
    }
    return f;
  }

  return {
    sourceId: hasOss ? 'oga_skeletons_rework' : 'generated_synth',
    license: 'CC0-1.0',
    url: hasOss ? OSS_SOURCES.skeletonZip.url : 'local://generated/skirmisher',
    fallback: !hasOss,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 5,
        loop: true,
        frames: [
          drawSkelFrame({ walkIdx: 1, bob: 0, armPose: 'ready' }),
          drawSkelFrame({ walkIdx: 1, bob: -1, armPose: 'ready' }),
          drawSkelFrame({ walkIdx: 1, bob: 0, armPose: 'ready' }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [0, 1, 2, 1, 0, 2].map((w, idx) =>
          drawSkelFrame({ walkIdx: w, bob: idx % 2 ? -1 : 0, armPose: 'ready' }),
        ),
      },
      attack: {
        fps: 15,
        loop: false,
        frames: [
          drawSkelFrame({ walkIdx: 1, armPose: 'windup', shiftX: -2 }),
          drawSkelFrame({ walkIdx: 2, armPose: 'windup', shiftX: -1 }),
          drawSkelFrame({ walkIdx: 2, armPose: 'slash', slashStage: 0, shiftX: 1 }),
          drawSkelFrame({ walkIdx: 1, armPose: 'slash', slashStage: 2, shiftX: 1 }),
          drawSkelFrame({ walkIdx: 1, armPose: 'ready', shiftX: 0 }),
        ],
      },
      lunge: {
        fps: 14,
        loop: false,
        frames: [
          drawSkelFrame({ walkIdx: 0, armPose: 'windup', shiftX: -3 }),
          drawSkelFrame({ walkIdx: 2, armPose: 'lunge', shiftX: 2 }),
          drawSkelFrame({ walkIdx: 2, armPose: 'lunge', shiftX: 1 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawSkelFrame({ deadStage: d })),
      },
    },
  };
}

function buildBombGoblinMob() {
  function drawGoblin({ bob = 0, stride = 0, fusePhase = 0, flash = false, armRaise = 0, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 23;
    const footY = 44;

    if (deadStage >= 0) {
      // Soot blast puddle & tattered goggles
      fillEllipse(f, cx, footY - 3, 10 + deadStage * 2, 4, C.SLATE_DARK);
      fillEllipse(f, cx, footY - 4, 6 + deadStage, 3, C.NAVY_DEEP);
      // Dropped bronze goggles
      fillRect(f, cx + 4, footY - 7 + Math.min(2, deadStage), 6, 3, C.SAND_MID);
      setPx(f, cx + 5, footY - 6 + Math.min(2, deadStage), C.CYAN);
      if (deadStage < 2) {
        drawLine(f, cx - 5, footY - 8, cx - 8, footY - 12, C.ORANGE);
        drawLine(f, cx + 5, footY - 9, cx + 9, footY - 13, C.YELLOW);
      }
      return f;
    }

    const skinDark = flash ? C.RED_MID : C.LEAF_DARK;
    const skinMid = flash ? C.RED_BRIGHT : C.LEAF;
    const skinLight = flash ? C.GOLD : C.LEAF_BRIGHT;

    drawBoots(f, cx, footY, stride, C.SAND_DARK, C.SAND_MID);

    // Chibi leather-vest body
    const by = footY - 12 + bob;
    fillShadedEllipse(f, cx, by + 4, 7, 5, { dark: C.SAND_DARK, mid: C.SAND_MID, light: C.SAND });
    fillRect(f, cx - 5, by + 6, 10, 2, C.SLATE_DARK);
    setPx(f, cx + 2, by + 6, C.GOLD);

    // Pointy green goblin head + left long ear
    const hy = by - 5;
    drawSpike(f, cx - 5, hy, cx - 12, hy - 3, 2.2, skinDark, skinMid);
    fillShadedEllipse(f, cx + 1, hy, 7, 5.5, { dark: skinDark, mid: skinMid, light: skinLight });
    // Goggle strap & big amber aviator goggles (facing right)
    fillRect(f, cx - 5, hy - 2, 12, 3, C.SAND_DARK);
    fillEllipse(f, cx + 2, hy - 1, 2.5, 2.2, C.GOLD);
    fillEllipse(f, cx + 6, hy - 1, 2.2, 2.2, C.GOLD);
    setPx(f, cx + 2, hy - 1, C.YELLOW);
    setPx(f, cx + 6, hy - 1, C.YELLOW);
    // Pointy goblin nose & grin
    fillRect(f, cx + 7, hy + 1, 3, 2, skinLight);
    fillRect(f, cx + 2, hy + 3, 4, 1, C.BONE);

    // Arms holding giant iron fuse bomb overhead (kept comfortably inside y >= 4)
    const bx = cx + 1;
    const bombY = hy - 8 - Math.min(2, armRaise);
    drawThickLine(f, cx - 5, by, bx - 4, bombY + 3, 1.4, skinMid);
    drawThickLine(f, cx + 6, by, bx + 4, bombY + 3, 1.4, skinMid);

    // Spherical Black Iron Bomb
    fillShadedEllipse(f, bx, bombY, 6, 6, {
      dark: C.NAVY_DEEP,
      mid: flash ? C.RED_BRIGHT : C.SLATE_DARK,
      light: flash ? C.YELLOW : C.STEEL,
      rim: C.STEEL_LIGHT,
    });
    fillRect(f, bx - 2, bombY - 7, 4, 2, C.STEEL);
    // Fuse cord & sputtering sparks
    drawLine(f, bx, bombY - 8, bx + 3, bombY - 10, C.SAND);
    const sx = bx + 4;
    const sy = bombY - 11;
    setPx(f, sx, sy, fusePhase % 2 ? C.YELLOW : C.ORANGE);
    setPx(f, sx + ((fusePhase % 3) - 1), sy - 1, C.RED_BRIGHT);
    setPx(f, sx + 2, sy - (fusePhase % 2), C.BONE_LIGHT);
    if (flash) {
      setPx(f, sx - 2, sy - 1, C.YELLOW);
      setPx(f, sx + 3, sy + 1, C.ORANGE);
    }

    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/bomb_goblin',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 5,
        loop: true,
        frames: [
          drawGoblin({ bob: 0, fusePhase: 0 }),
          drawGoblin({ bob: -1, fusePhase: 1 }),
          drawGoblin({ bob: 0, fusePhase: 2 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((s, i) =>
          drawGoblin({ bob: i % 2 ? -1 : 0, stride: s, fusePhase: i }),
        ),
      },
      fuse_run: {
        fps: 16,
        loop: true,
        frames: [
          drawGoblin({ bob: -1, stride: -3, fusePhase: 0, armRaise: 1 }),
          drawGoblin({ bob: 0, stride: 3, fusePhase: 1, armRaise: 2, flash: true }),
          drawGoblin({ bob: -1, stride: -3, fusePhase: 2, armRaise: 1 }),
          drawGoblin({ bob: 0, stride: 3, fusePhase: 3, armRaise: 2, flash: true }),
        ],
      },
      spark: {
        fps: 18,
        loop: true,
        frames: [
          drawGoblin({ bob: 0, fusePhase: 0, armRaise: 2, flash: false }),
          drawGoblin({ bob: -1, fusePhase: 1, armRaise: 3, flash: true }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2].map((d) => drawGoblin({ deadStage: d })),
      },
    },
  };
}

function buildCactusBruteMob() {
  // 64x64 Hulking Saguaro Juggernaut (enemies.ts: [frames, 64, 64, -32, -58])
  function drawBrute({ bob = 0, stride = 0, armY = 0, armFwd = 0, jumpY = 0, slamWave = 0, deadStage = -1 }) {
    const f = createImage(64, 64);
    const cx = 30;
    const footY = 58;

    if (deadStage >= 0) {
      // Toppled cactus logs + white spines + sand puffs
      fillShadedEllipse(f, cx - 6, footY - 5, 11, 6, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      fillShadedEllipse(f, cx + 8, footY - 4 + Math.min(2, deadStage), 9, 5, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      fillRect(f, cx - 2, footY - 7, 5, 4, C.SAND);
      setPx(f, cx - 8, footY - 10, C.BONE_LIGHT);
      setPx(f, cx + 10, footY - 9, C.BONE_LIGHT);
      if (deadStage < 2) {
        fillEllipse(f, cx - 14, footY - 2, 3, 2, C.SAND_LIGHT);
        fillEllipse(f, cx + 15, footY - 2, 3, 2, C.SAND_LIGHT);
      }
      return f;
    }

    const by = footY - jumpY + bob;

    // Shockwave ring under fists on slam impact (kept inside 64x64 bounds)
    if (slamWave > 0) {
      const rx = 12 + slamWave * 2;
      fillEllipse(f, cx + 1, footY - 2, rx, 3, C.ORANGE);
      fillEllipse(f, cx + 1, footY - 2, rx - 3, 2, C.YELLOW);
    }

    // Thick stump legs
    fillRect(f, cx - 10 - stride, by - 10, 8, 10, C.LEAF_DARK);
    fillRect(f, cx - 9 - stride, by - 9, 4, 8, C.LEAF);
    fillRect(f, cx + 2 + stride, by - 10, 8, 10, C.LEAF_DARK);
    fillRect(f, cx + 3 + stride, by - 9, 4, 8, C.LEAF);

    // Back left cactus arm
    fillShadedEllipse(f, cx - 15, by - 25 + armY, 6, 10, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });

    // Massive ribbed barrel torso + head
    fillShadedEllipse(f, cx, by - 26, 16, 19, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT, rim: C.YELLOW });
    // Vertical cactus ribs
    for (const rx of [-9, -3, 3, 9]) {
      drawLine(f, cx + rx, by - 42, cx + rx, by - 10, C.LEAF_DARK);
    }
    // Desert loincloth belt
    fillRect(f, cx - 14, by - 14, 28, 4, C.SAND_DARK);
    fillRect(f, cx - 3, by - 14, 7, 4, C.GOLD);

    // Fierce glowing eyes + jagged frown (facing right)
    fillRect(f, cx - 1, by - 35, 13, 5, C.LEAF_DARK);
    fillRect(f, cx + 2, by - 34, 4, 3, C.YELLOW);
    fillRect(f, cx + 8, by - 34, 4, 3, C.YELLOW);
    setPx(f, cx + 3, by - 33, C.ORANGE);
    setPx(f, cx + 9, by - 33, C.ORANGE);

    // Sharp white cactus spines around shoulders & crown
    drawSpike(f, cx - 6, by - 44, cx - 9, by - 50, 1.5, C.BONE, C.BONE_LIGHT);
    drawSpike(f, cx + 1, by - 45, cx + 2, by - 52, 1.5, C.BONE, C.BONE_LIGHT);
    drawSpike(f, cx + 8, by - 43, cx + 12, by - 48, 1.5, C.BONE, C.BONE_LIGHT);
    drawSpike(f, cx - 15, by - 28, cx - 21, by - 31, 1.5, C.BONE, C.BONE_LIGHT);

    // Giant Spiked Cactus Fist (front right arm, padded inside cell)
    const fx = cx + 12 + armFwd;
    const fy = by - 21 + armY;
    fillShadedEllipse(f, fx, fy, 7, 7, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    drawSpike(f, fx + 4, fy - 3, fx + 8, fy - 4, 1.4, C.BONE, C.BONE_LIGHT);
    drawSpike(f, fx + 5, fy + 2, fx + 8, fy + 3, 1.4, C.BONE, C.BONE_LIGHT);

    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/cactus_brute',
    fallback: false,
    cellW: 64,
    cellH: 64,
    footPadBottom: 6,
    tier: 48,
    anims: {
      idle: {
        fps: 4,
        loop: true,
        frames: [
          drawBrute({ bob: 0, armY: 0 }),
          drawBrute({ bob: -1, armY: -1 }),
          drawBrute({ bob: 0, armY: 1 }),
        ],
      },
      run: {
        fps: 8,
        loop: true,
        frames: [-3, -1, 2, 3, 1, -2].map((s, i) =>
          drawBrute({ bob: i % 2 ? -2 : 0, stride: s, armY: -s, armFwd: s }),
        ),
      },
      attack: {
        fps: 12,
        loop: false,
        frames: [
          drawBrute({ armY: -6, armFwd: -4 }),
          drawBrute({ armY: -8, armFwd: -5 }),
          drawBrute({ armY: 0, armFwd: 5 }),
          drawBrute({ armY: 2, armFwd: 6 }),
          drawBrute({ armY: 1, armFwd: 3 }),
          drawBrute({ armY: 0, armFwd: 1 }),
        ],
      },
      slam: {
        fps: 12,
        loop: false,
        frames: [
          drawBrute({ bob: 3, armY: -12, armFwd: -2 }),
          drawBrute({ jumpY: 8, armY: -15, armFwd: 1 }),
          drawBrute({ jumpY: 10, armY: -12, armFwd: 2 }),
          drawBrute({ jumpY: 0, armY: 12, armFwd: 4, slamWave: 1 }),
          drawBrute({ jumpY: 0, armY: 12, armFwd: 4, slamWave: 2 }),
          drawBrute({ jumpY: 0, armY: 4, armFwd: 2, slamWave: 0 }),
        ],
      },
      dead: {
        fps: 8,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawBrute({ deadStage: d })),
      },
    },
  };
}

function buildCactusSpitterMob() {
  function drawSpitter({ bob = 0, stride = 0, swell = 0, spitFrame = 0, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;

    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 8, 4, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      fillEllipse(f, cx + 6, footY - 3, 3, 2, C.RED_BRIGHT);
      return f;
    }

    // Little desert root feet
    fillRect(f, cx - 5 - stride, footY - 4, 4, 4, C.LEAF_DARK);
    fillRect(f, cx + 2 + stride, footY - 4, 4, 4, C.LEAF_DARK);

    // Chubby ribbed cactus body
    const by = footY - 14 + bob;
    fillShadedEllipse(f, cx, by, 9 + swell, 11 - swell, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    drawLine(f, cx - 4, by - 9, cx - 4, by + 9, C.LEAF_DARK);
    drawLine(f, cx + 2, by - 9, cx + 2, by + 9, C.LEAF_DARK);

    // Desert flower bloom on crown
    fillEllipse(f, cx, by - 12, 4, 3, C.RED_BRIGHT);
    fillEllipse(f, cx, by - 13, 2, 1.5, C.YELLOW);

    // Tubular snout pointing right + fierce gold eyes
    fillRect(f, cx + 3, by - 6, 4, 3, C.YELLOW);
    setPx(f, cx + 5, by - 5, C.ORANGE);
    fillShadedEllipse(f, cx + 9 + (spitFrame === 2 ? 2 : 0), by - 1, 4, 3, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    fillRect(f, cx + 11 + (spitFrame === 2 ? 2 : 0), by - 2, 2, 3, C.NAVY_DEEP);

    // Thorny spit burst (kept inside cell padding)
    if (spitFrame >= 2) {
      const dx = (spitFrame - 1) * 3;
      drawSpike(f, cx + 10 + dx, by - 1, cx + 14 + dx, by - 1, 1.4, C.LEAF_BRIGHT, C.YELLOW);
    }

    // Spines on left back
    drawSpike(f, cx - 8, by - 5, cx - 13, by - 7, 1.2, C.BONE, C.BONE_LIGHT);
    drawSpike(f, cx - 9, by + 1, cx - 14, by + 1, 1.2, C.BONE, C.BONE_LIGHT);
    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/cactus_spitter',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 5,
        loop: true,
        frames: [
          drawSpitter({ bob: 0 }),
          drawSpitter({ bob: -1 }),
          drawSpitter({ bob: 0 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((s, i) =>
          drawSpitter({ bob: i % 2 ? -2 : 0, stride: s }),
        ),
      },
      attack: {
        fps: 15,
        loop: false,
        frames: [
          drawSpitter({ swell: 2, bob: 1 }),
          drawSpitter({ swell: 3, bob: 1 }),
          drawSpitter({ swell: 0, spitFrame: 2 }),
          drawSpitter({ swell: 0, spitFrame: 3 }),
          drawSpitter({ swell: 0, spitFrame: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawSpitter({ deadStage: d })),
      },
    },
  };
}

function buildLaserSniperMob() {
  function drawSniper({ bob = 0, stride = 0, kneel = 0, charge = 0, fire = false, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 19;
    const footY = 44;

    if (deadStage >= 0) {
      fillShadedEllipse(f, cx + 2, footY - 4, 10, 4, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.SLATE_MID });
      fillRect(f, cx + 5, footY - 6, 4, 2, C.RED_BRIGHT);
      drawThickLine(f, cx - 3, footY - 3, cx + 14, footY - 4, 0.9, C.STEEL);
      if (deadStage < 2) {
        setPx(f, cx + 4, footY - 9, C.CYAN);
        setPx(f, cx + 8, footY - 8, C.YELLOW);
      }
      return f;
    }

    drawBoots(f, cx, footY, stride, C.NAVY_DEEP, C.SLATE_MID);
    const by = footY - 14 + bob + kneel;

    // Flowing dark stealth cloak tail behind (-x)
    drawSpike(f, cx - 3, by - 4, cx - 12, by + 6, 4.5, C.NAVY_DEEP, C.SLATE_DARK);

    // Armored cyber torso
    fillShadedEllipse(f, cx, by, 6, 7, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.SLATE_MID });
    fillRect(f, cx - 2, by - 2, 5, 4, C.CYAN_MID);

    // Cyber helmet & glowing cyan sniper visor facing right
    fillShadedEllipse(f, cx + 1, by - 10, 6, 5, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL });
    fillRect(f, cx + 1, by - 11, 6, 3, charge ? C.RED_BRIGHT : C.CYAN);
    setPx(f, cx + 4, by - 10, C.BONE_LIGHT);

    // Long Rail-Sniper Rifle pointing right (safe margin for foot centering)
    const ry = by - 2;
    fillRect(f, cx - 1, ry, 14, 3, C.STEEL);
    fillRect(f, cx + 1, ry, 12, 1, C.SILVER);
    fillRect(f, cx + 3, ry - 2, 5, 2, C.CYAN_MID);
    fillRect(f, cx + 12, ry - 1, 3, 4, C.SLATE_DARK);

    // Targeting laser sight / cyan muzzle blast (padded from cell edge)
    if (charge === 1) {
      drawLine(f, cx + 15, ry + 1, cx + 19, ry + 1, C.RED_BRIGHT);
    } else if (charge >= 2) {
      drawLine(f, cx + 15, ry, cx + 20, ry, C.RED_BRIGHT);
      fillEllipse(f, cx + 15, ry + 1, 2, 2, C.YELLOW);
    }
    if (fire) {
      fillEllipse(f, cx + 16, ry + 1, 3, 3, C.CYAN);
      fillRect(f, cx + 16, ry, 6, 2, C.BONE_LIGHT);
    }
    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/laser_sniper',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 5,
        loop: true,
        frames: [
          drawSniper({ bob: 0 }),
          drawSniper({ bob: -1 }),
          drawSniper({ bob: 0 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((s, i) =>
          drawSniper({ bob: i % 2 ? -1 : 0, stride: s }),
        ),
      },
      attack: {
        fps: 12,
        loop: false,
        frames: [
          drawSniper({ kneel: 2, charge: 1 }),
          drawSniper({ kneel: 2, charge: 2 }),
          drawSniper({ kneel: 2, charge: 2 }),
          drawSniper({ kneel: 1, fire: true }),
          drawSniper({ kneel: 1 }),
          drawSniper({ kneel: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawSniper({ deadStage: d })),
      },
    },
  };
}

function buildPyroShamanMob() {
  function drawPyro({ bob = 0, stride = 0, staffRaise = 0, flameSize = 0, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 21;
    const footY = 44;

    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
      // Dropped skull mask & cinder
      fillShadedEllipse(f, cx + 6, footY - 6 + Math.min(2, deadStage), 4, 4, { dark: C.SAND, mid: C.BONE, light: C.BONE_LIGHT });
      setPx(f, cx - 2, footY - 7, C.ORANGE);
      return f;
    }

    drawBoots(f, cx, footY, stride, C.RED_DARK, C.SLATE_DARK);
    const by = footY - 14 + bob;

    // Crimson Cultist Robes
    drawSpike(f, cx, by - 7, cx, by + 13, 8, C.RED_DARK, C.RED_MID);
    fillShadedEllipse(f, cx, by + 2, 7, 8, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
    // Gold-trimmed hood collar
    fillRect(f, cx - 5, by - 4, 10, 2, C.GOLD);

    // Hood & Horned Bone Skull Mask
    const hy = by - 10;
    fillShadedEllipse(f, cx, hy, 6, 6, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
    fillShadedEllipse(f, cx + 2, hy + 1, 4, 4, { dark: C.SAND, mid: C.BONE, light: C.BONE_LIGHT });
    drawLine(f, cx - 2, hy - 3, cx - 6, hy - 8, C.BONE);
    drawLine(f, cx + 3, hy - 3, cx + 6, hy - 8, C.BONE_LIGHT);
    // Glowing orange eye slits
    setPx(f, cx + 3, hy + 1, C.ORANGE);
    setPx(f, cx + 5, hy + 1, C.YELLOW);

    // Fire Brazier Staff on right
    const sx = cx + 10 + Math.round(staffRaise * 0.4);
    const syTop = by - 13 - staffRaise;
    drawThickLine(f, sx - 2, footY - 1, sx, syTop + 2, 0.9, C.SAND_DARK);
    fillRect(f, sx - 3, syTop, 6, 3, C.GOLD);
    // Dancing Flame Orb
    const fr = 3 + flameSize;
    fillEllipse(f, sx, syTop - 3, fr, fr + 1, C.RED_BRIGHT);
    fillEllipse(f, sx, syTop - 3, Math.max(1, fr - 1), fr, C.ORANGE);
    fillEllipse(f, sx, syTop - 2, Math.max(1, fr - 2), Math.max(1, fr - 1), C.YELLOW);
    if (flameSize >= 2) {
      setPx(f, sx + 5, syTop - 5, C.ORANGE);
      setPx(f, sx + 7, syTop - 3, C.YELLOW);
    }
    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/pyro_shaman',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 6,
        loop: true,
        frames: [
          drawPyro({ bob: 0, flameSize: 0 }),
          drawPyro({ bob: -1, flameSize: 1 }),
          drawPyro({ bob: 0, flameSize: 0 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((s, i) =>
          drawPyro({ bob: i % 2 ? -1 : 0, stride: s, flameSize: i % 2 }),
        ),
      },
      attack: {
        fps: 14,
        loop: false,
        frames: [
          drawPyro({ staffRaise: 3, flameSize: 1 }),
          drawPyro({ staffRaise: 5, flameSize: 2 }),
          drawPyro({ staffRaise: 4, flameSize: 3 }),
          drawPyro({ staffRaise: 2, flameSize: 2 }),
          drawPyro({ staffRaise: 1, flameSize: 1 }),
          drawPyro({ staffRaise: 0, flameSize: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawPyro({ deadStage: d })),
      },
    },
  };
}

function buildThunderMageMob() {
  function drawMage({ bob = 0, stride = 0, staffRaise = 0, arcPhase = 0, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 21;
    const footY = 44;

    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.SLATE_DARK, mid: C.BLUE_DARK, light: C.CYAN_MID });
      drawThickLine(f, cx - 5, footY - 3, cx + 11, footY - 5, 0.9, C.STEEL_LIGHT);
      if (deadStage < 2) setPx(f, cx + 10, footY - 8, C.CYAN);
      return f;
    }

    drawBoots(f, cx, footY, stride, C.NAVY_DEEP, C.BLUE_DARK);
    const by = footY - 14 + bob;

    // Storm Cobalt Cloak
    drawSpike(f, cx, by - 7, cx, by + 13, 8, C.BLUE_DARK, C.CYAN_MID);
    fillShadedEllipse(f, cx, by + 2, 7, 8, { dark: C.SLATE_DARK, mid: C.BLUE_DARK, light: C.CYAN_MID });
    fillRect(f, cx - 4, by - 4, 8, 2, C.CYAN);

    // Pointed Mage Hat/Hood & Glowing Cyan Face Rune
    const hy = by - 10;
    fillShadedEllipse(f, cx, hy, 6, 5, { dark: C.SLATE_DARK, mid: C.BLUE_DARK, light: C.CYAN_MID });
    drawSpike(f, cx - 1, hy - 3, cx - 5, hy - 11, 3.2, C.SLATE_DARK, C.BLUE_DARK);
    fillRect(f, cx + 1, hy - 1, 5, 3, C.NAVY_DEEP);
    setPx(f, cx + 3, hy, C.CYAN);
    setPx(f, cx + 5, hy, C.BONE_LIGHT);

    // Tesla Crystal Staff
    const sx = cx + 8 + Math.round(staffRaise * 0.3);
    const syTop = by - 11 - Math.min(4, staffRaise);
    drawThickLine(f, sx - 2, footY - 1, sx, syTop + 2, 0.9, C.STEEL_LIGHT);
    fillRect(f, sx - 3, syTop, 6, 2, C.GOLD);
    fillEllipse(f, sx, syTop - 4, 3, 4, C.CYAN_MID);
    fillEllipse(f, sx, syTop - 4, 2, 3, C.CYAN);
    setPx(f, sx, syTop - 5, C.BONE_LIGHT);

    // Crackling lightning arcs when casting (padded cleanly inside 48x48)
    if (arcPhase > 0) {
      drawLine(f, sx, syTop - 6, sx + 4, syTop - 9, C.CYAN);
      drawLine(f, sx + 4, syTop - 9, sx + 7, syTop - 6, C.BONE_LIGHT);
      drawLine(f, sx + 2, syTop - 3, sx + 8, syTop - 1, arcPhase % 2 ? C.CYAN : C.BONE_LIGHT);
      if (arcPhase >= 2) {
        drawLine(f, sx + 8, syTop - 1, sx + 10, syTop - 4, C.CYAN);
      }
    }
    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/thunder_mage',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 6,
        loop: true,
        frames: [
          drawMage({ bob: 0, arcPhase: 0 }),
          drawMage({ bob: -1, arcPhase: 1 }),
          drawMage({ bob: 0, arcPhase: 0 }),
        ],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((s, i) =>
          drawMage({ bob: i % 2 ? -1 : 0, stride: s, arcPhase: i % 2 }),
        ),
      },
      attack: {
        fps: 14,
        loop: false,
        frames: [
          drawMage({ staffRaise: 3, arcPhase: 1 }),
          drawMage({ staffRaise: 6, arcPhase: 2 }),
          drawMage({ staffRaise: 5, arcPhase: 3 }),
          drawMage({ staffRaise: 3, arcPhase: 2 }),
          drawMage({ staffRaise: 1, arcPhase: 1 }),
          drawMage({ staffRaise: 0, arcPhase: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((d) => drawMage({ deadStage: d })),
      },
    },
  };
}

function makeStandardMobSpec(id, cellW, drawFn, extra = {}) {
  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: `local://generated/${id}`,
    fallback: false,
    cellW,
    cellH: cellW,
    footPadBottom: 2,
    tier: cellW,
    anims: {
      idle: {
        fps: 6,
        loop: true,
        frames: [drawFn({ bob: 0, phase: 0 }), drawFn({ bob: -1, phase: 1 }), drawFn({ bob: 0, phase: 0 })],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 1, 2, 1, -1].map((stride, i) =>
          drawFn({ bob: i % 2 ? -1 : 0, stride, phase: i % 2 }),
        ),
      },
      attack: {
        fps: 14,
        loop: false,
        frames: [0, 1, 2, 3, 2, 0].map((atk) => drawFn({ atk, phase: atk % 2 })),
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3].map((deadStage) => drawFn({ deadStage })),
      },
    },
    ...extra,
  };
}

function buildFrostMageMob() {
  return makeStandardMobSpec('frost_mage', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.SILVER });
      drawSpike(f, cx + 6, footY - 3, cx + 11, footY - 9, 2, C.CYAN_MID, C.CYAN);
      return f;
    }
    drawBoots(f, cx, footY, stride, C.BLUE_DARK, C.CYAN_MID);
    const by = footY - 14 + bob;
    drawSpike(f, cx, by - 7, cx, by + 13, 8, C.BLUE_DARK, C.CYAN);
    fillShadedEllipse(f, cx, by + 2, 7, 8, { dark: C.SLATE_DARK, mid: C.BLUE_DARK, light: C.CYAN_MID });
    fillRect(f, cx - 5, by - 2, 10, 2, C.SILVER);
    const hy = by - 10;
    fillShadedEllipse(f, cx, hy, 6, 5, { dark: C.SLATE_DARK, mid: C.CYAN_MID, light: C.SILVER });
    drawSpike(f, cx, hy - 3, cx, hy - 12, 3, C.CYAN_MID, C.BONE_LIGHT);
    setPx(f, cx + 3, hy, C.CYAN);
    const sx = cx + 9;
    const syTop = by - 10 - Math.min(4, atk);
    drawThickLine(f, sx - 2, footY - 2, sx, syTop + 2, 0.9, C.STEEL_LIGHT);
    fillEllipse(f, sx, syTop - 3, 3 + (phase ? 1 : 0), 4, C.CYAN);
    setPx(f, sx, syTop - 4, C.BONE_LIGHT);
    return f;
  });
}

function buildVenomStalkerMob() {
  return makeStandardMobSpec('venom_stalker', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.TEAL_DARK, mid: C.LEAF_DARK, light: C.LEAF_BRIGHT });
      return f;
    }
    drawBoots(f, cx, footY, stride * 1.4, C.TEAL_DARK, C.LEAF_DARK);
    const by = footY - 13 + bob;
    fillShadedEllipse(f, cx + (atk > 0 ? 3 : 0), by, 7, 7, { dark: C.TEAL_DARK, mid: C.LEAF_DARK, light: C.LEAF });
    // Toxic neon collar + hunched stealth hood
    fillShadedEllipse(f, cx + 2, by - 9, 6, 5, { dark: C.TEAL_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    setPx(f, cx + 5, by - 10, C.YELLOW);
    setPx(f, cx + 6, by - 9, C.LEAF_BRIGHT);
    // Twin venom daggers forward
    const bladeX = cx + 9 + atk * 2;
    drawThickLine(f, cx + 4, by - 1, Math.min(44, bladeX + 7), by + 1, 1.1, C.LEAF_BRIGHT);
    drawThickLine(f, cx + 2, by + 3, Math.min(44, bladeX + 5), by + 5, 1.0, C.YELLOW);
    return f;
  });
}

function buildShieldWardenMob() {
  return makeStandardMobSpec('shield_warden', 64, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(64, 64);
    const cx = 30;
    const footY = 60;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 6, 15, 6, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.GOLD });
      fillRect(f, cx + 4, footY - 10, 12, 8, C.GOLD);
      return f;
    }
    drawBoots(f, cx, footY, stride, C.NAVY_DEEP, C.SLATE_MID);
    const by = footY - 22 + bob;
    // Heavy armored juggernaut torso + shoulder pauldrons
    fillShadedEllipse(f, cx, by, 13, 14, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL_LIGHT });
    fillEllipse(f, cx - 10, by - 7, 6, 5, C.GOLD);
    fillEllipse(f, cx + 4, by - 15, 7, 6, C.SLATE_DARK);
    fillRect(f, cx + 5, by - 16, 5, 2, C.YELLOW);
    // Massive front Bastion Shield
    const sx = cx + 10 + atk;
    fillRect(f, sx, by - 12, 10, 24, C.GOLD);
    fillRect(f, sx + 2, by - 10, 6, 20, C.CYAN_MID);
    fillRect(f, sx + 4, by - 6, 2, 12, C.BONE_LIGHT);
    return f;
  });
}

function buildMortarBeetleMob() {
  return makeStandardMobSpec('mortar_beetle', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 23;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 11, 5, { dark: C.RED_DARK, mid: C.RED_MID, light: C.ORANGE });
      return f;
    }
    // 4 crawling beetle legs
    drawThickLine(f, cx - 10, footY - 7, cx - 12 + stride, footY - 1, 1.1, C.NAVY_DEEP);
    drawThickLine(f, cx - 3, footY - 6, cx - 4 - stride, footY - 1, 1.1, C.NAVY_DEEP);
    drawThickLine(f, cx + 4, footY - 6, cx + 5 + stride, footY - 1, 1.1, C.NAVY_DEEP);
    drawThickLine(f, cx + 10, footY - 7, cx + 12 - stride, footY - 1, 1.1, C.NAVY_DEEP);
    const cy = footY - 12 + bob;
    fillShadedEllipse(f, cx, cy, 12, 8, { dark: C.RED_DARK, mid: C.RED_MID, light: C.ORANGE });
    // Armored head & pincers
    fillEllipse(f, cx + 10, cy + 2, 4, 4, C.SLATE_DARK);
    setPx(f, cx + 12, cy + 1, C.YELLOW);
    // Back Siege Mortar Tube angled upward
    drawThickLine(f, cx - 2, cy - 4, cx + 6, cy - 13 - atk, 3.2, C.SLATE_MID);
    fillEllipse(f, cx + 6, cy - 13 - atk, 3, 2, atk > 0 ? C.YELLOW : C.ORANGE);
    return f;
  });
}

function buildVoidAcolyteMob() {
  return makeStandardMobSpec('void_acolyte', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.MAGENTA });
      return f;
    }
    drawBoots(f, cx, footY, stride, C.NAVY_DEEP, C.PLUM_DARK);
    const by = footY - 14 + bob;
    drawSpike(f, cx, by - 8, cx, by + 13, 8, C.PLUM_DARK, C.MAGENTA);
    fillShadedEllipse(f, cx, by + 1, 7, 8, { dark: C.NAVY_DEEP, mid: C.PLUM, light: C.MAGENTA });
    // Horned Void Crown + Mask
    const hy = by - 10;
    fillShadedEllipse(f, cx, hy, 6, 5, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.PINK });
    drawSpike(f, cx - 3, hy - 3, cx - 7, hy - 10, 2, C.MAGENTA, C.PINK);
    drawSpike(f, cx + 2, hy - 3, cx + 5, hy - 10, 2, C.MAGENTA, C.PINK);
    setPx(f, cx + 3, hy, C.PINK);
    // Levitating void singularity orb
    const ox = cx + 11;
    const oy = by - 4 - atk;
    fillEllipse(f, ox, oy, 4 + (phase ? 1 : 0), 4 + (phase ? 1 : 0), C.MAGENTA);
    fillEllipse(f, ox, oy, 2, 2, C.BONE_LIGHT);
    return f;
  });
}

function buildSawBerserkerMob() {
  return makeStandardMobSpec('saw_berserker', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 21;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.RED_DARK, mid: C.ORANGE, light: C.STEEL_LIGHT });
      return f;
    }
    drawBoots(f, cx, footY, stride * 1.3, C.NAVY_DEEP, C.SAND_DARK);
    const by = footY - 14 + bob;
    fillShadedEllipse(f, cx, by, 8, 8, { dark: C.RED_DARK, mid: C.RED_MID, light: C.ORANGE });
    fillShadedEllipse(f, cx + 1, by - 9, 6, 5, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.SILVER });
    setPx(f, cx + 4, by - 9, C.RED_BRIGHT);
    // Extended circular buzzsaw weapon
    const sawX = Math.min(40, cx + 12 + atk * 2);
    const sawY = by + 1 - Math.min(3, atk);
    drawThickLine(f, cx + 4, by + 2, sawX, sawY, 1.4, C.ORANGE);
    fillEllipse(f, sawX, sawY, 6, 6, C.SILVER);
    fillEllipse(f, sawX, sawY, 2, 2, C.RED_BRIGHT);
    if (phase) {
      setPx(f, sawX - 6, sawY, C.BONE_LIGHT);
      setPx(f, sawX + 6, sawY, C.BONE_LIGHT);
    }
    return f;
  });
}

function buildHealingPriestMob() {
  return makeStandardMobSpec('healing_priest', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.BONE });
      return f;
    }
    drawBoots(f, cx, footY, stride, C.TEAL_DARK, C.LEAF_DARK);
    const by = footY - 14 + bob;
    drawSpike(f, cx, by - 7, cx, by + 13, 8, C.LEAF_DARK, C.LEAF_BRIGHT);
    fillShadedEllipse(f, cx, by + 2, 7, 8, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.BONE });
    fillRect(f, cx - 2, by - 2, 4, 7, C.GOLD);
    const hy = by - 10;
    fillShadedEllipse(f, cx, hy, 6, 5, { dark: C.SAND_MID, mid: C.BONE, light: C.BONE_LIGHT });
    // Golden Halo ring overhead
    fillRect(f, cx - 4, hy - 8, 8, 2, C.YELLOW);
    // Holy Cross Staff
    const sx = cx + 9;
    const syTop = by - 10 - Math.min(4, atk);
    drawThickLine(f, sx - 1, footY - 2, sx, syTop + 2, 0.9, C.GOLD);
    fillRect(f, sx - 3, syTop - 2, 7, 2, C.LEAF_BRIGHT);
    fillRect(f, sx, syTop - 5, 2, 7, phase ? C.YELLOW : C.LEAF_BRIGHT);
    return f;
  });
}

function buildShockDroneMk2Mob() {
  return makeStandardMobSpec('shock_drone_mk2', 48, ({ bob = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 9, 4, { dark: C.NAVY_DEEP, mid: C.BLUE_DARK, light: C.CYAN });
      return f;
    }
    const cy = 22 + bob;
    drawSpike(f, cx - 7, cy - 4, cx - 16, cy - 8, 3, C.BLUE_DARK, C.CYAN_MID);
    drawSpike(f, cx + 7, cy - 4, cx + 16, cy - 8, 3, C.BLUE_DARK, C.CYAN_MID);
    fillShadedEllipse(f, cx, cy, 11, 8, { dark: C.NAVY_DEEP, mid: C.BLUE_DARK, light: C.CYAN_MID });
    // Twin forward Tesla Emitter prongs
    fillRect(f, cx + 9, cy - 4, 7, 2, C.SILVER);
    fillRect(f, cx + 9, cy + 2, 7, 2, C.SILVER);
    fillEllipse(f, cx + 2, cy, 5, 4, atk > 0 ? C.YELLOW : C.CYAN);
    if (atk > 0 || phase) {
      drawLine(f, cx + 15, cy - 3, cx + 17, cy + 3, C.CYAN);
    }
    fillEllipse(f, cx, cy + 10, 5, 2, C.CYAN);
    return f;
  });
}

function buildChronoMageMob() {
  return makeStandardMobSpec('chrono_mage', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.CYAN });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 7 - stride, footY - 10, 5, 10, C.PLUM_DARK);
    fillRect(f, cx + 2 + stride, footY - 10, 5, 10, C.PLUM_DARK);
    fillShadedEllipse(f, cx, by - 4, 10, 12, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.CYAN_MID });
    fillShadedEllipse(f, cx + 1, by - 16, 7, 7, { dark: C.SLATE_DARK, mid: C.PLUM, light: C.MAGENTA });
    fillEllipse(f, cx + 3, by - 16, 4, 3, atk > 0 ? C.YELLOW : C.CYAN);
    if (atk > 0 || phase) {
      fillEllipse(f, cx + 12, by - 8, 4, 4, C.CYAN);
    }
    return f;
  });
}

function buildPlasmaGolemMob() {
  return makeStandardMobSpec('plasma_golem', 64, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(64, 64);
    const cx = 32;
    const footY = 60;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 6, 18, 6, { dark: C.SLATE_DARK, mid: C.BLUE_DARK, light: C.CYAN });
      return f;
    }
    const by = footY - 18 + bob;
    fillRect(f, cx - 12 - stride, footY - 15, 9, 15, C.SLATE_DARK);
    fillRect(f, cx + 3 + stride, footY - 15, 9, 15, C.SLATE_DARK);
    fillShadedEllipse(f, cx, by - 6, 16, 16, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.BLUE_DARK });
    fillEllipse(f, cx + 2, by - 8, 6, 6, atk > 0 ? C.YELLOW : C.CYAN);
    fillShadedEllipse(f, cx - 16, by - 6, 6, 9, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.CYAN_MID });
    fillShadedEllipse(f, cx + 16, by - 6, 6, 9, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.CYAN_MID });
    fillRect(f, cx - 6, by - 25, 13, 8, C.SLATE_MID);
    fillRect(f, cx - 3, by - 22, 8, 3, C.CYAN);
    return f;
  });
}

function buildSniperMechMob() {
  return makeStandardMobSpec('sniper_mech', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 12, 4, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.RED_BRIGHT });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 7 - stride, footY - 12, 4, 12, C.SLATE_DARK);
    fillRect(f, cx + 3 + stride, footY - 12, 4, 12, C.SLATE_DARK);
    fillShadedEllipse(f, cx, by - 4, 9, 10, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.STEEL_LIGHT });
    fillRect(f, cx + 3, by - 6, 16, 4, C.SLATE_DARK);
    fillRect(f, cx + 15, by - 5, 5, 2, atk > 0 ? C.YELLOW : C.RED_BRIGHT);
    fillRect(f, cx - 3, by - 16, 8, 6, C.SLATE_MID);
    fillRect(f, cx + 1, by - 14, 4, 2, C.RED_BRIGHT);
    return f;
  });
}

function buildPlagueBearerMob() {
  return makeStandardMobSpec('plague_bearer', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 12, 5, { dark: C.TEAL_DARK, mid: C.LEAF_DARK, light: C.LEAF_BRIGHT });
      return f;
    }
    const by = footY - 13 + bob;
    fillRect(f, cx - 7 - stride, footY - 10, 5, 10, C.TEAL_DARK);
    fillRect(f, cx + 2 + stride, footY - 10, 5, 10, C.TEAL_DARK);
    fillShadedEllipse(f, cx - 4, by - 8, 8, 9, { dark: C.TEAL_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    fillShadedEllipse(f, cx + 2, by - 4, 9, 11, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    fillEllipse(f, cx + 4, by - 15, 6, 6, C.TEAL_DARK);
    fillRect(f, cx + 4, by - 16, 5, 3, atk > 0 ? C.YELLOW : C.LEAF_BRIGHT);
    return f;
  });
}

function buildCrimsonLancerMob() {
  return makeStandardMobSpec('crimson_lancer', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 22;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 12, 4, { dark: C.RED_DARK, mid: C.RED_MID, light: C.STEEL_LIGHT });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 7 - stride, footY - 11, 5, 11, C.SLATE_DARK);
    fillRect(f, cx + 2 + stride, footY - 11, 5, 11, C.SLATE_DARK);
    fillShadedEllipse(f, cx, by - 5, 9, 11, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
    fillShadedEllipse(f, cx + 1, by - 17, 6, 6, { dark: C.SLATE_DARK, mid: C.RED_MID, light: C.GOLD });
    fillRect(f, cx + 4, by - 7, 16 + atk * 2, 3, C.SILVER);
    fillRect(f, cx + 16 + atk * 2, by - 8, 5, 5, C.RED_BRIGHT);
    return f;
  });
}

function buildVoidReaperMob() {
  return makeStandardMobSpec('void_reaper', 48, ({ bob = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 11, 4, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.MAGENTA });
      return f;
    }
    const by = footY - 15 + bob;
    fillShadedEllipse(f, cx, by - 4, 10, 12, { dark: C.NAVY_DEEP, mid: C.PLUM_DARK, light: C.PLUM });
    fillShadedEllipse(f, cx + 1, by - 17, 7, 7, { dark: C.PLUM_DARK, mid: C.PLUM, light: C.MAGENTA });
    fillRect(f, cx + 2, by - 18, 4, 2, phase ? C.PINK : C.CYAN);
    drawThickLine(f, cx + 6, by - 12, cx + 16 + atk, by + 6, 2, C.MAGENTA);
    drawSpike(f, cx + 15 + atk, by - 12, cx + 6, by - 18, 4, C.PLUM, C.PINK);
    return f;
  });
}

function buildTempestBoss() {
  return makeStandardMobSpec(
    'boss_tempest',
    96,
    ({ bob = 0, atk = 0, phase = 0, deadStage = -1 }) => {
      const f = createImage(96, 96);
      const cx = 48;
      const footY = 90;
      if (deadStage >= 0) {
        fillShadedEllipse(f, cx, footY - 7, 24, 7, { dark: C.NAVY_DEEP, mid: C.BLUE_DARK, light: C.CYAN });
        return f;
      }
      const by = footY - 30 + bob;
      fillShadedEllipse(f, cx, by + 18, 22, 7, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      fillShadedEllipse(f, cx, by - 4, 22, 22, { dark: C.NAVY_DEEP, mid: C.BLUE_DARK, light: C.CYAN_MID });
      fillShadedEllipse(f, cx - 24, by - 10, 9, 14, { dark: C.SLATE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      fillShadedEllipse(f, cx + 24, by - 10, 9, 14, { dark: C.SLATE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      fillEllipse(f, cx, by - 4, 10 + atk, 10 + atk, phase ? C.YELLOW : C.CYAN);
      fillRect(f, cx - 10, by - 34, 20, 7, C.GOLD);
      drawSpike(f, cx - 8, by - 34, cx - 12, by - 44, 3, C.GOLD, C.YELLOW);
      drawSpike(f, cx + 8, by - 34, cx + 12, by - 44, 3, C.GOLD, C.YELLOW);
      return f;
    },
  );
}

function buildDestroyerBoss() {
  return makeStandardMobSpec(
    'boss_destroyer',
    96,
    ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
      const f = createImage(96, 96);
      const cx = 48;
      const footY = 92;
      if (deadStage >= 0) {
        fillShadedEllipse(f, cx, footY - 8, 28, 8, { dark: C.NAVY_DEEP, mid: C.RED_DARK, light: C.ORANGE });
        return f;
      }
      const by = footY - 28 + bob;
      fillRect(f, cx - 18 - stride, footY - 18, 13, 18, C.NAVY_DEEP);
      fillRect(f, cx + 5 + stride, footY - 18, 13, 18, C.NAVY_DEEP);
      fillShadedEllipse(f, cx, by - 6, 26, 22, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.RED_DARK });
      fillShadedEllipse(f, cx - 26, by - 14, 11, 14, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
      fillShadedEllipse(f, cx + 26, by - 14, 11, 14, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
      fillEllipse(f, cx, by - 6, 11 + atk, 11 + atk, phase ? C.YELLOW : C.RED_BRIGHT);
      fillEllipse(f, cx, by - 6, 5, 5, C.ORANGE);
      fillRect(f, cx - 13, by - 35, 26, 10, C.SLATE_MID);
      fillRect(f, cx - 9, by - 32, 18, 4, C.RED_BRIGHT);
      drawSpike(f, cx - 12, by - 35, cx - 20, by - 48, 3.5, C.GOLD, C.YELLOW);
      drawSpike(f, cx + 12, by - 35, cx + 20, by - 48, 3.5, C.GOLD, C.YELLOW);
      return f;
    },
  );
}

function buildMirrorKnightMob() {
  return makeStandardMobSpec('mirror_knight', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 11, 4, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.SILVER });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 7 - stride, footY - 11, 5, 11, C.SLATE_DARK);
    fillRect(f, cx + 2 + stride, footY - 11, 5, 11, C.SLATE_DARK);
    fillShadedEllipse(f, cx, by - 5, 9, 11, { dark: C.SLATE_MID, mid: C.STEEL_LIGHT, light: C.SILVER });
    fillRect(f, cx - 10, by - 11, 5, 12, C.CYAN);
    fillShadedEllipse(f, cx + 1, by - 17, 6, 6, { dark: C.SLATE_DARK, mid: C.STEEL, light: C.BONE_LIGHT });
    fillRect(f, cx + 2, by - 18, 4, 2, C.CYAN);
    drawThickLine(f, cx + 5, by - 4, cx + 17 + atk * 2, by - 14, 2, C.SILVER);
    return f;
  });
}

function buildMagnetDroneMob() {
  return makeStandardMobSpec('magnet_drone', 48, ({ bob = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 10, 4, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.SILVER });
      return f;
    }
    const by = footY - 22 + bob;
    fillShadedEllipse(f, cx, by, 10, 9, { dark: C.NAVY_DEEP, mid: C.BLUE_DARK, light: C.CYAN_MID });
    fillRect(f, cx - 13, by - 4, 5, 9, C.RED_MID);
    fillRect(f, cx + 8, by - 4, 5, 9, C.CYAN);
    fillEllipse(f, cx, by, 4 + atk, 4 + atk, phase ? C.YELLOW : C.CYAN);
    return f;
  });
}

function buildBlightBomberMob() {
  return makeStandardMobSpec('blight_bomber', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 12, 4, { dark: C.TEAL_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      return f;
    }
    const by = footY - 13 + bob;
    fillRect(f, cx - 7 - stride, footY - 10, 5, 10, C.TEAL_DARK);
    fillRect(f, cx + 2 + stride, footY - 10, 5, 10, C.TEAL_DARK);
    fillShadedEllipse(f, cx - 1, by - 5, 10, 10, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
    fillEllipse(f, cx + 2 + atk, by - 16, 6, 6, C.LEAF_BRIGHT);
    fillRect(f, cx + 3, by - 17, 4, 2, C.YELLOW);
    return f;
  });
}

function buildVoltStalkerMob() {
  return makeStandardMobSpec('volt_stalker', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 11, 4, { dark: C.TEAL_DARK, mid: C.CYAN_MID, light: C.YELLOW });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 8 - stride, footY - 12, 4, 12, C.SLATE_DARK);
    fillRect(f, cx + 4 + stride, footY - 12, 4, 12, C.SLATE_DARK);
    fillShadedEllipse(f, cx, by - 5, 8, 10, { dark: C.TEAL_DARK, mid: C.BLUE_DARK, light: C.CYAN });
    fillRect(f, cx + 4, by - 8, 10 + atk * 2, 3, C.YELLOW);
    fillRect(f, cx - 2, by - 17, 7, 6, C.SLATE_MID);
    fillRect(f, cx + 2, by - 15, 4, 2, C.YELLOW);
    return f;
  });
}

function buildSolarPriestMob() {
  return makeStandardMobSpec('solar_priest', 48, ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 11, 4, { dark: C.SAND_DARK, mid: C.ORANGE, light: C.YELLOW });
      return f;
    }
    const by = footY - 14 + bob;
    fillRect(f, cx - 6 - stride, footY - 10, 4, 10, C.SAND_DARK);
    fillRect(f, cx + 2 + stride, footY - 10, 4, 10, C.SAND_DARK);
    fillShadedEllipse(f, cx, by - 5, 9, 12, { dark: C.RED_DARK, mid: C.ORANGE, light: C.GOLD });
    fillEllipse(f, cx, by - 19, 6, 6, C.YELLOW);
    drawThickLine(f, cx + 8, by - 16, cx + 10 + atk, by + 4, 2, C.GOLD);
    fillEllipse(f, cx + 10 + atk, by - 17, 3, 3, phase ? C.BONE_LIGHT : C.ORANGE);
    return f;
  });
}

function buildMagmaBruteMob() {
  return makeStandardMobSpec('magma_brute', 48, ({ bob = 0, stride = 0, atk = 0, deadStage = -1 }) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 14, 5, { dark: C.RED_DARK, mid: C.RED_MID, light: C.ORANGE });
      return f;
    }
    const by = footY - 15 + bob;
    fillRect(f, cx - 10 - stride, footY - 12, 6, 12, C.NAVY_DEEP);
    fillRect(f, cx + 4 + stride, footY - 12, 6, 12, C.NAVY_DEEP);
    fillShadedEllipse(f, cx, by - 5, 13, 13, { dark: C.NAVY_DEEP, mid: C.RED_DARK, light: C.ORANGE });
    fillRect(f, cx - 5, by - 9, 10, 6, C.ORANGE);
    fillRect(f, cx + 10, by - 8 + atk, 6, 10, C.RED_BRIGHT);
    fillRect(f, cx - 5, by - 20, 10, 6, C.SLATE_DARK);
    fillRect(f, cx - 2, by - 18, 5, 2, C.YELLOW);
    return f;
  });
}

function buildFrostEmpressBoss() {
  return makeStandardMobSpec(
    'boss_frost_empress',
    96,
    ({ bob = 0, atk = 0, phase = 0, deadStage = -1 }) => {
      const f = createImage(96, 96);
      const cx = 48;
      const footY = 90;
      if (deadStage >= 0) {
        fillShadedEllipse(f, cx, footY - 8, 25, 8, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.BONE_LIGHT });
        return f;
      }
      const by = footY - 32 + bob;
      // Permafrost gown & crystal wings
      fillShadedEllipse(f, cx, by + 16, 20, 10, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      drawSpike(f, cx - 14, by - 12, cx - 38, by - 28, 6, C.CYAN_MID, C.CYAN);
      drawSpike(f, cx + 14, by - 12, cx + 38, by - 28, 6, C.CYAN_MID, C.CYAN);
      drawSpike(f, cx - 12, by + 2, cx - 34, by + 10, 5, C.BLUE_DARK, C.CYAN);
      drawSpike(f, cx + 12, by + 2, cx + 34, by + 10, 5, C.BLUE_DARK, C.CYAN);
      fillShadedEllipse(f, cx, by - 4, 18, 22, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.BONE_LIGHT });
      // Glacier crown + scepter
      fillRect(f, cx - 10, by - 36, 20, 7, C.SILVER);
      drawSpike(f, cx - 8, by - 36, cx - 10, by - 48, 3, C.CYAN, C.BONE_LIGHT);
      drawSpike(f, cx, by - 36, cx, by - 52, 3.5, C.CYAN, C.BONE_LIGHT);
      drawSpike(f, cx + 8, by - 36, cx + 10, by - 48, 3, C.CYAN, C.BONE_LIGHT);
      fillEllipse(f, cx, by - 6, 8 + atk, 8 + atk, phase ? C.BONE_LIGHT : C.CYAN);
      drawThickLine(f, cx + 18, by - 28, cx + 22 + atk, by + 18, 3, C.SILVER);
      fillEllipse(f, cx + 20 + atk, by - 30, 6, 6, C.CYAN);
      return f;
    },
  );
}

function buildAbyssalLeviathanBoss() {
  return makeStandardMobSpec(
    'boss_abyssal_leviathan',
    96,
    ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
      const f = createImage(96, 96);
      const cx = 48;
      const footY = 92;
      if (deadStage >= 0) {
        fillShadedEllipse(f, cx, footY - 8, 30, 8, { dark: C.NAVY_DEEP, mid: C.PLUM, light: C.CYAN });
        return f;
      }
      const by = footY - 30 + bob;
      // Abyssal tentacles & armored sea-void carapace
      drawThickLine(f, cx - 16, by + 8, cx - 38 - stride, footY - 4, 4, C.TEAL_DARK);
      drawThickLine(f, cx + 16, by + 8, cx + 38 + stride, footY - 4, 4, C.TEAL_DARK);
      drawThickLine(f, cx - 22, by - 6, cx - 42, by + 10 - stride, 3, C.CYAN_MID);
      drawThickLine(f, cx + 22, by - 6, cx + 42, by + 10 + stride, 3, C.CYAN_MID);
      fillShadedEllipse(f, cx, by - 6, 26, 24, { dark: C.NAVY_DEEP, mid: C.PLUM_DARK, light: C.BLUE_DARK });
      fillShadedEllipse(f, cx - 24, by - 14, 10, 14, { dark: C.TEAL_DARK, mid: C.PLUM, light: C.CYAN });
      fillShadedEllipse(f, cx + 24, by - 14, 10, 14, { dark: C.TEAL_DARK, mid: C.PLUM, light: C.CYAN });
      // Abyssal Maw + Heart Core
      fillEllipse(f, cx, by - 6, 12 + atk, 11 + atk, phase ? C.PINK : C.CYAN);
      fillEllipse(f, cx, by - 6, 6, 6, C.MAGENTA);
      fillRect(f, cx - 12, by - 36, 24, 9, C.PLUM);
      drawSpike(f, cx - 10, by - 36, cx - 18, by - 50, 3.5, C.MAGENTA, C.CYAN);
      drawSpike(f, cx + 10, by - 36, cx + 18, by - 50, 3.5, C.MAGENTA, C.CYAN);
      return f;
    },
  );
}

function buildStormHeraldBoss() {
  return makeStandardMobSpec(
    'boss_storm_herald',
    96,
    ({ bob = 0, stride = 0, atk = 0, phase = 0, deadStage = -1 }) => {
      const f = createImage(96, 96);
      const cx = 48;
      const footY = 90;
      if (deadStage >= 0) {
        fillShadedEllipse(f, cx - 8, footY - 7, 16, 7, { dark: C.ORANGE, mid: C.GOLD, light: C.YELLOW });
        fillShadedEllipse(f, cx + 8, footY - 7, 16, 7, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
        return f;
      }
      const by = footY - 30 + bob;
      // Twin floating storm ground ring + armored storm robe
      fillShadedEllipse(f, cx - 10, by + 18, 14, 6, { dark: C.ORANGE, mid: C.GOLD, light: C.YELLOW });
      fillShadedEllipse(f, cx + 10, by + 18, 14, 6, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      fillShadedEllipse(f, cx, by - 5, 22, 22, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.SLATE_MID });
      // Left Yellow Tesla Pylon & Right Blue Tempest Pylon
      const coilShift = Math.round(stride * 0.5);
      fillShadedEllipse(f, cx - 26, by - 8 + coilShift, 9, 15, { dark: C.ORANGE, mid: C.GOLD, light: C.YELLOW });
      fillShadedEllipse(f, cx + 26, by - 8 - coilShift, 9, 15, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
      // Crackling lightning conduits
      drawThickLine(f, cx - 22, by - 12 + coilShift, cx - 9, by - 6, 2, C.YELLOW);
      drawThickLine(f, cx + 22, by - 12 - coilShift, cx + 9, by - 6, 2, C.CYAN);
      if (atk > 0 || phase) {
        drawThickLine(f, cx - 26, by - 22 + coilShift, cx - 14, by - 36, 2, C.YELLOW);
        drawThickLine(f, cx + 26, by - 22 - coilShift, cx + 14, by - 36, 2, C.CYAN);
      }
      // Dual yellow & blue reactor core + storm crown
      fillEllipse(f, cx - 4, by - 6, 8 + atk, 9 + atk, C.YELLOW);
      fillEllipse(f, cx + 4, by - 6, 8 + atk, 9 + atk, C.CYAN);
      fillEllipse(f, cx, by - 6, 5, 5, C.BONE_LIGHT);
      fillRect(f, cx - 12, by - 34, 24, 7, C.SLATE_MID);
      fillRect(f, cx - 11, by - 32, 10, 3, C.YELLOW);
      fillRect(f, cx + 1, by - 32, 10, 3, C.CYAN);
      drawSpike(f, cx - 8, by - 34, cx - 14, by - 48, 3.5, C.GOLD, C.YELLOW);
      drawSpike(f, cx + 8, by - 34, cx + 14, by - 48, 3.5, C.CYAN_MID, C.CYAN);
      return f;
    },
  );
}

// ============================================================================
// 3 BOSSES + SUB-UNITS (sprites/bosses/)
// ============================================================================

function buildSandBeholderBoss() {
  // 96x96 Sand Beholder — King Cactus w/ iconic blazing ORANGE central eye + gold crown!
  function drawBeholder({
    bob = 0,
    hopY = 0,
    squashX = 0,
    eyeScale = 0,
    pupilH = 3,
    beamCharge = 0,
    enrage = false,
    stagger = false,
    volleyFlash = false,
    slamWave = 0,
    deadStage = -1,
  }) {
    const f = createImage(96, 96);
    const cx = 48;
    const footY = 92;

    if (deadStage >= 0) {
      // Split cactus halves collapsing + tumbled crown
      const sep = 4 + deadStage * 3;
      const drop = Math.min(10, deadStage * 3);
      fillShadedEllipse(f, cx - sep - 8, footY - 12 + drop / 2, 14, 10, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      fillShadedEllipse(f, cx + sep + 8, footY - 12 + drop / 2, 14, 10, { dark: C.LEAF_DARK, mid: C.LEAF, light: C.LEAF_BRIGHT });
      // Extinguished orange eye ember at center
      fillEllipse(f, cx, footY - 7 + Math.min(3, deadStage), 6, 4, C.RED_DARK);
      if (deadStage < 4) fillEllipse(f, cx, footY - 7 + Math.min(3, deadStage), 3, 2, C.ORANGE);
      // Crown fallen sideways
      fillRect(f, cx + 10 + deadStage * 2, footY - 6, 12, 4, C.GOLD);
      setPx(f, cx + 14 + deadStage * 2, footY - 5, C.RED_BRIGHT);
      return f;
    }

    if (slamWave > 0) {
      const rw = 24 + slamWave * 8;
      fillEllipse(f, cx, footY - 2, rw, 5, C.ORANGE);
      fillEllipse(f, cx, footY - 2, rw - 6, 3, C.YELLOW);
    }

    const baseDark = enrage ? C.RED_DARK : C.LEAF_DARK;
    const baseMid = enrage ? C.RED_MID : C.LEAF;
    const baseLight = enrage ? C.ORANGE : C.LEAF_BRIGHT;

    const by = footY - 30 + bob - hopY;
    const rx = 24 + squashX;
    const ry = 30 - Math.round(squashX * 0.6);

    // Side cactus arms (asymmetric saguaro silhouette, angled right)
    fillShadedEllipse(f, cx - rx - 3, by + 3, 7, 13, { dark: baseDark, mid: baseMid, light: baseLight });
    fillShadedEllipse(f, cx - rx - 5, by - 8, 6, 9, { dark: baseDark, mid: baseMid, light: baseLight });
    fillShadedEllipse(f, cx + rx + 4, by + 1, 7, 14, { dark: baseDark, mid: baseMid, light: baseLight });
    fillShadedEllipse(f, cx + rx + 6, by - 10, 6, 9, { dark: baseDark, mid: baseMid, light: baseLight });

    // Stomping root base
    fillRect(f, cx - 16, footY - 11 - hopY, 13, 11, baseDark);
    fillRect(f, cx + 3, footY - 11 - hopY, 13, 11, baseDark);

    // Massive round-oval cactus monolith body
    fillShadedEllipse(f, cx, by, rx, ry, { dark: baseDark, mid: baseMid, light: baseLight, rim: C.YELLOW });

    // Vertical cactus ribs
    for (const rOff of [-14, -6, 6, 14]) {
      drawLine(f, cx + rOff, by - ry + 6, cx + rOff, by + ry - 5, baseDark);
    }

    // Ivory desert cactus spines jutting around circumference
    const spinePairs = [
      [cx - rx + 2, by - 16, cx - rx - 8, by - 21],
      [cx + rx - 2, by - 16, cx + rx + 8, by - 21],
      [cx - rx - 4, by - 1, cx - rx - 13, by - 1],
      [cx + rx + 5, by - 1, cx + rx + 14, by - 1],
      [cx - 14, by + 12, cx - 22, by + 15],
      [cx + 15, by + 12, cx + 23, by + 15],
    ];
    for (const [x0, y0, x1, y1] of spinePairs) {
      drawSpike(f, x0, y0, x1, y1, volleyFlash ? 2.2 : 1.6, C.BONE, C.BONE_LIGHT);
    }

    // Royal 3-prong Gold Crown on top (slightly floating when roaring!)
    const crownY = by - ry - 4 - (enrage ? 2 : 0);
    fillRect(f, cx - 12, crownY, 24, 6, C.GOLD);
    fillRect(f, cx - 11, crownY + 4, 22, 2, C.ORANGE);
    drawSpike(f, cx - 10, crownY, cx - 13, crownY - 9, 2.5, C.GOLD, C.YELLOW);
    drawSpike(f, cx, crownY, cx, crownY - 12, 3, C.GOLD, C.YELLOW);
    drawSpike(f, cx + 10, crownY, cx + 13, crownY - 9, 2.5, C.GOLD, C.YELLOW);
    // Center crown ruby gem
    fillEllipse(f, cx, crownY + 2, 2.5, 2.5, C.RED_BRIGHT);
    setPx(f, cx - 1, crownY + 1, C.YELLOW);

    // ICONIC GLOWING ORANGE BEHOLDER EYE (slightly facing right for nativeFacing='right')
    const ex = cx + 3;
    const ey = by - 5 + (stagger ? 3 : 0);
    const erx = 12 + eyeScale;
    const ery = stagger ? 6 : 11 + eyeScale;
    // Deep crimson/burnt-orange orbital socket rim
    fillEllipse(f, ex, ey, erx + 2, ery + 2, C.RED_DARK);
    fillEllipse(f, ex, ey, erx, ery, C.RED_MID);
    // Blazing vibrant orange iris (#f77622 -> #feae34 -> #fee761)
    fillEllipse(f, ex, ey, Math.max(4, erx - 2), Math.max(3, ery - 2), C.ORANGE);
    fillEllipse(f, ex, ey, Math.max(3, erx - 5), Math.max(2, ery - 4), C.GOLD);
    fillEllipse(f, ex, ey, Math.max(2, erx - 7), Math.max(2, ery - 6), C.YELLOW);
    // Fierce dark vertical Beholder slit pupil + hot glint
    if (!stagger) {
      fillRect(f, ex, ey - pupilH, 3, pupilH * 2 + 1, C.NAVY_DEEP);
      fillEllipse(f, ex - 4, ey - 4, 2, 2, C.BONE_LIGHT);
    } else {
      drawLine(f, ex - 5, ey, ex + 5, ey, C.NAVY_DEEP);
      setPx(f, ex - 6, ey - 10, C.YELLOW);
      setPx(f, ex + 7, ey - 11, C.YELLOW);
    }

    // Converging heat-beam flare on beam_windup
    if (beamCharge > 0) {
      const r = 4 + beamCharge * 2;
      fillEllipse(f, ex + 4, ey, r, r, C.YELLOW);
      fillEllipse(f, ex + 4, ey, Math.max(2, r - 2), Math.max(2, r - 2), C.BONE_LIGHT);
      drawLine(f, ex + 6, ey, ex + 26, ey - 8 + beamCharge * 2, C.ORANGE);
      drawLine(f, ex + 6, ey, ex + 26, ey + 8 - beamCharge * 2, C.GOLD);
    }

    // Cactus grin / rocky teeth ridge below eye
    fillRect(f, cx - 5, by + 13, 14, 4, baseDark);
    for (let tx = -3; tx <= 7; tx += 3) {
      setPx(f, cx + tx, by + 14, enrage ? C.YELLOW : C.BONE);
    }

    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/boss_beholder',
    fallback: false,
    cellW: 96,
    cellH: 96,
    footPadBottom: 2,
    tier: 96,
    anims: {
      idle: {
        fps: 6,
        loop: true,
        frames: [
          drawBeholder({ bob: 0, eyeScale: 0 }),
          drawBeholder({ bob: -1, eyeScale: 1 }),
          drawBeholder({ bob: -2, eyeScale: 1 }),
          drawBeholder({ bob: -1, eyeScale: 0 }),
        ],
      },
      move: {
        fps: 8,
        loop: true,
        frames: [
          drawBeholder({ bob: 0, squashX: 2 }),
          drawBeholder({ hopY: 5, squashX: -1 }),
          drawBeholder({ hopY: 7, squashX: -2 }),
          drawBeholder({ hopY: 3, squashX: 0 }),
          drawBeholder({ bob: 1, squashX: 3 }),
          drawBeholder({ bob: 0, squashX: 1 }),
        ],
      },
      volley_cast: {
        fps: 10,
        loop: false,
        frames: [
          drawBeholder({ squashX: 2, eyeScale: 1 }),
          drawBeholder({ squashX: -2, eyeScale: 2, volleyFlash: true }),
          drawBeholder({ squashX: -1, eyeScale: 2, volleyFlash: true, pupilH: 2 }),
          drawBeholder({ squashX: 1, eyeScale: 1 }),
          drawBeholder({ squashX: 0, eyeScale: 0 }),
        ],
      },
      slam_leap: {
        fps: 8,
        loop: false,
        frames: [
          drawBeholder({ squashX: 4, bob: 3 }),
          drawBeholder({ hopY: 16, squashX: -3 }),
          drawBeholder({ hopY: 20, squashX: -3, eyeScale: 1 }),
          drawBeholder({ hopY: 0, squashX: 5, slamWave: 1 }),
          drawBeholder({ hopY: 0, squashX: 3, slamWave: 2 }),
          drawBeholder({ hopY: 0, squashX: 0 }),
        ],
      },
      beam_windup: {
        fps: 6,
        loop: false,
        frames: [
          drawBeholder({ eyeScale: 1, beamCharge: 1 }),
          drawBeholder({ eyeScale: 2, beamCharge: 2 }),
          drawBeholder({ eyeScale: 2, beamCharge: 3, pupilH: 2 }),
          drawBeholder({ eyeScale: 3, beamCharge: 4, pupilH: 1 }),
        ],
      },
      enrage_roar: {
        fps: 8,
        loop: false,
        frames: [
          drawBeholder({ squashX: 3, bob: 2 }),
          drawBeholder({ enrage: true, eyeScale: 2, squashX: -2, hopY: 4 }),
          drawBeholder({ enrage: true, eyeScale: 3, squashX: -1, hopY: 3, volleyFlash: true }),
          drawBeholder({ enrage: true, eyeScale: 2, hopY: 1 }),
          drawBeholder({ enrage: true, eyeScale: 1 }),
        ],
      },
      stagger: {
        fps: 5,
        loop: false,
        frames: [
          drawBeholder({ stagger: true, squashX: 3, bob: 4 }),
          drawBeholder({ stagger: true, squashX: 2, bob: 5 }),
          drawBeholder({ stagger: true, squashX: 1, bob: 3 }),
        ],
      },
      dead: {
        fps: 6,
        loop: false,
        frames: [0, 1, 2, 3, 4, 5].map((d) => drawBeholder({ deadStage: d })),
      },
    },
  };
}

function buildDreadColossusBoss() {
  // 96x96 Crimson Dread Knight Juggernaut + Iron Aegis Shield Drone
  function drawColossus({ bob = 0, stride = 0, slashStage = -1, overheat = false, deadStage = -1 }) {
    const f = createImage(96, 96);
    const cx = 44;
    const footY = 92;

    if (deadStage >= 0) {
      // Shattered crimson pauldrons + broken greatsword
      fillShadedEllipse(f, cx, footY - 8, 22, 7, { dark: C.SLATE_DARK, mid: C.RED_DARK, light: C.RED_MID });
      fillShadedEllipse(f, cx - 10, footY - 12 + Math.min(4, deadStage * 2), 10, 6, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
      drawThickLine(f, cx + 6, footY - 5, cx + 28, footY - 10 + Math.min(4, deadStage * 2), 1.8, C.STEEL);
      return f;
    }

    const by = footY - 26 + bob + (overheat ? 6 : 0);

    // Heavy armored greaves
    fillRect(f, cx - 14 - stride, footY - 18, 11, 18, C.SLATE_DARK);
    fillRect(f, cx - 13 - stride, footY - 17, 5, 16, C.STEEL);
    fillRect(f, cx + 4 + stride, footY - 18, 11, 18, C.SLATE_DARK);
    fillRect(f, cx + 5 + stride, footY - 17, 5, 16, C.STEEL);
    // Knee spikes
    fillRect(f, cx - 10 - stride, footY - 13, 5, 4, C.RED_MID);
    fillRect(f, cx + 7 + stride, footY - 13, 5, 4, C.RED_MID);

    // Tattered crimson warcape streaming left (-x)
    drawSpike(f, cx - 8, by - 14, cx - 28, by + 18, 10, C.RED_DARK, C.RED_MID);

    // Towering Armored Dread Torso
    fillShadedEllipse(f, cx, by - 4, 18, 18, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.STEEL });
    // Glowing molten core chestplate emblem
    fillEllipse(f, cx + 3, by - 6, 7, 7, overheat ? C.ORANGE : C.RED_MID);
    fillEllipse(f, cx + 4, by - 6, 3.5, 3.5, overheat ? C.YELLOW : C.RED_BRIGHT);

    // Massive Spiked Crimson Pauldrons
    fillShadedEllipse(f, cx - 17, by - 14, 10, 9, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
    drawSpike(f, cx - 22, by - 18, cx - 29, by - 27, 2.5, C.SILVER, C.BONE_LIGHT);
    fillShadedEllipse(f, cx + 17, by - 14, 10, 9, { dark: C.RED_DARK, mid: C.RED_MID, light: C.RED_BRIGHT });
    drawSpike(f, cx + 22, by - 18, cx + 29, by - 27, 2.5, C.SILVER, C.BONE_LIGHT);

    // Horned Obsidian Dread Helm + Glowing Crimson Visor
    const hy = by - 26;
    fillShadedEllipse(f, cx + 1, hy, 10, 10, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL_LIGHT });
    drawSpike(f, cx - 6, hy - 5, cx - 15, hy - 18, 3, C.GOLD, C.YELLOW);
    drawSpike(f, cx + 8, hy - 5, cx + 17, hy - 18, 3, C.GOLD, C.YELLOW);
    fillRect(f, cx, hy - 2, 10, 4, C.NAVY_DEEP);
    fillRect(f, cx + 2, hy - 1, 7, 2, overheat ? C.YELLOW : C.RED_BRIGHT);

    if (overheat) {
      // Steam vents smoking on overheat stun
      fillEllipse(f, cx - 10, hy - 10, 4, 3, C.SILVER);
      fillEllipse(f, cx + 12, hy - 12, 4, 3, C.BONE_LIGHT);
    }

    // Molten Greatsword (right hand) + Tower Shield (left side)
    if (slashStage < 0) {
      drawThickLine(f, cx + 18, by - 4, cx + 27, by - 28, 2.4, C.STEEL_LIGHT);
      drawThickLine(f, cx + 19, by - 6, cx + 26, by - 26, 1.0, C.ORANGE);
      fillRect(f, cx + 13, by - 5, 11, 3, C.GOLD);
    } else if (slashStage === 0) {
      drawThickLine(f, cx + 10, by - 18, cx - 5, by - 36, 2.5, C.STEEL_LIGHT);
    } else {
      drawThickLine(f, cx + 16, by - 2, cx + 31, by + 5, 2.5, C.BONE_LIGHT);
      drawThickLine(f, cx + 18, by - 2, cx + 29, by + 4, 1.2, C.ORANGE);
      drawArcSlash(f, cx + 9, by - 4, 15, 25, -1.1, 0.85, C.RED_BRIGHT, C.ORANGE, C.YELLOW);
    }

    // Left forearm Iron Shield
    fillRoundedRect(f, cx - 22, by - 8, 10, 18, 3, C.SLATE_MID);
    fillRect(f, cx - 20, by - 5, 6, 12, C.RED_MID);
    fillRect(f, cx - 18, by - 2, 3, 6, C.GOLD);

    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/boss_colossus',
    fallback: false,
    cellW: 96,
    cellH: 96,
    footPadBottom: 2,
    tier: 96,
    anims: {
      idle: {
        fps: 6,
        loop: true,
        frames: [
          drawColossus({ bob: 0 }),
          drawColossus({ bob: -2 }),
          drawColossus({ bob: 0 }),
        ],
      },
      run: {
        fps: 10,
        loop: true,
        frames: [-4, -2, 2, 4, 2, -2].map((s, i) =>
          drawColossus({ bob: i % 2 ? -2 : 0, stride: s }),
        ),
      },
      attack: {
        fps: 12,
        loop: false,
        frames: [
          drawColossus({ slashStage: 0, bob: -2 }),
          drawColossus({ slashStage: 1, bob: 2 }),
          drawColossus({ slashStage: 2, bob: 1 }),
          drawColossus({ slashStage: -1, bob: 0 }),
        ],
      },
      overheat_stun: {
        fps: 10,
        loop: true,
        frames: [
          drawColossus({ overheat: true, bob: 0 }),
          drawColossus({ overheat: true, bob: 2 }),
        ],
      },
      dead: {
        fps: 8,
        loop: false,
        frames: [0, 1, 2].map((d) => drawColossus({ deadStage: d })),
      },
    },
  };
}

function buildIronDroneMob() {
  // 48x48 orbiting Iron Aegis Shield Drone
  function drawDrone({ bob = 0, pulse = 0, attack = false, deadStage = -1 }) {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;

    if (deadStage >= 0) {
      fillShadedEllipse(f, cx, footY - 4, 8, 4, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.STEEL });
      setPx(f, cx + 4, footY - 7, C.RED_BRIGHT);
      return f;
    }

    const cy = 24 + bob;
    // Armored wing fins
    drawSpike(f, cx - 7, cy - 3, cx - 15, cy - 7, 3, C.SLATE_DARK, C.STEEL);
    drawSpike(f, cx + 7, cy - 3, cx + 15, cy - 7, 3, C.SLATE_DARK, C.STEEL);
    // Gunmetal octagonal core hull
    fillShadedEllipse(f, cx, cy, 10, 9, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL_LIGHT });
    // Glowing Shield Emitter / Crimson Charge Core
    fillEllipse(f, cx + 2, cy, 5 + pulse, 5 + pulse, attack ? C.RED_BRIGHT : C.CYAN_MID);
    fillEllipse(f, cx + 2, cy, 3, 3, attack ? C.YELLOW : C.CYAN);
    setPx(f, cx + 1, cy - 1, C.BONE_LIGHT);
    // Hover jet glow underneath
    fillEllipse(f, cx, cy + 10, 4, 2 + (pulse ? 1 : 0), C.CYAN);
    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/iron_drone',
    fallback: false,
    cellW: 48,
    cellH: 48,
    footPadBottom: 2,
    tier: 48,
    anims: {
      idle: {
        fps: 8,
        loop: true,
        frames: [drawDrone({ bob: 0, pulse: 0 }), drawDrone({ bob: -2, pulse: 1 }), drawDrone({ bob: -1, pulse: 0 })],
      },
      run: {
        fps: 12,
        loop: true,
        frames: [-2, -1, 0, 1, 0, -1].map((b, i) => drawDrone({ bob: b, pulse: i % 2 })),
      },
      attack: {
        fps: 12,
        loop: false,
        frames: [
          drawDrone({ bob: 0, attack: true, pulse: 1 }),
          drawDrone({ bob: -1, attack: true, pulse: 2 }),
          drawDrone({ bob: 0, attack: true, pulse: 1 }),
          drawDrone({ bob: 0, attack: false, pulse: 0 }),
        ],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2].map((d) => drawDrone({ deadStage: d })),
      },
    },
  };
}

function buildOverlordBoss() {
  // 96x96 Armored Cyber Gunship Core + weakpoint + emp_pylon
  function drawOverlord({ hover = 0, charge = 0, stun = false, deadStage = -1 }) {
    const f = createImage(96, 96);
    const cx = 48;
    const footY = 92;

    if (deadStage >= 0) {
      const split = deadStage * 3;
      fillShadedEllipse(f, cx - 10 - split, footY - 12, 16, 8, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.STEEL });
      fillShadedEllipse(f, cx + 10 + split, footY - 12, 16, 8, { dark: C.NAVY_DEEP, mid: C.SLATE_DARK, light: C.STEEL });
      if (deadStage < 5) {
        fillEllipse(f, cx, footY - 14, 10 - deadStage, 8 - deadStage, C.ORANGE);
        fillEllipse(f, cx, footY - 14, 6 - deadStage, 5 - Math.min(4, deadStage), C.YELLOW);
      }
      return f;
    }

    const cy = 46 + hover;
    // Dual Wing Missile/Gatling Weapon Pods
    fillRoundedRect(f, cx - 38, cy - 10, 16, 22, 4, C.SLATE_DARK);
    fillRoundedRect(f, cx - 36, cy - 8, 12, 18, 3, C.SLATE_MID);
    fillRect(f, cx - 34, cy + 10, 8, 6, charge ? C.ORANGE : C.STEEL);

    fillRoundedRect(f, cx + 22, cy - 10, 16, 22, 4, C.SLATE_DARK);
    fillRoundedRect(f, cx + 24, cy - 8, 12, 18, 3, C.SLATE_MID);
    fillRect(f, cx + 26, cy + 10, 8, 6, charge ? C.ORANGE : C.STEEL);

    // Armored Wing Bridges + Cyan Conduit Stripes
    fillRect(f, cx - 24, cy - 6, 48, 12, C.SLATE_DARK);
    fillRect(f, cx - 22, cy - 2, 44, 4, stun ? C.ORANGE : C.CYAN_MID);

    // Twin Under-Thruster Flames
    fillEllipse(f, cx - 16, cy + 25, 6, 4 + (charge ? 3 : 0), C.CYAN);
    fillEllipse(f, cx + 16, cy + 25, 6, 4 + (charge ? 3 : 0), C.CYAN);
    fillEllipse(f, cx - 16, cy + 24, 3, 2, C.BONE_LIGHT);
    fillEllipse(f, cx + 16, cy + 24, 3, 2, C.BONE_LIGHT);

    // Massive Central Octagonal Gunship Reactor Core
    fillShadedEllipse(f, cx, cy, 24, 24, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL_LIGHT });
    // Inner glowing energy ring
    fillEllipse(f, cx, cy, 16, 16, C.SLATE_DARK);
    fillEllipse(f, cx, cy, 13, 13, stun ? C.ORANGE : charge ? C.CYAN : C.CYAN_MID);

    // Terrifying Central AI Optic (Magenta/Red -> Yellow when charging)
    const coreCol = stun ? C.RED_BRIGHT : charge ? C.YELLOW : C.MAGENTA;
    fillEllipse(f, cx + 2, cy, 9, 9, C.RED_DARK);
    fillEllipse(f, cx + 2, cy, 7, 7, coreCol);
    fillEllipse(f, cx + 3, cy, 4, 4, charge ? C.BONE_LIGHT : C.PINK);
    setPx(f, cx + 1, cy - 2, C.BONE_LIGHT);

    // Lightning stun arcs when exposed
    if (stun) {
      drawLine(f, cx - 18, cy - 12, cx - 8, cy - 2, C.CYAN);
      drawLine(f, cx + 10, cy + 6, cx + 22, cy + 14, C.YELLOW);
    }

    return f;
  }

  return {
    sourceId: 'generated_synth',
    license: 'CC0-1.0',
    url: 'local://generated/boss_overlord',
    fallback: false,
    cellW: 96,
    cellH: 96,
    footPadBottom: 2,
    tier: 96,
    anims: {
      idle: {
        fps: 8,
        loop: true,
        frames: [
          drawOverlord({ hover: 0 }),
          drawOverlord({ hover: -2 }),
          drawOverlord({ hover: -3 }),
          drawOverlord({ hover: -1 }),
        ],
      },
      charge: {
        fps: 12,
        loop: true,
        frames: [
          drawOverlord({ hover: -1, charge: 1 }),
          drawOverlord({ hover: -3, charge: 2 }),
          drawOverlord({ hover: -2, charge: 2 }),
          drawOverlord({ hover: 0, charge: 1 }),
        ],
      },
      stun: {
        fps: 10,
        loop: true,
        frames: [drawOverlord({ hover: 4, stun: true }), drawOverlord({ hover: 6, stun: true })],
      },
      dead: {
        fps: 10,
        loop: false,
        frames: [0, 1, 2, 3, 4, 5].map((d) => drawOverlord({ deadStage: d })),
      },
    },
  };
}

function buildOverlordSubUnits() {
  // overlord_weakpoint (32x32, 3f, center) + emp_pylon (48x48, 4f, feet)
  const wpFrames = [0, 1, 2].map((phase) => {
    const f = createImage(32, 32);
    fillShadedEllipse(f, 16, 16, 10, 10, { dark: C.SLATE_DARK, mid: C.SLATE_MID, light: C.STEEL_LIGHT });
    fillEllipse(f, 16, 16, 6 + (phase % 2), 6 + (phase % 2), phase === 1 ? C.PINK : C.MAGENTA);
    fillEllipse(f, 16, 16, 3, 3, C.YELLOW);
    setPx(f, 14, 14, C.BONE_LIGHT);
    return f;
  });

  const pylonFrames = [0, 1, 2, 3].map((phase) => {
    const f = createImage(48, 48);
    const cx = 24;
    const footY = 44;
    // Steel tripod base
    fillRoundedRect(f, cx - 10, footY - 8, 20, 8, 2, C.SLATE_DARK);
    fillRect(f, cx - 8, footY - 7, 16, 3, C.STEEL);
    // Copper/Titanium Tesla Coil Shaft
    fillRect(f, cx - 4, footY - 30, 8, 22, C.SLATE_MID);
    for (const ry of [footY - 26, footY - 20, footY - 14]) {
      fillRect(f, cx - 7, ry, 14, 3, C.GOLD);
      fillRect(f, cx - 6, ry, 12, 1, C.YELLOW);
    }
    // Top Cyan Discharge Dome + Crackling Arc
    fillShadedEllipse(f, cx, footY - 33, 7, 5, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
    setPx(f, cx - 2, footY - 35, C.BONE_LIGHT);
    const ox = (phase % 2 === 0 ? 1 : -1) * 8;
    drawLine(f, cx, footY - 36, cx + ox, footY - 40, C.CYAN);
    drawLine(f, cx + ox, footY - 40, cx + ox * 1.4, footY - 35, C.BONE_LIGHT);
    return f;
  });

  return { wpFrames, pylonFrames };
}

// ============================================================================
// BIOME TILES, OBSTACLES, PROPS, BARRELS, DECOR, PICKUPS & PEDESTALS
// ============================================================================

function makeSeamless48TileFromSample(srcImg, overlayFn) {
  // Nearest-neighbor tile/scale up cleanly to 48x48
  const base = createImage(48, 48);
  const scale = srcImg.width <= 16 ? 3 : srcImg.width <= 24 ? 2 : 1;
  const tiled = scale > 1 ? scaleImage(srcImg, scale) : resizeImage(srcImg, 48, 48);
  blitImage(base, tiled, 0, 0);
  if (overlayFn) overlayFn(base);
  return base;
}

function buildBiomeTiles(oss) {
  const rng = mulberry32(0xba509e13);
  const out = [];

  // --- DESERT (100% opaque warm pixel-art sandstone / desert sand) ---
  const DESERT_BASE = '#e0bf84';
  const DESERT_MID = '#d2ad6e';
  const DESERT_SHADOW = '#c2995a';
  const DESERT_LIGHT = '#e8cca0';

  const desertFloor = createImage(48, 48, rgba(DESERT_BASE));
  // Subtle horizontal wind-carved sand ripples + sandstone flagstone hairline cracks
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const wave = ((x + y * 2) % 16 === 0 && (x >> 2) % 3 !== 1);
      if (wave) setPx(desertFloor, x, y, DESERT_MID);
      const r = rng();
      if (r < 0.055) setPx(desertFloor, x, y, DESERT_MID);
      else if (r > 0.965) setPx(desertFloor, x, y, DESERT_LIGHT);
    }
  }
  // Seamless sandstone slab joints & bevel highlights
  drawLine(desertFloor, 0, 23, 47, 23, DESERT_MID);
  drawLine(desertFloor, 4, 23, 18, 23, DESERT_SHADOW);
  drawLine(desertFloor, 26, 23, 42, 23, DESERT_SHADOW);
  drawLine(desertFloor, 4, 24, 18, 24, DESERT_LIGHT);
  drawLine(desertFloor, 26, 24, 42, 24, DESERT_LIGHT);
  drawLine(desertFloor, 23, 0, 23, 22, DESERT_MID);
  drawLine(desertFloor, 23, 5, 23, 17, DESERT_SHADOW);
  drawLine(desertFloor, 24, 5, 24, 17, DESERT_LIGHT);
  drawLine(desertFloor, 11, 25, 11, 45, DESERT_MID);
  drawLine(desertFloor, 35, 25, 35, 45, DESERT_MID);
  // Deterministic desert pebbles (highlight + shadow pair)
  for (const [px, py] of [[9, 10], [34, 8], [16, 36], [40, 34], [28, 16]]) {
    fillRect(desertFloor, px, py, 2, 1, DESERT_LIGHT);
    fillRect(desertFloor, px + 1, py + 1, 2, 1, DESERT_SHADOW);
  }
  out.push({
    id: 'tile_desert_floor',
    frames: [desertFloor],
    lutStrength: 0,
    sourceId: 'generated_synth',
    url: 'local://generated/tile_desert_floor',
    fallback: false,
  });

  const desertWall = createImage(48, 48, rgba(C.SAND_MID));
  if (oss.raw.kenney_desert_wall) {
    blitImage(desertWall, makeSeamless48TileFromSample(oss.raw.kenney_desert_wall), 0, 0);
  }
  // Enforce crisp top rim highlight + front adobe masonry courses
  fillRect(desertWall, 0, 0, 48, 12, C.SAND_LIGHT);
  fillRect(desertWall, 0, 12, 48, 2, C.SAND_DARK);
  fillRect(desertWall, 0, 14, 48, 24, C.SAND_MID);
  fillRect(desertWall, 0, 38, 48, 10, C.SAND_DARK);
  for (let row = 0; row < 2; row++) {
    const yy = 14 + row * 12;
    drawLine(desertWall, 0, yy + 11, 47, yy + 11, C.SAND_DARK);
    for (let bx = row * 12; bx < 48; bx += 24) {
      drawLine(desertWall, bx, yy, bx, yy + 11, C.SAND_DARK);
    }
  }
  out.push({
    id: 'tile_desert_wall',
    aliases: ['wall_desert'],
    frames: [desertWall],
    sourceId: oss.raw.kenney_desert_wall ? 'kenney_desert_shooter' : 'generated_synth',
    url: RAW_OSS_FILES.kenney_desert_wall.url,
    fallback: !oss.raw.kenney_desert_wall,
  });

  // 100% opaque desert border trim matching sandstone palette
  const desertTrim = cloneImage(desertFloor);
  fillRect(desertTrim, 2, 2, 44, 44, DESERT_LIGHT);
  fillRect(desertTrim, 4, 4, 40, 40, DESERT_MID);
  fillRect(desertTrim, 6, 6, 36, 36, DESERT_BASE);
  drawLine(desertTrim, 2, 2, 45, 2, DESERT_LIGHT);
  drawLine(desertTrim, 2, 2, 2, 45, DESERT_LIGHT);
  drawLine(desertTrim, 2, 45, 45, 45, DESERT_SHADOW);
  drawLine(desertTrim, 45, 2, 45, 45, DESERT_SHADOW);
  fillRect(desertTrim, 12, 14, 2, 1, DESERT_LIGHT);
  fillRect(desertTrim, 31, 29, 2, 1, DESERT_SHADOW);
  out.push({
    id: 'tile_desert_trim',
    frames: [desertTrim],
    lutStrength: 0,
    sourceId: 'generated_synth',
    url: 'local://generated/tile_desert_trim',
    fallback: false,
  });

  // --- CRYPT (100% opaque basalt dungeon flagstones with crisp #181425 mortar seams) ---
  const cryptFloor = createImage(48, 48, rgba(C.SLATE_DARK));
  // Subtle dark slate texture variation
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const r = rng();
      if (r < 0.08) setPx(cryptFloor, x, y, C.SLATE_MID);
    }
  }
  // Crisp mortar grid (staggered basalt flagstones)
  drawLine(cryptFloor, 0, 0, 47, 0, C.NAVY_DEEP);
  drawLine(cryptFloor, 0, 24, 47, 24, C.NAVY_DEEP);
  drawLine(cryptFloor, 0, 0, 0, 23, C.NAVY_DEEP);
  drawLine(cryptFloor, 24, 0, 24, 23, C.NAVY_DEEP);
  drawLine(cryptFloor, 12, 25, 12, 47, C.NAVY_DEEP);
  drawLine(cryptFloor, 36, 25, 36, 47, C.NAVY_DEEP);
  // Top-left stone bevel highlights & corner stone chips
  drawLine(cryptFloor, 1, 1, 22, 1, C.SLATE_MID);
  drawLine(cryptFloor, 1, 2, 1, 22, C.SLATE_MID);
  drawLine(cryptFloor, 25, 1, 46, 1, C.SLATE_MID);
  drawLine(cryptFloor, 25, 2, 25, 22, C.SLATE_MID);
  drawLine(cryptFloor, 13, 25, 34, 25, C.SLATE_MID);
  drawLine(cryptFloor, 13, 26, 13, 46, C.SLATE_MID);
  fillRect(cryptFloor, 6, 7, 10, 8, C.SLATE_MID);
  fillRect(cryptFloor, 29, 31, 6, 8, C.SLATE_MID);
  // Fine weathered crack + steel glint
  drawLine(cryptFloor, 31, 9, 35, 13, C.NAVY_DEEP);
  setPx(cryptFloor, 4, 4, C.STEEL);
  setPx(cryptFloor, 28, 28, C.STEEL);
  out.push({
    id: 'tile_crypt_floor',
    frames: [cryptFloor],
    lutStrength: 1.0,
    sourceId: 'generated_synth',
    url: 'local://generated/tile_crypt_floor',
    fallback: false,
  });

  const cryptWall = createImage(48, 48, rgba(C.SLATE_DARK));
  fillRect(cryptWall, 0, 0, 48, 12, C.SLATE_MID);
  fillRect(cryptWall, 0, 12, 48, 2, C.NAVY_DEEP);
  fillRect(cryptWall, 0, 14, 48, 24, C.SLATE_DARK);
  fillRect(cryptWall, 0, 38, 48, 10, C.NAVY_DEEP);
  // Crimson bloodline mortar accent
  fillRect(cryptWall, 0, 25, 48, 2, C.RED_DARK);
  drawLine(cryptWall, 16, 14, 16, 25, C.NAVY_DEEP);
  drawLine(cryptWall, 36, 27, 36, 38, C.NAVY_DEEP);
  out.push({
    id: 'tile_crypt_wall',
    aliases: ['wall_crypt'],
    frames: [cryptWall],
    sourceId: oss.raw.kenney_dungeon_wall ? 'kenney_tiny_dungeon' : 'generated_synth',
    url: RAW_OSS_FILES.kenney_dungeon_wall.url,
    fallback: !oss.raw.kenney_dungeon_wall,
  });

  const cryptTrim = createImage(48, 48, rgba(C.RED_DARK));
  fillRect(cryptTrim, 4, 0, 40, 48, C.RED_MID);
  fillRect(cryptTrim, 6, 0, 2, 48, C.GOLD);
  fillRect(cryptTrim, 40, 0, 2, 48, C.GOLD);
  fillRect(cryptTrim, 20, 18, 8, 12, C.RED_DARK);
  out.push({
    id: 'tile_crypt_trim',
    frames: [cryptTrim],
    sourceId: 'generated_synth',
    url: 'local://generated/tile_crypt_trim',
    fallback: false,
  });

  // --- CYBER (100% opaque dark steel deck grating + crisp #181425 seams) ---
  let cyberFloor;
  if (oss.scifiTileset && oss.scifiTileset[9]) {
    cyberFloor = remapNonTransparent(
      makeSeamless48TileFromSample(oss.scifiTileset[9]),
      (r, g, b) => {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum < 40 ? C.NAVY_DEEP : lum < 85 ? C.SLATE_DARK : lum < 125 ? C.SLATE_MID : C.STEEL;
      },
    );
  } else {
    cyberFloor = createImage(48, 48, rgba(C.SLATE_DARK));
  }
  // Enforce crisp opaque steel deck plate seams, grating & rivets
  drawLine(cyberFloor, 0, 0, 47, 0, C.NAVY_DEEP);
  drawLine(cyberFloor, 0, 0, 0, 47, C.NAVY_DEEP);
  drawLine(cyberFloor, 1, 1, 46, 1, C.SLATE_MID);
  drawLine(cyberFloor, 1, 1, 1, 46, C.SLATE_MID);
  for (let y = 14; y <= 32; y += 6) {
    fillRect(cyberFloor, 11, y, 26, 2, C.NAVY_DEEP);
    drawLine(cyberFloor, 11, y + 2, 36, y + 2, C.SLATE_MID);
  }
  fillRect(cyberFloor, 4, 4, 2, 2, C.STEEL);
  fillRect(cyberFloor, 42, 4, 2, 2, C.STEEL);
  fillRect(cyberFloor, 4, 42, 2, 2, C.STEEL);
  fillRect(cyberFloor, 42, 42, 2, 2, C.STEEL);
  setPx(cyberFloor, 44, 4, C.CYAN_MID);
  out.push({
    id: 'tile_cyber_floor',
    frames: [cyberFloor],
    lutStrength: 1.0,
    sourceId: oss.scifiTileset ? 'oga_scifi_tiles' : 'generated_synth',
    url: OSS_SOURCES.scifiTilesZip.url,
    fallback: !oss.scifiTileset,
  });

  const cyberWall = createImage(48, 48, rgba(C.SLATE_DARK));
  fillRect(cyberWall, 0, 0, 48, 12, C.STEEL);
  fillRect(cyberWall, 0, 12, 48, 2, C.NAVY_DEEP);
  fillRect(cyberWall, 0, 22, 48, 4, C.CYAN_MID);
  fillRect(cyberWall, 8, 23, 32, 2, C.CYAN);
  fillRect(cyberWall, 0, 38, 48, 10, C.NAVY_DEEP);
  out.push({
    id: 'tile_cyber_wall',
    aliases: ['wall_cyber'],
    frames: [cyberWall],
    sourceId: oss.raw.kenney_scifi_floor ? 'kenney_rts_scifi' : 'generated_synth',
    url: RAW_OSS_FILES.kenney_scifi_floor.url,
    fallback: !oss.raw.kenney_scifi_floor,
  });

  const cyberTrim = cloneImage(cyberFloor);
  for (let x = 0; x < 48; x++) {
    for (let y = 0; y < 10; y++) {
      setPx(cyberTrim, x, y, ((x + y) >> 3) % 2 === 0 ? C.GOLD : C.NAVY_DEEP);
    }
  }
  fillRect(cyberTrim, 0, 10, 48, 2, C.NAVY_DEEP);
  out.push({
    id: 'tile_cyber_trim',
    frames: [cyberTrim],
    lutStrength: 1.0,
    sourceId: 'generated_synth',
    url: 'local://generated/tile_cyber_trim',
    fallback: false,
  });

  return out;
}

function buildPropsAndPickups(oss) {
  const entries = [];

  // 1. prop_cactus (48x64, 2f: intact CC0 western/cactus-1 + chopped bleeding stump)
  {
    let c0;
    const hasOss = Boolean(oss.raw.sp_cactus);
    if (hasOss) {
      c0 = createImage(48, 64);
      const fit = fitToBoxKeepAspect(oss.raw.sp_cactus, 42, 58);
      stripDarkOutline(fit, { lumaMax: 42 });
      blitImage(c0, fit, Math.round((48 - fit.width) / 2), 62 - fit.height);
    } else {
      c0 = createImage(48, 64);
      fillRoundedRect(c0, 19, 10, 10, 50, 4, C.LEAF);
      fillRoundedRect(c0, 11, 22, 8, 18, 3, C.LEAF);
      fillRoundedRect(c0, 29, 18, 8, 16, 3, C.LEAF);
      fillRect(c0, 21, 12, 3, 46, C.LEAF_BRIGHT);
    }
    const c1 = createImage(48, 64);
    fillRoundedRect(c1, 18, 48, 12, 13, 3, C.LEAF_DARK);
    fillEllipse(c1, 24, 49, 6, 3, C.LEAF_BRIGHT);
    fillEllipse(c1, 24, 49, 3, 2, C.YELLOW);
    entries.push({
      id: 'prop_cactus',
      aliases: ['cactus'],
      dir: TILES_DIR,
      frames: [c0, c1],
      cellW: 48,
      cellH: 64,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_cactus.url,
      fallback: !hasOss,
    });
  }

  // 2. prop_rock (48x48, 1f: sandstone boulder from superpowers western rock-1)
  {
    const f = createImage(48, 48);
    const hasOss = Boolean(oss.raw.sp_rock);
    if (hasOss) {
      const fit = fitToBoxKeepAspect(oss.raw.sp_rock, 38, 38);
      stripDarkOutline(fit, { lumaMax: 45 });
      blitImage(f, fit, Math.round((48 - fit.width) / 2), 45 - fit.height);
    } else {
      fillShadedEllipse(f, 24, 30, 16, 13, { dark: C.SAND_DARK, mid: C.SAND_MID, light: C.SAND_LIGHT });
    }
    entries.push({
      id: 'prop_rock',
      aliases: ['rock'],
      dir: TILES_DIR,
      frames: [f],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_rock.url,
      fallback: !hasOss,
    });
  }

  // 3. prop_pillar (48x48, 1f: carved stone ruin pillar)
  {
    const f = createImage(48, 48);
    fillRoundedRect(f, 11, 36, 26, 8, 2, C.STEEL);
    fillRect(f, 14, 12, 20, 25, C.STEEL_LIGHT);
    fillRect(f, 14, 12, 6, 25, C.SILVER);
    fillRect(f, 28, 12, 6, 25, C.SLATE_MID);
    fillRoundedRect(f, 10, 6, 28, 8, 2, C.SILVER);
    drawLine(f, 18, 18, 24, 24, C.SLATE_DARK);
    entries.push({
      id: 'prop_pillar',
      aliases: ['pillar'],
      dir: TILES_DIR,
      frames: [f],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: 'generated_synth',
      url: 'local://generated/prop_pillar',
      fallback: false,
    });
  }

  // 4. prop_tomb (48x48, 1f: dark crypt sarcophagus/tombstone)
  {
    const f = createImage(48, 48);
    const hasOss = Boolean(oss.raw.sp_grave);
    if (hasOss) {
      const fit = fitToBoxKeepAspect(oss.raw.sp_grave, 36, 38);
      stripDarkOutline(fit, { lumaMax: 45 });
      const darked = remapNonTransparent(fit, (r, g, b) => {
        const l = (r + g + b) / 3;
        return l < 85 ? C.SLATE_DARK : l < 150 ? C.STEEL : C.STEEL_LIGHT;
      });
      blitImage(f, darked, Math.round((48 - darked.width) / 2), 45 - darked.height);
    } else {
      fillRoundedRect(f, 12, 10, 24, 34, 6, C.SLATE_MID);
      fillRect(f, 15, 13, 18, 28, C.STEEL);
    }
    // Glowing crimson crypt cross rune
    fillRect(f, 23, 20, 2, 12, C.RED_BRIGHT);
    fillRect(f, 19, 23, 10, 2, C.RED_BRIGHT);
    entries.push({
      id: 'prop_tomb',
      aliases: ['tomb'],
      dir: TILES_DIR,
      frames: [f],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_grave.url,
      fallback: !hasOss,
    });
  }

  // 5. prop_server (48x48, 1f: dark cyber server rack w/ neon LEDs)
  {
    const f = createImage(48, 48);
    const hasOss = Boolean(oss.raw.kenney_scifi_server);
    fillRoundedRect(f, 10, 6, 28, 39, 3, C.SLATE_DARK);
    fillRect(f, 13, 9, 22, 32, C.NAVY_DEEP);
    for (let y = 12; y <= 32; y += 7) {
      fillRect(f, 15, y, 18, 5, C.SLATE_MID);
      setPx(f, 17, y + 2, C.CYAN);
      setPx(f, 19, y + 2, C.CYAN);
      setPx(f, 30, y + 2, y === 19 ? C.RED_BRIGHT : C.LEAF_BRIGHT);
    }
    entries.push({
      id: 'prop_server',
      aliases: ['server'],
      dir: TILES_DIR,
      frames: [f],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'kenney_rts_scifi' : 'generated_synth',
      url: hasOss ? RAW_OSS_FILES.kenney_scifi_server.url : 'local://generated/prop_server',
      fallback: false,
    });
  }

  // 6. prop_barrel_red (48x48, 2f: CC0 explosive-barrel + primed flash frame)
  {
    const hasOss = Boolean(oss.raw.sp_barrel_exp);
    const makeBarrel = (prime) => {
      const f = createImage(48, 48);
      if (hasOss) {
        const fit = fitToBoxKeepAspect(oss.raw.sp_barrel_exp, 32, 36);
        stripDarkOutline(fit, { lumaMax: 45 });
        const recolored = remapNonTransparent(fit, (r, g, b) => {
          const l = (r + g + b) / 3;
          if (l > 195) return prime ? C.YELLOW : C.GOLD;
          if (l > 115) return prime ? C.ORANGE : C.RED_BRIGHT;
          return C.RED_MID;
        });
        blitImage(f, recolored, Math.round((48 - recolored.width) / 2), 45 - recolored.height);
      } else {
        fillRoundedRect(f, 13, 12, 22, 32, 5, prime ? C.ORANGE : C.RED_MID);
        fillRect(f, 13, 21, 22, 4, prime ? C.YELLOW : C.GOLD);
        fillRect(f, 18, 16, 12, 12, C.RED_BRIGHT);
        fillEllipse(f, 24, 24, 4, 4, prime ? C.BONE_LIGHT : C.YELLOW);
      }
      return f;
    };
    entries.push({
      id: 'prop_barrel_red',
      aliases: ['barrel_red'],
      dir: TILES_DIR,
      frames: [makeBarrel(false), makeBarrel(true)],
      cellW: 48,
      cellH: 48,
      fps: 6,
      loop: true,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_barrel_exp.url,
      fallback: !hasOss,
    });
  }

  // 7. prop_barrel_emp (48x48, 2f: cyan shock canister)
  {
    const makeEmpBarrel = (spark) => {
      const f = createImage(48, 48);
      fillRoundedRect(f, 13, 12, 22, 32, 5, C.BLUE_DARK);
      fillRect(f, 16, 14, 16, 28, C.CYAN_MID);
      fillRect(f, 13, 18, 22, 3, C.STEEL_LIGHT);
      fillRect(f, 13, 33, 22, 3, C.STEEL_LIGHT);
      // Lightning emblem
      drawLine(f, 25, 20, 21, 26, spark ? C.BONE_LIGHT : C.CYAN);
      drawLine(f, 21, 26, 26, 26, spark ? C.BONE_LIGHT : C.CYAN);
      drawLine(f, 26, 26, 22, 32, spark ? C.BONE_LIGHT : C.CYAN);
      if (spark) {
        drawLine(f, 11, 22, 14, 18, C.CYAN);
        drawLine(f, 34, 28, 38, 24, C.CYAN);
      }
      return f;
    };
    entries.push({
      id: 'prop_barrel_emp',
      aliases: ['barrel_emp'],
      dir: TILES_DIR,
      frames: [makeEmpBarrel(false), makeEmpBarrel(true)],
      cellW: 48,
      cellH: 48,
      fps: 6,
      loop: true,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: 'generated_synth',
      url: 'local://generated/prop_barrel_emp',
      fallback: false,
    });
  }

  // 8. prop_wood_crate (48x48, 3f: intact / cracked / broken planks using CC0 western crate-2)
  {
    const hasOss = Boolean(oss.raw.sp_crate);
    const c0 = createImage(48, 48);
    if (hasOss) {
      const fit = fitToBoxKeepAspect(oss.raw.sp_crate, 34, 38);
      stripDarkOutline(fit, { lumaMax: 45 });
      blitImage(c0, fit, Math.round((48 - fit.width) / 2), 45 - fit.height);
    } else {
      fillRoundedRect(c0, 10, 12, 28, 31, 2, C.SAND_MID);
      fillRect(c0, 13, 15, 22, 25, C.SAND);
      drawLine(c0, 13, 15, 34, 39, C.SAND_DARK);
      drawLine(c0, 34, 15, 13, 39, C.SAND_DARK);
    }
    const c1 = cloneImage(c0);
    drawLine(c1, 20, 14, 26, 28, C.NAVY_DEEP);
    drawLine(c1, 26, 28, 23, 38, C.NAVY_DEEP);
    const c2 = createImage(48, 48);
    fillRect(c2, 11, 35, 14, 4, C.SAND_MID);
    fillRect(c2, 23, 38, 15, 4, C.SAND_DARK);
    fillRect(c2, 17, 30, 6, 7, C.SAND);
    entries.push({
      id: 'prop_wood_crate',
      aliases: ['crate'],
      dir: TILES_DIR,
      frames: [c0, c1, c2],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_crate.url,
      fallback: !hasOss,
    });
  }

  // 9. prop_iron_crate (48x48, 3f: riveted gunmetal bunker crate)
  {
    const makeIron = (dmg) => {
      const f = createImage(48, 48);
      if (dmg === 2) {
        fillRect(f, 12, 35, 13, 6, C.SLATE_MID);
        fillRect(f, 24, 37, 13, 5, C.SLATE_DARK);
        fillRect(f, 19, 32, 6, 4, C.CYAN_MID);
        return f;
      }
      fillRoundedRect(f, 9, 12, 30, 32, 3, C.SLATE_DARK);
      fillRect(f, 12, 15, 24, 26, C.STEEL);
      fillRect(f, 14, 17, 20, 22, C.STEEL_LIGHT);
      fillRect(f, 21, 25, 6, 4, C.CYAN);
      for (const [rx, ry] of [[11, 14], [35, 14], [11, 40], [35, 40]]) {
        setPx(f, rx, ry, C.SILVER);
      }
      if (dmg === 1) {
        drawLine(f, 18, 16, 27, 28, C.NAVY_DEEP);
        drawLine(f, 27, 28, 24, 37, C.NAVY_DEEP);
      }
      return f;
    };
    entries.push({
      id: 'prop_iron_crate',
      dir: TILES_DIR,
      frames: [makeIron(0), makeIron(1), makeIron(2)],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: 'generated_synth',
      url: 'local://generated/prop_iron_crate',
      fallback: false,
    });
  }

  // 10. prop_clay_pot (48x48, 3f: CC0 western jar-1 terracotta pot intact/cracked/shards)
  {
    const hasOss = Boolean(oss.raw.sp_jar);
    const p0 = createImage(48, 48);
    if (hasOss) {
      const scaled = scaleImage(oss.raw.sp_jar, 2);
      const fit = fitToBoxKeepAspect(scaled, 34, 34);
      stripDarkOutline(fit, { lumaMax: 45 });
      blitImage(p0, fit, Math.round((48 - fit.width) / 2), 45 - fit.height);
    } else {
      fillShadedEllipse(p0, 24, 32, 11, 12, { dark: C.SAND_DARK, mid: C.ORANGE, light: C.SAND });
      fillRect(p0, 19, 17, 10, 5, C.SAND_MID);
      fillRect(p0, 17, 15, 14, 3, C.SAND_LIGHT);
    }
    const p1 = cloneImage(p0);
    drawLine(p1, 22, 22, 26, 32, C.NAVY_DEEP);
    drawLine(p1, 26, 32, 24, 38, C.NAVY_DEEP);
    const p2 = createImage(48, 48);
    fillEllipse(p2, 17, 39, 5, 3, C.SAND_MID);
    fillEllipse(p2, 27, 40, 6, 3, C.ORANGE);
    fillRect(p2, 21, 35, 5, 4, C.SAND);
    entries.push({
      id: 'prop_clay_pot',
      aliases: ['urn'],
      dir: TILES_DIR,
      frames: [p0, p1, p2],
      cellW: 48,
      cellH: 48,
      fps: 1,
      loop: false,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: hasOss ? 'superpowers_asset_packs' : 'generated_synth',
      url: RAW_OSS_FILES.sp_jar.url,
      fallback: !hasOss,
    });
  }

  // 11. prop_pedestal (48x48, 2f: shrine altar plinth dormant + glowing perk aura)
  {
    const makePedestal = (active) => {
      const f = createImage(48, 48);
      fillRoundedRect(f, 8, 36, 32, 8, 2, C.SLATE_MID);
      fillRect(f, 13, 21, 22, 16, C.STEEL);
      fillRect(f, 15, 22, 6, 14, C.STEEL_LIGHT);
      fillRoundedRect(f, 9, 15, 30, 7, 2, C.SILVER);
      fillRect(f, 17, 25, 14, 5, active ? C.CYAN : C.BLUE_DARK);
      if (active) {
        fillEllipse(f, 24, 11, 6, 6, C.GOLD);
        fillEllipse(f, 24, 11, 3, 3, C.YELLOW);
        setPx(f, 15, 9, C.CYAN);
        setPx(f, 33, 10, C.CYAN);
      }
      return f;
    };
    entries.push({
      id: 'prop_pedestal',
      aliases: ['pedestal'],
      dir: TILES_DIR,
      frames: [makePedestal(false), makePedestal(true)],
      cellW: 48,
      cellH: 48,
      fps: 4,
      loop: true,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: 'generated_synth',
      url: 'local://generated/prop_pedestal',
      fallback: false,
    });
  }

  // 12. crypt_brazier (48x48, 4f animated cauldron brazier)
  {
    const braziers = [0, 1, 2, 3].map((p) => {
      const f = createImage(48, 48);
      fillRect(f, 17, 38, 14, 6, C.SLATE_DARK);
      fillShadedEllipse(f, 24, 29, 11, 8, { dark: C.NAVY_DEEP, mid: C.SLATE_MID, light: C.STEEL });
      fillRect(f, 13, 24, 22, 4, C.GOLD);
      const sway = (p % 2 === 0 ? 1 : -1) * (p >= 2 ? 2 : 1);
      fillEllipse(f, 24 + sway, 17, 7, 7 + (p % 2), C.RED_BRIGHT);
      fillEllipse(f, 24, 18, 5, 6, C.ORANGE);
      fillEllipse(f, 24 - Math.round(sway * 0.5), 19, 3, 4, C.YELLOW);
      return f;
    });
    entries.push({
      id: 'crypt_brazier',
      dir: TILES_DIR,
      frames: braziers,
      cellW: 48,
      cellH: 48,
      fps: 8,
      loop: true,
      category: 'prop',
      tier: 48,
      pivotMode: 'feet',
      sourceId: 'generated_synth',
      url: 'local://generated/crypt_brazier',
      fallback: false,
    });
  }

  // 13. Floor Decor Props (32x32, non-blocking atmosphere)
  {
    const mkDecor = (id, frames, fps = 4, loop = true) => {
      entries.push({
        id,
        dir: TILES_DIR,
        frames,
        cellW: 32,
        cellH: 32,
        fps,
        loop,
        category: 'prop',
        tier: 32,
        pivotMode: 'center',
        sourceId: 'generated_synth',
        url: `local://generated/${id}`,
        fallback: false,
      });
    };

    const skull = createImage(32, 32);
    fillShadedEllipse(skull, 16, 15, 7, 6, { dark: C.SAND, mid: C.BONE, light: C.BONE_LIGHT });
    fillRect(skull, 12, 19, 8, 4, C.BONE);
    fillRect(skull, 13, 14, 2, 3, C.NAVY_DEEP);
    fillRect(skull, 18, 14, 2, 3, C.NAVY_DEEP);
    mkDecor('decor_skull', [skull], 1, false);

    const pebble = createImage(32, 32);
    fillShadedEllipse(pebble, 14, 18, 5, 4, { dark: C.SAND_DARK, mid: C.SAND_MID, light: C.SAND_LIGHT });
    fillShadedEllipse(pebble, 21, 15, 3, 2.5, { dark: C.SAND_DARK, mid: C.SAND_MID, light: C.SAND });
    mkDecor('decor_pebble', [pebble], 1, false);

    const scrub = createImage(32, 32);
    drawSpike(scrub, 16, 23, 8, 12, 2.5, C.LEAF_DARK, C.LEAF);
    drawSpike(scrub, 16, 23, 16, 9, 2.5, C.LEAF, C.LEAF_BRIGHT);
    drawSpike(scrub, 16, 23, 24, 13, 2.5, C.LEAF_DARK, C.LEAF);
    mkDecor('decor_scrub', [scrub], 1, false);

    const candles = [0, 1, 2].map((p) => {
      const f = createImage(32, 32);
      fillRect(f, 13, 16, 6, 10, C.BONE);
      fillRect(f, 14, 16, 2, 10, C.BONE_LIGHT);
      fillEllipse(f, 16 + (p - 1), 12, 2, 3, C.ORANGE);
      setPx(f, 16, 13, C.YELLOW);
      return f;
    });
    mkDecor('decor_candle', candles, 7, true);

    const bone = createImage(32, 32);
    drawThickLine(bone, 9, 20, 23, 13, 1.5, C.BONE);
    fillEllipse(bone, 9, 19, 2.2, 2.2, C.BONE_LIGHT);
    fillEllipse(bone, 10, 22, 2.2, 2.2, C.BONE);
    fillEllipse(bone, 22, 12, 2.2, 2.2, C.BONE_LIGHT);
    fillEllipse(bone, 24, 14, 2.2, 2.2, C.BONE);
    mkDecor('decor_bone', [bone], 1, false);

    const vents = [0, 1].map((p) => {
      const f = createImage(32, 32);
      fillRoundedRect(f, 8, 9, 16, 14, 2, C.STEEL);
      fillRect(f, 10, 12, 12, 2, C.NAVY_DEEP);
      fillRect(f, 10, 16, 12, 2, C.NAVY_DEEP);
      fillRect(f, 10, 20, 12, 2, C.NAVY_DEEP);
      if (p === 1) {
        fillEllipse(f, 15, 7, 3, 2, C.SILVER);
        fillEllipse(f, 19, 6, 2, 2, C.BONE_LIGHT);
      }
      return f;
    });
    mkDecor('decor_vent', vents, 4, true);

    const cable = createImage(32, 32);
    drawThickLine(cable, 6, 18, 14, 14, 1.5, C.SLATE_MID);
    drawThickLine(cable, 14, 14, 21, 20, 1.5, C.CYAN_MID);
    drawThickLine(cable, 21, 20, 26, 16, 1.5, C.CYAN);
    mkDecor('decor_cable', [cable], 1, false);
  }

  // 14. 7 Animated Pickups (32x32, centered, powered by CC0 spritepilot_pickups!)
  const prepPickupFrames = (frames, tintFn = null) =>
    frames.map((raw) => {
      const c = cloneImage(raw);
      stripDarkOutline(c, { lumaMax: 42 });
      const fit = fitToBoxKeepAspect(c, 24, 24);
      const out = createImage(32, 32);
      blitImage(out, fit, Math.round((32 - fit.width) / 2), Math.round((32 - fit.height) / 2));
      return tintFn ? remapNonTransparent(out, tintFn) : out;
    });

  // pk_hp_orb (heart-32px_strip5)
  {
    const has = Boolean(oss.pickups.heart);
    const frames = has
      ? prepPickupFrames(oss.pickups.heart)
      : [0, 1, 2, 1].map((bob) => {
          const f = createImage(32, 32);
          fillEllipse(f, 16, 16 - bob, 8, 8, C.RED_BRIGHT);
          fillEllipse(f, 14, 14 - bob, 3, 3, C.PINK);
          return f;
        });
    entries.push({
      id: 'pk_hp_orb',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 8,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: has ? 'spritepilot_pickups' : 'generated_synth',
      url: OSS_SOURCES.pickupsZip.url,
      fallback: !has,
    });
  }

  // pk_hp_pack (crimson-white field medkit bobbing 4f)
  {
    const frames = [0, -1, -2, -1].map((bob) => {
      const f = createImage(32, 32);
      fillRoundedRect(f, 8, 9 + bob, 16, 14, 3, C.BONE_LIGHT);
      fillRect(f, 13, 6 + bob, 6, 3, C.STEEL);
      fillRect(f, 14, 11 + bob, 4, 10, C.RED_BRIGHT);
      fillRect(f, 11, 14 + bob, 10, 4, C.RED_BRIGHT);
      return f;
    });
    entries.push({
      id: 'pk_hp_pack',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 6,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: 'generated_synth',
      url: 'local://generated/pk_hp_pack',
      fallback: false,
    });
  }

  // pk_energy_orb (lightning-32px_strip8 recolored to radiant cyan energy)
  {
    const has = Boolean(oss.pickups.lightning);
    const frames = has
      ? prepPickupFrames(oss.pickups.lightning, (r, g, b) => {
          const l = (r + g + b) / 3;
          return l > 205 ? C.BONE_LIGHT : l > 140 ? C.CYAN : C.CYAN_MID;
        })
      : [0, 1, 2, 1].map((bob) => {
          const f = createImage(32, 32);
          fillEllipse(f, 16, 16 - bob, 8, 8, C.CYAN_MID);
          fillEllipse(f, 15, 15 - bob, 5, 5, C.CYAN);
          setPx(f, 14, 13 - bob, C.BONE_LIGHT);
          return f;
        });
    entries.push({
      id: 'pk_energy_orb',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 10,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: has ? 'spritepilot_pickups' : 'generated_synth',
      url: OSS_SOURCES.pickupsZip.url,
      fallback: !has,
    });
  }

  // pk_energy_cell (bobbing cyan plasma battery cell 4f)
  {
    const frames = [0, -1, -2, -1].map((bob) => {
      const f = createImage(32, 32);
      fillRoundedRect(f, 11, 8 + bob, 10, 17, 3, C.SLATE_MID);
      fillRect(f, 13, 6 + bob, 6, 3, C.GOLD);
      fillRect(f, 13, 11 + bob, 6, 11, C.CYAN_MID);
      fillRect(f, 14, 12 + bob, 3, 9, C.CYAN);
      setPx(f, 14, 13 + bob, C.BONE_LIGHT);
      return f;
    });
    entries.push({
      id: 'pk_energy_cell',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 6,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: 'generated_synth',
      url: 'local://generated/pk_energy_cell',
      fallback: false,
    });
  }

  // pk_armor_plate (shield-32px_strip8)
  {
    const has = Boolean(oss.pickups.shield);
    const frames = has
      ? prepPickupFrames(oss.pickups.shield)
      : [0, 1, 2, 1].map((bob) => {
          const f = createImage(32, 32);
          fillRoundedRect(f, 10, 9 + bob, 12, 14, 4, C.STEEL_LIGHT);
          fillRect(f, 13, 11 + bob, 6, 8, C.CYAN);
          return f;
        });
    entries.push({
      id: 'pk_armor_plate',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 8,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: has ? 'spritepilot_pickups' : 'generated_synth',
      url: OSS_SOURCES.pickupsZip.url,
      fallback: !has,
    });
  }

  // pk_coin (coin-32px_strip8)
  {
    const has = Boolean(oss.pickups.coin);
    const frames = has
      ? prepPickupFrames(oss.pickups.coin)
      : [8, 6, 3, 6].map((rx) => {
          const f = createImage(32, 32);
          fillShadedEllipse(f, 16, 16, rx, 9, { dark: C.ORANGE, mid: C.GOLD, light: C.YELLOW });
          return f;
        });
    entries.push({
      id: 'pk_coin',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 10,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: has ? 'spritepilot_pickups' : 'generated_synth',
      url: OSS_SOURCES.pickupsZip.url,
      fallback: !has,
    });
  }

  // pk_gem_coin (gem-32px_strip8)
  {
    const has = Boolean(oss.pickups.gem);
    const frames = has
      ? prepPickupFrames(oss.pickups.gem)
      : [8, 6, 3, 6].map((rx) => {
          const f = createImage(32, 32);
          fillShadedEllipse(f, 16, 16, rx, 9, { dark: C.BLUE_DARK, mid: C.CYAN_MID, light: C.CYAN });
          return f;
        });
    entries.push({
      id: 'pk_gem_coin',
      dir: TILES_DIR,
      frames,
      cellW: 32,
      cellH: 32,
      fps: 10,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'center',
      sourceId: has ? 'spritepilot_pickups' : 'generated_synth',
      url: OSS_SOURCES.pickupsZip.url,
      fallback: !has,
    });
  }

  // pk_xp_orb (16x16, 4f, offX=-8, offY=-14, fps=8: animated emerald-cyan XP crystal)
  {
    const LIME = '#a7f070';
    const ICE = '#9cf9ff';
    const xpFrames = [0, 1, 2, 3].map((phase) => {
      const f = createImage(16, 16);
      const halfW = phase === 1 || phase === 2 ? 4 : 3;
      const topY = phase === 2 ? 2 : 3;
      const botY = 13;
      const midY = Math.round((topY + botY) / 2);
      const cx = 8;

      // Faceted hexagonal crystal diamond (width 7..9px inside [3..13], zero edge clip)
      for (let py = topY; py <= botY; py++) {
        const span =
          py <= midY
            ? ((py - topY + 0.5) / Math.max(1, midY - topY)) * halfW
            : ((botY - py + 0.5) / Math.max(1, botY - midY)) * halfW;
        const rx = Math.max(0, Math.round(span));
        for (let px = cx - rx; px <= cx + rx; px++) {
          const upper = py <= midY;
          const left = px < cx;
          const onCore = Math.abs(px - cx) <= 1 && py >= topY + 2 && py <= botY - 2;
          let col;
          if (onCore) {
            col = phase === 2 ? C.BONE_LIGHT : phase === 1 ? ICE : C.CYAN;
          } else if (upper && left) {
            col = phase === 3 ? ICE : LIME;
          } else if (upper && !left) {
            col = phase === 0 ? C.CYAN : C.LEAF_BRIGHT;
          } else if (!upper && left) {
            col = C.LEAF;
          } else {
            col = C.BLUE_DARK;
          }
          setPx(f, px, py, col);
        }
      }

      // Crisp specular prism highlight & animated corner twinkle
      setPx(f, cx - 1, topY + 2, C.BONE_LIGHT);
      setPx(f, cx, topY + 1, phase % 2 === 0 ? C.BONE_LIGHT : ICE);
      if (phase === 0) setPx(f, cx + 4, topY + 2, ICE);
      else if (phase === 1) setPx(f, cx - 5, midY - 1, C.CYAN);
      else if (phase === 2) {
        setPx(f, cx + 5, midY - 1, C.BONE_LIGHT);
        setPx(f, cx - 5, midY + 1, LIME);
      } else {
        setPx(f, cx - 4, topY + 2, C.CYAN);
      }
      return f;
    });

    entries.push({
      id: 'pk_xp_orb',
      dir: TILES_DIR,
      frames: xpFrames,
      cellW: 16,
      cellH: 16,
      fps: 8,
      loop: true,
      category: 'pickup',
      tier: 32,
      pivotMode: 'feet',
      footPadBottom: 2,
      sourceId: 'generated_synth',
      url: 'local://generated/pk_xp_orb',
      fallback: false,
    });
  }

  return entries;
}

// ============================================================================
// Main Orchestrator
// ============================================================================

async function main() {
  const startMs = Date.now();
  await Promise.all([
    fs.mkdir(MOBS_DIR, { recursive: true }),
    fs.mkdir(BOSSES_DIR, { recursive: true }),
    fs.mkdir(TILES_DIR, { recursive: true }),
  ]);

  if (ARGS.has('--only-boss-storm')) {
    const spec = buildStormHeraldBoss();
    const added = [];
    for (const [stateName, anim] of Object.entries(spec.anims)) {
      const entry = await emitStrip({
        id: `boss_storm_herald_${stateName}`,
        dir: BOSSES_DIR,
        rawFrames: anim.frames,
        cellW: spec.cellW,
        cellH: spec.cellH,
        fps: anim.fps,
        loop: anim.loop,
        category: 'boss',
        tier: spec.tier,
        pivotMode: 'feet',
        outlineMode: '4conn',
        stripExistingOutline: true,
        lockFirstFrameFoot: true,
        footPadBottom: spec.footPadBottom ?? 2,
        lutStrength: 1.0,
        sourceId: spec.sourceId,
        license: spec.license,
        url: spec.url,
        fallback: spec.fallback,
      });
      added.push(entry);
    }
    const existingMeta = JSON.parse(await fs.readFile(META_PATH, 'utf8'));
    for (const e of added) {
      existingMeta.sprites[e.id] = e;
    }
    existingMeta.summary.totalSprites = Object.keys(existingMeta.sprites).length;
    existingMeta.summary.bosses = Object.values(existingMeta.sprites).filter((e) => e.category === 'boss').length;
    await fs.writeFile(META_PATH, JSON.stringify(existingMeta, null, 2) + '\n', 'utf8');
    console.log(`[w13] Added ${added.length} boss_storm_herald strips -> ${META_PATH}`);
    return;
  }

  console.log(`[w13] Loading OSS CC0 packs (${OFFLINE_MODE ? 'offline fallback' : 'live fetch + temp cache'})...`);
  const oss = await loadOssAssets();
  const okCount = oss.fetchLog.filter((l) => l.ok).length;
  console.log(`[w13] OSS fetch status: ${okCount}/${oss.fetchLog.length} sources ready.`);

  const manifestEntries = [];

  // 1. Emit 16 Regular Mobs
  const mobs = [
    ['scarab', buildScarabMob(oss)],
    ['skirmisher', buildSkirmisherMob(oss)],
    ['bomb_goblin', buildBombGoblinMob()],
    ['cactus_brute', buildCactusBruteMob()],
    ['cactus_spitter', buildCactusSpitterMob()],
    ['laser_sniper', buildLaserSniperMob()],
    ['pyro_shaman', buildPyroShamanMob()],
    ['thunder_mage', buildThunderMageMob()],
    ['frost_mage', buildFrostMageMob()],
    ['venom_stalker', buildVenomStalkerMob()],
    ['shield_warden', buildShieldWardenMob()],
    ['mortar_beetle', buildMortarBeetleMob()],
    ['void_acolyte', buildVoidAcolyteMob()],
    ['saw_berserker', buildSawBerserkerMob()],
    ['healing_priest', buildHealingPriestMob()],
    ['shock_drone_mk2', buildShockDroneMk2Mob()],
    ['chrono_mage', buildChronoMageMob()],
    ['plasma_golem', buildPlasmaGolemMob()],
    ['sniper_mech', buildSniperMechMob()],
    ['plague_bearer', buildPlagueBearerMob()],
    ['crimson_lancer', buildCrimsonLancerMob()],
    ['void_reaper', buildVoidReaperMob()],
    ['mirror_knight', buildMirrorKnightMob()],
    ['magnet_drone', buildMagnetDroneMob()],
    ['blight_bomber', buildBlightBomberMob()],
    ['volt_stalker', buildVoltStalkerMob()],
    ['solar_priest', buildSolarPriestMob()],
    ['magma_brute', buildMagmaBruteMob()],
  ];

  for (const [mobId, spec] of mobs) {
    for (const [stateName, anim] of Object.entries(spec.anims)) {
      const entry = await emitStrip({
        id: `${mobId}_${stateName}`,
        dir: MOBS_DIR,
        rawFrames: anim.frames,
        cellW: spec.cellW,
        cellH: spec.cellH,
        fps: anim.fps,
        loop: anim.loop,
        category: 'mob',
        tier: spec.tier,
        pivotMode: 'feet',
        outlineMode: '4conn',
        stripExistingOutline: true,
        lockFirstFrameFoot: true,
        footPadBottom: spec.footPadBottom ?? 2,
        lutStrength: 1.0,
        sourceId: spec.sourceId,
        license: spec.license,
        url: spec.url,
        fallback: spec.fallback,
      });
      manifestEntries.push(entry);
    }
  }

  // 2. Emit 3 Bosses + Boss Sub-Entities
  const bosses = [
    ['boss_beholder', buildSandBeholderBoss()],
    ['boss_colossus', buildDreadColossusBoss()],
    ['iron_drone', buildIronDroneMob()],
    ['boss_overlord', buildOverlordBoss()],
    ['boss_tempest', buildTempestBoss()],
    ['boss_destroyer', buildDestroyerBoss()],
    ['boss_frost_empress', buildFrostEmpressBoss()],
    ['boss_abyssal_leviathan', buildAbyssalLeviathanBoss()],
    ['boss_storm_herald', buildStormHeraldBoss()],
  ];
  for (const [bossId, spec] of bosses) {
    for (const [stateName, anim] of Object.entries(spec.anims)) {
      const entry = await emitStrip({
        id: `${bossId}_${stateName}`,
        dir: BOSSES_DIR,
        rawFrames: anim.frames,
        cellW: spec.cellW,
        cellH: spec.cellH,
        fps: anim.fps,
        loop: anim.loop,
        category: bossId.startsWith('boss_') ? 'boss' : 'mob',
        tier: spec.tier,
        pivotMode: 'feet',
        outlineMode: '4conn',
        stripExistingOutline: true,
        lockFirstFrameFoot: true,
        footPadBottom: spec.footPadBottom ?? 2,
        lutStrength: 1.0,
        sourceId: spec.sourceId,
        license: spec.license,
        url: spec.url,
        fallback: spec.fallback,
      });
      manifestEntries.push(entry);
    }
  }

  const { wpFrames, pylonFrames } = buildOverlordSubUnits();
  manifestEntries.push(
    await emitStrip({
      id: 'overlord_weakpoint_idle',
      dir: BOSSES_DIR,
      rawFrames: wpFrames,
      cellW: 32,
      cellH: 32,
      fps: 8,
      loop: true,
      category: 'boss',
      tier: 32,
      pivotMode: 'center',
      outlineMode: '4conn',
      stripExistingOutline: true,
      lockFirstFrameFoot: false,
      lutStrength: 1.0,
      sourceId: 'generated_synth',
      license: 'CC0-1.0',
      url: 'local://generated/overlord_weakpoint',
      fallback: false,
    }),
  );
  manifestEntries.push(
    await emitStrip({
      id: 'emp_pylon_idle',
      dir: BOSSES_DIR,
      rawFrames: pylonFrames,
      cellW: 48,
      cellH: 48,
      fps: 8,
      loop: true,
      category: 'boss',
      tier: 48,
      pivotMode: 'feet',
      outlineMode: '4conn',
      stripExistingOutline: true,
      lockFirstFrameFoot: true,
      footPadBottom: 2,
      lutStrength: 1.0,
      sourceId: 'generated_synth',
      license: 'CC0-1.0',
      url: 'local://generated/emp_pylon',
      fallback: false,
    }),
  );

  // 3. Emit 9 Biome Tiles (seamless 48x48, outlineMode: 'none', crisp palette / desert LUT bypass)
  const biomeTiles = buildBiomeTiles(oss);
  for (const t of biomeTiles) {
    manifestEntries.push(
      await emitStrip({
        id: t.id,
        aliases: t.aliases,
        dir: TILES_DIR,
        rawFrames: t.frames,
        cellW: 48,
        cellH: 48,
        fps: 1,
        loop: false,
        category: 'tile',
        tier: 48,
        pivotMode: 'tile',
        outlineMode: 'none',
        lutStrength: t.lutStrength ?? 1.0,
        sourceId: t.sourceId,
        license: 'CC0-1.0',
        url: t.url,
        fallback: t.fallback,
      }),
    );
  }

  // 4. Emit Props, Obstacles, Barrels, Pedestals, Decor & Pickups
  const propEntries = buildPropsAndPickups(oss);
  for (const p of propEntries) {
    manifestEntries.push(
      await emitStrip({
        id: p.id,
        aliases: p.aliases,
        dir: p.dir,
        rawFrames: p.frames,
        cellW: p.cellW,
        cellH: p.cellH,
        fps: p.fps,
        loop: p.loop,
        category: p.category,
        tier: p.tier,
        pivotMode: p.pivotMode,
        outlineMode: '4conn',
        stripExistingOutline: true,
        lockFirstFrameFoot: p.pivotMode === 'feet',
        footPadBottom: 2,
        lutStrength: 1.0,
        sourceId: p.sourceId,
        license: 'CC0-1.0',
        url: p.url,
        fallback: p.fallback,
      }),
    );
  }

  // 5. Write meta-mobs.json strictly inside our assigned folder
  const meta = {
    schemaVersion: 1,
    slice: 'w13',
    generatedAt: new Date().toISOString(),
    palette48Count: BANSUNG_PALETTE_48.length,
    outlineHex: NORM_CONSTANTS.OUTLINE_HEX,
    nativeFacing: NORM_CONSTANTS.NATIVE_FACING,
    ossFetches: oss.fetchLog,
    summary: {
      totalSprites: manifestEntries.length,
      mobs: manifestEntries.filter((e) => e.category === 'mob').length,
      bosses: manifestEntries.filter((e) => e.category === 'boss').length,
      tiles: manifestEntries.filter((e) => e.category === 'tile').length,
      props: manifestEntries.filter((e) => e.category === 'prop').length,
      pickups: manifestEntries.filter((e) => e.category === 'pickup').length,
      ossBacked: manifestEntries.filter((e) => e.sourceId !== 'generated_synth').length,
      fallbacks: manifestEntries.filter((e) => e.fallback).length,
    },
    sprites: Object.fromEntries(manifestEntries.map((e) => [e.id, e])),
  };
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  const elapsed = Date.now() - startMs;
  console.log(
    `[w13] Done in ${elapsed}ms: ${meta.summary.totalSprites} strips ` +
      `(mobs=${meta.summary.mobs}, bosses=${meta.summary.bosses}, tiles=${meta.summary.tiles}, ` +
      `props=${meta.summary.props}, pickups=${meta.summary.pickups}, oss=${meta.summary.ossBacked}) -> ${META_PATH}`,
  );
}

main().catch((err) => {
  console.error('[w13] FATAL:', err);
  process.exit(1);
});
