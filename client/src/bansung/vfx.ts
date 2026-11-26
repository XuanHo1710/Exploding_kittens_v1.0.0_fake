/**
 * Bansung Co-op Visual Effects & Pet Companion Systems (d22, d23, d24, d25)
 *
 * Exclusive owner module for client VFX pools & layered sprite/canvas renderers:
 * - d22: Velocity-clamped tracer ribbons, projectile sprite strips & fallbacks,
 *        beam/railgun/lightning trails with diamond chevrons, additive muzzle
 *        flash cones (48-slot pool) + casing eject helper.
 * - d23: Expanding stun shockwave rings (24-slot pool), distance-attenuated
 *        screen flashbang overlay, 16x16 orbiting stun stars (depth-split + LOD),
 *        45ms LCG stepped electric arcs (32-slot pool), and freeze-jitter pose.
 * - d24: 2.5D Z-arc bombs (0/1/2 bounces), scaling shadows (Z_PROJ = 0.85),
 *        pulsing server-accurate telegraph rings, and 5-layer explosion FX
 *        integrated with `bansungFx` particles/decals & `bansungMotion` trauma.
 * - d25: Tiger/Cat pet companion animation, guaranteed procedural 32x32
 *        pixel-art sheet fallback, parabolic pounce + damped squash-stretch
 *        spring, trot micro-dust, magnet tether, downed badge & pet fireball.
 *
 * Zero-GC per-frame discipline: pre-allocated circular/slot pools, reused
 * scratch option structs, no runtime `createRadialGradient()`, crisp pixel-art.
 */

import {
  BANSUNG_BFLAG_CRIT,
  BANSUNG_BFLAG_ENERGY,
  BANSUNG_BFLAG_EXPLOSIVE,
  BANSUNG_BFLAG_FROM_ENEMY,
  BANSUNG_BFLAG_HOMING,
  BANSUNG_BFLAG_PAUSED,
  BANSUNG_BFLAG_PIERCE,
  BANSUNG_FX_BEAM_BOSS_EYE,
  BANSUNG_FX_BEAM_BOSS_LASER,
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
  BANSUNG_FX_BLAST_ABYSS_NOVA,
  BANSUNG_FX_BLAST_BOSS_MORTAR,
  BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_DRONE_PULSE,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_FROST_SHATTER,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_MINE,
  BANSUNG_FX_BLAST_ORBITAL,
  BANSUNG_FX_BLAST_STEAM,
  BANSUNG_FX_BLAST_STORM_YELLOW,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_BLAST_THUNDER_STORM,
  BANSUNG_FX_BLAST_TURRET_EXPIRE,
  BANSUNG_FX_BLAST_TURRET_THUNDER,
  BANSUNG_FX_BLAST_VOLATILE,
  BANSUNG_FX_IMPACT_FLESH,
  BANSUNG_FX_IMPACT_SLASH,
  BANSUNG_FX_IMPACT_SLICE,
  BANSUNG_FX_IMPACT_SPARK,
  BANSUNG_GADGETS,
  BANSUNG_PET,
  BANSUNG_PET_ANIMS,
  BANSUNG_PET_PALETTES,
  BANSUNG_SHADOW_META,
  BANSUNG_WEAPON_TIERS,
  FX_BEAM,
  FX_BLAST,
  FX_IMPACT,
  FX_MUZZLE,
  decodeDanmakuPalette,
  decodeDanmakuScaleMult,
  dequantizeAim,
  getProjectileConfigByKindId,
  getWeaponByIdx,
  normalizeWeaponTier,
  type BansungPetAnimAction,
  type BansungPetKind,
  type BansungPetNetTuple,
  type BansungPetStateId,
  type BansungProjectileKind,
  type BansungWeaponTier,
} from '../../../shared/src';

import {
  drawBansungSprite,
  getClipMeta,
  getProceduralFallback,
  getSpriteImage,
  resolveFrameIndex,
  resolveFrameRect,
  type SpriteCategory,
} from './sprites';

import {
  DecalKind,
  FxColor,
  FxKind,
  FxLayer,
  FxPrio,
  bansungFx,
  type SpawnDecalOpts,
  type SpawnFxOpts,
} from './particles';

import { bansungMotion } from './motion';
import { playBansungSfx } from './sound';
import {
  PROJECTILE_IMPACT_COLOR,
  PROJECTILE_IMPACT_COUNT,
  PROJECTILE_TRACER_OVERRIDES,
  getWeaponFxProfile,
  type WeaponFxProfile,
  type WeaponMuzzleAccent,
} from './weapon-fx-profiles';
import type { InterpBullet, SnapBullet, SnapFxEvent } from './store';

// ============================================================================
// 0. Internal Math, Environment & Zero-GC Scratch Helpers
// ============================================================================

const TWO_PI = Math.PI * 2;
const QUARTER_PI = Math.PI * 0.25;
const OUTLINE_INK = '#1b1412';
const HERO_BARREL_LIFT_Y = 18;

const SCRATCH_FX_OPTS: SpawnFxOpts = {
  layer: FxLayer.World,
  prio: FxPrio.Low,
  colorIdx: FxColor.White,
  vx: 0,
  vy: 0,
  z: 0,
  vz: 0,
  size: 2,
  sizeEnd: 0.5,
  lifeMs: 200,
};

const SCRATCH_DECAL_OPTS: SpawnDecalOpts = {
  scale: 1,
};

const CRATER_DECAL_OPTS: SpawnDecalOpts = {
  scale: 1,
  lifeMs: 5_000,
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function easeOutQuad(t: number): number {
  const inv = 1 - clamp(t, 0, 1);
  return 1 - inv * inv;
}

function resolveNowMs(nowMs?: number): number {
  if (nowMs !== undefined && Number.isFinite(nowMs)) return nowMs;
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function createCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function snapAngle45(rad: number): number {
  return Math.round(rad / QUARTER_PI) * QUARTER_PI;
}

/** Deterministic 32-bit LCG step for crackle & debris variation. */
function lcgNext(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function emitParticle(
  kind: FxKind,
  layer: FxLayer,
  prio: FxPrio,
  x: number,
  y: number,
  vx: number,
  vy: number,
  lifeMs: number,
  size: number,
  colorIdx: number,
): void {
  SCRATCH_FX_OPTS.layer = layer;
  SCRATCH_FX_OPTS.prio = prio;
  SCRATCH_FX_OPTS.vx = vx;
  SCRATCH_FX_OPTS.vy = vy;
  SCRATCH_FX_OPTS.z = 0;
  SCRATCH_FX_OPTS.vz = 0;
  SCRATCH_FX_OPTS.lifeMs = lifeMs;
  SCRATCH_FX_OPTS.size = size;
  SCRATCH_FX_OPTS.sizeEnd = Math.max(0.5, size * 0.25);
  SCRATCH_FX_OPTS.colorIdx = colorIdx;
  bansungFx.spawnParticle(kind, x, y, SCRATCH_FX_OPTS);
}

function emitRadialBurst(
  kind: FxKind,
  layer: FxLayer,
  prio: FxPrio,
  x: number,
  y: number,
  count: number,
  speedMin: number,
  speedMax: number,
  lifeMinMs: number,
  lifeMaxMs: number,
  size: number,
  colorIdx: number,
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * TWO_PI + (Math.random() - 0.5) * 0.65;
    const spd = speedMin + Math.random() * (speedMax - speedMin);
    const life = lifeMinMs + Math.random() * (lifeMaxMs - lifeMinMs);
    emitParticle(
      kind,
      layer,
      prio,
      x,
      y,
      Math.cos(a) * spd,
      Math.sin(a) * spd,
      life,
      size,
      colorIdx,
    );
  }
}

/** Pre-baked radial glow sub-rects inside `bansungFx.getAtlas()` (256x128). */
const ATLAS_GLOW = {
  white: { sx: 96, sy: 64, sw: 64, sh: 64 },
  fire: { sx: 160, sy: 64, sw: 32, sh: 32 },
  cyan: { sx: 192, sy: 64, sw: 32, sh: 32 },
  crimson: { sx: 224, sy: 64, sw: 32, sh: 32 },
  emerald: { sx: 160, sy: 96, sw: 32, sh: 32 },
  violet: { sx: 192, sy: 96, sw: 32, sh: 32 },
} as const;

type AtlasGlowKind = keyof typeof ATLAS_GLOW;

function drawAtlasGlow(
  ctx: CanvasRenderingContext2D,
  kind: AtlasGlowKind,
  cx: number,
  cy: number,
  diameter: number,
  alpha: number,
): boolean {
  if (alpha <= 0.01 || diameter <= 1) return false;
  const atlas = bansungFx.getAtlas();
  if (!atlas) return false;
  const rect = ATLAS_GLOW[kind];
  const half = diameter * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    atlas,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    Math.round(cx - half),
    Math.round(cy - half),
    Math.round(diameter),
    Math.round(diameter),
  );
  ctx.restore();
  return true;
}

// ============================================================================
// 1. d22 Constants, Projectile Presets, Tracer Ribbons, Beams & Muzzle Cones
// ============================================================================

export const MAX_FLASHES = 48;
export const MAX_BEAMS = 32;
export const MAX_TRACKED_PROJECTILES = 512;

export interface TracerStyle {
  readonly color: string;
  readonly coreColor: string;
  readonly outerGlow: string;
  readonly minLen: number;
  readonly maxLen: number;
  readonly width: number;
  readonly additive: boolean;
}

export const TRACER_PRESETS = {
  kinetic_sm: {
    color: '#ffe066',
    coreColor: '#ffffff',
    outerGlow: 'rgba(255, 224, 102, 0.55)',
    minLen: 14,
    maxLen: 46,
    width: 2.0,
    additive: false,
  },
  kinetic_md: {
    color: '#ffd43b',
    coreColor: '#ffffff',
    outerGlow: 'rgba(255, 192, 60, 0.65)',
    minLen: 20,
    maxLen: 64,
    width: 2.5,
    additive: false,
  },
  shotgun_pellet: {
    color: '#ffa94d',
    coreColor: '#fff3bf',
    outerGlow: 'rgba(255, 146, 43, 0.60)',
    minLen: 12,
    maxLen: 36,
    width: 2.2,
    additive: false,
  },
  plasma_bolt: {
    color: '#3bc9db',
    coreColor: '#e7f5ff',
    outerGlow: 'rgba(59, 201, 219, 0.78)',
    minLen: 16,
    maxLen: 54,
    width: 3.0,
    additive: true,
  },
  rail_beam: {
    color: '#4dabf7',
    coreColor: '#ffffff',
    outerGlow: 'rgba(77, 171, 247, 0.85)',
    minLen: 28,
    maxLen: 96,
    width: 3.5,
    additive: true,
  },
  turret_bolt: {
    color: '#ffd43b',
    coreColor: '#ffffff',
    outerGlow: 'rgba(255, 212, 59, 0.55)',
    minLen: 14,
    maxLen: 42,
    width: 2.0,
    additive: false,
  },
  arcane_fireball: {
    color: '#ff7a3d',
    coreColor: '#fff3bf',
    outerGlow: 'rgba(255, 122, 61, 0.78)',
    minLen: 16,
    maxLen: 48,
    width: 4.0,
    additive: true,
  },
  arcane_ember: {
    color: '#ff922b',
    coreColor: '#ffe8cc',
    outerGlow: 'rgba(255, 146, 43, 0.72)',
    minLen: 12,
    maxLen: 34,
    width: 2.5,
    additive: true,
  },
  thunder_orb: {
    color: '#74c0fc',
    coreColor: '#ffffff',
    outerGlow: 'rgba(116, 192, 252, 0.80)',
    minLen: 14,
    maxLen: 44,
    width: 3.2,
    additive: true,
  },
  enemy_orb: {
    color: '#ff4769',
    coreColor: '#fff0f3',
    outerGlow: 'rgba(255, 64, 96, 0.90)',
    minLen: 16,
    maxLen: 46,
    width: 3.4,
    additive: true,
  },
  enemy_needle: {
    color: '#ff5e3a',
    coreColor: '#fff4d6',
    outerGlow: 'rgba(255, 72, 40, 0.88)',
    minLen: 18,
    maxLen: 52,
    width: 3.0,
    additive: false,
  },
  enemy_bolt: {
    color: '#ff3b30',
    coreColor: '#fff9db',
    outerGlow: 'rgba(255, 59, 48, 0.90)',
    minLen: 22,
    maxLen: 64,
    width: 3.6,
    additive: false,
  },
  enemy_plasma: {
    color: '#e85bff',
    coreColor: '#ffffff',
    outerGlow: 'rgba(232, 91, 255, 0.90)',
    minLen: 20,
    maxLen: 58,
    width: 3.8,
    additive: true,
  },
  enemy_thunder: {
    color: '#56e4ff',
    coreColor: '#ffffff',
    outerGlow: 'rgba(86, 228, 255, 0.92)',
    minLen: 18,
    maxLen: 50,
    width: 3.8,
    additive: true,
  },
  enemy_fireball: {
    color: '#ff6b1a',
    coreColor: '#fff6b3',
    outerGlow: 'rgba(255, 107, 26, 0.92)',
    minLen: 22,
    maxLen: 62,
    width: 4.8,
    additive: true,
  },
  rocket: {
    color: '#ff922b',
    coreColor: '#fff3bf',
    outerGlow: 'rgba(255, 146, 43, 0.70)',
    minLen: 18,
    maxLen: 52,
    width: 3.2,
    additive: true,
  },
  crit_override: {
    color: '#ffd43b',
    coreColor: '#ffffff',
    outerGlow: 'rgba(255, 212, 59, 0.85)',
    minLen: 20,
    maxLen: 72,
    width: 3.0,
    additive: true,
  },
} as const satisfies Record<string, TracerStyle>;

export interface ProjAnimEntry {
  readonly clipKey: string;
  readonly category: SpriteCategory;
  readonly scale: number;
  readonly additiveGlow: AtlasGlowKind | null;
  readonly snap45: boolean;
}

export const BANSUNG_PROJ_ANIMS: Record<BansungProjectileKind, ProjAnimEntry> = {
  kinetic_sm: { clipKey: 'bullet_kinetic_sm', category: 'projectile', scale: 1, additiveGlow: null, snap45: false },
  kinetic_md: { clipKey: 'bullet_kinetic_md', category: 'projectile', scale: 1, additiveGlow: null, snap45: false },
  shotgun_pellet: { clipKey: 'bullet_shotgun_pellet', category: 'projectile', scale: 1, additiveGlow: null, snap45: false },
  frag_grenade: { clipKey: 'p_frag_grenade', category: 'projectile', scale: 1, additiveGlow: null, snap45: true },
  frag_shrapnel: { clipKey: 'bullet_shotgun_pellet', category: 'projectile', scale: 0.85, additiveGlow: null, snap45: false },
  stun_canister: { clipKey: 'p_stun_canister', category: 'projectile', scale: 1, additiveGlow: 'cyan', snap45: true },
  rocket: { clipKey: 'p_rocket', category: 'projectile', scale: 1, additiveGlow: 'fire', snap45: false },
  prox_mine: { clipKey: 'p_prox_mine', category: 'projectile', scale: 1, additiveGlow: null, snap45: false },
  rail_beam: { clipKey: 'rail_beam', category: 'projectile', scale: 1, additiveGlow: 'cyan', snap45: false },
  turret_bolt: { clipKey: 'bullet_kinetic_sm', category: 'projectile', scale: 1, additiveGlow: null, snap45: false },
  plasma_bolt: { clipKey: 'plasma_bolt', category: 'projectile', scale: 1, additiveGlow: 'cyan', snap45: false },
  thunder_orb: { clipKey: 'thunderball', category: 'projectile', scale: 0.4, additiveGlow: 'cyan', snap45: false },
  arcane_fireball: { clipKey: 'fireball', category: 'projectile', scale: 0.55, additiveGlow: 'fire', snap45: false },
  arcane_ember: { clipKey: 'bullet_enemy_orb', category: 'projectile', scale: 0.85, additiveGlow: 'crimson', snap45: false },
  turret_thunder: { clipKey: 'thunderball', category: 'projectile', scale: 0.35, additiveGlow: 'cyan', snap45: false },
  stun_bomb_proj: { clipKey: 'p_stun_canister', category: 'projectile', scale: 1.1, additiveGlow: 'cyan', snap45: true },
  cluster_bomb_proj: { clipKey: 'cluster_bomb', category: 'weapon', scale: 0.65, additiveGlow: null, snap45: true },
  cluster_sub_proj: { clipKey: 'p_frag_grenade', category: 'projectile', scale: 0.75, additiveGlow: null, snap45: true },
  sniper_slug: { clipKey: 'bullet_kinetic_md', category: 'projectile', scale: 1.35, additiveGlow: 'fire', snap45: false },
  laser_map_beam: { clipKey: 'rail_beam', category: 'projectile', scale: 1.25, additiveGlow: 'crimson', snap45: false },
  electric_arc_bolt: { clipKey: 'plasma_bolt', category: 'projectile', scale: 1.1, additiveGlow: 'cyan', snap45: false },
  flame_stream_orb: { clipKey: 'flame_stream_orb', category: 'projectile', scale: 1.15, additiveGlow: 'fire', snap45: false },
  cryo_shard: { clipKey: 'cryo_shard', category: 'projectile', scale: 1.1, additiveGlow: 'cyan', snap45: false },
  saw_disc: { clipKey: 'saw_disc', category: 'projectile', scale: 1.0, additiveGlow: null, snap45: false },
  gravity_orb: { clipKey: 'gravity_orb', category: 'projectile', scale: 1.25, additiveGlow: 'crimson', snap45: false },
  plasma_pellet: { clipKey: 'plasma_bolt', category: 'projectile', scale: 0.92, additiveGlow: 'cyan', snap45: false },
  twin_smg_bullet: { clipKey: 'bullet_kinetic_sm', category: 'projectile', scale: 1.05, additiveGlow: null, snap45: false },
  ion_lance: { clipKey: 'rail_beam', category: 'projectile', scale: 1.3, additiveGlow: 'cyan', snap45: false },
  cluster_rocket: { clipKey: 'p_rocket', category: 'projectile', scale: 1.28, additiveGlow: 'fire', snap45: false },
  tesla_arc: { clipKey: 'thunderball', category: 'projectile', scale: 0.44, additiveGlow: 'cyan', snap45: false },
  void_cannon_orb: { clipKey: 'gravity_orb', category: 'projectile', scale: 1.38, additiveGlow: 'violet', snap45: false },
  blizzard_bolt: { clipKey: 'cryo_shard', category: 'projectile', scale: 1.15, additiveGlow: 'cyan', snap45: false },
  ricochet_blade: { clipKey: 'saw_disc', category: 'projectile', scale: 1.12, additiveGlow: 'cyan', snap45: false },
  phantom_arrow: { clipKey: 'bullet_kinetic_sm', category: 'projectile', scale: 1.25, additiveGlow: 'violet', snap45: false },
  magma_glob: { clipKey: 'plasma_bolt', category: 'projectile', scale: 1.25, additiveGlow: 'fire', snap45: false },
  chronos_slug: { clipKey: 'plasma_bolt', category: 'projectile', scale: 1.18, additiveGlow: 'cyan', snap45: false },
  orbital_shell: { clipKey: 'p_rocket', category: 'projectile', scale: 1.45, additiveGlow: 'fire', snap45: false },
  danmaku_orb: { clipKey: 'danmaku_orb', category: 'projectile', scale: 1.0, additiveGlow: 'crimson', snap45: false },
  danmaku_lance: { clipKey: 'danmaku_lance', category: 'projectile', scale: 1.08, additiveGlow: 'cyan', snap45: false },
  danmaku_star: { clipKey: 'danmaku_star', category: 'projectile', scale: 1.08, additiveGlow: 'fire', snap45: false },
  danmaku_crescent: { clipKey: 'danmaku_crescent', category: 'projectile', scale: 1.08, additiveGlow: 'violet', snap45: false },
  danmaku_ring: { clipKey: 'danmaku_ring', category: 'projectile', scale: 1.08, additiveGlow: 'crimson', snap45: false },
};

export type MuzzleFlashStyle = 'kinetic' | 'plasma' | 'shotgun' | 'laser' | 'flame' | 'emp';
export type BeamKindId = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface MuzzleFlash {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  style: MuzzleFlashStyle;
  ageMs: number;
  ttlMs: number;
  scale: number;
  weaponTier: BansungWeaponTier;
  seed: number;
  /** Spec 007 · C: hình phụ theo hồ sơ súng (weapon-fx-profiles.ts). */
  accent: WeaponMuzzleAccent;
  tint: string;
  core: string;
}

export interface BeamTrail {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: BeamKindId;
  ageMs: number;
  ttlMs: number;
  width: number;
  seed: number;
}

interface TrackedProjectile {
  active: boolean;
  id: number;
  kind: number;
  spawnX: number;
  spawnY: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  ageSec: number;
  smokeAccSec: number;
  stamp: number;
}

const fallbackBulletCache = new Map<number, HTMLCanvasElement>();

/** Builds a lazy 24x8 2-frame fallback pixel strip for kinetic/energy/orb projectiles. */
function getFallbackBulletStrip(kindId: number, flags: number): HTMLCanvasElement | null {
  const isEnemy = (flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0;
  const isEnergy = (flags & BANSUNG_BFLAG_ENERGY) !== 0;
  const cacheKey = (kindId << 2) | (isEnemy ? 1 : 0) | (isEnergy ? 2 : 0);
  const existing = fallbackBulletCache.get(cacheKey);
  if (existing) return existing;

  const c = createCanvas(24, 8);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;

  let body = '#ffd43b';
  let highlight = '#fff9db';
  if (isEnemy) {
    if (kindId === 11 || kindId === 14) {
      body = '#56e4ff';
      highlight = '#ffffff';
    } else if (kindId === 10 || isEnergy) {
      body = '#e85bff';
      highlight = '#fff0ff';
    } else if (kindId === 12 || kindId === 6) {
      body = '#ff6b1a';
      highlight = '#fff6b3';
    } else if (kindId === 0 || kindId === 2) {
      body = '#ff5e3a';
      highlight = '#fff4d6';
    } else {
      body = '#ff4769';
      highlight = '#fff0f3';
    }
  } else if (isEnergy || kindId === 8 || kindId === 10 || kindId === 11 || kindId === 14) {
    body = '#3bc9db';
    highlight = '#e7f5ff';
  } else if (kindId === 12 || kindId === 13 || kindId === 6) {
    body = '#ff7a3d';
    highlight = '#fff3bf';
  }

  for (let f = 0; f < 2; f++) {
    const ox = f * 12;
    g.fillStyle = OUTLINE_INK;
    if (isEnemy) {
      g.fillRect(ox, 1, 12, 6);
      g.fillStyle = body;
      g.fillRect(ox + 1, 2, 10, 4);
      g.fillStyle = highlight;
      g.fillRect(ox + (f === 0 ? 6 : 7), 3, 3, 2);
    } else {
      g.fillRect(ox + 1, 2, 10, 4);
      g.fillStyle = body;
      g.fillRect(ox + 2, 3, 8, 2);
      g.fillStyle = highlight;
      g.fillRect(ox + (f === 0 ? 6 : 7), 3, 3, 1);
    }
  }
  fallbackBulletCache.set(cacheKey, c);
  return c;
}

// ── 3-Layer Touhou Danmaku Stamp Cache (Dark Ink -> Element Mid -> White Core) ──

interface DanmakuPaletteVisual {
  readonly mid: string;
  readonly rim: string;
  readonly glow: AtlasGlowKind;
}

const DANMAKU_PALETTE_SPECS: readonly DanmakuPaletteVisual[] = [
  { mid: '#ff2a6d', rim: '#be123c', glow: 'crimson' }, // 0: CRIMSON
  { mid: '#22d3ee', rim: '#0284c7', glow: 'cyan' },    // 1: CYAN
  { mid: '#c084fc', rim: '#7e22ce', glow: 'violet' },  // 2: VIOLET
  { mid: '#facc15', rim: '#ca8a04', glow: 'fire' },    // 3: GOLD
  { mid: '#34d399', rim: '#059669', glow: 'emerald' }, // 4: EMERALD
  { mid: '#fb923c', rim: '#ea580c', glow: 'fire' },    // 5: FLAME
  { mid: '#f472b6', rim: '#db2777', glow: 'crimson' }, // 6: ROSE
  { mid: '#e2e8f0', rim: '#64748b', glow: 'cyan' },    // 7: SILVER
];

const DANMAKU_INK = '#140c1c';
const danmakuStampCache = new Map<number, HTMLCanvasElement>();

/**
 * Lazily bakes a crisp 64x32 (2 frames of 32x32) 3-layer Touhou Danmaku stamp
 * for `shapeIdx` (`0..4` -> orb, lance, star, crescent, ring) × `paletteIdx` (`0..7`).
 * Zero runtime gradient or canvas allocations after first bake.
 */
function getDanmakuStampStrip(shapeIdx: number, paletteIdx: number): HTMLCanvasElement | null {
  const s = clamp(shapeIdx | 0, 0, 4);
  const p = clamp(paletteIdx | 0, 0, 7);
  const key = (s << 4) | p;
  const cached = danmakuStampCache.get(key);
  if (cached) return cached;

  const c = createCanvas(64, 32);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  const pal = DANMAKU_PALETTE_SPECS[p] ?? DANMAKU_PALETTE_SPECS[0];

  for (let f = 0; f < 2; f++) {
    const cx = f * 32 + 16;
    const cy = 16;
    const pulse = f === 0 ? 1 : 1.07;

    g.save();
    if (s === 0) {
      // 0: Danmaku Orb (3-layer glowing Touhou pearl)
      g.fillStyle = DANMAKU_INK;
      g.beginPath();
      g.arc(cx, cy, 8.8 * pulse, 0, TWO_PI);
      g.fill();

      g.fillStyle = pal.rim;
      g.beginPath();
      g.arc(cx, cy, 7.2 * pulse, 0, TWO_PI);
      g.fill();

      g.fillStyle = pal.mid;
      g.beginPath();
      g.arc(cx, cy, 5.9 * pulse, 0, TWO_PI);
      g.fill();

      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx, cy, 3.3, 0, TWO_PI);
      g.fill();
    } else if (s === 1) {
      // 1: Sakuya Kunai / Crystal Lance (facing +X)
      g.translate(cx, cy);
      g.fillStyle = DANMAKU_INK;
      g.beginPath();
      g.moveTo(13.5, 0);
      g.lineTo(-4.5, -6.2 * pulse);
      g.lineTo(-11.5, 0);
      g.lineTo(-4.5, 6.2 * pulse);
      g.closePath();
      g.fill();

      g.fillStyle = pal.rim;
      g.beginPath();
      g.moveTo(11.8, 0);
      g.lineTo(-3.8, -4.8 * pulse);
      g.lineTo(-9.5, 0);
      g.lineTo(-3.8, 4.8 * pulse);
      g.closePath();
      g.fill();

      g.fillStyle = pal.mid;
      g.beginPath();
      g.moveTo(10.6, 0);
      g.lineTo(-3.2, -3.7 * pulse);
      g.lineTo(-8.0, 0);
      g.lineTo(-3.2, 3.7 * pulse);
      g.closePath();
      g.fill();

      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(9.2, 0);
      g.lineTo(-2.5, -1.8);
      g.lineTo(-5.8, 0);
      g.lineTo(-2.5, 1.8);
      g.closePath();
      g.fill();
    } else if (s === 2) {
      // 2: Touhou 5-Pointed Star
      g.translate(cx, cy);
      const drawStar = (outerR: number, innerR: number, fill: string): void => {
        g.fillStyle = fill;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const r = (k & 1) === 0 ? outerR : innerR;
          const a = (k * Math.PI) / 5 - Math.PI * 0.5;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      };
      drawStar(10.8 * pulse, 5.2 * pulse, DANMAKU_INK);
      drawStar(9.2 * pulse, 4.2 * pulse, pal.rim);
      drawStar(8.0 * pulse, 3.6 * pulse, pal.mid);
      drawStar(4.6, 2.1, '#ffffff');
    } else if (s === 3) {
      // 3: Curved Crescent Wave Blade (facing +X)
      g.translate(cx, cy);
      const drawCrescent = (outerR: number, innerR: number, shiftX: number, fill: string): void => {
        g.fillStyle = fill;
        g.beginPath();
        g.arc(-2, 0, outerR, -1.18, 1.18, false);
        g.arc(-2 - shiftX, 0, innerR, 1.05, -1.05, true);
        g.closePath();
        g.fill();
      };
      drawCrescent(11.4 * pulse, 9.2 * pulse, 4.4, DANMAKU_INK);
      drawCrescent(10.0 * pulse, 8.6 * pulse, 3.8, pal.mid);
      drawCrescent(8.8, 7.9, 2.8, '#ffffff');
    } else {
      // 4: NieR / Touhou Hollow Annular Ring Orb
      g.fillStyle = DANMAKU_INK;
      g.beginPath();
      g.arc(cx, cy, 10.2 * pulse, 0, TWO_PI, false);
      g.arc(cx, cy, 4.0, 0, TWO_PI, true);
      g.fill('evenodd');

      g.fillStyle = pal.mid;
      g.beginPath();
      g.arc(cx, cy, 8.7 * pulse, 0, TWO_PI, false);
      g.arc(cx, cy, 5.1, 0, TWO_PI, true);
      g.fill('evenodd');

      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.9;
      g.beginPath();
      g.arc(cx, cy, 6.9, 0, TWO_PI);
      g.stroke();
    }
    g.restore();
  }

  danmakuStampCache.set(key, c);
  return c;
}

function drawDanmakuProjectile(
  ctx: CanvasRenderingContext2D,
  b: SnapBullet | InterpBullet,
  shapeIdx: number,
  vx: number,
  vy: number,
  speed: number,
  rawTraveled: number,
  animTimeSec: number,
): void {
  const flags = b.flags ?? 0;
  const paletteIdx = decodeDanmakuPalette(flags);
  const scaleMult = decodeDanmakuScaleMult(flags);
  const isPaused = (flags & BANSUNG_BFLAG_PAUSED) !== 0;
  const pal = DANMAKU_PALETTE_SPECS[paletteIdx] ?? DANMAKU_PALETTE_SPECS[0];

  // Zero-GC tapered ribbon wake while moving (no createLinearGradient per bullet!)
  if (!isPaused && speed > 14 && rawTraveled > 2) {
    const ux = vx / speed;
    const uy = vy / speed;
    const maxTail = (shapeIdx === 1 ? 30 : shapeIdx === 3 ? 22 : 18) * scaleMult;
    const tailLen = Math.min(rawTraveled, clamp(speed * 0.046, 7, maxTail));
    if (tailLen > 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.66;
      ctx.strokeStyle = DANMAKU_INK;
      ctx.lineWidth = 4.2 * scaleMult;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * tailLen * 0.72, b.y - uy * tailLen * 0.72);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.74;
      ctx.strokeStyle = pal.mid;
      ctx.lineWidth = 2.8 * scaleMult;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * tailLen, b.y - uy * tailLen);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.35 * scaleMult;
      ctx.beginPath();
      ctx.moveTo(b.x - ux * tailLen * 0.58, b.y - uy * tailLen * 0.58);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  const cx = Math.round(b.x);
  const cy = Math.round(b.y);
  drawAtlasGlow(
    ctx,
    pal.glow,
    cx,
    cy,
    (isPaused ? 32 : 26) * scaleMult,
    isPaused ? 0.82 : 0.62,
  );

  const stamp = getDanmakuStampStrip(shapeIdx, paletteIdx);
  const rot =
    shapeIdx === 2
      ? animTimeSec * 5.2 + (b.id & 7) * 0.78
      : b.aim;
  const fIdx = ((animTimeSec * 12 + (b.id & 3) * 0.5) | 0) & 1;
  const dstSize = Math.max(16, Math.round(28 * scaleMult));
  const halfDst = dstSize * 0.5;

  ctx.save();
  ctx.translate(cx, cy);
  if (rot !== 0) ctx.rotate(rot);
  if ('spawnAlpha' in b && b.spawnAlpha < 1) {
    ctx.globalAlpha = b.spawnAlpha;
  }
  if (stamp) {
    ctx.drawImage(stamp, fIdx * 32, 0, 32, 32, -halfDst, -halfDst, dstSize, dstSize);
  } else {
    const clipKeys = ['danmaku_orb', 'danmaku_lance', 'danmaku_star', 'danmaku_crescent', 'danmaku_ring'];
    drawBansungSprite(ctx, {
      clipKey: clipKeys[clamp(shapeIdx, 0, 4)],
      x: 0,
      y: 0,
      animTimeSec,
      scale: scaleMult,
      category: 'projectile',
    });
  }
  ctx.restore();

  // Sakuya / Cirno Time-Stop Lock Glint Cross while bullet is suspended in mid-air!
  if (isPaused) {
    const glint = (8.5 + 2.5 * Math.sin(animTimeSec * 22 + b.id)) * scaleMult;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = pal.mid;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - glint, cy);
    ctx.lineTo(cx + glint, cy);
    ctx.moveTo(cx, cy - glint);
    ctx.lineTo(cx, cy + glint);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - glint * 0.72, cy);
    ctx.lineTo(cx + glint * 0.72, cy);
    ctx.moveTo(cx, cy - glint * 0.72);
    ctx.lineTo(cx, cy + glint * 0.72);
    ctx.stroke();
    ctx.restore();
  }
}

const evolvedTracerCache = new Map<string, TracerStyle>();

function getEvolvedTracerStyle(base: TracerStyle, tier: BansungWeaponTier): TracerStyle {
  if (tier <= 1) return base;
  const spec = BANSUNG_WEAPON_TIERS[tier];
  const key = `${base.color}_${base.width}_${tier}`;
  const cached = evolvedTracerCache.get(key);
  if (cached) return cached;

  const isGold = tier === 4;
  const isViolet = tier === 3;
  const outerGlow = isGold
    ? 'rgba(251, 191, 36, 0.85)'
    : isViolet
      ? 'rgba(192, 132, 252, 0.82)'
      : 'rgba(56, 189, 248, 0.80)';
  const style: TracerStyle = {
    color: spec.tracerColor,
    coreColor: '#ffffff',
    outerGlow,
    minLen: Math.round(base.minLen * (1 + (tier - 1) * 0.14)),
    maxLen: Math.round(base.maxLen * (1 + (tier - 1) * 0.18)),
    width: Math.max(base.width * (1 + (tier - 1) * 0.16), 2.4 + (tier - 2) * 0.5),
    additive: true,
  };
  evolvedTracerCache.set(key, style);
  return style;
}

export function resolveTracerStyle(
  kindId: number,
  flags = 0,
  weaponTier = 1,
): TracerStyle {
  if ((flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0) {
    const cfg = getProjectileConfigByKindId(kindId);
    if (cfg) {
      switch (cfg.kind) {
        case 'arcane_fireball':
          return TRACER_PRESETS.enemy_fireball;
        case 'thunder_orb':
        case 'turret_thunder':
          return TRACER_PRESETS.enemy_thunder;
        case 'plasma_bolt':
          return TRACER_PRESETS.enemy_plasma;
        case 'kinetic_md':
        case 'rail_beam':
        case 'turret_bolt':
          return TRACER_PRESETS.enemy_bolt;
        case 'kinetic_sm':
        case 'shotgun_pellet':
        case 'frag_shrapnel':
          return TRACER_PRESETS.enemy_needle;
        default:
          return (flags & BANSUNG_BFLAG_ENERGY) !== 0
            ? TRACER_PRESETS.enemy_plasma
            : TRACER_PRESETS.enemy_orb;
      }
    }
    return (flags & BANSUNG_BFLAG_ENERGY) !== 0
      ? TRACER_PRESETS.enemy_plasma
      : TRACER_PRESETS.enemy_orb;
  }

  let base: TracerStyle = TRACER_PRESETS.kinetic_sm;
  if ((flags & BANSUNG_BFLAG_CRIT) !== 0) {
    base = TRACER_PRESETS.crit_override;
  } else {
    const cfg = getProjectileConfigByKindId(kindId);
    // Spec 007 · C: vệt đạn riêng theo loại đạn của từng khẩu (weapon-fx-profiles.ts)
    const override = cfg ? PROJECTILE_TRACER_OVERRIDES[cfg.kind] : undefined;
    if (override) {
      base = override;
    } else if (cfg) {
      switch (cfg.kind) {
        case 'kinetic_sm':
        case 'twin_smg_bullet':
          base = TRACER_PRESETS.kinetic_sm;
          break;
        case 'kinetic_md':
          base = TRACER_PRESETS.kinetic_md;
          break;
        case 'shotgun_pellet':
        case 'frag_shrapnel':
          base = TRACER_PRESETS.shotgun_pellet;
          break;
        case 'plasma_bolt':
        case 'plasma_pellet':
        case 'chronos_slug':
          base = TRACER_PRESETS.plasma_bolt;
          break;
        case 'rail_beam':
        case 'ion_lance':
        case 'phantom_arrow':
          base = TRACER_PRESETS.rail_beam;
          break;
        case 'turret_bolt':
          base = TRACER_PRESETS.turret_bolt;
          break;
        case 'arcane_fireball':
        case 'flame_stream_orb':
        case 'magma_glob':
          base = TRACER_PRESETS.arcane_fireball;
          break;
        case 'arcane_ember':
        case 'gravity_orb':
        case 'void_cannon_orb':
          base = TRACER_PRESETS.arcane_ember;
          break;
        case 'cryo_shard':
        case 'blizzard_bolt':
          base = TRACER_PRESETS.plasma_bolt;
          break;
        case 'saw_disc':
        case 'ricochet_blade':
          base = TRACER_PRESETS.kinetic_md;
          break;
        case 'thunder_orb':
        case 'turret_thunder':
        case 'electric_arc_bolt':
        case 'tesla_arc':
          base = TRACER_PRESETS.thunder_orb;
          break;
        case 'sniper_slug':
        case 'laser_map_beam':
          base = TRACER_PRESETS.rail_beam;
          break;
        case 'rocket':
        case 'cluster_rocket':
        case 'orbital_shell':
          base = TRACER_PRESETS.rocket;
          break;
        default:
          break;
      }
    } else if ((flags & BANSUNG_BFLAG_ENERGY) !== 0) {
      base = TRACER_PRESETS.plasma_bolt;
    } else if ((flags & BANSUNG_BFLAG_PIERCE) !== 0) {
      base = TRACER_PRESETS.kinetic_md;
    }
  }

  const tier = normalizeWeaponTier(weaponTier);
  if (tier >= 2) {
    return getEvolvedTracerStyle(base, tier);
  }
  return base;
}

/**
 * Velocity-clamped tracer ribbon renderer (d22 §3).
 * Tail length clamps to `min(traveledPx, clamp(speed * 0.048, minLen, maxLen))`
 * so newly fired bullets never poke behind the shooter's back on frame 0.
 * Optional `weaponTier` (`1..4`) scales evolved tracer flair/width without heap allocs.
 */
export function drawTracerRibbon(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  dirX: number,
  dirY: number,
  speedPxPerSec: number,
  traveledPx: number,
  preset: TracerStyle,
  flags = 0,
  weaponTier = 1,
): void {
  const dirLen = Math.hypot(dirX, dirY);
  if (dirLen <= 1e-5 || speedPxPerSec <= 1) return;
  const ux = dirX / dirLen;
  const uy = dirY / dirLen;

  const isEnemy =
    (flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0 && preset !== TRACER_PRESETS.crit_override;
  const isHoming = (flags & BANSUNG_BFLAG_HOMING) !== 0;
  const evoTier = !isEnemy ? normalizeWeaponTier(weaponTier) : 1;
  const effStyle = evoTier >= 2 ? getEvolvedTracerStyle(preset, evoTier) : preset;

  const velLen = clamp(speedPxPerSec * (isEnemy ? 0.062 : 0.048), effStyle.minLen, effStyle.maxLen);
  const tailLen = Math.min(Math.max(0, traveledPx), velLen);
  if (tailLen < 1.5) return;

  const tailX = bx - ux * tailLen;
  const tailY = by - uy * tailLen;

  const mainColor = isEnemy && effStyle === TRACER_PRESETS.kinetic_sm ? '#ff5e3a' : effStyle.color;
  const outerGlow =
    isEnemy && effStyle === TRACER_PRESETS.kinetic_sm
      ? 'rgba(255, 94, 58, 0.85)'
      : effStyle.outerGlow;

  ctx.save();
  ctx.lineCap = 'butt';

  if (isEnemy) {
    const casingStartX = bx - ux * tailLen * 0.92;
    const casingStartY = by - uy * tailLen * 0.92;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.86;
    ctx.lineWidth = effStyle.width + 2.6;
    ctx.strokeStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.moveTo(casingStartX, casingStartY);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (effStyle.additive || isHoming) {
    ctx.globalCompositeOperation = 'lighter';
  }
  const grad = ctx.createLinearGradient(tailX, tailY, bx, by);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(isEnemy ? 0.35 : 0.55, outerGlow);
  grad.addColorStop(1, mainColor);

  ctx.lineWidth = effStyle.width + (isHoming ? 0.8 : 0);
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(bx, by);
  ctx.stroke();

  // Sharp inner core along leading 65%-75% of tracer (thickened for enemy clarity & Tier 3-4)
  const coreFrac = isEnemy ? 0.78 : 0.65;
  const coreStartX = bx - ux * tailLen * coreFrac;
  const coreStartY = by - uy * tailLen * coreFrac;
  ctx.lineWidth = isEnemy ? 1.8 : evoTier >= 3 ? 1.5 : 1.2;
  ctx.strokeStyle = effStyle.coreColor;
  ctx.beginPath();
  ctx.moveTo(coreStartX, coreStartY);
  ctx.lineTo(bx, by);
  ctx.stroke();

  if (isEnemy) {
    ctx.fillStyle = effStyle.coreColor;
    ctx.fillRect(Math.round(bx - 1.5), Math.round(by - 1.5), 3, 3);
  }
  ctx.restore();
}

/**
 * Emits a 2.5D spinning shell casing into `bansungFx` (d22 §5).
 */
export function spawnWeaponCasing(
  x: number,
  y: number,
  aimRad: number,
  isShotgun = false,
  shooterVx = 0,
  shooterVy = 0,
): void {
  const cos = Math.cos(aimRad);
  const sin = Math.sin(aimRad);
  bansungFx.spawnCasing(
    isShotgun ? 'shell' : 'brass',
    x - cos * 4,
    y - sin * 4,
    aimRad,
    shooterVx,
    shooterVy,
  );
}

/**
 * Draws a tapered beam trail (railgun cyan, lightning/sandstorm sweep, or boss laser)
 * with quadratic width decay and 3 diamond pixel chevrons along its span.
 */
export function drawBeamTrail(
  ctx: CanvasRenderingContext2D,
  beam: Readonly<BeamTrail>,
): void {
  if (!beam.active) return;
  const p = clamp(beam.ageMs / Math.max(1, beam.ttlMs), 0, 1);
  const decay = (1 - p) * (1 - p);
  if (decay <= 0.01) return;

  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const len = Math.hypot(dx, dy);
  if (len <= 1) return;

  const isBossEye = beam.kind === BANSUNG_FX_BEAM_BOSS_EYE;
  const isBossLaser = beam.kind === BANSUNG_FX_BEAM_BOSS_LASER;
  const isMapLaser = beam.kind === BANSUNG_FX_BEAM_LASER_MAP;
  const isBossBeam = isBossEye || isBossLaser || isMapLaser;
  const isYellowLightning = beam.kind === BANSUNG_FX_BEAM_YELLOW_LIGHTNING;
  const isJagged =
    beam.kind === BANSUNG_FX_BEAM_CHAIN ||
    beam.kind === BANSUNG_FX_BEAM_SHOCK ||
    isYellowLightning;

  const outerColor = isMapLaser
    ? '#f43f5e'
    : isBossLaser
      ? '#ff2a6d'
      : isBossEye
        ? '#ff5964'
        : isYellowLightning
          ? '#facc15'
          : beam.kind === BANSUNG_FX_BEAM_SHOCK
            ? '#38bdf8'
            : beam.kind === BANSUNG_FX_BEAM_CHAIN
              ? '#74c0fc'
              : '#2ce8f5';
  const coreColor = isMapLaser
    ? '#ffffff'
    : isBossLaser
      ? '#fff5f7'
      : isBossEye
        ? '#fff0f3'
        : isYellowLightning
          ? '#fef9c3'
          : beam.kind === BANSUNG_FX_BEAM_SHOCK
            ? '#fff9db'
            : '#e7f5ff';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';

  // Outer glow pass
  ctx.globalAlpha = clamp((isBossBeam ? 0.85 : 0.68) * decay, 0, 1);
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = Math.max(1.5, beam.width * (1.8 * decay));
  ctx.beginPath();
  if (isJagged) {
    const segs = beam.kind === BANSUNG_FX_BEAM_SHOCK ? 8 : 7;
    const nx = -dy / len;
    const ny = dx / len;
    let s = (beam.seed ^ ((beam.ageMs / 45) | 0)) >>> 0;
    ctx.moveTo(beam.x1, beam.y1);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      s = lcgNext(s);
      const jitter = (((s & 255) / 255) - 0.5) * (beam.kind === BANSUNG_FX_BEAM_SHOCK ? 16 : 14) * decay;
      ctx.lineTo(beam.x1 + dx * t + nx * jitter, beam.y1 + dy * t + ny * jitter);
    }
    ctx.lineTo(beam.x2, beam.y2);
  } else {
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.x2, beam.y2);
  }
  ctx.stroke();

  // Sharp inner white/ice core
  ctx.globalAlpha = clamp(0.95 * decay, 0, 1);
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = Math.max(1, beam.width * 0.45 * decay);
  ctx.stroke();

  // 3 diamond pixel chevrons along rail / boss beams
  if (!isJagged) {
    ctx.fillStyle = coreColor;
    const sz = Math.max(2, Math.round((isBossBeam ? 4 : 3) * decay));
    for (let i = 1; i <= 3; i++) {
      const t = i * 0.25;
      const cx = Math.round(beam.x1 + dx * t);
      const cy = Math.round(beam.y1 + dy * t);
      ctx.fillRect(cx - sz, cy - 1, sz * 2, 2);
      ctx.fillRect(cx - 1, cy - sz, 2, sz * 2);
    }
  }
  ctx.restore();
}

/**
 * Draws one additive muzzle flash cone + radial atlas glow stamp.
 */
/**
 * Vẽ hình phụ của chớp nòng trong hệ toạ độ đã xoay theo hướng bắn (+x = hướng nòng).
 * Chỉ dùng fillRect / path đơn giản, không cấp phát.
 */
function drawMuzzleAccent(
  ctx: CanvasRenderingContext2D,
  flash: Readonly<MuzzleFlash>,
  fade: number,
  frameIdx: number,
): void {
  const a = flash.accent;
  if (a === 'none') return;
  const s = flash.scale;
  const jitter = ((flash.seed >>> 3) & 7) - 3.5;
  ctx.fillStyle = flash.tint;
  switch (a) {
    case 'cone': {
      const reach = Math.round((10 + 8 * fade) * s);
      ctx.globalAlpha = 0.7 * fade;
      ctx.beginPath();
      ctx.moveTo(2, -3 * s);
      ctx.lineTo(reach, -1);
      ctx.lineTo(reach, 1);
      ctx.lineTo(2, 3 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'long': {
      const len = Math.round((44 + 30 * fade) * s);
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillRect(0, -Math.max(1, Math.round(2 * s * fade)), len, Math.max(2, Math.round(4 * s * fade)));
      ctx.fillStyle = flash.core;
      ctx.fillRect(0, -1, Math.round(len * 0.7), 2);
      // vòng xung kích nhỏ ở đầu nòng
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillRect(-1, -Math.round(9 * s), 2, Math.round(18 * s));
      break;
    }
    case 'fan': {
      const reach = Math.round((22 + 10 * fade) * s);
      ctx.globalAlpha = 0.55 * fade;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(reach, -reach * 0.55);
      ctx.lineTo(reach + 4, 0);
      ctx.lineTo(reach, reach * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash.core;
      for (let i = -2; i <= 2; i++) {
        const py = Math.round(i * reach * 0.2 + jitter * 0.3);
        ctx.fillRect(Math.round(reach * 0.55), py, 3, 2);
      }
      break;
    }
    case 'ring': {
      const r = Math.round((5 + 9 * (1 - fade)) * s);
      ctx.globalAlpha = 0.8 * fade;
      ctx.strokeStyle = flash.tint;
      ctx.lineWidth = Math.max(1, 2 * s * fade);
      ctx.beginPath();
      ctx.ellipse(4, 0, r * 0.55, r, 0, 0, TWO_PI);
      ctx.stroke();
      ctx.fillStyle = flash.core;
      ctx.fillRect(2, -1, 4, 2);
      break;
    }
    case 'star': {
      const span = Math.round((6 + 6 * fade) * s);
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillRect(4 - span, -1, span * 2, 2);
      ctx.fillRect(3, -span, 2, span * 2);
      ctx.fillStyle = flash.core;
      ctx.fillRect(2, -2, 4, 4);
      break;
    }
    case 'spray': {
      ctx.globalAlpha = 0.5 * fade;
      for (let i = 0; i < 5; i++) {
        const d = (8 + i * 7) * s;
        const w = (3 + i * 2) * s;
        const off = ((flash.seed >>> (i * 3)) & 7) - 3.5;
        ctx.fillRect(Math.round(d), Math.round(-w * 0.5 + off), Math.round(5 * s), Math.round(w));
      }
      break;
    }
    case 'arc': {
      ctx.globalAlpha = 0.95 * fade;
      ctx.strokeStyle = flash.tint;
      ctx.lineWidth = Math.max(1, 1.6 * s);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      let seed = flash.seed + frameIdx * 977;
      for (let i = 1; i <= 5; i++) {
        seed = lcgNext(seed);
        const off = ((seed >>> 8) % 13) - 6;
        ctx.lineTo(Math.round(i * 6 * s), Math.round(off * s * 0.6));
      }
      ctx.stroke();
      ctx.fillStyle = flash.core;
      ctx.fillRect(-1, -1, 3, 3);
      break;
    }
    case 'backblast': {
      // Nón lửa phía trước + luồng khí xả ra sau ống phóng
      ctx.globalAlpha = 0.7 * fade;
      ctx.beginPath();
      ctx.moveTo(0, -4 * s);
      ctx.lineTo(Math.round(16 * s), 0);
      ctx.lineTo(0, 4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.45 * fade;
      const back = Math.round((28 + 14 * fade) * s);
      ctx.beginPath();
      ctx.moveTo(Math.round(-18 * s), -3 * s);
      ctx.lineTo(Math.round(-18 * s) - back, Math.round(-9 * s));
      ctx.lineTo(Math.round(-18 * s) - back, Math.round(9 * s));
      ctx.lineTo(Math.round(-18 * s), 3 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.globalAlpha = clamp(0.95 * fade, 0, 1);
}

export function drawMuzzleFlashAdditive(
  ctx: CanvasRenderingContext2D,
  flash: Readonly<MuzzleFlash>,
): void {
  if (!flash.active) return;
  const p = clamp(flash.ageMs / Math.max(1, flash.ttlMs), 0, 1);
  const fade = 1 - p;
  if (fade <= 0.01) return;

  const tier = normalizeWeaponTier(flash.weaponTier);
  const tierSpec = BANSUNG_WEAPON_TIERS[tier];
  const isEnergy =
    flash.style === 'plasma' || flash.style === 'laser' || flash.style === 'emp';
  const glowKind: AtlasGlowKind =
    tier === 3
      ? 'violet'
      : tier === 2 && !isEnergy
        ? 'cyan'
        : isEnergy
          ? 'cyan'
          : flash.style === 'flame'
            ? 'crimson'
            : 'fire';
  const glowDia = (28 + flash.scale * 16 + (tier - 1) * 10) * (0.65 + 0.35 * fade);
  drawAtlasGlow(ctx, glowKind, flash.x, flash.y, glowDia, Math.min(0.82, (0.48 + (tier - 1) * 0.1) * fade));
  if (tier >= 4) {
    drawAtlasGlow(ctx, 'white', flash.x, flash.y, glowDia * 0.62, 0.55 * fade);
  }

  const clipKey = isEnergy
    ? 'muzzle_plasma'
    : flash.style === 'shotgun' || flash.style === 'flame'
      ? 'muzzle_flash'
      : 'fx_muzzle_kinetic';

  const frameIdx = Math.min(2, (p * 3) | 0);
  const meta = getClipMeta(clipKey);
  const img = meta ? getSpriteImage(meta.url) : null;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(0.95 * fade, 0, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(flash.x), Math.round(flash.y));
  ctx.rotate(flash.angle);

  let drewSheet = false;
  if (meta && img && img.complete && img.naturalWidth > 0) {
    const rect = resolveFrameRect(meta, frameIdx, img.naturalWidth, img.naturalHeight);
    if (rect) {
      const s = flash.scale;
      ctx.drawImage(
        img,
        rect.sx,
        rect.sy,
        rect.sw,
        rect.sh,
        Math.round(meta.offX * s),
        Math.round(meta.offY * s),
        Math.round(rect.sw * s),
        Math.round(rect.sh * s),
      );
      drewSheet = true;
    }
  }

  if (!drewSheet) {
    // Fallback to procedural cone strip baked into `bansungFx.getAtlas()` (x=128..223, y=32..63)
    const atlas = bansungFx.getAtlas();
    if (atlas) {
      const sx = 128 + frameIdx * 32;
      const s = flash.scale * 0.9;
      ctx.drawImage(
        atlas,
        sx,
        32,
        32,
        32,
        Math.round(-4 * s),
        Math.round(-16 * s),
        Math.round(32 * s),
        Math.round(32 * s),
      );
    } else {
      const reach = Math.round(14 * flash.scale * (0.7 + 0.4 * fade));
      const spread = Math.round(6 * flash.scale);
      ctx.fillStyle = tier >= 2 ? tierSpec.auraColor : isEnergy ? '#4dabf7' : '#ff922b';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(reach, -spread);
      ctx.lineTo(reach + 4, 0);
      ctx.lineTo(reach, spread);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -1, Math.max(4, (reach * 0.55) | 0), 2);
    }
  }

  // Spec 007 · C: hình phụ riêng theo súng (nón dài, quạt, vòng, sao, phun, điện, xả ngược)
  drawMuzzleAccent(ctx, flash, fade, frameIdx);

  // Tier 2-4 evolved pixel star-flare accents at muzzle origin
  if (tier >= 2 && frameIdx <= 1) {
    const flareSpan = Math.round((4 + tier * 2.5) * fade);
    ctx.fillStyle = tierSpec.auraColor;
    ctx.fillRect(-1, -flareSpan, 2, flareSpan * 2);
    if (tier >= 3) {
      ctx.fillRect(0, -1, flareSpan + 4, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1, -Math.max(2, (flareSpan * 0.55) | 0), 2, Math.max(4, flareSpan));
    }
  }
  ctx.restore();
}

// ============================================================================
// 2. d23 Stun Shockwave Rings, Screen Flashbang, Orbiting Stars & Arcs
// ============================================================================

export const MAX_SHOCKWAVES = 24;
export const MAX_ARCS = 32;

export const STUN_FX_CONST = {
  RING_LINE_BASE: 5,
  RING_COLOR_EMP: '#4dabf7',
  RING_COLOR_EMP_CORE: '#e7f5ff',
  RING_COLOR_SLAM: '#ff922b',
  RING_COLOR_SLAM_CORE: '#fff3bf',
  RING_COLOR_CONCUSS: '#ffd43b',
  RING_COLOR_CONCUSS_CORE: '#ffffff',
  RING_COLOR_HEAL: '#69db7c',
  RING_COLOR_HEAL_CORE: '#ebfbee',
  RING_COLOR_VIOLET: '#c084fc',
  RING_COLOR_VIOLET_CORE: '#f3e8ff',

  STAR_ORBIT_MS: 1100,
  STAR_COUNT: 3,
  STAR_BOSS_COUNT: 4,
  STAR_BOB_AMP: 2,
  STAR_SIZE: 16,
  STAR_CROWD_LOD_COUNT: 16,
  STAR_CROWD_LOD_RADIUS: 24,

  ARC_STEP_MS: 45,
  ARC_SEGMENTS: 6,
  ARC_JITTER: 9,

  FLASH_MAX_ALPHA: 0.62,
  FLASH_ATTACK_MS: 35,
  FLASH_DECAY_MS: 650,
  FLASH_REDUCED_SCALE: 0.45,

  JITTER_STEP_MS: 33,
  JITTER_OFFSET_PX: 1,
  ENTRY_FLASH_MS: 90,
  BODY_TINT_PERIOD_MS: 270,
  BODY_TINT_ALPHA: 0.25,
  BODY_TINT_COLOR: '#22d3ee',
} as const;

/** 0 = Cyan EMP, 1 = Amber Boss Slam, 2 = Gold Concussion, 3 = Emerald Heal, 4 = Violet Awakened */
export type StunRingVariant = 0 | 1 | 2 | 3 | 4;

export interface StunRing {
  active: boolean;
  x: number;
  y: number;
  maxRadius: number;
  variant: StunRingVariant;
  ageMs: number;
  ttlMs: number;
  drawThunderball: boolean;
  colorOverride: string;
}

export interface StunArc {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ageMs: number;
  ttlMs: number;
  variant: 0 | 1;
  seed: number;
}

export interface FlashbangState {
  active: boolean;
  ageMs: number;
  peakAlpha: number;
  tintColor: string;
}

export interface StunPoseResult {
  readonly jx: number;
  readonly jy: number;
  readonly freezeFrame: number;
  readonly whiteAlpha: number;
  readonly cyanAlpha: number;
  readonly cyanColor: string;
}

/**
 * Computes crisp stunned freeze-jitter offset, entry white flash & pulsing cyan static overlay (d23).
 */
export function resolveStunPose(
  unitId: number,
  lastAnimFrame: number,
  stunEnteredAtMs: number,
  isBoss = false,
  nowMs?: number,
): StunPoseResult {
  const now = resolveNowMs(nowMs);
  const elapsed = Math.max(0, now - stunEnteredAtMs);
  const step = (elapsed / STUN_FX_CONST.JITTER_STEP_MS) | 0;
  const jx = isBoss
    ? (step % 4 < 2 ? 1 : -1) * (((step + unitId) & 1) === 0 ? 1 : 0)
    : ((step + unitId) & 1) === 0
      ? STUN_FX_CONST.JITTER_OFFSET_PX
      : -STUN_FX_CONST.JITTER_OFFSET_PX;

  const whiteAlpha =
    elapsed < STUN_FX_CONST.ENTRY_FLASH_MS
      ? (1 - elapsed / STUN_FX_CONST.ENTRY_FLASH_MS) * 0.9
      : 0;
  const cyanPulse =
    0.5 + 0.5 * Math.sin((elapsed / STUN_FX_CONST.BODY_TINT_PERIOD_MS) * TWO_PI);

  return {
    jx,
    jy: 0,
    freezeFrame: Math.max(0, lastAnimFrame | 0),
    whiteAlpha,
    cyanAlpha: cyanPulse * STUN_FX_CONST.BODY_TINT_ALPHA,
    cyanColor: STUN_FX_CONST.BODY_TINT_COLOR,
  };
}

let fallbackStarCanvas: HTMLCanvasElement | null = null;

function getFallbackStunStarSheet(): HTMLCanvasElement | null {
  if (fallbackStarCanvas) return fallbackStarCanvas;
  const c = createCanvas(32, 16);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  for (let f = 0; f < 2; f++) {
    const ox = f * 16 + 8;
    const oy = 8;
    g.fillStyle = OUTLINE_INK;
    g.fillRect(ox - 5, oy - 1, 10, 2);
    g.fillRect(ox - 1, oy - 5, 2, 10);
    g.fillStyle = '#ffd43b';
    g.fillRect(ox - 4, oy - 1, 8, 2);
    g.fillRect(ox - 1, oy - 4, 2, 8);
    g.fillRect(ox - 2, oy - 2, 4, 4);
    g.fillStyle = '#fff9db';
    g.fillRect(ox - 1, oy - 1, 2, 2);
    if (f === 1) {
      g.fillStyle = '#4dabf7';
      g.fillRect(ox - 3, oy - 3, 1, 1);
      g.fillRect(ox + 2, oy + 2, 1, 1);
    }
  }
  fallbackStarCanvas = c;
  return c;
}

/**
 * Draws either the back pass (`frontPass = false`, behind sprite) or front pass (`frontPass = true`)
 * of 16x16 pixelated stun stars orbiting above the stunned unit's head (d23).
 */
export function drawOverheadStunStars(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  spriteH: number,
  unitRadius: number,
  unitId: number,
  count: number,
  frontPass: boolean,
  totalStunned = 1,
  nowMs?: number,
): void {
  const crowded = totalStunned > STUN_FX_CONST.STAR_CROWD_LOD_COUNT;
  if (crowded && !frontPass) return;

  const starCount = crowded ? 2 : clamp(count | 0, 1, 4);
  const now = resolveNowMs(nowMs);
  const orbitPhase =
    ((now % STUN_FX_CONST.STAR_ORBIT_MS) / STUN_FX_CONST.STAR_ORBIT_MS) * TWO_PI;
  const idSeed = ((unitId * 0.6180339887) % 1) * TWO_PI;
  const rx = Math.max(12, unitRadius * 0.88);
  const ry = 4.5;
  const headY = footY - spriteH - 6;
  const frameIdx = ((now / 150) | 0) & 1;

  const meta = getClipMeta('fx_stun_star');
  const img = meta ? getSpriteImage(meta.url) : null;
  const atlas = bansungFx.getAtlas();
  const fallbackSheet = getFallbackStunStarSheet();

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < starCount; i++) {
    const angle = orbitPhase + idSeed + (i * TWO_PI) / starCount;
    const sinA = Math.sin(angle);
    const isFront = crowded ? true : sinA >= 0;
    if (isFront !== frontPass) continue;

    const bobY = crowded ? 0 : Math.sin(angle * 2) * STUN_FX_CONST.STAR_BOB_AMP;
    const sx = Math.round(x + Math.cos(angle) * rx - 8);
    const sy = Math.round(headY + sinA * ry + bobY - 8);
    ctx.globalAlpha = sinA >= 0 ? 1 : 0.72;

    if (meta && img && img.complete && img.naturalWidth > 0) {
      const rect = resolveFrameRect(
        meta,
        frameIdx % Math.max(1, meta.frames),
        img.naturalWidth,
        img.naturalHeight,
      );
      if (rect) {
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, sx, sy, 16, 16);
        continue;
      }
    }
    if (atlas) {
      ctx.drawImage(atlas, 224 + frameIdx * 16, 32, 16, 16, sx, sy, 16, 16);
      continue;
    }
    if (fallbackSheet) {
      ctx.drawImage(fallbackSheet, frameIdx * 16, 0, 16, 16, sx, sy, 16, 16);
      continue;
    }
    ctx.fillStyle = '#ffd43b';
    ctx.fillRect(sx + 5, sy + 7, 6, 2);
    ctx.fillRect(sx + 7, sy + 5, 2, 6);
  }
  ctx.restore();
}

/**
 * Stepped 45ms crackle electric arc rendered with additive glow outer line + crisp 1px inner core (d23).
 */
export function drawElectricArc(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  progress01: number,
  variant: 0 | 1 = 0,
  nowMs?: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 1) return;

  const fade = clamp(1 - progress01, 0, 1);
  if (fade <= 0.01) return;

  const now = resolveNowMs(nowMs);
  const bucket = (now / STUN_FX_CONST.ARC_STEP_MS) | 0;
  let state = (Math.imul(seed | 0, 7919) + Math.imul(bucket, 104729)) >>> 0;

  const nx = -dy / len;
  const ny = dx / len;
  const segs = STUN_FX_CONST.ARC_SEGMENTS;
  const jitterAmp = STUN_FX_CONST.ARC_JITTER * (0.4 + 0.6 * fade);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'square';

  ctx.beginPath();
  ctx.moveTo(Math.round(x1), Math.round(y1));
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    state = lcgNext(state);
    const r = ((state & 1023) / 1023 - 0.5) * 2;
    const envelope = Math.sin(t * Math.PI);
    const px = x1 + dx * t + nx * r * jitterAmp * envelope;
    const py = y1 + dy * t + ny * r * jitterAmp * envelope;
    ctx.lineTo(Math.round(px), Math.round(py));
  }
  ctx.lineTo(Math.round(x2), Math.round(y2));

  ctx.globalAlpha = clamp(0.76 * fade, 0, 1);
  ctx.strokeStyle = variant === 1 ? '#ff922b' : '#4dabf7';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.globalAlpha = clamp(0.98 * fade, 0, 1);
  ctx.strokeStyle = variant === 1 ? '#fff3bf' : '#e7f5ff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function drawStunRing(ctx: CanvasRenderingContext2D, ring: Readonly<StunRing>): void {
  if (!ring.active) return;
  const p = clamp(ring.ageMs / Math.max(1, ring.ttlMs), 0, 1);
  const ease = easeOutQuad(p);
  const r = Math.max(4, ring.maxRadius * (0.14 + 0.86 * ease));
  const alpha = clamp((1 - p) * (1 - p * 0.35), 0, 1);
  if (alpha <= 0.01) return;

  const outerColor =
    ring.colorOverride ||
    (ring.variant === 1
      ? STUN_FX_CONST.RING_COLOR_SLAM
      : ring.variant === 2
        ? STUN_FX_CONST.RING_COLOR_CONCUSS
        : ring.variant === 3
          ? STUN_FX_CONST.RING_COLOR_HEAL
          : ring.variant === 4
            ? STUN_FX_CONST.RING_COLOR_VIOLET
            : STUN_FX_CONST.RING_COLOR_EMP);

  const coreColor =
    ring.variant === 1
      ? STUN_FX_CONST.RING_COLOR_SLAM_CORE
      : ring.variant === 2
        ? STUN_FX_CONST.RING_COLOR_CONCUSS_CORE
        : ring.variant === 3
          ? STUN_FX_CONST.RING_COLOR_HEAL_CORE
          : ring.variant === 4
            ? STUN_FX_CONST.RING_COLOR_VIOLET_CORE
            : STUN_FX_CONST.RING_COLOR_EMP_CORE;

  if (ring.variant === 0) {
    drawAtlasGlow(ctx, 'cyan', ring.x, ring.y, r * 0.9, 0.25 * (1 - p));
    if (ring.drawThunderball && p < 0.72) {
      drawBansungSprite(ctx, {
        clipKey: 'thunderball',
        x: Math.round(ring.x),
        y: Math.round(ring.y),
        animTimeSec: ring.ageMs * 0.001,
        scale: clamp(ring.maxRadius / 110, 0.45, 1.3),
        alpha: 0.55 * (1 - p / 0.72),
        category: 'vfx',
      });
    }
  } else if (ring.variant === 1) {
    drawAtlasGlow(ctx, 'fire', ring.x, ring.y, r * 0.85, 0.22 * (1 - p));
  } else if (ring.variant === 3) {
    drawAtlasGlow(ctx, 'emerald', ring.x, ring.y, r * 0.75, 0.22 * (1 - p));
  } else if (ring.variant === 4) {
    drawAtlasGlow(ctx, 'violet', ring.x, ring.y, r * 0.8, 0.28 * (1 - p));
  } else if (ring.variant === 2) {
    drawAtlasGlow(ctx, 'fire', ring.x, ring.y, r * 0.75, 0.24 * (1 - p));
  }

  ctx.save();
  const lw = Math.max(1.5, STUN_FX_CONST.RING_LINE_BASE * (1 - 0.58 * ease));

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha * 0.42;
  ctx.strokeStyle = OUTLINE_INK;
  ctx.lineWidth = lw + 2;
  ctx.beginPath();
  ctx.arc(Math.round(ring.x), Math.round(ring.y), r, 0, TWO_PI);
  ctx.stroke();

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = lw;
  ctx.stroke();

  if (r > 12) {
    ctx.globalAlpha = alpha * 0.72;
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = Math.max(1, lw * 0.42);
    ctx.beginPath();
    ctx.arc(Math.round(ring.x), Math.round(ring.y), r * 0.84, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScreenFlashOverlay(
  ctx: CanvasRenderingContext2D,
  screenW: number,
  screenH: number,
  state: Readonly<FlashbangState>,
): void {
  if (!state.active || state.peakAlpha <= 0.005) return;
  let alpha = 0;
  if (state.ageMs < STUN_FX_CONST.FLASH_ATTACK_MS) {
    alpha = state.peakAlpha * (state.ageMs / STUN_FX_CONST.FLASH_ATTACK_MS);
  } else {
    const decayElapsed = state.ageMs - STUN_FX_CONST.FLASH_ATTACK_MS;
    const t = clamp(decayElapsed / STUN_FX_CONST.FLASH_DECAY_MS, 0, 1);
    alpha = state.peakAlpha * (1 - t) * Math.exp(-t * 1.45);
  }
  if (alpha <= 0.004) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, STUN_FX_CONST.FLASH_MAX_ALPHA);
  ctx.fillStyle = state.tintColor;
  ctx.fillRect(0, 0, screenW, screenH);
  ctx.restore();
}

// ============================================================================
// 3. d24 2.5D Z-Arc Bombs, Scaling Shadows, Telegraphs & 5-Layer Blasts
// ============================================================================

export const BOMB_FX = {
  Z_PROJ: 0.85,
  SHADOW_MIN_SCALE: 0.42,
  SHADOW_REF_Z: 140,
  SHADOW_BASE_ALPHA: 0.55,
  SHADOW_MIN_ALPHA: 0.25,
  URGENCY_MS: 350,
  BEEP_STEP_MS: 70,
  EXPLOSION_FLASH_MS: 70,
  EXPLOSION_SHOCKWAVE_MS: 220,
  MAX_BOMBS: 64,
  MAX_EXPLOSIONS: 32,
} as const;

export const BOMB_RADII: Readonly<Record<string, number>> = {
  frag: 96,
  stun: BANSUNG_GADGETS.stun_bomb.radius,
  cluster: BANSUNG_GADGETS.cluster_bomb.radius,
  cluster_sub: Math.round(BANSUNG_GADGETS.cluster_bomb.radius * 0.58),
  mortar: 132,
  mine: 88,
  goblin_bomb: 72,
  rocket: 84,
  fireball: 64,
};

export type BombKind =
  | 'frag'
  | 'stun'
  | 'cluster'
  | 'cluster_sub'
  | 'mortar'
  | 'mine'
  | 'goblin_bomb';

export type BlastStyle = 'he' | 'stun' | 'cluster' | 'fireball' | 'emp' | 'steam';

export interface BombFxState {
  active: boolean;
  id: number;
  kind: BombKind;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  z: number;
  angle: number;
  spinRadPerSec: number;
  radius: number;
  peakZ: number;
  bounces: 0 | 1 | 2;
  bounceIdx: number;
  flightMs: number;
  fuseMs: number;
  elapsedMs: number;
  lastBeepBucket: number;
  armed: boolean;
  serverSynced?: boolean;
}

export interface BombExplosionEvent {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  style: BlastStyle;
  ageMs: number;
  ttlMs: number;
  seed: number;
}

const BOUNCE_WEIGHTS_1 = [0.68, 0.32] as const;
const BOUNCE_WEIGHTS_2 = [0.56, 0.28, 0.16] as const;

export function evalBombKinematics(bomb: BombFxState, dtMs: number): void {
  if (!bomb.active) return;
  bomb.elapsedMs += dtMs;

  if (bomb.kind === 'mine') {
    bomb.z = 0;
    bomb.armed = bomb.elapsedMs >= Math.min(350, bomb.flightMs);
    return;
  }

  if (bomb.elapsedMs < bomb.flightMs && bomb.flightMs > 0) {
    const p = clamp(bomb.elapsedMs / bomb.flightMs, 0, 1);
    const easedPos = Math.pow(p, 0.84);
    if (!bomb.serverSynced) {
      bomb.x = bomb.startX + (bomb.targetX - bomb.startX) * easedPos;
      bomb.y = bomb.startY + (bomb.targetY - bomb.startY) * easedPos;
    }
    bomb.angle += bomb.spinRadPerSec * (dtMs * 0.001);

    let newBounceIdx = 0;
    let u = p;
    let bouncePeak = bomb.peakZ;

    if (bomb.bounces === 1) {
      if (p < BOUNCE_WEIGHTS_1[0]) {
        u = p / BOUNCE_WEIGHTS_1[0];
        newBounceIdx = 0;
      } else {
        u = (p - BOUNCE_WEIGHTS_1[0]) / BOUNCE_WEIGHTS_1[1];
        newBounceIdx = 1;
        bouncePeak = bomb.peakZ * 0.42;
      }
    } else if (bomb.bounces === 2) {
      const t1 = BOUNCE_WEIGHTS_2[0];
      const t2 = t1 + BOUNCE_WEIGHTS_2[1];
      if (p < t1) {
        u = p / BOUNCE_WEIGHTS_2[0];
        newBounceIdx = 0;
      } else if (p < t2) {
        u = (p - t1) / BOUNCE_WEIGHTS_2[1];
        newBounceIdx = 1;
        bouncePeak = bomb.peakZ * 0.42;
      } else {
        u = (p - t2) / BOUNCE_WEIGHTS_2[2];
        newBounceIdx = 2;
        bouncePeak = bomb.peakZ * 0.18;
      }
    }

    if (newBounceIdx > bomb.bounceIdx) {
      bomb.bounceIdx = newBounceIdx;
      emitRadialBurst(
        FxKind.Dust,
        FxLayer.World,
        FxPrio.Low,
        bomb.x,
        bomb.y,
        4,
        14,
        42,
        160,
        280,
        2.5,
        FxColor.Sand,
      );
      playBansungSfx('bomb_bounce', { x: bomb.x, y: bomb.y, vol: 0.5 });
    }

    bomb.z = Math.max(0, 4 * bouncePeak * u * (1 - u));
    bomb.armed = false;
  } else {
    if (!bomb.serverSynced) {
      bomb.x = bomb.targetX;
      bomb.y = bomb.targetY;
    } else {
      bomb.targetX = bomb.x;
      bomb.targetY = bomb.y;
    }
    if (bomb.z > 0) {
      emitRadialBurst(
        FxKind.Dust,
        FxLayer.World,
        FxPrio.Low,
        bomb.x,
        bomb.y,
        5,
        18,
        48,
        180,
        300,
        3,
        FxColor.Dust,
      );
      if (bomb.bounces > 0) {
        playBansungSfx('bomb_bounce', { x: bomb.x, y: bomb.y, vol: 0.4 });
      }
    }
    bomb.z = 0;
    bomb.armed = true;
  }
}

export function drawBombShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  radiusScale = 1,
): void {
  const heightFactor = clamp(z / BOMB_FX.SHADOW_REF_Z, 0, 1);
  const scale = (1 - heightFactor * (1 - BOMB_FX.SHADOW_MIN_SCALE)) * radiusScale;
  const alpha =
    BOMB_FX.SHADOW_BASE_ALPHA -
    heightFactor * (BOMB_FX.SHADOW_BASE_ALPHA - BOMB_FX.SHADOW_MIN_ALPHA);

  const shadowClip = getClipMeta('ui_shadow_unit');
  const shadowImg = shadowClip ? getSpriteImage(shadowClip.url) : null;
  const w = Math.max(8, Math.round(20 * scale));
  const h = Math.max(4, Math.round(9 * scale));

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.imageSmoothingEnabled = false;
  if (shadowImg && shadowImg.complete && shadowImg.naturalWidth > 0 && shadowClip) {
    ctx.drawImage(
      shadowImg,
      0,
      0,
      shadowClip.cellW,
      shadowClip.cellH,
      Math.round(x - w * 0.5),
      Math.round(y - h * 0.5),
      w,
      h,
    );
  } else {
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), w * 0.5, h * 0.5, 0, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

export function drawBombTelegraph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  progress01: number,
  remainingMs: number,
  kind: BombKind,
  nowMs?: number,
): void {
  if (radius <= 2) return;
  const p = clamp(progress01, 0, 1);
  const nowSec = resolveNowMs(nowMs) * 0.001;
  const freqHz = 2 + 6 * p * p;
  const pulse = 0.5 + 0.5 * Math.sin(nowSec * freqHz * TWO_PI);
  const urgent = remainingMs <= BOMB_FX.URGENCY_MS && remainingMs > 0;
  const urgencyFlash = urgent && ((Math.floor(remainingMs / BOMB_FX.BEEP_STEP_MS) & 1) === 1);

  const isStun = kind === 'stun';
  const strokeRgb = isStun ? '77, 171, 247' : '255, 107, 107';
  const fillAlpha = 0.07 + 0.13 * pulse * (0.35 + 0.65 * p) + (urgencyFlash ? 0.12 : 0);
  const ringAlpha = 0.55 + 0.35 * pulse + (urgencyFlash ? 0.1 : 0);

  const cx = Math.round(x);
  const cy = Math.round(y);

  ctx.save();
  ctx.fillStyle = `rgba(${strokeRgb}, ${fillAlpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = urgencyFlash
    ? '#ffffff'
    : `rgba(${strokeRgb}, ${clamp(ringAlpha, 0, 1).toFixed(3)})`;
  ctx.lineWidth = urgencyFlash ? 3 : 2;
  ctx.setLineDash(kind === 'mine' ? [6, 5] : [8, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TWO_PI);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = isStun ? '#e7f5ff' : '#fff3bf';
  ctx.globalAlpha = 0.72;
  const tickLen = Math.min(10, Math.max(5, radius * 0.1));
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx - radius + tickLen, cy);
  ctx.moveTo(cx + radius, cy);
  ctx.lineTo(cx + radius - tickLen, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy - radius + tickLen);
  ctx.moveTo(cx, cy + radius);
  ctx.lineTo(cx, cy + radius - tickLen);
  ctx.stroke();

  if (p > 0.05 && kind !== 'mine') {
    const innerR = Math.max(4, radius * p);
    ctx.globalAlpha = 0.32 + 0.25 * p;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = urgencyFlash ? '#ffffff' : `rgb(${strokeRgb})`;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, TWO_PI);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBombBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  angleRad: number,
  kind: BombKind,
  urgencyFlashOn: boolean,
  nowMs?: number,
): void {
  const drawX = Math.round(x);
  const drawY = Math.round(y - z * BOMB_FX.Z_PROJ);
  const snappedRot = kind === 'mine' ? 0 : snapAngle45(angleRad);
  const animTimeSec = resolveNowMs(nowMs) * 0.001;

  const clipKey =
    kind === 'stun'
      ? 'p_stun_canister'
      : kind === 'mine'
        ? 'p_prox_mine'
        : kind === 'cluster'
          ? 'cluster_bomb'
          : kind === 'mortar'
            ? 'fx_bomb_mortar'
            : 'p_frag_grenade';

  const cat: SpriteCategory = kind === 'cluster' ? 'weapon' : 'projectile';
  const drawn = drawBansungSprite(ctx, {
    clipKey,
    x: drawX,
    y: drawY,
    animTimeSec,
    rotationRad: snappedRot,
    scale: kind === 'cluster_sub' ? 0.78 : kind === 'cluster' ? 0.68 : 1,
    hitFlashAlpha: urgencyFlashOn ? 0.9 : 0,
    category: cat,
  });

  if (!drawn) {
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(snappedRot);
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = urgencyFlashOn
      ? '#ffffff'
      : kind === 'stun'
        ? '#4dabf7'
        : kind === 'mine'
          ? '#e43b44'
          : '#5a6988';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = kind === 'stun' ? '#e7f5ff' : '#ff922b';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }

  if (kind === 'mine') {
    const ledOn = ((resolveNowMs(nowMs) / 220) | 0) % 2 === 0;
    if (ledOn) {
      drawAtlasGlow(ctx, 'crimson', drawX, drawY - 1, 14, 0.55);
    }
  }
}

function drawProceduralExplosionFallback(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  p: number,
  isStun: boolean,
  seed: number,
): void {
  const expand = 0.35 + 0.72 * easeOutQuad(p);
  const fade = clamp(1 - Math.pow(p, 1.5), 0, 1);
  if (fade <= 0.01) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  let s = seed >>> 0;
  const lobes = 7;
  for (let i = 0; i < lobes; i++) {
    s = lcgNext(s);
    const ang = (i / lobes) * TWO_PI + ((s & 255) / 255) * 0.4;
    s = lcgNext(s);
    const dist = radius * expand * (0.28 + ((s & 255) / 255) * 0.35);
    const lr = radius * (0.24 + 0.14 * (1 - p));
    const lx = Math.round(cx + Math.cos(ang) * dist);
    const ly = Math.round(cy + Math.sin(ang) * dist);

    ctx.globalAlpha = fade * 0.85;
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.arc(lx, ly, lr + 2, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = isStun
      ? i % 2 === 0
        ? '#22d3ee'
        : '#4dabf7'
      : i % 2 === 0
        ? '#ff7a3d'
        : '#ffd43b';
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws Layers 1..3 of the 5-layer bomb detonation sequence (d24 §4):
 * - Layer 1 (0..70ms): pure white/cream flash disc + additive radial bloom
 * - Layer 2: main explosion pixel sheet (`fx_explosion_he` / `fx_explosion_stun` / `fx_explosion_small`)
 * - Layer 3 (0..220ms): crisp ground shockwave ring (`lineWidth` 4 -> 1.5px)
 * (Layers 4 & 5 are emitted directly into `bansungFx` particles + crater/scorch decals.)
 */
export function drawExplosionBlastLayers(
  ctx: CanvasRenderingContext2D,
  exp: Readonly<BombExplosionEvent>,
): void {
  if (!exp.active) return;
  const isStun = exp.style === 'stun' || exp.style === 'emp';
  const cx = Math.round(exp.x);
  const cy = Math.round(exp.y);

  // Layer 1: 0..70ms flash disc + additive bloom
  if (exp.ageMs < BOMB_FX.EXPLOSION_FLASH_MS) {
    const fp = exp.ageMs / BOMB_FX.EXPLOSION_FLASH_MS;
    const fFade = 1 - fp;
    drawAtlasGlow(
      ctx,
      isStun ? 'cyan' : 'fire',
      cx,
      cy,
      exp.radius * (1.8 + 0.5 * fp),
      0.85 * fFade,
    );
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.95 * fFade, 0, 1);
    ctx.fillStyle = isStun ? '#e7f5ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, exp.radius * (0.45 + 0.25 * fp), 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  // Layer 2: explosion pixel sheet (scaled proportionally to blast radius)
  const sheetP = clamp(exp.ageMs / Math.max(1, exp.ttlMs), 0, 1);
  if (sheetP < 1) {
    const isSmall = exp.radius <= 60;
    const clipKey = isStun
      ? 'fx_explosion_stun'
      : isSmall
        ? 'fx_explosion_small'
        : 'fx_explosion_he';
    const meta = getClipMeta(clipKey);
    const img = meta ? getSpriteImage(meta.url) : null;
    const targetDia = exp.radius * 2.15;
    const scale = meta ? targetDia / Math.max(1, meta.cellW * 0.72) : 1;

    if (meta && img && img.complete && img.naturalWidth > 0) {
      const fIdx = Math.min(
        Math.max(0, meta.frames - 1),
        (sheetP * meta.frames) | 0,
      );
      drawBansungSprite(ctx, {
        clipKey,
        x: cx,
        y: cy,
        animTimeSec: 0,
        frameIdx: fIdx,
        scale,
        alpha: 0.96,
        category: 'vfx',
      });
    } else {
      drawProceduralExplosionFallback(ctx, cx, cy, exp.radius, sheetP, isStun, exp.seed);
    }
  }

  // Layer 3: 0..220ms expanding crisp shockwave ring
  if (exp.ageMs < BOMB_FX.EXPLOSION_SHOCKWAVE_MS) {
    const sp = exp.ageMs / BOMB_FX.EXPLOSION_SHOCKWAVE_MS;
    const sease = easeOutQuad(sp);
    const sFade = (1 - sp) * (1 - sp);
    const ringR = exp.radius * (0.25 + 0.9 * sease);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.85 * sFade, 0, 1);
    ctx.strokeStyle = isStun ? '#4dabf7' : '#ffe066';
    ctx.lineWidth = Math.max(1.5, 4 - 2.5 * sease);
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }
}

// ============================================================================
// 4. d25 Tiger/Cat Pet Companion Animation, Fallback Sheets & Spring Draw
// ============================================================================

export const MAX_PETS = 16;

export const PET_SPRING_CONST = {
  POUNCE_DUR_SEC: 0.285,
  POUNCE_PEAK_Z: 18,
  SQUASH_LAUNCH_X: 0.80,
  SQUASH_LAUNCH_Y: 1.25,
  SQUASH_LAND_X: 1.26,
  SQUASH_LAND_Y: 0.76,
  FIRE_SQUASH_X: 1.18,
  FIRE_SQUASH_Y: 0.85,
  SPRING_OMEGA: 18,
  TROT_DUST_INTERVAL_MS: 160,
  SHADOW_SHRINK_FACTOR: 0.35,
  MAGNET_TETHER_MIN_DIST: 28,
} as const;

const STATE_ID_TO_ACTION: readonly BansungPetAnimAction[] = [
  'idle',
  'trot',
  'pounce',
  'fire',
];

export function petStateIdToAction(stateId: BansungPetStateId | number): BansungPetAnimAction {
  return STATE_ID_TO_ACTION[clamp(stateId | 0, 0, 3)] ?? 'idle';
}

export interface PetVisualState {
  active: boolean;
  ownerId: number;
  kind: BansungPetKind;
  stateId: BansungPetStateId;
  action: BansungPetAnimAction;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  zArc: number;
  facingRight: boolean;
  animTimeSec: number;
  stateEnteredAtMs: number;
  pounceElapsedSec: number;
  scaleX: number;
  scaleY: number;
  velScaleX: number;
  velScaleY: number;
  dustTimerMs: number;
  ownerX: number;
  ownerY: number;
  ownerDowned: boolean;
  magnetActive: boolean;
  lastSeenStamp: number;
}

const fallbackPetSheets = new Map<string, HTMLCanvasElement>();

/**
 * Generates and caches a crisp 32x32 pixel-art strip facing LEFT (`nativeFacing: 'left'`,
 * anchor `(16, 28)`) for `tiger` or `cat` across all 4 actions (`idle`, `trot`, `pounce`, `fire`).
 */
export function buildFallbackPetSheet(
  kind: BansungPetKind,
  action: BansungPetAnimAction,
): HTMLCanvasElement | null {
  const key = `${kind}_${action}`;
  const cached = fallbackPetSheets.get(key);
  if (cached) return cached;

  const animSpec = BANSUNG_PET_ANIMS[action];
  const frames = animSpec.meta[0];
  const cellW = animSpec.meta[1];
  const cellH = animSpec.meta[2];
  const c = createCanvas(cellW * frames, cellH);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;

  const pal = BANSUNG_PET_PALETTES[kind];

  for (let f = 0; f < frames; f++) {
    const ox = f * cellW;
    let bodyY = 16;
    let bodyX = ox + 10;
    let bodyW = 13;
    let bodyH = 8;
    let headX = ox + 6;
    let headY = 11;
    let tailLift = 0;
    let frontPawDx = 0;
    let backPawDx = 0;

    if (action === 'idle') {
      const bob = f % 2 === 1 ? 1 : 0;
      bodyY += bob;
      headY += bob;
      tailLift = f === 2 ? -2 : f === 3 ? -1 : 0;
    } else if (action === 'trot') {
      const phase = f % 4;
      bodyY += phase === 1 || phase === 3 ? -1 : 0;
      headY += phase === 1 || phase === 3 ? -1 : 0;
      frontPawDx = phase === 0 ? -2 : phase === 2 ? 2 : 0;
      backPawDx = -frontPawDx;
      tailLift = phase < 2 ? -2 : 0;
    } else if (action === 'pounce') {
      if (f === 0) {
        bodyY += 2;
        headY += 3;
        bodyH = 7;
      } else if (f === 1 || f === 2) {
        bodyX -= 2;
        bodyW = 15;
        bodyY -= 2;
        headX -= 2;
        headY -= 2;
        frontPawDx = -3;
        backPawDx = 3;
        tailLift = -1;
      } else {
        bodyY += 1;
        headY += 1;
      }
    } else if (action === 'fire') {
      if (f === 0) {
        bodyX += 1;
        headX += 1;
      } else {
        bodyX -= 1;
        headX -= 2;
        tailLift = -2;
      }
    }

    // 1. Tail (right side because sprite faces LEFT)
    g.fillStyle = pal.outline;
    g.fillRect(bodyX + bodyW - 1, bodyY + tailLift - 1, 6, 4);
    g.fillStyle = pal.coat;
    g.fillRect(bodyX + bodyW, bodyY + tailLift, 4, 2);
    g.fillStyle = pal.stripe;
    g.fillRect(bodyX + bodyW + 3, bodyY + tailLift, 2, 2);

    // 2. Paws anchored near y=28
    const pawY = 24;
    g.fillStyle = pal.outline;
    g.fillRect(bodyX + 1 + frontPawDx - 1, pawY - 1, 4, 5);
    g.fillRect(bodyX + bodyW - 4 + backPawDx - 1, pawY - 1, 4, 5);
    g.fillStyle = pal.belly;
    g.fillRect(bodyX + 1 + frontPawDx, pawY, 2, 3);
    g.fillRect(bodyX + bodyW - 4 + backPawDx, pawY, 2, 3);

    // 3. Torso outline + fill + shade + stripes/calico spots
    g.fillStyle = pal.outline;
    g.fillRect(bodyX - 1, bodyY - 1, bodyW + 2, bodyH + 2);
    g.fillStyle = pal.coat;
    g.fillRect(bodyX, bodyY, bodyW, bodyH);
    g.fillStyle = pal.shade;
    g.fillRect(bodyX, bodyY + bodyH - 3, bodyW, 2);
    g.fillStyle = pal.belly;
    g.fillRect(bodyX + 2, bodyY + bodyH - 2, bodyW - 4, 2);

    g.fillStyle = pal.stripe;
    if (kind === 'tiger') {
      g.fillRect(bodyX + 3, bodyY, 2, 4);
      g.fillRect(bodyX + 7, bodyY, 2, 4);
      g.fillRect(bodyX + 10, bodyY + 1, 2, 3);
    } else {
      g.fillRect(bodyX + 4, bodyY, 4, 3);
      g.fillStyle = pal.shade;
      g.fillRect(bodyX + 9, bodyY + 1, 3, 3);
    }

    // 4. Head + pointed ears facing LEFT
    g.fillStyle = pal.outline;
    g.fillRect(headX - 1, headY - 1, 10, 9);
    g.fillRect(headX + 1, headY - 3, 3, 3);
    g.fillRect(headX + 6, headY - 3, 3, 3);

    g.fillStyle = pal.coat;
    g.fillRect(headX, headY, 8, 7);
    g.fillStyle = pal.stripe;
    g.fillRect(headX + 2, headY - 2, 1, 2);
    g.fillRect(headX + 7, headY - 2, 1, 2);

    g.fillStyle = pal.belly;
    g.fillRect(headX, headY + 4, 4, 3);
    g.fillStyle = pal.outline;
    g.fillRect(headX + 2, headY + 2, 2, 2);
    g.fillStyle = pal.eye;
    g.fillRect(headX + 2, headY + 2, 1, 1);
    g.fillStyle = pal.nose;
    g.fillRect(headX, headY + 4, 1, 1);

    if (action === 'fire' && f >= 1) {
      g.fillStyle = '#ff922b';
      g.fillRect(headX - 3, headY + 3, 3, 3);
      g.fillStyle = '#fff3bf';
      g.fillRect(headX - 2, headY + 4, 1, 1);
    }
  }

  fallbackPetSheets.set(key, c);
  return c;
}

export function drawPetShadow(
  ctx: CanvasRenderingContext2D,
  pet: Readonly<PetVisualState>,
): void {
  if (!pet.active) return;
  const liftFrac = clamp(pet.zArc / PET_SPRING_CONST.POUNCE_PEAK_Z, 0, 1);
  const shrink = 1 - PET_SPRING_CONST.SHADOW_SHRINK_FACTOR * liftFrac;
  const w = Math.round(BANSUNG_PET.shadowSize.w * shrink);
  const h = Math.round(BANSUNG_PET.shadowSize.h * shrink);
  const x = Math.round(pet.x);
  const y = Math.round(pet.y);

  const meta = getClipMeta('ui_shadow_unit');
  const img = meta ? getSpriteImage(meta.url) : null;

  ctx.save();
  ctx.globalAlpha = 0.52 - 0.18 * liftFrac;
  ctx.imageSmoothingEnabled = false;
  if (meta && img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(
      img,
      0,
      0,
      BANSUNG_SHADOW_META[1],
      BANSUNG_SHADOW_META[2],
      Math.round(x - w * 0.5),
      Math.round(y - h * 0.5),
      w,
      h,
    );
  } else {
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPetMagnetTether(
  ctx: CanvasRenderingContext2D,
  pet: Readonly<PetVisualState>,
  nowMs?: number,
): void {
  if (!pet.active || !pet.magnetActive) return;
  const dx = pet.ownerX - pet.x;
  const dy = pet.ownerY - pet.y;
  const dist = Math.hypot(dx, dy);
  if (dist < PET_SPRING_CONST.MAGNET_TETHER_MIN_DIST) return;

  const now = resolveNowMs(nowMs);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 224, 102, 0.36)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -(now * 0.04) % 10;
  ctx.beginPath();
  ctx.moveTo(Math.round(pet.x), Math.round(pet.y - 10));
  ctx.lineTo(Math.round(pet.ownerX), Math.round(pet.ownerY - 16));
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.fillStyle = '#fff9db';
  for (let i = 0; i < 2; i++) {
    const t = (now * 0.0014 + i * 0.5) % 1;
    const sx = Math.round(pet.x + dx * t);
    const sy = Math.round(pet.y - 10 + (pet.ownerY - 16 - (pet.y - 10)) * t);
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }
  ctx.restore();
}

export function drawPetCompanion(
  ctx: CanvasRenderingContext2D,
  pet: Readonly<PetVisualState>,
  nowMs?: number,
): void {
  if (!pet.active) return;
  const animSpec = BANSUNG_PET_ANIMS[pet.action];
  const clipKey = `pet_${pet.kind}_${pet.action}`;
  const drawX = Math.round(pet.x);
  const drawY = Math.round(pet.y - pet.zArc);

  const meta = getClipMeta(clipKey);
  const img = meta ? getSpriteImage(meta.url) : null;
  const hasRealSheet = Boolean(meta && img && img.complete && img.naturalWidth > 0);

  if (hasRealSheet) {
    drawBansungSprite(ctx, {
      clipKey,
      x: drawX,
      y: drawY,
      animTimeSec: pet.animTimeSec,
      facingRight: pet.facingRight,
      scaleX: pet.scaleX,
      scaleY: pet.scaleY,
      category: 'pet',
    });
  } else {
    const fallbackSheet = buildFallbackPetSheet(pet.kind, pet.action);
    const frames = animSpec.meta[0];
    const cellW = animSpec.meta[1];
    const cellH = animSpec.meta[2];
    const offX = animSpec.meta[3];
    const offY = animSpec.meta[4];
    const fIdx = resolveFrameIndex(
      { frames, fps: animSpec.fps, loop: animSpec.loop },
      pet.animTimeSec,
    );

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(drawX, drawY);
    // Native sheet faces LEFT -> flip horizontally when facingRight
    const sx = pet.facingRight ? -pet.scaleX : pet.scaleX;
    ctx.scale(sx, pet.scaleY);

    if (fallbackSheet) {
      ctx.drawImage(
        fallbackSheet,
        fIdx * cellW,
        0,
        cellW,
        cellH,
        offX,
        offY,
        cellW,
        cellH,
      );
    } else {
      const pal = BANSUNG_PET_PALETTES[pet.kind];
      ctx.fillStyle = pal.outline;
      ctx.fillRect(-10, -14, 20, 14);
      ctx.fillStyle = pal.coat;
      ctx.fillRect(-9, -13, 18, 12);
      ctx.fillStyle = pal.stripe;
      ctx.fillRect(-6, -13, 3, 6);
    }
    ctx.restore();
  }

  if (pet.ownerDowned) {
    const now = resolveNowMs(nowMs);
    const bob = Math.round(Math.sin(now * 0.009) * 2);
    const bx = drawX;
    const by = drawY - 34 + bob;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(bx - 5, by - 5, 10, 10);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(bx - 4, by - 4, 8, 8);
    ctx.fillStyle = '#fff9db';
    ctx.fillRect(bx - 1, by - 3, 2, 4);
    ctx.fillRect(bx - 1, by + 2, 2, 1);
    ctx.restore();
  }
}

export function drawPetFireball(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  aimRad: number,
  animTimeSec: number,
  scale = BANSUNG_PET.fireballAnim.scale,
  isEnemy = false,
): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  drawAtlasGlow(
    ctx,
    isEnemy ? 'crimson' : 'fire',
    cx,
    cy,
    (isEnemy ? 34 : 28) * (scale / 0.5),
    isEnemy ? 0.72 : 0.55,
  );
  if (isEnemy) {
    drawAtlasGlow(ctx, 'fire', cx, cy, 24 * (scale / 0.5), 0.65);
    ctx.save();
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(7.5, 11 * scale), 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  const drawn = drawBansungSprite(ctx, {
    clipKey: 'fireball',
    x: cx,
    y: cy,
    animTimeSec,
    rotationRad: aimRad,
    scale: isEnemy ? scale * 1.15 : scale,
    category: 'projectile',
  });
  if (!drawn) {
    ctx.save();
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.arc(cx, cy, isEnemy ? 7.5 : 6, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = isEnemy ? '#ff4757' : '#ff7a3d';
    ctx.beginPath();
    ctx.arc(cx, cy, isEnemy ? 5.5 : 4.5, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#fff6b3';
    ctx.beginPath();
    ctx.arc(cx, cy, isEnemy ? 2.6 : 2, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================================
// 5. Unified Zero-GC VFX Controller & Render Pass Orchestrator
// ============================================================================

export class BansungVfxController {
  private readonly flashes: MuzzleFlash[] = [];
  private flashHead = 0;

  private readonly beams: BeamTrail[] = [];
  private beamHead = 0;

  private readonly shockwaves: StunRing[] = [];
  private shockwaveHead = 0;

  private readonly arcs: StunArc[] = [];
  private arcHead = 0;

  private readonly lightningBolts: Array<{
    active: boolean;
    x: number;
    y: number;
    yellow: boolean;
    ageMs: number;
    ttlMs: number;
  }> = [];
  private lightningBoltHead = 0;

  private readonly bombs: BombFxState[] = [];
  private bombHead = 0;

  private readonly explosions: BombExplosionEvent[] = [];
  private explosionHead = 0;

  private readonly pets: PetVisualState[] = [];

  private readonly trackedProjectiles: TrackedProjectile[] = [];
  private readonly bulletSlotById = new Map<number, number>();
  private bulletFreeTop = 0;
  private bulletStamp = 1;

  private readonly flashOverlay: FlashbangState = {
    active: false,
    ageMs: 0,
    peakAlpha: 0,
    tintColor: '#e7f5ff',
  };

  private nextSeed = 1337;

  constructor() {
    for (let i = 0; i < MAX_FLASHES; i++) {
      this.flashes.push({
        active: false,
        x: 0,
        y: 0,
        angle: 0,
        style: 'kinetic',
        ageMs: 0,
        ttlMs: 100,
        scale: 1,
        weaponTier: 1,
        seed: 0,
        accent: 'none',
        tint: '#ffd166',
        core: '#ffffff',
      });
    }
    for (let i = 0; i < MAX_BEAMS; i++) {
      this.beams.push({
        active: false,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        kind: 0,
        ageMs: 0,
        ttlMs: 140,
        width: 5,
        seed: 0,
      });
    }
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0,
        maxRadius: 100,
        variant: 0,
        ageMs: 0,
        ttlMs: 280,
        drawThunderball: false,
        colorOverride: '',
      });
    }
    for (let i = 0; i < MAX_ARCS; i++) {
      this.arcs.push({
        active: false,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        ageMs: 0,
        ttlMs: 180,
        variant: 0,
        seed: 0,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.lightningBolts.push({
        active: false,
        x: 0,
        y: 0,
        yellow: false,
        ageMs: 0,
        ttlMs: 280,
      });
    }
    for (let i = 0; i < BOMB_FX.MAX_BOMBS; i++) {
      this.bombs.push({
        active: false,
        id: 0,
        kind: 'frag',
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        x: 0,
        y: 0,
        z: 0,
        angle: 0,
        spinRadPerSec: 12,
        radius: 96,
        peakZ: 36,
        bounces: 1,
        bounceIdx: 0,
        flightMs: 420,
        fuseMs: 1100,
        elapsedMs: 0,
        lastBeepBucket: -1,
        armed: false,
      });
    }
    for (let i = 0; i < BOMB_FX.MAX_EXPLOSIONS; i++) {
      this.explosions.push({
        active: false,
        x: 0,
        y: 0,
        radius: 96,
        style: 'he',
        ageMs: 0,
        ttlMs: 420,
        seed: 0,
      });
    }
    for (let i = 0; i < MAX_PETS; i++) {
      this.pets.push({
        active: false,
        ownerId: -1,
        kind: 'tiger',
        stateId: 0,
        action: 'idle',
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        zArc: 0,
        facingRight: false,
        animTimeSec: 0,
        stateEnteredAtMs: 0,
        pounceElapsedSec: 0,
        scaleX: 1,
        scaleY: 1,
        velScaleX: 0,
        velScaleY: 0,
        dustTimerMs: 0,
        ownerX: 0,
        ownerY: 0,
        ownerDowned: false,
        magnetActive: false,
        lastSeenStamp: 0,
      });
    }
    for (let i = 0; i < MAX_TRACKED_PROJECTILES; i++) {
      this.trackedProjectiles.push({
        active: false,
        id: -1,
        kind: 0,
        spawnX: 0,
        spawnY: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        ageSec: 0,
        smokeAccSec: 0,
        stamp: 0,
      });
    }
  }

  private allocSeed(): number {
    this.nextSeed = lcgNext(this.nextSeed);
    return this.nextSeed;
  }

  reset(): void {
    for (let i = 0; i < this.flashes.length; i++) this.flashes[i].active = false;
    for (let i = 0; i < this.beams.length; i++) this.beams[i].active = false;
    for (let i = 0; i < this.shockwaves.length; i++) this.shockwaves[i].active = false;
    for (let i = 0; i < this.arcs.length; i++) this.arcs[i].active = false;
    for (let i = 0; i < this.lightningBolts.length; i++) this.lightningBolts[i].active = false;
    for (let i = 0; i < this.bombs.length; i++) this.bombs[i].active = false;
    for (let i = 0; i < this.explosions.length; i++) this.explosions[i].active = false;
    for (let i = 0; i < this.pets.length; i++) this.pets[i].active = false;
    for (let i = 0; i < this.trackedProjectiles.length; i++) {
      this.trackedProjectiles[i].active = false;
    }
    this.bulletSlotById.clear();
    this.bulletFreeTop = 0;
    this.flashOverlay.active = false;
    this.flashOverlay.ageMs = 0;
    this.flashOverlay.peakAlpha = 0;
  }

  // ── Spawners ──────────────────────────────────────────────────────────────

  spawnMuzzleFlash(
    x: number,
    y: number,
    angleRad: number,
    style: MuzzleFlashStyle = 'kinetic',
    scale = 1,
    weaponTier = 1,
    profile?: WeaponFxProfile,
  ): void {
    const slot = this.flashes[this.flashHead];
    this.flashHead = (this.flashHead + 1) % MAX_FLASHES;
    const tier = normalizeWeaponTier(weaponTier);
    const tierSpec = BANSUNG_WEAPON_TIERS[tier];

    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.angle = angleRad;
    slot.style = style;
    slot.ageMs = 0;
    slot.ttlMs =
      (style === 'shotgun' || style === 'laser' ? 115 : 95) + (tier - 1) * 10 + (profile?.ttlBonusMs ?? 0);
    slot.scale = scale * tierSpec.muzzleScale;
    slot.weaponTier = tier;
    slot.seed = this.allocSeed();
    slot.accent = profile?.accent ?? 'none';
    slot.tint = profile?.tint ?? '#ffd166';
    slot.core = profile?.core ?? '#ffffff';

    // Tia lửa: màu/số lượng theo hồ sơ súng; cấp Mk cao đổi sang màu tiến hoá
    const sparkColor =
      tier >= 3
        ? FxColor.Violet
        : tier === 2
          ? FxColor.ElectricCore
          : profile
            ? profile.sparkColor
            : style === 'plasma' || style === 'laser' || style === 'emp'
              ? FxColor.ElectricCore
              : FxColor.HotGold;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const sparkCount = Math.min(10, (profile ? profile.sparkCount : 2) + Math.min(3, tier - 1));
    const baseSpeed = profile && profile.sparkSpeed > 0 ? profile.sparkSpeed : 140;
    const spreadBase = profile ? profile.sparkSpread : 0.28;
    for (let i = 0; i < sparkCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spread = side * (spreadBase * 0.6 + (i >> 1) * spreadBase * 0.35) + (Math.random() - 0.5) * 0.22;
      const a = angleRad + spread;
      const spd = (baseSpeed + Math.random() * 110) * (1 + Math.min(4, tier - 1) * 0.08);
      emitParticle(
        FxKind.Spark,
        FxLayer.Additive,
        FxPrio.High,
        x + cos * 6,
        y + sin * 6,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        110 + (tier - 1) * 20,
        2 + (tier >= 3 ? 0.5 : 0),
        sparkColor,
      );
    }
  }

  spawnBeamTrail(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    kind: BeamKindId = 0,
    width = 5,
    ttlMs = 150,
  ): void {
    const slot = this.beams[this.beamHead];
    this.beamHead = (this.beamHead + 1) % MAX_BEAMS;

    slot.active = true;
    slot.x1 = x1;
    slot.y1 = y1;
    slot.x2 = x2;
    slot.y2 = y2;
    slot.kind = kind;
    slot.ageMs = 0;
    slot.ttlMs = ttlMs;
    slot.width = width;
    slot.seed = this.allocSeed();
  }

  pushStunFx(
    x: number,
    y: number,
    maxRadius = 120,
    variant: StunRingVariant = 0,
    ttlMs = 280,
    drawThunderball = variant === 0,
    colorOverride = '',
  ): void {
    const slot = this.shockwaves[this.shockwaveHead];
    this.shockwaveHead = (this.shockwaveHead + 1) % MAX_SHOCKWAVES;

    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.maxRadius = Math.max(18, maxRadius);
    slot.variant = variant;
    slot.ageMs = 0;
    slot.ttlMs = Math.max(90, ttlMs);
    slot.drawThunderball = drawThunderball;
    slot.colorOverride = colorOverride;
  }

  /**
   * Survival level-up fanfare VFX: golden & cyan shockwave rings + rising spark fountain.
   */
  spawnLevelUpVfx(x: number, y: number, level: number): void {
    const lvlScale = clamp(1 + Math.max(0, level - 1) * 0.04, 1, 1.5);
    this.pushStunFx(x, y, Math.round(96 * lvlScale), 2, 380, false);
    this.pushStunFx(x, y, Math.round(54 * lvlScale), 0, 240, false);

    // Expanding radial gold spark crown
    emitRadialBurst(
      FxKind.Spark,
      FxLayer.Additive,
      FxPrio.High,
      x,
      y - 10,
      14,
      65,
      165 * lvlScale,
      260,
      480,
      2.5,
      FxColor.Gold,
    );

    // Rising vertical level-up fountain sparkles above hero head
    for (let i = 0; i < 8; i++) {
      const vx = (i - 3.5) * 14 + (Math.random() - 0.5) * 10;
      const vy = -75 - Math.random() * 85;
      emitParticle(
        FxKind.Spark,
        FxLayer.Additive,
        FxPrio.High,
        x + (Math.random() - 0.5) * 18,
        y - 16,
        vx,
        vy,
        380 + Math.random() * 180,
        i % 2 === 0 ? 2.5 : 2,
        i % 3 === 0 ? FxColor.White : FxColor.HotGold,
      );
    }
  }

  /**
   * Survival 3-card Gacha pick / Gun Evolution aura burst VFX (`#38bdf8` / `#c084fc` / `#fbbf24` / `#69db7c`).
   */
  spawnGachaUpgradeVfx(x: number, y: number, auraColor?: string): void {
    const raw = (auraColor ?? '').toLowerCase();
    let variant: StunRingVariant = 2;
    let sparkCol: number = FxColor.HotGold;
    let ringColorOverride = auraColor ?? '';

    if (raw.includes('38bdf8') || raw.includes('4dabf7') || raw.includes('22d3ee') || raw.includes('cyan') || raw.includes('blue')) {
      variant = 0;
      sparkCol = FxColor.ElectricCore;
    } else if (raw.includes('c084fc') || raw.includes('b197fc') || raw.includes('violet') || raw.includes('purple')) {
      variant = 4;
      sparkCol = FxColor.Violet;
    } else if (raw.includes('69db7c') || raw.includes('34d399') || raw.includes('green') || raw.includes('emerald')) {
      variant = 3;
      sparkCol = FxColor.Heal;
    } else {
      variant = 2;
      sparkCol = FxColor.Gold;
      if (!ringColorOverride) ringColorOverride = '#fbbf24';
    }

    this.pushStunFx(x, y, 108, variant, 340, false, ringColorOverride);
    const arcVariant: 0 | 1 = variant === 2 ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TWO_PI + 0.4;
      this.spawnElectricArc(
        x,
        y - 14,
        x + Math.cos(a) * 52,
        y - 14 + Math.sin(a) * 34,
        220,
        arcVariant,
      );
    }

    emitRadialBurst(
      FxKind.Spark,
      FxLayer.Additive,
      FxPrio.High,
      x,
      y - 12,
      14,
      80,
      200,
      240,
      440,
      2.5,
      sparkCol,
    );
    for (let i = 0; i < 6; i++) {
      emitParticle(
        FxKind.Spark,
        FxLayer.Additive,
        FxPrio.High,
        x + (Math.random() - 0.5) * 20,
        y - 14,
        (Math.random() - 0.5) * 36,
        -60 - Math.random() * 80,
        340 + Math.random() * 140,
        2,
        i % 2 === 0 ? FxColor.White : sparkCol,
      );
    }
  }

  spawnElectricArc(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ttlMs = 200,
    variant: 0 | 1 = 0,
  ): void {
    const slot = this.arcs[this.arcHead];
    this.arcHead = (this.arcHead + 1) % MAX_ARCS;

    slot.active = true;
    slot.x1 = x1;
    slot.y1 = y1;
    slot.x2 = x2;
    slot.y2 = y2;
    slot.ageMs = 0;
    slot.ttlMs = ttlMs;
    slot.variant = variant;
    slot.seed = this.allocSeed();
  }

  /**
   * Distance-attenuated flashbang screen flash (`d23`).
   * Applies `max(currentRemaining, newTargetPeak)` and `reducedFlash * 0.45`.
   */
  triggerFlashbangOverlay(
    worldX: number,
    worldY: number,
    viewerX: number,
    viewerY: number,
    maxRadius = 160,
    reducedFlash = false,
    tintColor = '#e7f5ff',
  ): void {
    const dist = Math.hypot(worldX - viewerX, worldY - viewerY);
    const fullDist = Math.max(70, maxRadius * 0.45);
    const maxDist = Math.max(360, maxRadius * 2.8);
    const atten = clamp(1 - (dist - fullDist) / Math.max(1, maxDist - fullDist), 0, 1);
    if (atten <= 0.02) return;

    const scale = reducedFlash ? STUN_FX_CONST.FLASH_REDUCED_SCALE : 1;
    const candidatePeak = STUN_FX_CONST.FLASH_MAX_ALPHA * atten * scale;

    let currentAlpha = 0;
    if (this.flashOverlay.active) {
      if (this.flashOverlay.ageMs < STUN_FX_CONST.FLASH_ATTACK_MS) {
        currentAlpha =
          this.flashOverlay.peakAlpha *
          (this.flashOverlay.ageMs / STUN_FX_CONST.FLASH_ATTACK_MS);
      } else {
        const t = clamp(
          (this.flashOverlay.ageMs - STUN_FX_CONST.FLASH_ATTACK_MS) /
            STUN_FX_CONST.FLASH_DECAY_MS,
          0,
          1,
        );
        currentAlpha = this.flashOverlay.peakAlpha * (1 - t) * Math.exp(-t * 1.45);
      }
    }

    if (candidatePeak >= currentAlpha) {
      this.flashOverlay.active = true;
      this.flashOverlay.ageMs = 0;
      this.flashOverlay.peakAlpha = Math.min(STUN_FX_CONST.FLASH_MAX_ALPHA, candidatePeak);
      this.flashOverlay.tintColor = tintColor;
    }
  }

  /**
   * Spawns or updates a 2.5D Z-arc bomb / mine visual tracker (`d24`).
   */
  spawnBombFx(opts: {
    id?: number;
    kind: BombKind;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    radius?: number;
    peakZ?: number;
    bounces?: 0 | 1 | 2;
    flightMs?: number;
    fuseMs?: number;
    serverSynced?: boolean;
  }): void {
    let slot: BombFxState | null = null;
    if (opts.id !== undefined) {
      for (let i = 0; i < this.bombs.length; i++) {
        if (this.bombs[i].active && this.bombs[i].id === opts.id) {
          slot = this.bombs[i];
          break;
        }
      }
    }
    if (!slot) {
      for (let i = 0; i < this.bombs.length; i++) {
        if (!this.bombs[i].active) {
          slot = this.bombs[i];
          break;
        }
      }
    }
    if (!slot) {
      slot = this.bombs[this.bombHead];
      this.bombHead = (this.bombHead + 1) % BOMB_FX.MAX_BOMBS;
    }

    slot.active = true;
    slot.id = opts.id ?? this.allocSeed();
    slot.kind = opts.kind;
    slot.startX = opts.startX;
    slot.startY = opts.startY;
    slot.targetX = opts.targetX;
    slot.targetY = opts.targetY;
    slot.x = opts.startX;
    slot.y = opts.startY;
    slot.z = 0;
    slot.angle = 0;
    slot.spinRadPerSec = opts.kind === 'mine' ? 0 : 14;
    slot.radius = opts.radius ?? BOMB_RADII[opts.kind] ?? 96;
    slot.peakZ = opts.peakZ ?? (opts.kind === 'mortar' ? 92 : opts.kind === 'mine' ? 0 : 38);
    slot.bounces =
      opts.bounces ??
      (opts.kind === 'frag' || opts.kind === 'stun' ? 2 : opts.kind === 'cluster_sub' ? 1 : 0);
    slot.bounceIdx = 0;
    slot.flightMs =
      opts.flightMs ?? (opts.kind === 'mortar' ? 750 : opts.kind === 'mine' ? 220 : 480);
    slot.fuseMs = opts.fuseMs ?? (opts.kind === 'mine' ? 999999 : 1100);
    slot.elapsedMs = 0;
    slot.lastBeepBucket = -1;
    slot.armed = false;
    slot.serverSynced = Boolean(opts.serverSynced);
  }

  hasActiveBomb(id: number): boolean {
    for (let i = 0; i < this.bombs.length; i++) {
      if (this.bombs[i].active && this.bombs[i].id === id) return true;
    }
    return false;
  }

  private syncBombProjectile(
    b: SnapBullet | InterpBullet,
    cfg: ReturnType<typeof getProjectileConfigByKindId>,
    isNew: boolean,
  ): void {
    const bombKind: BombKind | null =
      b.kind === 3
        ? 'frag'
        : b.kind === 5 || b.kind === 15
          ? 'stun'
          : b.kind === 7
            ? 'mine'
            : b.kind === 16
              ? 'cluster'
              : b.kind === 17
                ? 'cluster_sub'
                : null;
    if (!bombKind) return;

    if (!isNew) {
      for (let i = 0; i < this.bombs.length; i++) {
        const slot = this.bombs[i];
        if (slot.active && slot.id === b.id) {
          slot.x = b.x;
          slot.y = b.y;
          return;
        }
      }
      return;
    }

    const spd = Math.hypot(b.vx, b.vy) || cfg?.speed || 420;
    const fuseMs = cfg?.ttlMs ?? 1100;
    const flightMs = bombKind === 'mine' ? 220 : Math.min(fuseMs * 0.72, 720);
    const estDist = bombKind === 'mine' ? 0 : spd * (flightMs / 1000) * 0.72;
    this.spawnBombFx({
      id: b.id,
      kind: bombKind,
      startX: b.x,
      startY: b.y,
      targetX: b.x + Math.cos(b.aim) * estDist,
      targetY: b.y + Math.sin(b.aim) * estDist,
      radius: cfg?.blastRadius ?? BOMB_RADII[bombKind] ?? 96,
      flightMs,
      fuseMs: bombKind === 'mine' ? 999999 : fuseMs,
      serverSynced: true,
    });
  }

  removeBombById(id: number): void {
    for (let i = 0; i < this.bombs.length; i++) {
      if (this.bombs[i].active && this.bombs[i].id === id) {
        this.bombs[i].active = false;
      }
    }
  }

  /**
   * Triggers the complete 5-layer bomb/barrel detonation sequence (`d24` §4).
   */
  triggerBombExplosion(
    x: number,
    y: number,
    radius = 96,
    style: BlastStyle = 'he',
    viewerPos?: { x: number; y: number } | null,
    nowMs?: number,
  ): void {
    const slot = this.explosions[this.explosionHead];
    this.explosionHead = (this.explosionHead + 1) % BOMB_FX.MAX_EXPLOSIONS;

    const isStun = style === 'stun' || style === 'emp';
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.radius = Math.max(24, radius);
    slot.style = style;
    slot.ageMs = 0;
    slot.ttlMs = isStun ? 390 : 450;
    slot.seed = this.allocSeed();

    const radScale = clamp(radius / 96, 0.55, 1.8);
    const sparkCount = Math.round(12 * radScale);
    const debrisCount = Math.round(7 * radScale);
    const smokeCount = Math.round(6 * radScale);

    // Layer 4a: Fast additive radial sparks
    emitRadialBurst(
      FxKind.Spark,
      FxLayer.Additive,
      FxPrio.High,
      x,
      y,
      sparkCount,
      120 * radScale,
      310 * radScale,
      160,
      340,
      2.5,
      isStun ? FxColor.ElectricCore : FxColor.HotGold,
    );

    // Layer 4b: Hot shrapnel / embers
    emitRadialBurst(
      FxKind.Shrapnel,
      FxLayer.World,
      FxPrio.Med,
      x,
      y,
      debrisCount,
      70 * radScale,
      190 * radScale,
      250,
      520,
      3,
      isStun ? FxColor.Cyan : FxColor.Ember,
    );

    // Layer 4c: Lingering smoke puffs
    emitRadialBurst(
      FxKind.Smoke,
      FxLayer.World,
      FxPrio.Low,
      x,
      y - 4,
      smokeCount,
      18,
      65,
      360,
      720,
      6 * radScale,
      style === 'steam' ? FxColor.Dust : FxColor.Smoke,
    );

    // Layer 5: Ground crater / scorch decal (fades out completely after 5s)
    const decalKind =
      isStun || style === 'steam'
        ? DecalKind.Scorch
        : radius >= 110
          ? DecalKind.CraterLg
          : DecalKind.CraterSm;
    CRATER_DECAL_OPTS.scale = clamp(radius / 96, 0.6, 1.5);
    bansungFx.spawnDecal(decalKind, x, y, Math.random() * TWO_PI, 0, CRATER_DECAL_OPTS);

    if (viewerPos) {
      bansungMotion.triggerExplosionJuice(
        x,
        y,
        viewerPos.x,
        viewerPos.y,
        resolveNowMs(nowMs),
        { strength: clamp(radius / 96, 0.45, 1.8) },
      );
    }
  }

  // ── Network Frame / Bullet / Pet Ingestion ────────────────────────────────

  /**
   * Synchronizes per-bullet spawn origins (`d22` §3) so tracer lengths never poke behind muzzles,
   * and emits subtle rocket/fireball trail particles into `bansungFx`.
   */
  syncBullets(bullets: readonly (SnapBullet | InterpBullet)[], dtSec: number): void {
    this.bulletStamp++;
    const dt = Math.max(0.001, dtSec);

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      let slotIdx = this.bulletSlotById.get(b.id);
      if (slotIdx === undefined) {
        if (this.bulletFreeTop < MAX_TRACKED_PROJECTILES) {
          slotIdx = this.bulletFreeTop++;
        } else {
          let oldestIdx = 0;
          let oldestStamp = this.trackedProjectiles[0].stamp;
          for (let j = 1; j < MAX_TRACKED_PROJECTILES; j++) {
            if (!this.trackedProjectiles[j].active) {
              oldestIdx = j;
              break;
            }
            if (this.trackedProjectiles[j].stamp < oldestStamp) {
              oldestStamp = this.trackedProjectiles[j].stamp;
              oldestIdx = j;
            }
          }
          const evicted = this.trackedProjectiles[oldestIdx];
          if (evicted.active) this.bulletSlotById.delete(evicted.id);
          slotIdx = oldestIdx;
        }

        const tp = this.trackedProjectiles[slotIdx];
        const cfg = getProjectileConfigByKindId(b.kind);
        const isPaused = ((b.flags ?? 0) & BANSUNG_BFLAG_PAUSED) !== 0;
        const hasVel = b.vx !== 0 || b.vy !== 0;
        const fallbackSpd = isPaused ? 0 : cfg?.speed ?? 600;
        tp.active = true;
        tp.id = b.id;
        tp.kind = b.kind;
        tp.spawnX = b.x;
        tp.spawnY = b.y;
        tp.prevX = b.x;
        tp.prevY = b.y;
        tp.vx = isPaused ? 0 : hasVel ? b.vx : Math.cos(b.aim) * fallbackSpd;
        tp.vy = isPaused ? 0 : hasVel ? b.vy : Math.sin(b.aim) * fallbackSpd;
        tp.ageSec = 0;
        tp.smokeAccSec = 0;
        tp.stamp = this.bulletStamp;
        this.bulletSlotById.set(b.id, slotIdx);
        this.syncBombProjectile(b, cfg, true);
      } else {
        const tp = this.trackedProjectiles[slotIdx];
        const isPaused = ((b.flags ?? 0) & BANSUNG_BFLAG_PAUSED) !== 0;
        const dx = b.x - tp.prevX;
        const dy = b.y - tp.prevY;
        if (isPaused) {
          tp.vx = 0;
          tp.vy = 0;
          tp.spawnX = b.x;
          tp.spawnY = b.y;
        } else if (b.vx !== 0 || b.vy !== 0) {
          tp.vx = b.vx;
          tp.vy = b.vy;
        } else if (dt > 0.0005 && (dx !== 0 || dy !== 0)) {
          tp.vx = dx / dt;
          tp.vy = dy / dt;
        }
        tp.prevX = b.x;
        tp.prevY = b.y;
        tp.ageSec += dt;
        tp.stamp = this.bulletStamp;
        this.syncBombProjectile(b, undefined, false);

        if (b.kind === 6 || b.kind === 12 || b.kind === 13) {
          tp.smokeAccSec += dt;
          if (tp.smokeAccSec >= 0.045) {
            tp.smokeAccSec = 0;
            emitParticle(
              b.kind === 6 ? FxKind.Smoke : FxKind.Spark,
              b.kind === 6 ? FxLayer.World : FxLayer.Additive,
              FxPrio.Low,
              b.x,
              b.y,
              (Math.random() - 0.5) * 18,
              (Math.random() - 0.5) * 18,
              b.kind === 6 ? 240 : 140,
              b.kind === 6 ? 3.5 : 2,
              b.kind === 6 ? FxColor.Smoke : FxColor.HotGold,
            );
          }
        }
      }
    }

    for (let j = 0; j < this.bulletFreeTop; j++) {
      const tp = this.trackedProjectiles[j];
      if (tp.active && tp.stamp !== this.bulletStamp) {
        tp.active = false;
        this.bulletSlotById.delete(tp.id);
        this.removeBombById(tp.id);
      }
    }
  }

  /**
   * Synchronizes Tiger/Cat pet companion state (`d25`) with snapshot smoothing & pounce spring impulse.
   */
  syncPetState(
    ownerId: number,
    kind: BansungPetKind,
    tuple: BansungPetNetTuple,
    ownerX: number,
    ownerY: number,
    ownerDowned: boolean,
    magnetActive = true,
    dtSec = 1 / 60,
    nowMs?: number,
  ): void {
    const now = resolveNowMs(nowMs);
    const px = tuple[0];
    const py = tuple[1];
    const stateId = clamp(tuple[2] | 0, 0, 3) as BansungPetStateId;
    const facingLeft = tuple[3] !== 0;

    let slot: PetVisualState | null = null;
    for (let i = 0; i < this.pets.length; i++) {
      const p = this.pets[i];
      if (p.active && p.ownerId === ownerId) {
        slot = p;
        break;
      }
    }
    if (!slot) {
      for (let i = 0; i < this.pets.length; i++) {
        if (!this.pets[i].active) {
          slot = this.pets[i];
          break;
        }
      }
      if (!slot) return;
      slot.active = true;
      slot.ownerId = ownerId;
      slot.kind = kind;
      slot.x = px;
      slot.y = py;
      slot.scaleX = 1;
      slot.scaleY = 1;
      slot.velScaleX = 0;
      slot.velScaleY = 0;
      slot.zArc = 0;
      slot.animTimeSec = 0;
      slot.pounceElapsedSec = 0;
      slot.dustTimerMs = 0;
      slot.stateId = stateId;
      slot.action = petStateIdToAction(stateId);
      slot.stateEnteredAtMs = now;
    }

    const prevState = slot.stateId;
    slot.kind = kind;
    slot.targetX = px;
    slot.targetY = py;
    slot.ownerX = ownerX;
    slot.ownerY = ownerY;
    slot.ownerDowned = ownerDowned;
    slot.magnetActive = magnetActive;
    slot.facingRight = !facingLeft;
    slot.lastSeenStamp = this.bulletStamp;

    const smooth = clamp(1 - Math.exp(-18 * Math.max(0.001, dtSec)), 0, 1);
    if (Math.hypot(px - slot.x, py - slot.y) > 160) {
      slot.x = px;
      slot.y = py;
    } else {
      slot.x += (px - slot.x) * smooth;
      slot.y += (py - slot.y) * smooth;
    }

    if (stateId !== prevState) {
      slot.stateId = stateId;
      slot.action = petStateIdToAction(stateId);
      slot.animTimeSec = 0;
      slot.stateEnteredAtMs = now;

      if (stateId === 2) {
        slot.pounceElapsedSec = 0;
        slot.scaleX = PET_SPRING_CONST.SQUASH_LAUNCH_X;
        slot.scaleY = PET_SPRING_CONST.SQUASH_LAUNCH_Y;
        slot.velScaleX = 0;
        slot.velScaleY = 0;
      } else {
        if (prevState === 2) {
          slot.zArc = 0;
          slot.scaleX = PET_SPRING_CONST.SQUASH_LAND_X;
          slot.scaleY = PET_SPRING_CONST.SQUASH_LAND_Y;
          slot.velScaleX = 0;
          slot.velScaleY = 0;
          emitRadialBurst(
            FxKind.Dust,
            FxLayer.World,
            FxPrio.Low,
            slot.x,
            slot.y,
            4,
            12,
            34,
            140,
            240,
            2,
            FxColor.Sand,
          );
        } else if (stateId === 3) {
          slot.scaleX = PET_SPRING_CONST.FIRE_SQUASH_X;
          slot.scaleY = PET_SPRING_CONST.FIRE_SQUASH_Y;
          slot.velScaleX = 0;
          slot.velScaleY = 0;
          const snoutDir = slot.facingRight ? 1 : -1;
          emitParticle(
            FxKind.Spark,
            FxLayer.Additive,
            FxPrio.Med,
            slot.x + snoutDir * 12,
            slot.y - 12,
            snoutDir * 65,
            (Math.random() - 0.5) * 20,
            160,
            2.5,
            FxColor.HotGold,
          );
        }
      }
    }
  }

  /**
   * Consumes one decoded `SnapFxEvent` (`FX_MUZZLE`, `FX_BLAST`, `FX_BEAM`, `FX_IMPACT`)
   * from server snapshots into visual pools + `bansungFx` particles/decals.
   */
  consumeFxEvent(
    evt: Readonly<SnapFxEvent>,
    viewerPos?: { x: number; y: number } | null,
    reducedFlash = false,
    nowMs?: number,
    weaponTier = 1,
  ): void {
    if (evt.type === FX_MUZZLE) {
      const ownerActorId = evt.a;
      const weaponOrKindId = evt.b;
      const x = evt.c;
      const y = evt.d;
      const aim = dequantizeAim(evt.e);

      let style: MuzzleFlashStyle = 'kinetic';
      let scale = 1;
      let emitCasing = false;
      let isShotgun = false;
      let profile: WeaponFxProfile | undefined;
      const isTurret = ownerActorId >= 2000;

      if (isTurret) {
        const pCfg = getProjectileConfigByKindId(weaponOrKindId);
        if (pCfg && (pCfg.kind === 'turret_thunder' || pCfg.kind === 'plasma_bolt')) {
          style = pCfg.kind === 'turret_thunder' ? 'emp' : 'plasma';
        }
        scale = 0.85;
      } else {
        const w = getWeaponByIdx(weaponOrKindId);
        if (w) {
          if (w.category === 'melee') return;
          // Spec 007 · C: mỗi khẩu có hồ sơ chớp nòng / vỏ đạn / khói riêng
          profile = getWeaponFxProfile(w.id);
          style = profile.style;
          scale = profile.scale;
          emitCasing = profile.casing !== 'none';
          isShotgun = profile.casing === 'shell' || profile.casing === 'heavy';
        }
      }

      const muzzleY = isTurret ? y : y - HERO_BARREL_LIFT_Y;
      this.spawnMuzzleFlash(x, muzzleY, aim, style, scale, isTurret ? 1 : weaponTier, profile);
      if (profile && profile.smoke > 0) {
        const mcos = Math.cos(aim);
        const msin = Math.sin(aim);
        for (let i = 0; i < profile.smoke; i++) {
          const sa = aim + (Math.random() - 0.5) * 0.9;
          const sp = 18 + Math.random() * 26;
          emitParticle(
            FxKind.Smoke,
            FxLayer.World,
            FxPrio.Low,
            x + mcos * (10 + i * 3),
            muzzleY + msin * (10 + i * 3),
            Math.cos(sa) * sp,
            Math.sin(sa) * sp - 12,
            380 + Math.random() * 260,
            3 + Math.random() * 2,
            FxColor.Smoke,
          );
        }
      }
      if (!isTurret) {
        const playerId =
          ownerActorId >= 1000 && ownerActorId < 2000 ? ownerActorId - 1000 : ownerActorId;
        const shooterNearViewer =
          viewerPos != null && Math.hypot(x - viewerPos.x, y - viewerPos.y) <= 56;
        bansungMotion.triggerShotJuice({
          entityId: playerId,
          aimRad: aim,
          weapon: weaponOrKindId,
          isLocal: shooterNearViewer,
          nowMs: resolveNowMs(nowMs),
        });
      }
      if (emitCasing) {
        spawnWeaponCasing(x, muzzleY, aim, isShotgun);
        if (profile && profile.casing === 'heavy') {
          // Vỏ đạn nặng: thêm một vỏ đồng + bụi nhỏ khi rơi
          spawnWeaponCasing(x, muzzleY, aim + 0.25, false);
        }
      }
      return;
    }

    if (evt.type === FX_BLAST) {
      const blastKind = evt.a | 0;
      const x = evt.b;
      const y = evt.c;
      const radius = evt.d > 0 ? evt.d : 96;

      if (blastKind === BANSUNG_FX_BLAST_DRONE_PULSE) {
        this.pushStunFx(x, y, radius, 3, 260, false);
        emitRadialBurst(
          FxKind.Spark,
          FxLayer.Additive,
          FxPrio.Med,
          x,
          y,
          6,
          24,
          68,
          250,
          450,
          2.5,
          FxColor.Heal,
        );
        return;
      }

      if (
        blastKind === BANSUNG_FX_BLAST_STUN ||
        blastKind === BANSUNG_FX_BLAST_TURRET_THUNDER ||
        blastKind === BANSUNG_FX_BLAST_THUNDER_STORM ||
        blastKind === BANSUNG_FX_BLAST_STORM_YELLOW
      ) {
        const isStunGrenade = blastKind === BANSUNG_FX_BLAST_STUN;
        const isYellowStorm = blastKind === BANSUNG_FX_BLAST_STORM_YELLOW;
        this.triggerBombExplosion(
          x,
          y,
          radius,
          isStunGrenade ? 'stun' : isYellowStorm ? 'fireball' : 'emp',
          viewerPos,
          nowMs,
        );
        this.pushStunFx(
          x,
          y,
          radius,
          0,
          blastKind === BANSUNG_FX_BLAST_THUNDER_STORM || isYellowStorm ? 340 : 280,
          isStunGrenade || blastKind === BANSUNG_FX_BLAST_THUNDER_STORM || isYellowStorm,
        );
        // Spawn vertical sky-to-ground CC0 Lightning Bolt sprite strike for thunder blasts!
        if (!isStunGrenade) {
          const bSlot = this.lightningBolts[this.lightningBoltHead];
          this.lightningBoltHead = (this.lightningBoltHead + 1) % this.lightningBolts.length;
          bSlot.active = true;
          bSlot.x = x;
          bSlot.y = y;
          bSlot.yellow = isYellowStorm;
          bSlot.ageMs = 0;
          bSlot.ttlMs = 285;
        }
        const arcCount =
          blastKind === BANSUNG_FX_BLAST_THUNDER_STORM || isYellowStorm
            ? 6
            : blastKind === BANSUNG_FX_BLAST_TURRET_THUNDER
              ? 3
              : 4;
        for (let i = 0; i < arcCount; i++) {
          const a = (i / arcCount) * TWO_PI + 0.35;
          this.spawnElectricArc(
            x,
            y,
            x + Math.cos(a) * radius * 0.72,
            y + Math.sin(a) * radius * 0.72,
            210,
            0,
          );
        }
        if (isStunGrenade && viewerPos) {
          this.triggerFlashbangOverlay(
            x,
            y,
            viewerPos.x,
            viewerPos.y,
            radius,
            reducedFlash,
          );
        }
        return;
      }

      if (blastKind === BANSUNG_FX_BLAST_TURRET_EXPIRE) {
        this.triggerBombExplosion(x, y, Math.max(40, radius * 0.7), 'steam', viewerPos, nowMs);
        return;
      }

      if (
        blastKind === BANSUNG_FX_BLAST_BOSS_SHOCKWAVE ||
        blastKind === BANSUNG_FX_BLAST_BOSS_MORTAR ||
        blastKind === BANSUNG_FX_BLAST_FROST_SHATTER ||
        blastKind === BANSUNG_FX_BLAST_ABYSS_NOVA ||
        blastKind === BANSUNG_FX_BLAST_ORBITAL
      ) {
        const isMortar = blastKind === BANSUNG_FX_BLAST_BOSS_MORTAR || blastKind === BANSUNG_FX_BLAST_ORBITAL;
        this.triggerBombExplosion(x, y, radius, isMortar ? 'fireball' : 'he', viewerPos, nowMs);
        this.pushStunFx(x, y, radius * 1.15, 1, 300, false);
        return;
      }

      const style: BlastStyle =
        blastKind === BANSUNG_FX_BLAST_FIREBALL || blastKind === BANSUNG_FX_BLAST_VOLATILE
          ? 'fireball'
          : blastKind === BANSUNG_FX_BLAST_STEAM
            ? 'steam'
            : blastKind === BANSUNG_FX_BLAST_CLUSTER
              ? 'cluster'
              : blastKind === BANSUNG_FX_BLAST_MINE || blastKind === BANSUNG_FX_BLAST_HE
                ? 'he'
                : 'he';
      this.triggerBombExplosion(x, y, radius, style, viewerPos, nowMs);
      if (
        blastKind === BANSUNG_FX_BLAST_CLUSTER ||
        blastKind === BANSUNG_FX_BLAST_VOLATILE ||
        radius >= 130
      ) {
        this.pushStunFx(x, y, radius * 1.1, 1, 250, false);
      }
      return;
    }

    if (evt.type === FX_BEAM) {
      const kind = clamp(
        evt.e | 0,
        BANSUNG_FX_BEAM_RAIL,
        BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
      ) as BeamKindId;
      const width =
        kind === BANSUNG_FX_BEAM_LASER_MAP
          ? 14
          : kind === BANSUNG_FX_BEAM_BOSS_LASER
            ? 10
            : kind === BANSUNG_FX_BEAM_YELLOW_LIGHTNING
              ? 9
              : kind === BANSUNG_FX_BEAM_BOSS_EYE
                ? 7.5
                : kind === BANSUNG_FX_BEAM_SHOCK
                  ? 7
                  : 5;
      const ttl =
        kind === BANSUNG_FX_BEAM_LASER_MAP
          ? 260
          : kind === BANSUNG_FX_BEAM_BOSS_LASER
            ? 220
            : kind === BANSUNG_FX_BEAM_YELLOW_LIGHTNING
              ? 210
              : kind === BANSUNG_FX_BEAM_BOSS_EYE
                ? 190
                : kind === BANSUNG_FX_BEAM_SHOCK
                  ? 175
                  : 155;
      const nearPlayerMuzzle =
        viewerPos != null && Math.hypot(evt.a - viewerPos.x, evt.b - viewerPos.y) <= 84;
      const beamLiftY =
        kind === BANSUNG_FX_BEAM_CHAIN || kind === BANSUNG_FX_BEAM_SHOCK
          ? HERO_BARREL_LIFT_Y
          : (kind === BANSUNG_FX_BEAM_LASER_MAP || kind === BANSUNG_FX_BEAM_RAIL) && nearPlayerMuzzle
            ? HERO_BARREL_LIFT_Y
            : 0;
      this.spawnBeamTrail(
        evt.a,
        evt.b - beamLiftY,
        evt.c,
        evt.d - beamLiftY,
        kind,
        width,
        ttl,
      );
      return;
    }

    if (evt.type === FX_IMPACT) {
      const impactKind = evt.a | 0;
      const x = evt.b;
      const y = evt.c;
      const aim = dequantizeAim(evt.d);
      const isFlesh = impactKind === BANSUNG_FX_IMPACT_FLESH;
      const isEnergy = impactKind === BANSUNG_FX_IMPACT_SPARK;
      const isSlash = impactKind === BANSUNG_FX_IMPACT_SLASH || impactKind === BANSUNG_FX_IMPACT_SLICE;
      // Spec 007 · C: tia va chạm mang màu của loại đạn (evt.e = kindId) — máu do gore.ts lo.
      const impactCfg = !isSlash && evt.e > 0 ? getProjectileConfigByKindId(evt.e | 0) : null;
      const kindCol = impactCfg ? PROJECTILE_IMPACT_COLOR[impactCfg.kind] : undefined;
      const kindCount = impactCfg ? PROJECTILE_IMPACT_COUNT[impactCfg.kind] : undefined;
      const count = isSlash ? 6 : kindCount ?? 4;
      const col =
        kindCol !== undefined
          ? kindCol
          : isEnergy
            ? FxColor.ElectricCore
            : isFlesh
              ? FxColor.Blood
              : isSlash
                ? FxColor.HotGold
                : FxColor.White;
      const layer = isFlesh && kindCol === undefined ? FxLayer.World : FxLayer.Additive;
      for (let i = 0; i < count; i++) {
        const a = aim + Math.PI + (Math.random() - 0.5) * 1.4;
        const spd = 40 + Math.random() * 90;
        emitParticle(
          FxKind.Spark,
          layer,
          FxPrio.Med,
          x,
          y,
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          100 + Math.random() * 100,
          2,
          col,
        );
      }
    }
  }

  // ── Per-Frame Fixed Step ──────────────────────────────────────────────────

  step(dtSec: number, nowMs?: number): void {
    const dt = Math.max(0, Math.min(0.1, dtSec));
    const dtMs = dt * 1000;
    resolveNowMs(nowMs);

    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      if (!f.active) continue;
      f.ageMs += dtMs;
      if (f.ageMs >= f.ttlMs) f.active = false;
    }

    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      if (!b.active) continue;
      b.ageMs += dtMs;
      if (b.ageMs >= b.ttlMs) b.active = false;
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      const r = this.shockwaves[i];
      if (!r.active) continue;
      r.ageMs += dtMs;
      if (r.ageMs >= r.ttlMs) r.active = false;
    }

    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      if (!a.active) continue;
      a.ageMs += dtMs;
      if (a.ageMs >= a.ttlMs) a.active = false;
    }

    for (let i = 0; i < this.lightningBolts.length; i++) {
      const lb = this.lightningBolts[i];
      if (!lb.active) continue;
      lb.ageMs += dtMs;
      if (lb.ageMs >= lb.ttlMs) lb.active = false;
    }

    if (this.flashOverlay.active) {
      this.flashOverlay.ageMs += dtMs;
      const total = STUN_FX_CONST.FLASH_ATTACK_MS + STUN_FX_CONST.FLASH_DECAY_MS;
      if (this.flashOverlay.ageMs >= total) {
        this.flashOverlay.active = false;
        this.flashOverlay.peakAlpha = 0;
      }
    }

    for (let i = 0; i < this.bombs.length; i++) {
      const b = this.bombs[i];
      if (!b.active) continue;
      evalBombKinematics(b, dtMs);
      const remMs = b.fuseMs - b.elapsedMs;
      if (b.kind !== 'mine' && remMs <= BOMB_FX.URGENCY_MS && remMs > 0) {
        const bucket = (remMs / BOMB_FX.BEEP_STEP_MS) | 0;
        if (bucket !== b.lastBeepBucket) {
          b.lastBeepBucket = bucket;
          if ((bucket & 1) === 1) {
            playBansungSfx('mine_arm', { x: b.x, y: b.y, vol: 0.32 });
          }
        }
      }
      if (b.kind !== 'mine' && b.elapsedMs >= b.fuseMs + 250) {
        b.active = false;
      }
    }

    for (let i = 0; i < this.explosions.length; i++) {
      const e = this.explosions[i];
      if (!e.active) continue;
      e.ageMs += dtMs;
      if (e.ageMs >= e.ttlMs) e.active = false;
    }

    const omega = PET_SPRING_CONST.SPRING_OMEGA;
    const damp = 2 * omega;
    for (let i = 0; i < this.pets.length; i++) {
      const pet = this.pets[i];
      if (!pet.active) continue;
      pet.animTimeSec += dt;

      const ax = (1 - pet.scaleX) * omega * omega - pet.velScaleX * damp;
      const ay = (1 - pet.scaleY) * omega * omega - pet.velScaleY * damp;
      pet.velScaleX += ax * dt;
      pet.velScaleY += ay * dt;
      pet.scaleX = clamp(pet.scaleX + pet.velScaleX * dt, 0.55, 1.65);
      pet.scaleY = clamp(pet.scaleY + pet.velScaleY * dt, 0.55, 1.65);

      if (pet.stateId === 2) {
        pet.pounceElapsedSec += dt;
        const u = clamp(pet.pounceElapsedSec / PET_SPRING_CONST.POUNCE_DUR_SEC, 0, 1);
        pet.zArc = Math.sin(u * Math.PI) * PET_SPRING_CONST.POUNCE_PEAK_Z;
      } else {
        pet.zArc = 0;
      }

      if (pet.stateId === 1) {
        pet.dustTimerMs += dtMs;
        if (pet.dustTimerMs >= PET_SPRING_CONST.TROT_DUST_INTERVAL_MS) {
          pet.dustTimerMs -= PET_SPRING_CONST.TROT_DUST_INTERVAL_MS;
          emitParticle(
            FxKind.Dust,
            FxLayer.World,
            FxPrio.Low,
            pet.x,
            pet.y,
            (Math.random() - 0.5) * 16,
            -8 - Math.random() * 12,
            180,
            2,
            FxColor.Sand,
          );
        }
      } else {
        pet.dustTimerMs = 0;
      }
    }
  }

  // ── Layered Render Passes for render.ts ───────────────────────────────────

  /** Ground pass: bomb shadows, pulsing bomb telegraphs, pet shadows, and stun shockwave rings. */
  drawGroundPass(ctx: CanvasRenderingContext2D, nowMs?: number): void {
    for (let i = 0; i < this.bombs.length; i++) {
      const b = this.bombs[i];
      if (!b.active) continue;
      if (b.kind !== 'mine' || b.armed) {
        const remMs = b.fuseMs - b.elapsedMs;
        const p =
          b.kind === 'mine' ? 0.35 : clamp(b.elapsedMs / Math.max(1, b.fuseMs), 0, 1);
        drawBombTelegraph(ctx, b.targetX, b.targetY, b.radius, p, remMs, b.kind, nowMs);
      }
      drawBombShadow(ctx, b.x, b.y, b.z, b.kind === 'cluster_sub' ? 0.8 : 1);
    }

    for (let i = 0; i < this.pets.length; i++) {
      if (this.pets[i].active) drawPetShadow(ctx, this.pets[i]);
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      if (this.shockwaves[i].active) drawStunRing(ctx, this.shockwaves[i]);
    }
  }

  /** World pass for elevated Z-arc bombs (`Z_PROJ = 0.85`). */
  drawBombPass(ctx: CanvasRenderingContext2D, nowMs?: number): void {
    for (let i = 0; i < this.bombs.length; i++) {
      const b = this.bombs[i];
      if (!b.active) continue;
      const remMs = b.fuseMs - b.elapsedMs;
      const urgent =
        b.kind !== 'mine' &&
        remMs <= BOMB_FX.URGENCY_MS &&
        remMs > 0 &&
        ((Math.floor(remMs / BOMB_FX.BEEP_STEP_MS) & 1) === 1);
      drawBombBody(ctx, b.x, b.y, b.z, b.angle, b.kind, urgent, nowMs);
    }
  }

  /** Draws all live projectiles with velocity-clamped tracer ribbons + sprite strips + high-contrast enemy auras. */
  drawProjectilePass(
    ctx: CanvasRenderingContext2D,
    bullets: readonly (SnapBullet | InterpBullet)[],
    animTimeSec: number,
    weaponTierOrResolver?: number | ((bullet: SnapBullet | InterpBullet) => number),
  ): void {
    const fixedTier =
      typeof weaponTierOrResolver === 'number' ? weaponTierOrResolver : undefined;
    const tierFn =
      typeof weaponTierOrResolver === 'function' ? weaponTierOrResolver : undefined;

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.flags === undefined) continue;
      const flags = b.flags;
      const isEnemy = (flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0;
      const isBombVisual =
        b.kind === 3 ||
        b.kind === 5 ||
        b.kind === 7 ||
        b.kind === 15 ||
        b.kind === 16 ||
        b.kind === 17;

      if (isBombVisual && this.hasActiveBomb(b.id)) {
        continue;
      }

      const slotIdx = this.bulletSlotById.get(b.id);
      const tp = slotIdx !== undefined ? this.trackedProjectiles[slotIdx] : undefined;

      const rawTraveled = tp ? Math.hypot(b.x - tp.spawnX, b.y - tp.spawnY) : 0;
      const isPaused = (flags & BANSUNG_BFLAG_PAUSED) !== 0;
      const fallbackSpd = isPaused ? 0 : getProjectileConfigByKindId(b.kind)?.speed ?? 600;
      const vx = isPaused
        ? 0
        : tp
          ? tp.vx
          : b.vx !== 0 || b.vy !== 0
            ? b.vx
            : Math.cos(b.aim) * fallbackSpd;
      const vy = isPaused
        ? 0
        : tp
          ? tp.vy
          : b.vx !== 0 || b.vy !== 0
            ? b.vy
            : Math.sin(b.aim) * fallbackSpd;
      const speed = Math.hypot(vx, vy);

      // Dedicated 3-layer Touhou Danmaku renderer for boss bullet-hell patterns (kindId 37..41)
      if (b.kind >= 37 && b.kind <= 41) {
        drawDanmakuProjectile(ctx, b, b.kind - 37, vx, vy, speed, rawTraveled, animTimeSec);
        continue;
      }

      const cfg = getProjectileConfigByKindId(b.kind);
      const kindKey: BansungProjectileKind = cfg?.kind ?? 'kinetic_sm';
      const anim = BANSUNG_PROJ_ANIMS[kindKey] ?? BANSUNG_PROJ_ANIMS.kinetic_sm;
      const weaponTier = isEnemy
        ? 1
        : (tierFn ? tierFn(b) : fixedTier ?? ((b as { weaponTier?: number }).weaponTier ?? 1));
      const tracerStyle = resolveTracerStyle(b.kind, flags, weaponTier);

      const drawY =
        !isEnemy && !isBombVisual && b.kind !== 12 && b.kind !== 14
          ? b.y - HERO_BARREL_LIFT_Y
          : b.y;

      if (!isBombVisual) {
        const dirX = speed > 1 ? vx : Math.cos(b.aim);
        const dirY = speed > 1 ? vy : Math.sin(b.aim);
        const traveled = isEnemy ? Math.max(rawTraveled, tracerStyle.minLen) : rawTraveled;
        drawTracerRibbon(ctx, b.x, drawY, dirX, dirY, speed, traveled, tracerStyle, flags, weaponTier);
      }

      const cx = Math.round(b.x);
      const cy = Math.round(drawY);
      if (isEnemy) {
        const enemyGlowKind: AtlasGlowKind =
          kindKey === 'arcane_fireball'
            ? 'fire'
            : kindKey === 'thunder_orb' || kindKey === 'turret_thunder'
              ? 'cyan'
              : kindKey === 'plasma_bolt'
                ? 'violet'
                : 'crimson';
        drawAtlasGlow(ctx, enemyGlowKind, cx, cy, Math.max(24, 30 * anim.scale), 0.68);
        if (b.kind !== 12) {
          const haloR = kindKey === 'thunder_orb' ? 7 : kindKey === 'plasma_bolt' ? 6 : 4.5;
          ctx.save();
          ctx.fillStyle = OUTLINE_INK;
          ctx.beginPath();
          ctx.arc(cx, cy, haloR + 1.5, 0, TWO_PI);
          ctx.fill();
          ctx.fillStyle = tracerStyle.color;
          ctx.beginPath();
          ctx.arc(cx, cy, haloR, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        }
      } else if (anim.additiveGlow) {
        drawAtlasGlow(ctx, anim.additiveGlow, cx, cy, 24 * anim.scale, 0.45);
      }

      if (b.kind === 12) {
        drawPetFireball(ctx, b.x, b.y, b.aim, animTimeSec, anim.scale, isEnemy);
        continue;
      }

      const rot = anim.snap45 ? snapAngle45(b.aim) : b.aim;
      const drawn = drawBansungSprite(ctx, {
        clipKey: anim.clipKey,
        x: cx,
        y: cy,
        animTimeSec,
        rotationRad: rot,
        scale: isEnemy ? Math.max(anim.scale, 1.08) : anim.scale,
        alpha: 'spawnAlpha' in b ? b.spawnAlpha : 1,
        category: anim.category,
      });

      if (!drawn) {
        const strip = getFallbackBulletStrip(b.kind, flags);
        if (strip) {
          const f = ((animTimeSec * 24) | 0) & 1;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(cx, cy);
          ctx.rotate(rot);
          ctx.drawImage(strip, f * 12, 0, 12, 8, -6, -4, 12, 8);
          ctx.restore();
        } else {
          const fb = getProceduralFallback(anim.clipKey, anim.category, 0);
          ctx.save();
          ctx.fillStyle = OUTLINE_INK;
          ctx.beginPath();
          ctx.arc(cx, cy, isEnemy ? 5 : 3.8, 0, TWO_PI);
          ctx.fill();
          ctx.fillStyle = isEnemy
            ? tracerStyle.color
            : (flags & BANSUNG_BFLAG_EXPLOSIVE) !== 0
              ? '#ff7a3d'
              : (fb.meta.fallback?.color ?? '#ffe066');
          ctx.beginPath();
          ctx.arc(cx, cy, isEnemy ? 3.6 : 2.8, 0, TWO_PI);
          ctx.fill();
          if (isEnemy) {
            ctx.fillStyle = tracerStyle.coreColor;
            ctx.beginPath();
            ctx.arc(cx, cy, 1.6, 0, TWO_PI);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }
  }

  /** World pass for Tiger/Cat pet companions + golden magnet tethers + downed owner indicators. */
  drawPetPass(ctx: CanvasRenderingContext2D, nowMs?: number): void {
    for (let i = 0; i < this.pets.length; i++) {
      if (this.pets[i].active) drawPetMagnetTether(ctx, this.pets[i], nowMs);
    }
    for (let i = 0; i < this.pets.length; i++) {
      if (this.pets[i].active) drawPetCompanion(ctx, this.pets[i], nowMs);
    }
  }

  /** Additive & burst VFX pass: muzzle cones, rail/lightning beams, electric arcs, and 5-layer explosions. */
  drawAdditivePass(ctx: CanvasRenderingContext2D, nowMs?: number): void {
    for (let i = 0; i < this.explosions.length; i++) {
      if (this.explosions[i].active) drawExplosionBlastLayers(ctx, this.explosions[i]);
    }
    for (let i = 0; i < this.beams.length; i++) {
      if (this.beams[i].active) drawBeamTrail(ctx, this.beams[i]);
    }
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      if (!a.active) continue;
      drawElectricArc(
        ctx,
        a.x1,
        a.y1,
        a.x2,
        a.y2,
        a.seed,
        a.ageMs / Math.max(1, a.ttlMs),
        a.variant,
        nowMs,
      );
    }
    for (let i = 0; i < this.lightningBolts.length; i++) {
      const lb = this.lightningBolts[i];
      if (!lb.active) continue;
      const t = clamp(lb.ageMs / Math.max(1, lb.ttlMs), 0, 0.999);
      const frameIdx = Math.min(5, Math.floor(t * 6));
      drawBansungSprite(ctx, {
        clipKey: lb.yellow ? 'fx_lightning_bolt_yellow' : 'fx_lightning_bolt_blue',
        x: Math.round(lb.x),
        y: Math.round(lb.y),
        animTimeSec: 0,
        frameIdx,
        scale: 1.12,
        alpha: t > 0.75 ? (1 - t) * 4 : 1,
        category: 'vfx',
      });
    }
    for (let i = 0; i < this.flashes.length; i++) {
      if (this.flashes[i].active) drawMuzzleFlashAdditive(ctx, this.flashes[i]);
    }
  }

  /** Post-lighting screen-space overlay for distance-attenuated flashbang attenuation (`d23`). */
  drawScreenOverlayPass(ctx: CanvasRenderingContext2D, screenW: number, screenH: number): void {
    drawScreenFlashOverlay(ctx, screenW, screenH, this.flashOverlay);
  }

  getFlashOverlayState(): Readonly<FlashbangState> {
    return this.flashOverlay;
  }

  getPetState(ownerId: number): Readonly<PetVisualState> | null {
    for (let i = 0; i < this.pets.length; i++) {
      if (this.pets[i].active && this.pets[i].ownerId === ownerId) {
        return this.pets[i];
      }
    }
    return null;
  }

  getTrackedBulletOrigin(bulletId: number): { spawnX: number; spawnY: number } | null {
    const idx = this.bulletSlotById.get(bulletId);
    if (idx === undefined) return null;
    const tp = this.trackedProjectiles[idx];
    if (!tp.active) return null;
    return { spawnX: tp.spawnX, spawnY: tp.spawnY };
  }

  getDiagnostics(): {
    activeFlashes: number;
    activeBeams: number;
    activeShockwaves: number;
    activeArcs: number;
    activeBombs: number;
    activeExplosions: number;
    activePets: number;
    trackedBullets: number;
    flashActive: boolean;
  } {
    let activeFlashes = 0;
    let activeBeams = 0;
    let activeShockwaves = 0;
    let activeArcs = 0;
    let activeBombs = 0;
    let activeExplosions = 0;
    let activePets = 0;
    let trackedBullets = 0;

    for (let i = 0; i < this.flashes.length; i++) if (this.flashes[i].active) activeFlashes++;
    for (let i = 0; i < this.beams.length; i++) if (this.beams[i].active) activeBeams++;
    for (let i = 0; i < this.shockwaves.length; i++) if (this.shockwaves[i].active) activeShockwaves++;
    for (let i = 0; i < this.arcs.length; i++) if (this.arcs[i].active) activeArcs++;
    for (let i = 0; i < this.bombs.length; i++) if (this.bombs[i].active) activeBombs++;
    for (let i = 0; i < this.explosions.length; i++) if (this.explosions[i].active) activeExplosions++;
    for (let i = 0; i < this.pets.length; i++) if (this.pets[i].active) activePets++;
    for (let i = 0; i < this.bulletFreeTop; i++) if (this.trackedProjectiles[i].active) trackedBullets++;

    return {
      activeFlashes,
      activeBeams,
      activeShockwaves,
      activeArcs,
      activeBombs,
      activeExplosions,
      activePets,
      trackedBullets,
      flashActive: this.flashOverlay.active,
    };
  }
}

export const bansungVfx = new BansungVfxController();

export function spawnLevelUpVfx(x: number, y: number, level: number): void {
  bansungVfx.spawnLevelUpVfx(x, y, level);
}

export function spawnGachaUpgradeVfx(x: number, y: number, auraColor?: string): void {
  bansungVfx.spawnGachaUpgradeVfx(x, y, auraColor);
}

export default bansungVfx;
