'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { io } = require('socket.io-client');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { ExpeditionService } = require('../dist/server/src/game/expedition/expedition.service.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { CampaignService } = require('../dist/server/src/game/mk/campaign.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { AccountController } = require('../dist/server/src/store/account.controller.js');
const { CAMPAIGN_ACTION, CAMPAIGN_EVT, CAMPAIGN_INPUT_EVT, CAMPAIGN_FRAME_EVT, CAMPAIGN_RESULT_EVT } =
  require('../dist/shared/src/mk/campaign.js');

test('account can enter a Mighty Knight lobby, clear a campaign wave, upgrade and reconnect', { timeout: 45000 }, async (t) => {
  const store = {
    kind: 'local', content: '{"version":1,"accounts":{}}', version: '0',
    async read() { return { content: this.content, version: this.version }; },
    async write(content, version) {
      assert.equal(version, this.version);
      this.content = content;
      this.version = String(Number(version) + 1);
      return this.version;
    },
  };
  class IsolatedModule {}
  Module({
    controllers: [AccountController],
    providers: [
      { provide: ACCOUNT_STORE, useValue: store }, { provide: ExpeditionService, useValue: {} },
      DbService, AccountsService, RoomsService, GameGateway, CampaignService,
    ],
  })(IsolatedModule);
  const app = await NestFactory.create(IsolatedModule, { logger: false, abortOnError: false });
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.disconnect();
    const rooms = app.get(RoomsService);
    for (const game of rooms.rooms.values()) game.dispose();
    rooms.rooms.clear();
    await app.close();
  });
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const registration = { playerId: 'mk-campaign-e2e', name: 'CampaignPlayer', pin: '1234' };
  const response = await fetch(`${baseUrl}/api/account/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(registration),
  });
  assert.equal(response.status, 201);
  const { token } = await response.json();
  for (const registered of [true, false]) {
    const stale = io(baseUrl, {
      autoConnect: false, transports: ['polling', 'websocket'], reconnection: false,
      auth: { ...registration, playerId: registered ? registration.playerId : 'mk-missing-account', token: 'stale-token' },
    });
    sockets.push(stale);
    const rejection = once(stale, 'connect_error', { signal: AbortSignal.timeout(4000) });
    stale.connect();
    const [error] = await rejection;
    assert.deepEqual(error.data, { code: 'AUTH_REQUIRED', registered });
    assert.equal(stale.connected, false);
  }
  async function connect() {
    const socket = io(baseUrl, { transports: ['websocket'], auth: { ...registration, token }, reconnection: false });
    sockets.push(socket);
    const connected = AbortSignal.timeout(4000);
    await once(socket, 'connect', { signal: connected });
    return socket;
  }
  async function request(socket, event, body) {
    return socket.timeout(4000).emitWithAck(event, body);
  }
  let socket = await connect();
  assert.equal((await request(socket, 'room:create', { gameMode: 'mighty_knight' })).ok, true);
  assert.equal((await request(socket, 'room:leave', {})).ok, true);
  const initial = await request(socket, CAMPAIGN_EVT, { t: 'load' });
  assert.equal(initial.result.progress.heroes.arden.level, 1);
  assert.equal((await request(socket, CAMPAIGN_EVT, { t: 'deploy', revision: 0, wave: 2, roster: ['arden'], controlled: 'arden' })).ok, false);
  assert.equal((await request(socket, CAMPAIGN_EVT, { t: 'deploy', revision: 0, wave: 1, roster: ['solen'], controlled: 'solen' })).ok, false);

  let seq = 0;
  const drive = (frame) => {
    const player = frame.actors.find((a) => a.id === frame.controlled);
    if (!player || frame.phase !== 'combat') return;
    const target = frame.actors.filter((a) => a.side === 'enemy' && a.hp > 0)
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
    if (!target) return;
    const dx = target.x - player.x, dy = target.y - player.y;
    socket.emit(CAMPAIGN_INPUT_EVT, {
      attemptId: frame.attemptId, seq: ++seq, x: Math.abs(dx) > 18 ? Math.sign(dx) : 0,
      y: Math.abs(dy) > 5 ? Math.sign(dy) : 0, buttons: CAMPAIGN_ACTION.attack,
    });
  };
  socket.on(CAMPAIGN_FRAME_EVT, drive);
  const pendingResult = once(socket, CAMPAIGN_RESULT_EVT, { signal: AbortSignal.timeout(35000) });
  const deployed = await request(socket, CAMPAIGN_EVT, { t: 'deploy', revision: 0, wave: 1, roster: ['arden'], controlled: 'arden' });
  assert.equal(deployed.result.frame.wave, 1);
  const [result] = await pendingResult;
  socket.off(CAMPAIGN_FRAME_EVT, drive);
  assert.equal(result.outcome, 'win');
  assert.equal(result.reward.recruit, 'linnet');
  assert.equal(result.progress.heroes.arden.skills.active, 1);
  const rev = result.progress.revision;
  const spend = { t: 'upgrade', hero: 'arden', kind: 'stat', key: 'force', revision: rev };
  const concurrent = await Promise.all([request(socket, CAMPAIGN_EVT, spend), request(socket, CAMPAIGN_EVT, spend)]);
  assert.equal(concurrent.filter((a) => a.ok).length, 1);
  socket.disconnect();
  socket = await connect();
  const saved = (await request(socket, CAMPAIGN_EVT, { t: 'load' })).result.progress;
  assert.equal(saved.heroes.arden.stats.force, 1);
  assert.equal(saved.heroes.arden.statPoints, 1);
  assert.ok(saved.heroes.linnet);
  assert.equal(saved.highestCleared, 1);
  assert.equal(JSON.parse(store.content).accounts[registration.playerId].mkCampaign.revision, saved.revision);
});
