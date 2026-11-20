/**
 * Mighty Knight 2.5D Pixel — Manifest Loader, Master Atlas Cache (10..15f/char),
 * Bounded Preloader, Zero-Blur LRU Pixel Tint Cache & Crisp Pixel Fallbacks.
 */
import {
  MK_BIOMES,
  MK_BOSS_IDS,
  MK_ENEMIES,
  MK_ENEMY_IDS,
  MK_HEROES,
  MK_HERO_IDS,
  MK_PIXEL_ATLAS_SPECS,
  MK_STATIC_ROOT,
  type MkAnyEnemyId,
  type MkBiome,
  type MkHeroId,
  type MkVfxId,
} from '../../../shared/src';

export const MK_MANIFEST_URL = `${MK_STATIC_ROOT}/manifest.json`;
export const MK_MAX_CONCURRENT_LOADS = 6;
export const MK_MAX_TINT_CACHE = 96;
export const MK_OUTLINE_INK = '#140c1c';

export interface MkAtlasClip {
  key: string;
  url: string;
  frames: number;
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
  fps: number;
  tier: 1 | 2;
}

export interface MkAssetLoadProgress {
  loaded: number;
  total: number;
  ready: boolean;
  manifestFailed: boolean;
}

const REGISTRY = new Map<string, MkAtlasClip>();
const IMG_CACHE = new Map<string, HTMLImageElement>();
const IMG_READY = new Set<string>();
const IMG_FAILED = new Set<string>();
const QUEUED = new Set<string>();
const HIGH_QUEUE: string[] = [];
const LOW_QUEUE: string[] = [];
const TIER1_URLS = new Set<string>();
const TIER1_SETTLED = new Set<string>();
const TINT_CACHE = new Map<string, HTMLCanvasElement>();
const LISTENERS = new Set<() => void>();

let activeLoads = 0;
let seeded = false;
let initPromise: Promise<void> | null = null;
let manifestSettled = false;
let manifestFailed = false;
let currentBiome: MkBiome = 'grasslands';

const TERRAIN_LAYERS: ReadonlyArray<{ name: 'bg_sky' | 'bg_far' | 'bg_mid' | 'ground_arena' | 'fg_silhouette'; w: number; h: number }> = [
  { name: 'bg_sky', w: 640, h: 168 },
  { name: 'bg_far', w: 640, h: 112 },
  { name: 'bg_mid', w: 640, h: 96 },
  { name: 'ground_arena', w: 1280, h: 204 },
  { name: 'fg_silhouette', w: 640, h: 44 },
];

const VFX_DEFAULTS: ReadonlyArray<[string, number, number, number, number, number, number]> = [
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

function notify(): void {
  for (const fn of LISTENERS) {
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function registerClip(clip: MkAtlasClip): void {
  REGISTRY.set(clip.key, clip);
  if (clip.tier === 1) TIER1_URLS.add(clip.url);
}

function seedDefaults(): void {
  if (seeded) return;
  seeded = true;

  for (const id of MK_HERO_IDS) {
    const s = MK_PIXEL_ATLAS_SPECS[id];
    registerClip({
      key: `hero:${id}`,
      url: s.atlasPath,
      frames: s.frameCount,
      cellW: s.cellW,
      cellH: s.cellH,
      anchorX: s.anchorX,
      anchorY: s.anchorY,
      fps: 12,
      tier: 1,
    });
  }

  for (const id of MK_ENEMY_IDS) {
    const s = MK_PIXEL_ATLAS_SPECS[id];
    registerClip({
      key: `enemy:${id}`,
      url: s.atlasPath,
      frames: s.frameCount,
      cellW: s.cellW,
      cellH: s.cellH,
      anchorX: s.anchorX,
      anchorY: s.anchorY,
      fps: 12,
      tier: 1,
    });
  }

  for (const id of MK_BOSS_IDS) {
    const s = MK_PIXEL_ATLAS_SPECS[id];
    registerClip({
      key: `boss:${id}`,
      url: s.atlasPath,
      frames: s.frameCount,
      cellW: s.cellW,
      cellH: s.cellH,
      anchorX: s.anchorX,
      anchorY: s.anchorY,
      fps: 10,
      tier: 2,
    });
  }

  for (const [key, cellW, cellH, frames, anchorX, anchorY, fps] of VFX_DEFAULTS) {
    registerClip({
      key: `vfx:${key}`,
      url: `${MK_STATIC_ROOT}/vfx/${key}.png`,
      frames,
      cellW,
      cellH,
      anchorX,
      anchorY,
      fps,
      tier: 1,
    });
  }

  for (const biome of MK_BIOMES) {
    for (const l of TERRAIN_LAYERS) {
      registerClip({
        key: `terrain:${biome}:${l.name}`,
        url: `${MK_STATIC_ROOT}/terrains/${biome}/${l.name}.png`,
        frames: 1,
        cellW: l.w,
        cellH: l.h,
        anchorX: 0,
        anchorY: 0,
        fps: 1,
        tier: biome === 'grasslands' ? 1 : 2,
      });
    }
  }
}

function enqueue(url: string, priority: 'high' | 'low'): void {
  if (typeof Image === 'undefined') return;
  if (IMG_READY.has(url) || IMG_FAILED.has(url) || QUEUED.has(url)) return;
  QUEUED.add(url);
  if (priority === 'high') HIGH_QUEUE.push(url);
  else LOW_QUEUE.push(url);
  pumpQueue();
}

function pumpQueue(): void {
  while (activeLoads < MK_MAX_CONCURRENT_LOADS) {
    const url = HIGH_QUEUE.shift() ?? LOW_QUEUE.shift();
    if (!url) break;
    activeLoads++;
    const img = new Image();
    img.decoding = 'async';
    IMG_CACHE.set(url, img);
    img.onload = () => {
      activeLoads = Math.max(0, activeLoads - 1);
      IMG_READY.add(url);
      if (TIER1_URLS.has(url)) TIER1_SETTLED.add(url);
      notify();
      pumpQueue();
    };
    img.onerror = () => {
      activeLoads = Math.max(0, activeLoads - 1);
      IMG_FAILED.add(url);
      if (TIER1_URLS.has(url)) TIER1_SETTLED.add(url);
      notify();
      pumpQueue();
    };
    img.src = url;
  }
}

export function initMkAssets(biome: MkBiome = 'grasslands'): Promise<void> {
  seedDefaults();
  currentBiome = biome;
  if (initPromise) {
    preloadMkBiome(biome);
    return initPromise;
  }
  initPromise = (async () => {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch(MK_MANIFEST_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data?.vfx) {
          for (const [k, v] of Object.entries<any>(data.vfx)) {
            registerClip({
              key: `vfx:${k}`,
              url: v.path,
              frames: v.frames,
              cellW: v.cellW,
              cellH: v.cellH,
              anchorX: v.anchorX,
              anchorY: v.anchorY,
              fps: v.fps || 16,
              tier: 1,
            });
          }
        }
      }
    } catch {
      manifestFailed = true;
    } finally {
      manifestSettled = true;
      for (const clip of REGISTRY.values()) {
        if (clip.tier === 1) enqueue(clip.url, 'high');
      }
      preloadMkBiome(currentBiome);
      for (const clip of REGISTRY.values()) {
        if (clip.tier === 2) enqueue(clip.url, 'low');
      }
      notify();
    }
  })();
  return initPromise;
}

export function preloadMkBiome(biome: MkBiome): void {
  seedDefaults();
  currentBiome = biome;
  for (const l of TERRAIN_LAYERS) {
    const clip = REGISTRY.get(`terrain:${biome}:${l.name}`);
    if (clip) enqueue(clip.url, 'high');
  }
}

export function getMkClip(key: string): MkAtlasClip | undefined {
  seedDefaults();
  return REGISTRY.get(key);
}

export function getMkSpriteImage(key: string): HTMLImageElement | null {
  seedDefaults();
  const clip = REGISTRY.get(key);
  if (!clip) return null;
  if (!IMG_CACHE.has(clip.url) && !IMG_FAILED.has(clip.url)) {
    enqueue(clip.url, 'high');
  }
  return IMG_READY.has(clip.url) ? IMG_CACHE.get(clip.url) ?? null : null;
}

export function getMkVfxClip(vfxId: MkVfxId | 'projectiles_sheet' | 'pickups_sheet'): MkAtlasClip | undefined {
  return getMkClip(`vfx:${vfxId}`);
}

export function getMkAssetProgress(): MkAssetLoadProgress {
  seedDefaults();
  const total = Math.max(1, TIER1_URLS.size);
  const loaded = TIER1_SETTLED.size;
  return {
    loaded,
    total,
    ready: manifestSettled && loaded >= Math.min(total, 10),
    manifestFailed,
  };
}

export function onMkAssetLoad(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}

/**
 * Zero-blur pixel tint/silhouette cache (uses `source-atop` with `imageSmoothingEnabled = false`).
 */
export function getMkTintedFrame(
  clipKey: string,
  frameIdx: number,
  color: string,
  alpha = 0.72,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const clip = getMkClip(clipKey);
  const img = getMkSpriteImage(clipKey);
  if (!clip || !img) return null;

  const safeIdx = Math.max(0, Math.min(clip.frames - 1, frameIdx | 0));
  const cacheKey = `${clipKey}:${safeIdx}:${color}:${Math.round(alpha * 100)}`;
  const cached = TINT_CACHE.get(cacheKey);
  if (cached) {
    TINT_CACHE.delete(cacheKey);
    TINT_CACHE.set(cacheKey, cached);
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = clip.cellW;
  canvas.height = clip.cellH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, safeIdx * clip.cellW, 0, clip.cellW, clip.cellH, 0, 0, clip.cellW, clip.cellH);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, clip.cellW, clip.cellH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  if (TINT_CACHE.size >= MK_MAX_TINT_CACHE) {
    const oldest = TINT_CACHE.keys().next().value;
    if (oldest) TINT_CACHE.delete(oldest);
  }
  TINT_CACHE.set(cacheKey, canvas);
  return canvas;
}

export function drawMkHeroFallback(
  ctx: CanvasRenderingContext2D,
  heroId: MkHeroId,
  x: number,
  y: number,
  dir: 1 | -1,
): void {
  const color = MK_HEROES[heroId]?.accentColor ?? '#3b82f6';
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillStyle = MK_OUTLINE_INK;
  ctx.fillRect(rx - 7, ry - 26, 14, 24);
  ctx.fillStyle = color;
  ctx.fillRect(rx - 6, ry - 25, 12, 22);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(rx + dir * 2, ry - 22, 3, 2);
}

export function drawMkEnemyFallback(
  ctx: CanvasRenderingContext2D,
  kind: MkAnyEnemyId,
  x: number,
  y: number,
): void {
  const spec = MK_ENEMIES[kind];
  const r = spec.isBoss ? 18 : 8;
  const h = spec.isBoss ? 44 : 22;
  const rx = Math.round(x);
  const ry = Math.round(y);
  ctx.fillStyle = MK_OUTLINE_INK;
  ctx.fillRect(rx - r - 1, ry - h - 1, r * 2 + 2, h + 2);
  ctx.fillStyle = spec.accentColor;
  ctx.fillRect(rx - r, ry - h, r * 2, h);
}
