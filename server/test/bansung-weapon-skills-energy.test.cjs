'use strict';

// Spec 007 · C — skill súng nhóm NĂNG LƯỢNG / PHÉP (15 khẩu). Dữ liệu + hành vi handler trên BansungWorld thật.
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const WS = require('../dist/server/src/game/bansung/weapon-skills/index.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');

const ENERGY_IDS = [
  'plasma_rifle', 'railgun', 'lightning_staff', 'arcane_book', 'laser_cannon',
  'electric_gun', 'flamethrower', 'cryo_cannon', 'gravity_gun', 'ion_beam',
  'tesla_coil', 'void_cannon', 'blizzard_carbine', 'magma_spitter', 'chronos_rifle',
];

const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };

function effDps(w) {
  const pellets = w.pellets || 1;
  const burst = w.burstCount || 1;
  const shot = w.damage * pellets * burst;
  const cyc = (w.cooldownTicks + (burst - 1) * (w.burstStepTicks || 0)) / 30;
  return (shot / cyc) * (1 + (w.critChance || 0) * ((w.critMult || 1) - 1));
}

/** World 1 người chơi cầm `weaponId` ở ô đang chọn, đầy năng lượng, bất tử, không có quái. */
function makeWorld(t, weaponId) {
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Tester', hero: 'laser' }],
    { bots: 0, biome: 'cyber', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 9191, skipWarmup: true },
  );
  t.after(() => world.stop());
  world.step();
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();
  const p = world.players[0];
  const slot = p.weaponState.slots[p.weaponState.activeSlot];
  slot.weaponId = weaponId;
  slot.ammoInMag = S.BANSUNG_WEAPONS[weaponId].magSize;
  p.invulnMs = 60_000;
  p.invulnTimer = 999;
  p.energy = p.maxEnergy;
  p.weaponState.energy = p.energy;
  return { world, p };
}

function addMob(world, p, x, y, hp = 2000) {
  const m = spawnMob(world.mobMgr, { kind: 'cactus_brute', x, y, playerCount: 1, wave: 1, difficulty: 'normal' });
  m.hp = hp;
  m.maxHp = hp;
  m.stunMs = 20_000;
  return m;
}

function cast(world, p, x, y, nowMs = 2000) {
  world.enqueueCommand('p0', { t: 'wskill', x, y }, { nowMs });
  world.step();
}

test('energy skills: 15 súng có skill riêng + handler + nội tại', () => {
  const ids = new Set();
  for (const wid of ENERGY_IDS) {
    assert.equal(S.BANSUNG_WEAPONS[wid].category, 'energy', wid);
    assert.equal(S.hasCustomWeaponSkill(wid), true, `${wid}: phải có skill riêng (không dùng Overdrive)`);
    const sk = S.getWeaponSkillSpec(wid);
    assert.notEqual(sk.id, 'overdrive');
    assert.equal(ids.has(sk.id), false, `trùng id ${sk.id}`);
    ids.add(sk.id);
    assert.ok(sk.desc.length <= 110, `${wid}: desc ≤ 110 ký tự`);
    assert.ok(sk.passive.desc.length <= 90, `${wid}: passive desc ≤ 90 ký tự`);
    assert.equal(WS.hasCustomWeaponSkillHandler(wid), true, `${wid}: có handler server`);
    const h = WS.resolveWeaponSkillHandler(wid);
    assert.ok(h.passive, `${wid}: có nội tại server`);
    if (sk.durationMs > 0 && sk.kind !== 'buff') {
      assert.ok(typeof h.step === 'function' || typeof h.end === 'function', `${wid}: skill có thời lượng cần step/end`);
    }
  }
});

test('energy balance: giữ các ràng buộc DPS / năng lượng', () => {
  const W = S.BANSUNG_WEAPONS;
  for (const wid of ['cryo_cannon', 'gravity_gun', 'void_cannon', 'chronos_rifle']) {
    assert.ok(effDps(W[wid]) >= 250, `${wid} effDps ${effDps(W[wid]).toFixed(1)} ≥ 250`);
  }
  for (const wid of ENERGY_IDS) {
    const w = W[wid];
    assert.ok(w.minEnergyCost <= w.energyCost, `${wid}: minEnergyCost ≤ energyCost`);
    assert.ok(Math.abs(w.damagePair[0] - w.damage * w.armorMult[0]) < 0.06, `${wid}: damagePair[0]`);
    assert.ok(Math.abs(w.damagePair[1] - w.damage * w.armorMult[1]) < 0.06, `${wid}: damagePair[1]`);
    assert.ok(S.BANSUNG_WEAPON_ROLES[wid].strength.length > 0);
  }
  assert.ok(W.lightning_staff.energyCost <= 4);
  // Ion beam là súng chống giáp rõ rệt nhất nhóm
  assert.ok(W.ion_beam.armorMult[1] / W.ion_beam.armorMult[0] >= 2);
});

test('railgun Rail Barrage: 3 tia xuyên trúng zombie thẳng hàng', (t) => {
  const { world, p } = makeWorld(t, 'railgun');
  const a = addMob(world, p, p.x + 300, p.y);
  const b = addMob(world, p, p.x + 520, p.y);
  world.step();
  cast(world, p, p.x + 600, p.y);
  for (let i = 0; i < 30; i++) world.step();
  assert.ok(a.hp < 2000 - 300, `mob gần mất ≥ 300 máu sau 3 tia (hp=${a.hp})`);
  assert.ok(b.hp < 2000 - 300, `tia xuyên trúng mob phía sau (hp=${b.hp})`);
  assert.ok((p.wsk.cdMs.railgun ?? 0) > 0);
});

test('electric_gun Arc Net: không có mục tiêu → không tốn hồi chiêu; có thì nhảy nhiều mục tiêu', (t) => {
  const { world, p } = makeWorld(t, 'electric_gun');
  const energy0 = p.energy;
  cast(world, p, p.x + 300, p.y);
  assert.equal(p.wsk.cdMs.electric_gun ?? 0, 0, 'không mục tiêu → không vào hồi chiêu');
  assert.ok(p.energy >= energy0 - 1, 'không mục tiêu → không tốn năng lượng');

  const mobs = [];
  for (let i = 0; i < 6; i++) mobs.push(addMob(world, p, p.x + 260 + i * 90, p.y + (i % 2 ? 40 : -40), 500));
  world.step();
  cast(world, p, p.x + 300, p.y, 3000);
  const hit = mobs.filter((m) => m.hp < 500).length;
  assert.ok(hit >= 5, `Arc Net phải nhảy ≥ 5 mục tiêu (trúng ${hit})`);
  assert.ok((p.wsk.cdMs.electric_gun ?? 0) > 0);
});

test('cryo_cannon Glacial Prison: làm chậm mạnh rồi băng vỡ gây sát thương', (t) => {
  const { world, p } = makeWorld(t, 'cryo_cannon');
  const m = addMob(world, p, p.x + 320, p.y);
  world.step();
  cast(world, p, m.x, m.y);
  assert.ok((m.slowPct ?? 0) >= 0.7, `slowPct ≥ 0.7 (got ${m.slowPct})`);
  const hpAfterCast = m.hp;
  assert.ok(hpAfterCast < 2000, 'sát thương khi đóng băng');
  for (let i = 0; i < 75; i++) world.step();
  assert.ok(m.hp < hpAfterCast - 100, `băng vỡ gây sát thương lớn (hp ${hpAfterCast} → ${m.hp})`);
});

test('gravity_gun Singularity: gây sát thương liên tục + sụp đổ cuối', (t) => {
  const { world, p } = makeWorld(t, 'gravity_gun');
  const m = addMob(world, p, p.x + 400, p.y);
  world.step();
  cast(world, p, m.x, m.y);
  assert.ok(p.wsk.active, 'hố đen đang hoạt động');
  for (let i = 0; i < 45; i++) world.step();
  const mid = m.hp;
  assert.ok(mid < 2000, 'sát thương trong lúc hút');
  for (let i = 0; i < 80; i++) world.step();
  assert.equal(p.wsk.active, null, 'hết thời lượng thì kết thúc');
  assert.ok(m.hp < mid - 150, `sụp đổ cuối gây sát thương lớn (hp ${mid} → ${m.hp})`);
});

test('plasma_rifle Plasma Overload: buff tốc bắn + xuyên + không hao đạn đổ vào chỉ số súng', (t) => {
  const { world, p } = makeWorld(t, 'plasma_rifle');
  cast(world, p, p.x + 200, p.y);
  const mods = WS.getWeaponSkillMods(p.wsk, null);
  assert.ok(mods.fireRateMult >= 1.49, `fireRateMult ${mods.fireRateMult}`);
  assert.ok(mods.extraPierce >= 1);
  assert.equal(mods.infiniteAmmo, true);
});

test('tesla_coil Tesla Tower: tháp giật zombie quanh nó nhiều lần', (t) => {
  const { world, p } = makeWorld(t, 'tesla_coil');
  const m1 = addMob(world, p, p.x + 380, p.y);
  const m2 = addMob(world, p, p.x + 420, p.y + 60);
  world.step();
  cast(world, p, p.x + 400, p.y);
  for (let i = 0; i < 70; i++) world.step();
  assert.ok(m1.hp < 2000 - 120 && m2.hp < 2000 - 120, `tháp giật nhiều nhịp (hp ${m1.hp}, ${m2.hp})`);
});

test('chronos_rifle Chrono Field: làm chậm 70% + buff tốc bắn & chí mạng cho người dùng', (t) => {
  const { world, p } = makeWorld(t, 'chronos_rifle');
  const m = addMob(world, p, p.x + 350, p.y);
  world.step();
  cast(world, p, m.x, m.y);
  for (let i = 0; i < 6; i++) world.step();
  assert.ok((m.slowPct ?? 0) >= 0.69, `slowPct ${m.slowPct}`);
  const mods = WS.getWeaponSkillMods(p.wsk, null);
  assert.ok(mods.fireRateMult >= 1.24);
  assert.ok(mods.critChanceAdd >= 0.14);
});
