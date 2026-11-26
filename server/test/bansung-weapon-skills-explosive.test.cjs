'use strict';

// Spec 007 · C — skill súng nhóm chất nổ (grenade_launcher, stun_launcher, bazooka, mine_gun,
// cluster_rpg, orbital_cannon). Handler được chạy với api giả lập để kiểm tra hành vi chính xác,
// cộng 1 bài tích hợp với BansungWorld thật.
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const WS = require('../dist/server/src/game/bansung/weapon-skills/index.js');
const EX = require('../dist/server/src/game/bansung/weapon-skills/explosive.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');

const IDS = ['grenade_launcher', 'stun_launcher', 'bazooka', 'mine_gun', 'cluster_rpg', 'orbital_cannon'];

function mkHero(weaponId, over = {}) {
  return {
    id: 'p0', idx: 0, actorId: 1, team: 0, x: 400, y: 400, radius: 12, aimRad: 0,
    targetX: 600, targetY: 400, weaponId, tier: 1, spec: S.getWeaponSkillSpec(weaponId),
    weaponState: {}, slot: {}, hp: 100, maxHp: 100, shield: 0, maxShield: 50,
    energy: 100, maxEnergy: 100, dmgScale: 1, durationScale: 1, isBot: false,
    ...over,
  };
}

function mkEnemy(id, x, y, opts = {}) {
  return {
    actorId: id, x, y, radius: 12, isBoss: !!opts.boss, dist: 0,
    target: { id, alive: true, hp: 1000, maxHp: 1000, slowPct: 0, slowMs: 0 },
  };
}

/** Api giả lập: ghi lại mọi lời gọi; kẻ địch đặt sẵn trong `enemies`. */
function mkApi(enemies = []) {
  const log = { proj: [], hits: [], blasts: [], beams: [], casts: [], buffs: [], shield: 0, moves: [], passive: 0 };
  let tickNo = 1000;
  const api = {
    get tickNo() { return tickNo; },
    set tickNo(v) { tickNo = v; },
    dtMs: 1000 / 30,
    rng: () => 0.25,
    fx() {},
    emitCast(x, y) { log.casts.push([x, y]); },
    emitImpact() {},
    emitEnd() {},
    emitPassive() { log.passive += 1; },
    emitBeam(x0, y0, x1, y1, k) { log.beams.push([x0, y0, x1, y1, k]); },
    emitBlast(k, x, y, r) { log.blasts.push([k, x, y, r]); },
    sfx() {},
    queryEnemies(x, y, r) {
      const out = [];
      for (const e of enemies) {
        if (!e.target.alive) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d <= r + e.radius) out.push({ ...e, dist: d });
      }
      out.sort((a, b) => a.dist - b.dist);
      return out;
    },
    nearestEnemy(x, y, r) { return api.queryEnemies(x, y, r)[0] ?? null; },
    damageTarget(info, hit) {
      log.hits.push({ id: info.actorId, ...hit });
      return { hpDmg: hit.baseDmg, totalDmg: hit.baseDmg, blocked: false, killed: false, stunAppliedMs: hit.stunMs ?? 0 };
    },
    damageCircle() { return 0; },
    damageLine() { return 0; },
    damageCone() { return 0; },
    spawnProjectile(p) { log.proj.push(p); return true; },
    hasLineOfSight() { return true; },
    raycastWall(_x, _y, _a, m) { return m; },
    moveHero(dx, dy) { log.moves.push([dx, dy]); return { x: 0, y: 0 }; },
    setInvuln() {},
    heal() { return 0; },
    addShield(n) { log.shield += n; return n; },
    grantEnergy() { return 0; },
    refillMag() {},
    addBuff(mods, ms, tag) { log.buffs.push({ mods, ms, tag }); },
    pushActor() {},
  };
  return { api, log };
}

function mkState(hero, durationMs) {
  return {
    startTick: 1000, tick: 0, elapsedMs: 0, durationMs, aim: hero.aimRad,
    tx: hero.targetX, ty: hero.targetY, vars: {}, hit: new Set(),
  };
}

/** Chạy cast + step tới hết thời lượng như framework (end gọi khi hết giờ / step trả false). */
function runSkill(hero, api, durationMs) {
  const h = WS.resolveWeaponSkillHandler(hero.weaponId);
  const st = mkState(hero, durationMs);
  assert.equal(h.cast(hero, api, st), true, `${hero.weaponId}: cast phải thành công`);
  if (durationMs > 0 && h.step) {
    for (let i = 0; i < 1000; i++) {
      st.tick += 1;
      st.elapsedMs += api.dtMs;
      const keep = h.step(hero, api, st);
      if (keep === false || st.elapsedMs >= st.durationMs) break;
    }
  }
  if (h.end) h.end(hero, api, st);
  return st;
}

test('explosive skills: dữ liệu đủ 6 súng, handler riêng (không dùng Overdrive mặc định)', () => {
  for (const wid of IDS) {
    assert.equal(S.hasCustomWeaponSkill(wid), true, `${wid}: phải có skill riêng`);
    assert.ok(EX.BANSUNG_EXPLOSIVE_SKILL_HANDLERS[wid], `${wid}: có handler`);
    assert.equal(WS.resolveWeaponSkillHandler(wid), EX.BANSUNG_EXPLOSIVE_SKILL_HANDLERS[wid]);
    const sk = S.getWeaponSkillSpec(wid);
    assert.ok(sk.desc.length <= 110, `${wid}: desc ≤ 110 ký tự`);
    assert.ok(sk.passive.desc.length <= 90, `${wid}: passive desc ≤ 90 ký tự`);
    assert.ok(sk.energyCost >= 10, `${wid}: skill nổ phải tốn năng lượng đáng kể`);
  }
});

test('explosive balance: damagePair = damage × armorMult, ràng buộc cũ còn nguyên', () => {
  for (const wid of IDS) {
    const w = S.BANSUNG_WEAPONS[wid];
    assert.ok(Math.abs(w.damagePair[0] - w.damage * w.armorMult[0]) < 0.06, `${wid}: damagePair[0]`);
    assert.ok(Math.abs(w.damagePair[1] - w.damage * w.armorMult[1]) < 0.06, `${wid}: damagePair[1]`);
  }
  assert.ok(S.BANSUNG_WEAPONS.bazooka.energyCost >= 8);
  assert.equal(S.BANSUNG_WEAPONS.grenade_launcher.shrapnelCount, 6);
  // Vai trò rõ: bazooka mạnh nhất với giáp, lựu mạnh với quái nhẹ
  assert.ok(S.BANSUNG_WEAPONS.bazooka.armorMult[1] > S.BANSUNG_WEAPONS.bazooka.armorMult[0]);
  assert.ok(S.BANSUNG_WEAPONS.grenade_launcher.armorMult[0] > S.BANSUNG_WEAPONS.grenade_launcher.armorMult[1]);
});

test('Frag Barrage: rải đúng 5 lựu hình quạt về phía con trỏ', () => {
  const hero = mkHero('grenade_launcher');
  const { api, log } = mkApi();
  runSkill(hero, api, S.getWeaponSkillSpec('grenade_launcher').durationMs);
  assert.equal(log.proj.length, 5);
  for (const p of log.proj) {
    assert.equal(p.kind, 'frag_grenade');
    assert.equal(p.isExplosive, true);
    assert.equal(p.shrapnelCount, 6);
    assert.ok(p.vx > 0, 'bay về phía con trỏ (bên phải)');
  }
  const angs = log.proj.map((p) => Math.atan2(p.vy, p.vx));
  assert.ok(Math.max(...angs) - Math.min(...angs) > 0.4, 'phải toả hình quạt');
});

test('Concussion Dome: cảnh báo trước, nổ ở tick 24; boss chỉ choáng ≤ 300ms và không bị đẩy', () => {
  const hero = mkHero('stun_launcher', { targetX: 600, targetY: 400 });
  const mob = mkEnemy(10, 620, 400);
  const boss = mkEnemy(11, 560, 420, { boss: true });
  const far = mkEnemy(12, 900, 400);
  const { api, log } = mkApi([mob, boss, far]);
  const h = WS.resolveWeaponSkillHandler('stun_launcher');
  const st = mkState(hero, 900);
  assert.equal(h.cast(hero, api, st), true);
  assert.equal(log.casts.length, 1, 'emitCast để client vẽ vòng cảnh báo');
  for (let t = 1; t < 24; t++) { st.tick = t; h.step(hero, api, st); }
  assert.equal(log.hits.length, 0, 'chưa nổ trong thời gian cảnh báo');
  st.tick = 24;
  h.step(hero, api, st);
  const mobHit = log.hits.find((x) => x.id === 10);
  const bossHit = log.hits.find((x) => x.id === 11);
  assert.ok(mobHit && mobHit.stunMs === 1200 && mobHit.knockback > 0);
  assert.ok(bossHit && bossHit.stunMs <= 300 && !bossHit.knockback);
  assert.equal(log.hits.some((x) => x.id === 12), false, 'ngoài bán kính 180 không trúng');
});

test('Shock Plating: làm choáng → +2 khiên, tối đa 2 lần mỗi giây', () => {
  const hero = mkHero('stun_launcher');
  const { api, log } = mkApi();
  const ps = { vars: {}, stacks: 0 };
  const h = WS.resolveWeaponSkillHandler('stun_launcher').passive;
  const tgt = { alive: true };
  h.onHit(hero, api, ps, tgt, { stunAppliedMs: 500 });
  h.onHit(hero, api, ps, tgt, { stunAppliedMs: 500 });
  assert.equal(log.shield, 2, 'chặn lặp trong 0.5s');
  api.tickNo = api.tickNo + 15;
  h.onHit(hero, api, ps, tgt, { stunAppliedMs: 500 });
  assert.equal(log.shield, 4);
  h.onHit(hero, api, ps, tgt, { stunAppliedMs: 0 });
  assert.equal(log.shield, 4, 'không choáng thì không có khiên');
});

test('Tank Buster: 1 rocket HEAT xuyên giáp, giật lùi người bắn', () => {
  const hero = mkHero('bazooka');
  const { api, log } = mkApi();
  runSkill(hero, api, 0);
  assert.equal(log.proj.length, 1);
  const r = log.proj[0];
  assert.equal(r.kind, 'rocket');
  assert.ok(r.baseDmg >= 4 * S.BANSUNG_WEAPONS.bazooka.damage);
  assert.ok(r.armorPiercePct >= 0.5);
  assert.ok(r.blastRadius > S.BANSUNG_WEAPONS.bazooka.blastRadius);
  assert.equal(log.moves.length, 1);
  assert.ok(log.moves[0][0] < 0, 'giật lùi ngược hướng bắn');
});

test('Siege Lock: đứng yên 1s mới tăng sát thương', () => {
  const ph = WS.resolveWeaponSkillHandler('bazooka').passive;
  const { api } = mkApi();
  const ps = { vars: {}, stacks: 0 };
  const hero = mkHero('bazooka');
  for (let i = 0; i < 29; i++) ph.onTick(hero, api, ps, false);
  assert.equal(ph.mods(hero, ps), undefined);
  ph.onTick(hero, api, ps, false);
  ph.onTick(hero, api, ps, false);
  const m = ph.mods(hero, ps);
  assert.ok(m && m.dmgMult > 1 && m.blastRadiusMult > 1);
  assert.equal(m.critDmgMult, undefined);
  assert.equal(m.energyCostMult, undefined);
  ph.onTick(mkHero('bazooka', { x: 430 }), api, ps, false);
  assert.equal(ph.mods(hero, ps), undefined, 'di chuyển thì mất');
});

test('Minefield: 6 mìn, zombie lại gần thì nổ, hết giờ kích nổ phần còn lại', () => {
  const hero = mkHero('mine_gun', { targetX: 600, targetY: 400 });
  const { api, log } = mkApi([]);
  const h = WS.resolveWeaponSkillHandler('mine_gun');
  const st = mkState(hero, 6000);
  assert.equal(h.cast(hero, api, st), true);
  // Đặt 1 zombie đứng ngay trên mìn số 0
  const z = mkEnemy(20, st.vars.m0x, st.vars.m0y);
  const { api: api2, log: log2 } = mkApi([z]);
  for (let t = 1; t < 15; t++) { st.tick = t; h.step(hero, api2, st); }
  assert.equal(log2.blasts.length, 0, 'mìn chưa gài xong trong 0.5s');
  st.tick = 15;
  assert.notEqual(h.step(hero, api2, st), false);
  assert.ok(log2.blasts.length >= 1, 'mìn nổ khi zombie lại gần');
  const hit = log2.hits.find((x) => x.id === 20);
  assert.ok(hit && hit.slowPct > 0, 'mìn skill làm chậm');
  const exploded = log2.blasts.length;
  h.end(hero, api, st);
  assert.equal(exploded + log.blasts.length, 6, 'tổng cộng đúng 6 lần nổ');
});

test('Tripwire: đòn mìn thường làm chậm 35%', () => {
  const ph = WS.resolveWeaponSkillHandler('mine_gun').passive;
  const { api } = mkApi();
  const tgt = { alive: true, slowPct: 0, slowMs: 0 };
  ph.onHit(mkHero('mine_gun'), api, { vars: {}, stacks: 0 }, tgt, { stunAppliedMs: 0 });
  assert.equal(tgt.slowPct, 0.35);
  assert.equal(tgt.slowMs, 1200);
});

test('Hydra Swarm: 8 tên lửa tự dẫn, toả 2 bên', () => {
  const hero = mkHero('cluster_rpg');
  const { api, log } = mkApi();
  runSkill(hero, api, S.getWeaponSkillSpec('cluster_rpg').durationMs);
  assert.equal(log.proj.length, 8);
  assert.ok(log.proj.every((p) => p.isHoming && p.homingTurnRateRadPerS > 0 && p.kind === 'cluster_rocket'));
  assert.ok(log.proj.some((p) => p.vy > 0) && log.proj.some((p) => p.vy < 0));
});

test('Split Payload: mỗi phát thứ 4 được thêm 1 tên lửa', () => {
  const ph = WS.resolveWeaponSkillHandler('cluster_rpg').passive;
  const { api, log } = mkApi();
  const ps = { vars: {}, stacks: 0 };
  for (let i = 0; i < 8; i++) ph.onShot(mkHero('cluster_rpg'), api, ps);
  assert.equal(log.buffs.length, 2);
  assert.equal(log.buffs[0].mods.extraMultishot, 1);
});

test('Orbital Strike: 1s cảnh báo rồi 5 phát pháo, phát cuối lớn nhất', () => {
  const hero = mkHero('orbital_cannon', { targetX: 700, targetY: 400 });
  const center = mkEnemy(30, 700, 400);
  const { api, log } = mkApi([center]);
  const h = WS.resolveWeaponSkillHandler('orbital_cannon');
  const st = mkState(hero, 2600);
  assert.equal(h.cast(hero, api, st), true);
  for (let t = 1; t < 30; t++) { st.tick = t; h.step(hero, api, st); }
  assert.equal(log.blasts.length, 0, 'không nổ trong 1s cảnh báo');
  runSkill(hero, mkApi([]).api, 2600); // chạy riêng 1 lần đầy đủ để đếm
  const full = mkApi([center]);
  runSkill(hero, full.api, 2600);
  assert.equal(full.log.blasts.length, 5);
  assert.equal(full.log.beams.length, 5);
  assert.ok(full.log.blasts.every((b) => b[0] === S.BANSUNG_FX_BLAST_ORBITAL));
  const radii = full.log.blasts.map((b) => b[3]);
  assert.equal(Math.max(...radii), radii[4], 'phát cuối ở tâm lớn nhất');
  const centerHits = full.log.hits.filter((x) => x.id === 30);
  assert.ok(centerHits.length >= 1);
  assert.ok(centerHits.some((x) => x.stunMs > 0 && x.stunMs <= 400));
});

test('Target Uplink: hạ zombie tăng chí mạng, tối đa 10 lần, mất dần', () => {
  const ph = WS.resolveWeaponSkillHandler('orbital_cannon').passive;
  const { api } = mkApi();
  const ps = { vars: {}, stacks: 0 };
  const hero = mkHero('orbital_cannon');
  for (let i = 0; i < 14; i++) ph.onKill(hero, api, ps, {});
  assert.equal(ps.stacks, 10);
  assert.ok(Math.abs(ph.mods(hero, ps).critChanceAdd - 0.2) < 1e-9);
  api.tickNo = api.tickNo + 181;
  ph.onTick(hero, api, ps, false);
  assert.equal(ps.stacks, 9);
});

test('explosive skills (world): cast Orbital Strike trong BansungWorld thật → hồi chiêu + HUD', (t) => {
  const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Tester', hero: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 5151, skipWarmup: true },
  );
  t.after(() => world.stop());
  world.step();
  const p = world.players[0];
  p.invulnTimer = 999;
  const slot = p.weaponState.slots[p.weaponState.activeSlot];
  slot.weaponId = 'orbital_cannon';
  slot.tier = 1;
  if (p.slots && p.slots[p.weaponState.activeSlot]) p.slots[p.weaponState.activeSlot].id = 'orbital_cannon';
  p.energy = p.maxEnergy;
  p.weaponState.energy = p.energy;
  assert.equal(world.enqueueCommand('p0', { t: 'wskill', x: p.x + 200, y: p.y }, { nowMs: 1000 }).ok, true);
  for (let i = 0; i < 70; i++) world.step();
  assert.ok((p.wsk.cdMs.orbital_cannon ?? 0) > 0, 'Orbital Strike phải vào hồi chiêu');
  const f = world.frameFor('p0', true);
  assert.equal(f.me.wsk.weaponId, 'orbital_cannon');
});
