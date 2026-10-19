require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ServiceUnavailableException } = require('@nestjs/common');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { GameError } = require('../dist/server/src/game/game.js');

const HOST = 'player_001';
const PEER = 'player_002';
const OTHER = 'player_003';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t) {
  const events = [];
  const hooks = {};
  const calls = { charge: [], refund: [], reward: [], profile: [], daily: [] };
  const data = new Map([HOST, PEER, OTHER].map((playerId, i) => [playerId, {
    playerId, name: `Player ${i + 1}`, coins: 1000, games: 0, wins: 0,
  }]));
  const accounts = {
    data,
    get: (id) => data.has(id) ? structuredClone(data.get(id)) : undefined,
    info: (account) => structuredClone(account),
    verify: (id, token) => token === 'valid' ? accounts.get(id) : undefined,
    async chargeGame(ids, bet) {
      calls.charge.push({ ids: [...ids], bet });
      if (hooks.charge) await hooks.charge(ids, bet);
      for (const id of ids) {
        const account = data.get(id);
        if (!account) continue;
        account.coins -= bet;
        account.games++;
      }
    },
    async refundGame(ids, bet) {
      calls.refund.push({ ids: [...ids], bet });
      if (hooks.refund) await hooks.refund(ids, bet);
      for (const id of ids) {
        const account = data.get(id);
        if (!account) continue;
        account.coins += bet;
        account.games--;
      }
    },
    async rewardWinner(id, pot) {
      calls.reward.push({ id, pot });
      if (hooks.reward) await hooks.reward(id, pot);
      const account = data.get(id);
      if (!account) return false;
      account.coins += pot;
      account.wins++;
      return true;
    },
    async updateProfile(id, name, avatar) {
      calls.profile.push({ id, name, avatar });
      if (hooks.profile) await hooks.profile(id, name, avatar);
      const account = data.get(id);
      account.name = name;
      account.avatar = avatar;
      return accounts.get(id);
    },
    async claimDaily(id) {
      calls.daily.push(id);
      if (hooks.daily) await hooks.daily(id);
      data.get(id).coins += 500;
      return true;
    },
  };
  const server = {
    to(room) { return { emit(event, value) { events.push({ room, event, value }); } }; },
    in() { return { fetchSockets: async () => [] }; },
  };
  const rooms = new RoomsService(accounts);
  rooms.logger.error = () => {};
  rooms.bind(server);
  for (const id of data.keys()) rooms.setVerified(id, true);
  rooms.create(HOST, data.get(HOST).name);
  const game = rooms.roomOf(HOST);
  rooms.join(game.code, PEER, data.get(PEER).name);
  rooms.setBet(HOST, 100);
  rooms.setReady(PEER, true, game.rulesVersion);
  const gateway = new GameGateway(rooms, accounts);
  gateway.logger.error = () => {};
  gateway.server = server;
  t.after(() => {
    for (const active of rooms.rooms.values()) active.dispose();
    game.dispose();
  });
  return { accounts, hooks, calls, server, events, rooms, game, gateway };
}

function socket(auth = {}) {
  const events = [];
  const joins = [];
  return {
    handshake: { auth: { playerId: HOST, name: 'Client name', token: 'valid', ...auth } },
    data: {}, events, joins, disconnected: false,
    emit(event, value) { events.push({ event, value }); },
    join(room) { joins.push(room); },
    disconnect() { this.disconnected = true; },
  };
}

test('waits for the bulk charge, locks the lobby and defers disconnect state', async (t) => {
  const { rooms, game, hooks, calls, accounts, events } = fixture(t);
  const gate = deferred();
  hooks.charge = () => gate.promise;
  events.length = 0;
  const starting = rooms.startGame(HOST);
  assert.equal(game.phase, 'lobby');
  assert.equal(accounts.get(HOST).coins, 1000);
  assert.equal(calls.charge.length, 1);
  await assert.rejects(rooms.startGame(HOST), GameError);
  assert.throws(() => rooms.join(game.code, OTHER, 'Third player'), GameError);
  assert.throws(() => rooms.leave(PEER), GameError);
  assert.throws(() => rooms.create(PEER, 'New room'), GameError);
  assert.throws(() => rooms.setBet(HOST, 50), GameError);
  rooms.disconnected(PEER);
  assert.equal(game.players.find((p) => p.id === PEER).connected, true);
  assert.equal(events.some((e) => e.event === 'account'), false);
  assert.equal(events.some((e) => e.event === 'state' && e.value?.phase === 'playing'), false);
  gate.resolve();
  await starting;
  assert.equal(game.phase, 'playing');
  assert.equal(game.pot, 200);
  assert.equal(game.players.find((p) => p.id === PEER).connected, false);
  assert.equal(accounts.get(HOST).coins, 900);
  assert.equal(accounts.get(PEER).games, 1);
  const states = events.filter((e) => e.event === 'state' && e.value?.phase === 'playing');
  assert.ok(states.length > 0);
  assert.ok(states.every((e) => e.value.pot === 200 && e.value.players.every((p) => p.coins === 900)));
});

test('a rejected charge leaves the lobby and all account balances unchanged', async (t) => {
  const { rooms, game, hooks, calls, accounts } = fixture(t);
  hooks.charge = async () => { throw new Error('Drive offline'); };
  await assert.rejects(rooms.startGame(HOST), /Drive offline/);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.pot, 0);
  assert.equal(accounts.get(HOST).coins, 1000);
  assert.equal(accounts.get(PEER).games, 0);
  assert.equal(calls.refund.length, 0);
  assert.ok(game.players.every((p) => p.hand.length === 0));
  assert.doesNotThrow(() => rooms.setBet(HOST, 50));
});

test('validates host and player count before charging any account', async (t) => {
  const { rooms, game, calls } = fixture(t);
  await assert.rejects(rooms.startGame(PEER), GameError);
  game.removePlayer(PEER);
  await assert.rejects(rooms.startGame(HOST), GameError);
  assert.equal(calls.charge.length, 0);
});

test('refunds the entire bulk charge if a prior lobby timer changes participants', async (t) => {
  const { rooms, game, hooks, calls, accounts } = fixture(t);
  const gate = deferred();
  hooks.charge = () => gate.promise;
  const starting = rooms.startGame(HOST);
  const rejected = assert.rejects(starting, GameError);
  game.removePlayer(PEER);
  gate.resolve();
  await rejected;
  assert.equal(game.phase, 'lobby');
  assert.deepEqual(calls.refund, [{ ids: [HOST, PEER], bet: 100 }]);
  assert.equal(accounts.get(HOST).coins, 1000);
  assert.equal(accounts.get(PEER).coins, 1000);
  assert.equal(accounts.get(HOST).games, 0);
});

test('retries a pending refund before allowing another charge', async (t) => {
  const { rooms, game, hooks, calls, accounts } = fixture(t);
  const gate = deferred();
  hooks.charge = () => gate.promise;
  hooks.refund = async () => { throw new Error('Refund unavailable'); };
  game.start = () => { throw new GameError('Unexpected start failure'); };
  const starting = rooms.startGame(HOST);
  const rejected = assert.rejects(starting, GameError);
  gate.resolve();
  await rejected;
  assert.equal(accounts.get(HOST).coins, 900);
  assert.equal(game.pot, 200);
  assert.throws(() => rooms.leave(HOST), GameError);
  delete hooks.refund;
  game.removePlayer(PEER);
  // The refund succeeds; starting still fails because only the host remains.
  await assert.rejects(rooms.startGame(HOST), GameError);
  assert.equal(calls.charge.length, 1);
  assert.equal(calls.refund.length, 2);
  assert.equal(accounts.get(HOST).coins, 1000);
  assert.equal(accounts.get(PEER).games, 0);
  assert.equal(game.pot, 0);
  assert.doesNotThrow(() => rooms.setBet(HOST, 50));
});

test('deduplicates winner payouts and waits for them before restarting', async (t) => {
  const { rooms, game, hooks, calls, accounts } = fixture(t);
  await rooms.startGame(HOST);
  const gate = deferred();
  hooks.reward = () => gate.promise;
  rooms.leave(PEER);
  assert.equal(game.phase, 'ended');
  assert.equal(game.paid, false);
  rooms.broadcast(game);
  rooms.broadcast(game);
  const restarting = rooms.restartGame(HOST);
  assert.equal(game.phase, 'ended');
  assert.equal(calls.reward.length, 1);
  assert.equal(accounts.get(HOST).coins, 900);
  gate.resolve();
  await restarting;
  assert.equal(game.phase, 'lobby');
  assert.equal(game.pot, 0);
  assert.equal(accounts.get(HOST).coins, 1100);
  assert.equal(accounts.get(HOST).wins, 1);
  assert.deepEqual(calls.reward, [{ id: HOST, pot: 200 }]);
});

test('retains a failed payout and retries it only when restart is requested', async (t) => {
  const { rooms, game, hooks, calls, accounts, events } = fixture(t);
  await rooms.startGame(HOST);
  hooks.reward = async () => { throw new Error('Drive offline'); };
  rooms.leave(PEER);
  await assert.rejects(rooms.payouts.get(game), GameError);
  assert.equal(game.paid, false);
  assert.equal(game.pot, 200);
  assert.equal(accounts.get(HOST).coins, 900);
  rooms.broadcast(game);
  rooms.broadcast(game);
  assert.equal(calls.reward.length, 1);
  assert.ok(events.some((e) => e.event === 'toast'));
  delete hooks.reward;
  await rooms.restartGame(HOST);
  assert.equal(calls.reward.length, 2);
  assert.equal(accounts.get(HOST).coins, 1100);
  assert.equal(accounts.get(HOST).wins, 1);
  assert.equal(game.phase, 'lobby');
});

test('existing account sockets need valid tokens before joining private rooms', (t) => {
  const { gateway } = fixture(t);
  const invalid = socket({ token: 'wrong' });
  gateway.handleConnection(invalid);
  assert.equal(invalid.disconnected, true);
  assert.deepEqual(invalid.joins, []);
  assert.equal(invalid.events.some((e) => e.event === 'toast'), true);
  const valid = socket();
  gateway.handleConnection(valid);
  assert.equal(valid.disconnected, false);
  assert.deepEqual(valid.joins, [`p:${HOST}`]);
  assert.equal(valid.data.name, 'Player 1');
});

test('gateway awaits rejected daily persistence and reports it without crediting coins', async (t) => {
  const { gateway, hooks, accounts, events } = fixture(t);
  const client = socket();
  gateway.handleConnection(client);
  events.length = 0;
  hooks.daily = async () => { throw new ServiceUnavailableException(); };
  await gateway.daily(client);
  assert.equal(accounts.get(HOST).coins, 1000);
  assert.equal(events.some((e) => e.event === 'account'), false);
  assert.ok(client.events.some((e) => e.event === 'toast' && /Chưa lưu/.test(e.value)));
});

test('profile changes reach socket identity and the room only after persistence', async (t) => {
  const { gateway, game, hooks, accounts } = fixture(t);
  const client = socket();
  gateway.handleConnection(client);
  const gate = deferred();
  hooks.profile = () => gate.promise;
  const updating = gateway.updateProfile(client, { name: 'Saved profile' });
  assert.equal(client.data.name, 'Player 1');
  assert.equal(game.players.find((p) => p.id === HOST).name, 'Player 1');
  gate.resolve();
  await updating;
  assert.equal(client.data.name, 'Saved profile');
  assert.equal(game.players.find((p) => p.id === HOST).name, 'Saved profile');
  hooks.profile = async () => { throw new ServiceUnavailableException(); };
  await gateway.updateProfile(client, { name: 'Uncommitted profile' });
  assert.equal(client.data.name, 'Saved profile');
  assert.equal(accounts.get(HOST).name, 'Saved profile');
});

test('gateway rechecks existing account tokens for subsequent actions', async (t) => {
  const { gateway, calls } = fixture(t);
  const client = socket();
  gateway.handleConnection(client);
  client.data.token = 'revoked';
  await gateway.daily(client);
  assert.equal(client.disconnected, true);
  assert.equal(calls.daily.length, 0);
});
