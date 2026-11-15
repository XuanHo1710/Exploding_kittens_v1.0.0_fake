/**
 * 2.5D Y-sorted Canvas Renderer for `bansung` (Bắn Súng Co-op).
 *
 * Implements specs d41 & d47 aligned with `shared/src/bansung` and client modules
 * (`store`, `sprites`, `anim`, `motion`, `particles`, `vfx`, `input`, `sound`):
 * - Crisp `imageSmoothingEnabled = false` pixel-art rendering.
 * - Pre-baked 512×512 static terrain chunks per `(biome, seed, cx, cy)` with
 *   biome tiles/floor details, border walls, boss arena pad & 12 enemy spawn gates.
 * - Pre-Y-sort shadow pass (obstacles, crates/props, pickups, heroes, pets,
 *   mobs, bosses, airborne Z-height scaling) before all Pass-3 entities.
 * - Zero-GC pre-allocated `SortKind` pool (512+ slots) sorting props, pickups,
 *   dash ghosts, heroes (dual-layer 360° rotating shoulder weapons), pets,
 *   8 mob archetypes, 3 bosses (`boss_beholder`, `boss_colossus`, `boss_overlord`),
 *   Overlord WeakPoints & EMP pylons, and airborne bombs.
 * - Single `globalCompositeOperation = 'lighter'` additive glow stamp pass
 *   (zero per-frame `createRadialGradient()`, zero `shadowBlur`).
 * - Outlined 96-slot floating damage numbers, camera zoom/shake/screen flash,
 *   low-HP crimson vignette, tactical pings, crosshair, and `renderBansungRadar`.
 */

import {
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_BIOME_PALETTES,
  BANSUNG_DMG_ARMOR,
  BANSUNG_DMG_BURN,
  BANSUNG_DMG_CRIT,
  BANSUNG_DMG_HEAL,
  BANSUNG_DMG_SHOCK,
  BANSUNG_DMG_STUN,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_GATES,
  BANSUNG_HEROES,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_STAT_SCALE,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PFLAG_BOT,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_HIT_FLASH,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_RELOADING,
  BANSUNG_PFLAG_SHIELD_BARRIER,
  BANSUNG_PICKUPS,
  BANSUNG_PICKUP_CONSTS,
  BANSUNG_PICKUP_IDS,
  BANSUNG_PING_ENEMY,
  BANSUNG_PING_HELP,
  BANSUNG_PING_LOOT,
  BANSUNG_PING_REVIVE,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_PROP_IDS,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_FX_STATUS_CRATE,
  BANSUNG_FX_STATUS_GACHA,
  BANSUNG_FX_STATUS_HERO_SKILL,
  BANSUNG_FX_STATUS_LEVELUP,
  BANSUNG_FX_STATUS_BOSS_PART_BREAK,
  BANSUNG_FX_STATUS_RESTOCK,
  BANSUNG_FX_STATUS_REVIVED,
  BANSUNG_FX_STATUS_RELOAD_PERFECT,
  BANSUNG_TILE_SIZE,
  BANSUNG_WEAPON_TIERS,
  BANSUNG_EFLAG_ARMORED,
  BANSUNG_EFLAG_BURNING,
  BANSUNG_EFLAG_ELITE,
  BANSUNG_EFLAG_EVOLVED,
  BANSUNG_EFLAG_HIT_FLASH,
  BANSUNG_EFLAG_LEFT,
  BANSUNG_EFLAG_SHIELDED,
  BANSUNG_EFLAG_STUNNED,
  BANSUNG_EFLAG_TELEGRAPH,
  DREAD_COLOSSUS_CFG,
  FX_DEATH,
  FX_DMG,
  FX_IMPACT,
  FX_MUZZLE,
  FX_STATUS,
  OVERLORD_STATS,
  dequantizeAim,
  getBossHpBars,
  getWeaponByIdx,
  getWeaponSpec,
  normalizeWeaponTier,
  resolveBossBarState,
  type BansungBiome,
  type BansungBossFrame,
  type BansungBossPartView,
  type BansungEmpPylon,
  type BansungEnemyId,
  type BansungHazardWire,
  type BansungHeroId,
  type BansungLaserLane,
  type BansungPetFrame,
  type BansungPetKind,
  type BansungPetNetTuple,
  type BansungPropKind,
  type BansungTelegraphWire,
  type BansungUnitState,
  type BansungWeakPointView,
  type BansungWeaponTier,
} from '../../../shared/src';
import {
  bansungHeroAnim,
  drawHeroShadow,
  getHeroHeadAnchor,
  resolveHeroClipKey,
  resolveWeaponClipKey,
} from './anim';
import { bansungInput } from './input';
import {
  bansungMotion,
  drawDashGhost,
  type DashGhost,
} from './motion';
import {
  FxColor,
  FxKind,
  FxLayer,
  FxPrio,
  DecalKind,
  bansungFx,
} from './particles';
import { consumeFrameAudioEvents } from './sound';
import {
  drawBansungSprite,
  getClipMeta,
  getProceduralFallback,
  getSpriteImage,
  getTintedSheet,
  onBansungAssetLoad,
  resolveFrameIndex,
  resolveFrameRect,
  type SpriteClipMeta,
} from './sprites';
import {
  bansungStore,
  clamp,
  type BansungPingItem,
  type BansungStore,
  type InterpBoss,
  type InterpBullet,
  type InterpEnemy,
  type InterpPlayer,
  type SnapFxEvent,
  type SnapPickup,
  type SnapPlayerOrbs,
  type SnapProp,
  type SnapSpiritSword,
  type StaticObstacleBox,
} from './store';
import {
  BOMB_FX,
  bansungVfx,
  drawOverheadStunStars,
  drawPetCompanion,
  drawPetMagnetTether,
  resolveStunPose,
  type PetVisualState,
} from './vfx';

// ============================================================================
// 1. Spec Constants & Exported Contracts (d41, d47)
// ============================================================================

export const RENDER_CFG = {
  DPR_CAP: 2,
  WORLD_ZOOM_BASE: 1.35,
  CULL_PAD_PX: 160,
  MAX_SORT_ITEMS: 512,
  MAX_DMG_NUMBERS: 96,
  GLOW_STAMP_PX: 64,
  SCRATCH_PX: 160,
  MAX_FLASH_ALPHA: 0.65,
  CHUNK_SIZE: 512,
  MAX_TERRAIN_CHUNKS: 32,
  MAX_GLOW_STAMPS: 192,
  MAX_MELEE_SLASHES: 16,
  MELEE_SLASH_TTL_MS: 210,
  DEFAULT_RADAR_RADIUS: 900,
} as const;

export type GlowColor = 'fire' | 'cyan' | 'emerald' | 'violet' | 'crimson' | 'white';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  flashAlpha: number;
  flashColor: string;
}

export interface RenderOpts {
  w: number;
  h: number;
  dpr: number;
  cam: CameraState;
  myPlayerId: number;
  aimWorldX: number;
  aimWorldY: number;
  dark: boolean;
  /** Optional custom store instance (defaults to singleton `bansungStore`). */
  store?: BansungStore;
  /** Optional explicit timestamp in ms (defaults to `performance.now()`). */
  nowMs?: number;
  /** Draw world-space crosshair reticle & auto-aim lock indicator (default true). */
  showCrosshair?: boolean;
  /** Reduces bright flashbang intensity when accessibility setting is enabled. */
  reducedFlash?: boolean;
  /** Skip calling `store.step(nowMs)` if caller already stepped store this frame. */
  skipStoreStep?: boolean;
  /** Skip routing drained FX events to `consumeFrameAudioEvents`. */
  skipAudio?: boolean;
}

export interface RadarOpts {
  w?: number;
  h?: number;
  mode?: 'arena' | 'radar';
  radarRadius?: number;
  myPlayerId?: number;
  store?: BansungStore;
  nowMs?: number;
}

/** isolatedModules-safe Y-sort category constants matching spec d41 ordering. */
export const SortKind = {
  Prop: 0,
  Pickup: 1,
  Ghost: 2,
  Hero: 3,
  Pet: 4,
  Mob: 5,
  Boss: 6,
  ArcBomb: 7,
} as const;

export type SortKind = (typeof SortKind)[keyof typeof SortKind];

export interface RenderItem {
  sortY: number;
  kind: SortKind;
  sub: number;
  idx: number;
  x: number;
  y: number;
  z: number;
  alpha: number;
}

export interface DamageNumber {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  stroke: string;
  scale: number;
  ageMs: number;
  ttlMs: number;
}

const TWO_PI = Math.PI * 2;
const OUTLINE_INK = '#111827';
const DEEP_INK = '#140c1c';
const BOSS_FRAME_EPS = 0.001;
const REVIVE_RING_RADIUS = 72;
const OVERLORD_EMP_PULSE_RADIUS = 135;
const PING_DEFAULT_TTL_MS = 4000;

const PEDESTAL_ANCHORS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1584, y: 2016 },
  { x: 4752, y: 2016 },
  { x: 3168, y: 792 },
  { x: 1944, y: 3120 },
  { x: 4392, y: 3120 },
];

function resolveHeroMaxHp(heroId: BansungHeroId, fallback = 60): number {
  const base = BANSUNG_HEROES[heroId]?.hp;
  return typeof base === 'number' && base > 0 ? base * BANSUNG_HERO_STAT_SCALE : fallback;
}

const BIOME_ABYSS: Record<BansungBiome, string> = {
  desert: '#1c1714',
  crypt: '#1b1018',
  cyber: '#0f1722',
};

type AnyPickupKind = keyof typeof BANSUNG_PICKUPS | (typeof BANSUNG_PICKUP_IDS)[number];

const PICKUP_KIND_BY_IDX: readonly AnyPickupKind[] = (() => {
  const byIdx: AnyPickupKind[] = [];
  for (const def of Object.values(BANSUNG_PICKUPS)) {
    byIdx[def.kindIdx] = def.kind;
  }
  for (let i = 0; i < BANSUNG_PICKUP_IDS.length; i++) {
    if (!byIdx[i]) byIdx[i] = BANSUNG_PICKUP_IDS[i];
  }
  return byIdx;
})();

function resolvePickupKind(kindIdx: number): AnyPickupKind {
  return PICKUP_KIND_BY_IDX[kindIdx] ?? 'coin';
}

// ============================================================================
// 2. Module-Init Offscreen Caches & Zero-GC Pools
// ============================================================================

interface TerrainChunkEntry {
  canvas: HTMLCanvasElement;
  biome: BansungBiome;
  hasTileSprite: boolean;
  hasWallSprite: boolean;
  hasTrimSprite: boolean;
  decorMask: number;
}

interface GlowStampSlot {
  color: GlowColor;
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

interface MeleeSlashFx {
  active: boolean;
  x: number;
  y: number;
  angleRad: number;
  weaponIdx: number;
  swingDir: 1 | -1;
  ageMs: number;
  ttlMs: number;
}

/** Extended payload descriptor mapped 1:1 with `sortPool` slots (zero-GC). */
interface SortPayload {
  tag:
    | 'none'
    | 'obstacle'
    | 'prop'
    | 'pickup'
    | 'ghost'
    | 'hero'
    | 'pet'
    | 'mob'
    | 'boss'
    | 'weakpoint'
    | 'pylon';
  obstacle: StaticObstacleBox | null;
  prop: SnapProp | null;
  pickup: SnapPickup | null;
  ghost: DashGhost | null;
  player: InterpPlayer | null;
  pet: PetVisualState | null;
  enemy: InterpEnemy | null;
  boss: ExtendedBossView | null;
  weakPoint: ExtendedWeakPoint | null;
  pylon: ExtendedPylon | null;
}

interface ExtendedWeakPoint extends BansungWeakPointView {
  x: number;
  y: number;
  bossId: number;
  bossX: number;
  bossY: number;
  z: number;
}

interface ExtendedPylon extends BansungEmpPylon {
  landingRatio?: number;
}

interface ExtendedBossView {
  id: number;
  kind: BansungEnemyId;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  phase: number;
  state: number;
  aim: number;
  telegraph: number;
  stagger: number;
  maxStagger: number;
  facingLeft: boolean;
  hitFlash: boolean;
  stunned: boolean;
  burning: boolean;
  shielded: boolean;
  weakPoints?: BansungWeakPointView[];
  pylons?: BansungEmpPylon[];
  laserLanes?: BansungLaserLane[];
  telegraphs?: BansungTelegraphWire[];
  parts?: BansungBossPartView[];
  unlockedSkills?: string[];
  hpBars?: number;
  scale?: number;
  splitTier?: number;
}

const terrainChunks = new Map<string, TerrainChunkEntry>();
let glowStamps: Record<GlowColor, HTMLCanvasElement> | null = null;
let vignetteCanvas: HTMLCanvasElement | null = null;
let vignetteW = 0;
let vignetteH = 0;
let assetListenerBound = false;
let assetLoadBump = 0;

// Pre-allocated zero-GC sort pool (grows only if scene exceeds 512 simultaneous items)
const sortPool: RenderItem[] = Array.from({ length: RENDER_CFG.MAX_SORT_ITEMS }, () => ({
  sortY: 0,
  kind: SortKind.Prop,
  sub: 0,
  idx: 0,
  x: 0,
  y: 0,
  z: 0,
  alpha: 1,
}));

const sortPayloads: SortPayload[] = Array.from({ length: RENDER_CFG.MAX_SORT_ITEMS }, () => ({
  tag: 'none',
  obstacle: null,
  prop: null,
  pickup: null,
  ghost: null,
  player: null,
  pet: null,
  enemy: null,
  boss: null,
  weakPoint: null,
  pylon: null,
}));

const sortOrder: number[] = Array.from(
  { length: RENDER_CFG.MAX_SORT_ITEMS },
  (_, i) => i,
);

// Pre-allocated additive glow queue flushed once per frame in Pass 5
const glowQueue: GlowStampSlot[] = Array.from(
  { length: RENDER_CFG.MAX_GLOW_STAMPS },
  () => ({
    color: 'white',
    x: 0,
    y: 0,
    radius: 32,
    alpha: 0.5,
  }),
);
let glowQueueCount = 0;

// Pre-allocated 96-slot outlined damage number ring buffer (Pass 7)
const dmgNums: DamageNumber[] = Array.from({ length: RENDER_CFG.MAX_DMG_NUMBERS }, () => ({
  active: false,
  x: 0,
  y: 0,
  vy: -42,
  text: '',
  color: '#ffffff',
  stroke: OUTLINE_INK,
  scale: 1,
  ageMs: 0,
  ttlMs: 820,
}));
let dmgNumHead = 0;

// Pre-allocated 16-slot melee slash arc pool
const meleeSlashes: MeleeSlashFx[] = Array.from(
  { length: RENDER_CFG.MAX_MELEE_SLASHES },
  () => ({
    active: false,
    x: 0,
    y: 0,
    angleRad: 0,
    weaponIdx: 0,
    swingDir: 1,
    ageMs: 0,
    ttlMs: RENDER_CFG.MELEE_SLASH_TTL_MS,
  }),
);
let meleeSlashHead = 0;

// Reusable scratch collections (zero per-frame heap churn)
const seenPlayerIds = new Set<number>();
const bulletScratch: InterpBullet[] = [];
const activeDronesScratch: InterpEnemy[] = [];
const visibleObstaclesScratch: StaticObstacleBox[] = [];
const visiblePropsScratch: SnapProp[] = [];
const visiblePickupsScratch: SnapPickup[] = [];
const visibleEnemiesScratch: InterpEnemy[] = [];
function makeEmptyBossView(): ExtendedBossView {
  return {
    id: 0,
    kind: 'boss_beholder',
    x: 0,
    y: 0,
    z: 0,
    hp: 0,
    maxHp: 1,
    phase: 1,
    state: 0,
    aim: 0,
    telegraph: 0,
    stagger: 0,
    maxStagger: 100,
    facingLeft: false,
    hitFlash: false,
    stunned: false,
    burning: false,
    shielded: false,
    scale: 1,
    splitTier: 0,
  };
}
const bossRenderViews: ExtendedBossView[] = Array.from({ length: 24 }, () => makeEmptyBossView());
let activeBossCount = 0;

interface RenderedTelegraphKey {
  id: number;
  kind: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const renderedBossTelegraphsScratch: RenderedTelegraphKey[] = Array.from({ length: 64 }, () => ({
  id: 0,
  kind: 0,
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
}));
let renderedBossTelegraphCount = 0;

type BossLaserThemeKey = 'crimson' | 'gold' | 'cyan' | 'violet' | 'orange' | 'emerald';

interface ActiveBossBeamSlot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  halfW: number;
  prog01: number;
  theme: BossLaserThemeKey;
  seed: number;
}

const activeBossBeamsScratch: ActiveBossBeamSlot[] = Array.from({ length: 36 }, () => ({
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  halfW: 16,
  prog01: 0.5,
  theme: 'crimson',
  seed: 0,
}));
let activeBossBeamCount = 0;

const LASER_MAX_NODES = 48;
const laserUpperY = new Float32Array(LASER_MAX_NODES);
const laserLowerY = new Float32Array(LASER_MAX_NODES);
const laserLateralStripCache = new Map<BossLaserThemeKey, HTMLCanvasElement>();

const weakPointScratch: ExtendedWeakPoint[] = Array.from({ length: 8 }, () => ({
  idx: 0,
  angQ: 0,
  hp: 0,
  maxHp: 1,
  x: 0,
  y: 0,
  bossId: 0,
  bossX: 0,
  bossY: 0,
  z: 18,
}));
const pylonScratch: ExtendedPylon[] = Array.from({ length: 8 }, () => ({
  id: 0,
  x: 0,
  y: 0,
  hp: 0,
  maxHp: 1,
  chargeQ: 0,
  landingRatio: 1,
}));
const dashGhostSnapshotList: DashGhost[] = [];

const screenFlashState = {
  alpha: 0,
  color: '#ffffff',
  decayPerSec: 1.8,
};

let lastFrameMs = 0;
let sortItemsLastFrame = 0;
let drawCallsLastFrame = 0;

function makeOffscreenCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function bindAssetLoadListener(): void {
  if (assetListenerBound) return;
  assetListenerBound = true;
  onBansungAssetLoad(() => {
    assetLoadBump++;
  });
}

function isSpriteLoaded(clipKey: string): boolean {
  const meta = getClipMeta(clipKey);
  if (!meta) return false;
  const img = getSpriteImage(meta.url);
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

function ensureGlowStamps(): Record<GlowColor, HTMLCanvasElement> | null {
  if (glowStamps) return glowStamps;
  if (typeof document === 'undefined') return null;

  const specs: Record<GlowColor, [string, string, string]> = {
    fire: ['rgba(255,243,191,0.96)', 'rgba(255,146,43,0.45)', 'rgba(255,94,0,0)'],
    cyan: ['rgba(231,245,255,0.96)', 'rgba(51,154,240,0.45)', 'rgba(34,211,238,0)'],
    emerald: ['rgba(211,249,216,0.96)', 'rgba(81,207,102,0.45)', 'rgba(32,201,151,0)'],
    violet: ['rgba(243,240,255,0.96)', 'rgba(177,151,252,0.45)', 'rgba(132,94,247,0)'],
    crimson: ['rgba(255,201,201,0.96)', 'rgba(250,82,82,0.45)', 'rgba(224,49,49,0)'],
    white: ['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.40)', 'rgba(255,255,255,0)'],
  };

  const size = RENDER_CFG.GLOW_STAMP_PX;
  const half = size * 0.5;
  const built = {} as Record<GlowColor, HTMLCanvasElement>;
  const keys: GlowColor[] = ['fire', 'cyan', 'emerald', 'violet', 'crimson', 'white'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const c = makeOffscreenCanvas(size, size);
    if (!c) return null;
    const gctx = c.getContext('2d');
    if (gctx) {
      const grad = gctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, specs[k][0]);
      grad.addColorStop(0.42, specs[k][1]);
      grad.addColorStop(1, specs[k][2]);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, size, size);
    }
    built[k] = c;
  }
  glowStamps = built;
  return glowStamps;
}

function ensureVignetteCanvas(w: number, h: number): HTMLCanvasElement | null {
  const iw = Math.max(2, Math.round(w));
  const ih = Math.max(2, Math.round(h));
  if (vignetteCanvas && vignetteW === iw && vignetteH === ih) {
    return vignetteCanvas;
  }
  const c = makeOffscreenCanvas(iw, ih);
  if (!c) return null;
  const vctx = c.getContext('2d');
  if (vctx) {
    const cx = iw * 0.5;
    const cy = ih * 0.5;
    const outerR = Math.hypot(cx, cy);
    const innerR = outerR * 0.44;
    const grad = vctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(201, 42, 42, 0)');
    grad.addColorStop(0.68, 'rgba(201, 42, 42, 0.25)');
    grad.addColorStop(1, 'rgba(180, 20, 28, 0.85)');
    vctx.fillStyle = grad;
    vctx.fillRect(0, 0, iw, ih);
  }
  vignetteCanvas = c;
  vignetteW = iw;
  vignetteH = ih;
  return c;
}

function queueGlow(
  color: GlowColor,
  x: number,
  y: number,
  radius: number,
  alpha: number,
): void {
  if (glowQueueCount >= glowQueue.length || alpha <= 0.01 || radius <= 1) return;
  const slot = glowQueue[glowQueueCount++];
  slot.color = color;
  slot.x = x;
  slot.y = y;
  slot.radius = radius;
  slot.alpha = clamp(alpha, 0, 1);
}

function pushSortItem(
  sortY: number,
  kind: SortKind,
  sub: number,
  idx: number,
  x: number,
  y: number,
  z: number,
  alpha: number,
): SortPayload {
  const pos = sortItemsLastFrame;
  if (pos >= sortPool.length) {
    sortPool.push({
      sortY: 0,
      kind: SortKind.Prop,
      sub: 0,
      idx: 0,
      x: 0,
      y: 0,
      z: 0,
      alpha: 1,
    });
    sortPayloads.push({
      tag: 'none',
      obstacle: null,
      prop: null,
      pickup: null,
      ghost: null,
      player: null,
      pet: null,
      enemy: null,
      boss: null,
      weakPoint: null,
      pylon: null,
    });
    sortOrder.push(pos);
  }
  const item = sortPool[pos];
  item.sortY = sortY;
  item.kind = kind;
  item.sub = sub;
  item.idx = idx;
  item.x = x;
  item.y = y;
  item.z = z;
  item.alpha = alpha;

  const payload = sortPayloads[pos];
  payload.tag = 'none';
  sortOrder[pos] = pos;
  sortItemsLastFrame = pos + 1;
  return payload;
}

function compareSortSlots(aIdx: number, bIdx: number): number {
  const a = sortPool[aIdx];
  const b = sortPool[bIdx];
  const dy = a.sortY - b.sortY;
  if (dy !== 0) return dy;
  const ds = a.sub - b.sub;
  if (ds !== 0) return ds;
  const dk = a.kind - b.kind;
  if (dk !== 0) return dk;
  return a.idx - b.idx;
}

function insertionSortOrder(left: number, right: number): void {
  for (let i = left + 1; i <= right; i++) {
    const key = sortOrder[i];
    let j = i - 1;
    while (j >= left && compareSortSlots(sortOrder[j], key) > 0) {
      sortOrder[j + 1] = sortOrder[j];
      j--;
    }
    sortOrder[j + 1] = key;
  }
}

function quickSortOrder(left: number, right: number): void {
  while (left < right) {
    if (right - left <= 18) {
      insertionSortOrder(left, right);
      return;
    }
    const mid = (left + right) >> 1;
    const pivotSlot = sortOrder[mid];
    let i = left;
    let j = right;
    while (i <= j) {
      while (compareSortSlots(sortOrder[i], pivotSlot) < 0) i++;
      while (compareSortSlots(sortOrder[j], pivotSlot) > 0) j--;
      if (i <= j) {
        const tmp = sortOrder[i];
        sortOrder[i] = sortOrder[j];
        sortOrder[j] = tmp;
        i++;
        j--;
      }
    }
    if (j - left < right - i) {
      if (left < j) quickSortOrder(left, j);
      left = i;
    } else {
      if (i < right) quickSortOrder(i, right);
      right = j;
    }
  }
}

// ============================================================================
// 3. Deterministic Pixel Hashing, Color Helpers & Geometry Raycast
// ============================================================================

function hash2i(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function drawSpriteOrFallback(
  ctx: CanvasRenderingContext2D,
  clipKey: string,
  x: number,
  y: number,
  animTimeSec: number,
  opts?: {
    flipX?: boolean;
    alpha?: number;
    scale?: number;
    frameIdx?: number;
    category?: SpriteClipMeta['category'];
    tint?: 'white' | 'red' | 'cyan' | 'gold' | 'none';
    rotationRad?: number;
  },
): boolean {
  const meta = getClipMeta(clipKey);
  if (meta) {
    const img = getSpriteImage(meta.url);
    if (img && img.complete && img.naturalWidth > 0) {
      const f = resolveFrameIndex(meta, animTimeSec, opts?.frameIdx);
      const rect = resolveFrameRect(meta, f, img.naturalWidth, img.naturalHeight);
      if (rect) {
        const tint = opts?.tint && opts.tint !== 'none' ? opts.tint : null;
        const src: CanvasImageSource = (tint ? getTintedSheet(clipKey, img, tint) : null) ?? img;
        const scale = opts?.scale ?? 1;
        const alpha = opts?.alpha ?? 1;
        const rx = Math.round(x);
        const ry = Math.round(y);
        const rot = opts?.rotationRad ?? 0;
        const facingRight = !(opts?.flipX ?? false);
        const shouldMirror = meta.nativeFacing === 'left' ? facingRight : !facingRight;

        if (alpha !== 1 || rot !== 0 || shouldMirror || scale !== 1) {
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.imageSmoothingEnabled = false;
          ctx.translate(rx, ry);
          if (rot !== 0) ctx.rotate(rot);
          ctx.scale(shouldMirror ? -scale : scale, scale);
          ctx.drawImage(
            src,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            meta.offX,
            meta.offY,
            meta.cellW,
            meta.cellH,
          );
          ctx.restore();
        } else {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            src,
            rect.sx,
            rect.sy,
            rect.sw,
            rect.sh,
            rx + meta.offX,
            ry + meta.offY,
            meta.cellW,
            meta.cellH,
          );
        }
        drawCallsLastFrame++;
        return true;
      }
    }
  }
  return drawBansungSprite(ctx, {
    clipKey,
    x: Math.round(x),
    y: Math.round(y),
    animTimeSec,
    frameIdx: opts?.frameIdx,
    facingRight: !(opts?.flipX ?? false),
    rotationRad: opts?.rotationRad,
    scale: opts?.scale,
    alpha: opts?.alpha,
    category: opts?.category ?? 'prop',
    tint: opts?.tint === 'none' ? undefined : opts?.tint,
  });
}

function drawFirstAvailableClip(
  ctx: CanvasRenderingContext2D,
  candidates: readonly string[],
  x: number,
  y: number,
  animTimeSec: number,
  opts?: {
    flipX?: boolean;
    alpha?: number;
    scale?: number;
    frameIdx?: number;
    category?: SpriteClipMeta['category'];
    tint?: 'white' | 'red' | 'cyan' | 'gold' | 'none';
    rotationRad?: number;
  },
): boolean {
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    const meta = getClipMeta(key);
    if (!meta) continue;
    const img = getSpriteImage(meta.url);
    if (img && img.complete && img.naturalWidth > 0) {
      drawCallsLastFrame++;
      return drawSpriteOrFallback(ctx, key, x, y, animTimeSec, opts);
    }
  }
  return false;
}

function raycastObstacles(
  x0: number,
  y0: number,
  angle: number,
  maxDist: number,
  obstacles: readonly StaticObstacleBox[],
  mapW: number,
  mapH: number,
): { ex: number; ey: number; dist: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let bestT = maxDist;

  // Clip against playable arena inner boundary walls
  const minX = BANSUNG_PLAYABLE_BOUNDS.x0;
  const minY = BANSUNG_PLAYABLE_BOUNDS.y0;
  const maxX = Math.max(
    minX + 48,
    mapW === BANSUNG_MAP_W ? BANSUNG_PLAYABLE_BOUNDS.x1 : mapW - 48,
  );
  const maxY = Math.max(
    minY + 48,
    mapH === BANSUNG_MAP_H ? BANSUNG_PLAYABLE_BOUNDS.y1 : mapH - 48,
  );

  if (dx > 1e-5) bestT = Math.min(bestT, (maxX - x0) / dx);
  else if (dx < -1e-5) bestT = Math.min(bestT, (minX - x0) / dx);
  if (dy > 1e-5) bestT = Math.min(bestT, (maxY - y0) / dy);
  else if (dy < -1e-5) bestT = Math.min(bestT, (minY - y0) / dy);

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    let tmin = 0;
    let tmax = bestT;

    if (Math.abs(dx) < 1e-6) {
      if (x0 < o.x || x0 > o.x + o.w) continue;
    } else {
      const invX = 1 / dx;
      let t1 = (o.x - x0) * invX;
      let t2 = (o.x + o.w - x0) * invX;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-6) {
      if (y0 < o.y || y0 > o.y + o.h) continue;
    } else {
      const invY = 1 / dy;
      let t1 = (o.y - y0) * invY;
      let t2 = (o.y + o.h - y0) * invY;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin >= 0 && tmin < bestT) {
      bestT = tmin;
    }
  }

  bestT = Math.max(8, bestT);
  return {
    ex: x0 + dx * bestT,
    ey: y0 + dy * bestT,
    dist: bestT,
  };
}

function drawPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fillStyle: string,
  alpha = 1,
): void {
  if (rx <= 0 || ry <= 0 || alpha <= 0) return;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * alpha;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, TWO_PI);
  ctx.fill();
  ctx.globalAlpha = prevAlpha;
}

function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.45,
): void {
  const shadowClip = getClipMeta('ui_shadow_unit') ?? getClipMeta('shadow');
  const img = shadowClip ? getSpriteImage(shadowClip.url) : null;
  const rw = Math.max(8, Math.round(w));
  const rh = Math.max(4, Math.round(h));
  const rx = Math.round(x - rw * 0.5);
  const ry = Math.round(y - rh * 0.5);

  if (shadowClip && img && img.complete && img.naturalWidth > 0) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * clamp(alpha, 0, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, shadowClip.cellW, shadowClip.cellH, rx, ry, rw, rh);
    ctx.globalAlpha = prevAlpha;
  } else {
    drawPixelEllipse(ctx, x, y, rw * 0.5, rh * 0.5, DEEP_INK, alpha);
  }
  drawCallsLastFrame++;
}

// ============================================================================
// 4. 512×512 Pre-Baked Biome Terrain Chunk Cache
// ============================================================================

function drawTerrainDecorTile(
  ctx: CanvasRenderingContext2D,
  biome: BansungBiome,
  tx: number,
  ty: number,
  col: number,
  row: number,
  seed: number,
): void {
  const h = hash2i(col, row, seed ^ 0x9e3779b9);
  const pal = BANSUNG_BIOME_PALETTES[biome];
  const ox = (h & 15) + 12;
  const oy = ((h >>> 4) & 15) + 12;

  if (biome === 'desert') {
    if ((h & 7) === 0) {
      // Sun-cracked sand ripples + desert pebbles
      ctx.fillStyle = pal.floorAccent;
      ctx.fillRect(tx + 8, ty + 14, 14, 1);
      ctx.fillRect(tx + 24, ty + 31, 12, 1);
      ctx.fillStyle = pal.wallTrim;
      ctx.fillRect(tx + ox, ty + oy, 3, 2);
      ctx.fillRect(tx + ox + 5, ty + oy + 2, 2, 2);
    } else if ((h & 15) === 3) {
      const clipKey = (h & 16) === 0 ? 'decor_pebble' : 'decor_scrub';
      const meta = getClipMeta(clipKey);
      const img = meta ? getSpriteImage(meta.url) : null;
      if (meta && img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, meta.cellW, meta.cellH, tx + 8, ty + 8, 32, 32);
      } else {
        ctx.fillStyle = '#8b6f47';
        ctx.fillRect(tx + ox, ty + oy, 4, 3);
        ctx.fillStyle = '#6a994e';
        ctx.fillRect(tx + ox + 6, ty + oy - 2, 2, 3);
      }
    }
    return;
  }

  if (biome === 'crypt') {
    if ((h & 7) === 1) {
      // Flagstone cracks & moss patches
      ctx.fillStyle = pal.floorAccent;
      ctx.fillRect(tx + 10, ty + 12, 8, 1);
      ctx.fillRect(tx + 18, ty + 13, 1, 7);
      ctx.fillStyle = '#3b5249';
      ctx.fillRect(tx + 6, ty + 36, 5, 3);
    } else if ((h & 31) === 5) {
      const clipKey = (h & 32) === 0 ? 'decor_bone' : 'decor_skull';
      const meta = getClipMeta(clipKey);
      const img = meta ? getSpriteImage(meta.url) : null;
      if (meta && img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, meta.cellW, meta.cellH, tx + 8, ty + 8, 32, 32);
      } else {
        ctx.fillStyle = '#ced4da';
        ctx.fillRect(tx + ox, ty + oy, 5, 2);
        ctx.fillStyle = '#868e96';
        ctx.fillRect(tx + ox + 1, ty + oy + 2, 3, 1);
      }
    }
    return;
  }

  // Cyber lab deck plates + faint neon conduit traces
  if ((h & 7) === 2) {
    ctx.fillStyle = pal.floorAccent;
    ctx.fillRect(tx + 4, ty + 4, 3, 3);
    ctx.fillRect(tx + 41, ty + 41, 3, 3);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
    ctx.fillRect(tx + 12, ty + 23, 24, 2);
  } else if ((h & 31) === 7) {
    const clipKey = (h & 32) === 0 ? 'decor_vent' : 'decor_cable';
    const meta = getClipMeta(clipKey);
    const img = meta ? getSpriteImage(meta.url) : null;
    if (meta && img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, meta.cellW, meta.cellH, tx + 8, ty + 8, 32, 32);
    } else {
      ctx.fillStyle = '#334155';
      ctx.fillRect(tx + 14, ty + 14, 18, 12);
      ctx.fillStyle = '#0f172a';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(tx + 16 + k * 4, ty + 16, 2, 8);
      }
    }
  }
}

function getOrBakeTerrainChunk(
  biome: BansungBiome,
  seed: number,
  mapW: number,
  mapH: number,
  cx: number,
  cy: number,
): HTMLCanvasElement | null {
  const key = `${biome}:${seed}:${mapW}x${mapH}:${cx},${cy}`;
  const tileClipKey = `tile_${biome}_floor`;
  const wallClipKey = `tile_${biome}_wall`;
  const trimClipKey = `tile_${biome}_trim`;
  const tileLoadedNow = isSpriteLoaded(tileClipKey);
  const wallLoadedNow = isSpriteLoaded(wallClipKey) || isSpriteLoaded(`wall_${biome}`);
  const trimLoadedNow = isSpriteLoaded(trimClipKey);
  const decorMaskNow =
    biome === 'desert'
      ? (isSpriteLoaded('decor_pebble') ? 1 : 0) | (isSpriteLoaded('decor_scrub') ? 2 : 0)
      : biome === 'crypt'
        ? (isSpriteLoaded('decor_bone') ? 1 : 0) | (isSpriteLoaded('decor_skull') ? 2 : 0)
        : (isSpriteLoaded('decor_vent') ? 1 : 0) | (isSpriteLoaded('decor_cable') ? 2 : 0);

  const existing = terrainChunks.get(key);
  if (
    existing &&
    (!tileLoadedNow || existing.hasTileSprite) &&
    (!wallLoadedNow || existing.hasWallSprite) &&
    (!trimLoadedNow || existing.hasTrimSprite) &&
    (existing.decorMask & decorMaskNow) === decorMaskNow
  ) {
    // LRU refresh
    terrainChunks.delete(key);
    terrainChunks.set(key, existing);
    return existing.canvas;
  }

  const size = RENDER_CFG.CHUNK_SIZE;
  const canvas = existing?.canvas ?? makeOffscreenCanvas(size, size);
  if (!canvas) return null;
  const cctx = canvas.getContext('2d');
  if (!cctx) return null;
  cctx.imageSmoothingEnabled = false;

  const pal = BANSUNG_BIOME_PALETTES[biome] ?? BANSUNG_BIOME_PALETTES.desert;
  const worldX0 = cx * size;
  const worldY0 = cy * size;
  const tileSize = BANSUNG_TILE_SIZE;

  const floorMeta = getClipMeta(tileClipKey);
  const floorImg = floorMeta ? getSpriteImage(floorMeta.url) : null;
  const hasFloor = Boolean(floorMeta && floorImg && floorImg.complete && floorImg.naturalWidth > 0);

  const wallMeta = getClipMeta(wallClipKey) ?? getClipMeta(`wall_${biome}`);
  const wallImg = wallMeta ? getSpriteImage(wallMeta.url) : null;
  const hasWall = Boolean(wallMeta && wallImg && wallImg.complete && wallImg.naturalWidth > 0);

  const trimMeta = getClipMeta(trimClipKey);
  const trimImg = trimMeta ? getSpriteImage(trimMeta.url) : null;
  const hasTrim = Boolean(trimMeta && trimImg && trimImg.complete && trimImg.naturalWidth > 0);

  // Fill chunk outer void
  cctx.fillStyle = BIOME_ABYSS[biome] ?? BIOME_ABYSS.desert;
  cctx.fillRect(0, 0, size, size);

  const minPlayX = BANSUNG_PLAYABLE_BOUNDS.x0;
  const minPlayY = BANSUNG_PLAYABLE_BOUNDS.y0;
  const maxPlayX =
    mapW === BANSUNG_MAP_W ? BANSUNG_PLAYABLE_BOUNDS.x1 : Math.max(minPlayX + tileSize, mapW - tileSize);
  const maxPlayY =
    mapH === BANSUNG_MAP_H ? BANSUNG_PLAYABLE_BOUNDS.y1 : Math.max(minPlayY + tileSize, mapH - tileSize);

  const col0 = Math.max(0, Math.floor(worldX0 / tileSize));
  const col1 = Math.min(Math.ceil(mapW / tileSize) - 1, Math.floor((worldX0 + size - 1) / tileSize));
  const row0 = Math.max(0, Math.floor(worldY0 / tileSize));
  const row1 = Math.min(Math.ceil(mapH / tileSize) - 1, Math.floor((worldY0 + size - 1) / tileSize));

  for (let row = row0; row <= row1; row++) {
    const wy = row * tileSize;
    const ly = wy - worldY0;
    for (let col = col0; col <= col1; col++) {
      const wx = col * tileSize;
      const lx = wx - worldX0;

      const isBorderWall =
        wx < minPlayX || wx >= maxPlayX || wy < minPlayY || wy >= maxPlayY;

      if (isBorderWall) {
        if (hasWall && wallImg && wallMeta) {
          cctx.drawImage(wallImg, 0, 0, wallMeta.cellW, wallMeta.cellH, lx, ly, tileSize, tileSize);
        } else {
          const isNorthFacade = wy === tileSize && wx >= minPlayX && wx < maxPlayX;
          cctx.fillStyle = isNorthFacade ? pal.wallFace : pal.wallTop;
          cctx.fillRect(lx, ly, tileSize, tileSize);
          cctx.fillStyle = pal.floorAccent;
          cctx.fillRect(lx, ly + tileSize - 2, tileSize, 2);
          cctx.fillRect(lx + ((row & 1) === 0 ? 24 : 12), ly, 2, tileSize);
          if (isNorthFacade) {
            cctx.fillStyle = pal.wallTrim;
            cctx.fillRect(lx, ly, tileSize, 4);
            cctx.fillStyle = OUTLINE_INK;
            cctx.fillRect(lx, ly + tileSize - 2, tileSize, 2);
          }
        }
        continue;
      }

      if (hasFloor && floorImg && floorMeta) {
        cctx.drawImage(
          floorImg,
          0,
          0,
          floorMeta.cellW,
          floorMeta.cellH,
          lx,
          ly,
          tileSize,
          tileSize,
        );
      } else {
        const checker = ((col + row) & 1) === 0;
        cctx.fillStyle = checker ? pal.floorA : pal.floorB;
        cctx.fillRect(lx, ly, tileSize, tileSize);
        cctx.fillStyle = pal.floorAccent;
        cctx.fillRect(lx, ly + tileSize - 1, tileSize, 1);
        cctx.fillRect(lx + tileSize - 1, ly, 1, tileSize);
      }

      // Subtle trim strip right along north wall base & inner perimeter
      if (wy === minPlayY || wx === minPlayX || wx === maxPlayX - tileSize || wy === maxPlayY - tileSize) {
        if (hasTrim && trimImg && trimMeta) {
          cctx.globalAlpha = 0.55;
          cctx.drawImage(trimImg, 0, 0, trimMeta.cellW, trimMeta.cellH, lx, ly, tileSize, tileSize);
          cctx.globalAlpha = 1;
        } else {
          cctx.fillStyle = pal.wallTrim;
          cctx.globalAlpha = 0.25;
          if (wy === minPlayY) cctx.fillRect(lx, ly, tileSize, 4);
          if (wy === maxPlayY - tileSize) cctx.fillRect(lx, ly + tileSize - 4, tileSize, 4);
          if (wx === minPlayX) cctx.fillRect(lx, ly, 4, tileSize);
          if (wx === maxPlayX - tileSize) cctx.fillRect(lx + tileSize - 4, ly, 4, tileSize);
          cctx.globalAlpha = 1;
        }
      }

      drawTerrainDecorTile(cctx, biome, lx, ly, col, row, seed);
    }
  }

  // Center Boss Arena Pad emblem
  const padCx = (mapW === BANSUNG_MAP_W ? BANSUNG_ARENA_CX : mapW * 0.5) - worldX0;
  const padCy = (mapH === BANSUNG_MAP_H ? BANSUNG_ARENA_CY : mapH * 0.52) - worldY0;
  if (padCx > -120 && padCx < size + 120 && padCy > -120 && padCy < size + 120) {
    cctx.save();
    cctx.strokeStyle = pal.wallTrim;
    cctx.lineWidth = 3;
    cctx.globalAlpha = 0.48;
    cctx.beginPath();
    cctx.arc(Math.round(padCx), Math.round(padCy), 88, 0, TWO_PI);
    cctx.stroke();

    cctx.strokeStyle = pal.ambientTint;
    cctx.lineWidth = 2;
    cctx.globalAlpha = 0.26;
    cctx.beginPath();
    cctx.arc(Math.round(padCx), Math.round(padCy), 56, 0, TWO_PI);
    cctx.stroke();
    cctx.restore();
  }

  // Enemy Spawn Gates thresholds (12 perimeter gates on 6336x4032 map)
  const scaleX = mapW / BANSUNG_MAP_W;
  const scaleY = mapH / BANSUNG_MAP_H;
  for (let i = 0; i < BANSUNG_ENEMY_GATES.length; i++) {
    const g = BANSUNG_ENEMY_GATES[i];
    const gx = Math.round(g.x * scaleX) - worldX0;
    const gy = Math.round(g.y * scaleY) - worldY0;
    if (gx < -64 || gx > size + 64 || gy < -64 || gy > size + 64) continue;

    cctx.fillStyle = OUTLINE_INK;
    cctx.fillRect(gx - 22, gy - 14, 44, 28);
    cctx.fillStyle = pal.floorAccent;
    cctx.fillRect(gx - 20, gy - 12, 40, 24);
    cctx.fillStyle = pal.wallTrim;
    cctx.globalAlpha = 0.58;
    cctx.fillRect(gx - 18, gy - 2, 36, 4);
    cctx.fillRect(gx - 2, gy - 10, 4, 20);
    cctx.globalAlpha = 1;
  }

  // Weapon Shrine Pedestal Floor Pads (5 canonical anchors)
  for (let i = 0; i < PEDESTAL_ANCHORS.length; i++) {
    const a = PEDESTAL_ANCHORS[i];
    const px = Math.round(a.x * scaleX) - worldX0;
    const py = Math.round(a.y * scaleY) - worldY0;
    if (px < -64 || px > size + 64 || py < -64 || py > size + 64) continue;

    cctx.save();
    cctx.fillStyle = OUTLINE_INK;
    cctx.globalAlpha = 0.65;
    cctx.beginPath();
    cctx.arc(px, py, 36, 0, TWO_PI);
    cctx.fill();

    cctx.fillStyle = pal.floorAccent;
    cctx.globalAlpha = 0.85;
    cctx.beginPath();
    cctx.arc(px, py, 32, 0, TWO_PI);
    cctx.fill();

    cctx.strokeStyle = pal.wallTrim;
    cctx.lineWidth = 2;
    cctx.globalAlpha = 0.72;
    cctx.beginPath();
    cctx.arc(px, py, 24, 0, TWO_PI);
    cctx.stroke();

    cctx.fillStyle = pal.wallTrim;
    cctx.globalAlpha = 0.68;
    cctx.fillRect(px - 2, py - 30, 4, 8);
    cctx.fillRect(px - 2, py + 22, 4, 8);
    cctx.fillRect(px - 30, py - 2, 8, 4);
    cctx.fillRect(px + 22, py - 2, 8, 4);

    cctx.fillStyle = OUTLINE_INK;
    cctx.globalAlpha = 0.55;
    cctx.beginPath();
    cctx.arc(px, py, 10, 0, TWO_PI);
    cctx.fill();
    cctx.restore();
  }

  // Crisp inner arena perimeter 3px bevel
  cctx.strokeStyle = OUTLINE_INK;
  cctx.lineWidth = 3;
  cctx.strokeRect(
    minPlayX - worldX0 + 1.5,
    minPlayY - worldY0 + 1.5,
    maxPlayX - minPlayX - 3,
    maxPlayY - minPlayY - 3,
  );

  if (existing) {
    // Re-insert so re-baked chunk stays at MRU tail
    terrainChunks.delete(key);
  } else {
    while (terrainChunks.size >= RENDER_CFG.MAX_TERRAIN_CHUNKS) {
      const oldestKey = terrainChunks.keys().next().value;
      if (!oldestKey) break;
      const old = terrainChunks.get(oldestKey);
      if (old) {
        old.canvas.width = 0;
        old.canvas.height = 0;
      }
      terrainChunks.delete(oldestKey);
    }
  }
  terrainChunks.set(key, {
    canvas,
    biome,
    hasTileSprite: tileLoadedNow,
    hasWallSprite: wallLoadedNow,
    hasTrimSprite: trimLoadedNow,
    decorMask: decorMaskNow,
  });
  return canvas;
}

// ============================================================================
// 5. Props, Cover Blocks, Desert Cacti, Rocks, Crates, Barrels & Pickups
// ============================================================================

function getObstacleLabelKind(obs: StaticObstacleBox, biome: BansungBiome): BansungPropKind {
  const ext = obs as StaticObstacleBox & {
    propKindIdx?: number;
    kindIdx?: number;
    propKind?: BansungPropKind;
  };
  const idx = ext.propKindIdx ?? ext.kindIdx;
  if (typeof idx === 'number' && idx >= 0 && idx < BANSUNG_PROP_IDS.length) {
    return BANSUNG_PROP_IDS[idx];
  }
  if (ext.propKind) return ext.propKind;
  if (biome === 'desert') return obs.w <= 56 && obs.h <= 56 ? 'rock' : 'pillar';
  return 'pillar';
}

function drawStaticObstacle25D(
  ctx: CanvasRenderingContext2D,
  obs: StaticObstacleBox,
  biome: BansungBiome,
  nowSec: number,
): void {
  const pal = BANSUNG_BIOME_PALETTES[biome] ?? BANSUNG_BIOME_PALETTES.desert;
  const kind = getObstacleLabelKind(obs, biome);
  const rx = Math.round(obs.x);
  const ry = Math.round(obs.y);
  const rw = Math.max(16, Math.round(obs.w));
  const rh = Math.max(16, Math.round(obs.h));
  const cx = rx + (rw >> 1);
  const by = ry + rh;

  // Compact 1x1 props try exact sprite first so tall desert cacti/pillars/rocks shine
  if (rw <= 56 && rh <= 56) {
    const candidates =
      kind === 'cactus'
        ? ['cactus', 'prop_cactus']
        : kind === 'rock'
          ? ['rock', 'prop_rock']
          : biome === 'crypt'
            ? kind === 'pillar'
              ? ['pillar', 'prop_pillar', 'tomb', 'prop_tomb']
              : ['tomb', 'prop_tomb', 'pillar', 'prop_pillar']
            : biome === 'cyber'
              ? kind === 'pillar'
                ? ['pillar', 'prop_pillar', 'server', 'prop_server']
                : ['server', 'prop_server', 'pillar', 'prop_pillar']
              : ['pillar', 'prop_pillar'];
    if (drawFirstAvailableClip(ctx, candidates, cx, by, nowSec, { category: 'prop' })) {
      if (biome === 'cyber' && kind !== 'rock') {
        queueGlow('cyan', cx, ry + 14, 24, 0.25);
      }
      return;
    }
  }

  // Crisp 2.5D extruded pixel block (top face shifted upward + front vertical facade)
  const facadeH = Math.min(20, Math.max(12, Math.round(rh * 0.34)));
  const topY = ry - facadeH;

  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(rx - 1, topY - 1, rw + 2, rh + facadeH + 2);

  // Top surface
  ctx.fillStyle = pal.wallTop;
  ctx.fillRect(rx, topY, rw, rh);

  // Inner bevel highlight
  ctx.fillStyle = pal.wallTrim;
  ctx.fillRect(rx + 2, topY + 2, rw - 4, 3);
  ctx.fillRect(rx + 2, topY + 2, 2, rh - 4);

  // Front vertical face
  ctx.fillStyle = pal.wallFace;
  ctx.fillRect(rx, by - facadeH, rw, facadeH);
  ctx.fillStyle = pal.floorAccent;
  ctx.fillRect(rx, by - facadeH, rw, 2);

  if (biome === 'desert') {
    // Sandstone block courses
    ctx.fillStyle = pal.floorAccent;
    for (let sx = rx + 16; sx < rx + rw - 8; sx += 24) {
      ctx.fillRect(sx, by - facadeH + 2, 2, facadeH - 2);
    }
  } else if (biome === 'crypt') {
    // Runic carved sigil slit
    ctx.fillStyle = pal.wallTrim;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cx - 4, by - facadeH + 6, 8, 3);
    ctx.globalAlpha = 1;
    queueGlow('violet', cx, by - facadeH + 8, 20, 0.2);
  } else {
    // Cyber server rack LEDs
    const blink = ((Math.floor(nowSec * 3) + (rx ^ ry)) & 3) === 0;
    ctx.fillStyle = blink ? '#22d3ee' : '#38bdf8';
    ctx.fillRect(rx + 6, by - facadeH + 5, 4, 3);
    ctx.fillStyle = blink ? '#f59e0b' : '#475569';
    ctx.fillRect(rx + 14, by - facadeH + 5, 4, 3);
    queueGlow('cyan', rx + 8, by - facadeH + 6, 18, 0.28);
  }
  drawCallsLastFrame += 4;
}

function drawSnapProp(
  ctx: CanvasRenderingContext2D,
  prop: SnapProp,
  biome: BansungBiome,
  nowSec: number,
  nowMs: number,
): void {
  const kind: BansungPropKind = BANSUNG_PROP_IDS[prop.kindIdx] ?? 'crate';
  const rx = Math.round(prop.x);
  const ry = Math.round(prop.y);
  const dmgFrame = prop.hpPct <= 35 ? 2 : prop.hpPct <= 70 ? 1 : 0;

  let drawn = false;
  switch (kind) {
    case 'crate': {
      const clips =
        biome === 'crypt'
          ? ['crypt_crate', 'crate', 'wood_crate']
          : biome === 'cyber'
            ? ['cyber_crate', 'crate', 'wood_crate']
            : ['crate', 'wood_crate', 'prop_crate'];
      drawn = drawFirstAvailableClip(ctx, clips, rx, ry, nowSec, {
        frameIdx: dmgFrame,
        category: 'prop',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 17, ry - 33, 34, 34);
        ctx.fillStyle = biome === 'cyber' ? '#475569' : biome === 'crypt' ? '#495057' : '#a66d3b';
        ctx.fillRect(rx - 15, ry - 31, 30, 30);
        ctx.fillStyle = biome === 'cyber' ? '#22d3ee' : '#d49a5a';
        ctx.fillRect(rx - 13, ry - 29, 26, 4);
        ctx.fillStyle = '#5c3c1e';
        ctx.fillRect(rx - 14, ry - 20, 28, 2);
      }
      break;
    }

    case 'pot': {
      const clips =
        biome === 'crypt'
          ? ['crypt_urn', 'urn', 'desert_pot']
          : biome === 'cyber'
            ? ['cyber_canister', 'desert_pot']
            : ['desert_pot', 'prop_clay_pot'];
      drawn = drawFirstAvailableClip(ctx, clips, rx, ry, nowSec, {
        frameIdx: dmgFrame,
        category: 'prop',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 10, ry - 24, 20, 24);
        ctx.fillStyle = biome === 'cyber' ? '#0ea5e9' : biome === 'crypt' ? '#6c757d' : '#c97a4b';
        ctx.fillRect(rx - 8, ry - 21, 16, 18);
        ctx.fillStyle = biome === 'cyber' ? '#bae6fd' : '#e9b088';
        ctx.fillRect(rx - 6, ry - 24, 12, 4);
      }
      break;
    }

    case 'barrel': {
      const isEmp = (prop.id & 3) === 3 || biome === 'cyber';
      const clips = isEmp ? ['barrel_emp', 'prop_barrel_emp', 'barrel_red'] : ['barrel_red', 'prop_barrel_red'];
      const igniteFlash = prop.hpPct < 55 && ((Math.floor(nowMs / 110) & 1) === 1);
      drawn = drawFirstAvailableClip(ctx, clips, rx, ry, nowSec, {
        frameIdx: prop.hpPct < 55 ? 1 : 0,
        category: 'prop',
        tint: igniteFlash ? 'white' : 'none',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 13, ry - 32, 26, 32);
        ctx.fillStyle = igniteFlash ? '#ffffff' : isEmp ? '#1c7ed6' : '#c92a2a';
        ctx.fillRect(rx - 11, ry - 30, 22, 28);
        ctx.fillStyle = isEmp ? '#a5f3fc' : '#ffd43b';
        ctx.fillRect(rx - 11, ry - 19, 22, 6);
      }
      queueGlow(isEmp ? 'cyan' : 'fire', rx, ry - 18, prop.hpPct < 55 ? 36 : 22, prop.hpPct < 55 ? 0.55 : 0.25);
      break;
    }

    case 'cactus': {
      drawn = drawFirstAvailableClip(ctx, ['cactus', 'prop_cactus', 'prop_cactus_tall'], rx, ry, nowSec, {
        frameIdx: prop.hpPct < 60 ? 1 : 0,
        category: 'prop',
      });
      if (!drawn) {
        // Saguaro pixel cactus with arms + spines
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 9, ry - 48, 18, 48);
        ctx.fillRect(rx - 19, ry - 34, 10, 18);
        ctx.fillRect(rx + 9, ry - 30, 10, 16);
        ctx.fillStyle = '#3b7a3d';
        ctx.fillRect(rx - 7, ry - 46, 14, 44);
        ctx.fillRect(rx - 17, ry - 32, 8, 14);
        ctx.fillRect(rx + 9, ry - 28, 8, 12);
        ctx.fillStyle = '#69db7c';
        ctx.fillRect(rx - 3, ry - 44, 3, 40);
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(rx - 8, ry - 40, 2, 2);
        ctx.fillRect(rx + 6, ry - 26, 2, 2);
      }
      break;
    }

    case 'rock': {
      drawn = drawFirstAvailableClip(ctx, ['rock', 'prop_rock'], rx, ry, nowSec, {
        category: 'prop',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 18, ry - 26, 36, 26);
        ctx.fillStyle = '#7f6d57';
        ctx.fillRect(rx - 16, ry - 24, 32, 22);
        ctx.fillStyle = '#a69177';
        ctx.fillRect(rx - 14, ry - 22, 20, 9);
      }
      break;
    }

    case 'pillar': {
      const clips =
        biome === 'crypt'
          ? ['tomb', 'pillar', 'prop_pillar']
          : biome === 'cyber'
            ? ['server', 'pillar', 'prop_server']
            : ['pillar', 'prop_pillar'];
      drawn = drawFirstAvailableClip(ctx, clips, rx, ry, nowSec, { category: 'prop' });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 16, ry - 46, 32, 46);
        ctx.fillStyle = '#8b9bb4';
        ctx.fillRect(rx - 14, ry - 44, 28, 42);
      }
      break;
    }

    case 'turret': {
      drawn = drawFirstAvailableClip(ctx, ['auto_turret', 'gadget_auto_turret'], rx, ry, nowSec, {
        category: 'weapon',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 14, ry - 24, 28, 24);
        ctx.fillStyle = '#495057';
        ctx.fillRect(rx - 12, ry - 12, 24, 10);
        ctx.fillStyle = '#3bc9db';
        ctx.fillRect(rx - 8, ry - 22, 16, 12);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(rx + 6, ry - 18, 12, 4);
      }
      queueGlow('cyan', rx, ry - 18, 22, 0.35);
      break;
    }

    case 'drone': {
      const hoverY = ry - 18 + Math.round(Math.sin(nowSec * 4.5 + prop.id) * 3);
      drawn = drawFirstAvailableClip(ctx, ['heal_drone', 'gadget_heal_drone'], rx, hoverY, nowSec, {
        category: 'weapon',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 12, hoverY - 12, 24, 22);
        ctx.fillStyle = '#20c997';
        ctx.fillRect(rx - 10, hoverY - 10, 20, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx - 2, hoverY - 6, 4, 10);
        ctx.fillRect(rx - 5, hoverY - 3, 10, 4);
      }
      queueGlow('emerald', rx, hoverY - 2, 28, 0.45);
      break;
    }

    case 'mine': {
      const blink = (Math.floor(nowMs / 240) & 1) === 0;
      drawn = drawFirstAvailableClip(ctx, ['p_prox_mine'], rx, ry - 2, nowSec, {
        category: 'projectile',
      });
      if (!drawn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 8, ry - 6, 16, 8);
        ctx.fillStyle = '#343a40';
        ctx.fillRect(rx - 6, ry - 5, 12, 6);
      }
      ctx.fillStyle = blink ? '#ff4d4f' : '#7f1d1d';
      ctx.fillRect(rx - 2, ry - 6, 4, 3);
      if (blink) queueGlow('crimson', rx, ry - 5, 18, 0.42);
      break;
    }
  }

  // Tiny crisp HP bar only while damaged
  if (prop.hpPct > 0 && prop.hpPct < 100 && kind !== 'mine') {
    const bw = 24;
    const bh = 3;
    const bx = rx - (bw >> 1);
    const by = ry - 40;
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = kind === 'turret' || kind === 'drone' ? '#51cf66' : '#ff922b';
    ctx.fillRect(bx, by, Math.max(1, Math.round((bw * prop.hpPct) / 100)), bh);
  }
}

function drawSnapPickup(
  ctx: CanvasRenderingContext2D,
  pk: SnapPickup,
  localPlayer: InterpPlayer | null,
  nowSec: number,
  nowMs: number,
): void {
  const kind = resolvePickupKind(pk.kindIdx);
  const rx = Math.round(pk.x);
  const ry = Math.round(pk.y);

  if (kind === 'weapon_pedestal' || kind === 'weapon') {
    const drawnPed = drawFirstAvailableClip(ctx, ['pedestal', 'prop_pedestal'], rx, ry, nowSec, {
      category: 'prop',
    });
    if (!drawnPed) {
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(rx - 15, ry - 20, 30, 20);
      ctx.fillStyle = '#495057';
      ctx.fillRect(rx - 13, ry - 18, 26, 16);
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(rx - 11, ry - 19, 22, 4);
    }

    // Floating weapon sprite atop pedestal
    const weapon = getWeaponByIdx(pk.subId & 0xff);
    const bobY = ry - 26 + Math.round(Math.sin(nowSec * 3.8 + pk.id) * 3);
    if (weapon) {
      const resolvedKey = resolveWeaponClipKey(weapon.id);
      const clipCandidates = [
        resolvedKey,
        weapon.spriteKey,
        `wpn_${weapon.id}`,
        `gun_${weapon.id}`,
        weapon.id,
      ];
      const drawnWpn = drawFirstAvailableClip(ctx, clipCandidates, rx, bobY, nowSec, {
        category: 'weapon',
      });
      if (!drawnWpn) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 12, bobY - 5, 24, 10);
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(rx - 10, bobY - 3, 20, 6);
      }
    }
    queueGlow('fire', rx, bobY, 34, 0.45);

    // [E] Interact prompt badge when local player is in swap range
    if (
      localPlayer &&
      localPlayer.state !== BANSUNG_STATE_DEAD &&
      Math.hypot(localPlayer.x - pk.x, localPlayer.y - pk.y) <= BANSUNG_PICKUP_CONSTS.R_INTERACT
    ) {
      const label = weapon ? `[E] ${weapon.name}` : '[E] SWAP';
      ctx.save();
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = Math.max(36, Math.round(ctx.measureText(label).width) + 10);
      const px = rx - (w >> 1);
      const py = bobY - 22;
      ctx.fillStyle = 'rgba(17, 24, 39, 0.9)';
      ctx.fillRect(px, py, w, 15);
      ctx.strokeStyle = '#ffd43b';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w - 1, 14);
      ctx.fillStyle = '#ffd43b';
      ctx.fillText(label, rx, py + 8);
      ctx.restore();
    }
    return;
  }

  // Expiring blink check (bit 12 of subId)
  const expiring = (pk.subId & (1 << 12)) !== 0;
  if (expiring && (Math.floor(nowMs / 120) & 1) === 1) {
    return;
  }

  const bobY = ry - 8 + Math.round(Math.sin(nowSec * 5 + pk.id * 0.7) * 2.5);

  if (kind === 'xp_orb_s' || kind === 'xp_orb_m' || kind === 'xp_orb_l' || kind === 'xp') {
    drawXpCrystalDiamond(ctx, rx, bobY, kind, nowSec, pk.id);
    return;
  }

  const clipKey = `pk_${kind}`;
  const glowColor: GlowColor =
    kind === 'hp_orb' || kind === 'hp_pack' || kind === 'hp'
      ? 'emerald'
      : kind === 'energy_orb' || kind === 'energy_cell' || kind === 'energy'
        ? 'cyan'
        : kind === 'armor_plate' || kind === 'armor'
          ? 'white'
          : 'fire';

  const drawn = drawFirstAvailableClip(ctx, [clipKey], rx, bobY, nowSec, {
    category: 'prop',
  });
  if (!drawn) {
    const color =
      kind === 'hp_orb' || kind === 'hp_pack' || kind === 'hp'
        ? '#ff4d4f'
        : kind === 'energy_orb' || kind === 'energy_cell' || kind === 'energy'
          ? '#22d3ee'
          : kind === 'armor_plate' || kind === 'armor'
            ? '#adb5bd'
            : kind === 'gem_coin'
              ? '#b197fc'
              : '#ffd43b';
    const sz = kind === 'hp_pack' || kind === 'energy_cell' ? 12 : 9;
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - (sz >> 1) - 1, bobY - (sz >> 1) - 1, sz + 2, sz + 2);
    ctx.fillStyle = color;
    ctx.fillRect(rx - (sz >> 1), bobY - (sz >> 1), sz, sz);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx - (sz >> 1) + 1, bobY - (sz >> 1) + 1, 2, 2);
  }
  queueGlow(glowColor, rx, bobY, 18, 0.35);
}

function drawXpCrystalDiamond(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  kind: 'xp_orb_s' | 'xp_orb_m' | 'xp_orb_l' | 'xp',
  nowSec: number,
  id: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6.5 + id * 1.1);
  if (kind === 'xp_orb_l') {
    // Mythic gold-violet star crystal (#e879f9 + #fbbf24)
    const r = 9;
    ctx.fillStyle = OUTLINE_INK;
    ctx.beginPath();
    ctx.moveTo(rx, ry - r - 1);
    ctx.lineTo(rx + r + 1, ry);
    ctx.lineTo(rx, ry + r + 1);
    ctx.lineTo(rx - r - 1, ry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e879f9';
    ctx.beginPath();
    ctx.moveTo(rx, ry - r);
    ctx.lineTo(rx + r, ry);
    ctx.lineTo(rx, ry + r);
    ctx.lineTo(rx - r, ry);
    ctx.closePath();
    ctx.fill();

    // Cross star crystal wings
    ctx.fillStyle = '#c084fc';
    ctx.fillRect(rx - 1, ry - r - 2, 2, r * 2 + 4);
    ctx.fillRect(rx - r - 2, ry - 1, r * 2 + 4, 2);

    // Radiant golden core
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 5);
    ctx.lineTo(rx + 5, ry);
    ctx.lineTo(rx, ry + 5);
    ctx.lineTo(rx - 5, ry);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx - 2, ry - 3, 2, 2);
    if (pulse > 0.45) {
      ctx.fillRect(rx - 1, ry - r - 4, 2, 2);
      ctx.fillRect(rx + r + 1, ry - 2, 2, 2);
    }
    queueGlow('violet', rx, ry, 30, 0.54 + 0.12 * pulse);
    queueGlow('fire', rx, ry, 18, 0.42 + 0.1 * pulse);
    return;
  }

  const isMed = kind === 'xp_orb_m';
  const r = isMed ? 7 : 5;
  const fillCol = isMed ? '#22d3ee' : '#10b981';
  const hiCol = isMed ? '#a5f3fc' : '#6ee7b7';

  ctx.fillStyle = OUTLINE_INK;
  ctx.beginPath();
  ctx.moveTo(rx, ry - r - 1);
  ctx.lineTo(rx + r + 1, ry);
  ctx.lineTo(rx, ry + r + 1);
  ctx.lineTo(rx - r - 1, ry);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = fillCol;
  ctx.beginPath();
  ctx.moveTo(rx, ry - r);
  ctx.lineTo(rx + r, ry);
  ctx.lineTo(rx, ry + r);
  ctx.lineTo(rx - r, ry);
  ctx.closePath();
  ctx.fill();

  // Inner top-left facet & pixel gleam
  ctx.fillStyle = hiCol;
  ctx.beginPath();
  ctx.moveTo(rx, ry - r + 1);
  ctx.lineTo(rx, ry);
  ctx.lineTo(rx - r + 1, ry);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rx - 1, ry - Math.max(1, r >> 1), 2, 2);
  if (isMed && pulse > 0.5) {
    ctx.fillRect(rx + r - 1, ry - 1, 2, 2);
    ctx.fillRect(rx - 1, ry - r - 3, 2, 2);
  }
  queueGlow(isMed ? 'cyan' : 'emerald', rx, ry, isMed ? 22 : 16, (isMed ? 0.44 : 0.34) + 0.08 * pulse);
}

// ============================================================================
// 6. Mob & 3-Boss Renderers (with Hit-Flash, Stun, Telegraphs & WeakPoints)
// ============================================================================

function drawProceduralMobFallback(
  ctx: CanvasRenderingContext2D,
  enemyId: BansungEnemyId,
  x: number,
  y: number,
  flipX: boolean,
  hitFlash: boolean,
  isElite: boolean,
  isTelegraph: boolean,
  nowSec: number,
  isEvolved = false,
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const spec = BANSUNG_ENEMIES[enemyId];
  const r = spec?.radius ?? 14;
  const dir = flipX ? -1 : 1;
  const scaleMult = isEvolved ? (isElite ? 1.24 : 1.18) : isElite ? 1.1 : 1;

  let bodyColor = '#6a994e';
  let accent = '#ffd43b';
  const enemyKey: string = enemyId;
  if (enemyKey === 'scarab') {
    bodyColor = '#d97706';
    accent = '#fef08a';
  } else if (enemyKey === 'skirmisher') {
    bodyColor = '#cbd5e1';
    accent = '#94a3b8';
  } else if (enemyKey === 'bomb_goblin') {
    bodyColor = '#6a994e';
    accent = '#e03131';
  } else if (enemyKey === 'cactus_brute') {
    bodyColor = '#2f6b3c';
    accent = '#d8d4c8';
  } else if (enemyKey === 'cactus_spitter') {
    bodyColor = '#4d9b4d';
    accent = '#f43f5e';
  } else if (enemyKey === 'laser_sniper') {
    bodyColor = '#475569';
    accent = '#ff2e63';
  } else if (enemyKey === 'pyro_shaman') {
    bodyColor = '#991b1b';
    accent = '#fb923c';
  } else if (enemyKey === 'thunder_mage') {
    bodyColor = '#1d4ed8';
    accent = '#38bdf8';
  } else if (enemyKey === 'iron_drone' || enemyKey === 'shock_drone_mk2') {
    bodyColor = enemyKey === 'shock_drone_mk2' ? '#0284c7' : '#64748b';
    accent = enemyKey === 'shock_drone_mk2' ? '#67e8f9' : '#38bdf8';
  } else if (enemyKey === 'frost_mage') {
    bodyColor = '#0369a1';
    accent = '#a5f3fc';
  } else if (enemyKey === 'venom_stalker') {
    bodyColor = '#15803d';
    accent = '#a3e635';
  } else if (enemyKey === 'shield_warden') {
    bodyColor = '#b45309';
    accent = '#fde047';
  } else if (enemyKey === 'mortar_beetle') {
    bodyColor = '#991b1b';
    accent = '#fb923c';
  } else if (enemyKey === 'void_acolyte') {
    bodyColor = '#581c87';
    accent = '#e879f9';
  } else if (enemyKey === 'saw_berserker') {
    bodyColor = '#c2410c';
    accent = '#f8fafc';
  } else if (enemyKey === 'healing_priest') {
    bodyColor = '#047857';
    accent = '#6ee7b7';
  } else if (enemyKey === 'chrono_mage') {
    bodyColor = '#4c1d95';
    accent = '#38bdf8';
  } else if (enemyKey === 'plasma_golem') {
    bodyColor = '#1e293b';
    accent = '#22d3ee';
  } else if (enemyKey === 'sniper_mech') {
    bodyColor = '#334155';
    accent = '#f43f5e';
  } else if (enemyKey === 'plague_bearer') {
    bodyColor = '#3f6212';
    accent = '#a3e635';
  } else if (enemyKey === 'crimson_lancer') {
    bodyColor = '#991b1b';
    accent = '#fda4af';
  } else if (enemyKey === 'void_reaper') {
    bodyColor = '#3b0764';
    accent = '#e879f9';
  } else if (enemyKey === 'mirror_knight') {
    bodyColor = '#475569';
    accent = '#e2e8f0';
  } else if (enemyKey === 'magnet_drone') {
    bodyColor = '#1e3a8a';
    accent = '#38bdf8';
  } else if (enemyKey === 'blight_bomber') {
    bodyColor = '#365314';
    accent = '#bef264';
  } else if (enemyKey === 'volt_stalker') {
    bodyColor = '#0f766e';
    accent = '#facc15';
  } else if (enemyKey === 'solar_priest') {
    bodyColor = '#9a3412';
    accent = '#fde047';
  } else if (enemyKey === 'magma_brute') {
    bodyColor = '#450a0a';
    accent = '#fb923c';
  }

  const w = Math.max(18, Math.round(r * 1.9 * scaleMult));
  const h = Math.round((enemyKey === 'scarab' || enemyKey === 'mortar_beetle' ? 16 : enemyKey === 'cactus_brute' || enemyKey === 'shield_warden' || enemyKey === 'plasma_golem' || enemyKey === 'magma_brute' ? 40 : 28) * scaleMult);
  const liftY = enemyKey === 'iron_drone' || enemyKey === 'shock_drone_mk2' || enemyKey === 'magnet_drone' ? Math.round(14 + Math.sin(nowSec * 6) * 3) : 0;

  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(rx - (w >> 1) - 1, ry - h - liftY - 1, w + 2, h + 2);
  ctx.fillStyle = hitFlash ? '#ffffff' : bodyColor;
  ctx.fillRect(rx - (w >> 1), ry - h - liftY, w, h);

  if (!hitFlash) {
    // Eyes & signature trait
    ctx.fillStyle = isEvolved ? '#f43f5e' : accent;
    ctx.fillRect(rx + dir * 3 - 2, ry - h - liftY + 6, 4, 3);
    if (enemyId === 'bomb_goblin') {
      // Giant overhead iron bomb
      const pulse = isTelegraph && ((Math.floor(nowSec * 14) & 1) === 0);
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(rx - 8, ry - h - 13, 16, 13);
      ctx.fillStyle = pulse ? '#ff4d4f' : '#2b2d42';
      ctx.fillRect(rx - 6, ry - h - 11, 12, 10);
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(rx - 1, ry - h - 15, 3, 4);
    } else if (enemyId === 'cactus_brute') {
      // Bone armor shoulder plates
      ctx.fillStyle = isEvolved ? '#c084fc' : '#d8d4c8';
      ctx.fillRect(rx - (w >> 1) - 2, ry - h + 4, 7, 10);
      ctx.fillRect(rx + (w >> 1) - 5, ry - h + 4, 7, 10);
    }
  }

  if (isElite) {
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx - (w >> 1) - 2.5, ry - h - liftY - 2.5, w + 5, h + 5);
  }
}

function drawEvolvedGroundAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  unitRadius: number,
  nowSec: number,
  unitId: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowSec * 5.6 + unitId * 0.7);
  const rx = Math.round(x);
  const ry = Math.round(y);
  const radX = Math.max(18, Math.round(unitRadius * 1.48 + pulse * 3));
  const radY = Math.max(8, Math.round(radX * 0.45));

  ctx.save();
  ctx.fillStyle = `rgba(192, 132, 252, ${(0.12 + 0.1 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(rx, ry + 1, radX, radY, 0, 0, TWO_PI);
  ctx.fill();

  ctx.strokeStyle = `rgba(244, 63, 94, ${(0.62 + 0.28 * pulse).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(rx, ry + 1, radX, radY, 0, 0, TWO_PI);
  ctx.stroke();

  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.ellipse(rx, ry + 1, Math.max(10, radX - 5), Math.max(5, radY - 2), 0, 0, TWO_PI);
  ctx.stroke();

  ctx.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const a = nowSec * 2.4 + (i * Math.PI) * 0.5 + unitId * 0.3;
    const px = Math.round(rx + Math.cos(a) * radX);
    const py = Math.round(ry + 1 + Math.sin(a) * radY);
    ctx.fillStyle = (i & 1) === 0 ? '#f43f5e' : '#e879f9';
    ctx.fillRect(px - 1, py - 1, 3, 3);
  }
  ctx.restore();
}

function drawEvolvedCrownCrest(
  ctx: CanvasRenderingContext2D,
  drawX: number,
  topY: number,
  nowSec: number,
  unitId: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(nowSec * 7 + unitId);
  const cx = Math.round(drawX);
  const cy = Math.round(topY - 2 - Math.round(pulse * 1.5));

  // Crisp pixel-inked 3-spike crimson-violet crown crest
  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(cx - 8, cy - 2, 16, 6);
  ctx.fillRect(cx - 7, cy - 5, 4, 4);
  ctx.fillRect(cx - 2, cy - 7, 4, 6);
  ctx.fillRect(cx + 3, cy - 5, 4, 4);

  ctx.fillStyle = '#a855f7';
  ctx.fillRect(cx - 7, cy - 1, 14, 4);
  ctx.fillStyle = '#f43f5e';
  ctx.fillRect(cx - 6, cy - 4, 2, 4);
  ctx.fillRect(cx - 1, cy - 6, 2, 6);
  ctx.fillRect(cx + 4, cy - 4, 2, 4);

  ctx.fillStyle = pulse > 0.5 ? '#fde047' : '#fdf4ff';
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

function drawMobEntity(
  ctx: CanvasRenderingContext2D,
  e: InterpEnemy,
  nowSec: number,
  nowMs: number,
): void {
  const isLeft = (e.flags & BANSUNG_EFLAG_LEFT) !== 0 || e.facingLeft;
  const isElite = (e.flags & BANSUNG_EFLAG_ELITE) !== 0;
  const isEvolved = (e.flags & BANSUNG_EFLAG_EVOLVED) !== 0;
  const isArmored = (e.flags & BANSUNG_EFLAG_ARMORED) !== 0;
  const isStunned = (e.flags & BANSUNG_EFLAG_STUNNED) !== 0 || e.state === BANSUNG_STATE_STUN;
  const isBurning = (e.flags & BANSUNG_EFLAG_BURNING) !== 0;
  const hitFlash = (e.flags & BANSUNG_EFLAG_HIT_FLASH) !== 0;
  const isTelegraph = (e.flags & BANSUNG_EFLAG_TELEGRAPH) !== 0;
  const isShielded = (e.flags & BANSUNG_EFLAG_SHIELDED) !== 0;

  let jx = 0;
  let jy = 0;
  let cyanAlpha = 0;
  let entryWhite = hitFlash;
  if (isStunned) {
    const pose = resolveStunPose(e.id, 0, hitFlash ? nowMs - 30 : nowMs - 180, false, nowMs);
    jx = pose.jx;
    jy = pose.jy;
    cyanAlpha = pose.cyanAlpha;
    entryWhite = entryWhite || pose.whiteAlpha > 0.2;
  }

  const enemyKey: string = e.enemyId;
  let action = 'idle';
  if (e.state === BANSUNG_STATE_DEAD) action = 'dead';
  else if (e.enemyId === 'bomb_goblin' && (isTelegraph || e.state === BANSUNG_STATE_ATK)) action = 'fuse_run';
  else if (e.enemyId === 'cactus_brute' && isTelegraph) action = 'slam';
  else if (e.enemyId === 'skirmisher' && isTelegraph) action = 'lunge';
  else if (e.state === BANSUNG_STATE_ATK || e.state === BANSUNG_STATE_DASH) action = 'attack';
  else if (e.state === BANSUNG_STATE_RUN) action = 'run';

  const liftY =
    enemyKey === 'iron_drone' && e.state !== BANSUNG_STATE_DEAD
      ? Math.round(14 + Math.sin(nowSec * 5.2 + e.id) * 3)
      : 0;
  const drawX = Math.round(e.x + jx);
  const drawY = Math.round(e.y - liftY + jy);
  const scale = isEvolved ? (isElite ? 1.24 : 1.18) : isElite ? 1.15 : 1;
  const unitR = BANSUNG_ENEMIES[e.enemyId]?.radius ?? 14;

  if (isEvolved && e.state !== BANSUNG_STATE_DEAD) {
    drawEvolvedGroundAura(ctx, e.x, e.y, unitR, nowSec, e.id);
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 5.6 + e.id * 0.7);
    queueGlow('violet', drawX, drawY - 14, 34, 0.34 + 0.14 * pulse);
    queueGlow('crimson', drawX, drawY - 8, 28, 0.28 + 0.1 * pulse);
  }

  const candidates = [
    `${e.enemyId}_${action}`,
    `mob_${e.enemyId}_${action}`,
    `${e.enemyId}_idle`,
    `mob_${e.enemyId}_idle`,
  ];

  const drawn = drawFirstAvailableClip(ctx, candidates, drawX, drawY, nowSec, {
    flipX: isLeft,
    scale,
    alpha: e.spawnAlpha,
    category: 'enemy',
    tint: entryWhite ? 'white' : cyanAlpha > 0.16 ? 'cyan' : 'none',
  });
  if (!drawn) {
    ctx.save();
    ctx.globalAlpha *= e.spawnAlpha;
    drawProceduralMobFallback(
      ctx,
      e.enemyId,
      drawX,
      drawY + liftY,
      isLeft,
      entryWhite,
      isElite,
      isTelegraph,
      nowSec,
      isEvolved,
    );
    ctx.restore();
  }

  if (isEvolved && e.state !== BANSUNG_STATE_DEAD) {
    // Armored gleam sweeping diagonal sheen + reinforced metallic shoulder glint
    const bodyH = Math.round((enemyKey === 'scarab' ? 16 : enemyKey === 'cactus_brute' ? 44 : 30) * scale);
    const gleamPhase = ((nowSec * 0.85 + e.id * 0.19) % 1.4) / 1.4;
    if (gleamPhase < 0.45) {
      const t = gleamPhase / 0.45;
      const gx = Math.round(drawX - 10 + t * 20);
      const gy = Math.round(drawY - bodyH * 0.85 + t * (bodyH * 0.65));
      ctx.save();
      ctx.globalAlpha = 0.85 * Math.sin(t * Math.PI);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(gx - 2, gy - 1, 5, 2);
      ctx.fillRect(gx, gy - 2, 2, 4);
      ctx.restore();
    }
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(drawX - Math.round(unitR * 0.9), drawY - Math.round(bodyH * 0.58), 5, 5);
    ctx.fillRect(drawX + Math.round(unitR * 0.9) - 5, drawY - Math.round(bodyH * 0.58), 5, 5);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(drawX - Math.round(unitR * 0.9) + 1, drawY - Math.round(bodyH * 0.58) + 1, 3, 3);
    ctx.fillRect(drawX + Math.round(unitR * 0.9) - 4, drawY - Math.round(bodyH * 0.58) + 1, 3, 3);

    // Spiked evolved crown crest hovering above sprite head
    drawEvolvedCrownCrest(ctx, drawX, drawY - bodyH, nowSec, e.id);
  }

  if (isElite) {
    queueGlow('violet', drawX, drawY - 18, 28, 0.32);
  }
  if (isBurning) {
    queueGlow('fire', drawX, drawY - 14, 22, 0.35);
  }
  if (isArmored && e.state !== BANSUNG_STATE_DEAD) {
    // Crisp tiny steel armor pip above head (shifted beside evolved crown if both active)
    const bodyH = Math.round((enemyKey === 'scarab' ? 16 : enemyKey === 'cactus_brute' ? 44 : 30) * scale);
    const pipX = isEvolved ? drawX + 11 : drawX - 4;
    const pipY = isEvolved ? drawY - bodyH - 7 : drawY - 38;
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(pipX, pipY, 8, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(pipX + 1, pipY + 1, 6, 4);
  }
  if (isShielded) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(drawX, drawY - 16, 22, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
    queueGlow('cyan', drawX, drawY - 16, 26, 0.25);
  }
  if (e.enemyId === 'bomb_goblin' && (isTelegraph || e.state === BANSUNG_STATE_ATK)) {
    queueGlow('fire', drawX, drawY - 32, 24, 0.52);
  }
  if (e.enemyId === 'skirmisher' && isTelegraph) {
    // Lunge glint star
    const glintX = drawX + (isLeft ? -14 : 14);
    const glintY = drawY - 18;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(glintX - 4, glintY - 1, 8, 2);
    ctx.fillRect(glintX - 1, glintY - 4, 2, 8);
    queueGlow('cyan', glintX, glintY, 16, 0.55);
  }
}

function resolveBossClips(boss: ExtendedBossView): string[] {
  if (boss.kind === 'boss_arsenal') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_ATK || (boss.telegraph ?? 0) > 0
          ? 'attack'
          : boss.state === BANSUNG_STATE_RUN
            ? 'run'
            : 'idle';
    return [
      `boss_arsenal_${act}`,
      'boss_arsenal_idle',
      'boss_arsenal',
    ];
  }

  if (boss.kind === 'boss_beholder') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stagger'
          : boss.state === BANSUNG_STATE_DASH
            ? 'slam_leap'
            : boss.state === BANSUNG_STATE_ATK
              ? boss.telegraph > 0
                ? 'beam_windup'
                : 'volley_cast'
              : boss.state === BANSUNG_STATE_RUN
                ? 'move'
                : 'idle';
    return [
      `boss_beholder_${act}`,
      `boss_sand_beholder_${act}`,
      'boss_beholder_idle',
      'boss_beholder',
    ];
  }

  if (boss.kind === 'boss_colossus') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'overheat_stun'
          : boss.state === BANSUNG_STATE_DASH
            ? 'charge'
            : boss.state === BANSUNG_STATE_ATK
              ? 'attack'
              : boss.state === BANSUNG_STATE_RUN
                ? 'run'
                : 'idle';
    return [
      `boss_dread_colossus_${act}`,
      `boss_colossus_${act}`,
      'boss_colossus_idle',
      'boss_colossus',
      `miragine_a13_${act === 'charge' ? 'run' : act === 'overheat_stun' ? 'dead' : act}`,
    ];
  }

  if (boss.kind === 'boss_tempest') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stun'
          : boss.state === BANSUNG_STATE_ATK
            ? 'attack'
            : 'idle';
    return [`boss_tempest_${act}`, 'boss_tempest_idle', 'boss_tempest'];
  }

  if (boss.kind === 'boss_destroyer') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stun'
          : boss.state === BANSUNG_STATE_ATK
            ? 'attack'
            : 'idle';
    return [`boss_destroyer_${act}`, 'boss_destroyer_idle', 'boss_destroyer'];
  }

  if (boss.kind === 'boss_frost_empress') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stun'
          : boss.state === BANSUNG_STATE_ATK
            ? 'attack'
            : 'idle';
    return [`boss_frost_empress_${act}`, 'boss_frost_empress_idle', 'boss_frost_empress'];
  }

  if (boss.kind === 'boss_storm_herald') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stun'
          : boss.state === BANSUNG_STATE_ATK
            ? 'attack'
            : 'idle';
    return [`boss_storm_herald_${act}`, 'boss_storm_herald_idle', 'boss_storm_herald'];
  }

  if (boss.kind === 'boss_abyssal_leviathan') {
    const act =
      boss.state === BANSUNG_STATE_DEAD
        ? 'dead'
        : boss.state === BANSUNG_STATE_STUN
          ? 'stun'
          : boss.state === BANSUNG_STATE_ATK
            ? 'attack'
            : 'idle';
    return [`boss_abyssal_leviathan_${act}`, 'boss_abyssal_leviathan_idle', 'boss_abyssal_leviathan'];
  }

  // boss_overlord
  const act =
    boss.state === BANSUNG_STATE_DEAD
      ? 'dead'
      : boss.state === BANSUNG_STATE_STUN
        ? 'stun'
        : boss.state === BANSUNG_STATE_ATK
          ? 'laser'
          : boss.state === BANSUNG_STATE_DASH
            ? 'charge'
            : 'idle';
  return [
    `boss_overlord_core_${act}`,
    `overlord_hull_${act === 'laser' ? 'charge' : act}`,
    `boss_overlord_${act === 'laser' ? 'charge' : act}`,
    'boss_overlord_core_idle',
    'boss_overlord_idle',
    'boss_overlord',
  ];
}

function drawProceduralBossFallback(
  ctx: CanvasRenderingContext2D,
  boss: ExtendedBossView,
  x: number,
  y: number,
  nowSec: number,
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const hit = boss.hitFlash;

  if (boss.kind === 'boss_arsenal') {
    // Heavy Dread Gunner: crimson/steel exosuit + twin gatling cannons + shoulder mortar pod
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 28, ry - 66, 56, 66);
    ctx.fillStyle = hit ? '#ffffff' : '#2b2d42';
    ctx.fillRect(rx - 26, ry - 64, 52, 62);
    if (!hit) {
      // Shoulder missile/grenade rack
      ctx.fillStyle = '#e03131';
      ctx.fillRect(rx - 30, ry - 62, 18, 16);
      ctx.fillRect(rx + 12, ry - 62, 18, 16);
      // Helmet + laser visor
      ctx.fillStyle = '#495057';
      ctx.fillRect(rx - 14, ry - 70, 28, 18);
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(rx - 10, ry - 62, 20, 5);
      // Twin gatling cannons aimed toward boss.aim
      const dir = boss.facingLeft ? -1 : 1;
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(rx + dir * 18, ry - 44, dir * 24, 7);
      ctx.fillRect(rx + dir * 18, ry - 32, dir * 24, 7);
      ctx.fillStyle = '#ff922b';
      ctx.fillRect(rx + dir * 40, ry - 43, dir * 4, 5);
      ctx.fillRect(rx + dir * 40, ry - 31, dir * 4, 5);
    }
    return;
  }

  if (boss.kind === 'boss_beholder') {
    // Ribbed cactus octo-body + 3-prong gold crown + tracking cyclops eye
    drawPixelEllipse(ctx, rx, ry - 36, 36, 36, OUTLINE_INK, 1);
    drawPixelEllipse(ctx, rx, ry - 36, 34, 34, hit ? '#ffffff' : '#2f6b3c', 1);
    if (!hit) {
      drawPixelEllipse(ctx, rx - 4, ry - 40, 22, 24, '#4d9b4d', 0.9);
      // 3-prong crown
      ctx.fillStyle = '#ffd43b';
      ctx.fillRect(rx - 14, ry - 78, 5, 10);
      ctx.fillRect(rx - 3, ry - 83, 6, 15);
      ctx.fillRect(rx + 9, ry - 78, 5, 10);
      ctx.fillRect(rx - 16, ry - 68, 32, 4);
      // Cyclops eye
      const ex = rx + Math.round(Math.cos(boss.aim) * 10);
      const ey = ry - 38 + Math.round(Math.sin(boss.aim) * 6);
      drawPixelEllipse(ctx, ex, ey, 11, 9, OUTLINE_INK, 1);
      drawPixelEllipse(ctx, ex, ey, 9, 7, '#fff3bf', 1);
      drawPixelEllipse(ctx, ex + Math.round(Math.cos(boss.aim) * 3), ey + Math.round(Math.sin(boss.aim) * 2), 4, 5, '#ff2e63', 1);
    }
    return;
  }

  if (boss.kind === 'boss_colossus') {
    // Armored Dread Juggernaut + glowing furnace chest + broadaxe
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 32, ry - 76, 64, 76);
    ctx.fillStyle = hit ? '#ffffff' : '#343a40';
    ctx.fillRect(rx - 30, ry - 74, 60, 72);
    if (!hit) {
      // Pauldrons + horns
      ctx.fillStyle = '#6c757d';
      ctx.fillRect(rx - 38, ry - 66, 16, 22);
      ctx.fillRect(rx + 22, ry - 66, 16, 22);
      ctx.fillStyle = '#e03131';
      ctx.fillRect(rx - 12, ry - 70, 24, 10);
      // Overheat/furnace core
      ctx.fillStyle = boss.state === BANSUNG_STATE_STUN ? '#ff922b' : '#f59f00';
      ctx.fillRect(rx - 10, ry - 44, 20, 14);
      // Cleaver blade
      const swing = boss.facingLeft ? -1 : 1;
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(rx + swing * 26, ry - 58, swing * 18, 28);
    }
    return;
  }

  if (boss.kind === 'boss_tempest') {
    // Chúa Tể Bão Tố: storm core, twin lightning generators, crackling cyclone crown
    drawPixelEllipse(ctx, rx, ry - 40, 34, 34, OUTLINE_INK, 1);
    drawPixelEllipse(ctx, rx, ry - 40, 31, 31, hit ? '#ffffff' : '#1e1b4b', 1);
    if (!hit) {
      drawPixelEllipse(ctx, rx, ry - 42, 20, 20, '#0284c7', 0.9);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(rx - 38, ry - 54, 14, 24);
      ctx.fillRect(rx + 24, ry - 54, 14, 24);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(rx - 10, ry - 76, 20, 7);
      drawPixelEllipse(ctx, rx, ry - 42, 9, 9, '#a5f3fc', 1);
    }
    return;
  }

  if (boss.kind === 'boss_destroyer') {
    // Trùm Hủy Diệt: colossal dreadnought titan, war horns, crimson furnace core & siege barrels
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 44, ry - 86, 88, 84);
    ctx.fillStyle = hit ? '#ffffff' : '#18181b';
    ctx.fillRect(rx - 41, ry - 83, 82, 78);
    if (!hit) {
      // Dreadnought horns + shoulder pauldrons
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(rx - 50, ry - 76, 18, 28);
      ctx.fillRect(rx + 32, ry - 76, 18, 28);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(rx - 22, ry - 94, 7, 13);
      ctx.fillRect(rx + 15, ry - 94, 7, 13);
      // Crimson furnace visor + reactor chest
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(rx - 16, ry - 74, 32, 7);
      drawPixelEllipse(ctx, rx, ry - 46, 15, 15, '#dc2626', 0.95);
      drawPixelEllipse(ctx, rx, ry - 46, 8, 8, '#fde047', 1);
      // Aimed doom cannons
      const swing = boss.facingLeft ? -1 : 1;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(rx + swing * 24, ry - 56, swing * 26, 9);
      ctx.fillRect(rx + swing * 24, ry - 38, swing * 26, 9);
    }
    return;
  }

  if (boss.kind === 'boss_frost_empress') {
    // Nữ Hoàng Băng Tuyết: crystal ice wings, permafrost gown, glacier crown & scepter
    drawPixelEllipse(ctx, rx, ry - 46, 36, 40, OUTLINE_INK, 1);
    drawPixelEllipse(ctx, rx, ry - 46, 33, 37, hit ? '#ffffff' : '#0c4a6e', 1);
    if (!hit) {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(rx - 44, ry - 68, 14, 36);
      ctx.fillRect(rx + 30, ry - 68, 14, 36);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(rx - 12, ry - 86, 24, 9);
      drawPixelEllipse(ctx, rx, ry - 48, 14, 14, '#0ea5e9', 0.95);
      drawPixelEllipse(ctx, rx, ry - 48, 7, 7, '#f0f9ff', 1);
    }
    return;
  }

  if (boss.kind === 'boss_storm_herald') {
    // Lôi Thần Bão Sét: twin-coil storm sovereign wielding Yellow & Blue lightning storms
    const bob = Math.round(Math.sin(nowSec * 5.2) * 3);
    drawPixelEllipse(ctx, rx, ry - 48 + bob, 38, 42, OUTLINE_INK, 1);
    drawPixelEllipse(ctx, rx, ry - 48 + bob, 35, 39, hit ? '#ffffff' : '#0f172a', 1);
    if (!hit) {
      // Left Yellow Tesla Pylon + Right Blue Tempest Pylon
      drawPixelEllipse(ctx, rx - 44, ry - 52 + bob, 11, 20, '#a16207', 1);
      drawPixelEllipse(ctx, rx - 44, ry - 52 + bob, 7, 15, '#facc15', 1);
      drawPixelEllipse(ctx, rx + 44, ry - 52 - bob, 11, 20, '#0369a1', 1);
      drawPixelEllipse(ctx, rx + 44, ry - 52 - bob, 7, 15, '#38bdf8', 1);
      // Twin storm crown prongs
      ctx.fillStyle = '#facc15';
      ctx.fillRect(rx - 18, ry - 94 + bob, 8, 14);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(rx + 10, ry - 94 + bob, 8, 14);
      ctx.fillStyle = '#fef9c3';
      ctx.fillRect(rx - 16, ry - 72 + bob, 14, 6);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(rx + 2, ry - 72 + bob, 14, 6);
      // Dual yellow/blue core reactor
      drawPixelEllipse(ctx, rx - 6, ry - 48 + bob, 10, 12, '#facc15', 0.95);
      drawPixelEllipse(ctx, rx + 6, ry - 48 + bob, 10, 12, '#38bdf8', 0.95);
      drawPixelEllipse(ctx, rx, ry - 48 + bob, 6, 6, '#ffffff', 1);
    }
    return;
  }

  if (boss.kind === 'boss_abyssal_leviathan') {
    // Thủy Quái Vực Thẳm Omega: abyssal kraken dread-hull, bioluminescent tendrils & void maw
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 48, ry - 90, 96, 88);
    ctx.fillStyle = hit ? '#ffffff' : '#0f172a';
    ctx.fillRect(rx - 44, ry - 86, 88, 80);
    if (!hit) {
      ctx.fillStyle = '#0e7490';
      ctx.fillRect(rx - 54, ry - 70, 16, 44);
      ctx.fillRect(rx + 38, ry - 70, 16, 44);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(rx - 20, ry - 94, 9, 14);
      ctx.fillRect(rx + 11, ry - 94, 9, 14);
      drawPixelEllipse(ctx, rx, ry - 48, 18, 16, '#14b8a6', 0.95);
      drawPixelEllipse(ctx, rx, ry - 48, 9, 9, '#f0abfc', 1);
    }
    return;
  }

  // boss_overlord hover gunship hull + twin rotors + central laser lens
  const rotSpin = Math.round(Math.sin(nowSec * 24) * 14);
  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(rx - 40, ry - 64, 80, 48);
  ctx.fillStyle = hit ? '#ffffff' : '#1e293b';
  ctx.fillRect(rx - 38, ry - 62, 76, 44);
  if (!hit) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(rx - 44, ry - 52, 16, 24);
    ctx.fillRect(rx + 28, ry - 52, 16, 24);
    // Twin rotor blurs
    ctx.fillStyle = '#74c0fc';
    ctx.fillRect(rx - 48, ry - 58, Math.max(8, Math.abs(rotSpin) + 12), 4);
    ctx.fillRect(rx + 36 - Math.abs(rotSpin), ry - 58, Math.max(8, Math.abs(rotSpin) + 12), 4);
    // Core optic lens
    drawPixelEllipse(ctx, rx, ry - 40, 12, 12, '#ff2e63', 0.9);
    drawPixelEllipse(ctx, rx, ry - 40, 6, 6, '#fff5f5', 1);
  }
}

function drawBossEntity(
  ctx: CanvasRenderingContext2D,
  boss: ExtendedBossView,
  activeDrones: readonly InterpEnemy[],
  nowSec: number,
  nowMs: number,
): void {
  let jx = 0;
  let jy = 0;
  let cyanAlpha = 0;
  if (boss.stunned || boss.state === BANSUNG_STATE_STUN) {
    const pose = resolveStunPose(boss.id, 0, nowMs - 180, true, nowMs);
    jx = pose.jx;
    jy = pose.jy;
    cyanAlpha = pose.cyanAlpha;
  }

  const zLift = Math.round(boss.z);
  const drawX = Math.round(boss.x + jx);
  const drawY = Math.round(boss.y - zLift + jy);

  // Colossus Iron Aegis Hex Shield when escorts alive or shielded flag set
  if (
    boss.kind === 'boss_colossus' &&
    (activeDrones.length > 0 || boss.shielded) &&
    boss.state !== BANSUNG_STATE_DEAD
  ) {
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 201, 219, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * TWO_PI + nowSec * 0.9;
      const hx = drawX + Math.cos(a) * 52;
      const hy = drawY - 40 + Math.sin(a) * 44;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();
    ctx.restore();
    queueGlow('cyan', drawX, drawY - 40, 64, 0.25);
  }

  const scaleMult = clamp(boss.scale ?? 1, 0.48, 2.2);
  const baseBossScale =
    boss.kind === 'boss_arsenal'
      ? 1.68
      : boss.kind === 'boss_abyssal_leviathan'
        ? 2.04
        : boss.kind === 'boss_destroyer'
          ? 1.96
          : boss.kind === 'boss_frost_empress'
            ? 1.84
            : boss.kind === 'boss_storm_herald'
              ? 1.92
              : boss.kind === 'boss_tempest' ||
                  boss.kind === 'boss_overlord' ||
                  boss.kind === 'boss_colossus' ||
                  boss.kind === 'boss_beholder'
                ? 1.78
                : 1.65;
  const bossScale = baseBossScale * scaleMult;
  const clips = resolveBossClips(boss);
  const drawn = drawFirstAvailableClip(ctx, clips, drawX, drawY, nowSec, {
    flipX: boss.facingLeft,
    category: 'boss',
    scale: bossScale,
    tint: boss.hitFlash ? 'white' : cyanAlpha > 0.16 ? 'cyan' : 'none',
  });
  if (!drawn) {
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(bossScale, bossScale);
    drawProceduralBossFallback(ctx, boss, 0, 0, nowSec);
    ctx.restore();
  }

  // Giant Splitter ring + overhead per-boss bar when multiple bosses/mini-bosses/splitters are alive
  if (boss.state !== BANSUNG_STATE_DEAD) {
    const splitTier = boss.splitTier ?? 0;
    const headY = drawY - Math.round(78 * scaleMult);
    if (splitTier > 0) {
      ctx.save();
      ctx.strokeStyle = splitTier >= 2 ? 'rgba(244, 63, 94, 0.85)' : 'rgba(251, 146, 60, 0.82)';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.lineDashOffset = -nowSec * 36;
      ctx.beginPath();
      ctx.ellipse(drawX, drawY + 2, 46 * scaleMult, 18 * scaleMult, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (activeBossCount > 1 || splitTier > 0) {
      const barW = Math.round(clamp(74 * scaleMult, 44, 128));
      const bx = Math.round(drawX - barW / 2);
      const by = headY - 12;
      const bossTotalBars = Math.max(
        1,
        boss.hpBars ?? getBossHpBars(boss.kind, scaleMult < 0.85),
      );
      const barState = bossTotalBars >= 2
        ? resolveBossBarState(boss.hp, boss.maxHp, bossTotalBars)
        : null;
      const ratio = barState
        ? clamp(barState.curBarHp / Math.max(1, barState.hpPerBar), 0, 1)
        : boss.maxHp > 0
          ? clamp(boss.hp / boss.maxHp, 0, 1)
          : 0;
      ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, 7);
      if (barState?.underBarColor) {
        ctx.fillStyle = barState.underBarColor;
        ctx.globalAlpha = 0.42;
        ctx.fillRect(bx, by, barW, 5);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = barState
        ? barState.barColor
        : splitTier >= 2
          ? '#f43f5e'
          : splitTier === 1
            ? '#fb923c'
            : '#ef4444';
      ctx.fillRect(bx, by, Math.round(barW * ratio), 5);
      if (barState && bossTotalBars >= 2) {
        ctx.font = '900 8px "Chakra Petch", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = barState.barColor;
        ctx.fillText(`x${barState.remainingBars}`, bx + barW + 3, by + 5);
      }
      if (splitTier > 0) {
        ctx.font = '900 9px "Chakra Petch", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText(splitTier >= 2 ? 'KHỔNG LỒ · 1→4→16' : 'PHÂN THÂN ×4', drawX, by - 3);
        ctx.textAlign = 'left';
      }
    }
  }

  // Signature Boss Additive Glow Stamps (queued for Pass 5)
  if (boss.state !== BANSUNG_STATE_DEAD) {
    if (boss.kind === 'boss_tempest') {
      queueGlow('cyan', drawX, drawY - 42, 56, 0.56);
      queueGlow('violet', drawX, drawY - 42, 42, 0.36);
    } else if (boss.kind === 'boss_frost_empress') {
      queueGlow('cyan', drawX, drawY - 46, 62, 0.62);
      queueGlow('violet', drawX, drawY - 46, 44, 0.34);
    } else if (boss.kind === 'boss_storm_herald') {
      queueGlow('fire', drawX - 24, drawY - 46, 54, 0.56);
      queueGlow('cyan', drawX + 24, drawY - 46, 54, 0.56);
    } else if (boss.kind === 'boss_destroyer') {
      queueGlow('crimson', drawX, drawY - 46, 68, 0.65);
      queueGlow('fire', drawX, drawY - 46, 44, 0.44);
    } else if (boss.kind === 'boss_abyssal_leviathan') {
      queueGlow('violet', drawX, drawY - 48, 72, 0.66);
      queueGlow('cyan', drawX, drawY - 48, 52, 0.48);
    } else if (boss.kind === 'boss_arsenal') {
      const muzzleX = drawX + Math.cos(boss.aim) * 44;
      const muzzleY = drawY - 46 + Math.sin(boss.aim) * 20;
      queueGlow(
        boss.telegraph > 0 ? 'crimson' : 'fire',
        muzzleX,
        muzzleY,
        boss.telegraph > 0 ? 52 : 34,
        boss.telegraph > 0 ? 0.72 : 0.42,
      );
      queueGlow('crimson', drawX, drawY - 48, 36, 0.3);
    } else if (boss.kind === 'boss_beholder') {
      const eyeX = drawX + Math.cos(boss.aim) * 10;
      const eyeY = drawY - 40 + Math.sin(boss.aim) * 5;
      queueGlow(
        boss.phase >= 2 || boss.telegraph > 0 ? 'crimson' : 'fire',
        eyeX,
        eyeY,
        boss.telegraph > 0 ? 44 : 28,
        boss.telegraph > 0 ? 0.65 : 0.35,
      );
    } else if (boss.kind === 'boss_colossus') {
      queueGlow(
        boss.state === BANSUNG_STATE_STUN ? 'fire' : 'crimson',
        drawX,
        drawY - 38,
        boss.state === BANSUNG_STATE_STUN ? 48 : 30,
        boss.state === BANSUNG_STATE_STUN ? 0.6 : 0.32,
      );
    } else {
      // boss_overlord hovering thruster + central WeakPoint optic glow
      queueGlow('crimson', drawX, drawY - 40, 44, 0.52);
      queueGlow('cyan', drawX - 28, drawY - 12, 24, 0.32);
      queueGlow('cyan', drawX + 28, drawY - 12, 24, 0.32);
    }

    // Destructible Boss Body Parts overlay (targetable armor nodes + mini HP bar)
    if (boss.parts && boss.parts.length > 0) {
      for (let pi = 0; pi < boss.parts.length; pi++) {
        const part = boss.parts[pi];
        const px = Math.round(part.x);
        const py = Math.round(part.y - zLift - 26);
        if (part.broken) {
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px - 6, py - 6);
          ctx.lineTo(px + 6, py + 6);
          ctx.moveTo(px + 6, py - 6);
          ctx.lineTo(px - 6, py + 6);
          ctx.stroke();
          ctx.restore();
          continue;
        }
        const pct = part.maxHp > 0 ? clamp(part.hp / part.maxHp, 0, 1) : 1;
        const pulse = 0.5 + 0.5 * Math.sin(nowSec * 7.5 + pi * 1.3);
        ctx.save();
        ctx.strokeStyle = `rgba(251, 191, 36, ${(0.55 + 0.35 * pulse).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(9, Math.round(part.radius * 0.52)), 0, TWO_PI);
        ctx.stroke();
        ctx.restore();
        // Mini HP bar above destructible body part
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(px - 14, py - 16, 28, 5);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(px - 13, py - 15, 26, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px - 13, py - 15, Math.max(1, Math.round(26 * pct)), 3);
        queueGlow('fire', px, py, 20, 0.25 + 0.16 * pulse);
      }
    }
  }
}

function drawWeakPointNode(
  ctx: CanvasRenderingContext2D,
  wp: ExtendedWeakPoint,
  bossX: number,
  bossY: number,
  nowSec: number,
): void {
  const rx = Math.round(wp.x);
  const ry = Math.round(wp.y - wp.z);

  // Energy tether linking node to Overlord Core hull
  ctx.save();
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.round(bossX), Math.round(bossY - 38));
  ctx.lineTo(rx, ry);
  ctx.stroke();
  ctx.restore();

  const drawn = drawFirstAvailableClip(
    ctx,
    ['overlord_weakpoint', 'overlord_weakpoint_idle'],
    rx,
    ry,
    nowSec,
    { category: 'boss' },
  );
  if (!drawn) {
    drawPixelEllipse(ctx, rx, ry, 14, 14, OUTLINE_INK, 1);
    drawPixelEllipse(ctx, rx, ry, 11, 11, '#22d3ee', 0.92);
    drawPixelEllipse(ctx, rx, ry, 5, 5, '#ffffff', 1);
  }

  // Mini HP bar over weak-point pod
  if (wp.maxHp > 0 && wp.hp > 0) {
    const pct = clamp(wp.hp / wp.maxHp, 0, 1);
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 13, ry - 20, 26, 5);
    ctx.fillStyle = '#334155';
    ctx.fillRect(rx - 12, ry - 19, 24, 3);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(rx - 12, ry - 19, Math.max(1, Math.round(24 * pct)), 3);
  }

  const pulse = 0.55 + 0.35 * Math.sin(nowSec * 9 + wp.idx);
  queueGlow('cyan', rx, ry, 34, pulse);
  queueGlow('white', rx, ry, 16, pulse * 0.6);
}

function drawEmpPylonEntity(
  ctx: CanvasRenderingContext2D,
  pylon: ExtendedPylon,
  nowSec: number,
): void {
  const rx = Math.round(pylon.x);
  const ry = Math.round(pylon.y);
  const drawn = drawFirstAvailableClip(ctx, ['emp_pylon', 'emp_pylon_idle'], rx, ry, nowSec, {
    category: 'boss',
  });
  if (!drawn) {
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 10, ry - 42, 20, 42);
    ctx.fillStyle = '#334155';
    ctx.fillRect(rx - 8, ry - 40, 16, 38);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(rx - 4, ry - 36, 8, 22);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(rx - 5, ry - 40, 10, 5);
  }

  if (pylon.maxHp > 0 && pylon.hp > 0) {
    const pct = clamp(pylon.hp / pylon.maxHp, 0, 1);
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 15, ry - 50, 30, 5);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(rx - 14, ry - 49, 28, 3);
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(rx - 14, ry - 49, Math.max(1, Math.round(28 * pct)), 3);
  }
  const charge01 = clamp((pylon.chargeQ ?? 0) / 100, 0, 1);
  queueGlow('cyan', rx, ry - 32, 24 + charge01 * 24, 0.4 + charge01 * 0.45);
}

// ============================================================================
// 7. Telegraphs, Beams, Melee Slashes, Pings & Crosshair
// ============================================================================

interface BossLaserPalette {
  readonly rgb: string;
  readonly primary: string;
  readonly secondary: string;
  readonly scorch: string;
  readonly glow: GlowColor;
}

const BOSS_LASER_PALETTES: Record<BossLaserThemeKey, BossLaserPalette> = {
  crimson: {
    rgb: '255, 42, 109',
    primary: '#ff2a6d',
    secondary: '#fda4af',
    scorch: 'rgba(136, 19, 55, 0.34)',
    glow: 'crimson',
  },
  gold: {
    rgb: '250, 204, 21',
    primary: '#facc15',
    secondary: '#fef08a',
    scorch: 'rgba(113, 63, 18, 0.34)',
    glow: 'fire',
  },
  cyan: {
    rgb: '34, 211, 238',
    primary: '#22d3ee',
    secondary: '#bae6fd',
    scorch: 'rgba(12, 74, 110, 0.34)',
    glow: 'cyan',
  },
  violet: {
    rgb: '192, 132, 252',
    primary: '#c084fc',
    secondary: '#f5d0fe',
    scorch: 'rgba(88, 28, 135, 0.36)',
    glow: 'violet',
  },
  orange: {
    rgb: '251, 146, 60',
    primary: '#fb923c',
    secondary: '#fed7aa',
    scorch: 'rgba(124, 45, 18, 0.34)',
    glow: 'fire',
  },
  emerald: {
    rgb: '52, 211, 153',
    primary: '#34d399',
    secondary: '#bbf7d0',
    scorch: 'rgba(6, 78, 59, 0.34)',
    glow: 'emerald',
  },
};

function resolveBossLaserTheme(color: number | undefined, isDanger: boolean): BossLaserThemeKey {
  if (color === 5) return 'gold';
  if (color === 2) return 'cyan';
  if (color === 3 || color === 4) return 'violet';
  if (color === 1 && !isDanger) return 'orange';
  return 'crimson';
}

function getLaserLateralStrip(theme: BossLaserThemeKey): HTMLCanvasElement | null {
  const existing = laserLateralStripCache.get(theme);
  if (existing) return existing;
  const c = makeOffscreenCanvas(16, 64);
  if (!c) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  const pal = BOSS_LASER_PALETTES[theme];
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, `rgba(${pal.rgb}, 0)`);
  grad.addColorStop(0.24, `rgba(${pal.rgb}, 0.22)`);
  grad.addColorStop(0.42, `rgba(${pal.rgb}, 0.72)`);
  grad.addColorStop(0.5, `rgba(${pal.rgb}, 0.98)`);
  grad.addColorStop(0.58, `rgba(${pal.rgb}, 0.72)`);
  grad.addColorStop(0.76, `rgba(${pal.rgb}, 0.22)`);
  grad.addColorStop(1, `rgba(${pal.rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 64);
  laserLateralStripCache.set(theme, c);
  return c;
}

function queueActiveBossMasterSparkBeam(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfW: number,
  prog01: number,
  theme: BossLaserThemeKey,
  seed: number,
): void {
  if (activeBossBeamCount >= activeBossBeamsScratch.length) return;
  const slot = activeBossBeamsScratch[activeBossBeamCount++];
  slot.x0 = x0;
  slot.y0 = y0;
  slot.x1 = x1;
  slot.y1 = y1;
  slot.halfW = Math.max(6, halfW);
  slot.prog01 = clamp(prog01, 0, 1);
  slot.theme = theme;
  slot.seed = seed | 0;
}

function drawBossLaserWindupCorridor(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfW: number,
  prog01: number,
  isLockWindow: boolean,
  theme: BossLaserThemeKey,
  nowSec: number,
  seed: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const angle = Math.atan2(dy, dx);
  const pal = BOSS_LASER_PALETTES[theme];
  const lockFlash = isLockWindow || prog01 > 0.84;
  const railHalf = halfW * (lockFlash ? 1.0 : 1.22 - 0.22 * prog01);
  const strip = getLaserLateralStrip(theme);

  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(angle);

  // 1. Soft lateral warning falloff (never a boxy solid fillRect/strokeRect!)
  if (strip) {
    ctx.globalAlpha = lockFlash ? 0.44 : 0.16 + 0.22 * prog01;
    ctx.drawImage(strip, 0, -railHalf * 1.35, len, railHalf * 2.7);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = `rgba(${pal.rgb}, ${(0.12 + 0.16 * prog01).toFixed(3)})`;
    ctx.fillRect(0, -railHalf, len, railHalf * 2);
  }

  // 2. Two sleek inward-compressing parallel containment rails (open ends, no rectangle cap)
  ctx.strokeStyle = OUTLINE_INK;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.52;
  ctx.beginPath();
  ctx.moveTo(0, -railHalf);
  ctx.lineTo(len, -railHalf);
  ctx.moveTo(0, railHalf);
  ctx.lineTo(len, railHalf);
  ctx.stroke();

  ctx.globalAlpha = lockFlash ? 0.96 : 0.55 + 0.35 * prog01;
  ctx.strokeStyle = lockFlash ? '#ffffff' : pal.primary;
  ctx.lineWidth = lockFlash ? 2.2 : 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -railHalf);
  ctx.lineTo(len, -railHalf);
  ctx.moveTo(0, railHalf);
  ctx.lineTo(len, railHalf);
  ctx.stroke();

  // 3. Scrolling directional plasma chevrons along corridor axis
  const spacing = 62;
  const scroll = (nowSec * 190 + (seed & 15) * 4) % spacing;
  const chevH = Math.min(railHalf * 0.62, 11);
  ctx.strokeStyle = lockFlash ? '#ffffff' : pal.secondary;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = lockFlash ? 0.85 : 0.42 + 0.35 * prog01;
  ctx.beginPath();
  for (let x = scroll; x < len - 12; x += spacing) {
    ctx.moveTo(x - 7, -chevH);
    ctx.lineTo(x + 2, 0);
    ctx.lineTo(x - 7, chevH);
  }
  ctx.stroke();

  // 4. Razor-sharp 1.5px-2.5px central optical sightline
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = lockFlash ? '#ffffff' : pal.secondary;
  ctx.lineWidth = lockFlash ? 2.6 : 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();

  // 5. Spinning muzzle charge aperture at origin
  const muzzleR = Math.min(24, Math.max(9, halfW * (0.55 + 0.45 * prog01)));
  const spin = nowSec * (4.5 + 5.5 * prog01) + seed;
  ctx.strokeStyle = lockFlash ? '#ffffff' : pal.primary;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, muzzleR, spin, spin + 2.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, muzzleR, spin + Math.PI, spin + Math.PI + 2.1);
  ctx.stroke();

  ctx.restore();

  drawSpriteOrFallback(ctx, 'fx_laser_muzzle', Math.round(x0), Math.round(y0), nowSec, {
    category: 'vfx',
    rotationRad: angle,
    scale: clamp((halfW / 20) * (0.55 + 0.45 * prog01), 0.45, 1.35),
    alpha: 0.45 + 0.45 * prog01,
  });
  queueGlow(pal.glow, x0, y0, Math.min(46, halfW * 1.6), 0.25 + 0.32 * prog01);
}

function drawBossLaserScorchFloor(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  halfW: number,
  theme: BossLaserThemeKey,
): void {
  const pal = BOSS_LASER_PALETTES[theme];
  ctx.save();
  ctx.strokeStyle = pal.scorch;
  ctx.lineWidth = Math.max(10, halfW * 1.75);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawBossLaserLanesGround(
  ctx: CanvasRenderingContext2D,
  lanes: readonly BansungLaserLane[],
  nowSec: number,
): void {
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const halfW = Math.max(6, lane.halfW);
    if (lane.phase === 'active') {
      drawBossLaserScorchFloor(ctx, lane.x1, lane.y1, lane.x2, lane.y2, halfW, 'crimson');
      queueActiveBossMasterSparkBeam(
        lane.x1,
        lane.y1,
        lane.x2,
        lane.y2,
        halfW,
        0.5,
        'crimson',
        700 + i,
      );
      continue;
    }
    const isLock = lane.phase === 'lock';
    drawBossLaserWindupCorridor(
      ctx,
      lane.x1,
      lane.y1,
      lane.x2,
      lane.y2,
      halfW,
      isLock ? 0.96 : 0.58,
      isLock,
      'crimson',
      nowSec,
      700 + i,
    );
    drawCallsLastFrame += 2;
  }
}

interface OrbitalVisualSpec {
  clipKey: string;
  isLightning: boolean;
  orbitR: number;
  omega: number;
  phaseOffset: number;
  outerCol: string;
  midCol: string;
  coreCol: string;
  sparkCol: string;
  glowCol: GlowColor;
}

const LIGHTNING_ORB_VISUAL: OrbitalVisualSpec = {
  clipKey: 'fx_lightning_orb',
  isLightning: true,
  orbitR: 74,
  omega: 2.7,
  phaseOffset: 0,
  outerCol: '#facc15',
  midCol: '#38bdf8',
  coreCol: '#fef9c3',
  sparkCol: '#e0f2fe',
  glowCol: 'cyan',
};

const FIRE_ORB_VISUAL: OrbitalVisualSpec = {
  clipKey: 'fx_fire_orb',
  isLightning: false,
  orbitR: 92,
  omega: -2.2,
  phaseOffset: Math.PI / 6,
  outerCol: '#dc2626',
  midCol: '#fb923c',
  coreCol: '#fef08a',
  sparkCol: '#fde047',
  glowCol: 'fire',
};

function drawOrbitalRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  nowSec: number,
  spec: OrbitalVisualSpec,
): void {
  if (count <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = spec.midCol;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, spec.orbitR, 0, TWO_PI);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  let prevOx = 0;
  let prevOy = 0;
  const arcBucket = Math.floor(nowSec * 18);
  for (let k = 0; k < count; k++) {
    const ang = nowSec * spec.omega + spec.phaseOffset + (k / count) * TWO_PI;
    const ox = Math.round(cx + Math.cos(ang) * spec.orbitR);
    const oy = Math.round(cy + Math.sin(ang) * spec.orbitR);

    if (spec.isLightning) {
      // Crackling electric lightning forks around each orb + arc bridge between orbs
      const j0 = ((hash2i(k, arcBucket, 0x41c9) & 15) - 7);
      const j1 = ((hash2i(k + 3, arcBucket, 0x92b1) & 15) - 7);
      ctx.save();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ox - 9, oy + j0 * 0.6);
      ctx.lineTo(ox, oy + j1);
      ctx.lineTo(ox + 9, oy - j0 * 0.6);
      ctx.stroke();
      if (k > 0 && count <= 6) {
        const mx = Math.round((prevOx + ox) * 0.5 + j0);
        const my = Math.round((prevOy + oy) * 0.5 + j1);
        ctx.globalAlpha = 0.52;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(prevOx, prevOy);
        ctx.lineTo(mx, my);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Trailing molten ember tail behind each spinning CC0 fireball orb
      const trailAng = ang - Math.sign(spec.omega) * 0.24;
      const tx = Math.round(cx + Math.cos(trailAng) * spec.orbitR);
      const ty = Math.round(cy + Math.sin(trailAng) * spec.orbitR);
      drawPixelEllipse(ctx, tx, ty, 5, 5, '#ea580c', 0.58);
      drawPixelEllipse(ctx, tx, ty, 3, 3, '#fde047', 0.72);
    }

    // Animated Open-Source CC0 Fireball / Lightning Orb sprite strip
    drawSpriteOrFallback(ctx, spec.clipKey, ox, oy, nowSec + k * 0.17, {
      category: 'vfx',
      scale: 0.92,
    });

    prevOx = ox;
    prevOy = oy;
    queueGlow(spec.glowCol, ox, oy, 22, 0.44);
  }
  drawCallsLastFrame += count;
}

function drawHeroGachaOrbsAndMagnet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  orbs: SnapPlayerOrbs | undefined,
  hasActiveFlyingSwords: boolean,
  nowSec: number,
): void {
  if (!orbs) return;
  if (orbs.magnetStacks > 0) {
    const mr = Math.min(58, 30 + orbs.magnetStacks * 4);
    const spin = -nowSec * 2.4;
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, mr, spin, spin + 1.45);
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(cx, cy, mr, spin + Math.PI, spin + Math.PI + 1.45);
    ctx.stroke();
    ctx.restore();
  }
  // Hovering Radiant Light Swords (`fx_light_sword`) fanned behind hero's shoulders while charging
  if (orbs.spiritSwords > 0 && !hasActiveFlyingSwords) {
    const visCount = Math.min(6, orbs.spiritSwords);
    for (let k = 0; k < visCount; k++) {
      const frac = visCount === 1 ? 0 : k / (visCount - 1) - 0.5;
      const fanAng = -Math.PI * 0.5 + frac * 1.15;
      const bob = Math.sin(nowSec * 4.2 + k * 1.1) * 3;
      const hx = Math.round(cx + Math.cos(fanAng) * 26);
      const hy = Math.round(cy - 10 + Math.sin(fanAng) * 18 + bob);
      drawSpriteOrFallback(ctx, 'fx_light_sword', hx, hy, nowSec + k * 0.2, {
        category: 'vfx',
        rotationRad: fanAng,
        scale: 0.84,
        alpha: 0.92,
      });
      queueGlow('cyan', hx, hy, 16, 0.28);
    }
  }
  drawOrbitalRing(ctx, cx, cy, orbs.lightningOrbs, nowSec, LIGHTNING_ORB_VISUAL);
  drawOrbitalRing(ctx, cx, cy, orbs.fireOrbs, nowSec, FIRE_ORB_VISUAL);
}

function drawSpiritSwords(
  ctx: CanvasRenderingContext2D,
  swords: readonly SnapSpiritSword[],
  nowSec: number,
): void {
  if (swords.length === 0) return;
  for (let i = 0; i < swords.length; i++) {
    const sw = swords[i];
    const sx = Math.round(sw.x);
    const sy = Math.round(sw.y);
    const active = sw.stateFlag > 0;
    const isPull = sw.stateFlag === 2;

    if (active) {
      // Radiant golden-cyan light wake ribbon behind lunging Light Sword
      const cos = Math.cos(sw.aim);
      const sin = Math.sin(sw.aim);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = isPull ? '#fde047' : '#38bdf8';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx - cos * 30, sy - sin * 30);
      ctx.lineTo(sx - cos * 6, sy - sin * 6);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sx - cos * 24, sy - sin * 24);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.restore();
    }

    // Open-Source CC0 Radiant Light Sword (`fx_light_sword`)
    drawSpriteOrFallback(ctx, 'fx_light_sword', sx, sy, nowSec + sw.id * 0.13, {
      category: 'vfx',
      rotationRad: sw.aim,
      scale: isPull ? 1.16 : 1.06,
    });

    // When impaling & dragging an enemy (`stateFlag === 2`), play CC0 Light Slash arc!
    if (isPull) {
      drawSpriteOrFallback(ctx, 'fx_light_slash', sx, sy, (nowSec * 1.6 + sw.id * 0.25) % 0.29, {
        category: 'vfx',
        rotationRad: sw.aim,
        scale: 0.9,
        alpha: 0.9,
      });
    }

    queueGlow(isPull ? 'fire' : 'cyan', sx, sy, active ? 28 : 18, 0.44 + 0.08 * Math.sin(nowSec * 9 + sw.id));
  }
  drawCallsLastFrame += swords.length;
}

function drawActiveGroundHazards(
  ctx: CanvasRenderingContext2D,
  hazards: readonly BansungHazardWire[],
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
  nowSec: number,
): void {
  for (let i = 0; i < hazards.length; i++) {
    const hz = hazards[i];
    if (!hz || hz.r <= 0) continue;
    const r = Math.max(8, Math.round(hz.r));
    if (hz.x + r < vx0 || hz.x - r > vx1 || hz.y + r < vy0 || hz.y - r > vy1) continue;

    const cx = Math.round(hz.x);
    const cy = Math.round(hz.y);
    const ttlHint = hz.ttlTicks ?? (hz.ttlQ !== undefined ? hz.ttlQ * 1.5 : undefined);
    const fade = ttlHint !== undefined && ttlHint < 18 ? clamp(ttlHint / 18, 0.25, 1) : 1;
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6.8 + hz.id * 1.37);

    let baseFill: string;
    let coreFill: string;
    let borderCol: string;
    let accentCol: string;
    let glowCol: GlowColor;

    if (hz.kind === 'acid_pool') {
      baseFill = `rgba(20, 83, 45, ${(0.42 * fade).toFixed(3)})`;
      coreFill = `rgba(74, 222, 128, ${((0.18 + 0.12 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.5 ? '#bef264' : '#4ade80';
      accentCol = '#dcfce7';
      glowCol = 'emerald';
    } else if (hz.kind === 'storm_yellow') {
      baseFill = `rgba(113, 63, 18, ${(0.40 * fade).toFixed(3)})`;
      coreFill = `rgba(250, 204, 21, ${((0.20 + 0.16 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.5 ? '#fef08a' : '#facc15';
      accentCol = '#fef9c3';
      glowCol = 'fire';
    } else if (hz.kind === 'storm_blue') {
      baseFill = `rgba(12, 74, 110, ${(0.42 * fade).toFixed(3)})`;
      coreFill = `rgba(56, 189, 248, ${((0.20 + 0.16 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.5 ? '#e0f2fe' : '#38bdf8';
      accentCol = '#bae6fd';
      glowCol = 'cyan';
    } else if (hz.kind === 'shock_field') {
      baseFill = `rgba(14, 116, 144, ${(0.36 * fade).toFixed(3)})`;
      coreFill = `rgba(34, 211, 238, ${((0.16 + 0.14 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.55 ? '#e0f2fe' : '#22d3ee';
      accentCol = '#a5f3fc';
      glowCol = 'cyan';
    } else if (hz.kind === 'void_zone') {
      baseFill = `rgba(88, 28, 135, ${(0.44 * fade).toFixed(3)})`;
      coreFill = `rgba(192, 132, 252, ${((0.18 + 0.14 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.5 ? '#f0abfc' : '#c084fc';
      accentCol = '#fae8ff';
      glowCol = 'violet';
    } else {
      // fire_pool
      baseFill = `rgba(124, 45, 18, ${(0.46 * fade).toFixed(3)})`;
      coreFill = `rgba(249, 115, 22, ${((0.22 + 0.14 * pulse) * fade).toFixed(3)})`;
      borderCol = pulse > 0.52 ? '#fde047' : '#fb923c';
      accentCol = '#fef08a';
      glowCol = 'fire';
    }

    ctx.save();
    // Scorched / soaked base pool
    ctx.fillStyle = baseFill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.fill();

    // Pulsing bright inner floor warning fill
    ctx.fillStyle = coreFill;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, Math.round(r * (0.64 + 0.1 * pulse))), 0, TWO_PI);
    ctx.fill();

    // High-contrast hazard perimeter
    ctx.globalAlpha = fade;
    ctx.strokeStyle = OUTLINE_INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.stroke();

    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.75;
    ctx.setLineDash([7, 5]);
    ctx.lineDashOffset = -(nowSec * 22);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Animated crisp pixel surface details per hazard type
    if (hz.kind === 'fire_pool') {
      const emberCount = clamp(Math.round(r / 7), 5, 10);
      for (let k = 0; k < emberCount; k++) {
        const seed = hash2i(hz.id + k * 7, k * 13, 0x51a7);
        const ang = ((seed & 0xff) / 255) * TWO_PI + nowSec * ((k & 1) === 0 ? 0.65 : -0.5);
        const radFrac = 0.18 + (((seed >>> 8) & 0xff) / 255) * 0.65;
        const life = (nowSec * 2.2 + k * 0.27) % 1;
        const ex = Math.round(cx + Math.cos(ang) * r * radFrac);
        const ey = Math.round(cy + Math.sin(ang) * r * radFrac * 0.78 - life * 10);
        ctx.fillStyle = life < 0.45 ? '#fde047' : life < 0.8 ? '#fb923c' : '#ef4444';
        const flameH = life < 0.5 ? 5 : 3;
        ctx.fillRect(ex - 1, ey - flameH, 3, flameH);
        if (life < 0.35) {
          ctx.fillStyle = accentCol;
          ctx.fillRect(ex, ey - flameH - 2, 2, 2);
        }
      }
    } else if (hz.kind === 'acid_pool') {
      const bubbleCount = clamp(Math.round(r / 8), 4, 9);
      for (let k = 0; k < bubbleCount; k++) {
        const seed = hash2i(hz.id + k * 11, k * 5, 0x2c9b);
        const ang = ((seed & 0xff) / 255) * TWO_PI;
        const radFrac = 0.15 + (((seed >>> 8) & 0xff) / 255) * 0.66;
        const life = (nowSec * 1.8 + k * 0.31) % 1;
        const bx = Math.round(cx + Math.cos(ang) * r * radFrac);
        const by = Math.round(cy + Math.sin(ang) * r * radFrac * 0.8 - life * 5);
        const sz = life > 0.72 ? 4 : 3;
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(bx - 1, by - 1, sz + 1, sz + 1);
        ctx.fillStyle = life > 0.72 ? accentCol : borderCol;
        ctx.fillRect(bx, by, sz - 1, sz - 1);
      }
    } else if (
      hz.kind === 'shock_field' ||
      hz.kind === 'storm_yellow' ||
      hz.kind === 'storm_blue'
    ) {
      const arcStep = Math.floor(nowSec * 15);
      const isStorm = hz.kind === 'storm_yellow' || hz.kind === 'storm_blue';
      const arcCount = isStorm ? 4 : 3;
      ctx.strokeStyle = accentCol;
      ctx.lineWidth = isStorm ? 2 : 1.5;
      for (let k = 0; k < arcCount; k++) {
        const a0 = ((hash2i(hz.id, arcStep + k, 0x71e3) & 0xff) / 255) * TWO_PI;
        const a1 = a0 + 1.1 + (((k + 1) * 0.7) % 1.4);
        const x0 = Math.round(cx + Math.cos(a0) * r * 0.72);
        const y0 = Math.round(cy + Math.sin(a0) * r * 0.6);
        const mx = Math.round(cx + Math.cos((a0 + a1) * 0.5) * r * 0.3);
        const my = Math.round(cy + Math.sin((a0 + a1) * 0.5) * r * 0.3);
        const x1 = Math.round(cx + Math.cos(a1) * r * 0.72);
        const y1 = Math.round(cy + Math.sin(a1) * r * 0.6);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(mx, my);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      if (isStorm) {
        const vortexAng = nowSec * (hz.kind === 'storm_yellow' ? 3.2 : -3.2) + hz.id;
        for (let k = 0; k < 4; k++) {
          const ang = vortexAng + (k * Math.PI) * 0.5;
          const sx = Math.round(cx + Math.cos(ang) * r * 0.48);
          const sy = Math.round(cy + Math.sin(ang) * r * 0.4);
          ctx.fillStyle = borderCol;
          ctx.fillRect(sx - 2, sy - 2, 4, 4);
        }
        // Crashing sky-to-ground Open-Source CC0 Lightning Bolts inside storm vortex!
        const boltClip = hz.kind === 'storm_yellow' ? 'fx_lightning_bolt_yellow' : 'fx_lightning_bolt_blue';
        const strikeCycle = (nowSec * 2.8 + hz.id * 0.37) % 1;
        if (strikeCycle < 0.78) {
          const strikeIdx = Math.floor(nowSec * 2.8 + hz.id * 0.37);
          const sHash = hash2i(hz.id, strikeIdx, 0x9931);
          const sAng = ((sHash & 0xff) / 255) * TWO_PI;
          const sRad = (((sHash >>> 8) & 0xff) / 255) * r * 0.52;
          const bx = Math.round(cx + Math.cos(sAng) * sRad);
          const by = Math.round(cy + Math.sin(sAng) * sRad * 0.65);
          const frameIdx = Math.min(5, Math.floor((strikeCycle / 0.78) * 6));
          drawSpriteOrFallback(ctx, boltClip, bx, by, nowSec, {
            category: 'vfx',
            frameIdx,
            scale: 1.05,
            alpha: fade,
          });
        }
      }
    } else {
      // void_zone rotating abyssal glyph specks
      for (let k = 0; k < 6; k++) {
        const ang = nowSec * 1.6 + (k / 6) * TWO_PI + hz.id;
        const rad = r * (0.28 + 0.52 * (1 - ((nowSec * 0.7 + k * 0.16) % 1)));
        const vx = Math.round(cx + Math.cos(ang) * rad);
        const vy = Math.round(cy + Math.sin(ang) * rad * 0.8);
        ctx.fillStyle = (k & 1) === 0 ? borderCol : accentCol;
        ctx.fillRect(vx - 1, vy - 1, 3, 3);
      }
    }

    ctx.restore();
    queueGlow(glowCol, cx, cy, Math.min(96, r + 14), (0.3 + 0.12 * pulse) * fade);
    drawCallsLastFrame += 3;
  }
}

function recordRenderedBossTelegraph(tg: BansungTelegraphWire): void {
  if (renderedBossTelegraphCount >= renderedBossTelegraphsScratch.length) return;
  const slot = renderedBossTelegraphsScratch[renderedBossTelegraphCount++];
  slot.id = tg.id;
  slot.kind = tg.kind;
  slot.x0 = tg.x0;
  slot.y0 = tg.y0;
  slot.x1 = tg.x1;
  slot.y1 = tg.y1;
}

function isDuplicateBossTelegraph(tg: BansungTelegraphWire): boolean {
  for (let i = 0; i < renderedBossTelegraphCount; i++) {
    const r = renderedBossTelegraphsScratch[i];
    if (tg.id !== 0 && r.id === tg.id && r.kind === tg.kind) {
      return true;
    }
    if (
      r.id === tg.id &&
      r.kind === tg.kind &&
      Math.abs(r.x0 - tg.x0) < 4 &&
      Math.abs(r.y0 - tg.y0) < 4 &&
      Math.abs(r.x1 - tg.x1) < 4 &&
      Math.abs(r.y1 - tg.y1) < 4
    ) {
      return true;
    }
  }
  return false;
}

type CircleSigilStyle = 'cyber' | 'hexagram' | 'octagram' | 'abyss';

function drawInscribedStarPolygon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  points: number,
  step: number,
  rotRad: number,
): void {
  ctx.beginPath();
  if (points === 6 && step === 2) {
    // Two interlocking equilateral triangles ({6/2} Hexagram)
    for (let tri = 0; tri < 2; tri++) {
      for (let k = 0; k <= 3; k++) {
        const a = rotRad + tri * (Math.PI / 3) + (k % 3) * ((TWO_PI) / 3);
        const px = cx + Math.cos(a) * radius;
        const py = cy + Math.sin(a) * radius;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
  } else if (points === 8 && step === 2) {
    // Two interlocking rotated squares ({8/2} Octagram)
    for (let sq = 0; sq < 2; sq++) {
      for (let k = 0; k <= 4; k++) {
        const a = rotRad + sq * (Math.PI * 0.25) + (k % 4) * (Math.PI * 0.5);
        const px = cx + Math.cos(a) * radius;
        const py = cy + Math.sin(a) * radius;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
  } else {
    // Single continuous stellated star ({8/3})
    for (let k = 0; k <= points; k++) {
      const idx = (k * step) % points;
      const a = rotRad + (idx / points) * TWO_PI;
      const px = cx + Math.cos(a) * radius;
      const py = cy + Math.sin(a) * radius;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
}

/**
 * 5-Layer Sacred-Geometry & Cyber-Tech Circular Reticle (`boss_attack_vfx_design.md` §3).
 * Replaces noisy dashed circles & black text-box badges with crisp hitbox containment rims,
 * radial wavefront timing fill, counter-rotating astrolabe/radar ticks, sacred sigils & CC0 sprites.
 */
function drawSacredCircleTelegraph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  prog01: number,
  isLocked: boolean,
  color: number | undefined,
  isDanger: boolean,
  seed: number,
  nowSec: number,
): void {
  let rgb = '255, 42, 109';
  let primary = '#ff2a6d';
  let secondary = '#ffe4e6';
  let glow: GlowColor = 'crimson';
  let style: CircleSigilStyle = 'octagram';

  if (color === 5) {
    rgb = '250, 204, 21';
    primary = '#facc15';
    secondary = '#fef9c3';
    glow = 'fire';
    style = 'hexagram';
  } else if (color === 2) {
    rgb = '56, 189, 248';
    primary = '#38bdf8';
    secondary = '#e0f2fe';
    glow = 'cyan';
    style = 'hexagram';
  } else if (color === 3 || color === 4) {
    rgb = '192, 132, 252';
    primary = '#c084fc';
    secondary = '#f5d0fe';
    glow = 'violet';
    style = 'abyss';
  } else if (color === 1) {
    rgb = '251, 146, 60';
    primary = isDanger ? '#ff5964' : '#fb923c';
    secondary = '#fef08a';
    glow = 'fire';
    style = 'cyber';
  }

  const lockFlash = isLocked || prog01 > 0.85;
  const spinA = nowSec * (1.15 + 1.35 * prog01) + (seed & 31) * 0.41;
  const spinB = -nowSec * (0.85 + 1.05 * prog01) - (seed & 15) * 0.53;

  ctx.save();

  // Layer 2: Subtle interior tint + outer annular warning band (zero createRadialGradient!)
  ctx.fillStyle = `rgba(${rgb}, ${(0.05 + 0.07 * prog01).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.fill();

  const innerBandR = Math.max(4, r * 0.82);
  ctx.fillStyle = `rgba(${rgb}, ${(0.11 + 0.11 * prog01).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI, false);
  ctx.arc(cx, cy, innerBandR, 0, TWO_PI, true);
  ctx.fill('evenodd');

  // Layer 3: Expanding radial wavefront progress fill (0 -> r * prog01) + crisp leading ring
  if (prog01 > 0.02) {
    const waveR = Math.max(2, r * prog01);
    ctx.fillStyle = `rgba(${rgb}, ${(0.14 + 0.16 * prog01).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, waveR, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = lockFlash ? '#ffffff' : secondary;
    ctx.lineWidth = lockFlash ? 2.0 : 1.4;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(cx, cy, waveR, 0, TWO_PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Layer 4: Open-Source CC0 Magic Sigil / Void Vortex stamp + Geometric Reticle
  if (r >= 28 && style !== 'cyber') {
    const clipKey = style === 'abyss' ? 'fx_boss_void_vortex' : 'fx_boss_magic_sigil';
    drawSpriteOrFallback(ctx, clipKey, cx, cy, nowSec + (seed & 7) * 0.11, {
      category: 'vfx',
      rotationRad: spinA * 0.65,
      scale: clamp((r * 1.62) / 96, 0.35, 3.2),
      alpha: 0.32 + 0.34 * prog01,
    });
  }

  // Counter-rotating outer degree / astrolabe ticks
  const tickCount = r >= 90 ? 16 : 12;
  ctx.strokeStyle = lockFlash ? '#ffffff' : primary;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  for (let k = 0; k < tickCount; k++) {
    const a = spinB + (k / tickCount) * TWO_PI;
    const tInner = r - ((k & 1) === 0 ? 7 : 4.5);
    ctx.moveTo(cx + Math.cos(a) * tInner, cy + Math.sin(a) * tInner);
    ctx.lineTo(cx + Math.cos(a) * (r - 1.5), cy + Math.sin(a) * (r - 1.5));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (style === 'cyber') {
    // Cyber-Tech Tactical Reticle: 4 inward-locking corner brackets + radial fuse ring + crosshair
    const bracketR = r * (0.68 - 0.24 * prog01);
    const arm = Math.max(5, Math.min(13, r * 0.16));
    ctx.strokeStyle = lockFlash ? '#ffffff' : secondary;
    ctx.lineWidth = 1.8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spinA * 0.35);
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const sx = (q & 1) === 0 ? -1 : 1;
      const sy = (q & 2) === 0 ? -1 : 1;
      const bx = sx * bracketR;
      const by = sy * bracketR;
      ctx.moveTo(bx - sx * arm, by);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx, by - sy * arm);
    }
    ctx.stroke();
    ctx.restore();

    // Central radial countdown arc + crisp target pip
    const fuseR = Math.max(9, Math.min(20, r * 0.26));
    ctx.strokeStyle = OUTLINE_INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, fuseR, 0, TWO_PI);
    ctx.stroke();

    ctx.strokeStyle = lockFlash ? '#ffffff' : secondary;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, fuseR, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * prog01);
    ctx.stroke();

    ctx.fillStyle = lockFlash ? '#ffffff' : primary;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, TWO_PI);
    ctx.fill();
  } else {
    // Sacred Geometry Inscribed Star ({6/2} Hexagram, {8/2} Octagram, or {8/3} Abyssal Star)
    const starR = r * 0.74;
    ctx.strokeStyle = lockFlash ? '#ffffff' : primary;
    ctx.lineWidth = lockFlash ? 2.0 : 1.5;
    ctx.globalAlpha = 0.65 + 0.3 * prog01;
    if (style === 'hexagram') {
      drawInscribedStarPolygon(ctx, cx, cy, starR, 6, 2, spinA);
    } else if (style === 'abyss') {
      drawInscribedStarPolygon(ctx, cx, cy, starR, 8, 3, -spinA * 1.2);
      // Swirling inward gravity arms
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 1.4;
      for (let arm = 0; arm < 4; arm++) {
        const baseA = -spinA * 1.8 + arm * (Math.PI * 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.44, baseA, baseA + 1.05);
        ctx.stroke();
      }
    } else {
      drawInscribedStarPolygon(ctx, cx, cy, starR, 8, 2, spinA);
    }

    // Crisp diamond vertices on outer star points
    const vCount = style === 'hexagram' ? 6 : 8;
    ctx.fillStyle = lockFlash ? '#ffffff' : secondary;
    for (let k = 0; k < vCount; k++) {
      const a = spinA + (k / vCount) * TWO_PI;
      const vx = Math.round(cx + Math.cos(a) * starR);
      const vy = Math.round(cy + Math.sin(a) * starR);
      ctx.fillRect(vx - 1.5, vy - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  // Layer 1 (Top Border Seal): Exact 1.0 * r hitbox containment rim (never vague dashed blobs!)
  ctx.strokeStyle = OUTLINE_INK;
  ctx.lineWidth = 3.4;
  ctx.globalAlpha = 0.78;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = lockFlash ? '#ffffff' : primary;
  ctx.lineWidth = lockFlash ? 2.5 : 1.9;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TWO_PI);
  ctx.stroke();

  if (r >= 26) {
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.42 + 0.35 * prog01;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.restore();

  if (prog01 > 0.35 || lockFlash) {
    queueGlow(
      glow,
      cx,
      cy,
      Math.min(108, Math.max(24, r * 1.05)),
      (lockFlash ? 0.42 : 0.16 + 0.2 * prog01),
    );
  }
}

/**
 * Pass-5 (`globalCompositeOperation = 'lighter'`) 7-Layer Master-Spark Boss Laser Renderer.
 * Renders undulating plasma sheaths, dual 180° helical corkscrew ribbons, blinding white cores,
 * 42ms LCG crackling edge arcs, 8-spike muzzle star-flares, and endpoint plasma boil!
 */
function drawActiveBossMasterSparkBeams(
  ctx: CanvasRenderingContext2D,
  nowSec: number,
): void {
  if (activeBossBeamCount <= 0) return;

  for (let bi = 0; bi < activeBossBeamCount; bi++) {
    const beam = activeBossBeamsScratch[bi];
    const dx = beam.x1 - beam.x0;
    const dy = beam.y1 - beam.y0;
    const len = Math.hypot(dx, dy);
    if (len < 4) continue;

    const angle = Math.atan2(dy, dx);
    const pal = BOSS_LASER_PALETTES[beam.theme];
    const strip = getLaserLateralStrip(beam.theme);

    // Ignition pop (1.42x burst on first frames) + smooth collapse at end of beam window
    const ignitionPop =
      beam.prog01 < 0.14
        ? 1 + 0.42 * (1 - beam.prog01 / 0.14)
        : beam.prog01 > 0.9
          ? Math.max(0.32, (1 - beam.prog01) / 0.1)
          : 1.0;
    const flutter = 0.95 + 0.08 * Math.sin(nowSec * 42 + beam.seed * 1.7);
    const hw = Math.max(6, beam.halfW * ignitionPop * flutter);

    ctx.save();
    ctx.translate(beam.x0, beam.y0);
    ctx.rotate(angle);

    // Layer 1: Wide pre-baked lateral plasma aura (1 drawImage, zero createLinearGradient!)
    if (strip) {
      ctx.globalAlpha = 0.68;
      ctx.drawImage(strip, -hw * 0.4, -hw * 2.75, len + hw * 0.8, hw * 5.5);
    }

    // Layer 2: Undulating sinusoidal plasma sheath polygon (zero-GC Float32Array scratch)
    const nodes = clamp(Math.ceil(len / 34) + 1, 8, LASER_MAX_NODES);
    const stepX = len / (nodes - 1);
    const phase = nowSec * 28 + beam.seed * 0.9;
    for (let k = 0; k < nodes; k++) {
      const taper = k === 0 ? 0.55 : k === nodes - 1 ? 0.75 : 1.0;
      const wave = 1.06 + 0.16 * Math.sin(k * 0.72 - phase);
      const waveOpp = 1.06 + 0.16 * Math.sin(k * 0.72 - phase + 1.9);
      laserUpperY[k] = -hw * wave * taper;
      laserLowerY[k] = hw * waveOpp * taper;
    }
    ctx.globalAlpha = 0.74;
    ctx.fillStyle = pal.primary;
    ctx.beginPath();
    ctx.moveTo(0, laserUpperY[0]);
    for (let k = 1; k < nodes; k++) {
      ctx.lineTo(k * stepX, laserUpperY[k]);
    }
    for (let k = nodes - 1; k >= 0; k--) {
      ctx.lineTo(k * stepX, laserLowerY[k]);
    }
    ctx.closePath();
    ctx.fill();

    // Layer 3: Dual 180° out-of-phase helical corkscrew plasma ribbons
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = pal.secondary;
    ctx.lineWidth = Math.max(2.0, hw * 0.16);
    ctx.lineCap = 'round';
    for (let strand = 0; strand < 2; strand++) {
      const strandPhase = strand * Math.PI - nowSec * 22 + beam.seed;
      ctx.beginPath();
      for (let k = 0; k < nodes; k++) {
        const x = k * stepX;
        const y = Math.sin(x * 0.038 + strandPhase) * hw * 0.86;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Layer 4: High-energy inner plasma body
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = pal.secondary;
    ctx.lineWidth = Math.max(6, hw * 1.12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Layer 5: Blinding #ffffff incandescent core
    ctx.globalAlpha = 0.98;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3.8, hw * 0.52);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Layer 6: 42ms stepped LCG crackling edge arcs along beam perimeter
    const arcBucket = Math.floor(nowSec * 24);
    const arcSegs = clamp(Math.floor(len / 52), 5, 22);
    const arcStep = len / arcSegs;
    ctx.globalAlpha = 0.86;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(0, side * hw * 0.5);
      for (let s = 1; s < arcSegs; s++) {
        const hVal = hash2i(beam.seed + side * 31 + s, arcBucket, 0x6a09);
        const jitter = (((hVal & 0xff) / 255) - 0.35) * hw * 0.95;
        ctx.lineTo(s * arcStep, side * (hw * 0.82 + jitter));
      }
      ctx.lineTo(len, side * hw * 0.45);
    }
    ctx.stroke();

    // Layer 7A: 8-spike rotating muzzle star-flare at (0, 0)
    const flareSpin = nowSec * 6.5 + beam.seed;
    const spikeOuter = Math.max(18, hw * 2.25);
    ctx.globalAlpha = 0.94;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let sp = 0; sp < 8; sp++) {
      const a = flareSpin + (sp * Math.PI) * 0.25;
      const rLen = (sp & 1) === 0 ? spikeOuter : spikeOuter * 0.58;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * rLen, Math.sin(a) * rLen);
    }
    ctx.stroke();

    // Layer 7B: Endpoint plasma boil & radial splash spikes at (len, 0)
    const boilR = Math.max(12, hw * (1.32 + 0.18 * Math.sin(nowSec * 34 + beam.seed)));
    ctx.fillStyle = pal.primary;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(len, 0, boilR, 0, TWO_PI);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(len, 0, boilR * 0.52, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = pal.secondary;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let sp = 0; sp < 6; sp++) {
      const a = -flareSpin * 1.2 + (sp / 6) * TWO_PI;
      ctx.moveTo(len, 0);
      ctx.lineTo(len + Math.cos(a) * boilR * 1.45, Math.sin(a) * boilR * 1.45);
    }
    ctx.stroke();

    ctx.restore();

    // Stamp CC0 open-source laser muzzle flare at origin & impact boil
    drawSpriteOrFallback(ctx, 'fx_laser_muzzle', Math.round(beam.x0), Math.round(beam.y0), nowSec, {
      category: 'vfx',
      rotationRad: angle,
      scale: clamp((hw / 16) * 1.15, 0.7, 2.2),
      alpha: 0.92,
    });
    drawCallsLastFrame += 8;
  }
}

function drawStandardTelegraphs(
  ctx: CanvasRenderingContext2D,
  telegraphs: readonly BansungTelegraphWire[],
  nowSec: number,
  opts?: { recordBoss?: boolean; skipRecordedBoss?: boolean },
): void {
  for (let i = 0; i < telegraphs.length; i++) {
    const tg = telegraphs[i];
    if (!tg) continue;
    if (opts?.skipRecordedBoss && isDuplicateBossTelegraph(tg)) continue;
    if (opts?.recordBoss) recordRenderedBossTelegraph(tg);

    const prog01 = clamp(tg.prog / 255, 0, 1);
    const isLocked = tg.phase > 0 || Boolean(tg.active);
    const isDanger = tg.danger === 1;
    const isYellowStorm = tg.color === 5;
    const rgb =
      isYellowStorm
        ? '250, 204, 21'
        : tg.color === 2
          ? '56, 189, 248'
          : tg.color === 4 || tg.color === 3
            ? '192, 132, 252'
            : isDanger
              ? '255, 42, 109'
              : tg.color === 1
                ? '251, 146, 60'
                : '255, 51, 102';
    const shape = tg.shape ?? (tg.kind === 0 ? 'line' : 'circle');

    if (shape === 'line') {
      const dx = tg.x1 - tg.x0;
      const dy = tg.y1 - tg.y0;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const halfW = Math.max(5, tg.halfW ?? (tg.r > 0 ? tg.r : 14));
      const theme = resolveBossLaserTheme(tg.color, isDanger);
      const seed = (tg.id * 17 + tg.kind * 31 + i) | 0;

      if (tg.active) {
        drawBossLaserScorchFloor(ctx, tg.x0, tg.y0, tg.x1, tg.y1, halfW, theme);
        queueActiveBossMasterSparkBeam(
          tg.x0,
          tg.y0,
          tg.x1,
          tg.y1,
          halfW,
          prog01,
          theme,
          seed,
        );
      } else {
        drawBossLaserWindupCorridor(
          ctx,
          tg.x0,
          tg.y0,
          tg.x1,
          tg.y1,
          halfW,
          prog01,
          tg.phase > 0,
          theme,
          nowSec,
          seed,
        );
      }
      drawCallsLastFrame += 2;
    } else if (shape === 'cone') {
      // Sweeping directional cone (sleek radial arc + leading wavefront, zero text box)
      const dx = tg.x1 - tg.x0;
      const dy = tg.y1 - tg.y0;
      const dist = Math.hypot(dx, dy);
      const angle = dist > 1 ? Math.atan2(dy, dx) : 0;
      const range = Math.max(16, tg.r > 0 ? tg.r : dist);
      const halfAngle =
        tg.halfW !== undefined && tg.halfW > 0
          ? tg.halfW <= Math.PI
            ? tg.halfW
            : Math.atan2(tg.halfW, range)
          : 0.42;
      const cx = Math.round(tg.x0);
      const cy = Math.round(tg.y0);
      ctx.save();
      ctx.fillStyle = isLocked
        ? `rgba(${rgb}, 0.24)`
        : `rgba(${rgb}, ${(0.08 + 0.14 * prog01).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, range, angle - halfAngle, angle + halfAngle);
      ctx.closePath();
      ctx.fill();

      if (prog01 > 0.02) {
        ctx.fillStyle = `rgba(${rgb}, 0.22)`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, range * prog01, angle - halfAngle, angle + halfAngle);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = isLocked ? '#ffffff' : `rgba(${rgb}, 0.88)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, range * prog01, angle - halfAngle, angle + halfAngle);
        ctx.stroke();
      }

      ctx.strokeStyle = OUTLINE_INK;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, range, angle - halfAngle, angle + halfAngle);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = isLocked ? '#ffffff' : `rgb(${rgb})`;
      ctx.lineWidth = isLocked ? 2.4 : 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, range, angle - halfAngle, angle + halfAngle);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      drawCallsLastFrame += 2;
    } else if (shape === 'ring') {
      // Donut / annular hazard ring (crisp solid double containment rim + wavefront)
      const useStart = tg.x1 === 0 && tg.y1 === 0 && (tg.x0 !== 0 || tg.y0 !== 0);
      const cx = Math.round(useStart ? tg.x0 : tg.x1);
      const cy = Math.round(useStart ? tg.y0 : tg.y1);
      const outerR = Math.max(14, tg.r);
      const bandW = Math.max(10, tg.halfW && tg.halfW > 0 ? tg.halfW : Math.round(outerR * 0.36));
      const innerR = Math.max(4, outerR - bandW);
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * (6 + 10 * prog01));

      ctx.save();
      ctx.fillStyle = isLocked
        ? `rgba(${rgb}, 0.26)`
        : `rgba(${rgb}, ${(0.09 + 0.16 * prog01 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, TWO_PI, false);
      ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
      ctx.fill('evenodd');

      if (prog01 > 0.02) {
        const progR = innerR + (outerR - innerR) * prog01;
        ctx.fillStyle = `rgba(${rgb}, 0.22)`;
        ctx.beginPath();
        ctx.arc(cx, cy, progR, 0, TWO_PI, false);
        ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
        ctx.fill('evenodd');
      }

      ctx.strokeStyle = OUTLINE_INK;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, TWO_PI);
      ctx.stroke();

      ctx.strokeStyle = isLocked ? '#ffffff' : `rgba(${rgb}, 0.94)`;
      ctx.lineWidth = isLocked ? 2.4 : 1.9;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, innerR, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
      drawCallsLastFrame += 2;
    } else {
      // 5-Layer Sacred-Geometry & Cyber-Tech Radial AoE Reticle (zero text-box spam!)
      const useStart = tg.x1 === 0 && tg.y1 === 0 && (tg.x0 !== 0 || tg.y0 !== 0);
      const cx = Math.round(useStart ? tg.x0 : tg.x1);
      const cy = Math.round(useStart ? tg.y0 : tg.y1);
      const r = Math.max(8, tg.r);
      drawSacredCircleTelegraph(
        ctx,
        cx,
        cy,
        r,
        prog01,
        isLocked,
        tg.color,
        isDanger,
        (tg.id * 13 + tg.kind * 7 + i) | 0,
        nowSec,
      );
      drawCallsLastFrame += 3;
    }
  }
}

function drawMeleeSlashes(
  ctx: CanvasRenderingContext2D,
  additivePass: boolean,
): void {
  for (let i = 0; i < meleeSlashes.length; i++) {
    const s = meleeSlashes[i];
    if (!s.active) continue;
    const t = clamp(s.ageMs / Math.max(1, s.ttlMs), 0, 1);
    const alpha = 1 - t * t;
    const weapon = getWeaponByIdx(s.weaponIdx);
    const reach = weapon?.id === 'reaper_scythe' ? 68 : weapon?.id === 'shock_baton' ? 48 : 54;
    const isScythe = weapon?.id === 'reaper_scythe';
    const isShock = weapon?.id === 'shock_baton';

    if (!additivePass) {
      const clipKey = isScythe
        ? 'fx_slash_scythe'
        : isShock
          ? 'fx_slash_shock'
          : 'fx_slash_crescent';
      const drawn = drawFirstAvailableClip(ctx, [clipKey], s.x, s.y - 12, t * 0.25, {
        rotationRad: s.angleRad,
        flipX: s.swingDir < 0,
        alpha,
        category: 'vfx',
      });
      if (drawn) continue;
    }

    const color = isScythe ? '#e64980' : isShock ? '#3bc9db' : '#74c0fc';
    const arcSpan = isScythe ? 2.1 : 1.7;
    const a0 = s.angleRad - arcSpan * 0.5;
    const a1 = s.angleRad + arcSpan * 0.5;

    ctx.save();
    ctx.globalAlpha *= additivePass ? alpha * 0.65 : alpha;
    ctx.strokeStyle = additivePass ? '#ffffff' : color;
    ctx.lineWidth = additivePass ? Math.max(2, (1 - t) * 5) : Math.max(3, (1 - t) * 10);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(Math.round(s.x), Math.round(s.y - 12), reach * 0.78, a0, a1);
    ctx.stroke();

    if (!additivePass && isShock) {
      // Jagged shock arcs
      ctx.strokeStyle = '#e7f5ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) {
        const ka = a0 + (arcSpan * k) / 4;
        const kr = reach * (0.68 + ((k & 1) === 0 ? 0.18 : -0.1));
        const px = s.x + Math.cos(ka) * kr;
        const py = s.y - 12 + Math.sin(ka) * kr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawWorldPings(
  ctx: CanvasRenderingContext2D,
  pings: readonly BansungPingItem[],
  nowMs: number,
): void {
  if (!pings || pings.length === 0) return;
  for (let i = 0; i < pings.length; i++) {
    const p = pings[i];
    const remaining = p.expiresAt - nowMs;
    if (remaining <= 0) continue;
    const age = Math.max(0, PING_DEFAULT_TTL_MS - remaining);
    const u = clamp(age / PING_DEFAULT_TTL_MS, 0, 1);
    const fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;

    let color = '#ff922b';
    let glyph = '!';
    if (p.kind === BANSUNG_PING_ENEMY) {
      color = '#ff6b6b';
      glyph = 'X';
    } else if (p.kind === BANSUNG_PING_HELP) {
      color = '#ffd43b';
      glyph = '?';
    } else if (p.kind === BANSUNG_PING_LOOT) {
      color = '#22b8cf';
      glyph = '$';
    } else if (p.kind === BANSUNG_PING_REVIVE) {
      color = '#51cf66';
      glyph = '+';
    }

    const pulseR = 14 + ((age * 0.045) % 24);
    const rx = Math.round(p.x);
    const ry = Math.round(p.y);

    ctx.save();
    ctx.globalAlpha *= fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, pulseR, 0, TWO_PI);
    ctx.stroke();

    const bob = Math.round(Math.sin(nowMs * 0.008) * 3);
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(rx - 8, ry - 26 + bob, 16, 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx - 7.5, ry - 25.5 + bob, 15, 15);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(glyph, rx, ry - 18 + bob);
    ctx.restore();
  }
}

function drawAimReticle(
  ctx: CanvasRenderingContext2D,
  aimX: number,
  aimY: number,
  autoAimId: number | null,
  autoAimX: number,
  autoAimY: number,
  nowSec: number,
): void {
  const rx = Math.round(aimX);
  const ry = Math.round(aimY);
  const spread = 6;
  const arm = 5;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Crisp pixel crosshair with 1px dark outline
  ctx.fillStyle = OUTLINE_INK;
  ctx.fillRect(rx - spread - arm - 1, ry - 2, arm + 2, 4);
  ctx.fillRect(rx + spread - 1, ry - 2, arm + 2, 4);
  ctx.fillRect(rx - 2, ry - spread - arm - 1, 4, arm + 2);
  ctx.fillRect(rx - 2, ry + spread - 1, 4, arm + 2);
  ctx.fillRect(rx - 2, ry - 2, 4, 4);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rx - spread - arm, ry - 1, arm, 2);
  ctx.fillRect(rx + spread, ry - 1, arm, 2);
  ctx.fillRect(rx - 1, ry - spread - arm, 2, arm);
  ctx.fillRect(rx - 1, ry + spread, 2, arm);
  ctx.fillStyle = '#ffd43b';
  ctx.fillRect(rx - 1, ry - 1, 2, 2);

  // Mobile auto-aim lock diamond
  if (autoAimId !== null) {
    const lx = Math.round(autoAimX);
    const ly = Math.round(autoAimY) - 18;
    const r = 10 + Math.round(Math.sin(nowSec * 10) * 2);
    ctx.strokeStyle = '#ff4d4f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly - r);
    ctx.lineTo(lx + r, ly);
    ctx.lineTo(lx, ly + r);
    ctx.lineTo(lx - r, ly);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// ============================================================================
// 8. World Micro-HUD, Damage Numbers & FX Event Ingestion
// ============================================================================

export function spawnDamageNumber(
  x: number,
  y: number,
  text: string,
  opts?: {
    color?: string;
    stroke?: string;
    scale?: number;
    ttlMs?: number;
    vy?: number;
  },
): void {
  const slot = dmgNums[dmgNumHead];
  dmgNumHead = (dmgNumHead + 1) % RENDER_CFG.MAX_DMG_NUMBERS;
  const jitterX = (((dmgNumHead * 7) % 13) - 6) * 1.4;
  slot.active = true;
  slot.x = x + jitterX;
  slot.y = y - 20;
  slot.vy = opts?.vy ?? -46;
  slot.text = text;
  slot.color = opts?.color ?? '#ffffff';
  slot.stroke = opts?.stroke ?? OUTLINE_INK;
  slot.scale = opts?.scale ?? 1;
  slot.ageMs = 0;
  slot.ttlMs = opts?.ttlMs ?? 820;
}

export function triggerScreenFlash(alpha: number, color = '#ffffff'): void {
  screenFlashState.alpha = clamp(
    Math.max(screenFlashState.alpha, alpha),
    0,
    RENDER_CFG.MAX_FLASH_ALPHA,
  );
  screenFlashState.color = color;
}

export function spawnMeleeSlashEffect(
  x: number,
  y: number,
  angleRad: number,
  weaponIdx: number,
  swingDir: 1 | -1 = 1,
): void {
  const slot = meleeSlashes[meleeSlashHead];
  meleeSlashHead = (meleeSlashHead + 1) % RENDER_CFG.MAX_MELEE_SLASHES;
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.angleRad = angleRad;
  slot.weaponIdx = weaponIdx;
  slot.swingDir = swingDir;
  slot.ageMs = 0;
  slot.ttlMs = RENDER_CFG.MELEE_SLASH_TTL_MS;
}

function resolveFxActorWeaponTier(
  store: BansungStore,
  actorId: number,
  myPlayerId?: number,
): BansungWeaponTier {
  if (actorId >= 2000) return 1;
  const playerSlotIdx = actorId >= 1000 && actorId < 2000 ? actorId - 1000 : actorId;
  const isLocal =
    (store.myIdx !== undefined && (playerSlotIdx === store.myIdx || actorId === store.myIdx)) ||
    (myPlayerId !== undefined && (playerSlotIdx === myPlayerId || actorId === myPlayerId));
  let matchedTier: number | undefined;
  for (const p of store.players.values()) {
    if (p.idx === playerSlotIdx || p.idx === actorId || p.id === actorId || p.id === playerSlotIdx) {
      matchedTier = p.weaponTier;
      break;
    }
  }
  if (isLocal && store.me?.weaponTiers) {
    return normalizeWeaponTier(store.me.weaponTiers[store.me.slotIdx] ?? matchedTier);
  }
  return normalizeWeaponTier(matchedTier);
}

function resolveStatusCoords(
  store: BansungStore,
  playerIdx: number,
  evtX: number,
  evtY: number,
): { x: number; y: number } {
  if (evtX !== 0 || evtY !== 0) {
    return { x: evtX, y: evtY };
  }
  for (const p of store.players.values()) {
    if (p.idx === playerIdx || p.id === playerIdx) {
      const isLocal = store.myIdx !== undefined && p.idx === store.myIdx;
      return {
        x: isLocal ? store.localDrawX : p.x,
        y: isLocal ? store.localDrawY : p.y,
      };
    }
  }
  return { x: store.localDrawX, y: store.localDrawY };
}

export function processBansungFxEvents(
  events: readonly SnapFxEvent[],
  opts?: {
    store?: BansungStore;
    myPlayerId?: number;
    viewerPos?: { x: number; y: number } | null;
    reducedFlash?: boolean;
    nowMs?: number;
    motionNowMs?: number;
    skipAudio?: boolean;
  },
): void {
  if (!events || events.length === 0) return;
  const store = opts?.store ?? bansungStore;
  const nowMs = opts?.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const motionNowMs = opts?.motionNowMs ?? nowMs;
  const viewerPos = opts?.viewerPos ?? { x: store.localDrawX, y: store.localDrawY };

  if (!opts?.skipAudio) {
    consumeFrameAudioEvents(events, opts?.myPlayerId, { localPlayerIdx: store.myIdx });
  }

  for (let i = 0; i < events.length; i++) {
    const evt = events[i];
    const weaponTier =
      evt.type === FX_MUZZLE
        ? resolveFxActorWeaponTier(store, evt.a, opts?.myPlayerId)
        : 1;
    bansungVfx.consumeFxEvent(evt, viewerPos, Boolean(opts?.reducedFlash), nowMs, weaponTier);

    if (evt.type === FX_DMG) {
      // [1, x, y, amount, dmgFlags, targetId]
      const x = evt.a;
      const y = evt.b;
      const amt = Math.round(Math.abs(evt.c));
      const flags = evt.d;
      const targetId = evt.e;
      const isHeal = (flags & BANSUNG_DMG_HEAL) !== 0;
      const isCrit = (flags & BANSUNG_DMG_CRIT) !== 0;
      const isPlayerHit =
        !isHeal &&
        ((opts?.myPlayerId !== undefined && targetId === opts.myPlayerId) ||
          (store.myIdx !== undefined && targetId === store.myIdx));

      let color = '#ffffff';
      let scale = 1;
      if (isHeal) {
        color = '#51cf66';
      } else if (isCrit) {
        color = '#ffd43b';
        scale = 1.35;
      } else if (isPlayerHit) {
        color = '#ff4d4f';
        scale = 1.1;
      } else if ((flags & BANSUNG_DMG_SHOCK) !== 0 || (flags & BANSUNG_DMG_STUN) !== 0) {
        color = '#74c0fc';
      } else if ((flags & BANSUNG_DMG_BURN) !== 0) {
        color = '#ff922b';
      } else if ((flags & BANSUNG_DMG_ARMOR) !== 0) {
        color = '#cbd5e1';
      }

      const txt = isHeal ? `+${amt}` : isCrit ? `${amt}!` : `${amt}`;
      spawnDamageNumber(x, y, txt, { color, scale });
      continue;
    }

    if (evt.type === FX_IMPACT) {
      // [3, impactKind, x, y, aimQ, matOrWeaponIdx]
      if (evt.a === 2) {
        const wIdx = evt.e >>> 1;
        const dir: 1 | -1 = (evt.e & 1) === 1 ? 1 : -1;
        spawnMeleeSlashEffect(evt.b, evt.c, dequantizeAim(evt.d), wIdx, dir);
      } else if (evt.a === 3) {
        bansungFx.spawnBurst('sparks', evt.b, evt.c, dequantizeAim(evt.d), 1, {
          colorIdx: FxColor.Cyan,
        });
      }
      continue;
    }

    if (evt.type === FX_DEATH) {
      // [4, kindIdx, x, y, tier, killerIdx]
      const x = evt.b;
      const y = evt.c;
      const isMechanical =
        evt.a === 5 || evt.a === 8 || evt.a === 9 || evt.a === 10 || evt.a === 11;
      bansungFx.spawnDecal(
        isMechanical ? DecalKind.SplatOil : DecalKind.SplatBlood,
        x,
        y,
        (evt.a * 1.3 + x * 0.05) % TWO_PI,
        0,
      );
      bansungFx.spawnBurst(isMechanical ? 'sparks' : 'blood', x, y - 8, 0, 1.1, {
        colorIdx: isMechanical ? FxColor.Cyan : FxColor.Blood,
      });
      if (evt.d >= 3 || evt.a >= 8) {
        if (!opts?.reducedFlash) {
          triggerScreenFlash(0.28, '#ffd43b');
        }
        bansungMotion.triggerExplosionJuice(x, y, viewerPos.x, viewerPos.y, motionNowMs, {
          strength: 1.5,
        });
      }
      continue;
    }

    if (evt.type === FX_STATUS) {
      // [5, playerIdx, statusKind, val, x, y]
      if (evt.b === BANSUNG_FX_STATUS_RELOAD_PERFECT) {
        bansungFx.spawnText('FAST!', evt.d, evt.e - 30, FxColor.Gold, 1.1);
      } else if (evt.b === BANSUNG_FX_STATUS_REVIVED) {
        bansungFx.spawnText('REVIVED!', evt.d, evt.e - 32, FxColor.Heal, 1.15);
        bansungFx.spawnBurst('sparks', evt.d, evt.e - 12, 0, 1, {
          colorIdx: FxColor.Heal,
        });
      } else if (evt.b === BANSUNG_FX_STATUS_CRATE) {
        bansungFx.spawnDecal(DecalKind.Rubble, evt.d, evt.e, 0, 0);
        bansungFx.spawnBurst('crate', evt.d, evt.e - 10, 0, 1, {
          colorIdx: FxColor.WoodChip,
        });
      } else if (evt.b === BANSUNG_FX_STATUS_RESTOCK) {
        const pos = resolveStatusCoords(store, evt.a, evt.d, evt.e);
        bansungFx.spawnText('RESTOCK!', pos.x, pos.y - 30, FxColor.Cyan, 1.05);
        bansungFx.spawnBurst('sparks', pos.x, pos.y - 12, 0, 0.9, {
          colorIdx: FxColor.Cyan,
        });
      } else if (evt.b === BANSUNG_FX_STATUS_LEVELUP) {
        const pos = resolveStatusCoords(store, evt.a, evt.d, evt.e);
        const lvl = Math.max(1, Math.round(evt.c || 2));
        bansungVfx.spawnLevelUpVfx(pos.x, pos.y, lvl);
        spawnDamageNumber(pos.x, pos.y - 20, 'LEVEL UP!', {
          color: '#fbbf24',
          stroke: OUTLINE_INK,
          scale: 1.35,
          ttlMs: 1150,
          vy: -52,
        });
        const isLocalActor =
          (store.myIdx !== undefined && evt.a === store.myIdx) ||
          (opts?.myPlayerId !== undefined && evt.a === opts.myPlayerId);
        if (isLocalActor && !opts?.reducedFlash) {
          triggerScreenFlash(0.16, '#fbbf24');
        }
      } else if (evt.b === BANSUNG_FX_STATUS_GACHA) {
        const pos = resolveStatusCoords(store, evt.a, evt.d, evt.e);
        const val = Math.round(evt.c || 0);
        const auraColor =
          val >= 3
            ? BANSUNG_WEAPON_TIERS[normalizeWeaponTier(val)].auraColor
            : val === 2
              ? BANSUNG_WEAPON_TIERS[3].auraColor
              : val === 1
                ? BANSUNG_WEAPON_TIERS[2].auraColor
                : BANSUNG_WEAPON_TIERS[4].auraColor;
        bansungVfx.spawnGachaUpgradeVfx(pos.x, pos.y, auraColor);
        spawnDamageNumber(pos.x, pos.y - 20, 'EVOLVED!', {
          color: auraColor,
          stroke: OUTLINE_INK,
          scale: 1.32,
          ttlMs: 1100,
          vy: -50,
        });
      } else if (evt.b === BANSUNG_FX_STATUS_HERO_SKILL) {
        const pos = resolveStatusCoords(store, evt.a, evt.d, evt.e);
        bansungFx.spawnText('TUYỆT CHIÊU!', pos.x, pos.y - 34, FxColor.Gold, 1.25);
        bansungFx.spawnBurst('sparks', pos.x, pos.y - 16, 0, 1.35, {
          colorIdx: FxColor.Gold,
        });
      } else if (evt.b === BANSUNG_FX_STATUS_BOSS_PART_BREAK) {
        const bx = evt.d || 0;
        const by = evt.e || 0;
        spawnDamageNumber(bx, by - 46, 'PHÁ BỘ PHẬN · CHOÁNG!', {
          color: '#fbbf24',
          stroke: OUTLINE_INK,
          scale: 1.4,
          ttlMs: 1350,
          vy: -42,
        });
        bansungFx.spawnBurst('sparks', bx, by - 20, 0, 1.8, {
          colorIdx: FxColor.Gold,
        });
        if (!opts?.reducedFlash) {
          triggerScreenFlash(0.22, '#fbbf24');
        }
      }
    }
  }
}

function stepLocalPools(dtMs: number): void {
  const dtSec = dtMs * 0.001;
  for (let i = 0; i < dmgNums.length; i++) {
    const d = dmgNums[i];
    if (!d.active) continue;
    d.ageMs += dtMs;
    if (d.ageMs >= d.ttlMs) {
      d.active = false;
      continue;
    }
    d.y += d.vy * dtSec;
    d.vy *= Math.exp(-3.4 * dtSec);
  }

  for (let i = 0; i < meleeSlashes.length; i++) {
    const s = meleeSlashes[i];
    if (!s.active) continue;
    s.ageMs += dtMs;
    if (s.ageMs >= s.ttlMs) s.active = false;
  }

  if (screenFlashState.alpha > 0) {
    screenFlashState.alpha = Math.max(
      0,
      screenFlashState.alpha - screenFlashState.decayPerSec * dtSec,
    );
  }
}

function drawOutlinedDamageNumbers(
  ctx: CanvasRenderingContext2D,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  for (let i = 0; i < dmgNums.length; i++) {
    const d = dmgNums[i];
    if (!d.active) continue;
    if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
    const p = clamp(d.ageMs / Math.max(1, d.ttlMs), 0, 1);
    const fade = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
    const pop = d.ageMs < 110 ? 1 + 0.28 * (1 - d.ageMs / 110) : 1;
    const pxSize = Math.max(10, Math.round(12 * d.scale * pop));

    ctx.globalAlpha = fade;
    ctx.font = `bold ${pxSize}px monospace`;
    ctx.strokeStyle = d.stroke;
    ctx.lineWidth = 3;
    const rx = Math.round(d.x);
    const ry = Math.round(d.y);
    ctx.strokeText(d.text, rx, ry);
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, rx, ry);
    drawCallsLastFrame++;
  }
  ctx.restore();
}

function drawWorldMicroHud(
  ctx: CanvasRenderingContext2D,
  store: BansungStore,
  localPlayer: InterpPlayer | null,
  visibleEnemies: readonly InterpEnemy[],
  nowMs: number,
): void {
  let stunnedCount = 0;
  for (let i = 0; i < visibleEnemies.length; i++) {
    const e = visibleEnemies[i];
    if (
      e.state !== BANSUNG_STATE_DEAD &&
      ((e.flags & BANSUNG_EFLAG_STUNNED) !== 0 || e.state === BANSUNG_STATE_STUN)
    ) {
      stunnedCount++;
    }
  }
  for (const p of store.players.values()) {
    if (p.state === BANSUNG_STATE_STUN) stunnedCount++;
  }
  for (let bi = 0; bi < activeBossCount; bi++) {
    const bv = bossRenderViews[bi];
    if (bv.id !== 0 && bv.stunned && bv.state !== BANSUNG_STATE_DEAD) {
      stunnedCount++;
    }
  }
  const totalStunned = Math.max(1, stunnedCount);

  // 1. Uniform mob HP bars across all living enemies (full HP + wounded)
  for (let i = 0; i < visibleEnemies.length; i++) {
    const e = visibleEnemies[i];
    if (e.state === BANSUNG_STATE_DEAD) continue;
    const isStunned = (e.flags & BANSUNG_EFLAG_STUNNED) !== 0 || e.state === BANSUNG_STATE_STUN;
    const isElite = (e.flags & BANSUNG_EFLAG_ELITE) !== 0;
    const isEvolved = (e.flags & BANSUNG_EFLAG_EVOLVED) !== 0;

    if (e.hpPct > 0) {
      const bw = isEvolved ? 38 : isElite ? 36 : 32;
      const bh = 5;
      const bx = Math.round(e.x - (bw >> 1));
      const baseH = e.enemyId === 'cactus_brute' ? (isEvolved ? 66 : 56) : isEvolved ? 52 : 42;
      const by = Math.round(e.y - baseH);
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = isEvolved ? '#e879f9' : isElite ? '#f59e0b' : '#ef4444';
      ctx.fillRect(bx, by, Math.max(1, Math.round((bw * e.hpPct) / 100)), bh);

      const mobLv = e.level ?? 1;
      if (mobLv >= 2) {
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillText(`LV${mobLv}`, Math.round(e.x) + 1, by - 1);
        ctx.fillStyle = mobLv >= 6 ? '#f43f5e' : mobLv >= 4 ? '#fb923c' : '#fde047';
        ctx.fillText(`LV${mobLv}`, Math.round(e.x), by - 2);
      }
    }

    if (isStunned) {
      const spriteH = e.enemyId === 'cactus_brute' ? 42 : 28;
      const unitR = BANSUNG_ENEMIES[e.enemyId]?.radius ?? 14;
      drawOverheadStunStars(ctx, e.x, e.y, spriteH, unitR, e.id, 3, false, totalStunned, nowMs);
      drawOverheadStunStars(ctx, e.x, e.y, spriteH, unitR, e.id, 3, true, totalStunned, nowMs);
    }
  }

  // 2. Players micro HP/Shield, downed SOS / revive progress, stun stars, local reload bar
  for (const p of store.players.values()) {
    if (p.state === BANSUNG_STATE_DEAD) continue;
    const isLocal = p === localPlayer;
    const px = isLocal ? store.localDrawX : p.x;
    const py = isLocal ? store.localDrawY : p.y;
    const rx = Math.round(px);
    const ry = Math.round(py);

    if (p.state === BANSUNG_STATE_STUN) {
      drawOverheadStunStars(ctx, px, py, 34, 14, p.id, 3, false, totalStunned, nowMs);
      drawOverheadStunStars(ctx, px, py, 34, 14, p.id, 3, true, totalStunned, nowMs);
    }

    if (p.state === BANSUNG_STATE_DOWNED) {
      const blink = (Math.floor(nowMs / 240) & 1) === 0;
      const pct = clamp((p.revivePct ?? 0) / 100, 0, 1);
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(rx - 18, ry - 48, 36, 13);
      ctx.fillStyle = blink ? '#f03e3e' : '#f59f00';
      ctx.fillRect(rx - 17, ry - 47, 34, 11);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(pct > 0 ? `${Math.round(pct * 100)}%` : 'SOS', rx, ry - 41);

      if (pct > 0) {
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(rx - 18, ry - 33, 36, 4);
        ctx.fillStyle = '#51cf66';
        ctx.fillRect(rx - 17, ry - 32, Math.max(1, Math.round(34 * pct)), 2);
      }
      continue;
    }

    // Teammate name + compact bar (keep local hero unobstructed unless reloading)
    const rosterInfo = store.playerRoster[p.idx];
    const heroId = BANSUNG_HERO_IDS[p.heroIdx] ?? 'ranger';
    const maxHp = isLocal && store.me ? store.me.maxHp : resolveHeroMaxHp(heroId, 60);
    const hpPct = clamp(p.hp / Math.max(1, maxHp), 0, 1);

    if (!isLocal) {
      const head = getHeroHeadAnchor(px, py, heroId);
      const bx = Math.round(head.x - 15);
      const by = Math.round(head.y - 10);
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(bx - 1, by - 1, 32, 5);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(bx, by, 30, 3);
      ctx.fillStyle = '#51cf66';
      if (p.hp > 0) {
        ctx.fillRect(bx, by, Math.max(1, Math.round(30 * hpPct)), 3);
      }

      if (rosterInfo?.name) {
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillText(rosterInfo.name.slice(0, 10), Math.round(head.x) + 1, by - 2);
        ctx.fillStyle = (p.flags & BANSUNG_PFLAG_BOT) !== 0 ? '#a5f3fc' : '#e2e8f0';
        ctx.fillText(rosterInfo.name.slice(0, 10), Math.round(head.x), by - 3);
      }
    } else if (
      p.state !== BANSUNG_STATE_DEAD &&
      p.state !== BANSUNG_STATE_DOWNED &&
      p.hp > 0 &&
      (isLocal && store.me
        ? Boolean(store.me.slots?.[store.me.slotIdx]?.maxClip) &&
          store.me.reloadTotalMs > 0 &&
          store.me.reloadMs > 0
        : (p.flags & BANSUNG_PFLAG_RELOADING) !== 0)
    ) {
      const pulseBright = (Math.floor(nowMs / 150) & 1) === 0;
      const hasBar =
        isLocal &&
        store.me &&
        Boolean(store.me.slots?.[store.me.slotIdx]?.maxClip) &&
        store.me.reloadTotalMs > 0 &&
        store.me.reloadMs > 0;
      const textY = ry - (hasBar ? 58 : 54);
      ctx.save();
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = OUTLINE_INK;
      ctx.strokeText('RELOADING...', rx, textY);
      ctx.fillStyle = pulseBright ? '#fde047' : '#fb923c';
      ctx.fillText('RELOADING...', rx, textY);
      ctx.restore();

      if (hasBar && store.me) {
        const progress = clamp(
          1 - store.me.reloadMs / Math.max(1, store.me.reloadTotalMs),
          0,
          1,
        );
        const bw = 46;
        const bx = rx - (bw >> 1);
        const by = ry - 52;
        ctx.fillStyle = OUTLINE_INK;
        ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bx, by, bw, 5);

        const spot = store.me.sweetSpot;
        if (spot) {
          const s0 = spot[0] > 1 || spot[1] > 1 ? spot[0] / 100 : spot[0];
          const s1 = spot[0] > 1 || spot[1] > 1 ? spot[1] / 100 : spot[1];
          const c0 = clamp(Math.min(s0, s1), 0, 1);
          const c1 = clamp(Math.max(s0, s1), 0, 1);
          const sx = bx + Math.round(c0 * bw);
          const sw = Math.max(3, Math.min(bw - (sx - bx), Math.round((c1 - c0) * bw)));
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(sx, by, sw, 5);
        }
        ctx.fillStyle = '#ffd43b';
        ctx.fillRect(bx + Math.round(progress * (bw - 2)), by - 1, 2, 7);
      }
    }
  }

  // 3. Stun stars over stunned bosses
  for (let bi = 0; bi < activeBossCount; bi++) {
    const bv = bossRenderViews[bi];
    if (bv.id !== 0 && bv.stunned && bv.state !== BANSUNG_STATE_DEAD) {
      drawOverheadStunStars(
        ctx,
        bv.x,
        bv.y - bv.z,
        76,
        44,
        bv.id,
        4,
        false,
        totalStunned,
        nowMs,
      );
      drawOverheadStunStars(
        ctx,
        bv.x,
        bv.y - bv.z,
        76,
        44,
        bv.id,
        4,
        true,
        totalStunned,
        nowMs,
      );
    }
  }
}

// ============================================================================
// 9. Pet Tuple Sync Helper
// ============================================================================

function syncFramePetsIfPresent(
  store: BansungStore,
  dtSec: number,
  nowMs: number,
): void {
  const storeExt = store as BansungStore & { pets?: readonly BansungPetFrame[] };
  const pets = storeExt.pets ?? store.frame?.pets;
  if (!pets || pets.length === 0) return;

  for (let i = 0; i < pets.length; i++) {
    const pt = pets[i];
    if (!pt || pt.ownerId === undefined) continue;
    let owner = store.players.get(pt.ownerId);
    if (!owner) {
      for (const p of store.players.values()) {
        if (p.idx === pt.ownerId) {
          owner = p;
          break;
        }
      }
    }
    const tuple: BansungPetNetTuple =
      pt.tuple ?? [
        pt.x ?? owner?.x ?? 0,
        pt.y ?? owner?.y ?? 0,
        clamp((pt.state ?? 0) | 0, 0, 3) as 0 | 1 | 2 | 3,
        pt.left ? 1 : 0,
      ];
    const kind: BansungPetKind = pt.kind ?? 'tiger';
    bansungVfx.syncPetState(
      owner?.id ?? pt.ownerId,
      kind,
      tuple,
      owner?.x ?? tuple[0],
      owner?.y ?? tuple[1],
      owner?.state === BANSUNG_STATE_DOWNED || owner?.state === BANSUNG_STATE_DEAD,
      true,
      dtSec,
      nowMs,
    );
  }
}

// ============================================================================
// 10. Eight-Pass 2.5D Main Scene Renderer (`renderBansungScene`)
// ============================================================================

type ExtendedBossSource = (Partial<InterpBoss> & Partial<BansungBossFrame>) & {
  id: number;
  kind: BansungEnemyId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: number;
  state: number;
  telegraphs?: BansungTelegraphWire[];
  weakPoints?: BansungWeakPointView[];
  wp?: BansungWeakPointView[];
  pylons?: BansungEmpPylon[];
  laserLanes?: BansungLaserLane[];
  lanes?: BansungLaserLane[];
  facingLeft?: boolean;
  hitFlash?: boolean;
  z?: number;
  parts?: BansungBossPartView[];
  unlockedSkills?: string[];
  hpBars?: number;
  scale?: number;
  splitTier?: number;
};

function assignBossView(
  dst: ExtendedBossView,
  raw: ExtendedBossSource,
  frameFallback: ExtendedBossSource | undefined,
  nowSec: number,
): void {
  const aim =
    typeof raw.aim === 'number'
      ? raw.aim
      : typeof raw.aimQ === 'number'
        ? dequantizeAim(raw.aimQ)
        : 0;
  dst.id = raw.id;
  dst.kind = raw.kind;
  dst.x = raw.x;
  dst.y = raw.y;
  dst.hp = raw.hp;
  dst.maxHp = raw.maxHp;
  dst.phase = raw.phase;
  dst.state = raw.state;
  dst.aim = aim;
  dst.telegraph = raw.telegraph ?? frameFallback?.telegraph ?? 0;
  dst.stagger = raw.stagger ?? frameFallback?.stagger ?? 0;
  dst.maxStagger = raw.maxStagger ?? frameFallback?.maxStagger ?? 100;
  dst.facingLeft = raw.facingLeft ?? Math.cos(aim) < 0;
  dst.hitFlash = Boolean(raw.hitFlash);
  dst.stunned = raw.state === BANSUNG_STATE_STUN;
  dst.burning = false;
  dst.shielded = false;
  dst.weakPoints = raw.weakPoints ?? raw.wp ?? frameFallback?.weakPoints ?? frameFallback?.wp;
  dst.pylons = raw.pylons ?? frameFallback?.pylons;
  dst.laserLanes = raw.laserLanes ?? raw.lanes ?? frameFallback?.laserLanes ?? frameFallback?.lanes;
  dst.telegraphs = raw.telegraphs ?? frameFallback?.telegraphs;
  dst.parts = raw.parts ?? frameFallback?.parts;
  dst.unlockedSkills = raw.unlockedSkills ?? frameFallback?.unlockedSkills;
  dst.hpBars = raw.hpBars ?? frameFallback?.hpBars;
  dst.scale = raw.scale ?? frameFallback?.scale ?? 1;
  dst.splitTier = raw.splitTier ?? frameFallback?.splitTier ?? 0;
  dst.z =
    raw.z ??
    (raw.kind === 'boss_overlord'
      ? 18 + Math.sin(nowSec * 3.2) * 3
      : raw.kind === 'boss_beholder' && raw.state === BANSUNG_STATE_DASH
        ? Math.max(0, Math.sin((clamp(dst.telegraph, 0, 100) / 100) * Math.PI) * 44)
        : 0);
}

export function renderBansungScene(
  ctx: CanvasRenderingContext2D,
  o: RenderOpts,
): void {
  bindAssetLoadListener();

  const store = o.store ?? bansungStore;
  const dpr = clamp(o.dpr || 1, 1, RENDER_CFG.DPR_CAP);
  const w = Math.max(1, o.w);
  const h = Math.max(1, o.h);
  const nowMs =
    o.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const rawDtMs = lastFrameMs > 0 ? clamp(nowMs - lastFrameMs, 0, 50) : 16.67;
  lastFrameMs = nowMs;

  if (!o.skipStoreStep) {
    store.step(nowMs);
  }

  // Step motion juice, pooled particles, VFX, and local floating numbers
  bansungMotion.step(rawDtMs, nowMs);
  const visualNowMs = bansungMotion.getVisualTimeMs();
  const hitstopActive = bansungMotion.getCameraJuice().hitstopRemMs > 0;
  const effDtMs = hitstopActive ? rawDtMs * 0.15 : rawDtMs;
  const effDtSec = effDtMs * 0.001;
  const nowSec = visualNowMs * 0.001;

  bansungFx.step(effDtMs);
  bansungVfx.step(effDtSec, visualNowMs);
  stepLocalPools(effDtMs);

  // Locate local player & viewer anchor
  let localPlayer: InterpPlayer | null = null;
  if (store.myIdx !== undefined) {
    for (const p of store.players.values()) {
      if (p.idx === store.myIdx) {
        localPlayer = p;
        break;
      }
    }
  }
  if (!localPlayer) {
    for (const p of store.players.values()) {
      if (p.id === o.myPlayerId) {
        localPlayer = p;
        break;
      }
    }
  }

  const viewerPos = {
    x: localPlayer ? store.localDrawX : o.cam.x,
    y: localPlayer ? store.localDrawY : o.cam.y,
  };

  // Drain pending one-shot delta FX events and route to VFX/Audio/Damage numbers
  const pendingFx = store.drainFx();
  if (pendingFx.length > 0) {
    processBansungFxEvents(pendingFx, {
      store,
      myPlayerId: o.myPlayerId,
      viewerPos,
      reducedFlash: o.reducedFlash,
      nowMs: visualNowMs,
      motionNowMs: nowMs,
      skipAudio: o.skipAudio,
    });
  }

  // Sync bullets (zero-GC scratch array) & optional frame pets
  bulletScratch.length = 0;
  for (const b of store.bullets.values()) {
    bulletScratch.push(b);
  }
  bansungVfx.syncBullets(bulletScratch, effDtSec);
  syncFramePetsIfPresent(store, effDtSec, visualNowMs);

  const biome = store.biome || 'desert';

  // Sync hero dash trackers & drain dust ring puffs into bansungFx
  seenPlayerIds.clear();
  for (const p of store.players.values()) {
    seenPlayerIds.add(p.id);
    const isLocal = p === localPlayer;
    const px = isLocal ? store.localDrawX : p.x;
    const py = isLocal ? store.localDrawY : p.y;
    const heroId = BANSUNG_HERO_IDS[p.heroIdx] ?? 'ranger';
    bansungMotion.syncHeroDash({
      entityId: p.id,
      heroId,
      x: px,
      footY: py,
      flags: p.flags,
      aimRad: isLocal ? store.localAimRad : p.aim,
      state: p.state as BansungUnitState,
      nowMs,
      biome,
    });
  }
  bansungHeroAnim.pruneMissing(seenPlayerIds);
  bansungMotion.drainDashPuffHints((puff) => {
    const puffCount = Math.max(1, puff.count ?? 1);
    const puffColor =
      puff.biome === 'cyber'
        ? FxColor.CyberTeal
        : puff.biome === 'crypt'
          ? FxColor.Ash
          : FxColor.Sand;
    for (let k = 0; k < puffCount; k++) {
      const spread = (k - (puffCount - 1) * 0.5) * 4;
      bansungFx.spawnParticle(FxKind.Dust, puff.x + spread, puff.footY + (k & 1) * 2, {
        vx: puff.dirX * (32 + k * 6),
        vy: puff.dirY * (22 + k * 4),
        lifeMs: 260,
        size: 4,
        colorIdx: puffColor,
        layer: FxLayer.World,
        prio: FxPrio.Low,
      });
    }
  });

  // ── PASS 0: Biome Abyss Clear, Pixel Camera Transform & 512×512 Terrain Chunks ──
  drawCallsLastFrame = 0;
  glowQueueCount = 0;
  sortItemsLastFrame = 0;

  const zoom = clamp(o.cam.zoom || RENDER_CFG.WORLD_ZOOM_BASE, 0.5, 4);
  const juice = bansungMotion.getCameraJuice();
  const totalCamX = o.cam.x + o.cam.shakeX + juice.offsetX;
  const totalCamY = o.cam.y + o.cam.shakeY + juice.offsetY;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BIOME_ABYSS[biome] ?? BIOME_ABYSS.desert;
  ctx.fillRect(0, 0, w, h);

  // Snap camera translation to integer CSS pixels to prevent pixel-grid shimmering
  const tx = Math.round(w * 0.5 - totalCamX * zoom);
  const ty = Math.round(h * 0.5 - totalCamY * zoom);

  ctx.save();
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, tx * dpr, ty * dpr);
  ctx.imageSmoothingEnabled = false;

  const halfWorldW = (w * 0.5) / zoom;
  const halfWorldH = (h * 0.5) / zoom;
  const pad = RENDER_CFG.CULL_PAD_PX;
  const vx0 = totalCamX - halfWorldW - pad;
  const vy0 = totalCamY - halfWorldH - pad;
  const vx1 = totalCamX + halfWorldW + pad;
  const vy1 = totalCamY + halfWorldH + pad;

  const mapW = store.mapW || BANSUNG_MAP_W;
  const mapH = store.mapH || BANSUNG_MAP_H;
  const chunkSz = RENDER_CFG.CHUNK_SIZE;
  const cx0 = Math.max(0, Math.floor(vx0 / chunkSz));
  const cy0 = Math.max(0, Math.floor(vy0 / chunkSz));
  const cx1 = Math.min(Math.floor(Math.max(0, mapW - 1) / chunkSz), Math.floor(vx1 / chunkSz));
  const cy1 = Math.min(Math.floor(Math.max(0, mapH - 1) / chunkSz), Math.floor(vy1 / chunkSz));

  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const chunk = getOrBakeTerrainChunk(biome, store.arenaSeed, mapW, mapH, cx, cy);
      if (chunk) {
        ctx.drawImage(chunk, cx * chunkSz, cy * chunkSz);
        drawCallsLastFrame++;
      }
    }
  }

  // Gather viewport-culled obstacles, props, pickups & enemies once for Passes 1–4
  visibleObstaclesScratch.length = 0;
  for (let i = 0; i < store.obstacles.length; i++) {
    const ob = store.obstacles[i];
    if (ob.x + ob.w < vx0 || ob.x > vx1 || ob.y + ob.h < vy0 || ob.y > vy1) continue;
    visibleObstaclesScratch.push(ob);
  }

  visiblePropsScratch.length = 0;
  for (let i = 0; i < store.props.length; i++) {
    const p = store.props[i];
    if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
    visiblePropsScratch.push(p);
  }

  visiblePickupsScratch.length = 0;
  for (let i = 0; i < store.pickups.length; i++) {
    const pk = store.pickups[i];
    if (pk.x < vx0 || pk.x > vx1 || pk.y < vy0 || pk.y > vy1) continue;
    visiblePickupsScratch.push(pk);
  }

  // Normalize active boss views (primary boss + optional bs2 + enemy-list fallback)
  const storeExt = store as BansungStore & {
    hazards?: readonly BansungHazardWire[];
    telegraphs?: readonly BansungTelegraphWire[];
    bosses?: readonly ExtendedBossSource[];
  };
  const rawBoss = store.boss as ExtendedBossSource | undefined;
  const frameBoss = store.frame?.bs as ExtendedBossSource | undefined;

  activeBossCount = 0;
  for (let i = 0; i < bossRenderViews.length; i++) {
    bossRenderViews[i].id = 0;
  }
  if (rawBoss && rawBoss.maxHp > 0) {
    assignBossView(bossRenderViews[0], rawBoss, frameBoss, nowSec);
    activeBossCount = 1;
  } else if (frameBoss && frameBoss.maxHp > 0) {
    assignBossView(bossRenderViews[0], frameBoss, undefined, nowSec);
    activeBossCount = 1;
  }

  const extraBosses =
    storeExt.bosses ?? (store.frame?.bs2 as readonly ExtendedBossSource[] | undefined);
  if (extraBosses && extraBosses.length > 0) {
    for (let i = 0; i < extraBosses.length; i++) {
      if (activeBossCount >= bossRenderViews.length) break;
      const src = extraBosses[i];
      if (!src || src.maxHp <= 0) continue;
      let duplicate = false;
      for (let bi = 0; bi < activeBossCount; bi++) {
        if (bossRenderViews[bi].id === src.id) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) continue;
      assignBossView(bossRenderViews[activeBossCount++], src, undefined, nowSec);
    }
  }

  visibleEnemiesScratch.length = 0;
  activeDronesScratch.length = 0;
  for (const e of store.enemies.values()) {
    const spec = BANSUNG_ENEMIES[e.enemyId];
    if (spec?.isBoss && e.enemyId !== 'iron_drone') {
      let matchedView: ExtendedBossView | null = null;
      for (let bi = 0; bi < activeBossCount; bi++) {
        const bv = bossRenderViews[bi];
        if (bv.id === e.id || (activeBossCount === 1 && bv.kind === e.enemyId)) {
          matchedView = bv;
          break;
        }
      }
      if (matchedView) {
        // Merge live bitflags onto matching bossRenderView and avoid duplicate sprite draw
        matchedView.hitFlash = (e.flags & BANSUNG_EFLAG_HIT_FLASH) !== 0;
        matchedView.stunned =
          (e.flags & BANSUNG_EFLAG_STUNNED) !== 0 || matchedView.state === BANSUNG_STATE_STUN;
        matchedView.burning = (e.flags & BANSUNG_EFLAG_BURNING) !== 0;
        matchedView.shielded = (e.flags & BANSUNG_EFLAG_SHIELDED) !== 0;
        matchedView.facingLeft = (e.flags & BANSUNG_EFLAG_LEFT) !== 0 || e.facingLeft;
        continue;
      }
      if (activeBossCount < bossRenderViews.length) {
        const bv = bossRenderViews[activeBossCount++];
        bv.id = e.id;
        bv.kind = e.enemyId;
        bv.x = e.x;
        bv.y = e.y;
        bv.hp = e.hpPct;
        bv.maxHp = 100;
        bv.phase = 1;
        bv.state = e.state;
        bv.aim = e.aim;
        bv.telegraph = (e.flags & BANSUNG_EFLAG_TELEGRAPH) !== 0 ? 50 : 0;
        bv.stagger = 0;
        bv.maxStagger = 100;
        bv.facingLeft = (e.flags & BANSUNG_EFLAG_LEFT) !== 0 || e.facingLeft;
        bv.hitFlash = (e.flags & BANSUNG_EFLAG_HIT_FLASH) !== 0;
        bv.stunned =
          (e.flags & BANSUNG_EFLAG_STUNNED) !== 0 || e.state === BANSUNG_STATE_STUN;
        bv.burning = (e.flags & BANSUNG_EFLAG_BURNING) !== 0;
        bv.shielded = (e.flags & BANSUNG_EFLAG_SHIELDED) !== 0;
        bv.weakPoints = undefined;
        bv.pylons = undefined;
        bv.laserLanes = undefined;
        bv.telegraphs = undefined;
        bv.z = e.enemyId === 'boss_overlord' ? 18 + Math.sin(nowSec * 3.2) * 3 : 0;
        continue;
      }
    }

    const enemyKey: string = e.enemyId;
    if (enemyKey === 'iron_drone' && e.state !== BANSUNG_STATE_DEAD) {
      activeDronesScratch.push(e);
    }
    if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) continue;
    visibleEnemiesScratch.push(e);
  }
  const hasBoss = activeBossCount > 0;
  const activeHazards = storeExt.hazards ?? store.frame?.hz;
  const activeTelegraphs = storeExt.telegraphs ?? store.frame?.tg;

  // ── PASS 1: Decals, Dust Rings, Ground Hazards & Telegraphs ───────────────────
  renderedBossTelegraphCount = 0;
  activeBossBeamCount = 0;
  bansungFx.drawDecals(ctx, vx0, vy0, vx1, vy1);
  bansungMotion.drawDustRings(ctx);
  bansungVfx.drawGroundPass(ctx, visualNowMs);
  if (activeHazards && activeHazards.length > 0) {
    drawActiveGroundHazards(ctx, activeHazards, vx0, vy0, vx1, vy1, nowSec);
  }

  // Co-op Downed Revive Circles (r = 72px)
  for (const p of store.players.values()) {
    if (p.state !== BANSUNG_STATE_DOWNED) continue;
    const r = REVIVE_RING_RADIUS;
    const pct = clamp((p.revivePct ?? 0) / 100, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(nowSec * 6);
    const rx = Math.round(p.x);
    const ry = Math.round(p.y);

    ctx.save();
    ctx.fillStyle = pct > 0 ? 'rgba(81, 207, 102, 0.14)' : 'rgba(252, 196, 25, 0.10)';
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, TWO_PI);
    ctx.fill();

    ctx.strokeStyle = pct > 0 ? '#51cf66' : `rgba(252, 196, 25, ${(0.55 + 0.35 * pulse).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash(pct > 0 ? [] : [8, 6]);
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, TWO_PI);
    ctx.stroke();

    if (pct > 0) {
      ctx.strokeStyle = '#d3f9d8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, r - 3, -Math.PI * 0.5, -Math.PI * 0.5 + pct * TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Drone heal auras & Mine trigger rings on props
  for (let i = 0; i < visiblePropsScratch.length; i++) {
    const p = visiblePropsScratch[i];
    const k = BANSUNG_PROP_IDS[p.kindIdx];
    if (k === 'drone') {
      ctx.save();
      ctx.strokeStyle = 'rgba(32, 201, 151, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(Math.round(p.x), Math.round(p.y), 110, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    } else if (k === 'mine') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 77, 79, 0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(Math.round(p.x), Math.round(p.y), 42, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Mob ground telegraphs (Bomb Goblin fuse circle, Brute slam ring, Sniper laser sight, Caster sigils)
  for (let i = 0; i < visibleEnemiesScratch.length; i++) {
    const e = visibleEnemiesScratch[i];
    if (e.state === BANSUNG_STATE_DEAD) continue;
    const isTel = (e.flags & BANSUNG_EFLAG_TELEGRAPH) !== 0;
    if (!isTel && !(e.enemyId === 'bomb_goblin' && e.state === BANSUNG_STATE_ATK)) {
      continue;
    }

    if (e.enemyId === 'bomb_goblin') {
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * 16);
      ctx.save();
      ctx.fillStyle = `rgba(255, 77, 79, ${(0.12 + 0.14 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y), 88, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else if (e.enemyId === 'cactus_brute') {
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * 14);
      ctx.save();
      ctx.fillStyle = `rgba(255, 146, 43, ${(0.14 + 0.14 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y), 76, 0, TWO_PI);
      ctx.fill();
      ctx.strokeStyle = '#ff922b';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else if (e.enemyId === 'laser_sniper') {
      const hit = raycastObstacles(
        e.x,
        e.y - 16,
        e.aim,
        680,
        store.obstacles,
        mapW,
        mapH,
      );
      ctx.save();
      ctx.strokeStyle = ((Math.floor(nowMs / 60) & 1) === 0) ? '#ff2e63' : '#ff8787';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(e.x), Math.round(e.y - 16));
      ctx.lineTo(Math.round(hit.ex), Math.round(hit.ey));
      ctx.stroke();
      ctx.restore();
    } else if (e.enemyId === 'pyro_shaman' || e.enemyId === 'thunder_mage') {
      ctx.save();
      ctx.strokeStyle = e.enemyId === 'thunder_mage' ? '#38bdf8' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(Math.round(e.x), Math.round(e.y), 26, 0, TWO_PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Boss ground telegraphs, Overlord laser grid & EMP pylon ground rings
  for (let bi = 0; bi < activeBossCount; bi++) {
    const bv = bossRenderViews[bi];
    if (bv.id === 0 || bv.state === BANSUNG_STATE_DEAD) continue;
    if (bv.telegraphs && bv.telegraphs.length > 0) {
      drawStandardTelegraphs(ctx, bv.telegraphs, nowSec, { recordBoss: true });
    }
    if (bv.laserLanes && bv.laserLanes.length > 0) {
      drawBossLaserLanesGround(ctx, bv.laserLanes, nowSec);
    }

    // Colossus Iron Drone tethers
    if (bv.kind === 'boss_colossus' && activeDronesScratch.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 212, 59, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -(nowSec * 32);
      for (let i = 0; i < activeDronesScratch.length; i++) {
        const d = activeDronesScratch[i];
        ctx.beginPath();
        ctx.moveTo(Math.round(bv.x), Math.round(bv.y - 42));
        ctx.lineTo(Math.round(d.x), Math.round(d.y - 16));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Compact-frame fallback boss telegraphs when explicit telegraphs[] omitted
    const telPct = clamp(bv.telegraph, 0, 100) / 100;
    const hasWorldTelegraphs = Boolean(activeTelegraphs && activeTelegraphs.length > 0);
    if (
      !hasWorldTelegraphs &&
      bv.kind === 'boss_beholder' &&
      (!bv.telegraphs || bv.telegraphs.length === 0)
    ) {
      if (bv.state === BANSUNG_STATE_DASH) {
        const rad = bv.phase >= 2 ? 170 : 155;
        ctx.save();
        ctx.fillStyle = `rgba(255, 77, 79, ${(0.08 + 0.14 * telPct).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(Math.round(bv.x), Math.round(bv.y), rad, 0, TWO_PI);
        ctx.fill();
        ctx.strokeStyle = '#ff4d4f';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      } else if (bv.state === BANSUNG_STATE_ATK && telPct > BOSS_FRAME_EPS) {
        const ray = raycastObstacles(
          bv.x,
          bv.y - 36,
          bv.aim,
          640,
          store.obstacles,
          mapW,
          mapH,
        );
        ctx.save();
        ctx.strokeStyle = telPct > 0.72 ? '#ffffff' : '#ff2e63';
        ctx.lineWidth = telPct > 0.72 ? 3 : 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(Math.round(bv.x), Math.round(bv.y - 36));
        ctx.lineTo(Math.round(ray.ex), Math.round(ray.ey));
        ctx.stroke();
        ctx.restore();
      }
    } else if (
      !hasWorldTelegraphs &&
      bv.kind === 'boss_colossus' &&
      (!bv.telegraphs || bv.telegraphs.length === 0) &&
      bv.state === BANSUNG_STATE_DASH
    ) {
      const len = 408;
      const halfW = 34;
      ctx.save();
      ctx.translate(bv.x, bv.y);
      ctx.rotate(bv.aim);
      ctx.fillStyle = 'rgba(255, 146, 43, 0.18)';
      ctx.fillRect(0, -halfW, len, halfW * 2);
      ctx.strokeStyle = '#ff922b';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(0, -halfW, len, halfW * 2);
      ctx.restore();
    }

    // Overlord EMP Pylon pulse warning rings
    if (bv.pylons && bv.pylons.length > 0) {
      for (let i = 0; i < bv.pylons.length; i++) {
        const py = bv.pylons[i];
        if (py.hp <= 0) continue;
        const charge01 = clamp((py.chargeQ ?? 0) / 100, 0, 1);
        const r = OVERLORD_EMP_PULSE_RADIUS;
        ctx.save();
        ctx.strokeStyle = charge01 > 0.8 ? '#ffffff' : 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = charge01 > 0.8 ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(Math.round(py.x), Math.round(py.y), r, 0, TWO_PI);
        ctx.stroke();
        ctx.fillStyle = `rgba(56, 189, 248, ${(0.05 + 0.14 * charge01).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(Math.round(py.x), Math.round(py.y), r * charge01, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // All server ground telegraphs (mob windups/lasers/cones/rings, artillery, spawn gates & boss telegraphs)
  if (activeTelegraphs && activeTelegraphs.length > 0) {
    drawStandardTelegraphs(ctx, activeTelegraphs, nowSec, { skipRecordedBoss: true });
  }

  // Co-op tactical pings on floor
  drawWorldPings(ctx, store.pings, nowMs);

  // ── PASS 2: Pre-Y-Sort Contact Shadows (Strictly Under All Pass-3 Sprites) ───
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < visibleObstaclesScratch.length; i++) {
    const ob = visibleObstaclesScratch[i];
    drawPixelEllipse(ctx, ob.x + ob.w * 0.5 + 3, ob.y + ob.h + 1, ob.w * 0.52, 7, DEEP_INK, 0.36);
  }

  for (let i = 0; i < visiblePropsScratch.length; i++) {
    const prop = visiblePropsScratch[i];
    const kind = BANSUNG_PROP_IDS[prop.kindIdx] ?? 'crate';
    if (kind === 'drone') {
      drawContactShadow(ctx, prop.x, prop.y + 1, 22, 9, 0.36);
    } else if (kind === 'mine') {
      drawContactShadow(ctx, prop.x, prop.y + 1, 16, 7, 0.35);
    } else if (kind === 'cactus' || kind === 'pillar') {
      drawContactShadow(ctx, prop.x, prop.y + 1, 32, 13, 0.45);
    } else {
      drawContactShadow(ctx, prop.x, prop.y + 1, 34, 14, 0.45);
    }
  }

  for (let i = 0; i < visiblePickupsScratch.length; i++) {
    const pk = visiblePickupsScratch[i];
    const kind = resolvePickupKind(pk.kindIdx);
    if (kind === 'weapon_pedestal' || kind === 'weapon') {
      drawContactShadow(ctx, pk.x, pk.y + 1, 36, 14, 0.45);
    } else if (kind === 'xp_orb_s') {
      drawContactShadow(ctx, pk.x, pk.y + 1, 12, 5, 0.3);
    } else if (kind === 'xp_orb_m' || kind === 'xp') {
      drawContactShadow(ctx, pk.x, pk.y + 1, 16, 6, 0.34);
    } else if (kind === 'xp_orb_l') {
      drawContactShadow(ctx, pk.x, pk.y + 1, 20, 8, 0.38);
    } else {
      drawContactShadow(ctx, pk.x, pk.y + 1, 18, 7, 0.34);
    }
  }

  for (const p of store.players.values()) {
    const isLocal = p === localPlayer;
    const px = isLocal ? store.localDrawX : p.x;
    const py = isLocal ? store.localDrawY : p.y;
    if (px < vx0 || px > vx1 || py < vy0 || py > vy1) continue;
    const heroId = BANSUNG_HERO_IDS[p.heroIdx] ?? 'ranger';
    const isDownOrDead = p.state === BANSUNG_STATE_DEAD || p.state === BANSUNG_STATE_DOWNED;
    drawHeroShadow(ctx, {
      x: px,
      y: py,
      heroId,
      shadowScale: isDownOrDead ? 0.72 : 1,
      alpha: isDownOrDead ? 0.22 : 0.45,
      teamRingColor: isLocal ? '#fde047' : p.state === BANSUNG_STATE_DOWNED ? '#fcc419' : '#38bdf8',
    });
    drawCallsLastFrame++;
  }

  for (let i = 0; i < visibleEnemiesScratch.length; i++) {
    const e = visibleEnemiesScratch[i];
    const isElite = (e.flags & BANSUNG_EFLAG_ELITE) !== 0;
    const isEvolved = (e.flags & BANSUNG_EFLAG_EVOLVED) !== 0;
    const sizeScale = isEvolved ? (isElite ? 1.24 : 1.18) : isElite ? 1.15 : 1;
    const enemyKey: string = e.enemyId;
    const sw =
      enemyKey === 'scarab'
        ? 22
        : enemyKey === 'cactus_brute' || enemyKey === 'shield_warden'
          ? 48
          : enemyKey === 'iron_drone' || enemyKey === 'shock_drone_mk2'
            ? 24
            : 32;
    const sh =
      enemyKey === 'scarab'
        ? 9
        : enemyKey === 'cactus_brute' || enemyKey === 'shield_warden'
          ? 18
          : enemyKey === 'iron_drone' || enemyKey === 'shock_drone_mk2'
            ? 9
            : 13;
    drawContactShadow(
      ctx,
      e.x,
      e.y + 1,
      sw * sizeScale,
      sh * sizeScale,
      e.state === BANSUNG_STATE_DEAD ? 0.22 : enemyKey === 'iron_drone' ? 0.32 : 0.46,
    );
  }

  for (let bi = 0; bi < activeBossCount; bi++) {
    const bv = bossRenderViews[bi];
    if (bv.id === 0) continue;
    const heightScale = clamp(1 - bv.z / 110, 0.55, 1);
    const scaleFactor = clamp(bv.scale ?? 1, 0.48, 2.2);
    const baseW = (bv.kind === 'boss_overlord' ? 106 : 92) * scaleFactor;
    const baseH = (bv.kind === 'boss_overlord' ? 42 : 36) * scaleFactor;
    drawContactShadow(
      ctx,
      bv.x,
      bv.y + 2,
      baseW * heightScale,
      baseH * heightScale,
      bv.state === BANSUNG_STATE_DEAD ? 0.25 : 0.52 * heightScale,
    );

    if (bv.pylons) {
      for (let i = 0; i < bv.pylons.length; i++) {
        const py = bv.pylons[i];
        if (py.hp <= 0) continue;
        drawContactShadow(ctx, py.x, py.y + 1, 44, 18, 0.45);
      }
    }
  }

  // ── PASS 3: Zero-GC Y-Sorted 2.5D Depth Pass ───────────────────────────────────
  for (let i = 0; i < visibleObstaclesScratch.length; i++) {
    const ob = visibleObstaclesScratch[i];
    const slot = pushSortItem(ob.y + ob.h, SortKind.Prop, 0, i, ob.x, ob.y, 0, 1);
    slot.tag = 'obstacle';
    slot.obstacle = ob;
  }

  for (let i = 0; i < visiblePropsScratch.length; i++) {
    const p = visiblePropsScratch[i];
    const slot = pushSortItem(p.y, SortKind.Prop, 1, p.id, p.x, p.y, 0, 1);
    slot.tag = 'prop';
    slot.prop = p;
  }

  for (let i = 0; i < visiblePickupsScratch.length; i++) {
    const pk = visiblePickupsScratch[i];
    const slot = pushSortItem(pk.y, SortKind.Pickup, 0, pk.id, pk.x, pk.y, 0, 1);
    slot.tag = 'pickup';
    slot.pickup = pk;
  }

  dashGhostSnapshotList.length = 0;
  bansungMotion.forEachActiveGhost((g) => {
    if (g.x >= vx0 && g.x <= vx1 && g.footY >= vy0 && g.footY <= vy1) {
      dashGhostSnapshotList.push(g);
    }
  });
  for (let i = 0; i < dashGhostSnapshotList.length; i++) {
    const g = dashGhostSnapshotList[i];
    const slot = pushSortItem(g.footY, SortKind.Ghost, 0, i, g.x, g.footY, 0, g.alpha);
    slot.tag = 'ghost';
    slot.ghost = g;
  }

  for (const p of store.players.values()) {
    const isLocal = p === localPlayer;
    const px = isLocal ? store.localDrawX : p.x;
    const py = isLocal ? store.localDrawY : p.y;
    if (px < vx0 || px > vx1 || py < vy0 || py > vy1) continue;
    const deadSub = p.state === BANSUNG_STATE_DEAD || p.state === BANSUNG_STATE_DOWNED ? -1 : 0;
    const slot = pushSortItem(py, SortKind.Hero, deadSub, p.id, px, py, 0, p.spawnAlpha);
    slot.tag = 'hero';
    slot.player = p;

    // Interleave active pet companion at pet's own Y coordinate
    const pet = bansungVfx.getPetState(p.id);
    if (pet && pet.active && pet.x >= vx0 && pet.x <= vx1 && pet.y >= vy0 && pet.y <= vy1) {
      const pSlot = pushSortItem(pet.y, SortKind.Pet, 0, p.id, pet.x, pet.y, pet.zArc, 1);
      pSlot.tag = 'pet';
      pSlot.pet = pet as PetVisualState;
    }
  }

  for (let i = 0; i < visibleEnemiesScratch.length; i++) {
    const e = visibleEnemiesScratch[i];
    const deadSub = e.state === BANSUNG_STATE_DEAD ? -1 : 0;
    const slot = pushSortItem(e.y, SortKind.Mob, deadSub, e.id, e.x, e.y, 0, e.spawnAlpha);
    slot.tag = 'mob';
    slot.enemy = e;
  }

  let wpPoolCursor = 0;
  let pyPoolCursor = 0;
  for (let bi = 0; bi < activeBossCount; bi++) {
    const bv = bossRenderViews[bi];
    if (bv.id === 0) continue;
    const bSlot = pushSortItem(
      bv.y,
      SortKind.Boss,
      bv.state === BANSUNG_STATE_DEAD ? -1 : 0,
      bv.id,
      bv.x,
      bv.y,
      bv.z,
      1,
    );
    bSlot.tag = 'boss';
    bSlot.boss = bv;

    // Overlord orbiting WeakPoint pods (Y-sorted against hull so front/back overlaps cleanly)
    if (bv.kind === 'boss_overlord' && bv.weakPoints) {
      const wpList = bv.weakPoints;
      for (let i = 0; i < wpList.length && wpPoolCursor < weakPointScratch.length; i++) {
        const src = wpList[i];
        if (src.hp <= 0) continue;
        const ang = dequantizeAim(src.angQ);
        const wpx = bv.x + Math.cos(ang) * OVERLORD_STATS.weakPointOrbitR;
        const wpy = bv.y + Math.sin(ang) * OVERLORD_STATS.weakPointOrbitR * 0.72;
        const dst = weakPointScratch[wpPoolCursor++];
        dst.idx = src.idx;
        dst.angQ = src.angQ;
        dst.hp = src.hp;
        dst.maxHp = src.maxHp;
        dst.x = wpx;
        dst.y = wpy;
        dst.bossId = bv.id;
        dst.bossX = bv.x;
        dst.bossY = bv.y - bv.z;
        dst.z = bv.z + 18;
        const wSlot = pushSortItem(
          wpy + 4,
          SortKind.Boss,
          1,
          1000 + bi * 16 + src.idx,
          wpx,
          wpy,
          dst.z,
          1,
        );
        wSlot.tag = 'weakpoint';
        wSlot.weakPoint = dst;
      }
    }

    // Overlord EMP pylons (Y-sorted against players & mobs)
    if (bv.pylons) {
      for (let i = 0; i < bv.pylons.length && pyPoolCursor < pylonScratch.length; i++) {
        const src = bv.pylons[i];
        if (src.hp <= 0) continue;
        const dst = pylonScratch[pyPoolCursor++];
        dst.id = src.id;
        dst.x = src.x;
        dst.y = src.y;
        dst.hp = src.hp;
        dst.maxHp = src.maxHp;
        dst.chargeQ = src.chargeQ;
        const pySlot = pushSortItem(src.y, SortKind.Prop, 2, src.id, src.x, src.y, 0, 1);
        pySlot.tag = 'pylon';
        pySlot.pylon = dst;
      }
    }
  }

  // Sort active pool indices in place with zero allocations
  if (sortItemsLastFrame > 1) {
    quickSortOrder(0, sortItemsLastFrame - 1);
  }

  // Draw all Y-sorted entities
  for (let sIdx = 0; sIdx < sortItemsLastFrame; sIdx++) {
    const slotIdx = sortOrder[sIdx];
    const payload = sortPayloads[slotIdx];
    switch (payload.tag) {
      case 'obstacle':
        if (payload.obstacle) {
          drawStaticObstacle25D(ctx, payload.obstacle, biome, nowSec);
        }
        break;

      case 'prop':
        if (payload.prop) {
          drawSnapProp(ctx, payload.prop, biome, nowSec, nowMs);
        }
        break;

      case 'pickup':
        if (payload.pickup) {
          drawSnapPickup(ctx, payload.pickup, localPlayer, nowSec, nowMs);
        }
        break;

      case 'ghost':
        if (payload.ghost) {
          const clipKey = resolveHeroClipKey(payload.ghost.heroId, 'dash');
          const meta = getClipMeta(clipKey);
          const img = meta ? getSpriteImage(meta.url) : null;
          if (meta && img && img.complete && img.naturalWidth > 0) {
            const rect = resolveFrameRect(meta, payload.ghost.frameIdx, img.naturalWidth, img.naturalHeight);
            if (rect) {
              drawDashGhost(ctx, payload.ghost, {
                source: img,
                srcX: rect.sx,
                srcY: rect.sy,
                cellW: rect.sw,
                cellH: rect.sh,
                offX: meta.offX,
                offY: meta.offY,
                nativeFacing: meta.nativeFacing,
                pixelScale: meta.nativeFacing === 'left' ? 1 : undefined,
              });
            } else {
              drawDashGhost(ctx, payload.ghost, {
                nativeFacing: meta.nativeFacing,
                pixelScale: meta.nativeFacing === 'left' ? 1 : undefined,
              });
            }
          } else {
            drawDashGhost(ctx, payload.ghost);
          }
          drawCallsLastFrame++;
        }
        break;

      case 'hero':
        if (payload.player) {
          const p = payload.player;
          const isLocal = p === localPlayer;
          const drawX = isLocal ? store.localDrawX : p.x;
          const drawY = isLocal ? store.localDrawY : p.y;
          const aimRad = isLocal ? store.localAimRad : p.aim;
          const targetX = isLocal ? o.aimWorldX : undefined;
          const targetY = isLocal ? o.aimWorldY : undefined;
          const weaponId =
            isLocal && store.me
              ? store.me.slots[store.me.slotIdx]?.id
              : getWeaponByIdx(p.weaponIdx)?.id;
          const localWeaponIdx = weaponId ? getWeaponSpec(weaponId).idx : p.weaponIdx;
          const activeTier: BansungWeaponTier =
            isLocal && store.me?.weaponTiers
              ? normalizeWeaponTier(store.me.weaponTiers[store.me.slotIdx] ?? p.weaponTier)
              : normalizeWeaponTier(p.weaponTier);

          let stunJitterX = 0;
          let stunJitterY = 0;
          let stunCyan = 0;
          if (p.state === BANSUNG_STATE_STUN) {
            const stunFlashAnchorMs =
              p.hitFlashAt > 0
                ? visualNowMs - clamp(nowMs - p.hitFlashAt, 0, 5000)
                : Math.max(0, visualNowMs - 180);
            const sp = resolveStunPose(p.id, 0, stunFlashAnchorMs, false, visualNowMs);
            stunJitterX = sp.jx;
            stunJitterY = sp.jy;
            stunCyan = sp.cyanAlpha;
          }

          const invulnBlink =
            (p.flags & BANSUNG_PFLAG_INVULN) !== 0 && ((Math.floor(nowMs / 65) & 1) === 1);
          const hitFlash =
            (p.flags & BANSUNG_PFLAG_HIT_FLASH) !== 0 || p.hitFlashAt > nowMs - 110;
          const tint = hitFlash ? 'white' : stunCyan > 0.16 ? 'cyan' : undefined;

          // Build light transient draw proxy ONLY when local player overrides coords/aim
          if (isLocal) {
            const proxy: InterpPlayer = {
              ...p,
              x: drawX + stunJitterX,
              y: drawY + stunJitterY,
              aim: aimRad,
              weaponIdx: localWeaponIdx >= 0 ? localWeaponIdx : p.weaponIdx,
              weaponTier: activeTier,
              facingLeft: Math.cos(aimRad) < 0,
              spawnAlpha: invulnBlink ? p.spawnAlpha * 0.45 : p.spawnAlpha,
            };
            bansungHeroAnim.drawPlayer(ctx, proxy, {
              targetX,
              targetY,
              weaponTier: activeTier,
              dtMs: effDtMs,
              visualTimeMs: visualNowMs,
              drawShadow: false,
              tint,
            });
          } else {
            const prevX = p.x;
            const prevY = p.y;
            const prevAlpha = p.spawnAlpha;
            p.x = drawX + stunJitterX;
            p.y = drawY + stunJitterY;
            if (invulnBlink) p.spawnAlpha *= 0.45;
            bansungHeroAnim.drawPlayer(ctx, p, {
              targetX,
              targetY,
              weaponTier: activeTier,
              dtMs: effDtMs,
              visualTimeMs: visualNowMs,
              drawShadow: false,
              tint,
            });
            p.x = prevX;
            p.y = prevY;
            p.spawnAlpha = prevAlpha;
          }
          if (
            (p.flags & BANSUNG_PFLAG_SHIELD_BARRIER) !== 0 &&
            p.state !== BANSUNG_STATE_DEAD &&
            p.state !== BANSUNG_STATE_DOWNED
          ) {
            const remMs = isLocal && store.me ? (store.me.shieldBuffMs ?? 0) : 30_000;
            const expiringBlink =
              remMs > 0 && remMs <= 3000 ? 0.45 + 0.55 * (Math.floor(nowMs / 110) & 1) : 1;
            const sx = drawX + stunJitterX;
            const sy = drawY + stunJitterY - 12;
            const br = 24 + Math.sin(nowSec * 5.2) * 1.2;
            ctx.save();
            ctx.globalAlpha = 0.24 * expiringBlink;
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(sx, sy, br, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.88 * expiringBlink;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, br, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 1.6;
            const arcSpin = nowSec * 2.8;
            ctx.beginPath();
            ctx.arc(sx, sy, br + 3, arcSpin, arcSpin + 1.35);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx, sy, br + 3, arcSpin + Math.PI, arcSpin + Math.PI + 1.35);
            ctx.stroke();
            ctx.restore();
            queueGlow('cyan', sx, sy, 34, 0.24 * expiringBlink);
          }
          if (activeTier >= 2 && p.state !== BANSUNG_STATE_DEAD && p.state !== BANSUNG_STATE_DOWNED) {
            const glowCol: GlowColor =
              activeTier === 2 ? 'cyan' : activeTier === 3 ? 'violet' : 'fire';
            queueGlow(
              glowCol,
              drawX + Math.cos(aimRad) * 14,
              drawY - 14 + Math.sin(aimRad) * 10,
              18 + activeTier * 5,
              0.16 + activeTier * 0.05,
            );
          }
          if (
            p.state !== BANSUNG_STATE_DEAD &&
            p.state !== BANSUNG_STATE_DOWNED &&
            store.skillOrbs.length > 0
          ) {
            let playerOrbs: SnapPlayerOrbs | undefined;
            for (let oi = 0; oi < store.skillOrbs.length; oi++) {
              if (store.skillOrbs[oi].playerIdx === p.idx) {
                playerOrbs = store.skillOrbs[oi];
                break;
              }
            }
            drawHeroGachaOrbsAndMagnet(
              ctx,
              drawX + stunJitterX,
              drawY + stunJitterY - 12,
              playerOrbs,
              store.spiritSwords.length > 0,
              nowSec,
            );
          }
          drawCallsLastFrame += 2;
        }
        break;

      case 'pet':
        if (payload.pet) {
          drawPetMagnetTether(ctx, payload.pet, visualNowMs);
          drawPetCompanion(ctx, payload.pet, visualNowMs);
          drawCallsLastFrame += 2;
        }
        break;

      case 'mob':
        if (payload.enemy) {
          drawMobEntity(ctx, payload.enemy, nowSec, nowMs);
        }
        break;

      case 'boss':
        if (payload.boss) {
          drawBossEntity(ctx, payload.boss, activeDronesScratch, nowSec, nowMs);
        }
        break;

      case 'weakpoint':
        if (payload.weakPoint) {
          drawWeakPointNode(
            ctx,
            payload.weakPoint,
            payload.weakPoint.bossX,
            payload.weakPoint.bossY,
            nowSec,
          );
        }
        break;

      case 'pylon':
        if (payload.pylon) {
          drawEmpPylonEntity(ctx, payload.pylon, nowSec);
        }
        break;
    }
  }

  // ── PASS 4: Z-Arc Bombs, Projectiles, Particles, Slashes, Micro-HUD & Reticle ──
  bansungVfx.drawBombPass(ctx, visualNowMs);
  bansungVfx.drawProjectilePass(ctx, bulletScratch, nowSec);
  bansungFx.drawAirborneDecals(ctx, vx0, vy0, vx1, vy1);
  bansungFx.drawLayer(ctx, FxLayer.World, vx0, vy0, vx1, vy1, visualNowMs);
  drawMeleeSlashes(ctx, false);
  drawSpiritSwords(ctx, store.spiritSwords, nowSec);
  drawWorldMicroHud(ctx, store, localPlayer, visibleEnemiesScratch, visualNowMs);

  if (o.showCrosshair !== false) {
    const iv = bansungInput.getViewState();
    drawAimReticle(
      ctx,
      o.aimWorldX,
      o.aimWorldY,
      iv.autoAimTargetId,
      iv.autoAimTargetX,
      iv.autoAimTargetY,
      nowSec,
    );
  }

  // ── PASS 5: Single Additive Glow Pass (`globalCompositeOperation = 'lighter'`) ──
  const stamps = ensureGlowStamps();
  const fxDegraded = bansungFx.stats().degraded;
  ctx.save();
  ctx.globalCompositeOperation = fxDegraded ? 'source-over' : 'lighter';
  ctx.imageSmoothingEnabled = false;

  bansungVfx.drawAdditivePass(ctx, visualNowMs);
  bansungFx.drawLayer(ctx, FxLayer.Additive, vx0, vy0, vx1, vy1, visualNowMs);
  drawMeleeSlashes(ctx, true);

  // Active Boss Master-Spark Lasers (all 9 bosses' active beams + Overlord active laserLanes)
  drawActiveBossMasterSparkBeams(ctx, nowSec);

  if (stamps && glowQueueCount > 0) {
    for (let i = 0; i < glowQueueCount; i++) {
      const g = glowQueue[i];
      const stamp = stamps[g.color];
      if (!stamp) continue;
      const d = g.radius * 2;
      ctx.globalAlpha = g.alpha;
      ctx.drawImage(stamp, Math.round(g.x - g.radius), Math.round(g.y - g.radius), d, d);
      drawCallsLastFrame++;
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // ── PASS 7 (World Space): Outlined Floating Damage Numbers & Pooled FX Text ───
  drawOutlinedDamageNumbers(ctx, vx0, vy0, vx1, vy1);
  bansungFx.drawTexts(ctx, vx0, vy0, vx1, vy1);

  // Restore world camera transform before screen-space overlays
  ctx.restore();

  // ── PASS 6: Screen-Space Low-HP Vignette & Capped Flash Overlay ────────────────
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  if (localPlayer) {
    const heroId = BANSUNG_HERO_IDS[localPlayer.heroIdx] ?? 'ranger';
    const maxHp = store.me?.maxHp ?? resolveHeroMaxHp(heroId, 60);
    const lowHp =
      localPlayer.state !== BANSUNG_STATE_DEAD &&
      localPlayer.hp > 0 &&
      localPlayer.hp / Math.max(1, maxHp) <= 0.3;
    const downed = localPlayer.state === BANSUNG_STATE_DOWNED;

    if (lowHp || downed) {
      const vig = ensureVignetteCanvas(w, h);
      if (vig) {
        const pulse = 0.32 + 0.22 * (0.5 + 0.5 * Math.sin(nowSec * 5.2));
        ctx.save();
        ctx.globalAlpha = downed ? 0.55 : pulse;
        ctx.drawImage(vig, 0, 0, w, h);
        ctx.restore();
        drawCallsLastFrame++;
      }
    }
  }

  // Dark room / boss mood tint if requested
  if (o.dark && !o.reducedFlash) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 11, 20, 0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Combined flash overlay (camera flash + flashbang overlay + local trigger), capped at 0.65
  const vfxFlash = bansungVfx.getFlashOverlayState();
  if (vfxFlash.active) {
    const total = Math.max(1, 35 + 650);
    const vfxAlpha =
      vfxFlash.ageMs < 35
        ? vfxFlash.peakAlpha * (vfxFlash.ageMs / 35)
        : vfxFlash.peakAlpha * Math.max(0, 1 - (vfxFlash.ageMs - 35) / 650);
    const camAlpha = clamp(o.cam.flashAlpha || 0, 0, RENDER_CFG.MAX_FLASH_ALPHA);
    const combined = clamp(Math.max(vfxAlpha, camAlpha, screenFlashState.alpha), 0, RENDER_CFG.MAX_FLASH_ALPHA);
    if (combined > 0.005) {
      ctx.save();
      ctx.fillStyle = camAlpha > vfxAlpha ? o.cam.flashColor || '#ffffff' : vfxFlash.tintColor;
      ctx.globalAlpha = combined;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  } else {
    const combined = clamp(Math.max(o.cam.flashAlpha || 0, screenFlashState.alpha), 0, RENDER_CFG.MAX_FLASH_ALPHA);
    if (combined > 0.005) {
      ctx.save();
      ctx.fillStyle = o.cam.flashAlpha >= screenFlashState.alpha ? o.cam.flashColor || '#ffffff' : screenFlashState.color;
      ctx.globalAlpha = combined;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  store.metrics.drawCalls = drawCallsLastFrame;
}

// ============================================================================
// 11. Radar Minimap (`renderBansungRadar`, d41 & d45)
// ============================================================================

export function renderBansungRadar(
  ctx: CanvasRenderingContext2D,
  size: number,
  dpr: number,
  cam: Pick<CameraState, 'x' | 'y' | 'zoom'>,
  viewW: number,
  viewH: number,
  opts?: RadarOpts,
): void {
  const store = opts?.store ?? bansungStore;
  const rw = Math.max(32, opts?.w ?? size);
  const rh = Math.max(32, opts?.h ?? size);
  const mapW = store.mapW || BANSUNG_MAP_W;
  const mapH = store.mapH || BANSUNG_MAP_H;
  const mode = opts?.mode ?? 'arena';
  const nowMs = opts?.nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const safeDpr = clamp(dpr || 1, 1, RENDER_CFG.DPR_CAP);

  ctx.setTransform(safeDpr, 0, 0, safeDpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const biome = store.biome || 'desert';
  ctx.fillStyle =
    biome === 'crypt' ? '#1b1018' : biome === 'cyber' ? '#0f1722' : '#1c1714';
  ctx.fillRect(0, 0, rw, rh);

  const scale =
    mode === 'radar'
      ? Math.min(rw, rh) / (2 * (opts?.radarRadius ?? RENDER_CFG.DEFAULT_RADAR_RADIUS))
      : Math.min(rw / mapW, rh / mapH);
  const originX =
    mode === 'radar'
      ? cam.x - (rw * 0.5) / scale
      : -((rw - mapW * scale) * 0.5) / scale;
  const originY =
    mode === 'radar'
      ? cam.y - (rh * 0.5) / scale
      : -((rh - mapH * scale) * 0.5) / scale;

  const toX = (wx: number): number => Math.round((wx - originX) * scale);
  const toY = (wy: number): number => Math.round((wy - originY) * scale);

  // Arena outline
  ctx.strokeStyle = '#3b332b';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    toX(0) + 0.5,
    toY(0) + 0.5,
    Math.max(1, Math.round(mapW * scale) - 1),
    Math.max(1, Math.round(mapH * scale) - 1),
  );

  // 1. Static obstacle blocks
  ctx.fillStyle = '#5c4a38';
  for (let i = 0; i < store.obstacles.length; i++) {
    const ob = store.obstacles[i];
    ctx.fillRect(
      toX(ob.x),
      toY(ob.y),
      Math.max(2, Math.round(ob.w * scale)),
      Math.max(2, Math.round(ob.h * scale)),
    );
  }

  // 2. Breakable props & pickups
  for (let i = 0; i < store.props.length; i++) {
    const pr = store.props[i];
    const kind = BANSUNG_PROP_IDS[pr.kindIdx];
    if (kind === 'barrel') {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(toX(pr.x) - 1, toY(pr.y) - 1, 2, 2);
    } else if (kind === 'crate' || kind === 'pot') {
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(toX(pr.x) - 1, toY(pr.y) - 1, 2, 2);
    }
  }

  for (let i = 0; i < store.pickups.length; i++) {
    const pk = store.pickups[i];
    const kind = resolvePickupKind(pk.kindIdx);
    const rx = toX(pk.x);
    const ry = toY(pk.y);
    if (kind === 'weapon_pedestal' || kind === 'weapon') {
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 3);
      ctx.lineTo(rx + 3, ry);
      ctx.lineTo(rx, ry + 3);
      ctx.lineTo(rx - 3, ry);
      ctx.closePath();
      ctx.fill();
    } else if (kind === 'xp_orb_l') {
      ctx.fillStyle = '#e879f9';
      ctx.fillRect(rx - 1, ry - 1, 3, 3);
    } else if (kind === 'xp_orb_m') {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(rx - 1, ry - 1, 2, 2);
    } else if (kind === 'xp_orb_s' || kind === 'xp') {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(rx - 1, ry - 1, 2, 2);
    } else {
      ctx.fillStyle = '#69db7c';
      ctx.fillRect(rx - 1, ry - 1, 2, 2);
    }
  }

  // 3. Enemies & Boss diamond
  for (const e of store.enemies.values()) {
    if (e.state === BANSUNG_STATE_DEAD) continue;
    if (BANSUNG_ENEMIES[e.enemyId]?.isBoss) continue;
    if ((e.flags & BANSUNG_EFLAG_EVOLVED) !== 0) {
      const ex = toX(e.x);
      const ey = toY(e.y);
      ctx.fillStyle = '#e879f9';
      ctx.fillRect(ex - 2, ey - 2, 4, 4);
      ctx.fillStyle = '#ff2a6d';
      ctx.fillRect(ex - 1, ey - 1, 2, 2);
    } else {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(toX(e.x) - 1, toY(e.y) - 1, 3, 3);
    }
  }

  if (store.boss && store.boss.maxHp > 0 && store.boss.state !== BANSUNG_STATE_DEAD) {
    const bx = toX(store.boss.x);
    const by = toY(store.boss.y);
    ctx.fillStyle = '#ff2a6d';
    ctx.beginPath();
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx + 5, by);
    ctx.lineTo(bx, by + 5);
    ctx.lineTo(bx - 5, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 4. Teammates, downed allies (blinking #fcc419), and local player + FOV wedge
  const blinkDowned = (Math.floor(nowMs / 240) & 1) === 0;
  for (const p of store.players.values()) {
    const isLocal =
      (store.myIdx !== undefined && p.idx === store.myIdx) ||
      (opts?.myPlayerId !== undefined && p.id === opts.myPlayerId);
    const px = toX(isLocal ? store.localDrawX : p.x);
    const py = toY(isLocal ? store.localDrawY : p.y);

    if (p.state === BANSUNG_STATE_DEAD) continue;
    if (p.state === BANSUNG_STATE_DOWNED) {
      ctx.fillStyle = blinkDowned ? '#fcc419' : '#ff4d4f';
      ctx.fillRect(px - 3, py - 1, 6, 2);
      ctx.fillRect(px - 1, py - 3, 2, 6);
      continue;
    }

    if (isLocal) {
      const aim = store.localAimRad;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(aim - 0.35) * 14, py + Math.sin(aim - 0.35) * 14);
      ctx.lineTo(px + Math.cos(aim + 0.35) * 14, py + Math.sin(aim + 0.35) * 14);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    } else {
      ctx.fillStyle = '#4dabf7';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }

  // 5. Pings & current camera viewport box
  for (let i = 0; i < store.pings.length; i++) {
    const ping = store.pings[i];
    const remaining = ping.expiresAt - nowMs;
    if (remaining <= 0) continue;
    const age = Math.max(0, PING_DEFAULT_TTL_MS - remaining);
    const rx = toX(ping.x);
    const ry = toY(ping.y);
    const r = 3 + ((age * 0.015) % 8);
    ctx.strokeStyle =
      ping.kind === BANSUNG_PING_ENEMY
        ? '#ff6b6b'
        : ping.kind === BANSUNG_PING_HELP
          ? '#ffd43b'
          : ping.kind === BANSUNG_PING_LOOT
            ? '#22b8cf'
            : '#51cf66';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, TWO_PI);
    ctx.stroke();
  }

  const zoom = Math.max(0.25, cam.zoom || RENDER_CFG.WORLD_ZOOM_BASE);
  const vw = viewW / zoom;
  const vh = viewH / zoom;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    toX(cam.x - vw * 0.5) + 0.5,
    toY(cam.y - vh * 0.5) + 0.5,
    Math.max(4, Math.round(vw * scale) - 1),
    Math.max(4, Math.round(vh * scale) - 1),
  );
}

// ============================================================================
// 12. Cache Lifecycle & Diagnostics
// ============================================================================

export function clearBansungRenderCaches(): void {
  terrainChunks.forEach((entry) => {
    entry.canvas.width = 0;
    entry.canvas.height = 0;
  });
  terrainChunks.clear();
  if (vignetteCanvas) {
    vignetteCanvas.width = 0;
    vignetteCanvas.height = 0;
    vignetteCanvas = null;
  }
  vignetteW = 0;
  vignetteH = 0;
  for (let i = 0; i < dmgNums.length; i++) dmgNums[i].active = false;
  for (let i = 0; i < meleeSlashes.length; i++) meleeSlashes[i].active = false;
  screenFlashState.alpha = 0;
  glowQueueCount = 0;
  sortItemsLastFrame = 0;
}

export function getRenderDiagnostics(): {
  chunksCached: number;
  sortItemsLastFrame: number;
  drawCallsLastFrame: number;
  assetLoadBump: number;
} {
  return {
    chunksCached: terrainChunks.size,
    sortItemsLastFrame,
    drawCallsLastFrame,
    assetLoadBump,
  };
}
