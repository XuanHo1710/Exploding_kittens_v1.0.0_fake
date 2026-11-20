/**
 * Fighter/Enemy/Zone/Projectile simulation models, EXP/Level/Stat/Skill upgrades,
 * and 12 Roguelite Pixel Relic calculations (`server/src/game/mk/upgrades.ts`).
 */
import {
  MK_FURY_MAX,
  MK_GUARD_COOLDOWN_MS,
  MK_HEROES,
  MK_MAX_SKILL_LEVEL,
  MK_MAX_STAT_LEVEL,
  MK_RELICS,
  getMkSkillSpec,
  getMkUpgradeCost,
  type MkAnyEnemyId,
  type MkDmgKind,
  type MkEnemyActionId,
  type MkFxEvent,
  type MkHeroActionId,
  type MkHeroId,
  type MkPickupKind,
  type MkProjectileKind,
  type MkRelicId,
  type MkUltCutInEvent,
  type MkUpgradeLevels,
  type MkUpgradeTarget,
  type MkZoneKind,
} from '../../../../shared/src';

export interface MkFighterSim {
  id: string;
  ownerId?: string;
  originalIsCom: boolean;
  badge: string;
  name: string;
  heroId: MkHeroId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  dir: 1 | -1;
  actionId: MkHeroActionId;
  actionTick: number;
  actionElapsedMs: number;
  actionLockMs: number;
  cancelAfterMs: number;
  comboStep: number;
  comboWindowMs: number;
  inputMx: number;
  inputMy: number;
  holdingAtk: boolean;
  hp: number;
  maxHp: number;
  shieldHp: number;
  atk: number;
  def: number;
  spd: number;
  fury: number;
  level: number;
  exp: number;
  expToNext: number;
  gold: number;
  goldEarned: number;
  sp: number;
  kills: number;
  parries: number;
  damageDealt: number;
  combo: number;
  comboTimerMs: number;
  attackCdMs: number;
  dashCdMs: number;
  dashMaxCdMs: number;
  dashActiveMs: number;
  dashVx: number;
  dashVy: number;
  guardCdMs: number;
  guardMaxCdMs: number;
  guardMs: number;
  parryWindowMs: number;
  s1CdMs: number;
  s1MaxCdMs: number;
  s2CdMs: number;
  s2MaxCdMs: number;
  s3CdMs: number;
  s3MaxCdMs: number;
  s4CdMs: number;
  s4MaxCdMs: number;
  invulnMs: number;
  superArmorMs: number;
  furyBuffMs: number;
  lifestealBuffMs: number;
  guaranteedCritNext: boolean;
  counterReadyMs: number;
  evadeVisMs: number;
  downed: boolean;
  reviveProgress: number;
  left: boolean;
  upgrades: MkUpgradeLevels;
  relics: Map<MkRelicId, number>;
  phoenixCharges: number;
  pendingRelicChoices?: MkRelicId[];
}

export interface MkEnemySim {
  id: number;
  kind: MkAnyEnemyId;
  isBoss: boolean;
  isElite: boolean;
  name?: string;
  x: number;
  y: number;
  z: number;
  vz: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  actionId: MkEnemyActionId;
  actionTick: number;
  actionLockMs: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  speed: number;
  radius: number;
  attackRange: number;
  attackCdMs: number;
  attackMaxCdMs: number;
  specialCdMs: number;
  bossPhase: 1 | 2 | 3;
  hitFlashMs: number;
  slowMs: number;
  slowFactor: number;
  burnMs: number;
  burnDps: number;
  burnTickMs: number;
  burnOwnerId?: string;
  poisonMs: number;
  poisonDps: number;
  poisonTickMs: number;
  poisonOwnerId?: string;
  stunMs: number;
  armorBreakMs: number;
  telegraphMs: number;
  telegraphX?: number;
  telegraphY?: number;
  telegraphR?: number;
  telegraphKind?: 'slam' | 'meteor' | 'charge' | 'bomber';
  expReward: number;
  goldReward: number;
  scoreReward: number;
  deadCleanupMs: number;
}

export interface MkZoneSim {
  id: number;
  kind: MkZoneKind;
  ownerFighterId: string;
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
  maxMs: number;
  tickEveryMs: number;
  tickAccMs: number;
  damage: number;
  slowMs?: number;
  slowFactor?: number;
  stunMs?: number;
  burnMs?: number;
  burnDps?: number;
  pullStrength?: number;
  explodeOnEnd?: boolean;
  explodeDamage?: number;
  taunt?: boolean;
  tint?: string;
}

export interface MkProjectileSim {
  id: number;
  kind: MkProjectileKind;
  fromEnemy: boolean;
  ownerFighterId?: string;
  ownerEnemyId?: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  dir: 1 | -1;
  radius: number;
  damage: number;
  isSkill: boolean;
  critBonus: number;
  armorIgnore: number;
  pierceLeft: number;
  hitEnemyIds: Set<number>;
  aoeRadius: number;
  slowMs: number;
  slowFactor: number;
  stunMs: number;
  burnMs: number;
  burnDps: number;
  poisonMs: number;
  poisonDps: number;
  boomerang?: { returned: boolean; originFighterId: string; turnDist: number };
  distanceTraveled: number;
  maxDistance: number;
  tint?: string;
}

export interface MkPickupSim {
  id: number;
  kind: MkPickupKind;
  x: number;
  y: number;
  z: number;
  vz: number;
  amount: number;
  ttlMs: number;
}

export interface MkDelayedAction {
  remainingMs: number;
  fn: () => void;
}

export interface MkSimContext {
  fighters: MkFighterSim[];
  enemies: MkEnemySim[];
  zones: MkZoneSim[];
  projectiles: MkProjectileSim[];
  pickups: MkPickupSim[];
  random: () => number;
  spawnProjectile: (p: Omit<MkProjectileSim, 'id'>) => MkProjectileSim;
  spawnZone: (z: Omit<MkZoneSim, 'id'>) => MkZoneSim;
  spawnPickup: (kind: MkPickupKind, x: number, y: number, amount: number) => MkPickupSim;
  emitDamage: (
    x: number,
    y: number,
    z: number,
    amount: number,
    kind: MkDmgKind,
    label?: string,
    targetId?: string | number,
  ) => void;
  emitFx: (fx: Omit<MkFxEvent, 'id'>) => void;
  emitUltCutIn: (ev: Omit<MkUltCutInEvent, 'id'>) => void;
  emitSfx: (name: string) => void;
  scheduleDelayed: (delayMs: number, fn: () => void) => void;
  onEnemyKilled: (enemy: MkEnemySim, killer?: MkFighterSim) => void;
  recordDamageAttribution: (attacker: MkFighterSim, amount: number) => void;
  recordGoldAttribution: (fighter: MkFighterSim, amount: number) => void;
  addLog: (msg: string) => void;
}

export function expToNextForLevel(level: number): number {
  const lv = Math.max(1, level);
  return Math.round(90 + (lv - 1) * 65 + (lv - 1) * (lv - 1) * 18);
}

export function relicStacks(fighter: MkFighterSim, id: MkRelicId): number {
  return fighter.relics.get(id) ?? 0;
}

export function grantRelicToFighter(fighter: MkFighterSim, id: MkRelicId): boolean {
  const spec = MK_RELICS[id];
  if (!spec) return false;
  const cur = fighter.relics.get(id) ?? 0;
  if (cur >= spec.maxStacks) return false;
  fighter.relics.set(id, cur + 1);
  if (id === 'phoenix_feather') fighter.phoenixCharges += 1;
  if (id === 'aegis_rune') {
    fighter.shieldHp = Math.min(fighter.maxHp, fighter.shieldHp + Math.round(fighter.maxHp * 0.2));
  }
  return true;
}

export function addFury(fighter: MkFighterSim, rawAmount: number): void {
  if (fighter.downed || fighter.left) return;
  const mult = 1 + relicStacks(fighter, 'fury_core') * 0.35;
  fighter.fury = Math.min(MK_FURY_MAX, fighter.fury + rawAmount * mult);
}

export function recomputeFighterStats(
  fighter: MkFighterSim,
  allFighters: readonly MkFighterSim[],
  healMode: 'none' | 'keep_ratio' | 'add_delta' = 'none',
): void {
  const spec = MK_HEROES[fighter.heroId];
  const prevMaxHp = fighter.maxHp;

  const lvBonus = fighter.level - 1;
  const maxHp = Math.round(spec.baseHp + (fighter.upgrades.hp - 1) * spec.hpPerUpgrade + lvBonus * 22);
  let atk = spec.baseAtk + (fighter.upgrades.atk - 1) * spec.atkPerUpgrade + lvBonus * 3.5;
  let def = spec.baseDef + (fighter.upgrades.def - 1) * spec.defPerUpgrade + lvBonus * 1.2;
  const spd = spec.baseSpd + (fighter.upgrades.spd - 1) * spec.spdPerUpgrade + lvBonus * 1.5;

  // Barbarian Brutality passive
  if (fighter.heroId === 'barbarian' && fighter.upgrades.p1 > 0 && maxHp > 0) {
    const missingRatio = Math.max(0, Math.min(1, 1 - fighter.hp / maxHp));
    const maxBonus = Math.min(0.6, 0.2 + (fighter.upgrades.p1 - 1) * 0.1);
    atk *= 1 + missingRatio * maxBonus;
  }

  // Barbarian Warcry / Fury buff
  if (fighter.furyBuffMs > 0) atk *= 1.35;

  // Knight Valor Aura & Mage Mana Surge party passives
  let valorAuraDef = 0;
  let cdrPct = 0;
  let warcryAura = false;
  for (const ally of allFighters) {
    if (ally.downed || ally.left) continue;
    const dist = Math.hypot(ally.x - fighter.x, ally.y - fighter.y);
    if (dist > 220) continue;
    if (ally.heroId === 'knight' && ally.upgrades.p2 > 0) {
      valorAuraDef = Math.max(valorAuraDef, ally.upgrades.p2 * 3);
    }
    if (ally.heroId === 'mage' && ally.upgrades.p1 > 0) {
      cdrPct = Math.max(cdrPct, ally.upgrades.p1 * 0.05);
    }
    if (ally.heroId === 'barbarian' && ally.furyBuffMs > 0 && ally.upgrades.s3 >= 3 && ally.id !== fighter.id) {
      warcryAura = true;
    }
  }
  if (warcryAura) atk *= 1.15;

  // Lancer Dragon Scale passive
  if (fighter.heroId === 'lancer' && fighter.upgrades.p1 > 0) {
    def += fighter.upgrades.p1 * 3;
  }

  // Relics: Midas Coin (+5% ATK per 500 gold per stack) & Combo Master
  const midas = relicStacks(fighter, 'midas_coin');
  if (midas > 0) {
    const tiers = Math.min(12, Math.floor(fighter.gold / 500));
    atk *= 1 + tiers * 0.05 * midas;
  }
  const comboRelic = relicStacks(fighter, 'combo_master');
  if (comboRelic > 0 && fighter.combo >= 15) {
    const bonus = Math.min(0.4, Math.floor(fighter.combo / 15) * 0.04 * comboRelic);
    atk *= 1 + bonus;
  }

  // Cooldown reduction from Mana Surge + Chrono Crystal (capped at 50%)
  const chrono = relicStacks(fighter, 'chrono_crystal') * 0.14;
  const totalCdr = Math.min(0.5, cdrPct + chrono);
  const cdMult = 1 - totalCdr;

  fighter.maxHp = maxHp;
  fighter.atk = Math.round(atk);
  fighter.def = Math.round(def + valorAuraDef);
  fighter.spd = Math.round(spd);

  fighter.dashMaxCdMs = Math.max(700, Math.round(spec.dashCooldownMs * cdMult));
  fighter.guardMaxCdMs = Math.max(600, Math.round(MK_GUARD_COOLDOWN_MS * cdMult));
  fighter.s1MaxCdMs = Math.max(1500, Math.round(getMkSkillSpec(fighter.heroId, 1).cooldownMs * cdMult));
  fighter.s2MaxCdMs = Math.max(2000, Math.round(getMkSkillSpec(fighter.heroId, 2).cooldownMs * cdMult));
  fighter.s3MaxCdMs = Math.max(2200, Math.round(getMkSkillSpec(fighter.heroId, 3).cooldownMs * cdMult));
  fighter.s4MaxCdMs = Math.max(2500, Math.round(getMkSkillSpec(fighter.heroId, 4).cooldownMs * cdMult));

  if (healMode === 'add_delta' && !fighter.downed) {
    const delta = Math.max(0, maxHp - prevMaxHp);
    fighter.hp = Math.min(maxHp, fighter.hp + delta);
  } else if (healMode === 'keep_ratio' && prevMaxHp > 0 && !fighter.downed) {
    fighter.hp = Math.max(1, Math.min(maxHp, Math.round((fighter.hp / prevMaxHp) * maxHp)));
  } else {
    fighter.hp = Math.min(maxHp, fighter.hp);
  }
}

export function grantFighterExp(fighter: MkFighterSim, exp: number, ctx: MkSimContext): boolean {
  if (fighter.left || exp <= 0) return false;
  fighter.exp += exp;
  let leveled = false;
  while (fighter.exp >= fighter.expToNext) {
    fighter.exp -= fighter.expToNext;
    fighter.level += 1;
    fighter.sp += 1;
    fighter.expToNext = expToNextForLevel(fighter.level);
    leveled = true;
    recomputeFighterStats(fighter, ctx.fighters, 'add_delta');
    if (!fighter.downed) {
      fighter.hp = fighter.maxHp;
    }
    ctx.emitFx({
      vfxId: 'holy_pillar',
      layer: 'behind',
      x: fighter.x,
      y: fighter.y,
      dir: fighter.dir,
      radius: 44,
      tint: '#fde047',
      scale: 0.9,
      heroId: fighter.heroId,
    });
    ctx.emitDamage(fighter.x, fighter.y, fighter.z + 24, fighter.level, 'heal', `LV ${fighter.level}`, fighter.id);
    ctx.emitSfx('level_up');
  }
  return leveled;
}

export function applyUpgradeCommand(
  fighter: MkFighterSim,
  target: MkUpgradeTarget,
  ctx: MkSimContext,
): { ok: boolean; reason?: string } {
  if (fighter.left) return { ok: false, reason: 'fighter_left' };
  const current = fighter.upgrades[target];
  const isStat = target === 'atk' || target === 'hp' || target === 'def' || target === 'spd';
  const maxLv = isStat ? MK_MAX_STAT_LEVEL : MK_MAX_SKILL_LEVEL;
  if (current >= maxLv) return { ok: false, reason: 'max_level' };

  const cost = getMkUpgradeCost(fighter.heroId, target, current);
  // Allow paying with SP (1 SP unlocks/upgrades any skill or passive for free!) or Gold
  if (!isStat && fighter.sp > 0) {
    fighter.sp -= 1;
  } else if (fighter.gold >= cost) {
    fighter.gold -= cost;
  } else {
    return { ok: false, reason: 'insufficient_gold' };
  }

  fighter.upgrades[target] = current + 1;
  recomputeFighterStats(fighter, ctx.fighters, target === 'hp' ? 'add_delta' : 'none');
  ctx.emitSfx('upgrade_ok');
  ctx.emitFx({
    vfxId: 'aura_fury',
    layer: 'behind',
    x: fighter.x,
    y: fighter.y,
    dir: fighter.dir,
    radius: 36,
    tint: '#fde047',
  });
  return { ok: true };
}
