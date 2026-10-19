'use strict';

// Đợt 3: socket bắt buộc token, đăng xuất huỷ token, upload avatar cần token, giới hạn tần suất.
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { io } = require('socket.io-client');
const { AccountController } = require('../dist/server/src/store/account.controller.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { RateLimiter } = require('../dist/server/src/rate-limit.js');

async function boot(t) {
  const dir = mkdtempSync(join(tmpdir(), 'meono-sec-'));
  const store = {
    kind: 'local', cacheFile: join(dir, 'db.json'), content: '{"version":1,"accounts":{}}', version: '0',
    async read() { return { content: this.content, version: this.version }; },
    async write(content) { this.content = content; return this.version = String(Number(this.version) + 1); },
  };
  class TestModule {}
  Module({
    controllers: [AccountController],
    providers: [{ provide: ACCOUNT_STORE, useValue: store }, DbService, AccountsService, RoomsService, GameGateway],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  /** kết nối socket, trả về 'connected' hoặc nội dung toast khi bị server ngắt */
  const connect = (auth) => new Promise((resolve, reject) => {
    const s = io(base, { transports: ['websocket'], reconnection: false, auth });
    sockets.push(s);
    let toast = '';
    const timer = setTimeout(() => reject(new Error('socket timed out')), 5000);
    s.on('toast', (m) => { toast = m; });
    s.on('state', () => { clearTimeout(timer); resolve({ socket: s, result: 'connected' }); });
    s.on('disconnect', () => { clearTimeout(timer); resolve({ socket: s, result: toast || 'disconnected' }); });
    s.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
  return { app, base, post, connect };
}

test('socket không có token tài khoản bị từ chối, kể cả khi mạo danh playerId của người khác', { timeout: 20_000 }, async (t) => {
  const { post, connect } = await boot(t);
  const guest = await connect({ playerId: 'guest-player-01', name: 'Khách' });
  assert.match(guest.result, /Đăng nhập bằng PIN/);

  const reg = await (await post('/api/account/register', { playerId: 'owner-player-01', name: 'Chủ', pin: '1234' })).json();
  const fake = await connect({ playerId: 'owner-player-01', name: 'Giả', token: 'sai-token' });
  assert.match(fake.result, /Phiên đăng nhập không hợp lệ/);
  const real = await connect({ playerId: 'owner-player-01', name: 'Chủ', token: reg.token });
  assert.equal(real.result, 'connected');
});

test('đăng xuất huỷ token trên server: socket cũ bị ngắt ở thao tác kế tiếp, kết nối lại bị từ chối', { timeout: 20_000 }, async (t) => {
  const { post, connect } = await boot(t);
  const reg = await (await post('/api/account/register', { playerId: 'logout-player-1', name: 'Thoát', pin: '1234' })).json();
  const { socket } = await connect({ playerId: 'logout-player-1', name: 'Thoát', token: reg.token });
  const res = await post('/api/account/logout', { playerId: 'logout-player-1', token: reg.token });
  assert.equal(res.status, 200);
  const closed = new Promise((resolve) => socket.once('disconnect', resolve));
  socket.emit('room:create', {});
  await closed;
  const again = await connect({ playerId: 'logout-player-1', name: 'Thoát', token: reg.token });
  assert.match(again.result, /Phiên đăng nhập không hợp lệ/);
  // token sai thì đăng xuất không làm gì nhưng vẫn trả ok (không lộ thông tin)
  assert.equal((await post('/api/account/logout', { playerId: 'nobody-here-1', token: 'x' })).status, 200);
});

test('đăng nhập / tạo tài khoản bị giới hạn tần suất theo IP', { timeout: 20_000 }, async (t) => {
  const { post } = await boot(t);
  const codes = [];
  for (let i = 0; i < 22; i++) codes.push((await post('/api/account/login', { name: 'ai-do', pin: '0000' })).status);
  assert.ok(codes.slice(0, 5).every((c) => c === 401));
  assert.equal(codes.at(-1), 429);
  const reg = [];
  for (let i = 0; i < 6; i++) reg.push((await post('/api/account/register', { playerId: `spam-player-${i}0`, name: `spam${i}`, pin: '1234' })).status);
  assert.deepEqual(reg, [201, 201, 201, 201, 201, 429]);
});

test('upload avatar cần đúng token của chủ tài khoản', async () => {
  const { AvatarController } = require('../dist/server/src/avatar/avatar.controller.js');
  const accounts = { verify: (id, token) => (id === 'avatar-owner-1' && token === 'good' ? {} : undefined) };
  const ctrl = new AvatarController(accounts);
  assert.throws(() => ctrl.upload({ playerId: 'avatar-owner-1', dataUrl: 'data:image/png;base64,AAAA' }), /Phiên đăng nhập/);
  assert.throws(() => ctrl.upload({ playerId: 'avatar-owner-1', token: 'bad', dataUrl: 'data:image/png;base64,AAAA' }), /Phiên đăng nhập/);
  assert.throws(() => ctrl.upload({ playerId: 'avatar-owner-1', token: 'good', dataUrl: 'không phải ảnh' }), /png/);
});

test('RateLimiter: chặn khi vượt hạn mức, mở lại sau cửa sổ, số khoá không vượt giới hạn', () => {
  const rl = new RateLimiter(2, 1000, 50);
  assert.equal(rl.hit('a', 0), true);
  assert.equal(rl.hit('a', 10), true);
  assert.equal(rl.hit('a', 20), false);
  assert.equal(rl.hit('a', 1001), true);
  for (let i = 0; i < 500; i++) rl.hit(`k${i}`, 2000);
  assert.ok(rl.size <= 50);
});
