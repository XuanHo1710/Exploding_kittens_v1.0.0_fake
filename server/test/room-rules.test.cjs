require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, GameError } = require('../dist/server/src/game/game.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { DEFAULT_ROOM_RULES } = require('../dist/shared/src/index.js');

const HOST = 'player_001';
const PEER = 'player_002';
const THIRD = 'player_003';
const card = (type, id = type) => ({ type, id });
const counts = (overrides = {}) => Object.assign(Object.fromEntries(Object.keys(DEFAULT_ROOM_RULES.cardCounts).map((type) => [type, 0])), overrides);

function gameFixture(t, rules = {}) {
  const notices = [];
  const game = new Game('TEST', {
    changed() {}, removed() {}, fx() {},
    notify(playerId, value) { notices.push({ playerId, ...value }); },
  }, { firstPlayer: 'host', ...rules });
  game.addPlayer(HOST, 'Host');
  game.addPlayer(PEER, 'Peer');
  t.after(() => game.dispose());
  return { game, notices };
}

function start(game) {
  for (const p of game.players) if (p.id !== game.hostId) game.setReady(p.id, true, game.rulesVersion);
  const order = game.players.map((p) => p.id);
  game.start(HOST);
  keepSeats(game, order);
}

/** Mèo Nổ đổi chỗ ngẫu nhiên mỗi ván: test đưa chỗ ngồi về thứ tự vào phòng cho dễ kiểm tra */
function keepSeats(game, order) {
  const cur = game.players[game.currentIdx]?.id;
  game.players.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (cur) game.currentIdx = game.players.findIndex((p) => p.id === cur);
}


function roomsFixture(t) {
  const calls = [];
  const accounts = {
    get(id) { return { playerId: id, coins: 1000 }; },
    info(value) { return value; },
    verify() { return undefined; },
    async chargeGame(ids, amount) { calls.push({ ids, amount }); },
    async refundGame() {},
    async rewardWinner() { return true; },
  };
  const rooms = new RoomsService(accounts);
  const server = { to() { return { emit() {} }; } };
  rooms.bind(server);
  rooms.create(HOST, 'Host');
  const game = rooms.roomOf(HOST);
  rooms.join(game.code, PEER, 'Peer');
  rooms.setVerified(HOST, true);
  rooms.setVerified(PEER, true);
  rooms.setBet(HOST, 100);
  t.after(() => { for (const room of rooms.rooms.values()) room.dispose(); });
  return { rooms, game, calls, accounts, server };
}

test('custom deck quantities, hand sizes, defuses, bomb counts and first player are applied', (t) => {
  const { game } = gameFixture(t, {
    cardCounts: counts({ attack: 6, skip: 4 }), handSize: 2,
    defusesPerPlayer: 2, extraDefuses: 3, bombMode: 'fixed', fixedBombs: 3,
    turnSeconds: 15,
  });
  const before = Date.now();
  start(game);
  const view = game.viewFor(HOST);
  assert.equal(view.currentPlayerId, HOST);
  assert.equal(view.hand.length, 4);
  assert.equal(view.hand.filter((c) => c.type === 'defuse').length, 2);
  assert.equal(game.deck.length, 12);
  const all = [...game.deck, ...game.players.flatMap((p) => p.hand)];
  for (const [type, expected] of Object.entries({ attack: 6, skip: 4, defuse: 7, exploding: 3 })) {
    assert.equal(all.filter((c) => c.type === type).length, expected);
  }
  assert.ok(all.every((c) => ['attack', 'skip', 'defuse', 'exploding'].includes(c.type)));
  assert.ok(view.turnDeadline >= before + 15_000 && view.turnDeadline <= Date.now() + 15_000);
  assert.throws(() => game.setRules(HOST, { turnSeconds: 30 }), GameError);
  assert.throws(() => game.setReady(PEER, false, game.rulesVersion), GameError);
  const copy = game.rules;
  copy.cardCounts.attack = 99;
  copy.turnSeconds = 100;
  assert.equal(game.rules.cardCounts.attack, 6);
  assert.equal(game.rules.turnSeconds, 15);
});

test('only the host can edit and every rule or bet change invalidates the prior agreement', (t) => {
  const { game } = gameFixture(t);
  assert.equal(game.viewFor(PEER).players.find((p) => p.id === HOST).ready, true);
  assert.throws(() => game.start(HOST), /xác nhận/);
  assert.throws(() => game.setRules(PEER, { turnSeconds: 30 }), GameError);
  assert.throws(() => game.setBet(PEER, 100), GameError);
  game.setReady(PEER, true, game.rulesVersion);
  const originalVersion = game.rulesVersion;
  game.setRules(HOST, { turnSeconds: 30 });
  assert.equal(game.rulesVersion, originalVersion + 1);
  assert.equal(game.viewFor(PEER).players.find((p) => p.id === PEER).ready, false);
  assert.throws(() => game.setReady(PEER, true, originalVersion), GameError);
  game.setReady(PEER, true, game.rulesVersion);
  game.setBet(HOST, 100);
  assert.throws(() => game.start(HOST), /xác nhận/);
  assert.throws(() => game.setRules(HOST, { maxPlayers: 1 }), GameError);
  game.addPlayer(THIRD, 'Third');
  assert.throws(() => game.setRules(HOST, { maxPlayers: 2 }), /Số chỗ/);
});

test('room capacity follows the custom limit and rooms have independent rules', (t) => {
  const { game } = gameFixture(t, { maxPlayers: 2, futureCount: 5 });
  assert.throws(() => game.addPlayer(THIRD, 'Third'), GameError);
  const other = gameFixture(t).game;
  game.setRules(HOST, { maxPlayers: 2, futureCount: 1 });
  assert.equal(other.rules.futureCount, DEFAULT_ROOM_RULES.futureCount);
  assert.equal(other.rulesVersion, 1);
});

test('a disconnected host cannot start a host-first game without a seat', (t) => {
  const { game } = gameFixture(t);
  game.addPlayer(THIRD, 'Third');
  game.setReady(PEER, true, game.rulesVersion);
  game.setReady(THIRD, true, game.rulesVersion);
  game.players[0].connected = false;
  assert.throws(() => game.start(HOST), /kết nối lại/);
  assert.equal(game.phase, 'lobby');
});

test('stacking retains the final attacked turn and replace mode gives exactly two turns', (t) => {
  for (const [attackMode, expected] of [['stack', 3], ['replace', 2]]) {
    const { game } = gameFixture(t, { attackMode });
    start(game);
    game.players[0].hand = [card('attack', 'first-attack')];
    game.players[1].hand = [card('skip'), card('attack', 'second-attack')];
    game.play(HOST, { cardIds: ['first-attack'] });
    game.resolvePending();
    assert.equal(game.viewFor(PEER).turnsRemaining, 2);
    game.play(PEER, { cardIds: ['skip'] });
    game.resolvePending();
    assert.equal(game.viewFor(PEER).turnsRemaining, 1);
    game.play(PEER, { cardIds: ['second-attack'] });
    game.resolvePending();
    assert.equal(game.viewFor(HOST).turnsRemaining, expected);
    assert.equal(game.viewFor(HOST).currentPlayerId, HOST);
  }
});

test('pair scope and combo switches are enforced by the engine before discarding cards', (t) => {
  const { game } = gameFixture(t, { comboScope: 'any', allowPair: true });
  start(game);
  game.players[0].hand = [card('skip', 'skip-1'), card('skip', 'skip-2')];
  game.players[1].hand = [card('defuse')];
  game.play(HOST, { cardIds: ['skip-1', 'skip-2'], targetId: PEER });
  game.resolvePending();
  assert.deepEqual(game.viewFor(HOST).hand.map((c) => c.type), ['defuse']);
  for (const rules of [{ comboScope: 'cats' }, { comboScope: 'any', allowPair: false }]) {
    const denied = gameFixture(t, rules).game;
    start(denied);
    denied.players[0].hand = [card('skip', 'a'), card('skip', 'b')];
    assert.throws(() => denied.play(HOST, { cardIds: ['a', 'b'], targetId: PEER }), GameError);
    assert.equal(denied.players[0].hand.length, 2);
    assert.equal(denied.discard.length, 0);
  }
});

test('nopeChain false rejects counter-Nope without spending the card; true restores the action', (t) => {
  for (const nopeChain of [false, true]) {
    const { game } = gameFixture(t, { nopeChain, nopeSeconds: 2 });
    start(game);
    game.players[0].hand = [card('attack'), card('nope', 'counter')];
    game.players[1].hand = [card('nope', 'block')];
    game.play(HOST, { cardIds: ['attack'] });
    const before = Date.now();
    game.play(PEER, { cardIds: ['block'] });
    assert.ok(game.pending.deadline >= before + 2000 && game.pending.deadline <= Date.now() + 2000);
    if (nopeChain) game.play(HOST, { cardIds: ['counter'] });
    else {
      assert.throws(() => game.play(HOST, { cardIds: ['counter'] }), GameError);
      assert.equal(game.players[0].hand.length, 1);
    }
    game.resolvePending();
    assert.equal(game.viewFor(HOST).currentPlayerId, nopeChain ? PEER : HOST);
  }
});

test('a five-card combo retrieves the original discard even when it spends the same type', (t) => {
  const { game, notices } = gameFixture(t, { allowFive: true });
  start(game);
  game.discard = [card('skip', 'original-discard')];
  game.players[0].hand = ['skip', 'attack', 'favor', 'shuffle', 'see_future'].map((type) => card(type, `spent-${type}`));
  game.play(HOST, { cardIds: game.players[0].hand.map((c) => c.id), discardType: 'skip' });
  game.resolvePending();
  assert.deepEqual(game.viewFor(HOST).hand, [card('skip', 'original-discard')]);
  assert.equal(game.discard.some((c) => c.id === 'original-discard'), false);
  assert.equal(game.discard.some((c) => c.id === 'spent-skip'), true);
  assert.deepEqual(notices.find((n) => n.kind === 'received').cardIds, ['original-discard']);
});

test('See Future uses the custom count and Favor uses the prompt duration', (t) => {
  const { game, notices } = gameFixture(t, { futureCount: 5, promptSeconds: 10 });
  start(game);
  game.players[0].hand = [card('see_future'), card('favor')];
  game.deck = ['attack', 'skip', 'defuse', 'exploding', 'nope', 'shuffle'].map((type, i) => card(type, `deck-${i}`));
  game.play(HOST, { cardIds: ['see_future'] });
  game.resolvePending();
  assert.deepEqual(notices.find((n) => n.kind === 'future').cards, ['attack', 'skip', 'defuse', 'exploding', 'nope']);
  game.play(HOST, { cardIds: ['favor'], targetId: PEER });
  const before = Date.now();
  game.resolvePending();
  assert.equal(game.waiting.kind, 'favor_give');
  assert.ok(game.waiting.deadline >= before + 10_000 && game.waiting.deadline <= Date.now() + 10_000);
});

test('random bomb placement reinserts automatically; choose placement waits for the owner', (t) => {
  for (const bombPlacement of ['random', 'choose']) {
    const { game } = gameFixture(t, { bombPlacement, promptSeconds: 10 });
    start(game);
    game.players[0].hand = [card('defuse')];
    game.deck = [card('exploding'), card('skip')];
    const before = Date.now();
    game.draw(HOST);
    if (bombPlacement === 'choose') {
      assert.equal(game.waiting.kind, 'defuse_place');
      assert.ok(game.waiting.deadline >= before + 10_000 && game.waiting.deadline <= Date.now() + 10_000);
      assert.throws(() => game.placeBomb(PEER, 0), GameError);
      game.placeBomb(HOST, 0);
      assert.equal(game.deck[0].type, 'exploding');
    }
    assert.equal(game.waiting, undefined);
    assert.equal(game.deck.length, 2);
    assert.equal(game.deck.filter((c) => c.type === 'exploding').length, 1);
    assert.equal(game.viewFor(HOST).currentPlayerId, PEER);
    assert.equal(game.players[0].hand.length, 0);
  }
});

test('restarting retains the room rules but requires agreement again', (t) => {
  const { game } = gameFixture(t, { handSize: 3, attackMode: 'replace', defusesPerPlayer: 0 });
  start(game);
  const rules = game.rules;
  const version = game.rulesVersion;
  game.deck = [card('exploding')];
  game.draw(HOST);
  assert.equal(game.phase, 'ended');
  game.restart(HOST);
  assert.deepEqual(game.rules, rules);
  assert.equal(game.rulesVersion, version);
  assert.equal(game.viewFor(PEER).players.find((p) => p.id === PEER).ready, false);
  assert.throws(() => game.start(HOST), /xác nhận/);
});

test('unconfirmed and impossible decks are rejected before charging coins', async (t) => {
  const { rooms, game, calls } = roomsFixture(t);
  await assert.rejects(rooms.startGame(HOST), /xác nhận/);
  rooms.setRules(HOST, { cardCounts: counts(), handSize: 7 });
  rooms.setReady(PEER, true, game.rulesVersion);
  await assert.rejects(rooms.startGame(HOST), GameError);
  assert.equal(calls.length, 0);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.pot, 0);
  assert.ok(game.players.every((p) => p.hand.length === 0));
  rooms.setRules(HOST, { bombMode: 'fixed', fixedBombs: 1 });
  rooms.join(game.code, THIRD, 'Third');
  rooms.setReady(PEER, true, game.rulesVersion);
  rooms.setReady(THIRD, true, game.rulesVersion);
  await assert.rejects(rooms.startGame(HOST), GameError);
  assert.equal(calls.length, 0);
});

test('invalid creation leaves the current room intact', (t) => {
  const { rooms, game } = roomsFixture(t);
  assert.throws(() => rooms.create(HOST, 'Host', undefined, { handSize: '7' }), GameError);
  assert.throws(() => rooms.create(HOST, 'Host', undefined, { cardCounts: counts() }), GameError);
  assert.equal(rooms.roomOf(HOST), game);
  assert.equal(game.hostId, HOST);
  assert.equal(rooms.rooms.size, 1);
});

test('lobby rules and readiness cannot change while the account charge is pending', async (t) => {
  const { rooms, game, accounts } = roomsFixture(t);
  let release;
  accounts.chargeGame = () => new Promise((resolve) => { release = resolve; });
  rooms.setReady(PEER, true, game.rulesVersion);
  const starting = rooms.startGame(HOST);
  assert.throws(() => rooms.setRules(HOST, { turnSeconds: 30 }), GameError);
  assert.throws(() => rooms.setReady(PEER, false, game.rulesVersion), GameError);
  assert.throws(() => rooms.setBet(HOST, 50), GameError);
  release();
  await starting;
  assert.equal(game.phase, 'playing');
});

test('gateway rejects malformed rules and acknowledgement payloads', async (t) => {
  const { rooms, game, accounts } = roomsFixture(t);
  accounts.get = () => undefined;
  const gateway = new GameGateway(rooms, accounts);
  const client = { data: { playerId: HOST, name: 'Host' }, emit() {} };
  for (const body of [null, [], { extra: true }, { rules: { futureCount: 99 } }]) {
    assert.equal((await gateway.rules(client, body)).ok, false);
  }
  for (const body of [null, { ready: 'yes', rulesVersion: 1 }, { ready: true, rulesVersion: '1' }, { ready: true, rulesVersion: 1, extra: true }]) {
    assert.equal((await gateway.ready(client, body)).ok, false);
  }
  assert.equal((await gateway.create(client, { rules: {}, extra: true })).ok, false);
  assert.equal(rooms.roomOf(HOST), game);
  assert.equal(game.rulesVersion, 2);
});

test('draw_bottom ends a turn by drawing the bottom card of the deck instead of the top card', (t) => {
  const { game } = gameFixture(t);
  start(game);
  game.players[0].hand = [card('draw_bottom', 'db-1')];
  game.deck = [card('exploding', 'top-bomb'), card('skip', 'middle-skip'), card('favor', 'bottom-favor')];
  game.play(HOST, { cardIds: ['db-1'] });
  assert.equal(game.pending.kind, 'draw_bottom');
  game.resolvePending();
  assert.deepEqual(game.viewFor(HOST).hand.map((c) => c.id), ['bottom-favor']);
  assert.deepEqual(game.deck.map((c) => c.id), ['top-bomb', 'middle-skip']);
  assert.equal(game.viewFor(HOST).currentPlayerId, PEER);
});

test('catomic_bomb brings all exploding kittens to the top of the deck and ends the turn without drawing', (t) => {
  const { game } = gameFixture(t);
  start(game);
  game.players[0].hand = [card('catomic_bomb', 'cmb-1')];
  game.deck = [card('skip', 's1'), card('exploding', 'b1'), card('favor', 'f1'), card('exploding', 'b2')];
  game.play(HOST, { cardIds: ['cmb-1'] });
  assert.equal(game.pending.kind, 'catomic_bomb');
  game.resolvePending();
  assert.equal(game.deck[0].type, 'exploding');
  assert.equal(game.deck[1].type, 'exploding');
  assert.equal(game.deck.length, 4);
  assert.equal(game.viewFor(HOST).currentPlayerId, PEER);
});

test('special cards (targeted_attack, personal_attack, super_skip, reverse, swap_top_bottom, grave_robber, feral_cat) execute their dedicated mechanics', (t) => {
  const { game } = gameFixture(t);
  game.addPlayer(THIRD, 'Third');
  game.setReady(PEER, true, game.rulesVersion);
  game.setReady(THIRD, true, game.rulesVersion);
  game.start(HOST);
  keepSeats(game, [HOST, PEER, THIRD]);

  // targeted_attack targets THIRD directly
  game.players[0].hand = [card('targeted_attack', 'tat-1')];
  game.play(HOST, { cardIds: ['tat-1'], targetId: THIRD });
  game.resolvePending();
  assert.equal(game.viewFor(HOST).currentPlayerId, THIRD);
  assert.equal(game.viewFor(HOST).turnsRemaining, 2);

  // super_skip ends all 2 turns at once for THIRD
  game.players[2].hand = [card('super_skip', 'ssk-1')];
  game.play(THIRD, { cardIds: ['ssk-1'] }); // luật nhà: không chờ Nope, có hiệu lực ngay
  assert.equal(game.pending, undefined);
  assert.equal(game.viewFor(HOST).currentPlayerId, HOST);
  assert.equal(game.viewFor(HOST).turnsRemaining, 1);

  // reverse flips turn order (HOST -> THIRD instead of PEER)
  game.players[0].hand = [card('reverse', 'rev-1')];
  game.play(HOST, { cardIds: ['rev-1'] });
  game.resolvePending();
  assert.equal(game.viewFor(HOST).currentPlayerId, THIRD);

  // feral_cat pairs with any cat card to steal a card
  game.players[2].hand = [card('feral_cat', 'fer-1'), card('cat_potato', 'cat-1')];
  game.players[1].hand = [card('skip', 'stolen-skip')];
  game.play(THIRD, { cardIds: ['fer-1', 'cat-1'], targetId: PEER });
  assert.equal(game.pending.kind, 'pair');
  game.resolvePending();
  assert.ok(game.players[2].hand.some((c) => c.id === 'stolen-skip'));
});


