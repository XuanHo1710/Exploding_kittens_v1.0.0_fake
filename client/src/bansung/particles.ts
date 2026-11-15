/**
 * Zero-GC particle, 2.5D bouncing casing, chunk-baked decal, outlined damage
 * number, and procedural 256x128 FX atlas manager for `bansung` (d22, d23, d24, d42).
 *
 * Design invariants:
 * - Zero object/closure/string allocations in `step()`, `spawn*()`, and `draw*()`.
 * - Structure-of-Arrays (SoA) fixed TypedArrays for 1024 particles & 384 decals.
 * - Pre-allocated 128-slot damage/status text ring with pre-interned number strings.
 * - Up to 16 reusable 512x512 offscreen decal chunk canvases (`clearRect` on reset).
 * - Single 256x128 pre-baked glow/spark/FX atlas built once in `init()`.
 */
import {
  BANSUNG_DMG_ARMOR,
  BANSUNG_DMG_BURN,
  BANSUNG_DMG_CRIT,
  BANSUNG_DMG_HEAL,
  BANSUNG_DMG_SHOCK,
  BANSUNG_DMG_STUN,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
} from '../../../shared/src';

// ============================================================================
// 1. Fixed Pool Capacities, Atlas Metrics & Physics Constants
// ============================================================================

/** Maximum concurrent pooled particles (SoA typed arrays). */
export const PARTICLE_CAP = 1024;
/** Maximum concurrent airborne/unbaked decals in the active decal pool. */
export const DECAL_CAP = 640;
/** Maximum concurrent floating outlined damage/status numbers. */
export const TEXT_CAP = 128;

/** Edge length in world pixels of each cached offscreen decal chunk. */
export const DECAL_CHUNK_SIZE = 512;
/** Hard VRAM cap on reusable 512x512 decal chunk canvases (~16 MB max). */
export const MAX_DECAL_CHUNKS = 16;

/** Dimensions of the procedural FX sprite & radial glow atlas. */
export const ATLAS_W = 256;
export const ATLAS_H = 128;

/** Particle count threshold above which Low/Med burst counts & lifetimes throttle. */
export const HIGH_DENSITY_THRESHOLD = 768;
/** Consecutive >24ms frames before switching additive pass to source-over for 1s. */
export const FRAME_GUARD_DT_MS = 24;
export const FRAME_GUARD_STREAK = 3;
export const FRAME_GUARD_COOLDOWN_MS = 1000;

/** Maximum particle burst budget for stun detonations (d23). */
export const MAX_STUN_BURST = 16;

/** 2.5D shell casing & crater timing constants (d22, d24, d42). */
export const CASING_PHYSICS = {
  EJECT_Z: 14,
  GRAVITY_Z: 780,
  RESTITUTION_Z: 0.44,
  GROUND_FRICTION: 0.56,
  SPIN_DAMP: 0.55,
  MAX_BOUNCES: 2,
  MIN_BOUNCE_VZ: 32,
  MAX_AIR_MS: 650,
  SETTLED_TTL_MS: 12_000,
  SETTLED_FADE_MS: 1_500,
  CRATER_TTL_MS: 5_000,
  CRATER_FADE_MS: 1_000,
} as const;

function isTemporaryBlastDecal(kind: DecalKind): boolean {
  return (
    kind === DecalKind.CraterSm ||
    kind === DecalKind.CraterLg ||
    kind === DecalKind.Scorch
  );
}

const INTERN_NUM_MAX = 999;
const MAX_STEP_DT_MS = 50;
const EVICT_PROBE_COUNT = 16;
const DECAL_EVICT_PROBE = 24;
const VIEWPORT_CULL_PAD = 64;
const CHUNK_GRID_FAST_SLOTS = 64;
const RING_Y_ASPECT = 0.72;
const SHADOW_BASE_ALPHA = 0.32;
const SHADOW_MIN_ALPHA = 0.08;
const TEXT_FADE_RATIO = 0.3;

// ============================================================================
// 2. Enums (isolatedModules-safe const objects + value unions) & Palette
// ============================================================================

/** Render layer buckets for particle sorting & composite batching. */
export const FxLayer = {
  GroundRing: 0,
  World: 1,
  Additive: 2,
} as const;
export type FxLayer = (typeof FxLayer)[keyof typeof FxLayer];

/** Particle eviction priority tiers (Critical telegraphs never starved by dust). */
export const FxPrio = {
  Low: 0,
  Med: 1,
  High: 2,
  Critical: 3,
} as const;
export type FxPrio = (typeof FxPrio)[keyof typeof FxPrio];

/** Particle visual & behavioral kinds. */
export const FxKind = {
  Dust: 0,
  Smoke: 1,
  Spark: 2,
  Muzzle: 3,
  Tracer: 4,
  Glow: 5,
  Ember: 6,
  Ring: 7,
  Arc: 8,
  StunStar: 9,
  Chip: 10,
  Ghost: 11,
  FirePuff: 12,
  Blood: 13,
  Shrapnel: 14,
} as const;
export type FxKind = (typeof FxKind)[keyof typeof FxKind];

/** Ground decal & 2.5D bouncing casing kinds. */
export const DecalKind = {
  CasingBrass: 0,
  CasingRed: 1,
  CraterSm: 2,
  CraterLg: 3,
  Scorch: 4,
  SplatSlime: 5,
  SplatOil: 6,
  Rubble: 7,
  SplatBlood: 8,
  SplatSap: 9,
} as const;
export type DecalKind = (typeof DecalKind)[keyof typeof DecalKind];

/** Static 32-color Miragine/Soul-Knight FX palette (indices 0..15 match d42). */
export const FX_PALETTE = [
  '#ffffff', // 0: flash white
  '#fff3bf', // 1: hot pale gold
  '#ffd43b', // 2: bright gold / crit
  '#ff922b', // 3: fire orange
  '#fa5252', // 4: bright crimson / blood
  '#c92a2a', // 5: deep red / dark blood
  '#74c0fc', // 6: electric cyan / stun
  '#339af0', // 7: plasma blue
  '#b197fc', // 8: arcane violet
  '#69db7c', // 9: heal / cactus sap
  '#f5e6c8', // 10: cream dust
  '#a68b6b', // 11: desert sand
  '#3a3642', // 12: charcoal smoke
  '#140c1c', // 13: dark pixel outline
  '#d8b467', // 14: brass casing
  '#e03131', // 15: red shotgun hull
  '#2b8a3e', // 16: deep cactus sap
  '#8ce99a', // 17: bright sap highlight
  '#6741d9', // 18: deep violet
  '#212529', // 19: iron shrapnel
  '#868e96', // 20: ash smoke
  '#d9b57e', // 21: sand dust speck
  '#e7f5ff', // 22: electric white-cyan core
  '#ffa94d', // 23: warm ember
  '#5c4033', // 24: wood crate chip
  '#c48a47', // 25: clay pot chip
  '#7950f2', // 26: void purple
  '#ff6b6b', // 27: player hit red
  '#4dabf7', // 28: shield blue
  '#ffe066', // 29: coin/star yellow
  '#20c997', // 30: cyber teal
  '#000000', // 31: pure soot
] as const;

/** Semantic named indices into `FX_PALETTE`. */
export const FxColor = {
  White: 0,
  HotGold: 1,
  Gold: 2,
  Orange: 3,
  Blood: 4,
  BloodDark: 5,
  Cyan: 6,
  Plasma: 7,
  Violet: 8,
  Heal: 9,
  Sap: 9,
  Dust: 10,
  Sand: 11,
  Smoke: 12,
  Outline: 13,
  Brass: 14,
  ShotgunRed: 15,
  SapDark: 16,
  SapBright: 17,
  DeepViolet: 18,
  Shrapnel: 19,
  Ash: 20,
  SandSpeck: 21,
  ElectricCore: 22,
  Ember: 23,
  WoodChip: 24,
  ClayChip: 25,
  VoidPurple: 26,
  HitRed: 27,
  Shield: 28,
  CoinGold: 29,
  CyberTeal: 30,
  Soot: 31,
} as const;
export type FxColor = (typeof FxColor)[keyof typeof FxColor];

export type FxBurstPreset =
  | 'muzzle'
  | 'impact'
  | 'explosion'
  | 'stun'
  | 'dash'
  | 'crate'
  | 'blood'
  | 'sap'
  | 'smoke'
  | 'sparks'
  | 'dust'
  | 'ember';

// ============================================================================
// 3. Public Options, Slot & Pool Contracts
// ============================================================================

/** Optional parameters for `spawnParticle()`. */
export interface SpawnFxOpts {
  layer?: FxLayer;
  prio?: FxPrio;
  colorIdx?: number;
  vx?: number;
  vy?: number;
  z?: number;
  vz?: number;
  size?: number;
  sizeEnd?: number;
  lifeMs?: number;
  rot?: number;
  vrot?: number;
  gravity?: number;
  drag?: number;
  maxBounces?: number;
  paramA?: number;
  paramB?: number;
}

/** Optional overrides for `spawnBurst()`. */
export interface SpawnBurstOpts {
  casing?: 'brass' | 'shell' | 'none';
  colorIdx?: number;
  shooterVx?: number;
  shooterVy?: number;
}

/** Optional overrides for `spawnDecal()`. */
export interface SpawnDecalOpts {
  vx?: number;
  vy?: number;
  vz?: number;
  vrot?: number;
  scale?: number;
  /** Optional finite lifetime in ms (0/undefined = bake permanently to chunk). */
  lifeMs?: number;
  colorIdx?: number;
  seed?: number;
}

/** Pre-allocated slot inside the 128-slot outlined damage/status text ring. */
export interface TextSlot {
  active: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  ageMs: number;
  lifeMs: number;
  colorIdx: number;
  scale: number;
  text: string;
}

/** Pool utilization and throttle telemetry for debug HUD / soak tests. */
export interface FxStats {
  activeParticles: number;
  activeDecals: number;
  activeTexts: number;
  dropped: number;
  bakedDecals: number;
  chunkCount: number;
  degraded: boolean;
}

/** Public contract for the zero-GC particle, decal, text, and FX atlas pool. */
export interface FxPool {
  init(): void;
  reset(mapW?: number, mapH?: number): void;
  step(rawDtMs: number): void;
  spawnParticle(kind: FxKind, x: number, y: number, opts?: SpawnFxOpts): number;
  spawnBurst(
    preset: FxBurstPreset,
    x: number,
    y: number,
    ang?: number,
    scale?: number,
    opts?: SpawnBurstOpts,
  ): void;
  spawnDecal(
    kind: DecalKind,
    x: number,
    y: number,
    angle?: number,
    z?: number,
    opts?: SpawnDecalOpts,
  ): number;
  spawnCasing(
    kind: 'brass' | 'shell',
    x: number,
    y: number,
    aimRad: number,
    shooterVx?: number,
    shooterVy?: number,
  ): number;
  spawnText(text: string, x: number, y: number, colorIdx?: number, scale?: number): number;
  spawnDamageNumber(
    amount: number,
    x: number,
    y: number,
    dmgFlags?: number,
    isPlayerHit?: boolean,
  ): number;
  drawDecals(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number): void;
  drawAirborneDecals(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number): void;
  drawLayer(
    ctx: CanvasRenderingContext2D,
    layer: FxLayer,
    vx0: number,
    vy0: number,
    vx1: number,
    vy1: number,
    now?: number,
  ): void;
  drawTexts(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number): void;
  getAtlas(): HTMLCanvasElement | null;
  stats(): FxStats;
}

// ============================================================================
// 4. Procedural 256x128 Atlas & Pre-Interned String Tables
// ============================================================================

interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ATLAS_CELLS = {
  dustX: 0,
  dustY: 0,
  smokeX: 128,
  smokeY: 0,
  fireX: 0,
  fireY: 32,
  muzzleX: 128,
  muzzleY: 32,
  starX: 224,
  starY: 32,
  casingBrassX: 224,
  casingBrassY: 48,
  casingRedX: 224,
  casingRedY: 56,
  craterSm: { x: 0, y: 64, w: 32, h: 32 },
  scorch: { x: 0, y: 96, w: 32, h: 32 },
  craterLg: { x: 32, y: 64, w: 64, h: 64 },
  glowWhite: { x: 96, y: 64, w: 64, h: 64 },
  glowFire: { x: 160, y: 64, w: 32, h: 32 },
  glowCyan: { x: 192, y: 64, w: 32, h: 32 },
  glowCrimson: { x: 224, y: 64, w: 32, h: 32 },
  glowEmerald: { x: 160, y: 96, w: 32, h: 32 },
  glowViolet: { x: 192, y: 96, w: 32, h: 32 },
  sparkWhite: { x: 224, y: 96, w: 16, h: 16 },
  sparkFire: { x: 240, y: 96, w: 16, h: 16 },
  sparkCyan: { x: 224, y: 112, w: 16, h: 16 },
  sparkCrimson: { x: 240, y: 112, w: 16, h: 16 },
} as const;

/** Safe offscreen canvas allocator (returns `null` in headless Node environments). */
function createOffscreenCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Paint a pixel disc/ellipse directly with stepped crisp pixels (no anti-aliasing). */
function fillPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  ditherMod = 0,
): void {
  ctx.fillStyle = color;
  const x0 = Math.floor(-rx);
  const x1 = Math.ceil(rx);
  const y0 = Math.floor(-ry);
  const y1 = Math.ceil(ry);
  const rx2 = Math.max(1, rx * rx);
  const ry2 = Math.max(1, ry * ry);
  for (let dy = y0; dy <= y1; dy++) {
    for (let dx = x0; dx <= x1; dx++) {
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1.0) {
        if (ditherMod > 0 && ((dx + dy) & 1) === 0 && (dx * 7 + dy * 13) % ditherMod === 0) {
          continue;
        }
        ctx.fillRect((cx + dx) | 0, (cy + dy) | 0, 1, 1);
      }
    }
  }
}

/** Bake a soft radial glow disc into an atlas cell once at `init()`. */
function bakeRadialGlowCell(
  ctx: CanvasRenderingContext2D,
  cell: AtlasRect,
  coreHex: string,
  midRgba: string,
  edgeRgba: string,
): void {
  const cx = cell.x + cell.w * 0.5;
  const cy = cell.y + cell.h * 0.5;
  const r = cell.w * 0.5;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, coreHex);
  grad.addColorStop(0.42, midRgba);
  grad.addColorStop(1, edgeRgba);
  ctx.fillStyle = grad;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
}

/** Bake a 16x16 4-point crisp pixel spark diamond into an atlas cell. */
function bakeSparkCell(
  ctx: CanvasRenderingContext2D,
  cell: AtlasRect,
  outerHex: string,
  midHex: string,
): void {
  const cx = cell.x + 8;
  const cy = cell.y + 8;
  ctx.fillStyle = outerHex;
  ctx.fillRect(cx - 7, cy - 1, 14, 2);
  ctx.fillRect(cx - 1, cy - 7, 2, 14);
  ctx.fillRect(cx - 4, cy - 2, 8, 4);
  ctx.fillRect(cx - 2, cy - 4, 4, 8);
  ctx.fillStyle = midHex;
  ctx.fillRect(cx - 5, cy - 1, 10, 2);
  ctx.fillRect(cx - 1, cy - 5, 2, 10);
  ctx.fillRect(cx - 2, cy - 2, 4, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

/** Bake a 1px dark-outlined 8x8 pixel shell casing at 0/45/90/135 deg steps. */
function bakeCasingStrip(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  bodyHex: string,
  rimHex: string,
): void {
  const dark = '#140c1c';
  // Frame 0: 0 deg horizontal (5x3 with 1px outline)
  ctx.fillStyle = dark;
  ctx.fillRect(ox + 1, oy + 2, 6, 4);
  ctx.fillStyle = bodyHex;
  ctx.fillRect(ox + 2, oy + 3, 3, 2);
  ctx.fillStyle = rimHex;
  ctx.fillRect(ox + 5, oy + 3, 1, 2);

  // Frame 1: 45 deg diagonal
  const f1 = ox + 8;
  ctx.fillStyle = dark;
  ctx.fillRect(f1 + 1, oy + 1, 5, 5);
  ctx.fillStyle = bodyHex;
  ctx.fillRect(f1 + 2, oy + 2, 2, 2);
  ctx.fillRect(f1 + 3, oy + 3, 2, 2);
  ctx.fillStyle = rimHex;
  ctx.fillRect(f1 + 4, oy + 4, 1, 1);

  // Frame 2: 90 deg vertical
  const f2 = ox + 16;
  ctx.fillStyle = dark;
  ctx.fillRect(f2 + 2, oy + 1, 4, 6);
  ctx.fillStyle = bodyHex;
  ctx.fillRect(f2 + 3, oy + 2, 2, 3);
  ctx.fillStyle = rimHex;
  ctx.fillRect(f2 + 3, oy + 5, 2, 1);

  // Frame 3: 135 deg diagonal
  const f3 = ox + 24;
  ctx.fillStyle = dark;
  ctx.fillRect(f3 + 1, oy + 1, 5, 5);
  ctx.fillStyle = bodyHex;
  ctx.fillRect(f3 + 4, oy + 2, 2, 2);
  ctx.fillRect(f3 + 2, oy + 3, 2, 2);
  ctx.fillStyle = rimHex;
  ctx.fillRect(f3 + 2, oy + 4, 1, 1);
}

/** Build the complete procedural 256x128 FX sprite & radial glow atlas once. */
function buildProceduralFxAtlas(): HTMLCanvasElement | null {
  const canvas = createOffscreenCanvas(ATLAS_W, ATLAS_H);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  // Row y=0, cols 0..3: Dust (4 frames of 32x32)
  for (let f = 0; f < 4; f++) {
    const cx = f * 32 + 16;
    const cy = 16;
    if (f < 2) {
      const r = f === 0 ? 7 : 10;
      fillPixelEllipse(ctx, cx, cy + 2, r, r * 0.78, '#d9b57e');
      fillPixelEllipse(ctx, cx - 1, cy - 1, r * 0.85, r * 0.7, '#f5e6c8');
      fillPixelEllipse(ctx, cx - 2, cy - 3, r * 0.4, r * 0.35, '#ffffff');
    } else if (f === 2) {
      fillPixelEllipse(ctx, cx - 4, cy - 2, 6, 5, '#f5e6c8', 2);
      fillPixelEllipse(ctx, cx + 5, cy + 1, 5, 4, '#d9b57e', 2);
    } else {
      ctx.fillStyle = '#f5e6c8';
      ctx.fillRect(cx - 8, cy - 5, 3, 3);
      ctx.fillRect(cx + 5, cy - 3, 2, 2);
      ctx.fillRect(cx - 3, cy + 5, 3, 2);
      ctx.fillStyle = '#d9b57e';
      ctx.fillRect(cx + 3, cy + 4, 2, 2);
    }
  }

  // Row y=0, cols 4..7: Smoke (4 frames of 32x32)
  for (let f = 0; f < 4; f++) {
    const cx = 128 + f * 32 + 16;
    const cy = 16;
    if (f === 0) {
      fillPixelEllipse(ctx, cx, cy + 1, 8, 7, '#140c1c');
      fillPixelEllipse(ctx, cx, cy, 7, 6, '#3a3642');
      fillPixelEllipse(ctx, cx - 2, cy - 2, 4, 3, '#868e96');
    } else if (f === 1) {
      fillPixelEllipse(ctx, cx, cy, 11, 9, '#3a3642');
      fillPixelEllipse(ctx, cx - 3, cy - 3, 6, 5, '#868e96');
      fillPixelEllipse(ctx, cx + 4, cy + 2, 5, 4, '#140c1c', 3);
    } else if (f === 2) {
      fillPixelEllipse(ctx, cx, cy, 12, 10, '#3a3642', 2);
      fillPixelEllipse(ctx, cx - 4, cy - 3, 6, 5, '#868e96', 2);
    } else {
      ctx.fillStyle = '#3a3642';
      ctx.fillRect(cx - 9, cy - 6, 3, 3);
      ctx.fillRect(cx + 6, cy - 4, 3, 2);
      ctx.fillRect(cx - 2, cy + 5, 3, 3);
      ctx.fillStyle = '#868e96';
      ctx.fillRect(cx + 3, cy + 3, 2, 2);
    }
  }

  // Row y=32, cols 0..3: FirePuff (4 frames of 32x32)
  for (let f = 0; f < 4; f++) {
    const cx = f * 32 + 16;
    const cy = 48;
    if (f === 0) {
      fillPixelEllipse(ctx, cx, cy, 9, 8, '#ff922b');
      fillPixelEllipse(ctx, cx, cy, 6, 5, '#fff3bf');
      fillPixelEllipse(ctx, cx, cy, 3, 3, '#ffffff');
    } else if (f === 1) {
      fillPixelEllipse(ctx, cx, cy, 12, 10, '#fa5252');
      fillPixelEllipse(ctx, cx - 1, cy - 1, 9, 8, '#ff922b');
      fillPixelEllipse(ctx, cx - 1, cy - 1, 5, 4, '#fff3bf');
    } else if (f === 2) {
      fillPixelEllipse(ctx, cx, cy, 13, 11, '#3a3642', 3);
      fillPixelEllipse(ctx, cx, cy + 1, 10, 8, '#c92a2a');
      fillPixelEllipse(ctx, cx - 2, cy - 2, 5, 4, '#ff922b');
    } else {
      fillPixelEllipse(ctx, cx, cy, 11, 9, '#3a3642', 2);
      ctx.fillStyle = '#ff922b';
      ctx.fillRect(cx - 5, cy - 4, 2, 2);
      ctx.fillRect(cx + 4, cy + 2, 2, 2);
      ctx.fillStyle = '#c92a2a';
      ctx.fillRect(cx - 2, cy + 5, 3, 2);
    }
  }

  // Row y=32, cols 4..6: Muzzle flash cones (3 frames of 32x32, pivot at x+4, y+16)
  for (let f = 0; f < 3; f++) {
    const ox = 128 + f * 32;
    const oy = 32;
    const px = ox + 4;
    const py = oy + 16;
    const len = f === 0 ? 22 : f === 1 ? 26 : 15;
    const half = f === 0 ? 9 : f === 1 ? 6 : 4;
    ctx.fillStyle = '#ff922b';
    for (let dx = 0; dx < len; dx++) {
      const span = Math.max(1, Math.round(half * (1 - dx / len) + (dx < 5 ? 2 : 0)));
      ctx.fillRect(px + dx, py - span, 1, span * 2);
    }
    ctx.fillStyle = '#ffd43b';
    for (let dx = 0; dx < len * 0.72; dx++) {
      const span = Math.max(1, Math.round(half * 0.65 * (1 - dx / (len * 0.72))));
      ctx.fillRect(px + dx, py - span, 1, span * 2);
    }
    ctx.fillStyle = '#ffffff';
    for (let dx = 0; dx < len * 0.42; dx++) {
      const span = Math.max(1, Math.round(half * 0.35 * (1 - dx / (len * 0.42))));
      ctx.fillRect(px + dx, py - span, 1, span * 2);
    }
    // Side vents on frame 0
    if (f === 0) {
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(px + 1, py - 12, 3, 3);
      ctx.fillRect(px + 1, py + 9, 3, 3);
    }
  }

  // Row y=32..47, x=224..255: StunStar 2 frames of 16x16
  for (let f = 0; f < 2; f++) {
    const cx = 224 + f * 16 + 8;
    const cy = 40;
    ctx.fillStyle = '#140c1c';
    ctx.fillRect(cx - 2, cy - 6, 4, 12);
    ctx.fillRect(cx - 6, cy - 2, 12, 4);
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(cx - 1, cy - 5, 2, 10);
    ctx.fillRect(cx - 5, cy - 1, 10, 2);
    ctx.fillRect(cx - 3, cy - 3, 6, 6);
    ctx.fillStyle = '#fff9db';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    if (f === 1) {
      ctx.fillRect(cx - 4, cy - 4, 1, 1);
      ctx.fillRect(cx + 3, cy + 3, 1, 1);
    }
  }

  // Row y=48..63, x=224..255: 4-frame 8x8 Brass & Red Shotgun Casings
  bakeCasingStrip(ctx, ATLAS_CELLS.casingBrassX, ATLAS_CELLS.casingBrassY, '#d8b467', '#fff3bf');
  bakeCasingStrip(ctx, ATLAS_CELLS.casingRedX, ATLAS_CELLS.casingRedY, '#e03131', '#d8b467');

  // Row y=64: CraterSm (32x32)
  fillPixelEllipse(ctx, 16, 80, 14, 10, '#140c1c');
  fillPixelEllipse(ctx, 16, 80, 12, 8, '#a68b6b');
  fillPixelEllipse(ctx, 16, 80, 10, 6.5, '#3a3642');
  fillPixelEllipse(ctx, 16, 81, 6, 4, '#212529');
  ctx.fillStyle = '#d9b57e';
  ctx.fillRect(5, 76, 2, 2);
  ctx.fillRect(25, 83, 2, 2);

  // Row y=96: Scorch (32x32 Bayer-dithered charcoal)
  fillPixelEllipse(ctx, 16, 112, 14, 10, '#3a3642', 2);
  fillPixelEllipse(ctx, 16, 112, 9, 6, '#140c1c', 2);

  // Row y=64: CraterLg (64x64 at x=32..95)
  fillPixelEllipse(ctx, 64, 96, 27, 19, '#140c1c');
  fillPixelEllipse(ctx, 64, 96, 25, 17, '#a68b6b');
  fillPixelEllipse(ctx, 64, 96, 21, 14, '#3a3642');
  fillPixelEllipse(ctx, 64, 97, 14, 9, '#212529');
  fillPixelEllipse(ctx, 64, 98, 8, 5, '#140c1c');
  ctx.fillStyle = '#d9b57e';
  ctx.fillRect(40, 88, 3, 2);
  ctx.fillRect(83, 101, 3, 2);
  ctx.fillRect(56, 79, 2, 2);
  ctx.fillRect(70, 111, 2, 2);

  // Pre-baked radial glow discs (zero runtime createRadialGradient!)
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowWhite, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.36)', 'rgba(255,255,255,0)');
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowFire, 'rgba(255,243,191,0.92)', 'rgba(255,146,43,0.42)', 'rgba(255,146,43,0)');
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowCyan, 'rgba(231,245,255,0.92)', 'rgba(51,154,240,0.42)', 'rgba(51,154,240,0)');
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowCrimson, 'rgba(255,201,201,0.92)', 'rgba(250,82,82,0.42)', 'rgba(250,82,82,0)');
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowEmerald, 'rgba(211,249,216,0.92)', 'rgba(105,219,124,0.42)', 'rgba(105,219,124,0)');
  bakeRadialGlowCell(ctx, ATLAS_CELLS.glowViolet, 'rgba(243,240,255,0.92)', 'rgba(177,151,252,0.42)', 'rgba(177,151,252,0)');

  // Pre-baked 16x16 crisp pixel spark stamps
  bakeSparkCell(ctx, ATLAS_CELLS.sparkWhite, '#fff3bf', '#ffffff');
  bakeSparkCell(ctx, ATLAS_CELLS.sparkFire, '#ff922b', '#ffd43b');
  bakeSparkCell(ctx, ATLAS_CELLS.sparkCyan, '#339af0', '#74c0fc');
  bakeSparkCell(ctx, ATLAS_CELLS.sparkCrimson, '#c92a2a', '#fa5252');

  return canvas;
}

const INTERN_NEG: string[] = [];
const INTERN_POS: string[] = [];
const INTERN_PLAIN: string[] = [];
const INTERN_CRIT: string[] = [];

function ensureInternTables(): void {
  if (INTERN_NEG.length > 0) return;
  for (let i = 0; i <= INTERN_NUM_MAX; i++) {
    const s = String(i);
    INTERN_PLAIN.push(s);
    INTERN_NEG.push('-' + s);
    INTERN_POS.push('+' + s);
    INTERN_CRIT.push('-' + s + '!');
  }
}

// ============================================================================
// 5. Zero-GC FxPool Implementation (`BansungFxPool`)
// ============================================================================

/**
 * Fixed-memory, zero-GC FX pool managing:
 * - `1024`-slot Structure-of-Arrays (SoA) particle simulation & priority eviction
 * - `384`-slot persistent settling decal + 2.5D bouncing casing pool
 * - Up to `16` reusable `512x512` offscreen decal chunks
 * - `128`-slot outlined damage/status floating number ring
 * - `256x128` procedural glow/spark/FX sprite atlas
 */
export class BansungFxPool implements FxPool {
  // --- Particle SoA (1024 slots) ---
  private readonly pKind = new Uint8Array(PARTICLE_CAP);
  private readonly pLayer = new Uint8Array(PARTICLE_CAP);
  private readonly pPrio = new Uint8Array(PARTICLE_CAP);
  private readonly pColorIdx = new Uint8Array(PARTICLE_CAP);
  private readonly pBounces = new Uint8Array(PARTICLE_CAP);
  private readonly pMaxBounces = new Uint8Array(PARTICLE_CAP);
  private readonly pX = new Float32Array(PARTICLE_CAP);
  private readonly pY = new Float32Array(PARTICLE_CAP);
  private readonly pZ = new Float32Array(PARTICLE_CAP);
  private readonly pVx = new Float32Array(PARTICLE_CAP);
  private readonly pVy = new Float32Array(PARTICLE_CAP);
  private readonly pVz = new Float32Array(PARTICLE_CAP);
  private readonly pSize = new Float32Array(PARTICLE_CAP);
  private readonly pSizeEnd = new Float32Array(PARTICLE_CAP);
  private readonly pRot = new Float32Array(PARTICLE_CAP);
  private readonly pVrot = new Float32Array(PARTICLE_CAP);
  private readonly pGravity = new Float32Array(PARTICLE_CAP);
  private readonly pDrag = new Float32Array(PARTICLE_CAP);
  private readonly pAgeMs = new Float32Array(PARTICLE_CAP);
  private readonly pLifeMs = new Float32Array(PARTICLE_CAP);
  private readonly pParamA = new Float32Array(PARTICLE_CAP);
  private readonly pParamB = new Float32Array(PARTICLE_CAP);
  private readonly pActiveIds = new Uint16Array(PARTICLE_CAP);
  private readonly pFreeStack = new Uint16Array(PARTICLE_CAP);
  private activeCount = 0;
  private freeTop = PARTICLE_CAP - 1;
  private evictCursor = 0;
  private droppedCount = 0;

  // --- Decal / Bouncing Casing SoA (384 slots) ---
  private readonly dActive = new Uint8Array(DECAL_CAP);
  private readonly dKind = new Uint8Array(DECAL_CAP);
  private readonly dSettled = new Uint8Array(DECAL_CAP);
  private readonly dBounces = new Uint8Array(DECAL_CAP);
  private readonly dColorIdx = new Uint8Array(DECAL_CAP);
  private readonly dX = new Float32Array(DECAL_CAP);
  private readonly dY = new Float32Array(DECAL_CAP);
  private readonly dZ = new Float32Array(DECAL_CAP);
  private readonly dVx = new Float32Array(DECAL_CAP);
  private readonly dVy = new Float32Array(DECAL_CAP);
  private readonly dVz = new Float32Array(DECAL_CAP);
  private readonly dRot = new Float32Array(DECAL_CAP);
  private readonly dVrot = new Float32Array(DECAL_CAP);
  private readonly dScale = new Float32Array(DECAL_CAP);
  private readonly dAgeMs = new Float32Array(DECAL_CAP);
  private readonly dLifeMs = new Float32Array(DECAL_CAP);
  private readonly dSeed = new Uint32Array(DECAL_CAP);
  private readonly dActiveIds = new Uint16Array(DECAL_CAP);
  private readonly dFreeStack = new Uint16Array(DECAL_CAP);
  private activeDecalCount = 0;
  private decalFreeTop = DECAL_CAP - 1;
  private decalEvictCursor = 0;
  private bakedDecalCount = 0;
  private airborneDrawnThisFrame = false;
  private onCasingBounce: ((x: number, y: number, bounces: number) => void) | null = null;

  // --- 512x512 Chunk Cache (max 16 reusable canvases with LRU eviction) ---
  private readonly chunkCanvases: Array<HTMLCanvasElement | null> = new Array(MAX_DECAL_CHUNKS).fill(null);
  private readonly chunkCtxs: Array<CanvasRenderingContext2D | null> = new Array(MAX_DECAL_CHUNKS).fill(null);
  private readonly chunkKeys = new Int32Array(MAX_DECAL_CHUNKS).fill(-1);
  private readonly chunkDirty = new Uint8Array(MAX_DECAL_CHUNKS);
  private readonly chunkLastUsed = new Uint32Array(MAX_DECAL_CHUNKS);
  private readonly chunkGridLookup = new Int8Array(CHUNK_GRID_FAST_SLOTS).fill(-1);
  private chunkCount = 0;
  private chunkAccessStamp = 1;
  private mapW = BANSUNG_MAP_W;
  private mapH = BANSUNG_MAP_H;
  private gridCols = Math.ceil(BANSUNG_MAP_W / DECAL_CHUNK_SIZE);
  private gridRows = Math.ceil(BANSUNG_MAP_H / DECAL_CHUNK_SIZE);

  // --- Floating Damage/Status Text Ring (128 slots) ---
  private readonly textSlots: TextSlot[] = [];
  private activeTextCount = 0;
  private textCursor = 0;

  // --- Procedural Atlas & Guardrails ---
  private atlas: HTMLCanvasElement | null = null;
  private slowFrameStreak = 0;
  private degradedMsLeft = 0;
  private rngState = 0x9e3779b9;

  constructor() {
    ensureInternTables();
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.pFreeStack[i] = PARTICLE_CAP - 1 - i;
    }
    for (let i = 0; i < DECAL_CAP; i++) {
      this.dFreeStack[i] = DECAL_CAP - 1 - i;
    }
    for (let i = 0; i < TEXT_CAP; i++) {
      this.textSlots.push({
        active: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        gravity: 420,
        ageMs: 0,
        lifeMs: 680,
        colorIdx: FxColor.White,
        scale: 1,
        text: '',
      });
    }
  }

  /** Pre-interns numeric strings and builds the 256x128 FX atlas if in a browser. */
  init(): void {
    ensureInternTables();
    if (!this.atlas && typeof document !== 'undefined') {
      this.atlas = buildProceduralFxAtlas();
    }
  }

  /** Returns the pre-baked 256x128 glow/spark/FX atlas (lazily created in browser). */
  getAtlas(): HTMLCanvasElement | null {
    if (!this.atlas && typeof document !== 'undefined') {
      this.atlas = buildProceduralFxAtlas();
    }
    return this.atlas;
  }

  /** Registers an optional rate-limitable hook invoked when a shell casing bounces. */
  setCasingBounceHook(fn: ((x: number, y: number, bounces: number) => void) | null): void {
    this.onCasingBounce = fn;
  }

  /** Clears all pools and `clearRect`s cached 512x512 chunks without allocating canvases. */
  reset(mapW = BANSUNG_MAP_W, mapH = BANSUNG_MAP_H): void {
    this.mapW = Math.max(DECAL_CHUNK_SIZE, mapW | 0);
    this.mapH = Math.max(DECAL_CHUNK_SIZE, mapH | 0);
    this.gridCols = Math.max(1, Math.ceil(this.mapW / DECAL_CHUNK_SIZE));
    this.gridRows = Math.max(1, Math.ceil(this.mapH / DECAL_CHUNK_SIZE));

    this.activeCount = 0;
    this.freeTop = PARTICLE_CAP - 1;
    this.evictCursor = 0;
    this.droppedCount = 0;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.pFreeStack[i] = PARTICLE_CAP - 1 - i;
    }

    this.activeDecalCount = 0;
    this.decalFreeTop = DECAL_CAP - 1;
    this.decalEvictCursor = 0;
    this.bakedDecalCount = 0;
    this.airborneDrawnThisFrame = false;
    this.dActive.fill(0);
    for (let i = 0; i < DECAL_CAP; i++) {
      this.dFreeStack[i] = DECAL_CAP - 1 - i;
    }

    for (let i = 0; i < MAX_DECAL_CHUNKS; i++) {
      const cctx = this.chunkCtxs[i];
      if (cctx && this.chunkDirty[i] !== 0) {
        cctx.clearRect(0, 0, DECAL_CHUNK_SIZE, DECAL_CHUNK_SIZE);
      }
      this.chunkDirty[i] = 0;
      this.chunkKeys[i] = -1;
      this.chunkLastUsed[i] = 0;
    }
    this.chunkGridLookup.fill(-1);
    this.chunkCount = 0;
    this.chunkAccessStamp = 1;

    for (let i = 0; i < TEXT_CAP; i++) {
      this.textSlots[i].active = 0;
    }
    this.activeTextCount = 0;
    this.textCursor = 0;

    this.slowFrameStreak = 0;
    this.degradedMsLeft = 0;
  }

  /** Advances particles, 2.5D casings/decals, text popups, and frame-time guardrails. */
  step(rawDtMs: number): void {
    this.airborneDrawnThisFrame = false;
    if (!Number.isFinite(rawDtMs) || rawDtMs <= 0) return;

    if (rawDtMs > FRAME_GUARD_DT_MS) {
      this.slowFrameStreak++;
      if (this.slowFrameStreak >= FRAME_GUARD_STREAK) {
        this.degradedMsLeft = FRAME_GUARD_COOLDOWN_MS;
      }
    } else {
      this.slowFrameStreak = 0;
    }

    const dtMs = rawDtMs > MAX_STEP_DT_MS ? MAX_STEP_DT_MS : rawDtMs;
    const dtS = dtMs * 0.001;
    if (this.degradedMsLeft > 0) {
      this.degradedMsLeft = this.degradedMsLeft > dtMs ? this.degradedMsLeft - dtMs : 0;
    }

    // 1. Step particles (backward iteration for O(1) swap-and-pop)
    for (let i = this.activeCount - 1; i >= 0; i--) {
      const id = this.pActiveIds[i];
      const age = this.pAgeMs[id] + dtMs;
      this.pAgeMs[id] = age;
      if (age >= this.pLifeMs[id]) {
        this.pActiveIds[i] = this.pActiveIds[--this.activeCount];
        this.pFreeStack[++this.freeTop] = id;
        continue;
      }

      const drag = this.pDrag[id];
      if (drag > 0) {
        const damp = 1 - drag * dtS;
        const factor = damp > 0 ? damp : 0;
        this.pVx[id] *= factor;
        this.pVy[id] *= factor;
      }

      this.pX[id] += this.pVx[id] * dtS;
      this.pY[id] += this.pVy[id] * dtS;
      this.pRot[id] += this.pVrot[id] * dtS;

      const grav = this.pGravity[id];
      if (grav !== 0 || this.pZ[id] > 0 || this.pVz[id] !== 0) {
        let vz = this.pVz[id] - grav * dtS;
        let z = this.pZ[id] + vz * dtS;
        if (z <= 0) {
          z = 0;
          const b = this.pBounces[id];
          if (b < this.pMaxBounces[id] && Math.abs(vz) > 28) {
            this.pBounces[id] = b + 1;
            vz = Math.abs(vz) * 0.45;
            this.pVx[id] *= 0.55;
            this.pVy[id] *= 0.55;
            this.pVrot[id] *= 0.55;
          } else {
            vz = 0;
            this.pVx[id] *= 0.25;
            this.pVy[id] *= 0.25;
            this.pVrot[id] = 0;
          }
        }
        this.pZ[id] = z;
        this.pVz[id] = vz;
      }
    }

    // 2. Step airborne casings & fallback/timed decals
    for (let i = this.activeDecalCount - 1; i >= 0; i--) {
      const id = this.dActiveIds[i];
      const age = this.dAgeMs[id] + dtMs;
      this.dAgeMs[id] = age;

      if (this.dSettled[id] === 0) {
        this.dX[id] += this.dVx[id] * dtS;
        this.dY[id] += this.dVy[id] * dtS;
        this.dRot[id] += this.dVrot[id] * dtS;

        let vz = this.dVz[id] - CASING_PHYSICS.GRAVITY_Z * dtS;
        let z = this.dZ[id] + vz * dtS;
        if (z <= 0) {
          z = 0;
          const bounces = this.dBounces[id] + 1;
          this.dBounces[id] = bounces;
          const kind = this.dKind[id];
          const isCasing = kind === DecalKind.CasingBrass || kind === DecalKind.CasingRed;

          if (bounces === 1 && this.degradedMsLeft <= 0) {
            this.spawnParticle(FxKind.Dust, this.dX[id], this.dY[id], {
              layer: FxLayer.World,
              prio: FxPrio.Low,
              colorIdx: FxColor.SandSpeck,
              vx: (this.nextRand() - 0.5) * 24,
              vy: -8 - this.nextRand() * 14,
              size: 6,
              sizeEnd: 10,
              lifeMs: 140,
            });
          }
          if (isCasing && this.onCasingBounce) {
            this.onCasingBounce(this.dX[id], this.dY[id], bounces);
          }

          if (
            bounces <= CASING_PHYSICS.MAX_BOUNCES &&
            Math.abs(vz) > CASING_PHYSICS.MIN_BOUNCE_VZ &&
            age < CASING_PHYSICS.MAX_AIR_MS
          ) {
            vz = Math.abs(vz) * CASING_PHYSICS.RESTITUTION_Z;
            this.dVx[id] *= CASING_PHYSICS.GROUND_FRICTION;
            this.dVy[id] *= CASING_PHYSICS.GROUND_FRICTION;
            this.dVrot[id] *= CASING_PHYSICS.SPIN_DAMP;
          } else {
            vz = 0;
            this.settleDecalAtIndex(i, id);
            continue;
          }
        } else if (age >= CASING_PHYSICS.MAX_AIR_MS) {
          this.dZ[id] = 0;
          this.dVz[id] = 0;
          this.settleDecalAtIndex(i, id);
          continue;
        }
        this.dZ[id] = z;
        this.dVz[id] = vz;
      } else {
        const life = this.dLifeMs[id];
        if (life > 0 && age >= life) {
          this.releaseDecalAtIndex(i, id);
        }
      }
    }

    // 3. Step floating damage/status text ring
    if (this.activeTextCount > 0) {
      for (let i = 0; i < TEXT_CAP; i++) {
        const slot = this.textSlots[i];
        if (slot.active === 0) continue;
        slot.ageMs += dtMs;
        if (slot.ageMs >= slot.lifeMs) {
          slot.active = 0;
          this.activeTextCount--;
          continue;
        }
        slot.x += slot.vx * dtS;
        slot.y += slot.vy * dtS;
        slot.vy += slot.gravity * dtS;
      }
    }
  }

  /**
   * Acquires a particle slot in O(1) (evicting up to 16 probed slots by priority/age
   * when full) and populates its SoA fields with zero heap allocations.
   */
  spawnParticle(kind: FxKind, x: number, y: number, opts?: SpawnFxOpts): number {
    const prio: FxPrio = opts?.prio ?? FxPrio.Med;

    // Frame-drop guard suppresses low-priority dust & chip spawns
    if (
      this.degradedMsLeft > 0 &&
      prio === FxPrio.Low &&
      (kind === FxKind.Dust || kind === FxKind.Chip)
    ) {
      this.droppedCount++;
      return -1;
    }

    const id = this.acquireParticleSlot(prio);
    if (id < 0) {
      this.droppedCount++;
      return -1;
    }

    const defaultLayer: FxLayer =
      opts?.layer ??
      (kind === FxKind.Ring
        ? FxLayer.GroundRing
        : kind === FxKind.Spark ||
            kind === FxKind.Muzzle ||
            kind === FxKind.Tracer ||
            kind === FxKind.Glow ||
            kind === FxKind.Ember ||
            kind === FxKind.Arc ||
            kind === FxKind.FirePuff
          ? FxLayer.Additive
          : FxLayer.World);

    this.pKind[id] = kind;
    this.pLayer[id] = defaultLayer;
    this.pPrio[id] = prio;
    this.pColorIdx[id] = (opts?.colorIdx ?? FxColor.White) & 31;
    this.pBounces[id] = 0;
    this.pMaxBounces[id] = opts?.maxBounces ?? (kind === FxKind.Chip || kind === FxKind.Shrapnel ? 1 : 0);

    this.pX[id] = x;
    this.pY[id] = y;
    this.pZ[id] = opts?.z ?? 0;
    this.pVx[id] = opts?.vx ?? 0;
    this.pVy[id] = opts?.vy ?? 0;
    this.pVz[id] = opts?.vz ?? 0;

    const size = opts?.size ?? 8;
    this.pSize[id] = size;
    this.pSizeEnd[id] = opts?.sizeEnd ?? size;
    this.pRot[id] = opts?.rot ?? 0;
    this.pVrot[id] = opts?.vrot ?? 0;
    this.pGravity[id] = opts?.gravity ?? 0;
    this.pDrag[id] = opts?.drag ?? 0;
    this.pAgeMs[id] = 0;
    this.pLifeMs[id] = Math.max(16, opts?.lifeMs ?? 240);
    this.pParamA[id] = opts?.paramA ?? 0;
    this.pParamB[id] = opts?.paramB ?? 0;

    return id;
  }

  /**
   * Emits preset particle/decal bursts using inline `xorshift32` PRNG and
   * automatic density throttling when active particles exceed `768`.
   */
  spawnBurst(
    preset: FxBurstPreset,
    x: number,
    y: number,
    ang = 0,
    scale = 1,
    opts?: SpawnBurstOpts,
  ): void {
    const highDensity = this.activeCount > HIGH_DENSITY_THRESHOLD;
    const lifeScale = highDensity ? 0.7 : 1;
    const s = scale > 0 ? scale : 1;

    switch (preset) {
      case 'muzzle': {
        const tint = opts?.colorIdx ?? FxColor.Gold;
        this.spawnParticle(FxKind.Muzzle, x, y, {
          layer: FxLayer.Additive,
          prio: FxPrio.High,
          colorIdx: tint,
          rot: ang + (this.nextRand() - 0.5) * 0.16,
          size: 32 * s,
          sizeEnd: 32 * s,
          lifeMs: 70,
        });
        this.spawnParticle(FxKind.Glow, x + Math.cos(ang) * 6, y + Math.sin(ang) * 6, {
          layer: FxLayer.Additive,
          prio: FxPrio.Med,
          colorIdx: tint,
          size: 42 * s,
          sizeEnd: 20 * s,
          lifeMs: 65 * lifeScale,
        });
        const sparkCount = 3;
        for (let i = 0; i < sparkCount; i++) {
          const a = ang + (this.nextRand() - 0.5) * 0.9;
          const spd = (110 + this.nextRand() * 90) * s;
          this.spawnParticle(FxKind.Spark, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.High,
            colorIdx: tint,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            size: 5 * s,
            sizeEnd: 2 * s,
            drag: 4.5,
            lifeMs: (120 + this.nextRand() * 50),
          });
        }
        const casingKind = opts?.casing ?? 'brass';
        if (casingKind !== 'none') {
          this.spawnCasing(
            casingKind,
            x - Math.cos(ang) * 10,
            y - Math.sin(ang) * 10,
            ang,
            opts?.shooterVx ?? 0,
            opts?.shooterVy ?? 0,
          );
        }
        break;
      }

      case 'impact': {
        const backAng = ang + Math.PI;
        const sparkN = highDensity ? 2 : 4;
        const dustN = highDensity ? 1 : 2;
        const col = opts?.colorIdx ?? FxColor.Gold;
        for (let i = 0; i < sparkN; i++) {
          const a = backAng + (this.nextRand() - 0.5) * 1.6;
          const spd = (110 + this.nextRand() * 130) * s;
          this.spawnParticle(FxKind.Spark, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.Med,
            colorIdx: col,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            size: 5 * s,
            sizeEnd: 2,
            drag: 5.0,
            lifeMs: (140 + this.nextRand() * 60) * lifeScale,
          });
        }
        for (let i = 0; i < dustN; i++) {
          const a = backAng + (this.nextRand() - 0.5) * 1.6;
          const spd = (24 + this.nextRand() * 36) * s;
          this.spawnParticle(FxKind.Dust, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Low,
            colorIdx: FxColor.Dust,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 10,
            size: 12 * s,
            sizeEnd: 20 * s,
            drag: 3.5,
            lifeMs: (180 + this.nextRand() * 40) * lifeScale,
          });
        }
        break;
      }

      case 'blood':
      case 'sap': {
        const isSap = preset === 'sap';
        const c1 = opts?.colorIdx ?? (isSap ? FxColor.Sap : FxColor.Blood);
        const c2 = isSap ? FxColor.SapDark : FxColor.BloodDark;
        const count = highDensity ? 3 : 6;
        for (let i = 0; i < count; i++) {
          const a = ang + (this.nextRand() - 0.5) * 1.4;
          const spd = (65 + this.nextRand() * 115) * s;
          this.spawnParticle(FxKind.Blood, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Med,
            colorIdx: (i & 1) === 0 ? c1 : c2,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            z: 8 + this.nextRand() * 10,
            vz: 65 + this.nextRand() * 85,
            gravity: 640,
            size: (3 + this.nextRand() * 2) * s,
            sizeEnd: 2 * s,
            lifeMs: (240 + this.nextRand() * 140) * lifeScale,
          });
        }
        this.spawnDecal(
          isSap ? DecalKind.SplatSap : DecalKind.SplatBlood,
          x,
          y,
          ang,
          0,
          { scale: s },
        );
        break;
      }

      case 'explosion': {
        const col = opts?.colorIdx ?? FxColor.Orange;
        this.spawnParticle(FxKind.Ring, x, y, {
          layer: FxLayer.GroundRing,
          prio: FxPrio.Critical,
          colorIdx: col,
          size: 14 * s,
          sizeEnd: 88 * s,
          lifeMs: 280,
        });
        this.spawnParticle(FxKind.Glow, x, y, {
          layer: FxLayer.Additive,
          prio: FxPrio.Critical,
          colorIdx: FxColor.Orange,
          size: 120 * s,
          sizeEnd: 48 * s,
          lifeMs: 220,
        });
        const fireN = highDensity ? 4 : 6;
        for (let i = 0; i < fireN; i++) {
          const a = (i * Math.PI * 2) / fireN + (this.nextRand() - 0.5) * 0.5;
          const spd = (35 + this.nextRand() * 70) * s;
          this.spawnParticle(FxKind.FirePuff, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.High,
            colorIdx: FxColor.Orange,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 10,
            size: (24 + this.nextRand() * 10) * s,
            sizeEnd: (38 + this.nextRand() * 12) * s,
            drag: 3.0,
            lifeMs: 280 + this.nextRand() * 140,
          });
        }
        const smokeN = highDensity ? 4 : 8;
        for (let i = 0; i < smokeN; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (20 + this.nextRand() * 65) * s;
          this.spawnParticle(FxKind.Smoke, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Med,
            colorIdx: FxColor.Smoke,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - (25 + this.nextRand() * 25),
            size: (20 + this.nextRand() * 8) * s,
            sizeEnd: (38 + this.nextRand() * 10) * s,
            drag: 2.2,
            lifeMs: (380 + this.nextRand() * 160) * lifeScale,
          });
        }
        const emberN = highDensity ? 6 : 10;
        for (let i = 0; i < emberN; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (90 + this.nextRand() * 160) * s;
          this.spawnParticle(FxKind.Ember, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.High,
            colorIdx: (i & 1) === 0 ? FxColor.HotGold : FxColor.Orange,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            z: 8,
            vz: 80 + this.nextRand() * 120,
            gravity: 340,
            drag: 1.8,
            size: 3 * s,
            sizeEnd: 2,
            lifeMs: 320 + this.nextRand() * 200,
          });
        }
        const shrapN = highDensity ? 4 : 8;
        for (let i = 0; i < shrapN; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (100 + this.nextRand() * 140) * s;
          this.spawnParticle(FxKind.Shrapnel, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Med,
            colorIdx: FxColor.Shrapnel,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            z: 10,
            vz: 90 + this.nextRand() * 80,
            gravity: 520,
            maxBounces: 1,
            size: 3 * s,
            sizeEnd: 3 * s,
            lifeMs: (340 + this.nextRand() * 140) * lifeScale,
          });
        }
        this.spawnDecal(s >= 1.2 ? DecalKind.CraterLg : DecalKind.CraterSm, x, y, ang, 0, {
          scale: s,
          lifeMs: CASING_PHYSICS.CRATER_TTL_MS,
        });
        this.spawnDecal(DecalKind.Scorch, x, y, ang, 0, {
          scale: s,
          lifeMs: CASING_PHYSICS.CRATER_TTL_MS,
        });
        break;
      }

      case 'stun': {
        const col = opts?.colorIdx ?? FxColor.Cyan;
        this.spawnParticle(FxKind.Ring, x, y, {
          layer: FxLayer.GroundRing,
          prio: FxPrio.Critical,
          colorIdx: col,
          size: 14 * s,
          sizeEnd: 112 * s,
          lifeMs: 320,
        });
        this.spawnParticle(FxKind.Glow, x, y, {
          layer: FxLayer.Additive,
          prio: FxPrio.Critical,
          colorIdx: col,
          size: 110 * s,
          sizeEnd: 40 * s,
          lifeMs: 220,
        });
        // 4 electric arcs
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI * 0.5) + (this.nextRand() - 0.5) * 0.6;
          const r = (48 + this.nextRand() * 34) * s;
          this.spawnParticle(FxKind.Arc, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.Critical,
            colorIdx: col,
            size: 3.5,
            sizeEnd: 1.5,
            lifeMs: 220,
            paramA: x + Math.cos(a) * r,
            paramB: y + Math.sin(a) * r,
          });
        }
        // 3 stun stars
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3;
          this.spawnParticle(FxKind.StunStar, x + Math.cos(a) * 10, y + Math.sin(a) * 5, {
            layer: FxLayer.World,
            prio: FxPrio.Critical,
            colorIdx: FxColor.Gold,
            vx: Math.cos(a) * 35 * s,
            vy: Math.sin(a) * 18 * s,
            z: 24,
            vz: 45 + this.nextRand() * 35,
            gravity: 160,
            size: 14 * s,
            sizeEnd: 12 * s,
            lifeMs: 1800,
          });
        }
        // Remaining budget up to MAX_STUN_BURST (7 sparks -> total 16)
        const sparkBudget = MAX_STUN_BURST - 9;
        for (let i = 0; i < sparkBudget; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (95 + this.nextRand() * 115) * s;
          this.spawnParticle(FxKind.Spark, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.High,
            colorIdx: col,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            size: 5 * s,
            sizeEnd: 2,
            drag: 4.5,
            lifeMs: 180 + this.nextRand() * 80,
          });
        }
        break;
      }

      case 'dash': {
        const dustN = highDensity ? 3 : 5;
        for (let i = 0; i < dustN; i++) {
          const a = ang + Math.PI + (this.nextRand() - 0.5) * 1.4;
          const spd = (24 + this.nextRand() * 44) * s;
          this.spawnParticle(FxKind.Dust, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Low,
            colorIdx: FxColor.Dust,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 6,
            size: 13 * s,
            sizeEnd: 22 * s,
            drag: 4.0,
            lifeMs: 240 * lifeScale,
          });
        }
        this.spawnParticle(FxKind.Ghost, x, y, {
          layer: FxLayer.World,
          prio: FxPrio.Med,
          colorIdx: opts?.colorIdx ?? FxColor.Cyan,
          rot: ang,
          size: 24 * s,
          sizeEnd: 24 * s,
          lifeMs: 180 * lifeScale,
        });
        break;
      }

      case 'crate': {
        const chipN = highDensity ? 3 : 6;
        const dustN = highDensity ? 2 : 4;
        const chipCol = opts?.colorIdx ?? FxColor.WoodChip;
        for (let i = 0; i < chipN; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (55 + this.nextRand() * 90) * s;
          this.spawnParticle(FxKind.Chip, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Low,
            colorIdx: chipCol,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            z: 12 + this.nextRand() * 12,
            vz: 95 + this.nextRand() * 70,
            gravity: 680,
            maxBounces: 1,
            size: 4 * s,
            sizeEnd: 4 * s,
            lifeMs: (320 + this.nextRand() * 160) * lifeScale,
          });
        }
        for (let i = 0; i < dustN; i++) {
          const a = this.nextRand() * Math.PI * 2;
          const spd = (20 + this.nextRand() * 38) * s;
          this.spawnParticle(FxKind.Dust, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Low,
            colorIdx: FxColor.Dust,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 8,
            size: 16 * s,
            sizeEnd: 28 * s,
            drag: 3.0,
            lifeMs: (280 + this.nextRand() * 80) * lifeScale,
          });
        }
        this.spawnDecal(DecalKind.Rubble, x, y, ang, 0, { scale: s, colorIdx: chipCol });
        break;
      }

      case 'smoke': {
        const n = highDensity ? 3 : 6;
        for (let i = 0; i < n; i++) {
          this.spawnParticle(FxKind.Smoke, x + (this.nextRand() - 0.5) * 14, y, {
            layer: FxLayer.World,
            prio: FxPrio.Med,
            colorIdx: opts?.colorIdx ?? FxColor.Smoke,
            vx: (this.nextRand() - 0.5) * 28,
            vy: -24 - this.nextRand() * 26,
            size: 16 * s,
            sizeEnd: 32 * s,
            drag: 1.5,
            lifeMs: (420 + this.nextRand() * 200) * lifeScale,
          });
        }
        break;
      }

      case 'sparks': {
        const n = highDensity ? 4 : 8;
        const col = opts?.colorIdx ?? FxColor.Gold;
        for (let i = 0; i < n; i++) {
          const a = ang + (this.nextRand() - 0.5) * 1.8;
          const spd = (100 + this.nextRand() * 150) * s;
          this.spawnParticle(FxKind.Spark, x, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.High,
            colorIdx: col,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            size: 5 * s,
            sizeEnd: 2,
            drag: 4.5,
            lifeMs: 160 + this.nextRand() * 90,
          });
        }
        break;
      }

      case 'dust': {
        const n = highDensity ? 3 : 5;
        for (let i = 0; i < n; i++) {
          const a = ang + (this.nextRand() - 0.5) * Math.PI * 2;
          const spd = (18 + this.nextRand() * 42) * s;
          this.spawnParticle(FxKind.Dust, x, y, {
            layer: FxLayer.World,
            prio: FxPrio.Low,
            colorIdx: opts?.colorIdx ?? FxColor.Dust,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd - 6,
            size: 12 * s,
            sizeEnd: 22 * s,
            drag: 3.5,
            lifeMs: (220 + this.nextRand() * 90) * lifeScale,
          });
        }
        break;
      }

      case 'ember': {
        const n = highDensity ? 4 : 8;
        const col = opts?.colorIdx ?? FxColor.Ember;
        for (let i = 0; i < n; i++) {
          this.spawnParticle(FxKind.Ember, x + (this.nextRand() - 0.5) * 12, y, {
            layer: FxLayer.Additive,
            prio: FxPrio.Med,
            colorIdx: col,
            vx: (this.nextRand() - 0.5) * 44 * s,
            vy: (-20 - this.nextRand() * 48) * s,
            z: 4,
            vz: 40 + this.nextRand() * 60,
            gravity: 90,
            size: 3 * s,
            sizeEnd: 1.5,
            lifeMs: (360 + this.nextRand() * 240) * lifeScale,
          });
        }
        break;
      }
    }
  }

  /**
   * Spawns a 2.5D bouncing decal (such as a brass/red shell casing) or immediately
   * bakes a static ground decal (`Crater*`, `Scorch`, `Splat*`, `Rubble`) into the
   * 512x512 chunk cache when settled.
   */
  spawnDecal(
    kind: DecalKind,
    x: number,
    y: number,
    angle = 0,
    z = 0,
    opts?: SpawnDecalOpts,
  ): number {
    const vz = opts?.vz ?? 0;
    const vx = opts?.vx ?? 0;
    const vy = opts?.vy ?? 0;
    const scale = opts?.scale ?? 1;
    const lifeMs = opts?.lifeMs ?? 0;
    const seed = opts?.seed ?? this.nextSeed();
    const colorIdx =
      opts?.colorIdx ??
      (kind === DecalKind.CasingRed
        ? FxColor.ShotgunRed
        : kind === DecalKind.CasingBrass
          ? FxColor.Brass
          : kind === DecalKind.SplatBlood
            ? FxColor.BloodDark
            : kind === DecalKind.SplatSap || kind === DecalKind.SplatSlime
              ? FxColor.SapDark
              : kind === DecalKind.SplatOil
                ? FxColor.Smoke
                : FxColor.Sand);

    const airborne =
      z > 0 ||
      vz !== 0 ||
      vx !== 0 ||
      vy !== 0 ||
      kind === DecalKind.CasingBrass ||
      kind === DecalKind.CasingRed;

    const tempBlast = isTemporaryBlastDecal(kind);
    // Static decals with infinite life bake directly to 512x512 chunks if possible;
    // explosion craters/scorch marks stay transient and disappear after 5s.
    if (!airborne && lifeMs <= 0 && !tempBlast) {
      if (this.bakeDecalToChunks(kind, x, y, angle, scale, colorIdx, seed)) {
        this.bakedDecalCount++;
        return -1;
      }
    }

    const id = this.acquireDecalSlot();
    this.dActive[id] = 1;
    this.dKind[id] = kind;
    this.dSettled[id] = airborne ? 0 : 1;
    this.dBounces[id] = 0;
    this.dColorIdx[id] = colorIdx & 31;
    this.dX[id] = x;
    this.dY[id] = y;
    this.dZ[id] = z > 0 ? z : airborne ? CASING_PHYSICS.EJECT_Z : 0;
    this.dVx[id] = vx;
    this.dVy[id] = vy;
    this.dVz[id] = vz;
    this.dRot[id] = angle;
    this.dVrot[id] = opts?.vrot ?? 0;
    this.dScale[id] = scale;
    this.dAgeMs[id] = 0;
    this.dLifeMs[id] =
      lifeMs > 0
        ? lifeMs
        : tempBlast
          ? CASING_PHYSICS.CRATER_TTL_MS
          : CASING_PHYSICS.SETTLED_TTL_MS;
    this.dSeed[id] = seed;

    return id;
  }

  /**
   * Ejects a 2.5D spinning brass pistol/rifle shell or red shotgun hull
   * perpendicular to `aimRad` (zero network bandwidth, local cosmetic physics).
   */
  spawnCasing(
    kind: 'brass' | 'shell',
    x: number,
    y: number,
    aimRad: number,
    shooterVx = 0,
    shooterVy = 0,
  ): number {
    const ejectSide = Math.cos(aimRad) >= 0 ? -1 : 1;
    const ejAng = aimRad + ejectSide * (Math.PI * 0.52 + (this.nextRand() - 0.5) * 0.44);
    const speedH = 75 + this.nextRand() * 55;
    return this.spawnDecal(
      kind === 'shell' ? DecalKind.CasingRed : DecalKind.CasingBrass,
      x,
      y,
      this.nextRand() * 4,
      CASING_PHYSICS.EJECT_Z,
      {
        vx: Math.cos(ejAng) * speedH + shooterVx * 0.35,
        vy: Math.sin(ejAng) * speedH * 0.8 + shooterVy * 0.35,
        vz: 110 + this.nextRand() * 55,
        vrot: (14 + this.nextRand() * 12) * ejectSide,
        scale: 1,
      },
    );
  }

  /** Spawns a pooled outlined text slot (ring-overwrites oldest when full). */
  spawnText(
    text: string,
    x: number,
    y: number,
    colorIdx: number = FxColor.White,
    scale = 1,
  ): number {
    const idx = this.acquireTextSlot();
    const slot = this.textSlots[idx];
    if (slot.active === 0) {
      this.activeTextCount++;
    }
    slot.active = 1;
    slot.x = x;
    slot.y = y;
    slot.vx = (this.nextRand() - 0.5) * 40;
    slot.vy = -115;
    slot.gravity = 420;
    slot.ageMs = 0;
    slot.lifeMs = 680;
    slot.colorIdx = colorIdx & 31;
    slot.scale = scale;
    slot.text = text;
    return idx;
  }

  /**
   * Spawns a zero-GC outlined damage or heal number using pre-interned strings
   * and `shared/src/bansung` `BANSUNG_DMG_*` bitflags.
   */
  spawnDamageNumber(
    amount: number,
    x: number,
    y: number,
    dmgFlags = 0,
    isPlayerHit = false,
  ): number {
    const rounded = Math.round(Math.abs(amount));
    const isHeal = (dmgFlags & BANSUNG_DMG_HEAL) !== 0;
    const isCrit = (dmgFlags & BANSUNG_DMG_CRIT) !== 0;

    let text: string;
    if (rounded <= INTERN_NUM_MAX) {
      text = isHeal
        ? INTERN_POS[rounded]
        : isCrit
          ? INTERN_CRIT[rounded]
          : INTERN_NEG[rounded];
    } else {
      text = (isHeal ? '+' : '-') + String(rounded) + (isCrit ? '!' : '');
    }

    let colorIdx: number = FxColor.White;
    let scale = 1;
    if (isHeal) {
      colorIdx = FxColor.Heal;
    } else if (isCrit) {
      colorIdx = FxColor.Gold;
      scale = 1.35;
    } else if (isPlayerHit) {
      colorIdx = FxColor.HitRed;
    } else if ((dmgFlags & BANSUNG_DMG_SHOCK) !== 0 || (dmgFlags & BANSUNG_DMG_STUN) !== 0) {
      colorIdx = FxColor.Cyan;
    } else if ((dmgFlags & BANSUNG_DMG_BURN) !== 0) {
      colorIdx = FxColor.Orange;
    } else if ((dmgFlags & BANSUNG_DMG_ARMOR) !== 0) {
      colorIdx = FxColor.Shield;
    }

    return this.spawnText(text, x, y, colorIdx, scale);
  }

  /** Draws visible 512x512 baked decal chunks and any settled fallback decals. */
  drawDecals(
    ctx: CanvasRenderingContext2D,
    vx0: number,
    vy0: number,
    vx1: number,
    vy1: number,
  ): void {
    this.airborneDrawnThisFrame = false;
    const cx0 = Math.max(0, Math.floor(vx0 / DECAL_CHUNK_SIZE));
    const cx1 = Math.min(this.gridCols - 1, Math.floor(vx1 / DECAL_CHUNK_SIZE));
    const cy0 = Math.max(0, Math.floor(vy0 / DECAL_CHUNK_SIZE));
    const cy1 = Math.min(this.gridRows - 1, Math.floor(vy1 / DECAL_CHUNK_SIZE));

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const slot = this.lookupChunkSlot(cx, cy);
        if (slot < 0 || this.chunkDirty[slot] === 0) continue;
        this.chunkLastUsed[slot] = ++this.chunkAccessStamp;
        const canvas = this.chunkCanvases[slot];
        if (canvas) {
          ctx.drawImage(canvas, cx * DECAL_CHUNK_SIZE, cy * DECAL_CHUNK_SIZE);
        }
      }
    }

    // Draw any unbaked/fallback settled decals in the 384-slot pool
    if (this.activeDecalCount > 0) {
      const minX = vx0 - VIEWPORT_CULL_PAD;
      const maxX = vx1 + VIEWPORT_CULL_PAD;
      const minY = vy0 - VIEWPORT_CULL_PAD;
      const maxY = vy1 + VIEWPORT_CULL_PAD;
      const atlas = this.getAtlas();
      const prevAlpha = ctx.globalAlpha;
      let lastAlpha = -1;

      for (let i = 0; i < this.activeDecalCount; i++) {
        const id = this.dActiveIds[i];
        if (this.dSettled[id] === 0) continue;
        const x = this.dX[id];
        const y = this.dY[id];
        if (x < minX || x > maxX || y < minY || y > maxY) continue;

        const kind = this.dKind[id] as DecalKind;
        const life = this.dLifeMs[id];
        const age = this.dAgeMs[id];
        const fadeWindow = isTemporaryBlastDecal(kind)
          ? CASING_PHYSICS.CRATER_FADE_MS
          : CASING_PHYSICS.SETTLED_FADE_MS;
        const fadeStart = life - fadeWindow;
        const rawAlpha =
          life > 0 && age > fadeStart
            ? Math.max(0, (life - age) / fadeWindow)
            : 1;
        const alpha = ((rawAlpha * 20 + 0.5) | 0) * 0.05;
        if (alpha < 0.04) continue;
        if (alpha !== lastAlpha) {
          ctx.globalAlpha = alpha;
          lastAlpha = alpha;
        }
        this.stampDecalToContext(
          ctx,
          atlas,
          kind,
          x,
          y,
          this.dRot[id],
          this.dScale[id],
          this.dColorIdx[id],
          this.dSeed[id],
        );
      }

      if (lastAlpha !== -1) {
        ctx.globalAlpha = prevAlpha;
      }
    }

    ctx.imageSmoothingEnabled = prevSmooth;
  }

  /**
   * Draws airborne bouncing 2.5D shell casings/debris with ground contact shadows.
   * Safe to call explicitly during the Y-sorted entity pass; if not called explicitly,
   * `drawLayer(FxLayer.World, ...)` renders airborne casings automatically.
   */
  drawAirborneDecals(
    ctx: CanvasRenderingContext2D,
    vx0: number,
    vy0: number,
    vx1: number,
    vy1: number,
  ): void {
    this.airborneDrawnThisFrame = true;
    if (this.activeDecalCount === 0) return;

    const minX = vx0 - VIEWPORT_CULL_PAD;
    const maxX = vx1 + VIEWPORT_CULL_PAD;
    const minY = vy0 - VIEWPORT_CULL_PAD;
    const maxY = vy1 + VIEWPORT_CULL_PAD;
    const atlas = this.getAtlas();
    const prevSmooth = ctx.imageSmoothingEnabled;
    const prevAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    let lastAlpha = -1;

    for (let i = 0; i < this.activeDecalCount; i++) {
      const id = this.dActiveIds[i];
      if (this.dSettled[id] !== 0) continue;
      const x = this.dX[id];
      const y = this.dY[id];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const z = this.dZ[id];
      const kind = this.dKind[id];
      const rx = Math.round(x);
      const ry = Math.round(y);

      // Ground shadow at (x, y)
      const sAlpha = Math.max(SHADOW_MIN_ALPHA, SHADOW_BASE_ALPHA - z * 0.008);
      const qSAlpha = ((sAlpha * 20 + 0.5) | 0) * 0.05;
      if (qSAlpha !== lastAlpha) {
        ctx.globalAlpha = qSAlpha;
        lastAlpha = qSAlpha;
      }
      ctx.fillStyle = FX_PALETTE[FxColor.Soot];
      ctx.fillRect(rx - 3, ry - 1, 6, 2);

      // Elevated casing/debris sprite at (x, y - z)
      if (lastAlpha !== 1) {
        ctx.globalAlpha = 1;
        lastAlpha = 1;
      }
      const dy = Math.round(y - z);
      if (atlas && (kind === DecalKind.CasingBrass || kind === DecalKind.CasingRed)) {
        const frame = ((Math.floor(this.dRot[id]) % 4) + 4) & 3;
        const sy =
          kind === DecalKind.CasingRed
            ? ATLAS_CELLS.casingRedY
            : ATLAS_CELLS.casingBrassY;
        ctx.drawImage(atlas, 224 + frame * 8, sy, 8, 8, rx - 4, dy - 4, 8, 8);
      } else {
        this.stampDecalToContext(
          ctx,
          atlas,
          kind as DecalKind,
          rx,
          dy,
          this.dRot[id],
          this.dScale[id],
          this.dColorIdx[id],
          this.dSeed[id],
        );
      }
    }

    if (lastAlpha !== -1) {
      ctx.globalAlpha = prevAlpha;
    }
    ctx.imageSmoothingEnabled = prevSmooth;
  }

  /** Renders all visible particles assigned to `layer` with minimal state switches. */
  drawLayer(
    ctx: CanvasRenderingContext2D,
    layer: FxLayer,
    vx0: number,
    vy0: number,
    vx1: number,
    vy1: number,
    _now?: number,
  ): void {
    if (layer === FxLayer.World && !this.airborneDrawnThisFrame && this.activeDecalCount > 0) {
      this.drawAirborneDecals(ctx, vx0, vy0, vx1, vy1);
    }

    if (this.activeCount === 0) return;

    const minX = vx0 - VIEWPORT_CULL_PAD;
    const maxX = vx1 + VIEWPORT_CULL_PAD;
    const minY = vy0 - VIEWPORT_CULL_PAD;
    const maxY = vy1 + VIEWPORT_CULL_PAD;
    const atlas = this.getAtlas();

    const prevSmooth = ctx.imageSmoothingEnabled;
    const prevAlpha = ctx.globalAlpha;
    const prevComp = ctx.globalCompositeOperation;
    const prevCap = ctx.lineCap;
    const prevJoin = ctx.lineJoin;
    const prevFill = ctx.fillStyle;
    const prevStroke = ctx.strokeStyle;
    const prevLineW = ctx.lineWidth;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation =
      layer === FxLayer.Additive && this.degradedMsLeft <= 0 ? 'lighter' : 'source-over';

    let lastAlpha = -1;

    for (let i = 0; i < this.activeCount; i++) {
      const id = this.pActiveIds[i];
      if (this.pLayer[id] !== layer) continue;

      const x = this.pX[id];
      const y = this.pY[id];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const life = this.pLifeMs[id];
      const age = this.pAgeMs[id];
      const u = age >= life ? 1 : age / life;
      const kind = this.pKind[id];

      // Stepped pixel cadence for animated sprite cells; smooth fade near tail
      let rawAlpha: number;
      if (kind === FxKind.Dust || kind === FxKind.Smoke || kind === FxKind.FirePuff) {
        rawAlpha = u < 0.72 ? 0.9 : Math.max(0, (1 - u) / 0.28);
      } else if (kind === FxKind.Ghost) {
        rawAlpha = 0.45 * (1 - u);
      } else if (kind === FxKind.Glow) {
        rawAlpha = 0.6 * (1 - u);
      } else {
        rawAlpha = 1 - u * u;
      }

      const alpha = ((rawAlpha * 20 + 0.5) | 0) * 0.05;
      if (alpha < 0.04) continue;
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }

      const z = this.pZ[id];
      const drawY = y - z;
      const curSize = this.pSize[id] + (this.pSizeEnd[id] - this.pSize[id]) * u;
      const colHex = FX_PALETTE[this.pColorIdx[id]];

      switch (kind) {
        case FxKind.Dust: {
          if (atlas) {
            const frame = Math.min(3, (u * 4) | 0);
            const half = curSize * 0.5;
            ctx.drawImage(
              atlas,
              ATLAS_CELLS.dustX + frame * 32,
              ATLAS_CELLS.dustY,
              32,
              32,
              Math.round(x - half),
              Math.round(drawY - half),
              Math.round(curSize),
              Math.round(curSize),
            );
          } else {
            ctx.fillStyle = colHex;
            ctx.fillRect(Math.round(x - curSize * 0.3), Math.round(drawY - curSize * 0.3), Math.round(curSize * 0.6), Math.round(curSize * 0.6));
          }
          break;
        }

        case FxKind.Smoke: {
          if (atlas) {
            const frame = Math.min(3, (u * 4) | 0);
            const half = curSize * 0.5;
            ctx.drawImage(
              atlas,
              ATLAS_CELLS.smokeX + frame * 32,
              ATLAS_CELLS.smokeY,
              32,
              32,
              Math.round(x - half),
              Math.round(drawY - half),
              Math.round(curSize),
              Math.round(curSize),
            );
          } else {
            ctx.fillStyle = colHex;
            ctx.fillRect(Math.round(x - curSize * 0.35), Math.round(drawY - curSize * 0.35), Math.round(curSize * 0.7), Math.round(curSize * 0.7));
          }
          break;
        }

        case FxKind.FirePuff: {
          if (atlas) {
            const frame = Math.min(3, (u * 4) | 0);
            const half = curSize * 0.5;
            ctx.drawImage(
              atlas,
              ATLAS_CELLS.fireX + frame * 32,
              ATLAS_CELLS.fireY,
              32,
              32,
              Math.round(x - half),
              Math.round(drawY - half),
              Math.round(curSize),
              Math.round(curSize),
            );
          } else {
            ctx.fillStyle = colHex;
            ctx.fillRect(Math.round(x - curSize * 0.4), Math.round(drawY - curSize * 0.4), Math.round(curSize * 0.8), Math.round(curSize * 0.8));
          }
          break;
        }

        case FxKind.Muzzle: {
          if (atlas) {
            const frame = Math.min(2, (u * 3) | 0);
            const scale = curSize / 32;
            ctx.save();
            ctx.translate(Math.round(x), Math.round(drawY));
            ctx.rotate(this.pRot[id]);
            ctx.drawImage(
              atlas,
              ATLAS_CELLS.muzzleX + frame * 32,
              ATLAS_CELLS.muzzleY,
              32,
              32,
              -4 * scale,
              -16 * scale,
              32 * scale,
              32 * scale,
            );
            ctx.restore();
          }
          break;
        }

        case FxKind.Glow: {
          if (atlas) {
            const gCell = selectGlowCell(this.pColorIdx[id]);
            const half = curSize * 0.5;
            ctx.drawImage(
              atlas,
              gCell.x,
              gCell.y,
              gCell.w,
              gCell.h,
              Math.round(x - half),
              Math.round(drawY - half),
              Math.round(curSize),
              Math.round(curSize),
            );
          }
          break;
        }

        case FxKind.Spark: {
          const vx = this.pVx[id];
          const vy = this.pVy[id];
          ctx.strokeStyle = colHex;
          ctx.lineWidth = curSize > 2.5 ? 2 : 1.5;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(x, drawY);
          ctx.lineTo(x - vx * 0.028, drawY - vy * 0.028);
          ctx.stroke();

          if (atlas && curSize >= 4) {
            const sCell = selectSparkCell(this.pColorIdx[id]);
            const ds = Math.round(curSize * 1.6);
            ctx.drawImage(
              atlas,
              sCell.x,
              sCell.y,
              sCell.w,
              sCell.h,
              Math.round(x - ds * 0.5),
              Math.round(drawY - ds * 0.5),
              ds,
              ds,
            );
          } else {
            ctx.fillStyle = FX_PALETTE[FxColor.White];
            ctx.fillRect(Math.round(x - 1), Math.round(drawY - 1), 2, 2);
          }
          break;
        }

        case FxKind.Tracer: {
          const tx =
            this.pParamA[id] !== 0 || this.pParamB[id] !== 0
              ? this.pParamA[id]
              : x - this.pVx[id] * 0.032;
          const ty =
            this.pParamA[id] !== 0 || this.pParamB[id] !== 0
              ? this.pParamB[id]
              : drawY - this.pVy[id] * 0.032;
          ctx.strokeStyle = colHex;
          ctx.lineWidth = curSize;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(x, drawY);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          ctx.strokeStyle = FX_PALETTE[FxColor.White];
          ctx.lineWidth = Math.max(1, curSize * 0.45);
          ctx.beginPath();
          ctx.moveTo(x, drawY);
          ctx.lineTo((x + tx) * 0.5, (drawY + ty) * 0.5);
          ctx.stroke();
          break;
        }

        case FxKind.Ember: {
          const px = Math.round(x);
          const py = Math.round(drawY);
          const sz = Math.max(2, Math.round(curSize));
          const blink = ((age / 60) | 0) & 1;
          ctx.fillStyle = blink === 0 ? colHex : FX_PALETTE[FxColor.HotGold];
          ctx.fillRect(px - (sz >> 1), py - (sz >> 1), sz, sz);
          if (u < 0.45) {
            ctx.fillStyle = FX_PALETTE[FxColor.White];
            ctx.fillRect(px, py, 1, 1);
          }
          break;
        }

        case FxKind.Ring: {
          const r = curSize > 1 ? curSize : 1;
          ctx.strokeStyle = colHex;
          ctx.lineWidth = Math.max(1.5, 4 * (1 - u));
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * RING_Y_ASPECT, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case FxKind.Arc: {
          const x2 = this.pParamA[id];
          const y2 = this.pParamB[id];
          const dx = x2 - x;
          const dy = y2 - y;
          const len = Math.hypot(dx, dy);
          if (len < 1) break;
          const nx = -dy / len;
          const ny = dx / len;
          let seed = (((age / 45) | 0) * 1664525 + id * 1013904223) >>> 0;
          const jitter = Math.min(11, Math.max(4, len * 0.14));

          seed = (seed * 1664525 + 1013904223) >>> 0;
          const o1 = ((seed / 4294967296) - 0.5) * 2 * jitter;
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const o2 = ((seed / 4294967296) - 0.5) * 2 * jitter;

          const mx1 = x + dx * 0.33 + nx * o1;
          const my1 = drawY + dy * 0.33 + ny * o1;
          const mx2 = x + dx * 0.67 + nx * o2;
          const my2 = drawY + dy * 0.67 + ny * o2;

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = colHex;
          ctx.lineWidth = Math.max(1.5, curSize);
          ctx.beginPath();
          ctx.moveTo(x, drawY);
          ctx.lineTo(mx1, my1);
          ctx.lineTo(mx2, my2);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          ctx.strokeStyle = FX_PALETTE[FxColor.ElectricCore];
          ctx.lineWidth = Math.max(1, curSize * 0.42);
          ctx.stroke();
          break;
        }

        case FxKind.StunStar: {
          if (atlas) {
            const frame = ((age / 140) | 0) & 1;
            const half = curSize * 0.5;
            ctx.drawImage(
              atlas,
              ATLAS_CELLS.starX + frame * 16,
              ATLAS_CELLS.starY,
              16,
              16,
              Math.round(x - half),
              Math.round(drawY - half),
              Math.round(curSize),
              Math.round(curSize),
            );
          } else {
            ctx.fillStyle = FX_PALETTE[FxColor.Gold];
            ctx.fillRect(Math.round(x - 3), Math.round(drawY - 3), 6, 6);
          }
          break;
        }

        case FxKind.Chip:
        case FxKind.Shrapnel: {
          const rx = Math.round(x);
          const ry = Math.round(y);
          const py = Math.round(drawY);
          const sz = Math.max(2, Math.round(curSize));
          if (z > 1) {
            ctx.fillStyle = FX_PALETTE[FxColor.Soot];
            ctx.fillRect(rx - 2, ry - 1, 4, 2);
          }
          ctx.fillStyle = FX_PALETTE[FxColor.Outline];
          ctx.fillRect(rx - (sz >> 1) - 1, py - (sz >> 1) - 1, sz + 2, sz + 2);
          ctx.fillStyle = colHex;
          ctx.fillRect(rx - (sz >> 1), py - (sz >> 1), sz, sz);
          break;
        }

        case FxKind.Blood: {
          const rx = Math.round(x);
          const ry = Math.round(y);
          const py = Math.round(drawY);
          const sz = Math.max(2, Math.round(curSize));
          if (z > 1) {
            ctx.fillStyle = FX_PALETTE[FxColor.Soot];
            ctx.fillRect(rx - 2, ry - 1, 4, 2);
          }
          ctx.fillStyle = FX_PALETTE[FxColor.Outline];
          ctx.fillRect(rx - (sz >> 1) - 1, py - (sz >> 1) - 1, sz + 2, sz + 2);
          ctx.fillStyle = colHex;
          ctx.fillRect(rx - (sz >> 1), py - (sz >> 1), sz, sz);
          if (sz >= 3) {
            ctx.fillStyle = FX_PALETTE[FxColor.White];
            ctx.fillRect(rx - (sz >> 1), py - (sz >> 1), 1, 1);
          }
          break;
        }

        case FxKind.Ghost: {
          const rx = Math.round(x);
          const ry = Math.round(drawY);
          const w = Math.max(8, Math.round(curSize * 0.55));
          const h = Math.max(12, Math.round(curSize));
          ctx.fillStyle = colHex;
          ctx.fillRect(rx - (w >> 1), ry - h, w, h);
          ctx.fillStyle = FX_PALETTE[FxColor.White];
          ctx.fillRect(rx - (w >> 2), ry - h + 2, Math.max(2, w >> 1), Math.max(4, h >> 2));
          break;
        }
      }
    }

    if (lastAlpha !== -1) {
      ctx.globalAlpha = prevAlpha;
    }
    if (ctx.globalCompositeOperation !== prevComp) {
      ctx.globalCompositeOperation = prevComp;
    }
    ctx.lineCap = prevCap;
    ctx.lineJoin = prevJoin;
    ctx.fillStyle = prevFill;
    ctx.strokeStyle = prevStroke;
    ctx.lineWidth = prevLineW;
    ctx.imageSmoothingEnabled = prevSmooth;
  }

  /** Renders all active floating damage & status numbers with crisp dark outlines. */
  drawTexts(
    ctx: CanvasRenderingContext2D,
    vx0: number,
    vy0: number,
    vx1: number,
    vy1: number,
  ): void {
    if (this.activeTextCount === 0) return;

    const minX = vx0 - VIEWPORT_CULL_PAD;
    const maxX = vx1 + VIEWPORT_CULL_PAD;
    const minY = vy0 - VIEWPORT_CULL_PAD;
    const maxY = vy1 + VIEWPORT_CULL_PAD;

    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBase = ctx.textBaseline;
    const prevJoin = ctx.lineJoin;
    const prevLineW = ctx.lineWidth;
    const prevStroke = ctx.strokeStyle;
    const prevFill = ctx.fillStyle;
    const prevAlpha = ctx.globalAlpha;

    ctx.font = '900 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = FX_PALETTE[FxColor.Outline];

    let lastAlpha = -1;

    for (let i = 0; i < TEXT_CAP; i++) {
      const slot = this.textSlots[i];
      if (slot.active === 0) continue;
      if (slot.x < minX || slot.x > maxX || slot.y < minY || slot.y > maxY) continue;

      const u = slot.ageMs / slot.lifeMs;
      const rawAlpha = u > 1 - TEXT_FADE_RATIO ? Math.max(0, (1 - u) / TEXT_FADE_RATIO) : 1;
      const alpha = ((rawAlpha * 20 + 0.5) | 0) * 0.05;
      if (alpha < 0.04) continue;

      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha;
        lastAlpha = alpha;
      }

      const pop = slot.ageMs < 90 ? 1.35 : 1;
      const effScale = slot.scale * pop;
      const rx = Math.round(slot.x);
      const ry = Math.round(slot.y);
      ctx.fillStyle = FX_PALETTE[slot.colorIdx];

      if (effScale !== 1) {
        ctx.save();
        ctx.translate(rx, ry);
        ctx.scale(effScale, effScale);
        ctx.strokeText(slot.text, 0, 0);
        ctx.fillText(slot.text, 0, 0);
        ctx.restore();
      } else {
        ctx.strokeText(slot.text, rx, ry);
        ctx.fillText(slot.text, rx, ry);
      }
    }

    ctx.globalAlpha = prevAlpha;
    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBase;
    ctx.lineJoin = prevJoin;
    ctx.lineWidth = prevLineW;
    ctx.strokeStyle = prevStroke;
    ctx.fillStyle = prevFill;
  }

  /** Returns live pool utilization and throttle counters without allocations. */
  stats(): FxStats {
    return {
      activeParticles: this.activeCount,
      activeDecals: this.activeDecalCount,
      activeTexts: this.activeTextCount,
      dropped: this.droppedCount,
      bakedDecals: this.bakedDecalCount,
      chunkCount: this.chunkCount,
      degraded: this.degradedMsLeft > 0,
    };
  }

  // --------------------------------------------------------------------------
  // Internal Zero-GC Pool & Chunk Helpers
  // --------------------------------------------------------------------------

  private nextRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return (x >>> 0) / 4294967296;
  }

  private nextSeed(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return x >>> 0;
  }

  private acquireParticleSlot(reqPrio: FxPrio): number {
    if (this.freeTop >= 0) {
      const id = this.pFreeStack[this.freeTop--];
      this.pActiveIds[this.activeCount++] = id;
      return id;
    }

    if (this.activeCount === 0) return -1;
    let bestId = -1;
    let bestPrio = 255;
    let bestAgeRatio = -1;

    const len = this.activeCount;
    let cursor = this.evictCursor % len;
    const probeMax = len < EVICT_PROBE_COUNT ? len : EVICT_PROBE_COUNT;

    for (let k = 0; k < probeMax; k++) {
      const candId = this.pActiveIds[cursor];
      const candPrio = this.pPrio[candId];
      if (candPrio <= reqPrio) {
        const ratio = this.pAgeMs[candId] / this.pLifeMs[candId];
        if (candPrio < bestPrio || (candPrio === bestPrio && ratio > bestAgeRatio)) {
          bestId = candId;
          bestPrio = candPrio;
          bestAgeRatio = ratio;
        }
      }
      cursor++;
      if (cursor >= len) cursor = 0;
    }

    this.evictCursor = cursor;
    return bestId;
  }

  private acquireDecalSlot(): number {
    if (this.decalFreeTop >= 0) {
      const id = this.dFreeStack[this.decalFreeTop--];
      this.dActiveIds[this.activeDecalCount++] = id;
      return id;
    }

    // Full path: probe up to 24 slots, preferring already-settled oldest decal
    const len = this.activeDecalCount;
    let cursor = this.decalEvictCursor % len;
    const probeMax = len < DECAL_EVICT_PROBE ? len : DECAL_EVICT_PROBE;
    let bestId = this.dActiveIds[cursor];
    let bestSettled = -1;
    let bestAge = -1;

    for (let k = 0; k < probeMax; k++) {
      const candId = this.dActiveIds[cursor];
      const settled = this.dSettled[candId];
      const age = this.dAgeMs[candId];
      if (settled > bestSettled || (settled === bestSettled && age > bestAge)) {
        bestId = candId;
        bestSettled = settled;
        bestAge = age;
      }
      cursor++;
      if (cursor >= len) cursor = 0;
    }

    this.decalEvictCursor = cursor;
    return bestId;
  }

  private acquireTextSlot(): number {
    for (let i = 0; i < TEXT_CAP; i++) {
      const idx = (this.textCursor + i) % TEXT_CAP;
      if (this.textSlots[idx].active === 0) {
        this.textCursor = (idx + 1) % TEXT_CAP;
        return idx;
      }
    }
    const idx = this.textCursor;
    this.textCursor = (this.textCursor + 1) % TEXT_CAP;
    return idx;
  }

  private releaseDecalAtIndex(activeIdx: number, id: number): void {
    this.dActive[id] = 0;
    this.dActiveIds[activeIdx] = this.dActiveIds[--this.activeDecalCount];
    this.dFreeStack[++this.decalFreeTop] = id;
  }

  private settleDecalAtIndex(activeIdx: number, id: number): void {
    const kind = this.dKind[id] as DecalKind;
    const baked =
      !isTemporaryBlastDecal(kind) &&
      this.bakeDecalToChunks(
        kind,
        this.dX[id],
        this.dY[id],
        this.dRot[id],
        this.dScale[id],
        this.dColorIdx[id],
        this.dSeed[id],
      );
    if (baked) {
      this.bakedDecalCount++;
      this.releaseDecalAtIndex(activeIdx, id);
    } else {
      // Fallback: keep as settled decal in the 384-slot circular buffer
      this.dSettled[id] = 1;
      this.dVx[id] = 0;
      this.dVy[id] = 0;
      this.dVz[id] = 0;
      this.dVrot[id] = 0;
      this.dAgeMs[id] = 0;
    }
  }

  private lookupChunkSlot(cx: number, cy: number): number {
    if (cx < 0 || cy < 0 || cx >= this.gridCols || cy >= this.gridRows) return -1;
    const gIdx = cy * this.gridCols + cx;
    if (gIdx < CHUNK_GRID_FAST_SLOTS) {
      return this.chunkGridLookup[gIdx];
    }
    for (let i = 0; i < this.chunkCount; i++) {
      if (this.chunkKeys[i] === gIdx) return i;
    }
    return -1;
  }

  private getOrCreateChunk(cx: number, cy: number): number {
    if (typeof document === 'undefined') return -1;
    if (cx < 0 || cy < 0 || cx >= this.gridCols || cy >= this.gridRows) return -1;

    const gIdx = cy * this.gridCols + cx;
    const existing = this.lookupChunkSlot(cx, cy);
    if (existing >= 0) {
      this.chunkLastUsed[existing] = ++this.chunkAccessStamp;
      return existing;
    }

    if (this.chunkCount >= MAX_DECAL_CHUNKS) {
      let evictSlot = 0;
      let minStamp = this.chunkLastUsed[0];
      for (let i = 1; i < MAX_DECAL_CHUNKS; i++) {
        if (this.chunkLastUsed[i] < minStamp) {
          minStamp = this.chunkLastUsed[i];
          evictSlot = i;
        }
      }
      const oldGIdx = this.chunkKeys[evictSlot];
      if (oldGIdx >= 0 && oldGIdx < CHUNK_GRID_FAST_SLOTS) {
        this.chunkGridLookup[oldGIdx] = -1;
      }
      const evictCtx = this.chunkCtxs[evictSlot];
      if (evictCtx) {
        evictCtx.clearRect(0, 0, DECAL_CHUNK_SIZE, DECAL_CHUNK_SIZE);
      }
      this.chunkKeys[evictSlot] = gIdx;
      this.chunkDirty[evictSlot] = 0;
      this.chunkLastUsed[evictSlot] = ++this.chunkAccessStamp;
      if (gIdx < CHUNK_GRID_FAST_SLOTS) {
        this.chunkGridLookup[gIdx] = evictSlot;
      }
      return evictSlot;
    }

    const slot = this.chunkCount++;
    let canvas = this.chunkCanvases[slot];
    let cctx = this.chunkCtxs[slot];
    if (!canvas || !cctx) {
      canvas = createOffscreenCanvas(DECAL_CHUNK_SIZE, DECAL_CHUNK_SIZE);
      if (!canvas) {
        this.chunkCount--;
        return -1;
      }
      cctx = canvas.getContext('2d');
      if (!cctx) {
        this.chunkCount--;
        return -1;
      }
      cctx.imageSmoothingEnabled = false;
      this.chunkCanvases[slot] = canvas;
      this.chunkCtxs[slot] = cctx;
    }

    this.chunkKeys[slot] = gIdx;
    this.chunkDirty[slot] = 0;
    this.chunkLastUsed[slot] = ++this.chunkAccessStamp;
    if (gIdx < CHUNK_GRID_FAST_SLOTS) {
      this.chunkGridLookup[gIdx] = slot;
    }
    return slot;
  }

  private bakeDecalToChunks(
    kind: DecalKind,
    x: number,
    y: number,
    rot: number,
    scale: number,
    colorIdx: number,
    seed: number,
  ): boolean {
    if (typeof document === 'undefined') return false;

    const s = scale > 0 ? scale : 1;
    let pad = 18 * s;
    if (kind === DecalKind.CraterLg) pad = 34 * s;
    else if (kind === DecalKind.CraterSm || kind === DecalKind.Scorch) pad = 18 * s;
    else if (kind === DecalKind.CasingBrass || kind === DecalKind.CasingRed) pad = 6;
    else if (kind >= DecalKind.SplatSlime) pad = 16 * s;

    const cx0 = Math.max(0, Math.floor((x - pad) / DECAL_CHUNK_SIZE));
    const cx1 = Math.min(this.gridCols - 1, Math.floor((x + pad) / DECAL_CHUNK_SIZE));
    const cy0 = Math.max(0, Math.floor((y - pad) / DECAL_CHUNK_SIZE));
    const cy1 = Math.min(this.gridRows - 1, Math.floor((y + pad) / DECAL_CHUNK_SIZE));
    if (cx0 > cx1 || cy0 > cy1) return false;

    const atlas = this.getAtlas();
    let stampedAny = false;

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const slot = this.getOrCreateChunk(cx, cy);
        if (slot < 0) continue;
        const cctx = this.chunkCtxs[slot];
        if (!cctx) continue;
        const lx = x - cx * DECAL_CHUNK_SIZE;
        const ly = y - cy * DECAL_CHUNK_SIZE;
        this.stampDecalToContext(cctx, atlas, kind, lx, ly, rot, s, colorIdx, seed);
        this.chunkDirty[slot] = 1;
        stampedAny = true;
      }
    }

    return stampedAny;
  }

  private stampDecalToContext(
    ctx: CanvasRenderingContext2D,
    atlas: HTMLCanvasElement | null,
    kind: DecalKind,
    x: number,
    y: number,
    rot: number,
    scale: number,
    colorIdx: number,
    seed: number,
  ): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const s = scale > 0 ? scale : 1;

    switch (kind) {
      case DecalKind.CasingBrass:
      case DecalKind.CasingRed: {
        if (atlas) {
          const frame = ((Math.floor(rot) % 4) + 4) & 3;
          const sy =
            kind === DecalKind.CasingRed
              ? ATLAS_CELLS.casingRedY
              : ATLAS_CELLS.casingBrassY;
          ctx.drawImage(atlas, 224 + frame * 8, sy, 8, 8, rx - 4, ry - 4, 8, 8);
        } else {
          ctx.fillStyle = FX_PALETTE[kind === DecalKind.CasingRed ? FxColor.ShotgunRed : FxColor.Brass];
          ctx.fillRect(rx - 2, ry - 1, 4, 2);
          ctx.fillStyle = FX_PALETTE[FxColor.HotGold];
          ctx.fillRect(rx - 1, ry - 1, 1, 1);
        }
        break;
      }

      case DecalKind.CraterSm: {
        if (atlas) {
          const w = Math.round(32 * s);
          const h = Math.round(32 * s);
          ctx.drawImage(
            atlas,
            ATLAS_CELLS.craterSm.x,
            ATLAS_CELLS.craterSm.y,
            32,
            32,
            rx - (w >> 1),
            ry - (h >> 1),
            w,
            h,
          );
        }
        break;
      }

      case DecalKind.CraterLg: {
        if (atlas) {
          const w = Math.round(64 * s);
          const h = Math.round(64 * s);
          ctx.drawImage(
            atlas,
            ATLAS_CELLS.craterLg.x,
            ATLAS_CELLS.craterLg.y,
            64,
            64,
            rx - (w >> 1),
            ry - (h >> 1),
            w,
            h,
          );
        }
        break;
      }

      case DecalKind.Scorch: {
        if (atlas) {
          const w = Math.round(32 * s);
          const h = Math.round(32 * s);
          ctx.drawImage(
            atlas,
            ATLAS_CELLS.scorch.x,
            ATLAS_CELLS.scorch.y,
            32,
            32,
            rx - (w >> 1),
            ry - (h >> 1),
            w,
            h,
          );
        }
        break;
      }

      case DecalKind.SplatBlood:
      case DecalKind.SplatSap:
      case DecalKind.SplatSlime:
      case DecalKind.SplatOil: {
        const baseColor =
          kind === DecalKind.SplatBlood
            ? FX_PALETTE[FxColor.BloodDark]
            : kind === DecalKind.SplatOil
              ? FX_PALETTE[FxColor.Smoke]
              : FX_PALETTE[FxColor.SapDark];
        const hiColor =
          kind === DecalKind.SplatBlood
            ? FX_PALETTE[FxColor.Blood]
            : kind === DecalKind.SplatOil
              ? FX_PALETTE[FxColor.Outline]
              : FX_PALETTE[FxColor.Sap];

        let rng = seed || 0x6d2b79f5;
        ctx.fillStyle = baseColor;
        const mainW = Math.max(6, Math.round(10 * s));
        const mainH = Math.max(4, Math.round(6 * s));
        ctx.fillRect(rx - (mainW >> 1), ry - (mainH >> 1), mainW, mainH);

        for (let k = 0; k < 5; k++) {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          const ox = (((rng >>> 16) & 31) - 15) * s * 0.7;
          rng = (rng * 1664525 + 1013904223) >>> 0;
          const oy = (((rng >>> 16) & 31) - 15) * s * 0.45;
          const dSz = (k & 1) === 0 ? 3 : 2;
          ctx.fillStyle = k < 2 ? hiColor : baseColor;
          ctx.fillRect(Math.round(rx + ox), Math.round(ry + oy), dSz, Math.max(1, dSz - 1));
        }
        break;
      }

      case DecalKind.Rubble: {
        let rng = seed || 0x1234567;
        const body = FX_PALETTE[colorIdx];
        for (let k = 0; k < 5; k++) {
          rng = (rng * 1664525 + 1013904223) >>> 0;
          const ox = (((rng >>> 16) & 31) - 15) * s * 0.85;
          rng = (rng * 1664525 + 1013904223) >>> 0;
          const oy = (((rng >>> 16) & 31) - 15) * s * 0.6;
          const px = Math.round(rx + ox);
          const py = Math.round(ry + oy);
          ctx.fillStyle = FX_PALETTE[FxColor.Outline];
          ctx.fillRect(px - 1, py - 1, 5, 4);
          ctx.fillStyle = body;
          ctx.fillRect(px, py, 3, 2);
        }
        break;
      }
    }
  }
}

function selectGlowCell(colorIdx: number): AtlasRect {
  if (colorIdx === FxColor.Orange || colorIdx === FxColor.Gold || colorIdx === FxColor.HotGold || colorIdx === FxColor.Ember) {
    return ATLAS_CELLS.glowFire;
  }
  if (colorIdx === FxColor.Cyan || colorIdx === FxColor.Plasma || colorIdx === FxColor.ElectricCore || colorIdx === FxColor.Shield || colorIdx === FxColor.CyberTeal) {
    return ATLAS_CELLS.glowCyan;
  }
  if (colorIdx === FxColor.Blood || colorIdx === FxColor.BloodDark || colorIdx === FxColor.HitRed || colorIdx === FxColor.ShotgunRed) {
    return ATLAS_CELLS.glowCrimson;
  }
  if (colorIdx === FxColor.Heal || colorIdx === FxColor.SapDark || colorIdx === FxColor.SapBright) {
    return ATLAS_CELLS.glowEmerald;
  }
  if (colorIdx === FxColor.Violet || colorIdx === FxColor.DeepViolet || colorIdx === FxColor.VoidPurple) {
    return ATLAS_CELLS.glowViolet;
  }
  return ATLAS_CELLS.glowWhite;
}

function selectSparkCell(colorIdx: number): AtlasRect {
  if (colorIdx === FxColor.Cyan || colorIdx === FxColor.Plasma || colorIdx === FxColor.ElectricCore) {
    return ATLAS_CELLS.sparkCyan;
  }
  if (colorIdx === FxColor.Blood || colorIdx === FxColor.BloodDark || colorIdx === FxColor.HitRed) {
    return ATLAS_CELLS.sparkCrimson;
  }
  if (colorIdx === FxColor.Orange || colorIdx === FxColor.Gold || colorIdx === FxColor.HotGold) {
    return ATLAS_CELLS.sparkFire;
  }
  return ATLAS_CELLS.sparkWhite;
}

/** Shared singleton FX pool instance consumed by `vfx.ts`, `render.ts`, and `store.ts`. */
export const bansungFx: BansungFxPool = new BansungFxPool();
