/**
 * Authoritative 10-wave co-op director & Endless Mutator FSM at 30Hz for `bansung`
 * (specs d06, d07, d32, d40, d45, d46).
 *
 * Manages:
 * - Warmup (`5s`) & intermission (`6s` / `9s` boss prep) with `3.0s` perimeter portal telegraphs
 * - Co-op `N = 1..4` & difficulty budget / HP / damage scaling and strict `<= 52` active mob cap
 * - W1-3 swarm pacing, W4 Biome Mini-Boss (`0.48x` HP) + trickle adds
 * - W5-7 sieges (`portal_rush` destructible gates, `supply_beacon` hold zone, `artillery_siege` mortars)
 * - W8-9 elite squads (`armored`, `swift`, `volatile` death-nova) + mid-wave gate
 * - W10 Biome Boss + phase adds, Victory or Endless `W11+` 5-wave loop + modular mutator registry
 * - Cleanup anti-stall straggler enrage (`>= 12s`, `<= 3` mobs -> minimap reveal + `+25%` speed)
 * - Wave-clear rewards, Perk Draft trigger, crate/prop checkpoint respawn, and co-op revive hooks
 */
import {
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_BOSS_BY_BIOME,
  BANSUNG_BOSS_INTERMISSION_S,
  BANSUNG_DIFFICULTY_SCALE,
  BANSUNG_ENDLESS_BOSS_ROTATION,
  BANSUNG_ENDLESS_MUTATORS,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_GATES,
  BANSUNG_FX_BLAST_BOSS_MORTAR,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_INTERMISSION_S,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_STATUS_REVIVED,
  BANSUNG_STRAGGLER_ENRAGE_S,
  BANSUNG_SURVIVAL_CYCLE_S,
  BANSUNG_SURVIVAL_STAGES,
  BANSUNG_SURVIVAL_STAGE_S,
  BANSUNG_TICK_HZ,
  BANSUNG_TOTAL_WAVES,
  BANSUNG_WARMUP_S,
  BANSUNG_WAVES,
  ENDLESS_MUTATOR_REGISTRY,
  FX_BLAST,
  FX_STATUS,
  computeActiveMobCap,
  computeBossHpMult,
  computeMobDmgMult,
  computeMobHpMult,
  computeWaveBudget,
  computeWaveMaxMobs,
  getBansungWaveSpec,
  getBossIdForBiome,
  getSurvivalScheduleState,
  registerEndlessMutator,
  type ArenaEnemyGate,
  type BansungArmorType,
  type BansungBiome,
  type BansungBossEncounterMode,
  type BansungDifficulty,
  type BansungDifficultyKey,
  type BansungDirectorPhase,
  type BansungEliteAffix,
  type BansungEndlessScaler,
  type BansungEnemyId,
  type BansungGameMode,
  type BansungReviveMode,
  type BansungSiegeKind,
  type BansungSurvivalClock,
  type BansungSurvivalScheduleState,
  type BansungSurvivalStageId,
  type BansungSurvivalStageSpec,
  type BansungWaveHud,
  type BansungWavePhase,
  type BansungWeaponId,
  type EndlessWaveMutator,
  type WaveRosterEntry,
  type WaveSpec,
} from '../../../../shared/src';
import {
  clampPointToPlayable,
  isPointBlocked,
  respawnWaveProps,
  type ServerArena,
  type WaveRespawnResult,
} from './map';
import { ObstacleGrid, resolveObstacles, type CircleBody } from './spatial';

export {
  BANSUNG_BOSS_INTERMISSION_S,
  BANSUNG_ENDLESS_BOSS_ROTATION,
  BANSUNG_ENDLESS_MUTATORS,
  BANSUNG_INTERMISSION_S,
  BANSUNG_STRAGGLER_ENRAGE_S,
  BANSUNG_SURVIVAL_CYCLE_S,
  BANSUNG_SURVIVAL_STAGES,
  BANSUNG_SURVIVAL_STAGE_S,
  BANSUNG_TOTAL_WAVES,
  BANSUNG_WARMUP_S,
  BANSUNG_WAVES,
  ENDLESS_MUTATOR_REGISTRY,
  computeActiveMobCap,
  computeBossHpMult,
  computeMobDmgMult,
  computeMobHpMult,
  computeWaveBudget,
  computeWaveMaxMobs,
  getBansungWaveSpec,
  getSurvivalScheduleState,
  registerEndlessMutator,
};

export type {
  BansungDirectorPhase,
  BansungEliteAffix,
  BansungGameMode,
  BansungSiegeKind,
  BansungSurvivalClock,
  BansungSurvivalScheduleState,
  BansungSurvivalStageId,
  BansungSurvivalStageSpec,
  BansungWaveHud,
  EndlessWaveMutator,
  WaveSpec,
};

// ============================================================================
// 1. Director Constants & Tunables (d40)
// ============================================================================

export const DIRECTOR_DT = 1 / BANSUNG_TICK_HZ;
export const DIRECTOR_MOB_HARD_CAP = 52;
export const SPAWN_TELEGRAPH_LEAD_S = 3.0;
export const SPAWN_TELEGRAPH_RADIUS_PX = 48;
export const PORTAL_SAFE_PLAYER_DIST_PX = 360;
export const SQUAD_PORTALS_MIN = 2;
export const SQUAD_PORTALS_MAX = 4;
export const SQUAD_SIZE_MIN = 3;
export const SQUAD_SIZE_MAX = 6;
export const MAX_SPAWNS_PER_TICK = 6;
export const STRAGGLER_MAX_MOBS = 3;
export const STRAGGLER_ENRAGE_SPEED_MULT = 1.25;
export const ELITE_COST_MULT = 2.0;
export const ELITE_HP_MULT = 1.65;
export const ELITE_SCALE_MULT = 1.2;
export const MINI_BOSS_DEFAULT_HP_MULT = 0.48;
export const BOSS_WAVE_INITIAL_ADD_DELAY_S = 2.5;
export const GATE_SPAWN_INSET_PX = 72;
export const ARTILLERY_DEFAULT_RADIUS_PX = 76;
export const ARTILLERY_BASE_DAMAGE = 28;
export const BEACON_COMPLETION_STUN_RADIUS_PX = 2400;
export const BEACON_COMPLETION_STUN_MS = 2500;
export const WAVE_CLEAR_INVULN_S = 2.0;
export const BANSUNG_SURVIVAL_WARMUP_S = 3.0;
export const SURVIVAL_PROP_RESPAWN_INTERVAL_S = 45;
export const SURVIVAL_EVOLVED_SCALE_MULT = 1.16;
export const SURVIVAL_ELITE_AFFIXES: readonly BansungEliteAffix[] = ['armored', 'swift', 'volatile'];

export interface EliteAffixConfig {
  readonly armorAdd: number;
  readonly forceArmorType?: BansungArmorType;
  readonly speedMult: number;
  readonly cooldownMult: number;
  readonly deathNovaRadius?: number;
  readonly deathNovaBaseDmg?: number;
}

export const ELITE_AFFIX_CONFIG: Readonly<Record<BansungEliteAffix, EliteAffixConfig>> = {
  armored: {
    armorAdd: 2,
    forceArmorType: 'armored',
    speedMult: 1.0,
    cooldownMult: 1.0,
  },
  swift: {
    armorAdd: 0,
    speedMult: 1.22,
    cooldownMult: 0.85,
  },
  volatile: {
    armorAdd: 0,
    speedMult: 1.05,
    cooldownMult: 1.0,
    deathNovaRadius: 84,
    deathNovaBaseDmg: 22,
  },
} as const;

export const WAVE_CLEAR_REVIVE_HP_PCT: Readonly<Record<BansungReviveMode, number>> = {
  coop: 0.5,
  circle: 0.5,
  wave_only: 1.0,
  hardcore: 0,
} as const;

const TIMER_EPS = 1e-6;
const BUILTIN_MUTATOR_IDS = new Set<string>(Object.keys(BANSUNG_ENDLESS_MUTATORS));

// ============================================================================
// 2. Public Interfaces & Hook Contracts
// ============================================================================

/** Minimal player/bot shape consumed by `WaveDirector` and wave-clear revive hooks. */
export interface DirectorPlayerRef {
  id?: string;
  idx?: number;
  x: number;
  y: number;
  alive: boolean;
  downed: boolean;
  life?: 'alive' | 'downed' | 'dead';
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
  armor?: number;
  maxArmor?: number;
  energy?: number;
  maxEnergy?: number;
  downCountWave?: number;
  reviveProg?: number;
  rescuersCount?: number;
  bleedLeft?: number;
  invulnTimer?: number;
  hitIframesMs?: number;
  bot?: boolean;
  left?: boolean;
}

/** Optional live enemy reference passed during cleanup to apply straggler enrage in-place. */
export interface DirectorEnemyRef {
  id?: number | string;
  alive: boolean;
  isBoss?: boolean;
  x?: number;
  y?: number;
  speed?: number;
  moveSpeed?: number;
  revealed?: boolean;
  enraged?: boolean;
  enrageSpeedMult?: number;
}

export interface DirectorPortalGate {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  spawnIntervalS: number;
  spawnTimer: number;
  spawnCount: number;
}

export interface DirectorSpawnTelegraph {
  gateIdx: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  radius: number;
}

export interface DirectorMobSpawn {
  kind: BansungEnemyId;
  x: number;
  y: number;
  elite?: BansungEliteAffix;
  /** True during 15-20m Evolved Horde (`BANSUNG_EFLAG_EVOLVED`). */
  evolved?: boolean;
  /** Wave/Time scaled mob level (1 at W1/0m, 2 at W2/2m, 3 at W4/4m, ...). */
  mobLevel?: number;
  hpMult: number;
  dmgMult: number;
  speedMult: number;
  scaleMult: number;
  armorAdd: number;
  armorType?: BansungArmorType;
  deathNova?: { radius: number; damage: number };
  gateIdx?: number;
  fromPortalGateId?: number;
}

export interface DirectorBossSpawn {
  id: BansungEnemyId;
  kinds?: readonly BansungEnemyId[];
  label?: string;
  mini: boolean;
  hpMult: number;
  x: number;
  y: number;
  count: number;
  positions?: readonly { x: number; y: number }[];
  scale?: number;
  splitTier?: number;
  dmgMult?: number;
  mode?: BansungBossEncounterMode;
}

export interface DirectorArtilleryTarget {
  id: number;
  x: number;
  y: number;
  radius: number;
  fuseS: number;
  timeLeftS: number;
  damage: number;
}

export interface DirectorArtilleryDetonation {
  id: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
}

export interface DirectorBeaconStatus {
  active: boolean;
  completed: boolean;
  x: number;
  y: number;
  radius: number;
  holdElapsedS: number;
  holdTargetS: number;
  progressPct: number;
  playersInside: number;
}

export interface DirectorStragglerEnrageEvent {
  active: boolean;
  speedMult: number;
  revealOnMinimap: boolean;
  mobCount: number;
}

export interface DirectorWaveStartEvent {
  wave: number;
  arc: string;
  budget: number;
  activeMobCap: number;
  mobHpMult: number;
  mobDmgMult: number;
  bossHpMult: number;
  mutators: string[];
  propRespawn?: WaveRespawnResult;
}

export interface DirectorWaveClearReviveResult {
  revivedIds: string[];
  reviveHpPct: number;
  healedPulseIds: string[];
  energyRefilledIds: string[];
  restockedIds: string[];
}

export interface DirectorWaveClearEvent {
  wave: number;
  openPerkDraft: boolean;
  spawnPedestal: boolean;
  crates: number;
  healPulse: boolean;
  bonusCoins: number;
  energyRefill: boolean;
  fullRestock: boolean;
  revivedPlayerIds: string[];
  reviveHpPct: number;
  propRespawn?: WaveRespawnResult;
}

export interface DirectorPedestalDrop {
  x: number;
  y: number;
  waveHint: number;
  bossId?: BansungEnemyId;
  cycle: number;
  allowedWeapons?: readonly BansungWeaponId[];
}

export interface DirectorSurvivalStageChangeEvent {
  cycle: number;
  stageIdx: 0 | 1 | 2 | 3;
  stageId: BansungSurvivalStageId;
  name: string;
  vnName: string;
}

export interface DirectorTickContext {
  dt?: number;
  activeMobs: number;
  bossAlive: boolean;
  /** Optional boss world position for survival boss-kill pedestal drops. */
  bossPos?: { x: number; y: number };
  /** Optional explicit boss kill count this tick (useful when multiple bosses overlap). */
  bossKills?: number;
  /** Optional override; if omitted, internal siege state (portal gates / beacon) controls gating. */
  siegeActive?: boolean;
  players: readonly DirectorPlayerRef[];
  biome: BansungBiome;
  endlessEnabled: boolean;
  difficulty?: BansungDifficulty | BansungDifficultyKey;
  arena?: ServerArena;
  obsGrid?: ObstacleGrid;
  enemyGates?: readonly ArenaEnemyGate[];
  activeMobRefs?: readonly DirectorEnemyRef[];
  bossId?: string;
  perkDraftPending?: boolean;
  endlessScaler?: BansungEndlessScaler;
  reviveMode?: BansungReviveMode;
  autoApplyWaveClearRevive?: boolean;
  autoRespawnProps?: boolean;
  rng?: () => number;
  fxOut?: number[];
}

export interface DirectorStepOutput {
  spawns: DirectorMobSpawn[];
  spawnBoss?: DirectorBossSpawn;
  spawnTelegraphs?: DirectorSpawnTelegraph[];
  siegeStart?: BansungSiegeKind;
  secondarySiegeStart?: BansungSiegeKind;
  portalGateSpawns?: DirectorPortalGate[];
  beaconStatus?: DirectorBeaconStatus;
  beaconCompleted?: { x: number; y: number; stunRadius: number; stunMs: number };
  artilleryTarget?: DirectorArtilleryTarget;
  artilleryDetonations?: DirectorArtilleryDetonation[];
  stragglerEnrage?: DirectorStragglerEnrageEvent;
  waveStart?: DirectorWaveStartEvent;
  waveClear?: DirectorWaveClearEvent;
  /** Survival mode: periodic (~45s) crate/barrel replenishment result. */
  propRespawn?: WaveRespawnResult;
  /** Survival mode: weapon pedestal drops spawned on boss defeat. */
  pedestalDrops?: DirectorPedestalDrop[];
  /** Survival mode: quantized 20-min repeating survival clock. */
  survivalClock?: BansungSurvivalClock;
  /** Survival mode: emitted when entering a new 5-minute stage or 20-minute cycle. */
  survivalStageChange?: DirectorSurvivalStageChangeEvent;
  finished?: 'victory' | 'defeat';
}

export interface WaveDirectorOptions {
  /** Defaults to `'waves'` when omitted to preserve existing 10-wave consumers/tests. */
  gameMode?: BansungGameMode;
  difficulty?: BansungDifficulty | BansungDifficultyKey;
  reviveMode?: BansungReviveMode;
  endlessEnabled?: boolean;
  seed?: number;
  rng?: () => number;
  pinnedMutators?: readonly string[];
  onWaveStart?: (event: DirectorWaveStartEvent, director: WaveDirector) => void;
  onWaveClear?: (event: DirectorWaveClearEvent, director: WaveDirector) => void;
  onReviveWaveClear?: (
    result: DirectorWaveClearReviveResult,
    wave: number,
    director: WaveDirector,
  ) => void;
  onFinished?: (outcome: 'victory' | 'defeat', director: WaveDirector) => void;
}

// ============================================================================
// 3. Internal Helpers & Scratch Buffers
// ============================================================================

const tmpBody: CircleBody = { x: 0, y: 0, radius: 16 };
const tmpGateScores: { idx: number; gate: ArenaEnemyGate; score: number }[] = [];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getPlayableBounds(arena?: ServerArena) {
  return arena ? arena.playable : BANSUNG_PLAYABLE_BOUNDS;
}

function getArenaDims(arena?: ServerArena, obsGrid?: ObstacleGrid): { w: number; h: number } {
  if (arena) return { w: arena.w, h: arena.h };
  if (obsGrid) return { w: obsGrid.mapW, h: obsGrid.mapH };
  return { w: BANSUNG_MAP_W, h: BANSUNG_MAP_H };
}

function clampToPlayable(
  x: number,
  y: number,
  pad: number,
  arena?: ServerArena,
): { x: number; y: number } {
  if (arena) {
    const [cx, cy] = clampPointToPlayable(arena, x, y, pad);
    return { x: cx, y: cy };
  }
  const b = BANSUNG_PLAYABLE_BOUNDS;
  const minX = b.x0 + pad;
  const maxX = b.x1 - pad;
  const minY = b.y0 + pad;
  const maxY = b.y1 - pad;
  return {
    x: minX <= maxX ? clamp(x, minX, maxX) : (minX + maxX) * 0.5,
    y: minY <= maxY ? clamp(y, minY, maxY) : (minY + maxY) * 0.5,
  };
}

function resolveSpawnClear(
  x: number,
  y: number,
  radius: number,
  arena?: ServerArena,
  obsGrid?: ObstacleGrid,
): { x: number; y: number } {
  const pad = Math.max(4, radius + 2);
  let pt = clampToPlayable(x, y, pad, arena);
  const grid = obsGrid ?? arena?.obsGrid;
  if (grid) {
    const dims = getArenaDims(arena, grid);
    tmpBody.x = pt.x;
    tmpBody.y = pt.y;
    tmpBody.radius = radius;
    resolveObstacles(tmpBody, grid, dims.w, dims.h, 0);
    pt = clampToPlayable(tmpBody.x, tmpBody.y, pad, arena);
  }
  return pt;
}

function cloneWaveSpec(spec: WaveSpec): WaveSpec {
  return {
    ...spec,
    roster: spec.roster.map((r) => ({ ...r })),
    eliteAffixes: [...spec.eliteAffixes],
    siegeConfig: spec.siegeConfig ? { ...spec.siegeConfig } : undefined,
    miniBoss: spec.miniBoss
      ? {
          ...spec.miniBoss,
          addKinds: [...spec.miniBoss.addKinds],
          bossByBiome: { ...spec.miniBoss.bossByBiome },
        }
      : undefined,
    boss: spec.boss
      ? {
          ...spec.boss,
          bossByBiome: { ...spec.boss.bossByBiome },
          addKinds: [...spec.boss.addKinds],
        }
      : undefined,
    reward: { ...spec.reward },
    mutators: spec.mutators ? [...spec.mutators] : undefined,
  };
}

function getStandingAnchor(players: readonly DirectorPlayerRef[]): [number, number] {
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (isStandingPlayer(p)) return [p.x, p.y];
  }
  return [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
}

// ============================================================================
// 4. Shared Pure Helpers (Player Checks, Portal Selection, Wave Revive)
// ============================================================================

/** Returns `true` when `p` is active in the match and neither downed nor dead (`d07`/`d40`). */
export function isStandingPlayer(p: DirectorPlayerRef): boolean {
  if (p.left) return false;
  if (p.life !== undefined) return p.life === 'alive';
  return Boolean(p.alive) && !p.downed;
}

/** Computes co-op scaling count `N = clamp(activePlayers + bots, 1, 4)` (`d40`). */
export function countCoopScalePlayers(players: readonly DirectorPlayerRef[]): number {
  let active = 0;
  for (let i = 0; i < players.length; i++) {
    if (!players[i].left) active++;
  }
  return clamp(active, 1, 4);
}

/** Maps internal `WaveDirector` phase to quantized network `BansungFrame.wp` (`types.ts`). */
export function toNetWavePhase(
  phase: BansungDirectorPhase,
  spec?: WaveSpec | null,
  perkDraftActive = false,
): BansungWavePhase {
  if (perkDraftActive) return 'perk_pick';
  if (phase === 'warmup' || phase === 'intermission') return 'intermission';
  if (spec && (spec.boss || spec.miniBoss)) return 'boss';
  return 'combat';
}

/**
 * Applies wave-clear ally respawn, downed counter reset, optional Wave-4 heal pulse,
 * Wave-6 energy refill, and Wave-9 full restock (`d07`, `d40`).
 */
export function applyWaveClearRevives(
  players: readonly DirectorPlayerRef[],
  reviveMode: BansungReviveMode = 'coop',
  respawnPos?: readonly [number, number],
  fxOut?: number[],
  opts?: { healPulse?: boolean; energyRefill?: boolean; fullRestock?: boolean },
): DirectorWaveClearReviveResult {
  const reviveHpPct = WAVE_CLEAR_REVIVE_HP_PCT[reviveMode] ?? 0.5;
  const anchor = respawnPos ?? getStandingAnchor(players);
  const revivedIds: string[] = [];
  const healedPulseIds: string[] = [];
  const energyRefilledIds: string[] = [];
  const restockedIds: string[] = [];

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.left) continue;
    p.downCountWave = 0;

    const wasStanding = isStandingPlayer(p);
    if (!wasStanding) {
      if (reviveHpPct <= 0) continue;
      p.life = 'alive';
      p.downed = false;
      p.alive = true;
      p.reviveProg = 0;
      p.rescuersCount = 0;
      p.bleedLeft = undefined;
      p.invulnTimer = WAVE_CLEAR_INVULN_S;
      p.hitIframesMs = WAVE_CLEAR_INVULN_S * 1000;
      p.x = anchor[0] + ((i % 2 === 0 ? -1 : 1) * (18 + i * 6));
      p.y = anchor[1] + (i >= 2 ? 22 : -8);

      if (p.maxHp !== undefined) {
        p.hp = Math.max(1, Math.ceil(p.maxHp * reviveHpPct));
      } else if (p.hp !== undefined) {
        p.hp = Math.max(1, p.hp);
      }
      const maxSh = p.maxShield ?? p.maxArmor;
      if (maxSh !== undefined) {
        if (p.shield !== undefined) p.shield = maxSh;
        if (p.armor !== undefined) p.armor = maxSh;
      }
      if (p.maxEnergy !== undefined && p.energy !== undefined) {
        p.energy = Math.max(p.energy, Math.ceil(p.maxEnergy * 0.5));
      }

      const label = p.id ?? String(p.idx ?? i);
      revivedIds.push(label);
      if (fxOut && p.idx !== undefined) {
        fxOut.push(
          FX_STATUS,
          p.idx,
          BANSUNG_STATUS_REVIVED,
          Math.round(reviveHpPct * 100),
          Math.round(p.x),
          Math.round(p.y),
        );
      }
      continue;
    }

    const pid = p.id ?? String(p.idx ?? i);

    if (opts?.fullRestock) {
      if (p.maxHp !== undefined && p.hp !== undefined) {
        p.hp = p.maxHp;
      }
      const maxSh = p.maxShield ?? p.maxArmor;
      if (maxSh !== undefined) {
        if (p.shield !== undefined) p.shield = maxSh;
        if (p.armor !== undefined) p.armor = maxSh;
      }
      if (p.maxEnergy !== undefined && p.energy !== undefined) {
        p.energy = p.maxEnergy;
      }
      restockedIds.push(pid);
    } else {
      if (opts?.healPulse && p.maxHp !== undefined && p.hp !== undefined) {
        const healAmt = Math.max(1, Math.ceil(p.maxHp * 0.35));
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        healedPulseIds.push(pid);
      }
      if (opts?.energyRefill && p.maxEnergy !== undefined && p.energy !== undefined) {
        p.energy = Math.min(p.maxEnergy, Math.max(p.energy, Math.ceil(p.maxEnergy * 0.75)));
        energyRefilledIds.push(pid);
      }
    }
  }

  return {
    revivedIds,
    reviveHpPct,
    healedPulseIds,
    energyRefilledIds,
    restockedIds,
  };
}

/**
 * Scores perimeter portals preferring `dist >= 360px` from the nearest standing player
 * and unobstructed spawn space (`d40`).
 */
export function pickSpawnPortals(
  gates: readonly ArenaEnemyGate[],
  players: readonly DirectorPlayerRef[],
  count: number,
  arena?: ServerArena,
  obsGrid?: ObstacleGrid,
  rng: () => number = Math.random,
): ArenaEnemyGate[] {
  if (gates.length === 0 || count <= 0) return [];
  tmpGateScores.length = 0;

  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    const probeX = g.x + g.nx * 36;
    const probeY = g.y + g.ny * 36;

    let minPlayerDist = Infinity;
    for (let j = 0; j < players.length; j++) {
      const p = players[j];
      if (!isStandingPlayer(p)) continue;
      const d = Math.hypot(probeX - p.x, probeY - p.y);
      if (d < minPlayerDist) minPlayerDist = d;
    }

    const safe = minPlayerDist >= PORTAL_SAFE_PLAYER_DIST_PX;
    let score = safe ? 1000 + Math.min(minPlayerDist, 1200) * 0.25 : minPlayerDist;

    if (arena && isPointBlocked(arena, probeX, probeY, 16, 'move')) {
      score -= 200;
    } else if (!arena && obsGrid) {
      const dims = getArenaDims(undefined, obsGrid);
      tmpBody.x = probeX;
      tmpBody.y = probeY;
      tmpBody.radius = 16;
      const beforeX = tmpBody.x;
      const beforeY = tmpBody.y;
      resolveObstacles(tmpBody, obsGrid, dims.w, dims.h, 0);
      if (Math.hypot(tmpBody.x - beforeX, tmpBody.y - beforeY) > 24) {
        score -= 200;
      }
    }

    score += rng() * 140;
    tmpGateScores.push({ idx: i, gate: g, score });
  }

  tmpGateScores.sort((a, b) => b.score - a.score);
  const picked: ArenaEnemyGate[] = [];
  const take = Math.min(count, tmpGateScores.length);
  for (let i = 0; i < take; i++) {
    picked.push(tmpGateScores[i].gate);
  }
  return picked;
}

/**
 * Computes a collision-free world spawn coordinate slightly inside `gate`,
 * spread tangentially so Miragine squads never stack on one pixel.
 */
export function resolveMobSpawnPoint(
  gate: ArenaEnemyGate,
  radius: number,
  arena?: ServerArena,
  obsGrid?: ObstacleGrid,
  rng: () => number = Math.random,
): { x: number; y: number } {
  const tx = -gate.ny;
  const ty = gate.nx;
  const inward = 28 + rng() * 28;
  const lateral = (rng() * 2 - 1) * 34;
  const rawX = gate.x + gate.nx * inward + tx * lateral;
  const rawY = gate.y + gate.ny * inward + ty * lateral;
  return resolveSpawnClear(rawX, rawY, radius, arena, obsGrid);
}

// ============================================================================
// 5. WaveDirector 30Hz Authoritative State Machine (d40)
// ============================================================================

export class WaveDirector {
  wave = 0;
  phase: BansungDirectorPhase = 'warmup';
  phaseTimer: number = BANSUNG_WARMUP_S;
  gameMode: BansungGameMode = 'waves';
  survivalElapsedMs = 0;
  survivalCycle = 0;
  survivalStageIdx: 0 | 1 | 2 | 3 = 0;
  survivalStageId: BansungSurvivalStageId = 'swarm_light';
  survivalBossKills = 0;

  budget = 0;
  totalBudget = 0;
  activeMobCap = computeWaveMaxMobs(1);
  burstTimer = 0;
  cleanupTimer = 0;
  stragglerEnraged = false;

  activeSpec: WaveSpec | null = null;
  activeMutators: EndlessWaveMutator[] = [];
  portalGates: DirectorPortalGate[] = [];
  spawnTelegraphs: DirectorSpawnTelegraph[] = [];
  artilleryStrikes: DirectorArtilleryTarget[] = [];
  beaconState: DirectorBeaconStatus = {
    active: false,
    completed: false,
    x: BANSUNG_ARENA_CX,
    y: BANSUNG_ARENA_CY,
    radius: 150,
    holdElapsedS: 0,
    holdTargetS: 20,
    progressPct: 0,
    playersInside: 0,
  };

  finished: 'victory' | 'defeat' | null = null;
  wavesCleared = 0;

  private difficulty: BansungDifficulty | BansungDifficultyKey;
  private reviveMode: BansungReviveMode;
  private endlessConfigEnabled: boolean;
  private pinnedMutators: string[];
  private internalRng: () => number;

  private onWaveStart?: WaveDirectorOptions['onWaveStart'];
  private onWaveClear?: WaveDirectorOptions['onWaveClear'];
  private onReviveWaveClear?: WaveDirectorOptions['onReviveWaveClear'];
  private onFinished?: WaveDirectorOptions['onFinished'];

  private lastActiveMobs = 0;
  private lastCoopN = 1;
  private lastBossAlive = false;
  private lastBossId: string | undefined;
  private mobHpMult = 1;
  private mobDmgMult = 1;
  private bossHpMult = 1;
  private avgRosterCost = 2;

  private telegraphEmittedForWave = 0;
  private bossWasAliveThisWave = false;
  private stragglerEnrageEmitted = false;
  private midWaveGateTriggered = false;
  private artilleryActive = false;
  private artilleryTimer = 0;
  private artilleryIntervalS = 4.5;
  private artilleryFuseS = 1.4;
  private nextGateId = 1;
  private nextArtilleryId = 1;
  private readonly enragedMobIds = new Set<number | string>();

  private survivalPropTimer = 0;
  private survivalLastBossSlotKey = '';
  private survivalStageAnnounced = false;
  private survivalPedestalDropCursor = 0;
  private survivalWaveSpawned = 0;
  private survivalWaveQuota = computeWaveMaxMobs(1);
  private waveMobQuota = 0;
  private waveMobSpawned = 0;

  constructor(opts: WaveDirectorOptions = {}) {
    this.gameMode = opts.gameMode ?? 'waves';
    this.difficulty = opts.difficulty ?? 'normal';
    this.reviveMode = opts.reviveMode ?? 'coop';
    this.endlessConfigEnabled = Boolean(opts.endlessEnabled);
    this.pinnedMutators = opts.pinnedMutators ? [...opts.pinnedMutators] : [];
    this.internalRng = opts.rng ?? (opts.seed !== undefined ? createMulberry32(opts.seed) : Math.random);
    this.phaseTimer =
      this.gameMode === 'survival' ? BANSUNG_SURVIVAL_WARMUP_S : BANSUNG_WARMUP_S;
    this.onWaveStart = opts.onWaveStart;
    this.onWaveClear = opts.onWaveClear;
    this.onReviveWaveClear = opts.onReviveWaveClear;
    this.onFinished = opts.onFinished;
  }

  /** Resets the director back to initial warmup state (`5s` waves or `3s` survival). */
  reset(opts?: Partial<WaveDirectorOptions>): void {
    if (opts?.gameMode !== undefined) this.gameMode = opts.gameMode;
    if (opts?.difficulty !== undefined) this.difficulty = opts.difficulty;
    if (opts?.reviveMode !== undefined) this.reviveMode = opts.reviveMode;
    if (opts?.endlessEnabled !== undefined) this.endlessConfigEnabled = opts.endlessEnabled;
    if (opts?.pinnedMutators !== undefined) this.pinnedMutators = [...opts.pinnedMutators];
    if (opts?.rng !== undefined) {
      this.internalRng = opts.rng;
    } else if (opts?.seed !== undefined) {
      this.internalRng = createMulberry32(opts.seed);
    }

    this.wave = 0;
    this.phase = 'warmup';
    this.phaseTimer =
      this.gameMode === 'survival' ? BANSUNG_SURVIVAL_WARMUP_S : BANSUNG_WARMUP_S;
    this.survivalElapsedMs = 0;
    this.survivalCycle = 0;
    this.survivalStageIdx = 0;
    this.survivalStageId = 'swarm_light';
    this.survivalBossKills = 0;
    this.survivalPropTimer = 0;
    this.survivalLastBossSlotKey = '';
    this.survivalStageAnnounced = false;
    this.survivalPedestalDropCursor = 0;
    this.survivalWaveSpawned = 0;
    this.survivalWaveQuota = computeWaveMaxMobs(1);
    this.waveMobQuota = 0;
    this.waveMobSpawned = 0;
    this.lastCoopN = 1;
    this.budget = 0;
    this.totalBudget = 0;
    this.activeMobCap = computeWaveMaxMobs(1);
    this.burstTimer = 0;
    this.cleanupTimer = 0;
    this.stragglerEnraged = false;
    this.activeSpec = null;
    this.activeMutators = [];
    this.portalGates = [];
    this.spawnTelegraphs = [];
    this.artilleryStrikes = [];
    this.beaconState = {
      active: false,
      completed: false,
      x: BANSUNG_ARENA_CX,
      y: BANSUNG_ARENA_CY,
      radius: 150,
      holdElapsedS: 0,
      holdTargetS: 20,
      progressPct: 0,
      playersInside: 0,
    };
    this.finished = null;
    this.wavesCleared = 0;
    this.lastActiveMobs = 0;
    this.lastBossAlive = false;
    this.lastBossId = undefined;
    this.telegraphEmittedForWave = 0;
    this.bossWasAliveThisWave = false;
    this.stragglerEnrageEmitted = false;
    this.midWaveGateTriggered = false;
    this.artilleryActive = false;
    this.artilleryTimer = 0;
    this.nextGateId = 1;
    this.nextArtilleryId = 1;
    this.enragedMobIds.clear();
  }

  /** Unlocks Wave 11+ Endless progression after Wave 10 victory vote (`d40`). */
  unlockEndless(): boolean {
    this.endlessConfigEnabled = true;
    if (this.phase === 'victory') {
      this.finished = null;
      this.phase = 'intermission';
      this.phaseTimer = BANSUNG_BOSS_INTERMISSION_S;
      return true;
    }
    return false;
  }

  /** Fast-forwards director state to `wave` (intended for tests and QA scenarios). */
  skipToWave(wave: number, ctx?: Partial<DirectorTickContext>): void {
    const target = Math.max(1, Math.floor(wave));
    this.wave = target - 1;
    this.finished = null;
    this.phase = 'intermission';
    this.phaseTimer = 0;
    if (ctx) {
      const dummyOut: DirectorStepOutput = { spawns: [] };
      this.beginNextWave(
        {
          dt: DIRECTOR_DT,
          activeMobs: 0,
          bossAlive: false,
          players: ctx.players ?? [{ x: BANSUNG_ARENA_CX, y: BANSUNG_ARENA_CY, alive: true, downed: false }],
          biome: ctx.biome ?? 'desert',
          endlessEnabled: ctx.endlessEnabled ?? this.endlessConfigEnabled,
          ...ctx,
        },
        dummyOut,
        ctx.rng ?? this.internalRng,
      );
    }
  }

  /** Fast-forwards survival clock to `elapsedS` seconds (intended for tests and QA scenarios). */
  skipToSurvivalTime(elapsedS: number): void {
    this.gameMode = 'survival';
    this.finished = null;
    this.phase = 'spawning';
    this.phaseTimer = 0;
    this.survivalElapsedMs = Math.max(0, elapsedS * 1000);
    const sched = getSurvivalScheduleState(
      this.survivalElapsedMs,
      this.difficulty,
      this.lastCoopN,
    );
    this.survivalCycle = sched.cycle;
    this.survivalStageIdx = sched.stageIdx;
    this.survivalStageId = sched.stageId;
    this.survivalStageAnnounced = false;
    this.wave = Math.max(this.wave, sched.cycle * 4 + sched.stageIdx + 1);
    const waveMax = computeWaveMaxMobs(this.wave);
    this.survivalWaveSpawned = 0;
    this.survivalWaveQuota = waveMax;
    this.activeMobCap = waveMax;
    this.mobHpMult = sched.hpMult;
    this.mobDmgMult = sched.dmgMult;
    this.bossHpMult = sched.bossHpMult;
    this.burstTimer = 0;
    this.survivalLastBossSlotKey = '';
  }

  /** Returns the authoritative 20-minute repeating survival clock (`types.ts`). */
  getSurvivalClock(): BansungSurvivalClock {
    const schedule = getSurvivalScheduleState(
      this.survivalElapsedMs,
      this.difficulty,
      this.lastCoopN,
    );
    return {
      mode: this.gameMode,
      elapsedMs: Math.round(schedule.elapsedMs),
      cycle: schedule.cycle,
      cycleSec: schedule.cycleSec,
      stageIdx: schedule.stageIdx,
      stageId: schedule.stageId,
      stageRemS: this.gameMode === 'survival' ? schedule.stageRemS : 0,
    };
  }

  /** Advances the 30Hz wave/survival director FSM and emits spawns, sieges, telegraphs & hooks. */
  step(ctx: DirectorTickContext): DirectorStepOutput {
    const out: DirectorStepOutput = { spawns: [] };
    if (this.phase === 'victory' || this.phase === 'defeat') {
      return out;
    }

    const dt =
      ctx.dt !== undefined && Number.isFinite(ctx.dt) && ctx.dt > 0 ? ctx.dt : DIRECTOR_DT;
    const rng = ctx.rng ?? this.internalRng;
    const endlessEnabled = Boolean(ctx.endlessEnabled || this.endlessConfigEnabled);

    const prevBossAlive = this.lastBossAlive;
    const prevBossId = this.lastBossId as BansungEnemyId | undefined;

    this.lastCoopN = countCoopScalePlayers(ctx.players);
    this.lastActiveMobs = Math.max(0, Math.floor(ctx.activeMobs));
    this.lastBossAlive = Boolean(ctx.bossAlive);
    if (ctx.bossId) {
      this.lastBossId = ctx.bossId;
    } else if (!ctx.bossAlive) {
      this.lastBossId = undefined;
    }
    if (this.lastBossAlive) {
      this.bossWasAliveThisWave = true;
    }

    // 1. Team Wipe Check (d07 / d40): all active players downed or dead -> immediate defeat
    if (ctx.players.length > 0 && !this.hasAnyStandingPlayer(ctx.players)) {
      this.phase = 'defeat';
      this.phaseTimer = 0;
      this.finished = 'defeat';
      out.finished = 'defeat';
      if (this.gameMode === 'survival') {
        out.survivalClock = this.getSurvivalClock();
      }
      this.onFinished?.('defeat', this);
      return out;
    }

    if (this.gameMode === 'survival') {
      return this.stepSurvival(ctx, dt, out, rng, prevBossAlive, prevBossId);
    }

    // 2. Warmup / Intermission countdown + 3.0s portal spawn telegraphs
    if (this.phase === 'warmup' || this.phase === 'intermission') {
      this.phaseTimer = Math.max(0, this.phaseTimer - dt);
      const upcomingWave = this.wave + 1;

      if (
        this.phaseTimer <= SPAWN_TELEGRAPH_LEAD_S + TIMER_EPS &&
        this.telegraphEmittedForWave !== upcomingWave
      ) {
        this.emitWarmupTelegraphs(ctx, out, rng, upcomingWave);
      }

      if (this.phaseTimer <= TIMER_EPS && !ctx.perkDraftPending) {
        this.phaseTimer = 0;
        this.beginNextWave(ctx, out, rng);
      } else {
        return out;
      }
    }

    // 3. Endless Mutator per-tick hooks (W11+)
    if (this.wave > BANSUNG_TOTAL_WAVES && this.activeMutators.length > 0) {
      for (let i = 0; i < this.activeMutators.length; i++) {
        this.activeMutators[i].onTick?.(this, ctx);
      }
    }

    // 4. Active Sieges (portal_rush, supply_beacon, artillery_siege)
    this.stepSieges(ctx, dt, out, rng);

    // 5. Spawning Phase (Miragine squad cadence & 52-mob cap backpressure)
    if (this.phase === 'spawning') {
      this.stepSpawning(ctx, dt, out, rng);
    }

    // 6. Cleanup & Anti-Stall Straggler Enrage + Wave-Clear Hook
    if (this.phase === 'cleanup') {
      this.stepCleanup(ctx, dt, endlessEnabled, out);
    }

    return out;
  }

  /** Returns quantized HUD summary matching `BansungWaveHud` (`d40` / `d45`). */
  getHud(): BansungWaveHud {
    if (this.gameMode === 'survival') {
      const waveNum = Math.max(1, this.wave);
      const quotaRem =
        this.wave === 0
          ? 0
          : Math.max(0, this.survivalWaveQuota - this.survivalWaveSpawned);
      const phaseLeftMs =
        this.phase === 'warmup'
          ? Math.max(0, Math.round(this.phaseTimer * 1000))
          : 0;
      return {
        wave: waveNum,
        maxWave: 0,
        phase: this.phase,
        phaseLeftMs,
        mobsLeft: quotaRem + this.lastActiveMobs + (this.lastBossAlive ? 1 : 0),
        siege: 'none',
        siegeProg: 0,
        ...(this.lastBossAlive && this.lastBossId ? { bossId: this.lastBossId } : {}),
      };
    }

    const waveNum = Math.max(1, this.wave);
    const maxWave = this.wave > BANSUNG_TOTAL_WAVES ? 0 : BANSUNG_TOTAL_WAVES;
    let phaseLeftMs = 0;
    if (this.phase === 'warmup' || this.phase === 'intermission') {
      phaseLeftMs = Math.max(0, Math.round(this.phaseTimer * 1000));
    } else if (this.beaconState.active && !this.beaconState.completed) {
      phaseLeftMs = Math.max(
        0,
        Math.round((this.beaconState.holdTargetS - this.beaconState.holdElapsedS) * 1000),
      );
    }

    const budgetEq =
      this.budget > 0 ? Math.ceil(this.budget / Math.max(1, this.avgRosterCost)) : 0;
    const mobsLeft =
      this.wave === 0
        ? 0
        : budgetEq + this.lastActiveMobs + (this.lastBossAlive ? 1 : 0);

    const siege: BansungSiegeKind = this.activeSpec?.siege ?? 'none';
    return {
      wave: waveNum,
      maxWave,
      phase: this.phase,
      phaseLeftMs,
      mobsLeft,
      siege,
      siegeProg: this.getSiegeProgress(),
      ...(this.lastBossAlive && this.lastBossId ? { bossId: this.lastBossId } : {}),
    };
  }

  /** Maps director phase to quantized network `BansungFrame.wp`. */
  getNetPhase(perkDraftActive = false): BansungWavePhase {
    if (this.gameMode === 'survival') {
      if (perkDraftActive) return 'perk_pick';
      if (this.phase === 'warmup' || this.phase === 'intermission') return 'intermission';
      if (this.lastBossAlive) return 'boss';
      return 'combat';
    }
    return toNetWavePhase(this.phase, this.activeSpec, perkDraftActive);
  }

  /** Returns `BansungFrame.rem` (countdown seconds in prep, stage remaining in survival, else mobs left). */
  getNetRemaining(): number {
    if (this.phase === 'warmup' || this.phase === 'intermission') {
      return Math.max(0, Math.ceil(this.phaseTimer));
    }
    if (this.gameMode === 'survival') {
      return Math.max(0, Math.ceil(this.getSurvivalClock().stageRemS));
    }
    return this.getHud().mobsLeft;
  }

  /** Returns `0..100` siege progress for HUD (`portal HP %` / `beacon hold %` / `artillery %`). */
  getSiegeProgress(): number {
    if (this.portalGates.length > 0 && this.activeSpec?.siege === 'portal_rush') {
      let hp = 0;
      let maxHp = 0;
      for (let i = 0; i < this.portalGates.length; i++) {
        const g = this.portalGates[i];
        maxHp += g.maxHp;
        if (g.alive && g.hp > 0) hp += g.hp;
      }
      return maxHp > 0 ? clamp(Math.round((hp / maxHp) * 100), 0, 100) : 0;
    }
    if (this.beaconState.active) {
      return this.beaconState.progressPct;
    }
    if (this.artilleryActive && this.artilleryIntervalS > 0) {
      return clamp(Math.round((this.artilleryTimer / this.artilleryIntervalS) * 100), 0, 100);
    }
    return 0;
  }

  /** Returns `true` while internal `portal_rush` gates or incomplete `supply_beacon` block clear. */
  isSiegeBlockingClear(): boolean {
    for (let i = 0; i < this.portalGates.length; i++) {
      if (this.portalGates[i].alive && this.portalGates[i].hp > 0) return true;
    }
    if (this.beaconState.active && !this.beaconState.completed) {
      return true;
    }
    return false;
  }

  /** Applies damage to an internal `portal_rush` Summon Gate spawned by the director. */
  damagePortalGate(
    gateId: number,
    amount: number,
  ): { hit: boolean; destroyed: boolean; remainingHp: number } {
    for (let i = 0; i < this.portalGates.length; i++) {
      const g = this.portalGates[i];
      if (g.id !== gateId || !g.alive) continue;
      const dmg = Math.max(0, amount);
      g.hp = Math.max(0, g.hp - dmg);
      if (g.hp <= 0) {
        g.alive = false;
        return { hit: true, destroyed: true, remainingHp: 0 };
      }
      return { hit: true, destroyed: false, remainingHp: g.hp };
    }
    return { hit: false, destroyed: false, remainingHp: 0 };
  }

  getAlivePortalGates(): DirectorPortalGate[] {
    return this.portalGates.filter((g) => g.alive && g.hp > 0);
  }

  getMobSpeedMult(): number {
    let mul = 1;
    for (let i = 0; i < this.activeMutators.length; i++) {
      const m = this.activeMutators[i].mobSpeedMul;
      if (m && m > 0) mul *= m;
    }
    return mul;
  }

  getEnergyCostMult(): number {
    let mul = 1;
    for (let i = 0; i < this.activeMutators.length; i++) {
      const m = this.activeMutators[i].energyCostMul;
      if (m && m > 0) mul *= m;
    }
    return mul;
  }

  getCrateCountMult(): number {
    let mul = 1;
    for (let i = 0; i < this.activeMutators.length; i++) {
      const m = this.activeMutators[i].crateCountMul;
      if (m && m > 0) mul *= m;
    }
    return mul;
  }

  // --------------------------------------------------------------------------
  // Internal FSM Transitions & Tick Subsystems
  // --------------------------------------------------------------------------

  private hasAnyStandingPlayer(players: readonly DirectorPlayerRef[]): boolean {
    for (let i = 0; i < players.length; i++) {
      if (isStandingPlayer(players[i])) return true;
    }
    return false;
  }

  private resolveEndlessMutators(spec: WaveSpec): EndlessWaveMutator[] {
    if (spec.wave <= BANSUNG_TOTAL_WAVES) return [];
    const seen = new Set<string>();
    const list: EndlessWaveMutator[] = [];

    const addById = (id: string) => {
      if (seen.has(id)) return;
      const m = ENDLESS_MUTATOR_REGISTRY[id];
      if (!m) return;
      seen.add(id);
      list.push(m);
    };

    if (spec.mutators) {
      for (const id of spec.mutators) addById(id);
    }
    for (const id of this.pinnedMutators) addById(id);
    // Include custom extension mutators dynamically registered into ENDLESS_MUTATOR_REGISTRY
    for (const key of Object.keys(ENDLESS_MUTATOR_REGISTRY)) {
      if (!BUILTIN_MUTATOR_IDS.has(key)) addById(key);
    }
    return list;
  }

  private beginNextWave(
    ctx: DirectorTickContext,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    this.wave += 1;
    const rawSpec = getBansungWaveSpec(this.wave);
    const spec = cloneWaveSpec(rawSpec);

    const nPlayers = countCoopScalePlayers(ctx.players);
    const difficulty = ctx.difficulty ?? this.difficulty;
    const endlessTier =
      this.wave > BANSUNG_TOTAL_WAVES ? (spec.endlessCycle ?? 0) + 1 : 0;

    this.activeMutators = this.resolveEndlessMutators(spec);
    for (let i = 0; i < this.activeMutators.length; i++) {
      const mut = this.activeMutators[i];
      if (mut.eliteChanceAdd) {
        spec.eliteChance = clamp(spec.eliteChance + mut.eliteChanceAdd, 0, 1);
      }
      if (mut.id === 'elite_surge' && !spec.eliteAffixes.includes('volatile')) {
        spec.eliteAffixes = [...spec.eliteAffixes, 'volatile'];
      }
      mut.onWaveStart?.(this, spec);
    }

    const extScale =
      this.wave > BANSUNG_TOTAL_WAVES && ctx.endlessScaler
        ? ctx.endlessScaler(this.wave)
        : undefined;
    if (extScale && Number.isFinite(extScale.eliteChance)) {
      spec.eliteChance = clamp(extScale.eliteChance, 0, 1);
    }

    const isBossWave = Boolean(spec.miniBoss || spec.boss);
    this.activeSpec = spec;
    const countScale = extScale?.countMult && extScale.countMult > 0 ? extScale.countMult : 1;
    this.totalBudget = Math.max(
      1,
      Math.round(computeWaveBudget(this.wave, nPlayers, difficulty) * countScale),
    );
    this.budget = this.totalBudget;
    const waveMax = computeWaveMaxMobs(this.wave);
    this.activeMobCap = waveMax;
    this.waveMobSpawned = 0;
    this.waveMobQuota = !isBossWave ? waveMax : 0;

    this.mobHpMult =
      extScale?.hpMult && extScale.hpMult > 0
        ? extScale.hpMult
        : computeMobHpMult(this.wave, nPlayers, difficulty);
    this.mobDmgMult =
      extScale?.dmgMult && extScale.dmgMult > 0
        ? extScale.dmgMult
        : computeMobDmgMult(this.wave, difficulty);
    this.bossHpMult = computeBossHpMult(nPlayers, difficulty, endlessTier);

    this.avgRosterCost = this.computeAvgRosterCost(spec.roster);
    this.cleanupTimer = 0;
    this.stragglerEnraged = false;
    this.stragglerEnrageEmitted = false;
    this.enragedMobIds.clear();
    this.bossWasAliveThisWave = false;
    this.midWaveGateTriggered = false;
    this.spawnTelegraphs = [];
    this.portalGates = [];
    this.artilleryStrikes = [];
    this.artilleryActive = false;
    this.artilleryTimer = 0;
    this.beaconState = {
      active: false,
      completed: false,
      x: ctx.arena?.bossPad[0] ?? BANSUNG_ARENA_CX,
      y: ctx.arena?.bossPad[1] ?? BANSUNG_ARENA_CY,
      radius: spec.siegeConfig?.beaconRadius ?? 150,
      holdElapsedS: 0,
      holdTargetS: spec.siegeConfig?.beaconHoldS ?? 20,
      progressPct: 0,
      playersInside: 0,
    };

    this.burstTimer = isBossWave ? BOSS_WAVE_INITIAL_ADD_DELAY_S : 0;
    this.phase = 'spawning';

    // Spawn Mini-Boss (W4 / Endless Multi Vanguard) or Biome Boss (W10 / Endless Apex & Splitter Boss)
    if (spec.miniBoss) {
      const entry = spec.miniBoss.bossByBiome[ctx.biome] ?? spec.miniBoss.bossByBiome.desert;
      const isTwinVanguard =
        this.wave > BANSUNG_TOTAL_WAVES && (this.wave - 11) % 5 === 3;
      const count = Math.max(1, spec.miniBoss.count ?? (isTwinVanguard ? 2 : 1));
      const pad = ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
      const positions = this.buildBossRingPositions(pad[0], pad[1], count, 34, ctx);

      this.lastBossId = entry.id;
      out.spawnBoss = {
        id: entry.id,
        label: entry.label,
        mini: true,
        hpMult: this.bossHpMult * spec.miniBoss.hpMult,
        x: positions[0].x,
        y: positions[0].y,
        count,
        positions,
        ...(spec.miniBoss.scale !== undefined ? { scale: spec.miniBoss.scale } : {}),
        ...(spec.miniBoss.splitTier !== undefined ? { splitTier: spec.miniBoss.splitTier } : {}),
        ...(spec.miniBoss.bossMode !== undefined ? { mode: spec.miniBoss.bossMode } : {}),
      };
    } else if (spec.boss) {
      const bossId =
        spec.boss.bossByBiome[ctx.biome] ??
        BANSUNG_BOSS_BY_BIOME[ctx.biome] ??
        getBossIdForBiome(ctx.biome);
      const count = Math.max(1, spec.boss.count ?? 1);
      const pad = ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
      const bossRadius = BANSUNG_ENEMIES[bossId]?.radius ?? 36;
      const positions = this.buildBossRingPositions(pad[0], pad[1], count, bossRadius, ctx);

      this.lastBossId = bossId;
      out.spawnBoss = {
        id: bossId,
        ...(spec.boss.extraKinds ? { kinds: spec.boss.extraKinds } : {}),
        mini: false,
        hpMult: this.bossHpMult * (spec.boss.hpMult ?? 1),
        x: positions[0].x,
        y: positions[0].y,
        count,
        positions,
        ...(spec.boss.scale !== undefined ? { scale: spec.boss.scale } : {}),
        ...(spec.boss.splitTier !== undefined ? { splitTier: spec.boss.splitTier } : {}),
        ...(spec.boss.bossMode !== undefined ? { mode: spec.boss.bossMode } : {}),
      };
    }

    // Initialize immediate sieges (W5, W6, W7, Endless W13 Double Siege)
    this.activateSiege(spec.siege, spec, ctx, nPlayers, false, out, rng);
    if (spec.secondarySiege && spec.secondarySiege !== 'none' && spec.secondarySiege !== spec.siege) {
      this.activateSiege(spec.secondarySiege, spec, ctx, nPlayers, true, out, rng);
    }

    // Replenish destructible crates/barrels on checkpoint or odd waves when arena provided
    let propRespawn: WaveRespawnResult | undefined;
    if (ctx.arena && ctx.autoRespawnProps !== false) {
      const isCheckpoint = this.wave === 4 || this.wave === 7 || this.wave === 10;
      const isOddCrateWave = this.wave >= 3 && this.wave % 2 === 1;
      if (isCheckpoint || isOddCrateWave) {
        propRespawn = this.runPropRespawn(
          ctx,
          this.wave,
          { includeBarrels: isCheckpoint, force: !isCheckpoint },
          rng,
        );
      }
    }

    const waveStartEvent: DirectorWaveStartEvent = {
      wave: this.wave,
      arc: spec.arc,
      budget: this.totalBudget,
      activeMobCap: this.activeMobCap,
      mobHpMult: this.mobHpMult,
      mobDmgMult: this.mobDmgMult,
      bossHpMult: this.bossHpMult,
      mutators: this.activeMutators.map((m) => m.id),
      ...(propRespawn ? { propRespawn } : {}),
    };
    out.waveStart = waveStartEvent;
    this.onWaveStart?.(waveStartEvent, this);
  }

  private activateSiege(
    siege: BansungSiegeKind,
    spec: WaveSpec,
    ctx: DirectorTickContext,
    nPlayers: number,
    isSecondary: boolean,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    if (siege === 'none') return;
    const cfg = spec.siegeConfig ?? {};

    if (siege === 'portal_rush') {
      if (cfg.midWaveGateAtBudgetPct !== undefined) {
        // Wave 9 gate opens mid-wave at 50% remaining budget
        return;
      }
      this.spawnPortalGates(
        cfg.gateCount ?? 2,
        (cfg.gateBaseHp ?? 450) * nPlayers,
        cfg.gateSpawnIntervalS ?? 5,
        cfg.gateSpawnCount ?? 2,
        ctx,
        out,
        rng,
      );
      if (isSecondary) out.secondarySiegeStart = 'portal_rush';
      else out.siegeStart = 'portal_rush';
      return;
    }

    if (siege === 'supply_beacon') {
      const pad = ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
      this.beaconState = {
        active: true,
        completed: false,
        x: pad[0],
        y: pad[1],
        radius: cfg.beaconRadius ?? 150,
        holdElapsedS: 0,
        holdTargetS: cfg.beaconHoldS ?? 20,
        progressPct: 0,
        playersInside: 0,
      };
      out.beaconStatus = { ...this.beaconState };
      if (isSecondary) out.secondarySiegeStart = 'supply_beacon';
      else out.siegeStart = 'supply_beacon';
      return;
    }

    if (siege === 'artillery_siege') {
      this.artilleryActive = true;
      this.artilleryIntervalS = Math.max(1.2, cfg.artilleryIntervalS ?? 4.5);
      this.artilleryFuseS = Math.max(0.5, cfg.artilleryFuseS ?? 1.4);
      this.artilleryTimer = Math.min(1.8, this.artilleryIntervalS * 0.4);
      if (isSecondary) out.secondarySiegeStart = 'artillery_siege';
      else out.siegeStart = 'artillery_siege';
    }
  }

  private spawnPortalGates(
    gateCount: number,
    gateHp: number,
    spawnIntervalS: number,
    spawnCount: number,
    ctx: DirectorTickContext,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    const gates = ctx.enemyGates ?? ctx.arena?.enemyGates ?? BANSUNG_ENEMY_GATES;
    const picked = pickSpawnPortals(
      gates,
      ctx.players,
      Math.max(1, gateCount),
      ctx.arena,
      ctx.obsGrid,
      rng,
    );
    const spawned: DirectorPortalGate[] = [];
    for (let i = 0; i < picked.length; i++) {
      const g = picked[i];
      const pt = resolveSpawnClear(
        g.x + g.nx * GATE_SPAWN_INSET_PX,
        g.y + g.ny * GATE_SPAWN_INSET_PX,
        24,
        ctx.arena,
        ctx.obsGrid,
      );
      const gate: DirectorPortalGate = {
        id: this.nextGateId++,
        x: pt.x,
        y: pt.y,
        hp: Math.round(gateHp),
        maxHp: Math.round(gateHp),
        alive: true,
        spawnIntervalS,
        spawnTimer: spawnIntervalS * 0.5,
        spawnCount,
      };
      this.portalGates.push(gate);
      spawned.push(gate);
    }
    if (spawned.length > 0) {
      out.portalGateSpawns = spawned;
    }
  }

  private stepSieges(
    ctx: DirectorTickContext,
    dt: number,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    const spec = this.activeSpec;
    if (!spec) return;

    // If caller explicitly signals siegeActive === false, settle internal gates/beacon cleanly
    if (ctx.siegeActive === false) {
      for (let i = 0; i < this.portalGates.length; i++) {
        this.portalGates[i].alive = false;
        this.portalGates[i].hp = 0;
      }
      if (this.beaconState.active && !this.beaconState.completed) {
        this.beaconState.completed = true;
        this.beaconState.progressPct = 100;
      }
    }

    // 1. Portal Rush gates periodic spawns (respecting active mob cap & per-tick cap)
    for (let i = 0; i < this.portalGates.length; i++) {
      const gate = this.portalGates[i];
      if (!gate.alive || gate.hp <= 0) continue;
      gate.spawnTimer -= dt;
      if (gate.spawnTimer <= TIMER_EPS) {
        gate.spawnTimer = gate.spawnIntervalS;
        const capRemaining = this.activeMobCap - (ctx.activeMobs + out.spawns.length);
        const tickRemaining = MAX_SPAWNS_PER_TICK - out.spawns.length;
        const count = Math.min(gate.spawnCount, capRemaining, tickRemaining);
        for (let k = 0; k < count; k++) {
          const kind = this.pickWeightedMobKind(spec.roster, rng);
          const def = BANSUNG_ENEMIES[kind];
          const pos = resolveSpawnClear(
            gate.x + (rng() * 2 - 1) * 32,
            gate.y + (rng() * 2 - 1) * 32,
            def.radius,
            ctx.arena,
            ctx.obsGrid,
          );
          out.spawns.push(this.buildMobSpawn(kind, pos.x, pos.y, undefined, undefined, gate.id));
        }
      }
    }

    // 2. Supply Beacon hold zone (r = 150px, 20s total -> AoE stun shockwave)
    if (this.beaconState.active && !this.beaconState.completed) {
      const rSq = this.beaconState.radius * this.beaconState.radius;
      let inside = 0;
      for (let i = 0; i < ctx.players.length; i++) {
        const p = ctx.players[i];
        if (!isStandingPlayer(p)) continue;
        const dx = p.x - this.beaconState.x;
        const dy = p.y - this.beaconState.y;
        if (dx * dx + dy * dy <= rSq) {
          inside++;
        }
      }
      this.beaconState.playersInside = inside;
      if (inside > 0) {
        this.beaconState.holdElapsedS = Math.min(
          this.beaconState.holdTargetS,
          this.beaconState.holdElapsedS + dt,
        );
        this.beaconState.progressPct = clamp(
          Math.round((this.beaconState.holdElapsedS / this.beaconState.holdTargetS) * 100),
          0,
          100,
        );
        if (this.beaconState.holdElapsedS + TIMER_EPS >= this.beaconState.holdTargetS) {
          this.beaconState.completed = true;
          this.beaconState.progressPct = 100;
          out.beaconCompleted = {
            x: this.beaconState.x,
            y: this.beaconState.y,
            stunRadius: BEACON_COMPLETION_STUN_RADIUS_PX,
            stunMs: BEACON_COMPLETION_STUN_MS,
          };
          if (ctx.fxOut) {
            ctx.fxOut.push(
              FX_BLAST,
              BANSUNG_FX_BLAST_STUN,
              Math.round(this.beaconState.x),
              Math.round(this.beaconState.y),
              this.beaconState.radius,
              0,
            );
          }
        }
      }
      out.beaconStatus = { ...this.beaconState };
    }

    // 3. Artillery Siege mortar red-ring telegraphs (1.4s fuse every 4.5s)
    if (this.artilleryActive) {
      for (let i = this.artilleryStrikes.length - 1; i >= 0; i--) {
        const strike = this.artilleryStrikes[i];
        strike.timeLeftS -= dt;
        if (strike.timeLeftS <= TIMER_EPS) {
          if (!out.artilleryDetonations) out.artilleryDetonations = [];
          out.artilleryDetonations.push({
            id: strike.id,
            x: strike.x,
            y: strike.y,
            radius: strike.radius,
            damage: strike.damage,
          });
          if (ctx.fxOut) {
            ctx.fxOut.push(
              FX_BLAST,
              BANSUNG_FX_BLAST_BOSS_MORTAR,
              Math.round(strike.x),
              Math.round(strike.y),
              Math.round(strike.radius),
              0,
            );
          }
          this.artilleryStrikes.splice(i, 1);
        }
      }

      const combatRunning =
        this.phase === 'spawning' || ctx.activeMobs > 0 || ctx.bossAlive;
      if (combatRunning) {
        this.artilleryTimer -= dt;
        if (this.artilleryTimer <= TIMER_EPS) {
          this.artilleryTimer = this.artilleryIntervalS;
          const targetPt = this.pickArtilleryPoint(ctx, rng);
          const strike: DirectorArtilleryTarget = {
            id: this.nextArtilleryId++,
            x: targetPt.x,
            y: targetPt.y,
            radius: ARTILLERY_DEFAULT_RADIUS_PX,
            fuseS: this.artilleryFuseS,
            timeLeftS: this.artilleryFuseS,
            damage: Math.round(ARTILLERY_BASE_DAMAGE * this.mobDmgMult),
          };
          this.artilleryStrikes.push(strike);
          out.artilleryTarget = { ...strike };
        }
      }
    }
  }

  private pickArtilleryPoint(
    ctx: DirectorTickContext,
    rng: () => number,
  ): { x: number; y: number } {
    const standing: DirectorPlayerRef[] = [];
    for (let i = 0; i < ctx.players.length; i++) {
      if (isStandingPlayer(ctx.players[i])) standing.push(ctx.players[i]);
    }
    const anchor =
      standing.length > 0
        ? standing[Math.floor(clamp(rng(), 0, 0.9999999) * standing.length)]
        : { x: BANSUNG_ARENA_CX, y: BANSUNG_ARENA_CY };
    const ang = rng() * Math.PI * 2;
    const dist = 24 + rng() * 96;
    return resolveSpawnClear(
      anchor.x + Math.cos(ang) * dist,
      anchor.y + Math.sin(ang) * dist,
      28,
      ctx.arena,
      ctx.obsGrid,
    );
  }

  private stepSpawning(
    ctx: DirectorTickContext,
    dt: number,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    const spec = this.activeSpec;
    if (!spec) return;

    // Boss wave fast-finish guard: once the Boss dies, drain remaining trickle budget immediately
    const isBossWave = Boolean(spec.miniBoss || spec.boss);
    if (isBossWave && this.bossWasAliveThisWave && !ctx.bossAlive) {
      this.budget = 0;
      this.phase = 'cleanup';
      this.cleanupTimer = 0;
      return;
    }

    const bossAddCap = spec.miniBoss?.maxAdds ?? spec.boss?.maxAdds;
    const effectiveCap =
      isBossWave && ctx.bossAlive && bossAddCap !== undefined
        ? Math.min(this.activeMobCap, bossAddCap)
        : this.activeMobCap;

    // Pause budget drain while at or above active mob cap or wave mob quota
    const quotaLeft =
      !isBossWave && this.waveMobQuota > 0
        ? Math.max(0, this.waveMobQuota - (this.waveMobSpawned + out.spawns.length))
        : Number.POSITIVE_INFINITY;
    if (
      ctx.activeMobs + out.spawns.length < effectiveCap &&
      quotaLeft > 0 &&
      this.budget > 0
    ) {
      this.burstTimer -= dt;
      if (this.burstTimer <= TIMER_EPS) {
        this.spawnSquadBurst(ctx, spec, effectiveCap, out, rng);
        const coopRate = !isBossWave
          ? 1 + 0.22 * (countCoopScalePlayers(ctx.players) - 1)
          : 1;
        this.burstTimer = Math.max(1.0, spec.burstCadenceS / coopRate);
      }
    }

    // Wave 9 mid-wave Summon Gate at 50% remaining budget (or 50% wave quota)
    const midPct = spec.siegeConfig?.midWaveGateAtBudgetPct;
    if (
      spec.siege === 'portal_rush' &&
      midPct !== undefined &&
      !this.midWaveGateTriggered &&
      (this.budget <= this.totalBudget * midPct ||
        (!isBossWave &&
          this.waveMobQuota > 0 &&
          this.waveMobSpawned >= Math.floor(this.waveMobQuota * 0.5)))
    ) {
      this.midWaveGateTriggered = true;
      const nPlayers = countCoopScalePlayers(ctx.players);
      this.spawnPortalGates(
        spec.siegeConfig?.gateCount ?? 1,
        (spec.siegeConfig?.gateBaseHp ?? 520) * nPlayers,
        spec.siegeConfig?.gateSpawnIntervalS ?? 5,
        spec.siegeConfig?.gateSpawnCount ?? 2,
        ctx,
        out,
        rng,
      );
      out.siegeStart = 'portal_rush';
    }

    if (
      this.budget <= 0 ||
      (!isBossWave && this.waveMobQuota > 0 && this.waveMobSpawned >= this.waveMobQuota)
    ) {
      this.budget = 0;
      this.phase = 'cleanup';
      this.cleanupTimer = 0;
    }
  }

  private emitWarmupTelegraphs(
    ctx: DirectorTickContext,
    out: DirectorStepOutput,
    rng: () => number,
    waveTag: number,
  ): void {
    this.telegraphEmittedForWave = waveTag;
    const { gates, chosen } = this.pickBurstGates(
      ctx,
      rng,
      Math.min(SQUAD_PORTALS_MAX, Math.max(SQUAD_PORTALS_MIN, (ctx.enemyGates ?? ctx.arena?.enemyGates ?? BANSUNG_ENEMY_GATES).length)),
    );
    this.spawnTelegraphs = chosen.map((g, i) => ({
      gateIdx: gates.indexOf(g) >= 0 ? gates.indexOf(g) : i,
      x: g.x,
      y: g.y,
      nx: g.nx,
      ny: g.ny,
      radius: SPAWN_TELEGRAPH_RADIUS_PX,
    }));
    out.spawnTelegraphs = this.spawnTelegraphs;
  }

  private runPropRespawn(
    ctx: DirectorTickContext,
    wave: number,
    opts: { includeBarrels: boolean; force: boolean; crateRatio?: number },
    rng: () => number,
  ): WaveRespawnResult | undefined {
    if (!ctx.arena || ctx.autoRespawnProps === false) return undefined;
    return respawnWaveProps(ctx.arena, wave, {
      entities: ctx.players.map((p) => ({
        x: p.x,
        y: p.y,
        radius: 16,
        alive: isStandingPlayer(p),
      })),
      includeBarrels: opts.includeBarrels,
      includeCrates: true,
      ...(opts.crateRatio !== undefined ? { crateRatio: opts.crateRatio } : {}),
      force: opts.force,
      rng,
    });
  }

  private pickBurstGates(
    ctx: DirectorTickContext,
    rng: () => number,
    desiredPortals?: number,
  ): { gates: readonly ArenaEnemyGate[]; chosen: ArenaEnemyGate[] } {
    const gates = ctx.enemyGates ?? ctx.arena?.enemyGates ?? BANSUNG_ENEMY_GATES;
    const portalCount = Math.min(
      gates.length,
      desiredPortals ??
        SQUAD_PORTALS_MIN +
          Math.floor(clamp(rng(), 0, 0.9999999) * (SQUAD_PORTALS_MAX - SQUAD_PORTALS_MIN + 1)),
    );
    const chosen = pickSpawnPortals(
      gates,
      ctx.players,
      portalCount,
      ctx.arena,
      ctx.obsGrid,
      rng,
    );
    return { gates, chosen };
  }

  private stepSurvival(
    ctx: DirectorTickContext,
    dt: number,
    out: DirectorStepOutput,
    rng: () => number,
    prevBossAlive: boolean,
    prevBossId?: BansungEnemyId,
  ): DirectorStepOutput {
    let justFinishedWarmup = false;
    if (this.phase === 'warmup') {
      this.phaseTimer = Math.max(0, this.phaseTimer - dt);
      if (
        this.phaseTimer <= SPAWN_TELEGRAPH_LEAD_S + TIMER_EPS &&
        this.telegraphEmittedForWave !== 1
      ) {
        this.emitWarmupTelegraphs(ctx, out, rng, 1);
      }
      if (this.phaseTimer <= TIMER_EPS && !ctx.perkDraftPending) {
        this.phaseTimer = 0;
        this.phase = 'spawning';
        this.wave = Math.max(1, this.wave);
        this.survivalWaveSpawned = 0;
        this.survivalWaveQuota = computeWaveMaxMobs(this.wave);
        this.activeMobCap = this.survivalWaveQuota;
        this.burstTimer = 0;
        this.survivalPropTimer = 0;
        this.spawnTelegraphs = [];
        justFinishedWarmup = true;
      } else {
        out.survivalClock = this.getSurvivalClock();
        return out;
      }
    }

    if (!justFinishedWarmup) {
      this.survivalElapsedMs += dt * 1000;
      this.survivalPropTimer += dt;
    }

    const difficulty = ctx.difficulty ?? this.difficulty;
    const nPlayers = countCoopScalePlayers(ctx.players);
    const schedule = getSurvivalScheduleState(
      this.survivalElapsedMs,
      difficulty,
      nPlayers,
      Math.max(1, this.wave),
    );

    this.mobHpMult = schedule.hpMult;
    this.mobDmgMult = schedule.dmgMult;
    this.bossHpMult = schedule.bossHpMult;
    this.activeMobCap = computeWaveMaxMobs(Math.max(1, this.wave));
    this.survivalWaveQuota = this.activeMobCap;
    this.avgRosterCost = this.computeAvgRosterCost(schedule.roster);

    // Stage / 20-min silent schedule boundary detection (0-5m -> 5-10m -> 10-15m -> 15-20m -> wrap)
    const stageChanged =
      !this.survivalStageAnnounced ||
      schedule.cycle !== this.survivalCycle ||
      schedule.stageIdx !== this.survivalStageIdx;
    if (stageChanged) {
      const wasActiveStage = this.survivalStageAnnounced;
      const prevWave = this.wave;
      const scheduleWave = schedule.cycle * 4 + schedule.stageIdx + 1;
      this.survivalStageAnnounced = true;
      this.survivalCycle = schedule.cycle;
      this.survivalStageIdx = schedule.stageIdx;
      this.survivalStageId = schedule.stageId;
      if (!wasActiveStage) {
        this.wave = Math.max(1, this.wave, scheduleWave);
        this.survivalWaveSpawned = 0;
      } else {
        this.wave = Math.max(this.wave, scheduleWave);
        if (this.wave > prevWave) {
          this.survivalWaveSpawned = 0;
        }
        this.burstTimer = Math.min(this.burstTimer, 0.25);
      }
      const stageCap = computeWaveMaxMobs(this.wave);
      this.survivalWaveQuota = stageCap;
      this.activeMobCap = stageCap;

      out.survivalStageChange = {
        cycle: schedule.cycle,
        stageIdx: schedule.stageIdx,
        stageId: schedule.stageId,
        name: schedule.stageSpec.name,
        vnName: schedule.stageSpec.vnName,
      };
      if (!wasActiveStage || this.wave > prevWave) {
        const waveStartEvent: DirectorWaveStartEvent = {
          wave: this.wave,
          arc: schedule.stageId,
          budget: stageCap,
          activeMobCap: stageCap,
          mobHpMult: schedule.hpMult,
          mobDmgMult: schedule.dmgMult,
          bossHpMult: schedule.bossHpMult,
          mutators: [],
        };
        out.waveStart = waveStartEvent;
        this.onWaveStart?.(waveStartEvent, this);
      }
    }

    // Boss kill detection -> weapon pedestal drops across the 4224x2688 arena
    const bossKills =
      ctx.bossKills !== undefined
        ? Math.max(0, Math.floor(ctx.bossKills))
        : prevBossAlive && !ctx.bossAlive
          ? 1
          : 0;
    if (bossKills > 0) {
      this.survivalBossKills += bossKills;
      out.pedestalDrops = this.buildSurvivalPedestalDrops(
        ctx,
        bossKills,
        schedule.cycle,
        prevBossId,
      );
    }

    // Milestone Boss spawns at 2m (1 Boss), 5m (2 Bosses), 8m (3 Bosses), 12m (Giant Splitter 1->4->16), 17m (5 Mini-Bosses) -> Endless Cycles ∞
    if (schedule.bossKind && schedule.bossSlotIdx >= 0) {
      const slotKey = `${schedule.cycle}:${schedule.bossSlotIdx}`;
      if (slotKey !== this.survivalLastBossSlotKey) {
        this.survivalLastBossSlotKey = slotKey;
        const enc = schedule.bossEncounter;
        const count = Math.max(1, enc?.count ?? 1);
        const bossRadius = BANSUNG_ENEMIES[schedule.bossKind]?.radius ?? 36;
        const anchor = this.pickSurvivalBossSpawnPos(ctx, bossRadius);
        const positions =
          count === 1
            ? [anchor]
            : this.buildBossRingPositions(anchor.x, anchor.y, count, bossRadius, ctx);
        this.lastBossId = schedule.bossKind;
        out.spawnBoss = {
          id: schedule.bossKind,
          ...(enc?.kinds ? { kinds: enc.kinds } : {}),
          label: enc?.label ?? BANSUNG_ENEMIES[schedule.bossKind]?.name,
          mini: Boolean(enc?.mini),
          hpMult: schedule.bossHpMult * (enc?.hpPerBossMult ?? 1),
          x: positions[0].x,
          y: positions[0].y,
          count,
          positions,
          ...(enc?.scale !== undefined ? { scale: enc.scale } : {}),
          ...(enc?.splitTier !== undefined ? { splitTier: enc.splitTier } : {}),
          ...(enc?.dmgMult !== undefined ? { dmgMult: enc.dmgMult } : {}),
          ...(enc?.mode !== undefined ? { mode: enc.mode } : {}),
        };
      }
    }

    // Periodic crate/barrel respawns every ~45s
    if (this.survivalPropTimer + TIMER_EPS >= SURVIVAL_PROP_RESPAWN_INTERVAL_S) {
      this.survivalPropTimer = Math.max(
        0,
        this.survivalPropTimer - SURVIVAL_PROP_RESPAWN_INTERVAL_S,
      );
      const propRespawn = this.runPropRespawn(
        ctx,
        Math.max(1, this.wave),
        { includeBarrels: true, force: true, crateRatio: 0.55 },
        rng,
      );
      if (propRespawn) {
        out.propRespawn = propRespawn;
      }
    }

    // Sub-wave progression: once current wave's quota (10, 15, 20, ...) is spawned & cleared, advance wave
    if (
      this.survivalWaveSpawned >= this.survivalWaveQuota &&
      ctx.activeMobs === 0 &&
      out.spawns.length === 0
    ) {
      this.wavesCleared = Math.max(this.wavesCleared, this.wave);
      this.wave += 1;
      const nextQuota = computeWaveMaxMobs(this.wave);
      this.survivalWaveSpawned = 0;
      this.survivalWaveQuota = nextQuota;
      this.activeMobCap = nextQuota;
      this.burstTimer = 0;

      const waveStartEvent: DirectorWaveStartEvent = {
        wave: this.wave,
        arc: schedule.stageId,
        budget: nextQuota,
        activeMobCap: nextQuota,
        mobHpMult: schedule.hpMult,
        mobDmgMult: schedule.dmgMult,
        bossHpMult: schedule.bossHpMult,
        mutators: [],
      };
      out.waveStart = waveStartEvent;
      this.onWaveStart?.(waveStartEvent, this);
    }

    // Continuous squad bursts across the 12 perimeter BANSUNG_ENEMY_GATES
    // Pause regular mob bursts completely while a Boss is alive (only Boss summon skills spawn adds).
    const bossBlockingMobs = Boolean(ctx.bossAlive || out.spawnBoss);
    const waveCapLeft = Math.max(0, this.activeMobCap - ctx.activeMobs);
    const waveQuotaLeft = Math.max(
      0,
      this.survivalWaveQuota - (this.survivalWaveSpawned + out.spawns.length),
    );
    const capLeft = bossBlockingMobs ? 0 : Math.min(waveCapLeft, waveQuotaLeft);
    if (capLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= TIMER_EPS) {
        this.spawnSurvivalBurst(ctx, schedule, nPlayers, capLeft, out, rng);
        this.burstTimer = schedule.burstCadenceS;
      }
    }

    out.survivalClock = this.getSurvivalClock();
    return out;
  }

  private buildBossRingPositions(
    cx: number,
    cy: number,
    count: number,
    bossRadius: number,
    ctx: DirectorTickContext,
  ): { x: number; y: number }[] {
    if (count <= 1) {
      return [resolveSpawnClear(cx, cy, bossRadius, ctx.arena, ctx.obsGrid)];
    }
    if (count === 2) {
      return [
        resolveSpawnClear(cx - 125, cy, bossRadius, ctx.arena, ctx.obsGrid),
        resolveSpawnClear(cx + 125, cy, bossRadius, ctx.arena, ctx.obsGrid),
      ];
    }
    const ringDist = count >= 5 ? 195 : 155;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 - Math.PI * 0.5;
      out.push(
        resolveSpawnClear(
          cx + Math.cos(ang) * ringDist,
          cy + Math.sin(ang) * ringDist,
          bossRadius,
          ctx.arena,
          ctx.obsGrid,
        ),
      );
    }
    return out;
  }

  private pickSurvivalBossSpawnPos(
    ctx: DirectorTickContext,
    bossRadius: number,
  ): { x: number; y: number } {
    const pad = ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
    const candidates: { x: number; y: number }[] = [{ x: pad[0], y: pad[1] }];
    if (ctx.arena?.pedestals) {
      for (let i = 0; i < ctx.arena.pedestals.length; i++) {
        candidates.push({ x: ctx.arena.pedestals[i].x, y: ctx.arena.pedestals[i].y });
      }
    }

    let best = candidates[0];
    let bestMinDist = -1;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let minDist = Infinity;
      for (let j = 0; j < ctx.players.length; j++) {
        const pl = ctx.players[j];
        if (!isStandingPlayer(pl)) continue;
        const d = Math.hypot(c.x - pl.x, c.y - pl.y);
        if (d < minDist) minDist = d;
      }
      if (i === 0 && minDist >= 300) {
        best = c;
        break;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = c;
      }
    }

    return resolveSpawnClear(best.x, best.y, bossRadius, ctx.arena, ctx.obsGrid);
  }

  private buildSurvivalPedestalDrops(
    ctx: DirectorTickContext,
    count: number,
    cycle: number,
    bossId?: BansungEnemyId,
  ): DirectorPedestalDrop[] {
    const drops: DirectorPedestalDrop[] = [];
    const shrines = ctx.arena?.pedestals;
    const bossPad = ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY];
    const waveHint = Math.max(4, this.wave);

    for (let i = 0; i < count; i++) {
      let rawX: number;
      let rawY: number;
      let allowedWeapons: readonly BansungWeaponId[] | undefined;
      if (
        i === 0 &&
        ctx.bossPos &&
        Number.isFinite(ctx.bossPos.x) &&
        Number.isFinite(ctx.bossPos.y)
      ) {
        rawX = ctx.bossPos.x;
        rawY = ctx.bossPos.y;
        if (shrines && shrines.length > 0) {
          let bestShrine = shrines[0];
          let bestDist2 = Infinity;
          for (let sIdx = 0; sIdx < shrines.length; sIdx++) {
            const s = shrines[sIdx];
            const d2 = (s.x - rawX) * (s.x - rawX) + (s.y - rawY) * (s.y - rawY);
            if (d2 < bestDist2) {
              bestDist2 = d2;
              bestShrine = s;
            }
          }
          allowedWeapons = bestShrine.weaponPool;
        }
      } else if (shrines && shrines.length > 0) {
        const shrine = shrines[this.survivalPedestalDropCursor % shrines.length];
        this.survivalPedestalDropCursor += 1;
        const dx = BANSUNG_ARENA_CX - shrine.x;
        const dy = BANSUNG_ARENA_CY - shrine.y;
        const len = Math.hypot(dx, dy) || 1;
        rawX = shrine.x + (dx / len) * 64;
        rawY = shrine.y + (dy / len) * 64;
        allowedWeapons = shrine.weaponPool;
      } else {
        const fallbackSpots: readonly [number, number][] = [
          bossPad,
          [1584, 2016],
          [4752, 2016],
          [3168, 792],
          [3168, 3120],
        ];
        const pt = fallbackSpots[this.survivalPedestalDropCursor % fallbackSpots.length];
        this.survivalPedestalDropCursor += 1;
        rawX = pt[0];
        rawY = pt[1];
      }
      const pos = resolveSpawnClear(rawX, rawY, 26, ctx.arena, ctx.obsGrid);
      drops.push({
        x: pos.x,
        y: pos.y,
        waveHint,
        ...(bossId ? { bossId } : {}),
        cycle,
        ...(allowedWeapons && allowedWeapons.length > 0 ? { allowedWeapons } : {}),
      });
    }
    return drops;
  }

  private spawnSurvivalBurst(
    ctx: DirectorTickContext,
    schedule: BansungSurvivalScheduleState,
    nPlayers: number,
    capLeft: number,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    const portalCount = 2 + Math.floor(clamp(rng(), 0, 0.9999999) * 3);
    const { gates, chosen } = this.pickBurstGates(ctx, rng, portalCount);
    if (chosen.length === 0) return;

    const desiredSquad = clamp(
      SQUAD_SIZE_MIN +
        Math.floor(clamp(rng(), 0, 0.9999999) * (SQUAD_SIZE_MAX - SQUAD_SIZE_MIN + 1)) +
        Math.floor(schedule.stageIdx / 2) +
        (nPlayers > 2 ? 1 : 0),
      SQUAD_SIZE_MIN,
      MAX_SPAWNS_PER_TICK,
    );
    const tickLeft = Math.max(0, MAX_SPAWNS_PER_TICK - out.spawns.length);
    const quotaLeft = Math.max(
      0,
      this.survivalWaveQuota - (this.survivalWaveSpawned + out.spawns.length),
    );
    const waveActiveLeft = Math.max(0, this.activeMobCap - (ctx.activeMobs + out.spawns.length));
    const count = Math.min(desiredSquad, capLeft, tickLeft, quotaLeft, waveActiveLeft);
    if (count <= 0) return;

    const maxElitesPerBurst = Math.max(1, Math.min(3, 1 + schedule.stageIdx));
    let elitesSpawned = 0;

    for (let i = 0; i < count; i++) {
      const kind = this.pickWeightedMobKind(schedule.roster, rng);
      let elite: BansungEliteAffix | undefined;
      if (
        schedule.eliteChance > 0 &&
        elitesSpawned < maxElitesPerBurst &&
        rng() < schedule.eliteChance
      ) {
        const affixIdx = Math.floor(
          clamp(rng(), 0, 0.9999999) * SURVIVAL_ELITE_AFFIXES.length,
        );
        elite = SURVIVAL_ELITE_AFFIXES[affixIdx];
        elitesSpawned++;
      }

      const gate = chosen[i % chosen.length];
      const gateIdx = gates.indexOf(gate);
      const mobRadius =
        (BANSUNG_ENEMIES[kind]?.radius ?? 16) *
        (elite ? ELITE_SCALE_MULT : 1) *
        (schedule.evolvedFlag ? SURVIVAL_EVOLVED_SCALE_MULT : 1);
      const pos = resolveMobSpawnPoint(gate, mobRadius, ctx.arena, ctx.obsGrid, rng);
      out.spawns.push(
        this.buildMobSpawn(kind, pos.x, pos.y, elite, gateIdx >= 0 ? gateIdx : undefined, undefined, {
          speedScale: schedule.speedMult,
          armorAdd: schedule.bonusArmor,
          evolved: schedule.evolvedFlag,
          mobLevel: schedule.mobLevel,
        }),
      );
      this.survivalWaveSpawned += 1;
    }
  }

  private spawnSquadBurst(
    ctx: DirectorTickContext,
    spec: WaveSpec,
    effectiveCap: number,
    out: DirectorStepOutput,
    rng: () => number,
  ): void {
    const { gates, chosen: chosenGates } = this.pickBurstGates(ctx, rng);
    if (chosenGates.length === 0) return;

    const minCost = this.getMinRosterCost(spec.roster);
    const desiredSquad =
      SQUAD_SIZE_MIN + Math.floor(clamp(rng(), 0, 0.9999999) * (SQUAD_SIZE_MAX - SQUAD_SIZE_MIN + 1));
    const isBossWave = Boolean(spec.miniBoss || spec.boss);
    const capLeft = Math.max(0, effectiveCap - (ctx.activeMobs + out.spawns.length));
    const tickLeft = Math.max(0, MAX_SPAWNS_PER_TICK - out.spawns.length);
    const quotaLeft =
      !isBossWave && this.waveMobQuota > 0
        ? Math.max(0, this.waveMobQuota - (this.waveMobSpawned + out.spawns.length))
        : Number.POSITIVE_INFINITY;
    const maxCount = Math.min(desiredSquad, capLeft, tickLeft, quotaLeft);
    if (maxCount <= 0) return;

    let elitesSpawned = 0;

    for (let i = 0; i < maxCount && this.budget > 0; i++) {
      let kind: BansungEnemyId;
      let elite: BansungEliteAffix | undefined;

      if (this.budget < minCost) {
        // Remainder budget < cheapest mob cost: spawn 1 cheapest mob and zero budget to prevent soft-lock
        kind = this.getCheapestRosterKind(spec.roster);
        this.budget = 0;
      } else {
        kind = this.pickAffordableMobKind(spec.roster, this.budget, rng);
        const baseCost = Math.max(1, BANSUNG_ENEMIES[kind].cost);
        const canAffordElite =
          spec.eliteChance > 0 &&
          spec.eliteAffixes.length > 0 &&
          elitesSpawned < spec.maxElitesPerSquad &&
          this.budget >= baseCost * ELITE_COST_MULT;

        if (canAffordElite && rng() < spec.eliteChance) {
          const affixIdx = Math.floor(clamp(rng(), 0, 0.9999999) * spec.eliteAffixes.length);
          elite = spec.eliteAffixes[affixIdx];
          elitesSpawned++;
          this.budget = Math.max(0, this.budget - baseCost * ELITE_COST_MULT);
        } else {
          this.budget = Math.max(0, this.budget - baseCost);
        }
      }

      const gate = chosenGates[i % chosenGates.length];
      const gateIdx = gates.indexOf(gate);
      const mobRadius = BANSUNG_ENEMIES[kind].radius * (elite ? ELITE_SCALE_MULT : 1);
      const pos = resolveMobSpawnPoint(gate, mobRadius, ctx.arena, ctx.obsGrid, rng);
      out.spawns.push(
        this.buildMobSpawn(kind, pos.x, pos.y, elite, gateIdx >= 0 ? gateIdx : undefined),
      );
      if (!isBossWave) {
        this.waveMobSpawned += 1;
      }
    }
  }

  private buildMobSpawn(
    kind: BansungEnemyId,
    x: number,
    y: number,
    elite?: BansungEliteAffix,
    gateIdx?: number,
    fromPortalGateId?: number,
    overrides?: {
      speedScale?: number;
      armorAdd?: number;
      evolved?: boolean;
      scaleBonus?: number;
      mobLevel?: number;
    },
  ): DirectorMobSpawn {
    const baseSpeed = this.getMobSpeedMult() * (overrides?.speedScale ?? 1);
    const extraArmor = overrides?.armorAdd ?? 0;
    const evolved = Boolean(overrides?.evolved);
    const scaleBonus = overrides?.scaleBonus ?? (evolved ? SURVIVAL_EVOLVED_SCALE_MULT : 1);
    const mobLevel = overrides?.mobLevel ?? Math.max(1, 1 + Math.floor(Math.max(1, this.wave) / 2));
    if (!elite) {
      return {
        kind,
        x,
        y,
        ...(evolved ? { evolved: true } : {}),
        mobLevel,
        hpMult: this.mobHpMult,
        dmgMult: this.mobDmgMult,
        speedMult: baseSpeed,
        scaleMult: scaleBonus,
        armorAdd: extraArmor,
        ...(gateIdx !== undefined ? { gateIdx } : {}),
        ...(fromPortalGateId !== undefined ? { fromPortalGateId } : {}),
      };
    }

    const affix = ELITE_AFFIX_CONFIG[elite];
    return {
      kind,
      x,
      y,
      elite,
      ...(evolved ? { evolved: true } : {}),
      mobLevel,
      hpMult: this.mobHpMult * ELITE_HP_MULT,
      dmgMult: this.mobDmgMult,
      speedMult: baseSpeed * affix.speedMult,
      scaleMult: ELITE_SCALE_MULT * scaleBonus,
      armorAdd: affix.armorAdd + extraArmor,
      ...(affix.forceArmorType ? { armorType: affix.forceArmorType } : {}),
      ...(affix.deathNovaRadius && affix.deathNovaBaseDmg
        ? {
            deathNova: {
              radius: affix.deathNovaRadius,
              damage: Math.round(affix.deathNovaBaseDmg * this.mobDmgMult),
            },
          }
        : {}),
      ...(gateIdx !== undefined ? { gateIdx } : {}),
      ...(fromPortalGateId !== undefined ? { fromPortalGateId } : {}),
    };
  }

  private stepCleanup(
    ctx: DirectorTickContext,
    dt: number,
    endlessEnabled: boolean,
    out: DirectorStepOutput,
  ): void {
    this.cleanupTimer += dt;

    // Anti-stall straggler enrage (activeMobs <= 3 && cleanupTimer >= 12s)
    if (
      ctx.activeMobs > 0 &&
      ctx.activeMobs <= STRAGGLER_MAX_MOBS &&
      this.cleanupTimer + TIMER_EPS >= BANSUNG_STRAGGLER_ENRAGE_S
    ) {
      this.stragglerEnraged = true;
      if (!this.stragglerEnrageEmitted) {
        this.stragglerEnrageEmitted = true;
        out.stragglerEnrage = {
          active: true,
          speedMult: STRAGGLER_ENRAGE_SPEED_MULT,
          revealOnMinimap: true,
          mobCount: ctx.activeMobs,
        };
      }
      if (ctx.activeMobRefs) {
        for (let i = 0; i < ctx.activeMobRefs.length; i++) {
          const mob = ctx.activeMobRefs[i];
          if (!mob.alive || mob.isBoss) continue;
          mob.revealed = true;
          mob.enraged = true;
          mob.enrageSpeedMult = STRAGGLER_ENRAGE_SPEED_MULT;
          const key = mob.id ?? i;
          if (!this.enragedMobIds.has(key)) {
            this.enragedMobIds.add(key);
            if (mob.speed !== undefined) mob.speed *= STRAGGLER_ENRAGE_SPEED_MULT;
            if (mob.moveSpeed !== undefined) mob.moveSpeed *= STRAGGLER_ENRAGE_SPEED_MULT;
          }
        }
      }
    }

    const effectiveSiegeActive =
      ctx.siegeActive !== undefined ? ctx.siegeActive : this.isSiegeBlockingClear();

    if (ctx.activeMobs === 0 && !ctx.bossAlive && !effectiveSiegeActive) {
      this.completeCurrentWave(ctx, endlessEnabled, out);
    }
  }

  private completeCurrentWave(
    ctx: DirectorTickContext,
    endlessEnabled: boolean,
    out: DirectorStepOutput,
  ): void {
    const spec = this.activeSpec ?? getBansungWaveSpec(this.wave);
    this.wavesCleared = Math.max(this.wavesCleared, this.wave);
    this.artilleryActive = false;
    this.artilleryStrikes = [];
    this.stragglerEnraged = false;
    this.enragedMobIds.clear();

    const reviveMode = ctx.reviveMode ?? this.reviveMode;
    const reward = spec.reward;
    const crates = Math.max(0, Math.round(reward.crates * this.getCrateCountMult()));

    let reviveResult: DirectorWaveClearReviveResult = {
      revivedIds: [],
      reviveHpPct: WAVE_CLEAR_REVIVE_HP_PCT[reviveMode] ?? 0.5,
      healedPulseIds: [],
      energyRefilledIds: [],
      restockedIds: [],
    };
    if (ctx.autoApplyWaveClearRevive !== false) {
      reviveResult = applyWaveClearRevives(
        ctx.players,
        reviveMode,
        ctx.arena?.bossPad ?? [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY],
        ctx.fxOut,
        {
          healPulse: reward.healPulse,
          energyRefill: reward.energyRefill,
          fullRestock: reward.fullRestock,
        },
      );
      this.onReviveWaveClear?.(reviveResult, this.wave, this);
    }

    const clearEvent: DirectorWaveClearEvent = {
      wave: this.wave,
      openPerkDraft: Boolean(reward.perkDraft),
      spawnPedestal: Boolean(reward.weaponPedestal),
      crates,
      healPulse: Boolean(reward.healPulse),
      bonusCoins: reward.bonusCoins ?? 0,
      energyRefill: Boolean(reward.energyRefill),
      fullRestock: Boolean(reward.fullRestock),
      revivedPlayerIds: reviveResult.revivedIds,
      reviveHpPct: reviveResult.reviveHpPct,
    };
    out.waveClear = clearEvent;
    this.onWaveClear?.(clearEvent, this);

    if (this.wave >= BANSUNG_TOTAL_WAVES && !endlessEnabled) {
      this.phase = 'victory';
      this.phaseTimer = 0;
      this.finished = 'victory';
      out.finished = 'victory';
      this.onFinished?.('victory', this);
      return;
    }

    this.phase = 'intermission';
    this.phaseTimer =
      this.wave % 5 === 4 || this.wave % 5 === 0
        ? BANSUNG_BOSS_INTERMISSION_S
        : BANSUNG_INTERMISSION_S;
  }

  private computeAvgRosterCost(roster: readonly WaveRosterEntry[]): number {
    let totalW = 0;
    let totalCostW = 0;
    for (let i = 0; i < roster.length; i++) {
      const r = roster[i];
      const cost = Math.max(1, BANSUNG_ENEMIES[r.kind]?.cost ?? 1);
      totalW += r.weight;
      totalCostW += r.weight * cost;
    }
    return totalW > 0 ? totalCostW / totalW : 2;
  }

  private getMinRosterCost(roster: readonly WaveRosterEntry[]): number {
    let min = Infinity;
    for (let i = 0; i < roster.length; i++) {
      const cost = Math.max(1, BANSUNG_ENEMIES[roster[i].kind]?.cost ?? 1);
      if (cost < min) min = cost;
    }
    return Number.isFinite(min) ? min : 1;
  }

  private getCheapestRosterKind(roster: readonly WaveRosterEntry[]): BansungEnemyId {
    let best = roster[0]?.kind ?? 'scarab';
    let bestCost = Infinity;
    for (let i = 0; i < roster.length; i++) {
      const k = roster[i].kind;
      const cost = Math.max(1, BANSUNG_ENEMIES[k]?.cost ?? 1);
      if (cost < bestCost) {
        bestCost = cost;
        best = k;
      }
    }
    return best;
  }

  private pickWeightedMobKind(roster: readonly WaveRosterEntry[], rng: () => number): BansungEnemyId {
    let total = 0;
    for (let i = 0; i < roster.length; i++) {
      if (roster[i].weight > 0) total += roster[i].weight;
    }
    if (total <= 0) return roster[0]?.kind ?? 'scarab';
    let roll = clamp(rng(), 0, 0.9999999) * total;
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      if (entry.weight <= 0) continue;
      if (roll < entry.weight) return entry.kind;
      roll -= entry.weight;
    }
    return roster[roster.length - 1]?.kind ?? 'scarab';
  }

  private pickAffordableMobKind(
    roster: readonly WaveRosterEntry[],
    budget: number,
    rng: () => number,
  ): BansungEnemyId {
    let total = 0;
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      const cost = Math.max(1, BANSUNG_ENEMIES[entry.kind]?.cost ?? 1);
      if (entry.weight > 0 && cost <= budget) {
        total += entry.weight;
      }
    }
    if (total <= 0) return this.getCheapestRosterKind(roster);
    let roll = clamp(rng(), 0, 0.9999999) * total;
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      const cost = Math.max(1, BANSUNG_ENEMIES[entry.kind]?.cost ?? 1);
      if (entry.weight <= 0 || cost > budget) continue;
      if (roll < entry.weight) return entry.kind;
      roll -= entry.weight;
    }
    return this.getCheapestRosterKind(roster);
  }
}
