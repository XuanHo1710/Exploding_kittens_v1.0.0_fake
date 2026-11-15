/**
 * Authoritative 30Hz weapon firing, burst queue, shared blue Energy checks,
 * magazine + [0.48, 0.64] active-reload empower/jam, pooled swept projectiles,
 * melee sweeping-arc bullet-deflect, and piercing/homing/explosive/mine shell
 * stepping for `bansung` (specs d26, d27, d28, d29, d31).
 */
import {
  BANSUNG_ACTIVE_EMPOWER_DMG_MULT,
  BANSUNG_ACTIVE_ENERGY_BONUS,
  BANSUNG_BFLAG_CRIT,
  BANSUNG_BFLAG_ENERGY,
  BANSUNG_BFLAG_EXPLOSIVE,
  BANSUNG_BFLAG_FROM_ENEMY,
  BANSUNG_BFLAG_HOMING,
  BANSUNG_BFLAG_PIERCE,
  BANSUNG_DRY_FIRE_COOLDOWN_TICKS,
  BANSUNG_ENERGY_REGEN_DELAY_TICKS,
  BANSUNG_ENERGY_REGEN_PER_S,
  BANSUNG_EXPLOSIVE_COOP_RULES,
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_MINE,
  BANSUNG_FX_BLAST_ORBITAL,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_IMPACT_FLESH,
  BANSUNG_FX_IMPACT_SLASH,
  BANSUNG_FX_IMPACT_SLICE,
  BANSUNG_FX_IMPACT_SPARK,
  BANSUNG_FX_IMPACT_WALL,
  BANSUNG_HEROES,
  BANSUNG_MELEE_SWEEP_CONSTANTS,
  BANSUNG_PFLAG_FIRING,
  BANSUNG_PFLAG_RELOADING,
  BANSUNG_PROJECTILE_CONFIGS,
  BANSUNG_QUICK_HANDS_RELOAD_MULT,
  BANSUNG_QUICK_HANDS_SWEET_SPOT,
  BANSUNG_RELOAD_JAM_PENALTY_MULT,
  BANSUNG_RELOAD_LOCKOUT_U,
  BANSUNG_RELOAD_STATE_ACTIVE,
  BANSUNG_RELOAD_STATE_JAMMED,
  BANSUNG_RELOAD_SWEET_MAX,
  BANSUNG_RELOAD_SWEET_MIN,
  BANSUNG_REVIVE_ENERGY_FLOOR,
  BANSUNG_STATUS_RELOAD_PERFECT,
  BANSUNG_STATUS_RELOAD_START,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BANSUNG_WAVE_ENERGY_RESTORE,
  BANSUNG_WEAPON_MAX_TIER,
  BANSUNG_WEAPONS,
  FX_BEAM,
  FX_BLAST,
  FX_IMPACT,
  FX_MUZZLE,
  FX_STATUS,
  computeBlastFalloff,
  getBansungHero,
  getWeaponEvolutionStats,
  getWeaponSpec,
  normalizeWeaponTier,
  quantizeAim,
  ticksToMs,
  wrapPi,
  type AggregatedPerkMods,
  type ArenaObstacle,
  type BansungAmmoPrivate,
  type BansungEnergyWeaponSpec,
  type BansungExplosiveWeaponSpec,
  type BansungHeroId,
  type BansungKineticWeaponSpec,
  type BansungMeleeWeaponSpec,
  type BansungProjectileConfig,
  type BansungProjectileKind,
  type BansungReloadRuntime,
  type BansungWeaponEvolutionStats,
  type BansungWeaponId,
  type BansungWeaponRuntime as SharedBansungWeaponRuntime,
  type BansungWeaponSlot,
  type BansungWeaponSpec,
  type BansungWeaponTier,
} from '../../../../shared/src';
import {
  applyBansungDamage,
  applyDot,
  applyStunWithDR,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageKind,
  type BansungDamageResult,
  type BansungDmgEvent,
  type BansungDotKind,
} from './damage';
import {
  ActorGrid,
  LAYER_ENEMY,
  LAYER_PET,
  LAYER_PLAYER,
  ObstacleGrid,
  checkMuzzleWallGuard,
  hasLineOfSight,
  moveCircleWithSlide,
  queryAoeObstacles,
  queryAoeTargets,
  raycastObstacles,
  stepSweptBullet,
  sweepSegmentActors,
  type AoeObstacleTarget,
  type AoeTarget,
  type CircleBody,
  type RayActorHit,
  type SpatialActor,
  type SweepBulletResult,
  type SweptBulletInput,
} from './spatial';

// ============================================================================
// 1. Constants & Wire FX Sub-Kind Codes
// ============================================================================

export const BANSUNG_WEAPON_TICK_DT_S = 1 / BANSUNG_TICK_HZ;
export const BANSUNG_WEAPON_TICK_DT_MS = BANSUNG_TICK_EXACT_MS;
export const BANSUNG_MAX_WEAPON_SLOTS = 5;
export const BANSUNG_SWAP_LOCK_TICKS = Math.max(1, Math.round(150 / BANSUNG_TICK_EXACT_MS));
export const BANSUNG_DEFAULT_BULLET_CAP = 256;

export const BANSUNG_BLAST_KINDS = {
  frag: BANSUNG_FX_BLAST_HE,
  stun: BANSUNG_FX_BLAST_STUN,
  rocket: BANSUNG_FX_BLAST_CLUSTER,
  mine: BANSUNG_FX_BLAST_MINE,
  fireball: BANSUNG_FX_BLAST_FIREBALL,
} as const;

export const BANSUNG_IMPACT_KINDS = {
  wall: BANSUNG_FX_IMPACT_WALL,
  flesh: BANSUNG_FX_IMPACT_FLESH,
  slash: BANSUNG_FX_IMPACT_SLASH,
  slice: BANSUNG_FX_IMPACT_SLICE,
  spark: BANSUNG_FX_IMPACT_SPARK,
} as const;

export const BANSUNG_BEAM_KINDS = {
  rail: BANSUNG_FX_BEAM_RAIL,
  chain: BANSUNG_FX_BEAM_CHAIN,
  shock: BANSUNG_FX_BEAM_SHOCK,
  laser_map: BANSUNG_FX_BEAM_LASER_MAP,
} as const;

const DEG_TO_RAD = Math.PI / 180;
const RAILGUN_MIN_HOLD_TICKS = Math.max(
  1,
  Math.round(
    (BANSUNG_WEAPONS.railgun as BansungEnergyWeaponSpec).charge!.minHoldMs /
      BANSUNG_TICK_EXACT_MS,
  ),
);
const RAILGUN_FULL_HOLD_TICKS = Math.max(
  RAILGUN_MIN_HOLD_TICKS + 1,
  Math.round(
    (BANSUNG_WEAPONS.railgun as BansungEnergyWeaponSpec).charge!.fullHoldMs /
      BANSUNG_TICK_EXACT_MS,
  ),
);
const ROCKET_MULTIHIT_WINDOW_TICKS = Math.max(
  1,
  Math.round(BANSUNG_EXPLOSIVE_COOP_RULES.rocketMultiHitWindowMs / BANSUNG_TICK_EXACT_MS),
);

// ============================================================================
// 2. Zero-GC Scratch Buffers & Pure Helpers
// ============================================================================

const tmpMeleeActors: SpatialActor[] = [];
const tmpMeleeObs: ArenaObstacle[] = [];
const tmpAoeTargets: AoeTarget[] = [];
const tmpAoeObstacles: AoeObstacleTarget[] = [];
const tmpRayActors: RayActorHit[] = [];
const tmpHomingActors: SpatialActor[] = [];
const tmpChainActors: SpatialActor[] = [];
const tmpMineActors: SpatialActor[] = [];
const tmpSweepResult: SweepBulletResult = {
  endX: 0,
  endY: 0,
  stopped: false,
  stoppedBy: 'none',
  actorHits: [],
  obstacleHits: [],
  bouncesUsed: 0,
};
const tmpBulletInput: SweptBulletInput = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  radius: 4,
  team: 0,
  layerMask: LAYER_ENEMY | LAYER_PET,
  maxHits: 1,
  bouncesLeft: 0,
};

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function msToTicksCeil(ms: number): number {
  if (ms <= 0) return 0;
  return Math.max(1, Math.round(ms / BANSUNG_TICK_EXACT_MS));
}

function getWeaponDmgKind(spec: BansungWeaponSpec): BansungDamageKind {
  if (spec.category === 'kinetic') return 'kinetic';
  if (spec.category === 'explosive') return 'explosive';
  if (spec.category === 'melee') return 'melee';
  if (spec.id === 'railgun') return 'pierce';
  if (spec.id === 'arcane_book' || spec.id === 'flamethrower') return 'fire';
  return 'energy';
}

function getProjectileBlastKind(kind: BansungProjectileKind): number {
  if (kind === 'stun_canister' || kind === 'stun_bomb_proj') return BANSUNG_BLAST_KINDS.stun;
  if (kind === 'rocket') return BANSUNG_BLAST_KINDS.rocket;
  if (kind === 'orbital_shell') return BANSUNG_FX_BLAST_ORBITAL;
  if (kind === 'prox_mine') return BANSUNG_BLAST_KINDS.mine;
  if (kind === 'arcane_fireball') return BANSUNG_BLAST_KINDS.fireball;
  return BANSUNG_BLAST_KINDS.frag;
}

// ============================================================================
// 3. Runtime Types & World Context Contracts
// ============================================================================

export interface BansungBurstQueueState {
  slot: number;
  weaponId: BansungWeaponId;
  remaining: number;
  waitTicks: number;
  shotIndex: number;
  empowered: boolean;
}

export interface BansungChargeState {
  slot: number;
  weaponId: BansungWeaponId;
  holdTicks: number;
}

export interface BansungWeaponRuntime extends SharedBansungWeaponRuntime {
  tier: BansungWeaponTier;
}

export interface BansungHeroGachaMods {
  dmgMult?: number;
  fireRateMult?: number;
  extraMultishot?: number;
  critChanceAdd?: number;
  critDmgMult?: number;
  extraPierce?: number;
  blastRadiusMult?: number;
  reloadSpeedMul?: number;
  energyCostMult?: number;
}

export interface BansungActiveMeleeSwing {
  slot: number;
  weaponId: BansungWeaponId;
  startTick: number;
  activeTicks: number;
  recoveryTicks: number;
  dir: 1 | -1;
  startAng: number;
  endAng: number;
  aimRad: number;
  reach: number;
  evoDmgMult: number;
  charged: boolean;
  empowered: boolean;
  lunged: boolean;
  hitActorIds: Set<number>;
  hitObstacleIds: Set<number>;
  bulletEnergy: number;
}

export interface BansungHeroWeaponState {
  id: string;
  idx: number;
  actorId: number;
  team: number;
  heroId: BansungHeroId;
  x: number;
  y: number;
  radius: number;
  aimRad: number;
  alive: boolean;
  downed: boolean;
  stunned: boolean;
  dashing: boolean;
  energy: number;
  energyFrac: number;
  maxEnergy: number;
  lastEnergySpendTick: number;
  lastDryFireTick: number;
  slots: (BansungWeaponRuntime | null)[];
  slotCdTicks: number[];
  activeSlot: number;
  swapLockTicks: number;
  reload: BansungReloadRuntime | null;
  burst: BansungBurstQueueState | null;
  charge: BansungChargeState | null;
  bloomDeg: number;
  swingCombo: number;
  activeSwing: BansungActiveMeleeSwing | null;
  mods?: Partial<AggregatedPerkMods>;
  gachaMods?: BansungHeroGachaMods;
  hasQuickHands?: boolean;
}

export interface BansungProjectile {
  id: number;
  alive: boolean;
  kind: BansungProjectileKind;
  kindId: number;
  trajectory: BansungProjectileConfig['trajectory'];
  team: number;
  ownerId: string;
  ownerIdx: number;
  weaponId?: BansungWeaponId;
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  accel: number;
  maxSpeed: number;
  gravityZ: number;
  radius: number;
  traveledPx: number;
  maxRange: number;
  ttlTicks: number;
  ageTicks: number;
  bouncesLeft: number;
  restitution: number;
  pierceLeft: number;
  hitIds: Set<number>;
  destructibleByMelee: boolean;
  contactDetonate: boolean;
  dmgKind: BansungDamageKind;
  baseDmg: number;
  affinity?: readonly [number, number];
  armorPen: number;
  armorPiercePct: number;
  critChance: number;
  critMult: number;
  dmgMult: number;
  knockback: number;
  stunMs: number;
  dotKind?: BansungDotKind;
  dotTickDmgOverride?: number;
  dotDurMs?: number;
  critBurn?: { dps: number; durationMs: number };
  slowPct: number;
  slowMs: number;
  slowSplashRadius: number;
  pullRadius: number;
  pullImpulse: number;
  falloff?: { startPx: number; minMult: number };
  empowered: boolean;
  isFromEnemy: boolean;
  isEnergy: boolean;
  isExplosive: boolean;
  isHoming: boolean;
  blastRadius: number;
  coreRadius: number;
  outerFalloffMin: number;
  stunFalloffMin: number;
  shrapnelCount: number;
  shrapnelDamage: number;
  shrapnelSpeed: number;
  shrapnelTtlTicks: number;
  chainMaxHops: number;
  chainRadius: number;
  chainDmgDecay: number;
  chainHopStunMs: number;
  splitEmberCount: number;
  splitEmberDmg: readonly [number, number];
  splitEmberSpeed: number;
  splitEmberRange: number;
  burnDps: number;
  burnMs: number;
  homingTurnRateRadPerS: number;
  homingConeCos: number;
  homingDetectRange: number;
  mineState: 0 | 1 | 2;
  mineArmTicksLeft: number;
  mineTriggerRadius: number;
  mineDetonateTicksLeft: number;
  /** Scales blast damage (e.g. 0.5 for evicted oldest mine). */
  blastDmgScale: number;
}

export interface BansungSpawnProjectileParams {
  kind: BansungProjectileKind;
  team: number;
  ownerId: string;
  ownerIdx: number;
  x: number;
  y: number;
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  weaponId?: BansungWeaponId;
  radius?: number;
  maxRange?: number;
  ttlTicks?: number;
  bouncesLeft?: number;
  pierceLeft?: number;
  destructibleByMelee?: boolean;
  dmgKind?: BansungDamageKind;
  baseDmg?: number;
  affinity?: readonly [number, number];
  armorPen?: number;
  armorPiercePct?: number;
  critChance?: number;
  critMult?: number;
  dmgMult?: number;
  knockback?: number;
  stunMs?: number;
  dotKind?: BansungDotKind;
  dotTickDmgOverride?: number;
  dotDurMs?: number;
  critBurn?: { dps: number; durationMs: number };
  slowPct?: number;
  slowMs?: number;
  slowSplashRadius?: number;
  pullRadius?: number;
  pullImpulse?: number;
  falloff?: { startPx: number; minMult: number };
  empowered?: boolean;
  isFromEnemy?: boolean;
  isEnergy?: boolean;
  isExplosive?: boolean;
  isHoming?: boolean;
  blastRadius?: number;
  coreRadius?: number;
  outerFalloffMin?: number;
  stunFalloffMin?: number;
  shrapnelCount?: number;
  shrapnelDamage?: number;
  shrapnelSpeed?: number;
  shrapnelTtlTicks?: number;
  chainMaxHops?: number;
  chainRadius?: number;
  chainDmgDecay?: number;
  chainHopStunMs?: number;
  splitEmberCount?: number;
  splitEmberDmg?: readonly [number, number];
  splitEmberSpeed?: number;
  splitEmberRange?: number;
  burnDps?: number;
  burnMs?: number;
  homingTurnRateRadPerS?: number;
  homingConeCos?: number;
  homingDetectRange?: number;
  mineArmTicksLeft?: number;
  mineTriggerRadius?: number;
  mineDetonateTicksLeft?: number;
  blastDmgScale?: number;
}

export interface BansungHeroInputState {
  fireHeld: boolean;
  moving?: boolean;
  /** Optional cursor distance from hero center (px) for lobbed explosives. */
  aimDistPx?: number;
}

export interface BansungWeaponWorldContext {
  tickNo: number;
  obsGrid: ObstacleGrid;
  actorGrid: ActorGrid;
  bullets: BansungBulletPool;
  rng?: () => number;
  /** Flat 6-int wire FX buffer (`BANSUNG_FX_FIELDS = 6`). */
  fx?: number[];
  /** Optional quantized damage popup sink. */
  popups?: BansungDmgEvent[];
  /** Resolves `SpatialActor.id` to mutable `BansungCombatTarget`. */
  resolveTarget?: (actorId: number) => BansungCombatTarget | undefined;
  /** Applies knockback velocity `(kvx, kvy)` in px/s to an actor. */
  applyKnockback?: (actorId: number, kvx: number, kvy: number, isSelfPush?: boolean) => void;
  /** Applies recoil push `(rvx, rvy)` in px/s to firing hero. */
  applyRecoilPush?: (heroId: string, rvx: number, rvy: number) => void;
  /** Delegates obstacle destruction to map runtime (crate drops, barrel chains). */
  damageObstacle?: (
    obstacleId: number,
    damage: number,
    attackerId?: string,
    dmgKind?: BansungDamageKind,
  ) => void;
  onDamageDealt?: (
    attackerId: string,
    target: BansungCombatTarget,
    result: BansungDamageResult,
    isBlast?: boolean,
  ) => void;
  onEnemyStunned?: (attackerId: string, target: BansungCombatTarget, stunAppliedMs: number) => void;
  onActorKilled?: (attackerId: string, target: BansungCombatTarget) => void;
  onDryFire?: (hero: BansungHeroWeaponState, reason: 'energy' | 'ammo') => void;
  grantEnergy?: (heroId: string, amount: number) => number;
  /** Defer melee active sweep to step 6 after spatial grid rebuild (`world.ts`). */
  deferMeleeSweep?: boolean;
}

export interface BansungHeroWeaponTickResult {
  fired: boolean;
  reloadState: 'idle' | 'reloading' | 'jammed' | 'completed';
  dryFired: boolean;
  bulletsDestroyed: number;
  meleeHits: number;
}

export interface BansungProjectileStepResult {
  activeAfter: number;
  actorHits: number;
  obstacleHits: number;
  blasts: number;
  expired: number;
}

export type BansungReloadAttemptResult =
  | 'started'
  | 'perfect'
  | 'jammed'
  | 'locked_out'
  | 'ignored';

// ============================================================================
// 4. Target Resolution, Obstacle Damage & Knockback Helpers
// ============================================================================

function isCombatTargetShape(actor: SpatialActor): actor is SpatialActor & BansungCombatTarget {
  const candidate = actor as unknown as Partial<BansungCombatTarget>;
  return (
    typeof candidate.hp === 'number' &&
    typeof candidate.maxHp === 'number' &&
    typeof candidate.armorType === 'string' &&
    typeof candidate.tier === 'string'
  );
}

function resolveActorTarget(
  actor: SpatialActor,
  ctx: BansungWeaponWorldContext,
): BansungCombatTarget | undefined {
  const resolved = ctx.resolveTarget?.(actor.id);
  if (resolved) return resolved;
  if (isCombatTargetShape(actor)) return actor;
  return undefined;
}

function damageObstacleDefault(
  obs: ArenaObstacle,
  damage: number,
  ctx: BansungWeaponWorldContext,
  attackerId?: string,
  dmgKind: BansungDamageKind = 'kinetic',
): void {
  if (!obs.alive || !obs.destructible || damage <= 0) return;
  if (ctx.damageObstacle) {
    ctx.damageObstacle(obs.id, damage, attackerId, dmgKind);
    return;
  }
  obs.hp = Math.max(0, obs.hp - Math.round(damage));
  if (obs.hp <= 0) {
    obs.alive = false;
  }
}

function applyRadialKnockback(
  actor: SpatialActor,
  fromX: number,
  fromY: number,
  speedPx: number,
  ctx: BansungWeaponWorldContext,
  isSelfPush = false,
): void {
  if (speedPx <= 0 || !ctx.applyKnockback) return;
  const dx = actor.x - fromX;
  const dy = actor.y - fromY;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return;
  ctx.applyKnockback(actor.id, (dx / len) * speedPx, (dy / len) * speedPx, isSelfPush);
}

function buildDamageContext(ctx: BansungWeaponWorldContext): BansungDamageContext {
  return {
    rng: ctx.rng,
    fx: ctx.fx,
    popups: ctx.popups,
  };
}

function applyCombatHitAndEvents(
  target: BansungCombatTarget,
  attackerId: string,
  hit: Parameters<typeof applyBansungDamage>[1],
  ctx: BansungWeaponWorldContext,
  dmgCtx: BansungDamageContext,
  isBlast = false,
): BansungDamageResult {
  const res = applyBansungDamage(target, hit, dmgCtx);
  if (!res.blocked && res.totalDmg > 0) {
    ctx.onDamageDealt?.(attackerId, target, res, isBlast);
  }
  if (res.stunAppliedMs > 0) {
    ctx.onEnemyStunned?.(attackerId, target, res.stunAppliedMs);
  }
  if (res.killed) {
    ctx.onActorKilled?.(attackerId, target);
  }
  return res;
}

// ============================================================================
// 5. Hero Weapon, Magazine, Energy & Active Reload State Machine (d31)
// ============================================================================

export function createHeroWeaponState(opts: {
  id: string;
  idx: number;
  actorId: number;
  heroId?: BansungHeroId;
  x?: number;
  y?: number;
  aimRad?: number;
  team?: number;
  weapons?: readonly (BansungWeaponId | null)[];
  mods?: Partial<AggregatedPerkMods>;
  gachaMods?: BansungHeroGachaMods;
  hasQuickHands?: boolean;
}): BansungHeroWeaponState {
  const heroSpec = getBansungHero(opts.heroId ?? 'mascot');
  const maxEnergy = heroSpec.energy + (opts.mods?.maxEnergyAdd ?? 0);
  const initialWeapons: readonly (BansungWeaponId | null)[] = opts.weapons ?? [
    heroSpec.sidearmWeapon,
    heroSpec.starterWeapon,
    null,
    null,
    'crescent_blade',
  ];

  const slots: (BansungWeaponRuntime | null)[] = new Array(BANSUNG_MAX_WEAPON_SLOTS).fill(null);
  const slotCdTicks: number[] = new Array(BANSUNG_MAX_WEAPON_SLOTS).fill(0);

  for (let i = 0; i < BANSUNG_MAX_WEAPON_SLOTS; i++) {
    const wId = initialWeapons[i];
    if (!wId) continue;
    const spec = getWeaponSpec(wId);
    slots[i] = {
      weaponId: spec.id,
      ammoInMag: spec.magSize > 0 ? spec.magSize : -1,
      empowered: false,
      tier: 1,
    };
  }

  let activeSlot = 0;
  if (!slots[0]) {
    for (let i = 0; i < BANSUNG_MAX_WEAPON_SLOTS; i++) {
      if (slots[i]) {
        activeSlot = i;
        break;
      }
    }
  } else if (slots[1]) {
    activeSlot = 1;
  }

  return {
    id: opts.id,
    idx: opts.idx,
    actorId: opts.actorId,
    team: opts.team ?? 0,
    heroId: heroSpec.id,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    radius: heroSpec.radius,
    aimRad: opts.aimRad ?? 0,
    alive: true,
    downed: false,
    stunned: false,
    dashing: false,
    energy: maxEnergy,
    energyFrac: 0,
    maxEnergy,
    lastEnergySpendTick: -BANSUNG_ENERGY_REGEN_DELAY_TICKS,
    lastDryFireTick: -BANSUNG_DRY_FIRE_COOLDOWN_TICKS,
    slots,
    slotCdTicks,
    activeSlot,
    swapLockTicks: 0,
    reload: null,
    burst: null,
    charge: null,
    bloomDeg: 0,
    swingCombo: 0,
    activeSwing: null,
    mods: opts.mods,
    gachaMods: opts.gachaMods,
    hasQuickHands: opts.hasQuickHands,
  };
}

/** Equips `weaponId` into `slotIdx` with a full non-empowered Tier 1 magazine. */
export function equipWeaponInSlot(
  hero: BansungHeroWeaponState,
  slotIdx: number,
  weaponId: BansungWeaponId,
): BansungWeaponRuntime | null {
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= BANSUNG_MAX_WEAPON_SLOTS) {
    return null;
  }
  const spec = getWeaponSpec(weaponId);
  if (hero.reload && hero.reload.slot === slotIdx) hero.reload = null;
  if (hero.burst && hero.burst.slot === slotIdx) hero.burst = null;
  if (hero.charge && hero.charge.slot === slotIdx) hero.charge = null;
  if (hero.activeSwing && hero.activeSwing.slot === slotIdx) hero.activeSwing = null;

  const runtime: BansungWeaponRuntime = {
    weaponId: spec.id,
    ammoInMag: spec.magSize > 0 ? spec.magSize : -1,
    empowered: false,
    tier: 1,
  };
  hero.slots[slotIdx] = runtime;
  hero.slotCdTicks[slotIdx] = 0;
  return runtime;
}

/** Returns the active slot's weapon evolution tier (`1..4`). */
export function getHeroActiveWeaponTier(hero: BansungHeroWeaponState): BansungWeaponTier {
  const slot = hero.slots[hero.activeSlot];
  return slot ? normalizeWeaponTier(slot.tier) : 1;
}

/** Upgrades a slot's weapon evolution tier by +1 up to `BANSUNG_WEAPON_MAX_TIER` (4). */
export function upgradeHeroWeaponTier(
  hero: BansungHeroWeaponState,
  slotIdx: number,
): { ok: boolean; weaponId: BansungWeaponId; fromTier: number; toTier: number } {
  if (!Number.isInteger(slotIdx) || slotIdx < 0 || slotIdx >= BANSUNG_MAX_WEAPON_SLOTS) {
    return { ok: false, weaponId: 'pistol', fromTier: 1, toTier: 1 };
  }
  const slot = hero.slots[slotIdx];
  if (!slot) {
    return { ok: false, weaponId: 'pistol', fromTier: 1, toTier: 1 };
  }
  const fromTier = normalizeWeaponTier(slot.tier);
  if (fromTier >= BANSUNG_WEAPON_MAX_TIER) {
    return { ok: false, weaponId: slot.weaponId, fromTier, toTier: fromTier };
  }
  const toTier = normalizeWeaponTier(fromTier + 1);
  slot.tier = toTier;
  return { ok: true, weaponId: slot.weaponId, fromTier, toTier };
}

/** Cancels active charge/burst/swing when stunned, downed, or interrupted. */
export function cancelHeroWeaponActions(hero: BansungHeroWeaponState): void {
  hero.charge = null;
  hero.burst = null;
  hero.activeSwing = null;
}

/**
 * Switches hotbar slot (`0..4`), cleanly cancelling in-flight reload/charge/burst
 * and applying the anti-swap-cancel firing lockout (`BANSUNG_SWAP_LOCK_TICKS`).
 */
export function switchHeroWeaponSlot(hero: BansungHeroWeaponState, newSlot: number): boolean {
  if (!hero.alive || hero.downed || hero.stunned) return false;
  if (!Number.isInteger(newSlot) || newSlot < 0 || newSlot >= BANSUNG_MAX_WEAPON_SLOTS) {
    return false;
  }
  if (newSlot === hero.activeSlot || !hero.slots[newSlot]) return false;
  if (hero.activeSwing) return false;

  hero.reload = null;
  hero.burst = null;
  hero.charge = null;
  hero.bloomDeg = 0;
  hero.activeSlot = newSlot;
  hero.swapLockTicks = BANSUNG_SWAP_LOCK_TICKS;
  return true;
}

/** Grants `amount` blue Energy clamped to `hero.maxEnergy`. Returns delta added. */
export function grantHeroEnergy(hero: BansungHeroWeaponState, amount: number): number {
  if (!hero.alive || amount <= 0 || !Number.isFinite(amount)) return 0;
  const before = hero.energy;
  hero.energy = Math.min(hero.maxEnergy, Math.round(before + amount));
  return hero.energy - before;
}

/** Restores +25% maxEnergy on wave clear (d31). */
export function restoreWaveEnergy(hero: BansungHeroWeaponState): number {
  return grantHeroEnergy(hero, Math.round(hero.maxEnergy * BANSUNG_WAVE_ENERGY_RESTORE));
}

/** Ensures a revived hero has at least 40% maxEnergy (d31). */
export function applyReviveEnergyFloor(hero: BansungHeroWeaponState): number {
  const floor = Math.ceil(hero.maxEnergy * BANSUNG_REVIVE_ENERGY_FLOOR);
  if (hero.energy >= floor) return 0;
  return grantHeroEnergy(hero, floor - hero.energy);
}

/** Advances passive 2.0/s Energy regen after 1.2s spend delay (d31). */
export function tickHeroEnergyRegen(hero: BansungHeroWeaponState, tickNo: number): number {
  if (!hero.alive || hero.downed || hero.energy >= hero.maxEnergy) {
    hero.energyFrac = 0;
    return 0;
  }
  if (tickNo - hero.lastEnergySpendTick < BANSUNG_ENERGY_REGEN_DELAY_TICKS) {
    return 0;
  }
  hero.energyFrac += BANSUNG_ENERGY_REGEN_PER_S / BANSUNG_TICK_HZ;
  if (hero.energyFrac + 1e-9 < 1) return 0;
  const whole = Math.floor(hero.energyFrac + 1e-9);
  hero.energyFrac = Math.max(0, hero.energyFrac - whole);
  return grantHeroEnergy(hero, whole);
}

function getEffectiveReloadParams(
  hero: BansungHeroWeaponState,
  spec: BansungWeaponSpec,
): { durationTicks: number; sweetMinU: number; sweetMaxU: number } {
  const perkReloadMul = hero.mods?.reloadSpeedMul ?? 1;
  const gachaReloadMul = Math.max(0.5, hero.gachaMods?.reloadSpeedMul ?? 1);
  const reloadMul = perkReloadMul * gachaReloadMul;
  const quickHands = Boolean(hero.hasQuickHands || perkReloadMul > 1);
  let durationTicks = spec.reloadTicks;
  if (reloadMul > 1) {
    durationTicks = Math.round(spec.reloadTicks / reloadMul);
  } else if (quickHands) {
    durationTicks = Math.round(spec.reloadTicks * BANSUNG_QUICK_HANDS_RELOAD_MULT);
  }
  durationTicks = Math.max(1, durationTicks);

  const sweetMinU = quickHands ? BANSUNG_QUICK_HANDS_SWEET_SPOT[0] : BANSUNG_RELOAD_SWEET_MIN;
  const sweetMaxU = quickHands ? BANSUNG_QUICK_HANDS_SWEET_SPOT[1] : BANSUNG_RELOAD_SWEET_MAX;
  return { durationTicks, sweetMinU, sweetMaxU };
}

function getEffectiveEnergyCost(
  hero: BansungHeroWeaponState,
  baseCost: number,
  evoEnergyCostMult = 1,
): number {
  if (baseCost <= 0) return 0;
  const modMul = hero.mods?.energyCostMul ?? 1;
  const gachaMul = hero.gachaMods?.energyCostMult ?? 1;
  const costMul = Math.max(0.4, modMul * gachaMul);
  if (evoEnergyCostMult === 1) {
    return Math.max(1, Math.ceil(baseCost * costMul));
  }
  return Math.max(1, Math.round(baseCost * evoEnergyCostMult * costMul));
}

function getEffectiveCooldownTicks(
  hero: BansungHeroWeaponState,
  baseTicks: number,
  evoFireRateMult = 1,
): number {
  const perkRate = Math.max(0.5, hero.mods?.fireRateMul ?? 1);
  const gachaRate = Math.max(0.25, hero.gachaMods?.fireRateMult ?? 1);
  const fireRateMul = Math.max(0.5, perkRate * evoFireRateMult * gachaRate);
  return Math.max(1, Math.round(baseTicks / fireRateMul));
}

/** Starts a reload on `slotIdx` if eligible, clearing previous empowered clip state. */
export function startHeroReload(
  hero: BansungHeroWeaponState,
  slotIdx = hero.activeSlot,
  _tickNo = 0,
  fx?: number[],
): boolean {
  if (!hero.alive || hero.downed || hero.stunned || hero.reload) return false;
  const slot = hero.slots[slotIdx];
  if (!slot) return false;
  const spec = getWeaponSpec(slot.weaponId);
  if (spec.reloadTicks <= 0 || spec.magSize <= 0 || slot.ammoInMag >= spec.magSize) return false;

  hero.burst = null;
  hero.charge = null;
  slot.empowered = false;

  const { durationTicks, sweetMinU, sweetMaxU } = getEffectiveReloadParams(hero, spec);
  hero.reload = {
    slot: slotIdx,
    progressTicks: 0,
    durationTicks,
    jamTicksLeft: 0,
    attempted: false,
    sweetMinU,
    sweetMaxU,
  };

  if (fx) {
    fx.push(
      FX_STATUS,
      hero.idx,
      BANSUNG_STATUS_RELOAD_START,
      slotIdx,
      Math.round(hero.x),
      Math.round(hero.y),
    );
  }
  return true;
}

/**
 * Handles `{ t: 'reload' }`: starts reload when idle, or evaluates the `[0.48, 0.64]`
 * active-reload sweet-spot (empower +15% dmg / +12 Energy, or +45% jam penalty).
 */
export function handleHeroReloadCmd(
  hero: BansungHeroWeaponState,
  tickNo = 0,
  fx?: number[],
): BansungReloadAttemptResult {
  if (!hero.alive || hero.downed || hero.stunned) return 'ignored';

  if (!hero.reload) {
    return startHeroReload(hero, hero.activeSlot, tickNo, fx) ? 'started' : 'ignored';
  }

  const rel = hero.reload;
  if (rel.attempted) return 'ignored';

  const u = rel.progressTicks / Math.max(1, rel.durationTicks);
  if (u < BANSUNG_RELOAD_LOCKOUT_U) {
    return 'locked_out';
  }

  const slot = hero.slots[rel.slot];
  if (!slot) {
    hero.reload = null;
    return 'ignored';
  }

  if (u >= rel.sweetMinU && u <= rel.sweetMaxU) {
    const spec = getWeaponSpec(slot.weaponId);
    slot.ammoInMag = spec.magSize;
    slot.empowered = true;
    grantHeroEnergy(hero, BANSUNG_ACTIVE_ENERGY_BONUS);
    hero.reload = null;
    if (fx) {
      fx.push(
        FX_STATUS,
        hero.idx,
        BANSUNG_STATUS_RELOAD_PERFECT,
        rel.slot,
        Math.round(hero.x),
        Math.round(hero.y),
      );
    }
    return 'perfect';
  }

  rel.attempted = true;
  rel.jamTicksLeft = Math.max(1, Math.round(rel.durationTicks * BANSUNG_RELOAD_JAM_PENALTY_MULT));
  return 'jammed';
}

/** Advances hero reload progress or jam freeze by one 30Hz tick (dash-safe, paused on stun/downed). */
export function tickHeroReload(
  hero: BansungHeroWeaponState,
  _fx?: number[],
): 'idle' | 'reloading' | 'jammed' | 'completed' {
  const rel = hero.reload;
  if (!rel) return 'idle';
  if (!hero.alive || hero.downed || hero.stunned) {
    return rel.jamTicksLeft > 0 ? 'jammed' : 'reloading';
  }

  if (rel.jamTicksLeft > 0) {
    rel.jamTicksLeft -= 1;
    return 'jammed';
  }

  rel.progressTicks += 1;
  if (rel.progressTicks >= rel.durationTicks) {
    const slot = hero.slots[rel.slot];
    if (slot) {
      const spec = getWeaponSpec(slot.weaponId);
      slot.ammoInMag = spec.magSize;
      slot.empowered = false;
    }
    hero.reload = null;
    return 'completed';
  }

  return 'reloading';
}

/** Returns movement speed multiplier while holding a Railgun charge (`0.78` per d28). */
export function getHeroWeaponMoveMult(hero: BansungHeroWeaponState): number {
  if (!hero.charge) return 1;
  const spec = getWeaponSpec(hero.charge.weaponId);
  return spec.category === 'energy' && spec.charge ? spec.charge.moveMult : 1;
}

/** Returns weapon-related player bitflags (`BANSUNG_PFLAG_FIRING | BANSUNG_PFLAG_RELOADING`). */
export function getHeroPlayerFlags(hero: BansungHeroWeaponState): number {
  if (!hero.alive || hero.downed) {
    return 0;
  }
  let flags = 0;
  if (hero.burst || hero.charge || hero.activeSwing) {
    flags |= BANSUNG_PFLAG_FIRING;
  }
  if (hero.reload) {
    flags |= BANSUNG_PFLAG_RELOADING;
  }
  return flags;
}

/** Builds compact `BansungAmmoPrivate` HUD/sync payload (d31). */
export function buildAmmoPrivateSnapshot(hero: BansungHeroWeaponState): BansungAmmoPrivate {
  const mags: number[] = new Array(BANSUNG_MAX_WEAPON_SLOTS);
  const maxMags: number[] = new Array(BANSUNG_MAX_WEAPON_SLOTS);
  let empMask = 0;

  for (let i = 0; i < BANSUNG_MAX_WEAPON_SLOTS; i++) {
    const slot = hero.slots[i];
    if (!slot) {
      mags[i] = -1;
      maxMags[i] = 0;
      continue;
    }
    const spec = getWeaponSpec(slot.weaponId);
    mags[i] = spec.magSize > 0 ? slot.ammoInMag : -1;
    maxMags[i] = spec.magSize;
    if (slot.empowered) {
      empMask |= 1 << i;
    }
  }

  const out: BansungAmmoPrivate = {
    en: Math.max(0, Math.floor(hero.energy)),
    maxEn: hero.maxEnergy,
    slot: hero.activeSlot,
    mags,
    maxMags,
    empMask,
  };

  if (hero.reload) {
    const pct = clamp(
      Math.round((hero.reload.progressTicks / Math.max(1, hero.reload.durationTicks)) * 100),
      0,
      100,
    );
    const sweetMinPct = Math.round(hero.reload.sweetMinU * 100);
    const sweetMaxPct = Math.round(hero.reload.sweetMaxU * 100);
    const stateFlag =
      hero.reload.jamTicksLeft > 0 ? BANSUNG_RELOAD_STATE_JAMMED : BANSUNG_RELOAD_STATE_ACTIVE;
    out.rel = [pct, sweetMinPct, sweetMaxPct, stateFlag];
  }

  return out;
}

/** Builds `BansungPrivate.slots` array preserving sparse 5-slot indices `[0..4]` for snapshot emission. */
export function buildWeaponSlotsSnapshot(
  hero: BansungHeroWeaponState,
): (BansungWeaponSlot | null)[] {
  const out: (BansungWeaponSlot | null)[] = new Array(BANSUNG_MAX_WEAPON_SLOTS).fill(null);
  const limit = Math.min(BANSUNG_MAX_WEAPON_SLOTS, hero.slots.length);
  for (let i = 0; i < limit; i++) {
    const s = hero.slots[i];
    if (!s) continue;
    const spec = getWeaponSpec(s.weaponId);
    const tier = normalizeWeaponTier(s.tier);
    const evo = getWeaponEvolutionStats(s.weaponId, tier);
    out[i] = {
      id: s.weaponId,
      clip: spec.magSize > 0 ? s.ammoInMag : -1,
      maxClip: spec.magSize,
      tier,
      evolvedName: evo.vnName,
    };
  }
  return out;
}

// ============================================================================
// 6. Pooled 30Hz Projectile Container (BansungBulletPool)
// ============================================================================

function createEmptyProjectile(): BansungProjectile {
  return {
    id: 0,
    alive: false,
    kind: 'kinetic_sm',
    kindId: 0,
    trajectory: 'linear',
    team: 0,
    ownerId: '',
    ownerIdx: -1,
    weaponId: undefined,
    x: 0,
    y: 0,
    z: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    accel: 0,
    maxSpeed: 0,
    gravityZ: 0,
    radius: 4,
    traveledPx: 0,
    maxRange: 0,
    ttlTicks: 0,
    ageTicks: 0,
    bouncesLeft: 0,
    restitution: 0,
    pierceLeft: 1,
    hitIds: new Set<number>(),
    destructibleByMelee: true,
    contactDetonate: true,
    dmgKind: 'kinetic',
    baseDmg: 0,
    affinity: undefined,
    armorPen: 0,
    armorPiercePct: 0,
    critChance: 0,
    critMult: 1.5,
    dmgMult: 1,
    knockback: 0,
    stunMs: 0,
    dotKind: undefined,
    dotTickDmgOverride: undefined,
    dotDurMs: undefined,
    critBurn: undefined,
    slowPct: 0,
    slowMs: 0,
    slowSplashRadius: 0,
    pullRadius: 0,
    pullImpulse: 0,
    falloff: undefined,
    empowered: false,
    isFromEnemy: false,
    isEnergy: false,
    isExplosive: false,
    isHoming: false,
    blastRadius: 0,
    coreRadius: 0,
    outerFalloffMin: 1,
    stunFalloffMin: 1,
    shrapnelCount: 0,
    shrapnelDamage: 0,
    shrapnelSpeed: 0,
    shrapnelTtlTicks: 0,
    chainMaxHops: 0,
    chainRadius: 0,
    chainDmgDecay: 0,
    chainHopStunMs: 0,
    splitEmberCount: 0,
    splitEmberDmg: [0, 0],
    splitEmberSpeed: 0,
    splitEmberRange: 0,
    burnDps: 0,
    burnMs: 0,
    homingTurnRateRadPerS: 0,
    homingConeCos: 1,
    homingDetectRange: 0,
    mineState: 0,
    mineArmTicksLeft: 0,
    mineTriggerRadius: 0,
    mineDetonateTicksLeft: 0,
    blastDmgScale: 1,
  };
}

/**
 * Zero-churn fixed-capacity projectile pool supporting linear, piercing,
 * homing, bouncing, rocket, lobbed shell, and proximity mine projectiles.
 */
export class BansungBulletPool {
  readonly capacity: number;
  readonly slots: BansungProjectile[];
  private readonly freeStack: number[];
  readonly active: BansungProjectile[] = [];
  private nextId = 1;
  readonly recentRocketHits = new Map<number, { tick: number; count: number }>();

  constructor(capacity = BANSUNG_DEFAULT_BULLET_CAP) {
    this.capacity = Math.max(32, capacity);
    this.slots = new Array(this.capacity);
    this.freeStack = new Array(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = createEmptyProjectile();
      this.freeStack[i] = this.capacity - 1 - i;
    }
  }

  get count(): number {
    return this.active.length;
  }

  clear(): void {
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      b.alive = false;
      b.hitIds.clear();
    }
    this.active.length = 0;
    this.freeStack.length = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.freeStack.push(this.capacity - 1 - i);
    }
    this.recentRocketHits.clear();
  }

  countMinesForOwner(ownerId: string): number {
    let n = 0;
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (b.alive && b.kind === 'prox_mine' && b.ownerId === ownerId) n++;
    }
    return n;
  }

  countTotalMines(): number {
    let n = 0;
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (b.alive && b.kind === 'prox_mine') n++;
    }
    return n;
  }

  findOldestMine(ownerId?: string): BansungProjectile | undefined {
    let oldest: BansungProjectile | undefined;
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (!b.alive || b.kind !== 'prox_mine') continue;
      if (ownerId !== undefined && b.ownerId !== ownerId) continue;
      if (!oldest || b.id < oldest.id) oldest = b;
    }
    return oldest;
  }

  spawn(params: BansungSpawnProjectileParams): BansungProjectile | null {
    let slotIdx = this.freeStack.pop();
    if (slotIdx === undefined) {
      // Reclaim oldest non-mine projectile if pool is saturated
      let evictPos = -1;
      for (let i = 0; i < this.active.length; i++) {
        if (this.active[i].kind !== 'prox_mine') {
          evictPos = i;
          break;
        }
      }
      if (evictPos === -1) return null;
      const evicted = this.active[evictPos];
      evicted.alive = false;
      evicted.hitIds.clear();
      const last = this.active.pop()!;
      if (evictPos < this.active.length) {
        this.active[evictPos] = last;
      }
      slotIdx = this.slots.indexOf(evicted);
      if (slotIdx < 0) return null;
    }

    const cfg = BANSUNG_PROJECTILE_CONFIGS[params.kind];
    const b = this.slots[slotIdx];
    b.id = this.nextId++;
    b.alive = true;
    b.kind = params.kind;
    b.kindId = cfg.kindId;
    b.trajectory = cfg.trajectory;
    b.team = params.team;
    b.ownerId = params.ownerId;
    b.ownerIdx = params.ownerIdx;
    b.weaponId = params.weaponId;
    b.x = params.x;
    b.y = params.y;
    b.z = params.z ?? 0;
    b.prevX = params.x;
    b.prevY = params.y;
    b.vx = params.vx;
    b.vy = params.vy;
    b.vz = params.vz ?? cfg.initVZ;
    b.speed = Math.hypot(params.vx, params.vy);
    b.accel = cfg.accel;
    b.maxSpeed = cfg.maxSpeed;
    b.gravityZ = cfg.gravityZ;
    b.radius = params.radius ?? cfg.radius;
    b.traveledPx = 0;
    b.maxRange = params.maxRange ?? cfg.range;
    b.ttlTicks = params.ttlTicks ?? msToTicksCeil(cfg.ttlMs);
    b.ageTicks = 0;
    b.bouncesLeft = params.bouncesLeft ?? cfg.bouncesMax;
    b.restitution = cfg.restitution;
    b.pierceLeft = Math.max(1, params.pierceLeft ?? cfg.pierceCount);
    b.hitIds.clear();
    b.destructibleByMelee = params.destructibleByMelee ?? cfg.destructibleByMelee;
    b.contactDetonate = cfg.contactDetonate;
    b.dmgKind = params.dmgKind ?? 'kinetic';
    b.baseDmg = params.baseDmg ?? (cfg.damagePair ? cfg.damagePair[0] : 10);
    b.affinity = params.affinity;
    b.armorPen = params.armorPen ?? 0;
    b.armorPiercePct = params.armorPiercePct ?? 0;
    b.critChance = params.critChance ?? 0;
    b.critMult = params.critMult ?? 1.5;
    b.dmgMult = params.dmgMult ?? 1;
    b.knockback = params.knockback ?? cfg.knockback;
    b.stunMs = params.stunMs ?? cfg.stunMs;
    b.dotKind = params.dotKind;
    b.dotTickDmgOverride = params.dotTickDmgOverride;
    b.dotDurMs = params.dotDurMs;
    b.critBurn = params.critBurn;
    b.slowPct = params.slowPct ?? 0;
    b.slowMs = params.slowMs ?? 0;
    b.slowSplashRadius = params.slowSplashRadius ?? 0;
    b.pullRadius = params.pullRadius ?? 0;
    b.pullImpulse = params.pullImpulse ?? 0;
    b.falloff = params.falloff ?? cfg.falloff;
    b.empowered = params.empowered ?? false;
    b.isFromEnemy = params.isFromEnemy ?? params.team !== 0;
    b.isEnergy =
      params.isEnergy ??
      (params.kind === 'plasma_bolt' ||
        params.kind === 'plasma_pellet' ||
        params.kind === 'thunder_orb' ||
        params.kind === 'electric_arc_bolt' ||
        params.kind === 'tesla_arc' ||
        params.kind === 'rail_beam' ||
        params.kind === 'laser_map_beam' ||
        params.kind === 'ion_lance' ||
        params.kind === 'turret_bolt' ||
        params.kind === 'turret_thunder' ||
        params.kind === 'flame_stream_orb' ||
        params.kind === 'cryo_shard' ||
        params.kind === 'blizzard_bolt' ||
        params.kind === 'chronos_slug' ||
        params.kind === 'void_cannon_orb' ||
        params.kind === 'gravity_orb');
    b.isExplosive =
      params.isExplosive ??
      (cfg.blastRadius > 0 &&
        params.kind !== 'arcane_fireball' &&
        params.kind !== 'gravity_orb' &&
        params.kind !== 'cryo_shard');
    b.isHoming = params.isHoming ?? cfg.trajectory === 'homing';
    b.blastRadius = params.blastRadius ?? cfg.blastRadius;
    b.coreRadius = params.coreRadius ?? cfg.coreRadius;
    b.outerFalloffMin = params.outerFalloffMin ?? cfg.outerFalloffMin;
    b.stunFalloffMin = params.stunFalloffMin ?? cfg.outerFalloffMin;
    b.shrapnelCount = params.shrapnelCount ?? 0;
    b.shrapnelDamage = params.shrapnelDamage ?? 0;
    b.shrapnelSpeed = params.shrapnelSpeed ?? 0;
    b.shrapnelTtlTicks = params.shrapnelTtlTicks ?? 0;
    b.chainMaxHops = params.chainMaxHops ?? 0;
    b.chainRadius = params.chainRadius ?? 0;
    b.chainDmgDecay = params.chainDmgDecay ?? 0;
    b.chainHopStunMs = params.chainHopStunMs ?? 0;
    b.splitEmberCount = params.splitEmberCount ?? 0;
    b.splitEmberDmg = params.splitEmberDmg ?? [0, 0];
    b.splitEmberSpeed = params.splitEmberSpeed ?? 0;
    b.splitEmberRange = params.splitEmberRange ?? 0;
    b.burnDps = params.burnDps ?? 0;
    b.burnMs = params.burnMs ?? 0;
    b.homingTurnRateRadPerS = params.homingTurnRateRadPerS ?? 0;
    b.homingConeCos = params.homingConeCos ?? 1;
    b.homingDetectRange = params.homingDetectRange ?? 0;
    b.mineState = 0;
    b.mineArmTicksLeft = params.mineArmTicksLeft ?? 0;
    b.mineTriggerRadius = params.mineTriggerRadius ?? 0;
    b.mineDetonateTicksLeft = params.mineDetonateTicksLeft ?? 0;
    b.blastDmgScale = params.blastDmgScale ?? 1;

    this.active.push(b);
    return b;
  }

  /** Reclaims all `!alive` projectiles back onto the free stack in-place. */
  reap(): void {
    let i = 0;
    while (i < this.active.length) {
      const b = this.active[i];
      if (b.alive) {
        i++;
        continue;
      }
      b.hitIds.clear();
      const last = this.active.pop()!;
      if (i < this.active.length) {
        this.active[i] = last;
      }
      const slotIdx = this.slots.indexOf(b);
      if (slotIdx >= 0) {
        this.freeStack.push(slotIdx);
      }
    }
  }

  /** Packs alive projectiles into 6-int stride tuples (`BANSUNG_BULLET_FIELDS = 6`). */
  packBullets(
    out: number[],
    cullRect?: { x0: number; y0: number; x1: number; y1: number },
    cap = 96,
  ): number {
    out.length = 0;
    let written = 0;
    for (let i = 0; i < this.active.length && written < cap; i++) {
      const b = this.active[i];
      if (!b.alive) continue;
      if (
        cullRect &&
        (b.x < cullRect.x0 || b.x > cullRect.x1 || b.y < cullRect.y0 || b.y > cullRect.y1)
      ) {
        continue;
      }
      let flags = 0;
      if (b.isFromEnemy) flags |= BANSUNG_BFLAG_FROM_ENEMY;
      if (b.pierceLeft > 1) flags |= BANSUNG_BFLAG_PIERCE;
      if (b.isExplosive) flags |= BANSUNG_BFLAG_EXPLOSIVE;
      if (b.empowered) flags |= BANSUNG_BFLAG_CRIT;
      if (b.isEnergy) flags |= BANSUNG_BFLAG_ENERGY;
      if (b.isHoming) flags |= BANSUNG_BFLAG_HOMING;

      const aimRad = b.vx === 0 && b.vy === 0 ? 0 : Math.atan2(b.vy, b.vx);
      out.push(b.id, b.kindId, Math.round(b.x), Math.round(b.y), quantizeAim(aimRad), flags);
      written++;
    }
    return written;
  }
}

// ============================================================================
// 7. Firing, Burst Queue, Railgun Charge & Melee Sweeping Arc
// ============================================================================

function computeGroundMuzzle(
  hero: BansungHeroWeaponState,
  spec: BansungWeaponSpec,
): { x: number; y: number } {
  const fwd = Math.max(12, Math.min(36, spec.muzzleOffset[0]));
  return {
    x: hero.x + Math.cos(hero.aimRad) * fwd,
    y: hero.y + Math.sin(hero.aimRad) * fwd,
  };
}

/** Symmetric angular fan offset (rad) for multishot / evolved extra barrels. */
function computeMultishotFanOffsetRad(
  shotIdx: number,
  total: number,
  stepDeg = 5.5,
  maxArcDeg = 34,
): number {
  if (total <= 1) return 0;
  const effStepDeg = Math.min(stepDeg, maxArcDeg / Math.max(1, total - 1));
  return (shotIdx - (total - 1) * 0.5) * effStepDeg * DEG_TO_RAD;
}

function emitDryFire(
  hero: BansungHeroWeaponState,
  tickNo: number,
  reason: 'energy' | 'ammo',
  ctx: BansungWeaponWorldContext,
): void {
  if (tickNo - hero.lastDryFireTick < BANSUNG_DRY_FIRE_COOLDOWN_TICKS) return;
  hero.lastDryFireTick = tickNo;
  ctx.onDryFire?.(hero, reason);
}

function getTargetLayerMaskForTeam(team: number): number {
  return team === 0 ? LAYER_ENEMY | LAYER_PET : LAYER_PLAYER | LAYER_PET;
}

function spawnGuardedProjectile(
  hero: BansungHeroWeaponState,
  muzzleX: number,
  muzzleY: number,
  params: BansungSpawnProjectileParams,
  ctx: BansungWeaponWorldContext,
): boolean {
  const guard = checkMuzzleWallGuard(
    ctx.obsGrid,
    hero.x,
    hero.y,
    muzzleX,
    muzzleY,
    params.radius ?? 4,
    'bullet',
  );
  if (!guard) {
    return ctx.bullets.spawn(params) !== null;
  }

  // Wall-hug muzzle guard: resolve at impact point without tunneling behind thin cover
  damageObstacleDefault(guard.obstacle, params.baseDmg ?? 10, ctx, hero.id, params.dmgKind);

  if (params.isExplosive || params.kind === 'arcane_fireball') {
    const temp = ctx.bullets.spawn({
      ...params,
      x: guard.x,
      y: guard.y,
      vx: 0,
      vy: 0,
    });
    if (temp) {
      if (params.kind === 'arcane_fireball') {
        explodeArcaneFireball(temp, Math.atan2(params.vy, params.vx) + Math.PI, ctx);
      } else {
        detonateExplosiveProjectile(temp, ctx);
      }
      ctx.bullets.reap();
    }
    return true;
  }

  const bouncesLeft = params.bouncesLeft ?? 0;
  if (bouncesLeft > 0) {
    const vn = params.vx * guard.nx + params.vy * guard.ny;
    let rvx = params.vx;
    let rvy = params.vy;
    if (vn < 0) {
      rvx -= 2 * vn * guard.nx;
      rvy -= 2 * vn * guard.ny;
    }
    return (
      ctx.bullets.spawn({
        ...params,
        x: guard.x + guard.nx * 0.5,
        y: guard.y + guard.ny * 0.5,
        vx: rvx,
        vy: rvy,
        bouncesLeft: bouncesLeft - 1,
      }) !== null
    );
  }

  ctx.fx?.push(
    FX_IMPACT,
    BANSUNG_IMPACT_KINDS.wall,
    Math.round(guard.x),
    Math.round(guard.y),
    quantizeAim(Math.atan2(params.vy, params.vx)),
    0,
  );
  return true;
}

function enforceMineCaps(heroId: string, ctx: BansungWeaponWorldContext): void {
  const perOwner = BANSUNG_EXPLOSIVE_COOP_RULES.maxMinesPerOwner;
  while (ctx.bullets.countMinesForOwner(heroId) >= perOwner) {
    const oldest = ctx.bullets.findOldestMine(heroId);
    if (!oldest) break;
    oldest.blastDmgScale = 0.5;
    detonateExplosiveProjectile(oldest, ctx);
  }
  const globalCap = BANSUNG_EXPLOSIVE_COOP_RULES.maxMinesGlobal;
  while (ctx.bullets.countTotalMines() >= globalCap) {
    const oldest = ctx.bullets.findOldestMine();
    if (!oldest) break;
    oldest.blastDmgScale = 0.5;
    detonateExplosiveProjectile(oldest, ctx);
  }
}

function spawnKineticShot(
  hero: BansungHeroWeaponState,
  spec: BansungKineticWeaponSpec,
  evo: BansungWeaponEvolutionStats,
  moving: boolean,
  empowered: boolean,
  ctx: BansungWeaponWorldContext,
): void {
  const rng = ctx.rng ?? Math.random;
  const muzzle = computeGroundMuzzle(hero, spec);
  const moveMult = moving ? spec.moveSpreadMult : 1;
  const spreadDeg =
    Math.min(spec.baseSpreadDeg + hero.bloomDeg, spec.baseSpreadDeg + spec.maxBloomDeg) *
    moveMult;
  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const dmgMult =
    (empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evo.dmgMult *
    (gacha?.dmgMult ?? 1);
  const critChance = spec.critChance + (mods?.critChanceAdd ?? 0) + (gacha?.critChanceAdd ?? 0);
  const critMult = spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1);
  const extraPierce = (mods?.extraPierce ?? 0) + evo.extraPierce + (gacha?.extraPierce ?? 0);
  const projCfg = BANSUNG_PROJECTILE_CONFIGS[spec.projKind];
  const basePierce = Math.max(1, projCfg?.pierceCount ?? 1);
  const baseBounces = projCfg?.bouncesMax ?? 0;
  const extraBounce = mods?.extraBounce ?? 0;
  const dotTickOverride = spec.dotOnHit
    ? Math.max(1, Math.round(spec.dotOnHit.dps * 0.5))
    : undefined;
  const bonusProjectiles = Math.max(0, Math.round(evo.extraProjectiles + (gacha?.extraMultishot ?? 0)));

  if (spec.pellets === 1) {
    const totalShots = 1 + bonusProjectiles;
    for (let i = 0; i < totalShots; i++) {
      const r = (rng() - rng()) * spreadDeg * DEG_TO_RAD;
      const fanRad = computeMultishotFanOffsetRad(i, totalShots, 5.5, 34);
      const ang = hero.aimRad + r + fanRad;
      spawnGuardedProjectile(
        hero,
        muzzle.x,
        muzzle.y,
        {
          kind: spec.projKind,
          team: hero.team,
          ownerId: hero.id,
          ownerIdx: hero.idx,
          weaponId: spec.id,
          x: muzzle.x,
          y: muzzle.y,
          vx: Math.cos(ang) * spec.projSpeed,
          vy: Math.sin(ang) * spec.projSpeed,
          radius: spec.projRadius,
          maxRange: spec.range,
          bouncesLeft: baseBounces + extraBounce,
          pierceLeft: basePierce + extraPierce,
          dmgKind: 'kinetic',
          baseDmg: spec.damage,
          affinity: spec.armorMult,
          critChance,
          critMult,
          dmgMult,
          knockback: spec.knockback,
          armorPiercePct: spec.armorPiercePct ?? 0,
          dotKind: spec.dotOnHit?.kind,
          dotDurMs: spec.dotOnHit?.ms,
          dotTickDmgOverride: dotTickOverride,
          falloff: spec.falloff,
          empowered,
        },
        ctx,
      );
    }
  } else {
    const totalPellets = spec.pellets + bonusProjectiles;
    const fan = ((spec.fanArcDeg ?? 22) + bonusProjectiles * 3) * DEG_TO_RAD;
    const jitterDeg = (spec.baseSpreadDeg + hero.bloomDeg * 0.4) * moveMult;
    for (let i = 0; i < totalPellets; i++) {
      const base = (i / Math.max(1, totalPellets - 1) - 0.5) * fan;
      const jitter = (rng() * 2 - 1) * jitterDeg * DEG_TO_RAD;
      const spd = spec.projSpeed * (0.95 + rng() * 0.1);
      const ang = hero.aimRad + base + jitter;
      spawnGuardedProjectile(
        hero,
        muzzle.x,
        muzzle.y,
        {
          kind: spec.projKind,
          team: hero.team,
          ownerId: hero.id,
          ownerIdx: hero.idx,
          weaponId: spec.id,
          x: muzzle.x,
          y: muzzle.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: spec.projRadius,
          maxRange: spec.range,
          bouncesLeft: extraBounce,
          pierceLeft: 1 + extraPierce,
          dmgKind: 'kinetic',
          baseDmg: spec.damage,
          affinity: spec.armorMult,
          critChance,
          critMult,
          dmgMult,
          knockback: spec.knockback,
          armorPiercePct: spec.armorPiercePct ?? 0,
          dotKind: spec.dotOnHit?.kind,
          dotDurMs: spec.dotOnHit?.ms,
          dotTickDmgOverride: dotTickOverride,
          falloff: spec.falloff,
          empowered,
        },
        ctx,
      );
    }
  }

  hero.bloomDeg = Math.min(spec.maxBloomDeg, hero.bloomDeg + spec.bloomPerShotDeg);
  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(muzzle.x),
    Math.round(muzzle.y),
    quantizeAim(hero.aimRad),
  );
}

function spawnExplosiveShot(
  hero: BansungHeroWeaponState,
  spec: BansungExplosiveWeaponSpec,
  evo: BansungWeaponEvolutionStats,
  shotIndex: number,
  aimDistPx: number | undefined,
  empowered: boolean,
  ctx: BansungWeaponWorldContext,
): void {
  const rng = ctx.rng ?? Math.random;
  const muzzle = computeGroundMuzzle(hero, spec);
  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const dmgMult =
    (empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evo.dmgMult *
    (gacha?.dmgMult ?? 1);
  const critChance = spec.critChance + (mods?.critChanceAdd ?? 0) + (gacha?.critChanceAdd ?? 0);
  const blastMul =
    (mods?.blastRadiusMul ?? 1) * evo.blastRadiusMult * (gacha?.blastRadiusMult ?? 1);
  const bonusProjectiles = Math.max(0, Math.round(evo.extraProjectiles + (gacha?.extraMultishot ?? 0)));

  let baseAngOffset = (rng() * 2 - 1) * spec.spreadDeg * DEG_TO_RAD;
  if (spec.fireMode === 'ripple_rocket' && spec.burstCount > 1) {
    const fanIdx = shotIndex - Math.floor(spec.burstCount / 2);
    baseAngOffset += fanIdx * spec.fanDeg * DEG_TO_RAD;
  }

  let speed = spec.projSpeed;
  let z: number = BANSUNG_EXPLOSIVE_COOP_RULES.rocketSpawnZ;
  if (spec.fireMode === 'lob' || spec.fireMode === 'mine') {
    z = BANSUNG_EXPLOSIVE_COOP_RULES.lobSpawnZ;
    if (aimDistPx !== undefined && Number.isFinite(aimDistPx) && spec.gravityZ > 0) {
      const clampedAim = clamp(
        aimDistPx,
        BANSUNG_EXPLOSIVE_COOP_RULES.lobAimMinPx,
        BANSUNG_EXPLOSIVE_COOP_RULES.lobAimMaxPx,
      );
      const tFlight =
        (spec.initVZ + Math.sqrt(spec.initVZ * spec.initVZ + 2 * spec.gravityZ * z)) /
        spec.gravityZ;
      speed = clamp(clampedAim / Math.max(0.15, tFlight), 140, spec.projSpeed);
    }
  }

  const isRipple = spec.fireMode === 'ripple_rocket';
  const totalShots = isRipple
    ? 1 + (shotIndex === 0 ? bonusProjectiles : 0)
    : 1 + bonusProjectiles;
  const extraPierce = (mods?.extraPierce ?? 0) + evo.extraPierce + (gacha?.extraPierce ?? 0);

  let primaryAng = hero.aimRad + baseAngOffset;
  for (let p = 0; p < totalShots; p++) {
    const fanExtra = computeMultishotFanOffsetRad(p, totalShots, isRipple ? 5 : 6, 32);
    const ang = hero.aimRad + baseAngOffset + fanExtra;
    if (p === 0) primaryAng = ang;

    if (spec.fireMode === 'mine') {
      enforceMineCaps(hero.id, ctx);
    }

    spawnGuardedProjectile(
      hero,
      muzzle.x,
      muzzle.y,
      {
        kind: spec.projKind,
        team: hero.team,
        ownerId: hero.id,
        ownerIdx: hero.idx,
        weaponId: spec.id,
        x: muzzle.x,
        y: muzzle.y,
        z,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        vz: spec.initVZ,
        radius: spec.projRadius,
        maxRange: spec.range,
        ttlTicks: spec.fuseTicks,
        bouncesLeft: spec.bouncesMax,
        pierceLeft: 1 + (isRipple ? 0 : extraPierce),
        dmgKind: 'explosive',
        baseDmg: spec.damage,
        affinity: spec.armorMult,
        critChance,
        critMult: spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1),
        dmgMult,
        knockback: spec.knockbackSpeed,
        stunMs: spec.stunMs,
        empowered,
        isExplosive: true,
        blastRadius: Math.round(spec.blastRadius * blastMul),
        coreRadius: Math.round(spec.coreRadius * blastMul),
        outerFalloffMin: spec.outerFalloffMin,
        stunFalloffMin: spec.stunFalloffMin ?? spec.outerFalloffMin,
        shrapnelCount: spec.shrapnelCount,
        shrapnelDamage: spec.shrapnelDamage,
        shrapnelSpeed: spec.shrapnelSpeed,
        shrapnelTtlTicks: msToTicksCeil(spec.shrapnelTtlMs),
        mineArmTicksLeft: msToTicksCeil(spec.armDelayMs),
        mineTriggerRadius: spec.triggerRadius,
        mineDetonateTicksLeft: msToTicksCeil(spec.detonateDelayMs),
      },
      ctx,
    );
  }

  if (spec.recoilPush > 0 && ctx.applyRecoilPush) {
    ctx.applyRecoilPush(
      hero.id,
      -Math.cos(hero.aimRad) * spec.recoilPush,
      -Math.sin(hero.aimRad) * spec.recoilPush,
    );
  }

  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(muzzle.x),
    Math.round(muzzle.y),
    quantizeAim(primaryAng),
  );
}

function fireFullMapLaserBeam(
  hero: BansungHeroWeaponState,
  spec: BansungEnergyWeaponSpec,
  evo: BansungWeaponEvolutionStats,
  empowered: boolean,
  ctx: BansungWeaponWorldContext,
): void {
  const muzzle = computeGroundMuzzle(hero, spec);
  const startX = muzzle.x;
  const startY = muzzle.y;
  const cos = Math.cos(hero.aimRad);
  const sin = Math.sin(hero.aimRad);
  const isIonBeam = spec.id === 'ion_beam';
  const beamLen = isIonBeam ? spec.range : Math.max(spec.range, 7800);
  const beamKind = isIonBeam ? BANSUNG_BEAM_KINDS.rail : BANSUNG_BEAM_KINDS.laser_map;
  const endX = startX + cos * beamLen;
  const endY = startY + sin * beamLen;

  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const dmgMult =
    (empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evo.dmgMult *
    (gacha?.dmgMult ?? 1);
  const critChance = spec.critChance + (mods?.critChanceAdd ?? 0) + (gacha?.critChanceAdd ?? 0);
  const critMult = spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1);
  const beamHits: RayActorHit[] = [];
  const dmgCtx: BansungDamageContext = {
    rng: ctx.rng,
    atkCritBonus: mods?.critChanceAdd,
  };

  sweepSegmentActors(
    ctx.actorGrid,
    startX,
    startY,
    endX,
    endY,
    spec.projRadius,
    getTargetLayerMaskForTeam(hero.team),
    hero.team,
    beamHits,
  );

  const maxHits = isIonBeam ? 6 + evo.extraPierce + (gacha?.extraPierce ?? 0) : beamHits.length;
  for (let i = 0; i < beamHits.length && i < maxHits; i++) {
    const hit = beamHits[i];
    const target = resolveActorTarget(hit.actor, ctx);
    if (!target) continue;
    applyCombatHitAndEvents(
      target,
      hero.id,
      {
        baseDmg: spec.damage,
        dmgKind: 'energy',
        affinity: spec.armorMult,
        armorPiercePct: isIonBeam ? 0.45 : 0.35,
        critChance,
        critMult,
        dmgMult,
        stunMs: isIonBeam ? 120 : 160,
        attackerId: hero.id,
      },
      ctx,
      dmgCtx,
    );
  }

  ctx.fx?.push(
    FX_BEAM,
    Math.round(startX),
    Math.round(startY),
    Math.round(endX),
    Math.round(endY),
    beamKind,
  );
  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(startX),
    Math.round(startY),
    quantizeAim(hero.aimRad),
  );
}

function spawnEnergyProjectileShot(
  hero: BansungHeroWeaponState,
  spec: BansungEnergyWeaponSpec,
  evo: BansungWeaponEvolutionStats,
  empowered: boolean,
  ctx: BansungWeaponWorldContext,
): void {
  if (spec.id === 'laser_cannon' || spec.id === 'ion_beam') {
    fireFullMapLaserBeam(hero, spec, evo, empowered, ctx);
    return;
  }
  const rng = ctx.rng ?? Math.random;
  const muzzle = computeGroundMuzzle(hero, spec);
  const baseSpread = (rng() * 2 - 1) * spec.spreadDeg * DEG_TO_RAD;
  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const dmgMult =
    (empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evo.dmgMult *
    (gacha?.dmgMult ?? 1);
  const critChance = spec.critChance + (mods?.critChanceAdd ?? 0) + (gacha?.critChanceAdd ?? 0);
  const critMult = spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1);
  const extraPierce = (mods?.extraPierce ?? 0) + evo.extraPierce + (gacha?.extraPierce ?? 0);
  const projCfg = BANSUNG_PROJECTILE_CONFIGS[spec.projKind];
  const basePierce = Math.max(1, projCfg?.pierceCount ?? 1);
  const baseBounces = projCfg?.bouncesMax ?? 0;
  const extraBounce = spec.projKind === 'plasma_bolt' ? (mods?.extraBounce ?? 0) : 0;
  const blastMul =
    (mods?.blastRadiusMul ?? 1) * evo.blastRadiusMult * (gacha?.blastRadiusMult ?? 1);
  const bonusProjectiles = Math.max(0, Math.round(evo.extraProjectiles + (gacha?.extraMultishot ?? 0)));
  const totalShots = 1 + bonusProjectiles;
  const baseAng = hero.aimRad + baseSpread;
  const flameTickOverride = spec.flameDot
    ? Math.max(1, Math.round(spec.flameDot.dps * 0.5))
    : undefined;
  const effBlastRadius = spec.gravityPull?.splashRadius
    ? Math.round(spec.gravityPull.splashRadius * blastMul)
    : spec.splash
      ? Math.round(spec.splash.radius * blastMul)
      : 0;

  for (let i = 0; i < totalShots; i++) {
    const ang = baseAng + computeMultishotFanOffsetRad(i, totalShots, 6, 34);
    spawnGuardedProjectile(
      hero,
      muzzle.x,
      muzzle.y,
      {
        kind: spec.projKind,
        team: hero.team,
        ownerId: hero.id,
        ownerIdx: hero.idx,
        weaponId: spec.id,
        x: muzzle.x,
        y: muzzle.y,
        vx: Math.cos(ang) * spec.projSpeed,
        vy: Math.sin(ang) * spec.projSpeed,
        radius: spec.projRadius,
        maxRange: spec.range,
        bouncesLeft: baseBounces + extraBounce,
        pierceLeft: basePierce + extraPierce,
        dmgKind: getWeaponDmgKind(spec),
        baseDmg: spec.damage,
        affinity: spec.armorMult,
        critChance,
        critMult,
        dmgMult,
        knockback: spec.knockback,
        armorPiercePct: spec.armorPiercePct ?? 0,
        stunMs: spec.chain?.hitStunMs ?? 0,
        dotKind: spec.flameDot ? 'burn' : undefined,
        dotDurMs: spec.flameDot?.ms,
        dotTickDmgOverride: flameTickOverride,
        critBurn: spec.critBurn,
        slowPct: spec.slowOnHit?.pct ?? 0,
        slowMs: spec.slowOnHit?.ms ?? 0,
        slowSplashRadius: spec.slowOnHit ? Math.round((spec.slowOnHit.splashRadius ?? 0) * blastMul) : 0,
        pullRadius: spec.gravityPull ? Math.round(spec.gravityPull.radius * Math.min(1.35, blastMul)) : 0,
        pullImpulse: spec.gravityPull?.impulse ?? 0,
        empowered,
        isEnergy: true,
        isExplosive: false,
        isHoming: Boolean(spec.homing),
        homingTurnRateRadPerS: spec.homing?.turnRateRadPerS ?? 0,
        homingConeCos: spec.homing?.coneCosThreshold ?? 1,
        homingDetectRange: spec.homing?.detectRangePx ?? 0,
        chainMaxHops: spec.chain?.maxHops ?? 0,
        chainRadius: spec.chain?.radius ?? 0,
        chainDmgDecay: spec.chain?.dmgDecay ?? 0,
        chainHopStunMs: spec.chain?.hopStunMs ?? 0,
        blastRadius: effBlastRadius,
        coreRadius: spec.splash || spec.gravityPull ? 16 : 0,
        outerFalloffMin: spec.splash?.edgeRatio ?? 0.5,
        splitEmberCount: spec.splash?.splitCount ?? 0,
        splitEmberDmg: spec.splash?.emberDmg ?? [0, 0],
        splitEmberSpeed: spec.splash?.emberSpeed ?? 0,
        splitEmberRange: spec.splash?.emberRange ?? 0,
        burnDps: spec.splash?.burnDps ?? 0,
        burnMs: spec.splash?.burnMs ?? 0,
      },
      ctx,
    );
  }

  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(muzzle.x),
    Math.round(muzzle.y),
    quantizeAim(baseAng),
  );
}

/** Executes instant piercing railgun raycast + capsule sweep on charge release (d28). */
export function fireRailgunBeam(
  hero: BansungHeroWeaponState,
  slot: BansungWeaponRuntime,
  spec: BansungEnergyWeaponSpec,
  holdTicks: number,
  tickNo: number,
  ctx: BansungWeaponWorldContext,
): boolean {
  const chargeCfg = spec.charge;
  if (!chargeCfg) return false;

  const evo = getWeaponEvolutionStats(slot.weaponId, slot.tier);
  const rawQ = clamp(
    (holdTicks - RAILGUN_MIN_HOLD_TICKS) / Math.max(1, RAILGUN_FULL_HOLD_TICKS - RAILGUN_MIN_HOLD_TICKS),
    0,
    1,
  );
  const minCost = getEffectiveEnergyCost(hero, chargeCfg.minEnergyCost, evo.energyCostMult);
  const fullCost = getEffectiveEnergyCost(hero, chargeCfg.fullEnergyCost, evo.energyCostMult);
  if (hero.energy < minCost) {
    emitDryFire(hero, tickNo, 'energy', ctx);
    return false;
  }

  let q = rawQ;
  let energyCost = Math.round(lerp(minCost, fullCost, q));
  if (energyCost > hero.energy && fullCost > minCost) {
    q = clamp((hero.energy - minCost) / (fullCost - minCost), 0, 1);
    energyCost = Math.min(hero.energy, Math.round(lerp(minCost, fullCost, q)));
  }

  const empowered = slot.empowered;
  hero.energy -= energyCost;
  hero.lastEnergySpendTick = tickNo;
  if (spec.magSize > 0) {
    slot.ammoInMag = Math.max(0, slot.ammoInMag - 1);
    if (slot.ammoInMag === 0) {
      slot.empowered = false;
      startHeroReload(hero, hero.activeSlot, tickNo, ctx.fx);
    }
  }
  hero.slotCdTicks[hero.activeSlot] = getEffectiveCooldownTicks(hero, spec.cooldownTicks, evo.fireRateMult);

  const muzzle = computeGroundMuzzle(hero, spec);
  const guard = checkMuzzleWallGuard(
    ctx.obsGrid,
    hero.x,
    hero.y,
    muzzle.x,
    muzzle.y,
    spec.projRadius,
    'bullet',
  );
  const startX = guard ? guard.x : muzzle.x;
  const startY = guard ? guard.y : muzzle.y;

  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const dmgMult =
    lerp(chargeCfg.minTapMult, 1.0, q) *
    (empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evo.dmgMult *
    (gacha?.dmgMult ?? 1);
  const pierceMax =
    Math.round(lerp(chargeCfg.minPierce, chargeCfg.maxPierce, q)) +
    (mods?.extraPierce ?? 0) +
    evo.extraPierce +
    (gacha?.extraPierce ?? 0);
  const critChance =
    spec.critChance +
    q * chargeCfg.fullCritBonus +
    (mods?.critChanceAdd ?? 0) +
    (gacha?.critChanceAdd ?? 0);
  const stunMs = q >= 0.99 ? chargeCfg.fullStunMs : Math.round(q * chargeCfg.fullStunMs);
  const bonusProjectiles = Math.max(0, Math.round(evo.extraProjectiles + (gacha?.extraMultishot ?? 0)));
  const totalBeams = 1 + bonusProjectiles;
  const dmgCtx = buildDamageContext(ctx);

  for (let bIdx = 0; bIdx < totalBeams; bIdx++) {
    const beamAng = hero.aimRad + computeMultishotFanOffsetRad(bIdx, totalBeams, 4, 24);
    const dirX = Math.cos(beamAng);
    const dirY = Math.sin(beamAng);
    let endX = startX + dirX * spec.range;
    let endY = startY + dirY * spec.range;

    if (guard) {
      if (bIdx === 0) {
        damageObstacleDefault(guard.obstacle, spec.damage * dmgMult, ctx, hero.id, 'pierce');
      }
      endX = guard.x;
      endY = guard.y;
    } else {
      const wallHit = raycastObstacles(ctx.obsGrid, startX, startY, endX, endY, 0, 'bullet');
      if (wallHit) {
        endX = wallHit.x;
        endY = wallHit.y;
        damageObstacleDefault(wallHit.obstacle, spec.damage * dmgMult, ctx, hero.id, 'pierce');
      }
    }

    sweepSegmentActors(
      ctx.actorGrid,
      startX,
      startY,
      endX,
      endY,
      spec.projRadius,
      getTargetLayerMaskForTeam(hero.team),
      hero.team,
      tmpRayActors,
      { sort: true },
    );

    const hitCap = Math.min(pierceMax, tmpRayActors.length);
    for (let i = 0; i < hitCap; i++) {
      const h = tmpRayActors[i];
      const target = resolveActorTarget(h.actor, ctx);
      if (!target) continue;
      const hitRes = applyCombatHitAndEvents(
        target,
        hero.id,
        {
          baseDmg: spec.damage,
          dmgKind: 'pierce',
          affinity: spec.armorMult,
          critChance,
          critMult: spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1),
          dmgMult,
          stunMs,
          attackerId: hero.id,
        },
        ctx,
        dmgCtx,
      );
      if (!hitRes.blocked && spec.knockback > 0) {
        applyRadialKnockback(h.actor, startX, startY, spec.knockback, ctx);
      }
    }

    ctx.fx?.push(
      FX_BEAM,
      Math.round(startX),
      Math.round(startY),
      Math.round(endX),
      Math.round(endY),
      BANSUNG_BEAM_KINDS.rail,
    );
  }

  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(startX),
    Math.round(startY),
    quantizeAim(hero.aimRad),
  );
  return true;
}

function startMeleeSwing(
  hero: BansungHeroWeaponState,
  slotIdx: number,
  slot: BansungWeaponRuntime,
  spec: BansungMeleeWeaponSpec,
  tickNo: number,
  ctx: BansungWeaponWorldContext,
): boolean {
  const evo = getWeaponEvolutionStats(slot.weaponId, slot.tier);
  const effEnergyCost = getEffectiveEnergyCost(hero, spec.energyCost, evo.energyCostMult);
  const charged = effEnergyCost === 0 || hero.energy >= effEnergyCost;
  if (charged && effEnergyCost > 0) {
    hero.energy -= effEnergyCost;
    hero.lastEnergySpendTick = tickNo;
  }

  const dir: 1 | -1 = (hero.swingCombo & 1) === 0 ? 1 : -1;
  hero.swingCombo += 1;
  const halfArc = ((spec.arcDeg + evo.meleeArcBonusDeg) * DEG_TO_RAD) * 0.5;
  const startAng = hero.aimRad - dir * halfArc;
  const endAng = hero.aimRad + dir * halfArc;
  const reach = Math.round(spec.reach * evo.meleeReachMult);

  hero.activeSwing = {
    slot: slotIdx,
    weaponId: spec.id,
    startTick: tickNo + spec.windupTicks,
    activeTicks: spec.activeTicks,
    recoveryTicks: spec.recoveryTicks,
    dir,
    startAng,
    endAng,
    aimRad: hero.aimRad,
    reach,
    evoDmgMult: evo.dmgMult,
    charged,
    empowered: slot.empowered,
    lunged: false,
    hitActorIds: new Set<number>(),
    hitObstacleIds: new Set<number>(),
    bulletEnergy: 0,
  };
  hero.slotCdTicks[slotIdx] = getEffectiveCooldownTicks(hero, spec.cooldownTicks, evo.fireRateMult);

  ctx.fx?.push(
    FX_MUZZLE,
    hero.idx,
    spec.idx,
    Math.round(hero.x),
    Math.round(hero.y),
    quantizeAim(hero.aimRad),
  );
  ctx.fx?.push(
    FX_IMPACT,
    BANSUNG_IMPACT_KINDS.slash,
    Math.round(hero.x),
    Math.round(hero.y),
    quantizeAim(hero.aimRad),
    spec.idx,
  );
  return true;
}

function pointOnSegmentInArc(
  ox: number,
  oy: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  reach: number,
  mid: number,
  halfAngle: number,
): { hit: boolean; cx: number; cy: number } {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq <= 1e-12 ? 0 : clamp(((ox - x0) * vx + (oy - y0) * vy) / lenSq, 0, 1);
  const cx = x0 + vx * t;
  const cy = y0 + vy * t;
  const dx = cx - ox;
  const dy = cy - oy;
  const d = Math.hypot(dx, dy);
  if (d > reach) return { hit: false, cx, cy };
  if (d <= 1e-6) return { hit: true, cx, cy };
  const angDiff = Math.abs(wrapPi(Math.atan2(dy, dx) - mid));
  return { hit: angDiff <= halfAngle, cx, cy };
}

/**
 * Advances active melee swing by one 30Hz tick: initial lunge, swept-sector
 * enemy & crate hits, Shock Baton chain stun, and enemy bullet destruction (d29).
 */
export function stepHeroMeleeSwing(
  hero: BansungHeroWeaponState,
  ctx: BansungWeaponWorldContext,
): { bulletsDestroyed: number; meleeHits: number; lifestealHp: number } {
  const swing = hero.activeSwing;
  if (!swing) return { bulletsDestroyed: 0, meleeHits: 0, lifestealHp: 0 };

  if (!hero.alive || hero.downed || hero.stunned) {
    hero.activeSwing = null;
    return { bulletsDestroyed: 0, meleeHits: 0, lifestealHp: 0 };
  }

  const k = ctx.tickNo - swing.startTick;
  if (k < 0) return { bulletsDestroyed: 0, meleeHits: 0, lifestealHp: 0 };
  if (k >= swing.activeTicks) {
    if (k >= swing.activeTicks + swing.recoveryTicks) {
      hero.activeSwing = null;
    }
    return { bulletsDestroyed: 0, meleeHits: 0, lifestealHp: 0 };
  }

  const spec = getWeaponSpec(swing.weaponId) as BansungMeleeWeaponSpec;
  if (!swing.lunged && spec.lungePx > 0) {
    swing.lunged = true;
    const body: CircleBody = { x: hero.x, y: hero.y, radius: hero.radius };
    moveCircleWithSlide(
      body,
      Math.cos(swing.aimRad) * spec.lungePx,
      Math.sin(swing.aimRad) * spec.lungePx,
      ctx.obsGrid,
    );
    hero.x = body.x;
    hero.y = body.y;
  }

  const ox = hero.x;
  const oy = hero.y;
  const t0 = k / swing.activeTicks;
  const t1 = (k + 1) / swing.activeTicks;
  const a0 = lerp(swing.startAng, swing.endAng, t0);
  const a1 = lerp(swing.startAng, swing.endAng, t1);
  const mid = (a0 + a1) * 0.5;
  const half = Math.abs(a1 - a0) * 0.5 + BANSUNG_MELEE_SWEEP_CONSTANTS.padRad;

  const mods = hero.mods;
  const gacha = hero.gachaMods;
  const swingReach = swing.reach || spec.reach;
  const evoDmgMult = swing.evoDmgMult || 1;
  const gachaDmgMult = gacha?.dmgMult ?? 1;
  const dryMult = swing.charged ? 1 : spec.dryDamageMult;
  const dmgMult =
    dryMult *
    (swing.empowered ? BANSUNG_ACTIVE_EMPOWER_DMG_MULT : 1) *
    (mods?.dmgMul ?? 1) *
    (1 + (mods?.coopAuraDmg ?? 0)) *
    evoDmgMult *
    gachaDmgMult;
  const critChance = spec.critChance + (mods?.critChanceAdd ?? 0) + (gacha?.critChanceAdd ?? 0);
  const stunMs = swing.charged && spec.stunTicks > 0 ? ticksToMs(spec.stunTicks) : 0;

  let meleeHits = 0;
  let bulletsDestroyed = 0;
  let lifestealHp = 0;

  // 1. Enemies inside swept sector
  ctx.actorGrid.queryCircle(
    ox,
    oy,
    swingReach + BANSUNG_MELEE_SWEEP_CONSTANTS.spatialQueryPadPx,
    getTargetLayerMaskForTeam(hero.team),
    tmpMeleeActors,
  );
  const dmgCtx = buildDamageContext(ctx);

  for (let i = 0; i < tmpMeleeActors.length; i++) {
    const a = tmpMeleeActors[i];
    if (!a.alive || a.team === hero.team || swing.hitActorIds.has(a.id)) continue;
    const dx = a.x - ox;
    const dy = a.y - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > swingReach + a.radius) continue;

    const angTol = half + Math.asin(Math.min(1, a.radius / Math.max(8, dist)));
    if (dist > 1e-6 && Math.abs(wrapPi(Math.atan2(dy, dx) - mid)) > angTol) continue;
    if (!hasLineOfSight(ctx.obsGrid, ox, oy, a.x, a.y, 'los')) continue;

    swing.hitActorIds.add(a.id);
    const target = resolveActorTarget(a, ctx);
    if (!target) continue;

    const hitRes = applyCombatHitAndEvents(
      target,
      hero.id,
      {
        baseDmg: spec.damage,
        dmgKind: 'melee',
        affinity: spec.armorMult,
        critChance,
        critMult: spec.critMult * Math.max(0.5, gacha?.critDmgMult ?? 1),
        dmgMult,
        stunMs,
        attackerId: hero.id,
      },
      ctx,
      dmgCtx,
    );

    if (!hitRes.blocked) {
      meleeHits++;
      if (swing.weaponId === 'reaper_scythe') {
        lifestealHp += swing.charged ? 4 : 2;
      }
      applyRadialKnockback(a, ox, oy, spec.knockback, ctx);

      // Shock Baton secondary chain lightning (charged only)
      if (swing.charged && spec.chainRange > 0 && spec.chainDmg > 0) {
        const effChainRange = Math.round(spec.chainRange * (swingReach / Math.max(1, spec.reach)));
        ctx.actorGrid.queryCircle(
          a.x,
          a.y,
          effChainRange,
          getTargetLayerMaskForTeam(hero.team),
          tmpChainActors,
        );
        let bestChain: SpatialActor | undefined;
        let bestD2 = effChainRange * effChainRange + 1e-6;
        for (let j = 0; j < tmpChainActors.length; j++) {
          const cand = tmpChainActors[j];
          if (!cand.alive || cand.team === hero.team || cand.id === a.id) continue;
          if (swing.hitActorIds.has(cand.id)) continue;
          const cdx = cand.x - a.x;
          const cdy = cand.y - a.y;
          const d2 = cdx * cdx + cdy * cdy;
          if (d2 < bestD2 && hasLineOfSight(ctx.obsGrid, a.x, a.y, cand.x, cand.y, 'los')) {
            bestD2 = d2;
            bestChain = cand;
          }
        }
        if (bestChain) {
          swing.hitActorIds.add(bestChain.id);
          const chainTarget = resolveActorTarget(bestChain, ctx);
          if (chainTarget) {
            applyCombatHitAndEvents(
              chainTarget,
              hero.id,
              {
                baseDmg: spec.chainDmg,
                dmgKind: 'energy',
                critChance: 0,
                dmgMult:
                  (mods?.dmgMul ?? 1) *
                  (1 + (mods?.coopAuraDmg ?? 0)) *
                  evoDmgMult *
                  gachaDmgMult,
                stunMs: ticksToMs(spec.chainStunTicks),
                attackerId: hero.id,
              },
              ctx,
              dmgCtx,
            );
            ctx.fx?.push(
              FX_BEAM,
              Math.round(a.x),
              Math.round(a.y),
              Math.round(bestChain.x),
              Math.round(bestChain.y),
              BANSUNG_BEAM_KINDS.shock,
            );
          }
        }
      }
    }
  }

  // 2. Destructibles inside reach
  ctx.obsGrid.queryCircle(ox, oy, swingReach + 16, tmpMeleeObs);
  for (let i = 0; i < tmpMeleeObs.length; i++) {
    const obs = tmpMeleeObs[i];
    if (!obs.alive || !obs.destructible || swing.hitObstacleIds.has(obs.id)) continue;
    const qx = clamp(ox, obs.x, obs.x + obs.w);
    const qy = clamp(oy, obs.y, obs.y + obs.h);
    const dx = qx - ox;
    const dy = qy - oy;
    const d = Math.hypot(dx, dy);
    if (d > swingReach) continue;
    if (d > 1e-6 && Math.abs(wrapPi(Math.atan2(dy, dx) - mid)) > half + 0.35) continue;
    if (!hasLineOfSight(ctx.obsGrid, ox, oy, qx, qy, 'los')) continue;

    swing.hitObstacleIds.add(obs.id);
    damageObstacleDefault(
      obs,
      Math.round(spec.damage * spec.crateMult * dmgMult),
      ctx,
      hero.id,
      'melee',
    );
  }

  // 3. Anti-tunneling enemy bullet destruction (d29)
  if (spec.canDestroyBullets) {
    const bulletHalf = half + BANSUNG_MELEE_SWEEP_CONSTANTS.bulletPadRad;
    let sliceFxSent = 0;

    for (let i = 0; i < ctx.bullets.active.length; i++) {
      const b = ctx.bullets.active[i];
      if (!b.alive || b.team === hero.team || !b.destructibleByMelee || b.z > 18) continue;

      const reach = swingReach + b.radius + BANSUNG_MELEE_SWEEP_CONSTANTS.bulletSliceRadiusPadPx;
      let hit = pointOnSegmentInArc(
        ox,
        oy,
        b.prevX,
        b.prevY,
        b.x,
        b.y,
        reach,
        mid,
        bulletHalf,
      );

      // Also check immediate upcoming tick sub-segment to prevent high-speed sniper tunneling
      if (!hit.hit && (b.vx !== 0 || b.vy !== 0)) {
        const nx = b.x + b.vx * BANSUNG_WEAPON_TICK_DT_S;
        const ny = b.y + b.vy * BANSUNG_WEAPON_TICK_DT_S;
        const nextHit = pointOnSegmentInArc(ox, oy, b.x, b.y, nx, ny, reach, mid, bulletHalf);
        if (nextHit.hit && hasLineOfSight(ctx.obsGrid, ox, oy, nextHit.cx, nextHit.cy, 'los')) {
          hit = nextHit;
        }
      }

      if (!hit.hit) continue;

      b.alive = false;
      bulletsDestroyed++;

      if (ctx.fx && sliceFxSent < BANSUNG_MELEE_SWEEP_CONSTANTS.maxSliceFxPerPlayerPerTick) {
        sliceFxSent++;
        ctx.fx.push(
          FX_IMPACT,
          BANSUNG_IMPACT_KINDS.slice,
          Math.round(hit.cx),
          Math.round(hit.cy),
          quantizeAim(Math.atan2(hit.cy - oy, hit.cx - ox)),
          spec.idx,
        );
      }

      if (spec.bulletEnergyGain > 0 && swing.bulletEnergy < spec.maxBulletEnergy) {
        const gain = Math.min(spec.bulletEnergyGain, spec.maxBulletEnergy - swing.bulletEnergy);
        swing.bulletEnergy += gain;
        if (ctx.grantEnergy) {
          ctx.grantEnergy(hero.id, gain);
        } else {
          grantHeroEnergy(hero, gain);
        }
      }
    }

    if (bulletsDestroyed > 0) {
      ctx.bullets.reap();
    }
  }

  if (k === swing.activeTicks - 1 && swing.recoveryTicks <= 0) {
    hero.activeSwing = null;
  }
  return { bulletsDestroyed, meleeHits, lifestealHp };
}

function executeRangedShot(
  hero: BansungHeroWeaponState,
  slot: BansungWeaponRuntime,
  spec: BansungWeaponSpec,
  shotIndex: number,
  empowered: boolean,
  input: BansungHeroInputState,
  ctx: BansungWeaponWorldContext,
): void {
  const evo = getWeaponEvolutionStats(slot.weaponId, slot.tier);
  if (spec.category === 'kinetic') {
    spawnKineticShot(hero, spec, evo, Boolean(input.moving), empowered, ctx);
  } else if (spec.category === 'explosive') {
    spawnExplosiveShot(hero, spec, evo, shotIndex, input.aimDistPx, empowered, ctx);
  } else if (spec.category === 'energy') {
    spawnEnergyProjectileShot(hero, spec, evo, empowered, ctx);
  }

  // Only consume 1 ammo per round for non-ripple-rocket weapons (bazooka consumes 1 per burst)
  const consumePerRound =
    spec.category === 'explosive' && spec.fireMode === 'ripple_rocket' ? shotIndex === 0 : true;
  if (spec.magSize > 0 && consumePerRound) {
    slot.ammoInMag = Math.max(0, slot.ammoInMag - 1);
  }
}

/**
 * Advances one 30Hz tick for a hero's weapon systems:
 * - cooldowns, swap-lock, passive energy regen, reload progress
 * - queued burst rounds (`smg`, `bazooka`), railgun charge & release
 * - trigger validation (mag + energy checks + auto-reload + dry-fire throttle)
 * - melee swing initiation & optional immediate active sweep
 */
export function tickHeroWeapons(
  hero: BansungHeroWeaponState,
  input: BansungHeroInputState,
  ctx: BansungWeaponWorldContext,
): BansungHeroWeaponTickResult {
  const result: BansungHeroWeaponTickResult = {
    fired: false,
    reloadState: 'idle',
    dryFired: false,
    bulletsDestroyed: 0,
    meleeHits: 0,
  };

  for (let i = 0; i < hero.slotCdTicks.length; i++) {
    if (hero.slotCdTicks[i] > 0) hero.slotCdTicks[i] -= 1;
  }
  if (hero.swapLockTicks > 0) hero.swapLockTicks -= 1;

  tickHeroEnergyRegen(hero, ctx.tickNo);
  result.reloadState = tickHeroReload(hero, ctx.fx);

  if (!hero.alive || hero.downed || hero.stunned) {
    cancelHeroWeaponActions(hero);
    return result;
  }

  const slotIdx = hero.activeSlot;
  const slot = hero.slots[slotIdx];
  if (!slot) {
    hero.burst = null;
    hero.charge = null;
    return result;
  }
  const spec = getWeaponSpec(slot.weaponId);

  // Step active melee swing unless deferred to step 6 in world tick
  if (hero.activeSwing && !ctx.deferMeleeSweep) {
    const mRes = stepHeroMeleeSwing(hero, ctx);
    result.bulletsDestroyed += mRes.bulletsDestroyed;
    result.meleeHits += mRes.meleeHits;
  }

  // Process pending burst queue independently of trigger hold
  if (hero.burst) {
    const burst = hero.burst;
    if (burst.slot !== slotIdx || burst.weaponId !== slot.weaponId) {
      hero.burst = null;
    } else if (burst.waitTicks > 0) {
      burst.waitTicks -= 1;
    } else if (burst.remaining > 0) {
      const burstSpec = getWeaponSpec(burst.weaponId);
      const isRippleRocket =
        burstSpec.category === 'explosive' && burstSpec.fireMode === 'ripple_rocket';
      if (isRippleRocket || burstSpec.magSize <= 0 || slot.ammoInMag > 0) {
        executeRangedShot(hero, slot, burstSpec, burst.shotIndex, burst.empowered, input, ctx);
        result.fired = true;
      }
      burst.remaining -= 1;
      burst.shotIndex += 1;

      const hasAmmoForNext =
        isRippleRocket || burstSpec.magSize <= 0 || slot.ammoInMag > 0;
      if (burst.remaining > 0 && hasAmmoForNext) {
        const stepTicks =
          burstSpec.category === 'kinetic' || burstSpec.category === 'explosive'
            ? burstSpec.burstStepTicks
            : 2;
        burst.waitTicks = Math.max(1, stepTicks);
      } else {
        const burstEvo = getWeaponEvolutionStats(burstSpec.id, slot.tier);
        hero.burst = null;
        hero.slotCdTicks[slotIdx] = getEffectiveCooldownTicks(
          hero,
          burstSpec.cooldownTicks,
          burstEvo.fireRateMult,
        );
        if (burstSpec.magSize > 0 && slot.ammoInMag <= 0) {
          slot.empowered = false;
          startHeroReload(hero, slotIdx, ctx.tickNo, ctx.fx);
        }
      }
    }
    return result;
  }

  // Decay kinetic bloom when not firing a burst
  if (spec.category === 'kinetic' && hero.bloomDeg > 0) {
    hero.bloomDeg = Math.max(0, hero.bloomDeg - spec.bloomDecayDegPerSec * BANSUNG_WEAPON_TICK_DT_S);
  }

  // Handle Railgun charge / release state machine (d28)
  if (spec.category === 'energy' && spec.charge) {
    if (hero.dashing) {
      hero.charge = null;
      return result;
    }
    if (hero.charge) {
      if (hero.charge.slot !== slotIdx || hero.charge.weaponId !== slot.weaponId) {
        hero.charge = null;
      } else if (input.fireHeld) {
        hero.charge.holdTicks = Math.min(RAILGUN_FULL_HOLD_TICKS, hero.charge.holdTicks + 1);
        return result;
      } else {
        const holdTicks = hero.charge.holdTicks;
        hero.charge = null;
        const fired = fireRailgunBeam(hero, slot, spec, holdTicks, ctx.tickNo, ctx);
        result.fired = fired;
        if (!fired) result.dryFired = true;
        return result;
      }
    }
  } else {
    hero.charge = null;
  }

  // Trigger validation when fire is held
  if (!input.fireHeld) return result;
  if (hero.reload || hero.swapLockTicks > 0 || hero.slotCdTicks[slotIdx] > 0 || hero.activeSwing) {
    return result;
  }

  // Melee path (never blocked by 0 energy)
  if (spec.category === 'melee') {
    result.fired = startMeleeSwing(hero, slotIdx, slot, spec, ctx.tickNo, ctx);
    if (result.fired && !ctx.deferMeleeSweep) {
      const mRes = stepHeroMeleeSwing(hero, ctx);
      result.bulletsDestroyed += mRes.bulletsDestroyed;
      result.meleeHits += mRes.meleeHits;
    }
    return result;
  }

  // Ranged magazine & energy gate (d31 + weapon evolution tier)
  const evo = getWeaponEvolutionStats(slot.weaponId, slot.tier);
  const minEnergyRequired =
    spec.category === 'energy' && spec.charge
      ? getEffectiveEnergyCost(hero, spec.charge.minEnergyCost, evo.energyCostMult)
      : getEffectiveEnergyCost(hero, spec.energyCost, evo.energyCostMult);

  if (spec.magSize > 0 && slot.ammoInMag <= 0) {
    startHeroReload(hero, slotIdx, ctx.tickNo, ctx.fx);
    if (hero.energy < minEnergyRequired) {
      emitDryFire(hero, ctx.tickNo, 'energy', ctx);
      result.dryFired = true;
    } else {
      emitDryFire(hero, ctx.tickNo, 'ammo', ctx);
    }
    return result;
  }

  if (hero.energy < minEnergyRequired) {
    emitDryFire(hero, ctx.tickNo, 'energy', ctx);
    result.dryFired = true;
    return result;
  }

  // Begin Railgun charge if held
  if (spec.category === 'energy' && spec.charge) {
    if (hero.dashing) return result;
    hero.charge = {
      slot: slotIdx,
      weaponId: spec.id,
      holdTicks: 1,
    };
    return result;
  }

  // Spend energy atomically before spawning projectiles
  const effEnergyCost = getEffectiveEnergyCost(hero, spec.energyCost, evo.energyCostMult);
  if (effEnergyCost > 0) {
    hero.energy -= effEnergyCost;
    hero.lastEnergySpendTick = ctx.tickNo;
  }

  const empowered = slot.empowered;
  const burstCount =
    spec.category === 'kinetic' || spec.category === 'explosive'
      ? spec.burstCount
      : (spec.burstCount ?? 1);
  const burstStepTicks =
    spec.category === 'kinetic' || spec.category === 'explosive'
      ? spec.burstStepTicks
      : (spec.burstStepTicks ?? 0);

  executeRangedShot(hero, slot, spec, 0, empowered, input, ctx);
  result.fired = true;

  const isRippleRocket = spec.category === 'explosive' && spec.fireMode === 'ripple_rocket';
  if (burstCount > 1 && (isRippleRocket || spec.magSize <= 0 || slot.ammoInMag > 0)) {
    hero.burst = {
      slot: slotIdx,
      weaponId: spec.id,
      remaining: burstCount - 1,
      waitTicks: Math.max(1, burstStepTicks),
      shotIndex: 1,
      empowered,
    };
  } else {
    hero.slotCdTicks[slotIdx] = getEffectiveCooldownTicks(hero, spec.cooldownTicks, evo.fireRateMult);
    if (spec.magSize > 0 && slot.ammoInMag <= 0) {
      slot.empowered = false;
      startHeroReload(hero, slotIdx, ctx.tickNo, ctx.fx);
    }
  }

  return result;
}

// ============================================================================
// 8. 30Hz Projectile Stepping, Homing, Chains, Fireball Split & Blasts
// ============================================================================

function resolveRocketMultiHitScale(
  b: BansungProjectile,
  targetActorId: number,
  tickNo: number,
  pool: BansungBulletPool,
): number {
  if (b.kind !== 'rocket') return 1;
  const key = (b.ownerIdx << 24) ^ targetActorId;
  const prev = pool.recentRocketHits.get(key);
  let hitCount = 1;
  if (prev && tickNo - prev.tick <= ROCKET_MULTIHIT_WINDOW_TICKS) {
    hitCount = prev.count + 1;
  }
  pool.recentRocketHits.set(key, { tick: tickNo, count: hitCount });
  const decay = BANSUNG_EXPLOSIVE_COOP_RULES.rocketMultiHitDecay;
  return decay[Math.min(decay.length - 1, hitCount - 1)] ?? 0.7;
}

function detonateExplosiveProjectile(
  b: BansungProjectile,
  ctx: BansungWeaponWorldContext,
): void {
  if (!b.alive) return;
  b.alive = false;

  const bx = b.x;
  const by = b.y;
  const blastR = Math.max(1, b.blastRadius);
  const targetMask = getTargetLayerMaskForTeam(b.team);
  const dmgCtx = buildDamageContext(ctx);

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, bx, by, blastR, 'los', targetMask, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const entry = tmpAoeTargets[i];
    const a = entry.actor;
    if (a.team === b.team) continue;

    const target = resolveActorTarget(a, ctx);
    if (!target) continue;

    const falloff = computeBlastFalloff(entry.edgeDist, b.coreRadius, blastR, b.outerFalloffMin);
    const stunFalloff = computeBlastFalloff(entry.edgeDist, b.coreRadius, blastR, b.stunFalloffMin);
    const rocketDecay = resolveRocketMultiHitScale(b, a.id, ctx.tickNo, ctx.bullets);
    const stunMs = b.stunMs > 0 ? Math.round(b.stunMs * stunFalloff) : 0;

    const hitRes = applyCombatHitAndEvents(
      target,
      b.ownerId,
      {
        baseDmg: b.baseDmg * b.blastDmgScale * rocketDecay,
        dmgKind: 'explosive',
        affinity: b.affinity,
        critChance: b.critChance,
        critMult: b.critMult,
        dmgMult: b.dmgMult * falloff,
        stunMs,
        attackerId: b.ownerId,
      },
      ctx,
      dmgCtx,
      true,
    );

    if (!hitRes.blocked && b.knockback > 0) {
      applyRadialKnockback(a, bx, by, b.knockback * falloff, ctx);
    }
  }

  // Co-op non-lethal self-knockback (35%, 0 self-damage)
  if (b.team === 0 && b.knockback > 0 && BANSUNG_EXPLOSIVE_COOP_RULES.selfKnockbackPct > 0) {
    ctx.actorGrid.queryCircle(bx, by, blastR, LAYER_PLAYER, tmpMineActors);
    for (let i = 0; i < tmpMineActors.length; i++) {
      const p = tmpMineActors[i];
      if (p.team !== b.team) continue;
      const dist = Math.hypot(p.x - bx, p.y - by);
      const edgeDist = Math.max(0, dist - p.radius);
      if (edgeDist >= blastR) continue;
      const falloff = computeBlastFalloff(edgeDist, b.coreRadius, blastR, b.outerFalloffMin);
      applyRadialKnockback(
        p,
        bx,
        by,
        b.knockback * falloff * BANSUNG_EXPLOSIVE_COOP_RULES.selfKnockbackPct,
        ctx,
        true,
      );
    }
  }

  // Destructible crates / explosive barrels inside blast radius
  queryAoeObstacles(ctx.obsGrid, bx, by, blastR, 'los', tmpAoeObstacles);
  for (let i = 0; i < tmpAoeObstacles.length; i++) {
    const oTarget = tmpAoeObstacles[i];
    const falloff = computeBlastFalloff(
      oTarget.edgeDist,
      b.coreRadius,
      blastR,
      b.outerFalloffMin,
    );
    damageObstacleDefault(
      oTarget.obstacle,
      Math.max(1, Math.round(b.baseDmg * b.blastDmgScale * b.dmgMult * falloff)),
      ctx,
      b.ownerId,
      'explosive',
    );
  }

  // Frag grenade 6-shrapnel burst or Cluster RPG 4-bomblet split
  if (b.shrapnelCount > 0 && b.shrapnelDamage > 0) {
    const rng = ctx.rng ?? Math.random;
    const isCluster = b.kind === 'cluster_rocket';
    const step = (Math.PI * 2) / b.shrapnelCount;
    for (let i = 0; i < b.shrapnelCount; i++) {
      const ang = step * i + (rng() * 2 - 1) * (12 * DEG_TO_RAD);
      ctx.bullets.spawn({
        kind: isCluster ? 'cluster_sub_proj' : 'frag_shrapnel',
        team: b.team,
        ownerId: b.ownerId,
        ownerIdx: b.ownerIdx,
        weaponId: b.weaponId,
        x: bx,
        y: by,
        vx: Math.cos(ang) * b.shrapnelSpeed,
        vy: Math.sin(ang) * b.shrapnelSpeed,
        ttlTicks: b.shrapnelTtlTicks || undefined,
        dmgKind: isCluster ? 'explosive' : 'kinetic',
        baseDmg: b.shrapnelDamage,
        affinity: [1, 1],
        dmgMult: b.dmgMult,
        empowered: b.empowered,
        ...(isCluster
          ? {
              isExplosive: true,
              blastRadius: 48,
              coreRadius: 16,
              outerFalloffMin: 0.45,
            }
          : {}),
      });
    }
  }

  ctx.fx?.push(
    FX_BLAST,
    getProjectileBlastKind(b.kind),
    Math.round(bx),
    Math.round(by),
    Math.round(blastR),
    b.ownerIdx,
  );
}

function explodeArcaneFireball(
  b: BansungProjectile,
  splitBaseAngle: number,
  ctx: BansungWeaponWorldContext,
): void {
  if (!b.alive) return;
  b.alive = false;

  const bx = b.x;
  const by = b.y;
  const blastR = Math.max(1, b.blastRadius);
  const targetMask = getTargetLayerMaskForTeam(b.team);
  const dmgCtx = buildDamageContext(ctx);
  const burnTickDmg = Math.max(1, Math.round((b.burnDps || 12) * 0.5));

  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, bx, by, blastR, 'los', targetMask, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const entry = tmpAoeTargets[i];
    const a = entry.actor;
    if (a.team === b.team) continue;
    const target = resolveActorTarget(a, ctx);
    if (!target) continue;

    const falloff = computeBlastFalloff(entry.edgeDist, b.coreRadius, blastR, b.outerFalloffMin);
    const hitRes = applyCombatHitAndEvents(
      target,
      b.ownerId,
      {
        baseDmg: b.baseDmg,
        dmgKind: 'fire',
        affinity: b.affinity,
        critChance: b.critChance,
        critMult: b.critMult,
        dmgMult: b.dmgMult * falloff,
        attackerId: b.ownerId,
      },
      ctx,
      dmgCtx,
      true,
    );
    if (!hitRes.blocked && target.alive && !target.downed) {
      applyDot(target, 'burn', b.ownerId, {
        durMs: b.burnMs || 2500,
        tickDmgOverride: burnTickDmg,
      });
      if (b.knockback > 0) {
        applyRadialKnockback(a, bx, by, b.knockback * falloff, ctx);
      }
    }
  }

  queryAoeObstacles(ctx.obsGrid, bx, by, blastR, 'los', tmpAoeObstacles);
  for (let i = 0; i < tmpAoeObstacles.length; i++) {
    const oTarget = tmpAoeObstacles[i];
    const falloff = computeBlastFalloff(
      oTarget.edgeDist,
      b.coreRadius,
      blastR,
      b.outerFalloffMin,
    );
    damageObstacleDefault(
      oTarget.obstacle,
      Math.max(1, Math.round(b.baseDmg * b.dmgMult * falloff)),
      ctx,
      b.ownerId,
      'fire',
    );
  }

  // Split 3 arcane_ember child bolts at [-38, 0, +38] deg (child embers never re-split)
  if (b.splitEmberCount > 0 && b.splitEmberSpeed > 0) {
    const splashCfg = (BANSUNG_WEAPONS.arcane_book as BansungEnergyWeaponSpec).splash!;
    const angles = splashCfg.splitAnglesDeg;
    for (let i = 0; i < Math.min(b.splitEmberCount, angles.length); i++) {
      const ang = splitBaseAngle + angles[i] * DEG_TO_RAD;
      ctx.bullets.spawn({
        kind: 'arcane_ember',
        team: b.team,
        ownerId: b.ownerId,
        ownerIdx: b.ownerIdx,
        weaponId: b.weaponId,
        x: bx,
        y: by,
        vx: Math.cos(ang) * b.splitEmberSpeed,
        vy: Math.sin(ang) * b.splitEmberSpeed,
        maxRange: b.splitEmberRange,
        dmgKind: 'fire',
        baseDmg: 10,
        affinity: [b.splitEmberDmg[0] / 10, b.splitEmberDmg[1] / 10],
        dmgMult: b.dmgMult,
        empowered: b.empowered,
        isEnergy: true,
      });
    }
  }

  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_KINDS.fireball,
    Math.round(bx),
    Math.round(by),
    Math.round(blastR),
    b.ownerIdx,
  );
}

function applySlowEffect(target: BansungCombatTarget, slowPct: number, slowMs: number): void {
  if (slowPct <= 0 || slowMs <= 0 || !target.alive || target.downed) return;
  const isBoss = target.tier === 'boss';
  const effPct = Math.min(0.7, slowPct * (isBoss ? 0.55 : 1));
  const effMs = Math.round(slowMs * (isBoss ? 0.65 : 1));
  target.slowPct = Math.max(target.slowPct ?? 0, effPct);
  target.slowMs = Math.max(target.slowMs ?? 0, effMs);
}

function pullActorsTowardPoint(
  cx: number,
  cy: number,
  radius: number,
  maxImpulse: number,
  team: number,
  ctx: BansungWeaponWorldContext,
): void {
  if (!ctx.applyKnockback || radius <= 0 || maxImpulse <= 0) return;
  const targetMask = getTargetLayerMaskForTeam(team);
  ctx.actorGrid.queryCircle(cx, cy, radius, targetMask, tmpMineActors);
  for (let i = 0; i < tmpMineActors.length; i++) {
    const a = tmpMineActors[i];
    if (!a.alive || a.team === team) continue;
    const dx = cx - a.x;
    const dy = cy - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 6) continue;
    const falloff = 0.55 + 0.45 * (1 - Math.min(1, dist / radius));
    const speed = Math.min(maxImpulse * falloff, dist * 4.2);
    ctx.applyKnockback(a.id, (dx / dist) * speed, (dy / dist) * speed, false);
  }
}

function triggerCryoChillAoE(
  b: BansungProjectile,
  ctx: BansungWeaponWorldContext,
  dmgCtx: BansungDamageContext,
): void {
  const splashR = b.slowSplashRadius;
  if (splashR <= 0 || b.slowPct <= 0) return;
  const targetMask = getTargetLayerMaskForTeam(b.team);
  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, b.x, b.y, splashR, 'los', targetMask, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const a = tmpAoeTargets[i].actor;
    if (a.team === b.team) continue;
    const t = resolveActorTarget(a, ctx);
    if (!t) continue;
    if (!b.hitIds.has(a.id)) {
      applyCombatHitAndEvents(
        t,
        b.ownerId,
        {
          baseDmg: b.baseDmg * 0.4,
          dmgKind: b.dmgKind,
          affinity: b.affinity,
          dmgMult: b.dmgMult,
          attackerId: b.ownerId,
        },
        ctx,
        dmgCtx,
        true,
      );
    }
    applySlowEffect(t, b.slowPct, b.slowMs);
  }
  ctx.fx?.push(
    FX_IMPACT,
    BANSUNG_IMPACT_KINDS.spark,
    Math.round(b.x),
    Math.round(b.y),
    0,
    b.kindId,
  );
}

function triggerGravitySingularity(
  b: BansungProjectile,
  ctx: BansungWeaponWorldContext,
  dmgCtx: BansungDamageContext,
): void {
  if (!b.alive) return;
  b.alive = false;
  const pullR = Math.max(b.pullRadius, b.blastRadius, 120);
  pullActorsTowardPoint(b.x, b.y, pullR, Math.max(260, b.pullImpulse), b.team, ctx);

  const blastR = Math.max(80, b.blastRadius);
  const targetMask = getTargetLayerMaskForTeam(b.team);
  queryAoeTargets(ctx.actorGrid, ctx.obsGrid, b.x, b.y, blastR, 'los', targetMask, tmpAoeTargets);
  for (let i = 0; i < tmpAoeTargets.length; i++) {
    const entry = tmpAoeTargets[i];
    const a = entry.actor;
    if (a.team === b.team) continue;
    const t = resolveActorTarget(a, ctx);
    if (!t) continue;
    const falloff = computeBlastFalloff(entry.edgeDist, 24, blastR, 0.45);
    applyCombatHitAndEvents(
      t,
      b.ownerId,
      {
        baseDmg: b.baseDmg * (b.hitIds.has(a.id) ? 0.55 : 0.9),
        dmgKind: 'energy',
        affinity: b.affinity,
        critChance: b.critChance,
        critMult: b.critMult,
        dmgMult: b.dmgMult * falloff,
        attackerId: b.ownerId,
      },
      ctx,
      dmgCtx,
      true,
    );
  }
  ctx.fx?.push(
    FX_BLAST,
    BANSUNG_BLAST_KINDS.stun,
    Math.round(b.x),
    Math.round(b.y),
    Math.round(blastR),
    b.ownerIdx,
  );
}

function tryDetonateTerminalProjectile(
  b: BansungProjectile,
  ang: number,
  ctx: BansungWeaponWorldContext,
  dmgCtx: BansungDamageContext,
  res: BansungProjectileStepResult,
): boolean {
  if (b.isExplosive && b.kind !== 'prox_mine') {
    detonateExplosiveProjectile(b, ctx);
    res.blasts++;
    return true;
  }
  if (b.kind === 'arcane_fireball') {
    explodeArcaneFireball(b, ang, ctx);
    res.blasts++;
    return true;
  }
  if (b.kind === 'gravity_orb' || b.kind === 'void_cannon_orb') {
    triggerGravitySingularity(b, ctx, dmgCtx);
    res.blasts++;
    return true;
  }
  if (b.kind === 'cryo_shard') {
    triggerCryoChillAoE(b, ctx, dmgCtx);
  }
  return false;
}

function triggerThunderChain(
  b: BansungProjectile,
  primaryActor: SpatialActor,
  ctx: BansungWeaponWorldContext,
  dmgCtx: BansungDamageContext,
): void {
  if (b.chainMaxHops <= 0 || b.chainRadius <= 0) return;

  let curX = primaryActor.x;
  let curY = primaryActor.y;
  const visited = new Set<number>(b.hitIds);
  visited.add(primaryActor.id);
  const targetMask = getTargetLayerMaskForTeam(b.team);

  for (let hop = 1; hop <= b.chainMaxHops; hop++) {
    ctx.actorGrid.queryCircle(curX, curY, b.chainRadius, targetMask, tmpChainActors);
    let best: SpatialActor | undefined;
    let bestD2 = b.chainRadius * b.chainRadius + 1e-6;

    for (let i = 0; i < tmpChainActors.length; i++) {
      const cand = tmpChainActors[i];
      if (!cand.alive || cand.team === b.team || visited.has(cand.id)) continue;
      const dx = cand.x - curX;
      const dy = cand.y - curY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2 && hasLineOfSight(ctx.obsGrid, curX, curY, cand.x, cand.y, 'los')) {
        bestD2 = d2;
        best = cand;
      }
    }
    if (!best) break;

    visited.add(best.id);
    const hopTarget = resolveActorTarget(best, ctx);
    const hopMult = b.dmgMult * Math.pow(b.chainDmgDecay, hop);
    if (hopTarget) {
      applyCombatHitAndEvents(
        hopTarget,
        b.ownerId,
        {
          baseDmg: b.baseDmg,
          dmgKind: 'energy',
          affinity: b.affinity,
          critChance: 0,
          dmgMult: hopMult,
          stunMs: b.chainHopStunMs,
          attackerId: b.ownerId,
        },
        ctx,
        dmgCtx,
      );
    }

    ctx.fx?.push(
      FX_BEAM,
      Math.round(curX),
      Math.round(curY),
      Math.round(best.x),
      Math.round(best.y),
      BANSUNG_BEAM_KINDS.chain,
    );
    curX = best.x;
    curY = best.y;
  }
}

function steerHomingProjectile(
  b: BansungProjectile,
  ctx: BansungWeaponWorldContext,
): void {
  if (!b.isHoming || b.homingTurnRateRadPerS <= 0 || b.homingDetectRange <= 0) return;
  const spd = Math.hypot(b.vx, b.vy);
  if (spd <= 1e-6) return;

  const fx = b.vx / spd;
  const fy = b.vy / spd;
  const targetMask = getTargetLayerMaskForTeam(b.team);
  ctx.actorGrid.queryCircle(b.x, b.y, b.homingDetectRange, targetMask, tmpHomingActors);

  let best: SpatialActor | undefined;
  let bestD2 = b.homingDetectRange * b.homingDetectRange + 1e-6;
  for (let i = 0; i < tmpHomingActors.length; i++) {
    const a = tmpHomingActors[i];
    if (!a.alive || a.team === b.team || b.hitIds.has(a.id)) continue;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1e-6 || d2 >= bestD2) continue;
    const invD = 1 / Math.sqrt(d2);
    const cos = (dx * fx + dy * fy) * invD;
    if (cos < b.homingConeCos) continue;
    if (!hasLineOfSight(ctx.obsGrid, b.x, b.y, a.x, a.y, 'los')) continue;
    bestD2 = d2;
    best = a;
  }

  if (!best) return;
  const curAng = Math.atan2(b.vy, b.vx);
  const desiredAng = Math.atan2(best.y - b.y, best.x - b.x);
  const maxTurn = b.homingTurnRateRadPerS * BANSUNG_WEAPON_TICK_DT_S;
  const delta = clamp(wrapPi(desiredAng - curAng), -maxTurn, maxTurn);
  const nextAng = curAng + delta;
  b.vx = Math.cos(nextAng) * spd;
  b.vy = Math.sin(nextAng) * spd;
}

/**
 * Advances all active projectiles in `pool` by one 30Hz tick:
 * - Rocket acceleration & Thunder Orb cone-homing steering
 * - Lobbed grenade & proximity mine Z-axis gravity/ground-bounce
 * - Proximity mine arming, enemy trigger check & delayed blast
 * - Swept segment collision against walls/destructibles and actors (pierce/ricochet)
 * - Radial blast falloff, frag shrapnel, plasma crit burn, chain arcs, arcane embers
 */
export function stepBulletPool(
  pool: BansungBulletPool,
  ctx: BansungWeaponWorldContext,
): BansungProjectileStepResult {
  const res: BansungProjectileStepResult = {
    activeAfter: 0,
    actorHits: 0,
    obstacleHits: 0,
    blasts: 0,
    expired: 0,
  };
  const dmgCtx = buildDamageContext(ctx);
  const dt = BANSUNG_WEAPON_TICK_DT_S;

  // Snapshot count so child spawns (shrapnel / arcane embers) wait until next tick
  const initialCount = pool.active.length;
  for (let i = 0; i < initialCount; i++) {
    const b = pool.active[i];
    if (!b.alive) continue;

    b.prevX = b.x;
    b.prevY = b.y;
    b.ageTicks += 1;
    b.ttlTicks -= 1;

    if (b.ttlTicks <= 0) {
      const ang = b.vx === 0 && b.vy === 0 ? 0 : Math.atan2(b.vy, b.vx);
      if (!tryDetonateTerminalProjectile(b, ang, ctx, dmgCtx, res)) {
        b.alive = false;
        res.expired++;
      }
      continue;
    }

    if (b.kind === 'gravity_orb' && b.pullRadius > 0 && b.ageTicks % 4 === 0) {
      pullActorsTowardPoint(b.x, b.y, b.pullRadius * 0.65, b.pullImpulse * 0.42, b.team, ctx);
    }

    // Rocket acceleration
    if (b.trajectory === 'rocket' && b.accel > 0) {
      const curSpd = Math.hypot(b.vx, b.vy);
      if (curSpd > 1e-6 && curSpd < b.maxSpeed) {
        const nextSpd = Math.min(b.maxSpeed, curSpd + b.accel * dt);
        const scale = nextSpd / curSpd;
        b.vx *= scale;
        b.vy *= scale;
      }
    }

    // Homing steering
    if (b.trajectory === 'homing') {
      steerHomingProjectile(b, ctx);
    }

    // Z-axis gravity & ground bounce for lobbed shells and mines
    if (b.trajectory === 'lob' || b.trajectory === 'mine') {
      if (b.z > 0 || b.vz !== 0) {
        b.z += b.vz * dt;
        b.vz -= b.gravityZ * dt;
        if (b.z <= 0) {
          b.z = 0;
          if (b.trajectory === 'lob' && b.bouncesLeft > 0) {
            b.vz = Math.abs(b.vz) * BANSUNG_EXPLOSIVE_COOP_RULES.lobGroundBounceVZMult;
            b.vx *= BANSUNG_EXPLOSIVE_COOP_RULES.lobGroundBounceHorizMult;
            b.vy *= BANSUNG_EXPLOSIVE_COOP_RULES.lobGroundBounceHorizMult;
            b.bouncesLeft -= 1;
          } else {
            b.vz = 0;
            if (b.trajectory === 'mine') {
              b.vx = 0;
              b.vy = 0;
            }
          }
        }
      }
    }

    // Proximity mine arming & trigger FSM
    if (b.kind === 'prox_mine') {
      if (b.mineState === 0 && b.z <= 0) {
        if (b.mineArmTicksLeft > 0) b.mineArmTicksLeft -= 1;
        if (b.mineArmTicksLeft <= 0) b.mineState = 1;
      } else if (b.mineState === 1) {
        ctx.actorGrid.queryCircle(
          b.x,
          b.y,
          b.mineTriggerRadius,
          getTargetLayerMaskForTeam(b.team),
          tmpMineActors,
        );
        for (let m = 0; m < tmpMineActors.length; m++) {
          const cand = tmpMineActors[m];
          if (cand.alive && cand.team !== b.team) {
            b.mineState = 2;
            break;
          }
        }
      } else if (b.mineState === 2) {
        if (b.mineDetonateTicksLeft > 0) b.mineDetonateTicksLeft -= 1;
        if (b.mineDetonateTicksLeft <= 0) {
          detonateExplosiveProjectile(b, ctx);
          res.blasts++;
          continue;
        }
      }
    }

    if (b.vx === 0 && b.vy === 0) continue;

    // Swept XY integration
    tmpBulletInput.x = b.x;
    tmpBulletInput.y = b.y;
    tmpBulletInput.vx = b.vx;
    tmpBulletInput.vy = b.vy;
    tmpBulletInput.radius = b.radius;
    tmpBulletInput.team = b.team;
    tmpBulletInput.layerMask = b.contactDetonate ? getTargetLayerMaskForTeam(b.team) : 0;
    tmpBulletInput.maxHits = b.pierceLeft;
    tmpBulletInput.bouncesLeft = b.bouncesLeft;
    tmpBulletInput.hitIds = b.hitIds;
    tmpBulletInput.friendlyHeal = false;

    const sweep = stepSweptBullet(ctx.obsGrid, ctx.actorGrid, tmpBulletInput, dt, tmpSweepResult);
    b.x = sweep.endX;
    b.y = sweep.endY;
    b.vx = tmpBulletInput.vx;
    b.vy = tmpBulletInput.vy;

    if (sweep.bouncesUsed > 0 && b.restitution > 0 && b.restitution < 1) {
      const restScale = Math.pow(b.restitution, sweep.bouncesUsed);
      b.vx *= restScale;
      b.vy *= restScale;
    }
    b.bouncesLeft = tmpBulletInput.bouncesLeft ?? 0;

    // Apply obstacle hits (destructibles & wall sparks)
    for (let oh = 0; oh < sweep.obstacleHits.length; oh++) {
      const obsHit = sweep.obstacleHits[oh];
      res.obstacleHits++;
      if (!b.isExplosive && b.kind !== 'arcane_fireball') {
        damageObstacleDefault(obsHit.obstacle, b.baseDmg * b.dmgMult, ctx, b.ownerId, b.dmgKind);
      }
    }

    const segDist = Math.hypot(b.x - b.prevX, b.y - b.prevY);
    const startTraveled = b.traveledPx;
    b.traveledPx += segDist;

    // Process swept actor hits
    for (let ah = 0; ah < sweep.actorHits.length; ah++) {
      const hit = sweep.actorHits[ah];
      res.actorHits++;

      if (b.isExplosive) {
        b.x = hit.x;
        b.y = hit.y;
        detonateExplosiveProjectile(b, ctx);
        res.blasts++;
        break;
      }

      if (b.kind === 'arcane_fireball') {
        b.x = hit.x;
        b.y = hit.y;
        explodeArcaneFireball(b, Math.atan2(b.vy, b.vx), ctx);
        res.blasts++;
        break;
      }

      const isFriendlyFireActor = b.team === 0 && (hit.actor.layer & LAYER_PLAYER) !== 0;
      const target = isFriendlyFireActor ? undefined : resolveActorTarget(hit.actor, ctx);
      if (target && !(b.team === 0 && target.tier === 'hero')) {
        let rangeFalloff = 1;
        if (b.falloff && b.maxRange > b.falloff.startPx) {
          const hitTraveled = startTraveled + segDist * hit.t;
          if (hitTraveled > b.falloff.startPx) {
            const u = clamp(
              (hitTraveled - b.falloff.startPx) / Math.max(1, b.maxRange - b.falloff.startPx),
              0,
              1,
            );
            rangeFalloff = lerp(1, b.falloff.minMult, u);
          }
        }

        const hasDotOverride =
          b.dotTickDmgOverride !== undefined || b.dotDurMs !== undefined;
        const hitRes = applyCombatHitAndEvents(
          target,
          b.ownerId,
          {
            baseDmg: b.baseDmg,
            dmgKind: b.dmgKind,
            affinity: b.affinity,
            armorPen: b.armorPen,
            armorPiercePct: b.armorPiercePct,
            critChance: b.critChance,
            critMult: b.critMult,
            dmgMult: b.dmgMult * rangeFalloff,
            stunMs: b.stunMs,
            dotKind: hasDotOverride ? undefined : b.dotKind,
            attackerId: b.ownerId,
          },
          ctx,
          dmgCtx,
        );

        if (!hitRes.blocked) {
          if (b.knockback > 0) {
            applyRadialKnockback(hit.actor, b.prevX, b.prevY, b.knockback, ctx);
          }
          if (b.slowPct > 0 && b.slowMs > 0) {
            applySlowEffect(target, b.slowPct, b.slowMs);
          }
          if (!hitRes.killed && hasDotOverride && b.dotKind && target.alive && !target.downed) {
            applyDot(target, b.dotKind, b.ownerId, {
              ...dmgCtx,
              ...(b.dotDurMs !== undefined ? { durMs: b.dotDurMs } : {}),
              ...(b.dotTickDmgOverride !== undefined
                ? { tickDmgOverride: b.dotTickDmgOverride }
                : {}),
            });
          }
          if (hitRes.isCrit && b.critBurn && target.alive && !target.downed) {
            applyDot(target, 'burn', b.ownerId, {
              durMs: b.critBurn.durationMs,
              tickDmgOverride: Math.max(1, Math.round(b.critBurn.dps * 0.5)),
            });
          }
          if (
            (b.kind === 'thunder_orb' ||
              b.kind === 'electric_arc_bolt' ||
              b.kind === 'tesla_arc') &&
            b.chainMaxHops > 0
          ) {
            triggerThunderChain(b, hit.actor, ctx, dmgCtx);
          }
          if (
            b.kind === 'cryo_shard' ||
            b.kind === 'blizzard_bolt' ||
            (b.slowSplashRadius > 0 && b.slowPct > 0)
          ) {
            b.x = hit.x;
            b.y = hit.y;
            triggerCryoChillAoE(b, ctx, dmgCtx);
          } else if (b.kind === 'gravity_orb' || b.kind === 'void_cannon_orb') {
            b.x = hit.x;
            b.y = hit.y;
            triggerGravitySingularity(b, ctx, dmgCtx);
            res.blasts++;
            break;
          }
          ctx.fx?.push(
            FX_IMPACT,
            b.isEnergy ? BANSUNG_IMPACT_KINDS.spark : BANSUNG_IMPACT_KINDS.flesh,
            Math.round(hit.x),
            Math.round(hit.y),
            quantizeAim(Math.atan2(b.vy, b.vx)),
            b.kindId,
          );
        }
      }

      b.pierceLeft -= 1;
      if (b.pierceLeft <= 0) {
        b.alive = false;
        break;
      }
    }

    if (!b.alive) continue;

    // Obstacle stop handling (wall impact without remaining bounces)
    if (sweep.stopped && sweep.stoppedBy === 'obstacle') {
      if (b.trajectory === 'mine') {
        b.vx = 0;
        b.vy = 0;
      } else {
        const lastObsHit = sweep.obstacleHits[sweep.obstacleHits.length - 1];
        let splitAng = Math.atan2(b.vy, b.vx) + Math.PI;
        if (lastObsHit) {
          const vn = b.vx * lastObsHit.nx + b.vy * lastObsHit.ny;
          const rvx = b.vx - 2 * vn * lastObsHit.nx;
          const rvy = b.vy - 2 * vn * lastObsHit.ny;
          if (rvx !== 0 || rvy !== 0) splitAng = Math.atan2(rvy, rvx);
        }
        if (tryDetonateTerminalProjectile(b, splitAng, ctx, dmgCtx, res)) {
          continue;
        }
        b.alive = false;
        res.expired++;
        ctx.fx?.push(
          FX_IMPACT,
          BANSUNG_IMPACT_KINDS.wall,
          Math.round(b.x),
          Math.round(b.y),
          quantizeAim(Math.atan2(b.vy, b.vx)),
          b.kindId,
        );
        continue;
      }
    }

    // Range cap check
    if (b.maxRange > 0 && b.traveledPx >= b.maxRange) {
      const ang = Math.atan2(b.vy, b.vx);
      if (!tryDetonateTerminalProjectile(b, ang, ctx, dmgCtx, res)) {
        b.alive = false;
        res.expired++;
      }
    }
  }

  // Prune stale rocket multi-hit entries every ~30 ticks
  if (pool.recentRocketHits.size > 0 && ctx.tickNo % 30 === 0) {
    for (const [k, v] of pool.recentRocketHits) {
      if (ctx.tickNo - v.tick > ROCKET_MULTIHIT_WINDOW_TICKS) {
        pool.recentRocketHits.delete(k);
      }
    }
  }

  pool.reap();
  res.activeAfter = pool.count;
  return res;
}
