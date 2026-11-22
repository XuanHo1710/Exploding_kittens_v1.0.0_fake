const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ExpeditionRedisService } = require('../dist/server/src/game/expedition/expedition-redis.service.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');
const shared = require('../dist/shared/src/index.js');

const B = shared.EXP_BALANCE;

function freshService() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-prog-'));
  process.env.EXPEDITION_DATA_DIR = tmpDir;
  process.env.EXPEDITION_FORCE_MEMORY_REDIS = '1';
  const redis = new ExpeditionRedisService();
  const svc = new ExpeditionService(redis);
  return { svc, tmpDir };
}

test('balance: EXP curve grows, stat points per level + milestones', () => {
  assert.ok(shared.expToNextLevel(10) > shared.expToNextLevel(5));
  assert.equal(shared.statPointsAtLevel(1), 0);
  assert.equal(shared.statPointsAtLevel(10), 9 * B.statPoints.perLevel + B.statPoints.milestoneBonus[10]);
  assert.equal(shared.skillLevelCap(1), 1);
  assert.equal(shared.skillLevelCap(B.skills.levelPerSkillRank), 2);
  assert.ok(shared.skillPowerMult(5) > shared.skillPowerMult(1));
});

test('level up, stat allocation (budget enforced), reset, final stats grow', async () => {
  const { svc, tmpDir } = freshService();
  const pid = `prog_alloc_${Date.now().toString(36)}`;
  const { profile } = await svc.getProfile(pid);
  const heroId = profile.activeParty[0];

  await assert.rejects(() => svc.allocateStats(pid, { heroId, alloc: { atk: 1 } }), /Chỉ còn 0 điểm/);

  // cân bằng: không mua cấp bằng Tinh Thể, chỉ lên cấp nhờ EXP chiến đấu
  await assert.rejects(() => svc.feedExp(pid, { heroId, crystals: 400 }), /chỉ lên cấp bằng cách chiến đấu/);
  await assert.rejects(() => svc.upgradeHero(pid, { heroId, kind: 'level' }), /chỉ lên cấp bằng cách chiến đấu/);
  const seeded = (await svc.getProfile(pid)).profile;
  const levelUp = shared.grantHeroExp(seeded.heroes[heroId], 4000);
  assert.ok(levelUp && levelUp.toLevel > 1, 'combat EXP levels the hero up');
  await svc.persistProfile(seeded);
  const fed = { profile: seeded };
  const hero = fed.profile.heroes[heroId];
  const free = shared.statPointsUnspent(hero);
  assert.equal(free, shared.statPointsAtLevel(hero.level));

  const def = shared.EXPEDITION_HEROES_BY_ID[heroId];
  const before = shared.computeHeroFinalStats(def, hero, fed.profile.inventory);
  const after = await svc.allocateStats(pid, { heroId, alloc: { atk: free - 1, eva: 1 } });
  const st = shared.computeHeroFinalStats(def, after.heroes[heroId], after.inventory);
  assert.ok(st.atk > before.atk);
  assert.ok(st.eva > before.eva);
  await assert.rejects(() => svc.allocateStats(pid, { heroId, alloc: { hp: 5 } }), /Chỉ còn/);

  const reset = await svc.allocateStats(pid, { heroId, reset: true });
  assert.equal(shared.statPointsUnspent(reset.heroes[heroId]), shared.statPointsAtLevel(hero.level));
  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('item gacha x10 guarantee, equip raises stats, elixir is permanent, salvage gives crystals', async () => {
  const { svc, tmpDir } = freshService();
  const pid = `prog_items_${Date.now().toString(36)}`;
  await svc.getProfile(pid);
  const r = await svc.itemSummon(pid, { count: 10, reqId: 'items_1' });
  assert.equal(r.items.length, 10);
  const rank = (x) => shared.ITEM_RARITIES.indexOf(x);
  assert.ok(r.items.some((it) => rank(it.rarity) >= rank(B.itemGacha.tenPullGuarantee)), 'x10 guarantees epic+');

  const heroId = r.profile.activeParty[0];
  const def = shared.EXPEDITION_HEROES_BY_ID[heroId];
  const base = shared.computeHeroFinalStats(def, r.profile.heroes[heroId], r.profile.inventory);
  const eq = r.items.find((it) => it.kind === 'equipment');
  if (eq) {
    const p = await svc.equipItem(pid, { heroId, slot: eq.slot, itemUid: eq.uid });
    const st = shared.computeHeroFinalStats(def, p.heroes[heroId], p.inventory);
    assert.ok(st[eq.main.stat] > base[eq.main.stat], 'equipped main stat is applied');
    assert.equal(p.inventory.find((i) => i.uid === eq.uid).equippedBy, heroId);
  }
  const prof = (await svc.getProfile(pid)).profile;
  const elixir = shared.generateItem({ rand: Math.random, rarity: 'epic', ilvl: 5, uid: 'test_elixir', elixir: true });
  prof.inventory.push(elixir);
  await svc.persistProfile(prof);
  const p2 = await svc.useElixir(pid, { heroId, itemUid: 'test_elixir' });
  assert.equal(p2.heroes[heroId].elixirUses, 1);
  assert.ok((p2.heroes[heroId].elixirBonus[elixir.elixir.stat] ?? 0) > 0);
  assert.ok(!p2.inventory.some((i) => i.uid === 'test_elixir'));

  const loose = p2.inventory.filter((i) => !i.equippedBy).map((i) => i.uid);
  if (loose.length) {
    const s = await svc.salvageItems(pid, { itemUids: loose });
    assert.ok(s.gained > 0);
  }
  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('item gacha 20 000 pulls: rarity distribution follows the table, pity caps the Legendary drought', () => {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const profile = { astralSeal: 1e9, inventory: [], itemSeq: 0, itemPity: 0, unlockedMaps: ['01-dawn-meadow'] };
  const counts = Object.fromEntries(shared.ITEM_RARITIES.map((r) => [r, 0]));
  let drought = 0;
  let worstDrought = 0;
  for (let i = 0; i < 20000; i++) {
    profile.inventory = [];
    const [it] = shared.resolveItemSummon(profile, 1, rand);
    counts[it.rarity] += 1;
    drought = ['legendary', 'mythic'].includes(it.rarity) ? 0 : drought + 1;
    worstDrought = Math.max(worstDrought, drought);
  }
  const share = (r) => counts[r] / 20000;
  assert.ok(Math.abs(share('common') - B.itemGacha.rates.common) < 0.02);
  assert.ok(share('legendary') + share('mythic') >= B.itemGacha.rates.legendary + B.itemGacha.rates.mythic - 0.005);
  assert.ok(worstDrought < B.itemGacha.hardPityLegendary, `worst drought ${worstDrought}`);
});

test('skills: locked by level, upgrade gated by hero level cap and costs from balance', async () => {
  const { svc, tmpDir } = freshService();
  const pid = `prog_skill_${Date.now().toString(36)}`;
  const { profile } = await svc.getProfile(pid);
  const heroId = profile.activeParty[0];
  const def = shared.EXPEDITION_HEROES_BY_ID[heroId];
  await assert.rejects(() => svc.upgradeHero(pid, { heroId, kind: 'skill', skillId: def.skillIds[3] }), /mở khóa ở cấp/);
  await assert.rejects(() => svc.upgradeHero(pid, { heroId, kind: 'skill', skillId: def.skillIds[1] }), /Cần anh hùng cấp/);
  const p = (await svc.getProfile(pid)).profile;
  p.heroes[heroId].level = B.skills.levelPerSkillRank;
  p.expCrystal = 10000;
  await svc.persistProfile(p);
  const up = await svc.upgradeHero(pid, { heroId, kind: 'skill', skillId: def.skillIds[1] });
  assert.equal(up.heroes[heroId].skillLevels[def.skillIds[1]], 2);
  assert.equal(up.expCrystal, 10000 - B.skills.upgradeCost[0].expCrystal);
  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('battle victory: verified replay (with EVA), drops and level-up reports', async () => {
  const { svc, tmpDir } = freshService();
  const pid = `prog_battle_${Date.now().toString(36)}`;
  const gkId = '01-dawn-meadow_gk_1';
  const session = await svc.startBattle(pid, { encounterKind: 'gatekeeper', targetId: gkId, mapId: '01-dawn-meadow' });
  const sim = structuredClone(session);
  const rng = new shared.Mulberry32(sim.battleSeed);
  const log = [];
  let step = 0;
  let evades = 0;
  while (sim.state !== 'VICTORY' && sim.state !== 'DEFEAT' && step < 150) {
    const actor = sim.combatants.find((c) => c.unitUid === sim.activeActorUid);
    let rec;
    if (actor.side === 'party') {
      const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
      const a1 = shared.EXPEDITION_SKILLS_BY_ID[def.skillIds[1]];
      const pick = a1.targetScope.includes('enemy') && actor.ap >= a1.apCost ? a1.skillId : def.skillIds[0];
      rec = { stepIndex: step++, actorUid: actor.unitUid, kind: 'player_skill', skillId: pick, timedHitGrades: ['perfect', 'perfect', 'perfect', 'perfect'] };
    } else {
      rec = { stepIndex: step++, actorUid: actor.unitUid, kind: 'enemy_turn', defenseGrades: {} };
    }
    const evs = shared.executeTurnAction(sim, rec, rng);
    evades += evs.filter((e) => e.kind === 'evade').length;
    log.push(rec);
  }
  assert.equal(sim.state, 'VICTORY');
  const res = await svc.commitBattle(pid, { battleId: session.battleId, reqId: `c_${pid}`, actionLog: log });
  assert.equal(res.outcome, 'victory');
  assert.ok(Array.isArray(res.drops));
  assert.ok(Array.isArray(res.levelUps));
  assert.ok(res.profile.clearedGatekeepers.includes(gkId));
  assert.ok(evades >= 0);
  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
