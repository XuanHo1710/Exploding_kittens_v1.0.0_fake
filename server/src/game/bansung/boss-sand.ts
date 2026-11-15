/**
 * Wave-4 / Desert Boss 1: Sand Beholder — King Cactus (`boss_beholder`)
 * Authoritative 2-phase 30Hz FSM, stagger gauge, radial spiral volleys,
 * dash-evadable leap slam stun shockwave, pillar-occluded eye-beam sweep,
 * and Phase-2 Scarab/Spitter add requests (`d37`).
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_EFLAG_ARMORED,
  BANSUNG_EFLAG_BURNING,
  BANSUNG_EFLAG_HIT_FLASH,
  BANSUNG_EFLAG_LEFT,
  BANSUNG_EFLAG_SHIELDED,
  BANSUNG_EFLAG_STUNNED,
  BANSUNG_EFLAG_TELEGRAPH,
  BANSUNG_FX_BEAM_BOSS_EYE,
  BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
  BANSUNG_LOOT_TABLES,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BANSUNG_WAVES,
  BOSS_BEHOLDER_CFG,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  computeBossHpMult,
  quantizeAim,
  ticksToMs,
  wrapPi,
  type BansungBossFrame,
  type BansungDifficulty,
  type BansungDifficultyKey,
  type BansungEnemyId,
  type BansungTelegraph,
  type BansungUnitState,
  type BeholderState,
  type BossSandBeholderState,
} from '../../../../shared/src';
import {
  BANSUNG_DAMAGE_KIND_INDEX,
  BANSUNG_DMG_FLAG_IMMUNE,
  applyBansungDamage,
  applyDot,
  tickStatuses,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageHit,
  type BansungDamageKind,
  type BansungDamageResult,
  type BansungDmgEvent,
} from './damage';
import {
  ObstacleGrid,
  checkMuzzleWallGuard,
  distPointToSegmentSq,
  hasLineOfSight,
  moveCircleWithSlide,
  queryAoeObstacles,
  raycastObstacles,
  resolveObstacles,
  type AoeObstacleTarget,
  type ArenaObstacle,
  type CircleBody,
} from './spatial';

// ============================================================================
// 1. Constants & Tuning (d37)
// ============================================================================

const DT = 1 / BANSUNG_TICK_HZ;
const DEG_TO_RAD = Math.PI / 180;

const RETARGET_INTERVAL_TICKS = 45;
const UNSEEN_RETARGET_TICKS = 90;
const SLAM_MAX_LEAP_PX = 220;
const SLAM_TRIGGER_RANGE_PX = 220;
const SLAM_ARC_HEIGHT_PX = 44;

const VOLLEY_TICKS_P1 = 28;
const VOLLEY_RING_A_TICK_P1 = 15;
const VOLLEY_RING_B_TICK_P1 = 26;
const VOLLEY_COUNT_P1 = 12;
const VOLLEY_OFFSET_P1_RAD = 15 * DEG_TO_RAD;
const VOLLEY_SPEED_P1 = 240;
const VOLLEY_DMG_P1 = 14;

const VOLLEY_TICKS_P2 = 34;
const VOLLEY_RING_TICKS_P2: readonly number[] = [14, 22, 30];
const VOLLEY_COUNT_P2 = 14;
const VOLLEY_TWIST_P2_RAD = 12 * DEG_TO_RAD;
const VOLLEY_SPEED_P2 = 270;
const VOLLEY_DMG_P2 = 16;

const THORN_RADIUS_PX = 7;
const THORN_TTL_TICKS = 84;
const VOLLEY_GLOW_RADIUS_PX = 48;

const SLAM_TICKS_P1 = 26;
const SLAM_TICKS_P2 = 24;
const SLAM_CROUCH_TICKS_P2 = 10;
const SLAM_INNER_RADIUS_PX = 85;
const SLAM_DMG_INNER = 26;
const SLAM_DMG_OUTER = 16;
const SLAM_KNOCKBACK_SPEED = 260;
const SLAM_STUN_TICKS_P1 = 33;
const SLAM_STUN_TICKS_P2 = 36;
const SLAM_SHARDS_P1 = 4;
const SLAM_SHARD_SPEED = 200;
const SLAM_SHARD_DMG = 10;
const SLAM_SPIKES_P2 = 6;
const SLAM_SPIKE_SPEED = 220;
const SLAM_SPIKE_DMG = 12;
const SLAM_DEBRIS_RADIUS_PX = 6;
const SLAM_DEBRIS_TTL_TICKS = 75;

const BEAM_WINDUP_TICKS = 27;
const BEAM_SWEEP_TICKS = 42;
const BEAM_HALF_SPAN_P1_RAD = 42 * DEG_TO_RAD;
const BEAM_HALF_SPAN_P2_RAD = 52.5 * DEG_TO_RAD;
const BEAM_STEP_P1_RAD = 2.0 * DEG_TO_RAD;
const BEAM_STEP_P2_RAD = 2.5 * DEG_TO_RAD;
const BEAM_HIT_INTERVAL_TICKS = 3;
const BEAM_TICK_DMG = 9;
const BEAM_BURN_TICKS = 12;
const BEAM_BURN_DPS = 4;
const BEAM_BURN_TICK_DMG = 2; // 2 dmg per 500ms DOT tick = 4 DPS
const BEAM_ORB_INTERVAL_TICKS = 7;
const BEAM_ORB_SPEED = 130;
const BEAM_ORB_DMG = 12;
const BEAM_ORB_RADIUS_PX = 7;
const BEAM_ORB_TTL_TICKS = 90;
const BEAM_ORB_SPREAD_RAD = 16 * DEG_TO_RAD;

const ENRAGE_PUSHBACK_RADIUS_PX = 140;
const ENRAGE_PUSHBACK_FORCE = 360;
const P2_COOLDOWN_MULT = 0.8;
const STAGGER_PER_STUN_MS = 1 / 36; // 1800ms stun => 50 stagger
const BOSS_DEAD_ANIM_TICKS = 30;
const BOSS_DEATH_COINS = 12;
const BOSS_DEATH_PEDESTALS = 1;

const PREFERRED_RANGE = BANSUNG_ENEMIES.boss_beholder.preferredRange ?? [190, 280];
const BACKOFF_DIST = BANSUNG_ENEMIES.boss_beholder.backoffDist ?? 140;
const BOSS_SCORE = BANSUNG_ENEMIES.boss_beholder.score;
const BOSS_KIND_ID = BANSUNG_ENEMIES.boss_beholder.kindId;
const MINI_BOSS_DEFAULT_HP_MULT = BANSUNG_WAVES[3]?.miniBoss?.hpMult ?? 0.48;

const BEHOLDER_TO_UNIT_STATE: Readonly<Record<BeholderState, BansungUnitState>> = {
  intro: BANSUNG_STATE_IDLE,
  move: BANSUNG_STATE_RUN,
  volley_cast: BANSUNG_STATE_ATK,
  slam_leap: BANSUNG_STATE_DASH,
  beam_windup: BANSUNG_STATE_ATK,
  beam_sweep: BANSUNG_STATE_ATK,
  enrage_roar: BANSUNG_STATE_ATK,
  stagger: BANSUNG_STATE_STUN,
  dead: BANSUNG_STATE_DEAD,
};

// ============================================================================
// 2. Public Interfaces
// ============================================================================

export interface SandBeholderBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SandBeholderSpawnOptions {
  id?: string;
  numId?: number;
  x?: number;
  y?: number;
  arenaW?: number;
  arenaH?: number;
  playerCount?: number;
  difficulty?: BansungDifficulty | BansungDifficultyKey | string;
  endlessTier?: number;
  hpMult?: number;
  scale?: number;
  miniBoss?: boolean;
  playableBounds?: SandBeholderBounds;
  initialState?: BeholderState;
  phase1Only?: boolean;
}

export interface SandBeholderTarget {
  id: string;
  numId?: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  alive: boolean;
  downed?: boolean;
  threat?: number;
  dashIframesMs?: number;
  combatTarget?: BansungCombatTarget;
}

export type SandBeholderProjKind = 'thorn' | 'rock_shard' | 'cactus_spike' | 'sand_spark';

export interface SandBeholderProjectileSpawn {
  ownerId: string;
  kind: SandBeholderProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  radius: number;
  damage: number;
  dmgKind: BansungDamageKind;
  ttlTicks: number;
}

export interface SandBeholderAddSpawn {
  id: string;
  kind: Extract<BansungEnemyId, 'scarab' | 'cactus_spitter'>;
  x: number;
  y: number;
}

export interface SandBeholderTelegraphCircle {
  bossId: string;
  x: number;
  y: number;
  r: number;
  ttlMs: number;
  color: string;
  kind: 'volley' | 'slam';
}

export interface SandBeholderBeamEvent {
  bossId: string;
  x: number;
  y: number;
  angleMrad: number;
  len: number;
  width: number;
  active: boolean;
  endX: number;
  endY: number;
}

export interface SandBeholderShockwaveEvent {
  x: number;
  y: number;
  r: number;
  color: string;
  trauma: number;
}

export interface SandBeholderPushbackEvent {
  x: number;
  y: number;
  radius: number;
  force: number;
}

export interface SandBeholderHeroHit {
  targetId: string;
  source: 'slam' | 'beam';
  damage: number;
  dmgKind: BansungDamageKind;
  knockbackSpeed: number;
  knockbackDx: number;
  knockbackDy: number;
  stunTicks: number;
  stunMs: number;
  burnTicks: number;
  burnDps: number;
  evadedByDash: boolean;
  damageResult?: BansungDamageResult;
}

export interface SandBeholderObstacleHit {
  obstacle: ArenaObstacle;
  damage: number;
  falloff: number;
}

export interface SandBeholderRewards {
  energyOrbs: number;
  coins: number;
  weaponPedestals: number;
  score: number;
}

export type SandBeholderSfxId =
  | 'boss_roar_cactus'
  | 'boss_volley_fire'
  | 'boss_slam_impact'
  | 'boss_beam_charge'
  | 'boss_beam_loop'
  | 'boss_death_shatter';

export interface SandBeholderCallbacks {
  onSpawnProjectile?: (proj: SandBeholderProjectileSpawn) => void;
  onSpawnAdd?: (add: SandBeholderAddSpawn) => void;
  onHeroHit?: (hit: SandBeholderHeroHit) => void;
  onObstacleHit?: (hit: SandBeholderObstacleHit) => void;
  onTelegraphCircle?: (circle: SandBeholderTelegraphCircle | null) => void;
  onBossBeam?: (beam: SandBeholderBeamEvent | null) => void;
  onShockwave?: (wave: SandBeholderShockwaveEvent) => void;
  onPushback?: (push: SandBeholderPushbackEvent) => void;
  onSfx?: (sfx: SandBeholderSfxId) => void;
  onDeathRewards?: (rewards: SandBeholderRewards) => void;
}

export interface SandBeholderStepContext {
  obsGrid: ObstacleGrid;
  targets: readonly SandBeholderTarget[];
  arenaW?: number;
  arenaH?: number;
  playableBounds?: SandBeholderBounds;
  aliveAddIds?: ReadonlySet<string>;
  isAddAlive?: (addId: string) => boolean;
  rng?: () => number;
  fxOut?: number[];
  popupsOut?: BansungDmgEvent[];
  callbacks?: SandBeholderCallbacks;
}

export interface SandBeholderStepResult {
  state: BeholderState;
  phase: 1 | 2;
  projectiles: SandBeholderProjectileSpawn[];
  addSpawns: SandBeholderAddSpawn[];
  telegraphCircle: SandBeholderTelegraphCircle | null;
  bossBeam: SandBeholderBeamEvent | null;
  shockwaves: SandBeholderShockwaveEvent[];
  pushbacks: SandBeholderPushbackEvent[];
  heroHits: SandBeholderHeroHit[];
  obstacleHits: SandBeholderObstacleHit[];
  sfx: SandBeholderSfxId[];
  fx: number[];
  rewards: SandBeholderRewards | null;
}

export interface SandBeholderFrameDetails {
  id: string;
  numId: number;
  kind: 'boss_beholder';
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  state: BeholderState;
  stateTick: number;
  aimAngleMrad: number;
  staggerPct: number;
  isBoss: true;
  facingLeft: boolean;
}

// ============================================================================
// 3. Pure Helpers & Scaling
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function defaultPlayableBounds(arenaW: number, arenaH: number): SandBeholderBounds {
  if (arenaW === BANSUNG_MAP_W && arenaH === BANSUNG_MAP_H) {
    return { ...BANSUNG_PLAYABLE_BOUNDS };
  }
  return { x0: 0, y0: 0, x1: arenaW, y1: arenaH };
}

function clampPointToBounds(
  x: number,
  y: number,
  radius: number,
  bounds: SandBeholderBounds,
): [number, number] {
  const minX = bounds.x0 + radius;
  const maxX = bounds.x1 - radius;
  const minY = bounds.y0 + radius;
  const maxY = bounds.y1 - radius;
  return [
    minX <= maxX ? clamp(x, minX, maxX) : (minX + maxX) * 0.5,
    minY <= maxY ? clamp(y, minY, maxY) : (minY + maxY) * 0.5,
  ];
}

/**
 * Computes co-op & difficulty scaled HP for Sand Beholder (`d37` / `d40`).
 * e.g. 4P Normal = `round(2400 * (1 + 0.65 * 3) * 1.0) = 7080`.
 */
export function computeSandBeholderMaxHp(
  playerCount = 1,
  difficulty: BansungDifficulty | BansungDifficultyKey | string = 'normal',
  opts?: { hpMult?: number; endlessTier?: number; miniBoss?: boolean },
): number {
  const diffKey = String(difficulty || 'normal').toLowerCase();
  const mult = computeBossHpMult(playerCount, diffKey, opts?.endlessTier ?? 0);
  const waveMult =
    opts?.hpMult !== undefined
      ? opts.hpMult
      : opts?.miniBoss
        ? MINI_BOSS_DEFAULT_HP_MULT
        : 1;
  return Math.max(1, Math.round(BOSS_BEHOLDER_CFG.baseHp * mult * Math.max(0.05, waveMult)));
}

/** Converts stun duration (ms) from player weapons/gadgets into boss stagger gauge points. */
export function stunMsToBossStagger(stunMs: number): number {
  if (!Number.isFinite(stunMs) || stunMs <= 0) return 0;
  return Math.max(1, stunMs * STAGGER_PER_STUN_MS);
}

// ============================================================================
// 4. Sand Beholder 30Hz Authoritative Boss Controller
// ============================================================================

const tmpBody: CircleBody = { x: 0, y: 0, radius: BOSS_BEHOLDER_CFG.radius };
const tmpSlamObs: AoeObstacleTarget[] = [];

export class SandBeholderBoss {
  readonly state: BossSandBeholderState;
  readonly numId: number;
  readonly radius: number;
  readonly arenaW: number;
  readonly arenaH: number;
  readonly playableBounds: SandBeholderBounds;
  readonly phase1Only: boolean;
  readonly combatTarget: BansungCombatTarget;

  private readonly threatByHero = new Map<string, number>();
  private unseenTicks = 0;
  private wallSlideSign: 1 | -1 = 1;
  private stuckTicks = 0;
  private anchorX = 0;
  private anchorY = 0;
  private addSeq = 0;
  private pendingIntroSfx = false;
  private pendingEnrageEmit = false;
  private deathEmitted = false;
  private activeTelegraph: SandBeholderTelegraphCircle | null = null;
  private activeBeam: SandBeholderBeamEvent | null = null;
  private slamPhaseSubStep: 'leap1' | 'crouch' | 'leap2' = 'leap1';

  constructor(opts: SandBeholderSpawnOptions = {}) {
    const arenaW = Math.max(200, opts.arenaW ?? BANSUNG_MAP_W);
    const arenaH = Math.max(200, opts.arenaH ?? BANSUNG_MAP_H);
    const bounds = opts.playableBounds ?? defaultPlayableBounds(arenaW, arenaH);
    const maxHp = computeSandBeholderMaxHp(opts.playerCount ?? 1, opts.difficulty ?? 'normal', {
      hpMult: opts.hpMult,
      endlessTier: opts.endlessTier,
      miniBoss: opts.miniBoss,
    });

    const rawX = opts.x ?? arenaW * 0.5;
    const rawY = opts.y ?? arenaH * 0.35;
    const scale = Math.max(0.45, Math.min(2.2, opts.scale ?? 1));
    this.radius = Math.max(20, Math.round(BOSS_BEHOLDER_CFG.radius * scale));
    const [sx, sy] = clampPointToBounds(rawX, rawY, this.radius, bounds);

    const id = opts.id ?? 'boss_beholder_1';
    this.numId = opts.numId ?? 9001;
    this.arenaW = arenaW;
    this.arenaH = arenaH;
    this.playableBounds = bounds;
    this.phase1Only = Boolean(opts.phase1Only);
    this.anchorX = sx;
    this.anchorY = sy;

    const initialState: BeholderState = opts.initialState ?? 'intro';
    this.pendingIntroSfx = initialState === 'intro';

    this.state = {
      id,
      x: sx,
      y: sy,
      z: 0,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      phase: 1,
      state: initialState,
      stateTick: 0,
      aimAngle: Math.PI * 0.5,
      sweepDir: 1,
      volleyCd: 0,
      slamCd: 0,
      beamCd: 0,
      lastMove: '',
      slamStartX: sx,
      slamStartY: sy,
      slamTargetX: sx,
      slamTargetY: sy,
      slamBounceLeft: 0,
      stagger: 0,
      staggerImmuneTicks: 0,
      targetId: null,
      retargetTicks: 0,
      summonIds: [],
    };

    this.combatTarget = {
      id,
      numId: this.numId,
      x: sx,
      y: sy,
      tier: 'boss',
      armorType: 'armored',
      flatArmor: BOSS_BEHOLDER_CFG.armor,
      damageReduction: BOSS_BEHOLDER_CFG.baseDr,
      alive: true,
      hp: maxHp,
      maxHp,
      shield: 0,
      maxShield: 0,
      ccImmune: true,
      vulnMult: 1.0,
      dashIframesMs: this.isInvulnerable() ? 100 : 0,
    };
  }

  /** True when the boss cannot take HP damage (intro roar, phase-2 roar, dead). */
  isInvulnerable(): boolean {
    const s = this.state.state;
    return s === 'intro' || s === 'enrage_roar' || s === 'dead';
  }

  /** True when dead animation has finished or HP <= 0. */
  isDead(): boolean {
    return this.state.state === 'dead' || this.state.hp <= 0;
  }

  /** True when the boss is dead and finished its 30-tick shatter animation. */
  isDeadAnimDone(): boolean {
    return this.state.state === 'dead' && this.state.stateTick >= BOSS_DEAD_ANIM_TICKS;
  }

  /** Applies an incoming combat hit through `damage.ts`, updating threat, stagger, and Phase 2 transitions. */
  applyHit(hit: BansungDamageHit, ctx?: BansungDamageContext): BansungDamageResult {
    const dmgKindIdx = BANSUNG_DAMAGE_KIND_INDEX[hit.dmgKind] ?? 0;

    if (this.isInvulnerable() || this.state.hp <= 0) {
      this.syncCombatTarget();
      ctx?.popups?.push([this.state.id, 0, BANSUNG_DMG_FLAG_IMMUNE, dmgKindIdx]);
      return {
        hpDmg: 0,
        shieldDmg: 0,
        totalDmg: 0,
        rawDmg: 0,
        blocked: true,
        isCrit: false,
        brokeShield: false,
        killed: false,
        stunAppliedMs: 0,
        flags: BANSUNG_DMG_FLAG_IMMUNE,
        fxFlags: 0,
        dmgKindIdx,
      };
    }

    this.syncCombatTarget();
    const res = applyBansungDamage(this.combatTarget, { ...hit, stunMs: undefined }, ctx);
    this.state.hp = this.combatTarget.hp;

    if (!res.blocked && res.totalDmg > 0 && hit.attackerId) {
      this.threatByHero.set(
        hit.attackerId,
        (this.threatByHero.get(hit.attackerId) ?? 0) + res.totalDmg,
      );
    }

    if (this.state.hp <= 0) {
      this.enterDead();
      return res;
    }

    if (this.checkEnrageTransition()) {
      return res;
    }

    if (!res.blocked && hit.stunMs && hit.stunMs > 0) {
      this.addStagger(stunMsToBossStagger(hit.stunMs));
    }

    return res;
  }

  /** Adds stagger points to the boss gauge (`0..100`); interrupts non-invuln states at `100`. */
  addStagger(points: number): boolean {
    if (!Number.isFinite(points) || points <= 0) return false;
    if (this.isInvulnerable() || this.state.state === 'stagger') return false;
    if (this.state.staggerImmuneTicks > 0) return false;

    this.state.stagger = Math.min(BOSS_BEHOLDER_CFG.staggerMax, this.state.stagger + points);
    if (this.state.stagger >= BOSS_BEHOLDER_CFG.staggerMax) {
      this.enterStagger();
      return true;
    }
    return false;
  }

  /** Advances the Sand Beholder 30Hz state machine by 1 authoritative tick (`33.33ms`). */
  step(ctx: SandBeholderStepContext): SandBeholderStepResult {
    const out: SandBeholderStepResult = {
      state: this.state.state,
      phase: this.state.phase,
      projectiles: [],
      addSpawns: [],
      telegraphCircle: null,
      bossBeam: null,
      shockwaves: [],
      pushbacks: [],
      heroHits: [],
      obstacleHits: [],
      sfx: [],
      fx: [],
      rewards: null,
    };

    const obsGrid = ctx.obsGrid;
    const arenaW = ctx.arenaW ?? this.arenaW;
    const arenaH = ctx.arenaH ?? this.arenaH;
    const bounds = ctx.playableBounds ?? this.playableBounds;

    this.reconcileExternalHp();
    this.decayThreat();

    if (this.state.hp <= 0 && this.state.state !== 'dead') {
      this.enterDead();
    } else if (this.state.state !== 'dead') {
      this.checkEnrageTransition();
    }

    // Tick cooldowns and stagger decay/immunity outside intro/enrage/dead/stagger
    if (this.state.state !== 'dead') {
      this.tickCooldownsAndStagger();
      this.tickDots(ctx, out);
    }

    // Re-check lethal or phase transitions triggered by DOT ticks
    if (this.state.hp <= 0 && this.state.state !== 'dead') {
      this.enterDead();
    } else if (this.state.state !== 'dead') {
      this.checkEnrageTransition();
    }

    // Dispatch current state
    switch (this.state.state) {
      case 'intro':
        this.stepIntro(out);
        break;
      case 'enrage_roar':
        this.stepEnrageRoar(ctx, obsGrid, bounds, out);
        break;
      case 'stagger':
        this.stepStagger(obsGrid, arenaW, arenaH, bounds);
        break;
      case 'dead':
        this.stepDead(out);
        break;
      case 'move':
        this.stepMove(ctx, obsGrid, arenaW, arenaH, bounds, out);
        break;
      case 'volley_cast':
        this.stepVolleyCast(ctx, obsGrid, out);
        break;
      case 'slam_leap':
        this.stepSlamLeap(ctx, obsGrid, arenaW, arenaH, bounds, out);
        break;
      case 'beam_windup':
        this.stepBeamWindup(ctx, obsGrid, out);
        break;
      case 'beam_sweep':
        this.stepBeamSweep(ctx, obsGrid, out);
        break;
    }

    this.syncCombatTarget();

    out.state = this.state.state;
    out.phase = this.state.phase;
    out.telegraphCircle = this.activeTelegraph ? { ...this.activeTelegraph } : null;
    out.bossBeam = this.activeBeam ? { ...this.activeBeam } : null;

    if (ctx.fxOut && out.fx.length > 0) {
      for (let i = 0; i < out.fx.length; i++) {
        ctx.fxOut.push(out.fx[i]);
      }
    }

    this.emitCallbacks(ctx.callbacks, out);
    return out;
  }

  /** Builds compact network `BansungBossFrame` snapshot (`d02` / `d45`). */
  toBossFrame(): BansungBossFrame {
    const telegraph = this.computeTelegraphPct();
    return {
      id: this.numId,
      kind: 'boss_beholder',
      x: Math.round(this.state.x),
      y: Math.round(this.state.y),
      hp: Math.round(this.state.hp),
      maxHp: Math.round(this.state.maxHp),
      phase: this.state.phase,
      state: BEHOLDER_TO_UNIT_STATE[this.state.state],
      aimQ: quantizeAim(this.state.aimAngle),
      ...(telegraph > 0 ? { telegraph } : {}),
      stagger: Math.round(this.state.stagger),
      maxStagger: BOSS_BEHOLDER_CFG.staggerMax,
    };
  }

  /** Builds normalized `0..255` ground/beam telegraphs for `frame.tg`. */
  toTelegraphs(): BansungTelegraph[] {
    if (this.state.state === 'dead' || this.state.state === 'stagger') {
      return [];
    }
    const out: BansungTelegraph[] = [];
    if (this.activeTelegraph) {
      let prog = 0;
      if (this.activeTelegraph.kind === 'slam') {
        const leapLen = this.state.phase === 2 ? SLAM_TICKS_P2 : SLAM_TICKS_P1;
        const subTick =
          this.slamPhaseSubStep === 'leap2'
            ? this.state.stateTick - (SLAM_TICKS_P2 + SLAM_CROUCH_TICKS_P2)
            : this.state.stateTick;
        prog = Math.min(255, Math.max(0, Math.round((subTick / Math.max(1, leapLen)) * 255)));
      } else if (this.activeTelegraph.kind === 'volley') {
        const max =
          this.state.phase === 2 ? VOLLEY_RING_TICKS_P2[0] : VOLLEY_RING_A_TICK_P1;
        prog = Math.min(255, Math.max(0, Math.round((this.state.stateTick / Math.max(1, max)) * 255)));
      }
      const tx =
        this.activeTelegraph.kind === 'volley'
          ? Math.round(this.state.x)
          : Math.round(this.activeTelegraph.x);
      const ty =
        this.activeTelegraph.kind === 'volley'
          ? Math.round(this.state.y)
          : Math.round(this.activeTelegraph.y);
      out.push({
        id: this.numId * 10 + 1,
        kind: 1,
        phase: 0,
        color: this.activeTelegraph.kind === 'slam' ? 1 : 0,
        prog,
        x0: tx,
        y0: ty,
        x1: tx,
        y1: ty,
        r: Math.round(this.activeTelegraph.r),
        shape: 'circle',
        active: false,
        danger: 1,
        label: this.activeTelegraph.kind === 'slam' ? 'DANGER' : undefined,
        sourceKind: 'boss_beholder',
      });
    }
    if (this.activeBeam) {
      const prog = this.activeBeam.active
        ? 255
        : Math.min(255, Math.max(0, Math.round((this.state.stateTick / BEAM_WINDUP_TICKS) * 255)));
      out.push({
        id: this.numId * 10 + 2,
        kind: 0,
        phase: this.activeBeam.active ? 1 : 0,
        color: 1,
        prog,
        x0: Math.round(this.activeBeam.x),
        y0: Math.round(this.activeBeam.y),
        x1: Math.round(this.activeBeam.endX),
        y1: Math.round(this.activeBeam.endY),
        r: Math.round(this.activeBeam.width * 0.5),
        shape: 'line',
        halfW: Math.round(this.activeBeam.width * 0.5),
        active: this.activeBeam.active,
        danger: 1,
        label: this.activeBeam.active ? 'EYE BEAM' : 'DANGER',
        sourceKind: 'boss_beholder',
      });
    }
    return out;
  }

  /** Builds stride-8 quantized enemy tuple `[id, enemyIdx, x, y, hpPct, aimQ, state, flags]`. */
  toEnemyTuple(): [number, number, number, number, number, number, number, number] {
    const hpPct =
      this.state.maxHp > 0
        ? Math.max(0, Math.min(100, Math.round((this.state.hp / this.state.maxHp) * 100)))
        : 0;
    return [
      this.numId,
      BOSS_KIND_ID,
      Math.round(this.state.x),
      Math.round(this.state.y),
      hpPct,
      quantizeAim(this.state.aimAngle),
      BEHOLDER_TO_UNIT_STATE[this.state.state],
      this.computeEnemyFlags(),
    ];
  }

  /** Builds detailed `d37` Section 4 snapshot fields for renderer/HUD debugging. */
  toDetailedView(): SandBeholderFrameDetails {
    return {
      id: this.state.id,
      numId: this.numId,
      kind: 'boss_beholder',
      x: Math.round(this.state.x),
      y: Math.round(this.state.y),
      z: Math.round(this.state.z),
      hp: Math.round(this.state.hp),
      maxHp: Math.round(this.state.maxHp),
      phase: this.state.phase,
      state: this.state.state,
      stateTick: this.state.stateTick,
      aimAngleMrad: Math.round(this.state.aimAngle * 1000),
      staggerPct: Math.round((this.state.stagger / BOSS_BEHOLDER_CFG.staggerMax) * 100),
      isBoss: true,
      facingLeft: Math.cos(this.state.aimAngle) < 0,
    };
  }

  // --------------------------------------------------------------------------
  // Internal State Transitions & Cancel Guards
  // --------------------------------------------------------------------------

  private clearActiveAttacks(): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;
    this.state.slamBounceLeft = 0;
    this.slamPhaseSubStep = 'leap1';
    this.activeTelegraph = null;
    this.activeBeam = null;
  }

  private enterMove(recoveryTicks: number): void {
    this.clearActiveAttacks();
    this.state.state = 'move';
    this.state.stateTick = Math.max(0, Math.round(recoveryTicks));
  }

  private enterStagger(): void {
    this.clearActiveAttacks();
    this.state.state = 'stagger';
    this.state.stateTick = 0;
    this.state.stagger = BOSS_BEHOLDER_CFG.staggerMax;
    this.syncCombatTarget();
  }

  private enterDead(): void {
    this.clearActiveAttacks();
    this.state.hp = 0;
    this.state.state = 'dead';
    this.state.stateTick = 0;
    this.combatTarget.hp = 0;
    this.combatTarget.alive = false;
    this.syncCombatTarget();
  }

  private checkEnrageTransition(): boolean {
    if (this.phase1Only || this.state.phase !== 1) return false;
    if (this.state.state === 'dead' || this.state.state === 'enrage_roar') return false;
    if (this.state.hp <= 0 || this.state.hp > this.state.maxHp * BOSS_BEHOLDER_CFG.enrageHpRatio) {
      return false;
    }

    this.clearActiveAttacks();
    this.state.phase = 2;
    this.state.state = 'enrage_roar';
    this.state.stateTick = 0;
    this.state.stagger = 0;
    this.pendingEnrageEmit = true;
    this.syncCombatTarget();
    return true;
  }

  private reconcileExternalHp(): void {
    if (this.isInvulnerable()) {
      this.combatTarget.hp = this.state.hp;
      this.combatTarget.alive = this.state.hp > 0;
      return;
    }
    if (this.combatTarget.hp < this.state.hp) {
      this.state.hp = Math.max(0, this.combatTarget.hp);
    } else if (this.state.hp < this.combatTarget.hp) {
      this.combatTarget.hp = Math.max(0, this.state.hp);
    }
  }

  private syncCombatTarget(): void {
    this.combatTarget.x = this.state.x;
    this.combatTarget.y = this.state.y;
    this.combatTarget.hp = this.state.hp;
    this.combatTarget.maxHp = this.state.maxHp;
    this.combatTarget.alive = this.state.hp > 0 && this.state.state !== 'dead';
    const isStaggered = this.state.state === 'stagger';
    this.combatTarget.flatArmor = isStaggered
      ? Math.round(BOSS_BEHOLDER_CFG.armor * 0.4)
      : BOSS_BEHOLDER_CFG.armor;
    this.combatTarget.damageReduction = isStaggered ? 0 : BOSS_BEHOLDER_CFG.baseDr;
    this.combatTarget.vulnMult =
      isStaggered ? BOSS_BEHOLDER_CFG.staggerDmgMult : 1.0;
    this.combatTarget.dashIframesMs = this.isInvulnerable() ? 100 : 0;
  }

  private decayThreat(): void {
    if (this.threatByHero.size === 0) return;
    const decayFactor = Math.pow(0.85, DT);
    for (const [id, val] of this.threatByHero) {
      const next = val * decayFactor;
      if (next < 0.05) {
        this.threatByHero.delete(id);
      } else {
        this.threatByHero.set(id, next);
      }
    }
  }

  private tickCooldownsAndStagger(): void {
    if (this.state.state !== 'volley_cast' && this.state.volleyCd > 0) {
      this.state.volleyCd -= 1;
    }
    if (this.state.state !== 'slam_leap' && this.state.slamCd > 0) {
      this.state.slamCd -= 1;
    }
    if (
      this.state.state !== 'beam_windup' &&
      this.state.state !== 'beam_sweep' &&
      this.state.beamCd > 0
    ) {
      this.state.beamCd -= 1;
    }

    if (this.state.staggerImmuneTicks > 0) {
      this.state.staggerImmuneTicks -= 1;
      this.state.stagger = 0;
    } else if (this.state.state !== 'stagger' && this.state.stagger > 0 && !this.isInvulnerable()) {
      this.state.stagger = Math.max(
        0,
        this.state.stagger - BOSS_BEHOLDER_CFG.staggerDecayPerSec * DT,
      );
    }
  }

  private tickDots(ctx: SandBeholderStepContext, out: SandBeholderStepResult): void {
    if (this.isInvulnerable()) return;
    const beforeHp = this.combatTarget.hp;
    tickStatuses(this.combatTarget, BANSUNG_TICK_EXACT_MS, {
      fx: out.fx,
      popups: ctx.popupsOut,
    });
    if (this.combatTarget.hp < beforeHp) {
      this.state.hp = this.combatTarget.hp;
    }
  }

  // --------------------------------------------------------------------------
  // State Handlers
  // --------------------------------------------------------------------------

  private stepIntro(out: SandBeholderStepResult): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;

    if (this.pendingIntroSfx) {
      this.pendingIntroSfx = false;
      out.sfx.push('boss_roar_cactus');
    }

    this.state.stateTick += 1;
    if (this.state.stateTick >= BOSS_BEHOLDER_CFG.introTicks) {
      this.enterMove(0);
    }
  }

  private stepEnrageRoar(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    bounds: SandBeholderBounds,
    out: SandBeholderStepResult,
  ): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;

    if (this.pendingEnrageEmit) {
      this.pendingEnrageEmit = false;
      out.sfx.push('boss_roar_cactus');
      out.pushbacks.push({
        x: this.state.x,
        y: this.state.y,
        radius: ENRAGE_PUSHBACK_RADIUS_PX,
        force: ENRAGE_PUSHBACK_FORCE,
      });
      out.shockwaves.push({
        x: this.state.x,
        y: this.state.y,
        r: ENRAGE_PUSHBACK_RADIUS_PX,
        color: '#ff4d2e',
        trauma: 0.45,
      });
      out.fx.push(
        FX_BLAST,
        BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
        Math.round(this.state.x),
        Math.round(this.state.y),
        ENRAGE_PUSHBACK_RADIUS_PX,
        this.numId,
      );
      this.spawnEnrageAdds(ctx, obsGrid, bounds, out);
    }

    this.state.stateTick += 1;
    if (this.state.stateTick >= BOSS_BEHOLDER_CFG.enrageRoarTicks) {
      this.enterMove(BOSS_BEHOLDER_CFG.p2RecoveryTicks);
    }
  }

  private spawnEnrageAdds(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    bounds: SandBeholderBounds,
    out: SandBeholderStepResult,
  ): void {
    // Prune dead add IDs before enforcing maxAdds = 4 cap
    if (ctx.aliveAddIds || ctx.isAddAlive) {
      this.state.summonIds = this.state.summonIds.filter((id) =>
        ctx.isAddAlive ? ctx.isAddAlive(id) : ctx.aliveAddIds!.has(id),
      );
    }

    const slotsLeft = Math.max(0, BOSS_BEHOLDER_CFG.maxAdds - this.state.summonIds.length);
    if (slotsLeft <= 0) return;

    const desired: readonly Extract<BansungEnemyId, 'scarab' | 'cactus_spitter'>[] = [
      'scarab',
      'scarab',
      'cactus_spitter',
    ];
    const count = Math.min(slotsLeft, desired.length);
    const baseAngle = this.state.aimAngle + Math.PI / 6;

    for (let i = 0; i < count; i++) {
      const kind = desired[i];
      const addRadius = BANSUNG_ENEMIES[kind].radius;
      const ang = baseAngle + i * ((Math.PI * 2) / 3);
      const [clampedX, clampedY] = clampPointToBounds(
        this.state.x + Math.cos(ang) * 115,
        this.state.y + Math.sin(ang) * 115,
        addRadius,
        bounds,
      );
      tmpBody.x = clampedX;
      tmpBody.y = clampedY;
      tmpBody.radius = addRadius;
      resolveObstacles(tmpBody, obsGrid, this.arenaW, this.arenaH, 0);
      const [fx, fy] = clampPointToBounds(tmpBody.x, tmpBody.y, addRadius, bounds);

      const addId = `${this.state.id}_add_${++this.addSeq}`;
      this.state.summonIds.push(addId);
      out.addSpawns.push({ id: addId, kind, x: Math.round(fx), y: Math.round(fy) });
    }
  }

  private stepStagger(
    obsGrid: ObstacleGrid,
    arenaW: number,
    arenaH: number,
    bounds: SandBeholderBounds,
  ): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;
    tmpBody.x = this.state.x;
    tmpBody.y = this.state.y;
    tmpBody.radius = BOSS_BEHOLDER_CFG.radius;
    resolveObstacles(tmpBody, obsGrid, arenaW, arenaH, 0);
    const [cx, cy] = clampPointToBounds(tmpBody.x, tmpBody.y, BOSS_BEHOLDER_CFG.radius, bounds);
    this.state.x = cx;
    this.state.y = cy;

    this.state.stateTick += 1;
    if (this.state.stateTick >= BOSS_BEHOLDER_CFG.staggerDurationTicks) {
      this.state.stagger = 0;
      this.state.staggerImmuneTicks = BOSS_BEHOLDER_CFG.staggerImmuneTicks;
      const rec =
        this.state.phase === 2
          ? BOSS_BEHOLDER_CFG.p2RecoveryTicks
          : BOSS_BEHOLDER_CFG.p1RecoveryTicks;
      this.enterMove(rec);
    }
  }

  private stepDead(out: SandBeholderStepResult): void {
    this.clearActiveAttacks();
    this.state.hp = 0;
    if (!this.deathEmitted) {
      this.deathEmitted = true;
      out.sfx.push('boss_death_shatter');
      out.fx.push(
        FX_DEATH,
        BOSS_KIND_ID,
        Math.round(this.state.x),
        Math.round(this.state.y),
        2,
        0,
      );
      out.rewards = {
        energyOrbs: BANSUNG_LOOT_TABLES.boss_kill.orbBurstCount,
        coins: BOSS_DEATH_COINS,
        weaponPedestals: BOSS_DEATH_PEDESTALS,
        score: BOSS_SCORE,
      };
    }
    this.state.stateTick += 1;
  }

  private stepMove(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    arenaW: number,
    arenaH: number,
    bounds: SandBeholderBounds,
    out: SandBeholderStepResult,
  ): void {
    const target = this.selectTarget(ctx.targets, obsGrid);
    if (!target) {
      this.state.vx = 0;
      this.state.vy = 0;
      return;
    }

    const dx = target.x - this.state.x;
    const dy = target.y - this.state.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-4) {
      this.state.aimAngle = wrapPi(Math.atan2(dy, dx));
    }

    // Steering toward preferred [190, 280] range band with obstacle whisker slide
    const moveSpeed =
      this.state.phase === 2 ? BOSS_BEHOLDER_CFG.p2MoveSpeed : BOSS_BEHOLDER_CFG.p1MoveSpeed;
    const los = hasLineOfSight(obsGrid, this.state.x, this.state.y, target.x, target.y, 'move');
    const nx = dist > 1e-4 ? dx / dist : Math.cos(this.state.aimAngle);
    const ny = dist > 1e-4 ? dy / dist : Math.sin(this.state.aimAngle);

    let steerX = 0;
    let steerY = 0;
    if (!los || dist > PREFERRED_RANGE[1]) {
      steerX = nx;
      steerY = ny;
    } else if (dist < BACKOFF_DIST) {
      steerX = -nx + -ny * 0.45 * this.wallSlideSign;
      steerY = -ny + nx * 0.45 * this.wallSlideSign;
    } else {
      steerX = -ny * 0.55 * this.wallSlideSign;
      steerY = nx * 0.55 * this.wallSlideSign;
    }

    const steerLen = Math.hypot(steerX, steerY);
    if (steerLen > 1e-4) {
      steerX /= steerLen;
      steerY /= steerLen;
      const probeDist = BOSS_BEHOLDER_CFG.radius + 32;
      const hit = raycastObstacles(
        obsGrid,
        this.state.x,
        this.state.y,
        this.state.x + steerX * probeDist,
        this.state.y + steerY * probeDist,
        BOSS_BEHOLDER_CFG.radius * 0.85,
        'move',
      );
      if (hit) {
        const tx = this.wallSlideSign > 0 ? -hit.ny : hit.ny;
        const ty = this.wallSlideSign > 0 ? hit.nx : -hit.nx;
        steerX = steerX * 0.35 + tx * 1.25;
        steerY = steerY * 0.35 + ty * 1.25;
        const nLen = Math.hypot(steerX, steerY);
        if (nLen > 1e-4) {
          steerX /= nLen;
          steerY /= nLen;
        }
      }
    }

    this.state.vx = steerX * moveSpeed;
    this.state.vy = steerY * moveSpeed;

    tmpBody.x = this.state.x;
    tmpBody.y = this.state.y;
    tmpBody.radius = BOSS_BEHOLDER_CFG.radius;
    moveCircleWithSlide(tmpBody, this.state.vx * DT, this.state.vy * DT, obsGrid, arenaW, arenaH, 0);
    const [cx, cy] = clampPointToBounds(tmpBody.x, tmpBody.y, BOSS_BEHOLDER_CFG.radius, bounds);
    this.state.x = cx;
    this.state.y = cy;

    this.stuckTicks += 1;
    if (this.stuckTicks >= 15) {
      if (Math.hypot(this.state.x - this.anchorX, this.state.y - this.anchorY) < 6) {
        this.wallSlideSign = this.wallSlideSign === 1 ? -1 : 1;
      }
      this.anchorX = this.state.x;
      this.anchorY = this.state.y;
      this.stuckTicks = 0;
    }

    if (this.state.stateTick > 0) {
      this.state.stateTick -= 1;
    }

    if (this.state.stateTick <= 0) {
      this.trySelectNextAttack(ctx.targets, target, dist, obsGrid, bounds, out);
    }
  }

  private trySelectNextAttack(
    targets: readonly SandBeholderTarget[],
    primary: SandBeholderTarget,
    primaryDist: number,
    obsGrid: ObstacleGrid,
    bounds: SandBeholderBounds,
    out: SandBeholderStepResult,
  ): void {
    const last = this.state.lastMove;
    const anyHeroClose = this.hasAliveHeroWithin(targets, SLAM_TRIGGER_RANGE_PX);

    if (anyHeroClose && this.state.slamCd <= 0 && last !== 'slam_leap') {
      this.startSlamLeap(targets, obsGrid, bounds);
      return;
    }

    if (primaryDist > BOSS_BEHOLDER_CFG.beamRange) {
      return;
    }

    const canVolley = this.state.volleyCd <= 0 && last !== 'volley_cast';
    const canBeam = this.state.beamCd <= 0 && last !== 'beam_windup';

    if (canVolley && canBeam) {
      if (last === 'volley_cast') {
        this.startBeamWindup(primary, obsGrid, out);
      } else {
        this.startVolleyCast();
      }
      return;
    }

    if (canVolley) {
      this.startVolleyCast();
      return;
    }

    if (canBeam) {
      this.startBeamWindup(primary, obsGrid, out);
      return;
    }

    if (primaryDist <= 280 && this.state.slamCd <= 0 && last !== 'slam_leap') {
      this.startSlamLeap(targets, obsGrid, bounds);
    }
  }

  // --------------------------------------------------------------------------
  // Attack 1: Radial Thorn Volley
  // --------------------------------------------------------------------------

  private startVolleyCast(): void {
    this.clearActiveAttacks();
    this.state.state = 'volley_cast';
    this.state.stateTick = 0;
    this.state.lastMove = 'volley_cast';
    const windupTicks = this.state.phase === 2 ? VOLLEY_RING_TICKS_P2[0] : VOLLEY_RING_A_TICK_P1;
    this.activeTelegraph = {
      bossId: this.state.id,
      x: Math.round(this.state.x),
      y: Math.round(this.state.y),
      r: VOLLEY_GLOW_RADIUS_PX,
      ttlMs: ticksToMs(windupTicks),
      color: '#f59e0b',
      kind: 'volley',
    };
  }

  private stepVolleyCast(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    out: SandBeholderStepResult,
  ): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;
    this.state.stateTick += 1;

    const isP2 = this.state.phase === 2;
    const t = this.state.stateTick;
    const lockTick = isP2 ? VOLLEY_RING_TICKS_P2[0] : VOLLEY_RING_A_TICK_P1;

    const target = this.selectTarget(ctx.targets, obsGrid);
    if (target && t < lockTick) {
      const dx = target.x - this.state.x;
      const dy = target.y - this.state.y;
      if (dx * dx + dy * dy > 1e-4) {
        this.state.aimAngle = wrapPi(Math.atan2(dy, dx));
      }
    }

    if (!isP2) {
      if (t === VOLLEY_RING_A_TICK_P1) {
        this.activeTelegraph = null;
        this.emitThornRing(
          obsGrid,
          VOLLEY_COUNT_P1,
          this.state.aimAngle,
          VOLLEY_SPEED_P1,
          VOLLEY_DMG_P1,
          out,
        );
      } else if (t === VOLLEY_RING_B_TICK_P1) {
        this.emitThornRing(
          obsGrid,
          VOLLEY_COUNT_P1,
          this.state.aimAngle + VOLLEY_OFFSET_P1_RAD,
          VOLLEY_SPEED_P1,
          VOLLEY_DMG_P1,
          out,
        );
      }

      if (t >= VOLLEY_TICKS_P1) {
        this.state.volleyCd = BOSS_BEHOLDER_CFG.volleyCdTicks;
        this.enterMove(BOSS_BEHOLDER_CFG.p1RecoveryTicks);
      }
      return;
    }

    // Phase 2: 3 rapid 14-thorn spiral rings (+12 deg twist per ring)
    const ringIdx = VOLLEY_RING_TICKS_P2.indexOf(t);
    if (ringIdx !== -1) {
      if (ringIdx === 0) this.activeTelegraph = null;
      this.emitThornRing(
        obsGrid,
        VOLLEY_COUNT_P2,
        this.state.aimAngle + ringIdx * VOLLEY_TWIST_P2_RAD,
        VOLLEY_SPEED_P2,
        VOLLEY_DMG_P2,
        out,
      );
    }

    if (t >= VOLLEY_TICKS_P2) {
      this.state.volleyCd = Math.round(BOSS_BEHOLDER_CFG.volleyCdTicks * P2_COOLDOWN_MULT);
      this.enterMove(BOSS_BEHOLDER_CFG.p2RecoveryTicks);
    }
  }

  private emitThornRing(
    obsGrid: ObstacleGrid,
    count: number,
    baseAngle: number,
    speed: number,
    damage: number,
    out: SandBeholderStepResult,
  ): void {
    out.sfx.push('boss_volley_fire');
    const step = (Math.PI * 2) / count;
    const spawnR = BOSS_BEHOLDER_CFG.radius + 4;
    for (let i = 0; i < count; i++) {
      this.spawnBossProjectile(
        obsGrid,
        'thorn',
        baseAngle + i * step,
        spawnR,
        speed,
        THORN_RADIUS_PX,
        damage,
        'kinetic',
        THORN_TTL_TICKS,
        out,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Attack 2: Seismic Slam Stun Shockwave (1x P1 / 2x P2)
  // --------------------------------------------------------------------------

  private startSlamLeap(
    targets: readonly SandBeholderTarget[],
    obsGrid: ObstacleGrid,
    bounds: SandBeholderBounds,
  ): void {
    this.clearActiveAttacks();
    this.state.state = 'slam_leap';
    this.state.stateTick = 0;
    this.state.lastMove = 'slam_leap';
    this.state.slamBounceLeft = this.state.phase === 2 ? 1 : 0;
    this.slamPhaseSubStep = 'leap1';
    this.configureSlamTarget(targets, obsGrid, bounds, false);
  }

  private configureSlamTarget(
    targets: readonly SandBeholderTarget[],
    obsGrid: ObstacleGrid,
    bounds: SandBeholderBounds,
    preferNonStunned: boolean,
  ): void {
    const target = this.pickSlamHero(targets, preferNonStunned);
    let tx = this.state.x;
    let ty = this.state.y;

    if (target) {
      const dx = target.x - this.state.x;
      const dy = target.y - this.state.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SLAM_MAX_LEAP_PX && dist > 1e-4) {
        tx = this.state.x + (dx / dist) * SLAM_MAX_LEAP_PX;
        ty = this.state.y + (dy / dist) * SLAM_MAX_LEAP_PX;
      } else {
        tx = target.x;
        ty = target.y;
      }
      if (dist > 1e-4) {
        this.state.aimAngle = wrapPi(Math.atan2(dy, dx));
      }
    }

    const [bx, by] = clampPointToBounds(tx, ty, BOSS_BEHOLDER_CFG.radius, bounds);
    tmpBody.x = bx;
    tmpBody.y = by;
    tmpBody.radius = BOSS_BEHOLDER_CFG.radius;
    resolveObstacles(tmpBody, obsGrid, this.arenaW, this.arenaH, 0);
    const [fx, fy] = clampPointToBounds(tmpBody.x, tmpBody.y, BOSS_BEHOLDER_CFG.radius, bounds);

    this.state.slamStartX = this.state.x;
    this.state.slamStartY = this.state.y;
    this.state.slamTargetX = fx;
    this.state.slamTargetY = fy;

    const slamRadius =
      this.state.phase === 2 ? BOSS_BEHOLDER_CFG.slamRadiusP2 : BOSS_BEHOLDER_CFG.slamRadiusP1;
    const leapTicks = this.state.phase === 2 ? SLAM_TICKS_P2 : SLAM_TICKS_P1;
    this.activeTelegraph = {
      bossId: this.state.id,
      x: Math.round(fx),
      y: Math.round(fy),
      r: slamRadius,
      ttlMs: ticksToMs(leapTicks),
      color: '#ff3b30',
      kind: 'slam',
    };
  }

  private stepSlamLeap(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    arenaW: number,
    arenaH: number,
    bounds: SandBeholderBounds,
    out: SandBeholderStepResult,
  ): void {
    this.state.stateTick += 1;

    if (this.state.phase === 1) {
      const u = clamp(this.state.stateTick / SLAM_TICKS_P1, 0, 1);
      this.advanceLeapPosition(u, obsGrid, arenaW, arenaH, bounds);
      if (this.state.stateTick >= SLAM_TICKS_P1) {
        this.resolveSlamImpact(ctx, obsGrid, false, out);
        this.state.slamCd = BOSS_BEHOLDER_CFG.slamCdTicks;
        this.enterMove(BOSS_BEHOLDER_CFG.p1RecoveryTicks);
      }
      return;
    }

    // Phase 2 Double-Leap Slam: 24t Leap 1 -> 10t Crouch -> 24t Leap 2
    const t = this.state.stateTick;
    if (this.slamPhaseSubStep === 'leap1') {
      const u = clamp(t / SLAM_TICKS_P2, 0, 1);
      this.advanceLeapPosition(u, obsGrid, arenaW, arenaH, bounds);
      if (t >= SLAM_TICKS_P2) {
        this.resolveSlamImpact(ctx, obsGrid, true, out);
        this.state.slamBounceLeft = 0;
        this.slamPhaseSubStep = 'crouch';
        this.state.z = 0;
        this.state.vx = 0;
        this.state.vy = 0;
        this.activeTelegraph = null;
      }
      return;
    }

    if (this.slamPhaseSubStep === 'crouch') {
      this.state.z = 0;
      this.state.vx = 0;
      this.state.vy = 0;
      if (t >= SLAM_TICKS_P2 + SLAM_CROUCH_TICKS_P2) {
        this.slamPhaseSubStep = 'leap2';
        this.configureSlamTarget(ctx.targets, obsGrid, bounds, true);
      }
      return;
    }

    const leap2Tick = t - (SLAM_TICKS_P2 + SLAM_CROUCH_TICKS_P2);
    const u = clamp(leap2Tick / SLAM_TICKS_P2, 0, 1);
    this.advanceLeapPosition(u, obsGrid, arenaW, arenaH, bounds);
    if (leap2Tick >= SLAM_TICKS_P2) {
      this.resolveSlamImpact(ctx, obsGrid, true, out);
      this.state.slamCd = Math.round(BOSS_BEHOLDER_CFG.slamCdTicks * P2_COOLDOWN_MULT);
      this.enterMove(BOSS_BEHOLDER_CFG.p2RecoveryTicks);
    }
  }

  private advanceLeapPosition(
    u: number,
    obsGrid: ObstacleGrid,
    arenaW: number,
    arenaH: number,
    bounds: SandBeholderBounds,
  ): void {
    const desiredX = this.state.slamStartX + (this.state.slamTargetX - this.state.slamStartX) * u;
    const desiredY = this.state.slamStartY + (this.state.slamTargetY - this.state.slamStartY) * u;
    this.state.vx = (desiredX - this.state.x) * BANSUNG_TICK_HZ;
    this.state.vy = (desiredY - this.state.y) * BANSUNG_TICK_HZ;

    tmpBody.x = this.state.x;
    tmpBody.y = this.state.y;
    tmpBody.radius = BOSS_BEHOLDER_CFG.radius;
    moveCircleWithSlide(
      tmpBody,
      desiredX - this.state.x,
      desiredY - this.state.y,
      obsGrid,
      arenaW,
      arenaH,
      0,
    );
    const [cx, cy] = clampPointToBounds(tmpBody.x, tmpBody.y, BOSS_BEHOLDER_CFG.radius, bounds);
    this.state.x = cx;
    this.state.y = cy;
    this.state.z = SLAM_ARC_HEIGHT_PX * Math.sin(Math.PI * u);
  }

  private resolveSlamImpact(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    isP2: boolean,
    out: SandBeholderStepResult,
  ): void {
    this.state.z = 0;
    this.state.vx = 0;
    this.state.vy = 0;
    this.activeTelegraph = null;

    const slamRadius = isP2 ? BOSS_BEHOLDER_CFG.slamRadiusP2 : BOSS_BEHOLDER_CFG.slamRadiusP1;
    const stunTicks = isP2 ? SLAM_STUN_TICKS_P2 : SLAM_STUN_TICKS_P1;
    const stunMs = ticksToMs(stunTicks);

    out.sfx.push('boss_slam_impact');
    out.shockwaves.push({
      x: Math.round(this.state.x),
      y: Math.round(this.state.y),
      r: slamRadius,
      color: '#f59e0b',
      trauma: 0.6,
    });
    out.fx.push(
      FX_BLAST,
      BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
      Math.round(this.state.x),
      Math.round(this.state.y),
      slamRadius,
      this.numId,
    );

    const dmgCtx: BansungDamageContext = {
      rng: ctx.rng,
      fx: out.fx,
      popups: ctx.popupsOut,
    };

    for (let i = 0; i < ctx.targets.length; i++) {
      const t = ctx.targets[i];
      if (!t.alive || t.downed) continue;

      const dx = t.x - this.state.x;
      const dy = t.y - this.state.y;
      const dist = Math.hypot(dx, dy);
      if (dist > slamRadius) continue;

      const inDashIframes =
        (t.dashIframesMs ?? 0) > 0 ||
        (t.combatTarget?.dashIframesMs ?? 0) > 0 ||
        (t.combatTarget?.shieldBuffMs ?? 0) > 0;
      const dmg = dist <= SLAM_INNER_RADIUS_PX ? SLAM_DMG_INNER : SLAM_DMG_OUTER;
      const kdx = dist > 1e-4 ? dx / dist : 1;
      const kdy = dist > 1e-4 ? dy / dist : 0;

      if (inDashIframes) {
        out.heroHits.push({
          targetId: t.id,
          source: 'slam',
          damage: 0,
          dmgKind: 'kinetic',
          knockbackSpeed: 0,
          knockbackDx: kdx,
          knockbackDy: kdy,
          stunTicks: 0,
          stunMs: 0,
          burnTicks: 0,
          burnDps: 0,
          evadedByDash: true,
        });
        continue;
      }

      let dmgRes: BansungDamageResult | undefined;
      if (t.combatTarget) {
        dmgRes = applyBansungDamage(
          t.combatTarget,
          {
            baseDmg: dmg,
            dmgKind: 'kinetic',
            affinity: [1, 1],
            stunMs,
            attackerId: this.state.id,
          },
          dmgCtx,
        );
      }

      out.heroHits.push({
        targetId: t.id,
        source: 'slam',
        damage: dmgRes ? dmgRes.totalDmg : dmg,
        dmgKind: 'kinetic',
        knockbackSpeed: SLAM_KNOCKBACK_SPEED,
        knockbackDx: kdx,
        knockbackDy: kdy,
        stunTicks,
        stunMs: dmgRes ? dmgRes.stunAppliedMs : stunMs,
        burnTicks: 0,
        burnDps: 0,
        evadedByDash: false,
        ...(dmgRes ? { damageResult: dmgRes } : {}),
      });
    }

    // Damage destructible props within slam shockwave
    queryAoeObstacles(obsGrid, this.state.x, this.state.y, slamRadius, 'none', tmpSlamObs);
    for (let i = 0; i < tmpSlamObs.length; i++) {
      const hitObs = tmpSlamObs[i];
      const dmg = Math.max(1, Math.round(SLAM_DMG_INNER * hitObs.falloff));
      out.obstacleHits.push({
        obstacle: hitObs.obstacle,
        damage: dmg,
        falloff: hitObs.falloff,
      });
    }

    // Spawn diagonal rock shards (P1: 4) or cactus spikes (P2: 6)
    const debrisCount = isP2 ? SLAM_SPIKES_P2 : SLAM_SHARDS_P1;
    const debrisKind: SandBeholderProjKind = isP2 ? 'cactus_spike' : 'rock_shard';
    const debrisBase = isP2 ? this.state.aimAngle : Math.PI * 0.25;
    const debrisSpeed = isP2 ? SLAM_SPIKE_SPEED : SLAM_SHARD_SPEED;
    const debrisDmg = isP2 ? SLAM_SPIKE_DMG : SLAM_SHARD_DMG;
    const step = (Math.PI * 2) / debrisCount;

    for (let i = 0; i < debrisCount; i++) {
      this.spawnBossProjectile(
        obsGrid,
        debrisKind,
        debrisBase + i * step,
        BOSS_BEHOLDER_CFG.radius + 6,
        debrisSpeed,
        SLAM_DEBRIS_RADIUS_PX,
        debrisDmg,
        'kinetic',
        SLAM_DEBRIS_TTL_TICKS,
        out,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Attack 3: Pillar-Occluded Cyclops Eye-Beam Sweep
  // --------------------------------------------------------------------------

  private startBeamWindup(
    target: SandBeholderTarget,
    obsGrid: ObstacleGrid,
    out: SandBeholderStepResult,
  ): void {
    this.clearActiveAttacks();
    this.state.state = 'beam_windup';
    this.state.stateTick = 0;
    this.state.lastMove = 'beam_windup';

    const toX = target.x - this.state.x;
    const toY = target.y - this.state.y;
    const theta0 =
      toX * toX + toY * toY > 1e-4 ? Math.atan2(toY, toX) : this.state.aimAngle;
    const cross = toX * (target.vy ?? 0) - toY * (target.vx ?? 0);
    this.state.sweepDir = cross < 0 ? -1 : 1;

    const halfSpan = this.state.phase === 2 ? BEAM_HALF_SPAN_P2_RAD : BEAM_HALF_SPAN_P1_RAD;
    this.state.aimAngle = wrapPi(theta0 - this.state.sweepDir * halfSpan);

    out.sfx.push('boss_beam_charge');
    this.updateBeamGeometry(obsGrid, false);
  }

  private stepBeamWindup(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    out: SandBeholderStepResult,
  ): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;
    this.state.stateTick += 1;

    this.updateBeamGeometry(obsGrid, false);

    if (this.state.stateTick >= BEAM_WINDUP_TICKS) {
      this.state.state = 'beam_sweep';
      this.state.stateTick = 0;
      out.sfx.push('boss_beam_loop');
      this.updateBeamGeometry(obsGrid, true);
    }
  }

  private stepBeamSweep(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    out: SandBeholderStepResult,
  ): void {
    this.state.vx = 0;
    this.state.vy = 0;
    this.state.z = 0;
    this.state.stateTick += 1;

    const isP2 = this.state.phase === 2;
    const stepRad = isP2 ? BEAM_STEP_P2_RAD : BEAM_STEP_P1_RAD;
    this.state.aimAngle = wrapPi(this.state.aimAngle + this.state.sweepDir * stepRad);

    const beam = this.updateBeamGeometry(obsGrid, true);
    out.fx.push(
      FX_BEAM,
      Math.round(beam.x),
      Math.round(beam.y),
      Math.round(beam.endX),
      Math.round(beam.endY),
      BANSUNG_FX_BEAM_BOSS_EYE,
    );

    if (this.state.stateTick % BEAM_HIT_INTERVAL_TICKS === 0) {
      this.resolveBeamTickHits(ctx, obsGrid, beam, out);
    }

    if (isP2 && this.state.stateTick % BEAM_ORB_INTERVAL_TICKS === 0) {
      this.emitPerpendicularSandOrbs(obsGrid, out);
    }

    if (this.state.stateTick >= BEAM_SWEEP_TICKS) {
      this.activeBeam = null;
      this.state.beamCd = isP2
        ? Math.round(BOSS_BEHOLDER_CFG.beamCdTicks * P2_COOLDOWN_MULT)
        : BOSS_BEHOLDER_CFG.beamCdTicks;
      this.enterMove(isP2 ? BOSS_BEHOLDER_CFG.p2RecoveryTicks : BOSS_BEHOLDER_CFG.p1RecoveryTicks);
    }
  }

  private updateBeamGeometry(obsGrid: ObstacleGrid, active: boolean): SandBeholderBeamEvent {
    const cos = Math.cos(this.state.aimAngle);
    const sin = Math.sin(this.state.aimAngle);
    const range = BOSS_BEHOLDER_CFG.beamRange;
    const hit = raycastObstacles(
      obsGrid,
      this.state.x,
      this.state.y,
      this.state.x + cos * range,
      this.state.y + sin * range,
      0,
      'los',
    );
    const hitDist = hit ? hit.t * range : range;
    const endX = this.state.x + cos * hitDist;
    const endY = this.state.y + sin * hitDist;

    this.activeBeam = {
      bossId: this.state.id,
      x: Math.round(this.state.x),
      y: Math.round(this.state.y),
      angleMrad: Math.round(this.state.aimAngle * 1000),
      len: Math.round(hitDist),
      width: BOSS_BEHOLDER_CFG.beamHalfW * 2,
      active,
      endX,
      endY,
    };
    return this.activeBeam;
  }

  private resolveBeamTickHits(
    ctx: SandBeholderStepContext,
    obsGrid: ObstacleGrid,
    beam: SandBeholderBeamEvent,
    out: SandBeholderStepResult,
  ): void {
    const blockedByWall = beam.len < BOSS_BEHOLDER_CFG.beamRange - 0.5;
    const burnMs = Math.round(BEAM_BURN_TICKS * BANSUNG_TICK_EXACT_MS);
    const dmgCtx: BansungDamageContext = {
      rng: ctx.rng,
      fx: out.fx,
      popups: ctx.popupsOut,
    };

    for (let i = 0; i < ctx.targets.length; i++) {
      const t = ctx.targets[i];
      if (!t.alive || t.downed) continue;

      const hitR = BOSS_BEHOLDER_CFG.beamHalfW + t.radius;
      const dSq = distPointToSegmentSq(t.x, t.y, this.state.x, this.state.y, beam.endX, beam.endY);
      if (dSq > hitR * hitR) continue;

      // Guard against sub-25px test walls when raycast terminated on solid cover
      if (blockedByWall && !hasLineOfSight(obsGrid, this.state.x, this.state.y, t.x, t.y, 'los')) {
        continue;
      }

      const inDashIframes =
        (t.dashIframesMs ?? 0) > 0 ||
        (t.combatTarget?.dashIframesMs ?? 0) > 0 ||
        (t.combatTarget?.shieldBuffMs ?? 0) > 0;
      if (inDashIframes) {
        out.heroHits.push({
          targetId: t.id,
          source: 'beam',
          damage: 0,
          dmgKind: 'fire',
          knockbackSpeed: 0,
          knockbackDx: 0,
          knockbackDy: 0,
          stunTicks: 0,
          stunMs: 0,
          burnTicks: 0,
          burnDps: 0,
          evadedByDash: true,
        });
        continue;
      }

      let dmgRes: BansungDamageResult | undefined;
      if (t.combatTarget) {
        dmgRes = applyBansungDamage(
          t.combatTarget,
          {
            baseDmg: BEAM_TICK_DMG,
            dmgKind: 'fire',
            affinity: [1, 1],
            attackerId: this.state.id,
          },
          dmgCtx,
        );
        if (!dmgRes.blocked && t.combatTarget.alive && !t.combatTarget.downed) {
          applyDot(t.combatTarget, 'burn', this.state.id, {
            durMs: burnMs,
            tickDmgOverride: BEAM_BURN_TICK_DMG,
            popups: ctx.popupsOut,
          });
        }
      }

      out.heroHits.push({
        targetId: t.id,
        source: 'beam',
        damage: dmgRes ? dmgRes.totalDmg : BEAM_TICK_DMG,
        dmgKind: 'fire',
        knockbackSpeed: 0,
        knockbackDx: 0,
        knockbackDy: 0,
        stunTicks: 0,
        stunMs: 0,
        burnTicks: BEAM_BURN_TICKS,
        burnDps: BEAM_BURN_DPS,
        evadedByDash: false,
        ...(dmgRes ? { damageResult: dmgRes } : {}),
      });
    }
  }

  private emitPerpendicularSandOrbs(obsGrid: ObstacleGrid, out: SandBeholderStepResult): void {
    const leftPerp = this.state.aimAngle + Math.PI * 0.5;
    const rightPerp = this.state.aimAngle - Math.PI * 0.5;
    const spawnR = BOSS_BEHOLDER_CFG.radius + 4;

    for (let s = -1; s <= 1; s++) {
      this.spawnBossProjectile(
        obsGrid,
        'sand_spark',
        leftPerp + s * BEAM_ORB_SPREAD_RAD,
        spawnR,
        BEAM_ORB_SPEED,
        BEAM_ORB_RADIUS_PX,
        BEAM_ORB_DMG,
        'fire',
        BEAM_ORB_TTL_TICKS,
        out,
      );
      this.spawnBossProjectile(
        obsGrid,
        'sand_spark',
        rightPerp + s * BEAM_ORB_SPREAD_RAD,
        spawnR,
        BEAM_ORB_SPEED,
        BEAM_ORB_RADIUS_PX,
        BEAM_ORB_DMG,
        'fire',
        BEAM_ORB_TTL_TICKS,
        out,
      );
    }
  }

  // --------------------------------------------------------------------------
  // Target Selection, Projectiles & Helpers
  // --------------------------------------------------------------------------

  private selectTarget(
    targets: readonly SandBeholderTarget[],
    obsGrid: ObstacleGrid,
  ): SandBeholderTarget | null {
    let current: SandBeholderTarget | null = null;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.id === this.state.targetId && t.alive && !t.downed) {
        current = t;
        break;
      }
    }

    if (current) {
      const currentLos = hasLineOfSight(
        obsGrid,
        this.state.x,
        this.state.y,
        current.x,
        current.y,
        'los',
      );
      this.unseenTicks = currentLos ? 0 : this.unseenTicks + 1;
    } else {
      this.unseenTicks = UNSEEN_RETARGET_TICKS + 1;
    }

    if (this.state.retargetTicks > 0) {
      this.state.retargetTicks -= 1;
    }

    if (!current || this.unseenTicks > UNSEEN_RETARGET_TICKS || this.state.retargetTicks <= 0) {
      let best: SandBeholderTarget | null = null;
      let bestScore = -Infinity;
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.alive || t.downed || !Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
        const dist = Math.hypot(t.x - this.state.x, t.y - this.state.y);
        const los = hasLineOfSight(obsGrid, this.state.x, this.state.y, t.x, t.y, 'los');
        const threat = (this.threatByHero.get(t.id) ?? 0) + (t.threat ?? 0);
        const score = threat - dist * 0.35 + (los ? 120 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      this.state.targetId = best ? best.id : null;
      this.state.retargetTicks = RETARGET_INTERVAL_TICKS;
      if (best !== current) this.unseenTicks = 0;
      return best;
    }

    return current;
  }

  private hasAliveHeroWithin(targets: readonly SandBeholderTarget[], maxDist: number): boolean {
    const maxD2 = maxDist * maxDist;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive || t.downed) continue;
      const dx = t.x - this.state.x;
      const dy = t.y - this.state.y;
      if (dx * dx + dy * dy <= maxD2) return true;
    }
    return false;
  }

  private pickSlamHero(
    targets: readonly SandBeholderTarget[],
    preferNonStunned: boolean,
  ): SandBeholderTarget | null {
    let best: SandBeholderTarget | null = null;
    let bestD2 = Infinity;
    let fallback: SandBeholderTarget | null = null;
    let fallbackD2 = Infinity;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive || t.downed || !Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
      const dx = t.x - this.state.x;
      const dy = t.y - this.state.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < fallbackD2) {
        fallbackD2 = d2;
        fallback = t;
      }
      const isStunned = (t.combatTarget?.stunMs ?? 0) > 0;
      if ((!preferNonStunned || !isStunned) && d2 < bestD2) {
        bestD2 = d2;
        best = t;
      }
    }
    return best ?? fallback;
  }

  private spawnBossProjectile(
    obsGrid: ObstacleGrid,
    kind: SandBeholderProjKind,
    rawAngle: number,
    spawnOffsetPx: number,
    speed: number,
    radius: number,
    damage: number,
    dmgKind: BansungDamageKind,
    ttlTicks: number,
    out: SandBeholderStepResult,
  ): void {
    const angle = wrapPi(rawAngle);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = this.state.x + cos * spawnOffsetPx;
    const sy = this.state.y + sin * spawnOffsetPx;

    if (checkMuzzleWallGuard(obsGrid, this.state.x, this.state.y, sx, sy, radius, 'bullet')) {
      return;
    }

    out.projectiles.push({
      ownerId: this.state.id,
      kind,
      x: sx,
      y: sy,
      vx: cos * speed,
      vy: sin * speed,
      angle,
      speed,
      radius,
      damage,
      dmgKind,
      ttlTicks,
    });
  }

  private computeTelegraphPct(): number {
    const s = this.state.state;
    const t = this.state.stateTick;
    if (s === 'slam_leap') {
      const leapLen = this.state.phase === 2 ? SLAM_TICKS_P2 : SLAM_TICKS_P1;
      if (this.slamPhaseSubStep === 'crouch') return 0;
      const subTick =
        this.slamPhaseSubStep === 'leap2' ? t - (SLAM_TICKS_P2 + SLAM_CROUCH_TICKS_P2) : t;
      return Math.min(100, Math.round((subTick / leapLen) * 100));
    }
    if (s === 'beam_windup') {
      return Math.min(100, Math.round((t / BEAM_WINDUP_TICKS) * 100));
    }
    return 0;
  }

  private computeEnemyFlags(): number {
    let flags = BANSUNG_EFLAG_ARMORED;
    if (Math.cos(this.state.aimAngle) < 0) flags |= BANSUNG_EFLAG_LEFT;
    if (this.state.state === 'stagger') flags |= BANSUNG_EFLAG_STUNNED;
    if ((this.combatTarget.hitFlashMs ?? 0) > 0) flags |= BANSUNG_EFLAG_HIT_FLASH;
    if (this.combatTarget.dots?.burn) flags |= BANSUNG_EFLAG_BURNING;
    if (this.activeTelegraph || this.state.state === 'beam_windup') {
      flags |= BANSUNG_EFLAG_TELEGRAPH;
    }
    if (this.isInvulnerable()) flags |= BANSUNG_EFLAG_SHIELDED;
    return flags;
  }

  private emitCallbacks(
    callbacks: SandBeholderCallbacks | undefined,
    out: SandBeholderStepResult,
  ): void {
    if (!callbacks) return;
    if (callbacks.onSpawnProjectile) {
      for (let i = 0; i < out.projectiles.length; i++) {
        callbacks.onSpawnProjectile(out.projectiles[i]);
      }
    }
    if (callbacks.onSpawnAdd) {
      for (let i = 0; i < out.addSpawns.length; i++) {
        callbacks.onSpawnAdd(out.addSpawns[i]);
      }
    }
    if (callbacks.onHeroHit) {
      for (let i = 0; i < out.heroHits.length; i++) {
        callbacks.onHeroHit(out.heroHits[i]);
      }
    }
    if (callbacks.onObstacleHit) {
      for (let i = 0; i < out.obstacleHits.length; i++) {
        callbacks.onObstacleHit(out.obstacleHits[i]);
      }
    }
    callbacks.onTelegraphCircle?.(out.telegraphCircle);
    callbacks.onBossBeam?.(out.bossBeam);
    if (callbacks.onShockwave) {
      for (let i = 0; i < out.shockwaves.length; i++) {
        callbacks.onShockwave(out.shockwaves[i]);
      }
    }
    if (callbacks.onPushback) {
      for (let i = 0; i < out.pushbacks.length; i++) {
        callbacks.onPushback(out.pushbacks[i]);
      }
    }
    if (callbacks.onSfx) {
      for (let i = 0; i < out.sfx.length; i++) {
        callbacks.onSfx(out.sfx[i]);
      }
    }
    if (out.rewards && callbacks.onDeathRewards) {
      callbacks.onDeathRewards(out.rewards);
    }
  }
}

/** Factory helper creating a configured `SandBeholderBoss` controller. */
export function createSandBeholderBoss(opts: SandBeholderSpawnOptions = {}): SandBeholderBoss {
  return new SandBeholderBoss(opts);
}
