#!/usr/bin/env node
/**
 * Open-Source CC0-1.0 VFX & Boss Sprite Strip Builder (`build-oss-vfx-and-bosses.mjs`)
 *
 * Fetches verified CC0-1.0 pixel-art sprites from:
 * - `crawl_tiles_cc0` (`https://github.com/crawl/tiles`, verified against `TILES_UNDER_UNKNOWN_LICENSE.md`)
 * - Local cached `spritepilot_combat` & `spritepilot_effects` CC0 packs when available
 *
 * Emits:
 * 1. Open-Source VFX strips in `database-ban-sung/sprites/fx/` + updates `meta-fx.json`:
 *    - `fx_light_sword.png`          (6f @ 48x48, radiant holy light blade pointing +X)
 *    - `fx_light_slash.png`          (7f @ 64x64, golden-cyan light slash arc)
 *    - `fx_fire_orb.png`             (8f @ 36x36, roaring animated fireball sphere)
 *    - `fx_lightning_orb.png`        (8f @ 36x36, crackling animated electric sphere)
 *    - `fx_lightning_bolt_blue.png`  (6f @ 48x96, vertical crashing blue thunderbolt)
 *    - `fx_lightning_bolt_yellow.png`(6f @ 48x96, vertical crashing yellow thunderbolt)
 * 2. All 9 Boss multi-frame 96x96 pixel-art strips in `database-ban-sung/sprites/bosses/`
 *    (plus `normalized/bosses/boss_arsenal_*.png`) + updates `sprites/mobs/meta-mobs.json`:
 *    - `boss_arsenal`, `boss_beholder`, `boss_colossus`, `boss_overlord`,
 *      `boss_tempest`, `boss_destroyer`, `boss_frost_empress`,
 *      `boss_abyssal_leviathan`, `boss_storm_herald`
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NORM_CONSTANTS,
  applyOutline4Conn,
  blitImage,
  cloneImage,
  createImage,
  cropImage,
  decodePng,
  flipImageX,
  getOpaqueBBox,
  hardenAlpha,
  hexToRgba,
  packStrip,
  quantizeImageToPalette48,
  resizeImage,
  sha256Hex,
  sliceSpriteSheet,
  stripDarkOutline,
  writePngFile,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const FX_DIR = path.join(DB_ROOT, 'sprites', 'fx');
const BOSS_DIR = path.join(DB_ROOT, 'sprites', 'bosses');
const NORM_BOSS_DIR = path.join(DB_ROOT, 'normalized', 'bosses');
const META_FX_PATH = path.join(FX_DIR, 'meta-fx.json');
const META_MOBS_PATH = path.join(DB_ROOT, 'sprites', 'mobs', 'meta-mobs.json');
const CACHE_DIR = path.join(os.tmpdir(), 'bansung-crawl-cc0-cache');
const W12_CACHE_DIR = path.join(os.tmpdir(), 'bansung-w12-cache');

const CRAWL_RAW_BASE = 'https://raw.githubusercontent.com/crawl/tiles/master/';

const CRAWL_TILES = {
  swordPower: 'releases/Nov-2015/item/weapon/artefact/spwpn_sword_of_power.png',
  blessedBlade: 'releases/Ancient/Oct-5-2010/item/weapon/blessed_blade.png',
  holyWrath: 'releases/Nov-2015/item/weapon/brands/i-holy_wrath.png',
  orbFire: 'releases/Nov-2015/mon/nonliving/orb_of_fire.png',
  flame0: 'releases/Nov-2015/effect/flame0.png',
  flame1: 'releases/Nov-2015/effect/flame1.png',
  flame2: 'releases/Nov-2015/effect/flame2.png',
  cloudFire0: 'releases/Nov-2015/effect/cloud_fire0.png',
  orbElec: 'releases/Nov-2015/mon/sprint/orb_of_electricity.png',
  bolt01: 'releases/Nov-2015/effect/bolt01.png',
  bolt02: 'releases/Nov-2015/effect/bolt02.png',
  bolt03: 'releases/Nov-2015/effect/bolt03.png',
  bolt04: 'releases/Nov-2015/effect/bolt04.png',
  bolt05: 'releases/Nov-2015/effect/bolt05.png',
  bolt06: 'releases/Nov-2015/effect/bolt06.png',
  bolt07: 'releases/Nov-2015/effect/bolt07.png',
  bolt08: 'releases/Nov-2015/effect/bolt08.png',
  cloudStorm1: 'releases/Nov-2015/effect/cloud_storm1.png',
  cloudStorm2: 'releases/Nov-2015/effect/cloud_storm2.png',
  ironGiant: 'releases/Nov-2015/mon/unique/iron_giant.png',
  juggernaut: 'releases/Nov-2015/mon/juggernaut.png',
  greatOrbEyes: 'releases/Nov-2015/mon/eyes/great_orb_of_eyes.png',
  orbGuardian: 'releases/Nov-2015/mon/orb_guardian.png',
  ironGolem: 'releases/Nov-2015/mon/nonliving/iron_golem.png',
  hellSentinel: 'releases/Nov-2015/mon/demons/hell_sentinel.png',
  eyeDevastation: 'releases/Nov-2015/mon/eyes/eye_of_devastation.png',
  shiningEye: 'releases/Nov-2015/mon/eyes/shining_eye.png',
  goldenEye: 'releases/Nov-2015/mon/eyes/golden_eye.png',
  stormDragon: 'releases/Ancient/Oct-5-2010/dc-mon/storm_dragon.png',
  titan: 'releases/Nov-2015/mon/titan.png',
  seraph: 'releases/Nov-2015/mon/holy/seraph.png',
  iceDragon: 'releases/Nov-2015/mon/dragons/ice_dragon.png',
  electricGolem: 'releases/Nov-2015/mon/nonliving/electric_golem.png',
  brimstoneFiend: 'releases/Nov-2015/mon/demons/brimstone_fiend.png',
  cerebov: 'releases/Ancient/Oct-5-2010/dc-mon/unique/cerebov.png',
  krakenHead: 'releases/Nov-2015/mon/aquatic/kraken_head.png',
  starspawn: 'releases/Nov-2015/mon/abyss/tentacled_starspawn.png',
  tentacle1: 'releases/Ancient/Oct-5-2010/dc-mon/animals/kraken_tentacle1.png',
  tentacle2: 'releases/Ancient/Oct-5-2010/dc-mon/animals/kraken_tentacle2.png',
};

// ---------------------------------------------------------------------------
// Pixel & Transform Helpers
// ---------------------------------------------------------------------------

function putPx(img, x, y, hex, alpha = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= img.width || iy < 0 || iy >= img.height) return;
  const [r, g, b] = hexToRgba(hex, alpha);
  const i = (iy * img.width + ix) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = alpha;
}

function drawDisc(img, cx, cy, rad, hex, alpha = 255) {
  const r2 = rad * rad;
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) {
        putPx(img, x, y, hex, alpha);
      }
    }
  }
}

function drawRect(img, x, y, w, h, hex, alpha = 255) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      putPx(img, xx, yy, hex, alpha);
    }
  }
}

function drawLine(img, x0, y0, x1, y1, hex, thickness = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0, (thickness - 1) * 0.5);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (r <= 0.2) putPx(img, x, y, hex, 255);
    else drawDisc(img, x, y, r, hex, 255);
  }
}

function rotateImageNearest(src, angleRad, dstW = src.width, dstH = src.height) {
  const out = createImage(dstW, dstH);
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  const scx = (src.width - 1) * 0.5;
  const scy = (src.height - 1) * 0.5;
  const dcx = (dstW - 1) * 0.5;
  const dcy = (dstH - 1) * 0.5;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const rx = dx - dcx;
      const ry = dy - dcy;
      const sx = Math.round(rx * cos - ry * sin + scx);
      const sy = Math.round(rx * sin + ry * cos + scy);
      if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4;
      if (src.data[si + 3] < 48) continue;
      const di = (dy * dstW + dx) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function remapByLuminance(src, rampHexes, alphaCutoff = 48) {
  const out = createImage(src.width, src.height);
  const cols = rampHexes.map((h) => hexToRgba(h, 255));
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3];
    if (a < alphaCutoff) continue;
    const luma = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
    const idx = Math.min(cols.length - 1, Math.max(0, Math.floor(luma * cols.length)));
    out.data[i] = cols[idx][0];
    out.data[i + 1] = cols[idx][1];
    out.data[i + 2] = cols[idx][2];
    out.data[i + 3] = 255;
  }
  return out;
}

function trimAndScale(src, targetW, targetH, alphaCutoff = 48) {
  const clean = stripDarkOutline(hardenAlpha(src, alphaCutoff), { lumaMax: 34, alphaCutoff: 128 });
  const box = getOpaqueBBox(clean, 128);
  if (box.empty) return createImage(targetW, targetH);
  const cropped = cropImage(clean, box.minX, box.minY, box.width, box.height);
  return resizeImage(cropped, targetW, targetH);
}

function finalizeOutlined(img) {
  const hardened = hardenAlpha(img, 96);
  const q = quantizeImageToPalette48(hardened, { lutStrength: 0.92, preserveOutline: true });
  return applyOutline4Conn(q, NORM_CONSTANTS.OUTLINE_RGBA, 128);
}

function finalizeGlowVfx(img, withOutline = false) {
  const hardened = hardenAlpha(img, 80);
  const q = quantizeImageToPalette48(hardened, { lutStrength: 0.85, preserveOutline: true });
  return withOutline ? applyOutline4Conn(q, NORM_CONSTANTS.OUTLINE_RGBA, 128) : q;
}

// ---------------------------------------------------------------------------
// CC0 Asset Loader & License Guard
// ---------------------------------------------------------------------------

async function loadVerifiedCrawlTiles() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const unknownCache = path.join(CACHE_DIR, 'TILES_UNDER_UNKNOWN_LICENSE.md');
  let unknownTxt;
  if (existsSync(unknownCache)) {
    unknownTxt = await fs.readFile(unknownCache, 'utf8');
  } else {
    const res = await fetch(CRAWL_RAW_BASE + 'TILES_UNDER_UNKNOWN_LICENSE.md');
    if (!res.ok) throw new Error(`Failed to fetch TILES_UNDER_UNKNOWN_LICENSE.md: ${res.status}`);
    unknownTxt = await res.text();
    await fs.writeFile(unknownCache, unknownTxt, 'utf8');
  }
  const unknownSet = new Set(
    unknownTxt
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\.\//, ''))
      .filter((l) => l.endsWith('.png')),
  );

  const loaded = {};
  await Promise.all(
    Object.entries(CRAWL_TILES).map(async ([key, rel]) => {
      if (unknownSet.has(rel)) {
        throw new Error(`License violation blocked: ${rel} is listed in TILES_UNDER_UNKNOWN_LICENSE.md`);
      }
      const cacheFile = path.join(CACHE_DIR, rel.replace(/\//g, '__'));
      let buf;
      if (existsSync(cacheFile)) {
        buf = await fs.readFile(cacheFile);
      } else {
        const res = await fetch(CRAWL_RAW_BASE + rel);
        if (!res.ok) throw new Error(`Failed fetching CC0 tile ${rel}: HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(cacheFile, buf);
      }
      loaded[key] = decodePng(buf);
    }),
  );
  return loaded;
}

async function tryLoadOptionalCachedPng(relInW12Cache) {
  const full = path.join(W12_CACHE_DIR, relInW12Cache);
  if (!existsSync(full)) return null;
  try {
    return decodePng(await fs.readFile(full));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Open-Source VFX Builders (Light Sword, Light Slash, Fire Orb, Lightning)
// ---------------------------------------------------------------------------

function extractBrightPixels(src, minLuma = 95) {
  const out = createImage(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3] < 64) continue;
    const luma = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    if (luma < minLuma) continue;
    out.data[i] = src.data[i];
    out.data[i + 1] = src.data[i + 1];
    out.data[i + 2] = src.data[i + 2];
    out.data[i + 3] = 255;
  }
  return out;
}

function buildLightSwordFrames(tiles) {
  // Extract pure sword silhouette (filtering dark background shadow swooshes) & rotate +45 deg to point +X!
  const cleanBlessed = extractBrightPixels(tiles.blessedBlade, 105);
  const cleanPower = extractBrightPixels(tiles.swordPower, 85);
  const baseSword = rotateImageNearest(resizeImage(cleanBlessed, 40, 40), Math.PI / 4, 48, 48);
  const altSword = rotateImageNearest(resizeImage(cleanPower, 40, 40), Math.PI / 4, 48, 48);
  const holyBrand = extractBrightPixels(tiles.holyWrath, 110);

  const frames = [];
  for (let f = 0; f < 6; f++) {
    const cell = createImage(48, 48);
    // Symmetrical radiant golden-cyan light halo tapering toward blade tip (+X)
    for (let x = 15; x <= 42; x++) {
      const taper = 1 - Math.max(0, x - 34) / 10;
      const halfH = Math.max(1, Math.round((3.4 + (f % 2) * 0.6) * taper));
      drawRect(cell, x, 24 - halfH, 1, halfH * 2 + 1, x % 3 === f % 3 ? '#fee761' : '#2ce8f5');
    }
    // Blit rotated CC0 sword remapped into radiant holy gold-cyan-white palette
    const swordRemap = remapByLuminance(
      f % 2 === 0 ? baseSword : altSword,
      ['#0095e9', '#2ce8f5', '#e8b878', '#fee761', '#9cf9ff', '#ffffff'],
      40,
    );
    blitImage(cell, swordRemap, 0, 0);

    // Symmetrical winged golden sun-crossguard & pommel crystal
    drawRect(cell, 5, 23, 8, 3, '#c9885b');
    drawRect(cell, 3, 22, 3, 5, '#fee761'); // pommel sun-gem
    putPx(cell, 4, 24, '#ffffff');
    // Winged holy guard (symmetrical around y=24!)
    drawLine(cell, 13, 15, 16, 24, '#fee761', 2);
    drawLine(cell, 13, 33, 16, 24, '#fee761', 2);
    drawLine(cell, 12, 17, 14, 24, '#e8b878', 2);
    drawLine(cell, 12, 31, 14, 24, '#e8b878', 2);
    drawDisc(cell, 15, 24, 2.2, '#2ce8f5');
    putPx(cell, 15, 24, '#ffffff');

    // Brilliant white-gold-cyan Light Blade core tapering to needle point at x=45, y=24
    drawRect(cell, 17, 22, 23, 5, '#9cf9ff');
    drawRect(cell, 17, 23, 26, 3, '#ffffff');
    drawRect(cell, 40, 23, 4, 3, '#fee761');
    putPx(cell, 44, 24, '#ffffff');
    putPx(cell, 45, 24, '#ffffff');

    // Travelling holy star-glint pulsing down the blade
    const glintX = 19 + f * 4;
    drawLine(cell, glintX - 3, 24, glintX + 3, 24, '#ffffff', 1);
    drawLine(cell, glintX, 19, glintX, 29, f % 2 === 0 ? '#fee761' : '#9cf9ff', 1);
    if (f % 2 === 0 && holyBrand) {
      const sparkCrop = cropImage(holyBrand, 17, 17, 14, 14);
      const sparkTiny = remapByLuminance(resizeImage(sparkCrop, 7, 7), ['#fee761', '#ffffff'], 60);
      blitImage(cell, sparkTiny, Math.min(38, glintX - 3), 21);
    }

    frames.push(finalizeOutlined(cell));
  }
  return frames;
}

async function buildLightSlashFrames(tiles) {
  const spSlash = await tryLoadOptionalCachedPng('spritepilot_combat/spritepilot-combat-pack/32px/sword-slash-32px_strip7.png');
  const spFlash = await tryLoadOptionalCachedPng('spritepilot_combat/spritepilot-combat-pack/32px/parry-flash-32px_strip7.png');
  const slashCells = spSlash ? sliceSpriteSheet(spSlash, 32, 32, { cols: 7, rows: 1, count: 7 }) : null;
  const flashCells = spFlash ? sliceSpriteSheet(spFlash, 32, 32, { cols: 7, rows: 1, count: 7 }) : null;

  const frames = [];
  for (let f = 0; f < 7; f++) {
    const cell = createImage(64, 64);
    if (slashCells && slashCells[f]) {
      const scaled = resizeImage(slashCells[f], 58, 58);
      const remapped = remapByLuminance(scaled, ['#0095e9', '#2ce8f5', '#fee761', '#9cf9ff', '#ffffff'], 28);
      blitImage(cell, remapped, 3, 3);
    } else {
      // Fallback crescent arc from CC0 bolt + holy wrath
      const sweepStart = -1.25 + f * 0.16;
      const sweepEnd = 1.25 - Math.max(0, f - 3) * 0.25;
      for (let a = sweepStart; a <= sweepEnd; a += 0.05) {
        const rx = 24 + Math.cos(a) * 24;
        const ry = 32 + Math.sin(a) * 24;
        drawDisc(cell, rx, ry, f < 4 ? 3.2 : 2.0, '#2ce8f5');
        drawDisc(cell, rx - 1, ry, f < 4 ? 1.8 : 1.0, '#ffffff');
      }
    }
    if (flashCells && flashCells[f]) {
      const fScaled = remapByLuminance(resizeImage(flashCells[f], 40, 40), ['#fee761', '#ffffff'], 50);
      blitImage(cell, fScaled, 16, 12);
    }
    // Crisp golden-white cross star flare on peak frames 1..3
    if (f >= 1 && f <= 4) {
      const sx = 42 + (f - 2) * 3;
      drawLine(cell, sx - 6, 32, sx + 6, 32, '#fee761', 1);
      drawLine(cell, sx, 26, sx, 38, '#ffffff', 1);
    }
    frames.push(finalizeGlowVfx(cell, true));
  }
  return frames;
}

async function buildFireOrbFrames(tiles) {
  const spFire = await tryLoadOptionalCachedPng('spritepilot_effects/spritepilot-effects-pack/32px/fire-32px_strip8.png');
  const spFireCells = spFire ? sliceSpriteSheet(spFire, 32, 32, { cols: 8, rows: 1, count: 8 }) : null;
  const flames = [tiles.flame0, tiles.flame1, tiles.flame2];

  const frames = [];
  for (let f = 0; f < 8; f++) {
    const cell = createImage(36, 36);
    // Rotating CC0 orb_of_fire core
    const rotOrb = rotateImageNearest(resizeImage(tiles.orbFire, 28, 28), (f / 8) * Math.PI * 2, 36, 36);
    const warmOrb = remapByLuminance(rotOrb, ['#8a1c31', '#c72936', '#e43b44', '#ff7a3d', '#fee761', '#ffffff'], 42);
    blitImage(cell, warmOrb, 0, 0);

    // Overlay CC0 flame lick sprites
    if (spFireCells && spFireCells[f]) {
      const fireOverlay = remapByLuminance(resizeImage(spFireCells[f], 26, 26), ['#c72936', '#ff7a3d', '#fee761', '#ffffff'], 60);
      blitImage(cell, fireOverlay, 5, 3);
    }
    const fl = flames[f % flames.length];
    const flSmall = remapByLuminance(trimAndScale(fl, 14, 14, 48), ['#e43b44', '#ff7a3d', '#fee761', '#ffffff'], 48);
    const crownDx = Math.round(Math.sin((f / 8) * Math.PI * 2) * 3);
    blitImage(cell, flSmall, 11 + crownDx, 2);

    // Bright molten white-gold heart
    drawDisc(cell, 18, 19, 5.2, '#ff7a3d');
    drawDisc(cell, 18, 19, 3.6, '#fee761');
    drawDisc(cell, 17, 18, 2.0, '#ffffff');

    frames.push(finalizeOutlined(cell));
  }
  return frames;
}

function buildLightningOrbFrames(tiles) {
  const bolts = [
    tiles.bolt01, tiles.bolt02, tiles.bolt03, tiles.bolt04,
    tiles.bolt05, tiles.bolt06, tiles.bolt07, tiles.bolt08,
  ];
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const cell = createImage(36, 36);
    // Rotating CC0 orb_of_electricity
    const rotElec = rotateImageNearest(resizeImage(tiles.orbElec, 28, 28), -(f / 8) * Math.PI * 2, 36, 36);
    const cyanOrb = remapByLuminance(rotElec, ['#143464', '#124e89', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'], 40);
    blitImage(cell, cyanOrb, 0, 0);

    // Overlay CC0 crackling bolt arc around sphere
    const boltScaled = remapByLuminance(
      rotateImageNearest(resizeImage(bolts[f], 30, 30), f * 0.78, 36, 36),
      ['#0095e9', '#2ce8f5', '#fee761', '#9cf9ff', '#ffffff'],
      55,
    );
    blitImage(cell, boltScaled, 0, 0);

    // Bright white-cyan electric plasma core
    drawDisc(cell, 18, 18, 4.5, '#2ce8f5');
    drawDisc(cell, 18, 18, 2.8, '#9cf9ff');
    drawDisc(cell, 18, 18, 1.6, '#ffffff');

    frames.push(finalizeOutlined(cell));
  }
  return frames;
}

function buildVerticalLightningBoltFrames(tiles, colorVariant) {
  const isYellow = colorVariant === 'yellow';
  const ramp = isYellow
    ? ['#9e5b47', '#ff7a3d', '#e8b878', '#fee761', '#fff0c2', '#ffffff']
    : ['#143464', '#124e89', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'];
  const coreCol = '#ffffff';
  const midCol = isYellow ? '#fee761' : '#2ce8f5';
  const outerCol = isYellow ? '#ff7a3d' : '#0095e9';
  const bolts = [tiles.bolt01, tiles.bolt02, tiles.bolt03, tiles.bolt04, tiles.bolt05, tiles.bolt06];
  const cloud = isYellow ? tiles.cloudStorm2 : tiles.cloudStorm1;

  const frames = [];
  for (let f = 0; f < 6; f++) {
    const cell = createImage(48, 96);

    // Top storm cloud discharge crown (y = 2..20)
    const cloudCrown = remapByLuminance(resizeImage(cloud, 38, 18), ramp.slice(0, 5), 55);
    blitImage(cell, f % 2 === 0 ? cloudCrown : flipImageX(cloudCrown), 5, 2);

    // Stack 3 rotated vertical CC0 bolt segments from sky (y=10) to ground impact (y=88)
    for (let seg = 0; seg < 3; seg++) {
      const bSrc = bolts[(f + seg * 2) % bolts.length];
      const bVert = rotateImageNearest(resizeImage(bSrc, 34, 34), Math.PI * 0.5, 36, 36);
      const bCol = remapByLuminance(bVert, ramp, 45);
      const jitterX = ((f + seg) % 2 === 0 ? -2 : 2);
      if (f <= 4) {
        blitImage(cell, seg % 2 === 1 ? flipImageX(bCol) : bCol, 6 + jitterX, 10 + seg * 24);
      }
    }

    // Continuous jagged high-voltage spine so frames 0..3 read as an unmistakable sky-to-ground strike
    if (f <= 4) {
      const thick = f <= 2 ? 3 : 2;
      let px = 24;
      let py = 8;
      const nodes = 7;
      for (let n = 1; n <= nodes; n++) {
        const ny = Math.round(8 + (80 * n) / nodes);
        const nx = n === nodes ? 24 : 24 + (((f * 7 + n * 5) % 9) - 4) * 2;
        drawLine(cell, px, py, nx, ny, midCol, thick + 2);
        drawLine(cell, px, py, nx, ny, coreCol, thick);
        if (n % 2 === 1 && f <= 3) {
          const bx = nx + ((n + f) % 2 === 0 ? 10 : -10);
          drawLine(cell, nx, ny, bx, ny + 9, midCol, 1);
        }
        px = nx;
        py = ny;
      }
    }

    // Expanding ground impact shockburst at y = 86..92 (pivot anchor is y = 88)
    const ringRx = 8 + f * 3;
    const ringRy = 3 + Math.floor(f * 1.1);
    for (let a = 0; a < Math.PI * 2; a += 0.15) {
      const gx = 24 + Math.cos(a) * ringRx;
      const gy = 88 + Math.sin(a) * ringRy;
      putPx(cell, gx, gy, f < 3 ? coreCol : midCol, 255);
      putPx(cell, gx, gy + 1, outerCol, 255);
    }
    if (f <= 3) {
      drawDisc(cell, 24, 87, 6 - f, midCol);
      drawDisc(cell, 24, 87, 3.5 - f * 0.6, coreCol);
    }

    frames.push(finalizeGlowVfx(cell, true));
  }
  return frames;
}

// ---------------------------------------------------------------------------
// 2. Open-Source CC0 96x96 Boss Strip Builders (All 9 Bosses + Pods)
// ---------------------------------------------------------------------------

function placeCenteredAtFoot(cell, spriteImg, footY = 92, dx = 0, dy = 0) {
  const x = Math.round((cell.width - spriteImg.width) * 0.5) + dx;
  const y = Math.round(footY - spriteImg.height) + dy;
  blitImage(cell, spriteImg, x, y);
  return { x, y, w: spriteImg.width, h: spriteImg.height };
}

function buildCollapsedDeadFrame(baseSprite, f, totalFrames, accentHex = '#ff7a3d') {
  const cell = createImage(96, 96);
  const t = totalFrames <= 1 ? 1 : f / (totalFrames - 1);
  if (t < 0.45) {
    // Stagger + tilt + flash sparks
    const tilted = rotateImageNearest(baseSprite, 0.22 + t * 0.5, 96, 96);
    blitImage(cell, tilted, 0, Math.round(t * 10));
    drawDisc(cell, 48 + (f % 2 === 0 ? -10 : 12), 48, 6, '#fee761');
    drawDisc(cell, 48 + (f % 2 === 0 ? -10 : 12), 48, 3, '#ffffff');
  } else {
    // Collapsed horizontal boss wreckage / defeated form resting at foot line y=92
    const squashed = resizeImage(
      rotateImageNearest(baseSprite, Math.PI * 0.46, 88, 88),
      84,
      Math.max(36, Math.round(56 * (1 - (t - 0.45) * 0.35))),
    );
    placeCenteredAtFoot(cell, squashed, 92, 2, 0);
    if (f < totalFrames - 1) {
      drawDisc(cell, 38 + f * 4, 72 - f * 2, 5, accentHex);
      drawDisc(cell, 38 + f * 4, 72 - f * 2, 2.5, '#fee761');
    }
  }
  return finalizeOutlined(cell);
}

function buildBossArsenalStrips(tiles) {
  // CC0 iron_giant + juggernaut kitbash: towering heavy siege mech with shoulder missile pods & twin cannons
  const bodyBase = trimAndScale(tiles.ironGiant, 72, 78);
  const shoulderArmor = trimAndScale(tiles.juggernaut, 30, 30);

  const makeMechBase = (stridePhase = 0, firing = false, bobY = 0) => {
    const cell = createImage(96, 96);
    // Heavy dorsal shoulder missile pods (left & right)
    drawRect(cell, 16, 16 + bobY, 15, 22, '#3a4466');
    drawRect(cell, 18, 18 + bobY, 11, 8, '#c72936');
    drawDisc(cell, 21, 22 + bobY, 2, '#fee761');
    drawDisc(cell, 26, 22 + bobY, 2, '#fee761');

    drawRect(cell, 65, 16 + bobY, 15, 22, '#3a4466');
    drawRect(cell, 67, 18 + bobY, 11, 8, '#c72936');
    drawDisc(cell, 70, 22 + bobY, 2, '#fee761');
    drawDisc(cell, 75, 22 + bobY, 2, '#fee761');

    // CC0 iron_giant main armored chassis
    placeCenteredAtFoot(cell, bodyBase, 92, stridePhase, bobY);
    // CC0 juggernaut chest/pauldron reinforcement
    blitImage(cell, shoulderArmor, 33 + stridePhase, 34 + bobY);

    // Glowing crimson dread-visor & chest furnace core
    drawRect(cell, 41 + stridePhase, 21 + bobY, 16, 4, '#4c1424');
    drawRect(cell, 43 + stridePhase, 22 + bobY, 12, 2, firing ? '#ffffff' : '#e43b44');
    drawDisc(cell, 48 + stridePhase, 46 + bobY, 5, '#c72936');
    drawDisc(cell, 48 + stridePhase, 46 + bobY, 3, firing ? '#ffffff' : '#fee761');

    // Heavy arm rotary autocannon extending +X
    const recoil = firing ? -3 : 0;
    drawRect(cell, 64 + recoil, 44 + bobY, 20, 9, '#5a6988');
    drawRect(cell, 66 + recoil, 46 + bobY, 18, 5, '#262b44');
    drawRect(cell, 68 + recoil, 45 + bobY, 16, 2, '#8b9bb4');
    if (firing) {
      drawDisc(cell, 86, 48 + bobY, 6, '#ff7a3d');
      drawDisc(cell, 87, 48 + bobY, 3.5, '#fee761');
      drawDisc(cell, 88, 48 + bobY, 2, '#ffffff');
    }
    return cell;
  };

  const refStanding = makeMechBase(0, false, 0);
  return {
    idle: [0, 1, 2, 3].map((f) => finalizeOutlined(makeMechBase(0, false, f === 1 || f === 2 ? 1 : 0))),
    run: [0, 1, 2, 3].map((f) => finalizeOutlined(makeMechBase(f % 2 === 0 ? 1 : -1, false, f % 2 === 0 ? -2 : 1))),
    attack: [0, 1, 2, 3].map((f) => finalizeOutlined(makeMechBase(f === 1 || f === 2 ? -2 : 0, f === 1 || f === 2, 0))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(refStanding, f, 4, '#ff7a3d')),
  };
}

function buildBossBeholderStrips(tiles) {
  const core = trimAndScale(tiles.eyeDevastation, 72, 74);
  const miniEye = trimAndScale(tiles.goldenEye, 18, 20);
  const shineEye = trimAndScale(tiles.shiningEye, 24, 24);

  const makeFrame = (bobY, stalkWave, mode) => {
    const cell = createImage(96, 96);
    // Floating eldritch tentacles/eyestalks radiating from CC0 eye_of_devastation
    for (let s = 0; s < 4; s++) {
      const side = s < 2 ? -1 : 1;
      const sx = 48 + side * (24 + (s % 2) * 8);
      const sy = 22 + (s % 2) * 18 + bobY + ((s + stalkWave) % 2 === 0 ? -3 : 2);
      drawLine(cell, 48 + side * 14, 42 + bobY, sx, sy, '#8a1c31', 4);
      blitImage(cell, side < 0 ? flipImageX(miniEye) : miniEye, sx - 9, sy - 10);
    }
    placeCenteredAtFoot(cell, core, 88, 0, bobY);

    if (mode === 'volley') {
      blitImage(cell, shineEye, 36, 10 + bobY);
      drawDisc(cell, 54, 48 + bobY, 6, '#ff9ee2');
      drawDisc(cell, 54, 48 + bobY, 3, '#ffffff');
    } else if (mode === 'beam') {
      drawDisc(cell, 54, 48 + bobY, 9, '#e43b44');
      drawDisc(cell, 55, 48 + bobY, 6, '#fee761');
      drawDisc(cell, 56, 48 + bobY, 3, '#ffffff');
    } else if (mode === 'enrage') {
      for (let a = 0; a < Math.PI * 2; a += 0.7) {
        drawDisc(cell, 48 + Math.cos(a + stalkWave) * 38, 48 + Math.sin(a + stalkWave) * 34, 3, '#e43b44');
      }
    } else if (mode === 'stagger') {
      return rotateImageNearest(cell, stalkWave % 2 === 0 ? -0.14 : 0.14, 96, 96);
    }
    return cell;
  };

  const ref = makeFrame(0, 0, 'idle');
  return {
    idle: [0, 1, 2, 3].map((f) => finalizeOutlined(makeFrame(f % 2 === 0 ? 0 : -3, f, 'idle'))),
    move: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(Math.round(Math.sin((f / 6) * Math.PI * 2) * 4), f, 'idle'))),
    volley_cast: [0, 1, 2, 3, 4].map((f) => finalizeOutlined(makeFrame(-2, f, 'volley'))),
    slam_leap: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f < 3 ? -f * 4 : (5 - f) * -2 + 3, f, f >= 4 ? 'enrage' : 'idle'))),
    beam_windup: [0, 1, 2, 3].map((f) => finalizeOutlined(makeFrame(-1, f, 'beam'))),
    enrage_roar: [0, 1, 2, 3, 4].map((f) => finalizeOutlined(makeFrame(-3, f, 'enrage'))),
    stagger: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(2, f, 'stagger'))),
    dead: [0, 1, 2, 3, 4, 5].map((f) => buildCollapsedDeadFrame(ref, f, 6, '#e43b44')),
  };
}

function buildBossColossusStrips(tiles) {
  const golem = trimAndScale(tiles.ironGolem, 76, 82);
  const sentinel = trimAndScale(tiles.hellSentinel, 44, 44);
  const flame = trimAndScale(tiles.flame1, 18, 18);

  const makeFrame = (bobY, dx, mode, f) => {
    const cell = createImage(96, 96);
    placeCenteredAtFoot(cell, golem, 92, dx, bobY);
    // Spiked hell_sentinel torso crest + molten furnace belly
    blitImage(cell, sentinel, 26 + dx, 24 + bobY);
    drawDisc(cell, 49 + dx, 48 + bobY, 6, '#e43b44');
    drawDisc(cell, 49 + dx, 48 + bobY, 3.5, mode === 'attack' ? '#ffffff' : '#fee761');
    if (mode === 'attack' && f >= 1) {
      // Ground slam magma shockwave
      for (let x = 14; x <= 82; x += 6) {
        drawDisc(cell, x, 89, f === 2 ? 4 : 2.5, '#ff7a3d');
        putPx(cell, x, 88, '#fee761');
      }
    } else if (mode === 'stun') {
      blitImage(cell, flame, 20, 14 + (f % 2) * 3);
      blitImage(cell, flipImageX(flame), 58, 16 - (f % 2) * 3);
    }
    return cell;
  };

  const ref = makeFrame(0, 0, 'idle', 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? 1 : 0, 0, 'idle', f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f % 3 === 1 ? -3 : 1, f % 2 === 0 ? 1 : -1, 'run', f))),
    attack: [0, 1, 2, 3].map((f) => finalizeOutlined(makeFrame(f === 0 ? -4 : f === 2 ? 3 : 0, f === 2 ? 2 : 0, 'attack', f))),
    overheat_stun: [0, 1].map((f) => finalizeOutlined(makeFrame(2, f === 0 ? -2 : 2, 'stun', f))),
    dead: [0, 1, 2].map((f) => buildCollapsedDeadFrame(ref, f, 3, '#ff7a3d')),
  };
}

function buildBossOverlordStrips(tiles) {
  const core = trimAndScale(tiles.greatOrbEyes, 64, 64);
  const wingPod = trimAndScale(tiles.orbGuardian, 34, 38);

  const makeFrame = (bobY, mode, f) => {
    const cell = createImage(96, 96);
    // Twin armored gunship hover-wings flanking central Overlord core
    blitImage(cell, flipImageX(wingPod), 6, 28 + bobY + (f % 2));
    blitImage(cell, wingPod, 56, 28 + bobY - (f % 2));
    // Thruster exhaust plumes beneath wings
    drawDisc(cell, 20, 68 + bobY, 4 + (f % 2), '#2ce8f5');
    drawDisc(cell, 76, 68 + bobY, 4 + ((f + 1) % 2), '#2ce8f5');
    // Armored command crown + CC0 great_orb_of_eyes core
    drawRect(cell, 28, 16 + bobY, 40, 10, '#3a4466');
    drawRect(cell, 34, 13 + bobY, 28, 5, '#5a6988');
    placeCenteredAtFoot(cell, core, 82, 0, bobY);

    // Central WeakPoint cyber-optic lens
    const charging = mode === 'charge';
    const stunned = mode === 'stun';
    drawDisc(cell, 48, 48 + bobY, charging ? 11 : 8, stunned ? '#5a6988' : '#96419c');
    drawDisc(cell, 48, 48 + bobY, charging ? 8 : 5, stunned ? '#fee761' : '#e43b44');
    drawDisc(cell, 48, 48 + bobY, charging ? 4.5 : 2.5, '#ffffff');
    if (charging) {
      drawLine(cell, 16, 48 + bobY, 80, 48 + bobY, '#ff9ee2', 2);
      drawLine(cell, 48, 16 + bobY, 48, 80 + bobY, '#2ce8f5', 2);
    }
    return cell;
  };

  const ref = makeFrame(0, 'idle', 0);
  return {
    idle: [0, 1, 2, 3].map((f) => finalizeOutlined(makeFrame(f % 2 === 0 ? 0 : -2, 'idle', f))),
    charge: [0, 1, 2, 3].map((f) => finalizeOutlined(makeFrame(-3, 'charge', f))),
    stun: [0, 1].map((f) => finalizeOutlined(makeFrame(3, 'stun', f))),
    dead: [0, 1, 2, 3, 4, 5].map((f) => buildCollapsedDeadFrame(ref, f, 6, '#2ce8f5')),
  };
}

function buildBossTempestStrips(tiles) {
  const dragon = trimAndScale(tiles.stormDragon, 78, 80);
  const bolts = [tiles.bolt01, tiles.bolt02, tiles.bolt03, tiles.bolt04];

  const makeFrame = (bobY, dx, attacking, f) => {
    const cell = createImage(96, 96);
    placeCenteredAtFoot(cell, dragon, 90, dx, bobY);
    const b = remapByLuminance(
      resizeImage(bolts[f % bolts.length], 34, 34),
      ['#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'],
      50,
    );
    blitImage(cell, b, attacking ? 56 : 8, 14 + bobY);
    if (attacking) {
      blitImage(cell, flipImageX(b), 6, 20 + bobY);
      drawDisc(cell, 72, 42 + bobY, 5, '#9cf9ff');
      drawDisc(cell, 72, 42 + bobY, 2.5, '#ffffff');
    }
    return cell;
  };

  const ref = makeFrame(0, 0, false, 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? -3 : 0, 0, false, f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f % 2 === 0 ? -3 : 1, f % 2 === 0 ? 2 : -1, false, f))),
    attack: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(-3, f >= 2 && f <= 4 ? 3 : 0, f >= 1 && f <= 4, f))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(ref, f, 4, '#2ce8f5')),
  };
}

function buildBossDestroyerStrips(tiles) {
  const fiend = trimAndScale(tiles.brimstoneFiend, 76, 82);
  const lord = trimAndScale(tiles.cerebov, 50, 52);
  const flames = [tiles.flame0, tiles.flame1, tiles.flame2];

  const makeFrame = (bobY, dx, attacking, f) => {
    const cell = createImage(96, 96);
    placeCenteredAtFoot(cell, fiend, 92, dx, bobY);
    blitImage(cell, lord, 23 + dx, 18 + bobY);
    const fl = remapByLuminance(trimAndScale(flames[f % flames.length], 22, 22), ['#c72936', '#ff7a3d', '#fee761', '#ffffff'], 48);
    blitImage(cell, fl, 14, 62);
    blitImage(cell, flipImageX(fl), 60, 62);
    if (attacking) {
      // Blazing magma greatsword cleave arc on +X
      for (let a = -0.9; a <= 0.9; a += 0.1) {
        const sx = 54 + Math.cos(a) * 32;
        const sy = 48 + bobY + Math.sin(a) * 30;
        drawDisc(cell, sx, sy, 3.2, '#ff7a3d');
        drawDisc(cell, sx - 1, sy, 1.6, '#fee761');
      }
    }
    return cell;
  };

  const ref = makeFrame(0, 0, false, 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? 1 : 0, 0, false, f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f % 3 === 1 ? -3 : 1, f % 2 === 0 ? 2 : -1, false, f))),
    attack: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f === 2 ? -2 : 0, f >= 2 && f <= 4 ? 3 : 0, f >= 2 && f <= 4, f))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(ref, f, 4, '#e43b44')),
  };
}

function buildBossFrostEmpressStrips(tiles) {
  // CC0 seraph (32x48!) recolored into glacial sapphire-cyan-white + ice_dragon frost crest
  const frostSeraph = remapByLuminance(
    trimAndScale(tiles.seraph, 64, 84),
    ['#143464', '#124e89', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'],
    40,
  );
  const iceCrest = remapByLuminance(
    trimAndScale(tiles.iceDragon, 36, 36),
    ['#124e89', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'],
    45,
  );

  const makeFrame = (bobY, attacking, f) => {
    const cell = createImage(96, 96);
    blitImage(cell, iceCrest, 30, 8 + bobY);
    placeCenteredAtFoot(cell, frostSeraph, 90, 0, bobY);
    // Orbiting diamond ice shards
    const count = attacking ? 6 : 4;
    for (let k = 0; k < count; k++) {
      const ang = (f / 6) * Math.PI * 2 + (k / count) * Math.PI * 2;
      const ix = Math.round(48 + Math.cos(ang) * (attacking ? 38 : 32));
      const iy = Math.round(48 + bobY + Math.sin(ang) * (attacking ? 28 : 22));
      drawLine(cell, ix, iy - 5, ix, iy + 5, '#9cf9ff', 2);
      drawLine(cell, ix - 3, iy, ix + 3, iy, '#ffffff', 1);
    }
    return cell;
  };

  const ref = makeFrame(0, false, 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? -3 : 0, false, f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(Math.round(Math.sin((f / 6) * Math.PI * 2) * 3), false, f))),
    attack: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(-4, f >= 1 && f <= 4, f))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(ref, f, 4, '#9cf9ff')),
  };
}

function buildBossLeviathanStrips(tiles) {
  const starspawn = remapByLuminance(
    trimAndScale(tiles.starspawn, 72, 76),
    ['#181425', '#381d4a', '#622c73', '#124e89', '#2ce8f5', '#9cf9ff'],
    40,
  );
  const kraken = remapByLuminance(
    trimAndScale(tiles.krakenHead, 56, 48),
    ['#381d4a', '#622c73', '#96419c', '#2ce8f5', '#ff9ee2', '#ffffff'],
    40,
  );
  const tent1 = remapByLuminance(trimAndScale(tiles.tentacle1, 28, 44), ['#381d4a', '#622c73', '#96419c', '#2ce8f5'], 45);
  const tent2 = remapByLuminance(trimAndScale(tiles.tentacle2, 26, 40), ['#381d4a', '#622c73', '#96419c', '#2ce8f5'], 45);

  const makeFrame = (bobY, attacking, f) => {
    const cell = createImage(96, 96);
    const leftTent = f % 2 === 0 ? tent1 : tent2;
    const rightTent = f % 2 === 0 ? tent2 : tent1;
    blitImage(cell, flipImageX(leftTent), 6, (attacking ? 34 : 44) + bobY);
    blitImage(cell, rightTent, 64, (attacking ? 32 : 44) - bobY);
    placeCenteredAtFoot(cell, starspawn, 92, 0, bobY);
    blitImage(cell, kraken, 20, 16 + bobY);
    // Glowing abyssal eyes
    drawDisc(cell, 40, 38 + bobY, 3, '#ff9ee2');
    drawDisc(cell, 56, 38 + bobY, 3, '#2ce8f5');
    putPx(cell, 40, 38 + bobY, '#ffffff');
    putPx(cell, 56, 38 + bobY, '#ffffff');
    return cell;
  };

  const ref = makeFrame(0, false, 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? -2 : 0, false, f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f % 2 === 0 ? -2 : 2, false, f))),
    attack: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(-3, f >= 1 && f <= 4, f))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(ref, f, 4, '#96419c')),
  };
}

function buildBossStormHeraldStrips(tiles) {
  // Dual-Storm Archon: CC0 titan + electric_golem wielding Golden Storm Orb (left) & Blue Storm Orb (right)!
  const titan = trimAndScale(tiles.titan, 72, 82);
  const elec = trimAndScale(tiles.electricGolem, 44, 58);
  const orbYellow = remapByLuminance(trimAndScale(tiles.orbElec, 22, 22), ['#9e5b47', '#ff7a3d', '#fee761', '#fff0c2', '#ffffff'], 45);
  const orbBlue = remapByLuminance(trimAndScale(tiles.orbElec, 22, 22), ['#143464', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'], 45);
  const bolts = [tiles.bolt01, tiles.bolt02, tiles.bolt05, tiles.bolt06];

  const makeFrame = (bobY, attacking, f) => {
    const cell = createImage(96, 96);
    placeCenteredAtFoot(cell, titan, 92, 0, bobY);
    blitImage(cell, elec, 26, 20 + bobY);

    // Dual floating storm spheres: Yellow Lightning on left, Blue Lightning on right!
    const orbLift = attacking ? -8 : (f % 2 === 0 ? -2 : 2);
    blitImage(cell, orbYellow, 6, 24 + bobY + orbLift);
    blitImage(cell, orbBlue, 68, 24 + bobY - orbLift);

    if (attacking) {
      const bYel = remapByLuminance(resizeImage(bolts[f % bolts.length], 28, 28), ['#ff7a3d', '#fee761', '#ffffff'], 50);
      const bBlu = remapByLuminance(resizeImage(bolts[(f + 1) % bolts.length], 28, 28), ['#0095e9', '#2ce8f5', '#ffffff'], 50);
      blitImage(cell, bYel, 4, 6);
      blitImage(cell, bBlu, 64, 6);
    }
    // Dual-colored storm crown eyes (left gold, right cyan)
    drawDisc(cell, 44, 24 + bobY, 2.2, '#fee761');
    drawDisc(cell, 52, 24 + bobY, 2.2, '#2ce8f5');
    return cell;
  };

  const ref = makeFrame(0, false, 0);
  return {
    idle: [0, 1, 2].map((f) => finalizeOutlined(makeFrame(f === 1 ? -2 : 0, false, f))),
    run: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(f % 2 === 0 ? -3 : 1, false, f))),
    attack: [0, 1, 2, 3, 4, 5].map((f) => finalizeOutlined(makeFrame(-3, f >= 1 && f <= 4, f))),
    dead: [0, 1, 2, 3].map((f) => buildCollapsedDeadFrame(ref, f, 4, '#fee761')),
  };
}

function buildOverlordSupportStrips(tiles) {
  const wpFrames = [0, 1, 2].map((f) => {
    const cell = createImage(32, 32);
    const rot = rotateImageNearest(resizeImage(tiles.orbElec, 26, 26), (f / 3) * Math.PI * 2, 32, 32);
    blitImage(cell, remapByLuminance(rot, ['#143464', '#0095e9', '#2ce8f5', '#9cf9ff', '#ffffff'], 45), 0, 0);
    drawDisc(cell, 16, 16, 3.5, '#ffffff');
    return finalizeOutlined(cell);
  });

  const pylonFrames = [0, 1, 2, 3].map((f) => {
    const cell = createImage(48, 48);
    const base = remapByLuminance(trimAndScale(tiles.orbGuardian, 34, 40), ['#262b44', '#3a4466', '#0095e9', '#2ce8f5', '#9cf9ff'], 45);
    placeCenteredAtFoot(cell, base, 46, 0, 0);
    drawDisc(cell, 24, 14, 4 + (f % 2), '#2ce8f5');
    drawDisc(cell, 24, 14, 2, '#ffffff');
    return finalizeOutlined(cell);
  });

  return { wpFrames, pylonFrames };
}

// ---------------------------------------------------------------------------
// 3. Write Strips & Update meta-fx.json + meta-mobs.json
// ---------------------------------------------------------------------------

async function writeStripAndMeta(absPath, frames, cellW, cellH) {
  const packed = packStrip(frames, cellW, cellH);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await writePngFile(absPath, packed.sheet);
  return {
    width: packed.width,
    height: packed.height,
    bytes: packed.pngBuffer.length,
    sha256: sha256Hex(packed.pngBuffer),
  };
}

async function main() {
  console.log('[oss-vfx-bosses] Fetching & verifying CC0 tiles from crawl/tiles...');
  const tiles = await loadVerifiedCrawlTiles();
  console.log(`[oss-vfx-bosses] Verified ${Object.keys(tiles).length} CC0 source PNGs (0 unknown-license tiles).`);

  // 1. Build Open-Source VFX Strips
  const metaFx = JSON.parse(await fs.readFile(META_FX_PATH, 'utf8'));
  const vfxSpecs = [
    {
      id: 'fx_light_sword',
      fxGroup: 'slash',
      frames: buildLightSwordFrames(tiles),
      cellW: 48,
      cellH: 48,
      offX: -24,
      offY: -24,
      fps: 16,
      loop: true,
      outlineMode: '4conn',
    },
    {
      id: 'fx_light_slash',
      fxGroup: 'slash',
      frames: await buildLightSlashFrames(tiles),
      cellW: 64,
      cellH: 64,
      offX: -32,
      offY: -32,
      fps: 24,
      loop: false,
      outlineMode: '4conn',
    },
    {
      id: 'fx_fire_orb',
      fxGroup: 'aura',
      frames: await buildFireOrbFrames(tiles),
      cellW: 36,
      cellH: 36,
      offX: -18,
      offY: -18,
      fps: 16,
      loop: true,
      outlineMode: '4conn',
    },
    {
      id: 'fx_lightning_orb',
      fxGroup: 'aura',
      frames: buildLightningOrbFrames(tiles),
      cellW: 36,
      cellH: 36,
      offX: -18,
      offY: -18,
      fps: 18,
      loop: true,
      outlineMode: '4conn',
    },
    {
      id: 'fx_lightning_bolt_blue',
      fxGroup: 'lightning',
      frames: buildVerticalLightningBoltFrames(tiles, 'blue'),
      cellW: 48,
      cellH: 96,
      offX: -24,
      offY: -88,
      fps: 22,
      loop: false,
      outlineMode: '4conn',
    },
    {
      id: 'fx_lightning_bolt_yellow',
      fxGroup: 'lightning',
      frames: buildVerticalLightningBoltFrames(tiles, 'yellow'),
      cellW: 48,
      cellH: 96,
      offX: -24,
      offY: -88,
      fps: 22,
      loop: false,
      outlineMode: '4conn',
    },
  ];

  for (const spec of vfxSpecs) {
    const absPath = path.join(FX_DIR, `${spec.id}.png`);
    const info = await writeStripAndMeta(absPath, spec.frames, spec.cellW, spec.cellH);
    metaFx.sprites[spec.id] = {
      id: spec.id,
      spriteKey: spec.id,
      category: 'fx',
      fxGroup: spec.fxGroup,
      path: `database-ban-sung/sprites/fx/${spec.id}.png`,
      file: `fx/${spec.id}.png`,
      width: info.width,
      height: info.height,
      frames: spec.frames.length,
      cellW: spec.cellW,
      cellH: spec.cellH,
      offX: spec.offX,
      offY: spec.offY,
      fps: spec.fps,
      loop: spec.loop,
      nativeFacing: 'right',
      outlineMode: spec.outlineMode,
      sourceId: 'crawl_tiles_cc0',
      license: 'CC0-1.0',
      ossFetched: true,
      fallback: false,
      bytes: info.bytes,
      sha256: info.sha256,
    };
  }
  await fs.writeFile(META_FX_PATH, JSON.stringify(metaFx, null, 2) + '\n', 'utf8');
  console.log(`[oss-vfx-bosses] Wrote ${vfxSpecs.length} CC0 VFX strips -> ${META_FX_PATH}`);

  // 2. Build All 9 Boss Sprite Strips + Support Pods
  const metaMobs = JSON.parse(await fs.readFile(META_MOBS_PATH, 'utf8'));

  // 2A. Boss I: boss_arsenal (lives directly in normalized/bosses/ per pack-manifest.mjs)
  const arsenal = buildBossArsenalStrips(tiles);
  for (const [state, frames] of Object.entries(arsenal)) {
    const file = `boss_arsenal_${state}.png`;
    await writeStripAndMeta(path.join(NORM_BOSS_DIR, file), frames, 96, 96);
  }

  // 2B. Remaining 8 Bosses in meta-mobs.json
  const bossMap = {
    boss_beholder: buildBossBeholderStrips(tiles),
    boss_colossus: buildBossColossusStrips(tiles),
    boss_overlord: buildBossOverlordStrips(tiles),
    boss_tempest: buildBossTempestStrips(tiles),
    boss_destroyer: buildBossDestroyerStrips(tiles),
    boss_frost_empress: buildBossFrostEmpressStrips(tiles),
    boss_abyssal_leviathan: buildBossLeviathanStrips(tiles),
    boss_storm_herald: buildBossStormHeraldStrips(tiles),
  };

  let bossStripCount = 4; // arsenal's 4 strips
  for (const [bossId, stateFrames] of Object.entries(bossMap)) {
    for (const [state, frames] of Object.entries(stateFrames)) {
      const key = `${bossId}_${state}`;
      const existing = metaMobs.sprites[key];
      if (!existing) {
        throw new Error(`Missing expected meta-mobs key: ${key}`);
      }
      if (existing.frames !== frames.length) {
        throw new Error(`Frame count mismatch for ${key}: expected ${existing.frames}, built ${frames.length}`);
      }
      const absPath = path.join(DB_ROOT, existing.path);
      const info = await writeStripAndMeta(absPath, frames, 96, 96);
      existing.sourceId = 'crawl_tiles_cc0';
      existing.license = 'CC0-1.0';
      existing.url = CRAWL_RAW_BASE;
      existing.fallback = false;
      existing.bytes = info.bytes;
      existing.sha256 = info.sha256;
      bossStripCount++;
    }
  }

  // 2C. Overlord WeakPoint & EMP Pylon CC0 upgrades
  const support = buildOverlordSupportStrips(tiles);
  {
    const wpMeta = metaMobs.sprites.overlord_weakpoint_idle;
    const wpInfo = await writeStripAndMeta(path.join(DB_ROOT, wpMeta.path), support.wpFrames, 32, 32);
    wpMeta.sourceId = 'crawl_tiles_cc0';
    wpMeta.license = 'CC0-1.0';
    wpMeta.url = CRAWL_RAW_BASE;
    wpMeta.bytes = wpInfo.bytes;
    wpMeta.sha256 = wpInfo.sha256;

    const pyMeta = metaMobs.sprites.emp_pylon_idle;
    const pyInfo = await writeStripAndMeta(path.join(DB_ROOT, pyMeta.path), support.pylonFrames, 48, 48);
    pyMeta.sourceId = 'crawl_tiles_cc0';
    pyMeta.license = 'CC0-1.0';
    pyMeta.url = CRAWL_RAW_BASE;
    pyMeta.bytes = pyInfo.bytes;
    pyMeta.sha256 = pyInfo.sha256;
  }

  await fs.writeFile(META_MOBS_PATH, JSON.stringify(metaMobs, null, 2) + '\n', 'utf8');
  console.log(`[oss-vfx-bosses] Wrote ${bossStripCount} boss strips + 2 support strips -> ${META_MOBS_PATH}`);
}

main().catch((err) => {
  console.error('[oss-vfx-bosses] FAILED:', err);
  process.exitCode = 1;
});
