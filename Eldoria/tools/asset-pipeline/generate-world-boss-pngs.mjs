/**
 * Offline Deterministic PNG Sprite-Sheet Generator for:
 *  - Wave 1 MVP Monsters (8 regular + 1 elite = 9 mobs)
 *  - MVP Dungeon Boss: boss_thornback_elder (128x128, 3 phases + stagger)
 *  - 2 MVP Farm Animals (anm_meadow_chicken, anm_clover_cow)
 *  - 5 MVP Crops (growth stages) & 6 MVP Homestead Buildings (Lv1..Lv4)
 *  - Extruded 32x32 Tilesets (extrude: 1px, padding: 2px) & Shared Tiled .tmj Maps
 *    for reg_greenhaven_village, reg_whispering_forest, dng_mossroot_hollow
 */
import path from 'node:path';
import { PixelBuffer, packPhaserAtlas, writeFileWithMeta } from './png-encoder.mjs';

const MVP_MOBS = [
  { id: 'mob_moss_slime',          shape: 'slime',  c1: '#4ade80', c2: '#166534', hi: '#dcfce7', eye: '#14111b' },
  { id: 'mob_forest_goblin',       shape: 'goblin', c1: '#65a30d', c2: '#3f6212', hi: '#bef264', eye: '#ef4444' },
  { id: 'mob_timber_wolf',         shape: 'wolf',   c1: '#94a3b8', c2: '#475569', hi: '#e2e8f0', eye: '#facc15' },
  { id: 'mob_spore_cap',           shape: 'shroom', c1: '#a855f7', c2: '#581c87', hi: '#e9d5ff', eye: '#fde047' },
  { id: 'mob_briar_boar',          shape: 'wolf',   c1: '#78350f', c2: '#451a03', hi: '#b45309', eye: '#ff3b3b' },
  { id: 'mob_hollow_bat',          shape: 'bat',    c1: '#6366f1', c2: '#312e81', hi: '#c7d2fe', eye: '#fb7185' },
  { id: 'mob_root_crawler',        shape: 'slime',  c1: '#854d0e', c2: '#422006', hi: '#84cc16', eye: '#facc15' },
  { id: 'mob_goblin_shaman',       shape: 'goblin', c1: '#15803d', c2: '#14532d', hi: '#38bdf8', eye: '#fde047' },
  { id: 'mob_elite_alpha_direwolf',shape: 'elite',  c1: '#cbd5e1', c2: '#334155', hi: '#f8fafc', eye: '#ff3b3b' },
];

const MOB_STATES = [
  { state: 'idle',   frames: 2, ms: 260, loop: true,  priority: 1 },
  { state: 'walk',   frames: 4, ms: 130, loop: true,  priority: 2 },
  { state: 'attack', frames: 4, ms: 90,  loop: false, priority: 6 },
  { state: 'hit',    frames: 2, ms: 75,  loop: false, priority: 10 },
  { state: 'death',  frames: 3, ms: 140, loop: false, priority: 11 },
];

function drawMobFrame(mob, state, fIdx) {
  const size = mob.shape === 'elite' ? 48 : 32;
  const b = new PixelBuffer(size, size);
  const cx = Math.floor(size / 2);
  const footY = Math.round(size * 0.85);
  const flash = state === 'hit' && fIdx === 0;
  const col = (hex) => (flash ? '#ffffff' : hex);
  const hop = state === 'walk' || state === 'attack' ? (fIdx % 2 === 1 ? -3 : 0) : 0;

  b.ellipse(cx, footY, Math.floor(size * 0.3), 3, '#141024', 120);
  if (state === 'death' && fIdx >= 2) {
    b.outlineRect(cx - 10, footY - 5, 20, 6, col(mob.c2), '#14111b');
    return b;
  }

  if (mob.shape === 'slime') {
    const sq = fIdx % 2 === 0 ? 0 : 2;
    b.outlineRect(cx - 10 - sq, footY - 14 + sq + hop, 20 + sq * 2, 14 - sq, col(mob.c1), '#14111b');
    b.rect(cx - 7, footY - 11 + sq + hop, 5, 3, col(mob.hi));
    b.rect(cx - 5, footY - 8 + hop, 2, 2, mob.eye);
    b.rect(cx + 3, footY - 8 + hop, 2, 2, mob.eye);
  } else if (mob.shape === 'goblin') {
    b.outlineRect(cx - 6, footY - 22 + hop, 12, 10, col(mob.c1), '#14111b');
    b.rect(cx - 9, footY - 19 + hop, 3, 3, col(mob.c1)); // pointy ears
    b.rect(cx + 6, footY - 19 + hop, 3, 3, col(mob.c1));
    b.outlineRect(cx - 6, footY - 12 + hop, 12, 11, col(mob.c2), '#14111b');
    b.rect(cx - 4, footY - 18 + hop, 2, 2, mob.eye);
    b.rect(cx + 2, footY - 18 + hop, 2, 2, mob.eye);
    if (state === 'attack' && fIdx >= 1) b.rect(cx + 6, footY - 14, 7, 3, '#cbd5e1');
  } else if (mob.shape === 'shroom') {
    b.outlineRect(cx - 5, footY - 12 + hop, 10, 12, '#f5f0dc', '#14111b');
    b.outlineRect(cx - 11, footY - 22 + hop, 22, 12, col(mob.c1), '#14111b');
    b.rect(cx - 6, footY - 19 + hop, 3, 3, col(mob.hi));
    b.rect(cx + 3, footY - 18 + hop, 3, 3, col(mob.hi));
    b.rect(cx - 3, footY - 9 + hop, 2, 2, mob.eye);
    b.rect(cx + 1, footY - 9 + hop, 2, 2, mob.eye);
  } else if (mob.shape === 'bat') {
    const wingY = fIdx % 2 === 0 ? -4 : 3;
    b.outlineRect(cx - 5, footY - 18 + hop, 10, 10, col(mob.c1), '#14111b');
    b.rect(cx - 13, footY - 16 + wingY, 8, 5, col(mob.c2));
    b.rect(cx + 5, footY - 16 + wingY, 8, 5, col(mob.c2));
    b.rect(cx - 3, footY - 14 + hop, 2, 2, mob.eye);
    b.rect(cx + 1, footY - 14 + hop, 2, 2, mob.eye);
  } else {
    // wolf / boar / elite direwolf
    const w = mob.shape === 'elite' ? 28 : 18;
    const h = mob.shape === 'elite' ? 18 : 12;
    b.outlineRect(cx - Math.floor(w / 2), footY - h - 4 + hop, w, h, col(mob.c1), '#14111b');
    b.rect(cx - Math.floor(w / 2) + 2, footY - h - 2 + hop, Math.floor(w * 0.6), 4, col(mob.hi));
    b.rect(cx - Math.floor(w / 2) + 2, footY - 5, 4, 6, col(mob.c2));
    b.rect(cx + Math.floor(w / 2) - 6, footY - 5, 4, 6, col(mob.c2));
    b.rect(cx - 4, footY - h + hop, 3, 2, mob.eye);
    b.rect(cx + 2, footY - h + hop, 3, 2, mob.eye);
    if (mob.shape === 'elite') b.ring(cx, footY, 18, 17, '#f59e0b', 180);
  }
  return b;
}

function drawBossThornbackFrame(state, fIdx) {
  const b = new PixelBuffer(128, 128);
  const flash = state === 'hit' && fIdx === 0;
  const col = (hex) => (flash ? '#ffffff' : hex);
  const sway = fIdx % 2 === 0 ? 0 : -2;
  const slam = (state === 'attack' || state === 'skill' || state === 'ultimate') ? (fIdx >= 3 ? 10 : -8) : 0;

  b.ellipse(64, 108, 44, 10, '#141024', 135);
  if (state === 'death' && fIdx >= 3) {
    b.outlineRect(22, 86, 84, 24, '#3e2723', '#14111b');
    b.rect(32, 82, 64, 10, '#2e7d32');
    return b;
  }

  // Massive ancient oak trunk
  b.outlineRect(32, 34 + sway, 64, 72, col('#5c4033'), '#14111b');
  b.rect(36, 38 + sway, 18, 62, col('#3e2723'));
  b.rect(74, 38 + sway, 16, 62, col('#6d4c3d'));

  // Thorned mossy canopy crown
  b.outlineRect(18, 14 + sway, 92, 28, col('#2e7d32'), '#14111b');
  b.rect(24, 18 + sway, 76, 12, col('#4caf50'));
  // Crown horns/briars
  b.outlineRect(24, 6 + sway, 10, 14, col('#4e342e'), '#14111b');
  b.outlineRect(94, 6 + sway, 10, 14, col('#4e342e'), '#14111b');

  // Glowing Heartwood Sap Core (shifts amber -> crimson on ultimate/phase 3)
  const coreCol = state === 'ultimate' ? '#ff3b3b' : state === 'stun' ? '#38bdf8' : '#f59e0b';
  b.outlineRect(54, 58 + sway, 20, 24, coreCol, '#14111b');
  b.rect(59, 63 + sway, 10, 14, '#fff7cc');

  // Boss Eyes
  const eyeCol = state === 'stun' ? '#facc15' : '#ff3b3b';
  b.rect(44, 46 + sway, 10, 6, eyeCol);
  b.rect(74, 46 + sway, 10, 6, eyeCol);
  if (state === 'stun') {
    b.rect(50 + (fIdx * 10) % 28, 10, 5, 5, '#facc15');
    b.rect(78 - (fIdx * 10) % 28, 12, 5, 5, '#ffffff');
  }

  // Huge Root Fists
  b.outlineRect(8, 52 + slam, 26, 34, col('#5c4033'), '#14111b');
  b.rect(12, 56 + slam, 14, 10, col('#2e7d32'));
  b.outlineRect(94, 52 + slam, 26, 34, col('#5c4033'), '#14111b');
  b.rect(100, 56 + slam, 14, 10, col('#2e7d32'));
  return b;
}

function drawWorldPropsAndLifeSim() {
  const frames = [];

  // Animals (32x32)
  const animals = [
    { id: 'anm_meadow_chicken', body: '#f8fafc', acc: '#ef4444', beak: '#f59e0b', w: 12, h: 10 },
    { id: 'anm_clover_cow',     body: '#f8fafc', acc: '#334155', beak: '#fca5a5', w: 20, h: 14 },
  ];
  for (const a of animals) {
    for (const st of ['idle', 'walk']) {
      for (let f = 0; f < 2; f++) {
        const b = new PixelBuffer(32, 32);
        const hop = st === 'walk' && f === 1 ? -2 : 0;
        b.ellipse(16, 27, Math.floor(a.w / 2), 3, '#141024', 110);
        b.outlineRect(16 - Math.floor(a.w / 2), 25 - a.h + hop, a.w, a.h, a.body, '#14111b');
        b.rect(14, 25 - a.h + 2 + hop, 5, 4, a.acc);
        b.rect(16 + Math.floor(a.w / 2) - 2, 25 - a.h + 4 + hop, 4, 3, a.beak);
        frames.push({ name: `${a.id}_${st}_down_${f}`, buf: b, pivot: { x: 0.5, y: 0.85 } });
      }
    }
  }

  // 5 MVP Crops (32x32, stages 0..3)
  const crops = [
    { id: 'crp_sunwheat',      c: '#facc15' },
    { id: 'crp_berry_bush',    c: '#ef4444' },
    { id: 'crp_moon_herb',     c: '#38bdf8' },
    { id: 'crp_golden_carrot', c: '#fb923c' },
    { id: 'crp_ember_pepper',  c: '#f97316' },
  ];
  for (const cr of crops) {
    for (let st = 0; st < 4; st++) {
      const b = new PixelBuffer(32, 32);
      b.outlineRect(3, 18, 26, 12, '#6b4423', '#3b2412'); // tilled soil
      const h = 4 + st * 5;
      b.outlineRect(13, 24 - h, 6, h, '#22c55e', '#14111b');
      if (st >= 2) b.rect(9, 24 - h + 2, 14, 4, '#4ade80');
      if (st === 3) {
        b.circle(12, 22 - h + 3, 3, cr.c);
        b.circle(20, 22 - h + 4, 3, cr.c);
        b.rect(15, 19 - h, 2, 2, '#ffffff');
      }
      frames.push({ name: `${cr.id}_stage_${st}`, buf: b, pivot: { x: 0.5, y: 0.9 } });
    }
  }

  // 6 MVP Buildings (64x64)
  const buildings = [
    { id: 'bld_player_house', roof: '#b91c1c', wall: '#d6b286', trim: '#78350f' },
    { id: 'bld_storage',      roof: '#92400e', wall: '#b08968', trim: '#451a03' },
    { id: 'bld_farm_plot',    roof: '#3f6212', wall: '#78350f', trim: '#4d7c0f' },
    { id: 'bld_chicken_coop', roof: '#d97706', wall: '#e7cba9', trim: '#78350f' },
    { id: 'bld_blacksmith',   roof: '#475569', wall: '#64748b', trim: '#ff6b1a' },
    { id: 'bld_kitchen',      roof: '#0f766e', wall: '#e2d4b7', trim: '#f59e0b' },
  ];
  for (const bl of buildings) {
    const b = new PixelBuffer(64, 64);
    b.ellipse(32, 58, 26, 5, '#141024', 120);
    b.outlineRect(8, 26, 48, 32, bl.wall, '#14111b');
    b.outlineRect(4, 10, 56, 20, bl.roof, '#14111b');
    b.rect(8, 13, 48, 5, bl.trim);
    b.outlineRect(26, 40, 12, 18, '#451a03', '#14111b'); // door
    b.outlineRect(13, 34, 9, 9, '#fef08a', '#14111b');  // lit window
    b.outlineRect(42, 34, 9, 9, '#fef08a', '#14111b');
    frames.push({ name: `${bl.id}_lv1`, buf: b, pivot: { x: 0.5, y: 0.9 } });
  }

  // World Props: Oak Tree (Trunk + Canopy separate for alpha 0.55 occlusion!), Stone Pillar, Ore Vein, Herb Node, Loot Chest
  const treeTrunk = new PixelBuffer(48, 64);
  treeTrunk.ellipse(24, 58, 14, 4, '#141024', 120);
  treeTrunk.outlineRect(17, 30, 14, 28, '#6d4c3d', '#14111b');
  treeTrunk.rect(19, 32, 4, 24, '#8c624d');
  frames.push({ name: 'prop_oak_trunk', buf: treeTrunk, pivot: { x: 0.5, y: 0.9 } });

  const treeCanopy = new PixelBuffer(64, 48);
  treeCanopy.outlineRect(8, 6, 48, 36, '#226836', '#14111b');
  treeCanopy.rect(12, 10, 40, 18, '#349449');
  treeCanopy.rect(18, 12, 20, 8, '#56b863');
  frames.push({ name: 'prop_oak_canopy', buf: treeCanopy, pivot: { x: 0.5, y: 0.9 } });

  const ore = new PixelBuffer(32, 32);
  ore.ellipse(16, 27, 11, 4, '#141024', 120);
  ore.outlineRect(6, 10, 20, 17, '#64748b', '#14111b');
  ore.rect(10, 13, 5, 5, '#38bdf8');
  ore.rect(18, 17, 4, 4, '#93c5fd');
  frames.push({ name: 'prop_ore_vein', buf: ore, pivot: { x: 0.5, y: 0.88 } });

  const pillar = new PixelBuffer(32, 64);
  pillar.ellipse(16, 58, 12, 4, '#141024', 120);
  pillar.outlineRect(6, 12, 20, 46, '#7c8599', '#14111b');
  pillar.rect(8, 14, 6, 42, '#9ca6ba');
  pillar.outlineRect(4, 8, 24, 8, '#cbd5e1', '#14111b');
  frames.push({ name: 'prop_moss_pillar', buf: pillar, pivot: { x: 0.5, y: 0.9 } });

  const chest = new PixelBuffer(32, 32);
  chest.ellipse(16, 27, 10, 3, '#141024', 120);
  chest.outlineRect(6, 12, 20, 14, '#92400e', '#14111b');
  chest.rect(7, 17, 18, 2, '#f5c451');
  chest.rect(14, 15, 4, 5, '#fde047');
  frames.push({ name: 'prop_loot_chest', buf: chest, pivot: { x: 0.5, y: 0.88 } });

  // Additional rich 16-bit village/forest/dungeon props
  const torchPost = new PixelBuffer(16, 32);
  torchPost.ellipse(8, 29, 5, 2, '#141024', 110);
  torchPost.outlineRect(6, 10, 4, 19, '#78350f', '#14111b');
  torchPost.outlineRect(5, 7, 6, 5, '#475569', '#14111b');
  frames.push({ name: 'prop_torch_post', buf: torchPost, pivot: { x: 0.5, y: 0.9 } });

  const portalArch = new PixelBuffer(64, 64);
  portalArch.ellipse(32, 58, 24, 5, '#141024', 130);
  portalArch.outlineRect(8, 14, 12, 44, '#64748b', '#14111b');
  portalArch.outlineRect(44, 14, 12, 44, '#64748b', '#14111b');
  portalArch.outlineRect(6, 6, 52, 12, '#94a3b8', '#14111b');
  portalArch.rect(20, 18, 24, 38, '#38bdf8', 135);
  portalArch.rect(25, 22, 14, 30, '#e0f2fe', 175);
  frames.push({ name: 'prop_portal_arch', buf: portalArch, pivot: { x: 0.5, y: 0.9 } });

  const flowerBed = new PixelBuffer(32, 32);
  flowerBed.rect(4, 16, 24, 10, '#226836');
  flowerBed.rect(7, 14, 4, 4, '#f43f5e');
  flowerBed.rect(14, 17, 4, 4, '#facc15');
  flowerBed.rect(21, 14, 4, 4, '#38bdf8');
  flowerBed.setPixel(8, 15, '#ffffff');
  flowerBed.setPixel(15, 18, '#ffffff');
  frames.push({ name: 'prop_flower_bed', buf: flowerBed, pivot: { x: 0.5, y: 0.85 } });

  const well = new PixelBuffer(48, 48);
  well.ellipse(24, 42, 18, 4, '#141024', 120);
  well.outlineRect(10, 24, 28, 18, '#64748b', '#14111b');
  well.rect(14, 26, 20, 6, '#1d6fa5');
  well.outlineRect(10, 8, 4, 18, '#78350f', '#14111b');
  well.outlineRect(34, 8, 4, 18, '#78350f', '#14111b');
  well.outlineRect(6, 4, 36, 10, '#b91c1c', '#14111b');
  frames.push({ name: 'prop_village_well', buf: well, pivot: { x: 0.5, y: 0.88 } });

  const signpost = new PixelBuffer(32, 32);
  signpost.ellipse(16, 28, 7, 2, '#141024', 110);
  signpost.outlineRect(14, 12, 4, 16, '#78350f', '#14111b');
  signpost.outlineRect(5, 6, 22, 10, '#c49a6c', '#14111b');
  signpost.rect(8, 9, 14, 2, '#451a03');
  signpost.rect(8, 12, 10, 1, '#451a03');
  frames.push({ name: 'prop_signpost', buf: signpost, pivot: { x: 0.5, y: 0.9 } });

  return frames;
}

function generateExtrudedTilesetAndMaps(assetsV1Dir) {
  const entries = [];
  // 8 base 32x32 tiles packed with mandatory extrude: 1px & padding: 2px
  const tileDefs = [
    { name: 'tile_grass_a',    bg: '#2d5a36', dot: '#4e8c4a' },
    { name: 'tile_grass_b',    bg: '#31623b', dot: '#56a352' },
    { name: 'tile_dirt_path',  bg: '#6f533a', dot: '#876649' },
    { name: 'tile_water',      bg: '#1d6fa5', dot: '#67e8f9' },
    { name: 'tile_forest_flr', bg: '#20422b', dot: '#386b42' },
    { name: 'tile_stone_flr',  bg: '#374151', dot: '#4b5563' },
    { name: 'tile_wall_rock',  bg: '#1f2937', dot: '#6b7280' },
    { name: 'tile_farm_soil',  bg: '#5c3a21', dot: '#7c5329' },
  ];

  const tileFrames = tileDefs.map((t, idx) => {
    const b = new PixelBuffer(32, 32);
    b.rect(0, 0, 32, 32, t.bg);
    for (let i = 0; i < 6; i++) {
      b.rect(((i * 9 + idx * 5) % 26) + 2, ((i * 7 + idx * 3) % 26) + 2, 3, 2, t.dot);
    }
    if (t.name === 'tile_wall_rock') {
      b.outlineRect(1, 1, 30, 30, '#374151', '#111827');
      b.rect(4, 4, 12, 8, '#4b5563');
    }
    return { name: t.name, buf: b, pivot: { x: 0.5, y: 0.5 } };
  });

  const packedTiles = packPhaserAtlas({
    frames: tileFrames,
    imageFileName: 'tileset_mvp_extruded.png',
    paddingPx: 2,
    extrudePx: 1, // MANDATORY anti-seam-bleeding extrusion!
    maxDim: 2048,
  });

  const tPngRel = 'tilesets/tileset_mvp_extruded.png';
  const tJsonRel = 'tilesets/tileset_mvp_extruded.json';
  const tPngMeta = writeFileWithMeta(path.join(assetsV1Dir, tPngRel), packedTiles.pngBuf);
  const tJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, tJsonRel), packedTiles.jsonBuf);

  entries.push(
    {
      assetKey: 'tileset_mvp_extruded',
      objectKey: `v1/${tPngRel}`,
      kind: 'TILESET_EXTRUDED',
      loadingGroup: 'region_mvp',
      sha256: tPngMeta.sha256,
      sizeBytes: tPngMeta.sizeBytes,
    },
    {
      assetKey: 'tileset_mvp_extruded_json',
      objectKey: `v1/${tJsonRel}`,
      kind: 'ATLAS_JSON',
      loadingGroup: 'region_mvp',
      sha256: tJsonMeta.sha256,
      sizeBytes: tJsonMeta.sizeBytes,
    },
  );

  // Generate 3 shared Tiled .tmj maps (used identically by Server collision & Client Phaser WorldScene/DungeonScene)
  function makeMap(regionId, w, h, groundFn, blockedFn, portals, spawns) {
    const ground = [];
    const collision = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ground.push(groundFn(x, y));
        collision.push(blockedFn(x, y) ? 1 : 0);
      }
    }
    return {
      compressionlevel: -1,
      height: h,
      width: w,
      infinite: false,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.11.0',
      tileheight: 32,
      tilewidth: 32,
      type: 'map',
      version: '1.10',
      properties: [{ name: 'regionId', type: 'string', value: regionId }],
      layers: [
        { id: 1, name: 'ground', type: 'tilelayer', width: w, height: h, data: ground, visible: true, opacity: 1, x: 0, y: 0 },
        { id: 2, name: 'collision', type: 'tilelayer', width: w, height: h, data: collision, visible: false, opacity: 1, x: 0, y: 0 },
        { id: 3, name: 'portals', type: 'objectgroup', objects: portals, visible: true, opacity: 1, x: 0, y: 0 },
        { id: 4, name: 'spawns', type: 'objectgroup', objects: spawns, visible: true, opacity: 1, x: 0, y: 0 },
      ],
    };
  }

  const maps = [
    {
      id: 'reg_greenhaven_village',
      data: makeMap(
        'reg_greenhaven_village',
        40,
        28,
        (x, y) => {
          if (x === 0 || y === 0 || x === 39 || y === 27) return 7; // rock border
          if (x >= 28 && x <= 36 && y >= 3 && y <= 8) return 4; // pond water
          if (x >= 5 && x <= 14 && y >= 15 && y <= 21) return 8; // homestead soil
          if (y === 13 || y === 14 || x === 20 || x === 21) return 3; // dirt road
          return (x + y) % 2 === 0 ? 1 : 2;
        },
        (x, y) => x === 0 || y === 0 || x === 39 || y === 27 || (x >= 28 && x <= 36 && y >= 3 && y <= 8),
        [
          { id: 1, name: 'to_whispering_forest', x: 37 * 32, y: 13 * 32, width: 64, height: 64, properties: [{ name: 'targetRegionId', value: 'reg_whispering_forest' }, { name: 'spawnX', value: 96 }, { name: 'spawnY', value: 448 }] },
          { id: 2, name: 'to_mossroot_boss', x: 20 * 32, y: 2 * 32, width: 64, height: 64, properties: [{ name: 'targetRegionId', value: 'dng_mossroot_hollow' }, { name: 'spawnX', value: 416 }, { name: 'spawnY', value: 544 }] },
        ],
        [
          { id: 10, name: 'player_spawn', x: 20 * 32, y: 14 * 32 },
          { id: 11, name: 'npc_smith_garrik', x: 16 * 32, y: 10 * 32 },
          { id: 12, name: 'npc_elder_maren', x: 23 * 32, y: 10 * 32 },
        ],
      ),
    },
    {
      id: 'reg_whispering_forest',
      data: makeMap(
        'reg_whispering_forest',
        44,
        30,
        (x, y) => {
          if (x === 0 || y === 0 || x === 43 || y === 29) return 7;
          if (y === 14 || y === 15) return 3;
          return 5;
        },
        (x, y) => x === 0 || y === 0 || x === 43 || y === 29,
        [
          { id: 1, name: 'to_greenhaven', x: 1 * 32, y: 14 * 32, width: 64, height: 64, properties: [{ name: 'targetRegionId', value: 'reg_greenhaven_village' }, { name: 'spawnX', value: 1152 }, { name: 'spawnY', value: 448 }] },
          { id: 2, name: 'to_mossroot_hollow', x: 40 * 32, y: 14 * 32, width: 64, height: 64, properties: [{ name: 'targetRegionId', value: 'dng_mossroot_hollow' }, { name: 'spawnX', value: 416 }, { name: 'spawnY', value: 544 }] },
        ],
        [
          { id: 20, name: 'mob_spawn_1', x: 12 * 32, y: 10 * 32, properties: [{ name: 'monsterId', value: 'mob_moss_slime' }] },
          { id: 21, name: 'mob_spawn_2', x: 18 * 32, y: 18 * 32, properties: [{ name: 'monsterId', value: 'mob_forest_goblin' }] },
          { id: 22, name: 'mob_spawn_3', x: 25 * 32, y: 11 * 32, properties: [{ name: 'monsterId', value: 'mob_timber_wolf' }] },
          { id: 23, name: 'mob_spawn_4', x: 32 * 32, y: 19 * 32, properties: [{ name: 'monsterId', value: 'mob_spore_cap' }] },
          { id: 24, name: 'mob_spawn_5', x: 35 * 32, y: 9 * 32, properties: [{ name: 'monsterId', value: 'mob_elite_alpha_direwolf' }] },
        ],
      ),
    },
    {
      id: 'dng_mossroot_hollow',
      data: makeMap(
        'dng_mossroot_hollow',
        26,
        20,
        (x, y) => (x === 0 || y === 0 || x === 25 || y === 19 ? 7 : 6),
        (x, y) => x === 0 || y === 0 || x === 25 || y === 19,
        [
          { id: 1, name: 'exit_to_greenhaven', x: 12 * 32, y: 17 * 32, width: 64, height: 48, properties: [{ name: 'targetRegionId', value: 'reg_greenhaven_village' }, { name: 'spawnX', value: 640 }, { name: 'spawnY', value: 448 }] },
        ],
        [
          { id: 30, name: 'boss_spawn', x: 13 * 32, y: 8 * 32, properties: [{ name: 'bossId', value: 'boss_thornback_elder' }] },
          { id: 31, name: 'pil_moss_nw', x: 7 * 32, y: 6 * 32 },
          { id: 32, name: 'pil_moss_ne', x: 18 * 32, y: 6 * 32 },
          { id: 33, name: 'pil_moss_sw', x: 7 * 32, y: 13 * 32 },
          { id: 34, name: 'pil_moss_se', x: 18 * 32, y: 13 * 32 },
        ],
      ),
    },
  ];

  for (const m of maps) {
    const rel = `maps/${m.id}.tmj`;
    const meta = writeFileWithMeta(path.join(assetsV1Dir, rel), Buffer.from(JSON.stringify(m.data, null, 2), 'utf8'));
    entries.push({
      assetKey: `map_${m.id}`,
      objectKey: `v1/${rel}`,
      kind: 'TILED_MAP',
      loadingGroup: m.id === 'dng_mossroot_hollow' ? 'boss_instance' : 'region_mvp',
      sha256: meta.sha256,
      sizeBytes: meta.sizeBytes,
    });
  }

  return entries;
}

export function generateAllWorldAndBossPngs(assetsV1Dir) {
  const entries = [];
  const clips = [];

  // 1. MVP Monsters Atlas
  const mobFrames = [];
  for (const mob of MVP_MOBS) {
    for (const st of MOB_STATES) {
      const clipKey = `${mob.id}_${st.state}_down`;
      for (let f = 0; f < st.frames; f++) {
        mobFrames.push({
          name: `${clipKey}_${f}`,
          buf: drawMobFrame(mob, st.state, f),
          pivot: { x: 0.5, y: 0.85 },
        });
      }
      const durations = Array.from({ length: st.frames }, () => st.ms);
      const totalMs = durations.reduce((a, b) => a + b, 0);
      clips.push({
        clipKey,
        entityId: mob.id,
        state: st.state,
        direction: 'down',
        atlasKey: 'atlas_mobs_forest',
        frameCount: st.frames,
        frameDurationMs: durations,
        loop: st.loop,
        priority: st.priority,
        pivotNorm: { x: 0.5, y: 0.85 },
        hitFrameIndex: st.state === 'attack' ? 2 : null,
        cancelWindowStartFrame: null,
        watchdogMaxDurationMs: st.loop ? 0 : totalMs + 150,
        fallbackState: 'idle',
      });
    }
  }
  const mobPacked = packPhaserAtlas({ frames: mobFrames, imageFileName: 'mobs_forest_mvp.png', paddingPx: 2, extrudePx: 0 });
  const mobPngMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/monsters/mobs_forest_mvp.png'), mobPacked.pngBuf);
  const mobJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/monsters/mobs_forest_mvp.json'), mobPacked.jsonBuf);
  entries.push(
    { assetKey: 'atlas_mobs_forest', objectKey: 'v1/atlases/monsters/mobs_forest_mvp.png', kind: 'ATLAS_PNG', loadingGroup: 'region_mvp', sha256: mobPngMeta.sha256, sizeBytes: mobPngMeta.sizeBytes },
    { assetKey: 'atlas_mobs_forest_json', objectKey: 'v1/atlases/monsters/mobs_forest_mvp.json', kind: 'ATLAS_JSON', loadingGroup: 'region_mvp', sha256: mobJsonMeta.sha256, sizeBytes: mobJsonMeta.sizeBytes },
  );

  // 2. Boss Thornback Elder (128x128)
  const bossFrames = [];
  const bossStates = [
    { state: 'idle',     frames: 4, ms: 220, loop: true,  priority: 1 },
    { state: 'walk',     frames: 4, ms: 160, loop: true,  priority: 2 },
    { state: 'attack',   frames: 6, ms: 110, loop: false, priority: 6 },
    { state: 'skill',    frames: 6, ms: 110, loop: false, priority: 7 },
    { state: 'ultimate', frames: 6, ms: 115, loop: false, priority: 8 },
    { state: 'stun',     frames: 2, ms: 200, loop: true,  priority: 10 },
    { state: 'hit',      frames: 2, ms: 75,  loop: false, priority: 10 },
    { state: 'death',    frames: 4, ms: 160, loop: false, priority: 11 },
  ];
  for (const st of bossStates) {
    const clipKey = `boss_thornback_elder_${st.state}_down`;
    for (let f = 0; f < st.frames; f++) {
      bossFrames.push({
        name: `${clipKey}_${f}`,
        buf: drawBossThornbackFrame(st.state, f),
        pivot: { x: 0.5, y: 0.85 },
      });
    }
    const durations = Array.from({ length: st.frames }, () => st.ms);
    const totalMs = durations.reduce((a, b) => a + b, 0);
    clips.push({
      clipKey,
      entityId: 'boss_thornback_elder',
      state: st.state,
      direction: 'down',
      atlasKey: 'atlas_boss_thornback_elder',
      frameCount: st.frames,
      frameDurationMs: durations,
      loop: st.loop,
      priority: st.priority,
      pivotNorm: { x: 0.5, y: 0.85 },
      hitFrameIndex: ['attack', 'skill', 'ultimate'].includes(st.state) ? 3 : null,
      cancelWindowStartFrame: null,
      watchdogMaxDurationMs: st.loop ? 0 : totalMs + 150,
      fallbackState: 'idle',
    });
  }
  const bossPacked = packPhaserAtlas({ frames: bossFrames, imageFileName: 'boss_thornback_elder.png', paddingPx: 2, extrudePx: 0 });
  const bossPngMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/bosses/boss_thornback_elder.png'), bossPacked.pngBuf);
  const bossJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/bosses/boss_thornback_elder.json'), bossPacked.jsonBuf);
  entries.push(
    { assetKey: 'atlas_boss_thornback_elder', objectKey: 'v1/atlases/bosses/boss_thornback_elder.png', kind: 'ATLAS_PNG', loadingGroup: 'boss_instance', sha256: bossPngMeta.sha256, sizeBytes: bossPngMeta.sizeBytes },
    { assetKey: 'atlas_boss_thornback_elder_json', objectKey: 'v1/atlases/bosses/boss_thornback_elder.json', kind: 'ATLAS_JSON', loadingGroup: 'boss_instance', sha256: bossJsonMeta.sha256, sizeBytes: bossJsonMeta.sizeBytes },
  );

  // 2b. Boss #2 Canonical Atlas: Ignis Forgelord (128x128 molten-iron mountain boss from bosses.json)
  const ironFrames = [];
  for (const st of bossStates) {
    const clipKey = `boss_ignis_forgelord_${st.state}_down`;
    for (let f = 0; f < st.frames; f++) {
      const b = new PixelBuffer(128, 128);
      const sway = f % 2 === 0 ? 0 : -2;
      const slam = (st.state === 'attack' || st.state === 'skill' || st.state === 'ultimate') ? (f >= 3 ? 10 : -8) : 0;
      const flash = st.state === 'hit' && f === 0;
      const col = (hex) => (flash ? '#ffffff' : hex);
      b.ellipse(64, 108, 46, 10, '#141024', 135);
      b.outlineRect(28, 28 + sway, 72, 78, col('#475569'), '#14111b');
      b.rect(34, 34 + sway, 22, 66, col('#334155'));
      b.rect(72, 34 + sway, 20, 66, col('#64748b'));
      b.outlineRect(38, 14 + sway, 52, 20, col('#94a3b8'), '#14111b');
      b.rect(46, 22 + sway, 12, 5, '#ff6b1a');
      b.rect(70, 22 + sway, 12, 5, '#ff6b1a');
      // Molten furnace core
      b.outlineRect(50, 52 + sway, 28, 28, st.state === 'ultimate' ? '#ff3b3b' : '#f97316', '#14111b');
      b.rect(56, 58 + sway, 16, 16, '#fef08a');
      // Heavy iron fists
      b.outlineRect(6, 48 + slam, 26, 38, col('#64748b'), '#14111b');
      b.outlineRect(96, 48 + slam, 26, 38, col('#64748b'), '#14111b');
      ironFrames.push({ name: `${clipKey}_${f}`, buf: b, pivot: { x: 0.5, y: 0.85 } });
    }
    const durations = Array.from({ length: st.frames }, () => st.ms);
    const totalMs = durations.reduce((a, b) => a + b, 0);
    clips.push({
      clipKey,
      entityId: 'boss_ignis_forgelord',
      state: st.state,
      direction: 'down',
      atlasKey: 'atlas_boss_ignis_forgelord',
      frameCount: st.frames,
      frameDurationMs: durations,
      loop: st.loop,
      priority: st.priority,
      pivotNorm: { x: 0.5, y: 0.85 },
      hitFrameIndex: ['attack', 'skill', 'ultimate'].includes(st.state) ? 3 : null,
      cancelWindowStartFrame: null,
      watchdogMaxDurationMs: st.loop ? 0 : totalMs + 150,
      fallbackState: 'idle',
    });
  }
  const ironPacked = packPhaserAtlas({ frames: ironFrames, imageFileName: 'boss_ignis_forgelord.png', paddingPx: 2, extrudePx: 0 });
  const ironPngMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/bosses/boss_ignis_forgelord.png'), ironPacked.pngBuf);
  const ironJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/bosses/boss_ignis_forgelord.json'), ironPacked.jsonBuf);
  entries.push(
    { assetKey: 'atlas_boss_ignis_forgelord', objectKey: 'v1/atlases/bosses/boss_ignis_forgelord.png', kind: 'ATLAS_PNG', loadingGroup: 'boss_instance', sha256: ironPngMeta.sha256, sizeBytes: ironPngMeta.sizeBytes },
    { assetKey: 'atlas_boss_ignis_forgelord_json', objectKey: 'v1/atlases/bosses/boss_ignis_forgelord.json', kind: 'ATLAS_JSON', loadingGroup: 'boss_instance', sha256: ironJsonMeta.sha256, sizeBytes: ironJsonMeta.sizeBytes },
  );

  // 3. Homestead, Animals, Crops, Buildings & Props Atlas
  const worldPropFrames = drawWorldPropsAndLifeSim();
  const propPacked = packPhaserAtlas({ frames: worldPropFrames, imageFileName: 'world_props_mvp.png', paddingPx: 2, extrudePx: 0 });
  const propPngMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/world/world_props_mvp.png'), propPacked.pngBuf);
  const propJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, 'atlases/world/world_props_mvp.json'), propPacked.jsonBuf);
  entries.push(
    { assetKey: 'atlas_world_props_mvp', objectKey: 'v1/atlases/world/world_props_mvp.png', kind: 'ATLAS_PNG', loadingGroup: 'region_mvp', sha256: propPngMeta.sha256, sizeBytes: propPngMeta.sizeBytes },
    { assetKey: 'atlas_world_props_mvp_json', objectKey: 'v1/atlases/world/world_props_mvp.json', kind: 'ATLAS_JSON', loadingGroup: 'region_mvp', sha256: propJsonMeta.sha256, sizeBytes: propJsonMeta.sizeBytes },
  );

  // 4. Extruded Tilesets & Shared Tiled .tmj Maps
  entries.push(...generateExtrudedTilesetAndMaps(assetsV1Dir));

  return { entries, clips };
}
