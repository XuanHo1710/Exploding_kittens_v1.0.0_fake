/**
 * Asset loader, manifest normalizer, Miragine-compatible frame slicer,
 * offscreen LRU hit-flash tint cache, and `#181425`-outlined procedural sprite
 * fallback for `bansung` mode (specs d09, d13, d14, d17, d18, d19).
 *
 * Asset resolution tiers:
 * 1. Primary `/database-ban-sung/manifest.json` + `/database-ban-sung/normalized/**`
 * 2. Fallback `/database-miraginewar/*` (builtin shadow/projectiles + `MIRAGINE_ANIMS`)
 * 3. Deterministic `#181425`-outlined procedural pixel canvases (256-LRU)
 */
import { BANSUNG_STATIC_ROOT } from '../../../shared/src';
import { MIRAGINE_ANIMS, type AnimMeta } from '../thap/sprites';

// ============================================================================
// 1. Constants & Public Types (d17)
// ============================================================================

export const BANSUNG_ASSET_BASE = BANSUNG_STATIC_ROOT;
export const MIRAGINE_ASSET_BASE = '/database-miraginewar';

export const MAX_CONCURRENT_IMG_LOADS = 6;
export const MAX_TINT_CACHE_ENTRIES = 128;
export const MAX_FALLBACK_CACHE_ENTRIES = 256;
export const PROCEDURAL_OUTLINE_HEX = '#181425';

export type SpriteCategory =
  | 'hero'
  | 'enemy'
  | 'boss'
  | 'weapon'
  | 'bullet'
  | 'projectile'
  | 'prop'
  | 'tile'
  | 'pickup'
  | 'fx'
  | 'vfx'
  | 'pet'
  | 'ui';

export type TintMode = 'white' | 'whiteSoft' | 'red' | 'cyan' | 'gold';

export const TINT_COLORS: Readonly<Record<TintMode, string>> = {
  white: '#FFFFFF',
  whiteSoft: 'rgba(255,255,255,0.82)',
  red: '#FF3B30',
  cyan: '#38BDF8',
  gold: '#FACC15',
};

export interface SpriteFallbackHint {
  shape: 'rect' | 'circle' | 'capsule' | 'cone';
  color: string;
  accent?: string;
}

export interface SpritePivotMeta {
  anchorX: number;
  anchorY: number;
  muzzleX?: number;
  muzzleY?: number;
}

export interface SpriteClipMeta {
  url: string;
  frames: number;
  cellW: number;
  cellH: number;
  offX: number;
  offY: number;
  fps: number;
  loop: boolean;
  nativeFacing: 'left' | 'right';
  category: SpriteCategory;
  tier?: 1 | 2;
  atlasRect?: { x: number; y: number; w: number; h: number };
  pivot?: SpritePivotMeta;
  fallback?: SpriteFallbackHint;
}

export interface AssetLoadProgress {
  loaded: number;
  total: number;
  ready: boolean;
  manifestFailed: boolean;
}

export interface DrawSpriteOpts {
  clipKey: string;
  category: SpriteCategory;
  x: number;
  y: number;
  animTimeSec: number;
  /** Optional explicit frame override (e.g., stride-coupled walk or decal variant). */
  frameIdx?: number;
  facingRight?: boolean;
  rotationRad?: number;
  flipAimY?: boolean;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
  tint?: TintMode;
  hitFlashAlpha?: number;
}

export interface ProceduralFallbackResult {
  canvas: HTMLCanvasElement;
  meta: SpriteClipMeta;
}

export interface FrameRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// ============================================================================
// 2. Module State & Caches
// ============================================================================

const clipRegistry = new Map<string, SpriteClipMeta>();

const imgCache = new Map<string, HTMLImageElement>();
const imgReady = new Map<string, boolean>();
const failedUrls = new Set<string>();
const retriedUrls = new Set<string>();
const queuedOrLoadingUrls = new Set<string>();
const highQueue: string[] = [];
const lowQueue: string[] = [];
const tier1Urls = new Set<string>();
const tier1SettledUrls = new Set<string>();

const tintCache = new Map<string, HTMLCanvasElement>();
const tintSources = new Map<string, HTMLImageElement | HTMLCanvasElement>();
const tintBlockedUrls = new Set<string>();

const fallbackCache = new Map<string, ProceduralFallbackResult>();

const loadListeners = new Set<() => void>();

let activeLoads = 0;
let cacheGeneration = 0;
let builtinSeeded = false;
let initPromise: Promise<void> | null = null;
let manifestSettled = false;
let manifestFailed = false;
let tier2Scheduled = false;
let tier2Timer: ReturnType<typeof setTimeout> | null = null;
let tier2IdleHandle: number | null = null;
let activeBiome = 'desert';

const BIOME_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  desert: ['desert', 'cactus', 'scarab', 'beholder', 'sand', 'rock', 'pillar', 'pot', 'urn', 'scrub', 'pebble'],
  crypt: ['crypt', 'tomb', 'brazier', 'skirmisher', 'shaman', 'colossus', 'bone', 'candle', 'skull', 'miragine_a13', 'miragine_b3'],
  cyber: ['cyber', 'server', 'vent', 'cable', 'emp', 'drone', 'sniper', 'thunder', 'overlord', 'pylon', 'miragine_b7'],
};

const TIER1_CLIP_KEYS: readonly string[] = [
  'shadow',
  'prop_shadow',
  'ui_shadow_unit',
  'hero_mascot_idle',
  'hero_mascot_run',
  'hero_mascot_shoot',
  'hero_mascot_dash',
  'hero_mascot_stunned',
  'hero_mascot_dead',
  'hero_ranger_idle',
  'hero_ranger_run',
  'hero_ranger_shoot',
  'hero_ranger_dash',
  'hero_ranger_stunned',
  'hero_ranger_dead',
  'hero_pyro_idle',
  'hero_pyro_run',
  'hero_pyro_shoot',
  'hero_pyro_dash',
  'hero_pyro_stunned',
  'hero_pyro_dead',
  'hero_knight_idle',
  'hero_knight_run',
  'hero_knight_shoot',
  'hero_knight_dash',
  'hero_knight_stunned',
  'hero_knight_dead',
  'pet_tiger_idle',
  'pet_tiger_trot',
  'pistol',
  'rifle',
  'smg',
  'shotgun',
  'plasma_rifle',
  'stun_bomb',
  'cluster_bomb',
  'auto_turret',
  'heal_drone',
  'bullet_kinetic_sm',
  'bullet_kinetic_md',
  'bullet_shotgun_pellet',
  'plasma_bolt',
  'bullet_enemy_orb',
  'muzzle_flash',
  'fx_muzzle_kinetic',
  'impact_spark',
  'fx_dash_dust',
  'fx_stun_ring',
  'fx_stun_star',
  'fx_explosion_he',
  'fx_explosion_stun',
  'fx_fireball',
  'fireball',
  'prop_crate',
  'prop_wood_crate',
  'prop_iron_crate',
  'prop_barrel',
  'barrel_red',
  'barrel_emp',
  'pedestal',
  'pk_hp_orb',
  'pk_energy_orb',
  'pk_armor_plate',
  'pk_coin',
  'ui_crosshair_dot',
  'ui_icon_shield',
  'ui_icon_heart',
  'ui_icon_energy',
  'ui_icon_coin',
  'ui_portrait_mascot',
  'ui_portrait_ranger',
  'ui_portrait_pyro',
  'ui_portrait_knight',
];

// ============================================================================
// 3. Builtin Miragine Fallback Clips & Manifest Normalization
// ============================================================================

const VALID_CATEGORIES = new Set<string>([
  'hero',
  'enemy',
  'boss',
  'weapon',
  'bullet',
  'projectile',
  'prop',
  'tile',
  'pickup',
  'fx',
  'vfx',
  'pet',
  'ui',
]);

function inferCategoryFromKey(key: string): SpriteCategory {
  if (key.startsWith('hero_') || /^miragine_a(0|5|8|11)_/.test(key) || /^A\d+_/.test(key)) return 'hero';
  if (key.startsWith('boss_') || key.startsWith('overlord_') || key.startsWith('miragine_a13_')) return 'boss';
  if (key.startsWith('pet_')) return 'pet';
  if (key.startsWith('tile_') || key.startsWith('wall_') || key.startsWith('terrain')) return 'tile';
  if (key.startsWith('ui_') || key.startsWith('perk_') || key === 'shadow' || key === 'prop_shadow') return 'ui';
  if (key.startsWith('pk_') || key.startsWith('prop_pickup_')) return 'pickup';
  if (key.startsWith('fx_') || key.startsWith('vfx_') || key.startsWith('muzzle_') || key.startsWith('casing_') || key === 'storm' || key === 'impact_spark') return 'fx';
  if (key.startsWith('bullet_') || key.startsWith('proj_') || key.startsWith('p_') || key === 'fireball' || key === 'thunderball' || key === 'rail_beam' || key === 'needle_orb' || key === 'sniper_slug' || key === 'plasma_bolt' || key === 'electric_arc_bolt' || key === 'laser_map_beam' || key === 'flame_stream_orb' || key === 'cryo_shard' || key === 'saw_disc' || key === 'gravity_orb') return 'projectile';
  if (key.startsWith('wpn_') || key.startsWith('gun_') || key.startsWith('w_') || key.startsWith('gadget_') || key === 'lightning_staff' || key === 'arcane_book' || key === 'plasma_rifle' || key === 'railgun_piercer') return 'weapon';
  if (key.startsWith('prop_') || key.includes('barrel') || key.includes('crate') || key.includes('crystal') || key === 'door') return 'prop';
  if (/^(scarab|skirmisher|bomb_goblin|cactus_brute|cactus_spitter|laser_sniper|pyro_shaman|thunder_mage|iron_drone|frost_mage|venom_stalker|shield_warden|mortar_beetle|void_acolyte|saw_berserker|healing_priest|shock_drone_mk2|mob_|miragine_b|B\d+_)/.test(key)) return 'enemy';
  return 'prop';
}

function inferDefaultFps(key: string, category: SpriteCategory, frames: number): number {
  if (frames <= 1) return 0;
  if (key.includes('idle')) return 6;
  if (key.includes('run') || key.includes('move') || key.includes('trot')) return 12;
  if (key.includes('dash')) return 16;
  if (key.includes('attack') || key.includes('shoot') || key.includes('cast') || key.includes('slam')) return 15;
  if (key.includes('dead')) return 10;
  if (category === 'fx' || category === 'vfx' || category === 'bullet' || category === 'projectile') return 18;
  return 10;
}

function inferDefaultLoop(key: string, category: SpriteCategory): boolean {
  if (key.includes('dead') || key.includes('dash') || key.includes('attack') || key.includes('shoot')) {
    return false;
  }
  if (category === 'fx' || category === 'vfx') return false;
  return true;
}

function resolveAssetUrl(rawPath: string, versionTag = ''): string {
  const trimmed = rawPath.trim();
  let resolved: string;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('/')
  ) {
    resolved = trimmed;
  } else {
    const clean = trimmed.replace(/^\.?\//, '');
    if (clean.startsWith('database-ban-sung/') || clean.startsWith('database-miraginewar/')) {
      resolved = `/${clean}`;
    } else {
      resolved = `${BANSUNG_ASSET_BASE}/${clean}`;
    }
  }
  if (
    versionTag &&
    resolved.startsWith(`${BANSUNG_ASSET_BASE}/`) &&
    !resolved.includes('?')
  ) {
    return `${resolved}?v=${versionTag}`;
  }
  return resolved;
}

function makeMiragineClip(
  url: string,
  meta: AnimMeta,
  category: SpriteCategory,
  nativeFacing: 'left' | 'right',
  fps: number,
  loop: boolean,
): SpriteClipMeta {
  return {
    url,
    frames: Math.max(1, meta[0] | 0),
    cellW: Math.max(1, meta[1] | 0),
    cellH: Math.max(1, meta[2] | 0),
    offX: meta[3],
    offY: meta[4],
    fps,
    loop,
    nativeFacing,
    category,
  };
}

function registerFallbackClipIfMissing(key: string, meta: SpriteClipMeta): void {
  if (!clipRegistry.has(key)) {
    clipRegistry.set(key, meta);
  }
}

function ensureBuiltinFallbacksSeeded(): void {
  if (builtinSeeded) return;
  builtinSeeded = true;

  const shadowMeta = makeMiragineClip(
    `${MIRAGINE_ASSET_BASE}/structures/shadow.png`,
    [1, 38, 16, -19, -8],
    'ui',
    'right',
    0,
    false,
  );
  registerFallbackClipIfMissing('shadow', shadowMeta);
  registerFallbackClipIfMissing('prop_shadow', { ...shadowMeta, category: 'prop' });
  registerFallbackClipIfMissing('ui_shadow_unit', shadowMeta);

  const fbAnim: AnimMeta = MIRAGINE_ANIMS.fireball ?? [3, 32, 32, -16, -16];
  const fbMeta = makeMiragineClip(`${MIRAGINE_ASSET_BASE}/projectiles/fireball.png`, fbAnim, 'fx', 'right', 16, true);
  registerFallbackClipIfMissing('fx_fireball', fbMeta);
  registerFallbackClipIfMissing('vfx_fireball', fbMeta);
  registerFallbackClipIfMissing('fireball', { ...fbMeta, category: 'projectile' });
  registerFallbackClipIfMissing('proj_fireball', { ...fbMeta, category: 'projectile' });

  const tbAnim: AnimMeta = MIRAGINE_ANIMS.thunderball ?? [16, 128, 128, -64, -64];
  const tbMeta = makeMiragineClip(`${MIRAGINE_ASSET_BASE}/projectiles/thunderball.png`, tbAnim, 'fx', 'right', 18, true);
  registerFallbackClipIfMissing('fx_thunderball', tbMeta);
  registerFallbackClipIfMissing('vfx_thunderball', tbMeta);
  registerFallbackClipIfMissing('thunderball', { ...tbMeta, category: 'projectile' });
  registerFallbackClipIfMissing('proj_thunderball', { ...tbMeta, category: 'projectile' });

  const stormAnim: AnimMeta = MIRAGINE_ANIMS.storm ?? [9, 153, 261, -76, -240];
  const stormMeta = makeMiragineClip(`${MIRAGINE_ASSET_BASE}/projectiles/storm.png`, stormAnim, 'fx', 'right', 15, false);
  registerFallbackClipIfMissing('fx_storm', stormMeta);
  registerFallbackClipIfMissing('vfx_storm', stormMeta);
  registerFallbackClipIfMissing('storm', stormMeta);

  registerFallbackClipIfMissing(
    'a_crystal',
    makeMiragineClip(`${MIRAGINE_ASSET_BASE}/structures/A_crystal.png`, [1, 96, 144, -48, -144], 'prop', 'right', 0, false),
  );
  registerFallbackClipIfMissing(
    'b_crystal',
    makeMiragineClip(`${MIRAGINE_ASSET_BASE}/structures/B_crystal.png`, [1, 96, 144, -48, -144], 'prop', 'right', 0, false),
  );
  registerFallbackClipIfMissing(
    'door',
    makeMiragineClip(`${MIRAGINE_ASSET_BASE}/structures/door.png`, [1, 150, 296, -75, -220], 'prop', 'right', 0, false),
  );
  registerFallbackClipIfMissing(
    'terrain',
    makeMiragineClip(`${MIRAGINE_ASSET_BASE}/terrains/terrain.jpg`, [1, 170, 135, 0, 0], 'tile', 'right', 0, false),
  );
  registerFallbackClipIfMissing(
    'terrain2',
    makeMiragineClip(`${MIRAGINE_ASSET_BASE}/terrains/terrain2.jpg`, [1, 680, 800, 0, 0], 'tile', 'right', 0, false),
  );

  for (const [mKey, mAnim] of Object.entries(MIRAGINE_ANIMS)) {
    if (mKey === 'fireball' || mKey === 'thunderball' || mKey === 'storm') continue;
    const isAlly = mKey.startsWith('A');
    const action = mKey.split('_')[1] ?? 'idle';
    const fps = action === 'idle' ? 5 : action === 'run' ? 12 : action === 'attack' ? 15 : 10;
    const loop = action === 'idle' || action === 'run';
    registerFallbackClipIfMissing(
      mKey,
      makeMiragineClip(
        `${MIRAGINE_ASSET_BASE}/sheets/${mKey}.png`,
        mAnim,
        isAlly ? 'hero' : 'enemy',
        'left',
        fps,
        loop,
      ),
    );
  }
}

/** Called only if `/database-ban-sung/manifest.json` fails to load so core units retain Miragine sheets. */
function seedManifestFailureMiragineAliases(): void {
  ensureBuiltinFallbacksSeeded();
  const bindUnitStates = (prefix: string, unit: string, category: SpriteCategory, stateMap: Record<string, string>) => {
    for (const [dstState, srcState] of Object.entries(stateMap)) {
      const m = clipRegistry.get(`${unit}_${srcState}`);
      if (m) {
        registerFallbackClipIfMissing(`${prefix}_${dstState}`, {
          ...m,
          category,
          loop: dstState === 'idle' || dstState === 'run' || dstState === 'stunned',
        });
      }
    }
  };
  const heroStates = { idle: 'idle', run: 'run', shoot: 'attack', dash: 'run', stunned: 'idle', dead: 'dead' };
  bindUnitStates('hero_mascot', 'A0', 'hero', heroStates);
  bindUnitStates('hero_gunner', 'A0', 'hero', heroStates);
  bindUnitStates('hero_ranger', 'A11', 'hero', heroStates);
  bindUnitStates('hero_cyber_ranger', 'A11', 'hero', heroStates);
  bindUnitStates('hero_pyro', 'A5', 'hero', heroStates);
  bindUnitStates('hero_pyromancer', 'A5', 'hero', heroStates);
  bindUnitStates('hero_knight', 'A8', 'hero', heroStates);

  const mobStates = { idle: 'idle', run: 'run', attack: 'attack', dead: 'dead' };
  bindUnitStates('pyro_shaman', 'B4', 'enemy', mobStates);
  bindUnitStates('thunder_mage', 'B7', 'enemy', mobStates);
  bindUnitStates('skirmisher', 'B3', 'enemy', mobStates);
  bindUnitStates('boss_colossus', 'A13', 'boss', { idle: 'idle', run: 'run', attack: 'attack', dead: 'dead' });
}

function normalizeClipEntry(
  key: string,
  rawEntry: unknown,
  defaultCat: SpriteCategory | undefined,
  defaultFacing: 'left' | 'right',
  versionTag = '',
): SpriteClipMeta | null {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const obj = rawEntry as Record<string, unknown>;

  const rawPath = typeof obj.url === 'string' ? obj.url : typeof obj.path === 'string' ? obj.path : null;
  if (!rawPath) return null;
  const url = resolveAssetUrl(rawPath, versionTag);

  const metaTuple = Array.isArray(obj.meta) ? (obj.meta as number[]) : null;
  const framesRaw = typeof obj.frames === 'number' ? obj.frames : metaTuple?.[0];
  const cellWRaw = typeof obj.cellW === 'number' ? obj.cellW : metaTuple?.[1];
  const cellHRaw = typeof obj.cellH === 'number' ? obj.cellH : metaTuple?.[2];
  const offXRaw = typeof obj.offX === 'number' ? obj.offX : metaTuple?.[3];
  const offYRaw = typeof obj.offY === 'number' ? obj.offY : metaTuple?.[4];

  const frames = Math.max(1, Math.round(Number(framesRaw) || 1));
  const cellW = Math.max(1, Math.round(Number(cellWRaw) || 32));
  const cellH = Math.max(1, Math.round(Number(cellHRaw) || 32));
  const offX = Number.isFinite(offXRaw) ? Math.round(offXRaw as number) : -Math.floor(cellW / 2);
  const offY = Number.isFinite(offYRaw) ? Math.round(offYRaw as number) : -cellH;

  const rawCat = typeof obj.category === 'string' ? obj.category : undefined;
  const category: SpriteCategory =
    rawCat && VALID_CATEGORIES.has(rawCat)
      ? (rawCat as SpriteCategory)
      : defaultCat ?? inferCategoryFromKey(key);

  const fps =
    typeof obj.fps === 'number' && Number.isFinite(obj.fps)
      ? Math.max(0, obj.fps)
      : inferDefaultFps(key, category, frames);
  const loop = typeof obj.loop === 'boolean' ? obj.loop : inferDefaultLoop(key, category);

  const nativeFacing: 'left' | 'right' =
    obj.nativeFacing === 'left' || obj.nativeFacing === 'right'
      ? obj.nativeFacing
      : url.startsWith(`${MIRAGINE_ASSET_BASE}/sheets/`)
        ? 'left'
        : defaultFacing;

  const clip: SpriteClipMeta = {
    url,
    frames,
    cellW,
    cellH,
    offX,
    offY,
    fps,
    loop,
    nativeFacing,
    category,
  };

  if (obj.tier === 1 || obj.tier === 2) {
    clip.tier = obj.tier;
  }

  if (obj.atlasRect && typeof obj.atlasRect === 'object') {
    const ar = obj.atlasRect as Record<string, unknown>;
    if (
      typeof ar.x === 'number' &&
      typeof ar.y === 'number' &&
      typeof ar.w === 'number' &&
      typeof ar.h === 'number' &&
      ar.w > 0 &&
      ar.h > 0
    ) {
      clip.atlasRect = {
        x: Math.round(ar.x),
        y: Math.round(ar.y),
        w: Math.round(ar.w),
        h: Math.round(ar.h),
      };
    }
  }

  if (obj.pivot && typeof obj.pivot === 'object') {
    const pv = obj.pivot as Record<string, unknown>;
    if (typeof pv.anchorX === 'number' && typeof pv.anchorY === 'number') {
      clip.pivot = {
        anchorX: Math.round(pv.anchorX),
        anchorY: Math.round(pv.anchorY),
        ...(typeof pv.muzzleX === 'number' ? { muzzleX: Math.round(pv.muzzleX) } : {}),
        ...(typeof pv.muzzleY === 'number' ? { muzzleY: Math.round(pv.muzzleY) } : {}),
      };
    }
  }

  if (obj.fallback && typeof obj.fallback === 'object') {
    const fb = obj.fallback as Record<string, unknown>;
    if (
      (fb.shape === 'rect' || fb.shape === 'circle' || fb.shape === 'capsule' || fb.shape === 'cone') &&
      typeof fb.color === 'string'
    ) {
      clip.fallback = {
        shape: fb.shape,
        color: fb.color,
        ...(typeof fb.accent === 'string' ? { accent: fb.accent } : {}),
      };
    }
  }

  return clip;
}

/**
 * Normalizes both flat (`clips` / `sprites`) and sectioned manifests
 * (`projectiles`, `structures`, `tiles`, `ui`, etc.) into `Map<string, SpriteClipMeta>`.
 */
export function normalizeBansungManifest(raw: unknown): Map<string, SpriteClipMeta> {
  const out = new Map<string, SpriteClipMeta>();
  if (!raw || typeof raw !== 'object') return out;
  const doc = raw as Record<string, unknown>;
  const defaultsObj = doc.defaults && typeof doc.defaults === 'object' ? (doc.defaults as Record<string, unknown>) : null;
  const defaultFacing: 'left' | 'right' = defaultsObj?.nativeFacing === 'left' ? 'left' : 'right';
  const verRaw =
    typeof doc.generatedAt === 'string'
      ? doc.generatedAt
      : typeof doc.version === 'number' || typeof doc.version === 'string'
        ? String(doc.version)
        : '';
  const versionTag = verRaw ? verRaw.replace(/[^a-zA-Z0-9._-]/g, '') : '';

  const ingestSection = (sec: unknown, defaultCat?: SpriteCategory) => {
    if (!sec || typeof sec !== 'object') return;
    for (const [k, v] of Object.entries(sec as Record<string, unknown>)) {
      const normalized = normalizeClipEntry(k, v, defaultCat, defaultFacing, versionTag);
      if (normalized) out.set(k, normalized);
    }
  };

  ingestSection(doc.clips);
  ingestSection(doc.sprites);
  ingestSection(doc.animations);

  const sectionedMap: readonly [string, SpriteCategory][] = [
    ['heroes', 'hero'],
    ['weapons', 'weapon'],
    ['enemies', 'enemy'],
    ['bosses', 'boss'],
    ['pets', 'pet'],
    ['projectiles', 'projectile'],
    ['vfx', 'vfx'],
    ['fx', 'fx'],
    ['structures', 'prop'],
    ['props', 'prop'],
    ['pickups', 'pickup'],
    ['tiles', 'tile'],
    ['ui', 'ui'],
  ];
  for (const [secKey, cat] of sectionedMap) {
    ingestSection(doc[secKey], cat);
  }

  return out;
}

// ============================================================================
// 4. Bounded Image Loader Queue, Retry, Negative Cache & Preloader
// ============================================================================

function notifyLoadListeners(): void {
  for (const fn of loadListeners) {
    fn();
  }
}

function enqueueImageUrl(url: string, priority: 'high' | 'low', trackTier1 = false): void {
  if (!url || typeof Image === 'undefined') return;
  if (trackTier1) {
    tier1Urls.add(url);
    if (imgReady.get(url) || failedUrls.has(url)) {
      tier1SettledUrls.add(url);
    }
  }
  if (imgReady.get(url) || failedUrls.has(url) || queuedOrLoadingUrls.has(url)) {
    return;
  }
  queuedOrLoadingUrls.add(url);
  if (priority === 'high') {
    highQueue.push(url);
  } else {
    lowQueue.push(url);
  }
  pumpLoadQueue();
}

function pumpLoadQueue(): void {
  if (typeof Image === 'undefined') return;
  while (activeLoads < MAX_CONCURRENT_IMG_LOADS) {
    const nextUrl = highQueue.length > 0 ? highQueue.shift() : lowQueue.shift();
    if (!nextUrl) break;
    if (imgReady.get(nextUrl) || failedUrls.has(nextUrl)) {
      queuedOrLoadingUrls.delete(nextUrl);
      if (tier1Urls.has(nextUrl)) tier1SettledUrls.add(nextUrl);
      continue;
    }

    const gen = cacheGeneration;
    activeLoads++;
    const img = imgCache.get(nextUrl) ?? new Image();
    imgCache.set(nextUrl, img);
    img.decoding = 'async';

    img.onload = () => {
      if (gen !== cacheGeneration) return;
      imgReady.set(nextUrl, true);
      queuedOrLoadingUrls.delete(nextUrl);
      if (tier1Urls.has(nextUrl)) tier1SettledUrls.add(nextUrl);
      activeLoads = Math.max(0, activeLoads - 1);
      notifyLoadListeners();
      pumpLoadQueue();
    };

    img.onerror = () => {
      if (gen !== cacheGeneration) return;
      if (!retriedUrls.has(nextUrl)) {
        retriedUrls.add(nextUrl);
        const bust = nextUrl.includes('?') ? `${nextUrl}&r=1` : `${nextUrl}?r=1`;
        img.src = bust;
        return;
      }
      failedUrls.add(nextUrl);
      imgReady.delete(nextUrl);
      imgCache.delete(nextUrl);
      queuedOrLoadingUrls.delete(nextUrl);
      if (tier1Urls.has(nextUrl)) tier1SettledUrls.add(nextUrl);
      activeLoads = Math.max(0, activeLoads - 1);
      notifyLoadListeners();
      pumpLoadQueue();
    };

    img.src = nextUrl;
  }
}

function enqueueBiomeClips(biomeId: string, priority: 'high' | 'low', trackTier1: boolean): void {
  const norm = biomeId.trim().toLowerCase();
  const kws = BIOME_KEYWORDS[norm] ?? [norm];
  for (const [key, meta] of clipRegistry.entries()) {
    if (kws.some((kw) => key.includes(kw))) {
      enqueueImageUrl(meta.url, priority, trackTier1);
    }
  }
}

function enqueueTier1Clips(): void {
  for (const key of TIER1_CLIP_KEYS) {
    const meta = clipRegistry.get(key);
    if (meta) enqueueImageUrl(meta.url, 'high', true);
  }
  for (const [key, meta] of clipRegistry.entries()) {
    if (meta.tier === 1) {
      enqueueImageUrl(meta.url, 'high', true);
    } else if (key.startsWith(`tile_${activeBiome}_`) || key === `wall_${activeBiome}`) {
      enqueueImageUrl(meta.url, 'high', true);
    }
  }
}

function scheduleTier2Preload(): void {
  if (tier2Scheduled || typeof Image === 'undefined') return;
  tier2Scheduled = true;
  const gen = cacheGeneration;

  const startTier2 = () => {
    if (gen !== cacheGeneration) return;
    for (const meta of clipRegistry.values()) {
      if (!imgReady.get(meta.url) && !failedUrls.has(meta.url)) {
        enqueueImageUrl(meta.url, 'low', false);
      }
    }
  };

  if (typeof requestIdleCallback === 'function') {
    tier2IdleHandle = requestIdleCallback(startTier2, { timeout: 500 });
  } else {
    tier2Timer = setTimeout(startTier2, 50);
  }
}

export function onBansungAssetLoad(fn: () => void): () => void {
  loadListeners.add(fn);
  return () => {
    loadListeners.delete(fn);
  };
}

export function getAssetLoadProgress(): AssetLoadProgress {
  const total = tier1Urls.size;
  const loaded = tier1SettledUrls.size;
  const ready = manifestSettled && (total === 0 || loaded >= total);
  return {
    loaded,
    total,
    ready,
    manifestFailed,
  };
}

export function preloadBiomeAssets(biomeId: string): void {
  if (!biomeId) return;
  activeBiome = biomeId.trim().toLowerCase() || 'desert';
  ensureBuiltinFallbacksSeeded();
  if (typeof Image === 'undefined') return;
  enqueueBiomeClips(activeBiome, 'high', !manifestSettled || tier1Urls.size === 0 ? false : true);
}

/**
 * Fetches `/database-ban-sung/manifest.json` once (deduplicated), normalizes all
 * sprite entries, kicks off Tier-1 eager preload, and defers Tier-2 preload.
 * Safe in SSR/headless environments when `typeof Image === 'undefined'`.
 */
export function initBansungAssets(): Promise<void> {
  ensureBuiltinFallbacksSeeded();
  if (initPromise) return initPromise;

  if (typeof Image === 'undefined') {
    manifestSettled = true;
    initPromise = Promise.resolve();
    return initPromise;
  }

  const gen = cacheGeneration;
  initPromise = (async () => {
    try {
      if (typeof fetch !== 'function') {
        throw new Error('fetch unavailable');
      }
      const res = await fetch(`${BANSUNG_ASSET_BASE}/manifest.json`, { cache: 'no-cache' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      if (gen !== cacheGeneration) return;
      const normalized = normalizeBansungManifest(json);
      if (normalized.size === 0) {
        throw new Error('Empty sprite manifest');
      }
      for (const [k, v] of normalized.entries()) {
        clipRegistry.set(k, v);
      }
      manifestFailed = false;
    } catch {
      if (gen !== cacheGeneration) return;
      manifestFailed = true;
      seedManifestFailureMiragineAliases();
    } finally {
      if (gen === cacheGeneration) {
        manifestSettled = true;
        enqueueTier1Clips();
        scheduleTier2Preload();
        notifyLoadListeners();
      }
    }
  })();

  return initPromise;
}

export function getClipMeta(clipKey: string): SpriteClipMeta | null {
  ensureBuiltinFallbacksSeeded();
  return clipRegistry.get(clipKey) ?? null;
}

export function getSpriteImage(url: string): HTMLImageElement | null {
  if (!url || typeof Image === 'undefined') return null;
  if (failedUrls.has(url)) return null;
  if (imgReady.get(url)) {
    const readyImg = imgCache.get(url);
    if (readyImg && readyImg.complete && readyImg.naturalWidth > 0) {
      return readyImg;
    }
  }
  enqueueImageUrl(url, 'high', false);
  return null;
}

// ============================================================================
// 5. Miragine-Style Frame Slicer & Source Rect Resolution (d17)
// ============================================================================

export function resolveFrameIndex(
  meta: Pick<SpriteClipMeta, 'frames' | 'fps' | 'loop'>,
  animTimeSec: number,
  frameIdxOverride?: number,
): number {
  const frames = Math.max(1, meta.frames | 0);
  if (frames === 1) return 0;

  if (frameIdxOverride !== undefined && Number.isFinite(frameIdxOverride)) {
    const raw = Math.floor(frameIdxOverride);
    return meta.loop ? ((raw % frames) + frames) % frames : Math.max(0, Math.min(frames - 1, raw));
  }

  const fps = Number.isFinite(meta.fps) && meta.fps > 0 ? meta.fps : 0;
  const t = Number.isFinite(animTimeSec) ? Math.max(0, animTimeSec) : 0;
  const raw = Math.floor(t * fps);
  return meta.loop ? ((raw % frames) + frames) % frames : Math.max(0, Math.min(frames - 1, raw));
}

export function resolveFrameRect(
  meta: Pick<SpriteClipMeta, 'cellW' | 'cellH' | 'atlasRect'>,
  frameIdx: number,
  imgW: number,
  imgH: number,
): FrameRect | null {
  const cellW = meta.cellW | 0;
  const cellH = meta.cellH | 0;
  if (cellW <= 0 || cellH <= 0 || imgW <= 0 || imgH <= 0) return null;

  const baseX = meta.atlasRect?.x ?? 0;
  const baseY = meta.atlasRect?.y ?? 0;
  const regionW = meta.atlasRect?.w ?? imgW;
  const cols = Math.max(1, Math.floor(regionW / cellW));
  const f = Math.max(0, frameIdx | 0);
  const sx = baseX + (f % cols) * cellW;
  const sy = baseY + Math.floor(f / cols) * cellH;

  if (sx < 0 || sy < 0 || sx + cellW > imgW || sy + cellH > imgH) {
    return null;
  }
  if (meta.atlasRect) {
    const regionBottom = baseY + meta.atlasRect.h;
    const regionRight = baseX + meta.atlasRect.w;
    if (sx + cellW > regionRight || sy + cellH > regionBottom) {
      return null;
    }
  }
  return { sx, sy, sw: cellW, sh: cellH };
}

// ============================================================================
// 6. 128-LRU White Hit-Flash & Status Tint Cache (`source-atop`)
// ============================================================================

function getSourceDims(img: HTMLImageElement | HTMLCanvasElement): { w: number; h: number; ready: boolean; url: string } {
  if ('naturalWidth' in img) {
    const ready = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    return { w: img.naturalWidth, h: img.naturalHeight, ready, url: img.src || '' };
  }
  return { w: img.width, h: img.height, ready: img.width > 0 && img.height > 0, url: '' };
}

/**
 * Lazily bakes and caches a tinted copy of a sprite sheet/canvas using `source-atop`.
 * Capped at `MAX_TINT_CACHE_ENTRIES = 128` (LRU eviction zeros evicted canvas dimensions).
 */
export function getTintedSheet(
  clipKey: string,
  img: HTMLImageElement | HTMLCanvasElement,
  tint: TintMode,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || !img) return null;
  const { w, h, ready, url } = getSourceDims(img);
  if (!ready || w <= 0 || h <= 0) return null;
  if (url && tintBlockedUrls.has(url)) return null;

  const cacheKey = `${clipKey}::${tint}`;
  const existing = tintCache.get(cacheKey);
  if (existing && existing.width === w && existing.height === h && tintSources.get(cacheKey) === img) {
    tintCache.delete(cacheKey);
    tintCache.set(cacheKey, existing);
    return existing;
  }
  if (existing) {
    tintCache.delete(cacheKey);
    tintSources.delete(cacheKey);
    existing.width = 0;
    existing.height = 0;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tctx = canvas.getContext('2d');
  if (!tctx) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  try {
    tctx.imageSmoothingEnabled = false;
    tctx.globalCompositeOperation = 'copy';
    tctx.drawImage(img, 0, 0);
    tctx.globalCompositeOperation = 'source-atop';
    tctx.fillStyle = TINT_COLORS[tint];
    tctx.fillRect(0, 0, w, h);
    tctx.globalCompositeOperation = 'source-over';
  } catch {
    if (url) tintBlockedUrls.add(url);
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  while (tintCache.size >= MAX_TINT_CACHE_ENTRIES) {
    const oldestKey = tintCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = tintCache.get(oldestKey);
    tintCache.delete(oldestKey);
    tintSources.delete(oldestKey);
    if (evicted) {
      evicted.width = 0;
      evicted.height = 0;
    }
  }

  tintCache.set(cacheKey, canvas);
  tintSources.set(cacheKey, img);
  return canvas;
}

// ============================================================================
// 7. 256-LRU `#181425`-Outlined Procedural Canvas Sprite Fallback
// ============================================================================

function hashClipKey(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

function parseHexRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || !m[1]) return [24, 20, 37];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyOutline4Conn(ctx: CanvasRenderingContext2D, w: number, h: number, hex = PROCEDURAL_OUTLINE_HEX): void {
  try {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const orig = new Uint8ClampedArray(d);
    const [or, og, ob] = parseHexRgb(hex);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if ((orig[idx + 3] ?? 0) >= 128) continue;
        const left = x > 0 && (orig[idx - 4 + 3] ?? 0) >= 128;
        const right = x + 1 < w && (orig[idx + 4 + 3] ?? 0) >= 128;
        const up = y > 0 && (orig[idx - w * 4 + 3] ?? 0) >= 128;
        const down = y + 1 < h && (orig[idx + w * 4 + 3] ?? 0) >= 128;
        if (left || right || up || down) {
          d[idx] = or;
          d[idx + 1] = og;
          d[idx + 2] = ob;
          d[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    // Headless mocks without getImageData/putImageData still keep the drawn silhouette.
  }
}

function isShadowKey(clipKey: string): boolean {
  return clipKey === 'shadow' || clipKey === 'prop_shadow' || clipKey.includes('shadow_unit');
}

function normalizeFallbackFrame(clipKey: string, category: SpriteCategory, frameIdx: number): number {
  if (isShadowKey(clipKey) || category === 'tile' || category === 'weapon' || category === 'ui') {
    return 0;
  }
  const f = Math.floor(Number.isFinite(frameIdx) ? frameIdx : 0);
  return ((f % 2) + 2) % 2;
}

function getFallbackDimensions(clipKey: string, category: SpriteCategory): { w: number; h: number; offX: number; offY: number } {
  if (isShadowKey(clipKey)) {
    return { w: 38, h: 16, offX: -19, offY: -8 };
  }
  switch (category) {
    case 'hero':
      return { w: 32, h: 32, offX: -16, offY: -29 };
    case 'pet':
      return { w: 28, h: 28, offX: -14, offY: -25 };
    case 'enemy':
      return { w: 32, h: 32, offX: -16, offY: -28 };
    case 'boss':
      return { w: 64, h: 64, offX: -32, offY: -56 };
    case 'weapon':
      return { w: 24, h: 12, offX: -6, offY: -6 };
    case 'bullet':
    case 'projectile':
      return { w: 12, h: 12, offX: -6, offY: -6 };
    case 'tile':
      return { w: 32, h: 32, offX: 0, offY: 0 };
    case 'pickup':
      return { w: 20, h: 20, offX: -10, offY: -10 };
    case 'fx':
    case 'vfx':
      return { w: 24, h: 24, offX: -12, offY: -12 };
    case 'ui':
      return { w: 24, h: 24, offX: -12, offY: -12 };
    case 'prop':
    default:
      if (clipKey.startsWith('pk_') || clipKey.includes('pickup')) {
        return { w: 20, h: 20, offX: -10, offY: -10 };
      }
      return { w: 32, h: 32, offX: -16, offY: -28 };
  }
}

function resolveFallbackPalette(clipKey: string, category: SpriteCategory, h: number): { primary: string; accent: string } {
  const hint = clipRegistry.get(clipKey)?.fallback;
  if (hint) {
    return { primary: hint.color, accent: hint.accent ?? '#fee761' };
  }
  if (category === 'hero') {
    if (clipKey.includes('mascot') || clipKey.includes('gunner')) return { primary: '#e6eef8', accent: '#2ce8f5' };
    if (clipKey.includes('ranger')) return { primary: '#262b44', accent: '#2ce8f5' };
    if (clipKey.includes('pyro')) return { primary: '#e43b44', accent: '#feae34' };
    if (clipKey.includes('knight')) return { primary: '#124e89', accent: '#fee761' };
  }
  const hue = h % 360;
  return {
    primary: hslToHex(hue, 65, 56),
    accent: hslToHex((hue + 48) % 360, 82, 68),
  };
}

function paintProceduralFallback(
  ctx: CanvasRenderingContext2D,
  clipKey: string,
  category: SpriteCategory,
  frameMod: number,
  w: number,
  h: number,
): void {
  const hash = hashClipKey(clipKey);
  const { primary, accent } = resolveFallbackPalette(clipKey, category, hash);
  const bob = frameMod === 1 ? -2 : 0;

  if (isShadowKey(clipKey)) {
    ctx.fillStyle = 'rgba(24, 20, 37, 0.36)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 16, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(24, 20, 37, 0.62)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (category === 'tile') {
    const isWall = clipKey.includes('wall');
    let base = '#D6A86E';
    let shade = '#B7854E';
    let speck = '#F5D89E';
    if (clipKey.includes('crypt')) {
      base = isWall ? '#41354F' : '#2E2538';
      shade = '#1F1827';
      speck = '#622C73';
    } else if (clipKey.includes('cyber')) {
      base = isWall ? '#283952' : '#1E293B';
      shade = '#0F172A';
      speck = '#2CE8F5';
    } else if (isWall) {
      base = '#9E5B47';
      shade = '#733E39';
      speck = '#E8B878';
    }
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = shade;
    for (let i = 0; i < 6; i++) {
      const px = ((hash >>> (i * 5)) & 31) % (w - 3);
      const py = ((hash >>> (i * 5 + 3)) & 31) % (h - 2);
      ctx.fillRect(px, py, 3, 2);
    }
    ctx.fillStyle = speck;
    for (let i = 0; i < 4; i++) {
      const px = ((hash >>> (i * 7 + 1)) & 31) % (w - 2);
      const py = ((hash >>> (i * 7 + 4)) & 31) % (h - 2);
      ctx.fillRect(px, py, 2, 1);
    }
    if (isWall) {
      ctx.fillStyle = PROCEDURAL_OUTLINE_HEX;
      ctx.fillRect(0, h - 2, w, 2);
      ctx.fillRect(0, 0, w, 1);
    }
    return;
  }

  const effectiveCat: SpriteCategory =
    category === 'prop' && (clipKey.startsWith('pk_') || clipKey.includes('pickup')) ? 'pickup' : category;

  if (effectiveCat === 'hero') {
    // Cloak & boots
    ctx.fillStyle = accent;
    ctx.fillRect(9, 16 + bob, 14, 9);
    ctx.fillStyle = primary;
    ctx.fillRect(10, 14 + bob, 12, 10);
    // Walk feet
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(10, 24 + (frameMod === 1 ? -1 : 1), 4, 4);
    ctx.fillRect(18, 24 + (frameMod === 1 ? 1 : -1), 4, 4);
    // Chibi helmet + glowing visor
    ctx.fillStyle = primary;
    ctx.fillRect(9, 6 + bob, 14, 10);
    ctx.fillStyle = accent;
    ctx.fillRect(12, 5 + bob, 8, 2);
    ctx.fillStyle = '#2ce8f5';
    ctx.fillRect(13, 9 + bob, 9, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(18, 10 + bob, 2, 2);
  } else if (effectiveCat === 'pet') {
    ctx.fillStyle = primary;
    ctx.fillRect(7, 13 + bob, 14, 9);
    ctx.fillRect(9, 8 + bob, 10, 7);
    ctx.fillRect(9, 6 + bob, 3, 3);
    ctx.fillRect(16, 6 + bob, 3, 3);
    ctx.fillStyle = accent;
    ctx.fillRect(11, 15 + bob, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(11, 10 + bob, 2, 2);
    ctx.fillRect(15, 10 + bob, 2, 2);
  } else if (effectiveCat === 'enemy') {
    const bounce = frameMod === 1 ? -2 : 0;
    const isCactus = clipKey.includes('cactus');
    ctx.fillStyle = isCactus ? '#3e8948' : primary;
    ctx.fillRect(8, 10 + bounce, 16, 15 - bounce);
    ctx.fillStyle = isCactus ? '#63c74d' : accent;
    ctx.fillRect(10, 7 + bounce, 12, 5);
    if (isCactus) {
      ctx.fillRect(5, 13 + bounce, 3, 6);
      ctx.fillRect(24, 13 + bounce, 3, 6);
    }
    // Red eyes
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(11, 14 + bounce, 3, 3);
    ctx.fillRect(18, 14 + bounce, 3, 3);
    ctx.fillStyle = '#fee761';
    ctx.fillRect(12, 15 + bounce, 1, 1);
    ctx.fillRect(19, 15 + bounce, 1, 1);
  } else if (effectiveCat === 'boss') {
    const bounce = frameMod === 1 ? -2 : 0;
    // Armored hull
    ctx.fillStyle = primary;
    ctx.fillRect(14, 16 + bounce, 36, 36);
    ctx.fillStyle = accent;
    ctx.fillRect(18, 22 + bounce, 28, 24);
    // Crown / horns
    ctx.fillStyle = '#fee761';
    ctx.fillRect(16, 8 + bounce, 6, 10);
    ctx.fillRect(28, 6 + bounce, 8, 12);
    ctx.fillRect(42, 8 + bounce, 6, 10);
    // Glowing core eye
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(26, 26 + bounce, 12, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(30, 29 + bounce, 4, 4);
    // Feet treads
    ctx.fillStyle = '#3a4466';
    ctx.fillRect(16, 52, 12, 6);
    ctx.fillRect(36, 52, 12, 6);
  } else if (effectiveCat === 'weapon') {
    const isBlade = clipKey.includes('blade') || clipKey.includes('scythe') || clipKey.includes('baton');
    const isStaff = clipKey.includes('staff') || clipKey.includes('book');
    if (isBlade) {
      ctx.fillStyle = accent;
      ctx.fillRect(2, 5, 8, 2);
      ctx.fillStyle = '#e6eef8';
      ctx.fillRect(10, 3, 11, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(18, 4, 4, 2);
    } else if (isStaff) {
      ctx.fillStyle = '#733e39';
      ctx.fillRect(2, 5, 16, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(17, 3, 5, 6);
    } else {
      // Pixel receiver + barrel + grip facing right (+X)
      ctx.fillStyle = primary;
      ctx.fillRect(3, 3, 12, 5);
      ctx.fillStyle = accent;
      ctx.fillRect(14, 4, 8, 3);
      ctx.fillStyle = '#5a6988';
      ctx.fillRect(5, 8, 4, 3);
    }
  } else if (effectiveCat === 'bullet' || effectiveCat === 'projectile') {
    ctx.fillStyle = accent;
    ctx.fillRect(2, 3, 8, 6);
    ctx.fillStyle = primary;
    ctx.fillRect(3, 4, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 5, 3, 2);
  } else if (effectiveCat === 'pickup') {
    const pulse = frameMod === 1 ? -1 : 0;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 + pulse, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillRect(8, 7 + pulse, 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 7 + pulse, 2, 2);
  } else if (effectiveCat === 'fx' || effectiveCat === 'vfx') {
    const r = frameMod === 1 ? 8 : 6;
    ctx.fillStyle = accent;
    ctx.fillRect(w / 2 - r, h / 2 - 2, r * 2, 4);
    ctx.fillRect(w / 2 - 2, h / 2 - r, 4, r * 2);
    ctx.fillStyle = primary;
    ctx.fillRect(w / 2 - 4, h / 2 - 4, 8, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 2, h / 2 - 2, 4, 4);
  } else if (effectiveCat === 'ui') {
    ctx.fillStyle = accent;
    ctx.fillRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = primary;
    ctx.fillRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(9, 9, 6, 6);
  } else {
    // Props: barrel / crate / cactus / pedestal
    if (clipKey.includes('barrel')) {
      const emp = clipKey.includes('emp');
      ctx.fillStyle = emp ? '#0095e9' : '#c72936';
      ctx.fillRect(8, 6, 16, 22);
      ctx.fillStyle = emp ? '#2ce8f5' : '#e43b44';
      ctx.fillRect(9, 7, 14, 19);
      ctx.fillStyle = emp ? '#9cf9ff' : '#fee761';
      ctx.fillRect(8, 13, 16, 4);
      ctx.fillStyle = '#5a6988';
      ctx.fillRect(9, 6, 14, 2);
      ctx.fillRect(9, 25, 14, 2);
    } else if (clipKey.includes('cactus')) {
      ctx.fillStyle = '#265c42';
      ctx.fillRect(11, 5, 10, 23);
      ctx.fillStyle = '#63c74d';
      ctx.fillRect(13, 6, 6, 21);
      ctx.fillRect(6, 12, 5, 7);
      ctx.fillRect(21, 10, 5, 7);
    } else {
      // Cross-braced crate / cover block
      ctx.fillStyle = '#733e39';
      ctx.fillRect(6, 6, 20, 21);
      ctx.fillStyle = '#c9885b';
      ctx.fillRect(8, 8, 16, 17);
      ctx.fillStyle = '#9e5b47';
      ctx.fillRect(8, 15, 16, 3);
      ctx.fillRect(15, 8, 2, 17);
    }
  }

  applyOutline4Conn(ctx, w, h, PROCEDURAL_OUTLINE_HEX);
}

/**
 * Synthesizes and caches a deterministic `#181425`-outlined procedural pixel
 * canvas for any sprite clip/category (`MAX_FALLBACK_CACHE_ENTRIES = 256` LRU).
 */
export function getProceduralFallback(
  clipKey: string,
  category: SpriteCategory,
  frameIdx: number,
): ProceduralFallbackResult {
  ensureBuiltinFallbacksSeeded();
  const fNorm = normalizeFallbackFrame(clipKey, category, frameIdx);
  const cacheKey = `${category}::${clipKey}::${fNorm}`;

  const existing = fallbackCache.get(cacheKey);
  if (existing) {
    fallbackCache.delete(cacheKey);
    fallbackCache.set(cacheKey, existing);
    return existing;
  }

  const dims = getFallbackDimensions(clipKey, category);
  const meta: SpriteClipMeta = {
    url: '',
    frames: 1,
    cellW: dims.w,
    cellH: dims.h,
    offX: dims.offX,
    offY: dims.offY,
    fps: 0,
    loop: false,
    nativeFacing: 'right',
    category,
  };

  if (typeof document === 'undefined') {
    return {
      canvas: null as unknown as HTMLCanvasElement,
      meta,
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const fctx = canvas.getContext('2d');
  if (fctx) {
    fctx.imageSmoothingEnabled = false;
    paintProceduralFallback(fctx, clipKey, category, fNorm, dims.w, dims.h);
  }

  while (fallbackCache.size >= MAX_FALLBACK_CACHE_ENTRIES) {
    const oldestKey = fallbackCache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = fallbackCache.get(oldestKey);
    fallbackCache.delete(oldestKey);
    if (evicted?.canvas) {
      evicted.canvas.width = 0;
      evicted.canvas.height = 0;
    }
  }

  const result: ProceduralFallbackResult = { canvas, meta };
  fallbackCache.set(cacheKey, result);
  return result;
}

// ============================================================================
// 8. Unified Draw Pipeline & Cache Cleanup
// ============================================================================

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function drawTransformedFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  rect: FrameRect,
  meta: SpriteClipMeta,
  opts: DrawSpriteOpts,
  tintKey: string,
  baseAlpha: number,
  hitFlashAlpha: number,
  tint: TintMode,
): void {
  const scale = Number.isFinite(opts.scale) ? (opts.scale as number) : 1;
  const sxFactor = Number.isFinite(opts.scaleX) ? (opts.scaleX as number) : 1;
  const syFactor = Number.isFinite(opts.scaleY) ? (opts.scaleY as number) : 1;
  if (baseAlpha <= 0 || scale === 0 || sxFactor === 0 || syFactor === 0) return;

  const facingRight = opts.facingRight ?? true;
  const flipAimY = opts.flipAimY ?? false;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const prevAlpha = ctx.globalAlpha;
  ctx.translate(Math.round(opts.x), Math.round(opts.y));

  if (opts.rotationRad != null && Number.isFinite(opts.rotationRad)) {
    ctx.rotate(opts.rotationRad);
    const nativeFlipX = meta.nativeFacing === 'left' ? -1 : 1;
    const flipY = flipAimY && Math.cos(opts.rotationRad) < 0 ? -1 : 1;
    ctx.scale(scale * sxFactor * nativeFlipX, scale * syFactor * flipY);
  } else {
    const flipX = meta.nativeFacing === 'left' ? facingRight : !facingRight;
    ctx.scale((flipX ? -1 : 1) * scale * sxFactor, scale * syFactor);
  }

  if (hitFlashAlpha >= 0.95 && tint === 'white') {
    const tinted = getTintedSheet(tintKey, source, 'white');
    if (tinted) {
      ctx.globalAlpha = prevAlpha * baseAlpha;
      ctx.drawImage(tinted, rect.sx, rect.sy, rect.sw, rect.sh, meta.offX, meta.offY, meta.cellW, meta.cellH);
      ctx.restore();
      return;
    }
  }

  ctx.globalAlpha = prevAlpha * baseAlpha;
  ctx.drawImage(source, rect.sx, rect.sy, rect.sw, rect.sh, meta.offX, meta.offY, meta.cellW, meta.cellH);

  if (hitFlashAlpha > 0) {
    const tinted = getTintedSheet(tintKey, source, tint);
    if (tinted) {
      ctx.globalAlpha = prevAlpha * baseAlpha * hitFlashAlpha;
      ctx.drawImage(tinted, rect.sx, rect.sy, rect.sw, rect.sh, meta.offX, meta.offY, meta.cellW, meta.cellH);
    }
  }

  ctx.restore();
}

/**
 * Draws a `ban_sung` sprite clip anchored at `(x, y)` with integer coordinate
 * snapping, `imageSmoothingEnabled = false`, `nativeFacing` / `flipAimY` mirroring,
 * and optional white/status hit-flash tinting.
 *
 * @returns `true` if a loaded real sprite was drawn; `false` if procedural fallback was drawn.
 */
export function drawBansungSprite(ctx: CanvasRenderingContext2D, opts: DrawSpriteOpts): boolean {
  if (!ctx || !Number.isFinite(opts.x) || !Number.isFinite(opts.y)) return false;

  const baseAlpha = clamp01(opts.alpha ?? 1);
  const hitFlashAlpha = clamp01(opts.hitFlashAlpha ?? 0);
  const tint: TintMode = opts.tint ?? 'white';

  const meta = getClipMeta(opts.clipKey);
  const img = meta ? getSpriteImage(meta.url) : null;
  if (meta && img) {
    const f = resolveFrameIndex(meta, opts.animTimeSec, opts.frameIdx);
    const rect = resolveFrameRect(meta, f, img.naturalWidth, img.naturalHeight);
    if (rect) {
      drawTransformedFrame(ctx, img, rect, meta, opts, opts.clipKey, baseAlpha, hitFlashAlpha, tint);
      return true;
    }
  }

  const fallbackFrame =
    opts.frameIdx !== undefined && Number.isFinite(opts.frameIdx)
      ? Math.floor(opts.frameIdx)
      : meta
        ? resolveFrameIndex(meta, opts.animTimeSec)
        : Math.floor(Math.max(0, opts.animTimeSec) * inferDefaultFps(opts.clipKey, opts.category, 2));

  const fb = getProceduralFallback(opts.clipKey, opts.category, fallbackFrame);
  if (!fb.canvas || fb.canvas.width <= 0 || fb.canvas.height <= 0) {
    return false;
  }

  const fbNormFrame = normalizeFallbackFrame(opts.clipKey, opts.category, fallbackFrame);
  const fbTintKey = `fb::${opts.category}::${opts.clipKey}::${fbNormFrame}`;
  const fbRect: FrameRect = { sx: 0, sy: 0, sw: fb.meta.cellW, sh: fb.meta.cellH };
  drawTransformedFrame(ctx, fb.canvas, fbRect, fb.meta, opts, fbTintKey, baseAlpha, hitFlashAlpha, tint);
  return false;
}

/** Releases all cached images, tinted offscreen sheets, and procedural fallback canvases. */
export function clearBansungSpriteCaches(): void {
  cacheGeneration++;
  if (tier2Timer !== null) {
    clearTimeout(tier2Timer);
    tier2Timer = null;
  }
  if (tier2IdleHandle !== null && typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(tier2IdleHandle);
    tier2IdleHandle = null;
  }

  for (const img of imgCache.values()) {
    img.onload = null;
    img.onerror = null;
  }
  imgCache.clear();
  imgReady.clear();
  failedUrls.clear();
  retriedUrls.clear();
  queuedOrLoadingUrls.clear();
  highQueue.length = 0;
  lowQueue.length = 0;
  tier1Urls.clear();
  tier1SettledUrls.clear();
  activeLoads = 0;

  for (const canvas of tintCache.values()) {
    canvas.width = 0;
    canvas.height = 0;
  }
  tintCache.clear();
  tintSources.clear();
  tintBlockedUrls.clear();

  for (const entry of fallbackCache.values()) {
    if (entry.canvas) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
  }
  fallbackCache.clear();

  clipRegistry.clear();
  builtinSeeded = false;
  initPromise = null;
  manifestSettled = false;
  manifestFailed = false;
  tier2Scheduled = false;
  activeBiome = 'desert';
}
