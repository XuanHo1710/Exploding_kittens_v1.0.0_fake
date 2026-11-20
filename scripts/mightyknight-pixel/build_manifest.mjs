#!/usr/bin/env node
/**
 * Mighty Knight 2.5D Pixel — Manifest Builder & Hard 10..15 Frame-Budget Gate.
 *
 * Inspects every PNG & WAV under `database-mighty-knight-pixel/`, rejects any
 * character violating `10 <= frames <= 15` or exact strip dimensions, and emits
 * `database-mighty-knight-pixel/manifest.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DB_ROOT = path.join(REPO_ROOT, 'database-mighty-knight-pixel');
const STATIC_ROOT = '/database-mighty-knight-pixel';

const MIN_FRAMES = 10;
const MAX_FRAMES = 15;

const HEROES = [
  ['knight', '#3b82f6'],
  ['archer', '#22c55e'],
  ['rogue', '#eab308'],
  ['barbarian', '#ef4444'],
  ['mage', '#a855f7'],
  ['lancer', '#06b6d4'],
];

const ENEMIES = [
  ['skull_imp', 11, '#a855f7'],
  ['goblin_raider', 11, '#4ade80'],
  ['shield_orc', 11, '#94a3b8'],
  ['bone_brute', 11, '#e2e8f0'],
  ['tribal_shaman', 12, '#f43f5e'],
  ['frost_archer', 12, '#38bdf8'],
  ['bomber_imp', 11, '#f97316'],
  ['nether_ghost', 11, '#fde047'],
];

const BOSSES = [
  ['boss_elder_shaman', 15, '#ef4444'],
  ['boss_war_chieftain', 15, '#f59e0b'],
  ['boss_lava_golem', 15, '#f97316'],
  ['boss_abyss_lord', 15, '#c084fc'],
];

const VFX_SPECS = [
  ['slash_crescent', 64, 48, 4, 32, 24, 18],
  ['slash_cross_x', 64, 64, 5, 32, 32, 18],
  ['whirlwind_360', 96, 64, 6, 48, 34, 18],
  ['holy_pillar', 64, 128, 6, 32, 116, 16],
  ['ground_fissure', 96, 48, 5, 48, 28, 14],
  ['fire_meteor', 48, 64, 6, 24, 46, 15],
  ['lightning_bolt', 48, 128, 5, 24, 120, 18],
  ['frost_nova', 96, 64, 5, 48, 36, 15],
  ['gravity_vortex', 96, 64, 6, 48, 34, 14],
  ['dragon_spirit', 96, 48, 6, 48, 24, 16],
  ['phoenix_flame', 96, 64, 6, 48, 32, 16],
  ['magic_rune_25d', 80, 40, 4, 40, 20, 12],
  ['parry_ring', 64, 64, 4, 32, 32, 18],
  ['aura_fury', 48, 56, 4, 24, 48, 12],
  ['hit_spark', 32, 32, 4, 16, 16, 20],
  ['dust_puff', 32, 24, 4, 16, 18, 14],
  ['projectiles_sheet', 32, 24, 12, 16, 12, 12],
  ['pickups_sheet', 16, 16, 10, 8, 13, 10],
];

const BIOMES = ['grasslands', 'jungle', 'volcano', 'citadel'];
const LAYERS = ['bg_sky', 'bg_far', 'bg_mid', 'ground_arena', 'fg_silhouette'];

function readPngDims(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`Invalid PNG: ${filePath}`);
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function assertFrameBudget(label, frames, w, h, cellW, cellH) {
  if (frames < MIN_FRAMES || frames > MAX_FRAMES) {
    throw new Error(`[FRAME GATE FAILED] ${label}: frames=${frames} outside ${MIN_FRAMES}..${MAX_FRAMES}`);
  }
  if (w !== cellW * frames || h !== cellH) {
    throw new Error(`[DIM GATE FAILED] ${label}: got ${w}x${h}, expected ${cellW * frames}x${cellH}`);
  }
}

const manifest = {
  version: 2,
  style: '2.5d-pixel',
  staticRoot: STATIC_ROOT,
  virtualResolution: { w: 640, h: 360 },
  frameBudget: { min: MIN_FRAMES, max: MAX_FRAMES },
  characters: { heroes: {}, enemies: {}, bosses: {} },
  vfx: {},
  biomes: {},
  ui: { skillIcons: {}, relicIcons: {}, hudIcons: {} },
  audio: { bgm: {}, sfx: {} },
};

for (const [id, accentColor] of HEROES) {
  const rel = `sprites/heroes/${id}.png`;
  const { w, h } = readPngDims(path.join(DB_ROOT, rel));
  const frames = Math.round(w / 48);
  assertFrameBudget(`hero:${id}`, frames, w, h, 48, 48);
  const pRel = `portraits/${id}.png`;
  const pd = readPngDims(path.join(DB_ROOT, pRel));
  if (pd.w !== 32 || pd.h !== 32) throw new Error(`Portrait ${id} must be 32x32`);
  manifest.characters.heroes[id] = {
    path: `${STATIC_ROOT}/${rel}`,
    portrait: `${STATIC_ROOT}/${pRel}`,
    frames,
    cellW: 48,
    cellH: 48,
    anchorX: 24,
    anchorY: 44,
    accentColor,
  };
}

for (const [id, expectedFrames, accentColor] of ENEMIES) {
  const rel = `sprites/enemies/${id}.png`;
  const { w, h } = readPngDims(path.join(DB_ROOT, rel));
  const frames = Math.round(w / 48);
  assertFrameBudget(`enemy:${id}`, frames, w, h, 48, 48);
  if (frames !== expectedFrames) throw new Error(`Enemy ${id} expected ${expectedFrames} frames, got ${frames}`);
  manifest.characters.enemies[id] = {
    path: `${STATIC_ROOT}/${rel}`,
    frames,
    cellW: 48,
    cellH: 48,
    anchorX: 24,
    anchorY: 44,
    accentColor,
  };
}

for (const [id, expectedFrames, accentColor] of BOSSES) {
  const rel = `sprites/bosses/${id}.png`;
  const { w, h } = readPngDims(path.join(DB_ROOT, rel));
  const frames = Math.round(w / 80);
  assertFrameBudget(`boss:${id}`, frames, w, h, 80, 80);
  if (frames !== expectedFrames) throw new Error(`Boss ${id} expected ${expectedFrames} frames, got ${frames}`);
  manifest.characters.bosses[id] = {
    path: `${STATIC_ROOT}/${rel}`,
    frames,
    cellW: 80,
    cellH: 80,
    anchorX: 40,
    anchorY: 74,
    accentColor,
  };
}

for (const [key, cellW, cellH, frames, anchorX, anchorY, fps] of VFX_SPECS) {
  const rel = `vfx/${key}.png`;
  const { w, h } = readPngDims(path.join(DB_ROOT, rel));
  if (w !== cellW * frames || h !== cellH) {
    throw new Error(`VFX ${key}: got ${w}x${h}, expected ${cellW * frames}x${cellH}`);
  }
  manifest.vfx[key] = {
    path: `${STATIC_ROOT}/${rel}`,
    frames,
    cellW,
    cellH,
    anchorX,
    anchorY,
    fps,
  };
}

for (const biome of BIOMES) {
  manifest.biomes[biome] = {};
  for (const layer of LAYERS) {
    const rel = `terrains/${biome}/${layer}.png`;
    readPngDims(path.join(DB_ROOT, rel));
    manifest.biomes[biome][layer] = `${STATIC_ROOT}/${rel}`;
  }
}

const uiDir = path.join(DB_ROOT, 'ui');
for (const file of fs.readdirSync(uiDir).sort()) {
  if (!file.endsWith('.png')) continue;
  const key = file.slice(0, -4);
  const url = `${STATIC_ROOT}/ui/${file}`;
  if (key.startsWith('skill_') || key.startsWith('ult_')) manifest.ui.skillIcons[key] = url;
  else if (key.startsWith('relic_')) manifest.ui.relicIcons[key] = url;
  else manifest.ui.hudIcons[key] = url;
}

for (const kind of ['bgm', 'sfx']) {
  const adir = path.join(DB_ROOT, 'audio', kind);
  if (!fs.existsSync(adir)) continue;
  for (const file of fs.readdirSync(adir).sort()) {
    if (!file.endsWith('.wav')) continue;
    manifest.audio[kind][file.slice(0, -4)] = `${STATIC_ROOT}/audio/${kind}/${file}`;
  }
}

const outPath = path.join(DB_ROOT, 'manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(
  `[OK] Wrote ${outPath} (18 characters verified strictly 10..15f, ${Object.keys(manifest.vfx).length} VFX, ${BIOMES.length} biomes, ${Object.keys(manifest.audio.bgm).length} BGM, ${Object.keys(manifest.audio.sfx).length} SFX)`,
);
