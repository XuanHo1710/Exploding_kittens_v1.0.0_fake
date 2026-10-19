'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Logger } = require('@nestjs/common');
const { DbService, parseDb } = require('../dist/server/src/store/db.service.js');
const { LocalJsonStore, createAccountStore } = require('../dist/server/src/store/json.store.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');

Logger.overrideLogger(false);

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

class MemoryStore {
  kind = 'local'; // No cache writes to the developer's real server/data directory.
  content = '{"version":1,"accounts":{}}';
  version = '0';
  writes = 0;
  failure;
  gate;
  async read() { return { content: this.content, version: this.version }; }
  async write(content, version) {
    this.writes++;
    assert.equal(version, this.version);
    if (this.gate) await this.gate.promise;
    if (this.failure) throw this.failure;
    this.content = content;
    this.version = String(Number(this.version) + 1);
    return this.version;
  }
}

async function fixture(store = new MemoryStore()) {
  const db = new DbService(store);
  await db.onModuleInit();
  return { store, db, accounts: new AccountsService(db) };
}

const register = (accounts, id = 'player-001', name = 'Mèo Một') => accounts.register(id, name, '1234', 'cat:test');

test('registration is invisible until primary storage confirms; PIN and tokens are hashed', async () => {
  const { db, accounts, store } = await fixture();
  store.gate = deferred();
  let done = false;
  const registration = register(accounts).then((r) => { done = true; return r; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false);
  assert.equal(db.account('player-001'), undefined);
  store.gate.resolve();
  const auth = await registration;
  const saved = JSON.parse(store.content).accounts['player-001'];
  assert.equal(saved.coins, 1000);
  assert.notEqual(saved.pinHash, '1234');
  assert.notEqual(saved.tokens[0], auth.token);
  assert.ok(accounts.verify('player-001', auth.token));
  saved.coins = 999999;
  const snapshot = accounts.get('player-001');
  snapshot.coins = 999999;
  assert.equal(accounts.get('player-001').coins, 1000);
});

test('concurrent registration enforces name uniqueness inside the write queue', async () => {
  const { accounts, store } = await fixture();
  const results = await Promise.allSettled([
    register(accounts, 'player-001', 'Mèo Một'),
    register(accounts, 'player-002', 'mèo một'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(JSON.parse(store.content).accounts).length, 1);
});

test('failed primary write rolls back registration and allows a safe retry', async () => {
  const { accounts, store } = await fixture();
  store.failure = Object.assign(new Error('offline'), { code: 'UNAVAILABLE' });
  await assert.rejects(register(accounts), (e) => e.getStatus() === 503);
  assert.equal(accounts.get('player-001'), undefined);
  store.failure = undefined;
  await register(accounts);
  assert.equal(accounts.get('player-001').coins, 1000);
});

test('simultaneous daily claims award coins exactly once', async () => {
  const { accounts, store } = await fixture();
  await register(accounts);
  const initialWrites = store.writes;
  assert.deepEqual(await Promise.all([
    accounts.claimDaily('player-001'), accounts.claimDaily('player-001'), accounts.claimDaily('player-001'),
  ]), [true, false, false]);
  assert.equal(accounts.get('player-001').coins, 1500);
  assert.equal(store.writes, initialWrites + 1);
});

test('failed daily write does not consume eligibility or grant coins in RAM', async () => {
  const { accounts, store } = await fixture();
  await register(accounts);
  store.failure = new Error('offline');
  await assert.rejects(accounts.claimDaily('player-001'));
  assert.equal(accounts.get('player-001').coins, 1000);
  assert.equal(accounts.info(accounts.get('player-001')).canClaimDaily, true);
});

test('bulk game charge checks the whole table before debiting anyone', async () => {
  const { accounts, store } = await fixture();
  await register(accounts);
  await register(accounts, 'player-002', 'Mèo Hai');
  await accounts.addCoins('player-002', -950);
  const before = store.content;
  await assert.rejects(accounts.chargeGame(['player-001', 'player-002'], 100));
  assert.equal(store.content, before);
  assert.equal(accounts.get('player-001').coins, 1000);
  assert.equal(accounts.get('player-001').games, 0);
});

test('charge, compensation and winner reward persist all balances and statistics', async () => {
  const { accounts, store } = await fixture();
  await register(accounts);
  await register(accounts, 'player-002', 'Mèo Hai');
  await accounts.chargeGame(['player-001', 'player-002'], 100);
  assert.equal(accounts.get('player-001').coins, 900);
  assert.equal(accounts.get('player-002').games, 1);
  await accounts.refundGame(['player-001', 'player-002'], 100);
  assert.equal(accounts.get('player-002').coins, 1000);
  assert.equal(accounts.get('player-001').games, 0);
  await accounts.chargeGame(['player-001', 'player-002'], 100);
  await accounts.rewardWinner('player-001', 200);
  const persisted = JSON.parse(store.content).accounts;
  assert.equal(persisted['player-001'].coins, 1100);
  assert.equal(persisted['player-001'].wins, 1);
  assert.equal(persisted['player-002'].coins, 900);
});

test('concurrent balance changes use the latest committed balance', async () => {
  const { accounts } = await fixture();
  await register(accounts);
  await Promise.all([accounts.addCoins('player-001', 100), accounts.addCoins('player-001', -200)]);
  assert.equal(accounts.get('player-001').coins, 900);
});

test('login token is usable only after its primary write succeeds', async () => {
  const { accounts, store } = await fixture();
  const original = await register(accounts);
  const oldTokens = accounts.get('player-001').tokens;
  store.failure = new Error('offline');
  await assert.rejects(accounts.login('Mèo Một', '1234'));
  assert.deepEqual(accounts.get('player-001').tokens, oldTokens);
  assert.ok(accounts.verify('player-001', original.token));
  store.failure = undefined;
  const fresh = await accounts.login('mèo một', '1234');
  assert.ok(accounts.verify('player-001', fresh.token));
});

test('profile failure keeps old name/avatar; successful rename changes login name', async () => {
  const { accounts, store } = await fixture();
  await register(accounts);
  store.failure = new Error('offline');
  await assert.rejects(accounts.updateProfile('player-001', 'Mèo Mới', 'cat:new'));
  assert.equal(accounts.get('player-001').name, 'Mèo Một');
  store.failure = undefined;
  await accounts.updateProfile('player-001', 'Mèo Mới', undefined);
  assert.equal(accounts.get('player-001').avatar, undefined);
  assert.equal((await accounts.login('Mèo Mới', '1234')).account.name, 'Mèo Mới');
});

for (const failure of [
  Object.assign(new Error('unknown commit'), { code: 'WRITE_UNCERTAIN', uncertain: true }),
  Object.assign(new Error('another writer'), { code: 'CONFLICT' }),
]) {
  test(`${failure.code} blocks subsequent writes until persisted state is reloaded`, async () => {
    const { accounts, store } = await fixture();
    await register(accounts);
    store.failure = failure;
    await assert.rejects(accounts.addCoins('player-001', 50));
    const writes = store.writes;
    store.failure = undefined;
    await assert.rejects(accounts.addCoins('player-001', 50));
    assert.equal(store.writes, writes);
    assert.equal(accounts.get('player-001').coins, 1000);
    const recovered = await fixture(store);
    await recovered.accounts.addCoins('player-001', 50);
    assert.equal(recovered.accounts.get('player-001').coins, 1050);
  });
}

test('startup does not fall back to an empty database on primary read/schema failure', async () => {
  const store = new MemoryStore();
  store.read = async () => { throw new Error('Drive unavailable'); };
  const db = new DbService(store);
  await assert.rejects(db.onModuleInit());
  assert.throws(() => db.account('player-001'));
  store.read = async () => ({ content: '{"version":1,"accounts":[]}', version: '1' });
  await assert.rejects(db.onModuleInit());
  assert.equal(store.writes, 0);
  assert.throws(() => parseDb('{broken'));
});

test('shutdown drains accepted writes and refuses new mutations', async () => {
  const { accounts, db, store } = await fixture();
  await register(accounts);
  store.gate = deferred();
  const accepted = accounts.addCoins('player-001', 50);
  await new Promise((resolve) => setImmediate(resolve));
  let stopped = false;
  const shutdown = db.onModuleDestroy().then(() => { stopped = true; });
  await assert.rejects(accounts.addCoins('player-001', 50));
  assert.equal(stopped, false);
  store.gate.resolve();
  await accepted;
  await shutdown;
  assert.equal(JSON.parse(store.content).accounts['player-001'].coins, 1050);
});

test('local development storage survives restart and detects external edits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meono-accounts-'));
  const file = join(dir, 'db.json');
  try {
    const { accounts } = await fixture(new LocalJsonStore(file));
    const auth = await register(accounts);
    const restarted = await fixture(new LocalJsonStore(file));
    assert.ok(restarted.accounts.verify('player-001', auth.token));
    writeFileSync(file, readFileSync(file, 'utf8') + '\n');
    await assert.rejects(restarted.accounts.addCoins('player-001', 10));
    assert.equal(restarted.accounts.get('player-001').coins, 1000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Drive configuration errors never silently select local storage', () => {
  const keys = ['ACCOUNT_STORAGE', 'GOOGLE_DRIVE_DB_FILE_ID', 'GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    keys.forEach((key) => { delete process.env[key]; });
    process.env.ACCOUNT_STORAGE = 'google-drive';
    assert.throws(() => createAccountStore('unused.json'));
    process.env.ACCOUNT_STORAGE = 'invalid';
    assert.throws(() => createAccountStore('unused.json'));
    process.env.ACCOUNT_STORAGE = 'local';
    assert.equal(createAccountStore('unused.json').kind, 'local');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
