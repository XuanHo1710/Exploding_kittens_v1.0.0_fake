'use strict';

// Spec 007 · C — khung skill súng (chuột giữa): dữ liệu 36 súng, kiểm tra lệnh, hồi chiêu riêng từng súng,
// năng lượng, buff đổ vào chỉ số súng, HUD frame.me.wsk. Các nhóm súng thêm test riêng ở cuối file này
// hoặc file bansung-weapon-skills-<nhóm>.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const sec = require('../dist/server/src/game/bansung/security.js');
const WS = require('../dist/server/src/game/bansung/weapon-skills/index.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');

const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };

function makeWorld(hero = 'mascot') {
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Tester', hero }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 4242, skipWarmup: true },
  );
  world.step();
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();
  return world;
}

test('weapon skills: đủ 36 súng, id duy nhất, tên ngắn, số liệu hợp lệ', () => {
  const ids = new Set();
  assert.equal(S.BANSUNG_WEAPON_IDS.length, 36);
  for (const wid of S.BANSUNG_WEAPON_IDS) {
    const sk = S.getWeaponSkillSpec(wid);
    assert.equal(sk.weaponId, wid, `${wid}: weaponId khớp`);
    assert.ok(/^[a-z0-9_]+$/.test(sk.id), `${wid}: id snake_case (${sk.id})`);
    assert.equal(ids.has(sk.id), false, `trùng skill id ${sk.id}`);
    ids.add(sk.id);
    assert.ok(sk.name.length > 0 && sk.name.split(' ').length <= 3, `${wid}: tên tiếng Anh ngắn (${sk.name})`);
    assert.ok(sk.cooldownMs >= 3000 && sk.cooldownMs <= 60000, `${wid}: hồi chiêu 3–60 s (${sk.cooldownMs})`);
    assert.ok(sk.energyCost >= 0 && sk.energyCost <= 80, `${wid}: năng lượng 0–80 (${sk.energyCost})`);
    assert.ok(sk.durationMs >= 0 && sk.durationMs <= 15000, `${wid}: thời lượng ≤ 15 s`);
    assert.match(sk.color, /^#[0-9a-f]{6}$/i, `${wid}: màu hex`);
    assert.ok(sk.passive && sk.passive.name && sk.passive.desc, `${wid}: có nội tại`);
    assert.equal(typeof WS.resolveWeaponSkillHandler(wid).cast, 'function', `${wid}: có handler`);
  }
});

test('weapon skills: hệ số theo cấp Mk tăng sát thương, giảm hồi chiêu', () => {
  assert.equal(S.getWeaponSkillTierDmgMult(1), 1);
  assert.ok(S.getWeaponSkillTierDmgMult(10) > S.getWeaponSkillTierDmgMult(4));
  assert.equal(S.getWeaponSkillTierCdMult(1), 1);
  assert.ok(S.getWeaponSkillTierCdMult(10) < S.getWeaponSkillTierCdMult(4));
  assert.ok(S.getWeaponSkillTierCdMult(10) >= 0.64);
});

test('weapon skills: lệnh wskill được kiểm tra & kẹp toạ độ', () => {
  assert.deepEqual(sec.validateBansungCommand({ t: 'wskill' }), { ok: true, cmd: { t: 'wskill' } });
  const r = sec.validateBansungCommand({ t: 'wskill', x: -50, y: 99999 });
  assert.equal(r.ok, true);
  assert.equal(r.cmd.x, 0);
  assert.ok(r.cmd.y <= S.BANSUNG_MAP_H);
  assert.equal(sec.validateBansungCommand({ t: 'wskill', x: 'a', y: 1 }).ok, false);
});

test('weapon skills: dùng skill → hồi chiêu riêng từng súng + trừ năng lượng + HUD', (t) => {
  const world = makeWorld('mascot');
  t.after(() => world.stop());
  const p = world.players[0];
  p.invulnTimer = 999;
  const slotIdx = p.weaponState.activeSlot;
  const wid = p.weaponState.slots[slotIdx].weaponId;
  const spec = S.getWeaponSkillSpec(wid);
  p.energy = p.maxEnergy;
  p.weaponState.energy = p.energy;
  const before = p.energy;

  assert.equal(world.enqueueCommand('p0', { t: 'wskill', x: p.x + 200, y: p.y }, { nowMs: 1000 }).ok, true);
  world.step();
  assert.ok((p.wsk.cdMs[wid] ?? 0) > 0, `${wid}: phải vào hồi chiêu`);
  assert.ok(p.energy <= before - spec.energyCost + 3, 'phải trừ năng lượng (cho phép hồi nhẹ trong tick)');

  const f = world.frameFor('p0', true);
  assert.ok(f.me && f.me.wsk, 'frame.me.wsk phải có');
  assert.equal(f.me.wsk.weaponId, wid);
  assert.ok(f.me.wsk.cdMs > 0 && f.me.wsk.maxMs >= f.me.wsk.cdMs);

  // Dùng lại ngay → bị chặn bởi hồi chiêu (hồi chiêu không reset)
  const cd1 = p.wsk.cdMs[wid];
  world.enqueueCommand('p0', { t: 'wskill' }, { nowMs: 1100 });
  world.step();
  assert.ok(p.wsk.cdMs[wid] < cd1, 'hồi chiêu chỉ giảm dần, không reset');

  // Đổi sang súng khác: hồi chiêu súng kia không ảnh hưởng
  const other = p.weaponState.slots.findIndex((s, i) => s && i !== slotIdx && s.weaponId !== wid);
  if (other >= 0) {
    world.enqueueCommand('p0', { t: 'slot', idx: other }, { nowMs: 1200 });
    for (let i = 0; i < 8; i++) world.step();
    const wid2 = p.weaponState.slots[p.weaponState.activeSlot].weaponId;
    assert.notEqual(wid2, wid);
    assert.equal(p.wsk.cdMs[wid2] ?? 0, 0, 'súng mới chưa có hồi chiêu');
    assert.ok((p.wsk.cdMs[wid] ?? 0) > 0, 'súng cũ vẫn giữ hồi chiêu');
  }
});

test('weapon skills: thiếu năng lượng thì không dùng được và không tốn hồi chiêu', (t) => {
  const world = makeWorld('ranger');
  t.after(() => world.stop());
  const p = world.players[0];
  const wid = p.weaponState.slots[p.weaponState.activeSlot].weaponId;
  const spec = S.getWeaponSkillSpec(wid);
  if (spec.energyCost <= 0) return;
  p.energy = 0;
  p.weaponState.energy = 0;
  world.enqueueCommand('p0', { t: 'wskill' }, { nowMs: 1000 });
  world.step();
  assert.equal(p.wsk.cdMs[wid] ?? 0, 0);
});

test('weapon skills: buff tạm thời đổ vào chỉ số súng rồi hết hạn', () => {
  const rt = WS.createWeaponSkillRuntime();
  rt.buffs.push({ mods: { fireRateMult: 1.5, dmgMult: 1.2, extraPierce: 2 }, ms: 100 });
  const m = WS.getWeaponSkillMods(rt, null);
  assert.ok(Math.abs(m.fireRateMult - 1.5) < 1e-9);
  assert.ok(Math.abs(m.dmgMult - 1.2) < 1e-9);
  assert.equal(m.extraPierce, 2);
  WS.tickWeaponSkillTimers(rt, 120);
  const m2 = WS.getWeaponSkillMods(rt, null);
  assert.equal(m2.fireRateMult, 1);
  assert.equal(rt.buffs.length, 0);
  // Kẹp chống cộng dồn vô hạn
  for (let i = 0; i < 10; i++) rt.buffs.push({ mods: { dmgMult: 3 }, ms: 1000 });
  assert.ok(WS.getWeaponSkillMods(rt, null).dmgMult <= 4);
});

test('weapon skills: gục ngã huỷ skill đang chạy và xoá buff', (t) => {
  const world = makeWorld('knight');
  t.after(() => world.stop());
  const p = world.players[0];
  p.energy = p.maxEnergy;
  p.weaponState.energy = p.energy;
  world.enqueueCommand('p0', { t: 'wskill' }, { nowMs: 1000 });
  world.step();
  p.wsk.buffs.push({ mods: { dmgMult: 2 }, ms: 9999 });
  p.invulnTimer = 0;
  p.hp = 0;
  p.shield = 0;
  world.step();
  if (p.downed || p.life !== 'alive') {
    assert.equal(p.wsk.active, null);
    assert.equal(p.wsk.buffs.length, 0);
  }
});
