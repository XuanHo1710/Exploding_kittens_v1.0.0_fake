/**
 * Co-op companion AI bot (`easy` / `normal` / `hard`, bleedout revive-in-ring
 * rescue, 5-ray kiting/cover, ammo/energy/perk management, anti-stuck) and
 * server 30Hz pet companion simulation (spring-damper follow, needs-based
 * pickup magnet, pounce bite & mini-fire ember support) for `bansung` (d07, d25).
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_GADGETS,
  BANSUNG_HERO_STAT_SCALE,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PERKS,
  BANSUNG_PET_TUNING,
  BANSUNG_PING_REVIVE,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_REVIVE_ENERGY_FLOOR,
  BANSUNG_STATUS_DOWNED,
  BANSUNG_STATUS_REVIVED,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BANSUNG_WEAPONS,
  getGadgetSpec,
  getWeaponSpec,
  quantizeAim,
  resolveBansungEnemyId,
  type ArenaObstacle,
  type BansungBotLevel,
  type BansungCommand,
  type BansungEnemyId,
  type BansungEnemyRole,
  type BansungGadgetId,
  type BansungGadgetState,
  type BansungPerkId,
  type BansungPetKind,
  type BansungPetNetTuple,
  type BansungPetStateId,
  type BansungPickupKind,
  type BansungReviveMode,
  type BansungWeaponId,
  type BansungWeaponSlot,
  type PickupKind,
} from '../../../../shared/src';
import { applyBansungDamage, type BansungCombatTarget } from './damage';
import {
  distPointToSegmentSq,
  hasLineOfSight,
  ObstacleGrid,
  raycastObstacles,
} from './spatial';

// ============================================================================
// 1. Co-op Downed / Revive Constants & Helpers (d07)
// ============================================================================

export type BansungLifeState = 'alive' | 'downed' | 'dead';
export type BansungReviveRule = BansungReviveMode;

export const BANSUNG_REVIVE_RADIUS = 72;
export const BANSUNG_CRAWL_MULT = 0.28;
export const BANSUNG_REVIVE_DECAY_S = 0.45;
export const BANSUNG_REVIVE_INVULN_S = 2.0;
export const BANSUNG_REVIVE_PUSH_R = 110;
export const BANSUNG_DOWN_PENALTY_S = 3;
export const BANSUNG_MIN_BLEEDOUT_S = 8;

export interface BansungRevivePreset {
  readonly bleedoutS: number;
  readonly reviveTimeS: number;
  readonly waveRespawnHpPct: number;
}

export const BANSUNG_REVIVE_PRESETS: Readonly<Record<BansungReviveMode, BansungRevivePreset>> = {
  coop: { bleedoutS: 18, reviveTimeS: 2.6, waveRespawnHpPct: 0.5 },
  circle: { bleedoutS: 18, reviveTimeS: 2.6, waveRespawnHpPct: 0.5 },
  wave_only: { bleedoutS: 24, reviveTimeS: 1.8, waveRespawnHpPct: 1.0 },
  hardcore: { bleedoutS: 12, reviveTimeS: 3.2, waveRespawnHpPct: 0 },
};

// ============================================================================
// 2. Bot & Pet World Interfaces (Decoupled from world.ts)
// ============================================================================

export type BotAiState =
  | 'combat'
  | 'kite'
  | 'rescue'
  | 'loot'
  | 'regroup'
  | 'downed_crawl'
  | 'dead';

export interface BotProfile {
  readonly level: BansungBotLevel;
  readonly thinkIntervalTicks: number;
  readonly aimJitterDeg: number;
  readonly aimJitterRad: number;
  readonly velocityLead: number;
  readonly dashReflex: number;
  readonly revivePriority: number;
  readonly activeReloadChance: number;
  readonly perkDelayTicks: number;
}

export const BANSUNG_BOT_PROFILES: Readonly<Record<BansungBotLevel, BotProfile>> = {
  easy: {
    level: 'easy',
    thinkIntervalTicks: 6,
    aimJitterDeg: 10.0,
    aimJitterRad: (10.0 * Math.PI) / 180,
    velocityLead: 0.0,
    dashReflex: 0.4,
    revivePriority: 0.6,
    activeReloadChance: 0.15,
    perkDelayTicks: 24,
  },
  normal: {
    level: 'normal',
    thinkIntervalTicks: 3,
    aimJitterDeg: 4.5,
    aimJitterRad: (4.5 * Math.PI) / 180,
    velocityLead: 0.65,
    dashReflex: 0.8,
    revivePriority: 1.0,
    activeReloadChance: 0.55,
    perkDelayTicks: 15,
  },
  hard: {
    level: 'hard',
    thinkIntervalTicks: 2,
    aimJitterDeg: 1.5,
    aimJitterRad: (1.5 * Math.PI) / 180,
    velocityLead: 1.0,
    dashReflex: 1.0,
    revivePriority: 1.4,
    activeReloadChance: 0.9,
    perkDelayTicks: 6,
  },
};

export interface BotBrain {
  level: BansungBotLevel;
  state: BotAiState;
  strafeDir: -1 | 1;
  strafeFlipAt: number;
  nextThinkTick: number;
  stuckPos: { x: number; y: number };
  stuckAt: number;
  unstuckUntil: number;
  unstuckAngle: number;
  targetId: number | string | null;
  rescueTargetId: number | string | null;
  moveX: number;
  moveY: number;
  aimRad: number;
  firing: boolean;
  seq: number;
  lastJitterRad: number;
  perkOfferTick: number;
  lastReloadAttemptTick: number;
  lastDashTick: number;
  lastGadgetTick: number;
  lastUseTick: number;
  lastPingTick: number;
  rngState: number;
}

export interface BansungPetState {
  kind: BansungPetKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: BansungPetStateId;
  stateTimer: number;
  pounceCd: number;
  fireCd: number;
  left: boolean;
  targetId: number | string | null;
  hitDone: boolean;
}

export interface BotPlayerView {
  id: string;
  idx?: number;
  bot?: boolean;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius?: number;
  aimRad?: number;
  aimCos?: number;
  hp: number;
  maxHp: number;
  shield?: number;
  maxShield?: number;
  armor?: number;
  maxArmor?: number;
  energy: number;
  maxEnergy: number;
  alive?: boolean;
  downed?: boolean;
  life?: BansungLifeState;
  bleedLeft?: number;
  bleedMax?: number;
  downCountWave?: number;
  reviveProg?: number;
  reviveContrib?: Record<string, number>;
  rescuersCount?: number;
  invulnTimer?: number;
  hitIframesMs?: number;
  dashCdMs?: number;
  dashLeftMs?: number;
  dashing?: boolean;
  stunMs?: number;
  stunTicks?: number;
  stunned?: boolean;
  slots?: readonly (BansungWeaponSlot | null)[];
  slotIdx?: number;
  weaponId?: BansungWeaponId;
  reloadMs?: number;
  reloadTotalMs?: number;
  reloading?: boolean;
  reloadAttempted?: boolean;
  sweetSpot?: readonly [number, number];
  gadget?: BansungGadgetState;
  heroId?: string;
  skillCdMs?: number;
  perkChoices?: readonly BansungPerkId[];
  perks?: readonly BansungPerkId[];
  reviveSpeedMul?: number;
  droneTethered?: boolean;
  revives?: number;
  stats?: { revives: number };
  brain?: BotBrain;
  pet?: BansungPetState;
}

export interface BotEnemyView {
  id: number | string;
  kind?: BansungEnemyId | string;
  role?: BansungEnemyRole;
  isBoss?: boolean;
  isBossPart?: boolean;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius?: number;
  hp?: number;
  maxHp?: number;
  alive: boolean;
  state?: string | number;
  fusing?: boolean;
  armorType?: 'light' | 'armored';
  flatArmor?: number;
  tier?: 'hero' | 'mob' | 'elite' | 'boss';
  shield?: number;
  maxShield?: number;
  kbResist?: number;
}

export interface BotProjectileView {
  id?: number | string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius?: number;
  fromEnemy?: boolean;
  team?: number;
  alive?: boolean;
}

export interface BotTelegraphView {
  id?: number | string;
  /** 0 = laser line (x0,y0 -> x1,y1), 1 = ground circle (x1,y1, r) */
  kind: 0 | 1;
  phase?: 0 | 1;
  /** 0..255 progress */
  prog?: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
}

export interface BotPickupView {
  id: number | string;
  kind: PickupKind | BansungPickupKind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  amount?: number;
  weaponId?: BansungWeaponId;
  alive?: boolean;
  claimed?: boolean;
  spawnLockTicks?: number;
}

export interface BotWorldView {
  tickNo?: number;
  mapW?: number;
  mapH?: number;
  playable?: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
  reviveMode?: BansungReviveMode;
  obsGrid?: ObstacleGrid;
  obstacles?: readonly ArenaObstacle[];
  players: readonly BotPlayerView[];
  enemies: readonly BotEnemyView[];
  projectiles?: readonly BotProjectileView[];
  bullets?: readonly BotProjectileView[];
  telegraphs?: readonly BotTelegraphView[];
  pickups?: readonly BotPickupView[];
  fx?: number[];
  rng?: () => number;
  applyPlayerInput?: (playerId: string, cmd: BansungCommand) => unknown;
  enqueueCommand?: (playerId: string, cmd: BansungCommand) => unknown;
  onPetPounceHit?: (event: PetPounceHitEvent) => void;
  onPetSpawnEmber?: (event: PetEmberSpawnEvent) => void;
  onPetPickupCapture?: (event: PetPickupCaptureEvent) => void;
  onRevivePushback?: (target: BotPlayerView, radiusPx: number) => void;
}

export interface PetPounceHitEvent {
  readonly ownerId: string;
  readonly targetId: number | string;
  readonly x: number;
  readonly y: number;
  readonly damage: number;
  readonly dmgKind: 'kinetic';
  readonly knockVx: number;
  readonly knockVy: number;
  readonly fxKind: 'bite_spark';
}

export interface PetEmberSpawnEvent {
  readonly ownerId: string;
  readonly targetId: number | string;
  readonly projKind: 'pet_ember';
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly aimRad: number;
  readonly radius: number;
  readonly damage: number;
  readonly ttlS: number;
  readonly burnChance: number;
  readonly burnDurS: number;
  readonly burnDps: number;
}

export interface PetPickupCaptureEvent {
  readonly ownerId: string;
  readonly pickupId: number | string;
  readonly kind: PickupKind | BansungPickupKind;
  readonly x: number;
  readonly y: number;
}

export interface PetStepCallbacks {
  onPounceHit?: (event: PetPounceHitEvent) => void;
  onSpawnEmber?: (event: PetEmberSpawnEvent) => void;
  onPickupCapture?: (event: PetPickupCaptureEvent) => void;
}

export interface PetStepResult {
  pounceHits: PetPounceHitEvent[];
  spawnedEmbers: PetEmberSpawnEvent[];
  capturedPickups: PetPickupCaptureEvent[];
}

export interface ReviveStepResult {
  revivedIds: string[];
  deadIds: string[];
  partyWiped: boolean;
}

// ============================================================================
// 3. Internal Math, PRNG, Scratch Buffers & Ray Helpers
// ============================================================================

const DEFAULT_HERO_RADIUS = 13;
const DEFAULT_PICKUP_CAPTURE_R = BANSUNG_PET_TUNING.MAGNET_CAPTURE_RADIUS;
const BOT_IDEAL_RANGE_BY_WEAPON: Partial<Record<BansungWeaponId, number>> = {
  pistol: 230,
  rifle: 280,
  smg: 235,
  shotgun: 150,
  grenade_launcher: 260,
  stun_launcher: 270,
  bazooka: 320,
  mine_gun: 240,
  plasma_rifle: 290,
  railgun: 400,
  lightning_staff: 300,
  arcane_book: 290,
  crescent_blade: 56,
  reaper_scythe: 78,
  shock_baton: 52,
  sniper_rifle: 520,
  laser_cannon: 560,
  electric_gun: 310,
  blizzard_carbine: 330,
  ricochet_disc: 360,
  phantom_bow: 460,
  magma_spitter: 290,
  chronos_rifle: 410,
  orbital_cannon: 430,
};

const FIVE_RAY_OFFSETS_RAD = [
  0,
  (35 * Math.PI) / 180,
  (-35 * Math.PI) / 180,
  (70 * Math.PI) / 180,
  (-70 * Math.PI) / 180,
] as const;

const EIGHT_RAY_ANGLES_RAD = [
  0,
  Math.PI * 0.25,
  Math.PI * 0.5,
  Math.PI * 0.75,
  Math.PI,
  -Math.PI * 0.75,
  -Math.PI * 0.5,
  -Math.PI * 0.25,
] as const;

const PERK_PRIORITY_BASE: Record<string, number> = {
  coop_med_aura: 95,
  vitality_boost: 90,
  iron_bastion: 88,
  quick_hands: 86,
  piercing_rounds: 84,
  blast_master: 82,
  vampiric_fang: 80,
  ricochet_shot: 78,
  static_shield: 76,
  energy_overflow: 74,
  swift_boots: 72,
  magnet_aura: 65,
};

const tmpRayClearance = new Float64Array(8);
const steerOut = { x: 0, y: 0 };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nextRand(brain: BotBrain, extRng?: () => number): number {
  if (extRng) return extRng();
  let s = (brain.rngState + 0x6d2b79f5) >>> 0;
  brain.rngState = s;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function sampleBellJitter(brain: BotBrain, maxAbsRad: number, extRng?: () => number): number {
  if (maxAbsRad <= 0) return 0;
  // Irwin-Hall 3-sample bell curve in [-1, 1] without unbounded Gaussian tails
  const sum = nextRand(brain, extRng) + nextRand(brain, extRng) + nextRand(brain, extRng);
  return ((sum - 1.5) / 1.5) * maxAbsRad;
}

function getPlayerShield(p: BotPlayerView): number {
  return p.shield ?? p.armor ?? 0;
}

function getPlayerMaxShield(p: BotPlayerView): number {
  return p.maxShield ?? p.maxArmor ?? 0;
}

function isPlayerAlive(p: BotPlayerView): boolean {
  if (p.life !== undefined) return p.life === 'alive';
  return Boolean(p.alive) && !p.downed && p.hp > 0;
}

function isPlayerDowned(p: BotPlayerView): boolean {
  if (p.life !== undefined) return p.life === 'downed';
  return Boolean(p.downed) || (Boolean(p.alive) && p.hp <= 0);
}

function isPlayerDead(p: BotPlayerView): boolean {
  if (p.life !== undefined) return p.life === 'dead';
  return !p.alive && !p.downed;
}

function getEnemyRole(e: BotEnemyView): BansungEnemyRole {
  if (e.role) return e.role;
  if (e.isBoss) return 'boss';
  if (e.kind) {
    const resolved = resolveBansungEnemyId(String(e.kind));
    if (resolved) return BANSUNG_ENEMIES[resolved].role;
  }
  return 'melee';
}

function isBossEnemy(e: BotEnemyView): boolean {
  return Boolean(e.isBoss) || getEnemyRole(e) === 'boss';
}

function getBotActiveSlot(bot: BotPlayerView): {
  slotIdx: number;
  weaponId: BansungWeaponId;
  clip: number;
  maxClip: number;
} {
  const slots = bot.slots;
  if (slots && slots.length > 0) {
    const idx = clamp(bot.slotIdx ?? 0, 0, slots.length - 1);
    const s = slots[idx] ?? slots.find((x): x is BansungWeaponSlot => Boolean(x));
    if (s) {
      return {
        slotIdx: idx,
        weaponId: s.id,
        clip: s.clip,
        maxClip: s.maxClip,
      };
    }
  }
  const weaponId = bot.weaponId ?? 'rifle';
  const spec = getWeaponSpec(weaponId);
  return {
    slotIdx: bot.slotIdx ?? 0,
    weaponId,
    clip: spec.magSize > 0 ? spec.magSize : -1,
    maxClip: spec.magSize,
  };
}

function getPlayableBounds(world: BotWorldView): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  if (world.playable) return world.playable;
  if (world.mapW !== undefined || world.mapH !== undefined) {
    if (
      (world.mapW === undefined || world.mapW === BANSUNG_MAP_W) &&
      (world.mapH === undefined || world.mapH === BANSUNG_MAP_H)
    ) {
      return BANSUNG_PLAYABLE_BOUNDS;
    }
    return {
      x0: 16,
      y0: 16,
      x1: Math.max(64, (world.mapW ?? BANSUNG_MAP_W) - 16),
      y1: Math.max(64, (world.mapH ?? BANSUNG_MAP_H) - 16),
    };
  }
  return BANSUNG_PLAYABLE_BOUNDS;
}

/**
 * Casts a segment against `obsGrid` (or fallback `world.obstacles`) plus arena
 * playable boundaries, returning hit fraction `t in [0, 1]` and outward normal.
 */
function castSegmentClearance(
  world: BotWorldView,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  mode: 'move' | 'bullet' | 'los',
): { t: number; nx: number; ny: number } {
  let bestT = 1;
  let bestNx = 0;
  let bestNy = 0;

  const dx = x1 - x0;
  const dy = y1 - y0;

  // Check playable arena borders so rays avoid perimeter walls even without obsGrid.
  if (mode === 'move') {
    const b = getPlayableBounds(world);
    const minX = b.x0 + radius;
    const maxX = b.x1 - radius;
    const minY = b.y0 + radius;
    const maxY = b.y1 - radius;

    if (dx < -1e-6 && x0 + dx < minX) {
      const t = clamp((minX - x0) / dx, 0, 1);
      if (t < bestT) {
        bestT = t;
        bestNx = 1;
        bestNy = 0;
      }
    } else if (dx > 1e-6 && x0 + dx > maxX) {
      const t = clamp((maxX - x0) / dx, 0, 1);
      if (t < bestT) {
        bestT = t;
        bestNx = -1;
        bestNy = 0;
      }
    }
    if (dy < -1e-6 && y0 + dy < minY) {
      const t = clamp((minY - y0) / dy, 0, 1);
      if (t < bestT) {
        bestT = t;
        bestNx = 0;
        bestNy = 1;
      }
    } else if (dy > 1e-6 && y0 + dy > maxY) {
      const t = clamp((maxY - y0) / dy, 0, 1);
      if (t < bestT) {
        bestT = t;
        bestNx = 0;
        bestNy = -1;
      }
    }
  }

  if (world.obsGrid) {
    const hit = raycastObstacles(world.obsGrid, x0, y0, x1, y1, radius, mode);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      bestNx = hit.nx;
      bestNy = hit.ny;
    }
    return { t: bestT, nx: bestNx, ny: bestNy };
  }

  const obstacles = world.obstacles;
  if (obstacles && obstacles.length > 0) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.alive) continue;
      if (mode === 'move' && !o.blocksMove) continue;
      if (mode === 'bullet' && !o.blocksBullet) continue;
      if (mode === 'los' && !o.blocksLos) continue;
      const hitT = slabAabbRay(x0, y0, dx, dy, o.x - radius, o.y - radius, o.w + radius * 2, o.h + radius * 2);
      if (hitT !== null && hitT.t < bestT) {
        bestT = hitT.t;
        bestNx = hitT.nx;
        bestNy = hitT.ny;
      }
    }
  }

  return { t: bestT, nx: bestNx, ny: bestNy };
}

function slabAabbRay(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { t: number; nx: number; ny: number } | null {
  const maxX = rx + rw;
  const maxY = ry + rh;
  if (x0 > rx && x0 < maxX && y0 > ry && y0 < maxY) {
    const len = Math.hypot(dx, dy);
    return {
      t: 0,
      nx: len > 1e-6 ? -dx / len : 0,
      ny: len > 1e-6 ? -dy / len : -1,
    };
  }
  let t0 = 0;
  let t1 = 1;
  let nx = 0;
  let ny = 0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 <= rx || x0 >= maxX) return null;
  } else {
    const inv = 1 / dx;
    let a = (rx - x0) * inv;
    let b = (maxX - x0) * inv;
    let sign = -1;
    if (a > b) {
      const tmp = a;
      a = b;
      b = tmp;
      sign = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = sign;
      ny = 0;
    }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 <= ry || y0 >= maxY) return null;
  } else {
    const inv = 1 / dy;
    let a = (ry - y0) * inv;
    let b = (maxY - y0) * inv;
    let sign = -1;
    if (a > b) {
      const tmp = a;
      a = b;
      b = tmp;
      sign = 1;
    }
    if (a > t0) {
      t0 = a;
      nx = 0;
      ny = sign;
    }
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  if (t0 < 0 || t0 > 1) return null;
  return { t: t0, nx, ny };
}

function hasWorldLos(
  world: BotWorldView,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mode: 'bullet' | 'los',
): boolean {
  if (world.obsGrid) {
    return hasLineOfSight(world.obsGrid, x0, y0, x1, y1, mode);
  }
  if (world.obstacles && world.obstacles.length > 0) {
    return castSegmentClearance(world, x0, y0, x1, y1, 0, mode).t >= 1 - 1e-6;
  }
  return true;
}

/**
 * 5-ray obstacle avoidance (`0°, ±35°, ±70°`) around desired direction `(desX, desY)`.
 * Writes normalized steering vector into `steerOut` and returns center-ray hit info.
 */
function steerWithFiveRays(
  world: BotWorldView,
  brain: BotBrain,
  x: number,
  y: number,
  radius: number,
  desX: number,
  desY: number,
  rayLen = 84,
): { centerBlocked: boolean } {
  const len = Math.hypot(desX, desY);
  if (len <= 1e-5) {
    steerOut.x = 0;
    steerOut.y = 0;
    return { centerBlocked: false };
  }
  const ux = desX / len;
  const uy = desY / len;
  const baseAngle = Math.atan2(uy, ux);

  const centerHit = castSegmentClearance(
    world,
    x,
    y,
    x + ux * rayLen,
    y + uy * rayLen,
    radius,
    'move',
  );
  if (centerHit.t >= 0.92) {
    steerOut.x = ux;
    steerOut.y = uy;
    return { centerBlocked: false };
  }

  let bestScore = -1;
  let bestCos = ux;
  let bestSin = uy;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < FIVE_RAY_OFFSETS_RAD.length; i++) {
    const off = FIVE_RAY_OFFSETS_RAD[i];
    const ang = baseAngle + off;
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    const hit =
      i === 0
        ? centerHit
        : castSegmentClearance(world, x, y, x + cx * rayLen, y + cy * rayLen, radius, 'move');
    tmpRayClearance[i] = hit.t;

    const forwardBias = 1 - Math.abs(off) / Math.PI * 0.45;
    const strafeTie =
      off === 0 ? 0 : (off > 0 ? 1 : -1) === brain.strafeDir ? 0.04 : 0;
    const score = hit.t * forwardBias + strafeTie;
    if (score > bestScore) {
      bestScore = score;
      bestCos = cx;
      bestSin = cy;
    }
    if (hit.t > 0.25) {
      const w = hit.t * hit.t * forwardBias;
      sumX += cx * w;
      sumY += cy * w;
    }
  }

  let outX = sumX + bestCos * 0.65 + centerHit.nx * (1 - centerHit.t) * 0.6;
  let outY = sumY + bestSin * 0.65 + centerHit.ny * (1 - centerHit.t) * 0.6;
  const outLen = Math.hypot(outX, outY);
  if (outLen > 1e-5) {
    steerOut.x = outX / outLen;
    steerOut.y = outY / outLen;
  } else {
    steerOut.x = bestCos;
    steerOut.y = bestSin;
  }
  return { centerBlocked: centerHit.t < 0.35 };
}

/**
 * Evaluates 5 clearance rays (`64px`) around a preferred perpendicular dash
 * heading so the bot never dashes head-first into a wall or arena corner.
 */
function pickSafeDashDirection(
  world: BotWorldView,
  x: number,
  y: number,
  radius: number,
  threatX: number,
  threatY: number,
  strafeDir: -1 | 1,
): { dx: number; dy: number } | null {
  const tLen = Math.hypot(threatX, threatY);
  const tx = tLen > 1e-5 ? threatX / tLen : 1;
  const ty = tLen > 1e-5 ? threatY / tLen : 0;
  // Primary perpendicular candidates (+strafe, -strafe) and retreat away from threat.
  const baseAngles = [
    Math.atan2(tx * strafeDir, -ty * strafeDir),
    Math.atan2(-tx * strafeDir, ty * strafeDir),
    Math.atan2(-ty, -tx),
  ];

  let bestScore = -1;
  let bestDx = 0;
  let bestDy = 0;
  const dashProbePx = 64;

  for (let aIdx = 0; aIdx < baseAngles.length; aIdx++) {
    const base = baseAngles[aIdx];
    const priority = aIdx === 2 ? 0.78 : aIdx === 0 ? 1.0 : 0.94;
    for (let rIdx = 0; rIdx < FIVE_RAY_OFFSETS_RAD.length; rIdx++) {
      const ang = base + FIVE_RAY_OFFSETS_RAD[rIdx];
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const hit = castSegmentClearance(
        world,
        x,
        y,
        x + dx * dashProbePx,
        y + dy * dashProbePx,
        radius,
        'move',
      );
      if (hit.t < 0.56) continue;
      const score = hit.t * priority * (1 - Math.abs(FIVE_RAY_OFFSETS_RAD[rIdx]) * 0.15);
      if (score > bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return bestScore > 0 ? { dx: bestDx, dy: bestDy } : null;
}

// ============================================================================
// 4. Downed & Revive Circle Step Helper (d07)
// ============================================================================

/**
 * Transitions an alive player to `'downed'` state with repeat-down bleedout
 * penalty per wave (`BANSUNG_DOWN_PENALTY_S`), zeroing shield and active progress.
 */
export function enterDownedState(
  player: BotPlayerView,
  reviveMode: BansungReviveMode = 'coop',
  fx?: number[],
): void {
  const preset = BANSUNG_REVIVE_PRESETS[reviveMode] ?? BANSUNG_REVIVE_PRESETS.coop;
  const downs = (player.downCountWave ?? 0) + 1;
  const bleedMax = Math.max(
    BANSUNG_MIN_BLEEDOUT_S,
    preset.bleedoutS - BANSUNG_DOWN_PENALTY_S * (downs - 1),
  );
  player.life = 'downed';
  player.downed = true;
  player.alive = true;
  player.hp = 0;
  if (player.shield !== undefined) player.shield = 0;
  if (player.armor !== undefined) player.armor = 0;
  player.downCountWave = downs;
  player.reviveProg = 0;
  player.rescuersCount = 0;
  player.bleedMax = bleedMax;
  player.bleedLeft = bleedMax;
  player.reviveContrib = {};
  player.dashLeftMs = 0;
  player.dashing = false;
  player.reloadMs = 0;
  player.reloading = false;

  if (fx && player.idx !== undefined) {
    fx.push(
      5,
      player.idx,
      BANSUNG_STATUS_DOWNED,
      Math.round(bleedMax),
      Math.round(player.x),
      Math.round(player.y),
    );
  }
}

/**
 * Advances bleedout timers and auto-channeling co-op revive circles at 30Hz (`d07`).
 */
export function stepDownedAndRevive(
  world: BotWorldView,
  dt = 1 / BANSUNG_TICK_HZ,
): ReviveStepResult {
  const preset =
    BANSUNG_REVIVE_PRESETS[world.reviveMode ?? 'coop'] ?? BANSUNG_REVIVE_PRESETS.coop;
  const revivedIds: string[] = [];
  const deadIds: string[] = [];
  const rSq = BANSUNG_REVIVE_RADIUS * BANSUNG_REVIVE_RADIUS;

  for (let i = 0; i < world.players.length; i++) {
    const target = world.players[i];
    if (!isPlayerDowned(target)) continue;

    let rescuerCount = 0;
    let maxPerkReviveBonus = 0;
    for (let j = 0; j < world.players.length; j++) {
      const ally = world.players[j];
      if (ally.id === target.id || !isPlayerAlive(ally)) continue;
      const dx = ally.x - target.x;
      const dy = ally.y - target.y;
      if (dx * dx + dy * dy <= rSq) {
        rescuerCount++;
        if (!target.reviveContrib) target.reviveContrib = {};
        target.reviveContrib[ally.id] = (target.reviveContrib[ally.id] ?? 0) + 1;
        const perkBonus = Math.max(0, (ally.reviveSpeedMul ?? 1) - 1);
        if (perkBonus > maxPerkReviveBonus) maxPerkReviveBonus = perkBonus;
      }
    }

    target.rescuersCount = rescuerCount;

    if (rescuerCount > 0) {
      const mult = Math.min(2.0, 1 + 0.45 * (rescuerCount - 1));
      const droneBonus = target.droneTethered ? 0.25 : 0;
      const speedMul = mult * (1 + maxPerkReviveBonus + droneBonus);
      target.reviveProg = (target.reviveProg ?? 0) + (dt / preset.reviveTimeS) * speedMul;

      if (target.reviveProg >= 1) {
        target.life = 'alive';
        target.downed = false;
        target.alive = true;
        target.hp = Math.ceil(target.maxHp * 0.45);
        const maxSh = getPlayerMaxShield(target);
        const restoredSh = Math.ceil(maxSh * 0.5);
        if (target.shield !== undefined) target.shield = restoredSh;
        if (target.armor !== undefined) target.armor = restoredSh;
        target.energy = Math.max(
          target.energy,
          Math.ceil(target.maxEnergy * BANSUNG_REVIVE_ENERGY_FLOOR),
        );
        target.invulnTimer = BANSUNG_REVIVE_INVULN_S;
        target.hitIframesMs = BANSUNG_REVIVE_INVULN_S * 1000;
        target.reviveProg = 0;
        target.rescuersCount = 0;

        // Push non-boss enemies outward on revive completion (`110px`).
        if (world.onRevivePushback) {
          world.onRevivePushback(target, BANSUNG_REVIVE_PUSH_R);
        } else {
          for (let eIdx = 0; eIdx < world.enemies.length; eIdx++) {
            const e = world.enemies[eIdx];
            if (!e.alive || isBossEnemy(e)) continue;
            const ex = e.x - target.x;
            const ey = e.y - target.y;
            const d = Math.hypot(ex, ey);
            if (d < BANSUNG_REVIVE_PUSH_R) {
              const push = (BANSUNG_REVIVE_PUSH_R - d) * 0.85;
              const ux = d > 1e-4 ? ex / d : 1;
              const uy = d > 1e-4 ? ey / d : 0;
              e.x += ux * push;
              e.y += uy * push;
            }
          }
        }

        // Credit top contributor
        let topId: string | null = null;
        let topScore = -1;
        if (target.reviveContrib) {
          for (const [id, ticks] of Object.entries(target.reviveContrib)) {
            if (ticks > topScore) {
              topScore = ticks;
              topId = id;
            }
          }
        }
        if (topId !== null) {
          for (let j = 0; j < world.players.length; j++) {
            const rescuer = world.players[j];
            if (rescuer.id !== topId) continue;
            if (rescuer.stats) rescuer.stats.revives += 1;
            if (rescuer.revives !== undefined) rescuer.revives += 1;
            break;
          }
        }
        target.reviveContrib = {};
        if (world.fx && target.idx !== undefined) {
          world.fx.push(
            5,
            target.idx,
            BANSUNG_STATUS_REVIVED,
            1,
            Math.round(target.x),
            Math.round(target.y),
          );
        }
        revivedIds.push(target.id);
      }
    } else {
      target.reviveProg = Math.max(0, (target.reviveProg ?? 0) - BANSUNG_REVIVE_DECAY_S * dt);
      const bleedRate = target.droneTethered ? 0.5 : 1.0;
      target.bleedLeft = Math.max(0, (target.bleedLeft ?? preset.bleedoutS) - dt * bleedRate);
      if (target.bleedLeft <= 0) {
        target.life = 'dead';
        target.downed = false;
        target.alive = false;
        target.reviveProg = 0;
        target.rescuersCount = 0;
        deadIds.push(target.id);
      }
    }
  }

  let anyAlive = false;
  for (let i = 0; i < world.players.length; i++) {
    if (isPlayerAlive(world.players[i])) {
      anyAlive = true;
      break;
    }
  }

  return {
    revivedIds,
    deadIds,
    partyWiped: world.players.length > 0 && !anyAlive,
  };
}

// ============================================================================
// 5. Co-op Companion AI Bot (d07, d31, d32)
// ============================================================================

/** Creates a fresh `BotBrain` for the given difficulty profile and deterministic seed. */
export function createBotBrain(
  level: BansungBotLevel = 'normal',
  seed = 1,
): BotBrain {
  return {
    level,
    state: 'combat',
    strafeDir: (seed & 1) === 0 ? 1 : -1,
    strafeFlipAt: 45,
    nextThinkTick: 0,
    stuckPos: { x: 0, y: 0 },
    stuckAt: 0,
    unstuckUntil: 0,
    unstuckAngle: 0,
    targetId: null,
    rescueTargetId: null,
    moveX: 0,
    moveY: 0,
    aimRad: 0,
    firing: false,
    seq: 0,
    lastJitterRad: 0,
    perkOfferTick: -1,
    lastReloadAttemptTick: -99,
    lastDashTick: -99,
    lastGadgetTick: -99,
    lastUseTick: -99,
    lastPingTick: -99,
    rngState: (seed * 2654435761) >>> 0 || 1,
  };
}

function getTargetRoleWeight(enemy: BotEnemyView): number {
  if (enemy.isBossPart) return 2.4;
  if (enemy.kind === 'bomb_goblin' || enemy.kind === 'laser_sniper') return 1.6;
  const role = getEnemyRole(enemy);
  if (role === 'bomber') return 1.6;
  if (role === 'caster') return 1.3;
  if (role === 'boss') return 1.15;
  return 1.0;
}

function getMinSafeDist(enemy: BotEnemyView): number {
  if (enemy.kind === 'bomb_goblin' || getEnemyRole(enemy) === 'bomber') return 220;
  if (isBossEnemy(enemy)) return 220;
  if (getEnemyRole(enemy) === 'melee' || getEnemyRole(enemy) === 'brute') return 140;
  return 115;
}

function findEmergencyDashThreat(
  world: BotWorldView,
  bot: BotPlayerView,
  profile: BotProfile,
): { tx: number; ty: number } | null {
  const botRadius = bot.radius ?? DEFAULT_HERO_RADIUS;
  const telegraphs = world.telegraphs;
  if (telegraphs && telegraphs.length > 0) {
    const minProg =
      profile.level === 'easy' ? 165 : profile.level === 'normal' ? 110 : 50;
    for (let i = 0; i < telegraphs.length; i++) {
      const tel = telegraphs[i];
      if ((tel.prog ?? 255) < minProg && tel.phase !== 1) continue;
      if (tel.kind === 1) {
        const dx = bot.x - tel.x1;
        const dy = bot.y - tel.y1;
        const hitR = tel.r + botRadius + 6;
        if (dx * dx + dy * dy <= hitR * hitR) {
          return { tx: -dy, ty: dx };
        }
      } else {
        const hitR = (tel.r > 0 ? tel.r : 16) + botRadius + 8;
        if (distPointToSegmentSq(bot.x, bot.y, tel.x0, tel.y0, tel.x1, tel.y1) <= hitR * hitR) {
          return { tx: tel.x1 - tel.x0, ty: tel.y1 - tel.y0 };
        }
      }
    }
  }

  const projs = world.projectiles ?? world.bullets;
  const projHorizon =
    profile.level === 'easy' ? 52 : profile.level === 'normal' ? 68 : 75;
  const projHorizonSq = projHorizon * projHorizon;
  if (projs && projs.length > 0) {
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (p.alive === false) continue;
      const isEnemyShot = p.fromEnemy ?? p.team === 1;
      if (!isEnemyShot) continue;
      const rx = bot.x - p.x;
      const ry = bot.y - p.y;
      const d2 = rx * rx + ry * ry;
      if (d2 > projHorizonSq) continue;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      if (v2 <= 1e-4) continue;
      const dot = rx * p.vx + ry * p.vy;
      if (dot <= 0) continue; // moving away
      const invV = 1 / Math.sqrt(v2);
      const perpDist = Math.abs(rx * p.vy - ry * p.vx) * invV;
      if (perpDist <= botRadius + (p.radius ?? 5) + 14) {
        return { tx: p.vx, ty: p.vy };
      }
    }
  }

  // Fuse-lit Bomb Goblin inside imminent blast radius
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    const isFusing =
      e.fusing || e.state === 'fuse' || e.state === 5;
    if (!isFusing && e.kind !== 'bomb_goblin') continue;
    const dx = bot.x - e.x;
    const dy = bot.y - e.y;
    const d2 = dx * dx + dy * dy;
    const triggerR = isFusing ? 78 : 54;
    if (d2 <= triggerR * triggerR) {
      return { tx: -dy, ty: dx };
    }
  }

  return null;
}

function selectBestDownedAlly(
  world: BotWorldView,
  bot: BotPlayerView,
  profile: BotProfile,
): BotPlayerView | null {
  const botHpPct = bot.hp / Math.max(1, bot.maxHp);
  const botShield = getPlayerShield(bot);

  let nearestMeleeDistSq = Infinity;
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    const role = getEnemyRole(e);
    if (role !== 'melee' && role !== 'bomber' && role !== 'brute') continue;
    const dx = e.x - bot.x;
    const dy = e.y - bot.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestMeleeDistSq) nearestMeleeDistSq = d2;
  }

  let best: BotPlayerView | null = null;
  let bestScore = -1;

  for (let i = 0; i < world.players.length; i++) {
    const ally = world.players[i];
    if (ally.id === bot.id || !isPlayerDowned(ally)) continue;
    const bleedLeft = Math.max(0.5, ally.bleedLeft ?? 12);

    // Health gate from d07: enter rescue if hp > 22% or bleedLeft < 6s
    if (botHpPct <= 0.22 && bleedLeft >= 6) continue;
    // Temporary kite out if shield stripped, critical HP, and bleed timer has margin
    if (botShield <= 0 && botHpPct < 0.30 && bleedLeft > 5) continue;
    // Easy bots fight close melee threats first when bleedout isn't urgent
    if (profile.level === 'easy' && nearestMeleeDistSq < 95 * 95 && bleedLeft > 6) continue;

    const isHuman = !ally.bot;
    const dist = Math.hypot(ally.x - bot.x, ally.y - bot.y);
    const distBonus = 1 / (1 + dist / 450);
    const score =
      ((isHuman ? 1.35 : 1.0) * profile.revivePriority / Math.max(2, bleedLeft)) *
      (0.75 + 0.5 * distBonus);
    if (score > bestScore) {
      bestScore = score;
      best = ally;
    }
  }

  return best;
}

interface TargetCandidate {
  kind: 'enemy' | 'barrel';
  id: number | string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  score: number;
  hasLos: boolean;
}

function selectCombatTarget(
  world: BotWorldView,
  bot: BotPlayerView,
  maxRange: number,
): TargetCandidate | null {
  let best: TargetCandidate | null = null;
  const maxCheckDist = Math.max(maxRange + 120, 480);

  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    const dist = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (dist > maxCheckDist) continue;

    const roleWeight = getTargetRoleWeight(e);
    const clearLos = hasWorldLos(world, bot.x, bot.y, e.x, e.y, 'bullet');

    let threatensDowned = false;
    for (let j = 0; j < world.players.length; j++) {
      const p = world.players[j];
      if (!isPlayerDowned(p)) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= 180 * 180) {
        threatensDowned = true;
        break;
      }
    }

    let score = (roleWeight / Math.max(60, dist)) * (clearLos ? 1.35 : 1.0);
    if (threatensDowned) score *= 1.3;

    if (!best || score > best.score) {
      best = {
        kind: 'enemy',
        id: e.id,
        x: e.x,
        y: e.y,
        vx: e.vx ?? 0,
        vy: e.vy ?? 0,
        dist,
        score,
        hasLos: clearLos,
      };
    }
  }

  // Opportunistic explosive barrel shot: 1.5 weight if >=2 mobs within 120px and 0 allies
  const obstacles = world.obsGrid?.obstacles ?? world.obstacles;
  if (obstacles && obstacles.length > 0) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.alive || o.kind !== 'barrel') continue;
      const bx = o.x + o.w * 0.5;
      const by = o.y + o.h * 0.5;
      const dist = Math.hypot(bx - bot.x, by - bot.y);
      if (dist > maxRange) continue;
      if (!hasWorldLos(world, bot.x, bot.y, bx, by, 'bullet')) continue;

      let mobsNear = 0;
      for (let eIdx = 0; eIdx < world.enemies.length; eIdx++) {
        const e = world.enemies[eIdx];
        if (!e.alive) continue;
        const dx = e.x - bx;
        const dy = e.y - by;
        if (dx * dx + dy * dy <= 120 * 120) mobsNear++;
      }
      if (mobsNear < 2) continue;

      let alliesNear = 0;
      for (let pIdx = 0; pIdx < world.players.length; pIdx++) {
        const p = world.players[pIdx];
        if (isPlayerDead(p)) continue;
        const dx = p.x - bx;
        const dy = p.y - by;
        if (dx * dx + dy * dy <= 120 * 120) {
          alliesNear++;
          break;
        }
      }
      if (alliesNear > 0) continue;

      const score = (1.5 / Math.max(60, dist)) * 1.35;
      if (!best || score > best.score) {
        best = {
          kind: 'barrel',
          id: o.id,
          x: bx,
          y: by,
          vx: 0,
          vy: 0,
          dist,
          score,
          hasLos: true,
        };
      }
    }
  }

  return best;
}

function findCoverPosition(
  world: BotWorldView,
  bot: BotPlayerView,
  threatX: number,
  threatY: number,
): { x: number; y: number } | null {
  const obstacles = world.obsGrid?.obstacles ?? world.obstacles;
  if (!obstacles || obstacles.length === 0) return null;

  const botRadius = bot.radius ?? DEFAULT_HERO_RADIUS;
  let bestX = 0;
  let bestY = 0;
  let bestScore = Infinity;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (!o.alive || !o.blocksLos || o.kind === 'wall') continue;
    if (o.kind !== 'pillar' && o.kind !== 'rock') continue;

    const ox = o.x + o.w * 0.5;
    const oy = o.y + o.h * 0.5;
    const distBot = Math.hypot(ox - bot.x, oy - bot.y);
    if (distBot > 380) continue;

    const tx = ox - threatX;
    const ty = oy - threatY;
    const tLen = Math.hypot(tx, ty);
    if (tLen <= 1e-4) continue;

    const halfExtent = Math.max(o.w, o.h) * 0.5 + botRadius + 14;
    const cx = ox + (tx / tLen) * halfExtent;
    const cy = oy + (ty / tLen) * halfExtent;
    const score = Math.hypot(cx - bot.x, cy - bot.y);
    if (score < bestScore) {
      bestScore = score;
      bestX = cx;
      bestY = cy;
    }
  }

  return bestScore < Infinity ? { x: bestX, y: bestY } : null;
}

function findNeededPickup(
  world: BotWorldView,
  bot: BotPlayerView,
): BotPickupView | null {
  const pickups = world.pickups;
  if (!pickups || pickups.length === 0) return null;

  // Do not detour for pickups while a melee/bomber mob threatens within 110px
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    const role = getEnemyRole(e);
    if (role !== 'melee' && role !== 'bomber' && role !== 'brute') continue;
    const dx = e.x - bot.x;
    const dy = e.y - bot.y;
    if (dx * dx + dy * dy <= 110 * 110) return null;
  }

  const maxShield = getPlayerMaxShield(bot);
  const shield = getPlayerShield(bot);
  const needHp = bot.hp < bot.maxHp;
  const needEnergy = bot.energy < bot.maxEnergy;
  const needArmor = maxShield > 0 && shield < maxShield;

  let best: BotPickupView | null = null;
  let bestScore = -1;

  for (let i = 0; i < pickups.length; i++) {
    const pk = pickups[i];
    if (pk.alive === false || pk.claimed) continue;
    const dist = Math.hypot(pk.x - bot.x, pk.y - bot.y);
    if (dist > 280) continue;

    let priority = 0;
    if (pk.kind === 'hp' || pk.kind === 'hp_orb' || pk.kind === 'hp_pack') {
      if (!needHp) continue;
      priority = 1.6 - bot.hp / Math.max(1, bot.maxHp);
    } else if (pk.kind === 'energy' || pk.kind === 'energy_orb' || pk.kind === 'energy_cell') {
      if (!needEnergy) continue;
      priority = 1.2 - bot.energy / Math.max(1, bot.maxEnergy);
    } else if (pk.kind === 'armor' || pk.kind === 'armor_plate') {
      if (!needArmor) continue;
      priority = 1.1 - shield / Math.max(1, maxShield);
    } else if (pk.kind === 'weapon' || pk.kind === 'weapon_pedestal') {
      if (!pk.weaponId || !shouldTakePedestalWeapon(bot, pk.weaponId)) continue;
      priority = 0.85;
    } else if (
      pk.kind === 'xp' ||
      pk.kind === 'xp_orb_s' ||
      pk.kind === 'xp_orb_m' ||
      pk.kind === 'xp_orb_l'
    ) {
      priority = 0.75;
    } else {
      continue;
    }

    const score = priority / Math.max(24, dist);
    if (score > bestScore) {
      bestScore = score;
      best = pk;
    }
  }

  return best;
}

function shouldTakePedestalWeapon(bot: BotPlayerView, weaponId: BansungWeaponId): boolean {
  const slots = bot.slots;
  if (!slots || slots.length === 0) return false;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]?.id === weaponId) return false;
  }
  const cand = BANSUNG_WEAPONS[weaponId];
  if (!cand) return false;
  const active = getBotActiveSlot(bot);
  const cur = getWeaponSpec(active.weaponId);
  const rarityRank: Record<string, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 5,
    celestial: 6,
    mythic: 7,
    prismatic: 8,
  };
  if (active.weaponId === 'pistol') return true;
  return (rarityRank[cand.rarity] ?? 1) > (rarityRank[cur.rarity] ?? 1);
}

function findClosestAliveHuman(
  world: BotWorldView,
  bot: BotPlayerView,
): { player: BotPlayerView; dist: number } | null {
  let best: BotPlayerView | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (p.id === bot.id || p.bot || !isPlayerAlive(p)) continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best ? { player: best, dist: bestDist } : null;
}

function findThreatForCover(world: BotWorldView, bot: BotPlayerView): { x: number; y: number } | null {
  const telegraphs = world.telegraphs;
  if (telegraphs && telegraphs.length > 0) {
    for (let i = 0; i < telegraphs.length; i++) {
      const tel = telegraphs[i];
      if (tel.kind !== 0) continue;
      if (distPointToSegmentSq(bot.x, bot.y, tel.x0, tel.y0, tel.x1, tel.y1) <= 60 * 60) {
        return { x: tel.x0, y: tel.y0 };
      }
    }
  }
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    if (e.kind === 'laser_sniper') {
      const d2 = (e.x - bot.x) ** 2 + (e.y - bot.y) ** 2;
      if (d2 <= 600 * 600) return { x: e.x, y: e.y };
    }
  }
  return null;
}

function maybeManageWeaponAndReload(
  world: BotWorldView,
  bot: BotPlayerView,
  brain: BotBrain,
  profile: BotProfile,
  tickNo: number,
  nearestEnemyDist: number,
  target: TargetCandidate | null,
  emitCmd: (c: BansungCommand) => void,
): void {
  const active = getBotActiveSlot(bot);
  const activeSpec = getWeaponSpec(active.weaponId);
  const energyPct = bot.energy / Math.max(1, bot.maxEnergy);
  const isReloading = Boolean(bot.reloading) || (bot.reloadMs ?? 0) > 0;

  // Active-reload sweet-spot tap while reloading
  const fallbackTotal = activeSpec.reloadTicks * BANSUNG_TICK_EXACT_MS;
  const total = (bot.reloadTotalMs ?? 0) > 0 ? bot.reloadTotalMs! : fallbackTotal;
  if (isReloading && !bot.reloadAttempted && total > 0) {
    const left = clamp(bot.reloadMs ?? 0, 0, total);
    const u = clamp(1 - left / total, 0, 1);
    const sweetMin = bot.sweetSpot
      ? (bot.sweetSpot[0] > 1 ? bot.sweetSpot[0] / 100 : bot.sweetSpot[0])
      : activeSpec.sweetSpot[0];
    const sweetMax = bot.sweetSpot
      ? (bot.sweetSpot[1] > 1 ? bot.sweetSpot[1] / 100 : bot.sweetSpot[1])
      : activeSpec.sweetSpot[1];
    if (
      u >= Math.max(0.28, sweetMin) &&
      u <= sweetMax &&
      tickNo - brain.lastReloadAttemptTick > 10
    ) {
      brain.lastReloadAttemptTick = tickNo;
      if (nextRand(brain, world.rng) < profile.activeReloadChance) {
        emitCmd({ t: 'reload' });
        return;
      }
    }
  }

  // Slot management: swap to 0-energy slot 0 when energy < 20% (or insufficient energy)
  const slots = bot.slots;
  if (slots && slots.length > 1) {
    const outOfEnergy = energyPct < 0.20 || bot.energy < activeSpec.energyCost;
    if (outOfEnergy && activeSpec.energyCost > 0) {
      let zeroSlot = -1;
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        if (!sl) continue;
        if (getWeaponSpec(sl.id).energyCost === 0) {
          zeroSlot = i;
          if (i === 0) break;
        }
      }
      if (zeroSlot >= 0 && zeroSlot !== active.slotIdx) {
        emitCmd({ t: 'slot', idx: zeroSlot });
        return;
      }
    } else if (
      active.slotIdx === 0 &&
      energyPct >= 0.45 &&
      (!target || target.dist > 85)
    ) {
      // Upgrade back out of starter pistol when energy has recovered
      let bestSlot = -1;
      let bestDmg = activeSpec.damage;
      for (let i = 1; i < slots.length; i++) {
        const sl = slots[i];
        if (!sl) continue;
        const spec = getWeaponSpec(sl.id);
        if (spec.category === 'melee') continue;
        if (bot.energy < spec.energyCost) continue;
        if (sl.maxClip > 0 && sl.clip === 0 && !target) continue;
        if (spec.damage > bestDmg) {
          bestDmg = spec.damage;
          bestSlot = i;
        }
      }
      if (bestSlot > 0) {
        emitCmd({ t: 'slot', idx: bestSlot });
        return;
      }
    }
  }

  // Proactive reload when clip <= 20% and safe (`nearestEnemyDist > 160px`), or empty clip
  if (!isReloading && active.maxClip > 0) {
    const clipPct = active.clip / active.maxClip;
    if (active.clip <= 0 || (clipPct <= 0.20 && nearestEnemyDist > 160)) {
      emitCmd({ t: 'reload' });
    }
  }
}

function maybeTriggerGadget(
  world: BotWorldView,
  bot: BotPlayerView,
  brain: BotBrain,
  tickNo: number,
  emitCmd: (c: BansungCommand) => void,
): void {
  const gadget = bot.gadget;
  if (!gadget || gadget.charges <= 0 || gadget.cdMs > 0) return;
  if (tickNo - brain.lastGadgetTick < 30) return;

  const spec = BANSUNG_GADGETS[gadget.id] ?? getGadgetSpec(gadget.id);
  if (!spec || bot.energy < spec.energyCost) return;

  if (spec.id === 'heal_drone') {
    let injuredAlly = false;
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i];
      if (isPlayerDead(p)) continue;
      const d = Math.hypot(p.x - bot.x, p.y - bot.y);
      if (d > 260) continue;
      if (isPlayerDowned(p) || p.hp / Math.max(1, p.maxHp) < 0.55) {
        injuredAlly = true;
        break;
      }
    }
    if (injuredAlly) {
      brain.lastGadgetTick = tickNo;
      emitCmd({ t: 'gadget', x: bot.x, y: bot.y });
    }
    return;
  }

  if (spec.id === 'auto_turret') {
    let nearby = 0;
    let nearestE: BotEnemyView | null = null;
    let bestD2 = 340 * 340;
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (!e.alive) continue;
      const d2 = (e.x - bot.x) ** 2 + (e.y - bot.y) ** 2;
      if (d2 <= 340 * 340) nearby++;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearestE = e;
      }
    }
    if (nearby >= 3 || (nearestE && isBossEnemy(nearestE))) {
      brain.lastGadgetTick = tickNo;
      const ang = nearestE ? Math.atan2(nearestE.y - bot.y, nearestE.x - bot.x) : brain.aimRad;
      emitCmd({
        t: 'gadget',
        x: bot.x + Math.cos(ang) * 32,
        y: bot.y + Math.sin(ang) * 32,
      });
    }
    return;
  }

  // Thrown offensive gadgets (`stun_bomb` / `cluster_bomb`): >= 3 mobs clustered inside blast radius
  const maxRangeSq = spec.maxRange * spec.maxRange;
  const clusterRSq = spec.radius * spec.radius;
  for (let i = 0; i < world.enemies.length; i++) {
    const center = world.enemies[i];
    if (!center.alive) continue;
    const d2 = (center.x - bot.x) ** 2 + (center.y - bot.y) ** 2;
    if (d2 > maxRangeSq || d2 < spec.minRange * spec.minRange) continue;

    let count = 0;
    for (let j = 0; j < world.enemies.length; j++) {
      const other = world.enemies[j];
      if (!other.alive) continue;
      if ((other.x - center.x) ** 2 + (other.y - center.y) ** 2 <= clusterRSq) {
        count++;
        if (count >= 3) break;
      }
    }
    if (count >= 3) {
      brain.lastGadgetTick = tickNo;
      emitCmd({ t: 'gadget', x: center.x, y: center.y });
      return;
    }
  }
}

function maybePickPerk(
  bot: BotPlayerView,
  brain: BotBrain,
  profile: BotProfile,
  tickNo: number,
  emitCmd: (c: BansungCommand) => void,
): void {
  const choices = bot.perkChoices;
  if (!choices || choices.length === 0) {
    brain.perkOfferTick = -1;
    return;
  }
  if (brain.perkOfferTick < 0) {
    brain.perkOfferTick = tickNo;
  }
  if (tickNo - brain.perkOfferTick < profile.perkDelayTicks) {
    return;
  }

  let bestId = choices[0];
  let bestScore = -1;
  const hpRatio = bot.hp / Math.max(1, bot.maxHp);

  for (let i = 0; i < choices.length; i++) {
    const id = choices[i];
    let score = PERK_PRIORITY_BASE[id] ?? 60;
    if (id === 'vitality_boost' && hpRatio < 0.7) score += 20;
    if (id === 'iron_bastion' && getPlayerMaxShield(bot) <= 6 * BANSUNG_HERO_STAT_SCALE) score += 12;
    if (!BANSUNG_PERKS[id]) score -= 5;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  brain.perkOfferTick = -1;
  emitCmd({ t: 'perk', id: bestId });
}

function maybeUsePedestal(
  world: BotWorldView,
  bot: BotPlayerView,
  brain: BotBrain,
  tickNo: number,
  emitCmd: (c: BansungCommand) => void,
): void {
  if (!world.pickups || tickNo - brain.lastUseTick < 18) return;
  for (let i = 0; i < world.pickups.length; i++) {
    const pk = world.pickups[i];
    if (pk.alive === false || pk.claimed) continue;
    if (pk.kind !== 'weapon' && pk.kind !== 'weapon_pedestal') continue;
    if (!pk.weaponId || !shouldTakePedestalWeapon(bot, pk.weaponId)) continue;
    const dx = pk.x - bot.x;
    const dy = pk.y - bot.y;
    if (dx * dx + dy * dy <= 42 * 42) {
      brain.lastUseTick = tickNo;
      emitCmd({ t: 'use' });
      return;
    }
  }
}

function packInputCommand(
  brain: BotBrain,
  moveX: number,
  moveY: number,
  aimRad: number,
  firing: boolean,
): BansungCommand {
  let sx = Number.isFinite(moveX) ? moveX : 0;
  let sy = Number.isFinite(moveY) ? moveY : 0;
  const len = Math.hypot(sx, sy);
  if (len > 1) {
    sx /= len;
    sy /= len;
  }
  let mx = Math.trunc(clamp(sx, -1, 1) * 100);
  let my = Math.trunc(clamp(sy, -1, 1) * 100);
  if (mx * mx + my * my > 10000) {
    const scale = 100 / Math.hypot(mx, my);
    mx = Math.trunc(mx * scale);
    my = Math.trunc(my * scale);
  }
  brain.seq += 1;
  return {
    t: 'in',
    seq: brain.seq,
    mx,
    my,
    aim: quantizeAim(Number.isFinite(aimRad) ? aimRad : 0),
    fire: firing ? 1 : 0,
  };
}

/**
 * Executes one 30Hz co-op companion AI decision step (`d07`) for `bot`.
 * Pass `emit` to pipe generated `BansungCommand`s through the server's
 * authoritative `applyPlayerInput()` path; otherwise `world.applyPlayerInput`
 * or `world.enqueueCommand` is called if present. Always returns emitted commands.
 */
export function runBansungBot(
  world: BotWorldView,
  bot: BotPlayerView,
  dt = 1 / BANSUNG_TICK_HZ,
  emit?: (cmd: BansungCommand) => void,
): BansungCommand[] {
  const out: BansungCommand[] = [];
  if (!Number.isFinite(bot.x) || !Number.isFinite(bot.y) || !Number.isFinite(dt) || dt <= 0) {
    return out;
  }

  if (!bot.brain) {
    bot.brain = createBotBrain('normal', (bot.idx ?? 0) + 1);
  }
  const brain = bot.brain;
  const profile = BANSUNG_BOT_PROFILES[brain.level] ?? BANSUNG_BOT_PROFILES.normal;
  const tickNo = world.tickNo ?? brain.seq;
  const radius = bot.radius ?? DEFAULT_HERO_RADIUS;

  const dispatch = (cmd: BansungCommand): void => {
    out.push(cmd);
    if (emit) {
      emit(cmd);
    } else if (world.applyPlayerInput) {
      world.applyPlayerInput(bot.id, cmd);
    } else if (world.enqueueCommand) {
      world.enqueueCommand(bot.id, cmd);
    }
  };

  if (isPlayerDead(bot)) {
    brain.state = 'dead';
    brain.moveX = 0;
    brain.moveY = 0;
    brain.firing = false;
    return out;
  }

  // Perk draft choice can still resolve while downed or alive (`d32`)
  maybePickPerk(bot, brain, profile, tickNo, dispatch);

  // Downed crawl behavior: move toward nearest alive teammate, no shooting/dashing/skills
  if (isPlayerDowned(bot)) {
    brain.state = 'downed_crawl';
    brain.firing = false;
    let nearestAlly: BotPlayerView | null = null;
    let bestD2 = Infinity;
    for (let i = 0; i < world.players.length; i++) {
      const p = world.players[i];
      if (p.id === bot.id || !isPlayerAlive(p)) continue;
      const d2 = (p.x - bot.x) ** 2 + (p.y - bot.y) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearestAlly = p;
      }
    }
    if (nearestAlly && bestD2 > 36 * 36) {
      steerWithFiveRays(
        world,
        brain,
        bot.x,
        bot.y,
        radius,
        nearestAlly.x - bot.x,
        nearestAlly.y - bot.y,
        64,
      );
      brain.moveX = steerOut.x;
      brain.moveY = steerOut.y;
      brain.aimRad = Math.atan2(nearestAlly.y - bot.y, nearestAlly.x - bot.x);
    } else {
      brain.moveX = 0;
      brain.moveY = 0;
    }
    if (tickNo - brain.lastPingTick >= 90) {
      brain.lastPingTick = tickNo;
      dispatch({ t: 'ping', kind: BANSUNG_PING_REVIVE, x: Math.round(bot.x), y: Math.round(bot.y) });
    }
    dispatch(packInputCommand(brain, brain.moveX, brain.moveY, brain.aimRad, false));
    return out;
  }

  const isStunned = Boolean(bot.stunned) || (bot.stunMs ?? 0) > 0 || (bot.stunTicks ?? 0) > 0;
  if (isStunned) {
    brain.moveX = 0;
    brain.moveY = 0;
    brain.firing = false;
    dispatch(packInputCommand(brain, 0, 0, brain.aimRad, false));
    return out;
  }

  // Flip strafe polarity every 1.2 - 2.2s (36 - 66 ticks at 30Hz)
  if (tickNo >= brain.strafeFlipAt) {
    brain.strafeDir = brain.strafeDir === 1 ? -1 : 1;
    brain.strafeFlipAt = tickNo + 36 + Math.floor(nextRand(brain, world.rng) * 31);
  }

  const isThinkTick = tickNo >= brain.nextThinkTick;
  if (isThinkTick) {
    brain.nextThinkTick = tickNo + profile.thinkIntervalTicks;
  }

  // 1. Emergency Dash Reflex (`dash`)
  const dashReady = (bot.dashCdMs ?? 0) <= 0 && (bot.dashLeftMs ?? 0) <= 0 && !bot.dashing;
  if (dashReady && tickNo - brain.lastDashTick >= profile.thinkIntervalTicks) {
    const threat = findEmergencyDashThreat(world, bot, profile);
    if (threat) {
      brain.lastDashTick = tickNo;
      if (nextRand(brain, world.rng) < profile.dashReflex) {
        const dashDir = pickSafeDashDirection(
          world,
          bot.x,
          bot.y,
          radius,
          threat.tx,
          threat.ty,
          brain.strafeDir,
        );
        if (dashDir) {
          dispatch({ t: 'dash', dx: dashDir.dx, dy: dashDir.dy });
        }
      }
    }
  }

  // Track nearest enemy distance for reload / loot safety checks
  let nearestEnemy: BotEnemyView | null = null;
  let nearestEnemyDist = Infinity;
  for (let i = 0; i < world.enemies.length; i++) {
    const e = world.enemies[i];
    if (!e.alive) continue;
    const d = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (d < nearestEnemyDist) {
      nearestEnemyDist = d;
      nearestEnemy = e;
    }
  }

  const activeSlot = getBotActiveSlot(bot);
  const weaponSpec = getWeaponSpec(activeSlot.weaponId);
  const idealRange = BOT_IDEAL_RANGE_BY_WEAPON[activeSlot.weaponId] ?? 280;

  // 2. Think-interval target & mode selection (Rescue / Loot / Kite / Regroup / Combat)
  let rescueTarget: BotPlayerView | null = null;
  if (isThinkTick || brain.state === 'rescue') {
    rescueTarget = selectBestDownedAlly(world, bot, profile);
    if (rescueTarget) {
      brain.state = 'rescue';
      brain.rescueTargetId = rescueTarget.id;
    } else {
      brain.rescueTargetId = null;
      if (brain.state === 'rescue') {
        brain.state = 'combat';
      }
    }
  }

  let target: TargetCandidate | null = null;
  if (isThinkTick || brain.targetId === null) {
    const searchRange = brain.state === 'rescue' ? 420 : Math.max(420, weaponSpec.range);
    target = selectCombatTarget(world, bot, searchRange);
    brain.targetId = target ? target.id : null;
  } else {
    // Refresh cached target kinematics at 30Hz between think intervals
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (e.alive && e.id === brain.targetId) {
        const dist = Math.hypot(e.x - bot.x, e.y - bot.y);
        target = {
          kind: 'enemy',
          id: e.id,
          x: e.x,
          y: e.y,
          vx: e.vx ?? 0,
          vy: e.vy ?? 0,
          dist,
          score: 1,
          hasLos: hasWorldLos(world, bot.x, bot.y, e.x, e.y, 'bullet'),
        };
        break;
      }
    }
    if (!target) {
      target = selectCombatTarget(
        world,
        bot,
        brain.state === 'rescue' ? 420 : Math.max(420, weaponSpec.range),
      );
      brain.targetId = target ? target.id : null;
    }
  }

  // 3. Steering Computation
  let desX = 0;
  let desY = 0;

  if (brain.state === 'rescue' && rescueTarget) {
    const toAllyX = rescueTarget.x - bot.x;
    const toAllyY = rescueTarget.y - bot.y;
    const allyDist = Math.hypot(toAllyX, toAllyY);

    if (allyDist > 52) {
      desX = toAllyX / Math.max(1, allyDist);
      desY = toAllyY / Math.max(1, allyDist);
    } else {
      // Fight-inside-ring: orbit within 40..62px around downed ally without leaving 72px circle
      const ux = allyDist > 1e-4 ? toAllyX / allyDist : 1;
      const uy = allyDist > 1e-4 ? toAllyY / allyDist : 0;
      const radialPull = (allyDist - 48) / 14;
      const tangX = -uy * brain.strafeDir;
      const tangY = ux * brain.strafeDir;
      desX = tangX + ux * radialPull;
      desY = tangY + uy * radialPull;
    }
  } else {
    const lootTarget = isThinkTick ? findNeededPickup(world, bot) : null;
    if (lootTarget) {
      brain.state = 'loot';
      const dx = lootTarget.x - bot.x;
      const dy = lootTarget.y - bot.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        desX = dx / d;
        desY = dy / d;
      }
    } else {
      // Kiting repulsion from enemies inside minSafeDist
      let repX = 0;
      let repY = 0;
      let kiting = false;
      for (let i = 0; i < world.enemies.length; i++) {
        const e = world.enemies[i];
        if (!e.alive) continue;
        const safeDist = getMinSafeDist(e);
        const rx = bot.x - e.x;
        const ry = bot.y - e.y;
        const d = Math.hypot(rx, ry);
        if (d < safeDist) {
          kiting = true;
          const weight = ((safeDist - d) / safeDist) ** 2;
          const inv = d > 1e-4 ? 1 / d : 1;
          repX += (rx * inv) * weight * 2.2;
          repY += (ry * inv) * weight * 2.2;
        }
      }

      // Soft ally spacing separation so 4-bot squads spread naturally instead of stacking
      for (let i = 0; i < world.players.length; i++) {
        const ally = world.players[i];
        if (!ally || ally.id === bot.id || !isPlayerAlive(ally)) continue;
        const ax = bot.x - ally.x;
        const ay = bot.y - ally.y;
        const ad = Math.hypot(ax, ay);
        if (ad < 76) {
          const w = ((76 - ad) / 76) * 1.15;
          const inv = ad > 1e-4 ? 1 / ad : 1;
          repX += ax * inv * w;
          repY += ay * inv * w;
        }
      }

      // Cover bias when shield == 0 or targeted by laser sniper telegraph
      const shield = getPlayerShield(bot);
      const sniperThreat = findThreatForCover(world, bot);
      if ((shield <= 0 && nearestEnemy) || sniperThreat) {
        const threatPos = sniperThreat ?? nearestEnemy!;
        const cover = findCoverPosition(world, bot, threatPos.x, threatPos.y);
        if (cover) {
          const cx = cover.x - bot.x;
          const cy = cover.y - bot.y;
          const cd = Math.hypot(cx, cy);
          if (cd > 16) {
            repX += (cx / cd) * 1.35;
            repY += (cy / cd) * 1.35;
            kiting = true;
          }
        }
      }

      if (target) {
        brain.state = kiting ? 'kite' : 'combat';
        const dx = target.x - bot.x;
        const dy = target.y - bot.y;
        const d = Math.max(1, target.dist);
        const ux = dx / d;
        const uy = dy / d;
        const tangX = -uy * brain.strafeDir;
        const tangY = ux * brain.strafeDir;

        let rangeForce = 0;
        if (d > idealRange + 40) {
          rangeForce = 1.0;
        } else if (d < idealRange - 45) {
          rangeForce = -0.85;
        }
        desX = repX + ux * rangeForce + tangX * 0.85;
        desY = repY + uy * rangeForce + tangY * 0.85;
      } else {
        // Regroup to 200px of closest alive human if > 420px away while idle
        const human = findClosestAliveHuman(world, bot);
        if (human && human.dist > 420) {
          brain.state = 'regroup';
          const dx = human.player.x - bot.x;
          const dy = human.player.y - bot.y;
          desX = repX + dx / human.dist;
          desY = repY + dy / human.dist;
        } else {
          brain.state = kiting ? 'kite' : 'combat';
          desX = repX;
          desY = repY;
        }
      }
    }
  }

  // 4. 5-Ray AABB Wall Avoidance + Rescue Ring Tether Guard
  if (tickNo <= brain.unstuckUntil) {
    brain.moveX = Math.cos(brain.unstuckAngle);
    brain.moveY = Math.sin(brain.unstuckAngle);
  } else {
    const rayRes = steerWithFiveRays(world, brain, bot.x, bot.y, radius, desX, desY, 84);
    brain.moveX = steerOut.x;
    brain.moveY = steerOut.y;
    if (rayRes.centerBlocked) {
      brain.strafeDir = brain.strafeDir === 1 ? -1 : 1;
    }
  }

  // Keep fight-inside-ring inside 72px circle around downed ally (`<= 62px`)
  if (brain.state === 'rescue' && rescueTarget) {
    const curD = Math.hypot(bot.x - rescueTarget.x, bot.y - rescueTarget.y);
    if (curD <= BANSUNG_REVIVE_RADIUS) {
      const stepPx = 220 * dt;
      const nx = bot.x + brain.moveX * stepPx;
      const ny = bot.y + brain.moveY * stepPx;
      const nextD = Math.hypot(nx - rescueTarget.x, ny - rescueTarget.y);
      if (nextD > 62) {
        const ix = rescueTarget.x - bot.x;
        const iy = rescueTarget.y - bot.y;
        const il = Math.hypot(ix, iy);
        if (il > 1e-4) {
          brain.moveX = ix / il;
          brain.moveY = iy / il;
        }
      }
    }
  }

  // 5. Anti-Stuck Detector (`moved < 10px` over `0.8s` = 24 ticks -> 8-ray widest ray `0.5s`)
  const wantsMove = Math.hypot(brain.moveX, brain.moveY) > 0.25;
  if (!wantsMove) {
    brain.stuckPos.x = bot.x;
    brain.stuckPos.y = bot.y;
    brain.stuckAt = tickNo;
  } else if (tickNo > brain.unstuckUntil && tickNo - brain.stuckAt >= 24) {
    const moved = Math.hypot(bot.x - brain.stuckPos.x, bot.y - brain.stuckPos.y);
    brain.stuckPos.x = bot.x;
    brain.stuckPos.y = bot.y;
    brain.stuckAt = tickNo;
    if (moved < 10) {
      let bestAngle = 0;
      let bestClear = -1;
      for (let i = 0; i < EIGHT_RAY_ANGLES_RAD.length; i++) {
        const ang = EIGHT_RAY_ANGLES_RAD[i];
        const hit = castSegmentClearance(
          world,
          bot.x,
          bot.y,
          bot.x + Math.cos(ang) * 120,
          bot.y + Math.sin(ang) * 120,
          radius,
          'move',
        );
        if (hit.t > bestClear) {
          bestClear = hit.t;
          bestAngle = ang;
        }
      }
      brain.unstuckAngle = bestAngle;
      brain.unstuckUntil = tickNo + 15; // 0.5s at 30Hz
      brain.strafeDir = brain.strafeDir === 1 ? -1 : 1;
      brain.moveX = Math.cos(bestAngle);
      brain.moveY = Math.sin(bestAngle);
      if (dashReady && bestClear >= 0.55) {
        brain.lastDashTick = tickNo;
        dispatch({ t: 'dash', dx: brain.moveX, dy: brain.moveY });
      }
    }
  }

  // 6. Targeting Lead, Gaussian Aim Jitter & Fire Control
  if (target) {
    const projSpeed =
      'projSpeed' in weaponSpec && weaponSpec.projSpeed > 0 ? weaponSpec.projSpeed : 0;
    const leadTime =
      projSpeed > 0 ? clamp(target.dist / projSpeed, 0, 0.85) * profile.velocityLead : 0;
    const aimX = target.x + target.vx * leadTime;
    const aimY = target.y + target.vy * leadTime;

    if (isThinkTick) {
      brain.lastJitterRad = sampleBellJitter(brain, profile.aimJitterRad, world.rng);
    }
    brain.aimRad = Math.atan2(aimY - bot.y, aimX - bot.x) + brain.lastJitterRad;

    const isLobWeapon =
      weaponSpec.id === 'grenade_launcher' || weaponSpec.id === 'stun_launcher';
    const inFireRange =
      target.dist <= (brain.state === 'rescue' ? 420 : weaponSpec.range + 40);
    const isReloading = Boolean(bot.reloading) || (bot.reloadMs ?? 0) > 0;
    const hasEnergy = bot.energy >= weaponSpec.energyCost;
    const hasAmmo = activeSlot.maxClip === 0 || activeSlot.clip > 0;
    brain.firing =
      inFireRange &&
      !isReloading &&
      hasEnergy &&
      hasAmmo &&
      (target.hasLos || isLobWeapon || target.dist < 64);
  } else {
    brain.firing = false;
    if (wantsMove) {
      brain.aimRad = Math.atan2(brain.moveY, brain.moveX);
    }
  }

  // 7. Ammo/Weapon Slot, Reload, Gadget (`Q`), Pedestal Interact (`E`)
  maybeManageWeaponAndReload(
    world,
    bot,
    brain,
    profile,
    tickNo,
    nearestEnemyDist,
    target,
    dispatch,
  );
  maybeTriggerGadget(world, bot, brain, tickNo, dispatch);
  if ((bot.skillCdMs ?? 9999) <= 0 && !bot.downed && target && nearestEnemyDist < 520) {
    dispatch({ t: 'skill', x: Math.round(target.x), y: Math.round(target.y) });
  }
  maybeUsePedestal(world, bot, brain, tickNo, dispatch);

  dispatch(packInputCommand(brain, brain.moveX, brain.moveY, brain.aimRad, brain.firing));
  return out;
}

// ============================================================================
// 6. Server 30Hz Pet Companion Simulation (d25, heroes.ts)
// ============================================================================

/** Creates a server-side pet companion runtime struct anchored at `(x, y)`. */
export function createPetState(
  x: number,
  y: number,
  kind: BansungPetKind = 'tiger',
): BansungPetState {
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    state: 0,
    stateTimer: 0,
    pounceCd: 0,
    fireCd: 0,
    left: false,
    targetId: null,
    hitDone: false,
  };
}

/** Quantizes a pet's state into the 4-tuple transmitted inside `BansungFrame`. */
export function serializePetTuple(pet: BansungPetState): BansungPetNetTuple {
  return [Math.round(pet.x), Math.round(pet.y), pet.state, pet.left ? 1 : 0];
}

function isPickupNeededByOwner(owner: BotPlayerView, kind: PickupKind | BansungPickupKind): boolean {
  if (kind === 'weapon' || kind === 'weapon_pedestal') return false;
  if (kind === 'coin' || kind === 'gem_coin') return true;
  if (kind === 'xp' || kind === 'xp_orb_s' || kind === 'xp_orb_m' || kind === 'xp_orb_l') return true;
  if (kind === 'hp' || kind === 'hp_orb' || kind === 'hp_pack') {
    return owner.hp < owner.maxHp;
  }
  if (kind === 'energy' || kind === 'energy_orb' || kind === 'energy_cell') {
    return owner.energy < owner.maxEnergy;
  }
  if (kind === 'armor' || kind === 'armor_plate') {
    const maxSh = getPlayerMaxShield(owner);
    return maxSh > 0 && getPlayerShield(owner) < maxSh;
  }
  return false;
}

/**
 * Pulls eligible pickups (`hp`, `energy`, `armor`, `coin`; never weapon pedestals)
 * within `MAGNET_RADIUS = 140px` toward living `owner` at `MAGNET_PULL = 280 px/s`.
 * Returns the nearest magnetized pickup coordinates (for spring target bias) or `null`.
 */
export function runPetMagnet(
  owner: BotPlayerView,
  pickups: readonly BotPickupView[],
  dt: number,
  capturedOut?: PetPickupCaptureEvent[],
  onCapture?: (event: PetPickupCaptureEvent) => void,
): { x: number; y: number } | null {
  if (!isPlayerAlive(owner) || pickups.length === 0 || dt <= 0) return null;

  const magnetR = BANSUNG_PET_TUNING.MAGNET_RADIUS;
  const magnetRSq = magnetR * magnetR;
  const pullStep = BANSUNG_PET_TUNING.MAGNET_PULL * dt;
  const captureR = DEFAULT_PICKUP_CAPTURE_R;

  let nearestPt: { x: number; y: number } | null = null;
  let nearestD2 = Infinity;

  for (let i = 0; i < pickups.length; i++) {
    const pk = pickups[i];
    if (pk.alive === false || pk.claimed) continue;
    if ((pk.spawnLockTicks ?? 0) > 0) continue;
    if (!isPickupNeededByOwner(owner, pk.kind)) continue;

    const dx = owner.x - pk.x;
    const dy = owner.y - pk.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > magnetRSq) continue;

    const d = Math.sqrt(d2);
    if (d <= captureR) {
      const evt: PetPickupCaptureEvent = {
        ownerId: owner.id,
        pickupId: pk.id,
        kind: pk.kind,
        x: pk.x,
        y: pk.y,
      };
      if (onCapture) {
        onCapture(evt);
      } else {
        pk.x = owner.x;
        pk.y = owner.y;
      }
      capturedOut?.push(evt);
      continue;
    }

    const step = Math.min(d, pullStep);
    pk.x += (dx / d) * step;
    pk.y += (dy / d) * step;

    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearestPt = { x: pk.x, y: pk.y };
    }
  }

  return nearestPt;
}

function findEnemyById(
  enemies: readonly BotEnemyView[],
  id: number | string | null,
): BotEnemyView | null {
  if (id === null) return null;
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].id === id && enemies[i].alive) return enemies[i];
  }
  return null;
}

function applyPetPounceImpact(
  world: BotWorldView,
  owner: BotPlayerView,
  pet: BansungPetState,
  target: BotEnemyView,
  result: PetStepResult,
  callbacks?: PetStepCallbacks,
): void {
  pet.hitDone = true;
  const dx = target.x - pet.x;
  const dy = target.y - pet.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-4 ? dx / d : pet.left ? -1 : 1;
  const uy = d > 1e-4 ? dy / d : 0;
  const kbMult = 1 - clamp(target.kbResist ?? 0, 0, 1);

  const evt: PetPounceHitEvent = {
    ownerId: owner.id,
    targetId: target.id,
    x: target.x,
    y: target.y,
    damage: BANSUNG_PET_TUNING.POUNCE_DMG,
    dmgKind: 'kinetic',
    knockVx: ux * BANSUNG_PET_TUNING.POUNCE_KNOCK * kbMult,
    knockVy: uy * BANSUNG_PET_TUNING.POUNCE_KNOCK * kbMult,
    fxKind: 'bite_spark',
  };
  result.pounceHits.push(evt);

  const handler = callbacks?.onPounceHit ?? world.onPetPounceHit;
  if (handler) {
    handler(evt);
    return;
  }

  // Fallback direct damage + knockback when running standalone without world callback
  if (typeof target.hp === 'number') {
    if (target.tier && target.armorType) {
      const combatTarget: BansungCombatTarget = {
        id: target.id,
        x: target.x,
        y: target.y,
        tier: target.tier,
        armorType: target.armorType,
        flatArmor: target.flatArmor ?? 0,
        alive: target.alive,
        hp: target.hp,
        maxHp: target.maxHp ?? target.hp,
        shield: target.shield ?? 0,
        maxShield: target.maxShield ?? 0,
      };
      applyBansungDamage(
        combatTarget,
        {
          baseDmg: BANSUNG_PET_TUNING.POUNCE_DMG,
          dmgKind: 'kinetic',
          attackerId: owner.id,
        },
        { fx: world.fx, rng: world.rng },
      );
      target.hp = combatTarget.hp;
      target.alive = combatTarget.alive;
      if (target.shield !== undefined) target.shield = combatTarget.shield;
    } else {
      target.hp = Math.max(0, target.hp - BANSUNG_PET_TUNING.POUNCE_DMG);
      if (target.hp <= 0) target.alive = false;
    }
  }
  if (target.vx !== undefined && target.vy !== undefined) {
    target.vx += evt.knockVx;
    target.vy += evt.knockVy;
  }
}

/**
 * Evaluates pet pounce (`<= 115px`) and mini-fire ember (`85..195px` w/ clear LOS)
 * support attacks when `owner` is alive and pet is within `LEASH_MAX = 220px`.
 */
export function tryPetSupportAttack(
  world: BotWorldView,
  owner: BotPlayerView,
  pet: BansungPetState,
  result: PetStepResult,
  callbacks?: PetStepCallbacks,
): boolean {
  if (!isPlayerAlive(owner) || pet.state === 2 || pet.state === 3) return false;

  const leashSq = BANSUNG_PET_TUNING.LEASH_MAX * BANSUNG_PET_TUNING.LEASH_MAX;
  if ((pet.x - owner.x) ** 2 + (pet.y - owner.y) ** 2 > leashSq) return false;

  // Priority 1: Pounce (`POUNCE_RANGE = 115px` of pet, `LEASH_MAX = 220px` of owner)
  if (pet.pounceCd <= 0) {
    const pounceRSq = BANSUNG_PET_TUNING.POUNCE_RANGE * BANSUNG_PET_TUNING.POUNCE_RANGE;
    let best: BotEnemyView | null = null;
    let bestD2 = pounceRSq;
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (!e.alive) continue;
      if ((e.x - owner.x) ** 2 + (e.y - owner.y) ** 2 > leashSq) continue;
      const d2 = (e.x - pet.x) ** 2 + (e.y - pet.y) ** 2;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = e;
      }
    }
    if (best) {
      pet.state = 2;
      pet.stateTimer = BANSUNG_PET_TUNING.POUNCE_DUR;
      pet.pounceCd = BANSUNG_PET_TUNING.POUNCE_CD;
      pet.targetId = best.id;
      pet.hitDone = false;
      const dx = best.x - pet.x;
      const dy = best.y - pet.y;
      const d = Math.hypot(dx, dy);
      const ux = d > 1e-4 ? dx / d : pet.left ? -1 : 1;
      const uy = d > 1e-4 ? dy / d : 0;
      pet.vx = ux * BANSUNG_PET_TUNING.POUNCE_SPEED;
      pet.vy = uy * BANSUNG_PET_TUNING.POUNCE_SPEED;
      pet.left = ux < 0;
      return true;
    }
  }

  // Priority 2: Mini Fire (`85..195px` of owner with clear bullet LOS)
  if (pet.fireCd <= 0) {
    const minRSq = BANSUNG_PET_TUNING.FIRE_MIN_RANGE * BANSUNG_PET_TUNING.FIRE_MIN_RANGE;
    const maxRSq = BANSUNG_PET_TUNING.FIRE_RANGE * BANSUNG_PET_TUNING.FIRE_RANGE;
    let best: BotEnemyView | null = null;
    let bestD2 = Infinity;

    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (!e.alive) continue;
      const ownerD2 = (e.x - owner.x) ** 2 + (e.y - owner.y) ** 2;
      if (ownerD2 < minRSq || ownerD2 > maxRSq) continue;
      if (!hasWorldLos(world, pet.x, pet.y, e.x, e.y, 'bullet')) continue;
      const petD2 = (e.x - pet.x) ** 2 + (e.y - pet.y) ** 2;
      if (petD2 < bestD2) {
        bestD2 = petD2;
        best = e;
      }
    }

    if (best) {
      pet.state = 3;
      pet.stateTimer = BANSUNG_PET_TUNING.FIRE_DUR;
      pet.fireCd = BANSUNG_PET_TUNING.FIRE_CD;
      pet.targetId = best.id;
      pet.hitDone = false;
      const dx = best.x - pet.x;
      const dy = best.y - pet.y;
      const aimRad = Math.atan2(dy, dx);
      pet.left = dx < 0;

      const emberEvt: PetEmberSpawnEvent = {
        ownerId: owner.id,
        targetId: best.id,
        projKind: 'pet_ember',
        x: pet.x,
        y: pet.y,
        vx: Math.cos(aimRad) * BANSUNG_PET_TUNING.FIRE_SPEED,
        vy: Math.sin(aimRad) * BANSUNG_PET_TUNING.FIRE_SPEED,
        aimRad,
        radius: BANSUNG_PET_TUNING.FIRE_RADIUS,
        damage: BANSUNG_PET_TUNING.FIRE_DMG,
        ttlS: BANSUNG_PET_TUNING.FIRE_TTL,
        burnChance: BANSUNG_PET_TUNING.FIRE_BURN_CHANCE,
        burnDurS: BANSUNG_PET_TUNING.FIRE_BURN_DUR,
        burnDps: BANSUNG_PET_TUNING.FIRE_BURN_DPS,
      };
      result.spawnedEmbers.push(emberEvt);
      const handler = callbacks?.onSpawnEmber ?? world.onPetSpawnEmber;
      handler?.(emberEvt);
      return true;
    }
  }

  return false;
}

/**
 * Advances one pet companion over `dt` seconds (`d25` semi-implicit Euler
 * spring-damper follow, downed owner override, pickup magnet, pounce & mini-fire).
 */
export function stepPet(
  world: BotWorldView,
  owner: BotPlayerView,
  pet: BansungPetState,
  dt = 1 / BANSUNG_TICK_HZ,
  callbacks?: PetStepCallbacks,
  outResult?: PetStepResult,
): PetStepResult {
  const result: PetStepResult = outResult ?? {
    pounceHits: [],
    spawnedEmbers: [],
    capturedPickups: [],
  };
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(owner.x) || !Number.isFinite(owner.y)) {
    return result;
  }

  const bounds = getPlayableBounds(world);

  if (isPlayerDead(owner)) {
    pet.vx = 0;
    pet.vy = 0;
    pet.state = 0;
    pet.stateTimer = 0;
    pet.targetId = null;
    return result;
  }

  pet.pounceCd = Math.max(0, pet.pounceCd - dt);
  pet.fireCd = Math.max(0, pet.fireCd - dt);

  const ownerDowned = isPlayerDowned(owner);
  const facingCos = owner.aimCos ?? Math.cos(owner.aimRad ?? 0);
  const facingX = facingCos >= 0 ? 1 : -1;
  const anchorX = ownerDowned ? owner.x + 22 : owner.x - facingX * BANSUNG_PET_TUNING.FOLLOW_X;
  const anchorY = ownerDowned ? owner.y + 10 : owner.y + BANSUNG_PET_TUNING.FOLLOW_Y;

  // Hard snap if owner dashed/teleported beyond TELEPORT_DIST (360px)
  const ownerDist = Math.hypot(pet.x - owner.x, pet.y - owner.y);
  if (ownerDist > BANSUNG_PET_TUNING.TELEPORT_DIST) {
    pet.x = clamp(anchorX, bounds.x0, bounds.x1);
    pet.y = clamp(anchorY, bounds.y0, bounds.y1);
    pet.vx = 0;
    pet.vy = 0;
    pet.state = 0;
    pet.stateTimer = 0;
    pet.targetId = null;
    pet.hitDone = false;
    return result;
  }

  // Downed owner override: skip magnet/attacks, spring to owner bedside & force idle
  if (ownerDowned) {
    if (pet.state === 2 || pet.state === 3) {
      pet.state = 0;
      pet.stateTimer = 0;
      pet.targetId = null;
      pet.hitDone = false;
    }
    integratePetSpring(pet, anchorX, anchorY, dt, bounds);
    const speed = Math.hypot(pet.vx, pet.vy);
    pet.state = speed < 20 ? 0 : 1;
    return result;
  }

  // Pickup magnet (`140px` around living owner)
  const nearestPickup = world.pickups
    ? runPetMagnet(
        owner,
        world.pickups,
        dt,
        result.capturedPickups,
        callbacks?.onPickupCapture ?? world.onPetPickupCapture,
      )
    : null;

  // Try starting pounce or mini-fire if idle/trotting
  if (pet.state === 0 || pet.state === 1) {
    tryPetSupportAttack(world, owner, pet, result, callbacks);
  }

  if (pet.state === 2) {
    // Active pounce
    pet.stateTimer -= dt;
    const elapsed = BANSUNG_PET_TUNING.POUNCE_DUR - pet.stateTimer;
    const target = findEnemyById(world.enemies, pet.targetId);

    if (
      target &&
      elapsed < BANSUNG_PET_TUNING.POUNCE_STEER_DUR &&
      (target.x - owner.x) ** 2 + (target.y - owner.y) ** 2 <=
        BANSUNG_PET_TUNING.LEASH_MAX * BANSUNG_PET_TUNING.LEASH_MAX
    ) {
      const dx = target.x - pet.x;
      const dy = target.y - pet.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        pet.vx = (dx / d) * BANSUNG_PET_TUNING.POUNCE_SPEED;
        pet.vy = (dy / d) * BANSUNG_PET_TUNING.POUNCE_SPEED;
        pet.left = pet.vx < 0;
      }
    } else {
      const damp = Math.exp(-8 * dt);
      pet.vx *= damp;
      pet.vy *= damp;
    }

    pet.x = clamp(pet.x + pet.vx * dt, bounds.x0, bounds.x1);
    pet.y = clamp(pet.y + pet.vy * dt, bounds.y0, bounds.y1);

    if (target && !pet.hitDone) {
      const hitRadius =
        BANSUNG_PET_TUNING.POUNCE_HIT_RADIUS + Math.max(0, (target.radius ?? 12) - 12);
      const d = Math.hypot(target.x - pet.x, target.y - pet.y);
      if (d <= hitRadius) {
        applyPetPounceImpact(world, owner, pet, target, result, callbacks);
      }
    }

    if (pet.stateTimer <= 0) {
      pet.state = 0;
      pet.stateTimer = 0;
      pet.targetId = null;
      pet.hitDone = false;
    }
    return result;
  }

  if (pet.state === 3) {
    // Mini-fire cast pause
    pet.stateTimer -= dt;
    const damp = Math.exp(-10 * dt);
    pet.vx *= damp;
    pet.vy *= damp;
    pet.x = clamp(pet.x + pet.vx * dt, bounds.x0, bounds.x1);
    pet.y = clamp(pet.y + pet.vy * dt, bounds.y0, bounds.y1);
    if (pet.stateTimer <= 0) {
      pet.state = 0;
      pet.stateTimer = 0;
      pet.targetId = null;
    }
    return result;
  }

  // Spring-damper follow (biased toward nearest magnetized pickup if active)
  const targetX = nearestPickup ? anchorX + (nearestPickup.x - anchorX) * 0.35 : anchorX;
  const targetY = nearestPickup ? anchorY + (nearestPickup.y - anchorY) * 0.35 : anchorY;
  integratePetSpring(pet, targetX, targetY, dt, bounds);

  const speed = Math.hypot(pet.vx, pet.vy);
  pet.state = speed >= 20 ? 1 : 0;
  return result;
}

function integratePetSpring(
  pet: BansungPetState,
  targetX: number,
  targetY: number,
  dt: number,
  bounds: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
): void {
  const ax = (targetX - pet.x) * BANSUNG_PET_TUNING.SPRING_K - pet.vx * BANSUNG_PET_TUNING.DAMPING;
  const ay = (targetY - pet.y) * BANSUNG_PET_TUNING.SPRING_K - pet.vy * BANSUNG_PET_TUNING.DAMPING;
  let vx = pet.vx + ax * dt;
  let vy = pet.vy + ay * dt;

  const speed = Math.hypot(vx, vy);
  if (speed > BANSUNG_PET_TUNING.MAX_SPEED && speed > 1e-6) {
    const scale = BANSUNG_PET_TUNING.MAX_SPEED / speed;
    vx *= scale;
    vy *= scale;
  }

  pet.vx = vx;
  pet.vy = vy;
  pet.x = clamp(pet.x + vx * dt, bounds.x0, bounds.x1);
  pet.y = clamp(pet.y + vy * dt, bounds.y0, bounds.y1);

  if (Math.abs(vx) > 14) {
    pet.left = vx < 0;
  }
}

/**
 * Steps all human player pets in `world.players` (`d25`). AI bots omit pets
 * by default (`!p.bot`) to limit visual clutter.
 */
export function stepPets(
  world: BotWorldView,
  dt = 1 / BANSUNG_TICK_HZ,
  callbacks?: PetStepCallbacks,
): PetStepResult {
  const result: PetStepResult = {
    pounceHits: [],
    spawnedEmbers: [],
    capturedPickups: [],
  };
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    if (p.bot || !p.pet) continue;
    stepPet(world, p, p.pet, dt, callbacks, result);
  }
  return result;
}
