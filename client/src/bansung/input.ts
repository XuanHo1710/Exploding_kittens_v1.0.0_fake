/**
 * Unified PC + Mobile input controller for `bansung` (Bắn Súng Co-op).
 *
 * Implements spec d44 aligned with `shared/src/bansung/types.ts` and `client/src/bansung/store.ts`:
 * - Desktop: WASD/Arrows normalized movement, Mouse `toWorld` 60fps aim, LMB fire,
 *   RMB/Space dash, 1-5 & 90ms-debounced Wheel weapon hotbar (Ctrl+Wheel zoom),
 *   Q gadget/skill, E interact/use, R active-reload, G/Middle-Click tactical ping,
 *   Tab scoreboard, Enter chat, Escape modal, M minimap, plus downed/spectator modes.
 * - Mobile: Pointer-captured twin-stick touch manager (left floating move stick with
 *   0.14 deadzone remap & 1.6*R soft-follow; right Soul-Knight tap=auto-aim / drag=manual
 *   fire pad), Smart Auto-Aim with AABB LOS raymarch & boss/low-HP priority scoring.
 * - Bitmask builder & coalescing emitter: 30Hz coalesced `{ t: 'in' }` continuous
 *   updates, immediate rising/falling fire & discrete edge commands, 100ms active heartbeat.
 */
import {
  BANSUNG_DASH,
  BANSUNG_ENEMIES,
  BANSUNG_HERO_IDS,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PING_ENEMY,
  BANSUNG_PING_HELP,
  BANSUNG_PING_LOOT,
  BANSUNG_PING_REVIVE,
  BANSUNG_STATE_DEAD,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_WEAPONS,
  getBansungHero,
  quantizeAim,
  wrapPi,
  type BansungCommand,
  type BansungPerkId,
  type BansungPingKind,
} from '../../../shared/src';
import {
  bansungStore,
  clamp,
  lerpAngle,
  screenToWorld,
  type BansungStore,
  type StaticObstacleBox,
} from './store';

// ============================================================================
// 1. Constants & Public Schemas (d44)
// ============================================================================

/** Continuous input emit cadence matching the 30Hz authoritative server tick. */
export const BANSUNG_INPUT_HZ = 30;
/** Minimum interval in ms between coalesced continuous `{ t: 'in' }` emissions. */
export const BANSUNG_INPUT_INTERVAL_MS = Math.round(1000 / BANSUNG_INPUT_HZ);
/** Active movement/fire keepalive heartbeat interval (ms). */
export const BANSUNG_HEARTBEAT_MS = 100;
/** Minimum angular delta (~1.03 deg / 18 mrad) triggering a dirty aim emit at 30Hz. */
export const BANSUNG_AIM_DIRTY_RAD = 0.018;
/** Mouse wheel weapon-cycle debounce interval (ms). */
export const BANSUNG_WHEEL_DEBOUNCE_MS = 90;

/** Input action bitmask flags built across keyboard/mouse and virtual touch pads. */
export const BANSUNG_BTN_FIRE = 1 << 0; // 1: LMB / Right-stick fire
export const BANSUNG_BTN_DASH = 1 << 1; // 2: RMB / Space / Dash button
export const BANSUNG_BTN_SKILL = 1 << 2; // 4: Q / Skill button
export const BANSUNG_BTN_INTERACT = 1 << 3; // 8: E / Revive / Crate / Swap pickup
export const BANSUNG_BTN_RELOAD = 1 << 4; // 16: R / Active-reload check
export const BANSUNG_BTN_HERO_SKILL = 1 << 5; // 32: F / Hero signature skill

/** Mobile twin-stick geometry & deadzone constants (d44). */
export const BANSUNG_TOUCH_R_MOVE = 56;
export const BANSUNG_TOUCH_R_MOVE_COMPACT = 46;
export const BANSUNG_TOUCH_KNOB_MOVE = 22;
export const BANSUNG_TOUCH_DZ_MOVE = 0.14;
export const BANSUNG_TOUCH_FOLLOW_MULT = 1.6;
export const BANSUNG_TOUCH_R_AIM = 58;
export const BANSUNG_TOUCH_R_AIM_COMPACT = 46;
export const BANSUNG_TOUCH_DZ_AIM = 10;
export const BANSUNG_AUTO_AIM_RANGE = 620;

export const BANSUNG_INPUT_MODE_STORAGE_KEY = 'bansung.inputMode';

const COMPACT_VIEW_H = 520;
const AUTO_AIM_SLEW_RAD_S = 22;
const SPECTATOR_PAN_PX_S = 520;

export type BansungInputMode = 'auto' | 'touch' | 'desktop';
export type BansungUiAction = 'scoreboard' | 'chat' | 'escape' | 'minimap';

export interface TouchStickState {
  active: boolean;
  ox: number;
  oy: number;
  kx: number;
  ky: number;
}

export interface TouchAimStickState extends TouchStickState {
  manual: boolean;
}

export interface InputViewState {
  touchUi: boolean;
  touchOverride: BansungInputMode;
  moveStick: TouchStickState;
  aimStick: TouchAimStickState;
  /** 60fps local aim in radians for zero-latency hero gun & crosshair. */
  aimRad: number;
  /** World-space aim coordinates (cursor or projected target). */
  aimWorldX: number;
  aimWorldY: number;
  /** Quantized 12-bit aim integer `[0, 4095]`. */
  aimQ: number;
  /** Normalized movement axes in `[-100, 100]` (`hypot(mx, my) <= 100`). */
  mx: number;
  my: number;
  /** Current combined `BANSUNG_BTN_*` bitmask. */
  buttons: number;
  /** Entity ID locked by Soul-Knight mobile auto-aim, or `null`. */
  autoAimTargetId: number | null;
  autoAimTargetX: number;
  autoAimTargetY: number;
  /** Locally tracked hotbar slot `[0..4]`. */
  activeSlot: number;
  /** True while `Tab` scoreboard key is held. */
  scoreboardOpen: boolean;
}

export interface AutoAimTarget {
  id: number;
  x: number;
  y: number;
  dist: number;
  score: number;
  isBoss: boolean;
}

export interface BansungInputOptions {
  store?: BansungStore;
  touchOverride?: BansungInputMode;
  onUiAction?: (action: BansungUiAction, active?: boolean) => void;
}

interface TouchSlot {
  pointerId: number;
  role: 'move' | 'aim';
  ox: number;
  oy: number;
  kx: number;
  ky: number;
  manual: boolean;
}

interface LastSentState {
  hasSent: boolean;
  atMs: number;
  mx: number;
  my: number;
  aimRad: number;
  aimQ: number;
  fire: 0 | 1;
}

// ============================================================================
// 2. Pure Input, Bitmask, LOS & Smart Auto-Aim Helpers
// ============================================================================

/** Normalizes a raw movement vector `(dx, dy)` into integer `[-100..100]` axes with `hypot <= 100`. */
export function normalizeMoveVector(dx: number, dy: number): { mx: number; my: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { mx: 0, my: 0 };
  }
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) {
    return { mx: 0, my: 0 };
  }
  let nx = dx;
  let ny = dy;
  if (len > 1) {
    nx /= len;
    ny /= len;
  }
  let mx = Math.round(nx * 100);
  let my = Math.round(ny * 100);
  const hypot = Math.hypot(mx, my);
  if (hypot > 100) {
    const scale = 100 / hypot;
    mx = Math.trunc(mx * scale);
    my = Math.trunc(my * scale);
  }
  return {
    mx: mx === 0 ? 0 : mx,
    my: my === 0 ? 0 : my,
  };
}

/** Builds a `BANSUNG_BTN_*` bitmask from boolean action states. */
export function buildButtonMask(flags: {
  fire?: boolean;
  dash?: boolean;
  skill?: boolean;
  heroSkill?: boolean;
  interact?: boolean;
  reload?: boolean;
}): number {
  let mask = 0;
  if (flags.fire) mask |= BANSUNG_BTN_FIRE;
  if (flags.dash) mask |= BANSUNG_BTN_DASH;
  if (flags.skill) mask |= BANSUNG_BTN_SKILL;
  if (flags.heroSkill) mask |= BANSUNG_BTN_HERO_SKILL;
  if (flags.interact) mask |= BANSUNG_BTN_INTERACT;
  if (flags.reload) mask |= BANSUNG_BTN_RELOAD;
  return mask;
}

function segmentIntersectsBox(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  o: StaticObstacleBox,
): boolean {
  let t0 = 0;
  let t1 = 1;
  const xMax = o.x + o.w;
  const yMax = o.y + o.h;

  if (Math.abs(dx) < 1e-9) {
    if (x0 < o.x || x0 > xMax) return false;
  } else {
    const inv = 1 / dx;
    const a = (o.x - x0) * inv;
    const b = (xMax - x0) * inv;
    const enter = a < b ? a : b;
    const exit = a > b ? a : b;
    if (enter > t0) t0 = enter;
    if (exit < t1) t1 = exit;
    if (t0 > t1) return false;
  }

  if (Math.abs(dy) < 1e-9) {
    if (y0 < o.y || y0 > yMax) return false;
  } else {
    const inv = 1 / dy;
    const a = (o.y - y0) * inv;
    const b = (yMax - y0) * inv;
    const enter = a < b ? a : b;
    const exit = a > b ? a : b;
    if (enter > t0) t0 = enter;
    if (exit < t1) t1 = exit;
    if (t0 > t1) return false;
  }

  return t0 <= t1 && t1 >= 0 && t0 <= 1;
}

/**
 * Checks unobstructed line-of-sight between `(x0, y0)` and `(x1, y1)` against
 * static cover AABBs in `store.obstacles` (matches `d05` slab raycast).
 */
export function hasClearLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  obstacles: readonly StaticObstacleBox[],
): boolean {
  if (obstacles.length === 0) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const minX = x0 < x1 ? x0 : x1;
  const maxX = x0 > x1 ? x0 : x1;
  const minY = y0 < y1 ? y0 : y1;
  const maxY = y0 > y1 ? y0 : y1;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.x + o.w < minX || o.x > maxX || o.y + o.h < minY || o.y > maxY) {
      continue;
    }
    if (segmentIntersectsBox(x0, y0, dx, dy, o)) {
      return false;
    }
  }
  return true;
}

function resolveAutoAimRange(store: BansungStore): number {
  const me = store.me;
  if (!me) return BANSUNG_AUTO_AIM_RANGE;
  const slot = me.slots[me.slotIdx];
  if (!slot) return BANSUNG_AUTO_AIM_RANGE;
  const spec = BANSUNG_WEAPONS[slot.id];
  if (!spec) return BANSUNG_AUTO_AIM_RANGE;
  return Math.max(220, spec.range + 80);
}

/**
 * Selects the optimal visible enemy/boss target for Soul-Knight mobile auto-aim:
 * `score = dist - (isBoss ? 140 : 0) - (hpPct < 0.25 ? 80 : 0)`, rejecting LOS-blocked candidates.
 */
export function findAutoAimTarget(
  originX: number,
  originY: number,
  store: BansungStore,
  maxRange = resolveAutoAimRange(store),
): AutoAimTarget | null {
  let best: AutoAimTarget | null = null;
  let seenBossId = -1;

  for (const enemy of store.enemies.values()) {
    if (enemy.hpPct <= 0 || enemy.state === BANSUNG_STATE_DEAD) continue;
    const dist = Math.hypot(enemy.x - originX, enemy.y - originY);
    if (dist > maxRange) continue;
    if (!hasClearLineOfSight(originX, originY, enemy.x, enemy.y, store.obstacles)) {
      continue;
    }
    const isBoss = BANSUNG_ENEMIES[enemy.enemyId]?.isBoss ?? false;
    if (isBoss) seenBossId = enemy.id;
    const normHp = clamp(enemy.hpPct / 100, 0, 1);
    const score = dist - (isBoss ? 140 : 0) - (normHp < 0.25 ? 80 : 0);
    if (!best || score < best.score) {
      best = { id: enemy.id, x: enemy.x, y: enemy.y, dist, score, isBoss };
    }
  }

  const bossList = store.bosses?.length ? store.bosses : store.boss ? [store.boss] : [];
  for (const boss of bossList) {
    if (!boss || boss.hp <= 0 || boss.id === seenBossId) continue;
    const dist = Math.hypot(boss.x - originX, boss.y - originY);
    if (dist <= maxRange && hasClearLineOfSight(originX, originY, boss.x, boss.y, store.obstacles)) {
      const normHp = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
      const score = dist - 140 - (normHp < 0.25 ? 80 : 0);
      if (!best || score < best.score) {
        best = { id: boss.id, x: boss.x, y: boss.y, dist, score, isBoss: true };
      }
    }
  }

  return best;
}

/** Detects coarse touch hardware in browser environments (SSR-safe). */
export function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Reads persisted PC/Touch override (`auto | touch | desktop`) safely. */
export function loadSavedInputMode(): BansungInputMode {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(BANSUNG_INPUT_MODE_STORAGE_KEY);
    if (raw === 'touch' || raw === 'desktop' || raw === 'auto') {
      return raw;
    }
  } catch {
    /* ignore storage failures */
  }
  return 'auto';
}

/** Persists manual PC/Touch override (`auto | touch | desktop`) safely. */
export function saveInputMode(mode: BansungInputMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BANSUNG_INPUT_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore storage failures */
  }
}

// ============================================================================
// 3. Key & Focus Helpers
// ============================================================================

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

function resolveMoveKey(code: string, keyLower: string): string | null {
  switch (code) {
    case 'KeyW':
      return 'w';
    case 'KeyA':
      return 'a';
    case 'KeyS':
      return 's';
    case 'KeyD':
      return 'd';
    case 'ArrowUp':
      return 'arrowup';
    case 'ArrowDown':
      return 'arrowdown';
    case 'ArrowLeft':
      return 'arrowleft';
    case 'ArrowRight':
      return 'arrowright';
    default:
      break;
  }
  if (
    keyLower === 'w' ||
    keyLower === 'a' ||
    keyLower === 's' ||
    keyLower === 'd' ||
    keyLower === 'arrowup' ||
    keyLower === 'arrowdown' ||
    keyLower === 'arrowleft' ||
    keyLower === 'arrowright'
  ) {
    return keyLower;
  }
  return null;
}

function resolveSlotKey(code: string, keyLower: string): number {
  switch (code) {
    case 'Digit1':
    case 'Numpad1':
      return 0;
    case 'Digit2':
    case 'Numpad2':
      return 1;
    case 'Digit3':
    case 'Numpad3':
      return 2;
    case 'Digit4':
    case 'Numpad4':
      return 3;
    case 'Digit5':
    case 'Numpad5':
      return 4;
    default:
      break;
  }
  if (keyLower >= '1' && keyLower <= '5') {
    return Number(keyLower) - 1;
  }
  return -1;
}

function isActionKey(
  code: string,
  keyLower: string,
  targetCode: string,
  targetChar: string,
): boolean {
  return code === targetCode || keyLower === targetChar;
}

function nowDefaultMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

// ============================================================================
// 4. BansungInputController
// ============================================================================

/**
 * Unified PC + Mobile input controller producing quantized `BansungCommand`s
 * and zero-latency local aim / touch-stick HUD state.
 */
export class BansungInputController {
  private store: BansungStore;
  private onUiAction?: (action: BansungUiAction, active?: boolean) => void;

  private canvas: HTMLCanvasElement | null = null;
  private emitFn: ((cmd: BansungCommand) => void) | null = null;
  private detachCanvasFn: (() => void) | null = null;

  private alive = true;
  private downed = false;

  // Local origin/camera overrides supplied by BansungBoard (falls back to store)
  private hasExternalOrigin = false;
  private originX = 0;
  private originY = 0;
  private extCam = { x: 0, y: 0, zoom: 1 };

  // Desktop keyboard & pointer state
  private heldMoveKeys = new Set<string>();
  private pointerActive = false;
  private pointerSx = 0;
  private pointerSy = 0;
  private lastWheelSlotAt = -1e9;

  // Bitmask state: physical held bits + latched edges so ultra-fast taps never drop
  private heldButtons = 0;
  private latchedEdges = 0;
  private lastFlushedButtons = 0;
  private virtualFireActive = false;

  // Touch mode & twin-stick tracking
  private touchOverride: BansungInputMode;
  private hasCoarsePointer: boolean;
  private sawTouchPointer = false;
  private touchSlots = new Map<number, TouchSlot>();

  // Continuous coalesced input & prediction timing
  private lastSent: LastSentState = {
    hasSent: false,
    atMs: -1e9,
    mx: 0,
    my: 0,
    aimRad: 0,
    aimQ: 0,
    fire: 0,
  };
  private prevFlushAtMs = 0;
  private lastPredAtMs = 0;
  private lastPredMoving = false;
  private lastDashSentAtMs = -1e9;
  private prevAutoAimLocked = false;
  private lastGachaPickAt = -1e9;
  private txWindowBytes = 0;
  private txWindowStartMs = 0;

  readonly state: InputViewState;

  constructor(opts?: BansungInputOptions) {
    this.store = opts?.store ?? bansungStore;
    this.onUiAction = opts?.onUiAction;
    this.touchOverride = opts?.touchOverride ?? loadSavedInputMode();
    this.hasCoarsePointer = detectCoarsePointer();

    const initDrawX = Number.isFinite(this.store.localDrawX) ? this.store.localDrawX : BANSUNG_MAP_W * 0.5;
    const initDrawY = Number.isFinite(this.store.localDrawY) ? this.store.localDrawY : BANSUNG_MAP_H * 0.5;

    this.state = {
      touchUi: this.computeTouchUi(),
      touchOverride: this.touchOverride,
      moveStick: { active: false, ox: 0, oy: 0, kx: 0, ky: 0 },
      aimStick: { active: false, ox: 0, oy: 0, kx: 0, ky: 0, manual: false },
      aimRad: 0,
      aimWorldX: initDrawX + 160,
      aimWorldY: initDrawY,
      aimQ: 0,
      mx: 0,
      my: 0,
      buttons: 0,
      autoAimTargetId: null,
      autoAimTargetX: 0,
      autoAimTargetY: 0,
      activeSlot: 0,
      scoreboardOpen: false,
    };
  }

  /** Returns a snapshot view of current aim, movement, button bitmask, and touch stick geometry. */
  getViewState(): InputViewState {
    return this.state;
  }

  /** Sets UI action callback (`scoreboard`, `chat`, `escape`, `minimap`). */
  setUiActionHandler(cb?: (action: BansungUiAction, active?: boolean) => void): void {
    this.onUiAction = cb;
  }

  /** Gets the current manual/auto input mode setting (`auto | touch | desktop`). */
  getTouchOverride(): BansungInputMode {
    return this.touchOverride;
  }

  /** Sets and persists manual/auto input mode (`auto | touch | desktop`). */
  setTouchOverride(mode: BansungInputMode): void {
    this.touchOverride = mode;
    this.state.touchOverride = mode;
    saveInputMode(mode);
    this.syncTouchUi();
  }

  /** Updates local player world origin and camera used for cursor `toWorld` projection. */
  setLocalOrigin(
    worldX: number,
    worldY: number,
    cam: { x: number; y: number; zoom: number },
  ): void {
    if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
      this.originX = worldX;
      this.originY = worldY;
    }
    if (Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.zoom)) {
      this.extCam.x = cam.x;
      this.extCam.y = cam.y;
      this.extCam.zoom = cam.zoom;
    }
    this.hasExternalOrigin = true;
  }

  /** Updates alive/downed life state, gating combat inputs and enabling spectator controls. */
  setAlive(alive: boolean, downed: boolean): void {
    const nextAlive = Boolean(alive);
    const nextDowned = nextAlive && Boolean(downed);
    if (this.alive === nextAlive && this.downed === nextDowned) return;

    this.alive = nextAlive;
    this.downed = nextDowned;

    if (!nextAlive || nextDowned) {
      const combatMask =
        BANSUNG_BTN_FIRE |
        BANSUNG_BTN_DASH |
        BANSUNG_BTN_SKILL |
        BANSUNG_BTN_HERO_SKILL |
        BANSUNG_BTN_INTERACT |
        BANSUNG_BTN_RELOAD;
      this.heldButtons &= ~combatMask;
      this.latchedEdges &= ~combatMask;
      this.virtualFireActive = false;
      this.clearTouchRole('aim');
      if (!nextAlive) {
        this.heldMoveKeys.clear();
        this.clearTouchRole('move');
      }
      this.syncStateVectorAndMask();
      this.prevAutoAimLocked = false;
      this.state.autoAimTargetId = null;

      if (
        this.emitFn &&
        this.lastSent.hasSent &&
        (this.lastSent.fire === 1 || (!nextAlive && (this.lastSent.mx !== 0 || this.lastSent.my !== 0)))
      ) {
        const mx = nextAlive ? this.state.mx : 0;
        const my = nextAlive ? this.state.my : 0;
        this.emitMoveCmd(mx, my, this.state.aimRad, 0, nowDefaultMs(), 0);
      }
    }
  }

  /**
   * Attaches desktop keyboard/mouse and canvas touch listeners.
   * Returns a cleanup function removing all registered listeners.
   */
  attach(
    canvas: HTMLCanvasElement,
    emit: (cmd: BansungCommand) => void,
    opts?: BansungInputOptions,
  ): () => void {
    this.detachCanvasFn?.();

    if (opts?.store) this.store = opts.store;
    if (opts?.touchOverride) this.setTouchOverride(opts.touchOverride);
    if (opts?.onUiAction) this.onUiAction = opts.onUiAction;

    this.canvas = canvas;
    this.emitFn = emit;
    this.syncCanvasViewport();

    const onPointerDown = (e: PointerEvent) => this.handleCanvasPointerDown(e);
    const onPointerMove = (e: PointerEvent) => this.handleCanvasPointerMove(e);
    const onPointerUp = (e: PointerEvent) => this.handleCanvasPointerUp(e, false);
    const onPointerCancel = (e: PointerEvent) => this.handleCanvasPointerUp(e, true);
    const onWheel = (e: WheelEvent) => this.handleWheel(e);
    const onContextMenu = (e: Event) => e.preventDefault();

    const onWindowKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onWindowKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') {
        if (e.button === 0) this.heldButtons &= ~BANSUNG_BTN_FIRE;
        else if (e.button === 2) this.heldButtons &= ~BANSUNG_BTN_DASH;
      } else if (this.touchSlots.has(e.pointerId)) {
        this.endTouchSlot(e.pointerId);
      }
      this.syncStateVectorAndMask();
    };
    const onBlur = () => this.resetAll();
    const onResize = () => this.syncCanvasViewport();
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.resetAll();
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    let mediaCleanup: (() => void) | undefined;
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', onWindowKeyDown);
      window.addEventListener('keyup', onWindowKeyUp);
      window.addEventListener('pointerup', onWindowPointerUp);
      window.addEventListener('pointercancel', onWindowPointerUp);
      window.addEventListener('blur', onBlur);
      window.addEventListener('resize', onResize);

      if (typeof window.matchMedia === 'function') {
        const mql = window.matchMedia('(pointer: coarse)');
        this.hasCoarsePointer = mql.matches;
        this.syncTouchUi();
        const onMediaChange = (evt: MediaQueryListEvent) => {
          this.hasCoarsePointer = evt.matches;
          this.syncTouchUi();
        };
        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', onMediaChange);
          mediaCleanup = () => mql.removeEventListener('change', onMediaChange);
        }
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    const cleanup = () => {
      this.resetAll();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);

      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onWindowKeyDown);
        window.removeEventListener('keyup', onWindowKeyUp);
        window.removeEventListener('pointerup', onWindowPointerUp);
        window.removeEventListener('pointercancel', onWindowPointerUp);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('resize', onResize);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      mediaCleanup?.();

      if (this.canvas === canvas) {
        this.canvas = null;
        this.emitFn = null;
        this.detachCanvasFn = null;
      }
    };

    this.detachCanvasFn = cleanup;
    return cleanup;
  }

  /**
   * Attaches a dedicated mobile `.bs-touch-layer` element with pointer capture
   * for multi-touch twin-stick control. Returns an unsubscribe cleanup callback.
   */
  attachTouchLayer(el: HTMLElement): () => void {
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && this.touchOverride !== 'touch') return;
      this.markTouchSeen();
      this.trySetCapture(el, e.pointerId);
      this.startTouchFromClient(e.pointerId, e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.touchSlots.has(e.pointerId)) return;
      this.moveTouchFromClient(e.pointerId, e.clientX, e.clientY);
    };
    const onEnd = (e: PointerEvent) => {
      this.tryReleaseCapture(el, e.pointerId);
      if (this.touchSlots.has(e.pointerId)) {
        this.endTouchSlot(e.pointerId);
      }
    };
    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('contextmenu', onContext);

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('contextmenu', onContext);
    };
  }

  /**
   * Binds a dedicated virtual stick or fire pad element (`'move'` or `'aim'`)
   * so taps anywhere inside the pad stay anchored cleanly in that role.
   */
  bindTouchZone(el: HTMLElement, role: 'move' | 'aim'): () => void {
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      this.markTouchSeen();
      this.trySetCapture(el, e.pointerId);
      const { sx, sy } = this.clientToCanvasCss(e.clientX, e.clientY);
      this.startTouchSlot(e.pointerId, role, sx, sy);
    };
    const onMove = (e: PointerEvent) => {
      if (!this.touchSlots.has(e.pointerId)) return;
      e.stopPropagation();
      this.moveTouchFromClient(e.pointerId, e.clientX, e.clientY);
    };
    const onEnd = (e: PointerEvent) => {
      this.tryReleaseCapture(el, e.pointerId);
      if (this.touchSlots.has(e.pointerId)) {
        e.stopPropagation();
        this.endTouchSlot(e.pointerId);
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };
  }

  // --------------------------------------------------------------------------
  // Virtual / Programmatic Action Helpers (Touch Buttons, Hotbar, Perks, Pings)
  // --------------------------------------------------------------------------

  /** Triggers a rising-edge dodge dash (virtual Dash button). */
  triggerDash(): void {
    if (!this.alive || this.downed) return;
    this.latchedEdges |= BANSUNG_BTN_DASH;
    this.syncStateVectorAndMask();
  }

  /** Triggers a rising-edge hero gadget/skill (`Q` / Skill button). */
  triggerSkill(): void {
    if (!this.alive || this.downed) return;
    this.latchedEdges |= BANSUNG_BTN_SKILL;
    this.syncStateVectorAndMask();
  }

  /** Triggers a rising-edge hero active signature skill (`F` / HUD skill button). */
  triggerHeroSkill(): void {
    if (!this.alive || this.downed) return;
    this.latchedEdges |= BANSUNG_BTN_HERO_SKILL;
    this.syncStateVectorAndMask();
  }

  /** Triggers a rising-edge interact / pickup swap (`E` / Interact button). */
  triggerInteract(): void {
    if (!this.alive || this.downed) return;
    this.latchedEdges |= BANSUNG_BTN_INTERACT;
    this.syncStateVectorAndMask();
  }

  /** Triggers a rising-edge manual or active reload (`R` / Reload button). */
  triggerReload(): void {
    if (!this.alive || this.downed) return;
    this.latchedEdges |= BANSUNG_BTN_RELOAD;
    this.syncStateVectorAndMask();
  }

  /** Controls virtual fire button hold state from custom UI controls. */
  setVirtualFire(active: boolean): void {
    if (!this.alive || this.downed) {
      this.virtualFireActive = false;
      this.heldButtons &= ~BANSUNG_BTN_FIRE;
      this.syncStateVectorAndMask();
      return;
    }
    this.virtualFireActive = active;
    if (active) {
      this.heldButtons |= BANSUNG_BTN_FIRE;
      this.latchedEdges |= BANSUNG_BTN_FIRE;
    } else if (!this.hasActiveTouchRole('aim')) {
      this.heldButtons &= ~BANSUNG_BTN_FIRE;
    }
    this.syncStateVectorAndMask();
  }

  /** Selects hotbar slot `0..4` (`{ t: 'slot', idx }`). */
  selectSlot(slotIdx: number): void {
    if (!this.alive || this.downed) return;
    const idx = Math.trunc(slotIdx);
    if (idx < 0 || idx > 4) return;
    this.state.activeSlot = idx;
    this.dispatchCommand({ t: 'slot', idx });
  }

  /** Touch hotbar tap: re-tapping active weapon slot triggers reload (`d44`). */
  tapHotbarSlot(slotIdx: number): void {
    if (!this.alive || this.downed) return;
    const idx = Math.trunc(slotIdx);
    if (idx < 0 || idx > 4) return;
    const curSlot = this.store.me?.slotIdx ?? this.state.activeSlot;
    if (idx === curSlot && idx <= 2) {
      const slotInfo = this.store.me?.slots?.[idx];
      if (!slotInfo || slotInfo.maxClip > 0) {
        this.triggerReload();
        return;
      }
    }
    this.selectSlot(idx);
  }

  /** Emits a tactical co-op ping at world `(worldX, worldY)` (clamped to arena bounds). */
  emitPing(kind?: BansungPingKind, worldX?: number, worldY?: number): void {
    const { originX, originY } = this.resolveOriginAndCam();
    const { mapW, mapH } = this.getArenaBounds();
    const rawX = worldX ?? (this.downed || this.state.touchUi ? originX : this.state.aimWorldX);
    const rawY = worldY ?? (this.downed || this.state.touchUi ? originY : this.state.aimWorldY);
    const x = Math.round(clamp(Number.isFinite(rawX) ? rawX : originX, 0, mapW));
    const y = Math.round(clamp(Number.isFinite(rawY) ? rawY : originY, 0, mapH));
    const resolvedKind = kind ?? this.classifyPingKind(x, y);
    this.dispatchCommand({ t: 'ping', kind: resolvedKind, x, y });
  }

  /** Selects a wave-clear perk (`{ t: 'perk', id }`). */
  selectPerk(id: BansungPerkId): void {
    if (!id) return;
    this.dispatchCommand({ t: 'perk', id });
  }

  /** Selects a survival XP level-up Gacha card (`0 | 1 | 2` -> `{ t: 'gacha', pick }`). */
  triggerGachaPick(pick: 0 | 1 | 2): void {
    if (!this.alive) return;
    const idx = Math.trunc(pick);
    if (idx !== 0 && idx !== 1 && idx !== 2) return;
    const gachaLen = this.getActiveGachaChoicesLen();
    if (gachaLen > 0 && idx >= gachaLen) return;
    const gachaPending = this.store.me?.gachaPending;
    if (gachaPending !== undefined && gachaPending <= 0) return;
    const nowMs = nowDefaultMs();
    if (nowMs - this.lastGachaPickAt < 60) return;
    this.lastGachaPickAt = nowMs;
    this.dispatchCommand({ t: 'gacha', pick: idx });
  }

  // --------------------------------------------------------------------------
  // Per-rAF Flush & Coalesced Emitter (d44 §5)
  // --------------------------------------------------------------------------

  /**
   * Advances 60fps local aim / Soul-Knight auto-aim / spectator free-pan and flushes
   * immediate edge actions plus `<=30Hz` coalesced continuous `{ t: 'in' }` commands.
   */
  flush(nowMs = nowDefaultMs()): void {
    const rawDtSec = this.prevFlushAtMs > 0 ? (nowMs - this.prevFlushAtMs) / 1000 : BANSUNG_TICK_EXACT_MS / 1000;
    const dtSec = clamp(Number.isFinite(rawDtSec) ? rawDtSec : BANSUNG_TICK_EXACT_MS / 1000, 0, 0.1);
    this.prevFlushAtMs = nowMs;

    const { originX, originY, cam, viewW, viewH } = this.resolveOriginAndCam();
    const { mx, my } = this.computeMoveAxes();
    this.state.mx = mx;
    this.state.my = my;

    if (!this.alive) {
      this.store.setLiveMoveInput(0, 0);
      this.state.autoAimTargetId = null;
      this.prevAutoAimLocked = false;
      this.state.buttons = 0;
      this.latchedEdges = 0;

      if (mx !== 0 || my !== 0) {
        const panStep = (SPECTATOR_PAN_PX_S / Math.max(0.25, cam.zoom)) * dtSec;
        this.store.spectateFree((mx / 100) * panStep, (my / 100) * panStep);
      }

      if (
        this.emitFn &&
        this.lastSent.hasSent &&
        (this.lastSent.mx !== 0 || this.lastSent.my !== 0 || this.lastSent.fire !== 0)
      ) {
        this.emitMoveCmd(0, 0, this.state.aimRad, 0, nowMs, 0);
      }
      return;
    }

    const activeButtons = this.downed ? 0 : this.heldButtons | this.latchedEdges;
    const risingButtons = this.downed
      ? 0
      : (activeButtons & ~this.lastFlushedButtons) | this.latchedEdges;

    this.state.buttons = activeButtons;
    this.store.setLiveMoveInput(!this.downed ? mx / 100 : 0, !this.downed ? my / 100 : 0);
    this.updateAimAtFrame(originX, originY, cam, viewW, viewH, mx, my, activeButtons, dtSec);
    this.state.aimQ = quantizeAim(this.state.aimRad);

    if (!this.emitFn) {
      this.lastFlushedButtons = this.downed ? 0 : this.heldButtons;
      this.latchedEdges = 0;
      return;
    }

    // 1. Immediate discrete edge actions (never coalesced/dropped) + smooth continuous dash hold
    const dashHeldChain =
      !this.downed &&
      (activeButtons & BANSUNG_BTN_DASH) !== 0 &&
      nowMs - this.lastDashSentAtMs >= Math.max(120, BANSUNG_DASH.DURATION_MS - 30);
    if (!this.downed && (risingButtons !== 0 || dashHeldChain)) {
      if ((risingButtons & BANSUNG_BTN_DASH) !== 0 || dashHeldChain) {
        const dirLen = Math.hypot(mx, my);
        const dx = dirLen > 0 ? mx / dirLen : Math.cos(this.state.aimRad);
        const dy = dirLen > 0 ? my / dirLen : Math.sin(this.state.aimRad);
        this.lastDashSentAtMs = nowMs;
        this.dispatchCommand({
          t: 'dash',
          dx: Number(dx.toFixed(3)),
          dy: Number(dy.toFixed(3)),
        });
      }
      if ((risingButtons & BANSUNG_BTN_SKILL) !== 0) {
        const { mapW, mapH } = this.getArenaBounds();
        const gx = Number.isFinite(this.state.aimWorldX)
          ? clamp(this.state.aimWorldX, 0, mapW)
          : originX;
        const gy = Number.isFinite(this.state.aimWorldY)
          ? clamp(this.state.aimWorldY, 0, mapH)
          : originY;
        this.dispatchCommand({
          t: 'gadget',
          x: Math.round(gx),
          y: Math.round(gy),
        });
      }
      if ((risingButtons & BANSUNG_BTN_HERO_SKILL) !== 0) {
        const { mapW, mapH } = this.getArenaBounds();
        const gx = Number.isFinite(this.state.aimWorldX)
          ? clamp(this.state.aimWorldX, 0, mapW)
          : originX;
        const gy = Number.isFinite(this.state.aimWorldY)
          ? clamp(this.state.aimWorldY, 0, mapH)
          : originY;
        this.dispatchCommand({
          t: 'skill',
          x: Math.round(gx),
          y: Math.round(gy),
        });
      }
      if ((risingButtons & BANSUNG_BTN_INTERACT) !== 0) {
        this.dispatchCommand({ t: 'use' });
      }
      if ((risingButtons & BANSUNG_BTN_RELOAD) !== 0) {
        this.dispatchCommand({ t: 'reload' });
      }
    }

    // 2. Continuous movement / aim / fire at smooth 30Hz cadence + immediate edge bypass
    const fire: 0 | 1 = !this.downed && (activeButtons & BANSUNG_BTN_FIRE) !== 0 ? 1 : 0;
    const fireEdge = !this.lastSent.hasSent || fire !== this.lastSent.fire;
    const aimDelta = Math.abs(wrapPi(this.state.aimRad - this.lastSent.aimRad));
    const analogDirty =
      mx !== this.lastSent.mx ||
      my !== this.lastSent.my ||
      aimDelta >= BANSUNG_AIM_DIRTY_RAD;

    const elapsedMs = nowMs - this.lastSent.atMs;
    const rateReady = elapsedMs >= BANSUNG_INPUT_INTERVAL_MS;
    const activeHold = mx !== 0 || my !== 0 || fire === 1;
    const heartbeatDue = activeHold && elapsedMs >= BANSUNG_HEARTBEAT_MS;

    if (fireEdge || ((analogDirty || activeHold) && rateReady) || heartbeatDue) {
      let predDtSec = 0;
      if (mx !== 0 || my !== 0) {
        if (!this.lastPredMoving) {
          predDtSec = BANSUNG_TICK_EXACT_MS / 1000;
        } else {
          predDtSec = clamp((nowMs - this.lastPredAtMs) / 1000, 0, 0.1);
        }
        this.lastPredAtMs = nowMs;
        this.lastPredMoving = true;
      } else {
        this.lastPredMoving = false;
        predDtSec = BANSUNG_TICK_EXACT_MS / 1000;
      }

      this.emitMoveCmd(mx, my, this.state.aimRad, fire, nowMs, predDtSec);
    }

    this.lastFlushedButtons = this.downed ? 0 : this.heldButtons;
    this.latchedEdges = 0;
  }

  /**
   * Clears all held keys, pointers, and touch sticks, and flushes a zeroed stop
   * frame if movement or fire was active (blur, visibility hidden, chat focus, phase end).
   */
  resetAll(): void {
    const hadHeldMoveOrFire =
      this.lastSent.hasSent &&
      (this.lastSent.mx !== 0 || this.lastSent.my !== 0 || this.lastSent.fire !== 0);

    this.heldMoveKeys.clear();
    this.heldButtons = 0;
    this.latchedEdges = 0;
    this.lastFlushedButtons = 0;
    this.virtualFireActive = false;
    this.touchSlots.clear();
    this.lastPredMoving = false;
    this.prevAutoAimLocked = false;

    this.state.moveStick.active = false;
    this.state.moveStick.kx = this.state.moveStick.ox;
    this.state.moveStick.ky = this.state.moveStick.oy;

    this.state.aimStick.active = false;
    this.state.aimStick.manual = false;
    this.state.aimStick.kx = this.state.aimStick.ox;
    this.state.aimStick.ky = this.state.aimStick.oy;

    this.state.autoAimTargetId = null;
    this.state.mx = 0;
    this.state.my = 0;
    this.state.buttons = 0;

    if (this.state.scoreboardOpen) {
      this.state.scoreboardOpen = false;
      this.onUiAction?.('scoreboard', false);
    }

    this.store.setStickAim(false, this.state.aimRad, 0);

    if (this.emitFn && hadHeldMoveOrFire) {
      this.emitMoveCmd(0, 0, this.state.aimRad, 0, nowDefaultMs(), 0);
    }
  }

  // --------------------------------------------------------------------------
  // Internal Desktop Mouse & Keyboard Handlers
  // --------------------------------------------------------------------------

  private handleCanvasPointerDown(e: PointerEvent): void {
    this.syncCanvasViewport();
    if (e.pointerType === 'touch' || (this.touchOverride === 'touch' && e.button === 0)) {
      this.markTouchSeen();
      if (this.canvas) this.trySetCapture(this.canvas, e.pointerId);
      this.startTouchFromClient(e.pointerId, e.clientX, e.clientY);
      return;
    }

    this.markMouseSeen();
    this.updateDesktopPointer(e.clientX, e.clientY);

    if (!this.alive) {
      if (e.button === 0) {
        const nextIdx = this.store.spectateCycle(1);
        if (nextIdx !== null) this.dispatchCommand({ t: 'spec', targetIdx: nextIdx });
      } else if (e.button === 2) {
        const prevIdx = this.store.spectateCycle(-1);
        if (prevIdx !== null) this.dispatchCommand({ t: 'spec', targetIdx: prevIdx });
      }
      return;
    }

    if (e.button === 1) {
      e.preventDefault();
      this.emitPing(undefined, this.state.aimWorldX, this.state.aimWorldY);
      return;
    }

    if (this.downed) return;

    if (e.button === 0) {
      if (this.canvas) this.trySetCapture(this.canvas, e.pointerId);
      this.heldButtons |= BANSUNG_BTN_FIRE;
      this.latchedEdges |= BANSUNG_BTN_FIRE;
      this.syncStateVectorAndMask();
    } else if (e.button === 2) {
      this.heldButtons |= BANSUNG_BTN_DASH;
      this.latchedEdges |= BANSUNG_BTN_DASH;
      this.syncStateVectorAndMask();
    }
  }

  private handleCanvasPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' || this.touchSlots.has(e.pointerId)) {
      if (!this.touchSlots.has(e.pointerId)) return;
      this.moveTouchFromClient(e.pointerId, e.clientX, e.clientY);
      return;
    }

    if (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2) {
      this.markMouseSeen();
    }
    this.updateDesktopPointer(e.clientX, e.clientY);
  }

  private handleCanvasPointerUp(e: PointerEvent, cancelled: boolean): void {
    if (this.canvas) this.tryReleaseCapture(this.canvas, e.pointerId);
    if (e.pointerType === 'touch' || this.touchSlots.has(e.pointerId)) {
      if (this.touchSlots.has(e.pointerId)) {
        this.endTouchSlot(e.pointerId);
      }
      return;
    }

    if (cancelled) {
      this.heldButtons &= ~(BANSUNG_BTN_FIRE | BANSUNG_BTN_DASH);
    } else if (e.button === 0) {
      this.heldButtons &= ~BANSUNG_BTN_FIRE;
    } else if (e.button === 2) {
      this.heldButtons &= ~BANSUNG_BTN_DASH;
    }
    this.syncStateVectorAndMask();
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY === 0) return;

    if (e.ctrlKey || e.metaKey || !this.alive) {
      this.store.adjustZoom(Math.exp(-e.deltaY * 0.0015));
      return;
    }

    if (this.downed) return;

    const nowMs = nowDefaultMs();
    if (nowMs - this.lastWheelSlotAt < BANSUNG_WHEEL_DEBOUNCE_MS) {
      return;
    }
    this.lastWheelSlotAt = nowMs;

    const rawSlots = this.store.me?.slots;
    const populated: number[] = [];
    if (Array.isArray(rawSlots) && rawSlots.length > 0) {
      const limit = Math.min(5, rawSlots.length);
      for (let i = 0; i < limit; i++) {
        if (rawSlots[i]) populated.push(i);
      }
    }
    const curRaw = this.store.me?.slotIdx ?? this.state.activeSlot;
    const dir = e.deltaY > 0 ? 1 : -1;
    if (populated.length > 0) {
      const pos = populated.indexOf(curRaw);
      const nextPos =
        pos >= 0
          ? (pos + dir + populated.length) % populated.length
          : dir > 0
            ? 0
            : populated.length - 1;
      const next = populated[nextPos]!;
      if (next !== curRaw || populated.length === 1) {
        this.selectSlot(next);
      }
    } else {
      const weaponSlots = clamp(rawSlots?.length || 3, 1, 5);
      const cur = curRaw >= 0 && curRaw < weaponSlots ? curRaw : 0;
      const next = (cur + dir + weaponSlots) % weaponSlots;
      if (next !== cur || weaponSlots === 1) {
        this.selectSlot(next);
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (isTextInputTarget(e.target)) return;

    const code = e.code;
    const keyLower = e.key.toLowerCase();

    if (code === 'Tab' || keyLower === 'tab') {
      e.preventDefault();
      if (!this.state.scoreboardOpen) {
        this.state.scoreboardOpen = true;
        this.onUiAction?.('scoreboard', true);
      }
      return;
    }

    if (code === 'Escape' || keyLower === 'escape') {
      if (!e.repeat) this.onUiAction?.('escape');
      return;
    }

    if (code === 'Enter' || keyLower === 'enter') {
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.resetAll();
        this.onUiAction?.('chat');
      }
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const moveKey = resolveMoveKey(code, keyLower);
    if (moveKey) {
      if (moveKey.startsWith('arrow')) e.preventDefault();
      this.heldMoveKeys.add(moveKey);
      this.syncStateVectorAndMask();
      return;
    }

    if (code === 'Space' || keyLower === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (!this.alive) {
        const nextIdx =
          this.store.cam.mode === 'free'
            ? this.store.spectateRelock()
            : this.store.spectateCycle(1);
        if (nextIdx !== null) {
          this.dispatchCommand({ t: 'spec', targetIdx: nextIdx });
        }
        return;
      }
      if (!this.downed) {
        this.heldButtons |= BANSUNG_BTN_DASH;
        this.latchedEdges |= BANSUNG_BTN_DASH;
        this.syncStateVectorAndMask();
      }
      return;
    }

    if (isActionKey(code, keyLower, 'KeyG', 'g')) {
      if (!e.repeat) {
        this.emitPing(undefined, this.state.aimWorldX, this.state.aimWorldY);
      }
      return;
    }

    if (isActionKey(code, keyLower, 'KeyM', 'm')) {
      if (!e.repeat) {
        this.onUiAction?.('minimap');
      }
      return;
    }

    const gachaLen = this.getActiveGachaChoicesLen();
    const gachaPending = this.store.me?.gachaPending;
    if (
      this.alive &&
      !this.state.scoreboardOpen &&
      gachaLen > 0 &&
      (gachaPending === undefined || gachaPending > 0)
    ) {
      const gachaPick =
        code === 'KeyZ' || keyLower === 'z'
          ? 0
          : code === 'KeyX' || keyLower === 'x'
            ? 1
            : code === 'KeyC' || keyLower === 'c'
              ? 2
              : -1;
      if (gachaPick === 0 || gachaPick === 1 || gachaPick === 2) {
        e.preventDefault();
        if (!e.repeat && gachaPick < gachaLen) {
          this.triggerGachaPick(gachaPick);
        }
        return;
      }
    }

    if (!this.alive || this.downed || e.repeat) return;

    const slotIdx = resolveSlotKey(code, keyLower);
    if (slotIdx >= 0) {
      e.preventDefault();
      this.selectSlot(slotIdx);
      return;
    }

    if (isActionKey(code, keyLower, 'KeyQ', 'q')) {
      this.heldButtons |= BANSUNG_BTN_SKILL;
      this.latchedEdges |= BANSUNG_BTN_SKILL;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyF', 'f')) {
      this.heldButtons |= BANSUNG_BTN_HERO_SKILL;
      this.latchedEdges |= BANSUNG_BTN_HERO_SKILL;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyE', 'e')) {
      this.heldButtons |= BANSUNG_BTN_INTERACT;
      this.latchedEdges |= BANSUNG_BTN_INTERACT;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyR', 'r')) {
      this.heldButtons |= BANSUNG_BTN_RELOAD;
      this.latchedEdges |= BANSUNG_BTN_RELOAD;
      this.syncStateVectorAndMask();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    const keyLower = e.key.toLowerCase();

    const moveKey = resolveMoveKey(code, keyLower);
    if (moveKey) {
      this.heldMoveKeys.delete(moveKey);
      this.syncStateVectorAndMask();
      return;
    }

    if (code === 'Tab' || keyLower === 'tab') {
      if (this.state.scoreboardOpen) {
        this.state.scoreboardOpen = false;
        this.onUiAction?.('scoreboard', false);
      }
      return;
    }

    if (code === 'Space' || keyLower === ' ') {
      this.heldButtons &= ~BANSUNG_BTN_DASH;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyQ', 'q')) {
      this.heldButtons &= ~BANSUNG_BTN_SKILL;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyF', 'f')) {
      this.heldButtons &= ~BANSUNG_BTN_HERO_SKILL;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyE', 'e')) {
      this.heldButtons &= ~BANSUNG_BTN_INTERACT;
      this.syncStateVectorAndMask();
      return;
    }

    if (isActionKey(code, keyLower, 'KeyR', 'r')) {
      this.heldButtons &= ~BANSUNG_BTN_RELOAD;
      this.syncStateVectorAndMask();
    }
  }

  // --------------------------------------------------------------------------
  // Internal Touch Twin-Stick Manager (d44 §4)
  // --------------------------------------------------------------------------

  private startTouchFromClient(pointerId: number, clientX: number, clientY: number): void {
    const { sx, sy } = this.clientToCanvasCss(clientX, clientY);
    const { viewW } = this.resolveOriginAndCam();

    if (!this.alive) {
      if (sx >= viewW * 0.45) {
        const nextIdx = this.store.spectateCycle(1);
        if (nextIdx !== null) this.dispatchCommand({ t: 'spec', targetIdx: nextIdx });
      } else {
        this.startTouchSlot(pointerId, 'move', sx, sy);
      }
      return;
    }

    const role: 'move' | 'aim' = sx < viewW * 0.45 ? 'move' : 'aim';
    this.startTouchSlot(pointerId, role, sx, sy);
  }

  private startTouchSlot(pointerId: number, role: 'move' | 'aim', sx: number, sy: number): void {
    if (this.touchSlots.has(pointerId) || this.hasActiveTouchRole(role)) return;
    if (role === 'aim' && (!this.alive || this.downed)) return;

    const { viewW, viewH } = this.resolveOriginAndCam();
    const { rMove, rAim } = this.getTouchRadii(viewH);

    let ox = sx;
    let oy = sy;
    if (role === 'move') {
      ox = clamp(sx, rMove + 10, Math.max(rMove + 10, viewW * 0.45 - 10));
      oy = clamp(sy, rMove + 10, Math.max(rMove + 10, viewH - rMove - 14));
      this.state.moveStick = { active: true, ox, oy, kx: ox, ky: oy };
    } else {
      ox = clamp(sx, viewW * 0.45 + 10, Math.max(viewW * 0.45 + 10, viewW - rAim - 10));
      oy = clamp(sy, rAim + 10, Math.max(rAim + 10, viewH - rAim - 14));
      this.state.aimStick = { active: true, ox, oy, kx: ox, ky: oy, manual: false };
      this.heldButtons |= BANSUNG_BTN_FIRE;
      this.latchedEdges |= BANSUNG_BTN_FIRE;
    }

    this.touchSlots.set(pointerId, {
      pointerId,
      role,
      ox,
      oy,
      kx: ox,
      ky: oy,
      manual: false,
    });
    this.syncStateVectorAndMask();
  }

  private moveTouchFromClient(pointerId: number, clientX: number, clientY: number): void {
    const slot = this.touchSlots.get(pointerId);
    if (!slot) return;

    const { sx, sy } = this.clientToCanvasCss(clientX, clientY);
    const { viewW, viewH } = this.resolveOriginAndCam();
    const { rMove, rAim } = this.getTouchRadii(viewH);

    if (slot.role === 'move') {
      let dx = sx - slot.ox;
      let dy = sy - slot.oy;
      let dist = Math.hypot(dx, dy);

      // Soft-follow floating anchor if thumb drags past 1.6 * R_MOVE
      const followLimit = BANSUNG_TOUCH_FOLLOW_MULT * rMove;
      if (dist > followLimit && dist > 1e-4) {
        const excess = dist - followLimit;
        slot.ox = clamp(
          slot.ox + (dx / dist) * excess,
          rMove + 10,
          Math.max(rMove + 10, viewW * 0.45 - 10),
        );
        slot.oy = clamp(
          slot.oy + (dy / dist) * excess,
          rMove + 10,
          Math.max(rMove + 10, viewH - rMove - 14),
        );
        dx = sx - slot.ox;
        dy = sy - slot.oy;
        dist = Math.hypot(dx, dy);
      }

      if (dist > rMove && dist > 1e-4) {
        slot.kx = slot.ox + (dx / dist) * rMove;
        slot.ky = slot.oy + (dy / dist) * rMove;
      } else {
        slot.kx = sx;
        slot.ky = sy;
      }

      this.state.moveStick.active = true;
      this.state.moveStick.ox = slot.ox;
      this.state.moveStick.oy = slot.oy;
      this.state.moveStick.kx = slot.kx;
      this.state.moveStick.ky = slot.ky;
      this.syncStateVectorAndMask();
      return;
    }

    // Right Fire / Aim Pad (Soul Knight dual-mode: drag < 10px -> auto-aim, >= 10px -> manual)
    const dx = sx - slot.ox;
    const dy = sy - slot.oy;
    const dist = Math.hypot(dx, dy);

    if (dist > rAim && dist > 1e-4) {
      slot.kx = slot.ox + (dx / dist) * rAim;
      slot.ky = slot.oy + (dy / dist) * rAim;
    } else {
      slot.kx = sx;
      slot.ky = sy;
    }

    slot.manual = dist >= BANSUNG_TOUCH_DZ_AIM;
    this.state.aimStick.active = true;
    this.state.aimStick.ox = slot.ox;
    this.state.aimStick.oy = slot.oy;
    this.state.aimStick.kx = slot.kx;
    this.state.aimStick.ky = slot.ky;
    this.state.aimStick.manual = slot.manual;

    if (slot.manual && dist > 1e-4) {
      const rad = Math.atan2(dy, dx);
      this.state.aimRad = rad;
      this.state.aimQ = quantizeAim(rad);
      this.store.setStickAim(true, rad, clamp(dist / rAim, 0, 1));
    } else {
      this.store.setStickAim(true, this.state.aimRad, 0);
    }
  }

  private endTouchSlot(pointerId: number): void {
    const slot = this.touchSlots.get(pointerId);
    if (!slot) return;
    this.touchSlots.delete(pointerId);

    if (slot.role === 'move') {
      this.state.moveStick.active = false;
      this.state.moveStick.kx = this.state.moveStick.ox;
      this.state.moveStick.ky = this.state.moveStick.oy;
    } else {
      this.state.aimStick.active = false;
      this.state.aimStick.manual = false;
      this.state.aimStick.kx = this.state.aimStick.ox;
      this.state.aimStick.ky = this.state.aimStick.oy;
      this.state.autoAimTargetId = null;
      this.prevAutoAimLocked = false;
      if (!this.virtualFireActive) {
        this.heldButtons &= ~BANSUNG_BTN_FIRE;
      }
      this.store.setStickAim(false, this.state.aimRad, 0);
    }
    this.syncStateVectorAndMask();
  }

  private clearTouchRole(role: 'move' | 'aim'): void {
    for (const [id, slot] of this.touchSlots) {
      if (slot.role === role) {
        this.endTouchSlot(id);
      }
    }
  }

  private hasActiveTouchRole(role: 'move' | 'aim'): boolean {
    for (const slot of this.touchSlots.values()) {
      if (slot.role === role) return true;
    }
    return false;
  }

  private getTouchRadii(viewH: number): { rMove: number; rAim: number } {
    if (viewH > 0 && viewH <= COMPACT_VIEW_H) {
      return { rMove: BANSUNG_TOUCH_R_MOVE_COMPACT, rAim: BANSUNG_TOUCH_R_AIM_COMPACT };
    }
    return { rMove: BANSUNG_TOUCH_R_MOVE, rAim: BANSUNG_TOUCH_R_AIM };
  }

  // --------------------------------------------------------------------------
  // Aim, Move & Command Helpers
  // --------------------------------------------------------------------------

  private updateDesktopPointer(clientX: number, clientY: number): void {
    const { sx, sy, viewW, viewH } = this.clientToCanvasCss(clientX, clientY);
    this.pointerActive = true;
    this.pointerSx = sx;
    this.pointerSy = sy;

    const { originX, originY, cam } = this.resolveOriginAndCam();
    const aimOriginY = this.resolveAimOriginY(originY);
    const world = screenToWorld(sx, sy, cam, viewW, viewH);
    this.state.aimWorldX = world.x;
    this.state.aimWorldY = world.y;

    const dx = world.x - originX;
    const dy = world.y - aimOriginY;
    if (dx * dx + dy * dy > 1e-4) {
      this.state.aimRad = Math.atan2(dy, dx);
      this.state.aimQ = quantizeAim(this.state.aimRad);
    }

    if (this.hasExternalOrigin) {
      this.store.setViewport(viewW, viewH);
      this.store.setLocalAimRad(this.state.aimRad, world.x, world.y);
    } else {
      this.store.setPointerScreen(sx, sy, viewW, viewH);
    }
  }

  private updateAimAtFrame(
    originX: number,
    originY: number,
    cam: { x: number; y: number; zoom: number },
    viewW: number,
    viewH: number,
    mx: number,
    my: number,
    activeButtons: number,
    dtSec: number,
  ): void {
    const aimOriginY = this.resolveAimOriginY(originY);
    if (!this.state.touchUi) {
      if (this.pointerActive) {
        const world = screenToWorld(this.pointerSx, this.pointerSy, cam, viewW, viewH);
        this.state.aimWorldX = world.x;
        this.state.aimWorldY = world.y;
        const dx = world.x - originX;
        const dy = world.y - aimOriginY;
        if (dx * dx + dy * dy > 1e-4) {
          this.state.aimRad = Math.atan2(dy, dx);
          if (this.hasExternalOrigin) {
            this.store.setLocalAimRad(this.state.aimRad, world.x, world.y);
          } else {
            this.store.setPointerScreen(this.pointerSx, this.pointerSy, viewW, viewH);
          }
        }
      } else {
        this.state.aimWorldX = originX + Math.cos(this.state.aimRad) * 160;
        this.state.aimWorldY = aimOriginY + Math.sin(this.state.aimRad) * 160;
      }
      this.state.autoAimTargetId = null;
      this.prevAutoAimLocked = false;
      return;
    }

    const fireHeld = !this.downed && (activeButtons & BANSUNG_BTN_FIRE) !== 0;

    // Mobile Soul-Knight Smart Auto-Aim (hold-fire without >=10px manual drag)
    if (fireHeld && !this.state.aimStick.manual) {
      const target = findAutoAimTarget(originX, originY, this.store);
      if (target) {
        const targetAngle = Math.atan2(target.y - originY, target.x - originX);
        if (!this.prevAutoAimLocked) {
          this.state.aimRad = targetAngle;
        } else {
          const slew = clamp(dtSec * AUTO_AIM_SLEW_RAD_S, 0.35, 1);
          this.state.aimRad = lerpAngle(this.state.aimRad, targetAngle, slew);
        }
        this.prevAutoAimLocked = true;
        this.state.autoAimTargetId = target.id;
        this.state.autoAimTargetX = target.x;
        this.state.autoAimTargetY = target.y;
        this.state.aimWorldX = target.x;
        this.state.aimWorldY = target.y;
        this.store.setLocalAimRad(this.state.aimRad, target.x, target.y);
        return;
      }

      this.prevAutoAimLocked = false;
      this.state.autoAimTargetId = null;
      if (mx !== 0 || my !== 0) {
        this.state.aimRad = Math.atan2(my, mx);
      }
      this.state.aimWorldX = originX + Math.cos(this.state.aimRad) * 160;
      this.state.aimWorldY = aimOriginY + Math.sin(this.state.aimRad) * 160;
      this.store.setLocalAimRad(this.state.aimRad, this.state.aimWorldX, this.state.aimWorldY);
      return;
    }

    this.prevAutoAimLocked = false;
    this.state.autoAimTargetId = null;

    if (this.state.aimStick.active && this.state.aimStick.manual) {
      const dx = this.state.aimStick.kx - this.state.aimStick.ox;
      const dy = this.state.aimStick.ky - this.state.aimStick.oy;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-4) {
        this.state.aimRad = Math.atan2(dy, dx);
        const { rAim } = this.getTouchRadii(viewH);
        this.state.aimWorldX = originX + Math.cos(this.state.aimRad) * 160;
        this.state.aimWorldY = aimOriginY + Math.sin(this.state.aimRad) * 160;
        this.store.setStickAim(true, this.state.aimRad, clamp(dist / rAim, 0, 1));
      }
      return;
    }

    if (mx !== 0 || my !== 0) {
      this.state.aimRad = Math.atan2(my, mx);
      this.state.aimWorldX = originX + Math.cos(this.state.aimRad) * 160;
      this.state.aimWorldY = aimOriginY + Math.sin(this.state.aimRad) * 160;
      this.store.setLocalAimRad(this.state.aimRad, this.state.aimWorldX, this.state.aimWorldY);
    }
  }

  private computeMoveAxes(): { mx: number; my: number } {
    let dx = 0;
    let dy = 0;

    if (this.heldMoveKeys.has('a') || this.heldMoveKeys.has('arrowleft')) dx -= 1;
    if (this.heldMoveKeys.has('d') || this.heldMoveKeys.has('arrowright')) dx += 1;
    if (this.heldMoveKeys.has('w') || this.heldMoveKeys.has('arrowup')) dy -= 1;
    if (this.heldMoveKeys.has('s') || this.heldMoveKeys.has('arrowdown')) dy += 1;

    if (this.state.moveStick.active) {
      const { viewH } = this.resolveOriginAndCam();
      const { rMove } = this.getTouchRadii(viewH);
      const sdx = this.state.moveStick.kx - this.state.moveStick.ox;
      const sdy = this.state.moveStick.ky - this.state.moveStick.oy;
      const dist = Math.hypot(sdx, sdy);
      const rawMag = clamp(dist / rMove, 0, 1);
      if (rawMag >= BANSUNG_TOUCH_DZ_MOVE && dist > 1e-4) {
        const remapped = (rawMag - BANSUNG_TOUCH_DZ_MOVE) / (1 - BANSUNG_TOUCH_DZ_MOVE);
        dx += (sdx / dist) * remapped;
        dy += (sdy / dist) * remapped;
      }
    }

    return normalizeMoveVector(dx, dy);
  }

  private syncStateVectorAndMask(): void {
    const { mx, my } = this.computeMoveAxes();
    this.state.mx = mx;
    this.state.my = my;
    this.state.buttons =
      !this.alive || this.downed ? 0 : this.heldButtons | this.latchedEdges;
  }

  private emitMoveCmd(
    mx: number,
    my: number,
    aimRad: number,
    fire: 0 | 1,
    nowMs: number,
    predDtSec: number,
  ): void {
    const aimQ = quantizeAim(aimRad);
    const seq = this.store.nextInputSeq();
    if (predDtSec > 0 && this.alive) {
      this.store.recordLocalInput(seq, mx / 100, my / 100, predDtSec);
    }
    this.dispatchCommand({ t: 'in', seq, mx, my, aim: aimQ, fire });
    this.lastSent.hasSent = true;
    this.lastSent.atMs = nowMs;
    this.lastSent.mx = mx;
    this.lastSent.my = my;
    this.lastSent.aimRad = aimRad;
    this.lastSent.aimQ = aimQ;
    this.lastSent.fire = fire;
  }

  private dispatchCommand(cmd: BansungCommand): void {
    if (!this.emitFn) return;
    this.emitFn(cmd);
    this.recordTxBytes(cmd);
  }

  private recordTxBytes(cmd: BansungCommand): void {
    const nowMs = nowDefaultMs();
    if (this.txWindowStartMs === 0) {
      this.txWindowStartMs = nowMs;
    }
    const approxBytes = cmd.t === 'in' ? 48 : 32;
    this.txWindowBytes += approxBytes;
    const spanMs = nowMs - this.txWindowStartMs;
    if (spanMs >= 1000) {
      this.store.metrics.txBps = Math.round((this.txWindowBytes * 1000) / spanMs);
      this.txWindowBytes = 0;
      this.txWindowStartMs = nowMs;
    }
  }

  private classifyPingKind(wx: number, wy: number): BansungPingKind {
    if (this.downed) return BANSUNG_PING_HELP;

    for (const p of this.store.players.values()) {
      if (p.state !== BANSUNG_STATE_DEAD && p.revivePct !== undefined && p.state === 5) {
        if (Math.hypot(p.x - wx, p.y - wy) <= 64) {
          return BANSUNG_PING_REVIVE;
        }
      }
    }

    if (this.store.boss && this.store.boss.hp > 0) {
      if (Math.hypot(this.store.boss.x - wx, this.store.boss.y - wy) <= 72) {
        return BANSUNG_PING_ENEMY;
      }
    }

    for (const e of this.store.enemies.values()) {
      if (e.hpPct > 0 && e.state !== BANSUNG_STATE_DEAD && Math.hypot(e.x - wx, e.y - wy) <= 64) {
        return BANSUNG_PING_ENEMY;
      }
    }

    for (let i = 0; i < this.store.pickups.length; i++) {
      const pk = this.store.pickups[i];
      if (Math.hypot(pk.x - wx, pk.y - wy) <= 48) {
        return BANSUNG_PING_LOOT;
      }
    }

    return BANSUNG_PING_HELP;
  }

  private getArenaBounds(): { mapW: number; mapH: number } {
    const mapW =
      Number.isFinite(this.store.mapW) && this.store.mapW > 0 ? this.store.mapW : BANSUNG_MAP_W;
    const mapH =
      Number.isFinite(this.store.mapH) && this.store.mapH > 0 ? this.store.mapH : BANSUNG_MAP_H;
    return { mapW, mapH };
  }

  private getActiveGachaChoicesLen(): number {
    const storeAny = this.store as BansungStore & {
      snapshot?: { me?: { gachaChoices?: readonly unknown[] } };
    };
    const me =
      this.store.me ??
      storeAny.snapshot?.me ??
      (typeof this.store.getHudSnapshot === 'function'
        ? this.store.getHudSnapshot().me
        : undefined);
    return Array.isArray(me?.gachaChoices) ? me.gachaChoices.length : 0;
  }

  private resolveAimOriginY(originY: number): number {
    const myIdx = this.store.myIdx;
    const heroIdx =
      typeof myIdx === 'number' && myIdx >= 0
        ? (this.store.players?.get(myIdx)?.heroIdx ?? 0)
        : 0;
    const heroId = BANSUNG_HERO_IDS[heroIdx] ?? 'mascot';
    return originY - getBansungHero(heroId).rig.shoulderLiftY;
  }

  private resolveOriginAndCam(): {
    originX: number;
    originY: number;
    cam: { x: number; y: number; zoom: number };
    viewW: number;
    viewH: number;
  } {
    const viewW = this.canvas?.clientWidth || this.store.viewW || 1280;
    const viewH = this.canvas?.clientHeight || this.store.viewH || 720;
    if (this.hasExternalOrigin) {
      return {
        originX: this.originX,
        originY: this.originY,
        cam: this.extCam,
        viewW,
        viewH,
      };
    }
    return {
      originX: this.store.localDrawX,
      originY: this.store.localDrawY,
      cam: this.store.cam,
      viewW,
      viewH,
    };
  }

  private syncCanvasViewport(): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const viewW = rect.width || this.canvas.clientWidth || this.store.viewW || 1280;
    const viewH = rect.height || this.canvas.clientHeight || this.store.viewH || 720;
    this.store.setViewport(viewW, viewH);
  }

  private clientToCanvasCss(clientX: number, clientY: number): {
    sx: number;
    sy: number;
    viewW: number;
    viewH: number;
  } {
    if (!this.canvas) {
      return {
        sx: clientX,
        sy: clientY,
        viewW: this.store.viewW || 1280,
        viewH: this.store.viewH || 720,
      };
    }
    const rect = this.canvas.getBoundingClientRect();
    const viewW = rect.width || this.canvas.clientWidth || this.store.viewW || 1280;
    const viewH = rect.height || this.canvas.clientHeight || this.store.viewH || 720;
    return {
      sx: clientX - rect.left,
      sy: clientY - rect.top,
      viewW,
      viewH,
    };
  }

  private computeTouchUi(): boolean {
    if (this.touchOverride === 'touch') return true;
    if (this.touchOverride === 'desktop') return false;
    return this.hasCoarsePointer || this.sawTouchPointer;
  }

  private syncTouchUi(): void {
    this.state.touchUi = this.computeTouchUi();
  }

  private markTouchSeen(): void {
    if (!this.sawTouchPointer) {
      this.sawTouchPointer = true;
      this.syncTouchUi();
    }
  }

  private markMouseSeen(): void {
    if (this.sawTouchPointer && !this.hasCoarsePointer && this.touchOverride === 'auto') {
      this.sawTouchPointer = false;
      this.syncTouchUi();
    }
  }

  private trySetCapture(el: Element, pointerId: number): void {
    try {
      if (typeof el.setPointerCapture === 'function') {
        el.setPointerCapture(pointerId);
      }
    } catch {
      /* synthetic test events may lack active pointerId */
    }
  }

  private tryReleaseCapture(el: Element, pointerId: number): void {
    try {
      if (
        typeof el.releasePointerCapture === 'function' &&
        (typeof el.hasPointerCapture !== 'function' || el.hasPointerCapture(pointerId))
      ) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      /* ignore release failures */
    }
  }
}

/** Lazy singleton `BansungInputController` shared by board, touch layer, and renderer. */
export const bansungInput = new BansungInputController();
