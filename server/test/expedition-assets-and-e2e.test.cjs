const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { guardAstralExpeditionStaticRequest, ASTRAL_EXPEDITION_ROOT } = require('../dist/server/src/app.module.js');
const { ExpeditionRedisService } = require('../dist/server/src/game/expedition/expedition-redis.service.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');
const shared = require('../dist/shared/src/index.js');

function runStaticGuard(method, originalUrl) {
  return new Promise((resolve) => {
    let statusCode = 200;
    let body = null;
    let passed = false;
    const req = { method, originalUrl, url: originalUrl };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(payload) {
        body = payload;
        resolve({ passed: false, statusCode, body });
      },
    };
    guardAstralExpeditionStaticRequest(
      req,
      res,
      () => {
        passed = true;
        resolve({ passed, statusCode: 200, body: null });
      },
      ASTRAL_EXPEDITION_ROOT,
    );
  });
}

test('AstralExpeditionStaticGuard blocks traversal/dotfiles/methods and serves manifest & multi-frame assets', async () => {
  const m1 = await runStaticGuard('POST', '/database-astral-expedition/manifest.json');
  assert.equal(m1.passed, false);
  assert.equal(m1.statusCode, 405);

  for (const attack of [
    '/database-astral-expedition/../package.json',
    '/database-astral-expedition/%2e%2e/package.json',
    '/database-astral-expedition/%252e%252e/package.json',
    '/database-astral-expedition/units/.secret.png',
    '/database-astral-expedition/evil.exe',
  ]) {
    const r = await runStaticGuard('GET', attack);
    assert.equal(r.passed, false, `Should reject ${attack}`);
    assert.ok([400, 403].includes(r.statusCode));
  }

  const okManifest = await runStaticGuard('GET', '/database-astral-expedition/manifest.json');
  assert.equal(okManifest.passed, true);

  const okHero = await runStaticGuard('GET', '/database-astral-expedition/units/heroes/gustave_blade-battle.png');
  assert.equal(okHero.passed, true);

  const okMap = await runStaticGuard('GET', '/database-astral-expedition/maps/07-aurora-zenith/07-aurora-zenith.tmj');
  assert.equal(okMap.passed, true);

  const manifest = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.heroCount, 12);
  assert.equal(manifest.bossCount, 7);
  assert.equal(manifest.realmCount, 7);
  assert.equal(manifest.files['units/heroes/gustave_blade-battle.png'].width, 1152);
  assert.equal(manifest.files['units/heroes/gustave_blade-battle.png'].height, 1152);
  assert.equal(manifest.files['units/bosses/astral_painter_seraphina-battle.png'].width, 1536);
  assert.equal(manifest.files['units/bosses/astral_painter_seraphina-battle.png'].height, 1536);
});

test('asset mapping covers all heroes, outfits and actual wild encounter units', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, 'manifest.json'), 'utf8')).files;
  const wardrobe = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, 'units/heroes/variants/wardrobe.json'), 'utf8')).variants;
  const charmAtlas = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, 'ui/charm-icons.json'), 'utf8'));
  const charmIds = [...shared.EXPEDITION_CHARMS.map((charm) => charm.charmId), ...Object.keys(shared.BATTLE_SUPPLIES)];
  assert.deepEqual(Object.keys(charmAtlas.positions).sort(), charmIds.sort());
  const slots = Object.values(charmAtlas.positions);
  assert.equal(new Set(slots.map((slot) => slot.join(','))).size, charmIds.length);
  for (const [column, row] of slots) {
    assert.ok(Number.isInteger(column) && column >= 0 && column < charmAtlas.columns);
    assert.ok(Number.isInteger(row) && row >= 0 && row < charmAtlas.rows);
  }
  const catalog = new Set(shared.EXPEDITION_HEROES.map((hero) => hero.heroId));
  const paths = new Map([
    ['structures/rest-bonfire/rest-bonfire.png', [1024, 128]],
    ['structures/meadow/waterworks.png', [384, 384]],
    ['ui/charm-icons.png', [charmAtlas.columns * charmAtlas.cell, charmAtlas.rows * charmAtlas.cell]],
    ['ui/status-icons.png', [240, Math.ceil(shared.STATUS_IDS.length / 5) * 48]],
  ]);
  for (const heroId of catalog) {
    paths.set(`units/heroes/${heroId}-battle.png`, [1152, 1152]);
    paths.set(`units/heroes/${heroId}-movement.png`, [384, 512]);
    paths.set(`units/heroes/${heroId}-portrait.png`, [128, 128]);
    paths.set(`ui/weapons/${heroId}.png`, [128, 128]);
  }
  for (const boss of shared.EXPEDITION_BOSSES) paths.set(`units/bosses/${boss.spriteKey}-battle.png`, [1536, 1536]);
  for (const entry of wardrobe) {
    assert.ok(catalog.has(entry.heroId));
    paths.set(entry.battle, [1152, 1152]);
    paths.set(entry.movement, [384, 512]);
  }
  const usedLegacySlots = new Set();
  for (const w of shared.EXPEDITION_WILD_PACKS) {
    const map = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, `maps/${w.mapId}/${w.mapId}.tmj`), 'utf8'));
    assert.ok([1, 2, 3].includes(map.layers[0].data[w.y * map.width + w.x]), w.wildId);
    for (const id of w.monsterIds) {
      const monster = shared.EXPEDITION_MONSTERS_BY_ID[id];
      if (monster.dir === 'animals') usedLegacySlots.add(id);
      paths.set(`units/${monster.dir}/${id}-battle.png`, [1152, 768]);
      paths.set(`units/${monster.dir}/${id}-movement.png`, [384, 256]);
    }
  }
  assert.equal(usedLegacySlots.size, 12);
  for (const [asset, size] of paths) {
    assert.equal((await runStaticGuard('GET', `/database-astral-expedition/${asset}`)).passed, true, asset);
    assert.deepEqual([manifest[asset]?.width, manifest[asset]?.height], size, asset);
    const data = fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, asset));
    assert.equal(manifest[asset].sha256, createHash('sha256').update(data).digest('hex'), asset);
  }
});

test('all seven maps have connected walking tiles and all arenas have valid atlas frames', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, 'manifest.json'), 'utf8')).files;
  for (const realm of shared.EXPEDITION_REALMS) {
    const id = realm.mapId;
    const map = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT, `maps/${id}/${id}.tmj`), 'utf8'));
    const tiles = map.layers[0].data;
    if (realm.theme === 'meadow') {
      const landscape = map.layers.find((layer) => layer.name === 'landscape');
      assert.ok(landscape, 'Meadow scenery must be part of the runtime map');
      for (const type of ['stone-bridge', 'wooden-landing', 'tall-grass', 'cascade']) {
        assert.ok(landscape.objects.some((object) => object.type === type && object.visible !== false), type);
      }
    }
    const walkable = (x,y) => x>=0 && x<map.width && y>=0 && y<map.height && [1,2,3,6,7,8].includes(tiles[y*map.width+x]);
    const visited = new Set();
    const queue = [[realm.spawn.x,realm.spawn.y]];
    for (let i=0; i<queue.length; i++) {
      const [x,y] = queue[i];
      const idx = y*map.width+x;
      if (!walkable(x,y) || visited.has(idx)) continue;
      visited.add(idx);
      queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    assert.equal(visited.size, tiles.filter((gid)=>[1,2,3,6,7,8].includes(gid)).length,id);
    for (const anchor of realm.restAnchors) {
      assert.ok([[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>walkable(anchor.x+dx,anchor.y+dy)),anchor.anchorId);
    }
    const base = `battle-scenes/${id}/arena`;
    for (const [name,width,height] of [['ground',256,256],['floor',512,512],['panorama',2048,512],['props',1024,768]]) {
      const rel = `${base}/${name}.png`;
      assert.deepEqual([manifest[rel]?.width,manifest[rel]?.height],[width,height],rel);
      assert.equal((await runStaticGuard('GET',`/database-astral-expedition/${rel}`)).passed,true,rel);
      assert.equal(manifest[rel].sha256,createHash('sha256').update(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT,rel))).digest('hex'),rel);
    }
    const props = JSON.parse(fs.readFileSync(path.join(ASTRAL_EXPEDITION_ROOT,`${base}/props.json`),'utf8'));
    assert.deepEqual([props.width,props.height],[1024,768]);
    assert.equal(new Set(props.frames.map(f=>f.name)).size,6);
    for (const f of props.frames) {
      assert.ok(f.x>=0 && f.y>=0 && f.w>0 && f.h>0 && f.x+f.w<=props.width && f.y+f.h<=props.height && f.worldH>0, f.name);
    }
  }
});

test('campaign service replays all 20 gatekeepers and 7 bosses in order from a fresh profile', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-e2e-'));
  process.env.EXPEDITION_DATA_DIR = tmpDir;
  const redis = new ExpeditionRedisService();
  await redis.onModuleInit();
  const svc = new ExpeditionService(redis);
  const pid = `player_e2e_${Date.now().toString(36)}`;
  await assert.rejects(() => svc.warpRealm(pid, { fromMapId: '01-dawn-meadow', toMapId: '07-aurora-zenith' }), /không nối/);
  await assert.rejects(() => svc.markStorySeen(pid, { sceneId: 'post_boss:astral_painter_seraphina' }), /hạ Đại Trùm/);
  await svc.markStorySeen(pid, { sceneId: 'prologue' });

  // Helper that plays a full legitimate battle to victory
  async function playEncounterToVictory(encounterKind, targetId, mapId, reqSuffix) {
    const session = await svc.startBattle(pid, { encounterKind, targetId, mapId });
    const resumed = await svc.startBattle(pid, { encounterKind, targetId, mapId });
    assert.equal(resumed.battleId, session.battleId);
    const sim = structuredClone(session);
    const rng = new shared.Mulberry32(sim.battleSeed);
    const actionLog = [];
    let step = 0;

    while (sim.state !== 'VICTORY' && sim.state !== 'DEFEAT' && step < 350) {
      const actor = sim.combatants.find((c) => c.unitUid === sim.activeActorUid);
      if (actor.side === 'party') {
        const def = shared.EXPEDITION_HEROES_BY_ID[actor.templateId];
        const target = sim.combatants.filter((c) => c.side === 'enemy' && c.alive).sort((a, b) => a.hp - b.hp)[0];
        const skills = def.skillIds.filter((id) => actor.unlockedSkillIds.includes(id))
          .map((id) => shared.resolveSkillFor(actor, shared.EXPEDITION_SKILLS_BY_ID[id]))
          .filter((sk) => sk.apCost <= actor.ap && (sk.skill.targetScope === 'single_enemy' || sk.skill.targetScope === 'all_enemies'));
        const score = (sk) => sk.hits.reduce((n, h) => n + h.powerMult, 0) * sk.power
          * shared.affinityDamageMult(shared.affinityOf(sk.element, target));
        const skill = skills.sort((a, b) => score(b) - score(a))[0];
        const rec = {
          stepIndex: step++,
          actorUid: actor.unitUid,
          kind: 'player_skill',
          skillId: skill.skill.skillId,
          targetUid: target.unitUid,
          timedHitGrades: skill.hits.map(() => 'perfect'),
        };
        actionLog.push(rec);
        shared.executeTurnAction(sim, rec, rng);
      } else {
        const move = shared.getActiveEnemyMove(sim);
        const defenseGrades = {};
        for (const h of sim.combatants.filter((c) => c.side === 'party' && c.alive)) {
          defenseGrades[h.unitUid] = move.hitBeatsMs.map((_, i) => (move.specialFrom !== undefined && i >= move.specialFrom ? 'counter' : 'parry'));
        }
        const rec = { stepIndex: step++, actorUid: actor.unitUid, kind: 'enemy_turn', defenseGrades };
        actionLog.push(rec);
        shared.executeTurnAction(sim, rec, rng);
      }
    }

    const result = await svc.commitBattle(pid, { battleId: session.battleId, reqId: `req_${reqSuffix}`, actionLog });
    const retry = await svc.commitBattle(pid, { battleId: session.battleId, reqId: `req_${reqSuffix}`, actionLog });
    assert.equal(retry.profile.astralSeal, result.profile.astralSeal);
    assert.equal(retry.profile.expCrystal, result.profile.expCrystal);
    assert.deepEqual(retry.charms, result.charms);
    return result;
  }

  for (const realm of shared.EXPEDITION_REALMS) {
    const enter = shared.storySceneFor({ kind: 'enter', mapId: realm.mapId });
    await svc.markStorySeen(pid, { sceneId: enter.sceneId });
    const bossId = realm.bossAltar.bossId;
    const pre = shared.storySceneFor({ kind: 'pre_boss', bossId });
    await assert.rejects(() => svc.markStorySeen(pid, { sceneId: pre.sceneId }), /chưa mở/);
    for (const gkId of realm.gatekeeperIds) {
      const r = await playEncounterToVictory('gatekeeper', gkId, realm.mapId, gkId);
      assert.equal(r.outcome, 'victory', gkId);
      assert.equal(r.firstClear, true);
    }
    await svc.markStorySeen(pid, { sceneId: pre.sceneId });
    const result = await playEncounterToVictory('boss', bossId, realm.mapId, bossId);
    assert.equal(result.outcome, 'victory', bossId);
    const post = shared.storySceneFor({ kind: 'post_boss', bossId });
    await svc.markStorySeen(pid, { sceneId: post.sceneId });
    if (realm.exitPortal) {
      assert.equal(result.unlockedMapId, realm.exitPortal.toMapId);
      const warped = await svc.warpRealm(pid, { fromMapId: realm.mapId, toMapId: realm.exitPortal.toMapId });
      assert.equal(warped.currentMapId, realm.exitPortal.toMapId);
    }
  }
  const {profile} = await svc.getProfile(pid);
  assert.equal(profile.clearedGatekeepers.length, 20);
  assert.equal(profile.clearedBosses.length, 7);
  assert.equal(profile.storySeen.length, 22);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
