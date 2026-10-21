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

test('khán giả qua socket thật: vào xem, nhận trạng thái không có bài, chat, rời phòng', { timeout: 20_000 }, async (t) => {
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
    { playerId: 'socket-watch-03', name: 'Socket Watch', pin: '2468' },
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
  const [host, peer, watcher] = clients;
  const createdState = nextState(host, (state) => state?.phase === 'lobby' && state.players.length === 1);
  assert.equal((await request(host, 'room:create', { rules: { maxPlayers: 2, firstPlayer: 'host' } })).ok, true);
  const { code } = await createdState;
  assert.equal((await request(peer, 'room:join', { code })).ok, true);

  // Khán giả vào xem: cả phòng thấy, khán giả không chiếm ghế
  const watching = [host, watcher].map((socket) => nextState(socket, (state) => state?.spectators?.length === 1));
  assert.equal((await request(watcher, 'room:watch', { code })).ok, true);
  const [hostSees, watcherSees] = await Promise.all(watching);
  assert.equal(hostSees.players.length, 2);
  assert.equal(watcherSees.spectators[0].id, identities[2].playerId);
  assert.equal((await request(watcher, 'room:join', { code })).ok, false, 'bàn đã đủ 2 người');

  // Ván bắt đầu: khán giả nhận trạng thái nhưng không có bài, không làm gì được
  assert.equal((await request(peer, 'room:ready', { ready: true, rulesVersion: 1 })).ok, true);
  const playing = nextState(watcher, (state) => state?.phase === 'playing');
  assert.equal((await request(host, 'game:start')).ok, true);
  const watchView = await playing;
  assert.deepEqual(watchView.hand, []);
  assert.ok(watchView.players.every((p) => p.handCount === 8));
  assert.equal((await request(watcher, 'game:draw')).ok, false);
  assert.equal((await request(watcher, 'game:play', { cardIds: [] })).ok, false);

  // Khán giả chat được với cả phòng
  const heard = new Promise((resolve) => host.once('chat', resolve));
  assert.equal((await request(watcher, 'room:chat', { text: 'cố lên!' })).ok, true);
  assert.equal((await heard).from, identities[2].playerId);

  // Khán giả rời phòng
  const gone = nextState(watcher, (state) => state === null);
  const hostAfter = nextState(host, (state) => state?.spectators?.length === 0);
  assert.equal((await request(watcher, 'room:leave')).ok, true);
  await Promise.all([gone, hostAfter]);

  // Xem lại rồi bàn giải tán: khán giả được mời ra
  const back = nextState(watcher, (state) => state?.code === code);
  assert.equal((await request(watcher, 'room:watch', { code })).ok, true);
  await back;
  const closed = nextState(watcher, (state) => state === null);
  assert.equal((await request(peer, 'room:leave')).ok, true);
  assert.equal((await request(host, 'room:leave')).ok, true);
  await closed;
  assert.equal(app.get(RoomsService).rooms.size, 0);
});
