/**
 * Extracts, normalizes, and writes reusable Miragine War assets into
 * `database-ban-sung/sprites/miragine/` plus `meta-miragine.json` (w10).
 *
 * Rules applied (d13, d14, d09):
 * - Copies soft-alpha / raw assets verbatim after binary header validation:
 *   `shadow.png`, `terrain.jpg`, `terrain2.jpg`, `fireball.png`, `thunderball.png`,
 *   `storm.png`, `A_crystal.png`, and `SD_dead1..6.mp3`.
 * - Applies `d13` center/ground pivot overrides on `fireball`, `thunderball`, `storm`.
 * - Slices `A0`, `A5`, `A8`, `A11`, `A13`, `B3`, `B7` (`idle`, `run`, `attack`, `dead`)
 *   using exact per-key tuples from `database-miraginewar/mapping.json`, flips every
 *   frame horizontally to `nativeFacing = "right"`, preserves exact foot pivots
 *   (`offX = -(cellW + origOffX)`, `offY = origOffY`), hardens alpha (>=128),
 *   quantizes interior pixels to `BANSUNG_PALETTE_48`, and adds a 1px `#181425`
 *   4-connected pixel outline.
 * - Never writes outside `database-ban-sung/sprites/miragine/`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANSUNG_PALETTE_48,
  NORM_CONSTANTS,
  applyOutline4Conn,
  assertMagicFormat,
  computeFootCenterX,
  flipImageX,
  getOpaqueBBox,
  hardenAlpha,
  inspectPngHeader,
  packStrip,
  quantizeImageToPalette48,
  readPngFile,
  sha256Hex,
  sliceSpriteSheet,
  stripDarkOutline,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_ROOT = path.join(REPO_ROOT, 'database-miraginewar');
const OUT_DIR = path.join(REPO_ROOT, 'database-ban-sung', 'sprites', 'miragine');
const META_PATH = path.join(OUT_DIR, 'meta-miragine.json');

const SOURCE_ID = 'internal_miragine';
const LICENSE = 'INTERNAL-MIRAGINE';

const UNIT_ROLES = Object.freeze({
  A0: { role: 'hero_fallback_mascot', category: 'hero', vnName: 'Kiếm Sĩ', fallbackColor: '#4dabf7', fallbackAccent: '#f8f9fa' },
  A5: { role: 'hero_fallback_pyro', category: 'hero', vnName: 'Tân Binh', fallbackColor: '#c92a2a', fallbackAccent: '#ff922b' },
  A8: { role: 'hero_fallback_knight', category: 'hero', vnName: 'Kỵ Binh', fallbackColor: '#3b5bdb', fallbackAccent: '#fcc419' },
  A11: { role: 'hero_fallback_ranger', category: 'hero', vnName: 'Ninja', fallbackColor: '#1e293b', fallbackAccent: '#22d3ee' },
  A13: { role: 'boss_colossus', category: 'boss', vnName: 'Ác Ma Lãnh Chúa', fallbackColor: '#8a1c31', fallbackAccent: '#fee761' },
  B3: { role: 'boss_colossus_drone', category: 'enemy', vnName: 'Kỵ Sĩ Thiết Giáp', fallbackColor: '#3a4466', fallbackAccent: '#2ce8f5' },
  B7: { role: 'mob_thunder_mage', category: 'enemy', vnName: 'Pháp Sư Tập Sự', fallbackColor: '#124e89', fallbackAccent: '#9cf9ff' },
});

const UNIT_KEYS = Object.keys(UNIT_ROLES);
const UNIT_STATES = ['idle', 'run', 'attack', 'dead'];

const STATE_PLAYBACK = Object.freeze({
  idle: { fps: 6, loop: true },
  run: { fps: 12, loop: true },
  attack: { fps: 14, loop: false },
  dead: { fps: 10, loop: false },
});

/**
 * Parses JPEG SOF0/SOF1/SOF2 marker dimensions without external dependencies.
 */
function inspectJpegDimensions(buf) {
  assertMagicFormat(buf, 'jpg', 'jpegBuffer');
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buf.length) break;
    const segLen = buf.readUInt16BE(offset + 2);
    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb);
    if (isSof && offset + 9 <= buf.length) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + Math.max(2, segLen);
  }
  throw new Error('Could not locate JPEG SOF dimensions');
}

/**
 * Parses MPEG audio frame headers to measure duration in ms.
 */
function measureMp3DurationMs(buf) {
  assertMagicFormat(buf, 'mp3', 'mp3Buffer');
  const bitratesV1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const bitratesV2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const ratesV1 = [44100, 48000, 32000, 0];
  const ratesV2 = [22050, 24000, 16000, 0];
  const ratesV25 = [11025, 12000, 8000, 0];

  let pos = 0;
  if (buf.length >= 10 && buf.subarray(0, 3).toString('ascii') === 'ID3') {
    const tagSize = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    pos = 10 + tagSize;
  }

  let frames = 0;
  let totalMs = 0;
  while (pos + 4 <= buf.length) {
    if (buf[pos] === 0xff && (buf[pos + 1] & 0xe0) === 0xe0) {
      const ver = (buf[pos + 1] >> 3) & 3;
      const layer = (buf[pos + 1] >> 1) & 3;
      const brIdx = (buf[pos + 2] >> 4) & 0xf;
      const srIdx = (buf[pos + 2] >> 2) & 3;
      const pad = (buf[pos + 2] >> 1) & 1;
      const sr = ver === 3 ? ratesV1[srIdx] : ver === 2 ? ratesV2[srIdx] : ver === 0 ? ratesV25[srIdx] : 0;
      const br = (ver === 3 ? bitratesV1L3[brIdx] : bitratesV2L3[brIdx]) * 1000;
      if (layer === 1 && sr > 0 && br > 0) {
        const spf = ver === 3 ? 1152 : 576;
        const flen = Math.floor(((spf / 8) * br) / sr) + pad;
        if (flen >= 4 && pos + flen <= buf.length) {
          frames++;
          totalMs += (spf / sr) * 1000;
          pos += flen;
          continue;
        }
      }
    }
    pos++;
  }
  return { frames, durationMs: Math.max(100, Math.round(totalMs)) };
}

function chooseRecommendedNormTier(cellW, cellH) {
  const maxDim = Math.max(cellW, cellH);
  if (maxDim <= 46) return 48;
  if (maxDim <= 94) return 96;
  return 128;
}

async function copyValidatedAsset(srcRel, destName, expectedFormat) {
  const srcPath = path.join(SRC_ROOT, srcRel);
  const destPath = path.join(OUT_DIR, destName);
  const buf = await fs.readFile(srcPath);
  const format = assertMagicFormat(buf, expectedFormat, srcRel);
  await fs.writeFile(destPath, buf);
  return {
    srcRel,
    destRel: `sprites/miragine/${destName}`,
    destPath,
    format,
    bytes: buf.length,
    sha256: sha256Hex(buf),
    buf,
  };
}

/**
 * Flips a Miragine unit sheet right-facing while preserving exact cell size and
 * exact SWF foot pivot (`offX = -(cellW + origOffX)`, `offY = origOffY`), then
 * hardens alpha, quantizes interior pixels to `BANSUNG_PALETTE_48`, and adds a
 * 1px `#181425` 4-connected outline.
 */
async function processUnitSheet(sheetKey, animSpec, unitKey, state) {
  const srcRel = `sheets/${sheetKey}.png`;
  const destName = `${sheetKey}.png`;
  const srcPath = path.join(SRC_ROOT, srcRel);
  const destPath = path.join(OUT_DIR, destName);

  const img = await readPngFile(srcPath);
  const { frames: frameCount, cellW, cellH, offX: origOffX, offY: origOffY } = animSpec;
  if (img.width !== frameCount * cellW || img.height !== cellH) {
    throw new Error(
      `Dimension mismatch for ${srcRel}: PNG is ${img.width}x${img.height}, mapping expects ${frameCount}*${cellW}x${cellH}`,
    );
  }

  const rawFrames = sliceSpriteSheet(img, cellW, cellH, { count: frameCount });
  const processedFrames = rawFrames.map((frame) => {
    const flipped = flipImageX(frame);
    const hardened = hardenAlpha(flipped, NORM_CONSTANTS.ALPHA_CUTOFF);
    // Strip existing dark fringe before LUT + 1px #181425 outline to prevent #2e1d1b double-borders
    const stripped = stripDarkOutline(hardened, {
      lumaMax: 45,
      alphaCutoff: NORM_CONSTANTS.ALPHA_CUTOFF,
    });
    const quantized = quantizeImageToPalette48(stripped, {
      lutStrength: 1.0,
      alphaCutoff: NORM_CONSTANTS.ALPHA_CUTOFF,
      preserveOutline: true,
    });
    return applyOutline4Conn(quantized, NORM_CONSTANTS.OUTLINE_RGBA, NORM_CONSTANTS.ALPHA_CUTOFF);
  });

  const packed = packStrip(processedFrames, cellW, cellH);
  await fs.writeFile(destPath, packed.pngBuffer);

  // Verify written PNG IHDR header
  const writtenHeader = inspectPngHeader(await fs.readFile(destPath));
  if (writtenHeader.width !== frameCount * cellW || writtenHeader.height !== cellH) {
    throw new Error(`Post-write PNG check failed for ${destName}`);
  }

  // Right-facing foot pivot derived symmetrically from Miragine's left-facing offset
  const flippedOffX = -(cellW + origOffX);
  const flippedOffY = origOffY;

  const f0Box = getOpaqueBBox(processedFrames[0], NORM_CONSTANTS.ALPHA_CUTOFF);
  const detectedFootX = computeFootCenterX(processedFrames[0], f0Box, NORM_CONSTANTS.ALPHA_CUTOFF);
  const roleInfo = UNIT_ROLES[unitKey];
  const basePlayback = STATE_PLAYBACK[state];
  const fps =
    unitKey === 'A13' && state === 'run'
      ? 10
      : unitKey === 'A13' && state === 'attack'
        ? 12
        : unitKey === 'A13' && state === 'dead'
          ? 8
          : unitKey === 'A11' && state === 'run'
            ? 10
            : basePlayback.fps;

  return {
    id: `miragine_${sheetKey}`,
    unitKey,
    state,
    role: roleInfo.role,
    category: roleInfo.category,
    path: `sprites/miragine/${destName}`,
    src: `database-miraginewar/${srcRel}`,
    frames: frameCount,
    cellW,
    cellH,
    width: packed.width,
    height: packed.height,
    offX: flippedOffX,
    offY: flippedOffY,
    origOffX,
    origOffY,
    origNativeFacing: 'left',
    nativeFacing: 'right',
    flippedX: true,
    pivotMode: 'feet',
    pivotPreserved: true,
    detectedFootX,
    fps,
    loop: basePlayback.loop,
    alphaHardened: true,
    outlineMode: '4conn',
    outlineHex: NORM_CONSTANTS.OUTLINE_HEX,
    lutStrength: 1.0,
    paletteSize: BANSUNG_PALETTE_48.length,
    recommendedNormTier: chooseRecommendedNormTier(cellW, cellH),
    fallback: {
      shape: 'capsule',
      color: roleInfo.fallbackColor,
      accent: roleInfo.fallbackAccent,
    },
    bytes: packed.pngBuffer.length,
    sha256: sha256Hex(packed.pngBuffer),
    sourceId: SOURCE_ID,
    license: LICENSE,
  };
}

async function main() {
  const mappingRaw = await fs.readFile(path.join(SRC_ROOT, 'mapping.json'), 'utf8');
  const mapping = JSON.parse(mappingRaw);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const sprites = {};
  const terrains = {};
  const audio = {};

  // 1. Copy & validate static/VFX structures and projectiles
  const shadowFile = await copyValidatedAsset('structures/shadow.png', 'shadow.png', 'png');
  const shadowHdr = inspectPngHeader(shadowFile.buf);
  const shadowMap = mapping.structures.shadow;
  sprites.ui_shadow_unit = {
    id: 'ui_shadow_unit',
    alias: 'shadow',
    category: 'ui',
    path: shadowFile.destRel,
    src: `database-miraginewar/${shadowFile.srcRel}`,
    frames: 1,
    cellW: shadowHdr.width,
    cellH: shadowHdr.height,
    width: shadowHdr.width,
    height: shadowHdr.height,
    offX: shadowMap.offX,
    offY: shadowMap.offY,
    nativeFacing: 'center',
    flippedX: false,
    pivotMode: 'center',
    fps: 0,
    loop: false,
    softAlphaPreserved: true,
    outlineMode: 'none',
    lutStrength: 0,
    fallback: { shape: 'circle', color: '#181425' },
    bytes: shadowFile.bytes,
    sha256: shadowFile.sha256,
    sourceId: SOURCE_ID,
    license: LICENSE,
  };

  const crystalFile = await copyValidatedAsset('structures/A_crystal.png', 'A_crystal.png', 'png');
  const crystalHdr = inspectPngHeader(crystalFile.buf);
  const crystalMap = mapping.structures.A_crystal;
  sprites.prop_crystal_red = {
    id: 'prop_crystal_red',
    alias: 'A_crystal',
    category: 'prop',
    path: crystalFile.destRel,
    src: `database-miraginewar/${crystalFile.srcRel}`,
    frames: 1,
    cellW: crystalHdr.width,
    cellH: crystalHdr.height,
    width: crystalHdr.width,
    height: crystalHdr.height,
    offX: crystalMap.offX,
    offY: crystalMap.offY,
    nativeFacing: 'center',
    flippedX: false,
    pivotMode: 'feet',
    fps: 0,
    loop: false,
    softAlphaPreserved: true,
    outlineMode: 'none',
    lutStrength: 0,
    fallback: { shape: 'rect', color: '#e43b44', accent: '#fee761' },
    bytes: crystalFile.bytes,
    sha256: crystalFile.sha256,
    sourceId: SOURCE_ID,
    license: LICENSE,
  };

  // Projectiles with d13 pivot overrides
  const projSpecs = [
    {
      key: 'vfx_fireball',
      alias: 'fireball',
      srcRel: 'projectiles/fireball.png',
      destName: 'fireball.png',
      category: 'projectile',
      frames: 3,
      cellW: 32,
      cellH: 32,
      offX: -16,
      offY: -16,
      fps: 16,
      loop: true,
      pivotMode: 'center',
      fallback: { shape: 'circle', color: '#ff7a3d', accent: '#fee761' },
    },
    {
      key: 'vfx_thunderball',
      alias: 'thunderball',
      srcRel: 'projectiles/thunderball.png',
      destName: 'thunderball.png',
      category: 'projectile',
      frames: 16,
      cellW: 128,
      cellH: 128,
      offX: -64,
      offY: -64,
      fps: 18,
      loop: true,
      pivotMode: 'center',
      fallback: { shape: 'circle', color: '#2ce8f5', accent: '#ffffff' },
    },
    {
      key: 'vfx_storm',
      alias: 'storm',
      srcRel: 'projectiles/storm.png',
      destName: 'storm.png',
      category: 'vfx',
      frames: 9,
      cellW: 153,
      cellH: 261,
      offX: -76,
      offY: -240,
      fps: 15,
      loop: false,
      pivotMode: 'feet',
      fallback: { shape: 'rect', color: '#0095e9', accent: '#9cf9ff' },
    },
  ];

  for (const spec of projSpecs) {
    const copied = await copyValidatedAsset(spec.srcRel, spec.destName, 'png');
    const hdr = inspectPngHeader(copied.buf);
    if (hdr.width !== spec.frames * spec.cellW || hdr.height !== spec.cellH) {
      throw new Error(`Projectile ${spec.destName} mismatch: ${hdr.width}x${hdr.height}`);
    }
    sprites[spec.key] = {
      id: spec.key,
      alias: spec.alias,
      category: spec.category,
      path: copied.destRel,
      src: `database-miraginewar/${copied.srcRel}`,
      frames: spec.frames,
      cellW: spec.cellW,
      cellH: spec.cellH,
      width: hdr.width,
      height: hdr.height,
      offX: spec.offX,
      offY: spec.offY,
      nativeFacing: 'center',
      flippedX: false,
      pivotMode: spec.pivotMode,
      fps: spec.fps,
      loop: spec.loop,
      outlineMode: 'none',
      lutStrength: 0,
      fallback: spec.fallback,
      bytes: copied.bytes,
      sha256: copied.sha256,
      sourceId: SOURCE_ID,
      license: LICENSE,
    };
  }

  // 2. Copy & validate terrain JPG backdrops
  for (const [id, srcRel, destName, role] of [
    ['tile_miragine_terrain', 'terrains/terrain.jpg', 'terrain.jpg', 'desert_backdrop_fallback'],
    ['tile_miragine_terrain2', 'terrains/terrain2.jpg', 'terrain2.jpg', 'ruin_grass_backdrop'],
  ]) {
    const copied = await copyValidatedAsset(srcRel, destName, 'jpg');
    const dims = inspectJpegDimensions(copied.buf);
    terrains[id] = {
      id,
      role,
      category: 'tile',
      format: 'jpg',
      path: copied.destRel,
      src: `database-miraginewar/${copied.srcRel}`,
      frames: 1,
      cellW: dims.width,
      cellH: dims.height,
      width: dims.width,
      height: dims.height,
      offX: 0,
      offY: 0,
      copyRaw: true,
      lutStrength: 0.75,
      fallback: { shape: 'rect', color: '#c9885b', accent: '#733e39' },
      bytes: copied.bytes,
      sha256: copied.sha256,
      sourceId: SOURCE_ID,
      license: LICENSE,
    };
  }

  // 3. Flip, normalize & preserve foot pivots for A0/A5/A8/A11/A13/B3/B7 unit sheets
  for (const unitKey of UNIT_KEYS) {
    for (const state of UNIT_STATES) {
      const sheetKey = `${unitKey}_${state}`;
      const animSpec = mapping.animations[sheetKey];
      if (!animSpec) {
        throw new Error(`Missing animation spec for ${sheetKey} in database-miraginewar/mapping.json`);
      }
      const entry = await processUnitSheet(sheetKey, animSpec, unitKey, state);
      sprites[entry.id] = entry;
    }
  }

  // 4. Copy & measure SD_dead1..6 death cue MP3s
  for (let idx = 1; idx <= 6; idx++) {
    const fileName = `SD_dead${idx}.mp3`;
    const copied = await copyValidatedAsset(`audio/${fileName}`, fileName, 'mp3');
    const { frames: mp3Frames, durationMs } = measureMp3DurationMs(copied.buf);
    const id = `sfx_miragine_dead_${idx}`;
    audio[id] = {
      id,
      alias: `SD_dead${idx}`,
      path: copied.destRel,
      src: `database-miraginewar/${copied.srcRel}`,
      format: 'mp3',
      kind: 'sfx',
      durationMs,
      mp3Frames,
      gain: 0.75,
      loop: false,
      synthFallback: 'mob_die',
      bytes: copied.bytes,
      sha256: copied.sha256,
      sourceId: SOURCE_ID,
      license: LICENSE,
    };
  }

  const meta = {
    version: 1,
    slice: 'w10',
    sourceId: SOURCE_ID,
    license: LICENSE,
    sourceRoot: 'database-miraginewar',
    outDir: 'database-ban-sung/sprites/miragine',
    generatedAt: new Date().toISOString(),
    normalization: {
      unitNativeFacing: 'right',
      flippedFrom: 'left',
      pivotRule: 'offX = -(cellW + origOffX), offY = origOffY',
      alphaCutoff: NORM_CONSTANTS.ALPHA_CUTOFF,
      outlineHex: NORM_CONSTANTS.OUTLINE_HEX,
      paletteColors: BANSUNG_PALETTE_48.length,
    },
    counts: {
      sprites: Object.keys(sprites).length,
      unitSheets: UNIT_KEYS.length * UNIT_STATES.length,
      terrains: Object.keys(terrains).length,
      audio: Object.keys(audio).length,
      totalAssets: Object.keys(sprites).length + Object.keys(terrains).length + Object.keys(audio).length,
    },
    sprites,
    terrains,
    audio,
  };

  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(
    `[w10 reuse-miragine] Wrote ${meta.counts.totalAssets} assets ` +
      `(${meta.counts.unitSheets} unit sheets flipped right-facing + 5 fx/props + ${meta.counts.terrains} terrains + ${meta.counts.audio} audio cues) ` +
      `and ${path.relative(REPO_ROOT, META_PATH)}`,
  );
}

main().catch((err) => {
  console.error('[w10 reuse-miragine] FAILED:', err);
  process.exit(1);
});
