#!/usr/bin/env node
/**
 * Wave 2B [w12] — Ban Sung Weapon, Gadget, Projectile & VFX Sprite Builder
 *
 * Downloads verified CC0 OSS weapon/VFX packs from database-ban-sung/sources.json
 * into a temporary cache directory (with automatic deterministic pure-Node
 * pixel-art fallback if any URL is unreachable or --offline is passed),
 * normalizes 15 weapons + 4 gadgets + 28 projectile/FX sprite sheets into
 * crisp pixel strips, and emits database-ban-sung/sprites/fx/meta-fx.json.
 *
 * Usage:
 *   node scripts/bansung/build-fx-sprites.mjs [--offline] [--force]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  NORM_CONSTANTS,
  createImage,
  cloneImage,
  cropImage,
  resizeImage,
  scaleImage,
  blitImage,
  sliceSpriteSheet,
  hardenAlpha,
  getOpaqueBBox,
  stripDarkOutline,
  applyOutline4Conn,
  quantizeImageToPalette48,
  packStrip,
  readPngFile,
  writePngFile,
  fetchToFile,
  extractZipSafe,
  hexToRgba,
  mulberry32,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WEAPONS_OUT_DIR = path.join(ROOT_DIR, 'database-ban-sung', 'sprites', 'weapons');
const FX_OUT_DIR = path.join(ROOT_DIR, 'database-ban-sung', 'sprites', 'fx');
const META_OUT_PATH = path.join(FX_OUT_DIR, 'meta-fx.json');
const SOURCES_JSON_PATH = path.join(ROOT_DIR, 'database-ban-sung', 'sources.json');
const CACHE_DIR = path.join(os.tmpdir(), 'bansung-w12-cache');

const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has('--offline');
const FORCE_FETCH = ARGS.has('--force');

// Curated Endesga/Ban-Sung-aligned colors (quantized via BANSUNG_PALETTE_48 when outlined)
const C = {
  outline: NORM_CONSTANTS.OUTLINE_RGBA,
  black: hexToRgba('#181425'),
  slateDark: hexToRgba('#262b44'),
  gunDark: hexToRgba('#3a4466'),
  gunMid: hexToRgba('#5a6988'),
  gunLight: hexToRgba('#8b9bb4'),
  steelBright: hexToRgba('#c0cbdc'),
  white: hexToRgba('#ffffff'),
  ivory: hexToRgba('#fff1e8'),

  woodDark: hexToRgba('#733e39'),
  woodMid: hexToRgba('#b86f50'),
  woodLight: hexToRgba('#e4a672'),
  copperDark: hexToRgba('#be4a2f'),
  amber: hexToRgba('#d77643'),
  gold: hexToRgba('#feae34'),
  yellow: hexToRgba('#fee761'),

  oliveDark: hexToRgba('#193c3e'),
  oliveMid: hexToRgba('#265c42'),
  oliveBright: hexToRgba('#3e8948'),
  emerald: hexToRgba('#63c74d'),
  mint: hexToRgba('#a7f070'),

  crimsonDark: hexToRgba('#681b2a'),
  crimson: hexToRgba('#9e2835'),
  red: hexToRgba('#e43b44'),
  orange: hexToRgba('#f77622'),

  cobaltDark: hexToRgba('#124e89'),
  blue: hexToRgba('#0095e9'),
  cyan: hexToRgba('#2ce8f5'),
  cyanIce: hexToRgba('#e0f8ff'),

  violetDark: hexToRgba('#3e2137'),
  violet: hexToRgba('#68386c'),
  magenta: hexToRgba('#b55088'),
  pink: hexToRgba('#f6757a'),
};

function rgba(r, g, b, a = 255) {
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
    Math.max(0, Math.min(255, Math.round(a))),
  ];
}

function mixRgba(c1, c2, t, alphaOverride = null) {
  const k = Math.max(0, Math.min(1, t));
  return rgba(
    c1[0] + (c2[0] - c1[0]) * k,
    c1[1] + (c2[1] - c1[1]) * k,
    c1[2] + (c2[2] - c1[2]) * k,
    alphaOverride !== null ? alphaOverride : c1[3] + (c2[3] - c1[3]) * k
  );
}

// ---------------------------------------------------------------------------
// Low-level pixel drawing helpers
// ---------------------------------------------------------------------------

function setPx(img, x, y, col, blend = false) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= img.width || iy < 0 || iy >= img.height) return;
  const idx = (iy * img.width + ix) * 4;
  if (!blend) {
    img.data[idx] = col[0];
    img.data[idx + 1] = col[1];
    img.data[idx + 2] = col[2];
    img.data[idx + 3] = col[3];
    return;
  }
  const sa = (col[3] ?? 255) / 255;
  if (sa <= 0) return;
  const da = img.data[idx + 3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  img.data[idx] = Math.round((col[0] * sa + img.data[idx] * da * (1 - sa)) / outA);
  img.data[idx + 1] = Math.round((col[1] * sa + img.data[idx + 1] * da * (1 - sa)) / outA);
  img.data[idx + 2] = Math.round((col[2] * sa + img.data[idx + 2] * da * (1 - sa)) / outA);
  img.data[idx + 3] = Math.round(outA * 255);
}

function addGlowPx(img, x, y, col) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= img.width || iy < 0 || iy >= img.height) return;
  const idx = (iy * img.width + ix) * 4;
  const sa = (col[3] ?? 255) / 255;
  if (sa <= 0) return;
  const da = img.data[idx + 3] / 255;
  if (da <= 0.01) {
    img.data[idx] = col[0];
    img.data[idx + 1] = col[1];
    img.data[idx + 2] = col[2];
    img.data[idx + 3] = col[3];
    return;
  }
  img.data[idx] = Math.min(255, Math.round(img.data[idx] + col[0] * sa));
  img.data[idx + 1] = Math.min(255, Math.round(img.data[idx + 1] + col[1] * sa));
  img.data[idx + 2] = Math.min(255, Math.round(img.data[idx + 2] + col[2] * sa));
  img.data[idx + 3] = Math.min(255, Math.max(img.data[idx + 3], col[3]));
}

function getPx(img, x, y) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return [0, 0, 0, 0];
  const idx = (y * img.width + x) * 4;
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
}

function fillRect(img, x, y, w, h, col, blend = false) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = x0 + Math.round(w);
  const y1 = y0 + Math.round(h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPx(img, px, py, col, blend);
    }
  }
}

function drawLine(img, x0, y0, x1, y1, col, thickness = 1, blend = false) {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  const r = Math.floor(thickness / 2);
  while (true) {
    if (thickness <= 1) {
      setPx(img, ix0, iy0, col, blend);
    } else {
      fillRect(img, ix0 - r, iy0 - r, thickness, thickness, col, blend);
    }
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

function fillEllipse(img, cx, cy, rx, ry, col, blend = false) {
  const minX = Math.floor(cx - rx - 1);
  const maxX = Math.ceil(cx + rx + 1);
  const minY = Math.floor(cy - ry - 1);
  const maxY = Math.ceil(cy + ry + 1);
  const invRx2 = 1 / Math.max(0.25, rx * rx);
  const invRy2 = 1 / Math.max(0.25, ry * ry);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx * invRx2 + dy * dy * invRy2 <= 1.0) {
        setPx(img, x, y, col, blend);
      }
    }
  }
}

function strokeEllipse(img, cx, cy, rx, ry, col, bandPx = 1.4, blend = false) {
  const minX = Math.floor(cx - rx - bandPx - 1);
  const maxX = Math.ceil(cx + rx + bandPx + 1);
  const minY = Math.floor(cy - ry - bandPx - 1);
  const maxY = Math.ceil(cy + ry + bandPx + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / Math.max(0.5, rx);
      const dy = (y - cy) / Math.max(0.5, ry);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pxDist = Math.abs(dist - 1) * Math.min(rx, ry);
      if (pxDist <= bandPx * 0.5) {
        setPx(img, x, y, col, blend);
      }
    }
  }
}

function drawPolygon(img, points, col, blend = false) {
  if (points.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yStart = Math.floor(minY);
  const yEnd = Math.ceil(maxY);
  for (let y = yStart; y <= yEnd; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xStart = Math.round(xs[i]);
      const xEnd = Math.round(xs[i + 1]);
      for (let x = xStart; x <= xEnd; x++) {
        setPx(img, x, y, col, blend);
      }
    }
  }
}

function shiftImageInt(img, dx, dy) {
  const out = createImage(img.width, img.height);
  blitImage(out, img, Math.round(dx), Math.round(dy), { alphaBlend: false });
  return out;
}

function rotateImageNearest(img, rad, cx = (img.width - 1) / 2, cy = (img.height - 1) / 2) {
  const out = createImage(img.width, img.height);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const sx = Math.round(cx + dx * cos + dy * sin);
      const sy = Math.round(cy - dx * sin + dy * cos);
      if (sx >= 0 && sx < img.width && sy >= 0 && sy < img.height) {
        const c = getPx(img, sx, sy);
        if (c[3] > 0) setPx(out, x, y, c);
      }
    }
  }
  return out;
}

function tintImageByLuma(img, rampColors, { boostAlpha = 1.0 } = {}) {
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3];
    if (a < 8) continue;
    const luma = (0.299 * out.data[i] + 0.587 * out.data[i + 1] + 0.114 * out.data[i + 2]) / 255;
    const scaled = Math.max(0, Math.min(1, luma)) * (rampColors.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(rampColors.length - 1, lo + 1);
    const f = scaled - lo;
    const c = mixRgba(rampColors[lo], rampColors[hi], f);
    out.data[i] = c[0];
    out.data[i + 1] = c[1];
    out.data[i + 2] = c[2];
    out.data[i + 3] = Math.max(0, Math.min(255, Math.round(a * boostAlpha)));
  }
  return out;
}

/**
 * Downsample crisp pixel artwork cleanly without dropping 1px barrels/details.
 */
function downsamplePixelArt(srcImg, dstW, dstH) {
  const out = createImage(dstW, dstH);
  const sxScale = srcImg.width / dstW;
  const syScale = srcImg.height / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy0 = Math.floor(y * syScale);
    const sy1 = Math.max(sy0 + 1, Math.min(srcImg.height, Math.ceil((y + 1) * syScale)));
    for (let x = 0; x < dstW; x++) {
      const sx0 = Math.floor(x * sxScale);
      const sx1 = Math.max(sx0 + 1, Math.min(srcImg.width, Math.ceil((x + 1) * sxScale)));
      let total = 0;
      let opaqueCount = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let brightBest = null;
      let brightScore = -1;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          total++;
          const idx = (sy * srcImg.width + sx) * 4;
          const a = srcImg.data[idx + 3];
          if (a >= NORM_CONSTANTS.ALPHA_CUTOFF) {
            opaqueCount++;
            const r = srcImg.data[idx];
            const g = srcImg.data[idx + 1];
            const b = srcImg.data[idx + 2];
            rSum += r;
            gSum += g;
            bSum += b;
            const lum = r + g + b;
            if (lum > brightScore) {
              brightScore = lum;
              brightBest = [r, g, b, 255];
            }
          }
        }
      }
      if (opaqueCount > 0 && opaqueCount / total >= 0.22) {
        // Blend average with slightly lighter dominant pixel to avoid muddy thinning
        const avg = [
          Math.round(rSum / opaqueCount),
          Math.round(gSum / opaqueCount),
          Math.round(bSum / opaqueCount),
          255,
        ];
        const col = brightBest && brightScore > 60 ? mixRgba(avg, brightBest, 0.28, 255) : avg;
        setPx(out, x, y, col);
      }
    }
  }
  return out;
}

/**
 * Normalize an outlined sprite frame set: hard alpha -> Palette48 -> 1px #181425 4-conn outline.
 */
function finalizeOutlinedFrames(frames, lutStrength = 1.0) {
  return frames.map((raw) => {
    let f = cloneImage(raw);
    f = hardenAlpha(f, NORM_CONSTANTS.ALPHA_CUTOFF);
    f = quantizeImageToPalette48(f, {
      lutStrength,
      preserveOutline: true,
      outlineRgba: NORM_CONSTANTS.OUTLINE_RGBA,
    });
    f = applyOutline4Conn(f, NORM_CONSTANTS.OUTLINE_RGBA, NORM_CONSTANTS.ALPHA_CUTOFF);
    return f;
  });
}

function finalizeVfxFrames(frames, { hardAlpha = false, lutStrength = 0 } = {}) {
  return frames.map((raw) => {
    let f = cloneImage(raw);
    if (hardAlpha) f = hardenAlpha(f, NORM_CONSTANTS.ALPHA_CUTOFF);
    if (lutStrength > 0) {
      f = quantizeImageToPalette48(f, {
        lutStrength,
        preserveOutline: false,
        outlineRgba: NORM_CONSTANTS.OUTLINE_RGBA,
      });
    }
    return f;
  });
}

// ---------------------------------------------------------------------------
// OSS Asset Fetching & Cache Loader
// ---------------------------------------------------------------------------

async function loadSourcesJson() {
  try {
    const text = await fs.readFile(SOURCES_JSON_PATH, 'utf8');
    return JSON.parse(text);
  } catch {
    return { spritePacks: [] };
  }
}

async function fetchOssAssets(sourcesDoc) {
  const oss = {
    pixelWeapons: {},
    rocketSheet: null,
    explosionSmall: [],
    spEffects: {},
    spCombat: {},
    spGrenade: null,
    spBomb: null,
    spTurret: {},
    kenneyShmup: {},
    licenses: {},
    fetchedSources: new Set(),
  };

  const packList = sourcesDoc.spritePacks || sourcesDoc.sources || [];
  for (const s of packList) {
    oss.licenses[s.id] = s.license || 'CC0-1.0';
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });

  const findSourceUrl = (id, fallbackUrl) => {
    const hit = packList.find((s) => s.id === id);
    return (hit && (hit.downloadUrl || hit.url)) || fallbackUrl;
  };

  async function tryFetchAndExtractZip(id, fallbackUrl, zipName, extractSubdir) {
    if (OFFLINE) return null;
    const url = findSourceUrl(id, fallbackUrl);
    const zipPath = path.join(CACHE_DIR, zipName);
    const outDir = path.join(CACHE_DIR, extractSubdir);
    try {
      await fetchToFile(url, zipPath, { force: FORCE_FETCH, expect: 'zip', timeoutMs: 20000 });
      const paths = await extractZipSafe(zipPath, outDir, { maxTotalBytes: 80 * 1024 * 1024 });
      oss.fetchedSources.add(id);
      return paths;
    } catch (err) {
      console.warn(`[w12] WARN zip fetch fallback for ${id}: ${err.message}`);
      return null;
    }
  }

  async function tryFetchPng(id, url, destRel) {
    if (OFFLINE) return null;
    const dest = path.join(CACHE_DIR, destRel);
    try {
      await fetchToFile(url, dest, { force: FORCE_FETCH, expect: 'png', timeoutMs: 15000 });
      const img = await readPngFile(dest);
      oss.fetchedSources.add(id);
      return img;
    } catch (err) {
      console.warn(`[w12] WARN png fetch fallback for ${id} (${destRel}): ${err.message}`);
      return null;
    }
  }

  // 1. OGA PixelWeapons_0.zip
  const pwPaths = await tryFetchAndExtractZip(
    'oga_pixel_weapons',
    'https://opengameart.org/sites/default/files/PixelWeapons_0.zip',
    'PixelWeapons_0.zip',
    'oga_pixel_weapons'
  );
  if (pwPaths) {
    for (const p of pwPaths) {
      if (p.toLowerCase().endsWith('.png')) {
        try {
          oss.pixelWeapons[path.basename(p).toLowerCase()] = await readPngFile(p);
        } catch {
          // ignore unreadable sub-entry
        }
      }
    }
  }

  // 2. OGA projectile_rocket_16x16.png
  oss.rocketSheet = await tryFetchPng(
    'oga_rocket_16dir',
    findSourceUrl('oga_rocket_16dir', 'https://opengameart.org/sites/default/files/projectile_rocket_16x16.png'),
    'projectile_rocket_16x16.png'
  );

  // 3. OGA explosion_4.zip
  const expPaths = await tryFetchAndExtractZip(
    'oga_16x16_explosion',
    'https://opengameart.org/sites/default/files/explosion_4.zip',
    'explosion_4.zip',
    'oga_16x16_explosion'
  );
  if (expPaths) {
    const stripPath = expPaths.find((p) => path.basename(p).toLowerCase() === 'explosion.png');
    if (stripPath) {
      try {
        const strip = await readPngFile(stripPath);
        oss.explosionSmall = sliceSpriteSheet(strip, 16, 16, { count: Math.floor(strip.width / 16) });
      } catch {
        // fallback handles below
      }
    }
  }

  // 4. SpritePilot Effects Pack
  const spEffPaths = await tryFetchAndExtractZip(
    'spritepilot_effects',
    'https://spritepilot.com/free-assets/effects/spritepilot-effects-pack.zip',
    'spritepilot-effects-pack.zip',
    'spritepilot_effects'
  );
  if (spEffPaths) {
    for (const p of spEffPaths) {
      if (!p.toLowerCase().endsWith('.png')) continue;
      if (!p.toLowerCase().includes('32px')) continue;
      try {
        oss.spEffects[path.basename(p).toLowerCase()] = await readPngFile(p);
      } catch {
        // skip
      }
    }
  }

  // 5. SpritePilot Combat Pack
  const spComPaths = await tryFetchAndExtractZip(
    'spritepilot_combat',
    'https://spritepilot.com/free-assets/combat/spritepilot-combat-pack.zip',
    'spritepilot-combat-pack.zip',
    'spritepilot_combat'
  );
  if (spComPaths) {
    for (const p of spComPaths) {
      if (!p.toLowerCase().endsWith('.png')) continue;
      try {
        oss.spCombat[path.basename(p).toLowerCase()] = await readPngFile(p);
      } catch {
        // skip
      }
    }
  }

  // 6. Superpowers targeted raw PNGs (individual files avoid >50MB zip cap)
  const spBase = 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/top-down-shooter/';
  oss.spGrenade = await tryFetchPng('superpowers_asset_packs', `${spBase}item/grenade.png`, 'sp_grenade.png');
  oss.spBomb = await tryFetchPng('superpowers_asset_packs', `${spBase}weapons/shoot/Bomb.png`, 'sp_bomb.png');
  for (const part of ['base', '1', '2', '3']) {
    const img = await tryFetchPng(
      'superpowers_asset_packs',
      `${spBase}characters/turret/${part}.png`,
      `sp_turret_${part}.png`
    );
    if (img) oss.spTurret[part] = img;
  }

  // 7. Kenney Pixel Shmup tiles (compact crisp projectile references)
  const kmBase = 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Pixel%20Shmup/Tiles/';
  for (const tile of ['tile_0000.png', 'tile_0001.png', 'tile_0002.png', 'tile_0003.png']) {
    const img = await tryFetchPng('kenney_pixel_shmup', `${kmBase}${tile}`, `kenney_shmup_${tile}`);
    if (img) oss.kenneyShmup[tile] = img;
  }

  return oss;
}

// ---------------------------------------------------------------------------
// Weapon Generators (15 Weapons + 4 Gadgets)
// ---------------------------------------------------------------------------

function pruneIsolatedPixels(img) {
  const out = cloneImage(img);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      if (img.data[idx + 3] < 128) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < img.width && ny >= 0 && ny < img.height) {
            if (img.data[(ny * img.width + nx) * 4 + 3] >= 128) neighbors++;
          }
        }
      }
      if (neighbors === 0) {
        out.data[idx + 3] = 0;
      }
    }
  }
  return out;
}

/**
 * Helper: map an OSS PixelWeapons PNG into target frame centered on barrel/grip margins.
 */
function buildOssGunFrame0(ossPng, cellW, cellH, targetRect) {
  const bbox = getOpaqueBBox(ossPng, 128);
  if (bbox.empty) return null;
  let cropped = cropImage(ossPng, bbox.minX, bbox.minY, bbox.width, bbox.height);
  cropped = stripDarkOutline(cropped, { lumaMax: 38, alphaCutoff: 128 });
  const innerBbox = getOpaqueBBox(cropped, 128);
  if (innerBbox.empty) return null;
  const tight = cropImage(cropped, innerBbox.minX, innerBbox.minY, innerBbox.width, innerBbox.height);

  const scale = Math.min(targetRect.maxW / tight.width, targetRect.maxH / tight.height);
  const dstW = Math.max(4, Math.round(tight.width * scale));
  const dstH = Math.max(4, Math.round(tight.height * scale));
  const small = pruneIsolatedPixels(downsamplePixelArt(tight, dstW, dstH));

  const frame = createImage(cellW, cellH);
  const dstX = targetRect.anchorRight !== undefined
    ? targetRect.anchorRight - dstW
    : targetRect.x;
  const dstY = targetRect.y !== undefined
    ? targetRect.y
    : Math.round((cellH - dstH) / 2);
  blitImage(frame, small, dstX, dstY);
  return frame;
}

function makePistolFrames(oss) {
  const cellW = 24;
  const cellH = 16;
  const ossImg = oss.pixelWeapons['coltpixel.png'];
  let f0 = null;
  let usedOss = false;

  if (ossImg) {
    f0 = buildOssGunFrame0(ossImg, cellW, cellH, { anchorRight: 22, y: 3, maxW: 19, maxH: 10 });
    if (f0) usedOss = true;
  }

  if (!f0) {
    f0 = createImage(cellW, cellH);
    // Crisp service pistol: angled wood grip at (6,8), gunmetal slide out to x=22, y=5
    fillRect(f0, 5, 8, 3, 5, C.woodMid);
    setPx(f0, 5, 8, C.woodLight);
    setPx(f0, 4, 11, C.woodDark);
    setPx(f0, 4, 12, C.woodDark);
    fillRect(f0, 6, 7, 5, 2, C.slateDark); // frame/trigger guard
    fillRect(f0, 8, 8, 2, 1, C.gunLight);
    fillRect(f0, 6, 4, 16, 3, C.gunMid); // slide
    fillRect(f0, 6, 4, 16, 1, C.steelBright); // top specular
    fillRect(f0, 8, 6, 13, 1, C.gunDark); // under-rail
    fillRect(f0, 20, 5, 2, 1, C.steelBright); // muzzle crown
    setPx(f0, 7, 3, C.gunLight); // rear sight
    setPx(f0, 20, 3, C.steelBright); // front sight
  }

  // Frame 1: recoil kickback + ejection chamber spark
  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 10, 4, 3, 2, C.yellow);

  // Frame 2: slide recover forward
  const f2 = cloneImage(f0);
  fillRect(f2, 11, 4, 2, 1, C.gold);

  return {
    frames: finalizeOutlinedFrames([f0, f1, f2]),
    usedOss,
    sourceId: usedOss ? 'oga_pixel_weapons' : 'generated_synth',
  };
}

function makeRifleFrames(oss) {
  const cellW = 40;
  const cellH = 18;
  const ossImg = oss.pixelWeapons['ak47pixel.png'] || oss.pixelWeapons['m16.png'];
  let f0 = null;
  let usedOss = false;

  if (ossImg) {
    f0 = buildOssGunFrame0(ossImg, cellW, cellH, { anchorRight: 38, y: 3, maxW: 36, maxH: 12 });
    if (f0) usedOss = true;
  }
  if (!f0) {
    f0 = createImage(cellW, cellH);
    // Synthetic fallback rifle: grip (10,9), stock (2..7), mag (16..18), muzzle (38,7)
    fillRect(f0, 2, 7, 6, 4, C.oliveDark);
    fillRect(f0, 2, 7, 6, 1, C.oliveBright);
    fillRect(f0, 8, 6, 14, 3, C.gunMid);
    fillRect(f0, 9, 6, 12, 1, C.steelBright);
    fillRect(f0, 9, 9, 3, 5, C.oliveDark);
    setPx(f0, 10, 9, C.oliveMid);
    fillRect(f0, 15, 9, 3, 4, C.woodMid);
    fillRect(f0, 16, 12, 3, 3, C.woodDark);
    fillRect(f0, 22, 6, 8, 3, C.oliveMid);
    fillRect(f0, 22, 6, 8, 1, C.emerald);
    fillRect(f0, 29, 7, 9, 1, C.steelBright);
    fillRect(f0, 29, 8, 7, 1, C.gunDark);
    fillRect(f0, 35, 5, 2, 2, C.gunLight);
    fillRect(f0, 13, 4, 5, 2, C.gunLight);
  }

  // Frame 1: recoil kickback + bolt ejection spark
  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 15, 6, 3, 2, C.yellow);

  // Frame 2: return recover
  const f2 = cloneImage(f0);
  fillRect(f2, 16, 6, 2, 1, C.amber);

  return {
    frames: finalizeOutlinedFrames([f0, f1, f2]),
    usedOss,
    sourceId: usedOss ? 'oga_pixel_weapons' : 'generated_synth',
  };
}

function makeSmgFrames(oss) {
  const cellW = 34;
  const cellH = 18;
  const ossImg = oss.pixelWeapons['mp5pixel.png'];
  let f0 = null;
  let usedOss = false;

  if (ossImg) {
    f0 = buildOssGunFrame0(ossImg, cellW, cellH, { anchorRight: 32, y: 3, maxW: 30, maxH: 12 });
    if (f0) usedOss = true;
  }
  if (!f0) {
    f0 = createImage(cellW, cellH);
    fillRect(f0, 2, 7, 5, 3, C.slateDark);
    fillRect(f0, 2, 7, 5, 1, C.gunLight);
    fillRect(f0, 7, 6, 15, 3, C.gunMid);
    fillRect(f0, 8, 5, 13, 1, C.steelBright);
    fillRect(f0, 8, 9, 3, 5, C.gunDark);
    setPx(f0, 9, 9, C.gunLight);
    fillRect(f0, 14, 9, 2, 6, C.gunLight);
    fillRect(f0, 15, 11, 2, 4, C.gunDark);
    fillRect(f0, 22, 6, 4, 3, C.slateDark);
    fillRect(f0, 26, 7, 6, 2, C.gunLight);
    fillRect(f0, 27, 7, 4, 1, C.steelBright);
    setPx(f0, 12, 4, C.gunLight);
    setPx(f0, 25, 4, C.steelBright);
  }

  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 14, 6, 2, 2, C.yellow);

  const f2 = cloneImage(f0);
  fillRect(f2, 14, 6, 2, 1, C.gold);

  return {
    frames: finalizeOutlinedFrames([f0, f1, f2]),
    usedOss,
    sourceId: usedOss ? 'oga_pixel_weapons' : 'generated_synth',
  };
}

function makeShotgunFrames(oss) {
  const cellW = 42;
  const cellH = 18;
  const ossImg = oss.pixelWeapons['shotgun.png'] || oss.pixelWeapons['shotgunwithscope.png'];
  let f0 = null;
  let usedOss = false;

  if (ossImg) {
    f0 = buildOssGunFrame0(ossImg, cellW, cellH, { anchorRight: 40, y: 4, maxW: 38, maxH: 10 });
    if (f0) usedOss = true;
  }
  if (!f0) {
    f0 = createImage(cellW, cellH);
    fillRect(f0, 2, 8, 7, 4, C.woodMid);
    fillRect(f0, 3, 7, 6, 2, C.woodLight);
    fillRect(f0, 9, 6, 10, 3, C.gunMid);
    fillRect(f0, 10, 6, 8, 1, C.steelBright);
    fillRect(f0, 9, 9, 3, 4, C.woodDark);
    fillRect(f0, 19, 6, 21, 2, C.steelBright);
    fillRect(f0, 19, 8, 18, 1, C.gunDark);
    fillRect(f0, 22, 8, 8, 3, C.woodMid);
    fillRect(f0, 23, 8, 6, 1, C.woodLight);
    setPx(f0, 39, 5, C.red);
  }

  // Frame 1: heavy recoil + port open
  const f1 = shiftImageInt(f0, -2, -1);
  fillRect(f1, 14, 6, 3, 2, C.orange);

  // Frame 2: pump cycling back + hull eject spark
  const f2 = shiftImageInt(f0, -1, 0);
  fillRect(f2, 15, 5, 3, 2, C.gold);
  fillRect(f2, 20, 8, 6, 2, C.woodLight);

  // Frame 3: pump forward
  const f3 = cloneImage(f0);
  fillRect(f3, 24, 8, 6, 2, C.woodMid);

  return {
    frames: finalizeOutlinedFrames([f0, f1, f2, f3]),
    usedOss,
    sourceId: usedOss ? 'oga_pixel_weapons' : 'generated_synth',
  };
}

function makeFragLauncherFrames() {
  const cellW = 32;
  const cellH = 24;
  const f0 = createImage(cellW, cellH);
  // Rotary drum grenade launcher: grip (8,12), wide muzzle (30,10)
  fillRect(f0, 2, 10, 5, 4, C.oliveDark); // buttstock
  fillRect(f0, 2, 10, 5, 1, C.oliveBright);
  fillRect(f0, 7, 8, 10, 4, C.gunMid); // frame
  fillRect(f0, 8, 8, 8, 1, C.steelBright);
  fillRect(f0, 7, 12, 3, 6, C.slateDark); // grip around (8,12)
  setPx(f0, 8, 12, C.gunLight);
  // Chubby 40mm rotary drum cylinder
  fillEllipse(f0, 15, 13, 4.2, 4.2, C.oliveMid);
  fillEllipse(f0, 15, 12, 2.5, 2.5, C.oliveBright);
  setPx(f0, 14, 12, C.gold);
  setPx(f0, 16, 14, C.gold);
  // Wide launcher barrel
  fillRect(f0, 19, 8, 12, 4, C.gunMid);
  fillRect(f0, 19, 8, 12, 1, C.steelBright);
  fillRect(f0, 28, 7, 3, 6, C.amber); // flanged heavy muzzle
  fillRect(f0, 28, 7, 3, 1, C.gold);
  fillRect(f0, 10, 6, 4, 2, C.gunLight); // ladder sight

  const f1 = shiftImageInt(f0, -2, 0);
  fillRect(f1, 14, 11, 2, 2, C.orange);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeStunLauncherFrames() {
  const cellW = 32;
  const cellH = 24;
  const f0 = createImage(cellW, cellH);
  // Steel-white body + cyan stun coil barrel, grip (8,12), muzzle (30,10)
  fillRect(f0, 2, 10, 5, 4, C.gunDark);
  fillRect(f0, 7, 8, 12, 4, C.steelBright);
  fillRect(f0, 8, 8, 10, 1, C.white);
  fillRect(f0, 7, 12, 3, 6, C.gunDark);
  setPx(f0, 8, 12, C.cyan);
  // Under-barrel stun battery canister
  fillRect(f0, 12, 12, 6, 4, C.cobaltDark);
  fillRect(f0, 13, 13, 4, 2, C.cyan);
  // Coiled accelerator barrel
  fillRect(f0, 19, 9, 11, 3, C.gunMid);
  for (let x = 20; x <= 28; x += 3) {
    fillRect(f0, x, 8, 2, 5, C.cyan);
    setPx(f0, x, 8, C.cyanIce);
  }
  fillRect(f0, 29, 8, 2, 5, C.blue);

  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 18, 9, 11, 3, C.cyanIce);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeTripleBazookaFrames() {
  const cellW = 40;
  const cellH = 24;
  const f0 = createImage(cellW, cellH);
  // Shoulder-fired tri-tube rocket rack: grip (12,12), muzzle (38,10), vent (3,10)
  // Top + mid + lower olive launch tubes
  fillRect(f0, 3, 6, 35, 3, C.oliveMid);
  fillRect(f0, 4, 6, 33, 1, C.emerald);
  fillRect(f0, 3, 9, 36, 3, C.oliveDark);
  fillRect(f0, 4, 9, 34, 1, C.oliveBright);
  fillRect(f0, 5, 12, 32, 2, C.gunDark);
  // Rear flared venturi exhaust cone
  fillRect(f0, 2, 5, 3, 8, C.gunDark);
  fillRect(f0, 2, 6, 2, 6, C.amber);
  // Front armored band & yellow hazard stripe
  fillRect(f0, 33, 5, 4, 9, C.gunMid);
  fillRect(f0, 35, 6, 2, 7, C.gold);
  // Grip & carry handle / scope
  fillRect(f0, 11, 13, 3, 6, C.slateDark);
  setPx(f0, 12, 13, C.woodLight);
  fillRect(f0, 19, 13, 3, 4, C.gunLight); // forward handle
  fillRect(f0, 13, 3, 6, 3, C.gunLight); // top optic
  setPx(f0, 18, 4, C.red);

  // Frame 1: recoil + rear backblast flash
  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 1, 6, 3, 6, C.orange);
  fillRect(f1, 1, 7, 2, 4, C.yellow);
  setPx(f1, 2, 9, C.white);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeMineGunFrames() {
  const cellW = 32;
  const cellH = 24;
  const f0 = createImage(cellW, cellH);
  // Wide copper/amber magnetic disc chute: grip (8,12), muzzle (30,10)
  fillRect(f0, 3, 10, 4, 4, C.gunDark);
  fillRect(f0, 7, 8, 12, 4, C.copperDark);
  fillRect(f0, 8, 8, 10, 1, C.amber);
  fillRect(f0, 7, 12, 3, 6, C.slateDark);
  setPx(f0, 8, 12, C.gunLight);
  // Top disc hopper + glowing red LED
  fillRect(f0, 12, 5, 7, 4, C.gunMid);
  fillRect(f0, 13, 6, 5, 2, C.gold);
  setPx(f0, 10, 7, C.red);
  // Wide flat chute barrel
  fillRect(f0, 19, 8, 11, 5, C.gunMid);
  fillRect(f0, 19, 8, 11, 1, C.steelBright);
  fillRect(f0, 21, 10, 8, 2, C.amber);
  fillRect(f0, 28, 7, 2, 7, C.steelBright);

  const f1 = shiftImageInt(f0, -1, 0);
  setPx(f1, 10, 7, C.yellow);
  fillRect(f1, 26, 9, 3, 3, C.red);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makePlasmaRifleFrames() {
  const cellW = 32;
  const cellH = 16;
  const f0 = createImage(cellW, cellH);
  // Sci-fi blue-cyan coil plasma rifle, grip (8,10), muzzle (30,6)
  fillRect(f0, 2, 6, 6, 4, C.cobaltDark); // curved energy stock
  fillRect(f0, 3, 6, 5, 1, C.blue);
  fillRect(f0, 7, 5, 14, 4, C.gunMid); // chassis
  fillRect(f0, 8, 4, 12, 2, C.steelBright);
  fillRect(f0, 7, 9, 3, 5, C.slateDark); // grip at (8,10)
  setPx(f0, 8, 10, C.cyan);
  // Glowing cyan plasma cell & cooling fins
  fillRect(f0, 13, 6, 5, 2, C.cyan);
  fillRect(f0, 14, 6, 3, 1, C.cyanIce);
  fillRect(f0, 21, 5, 9, 3, C.cobaltDark);
  for (let x = 22; x <= 28; x += 2) {
    fillRect(f0, x, 4, 1, 5, C.cyan);
  }
  fillRect(f0, 29, 5, 2, 3, C.cyanIce); // muzzle at ~30,6

  const f1 = shiftImageInt(f0, -1, 0);
  fillRect(f1, 12, 6, 6, 2, C.white);
  fillRect(f1, 27, 5, 3, 3, C.white);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeRailgunFrames() {
  const cellW = 38;
  const cellH = 16;
  const makeRailBase = (chargeLevel) => {
    const img = createImage(cellW, cellH);
    fillRect(img, 2, 7, 6, 3, C.slateDark);
    fillRect(img, 7, 5, 12, 4, C.gunMid);
    fillRect(img, 8, 5, 10, 1, C.steelBright);
    fillRect(img, 8, 9, 3, 5, C.gunDark); // grip (9,10)
    // Long split twin rails extending to x=36
    fillRect(img, 19, 4, 17, 2, C.steelBright);
    fillRect(img, 19, 8, 17, 2, C.gunMid);
    fillRect(img, 19, 6, 17, 2, C.cobaltDark); // inner magnetic channel
    const glowCol = chargeLevel === 2 ? C.cyanIce : chargeLevel === 1 ? C.cyan : C.blue;
    fillRect(img, 14, 6, 4 + chargeLevel * 9, 2, glowCol);
    if (chargeLevel >= 1) {
      fillRect(img, 23, 3, 2, 1, C.cyan);
      fillRect(img, 29, 3, 2, 1, C.cyan);
    }
    if (chargeLevel === 2) {
      fillRect(img, 34, 5, 3, 4, C.white);
    }
    return img;
  };
  return {
    frames: finalizeOutlinedFrames([makeRailBase(0), makeRailBase(1), makeRailBase(2)]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeLightningStaffFrames() {
  const cellW = 36;
  const cellH = 14;
  const makeStaff = (pulse) => {
    const img = createImage(cellW, cellH);
    // Horizontal pole held at (10,7), crystal prong head at (34,7)
    fillRect(img, 3, 6, 25, 2, C.woodMid);
    fillRect(img, 3, 6, 25, 1, C.woodLight);
    fillRect(img, 9, 5, 4, 4, C.gold); // hand wrap near (10,7)
    fillRect(img, 26, 4, 4, 6, C.gunLight); // ornate collar
    // Dual prongs cradling glowing cyan orb
    fillRect(img, 29, 2, 5, 2, C.gold);
    fillRect(img, 29, 10, 5, 2, C.gold);
    fillEllipse(img, 33, 7, 2.3, 2.3, pulse ? C.cyanIce : C.cyan);
    setPx(img, 33, 7, C.white);
    if (pulse) {
      setPx(img, 34, 4, C.cyan);
      setPx(img, 34, 10, C.cyan);
    }
    return img;
  };
  return {
    frames: finalizeOutlinedFrames([makeStaff(false), makeStaff(true)]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeArcaneBookFrames() {
  const cellW = 20;
  const cellH = 20;
  // f0: closed crimson-gold grimoire hovering at center (10,10)
  const f0 = createImage(cellW, cellH);
  fillRect(f0, 5, 4, 10, 12, C.crimson);
  fillRect(f0, 5, 4, 2, 12, C.crimsonDark); // spine
  fillRect(f0, 7, 5, 7, 10, C.ivory); // page edge
  fillRect(f0, 6, 4, 9, 11, C.crimson);
  fillRect(f0, 9, 7, 3, 5, C.gold); // gold sigil
  setPx(f0, 10, 9, C.cyan); // arcane gem

  // f1: floating open glowing pages
  const f1 = createImage(cellW, cellH);
  fillRect(f1, 2, 5, 16, 10, C.crimson); // open cover
  fillRect(f1, 3, 4, 6, 10, C.ivory);
  fillRect(f1, 11, 4, 6, 10, C.ivory);
  fillRect(f1, 9, 5, 2, 10, C.gold); // glowing spine
  setPx(f1, 5, 7, C.magenta);
  setPx(f1, 6, 9, C.cyan);
  setPx(f1, 13, 7, C.cyan);
  setPx(f1, 14, 9, C.magenta);
  setPx(f1, 17, 9, C.cyanIce);

  return {
    frames: finalizeOutlinedFrames([f0, f1]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeCrescentBladeFrames() {
  const cellW = 48;
  const cellH = 48;
  const buildPose = (angleDeg, smear) => {
    const base = createImage(cellW, cellH);
    // Horizontal right-pointing silver-cyan curved sabre around grip (10,24)
    fillRect(base, 4, 23, 7, 3, C.slateDark); // pommel + handle
    setPx(base, 10, 24, C.gold);
    fillRect(base, 11, 20, 2, 9, C.gold); // crossguard
    // Swept crescent blade extending to x=42
    for (let x = 13; x <= 42; x++) {
      const t = (x - 13) / 29;
      const curveY = 24 - Math.sin(t * Math.PI * 0.85) * 4;
      const thick = t < 0.7 ? 3 : 2;
      fillRect(base, x, Math.round(curveY - thick / 2), 1, thick, t > 0.45 ? C.cyan : C.steelBright);
      setPx(base, x, Math.round(curveY - thick / 2), C.white);
    }
    if (smear) {
      drawLine(base, 18, 12, 43, 21, C.cyan, 2);
      drawLine(base, 24, 15, 44, 23, C.white, 1);
    }
    return rotateImageNearest(base, (angleDeg * Math.PI) / 180, 10, 24);
  };
  return {
    frames: finalizeOutlinedFrames([
      buildPose(0, false),
      buildPose(-32, false),
      buildPose(18, true),
      buildPose(6, false),
    ]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeReaperScytheFrames() {
  const cellW = 64;
  const cellH = 64;
  const buildPose = (angleDeg, trail) => {
    const base = createImage(cellW, cellH);
    // Long dark shaft held at (14,32), curved crimson-violet scythe head ending around (54,22)
    drawLine(base, 4, 34, 52, 24, C.slateDark, 3);
    drawLine(base, 5, 33, 51, 23, C.gunMid, 1);
    fillRect(base, 12, 30, 5, 5, C.violet); // grip collar
    // Large wicked curved scythe blade descending & curving toward +X/+Y
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const bx = 50 + Math.sin(t * 2.1) * 7 - t * 9;
      const by = 22 + t * 23;
      const w = Math.max(1, Math.round((1 - t * 0.7) * 5));
      fillRect(base, Math.round(bx - w), Math.round(by), w + 1, 2, C.crimson);
      setPx(base, Math.round(bx), Math.round(by), t > 0.35 ? C.pink : C.red);
      setPx(base, Math.round(bx + 1), Math.round(by), C.ivory);
    }
    fillEllipse(base, 50, 23, 3, 3, C.magenta);
    if (trail) {
      drawLine(base, 48, 13, 56, 38, C.pink, 2);
    }
    return rotateImageNearest(base, (angleDeg * Math.PI) / 180, 14, 32);
  };
  return {
    frames: finalizeOutlinedFrames([
      buildPose(0, false),
      buildPose(-28, false),
      buildPose(22, true),
      buildPose(8, false),
    ]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeShockBatonFrames() {
  const cellW = 48;
  const cellH = 48;
  const buildPose = (angleDeg, sparkPhase) => {
    const base = createImage(cellW, cellH);
    // High-tech baton grip at (10,24), emitter tip at (40,24)
    fillRect(base, 5, 22, 8, 4, C.slateDark);
    fillRect(base, 13, 20, 3, 8, C.gunLight);
    fillRect(base, 16, 22, 18, 4, C.gunMid);
    fillRect(base, 16, 22, 18, 1, C.steelBright);
    fillRect(base, 34, 21, 7, 6, C.cobaltDark);
    for (let x = 35; x <= 40; x += 2) {
      fillRect(base, x, 20, 1, 8, C.cyan);
    }
    if (sparkPhase > 0) {
      const col = sparkPhase === 2 ? C.white : C.cyanIce;
      drawLine(base, 34, 18, 41, 16, col, 1);
      drawLine(base, 36, 30, 42, 31, C.cyan, 1);
      setPx(base, 43, 24, C.white);
    }
    return rotateImageNearest(base, (angleDeg * Math.PI) / 180, 10, 24);
  };
  return {
    frames: finalizeOutlinedFrames([
      buildPose(0, 1),
      buildPose(-8, 2),
      buildPose(12, 2),
      buildPose(4, 0),
    ]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeGadgetStunBombFrames() {
  const cellW = 32;
  const cellH = 32;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const dy = f === 1 ? -1 : f === 3 ? 1 : 0;
    fillRect(img, 10, 8 + dy, 12, 16, C.gunMid);
    fillRect(img, 10, 8 + dy, 4, 16, C.steelBright);
    fillRect(img, 11, 7 + dy, 10, 3, C.slateDark); // cap
    fillRect(img, 13, 4 + dy, 6, 3, C.gunLight); // lever
    fillRect(img, 9, 13 + dy, 14, 4, C.cobaltDark); // cyan band
    fillRect(img, 11, 14 + dy, 10, 2, f % 2 === 0 ? C.cyan : C.cyanIce);
    if (f === 2) {
      setPx(img, 16, 15 + dy, C.white);
    }
    frames.push(img);
  }
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function prepareBombFit(spBombImg, targetSize = 22) {
  let clean = stripDarkOutline(spBombImg, { lumaMax: 35 });
  const bb = getOpaqueBBox(clean, 128);
  if (bb.empty) return null;
  clean = cropImage(clean, bb.minX, bb.minY, bb.width, bb.height);
  const s = Math.min(targetSize / clean.width, targetSize / clean.height);
  return resizeImage(clean, Math.max(6, Math.round(clean.width * s)), Math.max(6, Math.round(clean.height * s)));
}

function makeGadgetClusterBombFrames(oss) {
  const cellW = 32;
  const cellH = 32;
  const bombSprite = oss.spBomb ? prepareBombFit(oss.spBomb, 21) : null;
  const usedOss = Boolean(bombSprite);
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    if (bombSprite) {
      const tinted = tintImageByLuma(bombSprite, [C.crimsonDark, C.crimson, C.red, C.gold]);
      blitImage(
        img,
        tinted,
        Math.round((cellW - bombSprite.width) / 2),
        Math.round((cellH - bombSprite.height) / 2) + (f === 1 ? -1 : 0)
      );
    } else {
      fillEllipse(img, 16, 17, 8, 8, C.crimson);
      fillEllipse(img, 14, 15, 5, 5, C.red);
      fillRect(img, 13, 7, 6, 3, C.gunMid);
    }
    // Triple cluster seam rings + blinking fuse spark
    fillRect(img, 11, 16, 10, 2, C.gold);
    setPx(img, 15, 16, C.white);
    if (f % 2 === 0) {
      fillRect(img, 18, 4, 3, 3, C.yellow);
      setPx(img, 19, 5, C.white);
    } else {
      fillRect(img, 17, 5, 2, 2, C.orange);
    }
    frames.push(img);
  }
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss,
    sourceId: usedOss ? 'superpowers_asset_packs' : 'generated_synth',
  };
}

function makeGadgetAutoTurretFrames(oss) {
  const cellW = 48;
  const cellH = 48;
  const hasBase = Boolean(oss.spTurret.base);
  const hasHead = Boolean(oss.spTurret['1']);
  const usedOss = hasBase && hasHead;

  const makeFrame = (recoilX, flash, overcharge) => {
    const img = createImage(cellW, cellH);
    // Tripod legs anchored at y=42..44 (leaving 2px bottom pad after 1px outline at y=45)
    drawLine(img, 22, 28, 13, 42, C.gunDark, 3);
    drawLine(img, 26, 28, 35, 42, C.gunDark, 3);
    drawLine(img, 24, 29, 24, 43, C.gunMid, 3);
    fillRect(img, 11, 42, 5, 2, C.slateDark);
    fillRect(img, 32, 42, 5, 2, C.slateDark);
    fillRect(img, 22, 43, 4, 2, C.slateDark);

    // Pedestal collar derived from Superpowers turret base if available
    if (hasBase) {
      let baseClean = stripDarkOutline(oss.spTurret.base, { lumaMax: 35 });
      const bBbox = getOpaqueBBox(baseClean, 128);
      if (!bBbox.empty) {
        baseClean = cropImage(baseClean, bBbox.minX, bBbox.minY, bBbox.width, bBbox.height);
        const collar = resizeImage(baseClean, 18, 12);
        blitImage(img, collar, 15, 23);
      }
    } else {
      fillEllipse(img, 24, 29, 8, 5, C.slateDark);
    }

    // Right-facing dual-barrel sentry head centered around (24, 21)
    const hx = 14 + recoilX;
    fillRect(img, hx, 16, 18, 11, overcharge ? C.cobaltDark : C.gunMid);
    fillRect(img, hx + 1, 16, 15, 3, overcharge ? C.cyan : C.steelBright);
    fillRect(img, hx + 4, 13, 7, 3, C.amber); // ammo drum top
    setPx(img, hx + 14, 19, overcharge ? C.cyanIce : C.red); // optical sensor
    // Twin gun barrels extending to x=43..44, y=22
    fillRect(img, hx + 18, 19, 11, 2, C.steelBright);
    fillRect(img, hx + 18, 23, 11, 2, C.gunLight);
    if (flash) {
      fillRect(img, 41, 18, 4, 8, C.yellow);
      fillRect(img, 42, 20, 4, 4, C.white);
    }
    if (overcharge) {
      fillRect(img, hx + 2, 21, 12, 2, C.cyan);
    }
    return img;
  };

  return {
    frames: finalizeOutlinedFrames([
      makeFrame(0, false, false),
      makeFrame(-2, true, false),
      makeFrame(0, false, true),
      makeFrame(-1, false, true),
    ]),
    usedOss,
    sourceId: usedOss ? 'superpowers_asset_packs' : 'generated_synth',
  };
}

function makeGadgetHealDroneFrames() {
  const cellW = 32;
  const cellH = 32;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const bob = f === 1 ? -1 : f === 3 ? 1 : 0;
    // Hovering emerald-white med-drone at (16, 16+bob)
    const rx = f % 2 === 0 ? 5 : 2;
    fillRect(img, 8 - rx, 8 + bob, rx * 2 + 1, 2, C.cyanIce); // left rotor blur
    fillRect(img, 24 - rx, 8 + bob, rx * 2 + 1, 2, C.cyanIce); // right rotor blur
    fillRect(img, 7, 10 + bob, 3, 3, C.gunDark);
    fillRect(img, 22, 10 + bob, 3, 3, C.gunDark);
    fillEllipse(img, 16, 16 + bob, 9, 6, C.steelBright);
    fillEllipse(img, 16, 15 + bob, 8, 4, C.white);
    // Emerald cross insignia
    fillRect(img, 15, 13 + bob, 2, 6, C.emerald);
    fillRect(img, 13, 15 + bob, 6, 2, C.emerald);
    // Bottom emitter pod pointing +X/down
    fillRect(img, 13, 21 + bob, 6, 3, C.cobaltDark);
    fillRect(img, 15, 22 + bob, 2, 2, f === 2 ? C.cyanIce : C.cyan);
    frames.push(img);
  }
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeDualPistolsFrames() {
  const cellW = 34;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const kickA = f === 1 ? -2 : 0;
    const kickB = f === 3 ? -2 : 0;
    // Lower/background pistol
    fillRect(img, 5 + kickB, 9, 4, 6, C.woodDark);
    fillRect(img, 5 + kickB, 8, 17, 4, C.gunMid);
    fillRect(img, 7 + kickB, 8, 15, 2, C.steelBright);
    // Foreground upper pistol staggered forward
    fillRect(img, 10 + kickA, 6, 4, 6, C.woodMid);
    fillRect(img, 10 + kickA, 4, 18, 4, C.cobaltDark);
    fillRect(img, 11 + kickA, 4, 17, 2, C.cyanIce);
    if (f === 1) {
      fillRect(img, 28, 4, 4, 4, C.yellow);
      setPx(img, 31, 5, C.white);
    } else if (f === 3) {
      fillRect(img, 23, 8, 4, 4, C.orange);
      setPx(img, 26, 9, C.yellow);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeMinigunFrames() {
  const cellW = 42;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = f === 1 ? -1 : f === 2 ? -2 : 0;
    // Top handle + heavy motor housing
    fillRect(img, 7 + r, 4, 9, 2, C.gunDark);
    fillRect(img, 5 + r, 6, 15, 8, C.oliveDark);
    fillRect(img, 7 + r, 7, 11, 5, C.oliveMid);
    // Yellow ammo belt feed
    fillRect(img, 11 + r, 13, 6, 3, C.gold);
    // Rotating 6-barrel cluster facing +X
    const alt = f % 2 === 1;
    fillRect(img, 20 + r, 6, 17, 2, alt ? C.steelBright : C.gunLight);
    fillRect(img, 20 + r, 9, 17, 2, alt ? C.gunMid : C.steelBright);
    fillRect(img, 20 + r, 12, 17, 2, alt ? C.gunLight : C.gunDark);
    fillRect(img, 25 + r, 6, 2, 8, C.amber);
    fillRect(img, 33 + r, 6, 2, 8, C.gunDark);
    if (f === 1 || f === 3) {
      fillRect(img, 37, 6, 4, 7, C.orange);
      fillRect(img, 38, 8, 3, 3, C.white);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeSawLauncherFrames() {
  const cellW = 38;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = f === 1 ? -2 : f === 2 ? -1 : 0;
    // Industrial hazard frame + grip
    fillRect(img, 7 + r, 10, 4, 6, C.woodDark);
    fillRect(img, 6 + r, 6, 24, 6, C.gunDark);
    fillRect(img, 8 + r, 7, 20, 3, C.orange);
    // Exposed front saw rail + spinning serrated disc loaded in slot
    fillRect(img, 22 + r, 5, 11, 8, C.gunMid);
    if (f < 2 || f === 3) {
      fillEllipse(img, 30 + r, 9, 5, 5, C.steelBright);
      fillEllipse(img, 30 + r, 9, 2, 2, C.red);
      if (f % 2 === 0) {
        setPx(img, 25 + r, 4, C.white);
        setPx(img, 35 + r, 14, C.white);
      } else {
        setPx(img, 35 + r, 4, C.white);
        setPx(img, 25 + r, 14, C.white);
      }
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeFlamethrowerFrames() {
  const cellW = 38;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = f === 1 ? -1 : 0;
    // Fuel canister underbarrel + stock
    fillRect(img, 5 + r, 7, 17, 5, C.crimson);
    fillRect(img, 8 + r, 11, 12, 5, C.red);
    fillRect(img, 10 + r, 12, 8, 2, C.orange);
    // Pipe & brass igniter nozzle
    fillRect(img, 20 + r, 7, 12, 3, C.gunLight);
    fillRect(img, 31 + r, 6, 3, 5, C.amber);
    // Live pilot flame (flares on fire frames)
    const flare = f === 1 || f === 2 ? 4 : 2;
    fillEllipse(img, 35, 8, flare, f === 1 ? 3 : 2, C.orange);
    fillRect(img, 34, 8, 2, 1, C.yellow);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeCryoCannonFrames() {
  const cellW = 38;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = f === 1 ? -2 : f === 2 ? -1 : 0;
    // Frost-white armored receiver + glowing cyan coolant tank
    fillRect(img, 6 + r, 9, 4, 6, C.cobaltDark);
    fillRect(img, 6 + r, 5, 22, 6, C.steelBright);
    fillRect(img, 10 + r, 7, 10, 4, C.blue);
    fillRect(img, 12 + r, 8, 7, 2, C.cyan);
    // Twin emitter coils
    fillRect(img, 27 + r, 5, 7, 2, C.cyanIce);
    fillRect(img, 27 + r, 10, 7, 2, C.cyan);
    if (f === 1 || f === 3) {
      fillEllipse(img, 35, 8, 3, 3, C.cyanIce);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeGravityGunFrames() {
  const cellW = 38;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = f === 1 ? -2 : 0;
    // Obsidian/violet chassis
    fillRect(img, 7 + r, 9, 4, 6, C.gunDark);
    fillRect(img, 6 + r, 6, 19, 6, C.violetDark);
    fillRect(img, 9 + r, 7, 13, 4, C.violet);
    // Open front singularity prongs cradling orb
    fillRect(img, 24 + r, 4, 10, 2, C.gunLight);
    fillRect(img, 24 + r, 12, 10, 2, C.gunLight);
    fillEllipse(img, 31 + r, 9, f === 1 ? 4 : 3, f === 1 ? 4 : 3, C.magenta);
    fillEllipse(img, 31 + r, 9, 1.5, 1.5, C.cyanIce);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makePlasmaShotgunFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 5 + r, 9, 4, 6, C.gunDark);
    fillRect(img, 6 + r, 5, 22, 6, C.cobaltDark);
    fillRect(img, 10 + r, 6, 18, 4, C.blue);
    fillRect(img, 24 + r, 5, 9, 3, C.cyan);
    fillRect(img, 24 + r, 9, 9, 3, C.steelBright);
    if (f === 1) {
      fillEllipse(img, 34, 8, 3, 4, C.cyanIce);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeTwinSmgFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f % 2 === 1 ? -2 : 0;
    fillRect(img, 6 + r, 8, 4, 7, C.gunDark);
    fillRect(img, 8 + r, 5, 21, 5, C.slateDark);
    fillRect(img, 11 + r, 6, 17, 3, C.emerald);
    fillRect(img, 18 + r, 10, 4, 5, C.gold);
    fillRect(img, 27 + r, 5, 6, 2, C.steelBright);
    fillRect(img, 27 + r, 8, 6, 2, C.gunLight);
    if (f === 1 || f === 3) {
      fillRect(img, 33, 5, 4, 4, C.yellow);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeIonBeamFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 5 + r, 9, 5, 6, C.gunDark);
    fillRect(img, 6 + r, 5, 24, 6, C.slateDark);
    fillRect(img, 10 + r, 7, 18, 3, C.cyan);
    fillRect(img, 27 + r, 4, 8, 2, C.cyanIce);
    fillRect(img, 27 + r, 10, 8, 2, C.blue);
    if (f === 1 || f === 2) {
      fillRect(img, 32, 7, 5, 2, C.white);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeClusterRpgFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 6 + r, 10, 5, 5, C.woodDark);
    fillRect(img, 4 + r, 5, 27, 7, C.oliveDark);
    fillRect(img, 6 + r, 6, 23, 5, C.oliveMid);
    fillRect(img, 14 + r, 6, 4, 5, C.orange);
    fillRect(img, 29 + r, 4, 5, 9, C.red);
    if (f === 1) {
      fillEllipse(img, 35, 8, 3, 4, C.yellow);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeTeslaCoilFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -1 : 0;
    fillRect(img, 6 + r, 9, 4, 6, C.gunDark);
    fillRect(img, 6 + r, 6, 20, 6, C.cobaltDark);
    fillRect(img, 16 + r, 4, 3, 9, C.cyanIce);
    fillRect(img, 21 + r, 4, 3, 9, C.cyan);
    fillRect(img, 26 + r, 6, 8, 4, C.gold);
    if (f === 1 || f === 3) {
      fillEllipse(img, 35, 8, 2.5, 3.5, C.cyanIce);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeVoidCannonFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 5 + r, 9, 5, 6, C.black);
    fillRect(img, 6 + r, 5, 22, 7, C.violetDark);
    fillRect(img, 9 + r, 6, 17, 5, C.violet);
    fillRect(img, 25 + r, 4, 9, 3, C.magenta);
    fillRect(img, 25 + r, 10, 9, 3, C.crimson);
    fillEllipse(img, 31 + r, 8, f === 1 ? 3.5 : 2.5, f === 1 ? 3.5 : 2.5, C.cyan);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeBlizzardCarbineFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -1 : 0;
    fillRect(img, 6 + r, 9, 4, 6, C.cobaltDark);
    fillRect(img, 6 + r, 5, 24, 6, C.blue);
    fillRect(img, 10 + r, 6, 16, 4, C.steelBright);
    fillRect(img, 22 + r, 5, 11, 5, C.cyan);
    fillRect(img, 14 + r, 4, 4, 8, f % 2 === 0 ? C.cyanIce : C.cyan);
    if (f === 1 || f === 3) {
      fillEllipse(img, 35, 8, 2.5, 3, C.cyanIce);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeRicochetDiscFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -1 : 0;
    fillRect(img, 5 + r, 9, 4, 6, C.slateDark);
    fillRect(img, 6 + r, 5, 21, 7, C.gunMid);
    fillRect(img, 12 + r, 4, 10, 3, C.violet);
    fillRect(img, 23 + r, 5, 9, 6, C.steelBright);
    fillEllipse(img, 30 + (f === 1 ? 2 : 0), 8, 3.5, 3.5, f % 2 === 0 ? C.magenta : C.cyanIce);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makePhantomBowFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const pull = f === 1 ? 3 : 0;
    fillRect(img, 14, 2, 4, 14, C.violetDark);
    fillRect(img, 17, 2, 5, 4, C.magenta);
    fillRect(img, 17, 12, 5, 4, C.magenta);
    fillRect(img, 12 - pull, 4, 2, 10, C.cyan);
    fillRect(img, 12 - pull, 7, 19, 3, C.steelBright);
    fillEllipse(img, 32, 8, 2.5, 2.5, f === 1 ? C.white : C.cyanIce);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeMagmaSpitterFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 5 + r, 9, 5, 6, C.black);
    fillRect(img, 6 + r, 5, 23, 7, C.crimsonDark);
    fillRect(img, 10 + r, 6, 15, 5, C.red);
    fillRect(img, 13 + r, 4, 7, 3, f % 2 === 0 ? C.orange : C.yellow);
    fillRect(img, 27 + r, 5, 7, 6, C.gold);
    if (f === 1) {
      fillEllipse(img, 35, 8, 3, 3.5, C.yellow);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeChronosRifleFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -1 : 0;
    fillRect(img, 5 + r, 9, 4, 6, C.slateDark);
    fillRect(img, 6 + r, 6, 26, 5, C.oliveDark);
    fillRect(img, 11 + r, 6, 18, 4, C.cobaltDark);
    fillRect(img, 15 + r, 4, 3, 8, C.mint);
    fillRect(img, 22 + r, 4, 3, 8, C.cyan);
    fillRect(img, 29 + r, 6, 6, 4, f === 1 ? C.cyanIce : C.emerald);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeOrbitalCannonFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(38, 18);
    const r = f === 1 ? -2 : 0;
    fillRect(img, 4 + r, 9, 5, 6, C.black);
    fillRect(img, 5 + r, 4, 26, 9, C.slateDark);
    fillRect(img, 8 + r, 5, 20, 6, C.gunDark);
    fillRect(img, 12 + r, 6, 14, 4, C.gold);
    fillRect(img, 27 + r, 3, 7, 11, C.gunLight);
    fillEllipse(img, 33 + r, 8, f === 1 ? 3.5 : 2.5, f === 1 ? 4 : 3, f === 1 ? C.white : C.orange);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

// ---------------------------------------------------------------------------
// Projectile & FX Generators (28 Sheets)
// ---------------------------------------------------------------------------

function makeFlameStreamOrbFrames() {
  const cellW = 20;
  const cellH = 14;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const r = 4.5 + (f % 2);
    fillEllipse(img, 9, 7, 8, r, rgba(228, 59, 68, 210), true);
    fillEllipse(img, 11, 7, 6, r - 1.2, C.orange, true);
    fillEllipse(img, 13, 7, 4, r - 2.2, C.yellow, true);
    fillRect(img, 12, 6, 3, 2, C.white, true);
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeCryoShardFrames() {
  const frames = [];
  for (let f = 0; f < 2; f++) {
    const img = createImage(20, 12);
    fillRect(img, 2, 5, 10, 2, C.blue);
    fillRect(img, 5, 4, 9, 4, C.cyan);
    fillRect(img, 11, 5, 6, 2, f === 0 ? C.cyanIce : C.white);
    setPx(img, 17, 6, C.white);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeSawDiscFrames() {
  const cellW = 18;
  const cellH = 18;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    fillEllipse(img, 9, 9, 6.5, 6.5, C.gunLight);
    fillEllipse(img, 9, 9, 5, 5, C.steelBright);
    fillEllipse(img, 9, 9, 2.2, 2.2, C.orange);
    // Rotating outer teeth pixels
    const diag = f % 2 === 1;
    if (diag) {
      fillRect(img, 3, 3, 2, 2, C.white);
      fillRect(img, 13, 3, 2, 2, C.white);
      fillRect(img, 3, 13, 2, 2, C.white);
      fillRect(img, 13, 13, 2, 2, C.white);
    } else {
      fillRect(img, 8, 1, 2, 2, C.white);
      fillRect(img, 8, 15, 2, 2, C.white);
      fillRect(img, 1, 8, 2, 2, C.white);
      fillRect(img, 15, 8, 2, 2, C.white);
    }
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeGravityOrbFrames() {
  const cellW = 22;
  const cellH = 22;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    fillEllipse(img, 11, 11, 8 + (f % 2), 8 + (f % 2), rgba(104, 56, 108, 190), true);
    fillEllipse(img, 11, 11, 5.5, 5.5, rgba(181, 80, 136, 230), true);
    fillEllipse(img, 11, 11, 3, 3, C.cyan, true);
    fillRect(img, 10, 10, 2, 2, C.white, true);
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeBulletSmallFrames() {
  const f0 = createImage(12, 8);
  fillRect(f0, 2, 3, 8, 2, C.gold);
  fillRect(f0, 7, 3, 3, 2, C.ivory);
  const f1 = createImage(12, 8);
  fillRect(f1, 2, 3, 8, 2, C.yellow);
  fillRect(f1, 8, 3, 2, 2, C.white);
  return { frames: finalizeOutlinedFrames([f0, f1]), usedOss: false, sourceId: 'generated_synth' };
}

function makeBulletMedFrames() {
  const f0 = createImage(12, 8);
  fillRect(f0, 1, 2, 10, 4, C.amber);
  fillRect(f0, 4, 3, 6, 2, C.yellow);
  fillRect(f0, 8, 3, 3, 2, C.white);
  const f1 = createImage(12, 8);
  fillRect(f1, 1, 2, 10, 4, C.orange);
  fillRect(f1, 3, 3, 7, 2, C.ivory);
  return { frames: finalizeOutlinedFrames([f0, f1]), usedOss: false, sourceId: 'generated_synth' };
}

function makeShotgunPelletFrames() {
  const f0 = createImage(12, 8);
  fillRect(f0, 2, 3, 7, 2, C.orange);
  fillRect(f0, 6, 3, 3, 2, C.ivory);
  const f1 = createImage(12, 8);
  fillRect(f1, 3, 3, 6, 2, C.yellow);
  fillRect(f1, 7, 3, 2, 2, C.white);
  return { frames: finalizeOutlinedFrames([f0, f1]), usedOss: false, sourceId: 'generated_synth' };
}

function makePlasmaBoltFrames(oss) {
  const cellW = 24;
  const cellH = 14;
  const raw = oss.spCombat['laser-bolt-32px_strip6.png'];
  const usedOss = Boolean(raw);
  const frames = [];

  if (raw) {
    const sliced = sliceSpriteSheet(raw, 32, 32, { count: Math.floor(raw.width / 32) });
    for (const idx of [0, 1, 2, 4]) {
      const src = sliced[Math.min(idx, sliced.length - 1)];
      const tinted = tintImageByLuma(src, [C.cobaltDark, C.blue, C.cyan, C.white]);
      const bbox = getOpaqueBBox(tinted, 32);
      const out = createImage(cellW, cellH);
      if (!bbox.empty) {
        const crop = cropImage(tinted, bbox.minX, bbox.minY, bbox.width, bbox.height);
        const w = Math.min(20, crop.width);
        const h = Math.min(12, crop.height);
        const scaled = resizeImage(crop, w, h);
        blitImage(out, scaled, Math.round((cellW - w) / 2), Math.round((cellH - h) / 2));
      }
      // Enforce crisp horizontal +X energy bolt core
      fillEllipse(out, 12, 7, 9, 3, rgba(44, 232, 245, 220), true);
      fillEllipse(out, 15, 7, 6, 1.8, C.white, true);
      frames.push(out);
    }
  } else {
    for (let f = 0; f < 4; f++) {
      const out = createImage(cellW, cellH);
      fillEllipse(out, 11, 7, 9 + (f % 2), 4, rgba(0, 149, 233, 180), true);
      fillEllipse(out, 13, 7, 7, 2.5, C.cyan, true);
      fillRect(out, 9, 6, 9, 2, C.white, true);
      frames.push(out);
    }
  }

  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_combat' : 'generated_synth' };
}

function makeRocketFrames(oss) {
  const cellW = 24;
  const cellH = 16;
  const usedOss = Boolean(oss.rocketSheet && oss.rocketSheet.width >= 96 && oss.rocketSheet.height >= 96);
  const frames = [];

  for (let f = 0; f < 2; f++) {
    const img = createImage(cellW, cellH);
    if (usedOss) {
      // Row 4 in 6x16 grid of 16x16 tiles is right-facing (+X) rocket
      const tile = cropImage(oss.rocketSheet, (1 + f) * 16, 4 * 16, 16, 16);
      blitImage(img, tile, 4, 0);
    }
    // Ensure crisp warhead + tail exhaust facing +X
    fillRect(img, 7, 6, 10, 4, C.oliveMid);
    fillRect(img, 8, 6, 8, 1, C.steelBright);
    fillRect(img, 16, 6, 4, 4, C.red); // red warhead cone
    fillRect(img, 19, 7, 2, 2, C.ivory);
    fillRect(img, 7, 5, 2, 6, C.gunDark); // tail fins
    // Exhaust plume on tail
    fillRect(img, f === 0 ? 3 : 2, 6, f === 0 ? 4 : 5, 4, C.orange);
    fillRect(img, f === 0 ? 4 : 3, 7, 3, 2, C.yellow);
    frames.push(img);
  }

  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss,
    sourceId: usedOss ? 'oga_rocket_16dir' : 'generated_synth',
  };
}

function makeFragGrenadeProjFrames(oss) {
  const cellW = 16;
  const cellH = 16;
  const usedOss = Boolean(oss.spGrenade);
  const base = createImage(cellW, cellH);
  if (usedOss) {
    blitImage(base, oss.spGrenade, Math.round((cellW - oss.spGrenade.width) / 2), Math.round((cellH - oss.spGrenade.height) / 2));
  } else {
    fillEllipse(base, 8, 9, 4, 4.5, C.oliveMid);
    fillRect(base, 6, 3, 4, 2, C.gunLight);
  }
  const frames = [0, 90, 180, 270].map((deg, idx) => {
    const rot = rotateImageNearest(base, (deg * Math.PI) / 180, 8, 8);
    if (idx % 2 === 0) setPx(rot, 12, 3, C.yellow);
    else setPx(rot, 3, 12, C.orange);
    return rot;
  });
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss,
    sourceId: usedOss ? 'superpowers_asset_packs' : 'generated_synth',
  };
}

function makeStunCanisterProjFrames() {
  const cellW = 16;
  const cellH = 16;
  const base = createImage(cellW, cellH);
  fillRect(base, 5, 3, 6, 10, C.steelBright);
  fillRect(base, 5, 6, 6, 4, C.cyan);
  fillRect(base, 6, 2, 4, 2, C.gunDark);
  const frames = [0, 90, 180, 270].map((deg, idx) => {
    const rot = rotateImageNearest(base, (deg * Math.PI) / 180, 8, 8);
    if (idx % 2 === 1) setPx(rot, 8, 8, C.cyanIce);
    return rot;
  });
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeProxMineProjFrames() {
  const cellW = 16;
  const cellH = 16;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    fillEllipse(img, 8, 9, 5.5, 4, C.slateDark);
    fillEllipse(img, 8, 8, 4.5, 3, C.amber);
    fillRect(img, 5, 7, 6, 2, C.gunLight);
    // f0: arming orange, f1: armed dark red, f2: blink gold, f3: trigger red-white
    const led = f === 0 ? C.amber : f === 1 ? C.crimson : f === 2 ? C.gold : C.red;
    fillRect(img, 7, 6, 2, 2, led);
    if (f === 3) setPx(img, 8, 6, C.white);
    frames.push(img);
  }
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeEnemyOrbFrames(oss) {
  const cellW = 16;
  const cellH = 16;
  const rawTile = oss.kenneyShmup['tile_0002.png'];
  let tileFit = null;
  if (rawTile) {
    const clean = stripDarkOutline(rawTile, { lumaMax: 35 });
    const bb = getOpaqueBBox(clean, 128);
    if (!bb.empty) {
      tileFit = resizeImage(cropImage(clean, bb.minX, bb.minY, bb.width, bb.height), 10, 10);
    }
  }
  const usedOss = Boolean(tileFit);
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    if (tileFit && f % 2 === 0) {
      const tinted = tintImageByLuma(tileFit, [C.crimsonDark, C.red, C.orange, C.white]);
      blitImage(img, tinted, 3, 3);
    }
    const r = f === 1 || f === 3 ? 4.5 : 3.8;
    fillEllipse(img, 8, 8, r, r, C.red);
    fillEllipse(img, 8, 8, r - 1.4, r - 1.4, C.orange);
    fillEllipse(img, 7.5, 7.5, 1.8, 1.8, f % 2 === 0 ? C.white : C.ivory);
    frames.push(img);
  }
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss,
    sourceId: usedOss ? 'kenney_pixel_shmup' : 'generated_synth',
  };
}

function makeGadgetBombsFrames(oss) {
  const cellW = 32;
  const cellH = 32;
  const bombSprite = oss.spBomb ? prepareBombFit(oss.spBomb, 21) : null;
  const usedOss = Boolean(bombSprite);
  const tints = [
    [C.cobaltDark, C.blue, C.cyan, C.cyanIce], // f0 stun
    [C.crimsonDark, C.crimson, C.red, C.gold], // f1 cluster
    [C.amber, C.orange, C.yellow, C.white], // f2 sub-bomblet
    [C.crimsonDark, C.red, C.orange, C.white], // f3 primed flash
  ];
  const frames = tints.map((ramp, idx) => {
    const img = createImage(cellW, cellH);
    if (bombSprite) {
      const tinted = tintImageByLuma(bombSprite, ramp);
      blitImage(img, tinted, Math.round((cellW - bombSprite.width) / 2), Math.round((cellH - bombSprite.height) / 2));
    } else {
      fillEllipse(img, 16, 17, 8, 8, ramp[1]);
      fillEllipse(img, 14, 15, 5, 5, ramp[2]);
      fillRect(img, 13, 7, 6, 3, C.gunMid);
    }
    fillRect(img, 17, 4 + (idx % 2), 3, 3, idx % 2 === 0 ? C.yellow : C.white);
    return img;
  });
  return {
    frames: finalizeOutlinedFrames(frames),
    usedOss,
    sourceId: usedOss ? 'superpowers_asset_packs' : 'generated_synth',
  };
}

function makeMuzzleFlashFrames(oss, small = false, plasma = false) {
  const cellW = small ? 20 : 32;
  const cellH = small ? 16 : 24;
  const cy = Math.floor(cellH / 2);
  const srcName = small ? 'muzzle-flash-16px_strip5.png' : 'muzzle-flash-32px_strip5.png';
  const raw = oss.spCombat[srcName];
  const usedOss = Boolean(raw);
  const tileSize = small ? 16 : 32;
  const frames = [];

  const sliced = raw ? sliceSpriteSheet(raw, tileSize, tileSize, { count: Math.floor(raw.width / tileSize) }) : [];
  const pickIndices = [0, 1, 3];

  for (let i = 0; i < 3; i++) {
    const img = createImage(cellW, cellH);
    if (sliced.length > 0) {
      let src = sliced[Math.min(pickIndices[i], sliced.length - 1)];
      if (plasma) {
        src = tintImageByLuma(src, [C.cobaltDark, C.blue, C.cyan, C.white]);
      }
      const bbox = getOpaqueBBox(src, 16);
      if (!bbox.empty) {
        const crop = cropImage(src, bbox.minX, bbox.minY, bbox.width, bbox.height);
        const w = Math.min(cellW - 2, crop.width);
        const h = Math.min(cellH - 2, crop.height);
        const fit = w === crop.width && h === crop.height ? crop : resizeImage(crop, w, h);
        blitImage(img, fit, small ? 2 : 3, Math.round((cellH - h) / 2), { alphaBlend: true });
      }
    } else {
      const len = (small ? 14 : 23) - i * 4;
      const spread = (small ? 5 : 8) - i * 2;
      const outer = plasma ? C.blue : C.orange;
      const mid = plasma ? C.cyan : C.yellow;
      drawPolygon(
        img,
        [
          [2, cy - 2],
          [2 + len, cy],
          [2, cy + 2],
        ],
        outer,
        true
      );
      drawPolygon(
        img,
        [
          [3, cy - spread],
          [6, cy],
          [3, cy + spread],
        ],
        outer,
        true
      );
      fillEllipse(img, 6, cy, Math.max(2, len * 0.4), Math.max(1.5, spread * 0.45), mid, true);
      fillEllipse(img, 5, cy, 3, 1.8, C.white, true);
    }
    frames.push(img);
  }

  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_combat' : 'generated_synth' };
}

function makeImpactSparkFrames(oss) {
  const cellW = 24;
  const cellH = 24;
  const raw = oss.spEffects['hit-spark-32px_strip6.png'];
  const usedOss = Boolean(raw);
  const sliced = raw ? sliceSpriteSheet(raw, 32, 32, { count: Math.floor(raw.width / 32) }) : [];
  const frames = [];

  for (let i = 0; i < 4; i++) {
    const img = createImage(cellW, cellH);
    if (sliced.length > 0) {
      const src = sliced[Math.min(i * 2, sliced.length - 1)];
      const crop = cropImage(src, 4, 4, 24, 24);
      blitImage(img, crop, 0, 0, { alphaBlend: true });
    } else {
      const r = 4 + i * 2;
      drawLine(img, 12 - r, 12 - r, 12 + r, 12 + r, C.yellow, 1, true);
      drawLine(img, 12 - r, 12 + r, 12 + r, 12 - r, C.orange, 1, true);
      fillEllipse(img, 12, 12, Math.max(1, 3 - i), Math.max(1, 3 - i), C.white, true);
    }
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_effects' : 'generated_synth' };
}

function makeCasingFrames(isShotgun) {
  const cellW = 8;
  const cellH = 8;
  const base = createImage(cellW, cellH);
  if (isShotgun) {
    fillRect(base, 2, 3, 1, 2, C.gold);
    fillRect(base, 3, 3, 3, 2, C.red);
  } else {
    fillRect(base, 2, 3, 4, 2, C.gold);
    setPx(base, 5, 3, C.yellow);
  }
  const frames = [0, 45, 90, 135].map((deg) => rotateImageNearest(base, (deg * Math.PI) / 180, 3.5, 3.5));
  return { frames: finalizeOutlinedFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeExplosionHeFrames(oss) {
  const cellW = 96;
  const cellH = 96;
  const expRaw = oss.spEffects['explosion-32px_strip10.png'];
  const smokeRaw = oss.spEffects['smoke-puff-32px_strip8.png'];
  const usedOss = Boolean(expRaw);
  const expSlices = expRaw ? sliceSpriteSheet(expRaw, 32, 32, { count: Math.floor(expRaw.width / 32) }) : [];
  const smokeSlices = smokeRaw ? sliceSpriteSheet(smokeRaw, 32, 32, { count: Math.floor(smokeRaw.width / 32) }) : [];
  const rng = mulberry32(1201);
  const frames = [];

  for (let f = 0; f < 8; f++) {
    const img = createImage(cellW, cellH);
    const t = f / 7;
    const cy = 50;

    // Layer 1: scaled SpritePilot explosion + smoke plumes
    if (expSlices.length > 0) {
      const idx = Math.min(expSlices.length - 1, Math.round((f / 7) * (expSlices.length - 1)));
      const scaled = scaleImage(expSlices[idx], f < 3 ? 2 : 3);
      blitImage(img, scaled, Math.round((cellW - scaled.width) / 2), Math.round(cy - scaled.height / 2), {
        alphaBlend: true,
      });
    }
    if (smokeSlices.length > 0 && f >= 2) {
      const sIdx = Math.min(smokeSlices.length - 1, f - 2);
      const smokeScaled = scaleImage(smokeSlices[sIdx], 3);
      for (let i = 0; i < smokeScaled.data.length; i += 4) {
        smokeScaled.data[i + 3] = Math.round(smokeScaled.data[i + 3] * (1 - t * 0.45));
      }
      blitImage(img, smokeScaled, 0, Math.round(cy - 48), { alphaBlend: true });
    }

    // Layer 2: sharp radial shock ring, luminous core, & high-velocity embers
    if (f <= 2) {
      const ringR = 16 + f * 12;
      strokeEllipse(img, 48, cy, ringR, ringR * 0.72, rgba(254, 231, 97, 210 - f * 45), 2.2, true);
    }
    const coreR = Math.max(4, (1 - Math.abs(t - 0.18) * 1.35) * 32);
    if (f <= 4) {
      fillEllipse(img, 48, cy, coreR, coreR * 0.9, rgba(247, 118, 34, Math.round(230 * (1 - t * 0.75))), true);
      fillEllipse(img, 48, cy - 1, coreR * 0.65, coreR * 0.6, rgba(254, 231, 97, Math.round(245 * (1 - t * 0.7))), true);
      if (f <= 2) {
        fillEllipse(img, 48, cy - 2, coreR * 0.35, coreR * 0.32, C.white, true);
      }
    }
    // Embers flying outward
    for (let p = 0; p < 10; p++) {
      const ang = (p / 10) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const dist = (0.25 + t * 0.85) * 40;
      const ex = 48 + Math.cos(ang) * dist;
      const ey = cy + Math.sin(ang) * dist * 0.85 - t * 6;
      const alpha = Math.round(255 * (1 - t * 0.8));
      const eCol = p % 2 === 0 ? rgba(254, 231, 97, alpha) : rgba(247, 118, 34, alpha);
      fillRect(img, ex, ey, f < 4 ? 2 : 1, f < 4 ? 2 : 1, eCol, true);
    }
    frames.push(img);
  }

  return {
    frames: finalizeVfxFrames(frames),
    usedOss,
    sourceId: usedOss ? 'spritepilot_effects' : 'generated_synth',
  };
}

function makeExplosionStunFrames(oss) {
  const cellW = 96;
  const cellH = 96;
  const critRaw = oss.spCombat['critical-hit-32px_strip8.png'];
  const ringRaw = oss.spCombat['shockwave-32px_strip8.png'];
  const usedOss = Boolean(critRaw || ringRaw);
  const critSlices = critRaw ? sliceSpriteSheet(critRaw, 32, 32, { count: Math.floor(critRaw.width / 32) }) : [];
  const ringSlices = ringRaw ? sliceSpriteSheet(ringRaw, 32, 32, { count: Math.floor(ringRaw.width / 32) }) : [];
  const rng = mulberry32(9912);
  const frames = [];

  for (let f = 0; f < 7; f++) {
    const img = createImage(cellW, cellH);
    const t = f / 6;
    const cy = 50;

    if (ringSlices.length > 0) {
      const idx = Math.min(ringSlices.length - 1, f);
      const tinted = tintImageByLuma(scaleImage(ringSlices[idx], 3), [C.cobaltDark, C.blue, C.cyan, C.white]);
      blitImage(img, tinted, 0, 2, { alphaBlend: true });
    }
    if (critSlices.length > 0 && f <= 4) {
      const tinted = tintImageByLuma(scaleImage(critSlices[Math.min(f, critSlices.length - 1)], 2), [
        C.cobaltDark,
        C.cyan,
        C.cyanIce,
        C.white,
      ]);
      blitImage(img, tinted, 16, 18, { alphaBlend: true });
    }

    // Sharp cyan-white EMP sphere + crackling lightning tendrils
    const rx = 14 + t * 30;
    const ry = rx * 0.72;
    strokeEllipse(img, 48, cy, rx, ry, rgba(44, 232, 245, Math.round(240 * (1 - t * 0.75))), 2.5, true);
    if (f <= 3) {
      fillEllipse(img, 48, cy, (1 - t * 0.5) * 18, (1 - t * 0.5) * 14, rgba(44, 232, 245, 190 - f * 35), true);
      fillEllipse(img, 48, cy, (1 - t * 0.5) * 9, (1 - t * 0.5) * 7, C.white, true);
    }
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + f * 0.5;
      const r1 = 8 + t * 14;
      const r2 = 22 + t * 22;
      const mx = 48 + Math.cos(ang + 0.2) * ((r1 + r2) * 0.5) + (rng() - 0.5) * 5;
      const my = cy + Math.sin(ang + 0.2) * ((r1 + r2) * 0.4) + (rng() - 0.5) * 5;
      const ex = 48 + Math.cos(ang) * r2;
      const ey = cy + Math.sin(ang) * r2 * 0.78;
      const a = Math.round(255 * (1 - t * 0.65));
      drawLine(img, 48 + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.78, mx, my, rgba(44, 232, 245, a), 1, true);
      drawLine(img, mx, my, ex, ey, rgba(255, 255, 255, a), 1, true);
    }
    frames.push(img);
  }

  return {
    frames: finalizeVfxFrames(frames),
    usedOss,
    sourceId: usedOss ? 'spritepilot_combat' : 'generated_synth',
  };
}

function makeExplosionSmallFrames(oss) {
  const cellW = 32;
  const cellH = 32;
  const usedOss = oss.explosionSmall.length >= 5;
  const frames = [];

  if (usedOss) {
    for (let f = 0; f < 5; f++) {
      frames.push(scaleImage(oss.explosionSmall[f], 2));
    }
  } else {
    for (let f = 0; f < 5; f++) {
      const img = createImage(cellW, cellH);
      const r = 5 + f * 2.5;
      const fade = 1 - f / 5;
      fillEllipse(img, 16, 16, r, r, rgba(228, 59, 68, 220 * fade), true);
      fillEllipse(img, 16, 16, r * 0.7, r * 0.7, rgba(254, 174, 52, 240 * fade), true);
      if (f <= 2) fillEllipse(img, 16, 16, r * 0.4, r * 0.4, C.white, true);
      frames.push(img);
    }
  }

  return {
    frames: finalizeVfxFrames(frames),
    usedOss,
    sourceId: usedOss ? 'oga_16x16_explosion' : 'generated_synth',
  };
}

function makeCraterDecalsFrames() {
  const cellW = 64;
  const cellH = 40;
  const rng = mulberry32(5512);
  const configs = [
    { rim: C.woodDark, pit: C.slateDark, glow: null }, // desert earth pit
    { rim: C.gunDark, pit: C.black, glow: rgba(247, 118, 34, 120) }, // charcoal scorch
    { rim: C.cobaltDark, pit: C.slateDark, glow: rgba(44, 232, 245, 140) }, // cyan EMP scorch
  ];
  const frames = configs.map((cfg) => {
    const img = createImage(cellW, cellH);
    fillEllipse(img, 32, 20, 26, 14, rgba(cfg.rim[0], cfg.rim[1], cfg.rim[2], 170), true);
    fillEllipse(img, 32, 20, 17, 9, rgba(cfg.pit[0], cfg.pit[1], cfg.pit[2], 210), true);
    // Radial scorch fissures
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + rng() * 0.3;
      const rEnd = 22 + rng() * 7;
      drawLine(
        img,
        32 + Math.cos(ang) * 10,
        20 + Math.sin(ang) * 5,
        32 + Math.cos(ang) * rEnd,
        20 + Math.sin(ang) * rEnd * 0.55,
        rgba(cfg.pit[0], cfg.pit[1], cfg.pit[2], 180),
        1,
        true
      );
      if (cfg.glow) {
        drawLine(
          img,
          32 + Math.cos(ang) * 6,
          20 + Math.sin(ang) * 3,
          32 + Math.cos(ang) * 14,
          20 + Math.sin(ang) * 7,
          cfg.glow,
          1,
          true
        );
      }
    }
    return img;
  });
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeSmokePuffFrames(oss) {
  const raw = oss.spEffects['smoke-puff-32px_strip8.png'];
  const usedOss = Boolean(raw);
  let frames;
  if (usedOss) {
    frames = sliceSpriteSheet(raw, 32, 32, { count: 8 });
  } else {
    frames = [];
    for (let f = 0; f < 8; f++) {
      const img = createImage(32, 32);
      const r = 6 + f * 1.1;
      const a = Math.round(210 * (1 - f / 8));
      fillEllipse(img, 16, 16 - f, r, r * 0.85, rgba(139, 155, 180, a), true);
      fillEllipse(img, 15, 14 - f, r * 0.65, r * 0.55, rgba(192, 203, 220, a), true);
      frames.push(img);
    }
  }
  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_effects' : 'generated_synth' };
}

function makeDashDustFrames(oss) {
  const raw = oss.spEffects['landing-dust-32px_strip7.png'];
  const usedOss = Boolean(raw);
  let frames;
  if (usedOss) {
    frames = sliceSpriteSheet(raw, 32, 32, { count: 7 });
  } else {
    frames = [];
    for (let f = 0; f < 7; f++) {
      const img = createImage(32, 32);
      const spread = 5 + f * 2;
      const a = Math.round(220 * (1 - f / 7));
      fillEllipse(img, 16 - spread * 0.6, 23 - f * 0.5, 4 + f * 0.5, 3, rgba(228, 166, 114, a), true);
      fillEllipse(img, 16 + spread * 0.6, 23 - f * 0.5, 4 + f * 0.5, 3, rgba(228, 166, 114, a), true);
      frames.push(img);
    }
  }
  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_effects' : 'generated_synth' };
}

function makeStunStarFrames() {
  const cellW = 16;
  const cellH = 16;
  const drawStar = (bright) => {
    const img = createImage(cellW, cellH);
    const outer = bright ? C.yellow : C.gold;
    // Crisp 4-point cartoon pixel star + diagonal rays
    fillRect(img, 7, 2, 2, 12, outer);
    fillRect(img, 2, 7, 12, 2, outer);
    fillRect(img, 5, 5, 6, 6, bright ? C.ivory : C.yellow);
    fillRect(img, 7, 6, 2, 4, C.white);
    fillRect(img, 6, 7, 4, 2, C.white);
    setPx(img, 4, 4, C.gold);
    setPx(img, 11, 4, C.gold);
    setPx(img, 4, 11, C.gold);
    setPx(img, 11, 11, C.gold);
    return img;
  };
  return {
    frames: finalizeOutlinedFrames([drawStar(false), drawStar(true)]),
    usedOss: false,
    sourceId: 'generated_synth',
  };
}

function makeStunRingFrames(oss) {
  const cellW = 64;
  const cellH = 48;
  const raw = oss.spCombat['shockwave-32px_strip8.png'];
  const usedOss = Boolean(raw);
  const sliced = raw ? sliceSpriteSheet(raw, 32, 32, { count: 8 }) : [];
  const frames = [];

  for (let f = 0; f < 8; f++) {
    const img = createImage(cellW, cellH);
    const t = f / 7;
    if (sliced.length > 0) {
      const tinted = tintImageByLuma(sliced[f], [C.cobaltDark, C.blue, C.cyan, C.white]);
      const stretched = resizeImage(tinted, 64, 48);
      blitImage(img, stretched, 0, 0, { alphaBlend: true });
    }
    const rx = 8 + t * 22;
    const ry = rx * 0.62;
    const a = Math.round(255 * (1 - t * 0.72));
    strokeEllipse(img, 32, 24, rx, ry, rgba(44, 232, 245, a), 2.2, true);
    if (f <= 4) strokeEllipse(img, 32, 24, Math.max(2, rx - 2), Math.max(1.5, ry - 1.5), rgba(255, 255, 255, a), 1, true);
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss, sourceId: usedOss ? 'spritepilot_combat' : 'generated_synth' };
}

function makeEmpArcFrames() {
  const cellW = 48;
  const cellH = 24;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const rng = mulberry32(4100 + f * 37);
    const img = createImage(cellW, cellH);
    const pts = [[2, 12]];
    for (let x = 8; x <= 40; x += 6) {
      pts.push([x, 12 + (rng() - 0.5) * 14]);
    }
    pts.push([45, 12]);
    for (let i = 0; i < pts.length - 1; i++) {
      drawLine(img, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], C.cyan, 2, true);
      drawLine(img, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], C.white, 1, true);
    }
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeSlashCrescentFrames(oss) {
  const cellW = 96;
  const cellH = 96;
  const usedOss = Boolean(oss.spCombat['sword-slash-32px_strip7.png']);
  const frames = [];
  const halfAngle = (70 * Math.PI) / 180; // 140 deg total centered on +X
  for (let f = 0; f < 4; f++) {
    const img = createImage(cellW, cellH);
    const fade = Math.max(0.56, 1 - f * 0.14);
    const sweepProgress = f === 0 ? 0.65 : 1.0;
    const startAng = -halfAngle + (f >= 2 ? (f - 1) * 0.25 : 0);
    const endAng = -halfAngle + halfAngle * 2 * sweepProgress;
    const cx = 46;
    const cy = 48;
    for (let y = 2; y < cellH - 2; y++) {
      for (let x = 2; x < cellW - 2; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 20 || r > 46) continue;
        const ang = Math.atan2(dy, dx);
        if (ang < startAng || ang > endAng) continue;
        const angU = (ang - startAng) / Math.max(0.01, endAng - startAng);
        const taper = Math.sin(angU * Math.PI);
        const rOuter = 45;
        const bandWidth = Math.max(2, (20 - f * 3.5) * (0.25 + 0.75 * taper));
        const rInner = rOuter - bandWidth;
        if (r >= rInner && r <= rOuter) {
          const edgeRatio = (r - rInner) / Math.max(1, bandWidth);
          const col =
            edgeRatio > 0.78
              ? rgba(255, 255, 255, Math.round(255 * fade))
              : edgeRatio > 0.42
                ? rgba(44, 232, 245, Math.round(230 * fade))
                : rgba(0, 149, 233, Math.round(165 * fade));
          addGlowPx(img, x, y, col);
        }
      }
    }
    frames.push(img);
  }
  return {
    frames: finalizeVfxFrames(frames),
    usedOss,
    sourceId: usedOss ? 'spritepilot_combat' : 'generated_synth',
  };
}

function makeSlashScytheFrames() {
  const cellW = 160;
  const cellH = 160;
  const frames = [];
  const halfAngle = (110 * Math.PI) / 180; // 220 deg huge cleave centered on +X
  const cx = 76;
  const cy = 80;
  for (let f = 0; f < 6; f++) {
    const img = createImage(cellW, cellH);
    const fade = Math.max(0.55, 1 - Math.max(0, f - 1) * 0.11);
    const sweepEnd = f === 0 ? 0.45 : f === 1 ? 0.85 : 1.0;
    const startAng = -halfAngle + (f >= 3 ? (f - 2) * 0.35 : 0);
    const endAng = -halfAngle + halfAngle * 2 * sweepEnd;
    for (let y = 4; y < cellH - 4; y++) {
      for (let x = 4; x < cellW - 4; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < 28 || r > 76) continue;
        const ang = Math.atan2(dy, dx);
        if (ang < startAng || ang > endAng) continue;
        const u = (ang - startAng) / Math.max(0.01, endAng - startAng);
        const taper = Math.sin(u * Math.PI);
        const rOuter = 74;
        const bandWidth = Math.max(2, (32 - f * 4) * (0.2 + 0.8 * taper));
        const rInner = rOuter - bandWidth;
        if (r >= rInner && r <= rOuter) {
          const edgeRatio = (r - rInner) / Math.max(1, bandWidth);
          const col =
            edgeRatio > 0.84
              ? rgba(255, 241, 232, Math.round(255 * fade))
              : edgeRatio > 0.5
                ? rgba(228, 59, 68, Math.round(235 * fade))
                : rgba(181, 80, 136, Math.round(170 * fade));
          addGlowPx(img, x, y, col);
        }
      }
    }
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

function makeSlashShockFrames() {
  const cellW = 96;
  const cellH = 96;
  const frames = [];
  const halfAngle = (60 * Math.PI) / 180;
  const cx = 46;
  const cy = 48;
  for (let f = 0; f < 4; f++) {
    const rng = mulberry32(7200 + f * 91);
    const img = createImage(cellW, cellH);
    const fade = 1 - f * 0.2;
    const steps = 14;
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const ang = -halfAngle + (i / steps) * halfAngle * 2;
      const r = 34 + (rng() - 0.5) * 12;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (prev) {
        drawLine(img, prev[0], prev[1], px, py, rgba(44, 232, 245, Math.round(240 * fade)), 3, true);
        drawLine(img, prev[0], prev[1], px, py, rgba(255, 255, 255, Math.round(255 * fade)), 1, true);
      }
      prev = [px, py];
    }
    // Secondary crackle fork
    for (let k = 0; k < 5; k++) {
      const ang = (rng() - 0.5) * halfAngle * 1.8;
      const x1 = cx + Math.cos(ang) * 26;
      const y1 = cy + Math.sin(ang) * 26;
      const x2 = cx + Math.cos(ang) * 44;
      const y2 = cy + Math.sin(ang) * 44 + (rng() - 0.5) * 8;
      drawLine(img, x1, y1, x2, y2, rgba(44, 232, 245, Math.round(210 * fade)), 1, true);
    }
    frames.push(img);
  }
  return { frames: finalizeVfxFrames(frames), usedOss: false, sourceId: 'generated_synth' };
}

// ---------------------------------------------------------------------------
// Master Sprite Registry & Execution
// ---------------------------------------------------------------------------

async function main() {
  await fs.mkdir(WEAPONS_OUT_DIR, { recursive: true });
  await fs.mkdir(FX_OUT_DIR, { recursive: true });

  const sourcesDoc = await loadSourcesJson();
  const oss = await fetchOssAssets(sourcesDoc);
  console.log(
    `[w12] Mode=${OFFLINE ? 'OFFLINE' : 'ONLINE'} | OSS packs ready: ${
      oss.fetchedSources.size > 0 ? [...oss.fetchedSources].join(', ') : 'none (procedural fallbacks)'
    }`
  );

  const specs = [
    // --- 15 Weapons (database-ban-sung/sprites/weapons/*.png) ---
    {
      section: 'weapons',
      id: 'pistol',
      spriteKey: 'gun_pistol',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 24,
      cellH: 16,
      offX: -6,
      offY: -8,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [17, -2],
      pivot: { anchorX: 6, anchorY: 8, muzzleX: 23, muzzleY: 6, ejectX: 9, ejectY: 6, shoulderOffsetX: 6, shoulderLiftY: 8, shoulderR: 8 },
      build: () => makePistolFrames(oss),
    },
    {
      section: 'weapons',
      id: 'rifle',
      spriteKey: 'gun_rifle',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 40,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [28, -2],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 38, muzzleY: 7, ejectX: 15, ejectY: 7, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeRifleFrames(oss),
    },
    {
      section: 'weapons',
      id: 'smg',
      spriteKey: 'gun_smg',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 34,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [23, -2],
      pivot: { anchorX: 9, anchorY: 9, muzzleX: 32, muzzleY: 7, ejectX: 13, ejectY: 7, shoulderOffsetX: 9, shoulderLiftY: 9, shoulderR: 8 },
      build: () => makeSmgFrames(oss),
    },
    {
      section: 'weapons',
      id: 'shotgun',
      spriteKey: 'gun_shotgun',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 42,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [30, -2],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 40, muzzleY: 7, ejectX: 16, ejectY: 7, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeShotgunFrames(oss),
    },
    {
      section: 'weapons',
      id: 'grenade_launcher',
      spriteKey: 'w_frag_launcher',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 24,
      offX: -8,
      offY: -12,
      fps: 22,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [24, -2],
      pivot: { anchorX: 8, anchorY: 12, muzzleX: 32, muzzleY: 10, ejectX: 14, ejectY: 9, shoulderOffsetX: 8, shoulderLiftY: 12, shoulderR: 7 },
      build: () => makeFragLauncherFrames(),
    },
    {
      section: 'weapons',
      id: 'stun_launcher',
      spriteKey: 'w_stun_launcher',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 24,
      offX: -8,
      offY: -12,
      fps: 22,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [24, -2],
      pivot: { anchorX: 8, anchorY: 12, muzzleX: 32, muzzleY: 10, ejectX: 14, ejectY: 9, shoulderOffsetX: 8, shoulderLiftY: 12, shoulderR: 7 },
      build: () => makeStunLauncherFrames(),
    },
    {
      section: 'weapons',
      id: 'bazooka',
      spriteKey: 'w_triple_bazooka',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 40,
      cellH: 24,
      offX: -12,
      offY: -12,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [28, -2],
      pivot: { anchorX: 12, anchorY: 12, muzzleX: 40, muzzleY: 10, ejectX: 4, ejectY: 10, shoulderOffsetX: 12, shoulderLiftY: 12, shoulderR: 5 },
      build: () => makeTripleBazookaFrames(),
    },
    {
      section: 'weapons',
      id: 'mine_gun',
      spriteKey: 'w_mine_gun',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 24,
      offX: -8,
      offY: -12,
      fps: 22,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [22, -2],
      pivot: { anchorX: 8, anchorY: 12, muzzleX: 30, muzzleY: 10, ejectX: 14, ejectY: 10, shoulderOffsetX: 8, shoulderLiftY: 12, shoulderR: 7 },
      build: () => makeMineGunFrames(),
    },
    {
      section: 'weapons',
      id: 'plasma_rifle',
      spriteKey: 'plasma_rifle',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 16,
      offX: -8,
      offY: -10,
      fps: 20,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [30, 6],
      pivot: { anchorX: 8, anchorY: 10, muzzleX: 30, muzzleY: 6, ejectX: 14, ejectY: 7, shoulderOffsetX: 8, shoulderLiftY: 10, shoulderR: 8 },
      build: () => makePlasmaRifleFrames(),
    },
    {
      section: 'weapons',
      id: 'railgun',
      spriteKey: 'railgun_piercer',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 16,
      offX: -9,
      offY: -10,
      fps: 18,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [36, 7],
      pivot: { anchorX: 9, anchorY: 10, muzzleX: 36, muzzleY: 7, ejectX: 16, ejectY: 7, shoulderOffsetX: 9, shoulderLiftY: 10, shoulderR: 7 },
      build: () => makeRailgunFrames(),
    },
    {
      section: 'weapons',
      id: 'lightning_staff',
      spriteKey: 'lightning_staff',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 36,
      cellH: 14,
      offX: -10,
      offY: -7,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [34, 7],
      pivot: { anchorX: 10, anchorY: 7, muzzleX: 34, muzzleY: 7, ejectX: 28, ejectY: 7, shoulderOffsetX: 10, shoulderLiftY: 7, shoulderR: 6 },
      build: () => makeLightningStaffFrames(),
    },
    {
      section: 'weapons',
      id: 'arcane_book',
      spriteKey: 'arcane_book',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 20,
      cellH: 20,
      offX: -10,
      offY: -10,
      fps: 8,
      loop: true,
      outlineMode: '4conn',
      muzzleOffset: [16, 0],
      pivot: { anchorX: 10, anchorY: 10, muzzleX: 18, muzzleY: 10, ejectX: 10, ejectY: 10, shoulderOffsetX: 10, shoulderLiftY: 10, shoulderR: 16 },
      build: () => makeArcaneBookFrames(),
    },
    {
      section: 'weapons',
      id: 'crescent_blade',
      spriteKey: 'wpn_crescent_blade',
      weaponCategory: 'melee',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 48,
      cellH: 48,
      offX: -10,
      offY: -24,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [32, 0],
      pivot: { anchorX: 10, anchorY: 24, muzzleX: 42, muzzleY: 24, ejectX: 10, ejectY: 24, shoulderOffsetX: 10, shoulderLiftY: 24, shoulderR: 6 },
      build: () => makeCrescentBladeFrames(),
    },
    {
      section: 'weapons',
      id: 'reaper_scythe',
      spriteKey: 'wpn_reaper_scythe',
      weaponCategory: 'melee',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 64,
      cellH: 64,
      offX: -14,
      offY: -32,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [40, -10],
      pivot: { anchorX: 14, anchorY: 32, muzzleX: 54, muzzleY: 22, ejectX: 14, ejectY: 32, shoulderOffsetX: 14, shoulderLiftY: 32, shoulderR: 6 },
      build: () => makeReaperScytheFrames(),
    },
    {
      section: 'weapons',
      id: 'shock_baton',
      spriteKey: 'wpn_shock_baton',
      weaponCategory: 'melee',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 48,
      cellH: 48,
      offX: -10,
      offY: -24,
      fps: 30,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [30, 0],
      pivot: { anchorX: 10, anchorY: 24, muzzleX: 40, muzzleY: 24, ejectX: 10, ejectY: 24, shoulderOffsetX: 10, shoulderLiftY: 24, shoulderR: 7 },
      build: () => makeShockBatonFrames(),
    },
    {
      section: 'weapons',
      id: 'dual_pistols',
      spriteKey: 'gun_dual_pistols',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 34,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 18,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [29, 7],
      pivot: { anchorX: 9, anchorY: 9, muzzleX: 29, muzzleY: 7, ejectX: 14, ejectY: 6, shoulderOffsetX: 9, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeDualPistolsFrames(),
    },
    {
      section: 'weapons',
      id: 'minigun',
      spriteKey: 'gun_minigun',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 42,
      cellH: 18,
      offX: -11,
      offY: -10,
      fps: 24,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [39, 9],
      pivot: { anchorX: 11, anchorY: 10, muzzleX: 39, muzzleY: 9, ejectX: 14, ejectY: 13, shoulderOffsetX: 11, shoulderLiftY: 10, shoulderR: 8 },
      build: () => makeMinigunFrames(),
    },
    {
      section: 'weapons',
      id: 'saw_launcher',
      spriteKey: 'gun_saw_launcher',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 9],
      pivot: { anchorX: 9, anchorY: 9, muzzleX: 35, muzzleY: 9, ejectX: 18, ejectY: 8, shoulderOffsetX: 9, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeSawLauncherFrames(),
    },
    {
      section: 'weapons',
      id: 'flamethrower',
      spriteKey: 'gun_flamethrower',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 18,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [36, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 36, muzzleY: 8, ejectX: 16, ejectY: 11, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeFlamethrowerFrames(),
    },
    {
      section: 'weapons',
      id: 'cryo_cannon',
      spriteKey: 'gun_cryo_cannon',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 16, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeCryoCannonFrames(),
    },
    {
      section: 'weapons',
      id: 'gravity_gun',
      spriteKey: 'gun_gravity_gun',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 14,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [34, 9],
      pivot: { anchorX: 9, anchorY: 9, muzzleX: 34, muzzleY: 9, ejectX: 18, ejectY: 9, shoulderOffsetX: 9, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeGravityGunFrames(),
    },
    {
      section: 'weapons',
      id: 'plasma_shotgun',
      spriteKey: 'gun_plasma_shotgun',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 17, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makePlasmaShotgunFrames(),
    },
    {
      section: 'weapons',
      id: 'twin_smg',
      spriteKey: 'gun_twin_smg',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 20,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [34, 7],
      pivot: { anchorX: 9, anchorY: 9, muzzleX: 34, muzzleY: 7, ejectX: 16, ejectY: 7, shoulderOffsetX: 9, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeTwinSmgFrames(),
    },
    {
      section: 'weapons',
      id: 'ion_beam',
      spriteKey: 'gun_ion_beam',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [36, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 36, muzzleY: 8, ejectX: 18, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeIonBeamFrames(),
    },
    {
      section: 'weapons',
      id: 'cluster_rpg',
      spriteKey: 'gun_cluster_rpg',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 12,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 15, ejectY: 9, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 8 },
      build: () => makeClusterRpgFrames(),
    },
    {
      section: 'weapons',
      id: 'tesla_coil',
      spriteKey: 'gun_tesla_coil',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 17, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeTeslaCoilFrames(),
    },
    {
      section: 'weapons',
      id: 'void_cannon',
      spriteKey: 'gun_void_cannon',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 14,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 18, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 8 },
      build: () => makeVoidCannonFrames(),
    },
    {
      section: 'weapons',
      id: 'blizzard_carbine',
      spriteKey: 'gun_blizzard_carbine',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 17, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeBlizzardCarbineFrames(),
    },
    {
      section: 'weapons',
      id: 'ricochet_disc',
      spriteKey: 'gun_ricochet_disc',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [34, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 34, muzzleY: 8, ejectX: 16, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeRicochetDiscFrames(),
    },
    {
      section: 'weapons',
      id: 'phantom_bow',
      spriteKey: 'gun_phantom_bow',
      weaponCategory: 'kinetic',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 14,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [33, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 33, muzzleY: 8, ejectX: 16, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makePhantomBowFrames(),
    },
    {
      section: 'weapons',
      id: 'magma_spitter',
      spriteKey: 'gun_magma_spitter',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 14,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 17, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 8 },
      build: () => makeMagmaSpitterFrames(),
    },
    {
      section: 'weapons',
      id: 'chronos_rifle',
      spriteKey: 'gun_chronos_rifle',
      weaponCategory: 'energy',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [35, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 35, muzzleY: 8, ejectX: 18, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      build: () => makeChronosRifleFrames(),
    },
    {
      section: 'weapons',
      id: 'orbital_cannon',
      spriteKey: 'gun_orbital_cannon',
      weaponCategory: 'explosive',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 12,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [36, 8],
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 36, muzzleY: 8, ejectX: 18, ejectY: 8, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 8 },
      build: () => makeOrbitalCannonFrames(),
    },

    // --- 4 Gadgets (database-ban-sung/sprites/weapons/*.png) ---
    {
      section: 'gadgets',
      id: 'stun_bomb',
      spriteKey: 'gadget_stun_bomb',
      weaponCategory: 'gadget',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 12,
      loop: true,
      outlineMode: '4conn',
      muzzleOffset: [6, -6],
      pivot: { anchorX: 16, anchorY: 18, muzzleX: 22, muzzleY: 12, ejectX: 16, ejectY: 16, shoulderOffsetX: 16, shoulderLiftY: 18, shoulderR: 6 },
      build: () => makeGadgetStunBombFrames(),
    },
    {
      section: 'gadgets',
      id: 'cluster_bomb',
      spriteKey: 'gadget_cluster_bomb',
      weaponCategory: 'gadget',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 12,
      loop: true,
      outlineMode: '4conn',
      muzzleOffset: [6, -6],
      pivot: { anchorX: 16, anchorY: 18, muzzleX: 22, muzzleY: 12, ejectX: 16, ejectY: 16, shoulderOffsetX: 16, shoulderLiftY: 18, shoulderR: 6 },
      build: () => makeGadgetClusterBombFrames(oss),
    },
    {
      section: 'gadgets',
      id: 'auto_turret',
      spriteKey: 'gadget_auto_turret',
      weaponCategory: 'gadget',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 48,
      cellH: 48,
      offX: -24,
      offY: -44,
      fps: 15,
      loop: false,
      outlineMode: '4conn',
      muzzleOffset: [20, -4],
      pivot: { anchorX: 24, anchorY: 26, footX: 24, footY: 44, muzzleX: 44, muzzleY: 22, ejectX: 24, ejectY: 20, shoulderOffsetX: 24, shoulderLiftY: 26, shoulderR: 0 },
      build: () => makeGadgetAutoTurretFrames(oss),
    },
    {
      section: 'gadgets',
      id: 'heal_drone',
      spriteKey: 'gadget_heal_drone',
      weaponCategory: 'gadget',
      outDir: WEAPONS_OUT_DIR,
      relDir: 'weapons',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 10,
      loop: true,
      outlineMode: '4conn',
      muzzleOffset: [10, 2],
      pivot: { anchorX: 16, anchorY: 16, muzzleX: 26, muzzleY: 18, ejectX: 16, ejectY: 22, shoulderOffsetX: 16, shoulderLiftY: 16, shoulderR: 0 },
      build: () => makeGadgetHealDroneFrames(),
    },

    // --- 28 Projectiles & VFX (database-ban-sung/sprites/fx/*.png) ---
    {
      section: 'fx',
      id: 'bullet_kinetic_sm',
      spriteKey: 'bullet_kinetic_sm',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 12,
      cellH: 8,
      offX: -6,
      offY: -4,
      fps: 30,
      loop: true,
      outlineMode: '4conn',
      build: () => makeBulletSmallFrames(),
    },
    {
      section: 'fx',
      id: 'bullet_kinetic_md',
      spriteKey: 'bullet_kinetic_md',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 12,
      cellH: 8,
      offX: -6,
      offY: -4,
      fps: 30,
      loop: true,
      outlineMode: '4conn',
      build: () => makeBulletMedFrames(),
    },
    {
      section: 'fx',
      id: 'bullet_shotgun_pellet',
      spriteKey: 'bullet_shotgun_pellet',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 12,
      cellH: 8,
      offX: -6,
      offY: -4,
      fps: 30,
      loop: true,
      outlineMode: '4conn',
      build: () => makeShotgunPelletFrames(),
    },
    {
      section: 'fx',
      id: 'plasma_bolt',
      spriteKey: 'plasma_bolt',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 24,
      cellH: 14,
      offX: -12,
      offY: -7,
      fps: 18,
      loop: true,
      outlineMode: 'none',
      build: () => makePlasmaBoltFrames(oss),
    },
    {
      section: 'fx',
      id: 'flame_stream_orb',
      spriteKey: 'flame_stream_orb',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 20,
      cellH: 14,
      offX: -10,
      offY: -7,
      fps: 18,
      loop: true,
      outlineMode: 'none',
      build: () => makeFlameStreamOrbFrames(),
    },
    {
      section: 'fx',
      id: 'cryo_shard',
      spriteKey: 'cryo_shard',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 20,
      cellH: 12,
      offX: -10,
      offY: -6,
      fps: 14,
      loop: true,
      outlineMode: '4conn',
      build: () => makeCryoShardFrames(),
    },
    {
      section: 'fx',
      id: 'saw_disc',
      spriteKey: 'saw_disc',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 18,
      cellH: 18,
      offX: -9,
      offY: -9,
      fps: 24,
      loop: true,
      outlineMode: '4conn',
      build: () => makeSawDiscFrames(),
    },
    {
      section: 'fx',
      id: 'gravity_orb',
      spriteKey: 'gravity_orb',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 22,
      cellH: 22,
      offX: -11,
      offY: -11,
      fps: 14,
      loop: true,
      outlineMode: 'none',
      build: () => makeGravityOrbFrames(),
    },
    {
      section: 'fx',
      id: 'p_rocket',
      spriteKey: 'p_rocket',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 24,
      cellH: 16,
      offX: -12,
      offY: -8,
      fps: 20,
      loop: true,
      outlineMode: '4conn',
      build: () => makeRocketFrames(oss),
    },
    {
      section: 'fx',
      id: 'p_frag_grenade',
      spriteKey: 'p_frag_grenade',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 15,
      loop: true,
      outlineMode: '4conn',
      build: () => makeFragGrenadeProjFrames(oss),
    },
    {
      section: 'fx',
      id: 'p_stun_canister',
      spriteKey: 'p_stun_canister',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 15,
      loop: true,
      outlineMode: '4conn',
      build: () => makeStunCanisterProjFrames(),
    },
    {
      section: 'fx',
      id: 'p_prox_mine',
      spriteKey: 'p_prox_mine',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 6,
      loop: true,
      outlineMode: '4conn',
      build: () => makeProxMineProjFrames(),
    },
    {
      section: 'fx',
      id: 'bullet_enemy_orb',
      spriteKey: 'bullet_enemy_orb',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 12,
      loop: true,
      outlineMode: '4conn',
      build: () => makeEnemyOrbFrames(oss),
    },
    {
      section: 'fx',
      id: 'gadget_bombs',
      spriteKey: 'gadget_bombs',
      fxGroup: 'projectile',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 15,
      loop: true,
      outlineMode: '4conn',
      build: () => makeGadgetBombsFrames(oss),
    },
    {
      section: 'fx',
      id: 'muzzle_flash',
      spriteKey: 'muzzle_flash',
      fxGroup: 'muzzle',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 24,
      offX: -4,
      offY: -12,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeMuzzleFlashFrames(oss, false, false),
    },
    {
      section: 'fx',
      id: 'fx_muzzle_kinetic',
      spriteKey: 'fx_muzzle_kinetic',
      fxGroup: 'muzzle',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 20,
      cellH: 16,
      offX: -2,
      offY: -8,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeMuzzleFlashFrames(oss, true, false),
    },
    {
      section: 'fx',
      id: 'muzzle_plasma',
      spriteKey: 'muzzle_plasma',
      fxGroup: 'muzzle',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 24,
      offX: -4,
      offY: -12,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeMuzzleFlashFrames(oss, false, true),
    },
    {
      section: 'fx',
      id: 'impact_spark',
      spriteKey: 'impact_spark',
      fxGroup: 'hit',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 24,
      cellH: 24,
      offX: -12,
      offY: -12,
      fps: 24,
      loop: false,
      outlineMode: 'none',
      build: () => makeImpactSparkFrames(oss),
    },
    {
      section: 'fx',
      id: 'casing_brass',
      spriteKey: 'casing_brass',
      fxGroup: 'casing',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 8,
      cellH: 8,
      offX: -4,
      offY: -4,
      fps: 0,
      loop: true,
      outlineMode: '4conn',
      build: () => makeCasingFrames(false),
    },
    {
      section: 'fx',
      id: 'casing_shell',
      spriteKey: 'casing_shell',
      fxGroup: 'casing',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 8,
      cellH: 8,
      offX: -4,
      offY: -4,
      fps: 0,
      loop: true,
      outlineMode: '4conn',
      build: () => makeCasingFrames(true),
    },
    {
      section: 'fx',
      id: 'fx_explosion_he',
      spriteKey: 'fx_explosion_he',
      fxGroup: 'explosion',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -56,
      fps: 18,
      loop: false,
      outlineMode: 'none',
      build: () => makeExplosionHeFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_explosion_stun',
      spriteKey: 'fx_explosion_stun',
      fxGroup: 'explosion',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -52,
      fps: 18,
      loop: false,
      outlineMode: 'none',
      build: () => makeExplosionStunFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_explosion_small',
      spriteKey: 'fx_explosion_small',
      fxGroup: 'explosion',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 18,
      loop: false,
      outlineMode: 'none',
      build: () => makeExplosionSmallFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_crater_decals',
      spriteKey: 'fx_crater_decals',
      fxGroup: 'decal',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 64,
      cellH: 40,
      offX: -32,
      offY: -20,
      fps: 0,
      loop: false,
      outlineMode: 'none',
      build: () => makeCraterDecalsFrames(),
    },
    {
      section: 'fx',
      id: 'fx_smoke_puff',
      spriteKey: 'fx_smoke_puff',
      fxGroup: 'dust',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 16,
      loop: false,
      outlineMode: 'none',
      build: () => makeSmokePuffFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_dash_dust',
      spriteKey: 'fx_dash_dust',
      fxGroup: 'dust',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -24,
      fps: 20,
      loop: false,
      outlineMode: 'none',
      build: () => makeDashDustFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_stun_star',
      spriteKey: 'fx_stun_star',
      fxGroup: 'stun',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 7,
      loop: true,
      outlineMode: '4conn',
      build: () => makeStunStarFrames(),
    },
    {
      section: 'fx',
      id: 'fx_stun_ring',
      spriteKey: 'fx_stun_ring',
      fxGroup: 'stun',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 64,
      cellH: 48,
      offX: -32,
      offY: -24,
      fps: 20,
      loop: false,
      outlineMode: 'none',
      build: () => makeStunRingFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_emp_arc',
      spriteKey: 'fx_emp_arc',
      fxGroup: 'stun',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 48,
      cellH: 24,
      offX: -24,
      offY: -12,
      fps: 22,
      loop: true,
      outlineMode: 'none',
      build: () => makeEmpArcFrames(),
    },
    {
      section: 'fx',
      id: 'fx_slash_crescent',
      spriteKey: 'fx_slash_crescent',
      fxGroup: 'slash',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -48,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeSlashCrescentFrames(oss),
    },
    {
      section: 'fx',
      id: 'fx_slash_scythe',
      spriteKey: 'fx_slash_scythe',
      fxGroup: 'slash',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 160,
      cellH: 160,
      offX: -80,
      offY: -80,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeSlashScytheFrames(),
    },
    {
      section: 'fx',
      id: 'fx_slash_shock',
      spriteKey: 'fx_slash_shock',
      fxGroup: 'slash',
      outDir: FX_OUT_DIR,
      relDir: 'fx',
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -48,
      fps: 30,
      loop: false,
      outlineMode: 'none',
      build: () => makeSlashShockFrames(),
    },
  ];

  const meta = {
    version: 1,
    generatedBy: 'scripts/bansung/build-fx-sprites.mjs',
    slice: 'w12',
    palette: 'BANSUNG_PALETTE_48',
    outlineHex: NORM_CONSTANTS.OUTLINE_HEX,
    nativeFacing: NORM_CONSTANTS.NATIVE_FACING,
    ossSourcesFetched: [...oss.fetchedSources],
    counts: {
      weapons: 0,
      gadgets: 0,
      fx: 0,
      total: 0,
      ossBacked: 0,
      fallbackCount: 0,
    },
    weapons: {},
    gadgets: {},
    fx: {},
    sprites: {},
  };

  for (const spec of specs) {
    const built = spec.build();
    const { frames, usedOss, sourceId } = built;
    const packed = packStrip(frames, spec.cellW, spec.cellH);
    const outPath = path.join(spec.outDir, `${spec.spriteKey}.png`);
    await writePngFile(outPath, packed.sheet);

    const license = oss.licenses[sourceId] || 'CC0-1.0';
    const relPath = `database-ban-sung/sprites/${spec.relDir}/${spec.spriteKey}.png`;

    const entry = {
      id: spec.id,
      spriteKey: spec.spriteKey,
      category: spec.section === 'fx' ? 'fx' : spec.section === 'gadgets' ? 'gadget' : 'weapon',
      ...(spec.weaponCategory ? { weaponCategory: spec.weaponCategory } : {}),
      ...(spec.fxGroup ? { fxGroup: spec.fxGroup } : {}),
      path: relPath,
      file: `${spec.relDir}/${spec.spriteKey}.png`,
      width: packed.width,
      height: packed.height,
      frames: packed.frames,
      cellW: packed.cellW,
      cellH: packed.cellH,
      offX: spec.offX,
      offY: spec.offY,
      fps: spec.fps,
      loop: spec.loop,
      nativeFacing: NORM_CONSTANTS.NATIVE_FACING,
      outlineMode: spec.outlineMode,
      ...(spec.muzzleOffset ? { muzzleOffset: spec.muzzleOffset } : {}),
      ...(spec.pivot ? { pivot: spec.pivot } : {}),
      sourceId,
      license,
      ossFetched: usedOss,
      fallback: !usedOss,
    };

    meta[spec.section][spec.spriteKey] = entry;
    meta.sprites[spec.spriteKey] = entry;
    meta.counts[spec.section]++;
    meta.counts.total++;
    if (usedOss) meta.counts.ossBacked++;
    else meta.counts.fallbackCount++;
  }

  await fs.writeFile(META_OUT_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(
    `[w12] Built ${meta.counts.total} sprites (${meta.counts.weapons} weapons + ${meta.counts.gadgets} gadgets + ${meta.counts.fx} fx) | ossBacked=${meta.counts.ossBacked}, synthetic/fallback=${meta.counts.fallbackCount} -> ${path.relative(ROOT_DIR, META_OUT_PATH)}`
  );
}

main().catch((err) => {
  console.error('[w12] FATAL:', err);
  process.exit(1);
});
