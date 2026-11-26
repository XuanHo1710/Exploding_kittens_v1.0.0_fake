'use strict';

// Spec 007 · C — skill súng nhóm CẬN CHIẾN: crescent_blade (Moon Dash), reaper_scythe (Death Whirl),
// shock_baton (Tesla Dome) + 3 nội tại (Crescent Flow, Soul Harvest, Overcharge).
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const WS = require('../dist/server/src/game/bansung/weapon-skills/index.js');
const M = require('../dist/server/src/game/bansung/weapon-skills/melee.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');

const MELEE = ['crescent_blade', 'reaper_scythe', 'shock_baton'];
const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };

function makeMeleeWorld(weaponId, seed = 9191) {
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Blade', hero: 'knight' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed, skipWarmup: true },
  );
  world.step();
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();
  const p = world.players[0];
  const ws = p.weaponState;
  let idx = ws.slots.findIndex((s) => s && s.weaponId === weaponId);
  if (idx < 0) {
    idx = ws.activeSlot;
    ws.slots[idx].weaponId = weaponId;
    ws.slots[idx].tier = 1;
    ws.slots[idx].ammoInMag = 0;
  }
  ws.activeSlot = idx;
  p.invulnTimer = 999;
  p.energy = p.maxEnergy;
  ws.energy = p.energy;
  return { world, p };
}

function addZombie(world, x, y) {
  const mob = spawnMob(world.mobMgr, {
    kind: 'cactus_brute',
    x,
    y,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  mob.hp = 5000;
  mob.maxHp = 5000;
  mob.stunMs = 60_000;
  return mob;
}

test('melee skills: dữ liệu 3 skill riêng + handler riêng + mô tả ngắn', () => {
  for (const wid of MELEE) {
    const sk = S.getWeaponSkillSpec(wid);
    assert.equal(S.hasCustomWeaponSkill(wid), true, `${wid}: phải có skill riêng`);
    assert.equal(WS.hasCustomWeaponSkillHandler(wid), true, `${wid}: phải có handler riêng`);
    assert.ok(sk.desc.length <= 110, `${wid}: desc ≤ 110 ký tự`);
    assert.ok(sk.passive.desc.length <= 90, `${wid}: passive desc ≤ 90 ký tự`);
    assert.notEqual(sk.id, 'overdrive');
  }
  assert.equal(S.getWeaponSkillSpec('crescent_blade').energyCost, 0, 'Nguyệt Đao luôn miễn phí');
  // Số liệu súng cơ bản giữ nhất quán damagePair = damage × armorMult
  for (const wid of MELEE) {
    const w = S.BANSUNG_WEAPONS[wid];
    assert.ok(Math.abs(w.damagePair[0] - w.damage * w.armorMult[0]) < 0.06, `${wid} damagePair[0]`);
    assert.ok(Math.abs(w.damagePair[1] - w.damage * w.armorMult[1]) < 0.06, `${wid} damagePair[1]`);
    assert.ok(Math.abs(w.cooldownMs - w.cooldownTicks * 33.333) < 1.5, `${wid} cooldownMs khớp ticks`);
  }
  // shock_baton vẫn lan ≤ 70px (test cũ: 40px lan, 110px không lan)
  assert.ok(S.BANSUNG_WEAPONS.shock_baton.chainRange >= 45 && S.BANSUNG_WEAPONS.shock_baton.chainRange <= 70);
});

test('Moon Dash: lướt về hướng ngắm, bất tử, chém zombie trên đường', (t) => {
  const { world, p } = makeMeleeWorld('crescent_blade');
  t.after(() => world.stop());
  p.invulnTimer = 0;
  const z = addZombie(world, p.x + 90, p.y);
  world.step();
  const x0 = p.x;
  const hp0 = z.hp;
  assert.equal(world.enqueueCommand('p0', { t: 'wskill', x: p.x + 400, y: p.y }, { nowMs: 1000 }).ok, true);
  world.step();
  assert.ok(p.invulnTimer > 0, 'phải có i-frame khi lướt');
  for (let i = 0; i < 8; i++) world.step();
  assert.ok(p.x - x0 > 40 || z.hp < hp0, `phải lướt tới trước (dx=${p.x - x0})`);
  assert.ok(z.hp < hp0, `zombie trên đường lướt phải mất máu (${hp0} → ${z.hp})`);
  assert.ok((p.wsk.cdMs.crescent_blade ?? 0) > 0, 'vào hồi chiêu');
});

test('Death Whirl: xoay quanh mình trúng cả bầy và hút máu', (t) => {
  const { world, p } = makeMeleeWorld('reaper_scythe');
  t.after(() => world.stop());
  const zs = [addZombie(world, p.x + 60, p.y), addZombie(world, p.x - 60, p.y), addZombie(world, p.x, p.y + 70)];
  world.step();
  p.hp = Math.max(1, p.maxHp - 40);
  const hpBefore = p.hp;
  const zhp = zs.map((z) => z.hp);
  const e0 = p.energy;
  assert.equal(world.enqueueCommand('p0', { t: 'wskill' }, { nowMs: 1000 }).ok, true);
  for (let i = 0; i < 40; i++) world.step();
  zs.forEach((z, i) => assert.ok(z.hp < zhp[i], `zombie ${i} phải trúng vòng xoáy`));
  assert.ok(p.hp > hpBefore, `phải hút máu (${hpBefore} → ${p.hp})`);
  assert.ok(e0 - p.energy >= S.getWeaponSkillSpec('reaper_scythe').energyCost - 25, 'trừ năng lượng');
});

test('Tesla Dome: +khiên, làm chậm và gây sát thương zombie trong vòm', (t) => {
  const { world, p } = makeMeleeWorld('shock_baton');
  t.after(() => world.stop());
  const z = addZombie(world, p.x + 100, p.y);
  const far = addZombie(world, p.x + 420, p.y);
  world.step();
  p.shield = 0;
  const hp0 = z.hp;
  const farHp = far.hp;
  assert.equal(world.enqueueCommand('p0', { t: 'wskill' }, { nowMs: 1000 }).ok, true);
  world.step();
  assert.ok(p.shield > 0, 'vòm phải cho khiên');
  for (let i = 0; i < 30; i++) world.step();
  assert.ok(z.hp < hp0, 'zombie trong vòm mất máu');
  assert.equal(far.hp, farHp, 'zombie ngoài vòm (420px) không bị ảnh hưởng');
});

// ---------------------------------------------------------------------------
// Nội tại — test đơn vị với api giả
// ---------------------------------------------------------------------------

function fakeApi(tickNo, extra = {}) {
  const calls = { heal: 0, damage: [], beams: 0 };
  const api = {
    tickNo,
    dtMs: 1000 / 30,
    heal(hp) {
      calls.heal += hp;
      return hp;
    },
    emitPassive() {},
    emitBeam() {
      calls.beams += 1;
    },
    queryEnemies: () => extra.enemies || [],
    damageTarget(info, hit) {
      calls.damage.push({ info, hit });
      return { blocked: false, totalDmg: hit.baseDmg };
    },
  };
  return { api, calls };
}

const hero = { x: 0, y: 0 };

test('Crescent Flow: +1 tầng mỗi tick trúng, tối đa 5, mất dần khi ngừng đánh', () => {
  const ph = M.BANSUNG_MELEE_SKILL_HANDLERS.crescent_blade.passive;
  const ps = { vars: {}, stacks: 0 };
  ph.onHit(hero, fakeApi(10).api, ps, {}, {});
  ph.onHit(hero, fakeApi(10).api, ps, {}, {}); // cùng tick → không cộng thêm
  assert.equal(ps.stacks, 1);
  for (let k = 11; k < 20; k++) ph.onHit(hero, fakeApi(k).api, ps, {}, {});
  assert.equal(ps.stacks, 5);
  assert.ok(Math.abs(ph.mods(hero, ps).fireRateMult - 1.3) < 1e-9);
  for (let k = 20; k < 400; k++) ph.onTick(hero, fakeApi(k).api, ps, false);
  assert.equal(ps.stacks, 0);
  assert.equal(ph.mods(hero, ps), undefined, 'không tầng → không đổi chỉ số');
});

test('Soul Harvest: hạ zombie cộng linh hồn (tối đa 10) + hồi máu', () => {
  const ph = M.BANSUNG_MELEE_SKILL_HANDLERS.reaper_scythe.passive;
  const ps = { vars: {}, stacks: 0 };
  let healed = 0;
  for (let k = 0; k < 14; k++) {
    const f = fakeApi(100 + k);
    ph.onKill(hero, f.api, ps, {});
    healed += f.calls.heal;
  }
  assert.equal(ps.stacks, 10);
  assert.equal(healed, 14);
  assert.ok(Math.abs(ph.mods(hero, ps).dmgMult - 1.3) < 1e-9);
  assert.equal(ph.mods(hero, ps).critDmgMult, undefined, 'không đụng critDmgMult');
});

test('Overcharge: mỗi 5 nhát trúng phóng 1 tia sét sang zombie khác', () => {
  const ph = M.BANSUNG_MELEE_SKILL_HANDLERS.shock_baton.passive;
  const ps = { vars: {}, stacks: 0 };
  const primary = { id: 1, x: 100, y: 100 };
  const other = { target: { id: 2 }, actorId: 2, x: 140, y: 100, radius: 12, isBoss: false, dist: 40 };
  const self = { target: primary, actorId: 1, x: 100, y: 100, radius: 12, isBoss: false, dist: 0 };
  let arcs = 0;
  for (let k = 0; k < 10; k++) {
    const f = fakeApi(k, { enemies: [self, other] });
    ph.onHit(hero, f.api, ps, primary, {});
    arcs += f.calls.damage.length;
    for (const d of f.calls.damage) assert.equal(d.info, other, 'không tự giật lại mục tiêu chính');
  }
  assert.equal(arcs, 2);
});
