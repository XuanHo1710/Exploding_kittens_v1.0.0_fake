const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ExpeditionRedisService } = require('../dist/server/src/game/expedition/expedition-redis.service.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');
const { createStarterProfile } = require('../dist/server/src/game/expedition/expedition-store.js');
const shared = require('../dist/shared/src/index.js');

const B = shared.EXP_BALANCE;

function freshService() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-combat-'));
  process.env.EXPEDITION_DATA_DIR = tmpDir;
  process.env.EXPEDITION_FORCE_MEMORY_REDIS = '1';
  const svc = new ExpeditionService(new ExpeditionRedisService());
  return {
    svc,
    done() {
      delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

/** Bot chơi trận: ưu tiên kỹ năng mạnh nhất đủ AP, đánh nhịp theo `hitGrade`, phòng thủ theo `defGrade`. */
function autoplay(session, { hitGrade = 'perfect', defGrade = 'parry', maxSteps = 260 } = {}) {
  const sim = structuredClone(session);
  const rng = new shared.Mulberry32(sim.battleSeed);
  const log = [];
  const allEvents = [];
  let step = 0;
  while (sim.state !== 'VICTORY' && sim.state !== 'DEFEAT' && step < maxSteps) {
    const actor = sim.combatants.find((c) => c.unitUid === sim.activeActorUid);
    let rec;
    if (actor.side === 'party') {
      const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
      const usable = def.skillIds
        .map((id) => shared.EXPEDITION_SKILLS_BY_ID[id])
        .filter((s) => s.slotKind !== 'passive' && actor.unlockedSkillIds.includes(s.skillId))
        .map((s) => shared.resolveSkillFor(actor, s))
        .filter((r) => r.apCost <= actor.ap);
      const pick = usable.sort((a, b) => b.apCost - a.apCost)[0];
      const target = sim.combatants.find((c) => c.side === 'enemy' && c.alive);
      rec = {
        stepIndex: step++,
        actorUid: actor.unitUid,
        kind: 'player_skill',
        skillId: pick.skill.skillId,
        targetUid: target?.unitUid,
        timedHitGrades: pick.hits.map(() => hitGrade),
      };
    } else {
      const move = shared.getActiveEnemyMove(sim);
      const defenseGrades = {};
      for (const uid of shared.getEnemyIntentTargets(sim)) defenseGrades[uid] = move.hitBeatsMs.map((_, i) => (defGrade !== 'hit' && move.specialFrom !== undefined && i >= move.specialFrom ? 'counter' : defGrade));
      rec = { stepIndex: step++, actorUid: actor.unitUid, kind: 'enemy_turn', defenseGrades };
    }
    allEvents.push(...shared.executeTurnAction(sim, rec, rng));
    log.push(rec);
  }
  return { sim, log, events: allEvents };
}

test('affinity: weak / resist ring + boss resists its own element', () => {
  const slime = { element: 'Verdant', weakness: 'Pyre' };
  assert.equal(shared.affinityOf('Pyre', slime), 'weak');
  assert.equal(shared.affinityOf('Astral', slime), 'weak', 'Astral beats Verdant on the ring');
  assert.equal(shared.affinityOf('Tide', slime), 'resist', 'Verdant beats Tide -> Tide is resisted');
  assert.equal(shared.affinityOf('Solar', slime), 'neutral');
  assert.equal(shared.affinityOf('Verdant', { element: 'Verdant', resists: ['Verdant'] }), 'resist');
  assert.ok(shared.affinityDamageMult('weak') > 1 && shared.affinityDamageMult('resist') < 1);
});

test('new defensive charms trigger once even during a four-hit enemy turn', () => {
  const profile = createStarterProfile('p_new_charm_procs');
  const park = profile.heroes.bastian_aegis;
  park.level = 6;
  profile.activeParty = [park.heroId];
  const ids = ['ch_guard_mend', 'ch_quiet_guard'];
  profile.charms = Object.fromEntries(ids.map((id) => [id, { rank: 1, obtainedAt: 0 }]));
  const run = (equipped) => {
    park.charmIds = equipped;
    const session = shared.createBattleSession({ battleId: 'b_def_charm', battleSeed: 6, profile,
      encounterKind: 'gatekeeper', targetId: '01-dawn-meadow_gk_1', mapId: '01-dawn-meadow' });
    const hero = session.combatants.find((unit) => unit.side === 'party');
    const enemy = session.combatants.find((unit) => unit.side === 'enemy');
    hero.chargeMax = 20;
    session.activeActorUid = enemy.unitUid;
    session.enemyIntent = { actorUid: enemy.unitUid, targetUids: [hero.unitUid],
      move: { moveId: 'charm-defense-probe', nameVi: 'Liên kích', telegraphVi: '', targetScope: 'single', hitBeatsMs: [450, 780, 1110, 1450], powerMult: 1, beamStyle: 'slash' } };
    const events = shared.executeTurnAction(session, { actorUid: enemy.unitUid, stepIndex: 0, kind: 'enemy_turn',
      defenseGrades: { [hero.unitUid]: ['parry', 'parry', 'dodge', 'dodge'] } }, new shared.Mulberry32(6));
    return { hero, events };
  };
  const baseline = run([]);
  const equipped = run(ids);
  assert.equal(equipped.hero.charge, baseline.hero.charge + 1);
  const shield = equipped.events.filter((event) => event.kind === 'shield' && event.targetUid === equipped.hero.unitUid);
  assert.deepEqual(shield.map((event) => event.amount), [Math.round(equipped.hero.maxHp * .06)]);
});

test('enemy intents are deterministic, telegraphed before the turn and replay-verified', () => {
  const profile = createStarterProfile('p_intent');
  const params = { battleId: 'b_int', battleSeed: 777, profile, encounterKind: 'wild', targetId: '01-dawn-meadow_wild_2', mapId: '01-dawn-meadow' };
  const s1 = shared.createBattleSession(params);
  const s2 = shared.createBattleSession(params);
  assert.equal(s1.combatants.filter((c) => c.side === 'enemy').length, 3, 'wild pack 2 has 3 monsters');
  assert.ok(s1.combatants.filter((c) => c.side === 'enemy').every((c) => c.isMinion && c.spriteRef.startsWith('units/')));
  const r1 = autoplay(s1, { hitGrade: 'good', defGrade: 'hit' });
  const r2 = autoplay(s2, { hitGrade: 'good', defGrade: 'hit' });
  assert.deepEqual(r1.log, r2.log, 'same seed -> same intents & same log');
  assert.ok(['VICTORY', 'DEFEAT'].includes(r1.sim.state));
  const v = shared.replayAndVerifyBattle({ ...params, actionLog: r1.log });
  assert.equal(v.outcome, r1.sim.state === 'VICTORY' ? 'victory' : 'defeat');
  const kinds = new Set(r1.events.map((e) => e.kind));
  assert.ok(kinds.has('status_apply') || kinds.has('charge_gain'), 'statuses / charge are exercised');
});

test('statuses stack, DoT ticks, frostbite freezes, charge builds then bursts', () => {
  const profile = createStarterProfile('p_status');
  profile.heroes.ignis_valkyrie = { heroId: 'ignis_valkyrie', level: 10, exp: 0, awakeningRank: 0, shards: 0, skillLevels: {} };
  profile.heroes.lyra_frostbow = { heroId: 'lyra_frostbow', level: 10, exp: 0, awakeningRank: 0, shards: 0, skillLevels: {} };
  profile.activeParty = ['ignis_valkyrie', 'lyra_frostbow', 'celine_prism'];
  const s = shared.createBattleSession({ battleId: 'b_st', battleSeed: 4242, profile, encounterKind: 'gatekeeper', targetId: '02-everfrost-peaks_gk_3', mapId: '02-everfrost-peaks' });
  const { events, sim } = autoplay(s, { hitGrade: 'perfect', defGrade: 'parry' });
  assert.equal(sim.state, 'VICTORY');
  assert.ok(events.some((e) => e.kind === 'status_apply' && e.statusId === 'burn'), 'Ignis applies Burn');
  assert.ok(events.some((e) => e.kind === 'status_tick' && e.statusId === 'burn' && e.amount > 0), 'Burn ticks');
  assert.ok(events.some((e) => e.kind === 'charge_gain'), 'charge accumulates');
  assert.ok(events.some((e) => e.kind === 'charge_burst'), 'charge is consumed by burst skills');
  assert.ok(events.some((e) => e.kind === 'freeze') || events.some((e) => e.statusId === 'frostbite'), 'Lyra applies Frostbite');
});

test('skill tree: tier gating, exclusive-first branch pricing, mods change the resolved skill, reset refunds', async () => {
  const { svc, done } = freshService();
  const pid = `tree_${Date.now().toString(36)}`;
  const { profile } = await svc.getProfile(pid);
  const heroId = 'gustave_blade';
  const p = profile;
  p.heroes[heroId].level = 30;
  p.astralSeal = 5000;
  await svc.persistProfile(p);
  const t2b = `${heroId}:t2B`;
  await assert.rejects(() => svc.unlockTreeNode(pid, { heroId, nodeId: t2b }), /tầng 1/);
  await svc.unlockTreeNode(pid, { heroId, nodeId: `${heroId}:t1R` });
  const after = await svc.unlockTreeNode(pid, { heroId, nodeId: t2b });
  const inst = after.heroes[heroId];
  const tA = shared.TREE_NODES_BY_ID[`${heroId}:t2A`];
  assert.equal(shared.treeNodeCost(inst, tA), B.skillTree.tierCosts[1] * B.skillTree.secondBranchCostMult, 'second branch costs double');
  assert.equal(shared.treeNodeReqLevel(inst, tA), B.skillTree.tierLevels[1] + B.skillTree.secondBranchExtraLevel);
  // mods applied to the battle unit
  const s = shared.createBattleSession({ battleId: 'b_tree', battleSeed: 1, profile: after, encounterKind: 'wild', targetId: '01-dawn-meadow_wild_1', mapId: '01-dawn-meadow' });
  const hero = s.combatants.find((c) => c.templateId === heroId);
  const a1 = shared.EXPEDITION_SKILLS_BY_ID[shared.EXPEDITION_HEROES_BY_ID[heroId].skillIds[1]];
  assert.equal(shared.resolveSkillFor(hero, a1).apCost, a1.apCost - 1, 't2B reduces AP cost');
  const reset = await svc.resetTree(pid, { heroId });
  assert.equal(reset.heroes[heroId].treeNodes.length, 0);
  assert.equal(shared.treePointsUnspent(reset.heroes[heroId]), shared.treePointsAtLevel(30));
  done();
});

test('every won battle drops >=1 charm; defeated packs stay gone until a bonfire rest; charms equip into level-gated slots', async () => {
  const { svc, done } = freshService();
  const pid = `wild_${Date.now().toString(36)}`;
  let gained = [];
  for (let i = 0; i < 3; i++) {
    const targetId = '01-dawn-meadow_wild_1';
    const session = await svc.startBattle(pid, { encounterKind: 'wild', targetId, mapId: '01-dawn-meadow' });
    const { log, sim } = autoplay(session, { hitGrade: 'perfect', defGrade: 'parry' });
    assert.equal(sim.state, 'VICTORY');
    const r = await svc.commitBattle(pid, { battleId: session.battleId, reqId: `w${i}_${pid}`, actionLog: log });
    assert.equal(r.outcome, 'victory');
    assert.ok(r.expReward > 0);
    assert.ok(r.charms.length >= B.charms.guaranteedPerBattle, 'every victory grants at least one charm');
    assert.ok(r.profile.defeatedSinceRest.includes(targetId), 'defeated pack is recorded');
    await assert.rejects(() => svc.startBattle(pid, { encounterKind: 'wild', targetId, mapId: '01-dawn-meadow' }), /đã bị hạ/);
    const rested = await svc.reachAnchor(pid, { mapId: '01-dawn-meadow', anchorId: r.profile.lastRestAnchorId });
    assert.deepEqual(rested.defeatedSinceRest, [], 'bonfire rest respawns every defeated monster');
    assert.equal(rested.lastRest.respawned, 1);
    for (const [k, min] of Object.entries(B.rest.supplyBaseline)) assert.ok(rested.supplies[k] >= min, `rest refills ${k}`);
    gained = gained.concat(r.charms);
  }
  assert.ok(gained.length >= 3);
  const { profile } = await svc.getProfile(pid);
  const charmId = gained[0].charmId;
  assert.ok(profile.charms[charmId].rank >= 1);
  const heroId = profile.activeParty[0];
  await assert.rejects(() => svc.equipCharm(pid, { heroId, slotIndex: 3, charmId }), /Ô bùa chưa mở/);
  const eq = await svc.equipCharm(pid, { heroId, slotIndex: 0, charmId });
  assert.deepEqual(eq.heroes[heroId].charmIds, [charmId]);
  const other = profile.activeParty[1];
  const moved = await svc.equipCharm(pid, { heroId: other, slotIndex: 0, charmId });
  assert.deepEqual(moved.heroes[heroId].charmIds, [], 'a charm can only be worn by one hero');
  assert.deepEqual(moved.heroes[other].charmIds, [charmId]);
  done();
});

test('charm effects: start AP, start shield, imbue changes basic attack element', () => {
  const profile = createStarterProfile('p_charm');
  profile.charms = { ch_dawn_ap: { rank: 1, obtainedAt: 0 }, ch_ward: { rank: 3, obtainedAt: 0 }, ch_imbue_pyre: { rank: 1, obtainedAt: 0 } };
  profile.heroes.gustave_blade.level = 10;
  profile.heroes.gustave_blade.charmIds = ['ch_dawn_ap', 'ch_imbue_pyre'];
  profile.heroes.bastian_aegis.charmIds = ['ch_ward'];
  const s = shared.createBattleSession({ battleId: 'b_ch', battleSeed: 5, profile, encounterKind: 'gatekeeper', targetId: '01-dawn-meadow_gk_1', mapId: '01-dawn-meadow' });
  const gus = s.combatants.find((c) => c.templateId === 'gustave_blade');
  const bas = s.combatants.find((c) => c.templateId === 'bastian_aegis');
  const cel = s.combatants.find((c) => c.templateId === 'celine_prism');
  assert.equal(gus.ap, cel.ap + 1, 'Dawn charm grants +1 starting AP');
  assert.ok(bas.shieldHp > 0, 'Ward charm grants a starting shield');
  const basic = shared.EXPEDITION_SKILLS_BY_ID['gus_basic'];
  assert.equal(shared.resolveSkillFor(gus, basic).element, 'Pyre', 'imbue charm overrides basic element');
});

test('story: every realm has enter / pre-boss / post-boss scenes; seen scenes persist', async () => {
  for (const r of shared.EXPEDITION_REALMS) {
    assert.ok(shared.storySceneFor({ kind: 'enter', mapId: r.mapId }), `enter scene for ${r.mapId}`);
    assert.ok(shared.storySceneFor({ kind: 'pre_boss', bossId: r.bossAltar.bossId }), `pre-boss scene for ${r.mapId}`);
    assert.ok(shared.storySceneFor({ kind: 'post_boss', bossId: r.bossAltar.bossId }), `post-boss scene for ${r.mapId}`);
  }
  assert.ok(shared.storySceneFor({ kind: 'start' }));
  const { svc, done } = freshService();
  const pid = `story_${Date.now().toString(36)}`;
  const p = await svc.markStorySeen(pid, { sceneId: 'prologue' });
  assert.ok(p.storySeen.includes('prologue'));
  await assert.rejects(() => svc.markStorySeen(pid, { sceneId: 'nope' }), /không tồn tại/);
  done();
});

test('charm drop distribution: always >=1, lucky 2+, mean matches the published expectation', () => {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const [kind, firstClear, minions] of [['wild', false, 3], ['gatekeeper', true, 1], ['gatekeeper', false, 0], ['boss', true, 0]]) {
    const profile = createStarterProfile(`p_dist_${kind}`);
    const N = 6000;
    let total = 0, min = Infinity, multi = 0;
    for (let i = 0; i < N; i++) {
      const n = shared.rollCharmDrops({ profile, encounterKind: kind, realmOrder: 3, firstClear, minionsKilled: minions, rand }).length;
      total += n; min = Math.min(min, n); if (n >= 2) multi++;
    }
    const expected = shared.expectedCharmsPerBattle(kind, firstClear, minions);
    assert.ok(min >= 1, `${kind}: every victory drops at least one charm`);
    assert.ok(multi > 0, `${kind}: lucky multi-drops happen`);
    assert.ok(Math.abs(total / N - expected) < 0.05, `${kind}: simulated mean ${total / N} ≈ expected ${expected}`);
  }
});
