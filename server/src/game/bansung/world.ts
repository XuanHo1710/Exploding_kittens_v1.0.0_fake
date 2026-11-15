/**
 * Authoritative 30Hz co-op twin-stick shooter world (`BansungWorld`) connecting:
 *  - Deterministic arena & destructible props (`map.ts`, `spatial.ts`)
 *  - Anti-cheat validation, rate limiting & claim locks (`security.ts`)
 *  - Heroes, weapons, bullet pool & dodge-dash / gadgets (`weapons.ts`, `gadgets.ts`)
 *  - Mobs, flocking & 3 biome bosses (`mobs.ts`, `flocking.ts`, `boss-sand.ts`, `boss-colossus.ts`, `boss-overlord.ts`)
 *  - Loot pickups, co-op perks, bots & pet companions (`pickups.ts`, `bot.ts`, `director.ts`)
 *  - 64px-bucket viewport-culled quantized `BansungFrame` & MVP scoreboard `BansungResult`
 */

import {
  BANSUNG_AIM_STEPS,
  BANSUNG_BOT_LEVELS,
  BANSUNG_BFLAG_EXPLOSIVE,
  BANSUNG_BFLAG_FROM_ENEMY,
  BANSUNG_DIFFICULTY_SCALE,
  BANSUNG_DMG_HEAL,
  BANSUNG_EFLAG_ARMORED,
  BANSUNG_EFLAG_ELITE,
  BANSUNG_EFLAG_LEFT,
  BANSUNG_EFLAG_SHIELDED,
  BANSUNG_EFLAG_STUNNED,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_INDEX,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_HERO_NOVA,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_IMPACT_FLESH,
  BANSUNG_FX_STATUS_BOSS_PART_BREAK,
  BANSUNG_FX_STATUS_CRATE,
  BANSUNG_FX_STATUS_GACHA,
  BANSUNG_FX_STATUS_HERO_SKILL,
  BANSUNG_FX_STATUS_LEVELUP,
  BANSUNG_GADGETS,
  BANSUNG_HERO_ENERGY_REGEN,
  BANSUNG_HERO_INDEX,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_MELEE_SPECIALS,
  BANSUNG_MVP_WEIGHTS,
  BANSUNG_PFLAG_BOT,
  BANSUNG_PFLAG_DISCONNECTED,
  BANSUNG_PFLAG_HIT_FLASH,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_LEFT,
  BANSUNG_PLAYER_FIELDS,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_PROJECTILE_KINDS,
  BANSUNG_PROP_INDEX,
  BANSUNG_STAMINA,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DASH,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BANSUNG_TOTAL_WAVES,
  BANSUNG_WEAPON_INDEX,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  FX_DMG,
  FX_IMPACT,
  FX_PING,
  FX_STATUS,
  computeBossHpMult,
  dequantizeAim,
  getBansungHero,
  getBossHpBars,
  getWeaponSpec,
  getXpToNextLevel,
  normalizeBansungConfig,
  normalizeBansungHero,
  quantizeAim,
  resolveBansungGameMode,
  rollSurvivalGachaCards,
  type AggregatedPerkMods,
  type BansungBadgeId,
  type BansungBossFrame,
  type BansungCommand,
  type BansungConfig,
  type BansungEnemyId,
  type BansungFrame,
  type BansungGachaCard,
  type BansungGadgetId,
  type BansungGameMode,
  type BansungHazard,
  type BansungHazardWire,
  type BansungHeroId,
  type BansungPerkId,
  type BansungPetFrame,
  type BansungPetNetTuple,
  type BansungPlayerGadgetSlot,
  type BansungPlayerInfo,
  type BansungPlayerResult,
  type BansungPlayerStats,
  type BansungPrivate,
  type BansungResult,
  type BansungSurvivalStageId,
  type BansungTelegraph,
  type BansungTelegraphWire,
  type BansungUnitState,
  type BansungWaveHud,
  type BansungWeaponId,
  type BansungWeaponSlot,
} from '../../../../shared/src';
import {
  BANSUNG_DAMAGE_KIND_INDEX,
  BANSUNG_SHIELD,
  applyBansungDamage,
  applyDot,
  applyStunWithDR,
  tickHeroShield,
  tickStatuses,
  type BansungCombatTarget,
  type BansungDamageContext,
  type BansungDamageHit,
  type BansungDamageKind,
  type BansungDamageResult,
} from './damage';
import {
  WAVE_CLEAR_INVULN_S,
  WaveDirector,
  applyWaveClearRevives,
  type DirectorArtilleryTarget,
  type DirectorBeaconStatus,
  type DirectorBossSpawn,
  type DirectorPortalGate,
  type DirectorPlayerRef,
  type DirectorStepOutput,
} from './director';
import {
  COLOSSUS_STATE,
  createDreadColossus,
  damageColossusDrone,
  damageDreadColossus,
  stepDreadColossus,
  stunColossusBoss,
  syncColossusDrones,
  toColossusBossFrame,
  type ColossusDrone,
  type ColossusPlayerTarget,
  type DreadColossusState,
} from './boss-colossus';
import {
  createOverlordBoss,
  damageOverlordBoss,
  damageOverlordPylon,
  damageOverlordWeakPoint,
  getOverlordTelegraphs,
  mapOverlordToUnitState,
  stepOverlordBoss,
  toOverlordBossFrame,
  toOverlordView,
  type OverlordBossState,
  type OverlordPlayerTarget,
  type OverlordPylon,
  type OverlordWeakPoint,
} from './boss-overlord';
import {
  SandBeholderBoss,
  createSandBeholderBoss,
  stunMsToBossStagger,
} from './boss-sand';
import {
  createArsenalBoss,
  stepArsenalBoss,
  stunArsenalBoss,
  toArsenalBossFrame,
  type ArsenalBossState,
  type ArsenalPlayerTarget,
} from './boss-arsenal';
import {
  createTempestBoss,
  stepTempestBoss,
  stunTempestBoss,
  toTempestBossFrame,
  type TempestBossState,
  type TempestPlayerTarget,
} from './boss-tempest';
import {
  createDestroyerBoss,
  stepDestroyerBoss,
  stunDestroyerBoss,
  toDestroyerBossFrame,
  type DestroyerBossState,
  type DestroyerPlayerTarget,
} from './boss-destroyer';
import {
  createFrostEmpressBoss,
  stepFrostEmpressBoss,
  stunFrostEmpressBoss,
  toFrostEmpressBossFrame,
  type FrostEmpressBossState,
  type FrostEmpressPlayerTarget,
} from './boss-frost-empress';
import {
  createLeviathanBoss,
  stepLeviathanBoss,
  stunLeviathanBoss,
  toLeviathanBossFrame,
  type LeviathanBossState,
  type LeviathanPlayerTarget,
} from './boss-leviathan';
import {
  createBossPartGroup,
  evaluateBossPartBreaks,
  syncBossPartsPositions,
  toBossPartViews,
  type BossBodyPartState,
  type BossPartGroupState,
} from './boss-parts';
import {
  BANSUNG_CRAWL_MULT,
  createBotBrain,
  createPetState,
  enterDownedState,
  runBansungBot,
  serializePetTuple,
  stepDownedAndRevive,
  stepPets,
  type BansungPetState,
  type BotBrain,
  type BotEnemyView,
  type BotPickupView,
  type BotPlayerView,
  type BotProjectileView,
  type BotWorldView,
} from './bot';
import {
  activateGadget,
  cancelHeroDash,
  collectTurretSpatialActors,
  createGadgetWorldState,
  createHeroDashState,
  createPlayerGadgetSlot,
  getDroneDownedSupport,
  getHeroDashFlags,
  isDashing,
  isDashInvulnerable,
  packGadgetBullets,
  packGadgetProps,
  queueHeroDash,
  stepGadgetWorld,
  stepHeroDash,
  syncDashToCombatTarget,
  tickGadgetSlot,
  toBansungGadgetState,
  type GadgetEnemyActor,
  type GadgetPlayerActor,
  type GadgetWorldState,
  type HeroDashState,
} from './gadgets';
import {
  buildServerArena,
  clampPointToPlayable,
  damagePropByObstacleId,
  packBreakableProps,
  packStaticArenaObstacles,
  stepBarrelDetonations,
  tickArenaProps,
  type BarrelCombatActor,
  type PropBreakEvent,
  type ServerArena,
} from './map';
import {
  createMobManager,
  destroyMobProjectilesInRadius,
  drainMobFx,
  getMobHazards,
  getMobTelegraphs,
  pruneDeadMobs,
  spawnMob,
  spawnMobFromDirector,
  stepMobs,
  stunMob,
  toEnemyTuple,
  type BansungEnemyTuple,
  type MobCombatEntity,
  type MobManager,
  type MobState,
  type MobStepCallbacks,
} from './mobs';
import {
  BANSUNG_STATIC_SHIELD_CONSTS,
  PickupManager,
  aggregatePerkMods,
  applySurvivalGachaSkillToHero,
  computeCoopAuraDamageMult,
  ensureSurvivalHeroGachaState,
  onHeroEnemyKill,
  recomputeHeroStats,
  spawnEnemyXpOrbs,
  type PickupHeroState,
} from './pickups';
import {
  BANSUNG_SEC_LIMITS,
  BansungRateLimiter,
  EntityClaimLock,
  canSendTacticalPing,
  canSwapWeapon,
  createPlayerActionGuard,
  isCmdAllowedInLifeState,
  isWithinInteractRadius,
  markTacticalPing,
  markWeaponSwap,
  validateBansungCommand,
  type BansungLifeState,
  type PlayerActionGuardState,
} from './security';
import {
  ActorGrid,
  LAYER_ENEMY,
  LAYER_PET,
  LAYER_PLAYER,
  moveCircleWithSlide,
  raycastObstacles,
  resolveObstacles,
  type CircleBody,
  type SpatialActor,
} from './spatial';
import {
  BANSUNG_MAX_WEAPON_SLOTS,
  BansungBulletPool,
  applyReviveEnergyFloor,
  buildWeaponSlotsSnapshot,
  cancelHeroWeaponActions,
  createHeroWeaponState,
  equipWeaponInSlot,
  getHeroActiveWeaponTier,
  getHeroPlayerFlags,
  getHeroWeaponMoveMult,
  handleHeroReloadCmd,
  restoreWaveEnergy,
  stepBulletPool,
  stepHeroMeleeSwing,
  switchHeroWeaponSlot,
  tickHeroWeapons,
  upgradeHeroWeaponTier,
  type BansungHeroWeaponState,
  type BansungWeaponWorldContext,
} from './weapons';

// ============================================================================
// 1. Public World Contracts & Constants
// ============================================================================

export interface BansungInit {
  id: string;
  name: string;
  color: string;
  hero: BansungHeroId | string;
  bot: boolean;
  avatar?: string;
}

export interface BansungWorldHooks {
  /** Called after every 30Hz step so server transport broadcasts snapshots. */
  tick(): void;
  /** Called when player status, logs, perk draft state, or match result changes. */
  changed(): void;
  /** Optional persistence / profile stats hook when a match finishes. */
  onStatsChanged?(): void;
  /** Optional post-game payout / room summary hook. */
  end?(result: BansungResult): void;
}

export interface BansungWorldOptions {
  seed?: number;
  rng?: () => number;
  skipWarmup?: boolean;
}

export interface BansungRuntimePlayer extends BansungCombatTarget, PickupHeroState {
  idx: number;
  actorId: number;
  id: string;
  numId: number;
  name: string;
  avatar?: string;
  color: string;
  heroId: BansungHeroId;
  bot: boolean;
  left: boolean;

  team: number;
  layer: number;
  radius: number;
  tier: 'hero';
  armorType: 'light';
  flatArmor: number;

  life: BansungLifeState;
  alive: boolean;
  downed: boolean;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  shield: number;
  maxShield: number;
  baseMaxShield: number;
  armor: number;
  maxArmor: number;
  baseMaxArmor: number;
  energy: number;
  maxEnergy: number;
  baseMaxEnergy: number;
  moveSpeed: number;
  speed: number;
  baseMoveSpeed: number;

  x: number;
  y: number;
  vx: number;
  vy: number;
  knockVx: number;
  knockVy: number;
  aimRad: number;
  aimCos: number;
  moveDirX: number;
  moveDirY: number;
  fireHeld: boolean;
  fireQueuedPulse?: boolean;

  downCountWave: number;
  reviveProg: number;
  reviveContrib: Record<string, number>;
  rescuersCount: number;
  bleedLeft: number;
  bleedMax: number;
  invulnTimer: number;
  droneTethered: boolean;
  reviveSpeedMul: number;

  stamina: number;
  maxStamina: number;
  staminaRegenDelayS: number;

  dash: HeroDashState;
  weaponState: BansungHeroWeaponState;
  gadgetSlot: BansungPlayerGadgetSlot;
  guard: PlayerActionGuardState;
  slots: (BansungWeaponSlot | null)[];
  slotIdx: number;
  sidearmWeapon: BansungWeaponId;
  pedestalSwapCdS: number;
  empoweredMask: number;
  slowPct?: number;
  slowMs?: number;

  perks: BansungPerkId[];
  mods: AggregatedPerkMods;
  perkChoices?: BansungPerkId[];
  xp: number;
  xpToNext: number;
  level: number;
  gachaChoices?: BansungGachaCard[];
  gachaPending: number;
  gachaQueue: number;
  gachaTimerMs: number;
  gachaRemMs: number;
  gachaGraceMs: number;
  gachaBotWaitMs: number;
  skillStacks: Record<string, number>;
  skillCdMs: number;
  skillMaxMs: number;
  skillActiveMs: number;
  coins: number;
  kills: number;
  killHealProgress: number;
  staticShieldCdS: number;

  hasPet: boolean;
  petAlive: boolean;
  pet: BansungPetState;
  brain?: BotBrain;
  specTargetIdx: number;
  lastCactusHitTick: number;

  stats: {
    kills: number;
    elitesKilled: number;
    damageDealt: number;
    bossDamage: number;
    damageTaken: number;
    stunsInflicted: number;
    revives: number;
    deaths: number;
  };
}

interface BossProjectile {
  id: number;
  kindId: number;
  ownerActorId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  dmgKind: BansungDamageKind;
  ttlTicks: number;
  armored: boolean;
}

interface ActiveBossMeta {
  scale?: number;
  splitTier?: number;
  miniBoss?: boolean;
  dmgScale?: number;
  baseHpMult?: number;
}

type ActiveBossEntry = ActiveBossMeta & {
  partGroup: BossPartGroupState;
} & (
  | {
      kind: 'boss_beholder';
      numId: number;
      boss: SandBeholderBoss;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_colossus';
      numId: number;
      boss: DreadColossusState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_overlord';
      numId: number;
      boss: OverlordBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_arsenal';
      numId: number;
      boss: ArsenalBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_tempest';
      numId: number;
      boss: TempestBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_destroyer';
      numId: number;
      boss: DestroyerBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_frost_empress';
      numId: number;
      boss: FrostEmpressBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
  | {
      kind: 'boss_abyssal_leviathan';
      numId: number;
      boss: LeviathanBossState;
      lastPhaseBurstPctIdx: number;
      deadEmitted: boolean;
    }
);

type AuxTargetBinding =
  | {
      kind: 'sand_boss';
      entry: Extract<ActiveBossEntry, { kind: 'boss_beholder' }>;
      prevHp: number;
      radius: number;
      lastDamagedBy?: string;
      target: BansungCombatTarget;
    }
  | {
      kind: 'boss_part';
      entry: ActiveBossEntry;
      partIdx: number;
      part: BossBodyPartState;
      prevHp: number;
      radius: number;
      lastDamagedBy?: string;
      target: BansungCombatTarget;
    }
  | { kind: 'overlord_wp'; boss: OverlordBossState; wpIdx: number; prevHp: number; radius: number; target: BansungCombatTarget }
  | { kind: 'overlord_pylon'; boss: OverlordBossState; pylonId: number; prevHp: number; radius: number; target: BansungCombatTarget }
  | { kind: 'portal_gate'; gateId: number; prevHp: number; radius: number; target: BansungCombatTarget }
  | { kind: 'turret'; deployableId: number; radius: number; target: BansungCombatTarget };

interface QuantizedEnemyEntry {
  x: number;
  y: number;
  tuple: BansungEnemyTuple;
}

interface QuantizedBulletEntry {
  x: number;
  y: number;
  id: number;
  kindId: number;
  aimQ: number;
  flags: number;
}

const HERO_STAT_SCALE = 10;
const DT_S = 1 / BANSUNG_TICK_HZ;
const DT_MS = BANSUNG_TICK_EXACT_MS;
const PUMP_POLL_MS = 15;
const MAX_FRAME_GAP_MS = 100;
const MAX_STEPS_PER_POLL = 3;
const CULL_BUCKET_SIZE = 64;
const VIEWPORT_HALF_W = 860;
const VIEWPORT_HALF_H = 540;
const FRAME_ENEMY_CAP = 64;
const FRAME_BULLET_CAP = 96;
const FRAME_FX_CAP = 48;
const KNOCKBACK_DECAY_PER_S = 10;
const STATIC_SHIELD_DMG_THRESHOLD = 1;
const PORTAL_GATE_SPATIAL_BASE = 800_000;
const AUX_SPATIAL_BASE = 950_000;
const TURRET_SPATIAL_BASE = 100_000;

const HERO_DEFAULT_GADGET: Readonly<Record<BansungHeroId, BansungGadgetId>> = {
  mascot: 'cluster_bomb',
  ranger: 'stun_bomb',
  pyro: 'heal_drone',
  knight: 'auto_turret',
};

const BOSS_PHASE_BURST_THRESHOLDS = [0.75, 0.5, 0.25] as const;

const GACHA_CHOICE_TIMEOUT_MS = 14_000;
const GACHA_POP_GRACE_MS = 1500;
const BOT_GACHA_AUTO_PICK_MS = 800;

const BOT_GACHA_CATEGORY_PRIORITY: Readonly<Record<string, number>> = {
  weapon_upgrade: 0,
  skill_damage: 1,
  skill_hp: 2,
  skill_stamina: 2,
  skill_shield: 2,
  skill_firerate: 3,
  skill_multishot: 4,
  skill_crit: 5,
  skill_mobility: 6,
};

const GACHA_RARITY_RANK: Readonly<Record<string, number>> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  common: 1,
};

const SHOT_KIND_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
  BANSUNG_PROJECTILE_KINDS.map((k, idx) => [k, idx]),
);

function createMulberry32(seed: number): () => number {
  let t = (seed >>> 0) || 0x9e3779b9;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resolveEnemyProjKindId(kind: string): number {
  if (kind in SHOT_KIND_BY_NAME) return SHOT_KIND_BY_NAME[kind];
  switch (kind) {
    case 'thunderball':
    case 'boss_thunderball':
    case 'shock_bolt':
    case 'chrono_bolt':
    case 'void_arc':
    case 'mirror_slash':
    case 'zap':
      return SHOT_KIND_BY_NAME.thunder_orb ?? 11;
    case 'frost_bolt':
      return SHOT_KIND_BY_NAME.cryo_shard ?? 22;
    case 'void_bolt':
      return SHOT_KIND_BY_NAME.gravity_orb ?? 24;
    case 'plasma_orb':
    case 'smite_bolt':
    case 'plasma':
      return SHOT_KIND_BY_NAME.plasma_bolt ?? 10;
    case 'heavy_bolt':
    case 'sniper_slug':
    case 'laser':
      return SHOT_KIND_BY_NAME.rail_beam ?? 8;
    case 'fireball':
    case 'fireball_split':
    case 'solar_orb':
      return SHOT_KIND_BY_NAME.arcane_fireball ?? 12;
    case 'pet_ember':
    case 'spit':
    case 'venom':
    case 'venom_spit':
    case 'blight_glob':
    case 'plague_acid':
      return SHOT_KIND_BY_NAME.arcane_ember ?? 13;
    case 'cactus_needle':
    case 'thorn':
    case 'needle_orb':
      return SHOT_KIND_BY_NAME.shotgun_pellet ?? 2;
    default:
      return SHOT_KIND_BY_NAME.kinetic_md ?? 1;
  }
}

// ============================================================================
// 2. MVP Score & Result Builders (d46)
// ============================================================================

export function computeBansungPlayerScore(
  stats: Pick<
    BansungPlayerStats,
    | 'kills'
    | 'elitesKilled'
    | 'damageDealt'
    | 'bossDamage'
    | 'stunsInflicted'
    | 'revives'
    | 'deaths'
  >,
): number {
  const raw =
    stats.kills * BANSUNG_MVP_WEIGHTS.kill +
    stats.elitesKilled * BANSUNG_MVP_WEIGHTS.elite +
    stats.damageDealt * BANSUNG_MVP_WEIGHTS.damage +
    stats.bossDamage * BANSUNG_MVP_WEIGHTS.bossDamage +
    stats.stunsInflicted * BANSUNG_MVP_WEIGHTS.stun +
    stats.revives * BANSUNG_MVP_WEIGHTS.revive +
    stats.deaths * BANSUNG_MVP_WEIGHTS.death;
  return Math.max(0, Math.round(raw));
}

export function buildBansungResult(params: {
  victory: boolean;
  reason: string;
  wavesCleared: number;
  totalWaves: number;
  wave: number;
  durationMs: number;
  mode?: BansungGameMode;
  cycle?: number;
  stageId?: BansungSurvivalStageId;
  level?: number;
  players: readonly BansungRuntimePlayer[];
}): BansungResult {
  const playerStats: BansungPlayerStats[] = params.players.map((p) => {
    const score = computeBansungPlayerScore(p.stats);
    return {
      id: p.id,
      name: p.name,
      heroId: p.heroId,
      bot: p.bot,
      ...(p.left ? { left: true } : {}),
      kills: p.stats.kills,
      elitesKilled: p.stats.elitesKilled,
      damageDealt: Math.round(p.stats.damageDealt),
      bossDamage: Math.round(p.stats.bossDamage),
      damageTaken: Math.round(p.stats.damageTaken),
      stunsInflicted: p.stats.stunsInflicted,
      revives: p.stats.revives,
      deaths: p.stats.deaths,
      score,
      badges: [],
      coinDelta: Math.round(p.coins),
    };
  });

  // Sort by score descending, deterministic tiebreak by damageDealt then name
  playerStats.sort(
    (a, b) =>
      b.score - a.score || b.damageDealt - a.damageDealt || a.id.localeCompare(b.id),
  );

  // Assign MVP: highest-scoring non-left human, fallback top scorer
  const activeHumans = playerStats.filter((p) => !p.bot && !p.left);
  const mvpCandidate =
    activeHumans[0] ?? playerStats.find((p) => !p.left) ?? playerStats[0];
  const mvpId = mvpCandidate?.id;
  if (mvpCandidate) {
    mvpCandidate.badges.push('mvp');
  }

  // Assign specialty badges
  const awardMaxBadge = (
    badge: BansungBadgeId,
    selector: (s: BansungPlayerStats) => number,
    minThreshold = 1,
  ) => {
    let best: BansungPlayerStats | undefined;
    let bestVal = minThreshold - 0.0001;
    for (const s of playerStats) {
      const v = selector(s);
      if (v > bestVal) {
        bestVal = v;
        best = s;
      }
    }
    if (best && !best.badges.includes(badge)) {
      best.badges.push(badge);
    }
  };

  awardMaxBadge('slayer', (s) => s.kills, 1);
  awardMaxBadge('medic', (s) => s.revives, 1);
  awardMaxBadge('stunner', (s) => s.stunsInflicted, 1);
  awardMaxBadge('boss_breaker', (s) => s.bossDamage, 1);

  const compactStats: BansungPlayerResult[] = params.players.map((p) => ({
    idx: p.idx,
    id: p.id,
    kills: p.stats.kills,
    damage: Math.round(p.stats.damageDealt),
    stuns: p.stats.stunsInflicted,
    revives: p.stats.revives,
    coinPayout: Math.round(p.coins),
  }));

  return {
    victory: params.victory,
    reason: params.reason,
    wavesCleared: params.wavesCleared,
    totalWaves: params.totalWaves,
    wave: params.wave,
    ...(params.mode !== undefined ? { mode: params.mode } : {}),
    ...(params.cycle !== undefined ? { cycle: params.cycle } : {}),
    ...(params.stageId !== undefined ? { stageId: params.stageId } : {}),
    ...(params.level !== undefined ? { level: params.level } : {}),
    durationMs: Math.round(params.durationMs),
    ...(mvpId ? { mvpId } : {}),
    players: playerStats,
    stats: compactStats,
  };
}

// ============================================================================
// 3. Spatial 64px Culling Grid Helper
// ============================================================================

class ViewportBucketIndex<T extends { x: number; y: number }> {
  readonly cols: number;
  readonly rows: number;
  private readonly buckets: T[][];

  constructor(mapW: number, mapH: number) {
    this.cols = Math.max(1, Math.ceil(mapW / CULL_BUCKET_SIZE));
    this.rows = Math.max(1, Math.ceil(mapH / CULL_BUCKET_SIZE));
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (let i = 0; i < this.buckets.length; i++) {
      this.buckets[i].length = 0;
    }
  }

  insert(item: T): void {
    const cx = clamp(Math.floor(item.x / CULL_BUCKET_SIZE), 0, this.cols - 1);
    const cy = clamp(Math.floor(item.y / CULL_BUCKET_SIZE), 0, this.rows - 1);
    this.buckets[cy * this.cols + cx].push(item);
  }

  queryRect(x0: number, y0: number, x1: number, y1: number, out: T[]): void {
    out.length = 0;
    const minCx = clamp(Math.floor(x0 / CULL_BUCKET_SIZE), 0, this.cols - 1);
    const maxCx = clamp(Math.floor(x1 / CULL_BUCKET_SIZE), 0, this.cols - 1);
    const minCy = clamp(Math.floor(y0 / CULL_BUCKET_SIZE), 0, this.rows - 1);
    const maxCy = clamp(Math.floor(y1 / CULL_BUCKET_SIZE), 0, this.rows - 1);

    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowOffset = cy * this.cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const list = this.buckets[rowOffset + cx];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          if (item.x >= x0 && item.x <= x1 && item.y >= y0 && item.y <= y1) {
            out.push(item);
          }
        }
      }
    }
  }
}

// ============================================================================
// 4. Authoritative BansungWorld 30Hz Simulation Orchestrator
// ============================================================================

export class BansungWorld implements BotWorldView {
  readonly W: number;
  readonly H: number;
  readonly arenaSeed: number;
  readonly config: BansungConfig;
  readonly startedAt = Date.now();

  tickNo = 0;
  elapsedMs = 0;
  result?: BansungResult;
  players: BansungRuntimePlayer[] = [];

  private readonly arena: ServerArena;
  readonly rng: () => number;
  private readonly actorGrid: ActorGrid;
  private readonly mobMgr: MobManager;
  private readonly director: WaveDirector;
  private readonly bulletPool: BansungBulletPool;
  private readonly gadgetState: GadgetWorldState;
  private readonly pickupMgr: PickupManager;
  private readonly rateLimiter = new BansungRateLimiter();
  private readonly claimLock = new EntityClaimLock();

  private readonly hooks: BansungWorldHooks;
  private readonly playerById = new Map<string, BansungRuntimePlayer>();
  private readonly playerByActorId = new Map<number, BansungRuntimePlayer>();
  private readonly auxTargets = new Map<number, AuxTargetBinding>();
  private readonly processedDeadMobs = new Set<string>();
  private readonly viewerInitialized = new Set<string>();
  private readonly viewerSrvStageKey = new Map<string, string>();
  private readonly queuedHumanCmds = new Map<string, BansungCommand[]>();

  private activeBosses: ActiveBossEntry[] = [];
  private bossProjectiles: BossProjectile[] = [];
  fx: number[] = [];
  private logs: string[] = [];
  private colossusTargets: ColossusPlayerTarget[] = [];

  private bossSeq = 1;
  private nextBossProjId = 1;
  private nextAuxSpatialId = AUX_SPATIAL_BASE;
  private hadGadgetPropsLastTick = false;
  private bossKillsThisTick = 0;
  private lastBossDeathPos?: { x: number; y: number };

  private readonly enemyBuckets: ViewportBucketIndex<QuantizedEnemyEntry>;
  private readonly bulletBuckets: ViewportBucketIndex<QuantizedBulletEntry>;
  private readonly tmpSpatialActors: SpatialActor[] = [];
  private readonly tmpEnemyBucketOut: QuantizedEnemyEntry[] = [];
  private readonly tmpBulletBucketOut: QuantizedBulletEntry[] = [];

  private timer?: NodeJS.Timeout;
  private accumulatorMs = 0;
  private lastPumpMs = 0;
  private stepTimeEmaMs = 0;

  // Exposed read-only BotWorldView properties kept synced per tick
  get mapW(): number {
    return this.W;
  }
  get mapH(): number {
    return this.H;
  }
  get playable() {
    return this.arena.playable;
  }
  get reviveMode() {
    return this.config.reviveMode;
  }
  get obsGrid() {
    return this.arena.obsGrid;
  }
  get obstacles() {
    return this.arena.obstacles;
  }
  enemies: BotEnemyView[] = [];
  projectiles: BotProjectileView[] = [];
  bullets: BotProjectileView[] = [];
  telegraphs: BansungTelegraph[] = [];
  pickups: BotPickupView[] = [];

  constructor(
    inits: readonly BansungInit[],
    rawConfig: Partial<BansungConfig> | unknown,
    hooks: BansungWorldHooks,
    opts: BansungWorldOptions = {},
  ) {
    this.hooks = hooks;
    const humanCount = inits.filter((i) => !i.bot).length;
    this.config = normalizeBansungConfig(rawConfig, Math.max(1, humanCount));
    this.arenaSeed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    this.rng = opts.rng ?? createMulberry32(this.arenaSeed);

    this.arena = buildServerArena(this.config.biome, this.arenaSeed);
    this.W = this.arena.w;
    this.H = this.arena.h;
    this.actorGrid = new ActorGrid(this.W, this.H);
    this.mobMgr = createMobManager({ mapW: this.W, mapH: this.H, rng: this.rng });
    this.bulletPool = new BansungBulletPool(320);
    this.gadgetState = createGadgetWorldState();
    this.pickupMgr = new PickupManager({ rng: this.rng, obsGrid: this.arena.obsGrid, maxPickups: 144 });

    this.enemyBuckets = new ViewportBucketIndex<QuantizedEnemyEntry>(this.W, this.H);
    this.bulletBuckets = new ViewportBucketIndex<QuantizedBulletEntry>(this.W, this.H);

    this.director = new WaveDirector({
      difficulty: this.config.difficulty,
      reviveMode: this.config.reviveMode,
      endlessEnabled: Boolean(this.config.endless),
      gameMode: resolveBansungGameMode(this.config),
      seed: this.arenaSeed ^ 0x51f15e,
      rng: this.rng,
    });
    if (opts.skipWarmup) {
      this.director.phaseTimer = 0;
    }

    this.initPlayers(inits);
    for (const shrine of this.arena.pedestals) {
      this.pickupMgr.spawnWeaponPedestal(shrine.x, shrine.y, 1, this.players, {
        allowedWeapons: shrine.weaponPool,
        ttlS: Number.POSITIVE_INFINITY,
      });
    }
    this.rebuildStaticAndPropViews();
    this.rebuildCullingCache();
  }

  private initPlayers(inits: readonly BansungInit[]): void {
    const spawns = this.arena.playerSpawns;
    for (let i = 0; i < inits.length; i++) {
      const init = inits[i];
      const idx = i;
      const actorId = 1000 + idx;
      const heroId = normalizeBansungHero(init.hero);
      const heroSpec = getBansungHero(heroId);
      const spawn = spawns[idx % spawns.length] ?? [this.W * 0.5, this.H * 0.5];
      const [sx, sy] = clampPointToPlayable(this.arena, spawn[0], spawn[1], heroSpec.radius + 4);

      const maxHp = heroSpec.hp * HERO_STAT_SCALE;
      const maxShield = heroSpec.shield * HERO_STAT_SCALE;
      const maxEnergy = heroSpec.energy;
      const weaponState = createHeroWeaponState({
        id: init.id,
        idx,
        actorId,
        heroId,
        x: sx,
        y: sy,
        aimRad: 0,
        team: 0,
        hasQuickHands: false,
      });
      const gadgetSlot = createPlayerGadgetSlot(HERO_DEFAULT_GADGET[heroId]);
      const dash = createHeroDashState();
      const petKind = idx % 2 === 0 ? 'tiger' : 'cat';

      const runtime: BansungRuntimePlayer = {
        idx,
        actorId,
        id: init.id,
        numId: actorId,
        name: init.name,
        avatar: init.avatar,
        color: init.color || heroSpec.accentHex,
        heroId,
        bot: Boolean(init.bot),
        left: false,

        team: 0,
        layer: LAYER_PLAYER,
        radius: heroSpec.radius,
        tier: 'hero',
        armorType: 'light',
        flatArmor: 0,

        life: 'alive',
        alive: true,
        downed: false,
        hp: maxHp,
        maxHp,
        baseMaxHp: maxHp,
        shield: maxShield,
        maxShield,
        baseMaxShield: maxShield,
        armor: maxShield,
        maxArmor: maxShield,
        baseMaxArmor: maxShield,
        energy: maxEnergy,
        maxEnergy,
        baseMaxEnergy: maxEnergy,
        moveSpeed: heroSpec.speed,
        speed: heroSpec.speed,
        baseMoveSpeed: heroSpec.speed,

        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        knockVx: 0,
        knockVy: 0,
        aimRad: 0,
        aimCos: 1,
        moveDirX: 0,
        moveDirY: 0,
        fireHeld: false,

        shieldDelayMs: 0,
        shieldRegenAccMs: 0,
        hitIframesMs: 0,
        hitFlashMs: 0,
        dashIframesMs: 0,
        stunMs: 0,
        stunImmuneMs: 0,
        stunDrStage: 0,
        stunDrResetMs: 0,
        dots: {},

        downCountWave: 0,
        reviveProg: 0,
        reviveContrib: {},
        rescuersCount: 0,
        bleedLeft: 0,
        bleedMax: 0,
        invulnTimer: 0,
        droneTethered: false,
        reviveSpeedMul: 1,

        dash,
        weaponState,
        gadgetSlot,
        guard: createPlayerActionGuard(),
        slots: buildWeaponSlotsSnapshot(weaponState),
        slotIdx: weaponState.activeSlot,
        sidearmWeapon: heroSpec.sidearmWeapon,
        pedestalSwapCdS: 0,
        empoweredMask: 0,

        perks: [],
        mods: aggregatePerkMods([]),
        perkChoices: undefined,
        coins: 0,
        kills: 0,
        killHealProgress: 0,
        staticShieldCdS: 0,
        xp: 0,
        xpToNext: getXpToNextLevel(1),
        level: 1,
        stamina: BANSUNG_STAMINA.BASE_MAX,
        maxStamina: BANSUNG_STAMINA.BASE_MAX,
        staminaRegenDelayS: 0,
        gachaChoices: undefined,
        gachaPending: 0,
        gachaQueue: 0,
        gachaTimerMs: 0,
        gachaRemMs: 0,
        gachaGraceMs: 0,
        gachaBotWaitMs: 0,
        skillStacks: {},
        skillCdMs: 0,
        skillMaxMs: heroSpec.activeSkill.cooldownMs,
        skillActiveMs: 0,

        hasPet: true,
        petAlive: true,
        pet: createPetState(sx - 24, sy + 12, petKind),
        brain: init.bot
          ? createBotBrain(
              this.config.botLevel as (typeof BANSUNG_BOT_LEVELS)[number],
              this.arenaSeed + idx * 97,
            )
          : undefined,
        specTargetIdx: idx,
        lastCactusHitTick: -999,

        stats: {
          kills: 0,
          elitesKilled: 0,
          damageDealt: 0,
          bossDamage: 0,
          damageTaken: 0,
          stunsInflicted: 0,
          revives: 0,
          deaths: 0,
        },
      };

      ensureSurvivalHeroGachaState(runtime);
      recomputeHeroStats(runtime);
      runtime.hp = runtime.maxHp;
      runtime.shield = runtime.maxShield;
      runtime.armor = runtime.maxArmor;
      runtime.energy = runtime.maxEnergy;
      this.syncWeaponAndHeroState(runtime);

      this.players.push(runtime);
      this.playerById.set(runtime.id, runtime);
      this.playerByActorId.set(runtime.actorId, runtime);
      this.colossusTargets.push(this.createColossusPlayerAdapter(runtime));
    }
  }

  private createColossusPlayerAdapter(p: BansungRuntimePlayer): ColossusPlayerTarget {
    return {
      id: p.actorId,
      numId: p.actorId,
      x: p.x,
      y: p.y,
      radius: p.radius,
      vx: p.vx,
      vy: p.vy,
      team: 0,
      layer: LAYER_PLAYER,
      tier: 'hero',
      armorType: 'light',
      flatArmor: 0,
      alive: p.alive,
      downed: p.downed,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      maxShield: p.maxShield,
      shieldDelayMs: p.shieldDelayMs,
      shieldRegenAccMs: p.shieldRegenAccMs,
      hitIframesMs: p.hitIframesMs,
      hitFlashMs: p.hitFlashMs,
      dashIframesMs: p.dashIframesMs,
      stunMs: p.stunMs,
      stunImmuneMs: p.stunImmuneMs,
      stunDrStage: p.stunDrStage,
      stunDrResetMs: p.stunDrResetMs,
      dots: p.dots,
      fastShield: p.fastShield,
      shieldDamageReduction: p.shieldDamageReduction,
      regenDelayMs: p.regenDelayMs,
    };
  }

  // ============================================================================
  // 5. Public Lifecycle, Inspection & Command Ingress
  // ============================================================================

  start(): void {
    if (this.timer || this.result) return;
    this.lastPumpMs = Date.now();
    this.accumulatorMs = 0;
    this.timer = setInterval(() => {
      this.pumpClock();
    }, PUMP_POLL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  get running(): boolean {
    return Boolean(this.timer);
  }

  get directorState(): WaveDirector {
    return this.director;
  }

  private pumpClock(): void {
    if (this.result) {
      this.stop();
      return;
    }
    const now = Date.now();
    const rawDelta = now - this.lastPumpMs;
    this.lastPumpMs = now;
    const clampedDelta = Math.min(MAX_FRAME_GAP_MS, Math.max(0, rawDelta));
    this.accumulatorMs += clampedDelta;

    let steps = 0;
    while (this.accumulatorMs >= DT_MS && steps < MAX_STEPS_PER_POLL && !this.result) {
      const t0 = performance.now();
      try {
        this.step();
      } catch (err) {
        console.error('[BansungWorld] tick error', err);
      }
      const stepMs = performance.now() - t0;
      this.stepTimeEmaMs =
        this.stepTimeEmaMs === 0 ? stepMs : this.stepTimeEmaMs * 0.9 + stepMs * 0.1;
      this.accumulatorMs -= DT_MS;
      steps++;
    }

    if (steps >= MAX_STEPS_PER_POLL && this.accumulatorMs > DT_MS * 2) {
      this.accumulatorMs = DT_MS;
    }
  }

  resign(playerId: string): void {
    const p = this.playerById.get(playerId);
    if (!p || p.left) return;
    p.left = true;
    p.fireHeld = false;
    p.moveDirX = 0;
    p.moveDirY = 0;
    p.alive = false;
    p.downed = false;
    p.life = 'dead';
    p.hp = 0;
    p.shield = 0;
    p.armor = 0;
    cancelHeroDash(p.dash);
    cancelHeroWeaponActions(p.weaponState);
    this.rateLimiter.clearPlayer(playerId);
    this.queuedHumanCmds.delete(playerId);
    this.logs.push(`${p.name} đã rời trận.`);
    this.checkMatchEnd();
    this.hooks.changed();
  }

  drainLogs(): string[] {
    if (this.logs.length === 0) return [];
    const out = this.logs.slice();
    this.logs.length = 0;
    return out;
  }

  viewPlayers(): BansungPlayerInfo[] {
    return this.players.map((p) => ({
      idx: p.idx,
      id: p.id,
      name: p.name,
      ...(p.avatar ? { avatar: p.avatar } : {}),
      hero: p.heroId,
      color: p.color,
      bot: p.bot,
      alive: p.life !== 'dead',
    }));
  }

  staticObstacles(): number[] {
    return packStaticArenaObstacles(this.arena, false);
  }

  waveHud(): BansungWaveHud {
    return this.director.getHud();
  }

  viewTelegraphs(): BansungTelegraph[] {
    const out: BansungTelegraph[] = [];
    const mobTels = getMobTelegraphs(this.mobMgr);
    for (let i = 0; i < mobTels.length; i++) out.push(mobTels[i]);

    for (let i = 0; i < this.activeBosses.length; i++) {
      const entry = this.activeBosses[i];
      if (entry.kind === 'boss_beholder' && !entry.boss.isDead()) {
        for (const t of entry.boss.toTelegraphs()) out.push(t);
      } else if (entry.kind === 'boss_colossus' && entry.boss.alive) {
        for (const t of entry.boss.telegraphs) out.push(t);
      } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
        for (const t of getOverlordTelegraphs(entry.boss)) out.push(t);
      } else if (entry.kind === 'boss_arsenal' && entry.boss.alive) {
        for (const t of entry.boss.telegraphs) out.push(t);
      }
    }

    for (const s of this.director.spawnTelegraphs) {
      out.push({
        id: 50_000 + s.gateIdx,
        kind: 1,
        x0: Math.round(s.x),
        y0: Math.round(s.y),
        x1: Math.round(s.x),
        y1: Math.round(s.y),
        r: Math.round(s.radius),
        phase: 0,
        color: 1,
        prog: 160,
      });
    }

    for (const a of this.director.artilleryStrikes) {
      const prog = Math.round(clamp((1 - a.timeLeftS / Math.max(0.1, a.fuseS)) * 255, 0, 255));
      out.push({
        id: 60_000 + a.id,
        kind: 1,
        x0: Math.round(a.x),
        y0: Math.round(a.y),
        x1: Math.round(a.x),
        y1: Math.round(a.y),
        r: Math.round(a.radius),
        phase: a.timeLeftS <= 0.35 ? 1 : 0,
        color: 0,
        prog,
      });
    }
    return out;
  }

  viewHazards(): BansungHazard[] {
    return getMobHazards(this.mobMgr);
  }

  viewSiegeStatus(): {
    portalGates: DirectorPortalGate[];
    beacon: DirectorBeaconStatus;
    artillery: DirectorArtilleryTarget[];
    stragglerEnraged: boolean;
  } {
    return {
      portalGates: this.director.portalGates.filter((g) => g.alive),
      beacon: { ...this.director.beaconState },
      artillery: this.director.artilleryStrikes.map((a) => ({ ...a })),
      stragglerEnraged: this.director.stragglerEnraged,
    };
  }

  petTuples(): BansungPetNetTuple[] {
    return this.players.map((p) => serializePetTuple(p.pet));
  }

  clearPendingFx(): void {
    this.fx.length = 0;
  }

  clearTickDeltas(): void {
    this.fx.length = 0;
    this.arena.propsDirty = false;
    this.pickupMgr.clearPickupsDirty();
    this.hadGadgetPropsLastTick = this.gadgetState.deployables.some(
      (d) => d.hp > 0 && d.lifeTicks > 0,
    );
  }

  resetViewerInitialized(playerId: string): void {
    this.viewerInitialized.delete(playerId);
    this.viewerSrvStageKey.delete(playerId);
  }

  onRevivePushback = (target: BotPlayerView, radiusPx: number): void => {
    for (let i = 0; i < this.mobMgr.mobs.length; i++) {
      const m = this.mobMgr.mobs[i];
      if (!m.alive || m.hp <= 0) continue;
      const ex = m.x - target.x;
      const ey = m.y - target.y;
      const d = Math.hypot(ex, ey);
      if (d < radiusPx) {
        const push = (radiusPx - d) * 0.85;
        const ux = d > 1e-4 ? ex / d : 1;
        const uy = d > 1e-4 ? ey / d : 0;
        const clamped = clampPointToPlayable(
          this.arena,
          m.x + ux * push,
          m.y + uy * push,
          m.radius,
        );
        m.x = clamped[0];
        m.y = clamped[1];
        m.spatialActor.x = clamped[0];
        m.spatialActor.y = clamped[1];
        m.flockProxy.x = clamped[0];
        m.flockProxy.y = clamped[1];
      }
    }
  };

  /**
   * Validates and enqueues an untrusted human command through `security.ts`.
   */
  enqueueCommand(
    playerId: string,
    rawCmd: unknown,
    opts?: { nowMs?: number },
  ): { ok: boolean; reason?: string; shouldKick?: boolean } {
    if (this.result) {
      return { ok: false, reason: 'match_ended' };
    }
    const player = this.playerById.get(playerId);
    if (!player || player.left) {
      return { ok: false, reason: 'unknown_player' };
    }

    const nowMs = opts?.nowMs ?? Date.now();
    const validated = validateBansungCommand(rawCmd, {
      arenaW: this.W,
      arenaH: this.H,
      maxPlayers: this.players.length,
    });
    if (!validated.ok) {
      const violation = this.rateLimiter.recordViolation(playerId, nowMs);
      return {
        ok: false,
        reason: validated.reason,
        shouldKick: violation.shouldKick,
      };
    }

    const cmd = validated.cmd;
    if (!player.bot) {
      const gate = this.rateLimiter.consumeCommandGate(playerId, cmd.t, this.tickNo, nowMs);
      if (!gate.allowed) {
        return {
          ok: false,
          reason: gate.reason,
          shouldKick: gate.shouldKick,
        };
      }
    }

    if (!isCmdAllowedInLifeState(cmd.t, player.life)) {
      return { ok: false, reason: 'life_state_blocked' };
    }

    let queue = this.queuedHumanCmds.get(playerId);
    if (!queue) {
      queue = [];
      this.queuedHumanCmds.set(playerId, queue);
    }
    if (queue.length >= BANSUNG_SEC_LIMITS.MAX_CMDS_PER_TICK * 2) {
      queue.shift();
    }
    queue.push(cmd);
    return { ok: true };
  }

  private applyValidatedCommand(
    player: BansungRuntimePlayer,
    cmd: BansungCommand,
    fromBot = false,
  ): void {
    if (player.left || this.result) return;
    if (!isCmdAllowedInLifeState(cmd.t, player.life)) return;

    switch (cmd.t) {
      case 'in': {
        if (!fromBot) {
          if (cmd.seq < player.guard.lastAckSeq) return;
          player.guard.lastAckSeq = cmd.seq;
        }
        const rawMx = clamp(cmd.mx / 100, -1, 1);
        const rawMy = clamp(cmd.my / 100, -1, 1);
        const mLen = Math.hypot(rawMx, rawMy);
        if (mLen > 1) {
          player.moveDirX = rawMx / mLen;
          player.moveDirY = rawMy / mLen;
        } else {
          player.moveDirX = rawMx;
          player.moveDirY = rawMy;
        }
        player.aimRad = dequantizeAim(cmd.aim & (BANSUNG_AIM_STEPS - 1));
        player.aimCos = Math.cos(player.aimRad);
        if (player.life === 'alive' && cmd.fire === 1) {
          player.fireHeld = true;
          player.fireQueuedPulse = true;
        } else {
          player.fireHeld = false;
        }
        break;
      }

      case 'dash': {
        if (player.life !== 'alive') return;
        const dashCost = Math.max(12, BANSUNG_STAMINA.DASH_COST - (player.gachaDashCostReduce ?? 0));
        if ((player.stamina ?? BANSUNG_STAMINA.BASE_MAX) < dashCost) return;
        const queued = queueHeroDash(player.dash, {
          dead: false,
          downed: player.downed,
          stunMs: player.stunMs,
        });
        if (queued && cmd.dx !== undefined && cmd.dy !== undefined) {
          const len = Math.hypot(cmd.dx, cmd.dy);
          if (len > 0.05) {
            player.moveDirX = cmd.dx / len;
            player.moveDirY = cmd.dy / len;
          }
        }
        break;
      }

      case 'slot': {
        if (player.life !== 'alive') return;
        if (!fromBot && !canSwapWeapon(player.guard, this.elapsedMs)) return;
        if (switchHeroWeaponSlot(player.weaponState, cmd.idx)) {
          if (!fromBot) markWeaponSwap(player.guard, this.elapsedMs);
          this.syncWeaponAndHeroState(player);
        }
        break;
      }

      case 'reload': {
        if (player.life !== 'alive') return;
        handleHeroReloadCmd(player.weaponState, this.tickNo, this.fx);
        this.syncWeaponAndHeroState(player);
        break;
      }

      case 'gadget': {
        if (player.life !== 'alive') return;
        const targetX =
          cmd.x !== undefined
            ? cmd.x
            : player.x + Math.cos(player.aimRad) * 160;
        const targetY =
          cmd.y !== undefined
            ? cmd.y
            : player.y + Math.sin(player.aimRad) * 160;
        const gadgetActor: GadgetPlayerActor = this.toGadgetPlayerActor(player);
        const activated = activateGadget(
          this.gadgetState,
          gadgetActor,
          player.gadgetSlot,
          targetX,
          targetY,
          {
            obsGrid: this.arena.obsGrid,
            rng: this.rng,
            fx: this.fx,
            onEnergySpent: (_act, cost) => {
              this.spendPlayerEnergy(player, cost);
            },
          },
          {
            extraCharges: 0,
            cdMult: 1,
          },
        );
        if (activated) {
          this.syncWeaponAndHeroState(player);
        }
        break;
      }

      case 'skill': {
        if (player.life !== 'alive' || player.downed) return;
        this.executeHeroActiveSkill(player, cmd.x, cmd.y);
        break;
      }

      case 'use': {
        if (player.life !== 'alive') return;
        const ped = this.pickupMgr.findNearestInteractablePedestal(player);
        if (!ped) return;
        if (!isWithinInteractRadius(player.x, player.y, ped.x, ped.y)) return;
        if (!this.claimLock.tryClaim(ped.id, this.tickNo)) return;
        this.syncWeaponAndHeroState(player);
        const curRuntime = player.weaponState.slots[player.slotIdx];
        let targetSlot = player.slotIdx;
        if (curRuntime && curRuntime.weaponId !== player.sidearmWeapon) {
          const emptyIdx = player.weaponState.slots.findIndex((s) => s === null);
          if (emptyIdx >= 0) {
            targetSlot = emptyIdx;
            player.slotIdx = emptyIdx;
          }
        }
        const res = this.pickupMgr.interactPedestal(player);
        if (res.swapped && res.gainedWeapon) {
          player.weaponState.activeSlot = targetSlot;
          equipWeaponInSlot(player.weaponState, targetSlot, res.gainedWeapon);
          this.syncWeaponAndHeroState(player);
        } else {
          player.slotIdx = player.weaponState.activeSlot;
        }
        break;
      }

      case 'perk': {
        const res = this.pickupMgr.submitPerkChoice(
          player,
          cmd.id,
          this.players,
          this.fx,
        );
        if (res.ok) {
          this.syncWeaponAndHeroState(player);
          this.hooks.changed();
        }
        break;
      }

      case 'gacha': {
        this.applyGachaPick(player, cmd.pick);
        break;
      }

      case 'ping': {
        if (!fromBot && !canSendTacticalPing(player.guard, this.elapsedMs)) return;
        if (!fromBot) markTacticalPing(player.guard, this.elapsedMs);
        this.fx.push(
          FX_PING,
          player.idx,
          cmd.kind,
          Math.round(clamp(cmd.x, 0, this.W)),
          Math.round(clamp(cmd.y, 0, this.H)),
          0,
        );
        break;
      }

      case 'spec': {
        if (player.life === 'alive') return;
        if (cmd.targetIdx >= 0 && cmd.targetIdx < this.players.length) {
          player.specTargetIdx = cmd.targetIdx;
        }
        break;
      }
    }
  }

  // ============================================================================
  // 6. Main Authoritative 30Hz Tick (`step`)
  // ============================================================================

  step(): void {
    if (this.result) return;

    // 1. Advance clock & clear single-tick deltas
    this.tickNo += 1;
    this.elapsedMs += DT_MS;
    this.clearTickDeltas();
    this.claimLock.pruneBefore(this.tickNo - 60);
    this.mobMgr.fxQueue.length = 0;

    // 2. Sync bot views, drain human input queue & run bot AI decisions
    this.refreshBotWorldViews();
    this.drainHumanCommands();
    this.stepBotDecisions();

    // 3. Step player movement, dodge-dash, shield regen, statuses, gadgets, cactus thorns
    this.stepPlayersAndEnvironment();

    // 4. Step hero weapon triggers/bursts/charge/reload, pickups, perk draft, props & barrels
    this.stepWeaponsPickupsAndProps();

    // 5. Rebuild Authoritative Spatial ActorGrid
    this.rebuildSpatialGrid();

    // 6. Step deferred hero melee sweeps, bullet pool, gadgets & boss projectiles
    this.stepProjectilesMeleeAndGadgets();

    // 7. Step mobs, flocking, bosses & pet companions
    this.stepMobsBossesAndPets();

    // 8. Step downed bleedout & co-op revive circles
    this.stepReviveAndDownedTransitions();

    // 9. Step Wave Director & wave rewards / transitions
    this.stepWaveDirector();

    // 10. Check victory/defeat & build 64px viewport culling cache
    this.checkMatchEnd();
    this.rebuildStaticAndPropViews();
    this.rebuildCullingCache();
    this.hooks.tick();
  }

  private drainHumanCommands(): void {
    for (const player of this.players) {
      if (player.bot || player.left) continue;
      const q = this.queuedHumanCmds.get(player.id);
      if (!q || q.length === 0) continue;
      const limit = Math.min(q.length, BANSUNG_SEC_LIMITS.MAX_CMDS_PER_TICK);
      for (let i = 0; i < limit; i++) {
        this.applyValidatedCommand(player, q[i], false);
      }
      q.splice(0, limit);
    }
  }

  private stepBotDecisions(): void {
    for (const p of this.players) {
      if (!p.bot || p.left || p.life === 'dead') continue;
      const botView = this.toBotPlayerView(p);
      runBansungBot(this, botView, DT_S, (cmd: BansungCommand) => {
        this.applyValidatedCommand(p, cmd, true);
      });
    }
  }

  private stepPlayersAndEnvironment(): void {
    for (const p of this.players) {
      if (p.left || p.life === 'dead') continue;

      p.mods = aggregatePerkMods(p.perks);
      p.skillCdMs = Math.max(0, p.skillCdMs - DT_MS);
      p.skillActiveMs = Math.max(0, p.skillActiveMs - DT_MS);
      if (p.heroId === 'mascot' && p.skillActiveMs > 0) {
        p.mods.fireRateMul *= 1.38;
        p.mods.moveSpeedMul *= 1.22;
      }
      recomputeHeroStats(p);
      p.reviveSpeedMul = p.mods.reviveSpeedMul;
      const auraMult = computeCoopAuraDamageMult(p, this.players);
      p.mods.coopAuraDmg = Math.max(0, auraMult - 1);
      p.invulnTimer = Math.max(0, p.invulnTimer - DT_S);
      p.gachaGraceMs = Math.max(0, p.gachaGraceMs - DT_MS);
      p.armor = p.shield;
      p.maxArmor = p.maxShield;

      const prevHp = p.hp;
      const prevShield = p.shield;
      tickStatuses(p, DT_MS, { rng: this.rng, fx: this.fx });
      if (prevHp + prevShield > p.hp + p.shield) {
        p.stats.damageTaken += Math.max(0, prevHp + prevShield - (p.hp + p.shield));
      }

      if (p.life === 'alive' && !p.downed) {
        const regenScale = Math.max(0.5, p.mods.armorRegenMul ?? 1);
        tickHeroShield(p, DT_MS * regenScale);
        p.armor = p.shield;
        p.maxArmor = p.maxShield;
      }

      const dashCost = Math.max(12, BANSUNG_STAMINA.DASH_COST - (p.gachaDashCostReduce ?? 0));
      p.maxStamina = Math.round(BANSUNG_STAMINA.BASE_MAX + (p.gachaMaxStaminaAdd ?? 0));
      p.stamina = Math.min(p.maxStamina, Math.max(0, p.stamina));
      if (p.dash.bufferLeft > 0 && p.stamina < dashCost) {
        p.dash.bufferLeft = 0;
      }
      p.shieldDamageReduction = Math.min(0.7, 0.25 + (p.gachaShieldDmgReduceAdd ?? 0));
      p.regenDelayMs = Math.max(2000, BANSUNG_SHIELD.REGEN_DELAY_MS - (p.gachaShieldDelayReduceMs ?? 0));

      tickGadgetSlot(p.gadgetSlot, {
        extraCharges: 0,
        cdMult: 1,
      });

      const body: CircleBody = { x: p.x, y: p.y, radius: p.radius };
      const dashRes = stepHeroDash(p.dash, {
        body,
        mx: p.moveDirX,
        my: p.moveDirY,
        aimRad: p.aimRad,
        obsGrid: this.arena.obsGrid,
        dt: DT_S,
        dead: false,
        downed: p.downed,
        stunMs: p.stunMs,
        heroId: p.heroId,
        dashCdMul: (p.mods.dashCdMul ?? 1) * (p.gachaDashCdMult ?? 1),
        playerIdx: p.idx,
        fx: this.fx,
      });
      syncDashToCombatTarget(p.dash, p);
      if (dashRes.justStarted) {
        p.stamina = Math.max(0, p.stamina - dashCost);
        p.staminaRegenDelayS = BANSUNG_STAMINA.REGEN_DELAY_S;
      } else if (!dashRes.active && p.life === 'alive' && !p.downed) {
        if (p.staminaRegenDelayS > 0) {
          p.staminaRegenDelayS = Math.max(0, p.staminaRegenDelayS - DT_S);
        } else if (p.stamina < p.maxStamina) {
          const regenPerS = BANSUNG_STAMINA.REGEN_PER_S * (p.gachaStaminaRegenMult ?? 1);
          p.stamina = Math.min(p.maxStamina, p.stamina + regenPerS * DT_S);
        }
      }
      if (p.invulnTimer > 0) {
        p.dashIframesMs = Math.max(p.dashIframesMs ?? 0, Math.ceil(p.invulnTimer * 1000));
      }

      if (!dashRes.active && (p.stunMs ?? 0) <= 0) {
        const slowMult =
          p.slowMs && p.slowMs > 0 && p.slowPct
            ? Math.max(0.25, 1 - p.slowPct)
            : 1;
        const moveMult = p.downed
          ? BANSUNG_CRAWL_MULT
          : (p.mods.moveSpeedMul ?? 1) *
            (p.gachaMoveSpeedMult ?? 1) *
            slowMult *
            getHeroWeaponMoveMult(p.weaponState);
        const speed = p.baseMoveSpeed * moveMult;
        p.vx = p.moveDirX * speed + p.knockVx;
        p.vy = p.moveDirY * speed + p.knockVy;
        moveCircleWithSlide(
          body,
          p.vx * dashRes.leftoverDt,
          p.vy * dashRes.leftoverDt,
          this.arena.obsGrid,
          this.W,
          this.H,
          4,
        );
      } else if (dashRes.active) {
        p.vx = p.dash.dirX * 500;
        p.vy = p.dash.dirY * 500;
      } else {
        p.vx = p.knockVx;
        p.vy = p.knockVy;
        moveCircleWithSlide(
          body,
          p.knockVx * DT_S,
          p.knockVy * DT_S,
          this.arena.obsGrid,
          this.W,
          this.H,
          4,
        );
      }

      const decay = Math.exp(-KNOCKBACK_DECAY_PER_S * DT_S);
      p.knockVx = Math.abs(p.knockVx * decay) < 2 ? 0 : p.knockVx * decay;
      p.knockVy = Math.abs(p.knockVy * decay) < 2 ? 0 : p.knockVy * decay;

      resolveObstacles(body, this.arena.obsGrid, this.W, this.H, 4);
      const clamped = clampPointToPlayable(this.arena, body.x, body.y, p.radius);
      p.x = clamped[0];
      p.y = clamped[1];

      if (p.life === 'alive' && p.hp <= 0) {
        this.transitionHeroToDownedOrDead(p);
      }
      this.syncWeaponAndHeroState(p);
    }
  }

  private stepWeaponsPickupsAndProps(): void {
    const weaponCtx = this.buildWeaponWorldContext();
    for (const p of this.players) {
      if (p.left || p.life === 'dead') continue;
      this.syncWeaponAndHeroState(p);
      const firing = p.life === 'alive' && (p.fireHeld || Boolean(p.fireQueuedPulse)) && !isDashing(p.dash);
      p.fireQueuedPulse = false;
      tickHeroWeapons(
        p.weaponState,
        { fireHeld: firing, moving: Math.hypot(p.vx, p.vy) > 5 },
        weaponCtx,
      );
      if (
        p.life === 'alive' &&
        !p.downed &&
        this.tickNo - p.weaponState.lastEnergySpendTick >= BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS
      ) {
        const extraRegen = Math.max(0, BANSUNG_HERO_ENERGY_REGEN.PER_S - 2.0) * DT_S;
        if (extraRegen > 0 && p.weaponState.energy < p.maxEnergy) {
          p.weaponState.energyFrac += extraRegen;
          const whole = Math.floor(p.weaponState.energyFrac);
          if (whole >= 1) {
            p.weaponState.energyFrac -= whole;
            p.weaponState.energy = Math.min(p.maxEnergy, p.weaponState.energy + whole);
          }
        }
      }
      p.energy = p.weaponState.energy;
      this.syncWeaponAndHeroState(p);
    }

    if (this.tickNo % (BANSUNG_TICK_HZ * 40) === 0) {
      this.pickupMgr.replenishCrates(this.director.wave, this.players, { crateCountMul: 2, force: true });
    }

    const isSurvival = resolveBansungGameMode(this.config) === 'survival';
    this.pickupMgr.step(DT_S, this.players, this.fx, {
      onXpGain: (heroIdx, amount) => {
        if (isSurvival) {
          this.handleHeroXpGain(heroIdx, amount);
        }
      },
    });
    this.stepGachaTimers();
    for (const p of this.players) {
      p.weaponState.energy = p.energy;
      p.weaponState.maxEnergy = p.maxEnergy;
      p.armor = p.shield;
      p.maxArmor = p.maxShield;
      this.syncWeaponAndHeroState(p);
    }

    this.pickupMgr.stepPerkDraft(DT_S, this.players, this.fx);
    tickArenaProps(this.arena, DT_MS);
    stepBarrelDetonations(this.arena, this.tickNo, {
      nowTick: this.tickNo,
      actorGrid: this.actorGrid,
      resolveActor: (actor) => this.resolveBarrelCombatActor(actor),
      damageCtx: this.buildDamageContext(),
      fx: this.fx,
      onKnockback: (actor, kx, ky) => {
        this.applyActorKnockback(actor.id, kx, ky);
      },
      onActorHit: (hit) => {
        if (hit.target && hit.damageResult && hit.damageResult.totalDmg > 0) {
          const mob = this.mobMgr.mobByNumId.get(hit.actor.id);
          if (mob && (!mob.alive || mob.hp <= 0)) {
            this.recordMobDeath(mob, mob.lastDamagedBy);
          }
        }
      },
      onPropBreak: (ev) => {
        this.handlePropBreak(ev);
      },
    });
    this.reconcileAuxAndBossTargets();
  }

  private rebuildSpatialGrid(): void {
    const actors = this.tmpSpatialActors;
    actors.length = 0;

    for (const p of this.players) {
      if (p.left || p.life !== 'alive') continue;
      actors.push({
        id: p.actorId,
        x: p.x,
        y: p.y,
        radius: p.radius,
        team: 0,
        layer: LAYER_PLAYER,
        alive: true,
      });
    }

    const turretActors: SpatialActor[] = [];
    collectTurretSpatialActors(this.gadgetState, turretActors, TURRET_SPATIAL_BASE);
    for (let i = 0; i < turretActors.length; i++) {
      actors.push(turretActors[i]);
    }

    for (let i = 0; i < this.mobMgr.mobs.length; i++) {
      const m = this.mobMgr.mobs[i];
      if (!m.alive || m.hp <= 0) continue;
      m.spatialActor.x = m.x;
      m.spatialActor.y = m.y;
      m.spatialActor.alive = true;
      actors.push(m.spatialActor);
    }

    this.auxTargets.clear();
    for (const gate of this.director.portalGates) {
      if (!gate.alive || gate.hp <= 0) continue;
      const actorId = PORTAL_GATE_SPATIAL_BASE + gate.id;
      actors.push({
        id: actorId,
        x: gate.x,
        y: gate.y,
        radius: 26,
        team: 1,
        layer: LAYER_ENEMY,
        alive: true,
      });
      this.auxTargets.set(actorId, {
        kind: 'portal_gate',
        gateId: gate.id,
        prevHp: gate.hp,
        radius: 26,
        target: {
          id: actorId,
          numId: actorId,
          x: gate.x,
          y: gate.y,
          tier: 'elite',
          armorType: 'armored',
          flatArmor: 2,
          alive: true,
          hp: gate.hp,
          maxHp: gate.maxHp,
          shield: 0,
          maxShield: 0,
          ccImmune: true,
        },
      });
    }

    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_beholder') {
        const s = entry.boss.state;
        if (entry.boss.isDead()) continue;
        entry.boss.combatTarget.x = s.x;
        entry.boss.combatTarget.y = s.y;
        entry.boss.combatTarget.hp = s.hp;
        entry.boss.combatTarget.dashIframesMs = entry.boss.isInvulnerable() ? 100 : 0;
        const sandProxy: BansungCombatTarget = {
          ...entry.boss.combatTarget,
          id: entry.numId,
          numId: entry.numId,
          hp: s.hp,
          stunMs: 0,
          ccImmune: false,
          alive: true,
        };
        actors.push({
          id: entry.numId,
          x: s.x,
          y: s.y,
          radius: entry.boss.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });
        this.auxTargets.set(entry.numId, {
          kind: 'sand_boss',
          entry,
          prevHp: s.hp,
          radius: entry.boss.radius,
          target: sandProxy,
        });
      } else if (entry.kind === 'boss_colossus') {
        const b = entry.boss;
        if (!b.alive || b.hp <= 0) continue;
        actors.push({
          id: b.id,
          x: b.x,
          y: b.y,
          radius: b.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });
        for (const d of b.drones) {
          if (!d.alive || d.hp <= 0) continue;
          actors.push({
            id: d.id,
            x: d.x,
            y: d.y,
            radius: d.radius,
            team: 1,
            layer: LAYER_ENEMY,
            alive: true,
          });
        }
      } else if (entry.kind === 'boss_overlord') {
        const b = entry.boss;
        if (!b.alive || b.hp <= 0) continue;
        actors.push({
          id: b.id,
          x: b.x,
          y: b.y,
          radius: b.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });

        for (const wp of b.weakPoints) {
          if (!wp.alive || wp.hp <= 0 || b.state !== 'weakpoint_matrix') continue;
          const actorId = this.allocAuxSpatialId();
          actors.push({
            id: actorId,
            x: wp.x,
            y: wp.y,
            radius: wp.radius,
            team: 1,
            layer: LAYER_ENEMY,
            alive: true,
          });
          this.auxTargets.set(actorId, {
            kind: 'overlord_wp',
            boss: b,
            wpIdx: wp.idx,
            prevHp: wp.hp,
            radius: wp.radius,
            target: {
              id: actorId,
              numId: actorId,
              x: wp.x,
              y: wp.y,
              tier: 'boss',
              armorType: 'light',
              flatArmor: 0,
              alive: true,
              hp: wp.hp,
              maxHp: wp.maxHp,
              shield: 0,
              maxShield: 0,
              ccImmune: true,
            },
          });
        }

        for (const pylon of b.pylons) {
          if (!pylon.alive || pylon.hp <= 0 || pylon.landingTicksLeft > 0) continue;
          const actorId = this.allocAuxSpatialId();
          actors.push({
            id: actorId,
            x: pylon.x,
            y: pylon.y,
            radius: pylon.radius,
            team: 1,
            layer: LAYER_ENEMY,
            alive: true,
          });
          this.auxTargets.set(actorId, {
            kind: 'overlord_pylon',
            boss: b,
            pylonId: pylon.id,
            prevHp: pylon.hp,
            radius: pylon.radius,
            target: {
              id: actorId,
              numId: actorId,
              x: pylon.x,
              y: pylon.y,
              tier: 'elite',
              armorType: pylon.armorType,
              flatArmor: pylon.armor,
              alive: true,
              hp: pylon.hp,
              maxHp: pylon.maxHp,
              shield: 0,
              maxShield: 0,
              ccImmune: true,
            },
          });
        }
      } else if (entry.kind === 'boss_arsenal') {
        const b = entry.boss;
        if (!b.alive || b.hp <= 0) continue;
        actors.push({
          id: b.id,
          x: b.x,
          y: b.y,
          radius: b.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });
      } else if (
        entry.kind === 'boss_tempest' ||
        entry.kind === 'boss_destroyer' ||
        entry.kind === 'boss_frost_empress' ||
        entry.kind === 'boss_abyssal_leviathan'
      ) {
        const b = entry.boss;
        if (!b.alive || b.hp <= 0) continue;
        actors.push({
          id: b.id,
          x: b.x,
          y: b.y,
          radius: b.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });
      }
    }

    for (const entry of this.activeBosses) {
      const bPos = this.getBossPosAndAim(entry);
      if (!bPos || !bPos.alive) continue;
      syncBossPartsPositions(entry.partGroup, bPos.x, bPos.y, bPos.aimRad);
      for (const part of entry.partGroup.parts) {
        if (part.broken || !part.combatTarget.alive || part.combatTarget.hp <= 0) continue;
        const actorId = this.allocAuxSpatialId();
        part.combatTarget.numId = actorId;
        actors.push({
          id: actorId,
          x: part.x,
          y: part.y,
          radius: part.radius,
          team: 1,
          layer: LAYER_ENEMY,
          alive: true,
        });
        this.auxTargets.set(actorId, {
          kind: 'boss_part',
          entry,
          partIdx: part.idx,
          part,
          prevHp: part.combatTarget.hp,
          radius: part.radius,
          target: part.combatTarget,
        });
      }
    }

    this.actorGrid.rebuild(actors);
  }

  private stepProjectilesMeleeAndGadgets(): void {
    const weaponCtx = this.buildWeaponWorldContext();

    for (const p of this.players) {
      if (p.left || p.life !== 'alive') continue;
      if (p.weaponState.activeSwing) {
        const mRes = stepHeroMeleeSwing(p.weaponState, weaponCtx);
        p.x = p.weaponState.x;
        p.y = p.weaponState.y;
        const spec = p.slots[p.slotIdx]?.id;
        if (spec) {
          destroyMobProjectilesInRadius(this.mobMgr, p.x, p.y, 68);
        }
        void mRes;
      }
    }

    stepBulletPool(this.bulletPool, weaponCtx);
    this.bulletPool.reap();

    const gadgetPlayers: GadgetPlayerActor[] = this.players.map((p) =>
      this.toGadgetPlayerActor(p),
    );
    const gadgetEnemies: GadgetEnemyActor[] = this.collectGadgetEnemies();
    const gadgetEnemyById = new Map<number, GadgetEnemyActor>();
    for (const e of gadgetEnemies) gadgetEnemyById.set(e.numId, e);

    stepGadgetWorld(this.gadgetState, {
      obsGrid: this.arena.obsGrid,
      actorGrid: this.actorGrid,
      players: gadgetPlayers,
      enemies: gadgetEnemies,
      getEnemyById: (id) => gadgetEnemyById.get(id),
      rng: this.rng,
      fx: this.fx,
      onDamage: (target, res, ownerIdx) => {
        const owner = this.players[ownerIdx];
        if (owner && !res.blocked && res.totalDmg > 0) {
          owner.stats.damageDealt += res.totalDmg;
          if (target.tier === 'boss') {
            owner.stats.bossDamage += res.totalDmg;
          }
          if (res.stunAppliedMs > 0) owner.stats.stunsInflicted += 1;
        }
        const mob = this.mobMgr.mobByNumId.get(Number(target.id));
        if (mob && res.killed) {
          this.recordMobDeath(mob, owner?.id);
        }
      },
      onStunInterrupt: (enemy, info) => {
        const mob = this.mobMgr.mobByNumId.get(enemy.numId);
        if (mob && info.stunAppliedMs > 0) {
          mob.state = 'stunned';
          mob.stateTicks = 0;
          mob.burstRemaining = 0;
          mob.burstDelayTicks = 0;
          mob.stormPoints.length = 0;
          mob.sepWeightScale = 1;
          mob.stationary = false;
          mob.pendingAttack = 'none';
          this.mobMgr.telegraphs.delete(mob.id);
          if (mob.kind === 'bomb_goblin') {
            mob.fuseCooldownTicks = Math.max(
              mob.fuseCooldownTicks,
              BANSUNG_MELEE_SPECIALS.bomb_goblin.stunFuseResetCdTicks,
            );
          }
        }
      },
      onKnockback: (enemy, dvx, dvy) => {
        this.applyActorKnockback(enemy.numId, dvx, dvy);
      },
      onObstacleDamage: (obstacle, dmg, ownerIdx) => {
        const owner = this.players[ownerIdx];
        damagePropByObstacleId(this.arena, obstacle.id, dmg, 0, {
          nowTick: this.tickNo,
          ownerIdx,
          attackerId: owner?.id,
          fx: this.fx,
          onPropBreak: (ev) => this.handlePropBreak(ev),
        });
      },
      onEnergyGrant: (gActor, amount) => {
        const player = this.players[gActor.idx];
        if (player && player.life === 'alive') {
          player.energy = Math.min(player.maxEnergy, Math.round(player.energy + amount));
          player.weaponState.energy = player.energy;
        }
      },
    });

    // Write back heal_drone healing on GadgetPlayerActor adapters to authoritative runtime players
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const gp = gadgetPlayers[i];
      if (!gp || p.left || p.life === 'dead') continue;
      p.hp = gp.hp;
      p.shield = gp.shield;
      p.armor = gp.shield;
    }

    this.stepBossProjectiles();
    this.reconcileAuxAndBossTargets();
  }

  private stepBossProjectiles(): void {
    const alivePlayers = this.players.filter((p) => !p.left && p.life === 'alive');
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      const bp = this.bossProjectiles[i];
      bp.ttlTicks -= 1;
      if (bp.ttlTicks <= 0) {
        this.bossProjectiles.splice(i, 1);
        continue;
      }

      const nx = bp.x + bp.vx * DT_S;
      const ny = bp.y + bp.vy * DT_S;
      const wallHit = raycastObstacles(
        this.arena.obsGrid,
        bp.x,
        bp.y,
        nx,
        ny,
        bp.radius,
        'bullet',
      );
      if (wallHit) {
        if (wallHit.obstacle.destructible) {
          damagePropByObstacleId(this.arena, wallHit.obstacle.id, bp.damage, 0, {
            nowTick: this.tickNo,
            fx: this.fx,
            onPropBreak: (ev) => this.handlePropBreak(ev),
          });
        }
        this.fx.push(
          FX_IMPACT,
          0,
          Math.round(wallHit.x),
          Math.round(wallHit.y),
          quantizeAim(Math.atan2(bp.vy, bp.vx)),
          0,
        );
        this.bossProjectiles.splice(i, 1);
        continue;
      }

      bp.x = nx;
      bp.y = ny;

      let hitTarget = false;
      for (const p of alivePlayers) {
        if (isDashInvulnerable(p.dash) || p.invulnTimer > 0) continue;
        const dx = p.x - bp.x;
        const dy = p.y - bp.y;
        const sumR = p.radius + bp.radius;
        if (dx * dx + dy * dy <= sumR * sumR) {
          this.applyHeroIncomingDamage(p, {
            baseDmg: bp.damage,
            dmgKind: bp.dmgKind,
            attackerId: String(bp.ownerActorId),
          });
          hitTarget = true;
          break;
        }
      }

      if (hitTarget || bp.x < 0 || bp.x > this.W || bp.y < 0 || bp.y > this.H) {
        this.bossProjectiles.splice(i, 1);
      }
    }
  }

  private stepMobsBossesAndPets(): void {
    const mobTargets: MobCombatEntity[] = [];
    for (const p of this.players) {
      if (!p.left && p.life === 'alive') {
        mobTargets.push(p as MobCombatEntity);
      }
    }

    const mobCallbacks: MobStepCallbacks = {
      damageCtx: {
        rng: this.rng,
        fx: this.fx,
      },
      statusCtx: {
        rng: this.rng,
        fx: this.fx,
      },
      onDamagePlayer: (target, hit) => {
        const hero = this.playerById.get(String(target.id));
        return hero ? this.applyHeroIncomingDamage(hero, hit) : undefined;
      },
      onApplySlow: (target, slowPct, durationMs) => {
        const hero = this.playerById.get(String(target.id));
        if (hero && slowPct > 0 && durationMs > 0) {
          hero.slowPct = Math.max(hero.slowPct ?? 0, slowPct);
          hero.slowMs = Math.max(hero.slowMs ?? 0, durationMs);
        }
      },
      onDamageObstacle: (obs, damage, sourceMob) => {
        damagePropByObstacleId(this.arena, obs.id, damage, 0, {
          nowTick: this.tickNo,
          attackerId: sourceMob.id,
          fx: this.fx,
          onPropBreak: (ev) => this.handlePropBreak(ev),
        });
      },
      onKnockback: (target, dvx, dvy) => {
        const hero = this.playerById.get(String(target.id));
        if (hero) {
          hero.knockVx += dvx;
          hero.knockVy += dvy;
        }
      },
      onMobKilled: (mob, killerId) => {
        this.recordMobDeath(mob, killerId);
      },
    };

    stepMobs(this.mobMgr, {
      tick: this.tickNo,
      targets: mobTargets,
      obsGrid: this.arena.obsGrid,
      enemyGrid: this.actorGrid,
      targetGrid: this.actorGrid,
      rng: this.rng,
      flockingOptions: {
        mapW: this.W,
        mapH: this.H,
      },
      callbacks: mobCallbacks,
      stepProjectilesAndHazards: true,
    });

    // Catch any mob FX emitted into mobMgr.fxQueue (preserving subKind codes)
    const mobFx = drainMobFx(this.mobMgr);
    for (let i = 0; i < mobFx.length; i++) {
      const ev = mobFx[i];
      if (ev.type === FX_BLAST) {
        this.fx.push(
          FX_BLAST,
          ev.subKind ?? BANSUNG_FX_BLAST_HE,
          Math.round(ev.x),
          Math.round(ev.y),
          Math.round(ev.value ?? 50),
          1,
        );
      } else if (ev.type === FX_IMPACT) {
        this.fx.push(
          FX_IMPACT,
          ev.subKind ?? BANSUNG_FX_IMPACT_FLESH,
          Math.round(ev.x),
          Math.round(ev.y),
          0,
          0,
        );
      } else if (ev.type === FX_BEAM && ev.x2 !== undefined && ev.y2 !== undefined) {
        this.fx.push(
          FX_BEAM,
          Math.round(ev.x),
          Math.round(ev.y),
          Math.round(ev.x2),
          Math.round(ev.y2),
          ev.subKind ?? BANSUNG_FX_BEAM_RAIL,
        );
      } else if (ev.type === FX_DEATH) {
        this.fx.push(
          FX_DEATH,
          ev.subKind ?? 0,
          Math.round(ev.x),
          Math.round(ev.y),
          0,
          -1,
        );
      }
    }

    // Reconcile any dead mobs not already recorded, and prune
    for (let i = 0; i < this.mobMgr.mobs.length; i++) {
      const m = this.mobMgr.mobs[i];
      if (!m.alive || m.hp <= 0) {
        this.recordMobDeath(m, m.lastDamagedBy);
        this.processedDeadMobs.delete(m.id);
      }
    }
    pruneDeadMobs(this.mobMgr);

    // Step Active Bosses
    this.stepActiveBosses();

    // Sync Pet & Bot world views then step pets
    this.refreshBotWorldViews();
    const petRes = stepPets(this, DT_S, {
      onPounceHit: (ev) => {
        const owner = this.playerById.get(ev.ownerId);
        const targetNum = Number(ev.targetId);
        const mob = this.mobMgr.mobByNumId.get(targetNum);
        if (mob && mob.alive) {
          const hitRes = applyBansungDamage(
            mob,
            {
              baseDmg: ev.damage * (owner?.mods.dmgMul ?? 1),
              dmgKind: ev.dmgKind,
              attackerId: ev.ownerId,
            },
            this.buildDamageContext(),
          );
          if (owner && !hitRes.blocked && hitRes.totalDmg > 0) {
            owner.stats.damageDealt += hitRes.totalDmg;
          }
          mob.knockVx += ev.knockVx;
          mob.knockVy += ev.knockVy;
          if (!mob.alive || mob.hp <= 0) {
            this.recordMobDeath(mob, ev.ownerId);
          }
          return;
        }
        for (const entry of this.activeBosses) {
          if (entry.numId !== targetNum) continue;
          const hit = {
            baseDmg: ev.damage * (owner?.mods.dmgMul ?? 1),
            dmgKind: ev.dmgKind,
            attackerId: ev.ownerId,
          };
          let hitRes: BansungDamageResult | undefined;
          if (entry.kind === 'boss_beholder' && !entry.boss.isDead()) {
            hitRes = entry.boss.applyHit(hit, this.buildDamageContext());
          } else if (entry.kind === 'boss_colossus' && entry.boss.alive) {
            hitRes = damageDreadColossus(entry.boss, hit, this.buildDamageContext());
          } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
            hitRes = damageOverlordBoss(entry.boss, hit, this.buildDamageContext());
          } else if (entry.kind === 'boss_arsenal' && entry.boss.alive) {
            hitRes = applyBansungDamage(entry.boss.combatTarget, hit, this.buildDamageContext());
            entry.boss.hp = Math.max(0, entry.boss.combatTarget.hp);
            if (entry.boss.hp <= 0) entry.boss.alive = false;
          } else if (
            (entry.kind === 'boss_tempest' ||
              entry.kind === 'boss_destroyer' ||
              entry.kind === 'boss_frost_empress' ||
              entry.kind === 'boss_abyssal_leviathan') &&
            entry.boss.alive
          ) {
            hitRes = applyBansungDamage(entry.boss.combatTarget, hit, this.buildDamageContext());
            entry.boss.hp = Math.max(0, entry.boss.combatTarget.hp);
            if (entry.boss.hp <= 0) entry.boss.alive = false;
          }
          if (owner && hitRes && !hitRes.blocked && hitRes.totalDmg > 0) {
            owner.stats.damageDealt += hitRes.totalDmg;
            owner.stats.bossDamage += hitRes.totalDmg;
          }
          break;
        }
      },
      onSpawnEmber: (ev) => {
        const owner = this.playerById.get(ev.ownerId);
        if (!owner) return;
        const applyBurn = ev.burnDps > 0 && ev.burnDurS > 0 && this.rng() < ev.burnChance;
        this.bulletPool.spawn({
          kind: 'arcane_ember',
          team: 0,
          ownerId: owner.id,
          ownerIdx: owner.idx,
          x: ev.x,
          y: ev.y,
          vx: ev.vx,
          vy: ev.vy,
          radius: ev.radius,
          maxRange: Math.hypot(ev.vx, ev.vy) * ev.ttlS,
          ttlTicks: Math.max(1, Math.round(ev.ttlS * BANSUNG_TICK_HZ)),
          dmgKind: 'fire',
          baseDmg: ev.damage,
          dmgMult: owner.mods.dmgMul,
          dotKind: applyBurn ? 'burn' : undefined,
          dotTickDmgOverride: applyBurn ? Math.max(1, Math.round(ev.burnDps * 0.5)) : undefined,
          dotDurMs: applyBurn ? Math.round(ev.burnDurS * 1000) : undefined,
        });
      },
      onPickupCapture: (ev) => {
        const owner = this.playerById.get(ev.ownerId);
        if (!owner) return;
        // Move pickup directly under owner so pickupMgr collects cleanly next tick
        const list = this.pickupMgr.pickups;
        for (const pk of list) {
          if (pk.id === Number(ev.pickupId)) {
            pk.x = owner.x;
            pk.y = owner.y;
            this.pickupMgr.markPickupsDirty();
            break;
          }
        }
      },
    });
    if (this.pickups.length > 0 && this.pickupMgr.pickups.length > 0) {
      const mgrById = new Map<number, (typeof this.pickupMgr.pickups)[number]>();
      for (const pk of this.pickupMgr.pickups) mgrById.set(pk.id, pk);
      let magnetMoved = false;
      for (const viewPk of this.pickups) {
        const mgrPk = mgrById.get(Number(viewPk.id));
        if (!mgrPk) continue;
        if (Math.abs(mgrPk.x - viewPk.x) > 0.05 || Math.abs(mgrPk.y - viewPk.y) > 0.05) {
          mgrPk.x = viewPk.x;
          mgrPk.y = viewPk.y;
          magnetMoved = true;
        }
      }
      if (magnetMoved) {
        this.pickupMgr.markPickupsDirty();
      }
    }
    void petRes;
  }

  private stepActiveBosses(): void {
    const sandTargets = this.players
      .filter((p) => !p.left && p.life !== 'dead')
      .map((p) => ({
        id: p.id,
        numId: p.actorId,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        radius: p.radius,
        alive: p.alive,
        downed: p.downed,
        dashIframesMs: p.dashIframesMs,
        combatTarget: p as BansungCombatTarget,
      }));

    // Sync Colossus player adapters
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const a = this.colossusTargets[i];
      a.x = p.x;
      a.y = p.y;
      a.vx = p.vx;
      a.vy = p.vy;
      a.alive = p.alive && !p.left;
      a.downed = p.downed;
      a.hp = p.hp;
      a.maxHp = p.maxHp;
      a.shield = p.shield;
      a.maxShield = p.maxShield;
      a.dashIframesMs = p.dashIframesMs;
      a.hitIframesMs = p.hitIframesMs;
      a.stunMs = p.stunMs;
      a.dots = p.dots;
    }

    const overlordTargets: OverlordPlayerTarget[] = this.players
      .filter((p) => !p.left && p.life === 'alive')
      .map((p) => ({
        ...(p as BansungCombatTarget),
        id: p.actorId,
        numId: p.actorId,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        radius: p.radius,
        energy: p.energy,
        maxEnergy: p.maxEnergy,
        reloadMs: p.weaponState.reload ? 100 : 0,
        reloading: Boolean(p.weaponState.reload),
        dashTicksLeft: p.dash.dashLeft > 0 ? Math.ceil(p.dash.dashLeft * BANSUNG_TICK_HZ) : 0,
      }));

    for (let i = this.activeBosses.length - 1; i >= 0; i--) {
      const entry = this.activeBosses[i];
      if (entry.kind === 'boss_beholder') {
        const sand = entry.boss;
        const res = sand.step({
          obsGrid: this.arena.obsGrid,
          targets: sandTargets,
          arenaW: this.W,
          arenaH: this.H,
          playableBounds: this.arena.playable,
          rng: this.rng,
          fxOut: this.fx,
          callbacks: {
            onSpawnProjectile: (proj) => {
              this.spawnBossProjectile({
                ownerActorId: entry.numId,
                kindId: resolveEnemyProjKindId(proj.kind),
                x: proj.x,
                y: proj.y,
                vx: proj.vx,
                vy: proj.vy,
                radius: proj.radius,
                damage: Math.max(1, Math.round(proj.damage * (entry.dmgScale ?? 1))),
                dmgKind: proj.dmgKind,
                ttlTicks: proj.ttlTicks,
                armored: false,
              });
            },
            onSpawnAdd: (add) => {
              if (this.mobMgr.mobs.length >= 48) return;
              spawnMob(this.mobMgr, {
                id: add.id,
                kind: add.kind,
                x: add.x,
                y: add.y,
                playerCount: this.players.length,
                wave: this.director.wave,
                difficulty: this.config.difficulty,
              });
            },
            onHeroHit: (hit) => {
              const p = this.playerById.get(hit.targetId);
              if (p && hit.evadedByDash === false && p.life === 'alive') {
                p.knockVx += hit.knockbackDx * hit.knockbackSpeed;
                p.knockVy += hit.knockbackDy * hit.knockbackSpeed;
                if (hit.damageResult) {
                  p.stats.damageTaken += hit.damageResult.totalDmg;
                }
                if (p.hp <= 0) this.transitionHeroToDownedOrDead(p);
              }
            },
            onObstacleHit: (hit) => {
              damagePropByObstacleId(this.arena, hit.obstacle.id, hit.damage, 0, {
                nowTick: this.tickNo,
                fx: this.fx,
                onPropBreak: (ev) => this.handlePropBreak(ev),
              });
            },
            onPushback: (push) => {
              const r2 = push.radius * push.radius;
              for (const p of this.players) {
                if (p.left || p.life !== 'alive') continue;
                if (isDashInvulnerable(p.dash) || p.invulnTimer > 0) continue;
                const dx = p.x - push.x;
                const dy = p.y - push.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > r2) continue;
                const d = Math.sqrt(d2);
                const ux = d > 1e-4 ? dx / d : 1;
                const uy = d > 1e-4 ? dy / d : 0;
                p.knockVx += ux * push.force;
                p.knockVy += uy * push.force;
              }
            },
          },
        });
        this.checkBossPhaseBurst(entry, sand.state.hp, sand.state.maxHp, sand.state.x, sand.state.y);
        if (sand.isDead()) {
          this.handleBossDeath(entry, sand.state.x, sand.state.y);
          if (sand.isDeadAnimDone()) {
            this.activeBosses.splice(i, 1);
          }
        }
        void res;
      } else if (entry.kind === 'boss_colossus') {
        const b = entry.boss;
        for (let pi = 0; pi < this.players.length; pi++) {
          const pl = this.players[pi];
          const ad = this.colossusTargets[pi];
          if (pl && ad) {
            ad.shieldDamageReduction = pl.shieldDamageReduction;
            ad.regenDelayMs = pl.regenDelayMs;
          }
        }
        syncColossusDrones(b, {
          obsGrid: this.arena.obsGrid,
          actorGrid: this.actorGrid,
          players: this.colossusTargets,
          damageCtx: this.buildDamageContext(),
        });
        const res = stepDreadColossus(b, {
          obsGrid: this.arena.obsGrid,
          actorGrid: this.actorGrid,
          players: this.colossusTargets,
          damageCtx: this.buildDamageContext(),
          statusCtx: { rng: this.rng, fx: this.fx },
          rng: this.rng,
          onProjectile: (proj) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(proj.kind),
              x: proj.x,
              y: proj.y,
              vx: proj.vx,
              vy: proj.vy,
              radius: proj.radius,
              damage: Math.max(1, Math.round(proj.damage * (entry.dmgScale ?? 1))),
              dmgKind: 'energy',
              ttlTicks: proj.ttlTicks,
              armored: false,
            });
          },
          onObstacleHit: (obs, dmg) => {
            damagePropByObstacleId(this.arena, obs.id, dmg, 0, {
              nowTick: this.tickNo,
              fx: this.fx,
              onPropBreak: (ev) => this.handlePropBreak(ev),
            });
          },
        });
        // Reconcile Colossus target damage & knockback back to runtime players
        for (let pi = 0; pi < this.players.length; pi++) {
          const p = this.players[pi];
          const a = this.colossusTargets[pi];
          if (p.left || p.life !== 'alive') continue;
          const prevTotal = p.hp + p.shield;
          const nextTotal = a.hp + a.shield;
          if (nextTotal < prevTotal) {
            p.stats.damageTaken += prevTotal - nextTotal;
          }
          p.hp = a.hp;
          p.shield = a.shield;
          p.armor = a.shield;
          p.shieldDelayMs = a.shieldDelayMs;
          p.shieldRegenAccMs = a.shieldRegenAccMs;
          p.hitIframesMs = a.hitIframesMs;
          p.hitFlashMs = a.hitFlashMs;
          p.stunMs = a.stunMs;
          if (Math.abs(a.x - p.x) > 0.05 || Math.abs(a.y - p.y) > 0.05) {
            const clampedPos = clampPointToPlayable(this.arena, a.x, a.y, p.radius);
            p.x = clampedPos[0];
            p.y = clampedPos[1];
          }
          if (p.hp <= 0) this.transitionHeroToDownedOrDead(p);
        }

        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_overlord') {
        const b = entry.boss;
        const mobMap = new Map<number, BansungCombatTarget & SpatialActor>();
        for (const m of this.mobMgr.mobs) {
          if (!m.alive) continue;
          mobMap.set(m.numId, {
            ...m,
            id: m.numId,
            numId: m.numId,
            radius: m.radius,
            team: 1,
            layer: LAYER_ENEMY,
          });
        }
        const res = stepOverlordBoss(b, {
          players: overlordTargets,
          obsGrid: this.arena.obsGrid,
          actorGrid: this.actorGrid,
          mobs: mobMap,
          activeBossProjectiles: this.bossProjectiles.length,
          playableBounds: this.arena.playable,
          rng: this.rng,
          fx: this.fx,
          spawnProjectile: (proj) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(proj.kind),
              x: proj.x,
              y: proj.y,
              vx: proj.vx,
              vy: proj.vy,
              radius: proj.radius,
              damage: Math.max(1, Math.round(proj.dmg * (entry.dmgScale ?? 1))),
              dmgKind: proj.dmgKind,
              ttlTicks: proj.ttlTicks,
              armored: proj.armored,
            });
          },
          spawnEnergyOrb: (orb) => {
            this.pickupMgr.spawnPickup('energy_orb', orb.x, orb.y, {
              stack: Math.max(1, Math.round(orb.energy / 10)),
            });
          },
          onDamagePlayer: (ot, hit) => {
            const p = this.playerByActorId.get(Number(ot.id));
            if (!p) return;
            return this.applyHeroIncomingDamage(p, hit);
          },
          onSlowPlayer: (ot, durMs, pct) => {
            const p = this.playerByActorId.get(Number(ot.id));
            if (p && durMs > 0 && pct > 0) {
              p.slowPct = Math.max(p.slowPct ?? 0, pct);
              p.slowMs = Math.max(p.slowMs ?? 0, durMs);
            }
          },
          onDrainEnergy: (ot, amt) => {
            const p = this.playerByActorId.get(Number(ot.id));
            if (p) {
              p.energy = Math.max(0, Math.round(p.energy - amt));
              p.weaponState.energy = p.energy;
            }
          },
          onCancelPlayerAction: (ot) => {
            const p = this.playerByActorId.get(Number(ot.id));
            if (p) {
              cancelHeroWeaponActions(p.weaponState);
              p.weaponState.reload = null;
            }
          },
          onDamageMob: (mobId, hit) => {
            const mob = this.mobMgr.mobByNumId.get(mobId);
            if (!mob) return;
            const r = applyBansungDamage(mob, hit, this.buildDamageContext());
            if (!mob.alive || mob.hp <= 0) {
              this.recordMobDeath(mob, mob.lastDamagedBy);
            }
            return r;
          },
        });
        for (const ot of overlordTargets) {
          const p = this.playerByActorId.get(Number(ot.id));
          if (!p || p.left || p.life !== 'alive') continue;
          if ((ot.stunMs ?? 0) > (p.stunMs ?? 0)) {
            p.stunMs = Math.min(1400, ot.stunMs ?? 0);
          }
          if ((ot.stunDrStage ?? 0) > (p.stunDrStage ?? 0)) {
            p.stunDrStage = ot.stunDrStage;
          }
          if ((ot.stunDrResetMs ?? 0) > (p.stunDrResetMs ?? 0)) {
            p.stunDrResetMs = ot.stunDrResetMs;
          }
          if ((ot.stunImmuneMs ?? 0) > (p.stunImmuneMs ?? 0)) {
            p.stunImmuneMs = ot.stunImmuneMs;
          }
        }
        for (const orb of res.energyOrbs) {
          this.pickupMgr.spawnPickup('energy_orb', orb.x, orb.y, {
            stack: Math.max(1, Math.round(orb.energy / 10)),
          });
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (res.died || !b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_arsenal') {
        const b = entry.boss;
        const diffKey = (
          this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
        ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
        const dmgMult = BANSUNG_DIFFICULTY_SCALE[diffKey].dmg * (entry.dmgScale ?? 1);
        const damageCtx = this.buildDamageContext();
        const arsenalTargets: ArsenalPlayerTarget[] = this.players.filter(
          (p) => !p.left && p.life === 'alive',
        );
        stepArsenalBoss(b, {
          tickNo: this.tickNo,
          players: arsenalTargets,
          dmgMult,
          damageCtx,
          fx: this.fx,
          onSpawnBullet: (bullet) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId('enemy_orb'),
              x: bullet.x,
              y: bullet.y,
              vx: bullet.vx,
              vy: bullet.vy,
              radius: bullet.radius,
              damage: bullet.dmg,
              dmgKind: 'kinetic',
              ttlTicks: bullet.ttlTicks,
              armored: false,
            });
          },
          onSummon: (kinds, cx, cy) => {
            if (this.mobMgr.mobs.length >= 48) return;
            const pCount = Math.max(1, this.players.filter((p) => !p.left).length);
            for (let k = 0; k < kinds.length; k++) {
              const ang = (k / Math.max(1, kinds.length)) * Math.PI * 2 + this.rng() * 0.4;
              const dist = 88 + k * 14;
              const sx = clamp(
                cx + Math.cos(ang) * dist,
                this.arena.playable.x0 + 36,
                this.arena.playable.x1 - 36,
              );
              const sy = clamp(
                cy + Math.sin(ang) * dist,
                this.arena.playable.y0 + 36,
                this.arena.playable.y1 - 36,
              );
              spawnMob(this.mobMgr, {
                kind: kinds[k],
                x: sx,
                y: sy,
                playerCount: pCount,
                wave: this.director.wave,
                difficulty: this.config.difficulty,
              });
            }
          },
        });
        for (const p of arsenalTargets) {
          const rp = this.playerById.get(p.id);
          if (rp && rp.life === 'alive') {
            rp.armor = rp.shield;
            if (rp.hp <= 0) this.transitionHeroToDownedOrDead(rp);
          }
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_tempest') {
        const b = entry.boss;
        const diffKey = (
          this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
        ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
        const dmgMult = BANSUNG_DIFFICULTY_SCALE[diffKey].dmg * (entry.dmgScale ?? 1);
        const damageCtx = this.buildDamageContext();
        const tempestTargets: TempestPlayerTarget[] = this.players.filter(
          (p) => !p.left && p.life === 'alive',
        );
        stepTempestBoss(b, {
          tickNo: this.tickNo,
          players: tempestTargets,
          dmgMult,
          damageCtx,
          fx: this.fx,
          onSpawnBullet: (bullet) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(bullet.kind),
              x: bullet.x,
              y: bullet.y,
              vx: bullet.vx,
              vy: bullet.vy,
              radius: bullet.r,
              damage: bullet.dmg,
              dmgKind: bullet.dmgKind,
              ttlTicks: bullet.ttlTicks,
              armored: false,
            });
          },
          onSummon: (kinds, cx, cy) => {
            this.spawnBossEscortMobs(kinds, cx, cy);
          },
        });
        for (const p of tempestTargets) {
          const rp = this.playerById.get(p.id);
          if (rp && rp.life === 'alive') {
            rp.armor = rp.shield;
            if (rp.hp <= 0) this.transitionHeroToDownedOrDead(rp);
          }
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_destroyer') {
        const b = entry.boss;
        const diffKey = (
          this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
        ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
        const dmgMult = BANSUNG_DIFFICULTY_SCALE[diffKey].dmg * (entry.dmgScale ?? 1);
        const damageCtx = this.buildDamageContext();
        const destroyerTargets: DestroyerPlayerTarget[] = this.players.filter(
          (p) => !p.left && p.life === 'alive',
        );
        stepDestroyerBoss(b, {
          tickNo: this.tickNo,
          players: destroyerTargets,
          dmgMult,
          damageCtx,
          fx: this.fx,
          onSpawnBullet: (bullet) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(bullet.kind),
              x: bullet.x,
              y: bullet.y,
              vx: bullet.vx,
              vy: bullet.vy,
              radius: bullet.r,
              damage: bullet.dmg,
              dmgKind: bullet.dmgKind,
              ttlTicks: bullet.ttlTicks,
              armored: bullet.dmgKind === 'explosive',
            });
          },
          onSummon: (kinds, cx, cy) => {
            this.spawnBossEscortMobs(kinds, cx, cy);
          },
          onPullPlayer: (playerId, dx, dy) => {
            const rp = this.playerById.get(playerId);
            if (!rp || rp.life !== 'alive' || rp.downed || isDashing(rp.dash)) return;
            const body: CircleBody = { x: rp.x, y: rp.y, radius: rp.radius };
            moveCircleWithSlide(body, dx, dy, this.arena.obsGrid, this.W, this.H, 4);
            const clamped = clampPointToPlayable(this.arena, body.x, body.y, rp.radius);
            rp.x = clamped[0];
            rp.y = clamped[1];
          },
        });
        for (const p of destroyerTargets) {
          const rp = this.playerById.get(p.id);
          if (rp && rp.life === 'alive') {
            rp.armor = rp.shield;
            if (rp.hp <= 0) this.transitionHeroToDownedOrDead(rp);
          }
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_frost_empress') {
        const b = entry.boss;
        const diffKey = (
          this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
        ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
        const dmgMult = BANSUNG_DIFFICULTY_SCALE[diffKey].dmg * (entry.dmgScale ?? 1);
        const damageCtx = this.buildDamageContext();
        const frostTargets: FrostEmpressPlayerTarget[] = this.players.filter(
          (p) => !p.left && p.life === 'alive',
        );
        stepFrostEmpressBoss(b, {
          tickNo: this.tickNo,
          players: frostTargets,
          dmgMult,
          damageCtx,
          fx: this.fx,
          onSpawnBullet: (bullet) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(bullet.kind === 'plasma' ? 'frost_bolt' : bullet.kind),
              x: bullet.x,
              y: bullet.y,
              vx: bullet.vx,
              vy: bullet.vy,
              radius: bullet.r,
              damage: bullet.dmg,
              dmgKind: bullet.dmgKind,
              ttlTicks: bullet.ttlTicks,
              armored: false,
            });
          },
          onSummon: (kinds, cx, cy) => {
            this.spawnBossEscortMobs(kinds, cx, cy);
          },
        });
        for (const p of frostTargets) {
          const rp = this.playerById.get(p.id);
          if (rp && rp.life === 'alive') {
            rp.armor = rp.shield;
            if (rp.hp <= 0) this.transitionHeroToDownedOrDead(rp);
          }
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      } else if (entry.kind === 'boss_abyssal_leviathan') {
        const b = entry.boss;
        const diffKey = (
          this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
        ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
        const dmgMult = BANSUNG_DIFFICULTY_SCALE[diffKey].dmg * (entry.dmgScale ?? 1);
        const damageCtx = this.buildDamageContext();
        const leviathanTargets: LeviathanPlayerTarget[] = this.players.filter(
          (p) => !p.left && p.life === 'alive',
        );
        stepLeviathanBoss(b, {
          tickNo: this.tickNo,
          players: leviathanTargets,
          dmgMult,
          damageCtx,
          fx: this.fx,
          onSpawnBullet: (bullet) => {
            this.spawnBossProjectile({
              ownerActorId: entry.numId,
              kindId: resolveEnemyProjKindId(bullet.kind === 'plasma' ? 'void_bolt' : bullet.kind),
              x: bullet.x,
              y: bullet.y,
              vx: bullet.vx,
              vy: bullet.vy,
              radius: bullet.r,
              damage: bullet.dmg,
              dmgKind: bullet.dmgKind,
              ttlTicks: bullet.ttlTicks,
              armored: bullet.dmgKind === 'explosive',
            });
          },
          onSummon: (kinds, cx, cy) => {
            this.spawnBossEscortMobs(kinds, cx, cy);
          },
          onPullPlayer: (playerId, dx, dy) => {
            const rp = this.playerById.get(playerId);
            if (!rp || rp.life !== 'alive' || rp.downed || isDashing(rp.dash)) return;
            const body: CircleBody = { x: rp.x, y: rp.y, radius: rp.radius };
            moveCircleWithSlide(body, dx, dy, this.arena.obsGrid, this.W, this.H, 4);
            const clamped = clampPointToPlayable(this.arena, body.x, body.y, rp.radius);
            rp.x = clamped[0];
            rp.y = clamped[1];
          },
        });
        for (const p of leviathanTargets) {
          const rp = this.playerById.get(p.id);
          if (rp && rp.life === 'alive') {
            rp.armor = rp.shield;
            if (rp.hp <= 0) this.transitionHeroToDownedOrDead(rp);
          }
        }
        this.checkBossPhaseBurst(entry, b.hp, b.maxHp, b.x, b.y);
        if (!b.alive || b.hp <= 0) {
          this.handleBossDeath(entry, b.x, b.y);
          this.activeBosses.splice(i, 1);
        }
      }
    }
  }

  private stepReviveAndDownedTransitions(): void {
    for (const p of this.players) {
      if (p.left) continue;
      if (p.life === 'alive' && p.hp <= 0) {
        this.transitionHeroToDownedOrDead(p);
      }
      if (p.downed) {
        const support = getDroneDownedSupport(this.gadgetState, p.idx);
        p.droneTethered = support.tethered;
      } else {
        p.droneTethered = false;
      }
    }

    const revRes = stepDownedAndRevive(this, DT_S);
    if (revRes.revivedIds.length > 0 || revRes.deadIds.length > 0) {
      for (const id of revRes.revivedIds) {
        const p = this.playerById.get(id);
        if (p) {
          p.life = 'alive';
          p.armor = p.shield;
          this.syncWeaponAndHeroState(p);
          applyReviveEnergyFloor(p.weaponState);
          p.energy = p.weaponState.energy;
        }
      }
      for (const id of revRes.deadIds) {
        const p = this.playerById.get(id);
        if (p) {
          p.life = 'dead';
          cancelHeroDash(p.dash);
          cancelHeroWeaponActions(p.weaponState);
        }
      }
      this.hooks.changed();
    }
  }

  private stepWaveDirector(): void {
    const dirPlayers: DirectorPlayerRef[] = this.players
      .filter((p) => !p.left)
      .map((p) => p as DirectorPlayerRef);

    const aliveBoss = this.activeBosses.find((entry) =>
      entry.kind === 'boss_beholder'
        ? !entry.boss.isDead()
        : entry.kind === 'boss_colossus'
          ? entry.boss.alive
          : entry.boss.alive,
    );

    const aliveBossPos = aliveBoss
      ? aliveBoss.kind === 'boss_beholder'
        ? { x: aliveBoss.boss.state.x, y: aliveBoss.boss.state.y }
        : { x: aliveBoss.boss.x, y: aliveBoss.boss.y }
      : undefined;
    const bossPos =
      this.bossKillsThisTick > 0 && this.lastBossDeathPos
        ? this.lastBossDeathPos
        : aliveBossPos;

    const out: DirectorStepOutput = this.director.step({
      dt: DT_S,
      activeMobs: this.mobMgr.mobs.filter((m) => m.alive).length,
      bossAlive: Boolean(aliveBoss),
      bossPos,
      bossKills: this.bossKillsThisTick,
      players: dirPlayers,
      biome: this.config.biome,
      endlessEnabled: Boolean(this.config.endless),
      difficulty: this.config.difficulty,
      arena: this.arena,
      obsGrid: this.arena.obsGrid,
      enemyGates: this.arena.enemyGates,
      activeMobRefs: this.mobMgr.mobs,
      bossId: aliveBoss?.kind,
      perkDraftPending: Boolean(this.pickupMgr.perkDraft?.active),
      reviveMode: this.config.reviveMode,
      autoApplyWaveClearRevive: false,
      autoRespawnProps: true,
      rng: this.rng,
      fxOut: this.fx,
    });
    this.bossKillsThisTick = 0;
    this.lastBossDeathPos = undefined;

    for (let i = 0; i < out.spawns.length; i++) {
      spawnMobFromDirector(this.mobMgr, out.spawns[i]);
    }

    if (out.spawnBoss) {
      this.spawnWaveBoss(out.spawnBoss);
      if (out.spawnBoss.splitTier === 2) {
        this.logs.push(`🔥 CẢNH BÁO: ${out.spawnBoss.label ?? 'BOSS KHỔNG LỒ PHÂN THÂN'} xuất hiện!`);
      } else if (out.spawnBoss.count >= 5) {
        this.logs.push(`⚠️ ĐÀN ${out.spawnBoss.count} MINI-BOSS ĐỔ BỘ!`);
      } else if (out.spawnBoss.count >= 2) {
        this.logs.push(`⚠️ ${out.spawnBoss.count} ĐẠI BOSS CÙNG XUẤT TRẬN!`);
      }
    }

    if (out.propRespawn) {
      this.arena.propsDirty = true;
    }

    if (out.pedestalDrops && out.pedestalDrops.length > 0) {
      for (const drop of out.pedestalDrops) {
        this.pickupMgr.spawnWeaponPedestal(drop.x, drop.y, drop.waveHint, this.players, {
          ...(drop.allowedWeapons ? { allowedWeapons: drop.allowedWeapons } : {}),
        });
      }
    }

    if (out.survivalStageChange) {
      const sc = out.survivalStageChange;
      this.logs.push(`Vòng ${sc.cycle + 1} — Giai đoạn ${sc.stageIdx + 1}`);
      this.hooks.changed();
    }

    if (out.beaconCompleted) {
      for (const m of this.mobMgr.mobs) {
        if (!m.alive) continue;
        const d = Math.hypot(m.x - out.beaconCompleted.x, m.y - out.beaconCompleted.y);
        if (d <= out.beaconCompleted.stunRadius) {
          stunMob(this.mobMgr, m, out.beaconCompleted.stunMs);
        }
      }
      this.fx.push(
        FX_BLAST,
        BANSUNG_FX_BLAST_STUN,
        Math.round(out.beaconCompleted.x),
        Math.round(out.beaconCompleted.y),
        Math.round(out.beaconCompleted.stunRadius * 0.25),
        -1,
      );
    }

    // Priority #2: Sky artillery detonations are environmental VFX only (0 damage to players).

    if (out.waveStart) {
      for (const p of this.players) {
        p.downCountWave = 0;
      }
      if (!out.survivalStageChange) {
        this.logs.push(`Wave ${out.waveStart.wave} (${out.waveStart.arc}) bắt đầu!`);
        this.hooks.changed();
      }
    }

    if (out.waveClear) {
      const revResult = applyWaveClearRevives(
        dirPlayers,
        this.config.reviveMode,
        [this.W / 2, this.H / 2] as const,
        this.fx,
        {
          healPulse: out.waveClear.healPulse,
          energyRefill: out.waveClear.energyRefill,
          fullRestock: out.waveClear.fullRestock,
        },
      );

      for (const p of this.players) {
        if (p.left) continue;
        p.downCountWave = 0;
        if (revResult.revivedIds.includes(p.id)) {
          p.life = 'alive';
          p.alive = true;
          p.downed = false;
          p.invulnTimer = WAVE_CLEAR_INVULN_S;
          applyReviveEnergyFloor(p.weaponState);
        }
        if (out.waveClear.energyRefill) {
          restoreWaveEnergy(p.weaponState);
          p.energy = p.weaponState.energy;
        }
        if (out.waveClear.fullRestock) {
          const snaps = buildWeaponSlotsSnapshot(p.weaponState);
          for (const slot of p.weaponState.slots) {
            if (!slot) continue;
            const snap = snaps.find((s) => s?.id === slot.weaponId);
            if (snap && snap.maxClip > 0) slot.ammoInMag = snap.maxClip;
          }
          const maxCharges = BANSUNG_GADGETS[p.gadgetSlot.id].maxCharges;
          p.gadgetSlot.charges = Math.min(maxCharges, Math.max(1, p.gadgetSlot.charges + 1));
          p.gadgetSlot.cdTicksLeft = 0;
        }
        if (out.waveClear.bonusCoins > 0) {
          p.coins += out.waveClear.bonusCoins;
        }
        p.armor = p.shield;
        this.syncWeaponAndHeroState(p);
      }

      if (out.waveClear.spawnPedestal) {
        const cx = this.arena.bossPad[0] ?? this.W * 0.5;
        const cy = this.arena.bossPad[1] ?? this.H * 0.5;
        this.pickupMgr.spawnWeaponPedestal(cx, cy, out.waveClear.wave, this.players);
      }

      if (out.waveClear.crates > 0) {
        const cx = this.arena.bossPad[0] ?? this.W * 0.5;
        const cy = this.arena.bossPad[1] ?? this.H * 0.5;
        for (let c = 0; c < out.waveClear.crates; c++) {
          const ang = (c / out.waveClear.crates) * Math.PI * 2;
          this.pickupMgr.dropPropLoot(
            'wood_crate',
            cx + Math.cos(ang) * 90,
            cy + Math.sin(ang) * 90,
            { wave: out.waveClear.wave, heroes: this.players },
          );
        }
      }
      this.pickupMgr.replenishCrates(out.waveClear.wave, this.players, { crateCountMul: 2, force: true });

      if (out.waveClear.openPerkDraft) {
        this.pickupMgr.startPerkDraft(this.players, out.waveClear.wave);
      }
      this.logs.push(`Hoàn thành Wave ${out.waveClear.wave}!`);
      this.hooks.changed();
    }

    if (out.finished === 'victory') {
      this.finalizeResult(true, `Đã chinh phục toàn bộ ${this.director.wavesCleared} đợt tấn công!`);
    } else if (out.finished === 'defeat') {
      this.finalizeResult(false, 'Cả đội đã gục ngã.');
    }
  }

  private spawnSingleBossInstance(opts: {
    kind: BansungEnemyId;
    x: number;
    y: number;
    hpMult: number;
    mini: boolean;
    scale: number;
    splitTier: number;
    dmgScale: number;
    initialBeholderState?: 'intro' | 'move';
  }): void {
    const numId = 90_000 + this.bossSeq++;
    const playerCount = Math.max(1, this.players.filter((p) => !p.left).length);
    const isSurvival = resolveBansungGameMode(this.config) === 'survival';
    const endlessTier = isSurvival
      ? this.director.getSurvivalClock().cycle
      : Math.max(0, Math.floor((this.director.wave - BANSUNG_TOTAL_WAVES) / 10));
    const builtInBossMult = Math.max(
      0.01,
      computeBossHpMult(playerCount, this.config.difficulty, endlessTier),
    );
    const scaledResidualMult = Math.max(0.05, opts.hpMult / builtInBossMult);
    const meta: ActiveBossMeta = {
      scale: opts.scale,
      splitTier: opts.splitTier,
      miniBoss: opts.mini,
      dmgScale: opts.dmgScale,
      baseHpMult: opts.hpMult,
    };

    if (opts.kind === 'boss_arsenal') {
      const arsenal = createArsenalBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        hpMult: opts.hpMult,
        scale: opts.scale,
        arenaBounds: {
          minX: this.arena.playable.x0,
          minY: this.arena.playable.y0,
          maxX: this.arena.playable.x1,
          maxY: this.arena.playable.y1,
        },
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_arsenal',
        numId,
        boss: arsenal,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_arsenal',
          bossMaxHp: arsenal.maxHp,
          bossX: arsenal.x,
          bossY: arsenal.y,
          scale: opts.scale,
          armor: arsenal.armor,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_tempest') {
      const tempest = createTempestBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        hpMult: opts.hpMult,
        radiusScale: opts.scale,
        arenaBounds: {
          minX: this.arena.playable.x0,
          minY: this.arena.playable.y0,
          maxX: this.arena.playable.x1,
          maxY: this.arena.playable.y1,
        },
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_tempest',
        numId,
        boss: tempest,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_tempest',
          bossMaxHp: tempest.maxHp,
          bossX: tempest.x,
          bossY: tempest.y,
          scale: opts.scale,
          armor: tempest.armor,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_destroyer') {
      const destroyer = createDestroyerBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        hpMult: opts.hpMult,
        radiusScale: opts.scale,
        arenaBounds: {
          minX: this.arena.playable.x0,
          minY: this.arena.playable.y0,
          maxX: this.arena.playable.x1,
          maxY: this.arena.playable.y1,
        },
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_destroyer',
        numId,
        boss: destroyer,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_destroyer',
          bossMaxHp: destroyer.maxHp,
          bossX: destroyer.x,
          bossY: destroyer.y,
          scale: opts.scale,
          armor: destroyer.armor,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_frost_empress') {
      const frostEmpress = createFrostEmpressBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        hpMult: opts.hpMult,
        radiusScale: opts.scale,
        arenaBounds: {
          minX: this.arena.playable.x0,
          minY: this.arena.playable.y0,
          maxX: this.arena.playable.x1,
          maxY: this.arena.playable.y1,
        },
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_frost_empress',
        numId,
        boss: frostEmpress,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_frost_empress',
          bossMaxHp: frostEmpress.maxHp,
          bossX: frostEmpress.x,
          bossY: frostEmpress.y,
          scale: opts.scale,
          armor: frostEmpress.armor,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_abyssal_leviathan') {
      const leviathan = createLeviathanBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        hpMult: opts.hpMult,
        radiusScale: opts.scale,
        arenaBounds: {
          minX: this.arena.playable.x0,
          minY: this.arena.playable.y0,
          maxX: this.arena.playable.x1,
          maxY: this.arena.playable.y1,
        },
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_abyssal_leviathan',
        numId,
        boss: leviathan,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_abyssal_leviathan',
          bossMaxHp: leviathan.maxHp,
          bossX: leviathan.x,
          bossY: leviathan.y,
          scale: opts.scale,
          armor: leviathan.armor,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_beholder') {
      const sand = createSandBeholderBoss({
        id: `boss_beholder_${numId}`,
        numId,
        x: opts.x,
        y: opts.y,
        arenaW: this.W,
        arenaH: this.H,
        playerCount,
        difficulty: this.config.difficulty,
        endlessTier,
        hpMult: scaledResidualMult,
        scale: opts.scale,
        miniBoss: opts.mini,
        ...(opts.initialBeholderState ? { initialState: opts.initialBeholderState } : {}),
        playableBounds: this.arena.playable,
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_beholder',
        numId,
        boss: sand,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_beholder',
          bossMaxHp: sand.state.maxHp,
          bossX: sand.state.x,
          bossY: sand.state.y,
          scale: opts.scale,
          armor: 4,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else if (opts.kind === 'boss_colossus') {
      const colossus = createDreadColossus({
        id: numId,
        idStr: `boss_colossus_${numId}`,
        x: opts.x,
        y: opts.y,
        playerCount,
        difficulty: this.config.difficulty,
        endlessTier,
        hpMult: scaledResidualMult,
        scale: opts.scale,
        seed: this.arenaSeed ^ numId,
        arenaBounds: this.arena.playable,
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_colossus',
        numId,
        boss: colossus,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_colossus',
          bossMaxHp: colossus.maxHp,
          bossX: colossus.x,
          bossY: colossus.y,
          scale: opts.scale,
          armor: 4,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    } else {
      const diffKey = (
        this.config.difficulty in BANSUNG_DIFFICULTY_SCALE ? this.config.difficulty : 'normal'
      ) as keyof typeof BANSUNG_DIFFICULTY_SCALE;
      const overlordBuiltInMult = Math.max(
        0.01,
        (1 + 0.55 * (Math.min(10, Math.max(1, playerCount)) - 1)) *
          BANSUNG_DIFFICULTY_SCALE[diffKey].bossHp *
          (1 + 0.35 * endlessTier),
      );
      const overlordResidualMult = Math.max(0.05, opts.hpMult / overlordBuiltInMult);
      const overlord = createOverlordBoss({
        id: numId,
        x: opts.x,
        y: opts.y,
        playerCount,
        difficulty: this.config.difficulty,
        endlessTier,
        hpMult: overlordResidualMult,
        scale: opts.scale,
        seed: this.arenaSeed ^ numId,
        nextEntityId: () => this.allocAuxSpatialId(),
      });
      this.activeBosses.push({
        ...meta,
        kind: 'boss_overlord',
        numId,
        boss: overlord,
        partGroup: createBossPartGroup({
          bossId: numId,
          kind: 'boss_overlord',
          bossMaxHp: overlord.maxHp,
          bossX: overlord.x,
          bossY: overlord.y,
          scale: opts.scale,
          armor: 4,
        }),
        lastPhaseBurstPctIdx: 0,
        deadEmitted: false,
      });
    }
  }

  private spawnWaveBoss(spec: DirectorBossSpawn): void {
    const count = Math.max(1, spec.count || 1);
    const positions = spec.positions ?? [{ x: spec.x, y: spec.y }];
    const isSurvival = resolveBansungGameMode(this.config) === 'survival';
    if (isSurvival || !spec.mini) {
      // Clear lingering non-boss wave mobs when a major Boss enters; only Boss summon skills spawn adds during Boss fights.
      this.mobMgr.mobs.length = 0;
      this.mobMgr.mobById.clear();
      this.mobMgr.mobByNumId.clear();
      this.mobMgr.projectiles.length = 0;
      this.mobMgr.telegraphs.clear();
      this.director.spawnTelegraphs.length = 0;
    }
    const cycleCount = isSurvival
      ? this.director.getSurvivalClock().cycle
      : Math.max(0, Math.floor((this.director.wave - BANSUNG_TOTAL_WAVES) / 5));
    const scale = spec.scale ?? (spec.mini ? 0.85 : 1);
    const splitTier = spec.splitTier ?? 0;
    const baseDmgScale =
      (spec.mini
        ? count >= 5
          ? 0.56
          : 0.72
        : splitTier >= 2
          ? 1.15
          : count >= 3
            ? 0.72
            : count === 2
              ? 0.85
              : 1.0) *
      (1 + 0.18 * cycleCount);

    for (let i = 0; i < count; i++) {
      const pos = positions[i % positions.length];
      const kind = spec.kinds?.[i] ?? spec.id;
      this.spawnSingleBossInstance({
        kind,
        x: pos.x,
        y: pos.y,
        hpMult: spec.hpMult,
        mini: spec.mini,
        scale,
        splitTier,
        dmgScale: baseDmgScale,
      });
    }
  }

  private checkMatchEnd(): void {
    if (this.result) return;
    const humans = this.players.filter((p) => !p.bot);
    const activePlayers = this.players.filter((p) => !p.left);

    if (humans.length > 0 && humans.every((h) => h.left || h.life === 'dead')) {
      this.finalizeResult(false, 'Toàn bộ người chơi đã bị loại.');
      return;
    }
    if (activePlayers.length > 0 && activePlayers.every((p) => p.life === 'dead')) {
      this.finalizeResult(false, 'Toàn bộ đội hình đã bị tiêu diệt.');
    }
  }

  private finalizeResult(victory: boolean, reason: string): void {
    if (this.result) return;
    const mode = resolveBansungGameMode(this.config);
    const clock = this.director.getSurvivalClock();
    const peakLevel = this.players.reduce((mx, p) => Math.max(mx, p.level ?? 1), 1);
    this.result = buildBansungResult({
      victory,
      reason,
      wavesCleared: victory
        ? Math.max(this.director.wavesCleared, this.director.wave)
        : this.director.wavesCleared,
      totalWaves:
        mode === 'survival' || this.config.endless
          ? Math.max(BANSUNG_TOTAL_WAVES, this.director.wave)
          : BANSUNG_TOTAL_WAVES,
      wave: this.director.wave,
      mode,
      ...(mode === 'survival'
        ? {
            cycle: clock.cycle,
            stageId: clock.stageId,
            level: peakLevel,
          }
        : {}),
      durationMs: this.elapsedMs,
      players: this.players,
    });
    this.stop();
    this.logs.push(reason);
    this.rebuildStaticAndPropViews();
    this.rebuildCullingCache();
    this.hooks.onStatsChanged?.();
    this.hooks.changed();
    this.hooks.end?.(this.result);
  }

  // ============================================================================
  // 7. Combat Routing, Target Resolution & Damage Accounting
  // ============================================================================

  private allocAuxSpatialId(): number {
    this.nextAuxSpatialId += 1;
    if (this.nextAuxSpatialId > 2_000_000_000) {
      this.nextAuxSpatialId = AUX_SPATIAL_BASE;
    }
    return this.nextAuxSpatialId;
  }

  private syncWeaponAndHeroState(p: BansungRuntimePlayer): void {
    p.weaponState.x = p.x;
    p.weaponState.y = p.y;
    p.weaponState.aimRad = p.aimRad;
    p.weaponState.alive = p.alive;
    p.weaponState.downed = p.downed;
    p.weaponState.stunned = (p.stunMs ?? 0) > 0;
    p.weaponState.dashing = isDashing(p.dash);
    p.weaponState.mods = p.mods;
    const dirEnergyCostMult = this.director.getEnergyCostMult();
    if (p.gachaMods) {
      p.weaponState.gachaMods = {
        dmgMult: p.gachaMods.dmgMult,
        fireRateMult: p.gachaMods.fireRateMult,
        extraMultishot: p.gachaMods.extraMultishot,
        critChanceAdd: p.gachaMods.critChanceAdd,
        critDmgMult: p.gachaMods.critDmgMult,
        extraPierce: p.gachaMods.extraPierce,
        blastRadiusMult: p.gachaMods.blastRadiusMult,
        reloadSpeedMul: p.gachaMods.reloadSpeedMult,
        energyCostMult: (p.gachaMods.energyCostMult ?? 1) * dirEnergyCostMult,
      };
    } else if (dirEnergyCostMult !== 1) {
      p.weaponState.gachaMods = { energyCostMult: dirEnergyCostMult };
    }
    p.weaponState.hasQuickHands =
      (p.mods.reloadSpeedMul ?? 1) > 1 || (p.gachaMods?.reloadSpeedMult ?? 1) > 1;
    p.weaponState.energy = clamp(p.energy, 0, p.maxEnergy);
    p.weaponState.maxEnergy = p.maxEnergy;
    p.slots = buildWeaponSlotsSnapshot(p.weaponState);
    p.slotIdx = p.weaponState.activeSlot;
  }

  private handleHeroXpGain(heroIdx: number, amount: number): void {
    if (resolveBansungGameMode(this.config) !== 'survival') return;
    const p = this.players[heroIdx];
    if (!p || p.left || amount <= 0 || !Number.isFinite(amount)) return;
    p.xp += Math.max(0, Math.round(amount));
    let leveledUp = false;
    while (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = getXpToNextLevel(p.level);
      p.gachaQueue += 1;
      leveledUp = true;
      this.fx.push(
        FX_STATUS,
        p.idx,
        BANSUNG_FX_STATUS_LEVELUP,
        p.level,
        Math.round(p.x),
        Math.round(p.y),
      );
    }
    if (!p.gachaChoices && p.gachaQueue > 0) {
      this.openNextGachaChoicesForHero(p);
    }
    p.gachaPending = p.gachaQueue + (p.gachaChoices ? 1 : 0);
    if (leveledUp) {
      this.hooks.changed();
    }
  }

  private openNextGachaChoicesForHero(p: BansungRuntimePlayer): void {
    if (p.gachaChoices || p.gachaQueue <= 0 || p.left) return;
    p.gachaQueue -= 1;
    const rawSlots = p.weaponState.slots.map((s) =>
      s
        ? { id: s.weaponId, tier: s.tier }
        : (null as unknown as { id: BansungWeaponId; tier?: number }),
    );
    const cards = rollSurvivalGachaCards({
      rng: this.rng,
      level: p.level,
      slots: rawSlots,
      activeSlotIdx: p.weaponState.activeSlot,
      skillStacks: p.skillStacks,
    });
    if (cards.length === 0) {
      p.gachaPending = p.gachaQueue;
      return;
    }
    p.gachaChoices = cards;
    p.gachaTimerMs = GACHA_CHOICE_TIMEOUT_MS;
    p.gachaRemMs = GACHA_CHOICE_TIMEOUT_MS;
    p.gachaBotWaitMs = p.bot ? BOT_GACHA_AUTO_PICK_MS : 0;
    p.gachaPending = p.gachaQueue + 1;
    // Brief grace shield when Gacha pops in combat
    p.gachaGraceMs = Math.max(p.gachaGraceMs, GACHA_POP_GRACE_MS);
    p.invulnTimer = Math.max(p.invulnTimer, GACHA_POP_GRACE_MS / 1000);
    p.hitIframesMs = Math.max(p.hitIframesMs ?? 0, GACHA_POP_GRACE_MS);
    this.hooks.changed();
  }

  private applyGachaPick(p: BansungRuntimePlayer, pickIdx: number): boolean {
    const choices = p.gachaChoices;
    if (!choices || choices.length === 0) return false;
    const clampedIdx = clamp(Math.trunc(pickIdx), 0, choices.length - 1);
    const card = choices[clampedIdx];
    if (!card) return false;

    let gachaFxTier = 0;
    if (card.category === 'weapon_upgrade') {
      if (card.fromTier === 0 && card.weaponId) {
        let targetSlot =
          card.slotIdx !== undefined && card.slotIdx >= 0 && card.slotIdx < BANSUNG_MAX_WEAPON_SLOTS
            ? card.slotIdx
            : p.weaponState.slots.findIndex((s) => s == null);
        if (targetSlot < 0) targetSlot = p.weaponState.activeSlot;
        const equipped = equipWeaponInSlot(p.weaponState, targetSlot, card.weaponId);
        if (equipped) {
          gachaFxTier = equipped.tier ?? 1;
          p.weaponState.activeSlot = targetSlot;
          p.slots = buildWeaponSlotsSnapshot(p.weaponState);
          this.logs.push(`${p.name} mở khóa ${card.vnTitle || card.title}!`);
        }
      } else {
        const targetSlot =
          card.slotIdx !== undefined && card.slotIdx >= 0 && card.slotIdx < p.weaponState.slots.length
            ? card.slotIdx
            : p.weaponState.activeSlot;
        const up = upgradeHeroWeaponTier(p.weaponState, targetSlot);
        if (up.ok) {
          gachaFxTier = p.weaponState.slots[targetSlot]?.tier ?? up.toTier;
          const slotObj = p.weaponState.slots[targetSlot];
          if (slotObj) {
            const spec = getWeaponSpec(slotObj.weaponId);
            if (spec.magSize > 0) {
              slotObj.ammoInMag = spec.magSize;
            }
            if (p.weaponState.reload && p.weaponState.reload.slot === targetSlot) {
              p.weaponState.reload = null;
            }
          }
          p.slots = buildWeaponSlotsSnapshot(p.weaponState);
          this.logs.push(`${p.name} nâng cấp ${card.vnTitle || card.title}!`);
        }
      }
    } else {
      const applied = applySurvivalGachaSkillToHero(p, card);
      if (applied.ok) {
        this.logs.push(`${p.name} nhận kỹ năng: ${card.vnTitle || card.title}`);
      }
    }

    p.gachaChoices = undefined;
    p.gachaTimerMs = 0;
    p.gachaRemMs = 0;
    p.gachaBotWaitMs = 0;
    recomputeHeroStats(p);
    p.armor = p.shield;
    p.maxArmor = p.maxShield;
    this.syncWeaponAndHeroState(p);

    this.fx.push(
      FX_STATUS,
      p.idx,
      BANSUNG_FX_STATUS_GACHA,
      gachaFxTier,
      Math.round(p.x),
      Math.round(p.y),
    );

    if (p.gachaQueue > 0) {
      this.openNextGachaChoicesForHero(p);
    }
    p.gachaPending = p.gachaQueue + (p.gachaChoices ? 1 : 0);
    this.hooks.changed();
    return true;
  }

  private stepGachaTimers(): void {
    for (const p of this.players) {
      if (p.left) continue;
      if (!p.gachaChoices && p.gachaQueue > 0) {
        this.openNextGachaChoicesForHero(p);
      }
      if (!p.gachaChoices || p.gachaChoices.length === 0) {
        p.gachaPending = p.gachaQueue;
        p.gachaRemMs = 0;
        continue;
      }
      p.gachaTimerMs = Math.max(0, p.gachaTimerMs - DT_MS);
      p.gachaRemMs = Math.max(0, Math.round(p.gachaTimerMs));
      if (p.bot) {
        p.gachaBotWaitMs = Math.max(0, p.gachaBotWaitMs - DT_MS);
        if (p.gachaBotWaitMs <= 0) {
          const bestIdx = this.pickBestGachaIdxForBot(p.gachaChoices);
          this.applyGachaPick(p, bestIdx);
          continue;
        }
      }
      if (p.gachaTimerMs <= 0) {
        this.applyGachaPick(p, 0);
      } else {
        p.gachaPending = p.gachaQueue + 1;
      }
    }
  }

  private pickBestGachaIdxForBot(cards: readonly BansungGachaCard[]): number {
    let bestIdx = 0;
    let bestPrio = Number.POSITIVE_INFINITY;
    let bestRarity = -1;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const prio = BOT_GACHA_CATEGORY_PRIORITY[c.category] ?? 99;
      const rarity = GACHA_RARITY_RANK[c.rarity] ?? 0;
      if (prio < bestPrio || (prio === bestPrio && rarity > bestRarity)) {
        bestIdx = i;
        bestPrio = prio;
        bestRarity = rarity;
      }
    }
    return bestIdx;
  }

  private spendPlayerEnergy(p: BansungRuntimePlayer, cost: number): void {
    if (cost <= 0) return;
    p.energy = Math.max(0, Math.round(p.energy - cost));
    p.weaponState.energy = p.energy;
    p.weaponState.lastEnergySpendTick = this.tickNo;
  }

  private buildDamageContext(): BansungDamageContext {
    return {
      rng: this.rng,
      fx: this.fx,
    };
  }

  private buildWeaponWorldContext(): BansungWeaponWorldContext {
    return {
      tickNo: this.tickNo,
      obsGrid: this.arena.obsGrid,
      actorGrid: this.actorGrid,
      bullets: this.bulletPool,
      rng: this.rng,
      fx: this.fx,
      deferMeleeSweep: true,
      resolveTarget: (actorId) => this.resolveCombatTarget(actorId),
      applyKnockback: (actorId, kvx, kvy) => {
        this.applyActorKnockback(actorId, kvx, kvy);
      },
      applyRecoilPush: (heroId, rvx, rvy) => {
        const p = this.playerById.get(heroId);
        if (p) {
          p.knockVx += rvx;
          p.knockVy += rvy;
        }
      },
      damageObstacle: (obstacleId, damage, attackerId) => {
        const owner = attackerId ? this.playerById.get(attackerId) : undefined;
        damagePropByObstacleId(this.arena, obstacleId, damage, 0, {
          nowTick: this.tickNo,
          ownerIdx: owner?.idx,
          attackerId,
          fx: this.fx,
          onPropBreak: (ev) => this.handlePropBreak(ev),
        });
      },
      onDamageDealt: (attackerId, target, res) => {
        const owner = this.playerById.get(attackerId);
        if (owner && !res.blocked && res.totalDmg > 0) {
          owner.stats.damageDealt += res.totalDmg;
          if (target.tier === 'boss') {
            owner.stats.bossDamage += res.totalDmg;
          }
        }
        const aux = this.auxTargets.get(Number(target.id));
        if (aux?.kind === 'sand_boss' && res.totalDmg > 0) {
          aux.lastDamagedBy = attackerId;
        }
      },
      onEnemyStunned: (attackerId) => {
        const owner = this.playerById.get(attackerId);
        if (owner) owner.stats.stunsInflicted += 1;
      },
      onActorKilled: (attackerId, target) => {
        const mob = this.mobMgr.mobByNumId.get(Number(target.id));
        if (mob) {
          this.recordMobDeath(mob, attackerId);
        }
      },
      grantEnergy: (heroId, amount) => {
        const p = this.playerById.get(heroId);
        if (!p || !p.alive || p.downed) return 0;
        const gained = Math.min(p.maxEnergy - p.energy, Math.max(0, Math.round(amount)));
        p.energy += gained;
        p.weaponState.energy = p.energy;
        return gained;
      },
    };
  }

  private resolveCombatTarget(actorId: number): BansungCombatTarget | undefined {
    const mob = this.mobMgr.mobByNumId.get(actorId);
    if (mob) return mob;

    const aux = this.auxTargets.get(actorId);
    if (aux) return aux.target;

    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_colossus') {
        if (entry.boss.id === actorId) return entry.boss;
        for (const d of entry.boss.drones) {
          if (d.id === actorId) return d;
        }
      } else if (entry.kind === 'boss_overlord') {
        if (entry.boss.id === actorId) return entry.boss;
      } else if (
        entry.kind === 'boss_arsenal' ||
        entry.kind === 'boss_tempest' ||
        entry.kind === 'boss_destroyer' ||
        entry.kind === 'boss_frost_empress' ||
        entry.kind === 'boss_abyssal_leviathan'
      ) {
        if (entry.boss.id === actorId) return entry.boss.combatTarget;
      }
    }

    if (actorId >= TURRET_SPATIAL_BASE && actorId < 300_000) {
      const depId = actorId - TURRET_SPATIAL_BASE;
      const dep = this.gadgetState.deployables.find((d) => d.id === depId);
      if (dep) {
        const t: BansungCombatTarget = {
          id: dep.id,
          numId: dep.id,
          x: dep.x,
          y: dep.y,
          tier: 'mob',
          armorType: 'armored',
          flatArmor: 1,
          alive: dep.hp > 0,
          hp: dep.hp,
          maxHp: dep.maxHp,
          shield: 0,
          maxShield: 0,
          ccImmune: true,
        };
        this.auxTargets.set(actorId, { kind: 'turret', deployableId: dep.id, radius: 14, target: t });
        return t;
      }
    }
    return undefined;
  }

  private resolveBarrelCombatActor(actor: SpatialActor): BarrelCombatActor | undefined {
    const target = this.resolveCombatTarget(actor.id);
    if (!target) return undefined;
    return target as BarrelCombatActor;
  }

  private reconcileAuxAndBossTargets(): void {
    for (const binding of this.auxTargets.values()) {
      if (binding.kind === 'sand_boss') {
        const dmg = Math.max(0, binding.prevHp - binding.target.hp);
        const stun = Math.max(0, binding.target.stunMs ?? 0);
        binding.target.stunMs = 0;
        const attackerId = binding.lastDamagedBy;
        binding.lastDamagedBy = undefined;
        if (dmg > 0 || stun > 0) {
          binding.target.hp = binding.prevHp;
          binding.entry.boss.applyHit(
            {
              baseDmg: dmg,
              dmgKind: 'true',
              critChance: 0,
              attackerId,
              stunMs: stun > 0 ? stun : undefined,
            },
            { rng: this.rng },
          );
          if (stun > 0) {
            binding.entry.boss.addStagger(stunMsToBossStagger(stun));
          }
          binding.prevHp = binding.entry.boss.state.hp;
        }
      } else if (binding.kind === 'portal_gate') {
        const dmg = Math.max(0, binding.prevHp - binding.target.hp);
        if (dmg > 0) {
          this.director.damagePortalGate(binding.gateId, dmg);
          binding.prevHp = Math.max(0, binding.target.hp);
        }
      } else if (binding.kind === 'overlord_pylon') {
        const dmg = Math.max(0, binding.prevHp - binding.target.hp);
        if (dmg > 0) {
          const pylon = binding.boss.pylons.find((py) => py.id === binding.pylonId);
          if (pylon && pylon.alive) {
            damageOverlordPylon(
              binding.boss,
              binding.pylonId,
              {
                baseDmg: dmg,
                dmgKind: 'true',
                critChance: 0,
              },
              { rng: this.rng },
            );
            binding.prevHp = pylon.hp;
          }
        }
      } else if (binding.kind === 'overlord_wp') {
        const dmg = Math.max(0, binding.prevHp - binding.target.hp);
        if (dmg > 0) {
          const wp = binding.boss.weakPoints.find((w) => w.idx === binding.wpIdx);
          if (wp && wp.alive) {
            const wpRes = damageOverlordWeakPoint(
              binding.boss,
              binding.wpIdx,
              {
                baseDmg: dmg,
                dmgKind: 'true',
                critChance: 0,
              },
              this.buildDamageContext(),
            );
            for (const orb of wpRes.energyOrbs) {
              this.pickupMgr.spawnPickup('energy_orb', orb.x, orb.y, {
                stack: Math.max(1, Math.round(orb.energy / 10)),
              });
            }
            binding.prevHp = wp.hp;
          }
        }
      } else if (binding.kind === 'turret') {
        const dep = this.gadgetState.deployables.find((d) => d.id === binding.deployableId);
        if (dep) dep.hp = Math.max(0, binding.target.hp);
      } else if (binding.kind === 'boss_part') {
        binding.part.hp = Math.max(0, Math.round(binding.target.hp));
      }
    }

    // Reconcile Colossus drone shatter / death and Overlord phase check
    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_colossus') {
        syncColossusDrones(entry.boss, {
          obsGrid: this.arena.obsGrid,
          actorGrid: this.actorGrid,
          players: this.colossusTargets,
          damageCtx: this.buildDamageContext(),
        });
        if (entry.boss.hp <= 0) {
          damageDreadColossus(entry.boss, { baseDmg: 0, dmgKind: 'true' });
        }
      } else if (entry.kind === 'boss_overlord') {
        if (entry.boss.hp <= 0 && entry.boss.alive) {
          damageOverlordBoss(entry.boss, { baseDmg: 1, dmgKind: 'true' });
        }
      } else if (
        entry.kind === 'boss_arsenal' ||
        entry.kind === 'boss_tempest' ||
        entry.kind === 'boss_destroyer' ||
        entry.kind === 'boss_frost_empress' ||
        entry.kind === 'boss_abyssal_leviathan'
      ) {
        entry.boss.hp = Math.max(0, entry.boss.combatTarget.hp);
        if (entry.boss.hp <= 0 && entry.boss.alive) {
          entry.boss.alive = false;
        }
      }
    }
    this.evaluateAndTriggerBossPartBreaks();
  }

  private getBossPosAndAim(entry: ActiveBossEntry): { x: number; y: number; aimRad: number; alive: boolean } | null {
    if (entry.kind === 'boss_beholder') {
      const s = entry.boss.state;
      return { x: s.x, y: s.y, aimRad: s.aimAngle, alive: !entry.boss.isDead() };
    }
    if (entry.kind === 'boss_colossus') {
      const b = entry.boss;
      return { x: b.x, y: b.y, aimRad: b.aimRad, alive: b.alive && b.hp > 0 };
    }
    if (entry.kind === 'boss_overlord') {
      const b = entry.boss;
      return { x: b.x, y: b.y, aimRad: b.aimAngle, alive: b.alive && b.hp > 0 };
    }
    const b = entry.boss;
    return { x: b.x, y: b.y, aimRad: b.aimRad, alive: b.alive && b.hp > 0 };
  }

  private spawnBossEscortMobs(kinds: readonly BansungEnemyId[], cx: number, cy: number): void {
    if (this.mobMgr.mobs.length >= 48) return;
    const pCount = Math.max(1, this.players.filter((p) => !p.left).length);
    for (let k = 0; k < kinds.length; k++) {
      const ang = (k / Math.max(1, kinds.length)) * Math.PI * 2 + this.rng() * 0.4;
      const dist = 92 + k * 14;
      const sx = clamp(cx + Math.cos(ang) * dist, this.arena.playable.x0 + 36, this.arena.playable.x1 - 36);
      const sy = clamp(cy + Math.sin(ang) * dist, this.arena.playable.y0 + 36, this.arena.playable.y1 - 36);
      spawnMob(this.mobMgr, {
        kind: kinds[k],
        x: sx,
        y: sy,
        playerCount: pCount,
        wave: this.director.wave,
        difficulty: this.config.difficulty,
      });
    }
  }

  private evaluateAndTriggerBossPartBreaks(): void {
    for (const entry of this.activeBosses) {
      let bossTarget: { hp: number; maxHp: number; alive: boolean; stunMs?: number };
      if (entry.kind === 'boss_beholder') {
        const s = entry.boss.state;
        bossTarget = { hp: s.hp, maxHp: s.maxHp, alive: !entry.boss.isDead() };
      } else if (entry.kind === 'boss_colossus' || entry.kind === 'boss_overlord') {
        bossTarget = entry.boss;
      } else {
        bossTarget = entry.boss.combatTarget;
      }
      if (!bossTarget.alive || bossTarget.hp <= 0) continue;

      const breaks = evaluateBossPartBreaks(entry.partGroup, bossTarget);
      if (breaks.length === 0) continue;

      for (const ev of breaks) {
        if (entry.kind === 'boss_beholder') {
          if (ev.shatterDmg > 0) {
            entry.boss.applyHit({ baseDmg: ev.shatterDmg, dmgKind: 'true', critChance: 0 }, { rng: this.rng });
          }
          entry.boss.addStagger(stunMsToBossStagger(ev.stunMs));
        } else if (entry.kind === 'boss_colossus') {
          stunColossusBoss(entry.boss, ev.stunMs);
          this.triggerLegacyBossUnlockedSkillBurst(entry, ev.unlockedSkill);
        } else if (entry.kind === 'boss_overlord') {
          entry.boss.shockStunTicks = Math.max(entry.boss.shockStunTicks, Math.round(ev.stunMs / DT_MS));
          entry.boss.stunMs = Math.max(entry.boss.stunMs ?? 0, ev.stunMs);
          this.triggerLegacyBossUnlockedSkillBurst(entry, ev.unlockedSkill);
        } else if (entry.kind === 'boss_arsenal') {
          entry.boss.hp = Math.max(1, bossTarget.hp);
          stunArsenalBoss(entry.boss, ev.stunMs);
          this.triggerLegacyBossUnlockedSkillBurst(entry, ev.unlockedSkill);
        } else if (entry.kind === 'boss_tempest') {
          entry.boss.hp = Math.max(1, bossTarget.hp);
          stunTempestBoss(entry.boss, ev.stunMs, ev.unlockedSkill);
        } else if (entry.kind === 'boss_destroyer') {
          entry.boss.hp = Math.max(1, bossTarget.hp);
          stunDestroyerBoss(entry.boss, ev.stunMs, ev.unlockedSkill);
        } else if (entry.kind === 'boss_frost_empress') {
          entry.boss.hp = Math.max(1, bossTarget.hp);
          stunFrostEmpressBoss(entry.boss, ev.stunMs, ev.unlockedSkill);
        } else if (entry.kind === 'boss_abyssal_leviathan') {
          entry.boss.hp = Math.max(1, bossTarget.hp);
          stunLeviathanBoss(entry.boss, ev.stunMs, ev.unlockedSkill);
        }

        this.fx.push(
          FX_STATUS,
          entry.numId,
          BANSUNG_FX_STATUS_BOSS_PART_BREAK,
          Math.round(ev.x),
          Math.round(ev.y),
          Math.round(ev.stunMs),
        );
        this.fx.push(FX_BLAST, BANSUNG_FX_BLAST_HE, Math.round(ev.x), Math.round(ev.y), 72, entry.numId);
        this.pickupMgr.spawnBossPhaseEnergyBurst(ev.x, ev.y, 4);
        this.logs.push(
          `💥 Phá hủy ${ev.part.vnName}! Boss CHOÁNG ${(ev.stunMs / 1000).toFixed(1)}s & kích hoạt skill: ${ev.unlockedSkillVn}!`,
        );
      }
      this.hooks.changed();
    }
  }

  private triggerLegacyBossUnlockedSkillBurst(entry: ActiveBossEntry, unlockedSkill: string): void {
    const pos = this.getBossPosAndAim(entry);
    if (!pos) return;
    const count = unlockedSkill.includes('ring') || unlockedSkill.includes('360') ? 16 : 12;
    const dmg = Math.round(18 * (entry.dmgScale ?? 1));
    for (let k = 0; k < count; k++) {
      if (k === 0 || k === 1 || k === Math.floor(count / 2)) continue; // escape gap
      const ang = pos.aimRad + (k / count) * Math.PI * 2;
      this.spawnBossProjectile({
        ownerActorId: entry.numId,
        kindId: resolveEnemyProjKindId(unlockedSkill.includes('void') ? 'void_bolt' : 'plasma_orb'),
        x: pos.x + Math.cos(ang) * 44,
        y: pos.y + Math.sin(ang) * 44,
        vx: Math.cos(ang) * 245,
        vy: Math.sin(ang) * 245,
        radius: 8,
        damage: dmg,
        dmgKind: 'energy',
        ttlTicks: 80,
        armored: false,
      });
    }
    if (unlockedSkill === 'summon_vanguard') {
      this.spawnBossEscortMobs(['chrono_mage', 'void_reaper'], pos.x, pos.y);
    }
  }

  private executeHeroActiveSkill(p: BansungRuntimePlayer, cmdX?: number, cmdY?: number): void {
    const heroSpec = getBansungHero(p.heroId);
    const skill = heroSpec.activeSkill;
    if (p.skillCdMs > 0) return;

    this.spendPlayerEnergy(p, Math.min(p.energy, skill.energyCost));
    p.skillCdMs = skill.cooldownMs;
    p.skillMaxMs = skill.cooldownMs;
    p.skillActiveMs = skill.durationMs;

    const aimRad =
      cmdX !== undefined && cmdY !== undefined
        ? Math.atan2(cmdY - p.y, cmdX - p.x)
        : p.aimRad;

    this.fx.push(
      FX_STATUS,
      p.idx,
      BANSUNG_FX_STATUS_HERO_SKILL,
      Math.round(p.x),
      Math.round(p.y),
      Math.round(skill.durationMs),
    );

    if (p.heroId === 'mascot') {
      const snaps = buildWeaponSlotsSnapshot(p.weaponState);
      for (const slot of p.weaponState.slots) {
        if (!slot) continue;
        const snap = snaps.find((s) => s?.id === slot.weaponId);
        if (snap && snap.maxClip > 0) slot.ammoInMag = snap.maxClip;
      }
      p.weaponState.reload = null;
      this.pickupMgr.spawnPickup('energy_orb', p.x + 28, p.y, { stack: 2 });
      this.pickupMgr.spawnPickup('armor_plate', p.x - 28, p.y, { stack: 2 });
    } else if (p.heroId === 'ranger') {
      const baseDmg = Math.round(36 * (p.mods.dmgMul ?? 1) * (p.gachaMods?.dmgMult ?? 1));
      for (let k = -3; k <= 3; k++) {
        const ang = aimRad + k * 0.09;
        this.bulletPool.spawn({
          kind: 'rail_beam',
          team: 0,
          ownerId: p.id,
          ownerIdx: p.idx,
          x: p.x + Math.cos(ang) * 18,
          y: p.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * 780,
          vy: Math.sin(ang) * 780,
          radius: 5,
          maxRange: 640,
          ttlTicks: 30,
          dmgKind: 'energy',
          baseDmg,
          dmgMult: p.mods.dmgMul,
          pierceLeft: 2,
          armorPiercePct: 0.45,
          isEnergy: true,
        });
      }
    } else if (p.heroId === 'pyro') {
      const novaR = 240;
      p.shield = Math.min(p.maxShield, p.shield + 35);
      p.armor = p.shield;
      this.fx.push(FX_BLAST, BANSUNG_FX_BLAST_HERO_NOVA, Math.round(p.x), Math.round(p.y), novaR, p.actorId);
      const fireDmg = Math.round(68 * (p.mods.dmgMul ?? 1) * (p.gachaMods?.dmgMult ?? 1));
      const dmgCtx = this.buildDamageContext();
      for (const m of this.mobMgr.mobs) {
        if (!m.alive || m.hp <= 0) continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) <= novaR + m.radius) {
          applyBansungDamage(m, { baseDmg: fireDmg, dmgKind: 'fire', attackerId: p.id }, dmgCtx);
          if (m.alive) applyDot(m, 'burn', p.id, { ...dmgCtx, durMs: 3000 });
        }
      }
      for (const binding of this.auxTargets.values()) {
        if (binding.kind !== 'boss_part') continue;
        if (Math.hypot((binding.target.x ?? 0) - p.x, (binding.target.y ?? 0) - p.y) <= novaR + binding.radius) {
          applyBansungDamage(binding.target, { baseDmg: fireDmg, dmgKind: 'fire', attackerId: p.id }, dmgCtx);
        }
      }
    } else {
      const slamR = 220;
      p.invulnTimer = Math.max(p.invulnTimer, 1.2);
      p.shield = Math.min(p.maxShield, p.shield + 50);
      p.armor = p.shield;
      this.fx.push(FX_BLAST, BANSUNG_FX_BLAST_HERO_NOVA, Math.round(p.x), Math.round(p.y), slamR, p.actorId);
      destroyMobProjectilesInRadius(this.mobMgr, p.x, p.y, slamR);
      const slamDmg = Math.round(62 * (p.mods.dmgMul ?? 1) * (p.gachaMods?.dmgMult ?? 1));
      const dmgCtx = this.buildDamageContext();
      for (const m of this.mobMgr.mobs) {
        if (!m.alive || m.hp <= 0) continue;
        if (Math.hypot(m.x - p.x, m.y - p.y) <= slamR + m.radius) {
          applyBansungDamage(m, { baseDmg: slamDmg, dmgKind: 'explosive', attackerId: p.id }, dmgCtx);
          if (m.alive && !m.ccImmune) applyStunWithDR(m, 1800, dmgCtx);
        }
      }
      for (const binding of this.auxTargets.values()) {
        if (binding.kind !== 'boss_part') continue;
        if (Math.hypot((binding.target.x ?? 0) - p.x, (binding.target.y ?? 0) - p.y) <= slamR + binding.radius) {
          applyBansungDamage(binding.target, { baseDmg: slamDmg, dmgKind: 'explosive', attackerId: p.id }, dmgCtx);
        }
      }
    }

    this.syncWeaponAndHeroState(p);
  }

  private applyActorKnockback(actorId: number, kvx: number, kvy: number): void {
    const mob = this.mobMgr.mobByNumId.get(actorId);
    if (mob) {
      const resist = Math.max(0, 1 - mob.kbResist);
      mob.knockVx += kvx * resist;
      mob.knockVy += kvy * resist;
    }
  }

  private applyHeroIncomingDamage(
    p: BansungRuntimePlayer,
    hit: BansungDamageHit,
    kx = 0,
    ky = 0,
  ): BansungDamageResult {
    const res = applyBansungDamage(p, hit, this.buildDamageContext());
    p.armor = p.shield;
    if (!res.blocked && res.totalDmg > 0) {
      p.stats.damageTaken += res.totalDmg;
      p.knockVx += kx;
      p.knockVy += ky;
      if (res.hpDmg > 0) {
        this.tryStaticShieldPulse(p, res.hpDmg);
      }
    }
    if (p.life === 'alive' && p.hp <= 0) {
      this.transitionHeroToDownedOrDead(p);
    }
    return res;
  }

  private tryStaticShieldPulse(p: BansungRuntimePlayer, hpDmg: number): void {
    if (!p.mods.staticShield || hpDmg < STATIC_SHIELD_DMG_THRESHOLD) return;
    if (p.staticShieldCdS > 0 || p.life !== 'alive') return;
    p.staticShieldCdS = BANSUNG_STATIC_SHIELD_CONSTS.cooldownS;
    const r2 = BANSUNG_STATIC_SHIELD_CONSTS.radius * BANSUNG_STATIC_SHIELD_CONSTS.radius;
    this.fx.push(
      FX_BLAST,
      BANSUNG_FX_BLAST_STUN,
      Math.round(p.x),
      Math.round(p.y),
      BANSUNG_STATIC_SHIELD_CONSTS.radius,
      p.idx,
    );
    for (const mob of this.mobMgr.mobs) {
      if (!mob.alive) continue;
      const dx = mob.x - p.x;
      const dy = mob.y - p.y;
      if (dx * dx + dy * dy <= r2) {
        const ms = stunMob(this.mobMgr, mob, BANSUNG_STATIC_SHIELD_CONSTS.stunMs);
        if (ms > 0) p.stats.stunsInflicted += 1;
      }
    }
  }

  private transitionHeroToDownedOrDead(p: BansungRuntimePlayer): void {
    if (p.life !== 'alive') return;
    p.stats.deaths += 1;
    p.fireHeld = false;
    cancelHeroDash(p.dash);
    cancelHeroWeaponActions(p.weaponState);
    p.weaponState.reload = null;
    enterDownedState(p, this.config.reviveMode, this.fx);
    p.life = 'downed';
    p.downed = true;
    p.armor = 0;
    this.syncWeaponAndHeroState(p);
    this.hooks.changed();
  }

  private recordMobDeath(mob: MobState, killerId?: string): void {
    if (this.processedDeadMobs.has(mob.id)) return;
    this.processedDeadMobs.add(mob.id);
    mob.alive = false;
    mob.spatialActor.alive = false;

    const killer = this.playerById.get(killerId ?? mob.lastDamagedBy ?? '');
    if (killer) {
      killer.stats.kills += 1;
      if (mob.elite) killer.stats.elitesKilled += 1;
      onHeroEnemyKill(killer, this.fx);
    }

    this.fx.push(
      FX_DEATH,
      BANSUNG_ENEMIES[mob.kind].kindId,
      Math.round(mob.x),
      Math.round(mob.y),
      mob.elite ? 1 : 0,
      killer ? killer.idx : -1,
    );

    this.pickupMgr.dropMobLoot(mob.elite ? 'elite' : 'mob', mob.x, mob.y, {
      wave: this.director.wave,
      heroes: this.players,
      teamAvgEnergyRatio: this.computeTeamAvgEnergyRatio(),
    });
    if (resolveBansungGameMode(this.config) === 'survival') {
      spawnEnemyXpOrbs(
        this.pickupMgr,
        mob.x,
        mob.y,
        mob.kind,
        Boolean(mob.elite),
        Boolean(mob.evolved),
        this.director.getSurvivalClock().cycle,
        { rng: this.rng },
      );
    }
  }

  private checkBossPhaseBurst(
    entry: ActiveBossEntry,
    hp: number,
    maxHp: number,
    x: number,
    y: number,
  ): void {
    if (maxHp <= 0 || hp <= 0) return;
    const ratio = hp / maxHp;
    while (
      entry.lastPhaseBurstPctIdx < BOSS_PHASE_BURST_THRESHOLDS.length &&
      ratio <= BOSS_PHASE_BURST_THRESHOLDS[entry.lastPhaseBurstPctIdx]
    ) {
      this.pickupMgr.spawnBossPhaseEnergyBurst(x, y, 4);
      entry.lastPhaseBurstPctIdx += 1;
    }
  }

  private handleBossDeath(entry: ActiveBossEntry, x: number, y: number): void {
    if (entry.deadEmitted) return;
    entry.deadEmitted = true;
    this.fx.push(FX_DEATH, BANSUNG_ENEMY_INDEX[entry.kind], Math.round(x), Math.round(y), 2, -1);

    const tier = entry.splitTier ?? 0;
    let spawnedSplitChildren = 0;
    if (tier > 0) {
      const childTier = tier - 1;
      const childCount = 4;
      const childScale = childTier === 1 ? 0.92 : 0.62;
      const parentHpMult = Math.max(0.15, entry.baseHpMult ?? 1);
      const childHpMult = parentHpMult * (childTier === 1 ? 0.28 : 0.38);
      const childDmgScale = (entry.dmgScale ?? 1) * (childTier === 1 ? 0.72 : 0.65);
      const splitDist = childTier === 1 ? 78 : 54;
      for (let k = 0; k < childCount; k++) {
        const ang = Math.PI * 0.25 + k * Math.PI * 0.5;
        const [cx, cy] = clampPointToPlayable(
          this.arena,
          x + Math.cos(ang) * splitDist,
          y + Math.sin(ang) * splitDist,
          36,
        );
        this.spawnSingleBossInstance({
          kind: entry.kind,
          x: cx,
          y: cy,
          hpMult: childHpMult,
          mini: true,
          scale: childScale,
          splitTier: childTier,
          dmgScale: childDmgScale,
          initialBeholderState: 'move',
        });
        this.fx.push(FX_DEATH, BANSUNG_ENEMY_INDEX[entry.kind], Math.round(cx), Math.round(cy), 1, -1);
        spawnedSplitChildren += 1;
      }
      this.logs.push(
        childTier === 1
          ? '💥 Boss Khổng Lồ phân thân thành 4 Mini-Boss!'
          : '⚡ Mini-Boss phân thân thành 4 Tiểu Boss!',
      );
    }

    const otherBossAlive = this.activeBosses.some(
      (other) =>
        other !== entry &&
        !other.deadEmitted &&
        (other.kind === 'boss_beholder'
          ? !other.boss.isDead()
          : other.boss.alive && other.boss.hp > 0),
    );
    const encounterCleared = spawnedSplitChildren === 0 && !otherBossAlive;
    if (encounterCleared) {
      this.bossKillsThisTick += 1;
      this.lastBossDeathPos = { x, y };
    }

    const isWavesMode = resolveBansungGameMode(this.config) === 'waves';
    if (encounterCleared) {
      this.pickupMgr.dropMobLoot('boss', x, y, {
        wave: this.director.wave,
        heroes: this.players,
        forcePedestal: isWavesMode && (this.director.wave === 4 || this.director.wave === 7),
      });
    }
    if (!isWavesMode) {
      spawnEnemyXpOrbs(
        this.pickupMgr,
        x,
        y,
        entry.kind,
        !entry.miniBoss,
        false,
        this.director.getSurvivalClock().cycle,
        { rng: this.rng },
      );
    }
  }

  private handlePropBreak(ev: PropBreakEvent): void {
    if (ev.shouldDropLoot) {
      this.pickupMgr.dropPropLoot(ev.prop.kind, ev.prop.x, ev.prop.y, {
        wave: this.director.wave,
        heroes: this.players,
      });
    }
    this.fx.push(
      FX_STATUS,
      Math.max(0, ev.ownerIdx),
      BANSUNG_FX_STATUS_CRATE,
      ev.prop.propKindIdx,
      Math.round(ev.prop.x),
      Math.round(ev.prop.y),
    );
  }

  private spawnBossProjectile(opts: Omit<BossProjectile, 'id'>): void {
    this.bossProjectiles.push({
      id: 700_000 + (this.nextBossProjId++ % 250_000),
      ...opts,
    });
  }

  private computeTeamAvgEnergyRatio(): number {
    let sum = 0;
    let count = 0;
    for (const p of this.players) {
      if (p.left || p.life !== 'alive' || p.maxEnergy <= 0) continue;
      sum += p.energy / p.maxEnergy;
      count++;
    }
    return count > 0 ? sum / count : 1;
  }

  private toGadgetPlayerActor(p: BansungRuntimePlayer): GadgetPlayerActor {
    return {
      ...(p as BansungCombatTarget),
      idx: p.idx,
      x: p.x,
      y: p.y,
      radius: p.radius,
      aimRad: p.aimRad,
      energy: p.energy,
      maxEnergy: p.maxEnergy,
      stunTicks: p.stunMs ? Math.ceil(p.stunMs / DT_MS) : 0,
      energyCostMult:
        p.mods.energyCostMul * (p.gachaEnergyCostMult ?? 1) * this.director.getEnergyCostMult(),
      blastRadiusMult: p.mods.blastRadiusMul * (p.gachaBlastRadiusMult ?? 1),
      dmgMult: p.mods.dmgMul * (p.gachaDmgMult ?? 1),
      extraDeployables: 0,
    };
  }

  private collectGadgetEnemies(): GadgetEnemyActor[] {
    const out: GadgetEnemyActor[] = [];
    for (const m of this.mobMgr.mobs) {
      if (!m.alive || m.hp <= 0) continue;
      out.push(m as GadgetEnemyActor);
    }
    for (const aux of this.auxTargets.values()) {
      const liveAux = aux.target as GadgetEnemyActor;
      liveAux.numId = Number(aux.target.numId ?? aux.target.id);
      liveAux.radius = aux.radius;
      out.push(liveAux);
    }
    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_colossus' && entry.boss.alive) {
        const liveBoss = entry.boss as unknown as GadgetEnemyActor;
        liveBoss.numId = entry.boss.id;
        out.push(liveBoss);
        for (const d of entry.boss.drones) {
          if (d.alive && d.hp > 0) {
            const liveDrone = d as unknown as GadgetEnemyActor;
            liveDrone.numId = d.id;
            out.push(liveDrone);
          }
        }
      } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
        const liveBoss = entry.boss as unknown as GadgetEnemyActor;
        liveBoss.numId = entry.boss.id;
        out.push(liveBoss);
      } else if (entry.kind === 'boss_arsenal' && entry.boss.alive) {
        const liveBoss = entry.boss.combatTarget as unknown as GadgetEnemyActor;
        liveBoss.numId = entry.boss.id;
        liveBoss.radius = entry.boss.radius;
        out.push(liveBoss);
      }
    }
    return out;
  }

  private toBotPlayerView(p: BansungRuntimePlayer): BotPlayerView {
    const slotWeapon = p.slots[p.slotIdx]?.id ?? p.sidearmWeapon;
    const reload = p.weaponState.reload;
    return {
      id: p.id,
      idx: p.idx,
      bot: p.bot,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      radius: p.radius,
      aimRad: p.aimRad,
      aimCos: p.aimCos,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      maxShield: p.maxShield,
      armor: p.shield,
      maxArmor: p.maxShield,
      energy: p.energy,
      maxEnergy: p.maxEnergy,
      alive: p.alive,
      downed: p.downed,
      life: p.life,
      bleedLeft: p.bleedLeft,
      bleedMax: p.bleedMax,
      downCountWave: p.downCountWave,
      reviveProg: p.reviveProg,
      reviveContrib: p.reviveContrib,
      rescuersCount: p.rescuersCount,
      invulnTimer: p.invulnTimer,
      hitIframesMs: p.hitIframesMs,
      dashCdMs: Math.round(p.dash.cdLeft * 1000),
      dashLeftMs: Math.round(p.dash.dashLeft * 1000),
      dashing: isDashing(p.dash),
      stunMs: p.stunMs,
      stunned: (p.stunMs ?? 0) > 0,
      slots: p.slots as readonly BansungWeaponSlot[],
      slotIdx: p.weaponState.activeSlot,
      weaponId: slotWeapon,
      reloadMs: reload ? Math.round((reload.durationTicks - reload.progressTicks) * DT_MS) : 0,
      reloadTotalMs: reload ? Math.round(reload.durationTicks * DT_MS) : 0,
      reloading: Boolean(reload),
      reloadAttempted: reload ? reload.attempted : false,
      ...(reload
        ? {
            sweetSpot: [
              Math.round(reload.sweetMinU * 100),
              Math.round(reload.sweetMaxU * 100),
            ] as [number, number],
          }
        : {}),
      gadget: toBansungGadgetState(p.gadgetSlot),
      heroId: p.heroId,
      skillCdMs: Math.round(p.skillCdMs),
      perkChoices: p.perkChoices,
      perks: p.perks,
      reviveSpeedMul: p.reviveSpeedMul,
      droneTethered: p.droneTethered,
      revives: p.stats.revives,
      stats: { revives: p.stats.revives },
      brain: p.brain,
      pet: p.pet,
    };
  }

  private refreshBotWorldViews(): void {
    this.enemies = [];
    for (const m of this.mobMgr.mobs) {
      if (!m.alive || m.hp <= 0) continue;
      const moveSpd = m.actualSpeed > 1 ? m.actualSpeed : 0;
      this.enemies.push({
        id: m.numId,
        kind: m.kind,
        role: m.role,
        isBoss: false,
        x: m.x,
        y: m.y,
        vx: Math.cos(m.aimAngle) * moveSpd + m.knockVx,
        vy: Math.sin(m.aimAngle) * moveSpd + m.knockVy,
        radius: m.radius,
        hp: m.hp,
        maxHp: m.maxHp,
        alive: true,
        state: m.state,
        fusing: m.state === 'fuse',
        armorType: m.armorType,
        flatArmor: m.flatArmor,
        tier: m.elite ? 'elite' : 'mob',
        shield: m.shield,
        maxShield: m.maxShield,
        kbResist: m.kbResist,
      });
    }
    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_beholder' && !entry.boss.isDead()) {
        const s = entry.boss.state;
        this.enemies.push({
          id: entry.numId,
          kind: 'boss_beholder',
          isBoss: true,
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          radius: BANSUNG_ENEMIES.boss_beholder.radius,
          hp: s.hp,
          maxHp: s.maxHp,
          alive: true,
          tier: 'boss',
        });
      } else if (entry.kind === 'boss_colossus' && entry.boss.alive) {
        const b = entry.boss;
        this.enemies.push({
          id: b.id,
          kind: 'boss_colossus',
          isBoss: true,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          radius: b.radius,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: true,
          tier: 'boss',
        });
      } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
        const b = entry.boss;
        this.enemies.push({
          id: b.id,
          kind: 'boss_overlord',
          isBoss: true,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          radius: b.radius,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: true,
          tier: 'boss',
        });
      } else if (
        (entry.kind === 'boss_arsenal' ||
          entry.kind === 'boss_tempest' ||
          entry.kind === 'boss_destroyer' ||
          entry.kind === 'boss_frost_empress' ||
          entry.kind === 'boss_abyssal_leviathan') &&
        entry.boss.alive
      ) {
        const b = entry.boss;
        this.enemies.push({
          id: b.id,
          kind: entry.kind,
          isBoss: true,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          radius: b.radius,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: true,
          tier: 'boss',
        });
      }
    }
    for (const entry of this.activeBosses) {
      const bPos = this.getBossPosAndAim(entry);
      if (!bPos || !bPos.alive) continue;
      for (const part of entry.partGroup.parts) {
        if (part.broken || !part.combatTarget.alive || part.combatTarget.hp <= 0 || !part.combatTarget.numId) {
          continue;
        }
        this.enemies.push({
          id: part.combatTarget.numId,
          kind: entry.kind,
          isBoss: true,
          isBossPart: true,
          x: part.x,
          y: part.y,
          vx: 0,
          vy: 0,
          radius: part.radius,
          hp: part.hp,
          maxHp: part.maxHp,
          alive: true,
          tier: 'boss',
        });
      }
    }

    this.bullets = [];
    this.projectiles = [];
    for (const b of this.bulletPool.active) {
      if (!b.alive) continue;
      const pv: BotProjectileView = {
        id: b.id,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
        radius: b.radius,
        fromEnemy: b.isFromEnemy,
        team: b.team,
        alive: true,
      };
      this.bullets.push(pv);
      this.projectiles.push(pv);
    }
    for (const mp of this.mobMgr.projectiles) {
      this.projectiles.push({
        id: mp.id,
        x: mp.x,
        y: mp.y,
        vx: mp.vx,
        vy: mp.vy,
        radius: mp.radius,
        fromEnemy: true,
        team: 1,
        alive: true,
      });
    }
    for (const bp of this.bossProjectiles) {
      this.projectiles.push({
        id: bp.id,
        x: bp.x,
        y: bp.y,
        vx: bp.vx,
        vy: bp.vy,
        radius: bp.radius,
        fromEnemy: true,
        team: 1,
        alive: true,
      });
    }

    this.telegraphs = this.viewTelegraphs();
    this.pickups = this.pickupMgr.pickups.map((pk) => ({
      id: pk.id,
      kind: pk.kind,
      x: pk.x,
      y: pk.y,
      vx: pk.vx,
      vy: pk.vy,
      amount: pk.stack,
      weaponId: pk.weaponId,
      alive: true,
      spawnLockTicks: pk.spawnLockTicks,
    }));
  }

  private rebuildStaticAndPropViews(): void {
    // Keep internal props/pickup sync flags evaluated cleanly
  }

  // ============================================================================
  // 8. 64px Culling Cache & Quantized Network Frame Serialization (`frameFor`)
  // ============================================================================

  private rebuildCullingCache(): void {
    this.enemyBuckets.clear();
    this.bulletBuckets.clear();

    for (let i = 0; i < this.mobMgr.mobs.length; i++) {
      const mob = this.mobMgr.mobs[i];
      if (!mob.alive || mob.hp <= 0) continue;
      this.enemyBuckets.insert({
        x: mob.x,
        y: mob.y,
        tuple: toEnemyTuple(mob),
      });
    }

    for (const entry of this.activeBosses) {
      if (entry.kind === 'boss_beholder' && !entry.boss.isDead()) {
        this.enemyBuckets.insert({
          x: entry.boss.state.x,
          y: entry.boss.state.y,
          tuple: entry.boss.toEnemyTuple(),
        });
      } else if (entry.kind === 'boss_colossus' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const frame = toColossusBossFrame(b);
        const flags =
          (b.facingLeft ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.drones.length > 0 ? BANSUNG_EFLAG_SHIELDED : 0) |
          (b.state === COLOSSUS_STATE.OVERHEAT_STUN ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_colossus,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            frame.aimQ,
            frame.state,
            flags,
          ],
        });
        for (const d of b.drones) {
          if (!d.alive || d.hp <= 0) continue;
          const dPct = d.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((d.hp / d.maxHp) * 100))) : 0;
          this.enemyBuckets.insert({
            x: d.x,
            y: d.y,
            tuple: [
              d.id,
              BANSUNG_ENEMY_INDEX.iron_drone,
              Math.round(d.x),
              Math.round(d.y),
              dPct,
              quantizeAim(d.orbitAngle),
              BANSUNG_STATE_RUN,
              BANSUNG_EFLAG_SHIELDED | BANSUNG_EFLAG_ARMORED,
            ],
          });
        }
      } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const flags =
          (b.facingLeft ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.state === 'breach_stun' ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_overlord,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimAngle),
            mapOverlordToUnitState(b),
            flags,
          ],
        });
      } else if (entry.kind === 'boss_arsenal' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const unitState = toArsenalBossFrame(b).state;
        const flags =
          (Math.cos(b.aimRad) < 0 ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          ((b.stunTicks ?? 0) > 0 ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_arsenal,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimRad),
            unitState,
            flags,
          ],
        });
      } else if (entry.kind === 'boss_tempest' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const unitState = toTempestBossFrame(b, Boolean(entry.miniBoss)).state;
        const flags =
          (Math.cos(b.aimRad) < 0 ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.stunTicks > 0 ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_tempest,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimRad),
            unitState,
            flags,
          ],
        });
      } else if (entry.kind === 'boss_destroyer' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const unitState = toDestroyerBossFrame(b, Boolean(entry.miniBoss)).state;
        const flags =
          (Math.cos(b.aimRad) < 0 ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.stunTicks > 0 ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_destroyer,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimRad),
            unitState,
            flags,
          ],
        });
      } else if (entry.kind === 'boss_frost_empress' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const unitState = toFrostEmpressBossFrame(b, Boolean(entry.miniBoss)).state;
        const flags =
          (Math.cos(b.aimRad) < 0 ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.stunTicks > 0 ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_frost_empress,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimRad),
            unitState,
            flags,
          ],
        });
      } else if (entry.kind === 'boss_abyssal_leviathan' && entry.boss.alive) {
        const b = entry.boss;
        const hpPct = b.maxHp > 0 ? Math.max(1, Math.min(100, Math.round((b.hp / b.maxHp) * 100))) : 0;
        const unitState = toLeviathanBossFrame(b, Boolean(entry.miniBoss)).state;
        const flags =
          (Math.cos(b.aimRad) < 0 ? BANSUNG_EFLAG_LEFT : 0) |
          BANSUNG_EFLAG_ARMORED |
          (b.stunTicks > 0 ? BANSUNG_EFLAG_STUNNED : 0);
        this.enemyBuckets.insert({
          x: b.x,
          y: b.y,
          tuple: [
            b.id,
            BANSUNG_ENEMY_INDEX.boss_abyssal_leviathan,
            Math.round(b.x),
            Math.round(b.y),
            hpPct,
            quantizeAim(b.aimRad),
            unitState,
            flags,
          ],
        });
      }
    }

    for (const gate of this.director.portalGates) {
      if (!gate.alive || gate.hp <= 0) continue;
      const hpPct = Math.max(1, Math.min(100, Math.round((gate.hp / Math.max(1, gate.maxHp)) * 100)));
      this.enemyBuckets.insert({
        x: gate.x,
        y: gate.y,
        tuple: [
          PORTAL_GATE_SPATIAL_BASE + gate.id,
          BANSUNG_ENEMY_INDEX.scarab,
          Math.round(gate.x),
          Math.round(gate.y),
          hpPct,
          0,
          BANSUNG_STATE_IDLE,
          BANSUNG_EFLAG_ARMORED | BANSUNG_EFLAG_SHIELDED,
        ],
      });
    }

    // Populate projectile culling buckets from bullet pool, mobs, gadgets, bosses
    const poolPacked: number[] = [];
    this.bulletPool.packBullets(poolPacked, undefined, 256);
    for (let i = 0; i + 5 < poolPacked.length; i += 6) {
      this.bulletBuckets.insert({
        id: poolPacked[i],
        kindId: poolPacked[i + 1],
        x: poolPacked[i + 2],
        y: poolPacked[i + 3],
        aimQ: poolPacked[i + 4],
        flags: poolPacked[i + 5],
      });
    }

    for (const mp of this.mobMgr.projectiles) {
      this.bulletBuckets.insert({
        id: 500_000 + mp.id,
        kindId: resolveEnemyProjKindId(mp.kind),
        x: Math.round(mp.x),
        y: Math.round(mp.y),
        aimQ: quantizeAim(Math.atan2(mp.vy, mp.vx)),
        flags: BANSUNG_BFLAG_FROM_ENEMY,
      });
    }

    for (const bp of this.bossProjectiles) {
      this.bulletBuckets.insert({
        id: bp.id,
        kindId: bp.kindId,
        x: Math.round(bp.x),
        y: Math.round(bp.y),
        aimQ: quantizeAim(Math.atan2(bp.vy, bp.vx)),
        flags: BANSUNG_BFLAG_FROM_ENEMY | (bp.armored ? BANSUNG_BFLAG_EXPLOSIVE : 0),
      });
    }

    const gadgetBullets: number[] = [];
    packGadgetBullets(this.gadgetState, gadgetBullets);
    for (let i = 0; i + 5 < gadgetBullets.length; i += 6) {
      this.bulletBuckets.insert({
        id: gadgetBullets[i],
        kindId: gadgetBullets[i + 1],
        x: gadgetBullets[i + 2],
        y: gadgetBullets[i + 3],
        aimQ: gadgetBullets[i + 4],
        flags: gadgetBullets[i + 5],
      });
    }
  }

  private packAllPlayers(): number[] {
    const out = new Array<number>(this.players.length * BANSUNG_PLAYER_FIELDS);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const off = i * BANSUNG_PLAYER_FIELDS;
      let state: BansungUnitState = BANSUNG_STATE_IDLE;
      if (p.life === 'dead') state = BANSUNG_STATE_DEAD;
      else if (p.downed) state = BANSUNG_STATE_DOWNED;
      else if ((p.stunMs ?? 0) > 0) state = BANSUNG_STATE_STUN;
      else if (isDashing(p.dash)) state = BANSUNG_STATE_DASH;
      else if (p.weaponState.activeSwing || p.fireHeld) state = BANSUNG_STATE_ATK;
      else if (Math.hypot(p.vx, p.vy) > 4) state = BANSUNG_STATE_RUN;

      let flags = getHeroDashFlags(p.dash) | getHeroPlayerFlags(p.weaponState);
      if (p.aimCos < 0) flags |= BANSUNG_PFLAG_LEFT;
      if ((p.hitFlashMs ?? 0) > 0) flags |= BANSUNG_PFLAG_HIT_FLASH;
      if (p.invulnTimer > 0 || p.gachaGraceMs > 0) flags |= BANSUNG_PFLAG_INVULN;
      if (p.bot) flags |= BANSUNG_PFLAG_BOT;
      if (p.left) flags |= BANSUNG_PFLAG_DISCONNECTED;

      const curWeaponId =
        p.weaponState.slots[p.weaponState.activeSlot]?.weaponId ??
        p.slots[p.slotIdx]?.id ??
        p.sidearmWeapon;
      const revivePct = p.downed ? clamp(Math.round((p.reviveProg ?? 0) * 100), 0, 100) : 0;

      out[off] = p.idx;
      out[off + 1] = Math.round(p.x);
      out[off + 2] = Math.round(p.y);
      out[off + 3] = quantizeAim(p.aimRad);
      out[off + 4] = Math.max(0, Math.round(p.hp));
      out[off + 5] = Math.max(0, Math.round(p.shield));
      out[off + 6] = state;
      out[off + 7] = flags;
      out[off + 8] = BANSUNG_HERO_INDEX[p.heroId];
      out[off + 9] = BANSUNG_WEAPON_INDEX[curWeaponId];
      out[off + 10] = revivePct;
      out[off + 11] = getHeroActiveWeaponTier(p.weaponState);
    }
    return out;
  }

  private buildBossFrames(): BansungBossFrame[] {
    const out: BansungBossFrame[] = [];
    for (const entry of this.activeBosses) {
      let frame: BansungBossFrame | null = null;
      if (entry.kind === 'boss_beholder' && !entry.boss.isDead()) {
        frame = entry.boss.toBossFrame();
      } else if (entry.kind === 'boss_colossus' && entry.boss.alive) {
        frame = toColossusBossFrame(entry.boss);
      } else if (entry.kind === 'boss_overlord' && entry.boss.alive) {
        const base = toOverlordBossFrame(entry.boss);
        const view = toOverlordView(entry.boss);
        frame = {
          ...base,
          weakPoints: view.weakPoints,
          wp: view.weakPoints,
          pylons: view.pylons,
          laserLanes: view.laserLanes,
          lanes: view.laserLanes,
        };
      } else if (entry.kind === 'boss_arsenal' && entry.boss.alive) {
        frame = toArsenalBossFrame(entry.boss);
      } else if (entry.kind === 'boss_tempest' && entry.boss.alive) {
        frame = toTempestBossFrame(entry.boss, Boolean(entry.miniBoss));
      } else if (entry.kind === 'boss_destroyer' && entry.boss.alive) {
        frame = toDestroyerBossFrame(entry.boss, Boolean(entry.miniBoss));
      } else if (entry.kind === 'boss_frost_empress' && entry.boss.alive) {
        frame = toFrostEmpressBossFrame(entry.boss, Boolean(entry.miniBoss));
      } else if (entry.kind === 'boss_abyssal_leviathan' && entry.boss.alive) {
        frame = toLeviathanBossFrame(entry.boss, Boolean(entry.miniBoss));
      }
      if (!frame) continue;
      frame.hpBars = frame.hpBars ?? getBossHpBars(entry.kind, Boolean(entry.miniBoss));
      const partViews = toBossPartViews(entry.partGroup);
      if (partViews && partViews.length > 0) {
        frame.parts = partViews;
      }
      if (entry.partGroup.unlockedSkills.length > 0) {
        frame.unlockedSkills = [...entry.partGroup.unlockedSkills];
      }
      if (entry.scale !== undefined && entry.scale !== 1) {
        frame.scale = Number(entry.scale.toFixed(2));
      }
      if (entry.splitTier !== undefined && entry.splitTier > 0) {
        frame.splitTier = entry.splitTier;
      }
      if (entry.splitTier === 2) {
        frame.subtitle = 'BOSS KHỔNG LỒ PHÂN THÂN · CHẾT ĐẺ ×4 → ×16';
      } else if (entry.splitTier === 1) {
        frame.subtitle = 'MINI-BOSS PHÂN THÂN · CHẾT ĐẺ ×4 TIỂU BOSS';
      } else if (entry.miniBoss) {
        frame.subtitle = 'TIỂU BOSS HỘ VỆ';
      }
      out.push(frame);
    }
    return out;
  }

  private buildPrivateFor(p: BansungRuntimePlayer, isInitial = true): BansungPrivate {
    const reload = p.weaponState.reload;
    const rawSlots = buildWeaponSlotsSnapshot(p.weaponState);
    const weaponTiers = p.weaponState.slots.map((s) => (s ? s.tier : 1));
    const hasUpgradedWeapon = weaponTiers.some((t) => t > 1);
    const slots = (
      isInitial || hasUpgradedWeapon
        ? rawSlots
        : rawSlots.map((s) => {
            if (!s) return null;
            const { evolvedName: _omit, ...rest } = s;
            return rest;
          })
    ) as unknown as BansungWeaponSlot[];
    const hasSkillStacks = Object.keys(p.skillStacks).length > 0;
    return {
      maxHp: Math.round(p.maxHp),
      maxShield: Math.round(p.maxShield),
      energy: Math.round(p.energy),
      maxEnergy: Math.round(p.maxEnergy),
      slots,
      slotIdx: p.weaponState.activeSlot,
      gadget: toBansungGadgetState(p.gadgetSlot),
      dashCdMs: Math.round(p.dash.cdLeft * 1000),
      dashMaxMs: getBansungHero(p.heroId).dash.cooldownMs,
      skillCdMs: Math.round(p.skillCdMs),
      skillMaxMs: Math.round(p.skillMaxMs),
      ...(p.skillActiveMs > 0 ? { skillActiveMs: Math.round(p.skillActiveMs) } : {}),
      ...(isInitial ? { skillName: getBansungHero(p.heroId).activeSkill.vnName } : {}),
      reloadMs: reload ? Math.round((reload.durationTicks - reload.progressTicks) * DT_MS) : 0,
      reloadTotalMs: reload ? Math.round(reload.durationTicks * DT_MS) : 0,
      ...(reload
        ? {
            sweetSpot: [
              Math.round(reload.sweetMinU * 100),
              Math.round(reload.sweetMaxU * 100),
            ] as [number, number],
          }
        : {}),
      ...(p.perkChoices && p.perkChoices.length > 0 ? { perkChoices: [...p.perkChoices] } : {}),
      perks: [...p.perks],
      kills: p.stats.kills,
      damage: Math.round(p.stats.damageDealt),
      stuns: p.stats.stunsInflicted,
      revives: p.stats.revives,
      coins: Math.round(p.coins),
      ...(isInitial || p.xp > 0 ? { xp: Math.round(p.xp) } : {}),
      ...(isInitial || p.level > 1
        ? {
            level: p.level,
            xpToNext: Math.max(1, Math.round(p.xpToNext)),
          }
        : {}),
      ...(p.gachaChoices && p.gachaChoices.length > 0
        ? {
            gachaChoices: [...p.gachaChoices],
            gachaRemMs: Math.max(0, Math.round(p.gachaRemMs)),
          }
        : {}),
      ...(p.gachaPending > 0 ? { gachaPending: p.gachaPending } : {}),
      ...(hasSkillStacks ? { skillStacks: { ...p.skillStacks } } : {}),
      ...(isInitial || hasUpgradedWeapon ? { weaponTiers } : {}),
      stamina: Math.round(p.stamina ?? BANSUNG_STAMINA.BASE_MAX),
      ...(isInitial || Math.round(p.maxStamina ?? BANSUNG_STAMINA.BASE_MAX) !== BANSUNG_STAMINA.BASE_MAX
        ? { maxStamina: Math.round(p.maxStamina ?? BANSUNG_STAMINA.BASE_MAX) }
        : {}),
      ...(isInitial || (p.gachaDashCostReduce ?? 0) > 0
        ? {
            dashCost: Math.round(
              Math.max(12, BANSUNG_STAMINA.DASH_COST - (p.gachaDashCostReduce ?? 0)),
            ),
          }
        : {}),
      ...(isInitial || Math.round((p.shieldDamageReduction ?? 0.25) * 100) !== 25
        ? {
            shieldDrPct: Math.round(
              Math.min(70, Math.round((p.shieldDamageReduction ?? 0.25) * 100)),
            ),
          }
        : {}),
      ...((p.shieldDelayMs ?? 0) > 0
        ? { shieldDelayMs: Math.max(0, Math.round(p.shieldDelayMs ?? 0)) }
        : {}),
      ...(isInitial ||
      Math.round(p.regenDelayMs ?? BANSUNG_SHIELD.REGEN_DELAY_MS) !==
        BANSUNG_SHIELD.REGEN_DELAY_MS
        ? {
            shieldRegenTotalMs: Math.round(
              Math.max(2000, p.regenDelayMs ?? BANSUNG_SHIELD.REGEN_DELAY_MS),
            ),
          }
        : {}),
      lastAckSeq: p.guard.lastAckSeq,
    };
  }

  frameFor(viewerId?: string, forceFull = false): BansungFrame {
    const viewer = viewerId ? this.playerById.get(viewerId) : undefined;
    const isInitial = Boolean(forceFull || (viewerId !== undefined && !this.viewerInitialized.has(viewerId)));
    if (viewerId !== undefined) {
      this.viewerInitialized.add(viewerId);
    }

    let cx = this.W * 0.5;
    let cy = this.H * 0.5;
    if (viewer) {
      if (viewer.life === 'dead') {
        const specTarget = this.players[viewer.specTargetIdx];
        const fallback = this.players.find((p) => !p.left && p.life === 'alive');
        const focus = specTarget && !specTarget.left && specTarget.life !== 'dead' ? specTarget : fallback ?? viewer;
        cx = focus.x;
        cy = focus.y;
      } else {
        cx = viewer.x;
        cy = viewer.y;
      }
    } else {
      const alive = this.players.find((p) => !p.left && p.life === 'alive');
      if (alive) {
        cx = alive.x;
        cy = alive.y;
      }
    }

    const x0 = cx - VIEWPORT_HALF_W;
    const x1 = cx + VIEWPORT_HALF_W;
    const y0 = cy - VIEWPORT_HALF_H;
    const y1 = cy + VIEWPORT_HALF_H;

    this.enemyBuckets.queryRect(x0, y0, x1, y1, this.tmpEnemyBucketOut);
    if (this.tmpEnemyBucketOut.length > FRAME_ENEMY_CAP) {
      this.tmpEnemyBucketOut.sort((a, b) => {
        const ka = a.tuple[1];
        const kb = b.tuple[1];
        const aBoss =
          ka === BANSUNG_ENEMY_INDEX.boss_beholder ||
          ka === BANSUNG_ENEMY_INDEX.boss_colossus ||
          ka === BANSUNG_ENEMY_INDEX.boss_overlord ||
          ka === BANSUNG_ENEMY_INDEX.boss_arsenal ||
          ka === BANSUNG_ENEMY_INDEX.boss_tempest ||
          ka === BANSUNG_ENEMY_INDEX.boss_destroyer ||
          ka === BANSUNG_ENEMY_INDEX.boss_frost_empress ||
          ka === BANSUNG_ENEMY_INDEX.boss_abyssal_leviathan
            ? 1
            : 0;
        const bBoss =
          kb === BANSUNG_ENEMY_INDEX.boss_beholder ||
          kb === BANSUNG_ENEMY_INDEX.boss_colossus ||
          kb === BANSUNG_ENEMY_INDEX.boss_overlord ||
          kb === BANSUNG_ENEMY_INDEX.boss_arsenal ||
          kb === BANSUNG_ENEMY_INDEX.boss_tempest ||
          kb === BANSUNG_ENEMY_INDEX.boss_destroyer ||
          kb === BANSUNG_ENEMY_INDEX.boss_frost_empress ||
          kb === BANSUNG_ENEMY_INDEX.boss_abyssal_leviathan
            ? 1
            : 0;
        if (aBoss !== bBoss) return bBoss - aBoss;
        const da = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
        const db = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
        return da - db;
      });
    }
    const e: number[] = [];
    const eCap = Math.min(this.tmpEnemyBucketOut.length, FRAME_ENEMY_CAP);
    for (let i = 0; i < eCap; i++) {
      const t = this.tmpEnemyBucketOut[i].tuple;
      e.push(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7]);
    }

    this.bulletBuckets.queryRect(x0, y0, x1, y1, this.tmpBulletBucketOut);
    if (this.tmpBulletBucketOut.length > FRAME_BULLET_CAP) {
      this.tmpBulletBucketOut.sort((a, b) => {
        const aEnemy = (a.flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0 ? 1 : 0;
        const bEnemy = (b.flags & BANSUNG_BFLAG_FROM_ENEMY) !== 0 ? 1 : 0;
        if (aEnemy !== bEnemy) return bEnemy - aEnemy;
        const da = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
        const db = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
        return da - db;
      });
    }
    const b: number[] = [];
    const bCap = Math.min(this.tmpBulletBucketOut.length, FRAME_BULLET_CAP);
    for (let i = 0; i < bCap; i++) {
      const q = this.tmpBulletBucketOut[i];
      b.push(q.id, q.kindId, q.x, q.y, q.aimQ, q.flags);
    }

    const hasGadgetProps = this.gadgetState.deployables.some((d) => d.hp > 0 && d.lifeTicks > 0);
    const prChanged =
      isInitial || this.arena.propsDirty || hasGadgetProps || this.hadGadgetPropsLastTick;
    let pr: number[] | undefined;
    if (prChanged) {
      pr = packBreakableProps(this.arena, [], false);
      packGadgetProps(this.gadgetState, pr);
    }

    const pk = this.pickupMgr.packPickupsIfChanged(isInitial, undefined, false);
    const fxMax = FRAME_FX_CAP * 6;
    let fx: number[] | undefined;
    if (this.fx.length > 0) {
      const filteredFx: number[] = [];
      const pad = 120;
      const fx0 = x0 - pad;
      const fx1 = x1 + pad;
      const fy0 = y0 - pad;
      const fy1 = y1 + pad;
      for (let i = 0; i + 5 < this.fx.length; i += 6) {
        const kind = this.fx[i];
        let keep = true;
        if (kind === FX_DMG) {
          const px = this.fx[i + 1];
          const py = this.fx[i + 2];
          keep = px >= fx0 && px <= fx1 && py >= fy0 && py <= fy1;
        } else if (kind === FX_BLAST) {
          const px = this.fx[i + 2];
          const py = this.fx[i + 3];
          const r = Math.max(0, this.fx[i + 4]) + 40;
          keep = px + r >= fx0 && px - r <= fx1 && py + r >= fy0 && py - r <= fy1;
        } else if (kind === FX_IMPACT || kind === FX_DEATH) {
          const px = this.fx[i + 2];
          const py = this.fx[i + 3];
          keep = px >= fx0 && px <= fx1 && py >= fy0 && py <= fy1;
        } else if (kind === FX_BEAM) {
          const bx0 = Math.min(this.fx[i + 1], this.fx[i + 3]);
          const bx1 = Math.max(this.fx[i + 1], this.fx[i + 3]);
          const by0 = Math.min(this.fx[i + 2], this.fx[i + 4]);
          const by1 = Math.max(this.fx[i + 2], this.fx[i + 4]);
          keep = bx1 >= fx0 && bx0 <= fx1 && by1 >= fy0 && by0 <= fy1;
        }
        if (keep) {
          filteredFx.push(
            this.fx[i],
            this.fx[i + 1],
            this.fx[i + 2],
            this.fx[i + 3],
            this.fx[i + 4],
            this.fx[i + 5],
          );
          if (filteredFx.length >= fxMax) break;
        }
      }
      if (filteredFx.length > 0) {
        fx = filteredFx;
      }
    }

    const bossFrames = this.buildBossFrames();
    const bs = bossFrames[0];
    const bs2 = bossFrames.length > 1 ? bossFrames.slice(1) : undefined;

    const pets: BansungPetFrame[] = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.left || p.bot || !p.hasPet || !p.petAlive) continue;
      if (
        p.pet.x >= x0 - 160 &&
        p.pet.x <= x1 + 160 &&
        p.pet.y >= y0 - 160 &&
        p.pet.y <= y1 + 160
      ) {
        pets.push({
          ownerId: p.idx,
          kind: p.pet.kind,
          tuple: serializePetTuple(p.pet),
        });
      }
    }

    const hz: BansungHazardWire[] = [];
    const allHazards = this.viewHazards();
    for (let i = 0; i < allHazards.length; i++) {
      const h = allHazards[i];
      const pad = Math.max(40, h.r) + 80;
      if (h.x + pad >= x0 && h.x - pad <= x1 && h.y + pad >= y0 && h.y - pad <= y1) {
        hz.push({
          id: h.id,
          kind: h.kind,
          x: h.x,
          y: h.y,
          r: h.r,
          ...(h.ttlTicks !== undefined ? { ttlTicks: h.ttlTicks } : {}),
        });
      }
    }

    const tg: BansungTelegraphWire[] = [];
    const allTelegraphs = this.viewTelegraphs();
    for (let i = 0; i < allTelegraphs.length; i++) {
      const t = allTelegraphs[i];
      const pad = Math.max(t.r, t.halfW ?? 0) + 80;
      const inView =
        t.kind === 1
          ? t.x1 + pad >= x0 && t.x1 - pad <= x1 && t.y1 + pad >= y0 && t.y1 - pad <= y1
          : Math.max(t.x0, t.x1) >= x0 - pad &&
            Math.min(t.x0, t.x1) <= x1 + pad &&
            Math.max(t.y0, t.y1) >= y0 - pad &&
            Math.min(t.y0, t.y1) <= y1 + pad;
      if (inView) {
        tg.push(t);
      }
    }

    const wp = this.director.getNetPhase(Boolean(this.pickupMgr.perkDraft?.active));
    const isSurvival = resolveBansungGameMode(this.config) === 'survival';
    let srv: ReturnType<typeof this.director.getSurvivalClock> | undefined;
    if (isSurvival) {
      const clock = this.director.getSurvivalClock();
      const stageKey = `${clock.cycle}:${clock.stageIdx}:${clock.stageId}`;
      const viewerKey = viewerId ?? '__public__';
      const prevStageKey = this.viewerSrvStageKey.get(viewerKey);
      if (isInitial || prevStageKey !== stageKey || this.tickNo % BANSUNG_TICK_HZ === 0) {
        srv = clock;
        this.viewerSrvStageKey.set(viewerKey, stageKey);
      }
    }

    const frame: BansungFrame = {
      t: this.tickNo,
      ms: Math.round(this.elapsedMs),
      w: this.director.wave,
      wp,
      rem: this.director.getNetRemaining(),
      p: this.packAllPlayers(),
      ...(e.length > 0 ? { e } : {}),
      ...(b.length > 0 ? { b } : {}),
      ...(pr !== undefined ? { pr } : {}),
      ...(pk !== undefined ? { pk } : {}),
      ...(fx !== undefined ? { fx } : {}),
      ...(bs !== undefined ? { bs } : {}),
      ...(bs2 !== undefined ? { bs2 } : {}),
      ...(pets.length > 0 ? { pets } : {}),
      ...(hz.length > 0 ? { hz } : {}),
      ...(tg.length > 0 ? { tg } : {}),
      ...(srv !== undefined ? { srv } : {}),
      ...(viewer ? { me: this.buildPrivateFor(viewer, isInitial) } : {}),
      ...(isInitial ? { full: true } : {}),
    };
    return frame;
  }
}
