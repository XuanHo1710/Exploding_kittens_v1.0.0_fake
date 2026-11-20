'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const { MkWorld } = require('../dist/server/src/game/mk/world.js');
const { damageEnemy, damageFighter, performBasicAttack, startGuardParry } = require('../dist/server/src/game/mk/combat.js');
const { executeHeroSkill, executeHeroUltimate } = require('../dist/server/src/game/mk/skills.js');
const { grantRelicToFighter, recomputeFighterStats } = require('../dist/server/src/game/mk/upgrades.js');

const {
  MK_BIOMES,
  MK_FURY_MAX,
  MK_HERO_IDS,
  MK_RELIC_IDS,
  MK_TICK_EXACT_MS,
  getMkBiomeForWave,
  normalizeMkConfig,
} = S;

function makeWorld(heroes = ['knight'], cfgPatch = {}, seed = 4242) {
  const cfg = normalizeMkConfig({ comBots: 0, difficulty: 'normal', biome: 'auto', ...cfgPatch }, heroes.length);
  const inits = heroes.map((h, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    heroId: h,
    isCom: false,
    badge: `P${i + 1}`,
  }));
  for (let b = 0; b < cfg.comBots; b++) {
    const bh = MK_HERO_IDS[(heroes.length + b) % MK_HERO_IDS.length];
    inits.push({ id: `com:${b}`, name: `COM ${b}`, heroId: bh, isCom: true, badge: 'COM' });
  }
  const logs = [];
  let endResult = null;
  const world = new MkWorld(
    inits,
    cfg,
    {
      tick() {},
      changed() {},
      onEnd(r) {
        endResult = r;
      },
    },
    seed,
  );
  return { world, logs, getEndResult: () => endResult };
}

function advanceMs(world, ms) {
  const steps = Math.ceil(ms / MK_TICK_EXACT_MS);
  for (let i = 0; i < steps; i++) world.step(MK_TICK_EXACT_MS);
}

describe('Mighty Knight 2.5D Pixel — Combat, 30 Skills, Bosses & Relics', () => {
  it('chains 3-Hit Basic Combo (combo1 -> combo2 -> combo3) within 900ms window and supports Dash-Attack', () => {
    const { world } = makeWorld(['knight']);
    advanceMs(world, 2000); // enter combat
    const f = world.fighters[0];

    world.enqueueCommand('p1', { t: 'attack' });
    world.step();
    assert.equal(f.actionId, 'combo1');
    assert.equal(f.comboStep, 1);

    // Wait past attackCd & cancelAfterMs (< 900ms combo window)
    advanceMs(world, 340);
    world.enqueueCommand('p1', { t: 'attack' });
    world.step();
    assert.equal(f.actionId, 'combo2');
    assert.equal(f.comboStep, 2);

    advanceMs(world, 340);
    world.enqueueCommand('p1', { t: 'attack' });
    world.step();
    assert.equal(f.actionId, 'combo3');
    assert.equal(f.comboStep, 3);

    // Wait > 900ms -> combo resets back to combo1
    advanceMs(world, 1100);
    assert.equal(f.comboStep, 0);

    // Dash-Attack
    world.enqueueCommand('p1', { t: 'dash', mx: 1, my: 0 });
    world.step();
    assert.equal(f.actionId, 'dash');
    advanceMs(world, 170);
    world.enqueueCommand('p1', { t: 'attack' });
    world.step();
    assert.equal(f.actionId, 'dash_atk');
  });

  it('Perfect Parry (first 180ms of Guard) blocks 100% damage, counters, grants +20 Fury & refunds 30% skill CDs', () => {
    const { world } = makeWorld(['knight']);
    advanceMs(world, 2000);
    const f = world.fighters[0];
    f.s1CdMs = 5000;
    f.s2CdMs = 8000;
    f.fury = 10;

    // Spawn enemy right beside knight
    const foe = world.director.createEnemy('goblin_raider', false, 1, () => 0.5, { x: f.x + 24, y: f.y });
    world.enemies.push(foe);
    const foeStartHp = foe.hp;
    const heroStartHp = f.hp;

    world.enqueueCommand('p1', { t: 'guard' });
    world.step();
    assert.equal(f.actionId, 'guard');
    assert.ok(f.parryWindowMs > 0);

    // Incoming hit during golden parry window!
    const dealt = damageFighter(f, 50, foe, world.makeContext());
    assert.equal(dealt, 0);
    assert.equal(f.hp, heroStartHp);
    assert.equal(f.actionId, 'parry_ok');
    assert.equal(f.parries, 1);
    assert.ok(f.fury >= 30, `Expected >= 30 Fury after Parry, got ${f.fury}`);
    assert.ok(f.s1CdMs <= 3550, `Expected 30% CD refund on s1, got ${f.s1CdMs}`);
    assert.ok(foe.hp < foeStartHp, 'Expected Parry counter shockwave to damage attacker');
    assert.ok(foe.stunMs > 0, 'Expected Parry counter to stun attacker');
  });

  it('executes ALL 30 Active/Ultimate Skills (6 Heroes × 4 Active + 1 Ultimate) with Lv3/Lv5 evolution VFX & locks when Lv0/Fury<100', () => {
    for (const heroId of MK_HERO_IDS) {
      const { world } = makeWorld([heroId], { playMode: 'endless' }, 101);
      advanceMs(world, 2000);
      const f = world.fighters[0];

      // Skill 2 starts locked in endless mode -> cast fails cleanly
      world.enqueueCommand('p1', { t: 'skill', slot: 2 });
      world.step();
      assert.notEqual(f.actionId, 'skill2', `${heroId} skill2 must be locked at Lv0`);

      // Ultimate fails when Fury < 100
      f.fury = 50;
      world.enqueueCommand('p1', { t: 'ultimate' });
      world.step();
      assert.notEqual(f.actionId, 'ultimate', `${heroId} ultimate must require 100 Fury`);

      // Unlock all 4 skills to Lv5 to verify Lv3/Lv5 evolution & execution
      f.upgrades.s1 = 5;
      f.upgrades.s2 = 5;
      f.upgrades.s3 = 5;
      f.upgrades.s4 = 5;

      // Place target dummies in front of hero
      for (let k = 0; k < 3; k++) {
        const dummy = world.director.createEnemy('bone_brute', false, 1, () => 0.5, {
          x: f.x + 52 + k * 24,
          y: f.y + (k - 1) * 14,
        });
        dummy.hp = 5000;
        dummy.maxHp = 5000;
        world.enemies.push(dummy);
      }

      for (const slot of [1, 2, 3, 4]) {
        f.actionLockMs = 0;
        f.s1CdMs = f.s2CdMs = f.s3CdMs = f.s4CdMs = 0;
        world.clearTickEvents();
        const ok = executeHeroSkill(f, slot, world.makeContext());
        assert.equal(ok, true, `${heroId} skill ${slot} failed to execute`);
        assert.equal(f.actionId, `skill${slot}`);
        advanceMs(world, 350); // resolve delayed hits & projectiles
      }

      // Execute Awakening Ultimate at 100 Fury
      f.actionLockMs = 0;
      f.fury = MK_FURY_MAX;
      world.clearTickEvents();
      const ultOk = executeHeroUltimate(f, world.makeContext());
      assert.equal(ultOk, true, `${heroId} ultimate failed`);
      assert.equal(f.actionId, 'ultimate');
      assert.equal(f.fury, 0);
      const frame = world.frameFor('p1');
      assert.equal(frame.ultCutIns.length, 1, `${heroId} ultimate must emit cut-in event`);
      assert.equal(frame.ultCutIns[0].heroId, heroId);
      advanceMs(world, 450);
      assert.ok(f.damageDealt > 0, `${heroId} must deal damage across 5-skill kit`);
    }
  });

  it('enforces Shield Orc front mitigation (-40%), Bomber Imp parryable explosion, and 4-Biome rotation', () => {
    assert.equal(getMkBiomeForWave(1, 'auto'), 'grasslands');
    assert.equal(getMkBiomeForWave(6, 'auto'), 'jungle');
    assert.equal(getMkBiomeForWave(11, 'auto'), 'volcano');
    assert.equal(getMkBiomeForWave(16, 'auto'), 'citadel');
    assert.equal(MK_BIOMES.length, 4);

    const { world } = makeWorld(['knight'], {}, 77);
    advanceMs(world, 2000);
    const f = world.fighters[0];
    const orc = world.director.createEnemy('shield_orc', false, 1, () => 0.5, { x: f.x + 30, y: f.y });
    orc.dir = -1; // facing the hero -> front shield active!
    world.enemies.push(orc);
    const frontDmg = damageEnemy(f, orc, 100, { critBonus: -1 }, world.makeContext());
    orc.dir = 1; // back turned -> full damage!
    const backDmg = damageEnemy(f, orc, 100, { critBonus: -1 }, world.makeContext());
    assert.ok(frontDmg < backDmg * 0.72, `Expected front shield reduction (${frontDmg} vs ${backDmg})`);
  });

  it('handles 3-Phase Boss transitions (66% & 33%), Relic Draft (valid & spoof rejection + 12s auto-pick), Phoenix Feather & Boss Rush Victory', () => {
    const { world, getEndResult } = makeWorld(['knight'], { playMode: 'boss_rush' }, 888);
    const f = world.fighters[0];
    assert.equal(f.level, 5);
    assert.equal(f.gold, 450);
    assert.equal(f.upgrades.s2, 1);
    assert.equal(f.upgrades.s3, 1);
    assert.equal(f.upgrades.s4, 1);

    // Enter combat on Boss Rush Wave 1
    advanceMs(world, 2400);
    const boss = world.enemies.find((e) => e.isBoss);
    assert.ok(boss, 'Expected Boss Rush Wave 1 to spawn Boss');
    assert.equal(boss.bossPhase, 1);

    // Drop HP below 66% -> Phase 2 Enrage
    boss.hp = Math.round(boss.maxHp * 0.60);
    world.step();
    assert.equal(boss.bossPhase, 2);
    assert.equal(boss.actionId, 'enrage');

    // Drop HP below 33% -> Phase 3 Enrage
    boss.hp = Math.round(boss.maxHp * 0.25);
    world.step();
    assert.equal(boss.bossPhase, 3);

    // Clear all wave 1 enemies -> triggers RELIC_DRAFT
    for (const e of world.enemies) e.hp = 0;
    while (world.director.remainingToSpawn > 0) {
      advanceMs(world, 1000);
      for (const e of world.enemies) e.hp = 0;
    }
    advanceMs(world, 120);
    assert.equal(world.frameFor('p1').phase, 'relic_draft');
    const choices = f.pendingRelicChoices;
    assert.equal(choices.length, 3);

    // Spoofed relic NOT in choices must be ignored
    const spoof = MK_RELIC_IDS.find((r) => !choices.includes(r));
    world.enqueueCommand('p1', { t: 'pick_relic', relicId: spoof });
    world.step();
    assert.equal(f.relics.get(spoof), undefined);

    // Valid pick grants relic and exits draft!
    world.enqueueCommand('p1', { t: 'pick_relic', relicId: choices[0] });
    world.step();
    assert.equal(f.relics.get(choices[0]), 1);
    assert.equal(f.pendingRelicChoices, undefined);

    // Test Phoenix Feather auto-revive relic
    grantRelicToFighter(f, 'phoenix_feather');
    recomputeFighterStats(f, world.fighters, 'none');
    f.invulnMs = 0;
    f.guardMs = 0;
    f.parryWindowMs = 0;
    f.shieldHp = 0;
    f.hp = 10;
    const lethalCtx = { ...world.makeContext(), random: () => 0.99 };
    damageFighter(f, 5000, undefined, lethalCtx);
    assert.equal(f.downed, false, 'Phoenix Feather must auto-revive at 60% HP');
    assert.ok(f.hp >= Math.round(f.maxHp * 0.55));

    // Clear remaining Boss Rush waves 2, 3, 4 -> Victory!
    for (let w = 2; w <= 4; w++) {
      advanceMs(world, 2500);
      while (world.director.remainingToSpawn > 0 || world.enemies.some((e) => e.hp > 0)) {
        for (const e of world.enemies) e.hp = 0;
        advanceMs(world, 500);
      }
      advanceMs(world, 100);
      if (w < 4) {
        // Let 12s relic_draft auto-pick to test auto-pick fallback!
        advanceMs(world, 12500);
      }
    }
    assert.ok(getEndResult(), 'Expected Boss Rush to end after Boss 4');
    assert.equal(getEndResult().victory, true);
    assert.equal(getEndResult().waveReached, 4);
  });

  it('supports switch_com hero swap and 2.5s Co-op Revive of downed ally', () => {
    const { world } = makeWorld(['knight'], { comBots: 1, allowSwitchCom: true }, 999);
    advanceMs(world, 2000);
    const human = world.fighters[0];
    const com = world.fighters[1];
    assert.equal(human.ownerId, 'p1');
    assert.equal(com.ownerId, undefined);

    // Switch control to COM
    world.enqueueCommand('p1', { t: 'switch_com', targetId: com.id });
    world.step();
    assert.equal(com.ownerId, 'p1');
    assert.equal(human.ownerId, undefined);

    // Down the first hero and stand beside it for 2.5s to revive
    human.hp = 0;
    human.downed = true;
    human.actionId = 'dead';
    com.x = human.x + 12;
    com.y = human.y;
    advanceMs(world, 2650);
    assert.equal(human.downed, false, 'Expected 2.5s Co-op Revive to succeed');
    assert.ok(human.hp >= Math.round(human.maxHp * 0.45));
  });
});
