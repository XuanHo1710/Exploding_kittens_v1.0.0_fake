'use strict';

// Đêm Zombie (spec 007): mô hình ánh sáng dùng chung client/server, cấu hình phòng,
// và client Redis RESP2 (chạy ở chế độ tắt / bộ nhớ — không cần Redis thật).
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const redisMod = require('../dist/server/src/game/bansung/bansung-redis.js');

const { BANSUNG_NIGHT, isPointLitBy, isPointLitByAny, isBansungNightEnabled, normalizeBansungConfig } = S;

test('night: quầng sáng quanh người chơi chiếu mọi hướng', () => {
  const src = { x: 1000, y: 1000, aim: 0, power: 1 };
  const r = BANSUNG_NIGHT.AMBIENT_RADIUS - 4;
  assert.equal(isPointLitBy(src, 1000 - r, 1000), true, 'sau lưng trong quầng sáng phải thấy');
  assert.equal(isPointLitBy(src, 1000, 1000 + r), true);
  assert.equal(isPointLitBy(src, 1000 - BANSUNG_NIGHT.AMBIENT_RADIUS - 60, 1000), false, 'sau lưng ngoài quầng là tối');
});

test('night: đèn pin soi theo hướng ngắm, xoay chuột thì vùng sáng đổi theo', () => {
  const far = BANSUNG_NIGHT.CONE_RANGE - 20;
  const right = { x: 0, y: 0, aim: 0, power: 1 };
  const down = { x: 0, y: 0, aim: Math.PI / 2, power: 1 };
  assert.equal(isPointLitBy(right, far, 0), true, 'trong nón đèn');
  assert.equal(isPointLitBy(right, 0, far), false, 'lệch 90° là tối');
  assert.equal(isPointLitBy(down, 0, far), true, 'xoay xuống thì soi được');
  assert.equal(isPointLitBy(right, BANSUNG_NIGHT.CONE_RANGE + 80, 0), false, 'quá tầm đèn là tối');
});

test('night: pad của server nới viền để client fade-in mượt', () => {
  const src = { x: 0, y: 0, aim: 0, power: 1 };
  const edge = BANSUNG_NIGHT.CONE_RANGE + BANSUNG_NIGHT.SERVER_REVEAL_PAD / 2;
  assert.equal(isPointLitBy(src, edge, 0), false);
  assert.equal(isPointLitBy(src, edge, 0, BANSUNG_NIGHT.SERVER_REVEAL_PAD), true);
});

test('night: người bị gục chỉ còn đèn yếu; đồng đội soi giúp', () => {
  const downed = { x: 0, y: 0, aim: 0, power: BANSUNG_NIGHT.DOWNED_RANGE_MULT };
  const mate = { x: 400, y: 300, aim: Math.PI, power: 1 };
  const p = [BANSUNG_NIGHT.CONE_RANGE * 0.8, 0];
  assert.equal(isPointLitBy(downed, p[0], p[1]), false);
  assert.equal(isPointLitByAny([downed, mate], 300, 300), true);
});

test('night: cấu hình phòng bật mặc định, chỉ tắt khi gửi false', () => {
  assert.equal(normalizeBansungConfig({}, 1).nightMode, true);
  assert.equal(normalizeBansungConfig({ nightMode: false }, 1).nightMode, false);
  assert.equal(normalizeBansungConfig({ nightMode: 'abc' }, 1).nightMode, true);
  assert.equal(isBansungNightEnabled(undefined), true);
  assert.equal(isBansungNightEnabled({ nightMode: false }), false);
});

test('redis: không cấu hình URL → chế độ bộ nhớ, mọi API an toàn & bảng xếp hạng vẫn chạy', async () => {
  const r = redisMod.BansungRedis.fromEnv({});
  assert.equal(r.enabled, false);
  r.rememberSession('p1', 'ABCD');
  r.checkpointRoom('ABCD', { wave: 3 });
  r.recordMatch({
    mode: 'survival',
    difficulty: 'normal',
    victory: true,
    wave: 5,
    elapsedMs: 60000,
    players: [
      { id: 'p1', name: 'An', score: 500, kills: 40 },
      { id: 'p2', name: 'Bình', score: 900, kills: 70 },
      { id: 'bot:bs0', name: 'Bot', score: 9999, bot: true },
    ],
  });
  r.recordMatch({
    mode: 'survival',
    difficulty: 'normal',
    victory: false,
    wave: 2,
    elapsedMs: 20000,
    players: [{ id: 'p1', name: 'An', score: 300 }],
  });
  const top = await r.topScores('survival', 'normal', 5);
  assert.deepEqual(top.map((t) => [t.id, t.score]), [['p2', 900], ['p1', 500]], 'giữ điểm cao nhất, bỏ bot');
  assert.equal(await r.lookupSession('p1'), null);
  r.close();
});

test('redis: URL hợp lệ được parse đúng host/port/db', () => {
  const r = redisMod.BansungRedis.fromEnv({ BANSUNG_REDIS_URL: 'redis://:pw@10.0.0.5:6390/2' });
  assert.equal(r.enabled, true);
  assert.equal(r.live, false, 'chưa gửi lệnh thì chưa mở socket');
  r.close();
});

// ── Spec 007 v2: thời tiết theo wave (mưa nặng dần, sét ở wave cuối) ──────────────
const { BANSUNG_WEATHER, getBansungStormLevel, getBansungRainIntensity, getBansungLightningFlash, getBansungLightningStrike } = S;

test('weather: mức bão tăng theo wave và theo stage Sinh Tồn', () => {
  assert.equal(getBansungStormLevel(1), 0);
  assert.equal(getBansungStormLevel(10), 1);
  assert.ok(Math.abs(getBansungStormLevel(5) - 4 / 9) < 1e-9);
  assert.equal(getBansungStormLevel(1, 1, 3), 1);
});

test('weather: mưa bắt đầu từ wave 2 và to dần tới 1', () => {
  assert.equal(getBansungRainIntensity(0), 0);
  assert.equal(getBansungRainIntensity(0.05), 0);
  assert.ok(getBansungRainIntensity(0.1) >= BANSUNG_WEATHER.RAIN_MIN);
  assert.ok(getBansungRainIntensity(0.9) > getBansungRainIntensity(0.4));
  assert.equal(getBansungRainIntensity(1), 1);
});

test('weather: chưa tới wave muộn thì không có sét', () => {
  for (let ms = 0; ms <= 60000; ms += 25) {
    assert.equal(getBansungLightningFlash(123, ms, 0.5), 0);
  }
});

test('weather: bão tối đa có sét, độ sáng trong [0,1], xác định theo (seed, ms)', () => {
  let peak = 0;
  for (let ms = 0; ms <= 60000; ms += 5) {
    const f = getBansungLightningFlash(123, ms, 1);
    assert.ok(f >= 0 && f <= 1);
    assert.equal(f, getBansungLightningFlash(123, ms, 1), 'cùng seed & ms phải cho cùng kết quả (client = server)');
    if (f > peak) peak = f;
  }
  assert.ok(peak > 0.5, `phải có ít nhất 1 cú chớp mạnh (peak=${peak})`);
  const out = { startMs: -1, preset: 0, boltSeed: 0, boltU: 0.5 };
  for (let slot = 0; slot < 40; slot++) {
    const s = getBansungLightningStrike(123, slot * BANSUNG_WEATHER.LIGHTNING_SLOT_MS + 1, 1, out);
    if (s.startMs < 0) continue;
    assert.ok(s.startMs >= slot * BANSUNG_WEATHER.LIGHTNING_SLOT_MS);
    assert.ok(s.startMs <= slot * BANSUNG_WEATHER.LIGHTNING_SLOT_MS + BANSUNG_WEATHER.LIGHTNING_SLOT_MS - 800);
  }
});

test('night v2: hằng số đèn pin vẫn hợp lệ cho lọc bóng tối phía server', () => {
  const { BANSUNG_NIGHT } = S;
  assert.ok(BANSUNG_NIGHT.CONE_RANGE > BANSUNG_NIGHT.AMBIENT_RADIUS);
  assert.ok(BANSUNG_NIGHT.CONE_HALF_ANGLE > 0.3 && BANSUNG_NIGHT.CONE_HALF_ANGLE < 0.8);
  assert.ok(BANSUNG_NIGHT.DARKNESS_ALPHA > 0.8 && BANSUNG_NIGHT.DARKNESS_ALPHA <= 1);
});

test('enemies v2: mọi quái/boss có tên tiếng Anh ngắn, không trùng', () => {
  const names = new Set();
  for (const id of S.BANSUNG_ENEMY_IDS ?? Object.keys(S.BANSUNG_ENEMIES)) {
    const n = S.BANSUNG_ENEMIES[id].shortName;
    assert.ok(typeof n === 'string' && n.length > 0 && n.split(' ').length <= 2, `${id} shortName ngắn`);
    assert.equal(names.has(n), false, `trùng tên ${n}`);
    names.add(n);
  }
});

test('redis: URL hợp lệ — đóng kết nối an toàn khi chưa mở', () => {
  const r = redisMod.BansungRedis.fromEnv({ BANSUNG_REDIS_URL: 'redis://127.0.0.1:6390' });
  assert.equal(r.live, false, 'chưa gửi lệnh thì chưa mở socket');
  r.close();
});

// ── Spec 007 v2 · B4b: skill mới cho Brood Eye / Iron Hulk / Plague Core ─────────────
const zskills = require('../dist/server/src/game/bansung/boss-zombie-skills.js');

function runZombieSkills(kind, ticks, opts = {}) {
  const st = zskills.createZombieSkillState();
  const players = opts.players ?? [{ x: 600, y: 300, radius: 13, alive: true, hp: 100 }];
  const bullets = [];
  const beamHits = [];
  const tgs = [];
  let maxTg = 0;
  for (let t = 0; t < ticks; t++) {
    tgs.length = 0;
    zskills.stepZombieBossSkills(st, {
      bossId: 7,
      kind,
      x: 300,
      y: 300,
      radius: 40,
      phase: opts.phase ?? 1,
      roaming: opts.roaming ?? true,
      players,
      projectileBudget: opts.budget,
      emit: (b) => bullets.push(b),
      onBeamHit: (pl, dmg) => beamHits.push(dmg),
      fx: [],
      telegraphsOut: tgs,
    });
    maxTg = Math.max(maxTg, tgs.length);
  }
  return { st, bullets, beamHits, maxTg };
}

test('zombie skills: không dùng skill mới trong 20 s đầu (giữ nguyên test hành vi boss cũ)', () => {
  for (const kind of ['boss_beholder', 'boss_colossus', 'boss_overlord']) {
    const r = runZombieSkills(kind, zskills.ZOMBIE_SKILL_CFG.FIRST_USE_TICKS - 1);
    assert.equal(r.bullets.length, 0, `${kind} không được bắn đạn mới trước 20 s`);
    assert.equal(r.st.active, null);
  }
});

test('zombie skills: Brood Spiral bắn xoắn ốc có curl sau 20 s, có telegraph', () => {
  const r = runZombieSkills('boss_beholder', zskills.ZOMBIE_SKILL_CFG.FIRST_USE_TICKS + 90);
  assert.ok(r.bullets.length >= 40, `spiral phải bắn nhiều đạn (got ${r.bullets.length})`);
  assert.ok(r.bullets.every((b) => typeof b.angVel === 'number' && b.angVel !== 0), 'đạn xoắn ốc phải có curl');
  assert.ok(r.maxTg >= 1, 'skill phải có telegraph cảnh báo');
});

test('zombie skills: Furnace Beam của Iron Hulk gây sát thương khi quét trúng người chơi', () => {
  const st0 = zskills.createZombieSkillState();
  st0.useIdx = 1; // chọn skill thứ 2 trong vòng xoay = furnace_beam
  const players = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    players.push({ x: 300 + Math.cos(a) * 250, y: 300 + Math.sin(a) * 250, radius: 13, alive: true, hp: 100 });
  }
  let hits = 0;
  for (let t = 0; t < zskills.ZOMBIE_SKILL_CFG.FIRST_USE_TICKS + 80; t++) {
    zskills.stepZombieBossSkills(st0, {
      bossId: 3, kind: 'boss_colossus', x: 300, y: 300, radius: 40, phase: 1, roaming: true,
      players, emit: () => {}, onBeamHit: () => { hits++; }, fx: [], telegraphsOut: [],
    });
  }
  assert.ok(hits > 0, 'laser quét phải trúng ít nhất 1 người chơi đứng quanh boss');
});

test('zombie skills: tôn trọng trần đạn (Plague Core) và tự huỷ khi boss rời trạng thái di chuyển', () => {
  const capped = runZombieSkills('boss_overlord', zskills.ZOMBIE_SKILL_CFG.FIRST_USE_TICKS + 60, { budget: 0 });
  assert.equal(capped.bullets.length, 0, 'hết ngân sách đạn thì không bắn');
  const st = zskills.createZombieSkillState();
  const base = { bossId: 1, kind: 'boss_overlord', x: 0, y: 0, radius: 40, phase: 2,
    players: [{ x: 300, y: 0, radius: 13, alive: true, hp: 100 }], emit: () => {}, telegraphsOut: [] };
  for (let t = 0; t < zskills.ZOMBIE_SKILL_CFG.FIRST_USE_TICKS + 5; t++) zskills.stepZombieBossSkills(st, { ...base, roaming: true });
  assert.notEqual(st.active, null, 'skill phải bắt đầu');
  zskills.stepZombieBossSkills(st, { ...base, roaming: false });
  assert.equal(st.active, null, 'boss bị FSM gốc kéo sang chiêu khác → skill mới dừng');
});

// ── Spec 007 · B4c: skill boss tự chỉnh theo độ khó phòng ────────────────────────
test('zombie skills: bảng độ khó tăng dần Thường → Khó → Địa Ngục', () => {
  const T = zskills.ZOMBIE_SKILL_DIFFICULTY;
  assert.deepEqual(T.normal, { firstUse: 1, cd: 1, density: 1, dmg: 1, speed: 1, spin: 1 }, 'Thường giữ số gốc');
  for (const [a, b] of [['normal', 'hard'], ['hard', 'hell']]) {
    assert.ok(T[b].firstUse < T[a].firstUse, `${b} dùng skill sớm hơn ${a}`);
    assert.ok(T[b].cd < T[a].cd, `${b} hồi chiêu nhanh hơn ${a}`);
    assert.ok(T[b].density > T[a].density && T[b].dmg > T[a].dmg, `${b} dày & đau hơn ${a}`);
    assert.ok(T[b].speed > T[a].speed && T[b].spin > T[a].spin, `${b} nhanh & xoay nhanh hơn ${a}`);
  }
  assert.equal(zskills.resolveZombieSkillTune('khong_ton_tai'), T.normal, 'độ khó lạ → Thường');
  assert.equal(zskills.zombieFirstUseTicks(T.hard), 450);
  assert.equal(zskills.zombieFirstUseTicks(T.hell), 300);
});

function countSkillBullets(kind, difficulty, ticks, phase = 1) {
  const st = zskills.createZombieSkillState(difficulty);
  let n = 0;
  let firstTick = -1;
  let dmg = 0;
  for (let t = 0; t < ticks; t++) {
    zskills.stepZombieBossSkills(st, {
      bossId: 9, kind, x: 300, y: 300, radius: 40, phase, roaming: true,
      players: [{ x: 640, y: 300, radius: 13, alive: true, hp: 100 }],
      emit: (b) => { n++; dmg = b.damage; if (firstTick < 0) firstTick = t; },
      fx: [], telegraphsOut: [],
    });
  }
  return { n, firstTick, dmg };
}

test('zombie skills: Địa Ngục dùng skill sớm hơn, đạn dày & đau hơn Thường', () => {
  for (const kind of ['boss_beholder', 'boss_colossus', 'boss_overlord']) {
    const normal = countSkillBullets(kind, 'normal', 700);
    const hell = countSkillBullets(kind, 'hell', 700);
    assert.ok(hell.firstTick >= 300 && hell.firstTick < normal.firstTick, `${kind}: hell bắt đầu sớm hơn (${hell.firstTick} vs ${normal.firstTick})`);
    const nWin = countSkillBullets(kind, 'normal', 600 + 80);
    const hWin = countSkillBullets(kind, 'hell', 300 + 80);
    assert.ok(hWin.n > nWin.n, `${kind}: cùng 80 tick đầu skill, hell nhiều đạn hơn (${hWin.n} vs ${nWin.n})`);
    assert.ok(hWin.dmg > nWin.dmg, `${kind}: hell sát thương cao hơn (${hWin.dmg} vs ${nWin.dmg})`);
  }
});
