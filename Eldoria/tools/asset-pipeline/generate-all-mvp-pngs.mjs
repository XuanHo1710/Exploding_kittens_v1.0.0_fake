#!/usr/bin/env node
/**
 * Master Offline Deterministic PNG Pixel Art & Atlas Build Orchestrator (T011)
 * Generates all MVP 4-direction hero PNGs, 16x16 animated VFX PNGs, monsters, Boss Thornback,
 * animals, crops, buildings, extruded 32x32 tilesets, and Tiled .tmj maps under assets/v1/,
 * then writes assets/v1/manifest.json & assets/v1/animation-clips.json matching data-model.md.
 */
import path from 'node:path';
import { generateAllHeroPngs } from './generate-hero-pngs.mjs';
import { generateAllVfxPngs } from './generate-vfx-16x16-pngs.mjs';
import { generateAllWorldAndBossPngs } from './generate-world-boss-pngs.mjs';
import { writeFileWithMeta } from './png-encoder.mjs';

const ROOT = process.cwd();
const ASSETS_V1_DIR = path.join(ROOT, 'assets', 'v1');

console.log('[assets:generate] Generating crisp 16-bit RGBA32 PNG pixel atlases (Q1-A standard)...');

const heroRes = generateAllHeroPngs(ASSETS_V1_DIR);
const vfxRes = generateAllVfxPngs(ASSETS_V1_DIR);
const worldRes = generateAllWorldAndBossPngs(ASSETS_V1_DIR);

const allClips = [...heroRes.clips, ...vfxRes.clips, ...worldRes.clips];
const clipsRel = 'animation-clips.json';
const clipsMeta = writeFileWithMeta(
  path.join(ASSETS_V1_DIR, clipsRel),
  Buffer.from(JSON.stringify({ schemaVersion: '1.0.0', clips: allClips }, null, 2), 'utf8'),
);

const allEntries = [
  ...heroRes.entries,
  ...vfxRes.entries,
  ...worldRes.entries,
  {
    assetKey: 'animation_clips_registry',
    objectKey: `v1/${clipsRel}`,
    kind: 'ATLAS_JSON',
    loadingGroup: 'core_ui',
    sha256: clipsMeta.sha256,
    sizeBytes: clipsMeta.sizeBytes,
  },
];

const manifest = {
  manifestVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  pixelStandard: {
    baseTilePx: 32,
    heroFramePx: [48, 64],
    vfxMicroFramePx: [16, 16],
    viewportPx: [640, 360],
    paddingPx: 2,
    extrudePx: 1,
  },
  entries: allEntries,
};

const manifestMeta = writeFileWithMeta(
  path.join(ASSETS_V1_DIR, 'manifest.json'),
  Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
);

console.log(
  JSON.stringify(
    {
      status: 'GENERATED',
      assetsDir: 'assets/v1',
      totalManifestEntries: allEntries.length,
      totalAnimationClips: allClips.length,
      manifestSha256: manifestMeta.sha256,
      manifestBytes: manifestMeta.sizeBytes,
    },
    null,
    2,
  ),
);
