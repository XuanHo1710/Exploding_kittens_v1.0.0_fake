import { ElementType } from '../contracts/protocol';

/**
 * Pure TypeScript Stat, Progression & Combat Math (Single Source of Truth)
 * Incorporates BLG-BAL-001 (RSK-003) P1 Boss TTK Pacing Calibration:
 *   - Tuned attribute ATK weights (0.85*STR + 0.45*DEX or 0.85*INT) so Weapon Enhancement +0..+10
 *     provides ~55% of endgame ATK and Boss fights hit the thrilling 120-210s 3-phase target.
 */

export interface RawHeroStats {
  hp: number;
  mp: number;
  stamina: number;
  atk: number;
  def: number;
  str: number;
  agi: number;
  int: number;
  vit: number;
  dex: number;
  luk: number;
  critRate: number;
  critDamage: number;
  attackSpeed: number;
  moveSpeed: number;
  cdr: number;
}

export interface ComputedStats extends RawHeroStats {
  combatRating: number;
}

export function expRequiredForNextLevel(level: number): number {
  if (level >= 100) return 0;
  return Math.floor(100 * Math.pow(level, 1.55) + 45 * level);
}

export function enhancementMultiplier(level: number): number {
  const table = [1.0, 1.12, 1.25, 1.4, 1.58, 1.78, 2.02, 2.3, 2.62, 3.0, 3.45];
  const clamped = Math.max(0, Math.min(10, Math.floor(level)));
  return table[clamped];
}

export function enhancedWeaponAtk(baseAtk: number, enhancementLevel: number): number {
  return Math.round(baseAtk * enhancementMultiplier(enhancementLevel) + enhancementLevel * 6.5);
}

export function computeCharacterStats(params: {
  baseStats: RawHeroStats;
  growthPerLevel: Partial<RawHeroStats>;
  level: number;
  allocatedPoints?: Partial<Pick<RawHeroStats, 'str' | 'agi' | 'int' | 'vit' | 'dex' | 'luk'>>;
  equipmentBonus?: Partial<RawHeroStats>;
  foodAtkPct?: number;
  isMagicClass?: boolean;
}): ComputedStats {
  const lvGain = Math.max(0, params.level - 1);
  const g = params.growthPerLevel;
  const a = params.allocatedPoints || {};
  const eq = params.equipmentBonus || {};

  const str = Math.round(params.baseStats.str + (g.str || 0) * lvGain + (a.str || 0) + (eq.str || 0));
  const agi = Math.round(params.baseStats.agi + (g.agi || 0) * lvGain + (a.agi || 0) + (eq.agi || 0));
  const intStat = Math.round(params.baseStats.int + (g.int || 0) * lvGain + (a.int || 0) + (eq.int || 0));
  const vit = Math.round(params.baseStats.vit + (g.vit || 0) * lvGain + (a.vit || 0) + (eq.vit || 0));
  const dex = Math.round(params.baseStats.dex + (g.dex || 0) * lvGain + (a.dex || 0) + (eq.dex || 0));
  const luk = Math.round(params.baseStats.luk + (g.luk || 0) * lvGain + (a.luk || 0) + (eq.luk || 0));

  const hp = Math.round(params.baseStats.hp + (g.hp || 0) * lvGain + vit * 14 + (eq.hp || 0));
  const mp = Math.round(params.baseStats.mp + (g.mp || 0) * lvGain + intStat * 5 + (eq.mp || 0));
  const stamina = Math.round(params.baseStats.stamina + (g.stamina || 0) * lvGain + agi * 1.5 + (eq.stamina || 0));

  // BLG-BAL-001 balanced attribute weights
  const attrAtk = params.isMagicClass ? intStat * 0.85 + dex * 0.35 : str * 0.85 + dex * 0.45;
  const rawAtk = params.baseStats.atk + (g.atk || 0) * lvGain + attrAtk + (eq.atk || 0);
  const atk = Math.round(rawAtk * (1 + (params.foodAtkPct || 0)));
  const def = Math.round(params.baseStats.def + (g.def || 0) * lvGain + vit * 0.8 + (eq.def || 0));

  // Hard anti-power-creep caps (combat-formulas.md)
  const critRate = Math.min(0.75, Number((params.baseStats.critRate + (g.critRate || 0) * lvGain + luk * 0.002 + dex * 0.001 + (eq.critRate || 0)).toFixed(4)));
  const critDamage = Math.min(2.75, Number((params.baseStats.critDamage + (g.critDamage || 0) * lvGain + (eq.critDamage || 0)).toFixed(4)));
  const attackSpeed = Math.min(2.2, Number((params.baseStats.attackSpeed + (g.attackSpeed || 0) * lvGain + agi * 0.002 + (eq.attackSpeed || 0)).toFixed(4)));
  const moveSpeed = Math.min(280, Math.round(params.baseStats.moveSpeed + agi * 0.35 + (eq.moveSpeed || 0)));
  const cdr = Math.min(0.4, Number((params.baseStats.cdr + (g.cdr || 0) * lvGain + intStat * 0.001 + (eq.cdr || 0)).toFixed(4)));

  const combatRating = Math.round(
    atk * 3.8 + def * 2.2 + hp * 0.25 + mp * 0.4 + critRate * 400 + (critDamage - 1) * 180 + cdr * 300,
  );

  return {
    hp,
    mp,
    stamina,
    atk,
    def,
    str,
    agi,
    int: intStat,
    vit,
    dex,
    luk,
    critRate,
    critDamage,
    attackSpeed,
    moveSpeed,
    cdr,
    combatRating,
  };
}

const ELEMENT_ADVANTAGE: Partial<Record<ElementType, ElementType>> = {
  FIRE: 'FROST',
  FROST: 'WIND',
  WIND: 'EARTH',
  EARTH: 'LIGHTNING',
  LIGHTNING: 'WATER',
  WATER: 'FIRE',
  LIGHT: 'SHADOW',
  SHADOW: 'LIGHT',
};

export function elementMultiplier(attackEl: ElementType, defenderWeakness?: ElementType, defenderRes = 0): number {
  let mult = 1.0;
  if (defenderWeakness && attackEl === defenderWeakness) mult = 1.25;
  else if (defenderWeakness && ELEMENT_ADVANTAGE[attackEl] === defenderWeakness) mult = 1.15;
  const clampedRes = Math.max(-0.5, Math.min(0.75, defenderRes));
  return mult * (1 - clampedRes);
}

export function computeDamageHit(params: {
  attackerAtk: number;
  attackerLevel: number;
  baseDamage: number;
  scalingRatio: number;
  critRate: number;
  critDamage: number;
  defenderDef: number;
  attackElement: ElementType;
  defenderWeakness?: ElementType;
  defenderElementRes?: number;
  isStaggered?: boolean;
  staggerMult?: number;
  isBlocked?: boolean;
  rngValue: number; // deterministic 0..1 from server CSPRNG
}): { damage: number; isCrit: boolean } {
  const raw = params.baseDamage + params.attackerAtk * params.scalingRatio;
  const defConst = 100 + 12 * Math.max(1, params.attackerLevel);
  const defMult = defConst / (defConst + Math.max(0, params.defenderDef));
  const elMult = elementMultiplier(params.attackElement, params.defenderWeakness, params.defenderElementRes || 0);
  const isCrit = params.rngValue < params.critRate;
  const critMult = isCrit ? params.critDamage : 1.0;
  const stagMult = params.isStaggered ? (params.staggerMult || 1.4) : 1.0;
  const blockMult = params.isBlocked ? 0.35 : 1.0;
  const finalDamage = Math.max(1, Math.round(raw * defMult * elMult * critMult * stagMult * blockMult));
  return { damage: finalDamage, isCrit };
}
