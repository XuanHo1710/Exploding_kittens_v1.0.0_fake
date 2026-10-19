'use strict';

require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AccountController } = require('../dist/server/src/store/account.controller.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('real HTTP waits for primary startup and commit, and returns 503 when persistence fails', async (t) => {
  const startup = deferred();
  const firstWrite = deferred();
  const writeStarted = deferred();
  const store = {
    kind: 'local', content: '{"version":1,"accounts":{}}', version: '0', offline: false,
    async read() { await startup.promise; return { content: this.content, version: this.version }; },
    async write(content, version) {
      writeStarted.resolve();
      await firstWrite.promise;
      if (this.offline) throw new Error('unavailable');
      assert.equal(version, this.version);
      this.content = content;
      return this.version = String(Number(this.version) + 1);
    },
  };
  class TestModule {}
  Module({
    controllers: [AccountController],
    providers: [{ provide: ACCOUNT_STORE, useValue: store }, DbService, AccountsService],
  })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
  t.after(async () => { firstWrite.resolve(); startup.resolve(); await app.close(); });
  let listening = false;
  const opening = app.listen(0, '127.0.0.1').then(() => { listening = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listening, false);
  startup.resolve();
  await opening;
  const base = await app.getUrl();
  const post = (path, body) => fetch(`${base}/api/account/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let returned = false;
  const registration = post('register', { playerId: 'http-player-01', name: 'HTTP Mèo', pin: '1234' }).then((res) => {
    returned = true;
    return res;
  });
  await writeStarted.promise;
  assert.equal(returned, false);
  assert.deepEqual(JSON.parse(store.content).accounts, {});
  firstWrite.resolve();
  const response = await registration;
  assert.equal(response.status, 201);
  const auth = await response.json();
  assert.ok(auth.token);
  assert.equal(JSON.parse(store.content).accounts['http-player-01'].coins, 1000);

  const persisted = store.content;
  store.offline = true;
  const failed = await post('register', { playerId: 'http-player-02', name: 'HTTP Hai', pin: '5678' });
  assert.equal(failed.status, 503);
  assert.equal(store.content, persisted);
  store.offline = false;
  const login = await post('login', { name: 'HTTP Mèo', pin: '1234' });
  assert.equal(login.status, 201);
  assert.ok((await login.json()).token);
});
