/**
 * Client-side realtime snapshot store, adaptive interpolation/extrapolation,
 * zero-latency local aim, 32-input movement prediction/reconciliation,
 * follow/spectator camera controller, and 15Hz React HUD hook for `bansung`.
 *
 * Aligns design specs d02, d08, d19, d45, and d47 with `shared/src/bansung.ts`.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  BANSUNG_BULLET_FIELDS,
  BANSUNG_DASH,
  BANSUNG_EFLAG_HIT_FLASH,
  BANSUNG_EFLAG_LEFT,
  BANSUNG_ENEMY_FIELDS,
  BANSUNG_ENEMY_IDS,
  BANSUNG_FX_FIELDS,
  BANSUNG_HERO_IDS,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_OBSTACLE_FIELDS,
  BANSUNG_PFLAG_BOT,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_FIRING,
  BANSUNG_PFLAG_HIT_FLASH,
  BANSUNG_PFLAG_LEFT,
  BANSUNG_PFLAG_RELOADING,
  BANSUNG_PICKUP_FIELDS,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_PLAYER_FIELDS,
  BANSUNG_PLAYER_SPAWNS,
  BANSUNG_PROP_FIELDS,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  FX_PING,
  decodeEnemyMobLevelFromFlags,
  dequantizeAim,
  getBansungHero,
  getProjectileConfigByKindId,
  getXpToNextLevel,
  solveFacing,
  wrapPi,
  type BansungBiome,
  type BansungBossFrame,
  type BansungBossPartView,
  type BansungEmpPylon,
  type BansungEnemyId,
  type BansungFrame,
  type BansungFxType,
  type BansungGachaCard,
  type BansungHazardWire,
  type BansungHeroId,
  type BansungLaserLane,
  type BansungPetFrame,
  type BansungPingKind,
  type BansungPlayerInfo,
  type BansungPrivate,
  type BansungRoomView,
  type BansungSurvivalClock,
  type BansungTelegraphWire,
  type BansungUnitState,
  type BansungWavePhase,
  type BansungWeakPointView,
  type BansungWeaponSlot,
} from '../../../shared/src';

// ============================================================================
// 1. Constants (d08 / d45 / d47)
// ============================================================================

/** Number of 30Hz snapshots retained in the circular ring buffer (~533ms). */
export const SNAP_BUF_CAP = 16;
/** Baseline adaptive interpolation delay in milliseconds (~2 server ticks). */
export const BASE_INTERP_MS = 66;
/** Lower clamp bound for adaptive interpolation delay (ms). */
export const MIN_INTERP_MS = 50;
/** Upper clamp bound for adaptive interpolation delay (ms). */
export const MAX_INTERP_MS = 180;
/** Maximum dead-reckoning extrapolation window on packet loss (ms). */
export const MAX_EXTRAP_MS = 100;
/** Per-tick displacement threshold above which positions snap instead of lerping. */
export const TELEPORT_SNAP_DIST = 160;
/** Circular buffer capacity for unacknowledged local movement inputs (~1s). */
export const INPUT_RING_CAP = 32;
/** Prediction error threshold above which local position hard-snaps (px). */
export const RECONCILE_SNAP_ERR = 96;
/** Prediction error deadband below which reconciliation offset is ignored (px). */
export const RECONCILE_IGNORE_ERR = 2;
/** Maximum camera look-ahead toward pointer/stick aim in world pixels. */
export const MAX_LOOK_AHEAD_PX = 96;
/** Soft margin outside arena bounds allowed for follow camera clamping (px). */
export const CAM_MARGIN_PX = 64;
/** Delay before auto-switching spectator camera after followed target death (ms). */
export const AUTO_SPECTATE_DELAY_MS = 1200;
/** 15Hz React HUD notification throttle interval (~67ms). */
export const HUD_THROTTLE_MS = Math.round(1000 / 15);

/** Camera zoom limits. */
export const BANSUNG_ZOOM_MIN = 0.75;
export const BANSUNG_ZOOM_MAX = 2.5;
export const BANSUNG_ZOOM_DEFAULT_MIN = 1.0;

const DOWNED_CRAWL_MULT = 0.28;
const PING_TTL_MS = 4000;
const SPAWN_ALPHA_RAMP_MS = 100;
const MAX_PENDING_FX = 256;
const MAX_ACTIVE_PINGS = 24;

// ============================================================================
// 2. Public Snapshot, Interpolation, Input, Camera & HUD Schemas
// ============================================================================

export interface SnapPlayer {
  idx: number;
  id: number;
  x: number;
  y: number;
  aim: number;
  hp: number;
  shield: number;
  /** Alias of `shield` for consumers matching d08 naming. */
  armor: number;
  state: BansungUnitState;
  flags: number;
  heroIdx: number;
  weaponIdx: number;
  revivePct: number;
  /** Active gun evolution tier (`1..4`). */
  weaponTier: number;
}

export interface SnapEnemy {
  id: number;
  kind: number;
  enemyId: BansungEnemyId;
  x: number;
  y: number;
  hpPct: number;
  aim: number;
  state: number;
  flags: number;
  level: number;
}

export interface SnapBullet {
  id: number;
  kind: number;
  x: number;
  y: number;
  aim: number;
  vx: number;
  vy: number;
  flags: number;
}

export interface SnapProp {
  id: number;
  kindIdx: number;
  x: number;
  y: number;
  hpPct: number;
}

export interface SnapPickup {
  id: number;
  kindIdx: number;
  x: number;
  y: number;
  subId: number;
}

export interface SnapBoss {
  id: number;
  kind: BansungEnemyId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: number;
  state: BansungUnitState;
  aim: number;
  telegraph?: number;
  stagger?: number;
  maxStagger?: number;
  telegraphs?: BansungTelegraphWire[];
  weakPoints?: BansungWeakPointView[];
  wp?: BansungWeakPointView[];
  pylons?: BansungEmpPylon[];
  laserLanes?: BansungLaserLane[];
  lanes?: BansungLaserLane[];
  title?: string;
  subtitle?: string;
  tier?: number;
  scale?: number;
  splitTier?: number;
  hpBars?: number;
  parts?: BansungBossPartView[];
  unlockedSkills?: string[];
}

export interface SnapFxEvent {
  type: BansungFxType;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  tick: number;
}

export interface ParsedSnapshot {
  tick: number;
  ms: number;
  wave: number;
  wavePhase: BansungWavePhase;
  rem: number;
  recvAt: number;
  players: Map<number, SnapPlayer>;
  enemies: Map<number, SnapEnemy>;
  bullets: Map<number, SnapBullet>;
  props: SnapProp[];
  pickups: SnapPickup[];
  boss?: SnapBoss;
  bosses: SnapBoss[];
  pets: BansungPetFrame[];
  hazards: BansungHazardWire[];
  telegraphs: BansungTelegraphWire[];
  me?: BansungPrivate;
  srv: BansungSurvivalClock | null;
  fxRaw: number[];
  fxConsumed: boolean;
  raw: BansungFrame;
}

export interface InterpPlayer extends SnapPlayer {
  phase: number;
  facingLeft: boolean;
  spawnAlpha: number;
  atkAt: number;
  hitFlashAt: number;
}

export interface InterpEnemy extends SnapEnemy {
  phase: number;
  facingLeft: boolean;
  spawnAlpha: number;
}

export interface InterpBullet extends SnapBullet {
  spawnAlpha: number;
}

export interface InterpBoss extends SnapBoss {
  facingLeft: boolean;
}

export interface PendingInput {
  seq: number;
  dtSec: number;
  mx: number;
  my: number;
  speed: number;
}

export interface StaticObstacleBox {
  x: number;
  y: number;
  w: number;
  h: number;
  propKindIdx: number;
}

export interface BansungPingItem {
  id: number;
  ownerIdx: number;
  kind: BansungPingKind;
  x: number;
  y: number;
  expiresAt: number;
}

export type BansungCameraMode = 'self' | 'spectate' | 'free';

export interface BansungCamera {
  x: number;
  y: number;
  zoom: number;
  lookX: number;
  lookY: number;
  shakeMag: number;
  shakeX: number;
  shakeY: number;
  mode: BansungCameraMode;
  followIdx: number | null;
  deadSinceAt: number;
}

export interface BansungSpectatingInfo {
  active: boolean;
  mode: BansungCameraMode;
  targetIdx: number | null;
  targetName: string;
  canCycle: boolean;
}

export interface BansungTelemetry {
  fps: number;
  rxBps: number;
  txBps: number;
  interpDelayMs: number;
  jitterMs: number;
  extrapMs: number;
  extrapolating: boolean;
  ringCount: number;
  pendingInputs: number;
  renderTick: number;
  latestTick: number;
  drawCalls: number;
}

export interface BansungHudSnapshot {
  version: number;
  tick: number;
  elapsedMs: number;
  wave: number;
  wavePhase: BansungWavePhase;
  rem: number;
  biome: BansungBiome;
  /** Survival 20-minute repeating cycle clock (`frame.srv ?? null`). */
  survival: BansungSurvivalClock | null;
  myIdx?: number;
  /** Latest local private slice including normalized survival XP/Gacha/Evolution fields. */
  me?: BansungPrivate;
  localPlayer?: SnapPlayer;
  players: readonly SnapPlayer[];
  roster: readonly BansungPlayerInfo[];
  boss?: SnapBoss;
  bosses?: readonly SnapBoss[];
  pets?: readonly BansungPetFrame[];
  hazards?: readonly BansungHazardWire[];
  telegraphs?: readonly BansungTelegraphWire[];
  spectating: BansungSpectatingInfo;
  pings: readonly BansungPingItem[];
  metrics: BansungTelemetry;
}

export interface PlayableBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Listener = () => void;
type FxListener = (events: readonly SnapFxEvent[]) => void;

// ============================================================================
// 3. Pure Math, Camera & Collision Helpers
// ============================================================================

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Shortest-arc angular linear interpolation in `(-pi, pi]`. */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = wrapPi(b - a);
  return wrapPi(a + diff * t);
}

/** Computes responsive default pixel-art zoom from viewport dimensions (`d08`). */
export function computeDefaultZoom(viewW: number, viewH: number): number {
  const w = viewW > 0 ? viewW : 1280;
  const h = viewH > 0 ? viewH : 720;
  return clamp(Math.min(w / 960, h / 540), BANSUNG_ZOOM_DEFAULT_MIN, BANSUNG_ZOOM_MAX);
}

/**
 * Returns a copy of `cam` with `(x, y)` snapped to `1 / dpr` grid
 * to eliminate 1px pixel-art outline shimmer during subpixel motion.
 */
export function snapCam(cam: BansungCamera, dpr = 1): BansungCamera {
  const safeDpr = Math.max(1, Number.isFinite(dpr) ? dpr : 1);
  return {
    ...cam,
    x: Math.round(cam.x * safeDpr) / safeDpr,
    y: Math.round(cam.y * safeDpr) / safeDpr,
    shakeX: Math.round(cam.shakeX * safeDpr) / safeDpr,
    shakeY: Math.round(cam.shakeY * safeDpr) / safeDpr,
  };
}

/** Projects canvas-local CSS coordinates `(sx, sy)` into world coordinates. */
export function screenToWorld(
  sx: number,
  sy: number,
  cam: Pick<BansungCamera, 'x' | 'y' | 'zoom'>,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const z = Math.max(0.1, cam.zoom);
  return {
    x: cam.x + (sx - viewW * 0.5) / z,
    y: cam.y + (sy - viewH * 0.5) / z,
  };
}

/** Projects world coordinates `(wx, wy)` into canvas-local CSS coordinates. */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: Pick<BansungCamera, 'x' | 'y' | 'zoom'>,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  return {
    x: (wx - cam.x) * cam.zoom + viewW * 0.5,
    y: (wy - cam.y) * cam.zoom + viewH * 0.5,
  };
}

/** Resolves a circle of radius `r` against static cover AABBs and playable bounds. */
export function resolveStaticCircle(
  x: number,
  y: number,
  r: number,
  obstacles: readonly StaticObstacleBox[],
  bounds: PlayableBounds,
): [number, number] {
  let px = x;
  let py = y;
  const r2 = r * r;

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const qx = clamp(px, o.x, o.x + o.w);
      const qy = clamp(py, o.y, o.y + o.h);
      const vx = px - qx;
      const vy = py - qy;
      const d2 = vx * vx + vy * vy;

      if (d2 > 0 && d2 < r2) {
        const d = Math.sqrt(d2);
        const push = r - d;
        px += (vx / d) * push;
        py += (vy / d) * push;
      } else if (d2 === 0 && px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
        const dl = px - o.x;
        const dr = o.x + o.w - px;
        const dt = py - o.y;
        const db = o.y + o.h - py;
        const minD = Math.min(dl, dr, dt, db);
        if (minD === dl) px = o.x - r;
        else if (minD === dr) px = o.x + o.w + r;
        else if (minD === dt) py = o.y - r;
        else py = o.y + o.h + r;
      }
    }

    px = clamp(px, bounds.x0 + r, bounds.x1 - r);
    py = clamp(py, bounds.y0 + r, bounds.y1 - r);
  }

  return [px, py];
}

// ============================================================================
// 4. Snapshot Decoding Helpers
// ============================================================================

export interface BansungHudPrivate extends BansungPrivate {
  xp: number;
  xpToNext: number;
  level: number;
  gachaChoices: BansungGachaCard[];
  gachaPending: number;
  gachaRemMs: number;
  skillStacks: Record<string, number>;
  weaponTiers: number[];
  stamina: number;
  maxStamina: number;
  dashCost: number;
  shieldDrPct: number;
  shieldDelayMs: number;
  shieldRegenTotalMs: number;
  shieldBuffMs: number;
  skillCdMs?: number;
  skillMaxMs?: number;
  skillActiveMs?: number;
  skillName?: string;
}

function normalizeSweetSpot(
  raw: [number, number] | undefined,
): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const a = Number.isFinite(raw[0]) ? raw[0] : 0;
  const b = Number.isFinite(raw[1]) ? raw[1] : 0;
  if (a > 1 || b > 1) {
    return [clamp(a / 100, 0, 1), clamp(b / 100, 0, 1)];
  }
  return [clamp(a, 0, 1), clamp(b, 0, 1)];
}

function normalizeSlots(rawSlots: unknown): BansungWeaponSlot[] {
  if (Array.isArray(rawSlots)) {
    const out = new Array<BansungWeaponSlot | null>(rawSlots.length);
    for (let i = 0; i < rawSlots.length; i++) {
      const s = rawSlots[i] as BansungWeaponSlot | null | undefined;
      out[i] = s && typeof s === 'object' ? { ...s } : null;
    }
    return out as unknown as BansungWeaponSlot[];
  }
  if (rawSlots && typeof rawSlots === 'object') {
    const rec = rawSlots as Record<string, BansungWeaponSlot | null | undefined>;
    const out = new Array<BansungWeaponSlot | null>(5).fill(null);
    for (let i = 0; i < 5; i++) {
      const s = rec[i] ?? rec[String(i)];
      if (s && typeof s === 'object') {
        out[i] = { ...s };
      }
    }
    return out as unknown as BansungWeaponSlot[];
  }
  return [];
}

function decodeSnapBoss(bs: BansungBossFrame): SnapBoss {
  const weakPoints = bs.weakPoints ?? bs.wp;
  const laserLanes = bs.laserLanes ?? bs.lanes;
  return {
    id: bs.id,
    kind: bs.kind,
    x: bs.x,
    y: bs.y,
    hp: bs.hp,
    maxHp: bs.maxHp,
    phase: bs.phase,
    state: bs.state,
    aim: dequantizeAim(bs.aimQ),
    telegraph: bs.telegraph,
    stagger: bs.stagger,
    maxStagger: bs.maxStagger,
    telegraphs: bs.telegraphs,
    weakPoints,
    wp: bs.wp ?? weakPoints,
    pylons: bs.pylons,
    laserLanes,
    lanes: bs.lanes ?? laserLanes,
    ...(bs.title !== undefined ? { title: bs.title } : {}),
    ...(bs.subtitle !== undefined ? { subtitle: bs.subtitle } : {}),
    ...(bs.tier !== undefined ? { tier: bs.tier } : {}),
    ...(bs.scale !== undefined ? { scale: bs.scale } : {}),
    ...(bs.splitTier !== undefined ? { splitTier: bs.splitTier } : {}),
    ...(bs.hpBars !== undefined ? { hpBars: bs.hpBars } : {}),
    ...(Array.isArray(bs.parts) ? { parts: bs.parts.map((p) => ({ ...p })) } : {}),
    ...(Array.isArray(bs.unlockedSkills) ? { unlockedSkills: bs.unlockedSkills.slice() } : {}),
  };
}

function copyBossWithPose(src: SnapBoss, x: number, y: number, aim: number): InterpBoss {
  return {
    ...src,
    x,
    y,
    aim,
    facingLeft: Math.cos(aim) < 0,
  };
}

function normalizePrivateSlice(raw: BansungPrivate): BansungHudPrivate {
  const level =
    typeof raw.level === 'number' && Number.isFinite(raw.level) && raw.level >= 1
      ? Math.floor(raw.level)
      : 1;
  const xp =
    typeof raw.xp === 'number' && Number.isFinite(raw.xp) && raw.xp >= 0 ? raw.xp : 0;
  const xpToNext =
    typeof raw.xpToNext === 'number' && Number.isFinite(raw.xpToNext) && raw.xpToNext > 0
      ? raw.xpToNext
      : getXpToNextLevel(level);
  const gachaChoices = Array.isArray(raw.gachaChoices) ? raw.gachaChoices.slice() : [];
  const gachaPending =
    typeof raw.gachaPending === 'number' &&
    Number.isFinite(raw.gachaPending) &&
    raw.gachaPending >= 0
      ? Math.floor(raw.gachaPending)
      : gachaChoices.length > 0
        ? 1
        : 0;
  const gachaRemMs =
    typeof raw.gachaRemMs === 'number' && Number.isFinite(raw.gachaRemMs) && raw.gachaRemMs >= 0
      ? raw.gachaRemMs
      : 0;
  const skillStacks =
    raw.skillStacks && typeof raw.skillStacks === 'object' ? { ...raw.skillStacks } : {};
  const slots = normalizeSlots(raw.slots);
  const sweetSpot = normalizeSweetSpot(raw.sweetSpot);
  const weaponTiers = Array.isArray(raw.weaponTiers)
    ? raw.weaponTiers.map((t) => clamp(Math.round(Number.isFinite(t) ? t : 1), 1, 4))
    : slots.map((s) => {
        const tier = (s as BansungWeaponSlot | null | undefined)?.tier;
        return clamp(Math.round(Number.isFinite(tier) ? (tier ?? 1) : 1), 1, 4);
      });

  const maxStamina =
    typeof raw.maxStamina === 'number' && Number.isFinite(raw.maxStamina) && raw.maxStamina > 0
      ? Math.round(raw.maxStamina)
      : 100;
  const stamina =
    typeof raw.stamina === 'number' && Number.isFinite(raw.stamina) && raw.stamina >= 0
      ? Math.min(maxStamina, Math.round(raw.stamina))
      : maxStamina;
  const dashCost =
    typeof raw.dashCost === 'number' && Number.isFinite(raw.dashCost) && raw.dashCost > 0
      ? Math.round(raw.dashCost)
      : 35;
  const shieldDrPct =
    typeof raw.shieldDrPct === 'number' && Number.isFinite(raw.shieldDrPct) && raw.shieldDrPct >= 0
      ? clamp(Math.round(raw.shieldDrPct), 0, 75)
      : 25;
  const shieldRegenTotalMs =
    typeof raw.shieldRegenTotalMs === 'number' &&
    Number.isFinite(raw.shieldRegenTotalMs) &&
    raw.shieldRegenTotalMs > 0
      ? Math.round(raw.shieldRegenTotalMs)
      : 5000;
  const shieldDelayMs =
    typeof raw.shieldDelayMs === 'number' && Number.isFinite(raw.shieldDelayMs) && raw.shieldDelayMs >= 0
      ? Math.round(raw.shieldDelayMs)
      : 0;
  const shieldBuffMs =
    typeof raw.shieldBuffMs === 'number' && Number.isFinite(raw.shieldBuffMs) && raw.shieldBuffMs >= 0
      ? Math.round(raw.shieldBuffMs)
      : 0;

  return {
    ...raw,
    slots,
    sweetSpot,
    xp,
    xpToNext,
    level,
    gachaChoices,
    gachaPending,
    gachaRemMs,
    skillStacks,
    weaponTiers,
    stamina,
    maxStamina,
    dashCost,
    shieldDrPct,
    shieldDelayMs,
    shieldRegenTotalMs,
    shieldBuffMs,
  };
}

function decodePlayers(arr: readonly number[]): Map<number, SnapPlayer> {
  const map = new Map<number, SnapPlayer>();
  for (let i = 0; i + BANSUNG_PLAYER_FIELDS <= arr.length; i += BANSUNG_PLAYER_FIELDS) {
    const idx = arr[i];
    const shield = arr[i + 5];
    const rawTier = arr[i + 11] ?? 1;
    const weaponTier = Number.isFinite(rawTier)
      ? Math.max(1, Math.min(4, Math.round(rawTier)))
      : 1;
    map.set(idx, {
      idx,
      id: idx,
      x: arr[i + 1],
      y: arr[i + 2],
      aim: dequantizeAim(arr[i + 3]),
      hp: arr[i + 4],
      shield,
      armor: shield,
      state: arr[i + 6] as BansungUnitState,
      flags: arr[i + 7],
      heroIdx: arr[i + 8],
      weaponIdx: arr[i + 9],
      revivePct: arr[i + 10],
      weaponTier,
    });
  }
  return map;
}

function decodeEnemies(arr: readonly number[] | undefined): Map<number, SnapEnemy> {
  const map = new Map<number, SnapEnemy>();
  if (!arr) return map;
  for (let i = 0; i + BANSUNG_ENEMY_FIELDS <= arr.length; i += BANSUNG_ENEMY_FIELDS) {
    const id = arr[i];
    const kind = arr[i + 1];
    map.set(id, {
      id,
      kind,
      enemyId: BANSUNG_ENEMY_IDS[kind] ?? 'scarab',
      x: arr[i + 2],
      y: arr[i + 3],
      hpPct: arr[i + 4],
      aim: dequantizeAim(arr[i + 5]),
      state: arr[i + 6],
      flags: arr[i + 7],
      level: decodeEnemyMobLevelFromFlags(arr[i + 7]),
    });
  }
  return map;
}

function decodeBullets(arr: readonly number[] | undefined): Map<number, SnapBullet> {
  const map = new Map<number, SnapBullet>();
  if (!arr) return map;
  for (let i = 0; i + BANSUNG_BULLET_FIELDS <= arr.length; i += BANSUNG_BULLET_FIELDS) {
    const id = arr[i];
    const kind = arr[i + 1];
    const aim = dequantizeAim(arr[i + 4]);
    const cfg = getProjectileConfigByKindId(kind);
    const speed = cfg ? cfg.speed : 600;
    map.set(id, {
      id,
      kind,
      x: arr[i + 2],
      y: arr[i + 3],
      aim,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      flags: arr[i + 5],
    });
  }
  return map;
}

function decodeProps(arr: readonly number[]): SnapProp[] {
  const out: SnapProp[] = [];
  for (let i = 0; i + BANSUNG_PROP_FIELDS <= arr.length; i += BANSUNG_PROP_FIELDS) {
    out.push({
      id: arr[i],
      kindIdx: arr[i + 1],
      x: arr[i + 2],
      y: arr[i + 3],
      hpPct: arr[i + 4],
    });
  }
  return out;
}

function decodePickups(arr: readonly number[]): SnapPickup[] {
  const out: SnapPickup[] = [];
  for (let i = 0; i + BANSUNG_PICKUP_FIELDS <= arr.length; i += BANSUNG_PICKUP_FIELDS) {
    out.push({
      id: arr[i],
      kindIdx: arr[i + 1],
      x: arr[i + 2],
      y: arr[i + 3],
      subId: arr[i + 4],
    });
  }
  return out;
}

function decodeObstacles(arr: readonly number[] | undefined): StaticObstacleBox[] {
  if (!arr || arr.length < BANSUNG_OBSTACLE_FIELDS) return [];
  const out: StaticObstacleBox[] = [];
  for (let i = 0; i + BANSUNG_OBSTACLE_FIELDS <= arr.length; i += BANSUNG_OBSTACLE_FIELDS) {
    out.push({
      x: arr[i],
      y: arr[i + 1],
      w: arr[i + 2],
      h: arr[i + 3],
      propKindIdx: arr[i + 4],
    });
  }
  return out;
}

function decodeFxArray(fxRaw: readonly number[], tick: number, out: SnapFxEvent[]): void {
  for (let i = 0; i + BANSUNG_FX_FIELDS <= fxRaw.length; i += BANSUNG_FX_FIELDS) {
    out.push({
      type: fxRaw[i] as BansungFxType,
      a: fxRaw[i + 1],
      b: fxRaw[i + 2],
      c: fxRaw[i + 3],
      d: fxRaw[i + 4],
      e: fxRaw[i + 5],
      tick,
    });
  }
}

// ============================================================================
// 5. BansungStore Implementation
// ============================================================================

/**
 * Client-side state store for `bansung` (Bắn Súng Co-op).
 *
 * Maintains a 16-slot 30Hz `BansungFrame` ring buffer with adaptive 66-180ms
 * entity interpolation, `<=100ms` underrun extrapolation, zero-latency local
 * aim override, 32-input sequence movement smoothing, follow/spectator camera
 * controls, and a 15Hz throttled React subscription hook.
 */
export class BansungStore {
  /** Latest authoritative frame received from server. */
  frame?: BansungFrame;
  /** Latest private HUD slice (`frame.me`). */
  me?: BansungPrivate;
  /** Latest Survival 20-minute repeating cycle clock (`frame.srv ?? null`). */
  survival: BansungSurvivalClock | null = null;
  /** Latest interpolated/current wave number. */
  wave = 1;
  /** Latest wave phase. */
  wavePhase: BansungWavePhase = 'combat';
  /** Remaining timer / enemies counter from latest resolved snapshot. */
  rem = 0;
  /** Elapsed match ms from latest resolved snapshot. */
  elapsedMs = 0;

  /** Map dimensions and static cover geometry (`6336 x 4032` Survival arena). */
  mapW = BANSUNG_MAP_W;
  mapH = BANSUNG_MAP_H;
  biome: BansungBiome = 'desert';
  arenaSeed = 0;
  obstacles: StaticObstacleBox[] = [];
  playableBounds: PlayableBounds = { ...BANSUNG_PLAYABLE_BOUNDS };
  myIdx?: number;
  playerRoster: BansungPlayerInfo[] = [];

  /** Interpolated world entities updated every `step(now)`. */
  players = new Map<number, InterpPlayer>();
  enemies = new Map<number, InterpEnemy>();
  bullets = new Map<number, InterpBullet>();
  props: SnapProp[] = [];
  pickups: SnapPickup[] = [];
  boss?: InterpBoss;
  bosses: InterpBoss[] = [];
  pets: BansungPetFrame[] = [];
  hazards: BansungHazardWire[] = [];
  telegraphs: BansungTelegraphWire[] = [];
  pings: BansungPingItem[] = [];

  /** Zero-latency local player draw position and aim state. */
  localDrawX = BANSUNG_MAP_W * 0.5;
  localDrawY = BANSUNG_MAP_H * 0.5;
  localAimRad = 0;
  localAimWorld = { x: BANSUNG_MAP_W * 0.5 + 120, y: BANSUNG_MAP_H * 0.5 };
  localFacingLeft = false;

  /** Pointer / twin-stick inputs for per-rAF aim recomputation. */
  pointerScreen = { x: 0, y: 0, active: false };
  stickAim = { active: false, rad: 0, mag: 0 };

  /** Viewport dimensions (CSS pixels). */
  viewW = 1280;
  viewH = 720;
  reducedMotion = false;

  /** Camera state (updated in `step(now)`). */
  cam: BansungCamera = {
    x: BANSUNG_MAP_W * 0.5,
    y: BANSUNG_MAP_H * 0.5,
    zoom: computeDefaultZoom(1280, 720),
    lookX: 0,
    lookY: 0,
    shakeMag: 0,
    shakeX: 0,
    shakeY: 0,
    mode: 'self',
    followIdx: null,
    deadSinceAt: 0,
  };

  /** Adaptive clock/interpolation state. */
  interpDelayMs = BASE_INTERP_MS;
  targetDelayMs = BASE_INTERP_MS;
  jitterMs = 0;
  renderTick = 0;
  extrapolating = false;
  extrapMs = 0;

  /** Performance & network telemetry (for `F3` HUD). */
  metrics: BansungTelemetry = {
    fps: 60,
    rxBps: 0,
    txBps: 0,
    interpDelayMs: BASE_INTERP_MS,
    jitterMs: 0,
    extrapMs: 0,
    extrapolating: false,
    ringCount: 0,
    pendingInputs: 0,
    renderTick: 0,
    latestTick: 0,
    drawCalls: 0,
  };

  // --- Internal 16-slot snapshot ring buffer ---
  private ring: (ParsedSnapshot | null)[] = new Array<ParsedSnapshot | null>(SNAP_BUF_CAP).fill(null);
  private ringHead = 0;
  private ringCount = 0;

  // --- Internal 32-slot unacked input ring buffer ---
  private inputRing: (PendingInput | null)[] = new Array<PendingInput | null>(INPUT_RING_CAP).fill(null);
  private inputHead = 0;
  private inputCount = 0;

  // --- Clock sync & rAF timing ---
  private clockOffsetMs = 0;
  private clockSynced = false;
  private prevPushTick = 0;
  private prevRecvAt = 0;
  private renderMs = 0;
  private renderInitialized = false;
  private lastRafAt = 0;
  private camInitialized = false;

  // --- Local movement prediction & reconciliation ---
  private localPredX = BANSUNG_MAP_W * 0.5;
  private localPredY = BANSUNG_MAP_H * 0.5;
  private localPredReady = false;
  private liveMoveExternal = false;
  private liveMoveMx = 0;
  private liveMoveMy = 0;
  private liveMoveUnqueuedDtSec = 0;
  private corrOffsetX = 0;
  private corrOffsetY = 0;
  private lastAckSeq = 0;
  private nextSeqCounter = 1;
  private predictionUsed = false;
  private aimMode: 'pointer' | 'stick' | 'direct' = 'pointer';
  private aimOverrideTouched = false;
  private prevLocalDead = false;

  // --- Entity visual metadata (spawn alpha, facing, animation phase) ---
  private spawnTimes = new Map<string, number>();
  private seenPlayerIds = new Set<number>();
  private seenEnemyIds = new Set<number>();
  private seenBulletIds = new Set<number>();
  private pendingFx: SnapFxEvent[] = [];
  private pingIdSeq = 1;

  // --- Subscriptions & 15Hz HUD snapshot caching ---
  private listeners = new Set<Listener>();
  private hudListeners = new Set<Listener>();
  private fxListeners = new Set<FxListener>();
  private customHudListenerCount = 0;
  private hudTimer: ReturnType<typeof setTimeout> | undefined;
  private lastHudEmitAt = -HUD_THROTTLE_MS;
  private hudVersion = 0;
  private hudSnapshot: BansungHudSnapshot;

  // --- Telemetry accumulators ---
  private rxWindowBytes = 0;
  private rxWindowStart = 0;
  private fpsEma = 60;
  private resetKey = '';
  private lastSpecKey = '';

  constructor() {
    this.hudSnapshot = this.buildHudSnapshot();
  }

  // --------------------------------------------------------------------------
  // Reset & Room Setup
  // --------------------------------------------------------------------------

  /**
   * Resets store state when entering a new match or room.
   * Safe to call repeatedly during React render: idempotent when match key matches.
   */
  reset(code: string, view?: BansungRoomView): void;
  reset(
    code: string,
    startedAt: number,
    mapW: number,
    mapH: number,
    myIdx?: number,
    obstacles?: readonly number[],
    biome?: BansungBiome,
    players?: readonly BansungPlayerInfo[],
  ): void;
  reset(
    code: string,
    viewOrStartedAt?: BansungRoomView | number,
    mapWArg?: number,
    mapHArg?: number,
    myIdxArg?: number,
    obstaclesArg?: readonly number[],
    biomeArg?: BansungBiome,
    playersArg?: readonly BansungPlayerInfo[],
  ): void {
    const isRoomView = typeof viewOrStartedAt !== 'number';
    const roomView = isRoomView ? viewOrStartedAt : undefined;
    const startedAt = isRoomView ? (roomView?.startedAt ?? 0) : viewOrStartedAt;
    const mapW = (isRoomView ? roomView?.mapW : mapWArg) || BANSUNG_MAP_W;
    const mapH = (isRoomView ? roomView?.mapH : mapHArg) || BANSUNG_MAP_H;
    const myIdx = isRoomView ? roomView?.myIdx : myIdxArg;
    const rawObstacles = isRoomView ? roomView?.obstacles : obstaclesArg;
    const biome = (isRoomView ? roomView?.config?.biome : biomeArg) ?? 'desert';
    const roster = (isRoomView ? roomView?.players : playersArg) ?? [];

    if (roster.length > 0) {
      this.playerRoster = roster.slice();
    }

    const key = `${code}:${startedAt}:${myIdx ?? 'spec'}:${mapW}x${mapH}:${biome}`;
    if (this.resetKey === key) {
      return;
    }
    this.resetKey = key;

    this.mapW = mapW;
    this.mapH = mapH;
    this.biome = biome;
    this.arenaSeed = roomView?.arenaSeed ?? 0;
    this.myIdx = myIdx;
    this.obstacles = decodeObstacles(rawObstacles);
    const isCanonicalMap = mapW === BANSUNG_MAP_W && mapH === BANSUNG_MAP_H;
    this.playableBounds = isCanonicalMap
      ? { ...BANSUNG_PLAYABLE_BOUNDS }
      : { x0: 0, y0: 0, x1: mapW, y1: mapH };

    this.clearMatchState();

    const spawn =
      isCanonicalMap && myIdx !== undefined && myIdx >= 0 && BANSUNG_PLAYER_SPAWNS.length > 0
        ? BANSUNG_PLAYER_SPAWNS[myIdx % BANSUNG_PLAYER_SPAWNS.length]
        : [mapW * 0.5, mapH * 0.5];
    this.localPredX = spawn[0];
    this.localPredY = spawn[1];
    this.localDrawX = spawn[0];
    this.localDrawY = spawn[1];
    this.cam.x = spawn[0];
    this.cam.y = spawn[1];
    this.cam.zoom = computeDefaultZoom(this.viewW, this.viewH);
    this.cam.mode = myIdx === undefined ? 'spectate' : 'self';
    this.cam.followIdx = myIdx ?? null;
    this.camInitialized = false;
    this.lastSpecKey = `${this.cam.mode}:${this.cam.followIdx ?? 'none'}`;

    this.refreshHudSnapshot();
  }

  private clearMatchState(): void {
    this.frame = undefined;
    this.me = undefined;
    this.survival = null;
    this.wave = 1;
    this.wavePhase = 'combat';
    this.rem = 0;
    this.elapsedMs = 0;

    this.ring.fill(null);
    this.ringHead = 0;
    this.ringCount = 0;

    this.inputRing.fill(null);
    this.inputHead = 0;
    this.inputCount = 0;

    this.players.clear();
    this.enemies.clear();
    this.bullets.clear();
    this.props = [];
    this.pickups = [];
    this.boss = undefined;
    this.bosses = [];
    this.pets = [];
    this.hazards = [];
    this.telegraphs = [];
    this.pings = [];
    this.spawnTimes.clear();
    this.pendingFx = [];

    this.clockOffsetMs = 0;
    this.clockSynced = false;
    this.prevPushTick = 0;
    this.prevRecvAt = 0;
    this.renderMs = 0;
    this.renderTick = 0;
    this.renderInitialized = false;
    this.lastRafAt = 0;

    this.interpDelayMs = BASE_INTERP_MS;
    this.targetDelayMs = BASE_INTERP_MS;
    this.jitterMs = 0;
    this.extrapolating = false;
    this.extrapMs = 0;

    this.localPredReady = false;
    this.liveMoveExternal = false;
    this.liveMoveMx = 0;
    this.liveMoveMy = 0;
    this.liveMoveUnqueuedDtSec = 0;
    this.corrOffsetX = 0;
    this.corrOffsetY = 0;
    this.lastAckSeq = 0;
    this.nextSeqCounter = 1;
    this.predictionUsed = false;
    this.aimOverrideTouched = false;
    this.prevLocalDead = false;

    this.cam.lookX = 0;
    this.cam.lookY = 0;
    this.cam.shakeMag = 0;
    this.cam.shakeX = 0;
    this.cam.shakeY = 0;
    this.cam.deadSinceAt = 0;

    this.rxWindowBytes = 0;
    this.rxWindowStart = 0;
    this.lastHudEmitAt = -HUD_THROTTLE_MS;
    this.updateTelemetryCounters();
  }

  // --------------------------------------------------------------------------
  // Subscriptions & 15Hz React HUD Throttle
  // --------------------------------------------------------------------------

  /** Subscribes to every incoming snapshot / immediate state update (~30Hz). */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Subscribes to HUD updates throttled to 15Hz (`HUD_THROTTLE_MS = 67ms`). */
  subscribeHud(fn: Listener, throttleMs = HUD_THROTTLE_MS): () => void {
    if (throttleMs === HUD_THROTTLE_MS) {
      this.hudListeners.add(fn);
      return () => {
        this.hudListeners.delete(fn);
        if (this.hudListeners.size === 0 && this.hudTimer !== undefined) {
          clearTimeout(this.hudTimer);
          this.hudTimer = undefined;
        }
      };
    }

    // Custom throttle wrapper for callers specifying non-default interval
    const safeThrottle = Math.max(16, throttleMs);
    let last = -safeThrottle;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    this.customHudListenerCount++;
    const wrapped = () => {
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= safeThrottle) {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        last = now;
        this.refreshHudSnapshot();
        fn();
      } else if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          if (!active) return;
          last = performance.now();
          this.refreshHudSnapshot();
          fn();
        }, Math.max(1, safeThrottle - elapsed));
      }
    };
    this.listeners.add(wrapped);
    return () => {
      if (!active) return;
      active = false;
      this.customHudListenerCount = Math.max(0, this.customHudListenerCount - 1);
      this.listeners.delete(wrapped);
      if (timer !== undefined) clearTimeout(timer);
    };
  }

  /** Registers a listener fired when delta FX reach `renderTick`. */
  onFx(fn: FxListener): () => void {
    this.fxListeners.add(fn);
    return () => {
      this.fxListeners.delete(fn);
    };
  }

  /** Drains and clears queued delta FX triggered up to `renderTick`. */
  drainFx(): SnapFxEvent[] {
    if (this.pendingFx.length === 0) return [];
    const out = this.pendingFx;
    this.pendingFx = [];
    return out;
  }

  /** Returns the cached immutable HUD snapshot (stable reference between 15Hz ticks). */
  getHudSnapshot(): BansungHudSnapshot {
    return this.hudSnapshot;
  }

  private scheduleHudNotify(immediate = false): void {
    if (this.hudListeners.size === 0) {
      if (this.customHudListenerCount === 0) {
        this.refreshHudSnapshot();
      }
      return;
    }
    const now = performance.now();
    if (immediate) {
      if (this.hudTimer !== undefined) {
        clearTimeout(this.hudTimer);
        this.hudTimer = undefined;
      }
      this.lastHudEmitAt = now;
      this.emitHudNow();
      return;
    }

    const elapsed = now - this.lastHudEmitAt;
    if (elapsed >= HUD_THROTTLE_MS) {
      if (this.hudTimer !== undefined) {
        clearTimeout(this.hudTimer);
        this.hudTimer = undefined;
      }
      this.lastHudEmitAt = now;
      this.emitHudNow();
    } else if (this.hudTimer === undefined) {
      const waitMs = Math.max(1, HUD_THROTTLE_MS - elapsed);
      this.hudTimer = setTimeout(() => {
        this.hudTimer = undefined;
        this.lastHudEmitAt = performance.now();
        this.emitHudNow();
      }, waitMs);
    }
  }

  private emitHudNow(): void {
    this.refreshHudSnapshot();
    this.hudListeners.forEach((fn) => fn());
  }

  private refreshHudSnapshot(): void {
    this.hudSnapshot = this.buildHudSnapshot();
  }

  private buildHudSnapshot(): BansungHudSnapshot {
    const newest = this.newestSnap();
    const playerList: SnapPlayer[] = [];
    if (newest) {
      for (const p of newest.players.values()) playerList.push(p);
      playerList.sort((a, b) => a.idx - b.idx);
    }
    const localPlayer =
      this.myIdx !== undefined && newest ? newest.players.get(this.myIdx) : undefined;

    return {
      version: ++this.hudVersion,
      tick: newest?.tick ?? 0,
      elapsedMs: this.elapsedMs,
      wave: this.wave,
      wavePhase: this.wavePhase,
      rem: this.rem,
      biome: this.biome,
      survival: this.survival,
      myIdx: this.myIdx,
      me: this.me,
      localPlayer,
      players: playerList,
      roster: this.playerRoster,
      boss: newest?.boss,
      bosses: newest?.bosses,
      pets: newest?.pets,
      hazards: newest?.hazards,
      telegraphs: newest?.telegraphs,
      spectating: this.spectatingInfo,
      pings: this.pings.slice(),
      metrics: { ...this.metrics },
    };
  }

  // --------------------------------------------------------------------------
  // Snapshot Ring-Buffer Ingestion & Clock Sync
  // --------------------------------------------------------------------------

  /**
   * Pushes a 30Hz authoritative `BansungFrame` into the 16-slot snapshot ring buffer,
   * updates adaptive jitter/clock sync, and reconciles local movement prediction.
   */
  push(frame: BansungFrame, byteSize?: number): void {
    if (!Number.isFinite(frame.t)) return;
    const now = performance.now();
    const latest = this.newestSnap();

    if (latest && frame.t <= latest.tick) {
      if (latest.tick - frame.t < 60) {
        return; // stale or duplicate tick
      }
      // Server restarted match (tick wrapped back) before reset() ran
      this.clearMatchState();
    }

    this.updateClockSync(frame.t, now);
    this.updateRxTelemetry(frame, byteSize, now);

    const prevSnap = this.newestSnap();
    const players = decodePlayers(frame.p);
    const enemies = decodeEnemies(frame.e);
    const bullets = decodeBullets(frame.b);
    const props =
      frame.pr !== undefined
        ? decodeProps(frame.pr)
        : frame.full
          ? []
          : (prevSnap?.props ?? []);
    const pickups =
      frame.pk !== undefined
        ? decodePickups(frame.pk)
        : frame.full
          ? []
          : (prevSnap?.pickups ?? []);

    const boss: SnapBoss | undefined = frame.bs ? decodeSnapBoss(frame.bs) : undefined;
    const bosses: SnapBoss[] = Array.isArray(frame.bs2)
      ? frame.bs2.map(decodeSnapBoss)
      : [];
    const pets: BansungPetFrame[] = Array.isArray(frame.pets) ? frame.pets.slice() : [];
    const hazards: BansungHazardWire[] = Array.isArray(frame.hz) ? frame.hz.slice() : [];
    const telegraphs: BansungTelegraphWire[] = Array.isArray(frame.tg) ? frame.tg.slice() : [];

    const normalizedMe = frame.me ? normalizePrivateSlice(frame.me) : undefined;
    const normalizedFrame: BansungFrame = normalizedMe
      ? { ...frame, me: normalizedMe }
      : frame;
    const survival: BansungSurvivalClock | null =
      frame.srv ?? (frame.full ? null : (prevSnap?.srv ?? this.survival ?? null));

    const snap: ParsedSnapshot = {
      tick: frame.t,
      ms: frame.ms,
      wave: frame.w,
      wavePhase: frame.wp,
      rem: frame.rem,
      recvAt: now,
      players,
      enemies,
      bullets,
      props,
      pickups,
      boss,
      bosses,
      pets,
      hazards,
      telegraphs,
      me: normalizedMe,
      srv: survival,
      fxRaw: frame.fx ? frame.fx.slice() : [],
      fxConsumed: false,
      raw: normalizedFrame,
    };

    const prevWavePhase = this.wavePhase;
    const prevStageIdx = this.survival?.stageIdx;
    const prevGachaPending = this.me?.gachaPending ?? 0;

    this.pushRing(snap);

    this.frame = normalizedFrame;
    this.wave = frame.w;
    this.wavePhase = frame.wp;
    this.rem = frame.rem;
    this.elapsedMs = frame.ms;
    this.survival = survival;
    if (normalizedMe) {
      this.me = normalizedMe;
    }

    this.reconcileLocal(snap);
    this.updateTelemetryCounters();

    const gachaJustOpened = prevGachaPending === 0 && (this.me?.gachaPending ?? 0) > 0;
    const immediateHud =
      this.ringCount === 1 ||
      this.wavePhase !== prevWavePhase ||
      this.survival?.stageIdx !== prevStageIdx ||
      gachaJustOpened;

    this.listeners.forEach((fn) => fn());
    this.scheduleHudNotify(immediateHud);
  }

  private pushRing(snap: ParsedSnapshot): void {
    if (this.ringCount < SNAP_BUF_CAP) {
      const writeIdx = (this.ringHead + this.ringCount) % SNAP_BUF_CAP;
      this.ring[writeIdx] = snap;
      this.ringCount++;
      return;
    }

    // Evict oldest snapshot cleanly (flush any unconsumed FX so none are dropped)
    const evicted = this.ring[this.ringHead];
    if (evicted && !evicted.fxConsumed) {
      this.consumeSnapshotFx(evicted, snap.recvAt);
    }
    this.ring[this.ringHead] = snap;
    this.ringHead = (this.ringHead + 1) % SNAP_BUF_CAP;
  }

  private snapAt(index: number): ParsedSnapshot | null {
    if (index < 0 || index >= this.ringCount) return null;
    return this.ring[(this.ringHead + index) % SNAP_BUF_CAP];
  }

  private oldestSnap(): ParsedSnapshot | undefined {
    return this.snapAt(0) ?? undefined;
  }

  private newestSnap(): ParsedSnapshot | undefined {
    return this.snapAt(this.ringCount - 1) ?? undefined;
  }

  private updateClockSync(tick: number, now: number): void {
    if (this.clockSynced && tick > this.prevPushTick) {
      const expectedGap = (tick - this.prevPushTick) * BANSUNG_TICK_EXACT_MS;
      const err = Math.abs(now - this.prevRecvAt - expectedGap);
      this.jitterMs = this.jitterMs * 0.875 + Math.min(err, 120) * 0.125;
      this.targetDelayMs = clamp(
        BASE_INTERP_MS + this.jitterMs * 1.5,
        Math.max(BASE_INTERP_MS, MIN_INTERP_MS),
        MAX_INTERP_MS,
      );
    }

    const sampleOffset = now - tick * BANSUNG_TICK_EXACT_MS;
    if (!this.clockSynced || Math.abs(sampleOffset - this.clockOffsetMs) > 500) {
      this.clockOffsetMs = sampleOffset;
      this.clockSynced = true;
      if (!this.renderInitialized) {
        this.renderMs = now - this.clockOffsetMs - this.interpDelayMs;
        this.renderTick = this.renderMs / BANSUNG_TICK_EXACT_MS;
        this.renderInitialized = true;
      }
    } else {
      const alpha = sampleOffset < this.clockOffsetMs ? 0.15 : 0.02;
      this.clockOffsetMs += (sampleOffset - this.clockOffsetMs) * alpha;
    }

    this.prevPushTick = tick;
    this.prevRecvAt = now;
  }

  private updateRxTelemetry(frame: BansungFrame, byteSize: number | undefined, now: number): void {
    const estBytes =
      byteSize ??
      40 +
        frame.p.length * 4 +
        (frame.e?.length ?? 0) * 4 +
        (frame.b?.length ?? 0) * 4 +
        (frame.pr?.length ?? 0) * 4 +
        (frame.pk?.length ?? 0) * 4 +
        (frame.fx?.length ?? 0) * 4;
    if (this.rxWindowStart === 0) {
      this.rxWindowStart = now;
    }
    this.rxWindowBytes += estBytes;
    const spanMs = now - this.rxWindowStart;
    if (spanMs >= 1000) {
      this.metrics.rxBps = Math.round((this.rxWindowBytes * 1000) / spanMs);
      this.rxWindowBytes = 0;
      this.rxWindowStart = now;
    }
  }

  // --------------------------------------------------------------------------
  // Local Aim Override & 32-Input Sequence Prediction / Reconciliation
  // --------------------------------------------------------------------------

  /** Updates canvas CSS dimensions (`viewW`, `viewH`) for camera clamping & aim projection. */
  setViewport(viewW: number, viewH: number): void {
    if (viewW > 0 && viewH > 0) {
      this.viewW = viewW;
      this.viewH = viewH;
    }
  }

  /** Sets mouse/pointer CSS position relative to canvas and updates local aim immediately. */
  setPointerScreen(sx: number, sy: number, viewW?: number, viewH?: number): number {
    if (viewW && viewH) this.setViewport(viewW, viewH);
    this.pointerScreen.x = sx;
    this.pointerScreen.y = sy;
    this.pointerScreen.active = true;
    this.aimMode = 'pointer';
    this.aimOverrideTouched = true;
    this.recomputePointerAim();
    return this.localAimRad;
  }

  /** Sets mobile twin-stick aim state (`mag > 0.18` activates aim override). */
  setStickAim(active: boolean, rad: number, mag: number): number {
    this.stickAim.active = active;
    this.stickAim.rad = wrapPi(rad);
    this.stickAim.mag = mag;
    if (active && mag > 0.18) {
      this.aimMode = 'stick';
      this.aimOverrideTouched = true;
      this.localAimRad = this.stickAim.rad;
      this.updateLocalFacingFromAim(this.localAimRad);
      this.applyImmediateLocalOverride();
    }
    return this.localAimRad;
  }

  /** Direct zero-latency aim override (e.g., from `BansungInputController` / auto-aim). */
  setLocalAimRad(rad: number, worldX?: number, worldY?: number): number {
    this.aimMode = 'direct';
    this.aimOverrideTouched = true;
    this.localAimRad = wrapPi(rad);
    if (worldX !== undefined && worldY !== undefined) {
      this.localAimWorld.x = worldX;
      this.localAimWorld.y = worldY;
    } else {
      this.localAimWorld.x = this.localDrawX + Math.cos(this.localAimRad) * 160;
      this.localAimWorld.y = this.localDrawY + Math.sin(this.localAimRad) * 160;
    }
    this.updateLocalFacingFromAim(this.localAimRad);
    this.applyImmediateLocalOverride();
    return this.localAimRad;
  }

  /** Allocates the next monotonic client input sequence number. */
  nextInputSeq(): number {
    return this.nextSeqCounter++;
  }

  /**
   * Records a local movement command `(mx, my)` in `[-1..1]` into the 32-slot
   * unacknowledged input ring buffer and advances predicted local position.
   */
  /** Updates per-rAF normalized live movement axes from the input controller for 60fps smooth prediction. */
  setLiveMoveInput(mx: number, my: number): void {
    this.liveMoveExternal = true;
    const rawX = Number.isFinite(mx) ? mx : 0;
    const rawY = Number.isFinite(my) ? my : 0;
    const len = Math.hypot(rawX, rawY);
    if (len > 1) {
      this.liveMoveMx = rawX / len;
      this.liveMoveMy = rawY / len;
    } else {
      this.liveMoveMx = rawX;
      this.liveMoveMy = rawY;
    }
  }

  recordLocalInput(
    seq: number,
    mx: number,
    my: number,
    dtSec = BANSUNG_TICK_EXACT_MS / 1000,
    speed?: number,
  ): void {
    const safeDt = clamp(Number.isFinite(dtSec) ? dtSec : BANSUNG_TICK_EXACT_MS / 1000, 0, 0.1);
    if (safeDt <= 0) return;

    let nx = Number.isFinite(mx) ? mx : 0;
    let ny = Number.isFinite(my) ? my : 0;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }

    const effSpeed = speed ?? this.resolveLocalSpeed();
    this.predictionUsed = true;

    const localSnap = this.getLatestLocalSnap();
    const canMove =
      !localSnap ||
      (localSnap.state !== BANSUNG_STATE_DEAD &&
        localSnap.state !== BANSUNG_STATE_STUN &&
        localSnap.state !== BANSUNG_STATE_DASH &&
        (localSnap.flags & BANSUNG_PFLAG_DASHING) === 0);

    if (this.localPredReady && canMove && effSpeed > 0) {
      if (this.liveMoveExternal) {
        // rAF `stepLocalPrediction` integrates movement continuously every frame; transfer accumulated delta here.
        this.liveMoveUnqueuedDtSec = Math.max(0, this.liveMoveUnqueuedDtSec - safeDt);
      } else {
        const [px, py] = this.integrateMove(this.localPredX, this.localPredY, nx, ny, effSpeed, safeDt);
        this.localPredX = px;
        this.localPredY = py;
        this.localDrawX = px + this.corrOffsetX;
        this.localDrawY = py + this.corrOffsetY;
      }
    }

    if (canMove) {
      this.pushInputRing({ seq, dtSec: safeDt, mx: nx, my: ny, speed: effSpeed });
    } else {
      this.liveMoveUnqueuedDtSec = 0;
    }
    this.metrics.pendingInputs = this.inputCount;
  }

  private pushInputRing(entry: PendingInput): void {
    if (this.inputCount < INPUT_RING_CAP) {
      const idx = (this.inputHead + this.inputCount) % INPUT_RING_CAP;
      this.inputRing[idx] = entry;
      this.inputCount++;
      return;
    }
    this.inputRing[this.inputHead] = entry;
    this.inputHead = (this.inputHead + 1) % INPUT_RING_CAP;
  }

  private dropAckedInputs(ackSeq: number): void {
    while (this.inputCount > 0) {
      const oldest = this.inputRing[this.inputHead];
      if (oldest && oldest.seq <= ackSeq) {
        this.inputRing[this.inputHead] = null;
        this.inputHead = (this.inputHead + 1) % INPUT_RING_CAP;
        this.inputCount--;
      } else {
        break;
      }
    }
    this.metrics.pendingInputs = this.inputCount;
  }

  private reconcileLocal(snap: ParsedSnapshot): void {
    if (this.myIdx === undefined) return;
    const authMe = snap.players.get(this.myIdx);
    if (!authMe) return;

    const ackSeq = snap.me?.lastAckSeq;
    if (ackSeq !== undefined && Number.isFinite(ackSeq) && ackSeq > this.lastAckSeq) {
      this.lastAckSeq = ackSeq;
      this.dropAckedInputs(ackSeq);
    }

    const isDead = authMe.state === BANSUNG_STATE_DEAD;
    const respawned = this.prevLocalDead && !isDead;
    this.prevLocalDead = isDead;

    if (!this.localPredReady || respawned) {
      this.localPredX = authMe.x;
      this.localPredY = authMe.y;
      this.corrOffsetX = 0;
      this.corrOffsetY = 0;
      this.localDrawX = authMe.x;
      this.localDrawY = authMe.y;
      this.localPredReady = true;
      if (!this.camInitialized) {
        this.cam.x = authMe.x;
        this.cam.y = authMe.y;
        this.camInitialized = true;
      }
      return;
    }

    // Re-simulate unacked inputs from authoritative server state
    let rx = authMe.x;
    let ry = authMe.y;
    const serverControlled =
      isDead ||
      authMe.state === BANSUNG_STATE_STUN ||
      authMe.state === BANSUNG_STATE_DASH ||
      (authMe.flags & BANSUNG_PFLAG_DASHING) !== 0;

    if (!serverControlled) {
      for (let i = 0; i < this.inputCount; i++) {
        const inp = this.inputRing[(this.inputHead + i) % INPUT_RING_CAP];
        if (!inp || inp.speed <= 0) continue;
        [rx, ry] = this.integrateMove(rx, ry, inp.mx, inp.my, inp.speed, inp.dtSec);
      }
      if (
        this.liveMoveExternal &&
        this.liveMoveUnqueuedDtSec > 0 &&
        (this.liveMoveMx !== 0 || this.liveMoveMy !== 0)
      ) {
        const liveSpeed = this.resolveLocalSpeed();
        if (liveSpeed > 0) {
          [rx, ry] = this.integrateMove(
            rx,
            ry,
            this.liveMoveMx,
            this.liveMoveMy,
            liveSpeed,
            Math.min(0.12, this.liveMoveUnqueuedDtSec),
          );
        }
      }
    } else {
      // Drop pre-dash / stunned input history so post-dash reconciliation never snaps backward.
      this.inputCount = 0;
      this.metrics.pendingInputs = 0;
      this.liveMoveUnqueuedDtSec = 0;
    }

    const deltaX = this.localPredX - rx;
    const deltaY = this.localPredY - ry;
    const errDist = Math.hypot(deltaX, deltaY);

    if (errDist > RECONCILE_SNAP_ERR) {
      this.localPredX = rx;
      this.localPredY = ry;
      this.corrOffsetX = 0;
      this.corrOffsetY = 0;
    } else if (errDist > RECONCILE_IGNORE_ERR) {
      this.localPredX = rx;
      this.localPredY = ry;
      // Preserve visual continuity while smoothly decaying corrOffset -> 0
      this.corrOffsetX = clamp(this.corrOffsetX + deltaX, -RECONCILE_SNAP_ERR, RECONCILE_SNAP_ERR);
      this.corrOffsetY = clamp(this.corrOffsetY + deltaY, -RECONCILE_SNAP_ERR, RECONCILE_SNAP_ERR);
    }
  }

  private integrateMove(
    x: number,
    y: number,
    mx: number,
    my: number,
    speed: number,
    dtSec: number,
  ): [number, number] {
    const nx = x + mx * speed * dtSec;
    const ny = y + my * speed * dtSec;
    return resolveStaticCircle(
      nx,
      ny,
      BANSUNG_DASH.HERO_RADIUS,
      this.obstacles,
      this.playableBounds,
    );
  }

  private getLatestLocalSnap(): SnapPlayer | undefined {
    if (this.myIdx === undefined) return undefined;
    return this.newestSnap()?.players.get(this.myIdx);
  }

  private resolveLocalSpeed(): number {
    const localSnap = this.getLatestLocalSnap();
    const heroId: BansungHeroId =
      (localSnap && BANSUNG_HERO_IDS[localSnap.heroIdx]) ||
      (this.myIdx !== undefined && this.playerRoster[this.myIdx]?.hero) ||
      'mascot';
    const baseSpeed = getBansungHero(heroId).speed;
    if (localSnap?.state === BANSUNG_STATE_DOWNED) {
      return baseSpeed * DOWNED_CRAWL_MULT;
    }
    return baseSpeed;
  }

  private recomputePointerAim(): void {
    if (!this.pointerScreen.active) return;
    const world = screenToWorld(
      this.pointerScreen.x,
      this.pointerScreen.y,
      this.cam,
      this.viewW,
      this.viewH,
    );
    this.localAimWorld.x = world.x;
    this.localAimWorld.y = world.y;
    const dx = world.x - this.localDrawX;
    const dy = world.y - this.localDrawY;
    if (dx * dx + dy * dy > 1e-4) {
      this.localAimRad = Math.atan2(dy, dx);
      this.updateLocalFacingFromAim(this.localAimRad);
      this.applyImmediateLocalOverride();
    }
  }

  private updateLocalFacingFromAim(aimRad: number): void {
    const facingRight = solveFacing(!this.localFacingLeft, Math.cos(aimRad), Math.sin(aimRad));
    this.localFacingLeft = !facingRight;
  }

  private applyImmediateLocalOverride(): void {
    if (this.myIdx === undefined) return;
    const local = this.players.get(this.myIdx);
    if (!local || local.state === BANSUNG_STATE_DEAD) return;
    local.aim = this.localAimRad;
    local.facingLeft = this.localFacingLeft;
  }

  // --------------------------------------------------------------------------
  // Per-Frame Interpolation, Extrapolation, FX Sync & Camera Step (rAF)
  // --------------------------------------------------------------------------

  /**
   * Advances render clock, interpolates/extrapolates entities, drains timed FX
   * deltas at `renderTick >= snap.tick`, updates local aim/smoothing, and steps
   * follow/spectator camera + screen shake. Call once per `requestAnimationFrame`.
   */
  step(now = performance.now()): void {
    const rawDtMs = this.lastRafAt > 0 ? Math.max(0, now - this.lastRafAt) : BANSUNG_TICK_EXACT_MS;
    const dtMs = clamp(rawDtMs, 0, 50);
    const dtSec = dtMs / 1000;
    this.lastRafAt = now;

    if (rawDtMs > 0.5) {
      const instFps = clamp(1000 / rawDtMs, 1, 240);
      this.fpsEma = this.fpsEma * 0.9 + instFps * 0.1;
      this.metrics.fps = Math.round(this.fpsEma);
    }

    // Slew adaptive interpolation delay toward target by <= 2ms/frame
    const delayDiff = this.targetDelayMs - this.interpDelayMs;
    if (Math.abs(delayDiff) <= 2) {
      this.interpDelayMs = this.targetDelayMs;
    } else {
      this.interpDelayMs += Math.sign(delayDiff) * 2;
    }

    if (this.ringCount > 0) {
      const targetRenderMs = now - this.clockOffsetMs - this.interpDelayMs;
      if (!this.renderInitialized) {
        this.renderMs = targetRenderMs;
        this.renderInitialized = true;
      } else if (Math.abs(targetRenderMs - this.renderMs) > 180) {
        this.renderMs = targetRenderMs;
      } else {
        const nextMs = this.renderMs + dtMs + (targetRenderMs - this.renderMs) * 0.1;
        this.renderMs = Math.max(this.renderMs, nextMs);
      }
      this.renderTick = this.renderMs / BANSUNG_TICK_EXACT_MS;

      this.sampleWorldAtRenderTick(now);
      this.flushTimedFx(now);
    }

    this.stepLocalPrediction(dtSec);
    this.stepLocalAim();
    this.stepSpectatorAndCamera(dtSec, now);
    this.pruneExpiredPings(now);
    this.updateTelemetryCounters();
  }

  private sampleWorldAtRenderTick(now: number): void {
    const oldest = this.oldestSnap();
    const newest = this.newestSnap();
    if (!oldest || !newest) return;

    // Case 1: Underrun (renderTick > newest.tick) -> extrapolate <= MAX_EXTRAP_MS
    if (this.renderTick > newest.tick) {
      const overrunMs = (this.renderTick - newest.tick) * BANSUNG_TICK_EXACT_MS;
      const clampedMs = Math.min(MAX_EXTRAP_MS, Math.max(0, overrunMs));
      this.extrapolating = true;
      this.extrapMs = clampedMs;
      const prev = this.ringCount >= 2 ? (this.snapAt(this.ringCount - 2) ?? undefined) : undefined;
      this.extrapolateFrom(prev, newest, clampedMs / 1000, now);
      return;
    }

    this.extrapolating = false;
    this.extrapMs = 0;

    // Case 2: Pre-buffer (renderTick <= oldest.tick) -> hold cleanly at oldest
    if (this.renderTick <= oldest.tick) {
      this.interpolateBetween(null, oldest, 0, now);
      return;
    }

    // Case 3: Normal bracket [A, B] with A.tick <= renderTick <= B.tick
    let a: ParsedSnapshot | null = oldest;
    let b: ParsedSnapshot = newest;
    for (let i = 1; i < this.ringCount; i++) {
      const cand = this.snapAt(i);
      if (!cand) continue;
      if (cand.tick >= this.renderTick) {
        b = cand;
        a = this.snapAt(i - 1);
        break;
      }
    }
    const span = Math.max(1, b.tick - (a ? a.tick : b.tick));
    const t = a ? clamp((this.renderTick - a.tick) / span, 0, 1) : 0;
    this.interpolateBetween(a, b, t, now);
  }

  private interpolateBetween(
    a: ParsedSnapshot | null,
    b: ParsedSnapshot,
    t: number,
    now: number,
  ): void {
    const tickGap = a ? Math.max(1, Math.min(5, b.tick - a.tick)) : 1;
    const snapDist = TELEPORT_SNAP_DIST * tickGap;

    // --- Players ---
    this.seenPlayerIds.clear();
    for (const [id, pb] of b.players) {
      this.seenPlayerIds.add(id);
      const pa = a?.players.get(id);
      let x = pb.x;
      let y = pb.y;
      let aim = pb.aim;
      if (pa) {
        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (dist <= snapDist) {
          x = pa.x + (pb.x - pa.x) * t;
          y = pa.y + (pb.y - pa.y) * t;
        }
        if (id !== this.myIdx || !this.aimOverrideTouched) {
          aim = lerpAngle(pa.aim, pb.aim, t);
        }
      }
      this.upsertPlayer(pb, x, y, aim, now);
    }
    for (const id of this.players.keys()) {
      if (!this.seenPlayerIds.has(id)) {
        this.players.delete(id);
        this.spawnTimes.delete(`p:${id}`);
      }
    }

    // --- Enemies ---
    this.seenEnemyIds.clear();
    for (const [id, eb] of b.enemies) {
      this.seenEnemyIds.add(id);
      const ea = a?.enemies.get(id);
      let x = eb.x;
      let y = eb.y;
      let aim = eb.aim;
      if (ea) {
        const dist = Math.hypot(eb.x - ea.x, eb.y - ea.y);
        if (dist <= snapDist) {
          x = ea.x + (eb.x - ea.x) * t;
          y = ea.y + (eb.y - ea.y) * t;
        }
        aim = lerpAngle(ea.aim, eb.aim, t);
      }
      this.upsertEnemy(eb, x, y, aim, now);
    }
    for (const id of this.enemies.keys()) {
      if (!this.seenEnemyIds.has(id)) {
        this.enemies.delete(id);
        this.spawnTimes.delete(`e:${id}`);
      }
    }

    // --- Bullets ---
    this.seenBulletIds.clear();
    const spawnOffsetSec = ((this.renderTick - b.tick) * BANSUNG_TICK_EXACT_MS) / 1000;
    for (const [id, bb] of b.bullets) {
      this.seenBulletIds.add(id);
      const ba = a?.bullets.get(id);
      let x = bb.x;
      let y = bb.y;
      let aim = bb.aim;
      if (ba) {
        const dist = Math.hypot(bb.x - ba.x, bb.y - ba.y);
        if (dist <= snapDist * 4) {
          x = ba.x + (bb.x - ba.x) * t;
          y = ba.y + (bb.y - ba.y) * t;
        }
        aim = lerpAngle(ba.aim, bb.aim, t);
      } else {
        // Newly spawned bullet in B: extrapolate along velocity so fast bullets never stutter on spawn
        const dtB = clamp(spawnOffsetSec, -0.05, 0.1);
        x = bb.x + bb.vx * dtB;
        y = bb.y + bb.vy * dtB;
      }
      this.upsertBullet(bb, x, y, aim, now);
    }
    for (const id of this.bullets.keys()) {
      if (!this.seenBulletIds.has(id)) {
        this.bullets.delete(id);
        this.spawnTimes.delete(`b:${id}`);
      }
    }

    // --- Boss ---
    if (b.boss) {
      const ba = a?.boss && a.boss.id === b.boss.id ? a.boss : undefined;
      let bx = b.boss.x;
      let by = b.boss.y;
      let baim = b.boss.aim;
      if (ba && Math.hypot(bx - ba.x, by - ba.y) <= snapDist) {
        bx = ba.x + (b.boss.x - ba.x) * t;
        by = ba.y + (b.boss.y - ba.y) * t;
        baim = lerpAngle(ba.aim, b.boss.aim, t);
      }
      this.boss = copyBossWithPose(b.boss, bx, by, baim);
    } else {
      this.boss = undefined;
    }

    if (b.bosses.length === 0) {
      if (this.bosses.length > 0) this.bosses = [];
    } else {
      this.bosses = b.bosses.map((nb) => {
        const pb = a?.bosses.find((x) => x.id === nb.id);
        let x = nb.x;
        let y = nb.y;
        let aim = nb.aim;
        if (pb && Math.hypot(x - pb.x, y - pb.y) <= snapDist) {
          x = pb.x + (nb.x - pb.x) * t;
          y = pb.y + (nb.y - pb.y) * t;
          aim = lerpAngle(pb.aim, nb.aim, t);
        }
        return copyBossWithPose(nb, x, y, aim);
      });
    }

    this.props = b.props;
    this.pickups = b.pickups;
    this.pets = b.pets;
    this.hazards = b.hazards;
    this.telegraphs = b.telegraphs;
  }

  private extrapolateFrom(
    prev: ParsedSnapshot | undefined,
    curr: ParsedSnapshot,
    extrapSec: number,
    now: number,
  ): void {
    const tickSpan = prev && curr.tick > prev.tick ? curr.tick - prev.tick : 0;
    const spanSec = tickSpan > 0 ? (tickSpan * BANSUNG_TICK_EXACT_MS) / 1000 : 0;
    const maxDist = TELEPORT_SNAP_DIST * Math.max(1, tickSpan);

    // --- Players ---
    this.seenPlayerIds.clear();
    for (const [id, pc] of curr.players) {
      this.seenPlayerIds.add(id);
      const pp = prev?.players.get(id);
      let x = pc.x;
      let y = pc.y;
      if (pp && spanSec > 0 && pc.state !== BANSUNG_STATE_DEAD) {
        const dx = pc.x - pp.x;
        const dy = pc.y - pp.y;
        if (Math.hypot(dx, dy) <= maxDist) {
          x += (dx / spanSec) * 0.7 * extrapSec;
          y += (dy / spanSec) * 0.7 * extrapSec;
        }
      }
      this.upsertPlayer(pc, x, y, pc.aim, now);
    }
    for (const id of this.players.keys()) {
      if (!this.seenPlayerIds.has(id)) {
        this.players.delete(id);
        this.spawnTimes.delete(`p:${id}`);
      }
    }

    // --- Enemies ---
    this.seenEnemyIds.clear();
    for (const [id, ec] of curr.enemies) {
      this.seenEnemyIds.add(id);
      const ep = prev?.enemies.get(id);
      let x = ec.x;
      let y = ec.y;
      if (ep && spanSec > 0) {
        const dx = ec.x - ep.x;
        const dy = ec.y - ep.y;
        if (Math.hypot(dx, dy) <= maxDist) {
          x += (dx / spanSec) * 0.7 * extrapSec;
          y += (dy / spanSec) * 0.7 * extrapSec;
        }
      }
      this.upsertEnemy(ec, x, y, ec.aim, now);
    }
    for (const id of this.enemies.keys()) {
      if (!this.seenEnemyIds.has(id)) {
        this.enemies.delete(id);
        this.spawnTimes.delete(`e:${id}`);
      }
    }

    // --- Bullets ---
    this.seenBulletIds.clear();
    for (const [id, bc] of curr.bullets) {
      this.seenBulletIds.add(id);
      const x = bc.x + bc.vx * extrapSec;
      const y = bc.y + bc.vy * extrapSec;
      this.upsertBullet(bc, x, y, bc.aim, now);
    }
    for (const id of this.bullets.keys()) {
      if (!this.seenBulletIds.has(id)) {
        this.bullets.delete(id);
        this.spawnTimes.delete(`b:${id}`);
      }
    }

    // --- Boss ---
    if (curr.boss) {
      let bx = curr.boss.x;
      let by = curr.boss.y;
      if (prev?.boss && prev.boss.id === curr.boss.id && spanSec > 0) {
        const dx = curr.boss.x - prev.boss.x;
        const dy = curr.boss.y - prev.boss.y;
        if (Math.hypot(dx, dy) <= maxDist) {
          bx += (dx / spanSec) * 0.7 * extrapSec;
          by += (dy / spanSec) * 0.7 * extrapSec;
        }
      }
      this.boss = copyBossWithPose(curr.boss, bx, by, curr.boss.aim);
    } else {
      this.boss = undefined;
    }

    if (curr.bosses.length === 0) {
      if (this.bosses.length > 0) this.bosses = [];
    } else {
      this.bosses = curr.bosses.map((cb) => {
        let bx = cb.x;
        let by = cb.y;
        const pb = prev?.bosses.find((x) => x.id === cb.id);
        if (pb && spanSec > 0) {
          const dx = cb.x - pb.x;
          const dy = cb.y - pb.y;
          if (Math.hypot(dx, dy) <= maxDist) {
            bx += (dx / spanSec) * 0.7 * extrapSec;
            by += (dy / spanSec) * 0.7 * extrapSec;
          }
        }
        return copyBossWithPose(cb, bx, by, cb.aim);
      });
    }

    this.props = curr.props;
    this.pickups = curr.pickups;
    this.pets = curr.pets;
    this.hazards = curr.hazards;
    this.telegraphs = curr.telegraphs;
  }

  private getSpawnAlpha(key: string, now: number): number {
    let t0 = this.spawnTimes.get(key);
    if (t0 === undefined) {
      t0 = now;
      this.spawnTimes.set(key, t0);
    }
    return clamp((now - t0) / SPAWN_ALPHA_RAMP_MS, 0, 1);
  }

  private upsertPlayer(src: SnapPlayer, x: number, y: number, aim: number, now: number): void {
    const existing = this.players.get(src.idx);
    const spawnAlpha = this.getSpawnAlpha(`p:${src.idx}`, now);
    const prevLeft = existing ? existing.facingLeft : (src.flags & BANSUNG_PFLAG_LEFT) !== 0;
    const facingRight = solveFacing(!prevLeft, Math.cos(aim), Math.sin(aim));
    let flags = src.flags;
    if (src.idx === this.myIdx && this.me) {
      const slot = this.me.slots?.[this.me.slotIdx];
      const localReloading =
        Boolean(slot && slot.maxClip > 0) &&
        this.me.reloadTotalMs > 0 &&
        this.me.reloadMs > 0 &&
        src.state !== BANSUNG_STATE_DEAD &&
        src.state !== BANSUNG_STATE_DOWNED;
      if (localReloading) flags |= BANSUNG_PFLAG_RELOADING;
      else flags &= ~BANSUNG_PFLAG_RELOADING;
    } else if (src.state === BANSUNG_STATE_DEAD || src.state === BANSUNG_STATE_DOWNED) {
      flags &= ~BANSUNG_PFLAG_RELOADING;
    }

    if (!existing) {
      this.players.set(src.idx, {
        ...src,
        flags,
        x,
        y,
        aim,
        phase: 0,
        facingLeft: !facingRight,
        spawnAlpha,
        atkAt: (flags & BANSUNG_PFLAG_FIRING) !== 0 ? now : 0,
        hitFlashAt: (flags & BANSUNG_PFLAG_HIT_FLASH) !== 0 ? now : 0,
      });
      return;
    }

    const moved = Math.hypot(x - existing.x, y - existing.y);
    existing.x = x;
    existing.y = y;
    existing.aim = aim;
    existing.hp = src.hp;
    existing.shield = src.shield;
    existing.armor = src.shield;
    existing.state = src.state;
    existing.flags = flags;
    existing.heroIdx = src.heroIdx;
    existing.weaponIdx = src.weaponIdx;
    existing.revivePct = src.revivePct;
    existing.weaponTier = src.weaponTier;
    existing.phase += moved * 0.08;
    existing.facingLeft = !facingRight;
    existing.spawnAlpha = spawnAlpha;
    if ((flags & BANSUNG_PFLAG_FIRING) !== 0) existing.atkAt = now;
    if ((flags & BANSUNG_PFLAG_HIT_FLASH) !== 0) existing.hitFlashAt = now;
  }

  private upsertEnemy(src: SnapEnemy, x: number, y: number, aim: number, now: number): void {
    const existing = this.enemies.get(src.id);
    const spawnAlpha = this.getSpawnAlpha(`e:${src.id}`, now);
    const facingLeft = (src.flags & BANSUNG_EFLAG_LEFT) !== 0;

    if (!existing) {
      this.enemies.set(src.id, {
        ...src,
        x,
        y,
        aim,
        phase: (src.id * 1.7) % 6,
        facingLeft,
        spawnAlpha,
      });
      return;
    }

    const moved = Math.hypot(x - existing.x, y - existing.y);
    existing.kind = src.kind;
    existing.enemyId = src.enemyId;
    existing.x = x;
    existing.y = y;
    existing.hpPct = src.hpPct;
    existing.aim = aim;
    existing.state = src.state;
    existing.flags = src.flags;
    existing.level = src.level;
    existing.phase += moved * 0.08;
    existing.facingLeft = facingLeft;
    existing.spawnAlpha = spawnAlpha;
    if ((src.flags & BANSUNG_EFLAG_HIT_FLASH) !== 0) {
      // Reflected directly on flags for renderer white-tint overlay
    }
  }

  private upsertBullet(src: SnapBullet, x: number, y: number, aim: number, now: number): void {
    const existing = this.bullets.get(src.id);
    const spawnAlpha = this.getSpawnAlpha(`b:${src.id}`, now);
    if (!existing) {
      this.bullets.set(src.id, { ...src, x, y, aim, spawnAlpha });
      return;
    }
    existing.kind = src.kind;
    existing.x = x;
    existing.y = y;
    existing.aim = aim;
    existing.vx = src.vx;
    existing.vy = src.vy;
    existing.flags = src.flags;
    existing.spawnAlpha = spawnAlpha;
  }

  private flushTimedFx(now: number): void {
    const oldest = this.oldestSnap();
    const thresholdTick = oldest ? Math.max(this.renderTick, oldest.tick) : this.renderTick;
    for (let i = 0; i < this.ringCount; i++) {
      const snap = this.snapAt(i);
      if (!snap || snap.fxConsumed) continue;
      if (snap.tick <= thresholdTick) {
        this.consumeSnapshotFx(snap, now);
      }
    }
  }

  private consumeSnapshotFx(snap: ParsedSnapshot, now: number): void {
    snap.fxConsumed = true;
    if (snap.fxRaw.length < BANSUNG_FX_FIELDS) return;

    const batch: SnapFxEvent[] = [];
    decodeFxArray(snap.fxRaw, snap.tick, batch);
    if (batch.length === 0) return;

    for (let i = 0; i < batch.length; i++) {
      const evt = batch[i];
      if (evt.type === FX_PING) {
        this.pings.push({
          id: this.pingIdSeq++,
          ownerIdx: evt.a,
          kind: evt.b as BansungPingKind,
          x: evt.c,
          y: evt.d,
          expiresAt: now + PING_TTL_MS,
        });
        if (this.pings.length > MAX_ACTIVE_PINGS) {
          this.pings.splice(0, this.pings.length - MAX_ACTIVE_PINGS);
        }
      }
      this.pendingFx.push(evt);
    }
    if (this.pendingFx.length > MAX_PENDING_FX) {
      this.pendingFx.splice(0, this.pendingFx.length - MAX_PENDING_FX);
    }
    if (this.fxListeners.size > 0) {
      this.fxListeners.forEach((cb) => cb(batch));
    }
  }

  private stepLocalPrediction(dtSec: number): void {
    if (this.myIdx === undefined) return;
    const local = this.players.get(this.myIdx);
    if (!local) return;

    if (dtSec > 0) {
      const decay = Math.exp(-14 * dtSec);
      this.corrOffsetX *= decay;
      this.corrOffsetY *= decay;
      if (Math.abs(this.corrOffsetX) < 0.05) this.corrOffsetX = 0;
      if (Math.abs(this.corrOffsetY) < 0.05) this.corrOffsetY = 0;
    }

    const serverControlled =
      local.state === BANSUNG_STATE_DEAD ||
      local.state === BANSUNG_STATE_STUN ||
      local.state === BANSUNG_STATE_DASH ||
      (local.flags & BANSUNG_PFLAG_DASHING) !== 0;

    if (this.localPredReady && !serverControlled) {
      if (this.liveMoveExternal && dtSec > 0 && (this.liveMoveMx !== 0 || this.liveMoveMy !== 0)) {
        this.predictionUsed = true;
        const effSpeed = this.resolveLocalSpeed();
        if (effSpeed > 0) {
          const [px, py] = this.integrateMove(
            this.localPredX,
            this.localPredY,
            this.liveMoveMx,
            this.liveMoveMy,
            effSpeed,
            dtSec,
          );
          this.localPredX = px;
          this.localPredY = py;
          this.liveMoveUnqueuedDtSec = Math.min(0.12, this.liveMoveUnqueuedDtSec + dtSec);
        }
      }
    }

    if (this.predictionUsed && this.localPredReady && !serverControlled) {
      this.localDrawX = this.localPredX + this.corrOffsetX;
      this.localDrawY = this.localPredY + this.corrOffsetY;
      local.x = this.localDrawX;
      local.y = this.localDrawY;
    } else {
      this.localDrawX = local.x;
      this.localDrawY = local.y;
      if (serverControlled) {
        this.localPredX = local.x;
        this.localPredY = local.y;
        this.corrOffsetX = 0;
        this.corrOffsetY = 0;
        this.liveMoveUnqueuedDtSec = 0;
      }
    }
  }

  private stepLocalAim(): void {
    if (this.myIdx === undefined) return;
    const local = this.players.get(this.myIdx);
    if (!local || local.state === BANSUNG_STATE_DEAD) return;

    if (this.aimMode === 'pointer' && this.pointerScreen.active) {
      const world = screenToWorld(
        this.pointerScreen.x,
        this.pointerScreen.y,
        this.cam,
        this.viewW,
        this.viewH,
      );
      this.localAimWorld.x = world.x;
      this.localAimWorld.y = world.y;
      const dx = world.x - this.localDrawX;
      const dy = world.y - this.localDrawY;
      if (dx * dx + dy * dy > 1e-4) {
        this.localAimRad = Math.atan2(dy, dx);
        this.updateLocalFacingFromAim(this.localAimRad);
      }
    } else if (this.aimMode === 'stick' && this.stickAim.active && this.stickAim.mag > 0.18) {
      this.localAimRad = this.stickAim.rad;
      this.localAimWorld.x = this.localDrawX + Math.cos(this.localAimRad) * 160;
      this.localAimWorld.y = this.localDrawY + Math.sin(this.localAimRad) * 160;
      this.updateLocalFacingFromAim(this.localAimRad);
    }

    if (this.aimOverrideTouched) {
      local.aim = this.localAimRad;
      local.facingLeft = this.localFacingLeft;
    } else {
      this.localAimRad = local.aim;
      this.localFacingLeft = local.facingLeft;
    }
  }

  // --------------------------------------------------------------------------
  // Camera, Screen Shake & Spectator Follow Switcher
  // --------------------------------------------------------------------------

  /** Adds trauma camera shake (`shakeMag <= 24`) with optional directional kick. */
  addShake(trauma: number, dirRad?: number): void {
    if (!Number.isFinite(trauma) || trauma <= 0) return;
    const mult = this.cam.mode === 'spectate' ? 0.5 : 1;
    this.cam.shakeMag = Math.min(24, this.cam.shakeMag + trauma * mult);
    if (dirRad !== undefined && Number.isFinite(dirRad)) {
      const kick = Math.min(6, trauma * 0.45) * mult * (this.reducedMotion ? 0.25 : 1);
      this.cam.x -= Math.cos(dirRad) * kick;
      this.cam.y -= Math.sin(dirRad) * kick;
    }
  }

  /** Toggles reduced-motion scaling for camera shake. */
  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
  }

  /** Sets camera zoom clamped to `[0.75, 2.5]`. */
  setCameraZoom(zoom: number): number {
    if (Number.isFinite(zoom)) {
      this.cam.zoom = clamp(zoom, BANSUNG_ZOOM_MIN, BANSUNG_ZOOM_MAX);
      this.clampCamera();
    }
    return this.cam.zoom;
  }

  /** Multiplies camera zoom by `factor` (wheel/pinch) within `[0.75, 2.5]`. */
  adjustZoom(factor: number): number {
    if (!Number.isFinite(factor) || factor <= 0) return this.cam.zoom;
    return this.setCameraZoom(this.cam.zoom * factor);
  }

  /** Returns camera with `(x, y)` snapped to `1 / dpr` grid (`d08`). */
  snappedCam(dpr = 1): BansungCamera {
    return snapCam(this.cam, dpr);
  }

  /** Current spectator banner metadata for `BansungBoard.tsx` (`d08` / `d45`). */
  get spectatingInfo(): BansungSpectatingInfo {
    const active = this.cam.mode !== 'self';
    const targetIdx = this.cam.mode === 'spectate' ? this.cam.followIdx : null;
    const rosterEntry =
      targetIdx !== null ? this.playerRoster.find((p) => p.idx === targetIdx) : undefined;
    const targetName =
      this.cam.mode === 'free'
        ? 'Camera Tự Do'
        : rosterEntry?.name ??
          (targetIdx !== null ? `Player ${targetIdx + 1}` : this.boss ? this.boss.kind : 'Arena');
    const canCycle = this.getSpectatableCandidates().length > 1;
    return {
      active,
      mode: this.cam.mode,
      targetIdx,
      targetName,
      canCycle,
    };
  }

  /** Switches spectator camera to a specific teammate index (`d08` / `d45`). */
  spectatePlayer(idx: number): boolean {
    const p = this.players.get(idx);
    if (!p || p.state === BANSUNG_STATE_DEAD) return false;
    this.cam.mode = 'spectate';
    this.cam.followIdx = idx;
    this.cam.deadSinceAt = 0;
    this.syncSpectateNotify();
    return true;
  }

  /** Alias of `spectatePlayer(idx)` matching `d45` HUD squad-strip call site. */
  setSpectate(idx: number): boolean {
    return this.spectatePlayer(idx);
  }

  /** Cycles spectator target forward (`+1`) or backward (`-1`). Returns new `targetIdx`. */
  spectateCycle(delta: 1 | -1 = 1): number | null {
    const candidates = this.getSpectatableCandidates();
    if (candidates.length === 0) {
      this.cam.mode = 'spectate';
      this.cam.followIdx = null;
      this.cam.deadSinceAt = 0;
      this.syncSpectateNotify();
      return null;
    }
    const curIdx = candidates.findIndex((p) => p.idx === this.cam.followIdx);
    const nextPos =
      curIdx === -1
        ? 0
        : (curIdx + delta + candidates.length) % candidates.length;
    const chosen = candidates[nextPos];
    this.cam.mode = 'spectate';
    this.cam.followIdx = chosen.idx;
    this.cam.deadSinceAt = 0;
    this.syncSpectateNotify();
    return chosen.idx;
  }

  /** Switches spectator camera to `'free'` pan mode and optionally offsets `(dx, dy)` in world px. */
  spectateFree(dx = 0, dy = 0): void {
    if (this.cam.mode === 'self') return;
    this.cam.mode = 'free';
    this.cam.x += dx;
    this.cam.y += dy;
    this.clampCamera();
    this.syncSpectateNotify();
  }

  /** Re-locks `'free'` camera back onto `'spectate'` follow target (`Space` key). */
  spectateRelock(): number | null {
    if (this.cam.mode === 'self') return this.myIdx ?? null;
    this.cam.mode = 'spectate';
    const current =
      this.cam.followIdx !== null ? this.players.get(this.cam.followIdx) : undefined;
    if (!current || current.state === BANSUNG_STATE_DEAD) {
      this.pickNextTarget();
    }
    this.syncSpectateNotify();
    return this.cam.followIdx;
  }

  private getSpectatableCandidates(): InterpPlayer[] {
    const aliveHumans: InterpPlayer[] = [];
    const aliveBots: InterpPlayer[] = [];
    const downedHumans: InterpPlayer[] = [];
    const downedBots: InterpPlayer[] = [];

    for (const p of this.players.values()) {
      if (p.state === BANSUNG_STATE_DEAD) continue;
      const isBot = (p.flags & BANSUNG_PFLAG_BOT) !== 0;
      const isDowned = p.state === BANSUNG_STATE_DOWNED;
      if (!isDowned) {
        if (isBot) aliveBots.push(p);
        else aliveHumans.push(p);
      } else {
        if (isBot) downedBots.push(p);
        else downedHumans.push(p);
      }
    }

    const byIdx = (a: InterpPlayer, b: InterpPlayer) => a.idx - b.idx;
    aliveHumans.sort(byIdx);
    aliveBots.sort(byIdx);
    downedHumans.sort(byIdx);
    downedBots.sort(byIdx);

    if (aliveHumans.length > 0 || aliveBots.length > 0) {
      return [...aliveHumans, ...aliveBots];
    }
    return [...downedHumans, ...downedBots];
  }

  private pickNextTarget(): number | null {
    const candidates = this.getSpectatableCandidates();
    if (candidates.length > 0) {
      this.cam.followIdx = candidates[0].idx;
      this.cam.deadSinceAt = 0;
      return this.cam.followIdx;
    }
    this.cam.followIdx = null;
    this.cam.deadSinceAt = 0;
    return null;
  }

  private stepSpectatorAndCamera(dtSec: number, now: number): void {
    const local = this.myIdx !== undefined ? this.players.get(this.myIdx) : undefined;
    const localAliveOrDowned = !!local && local.state !== BANSUNG_STATE_DEAD;

    if (localAliveOrDowned) {
      if (this.cam.mode !== 'self') {
        this.cam.mode = 'self';
        this.cam.followIdx = this.myIdx ?? null;
        this.cam.deadSinceAt = 0;
      }
    } else if (this.cam.mode === 'self') {
      // Local died or viewer is pure spectator -> enter spectate
      this.cam.mode = 'spectate';
      if (this.myIdx === undefined) {
        this.pickNextTarget();
      } else {
        this.cam.followIdx = this.myIdx;
        this.cam.deadSinceAt = now;
      }
    }

    if (this.cam.mode === 'spectate') {
      if (this.cam.followIdx === null) {
        this.pickNextTarget();
      } else {
        const target = this.players.get(this.cam.followIdx);
        if (!target) {
          this.pickNextTarget();
        } else if (target.state === BANSUNG_STATE_DEAD) {
          if (this.cam.deadSinceAt === 0) {
            this.cam.deadSinceAt = now;
          } else if (now - this.cam.deadSinceAt >= AUTO_SPECTATE_DELAY_MS) {
            this.pickNextTarget();
          }
        } else {
          this.cam.deadSinceAt = 0;
        }
      }
    }

    this.syncSpectateNotify();

    // Resolve camera target position and look-ahead offset
    let targetX = this.cam.x;
    let targetY = this.cam.y;
    let desiredLookX = 0;
    let desiredLookY = 0;

    if (this.cam.mode === 'self' && local) {
      targetX = this.localDrawX;
      targetY = this.localDrawY;

      const isDowned = local.state === BANSUNG_STATE_DOWNED;
      const mobileIdle = this.aimMode === 'stick' && (!this.stickAim.active || this.stickAim.mag <= 0.18);
      if (!isDowned && !mobileIdle && this.aimOverrideTouched) {
        let lookMag = 0;
        if (this.aimMode === 'stick') {
          lookMag = MAX_LOOK_AHEAD_PX * 0.7 * clamp(this.stickAim.mag, 0, 1);
        } else {
          const aimDist = Math.hypot(
            this.localAimWorld.x - this.localDrawX,
            this.localAimWorld.y - this.localDrawY,
          );
          lookMag = clamp(aimDist * 0.22, 0, MAX_LOOK_AHEAD_PX);
        }
        desiredLookX = Math.cos(this.localAimRad) * lookMag;
        desiredLookY = Math.sin(this.localAimRad) * lookMag;
      }
    } else if (this.cam.mode === 'spectate') {
      const followed =
        this.cam.followIdx !== null ? this.players.get(this.cam.followIdx) : undefined;
      if (followed) {
        targetX = followed.x;
        targetY = followed.y;
      } else if (this.boss) {
        targetX = this.boss.x;
        targetY = this.boss.y;
      } else {
        targetX = this.mapW * 0.5;
        targetY = this.mapH * 0.5;
      }
    }

    const lookEase = 1 - Math.exp(-7 * dtSec);
    this.cam.lookX += (desiredLookX - this.cam.lookX) * lookEase;
    this.cam.lookY += (desiredLookY - this.cam.lookY) * lookEase;

    if (this.cam.mode !== 'free') {
      const followEase = 1 - Math.exp(-16 * dtSec);
      this.cam.x += (targetX + this.cam.lookX - this.cam.x) * followEase;
      this.cam.y += (targetY + this.cam.lookY - this.cam.y) * followEase;
    }

    this.clampCamera();

    // Trauma screen shake decay
    this.cam.shakeMag *= Math.exp(-12 * dtSec);
    if (this.cam.shakeMag < 0.05) {
      this.cam.shakeMag = 0;
      this.cam.shakeX = 0;
      this.cam.shakeY = 0;
    } else {
      const motionScale = this.reducedMotion ? 0.25 : 1;
      this.cam.shakeX =
        (Math.sin(now * 0.053) * 0.6 + Math.cos(now * 0.097) * 0.4) *
        this.cam.shakeMag *
        motionScale;
      this.cam.shakeY =
        (Math.cos(now * 0.061) * 0.6 + Math.sin(now * 0.089) * 0.4) *
        this.cam.shakeMag *
        motionScale;
    }
  }

  private clampCamera(): void {
    const halfW = (this.viewW * 0.5) / Math.max(0.1, this.cam.zoom);
    const halfH = (this.viewH * 0.5) / Math.max(0.1, this.cam.zoom);

    if (this.mapW <= halfW * 2) {
      this.cam.x = this.mapW * 0.5;
    } else {
      this.cam.x = clamp(this.cam.x, halfW - CAM_MARGIN_PX, this.mapW - halfW + CAM_MARGIN_PX);
    }

    if (this.mapH <= halfH * 2) {
      this.cam.y = this.mapH * 0.5;
    } else {
      this.cam.y = clamp(this.cam.y, halfH - CAM_MARGIN_PX, this.mapH - halfH + CAM_MARGIN_PX);
    }
  }

  private syncSpectateNotify(): void {
    const key = `${this.cam.mode}:${this.cam.followIdx ?? 'none'}`;
    if (key !== this.lastSpecKey) {
      this.lastSpecKey = key;
      this.scheduleHudNotify(true);
    }
  }

  private pruneExpiredPings(now: number): void {
    if (this.pings.length === 0) return;
    let write = 0;
    for (let i = 0; i < this.pings.length; i++) {
      if (this.pings[i].expiresAt > now) {
        this.pings[write++] = this.pings[i];
      }
    }
    this.pings.length = write;
  }

  private updateTelemetryCounters(): void {
    this.metrics.interpDelayMs = Math.round(this.interpDelayMs);
    this.metrics.jitterMs = Number(this.jitterMs.toFixed(1));
    this.metrics.extrapMs = Math.round(this.extrapMs);
    this.metrics.extrapolating = this.extrapolating;
    this.metrics.ringCount = this.ringCount;
    this.metrics.pendingInputs = this.inputCount;
    this.metrics.renderTick = Number(this.renderTick.toFixed(2));
    this.metrics.latestTick = this.newestSnap()?.tick ?? 0;
  }
}

// ============================================================================
// 6. Singleton Store & React 15Hz HUD Subscribe Hook
// ============================================================================

/** Singleton Bansung client state store consumed by render, input, sound, and React HUD. */
export const bansungStore = new BansungStore();

const readHudSnapshot = (): BansungHudSnapshot => bansungStore.getHudSnapshot();

/**
 * React hook subscribing to `bansungStore` HUD updates throttled to 15Hz (`~67ms`),
 * keeping high-frequency 60Hz Canvas reads completely decoupled from React renders.
 */
export function useBansungHud(throttleMs = HUD_THROTTLE_MS): BansungHudSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => bansungStore.subscribeHud(onStoreChange, throttleMs),
    [throttleMs],
  );
  return useSyncExternalStore(subscribe, readHudSnapshot, readHudSnapshot);
}
