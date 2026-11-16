'use strict';

// Miragine War 1:1 (Tháp Cổ Điển - 30Hz Simulation / 15Hz Net Sync):
// Kiểm thử kinh tế vòng vàng theo đợt, xuất quân cổng triệu hồi, giới hạn dân số & thu nhập,
// sát thương Method 493, windup delayAttack & hủy windup, đạn phép + lan + trụ pha lê,
// và cơ chế đệm sự kiện 30Hz -> 15Hz đa client chống rớt sự kiện & chống gian lận.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ThapWorld } = require('../dist/server/src/game/thap/world.js');
const S = require('../dist/shared/src/index.js');

const {
  THAP_BASE,
  THAP_CRYSTAL_HALF_W,
  THAP_CRYSTALS,
  THAP_FIRST_ROUND_FRAMES,
  THAP_FLAG_ATK_START,
  THAP_INCOME_LIMIT,
  THAP_LANE_Y_MAX,
  THAP_LANE_Y_MIN,
  THAP_MAX_POP,
  THAP_NET_DIV,
  THAP_NET_FPS,
  THAP_ROUND_FRAMES,
  THAP_SHOT_CRYSTAL_FLAG,
  THAP_SHOT_FB,
  THAP_SHOT_FIELDS,
  THAP_SHOT_STORM,
  THAP_SHOT_TB,
  THAP_SIM_FPS,
  THAP_SPAWN_INTERVAL_FRAMES,
  THAP_SPAWN_X,
  THAP_SPLASH_FACTOR,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_UNIT_FIELDS,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  decodeDeathCode,
  miragineCrystalDamage,
  miragineDamage,
} = S;

const NO_HOOKS = { tick() {}, changed() {} };
const SPAWN_Y_MIN = THAP_LANE_Y_MIN + 15; // 325
const SPAWN_Y_MAX = THAP_LANE_Y_MAX - 15; // 615

/** Tạo cấu hình PvP mặc định (tắt AI để kiểm thử hoàn toàn tất định). */
function pvpConfig(over = {}) {
  return { bots: 0, botLevel: 'normal', mode: 'pvp', minutes: 0, ...over };
}

/** Tạo danh sách 2 phe người chơi chuẩn (Đỏ trái idx 0, Xanh phải idx 1). */
function pvpInits() {
  return [
    { id: 'p0', name: 'Phe Đỏ', color: '#e03131', team: 0, bot: false },
    { id: 'p1', name: 'Phe Xanh', color: '#1971c2', team: 1, bot: false },
  ];
}

/** Khởi tạo một thế giới `ThapWorld` chuẩn 2 phe không AI. */
function makeWorld(over = {}, hooks = NO_HOOKS) {
  return new ThapWorld(pvpInits(), pvpConfig(over), hooks);
}

/** Chạy `n` bước mô phỏng 30Hz liên tiếp. */
function stepN(world, n) {
  for (let i = 0; i < n; i++) {
    world.step();
  }
}

/** Tắt khả năng bắn của hai Trụ Pha Lê Chính khi kiểm thử đánh nhau giữa lính. */
function muteCrystals(world) {
  for (const side of world.sides) {
    side.crystalCd = 1e9;
  }
}

/** Đóng băng mục tiêu tại chỗ bằng `cd` lớn để giữ nguyên tọa độ hình học trong bài test. */
function freezeRangedTarget(world, owner, kind, x, y) {
  const unit = world.addUnit(owner, kind, x, y);
  unit.cd = 999;
  return unit;
}

/** Giải mã mảng phẳng `ThapFrame.u` thành danh sách bản ghi lính dễ đọc. */
function parseFrameUnits(uBuf) {
  const units = [];
  for (let i = 0; i < uBuf.length; i += THAP_UNIT_FIELDS) {
    units.push({
      id: uBuf[i],
      owner: uBuf[i + 1],
      kindIdx: uBuf[i + 2],
      x: uBuf[i + 3],
      y: uBuf[i + 4],
      hpPct: uBuf[i + 5],
      flags: uBuf[i + 6],
    });
  }
  return units;
}

/** Giải mã mảng phẳng `ThapFrame.s` thành danh sách đạn bay. */
function parseShots(sBuf) {
  const shots = [];
  for (let i = 0; i < sBuf.length; i += THAP_SHOT_FIELDS) {
    shots.push({
      x1: sBuf[i],
      y1: sBuf[i + 1],
      x2: sBuf[i + 2],
      y2: sBuf[i + 3],
      type: sBuf[i + 4],
      targetId: sBuf[i + 5],
      travelMs: sBuf[i + 6],
    });
  }
  return shots;
}

/** Kiểm tra tọa độ lúc xuất quân nằm trong cổng và không đè lên vòng va chạm Pha Lê. */
function assertDoorSpawnGeometry(unit) {
  const spawnX = unit.x - unit.vx / THAP_SIM_FPS;
  const doorX = THAP_SPAWN_X[unit.owner];
  assert.ok(
    spawnX >= doorX - 10 - 1e-6 && spawnX <= doorX + 10 + 1e-6,
    `spawnX=${spawnX} phải nằm trong ${doorX}±10`,
  );
  assert.ok(
    unit.y >= SPAWN_Y_MIN && unit.y <= SPAWN_Y_MAX,
    `y=${unit.y} phải nằm trong [${SPAWN_Y_MIN}..${SPAWN_Y_MAX}]`,
  );
  for (const [cx, cy] of THAP_CRYSTALS) {
    const distToCrystal = Math.hypot(unit.x - cx, unit.y - cy);
    assert.ok(
      distToCrystal >= THAP_CRYSTAL_HALF_W + unit.radius - 1e-6,
      `lính (${unit.x}, ${unit.y}) không được chồng lên Pha Lê (${cx}, ${cy})`,
    );
  }
}

test('1. Trạng thái khởi đầu cổ điển, mốc 180/900 khung hình (30Hz/15Hz), xuất quân cổng cách 4 khung hình & Đợt 2 ở 1080', () => {
  assert.equal(THAP_SIM_FPS, 30);
  assert.equal(THAP_NET_FPS, 15);
  assert.equal(THAP_NET_DIV, 2);
  assert.equal(THAP_FIRST_ROUND_FRAMES, 180);
  assert.equal(THAP_ROUND_FRAMES, 900);
  assert.equal(THAP_SPAWN_INTERVAL_FRAMES, 4);
  assert.equal(THAP_START_GOLD, 0);
  assert.equal(THAP_START_ROUND_INCOME, 100);

  const w = makeWorld();
  assert.equal(w.sim.wave, 0);
  assert.equal(w.sim.roundFramesLeft, 180);
  assert.equal(w.sim.roundTotalFrames, 180);

  for (const s of w.sides) {
    assert.equal(s.gold, 0);
    assert.equal(s.roundIncome, 100);
    assert.equal(s.auto, 'newbie');
    assert.equal(s.lastWaveUnits, -1);
  }

  const fStart = w.frameFor(0);
  assert.equal(fStart.roundLeft, 6);
  assert.equal(fStart.roundTotalS, 6);
  assert.deepEqual(fStart.lastWaveUnits, [-1, -1]);
  assert.equal(fStart.me.gold, 0);
  assert.equal(fStart.me.roundIncome, 100);
  assert.equal(fStart.me.auto, 'newbie');

  // Khung hình 1..179: chưa phát vàng, chưa xuất quân, lastWaveUnits giữ [-1, -1].
  for (let frame = 1; frame <= 179; frame++) {
    w.step();
    assert.equal(w.sim.simTick, frame);
    assert.equal(w.sim.wave, 0);
    assert.equal(w.sim.units.length, 0);
    assert.equal(w.sides[0].gold, 0);
    assert.equal(w.sides[1].gold, 0);
    assert.equal(w.sides[0].lastWaveUnits, -1);
    assert.equal(w.sides[1].lastWaveUnits, -1);
  }
  assert.deepEqual(w.frameFor(0).lastWaveUnits, [-1, -1]);

  // Khung hình 180 (6.0s ở 30Hz): Đợt 1 kích hoạt, nhận +100 vàng, mua 5 Tân Binh, +20 thu nhập,
  // đặt lại bộ đếm 900 khung hình (30s) và xuất con đầu tiên ngay ở khung hình 180.
  w.step();
  assert.equal(w.sim.simTick, 180);
  assert.equal(w.sim.wave, 1);
  assert.equal(w.sim.roundTotalFrames, 900);
  assert.equal(w.sim.roundFramesLeft, 900);

  for (const s of w.sides) {
    assert.equal(s.totalEarned, 100);
    assert.equal(s.lastWaveUnits, 5);
    assert.equal(s.roundIncome, 120);
    assert.equal(s.gold, 0);
    assert.equal(s.spawned, 1, 'xuất đúng 1 lính ở khung hình 180');
    assert.equal(s.spawnPending, 4);
  }

  const f180 = w.frameFor(0);
  assert.equal(f180.wave, 1);
  assert.equal(f180.roundTotalS, 30);
  assert.equal(f180.roundLeft, 30);
  assert.deepEqual(f180.lastWaveUnits, [5, 5]);
  assert.equal(f180.me.gold, 0);
  assert.equal(f180.me.roundIncome, 120);

  const side0SpawnYs = [];
  for (const u of w.sim.units) {
    assertDoorSpawnGeometry(u);
    if (u.owner === 0) side0SpawnYs.push(u.y);
  }

  // Nhịp xuất quân cách nhau THAP_SPAWN_INTERVAL_FRAMES = 4 khung hình: 184, 188, 192, 196.
  const expectedSpawnFrames = new Set([184, 188, 192, 196]);
  for (let frame = 181; frame <= 200; frame++) {
    const prevIds = new Set(w.sim.units.map((u) => u.id));
    const prevSpawned = w.sides[0].spawned;
    w.step();
    const newlySpawned = w.sim.units.filter((u) => !prevIds.has(u.id));

    if (expectedSpawnFrames.has(frame)) {
      assert.equal(w.sides[0].spawned, prevSpawned + 1, `phe 0 xuất thêm ở khung hình ${frame}`);
      assert.equal(w.sides[1].spawned, prevSpawned + 1, `phe 1 xuất thêm ở khung hình ${frame}`);
      assert.equal(newlySpawned.length, 2);
      for (const u of newlySpawned) {
        assertDoorSpawnGeometry(u);
        if (u.owner === 0) side0SpawnYs.push(u.y);
      }
    } else {
      assert.equal(w.sides[0].spawned, prevSpawned, `không xuất quân ở khung hình ${frame}`);
      assert.equal(newlySpawned.length, 0);
    }
  }

  assert.equal(w.sides[0].spawned, 5);
  assert.equal(w.sides[0].spawnPending, 0);
  assert.equal(new Set(side0SpawnYs.map((y) => Math.round(y))).size, 5, '5 lính rải y khác nhau');

  // Bước tới khung hình 1079: vẫn ở Đợt 1, còn 1 khung hình trước Đợt 2.
  stepN(w, 1079 - w.sim.simTick);
  assert.equal(w.sim.simTick, 1079);
  assert.equal(w.sim.wave, 1);
  assert.equal(w.sim.roundFramesLeft, 1);
  assert.equal(w.sides[0].gold, 0);
  assert.equal(w.sides[0].roundIncome, 120);

  // Khung hình 180 + 900 = 1080: Đợt 2 kích hoạt, nhận +120 vàng -> mua 6 Tân Binh (+24 thu nhập -> 144).
  w.step();
  assert.equal(w.sim.simTick, 1080);
  assert.equal(w.sim.wave, 2);
  assert.equal(w.sim.roundFramesLeft, 900);
  assert.equal(w.sim.roundTotalFrames, 900);
  assert.equal(w.sides[0].totalEarned, 220, 'nhận đúng +120 vàng ở Đợt 2');
  assert.equal(w.sides[0].lastWaveUnits, 6);
  assert.equal(w.sides[0].gold, 0);
  assert.equal(w.sides[0].roundIncome, 144);
  assert.equal(w.frameFor(0).lastWaveUnits[0], 6);

  // Kiểm chứng phụ: khi chọn lính đắt hơn thu nhập ở Đợt 2, số vàng 120 được giữ nguyên trên tay.
  const wSave = makeWorld();
  stepN(wSave, 1079);
  assert.equal(wSave.command(0, { t: 'select', kind: 'highlord' }), undefined);
  wSave.step();
  assert.equal(wSave.sim.simTick, 1080);
  assert.equal(wSave.sim.wave, 2);
  assert.equal(wSave.sides[0].gold, 120);
  assert.equal(wSave.sides[0].lastWaveUnits, 0);
});

test('2. Tích lũy vàng mua Bất Tử Quân (180g), chặn dân số > 60 (blocked=pop) & trần thu nhập 8000', () => {
  // 2a. Chọn trước Immortal (cost=180, pop=2, incomeBonus=27) với 100 thu nhập -> để dành qua Đợt 1, mua ở Đợt 2.
  const wSave = makeWorld();
  assert.equal(wSave.command(0, { t: 'select', kind: 'immortal' }), undefined);
  assert.equal(wSave.frameFor(0).me.auto, 'immortal');

  stepN(wSave, 180);
  assert.equal(wSave.sim.wave, 1);
  assert.equal(wSave.sides[0].gold, 100, 'không đủ 180g nên giữ lại 100g');
  assert.equal(wSave.sides[0].roundIncome, 100);
  assert.equal(wSave.sides[0].lastWaveUnits, 0);
  assert.equal(wSave.sides[0].spawned, 0);

  stepN(wSave, 900);
  assert.equal(wSave.sim.simTick, 1080);
  assert.equal(wSave.sim.wave, 2);
  assert.equal(wSave.sides[0].gold, 20, '200 - 180 = 20g còn lại');
  assert.equal(wSave.sides[0].roundIncome, 100 + THAP_UNITS.immortal.incomeBonus);
  assert.equal(wSave.sides[0].lastWaveUnits, 1);
  assert.equal(wSave.sides[0].spawned, 1);
  const spawnedImmortal = wSave.sim.units.find((u) => u.owner === 0);
  assert.equal(spawnedImmortal.kind, 'immortal');

  // 2b. Chặn trần dân số THAP_MAX_POP = 60 (pop + st.pop > 60 -> me.blocked === 'pop', không làm hỏng vàng/thu nhập).
  const wPop = makeWorld();
  assert.equal(wPop.command(1, { t: 'select', kind: 'highlord' }), undefined);
  for (let i = 0; i < 58; i++) {
    wPop.addUnit(0, 'newbie', 135, 340 + (i % 10) * 25);
  }
  assert.equal(wPop.frameFor(0).me.pop, 58);
  assert.equal(wPop.frameFor(0).me.popCap, THAP_MAX_POP);
  assert.equal(wPop.frameFor(0).me.blocked, undefined, '58 + 1 <= 60 chưa bị chặn');

  assert.equal(wPop.command(0, { t: 'select', kind: 'highlord' }), undefined);
  assert.equal(wPop.frameFor(0).me.blocked, 'pop', '58 + 7 = 65 > 60 phải bật blocked=pop');

  wPop.sides[0].gold = 2000;
  wPop.sides[0].roundIncome = 500;
  stepN(wPop, 180);
  assert.equal(wPop.sim.wave, 1);
  assert.equal(wPop.sides[0].lastWaveUnits, 0);
  assert.equal(wPop.sides[0].gold, 2500, 'bị chặn dân số chỉ cộng +500g, không bị trừ vàng oan');
  assert.equal(wPop.sides[0].roundIncome, 500, 'thu nhập không bị cộng thưởng khi không xuất quân');
  assert.equal(wPop.frameFor(0).me.pop, 58);
  assert.equal(wPop.frameFor(0).me.blocked, 'pop');

  // 2c. Trần thu nhập THAP_INCOME_LIMIT = 8000 không bao giờ vượt quá 8000.
  const wCap = makeWorld();
  wCap.sides[0].roundIncome = 7950;
  wCap.sides[0].gold = 5000;
  assert.equal(wCap.command(0, { t: 'select', kind: 'immortal' }), undefined);
  stepN(wCap, 180);
  assert.equal(wCap.sides[0].roundIncome, THAP_INCOME_LIMIT);
  assert.equal(wCap.frameFor(0).me.roundIncome, THAP_INCOME_LIMIT);
  assert.equal(wCap.frameFor(0).me.incomeLimit, THAP_INCOME_LIMIT);

  const wCapStay = makeWorld();
  wCapStay.sides[0].roundIncome = THAP_INCOME_LIMIT;
  assert.equal(wCapStay.command(0, { t: 'select', kind: 'newbie' }), undefined);
  stepN(wCapStay, 180);
  assert.equal(wCapStay.sides[0].roundIncome, THAP_INCOME_LIMIT, 'đã đạt 8000 thì giữ nguyên 8000');
});

test('3. Method 493 sát thương/giáp, delayAttack (0 / 5 / 10) & hủy windup khi chết giữa chừng', () => {
  // 3a. Công thức Method 493 & sát thương lên Pha Lê.
  assert.equal(miragineDamage('samurai', 'newbie'), 17);
  assert.equal(miragineDamage('samurai', 'zombie'), 4);
  assert.equal(miragineDamage('swordman', 'zombie'), 19);
  assert.equal(miragineDamage('newbie', 'highlord'), 1);
  assert.equal(miragineDamage('samurai', 'highlord'), 1);
  assert.equal(miragineCrystalDamage('newbie'), 5);
  assert.equal(miragineCrystalDamage('samurai'), 5);
  assert.equal(miragineCrystalDamage('swordman'), 20);
  assert.equal(miragineCrystalDamage('vampire'), 42);
  assert.equal(miragineCrystalDamage('highlord'), 155);

  // Kiểm chứng thực tế trên chiến trường cho Method 493 (newbie vs highlord = 1, veteran vs zombie = 9, swordman vs zombie = 19).
  const wDmg = makeWorld();
  muteCrystals(wDmg);
  const attackerNewbie = wDmg.addUnit(0, 'newbie', 1000, 470);
  const targetHighlord = wDmg.addUnit(1, 'highlord', 1030, 470);
  targetHighlord.cd = 999;
  wDmg.step();
  assert.equal(attackerNewbie.windupLeft, 0, 'newbie có delayAttack=0 nên đánh ngay khung hình kích hoạt');
  assert.equal(targetHighlord.hp, THAP_UNITS.highlord.hp - 1);

  const wVet = makeWorld();
  muteCrystals(wVet);
  const attackerVet = wVet.addUnit(0, 'veteran', 1000, 470);
  const targetZombie = wVet.addUnit(1, 'zombie', 1030, 470);
  targetZombie.cd = 999;
  wVet.step();
  assert.equal(attackerVet.windupLeft, 0, 'veteran có delayAttack=0 nên đánh ngay khung hình kích hoạt');
  assert.equal(targetZombie.hp, THAP_UNITS.zombie.hp - (10 - 1));

  const wSwd = makeWorld();
  muteCrystals(wSwd);
  wSwd.addUnit(0, 'swordman', 1000, 470);
  const swdVictim = wSwd.addUnit(1, 'zombie', 1030, 470);
  swdVictim.cd = 999;
  stepN(wSwd, 11);
  assert.equal(swdVictim.hp, THAP_UNITS.zombie.hp - 19);

  // 3b. delayAttack = 5 (mage / novice / vampire): đứng windup 5 khung hình rồi mới nổ sát thương & bắn đạn ở khung hình thứ 6.
  const wWindup5 = makeWorld();
  muteCrystals(wWindup5);
  const mage = wWindup5.addUnit(0, 'mage', 900, 470);
  const targetHl = freezeRangedTarget(wWindup5, 1, 'vampire', 1100, 470);
  const expectedMageDmg = miragineDamage('mage', 'vampire'); // 25 - 1 = 24

  wWindup5.step(); // khung hình 1: kích hoạt windupLeft = 5
  assert.equal(mage.windupLeft, 5);
  assert.equal(targetHl.hp, THAP_UNITS.vampire.hp, 'không gây sát thương ở khung hình kích hoạt windup');
  assert.equal(wWindup5.sim.pendingShots.length, 0);

  for (let i = 2; i <= 5; i++) {
    wWindup5.step();
    assert.equal(mage.windupLeft, 6 - i);
    assert.equal(targetHl.hp, THAP_UNITS.vampire.hp, `không gây sát thương trong khung hình windup ${i}`);
    assert.equal(wWindup5.frameFor(0).s.length, 0);
  }

  wWindup5.step(); // khung hình 6: hoàn thành windup (5 -> 0)
  assert.equal(mage.windupLeft, 0);
  assert.equal(targetHl.hp, THAP_UNITS.vampire.hp - expectedMageDmg);
  assert.equal(parseShots(wWindup5.frameFor(0).s).length, 1);

  // 3c. delayAttack = 10 (samurai / zombie): 0 sát thương suốt 10 khung hình windup, chém đúng ở khung hình 11.
  const wWindup10 = makeWorld();
  muteCrystals(wWindup10);
  const samurai = wWindup10.addUnit(0, 'samurai', 1000, 470);
  const targetZom = wWindup10.addUnit(1, 'zombie', 1030, 470);
  targetZom.cd = 999;

  wWindup10.step(); // khung hình 1: windupLeft = 10
  assert.equal(samurai.windupLeft, 10);
  assert.equal(targetZom.hp, THAP_UNITS.zombie.hp);

  for (let i = 2; i <= 10; i++) {
    wWindup10.step();
    assert.equal(samurai.windupLeft, 11 - i);
    assert.equal(targetZom.hp, THAP_UNITS.zombie.hp, `không gây sát thương ở khung hình windup ${i}`);
  }

  wWindup10.step(); // khung hình 11: hoàn thành windup (10 -> 0)
  assert.equal(samurai.windupLeft, 0);
  assert.equal(targetZom.hp, THAP_UNITS.zombie.hp - miragineDamage('samurai', 'zombie'));

  // 3d. Hủy windup khi kẻ ra đòn bị giết giữa chừng -> 0 sát thương & 0 đạn bay ở khung hình hoàn thành.
  const wAttackerDies = makeWorld();
  muteCrystals(wAttackerDies);
  const redVet = wAttackerDies.addUnit(0, 'veteran', 1070, 470);
  redVet.cd = 3; // đánh ở khung hình 3
  const blueMage = wAttackerDies.addUnit(1, 'mage', 1100, 470);
  blueMage.hp = 6; // chết ngay khi veteran chém 6 sát thương

  wAttackerDies.step(); // khung hình 1: mage vào windup 5 khóa redVet
  assert.equal(blueMage.windupLeft, 5);
  assert.equal(redVet.hp, THAP_UNITS.veteran.hp);

  wAttackerDies.step(); // khung hình 2: mage windupLeft = 4
  assert.equal(blueMage.windupLeft, 4);

  wAttackerDies.step(); // khung hình 3: redVet chém chết blueMage
  assert.equal(blueMage.hp, 0);
  assert.equal(redVet.hp, THAP_UNITS.veteran.hp);

  stepN(wAttackerDies, 6); // vượt qua khung hình 6 hoàn thành windup giả định
  assert.equal(redVet.hp, THAP_UNITS.veteran.hp, 'kẻ ra đòn chết giữa chừng thì không gây sát thương');
  assert.equal(wAttackerDies.sim.pendingShots.length, 0);
  assert.equal(wAttackerDies.frameFor(0).s.length, 0, 'không bắn ra đạn phép khi chết giữa windup');

  // 3e. Hủy windup khi mục tiêu bị khóa chết giữa chừng và không có mục tiêu dự phòng trong tầm.
  const wTargetDies = makeWorld();
  muteCrystals(wTargetDies);
  const redMage = wTargetDies.addUnit(0, 'mage', 1000, 470);
  const redKiller = wTargetDies.addUnit(0, 'veteran', 1180, 470);
  redKiller.cd = 2; // chém chết mục tiêu ở khung hình 2
  const blueVictim = wTargetDies.addUnit(1, 'newbie', 1200, 470);
  blueVictim.hp = 5;
  blueVictim.cd = 999;

  wTargetDies.step(); // khung hình 1: redMage khóa blueVictim (windupLeft=5)
  assert.equal(redMage.windupLeft, 5);
  assert.equal(redMage.windupTargetId, blueVictim.id);
  assert.equal(redMage.attacking, true);

  wTargetDies.step(); // khung hình 2: redMage windupLeft=4; redKiller giết blueVictim
  assert.equal(blueVictim.hp, 0);

  wTargetDies.step(); // khung hình 3: redMage phát hiện mục tiêu chết & không có mục tiêu thay thế trong tầm -> hủy sạch
  assert.equal(redMage.windupLeft, 0);
  assert.equal(redMage.windupTargetId, 0);
  assert.equal(redMage.windupTargetBase, -1);
  assert.equal(redMage.attacking, false);
  assert.equal(redMage.cd, 0, 'hủy windup sạch sẽ, không mất hồi chiêu');

  stepN(wTargetDies, 5);
  assert.equal(wTargetDies.sim.pendingShots.length, 0);
  assert.equal(wTargetDies.frameFor(0).s.length, 0);

  // 3d. Chuyển mục tiêu giữa windup khi vẫn còn địch trong tầm & tiêu diệt địch không cộng vàng trực tiếp.
  const wRetarget = makeWorld();
  muteCrystals(wRetarget);
  const goldBeforeKill = wRetarget.sides[0].gold;
  const mageRetarget = wRetarget.addUnit(0, 'mage', 900, 470);
  const redFinisher = wRetarget.addUnit(0, 'newbie', 1085, 470);
  redFinisher.cd = 1;
  const bDieSoon = freezeRangedTarget(wRetarget, 1, 'newbie', 1100, 470);
  bDieSoon.hp = 5;
  const bBackup = freezeRangedTarget(wRetarget, 1, 'vampire', 1120, 470);
  wRetarget.step(); // tick 1: mage khóa bDieSoon; redFinisher giảm cd về 0
  assert.equal(mageRetarget.windupTargetId, bDieSoon.id);
  wRetarget.step(); // tick 2: redFinisher đánh chết bDieSoon -> không thưởng vàng trực tiếp
  assert.equal(bDieSoon.hp, 0);
  assert.equal(wRetarget.sides[0].gold, goldBeforeKill, 'hạ lính địch không thưởng vàng trực tiếp');
  wRetarget.step(); // tick 3: mage chuyển windup sang bBackup còn sống trong tầm
  assert.equal(mageRetarget.windupTargetId, bBackup.id);
  assert.ok(mageRetarget.windupLeft > 0);
});

test('4. Đạn phép, sát thương lan (Mage 45px / Vampire 38px / Novice 0) & Trụ Pha Lê (4 / 5, tầm 600, hồi 30f, mã chết idx+1)', () => {
  // 4a. Mage (fb): trúng chính 100%, lan 50% trong 45px, bỏ qua địch > 45px và quân đồng minh.
  const wMage = makeWorld();
  muteCrystals(wMage);
  wMage.addUnit(0, 'mage', 900, 470);
  const mPrimary = freezeRangedTarget(wMage, 1, 'novice', 1100, 470); // 0px
  const mNearArmored = freezeRangedTarget(wMage, 1, 'vampire', 1100, 510); // 40px <= 45px
  const mNearLight = freezeRangedTarget(wMage, 1, 'novice', 1144, 470); // 44px <= 45px
  const mOutside = freezeRangedTarget(wMage, 1, 'novice', 1146, 470); // 46px > 45px
  const mFriendly = freezeRangedTarget(wMage, 0, 'novice', 1100, 440); // đồng minh 30px

  stepN(wMage, 6);
  const mageShots = parseShots(wMage.frameFor(0).s);
  assert.equal(mageShots.length, 1);
  assert.equal(mageShots[0].type, THAP_SHOT_FB);
  assert.equal(mageShots[0].targetId, mPrimary.id);
  assert.equal(mPrimary.hp, THAP_UNITS.novice.hp - miragineDamage('mage', 'novice')); // 75 - 50 = 25
  assert.equal(
    mNearArmored.hp,
    THAP_UNITS.vampire.hp - Math.round(miragineDamage('mage', 'vampire') * THAP_SPLASH_FACTOR),
  ); // 140 - 12 = 128
  assert.equal(
    mNearLight.hp,
    THAP_UNITS.novice.hp - Math.round(miragineDamage('mage', 'novice') * THAP_SPLASH_FACTOR),
  ); // 75 - 25 = 50
  assert.equal(mOutside.hp, THAP_UNITS.novice.hp, 'địch ngoài 45px không nhận sát thương lan');
  assert.equal(mFriendly.hp, THAP_UNITS.novice.hp, 'đồng minh không nhận sát thương lan');

  // 4b. Vampire (storm): trúng chính 100%, lan 50% trong 38px, bỏ qua địch > 38px và đồng minh.
  const wVamp = makeWorld();
  muteCrystals(wVamp);
  wVamp.addUnit(0, 'vampire', 900, 470);
  const vPrimary = freezeRangedTarget(wVamp, 1, 'vampire', 1100, 470); // 0px
  const vNear = freezeRangedTarget(wVamp, 1, 'vampire', 1135, 470); // 35px <= 38px
  const vOutside = freezeRangedTarget(wVamp, 1, 'vampire', 1139, 470); // 39px > 38px
  const vFriendly = freezeRangedTarget(wVamp, 0, 'novice', 1100, 445); // đồng minh 25px

  stepN(wVamp, 6);
  const vampShots = parseShots(wVamp.frameFor(0).s);
  assert.equal(vampShots.length, 1);
  assert.equal(vampShots[0].type, THAP_SHOT_STORM);
  assert.equal(vampShots[0].targetId, vPrimary.id);
  assert.equal(vPrimary.hp, THAP_UNITS.vampire.hp - miragineDamage('vampire', 'vampire')); // 140 - 41 = 99
  assert.equal(
    vNear.hp,
    THAP_UNITS.vampire.hp - Math.round(miragineDamage('vampire', 'vampire') * THAP_SPLASH_FACTOR),
  ); // 140 - 21 = 119
  assert.equal(vOutside.hp, THAP_UNITS.vampire.hp, 'địch ngoài 38px không nhận lan storm');
  assert.equal(vFriendly.hp, THAP_UNITS.novice.hp);

  // 4c. Novice (tb): đơn mục tiêu tuyệt đối, lính sát bên cách 10px nhận 0 sát thương lan.
  const wNovice = makeWorld();
  muteCrystals(wNovice);
  wNovice.addUnit(0, 'novice', 900, 470);
  const nPrimary = freezeRangedTarget(wNovice, 1, 'novice', 1100, 470);
  const nAdjacent = freezeRangedTarget(wNovice, 1, 'novice', 1110, 470); // 10px

  stepN(wNovice, 6);
  const noviceShots = parseShots(wNovice.frameFor(0).s);
  assert.equal(noviceShots.length, 1);
  assert.equal(noviceShots[0].type, THAP_SHOT_TB);
  assert.equal(noviceShots[0].targetId, nPrimary.id);
  assert.equal(nPrimary.hp, THAP_UNITS.novice.hp - miragineDamage('novice', 'novice')); // 75 - 11 = 64
  assert.equal(nAdjacent.hp, THAP_UNITS.novice.hp, 'tb chỉ đánh đơn mục tiêu, cách 10px nhận 0 lan');

  // 4d. A_crystal bắn mã 4 (THAP_SHOT_FB | THAP_SHOT_CRYSTAL_FLAG), tầm 600, sát thương 100 - giáp, hồi 30f.
  const wCrystalA = makeWorld();
  wCrystalA.sides[1].crystalCd = 1e9;
  const outOfRange = wCrystalA.addUnit(1, 'highlord', THAP_CRYSTALS[0][0] + THAP_BASE.range + 20, 470);
  wCrystalA.step();
  assert.equal(wCrystalA.sim.pendingShots.length, 0, 'ngoài tầm 600 + radius thì A_crystal chưa bắn');
  assert.equal(outOfRange.hp, THAP_UNITS.highlord.hp);
  outOfRange.hp = 0; // dọn để thử vị trí đúng tầm 600

  const wCrystalTiming = makeWorld();
  wCrystalTiming.sides[1].crystalCd = 1e9;
  const blueHl = wCrystalTiming.addUnit(1, 'highlord', THAP_CRYSTALS[0][0] + THAP_BASE.range, 470);
  wCrystalTiming.step(); // khung hình 1: bắn lần 1 (100 - 4 = 96 dmg)
  assert.equal(wCrystalTiming.sides[0].crystalCd, THAP_BASE.weaponSpeedFrames);
  assert.equal(THAP_BASE.weaponSpeedFrames, 30);
  assert.equal(blueHl.hp, THAP_UNITS.highlord.hp - (THAP_BASE.atk - THAP_UNITS.highlord.armor));
  assert.equal(wCrystalTiming.sim.pendingShots.length, THAP_SHOT_FIELDS);
  assert.equal(wCrystalTiming.sim.pendingShots[4], THAP_SHOT_FB | THAP_SHOT_CRYSTAL_FLAG);
  assert.equal(THAP_SHOT_FB | THAP_SHOT_CRYSTAL_FLAG, 4);

  // 29 khung hình kế tiếp (2..30): trụ đang hồi chiêu, không bắn thêm phát nào.
  stepN(wCrystalTiming, 29);
  assert.equal(wCrystalTiming.sides[0].crystalCd, 1);
  assert.equal(blueHl.hp, THAP_UNITS.highlord.hp - 96);

  // Khung hình 31 (1 + 30): hồi chiêu về 0 và bắn phát thứ 2.
  wCrystalTiming.step();
  assert.equal(wCrystalTiming.sides[0].crystalCd, 30);
  assert.equal(blueHl.hp, THAP_UNITS.highlord.hp - 96 * 2);

  // Kiểm chứng B_crystal bắn mã 5 (THAP_SHOT_TB | THAP_SHOT_CRYSTAL_FLAG) & sát thương 100 lên Giáp Nhẹ.
  const wCrystalB = makeWorld();
  wCrystalB.sides[0].crystalCd = 1e9;
  const redNovice = wCrystalB.addUnit(0, 'novice', THAP_CRYSTALS[1][0] - 400, 470);
  const redMonk = wCrystalB.addUnit(0, 'monk', THAP_CRYSTALS[1][0] - 500, 470);
  wCrystalB.step(); // B_crystal chọn redNovice gần hơn -> 100 dmg kết liễu ngay 75 HP
  assert.equal(redNovice.hp, 0);
  assert.equal(wCrystalB.sim.pendingShots[4], THAP_SHOT_TB | THAP_SHOT_CRYSTAL_FLAG);
  assert.equal(THAP_SHOT_TB | THAP_SHOT_CRYSTAL_FLAG, 5);
  stepN(wCrystalB, 29);
  wCrystalB.step(); // Phát thứ 2 của B_crystal nhắm vào redMonk (Giáp Nhẹ, armor=1 -> 99 dmg)
  assert.equal(redMonk.hp, THAP_UNITS.monk.hp - (100 - THAP_UNITS.monk.armor));

  // 4e. Pha Lê về 0 HP phát sinh mã chết dương (idx + 1) và kết thúc trận đấu.
  for (const targetIdx of [0, 1]) {
    const attackerIdx = targetIdx === 0 ? 1 : 0;
    const wDestroy = makeWorld();
    muteCrystals(wDestroy);
    wDestroy.sides[targetIdx].baseHp = 5;
    const [cx, cy] = THAP_CRYSTALS[targetIdx];
    const unitX = attackerIdx === 0 ? cx - 75 : cx + 75;
    wDestroy.addUnit(attackerIdx, 'newbie', unitX, cy);

    wDestroy.step();
    assert.equal(wDestroy.sides[targetIdx].baseHp, 0);
    assert.equal(wDestroy.result.winnerTeam, wDestroy.sides[attackerIdx].team);
    assert.equal(wDestroy.result.reason, 'crystal');

    const finalFrame = wDestroy.frameFor(0);
    assert.equal(finalFrame.bh[targetIdx], 0);
    assert.equal(finalFrame.al[targetIdx], 0);
    assert.deepEqual(finalFrame.d, [Math.round(cx), Math.round(cy), targetIdx + 1]);
    assert.deepEqual(decodeDeathCode(finalFrame.d[2]), { isBase: true, owner: targetIdx });
  }

  // 4f. Khi cả hai Pha Lê cùng còn 5 HP ở cùng 1 nhịp 30Hz, bên đánh trúng trước giữ nguyên kết quả thắng.
  const wDualCollapse = makeWorld();
  muteCrystals(wDualCollapse);
  wDualCollapse.sides[0].baseHp = 5;
  wDualCollapse.sides[1].baseHp = 5;
  wDualCollapse.addUnit(0, 'newbie', THAP_CRYSTALS[1][0] - 75, THAP_CRYSTALS[1][1]);
  wDualCollapse.addUnit(1, 'newbie', THAP_CRYSTALS[0][0] + 75, THAP_CRYSTALS[0][1]);
  wDualCollapse.step();
  assert.equal(wDualCollapse.result.winnerTeam, 0);
  assert.equal(wDualCollapse.sides[1].alive, false);
  assert.equal(wDualCollapse.sides[0].alive, true, 'Pha Lê còn lại không bị phá sau khi đã định thắng thua');

  // 4g. Thời gian bay đạn trụ Pha Lê clamp đúng [120..280]ms theo khoảng cách thực.
  const wShotClamp = makeWorld();
  wShotClamp.sides[1].crystalCd = 1e9;
  wShotClamp.addUnit(1, 'highlord', THAP_CRYSTALS[0][0] + 50, THAP_CRYSTALS[0][1]);
  wShotClamp.step();
  assert.equal(wShotClamp.sim.pendingShots[6], 120, '50px -> 23ms clamp lên MIN 120ms');

  const wShotMid = makeWorld();
  wShotMid.sides[1].crystalCd = 1e9;
  wShotMid.addUnit(1, 'highlord', THAP_CRYSTALS[0][0] + 400, THAP_CRYSTALS[0][1]);
  wShotMid.step();
  assert.equal(wShotMid.sim.pendingShots[6], 180, '400px -> Math.round(400 * 0.45) = 180ms');
});

test('5. Đệm sự kiện 30Hz -> 15Hz đa client (frameFor 0 / 1 / spectator không nuốt sự kiện) & bảo mật frame.me', () => {
  let netTicks = 0;
  const w = makeWorld(
    {},
    {
      tick() {
        netTicks += 1;
      },
      changed() {},
    },
  );

  assert.equal(w.command(0, { t: 'select', kind: 'mage' }), undefined);
  assert.equal(w.command(1, { t: 'select', kind: 'highlord' }), undefined);

  // Tạo sẵn ảnh khung hình tick-0 trước khi chạy bước lẻ simTick = 1.
  const f0Init = w.frameFor(0);
  assert.equal(f0Init.tick, 0);

  // Sắp đặt để đồng thời xảy ra: atkStart, unit death (trên simTick = 1) và crystal shot (trên simTick = 1).
  w.sides[1].crystalCd = 1e9;
  const redNewbie = w.addUnit(0, 'newbie', 1000, 470);
  const blueVictim = w.addUnit(1, 'newbie', 1030, 470);
  blueVictim.hp = 5;
  blueVictim.cd = 999;
  w.addUnit(1, 'highlord', THAP_CRYSTALS[0][0] + 400, 470); // kích hoạt A_crystal bắn ở simTick = 1

  // Bước 1 (simTick = 1, nhịp lẻ 30Hz): sự kiện phải được đệm lại, chưa phát tick mạng.
  w.step();
  assert.equal(w.sim.simTick, 1);
  assert.equal(w.sim.netTick, 0);
  assert.equal(netTicks, 0);
  assert.equal(redNewbie.atkStartPending, true, 'atkStartPending giữ nguyên qua bước lẻ');
  assert.equal(w.sim.pendingShots.length, THAP_SHOT_FIELDS, 'đạn bắn ở simTick=1 vẫn đang đệm');
  assert.equal(w.sim.pendingDeaths.length, 3, 'xác chết ở simTick=1 vẫn đang đệm');

  // Đọc frameFor khi đang ở bước lẻ không được làm rỗng bộ đệm chưa phát.
  const f0Mid = w.frameFor(0);
  assert.equal(f0Mid.tick, 0);
  assert.equal(f0Mid.s.length, 0);
  assert.equal(f0Mid.d.length, 0);
  assert.equal(w.sim.pendingShots.length, THAP_SHOT_FIELDS);
  assert.equal(w.sim.pendingDeaths.length, 3);

  // Bước 2 (simTick = 2, nhịp chẵn 15Hz): xả toàn bộ bộ đệm sang snapshot chung một lần duy nhất.
  w.step();
  assert.equal(w.sim.simTick, 2);
  assert.equal(w.sim.netTick, 1);
  assert.equal(netTicks, 1);
  assert.equal(redNewbie.atkStartPending, false);
  assert.equal(w.sim.pendingShots.length, 0);
  assert.equal(w.sim.pendingDeaths.length, 0);

  const f0 = w.frameFor(0);
  const f1 = w.frameFor(1);
  const fSpec = w.frameFor(undefined);

  assert.equal(f0.tick, 1);
  assert.equal(f1.tick, 1);
  assert.equal(fSpec.tick, 1);

  assert.equal(f0.s.length, THAP_SHOT_FIELDS);
  assert.equal(f0.d.length, 3);
  assert.deepEqual(f1.s, f0.s, 'client 1 nhận nguyên vẹn s mà không bị client 0 nuốt');
  assert.deepEqual(fSpec.s, f0.s, 'khán giả nhận nguyên vẹn s mà không bị nuốt');
  assert.deepEqual(f1.d, f0.d, 'client 1 nhận nguyên vẹn d mà không bị client 0 nuốt');
  assert.deepEqual(fSpec.d, f0.d, 'khán giả nhận nguyên vẹn d mà không bị nuốt');
  assert.deepEqual(f1.u, f0.u);
  assert.deepEqual(fSpec.u, f0.u);

  const decodedDeath = decodeDeathCode(f0.d[2]);
  assert.deepEqual(decodedDeath, {
    isBase: false,
    kindIdx: THAP_UNIT_KINDS.indexOf('newbie'),
    owner: 1,
    left: true,
  });

  // Kiểm tra bit cờ THAP_FLAG_ATK_START xuất hiện đồng nhất cho cả P0, P1 và khán giả.
  for (const frame of [f0, f1, fSpec]) {
    const uEntry = parseFrameUnits(frame.u).find((u) => u.id === redNewbie.id);
    assert.ok(uEntry, 'redNewbie phải có mặt trong frame.u');
    assert.notEqual(
      uEntry.flags & THAP_FLAG_ATK_START,
      0,
      'cờ THAP_FLAG_ATK_START phải truyền đủ cho mọi client',
    );
  }

  // Bảo mật riêng tư: `frame.me` chỉ thuộc về người nhận, không bao giờ lộ `auto` đối thủ.
  assert.equal(f0.me.auto, 'mage');
  assert.equal(f1.me.auto, 'highlord');
  assert.equal(fSpec.me, undefined);
  assert.equal(JSON.stringify(f0).includes('highlord'), false, 'khung hình P0 không lộ auto của P1');
  assert.equal(JSON.stringify(f1).includes('mage'), false, 'khung hình P1 không lộ auto của P0');
  assert.equal(JSON.stringify(fSpec).includes('mage'), false);
  assert.equal(JSON.stringify(fSpec).includes('highlord'), false);

  // Kiểm chứng thêm: đạn phép từ lính (Mage bắn ở simTick lẻ = 7) cũng đệm sang chẵn = 8, rồi sạch ở nhịp sau = 10.
  const wUnitShot = makeWorld();
  muteCrystals(wUnitShot);
  stepN(wUnitShot, 1); // simTick = 1
  wUnitShot.addUnit(0, 'mage', 900, 470);
  freezeRangedTarget(wUnitShot, 1, 'vampire', 1100, 470);

  // simTick = 2: mage bắt đầu windupLeft=5; simTick = 7 (lẻ): hoàn tất windup và bắn cầu lửa.
  stepN(wUnitShot, 6);
  assert.equal(wUnitShot.sim.simTick, 7);
  assert.equal(wUnitShot.sim.pendingShots.length, THAP_SHOT_FIELDS);
  assert.equal(wUnitShot.sim.pendingShots[4], THAP_SHOT_FB);

  wUnitShot.step(); // simTick = 8 (chẵn): xả đạn lên mạng
  const fFlush0 = wUnitShot.frameFor(0);
  const fFlush1 = wUnitShot.frameFor(1);
  const fFlushSpec = wUnitShot.frameFor(undefined);
  assert.equal(fFlush0.s.length, THAP_SHOT_FIELDS);
  assert.equal(fFlush0.s[4], THAP_SHOT_FB);
  assert.deepEqual(fFlush1.s, fFlush0.s);
  assert.deepEqual(fFlushSpec.s, fFlush0.s);

  wUnitShot.stepFrame(); // simTick = 10: nhịp mạng kế tiếp không rò rỉ sự kiện cũ
  assert.equal(wUnitShot.frameFor(0).s.length, 0);
  assert.equal(wUnitShot.frameFor(0).d.length, 0);
});
