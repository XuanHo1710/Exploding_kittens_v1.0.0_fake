const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const shared = require('../dist/shared/src/index.js');
const { ExpeditionRedisService } = require('../dist/server/src/game/expedition/expedition-redis.service.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');

test('7 Realms & 20 Gatekeepers: sequential order, >=6-tile safe respawn anchors, and realm warp gating', async () => {
  assert.equal(shared.EXPEDITION_REALMS.length, 7, 'Must have 7 sequential independent Realms');
  assert.equal(shared.EXPEDITION_GATEKEEPERS.length, 20, 'Must have 20 total Gatekeeper encounters');
  assert.equal(shared.EXPEDITION_BOSSES.length, 7, 'Must have 6 Regional Bosses + 1 Final Boss');

  // Verify safe respawn buffer >= aggroRadius + 6 on every Realm
  for (const realm of shared.EXPEDITION_REALMS) {
    for (const anc of realm.restAnchors) {
      for (const gkId of realm.gatekeeperIds) {
        const gk = shared.EXPEDITION_GATEKEEPERS_BY_ID[gkId];
        const dist = Math.abs(anc.x - gk.x) + Math.abs(anc.y - gk.y);
        assert.ok(
          dist >= gk.aggroRadius + 6,
          `${realm.mapId} anchor ${anc.anchorId} must be >= ${gk.aggroRadius + 6} tiles from ${gkId} (got ${dist})`,
        );
      }
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-realms-'));
  process.env.EXPEDITION_DATA_DIR = tmpDir;
  process.env.EXPEDITION_FORCE_MEMORY_REDIS = '1';
  const redis = new ExpeditionRedisService();
  const svc = new ExpeditionService(redis);

  const pid = 'player_realm_prog';
  await svc.getProfile(pid);

  // Cannot warp to Snow before defeating Meadow Boss Sylvan Warden
  await assert.rejects(() => svc.warpRealm(pid, { fromMapId: '01-dawn-meadow', toMapId: '02-everfrost-peaks' }), /Đại Trùm/);

  // Cannot reach second Meadow anchor (x=34) before clearing Gatekeepers at x=18 and x=30
  await assert.rejects(() => svc.reachAnchor(pid, { mapId: '01-dawn-meadow', anchorId: 'meadow_anchor_2' }), /đánh bại/);

  // Cannot challenge Meadow Boss before clearing all 3 Meadow Gatekeepers
  await assert.rejects(
    () => svc.startBattle(pid, { encounterKind: 'boss', targetId: 'sylvan_warden', mapId: '01-dawn-meadow' }),
    /Quái Gác Cổng/,
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.EXPEDITION_FORCE_MEMORY_REDIS;
});
