/**
 * Authoritative 30Hz combat damage, Miragine light/armored affinity, Soul Knight
 * shield-before-HP soak & regeneration, crit rolls, 3-stage stun diminishing
 * returns, and 500ms DOT status resolution for Ban Sung Co-op (`bansung`, d33).
 */
import {
  BANSUNG_DMG_ARMOR,
  BANSUNG_DMG_BURN,
  BANSUNG_DMG_CRIT,
  BANSUNG_DMG_SHOCK,
  BANSUNG_DMG_STUN,
  FX_DMG,
  type BansungArmorType,
} from '../../../../shared/src';

export type { BansungArmorType };

// ============================================================================
// 1. Combat Types, Affinity Matrix & Tuning Constants (d33)
// ============================================================================

export type BansungDamageKind =
  | 'kinetic'
  | 'pierce'
  | 'explosive'
  | 'energy'
  | 'fire'
  | 'melee'
  | 'true';

export type BansungDotKind = 'burn' | 'poison' | 'shock' | 'bleed';
export type BansungEntityTier = 'hero' | 'mob' | 'elite' | 'boss';

export const BANSUNG_DAMAGE_KINDS: readonly BansungDamageKind[] = [
  'kinetic',
  'pierce',
  'explosive',
  'energy',
  'fire',
  'melee',
  'true',
] as const;

export const BANSUNG_DAMAGE_KIND_INDEX: Readonly<Record<BansungDamageKind, number>> = {
  kinetic: 0,
  pierce: 1,
  explosive: 2,
  energy: 3,
  fire: 4,
  melee: 5,
  true: 6,
} as const;

export const BANSUNG_DOT_KINDS: readonly BansungDotKind[] = [
  'burn',
  'poison',
  'shock',
  'bleed',
] as const;

export const BANSUNG_ARMOR_ID: Readonly<Record<BansungArmorType, 0 | 1>> = {
  light: 0,
  armored: 1,
} as const;

/** `[vsLight, vsArmored]` multipliers inspired by Miragine War counter matrix. */
export const BANSUNG_AFFINITY: Readonly<
  Record<BansungDamageKind, readonly [vsLight: number, vsArmored: number]>
> = {
  kinetic: [1.0, 0.85], // balanced; crits ignore +2 flatArmor
  pierce: [0.9, 1.25], // anti-armor; ignores 100% flatArmor
  explosive: [1.0, 1.3], // crushes armored + 1.25x shield dmg
  energy: [1.1, 1.15], // 1.25x bonus vs Shield before HP spill
  fire: [1.25, 0.8], // shreds light swarms, weak vs heavy plating
  melee: [1.15, 0.95], // strong cleave vs unarmored mobs
  true: [1.0, 1.0], // bypasses flatArmor
} as const;

export const BANSUNG_SHIELD = {
  REGEN_DELAY_MS: 5000, // 5.0s zero-damage wait before shield recharges (2200ms with Fast Shield perk)
  FAST_REGEN_DELAY_MS: 2200,
  REGEN_INTERVAL_MS: 250, // +1 shield per 250ms (4 shield/s) so shield climbs gradually
  REGEN_AMOUNT: 1,
  HERO_HP_IFRAMES_MS: 250, // prevents multi-pellet/swarm 1-tick deletion on HP loss
  DASH_IFRAMES_MS: 280, // full dodge invulnerability (d20)
  HIT_FLASH_MS: 90, // ~3 frames at 30Hz white offscreen tint
  BONUS_MULT_ENERGY_EXPLOSIVE: 1.25, // 1.25x vs Shield for energy/explosive
} as const;

export const BANSUNG_BASE_CRIT_MULT = 1.5;
export const BANSUNG_MAX_CRIT_CHANCE = 0.85;
export const BANSUNG_POISON_VULN_MULT = 1.15;
export const BANSUNG_KINETIC_CRIT_ARMOR_PEN = 2;

export const BANSUNG_STUN_DR = {
  MULTS: [1.0, 0.5, 0.25, 0] as const, // stage 0..2 scale, stage 3 = immune
  RESET_MS: 10_000, // boss reset = 12_000ms
  BOSS_RESET_MS: 12_000,
  IMMUNE_MS: 4000, // stage 3 lockout; hero post-stun = 2500ms
  HERO_POST_STUN_IMMUNE_MS: 2500,
  MIN_SCALED_MS: 150,
  TIER_MULT: { hero: 0.7, mob: 1.0, elite: 0.65, boss: 0.35 } as const,
  TIER_MAX_MS: { hero: 1000, mob: 3000, elite: 1200, boss: 900 } as const,
} as const;

export interface BansungDotConfig {
  readonly durMs: number;
  readonly tickMs: number;
  readonly baseDmg: number;
  readonly stackStep: number;
  readonly maxStacks: number;
  readonly kind: BansungDamageKind;
}

export const BANSUNG_DOTS: Readonly<Record<BansungDotKind, BansungDotConfig>> = {
  burn: { durMs: 3000, tickMs: 500, baseDmg: 6, stackStep: 2, maxStacks: 3, kind: 'fire' },
  poison: { durMs: 4000, tickMs: 500, baseDmg: 5, stackStep: 2, maxStacks: 3, kind: 'true' },
  shock: { durMs: 2500, tickMs: 500, baseDmg: 4, stackStep: 1, maxStacks: 2, kind: 'energy' },
  bleed: { durMs: 3000, tickMs: 500, baseDmg: 5, stackStep: 2, maxStacks: 3, kind: 'true' },
} as const;

export const BANSUNG_SHOCK_CHAIN_RADIUS_PX = 96;
export const BANSUNG_SHOCK_CHAIN_MULT = 0.5;
export const BANSUNG_BLEED_MOVE_SPEED_THRESH = 20;
export const BANSUNG_BLEED_MOVE_MULT = 1.5;

// d33 combat popup flags
export const BANSUNG_DMG_FLAG_CRIT = 1;
export const BANSUNG_DMG_FLAG_SHIELD = 2;
export const BANSUNG_DMG_FLAG_BREAK = 4;
export const BANSUNG_DMG_FLAG_IMMUNE = 8;
export const BANSUNG_DMG_FLAG_DOT = 16;

export type BansungDmgFlags = number;

/** Quantized d33 combat popup tuple: `[targetId, amount, flags, dmgKindIdx]`. */
export type BansungDmgEvent = readonly [
  targetId: number | string,
  amount: number,
  flags: BansungDmgFlags,
  dmgKindIdx: number,
];

/** Quantized 6-int wire FX tuple (`FX_DMG = [1, x, y, amount, dmgFlags, targetId]`). */
export type BansungFxDmgTuple = readonly [
  fxType: typeof FX_DMG,
  x: number,
  y: number,
  amount: number,
  dmgFlags: number,
  targetId: number,
];

export interface BansungDotEntry {
  stacks: number;
  leftMs: number;
  accMs: number;
  attackerId?: string;
  /** Optional custom damage per 500ms tick when a weapon/enemy overrides `BANSUNG_DOTS`. */
  tickDmgOverride?: number;
}

export interface BansungCombatTarget {
  id: number | string;
  numId?: number;
  x?: number;
  y?: number;
  tier: BansungEntityTier;
  armorType: BansungArmorType;
  flatArmor: number;
  alive: boolean;
  downed?: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldDelayMs?: number;
  shieldRegenAccMs?: number;
  regenDelayMs?: number;
  fastShield?: boolean;
  regenRateMul?: number;
  regenAmount?: number;
  strongShield?: boolean;
  dashIframesMs?: number;
  hitIframesMs?: number;
  /** Active 30s Aegis barrier from `armor_plate` pickup; blocks all incoming damage & CC. */
  shieldBuffMs?: number;
  hitFlashMs?: number;
  ccImmune?: boolean;
  stunMs?: number;
  stunImmuneMs?: number;
  stunDrStage?: number;
  stunDrResetMs?: number;
  dots?: Partial<Record<BansungDotKind, BansungDotEntry>>;
  speed?: number;
  perks?: ReadonlySet<string> | readonly string[];
  fireWard?: boolean;
  toxinWard?: boolean;
  vulnMult?: number;
  vulnMs?: number;
  slowPct?: number;
  slowMs?: number;
  damageReduction?: number;
  /** Extra damage reduction [0..0.75] active whenever `shield > 0 && !hit.bypassShield`. */
  shieldDamageReduction?: number;
}

export interface BansungDamageHit {
  baseDmg: number;
  dmgKind: BansungDamageKind;
  /** Optional weapon override `[vsLight, vsArmored]`. */
  affinity?: readonly [number, number];
  /** Flat armor penetration subtracted before reduction. */
  armorPen?: number;
  /** Fractional armor pierce `[0..1]` (e.g. sniper `0.25`). */
  armorPiercePct?: number;
  critChance?: number;
  critMult?: number;
  /** Optional deterministic override for crit roll (useful in tests/guaranteed crits). */
  forceCrit?: boolean;
  isDot?: boolean;
  bypassShield?: boolean;
  attackerId?: string;
  atkCritBonus?: number;
  atkCritDmgBonus?: number;
  /** Outgoing damage multiplier (e.g. perks or empowered reload). */
  dmgMult?: number;
  /** Optional stun duration (ms) applied via `applyStunWithDR` when hit is not blocked. */
  stunMs?: number;
  /** Optional DOT applied via `applyDot` when hit is not blocked. */
  dotKind?: BansungDotKind;
}

export interface BansungDamageContext {
  rng?: () => number;
  atkCritBonus?: number;
  atkCritDmgBonus?: number;
  popups?: BansungDmgEvent[];
  /** Flat wire FX number stream receiving 6-int `FX_DMG` entries. */
  fx?: number[];
}

export interface BansungShockArcEvent {
  fromId: number | string;
  toId: number | string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  damage: number;
}

export interface BansungStatusContext extends BansungDamageContext {
  /** Custom spatial lookup returning candidate same-faction foes within `radiusPx` for `shock` chains. */
  findShockTargets?: (
    source: BansungCombatTarget,
    radiusPx: number,
  ) => readonly BansungCombatTarget[];
  /** Optional candidate array used when `findShockTargets` is not provided. */
  nearbyTargets?: readonly BansungCombatTarget[];
  /** Optional sink recording triggered shock chain arcs (`<= 96px`). */
  shockArcs?: BansungShockArcEvent[];
}

export interface BansungStunOptions extends BansungDamageContext {
  /** Optional target-specific stun scale factor combined with tier multiplier (defaults to 1). */
  entityStunMult?: number;
  dmgKindIdx?: number;
}

export interface BansungDotApplyOptions extends BansungDamageContext {
  durMs?: number;
  tickDmgOverride?: number;
}

export interface BansungDamageResult {
  hpDmg: number;
  shieldDmg: number;
  totalDmg: number;
  rawDmg: number;
  blocked: boolean;
  isCrit: boolean;
  brokeShield: boolean;
  killed: boolean;
  stunAppliedMs: number;
  flags: BansungDmgFlags;
  fxFlags: number;
  dmgKindIdx: number;
  popup?: BansungDmgEvent;
  fx?: BansungFxDmgTuple;
}

export interface BansungStatusTickResult {
  dotDmg: number;
  shockChains: number;
  stunExpired: boolean;
  activeDots: number;
}

// Small float tolerance so 30Hz `1000/30` ms steps fire accurately at exact 500ms/750ms boundaries.
const TIME_EPS_MS = 1e-6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resolveNumId(target: BansungCombatTarget): number {
  if (typeof target.numId === 'number' && Number.isFinite(target.numId)) {
    return target.numId | 0;
  }
  if (typeof target.id === 'number' && Number.isFinite(target.id)) {
    return target.id | 0;
  }
  return 0;
}

function hasPerk(target: BansungCombatTarget, perkId: string): boolean {
  const perks = target.perks;
  if (!perks) return false;
  if (Array.isArray(perks)) {
    return perks.includes(perkId);
  }
  return (perks as ReadonlySet<string>).has(perkId);
}

function isPoisoned(target: BansungCombatTarget): boolean {
  const entry = target.dots?.poison;
  return entry !== undefined && entry.leftMs > 0;
}

// ============================================================================
// 2. Pure Damage & Affinity Calculation
// ============================================================================

/**
 * Computes Miragine-style affinity and flat-armor reduced raw damage before
 * Soul Knight shield soak.
 *
 * Returns `0` if `baseDmg <= 0`, otherwise clamps to at least `1`.
 */
export function calcBansungDamage(
  baseDmg: number,
  dmgKind: BansungDamageKind,
  targetArmorType: BansungArmorType,
  flatArmor: number,
  opts?: {
    affinity?: readonly [number, number];
    armorPen?: number;
    armorPiercePct?: number;
    critMult?: number;
    isCrit?: boolean;
    vulnMult?: number;
  },
): number {
  if (!Number.isFinite(baseDmg) || baseDmg <= 0) return 0;

  const aff = (opts?.affinity ?? BANSUNG_AFFINITY[dmgKind])[BANSUNG_ARMOR_ID[targetArmorType]];
  const cMult = opts?.critMult ?? 1.0;
  const vuln = opts?.vulnMult ?? 1.0;
  const isCrit = opts?.isCrit ?? cMult > 1.0;
  const kineticCritPen = isCrit && dmgKind === 'kinetic' ? BANSUNG_KINETIC_CRIT_ARMOR_PEN : 0;
  const pen = (opts?.armorPen ?? 0) + kineticCritPen;
  const piercePct = clamp(opts?.armorPiercePct ?? 0, 0, 1);
  const scaledArmor = Math.max(0, flatArmor * (1 - piercePct));
  const effArmor =
    dmgKind === 'pierce' || dmgKind === 'true' ? 0 : Math.max(0, scaledArmor - pen);

  return Math.max(1, Math.round(baseDmg * aff * cMult * vuln - effArmor));
}

// ============================================================================
// 3. Damage Application, Shield Soak & Hero Shield Regen
// ============================================================================

/**
 * Applies a single hit (direct, AoE, or DOT tick) against `target` with:
 * 1. Alive/downed and dash/HP invulnerability gates
 * 2. Non-DOT crit roll (capped at 85% chance)
 * 3. Miragine affinity, poison vulnerability (+15%), and flatArmor reduction
 * 4. Soul Knight shield-before-HP soak (1.25x vs Shield for energy/explosive,
 *    plus Strong Shield overflow guard) and hero regen delay reset
 * 5. HP reduction, hero post-HP i-frames (250ms), hit-flash (90ms), and popups
 */
export function applyBansungDamage(
  target: BansungCombatTarget,
  hit: BansungDamageHit,
  ctx?: BansungDamageContext,
): BansungDamageResult {
  const dmgKindIdx = BANSUNG_DAMAGE_KIND_INDEX[hit.dmgKind] ?? 0;

  if (!target.alive || target.downed || target.hp <= 0) {
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
      flags: 0,
      fxFlags: 0,
      dmgKindIdx,
    };
  }

  if ((target.shieldBuffMs ?? 0) > 0) {
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
      fxFlags: BANSUNG_DMG_FLAG_IMMUNE,
      dmgKindIdx,
    };
  }

  if (!hit.isDot && ((target.dashIframesMs ?? 0) > 0 || (target.hitIframesMs ?? 0) > 0)) {
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
      flags: 0,
      fxFlags: 0,
      dmgKindIdx,
    };
  }

  if (!Number.isFinite(hit.baseDmg) || hit.baseDmg <= 0) {
    return {
      hpDmg: 0,
      shieldDmg: 0,
      totalDmg: 0,
      rawDmg: 0,
      blocked: false,
      isCrit: false,
      brokeShield: false,
      killed: false,
      stunAppliedMs: 0,
      flags: 0,
      fxFlags: 0,
      dmgKindIdx,
    };
  }

  const rng = ctx?.rng ?? Math.random;
  let isCrit = false;
  let cMult = 1.0;

  if (!hit.isDot) {
    if (hit.forceCrit !== undefined) {
      isCrit = hit.forceCrit;
    } else {
      const atkCritBonus = hit.atkCritBonus ?? ctx?.atkCritBonus ?? 0;
      const effCrit = clamp((hit.critChance ?? 0) + atkCritBonus, 0, BANSUNG_MAX_CRIT_CHANCE);
      isCrit = effCrit > 0 && rng() < effCrit;
    }
    if (isCrit) {
      const atkCritDmgBonus = hit.atkCritDmgBonus ?? ctx?.atkCritDmgBonus ?? 0;
      cMult = (hit.critMult ?? BANSUNG_BASE_CRIT_MULT) + atkCritDmgBonus;
    }
  }

  const poisonVuln = isPoisoned(target) ? BANSUNG_POISON_VULN_MULT : 1.0;
  const extVuln = target.vulnMult ?? 1.0;
  const dmgMult = hit.dmgMult ?? 1.0;
  const drMult = target.damageReduction
    ? Math.max(0, 1 - clamp(target.damageReduction, 0, 1))
    : 1.0;

  const shieldActiveDr =
    target.shield > 0 && !hit.bypassShield && target.shieldDamageReduction
      ? 1 - clamp(target.shieldDamageReduction, 0, 0.75)
      : 1.0;

  const raw = calcBansungDamage(
    hit.baseDmg * dmgMult * drMult * shieldActiveDr,
    hit.dmgKind,
    target.armorType,
    target.flatArmor,
    {
      affinity: hit.affinity,
      armorPen: hit.armorPen,
      armorPiercePct: hit.armorPiercePct,
      critMult: cMult,
      isCrit,
      vulnMult: poisonVuln * extVuln,
    },
  );

  // Reset hero shield regeneration delay on any non-blocked hit.
  if (target.tier === 'hero') {
    const delay =
      target.regenDelayMs ??
      (target.fastShield ? BANSUNG_SHIELD.FAST_REGEN_DELAY_MS : BANSUNG_SHIELD.REGEN_DELAY_MS);
    target.shieldDelayMs = delay;
    target.shieldRegenAccMs = 0;
  }

  let shieldDmg = 0;
  let brokeShield = false;
  let rem = raw;

  if (target.shield > 0 && !hit.bypassShield) {
    const shieldMult =
      hit.dmgKind === 'energy' || hit.dmgKind === 'explosive'
        ? BANSUNG_SHIELD.BONUS_MULT_ENERGY_EXPLOSIVE
        : 1.0;
    const effAgainstShield = Math.max(1, Math.round(raw * shieldMult));
    shieldDmg = Math.min(target.shield, effAgainstShield);
    target.shield -= shieldDmg;
    brokeShield = target.shield === 0;
    rem = brokeShield ? Math.max(0, Math.round(raw * (1 - shieldDmg / effAgainstShield))) : 0;

    if (brokeShield && target.strongShield) {
      rem = 0;
    }
  }

  const hpDmg = Math.min(target.hp, rem);
  target.hp -= hpDmg;

  let killed = false;
  if (target.hp <= 0) {
    target.hp = 0;
    killed = true;
    // Leave hero `alive` to world.ts so co-op revive rules can enter `downed` vs `dead`.
    if (target.tier !== 'hero') {
      target.alive = false;
    }
  }

  if (target.tier === 'hero' && hpDmg > 0 && !hit.isDot) {
    target.hitIframesMs = BANSUNG_SHIELD.HERO_HP_IFRAMES_MS;
  }
  target.hitFlashMs = BANSUNG_SHIELD.HIT_FLASH_MS;

  let stunAppliedMs = 0;
  if (!killed && target.alive && hit.stunMs && hit.stunMs > 0) {
    stunAppliedMs = applyStunWithDR(target, hit.stunMs, ctx);
  }
  if (!killed && target.alive && hit.dotKind) {
    applyDot(target, hit.dotKind, hit.attackerId, ctx);
  }

  let flags = 0;
  if (isCrit) flags |= BANSUNG_DMG_FLAG_CRIT;
  if (shieldDmg > 0) flags |= BANSUNG_DMG_FLAG_SHIELD;
  if (brokeShield) flags |= BANSUNG_DMG_FLAG_BREAK;
  if (hit.isDot) flags |= BANSUNG_DMG_FLAG_DOT;

  let fxFlags = 0;
  if (isCrit) fxFlags |= BANSUNG_DMG_CRIT;
  if (shieldDmg > 0) fxFlags |= BANSUNG_DMG_ARMOR;
  if (stunAppliedMs > 0) fxFlags |= BANSUNG_DMG_STUN;
  if (hit.isDot && hit.dmgKind === 'fire') fxFlags |= BANSUNG_DMG_BURN;
  if (hit.isDot && hit.dmgKind === 'energy') fxFlags |= BANSUNG_DMG_SHOCK;

  const amount = hpDmg || shieldDmg;
  const totalDmg = hpDmg + shieldDmg;
  let popup: BansungDmgEvent | undefined;
  let fx: BansungFxDmgTuple | undefined;

  if (amount > 0) {
    popup = [target.id, amount, flags, dmgKindIdx];
    ctx?.popups?.push(popup);

    const numId = resolveNumId(target);
    fx = [
      FX_DMG,
      Math.round(target.x ?? 0),
      Math.round(target.y ?? 0),
      amount,
      fxFlags,
      numId,
    ];
    if (ctx?.fx) {
      ctx.fx.push(fx[0], fx[1], fx[2], fx[3], fx[4], fx[5]);
    }
  }

  return {
    hpDmg,
    shieldDmg,
    totalDmg,
    rawDmg: raw,
    blocked: false,
    isCrit,
    brokeShield,
    killed,
    stunAppliedMs,
    flags,
    fxFlags,
    dmgKindIdx,
    popup,
    fx,
  };
}

/**
 * Advances a hero's Soul Knight shield regeneration delay and 750ms `+10` regen
 * interval for `dtMs`. Returns the shield points restored this step.
 */
export function tickHeroShield(hero: BansungCombatTarget, dtMs: number): number {
  if (dtMs <= 0 || !hero.alive || hero.downed || hero.hp <= 0) {
    return 0;
  }
  if (hero.shield >= hero.maxShield) {
    hero.shieldRegenAccMs = 0;
    return 0;
  }

  const delay = hero.shieldDelayMs ?? 0;
  let remDt = dtMs;

  if (delay > 0) {
    const nextDelay = delay - dtMs <= TIME_EPS_MS ? 0 : delay - dtMs;
    const consumed = delay - nextDelay;
    hero.shieldDelayMs = nextDelay;
    remDt = Math.max(0, dtMs - consumed);
    if (nextDelay > 0 || remDt <= TIME_EPS_MS) {
      return 0;
    }
  }

  const rateMul = Math.max(0, hero.regenRateMul ?? 1);
  const regenAmount = hero.regenAmount ?? BANSUNG_SHIELD.REGEN_AMOUNT;
  let acc = (hero.shieldRegenAccMs ?? 0) + remDt * rateMul;
  let gained = 0;

  while (acc + TIME_EPS_MS >= BANSUNG_SHIELD.REGEN_INTERVAL_MS && hero.shield < hero.maxShield) {
    acc = Math.max(0, acc - BANSUNG_SHIELD.REGEN_INTERVAL_MS);
    const add = Math.min(hero.maxShield - hero.shield, regenAmount);
    hero.shield += add;
    gained += add;
  }

  hero.shieldRegenAccMs = hero.shield >= hero.maxShield ? 0 : acc;
  return gained;
}

// ============================================================================
// 4. Stun Diminishing Returns & DOT Statuses
// ============================================================================

/**
 * Applies stun duration (ms) subject to entity-tier scaling, caps, and 3-stage
 * diminishing returns (`1.0 -> 0.5 -> 0.25 -> immune`).
 *
 * Returns the applied stun duration in ms, or `0` if immune / resisted.
 */
export function applyStunWithDR(
  target: BansungCombatTarget,
  rawMs: number,
  opts?: BansungStunOptions,
): number {
  if (!target.alive || target.downed || target.hp <= 0) return 0;
  if (!Number.isFinite(rawMs) || rawMs <= 0) return 0;

  const dmgKindIdx = opts?.dmgKindIdx ?? BANSUNG_DAMAGE_KIND_INDEX.energy;

  if (target.ccImmune || (target.stunImmuneMs ?? 0) > 0 || (target.shieldBuffMs ?? 0) > 0) {
    opts?.popups?.push([target.id, 0, BANSUNG_DMG_FLAG_IMMUNE, dmgKindIdx]);
    return 0;
  }

  const stage = clamp(Math.floor(target.stunDrStage ?? 0), 0, 3);
  const mult = BANSUNG_STUN_DR.MULTS[stage] ?? 0;
  const entityMult = opts?.entityStunMult ?? 1;
  const scaled = Math.min(
    BANSUNG_STUN_DR.TIER_MAX_MS[target.tier],
    Math.round(rawMs * mult * BANSUNG_STUN_DR.TIER_MULT[target.tier] * entityMult),
  );

  if (scaled < BANSUNG_STUN_DR.MIN_SCALED_MS) {
    // Only high-DR targets (stage >= 2) earn full stun immunity on tiny micro-stuns;
    // low-DR targets stay un-immune so later legitimate stuns aren't eaten for 4s (c06).
    if (stage >= 2) {
      target.stunImmuneMs = BANSUNG_STUN_DR.IMMUNE_MS;
      opts?.popups?.push([target.id, 0, BANSUNG_DMG_FLAG_IMMUNE, dmgKindIdx]);
    }
    return 0;
  }

  if (stage >= 3) {
    target.stunImmuneMs = BANSUNG_STUN_DR.IMMUNE_MS;
    opts?.popups?.push([target.id, 0, BANSUNG_DMG_FLAG_IMMUNE, dmgKindIdx]);
    return 0;
  }

  target.stunMs = Math.max(target.stunMs ?? 0, scaled);
  target.stunDrStage = Math.min(3, stage + 1);
  target.stunDrResetMs =
    target.tier === 'boss' ? BANSUNG_STUN_DR.BOSS_RESET_MS : BANSUNG_STUN_DR.RESET_MS;

  return scaled;
}

/**
 * Applies or stacks a DOT (`burn`, `poison`, `shock`, `bleed`) onto `target`,
 * honoring `fire_ward` and `toxin_ward` perk immunities.
 *
 * Returns `true` if applied/refreshed, or `false` if blocked by ward/state.
 */
export function applyDot(
  target: BansungCombatTarget,
  kind: BansungDotKind,
  attackerId?: string,
  opts?: BansungDotApplyOptions,
): boolean {
  if (!target.alive || target.downed || target.hp <= 0) return false;
  if ((target.shieldBuffMs ?? 0) > 0) return false;

  if (kind === 'burn' && (target.fireWard || hasPerk(target, 'fire_ward'))) {
    opts?.popups?.push([
      target.id,
      0,
      BANSUNG_DMG_FLAG_IMMUNE,
      BANSUNG_DAMAGE_KIND_INDEX.fire,
    ]);
    return false;
  }

  if (kind === 'poison' && (target.toxinWard || hasPerk(target, 'toxin_ward'))) {
    opts?.popups?.push([
      target.id,
      0,
      BANSUNG_DMG_FLAG_IMMUNE,
      BANSUNG_DAMAGE_KIND_INDEX.true,
    ]);
    return false;
  }

  const cfg = BANSUNG_DOTS[kind];
  if (!target.dots) {
    target.dots = {};
  }
  const prev = target.dots[kind];
  const stacks = Math.min(cfg.maxStacks, (prev?.stacks ?? 0) + 1);
  const nextOverride =
    prev?.tickDmgOverride !== undefined && opts?.tickDmgOverride !== undefined
      ? Math.max(prev.tickDmgOverride, opts.tickDmgOverride)
      : opts?.tickDmgOverride ?? prev?.tickDmgOverride;

  target.dots[kind] = {
    stacks,
    leftMs: opts?.durMs ?? cfg.durMs,
    accMs: prev?.accMs ?? 0,
    attackerId: attackerId ?? prev?.attackerId,
    ...(nextOverride !== undefined ? { tickDmgOverride: nextOverride } : {}),
  };

  return true;
}

function findNearestShockTarget(
  source: BansungCombatTarget,
  ctx?: BansungStatusContext,
): BansungCombatTarget | undefined {
  if (source.x === undefined || source.y === undefined) return undefined;
  const candidates =
    ctx?.findShockTargets?.(source, BANSUNG_SHOCK_CHAIN_RADIUS_PX) ?? ctx?.nearbyTargets;
  if (!candidates || candidates.length === 0) return undefined;

  const isHeroSource = source.tier === 'hero';
  const maxD2 = BANSUNG_SHOCK_CHAIN_RADIUS_PX * BANSUNG_SHOCK_CHAIN_RADIUS_PX;
  let best: BansungCombatTarget | undefined;
  let bestD2 = maxD2 + 1e-6;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (!cand || cand === source || cand.id === source.id) continue;
    if (!cand.alive || cand.downed || cand.hp <= 0) continue;
    if ((cand.tier === 'hero') !== isHeroSource) continue;
    if (cand.x === undefined || cand.y === undefined) continue;

    const dx = cand.x - source.x;
    const dy = cand.y - source.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxD2 && d2 < bestD2) {
      bestD2 = d2;
      best = cand;
    }
  }

  return best;
}

/**
 * Advances flash, i-frame, stun/DR, and 500ms DOT timers on `entity` by `dtMs`.
 *
 * - Grants hero post-stun immunity (`2500ms`) the tick `stunMs` reaches `0`.
 * - Resets `stunDrStage` to `0` when `stunDrResetMs` expires.
 * - Fires 500ms DOT ticks (`burn`, `poison`, `shock`, `bleed`), including
 *   moving `+50%` bleed bonus (`speed > 20`) and single-hop `shock` chain (`<= 96px`).
 */
export function tickStatuses(
  entity: BansungCombatTarget,
  dtMs: number,
  ctx?: BansungStatusContext,
): BansungStatusTickResult {
  if (dtMs <= 0) {
    let activeDots = 0;
    if (entity.dots) {
      for (let i = 0; i < BANSUNG_DOT_KINDS.length; i++) {
        if (entity.dots[BANSUNG_DOT_KINDS[i]]) activeDots++;
      }
    }
    return { dotDmg: 0, shockChains: 0, stunExpired: false, activeDots };
  }

  if (entity.hitFlashMs && entity.hitFlashMs > 0) {
    entity.hitFlashMs = Math.max(0, entity.hitFlashMs - dtMs);
  }
  if (entity.hitIframesMs && entity.hitIframesMs > 0) {
    entity.hitIframesMs = Math.max(0, entity.hitIframesMs - dtMs);
  }
  if (entity.dashIframesMs && entity.dashIframesMs > 0) {
    entity.dashIframesMs = Math.max(0, entity.dashIframesMs - dtMs);
  }
  if (entity.shieldBuffMs && entity.shieldBuffMs > 0) {
    entity.shieldBuffMs = Math.max(0, entity.shieldBuffMs - dtMs);
  }

  if ((entity.stunImmuneMs ?? 0) > 0) {
    entity.stunImmuneMs = Math.max(0, (entity.stunImmuneMs ?? 0) - dtMs);
  }

  let stunExpired = false;
  if ((entity.stunMs ?? 0) > 0) {
    const nextStun = (entity.stunMs ?? 0) - dtMs;
    entity.stunMs = nextStun <= TIME_EPS_MS ? 0 : nextStun;
    if (entity.stunMs === 0) {
      stunExpired = true;
      if (entity.tier === 'hero') {
        entity.stunImmuneMs = Math.max(
          entity.stunImmuneMs ?? 0,
          BANSUNG_STUN_DR.HERO_POST_STUN_IMMUNE_MS,
        );
      }
    }
  }

  if ((entity.stunDrResetMs ?? 0) > 0) {
    const nextReset = (entity.stunDrResetMs ?? 0) - dtMs;
    entity.stunDrResetMs = nextReset <= TIME_EPS_MS ? 0 : nextReset;
    if (entity.stunDrResetMs === 0) {
      entity.stunDrStage = 0;
    }
  }

  if ((entity.vulnMs ?? 0) > 0) {
    const nextVuln = (entity.vulnMs ?? 0) - dtMs;
    entity.vulnMs = nextVuln <= TIME_EPS_MS ? 0 : nextVuln;
    if (entity.vulnMs === 0) {
      entity.vulnMult = 1;
    }
  } else if (entity.vulnMs === 0 && entity.vulnMult !== undefined && entity.vulnMult !== 1) {
    entity.vulnMult = 1;
  }

  if ((entity.slowMs ?? 0) > 0) {
    const nextSlow = (entity.slowMs ?? 0) - dtMs;
    entity.slowMs = nextSlow <= TIME_EPS_MS ? 0 : nextSlow;
    if (entity.slowMs === 0) {
      entity.slowPct = 0;
    }
  } else if (entity.slowMs === 0 && entity.slowPct) {
    entity.slowPct = 0;
  }

  let dotDmg = 0;
  let shockChains = 0;
  let activeDots = 0;

  if (!entity.alive || entity.downed || entity.hp <= 0 || !entity.dots) {
    return { dotDmg, shockChains, stunExpired, activeDots };
  }

  for (let i = 0; i < BANSUNG_DOT_KINDS.length; i++) {
    const kind = BANSUNG_DOT_KINDS[i];
    const entry = entity.dots[kind];
    if (!entry) continue;

    const cfg = BANSUNG_DOTS[kind];
    const effDt = Math.min(dtMs, Math.max(0, entry.leftMs));
    entry.leftMs -= dtMs;
    entry.accMs += effDt;

    while (
      entry.accMs + TIME_EPS_MS >= cfg.tickMs &&
      entity.alive &&
      !entity.downed &&
      entity.hp > 0
    ) {
      entry.accMs = Math.max(0, entry.accMs - cfg.tickMs);
      let dmg =
        entry.tickDmgOverride !== undefined
          ? entry.tickDmgOverride
          : cfg.baseDmg + (entry.stacks - 1) * cfg.stackStep;

      if (kind === 'bleed' && (entity.speed ?? 0) > BANSUNG_BLEED_MOVE_SPEED_THRESH) {
        dmg = Math.round(dmg * BANSUNG_BLEED_MOVE_MULT);
      }

      const res = applyBansungDamage(
        entity,
        {
          baseDmg: dmg,
          dmgKind: cfg.kind,
          isDot: true,
          bypassShield: entity.tier !== 'hero',
          attackerId: entry.attackerId,
        },
        ctx,
      );
      dotDmg += res.totalDmg;

      if (kind === 'shock') {
        const nearest = findNearestShockTarget(entity, ctx);
        const chainDmg = Math.round(dmg * BANSUNG_SHOCK_CHAIN_MULT);
        if (nearest && chainDmg > 0) {
          const arcRes = applyBansungDamage(
            nearest,
            {
              baseDmg: chainDmg,
              dmgKind: 'energy',
              isDot: true,
              bypassShield: nearest.tier !== 'hero',
              attackerId: entry.attackerId,
            },
            ctx,
          );
          if (!arcRes.blocked && arcRes.totalDmg > 0) {
            shockChains++;
            ctx?.shockArcs?.push({
              fromId: entity.id,
              toId: nearest.id,
              fromX: entity.x ?? 0,
              fromY: entity.y ?? 0,
              toX: nearest.x ?? 0,
              toY: nearest.y ?? 0,
              damage: arcRes.totalDmg,
            });
          }
        }
      }
    }

    if (entry.leftMs <= TIME_EPS_MS || !entity.alive || entity.downed || entity.hp <= 0) {
      delete entity.dots[kind];
    } else {
      activeDots++;
    }
  }

  return { dotDmg, shockChains, stunExpired, activeDots };
}
