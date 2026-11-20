'use strict';

require('reflect-metadata');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { io: ioClient } = require('socket.io-client');

const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { AccountController } = require('../dist/server/src/store/account.controller.js');

function waitForEvent(socket, event, predicate = () => true, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvt);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeoutMs);
    const onEvt = (data) => {
      if (predicate(data)) {
        clearTimeout(timer);
        socket.off(event, onEvt);
        resolve(data);
      }
    };
    socket.on(event, onEvt);
  });
}

const request = (socket, event, body) =>
  socket.timeout(4500).emitWithAck(event, ...(body === undefined ? [] : [body]));

describe('Mighty Knight 2.5D Pixel — Socket.IO E2E Multiplayer', () => {
  it('runs a 2-player + 1 COM room with hero selection, Boss Rush config, 30Hz mk:frame, switch_com, spectator guard & reconnect', { timeout: 20_000 }, async (t) => {
    const store = {
      kind: 'local',
      content: '{"version":1,"accounts":{}}',
      version: '0',
      async read() {
        return { content: this.content, version: this.version };
      },
      async write(content, expectedVersion) {
        assert.equal(expectedVersion, this.version);
        this.content = content;
        this.version = String(Number(this.version) + 1);
        return this.version;
      },
    };

    class IsolatedMkModule {}
    Module({
      controllers: [AccountController],
      providers: [
        { provide: ACCOUNT_STORE, useValue: store },
        DbService,
        AccountsService,
        RoomsService,
        GameGateway,
      ],
    })(IsolatedMkModule);

    const app = await NestFactory.create(IsolatedMkModule, { logger: false, abortOnError: false });
    const sockets = [];
    t.after(async () => {
      const rooms = app.get(RoomsService);
      for (const game of rooms.rooms.values()) game.dispose();
      rooms.rooms.clear();
      for (const s of sockets) s.disconnect();
      await app.close();
    });

    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();

    async function registerAndConnect(playerId, name, pin) {
      const resp = await fetch(`${baseUrl}/api/account/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId, name, pin }),
      });
      assert.equal(resp.status, 201);
      const data = await resp.json();
      assert.ok(data.token);
      const sock = ioClient(baseUrl, {
        transports: ['websocket'],
        auth: { playerId, name, token: data.token },
      });
      sockets.push(sock);
      await new Promise((res, rej) => {
        sock.once('connect', res);
        sock.once('connect_error', rej);
      });
      return { sock, id: playerId, name, token: data.token };
    }

    const p1 = await registerAndConnect('mk-pixel-host-01', 'PixelHost', '1234');
    const p2 = await registerAndConnect('mk-pixel-ally-02', 'PixelAlly', '2345');
    const spec = await registerAndConnect('mk-pixel-spec-03', 'PixelSpec', '3456');

    const createdState = waitForEvent(p1.sock, 'state', (s) => Boolean(s?.code));
    const created = await request(p1.sock, 'room:create', { gameMode: 'mighty_knight' });
    assert.equal(created.ok, true);
    const roomView = await createdState;
    const code = roomView.code;

    const joined = await request(p2.sock, 'room:join', { code });
    assert.equal(joined.ok, true);

    // Configure Boss Rush + 1 COM + Citadel biome
    const cfgState = waitForEvent(p2.sock, 'state', (s) => s?.mk?.config?.playMode === 'boss_rush');
    const cfgRes = await request(p1.sock, 'mk:config', {
      config: { playMode: 'boss_rush', comBots: 1, difficulty: 'normal', biome: 'citadel', allowSwitchCom: true },
    });
    assert.equal(cfgRes.ok, true);
    const updatedView = await cfgState;

    // Hero picks & ready
    assert.equal((await request(p1.sock, 'mk:hero', { heroId: 'lancer' })).ok, true);
    assert.equal((await request(p2.sock, 'mk:hero', { heroId: 'mage' })).ok, true);
    assert.equal((await request(p2.sock, 'room:ready', { ready: true, rulesVersion: updatedView.rulesVersion })).ok, true);

    // Start match
    const frameP1 = waitForEvent(p1.sock, 'mk:frame', (f) => f && f.fighters && f.fighters.length === 3);
    assert.equal((await request(p1.sock, 'game:start')).ok, true);
    const firstFrame = await frameP1;
    assert.equal(firstFrame.playMode, 'boss_rush');
    assert.equal(firstFrame.biome, 'citadel');
    assert.equal(firstFrame.fighters.length, 3);

    // Spectator joins active game and is rejected when trying to send mk:cmd
    const watchRes = await request(spec.sock, 'room:watch', { code });
    assert.equal(watchRes.ok, true);
    const specCmd = await request(spec.sock, 'mk:cmd', { t: 'attack' });
    assert.equal(specCmd.ok, false);

    // P1 casts skill 1, guard, and switches control to COM
    assert.equal((await request(p1.sock, 'mk:cmd', { t: 'skill', slot: 1 })).ok, true);
    assert.equal((await request(p1.sock, 'mk:cmd', { t: 'guard' })).ok, true);
    const comFighter = firstFrame.fighters.find((f) => f.isCom);
    assert.ok(comFighter);
    assert.equal((await request(p1.sock, 'mk:cmd', { t: 'switch_com', targetId: comFighter.id })).ok, true);

    const swappedFrame = await waitForEvent(
      p1.sock,
      'mk:frame',
      (f) => f.fighters.some((u) => u.id === comFighter.id && u.ownerId === p1.id),
    );
    assert.ok(swappedFrame);

    // Reconnect P2 with a fresh socket -> still receives mk:frame smoothly
    p2.sock.disconnect();
    const p2Re = ioClient(baseUrl, {
      transports: ['websocket'],
      auth: { playerId: p2.id, name: p2.name, token: p2.token },
    });
    sockets.push(p2Re);
    const reFrame = await waitForEvent(p2Re, 'mk:frame', (f) => f.tick > swappedFrame.tick);
    assert.ok(reFrame.fighters.length >= 2);
  });
});
