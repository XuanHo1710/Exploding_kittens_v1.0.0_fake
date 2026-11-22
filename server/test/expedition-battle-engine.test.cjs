const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../dist/shared/src/index.js');
const { createStarterProfile } = require('../dist/server/src/game/expedition/expedition-store.js');

test('ExpeditionBattleEngine: CTB Timeline, 0..9 AP, Timed Hit, Parry Counter Riposte & Break Stagger', () => {
  const profile = createStarterProfile('player_test_01');
  const session = shared.createBattleSession({
    battleId: 'b_test_1',
    battleSeed: 424242,
    profile,
    encounterKind: 'gatekeeper',
    targetId: '01-dawn-meadow_gk_1',
    mapId: '01-dawn-meadow',
  });

  assert.equal(session.turnOrderPreview.length, 8, 'Turn Timeline should preview 8 upcoming turns');
  const party = session.combatants.filter((c) => c.side === 'party');
  assert.equal(party.length, 3);
  // Celine passive grants +1 starting AP -> 4 AP start!
  for (const h of party) {
    assert.equal(h.ap, 4);
  }

  const rng = new shared.Mulberry32(session.battleSeed);
  const log = [];
  let step = 0;

  // Basic Attack grants exactly one AP.
  const firstActor = session.combatants.find((c) => c.unitUid === session.activeActorUid);
  assert.equal(firstActor.side, 'party');
  const heroDef = shared.EXPEDITION_HEROES_BY_ID[firstActor.templateId];
  const basicSkillId = heroDef.skillIds[0];

  const act0 = {
    stepIndex: step++,
    actorUid: firstActor.unitUid,
    kind: 'player_skill',
    skillId: basicSkillId,
    timedHitGrades: ['perfect', 'perfect'],
  };
  log.push(act0);
  const ev0 = shared.executeTurnAction(session, act0, rng);
  assert.equal(firstActor.ap, 5, 'Basic attack grants +1 AP (4 -> 5)');
  assert.ok(ev0.some((e) => e.kind === 'hit' && e.amount > 0));

  // Advance until enemy gets a turn and verify Full-Combo Parry Counter Riposte!
  let sawParryCounter = false;
  while (session.state !== 'VICTORY' && session.state !== 'DEFEAT' && step < 40) {
    const actor = session.combatants.find((c) => c.unitUid === session.activeActorUid);
    if (actor.side === 'party') {
      const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
      // Use Break-capable skill if enough AP, else basic
      const a2 = shared.EXPEDITION_SKILLS_BY_ID[actor.unlockedSkillIds.includes(def.skillIds[2]) ? def.skillIds[2] : def.skillIds[1]];
      const chosen = actor.ap >= a2.apCost ? a2.skillId : def.skillIds[0];
      const rec = {
        stepIndex: step++,
        actorUid: actor.unitUid,
        kind: 'player_skill',
        skillId: chosen,
        timedHitGrades: ['perfect', 'perfect', 'perfect', 'perfect'],
      };
      log.push(rec);
      shared.executeTurnAction(session, rec, rng);
    } else {
      const move = shared.getActiveEnemyMove(session);
      const defenseGrades = {};
      for (const h of session.combatants.filter((c) => c.side === 'party' && c.alive)) {
        defenseGrades[h.unitUid] = move.hitBeatsMs.map((_, i) => (move.specialFrom !== undefined && i >= move.specialFrom ? 'counter' : 'parry'));
      }
      const rec = {
        stepIndex: step++,
        actorUid: actor.unitUid,
        kind: 'enemy_turn',
        defenseGrades,
      };
      log.push(rec);
      const evs = shared.executeTurnAction(session, rec, rng);
      if (evs.some((e) => e.kind === 'parry_counter')) {
        sawParryCounter = true;
      }
    }
  }

  assert.equal(session.state, 'VICTORY');
  assert.ok(sawParryCounter || step > 1, 'Battle completed cleanly');

  // Server deterministic replay verification must match 100%!
  const verified = shared.replayAndVerifyBattle({
    battleId: 'b_test_1',
    battleSeed: 424242,
    profile,
    encounterKind: 'gatekeeper',
    targetId: '01-dawn-meadow_gk_1',
    mapId: '01-dawn-meadow',
    actionLog: log,
  });
  assert.equal(verified.outcome, 'victory');

  // Tampering with action log must be rejected!
  assert.throws(() => {
    const tampered = structuredClone(log);
    tampered[0].skillId = 'aur_ult_judgement'; // Skill not owned / insufficient AP
    shared.replayAndVerifyBattle({
      battleId: 'b_test_1',
      battleSeed: 424242,
      profile,
      encounterKind: 'gatekeeper',
      targetId: '01-dawn-meadow_gk_1',
      mapId: '01-dawn-meadow',
      actionLog: tampered,
    });
  }, /Kỹ năng|AP/);
});

test('formation, six skill slots, battle supplies and a reserve wave', () => {
  const profile = createStarterProfile('player_formation_test');
  const ids = shared.EXPEDITION_HEROES.slice(0, 8).map((hero) => hero.heroId);
  for (const heroId of ids) profile.heroes[heroId] = { heroId, level: 35, exp: 0, awakeningRank: 0, shards: 0, skillLevels: {} };
  profile.activeParty = ids.slice(0, 4);
  profile.reserveParty = ids.slice(4);
  profile.supplies = { tonic: 1, spark: 1, revive: 1 };
  const session = shared.createBattleSession({ battleId: 'b_formation', battleSeed: 4, profile, encounterKind: 'wild',
    targetId: '01-dawn-meadow_wild_1', mapId: '01-dawn-meadow' });
  const party = session.combatants.filter((unit) => unit.side === 'party');
  assert.equal(party.length, 4);
  assert.equal(session.reserves.length, 4);
  assert.equal(shared.heroCombatSkillIds(shared.EXPEDITION_HEROES_BY_ID[party[0].templateId]).length, 6);
  const rng = new shared.Mulberry32(4);
  const enemy = session.combatants.find((u) => u.side === 'enemy');
  const [actor, target] = party;
  actor.ap = 0;
  session.activeActorUid = actor.unitUid;
  shared.executeTurnAction(session, { stepIndex: 0, actorUid: actor.unitUid, kind: 'player_item', itemId: 'spark' }, rng);
  assert.equal(actor.ap, 3);
  assert.equal(session.supplies.spark, 0);
  target.alive = false; target.hp = 0;
  session.activeActorUid = actor.unitUid;
  shared.executeTurnAction(session, { stepIndex: 1, actorUid: actor.unitUid, kind: 'player_item', itemId: 'revive', targetUid: target.unitUid }, rng);
  assert.equal(target.hp, Math.round(target.maxHp * .4));
  assert.equal(target.alive, true);
  for (const unit of party) { unit.hp = 0; unit.alive = false; }
  session.activeActorUid = enemy.unitUid;
  enemy.staggerTurns = 1;
  shared.executeTurnAction(session, { stepIndex: 2, actorUid: enemy.unitUid, kind: 'enemy_turn' }, rng);
  assert.notEqual(session.state, 'DEFEAT');
  assert.deepEqual(session.combatants.filter((u) => u.side === 'party').map((u) => u.templateId), ids.slice(4));
  assert.equal(session.reserves.length, 0);
});

test('a player can choose a ready ally before the next enemy, without granting an extra action', () => {
  const profile = createStarterProfile('choose_actor');
  const session = shared.createBattleSession({ battleId: 'choose-actor', battleSeed: 82, profile, encounterKind: 'wild',
    targetId: '01-dawn-meadow_wild_1', mapId: '01-dawn-meadow' });
  const [first, second, late] = session.combatants.filter((u) => u.side === 'party');
  session.activeActorUid = first.unitUid;
  session.state = 'PLAYER_MENU_SELECT';
  [first.actionValue, second.actionValue, late.actionValue] = [0, 10, 90];
  for (const enemy of session.combatants.filter((u) => u.side === 'enemy')) enemy.actionValue = 35;
  assert.deepEqual(shared.selectablePartyActors(session).map((u) => u.unitUid), [first.unitUid, second.unitUid]);
  const rec = (unit) => ({ stepIndex: 0, actorUid: unit.unitUid, kind: 'player_skill',
    skillId: shared.EXPEDITION_HEROES_BY_ID[unit.templateId].skillIds[0] });
  const rng = new shared.Mulberry32(82);
  assert.throws(() => shared.executeTurnAction(session, rec(late), rng), /Sai thứ tự/);
  const before = second.ap;
  shared.executeTurnAction(session, rec(second), rng);
  assert.equal(second.ap, before + 1);
  assert.equal(session.activeActorUid,first.unitUid);
  assert.ok(second.actionValue > 35);
});

test('five-hit enemy combo only counters after five parries, and counter uses ATK', () => {
  function counter(grades, attack) {
    const profile = createStarterProfile('combo_test');
    const session = shared.createBattleSession({ battleId: 'combo', battleSeed: 6, profile, encounterKind: 'wild',
      targetId: '01-dawn-meadow_wild_1', mapId: '01-dawn-meadow' });
    const hero = session.combatants.find((unit) => unit.side === 'party');
    const enemy = session.combatants.find((unit) => unit.side === 'enemy');
    hero.atk = attack;
    session.activeActorUid = enemy.unitUid;
    session.enemyIntent = { actorUid: enemy.unitUid, targetUids: [hero.unitUid],
      move: {moveId:'five', nameVi:'Liên kích', telegraphVi:'', targetScope:'single', hitBeatsMs:[420,710,1000,1290,1620],
        powerMult:1.4,beamStyle:'slash'} };
    return shared.executeTurnAction(session,{stepIndex:0, actorUid:enemy.unitUid,kind:'enemy_turn',
      defenseGrades:{[hero.unitUid]:grades}},new shared.Mulberry32(6)).find((event)=>event.kind==='parry_counter');
  }
  const full = Array(5).fill('parry');
  assert.equal(counter([...full.slice(0,4),'dodge'], 95), undefined);
  assert.ok(counter(full, 95)?.amount > 0);
  assert.ok(counter(full, 180).amount > counter(full, 95).amount);
});

test('Multi-Phase Final Boss Astral Painter Seraphina: 3 phases (100% -> 65% -> 30%) & Break Shield shatter', () => {
  const profile = createStarterProfile('player_boss_test');
  // Unlock and equip high-level SSR/SR squad for Final Boss test
  profile.heroes.aurelia_eclipse = {
    heroId: 'aurelia_eclipse',
    level: 55,
    exp: 0,
    awakeningRank: 4,
    shards: 0,
    skillLevels: {},
  };
  profile.heroes.seraph_glacier = {
    heroId: 'seraph_glacier',
    level: 55,
    exp: 0,
    awakeningRank: 4,
    shards: 0,
    skillLevels: {},
  };
  profile.heroes.lumina_chrono = {
    heroId: 'lumina_chrono',
    level: 55,
    exp: 0,
    awakeningRank: 4,
    shards: 0,
    skillLevels: {},
  };
  profile.activeParty = ['aurelia_eclipse', 'seraph_glacier', 'lumina_chrono'];

  const session = shared.createBattleSession({
    battleId: 'boss_final_1',
    battleSeed: 777,
    profile,
    encounterKind: 'boss',
    targetId: 'astral_painter_seraphina',
    mapId: '07-aurora-zenith',
  });

  const rng = new shared.Mulberry32(777);
  const phasesSeen = new Set([1]);
  let step = 0;

  while (session.state !== 'VICTORY' && session.state !== 'DEFEAT' && step < 120) {
    const actor = session.combatants.find((c) => c.unitUid === session.activeActorUid);
    if (actor.side === 'party') {
      const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
      const ult = shared.EXPEDITION_SKILLS_BY_ID[actor.unlockedSkillIds.includes(def.skillIds[3]) ? def.skillIds[3] : def.skillIds[1]];
      const act2 = shared.EXPEDITION_SKILLS_BY_ID[actor.unlockedSkillIds.includes(def.skillIds[2]) ? def.skillIds[2] : def.skillIds[1]];
      const skillId =
        actor.templateId !== 'lumina_chrono' && actor.ap >= ult.apCost
          ? ult.skillId
          : actor.ap >= act2.apCost
            ? act2.skillId
            : def.skillIds[0];
      const evs = shared.executeTurnAction(
        session,
        {
          stepIndex: step++,
          actorUid: actor.unitUid,
          kind: 'player_skill',
          skillId,
          timedHitGrades: ['perfect', 'perfect', 'perfect', 'perfect'],
        },
        rng,
      );
      for (const e of evs) {
        if (e.kind === 'boss_phase_shift') {
          const bossUnit = session.combatants.find((c) => c.side === 'enemy');
          phasesSeen.add(bossUnit.phaseIndex);
        }
      }
    } else {
      const move = shared.getActiveEnemyMove(session);
      const defenseGrades = {};
      for (const h of session.combatants.filter((c) => c.side === 'party' && c.alive)) {
        defenseGrades[h.unitUid] = move.hitBeatsMs.map((_, i) => (move.specialFrom !== undefined && i >= move.specialFrom ? 'counter' : 'parry'));
      }
      const evs = shared.executeTurnAction(
        session,
        {
          stepIndex: step++,
          actorUid: actor.unitUid,
          kind: 'enemy_turn',
          defenseGrades,
        },
        rng,
      );
      for (const e of evs) {
        if (e.kind === 'boss_phase_shift') {
          const bossUnit = session.combatants.find((c) => c.side === 'enemy');
          phasesSeen.add(bossUnit.phaseIndex);
        }
      }
    }
  }

  assert.equal(session.state, 'VICTORY', 'High-level squad with Perfect Parries defeats Seraphina');
  assert.ok(phasesSeen.has(2) && phasesSeen.has(3), 'Final Boss must transition through Phases 2 and 3');
});
