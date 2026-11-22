const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const shared = require('../dist/shared/src/index.js');
const { createStarterProfile, ExpeditionProfileStore } = require('../dist/server/src/game/expedition/expedition-store.js');
const { ExpeditionRedisService } = require('../dist/server/src/game/expedition/expedition-redis.service.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');

test('Gacha 13 Heroes (R/SR/SSR/SSS): 10,000-pull simulation verifies Hard Pity 80, 10-pull SR+, and A6 Starlight overflow', () => {
  assert.equal(shared.EXPEDITION_HEROES.length, 13);
  assert.equal(shared.EXPEDITION_SKILLS.length, 65);

  const profile = createStarterProfile('player_gacha_sim');
  profile.astralSeal = 10_000 * 160 + 50_000;
  const rng = new shared.Mulberry32(20261121);

  let maxGapWithoutSsr = 0;
  let currentGap = 0;
  let ssrCount = 0;

  for (let batch = 0; batch < 1000; batch++) {
    const pulls = shared.resolveSummonBatch(profile, 10, () => rng.next());
    assert.equal(pulls.length, 10);
    const hasSrOrSsr = pulls.some((p) => p.rarity === 'SR' || p.rarity === 'SSR' || p.rarity === 'SSS');
    assert.ok(hasSrOrSsr, `10-pull batch #${batch} must guarantee at least 1 SR+`);

    for (const p of pulls) {
      if (p.rarity === 'SSR') {
        ssrCount += 1;
        currentGap = 0;
      } else {
        currentGap += 1;
        if (currentGap > maxGapWithoutSsr) maxGapWithoutSsr = currentGap;
      }
    }
  }

  assert.ok(maxGapWithoutSsr < 80, `Hard Pity 80 violated: max non-SSR streak was ${maxGapWithoutSsr}`);
  assert.ok(ssrCount >= 125, `Expected healthy SSR count over 10,000 pulls, got ${ssrCount}`);
  assert.ok(profile.starlightToken > 0, 'A6 overflow duplicates must convert into starlightToken');
  for (const h of Object.values(profile.heroes)) {
    assert.ok(h.awakeningRank <= 6, 'Awakening rank must never exceed A6');
  }
});

test('Gacha Atomic Idempotency & Redis-Restart Survival', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-gacha-'));
  process.env.EXPEDITION_DATA_DIR = tmpDir;

  const redis1 = new ExpeditionRedisService();
  await redis1.onModuleInit();
  const svc1 = new ExpeditionService(redis1);

  const pid = `player_atomic_${Date.now().toString(36)}`;
  const init = await svc1.getProfile(pid);
  assert.equal(init.profile.astralSeal, 1600);

  const res = await svc1.summon(pid, { count: 10, reqId: 'unique_req_001' });
  assert.equal(res.pulls.length, 10);
  assert.equal(res.profile.astralSeal, 0);
  assert.equal(res.profile.pity.totalPulls, 10);

  // Duplicate reqId replay must be blocked by lock!
  await assert.rejects(() => svc1.summon(pid, { count: 10, reqId: 'unique_req_001' }), /đang được xử lý/);

  // Simulate complete Redis wipe / cold restart -> durable JSON store must preserve 100% of pulls & Pity!
  process.env.EXPEDITION_FORCE_MEMORY_REDIS = '1';
  const redisCold = new ExpeditionRedisService();
  const svc2 = new ExpeditionService(redisCold);
  const reloaded = await svc2.getProfile(pid);
  assert.equal(reloaded.profile.pity.totalPulls, 10);
  assert.equal(reloaded.profile.astralSeal, 0);

  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('weapon banner ownership, pity, duplicate material and rank upgrades', async (t) => {
  const previousDir = process.env.EXPEDITION_DATA_DIR;
  const previousRedis = process.env.EXPEDITION_FORCE_MEMORY_REDIS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-weapons-'));
  process.env.EXPEDITION_DATA_DIR = dir;
  process.env.EXPEDITION_FORCE_MEMORY_REDIS = '1';
  t.after(() => {
    if (previousDir === undefined) delete process.env.EXPEDITION_DATA_DIR;
    else process.env.EXPEDITION_DATA_DIR = previousDir;
    if (previousRedis === undefined) delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
    else process.env.EXPEDITION_FORCE_MEMORY_REDIS = previousRedis;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.deepEqual(shared.SIGNATURE_WEAPONS.map((w) => w.heroId).sort(), shared.EXPEDITION_HEROES.map((h) => h.heroId).sort());
  const profile = createStarterProfile(`player_${path.basename(dir)}`);
  profile.astralSeal = 15_000;
  const ordinaryRoll = () => { const rolls = [.99, 0]; return () => rolls.shift(); };
  // banner vũ khí: 0.2 rơi vào bậc Sử Thi (vũ khí trấn của anh hùng R), phần tử đầu = Park
  const weaponRoll = () => { const rolls = [.2, 0]; return () => rolls.shift(); };
  const first = shared.resolveWeaponSummon(profile, 1, weaponRoll())[0];
  const duplicate = shared.resolveWeaponSummon(profile, 1, weaponRoll())[0];
  assert.equal(first.signatureId, 'bastian_aegis');
  assert.equal(duplicate.uid, first.uid);
  assert.equal(duplicate.duplicateYield.shards, 1);
  assert.equal(profile.inventory.filter((item) => item.signatureId === first.signatureId).length, 1);
  profile.weaponPity.legendary = 39;
  assert.equal(shared.resolveWeaponSummon(profile, 1, weaponRoll())[0].rarity, 'legendary');
  profile.weaponPity.epic = 9;
  assert.equal(shared.resolveWeaponSummon(profile, 1, ordinaryRoll())[0].rarity, 'epic');
  profile.weaponPity.mythic = 159;
  assert.equal(shared.resolveWeaponSummon(profile, 1, ordinaryRoll())[0].rarity, 'mythic');
  const heroPull = shared.resolveSummonBatch(profile, 1, ordinaryRoll())[0];
  assert.equal(heroPull.heroId, 'bastian_aegis');
  assert.equal(heroPull.shardGained, 1);
  assert.equal(profile.heroes.bastian_aegis.awakeningRank, 0);
  await new ExpeditionProfileStore().saveAtomic(profile);
  const svc = new ExpeditionService(new ExpeditionRedisService());
  const pid = profile.playerId;
  await svc.equipItem(pid, { heroId: 'bastian_aegis', slot: 'weapon', itemUid: first.uid });
  await assert.rejects(() => svc.equipItem(pid, { heroId: 'gustave_blade', slot: 'weapon', itemUid: first.uid }), /chủ nhân/);
  const stats = (p) => shared.computeHeroFinalStats(shared.EXPEDITION_HEROES_BY_ID.bastian_aegis, p.heroes.bastian_aegis, p.inventory, p.charms);
  const beforeProfile = (await svc.getProfile(pid)).profile;
  const before = stats(beforeProfile);
  const shardsBefore = beforeProfile.inventory.find((item) => item.uid === first.uid).weaponShards;
  const refined = await svc.refineWeapon(pid, { itemUid: first.uid, expectedRank: 1 });
  assert.ok(stats(refined).atk > before.atk);
  assert.equal(refined.inventory.find((item) => item.uid === first.uid).weaponShards, shardsBefore - shared.WEAPON_BANNER.refineCosts[0]);
  await assert.rejects(() => svc.refineWeapon(pid, { itemUid: first.uid, expectedRank: 1 }), /đã thay đổi/);
  const awakened = await svc.upgradeHero(pid, { heroId: 'bastian_aegis', kind: 'awaken', expectedRank: 0 });
  assert.equal(awakened.heroes.bastian_aegis.awakeningRank, 1);
  assert.equal(awakened.heroes.bastian_aegis.shards, 0);
  await svc.weaponSummon(pid, { count: 1, reqId: 'weapon-replay' });
  const afterRestart = new ExpeditionService(new ExpeditionRedisService());
  await assert.rejects(() => afterRestart.weaponSummon(pid, { count: 1, reqId: 'weapon-replay' }), /đã xử lý/);
});

test('charm capacity grows to five and trims over-equipped legacy profiles', () => {
  assert.deepEqual([1, 6, 14, 24, 39, 40, 60, 100].map(shared.charmSlotsAtLevel), [1, 2, 3, 4, 4, 5, 5, 5]);
  const profile = createStarterProfile('player_charm_limit');
  const ids = shared.EXPEDITION_CHARMS.slice(0, 7).map((charm) => charm.charmId);
  profile.charms = Object.fromEntries(ids.map((id) => [id, { rank: 1, obtainedAt: 0 }]));
  profile.heroes.bastian_aegis.level = 40;
  profile.heroes.bastian_aegis.charmIds = ids;
  shared.normalizeProfile(profile);
  assert.deepEqual(profile.heroes.bastian_aegis.charmIds, ids.slice(0, 5));
});
