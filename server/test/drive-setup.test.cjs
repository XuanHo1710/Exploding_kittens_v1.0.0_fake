const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { get } = require('node:http');
const setup = require('../scripts/setup-google-drive.cjs');
const importer = require('../scripts/import-google-drive.cjs');
const { parseDb } = require('../dist/server/src/store/db.service.js');

const empty = JSON.stringify({ version: 1, accounts: {} });
const account = {
  playerId: 'player_01', name: 'Alice', nameKey: 'alice',
  pinHash: 'a'.repeat(64), pinSalt: 'b'.repeat(24), tokens: ['c'.repeat(64)],
  coins: 1000, games: 0, wins: 0, createdAt: 1, updatedAt: 1,
};
const populated = JSON.stringify({ version: 1, accounts: { [account.playerId]: account } }, null, 2);

function tempSource(t, content) {
  const directory = mkdtempSync(join(tmpdir(), 'meono-drive-helper-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'db.json');
  writeFileSync(file, content);
  return { directory, file };
}

function request(url) {
  return new Promise((resolveRequest, rejectRequest) => {
    get(url, { agent: false }, (response) => {
      response.resume();
      response.on('end', () => resolveRequest(response));
    }).on('error', rejectRequest);
  });
}

test('setup accepts only documented flags', () => {
  assert.deepEqual(setup.parseArgs(['--create-file']), { help: false, createFile: true });
  assert.deepEqual(setup.parseArgs(['--help']), { help: true, createFile: false });
  assert.throws(() => setup.parseArgs(['--unknown']), setup.SetupError);
});

test('env updates preserve comments, unrelated values and CRLF without leftover temporary secrets', (t) => {
  const { directory } = tempSource(t, empty);
  const file = join(directory, '.env');
  writeFileSync(file, '# keep\r\nPORT=3001\r\nexport GOOGLE_DRIVE_REFRESH_TOKEN=old\r\nOTHER="x # y"\r\n');
  setup.updateEnv(file, { GOOGLE_DRIVE_REFRESH_TOKEN: 'mock$#token', ACCOUNT_STORAGE: 'google-drive' });
  const result = readFileSync(file, 'utf8');
  assert.equal(result, '# keep\r\nPORT=3001\r\nGOOGLE_DRIVE_REFRESH_TOKEN="mock$#token"\r\nOTHER="x # y"\r\nACCOUNT_STORAGE="google-drive"\r\n');
  assert.deepEqual(readdirSync(directory).sort(), ['.env', 'db.json']);
  assert.throws(() => setup.updateEnv(file, { GOOGLE_DRIVE_REFRESH_TOKEN: 'bad\nvalue' }), setup.SetupError);
  assert.equal(readFileSync(file, 'utf8'), result);
});

test('OAuth loopback callback rejects wrong state/path before accepting the real code', async (t) => {
  const receiver = await setup.createAuthorizationReceiver('mock-state', 3000);
  t.after(() => receiver.close());
  assert.equal(new URL(receiver.redirectUri).hostname, '127.0.0.1');
  assert.equal((await request(`${receiver.redirectUri}/?state=wrong&code=bad`)).statusCode, 400);
  assert.equal((await request(`${receiver.redirectUri}/other?state=mock-state&code=bad`)).statusCode, 404);
  const accepted = await request(`${receiver.redirectUri}/?state=mock-state&code=real-code`);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.headers['cache-control'], 'no-store');
  assert.equal(await receiver.waitForCode, 'real-code');
});

test('OAuth denial and timeout stop waiting without exposing callback details', async () => {
  const denied = await setup.createAuthorizationReceiver('denied', 3000);
  const deniedResult = assert.rejects(denied.waitForCode, setup.SetupError);
  assert.equal((await request(`${denied.redirectUri}/?state=denied&error=access_denied`)).statusCode, 400);
  await deniedResult;
  const expired = await setup.createAuthorizationReceiver('expired', 20);
  await assert.rejects(expired.waitForCode, setup.SetupError);
});

test('file creation uploads only an empty account DB and does not set public sharing or retry POST', async () => {
  const id = await setup.createEmptyDb({ request: async (opts) => {
    assert.equal(opts.method, 'POST');
    assert.equal(opts.retry, false);
    assert.ok(opts.url.includes('uploadType=multipart'));
    assert.ok(opts.data.includes('"accounts": {}'));
    assert.ok(!opts.data.includes('permissions'));
    assert.ok(!opts.data.includes(account.pinHash));
    return { data: { id: 'mock_file-id' } };
  } });
  assert.equal(id, 'mock_file-id');
  await assert.rejects(setup.createEmptyDb({ request: async () => ({ data: {} }) }), setup.SetupError);
});

test('import flags resolve optional source and reject missing/duplicate/unrecognized arguments', () => {
  assert.equal(importer.parseArgs([]).source, importer.DEFAULT_SOURCE);
  assert.equal(importer.parseArgs(['--source', 'backup with spaces.json']).source, resolve('backup with spaces.json'));
  assert.equal(importer.parseArgs(['--help']).help, true);
  for (const args of [['--source'], ['--unknown'], ['--source', 'a', '--source', 'b']]) {
    assert.throws(() => importer.parseArgs(args), importer.ImportError);
  }
});

test('import validates source and empty target, writes using its version and keeps source bytes unchanged', async (t) => {
  const { file } = tempSource(t, populated);
  const calls = [];
  const count = await importer.importAccounts(file, {
    read: async () => ({ content: empty, version: '42' }),
    write: async (content, version) => { calls.push({ content, version }); return '43'; },
  }, parseDb);
  assert.equal(count, 1);
  assert.deepEqual(calls, [{ content: populated, version: '42' }]);
  assert.equal(readFileSync(file, 'utf8'), populated);
});

test('import never overwrites populated or malformed remote accounts', async (t) => {
  const { file } = tempSource(t, populated);
  for (const content of [populated, 'private-invalid-json', '{"version":1,"accounts":[]}']) {
    let writes = 0;
    await assert.rejects(importer.importAccounts(file, {
      read: async () => ({ content, version: '1' }),
      write: async () => { writes += 1; },
    }, parseDb), importer.ImportError);
    assert.equal(writes, 0);
  }
  assert.equal(readFileSync(file, 'utf8'), populated);
});

test('invalid, missing and oversized source never contacts Drive', async (t) => {
  for (const content of ['private-invalid-json', '{"version":1,"accounts":[]}', ' '.repeat(5_000_001)]) {
    const { file } = tempSource(t, content);
    let reads = 0;
    const store = { read: async () => { reads += 1; throw new Error('must not read'); } };
    await assert.rejects(importer.importAccounts(file, store, parseDb), importer.ImportError);
    assert.equal(reads, 0);
  }
  const { directory } = tempSource(t, empty);
  await assert.rejects(importer.importAccounts(join(directory, 'missing.json'), {}, parseDb), importer.ImportError);
});

test('empty source does not write; failed upload leaves local data unchanged and CLI error hides secrets', async (t) => {
  const { file } = tempSource(t, empty);
  const store = {
    read: async () => ({ content: empty, version: '1' }),
    write: async () => { throw new Error('private-refresh-token-and-account-data'); },
  };
  assert.equal(await importer.importAccounts(file, store, parseDb), 0);
  writeFileSync(file, populated);
  await assert.rejects(importer.importAccounts(file, store, parseDb), (error) => {
    assert.ok(!importer.errorMessage(error).includes('private-refresh-token-and-account-data'));
    return true;
  });
  assert.equal(readFileSync(file, 'utf8'), populated);
});
