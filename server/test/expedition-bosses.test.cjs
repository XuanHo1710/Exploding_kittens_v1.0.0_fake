const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../dist/shared/src/index.js');
const { createStarterProfile } = require('../dist/server/src/game/expedition/expedition-store.js');

test('All 6 Regional Bosses & Final Boss Seraphina: multi-phase HP thresholds, Break-Armor shatter & first-clear unlocks', () => {
  assert.equal(shared.EXPEDITION_BOSSES.length, 7);
  const regional = shared.EXPEDITION_BOSSES.filter((b) => !b.isFinalBoss);
  const finals = shared.EXPEDITION_BOSSES.filter((b) => b.isFinalBoss);
  assert.equal(regional.length, 6);
  assert.equal(finals.length, 1);
  assert.equal(finals[0].bossId, 'astral_painter_seraphina');
  assert.equal(finals[0].mapId, '07-aurora-zenith');
  assert.equal(finals[0].phases.length, 3);

  // Verify sequential realm unlock chain across the 6 Regional Bosses
  const expectedChain = [
    ['sylvan_warden', '02-everfrost-peaks'],
    ['boreal_chevalier', '03-sunken-dunes'],
    ['chronos_khepri', '04-abyssal-sanctum'],
    ['leviathan_sovereign', '05-cinder-caldera'],
    ['vulcan_titan', '06-nocturne-veil'],
    ['nocturne_weaver', '07-aurora-zenith'],
  ];
  for (const [bossId, unlocks] of expectedChain) {
    const b = shared.EXPEDITION_BOSSES_BY_ID[bossId];
    assert.ok(b, `Missing boss ${bossId}`);
    assert.equal(b.unlocksMapId, unlocks);
    assert.ok(b.phases.length >= 2, `${bossId} must have at least 2 phases`);
  }

  // Test Boreal Chevalier Break-Shield shatter on Stagger
  const profile = createStarterProfile('player_boss_shield');
  profile.heroes.lyra_frostbow = {
    heroId: 'lyra_frostbow',
    level: 25,
    exp: 0,
    awakeningRank: 2,
    shards: 0,
    skillLevels: {},
  };
  profile.heroes.gustave_blade.level = 25;
  profile.heroes.bastian_aegis.level = 25;
  profile.activeParty = ['gustave_blade', 'lyra_frostbow', 'bastian_aegis'];

  const session = shared.createBattleSession({
    battleId: 'boss_boreal_test',
    battleSeed: 9988,
    profile,
    encounterKind: 'boss',
    targetId: 'boreal_chevalier',
    mapId: '02-everfrost-peaks',
  });

  const bossUnit = session.combatants.find((c) => c.side === 'enemy');
  assert.equal(bossUnit.breakShieldActive, true, 'Boreal Chevalier starts Phase 1 with Break Shield active');

  const rng = new shared.Mulberry32(9988);
  let step = 0;
  let shattered = false;

  while (session.state !== 'VICTORY' && session.state !== 'DEFEAT' && step < 50) {
    const actor = session.combatants.find((c) => c.unitUid === session.activeActorUid);
    if (actor.side === 'party') {
      const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
      const brkSkill = shared.EXPEDITION_SKILLS_BY_ID[def.skillIds[2]];
      const skillId = actor.ap >= brkSkill.apCost ? brkSkill.skillId : def.skillIds[0];
      const evs = shared.executeTurnAction(
        session,
        {
          stepIndex: step++,
          actorUid: actor.unitUid,
          kind: 'player_skill',
          skillId,
          timedHitGrades: ['perfect', 'perfect', 'perfect'],
        },
        rng,
      );
      if (evs.some((e) => e.kind === 'break_stagger')) {
        shattered = true;
        assert.equal(bossUnit.breakShieldActive, false, 'Break Stagger must shatter Boss Break Shield');
      }
    } else {
      const move = shared.getActiveEnemyMove(session);
      const defenseGrades = {};
      for (const h of session.combatants.filter((c) => c.side === 'party' && c.alive)) {
        defenseGrades[h.unitUid] = move.hitBeatsMs.map(() => 'parry');
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
      if (evs.some((e) => e.kind === 'break_stagger')) {
        shattered = true;
        assert.equal(bossUnit.breakShieldActive, false, 'Parry Counter Break must shatter Boss Break Shield');
      }
    }
  }

  assert.ok(shattered, 'Boss Break Shield must be shatterable via Break Gauge / Parry Counter');
});
