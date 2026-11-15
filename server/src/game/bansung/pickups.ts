/**
 * Breakable crate/barrel loot drops, 96-cap pickup manager with needs-based
 * magnet, co-op 40% energy orb resonance & 50% gold sharing, [E] weapon
 * pedestals, and 12-perk draft & stat aggregation helpers at 30Hz (`d31`, `d32`).
 */
import {
  BANSUNG_CRATES,
  BANSUNG_CRATE_FIELDS,
  BANSUNG_CRATE_KINDS,
  BANSUNG_DMG_HEAL,
  BANSUNG_LOOT_TABLES,
  BANSUNG_ORB_COOP_RADIUS,
  BANSUNG_ORB_COOP_SHARE,
  BANSUNG_ORB_SPAWN_LOCK_TICKS,
  BANSUNG_PEDESTAL_TIER_WEIGHTS,
  BANSUNG_PERKS,
  BANSUNG_PERK_RARITY_WEIGHTS,
  BANSUNG_PICKUPS,
  BANSUNG_PICKUP_CONSTS,
  BANSUNG_PICKUP_FIELDS,
  BANSUNG_PICKUP_KINDS,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_PROP_FIELDS,
  BANSUNG_PROP_INDEX,
  BANSUNG_SHIELD_BARRIER_MS,
  BANSUNG_STAMINA,
  BANSUNG_STARTER_PERK_IDS,
  BANSUNG_STATUS_CRATE,
  BANSUNG_STATUS_PERK,
  BANSUNG_TICK_HZ,
  BANSUNG_WEAPONS,
  BANSUNG_WEAPON_IDS,
  FX_DMG,
  FX_STATUS,
  aggregatePerkMods,
  getBansungHero,
  getBansungPerk,
  getBansungWaveSpec,
  getEnemyXpReward,
  getGachaSkillSpec,
  registerBansungPerk,
  type AggregatedPerkMods,
  type ArenaMapDef,
  type BansungArmorType,
  type BansungEnemyId,
  type BansungGachaCard,
  type BansungGachaCategory,
  type BansungGachaRarity,
  type BansungHeroId,
  type BansungPerkId,
  type BansungPropKind,
  type BansungWeaponId,
  type BansungWeaponRarity,
  type BansungWeaponSlot,
  type CrateKind,
  type PerkDef,
  type PickupKind,
  type PropKind,
} from '../../../../shared/src';
import { BANSUNG_SHIELD, calcBansungDamage, type BansungDamageKind } from './damage';
import {
  ObstacleGrid,
  distPointToSegmentSq,
  resolveObstacles,
  type CircleBody,
} from './spatial';

export {
  BANSUNG_CRATES,
  BANSUNG_CRATE_FIELDS,
  BANSUNG_CRATE_KINDS,
  BANSUNG_LOOT_TABLES,
  BANSUNG_ORB_COOP_RADIUS,
  BANSUNG_ORB_COOP_SHARE,
  BANSUNG_ORB_SPAWN_LOCK_TICKS,
  BANSUNG_PEDESTAL_TIER_WEIGHTS,
  BANSUNG_PERKS,
  BANSUNG_PERK_RARITY_WEIGHTS,
  BANSUNG_PICKUPS,
  BANSUNG_PICKUP_CONSTS,
  BANSUNG_PICKUP_FIELDS,
  BANSUNG_PICKUP_KINDS,
  BANSUNG_STARTER_PERK_IDS,
  aggregatePerkMods,
  getBansungPerk,
  getEnemyXpReward,
  getGachaSkillSpec,
  registerBansungPerk,
};

export type {
  AggregatedPerkMods,
  BansungEnemyId,
  BansungGachaCard,
  BansungGachaCategory,
  BansungGachaRarity,
  CrateKind,
  PerkDef,
  PickupKind,
};

// ============================================================================
// 1. Constants & Server Schemas
// ============================================================================

export const BANSUNG_PICKUP_RADIUS_WORLD = 6;
export const BANSUNG_PROP_BURST_FRICTION = 6.5;
export const BANSUNG_PROP_BURST_MIN_SPEED = 70;
export const BANSUNG_PROP_BURST_MAX_SPEED = 130;
export const BANSUNG_CRATE_RESPAWN_MIN_HERO_DIST = 120;
export const BANSUNG_MAX_WEAPON_SLOTS = 5;
export const BANSUNG_BOT_PERK_PICK_DELAY_S = 1.0;
export const BANSUNG_PERK_DRAFT_CHOICE_COUNT = 3;
export const BANSUNG_COOP_AURA_RADIUS = 140;
export const BANSUNG_XP_MAGNET_MULT = 1.45;
export const BANSUNG_XP_COOP_RADIUS = 600;

export const BANSUNG_STATIC_SHIELD_CONSTS = {
  radius: 90,
  stunMs: 1200,
  cooldownS: 10,
} as const;

export const BANSUNG_BARREL_LOOT_TABLES = {
  barrel_explosive: {
    none: 58,
    coin: 25,
    energy_orb: 15,
    armor_plate: 2,
  },
  barrel_emp: {
    none: 53,
    energy_orb: 30,
    coin: 15,
    armor_plate: 2,
  },
} as const;

export type PedestalTier = 'common' | 'rare' | 'epic' | 'legendary';

/** Weapon-facing Gacha multipliers synced with `weapons.ts` combat calculations. */
export interface SurvivalWeaponGachaMods {
  dmgMult: number;
  fireRateMult: number;
  reloadSpeedMult: number;
  extraMultishot: number;
  critChanceAdd: number;
  critDmgMult: number;
  extraPierce: number;
  blastRadiusMult: number;
  energyCostMult: number;
}

/** Per-hero Survival XP, Gacha skill stacks & stat modifiers accumulated across level-ups. */
export interface SurvivalHeroGachaState {
  gachaDmgMult: number;
  gachaFireRateMult: number;
  gachaReloadSpeedMult: number;
  extraMultishot: number;
  gachaCritAdd: number;
  gachaCritDmgMult: number;
  gachaExtraPierce: number;
  gachaBlastRadiusMult: number;
  gachaEnergyCostMult: number;
  gachaMoveSpeedMult: number;
  gachaMagnetBonusPx: number;
  gachaDashCdMult: number;
  gachaMaxHpAdd: number;
  gachaMaxShieldAdd: number;
  gachaMaxEnergyAdd: number;
  gachaMaxStaminaAdd: number;
  gachaStaminaRegenMult: number;
  gachaDashCostReduce: number;
  gachaShieldDmgReduceAdd: number;
  gachaShieldDelayReduceMs: number;
  skillStacks: Record<string, number>;
  gachaMods: SurvivalWeaponGachaMods;
}

export type XpGainCallback = (
  heroIdx: number,
  xp: number,
  isShared: boolean,
  pickupId: number,
) => void;

export interface XpGainEntry {
  heroIdx: number;
  xp: number;
  isShared: boolean;
  pickupId: number;
}

export interface PickupStepOptions {
  onXpGain?: XpGainCallback;
}

/** Minimal hero/bot contract read & updated by `PickupManager` and perk helpers. */
export interface PickupHeroState extends Partial<SurvivalHeroGachaState> {
  id: number | string;
  numId?: number;
  idx: number;
  x: number;
  y: number;
  alive: boolean;
  downed?: boolean;
  bot?: boolean;
  left?: boolean;

  hp: number;
  maxHp: number;
  baseMaxHp?: number;

  /** Rechargeable Soul Knight shield/armor pool (`types.ts` / `damage.ts`). */
  shield?: number;
  maxShield?: number;
  baseMaxShield?: number;
  /** Optional `d32` armor alias; kept synced when present. */
  armor?: number;
  maxArmor?: number;
  baseMaxArmor?: number;

  energy: number;
  maxEnergy: number;
  baseMaxEnergy?: number;

  moveSpeed?: number;
  speed?: number;
  baseMoveSpeed?: number;
  regenRateMul?: number;
  stamina?: number;
  maxStamina?: number;
  baseMaxStamina?: number;
  shieldDamageReduction?: number;
  regenDelayMs?: number;
  /** Active 30s Aegis protection barrier remaining duration (ms). */
  shieldBuffMs?: number;

  heroId?: BansungHeroId;
  hasPet?: boolean;
  petAlive?: boolean;

  slots?: (BansungWeaponSlot | null)[];
  slotIdx?: number;
  sidearmWeapon?: BansungWeaponId;
  pedestalSwapCdS?: number;
  empoweredMask?: number;

  coins?: number;
  kills?: number;
  killHealProgress?: number;
  staticShieldCdS?: number;

  xp?: number;
  xpToNext?: number;
  level?: number;
  gachaChoices?: BansungGachaCard[];
  gachaPending?: number;
  gachaRemMs?: number;

  perks: BansungPerkId[];
  mods?: AggregatedPerkMods;
  perkChoices?: BansungPerkId[];
}

export interface CrateInstance {
  id: number;
  kind: CrateKind;
  propKind: BansungPropKind;
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  hp: number;
  maxHp: number;
  armorType: BansungArmorType;
  alive: boolean;
  obstacleId?: number;
  anchorIdx?: number;
}

export interface PickupInstance {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlS: number;
  maxTtlS: number;
  stack: number;
  weaponId?: BansungWeaponId;
  spawnLockTicks: number;
  createdTick: number;
}

export interface BrokenCrateEvent {
  crateId: number;
  kind: CrateKind;
  x: number;
  y: number;
  drops: PickupInstance[];
}

export interface CollectedPickupEvent {
  pickupId: number;
  kind: PickupKind;
  collectorIdx: number;
  amount: number;
  sharedGold: number;
  sharedEnergy: number;
  sharedXp: number;
  sharedAllyIdxs: number[];
  sfxKey: string;
  x: number;
  y: number;
}

export interface PedestalSwapResult {
  swapped: boolean;
  reason?: 'none_in_range' | 'cooldown' | 'dead_or_downed' | 'no_slots' | 'invalid_weapon';
  pedestalId?: number;
  gainedWeapon?: BansungWeaponId;
  leftWeapon?: BansungWeaponId;
  consumed?: boolean;
  sfxKey?: string;
}

export interface PerkDraftState {
  active: boolean;
  wave: number;
  durationS: number;
  timeLeftS: number;
  elapsedS: number;
  choicesByHeroIdx: Record<number, BansungPerkId[]>;
  pickedHeroIdxs: number[];
}

export interface PerkPickResult {
  ok: boolean;
  reason?: 'no_active_draft' | 'already_picked' | 'invalid_choice' | 'unknown_perk' | 'max_stacks';
  heroIdx: number;
  perkId?: BansungPerkId;
  stacks?: number;
  mods?: AggregatedPerkMods;
  draftCompleted?: boolean;
}

export interface PickupStepResult {
  collected: CollectedPickupEvent[];
  xpGained: XpGainEntry[];
  expiredCount: number;
  pkChanged: boolean;
}

export interface PickupManagerOptions {
  rng?: () => number;
  obsGrid?: ObstacleGrid;
  maxPickups?: number;
  onXpGain?: XpGainCallback;
}

// ============================================================================
// 2. Internal Utilities
// ============================================================================

const PLAYABLE = BANSUNG_PLAYABLE_BOUNDS;
const WALL_PAD = BANSUNG_PICKUP_RADIUS_WORLD + 2;
const TIMER_EPS = 1e-6;
const tmpCircle: CircleBody = { x: 0, y: 0, radius: BANSUNG_PICKUP_RADIUS_WORLD };

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resolveHeroNumId(hero: PickupHeroState): number {
  if (typeof hero.numId === 'number' && Number.isFinite(hero.numId)) {
    return hero.numId | 0;
  }
  if (typeof hero.id === 'number' && Number.isFinite(hero.id)) {
    return hero.id | 0;
  }
  return hero.idx | 0;
}

function getHeroShield(hero: PickupHeroState): number {
  return hero.shield ?? hero.armor ?? 0;
}

function getHeroMaxShield(hero: PickupHeroState): number {
  return hero.maxShield ?? hero.maxArmor ?? 0;
}

function addHeroShield(hero: PickupHeroState, delta: number): number {
  if (delta <= 0) return 0;
  const maxVal = getHeroMaxShield(hero);
  const curVal = getHeroShield(hero);
  const gained = Math.max(0, Math.min(maxVal - curVal, delta));
  if (gained <= 0) return 0;
  const next = curVal + gained;
  if (
    hero.shield !== undefined ||
    hero.maxShield !== undefined ||
    (hero.armor === undefined && hero.maxArmor === undefined)
  ) {
    hero.shield = next;
  }
  if (hero.armor !== undefined || hero.maxArmor !== undefined) {
    hero.armor = next;
  }
  return gained;
}

function resolveSidearmWeapon(hero: PickupHeroState): BansungWeaponId {
  if (hero.sidearmWeapon) return hero.sidearmWeapon;
  if (hero.heroId) return getBansungHero(hero.heroId).sidearmWeapon;
  return 'pistol';
}

function clampPickupPos(
  x: number,
  y: number,
  obsGrid?: ObstacleGrid,
): { x: number; y: number } {
  const safeX = Number.isFinite(x) ? x : (PLAYABLE.x0 + PLAYABLE.x1) * 0.5;
  const safeY = Number.isFinite(y) ? y : (PLAYABLE.y0 + PLAYABLE.y1) * 0.5;
  tmpCircle.x = clamp(safeX, PLAYABLE.x0 + WALL_PAD, PLAYABLE.x1 - WALL_PAD);
  tmpCircle.y = clamp(safeY, PLAYABLE.y0 + WALL_PAD, PLAYABLE.y1 - WALL_PAD);
  if (obsGrid) {
    resolveObstacles(tmpCircle, obsGrid, obsGrid.mapW, obsGrid.mapH, 48);
    tmpCircle.x = clamp(tmpCircle.x, PLAYABLE.x0 + WALL_PAD, PLAYABLE.x1 - WALL_PAD);
    tmpCircle.y = clamp(tmpCircle.y, PLAYABLE.y0 + WALL_PAD, PLAYABLE.y1 - WALL_PAD);
  }
  return { x: tmpCircle.x, y: tmpCircle.y };
}

/** Picks a weighted key from a positive weight map; falls back to the first key. */
export function rollWeightedKey<K extends string>(
  weights: Readonly<Record<K, number>>,
  rng: () => number = Math.random,
): K {
  const keys = Object.keys(weights) as K[];
  let total = 0;
  for (let i = 0; i < keys.length; i++) {
    const w = weights[keys[i]];
    if (Number.isFinite(w) && w > 0) {
      total += w;
    }
  }
  if (total <= 0) {
    return keys[0];
  }
  let roll = clamp(rng(), 0, 0.9999999) * total;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const w = weights[k];
    if (!Number.isFinite(w) || w <= 0) continue;
    if (roll < w) return k;
    roll -= w;
  }
  return keys[keys.length - 1];
}

// ============================================================================
// 3. Pickup Eligibility, Magnet Radius, Encoding & Pedestal Weapon Rolls
// ============================================================================

/** Returns `true` when `hero` is alive, not downed, and eligible for `kind` (`d32`). */
export function isHeroEligibleForPickup(
  hero: PickupHeroState,
  kind: PickupKind,
): boolean {
  if (!hero.alive || hero.downed) return false;
  const filter = BANSUNG_PICKUPS[kind].needsFilter;
  switch (filter) {
    case 'hp':
      return hero.hp < hero.maxHp;
    case 'energy':
      return hero.energy < hero.maxEnergy;
    case 'armor':
      return (
        (hero.shieldBuffMs ?? 0) < BANSUNG_SHIELD_BARRIER_MS * 0.9 ||
        getHeroShield(hero) < getHeroMaxShield(hero)
      );
    case 'always':
      return true;
    case 'interact':
      return false;
  }
}

/** Computes effective magnet pull radius `(R_MAGNET + petBonus + gachaBonus) * magnetMul * xpMult` (`d32`, Survival). */
export function computePickupMagnetRadius(
  hero: PickupHeroState,
  kind?: PickupKind,
): number {
  const petActive = Boolean(hero.hasPet) && hero.petAlive !== false;
  const gachaBonus = Math.max(0, hero.gachaMagnetBonusPx ?? 0);
  const base =
    BANSUNG_PICKUP_CONSTS.R_MAGNET +
    (petActive ? BANSUNG_PICKUP_CONSTS.PET_MAGNET_BONUS : 0) +
    gachaBonus;
  const magnetMul = hero.mods?.magnetMul ?? 1;
  const xpMul =
    kind && BANSUNG_PICKUPS[kind]?.netKind === 'xp' ? BANSUNG_XP_MAGNET_MULT : 1;
  return base * Math.max(0.1, magnetMul) * xpMul;
}

/**
 * Encodes `BansungFrame.pk[+4]` (`subVal`) per `d32`:
 * - `weapon_pedestal`: `BANSUNG_WEAPONS[weaponId].idx`
 * - orbs/coins: `stack (bits 0..11) | (expiringFlag << 12)`
 */
export function encodePickupSubVal(
  pickup: Pick<PickupInstance, 'kind' | 'stack' | 'ttlS' | 'weaponId'>,
): number {
  if (pickup.kind === 'weapon_pedestal') {
    return pickup.weaponId ? (BANSUNG_WEAPONS[pickup.weaponId]?.idx ?? 0) : 0;
  }
  const stackBits = clamp(Math.floor(pickup.stack), 1, 0x0fff) & 0x0fff;
  const expiringFlag = pickup.ttlS <= BANSUNG_PICKUP_CONSTS.TTL_BLINK_S + TIMER_EPS ? 1 : 0;
  return stackBits | (expiringFlag << 12);
}

function matchesPedestalTier(
  rarity: BansungWeaponRarity,
  tier: PedestalTier,
): boolean {
  if (tier === 'common') {
    // Include uncommon firearms/launchers in early-wave pedestals so common isn't only crescent_blade.
    return rarity === 'common' || rarity === 'uncommon';
  }
  return rarity === tier;
}

/**
 * Rolls a weapon ID for a `[E]` pedestal using wave tier weights (`d32`),
 * excluding starter sidearms and weapons already carried by living heroes when possible.
 */
export function rollPedestalWeapon(
  wave: number,
  heroes: readonly PickupHeroState[] = [],
  opts?: {
    rng?: () => number;
    forcedTiers?: readonly PedestalTier[];
    allowedWeapons?: readonly BansungWeaponId[];
  },
): BansungWeaponId {
  const rng = opts?.rng ?? Math.random;
  const w = Math.max(1, Math.floor(wave));

  let tier: PedestalTier;
  if (opts?.forcedTiers && opts.forcedTiers.length > 0) {
    const idx = Math.floor(clamp(rng(), 0, 0.9999999) * opts.forcedTiers.length);
    tier = opts.forcedTiers[idx];
  } else {
    const tierWeights =
      w <= 3
        ? BANSUNG_PEDESTAL_TIER_WEIGHTS.waves1to3
        : w <= 7
          ? BANSUNG_PEDESTAL_TIER_WEIGHTS.waves4to7
          : BANSUNG_PEDESTAL_TIER_WEIGHTS.waves8plus;
    tier = rollWeightedKey(tierWeights, rng);
  }

  const heldSet = new Set<BansungWeaponId>();
  const sidearmSet = new Set<BansungWeaponId>(['pistol']);
  for (let i = 0; i < heroes.length; i++) {
    const h = heroes[i];
    if (h.sidearmWeapon) sidearmSet.add(h.sidearmWeapon);
    if (!h.slots) continue;
    for (let s = 0; s < h.slots.length; s++) {
      const slot = h.slots[s];
      if (slot) heldSet.add(slot.id);
    }
  }

  const sourceList = opts?.allowedWeapons ?? BANSUNG_WEAPON_IDS;
  const tierAll: BansungWeaponId[] = [];
  const tierNoSidearm: BansungWeaponId[] = [];
  const tierUnheld: BansungWeaponId[] = [];

  for (let i = 0; i < sourceList.length; i++) {
    const id = sourceList[i];
    const spec = BANSUNG_WEAPONS[id];
    if (!spec || !matchesPedestalTier(spec.rarity, tier)) continue;
    tierAll.push(id);
    if (!sidearmSet.has(id)) {
      tierNoSidearm.push(id);
      if (!heldSet.has(id)) {
        tierUnheld.push(id);
      }
    }
  }

  const fallbackAll = sourceList.filter((id) => !sidearmSet.has(id));
  const pool =
    tierUnheld.length > 0
      ? tierUnheld
      : tierNoSidearm.length > 0
        ? tierNoSidearm
        : tierAll.length > 0
          ? tierAll
          : fallbackAll.length > 0
            ? fallbackAll
            : BANSUNG_WEAPON_IDS;

  const pickIdx = Math.floor(clamp(rng(), 0, 0.9999999) * pool.length);
  return pool[pickIdx];
}

// ============================================================================
// 4. 12-Perk Draft, Aggregation & Runtime Combat Helpers (d32)
// ============================================================================

/** Returns `true` on waves that open the 3-card Perk Draft (`2, 4, 6, 8` and even endless waves). */
export function shouldTriggerPerkDraft(wave: number): boolean {
  return getBansungWaveSpec(wave).reward.perkDraft;
}

/** Counts current stacks of each perk ID held by a hero. */
export function countHeroPerkStacks(
  perks: readonly BansungPerkId[],
): Map<BansungPerkId, number> {
  const counts = new Map<BansungPerkId, number>();
  for (let i = 0; i < perks.length; i++) {
    const id = perks[i];
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Lists all perks in `registry` that have not yet reached `maxStacks` on `perks`. */
export function getAvailablePerksForHero(
  perks: readonly BansungPerkId[],
  registry: Record<string, PerkDef> = BANSUNG_PERKS,
): PerkDef[] {
  const counts = countHeroPerkStacks(perks);
  const available: PerkDef[] = [];
  const keys = Object.keys(registry);
  for (let i = 0; i < keys.length; i++) {
    const def = registry[keys[i]];
    if (!def) continue;
    if ((counts.get(def.id) ?? 0) < def.maxStacks) {
      available.push(def);
    }
  }
  return available;
}

/**
 * Rolls up to `count` (default `3`) unique perk choices for a hero weighted by
 * `BANSUNG_PERK_RARITY_WEIGHTS` (`common:60, rare:30, epic:10`), excluding maxed perks.
 */
export function rollPerkChoices(
  perks: readonly BansungPerkId[],
  count = BANSUNG_PERK_DRAFT_CHOICE_COUNT,
  rng: () => number = Math.random,
  registry: Record<string, PerkDef> = BANSUNG_PERKS,
): BansungPerkId[] {
  const pool = getAvailablePerksForHero(perks, registry);
  if (pool.length === 0 || count <= 0) return [];

  const targetCount = Math.min(count, pool.length);
  const chosen: BansungPerkId[] = [];
  const remaining = pool.slice();

  while (chosen.length < targetCount && remaining.length > 0) {
    const byRarity: Record<'common' | 'rare' | 'epic', PerkDef[]> = {
      common: [],
      rare: [],
      epic: [],
    };
    for (let i = 0; i < remaining.length; i++) {
      const def = remaining[i];
      byRarity[def.rarity].push(def);
    }

    const activeWeights: Partial<Record<'common' | 'rare' | 'epic', number>> = {};
    if (byRarity.common.length > 0) activeWeights.common = BANSUNG_PERK_RARITY_WEIGHTS.common;
    if (byRarity.rare.length > 0) activeWeights.rare = BANSUNG_PERK_RARITY_WEIGHTS.rare;
    if (byRarity.epic.length > 0) activeWeights.epic = BANSUNG_PERK_RARITY_WEIGHTS.epic;

    const rarity = rollWeightedKey(
      activeWeights as Record<'common' | 'rare' | 'epic', number>,
      rng,
    );
    const bucket = byRarity[rarity];
    const pick = bucket[Math.floor(clamp(rng(), 0, 0.9999999) * bucket.length)];
    chosen.push(pick.id);

    const rmIdx = remaining.indexOf(pick);
    if (rmIdx >= 0) remaining.splice(rmIdx, 1);
  }

  return chosen;
}

/**
 * Aggregates `hero.perks` via `aggregatePerkMods()` and updates `hero.mods`,
 * `maxHp`, `maxShield`/`maxArmor`, `maxEnergy`, `moveSpeed`/`speed`, and
 * `regenRateMul` in O(1) for combat reads (`d32`).
 *
 * Also grants the instant HP increase when `maxHp` grows (e.g. `vitality_boost` `+4 HP`),
 * without re-healing on repeated calls when `perks` have not changed.
 */
export function recomputeHeroStats(
  hero: PickupHeroState,
  registry: Record<string, PerkDef> = BANSUNG_PERKS,
): AggregatedPerkMods {
  const mods = aggregatePerkMods(hero.perks, registry);
  hero.mods = mods;

  const heroSpec = hero.heroId ? getBansungHero(hero.heroId) : undefined;

  if (hero.baseMaxHp === undefined) {
    hero.baseMaxHp = hero.maxHp > 0 ? hero.maxHp : (heroSpec?.hp ?? 6);
  }
  if (hero.baseMaxShield === undefined) {
    const inferred =
      hero.maxShield ?? hero.maxArmor ?? hero.baseMaxArmor ?? heroSpec?.shield ?? 0;
    hero.baseMaxShield = inferred;
    if (hero.baseMaxArmor === undefined) {
      hero.baseMaxArmor = inferred;
    }
  }
  if (hero.baseMaxEnergy === undefined) {
    hero.baseMaxEnergy = hero.maxEnergy > 0 ? hero.maxEnergy : (heroSpec?.energy ?? 200);
  }
  if (hero.baseMoveSpeed === undefined) {
    hero.baseMoveSpeed = hero.moveSpeed ?? hero.speed ?? heroSpec?.speed ?? 195;
  }

  const prevMaxHp = hero.maxHp;
  const nextMaxHp = Math.max(
    1,
    Math.round(hero.baseMaxHp + mods.maxHpAdd + (hero.gachaMaxHpAdd ?? 0)),
  );
  hero.maxHp = nextMaxHp;
  if (nextMaxHp > prevMaxHp && hero.alive && !hero.downed && hero.hp > 0) {
    hero.hp = Math.min(nextMaxHp, hero.hp + (nextMaxHp - prevMaxHp));
  } else {
    hero.hp = Math.min(hero.hp, nextMaxHp);
  }

  const nextMaxShield = Math.max(
    0,
    Math.round(hero.baseMaxShield + mods.maxArmorAdd + (hero.gachaMaxShieldAdd ?? 0)),
  );
  if (
    hero.maxShield !== undefined ||
    hero.shield !== undefined ||
    (hero.maxArmor === undefined && hero.armor === undefined)
  ) {
    hero.maxShield = nextMaxShield;
    if (hero.shield !== undefined) {
      hero.shield = Math.min(hero.shield, nextMaxShield);
    }
  }
  if (hero.maxArmor !== undefined || hero.armor !== undefined) {
    hero.maxArmor = nextMaxShield;
    if (hero.armor !== undefined) {
      hero.armor = Math.min(hero.armor, nextMaxShield);
    }
  }

  const nextMaxEnergy = Math.max(
    0,
    Math.round(hero.baseMaxEnergy + mods.maxEnergyAdd + (hero.gachaMaxEnergyAdd ?? 0)),
  );
  hero.maxEnergy = nextMaxEnergy;
  hero.energy = Math.min(hero.energy, nextMaxEnergy);

  const gachaMoveMul = hero.gachaMoveSpeedMult ?? 1;
  const nextSpeed = Math.round(hero.baseMoveSpeed * mods.moveSpeedMul * gachaMoveMul);
  if (hero.moveSpeed !== undefined || (hero.speed === undefined && gachaMoveMul !== 1)) {
    hero.moveSpeed = nextSpeed;
  }
  if (hero.speed !== undefined) {
    hero.speed = nextSpeed;
  }

  if (hero.baseMaxStamina === undefined && hero.maxStamina !== undefined) {
    hero.baseMaxStamina = hero.maxStamina;
  }
  const prevMaxStamina = hero.maxStamina ?? BANSUNG_STAMINA.BASE_MAX;
  const baseMaxStamina = hero.baseMaxStamina ?? BANSUNG_STAMINA.BASE_MAX;
  const nextMaxStamina = Math.max(
    20,
    Math.round(baseMaxStamina + (hero.gachaMaxStaminaAdd ?? 0)),
  );
  if (
    hero.maxStamina !== undefined ||
    hero.stamina !== undefined ||
    (hero.gachaMaxStaminaAdd ?? 0) > 0
  ) {
    hero.maxStamina = nextMaxStamina;
    if (hero.stamina !== undefined) {
      hero.stamina =
        nextMaxStamina > prevMaxStamina
          ? Math.min(nextMaxStamina, hero.stamina + (nextMaxStamina - prevMaxStamina))
          : Math.min(hero.stamina, nextMaxStamina);
    }
  }
  hero.shieldDamageReduction = Math.min(0.7, 0.25 + (hero.gachaShieldDmgReduceAdd ?? 0));
  hero.regenDelayMs = Math.max(
    2000,
    BANSUNG_SHIELD.REGEN_DELAY_MS - (hero.gachaShieldDelayReduceMs ?? 0),
  );

  hero.regenRateMul = mods.armorRegenMul;
  return mods;
}

/** Lazily initializes Survival Gacha multipliers & skill stack tracking on a hero. */
export function ensureSurvivalHeroGachaState(
  hero: PickupHeroState,
): SurvivalHeroGachaState {
  if (typeof hero.gachaDmgMult !== 'number') hero.gachaDmgMult = 1;
  if (typeof hero.gachaFireRateMult !== 'number') hero.gachaFireRateMult = 1;
  if (typeof hero.gachaReloadSpeedMult !== 'number') hero.gachaReloadSpeedMult = 1;
  if (typeof hero.extraMultishot !== 'number') hero.extraMultishot = 0;
  if (typeof hero.gachaCritAdd !== 'number') hero.gachaCritAdd = 0;
  if (typeof hero.gachaCritDmgMult !== 'number') hero.gachaCritDmgMult = 1;
  if (typeof hero.gachaExtraPierce !== 'number') hero.gachaExtraPierce = 0;
  if (typeof hero.gachaBlastRadiusMult !== 'number') hero.gachaBlastRadiusMult = 1;
  if (typeof hero.gachaEnergyCostMult !== 'number') hero.gachaEnergyCostMult = 1;
  if (typeof hero.gachaMoveSpeedMult !== 'number') hero.gachaMoveSpeedMult = 1;
  if (typeof hero.gachaMagnetBonusPx !== 'number') hero.gachaMagnetBonusPx = 0;
  if (typeof hero.gachaDashCdMult !== 'number') hero.gachaDashCdMult = 1;
  if (typeof hero.gachaMaxHpAdd !== 'number') hero.gachaMaxHpAdd = 0;
  if (typeof hero.gachaMaxShieldAdd !== 'number') hero.gachaMaxShieldAdd = 0;
  if (typeof hero.gachaMaxEnergyAdd !== 'number') hero.gachaMaxEnergyAdd = 0;
  if (typeof hero.gachaMaxStaminaAdd !== 'number') hero.gachaMaxStaminaAdd = 0;
  if (typeof hero.gachaStaminaRegenMult !== 'number') hero.gachaStaminaRegenMult = 1;
  if (typeof hero.gachaDashCostReduce !== 'number') hero.gachaDashCostReduce = 0;
  if (typeof hero.gachaShieldDmgReduceAdd !== 'number') hero.gachaShieldDmgReduceAdd = 0;
  if (typeof hero.gachaShieldDelayReduceMs !== 'number') hero.gachaShieldDelayReduceMs = 0;
  if (!hero.skillStacks) hero.skillStacks = {};
  if (!hero.gachaMods) {
    hero.gachaMods = {
      dmgMult: hero.gachaDmgMult,
      fireRateMult: hero.gachaFireRateMult,
      reloadSpeedMult: hero.gachaReloadSpeedMult,
      extraMultishot: hero.extraMultishot,
      critChanceAdd: hero.gachaCritAdd,
      critDmgMult: hero.gachaCritDmgMult,
      extraPierce: hero.gachaExtraPierce,
      blastRadiusMult: hero.gachaBlastRadiusMult,
      energyCostMult: hero.gachaEnergyCostMult,
    };
  }
  return hero as SurvivalHeroGachaState;
}

function syncSurvivalWeaponGachaMods(hero: PickupHeroState): void {
  const g = ensureSurvivalHeroGachaState(hero);
  g.gachaMods.dmgMult = g.gachaDmgMult;
  g.gachaMods.fireRateMult = g.gachaFireRateMult;
  g.gachaMods.reloadSpeedMult = g.gachaReloadSpeedMult;
  g.gachaMods.extraMultishot = g.extraMultishot;
  g.gachaMods.critChanceAdd = g.gachaCritAdd;
  g.gachaMods.critDmgMult = g.gachaCritDmgMult;
  g.gachaMods.extraPierce = g.gachaExtraPierce;
  g.gachaMods.blastRadiusMult = g.gachaBlastRadiusMult;
  g.gachaMods.energyCostMult = g.gachaEnergyCostMult;
}

/**
 * Applies a Survival level-up Gacha skill card (`skill_damage`, `skill_hp`,
 * `skill_firerate`, `skill_multishot`, `skill_crit`, `skill_mobility`) to `hero`,
 * increments `hero.skillStacks[card.category]`, and recomputes stats cleanly alongside
 * existing 12-perk `aggregatePerkMods()` modifiers.
 */
export function applySurvivalGachaSkillToHero(
  hero: PickupHeroState,
  card: BansungGachaCard,
): { ok: boolean; healed: number; maxHpAdded: number } {
  if (!card || card.category === 'weapon_upgrade') {
    return { ok: false, healed: 0, maxHpAdded: 0 };
  }

  const g = ensureSurvivalHeroGachaState(hero);
  const spec = getGachaSkillSpec(card.id) ?? getGachaSkillSpec(card.category, card.rarity);
  const curStacks = g.skillStacks[card.category] ?? 0;
  if (spec && spec.maxStacks > 0 && curStacks >= spec.maxStacks) {
    return { ok: false, healed: 0, maxHpAdded: 0 };
  }
  const primary = card.value ?? spec?.value ?? 0;

  let healed = 0;
  let maxHpAdded = 0;

  switch (card.category) {
    case 'skill_damage': {
      const dmgAdd = primary > 0 ? primary : 0.12;
      g.gachaDmgMult = Math.min(3.5, g.gachaDmgMult + dmgAdd);
      break;
    }
    case 'skill_hp': {
      const prevMaxHp = hero.maxHp;
      const prevHp = hero.hp;
      const hpBonus = Math.max(1, Math.round(primary > 0 ? primary : 25));
      const shieldBonus = Math.max(2, Math.round(spec?.secondaryValue ?? 10));
      g.gachaMaxHpAdd += hpBonus;
      g.gachaMaxShieldAdd += shieldBonus;
      recomputeHeroStats(hero);
      maxHpAdded = Math.max(0, hero.maxHp - prevMaxHp);
      addHeroShield(hero, shieldBonus);

      if (hero.alive && !hero.downed && hero.hp > 0) {
        const targetHeal = Math.max(
          maxHpAdded,
          Math.round(hero.maxHp * 0.6),
          spec?.tertiaryValue ?? 0,
        );
        const desiredHp = Math.min(hero.maxHp, prevHp + targetHeal);
        if (desiredHp > hero.hp) {
          hero.hp = desiredHp;
        }
        healed = Math.max(0, hero.hp - prevHp);
      }
      break;
    }
    case 'skill_firerate': {
      const rofAdd = primary > 0 ? primary : 0.12;
      const reloadAdd = spec?.secondaryValue ?? rofAdd;
      g.gachaFireRateMult = Math.min(2.6, g.gachaFireRateMult + rofAdd);
      g.gachaReloadSpeedMult = Math.min(2.6, g.gachaReloadSpeedMult + reloadAdd);
      break;
    }
    case 'skill_multishot': {
      const extraProj = Math.max(1, Math.min(1, Math.round(primary > 0 ? primary : 1)));
      const enSave = Math.max(0, spec?.secondaryValue ?? 0);
      g.extraMultishot = Math.min(3, g.extraMultishot + extraProj);
      if (enSave > 0) {
        g.gachaEnergyCostMult = Math.max(0.55, g.gachaEnergyCostMult - enSave);
      }
      break;
    }
    case 'skill_crit': {
      const critAdd = primary > 0 ? primary : 0.08;
      const critDmgAdd = spec?.secondaryValue ?? 0.15;
      const pierceAdd =
        spec?.tertiaryValue ??
        (card.rarity === 'legendary' ? 2 : card.rarity === 'epic' ? 1 : 0);
      g.gachaCritAdd += critAdd;
      g.gachaCritDmgMult += critDmgAdd;
      g.gachaExtraPierce += Math.max(0, Math.round(pierceAdd));
      break;
    }
    case 'skill_mobility': {
      const spdAdd = primary > 0 ? primary : 0.08;
      const magBonus =
        spec?.secondaryValue ??
        (card.rarity === 'legendary'
          ? 200
          : card.rarity === 'epic'
            ? 130
            : card.rarity === 'rare'
              ? 80
              : 45);
      const dashRed = spec?.tertiaryValue ?? 0;
      const maxEnergyBonus =
        card.rarity === 'legendary'
          ? 40
          : card.rarity === 'epic'
            ? 30
            : card.rarity === 'rare'
              ? 20
              : 15;
      g.gachaMoveSpeedMult += spdAdd;
      g.gachaMagnetBonusPx += Math.max(0, magBonus);
      g.gachaDashCdMult = Math.max(0.45, g.gachaDashCdMult - Math.max(0, dashRed));
      g.gachaMaxEnergyAdd += maxEnergyBonus;
      recomputeHeroStats(hero);
      if (hero.alive && !hero.downed) {
        const energyGain = Math.round(hero.maxEnergy * 0.45) + maxEnergyBonus;
        hero.energy = Math.min(hero.maxEnergy, hero.energy + energyGain);
      }
      break;
    }
    case 'skill_stamina': {
      const staAdd = Math.max(10, Math.round(primary > 0 ? primary : 20));
      const regenAdd = Math.max(0, spec?.secondaryValue ?? 0.15);
      const costRed = Math.max(0, Math.round(spec?.tertiaryValue ?? 0));
      g.gachaMaxStaminaAdd += staAdd;
      g.gachaStaminaRegenMult += regenAdd;
      g.gachaDashCostReduce = Math.min(18, g.gachaDashCostReduce + costRed);
      break;
    }
    case 'skill_shield': {
      const shieldBonus = Math.max(10, Math.round(primary > 0 ? primary : 20));
      const drAdd = Math.max(0, spec?.secondaryValue ?? 0.04);
      const delayRed = Math.max(0, Math.round(spec?.tertiaryValue ?? 0));
      g.gachaMaxShieldAdd += shieldBonus;
      g.gachaShieldDmgReduceAdd = Math.min(0.45, g.gachaShieldDmgReduceAdd + drAdd);
      g.gachaShieldDelayReduceMs = Math.min(2500, g.gachaShieldDelayReduceMs + delayRed);
      recomputeHeroStats(hero);
      addHeroShield(hero, shieldBonus);
      break;
    }
    default:
      return { ok: false, healed: 0, maxHpAdded: 0 };
  }

  g.skillStacks[card.category] = (g.skillStacks[card.category] ?? 0) + 1;
  syncSurvivalWeaponGachaMods(hero);
  if (card.category !== 'skill_hp' && card.category !== 'skill_mobility' && card.category !== 'skill_shield') {
    recomputeHeroStats(hero);
  }

  return { ok: true, healed, maxHpAdded };
}

/**
 * Applies a single perk pick to `hero` (validating `maxStacks`), recomputes stats,
 * and appends a `FX_STATUS` (`BANSUNG_STATUS_PERK`) tuple when `fx` is provided.
 */
export function applyPerkToHero(
  hero: PickupHeroState,
  perkId: BansungPerkId,
  fx?: number[],
  registry: Record<string, PerkDef> = BANSUNG_PERKS,
): PerkPickResult {
  const def = Object.prototype.hasOwnProperty.call(registry, perkId)
    ? registry[perkId]
    : undefined;
  if (!def) {
    return { ok: false, reason: 'unknown_perk', heroIdx: hero.idx };
  }

  const curStacks = countHeroPerkStacks(hero.perks).get(perkId) ?? 0;
  if (curStacks >= def.maxStacks) {
    return { ok: false, reason: 'max_stacks', heroIdx: hero.idx };
  }

  hero.perks.push(perkId);
  const mods = recomputeHeroStats(hero, registry);
  hero.perkChoices = undefined;

  if (fx) {
    const starterIdx = (BANSUNG_STARTER_PERK_IDS as readonly string[]).indexOf(perkId);
    fx.push(
      FX_STATUS,
      hero.idx | 0,
      BANSUNG_STATUS_PERK,
      starterIdx >= 0 ? starterIdx : 0,
      Math.round(hero.x),
      Math.round(hero.y),
    );
  }

  return {
    ok: true,
    heroIdx: hero.idx,
    perkId,
    stacks: curStacks + 1,
    mods,
  };
}

/**
 * Computes Co-op Med Aura (`coop_med_aura`) outgoing damage multiplier for `hero`
 * when at least one living ally is within `BANSUNG_COOP_AURA_RADIUS` (`140px`).
 */
export function computeCoopAuraDamageMult(
  hero: PickupHeroState,
  allHeroes: readonly PickupHeroState[],
): number {
  if (!hero.alive || hero.downed) return 1;
  const r2 = BANSUNG_COOP_AURA_RADIUS * BANSUNG_COOP_AURA_RADIUS;
  let nearbyAllyHasAura = false;
  let hasAnyNearbyAlly = false;

  for (let i = 0; i < allHeroes.length; i++) {
    const ally = allHeroes[i];
    if (!ally || ally.idx === hero.idx || !ally.alive || ally.downed) continue;
    const dx = ally.x - hero.x;
    const dy = ally.y - hero.y;
    if (dx * dx + dy * dy <= r2) {
      hasAnyNearbyAlly = true;
      if ((ally.mods?.coopAuraDmg ?? 0) > 0) {
        nearbyAllyHasAura = true;
      }
    }
  }

  if (!hasAnyNearbyAlly) return 1;
  const selfAura = hero.mods?.coopAuraDmg ?? 0;
  if (selfAura <= 0 && !nearbyAllyHasAura) return 1;

  let bestBonus = selfAura;
  if (nearbyAllyHasAura) {
    for (let i = 0; i < allHeroes.length; i++) {
      const ally = allHeroes[i];
      if (!ally || ally.idx === hero.idx || !ally.alive || ally.downed) continue;
      const dx = ally.x - hero.x;
      const dy = ally.y - hero.y;
      if (dx * dx + dy * dy <= r2) {
        bestBonus = Math.max(bestBonus, ally.mods?.coopAuraDmg ?? 0);
      }
    }
  }
  return 1 + bestBonus;
}

/**
 * Processes `vampiric_fang` kill-heal counter (`+1 HP` every `killHealEvery` kills).
 * Returns HP restored (`0` or `1`).
 */
export function onHeroEnemyKill(hero: PickupHeroState, fx?: number[]): number {
  if (!hero.alive || hero.downed) return 0;
  const every = hero.mods?.killHealEvery ?? 0;
  if (every <= 0) return 0;

  hero.killHealProgress = (hero.killHealProgress ?? 0) + 1;
  if (hero.killHealProgress < every) return 0;
  hero.killHealProgress -= every;

  if (hero.hp >= hero.maxHp) return 0;
  const healed = Math.min(1, hero.maxHp - hero.hp);
  hero.hp += healed;
  if (fx && healed > 0) {
    fx.push(
      FX_DMG,
      Math.round(hero.x),
      Math.round(hero.y),
      healed,
      BANSUNG_DMG_HEAL,
      resolveHeroNumId(hero),
    );
  }
  return healed;
}

// ============================================================================
// 5. PickupManager (30Hz Crates, Drops, 96-Cap Magnet, Pedestals, Perk Draft)
// ============================================================================

export class PickupManager {
  private readonly rng: () => number;
  private readonly maxPickups: number;
  private obsGrid?: ObstacleGrid;
  private onXpGainCb?: XpGainCallback;

  private readonly crateList: CrateInstance[] = [];
  private readonly crateById = new Map<number, CrateInstance>();
  private readonly pickupList: PickupInstance[] = [];
  private readonly pickupById = new Map<number, PickupInstance>();

  private nextCrateId = 1;
  private nextPickupId = 1;
  private tickNo = 0;
  private pkDirtyFlag = false;
  private prDirtyFlag = false;
  private activeDraft: PerkDraftState | null = null;

  constructor(opts?: PickupManagerOptions) {
    this.rng = opts?.rng ?? Math.random;
    this.obsGrid = opts?.obsGrid;
    this.maxPickups = Math.max(1, opts?.maxPickups ?? BANSUNG_PICKUP_CONSTS.MAX_PICKUPS);
    this.onXpGainCb = opts?.onXpGain;
  }

  /** Binds or replaces the `ObstacleGrid` used to toggle crate AABBs and clamp pickup bursts. */
  setObstacleGrid(obsGrid: ObstacleGrid | undefined): void {
    this.obsGrid = obsGrid;
  }

  /** Registers or clears the callback invoked when XP orbs are collected or shared. */
  setOnXpGain(cb: XpGainCallback | undefined): void {
    this.onXpGainCb = cb;
  }

  /** Deterministic PRNG sample from this manager's RNG stream. */
  nextRandom(): number {
    return this.rng();
  }

  get crates(): readonly CrateInstance[] {
    return this.crateList;
  }

  get pickups(): readonly PickupInstance[] {
    return this.pickupList;
  }

  get perkDraft(): Readonly<PerkDraftState> | null {
    return this.activeDraft;
  }

  get pkDirty(): boolean {
    return this.pkDirtyFlag;
  }

  get prDirty(): boolean {
    return this.prDirtyFlag;
  }

  /** Clears all crates, pickups, and any active perk draft. */
  reset(): void {
    this.crateList.length = 0;
    this.crateById.clear();
    this.pickupList.length = 0;
    this.pickupById.clear();
    this.nextCrateId = 1;
    this.nextPickupId = 1;
    this.tickNo = 0;
    this.pkDirtyFlag = false;
    this.prDirtyFlag = false;
    this.activeDraft = null;
  }

  // --------------------------------------------------------------------------
  // 5A. Breakable Crates & Wave Replenishment
  // --------------------------------------------------------------------------

  /** Registers a breakable crate (`clay_pot`, `wood_crate`, `iron_crate`). */
  spawnCrate(
    kind: CrateKind,
    x: number,
    y: number,
    opts?: { obstacleId?: number; anchorIdx?: number },
  ): CrateInstance {
    const def = BANSUNG_CRATES[kind];
    const crate: CrateInstance = {
      id: this.nextCrateId++,
      kind,
      propKind: def.propKind,
      x: Math.round(x),
      y: Math.round(y),
      halfW: def.halfW,
      halfH: def.halfH,
      hp: def.hp,
      maxHp: def.hp,
      armorType: def.armorType,
      alive: true,
      obstacleId: opts?.obstacleId,
      anchorIdx: opts?.anchorIdx,
    };
    this.crateList.push(crate);
    this.crateById.set(crate.id, crate);
    if (crate.obstacleId !== undefined) {
      this.obsGrid?.setAlive(crate.obstacleId, true);
    }
    this.prDirtyFlag = true;
    return crate;
  }

  /**
   * Initializes crates from an `ArenaMapDef` (`shared/src/bansung/maps.ts`) and
   * links them to matching destructible `ArenaObstacle` IDs in `obsGrid`.
   */
  initCratesFromMap(map: ArenaMapDef, obsGrid?: ObstacleGrid): CrateInstance[] {
    if (obsGrid) this.obsGrid = obsGrid;
    const spawned: CrateInstance[] = [];
    const obstacles = this.obsGrid?.obstacles ?? map.obstacles;
    let crateCounter = 0;

    for (let i = 0; i < map.props.length; i++) {
      const p = map.props[i];
      if (!p.solid || p.hp <= 0) continue;
      if (p.kind !== 'crate' && p.kind !== 'urn') continue;

      let kind: CrateKind = 'wood_crate';
      if (p.kind === 'urn') {
        kind = 'clay_pot';
      } else {
        kind = crateCounter % 4 === 3 ? 'iron_crate' : 'wood_crate';
        crateCounter++;
      }

      let obstacleId: number | undefined;
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (!o.destructible) continue;
        const cx = o.x + o.w * 0.5;
        const cy = o.y + o.h * 0.5;
        if (Math.abs(cx - p.x) < 1 && Math.abs(cy - p.y) < 1) {
          obstacleId = o.id;
          break;
        }
      }

      spawned.push(this.spawnCrate(kind, p.x, p.y, { obstacleId, anchorIdx: p.idx }));
    }
    return spawned;
  }

  /** Finds a living crate by its numeric crate ID or linked spatial obstacle ID. */
  getCrateByObstacleId(obstacleId: number): CrateInstance | undefined {
    for (let i = 0; i < this.crateList.length; i++) {
      const c = this.crateList[i];
      if (c.obstacleId === obstacleId) return c;
    }
    return undefined;
  }

  /**
   * Applies damage to a breakable crate using `d33` light/armored affinity (`2x`
   * damage for dashes/explosions per `d32`). Breaks crate and ejects loot at `hp <= 0`.
   */
  damageCrate(
    crateId: number,
    rawDmg: number,
    opts?: {
      dmgKind?: BansungDamageKind;
      isExplosion?: boolean;
      isDash?: boolean;
      attackerIdx?: number;
      wave?: number;
      heroes?: readonly PickupHeroState[];
      fx?: number[];
      byObstacleId?: boolean;
    },
  ): BrokenCrateEvent | null {
    const crate = opts?.byObstacleId
      ? this.getCrateByObstacleId(crateId)
      : this.crateById.get(crateId);
    if (!crate || !crate.alive || rawDmg <= 0) return null;

    const dmgKind: BansungDamageKind =
      opts?.dmgKind ?? (opts?.isExplosion ? 'explosive' : 'kinetic');
    const propMult = opts?.isExplosion || opts?.isDash ? 2 : 1;
    const dmg = calcBansungDamage(rawDmg * propMult, dmgKind, crate.armorType, 0);
    if (dmg <= 0) return null;

    crate.hp = Math.max(0, crate.hp - dmg);
    this.prDirtyFlag = true;

    if (crate.hp > 0) return null;

    crate.alive = false;
    if (crate.obstacleId !== undefined) {
      this.obsGrid?.setAlive(crate.obstacleId, false);
    }

    if (opts?.fx) {
      const def = BANSUNG_CRATES[crate.kind];
      opts.fx.push(
        FX_STATUS,
        (opts.attackerIdx ?? 0) | 0,
        BANSUNG_STATUS_CRATE,
        def.kindIdx,
        Math.round(crate.x),
        Math.round(crate.y),
      );
    }

    const drops = this.dropCrateLoot(crate.kind, crate.x, crate.y, {
      wave: opts?.wave,
      heroes: opts?.heroes,
    });
    return { crateId: crate.id, kind: crate.kind, x: crate.x, y: crate.y, drops };
  }

  /**
   * Respawns up to `6 * crateCountMul` broken crates at unoccupied anchors
   * (`dist > 120px` from all living heroes) on odd waves `3, 5, 7, 9` and odd endless waves (`d32`).
   */
  replenishCrates(
    wave: number,
    heroes: readonly PickupHeroState[],
    opts?: { crateCountMul?: number; force?: boolean },
  ): CrateInstance[] {
    const w = Math.max(1, Math.floor(wave));
    const isReplenishWave = (w >= 3 && w <= 9 && w % 2 === 1) || (w > 10 && w % 2 === 1);
    if (!opts?.force && !isReplenishWave) return [];

    const cap = Math.max(
      0,
      Math.round(BANSUNG_PICKUP_CONSTS.WAVE_CRATE_RESPAWN_CAP * (opts?.crateCountMul ?? 1)),
    );
    if (cap === 0) return [];

    const minD2 = BANSUNG_CRATE_RESPAWN_MIN_HERO_DIST * BANSUNG_CRATE_RESPAWN_MIN_HERO_DIST;
    const restored: CrateInstance[] = [];

    for (let i = 0; i < this.crateList.length && restored.length < cap; i++) {
      const c = this.crateList[i];
      if (c.alive) continue;

      let blockedByHero = false;
      for (let h = 0; h < heroes.length; h++) {
        const hero = heroes[h];
        if (!hero.alive || hero.downed) continue;
        const dx = hero.x - c.x;
        const dy = hero.y - c.y;
        if (dx * dx + dy * dy <= minD2) {
          blockedByHero = true;
          break;
        }
      }
      if (blockedByHero) continue;

      c.alive = true;
      c.hp = c.maxHp;
      if (c.obstacleId !== undefined) {
        this.obsGrid?.setAlive(c.obstacleId, true);
      }
      this.prDirtyFlag = true;
      restored.push(c);
    }

    return restored;
  }

  /** Packs living crates in `BANSUNG_PROP_FIELDS` stride-5 `[id, propKindIdx, x, y, hpPct]`. */
  packCrates(out: number[] = []): number[] {
    out.length = 0;
    for (let i = 0; i < this.crateList.length; i++) {
      const c = this.crateList[i];
      if (!c.alive) continue;
      const hpPct = c.maxHp > 0 ? clamp(Math.ceil((c.hp / c.maxHp) * 100), 1, 100) : 100;
      out.push(
        c.id,
        BANSUNG_PROP_INDEX[c.propKind],
        Math.round(c.x),
        Math.round(c.y),
        hpPct,
      );
    }
    return out;
  }

  /** Packs living crates only if dirty or `forceFull === true`. */
  packCratesIfChanged(forceFull = false, out?: number[]): number[] | undefined {
    if (!forceFull && !this.prDirtyFlag) return undefined;
    this.prDirtyFlag = false;
    return this.packCrates(out);
  }

  // --------------------------------------------------------------------------
  // 5B. Weighted Loot Drops (Crates, Barrels, Mobs, Elites, Bosses)
  // --------------------------------------------------------------------------

  private spawnBurstPickup(
    kind: PickupKind,
    x: number,
    y: number,
    opts?: {
      wave?: number;
      heroes?: readonly PickupHeroState[];
      forcedTiers?: readonly PedestalTier[];
      spawnLockTicks?: number;
    },
  ): PickupInstance | null {
    if (kind === 'weapon_pedestal') {
      return this.spawnWeaponPedestal(x, y, opts?.wave ?? 1, opts?.heroes, {
        forcedTiers: opts?.forcedTiers,
      });
    }
    const angle = this.rng() * Math.PI * 2;
    const speed =
      BANSUNG_PROP_BURST_MIN_SPEED +
      this.rng() * (BANSUNG_PROP_BURST_MAX_SPEED - BANSUNG_PROP_BURST_MIN_SPEED);
    return this.spawnPickup(kind, x, y, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spawnLockTicks: opts?.spawnLockTicks ?? BANSUNG_ORB_SPAWN_LOCK_TICKS,
    });
  }

  /** Rolls `minDrops..maxDrops` from `BANSUNG_LOOT_TABLES` for a `CrateKind` (`d32`). */
  dropCrateLoot(
    kind: CrateKind,
    x: number,
    y: number,
    opts?: {
      wave?: number;
      heroes?: readonly PickupHeroState[];
      spawnLockTicks?: number;
    },
  ): PickupInstance[] {
    const def = BANSUNG_CRATES[kind];
    const count =
      def.minDrops + Math.floor(clamp(this.rng(), 0, 0.9999999) * (def.maxDrops - def.minDrops + 1));
    const table = BANSUNG_LOOT_TABLES[def.table] as Readonly<Record<PickupKind | 'none', number>>;
    const spawned: PickupInstance[] = [];
    let pedestalDropped = false;

    for (let i = 0; i < count; i++) {
      let roll = rollWeightedKey(table, this.rng);
      if (roll === 'none') continue;
      if (roll === 'weapon_pedestal' && pedestalDropped) {
        roll = 'energy_orb';
      }
      if (roll === 'weapon_pedestal') {
        pedestalDropped = true;
      }
      const pk = this.spawnBurstPickup(roll, x, y, opts);
      if (pk) spawned.push(pk);
    }
    return spawned;
  }

  /** Rolls loot for an explosive or EMP barrel (`barrel_explosive` / `barrel_emp`). */
  dropBarrelLoot(
    barrelKind: 'barrel_explosive' | 'barrel_emp' | 'barrel',
    x: number,
    y: number,
    opts?: { spawnLockTicks?: number },
  ): PickupInstance[] {
    const table =
      barrelKind === 'barrel_emp'
        ? BANSUNG_BARREL_LOOT_TABLES.barrel_emp
        : BANSUNG_BARREL_LOOT_TABLES.barrel_explosive;
    const roll = rollWeightedKey(
      table as Readonly<Record<PickupKind | 'none', number>>,
      this.rng,
    );
    if (roll === 'none') return [];
    const pk = this.spawnBurstPickup(roll, x, y, opts);
    return pk ? [pk] : [];
  }

  /**
   * Unified prop-drop router for `map.ts` / `world.ts`: maps `PropKind`, `BansungPropKind`,
   * or `CrateKind` to crate/barrel drop tables (`cactus` & `decor` drop nothing per `d06`).
   */
  dropPropLoot(
    propKind: CrateKind | PropKind | BansungPropKind,
    x: number,
    y: number,
    opts?: {
      wave?: number;
      heroes?: readonly PickupHeroState[];
      spawnLockTicks?: number;
    },
  ): PickupInstance[] {
    if (propKind === 'clay_pot' || propKind === 'pot' || propKind === 'urn') {
      return this.dropCrateLoot('clay_pot', x, y, opts);
    }
    if (propKind === 'wood_crate' || propKind === 'crate') {
      return this.dropCrateLoot('wood_crate', x, y, opts);
    }
    if (propKind === 'iron_crate') {
      return this.dropCrateLoot('iron_crate', x, y, opts);
    }
    if (
      propKind === 'barrel_explosive' ||
      propKind === 'barrel_emp' ||
      propKind === 'barrel'
    ) {
      return this.dropBarrelLoot(propKind, x, y, opts);
    }
    return [];
  }

  /**
   * Rolls loot drops on enemy death (`mob`, `elite`, `boss`) per `d32` & `d31`:
   * - `mob`: 18% roll (`+15%` adaptive energy boost if team avg energy `< 40%`)
   * - `elite`: 65% roll (`coin`/`gem_coin`/`energy_cell`/`hp_orb`)
   * - `boss`: 8-orb burst + guaranteed Rare/Epic `weapon_pedestal` on waves 4 & 7
   */
  dropMobLoot(
    tier: 'mob' | 'elite' | 'boss',
    x: number,
    y: number,
    opts?: {
      wave?: number;
      heroes?: readonly PickupHeroState[];
      teamAvgEnergyRatio?: number;
      forcePedestal?: boolean;
      spawnLockTicks?: number;
    },
  ): PickupInstance[] {
    const spawned: PickupInstance[] = [];

    if (tier === 'mob') {
      if (this.rng() < BANSUNG_LOOT_TABLES.mob_kill.dropChance) {
        const kind = rollWeightedKey(
          BANSUNG_LOOT_TABLES.mob_kill.weights as Readonly<Record<PickupKind, number>>,
          this.rng,
        );
        const pk = this.spawnBurstPickup(kind, x, y, opts);
        if (pk) spawned.push(pk);
      } else if (
        opts?.teamAvgEnergyRatio !== undefined &&
        opts.teamAvgEnergyRatio < 0.4 &&
        this.rng() < 0.15
      ) {
        const pk = this.spawnBurstPickup('energy_orb', x, y, opts);
        if (pk) spawned.push(pk);
      }
      return spawned;
    }

    if (tier === 'elite') {
      if (this.rng() < BANSUNG_LOOT_TABLES.elite_kill.dropChance) {
        const kind = rollWeightedKey(
          BANSUNG_LOOT_TABLES.elite_kill.weights as Readonly<Record<PickupKind, number>>,
          this.rng,
        );
        const pk = this.spawnBurstPickup(kind, x, y, opts);
        if (pk) spawned.push(pk);
      }
      return spawned;
    }

    // Boss death burst: 8 orbs + guaranteed Rare/Epic pedestal on waves 4 & 7
    const bossOrbPool: readonly PickupKind[] = [
      'energy_cell',
      'energy_orb',
      'energy_orb',
      'hp_pack',
      'hp_orb',
      'armor_plate',
      'gem_coin',
      'gem_coin',
    ];
    const burstCount = BANSUNG_LOOT_TABLES.boss_kill.orbBurstCount;
    for (let i = 0; i < burstCount; i++) {
      const kind = bossOrbPool[i % bossOrbPool.length];
      const angle = (i / burstCount) * Math.PI * 2 + (this.rng() - 0.5) * 0.35;
      const speed = 90 + this.rng() * 55;
      const pk = this.spawnPickup(kind, x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spawnLockTicks: opts?.spawnLockTicks ?? BANSUNG_ORB_SPAWN_LOCK_TICKS,
      });
      if (pk) spawned.push(pk);
    }

    const wave = opts?.wave ?? 1;
    const isGuaranteedWave = (
      BANSUNG_LOOT_TABLES.boss_kill.guaranteedPedestalWaves as readonly number[]
    ).includes(wave);
    if (opts?.forcePedestal || isGuaranteedWave) {
      const ped = this.spawnWeaponPedestal(x, y, wave, opts?.heroes, {
        forcedTiers: ['rare', 'epic'],
      });
      if (ped) spawned.push(ped);
    }

    return spawned;
  }

  /** Spawns a 4-orb energy burst when a boss crosses 75% / 50% / 25% HP thresholds (`d31`). */
  spawnBossPhaseEnergyBurst(
    x: number,
    y: number,
    count = 4,
    kind: 'energy_orb' | 'energy_cell' = 'energy_orb',
  ): PickupInstance[] {
    const out: PickupInstance[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2 + this.rng() * 0.4;
      const speed = 75 + this.rng() * 50;
      const pk = this.spawnPickup(kind, x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spawnLockTicks: BANSUNG_ORB_SPAWN_LOCK_TICKS,
      });
      if (pk) out.push(pk);
    }
    return out;
  }

  // --------------------------------------------------------------------------
  // 5C. 96-Cap Pickup Pool, Merge, Eviction, Needs-Based Magnet & Pedestals
  // --------------------------------------------------------------------------

  private findMergeCandidate(
    kind: PickupKind,
    x: number,
    y: number,
  ): PickupInstance | undefined {
    const r2 = BANSUNG_PICKUP_CONSTS.MERGE_RADIUS * BANSUNG_PICKUP_CONSTS.MERGE_RADIUS;
    let best: PickupInstance | undefined;
    let bestD2 = r2 + 1;
    for (let i = 0; i < this.pickupList.length; i++) {
      const p = this.pickupList[i];
      if (p.kind !== kind || p.stack >= BANSUNG_PICKUP_CONSTS.MAX_STACK) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 < bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }

  private evictOldestLowPriority(): boolean {
    let victimIdx = -1;
    // Prefer oldest coin / energy_orb first per d32, then small XP shards, never evict weapon_pedestal
    for (let i = 0; i < this.pickupList.length; i++) {
      const k = this.pickupList[i].kind;
      if (k === 'coin' || k === 'energy_orb') {
        victimIdx = i;
        break;
      }
    }
    if (victimIdx === -1) {
      for (let i = 0; i < this.pickupList.length; i++) {
        if (this.pickupList[i].kind === 'xp_orb_s') {
          victimIdx = i;
          break;
        }
      }
    }
    if (victimIdx === -1) {
      for (let i = 0; i < this.pickupList.length; i++) {
        if (this.pickupList[i].kind !== 'weapon_pedestal') {
          victimIdx = i;
          break;
        }
      }
    }
    if (victimIdx === -1) return false;
    const [removed] = this.pickupList.splice(victimIdx, 1);
    this.pickupById.delete(removed.id);
    this.pkDirtyFlag = true;
    return true;
  }

  /**
   * Spawns a pickup into the `96`-cap pool. At capacity, merges into an existing
   * matching pickup within `48px` (up to `5x` stack) or evicts the oldest `coin`/`energy_orb`
   * (never despawning a `weapon_pedestal`).
   */
  spawnPickup(
    kind: PickupKind,
    x: number,
    y: number,
    opts?: {
      vx?: number;
      vy?: number;
      stack?: number;
      weaponId?: BansungWeaponId;
      ttlS?: number;
      spawnLockTicks?: number;
    },
  ): PickupInstance | null {
    const def = BANSUNG_PICKUPS[kind];
    const clamped = clampPickupPos(x, y, this.obsGrid);
    const stack = clamp(Math.floor(opts?.stack ?? 1), 1, BANSUNG_PICKUP_CONSTS.MAX_STACK);

    if (this.pickupList.length >= this.maxPickups) {
      if (kind !== 'weapon_pedestal') {
        const mergeTarget = this.findMergeCandidate(kind, clamped.x, clamped.y);
        if (mergeTarget) {
          const ttlS = opts?.ttlS ?? def.ttlS;
          mergeTarget.stack = Math.min(
            BANSUNG_PICKUP_CONSTS.MAX_STACK,
            mergeTarget.stack + stack,
          );
          mergeTarget.ttlS = Math.max(mergeTarget.ttlS, ttlS);
          this.pkDirtyFlag = true;
          return mergeTarget;
        }
      }
      if (!this.evictOldestLowPriority()) {
        return null;
      }
    }

    const ttlS = opts?.ttlS ?? def.ttlS;
    const pickup: PickupInstance = {
      id: this.nextPickupId++,
      kind,
      x: clamped.x,
      y: clamped.y,
      vx: kind === 'weapon_pedestal' ? 0 : (opts?.vx ?? 0),
      vy: kind === 'weapon_pedestal' ? 0 : (opts?.vy ?? 0),
      ttlS,
      maxTtlS: ttlS,
      stack,
      ...(kind === 'weapon_pedestal'
        ? { weaponId: opts?.weaponId ?? 'rifle' }
        : {}),
      spawnLockTicks:
        kind === 'weapon_pedestal' ? 0 : Math.max(0, Math.floor(opts?.spawnLockTicks ?? 0)),
      createdTick: this.tickNo,
    };

    this.pickupList.push(pickup);
    this.pickupById.set(pickup.id, pickup);
    this.pkDirtyFlag = true;
    return pickup;
  }

  /** Spawns an interactive `[E]` `weapon_pedestal` rolling tier weights by `wave`. */
  spawnWeaponPedestal(
    x: number,
    y: number,
    wave: number,
    heroes?: readonly PickupHeroState[],
    opts?: {
      weaponId?: BansungWeaponId;
      forcedTiers?: readonly PedestalTier[];
      allowedWeapons?: readonly BansungWeaponId[];
      ttlS?: number;
    },
  ): PickupInstance | null {
    const weaponId =
      opts?.weaponId ??
      rollPedestalWeapon(wave, heroes, {
        rng: this.rng,
        forcedTiers: opts?.forcedTiers,
        allowedWeapons: opts?.allowedWeapons,
      });
    return this.spawnPickup('weapon_pedestal', x, y, {
      weaponId,
      ttlS: opts?.ttlS ?? BANSUNG_PICKUP_CONSTS.TTL_PEDESTAL_S,
      spawnLockTicks: 0,
    });
  }

  /** Returns the closest `weapon_pedestal` within `R_INTERACT` (`44px`) of `hero`. */
  findNearestInteractablePedestal(hero: PickupHeroState): PickupInstance | undefined {
    const r2 = BANSUNG_PICKUP_CONSTS.R_INTERACT * BANSUNG_PICKUP_CONSTS.R_INTERACT;
    let best: PickupInstance | undefined;
    let bestD2 = r2 + 1e-6;
    for (let i = 0; i < this.pickupList.length; i++) {
      const p = this.pickupList[i];
      if (p.kind !== 'weapon_pedestal') continue;
      const dx = p.x - hero.x;
      const dy = p.y - hero.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = p;
      }
    }
    return best;
  }

  /**
   * Handles `[E]` (`{ t: 'use' }`) pedestal weapon swap (`d32`):
   * - Requires living, non-downed hero within `44px` and `pedestalSwapCdS <= 0`.
   * - If active slot holds starter sidearm (or is empty), equips pedestal weapon and consumes pedestal.
   * - Otherwise swaps active slot weapon onto the pedestal, resets TTL to `45s`, sets `0.4s` swap CD.
   */
  interactPedestal(hero: PickupHeroState): PedestalSwapResult {
    if (!hero.alive || hero.downed) {
      return { swapped: false, reason: 'dead_or_downed' };
    }
    if ((hero.pedestalSwapCdS ?? 0) > TIMER_EPS) {
      return { swapped: false, reason: 'cooldown' };
    }
    if (!hero.slots) {
      return { swapped: false, reason: 'no_slots' };
    }

    const pedestal = this.findNearestInteractablePedestal(hero);
    if (!pedestal) {
      return { swapped: false, reason: 'none_in_range' };
    }
    const newWeaponId = pedestal.weaponId;
    if (!newWeaponId || !BANSUNG_WEAPONS[newWeaponId]) {
      return { swapped: false, reason: 'invalid_weapon' };
    }

    const slotIdx = clamp(Math.floor(hero.slotIdx ?? 0), 0, BANSUNG_MAX_WEAPON_SLOTS - 1);
    const curSlot = hero.slots[slotIdx];
    const sidearm = resolveSidearmWeapon(hero);
    const newSpec = BANSUNG_WEAPONS[newWeaponId];

    hero.slots[slotIdx] = {
      id: newWeaponId,
      clip: newSpec.magSize,
      maxClip: newSpec.magSize,
    };
    if (hero.empoweredMask !== undefined) {
      hero.empoweredMask &= ~(1 << slotIdx);
    }
    hero.pedestalSwapCdS = BANSUNG_PICKUP_CONSTS.PEDESTAL_SWAP_CD_S;

    const oldWeaponId = curSlot?.id;
    const consumed = !oldWeaponId || oldWeaponId === sidearm;

    if (consumed) {
      const idx = this.pickupList.indexOf(pedestal);
      if (idx >= 0) this.pickupList.splice(idx, 1);
      this.pickupById.delete(pedestal.id);
    } else {
      pedestal.weaponId = oldWeaponId;
      pedestal.ttlS = BANSUNG_PICKUP_CONSTS.TTL_PEDESTAL_S;
      pedestal.maxTtlS = BANSUNG_PICKUP_CONSTS.TTL_PEDESTAL_S;
    }

    this.pkDirtyFlag = true;
    return {
      swapped: true,
      pedestalId: pedestal.id,
      gainedWeapon: newWeaponId,
      leftWeapon: consumed ? undefined : oldWeaponId,
      consumed,
      sfxKey: BANSUNG_PICKUPS.weapon_pedestal.sfxKey,
    };
  }

  private applyPickupCollection(
    p: PickupInstance,
    collector: PickupHeroState,
    heroes: readonly PickupHeroState[],
    fx?: number[],
    onXpGain?: XpGainCallback,
    xpGainedOut?: XpGainEntry[],
  ): CollectedPickupEvent {
    const def = BANSUNG_PICKUPS[p.kind];
    const valMult = collector.mods?.pickupValueMul ?? 1;
    const amount = Math.max(1, Math.round(def.amount * p.stack * valMult));
    const sharedAllyIdxs: number[] = [];
    let sharedGold = 0;
    let sharedEnergy = 0;
    let sharedXp = 0;

    if (p.kind === 'hp_orb' || p.kind === 'hp_pack') {
      const healed = Math.max(0, Math.min(collector.maxHp - collector.hp, amount));
      collector.hp += healed;
      if (fx && healed > 0) {
        fx.push(
          FX_DMG,
          Math.round(collector.x),
          Math.round(collector.y),
          healed,
          BANSUNG_DMG_HEAL,
          resolveHeroNumId(collector),
        );
      }
    } else if (p.kind === 'armor_plate') {
      // Image-2 Shield pickup: 30s full protection barrier that blocks all incoming attacks
      collector.shieldBuffMs = BANSUNG_SHIELD_BARRIER_MS;
    } else if (p.kind === 'energy_orb' || p.kind === 'energy_cell') {
      const gained = Math.max(0, Math.min(collector.maxEnergy - collector.energy, amount));
      collector.energy += gained;

      // Co-op 40% Energy Orb resonance to living allies within 450px (d31)
      const shareAmt = Math.ceil(amount * BANSUNG_ORB_COOP_SHARE);
      const r2 = BANSUNG_ORB_COOP_RADIUS * BANSUNG_ORB_COOP_RADIUS;
      for (let i = 0; i < heroes.length; i++) {
        const ally = heroes[i];
        if (!ally || ally.idx === collector.idx || !ally.alive || ally.downed) continue;
        const dx = ally.x - collector.x;
        const dy = ally.y - collector.y;
        if (dx * dx + dy * dy <= r2) {
          const allyGain = Math.max(0, Math.min(ally.maxEnergy - ally.energy, shareAmt));
          if (allyGain > 0) {
            ally.energy += allyGain;
            sharedEnergy += allyGain;
            sharedAllyIdxs.push(ally.idx);
          }
        }
      }
    } else if (p.kind === 'coin' || p.kind === 'gem_coin') {
      collector.coins = (collector.coins ?? 0) + amount;
      const shareAmt = Math.ceil(amount * def.sharedCoopRatio);
      if (shareAmt > 0) {
        for (let i = 0; i < heroes.length; i++) {
          const ally = heroes[i];
          if (!ally || ally.idx === collector.idx || !ally.alive || ally.downed) continue;
          ally.coins = (ally.coins ?? 0) + shareAmt;
          sharedGold += shareAmt;
          sharedAllyIdxs.push(ally.idx);
        }
      }
    } else if (def.netKind === 'xp') {
      if (onXpGain) {
        onXpGain(collector.idx, amount, false, p.id);
      } else if (collector.xp !== undefined) {
        collector.xp += amount;
      }
      xpGainedOut?.push({ heroIdx: collector.idx, xp: amount, isShared: false, pickupId: p.id });

      // Co-op 40% XP resonance to living teammates within 600px
      const shareRatio = def.sharedCoopRatio > 0 ? def.sharedCoopRatio : BANSUNG_ORB_COOP_SHARE;
      const shareXp = Math.ceil(amount * shareRatio);
      const r2 = BANSUNG_XP_COOP_RADIUS * BANSUNG_XP_COOP_RADIUS;
      if (shareXp > 0) {
        for (let i = 0; i < heroes.length; i++) {
          const ally = heroes[i];
          if (!ally || ally.idx === collector.idx || !ally.alive || ally.downed) continue;
          const dx = ally.x - collector.x;
          const dy = ally.y - collector.y;
          if (dx * dx + dy * dy <= r2) {
            if (onXpGain) {
              onXpGain(ally.idx, shareXp, true, p.id);
            } else if (ally.xp !== undefined) {
              ally.xp += shareXp;
            }
            sharedXp += shareXp;
            sharedAllyIdxs.push(ally.idx);
            xpGainedOut?.push({ heroIdx: ally.idx, xp: shareXp, isShared: true, pickupId: p.id });
          }
        }
      }
    }

    return {
      pickupId: p.id,
      kind: p.kind,
      collectorIdx: collector.idx,
      amount,
      sharedGold,
      sharedEnergy,
      sharedXp,
      sharedAllyIdxs,
      sfxKey: def.sfxKey,
      x: Math.round(p.x),
      y: Math.round(p.y),
    };
  }

  /**
   * Advances all pickups by `dtS` (default `1 / 30`s):
   * - Decrements hero pedestal swap cooldowns and pickup TTLs
   * - Runs needs-based magnet acceleration (`950 px/s^2`, cap `420 px/s`, `1.45x` radius for XP orbs)
   * - Applies `18px` swept collection, 40% co-op energy/XP resonance, and 50% co-op gold sharing
   */
  step(
    dtS: number = 1 / BANSUNG_TICK_HZ,
    heroes: readonly PickupHeroState[] = [],
    fx?: number[],
    stepOpts?: PickupStepOptions | XpGainCallback,
  ): PickupStepResult {
    this.tickNo++;
    const dt = Number.isFinite(dtS) && dtS > 0 ? dtS : 0;
    const onXpGain =
      typeof stepOpts === 'function' ? stepOpts : (stepOpts?.onXpGain ?? this.onXpGainCb);
    const collected: CollectedPickupEvent[] = [];
    const xpGained: XpGainEntry[] = [];
    let expiredCount = 0;
    let changed = false;

    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if ((h.pedestalSwapCdS ?? 0) > 0) {
        const nextCd = (h.pedestalSwapCdS ?? 0) - dt;
        h.pedestalSwapCdS = nextCd <= TIMER_EPS ? 0 : nextCd;
      }
      if ((h.staticShieldCdS ?? 0) > 0) {
        const nextShieldCd = (h.staticShieldCdS ?? 0) - dt;
        h.staticShieldCdS = nextShieldCd <= TIMER_EPS ? 0 : nextShieldCd;
      }
    }

    const collectR2 = BANSUNG_PICKUP_CONSTS.R_COLLECT * BANSUNG_PICKUP_CONSTS.R_COLLECT;
    const frictionFactor = Math.exp(-BANSUNG_PROP_BURST_FRICTION * dt);

    for (let i = this.pickupList.length - 1; i >= 0; i--) {
      const p = this.pickupList[i];
      const prevBlink = p.ttlS <= BANSUNG_PICKUP_CONSTS.TTL_BLINK_S + TIMER_EPS;
      p.ttlS -= dt;
      if (p.ttlS <= TIMER_EPS) {
        this.pickupList.splice(i, 1);
        this.pickupById.delete(p.id);
        expiredCount++;
        changed = true;
        continue;
      }
      const nextBlink = p.ttlS <= BANSUNG_PICKUP_CONSTS.TTL_BLINK_S + TIMER_EPS;
      if (nextBlink !== prevBlink && p.kind !== 'weapon_pedestal') {
        changed = true;
      }

      if (p.kind === 'weapon_pedestal') {
        continue;
      }

      if (p.spawnLockTicks > 0) {
        p.spawnLockTicks--;
      }

      const prevX = p.x;
      const prevY = p.y;
      const prevRoundX = Math.round(prevX);
      const prevRoundY = Math.round(prevY);

      let magnetTarget: PickupHeroState | undefined;
      if (p.spawnLockTicks <= 0) {
        let bestDistSq = Infinity;
        for (let h = 0; h < heroes.length; h++) {
          const hero = heroes[h];
          if (!isHeroEligibleForPickup(hero, p.kind)) continue;
          const r = computePickupMagnetRadius(hero, p.kind);
          const dx = hero.x - p.x;
          const dy = hero.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r * r && d2 < bestDistSq) {
            bestDistSq = d2;
            magnetTarget = hero;
          }
        }
      }

      if (magnetTarget) {
        const dx = magnetTarget.x - p.x;
        const dy = magnetTarget.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-4) {
          const curSpeed = Math.hypot(p.vx, p.vy);
          const nextSpeed = Math.min(
            BANSUNG_PICKUP_CONSTS.MAGNET_MAX_SPEED,
            curSpeed + BANSUNG_PICKUP_CONSTS.MAGNET_ACCEL * dt,
          );
          p.vx = (dx / dist) * nextSpeed;
          p.vy = (dy / dist) * nextSpeed;
        }
      } else {
        p.vx *= frictionFactor;
        p.vy *= frictionFactor;
        if (Math.abs(p.vx) < 0.5) p.vx = 0;
        if (Math.abs(p.vy) < 0.5) p.vy = 0;
      }

      if (p.vx !== 0 || p.vy !== 0) {
        const nextPos = clampPickupPos(p.x + p.vx * dt, p.y + p.vy * dt, this.obsGrid);
        p.x = nextPos.x;
        p.y = nextPos.y;
        if (Math.round(p.x) !== prevRoundX || Math.round(p.y) !== prevRoundY) {
          changed = true;
        }
      }

      // Check contact collection using swept segment to avoid fast-pull overshoot
      if (p.spawnLockTicks <= 0) {
        let collector: PickupHeroState | undefined;
        let bestD2 = collectR2 + 1e-6;
        for (let h = 0; h < heroes.length; h++) {
          const hero = heroes[h];
          if (!isHeroEligibleForPickup(hero, p.kind)) continue;
          const d2 = distPointToSegmentSq(hero.x, hero.y, prevX, prevY, p.x, p.y);
          if (d2 <= bestD2) {
            bestD2 = d2;
            collector = hero;
          }
        }
        if (collector) {
          collected.push(
            this.applyPickupCollection(p, collector, heroes, fx, onXpGain, xpGained),
          );
          this.pickupList.splice(i, 1);
          this.pickupById.delete(p.id);
          changed = true;
        }
      }
    }

    if (changed) {
      this.pkDirtyFlag = true;
    }
    return { collected, xpGained, expiredCount, pkChanged: changed };
  }

  /** Packs all active pickups in `BANSUNG_PICKUP_FIELDS` stride-5 `[id, kindIdx, x, y, subVal]`. */
  packPickups(out: number[] = []): number[] {
    out.length = 0;
    for (let i = 0; i < this.pickupList.length; i++) {
      const p = this.pickupList[i];
      out.push(
        p.id,
        BANSUNG_PICKUPS[p.kind].kindIdx,
        Math.round(p.x),
        Math.round(p.y),
        encodePickupSubVal(p),
      );
    }
    return out;
  }

  /** Clears the per-tick pickups dirty flag (called once per tick after serializing all viewers). */
  clearPickupsDirty(): void {
    this.pkDirtyFlag = false;
  }

  /** Marks the per-tick pickups snapshot dirty (e.g. when external pet magnet pulls move pickups). */
  markPickupsDirty(): void {
    this.pkDirtyFlag = true;
  }

  /** Packs pickups only when dirty or `forceFull === true`. */
  packPickupsIfChanged(
    forceFull = false,
    out?: number[],
    clearDirty = true,
  ): number[] | undefined {
    if (!forceFull && !this.pkDirtyFlag) return undefined;
    if (clearDirty) {
      this.pkDirtyFlag = false;
    }
    return this.packPickups(out);
  }

  // --------------------------------------------------------------------------
  // 5D. Wave-Clear 12-Perk Draft State Machine
  // --------------------------------------------------------------------------

  /**
   * Opens a 12-second 3-choice Perk Draft across all active players (`d32`),
   * populating `hero.perkChoices` for private HUD delivery.
   */
  startPerkDraft(
    heroes: readonly PickupHeroState[],
    wave: number,
    durationS = BANSUNG_PICKUP_CONSTS.PERK_DRAFT_S,
  ): PerkDraftState {
    const choicesByHeroIdx: Record<number, BansungPerkId[]> = {};
    const pickedHeroIdxs: number[] = [];

    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (!h || h.left) continue;
      const choices = rollPerkChoices(h.perks, BANSUNG_PERK_DRAFT_CHOICE_COUNT, this.rng);
      h.perkChoices = choices.length > 0 ? choices : undefined;
      choicesByHeroIdx[h.idx] = choices;
      if (choices.length === 0) {
        pickedHeroIdxs.push(h.idx);
      }
    }

    this.activeDraft = {
      active: true,
      wave,
      durationS,
      timeLeftS: durationS,
      elapsedS: 0,
      choicesByHeroIdx,
      pickedHeroIdxs,
    };
    return this.activeDraft;
  }

  private isAllHumansPicked(heroes: readonly PickupHeroState[]): boolean {
    if (!this.activeDraft) return true;
    const picked = new Set(this.activeDraft.pickedHeroIdxs);
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (!h || h.left || h.bot) continue;
      const choices = this.activeDraft.choicesByHeroIdx[h.idx];
      if (choices && choices.length > 0 && !picked.has(h.idx)) {
        return false;
      }
    }
    return true;
  }

  private finalizeRemainingDraftPicks(
    heroes: readonly PickupHeroState[],
    onlyBots: boolean,
    fx?: number[],
  ): Array<{ heroIdx: number; perkId: BansungPerkId }> {
    const pickedOut: Array<{ heroIdx: number; perkId: BansungPerkId }> = [];
    if (!this.activeDraft || !this.activeDraft.active) return pickedOut;

    const pickedSet = new Set(this.activeDraft.pickedHeroIdxs);
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      if (!h || h.left) continue;
      if (onlyBots && !h.bot) continue;
      if (pickedSet.has(h.idx)) continue;

      const choices = this.activeDraft.choicesByHeroIdx[h.idx];
      if (!choices || choices.length === 0) {
        this.activeDraft.pickedHeroIdxs.push(h.idx);
        continue;
      }

      const autoId = choices[0];
      const res = applyPerkToHero(h, autoId, fx);
      this.activeDraft.pickedHeroIdxs.push(h.idx);
      h.perkChoices = undefined;
      if (res.ok) {
        pickedOut.push({ heroIdx: h.idx, perkId: autoId });
      }
    }
    return pickedOut;
  }

  /**
   * Submits a player's perk choice (`{ t: 'perk', id }`) during an active draft.
   * Automatically resolves remaining bots and closes the draft once all humans pick.
   */
  submitPerkChoice(
    hero: PickupHeroState,
    perkId: BansungPerkId,
    allHeroes?: readonly PickupHeroState[],
    fx?: number[],
  ): PerkPickResult {
    if (!this.activeDraft || !this.activeDraft.active) {
      return { ok: false, reason: 'no_active_draft', heroIdx: hero.idx };
    }
    if (this.activeDraft.pickedHeroIdxs.includes(hero.idx)) {
      return { ok: false, reason: 'already_picked', heroIdx: hero.idx };
    }

    const offered = this.activeDraft.choicesByHeroIdx[hero.idx] ?? hero.perkChoices ?? [];
    if (!offered.includes(perkId)) {
      return { ok: false, reason: 'invalid_choice', heroIdx: hero.idx };
    }

    const applied = applyPerkToHero(hero, perkId, fx);
    if (!applied.ok) {
      return applied;
    }

    this.activeDraft.pickedHeroIdxs.push(hero.idx);

    let draftCompleted = false;
    if (allHeroes && this.isAllHumansPicked(allHeroes)) {
      this.finalizeRemainingDraftPicks(allHeroes, false, fx);
      this.activeDraft.active = false;
      this.activeDraft.timeLeftS = 0;
      draftCompleted = true;
    }

    return {
      ...applied,
      draftCompleted,
    };
  }

  /**
   * Advances the active 12s Perk Draft timer at 30Hz:
   * - Bots auto-pick `choices[0]` after `1.0s`
   * - When all humans have picked or `timeLeftS <= 0`, unpicked players get `choices[0]`
   */
  stepPerkDraft(
    dtS: number = 1 / BANSUNG_TICK_HZ,
    heroes: readonly PickupHeroState[] = [],
    fx?: number[],
  ): {
    active: boolean;
    completed: boolean;
    autoPicked: Array<{ heroIdx: number; perkId: BansungPerkId }>;
  } {
    if (!this.activeDraft || !this.activeDraft.active) {
      return { active: false, completed: false, autoPicked: [] };
    }

    const dt = Number.isFinite(dtS) && dtS > 0 ? dtS : 0;
    this.activeDraft.elapsedS += dt;
    this.activeDraft.timeLeftS = Math.max(0, this.activeDraft.timeLeftS - dt);

    const autoPicked: Array<{ heroIdx: number; perkId: BansungPerkId }> = [];
    if (this.activeDraft.elapsedS >= BANSUNG_BOT_PERK_PICK_DELAY_S - TIMER_EPS) {
      autoPicked.push(...this.finalizeRemainingDraftPicks(heroes, true, fx));
    }

    const allHumansDone = this.isAllHumansPicked(heroes);
    if (allHumansDone || this.activeDraft.timeLeftS <= TIMER_EPS) {
      autoPicked.push(...this.finalizeRemainingDraftPicks(heroes, false, fx));
      this.activeDraft.active = false;
      this.activeDraft.timeLeftS = 0;
      return { active: false, completed: true, autoPicked };
    }

    return { active: true, completed: false, autoPicked };
  }
}

/**
 * Spawns guaranteed Survival XP orbs (`xp_orb_s` / `xp_orb_m` / `xp_orb_l`) on enemy defeat
 * using `getEnemyXpReward()` from `shared/src/bansung/enemies.ts`.
 * Returns total XP spawned into the pickup pool.
 */
export function spawnEnemyXpOrbs(
  mgr: PickupManager,
  x: number,
  y: number,
  enemyId: BansungEnemyId,
  isElite: boolean,
  isEvolved: boolean,
  cycle: number,
  opts?: { spawnLockTicks?: number; rng?: () => number },
): number {
  const reward = getEnemyXpReward(enemyId, isElite, isEvolved, cycle);
  const perOrbXp = BANSUNG_PICKUPS[reward.kind].amount;
  const maxOrbsBeforeBatch = 8;
  const remaining = Math.max(1, reward.count);
  const rng = opts?.rng ?? (() => mgr.nextRandom());

  const orbStacks: number[] = [];
  if (remaining <= maxOrbsBeforeBatch) {
    for (let i = 0; i < remaining; i++) orbStacks.push(1);
  } else {
    const batchTarget = Math.max(
      maxOrbsBeforeBatch,
      Math.ceil(remaining / BANSUNG_PICKUP_CONSTS.MAX_STACK),
    );
    const baseStack = Math.floor(remaining / batchTarget);
    let extra = remaining % batchTarget;
    for (let i = 0; i < batchTarget; i++) {
      const s = Math.min(BANSUNG_PICKUP_CONSTS.MAX_STACK, baseStack + (extra > 0 ? 1 : 0));
      if (extra > 0) extra--;
      orbStacks.push(s);
    }
  }

  let totalSpawnedXp = 0;
  for (let i = 0; i < orbStacks.length; i++) {
    const angle = (i / Math.max(1, orbStacks.length)) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const speed =
      BANSUNG_PROP_BURST_MIN_SPEED +
      rng() * (BANSUNG_PROP_BURST_MAX_SPEED - BANSUNG_PROP_BURST_MIN_SPEED);
    const stack = orbStacks[i];
    const pk = mgr.spawnPickup(reward.kind, x, y, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      stack,
      spawnLockTicks: opts?.spawnLockTicks ?? BANSUNG_ORB_SPAWN_LOCK_TICKS,
    });
    if (pk) {
      totalSpawnedXp += perOrbXp * stack;
    }
  }

  return totalSpawnedXp;
}
