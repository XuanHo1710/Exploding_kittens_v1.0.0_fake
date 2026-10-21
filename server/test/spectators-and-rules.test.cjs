'use strict';

// Khán giả, đổi chỗ ngẫu nhiên mỗi ván, Trộm Mộ và luật mặc định theo sách luật chính thức.
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, GameError } = require('../dist/server/src/game/game.js');
const {
  DEFAULT_ROOM_RULES, RULE_PRESETS, MAX_SPECTATORS, detectPlayKind, comboGroupFor, roomDeckSummary,
} = require('../dist/shared/src/index.js');

const A = 'player_aaa1';
const B = 'player_bbb2';
const C = 'player_ccc3';
const W = 'watcher_www1';

function room(t, ids = [A, B, C]) {
  const removed = [];
  const game = new Game('SPEC', { changed() {}, removed(id) { removed.push(id); }, fx() {}, notify() {} }, { firstPlayer: 'host', turnSeconds: 30, nopeSeconds: 3 }, 'exploding_kittens');
  ids.forEach((id, i) => game.addPlayer(id, `P${i}`));
  t.after(() => game.dispose());
  return { game, removed };
}

function start(game) {
  for (const p of game.players) if (p.id !== game.hostId) game.setReady(p.id, true, game.rulesVersion);
  game.start(game.hostId);
}

/** Đặt sẵn bài và thứ tự chỗ ngồi A, B, C; lượt của A */
function table(game, hands, deck) {
  game.players.sort((a, b) => [A, B, C].indexOf(a.id) - [A, B, C].indexOf(b.id));
  game.pending = undefined;
  game.waiting = undefined;
  game.lastPlay = undefined;
  game.currentIdx = 0;
  game.turnsRemaining = 1;
  for (const p of game.players) {
    p.alive = true;
    p.hand = (hands[p.id] ?? []).map((type, i) => ({ id: `${p.id}-${type}-${i}`, type }));
  }
  game.deck = deck.map((type, i) => ({ id: `deck-${type}-${i}`, type }));
  game.discard = [];
}
const resolve = (game) => {
  game.pending.deadline = 0;
  game.onTimer();
};

// ---------- luật theo sách luật ----------

test('luật mặc định theo sách luật: Tấn Công cộng dồn, đôi/ba dùng mọi lá cùng tên, số Mèo Nổ = số người − 1', () => {
  assert.equal(DEFAULT_ROOM_RULES.attackMode, 'stack');
  assert.equal(DEFAULT_ROOM_RULES.comboScope, 'any');
  assert.equal(DEFAULT_ROOM_RULES.bombMode, 'players_minus_one');
  assert.equal(DEFAULT_ROOM_RULES.handSize, 7);
  assert.equal(DEFAULT_ROOM_RULES.defusesPerPlayer, 1);
  assert.equal(detectPlayKind(['skip', 'skip'], DEFAULT_ROOM_RULES), 'pair');
});

test('bộ Bản gốc: đúng 56 lá (46 lá thường + 4 Mèo Nổ + 6 Gỡ Bom) với 5 người', () => {
  const legacy = RULE_PRESETS.find((p) => p.id === 'legacy').rules;
  assert.equal(legacy.maxPlayers, 5);
  const five = roomDeckSummary(legacy, 5);
  assert.equal(five.normalCards, 46);
  assert.equal(five.bombs, 4);
  assert.ok(five.canStart);
  for (let n = 2; n <= 5; n++) assert.ok(roomDeckSummary(legacy, n).canStart, `${n} người`);
  for (const preset of RULE_PRESETS) assert.ok(roomDeckSummary(preset.rules, 2).canStart, preset.id);
});

test('Mèo Hoang chỉ thay lá mèo, không ghép với lá chức năng kể cả khi phòng cho đôi mọi loại bài', () => {
  const rules = { ...DEFAULT_ROOM_RULES, comboScope: 'any' };
  assert.equal(detectPlayKind(['feral_cat', 'skip'], rules), null);
  assert.equal(detectPlayKind(['feral_cat', 'cat_melon'], rules), 'pair');
  const hand = [{ id: '1', type: 'feral_cat' }, { id: '2', type: 'skip' }, { id: '3', type: 'cat_melon' }];
  assert.deepEqual(comboGroupFor(hand, 'skip', rules).map((c) => c.id), ['2']);
  assert.deepEqual(comboGroupFor(hand, 'feral_cat', rules).map((c) => c.id).sort(), ['1', '3']);
});

// ---------- đổi chỗ ngẫu nhiên ----------

test('Mèo Nổ: mỗi ván xếp lại chỗ ngồi ngẫu nhiên', (t) => {
  const { game } = room(t);
  const orders = new Set();
  for (let i = 0; i < 30; i++) {
    game.phase = 'lobby';
    start(game);
    assert.deepEqual(game.players.map((p) => p.id).sort(), [A, B, C].sort(), 'vẫn đủ người');
    assert.equal(game.current().id, game.hostId, 'chủ phòng vẫn đi trước khi phòng chọn như vậy');
    orders.add(game.players.map((p) => p.id).join());
  }
  assert.ok(orders.size > 1, 'thứ tự chỗ ngồi thay đổi giữa các ván');
  assert.match(game.viewFor(A).log.join('\n'), /Đổi chỗ ngẫu nhiên/);
});

// ---------- Trộm Mộ ----------

test('Trộm Mộ: chưa ai chết thì không đánh được (không mất lá)', (t) => {
  const { game } = room(t);
  start(game);
  table(game, { [A]: ['grave_robber'], [B]: ['skip'], [C]: ['skip'] }, ['cat_melon']);
  assert.throws(() => game.play(A, { cardIds: [`${A}-grave_robber-0`] }), /Chưa có ai chết/);
  assert.equal(game.player(A).hand.length, 1);
  assert.equal(game.pending, undefined);
});

test('Trộm Mộ: người chết đang online tự chọn; người chết mất kết nối được chọn ngẫu nhiên ngay', (t) => {
  const { game } = room(t);
  start(game);
  table(game, { [A]: ['grave_robber'], [B]: ['skip', 'favor'], [C]: ['shuffle', 'nope'] }, ['cat_melon']);
  game.player(B).alive = false;
  game.player(C).alive = false;
  game.setConnected(C, false);
  game.play(A, { cardIds: [`${A}-grave_robber-0`] });
  resolve(game);
  assert.equal(game.waiting?.kind, 'return_card');
  assert.deepEqual(game.waiting.pendingIds, [B], 'C mất kết nối đã được chọn ngẫu nhiên');
  assert.equal(game.player(C).hand.length, 1);
  game.returnCard(B, `${B}-favor-1`);
  assert.equal(game.waiting, undefined);
  assert.deepEqual(game.player(B).hand.map((c) => c.type), ['skip']);
  assert.equal(game.deck.length, 3);
  assert.ok(game.deck.some((c) => c.id === `${B}-favor-1`));
});

test('Trộm Mộ: người chết rời phòng khi đang phải chọn → chọn ngẫu nhiên, không bắt cả bàn chờ', (t) => {
  const { game } = room(t);
  start(game);
  table(game, { [A]: ['grave_robber'], [B]: ['skip'], [C]: ['shuffle', 'nope'] }, ['cat_melon']);
  game.player(C).alive = false;
  game.play(A, { cardIds: [`${A}-grave_robber-0`] });
  resolve(game);
  assert.deepEqual(game.waiting.pendingIds, [C]);
  game.removePlayer(C);
  assert.equal(game.waiting, undefined);
  assert.equal(game.player(C).hand.length, 1);
  assert.equal(game.deck.length, 2);
  assert.equal(game.current().id, A, 'vẫn là lượt A');
});

// ---------- khán giả ----------

test('khán giả: tối đa 15 người, không có bài, không chơi được, không tính là người chơi', (t) => {
  const { game } = room(t);
  for (let i = 0; i < MAX_SPECTATORS; i++) game.addSpectator(`watcher_${i}xx`, `W${i}`);
  assert.equal(MAX_SPECTATORS, 15);
  assert.throws(() => game.addSpectator('watcher_full', 'Full'), /15 khán giả/);
  assert.equal(game.players.length, 3);
  start(game);
  const view = game.viewFor('watcher_0xx');
  assert.equal(view.spectators.length, 15);
  assert.deepEqual(view.hand, []);
  assert.equal(view.players.length, 3);
  assert.throws(() => game.draw('watcher_0xx'), /đang xem/);
  assert.throws(() => game.play('watcher_0xx', { cardIds: ['x'] }), /đang xem/);
  // không lộ bài riêng của ai cho khán giả
  assert.ok(view.players.every((p) => !('hand' in p)));
});

test('khán giả: vào bàn khi ở phòng chờ, không vào được khi ván đang chơi; người chơi chuyển sang xem', (t) => {
  const { game } = room(t, [A, B]);
  game.addSpectator(W, 'Watcher');
  game.addPlayer(W, 'Watcher');
  assert.deepEqual(game.players.map((p) => p.id), [A, B, W]);
  assert.equal(game.spectators.length, 0);
  game.addSpectator(A, 'P0'); // chủ phòng chuyển sang xem → quyền chủ phòng chuyển cho người khác
  assert.deepEqual(game.players.map((p) => p.id), [B, W]);
  assert.equal(game.hostId, B);
  start(game);
  assert.throws(() => game.addPlayer(A, 'P0'), /đợi ván sau/);
  assert.throws(() => game.addSpectator(B, 'P1'), /đang chơi/);
});

test('khán giả: rời phòng, bị chủ phòng mời ra; người chơi duy nhất không chuyển sang xem được', (t) => {
  const { game, removed } = room(t, [A, B]);
  game.addSpectator(W, 'Watcher');
  game.addSpectator('watcher_two', 'Two');
  game.kickPlayer(A, W);
  assert.deepEqual(removed, [W]);
  game.removePlayer('watcher_two');
  assert.equal(game.spectators.length, 0);
  game.addSpectator(A, 'P0');
  assert.throws(() => game.addSpectator(B, 'P1'), /duy nhất/);
  assert.deepEqual(game.players.map((p) => p.id), [B]);
});
