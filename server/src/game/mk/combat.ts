/**
 * Authoritative 2.5D Combat Resolution:
 * - 3-Hit Basic Combo (900 ms chain window) + Animation Cancel + Dash-Attack
 * - Guard (450 ms) & Perfect Parry (180 ms window + Parry Emblem relic)
 * - Front-shield enemy mitigation (`shield_orc` -40% front damage)
 * - Relic hooks (`vampiric_fang`, `thunder_sigil`, `frost_brand`, `giant_slayer`, `phoenix_feather`, `midas_coin`)
 * - Projectiles (incl. boomerang axe), Zones, Pickups & Z-axis knock-up physics.
 */
import {
  MK_COMBO_RESET_MS,
  MK_ENEMIES,
  MK_GUARD_DURATION_MS,
  MK_HEROES,
  MK_LANE_BOTTOM,
  MK_LANE_TOP,
  MK_PARRY_WINDOW_MS,
  MK_PLAYABLE_MAX_X,
  MK_PLAYABLE_MIN_X,
  getHeroChoreoTimeline,
  getTimelineTotalMs,
  type MkDmgKind,
  type MkHeroActionId,
} from '../../../../shared/src';
import {
  addFury,
  grantFighterExp,
  recomputeFighterStats,
  relicStacks,
  type MkEnemySim,
  type MkFighterSim,
  type MkPickupSim,
  type MkProjectileSim,
  type MkSimContext,
} from './upgrades';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampToArena(x: number, y: number): { x: number; y: number } {
  return {
    x: clamp(x, MK_PLAYABLE_MIN_X, MK_PLAYABLE_MAX_X),
    y: clamp(y, MK_LANE_TOP, MK_LANE_BOTTOM),
  };
}

export function startHeroAction(fighter: MkFighterSim, actionId: MkHeroActionId): void {
  const tl = getHeroChoreoTimeline(fighter.heroId, actionId);
  const totalMs = getTimelineTotalMs(tl);
  fighter.actionId = actionId;
  fighter.actionTick = 0;
  fighter.actionElapsedMs = 0;
  fighter.actionLockMs = totalMs;
  fighter.cancelAfterMs = tl.cancelAfterMs ?? totalMs;
  if (tl.superArmor) {
    fighter.superArmorMs = Math.max(fighter.superArmorMs, totalMs);
  }
  if (tl.invulnWindow) {
    fighter.invulnMs = Math.max(fighter.invulnMs, tl.invulnWindow[1]);
  }
}

export function canStartAction(fighter: MkFighterSim, allowCancel = true): boolean {
  if (fighter.downed || fighter.left) return false;
  if (fighter.actionLockMs <= 0) return true;
  if (!allowCancel) return false;
  return fighter.actionElapsedMs >= fighter.cancelAfterMs;
}

export function getMeleeReach(fighter: MkFighterSim): number {
  const spec = MK_HEROES[fighter.heroId];
  return (
    spec.attackRange +
    (fighter.upgrades.atk - 1) * 2 +
    (fighter.heroId === 'lancer' ? fighter.upgrades.p2 * 5 : 0)
  );
}

export function getCritChance(fighter: MkFighterSim, bonus = 0): number {
  const spec = MK_HEROES[fighter.heroId];
  let chance = spec.baseCritChance + (fighter.upgrades.spd - 1) * 0.008;
  if (fighter.furyBuffMs > 0) chance += 0.2;
  if (fighter.heroId === 'lancer' && fighter.upgrades.p2 > 0) chance += fighter.upgrades.p2 * 0.03;
  if (fighter.guaranteedCritNext) return 1;
  return clamp(chance + bonus, 0, 0.9);
}

export function getCritMultiplier(fighter: MkFighterSim): number {
  return fighter.heroId === 'lancer' && fighter.upgrades.p2 > 0
    ? 1.75 + fighter.upgrades.p2 * 0.12
    : 1.75;
}

export function getEvadeChance(fighter: MkFighterSim): number {
  const spec = MK_HEROES[fighter.heroId];
  let chance = spec.baseEvadeChance + (fighter.upgrades.spd - 1) * 0.01;
  if (fighter.heroId === 'knight' && fighter.upgrades.p1 > 0) chance += fighter.upgrades.p1 * 0.05;
  if (fighter.heroId === 'rogue' && fighter.upgrades.p2 > 0) chance += fighter.upgrades.p2 * 0.04;
  if (fighter.heroId === 'mage' && fighter.upgrades.p2 > 0) chance += fighter.upgrades.p2 * 0.05;
  return clamp(chance, 0, 0.65);
}

export interface DamageEnemyOptions {
  isSkill?: boolean;
  critBonus?: number;
  armorIgnore?: number;
  kind?: MkDmgKind;
  slowMs?: number;
  slowFactor?: number;
  stunMs?: number;
  burnMs?: number;
  burnDps?: number;
  poisonMs?: number;
  poisonDps?: number;
  armorBreakMs?: number;
  knockbackX?: number;
  knockupZ?: number;
  suppressPassives?: boolean;
  suppressFury?: boolean;
  hitstopMs?: number;
}

export function damageEnemy(
  attacker: MkFighterSim,
  enemy: MkEnemySim,
  rawDamage: number,
  opts: DamageEnemyOptions,
  ctx: MkSimContext,
): number {
  if (enemy.hp <= 0) return 0;

  let dmgBase = rawDamage;

  // Giant Slayer relic (+25% dmg per stack vs Elites & Bosses)
  const giant = relicStacks(attacker, 'giant_slayer');
  if (giant > 0 && (enemy.isBoss || enemy.isElite)) {
    dmgBase *= 1 + giant * 0.25;
  }

  // Shield Orc blocks 40% damage when attacked from the front (unless armorIgnore >= 0.4)
  const eSpec = MK_ENEMIES[enemy.kind];
  let blockedFront = false;
  if (eSpec.frontShield && (opts.armorIgnore ?? 0) < 0.4) {
    const attackerInFront = (attacker.x - enemy.x) * enemy.dir > 0;
    if (attackerInFront && enemy.stunMs <= 0) {
      dmgBase *= 0.6;
      blockedFront = true;
    }
  }

  const isCrit = attacker.guaranteedCritNext || ctx.random() < getCritChance(attacker, opts.critBonus ?? 0);
  if (attacker.guaranteedCritNext) attacker.guaranteedCritNext = false;

  const armorIgnore = clamp((opts.armorIgnore ?? 0) + (enemy.armorBreakMs > 0 ? 0.3 : 0), 0, 1);
  const effDef = enemy.def * (1 - armorIgnore);
  const mitigation = 100 / (100 + effDef * 4);
  const variance = 0.94 + ctx.random() * 0.12;
  const critMult = isCrit ? getCritMultiplier(attacker) : 1;
  const dmg = Math.max(1, Math.round(dmgBase * mitigation * variance * critMult));

  const actual = Math.min(enemy.hp, dmg);
  enemy.hp -= actual;
  enemy.hitFlashMs = 130;

  attacker.combo += 1;
  attacker.comboTimerMs = 3200;
  attacker.damageDealt += actual;
  ctx.recordDamageAttribution(attacker, actual);
  if (!opts.suppressFury) {
    addFury(attacker, opts.isSkill ? 2 : 3);
  }

  // Vampiric Fang relic + Barbarian Warcry lifesteal
  const vampRatio =
    (opts.isSkill ? relicStacks(attacker, 'vampiric_fang') * 0.06 : 0) +
    (attacker.lifestealBuffMs > 0 ? 0.12 : 0);
  if (vampRatio > 0 && !attacker.downed) {
    const heal = Math.max(1, Math.round(actual * vampRatio));
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
  }

  // Frost Brand relic on crits
  if (isCrit && relicStacks(attacker, 'frost_brand') > 0) {
    enemy.slowMs = Math.max(enemy.slowMs, 2000);
    enemy.slowFactor = Math.max(enemy.slowFactor, 0.35);
  }

  if (opts.slowMs && opts.slowMs > 0) {
    enemy.slowMs = Math.max(enemy.slowMs, opts.slowMs);
    enemy.slowFactor = Math.max(enemy.slowFactor, opts.slowFactor ?? 0.35);
  }
  if (opts.stunMs && opts.stunMs > 0) {
    const stunDur = enemy.isBoss ? Math.round(opts.stunMs * 0.4) : opts.stunMs;
    enemy.stunMs = Math.max(enemy.stunMs, stunDur);
  }
  if (opts.burnMs && opts.burnMs > 0) {
    enemy.burnMs = Math.max(enemy.burnMs, opts.burnMs);
    enemy.burnDps = Math.max(enemy.burnDps, opts.burnDps ?? Math.max(6, Math.round(attacker.atk * 0.35)));
    enemy.burnOwnerId = attacker.id;
  }
  if (opts.poisonMs && opts.poisonMs > 0) {
    enemy.poisonMs = Math.max(enemy.poisonMs, opts.poisonMs);
    enemy.poisonDps = Math.max(enemy.poisonDps, opts.poisonDps ?? Math.max(6, Math.round(attacker.atk * 0.3)));
    enemy.poisonOwnerId = attacker.id;
  }
  if (opts.armorBreakMs && opts.armorBreakMs > 0) {
    enemy.armorBreakMs = Math.max(enemy.armorBreakMs, opts.armorBreakMs);
  }
  if (opts.knockbackX && !enemy.isBoss) {
    const pushed = clampToArena(enemy.x + opts.knockbackX, enemy.y);
    enemy.x = pushed.x;
    enemy.y = pushed.y;
  }
  if (opts.knockupZ && opts.knockupZ > 0 && !enemy.isBoss) {
    enemy.vz = Math.max(enemy.vz, opts.knockupZ);
  }
  if (enemy.hp > 0 && !enemy.isBoss && enemy.actionLockMs <= 0) {
    enemy.actionId = 'hit';
    enemy.actionTick = 0;
    enemy.actionLockMs = 160;
  }

  const dmgKind: MkDmgKind = opts.kind
    ? opts.kind
    : blockedFront
      ? 'block'
      : isCrit
        ? 'crit'
        : opts.isSkill
          ? 'skill'
          : 'normal';

  ctx.emitDamage(
    enemy.x,
    enemy.y,
    enemy.z,
    actual,
    dmgKind,
    blockedFront ? 'BLOCK' : isCrit ? 'CRIT!' : undefined,
    enemy.id,
  );
  ctx.emitFx({
    vfxId: 'hit_spark',
    layer: 'front',
    x: enemy.x,
    y: enemy.y,
    z: enemy.z + 14,
    dir: attacker.dir,
    radius: 20,
    tint: isCrit ? '#fde047' : undefined,
    hitstopMs: opts.hitstopMs ?? (isCrit ? 45 : 0),
  });

  // Rogue Pickpocket passive
  if (!opts.suppressPassives && attacker.heroId === 'rogue' && attacker.upgrades.p1 > 0) {
    if (ctx.random() < attacker.upgrades.p1 * 0.08) {
      const goldGain = Math.max(2, Math.round(3 + attacker.upgrades.p1 * 2));
      attacker.gold += goldGain;
      attacker.goldEarned += goldGain;
      ctx.recordGoldAttribution(attacker, goldGain);
      ctx.spawnPickup('gold', enemy.x, enemy.y, goldGain);
    }
  }

  if (enemy.hp <= 0) {
    enemy.hp = 0;
    enemy.actionId = 'dead';
    enemy.actionTick = 0;
    enemy.deadCleanupMs = enemy.isBoss ? 1000 : 520;
    addFury(attacker, enemy.isBoss ? 30 : 6);
    // Rogue Lv5 Venom Shuriken poison explosion on kill
    if (!opts.suppressPassives && enemy.poisonMs > 0 && attacker.heroId === 'rogue' && attacker.upgrades.s3 >= 5) {
      ctx.emitFx({ vfxId: 'frost_nova', layer: 'ground', x: enemy.x, y: enemy.y, dir: 1, radius: 75, tint: '#4ade80' });
      for (const other of [...ctx.enemies]) {
        if (other.id !== enemy.id && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 75) {
          damageEnemy(attacker, other, attacker.atk * 1.4, { isSkill: true, kind: 'poison', suppressPassives: true }, ctx);
        }
      }
    }
    ctx.onEnemyKilled(enemy, attacker);
  }

  return actual;
}

/**
 * Initiates Guard / Perfect Parry (`E`).
 * First `180 ms` (+70 ms per `parry_emblem` stack) is the golden Perfect Parry window.
 */
export function startGuardParry(fighter: MkFighterSim, ctx: MkSimContext): boolean {
  if (!canStartAction(fighter, true) || fighter.guardCdMs > 0) return false;
  const bonusWindow = relicStacks(fighter, 'parry_emblem') * 70;
  fighter.guardCdMs = fighter.guardMaxCdMs;
  fighter.guardMs = MK_GUARD_DURATION_MS;
  fighter.parryWindowMs = MK_PARRY_WINDOW_MS + bonusWindow;
  startHeroAction(fighter, 'guard');
  ctx.emitSfx('guard_up');
  return true;
}

/**
 * Resolves incoming damage on a hero with Priority:
 * 1) Invulnerability -> ignore
 * 2) Lancer `dragon_scale_counter` -> automatic dragon uppercut counter!
 * 3) Perfect Parry (`parryWindowMs > 0`) -> 100% block + counter shockwave + +20 Fury + -30% all skill CDs!
 * 4) Normal Guard (`guardMs > 0`) -> 65% damage reduction
 * 5) EVADE shield roll -> 100% dodge
 * 6) Shield HP absorb -> HP damage -> Phoenix Feather auto-revive check!
 */
export function damageFighter(
  fighter: MkFighterSim,
  rawDamage: number,
  attackerEnemy: MkEnemySim | undefined,
  ctx: MkSimContext,
): number {
  if (fighter.downed || fighter.left) return 0;

  // 1. Lancer Dragon Scale Counter stance
  if (fighter.counterReadyMs > 0) {
    fighter.counterReadyMs = 0;
    fighter.invulnMs = Math.max(fighter.invulnMs, 600);
    if (fighter.upgrades.s4 >= 5) {
      fighter.s4CdMs = Math.round(fighter.s4CdMs * 0.6);
    }
    startHeroAction(fighter, 'parry_ok');
    ctx.emitFx({
      vfxId: 'dragon_spirit',
      layer: 'front',
      x: fighter.x + fighter.dir * 26,
      y: fighter.y,
      dir: fighter.dir,
      radius: 115,
      tint: '#22d3ee',
      scale: 1.5,
      hitstopMs: 70,
    });
    ctx.emitSfx('parry_clang');
    const mult = 3.2 * (1 + (Math.max(1, fighter.upgrades.s4) - 1) * 0.22);
    for (const e of [...ctx.enemies]) {
      if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= 115) {
        damageEnemy(fighter, e, fighter.atk * mult, { isSkill: true, kind: 'parry', stunMs: 1200, knockupZ: 150 }, ctx);
      }
    }
    return 0;
  }

  // 2. Perfect Parry!
  if (fighter.parryWindowMs > 0) {
    fighter.parryWindowMs = 0;
    fighter.guardMs = 0;
    fighter.parries += 1;
    fighter.invulnMs = Math.max(fighter.invulnMs, 420);
    startHeroAction(fighter, 'parry_ok');
    addFury(fighter, 20);

    // Refund 30% of all active skill cooldowns
    fighter.s1CdMs = Math.round(fighter.s1CdMs * 0.7);
    fighter.s2CdMs = Math.round(fighter.s2CdMs * 0.7);
    fighter.s3CdMs = Math.round(fighter.s3CdMs * 0.7);
    fighter.s4CdMs = Math.round(fighter.s4CdMs * 0.7);

    const emblemMult = Math.pow(2, relicStacks(fighter, 'parry_emblem'));
    const counterDmg = Math.max(rawDamage * 1.8, fighter.atk * 2.2) * emblemMult;
    ctx.emitDamage(fighter.x, fighter.y, fighter.z + 18, 0, 'parry', 'PARRY!', fighter.id);
    ctx.emitFx({
      vfxId: 'parry_ring',
      layer: 'front',
      x: fighter.x,
      y: fighter.y,
      z: 14,
      dir: fighter.dir,
      radius: 85,
      tint: '#fde047',
      scale: 1.4,
      hitstopMs: 70,
    });
    ctx.emitSfx('parry_clang');

    for (const e of [...ctx.enemies]) {
      if (e.hp <= 0) continue;
      if (e === attackerEnemy || Math.hypot(e.x - fighter.x, e.y - fighter.y) <= 90) {
        damageEnemy(
          fighter,
          e,
          counterDmg,
          { isSkill: true, kind: 'parry', stunMs: 1300, knockbackX: (e.x >= fighter.x ? 1 : -1) * 32 },
          ctx,
        );
      }
    }
    return 0;
  }

  if (fighter.invulnMs > 0) return 0;

  // 3. Normal Guard (-65% damage)
  let incoming = rawDamage;
  let guarded = false;
  if (fighter.guardMs > 0) {
    incoming *= 0.35;
    guarded = true;
    addFury(fighter, 6);
  } else if (ctx.random() < getEvadeChance(fighter)) {
    // 4. EVADE shield
    fighter.evadeVisMs = 480;
    ctx.emitDamage(fighter.x, fighter.y, fighter.z + 16, 0, 'evade', 'EVADE', fighter.id);
    ctx.emitFx({
      vfxId: 'parry_ring',
      layer: 'front',
      x: fighter.x,
      y: fighter.y,
      z: 14,
      dir: fighter.dir,
      radius: 40,
      tint: '#38bdf8',
    });
    ctx.emitSfx('evade_pop');
    return 0;
  }

  const mitigation = 100 / (100 + fighter.def * 4.5);
  const dmg = Math.max(1, Math.round(incoming * mitigation));

  let remaining = dmg;
  if (fighter.shieldHp > 0) {
    const absorbed = Math.min(fighter.shieldHp, remaining);
    fighter.shieldHp -= absorbed;
    remaining -= absorbed;
  }

  const actual = Math.min(fighter.hp, remaining);
  fighter.hp -= actual;
  addFury(fighter, 8);

  if (actual > 0 && fighter.superArmorMs <= 0 && !guarded) {
    startHeroAction(fighter, 'hit');
  }

  ctx.emitDamage(
    fighter.x,
    fighter.y,
    fighter.z + 12,
    dmg,
    guarded ? 'block' : 'normal',
    guarded ? 'BLOCK' : undefined,
    fighter.id,
  );
  ctx.emitSfx(guarded ? 'guard_block' : 'hero_hit');

  // Passive retaliations (Lancer Dragon Scale / Barbarian Twist Blade)
  if (attackerEnemy && attackerEnemy.hp > 0) {
    if (fighter.heroId === 'lancer' && fighter.upgrades.p1 > 0) {
      damageEnemy(fighter, attackerEnemy, Math.max(4, Math.round(dmg * 0.15 * fighter.upgrades.p1)), { suppressPassives: true }, ctx);
    }
    if (fighter.heroId === 'barbarian' && fighter.upgrades.p2 > 0 && ctx.random() < 0.15 + fighter.upgrades.p2 * 0.08) {
      ctx.emitFx({ vfxId: 'whirlwind_360', layer: 'front', x: fighter.x, y: fighter.y, z: 12, dir: fighter.dir, radius: 70, tint: '#ef4444' });
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= 75) {
          damageEnemy(fighter, e, fighter.atk * 1.15, { suppressPassives: true, knockbackX: (e.x >= fighter.x ? 1 : -1) * 18 }, ctx);
        }
      }
    }
  }

  if (fighter.hp <= 0) {
    // Phoenix Feather relic auto-revive!
    if (fighter.phoenixCharges > 0) {
      fighter.phoenixCharges -= 1;
      fighter.hp = Math.round(fighter.maxHp * 0.6);
      fighter.invulnMs = 1500;
      ctx.emitFx({
        vfxId: 'phoenix_flame',
        layer: 'front',
        x: fighter.x,
        y: fighter.y,
        z: 10,
        dir: fighter.dir,
        radius: 110,
        tint: '#fb923c',
        scale: 1.5,
      });
      ctx.emitDamage(fighter.x, fighter.y, fighter.z + 24, fighter.hp, 'heal', 'PHOENIX!', fighter.id);
      ctx.emitSfx('revive_ok');
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= 110) {
          damageEnemy(fighter, e, fighter.atk * 2.0, { isSkill: true, knockbackX: (e.x >= fighter.x ? 1 : -1) * 45 }, ctx);
        }
      }
      return actual;
    }

    fighter.hp = 0;
    fighter.downed = true;
    fighter.reviveProgress = 0;
    startHeroAction(fighter, 'dead');
    ctx.emitSfx('hero_down');
    ctx.addLog(`💀 ${fighter.name} gục ngã! Đồng đội hãy tới gần để hồi sinh.`);
  }

  return actual;
}

/**
 * Executes 3-Hit Basic Combo (`combo1 → combo2 → combo3`) or Dash-Attack (`dash_atk`).
 */
export function performBasicAttack(fighter: MkFighterSim, ctx: MkSimContext): boolean {
  if (!canStartAction(fighter, true) || fighter.attackCdMs > 0) return false;
  recomputeFighterStats(fighter, ctx.fighters, 'none');

  const spec = MK_HEROES[fighter.heroId];
  const isDashAtk = fighter.dashActiveMs > 0;
  let actionId: MkHeroActionId;
  let dmgMult: number;

  if (isDashAtk) {
    actionId = 'dash_atk';
    dmgMult = 1.35;
    fighter.comboStep = 1;
    fighter.comboWindowMs = MK_COMBO_RESET_MS;
  } else {
    const nextStep = fighter.comboWindowMs > 0 ? (fighter.comboStep % 3) + 1 : 1;
    fighter.comboStep = nextStep;
    fighter.comboWindowMs = MK_COMBO_RESET_MS;
    actionId = nextStep === 1 ? 'combo1' : nextStep === 2 ? 'combo2' : 'combo3';
    dmgMult = spec.comboMults[nextStep - 1];
  }

  fighter.attackCdMs = Math.max(130, Math.round(spec.attackCooldownMs * (actionId === 'combo3' ? 1.15 : 0.85)));
  startHeroAction(fighter, actionId);
  const rawDmg = fighter.atk * dmgMult;
  const isFinisher = actionId === 'combo3';

  // Ranged heroes shoot crisp pixel projectiles
  if (fighter.heroId === 'archer' || fighter.heroId === 'mage') {
    const isArcher = fighter.heroId === 'archer';
    const range = spec.attackRange + (isArcher ? fighter.upgrades.p1 * 25 : 0);
    const frostLv = isArcher ? fighter.upgrades.p2 : 0;
    const count = isFinisher ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const spreadY = count === 2 ? (k === 0 ? -24 : 24) : 0;
      ctx.spawnProjectile({
        kind: isArcher ? (frostLv > 0 ? 'frost_arrow' : 'arrow') : 'arcane_bolt',
        fromEnemy: false,
        ownerFighterId: fighter.id,
        x: fighter.x + fighter.dir * 16,
        y: fighter.y,
        z: 18,
        vx: fighter.dir * (isArcher ? 420 : 340),
        vy: spreadY,
        dir: fighter.dir,
        radius: isArcher ? 12 : 15,
        damage: rawDmg * (count === 2 ? 0.72 : 1),
        isSkill: false,
        critBonus: isFinisher ? 0.12 : 0,
        armorIgnore: 0,
        pierceLeft: isArcher ? 1 + Math.floor(fighter.upgrades.p1 / 2) : 1,
        hitEnemyIds: new Set<number>(),
        aoeRadius: isArcher ? 0 : isFinisher ? 34 : 18,
        slowMs: frostLv > 0 ? 2000 : 0,
        slowFactor: frostLv > 0 ? Math.min(0.55, 0.25 + (frostLv - 1) * 0.075) : 0,
        stunMs: 0,
        burnMs: 0,
        burnDps: 0,
        poisonMs: 0,
        poisonDps: 0,
        distanceTraveled: 0,
        maxDistance: range,
      });
    }
    ctx.emitSfx(isArcher ? 'bow_shoot' : 'mage_cast');
    return true;
  }

  // Melee 2.5D belt hitbox
  const reach = getMeleeReach(fighter) + (isFinisher ? 14 : 0);
  const depthHalf = isFinisher ? 38 : 28;
  const hitTargets: MkEnemySim[] = [];

  for (const e of [...ctx.enemies]) {
    if (e.hp <= 0) continue;
    const dx = (e.x - fighter.x) * fighter.dir;
    const dy = Math.abs(e.y - fighter.y);
    if (dx >= -14 && dx <= reach + e.radius && dy <= depthHalf + e.radius * 0.45) {
      hitTargets.push(e);
    }
  }

  ctx.emitSfx(isFinisher ? 'slash_heavy' : `slash_${fighter.heroId}`);

  for (const e of hitTargets) {
    damageEnemy(
      fighter,
      e,
      rawDmg,
      {
        isSkill: false,
        critBonus: isFinisher ? 0.15 : 0,
        knockbackX: fighter.dir * (isFinisher ? 26 : 8),
        knockupZ: isFinisher ? 70 : 0,
        hitstopMs: isFinisher ? 60 : 35,
      },
      ctx,
    );
    // Rogue Twin Swordplay bonus follow-up strike
    if (fighter.heroId === 'rogue' && fighter.upgrades.p2 > 0 && e.hp > 0 && ctx.random() < fighter.upgrades.p2 * 0.1) {
      damageEnemy(fighter, e, rawDmg * 0.65, { suppressPassives: true }, ctx);
    }
  }

  // Thunder Sigil relic: 3rd combo hit chains lightning to 2 nearby enemies!
  const sigil = relicStacks(fighter, 'thunder_sigil');
  if (isFinisher && sigil > 0 && hitTargets.length > 0) {
    const anchor = hitTargets[0];
    const nearby = ctx.enemies
      .filter((e) => e.hp > 0 && e.id !== anchor.id && Math.hypot(e.x - anchor.x, e.y - anchor.y) <= 130)
      .slice(0, 2);
    if (nearby.length > 0) {
      ctx.emitFx({
        vfxId: 'lightning_bolt',
        layer: 'front',
        x: anchor.x,
        y: anchor.y,
        dir: fighter.dir,
        radius: 130,
        tint: '#facc15',
        chainTargets: nearby.map((n) => ({ x: n.x, y: n.y })),
      });
      for (const n of nearby) {
        damageEnemy(fighter, n, fighter.atk * (0.9 + sigil * 0.4), { isSkill: true, kind: 'shock', stunMs: 450 }, ctx);
      }
    }
  }

  return true;
}

export function stepProjectiles(dtMs: number, ctx: MkSimContext): void {
  const dt = dtMs * 0.001;
  const survivors: MkProjectileSim[] = [];

  for (const p of ctx.projectiles) {
    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.distanceTraveled += Math.hypot(p.x - prevX, p.y - prevY);

    if (p.boomerang && !p.boomerang.returned && p.distanceTraveled >= p.boomerang.turnDist) {
      p.boomerang.returned = true;
      p.vx = -p.vx;
      p.dir = p.dir === 1 ? -1 : 1;
      p.hitEnemyIds.clear();
    }

    if (p.distanceTraveled > p.maxDistance || p.x < -60 || p.x > 1340 || p.y < 100 || p.y > 380) {
      continue;
    }

    let consumed = false;
    if (p.fromEnemy) {
      for (const f of ctx.fighters) {
        if (f.downed || f.left) continue;
        if (Math.hypot(f.x - p.x, (f.y - p.y) * 1.4) <= p.radius + 14) {
          const attacker = p.ownerEnemyId ? ctx.enemies.find((e) => e.id === p.ownerEnemyId) : undefined;
          damageFighter(f, p.damage, attacker, ctx);
          consumed = true;
          break;
        }
      }
    } else {
      const owner = p.ownerFighterId ? ctx.fighters.find((f) => f.id === p.ownerFighterId) : undefined;
      if (owner) {
        for (const e of [...ctx.enemies]) {
          if (e.hp <= 0 || p.hitEnemyIds.has(e.id)) continue;
          if (Math.hypot(e.x - p.x, (e.y - p.y) * 1.35) <= p.radius + e.radius) {
            p.hitEnemyIds.add(e.id);
            damageEnemy(
              owner,
              e,
              p.damage,
              {
                isSkill: p.isSkill,
                critBonus: p.critBonus,
                armorIgnore: p.armorIgnore,
                slowMs: p.slowMs,
                slowFactor: p.slowFactor,
                stunMs: p.stunMs,
                burnMs: p.burnMs,
                burnDps: p.burnDps,
                poisonMs: p.poisonMs,
                poisonDps: p.poisonDps,
              },
              ctx,
            );
            if (p.aoeRadius > 0) {
              for (const other of [...ctx.enemies]) {
                if (other.id !== e.id && other.hp > 0 && Math.hypot(other.x - p.x, other.y - p.y) <= p.aoeRadius) {
                  damageEnemy(owner, other, p.damage * 0.65, { isSkill: p.isSkill, suppressPassives: true }, ctx);
                }
              }
            }
            p.pierceLeft -= 1;
            if (p.pierceLeft <= 0) {
              consumed = true;
              break;
            }
          }
        }
      }
    }

    if (!consumed) survivors.push(p);
  }
  ctx.projectiles = survivors;
}

export function stepZones(dtMs: number, ctx: MkSimContext): void {
  const active: typeof ctx.zones = [];
  for (const z of ctx.zones) {
    z.remainingMs -= dtMs;
    z.tickAccMs += dtMs;
    const owner = ctx.fighters.find((f) => f.id === z.ownerFighterId);

    // Continuous gravity pull toward center
    if (z.pullStrength && z.pullStrength > 0) {
      const pullStep = z.pullStrength * (dtMs * 0.001);
      for (const e of ctx.enemies) {
        if (e.hp <= 0) continue;
        const dx = z.x - e.x;
        const dy = z.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 6 && dist <= z.radius) {
          const factor = e.isBoss ? 0.25 : 1;
          const pos = clampToArena(e.x + (dx / dist) * pullStep * factor, e.y + (dy / dist) * pullStep * 0.7 * factor);
          e.x = pos.x;
          e.y = pos.y;
        }
      }
    }

    if (z.tickAccMs >= z.tickEveryMs) {
      z.tickAccMs -= z.tickEveryMs;
      if (owner && z.damage > 0) {
        for (const e of [...ctx.enemies]) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - z.x, (e.y - z.y) * 1.4) <= z.radius + e.radius) {
            damageEnemy(
              owner,
              e,
              z.damage,
              {
                isSkill: true,
                slowMs: z.slowMs,
                slowFactor: z.slowFactor,
                stunMs: z.stunMs,
                burnMs: z.burnMs,
                burnDps: z.burnDps,
              },
              ctx,
            );
          }
        }
      }
    }

    if (z.remainingMs <= 0) {
      if (z.explodeOnEnd && owner && (z.explodeDamage ?? 0) > 0) {
        ctx.emitFx({
          vfxId: z.kind === 'storm_snare' ? 'lightning_bolt' : 'frost_nova',
          layer: 'front',
          x: z.x,
          y: z.y,
          dir: 1,
          radius: z.radius,
          tint: z.tint ?? '#c084fc',
          scale: 1.3,
        });
        for (const e of [...ctx.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + e.radius) {
            damageEnemy(owner, e, z.explodeDamage!, { isSkill: true, stunMs: z.kind === 'decoy_clone' ? 1200 : 600 }, ctx);
          }
        }
      }
      continue;
    }
    active.push(z);
  }
  ctx.zones = active;
}

export function stepPickups(dtMs: number, ctx: MkSimContext): void {
  const dt = dtMs * 0.001;
  const kept: MkPickupSim[] = [];
  for (const pk of ctx.pickups) {
    pk.ttlMs -= dtMs;
    if (pk.ttlMs <= 0) continue;
    if (pk.z > 0 || pk.vz !== 0) {
      pk.vz -= 280 * dt;
      pk.z += pk.vz * dt;
      if (pk.z <= 0) {
        pk.z = 0;
        pk.vz = 0;
      }
    }

    let picked = false;
    for (const f of ctx.fighters) {
      if (f.downed || f.left) continue;
      const dist = Math.hypot(f.x - pk.x, f.y - pk.y);
      if (dist <= 65 && dist > 16) {
        // Gentle magnetic pull toward hero
        pk.x += ((f.x - pk.x) / dist) * 140 * dt;
        pk.y += ((f.y - pk.y) / dist) * 140 * dt;
      }
      if (dist <= 22) {
        if (pk.kind === 'gold') {
          const bonus = Math.round(pk.amount * (1 + relicStacks(f, 'midas_coin') * 0.3));
          f.gold += bonus;
          f.goldEarned += bonus;
          ctx.recordGoldAttribution(f, bonus);
          ctx.emitSfx('coin_pick');
        } else if (pk.kind === 'exp') {
          grantFighterExp(f, pk.amount, ctx);
        } else if (pk.kind === 'potion') {
          const heal = Math.round(f.maxHp * 0.28);
          f.hp = Math.min(f.maxHp, f.hp + heal);
          ctx.emitDamage(f.x, f.y, f.z + 18, heal, 'heal', undefined, f.id);
          ctx.emitSfx('heal_pop');
        } else if (pk.kind === 'fury') {
          addFury(f, 35);
          f.furyBuffMs = Math.max(f.furyBuffMs, 5000);
          ctx.emitSfx('fury_up');
        } else if (pk.kind === 'relic_chest') {
          f.gold += pk.amount;
          f.goldEarned += pk.amount;
          ctx.recordGoldAttribution(f, pk.amount);
          ctx.emitSfx('upgrade_ok');
        }
        picked = true;
        break;
      }
    }
    if (!picked) kept.push(pk);
  }
  ctx.pickups = kept;
}
