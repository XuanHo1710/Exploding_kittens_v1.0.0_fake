'use strict';

require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { io } = require('socket.io-client');
const { AccountController } = require('../dist/server/src/store/account.controller.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');

function nextState(socket, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out waiting for room state')); }, 5000);
    const receive = (state) => { if (predicate(state)) { cleanup(); resolve(state); } };
    function cleanup() { clearTimeout(timer); socket.off('state', receive); }
    socket.on('state', receive);
  });
}

const request = (socket, event, body) => socket.timeout(5000).emitWithAck(event, ...(body === undefined ? [] : [body]));

test('real sockets synchronize custom rules, require current agreement, and deal the accepted deck', { timeout: 20_000 }, async (t) => {
  const store = {
    kind: 'local', content: '{"version":1,"accounts":{}}', version: '0',
    async read() { return { content: this.content, version: this.version }; },
    async write(content, expectedVersion) {
      assert.equal(expectedVersion, this.version);
      this.content = content;
      return this.version = String(Number(this.version) + 1);
    },
  };
  class TestModule {}
  Module({
    controllers: [AccountController],
    providers: [{ provide: ACCOUNT_STORE, useValue: store }, DbService, AccountsService, RoomsService, GameGateway],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  const clients = [];
  t.after(async () => {
    const rooms = app.get(RoomsService);
    for (const game of rooms.rooms.values()) game.dispose();
    rooms.rooms.clear();
    clients.forEach((socket) => socket.disconnect());
    await app.close();
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const identities = [
    { playerId: 'socket-host-01', name: 'Socket Host', pin: '1234' },
    { playerId: 'socket-peer-02', name: 'Socket Peer', pin: '5678' },
  ];
  for (const identity of identities) {
    const response = await fetch(`${base}/api/account/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(identity),
    });
    assert.equal(response.status, 201);
    const auth = await response.json();
    assert.ok(auth.token);
    const socket = io(base, {
      autoConnect: false, transports: ['websocket'], reconnection: false,
      auth: { playerId: identity.playerId, name: identity.name, token: auth.token },
    });
    clients.push(socket);
    socket.on('state', (state) => { socket.roomState = state; });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
      socket.connect();
    });
  }
  const [host, peer] = clients;
  const custom = {
    firstPlayer: 'host', handSize: 3, defusesPerPlayer: 1, extraDefuses: 0,
    bombMode: 'players_minus_one', maxPlayers: 2, attackMode: 'replace', futureCount: 5, turnSeconds: 30,
  };
  const createdState = nextState(host, (state) => state?.phase === 'lobby' && state.players.length === 1);
  assert.equal((await request(host, 'room:create', { rules: custom })).ok, true);
  const created = await createdState;
  for (const [key, value] of Object.entries(custom)) assert.equal(created.rules[key], value);
  assert.equal(created.rulesVersion, 1);

  const joinedStates = [host, peer].map((socket) => nextState(socket, (state) => state?.players.length === 2));
  assert.equal((await request(peer, 'room:join', { code: created.code })).ok, true);
  const [hostLobby, peerLobby] = await Promise.all(joinedStates);
  assert.deepEqual(hostLobby.rules, peerLobby.rules);
  assert.equal(peerLobby.players.find((p) => p.id === identities[1].playerId).ready, false);
  assert.equal((await request(host, 'game:start')).ok, false);
  assert.equal(JSON.parse(store.content).accounts[identities[0].playerId].games, 0);

  const acceptedStates = [host, peer].map((socket) => nextState(socket, (state) => state?.players.every((p) => p.ready)));
  assert.equal((await request(peer, 'room:ready', { ready: true, rulesVersion: 1 })).ok, true);
  await Promise.all(acceptedStates);
  const revisedRules = { ...hostLobby.rules, futureCount: 2 };
  const revisedStates = [host, peer].map((socket) => nextState(socket, (state) => state?.rulesVersion === 2));
  assert.equal((await request(host, 'room:rules', { rules: revisedRules })).ok, true);
  const [hostRevised, peerRevised] = await Promise.all(revisedStates);
  assert.deepEqual(hostRevised.rules, peerRevised.rules);
  assert.equal(peerRevised.players.find((p) => p.id === identities[1].playerId).ready, false);
  assert.equal((await request(peer, 'room:ready', { ready: true, rulesVersion: 1 })).ok, false);
  assert.equal((await request(host, 'game:start')).ok, false);

  const readyAgain = nextState(host, (state) => state?.rulesVersion === 2 && state.players.every((p) => p.ready));
  assert.equal((await request(peer, 'room:ready', { ready: true, rulesVersion: 2 })).ok, true);
  await readyAgain;
  const playingStates = [host, peer].map((socket) => nextState(socket, (state) => state?.phase === 'playing'));
  assert.equal((await request(host, 'game:start')).ok, true);
  const views = await Promise.all(playingStates);
  for (const view of views) {
    assert.equal(view.rulesVersion, 2);
    assert.deepEqual(view.rules, revisedRules);
    assert.equal(view.currentPlayerId, identities[0].playerId);
    assert.equal(view.hand.length, 4);
    assert.equal(view.hand.filter((c) => c.type === 'defuse').length, 1);
    assert.ok(view.hand.every((c) => c.type !== 'exploding'));
    assert.ok(view.players.every((p) => p.handCount === 4));
  }
  assert.equal((await request(host, 'room:rules', { rules: { ...revisedRules, handSize: 9 } })).ok, false);
  for (const socket of clients) {
    assert.equal(socket.roomState.rulesVersion, 2);
    assert.deepEqual(socket.roomState.rules, revisedRules);
    assert.equal(socket.roomState.phase, 'playing');
  }
  const persisted = JSON.parse(store.content).accounts;
  assert.equal(persisted[identities[0].playerId].games, 1);
  assert.equal(persisted[identities[1].playerId].games, 1);
});
