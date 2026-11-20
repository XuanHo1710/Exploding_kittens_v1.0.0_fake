/**
 * Authoritative Execution of ALL 30 Hero Skills (6 Heroes × 4 Active + 1 Awakening Ultimate)
 * with Lv3 / Lv5 Skill Evolutions, Persistent Zones, and `phantom_cloak` Relic Echoes.
 */
import {
  MK_FURY_MAX,
  MK_HEROES,
  getMkSkillSpec,
  type MkHeroActionId,
} from '../../../../shared/src';
import {
  canStartAction,
  clampToArena,
  damageEnemy,
  startHeroAction,
} from './combat';
import {
  recomputeFighterStats,
  relicStacks,
  type MkFighterSim,
  type MkSimContext,
} from './upgrades';

function getSkillCd(f: MkFighterSim, slot: 1 | 2 | 3 | 4): number {
  return slot === 1 ? f.s1CdMs : slot === 2 ? f.s2CdMs : slot === 3 ? f.s3CdMs : f.s4CdMs;
}

function setSkillCd(f: MkFighterSim, slot: 1 | 2 | 3 | 4): void {
  if (slot === 1) f.s1CdMs = f.s1MaxCdMs;
  else if (slot === 2) f.s2CdMs = f.s2MaxCdMs;
  else if (slot === 3) f.s3CdMs = f.s3MaxCdMs;
  else f.s4CdMs = f.s4MaxCdMs;
}

function getSkillLevel(f: MkFighterSim, slot: 1 | 2 | 3 | 4): number {
  return slot === 1 ? f.upgrades.s1 : slot === 2 ? f.upgrades.s2 : slot === 3 ? f.upgrades.s3 : f.upgrades.s4;
}

function schedulePhantomEcho(fighter: MkFighterSim, dmg: number, radius: number, ctx: MkSimContext): void {
  const stacks = relicStacks(fighter, 'phantom_cloak');
  if (stacks <= 0) return;
  const ex = fighter.x;
  const ey = fighter.y;
  const dir = fighter.dir;
  ctx.scheduleDelayed(200, () => {
    ctx.emitFx({
      vfxId: 'slash_cross_x',
      layer: 'front',
      x: ex + dir * 24,
      y: ey,
      z: 14,
      dir,
      radius: Math.min(110, radius),
      tint: '#c084fc',
    });
    for (const e of [...ctx.enemies]) {
      if (e.hp > 0 && Math.hypot(e.x - ex, e.y - ey) <= Math.min(120, radius)) {
        damageEnemy(fighter, e, dmg * 0.25 * stacks, { isSkill: true, suppressPassives: true }, ctx);
      }
    }
  });
}

export function executeHeroSkill(
  fighter: MkFighterSim,
  slot: 1 | 2 | 3 | 4,
  ctx: MkSimContext,
): boolean {
  if (!canStartAction(fighter, true)) return false;
  const lv = getSkillLevel(fighter, slot);
  if (lv <= 0 || getSkillCd(fighter, slot) > 0) return false;

  recomputeFighterStats(fighter, ctx.fighters, 'none');
  setSkillCd(fighter, slot);

  const spec = getMkSkillSpec(fighter.heroId, slot);
  const actionId = `skill${slot}` as MkHeroActionId;
  startHeroAction(fighter, actionId);

  const mult = spec.damageMult * (1 + (lv - 1) * 0.2);
  const baseDmg = fighter.atk * mult;
  const r = spec.radius;

  schedulePhantomEcho(fighter, baseDmg, r, ctx);

  switch (spec.id) {
    // ===================== KNIGHT (ARAGON) =====================
    case 'twist_of_fury': {
      fighter.invulnMs = Math.max(fighter.invulnMs, 600);
      const effR = lv >= 3 ? Math.round(r * 1.25) : r;
      ctx.emitFx({ vfxId: 'whirlwind_360', layer: 'front', x: fighter.x, y: fighter.y, z: 12, dir: fighter.dir, radius: effR, tint: '#60a5fa', scale: lv >= 3 ? 1.3 : 1.0, skillLevel: lv, heroId: 'knight' });
      ctx.emitSfx('skill_spin');
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - fighter.x, (e.y - fighter.y) * 1.25) <= effR) {
          const push = e.x >= fighter.x ? 1 : -1;
          damageEnemy(fighter, e, baseDmg, { isSkill: true, knockbackX: push * 34 }, ctx);
        }
      }
      if (lv >= 5) {
        ctx.emitFx({ vfxId: 'lightning_bolt', layer: 'front', x: fighter.x + fighter.dir * 42, y: fighter.y, dir: fighter.dir, radius: effR + 24, tint: '#93c5fd', skillLevel: lv });
        for (const e of [...ctx.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= effR + 24) {
            damageEnemy(fighter, e, baseDmg * 0.45, { isSkill: true, kind: 'shock', stunMs: 650 }, ctx);
          }
        }
      }
      return true;
    }

    case 'holy_judgment': {
      const dest = clampToArena(fighter.x + fighter.dir * 34, fighter.y);
      fighter.x = dest.x;
      fighter.y = dest.y;
      ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: dest.x + fighter.dir * 14, y: dest.y, dir: fighter.dir, radius: r, tint: '#fde047', scale: 1.3, skillLevel: lv, heroId: 'knight', hitstopMs: 70 });
      if (lv >= 3) {
        ctx.emitFx({ vfxId: 'ground_fissure', layer: 'ground', x: dest.x + fighter.dir * 14, y: dest.y, dir: fighter.dir, radius: r, tint: '#fef08a', skillLevel: lv });
      }
      ctx.emitSfx('skill_holy');
      const strike = (ratio: number) => {
        for (const e of [...ctx.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - (dest.x + fighter.dir * 14), (e.y - dest.y) * 1.3) <= r) {
            damageEnemy(fighter, e, baseDmg * ratio, { isSkill: true, stunMs: 1800, knockbackX: fighter.dir * 18 }, ctx);
          }
        }
      };
      strike(1.0);
      if (lv >= 5) {
        ctx.scheduleDelayed(280, () => {
          ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: dest.x + fighter.dir * 14, y: dest.y, dir: fighter.dir, radius: r + 18, tint: '#ffffff', scale: 1.5, skillLevel: lv });
          strike(0.55);
        });
      }
      return true;
    }

    case 'aegis_charge': {
      const startX = fighter.x;
      const dest = clampToArena(fighter.x + fighter.dir * 108, fighter.y);
      fighter.x = dest.x;
      fighter.y = dest.y;
      const shieldPct = lv >= 5 ? 0.25 : 0.15;
      for (const ally of ctx.fighters) {
        if (!ally.downed && !ally.left) {
          ally.shieldHp = Math.min(ally.maxHp, ally.shieldHp + Math.round(ally.maxHp * shieldPct));
        }
      }
      ctx.emitFx({ vfxId: 'parry_ring', layer: 'front', x: dest.x, y: dest.y, z: 14, dir: fighter.dir, radius: 68, tint: '#fde047', skillLevel: lv, heroId: 'knight' });
      ctx.emitSfx('skill_charge');
      const minX = Math.min(startX, dest.x) - 18;
      const maxX = Math.max(startX, dest.x) + 28;
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && e.x >= minX && e.x <= maxX && Math.abs(e.y - dest.y) <= 44) {
          damageEnemy(fighter, e, baseDmg, { isSkill: true, knockbackX: fighter.dir * 42, burnMs: lv >= 3 ? 2500 : 0 }, ctx);
        }
      }
      return true;
    }

    case 'radiant_wave': {
      const waveCount = lv >= 5 ? 5 : lv >= 3 ? 4 : 3;
      ctx.emitFx({ vfxId: 'slash_crescent', layer: 'front', x: fighter.x + fighter.dir * 24, y: fighter.y, z: 14, dir: fighter.dir, radius: 75, tint: '#fde047', scale: 1.4, skillLevel: lv, heroId: 'knight' });
      ctx.emitSfx('slash_heavy');
      for (let i = 0; i < waveCount; i++) {
        const offset = (i - (waveCount - 1) / 2) * 18;
        ctx.spawnProjectile({
          kind: 'sword_wave',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: fighter.x + fighter.dir * 20,
          y: fighter.y + offset * 0.4,
          z: 14,
          vx: fighter.dir * 410,
          vy: offset * 1.2,
          dir: fighter.dir,
          radius: 18,
          damage: baseDmg * 0.55,
          isSkill: true,
          critBonus: 0.15,
          armorIgnore: 0.25,
          pierceLeft: 6,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 0,
          slowMs: 0,
          slowFactor: 0,
          stunMs: 0,
          burnMs: lv >= 5 ? 2500 : 0,
          burnDps: Math.round(fighter.atk * 0.4),
          poisonMs: 0,
          poisonDps: 0,
          distanceTraveled: 0,
          maxDistance: r,
        });
      }
      return true;
    }

    // ===================== ARCHER (VARRICK) =====================
    case 'headshot_snipe': {
      const shots = lv >= 5 ? 2 : 1;
      ctx.emitFx({ vfxId: 'hit_spark', layer: 'front', x: fighter.x + fighter.dir * 22, y: fighter.y, z: 18, dir: fighter.dir, radius: 40, tint: '#fde047', skillLevel: lv, heroId: 'archer' });
      ctx.emitSfx('skill_snipe');
      for (let k = 0; k < shots; k++) {
        ctx.spawnProjectile({
          kind: 'pierce_arrow',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: fighter.x + fighter.dir * 18,
          y: fighter.y + (shots === 2 ? (k === 0 ? -10 : 10) : 0),
          z: 18,
          vx: fighter.dir * 660,
          vy: 0,
          dir: fighter.dir,
          radius: 18,
          damage: baseDmg * (shots === 2 ? 0.7 : 1),
          isSkill: true,
          critBonus: 0.45,
          armorIgnore: lv >= 3 ? 0.4 : 0.2,
          pierceLeft: 99,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 0,
          slowMs: fighter.upgrades.p2 > 0 ? 2000 : 0,
          slowFactor: 0.35,
          stunMs: 0,
          burnMs: 0,
          burnDps: 0,
          poisonMs: 0,
          poisonDps: 0,
          distanceTraveled: 0,
          maxDistance: 720,
        });
      }
      return true;
    }

    case 'frost_arrow_rain': {
      const targetPos = clampToArena(fighter.x + fighter.dir * 125, fighter.y);
      ctx.emitFx({ vfxId: 'frost_nova', layer: 'ground', x: targetPos.x, y: targetPos.y, dir: fighter.dir, radius: r, tint: '#38bdf8', scale: 1.35, skillLevel: lv, heroId: 'archer' });
      ctx.emitSfx('skill_frost');
      ctx.spawnZone({
        kind: 'arrow_rain',
        ownerFighterId: fighter.id,
        x: targetPos.x,
        y: targetPos.y,
        radius: r,
        remainingMs: lv >= 5 ? 3600 : 2400,
        maxMs: lv >= 5 ? 3600 : 2400,
        tickEveryMs: 450,
        tickAccMs: 450,
        damage: baseDmg * 0.35,
        slowMs: 2500,
        slowFactor: 0.5,
        stunMs: lv >= 3 ? 950 : 0,
        tint: '#38bdf8',
      });
      return true;
    }

    case 'gale_backflip': {
      const back = clampToArena(fighter.x - fighter.dir * 68, fighter.y);
      fighter.x = back.x;
      fighter.y = back.y;
      fighter.invulnMs = Math.max(fighter.invulnMs, 300);
      const fanCount = lv >= 3 ? 7 : 5;
      ctx.emitFx({ vfxId: 'whirlwind_360', layer: 'front', x: back.x + fighter.dir * 26, y: back.y, z: 10, dir: fighter.dir, radius: 68, tint: '#4ade80', skillLevel: lv, heroId: 'archer' });
      ctx.emitSfx('bow_shoot');
      const half = (fanCount - 1) / 2;
      for (let i = 0; i < fanCount; i++) {
        const angle = (i - half) * 0.14;
        ctx.spawnProjectile({
          kind: 'frost_arrow',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: back.x + fighter.dir * 16,
          y: back.y,
          z: 20,
          vx: Math.cos(angle) * 440 * fighter.dir,
          vy: Math.sin(angle) * 210,
          dir: fighter.dir,
          radius: 14,
          damage: baseDmg * 0.48,
          isSkill: true,
          critBonus: 0.12,
          armorIgnore: 0,
          pierceLeft: 2,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 0,
          slowMs: 1800,
          slowFactor: 0.35,
          stunMs: 0,
          burnMs: 0,
          burnDps: 0,
          poisonMs: 0,
          poisonDps: 0,
          distanceTraveled: 0,
          maxDistance: 360,
        });
      }
      if (lv >= 5) {
        ctx.spawnZone({
          kind: 'gravity_well',
          ownerFighterId: fighter.id,
          x: back.x + fighter.dir * 45,
          y: back.y,
          radius: 75,
          remainingMs: 1800,
          maxMs: 1800,
          tickEveryMs: 450,
          tickAccMs: 0,
          damage: baseDmg * 0.25,
          pullStrength: 60,
          tint: '#4ade80',
        });
      }
      return true;
    }

    case 'storm_snare': {
      const pos = clampToArena(fighter.x + fighter.dir * 82, fighter.y);
      ctx.emitFx({ vfxId: 'lightning_bolt', layer: 'front', x: pos.x, y: pos.y, dir: fighter.dir, radius: r, tint: '#4ade80', skillLevel: lv, heroId: 'archer' });
      ctx.emitSfx('skill_thunder');
      ctx.spawnZone({
        kind: 'storm_snare',
        ownerFighterId: fighter.id,
        x: pos.x,
        y: pos.y,
        radius: r,
        remainingMs: lv >= 3 ? 3000 : 2400,
        maxMs: lv >= 3 ? 3000 : 2400,
        tickEveryMs: 600,
        tickAccMs: 600,
        damage: baseDmg * 0.36,
        stunMs: 550,
        explodeOnEnd: lv >= 5,
        explodeDamage: baseDmg * 0.85,
        tint: '#4ade80',
      });
      return true;
    }

    // ===================== ROGUE (RAMZA) =====================
    case 'swordplay_flurry': {
      const hits = lv >= 3 ? 8 : 6;
      ctx.emitFx({ vfxId: 'slash_cross_x', layer: 'front', x: fighter.x + fighter.dir * 26, y: fighter.y, z: 14, dir: fighter.dir, radius: r, tint: '#facc15', scale: 1.25, skillLevel: lv, heroId: 'rogue' });
      ctx.emitSfx('skill_flurry');
      const perHit = baseDmg / hits;
      for (let h = 0; h < Math.min(4, hits); h++) {
        ctx.scheduleDelayed(h * 65, () => {
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - (fighter.x + fighter.dir * 24), (e.y - fighter.y) * 1.3) <= r) {
              damageEnemy(fighter, e, perHit * (hits / Math.min(4, hits)), { isSkill: true, critBonus: 0.35 }, ctx);
            }
          }
        });
      }
      if (lv >= 5) {
        ctx.scheduleDelayed(260, () => {
          ctx.emitFx({ vfxId: 'lightning_bolt', layer: 'front', x: fighter.x + fighter.dir * 38, y: fighter.y, dir: fighter.dir, radius: r + 25, tint: '#c084fc', skillLevel: lv });
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= r + 35) {
              damageEnemy(fighter, e, baseDmg * 0.45, { isSkill: true, kind: 'shock', stunMs: 600 }, ctx);
            }
          }
        });
      }
      return true;
    }

    case 'shadow_raid': {
      fighter.invulnMs = Math.max(fighter.invulnMs, 460);
      const startX = fighter.x;
      const dest = clampToArena(fighter.x + fighter.dir * 135, fighter.y);
      fighter.x = dest.x;
      fighter.y = dest.y;
      ctx.emitFx({ vfxId: 'slash_cross_x', layer: 'front', x: (startX + dest.x) * 0.5, y: dest.y, z: 16, dir: fighter.dir, radius: r, tint: '#a855f7', scale: 1.45, skillLevel: lv, heroId: 'rogue', hitstopMs: 60 });
      ctx.emitSfx('skill_shadow');
      const minX = Math.min(startX, dest.x) - 24;
      const maxX = Math.max(startX, dest.x) + 32;
      const targets = ctx.enemies.filter((e) => e.hp > 0 && e.x >= minX && e.x <= maxX && Math.abs(e.y - dest.y) <= 58);
      for (const e of targets) {
        damageEnemy(fighter, e, baseDmg, { isSkill: true, critBonus: 0.35 }, ctx);
      }
      if (lv >= 5 && targets.length > 0) {
        ctx.scheduleDelayed(240, () => {
          for (const e of targets) {
            if (e.hp > 0) damageEnemy(fighter, e, baseDmg * 0.5, { isSkill: true, kind: 'crit' }, ctx);
          }
        });
      }
      return true;
    }

    case 'venom_shuriken': {
      const count = lv >= 3 ? 7 : 5;
      ctx.emitSfx('skill_flurry');
      const half = (count - 1) / 2;
      for (let i = 0; i < count; i++) {
        const ang = (i - half) * 0.16;
        ctx.spawnProjectile({
          kind: 'shuriken',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: fighter.x + fighter.dir * 14,
          y: fighter.y,
          z: 18,
          vx: Math.cos(ang) * 420 * fighter.dir,
          vy: Math.sin(ang) * 190,
          dir: fighter.dir,
          radius: 14,
          damage: baseDmg * 0.42,
          isSkill: true,
          critBonus: 0.18,
          armorIgnore: 0,
          pierceLeft: 3,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 0,
          slowMs: 0,
          slowFactor: 0,
          stunMs: 0,
          burnMs: 0,
          burnDps: 0,
          poisonMs: 4000,
          poisonDps: Math.max(8, Math.round(fighter.atk * 0.45)),
          distanceTraveled: 0,
          maxDistance: 300,
        });
      }
      return true;
    }

    case 'mirage_decoy': {
      const oldX = fighter.x;
      const oldY = fighter.y;
      const retreat = clampToArena(fighter.x - fighter.dir * 56, fighter.y);
      fighter.x = retreat.x;
      fighter.y = retreat.y;
      fighter.invulnMs = Math.max(fighter.invulnMs, 300);
      fighter.guaranteedCritNext = true;
      ctx.emitFx({ vfxId: 'dust_puff', layer: 'front', x: oldX, y: oldY, z: 10, dir: fighter.dir, radius: 55, tint: '#c084fc', scale: 1.5, skillLevel: lv, heroId: 'rogue' });
      ctx.emitSfx('skill_shadow');
      const clones = lv >= 5 ? 2 : 1;
      for (let c = 0; c < clones; c++) {
        ctx.spawnZone({
          kind: 'decoy_clone',
          ownerFighterId: fighter.id,
          x: oldX + c * fighter.dir * 32,
          y: oldY,
          radius: r,
          remainingMs: 1500,
          maxMs: 1500,
          tickEveryMs: 1600,
          tickAccMs: 0,
          damage: 0,
          taunt: true,
          explodeOnEnd: true,
          explodeDamage: baseDmg,
          stunMs: lv >= 3 ? 1200 : 0,
          tint: '#c084fc',
        });
      }
      return true;
    }

    // ===================== BARBARIAN (CONAN) =====================
    case 'tomahawk_whirl': {
      const count = lv >= 5 ? 2 : 1;
      ctx.emitSfx('skill_axe');
      for (let k = 0; k < count; k++) {
        ctx.spawnProjectile({
          kind: 'tomahawk',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: fighter.x + fighter.dir * 18,
          y: fighter.y + (count === 2 ? (k === 0 ? -14 : 14) : 0),
          z: 16,
          vx: fighter.dir * 370,
          vy: 0,
          dir: fighter.dir,
          radius: lv >= 3 ? 28 : 22,
          damage: baseDmg * (count === 2 ? 0.72 : 1),
          isSkill: true,
          critBonus: 0.15,
          armorIgnore: 0.2,
          pierceLeft: 99,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 0,
          slowMs: 0,
          slowFactor: 0,
          stunMs: 0,
          burnMs: 2200,
          burnDps: Math.round(fighter.atk * 0.35),
          poisonMs: 0,
          poisonDps: 0,
          boomerang: { returned: false, originFighterId: fighter.id, turnDist: r },
          distanceTraveled: 0,
          maxDistance: r * 2.15,
        });
      }
      return true;
    }

    case 'earthshaker': {
      ctx.emitFx({ vfxId: 'ground_fissure', layer: 'ground', x: fighter.x + fighter.dir * 16, y: fighter.y, dir: fighter.dir, radius: r, tint: '#f97316', scale: 1.5, skillLevel: lv, heroId: 'barbarian', hitstopMs: 75 });
      ctx.emitSfx('skill_slam');
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - (fighter.x + fighter.dir * 16), (e.y - fighter.y) * 1.25) <= r) {
          damageEnemy(
            fighter,
            e,
            baseDmg,
            {
              isSkill: true,
              stunMs: 2000,
              burnMs: lv >= 3 ? 3000 : 0,
              knockupZ: lv >= 5 ? 160 : 75,
            },
            ctx,
          );
        }
      }
      return true;
    }

    case 'bloodlust_warcry': {
      fighter.furyBuffMs = Math.max(fighter.furyBuffMs, 6000);
      fighter.lifestealBuffMs = Math.max(fighter.lifestealBuffMs, 6000);
      fighter.superArmorMs = Math.max(fighter.superArmorMs, 6000);
      recomputeFighterStats(fighter, ctx.fighters, 'none');
      ctx.emitFx({ vfxId: 'aura_fury', layer: 'behind', x: fighter.x, y: fighter.y, dir: fighter.dir, radius: r, tint: '#ef4444', scale: 1.45, skillLevel: lv, heroId: 'barbarian' });
      ctx.emitSfx('skill_warcry');
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= r) {
          damageEnemy(fighter, e, baseDmg, { isSkill: true, knockbackX: (e.x >= fighter.x ? 1 : -1) * 32 }, ctx);
        }
      }
      return true;
    }

    case 'inferno_hook': {
      const pullRange = lv >= 3 ? Math.round(r * 1.4) : r;
      ctx.emitFx({ vfxId: 'slash_crescent', layer: 'front', x: fighter.x + fighter.dir * 48, y: fighter.y, z: 14, dir: fighter.dir, radius: pullRange, tint: '#f97316', scale: 1.45, skillLevel: lv, heroId: 'barbarian' });
      ctx.emitSfx('skill_axe');
      for (const e of [...ctx.enemies]) {
        if (e.hp <= 0) continue;
        const dx = (e.x - fighter.x) * fighter.dir;
        if (dx >= 0 && dx <= pullRange && Math.abs(e.y - fighter.y) <= 58) {
          if (!e.isBoss) {
            const pulled = clampToArena(fighter.x + fighter.dir * 34, fighter.y);
            e.x = pulled.x;
            e.y = pulled.y;
          }
          damageEnemy(fighter, e, baseDmg, { isSkill: true, burnMs: lv >= 5 ? 3000 : 1500, stunMs: 700 }, ctx);
        }
      }
      if (lv >= 5) {
        ctx.emitFx({ vfxId: 'fire_meteor', layer: 'front', x: fighter.x + fighter.dir * 36, y: fighter.y, dir: fighter.dir, radius: 85, tint: '#ef4444', skillLevel: lv });
      }
      return true;
    }

    // ===================== MAGE (BALTHAZAR) =====================
    case 'meteor_fireball': {
      const count = lv >= 5 ? 5 : lv >= 3 ? 4 : 3;
      const basePos = clampToArena(fighter.x + fighter.dir * 100, fighter.y);
      ctx.emitSfx('skill_meteor');
      for (let i = 0; i < count; i++) {
        const mx = clampToArena(basePos.x + (i - (count - 1) / 2) * 36, basePos.y + ((i % 2) * 24 - 12));
        ctx.scheduleDelayed(i * 110, () => {
          ctx.emitFx({ vfxId: 'fire_meteor', layer: 'front', x: mx.x, y: mx.y, dir: fighter.dir, radius: 68, tint: '#f97316', scale: 1.35, skillLevel: lv, heroId: 'mage', hitstopMs: 45 });
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - mx.x, (e.y - mx.y) * 1.25) <= 68) {
              damageEnemy(fighter, e, baseDmg * 0.55, { isSkill: true, kind: 'burn', burnMs: 3000, burnDps: Math.round(fighter.atk * 0.45) }, ctx);
            }
          }
          if (lv >= 5 && i === 0) {
            ctx.spawnZone({
              kind: 'lava_pool',
              ownerFighterId: fighter.id,
              x: basePos.x,
              y: basePos.y,
              radius: 82,
              remainingMs: 3200,
              maxMs: 3200,
              tickEveryMs: 600,
              tickAccMs: 0,
              damage: baseDmg * 0.22,
              burnMs: 2500,
              tint: '#f97316',
            });
          }
        });
      }
      return true;
    }

    case 'thunder_tempest': {
      const maxTargets = lv >= 3 ? 10 : 8;
      const targets = ctx.enemies
        .filter((e) => e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= r + 80)
        .sort((a, b) => Math.hypot(a.x - fighter.x, a.y - fighter.y) - Math.hypot(b.x - fighter.x, b.y - fighter.y))
        .slice(0, maxTargets);
      ctx.emitFx({
        vfxId: 'lightning_bolt',
        layer: 'front',
        x: fighter.x + fighter.dir * 32,
        y: fighter.y,
        dir: fighter.dir,
        radius: r,
        tint: '#c084fc',
        scale: 1.25,
        skillLevel: lv,
        heroId: 'mage',
        chainTargets: targets.map((t) => ({ x: t.x, y: t.y })),
      });
      ctx.emitSfx('skill_thunder');
      for (let i = 0; i < targets.length; i++) {
        damageEnemy(fighter, targets[i], baseDmg * (i === 0 && lv >= 5 ? 1.35 : 0.85), { isSkill: true, kind: 'shock', stunMs: 1400 }, ctx);
      }
      return true;
    }

    case 'gravity_singularity': {
      const pos = clampToArena(fighter.x + fighter.dir * 105, fighter.y);
      ctx.emitFx({ vfxId: 'gravity_vortex', layer: 'ground', x: pos.x, y: pos.y, dir: fighter.dir, radius: r, tint: '#a855f7', scale: 1.45, skillLevel: lv, heroId: 'mage' });
      ctx.emitSfx('skill_gravity');
      ctx.spawnZone({
        kind: 'gravity_well',
        ownerFighterId: fighter.id,
        x: pos.x,
        y: pos.y,
        radius: r,
        remainingMs: 2500,
        maxMs: 2500,
        tickEveryMs: 500,
        tickAccMs: 500,
        damage: baseDmg * 0.26,
        pullStrength: 135,
        slowMs: lv >= 3 ? 2000 : 0,
        slowFactor: 0.45,
        explodeOnEnd: lv >= 5,
        explodeDamage: baseDmg * 0.9,
        tint: '#a855f7',
      });
      return true;
    }

    case 'arcane_blink': {
      const oldX = fighter.x;
      const oldY = fighter.y;
      const dest = clampToArena(fighter.x + fighter.dir * 115, fighter.y);
      fighter.x = dest.x;
      fighter.y = dest.y;
      fighter.invulnMs = Math.max(fighter.invulnMs, 350);
      if (lv >= 3) {
        fighter.shieldHp = Math.min(fighter.maxHp, fighter.shieldHp + Math.round(fighter.maxHp * 0.18));
      }
      ctx.emitSfx('skill_blink');
      const nova = (nx: number, ny: number) => {
        ctx.emitFx({ vfxId: 'frost_nova', layer: 'ground', x: nx, y: ny, dir: fighter.dir, radius: r, tint: '#a855f7', scale: 1.25, skillLevel: lv, heroId: 'mage' });
        for (const e of [...ctx.enemies]) {
          if (e.hp > 0 && Math.hypot(e.x - nx, (e.y - ny) * 1.25) <= r) {
            damageEnemy(fighter, e, baseDmg, { isSkill: true, slowMs: 2200, slowFactor: 0.45 }, ctx);
          }
        }
      };
      nova(oldX, oldY);
      if (lv >= 5) nova(dest.x, dest.y);
      return true;
    }

    // ===================== LANCER (DRACO) =====================
    case 'dragon_piercer': {
      const dashDist = lv >= 3 ? Math.round(r * 1.35) : r;
      const startX = fighter.x;
      const dest = clampToArena(fighter.x + fighter.dir * dashDist, fighter.y);
      fighter.x = dest.x;
      fighter.y = dest.y;
      ctx.emitFx({ vfxId: 'dragon_spirit', layer: 'front', x: (startX + dest.x) * 0.5, y: dest.y, z: 14, dir: fighter.dir, radius: dashDist, tint: '#06b6d4', scale: 1.4, skillLevel: lv, heroId: 'lancer', hitstopMs: 55 });
      ctx.emitSfx('skill_lance');
      const minX = Math.min(startX, dest.x) - 18;
      const maxX = Math.max(startX, dest.x) + 32;
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && e.x >= minX && e.x <= maxX && Math.abs(e.y - dest.y) <= 44) {
          damageEnemy(fighter, e, baseDmg, { isSkill: true, armorIgnore: 0.5, slowMs: lv >= 5 ? 2400 : 0, slowFactor: 0.4 }, ctx);
        }
      }
      if (lv >= 5) {
        ctx.scheduleDelayed(320, () => {
          ctx.emitFx({ vfxId: 'frost_nova', layer: 'ground', x: dest.x, y: dest.y, dir: fighter.dir, radius: 80, tint: '#22d3ee', skillLevel: lv });
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - dest.x, e.y - dest.y) <= 85) {
              damageEnemy(fighter, e, baseDmg * 0.45, { isSkill: true, slowMs: 2000 }, ctx);
            }
          }
        });
      }
      return true;
    }

    case 'trilance_nova': {
      const count = lv >= 5 ? 5 : lv >= 3 ? 4 : 3;
      ctx.emitSfx('skill_lance');
      const half = (count - 1) / 2;
      for (let i = 0; i < count; i++) {
        const ang = (i - half) * 0.16;
        ctx.spawnProjectile({
          kind: 'soul_lance',
          fromEnemy: false,
          ownerFighterId: fighter.id,
          x: fighter.x + fighter.dir * 18,
          y: fighter.y,
          z: 20,
          vx: Math.cos(ang) * 430 * fighter.dir,
          vy: Math.sin(ang) * 165,
          dir: fighter.dir,
          radius: 16,
          damage: baseDmg * 0.52,
          isSkill: true,
          critBonus: 0.15,
          armorIgnore: 0.35,
          pierceLeft: 3,
          hitEnemyIds: new Set<number>(),
          aoeRadius: 42,
          slowMs: lv >= 5 ? 1800 : 0,
          slowFactor: 0.35,
          stunMs: 0,
          burnMs: 0,
          burnDps: 0,
          poisonMs: 0,
          poisonDps: 0,
          distanceTraveled: 0,
          maxDistance: 340,
        });
      }
      return true;
    }

    case 'hundred_thrust': {
      const thrusts = lv >= 3 ? 9 : 7;
      ctx.emitFx({ vfxId: 'dragon_spirit', layer: 'front', x: fighter.x + fighter.dir * 36, y: fighter.y, z: 14, dir: fighter.dir, radius: r, tint: '#38bdf8', scale: 1.25, skillLevel: lv, heroId: 'lancer' });
      ctx.emitSfx('skill_flurry');
      for (const e of [...ctx.enemies]) {
        const dx = (e.x - fighter.x) * fighter.dir;
        if (e.hp > 0 && dx >= -10 && dx <= r + e.radius && Math.abs(e.y - fighter.y) <= 44) {
          damageEnemy(fighter, e, baseDmg * (1 + (thrusts - 7) * 0.12), { isSkill: true, armorBreakMs: 5000, knockbackX: fighter.dir * (lv >= 5 ? 36 : 14) }, ctx);
        }
      }
      return true;
    }

    case 'dragon_scale_counter': {
      fighter.counterReadyMs = 800;
      if (lv >= 3) {
        fighter.shieldHp = Math.min(fighter.maxHp, fighter.shieldHp + Math.round(fighter.maxHp * 0.2));
      }
      ctx.emitFx({ vfxId: 'parry_ring', layer: 'front', x: fighter.x, y: fighter.y, z: 14, dir: fighter.dir, radius: 55, tint: '#06b6d4', skillLevel: lv, heroId: 'lancer' });
      ctx.emitSfx('guard_up');
      return true;
    }

    default:
      return false;
  }
}

/**
 * Executes the Awakening Ultimate (`R`) when Fury === 100.
 * Emits a concise 0.45s Cut-In Banner event without freezing Co-op allies!
 */
export function executeHeroUltimate(fighter: MkFighterSim, ctx: MkSimContext): boolean {
  if (!canStartAction(fighter, true) || fighter.fury < MK_FURY_MAX) return false;
  recomputeFighterStats(fighter, ctx.fighters, 'none');

  const spec = MK_HEROES[fighter.heroId];
  const ult = spec.ultimate;
  fighter.fury = 0;
  fighter.invulnMs = Math.max(fighter.invulnMs, 1000);
  fighter.superArmorMs = Math.max(fighter.superArmorMs, 1000);
  startHeroAction(fighter, 'ultimate');

  ctx.emitUltCutIn({
    fighterId: fighter.id,
    heroId: fighter.heroId,
    heroName: spec.codeName,
    skillNameVi: ult.nameVi,
    accentColor: spec.accentColor,
  });
  ctx.emitFx({
    vfxId: 'magic_rune_25d',
    layer: 'ground',
    x: fighter.x,
    y: fighter.y,
    dir: fighter.dir,
    radius: 90,
    tint: spec.accentColor,
    scale: 1.6,
    heroId: fighter.heroId,
  });
  ctx.emitSfx('ultimate_cast');

  const ultDmg = fighter.atk * ult.damageMult;

  switch (ult.id) {
    case 'excalibur_ascendant': {
      // Giant sky sword + heal party 25% HP
      for (const ally of ctx.fighters) {
        if (!ally.downed && !ally.left) {
          const heal = Math.round(ally.maxHp * 0.25);
          ally.hp = Math.min(ally.maxHp, ally.hp + heal);
          ctx.emitDamage(ally.x, ally.y, ally.z + 20, heal, 'heal', undefined, ally.id);
        }
      }
      ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: fighter.x + fighter.dir * 38, y: fighter.y, dir: fighter.dir, radius: ult.radius, tint: '#fde047', scale: 2.0, hitstopMs: 85, heroId: 'knight' });
      ctx.emitFx({ vfxId: 'ground_fissure', layer: 'ground', x: fighter.x + fighter.dir * 38, y: fighter.y, dir: fighter.dir, radius: ult.radius, tint: '#fde047', scale: 1.8 });
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= ult.radius) {
          damageEnemy(fighter, e, ultDmg, { isSkill: true, suppressFury: true, critBonus: 0.3, stunMs: 2200, knockupZ: 120 }, ctx);
        }
      }
      return true;
    }

    case 'tempest_phoenix': {
      ctx.emitFx({ vfxId: 'phoenix_flame', layer: 'front', x: fighter.x + fighter.dir * 52, y: fighter.y, z: 18, dir: fighter.dir, radius: ult.radius, tint: '#fb923c', scale: 1.8, hitstopMs: 80, heroId: 'archer' });
      ctx.spawnProjectile({
        kind: 'phoenix_wave',
        fromEnemy: false,
        ownerFighterId: fighter.id,
        x: fighter.x + fighter.dir * 20,
        y: fighter.y,
        z: 18,
        vx: fighter.dir * 500,
        vy: 0,
        dir: fighter.dir,
        radius: 68,
        damage: ultDmg,
        isSkill: true,
        critBonus: 0.4,
        armorIgnore: 0.4,
        pierceLeft: 99,
        hitEnemyIds: new Set<number>(),
        aoeRadius: 0,
        slowMs: 0,
        slowFactor: 0,
        stunMs: 1200,
        burnMs: 4000,
        burnDps: Math.round(fighter.atk * 0.7),
        poisonMs: 0,
        poisonDps: 0,
        distanceTraveled: 0,
        maxDistance: 720,
      });
      return true;
    }

    case 'eclipse_omnislash': {
      for (let i = 0; i < 4; i++) {
        ctx.scheduleDelayed(i * 95, () => {
          const ox = (i % 2 === 0 ? 1 : -1) * (24 + i * 16);
          ctx.emitFx({ vfxId: 'slash_cross_x', layer: 'front', x: fighter.x + ox, y: fighter.y + (i - 1.5) * 18, z: 16, dir: fighter.dir, radius: ult.radius, tint: i % 2 === 0 ? '#c084fc' : '#facc15', scale: 1.75, hitstopMs: i === 3 ? 85 : 0 });
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - fighter.x, e.y - fighter.y) <= ult.radius) {
              damageEnemy(fighter, e, ultDmg * 0.3, { isSkill: true, suppressFury: true, critBonus: 0.55 }, ctx);
            }
          }
        });
      }
      return true;
    }

    case 'volcanic_cataclysm': {
      for (let i = 0; i < 5; i++) {
        const gx = clampToArena(fighter.x + (i - 2) * 58, fighter.y + (i % 2 === 0 ? -18 : 18));
        ctx.scheduleDelayed(i * 90, () => {
          ctx.emitFx({ vfxId: 'fire_meteor', layer: 'front', x: gx.x, y: gx.y, dir: fighter.dir, radius: 95, tint: '#f97316', scale: 1.7, hitstopMs: i === 2 ? 85 : 0 });
          ctx.emitFx({ vfxId: 'ground_fissure', layer: 'ground', x: gx.x, y: gx.y, dir: fighter.dir, radius: 95, tint: '#ef4444', scale: 1.4 });
          for (const e of [...ctx.enemies]) {
            if (e.hp > 0 && Math.hypot(e.x - gx.x, e.y - gx.y) <= 105) {
              damageEnemy(fighter, e, ultDmg * 0.42, { isSkill: true, suppressFury: true, burnMs: 3500, stunMs: 1400, knockupZ: 175 }, ctx);
            }
          }
        });
      }
      return true;
    }

    case 'astral_supernova': {
      const center = clampToArena(fighter.x + fighter.dir * 90, fighter.y);
      ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: center.x, y: center.y, dir: fighter.dir, radius: ult.radius, tint: '#c084fc', scale: 2.1, hitstopMs: 85, heroId: 'mage' });
      ctx.emitFx({ vfxId: 'gravity_vortex', layer: 'ground', x: center.x, y: center.y, dir: fighter.dir, radius: ult.radius, tint: '#fde047', scale: 1.8 });
      for (const e of [...ctx.enemies]) {
        if (e.hp > 0 && Math.hypot(e.x - center.x, e.y - center.y) <= ult.radius) {
          damageEnemy(fighter, e, ultDmg, { isSkill: true, suppressFury: true, kind: 'shock', stunMs: 1800, armorIgnore: 0.4 }, ctx);
        }
      }
      return true;
    }

    case 'azure_dragon_descent': {
      ctx.emitFx({ vfxId: 'dragon_spirit', layer: 'front', x: fighter.x + fighter.dir * 52, y: fighter.y, z: 16, dir: fighter.dir, radius: ult.radius, tint: '#22d3ee', scale: 1.9, hitstopMs: 85, heroId: 'lancer' });
      ctx.spawnProjectile({
        kind: 'dragon_wave',
        fromEnemy: false,
        ownerFighterId: fighter.id,
        x: fighter.x + fighter.dir * 20,
        y: fighter.y,
        z: 16,
        vx: fighter.dir * 470,
        vy: 0,
        dir: fighter.dir,
        radius: 64,
        damage: ultDmg,
        isSkill: true,
        critBonus: 0.35,
        armorIgnore: 0.6,
        pierceLeft: 99,
        hitEnemyIds: new Set<number>(),
        aoeRadius: 0,
        slowMs: 3500,
        slowFactor: 0.55,
        stunMs: 1500,
        burnMs: 0,
        burnDps: 0,
        poisonMs: 0,
        poisonDps: 0,
        distanceTraveled: 0,
        maxDistance: 720,
      });
      return true;
    }

    default:
      return false;
  }
}
