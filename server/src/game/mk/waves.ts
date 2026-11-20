/**
 * Wave Director, 4 Biomes, 8 Tactical Enemy AI Archetypes,
 * 4 Three-Phase Bosses (66% / 33% Enrage + 2.5D Telegraphs) & Netherghost Treasure Drops.
 */
import {
  MK_BIOME_LABELS,
  MK_ENEMIES,
  MK_LANE_BOTTOM,
  MK_LANE_TOP,
  MK_PLAYABLE_MAX_X,
  MK_PLAYABLE_MIN_X,
  getMkBiomeForWave,
  getMkBossForWave,
  getMkRegularPoolForWave,
  getMkWaveScale,
  isMkBossWave,
  isMkMiniBossWave,
  type MkAnyEnemyId,
  type MkBiome,
  type MkConfig,
} from '../../../../shared/src';
import { clampToArena, damageEnemy, damageFighter } from './combat';
import type { MkEnemySim, MkFighterSim, MkSimContext } from './upgrades';

export class MkWaveDirector {
  wave = 0;
  biome: MkBiome = 'grasslands';
  totalWaveEnemies = 0;
  private spawnQueue: Array<{ kind: MkAnyEnemyId; isElite: boolean }> = [];
  private spawnTimerMs = 0;
  private nextEnemyId = 1;

  constructor(private readonly config: MkConfig) {
    this.biome = getMkBiomeForWave(1, config.biome);
  }

  prepareWave(wave: number, partySize: number, random: () => number): {
    biome: MkBiome;
    isBoss: boolean;
    banner: string;
  } {
    this.wave = wave;
    this.biome = getMkBiomeForWave(wave, this.config.biome);
    this.spawnQueue = [];
    this.spawnTimerMs = 250;

    const bossWave = isMkBossWave(wave, this.config.playMode);
    const miniBossWave = isMkMiniBossWave(wave, this.config.playMode);
    const pool = getMkRegularPoolForWave(wave);

    if (this.config.playMode === 'boss_rush') {
      const bossId = getMkBossForWave(wave, 'boss_rush');
      this.spawnQueue.push({ kind: bossId, isElite: true });
      for (let i = 0; i < 3 + partySize; i++) {
        this.spawnQueue.push({ kind: pool[Math.floor(random() * pool.length)], isElite: false });
      }
      this.totalWaveEnemies = this.spawnQueue.length;
      return {
        biome: this.biome,
        isBoss: true,
        banner: `BOSS RUSH ${wave}/4 · ${MK_ENEMIES[bossId].nameVi.toUpperCase()}`,
      };
    }

    const baseCount = Math.min(28, 6 + wave * 2 + Math.max(0, partySize - 1) * 2);
    for (let i = 0; i < baseCount; i++) {
      const kind = pool[Math.floor(random() * pool.length)];
      this.spawnQueue.push({ kind, isElite: false });
    }
    if (miniBossWave) {
      this.spawnQueue.push({ kind: 'bone_brute', isElite: true });
      this.spawnQueue.push({ kind: 'tribal_shaman', isElite: true });
    }
    if (bossWave) {
      const bossId = getMkBossForWave(wave, 'endless');
      this.spawnQueue.unshift({ kind: bossId, isElite: true });
    }
    if (wave >= 2 && (wave % 2 === 0 || random() < 0.35)) {
      this.spawnQueue.push({ kind: 'nether_ghost', isElite: false });
    }

    this.totalWaveEnemies = this.spawnQueue.length;
    const banner = bossWave
      ? `BOSS WAVE ${wave} · ${MK_ENEMIES[getMkBossForWave(wave, 'endless')].nameVi.toUpperCase()}`
      : `WAVE ${wave} · ${MK_BIOME_LABELS[this.biome].toUpperCase()}`;
    return { biome: this.biome, isBoss: bossWave, banner };
  }

  get remainingToSpawn(): number {
    return this.spawnQueue.length;
  }

  stepSpawning(dtMs: number, partySize: number, ctx: MkSimContext): void {
    if (this.spawnQueue.length === 0) return;
    const aliveCap = 12 + partySize * 2;
    const alive = ctx.enemies.filter((e) => e.hp > 0).length;
    if (alive >= aliveCap) return;

    this.spawnTimerMs -= dtMs;
    if (this.spawnTimerMs > 0) return;
    this.spawnTimerMs = this.config.playMode === 'boss_rush' ? 950 : Math.max(420, 900 - this.wave * 24);

    const next = this.spawnQueue.shift();
    if (!next) return;
    const spawned = this.createEnemy(next.kind, next.isElite, partySize, ctx.random);
    ctx.enemies.push(spawned);
    if (spawned.isBoss) {
      ctx.emitSfx('boss_roar');
      ctx.addLog(`🔥 Đại Boss ${spawned.name} xuất trận!`);
    }
  }

  createEnemy(
    kind: MkAnyEnemyId,
    isElite: boolean,
    partySize: number,
    random: () => number,
    overridePos?: { x: number; y: number },
  ): MkEnemySim {
    const spec = MK_ENEMIES[kind];
    const scale = getMkWaveScale(this.wave || 1, partySize, this.config.difficulty);
    const eliteMult = isElite && !spec.isBoss ? 1.75 : 1;
    const bossRushMult = this.config.playMode === 'boss_rush' && spec.isBoss ? 1.25 : 1;

    const fromRight = spec.isBoss ? true : random() < 0.72;
    const sx = overridePos?.x ?? (fromRight ? MK_PLAYABLE_MAX_X - 18 : MK_PLAYABLE_MIN_X + 18);
    const sy =
      overridePos?.y ??
      Math.round(MK_LANE_TOP + 20 + random() * (MK_LANE_BOTTOM - MK_LANE_TOP - 40));

    const maxHp = Math.round(spec.baseHp * scale.hpMult * eliteMult * bossRushMult);
    const atk = Math.round(spec.baseAtk * scale.atkMult * (isElite && !spec.isBoss ? 1.25 : 1));

    return {
      id: this.nextEnemyId++,
      kind,
      isBoss: spec.isBoss,
      isElite: isElite || spec.isElite,
      name: spec.nameVi,
      x: sx,
      y: sy,
      z: 0,
      vz: 0,
      vx: 0,
      vy: 0,
      dir: fromRight ? -1 : 1,
      actionId: 'walk',
      actionTick: 0,
      actionLockMs: 0,
      hp: maxHp,
      maxHp,
      atk,
      def: spec.baseDef,
      speed: spec.speed,
      radius: spec.radius,
      attackRange: spec.attackRange,
      attackCdMs: 500 + Math.round(random() * 450),
      attackMaxCdMs: spec.attackCooldownMs,
      specialCdMs: spec.isBoss ? 3200 : 4200,
      bossPhase: 1,
      hitFlashMs: 0,
      slowMs: 0,
      slowFactor: 0,
      burnMs: 0,
      burnDps: 0,
      burnTickMs: 0,
      poisonMs: 0,
      poisonDps: 0,
      poisonTickMs: 0,
      stunMs: 0,
      armorBreakMs: 0,
      telegraphMs: 0,
      expReward: Math.round(spec.expReward * scale.rewardMult * eliteMult),
      goldReward: Math.round(spec.goldReward * scale.rewardMult * eliteMult),
      scoreReward: Math.round(spec.scoreReward * eliteMult),
      deadCleanupMs: 0,
    };
  }
}

export function handleSpecialDrops(enemy: MkEnemySim, ctx: MkSimContext): void {
  const spec = MK_ENEMIES[enemy.kind];
  if (spec.netherGhost) {
    for (let i = 0; i < 4; i++) {
      ctx.spawnPickup('gold', enemy.x + (i - 1.5) * 14, enemy.y + (i % 2 ? -8 : 8), Math.round(enemy.goldReward * 0.4));
    }
    ctx.spawnPickup('potion', enemy.x, enemy.y - 10, 1);
    ctx.spawnPickup('fury', enemy.x + 10, enemy.y + 8, 35);
    ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: enemy.x, y: enemy.y, dir: 1, radius: 60, tint: '#fde047' });
    return;
  }

  ctx.spawnPickup('gold', enemy.x, enemy.y, enemy.goldReward);
  if (enemy.isBoss) {
    ctx.spawnPickup('relic_chest', enemy.x, enemy.y + 8, 85);
    ctx.spawnPickup('potion', enemy.x - 16, enemy.y, 1);
    ctx.spawnPickup('fury', enemy.x + 16, enemy.y, 40);
  } else if (ctx.random() < 0.14) {
    ctx.spawnPickup(ctx.random() < 0.6 ? 'potion' : 'fury', enemy.x + 8, enemy.y, 1);
  }
}

function nearestTargetForEnemy(enemy: MkEnemySim, ctx: MkSimContext): { x: number; y: number; fighter?: MkFighterSim } | null {
  // Rogue decoy clone taunts nearby non-boss enemies
  if (!enemy.isBoss) {
    const decoy = ctx.zones.find((z) => z.taunt && Math.hypot(z.x - enemy.x, z.y - enemy.y) <= 220);
    if (decoy) return { x: decoy.x, y: decoy.y };
  }
  let best: MkFighterSim | null = null;
  let bestD = Infinity;
  for (const f of ctx.fighters) {
    if (f.downed || f.left) continue;
    const d = Math.hypot(f.x - enemy.x, f.y - enemy.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best ? { x: best.x, y: best.y, fighter: best } : null;
}

export function stepEnemies(dtMs: number, ctx: MkSimContext): void {
  const dt = dtMs * 0.001;
  const kept: MkEnemySim[] = [];

  for (const e of ctx.enemies) {
    e.actionTick += 1;

    // Knock-up Z gravity
    if (e.z > 0 || e.vz !== 0) {
      e.vz -= 420 * dt;
      e.z += e.vz * dt;
      if (e.z <= 0) {
        e.z = 0;
        e.vz = 0;
      }
    }

    if (e.hp <= 0) {
      e.deadCleanupMs -= dtMs;
      if (e.deadCleanupMs > 0) kept.push(e);
      continue;
    }

    if (e.hitFlashMs > 0) e.hitFlashMs = Math.max(0, e.hitFlashMs - dtMs);
    if (e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - dtMs);
    if (e.stunMs > 0) e.stunMs = Math.max(0, e.stunMs - dtMs);
    if (e.armorBreakMs > 0) e.armorBreakMs = Math.max(0, e.armorBreakMs - dtMs);
    if (e.actionLockMs > 0) e.actionLockMs = Math.max(0, e.actionLockMs - dtMs);
    if (e.attackCdMs > 0) e.attackCdMs = Math.max(0, e.attackCdMs - dtMs);
    if (e.specialCdMs > 0) e.specialCdMs = Math.max(0, e.specialCdMs - dtMs);

    // Burn & Poison DoT ticks
    if (e.burnMs > 0) {
      e.burnMs = Math.max(0, e.burnMs - dtMs);
      e.burnTickMs += dtMs;
      if (e.burnTickMs >= 500) {
        e.burnTickMs -= 500;
        const owner = ctx.fighters.find((f) => f.id === e.burnOwnerId) ?? ctx.fighters[0];
        if (owner) damageEnemy(owner, e, Math.max(4, Math.round(e.burnDps * 0.5)), { kind: 'burn', suppressPassives: true }, ctx);
        if (e.hp <= 0) { kept.push(e); continue; }
      }
    }
    if (e.poisonMs > 0) {
      e.poisonMs = Math.max(0, e.poisonMs - dtMs);
      e.poisonTickMs += dtMs;
      if (e.poisonTickMs >= 500) {
        e.poisonTickMs -= 500;
        const owner = ctx.fighters.find((f) => f.id === e.poisonOwnerId) ?? ctx.fighters[0];
        if (owner) damageEnemy(owner, e, Math.max(4, Math.round(e.poisonDps * 0.5)), { kind: 'poison', suppressPassives: true }, ctx);
        if (e.hp <= 0) { kept.push(e); continue; }
      }
    }

    // 3-Phase Boss transitions at 66% & 33% HP
    if (e.isBoss) {
      const ratio = e.hp / Math.max(1, e.maxHp);
      const nextPhase: 1 | 2 | 3 = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
      if (nextPhase > e.bossPhase) {
        e.bossPhase = nextPhase;
        e.actionId = 'enrage';
        e.actionTick = 0;
        e.actionLockMs = 620;
        e.telegraphMs = 0;
        ctx.emitFx({ vfxId: 'ground_fissure', layer: 'ground', x: e.x, y: e.y, dir: e.dir, radius: 130, tint: '#ef4444', scale: 1.6 });
        ctx.emitSfx('boss_roar');
        ctx.addLog(`🔥 ${e.name} chuyển sang Giai đoạn ${nextPhase}!`);
      }
    }

    // Resolve active Boss/Bomber telegraph countdown
    if (e.telegraphMs > 0) {
      e.telegraphMs = Math.max(0, e.telegraphMs - dtMs);
      if (e.telegraphMs === 0) {
        const tx = e.telegraphX ?? e.x;
        const ty = e.telegraphY ?? e.y;
        const tr = e.telegraphR ?? 58;
        if (e.telegraphKind === 'bomber') {
          ctx.emitFx({ vfxId: 'fire_meteor', layer: 'front', x: e.x, y: e.y, dir: e.dir, radius: tr, tint: '#f97316', scale: 1.35 });
          ctx.emitSfx('skill_meteor');
          for (const f of ctx.fighters) {
            if (!f.downed && !f.left && Math.hypot(f.x - e.x, f.y - e.y) <= tr) {
              damageFighter(f, e.atk * 1.45, e, ctx);
            }
          }
          e.hp = 0;
          e.actionId = 'dead';
          e.actionTick = 0;
          e.deadCleanupMs = 380;
          ctx.onEnemyKilled(e, undefined);
          kept.push(e);
          continue;
        } else {
          e.actionId = e.telegraphKind === 'slam' ? 'slam' : 'special';
          e.actionTick = 0;
          e.actionLockMs = 420;
          ctx.emitFx({
            vfxId: e.telegraphKind === 'meteor' ? 'fire_meteor' : 'ground_fissure',
            layer: 'front',
            x: tx,
            y: ty,
            dir: e.dir,
            radius: tr,
            tint: '#ef4444',
            scale: 1.55,
          });
          ctx.emitSfx('skill_slam');
          for (const f of ctx.fighters) {
            if (!f.downed && !f.left && Math.hypot(f.x - tx, (f.y - ty) * 1.3) <= tr) {
              damageFighter(f, e.atk * (1.25 + (e.bossPhase - 1) * 0.2), e, ctx);
            }
          }
        }
        e.telegraphX = undefined;
        e.telegraphY = undefined;
        e.telegraphR = undefined;
        e.telegraphKind = undefined;
      }
      kept.push(e);
      continue;
    }

    if (e.stunMs > 0 || e.actionLockMs > 0) {
      kept.push(e);
      continue;
    }

    const spec = MK_ENEMIES[e.kind];
    const target = nearestTargetForEnemy(e, ctx);
    if (!target) {
      e.actionId = 'idle';
      kept.push(e);
      continue;
    }

    const speedMult = e.slowMs > 0 ? Math.max(0.35, 1 - e.slowFactor) : 1;
    const effSpd = e.speed * speedMult * (e.isBoss ? 1 + (e.bossPhase - 1) * 0.14 : 1);

    // Netherghost flees from heroes!
    if (spec.netherGhost) {
      const dx = e.x - target.x;
      const dy = e.y - target.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const pos = clampToArena(e.x + (dx / dist) * effSpd * dt, e.y + (dy / dist) * effSpd * 0.6 * dt);
      e.x = pos.x;
      e.y = pos.y;
      e.dir = dx >= 0 ? 1 : -1;
      e.actionId = 'walk';
      kept.push(e);
      continue;
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);
    e.dir = dx >= 0 ? 1 : -1;

    // Boss telegraph special cadence (faster in Phase 2 & 3)
    if (e.isBoss && e.specialCdMs <= 0) {
      e.specialCdMs = Math.max(2100, 4600 - (e.bossPhase - 1) * 1100);
      e.actionId = 'windup';
      e.actionTick = 0;
      e.telegraphMs = Math.max(700, 1050 - (e.bossPhase - 1) * 150);
      e.telegraphX = target.x;
      e.telegraphY = target.y;
      e.telegraphR = 62 + (e.bossPhase - 1) * 12;
      e.telegraphKind = e.kind === 'boss_lava_golem' || e.kind === 'boss_elder_shaman' ? 'meteor' : 'slam';
      kept.push(e);
      continue;
    }

    // Bomber Imp starts armed fuse telegraph when close (Parryable!)
    if (spec.bomber && dist <= e.attackRange + 16) {
      e.actionId = 'windup';
      e.actionTick = 0;
      e.telegraphMs = 650;
      e.telegraphX = e.x;
      e.telegraphY = e.y;
      e.telegraphR = 54;
      e.telegraphKind = 'bomber';
      kept.push(e);
      continue;
    }

    // Shaman healer pulse
    if (spec.healer && e.specialCdMs <= 0) {
      const injured = ctx.enemies.find((o) => o.id !== e.id && o.hp > 0 && o.hp < o.maxHp * 0.8 && Math.hypot(o.x - e.x, o.y - e.y) <= 180);
      if (injured) {
        e.specialCdMs = 5500;
        e.actionId = 'special';
        e.actionTick = 0;
        e.actionLockMs = 420;
        const heal = Math.round(injured.maxHp * 0.22);
        injured.hp = Math.min(injured.maxHp, injured.hp + heal);
        ctx.emitDamage(injured.x, injured.y, 18, heal, 'heal', undefined, injured.id);
        kept.push(e);
        continue;
      }
    }

    // Attack if within range
    if (dist <= e.attackRange + 12 && Math.abs(dy) <= (spec.ranged ? 85 : 32)) {
      if (e.attackCdMs <= 0) {
        e.attackCdMs = Math.round(e.attackMaxCdMs * (e.isBoss ? 1 - (e.bossPhase - 1) * 0.14 : 1));
        e.actionId = 'attack';
        e.actionTick = 0;
        e.actionLockMs = 360;
        if (spec.ranged) {
          const norm = Math.max(1, dist);
          ctx.spawnProjectile({
            kind: e.isBoss
              ? e.kind === 'boss_lava_golem'
                ? 'boss_boulder'
                : e.kind === 'boss_abyss_lord'
                  ? 'boss_shadow_blade'
                  : 'boss_fireball'
              : spec.frostShot
                ? 'frost_arrow'
                : 'shaman_hex',
            fromEnemy: true,
            ownerEnemyId: e.id,
            x: e.x + e.dir * 16,
            y: e.y,
            z: 16,
            vx: (dx / norm) * 235,
            vy: (dy / norm) * 165,
            dir: e.dir,
            radius: e.isBoss ? 16 : 11,
            damage: e.atk,
            isSkill: false,
            critBonus: 0,
            armorIgnore: 0,
            pierceLeft: 1,
            hitEnemyIds: new Set<number>(),
            aoeRadius: 0,
            slowMs: spec.frostShot ? 1800 : 0,
            slowFactor: 0.3,
            stunMs: 0,
            burnMs: 0,
            burnDps: 0,
            poisonMs: 0,
            poisonDps: 0,
            distanceTraveled: 0,
            maxDistance: 420,
          });
        } else if (target.fighter) {
          damageFighter(target.fighter, e.atk, e, ctx);
        }
      } else {
        e.actionId = 'idle';
      }
    } else {
      // Approach target smoothly in 2.5D belt lane
      const norm = Math.max(1, dist);
      const pos = clampToArena(e.x + (dx / norm) * effSpd * dt, e.y + (dy / norm) * effSpd * 0.72 * dt);
      e.x = pos.x;
      e.y = pos.y;
      e.actionId = 'walk';
    }

    kept.push(e);
  }

  ctx.enemies = kept;
}
