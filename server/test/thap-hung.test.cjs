'use strict';

// Kiểm thử toàn diện Miragine War cổ điển (thap_hung: 1P vs AI & 1v1 PvP):
// tài nguyên mapping.json, 16 binh chủng, đấu trường ngang 2040x800, kinh tế theo đợt 30Hz/15Hz,
// lệnh auto/select & token bucket & surrender, Game Solo/PvP/Spectator, rời trận giữa chừng,
// xử lý hết giờ (máu Pha Lê -> điểm -> hòa -1) và kết nối RoomsService / GameGateway.
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ThapWorld } = require('../dist/server/src/game/thap/world.js');
const { Game, GameError } = require('../dist/server/src/game/game.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const S = require('../dist/shared/src/index.js');

const {
  GAME_MODES,
  DEFAULT_THAP_CONFIG,
  THAP_SIM_FPS,
  THAP_NET_FPS,
  THAP_NET_DIV,
  THAP_MAX_PLAYERS,
  THAP_FIRST_ROUND_FRAMES,
  THAP_ROUND_FRAMES,
  THAP_SPAWN_INTERVAL_FRAMES,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_INCOME_LIMIT,
  THAP_MAX_POP,
  THAP_CMD_BURST,
  THAP_CMD_REFILL,
  THAP_ARENA_W,
  THAP_ARENA_H,
  THAP_LANE_Y_MIN,
  THAP_LANE_Y_MAX,
  THAP_DOORS,
  THAP_CRYSTALS,
  THAP_SPAWN_X,
  THAP_BASE,
  THAP_COLORS,
  THAP_UNIT_FIELDS,
  THAP_SHOT_FIELDS,
  THAP_DEATH_FIELDS,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  THAP_SHOT_CRYSTAL_FLAG,
  normalizeThapConfig,
  thapLayout,
  miragineDamage,
  miragineCrystalDamage,
  decodeDeathCode,
} = S;

const noHooks = { tick() {}, changed() {} };
const cfg = (over = {}) => ({ ...DEFAULT_THAP_CONFIG, ...over });
const sides = (bots = 1) => [
  { id: 'p0', name: 'Phe Đỏ', color: THAP_COLORS[0], team: 0, bot: false },
  { id: bots ? 'bot:thap0' : 'p1', name: bots ? 'Miragine AI' : 'Phe Xanh', color: THAP_COLORS[1], team: 1, bot: !!bots },
];
const world = (over = {}, hooks = noHooks, bots = 1) =>
  new ThapWorld(sides(bots), cfg({ bots, mode: bots ? 'solo' : 'pvp', ...over }), hooks);
const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
const unitsOf = (w, owner) => w.sim.units.filter((u) => u.owner === owner && u.hp > 0);
const muteCrystals = (w) => { for (const s of w.sides) s.crystalCd = 1e9; };

function thapGame(t, playerCount = 1) {
  const frames = [];
  const hooks = {
    changed() {},
    removed() {},
    fx() {},
    notify() {},
    antsFrame() {},
    linkState() {},
    twFrame() {},
    thapFrame(g, id, f) { frames.push([id, f]); },
  };
  const g = new Game('THAP', hooks, {}, 'thap_hung');
  for (let i = 0; i < playerCount; i++) g.addPlayer(`p${i}`, `Người ${i}`);
  if (t) t.after(() => g.dispose());
  return { g, frames };
}

function readyAll(g) {
  for (const p of g.players) {
    if (p.id !== g.hostId) g.setReady(p.id, true, g.rulesVersion);
  }
}

/** Tạo fixture RoomsService + GameGateway với AccountsService giả lập đầy đủ charge/refund/reward. */
function gatewayFixture(t, playerIds = ['thap_red_01', 'thap_blue_02', 'thap_spec_03', 'thap_four_04']) {
  const data = new Map(
    playerIds.map((playerId, i) => [playerId, { playerId, name: `Player ${i + 1}`, coins: 1000, games: 0, wins: 0 }]),
  );
  const ops = new Set();
  const calls = { charge: [], refund: [], rewardWinner: [], rewardPayouts: [] };
  const events = [];

  const accounts = {
    data,
    get: (id) => (data.has(id) ? structuredClone(data.get(id)) : undefined),
    info: (acc) => structuredClone(acc),
    verify: (id, token) => (token === 'valid' ? accounts.get(id) : undefined),
    async chargeGame(ids, bet, opId) {
      calls.charge.push({ ids: [...ids], bet, opId });
      if (opId) {
        if (ops.has(opId)) return;
        ops.add(opId);
      }
      for (const id of ids) {
        const acc = data.get(id);
        if (!acc) continue;
        acc.coins -= typeof bet === 'number' ? bet : (bet[id] ?? 0);
        acc.games += 1;
      }
    },
    async refundGame(ids, bet, opId, chargeOpId) {
      const applied = !(chargeOpId && !ops.has(chargeOpId)) && !(opId && ops.has(opId));
      calls.refund.push({ ids: [...ids], bet, opId, applied });
      if (!applied) return false;
      if (opId) ops.add(opId);
      for (const id of ids) {
        const acc = data.get(id);
        if (!acc) continue;
        acc.coins += typeof bet === 'number' ? bet : (bet[id] ?? 0);
        acc.games = Math.max(0, acc.games - 1);
      }
      return true;
    },
    async rewardWinner(id, pot, opId) {
      calls.rewardWinner.push({ id, pot, opId });
      if (opId) {
        if (ops.has(opId)) return true;
        ops.add(opId);
      }
      const acc = data.get(id);
      if (!acc) return false;
      acc.coins += pot;
      acc.wins += 1;
      return true;
    },
    async rewardPayouts(payouts, winnerIds, opId) {
      calls.rewardPayouts.push({ payouts: { ...payouts }, winnerIds: [...winnerIds], opId });
      if (opId) {
        if (ops.has(opId)) return true;
        ops.add(opId);
      }
      const winSet = new Set(winnerIds);
      for (const [id, amt] of Object.entries(payouts)) {
        const acc = data.get(id);
        if (!acc) continue;
        acc.coins += amt;
        if (winSet.has(id)) acc.wins += 1;
      }
      return true;
    },
  };

  const server = {
    to(room) {
      return {
        emit(event, value) { events.push({ room, event, value, volatile: false }); },
        volatile: {
          emit(event, value) { events.push({ room, event, value, volatile: true }); },
        },
      };
    },
    in() {
      return { fetchSockets: async () => [] };
    },
  };

  const rooms = new RoomsService(accounts);
  rooms.logger.error = () => {};
  rooms.bind(server);
  const gateway = new GameGateway(rooms, accounts);
  gateway.logger.error = () => {};
  gateway.server = server;

  t.after(() => {
    for (const active of rooms.rooms.values()) active.dispose();
    rooms.rooms.clear();
  });

  const makeSocket = (playerId, token = 'valid') => ({
    handshake: { auth: { playerId, name: data.get(playerId)?.name ?? playerId, token } },
    data: {},
    events: [],
    joins: [],
    disconnected: false,
    emit(event, value) { this.events.push({ event, value }); },
    join(room) { this.joins.push(room); },
    disconnect() { this.disconnected = true; },
  });

  return { accounts, calls, events, rooms, gateway, makeSocket };
}

// ---------------------------------------------------------------------------
// 0. Tài nguyên gốc database-miraginewar & 16 binh chủng Method 493
// ---------------------------------------------------------------------------

test('database-miraginewar: đầy đủ mapping.json, 16 binh chủng, 128 sprite sheet, chân dung, công trình, đạn và âm thanh', () => {
  const dbDir = path.resolve(__dirname, '../../database-miraginewar');
  assert.ok(fs.existsSync(path.join(dbDir, 'mapping.json')));
  const mapping = JSON.parse(fs.readFileSync(path.join(dbDir, 'mapping.json'), 'utf8'));
  assert.equal(mapping.units.length, 16);
  assert.equal(THAP_UNIT_KINDS.length, 16);
  for (let i = 0; i < 16; i++) {
    assert.ok(fs.existsSync(path.join(dbDir, 'portraits', `a${i}.png`)));
    assert.ok(fs.existsSync(path.join(dbDir, 'portraits', `b${i}.png`)));
    for (const side of ['A', 'B']) {
      for (const act of ['idle', 'run', 'attack', 'dead']) {
        assert.ok(fs.existsSync(path.join(dbDir, 'sheets', `${side}${i}_${act}.png`)));
      }
    }
  }
  for (const rel of [
    'structures/A_crystal.png',
    'structures/B_crystal.png',
    'structures/door.png',
    'projectiles/fireball.png',
    'projectiles/thunderball.png',
    'projectiles/storm.png',
    'terrains/terrain.jpg',
    'terrains/terrain2.jpg',
    'audio/gameLoop.mp3',
    'audio/mainLoop.mp3',
    'ui/title_bg.jpg',
    'ui/tutorial_bg.jpg',
  ]) {
    assert.ok(fs.existsSync(path.join(dbDir, rel)), `thiếu ${rel}`);
  }
});

test('16 binh chủng Miragine War & công thức sát thương Method 493 (Giáp Nhẹ / Giáp Nặng / Pha Lê)', () => {
  assert.equal(THAP_UNITS.newbie.cost, 20);
  assert.equal(THAP_UNITS.newbie.incomeBonus, 4);
  assert.equal(THAP_UNITS.highlord.cost, 1500);
  assert.equal(THAP_UNITS.highlord.pop, 7);
  assert.equal(miragineDamage('samurai', 'newbie'), 17);
  assert.equal(miragineDamage('samurai', 'zombie'), 4);
  assert.equal(miragineDamage('swordman', 'zombie'), 19);
  assert.equal(miragineCrystalDamage('highlord'), 155);
  assert.equal(miragineCrystalDamage('samurai'), 5);
});

// ---------------------------------------------------------------------------
// 1. Hình học đấu trường cổ điển 2 phe & chuẩn hóa cấu hình
// ---------------------------------------------------------------------------

test('đấu trường cổ điển 2 phe: 2040x800, Cổng [75,470]/[1965,470], Pha Lê [210,470]/[1830,470], làn y∈[310,630]', () => {
  assert.equal(THAP_MAX_PLAYERS, 2);
  assert.equal(GAME_MODES.thap_hung.minPlayers, 1);
  assert.equal(GAME_MODES.thap_hung.maxPlayers, 2);
  assert.equal(THAP_ARENA_W, 2040);
  assert.equal(THAP_ARENA_H, 800);
  assert.deepEqual(THAP_DOORS, [[75, 470], [1965, 470]]);
  assert.deepEqual(THAP_CRYSTALS, [[210, 470], [1830, 470]]);
  assert.deepEqual(THAP_SPAWN_X, [135, 1905]);
  assert.equal(THAP_LANE_Y_MIN, 310);
  assert.equal(THAP_LANE_Y_MAX, 630);

  const L = thapLayout();
  assert.deepEqual(L, {
    W: 2040,
    H: 800,
    bases: [[210, 470], [1830, 470]],
    doors: [[75, 470], [1965, 470]],
    laneYMin: 310,
    laneYMax: 630,
  });

  const w = world();
  assert.equal(w.W, 2040);
  assert.equal(w.H, 800);
  assert.deepEqual(w.baseList(), [210, 470, 1830, 470]);
  assert.deepEqual(w.doorList(), [75, 470, 1965, 470]);
  assert.equal(w.sides.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(w.sides[i].gold, THAP_START_GOLD);
    assert.equal(w.sides[i].roundIncome, THAP_START_ROUND_INCOME);
    assert.equal(w.sides[i].auto, 'newbie');
    assert.equal(w.sides[i].baseHp, THAP_BASE.hp);
    assert.equal(w.sides[i].baseMaxHp, THAP_BASE.hp);
  }
});

test('normalizeThapConfig: tự động phân solo/pvp theo số người, lọc botLevel và minutes', () => {
  assert.deepEqual(normalizeThapConfig({ bots: 99, mode: 'pvp', botLevel: 'x', minutes: 7 }, 1), {
    bots: 1,
    botLevel: 'normal',
    mode: 'solo',
    minutes: 0,
  });
  assert.deepEqual(normalizeThapConfig({ bots: 0, mode: 'solo', botLevel: 'hard', minutes: '15' }, 1), {
    bots: 1,
    botLevel: 'hard',
    mode: 'solo',
    minutes: 15,
  });
  assert.deepEqual(normalizeThapConfig({ bots: 5, mode: 'solo', botLevel: 'easy', minutes: 20 }, 2), {
    bots: 0,
    botLevel: 'easy',
    mode: 'pvp',
    minutes: 20,
  });
});

// ---------------------------------------------------------------------------
// Kinh tế 30Hz, khung hình 15Hz, trần dân số 60, chiến đấu & AI thích ứng
// ---------------------------------------------------------------------------

test('kinh tế theo đợt 30Hz (6s = 180 nhịp, 30s = 900 nhịp), xuất quân cách 4 nhịp & khung hình 15Hz', () => {
  let ticks = 0;
  const w = world({}, { tick() { ticks++; }, changed() {} }, 0);
  w.start();
  w.stop();
  assert.equal(ticks, 1, 'start() phát ngay tick-0');
  assert.equal(w.frameFor(0).tick, 0);
  assert.equal(w.frameFor(0).roundLeft, 6);

  steps(w, THAP_FIRST_ROUND_FRAMES - 1);
  assert.equal(w.sim.wave, 0);
  assert.equal(w.sides[0].gold, 0);
  assert.equal(unitsOf(w, 0).length, 0);
  assert.equal(w.frameFor(0).me.roundLeft, 1);

  // Nhịp thứ 180 (6 giây): phát +100 vàng, xuất ngay Tân Binh #1 tại Cổng trong làn [310, 630]
  w.step();
  assert.equal(w.sim.wave, 1);
  assert.equal(w.sides[0].gold, 0);
  assert.equal(w.sides[0].roundIncome, 120);
  assert.equal(unitsOf(w, 0).length, 1);
  assert.equal(w.frameFor(0).me.roundLeft, 30);
  assert.equal(w.frameFor(0).roundTotalS, 30);
  assert.deepEqual(w.frameFor(0).lastWaveUnits, [5, 5]);

  // Mỗi 4 nhịp xuất thêm 1 con cho đủ 5 Tân Binh (180, 184, 188, 192, 196)
  steps(w, THAP_SPAWN_INTERVAL_FRAMES * 4);
  assert.equal(unitsOf(w, 0).length, 5);
  assert.equal(unitsOf(w, 1).length, 5);
  for (const u of w.sim.units) {
    assert.ok(u.y >= THAP_LANE_Y_MIN && u.y <= THAP_LANE_Y_MAX);
  }

  const f0 = w.frameFor(0);
  assert.equal(f0.tick, Math.floor(w.sim.simTick / THAP_NET_DIV));
  assert.equal(THAP_NET_FPS * THAP_NET_DIV, THAP_SIM_FPS);
  assert.equal(f0.u.length % THAP_UNIT_FIELDS, 0);
  assert.equal(f0.s.length % THAP_SHOT_FIELDS, 0);
  assert.equal(f0.d.length % THAP_DEATH_FIELDS, 0);
  assert.deepEqual(
    Object.keys(f0.me).sort(),
    ['auto', 'blocked', 'gold', 'incomeLimit', 'kills', 'lost', 'pop', 'popCap', 'roundIncome', 'roundLeft', 'spawned'].sort(),
  );
  assert.equal(f0.me.incomeLimit, THAP_INCOME_LIMIT);
});

test('tích vàng qua nhiều đợt 30s & trần dân số 60 (blocked: pop)', () => {
  const w = world({}, noHooks, 0);
  w.sides[0].baseHp = w.sides[0].baseMaxHp = 1e6;
  w.sides[1].baseHp = w.sides[1].baseMaxHp = 1e6;
  assert.equal(w.command(0, { t: 'auto', kind: 'monk' }), undefined);
  steps(w, THAP_FIRST_ROUND_FRAMES); // Wave 1 (6s): 100g -> 1 Monk
  assert.equal(unitsOf(w, 0).length, 1);
  assert.equal(unitsOf(w, 0)[0].kind, 'monk');
  assert.equal(w.sides[0].roundIncome, 100 + THAP_UNITS.monk.incomeBonus);

  // Đổi sang Immortal (180g): Wave 2 (+115g) tích lũy, Wave 3 (+115g = 230g) tự xuất 1 Immortal
  assert.equal(w.command(0, { t: 'select', kind: 'immortal' }), undefined);
  steps(w, THAP_ROUND_FRAMES);
  assert.equal(w.sides[0].gold, 115);
  steps(w, THAP_ROUND_FRAMES);
  assert.equal(w.sides[0].gold, 50);
  assert.ok(unitsOf(w, 0).some((u) => u.kind === 'immortal'));

  // Kiểm tra trần dân số 60: không trừ vàng khi đầy dân số
  w.sim.units.length = 0;
  for (let i = 0; i < THAP_MAX_POP; i++) w.addUnit(0, 'newbie', 400 + (i % 6) * 20, 420 + Math.floor(i / 6) * 18);
  w.sides[0].gold = 40;
  w.sim.roundFramesLeft = 1;
  w.command(0, { t: 'select', kind: 'newbie' });
  assert.equal(w.frameFor(0).me.blocked, 'pop');
  // Kích hoạt ranh giới đợt khi vừa đủ 60 dân số
  w.sides[0].gold = 0;
  w.sides[0].roundIncome = 20;
  w.step();
  assert.equal(w.sides[0].gold, 20, 'đầy 60 dân số nên giữ lại 20 vàng');
  assert.equal(w.frameFor(0).me.blocked, 'pop');
});

test('chiến đấu, trụ Pha Lê bắn tầm 600px, vỡ Pha Lê kết thúc trận & Solo AI chạy ổn định', () => {
  const w = world({ botLevel: 'hard' }, noHooks, 1);
  // 1) Trọng Kiếm Sĩ thắng Cựu Binh (Method 493)
  muteCrystals(w);
  const hs = w.addUnit(0, 'heavysword', 980, 470);
  const vet = w.addUnit(1, 'veteran', 1040, 470);
  for (let i = 0; i < 400 && hs.hp > 0 && vet.hp > 0; i++) w.step();
  assert.ok(hs.hp > 0 && vet.hp <= 0);
  assert.equal(w.sides[0].kills, 1);
  assert.equal(w.sides[1].lost, 1);

  // 2) Pha Lê Xanh tự bắn lính trong tầm 600px kèm cờ THAP_SHOT_CRYSTAL_FLAG (mô phỏng khung hình 15Hz)
  const crystalWorld = world({}, noHooks, 0);
  crystalWorld.addUnit(0, 'newbie', THAP_CRYSTALS[1][0] - 250, 470);
  crystalWorld.stepFrame();
  const crystalFrame = crystalWorld.frameFor(0);
  assert.ok(crystalFrame.s.length >= THAP_SHOT_FIELDS);
  assert.ok((crystalFrame.s[4] & THAP_SHOT_CRYSTAL_FLAG) !== 0);

  // 3) Solo AI chạy 1200 nhịp không lỗi, tọa độ hợp lệ trong làn đường
  const aiWorld = world({ botLevel: 'hard' }, noHooks, 1);
  for (let i = 0; i < 1200 && !aiWorld.result; i++) aiWorld.step();
  assert.ok(aiWorld.sides[1].spawned > 0);
  assert.ok(aiWorld.sides[1].ai.lastEvalWave >= 1);
  for (const u of aiWorld.sim.units) {
    assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
    assert.ok(u.x >= 0 && u.x <= THAP_ARENA_W && u.y >= THAP_LANE_Y_MIN && u.y <= THAP_LANE_Y_MAX);
  }

  // 4) Vỡ Pha Lê Xanh -> reason = 'crystal', frame.d mang mã Pha Lê (owner + 1 = 2)
  aiWorld.sides[1].baseHp = 10;
  aiWorld.addUnit(0, 'highlord', THAP_CRYSTALS[1][0] - 70, 470);
  for (let i = 0; i < 60 && !aiWorld.result; i++) aiWorld.step();
  assert.equal(aiWorld.result.reason, 'crystal');
  assert.equal(aiWorld.result.winnerTeam, 0);
  assert.deepEqual(aiWorld.result.winnerIdxs, [0]);
  const endFrame = aiWorld.frameFor(0);
  assert.equal(endFrame.bh[1], 0);
  assert.equal(endFrame.al[1], 0);
  const deaths = [];
  for (let i = 0; i < endFrame.d.length; i += THAP_DEATH_FIELDS) deaths.push(decodeDeathCode(endFrame.d[i + 2]));
  assert.ok(deaths.some((d) => d.isBase && d.owner === 1));
});

// ---------------------------------------------------------------------------
// 2. Game Solo AI flow
// ---------------------------------------------------------------------------

test('Game Solo AI: tạo/đổi sang thap_hung, chỉnh botLevel/minutes, start() phát tick-0 ngay, không lộ mines/teams/auto địch', () => {
  const frames = [];
  const hookOrder = [];
  const hooks = {
    changed(g) { hookOrder.push(`changed:${g.phase}`); },
    removed() {},
    fx() {},
    notify() {},
    antsFrame() {},
    linkState() {},
    twFrame() {},
    thapFrame(g, id, f) {
      frames.push([id, f]);
      hookOrder.push(`tick:${f.tick}`);
    },
  };
  const g = new Game('SOLO', hooks);
  try {
    g.addPlayer('p0', 'Chiến Binh');
    g.addPlayer('p1', 'Khách 1');
    g.addPlayer('p2', 'Khách 2');
    assert.throws(() => g.setGameMode('p0', 'thap_hung'), /tối đa 2 người/i);
    g.removePlayer('p2');
    g.removePlayer('p1');

    g.setGameMode('p0', 'thap_hung');
    assert.equal(g.seatLimit(), THAP_MAX_PLAYERS);
    assert.throws(() => g.setThapConfig('nobody', { botLevel: 'hard' }), /chủ phòng/i);

    g.setThapConfig('p0', { botLevel: 'hard', minutes: 15 });
    assert.deepEqual(g.viewFor('p0').thap, {
      config: { bots: 1, botLevel: 'hard', mode: 'solo', minutes: 15 },
    });

    hookOrder.length = 0;
    g.start('p0');
    const w = g['thap'];
    w.stop(); // dừng vòng lặp nền ngay sau khi tick-0 đã được phát

    assert.deepEqual(hookOrder, ['changed:playing', 'tick:0'], 'state (playing) phát trước tick-0');
    assert.equal(g.phase, 'playing');
    assert.equal(g.viewFor('p0').currentPlayerId, undefined);
    assert.equal(frames.length, 1, 'tick-0 thapFrame được phát đồng bộ ngay lúc start()');
    const [frameTarget, tick0] = frames[0];
    assert.equal(frameTarget, 'p0');
    assert.equal(tick0.tick, 0);
    assert.deepEqual(tick0.bh, [100, 100]);
    assert.deepEqual(tick0.al, [1, 1]);
    assert.equal(tick0.me.gold, 0);
    assert.equal(tick0.me.roundIncome, 100);
    assert.equal(tick0.me.auto, 'newbie');
    assert.equal(tick0.me.pop, 0);
    assert.equal(tick0.me.popCap, 60);

    const v = g.viewFor('p0').thap;
    assert.equal(v.mapW, 2040);
    assert.equal(v.mapH, 800);
    assert.deepEqual(v.bases, [210, 470, 1830, 470]);
    assert.deepEqual(v.doors, [75, 470, 1965, 470]);
    assert.deepEqual(v.lane, { yMin: 310, yMax: 630 });
    assert.equal(v.myIdx, 0);
    assert.equal(v.players.length, 2);
    assert.equal(v.players[0].id, 'p0');
    assert.equal(v.players[0].bot, false);
    assert.equal(v.players[1].bot, true);
    assert.ok(v.players[1].id.startsWith('bot:thap'));
    assert.equal(v.endsAt, v.startedAt + 15 * 60_000);

    // Bảo mật thông tin: không có mines, không có teams, không lộ auto/vàng của đối thủ
    assert.equal('mines' in v, false);
    assert.equal('teams' in v, false);
    for (const p of v.players) {
      assert.equal('auto' in p, false);
      assert.equal('gold' in p, false);
    }
    w.sides[1].auto = 'highlord';
    const fAfter = w.frameFor(0);
    assert.equal(fAfter.me.auto, 'newbie');
    assert.equal('enemy' in fAfter, false);
  } finally {
    g.dispose();
  }
});

// ---------------------------------------------------------------------------
// 3. Game 1v1 PvP flow + Spectator
// ---------------------------------------------------------------------------

test('Game 1v1 PvP & Khán giả: Red (0) vs Blue (1), người thứ 3 vào ghế bị lỗi max-player, khán giả chỉ xem', (t) => {
  const { g, frames } = thapGame(t, 2);
  assert.throws(() => g.addPlayer('p2', 'Người Thứ 3'), /đủ 2 người/);
  g.addSpectator('spec', 'Khán Giả');
  assert.deepEqual(g.viewFor('p0').thap.config, { bots: 0, botLevel: 'normal', mode: 'pvp', minutes: 0 });

  readyAll(g);
  g.start('p0');
  const w = g['thap'];
  w.stop();

  const tick0ById = Object.fromEntries(frames.map(([id, f]) => [id, f]));
  assert.ok(tick0ById.p0?.me, 'Red P1 nhận khung hình riêng');
  assert.ok(tick0ById.p1?.me, 'Blue P2 nhận khung hình riêng');
  assert.equal(tick0ById.spec?.me, undefined, 'Khán giả không nhận frame.me');

  const vp0 = g.viewFor('p0').thap;
  const vp1 = g.viewFor('p1').thap;
  const vSpec = g.viewFor('spec').thap;
  assert.equal(vp0.myIdx, 0);
  assert.equal(vp1.myIdx, 1);
  assert.equal(vSpec.myIdx, undefined);
  assert.deepEqual(vSpec.bases, [210, 470, 1830, 470]);
  assert.deepEqual(vSpec.doors, [75, 470, 1965, 470]);
  assert.equal(vSpec.players.filter((p) => !p.bot).length, 2);

  g.thapCommand('p0', { t: 'auto', kind: 'mage' });
  g.thapCommand('p1', { t: 'select', kind: 'cavalry' });
  assert.equal(w.frameFor(0).me.auto, 'mage');
  assert.equal(w.frameFor(1).me.auto, 'cavalry');
  assert.equal(w.frameFor(undefined).me, undefined);

  assert.throws(() => g.thapCommand('spec', { t: 'auto', kind: 'swordman' }), /xem/);
  assert.throws(() => g.thapCommand('spec', { t: 'surrender' }), /xem/);
  assert.throws(() => g.addPlayer('p3', 'Người 4'), /đang chơi/);
  g.addSpectator('spec2', 'Khán Giả 2');
  assert.equal(g.viewFor('spec2').thap.myIdx, undefined);
});

// ---------------------------------------------------------------------------
// 4. Lệnh auto / select, token bucket spam, surrender vượt token bucket
// ---------------------------------------------------------------------------

test('lệnh auto & select, giới hạn token bucket và surrender vượt token bucket kết thúc trận ngay', (t) => {
  // Phần A: Kiểm tra nạp lại token sau 2 nhịp 30Hz (0.5 token/nhịp * 2 = 1 token)
  const w = world({}, noHooks, 0);
  for (let i = 0; i < THAP_CMD_BURST; i++) {
    assert.equal(w.command(0, { t: i % 2 === 0 ? 'auto' : 'select', kind: i % 2 === 0 ? 'swordman' : 'newbie' }), undefined);
  }
  assert.equal(w.sides[0].auto, 'newbie');
  // Hết token: lệnh bị bỏ qua không đổi auto
  assert.equal(w.command(0, { t: 'select', kind: 'highlord' }), undefined);
  assert.equal(w.sides[0].auto, 'newbie');
  steps(w, Math.ceil(THAP_SIM_FPS / THAP_CMD_REFILL)); // 2 nhịp = hồi 1 token
  assert.equal(w.command(0, { t: 'select', kind: 'highlord' }), undefined);
  assert.equal(w.sides[0].auto, 'highlord');

  // Phần B: Trong Game, spam cạn sạch token bucket rồi gửi { t: 'surrender' } vẫn kết thúc ngay!
  const { g, frames } = thapGame(t, 2);
  readyAll(g);
  g.start('p0');
  const gw = g['thap'];
  gw.stop();

  // Kiểm tra báo lỗi lệnh không hợp lệ khi còn lượt trong token bucket
  assert.throws(() => g.thapCommand('p0', { t: 'auto', kind: 'dragon' }), /không hợp lệ/);
  assert.throws(() => g.thapCommand('p0', { t: 'attack', target: 1 }), /không hợp lệ/i);

  for (let i = 0; i < THAP_CMD_BURST + 10; i++) {
    g.thapCommand('p0', { t: i % 2 === 0 ? 'auto' : 'select', kind: i % 2 === 0 ? 'samurai' : 'zombie' });
  }
  const autoBeforeSpam = gw.sides[0].auto;
  g.thapCommand('p0', { t: 'select', kind: 'highlord' });
  assert.equal(gw.sides[0].auto, autoBeforeSpam, 'lệnh thứ 41+ bị token bucket chặn');

  frames.length = 0;
  g.thapCommand('p0', { t: 'surrender' });
  assert.equal(g.phase, 'ended');
  assert.equal(gw.running, false);
  assert.equal(gw.sides[0].alive, false);
  assert.equal(gw.sides[0].baseHp, 0);
  assert.equal(gw.result.reason, 'surrender');
  assert.equal(gw.result.winnerTeam, 1);
  assert.deepEqual(gw.result.winnerIdxs, [1]);
  assert.equal(g.winner(), 'p1');
  assert.ok(frames.some(([id, f]) => id === 'p1' && f.bh[0] === 0 && f.d.length >= THAP_DEATH_FIELDS));
  assert.throws(() => g.thapCommand('p1', { t: 'select', kind: 'newbie' }), /chưa bắt đầu/i);
});

// ---------------------------------------------------------------------------
// 5. Rời trận giữa chừng (removePlayer -> eliminate) & syncThap idempotency
// ---------------------------------------------------------------------------

test('rời trận giữa chừng (removePlayer -> eliminate): sập Pha Lê, ended đồng bộ, syncThap lũy đẳng & tính payouts', (t) => {
  // Case 1: 1v1 PvP có cược — người rời thua, người ở lại thắng cả hũ, syncThap gọi lặp không nhân đôi hiệu ứng
  const { g, frames } = thapGame(t, 2);
  g.bet = 100;
  g.pot = 200;
  readyAll(g);
  g.start('p0');
  const w = g['thap'];
  w.stop();
  frames.length = 0;

  g.removePlayer('p1');
  assert.equal(g.phase, 'ended');
  assert.equal(w.running, false);
  assert.equal(w.sides[1].alive, false);
  assert.equal(w.sides[1].baseHp, 0);
  assert.equal(w.result.reason, 'surrender');
  assert.equal(w.result.winnerTeam, 0);
  assert.equal(g.winner(), 'p0');
  assert.deepEqual(g.winners(), ['p0']);
  assert.deepEqual(g.payouts, {});

  const frameAfterElim = frames.find(([id]) => id === 'p0')?.[1];
  assert.ok(frameAfterElim);
  assert.equal(frameAfterElim.bh[1], 0);
  assert.deepEqual(decodeDeathCode(frameAfterElim.d[2]), { isBase: true, owner: 1 });

  // Kiểm tra syncThap() lũy đẳng
  const snapshot = {
    logTotal: g.viewFor('p0').logTotal,
    log: [...g.viewFor('p0').log],
    framesCount: frames.length,
    winners: [...g.winners()],
    payouts: { ...g.payouts },
  };
  g['syncThap']();
  g['syncThap']();
  assert.equal(g.viewFor('p0').logTotal, snapshot.logTotal);
  assert.deepEqual(g.viewFor('p0').log, snapshot.log);
  assert.equal(frames.length, snapshot.framesCount);
  assert.deepEqual(g.winners(), snapshot.winners);
  assert.deepEqual(g.payouts, snapshot.payouts);

  // Case 2: Solo AI — ở lại đầu hàng được hoàn cược; rời phòng (left=true) không hoàn cược
  const soloStay = thapGame(t, 1);
  soloStay.g.bet = 50;
  soloStay.g.pot = 50;
  soloStay.g.start('p0');
  soloStay.g['thap'].stop();
  soloStay.g.thapCommand('p0', { t: 'surrender' });
  assert.equal(soloStay.g.phase, 'ended');
  assert.deepEqual(soloStay.g.winners(), []);
  assert.deepEqual(soloStay.g.payouts, { p0: 50 });

  const soloLeave = thapGame(t, 1);
  soloLeave.g.bet = 50;
  soloLeave.g.pot = 50;
  soloLeave.g.start('p0');
  soloLeave.g['thap'].stop();
  soloLeave.g.removePlayer('p0');
  assert.equal(soloLeave.g.phase, 'ended');
  assert.equal(soloLeave.g['thap'].sides[0].baseHp, 0);
  assert.deepEqual(soloLeave.g.winners(), []);
  assert.deepEqual(soloLeave.g.payouts, {});
});

// ---------------------------------------------------------------------------
// 6. Kết thúc hết giờ (minutes > 0): % máu Pha Lê -> điểm -> hòa -1
// ---------------------------------------------------------------------------

test('hết giờ (minutes > 0): hơn % máu Pha Lê thắng; bằng % máu xét điểm; hòa tuyệt đối trả -1 & hoàn cược', (t) => {
  // 1) Hơn % máu Pha Lê thắng (dù điểm hạ gục thấp hơn)
  const wHp = world({ minutes: 10 }, noHooks, 0);
  wHp.sides[0].baseHp = 2800;
  wHp.sides[0].killsValue = 99999;
  wHp.sides[1].baseHp = 3500;
  wHp.endsAt = wHp.startedAt + 1;
  wHp.step();
  assert.equal(wHp.result.reason, 'time');
  assert.equal(wHp.result.winnerTeam, 1);
  assert.deepEqual(wHp.result.winnerIdxs, [1]);

  // 2) Bằng % máu Pha Lê -> phân thắng bại bằng điểm cao hơn
  const wScore = world({ minutes: 10 }, noHooks, 0);
  wScore.sides[0].baseHp = 2000;
  wScore.sides[1].baseHp = 2000;
  wScore.sides[1].damageToCrystal = 1500;
  wScore.sides[1].killsValue = 600;
  wScore.endsAt = wScore.startedAt + 1;
  wScore.step();
  assert.equal(wScore.result.reason, 'time');
  assert.equal(wScore.result.winnerTeam, 1);
  assert.deepEqual(wScore.result.winnerIdxs, [1]);
  assert.ok(wScore.result.scores[1] > wScore.result.scores[0]);

  // 3) Hòa tuyệt đối (cùng % máu & cùng điểm) -> winnerTeam = -1, Game hoàn cược đều cho cả 2 người
  const { g } = thapGame(t, 2);
  g.setThapConfig('p0', { minutes: 10 });
  g.bet = 200;
  g.pot = 400;
  readyAll(g);
  g.start('p0');
  const wDraw = g['thap'];
  wDraw.stop();
  wDraw.endsAt = wDraw.startedAt + 1;
  wDraw.step();
  assert.equal(wDraw.result.reason, 'time');
  assert.equal(wDraw.result.winnerTeam, -1);
  assert.deepEqual(wDraw.result.winnerIdxs, []);
  assert.equal(wDraw.result.scores[0], wDraw.result.scores[1]);
  assert.equal(g.phase, 'ended');
  assert.equal(g.winner(), undefined);
  assert.deepEqual(g.winners(), []);
  assert.deepEqual(g.payouts, { p0: 200, p1: 200 });
});

// ---------------------------------------------------------------------------
// 7. Tích hợp RoomsService & GameGateway: thap:config / start / cmd / rematch & gỡ thap:team
// ---------------------------------------------------------------------------

test('GameGateway & RoomsService: thap:config, thap:start, thap:cmd, thap:rematch, chia thưởng & đã gỡ thap:team', async (t) => {
  const P1 = 'thap_red_01';
  const P2 = 'thap_blue_02';
  const SPEC = 'thap_spec_03';
  const P4 = 'thap_four_04';

  // Kiểm tra các SubscribeMessage của gateway và xác nhận đã gỡ hoàn toàn thap:team / setThapTeam / assignThapTeams
  const subscribed = Object.getOwnPropertyNames(GameGateway.prototype)
    .filter((k) => typeof GameGateway.prototype[k] === 'function')
    .map((k) => Reflect.getMetadata('message', GameGateway.prototype[k]))
    .filter(Boolean);
  for (const ev of ['thap:config', 'thap:start', 'thap:cmd', 'thap:rematch']) {
    assert.ok(subscribed.includes(ev), `thiếu @SubscribeMessage('${ev}')`);
  }
  assert.equal(subscribed.includes('thap:team'), false, 'đã gỡ thap:team');
  assert.equal(GameGateway.prototype.thapTeam, undefined);
  assert.equal(RoomsService.prototype.setThapTeam, undefined);
  assert.equal(Game.prototype.setThapTeam, undefined);
  assert.equal(S.assignThapTeams, undefined);

  const { accounts, calls, events, rooms, gateway, makeSocket } = gatewayFixture(t, [P1, P2, SPEC, P4]);
  const s1 = makeSocket(P1);
  const s2 = makeSocket(P2);
  const sSpec = makeSocket(SPEC);
  const s4 = makeSocket(P4);
  gateway.handleConnection(s1);
  gateway.handleConnection(s2);
  gateway.handleConnection(sSpec);
  gateway.handleConnection(s4);

  // Kiểm tra chuyển chế độ từ phòng mặc định sang thap_hung: tối đa 2 người
  await gateway.create(s1, {});
  const initRoom = rooms.roomOf(P1);
  await gateway.join(s2, { code: initRoom.code });
  await gateway.join(sSpec, { code: initRoom.code });
  assert.equal((await gateway.mode(s1, { gameMode: 'thap_hung' })).ok, false, '3 người không đổi sang thap_hung được');
  await gateway.watch(sSpec, { code: initRoom.code }); // rời ghế chuyển sang làm khán giả
  assert.equal((await gateway.mode(s1, { gameMode: 'thap_hung' })).ok, true);
  assert.equal(initRoom.seatLimit(), 2);
  assert.equal((await gateway.join(s4, { code: initRoom.code })).ok, false, 'khách thứ 3 không vào ghế 1v1 được');

  // Cấu hình phòng + đặt cược 200 xu + xác nhận luật
  assert.equal((await gateway.bet(s1, { amount: 200 })).ok, true);
  assert.equal((await gateway.thapConfig(s2, { config: { botLevel: 'hard', minutes: 10 } })).ok, false);
  assert.equal((await gateway.thapConfig(s1, { config: { botLevel: 'hard', minutes: 10 } })).ok, true);
  assert.equal((await gateway.thapConfig(s1, { botLevel: 'easy', minutes: 10 })).ok, true);
  assert.deepEqual(initRoom.thapConfig, { bots: 0, botLevel: 'easy', mode: 'pvp', minutes: 10 });
  assert.equal((await gateway.ready(s2, { ready: true, rulesVersion: initRoom.rulesVersion })).ok, true);

  // Bắt đầu qua thap:start (khách không được bắt đầu; chủ phòng bắt đầu thành công, phát tick-0 reliable)
  assert.equal((await gateway.thapStart(s2)).ok, false);
  events.length = 0;
  assert.equal((await gateway.thapStart(s1)).ok, true);
  initRoom['thap'].stop();

  assert.equal(initRoom.phase, 'playing');
  assert.equal(initRoom.pot, 400);
  assert.equal(accounts.get(P1).coins, 800);
  assert.equal(accounts.get(P2).coins, 800);

  const tick0Events = events.filter((e) => e.event === 'thap:frame' && e.value.tick === 0);
  const firstStatePlayingIdx = events.findIndex((e) => e.event === 'state' && e.value?.phase === 'playing');
  const firstTick0Idx = events.findIndex((e) => e.event === 'thap:frame' && e.value.tick === 0);
  assert.ok(firstStatePlayingIdx >= 0 && firstTick0Idx > firstStatePlayingIdx, 'state (playing) tới trước thap:frame tick-0');
  assert.equal(tick0Events.length, 3);
  assert.ok(tick0Events.every((e) => e.volatile === false), 'tick-0 gửi reliable không dùng volatile');
  assert.ok(tick0Events.find((e) => e.room === `p:${P1}`).value.me);
  assert.ok(tick0Events.find((e) => e.room === `p:${P2}`).value.me);
  assert.equal(tick0Events.find((e) => e.room === `p:${SPEC}`).value.me, undefined);

  // Nhịp tiếp theo (tick >= 1) gửi qua volatile; tick-0 đã gửi reliable
  initRoom['thap'].stepFrame();
  assert.ok(events.some((e) => e.event === 'thap:frame' && e.value.tick === 1 && e.volatile === true));

  // thap:cmd hỗ trợ cả 2 dạng payload ({ t, kind } và { cmd: { t, kind } }); khán giả & rematch sớm bị từ chối
  assert.equal((await gateway.thapCmd(s1, { t: 'auto', kind: 'samurai' })).ok, true);
  assert.equal((await gateway.thapCmd(s2, { cmd: { t: 'select', kind: 'swordman' } })).ok, true);
  assert.equal(initRoom['thap'].sides[0].auto, 'samurai');
  assert.equal(initRoom['thap'].sides[1].auto, 'swordman');
  assert.equal((await gateway.thapCmd(sSpec, { t: 'auto', kind: 'newbie' })).ok, false);
  assert.equal((await gateway.thapCmd(s1, null)).ok, false);
  assert.equal((await gateway.thapRematch(s1)).ok, false, 'ván chưa kết thúc chưa rematch được');

  // Đầu hàng qua thap:cmd -> kết thúc trận, chia hũ, thap:rematch đưa về phòng chờ sạch sẽ
  assert.equal((await gateway.thapCmd(s2, { t: 'surrender' })).ok, true);
  assert.equal(initRoom.phase, 'ended');
  assert.equal(initRoom.winner(), P1);
  assert.equal((await gateway.thapRematch(s2)).ok, false, 'chỉ chủ phòng mới bấm rematch');
  assert.equal((await gateway.thapRematch(s1)).ok, true);

  assert.equal(initRoom.phase, 'lobby');
  assert.equal(initRoom.pot, 0);
  assert.equal(initRoom['thap'], undefined);
  assert.equal(initRoom.viewFor(P1).thap.result, undefined);
  assert.equal(accounts.get(P1).coins, 1200);
  assert.equal(accounts.get(P1).wins, 1);
  assert.equal(accounts.get(P2).coins, 800);
  assert.equal(accounts.get(P2).wins, 0);
  assert.equal(calls.rewardWinner.length, 1);

  // Ván 2: hết giờ hòa tuyệt đối (-1) -> hoàn lại tiền cược qua rewardPayouts và rematch sạch về phòng chờ
  assert.equal((await gateway.bet(s1, { amount: 100 })).ok, true);
  assert.equal((await gateway.thapConfig(s1, { config: { minutes: 10 } })).ok, true);
  assert.equal((await gateway.ready(s2, { ready: true, rulesVersion: initRoom.rulesVersion })).ok, true);
  assert.equal((await gateway.thapStart(s1)).ok, true);
  const w2 = initRoom['thap'];
  w2.stop();
  assert.equal(accounts.get(P1).coins, 1100);
  assert.equal(accounts.get(P2).coins, 700);
  w2.endsAt = w2.startedAt + 1;
  w2.step();

  assert.equal(initRoom.phase, 'ended');
  // Khán giả vào muộn lúc ended vẫn nhận được 1 khung hình full: true sau state.
  events.length = 0;
  assert.equal((await gateway.watch(sSpec, { code: initRoom.code })).ok, true);
  const lateSpecFrame = events.find((e) => e.room === `p:${SPEC}` && e.event === 'thap:frame');
  assert.ok(lateSpecFrame?.value?.full, 'khán giả vào xem khi trận vừa ended nhận snapshot full: true');
  assert.equal(lateSpecFrame.value.me, undefined);
  assert.equal((await gateway.thapRematch(s1)).ok, true);
  assert.equal(initRoom.phase, 'lobby');
  assert.equal(accounts.get(P1).coins, 1200);
  assert.equal(accounts.get(P2).coins, 800);
  assert.equal(accounts.get(P1).wins, 1);
  assert.equal(accounts.get(P2).wins, 0);
  assert.equal(calls.rewardPayouts.length, 1);

  // Ván 3: người chơi rời phòng giữa trận qua gateway.leave -> người ở lại thắng hũ, rematch dọn người rời & tự về Solo AI
  assert.equal((await gateway.ready(s2, { ready: true, rulesVersion: initRoom.rulesVersion })).ok, true);
  assert.equal((await gateway.thapStart(s1)).ok, true);
  initRoom['thap'].stop();
  assert.equal((await gateway.leave(s2)).ok, true);
  assert.equal(initRoom.phase, 'ended');
  assert.equal(initRoom.winner(), P1);
  assert.equal((await gateway.thapRematch(s1)).ok, true);
  assert.equal(initRoom.phase, 'lobby');
  assert.equal(initRoom.players.length, 1);
  assert.equal(initRoom.viewFor(P1).thap.config.mode, 'solo');
  assert.equal(accounts.get(P1).coins, 1300);
  assert.equal(accounts.get(P1).wins, 2);
});
