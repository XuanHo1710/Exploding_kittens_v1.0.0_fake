'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const S = require('../dist/shared/src/index.js');

const {
  MK_BIOMES,
  MK_BOSS_CHOREO,
  MK_BOSS_IDS,
  MK_ELITE_ENEMY_CHOREO,
  MK_ENEMIES,
  MK_ENEMY_IDS,
  MK_HERO_CHOREO,
  MK_HERO_IDS,
  MK_HERO_MASTER_FRAMES,
  MK_MAX_CHAR_FRAMES,
  MK_MIN_CHAR_FRAMES,
  MK_PIXEL_ATLAS_SPECS,
  MK_REGULAR_ENEMY_CHOREO,
  MK_RELIC_IDS,
  MK_STATIC_ROOT,
  MK_VIEW_H,
  MK_VIEW_W,
  MK_ARENA_W,
} = S;

const REPO_ROOT = path.resolve(__dirname, '../..');
const DB_ROOT = path.join(REPO_ROOT, 'database-mighty-knight-pixel');
const MANIFEST_PATH = path.join(DB_ROOT, 'manifest.json');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const EXPECTED_VFX = [
  ['slash_crescent', 64, 48, 4],
  ['slash_cross_x', 64, 64, 5],
  ['whirlwind_360', 96, 64, 6],
  ['holy_pillar', 64, 128, 6],
  ['ground_fissure', 96, 48, 5],
  ['fire_meteor', 48, 64, 6],
  ['lightning_bolt', 48, 128, 5],
  ['frost_nova', 96, 64, 5],
  ['gravity_vortex', 96, 64, 6],
  ['dragon_spirit', 96, 48, 6],
  ['phoenix_flame', 96, 64, 6],
  ['magic_rune_25d', 80, 40, 4],
  ['parry_ring', 64, 64, 4],
  ['aura_fury', 48, 56, 4],
  ['hit_spark', 32, 32, 4],
  ['dust_puff', 32, 24, 4],
  ['projectiles_sheet', 32, 24, 12],
  ['pickups_sheet', 16, 16, 10],
];

const EXPECTED_TERRAIN_LAYERS = {
  bg_sky: [MK_VIEW_W, 168],
  bg_far: [MK_VIEW_W, 112],
  bg_mid: [MK_VIEW_W, 96],
  ground_arena: [MK_ARENA_W, 204],
  fg_silhouette: [MK_VIEW_W, 44],
};

function readPng(filePath) {
  assert.ok(fs.existsSync(filePath), `Missing PNG: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length >= 29 && buf.subarray(0, 8).equals(PNG_SIG), `Invalid PNG signature: ${filePath}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  return { width, height, bitDepth, colorType, interlace, buf };
}

function decodeRgbaPixels(filePath) {
  const info = readPng(filePath);
  assert.equal(info.bitDepth, 8, `Expected 8-bit PNG: ${filePath}`);
  assert.equal(info.colorType, 6, `Expected RGBA (colorType=6): ${filePath}`);
  assert.equal(info.interlace, 0, `Expected non-interlaced PNG: ${filePath}`);

  const idats = [];
  let off = 8;
  while (off + 12 <= info.buf.length) {
    const len = info.buf.readUInt32BE(off);
    const type = info.buf.subarray(off + 4, off + 8).toString('ascii');
    if (type === 'IDAT') idats.push(info.buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = info.width * 4;
  const pixels = Buffer.alloc(info.height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < info.height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = raw[rowStart + x];
      const left = x >= 4 ? pixels[outStart + x - 4] : 0;
      const up = y > 0 ? pixels[outStart - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[outStart - stride + x - 4] : 0;
      let recon = val;
      if (filter === 1) recon = (val + left) & 0xff;
      else if (filter === 2) recon = (val + up) & 0xff;
      else if (filter === 3) recon = (val + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) recon = (val + paeth(left, up, upLeft)) & 0xff;
      pixels[outStart + x] = recon;
    }
  }
  return { ...info, pixels };
}

function diskFromUrl(url) {
  assert.ok(typeof url === 'string' && url.startsWith(`${MK_STATIC_ROOT}/`), `Bad asset URL: ${url}`);
  return path.join(DB_ROOT, url.slice(MK_STATIC_ROOT.length + 1));
}

let manifest;

describe('Mighty Knight 2.5D Pixel — 10..15 Frame Gate & Asset Integrity', () => {
  before(() => {
    assert.ok(fs.existsSync(MANIFEST_PATH), `Missing manifest: ${MANIFEST_PATH}`);
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  });

  it('manifest header declares 2.5d-pixel style, 640x360 virtual resolution & 10..15 frameBudget', () => {
    assert.equal(manifest.version, 2);
    assert.equal(manifest.style, '2.5d-pixel');
    assert.equal(manifest.staticRoot, MK_STATIC_ROOT);
    assert.deepEqual(manifest.virtualResolution, { w: 640, h: 360 });
    assert.deepEqual(manifest.frameBudget, { min: MK_MIN_CHAR_FRAMES, max: MK_MAX_CHAR_FRAMES });
  });

  it('HARD GATE: 100% of Heroes (6), Enemies (8) and Bosses (4) have strictly 10 <= frames <= 15, exact strip size, and binary 0/255 alpha', () => {
    const allIds = [...MK_HERO_IDS, ...MK_ENEMY_IDS, ...MK_BOSS_IDS];
    assert.equal(allIds.length, 18);

    for (const id of allIds) {
      const spec = MK_PIXEL_ATLAS_SPECS[id];
      assert.ok(spec, `Missing atlas spec for ${id}`);
      assert.ok(
        spec.frameCount >= MK_MIN_CHAR_FRAMES && spec.frameCount <= MK_MAX_CHAR_FRAMES,
        `Character ${id} frameCount=${spec.frameCount} outside 10..15`,
      );

      const group = spec.category === 'hero' ? 'heroes' : spec.category === 'boss' ? 'bosses' : 'enemies';
      const entry = manifest.characters[group][id];
      assert.ok(entry, `Missing manifest entry for ${group}.${id}`);
      assert.equal(entry.frames, spec.frameCount);
      assert.equal(entry.cellW, spec.cellW);
      assert.equal(entry.cellH, spec.cellH);

      const filePath = diskFromUrl(entry.path);
      const { width, height, pixels } = decodeRgbaPixels(filePath);
      assert.equal(width, spec.cellW * spec.frameCount, `${id} width mismatch`);
      assert.equal(height, spec.cellH, `${id} height mismatch`);

      // Verify binary alpha (0 or 255) — zero blurry anti-aliased edges!
      let opaqueCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        const a = pixels[i];
        assert.ok(a === 0 || a === 255, `${id} has semi-transparent pixel alpha=${a} (violates crisp pixel gate)`);
        if (a === 255) opaqueCount++;
      }
      assert.ok(opaqueCount > 200, `${id} strip appears nearly empty`);

      // Verify every individual frame cell has visible pixels
      for (let f = 0; f < spec.frameCount; f++) {
        let frameOpaque = 0;
        for (let y = 0; y < spec.cellH; y++) {
          for (let x = f * spec.cellW; x < (f + 1) * spec.cellW; x++) {
            if (pixels[(y * width + x) * 4 + 3] === 255) frameOpaque++;
          }
        }
        assert.ok(frameOpaque >= 16, `${id} frame ${f} is blank (${frameOpaque} px)`);
      }
    }
  });

  it('100% of Choreo timelines reference valid frame indices within 0 .. frameCount-1', () => {
    for (const heroId of MK_HERO_IDS) {
      const timelines = MK_HERO_CHOREO[heroId];
      assert.ok(timelines, `Missing choreo for ${heroId}`);
      for (const [actionId, tl] of Object.entries(timelines)) {
        assert.ok(tl.steps.length > 0, `Empty timeline ${heroId}.${actionId}`);
        for (const step of tl.steps) {
          assert.ok(
            Number.isInteger(step.frame) && step.frame >= 0 && step.frame < MK_HERO_MASTER_FRAMES,
            `Invalid hero frame ${heroId}.${actionId}: ${step.frame}`,
          );
          assert.ok(step.durationMs > 0);
        }
      }
    }
    for (const enemyId of [...MK_ENEMY_IDS, ...MK_BOSS_IDS]) {
      const spec = MK_ENEMIES[enemyId];
      const map = spec.isBoss ? MK_BOSS_CHOREO : spec.frameCount >= 12 ? MK_ELITE_ENEMY_CHOREO : MK_REGULAR_ENEMY_CHOREO;
      for (const [actionId, tl] of Object.entries(map)) {
        for (const step of tl.steps) {
          assert.ok(
            Number.isInteger(step.frame) && step.frame >= 0 && step.frame < spec.frameCount,
            `Invalid enemy frame ${enemyId}.${actionId}: ${step.frame} >= ${spec.frameCount}`,
          );
        }
      }
    }
  });

  it('all 6 hero portraits (32x32), 18 modular pixel VFX strips, 4 biomes x 5 parallax layers & UI icons exist with exact dimensions', () => {
    for (const heroId of MK_HERO_IDS) {
      const entry = manifest.characters.heroes[heroId];
      const p = readPng(diskFromUrl(entry.portrait));
      assert.equal(p.width, 32);
      assert.equal(p.height, 32);
    }

    for (const [key, cw, ch, frames] of EXPECTED_VFX) {
      const entry = manifest.vfx[key];
      assert.ok(entry, `Missing VFX manifest entry: ${key}`);
      const p = readPng(diskFromUrl(entry.path));
      assert.equal(p.width, cw * frames, `VFX ${key} width`);
      assert.equal(p.height, ch, `VFX ${key} height`);
    }

    for (const biome of MK_BIOMES) {
      const bEntry = manifest.biomes[biome];
      assert.ok(bEntry, `Missing biome ${biome}`);
      for (const [layer, [w, h]] of Object.entries(EXPECTED_TERRAIN_LAYERS)) {
        const p = readPng(diskFromUrl(bEntry[layer]));
        assert.equal(p.width, w, `Biome ${biome}.${layer} width`);
        assert.equal(p.height, h, `Biome ${biome}.${layer} height`);
      }
    }

    for (const relicId of MK_RELIC_IDS) {
      const url = manifest.ui.relicIcons[`relic_${relicId}`];
      assert.ok(url, `Missing relic icon for ${relicId}`);
      const p = readPng(diskFromUrl(url));
      assert.equal(p.width, 24);
      assert.equal(p.height, 24);
    }
  });

  it('validates 16-bit WAV headers for all manifest BGM and SFX tracks (when audio pack is built)', () => {
    const bgms = Object.entries(manifest.audio?.bgm ?? {});
    const sfxs = Object.entries(manifest.audio?.sfx ?? {});
    for (const [name, url] of [...bgms, ...sfxs]) {
      const fp = diskFromUrl(url);
      assert.ok(fs.existsSync(fp), `Missing audio file ${name}: ${fp}`);
      const buf = fs.readFileSync(fp);
      assert.ok(buf.length >= 44, `Truncated WAV: ${fp}`);
      assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(buf.subarray(8, 12).toString('ascii'), 'WAVE');
      assert.equal(buf.readUInt16LE(20), 1, `Expected PCM WAV: ${fp}`);
      assert.equal(buf.readUInt32LE(24), 44100, `Expected 44.1kHz WAV: ${fp}`);
      assert.equal(buf.readUInt16LE(34), 16, `Expected 16-bit WAV: ${fp}`);
    }
  });
});
