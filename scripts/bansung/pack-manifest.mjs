#!/usr/bin/env node
/**
 * Wave-2B [w14] — Ban Sung Asset Normalizer, Manifest Packer & Provenance Ledger Builder
 *
 * Normalizes and packs all runtime sprites under `database-ban-sung/normalized/**`,
 * indexes every canonical sprite and audio entry + alias needed by `d09`, `d16`,
 * `d17`, `d43`, and `shared/src/bansung/*` into `database-ban-sung/manifest.json`,
 * updates `database-ban-sung/LICENSES.md` with a complete provenance ledger, and
 * validates zero broken paths, binary headers, PNG grid invariants, and licenses.
 *
 * Usage:
 *   node scripts/bansung/pack-manifest.mjs          # Normalize PNGs, write manifest.json & LICENSES.md, run self-check
 *   node scripts/bansung/pack-manifest.mjs --check  # Verify existing normalized/**, manifest.json & LICENSES.md only
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANSUNG_PALETTE_48,
  NORM_CONSTANTS,
  applyOutline4Conn,
  blitImage,
  createImage,
  cropImage,
  detectMagicFormat,
  hexToRgba,
  inspectPngHeader,
  packStrip,
  parseWav,
  quantizeImageToPalette48,
  readPngFile,
  sha256Hex,
  sliceSpriteSheet,
  writePngFile,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const NORM_ROOT = path.join(DB_ROOT, 'normalized');
const MANIFEST_PATH = path.join(DB_ROOT, 'manifest.json');
const LICENSES_PATH = path.join(DB_ROOT, 'LICENSES.md');
const SOURCES_PATH = path.join(DB_ROOT, 'sources.json');

const CHECK_ONLY = process.argv.includes('--check');

const VALID_ID_RE = /^[a-z][a-z0-9_]{2,63}$/;
const VALID_CATEGORIES = new Set([
  'hero', 'weapon', 'pet', 'enemy', 'boss',
  'projectile', 'vfx', 'prop', 'tile', 'ui',
]);
const VALID_FALLBACK_SHAPES = new Set(['rect', 'circle', 'capsule', 'cone']);
const ALLOWED_LICENSES = new Set([
  'CC0-1.0', 'MIT', 'CC-BY-4.0', 'CC-BY-3.0', 'INTERNAL-MIRAGINE', 'GENERATED-SYNTH',
]);

// ============================================================================
// 1. Helpers
// ============================================================================

async function readJson(relPath) {
  return JSON.parse(await fs.readFile(path.join(DB_ROOT, relPath), 'utf8'));
}

function toDbRel(rawPath) {
  const clean = String(rawPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return clean.startsWith('database-ban-sung/') ? clean.slice('database-ban-sung/'.length) : clean;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function defaultFallback(category, id) {
  const key = `${category}:${id}`;
  if (/pyro|fire|flame|barrel_red|crimson|boss_beholder/.test(key)) {
    return { shape: 'capsule', color: '#e43b44', accent: '#feae34' };
  }
  if (/ranger|cyber|plasma|rail|laser|stun|thunder|emp|energy|shield|overlord/.test(key)) {
    return { shape: 'rect', color: '#2ce8f5', accent: '#124e89' };
  }
  if (/knight|iron|armor|colossus|crate|rock|pillar|tomb/.test(key)) {
    return { shape: 'rect', color: '#5a6988', accent: '#c0cbdc' };
  }
  if (/xp_orb/.test(key)) {
    return { shape: 'circle', color: '#3e8948', accent: '#2ce8f5' };
  }
  if (/cactus|scarab|poison|heal|green|vitality/.test(key)) {
    return { shape: 'capsule', color: '#3e8948', accent: '#a7f070' };
  }
  if (/tiger|cat|gold|coin|brass|pedestal/.test(key)) {
    return { shape: 'circle', color: '#ff7a3d', accent: '#fee761' };
  }
  if (category === 'projectile' || category === 'vfx') {
    return { shape: 'circle', color: '#fee761', accent: '#ff7a3d' };
  }
  if (category === 'weapon') {
    return { shape: 'rect', color: '#8b9bb4', accent: '#262b44' };
  }
  if (category === 'tile') {
    return { shape: 'rect', color: '#c9885b', accent: '#733e39' };
  }
  if (category === 'ui') {
    return { shape: 'circle', color: '#181425', accent: '#e6eef8' };
  }
  return { shape: 'capsule', color: '#c0cbdc', accent: '#262b44' };
}

function sanitizeFallback(raw, category, id) {
  if (raw && typeof raw === 'object' && VALID_FALLBACK_SHAPES.has(raw.shape) && /^#[0-9a-fA-F]{6}$/.test(raw.color || '')) {
    const out = { shape: raw.shape, color: raw.color.toLowerCase() };
    if (raw.accent && /^#[0-9a-fA-F]{6}$/.test(raw.accent)) {
      out.accent = raw.accent.toLowerCase();
    }
    return out;
  }
  return defaultFallback(category, id);
}

function mapSpriteCategory(rawCat, meta = {}) {
  if (rawCat === 'mob') return 'enemy';
  if (rawCat === 'pickup') return 'prop';
  if (rawCat === 'gadget') return 'weapon';
  if (rawCat === 'fx') return meta.fxGroup === 'projectile' ? 'projectile' : 'vfx';
  if (VALID_CATEGORIES.has(rawCat)) return rawCat;
  return 'prop';
}

function normSubdirForCategory(cat) {
  switch (cat) {
    case 'hero': return 'heroes';
    case 'weapon': return 'weapons';
    case 'enemy': return 'enemies';
    case 'boss': return 'bosses';
    case 'pet': return 'pets';
    case 'projectile': return 'projectiles';
    case 'vfx': return 'vfx';
    case 'prop': return 'props';
    case 'tile': return 'tiles';
    case 'ui': return 'ui';
    default: return 'props';
  }
}

function sanitizePivot(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const anchorX = Number.isFinite(raw.anchorX) ? Math.round(raw.anchorX) : undefined;
  const anchorY = Number.isFinite(raw.anchorY) ? Math.round(raw.anchorY) : undefined;
  if (anchorX === undefined || anchorY === undefined) return undefined;
  const out = { anchorX, anchorY };
  if (Number.isFinite(raw.muzzleX)) out.muzzleX = Math.round(raw.muzzleX);
  if (Number.isFinite(raw.muzzleY)) out.muzzleY = Math.round(raw.muzzleY);
  return out;
}

// Tiny pixel drawing helpers for missing UI/projectile strips
function makePixelCanvas(w, h) {
  const img = createImage(w, h);
  const put = (x, y, hex, a = 255) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
    const c = hexToRgba(hex);
    const idx = (iy * w + ix) * 4;
    img.data[idx] = c[0];
    img.data[idx + 1] = c[1];
    img.data[idx + 2] = c[2];
    img.data[idx + 3] = a;
  };
  const rect = (x, y, rw, rh, hex, a = 255) => {
    for (let yy = y; yy < y + rh; yy++) {
      for (let xx = x; xx < x + rw; xx++) put(xx, yy, hex, a);
    }
  };
  const disc = (cx, cy, r, hex, a = 255) => {
    const r2 = r * r;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r2) put(xx, yy, hex, a);
      }
    }
  };
  return { img, put, rect, disc };
}

function finalizeOutlinedBadge(img) {
  const q = quantizeImageToPalette48(img, { lutStrength: 1.0, preserveOutline: true });
  return applyOutline4Conn(q, NORM_CONSTANTS.OUTLINE_RGBA, NORM_CONSTANTS.ALPHA_CUTOFF);
}

// ============================================================================
// 2. Normalize Source Sprites -> database-ban-sung/normalized/**
// ============================================================================

async function packSourceSpriteToNormalized(srcRelPath, dstRelPath, meta, recordProvenance) {
  const srcAbs = path.join(DB_ROOT, srcRelPath);
  const dstAbs = path.join(DB_ROOT, dstRelPath);
  const img = await readPngFile(srcAbs);

  const frames = Math.max(1, Math.round(meta.frames || 1));
  const cellW = Math.round(meta.cellW || Math.floor(img.width / frames));
  const cellH = Math.round(meta.cellH || img.height);
  if (img.width !== frames * cellW || img.height !== cellH) {
    throw new Error(`Dimension mismatch on ${srcRelPath}: got ${img.width}x${img.height}, expected ${frames * cellW}x${cellH}`);
  }

  // Re-pack through sliceSpriteSheet + packStrip so every PNG under normalized/
  // is a clean, uniform horizontal strip with verified IHDR dimensions.
  const cells = sliceSpriteSheet(img, cellW, cellH, { cols: frames, rows: 1, count: frames });
  const packed = packStrip(cells, cellW, cellH);

  await fs.mkdir(path.dirname(dstAbs), { recursive: true });
  await fs.writeFile(dstAbs, packed.pngBuffer);
  const sha = sha256Hex(packed.pngBuffer);

  recordProvenance({
    relPath: dstRelPath,
    sourceId: meta.sourceId || 'generated_synth',
    note: `Normalized horizontal strip (${frames}f @ ${cellW}x${cellH}, facing=${meta.nativeFacing || 'right'}, off=[${meta.offX},${meta.offY}]) from \`${srcRelPath}\`; sha256=${sha.slice(0, 12)}`,
  });

  return {
    frames,
    cellW,
    cellH,
    sha256: sha,
    bytes: packed.pngBuffer.length,
  };
}

// ============================================================================
// 3. Synthetic Missing Projectiles & UI / Perk Icons (normalized/ui & projectiles)
// ============================================================================

function buildSyntheticProjectileFrames(kind) {
  if (kind === 'rail_beam') {
    const frames = [0, 1].map((f) => {
      const { img, rect } = makePixelCanvas(32, 8);
      rect(2, 2, 26, 4, '#0095e9', 200);
      rect(4, 2, 24, 4, '#2ce8f5', 255);
      rect(8, 3, 22, 2, '#ffffff', 255);
      rect(27, 2, 4, 4, '#9cf9ff', 255);
      if (f === 1) {
        rect(1, 3, 4, 2, '#9cf9ff', 220);
        rect(29, 3, 3, 2, '#ffffff', 255);
      }
      return img;
    });
    return { frames, cellW: 32, cellH: 8, offX: -16, offY: -4, fps: 24, loop: true };
  }
  if (kind === 'needle_orb') {
    const frames = [0, 1].map((f) => {
      const { img, disc, rect } = makePixelCanvas(16, 16);
      disc(7, 8, 3.3, '#265c42');
      disc(7, 8, 2.2, '#63c74d');
      rect(9, 7, 5, 2, '#a7f070');
      if (f === 1) rect(3, 7, 3, 2, '#a7f070');
      return finalizeOutlinedBadge(img);
    });
    return { frames, cellW: 16, cellH: 16, offX: -8, offY: -8, fps: 12, loop: true };
  }
  // sniper_slug
  const frames = [0, 1].map((f) => {
    const { img, rect } = makePixelCanvas(24, 10);
    rect(2 + f, 4, 10, 2, '#c72936');
    rect(8, 3, 10, 4, '#e43b44');
    rect(14, 4, 6, 2, '#fee761');
    rect(19, 4, 2, 2, '#ffffff');
    return finalizeOutlinedBadge(img);
  });
  return { frames, cellW: 24, cellH: 10, offX: -12, offY: -5, fps: 20, loop: true };
}

function buildHudIconImage(id) {
  const { img, put, rect, disc } = makePixelCanvas(16, 16);
  if (id === 'ui_crosshair_dot') {
    rect(7, 2, 2, 3, '#2ce8f5');
    rect(7, 11, 2, 3, '#2ce8f5');
    rect(2, 7, 3, 2, '#2ce8f5');
    rect(11, 7, 3, 2, '#2ce8f5');
    rect(7, 7, 2, 2, '#ffffff');
    return finalizeOutlinedBadge(img);
  }
  if (id === 'ui_icon_shield') {
    rect(3, 2, 10, 6, '#124e89');
    rect(4, 3, 8, 5, '#0095e9');
    rect(4, 8, 8, 3, '#2ce8f5');
    rect(5, 11, 6, 2, '#2ce8f5');
    rect(6, 13, 4, 1, '#9cf9ff');
    rect(5, 4, 2, 5, '#9cf9ff');
    return finalizeOutlinedBadge(img);
  }
  if (id === 'ui_icon_heart') {
    rect(3, 4, 4, 3, '#e43b44');
    rect(9, 4, 4, 3, '#e43b44');
    rect(2, 5, 12, 4, '#e43b44');
    rect(4, 9, 8, 2, '#c72936');
    rect(6, 11, 4, 2, '#c72936');
    rect(4, 5, 2, 2, '#ff9ee2');
    return finalizeOutlinedBadge(img);
  }
  if (id === 'ui_icon_energy') {
    rect(8, 2, 3, 4, '#9cf9ff');
    rect(5, 5, 6, 3, '#2ce8f5');
    rect(6, 8, 5, 3, '#0095e9');
    rect(5, 11, 3, 3, '#2ce8f5');
    put(9, 3, '#ffffff');
    return finalizeOutlinedBadge(img);
  }
  // ui_icon_coin
  disc(7.5, 7.5, 5.2, '#feae34');
  disc(7.5, 7.5, 3.6, '#fee761');
  rect(7, 5, 2, 6, '#ffffff');
  return finalizeOutlinedBadge(img);
}

const PERK_STYLES = {
  perk_vitality: { bg: '#4c1424', rim: '#c72936', fg: '#e43b44', hi: '#ffffff', glyph: 'cross' },
  perk_bastion: { bg: '#143464', rim: '#0095e9', fg: '#2ce8f5', hi: '#ffffff', glyph: 'shield' },
  perk_energy: { bg: '#124e89', rim: '#2ce8f5', fg: '#9cf9ff', hi: '#ffffff', glyph: 'bolt' },
  perk_quick_hands: { bg: '#733e39', rim: '#feae34', fg: '#fee761', hi: '#ffffff', glyph: 'fast' },
  perk_swift_boots: { bg: '#193c3e', rim: '#3e8948', fg: '#63c74d', hi: '#a7f070', glyph: 'wing' },
  perk_magnet: { bg: '#381d4a', rim: '#96419c', fg: '#ff9ee2', hi: '#e43b44', glyph: 'magnet' },
  perk_pierce: { bg: '#143464', rim: '#2ce8f5', fg: '#9cf9ff', hi: '#ffffff', glyph: 'arrow' },
  perk_blast: { bg: '#4c1424', rim: '#ff7a3d', fg: '#feae34', hi: '#fee761', glyph: 'star' },
  perk_vampiric: { bg: '#4c1424', rim: '#8a1c31', fg: '#e43b44', hi: '#ff9ee2', glyph: 'drop' },
  perk_coop_aura: { bg: '#193c3e', rim: '#63c74d', fg: '#a7f070', hi: '#fee761', glyph: 'aura' },
  perk_ricochet: { bg: '#45242e', rim: '#feae34', fg: '#fee761', hi: '#ffffff', glyph: 'zig' },
  perk_static_shield: { bg: '#262b44', rim: '#2ce8f5', fg: '#9cf9ff', hi: '#ff9ee2', glyph: 'ring' },
};

function buildPerkBadgeImage(perkId) {
  const st = PERK_STYLES[perkId] || PERK_STYLES.perk_vitality;
  const { img, rect, disc } = makePixelCanvas(24, 24);
  rect(2, 2, 20, 20, st.rim);
  rect(4, 4, 16, 16, st.bg);
  switch (st.glyph) {
    case 'cross':
      rect(10, 6, 4, 12, st.fg);
      rect(6, 10, 12, 4, st.fg);
      rect(11, 7, 2, 4, st.hi);
      break;
    case 'shield':
      rect(7, 6, 10, 7, st.fg);
      rect(8, 13, 8, 3, st.fg);
      rect(10, 16, 4, 2, st.fg);
      rect(9, 8, 2, 6, st.hi);
      break;
    case 'bolt':
      rect(12, 6, 4, 4, st.fg);
      rect(9, 9, 6, 4, st.hi);
      rect(10, 13, 4, 5, st.fg);
      break;
    case 'fast':
      rect(7, 8, 3, 8, st.fg);
      rect(10, 10, 2, 4, st.hi);
      rect(13, 8, 3, 8, st.fg);
      rect(16, 10, 2, 4, st.hi);
      break;
    case 'wing':
      rect(7, 13, 9, 4, st.fg);
      rect(7, 8, 4, 5, st.fg);
      rect(11, 9, 6, 3, st.hi);
      break;
    case 'magnet':
      rect(7, 7, 3, 8, st.hi);
      rect(14, 7, 3, 8, '#0095e9');
      rect(7, 14, 10, 3, st.fg);
      rect(7, 7, 3, 2, '#ffffff');
      rect(14, 7, 3, 2, '#ffffff');
      break;
    case 'arrow':
      rect(6, 11, 10, 2, st.fg);
      rect(13, 8, 3, 8, st.fg);
      rect(16, 10, 2, 4, st.hi);
      break;
    case 'star':
      disc(12, 12, 4.2, st.fg);
      rect(11, 5, 2, 14, st.hi);
      rect(5, 11, 14, 2, st.hi);
      break;
    case 'drop':
      rect(11, 6, 2, 3, st.hi);
      rect(9, 9, 6, 4, st.fg);
      disc(11.5, 14, 3.6, st.fg);
      break;
    case 'aura':
      disc(9, 11, 2.5, st.fg);
      disc(15, 11, 2.5, st.fg);
      rect(7, 14, 10, 3, st.hi);
      break;
    case 'zig':
      rect(6, 14, 4, 2, st.fg);
      rect(10, 10, 4, 4, st.hi);
      rect(14, 8, 4, 3, st.fg);
      break;
    default:
      disc(12, 12, 5.2, st.fg);
      disc(12, 12, 3.2, st.bg);
      rect(11, 9, 2, 6, st.hi);
      break;
  }
  return finalizeOutlinedBadge(img);
}

async function generatePortraitFromHero(heroClass, heroIdleNormRel, sourceId, recordProvenance) {
  const dstRel = `normalized/ui/ui_portrait_${heroClass}.png`;
  const heroImg = await readPngFile(path.join(DB_ROOT, heroIdleNormRel));
  const f0 = cropImage(heroImg, 0, 0, Math.min(48, heroImg.width), Math.min(48, heroImg.height));
  const headCrop = cropImage(f0, 10, 4, Math.min(28, f0.width - 10), Math.min(28, f0.height - 4));

  const accents = {
    mascot: '#feae34',
    ranger: '#2ce8f5',
    pyro: '#e43b44',
    knight: '#8b9bb4',
    laser: '#ff9ee2',
  };
  const { img, rect } = makePixelCanvas(32, 32);
  rect(0, 0, 32, 32, '#181425');
  rect(1, 1, 30, 30, accents[heroClass] || '#5a6988');
  rect(3, 3, 26, 26, '#262b44');
  blitImage(headCrop, img, 2, 2);

  const q = quantizeImageToPalette48(img, { lutStrength: 1.0, preserveOutline: true });
  const packed = packStrip([q], 32, 32);
  await writePngFile(path.join(DB_ROOT, dstRel), packed.sheet);

  recordProvenance({
    relPath: dstRel,
    sourceId,
    note: `Cropped & framed 32x32 HUD portrait from \`${heroIdleNormRel}\`; sha256=${sha256Hex(packed.pngBuffer).slice(0, 12)}`,
  });
  return {
    path: dstRel,
    category: 'ui',
    frames: 1,
    cellW: 32,
    cellH: 32,
    offX: -16,
    offY: -16,
    fps: 0,
    loop: false,
    fallback: { shape: 'rect', color: accents[heroClass] || '#5a6988', accent: '#262b44' },
    sourceId,
  };
}

// ============================================================================
// 4. Build Sprites + Audio Manifests
// ============================================================================

async function buildPack() {
  const metaHeroes = await readJson('sprites/heroes/meta-heroes.json');
  const metaMiragine = await readJson('sprites/miragine/meta-miragine.json');
  const metaSpriteFx = await readJson('sprites/fx/meta-fx.json');
  const metaMobs = await readJson('sprites/mobs/meta-mobs.json');
  const metaGuns = await readJson('audio/sfx/weapons/meta-guns.json');
  const metaAudioFx = await readJson('audio/sfx/fx/meta-fx.json');

  // Cleanly recreate normalized/** subdirectories
  for (const sub of ['heroes', 'weapons', 'enemies', 'bosses', 'pets', 'projectiles', 'vfx', 'props', 'tiles', 'ui']) {
    await fs.mkdir(path.join(NORM_ROOT, sub), { recursive: true });
  }

  const provenanceRows = [];
  const recordProvenance = (row) => provenanceRows.push(row);

  const sprites = {};
  const setSprite = (id, entry) => {
    const key = normalizeId(id);
    if (!VALID_ID_RE.test(key)) {
      throw new Error(`Invalid sprite manifest ID: "${id}" -> "${key}"`);
    }
    sprites[key] = entry;
  };

  // Helper to pack canonical entry + bind aliases to the exact normalized PNG
  const addNormalizedEntry = async (id, srcRawPath, meta, explicitCat = null, explicitNormRel = null, aliases = []) => {
    const key = normalizeId(id);
    const cat = explicitCat || mapSpriteCategory(meta.category, meta);
    const srcRel = toDbRel(srcRawPath);
    const normRel = explicitNormRel ? toDbRel(explicitNormRel) : `normalized/${normSubdirForCategory(cat)}/${key}.png`;

    const packed = await packSourceSpriteToNormalized(srcRel, normRel, meta, recordProvenance);
    const entry = {
      path: normRel,
      category: cat,
      frames: packed.frames,
      cellW: packed.cellW,
      cellH: packed.cellH,
      offX: Math.round(meta.offX ?? -Math.floor(packed.cellW / 2)),
      offY: Math.round(meta.offY ?? -(packed.cellH - NORM_CONSTANTS.FOOT_PAD_BOTTOM)),
      fps: Number.isFinite(meta.fps) ? meta.fps : 0,
      loop: Boolean(meta.loop),
      fallback: sanitizeFallback(meta.fallback, cat, key),
      sourceId: meta.sourceId || 'generated_synth',
    };
    if (cat === 'pet' && meta.nativeFacing === 'left') {
      entry.nativeFacing = 'left';
    }
    const pivot = sanitizePivot(meta.pivot);
    if (pivot) entry.pivot = pivot;

    setSprite(key, entry);
    for (const a of aliases) {
      if (a) setSprite(a, { ...entry });
    }
    return entry;
  };

  // 4A. Heroes & Pets (meta-heroes.json)
  for (const [id, m] of Object.entries(metaHeroes.sprites || {})) {
    const cat = m.category === 'pet' ? 'pet' : 'hero';
    await addNormalizedEntry(id, m.path, m, cat, m.normalizedPath, m.aliases || []);
  }

  // 4B. Miragine reused sprites (meta-miragine.json)
  const miragineAliasMap = {
    ui_shadow_unit: ['prop_shadow', 'shadow'],
    prop_crystal_red: ['a_crystal'],
    vfx_fireball: ['proj_fireball', 'fireball', 'fx_fireball'],
    vfx_thunderball: ['proj_thunderball', 'thunderball', 'fx_thunderball'],
    vfx_storm: ['fx_storm', 'storm'],
  };
  for (const [id, m] of Object.entries(metaMiragine.sprites || {})) {
    const key = normalizeId(id);
    let cat = mapSpriteCategory(m.category, m);
    let normRel = `normalized/${normSubdirForCategory(cat)}/${key}.png`;
    if (key === 'vfx_fireball') {
      cat = 'projectile';
      normRel = 'normalized/projectiles/proj_fireball.png';
    } else if (key === 'vfx_thunderball') {
      cat = 'projectile';
      normRel = 'normalized/projectiles/proj_thunderball.png';
    }
    await addNormalizedEntry(key, m.path, m, cat, normRel, miragineAliasMap[key] || []);
  }
  // Keep explicit alias between vfx_fireball/proj_fireball & vfx_thunderball/proj_thunderball with category semantics
  if (sprites.proj_fireball) {
    sprites.vfx_fireball = { ...sprites.proj_fireball, category: 'vfx' };
    sprites.fx_fireball = { ...sprites.proj_fireball, category: 'vfx' };
  }
  if (sprites.proj_thunderball) {
    sprites.vfx_thunderball = { ...sprites.proj_thunderball, category: 'vfx' };
    sprites.fx_thunderball = { ...sprites.proj_thunderball, category: 'vfx' };
  }
  if (sprites.ui_shadow_unit) {
    sprites.prop_shadow = { ...sprites.ui_shadow_unit, category: 'ui' };
    sprites.shadow = { ...sprites.ui_shadow_unit, category: 'ui' };
  }

  // Track Miragine JPG backdrops in provenance ledger cleanly (not inside sprites[], which requires PNG IHDR)
  for (const t of Object.values(metaMiragine.terrains || {})) {
    recordProvenance({
      relPath: toDbRel(t.path),
      sourceId: t.sourceId || 'internal_miragine',
      note: `Copied JPEG arena backdrop (${t.width}x${t.height}) from \`${t.src}\`; sha256=${String(t.sha256).slice(0, 12)}`,
    });
  }

  // 4C. Weapons, Gadgets, Projectiles, VFX (meta-fx.json)
  const fxExtraAliases = {
    gun_pistol: ['wpn_pistol', 'pistol'],
    gun_rifle: ['wpn_rifle', 'wpn_rifle_assault', 'rifle'],
    gun_smg: ['wpn_smg', 'smg'],
    gun_shotgun: ['wpn_shotgun', 'shotgun'],
    w_frag_launcher: ['wpn_grenade_launcher', 'wpn_launcher_frag', 'grenade_launcher'],
    w_stun_launcher: ['wpn_stun_launcher', 'wpn_launcher_stun', 'stun_launcher'],
    w_triple_bazooka: ['wpn_bazooka', 'wpn_launcher_bazooka', 'bazooka'],
    w_mine_gun: ['wpn_mine_gun', 'wpn_launcher_mine', 'mine_gun'],
    plasma_rifle: ['wpn_plasma_rifle', 'wpn_energy_plasma'],
    railgun_piercer: ['wpn_railgun', 'wpn_energy_railgun', 'railgun'],
    lightning_staff: ['wpn_lightning_staff', 'wpn_energy_staff'],
    arcane_book: ['wpn_arcane_book', 'wpn_energy_book'],
    wpn_crescent_blade: ['wpn_melee_crescent', 'crescent_blade'],
    wpn_reaper_scythe: ['wpn_melee_scythe', 'reaper_scythe'],
    wpn_shock_baton: ['wpn_melee_baton', 'shock_baton'],
    gadget_stun_bomb: ['wpn_gadget_stun_bomb', 'stun_bomb'],
    gadget_cluster_bomb: ['wpn_gadget_cluster_bomb', 'cluster_bomb'],
    gadget_auto_turret: ['wpn_gadget_auto_turret', 'auto_turret'],
    gadget_heal_drone: ['wpn_gadget_heal_drone', 'heal_drone'],
    bullet_kinetic_sm: ['proj_bullet_kinetic'],
    p_rocket: ['proj_rocket_he'],
    p_stun_canister: ['proj_grenade_stun', 'fx_bomb_stun'],
    p_frag_grenade: ['fx_bomb_frag'],
    gadget_bombs: ['fx_bomb_mortar'],
    fx_muzzle_kinetic: ['vfx_muzzle_kinetic'],
    fx_explosion_he: ['vfx_explosion_he', 'fx_blast_he'],
    fx_explosion_stun: ['fx_blast_stun'],
    fx_stun_ring: ['vfx_stun_ring'],
    fx_stun_star: ['vfx_stun_stars'],
    fx_dash_dust: ['vfx_dash_dust'],
    gun_dual_pistols: ['dual_pistols'],
    gun_plasma_shotgun: ['plasma_shotgun'],
    gun_twin_smg: ['twin_smg'],
    gun_ion_beam: ['ion_beam'],
    gun_cluster_rpg: ['cluster_rpg'],
    gun_tesla_coil: ['tesla_coil'],
    gun_void_cannon: ['void_cannon'],
    gun_blizzard_carbine: ['blizzard_carbine'],
    gun_ricochet_disc: ['ricochet_disc'],
    gun_phantom_bow: ['phantom_bow'],
    gun_magma_spitter: ['magma_spitter'],
    gun_chronos_rifle: ['chronos_rifle'],
    gun_orbital_cannon: ['orbital_cannon'],
    danmaku_orb: ['proj_danmaku_orb'],
    danmaku_lance: ['proj_danmaku_lance'],
    danmaku_star: ['proj_danmaku_star'],
    danmaku_crescent: ['proj_danmaku_crescent'],
    danmaku_ring: ['proj_danmaku_ring'],
  };
  for (const [id, m] of Object.entries(metaSpriteFx.sprites || {})) {
    const key = normalizeId(id);
    const cat = mapSpriteCategory(m.category, m);
    await addNormalizedEntry(key, m.path, m, cat, null, fxExtraAliases[key] || []);
  }

  // 4D. Mobs, Bosses, Tiles, Props, Pickups (meta-mobs.json)
  const mobExtraAliases = {
    scarab_idle: ['mob_scarab_idle'],
    scarab_run: ['mob_scarab_run'],
    scarab_attack: ['mob_scarab_attack'],
    scarab_dead: ['mob_scarab_dead'],
    skirmisher_idle: ['mob_skirmisher_idle'],
    skirmisher_run: ['mob_skirmisher_run'],
    skirmisher_attack: ['mob_skirmisher_attack'],
    skirmisher_lunge: ['mob_skirmisher_lunge'],
    skirmisher_dead: ['mob_skirmisher_dead'],
    bomb_goblin_idle: ['mob_bomb_goblin_idle', 'mob_bomber_idle'],
    bomb_goblin_run: ['mob_bomb_goblin_run', 'mob_bomber_run'],
    bomb_goblin_fuse_run: ['mob_bomb_goblin_fuse_run', 'mob_goblin_bomber_attack'],
    bomb_goblin_spark: ['mob_bomb_goblin_spark'],
    bomb_goblin_dead: ['mob_bomb_goblin_dead', 'mob_bomber_dead'],
    cactus_brute_idle: ['mob_cactus_brute_idle', 'mob_brute_idle'],
    cactus_brute_run: ['mob_cactus_brute_run', 'mob_brute_run'],
    cactus_brute_attack: ['mob_cactus_brute_attack', 'mob_brute_attack'],
    cactus_brute_slam: ['mob_cactus_brute_slam'],
    cactus_brute_dead: ['mob_cactus_brute_dead', 'mob_brute_dead'],
    cactus_spitter_idle: ['mob_cactus_spitter_idle'],
    cactus_spitter_run: ['mob_cactus_spitter_run'],
    cactus_spitter_attack: ['mob_cactus_spitter_attack'],
    cactus_spitter_dead: ['mob_cactus_spitter_dead'],
    laser_sniper_idle: ['mob_laser_sniper_idle'],
    laser_sniper_run: ['mob_laser_sniper_run'],
    laser_sniper_attack: ['mob_laser_sniper_attack'],
    laser_sniper_dead: ['mob_laser_sniper_dead'],
    pyro_shaman_idle: ['mob_pyro_shaman_idle'],
    pyro_shaman_run: ['mob_pyro_shaman_run'],
    pyro_shaman_attack: ['mob_pyro_shaman_attack'],
    pyro_shaman_dead: ['mob_pyro_shaman_dead'],
    thunder_mage_idle: ['mob_thunder_mage_idle'],
    thunder_mage_run: ['mob_thunder_mage_run'],
    thunder_mage_attack: ['mob_thunder_mage_attack'],
    thunder_mage_dead: ['mob_thunder_mage_dead'],
    iron_drone_idle: ['mob_iron_drone_idle'],
    iron_drone_run: ['mob_iron_drone_run'],
    iron_drone_attack: ['mob_iron_drone_attack'],
    iron_drone_dead: ['mob_iron_drone_dead'],
    boss_beholder_idle: ['boss_sand_beholder_idle', 'boss_beholder'],
    boss_beholder_move: ['boss_sand_beholder_move'],
    boss_beholder_volley_cast: ['boss_sand_beholder_volley_cast'],
    boss_beholder_slam_leap: ['boss_sand_beholder_slam_leap'],
    boss_beholder_beam_windup: ['boss_sand_beholder_beam_windup'],
    boss_beholder_enrage_roar: ['boss_sand_beholder_enrage_roar'],
    boss_beholder_stagger: ['boss_sand_beholder_stagger'],
    boss_beholder_dead: ['boss_sand_beholder_dead'],
    boss_colossus_idle: ['boss_dread_colossus_idle', 'boss_colossus'],
    boss_colossus_run: ['boss_dread_colossus_run', 'boss_dread_colossus_charge'],
    boss_colossus_attack: ['boss_dread_colossus_attack'],
    boss_colossus_overheat_stun: ['boss_dread_colossus_overheat_stun'],
    boss_colossus_dead: ['boss_dread_colossus_dead'],
    boss_overlord_idle: ['boss_overlord_core_idle', 'overlord_hull_idle', 'boss_overlord'],
    boss_overlord_charge: ['boss_overlord_core_laser', 'overlord_hull_charge'],
    boss_overlord_stun: ['boss_overlord_core_stun', 'overlord_hull_stun'],
    boss_overlord_dead: ['boss_overlord_core_dead', 'overlord_hull_dead'],
    boss_tempest_idle: ['boss_tempest'],
    boss_destroyer_idle: ['boss_destroyer'],
    boss_frost_empress_idle: ['boss_frost_empress'],
    boss_abyssal_leviathan_idle: ['boss_abyssal_leviathan'],
    boss_storm_herald_idle: ['boss_storm_herald'],
    overlord_weakpoint_idle: ['overlord_weakpoint'],
    emp_pylon_idle: ['emp_pylon'],
    prop_wood_crate: ['prop_crate_wood', 'prop_crate', 'crate', 'wood_crate', 'crypt_crate', 'cyber_crate'],
    prop_iron_crate: ['iron_crate', 'crypt_iron_crate', 'cyber_vault_crate'],
    prop_clay_pot: ['urn', 'desert_pot', 'crypt_urn', 'cyber_canister'],
    prop_barrel_red: ['prop_barrel_tnt', 'prop_barrel', 'barrel_red'],
    prop_cactus: ['prop_cactus_tall', 'cactus'],
    pk_energy_orb: ['prop_pickup_energy'],
    pk_hp_orb: ['prop_pickup_hp'],
    pk_armor_plate: ['prop_pickup_armor'],
    pk_coin: ['prop_pickup_coin'],
    pk_xp_orb: ['prop_pickup_xp', 'xp_orb'],
  };
  for (const [id, m] of Object.entries(metaMobs.sprites || {})) {
    const key = normalizeId(id);
    const cat = mapSpriteCategory(m.category, m);
    const aliases = [...(m.aliases || []), ...(mobExtraAliases[key] || [])];
    await addNormalizedEntry(key, m.path, m, cat, null, aliases);
  }

  // 4E. Synthesize Missing Shared/d09 Projectiles & UI/Perk Icons
  for (const projId of ['rail_beam', 'needle_orb', 'sniper_slug']) {
    const built = buildSyntheticProjectileFrames(projId);
    const packed = packStrip(built.frames, built.cellW, built.cellH);
    const normRel = `normalized/projectiles/${projId}.png`;
    await writePngFile(path.join(DB_ROOT, normRel), packed.sheet);
    const sha = sha256Hex(packed.pngBuffer);
    recordProvenance({
      relPath: normRel,
      sourceId: 'generated_synth',
      note: `Synthesized missing shared projectile strip (${built.frames.length}f @ ${built.cellW}x${built.cellH}); sha256=${sha.slice(0, 12)}`,
    });
    setSprite(projId, {
      path: normRel,
      category: 'projectile',
      frames: built.frames.length,
      cellW: built.cellW,
      cellH: built.cellH,
      offX: built.offX,
      offY: built.offY,
      fps: built.fps,
      loop: built.loop,
      fallback: defaultFallback('projectile', projId),
      sourceId: 'generated_synth',
    });
  }

  // 4E-2. Retain pre-normalized Arsenal Boss & Sniper/Laser/Electric Gun sheets on disk
  const preservedNormalizedEntries = [
    {
      id: 'gun_sniper_rifle',
      relPath: 'normalized/weapons/gun_sniper_rifle.png',
      category: 'weapon',
      frames: 3,
      cellW: 48,
      cellH: 18,
      offX: -12,
      offY: -9,
      fps: 14,
      loop: false,
      pivot: { anchorX: 12, anchorY: 9, muzzleX: 46, muzzleY: 8, ejectX: 20, ejectY: 8, shoulderOffsetX: 12, shoulderLiftY: 9, shoulderR: 7 },
      note: 'Pre-normalized long-barrel sniper rifle sprite strip (3f @ 48x18)',
    },
    {
      id: 'gun_laser_cannon',
      relPath: 'normalized/weapons/gun_laser_cannon.png',
      category: 'weapon',
      frames: 3,
      cellW: 44,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 16,
      loop: false,
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 42, muzzleY: 9, ejectX: 18, ejectY: 9, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      note: 'Pre-normalized prism laser cannon sprite strip (3f @ 44x18)',
    },
    {
      id: 'gun_electric_gun',
      relPath: 'normalized/weapons/gun_electric_gun.png',
      category: 'weapon',
      frames: 3,
      cellW: 38,
      cellH: 18,
      offX: -10,
      offY: -9,
      fps: 18,
      loop: false,
      pivot: { anchorX: 10, anchorY: 9, muzzleX: 36, muzzleY: 9, ejectX: 16, ejectY: 9, shoulderOffsetX: 10, shoulderLiftY: 9, shoulderR: 7 },
      note: 'Pre-normalized arc coil gun sprite strip (3f @ 38x18)',
    },
    {
      id: 'boss_arsenal_idle',
      relPath: 'normalized/bosses/boss_arsenal_idle.png',
      category: 'boss',
      frames: 4,
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -94,
      fps: 8,
      loop: true,
      sourceId: 'crawl_tiles_cc0',
      note: 'CC0 Boss I Arsenal Dread Gunner idle strip (4f @ 96x96)',
    },
    {
      id: 'boss_arsenal_run',
      relPath: 'normalized/bosses/boss_arsenal_run.png',
      category: 'boss',
      frames: 4,
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -94,
      fps: 10,
      loop: true,
      sourceId: 'crawl_tiles_cc0',
      note: 'CC0 Boss I Arsenal Dread Gunner run strip (4f @ 96x96)',
    },
    {
      id: 'boss_arsenal_attack',
      relPath: 'normalized/bosses/boss_arsenal_attack.png',
      category: 'boss',
      frames: 4,
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -94,
      fps: 12,
      loop: false,
      sourceId: 'crawl_tiles_cc0',
      note: 'CC0 Boss I Arsenal Dread Gunner attack strip (4f @ 96x96)',
    },
    {
      id: 'boss_arsenal_dead',
      relPath: 'normalized/bosses/boss_arsenal_dead.png',
      category: 'boss',
      frames: 4,
      cellW: 96,
      cellH: 96,
      offX: -48,
      offY: -94,
      fps: 8,
      loop: false,
      sourceId: 'crawl_tiles_cc0',
      note: 'CC0 Boss I Arsenal Dread Gunner dead strip (4f @ 96x96)',
    },
  ];
  for (const pre of preservedNormalizedEntries) {
    const absPre = path.join(DB_ROOT, pre.relPath);
    const preBuf = await fs.readFile(absPre).catch(() => null);
    if (!preBuf) continue;
    const sha = sha256Hex(preBuf);
    const preSourceId = pre.sourceId || 'generated_synth';
    recordProvenance({
      relPath: pre.relPath,
      sourceId: preSourceId,
      note: `${pre.note}; sha256=${sha.slice(0, 12)}`,
    });
    setSprite(pre.id, {
      path: pre.relPath,
      category: pre.category,
      frames: pre.frames,
      cellW: pre.cellW,
      cellH: pre.cellH,
      offX: pre.offX,
      offY: pre.offY,
      fps: pre.fps,
      loop: pre.loop,
      ...(pre.pivot ? { pivot: pre.pivot } : {}),
      fallback: defaultFallback(pre.category, pre.id),
      sourceId: preSourceId,
    });
  }

  for (const cls of ['mascot', 'ranger', 'pyro', 'knight', 'laser']) {
    const heroIdle = sprites[`hero_${cls}_idle`];
    const portraitEntry = await generatePortraitFromHero(cls, heroIdle.path, heroIdle.sourceId, recordProvenance);
    setSprite(`ui_portrait_${cls}`, portraitEntry);
    if (cls === 'mascot') {
      setSprite('ui_portrait_gunner', { ...portraitEntry });
    }
  }

  for (const hudId of ['ui_crosshair_dot', 'ui_icon_shield', 'ui_icon_heart', 'ui_icon_energy', 'ui_icon_coin']) {
    const iconImg = buildHudIconImage(hudId);
    const packed = packStrip([iconImg], 16, 16);
    const normRel = `normalized/ui/${hudId}.png`;
    await writePngFile(path.join(DB_ROOT, normRel), packed.sheet);
    const sha = sha256Hex(packed.pngBuffer);
    recordProvenance({
      relPath: normRel,
      sourceId: 'generated_synth',
      note: `Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=${sha.slice(0, 12)}`,
    });
    setSprite(hudId, {
      path: normRel,
      category: 'ui',
      frames: 1,
      cellW: 16,
      cellH: 16,
      offX: -8,
      offY: -8,
      fps: 0,
      loop: false,
      fallback: defaultFallback('ui', hudId),
      sourceId: 'generated_synth',
    });
  }

  for (const perkId of Object.keys(PERK_STYLES)) {
    const iconImg = buildPerkBadgeImage(perkId);
    const packed = packStrip([iconImg], 24, 24);
    const normRel = `normalized/ui/${perkId}.png`;
    await writePngFile(path.join(DB_ROOT, normRel), packed.sheet);
    const sha = sha256Hex(packed.pngBuffer);
    recordProvenance({
      relPath: normRel,
      sourceId: 'generated_synth',
      note: `Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=${sha.slice(0, 12)}`,
    });
    setSprite(perkId, {
      path: normRel,
      category: 'ui',
      frames: 1,
      cellW: 24,
      cellH: 24,
      offX: -12,
      offY: -12,
      fps: 0,
      loop: false,
      fallback: defaultFallback('ui', perkId),
      sourceId: 'generated_synth',
    });
  }

  // 4F. Build Audio Manifest Section (d09 schema + d16/d43/shared coverage)
  const audio = {};
  const audioProvenanceSeen = new Set();

  const registerAudioFileProvenance = (relPath, meta) => {
    const clean = toDbRel(relPath);
    if (!clean || audioProvenanceSeen.has(clean)) return;
    audioProvenanceSeen.add(clean);
    const sha = meta.sha256 ? String(meta.sha256).slice(0, 12) : 'verified';
    const origin = meta.url || meta.source || meta.src || 'pipeline';
    recordProvenance({
      relPath: clean,
      sourceId: meta.sourceId || 'generated_synth',
      note: `${meta.kind === 'bgm' ? 'BGM track' : 'SFX clip'} (${meta.durationMs}ms) from ${origin}; sha256=${sha}`,
    });
  };

  const makeAudioEntry = (m, defaultKind = 'sfx') => {
    const mainPath = toDbRel(m.path);
    const entry = {
      path: mainPath,
      kind: m.kind === 'bgm' || defaultKind === 'bgm' ? 'bgm' : 'sfx',
      durationMs: Math.max(1, Math.round(m.durationMs || 250)),
      gain: Number(clamp(Number.isFinite(m.gain) ? m.gain : 0.7, 0.05, 1.0).toFixed(3)),
      loop: m.kind === 'bgm' || defaultKind === 'bgm' ? true : Boolean(m.loop),
      synthFallback: String(m.synthFallback || normalizeId(m.id) || 'ui_click'),
      sourceId: m.sourceId || 'generated_synth',
    };
    if (m.fallbackPath) {
      const fb = toDbRel(m.fallbackPath);
      if (fb && fb !== mainPath) entry.fallbackPath = fb;
    }
    if (Array.isArray(m.variations) && m.variations.length > 0) {
      entry.variations = [...new Set(m.variations.map(toDbRel))];
    }
    registerAudioFileProvenance(mainPath, m);
    if (entry.fallbackPath) {
      const fb = m.wavFallback || null;
      const fbOrigin =
        fb?.origin === 'synth_wav'
          ? 'synth_wav'
          : (fb?.origin || m.url || m.source || m.src || 'pipeline');
      registerAudioFileProvenance(entry.fallbackPath, {
        ...m,
        sourceId: fb?.sourceId || m.sourceId || 'generated_synth',
        url: fbOrigin,
        durationMs: fb?.durationMs || m.wavDurationMs || m.durationMs,
        sha256: fb?.sha256 || m.wavSha256 || m.sha256,
      });
    }
    return entry;
  };

  const setAudio = (id, entry) => {
    const key = normalizeId(id);
    if (!VALID_ID_RE.test(key)) {
      throw new Error(`Invalid audio manifest ID: "${id}" -> "${key}"`);
    }
    audio[key] = entry;
  };

  for (const [id, m] of Object.entries(metaGuns.entries || {})) {
    setAudio(id, makeAudioEntry(m, 'sfx'));
  }
  for (const [id, m] of Object.entries(metaAudioFx.sfx || {})) {
    setAudio(id, makeAudioEntry(m, 'sfx'));
  }
  for (const [id, m] of Object.entries(metaAudioFx.bgm || {})) {
    setAudio(id, makeAudioEntry(m, 'bgm'));
  }
  for (const [id, m] of Object.entries(metaMiragine.audio || {})) {
    setAudio(id, makeAudioEntry(m, 'sfx'));
  }

  // Bind meta-guns aliases
  for (const [aliasId, targetId] of Object.entries(metaGuns.aliases || {})) {
    const target = audio[normalizeId(targetId)];
    if (target) {
      setAudio(aliasId, { ...target, synthFallback: normalizeId(aliasId) });
    }
  }

  // Bind meta-audio-fx canonicalGroups (preserve variations across the whole group)
  for (const [groupId, memberIds] of Object.entries(metaAudioFx.canonicalGroups || {})) {
    const members = (memberIds || []).map((mid) => audio[normalizeId(mid)]).filter(Boolean);
    if (members.length === 0) continue;
    const primary = members[0];
    const vars = [...new Set(members.map((m) => m.path))];
    const entry = {
      ...primary,
      synthFallback: normalizeId(groupId),
    };
    if (vars.length > 1) entry.variations = vars;
    setAudio(groupId, entry);
  }

  // Ensure ALL d43, d16, d09, d07, d23, d26-39 & shared SFX/BGM aliases resolve cleanly
  const extraAudioAliases = [
    // d43 BGM short IDs
    ['menu', 'bgm_lobby', 'bgm_menu'],
    ['combat', 'bgm_desert', 'bgm_combat'],
    ['boss', 'bgm_boss_chiptune', 'bgm_boss'],
    ['victory', 'bgm_victory', 'bgm_victory'],
    ['defeat', 'bgm_defeat', 'bgm_defeat'],
    // d43 + d16 missing weapon/melee/caster aliases
    ['gun_grenade', 'sfx_wpn_shotgun_v2', 'gun_grenade'],
    ['gun_concussion', 'sfx_wpn_laser_v2', 'gun_concussion'],
    ['gun_bazooka', 'expl_bomb_1', 'gun_bazooka'],
    ['shot_rocket', 'expl_bomb_1', 'shot_rocket'],
    ['shot_flame', 'expl_scifi', 'shot_flame'],
    ['shot_elec', 'stun_elec_arc', 'magic_lightning'],
    ['mine_arm', 'sniper_lock', 'mine_arm'],
    ['magic_arcane', 'heal_pulse', 'magic_arcane'],
    ['melee_slash', 'dash_swipe', 'melee_slash'],
    ['melee_swing', 'dash_swipe', 'melee_swing'],
    ['melee_deflect', 'hit_plate', 'melee_deflect'],
    ['melee_shock', 'stun_elec_arc', 'melee_shock'],
    // shared/src/bansung/weapons.ts + enemies.ts IDs
    ['sfx_gl_fire', 'gun_grenade', 'gun_grenade'],
    ['sfx_boom_heavy', 'expl_heavy_wav', 'explode_he'],
    ['sfx_fx_explosion', 'explosion_lg', 'explode_he'],
    ['sfx_stun_fire', 'gun_concussion', 'gun_concussion'],
    ['sfx_stun_burst', 'stun_bang_1', 'stun_flash'],
    ['sfx_fx_stun_flash', 'stun_bang_1', 'stun_flash'],
    ['sfx_bazooka_fire', 'gun_bazooka', 'gun_bazooka'],
    ['sfx_mine_deploy', 'turret_deploy', 'mine_arm'],
    ['sfx_mine_beep', 'mine_arm', 'mine_arm'],
    ['fx_plasma_spark', 'stun_elec_arc', 'gun_plasma'],
    ['fx_thunder_arc', 'stun_elec_arc', 'magic_lightning'],
    ['wpn_arcane_cast', 'magic_arcane', 'magic_arcane'],
    ['fx_fireball_boom', 'expl_scifi', 'explode_mini'],
    ['sfx_melee_crescent', 'dash_swipe', 'melee_slash'],
    ['sfx_melee_scythe', 'dash_swipe', 'melee_slash'],
    ['sfx_bullet_slice', 'hit_plate', 'melee_deflect'],
    ['sfx_melee_baton', 'stun_elec_arc', 'melee_shock'],
    ['sfx_shock_zap', 'stun_elec_arc', 'melee_shock'],
    ['gadget_throw', 'bomb_throw', 'bomb_throw'],
    ['gadget_stun_pop', 'stun_bang_2', 'stun_flash'],
    ['gadget_cluster_boom', 'expl_chunky', 'explode_he'],
    ['gadget_turret_deploy', 'turret_deploy', 'turret_deploy'],
    ['gadget_turret_shot', 'turret_shot', 'turret_shot'],
    ['gadget_turret_thunder', 'stun_elec_arc', 'magic_lightning'],
    ['gadget_drone_deploy', 'heal_pulse', 'heal_pulse'],
    ['gadget_drone_pulse', 'heal_pulse', 'heal_pulse'],
    ['sfx_pickup_hp', 'pickup_hp', 'pickup_hp'],
    ['sfx_pickup_energy', 'pickup_orb', 'pickup_orb'],
    ['sfx_pickup_armor', 'hit_armor', 'pickup_orb'],
    ['sfx_pickup_coin', 'pickup_coin', 'pickup_coin'],
    ['sfx_pedestal_swap', 'pickup_weapon', 'pickup_weapon'],
    // d07 / d09 / d23 / d26-32 / d37-39 aliases
    ['sfx_ui_revive', 'revive_done', 'revive_done'],
    ['sfx_downed', 'player_down', 'player_down'],
    ['sfx_revive_tick', 'revive_tick', 'revive_tick'],
    ['sfx_revive_done', 'revive_done', 'revive_done'],
    ['sfx_flashbang', 'stun_bang_1', 'stun_flash'],
    ['sfx_stun_zap', 'stun_elec_arc', 'melee_shock'],
    ['sfx_dry_fire', 'sfx_wpn_dryfire', 'dry_fire'],
    ['sfx_reload_start', 'sfx_wpn_mag_insert', 'reload_start'],
    ['sfx_reload_perfect', 'sfx_wpn_rack_rifle', 'reload_active'],
    ['sfx_reload_jam', 'ui_deny', 'ui_deny'],
    ['sfx_reload_done', 'sfx_wpn_reload', 'reload_done'],
    ['sfx_energy_orb', 'pickup_orb', 'pickup_orb'],
    ['sfx_crate_hit', 'hit_armor', 'hit_armor'],
    ['sfx_crate_break', 'crate_break', 'crate_break'],
    ['sfx_perk_pick', 'pickup_perk', 'perk_pick'],
    ['mob_kill', 'mob_die', 'enemy_die'],
    ['boss_roar_cactus', 'boss_roar_beast', 'boss_roar'],
    ['boss_volley_fire', 'sfx_wpn_shotgun_v3', 'gun_shotgun'],
    ['boss_slam_impact', 'boss_slam', 'boss_slam'],
    ['boss_beam_charge', 'boss_alarm', 'boss_beam'],
    ['boss_beam_loop', 'boss_beam', 'boss_beam'],
    ['boss_death_shatter', 'expl_heavy_wav', 'explode_he'],
    ['boss_charge_horn', 'boss_roar_deep', 'boss_roar'],
    ['boss_wall_crash', 'boss_slam', 'boss_slam'],
    ['boss_overheat_hiss', 'stun_down', 'boss_emp'],
    ['sfx_boss_overlord_spawn', 'stinger_boss', 'boss_roar'],
    ['sfx_boss_spiral_tick', 'turret_shot', 'turret_shot'],
    ['sfx_emp_charge', 'boss_alarm', 'boss_emp'],
    ['sfx_emp_pulse', 'stun_emp_zap', 'boss_emp'],
    ['sfx_laser_telegraph', 'sniper_lock', 'sniper_lock'],
    ['sfx_laser_beam', 'boss_beam', 'boss_beam'],
    ['sfx_weakpoint_break', 'shield_break', 'shield_break'],
  ];

  for (const [aliasId, targetId, fallbackKey] of extraAudioAliases) {
    const target = audio[normalizeId(targetId)];
    if (!target) {
      throw new Error(`Audio alias target missing: ${aliasId} -> ${targetId}`);
    }
    setAudio(aliasId, {
      ...target,
      synthFallback: fallbackKey || normalizeId(aliasId),
    });
  }

  // Sort manifest keys deterministically for stable diffs
  const sortedSprites = Object.fromEntries(Object.keys(sprites).sort().map((k) => [k, sprites[k]]));
  const sortedAudio = Object.fromEntries(Object.keys(audio).sort().map((k) => [k, audio[k]]));

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    defaults: {
      baseTilePx: 32,
      nativeFacing: 'right',
      simTickHz: 30,
    },
    sprites: sortedSprites,
    audio: sortedAudio,
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await updateLicensesFile(manifest, provenanceRows);

  return manifest;
}

// ============================================================================
// 5. Update database-ban-sung/LICENSES.md Provenance Ledger
// ============================================================================

async function updateLicensesFile(manifest, provenanceRows) {
  const existing = await fs.readFile(LICENSES_PATH, 'utf8');
  const provHeader = '## Asset Provenance';
  const attrHeader = '## Required Attributions';

  const provIdx = existing.indexOf(provHeader);
  const attrIdx = existing.indexOf(attrHeader);
  if (provIdx === -1 || attrIdx === -1 || attrIdx <= provIdx) {
    throw new Error('LICENSES.md is missing expected "## Asset Provenance" or "## Required Attributions" sections');
  }

  const head = existing.slice(0, provIdx);
  const tail = existing.slice(attrIdx);

  // Deduplicate canonical file provenance rows by relPath
  const dedup = new Map();
  for (const row of provenanceRows) {
    if (!dedup.has(row.relPath)) dedup.set(row.relPath, row);
  }
  const sortedRows = [...dedup.values()].sort((a, b) => a.relPath.localeCompare(b.relPath));

  const lines = [
    provHeader,
    '',
    `Generated by \`scripts/bansung/pack-manifest.mjs\` at \`${manifest.generatedAt}\`.`,
    `- **Manifest index**: \`${Object.keys(manifest.sprites).length}\` sprite keys, \`${Object.keys(manifest.audio).length}\` audio keys.`,
    `- **Tracked files on disk**: \`${sortedRows.length}\` canonical asset files under \`normalized/**\`, \`audio/**\`, and \`sprites/miragine/\`.`,
    '',
    '| Asset ID Pattern / Path | sourceId | Modifications Applied |',
    '|---|---|---|',
    ...sortedRows.map((r) => `| \`${r.relPath}\` | \`${r.sourceId}\` | ${String(r.note).replace(/\|/g, '/')} |`),
    '',
    '---',
    '',
  ];

  await fs.writeFile(LICENSES_PATH, `${head}${lines.join('\n')}${tail}`, 'utf8');
}

// ============================================================================
// 6. Strict Self-Verification (--check and post-pack gate)
// ============================================================================

function collectLicenseSourceIds(licensesMd) {
  const map = new Map();
  for (const m of licensesMd.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*`?([A-Z0-9._-]+)`?\s*\|/gm)) {
    map.set(m[1], m[4]);
  }
  return map;
}

const REQUIRED_SHARED_SPRITES = [
  // Heroes + pets (shared/src/bansung/heroes.ts + d09)
  'hero_mascot_idle', 'hero_mascot_run', 'hero_mascot_shoot', 'hero_mascot_dash', 'hero_mascot_stunned', 'hero_mascot_dead',
  'hero_gunner_run', 'hero_ranger_run', 'hero_pyro_run', 'hero_knight_run',
  'pet_tiger_idle', 'pet_tiger_trot', 'pet_tiger_run', 'pet_tiger_pounce', 'pet_tiger_fire',
  'pet_cat_idle', 'pet_cat_trot', 'pet_cat_pounce', 'pet_cat_fire',
  // Weapons + gadgets + projectiles + slashes (shared/src/bansung/weapons.ts + d09)
  'gun_pistol', 'gun_rifle', 'gun_smg', 'gun_shotgun',
  'w_frag_launcher', 'w_stun_launcher', 'w_triple_bazooka', 'w_mine_gun',
  'plasma_rifle', 'railgun_piercer', 'lightning_staff', 'arcane_book',
  'wpn_crescent_blade', 'wpn_reaper_scythe', 'wpn_shock_baton',
  'gun_dual_pistols', 'gun_minigun', 'gun_saw_launcher', 'gun_flamethrower', 'gun_cryo_cannon', 'gun_gravity_gun',
  'gun_plasma_shotgun', 'gun_twin_smg', 'gun_ion_beam', 'gun_cluster_rpg', 'gun_tesla_coil', 'gun_void_cannon',
  'gun_blizzard_carbine', 'gun_ricochet_disc', 'gun_phantom_bow', 'gun_magma_spitter', 'gun_chronos_rifle', 'gun_orbital_cannon',
  'wpn_rifle_assault', 'wpn_melee_crescent', 'wpn_gadget_stun_bomb',
  'gadget_stun_bomb', 'gadget_cluster_bomb', 'gadget_auto_turret', 'gadget_heal_drone',
  'bullet_kinetic_sm', 'bullet_kinetic_md', 'bullet_shotgun_pellet', 'p_frag_grenade',
  'p_stun_canister', 'p_rocket', 'p_prox_mine', 'rail_beam', 'plasma_bolt',
  'flame_stream_orb', 'cryo_shard', 'saw_disc', 'gravity_orb',
  'gadget_bombs', 'needle_orb', 'sniper_slug', 'fireball', 'thunderball', 'storm',
  'fx_slash_crescent', 'fx_slash_scythe', 'fx_slash_shock',
  // Enemies + bosses + crates + maps + pickups + UI (shared/src/bansung/enemies.ts, maps.ts, d09, d17)
  'scarab_idle', 'mob_scarab_run', 'mob_goblin_bomber_attack', 'skirmisher_lunge',
  'cactus_brute_slam', 'cactus_spitter_attack', 'laser_sniper_attack', 'pyro_shaman_attack', 'thunder_mage_attack',
  'frost_mage_idle', 'frost_mage_run', 'frost_mage_attack', 'frost_mage_dead',
  'venom_stalker_idle', 'venom_stalker_run', 'venom_stalker_attack', 'venom_stalker_dead',
  'shield_warden_idle', 'shield_warden_run', 'shield_warden_attack', 'shield_warden_dead',
  'mortar_beetle_idle', 'mortar_beetle_run', 'mortar_beetle_attack', 'mortar_beetle_dead',
  'void_acolyte_idle', 'void_acolyte_run', 'void_acolyte_attack', 'void_acolyte_dead',
  'saw_berserker_idle', 'saw_berserker_run', 'saw_berserker_attack', 'saw_berserker_dead',
  'healing_priest_idle', 'healing_priest_run', 'healing_priest_attack', 'healing_priest_dead',
  'shock_drone_mk2_idle', 'shock_drone_mk2_run', 'shock_drone_mk2_attack', 'shock_drone_mk2_dead',
  'chrono_mage_idle', 'chrono_mage_attack', 'plasma_golem_idle', 'plasma_golem_attack',
  'sniper_mech_idle', 'sniper_mech_attack', 'plague_bearer_idle', 'plague_bearer_attack',
  'crimson_lancer_idle', 'crimson_lancer_attack', 'void_reaper_idle', 'void_reaper_attack',
  'mirror_knight_idle', 'mirror_knight_attack', 'magnet_drone_idle', 'magnet_drone_attack',
  'blight_bomber_idle', 'blight_bomber_attack', 'volt_stalker_idle', 'volt_stalker_attack',
  'solar_priest_idle', 'solar_priest_attack', 'magma_brute_idle', 'magma_brute_attack',
  'iron_drone_idle', 'boss_beholder_idle', 'boss_colossus_run', 'boss_overlord_idle',
  'boss_tempest_idle', 'boss_tempest_attack', 'boss_destroyer_idle', 'boss_destroyer_attack',
  'boss_frost_empress_idle', 'boss_frost_empress_attack', 'boss_abyssal_leviathan_idle', 'boss_abyssal_leviathan_attack',
  'boss_storm_herald_idle', 'boss_storm_herald_attack',
  'boss_sand_beholder_idle', 'boss_dread_colossus_charge', 'boss_overlord_core_laser',
  'overlord_hull_idle', 'overlord_hull_charge', 'overlord_hull_stun', 'overlord_hull_dead',
  'overlord_weakpoint', 'emp_pylon',
  'tile_desert_floor', 'tile_desert_wall', 'wall_desert', 'tile_crypt_floor', 'wall_crypt', 'tile_cyber_floor', 'wall_cyber',
  'pillar', 'rock', 'tomb', 'server', 'pedestal', 'barrel_red', 'barrel_emp', 'cactus', 'urn', 'crate',
  'desert_pot', 'crypt_urn', 'cyber_canister', 'wood_crate', 'crypt_crate', 'cyber_crate', 'iron_crate', 'crypt_iron_crate', 'cyber_vault_crate',
  'decor_skull', 'decor_pebble', 'decor_scrub', 'crypt_brazier', 'decor_candle', 'decor_bone', 'decor_vent', 'decor_cable',
  'pk_hp_orb', 'pk_hp_pack', 'pk_energy_orb', 'pk_energy_cell', 'pk_armor_plate', 'pk_coin', 'pk_gem_coin', 'pk_xp_orb',
  'prop_crate', 'prop_barrel', 'prop_shadow', 'shadow', 'ui_shadow_unit', 'ui_portrait_gunner', 'ui_crosshair_dot', 'ui_icon_shield',
  'fx_fireball', 'fx_thunderball', 'fx_storm',
  'perk_vitality', 'perk_bastion', 'perk_energy', 'perk_quick_hands', 'perk_swift_boots', 'perk_magnet',
  'perk_pierce', 'perk_blast', 'perk_vampiric', 'perk_coop_aura', 'perk_ricochet', 'perk_static_shield',
];

const REQUIRED_AUDIO_IDS = [
  // d43 44 SFX + 5 BGM
  'shot_pistol', 'shot_smg', 'shot_shotgun', 'shot_rifle', 'shot_sniper',
  'shot_laser', 'shot_rocket', 'shot_flame', 'melee_swing', 'turret_shot',
  'reload_start', 'reload_active_hit', 'reload_done', 'empty_click', 'shell_casing', 'weapon_swap',
  'hit_flesh', 'hit_armor', 'hit_crit', 'shield_break', 'stun_flash', 'explosion_sm', 'explosion_lg',
  'dash', 'heal_orb', 'energy_orb', 'pickup_weapon', 'perk_pick',
  'player_down', 'revive_tick', 'revive_done',
  'mob_spawn', 'mob_die', 'sniper_lock', 'boss_roar', 'boss_slam', 'boss_laser',
  'ui_click', 'ui_deny', 'wave_start', 'wave_clear', 'win', 'lose', 'ping',
  'menu', 'combat', 'boss', 'victory', 'defeat',
  // d16 55 SFX + BGM
  'gun_pistol', 'gun_rifle', 'gun_smg', 'gun_shotgun', 'gun_grenade', 'gun_concussion',
  'gun_bazooka', 'mine_arm', 'gun_plasma', 'gun_railgun', 'magic_lightning', 'magic_arcane',
  'melee_slash', 'melee_deflect', 'melee_shock', 'reload_active', 'dry_fire',
  'bomb_throw', 'bomb_bounce', 'explode_he', 'explode_mini', 'turret_deploy', 'heal_pulse',
  'player_hurt', 'crate_break', 'pickup_orb', 'pickup_hp', 'pickup_coin', 'enemy_die',
  'boss_beam', 'boss_emp', 'ping_coop', 'match_win', 'match_lose',
  'bgm_menu', 'bgm_combat', 'bgm_boss', 'bgm_victory', 'bgm_defeat',
  // shared weapons & pickups SFX
  'sfx_pistol_fire', 'sfx_reload_kinetic', 'sfx_rifle_fire', 'sfx_smg_fire', 'sfx_shotgun_fire', 'sfx_shotgun_pump',
  'sfx_gl_fire', 'sfx_boom_heavy', 'sfx_stun_fire', 'sfx_stun_burst', 'sfx_bazooka_fire', 'sfx_mine_deploy', 'sfx_mine_beep',
  'wpn_plasma_fire', 'fx_plasma_spark', 'wpn_rail_fire', 'wpn_rail_charge', 'wpn_lightning_cast', 'fx_thunder_arc',
  'wpn_arcane_cast', 'fx_fireball_boom', 'sfx_melee_crescent', 'sfx_bullet_slice', 'sfx_melee_scythe', 'sfx_melee_baton', 'sfx_shock_zap',
  'gadget_throw', 'gadget_stun_pop', 'gadget_cluster_boom', 'gadget_turret_deploy', 'gadget_turret_shot', 'gadget_turret_thunder',
  'gadget_drone_deploy', 'gadget_drone_pulse',
  'sfx_pickup_hp', 'sfx_pickup_energy', 'sfx_pickup_armor', 'sfx_pickup_coin', 'sfx_pedestal_swap',
  // d09 SFX
  'sfx_wpn_rifle', 'sfx_wpn_reload', 'sfx_fx_explosion', 'sfx_fx_stun_flash', 'sfx_ui_revive',
];

async function verifyManifestOnDisk() {
  if (!existsSync(MANIFEST_PATH)) throw new Error(`Missing manifest.json at ${MANIFEST_PATH}`);
  if (!existsSync(LICENSES_PATH)) throw new Error(`Missing LICENSES.md at ${LICENSES_PATH}`);

  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  const sources = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
  const licensesMd = await fs.readFile(LICENSES_PATH, 'utf8');

  const registeredSources = new Set([
    'internal_miragine', 'generated_synth',
    ...(sources.spritePacks || []).map((p) => p.id),
    ...(sources.audioPacks || []).map((p) => p.id),
  ]);
  const licensedMap = collectLicenseSourceIds(licensesMd);

  if (manifest.version !== 1) throw new Error(`Expected manifest.version === 1, got ${manifest.version}`);
  if (!manifest.defaults || manifest.defaults.baseTilePx !== 32 || manifest.defaults.nativeFacing !== 'right' || manifest.defaults.simTickHz !== 30) {
    throw new Error(`Invalid manifest.defaults: ${JSON.stringify(manifest.defaults)}`);
  }

  for (const sec of ['## Source Packs', '## Asset Provenance', '## Required Attributions']) {
    if (!licensesMd.includes(sec)) throw new Error(`LICENSES.md missing section: ${sec}`);
  }

  const pngCache = new Map();
  let spriteCount = 0;
  for (const [id, entry] of Object.entries(manifest.sprites || {})) {
    spriteCount++;
    if (!VALID_ID_RE.test(id)) throw new Error(`Invalid sprite key "${id}"`);
    if (!VALID_CATEGORIES.has(entry.category)) throw new Error(`Invalid sprite category on "${id}": ${entry.category}`);
    if (!entry.path || !entry.path.startsWith('normalized/')) throw new Error(`Sprite "${id}" path must be inside normalized/: ${entry.path}`);

    const abs = path.join(DB_ROOT, entry.path);
    if (!existsSync(abs)) throw new Error(`Broken sprite path for "${id}": ${entry.path}`);

    let hdr = pngCache.get(abs);
    if (!hdr) {
      const buf = await fs.readFile(abs);
      if (buf.length === 0) throw new Error(`Empty PNG file: ${entry.path}`);
      hdr = inspectPngHeader(buf);
      pngCache.set(abs, hdr);
    }
    if (!(entry.frames >= 1) || !(entry.cellW >= 1) || !(entry.cellH >= 1)) {
      throw new Error(`Invalid sprite cell metrics on "${id}"`);
    }
    if (hdr.width !== entry.frames * entry.cellW || hdr.height !== entry.cellH) {
      throw new Error(`PNG grid mismatch on "${id}" (${entry.path}): header=${hdr.width}x${hdr.height}, manifest=${entry.frames}*${entry.cellW}x${entry.cellH}`);
    }
    if (!entry.fallback || !VALID_FALLBACK_SHAPES.has(entry.fallback.shape) || !/^#[0-9a-fA-F]{6}$/.test(entry.fallback.color || '')) {
      throw new Error(`Invalid fallback spec on "${id}"`);
    }
    if (!registeredSources.has(entry.sourceId) || !licensedMap.has(entry.sourceId) || !ALLOWED_LICENSES.has(licensedMap.get(entry.sourceId))) {
      throw new Error(`Unlicensed/unregistered sourceId "${entry.sourceId}" on sprite "${id}"`);
    }
  }

  const audioCache = new Set();
  const checkAudioFile = async (relPath, context) => {
    const abs = path.join(DB_ROOT, relPath);
    if (!existsSync(abs)) throw new Error(`Broken audio path (${context}): ${relPath}`);
    if (audioCache.has(abs)) return;
    const buf = await fs.readFile(abs);
    if (buf.length === 0) throw new Error(`Empty audio file (${context}): ${relPath}`);
    const fmt = detectMagicFormat(buf);
    if (fmt !== 'wav' && fmt !== 'ogg' && fmt !== 'mp3') {
      throw new Error(`Invalid audio magic (${fmt}) for ${relPath}`);
    }
    if (fmt === 'wav') {
      const parsed = parseWav(buf);
      if (!(parsed.durationMs > 0)) throw new Error(`0ms WAV: ${relPath}`);
    }
    audioCache.add(abs);
  };

  let audioCount = 0;
  for (const [id, entry] of Object.entries(manifest.audio || {})) {
    audioCount++;
    if (!VALID_ID_RE.test(id)) throw new Error(`Invalid audio key "${id}"`);
    if (entry.kind !== 'sfx' && entry.kind !== 'bgm') throw new Error(`Invalid audio kind on "${id}": ${entry.kind}`);
    if (!(entry.durationMs > 0)) throw new Error(`Invalid durationMs on "${id}": ${entry.durationMs}`);
    if (!(entry.gain >= 0.05 && entry.gain <= 1.0)) throw new Error(`Invalid gain on "${id}": ${entry.gain}`);
    if (!entry.synthFallback) throw new Error(`Missing synthFallback on "${id}"`);
    if (!registeredSources.has(entry.sourceId) || !licensedMap.has(entry.sourceId) || !ALLOWED_LICENSES.has(licensedMap.get(entry.sourceId))) {
      throw new Error(`Unlicensed/unregistered sourceId "${entry.sourceId}" on audio "${id}"`);
    }
    await checkAudioFile(entry.path, `audio.${id}.path`);
    if (entry.fallbackPath) await checkAudioFile(entry.fallbackPath, `audio.${id}.fallbackPath`);
    for (const v of entry.variations || []) {
      await checkAudioFile(v, `audio.${id}.variations`);
    }
  }

  const missingSprites = REQUIRED_SHARED_SPRITES.filter((k) => !Object.prototype.hasOwnProperty.call(manifest.sprites, k));
  if (missingSprites.length > 0) {
    throw new Error(`Missing required sprite IDs in manifest.sprites: ${missingSprites.join(', ')}`);
  }
  const missingAudio = REQUIRED_AUDIO_IDS.filter((k) => !Object.prototype.hasOwnProperty.call(manifest.audio, k));
  if (missingAudio.length > 0) {
    throw new Error(`Missing required audio IDs in manifest.audio: ${missingAudio.join(', ')}`);
  }

  return {
    spriteCount,
    uniquePngFiles: pngCache.size,
    audioCount,
    uniqueAudioFiles: audioCache.size,
  };
}

// ============================================================================
// 7. Entry Point
// ============================================================================

async function main() {
  if (!CHECK_ONLY) {
    await buildPack();
  }
  const stats = await verifyManifestOnDisk();
  console.log(
    `[pack-manifest] OK: ${stats.spriteCount} sprite keys (${stats.uniquePngFiles} unique PNGs), ${stats.audioCount} audio keys (${stats.uniqueAudioFiles} unique audio files), 0 broken paths.`,
  );
}

main().catch((err) => {
  console.error('[pack-manifest] FAILED:', err);
  process.exit(1);
});
