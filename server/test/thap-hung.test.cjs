'use strict';

// Miragine War (Thập Hùng Tranh Bá - Chế độ Solo 10 Người / Co-op / Lập Đội):
// Kiểm tra toàn diện 16 binh chủng nguyên bản Miragine War, hệ thống Giáp Nhẹ / Giáp Nặng,
// lương hiệp mỗi 30 giây (+incomeBonus), chiếm mỏ vàng, Hành Quân Tấn Công Chỉ Định, Phòng Thủ, Tập Kết,
// AI khắc chế và kết thúc trận 10 người.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ThapWorld } = require('../dist/server/src/game/thap/world.js');
const { Game } = require('../dist/server/src/game/game.js');
const S = require('../dist/shared/src/index.js');

const {
  normalizeThapConfig, assignThapTeams, thapLayout, THAP_UNITS, THAP_UNIT_KINDS, THAP_START_GOLD, THAP_MAX_POP, THAP_BASE,
  THAP_UNIT_FIELDS, THAP_MINE_FIELDS, THAP_SHOT_FIELDS, THAP_DEATH_FIELDS, THAP_DEFEND_RADIUS, thapUpgradeCost, miragineDamage,
} = S;

const noHooks = { tick() {}, changed() {} };
const cfg = (over = {}) => ({ bots: 0, botLevel: 'normal', mode: 'ffa', minutes: 0, ...over });
const sides = (n, teams) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#123456', team: teams ? teams[i] : i, bot: false }));
const world = (n = 2, teams, hooks = noHooks, over) => new ThapWorld(sides(n, teams), cfg({ mode: teams ? 'teams' : 'ffa', ...over }), hooks);
const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const unitsOf = (w, idx) => [...w.units.values()].filter((u) => u.owner === idx);
const clearUnits = (w) => { for (const id of [...w.units.keys()]) w.units.delete(id); };
/** Thành không bắn (để thử riêng đánh nhau giữa lính) */
const muteBases = (w) => { for (const s of w.sides) s.baseCd = 1e9; };
const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);

test('database-miraginewar: đầy đủ mapping.json, 16 binh chủng, 128 sprite sheet, chân dung, công trình và âm thanh', () => {
  const dbDir = path.resolve(__dirname, '../../database-miraginewar');
  assert.ok(fs.existsSync(path.join(dbDir, 'mapping.json')), 'có mapping.json');
  const mapping = JSON.parse(fs.readFileSync(path.join(dbDir, 'mapping.json'), 'utf8'));
  assert.equal(mapping.units.length, 16, 'đủ 16 binh chủng gốc trong mapping.json');
  assert.equal(THAP_UNIT_KINDS.length, 16, 'shared có đủ 16 binh chủng');
  for (let i = 0; i < 16; i++) {
    assert.ok(fs.existsSync(path.join(dbDir, 'portraits', `a${i}.png`)), `có chân dung a${i}.png`);
    assert.ok(fs.existsSync(path.join(dbDir, 'portraits', `b${i}.png`)), `có chân dung b${i}.png`);
    for (const side of ['A', 'B']) {
      for (const act of ['idle', 'run', 'attack', 'dead']) {
        assert.ok(fs.existsSync(path.join(dbDir, 'sheets', `${side}${i}_${act}.png`)), `có sheet ${side}${i}_${act}.png`);
      }
    }
  }
  assert.ok(fs.existsSync(path.join(dbDir, 'structures', 'A_crystal.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'structures', 'B_crystal.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'structures', 'door.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'projectiles', 'fireball.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'projectiles', 'thunderball.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'projectiles', 'storm.png')));
  assert.ok(fs.existsSync(path.join(dbDir, 'terrains', 'terrain.jpg')));
  assert.ok(fs.existsSync(path.join(dbDir, 'terrains', 'terrain2.jpg')));
  assert.ok(fs.existsSync(path.join(dbDir, 'audio', 'gameLoop.mp3')));
  assert.ok(fs.existsSync(path.join(dbDir, 'audio', 'mainLoop.mp3')));
  assert.ok(fs.existsSync(path.join(dbDir, 'ui', 'title_bg.jpg')));
  assert.ok(fs.existsSync(path.join(dbDir, 'ui', 'tutorial_bg.jpg')));
});

test('16 binh chủng Miragine War & công thức sát thương Giáp Nhẹ / Giáp Nặng', () => {
  assert.equal(THAP_UNITS.newbie.cost, 20);
  assert.equal(THAP_UNITS.highlord.cost, 1500);
  assert.equal(THAP_UNITS.highlord.pop, 7);
  // Samurai (damage [17, 5]) đánh Newbie (Giáp Nhẹ armorTypeID=0, armor=0) -> 17 - 0 = 17
  assert.equal(miragineDamage('samurai', 'newbie'), 17);
  // Samurai (damage [17, 5]) đánh Zombie (Giáp Nặng armorTypeID=1, armor=1) -> 5 - 1 = 4
  assert.equal(miragineDamage('samurai', 'zombie'), 4);
  // Swordman (damage [10, 20]) đánh Zombie (Giáp Nặng armorTypeID=1, armor=1) -> 20 - 1 = 19
  assert.equal(miragineDamage('swordman', 'zombie'), 19);
});

test('cấu hình: số máy giới hạn theo chỗ trống, giá trị lạ về mặc định', () => {
  assert.deepEqual(normalizeThapConfig({ bots: 99, minutes: 7, botLevel: 'x', mode: 'zzz' }, 4), { bots: 6, botLevel: 'normal', mode: 'ffa', minutes: 20 });
  assert.equal(normalizeThapConfig({ bots: -3 }, 2).bots, 0);
  assert.equal(normalizeThapConfig({ mode: 'teams', minutes: 0 }, 2).mode, 'teams');
  assert.equal(normalizeThapConfig({ minutes: 0 }, 2).minutes, 0);
});

test('chia đội: hỗn chiến / cùng đánh máy / lập đội', () => {
  assert.deepEqual(assignThapTeams([3, 3], 2, 'ffa'), [0, 1, 2, 3]);
  assert.deepEqual(assignThapTeams([4, 2], 3, 'coop'), [0, 0, 1, 1, 1]);
  assert.deepEqual(assignThapTeams([2, 2], 2, 'teams'), [2, 2, 0, 0]);
  assert.deepEqual(assignThapTeams([0, 0, 1], 1, 'teams'), [0, 0, 1, 1]);
});

test('bố cục 10 phe chuẩn Miragine War: 10 Thành nằm trên bản đồ thảo nguyên, khởi đầu 0 vàng, Lương Hiệp 100, mặc định chọn Tân Binh & Tấn Công Chỉ Định', () => {
  const L = thapLayout(10);
  assert.equal(L.bases.length, 10);
  assert.equal(L.mines.length, 0, 'Miragine War gốc không có mỏ vàng');
  for (const [x, y] of L.bases) assert.ok(x - THAP_BASE.radius > 0 && x + THAP_BASE.radius < L.W && y - THAP_BASE.radius > 0 && y + THAP_BASE.radius < L.H);
  const w = world(10);
  assert.equal(w.baseList().length, 20);
  assert.equal(w.mineList().length, 0);
  for (let i = 0; i < 10; i++) {
    assert.equal(unitsOf(w, i).length, 0, 'chưa tới đợt 1 (6s) thì chưa xuất lính');
    assert.equal(w.sides[i].gold, 0);
    assert.equal(w.sides[i].roundIncome, 100);
    assert.equal(w.sides[i].auto, 'newbie');
    assert.equal(w.sides[i].stance, 'attack');
    assert.notEqual(w.sides[i].target, i);
  }
});

test('triệu hồi tự động theo đợt chuẩn Miragine War: đợt đầu sau 6 giây (60 nhịp), các đợt tiếp theo mỗi 30 giây (300 nhịp)', () => {
  const w = world(2);
  const s0 = w.sides[0];
  assert.equal(s0.gold, 0);
  assert.equal(s0.roundIncome, 100);
  assert.equal(s0.auto, 'newbie');
  // Trước giây thứ 6 (59 nhịp): chưa phát lương hiệp
  steps(w, 59);
  assert.equal(s0.gold, 0);
  assert.equal(unitsOf(w, 0).length, 0);
  assert.equal(w.frameFor(0).me.roundLeft, 1);
  // Nhịp thứ 60 (đúng 6 giây): nhận +100 vàng và Cổng Triệu Hồi lập tức xuất con Tân Binh đầu tiên (-20 vàng, +4 Lương Hiệp)
  w.step();
  assert.equal(unitsOf(w, 0).length, 1, 'xuất Tân Binh đầu tiên ở nhịp 60');
  assert.equal(s0.gold, 80);
  assert.equal(s0.roundIncome, 104);
  assert.equal(w.frameFor(0).me.roundLeft, 30, 'bắt đầu đếm ngược 30 giây cho đợt tiếp theo');
  // Các nhịp 62, 64, 66, 68 tiếp tục xuất đủ 5 Tân Binh từ 100 vàng đợt 1
  steps(w, 10);
  assert.equal(unitsOf(w, 0).length, 5, '100 vàng đợt 1 triệu hồi đúng 5 Tân Binh (20 vàng/con)');
  assert.equal(s0.gold, 0);
  assert.equal(s0.roundIncome, 120, '5 Tân Binh tăng Lương Hiệp thêm +20 (100 -> 120)');
});

test('đổi binh chủng đang chọn (auto / train) & tích vàng mua lính đắt qua nhiều đợt 30 giây', () => {
  const w = world(2);
  const s0 = w.sides[0];
  // Chọn Tu Sĩ (monk: 100 vàng, +15 Lương Hiệp)
  assert.equal(w.command(0, { t: 'auto', kind: 'monk' }), undefined);
  assert.equal(s0.auto, 'monk');
  steps(w, 60); // Đợt 1 ở giây thứ 6: nhận 100 vàng -> xuất 1 Tu Sĩ
  assert.equal(unitsOf(w, 0).length, 1);
  assert.equal(unitsOf(w, 0)[0].kind, 'monk');
  assert.equal(s0.gold, 0);
  assert.equal(s0.roundIncome, 100 + THAP_UNITS.monk.incomeBonus);
  // Đổi sang Bất Tử (immortal: 180 vàng) -> đợt 2 (nhịp 360) nhận 115 vàng chưa đủ 180 nên tự tích vàng
  assert.equal(w.command(0, { t: 'train', kind: 'immortal' }), undefined);
  assert.equal(s0.auto, 'immortal');
  steps(w, 300); // Nhịp 360 (đợt 2): +115 vàng (< 180)
  assert.equal(s0.gold, 115, 'chưa đủ 180 vàng nên giữ vàng tích lũy');
  steps(w, 300); // Nhịp 660 (đợt 3): +115 vàng = 230 vàng (>= 180) -> tự triệu hồi 1 Immortal!
  assert.equal(s0.gold, 50);
  assert.equal(s0.roundIncome, 115 + THAP_UNITS.immortal.incomeBonus);
  assert.ok(unitsOf(w, 0).some((u) => u.kind === 'immortal'), 'đủ 180 vàng tự triệu hồi Bất Tử');
  assert.match(w.command(0, { t: 'auto', kind: 'dragon' }), /không hợp lệ/);
});

test('đủ quân số tối đa (60) thì Cổng Triệu Hồi tạm dừng xuất quân (blocked: pop)', () => {
  const w = world();
  const s = w.sides[0];
  clearUnits(w);
  const [bx, by] = w.bases[0];
  for (let i = 0; i < THAP_MAX_POP; i++) w.addUnit(0, 'newbie', bx + 200 + (i % 8) * 20, by + Math.floor(i / 8) * 20);
  s.gold = 20;
  w.command(0, { t: 'stance', stance: 'defend' });
  w.command(0, { t: 'auto', kind: 'newbie' });
  steps(w, 10);
  assert.equal(unitsOf(w, 0).length, THAP_MAX_POP);
  assert.equal(w.frameFor(0).me.blocked, 'pop');
  assert.equal(s.gold, 20, 'chưa trừ vàng khi đầy quân số');
  // Bớt 2 con (còn 58/60) thì 20 vàng tự triệu hồi thêm 1 con (thành 59/60, chưa chạm trần)
  const list = unitsOf(w, 0);
  w.units.delete(list[0].id);
  w.units.delete(list[1].id);
  steps(w, 4);
  assert.equal(unitsOf(w, 0).length, THAP_MAX_POP - 1);
  assert.equal(s.gold, 0);
  assert.equal(w.frameFor(0).me.blocked, undefined);
});

test('khắc chế Miragine War: Trọng Kiếm Sĩ (heavysword, chuyên phá Giáp Nặng) thắng Cựu Binh (veteran) 1 đấu 1', () => {
  const w = world();
  clearUnits(w);
  muteBases(w);
  w.sides[0].auto = null;
  w.sides[1].auto = null;
  const x = w.W / 2, y = w.H / 2 - 300;
  const hs = w.addUnit(0, 'heavysword', x - 35, y);
  const vet = w.addUnit(1, 'veteran', x + 35, y);
  for (let i = 0; i < 400 && w.units.has(hs.id) && w.units.has(vet.id); i++) w.step();
  assert.equal(w.units.has(vet.id), false, 'Veteran bị hạ');
  assert.equal(w.units.has(hs.id), true, 'HeavySword sống');
  assert.equal(w.sides[0].kills, 1);
  assert.equal(w.sides[0].killsValue, THAP_UNITS.veteran.cost);
  assert.equal(w.sides[1].lost, 1);
});

test('Thành đổ: phe bị loại, lính biến mất, đạo quân đang Tấn Công tự chuyển mục tiêu sang Thành địch còn sống tiếp theo', () => {
  let changed = 0;
  const w = world(3, undefined, { tick() {}, changed() { changed++; } });
  w.sides[1].baseHp = 1;
  const [bx, by] = w.bases[1];
  w.addUnit(0, 'highlord', bx + THAP_BASE.radius + 140, by);
  w.sides[0].stance = 'attack';
  w.sides[0].target = 1;
  for (let i = 0; i < 200 && w.sides[1].alive; i++) w.step();
  assert.equal(w.sides[1].alive, false);
  assert.equal(unitsOf(w, 1).length, 0);
  assert.ok(changed >= 1);
  assert.equal(w.frameFor(1).me, undefined, 'phe đã loại không có phần riêng');
  assert.equal(w.frameFor(0).bh[1], 0);
  assert.equal(w.frameFor(0).al[1], 0);
  assert.equal(w.result, undefined, 'còn 2 phe thì chưa hết trận');
  assert.equal(w.sides[0].stance, 'attack', 'giữ nguyên thế Tấn Công Chỉ Định');
  assert.equal(w.sides[0].target, 2, 'tự động chuyển mục tiêu sang Thành địch còn sống (#2)');
  assert.match(w.command(0, { t: 'attack', target: 1 }), /Không thể tấn công/);
});

test('đồng minh: không đánh nhau, không bị chọn làm mục tiêu', () => {
  const w = world(3, [0, 0, 1]);
  clearUnits(w);
  muteBases(w);
  const x = w.W / 2, y = w.H / 2 - 300;
  const a = w.addUnit(0, 'swordman', x - 30, y);
  const b = w.addUnit(1, 'novice', x + 30, y);
  const ha = a.hp, hb = b.hp;
  steps(w, 100);
  assert.equal(a.hp, ha);
  assert.equal(b.hp, hb);
  assert.match(w.command(0, { t: 'attack', target: 1 }), /Không thể tấn công/);
  assert.match(w.command(0, { t: 'attack', target: 0 }), /Không thể tấn công/);
  assert.equal(w.command(0, { t: 'attack', target: 2 }), undefined);
  // Pháp Sư bắn lan không trúng đồng minh
  clearUnits(w);
  const mage = w.addUnit(0, 'mage', x - 140, y);
  const ally = w.addUnit(1, 'veteran', x + 5, y + 5);
  const foe = w.addUnit(2, 'veteran', x, y);
  ally.hp = ally.maxHp = 1e9;
  foe.hp = foe.maxHp = 1e9;
  w.command(0, { t: 'stance', stance: 'advance' });
  w.command(1, { t: 'stance', stance: 'defend' });
  w.command(2, { t: 'stance', stance: 'defend' });
  steps(w, 60);
  assert.ok(foe.hp < 1e9, 'địch bị trúng');
  assert.equal(ally.hp, 1e9, 'đồng minh không mất máu');
  assert.ok(mage.hp > 0);
});

test('hỗn chiến: còn 1 phe có Thành là thắng', () => {
  const w = world(3);
  w.resign(1);
  w.step();
  assert.equal(w.result, undefined);
  w.resign(2);
  w.step();
  assert.equal(w.result.winnerTeam, 0);
  assert.deepEqual(w.result.winnerIdxs, [0]);
  assert.equal(w.result.scores.length, 3);
  assert.equal(w.running, false);
});

test('lập đội: cả đội thắng (kể cả thành viên đã đổ)', () => {
  const w = world(4, [0, 0, 1, 1]);
  w.resign(1);
  w.resign(2);
  w.step();
  assert.equal(w.result, undefined, 'mỗi đội còn 1 Thành');
  w.resign(3);
  w.step();
  assert.equal(w.result.winnerTeam, 0);
  assert.deepEqual(w.result.winnerIdxs, [0, 1]);
});

test('hết giờ: đội điểm cao nhất thắng', () => {
  const w = world(2, undefined, noHooks, { minutes: 10 });
  w.sides[1].killsValue = 100000;
  w.endsAt = Date.now() - 1;
  w.step();
  assert.equal(w.result.winnerTeam, 1);
  assert.match(w.result.reason, /Hết giờ/);
});

test('Hành Quân Tấn Công Chỉ Định: cả đạo quân hành quân phá đúng Thành đã chọn, Thành khác không bị đụng', () => {
  const w = world(3);
  const s = w.sides[0];
  clearUnits(w);
  for (const side of w.sides) side.auto = null;
  s.gold = 1e6;
  const [bx, by] = w.bases[0];
  for (let i = 0; i < 6; i++) w.addUnit(0, 'highlord', bx + Math.cos(s.facing) * 150, by + Math.sin(s.facing) * 150 + i * 30);
  for (let i = 0; i < 6; i++) w.addUnit(0, 'dreadlord', bx + Math.cos(s.facing) * 120, by + Math.sin(s.facing) * 120 + i * 25);
  assert.equal(w.command(0, { t: 'attack', target: 2 }), undefined);
  assert.equal(w.frameFor(0).me.stance, 'attack');
  assert.equal(w.frameFor(0).me.target, 2);
  s.auto = 'highlord';
  for (let i = 0; i < 10 * 60 * 5 && w.sides[2].alive; i++) {
    w.step();
  }
  assert.equal(w.sides[2].alive, false, 'Thành mục tiêu bị phá');
  assert.equal(w.sides[1].baseHp, THAP_BASE.hp, 'Thành không bị chọn còn nguyên');
});

test('Phòng Thủ: cả đạo quân về đứng quanh Thành', () => {
  const w = world(2);
  muteBases(w);
  const [bx, by] = w.bases[0];
  w.sides[0].gold = 600;
  w.sides[1].auto = null;
  w.command(0, { t: 'auto', kind: 'swordman' });
  w.command(0, { t: 'rally', x: w.W / 2, y: w.H / 2 });
  steps(w, 300);
  assert.ok(unitsOf(w, 0).some((u) => dist(u, bx, by) > 600), 'đã đi xa');
  w.command(0, { t: 'stance', stance: 'defend' });
  steps(w, 400);
  const army = unitsOf(w, 0);
  assert.ok(army.length >= 6);
  assert.ok(army.every((u) => dist(u, bx, by) <= THAP_DEFEND_RADIUS + 20), 'mọi lính đều trong vòng Phòng Thủ');
});

test('Tập Kết: lính tới điểm tập kết và đứng giữ', () => {
  const w = world(2);
  muteBases(w);
  w.sides[1].auto = null;
  w.command(1, { t: 'stance', stance: 'defend' });
  const x = w.bases[0][0] + 520, y = w.bases[0][1] + 60;
  w.sides[0].gold = 60; // đủ triệu hồi 3 Tân Binh
  assert.equal(w.command(0, { t: 'rally', x, y }), undefined);
  assert.equal(w.frameFor(0).me.stance, 'rally');
  assert.deepEqual(w.frameFor(0).me.rally, [Math.round(x), Math.round(y)]);
  assert.match(w.command(0, { t: 'rally', x: 'a', y: 3 }), /Vị trí/);
  steps(w, 500);
  assert.ok(unitsOf(w, 0).length >= 3);
  for (const u of unitsOf(w, 0)) assert.ok(dist(u, x, y) < 140, 'đứng quanh điểm tập kết');
  // rally ngoài bản đồ bị kẹp lại
  w.command(0, { t: 'rally', x: -500, y: 1e9 });
  const [rx, ry] = w.frameFor(0).me.rally;
  assert.ok(rx >= 0 && rx <= w.W && ry >= 0 && ry <= w.H);
});

test('chống spam lệnh: hết lượt thì lệnh bị bỏ qua', () => {
  const w = world();
  const s = w.sides[0];
  for (let i = 0; i < 100; i++) w.command(0, { t: 'auto', kind: 'swordman' });
  assert.ok(s.tokens < 1);
  w.command(0, { t: 'stance', stance: 'defend' });
  assert.notEqual(s.stance, 'defend', 'lệnh bị bỏ qua khi hết lượt');
  steps(w, 2);
  w.command(0, { t: 'stance', stance: 'defend' });
  assert.equal(s.stance, 'defend');
});

test('khung hình: đúng số trường, phần riêng chỉ của mình', () => {
  const w = world(3);
  steps(w, 70);
  const f = w.frameFor(0);
  assert.equal(f.u.length % THAP_UNIT_FIELDS, 0);
  assert.equal(f.u.length / THAP_UNIT_FIELDS, w.units.size);
  assert.equal(f.m.length, w.mines.length * THAP_MINE_FIELDS);
  assert.equal(f.s.length % THAP_SHOT_FIELDS, 0);
  assert.equal(f.d.length % THAP_DEATH_FIELDS, 0);
  assert.equal(f.bh.length, 3);
  assert.equal(f.al.length, 3);
  assert.equal(f.sc.length, 3);
  assert.equal(f.full, true);
  assert.equal(f.tick, w.tickNo);
  for (let i = 0; i < f.u.length; i += THAP_UNIT_FIELDS) {
    assert.ok(f.u[i + 5] >= 1 && f.u[i + 5] <= 100);
    assert.ok(f.u[i + 2] >= 0 && f.u[i + 2] < 16);
  }
  w.sides[1].gold = 7;
  assert.equal(w.frameFor(1).me.gold, 7);
  assert.notEqual(w.frameFor(0).me.gold, 7);
  assert.equal(w.frameFor(undefined).me, undefined);
  assert.deepEqual(
    Object.keys(w.frameFor(0).me).sort(),
    ['auto', 'blocked', 'gold', 'income', 'kills', 'lost', 'mines', 'pop', 'popCap', 'queue', 'rally', 'roundIncome', 'roundLeft', 'stance', 'target', 'upgrades'].sort(),
  );
});

test('máy tự chơi: 1 người + 9 máy chạy 3000 nhịp không lỗi, máy chọn binh chủng khắc chế và đánh nhau', () => {
  const inits = [
    { id: 'p0', name: 'Người', color: '#000', team: 0, bot: false },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `bot:thap${i}`, name: `Máy ${i}`, color: '#111', team: i + 1, bot: true })),
  ];
  const w = new ThapWorld(inits, cfg({ bots: 9, botLevel: 'hard' }), noHooks);
  w.sides.slice(1).forEach((s, i) => (s.brain.level = ['easy', 'normal', 'hard'][i % 3]));
  const t0 = Date.now();
  let maxUnits = 0;
  for (let i = 0; i < 3000 && !w.result; i++) {
    w.step();
    if (i % 10 === 0) for (let k = 0; k < 10; k++) w.frameFor(k);
    maxUnits = Math.max(maxUnits, w.units.size);
    for (const u of w.units.values()) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && u.x >= 0 && u.x <= w.W && u.y >= 0 && u.y <= w.H);
  }
  const ms = Date.now() - t0;
  assert.ok(maxUnits >= 30, `máy có triệu hồi lính (${maxUnits})`);
  assert.ok(w.sides.some((s) => s.kills > 0), 'có giao tranh');
  assert.ok(w.sides.slice(1).some((s) => s.brain.waves > 0 || s.stance === 'attack'), 'máy có tấn công chỉ định');
  assert.ok(ms < 15000, `mô phỏng đủ nhanh (${ms}ms cho 3000 nhịp)`);
});

test('380 lính của 16 binh chủng giao tranh: mỗi nhịp vẫn nhanh', () => {
  const w = world(10);
  for (const s of w.sides) w.command(s.idx, { t: 'stance', stance: 'defend' });
  clearUnits(w);
  for (const s of w.sides) {
    const [bx, by] = w.bases[s.idx];
    for (let i = 0; i < 38; i++) {
      w.addUnit(s.idx, THAP_UNIT_KINDS[i % 16], bx + Math.cos(s.facing) * 160 + (i % 6) * 22, by + Math.sin(s.facing) * 160 + Math.floor(i / 6) * 22);
    }
  }
  for (const s of w.sides) w.command(s.idx, { t: 'rally', x: w.W / 2, y: w.H / 2 });
  const t0 = Date.now();
  steps(w, 600);
  const ms = Date.now() - t0;
  assert.ok(ms < 6000, `600 nhịp mất ${ms}ms`);
  assert.ok(w.units.size < 380, 'có giao tranh ở giữa bản đồ');
});

// ---------------- Game: phòng chờ, bắt đầu, chia hũ ----------------

function thapGame(n = 3) {
  const frames = [];
  const hooks = { changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {}, linkState() {}, thapFrame(g, id, f) { frames.push([id, f]); } };
  const g = new Game('THAP', hooks, {}, 'thap_hung');
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `Người ${i}`);
  return { g, frames };
}
const readyAll = (g) => { for (const p of g.players) if (p.id !== g.hostId) g.setReady(p.id, true, g.rulesVersion); };

test('phòng chờ: chủ phòng chỉnh cấu hình, người chơi chọn đội, kiểm tra điều kiện bắt đầu', () => {
  const { g } = thapGame(2);
  try {
    assert.equal(g.seatLimit(), 10);
    assert.throws(() => g.setThapConfig('p1', { bots: 2 }), /chủ phòng/i);
    g.setThapConfig('p0', { mode: 'coop', bots: 0, minutes: 0 });
    readyAll(g);
    assert.throws(() => g.validateStart('p0'), /ít nhất 1 máy/);
    g.setThapConfig('p0', { mode: 'teams', bots: 0, minutes: 0 });
    readyAll(g);
    assert.deepEqual(g.viewFor('p0').thap.teams, { p0: 0, p1: 1 });
    g.setThapTeam('p1', 0);
    assert.deepEqual(g.viewFor('p1').thap.teams, { p0: 0, p1: 0 });
    assert.throws(() => g.validateStart('p0'), /2 đội/);
    g.setThapTeam('p1', 3);
    g.validateStart('p0');
    g.setThapConfig('p0', { mode: 'ffa', bots: 0, minutes: 0 });
    assert.throws(() => g.setThapTeam('p0', 1), /Lập đội/);
    assert.equal(g.viewFor('p0').thap.teams, undefined);
  } finally {
    g.dispose();
  }
});

test('bắt đầu trận: tạo phe người + máy, gửi khung hình, lệnh qua Game', () => {
  const { g, frames } = thapGame(2);
  try {
    g.setThapConfig('p0', { mode: 'ffa', bots: 3, minutes: 10, botLevel: 'easy' });
    readyAll(g);
    g.start('p0');
    const w = g['thap'];
    w.stop();
    assert.equal(g.phase, 'playing');
    const v = g.viewFor('p0').thap;
    assert.equal(v.players.length, 5);
    assert.equal(v.players.filter((p) => p.bot).length, 3);
    assert.ok(v.players.filter((p) => p.bot).every((p) => p.id.startsWith('bot:thap') && p.name.startsWith('🤖')));
    assert.equal(v.bases.length, 10);
    assert.equal(v.mines.length, 0);
    assert.equal(typeof v.myIdx, 'number');
    assert.ok(v.endsAt > v.startedAt);
    assert.equal(g.viewFor('p0').currentPlayerId, undefined);
    w.step();
    assert.ok(frames.some(([id, f]) => id === 'p0' && f.me), 'người chơi nhận phần riêng');
    g.thapCommand('p0', { t: 'train', kind: 'swordman' });
    assert.throws(() => g.thapCommand('p0', { t: 'attack', target: v.myIdx }), /Không thể tấn công/);
    assert.throws(() => g.thapCommand('nobody', { t: 'stance', stance: 'defend' }), /xem/);
  } finally {
    g.dispose();
  }
});

test('lập đội thắng: chia đều hũ cho người trong đội thắng', () => {
  const { g } = thapGame(3);
  try {
    g.setThapConfig('p0', { mode: 'teams', bots: 0, minutes: 0 });
    g.setThapTeam('p0', 0);
    g.setThapTeam('p1', 0);
    g.setThapTeam('p2', 1);
    readyAll(g);
    g.pot = 301;
    g.start('p0');
    const w = g['thap'];
    w.stop();
    const loser = w.sideById('p2');
    w.resign(loser.idx);
    w.step();
    assert.equal(g.phase, 'ended');
    assert.deepEqual(g.winners().sort(), ['p0', 'p1']);
    assert.equal(g.payouts.p0 + g.payouts.p1, 301);
    assert.ok(Math.abs(g.payouts.p0 - g.payouts.p1) <= 1);
    assert.equal(g.payouts.p2, undefined);
    assert.deepEqual(g.viewFor('p2').thap.result.winnerIdxs.sort(), [w.sideById('p0').idx, w.sideById('p1').idx].sort());
  } finally {
    g.dispose();
  }
});

test('máy thắng: hoàn cược cho người chơi; rời trận = bỏ cuộc', () => {
  const { g } = thapGame(1);
  try {
    g.setThapConfig('p0', { mode: 'coop', bots: 1, minutes: 0 });
    g.bet = 50;
    g.pot = 50;
    g.start('p0');
    const w = g['thap'];
    w.stop();
    g.players[0].left = true;
    g['eliminate'](g.players[0]);
    w.step();
    assert.equal(g.phase, 'ended');
    assert.equal(g.winners().length, 0);
    assert.equal(w.result.winnerTeam, 1);
  } finally {
    g.dispose();
  }
});

test('lập đội: đội mặc định (xen kẽ theo ghế) giữ nguyên sau khi xáo ghế lúc bắt đầu', () => {
  for (let round = 0; round < 8; round++) {
    const { g } = thapGame(4);
    try {
      g.setThapConfig('p0', { mode: 'teams', bots: 0, minutes: 0 });
      readyAll(g);
      const shown = { ...g.viewFor('p0').thap.teams };
      assert.deepEqual(shown, { p0: 0, p1: 1, p2: 0, p3: 1 });
      g.start('p0');
      const w = g['thap'];
      w.stop();
      for (const id of Object.keys(shown)) assert.equal(w.sideById(id).team, shown[id], `${id} giữ đội`);
    } finally {
      g.dispose();
    }
  }
});
