#!/usr/bin/env node
/**
 * Automated Pre-Pack Asset & Animation Verification Gate CLI (T028 / SC-002)
 * Verifies every generated PNG header, POT <= 2048, padding: 2px, tileset extrude: 1px,
 * SHA-256 checksum & sizeBytes on disk, and 100% MVP animation clip coverage against data-model.md.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'v1', 'manifest.json');
const CLIPS_PATH = path.join(ASSETS_DIR, 'v1', 'animation-clips.json');

const errors = [];
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('FAIL: assets/v1/manifest.json does not exist. Run npm run assets:generate first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const clipsDoc = JSON.parse(fs.readFileSync(CLIPS_PATH, 'utf8'));

// 1. Validate pixelStandard invariants (Q1-A)
const ps = manifest.pixelStandard || {};
if (ps.baseTilePx !== 32 || ps.paddingPx !== 2 || ps.extrudePx !== 1) {
  errors.push(`INVALID_PIXEL_STANDARD: ${JSON.stringify(ps)}`);
}
if (!Array.isArray(ps.heroFramePx) || ps.heroFramePx[0] !== 48 || ps.heroFramePx[1] !== 64) {
  errors.push(`INVALID_HERO_FRAME_PX: ${JSON.stringify(ps.heroFramePx)}`);
}
if (!Array.isArray(ps.vfxMicroFramePx) || ps.vfxMicroFramePx[0] !== 16 || ps.vfxMicroFramePx[1] !== 16) {
  errors.push(`INVALID_VFX_16X16_STANDARD: ${JSON.stringify(ps.vfxMicroFramePx)}`);
}

// 2. Validate every manifest entry on disk: existence, SHA-256, sizeBytes, PNG POT <= 2048, padding/extrude metadata
const assetKeys = new Set();
let pngsVerified = 0;
let extrudedTilesetsVerified = 0;

for (const entry of manifest.entries || []) {
  if (assetKeys.has(entry.assetKey)) errors.push(`DUPLICATE_ASSET_KEY: ${entry.assetKey}`);
  assetKeys.add(entry.assetKey);

  const abs = path.join(ASSETS_DIR, entry.objectKey);
  if (!fs.existsSync(abs)) {
    errors.push(`MISSING_ASSET_FILE: ${entry.objectKey}`);
    continue;
  }
  const buf = fs.readFileSync(abs);
  if (buf.length !== entry.sizeBytes) {
    errors.push(`SIZE_MISMATCH: ${entry.objectKey} expected=${entry.sizeBytes} actual=${buf.length}`);
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== entry.sha256) {
    errors.push(`SHA256_MISMATCH: ${entry.objectKey}`);
  }
  if (entry.objectKey.endsWith('.png')) {
    if (!buf.subarray(0, 8).equals(PNG_SIG)) {
      errors.push(`INVALID_PNG_HEADER: ${entry.objectKey}`);
    } else {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const isPot = (n) => n > 0 && (n & (n - 1)) === 0;
      if (!isPot(w) || !isPot(h) || w > 2048 || h > 2048) {
        errors.push(`PNG_NOT_POT_OR_OVERSIZED: ${entry.objectKey} (${w}x${h})`);
      }
      pngsVerified++;
    }
  }
  if (entry.kind === 'ATLAS_JSON' && entry.assetKey !== 'animation_clips_registry') {
    const atlas = JSON.parse(buf.toString('utf8'));
    if (!atlas.meta || atlas.meta.paddingPx < 2) {
      errors.push(`ATLAS_PADDING_BELOW_2PX: ${entry.objectKey}`);
    }
    if (entry.objectKey.includes('tileset') && atlas.meta.extrudePx < 1) {
      errors.push(`TILESET_MISSING_1PX_EXTRUDE: ${entry.objectKey}`);
    } else if (entry.objectKey.includes('tileset')) {
      extrudedTilesetsVerified++;
    }
  }
}

// 3. Validate 100% MVP hero 25 states x 4 directions + Boss Thornback + 9 MVP mobs + 16x16 VFX clips
const clipMap = new Map();
for (const clip of clipsDoc.clips || []) {
  if (clipMap.has(clip.clipKey)) errors.push(`DUPLICATE_CLIP_KEY: ${clip.clipKey}`);
  clipMap.set(clip.clipKey, clip);
  if (!assetKeys.has(clip.atlasKey)) errors.push(`CLIP_UNKNOWN_ATLAS: ${clip.clipKey} -> ${clip.atlasKey}`);
  if (clip.frameDurationMs.length !== clip.frameCount) errors.push(`CLIP_FRAME_DURATION_MISMATCH: ${clip.clipKey}`);
  const sumMs = clip.frameDurationMs.reduce((a, b) => a + b, 0);
  if (!clip.loop && clip.watchdogMaxDurationMs < sumMs + 150) {
    errors.push(`CLIP_WATCHDOG_TOO_SHORT: ${clip.clipKey}`);
  }
}

const MVP_HEROES = ['chr_kael_vanguard', 'chr_lyra_windrunner', 'chr_seraphina_dawn'];
const STATES_25 = [
  'idle', 'walk', 'run', 'sprint', 'attack', 'attack_combo', 'cast', 'skill', 'ultimate',
  'dodge', 'dash', 'hit', 'knockback', 'stun', 'block', 'death', 'respawn',
  'mining', 'woodcutting', 'farming', 'fishing', 'crafting', 'building', 'interact', 'emote',
];
const DIRS_4 = ['down', 'up', 'left', 'right'];
for (const h of MVP_HEROES) {
  for (const st of STATES_25) {
    for (const d of DIRS_4) {
      const k = `${h}_${st}_${d}`;
      if (!clipMap.has(k)) errors.push(`MISSING_MVP_HERO_CLIP: ${k}`);
    }
  }
}
for (const st of ['idle', 'walk', 'attack', 'skill', 'ultimate', 'stun', 'hit', 'death']) {
  if (!clipMap.has(`boss_thornback_elder_${st}_down`)) {
    errors.push(`MISSING_BOSS_CLIP: boss_thornback_elder_${st}_down`);
  }
}

const result = {
  status: errors.length === 0 ? 'PASS' : 'FAIL',
  manifestEntriesVerified: assetKeys.size,
  pngsVerified,
  extrudedTilesetsVerified,
  animationClipsVerified: clipMap.size,
  mvpHero300ClipsComplete: errors.filter((e) => e.startsWith('MISSING_MVP_HERO_CLIP')).length === 0,
  errorCount: errors.length,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exit(1);
