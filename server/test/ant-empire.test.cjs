'use strict';

// Đế Chế Kiến: mô phỏng chạy thẳng (không hẹn giờ) để kiểm tra vàng, gọi quân, trụ bắn, sương mù và kết thúc trận.
const test = require('node:test');
const assert = require('node:assert/strict');
const { AntWorld } = require('../dist/server/src/game/ants/world.js');
const { normalizeAntsConfig, antsIncome, ANTS_START_GOLD, ANTS_INCOME_EVERY_S, ANT_UNITS, ANT_TOWERS, ANTS_UNIT_FIELDS, ANTS_TOWER_FIELDS } = require('../dist/shared/src/index.js');

const hooks = { tick() {}, changed() {} };
const humans = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#123456', bot: false }));
const world = (n = 2) => new AntWorld(humans(n), { bots: 0, minutes: 0, botLevel: 'normal' }, hooks);
const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const towersOf = (w, idx) => [...w.towers.values()].filter((t) => t.owner === idx);

test('cấu hình: số máy bị giới hạn theo chỗ trống, giá trị lạ về mặc định', () => {
  assert.deepEqual(normalizeAntsConfig({ bots: 99, minutes: 7, botLevel: 'x' }, 4), { bots: 6, minutes: 30, botLevel: 'normal' });
  assert.equal(normalizeAntsConfig({ bots: -3 }, 2).bots, 0);
});

test('mỗi đế chế có 1 Trụ Chính + 2 Trụ Phụ', () => {
  const w = world(3);
  for (let i = 0; i < 3; i++) {
    const kinds = towersOf(w, i).map((t) => t.kind).sort();
    assert.deepEqual(kinds, ['main', 'side', 'side']);
  }
});

test('vàng được cấp mỗi 1 phút và lần sau nhiều hơn lần trước', () => {
  const w = world();
  const e = w.empires[0];
  assert.equal(e.gold, ANTS_START_GOLD);
  assert.equal(ANTS_INCOME_EVERY_S, 60);
  steps(w, ANTS_INCOME_EVERY_S * 10 - 1);
  assert.equal(e.gold, ANTS_START_GOLD, 'chưa tới 1 phút');
  w.step();
  assert.equal(e.gold, ANTS_START_GOLD + antsIncome(1));
  steps(w, ANTS_INCOME_EVERY_S * 10);
  assert.equal(e.gold, ANTS_START_GOLD + antsIncome(1) + antsIncome(2));
  assert.ok(antsIncome(2) > antsIncome(1));
});

test('gọi quân: trừ vàng từng con lúc bắt đầu nở, không trừ một lượt', () => {
  const w = world();
  const e = w.empires[0];
  const cost = ANT_UNITS.soldier.cost;
  assert.equal(w.command(0, { t: 'train', kind: 'soldier', count: 3 }), undefined);
  assert.equal(e.queue.length, 3);
  w.step();
  assert.equal(e.gold, ANTS_START_GOLD - cost, 'chỉ con đầu bị trừ');
  steps(w, ANT_UNITS.soldier.time * 10 + 1);
  assert.equal(e.gold, ANTS_START_GOLD - cost * 2, 'con thứ 2 trừ khi bắt đầu nở');
  // bớt con chưa nở: không mất vàng; bớt con đang nở: hoàn vàng
  w.command(0, { t: 'untrain', kind: 'soldier' });
  assert.equal(e.gold, ANTS_START_GOLD - cost * 2);
  w.command(0, { t: 'untrain', kind: 'soldier' });
  assert.equal(e.gold, ANTS_START_GOLD - cost);
  assert.equal(e.queue.length, 0);
});

test('thiếu vàng thì con đầu hàng chờ, không âm vàng', () => {
  const w = world();
  const e = w.empires[0];
  e.gold = 100;
  w.command(0, { t: 'train', kind: 'tank' });
  steps(w, 30);
  assert.equal(e.gold, 100);
  assert.equal(w.waitingFor(e), 'gold');
  assert.match(w.command(0, { t: 'train', kind: 'beetle' }), /không hợp lệ/);
});

test('trụ bắn 1 viên hạ gọn 1 kiến, nạp đạn 5 giây', () => {
  const w = world();
  const side = towersOf(w, 1).find((t) => t.kind === 'side');
  // 2 Kiến Đầu Đạn của đế chế 0 đứng ngay sát Trụ Phụ địch
  const a = w.addUnit(0, 'tank', side.x + side.r + 40, side.y);
  const b = w.addUnit(0, 'tank', side.x - side.r - 40, side.y);
  side.cd = 0;
  for (const t of w.towers.values()) if (t !== side) t.cd = 999;
  steps(w, 10);
  const dead = [a, b].filter((u) => !w.units.has(u.id));
  assert.equal(dead.length, 1, 'đúng 1 con bị hạ dù máu rất trâu');
  assert.ok(side.cd > ANT_TOWERS.side.cd - 1.1, 'đang nạp đạn');
  steps(w, 30);
  assert.equal([a, b].filter((u) => !w.units.has(u.id)).length, 1, 'chưa tới 5 giây thì không bắn tiếp');
});

test('bản đồ sáng: ai cũng thấy trụ và kiến của mọi đế chế', () => {
  const w = world(3);
  w.step();
  const f = w.frameFor(0);
  assert.equal(f.full, true);
  const owners = new Set();
  for (let i = 0; i < f.u.length; i += ANTS_UNIT_FIELDS) owners.add(f.u[i + 1]);
  assert.deepEqual([...owners].sort(), [0, 1, 2]);
  const towerOwners = new Set();
  for (let i = 0; i < f.b.length; i += ANTS_TOWER_FIELDS) towerOwners.add(f.b[i + 1]);
  assert.deepEqual([...towerOwners].sort(), [0, 1, 2]);
  assert.equal(f.me.gold, ANTS_START_GOLD);
  w.empires[1].gold = 7;
  assert.equal(w.frameFor(1).me.gold, 7, 'vàng vẫn là của riêng từng người');
  assert.equal(w.frameFor(0).me.gold, ANTS_START_GOLD);
  assert.equal(w.frameFor(undefined).me, undefined);
});

test('trụ bắn được Kiến Bắn Tỉa đứng ở tầm đánh xa nhất', () => {
  for (const [k, u] of Object.entries(ANT_UNITS)) {
    assert.ok(u.range + u.radius + 2 < ANT_TOWERS.side.range, `${k} không được đánh trụ từ ngoài tầm bắn`);
  }
  const w = world();
  const side = towersOf(w, 1).find((t) => t.kind === 'side');
  const sn = ANT_UNITS.sniper;
  const u = w.addUnit(0, 'sniper', side.x + side.r + sn.range + sn.radius, side.y);
  u.order = { type: 'attack', target: side.id };
  side.cd = 0;
  for (const t of w.towers.values()) if (t !== side) t.cd = 999;
  steps(w, 15);
  assert.equal(w.units.has(u.id), false, 'Bắn Tỉa bị trụ hạ');
});

test('tự ra quân: nở từng con, hết vàng thì chờ, có vàng thì tự ra tiếp', () => {
  const w = world();
  const e = w.empires[0];
  for (const u of [...w.units.values()]) if (u.owner === 0) w.units.delete(u.id);
  const mine = () => [...w.units.values()].filter((u) => u.owner === 0 && u.kind === 'soldier').length;
  assert.match(w.command(0, { t: 'auto', kind: 'beetle' }), /không hợp lệ/);
  assert.equal(w.command(0, { t: 'auto', kind: 'soldier' }), undefined);
  w.step();
  assert.equal(e.gold, ANTS_START_GOLD - ANT_UNITS.soldier.cost, 'chỉ trừ con đang nở');
  steps(w, 230);
  const n = ANTS_START_GOLD / ANT_UNITS.soldier.cost;
  assert.equal(mine(), n);
  assert.equal(e.gold, 0);
  const me = w.frameFor(0).me;
  assert.equal(me.waiting, 'gold');
  assert.equal(me.auto, 'soldier');
  assert.equal(me.hatched, n);
  while (w.elapsed < ANTS_INCOME_EVERY_S * 1000 + 3000) w.step();
  assert.ok(mine() > n, 'có vàng mới là tự nở tiếp');
  w.command(0, { t: 'auto', kind: null });
  assert.equal(w.frameFor(0).me.auto, null);
  assert.ok(e.queue.every((q) => q.paid), 'không còn con chưa trả vàng trong hàng chờ');
});

test('mất Trụ Chính: đế chế bị loại, còn 1 đế chế thì thắng', () => {
  let changed = 0;
  const w = new AntWorld(humans(2), { bots: 0, minutes: 0, botLevel: 'normal' }, { tick() {}, changed() { changed++; } });
  w.resign(1);
  w.step();
  assert.equal(w.empires[1].alive, false);
  assert.equal(towersOf(w, 1).length, 0);
  assert.equal([...w.units.values()].filter((u) => u.owner === 1).length, 0);
  assert.equal(w.result.winnerIdx, 0);
  assert.ok(changed >= 1);
});

test('không điều khiển được quân của người khác', () => {
  const w = world();
  const enemy = [...w.units.values()].find((u) => u.owner === 1);
  const before = enemy.order;
  w.command(0, { t: 'move', ids: [enemy.id], x: 10, y: 10 });
  assert.equal(enemy.order, before);
});

test('máy tự chơi: gọi quân và phá được trụ', () => {
  const inits = Array.from({ length: 3 }, (_, i) => ({ id: `bot:${i}`, name: `B${i}`, color: '#000', bot: true }));
  const w = new AntWorld(inits, { bots: 3, minutes: 0, botLevel: 'hard' }, hooks);
  w.empires.forEach((e, i) => (e.brain.level = i === 0 ? 'hard' : 'easy'));
  for (let i = 0; i < 10 * 60 * 45 && w.towers.size === 9; i++) w.step();
  assert.ok(w.empires.some((e) => e.spent > 500), 'máy có tiêu vàng gọi quân');
  assert.ok(w.towers.size < 9, 'ít nhất 1 trụ đã bị phá');
});

test('tổng tấn công: cả đạo quân tự hành quân và phá trụ của đế chế đã chọn', () => {
  const w = world(3);
  const e = w.empires[0];
  e.gold = 1e6;
  assert.match(w.command(0, { t: 'stance', stance: 'attack', target: 0 }), /không hợp lệ/);
  w.command(0, { t: 'train', kind: 'tank', count: 10 });
  w.command(0, { t: 'train', kind: 'soldier', count: 10 });
  steps(w, 1200);
  assert.equal(w.command(0, { t: 'stance', stance: 'attack', target: 2 }), undefined);
  assert.equal(w.frameFor(0).me.stance, 'attack');
  for (let i = 0; i < 10 * 60 * 4 && w.empires[2].alive; i++) {
    if (i % 300 === 0) w.command(0, { t: 'train', kind: 'tank', count: 5 });
    w.step();
  }
  assert.equal(w.empires[2].alive, false, 'đế chế mục tiêu bị phá hết trụ');
  assert.equal(towersOf(w, 1).length, 3, 'đế chế không bị chọn không bị đánh');
});

test('phòng thủ chung: cả đạo quân kéo về căn cứ', () => {
  const w = world(2);
  const e = w.empires[0];
  e.gold = 1e6;
  w.command(0, { t: 'train', kind: 'soldier', count: 8 });
  steps(w, 300);
  w.command(0, { t: 'stance', stance: 'attack', target: -1 });
  steps(w, 150);
  w.command(0, { t: 'stance', stance: 'defend' });
  steps(w, 600);
  const main = w.towers.get(e.mainId);
  const army = [...w.units.values()].filter((u) => u.owner === 0);
  assert.ok(army.length > 0);
  assert.ok(army.every((u) => Math.hypot(u.x - main.x, u.y - main.y) < 500), 'mọi con đều ở gần căn cứ');
});
