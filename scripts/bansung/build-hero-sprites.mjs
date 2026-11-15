/**
 * Pure-Node 22 ESM builder for `ban_sung` hero & pet companion sprite strips (`w11`).
 *
 * - Fetches verified CC0-1.0 hero/animal reference packs from `database-ban-sung/sources.json`
 *   (Kenney Desert Shooter Pack, Sparklin Labs Superpowers Ninja Adventure) when online,
 *   with deterministic pure-Node fallback when offline or `--offline` is passed.
 * - Generates & normalizes crisp Soul-Knight-inspired & Miragine-cadence 48x48 right-facing
 *   hero strips (`mascot`, `ranger`, `pyro`, `knight` x `idle/run/shoot/dash/stunned/dead`)
 *   with armless front shoulders aligned to `shared/src/bansung/heroes.ts`, `#181425` 1px
 *   4-connected outlines, and the canonical 48-color palette (`BANSUNG_PALETTE_48`).
 * - Generates & normalizes 32x32 left-facing Tiger Cub & Calico Cat companion strips
 *   (`idle/trot/pounce/fire`) aligned to `BANSUNG_PET` (`offX=-16, offY=-28`).
 * - Emits `database-ban-sung/sprites/heroes/meta-heroes.json` for `w14` manifest merging.
 *
 * Usage:
 *   node scripts/bansung/build-hero-sprites.mjs
 *   node scripts/bansung/build-hero-sprites.mjs --offline
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NORM_CONSTANTS,
  applyOutline4Conn,
  createImage,
  decodePng,
  fetchBuffer,
  hardenAlpha,
  hexToRgba,
  packStrip,
  quantizeImageToPalette48,
  sha256Hex,
  writePngFile,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const HERO_DIR = path.join(REPO_ROOT, 'database-ban-sung', 'sprites', 'heroes');
const PET_DIR = path.join(REPO_ROOT, 'database-ban-sung', 'sprites', 'pet');
const META_PATH = path.join(HERO_DIR, 'meta-heroes.json');
const CACHE_DIR = path.join(os.tmpdir(), 'bansung-w11-oss-cache');

const OFFLINE_MODE = process.argv.includes('--offline');

// ---------------------------------------------------------------------------
// Canonical 48-Color Palette Helpers
// ---------------------------------------------------------------------------

const C = Object.freeze({
  OUTLINE: '#181425',
  MONO_1: '#262b44',
  MONO_2: '#3a4466',
  MONO_3: '#5a6988',
  MONO_4: '#8b9bb4',
  MONO_5: '#e6eef8',

  SAND_0: '#733e39',
  SAND_1: '#9e5b47',
  SAND_2: '#c9885b',
  SAND_3: '#e8b878',
  SAND_4: '#f5d89e',
  SAND_5: '#fff0c2',

  EARTH_0: '#2e1d1b',
  EARTH_1: '#4d312c',
  EARTH_2: '#6e4b3f',
  EARTH_3: '#916b57',
  EARTH_4: '#b39078',
  EARTH_5: '#d6baa2',

  CRIMSON_0: '#4c1424',
  CRIMSON_1: '#8a1c31',
  CRIMSON_2: '#c72936',
  CRIMSON_3: '#e43b44',
  ORANGE: '#ff7a3d',
  GOLD: '#fee761',

  GREEN_0: '#193c3e',
  GREEN_1: '#265c42',
  GREEN_2: '#3e8948',
  GREEN_3: '#63c74d',
  GREEN_4: '#a7f070',

  BLUE_0: '#143464',
  BLUE_1: '#124e89',
  BLUE_2: '#0095e9',
  CYAN: '#2ce8f5',
  CYAN_BRIGHT: '#9cf9ff',
  WHITE: '#ffffff',

  ARCANE_0: '#381d4a',
  ARCANE_2: '#96419c',
  PINK_LIGHT: '#ff9ee2',

  COPPER_0: '#45242e',
  COPPER_1: '#783e3b',
  COPPER_2: '#ab5a47',
  COPPER_3: '#d9845c',
  PEACH: '#f0ae81',
  SKIN: '#ffd8b8',
});

const RGBA_CACHE = new Map();
function rgba(hex) {
  let v = RGBA_CACHE.get(hex);
  if (!v) {
    v = hexToRgba(hex, 255);
    RGBA_CACHE.set(hex, v);
  }
  return v;
}

// ---------------------------------------------------------------------------
// CC0 Reference Pack Fetcher (with deterministic offline fallback)
// ---------------------------------------------------------------------------

const OSS_FETCH_TARGETS = [
  {
    id: 'kenney_desert_bunny_idle',
    sourceId: 'kenney_desert_shooter',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/Players/Tiles/tile_0012.png',
  },
  {
    id: 'kenney_desert_bunny_walk',
    sourceId: 'kenney_desert_shooter',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/Players/Tiles/tile_0013.png',
  },
  {
    id: 'sp_ninja_mascot_base',
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure/characters/19.png',
  },
  {
    id: 'sp_ninja_ranger_base',
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure/characters/7.png',
  },
  {
    id: 'sp_ninja_pyro_base',
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure/characters/24.png',
  },
  {
    id: 'sp_ninja_knight_base',
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure/characters/21.png',
  },
  {
    id: 'sp_ninja_pet_dog',
    sourceId: 'superpowers_asset_packs',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/ninja-adventure/characters/dog.png',
  },
];

async function fetchCc0References() {
  const results = [];
  if (!OFFLINE_MODE) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  }
  for (const item of OSS_FETCH_TARGETS) {
    const cacheFile = path.join(CACHE_DIR, `${item.id}.png`);
    if (OFFLINE_MODE) {
      results.push({ ...item, status: 'offline-skipped', bytes: 0, sha256: null, dims: null });
      continue;
    }
    try {
      let buf = null;
      let cached = false;
      try {
        buf = await fs.readFile(cacheFile);
        cached = true;
      } catch {
        const res = await fetchBuffer(item.url, { expect: 'png', timeoutMs: 12000, retries: 2 });
        buf = res.buffer;
        await fs.writeFile(cacheFile, buf);
      }
      const img = decodePng(buf);
      results.push({
        ...item,
        status: cached ? 'cached-cc0' : 'fetched-cc0',
        bytes: buf.length,
        sha256: sha256Hex(buf),
        dims: `${img.width}x${img.height}`,
      });
    } catch (err) {
      results.push({
        ...item,
        status: 'fallback',
        error: err?.message ?? String(err),
        bytes: 0,
        sha256: null,
        dims: null,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Crisp Pixel Drawing Primitives (1px Native Grid)
// ---------------------------------------------------------------------------

function makeCanvas(w, h) {
  const img = createImage(w, h);
  const { data } = img;
  const set = (x, y, hex) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
    const [r, g, b, a] = rgba(hex);
    const idx = (iy * w + ix) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  };
  const rect = (x0, y0, rw, rh, hex) => {
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        set(x0 + dx, y0 + dy, hex);
      }
    }
  };
  const hline = (x0, x1, y, hex) => {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) set(x, y, hex);
  };
  const oval = (cx, cy, rx, ry, hex, shadeHex = null, hiHex = null) => {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        const nx = dx / rx;
        const ny = dy / ry;
        if (nx * nx + ny * ny <= 1.0) {
          let col = hex;
          if (hiHex && ny < -0.35 && nx > -0.45 && nx < 0.6) col = hiHex;
          else if (shadeHex && (ny > 0.35 || nx < -0.55)) col = shadeHex;
          set(cx + dx, cy + dy, col);
        }
      }
    }
  };
  return { img, set, rect, hline, oval };
}

function finalizeCell(img) {
  const hard = hardenAlpha(img, NORM_CONSTANTS.ALPHA_CUTOFF);
  const quantized = quantizeImageToPalette48(hard, {
    lutStrength: 1.0,
    preserveOutline: true,
    outlineRgba: NORM_CONSTANTS.OUTLINE_RGBA,
  });
  return applyOutline4Conn(quantized, NORM_CONSTANTS.OUTLINE_RGBA, NORM_CONSTANTS.ALPHA_CUTOFF);
}

// ---------------------------------------------------------------------------
// 48x48 Hero Specs & Modular Soul-Knight Character Renderer
// ---------------------------------------------------------------------------

/**
 * Matches `BANSUNG_HEROES` & `BANSUNG_HERO_ANIM_SPECS` in `shared/src/bansung/heroes.ts`.
 * Foot pivot at `(24, 44)`: standing interior boot pixels land on `y = 43`,
 * `#181425` bottom outline lands on `y = 44`, leaving `y = 45..47` clear.
 */
const HERO_ANIMS = [
  { state: 'idle', frames: 4, fps: 6, loop: true },
  { state: 'run', frames: 6, fps: 14, loop: true },
  { state: 'shoot', frames: 3, fps: 24, loop: false },
  { state: 'dash', frames: 4, fps: 14.3, loop: false },
  { state: 'stunned', frames: 2, fps: 10, loop: true },
  { state: 'dead', frames: 4, fps: 10, loop: false },
];

const HERO_PROFILES = {
  mascot: {
    id: 'mascot',
    name: 'Mascot Gunner',
    aliases: ['hero_gunner', 'hero_mascot_gunner'],
    shoulderOffset: { x: 4, y: -17 },
    headTopY: -40,
    starterWeapon: 'rifle',
    fallback: { shape: 'capsule', color: '#f8f9fa', accent: '#4dabf7' },
    pal: {
      hoodHi: C.WHITE,
      hoodBase: C.MONO_5,
      hoodShade: C.MONO_4,
      torsoHi: C.WHITE,
      torsoBase: C.MONO_5,
      torsoShade: C.MONO_4,
      trim: C.CYAN,
      belt: C.MONO_2,
      buckle: C.GOLD,
      capeHi: C.CYAN,
      capeBase: C.BLUE_2,
      capeShade: C.BLUE_1,
      bootHi: C.MONO_3,
      bootBase: C.MONO_2,
      bootShade: C.MONO_1,
    },
  },
  ranger: {
    id: 'ranger',
    name: 'Cyber Ranger',
    aliases: ['hero_cyber_ranger'],
    shoulderOffset: { x: 5, y: -18 },
    headTopY: -41,
    starterWeapon: 'smg',
    fallback: { shape: 'capsule', color: '#1e293b', accent: '#22d3ee' },
    pal: {
      hoodHi: C.MONO_3,
      hoodBase: C.MONO_2,
      hoodShade: C.MONO_1,
      torsoHi: C.MONO_3,
      torsoBase: C.MONO_2,
      torsoShade: C.MONO_1,
      trim: C.CYAN,
      belt: C.MONO_1,
      buckle: C.CYAN_BRIGHT,
      capeHi: C.MONO_3,
      capeBase: C.MONO_2,
      capeShade: C.BLUE_0,
      bootHi: C.MONO_3,
      bootBase: C.MONO_2,
      bootShade: C.MONO_1,
    },
  },
  pyro: {
    id: 'pyro',
    name: 'Pyromancer',
    aliases: ['hero_pyromancer'],
    shoulderOffset: { x: 4, y: -17 },
    headTopY: -41,
    starterWeapon: 'plasma_rifle',
    fallback: { shape: 'capsule', color: '#c92a2a', accent: '#ff922b' },
    pal: {
      hoodHi: C.CRIMSON_3,
      hoodBase: C.CRIMSON_2,
      hoodShade: C.CRIMSON_1,
      torsoHi: C.CRIMSON_3,
      torsoBase: C.CRIMSON_2,
      torsoShade: C.CRIMSON_1,
      trim: C.ORANGE,
      belt: C.CRIMSON_0,
      buckle: C.GOLD,
      capeHi: C.ORANGE,
      capeBase: C.CRIMSON_2,
      capeShade: C.CRIMSON_1,
      bootHi: C.COPPER_2,
      bootBase: C.CRIMSON_1,
      bootShade: C.CRIMSON_0,
    },
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    aliases: [],
    shoulderOffset: { x: 5, y: -19 },
    headTopY: -43,
    starterWeapon: 'shotgun',
    fallback: { shape: 'capsule', color: '#3b5bdb', accent: '#fcc419' },
    pal: {
      hoodHi: C.MONO_5,
      hoodBase: C.MONO_4,
      hoodShade: C.MONO_3,
      torsoHi: C.BLUE_2,
      torsoBase: C.BLUE_1,
      torsoShade: C.BLUE_0,
      trim: C.GOLD,
      belt: C.MONO_2,
      buckle: C.GOLD,
      capeHi: C.BLUE_2,
      capeBase: C.BLUE_1,
      capeShade: C.BLUE_0,
      bootHi: C.MONO_4,
      bootBase: C.MONO_3,
      bootShade: C.MONO_2,
    },
  },
};

function drawHeroHead(cv, heroId, hx, hy, opts) {
  const { blink = false, dizzy = false, squinted = false, flashFace = false } = opts;
  const { pal } = HERO_PROFILES[heroId];

  if (heroId === 'mascot') {
    // Bunny/animal ears (back ear + front ear), 2px headroom clear even during -2px hop
    // Back ear
    cv.rect(hx - 6, hy - 12, 4, 7, pal.hoodBase);
    cv.rect(hx - 5, hy - 13, 2, 2, pal.hoodHi);
    cv.rect(hx - 5, hy - 11, 2, 4, C.PEACH);
    // Front ear
    cv.rect(hx + 1, hy - 12, 4, 7, pal.hoodHi);
    cv.rect(hx + 2, hy - 13, 2, 2, pal.hoodHi);
    cv.rect(hx + 2, hy - 11, 2, 4, C.PEACH);

    // Chibi white hoodie dome
    cv.oval(hx, hy, 8.5, 6.8, pal.hoodBase, pal.hoodShade, pal.hoodHi);
    cv.hline(hx - 5, hx + 5, hy + 6, pal.hoodShade);

    // Cute warm face inset on right side (+X)
    cv.oval(hx + 3, hy + 0.5, 4.8, 4.2, C.SKIN, C.PEACH, C.SAND_5);
    if (flashFace) {
      cv.rect(hx + 6, hy - 1, 2, 3, C.WHITE);
    }

    // Expressive eyes
    if (blink) {
      cv.hline(hx + 1, hx + 3, hy, C.OUTLINE);
      cv.hline(hx + 5, hx + 7, hy, C.OUTLINE);
    } else if (dizzy) {
      cv.set(hx + 2, hy - 1, C.OUTLINE);
      cv.set(hx + 3, hy, C.GOLD);
      cv.set(hx + 2, hy + 1, C.OUTLINE);
      cv.set(hx + 6, hy - 1, C.OUTLINE);
      cv.set(hx + 5, hy, C.GOLD);
      cv.set(hx + 6, hy + 1, C.OUTLINE);
    } else if (squinted) {
      cv.rect(hx + 2, hy, 2, 1, C.OUTLINE);
      cv.rect(hx + 5, hy, 2, 1, C.OUTLINE);
    } else {
      // Big cute dark chibi eyes with white glint + rosy cheek
      cv.rect(hx + 1, hy - 1, 2, 3, C.OUTLINE);
      cv.set(hx + 1, hy - 1, C.WHITE);
      cv.rect(hx + 5, hy - 1, 2, 3, C.OUTLINE);
      cv.set(hx + 5, hy - 1, C.WHITE);
      cv.set(hx + 0, hy + 2, C.PEACH);
      cv.set(hx + 7, hy + 2, C.PEACH);
    }

    // Iconic RED BOW perched on the hood/ear base (matching ref screenshot!)
    // Left wing
    cv.rect(hx + 1, hy - 8, 3, 3, C.CRIMSON_3);
    cv.set(hx + 1, hy - 8, C.ORANGE);
    cv.set(hx + 2, hy - 6, C.CRIMSON_2);
    // Center knot
    cv.rect(hx + 4, hy - 7, 2, 2, C.CRIMSON_2);
    cv.set(hx + 4, hy - 7, C.GOLD);
    // Right wing
    cv.rect(hx + 6, hy - 8, 3, 3, C.CRIMSON_3);
    cv.set(hx + 7, hy - 8, C.ORANGE);
    cv.set(hx + 8, hy - 6, C.CRIMSON_2);
    // Little ribbon tails
    cv.set(hx + 3, hy - 5, C.CRIMSON_1);
    cv.set(hx + 6, hy - 5, C.CRIMSON_1);
    return;
  }

  if (heroId === 'ranger') {
    // Pointed stealth recon hood (headTopY: -41 -> y ~ 4)
    cv.oval(hx, hy, 8.2, 6.8, pal.hoodBase, pal.hoodShade, pal.hoodHi);
    // Hood peak + back tactical fold
    cv.rect(hx - 6, hy - 9, 9, 3, pal.hoodBase);
    cv.rect(hx - 4, hy - 11, 5, 2, pal.hoodHi);
    cv.rect(hx - 8, hy - 7, 3, 4, pal.hoodShade);
    // Tactical ear com + cyan beacon
    cv.rect(hx - 5, hy - 3, 2, 4, C.MONO_3);
    cv.set(hx - 5, hy - 4, blink ? C.WHITE : C.CYAN);

    // Shadowed mask opening
    cv.rect(hx + 0, hy - 3, 8, 7, C.OUTLINE);
    // Glowing neon-cyan recon visor
    if (dizzy) {
      cv.hline(hx + 1, hx + 3, hy - 1, C.GOLD);
      cv.hline(hx + 5, hx + 7, hy + 1, C.CYAN);
    } else if (blink) {
      cv.hline(hx + 1, hx + 7, hy, C.CYAN);
    } else {
      cv.rect(hx + 1, hy - 2, 7, 3, C.BLUE_2);
      cv.hline(hx + 2, hx + 7, hy - 1, C.CYAN);
      cv.hline(hx + 3, hx + 6, hy - 1, flashFace ? C.WHITE : C.CYAN_BRIGHT);
      if (squinted) cv.hline(hx + 1, hx + 7, hy - 2, C.OUTLINE);
    }
    return;
  }

  if (heroId === 'pyro') {
    // Alchemist pointed crimson hood with ember-gold trim (headTopY: -41 -> y ~ 4)
    cv.oval(hx, hy, 8.2, 6.8, pal.hoodBase, pal.hoodShade, pal.hoodHi);
    cv.rect(hx - 7, hy - 9, 10, 3, pal.hoodBase);
    cv.rect(hx - 9, hy - 11, 7, 3, pal.hoodHi);
    cv.rect(hx - 11, hy - 10, 3, 2, pal.hoodShade);

    // Gold/ember trim lining the hood rim
    cv.hline(hx - 1, hx + 6, hy - 5, C.ORANGE);
    cv.set(hx + 6, hy - 4, C.GOLD);
    cv.set(hx - 1, hy - 4, C.GOLD);
    cv.rect(hx - 1, hy - 3, 1, 7, C.ORANGE);

    // Deep alchemist shadow face with glowing ember eyes
    cv.rect(hx + 0, hy - 4, 8, 8, C.CRIMSON_0);
    cv.rect(hx + 1, hy - 3, 6, 6, C.OUTLINE);
    if (blink) {
      cv.hline(hx + 2, hx + 3, hy, C.ORANGE);
      cv.hline(hx + 5, hx + 6, hy, C.ORANGE);
    } else if (dizzy) {
      cv.set(hx + 2, hy - 1, C.GOLD);
      cv.set(hx + 6, hy + 1, C.GOLD);
      cv.set(hx + 3, hy + 1, C.ORANGE);
      cv.set(hx + 5, hy - 1, C.ORANGE);
    } else {
      cv.rect(hx + 2, hy - 1, 2, 2, C.ORANGE);
      cv.set(hx + 2, hy - 1, C.GOLD);
      cv.rect(hx + 5, hy - 1, 2, 2, C.ORANGE);
      cv.set(hx + 6, hy - 1, flashFace ? C.WHITE : C.GOLD);
    }
    return;
  }

  // knight: Cobalt steel helm with twin gold horns & T-visor (zero top clipping)
  // Back horn
  cv.rect(hx - 7, hy - 10, 3, 4, C.SAND_3);
  cv.rect(hx - 8, hy - 12, 3, 2, C.GOLD);
  cv.set(hx - 7, hy - 13, C.WHITE);
  // Front horn
  cv.rect(hx + 3, hy - 10, 3, 4, C.SAND_3);
  cv.rect(hx + 4, hy - 12, 3, 2, C.GOLD);
  cv.set(hx + 6, hy - 13, C.WHITE);

  // Steel helm dome + cobalt crest
  cv.oval(hx, hy, 8.6, 7.0, pal.hoodBase, pal.hoodShade, pal.hoodHi);
  cv.rect(hx - 2, hy - 8, 5, 3, C.BLUE_2);
  cv.hline(hx - 1, hx + 2, hy - 8, C.CYAN);
  // Gold brow band
  cv.hline(hx - 5, hx + 7, hy - 3, C.GOLD);
  cv.hline(hx - 5, hx + 7, hy - 2, C.SAND_3);

  // T-visor slit
  cv.rect(hx + 0, hy - 1, 8, 2, C.OUTLINE);
  cv.rect(hx + 3, hy + 1, 2, 4, C.OUTLINE);
  if (!blink) {
    if (dizzy) {
      cv.set(hx + 1, hy - 1, C.GOLD);
      cv.set(hx + 6, hy, C.GOLD);
    } else {
      cv.set(hx + 1, hy - 1, C.CYAN_BRIGHT);
      cv.set(hx + 6, hy - 1, flashFace ? C.WHITE : C.CYAN_BRIGHT);
    }
  }
}

function drawHeroFrame(heroId, state, frameIdx) {
  const cv = makeCanvas(48, 48);
  const { pal } = HERO_PROFILES[heroId];

  // Canonical foot ground pivot is (24, 44): standing boots end at y=43, outline at y=44.
  const cx = 24;
  let bodyDx = 0;
  let bodyDy = 0;
  let headDx = 0;
  let headDy = 0;
  let legMode = 'stand';
  let capeWave = 0;
  let blink = false;
  let dizzy = false;
  let squinted = false;
  let flashFace = false;
  let dustTrail = false;
  let speedStreaks = false;

  if (state === 'idle') {
    if (frameIdx === 1) { bodyDy = 1; headDy = 1; capeWave = 1; }
    else if (frameIdx === 2) { blink = true; capeWave = 2; }
    else if (frameIdx === 3) { capeWave = 1; }
  } else if (state === 'run') {
    // 6-frame Miragine snappy cadence (dy: [0, +1, -2, 0, +1, -2])
    const bobs = [0, 1, -2, 0, 1, -2];
    bodyDy = bobs[frameIdx];
    headDy = bobs[frameIdx];
    bodyDx = 1;
    headDx = 1;
    legMode = `run_${frameIdx}`;
    capeWave = (frameIdx % 3) + 1;
  } else if (state === 'shoot') {
    squinted = true;
    if (frameIdx === 0) { bodyDx = 1; headDx = 1; capeWave = 1; }
    else if (frameIdx === 1) { bodyDx = -2; headDx = -2; headDy = -1; flashFace = true; capeWave = 2; }
    else { bodyDx = -1; headDx = -1; capeWave = 1; }
  } else if (state === 'dash') {
    if (frameIdx === 0) { bodyDy = 2; headDy = 2; bodyDx = 1; headDx = 2; legMode = 'crouch'; capeWave = 1; }
    else if (frameIdx === 1) { bodyDy = 0; headDy = 0; bodyDx = 3; headDx = 4; legMode = 'lunge'; capeWave = 3; speedStreaks = true; }
    else if (frameIdx === 2) { bodyDy = -2; headDy = -2; bodyDx = 2; headDx = 3; legMode = 'tuck'; capeWave = 3; }
    else { bodyDy = 1; headDy = 1; bodyDx = 1; headDx = 1; legMode = 'brake'; capeWave = 1; dustTrail = true; }
  } else if (state === 'stunned') {
    dizzy = true;
    bodyDy = 1;
    headDy = 1;
    bodyDx = frameIdx === 0 ? -1 : 1;
    headDx = frameIdx === 0 ? -2 : 2;
    capeWave = frameIdx;
  } else if (state === 'dead') {
    if (frameIdx === 0) {
      // Stagger backward
      bodyDx = -2; headDx = -3; headDy = 0; legMode = 'stagger'; capeWave = 2; blink = true;
    } else if (frameIdx === 1) {
      // Collapsing to knees
      bodyDx = -1; bodyDy = 4; headDx = 1; headDy = 5; legMode = 'kneel'; blink = true;
    } else if (frameIdx === 2) {
      // Co-op Downed Hold Pose (kneeling/slumped, alive-but-downed)
      bodyDx = 0; bodyDy = 6; headDx = 2; headDy = 8; legMode = 'downed'; blink = true;
    } else {
      // Eliminated prone corpse on ground
      drawDeadProne(cv, heroId, cx);
      return finalizeCell(cv.img);
    }
  }

  const bx = cx + bodyDx;
  const by = 30 + bodyDy; // torso center around y=30, shoulder at y~25-27, legs down to y=43
  const hx = cx + headDx;
  const hy = 17 + headDy; // head center at y=17, ears/horns reach y=3..5 with >=1px top clearance

  // 1. Back accessory: scarf / cloak / cape trailing behind (-X)
  drawBackCapeOrScarf(cv, heroId, bx, by, capeWave);

  // 2. Legs & Boots (anchored so ground contact bottoms sit cleanly at y=43)
  drawHeroLegs(cv, heroId, cx + Math.round(bodyDx * 0.5), 36 + bodyDy, legMode, bodyDy);

  // 3. Torso (armless front shoulder on +X so d19 gun pivot sits unobstructed!)
  cv.oval(bx, by, 6.2, 6.5, pal.torsoBase, pal.torsoShade, pal.torsoHi);
  // Subtle tucked back arm on far left (-X) only
  cv.rect(bx - 6, by - 2, 2, 5, pal.torsoShade);
  cv.rect(bx - 6, by + 2, 2, 2, heroId === 'knight' ? C.MONO_4 : pal.trim);

  // Collar / belt / chest accent
  if (heroId === 'mascot') {
    // Sky-blue scarf wrap around neck
    cv.hline(bx - 5, bx + 5, by - 5, C.BLUE_2);
    cv.hline(bx - 4, bx + 5, by - 6, C.CYAN);
    cv.hline(bx - 3, bx + 4, by + 3, pal.belt);
    cv.rect(bx + 1, by + 3, 2, 2, pal.buckle);
  } else if (heroId === 'ranger') {
    cv.hline(bx - 4, bx + 5, by - 5, C.CYAN);
    cv.hline(bx - 4, bx + 4, by + 3, pal.belt);
    cv.set(bx + 2, by + 3, pal.buckle);
  } else if (heroId === 'pyro') {
    cv.hline(bx - 4, bx + 5, by - 5, C.ORANGE);
    cv.hline(bx - 4, bx + 5, by + 4, C.GOLD);
    cv.rect(bx + 1, by + 1, 2, 2, C.GOLD);
  } else if (heroId === 'knight') {
    // Broad steel pauldron back + gold chest cross
    cv.rect(bx - 7, by - 5, 4, 4, C.MONO_5);
    cv.rect(bx - 6, by - 4, 3, 2, C.MONO_4);
    cv.hline(bx - 3, bx + 5, by + 3, pal.belt);
    cv.rect(bx + 1, by - 1, 2, 4, C.GOLD);
    cv.hline(bx + 0, bx + 3, by, C.GOLD);
  }

  // 4. Head & Headgear
  drawHeroHead(cv, heroId, hx, hy, { blink, dizzy, squinted, flashFace });

  // 5. Dash speed-streaks & landing dust micro-pixels
  if (speedStreaks) {
    cv.hline(bx - 14, bx - 9, by - 3, heroId === 'pyro' ? C.ORANGE : C.CYAN);
    cv.hline(bx - 16, bx - 10, by + 2, C.WHITE);
  }
  if (dustTrail) {
    cv.rect(cx - 10, 42, 3, 2, C.SAND_4);
    cv.set(cx - 12, 41, C.SAND_5);
  }

  return finalizeCell(cv.img);
}

function drawBackCapeOrScarf(cv, heroId, bx, by, wave) {
  const { pal } = HERO_PROFILES[heroId];
  const wy = wave >= 2 ? -2 : wave === 1 ? -1 : 0;
  if (heroId === 'mascot') {
    // Two cute fluttering sky-blue scarf tails behind (-X)
    cv.rect(bx - 9, by - 5 + wy, 5, 2, pal.capeHi);
    cv.rect(bx - 12 - wave, by - 4 + wy, 4, 2, pal.capeBase);
    cv.rect(bx - 10 - wave, by - 2, 4, 2, pal.capeShade);
    return;
  }
  // Flowing cloak / cape behind torso
  cv.rect(bx - 9, by - 4 + wy, 4, 7, pal.capeBase);
  cv.rect(bx - 11 - wave, by - 2 + wy, 3, 6, pal.capeShade);
  cv.hline(bx - 11 - wave, bx - 7, by + 4 + wy, pal.trim);
}

function drawHeroLegs(cv, heroId, lx, ly, mode, bodyDy) {
  const { pal } = HERO_PROFILES[heroId];
  const footY = 43; // locked ground baseline when standing

  const drawBoot = (x, y, w = 4, h = 3) => {
    cv.rect(x, y, w, h, pal.bootBase);
    cv.hline(x, x + w - 1, y + h - 1, pal.bootShade);
    cv.set(x + w - 1, y, pal.bootHi);
  };

  if (mode === 'stand') {
    // Two planted boots at y = 41..43
    cv.rect(lx - 4, ly, 3, footY - ly - 1, pal.bootShade);
    cv.rect(lx + 1, ly, 3, footY - ly - 1, pal.bootBase);
    drawBoot(lx - 5, 41, 4, 3);
    drawBoot(lx + 1, 41, 4, 3);
  } else if (mode === 'run_0') {
    // Contact L: front foot far right at y=43, back foot behind
    cv.rect(lx - 5, ly, 3, 5, pal.bootShade);
    drawBoot(lx - 7, 41, 4, 3);
    cv.rect(lx + 2, ly, 3, 5, pal.bootBase);
    drawBoot(lx + 3, 41, 4, 3);
  } else if (mode === 'run_1') {
    // Down/Push: front planted, back heel lifted
    drawBoot(lx - 6, 39, 4, 3);
    cv.rect(lx - 4, ly, 3, 4, pal.bootShade);
    cv.rect(lx + 1, ly, 3, 4, pal.bootBase);
    drawBoot(lx + 1, 41, 4, 3);
  } else if (mode === 'run_2') {
    // Pass High (-2px airborne lift) with tucked knees connected to hips
    cv.rect(lx - 2, ly - 2, 3, 5, pal.bootShade);
    drawBoot(lx - 3, 38, 4, 3);
    cv.rect(lx + 1, ly - 2, 3, 4, pal.bootBase);
    drawBoot(lx + 1, 37, 4, 3);
  } else if (mode === 'run_3') {
    // Contact R: swapped stride
    cv.rect(lx - 5, ly, 3, 5, pal.bootBase);
    drawBoot(lx - 6, 40, 4, 3);
    cv.rect(lx + 1, ly, 3, 5, pal.bootShade);
    drawBoot(lx + 2, 41, 4, 3);
  } else if (mode === 'run_4') {
    // Down/Push R
    cv.rect(lx - 3, ly, 3, 4, pal.bootBase);
    drawBoot(lx - 4, 41, 4, 3);
    cv.rect(lx + 1, ly - 1, 3, 4, pal.bootShade);
    drawBoot(lx + 2, 39, 4, 3);
  } else if (mode === 'run_5') {
    // Pass High R (-2px airborne lift!) with tucked knees connected to hips
    cv.rect(lx - 2, ly - 2, 3, 4, pal.bootBase);
    drawBoot(lx - 3, 37, 4, 3);
    cv.rect(lx + 1, ly - 2, 3, 5, pal.bootShade);
    drawBoot(lx + 2, 38, 4, 3);
  } else if (mode === 'crouch') {
    cv.rect(lx - 4, ly - 1, 3, 4, pal.bootShade);
    drawBoot(lx - 5, 41, 4, 3);
    cv.rect(lx + 2, ly - 1, 3, 4, pal.bootBase);
    drawBoot(lx + 2, 41, 4, 3);
  } else if (mode === 'lunge') {
    // Horizontal kicked-back boots during lunge with leg bridge
    cv.rect(lx - 7, ly, 5, 3, pal.bootShade);
    drawBoot(lx - 10, 39, 5, 3);
    cv.rect(lx - 4, ly + 1, 5, 3, pal.bootBase);
    drawBoot(lx - 6, 41, 5, 3);
  } else if (mode === 'tuck') {
    // Airborne tucked boots connected cleanly to hips
    cv.rect(lx - 3, ly - 2, 3, 5, pal.bootShade);
    drawBoot(lx - 4, 38, 4, 3);
    cv.rect(lx + 1, ly - 2, 3, 4, pal.bootBase);
    drawBoot(lx + 1, 37, 4, 3);
  } else if (mode === 'brake') {
    cv.rect(lx - 4, ly - 1, 3, 5, pal.bootShade);
    drawBoot(lx - 5, 41, 4, 3);
    cv.rect(lx + 2, ly - 1, 3, 5, pal.bootBase);
    drawBoot(lx + 3, 41, 4, 3);
  } else if (mode === 'stagger') {
    cv.rect(lx - 4, ly - 1, 3, 6, pal.bootShade);
    drawBoot(lx - 6, 41, 4, 3);
    cv.rect(lx + 1, ly - 1, 3, 6, pal.bootBase);
    drawBoot(lx + 1, 41, 4, 3);
  } else if (mode === 'kneel' || mode === 'downed') {
    // Kneeling / slumped boots flat on ground y=41..43
    drawBoot(lx - 7, 41, 5, 3);
    drawBoot(lx - 1, 41, 5, 3);
    if (bodyDy >= 6) {
      // Extra knee pad touching ground
      cv.rect(lx + 3, 42, 3, 2, pal.torsoShade);
    }
  }
}

function drawDeadProne(cv, heroId, cx) {
  const { pal } = HERO_PROFILES[heroId];
  // Eliminated prone silhouette lying horizontally at y = 34..43
  // Legs stretched left
  cv.rect(cx - 14, 38, 6, 4, pal.bootBase);
  cv.rect(cx - 15, 39, 3, 4, pal.bootShade);
  // Prone torso
  cv.oval(cx - 4, 38, 7, 4.5, pal.torsoBase, pal.torsoShade, pal.torsoHi);
  cv.rect(cx - 4, 35, 3, 6, pal.capeBase);
  // Slumped head resting right
  cv.oval(cx + 6, 37, 6.5, 5.2, pal.hoodBase, pal.hoodShade, pal.hoodHi);
  if (heroId === 'mascot') {
    cv.rect(cx + 3, 30, 5, 3, pal.hoodBase);
    cv.rect(cx + 7, 32, 4, 2, C.CRIMSON_3);
    cv.rect(cx + 2, 35, 3, 7, C.CYAN);
  } else if (heroId === 'ranger') {
    cv.rect(cx + 7, 36, 4, 2, C.BLUE_1);
    cv.hline(cx + 8, cx + 10, 36, C.CYAN);
  } else if (heroId === 'pyro') {
    cv.hline(cx + 6, cx + 10, 34, C.ORANGE);
    cv.rect(cx + 8, 36, 3, 2, C.CRIMSON_0);
  } else if (heroId === 'knight') {
    cv.rect(cx + 4, 30, 3, 3, C.GOLD);
    cv.rect(cx + 9, 36, 2, 4, C.OUTLINE);
  }
}

// ---------------------------------------------------------------------------
// 32x32 Pet Companion Renderer (Tiger Cub + Calico Cat, nativeFacing = 'left')
// ---------------------------------------------------------------------------

const PET_ANIMS = [
  { action: 'idle', frames: 4, fps: 5, loop: true },
  { action: 'trot', frames: 6, fps: 12, loop: true },
  { action: 'pounce', frames: 4, fps: 14, loop: false },
  { action: 'fire', frames: 3, fps: 12, loop: false },
];

const PET_PROFILES = {
  tiger: {
    id: 'tiger',
    name: 'Tiger Cub',
    pal: {
      coatHi: C.GOLD,
      coat: C.ORANGE,
      shade: C.COPPER_2,
      stripe: C.COPPER_0,
      belly: C.SAND_5,
      earInner: C.PEACH,
      nose: C.CRIMSON_2,
      eye: C.OUTLINE,
      claw: C.SAND_5,
    },
  },
  cat: {
    id: 'cat',
    name: 'Calico Cat',
    pal: {
      coatHi: C.WHITE,
      coat: C.MONO_5,
      shade: C.MONO_4,
      stripe: C.ORANGE,
      belly: C.WHITE,
      earInner: C.PINK_LIGHT,
      nose: C.ORANGE,
      eye: C.GREEN_2,
      claw: C.WHITE,
    },
  },
};

function drawPetFrame(petId, action, frameIdx) {
  const cv = makeCanvas(32, 32);
  const { pal } = PET_PROFILES[petId];

  // Native facing LEFT (-X); foot pivot at (16, 28) -> standing paws at y=27, outline at y=28
  let dx = 0;
  let dy = 0;
  let earDy = 0;
  let tailDy = 0;
  let blink = false;
  let stretch = 0;
  let mouthOpen = false;
  let cheekGlow = false;
  let clawSlash = false;
  let pawPhase = 0;

  if (action === 'idle') {
    if (frameIdx === 1) { earDy = -1; tailDy = -1; }
    else if (frameIdx === 2) { dy = 1; tailDy = -2; }
    else if (frameIdx === 3) { blink = true; }
  } else if (action === 'trot') {
    const bobs = [0, 1, -2, -1, 1, 0];
    dy = bobs[frameIdx];
    pawPhase = frameIdx;
    stretch = frameIdx === 3 ? 1 : 0;
    tailDy = (frameIdx % 3) - 1;
  } else if (action === 'pounce') {
    if (frameIdx === 0) { dy = 2; earDy = 1; pawPhase = 6; }
    else if (frameIdx === 1) { dy = -3; dx = -1; stretch = 2; pawPhase = 7; }
    else if (frameIdx === 2) { dy = -2; dx = -1; stretch = 1; clawSlash = true; pawPhase = 7; }
    else { dy = 0; pawPhase = 0; }
  } else if (action === 'fire') {
    if (frameIdx === 0) { cheekGlow = true; earDy = -1; }
    else if (frameIdx === 1) { mouthOpen = true; dx = -1; }
    else { dx = 1; }
  }

  const cx = 16 + dx;
  const bodyY = 22 + dy;
  const headX = 11 + dx - stretch;
  const headY = 16 + dy;

  // Tail on right (+X)
  cv.rect(cx + 7 + stretch, bodyY - 4 + tailDy, 3, 2, pal.coat);
  cv.rect(cx + 9 + stretch, bodyY - 6 + tailDy, 2, 3, pal.shade);
  cv.set(cx + 10 + stretch, bodyY - 7 + tailDy, pal.stripe);

  // Body (compact 14x8 feline torso)
  cv.oval(cx + 2, bodyY, 6.5 + stretch, 4.2, pal.coat, pal.shade, pal.coatHi);
  // Belly highlight
  cv.hline(cx - 2, cx + 6, bodyY + 3, pal.belly);
  // Tiger stripes / Calico patches across back
  cv.rect(cx + 0, bodyY - 4, 2, 3, pal.stripe);
  cv.rect(cx + 4, bodyY - 3, 2, 3, pal.stripe);
  if (petId === 'cat') {
    cv.rect(cx + 5, bodyY - 2, 3, 3, C.EARTH_2);
  }

  // Paws (bottom at y=27 when dy=0)
  const drawPaw = (px, py) => {
    cv.rect(px, py, 3, 2, pal.coat);
    cv.set(px, py + 1, pal.belly);
  };
  if (pawPhase === 0 || pawPhase === 5) {
    drawPaw(cx - 4, 26 + dy);
    drawPaw(cx + 4, 26 + dy);
  } else if (pawPhase === 1 || pawPhase === 4) {
    drawPaw(cx - 5, 25 + dy);
    drawPaw(cx + 5, 26 + dy);
  } else if (pawPhase === 2) {
    drawPaw(cx - 3, 25 + dy);
    drawPaw(cx + 3, 25 + dy);
  } else if (pawPhase === 3) {
    drawPaw(cx - 7, 25 + dy);
    drawPaw(cx + 7, 25 + dy);
  } else if (pawPhase === 6) {
    // Coiled crouch paws
    drawPaw(cx - 5, 25 + dy);
    drawPaw(cx + 5, 25 + dy);
  } else if (pawPhase === 7) {
    // Outstretched pounce paws
    drawPaw(cx - 8, 24 + dy);
    drawPaw(cx + 7, 25 + dy);
  }

  // Cute oversized feline head facing LEFT (-X)
  cv.oval(headX, headY, 5.8, 5.0, pal.coat, pal.shade, pal.coatHi);
  // Pointed ears
  cv.rect(headX - 4, headY - 7 + earDy, 3, 3, pal.coat);
  cv.set(headX - 3, headY - 6 + earDy, pal.earInner);
  cv.rect(headX + 2, headY - 7 + earDy, 3, 3, pal.coat);
  cv.set(headX + 3, headY - 6 + earDy, pal.earInner);

  // Forehead stripes / calico patch (clean connected tuft, no stray dot)
  cv.set(headX, headY - 4, pal.stripe);
  cv.hline(headX - 1, headX + 1, headY - 3, pal.stripe);
  cv.hline(headX + 4, headX + 5, headY, pal.stripe);

  // Cream muzzle & cute nose on left
  cv.rect(headX - 5, headY + 1, 5, 3, pal.belly);
  cv.set(headX - 5, headY + 1, pal.nose);

  // Cheek glow or ember spit
  if (cheekGlow) {
    cv.rect(headX - 1, headY + 1, 2, 2, C.ORANGE);
    cv.set(headX - 1, headY + 1, C.GOLD);
  }
  if (mouthOpen) {
    cv.rect(headX - 6, headY + 2, 2, 2, C.CRIMSON_0);
    // Mini fire ember spark flying left (keep >= 2px left margin for 1px outline)
    cv.rect(headX - 8, headY + 1, 2, 3, C.ORANGE);
    cv.rect(headX - 8, headY + 2, 2, 2, C.GOLD);
    cv.set(headX - 7, headY + 2, C.WHITE);
  }

  // Eyes (facing left)
  if (blink) {
    cv.hline(headX - 4, headX - 3, headY, C.OUTLINE);
    cv.hline(headX + 0, headX + 1, headY, C.OUTLINE);
  } else {
    cv.rect(headX - 4, headY - 1, 2, 2, pal.eye);
    cv.set(headX - 4, headY - 1, C.WHITE);
    cv.rect(headX + 0, headY - 1, 2, 2, pal.eye);
    cv.set(headX + 0, headY - 1, C.WHITE);
  }

  // Claw-swipe flash arc on pounce f2 (keep >= 2px left margin for 1px outline)
  if (clawSlash) {
    cv.set(headX - 6, headY + 1, pal.claw);
    cv.set(headX - 7, headY + 3, C.GOLD);
    cv.set(headX - 7, headY + 5, pal.claw);
    cv.set(headX - 6, headY + 7, C.WHITE);
  }

  return finalizeCell(cv.img);
}

// ---------------------------------------------------------------------------
// Main Build Pipeline
// ---------------------------------------------------------------------------

async function buildAll() {
  await fs.mkdir(HERO_DIR, { recursive: true });
  await fs.mkdir(PET_DIR, { recursive: true });

  const cc0Refs = await fetchCc0References();
  const fetchedCount = cc0Refs.filter((r) => r.status === 'fetched-cc0' || r.status === 'cached-cc0').length;
  console.log(`[w11] CC0 reference fetch: ${fetchedCount}/${cc0Refs.length} verified (${OFFLINE_MODE ? 'offline' : 'online'})`);

  const spritesMeta = {};
  const heroesMeta = {};
  const petsMeta = {};

  // 1. Build 4 Hero Classes x 6 Miragine-Cadence 48x48 Right-Facing Strips
  for (const [heroId, profile] of Object.entries(HERO_PROFILES)) {
    const heroStates = {};
    for (const anim of HERO_ANIMS) {
      const frames = [];
      for (let f = 0; f < anim.frames; f++) {
        frames.push(drawHeroFrame(heroId, anim.state, f));
      }
      const packed = packStrip(frames, 48, 48);
      const filename = `${heroId}_${anim.state}.png`;
      const absPath = path.join(HERO_DIR, filename);
      await writePngFile(absPath, packed.sheet);

      const relSrc = `sprites/heroes/${filename}`;
      const relNorm = `normalized/heroes/hero_${heroId}_${anim.state}.png`;
      const assetId = `hero_${heroId}_${anim.state}`;
      const aliases = profile.aliases.map((a) => `${a}_${anim.state}`);

      const entry = {
        id: assetId,
        path: relSrc,
        normalizedPath: relNorm,
        category: 'hero',
        heroId,
        state: anim.state,
        frames: anim.frames,
        cellW: 48,
        cellH: 48,
        offX: -24,
        offY: -44,
        fps: anim.fps,
        loop: anim.loop,
        nativeFacing: 'right',
        tier: 48,
        meta: [anim.frames, 48, 48, -24, -44],
        width: packed.width,
        height: packed.height,
        bytes: packed.pngBuffer.length,
        sha256: sha256Hex(packed.pngBuffer),
        pivot: {
          anchorX: 24,
          anchorY: 44,
          shoulderOffset: profile.shoulderOffset,
          headTopY: profile.headTopY,
        },
        aliases,
        fallback: profile.fallback,
        sourceId: 'generated_synth',
        license: 'GENERATED-SYNTH',
        cc0InspirationIds: ['kenney_desert_shooter', 'superpowers_asset_packs'],
      };
      spritesMeta[assetId] = entry;
      heroStates[anim.state] = {
        file: filename,
        assetId,
        meta: entry.meta,
        fps: anim.fps,
        loop: anim.loop,
      };
    }

    heroesMeta[heroId] = {
      id: heroId,
      name: profile.name,
      shoulderOffset: profile.shoulderOffset,
      headTopY: profile.headTopY,
      starterWeapon: profile.starterWeapon,
      nativeFacing: 'right',
      cellW: 48,
      cellH: 48,
      offX: -24,
      offY: -44,
      states: heroStates,
    };
  }

  // 2. Build 32x32 Pet Strips (Tiger Cub + Calico Cat, nativeFacing = 'left')
  for (const [petId, profile] of Object.entries(PET_PROFILES)) {
    const petAnims = {};
    for (const anim of PET_ANIMS) {
      const frames = [];
      for (let f = 0; f < anim.frames; f++) {
        frames.push(drawPetFrame(petId, anim.action, f));
      }
      const packed = packStrip(frames, 32, 32);
      const filename = `pet_${petId}_${anim.action}.png`;
      const absPath = path.join(PET_DIR, filename);
      await writePngFile(absPath, packed.sheet);

      const relSrc = `sprites/pet/${filename}`;
      const relNorm = `normalized/pets/${filename}`;
      const assetId = `pet_${petId}_${anim.action}`;
      const aliases = anim.action === 'trot' ? [`pet_${petId}_run`] : [];

      const entry = {
        id: assetId,
        path: relSrc,
        normalizedPath: relNorm,
        category: 'pet',
        petId,
        state: anim.action,
        frames: anim.frames,
        cellW: 32,
        cellH: 32,
        offX: -16,
        offY: -28,
        fps: anim.fps,
        loop: anim.loop,
        nativeFacing: 'left',
        tier: 32,
        meta: [anim.frames, 32, 32, -16, -28],
        width: packed.width,
        height: packed.height,
        bytes: packed.pngBuffer.length,
        sha256: sha256Hex(packed.pngBuffer),
        pivot: {
          anchorX: 16,
          anchorY: 28,
        },
        aliases,
        fallback: {
          shape: 'capsule',
          color: petId === 'tiger' ? '#ff7a3d' : '#f8f9fa',
          accent: petId === 'tiger' ? '#45242e' : '#ff7a3d',
        },
        sourceId: 'generated_synth',
        license: 'GENERATED-SYNTH',
        cc0InspirationIds: ['superpowers_asset_packs'],
      };
      spritesMeta[assetId] = entry;
      petAnims[anim.action] = {
        file: filename,
        assetId,
        meta: entry.meta,
        fps: anim.fps,
        loop: anim.loop,
      };
    }

    petsMeta[petId] = {
      id: petId,
      name: profile.name,
      nativeFacing: 'left',
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -28,
      anims: petAnims,
    };
  }

  // 3. Write database-ban-sung/sprites/heroes/meta-heroes.json
  const metadata = {
    version: 1,
    slice: 'w11',
    generatedAt: new Date().toISOString(),
    normStandard: {
      heroGrid: '48x48',
      heroPivot: { offX: -24, offY: -44, nativeFacing: 'right' },
      petGrid: '32x32',
      petPivot: { offX: -16, offY: -28, nativeFacing: 'left' },
      outlineHex: NORM_CONSTANTS.OUTLINE_HEX,
      palette: 'BANSUNG_PALETTE_48',
      alphaCutoff: NORM_CONSTANTS.ALPHA_CUTOFF,
    },
    cc0References: cc0Refs,
    heroes: heroesMeta,
    pets: petsMeta,
    sprites: spritesMeta,
  };

  await fs.writeFile(META_PATH, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
  console.log(`[w11] Generated ${Object.keys(spritesMeta).length} strips (24 hero + 8 pet) -> ${META_PATH}`);
}

buildAll().catch((err) => {
  console.error('[w11] build-hero-sprites failed:', err);
  process.exitCode = 1;
});
