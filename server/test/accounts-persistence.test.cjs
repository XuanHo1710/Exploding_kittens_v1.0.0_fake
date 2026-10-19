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

// ---------- Chế độ Google Drive: Drive là nơi lưu chính, phải xác nhận trước khi báo thành công ----------

/** Drive giả: version tăng mỗi lần ghi, ghi với version cũ thì CONFLICT (giống DriveJsonStore). */
class FakeDriveStore {
  kind = 'google-drive';
  constructor(cacheDir, content = '{"version":1,"accounts":{}}') {
    this.cacheFile = join(cacheDir, 'db.json');
    this.content = content;
    this.version = '10';
    this.writes = 0;
    this.failure = undefined;
  }
  async read() { return { content: this.content, version: this.version }; }
  async write(content, version) {
    this.writes++;
    if (this.failure) { const f = this.failure; if (!f.sticky) this.failure = undefined; throw f; }
    if (version !== this.version) throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
    this.content = content;
    this.version = String(Number(this.version) + 1);
    return this.version;
  }
  /** Server khác ghi thẳng lên Drive */
  external(mutate) {
    const db = JSON.parse(this.content);
    mutate(db);
    this.content = JSON.stringify(db, null, 2);
    this.version = String(Number(this.version) + 1);
  }
}

const driveFixture = async (content) => {
  const dir = mkdtempSync(join(tmpdir(), 'meono-drive-'));
  const store = new FakeDriveStore(dir, content);
  const { db, accounts } = await fixture(store);
  return { dir, store, db, accounts };
};

test('drive: first registration succeeds only after Drive confirms; a failed write is rolled back', async () => {
  const { dir, store, db, accounts } = await driveFixture();
  try {
    store.failure = Object.assign(new Error('403'), { code: 'PERMISSION' });
    await assert.rejects(register(accounts), (e) => e.getStatus() === 503);
    assert.equal(db.account('player-001'), undefined);
    assert.deepEqual(JSON.parse(store.content).accounts, {});
    // thử lại: lần này Drive nhận
    const auth = await register(accounts);
    assert.equal(auth.account.coins, 1000);
    assert.equal(JSON.parse(store.content).accounts['player-001'].name, 'Mèo Một');
    // bản sao cục bộ chỉ chứa dữ liệu Drive đã xác nhận
    assert.equal(JSON.parse(readFileSync(store.cacheFile, 'utf8')).accounts['player-001'].name, 'Mèo Một');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drive: CONFLICT from another server reloads Drive and re-runs the change (no lost accounts, names stay unique)', async () => {
  const { dir, store, accounts } = await driveFixture();
  try {
    await register(accounts, 'player-001', 'Mèo Một');
    // server khác tạo "Mèo Hai" ngay lúc này
    const other = parseDb(store.content).accounts['player-001'];
    store.external((db) => { db.accounts['other-0002'] = { ...other, playerId: 'other-0002', name: 'Mèo Hai', nameKey: 'mèo hai' }; });
    const auth = await register(accounts, 'player-003', 'Mèo Ba');
    assert.equal(auth.account.name, 'Mèo Ba');
    assert.deepEqual(Object.keys(JSON.parse(store.content).accounts).sort(), ['other-0002', 'player-001', 'player-003']);
    // tên do server khác vừa tạo cũng bị chặn trùng
    store.external((db) => { db.accounts['other-0004'] = { ...other, playerId: 'other-0004', name: 'Mèo Tư', nameKey: 'mèo tư' }; });
    await assert.rejects(register(accounts, 'player-005', 'mèo tư'), (e) => e.getStatus() === 409);
    assert.equal(JSON.parse(store.content).accounts['player-005'], undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drive: startup uploads local-only accounts and keeps the local file when Drive rejects', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'meono-drive-'));
  try {
    const seed = new FakeDriveStore(dir);
    const { accounts } = await fixture(seed);
    await register(accounts, 'local-0001', 'Mèo Cũ');
    const localContent = readFileSync(seed.cacheFile, 'utf8');
    // Drive mới, trống; Drive từ chối ghi → giữ nguyên file cục bộ
    const failing = new FakeDriveStore(dir);
    failing.failure = Object.assign(new Error('offline'), { code: 'UNAVAILABLE', sticky: true });
    const a = await fixture(failing);
    assert.equal(a.db.account('local-0001'), undefined);
    assert.equal(readFileSync(seed.cacheFile, 'utf8'), localContent);
    // Drive hoạt động → tài khoản cục bộ được đưa lên và chỉ có hiệu lực sau khi Drive xác nhận
    const ok = new FakeDriveStore(dir);
    const b = await fixture(ok);
    assert.equal(b.db.account('local-0001').name, 'Mèo Cũ');
    assert.equal(JSON.parse(ok.content).accounts['local-0001'].name, 'Mèo Cũ');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drive: an uncertain write blocks, then the next change reloads Drive and continues', async () => {
  const { dir, store, db, accounts } = await driveFixture();
  try {
    await register(accounts, 'player-001', 'Mèo Một');
    // upload thật ra ĐÃ tới Drive nhưng mất phản hồi
    const realWrite = store.write.bind(store);
    store.write = async (content, version) => { await realWrite(content, version); throw Object.assign(new Error('lost'), { code: 'WRITE_UNCERTAIN', uncertain: true }); };
    await assert.rejects(accounts.claimDaily('player-001'), (e) => e.getStatus() === 503);
    store.write = realWrite;
    // thao tác kế tiếp tự đọc lại Drive: thấy xu ngày đã được nhận (không cộng 2 lần)
    assert.equal(await accounts.claimDaily('player-001'), false);
    assert.equal(db.account('player-001').coins, 1500);
    const auth = await register(accounts, 'player-002', 'Mèo Hai');
    assert.equal(auth.account.name, 'Mèo Hai');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
