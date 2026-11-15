/**
 * Co-op arena maps, biome palettes, static cover AABBs, destructibles,
 * explosive barrels, weapon pedestals, and deterministic layout generator
 * for `bansung` mode (specs d02, d05, d06; 132x84 Survival Battlefield).
 */
import {
  BANSUNG_PROP_INDEX,
  type BansungBiome,
  type BansungPickupKind,
  type BansungPropKind,
  type BansungWeaponId,
} from './types';

export type BansungBiomeId = BansungBiome;

export const BANSUNG_TILE_SIZE = 48;
export const BANSUNG_ARENA_COLS = 132;
export const BANSUNG_ARENA_ROWS = 84;
export const BANSUNG_MAP_W = BANSUNG_TILE_SIZE * BANSUNG_ARENA_COLS; // 6336
export const BANSUNG_MAP_H = BANSUNG_TILE_SIZE * BANSUNG_ARENA_ROWS; // 4032
export const BANSUNG_PROP_SNAP = 24;
export const BANSUNG_GRID_CELL = 64;

// d06 convenience aliases
export const TILE_SIZE = BANSUNG_TILE_SIZE;
export const ARENA_COLS = BANSUNG_ARENA_COLS;
export const ARENA_ROWS = BANSUNG_ARENA_ROWS;
export const MAP_W = BANSUNG_MAP_W;
export const MAP_H = BANSUNG_MAP_H;

export const BANSUNG_ARENA_CX = 3168;
export const BANSUNG_ARENA_CY = 2016;
export const BANSUNG_BOSS_PAD: readonly [number, number] = [
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
];
export const BANSUNG_BOSS_CLEAR_RADIUS = 260;

export const BANSUNG_PLAYABLE_BOUNDS = {
  x0: 48,
  y0: 96,
  x1: 6288,
  y1: 3984,
} as const;

export type BlockKind = 'wall' | 'pillar' | 'rock' | 'ruin' | 'tomb' | 'server';
export type PropKind =
  | 'barrel_explosive'
  | 'barrel_emp'
  | 'cactus'
  | 'crate'
  | 'urn'
  | 'decor';

export type BansungObstacleKind =
  | 'wall'
  | 'pillar'
  | 'cactus'
  | 'rock'
  | 'crate'
  | 'barrel'
  | 'pit';

export interface ArenaObstacle {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: BansungObstacleKind;
  blocksMove: boolean;
  blocksBullet: boolean;
  blocksLos: boolean;
  destructible: boolean;
  hp: number;
  alive: boolean;
}

export interface ArenaBlock {
  id: number;
  kind: BlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  visualH: number;
  blocksBullet: boolean;
  blocksSight: boolean;
  spriteId: string;
  propKind: BansungPropKind;
}

export interface ArenaPropSpawn {
  idx: number;
  kind: PropKind;
  propKind: BansungPropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  solid: boolean;
  spriteId: string;
  thornDmg?: number;
  blastDmg?: number;
  blastRadius?: number;
  stunMs?: number;
}

export interface ArenaPedestalSpawn {
  idx: number;
  x: number;
  y: number;
  radius: number;
  pickupKind: BansungPickupKind;
  weaponPool: readonly BansungWeaponId[];
  spriteId: string;
  label: string;
}

export interface ArenaEnemyGate {
  x: number;
  y: number;
  nx: number;
  ny: number;
  cardinal: boolean;
}

export interface BiomePalette {
  id: BansungBiome;
  name: string;
  floorA: string;
  floorB: string;
  floorAccent: string;
  wallTop: string;
  wallFace: string;
  wallTrim: string;
  ambientTint: string;
  hazardAccent: string;
}

export interface ArenaMapDef {
  biome: BansungBiome;
  seed: number;
  w: number;
  h: number;
  tileSize: number;
  playable: { x0: number; y0: number; x1: number; y1: number };
  palette: BiomePalette;
  blocks: ArenaBlock[];
  props: ArenaPropSpawn[];
  obstacles: ArenaObstacle[];
  destructibles: ArenaPropSpawn[];
  barrels: ArenaPropSpawn[];
  pedestals: ArenaPedestalSpawn[];
  playerSpawns: [number, number][];
  enemyGates: ArenaEnemyGate[];
  bossPad: [number, number];
}

export const BANSUNG_BIOME_PALETTES: Readonly<Record<BansungBiome, BiomePalette>> = {
  desert: {
    id: 'desert',
    name: 'Desert Ruins',
    floorA: '#d9a05b',
    floorB: '#c88d48',
    floorAccent: '#b57836',
    wallTop: '#9e6835',
    wallFace: '#6b4220',
    wallTrim: '#c48a47',
    ambientTint: 'rgba(255, 196, 112, 0.08)',
    hazardAccent: '#e6b873',
  },
  crypt: {
    id: 'crypt',
    name: 'Crimson Crypt',
    floorA: '#2d242c',
    floorB: '#3b2d38',
    floorAccent: '#7a1c24',
    wallTop: '#47333d',
    wallFace: '#23171e',
    wallTrim: '#7a1c24',
    ambientTint: 'rgba(122, 28, 36, 0.10)',
    hazardAccent: '#a82834',
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Lab',
    floorA: '#1f2937',
    floorB: '#283548',
    floorAccent: '#22d3ee',
    wallTop: '#334155',
    wallFace: '#161e2e',
    wallTrim: '#22d3ee',
    ambientTint: 'rgba(34, 211, 238, 0.08)',
    hazardAccent: '#eab308',
  },
};

export const BANSUNG_PLAYER_SPAWNS: readonly [number, number][] = [
  [3060, 2184],
  [3132, 2184],
  [3204, 2184],
  [3276, 2184],
  [3060, 2244],
  [3132, 2244],
  [3204, 2244],
  [3276, 2244],
];

const DIAG = Math.SQRT1_2;

/**
 * 12 perimeter enemy spawn gates (4 cardinal N/S/W/E + 4 corners + 4 mid-quadrant
 * perimeter gates), inset cleanly inside `BANSUNG_PLAYABLE_BOUNDS` so `isPointBlocked`
 * never reports wall collisions on spawn portals.
 */
export const BANSUNG_ENEMY_GATES: readonly ArenaEnemyGate[] = [
  // 4 Cardinal N/S/W/E gates
  { x: 3168, y: 144, nx: 0, ny: 1, cardinal: true },
  { x: 3168, y: 3936, nx: 0, ny: -1, cardinal: true },
  { x: 96, y: 2016, nx: 1, ny: 0, cardinal: true },
  { x: 6240, y: 2016, nx: -1, ny: 0, cardinal: true },
  // 4 Corner breaches
  { x: 240, y: 240, nx: DIAG, ny: DIAG, cardinal: false },
  { x: 6096, y: 240, nx: -DIAG, ny: DIAG, cardinal: false },
  { x: 240, y: 3840, nx: DIAG, ny: -DIAG, cardinal: false },
  { x: 6096, y: 3840, nx: -DIAG, ny: -DIAG, cardinal: false },
  // 4 Mid-quadrant perimeter gates
  { x: 1728, y: 144, nx: 0, ny: 1, cardinal: false },
  { x: 4608, y: 144, nx: 0, ny: 1, cardinal: false },
  { x: 1728, y: 3936, nx: 0, ny: -1, cardinal: false },
  { x: 4608, y: 3936, nx: 0, ny: -1, cardinal: false },
];

const PEDESTAL_WEAPON_POOLS: Readonly<Record<BansungBiome, readonly BansungWeaponId[]>> = {
  desert: [
    'laser_cannon',
    'ion_beam',
    'railgun',
    'plasma_rifle',
    'electric_gun',
    'tesla_coil',
    'plasma_shotgun',
    'orbital_cannon',
    'void_cannon',
    'chronos_rifle',
    'lightning_staff',
    'minigun',
    'sniper_rifle',
    'saw_launcher',
    'cluster_rpg',
    'ricochet_disc',
    'magma_spitter',
    'bazooka',
    'dual_pistols',
    'twin_smg',
  ],
  crypt: [
    'laser_cannon',
    'ion_beam',
    'void_cannon',
    'railgun',
    'lightning_staff',
    'arcane_book',
    'tesla_coil',
    'plasma_rifle',
    'plasma_shotgun',
    'flamethrower',
    'cryo_cannon',
    'blizzard_carbine',
    'phantom_bow',
    'reaper_scythe',
    'orbital_cannon',
    'chronos_rifle',
    'mine_gun',
    'stun_launcher',
  ],
  cyber: [
    'laser_cannon',
    'ion_beam',
    'railgun',
    'plasma_rifle',
    'electric_gun',
    'tesla_coil',
    'orbital_cannon',
    'void_cannon',
    'chronos_rifle',
    'plasma_shotgun',
    'gravity_gun',
    'sniper_rifle',
    'minigun',
    'lightning_staff',
    'shock_baton',
    'cluster_rpg',
  ],
};

const PEDESTAL_ANCHORS: readonly { x: number; y: number; label: string }[] = [
  { x: 1584, y: 2016, label: 'West Shrine' },
  { x: 4752, y: 2016, label: 'East Shrine' },
  { x: 3168, y: 792, label: 'North Shrine' },
  { x: 1944, y: 3120, label: 'South-West Shrine' },
  { x: 4392, y: 3120, label: 'South-East Shrine' },
];

const BIOME_SEED_SALT: Readonly<Record<BansungBiome, number>> = {
  desert: 0x9e3779b9,
  crypt: 0x85ebca6b,
  cyber: 0xc2b2ae35,
};

function resolveBiome(biome: BansungBiome | string): BansungBiome {
  if (biome === 'crypt' || biome === 'cyber') return biome;
  return 'desert';
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snap24(val: number): number {
  return Math.round(val / BANSUNG_PROP_SNAP) * BANSUNG_PROP_SNAP;
}

function mapBlockToPropKind(kind: BlockKind): BansungPropKind {
  return kind === 'rock' ? 'rock' : 'pillar';
}

function mapBlockToObstacleKind(kind: BlockKind): BansungObstacleKind {
  if (kind === 'wall') return 'wall';
  if (kind === 'rock') return 'rock';
  return 'pillar';
}

function mapPropToPropKind(kind: PropKind): BansungPropKind {
  if (kind === 'barrel_explosive' || kind === 'barrel_emp') return 'barrel';
  if (kind === 'cactus') return 'cactus';
  if (kind === 'urn') return 'pot';
  return 'crate';
}

function mapPropToObstacleKind(kind: PropKind): BansungObstacleKind {
  if (kind === 'barrel_explosive' || kind === 'barrel_emp') return 'barrel';
  if (kind === 'cactus') return 'cactus';
  return 'crate';
}

function createBlock(
  id: number,
  kind: BlockKind,
  x: number,
  y: number,
  w: number,
  h: number,
  visualH: number,
  spriteId: string,
): ArenaBlock {
  return {
    id,
    kind,
    x,
    y,
    w,
    h,
    visualH,
    blocksBullet: true,
    blocksSight: true,
    spriteId,
    propKind: mapBlockToPropKind(kind),
  };
}

function buildPerimeterBlocks(biome: BansungBiome): ArenaBlock[] {
  const sprite = `wall_${biome}`;
  return [
    createBlock(0, 'wall', 0, 0, BANSUNG_MAP_W, 96, 48, sprite),
    createBlock(1, 'wall', 0, 3984, BANSUNG_MAP_W, 48, 24, sprite),
    createBlock(2, 'wall', 0, 96, 48, 3888, 24, sprite),
    createBlock(3, 'wall', 6288, 96, 48, 3888, 24, sprite),
  ];
}

interface BlockTemplate {
  kind: BlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  visualH: number;
  spriteId: string;
  jitterable?: boolean;
}

function getBiomeBlockTemplates(biome: BansungBiome): readonly BlockTemplate[] {
  if (biome === 'desert') {
    return [
      // 4 inner plaza ruin pillars around (CX +/- 720, CY +/- 468)
      { kind: 'ruin', x: 2376, y: 1512, w: 96, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'ruin', x: 3816, y: 1512, w: 96, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'ruin', x: 2376, y: 2448, w: 96, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'ruin', x: 3816, y: 2448, w: 96, h: 72, visualH: 48, spriteId: 'pillar' },
      // 2 central N/S broken ruin half-walls
      { kind: 'ruin', x: 3024, y: 1224, w: 192, h: 48, visualH: 36, spriteId: 'pillar' },
      { kind: 'ruin', x: 3024, y: 2880, w: 192, h: 48, visualH: 36, spriteId: 'pillar' },
      // 4 quadrant bastion ruins across NW/NE/SW/SE mid-fields
      { kind: 'ruin', x: 1320, y: 1032, w: 144, h: 72, visualH: 44, spriteId: 'pillar', jitterable: true },
      { kind: 'ruin', x: 4800, y: 1032, w: 144, h: 72, visualH: 44, spriteId: 'pillar', jitterable: true },
      { kind: 'ruin', x: 1320, y: 2976, w: 144, h: 72, visualH: 44, spriteId: 'pillar', jitterable: true },
      { kind: 'ruin', x: 4800, y: 2976, w: 144, h: 72, visualH: 44, spriteId: 'pillar', jitterable: true },
      // 4 mid-outer ruin pillars framing outer corridors
      { kind: 'pillar', x: 2112, y: 696, w: 72, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'pillar', x: 4128, y: 696, w: 72, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'pillar', x: 2112, y: 3288, w: 72, h: 72, visualH: 48, spriteId: 'pillar' },
      { kind: 'pillar', x: 4128, y: 3288, w: 72, h: 72, visualH: 48, spriteId: 'pillar' },
      // 12 sandstone rocks breaking sniper sightlines across lanes & flanks
      { kind: 'rock', x: 744, y: 2016, w: 48, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 5520, y: 2016, w: 48, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 3120, y: 456, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 3120, y: 3528, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 960, y: 1536, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 5256, y: 1536, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 960, y: 2472, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 5256, y: 2472, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 744, y: 696, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 5472, y: 696, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 744, y: 3312, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
      { kind: 'rock', x: 5472, y: 3312, w: 72, h: 48, visualH: 32, spriteId: 'rock', jitterable: true },
    ];
  }
  if (biome === 'crypt') {
    return [
      // 8 gothic colonnade pillars in 2 grand nave rows (CX +/- 648)
      { kind: 'pillar', x: 2520, y: 1272, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 3744, y: 1272, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 2520, y: 1752, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 3744, y: 1752, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 2520, y: 2256, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 3744, y: 2256, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 2520, y: 2712, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 3744, y: 2712, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      // 8 stone sarcophagi across inner & outer crypt wings
      { kind: 'tomb', x: 1848, y: 1368, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 4368, y: 1368, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 1848, y: 2736, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 4368, y: 2736, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 864, y: 936, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 5328, y: 936, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 864, y: 3096, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      { kind: 'tomb', x: 5328, y: 3096, w: 96, h: 48, visualH: 32, spriteId: 'tomb', jitterable: true },
      // 6 outer crypt pillars
      { kind: 'pillar', x: 864, y: 1992, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 5400, y: 1992, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 2112, y: 720, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 4128, y: 720, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 2112, y: 3264, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
      { kind: 'pillar', x: 4128, y: 3264, w: 48, h: 72, visualH: 52, spriteId: 'pillar' },
    ];
  }
  // cyber: 4 inner L-server cover pairs + 4 outer L-server racks (2 flush AABBs each) + 8 conduit pillars
  return [
    // Inner 4 L-shaped Server Cover Pairs
    { kind: 'server', x: 2376, y: 1512, w: 144, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 2376, y: 1560, w: 48, h: 96, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 3816, y: 1512, w: 144, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 3912, y: 1560, w: 48, h: 96, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 2376, y: 2520, w: 144, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 2376, y: 2424, w: 48, h: 96, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 3816, y: 2520, w: 144, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 3912, y: 2424, w: 48, h: 96, visualH: 44, spriteId: 'server' },
    // Outer 4 L-shaped Server Racks across NW/NE/SW/SE quadrants
    { kind: 'server', x: 1104, y: 1008, w: 120, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 1104, y: 1056, w: 48, h: 72, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 5112, y: 1008, w: 120, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 5184, y: 1056, w: 48, h: 72, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 1104, y: 3024, w: 120, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 1104, y: 2952, w: 48, h: 72, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 5112, y: 3024, w: 120, h: 48, visualH: 44, spriteId: 'server' },
    { kind: 'server', x: 5184, y: 2952, w: 48, h: 72, visualH: 44, spriteId: 'server' },
    // 8 conduit pillars in N/S/W/E & outer corridors
    { kind: 'pillar', x: 2112, y: 720, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 4128, y: 720, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 2112, y: 3312, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 4128, y: 3312, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 840, y: 2016, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 5448, y: 2016, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 3144, y: 1248, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
    { kind: 'pillar', x: 3144, y: 2928, w: 48, h: 48, visualH: 48, spriteId: 'pillar', jitterable: true },
  ];
}

function buildBlocks(biome: BansungBiome, rng: () => number, seeded: boolean): ArenaBlock[] {
  const blocks = buildPerimeterBlocks(biome);
  const templates = getBiomeBlockTemplates(biome);
  let nextId = blocks.length;
  for (const tpl of templates) {
    let x = tpl.x;
    let y = tpl.y;
    if (seeded && tpl.jitterable) {
      const dx = (Math.floor(rng() * 3) - 1) * BANSUNG_PROP_SNAP;
      const dy = (Math.floor(rng() * 3) - 1) * BANSUNG_PROP_SNAP;
      x += dx;
      y += dy;
    }
    blocks.push(createBlock(nextId++, tpl.kind, x, y, tpl.w, tpl.h, tpl.visualH, tpl.spriteId));
  }
  return blocks;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildPedestals(biome: BansungBiome, rng: () => number, seeded: boolean): ArenaPedestalSpawn[] {
  const pool = [...PEDESTAL_WEAPON_POOLS[biome]];
  if (seeded) shuffleInPlace(pool, rng);
  return PEDESTAL_ANCHORS.map((anchor, idx) => {
    const start = idx % pool.length;
    const rotated = [...pool.slice(start), ...pool.slice(0, start)];
    return {
      idx,
      x: anchor.x,
      y: anchor.y,
      radius: 36,
      pickupKind: 'weapon',
      weaponPool: rotated,
      spriteId: 'pedestal',
      label: anchor.label,
    };
  });
}

interface PropCandidateSpec {
  kind: PropKind;
  hp: number;
  spriteId: string;
  w: number;
  h: number;
  solid: boolean;
  thornDmg?: number;
  blastDmg?: number;
  blastRadius?: number;
  stunMs?: number;
}

function getPropSpec(biome: BansungBiome, kind: PropKind, variantIdx: number): PropCandidateSpec {
  if (kind === 'barrel_explosive') {
    return {
      kind,
      hp: 40,
      spriteId: 'barrel_red',
      w: 36,
      h: 36,
      solid: true,
      blastDmg: 140,
      blastRadius: 160,
    };
  }
  if (kind === 'barrel_emp') {
    return {
      kind,
      hp: 45,
      spriteId: 'barrel_emp',
      w: 36,
      h: 36,
      solid: true,
      blastDmg: 120,
      blastRadius: 170,
      stunMs: 1200,
    };
  }
  if (kind === 'cactus') {
    return {
      kind,
      hp: 80,
      spriteId: 'cactus',
      w: 40,
      h: 40,
      solid: true,
      thornDmg: 0,
    };
  }
  if (kind === 'urn') {
    return {
      kind,
      hp: 20,
      spriteId: 'urn',
      w: 28,
      h: 28,
      solid: true,
    };
  }
  if (kind === 'crate') {
    const hp = biome === 'cyber' ? 40 : biome === 'crypt' ? 35 : 30;
    return {
      kind,
      hp,
      spriteId: 'crate',
      w: 36,
      h: 36,
      solid: true,
    };
  }
  const decorSprites: Record<BansungBiome, readonly string[]> = {
    desert: ['decor_skull', 'decor_pebble', 'decor_scrub'],
    crypt: ['crypt_brazier', 'decor_candle', 'decor_bone'],
    cyber: ['decor_vent', 'decor_cable'],
  };
  const list = decorSprites[biome];
  return {
    kind: 'decor',
    hp: 0,
    spriteId: list[variantIdx % list.length],
    w: 24,
    h: 24,
    solid: false,
  };
}

function aabbMinDistSq(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): number {
  const dx = ax1 < bx0 ? bx0 - ax1 : bx1 < ax0 ? ax0 - bx1 : 0;
  const dy = ay1 < by0 ? by0 - ay1 : by1 < ay0 ? ay0 - by1 : 0;
  return dx * dx + dy * dy;
}

function isPlacementClear(
  cx: number,
  cy: number,
  w: number,
  h: number,
  solid: boolean,
  blocks: readonly ArenaBlock[],
  placed: readonly ArenaPropSpawn[],
  pedestals: readonly ArenaPedestalSpawn[],
): boolean {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;

  const wallPad = solid ? 48 : 24;
  if (
    x0 < BANSUNG_PLAYABLE_BOUNDS.x0 + wallPad ||
    x1 > BANSUNG_PLAYABLE_BOUNDS.x1 - wallPad ||
    y0 < BANSUNG_PLAYABLE_BOUNDS.y0 + wallPad ||
    y1 > BANSUNG_PLAYABLE_BOUNDS.y1 - wallPad
  ) {
    return false;
  }

  // Keep central boss plaza clear
  const bossMinR = solid ? BANSUNG_BOSS_CLEAR_RADIUS + 20 : 160;
  if (Math.hypot(cx - BANSUNG_ARENA_CX, cy - BANSUNG_ARENA_CY) < bossMinR) {
    return false;
  }

  // Keep player co-op spawns clear
  const spawnMinR = solid ? 84 : 40;
  for (const [sx, sy] of BANSUNG_PLAYER_SPAWNS) {
    if (Math.hypot(cx - sx, cy - sy) < spawnMinR) return false;
  }

  // Keep all 12 enemy spawn gates & inward portal probes clear
  const gateMinR = solid ? 108 : 52;
  for (const gate of BANSUNG_ENEMY_GATES) {
    if (Math.hypot(cx - gate.x, cy - gate.y) < gateMinR) return false;
  }

  // Keep all 5 weapon pedestals clear
  const pedMinR = solid ? 84 : 44;
  for (const ped of pedestals) {
    if (Math.hypot(cx - ped.x, cy - ped.y) < pedMinR) return false;
  }

  // Keep >=56px clearance around interior blocks to prevent narrow kiting pinch traps
  const blockGap = solid ? 56 : 24;
  const blockGapSq = blockGap * blockGap;
  for (let i = 4; i < blocks.length; i++) {
    const b = blocks[i];
    if (aabbMinDistSq(x0, y0, x1, y1, b.x, b.y, b.x + b.w, b.y + b.h) < blockGapSq) {
      return false;
    }
  }

  // Keep clearance from already placed props
  for (const p of placed) {
    const gap = solid && p.solid ? 52 : !solid && !p.solid ? 52 : 24;
    if (
      aabbMinDistSq(
        x0,
        y0,
        x1,
        y1,
        p.x - p.w / 2,
        p.y - p.h / 2,
        p.x + p.w / 2,
        p.y + p.h / 2,
      ) <
      gap * gap
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Generates a broad, symmetric 24px-snapped anchor lattice across the 6336x4032
 * arena, then extracts well-spaced non-overlapping solid + decor anchor pools.
 */
function buildLatticeAnchors(
  blocks: readonly ArenaBlock[],
  pedestals: readonly ArenaPedestalSpawn[],
): { solidAnchors: [number, number][]; decorAnchors: [number, number][] } {
  const solidAnchors: [number, number][] = [];
  const decorAnchors: [number, number][] = [];

  // Solid candidate lattice (step 288x240 across 6336x4032)
  for (let y = 312; y <= 3768; y += 240) {
    for (let x = 240; x <= 6096; x += 288) {
      const sx = snap24(x + (((y / 240) & 1) === 1 ? 144 : 0));
      if (sx > 6096) continue;
      if (isPlacementClear(sx, y, 40, 40, true, blocks, [], pedestals)) {
        solidAnchors.push([sx, y]);
      }
    }
  }

  // Additional mid-wing ring candidates for generous seeded backup pool
  const extraSolid: readonly [number, number][] = [
    [2064, 1680], [4272, 1680], [2064, 2400], [4272, 2400],
    [2760, 936], [3576, 936], [2760, 3168], [3576, 3168],
    [1248, 1800], [5088, 1800], [1248, 2304], [5088, 2304],
    [696, 1248], [5640, 1248], [696, 2832], [5640, 2832],
  ];
  for (const [ex, ey] of extraSolid) {
    if (isPlacementClear(ex, ey, 40, 40, true, blocks, [], pedestals)) {
      solidAnchors.push([ex, ey]);
    }
  }

  // Interleave solid anchors from outside-in & symmetrical bands for balanced seed=0 spread
  const orderedSolid: [number, number][] = [];
  const half = Math.ceil(solidAnchors.length / 2);
  for (let i = 0; i < half; i++) {
    orderedSolid.push(solidAnchors[i]);
    const mirror = solidAnchors.length - 1 - i;
    if (mirror > i) orderedSolid.push(solidAnchors[mirror]);
  }

  // Decor candidate lattice (offset by 144x120 from solid grid)
  for (let y = 264; y <= 3816; y += 264) {
    for (let x = 360; x <= 5976; x += 336) {
      const dx = snap24(x + (((y / 264) & 1) === 1 ? 120 : 0));
      if (dx > 5976) continue;
      if (isPlacementClear(dx, y, 24, 24, false, blocks, [], pedestals)) {
        decorAnchors.push([dx, y]);
      }
    }
  }

  return { solidAnchors: orderedSolid, decorAnchors };
}

function getBiomePropKinds(biome: BansungBiome): PropKind[] {
  if (biome === 'desert') {
    return [
      ...Array<PropKind>(24).fill('cactus'),
      ...Array<PropKind>(20).fill('barrel_explosive'),
      ...Array<PropKind>(14).fill('crate'),
      ...Array<PropKind>(14).fill('urn'),
    ];
  }
  if (biome === 'crypt') {
    return [
      ...Array<PropKind>(24).fill('barrel_explosive'),
      ...Array<PropKind>(24).fill('urn'),
      ...Array<PropKind>(24).fill('crate'),
    ];
  }
  return [
    ...Array<PropKind>(26).fill('barrel_emp'),
    ...Array<PropKind>(46).fill('crate'),
  ];
}

function pickClearPoint(
  ax: number,
  ay: number,
  spec: PropCandidateSpec,
  blocks: readonly ArenaBlock[],
  placed: readonly ArenaPropSpawn[],
  pedestals: readonly ArenaPedestalSpawn[],
  rng: () => number,
  seeded: boolean,
): [number, number] | null {
  const jx = seeded ? (Math.floor(rng() * 3) - 1) * BANSUNG_PROP_SNAP : 0;
  const jy = seeded ? (Math.floor(rng() * 3) - 1) * BANSUNG_PROP_SNAP : 0;
  const cx = snap24(ax + jx);
  const cy = snap24(ay + jy);
  if (isPlacementClear(cx, cy, spec.w, spec.h, spec.solid, blocks, placed, pedestals)) {
    return [cx, cy];
  }
  if (
    (jx !== 0 || jy !== 0) &&
    isPlacementClear(ax, ay, spec.w, spec.h, spec.solid, blocks, placed, pedestals)
  ) {
    return [ax, ay];
  }
  return null;
}

function buildProps(
  biome: BansungBiome,
  blocks: readonly ArenaBlock[],
  pedestals: readonly ArenaPedestalSpawn[],
  rng: () => number,
  seeded: boolean,
): ArenaPropSpawn[] {
  const kinds = getBiomePropKinds(biome);
  const { solidAnchors, decorAnchors } = buildLatticeAnchors(blocks, pedestals);
  const placed: ArenaPropSpawn[] = [];

  if (seeded) {
    shuffleInPlace(solidAnchors, rng);
    shuffleInPlace(decorAnchors, rng);
  }

  let anchorIdx = 0;
  for (let i = 0; i < kinds.length; i++) {
    const spec = getPropSpec(biome, kinds[i], i);
    let chosen: [number, number] | null = null;
    while (anchorIdx < solidAnchors.length && !chosen) {
      const [ax, ay] = solidAnchors[anchorIdx++];
      chosen = pickClearPoint(ax, ay, spec, blocks, placed, pedestals, rng, seeded);
    }
    if (chosen) {
      placed.push({
        idx: placed.length,
        kind: spec.kind,
        propKind: mapPropToPropKind(spec.kind),
        x: chosen[0],
        y: chosen[1],
        w: spec.w,
        h: spec.h,
        hp: spec.hp,
        solid: spec.solid,
        spriteId: spec.spriteId,
        ...(spec.thornDmg !== undefined ? { thornDmg: spec.thornDmg } : {}),
        ...(spec.blastDmg !== undefined ? { blastDmg: spec.blastDmg } : {}),
        ...(spec.blastRadius !== undefined ? { blastRadius: spec.blastRadius } : {}),
        ...(spec.stunMs !== undefined ? { stunMs: spec.stunMs } : {}),
      });
    }
  }

  const decorCount = 24;
  let dIdx = 0;
  for (let i = 0; i < decorCount && dIdx < decorAnchors.length; ) {
    const [ax, ay] = decorAnchors[dIdx++];
    const spec = getPropSpec(biome, 'decor', i);
    const pt = pickClearPoint(ax, ay, spec, blocks, placed, pedestals, rng, seeded);
    if (!pt) continue;
    placed.push({
      idx: placed.length,
      kind: 'decor',
      propKind: 'crate',
      x: pt[0],
      y: pt[1],
      w: spec.w,
      h: spec.h,
      hp: 0,
      solid: false,
      spriteId: spec.spriteId,
    });
    i++;
  }

  return placed;
}

function buildObstacles(
  blocks: readonly ArenaBlock[],
  props: readonly ArenaPropSpawn[],
): ArenaObstacle[] {
  const obstacles: ArenaObstacle[] = [];
  for (const b of blocks) {
    obstacles.push({
      id: obstacles.length,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      kind: mapBlockToObstacleKind(b.kind),
      blocksMove: true,
      blocksBullet: b.blocksBullet,
      blocksLos: b.blocksSight,
      destructible: false,
      hp: 0,
      alive: true,
    });
  }
  for (const p of props) {
    if (!p.solid || p.hp <= 0) continue;
    obstacles.push({
      id: obstacles.length,
      x: p.x - p.w / 2,
      y: p.y - p.h / 2,
      w: p.w,
      h: p.h,
      kind: mapPropToObstacleKind(p.kind),
      blocksMove: true,
      blocksBullet: true,
      blocksLos: false,
      destructible: true,
      hp: p.hp,
      alive: true,
    });
  }
  return obstacles;
}

/**
 * Generates a deterministic arena layout for the given biome and seed.
 * `seed === 0` yields the canonical layout stored in `BANSUNG_MAPS`.
 */
export function generateArenaLayout(biome: BansungBiome, seed = 0): ArenaMapDef {
  const resolved = resolveBiome(biome);
  const normalizedSeed = Math.trunc(seed) >>> 0;
  const seeded = normalizedSeed !== 0;
  const rng = mulberry32(normalizedSeed ^ BIOME_SEED_SALT[resolved]);

  const blocks = buildBlocks(resolved, rng, seeded);
  const pedestals = buildPedestals(resolved, rng, seeded);
  const props = buildProps(resolved, blocks, pedestals, rng, seeded);
  const obstacles = buildObstacles(blocks, props);
  const destructibles = props.filter((p) => p.hp > 0);
  const barrels = props.filter(
    (p) => p.kind === 'barrel_explosive' || p.kind === 'barrel_emp',
  );

  return {
    biome: resolved,
    seed: normalizedSeed,
    w: BANSUNG_MAP_W,
    h: BANSUNG_MAP_H,
    tileSize: BANSUNG_TILE_SIZE,
    playable: { ...BANSUNG_PLAYABLE_BOUNDS },
    palette: BANSUNG_BIOME_PALETTES[resolved],
    blocks,
    props,
    obstacles,
    destructibles,
    barrels,
    pedestals,
    playerSpawns: BANSUNG_PLAYER_SPAWNS.map(([x, y]) => [x, y]),
    enemyGates: BANSUNG_ENEMY_GATES.map((g) => ({ ...g })),
    bossPad: [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY],
  };
}

/** Alias matching `d06` naming (`buildArenaMap(biome)`). */
export function buildArenaMap(biome: BansungBiome, seed = 0): ArenaMapDef {
  return generateArenaLayout(biome, seed);
}

/** Packs static cover blocks as stride-5 `[x, y, w, h, propKindIdx]` for `BansungRoomView.obstacles`. */
export function packStaticObstacles(
  map: ArenaMapDef,
  includePerimeter = false,
): number[] {
  const out: number[] = [];
  for (const b of map.blocks) {
    if (!includePerimeter && b.kind === 'wall') continue;
    out.push(b.x, b.y, b.w, b.h, BANSUNG_PROP_INDEX[b.propKind]);
  }
  return out;
}

export const BANSUNG_MAPS: Readonly<Record<BansungBiome, ArenaMapDef>> = {
  desert: generateArenaLayout('desert', 0),
  crypt: generateArenaLayout('crypt', 0),
  cyber: generateArenaLayout('cyber', 0),
};
