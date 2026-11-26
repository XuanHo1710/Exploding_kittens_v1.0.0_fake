'use strict';

// Spec 007 · C — skill súng nhóm đạn thường (12 khẩu): dữ liệu + hành vi handler.
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const WS = require('../dist/server/src/game/bansung/weapon-skills/index.js');
const K = require('../dist/server/src/game/bansung/weapon-skills/kinetic.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');

const KINETIC = [
  'pistol', 'rifle', 'smg', 'shotgun', 'sniper_rifle', 'dual_pistols',
  'minigun', 'saw_launcher', 'plasma_shotgun', 'twin_smg', 'ricochet_disc', 'phantom_bow',
];
const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };

function makeWorld(hero) {
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Tester', hero }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 4242, skipWarmup: true },
  );
  world.step();
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();
  const p = world.players[0];
  p.invulnTimer = 999;
  p.invulnMs = 60_000;
  p.energy = p.maxEnergy;
  p.weaponState.energy = p.energy;
  return world;
}

function dummyMob(world, x, y, hp = 900) {
  const m = spawnMob(world.mobMgr, { kind: 'cactus_brute', x, y, playerCount: 1, wave: 1, difficulty: 'normal' });
  m.hp = hp;
  m.maxHp = hp;
  m.stunMs = 10_000;
  return m;
}

test('kinetic skills: 12 súng có skill riêng, mô tả ngắn, có handler riêng', () => {
  for (const wid of KINETIC) {
    assert.equal(S.hasCustomWeaponSkill(wid), true, `${wid} phải có skill riêng`);
    const sk = S.getWeaponSkillSpec(wid);
    assert.ok(sk.desc.length <= 110, `${wid}: desc ≤ 110 (${sk.desc.length})`);
    assert.ok(sk.passive.desc.length <= 90, `${wid}: passive desc ≤ 90`);
    assert.ok(K.BANSUNG_KINETIC_SKILL_HANDLERS[wid], `${wid}: có handler`);
    assert.ok(K.BANSUNG_KINETIC_SKILL_HANDLERS[wid].passive, `${wid}: có nội tại`);
    assert.ok(S.BANSUNG_WEAPON_ROLES[wid].role.length > 0);
  }
  // Ràng buộc cân bằng cũ vẫn giữ
  assert.equal(S.BANSUNG_WEAPONS.rifle.energyCost, 0);
  assert.equal(S.BANSUNG_WEAPONS.shotgun.pellets, 6);
  for (const wid of KINETIC) {
    const w = S.BANSUNG_WEAPONS[wid];
    assert.ok(Math.abs(w.damagePair[0] - w.damage * w.armorMult[0]) < 0.051, `${wid}: damagePair[0]`);
    assert.ok(Math.abs(w.damagePair[1] - w.damage * w.armorMult[1]) < 0.051, `${wid}: damagePair[1]`);
  }
});

test('rifle Suppressive Fire: buff tốc bắn + vô hạn đạn + xuyên', (t) => {
  const world = makeWorld('mascot');
  t.after(() => world.stop());
  const p = world.players[0];
  assert.equal(p.weaponState.slots[p.weaponState.activeSlot].weaponId, 'rifle');
  assert.equal(world.enqueueCommand('p0', { t: 'wskill', x: p.x + 200, y: p.y }, { nowMs: 1000 }).ok, true);
  world.step();
  const m = WS.getWeaponSkillMods(p.wsk, null);
  assert.ok(m.fireRateMult >= 1.34, `fireRateMult ${m.fireRateMult}`);
  assert.equal(m.infiniteAmmo, true);
  assert.ok(m.extraPierce >= 1);
  assert.ok((p.wsk.cdMs.rifle ?? 0) > 0);
});

test('shotgun Dragon Breath: nón lửa gây sát thương + thiêu đốt mục tiêu trước mặt', (t) => {
  const world = makeWorld('knight');
  t.after(() => world.stop());
  const p = world.players[0];
  assert.equal(p.weaponState.slots[p.weaponState.activeSlot].weaponId, 'shotgun');
  const mob = dummyMob(world, p.x + 140, p.y);
  const hp0 = mob.hp;
  world.enqueueCommand('p0', { t: 'wskill', x: p.x + 140, y: p.y }, { nowMs: 1000 });
  world.step();
  assert.ok((p.wsk.cdMs.shotgun ?? 0) > 0, 'shotgun skill phải vào hồi chiêu');
  assert.ok(mob.hp < hp0, `Dragon Breath phải gây sát thương (hp ${mob.hp}/${hp0})`);
});

test('pistol Quickdraw: không có mục tiêu thì từ chối (không tốn hồi chiêu), có mục tiêu thì bắn', (t) => {
  const world = makeWorld('mascot');
  t.after(() => world.stop());
  const p = world.players[0];
  const pistolSlot = p.weaponState.slots.findIndex((s) => s && s.weaponId === 'pistol');
  if (pistolSlot < 0) return; // hero không có pistol khởi đầu
  world.enqueueCommand('p0', { t: 'slot', idx: pistolSlot }, { nowMs: 900 });
  for (let i = 0; i < 10; i++) world.step();
  assert.equal(p.weaponState.slots[p.weaponState.activeSlot].weaponId, 'pistol');
  world.enqueueCommand('p0', { t: 'wskill', x: p.x + 300, y: p.y }, { nowMs: 1500 });
  world.step();
  assert.equal(p.wsk.cdMs.pistol ?? 0, 0, 'không có zombie → Quickdraw bị từ chối');
  const mob = dummyMob(world, p.x + 160, p.y);
  const hp0 = mob.hp;
  world.enqueueCommand('p0', { t: 'wskill', x: p.x + 160, y: p.y }, { nowMs: 1700 });
  world.step();
  assert.ok((p.wsk.cdMs.pistol ?? 0) > 0, 'có zombie → vào hồi chiêu');
  assert.ok(mob.hp < hp0, 'Quickdraw phải trúng zombie');
});

// ── Nội tại thuần (không cần world) ────────────────────────────────────────────────
function fakeHero(over = {}) {
  return { x: 0, y: 0, hp: 100, maxHp: 100, aimRad: 0, weaponId: 'pistol', slot: { ammoInMag: 5 }, ...over };
}
function fakeApi(tickNo = 0) {
  return {
    tickNo,
    emitPassive() {},
    addBuff() {},
    grantEnergy() { return 0; },
    queryEnemies() { return []; },
  };
}

test('nội tại: Last Round, Last Stand, Spin Up, Split Arrow, Marksman Rhythm', () => {
  const H = K.BANSUNG_KINETIC_SKILL_HANDLERS;
  // pistol Last Round
  assert.equal(H.pistol.passive.mods(fakeHero({ slot: { ammoInMag: 1 } }), { vars: {}, stacks: 0 }).dmgMult, 1.6);
  assert.equal(H.pistol.passive.mods(fakeHero({ slot: { ammoInMag: 4 } }), { vars: {}, stacks: 0 }), undefined);
  // twin_smg Last Stand
  assert.equal(H.twin_smg.passive.mods(fakeHero({ hp: 30 }), { vars: {}, stacks: 0 }).fireRateMult, 1.25);
  assert.equal(H.twin_smg.passive.mods(fakeHero({ hp: 80 }), { vars: {}, stacks: 0 }), undefined);
  // minigun Spin Up: giữ cò 30 tick → tối đa 10 nấc, nhả cò thì nguội
  const ps = { vars: {}, stacks: 0 };
  for (let tk = 0; tk < 40; tk++) H.minigun.passive.onTick(fakeHero(), fakeApi(tk), ps, true);
  assert.equal(ps.stacks, 10);
  assert.ok(Math.abs(H.minigun.passive.mods(fakeHero(), ps).fireRateMult - 1.3) < 1e-9);
  for (let tk = 40; tk < 80; tk++) H.minigun.passive.onTick(fakeHero(), fakeApi(tk), ps, false);
  assert.equal(ps.stacks, 0);
  // phantom_bow Split Arrow: mũi thứ 5 có +2 tia
  const pb = { vars: {}, stacks: 0 };
  let splits = 0;
  for (let i = 0; i < 10; i++) {
    const m = H.phantom_bow.passive.mods(fakeHero(), pb);
    if (m && m.extraMultishot === 2) splits++;
    H.phantom_bow.passive.onShot(fakeHero(), fakeApi(i), pb);
  }
  assert.equal(splits, 2);
  // rifle Marksman Rhythm: cộng dồn tối đa 10, mất sạch sau 1.5 s không trúng
  const rr = { vars: {}, stacks: 0 };
  for (let i = 0; i < 15; i++) H.rifle.passive.onHit(fakeHero(), fakeApi(i), rr, {}, {});
  assert.equal(rr.stacks, 10);
  assert.ok(Math.abs(H.rifle.passive.mods(fakeHero(), rr).dmgMult - 1.2) < 1e-9);
  H.rifle.passive.onTick(fakeHero(), fakeApi(14 + 46), rr, false);
  assert.equal(rr.stacks, 0);
});
