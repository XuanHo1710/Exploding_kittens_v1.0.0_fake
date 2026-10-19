const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { DriveJsonStore, DriveStoreError } = require('../dist/server/src/store/drive-json.store.js');

const initial = JSON.stringify({ version: 1, accounts: [] });
const changed = JSON.stringify({ version: 1, accounts: [{ id: 'account-1' }] });
const digest = (value) => createHash('md5').update(value).digest('hex');
const metadata = (content = initial, version = '1', override = {}) => ({
  version,
  size: String(Buffer.byteLength(content)),
  md5Checksum: digest(content),
  mimeType: 'application/json',
  trashed: false,
  capabilities: { canEdit: true },
  ...override,
});
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status });
const safeError = (code, uncertain) => (error) => {
  assert.ok(error instanceof DriveStoreError);
  assert.equal(error.code, code);
  if (uncertain !== undefined) assert.equal(error.uncertain, uncertain);
  return true;
};

function fixture(handler, options = {}) {
  const calls = [];
  const store = new DriveJsonStore({
    fileId: 'test_private_file',
    auth: { getAccessToken: async () => ({ token: 'test-token' }) },
    fetch: async (url, request) => {
      const call = { url: new URL(url), ...request };
      calls.push(call);
      return handler(call, calls.length);
    },
    retries: 0,
    retryDelayMs: 0,
    ...options,
  });
  return { store, calls };
}

test('reads an existing private blob and verifies version, size and checksum', async () => {
  const { store, calls } = fixture(({ url }) => url.searchParams.get('alt') === 'media'
    ? new Response(initial) : jsonResponse(metadata()));
  assert.deepEqual(await store.read(), { content: initial, version: '1' });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ url }) => url.searchParams.get('supportsAllDrives') === 'true'));
  assert.ok(calls.every(({ headers }) => headers.Authorization === 'Bearer test-token'));
  assert.ok(calls.every(({ redirect }) => redirect === 'error'));
});

test('checks the prior version and confirms a media PATCH before returning success', async () => {
  const { store, calls } = fixture(({ method }) => method === 'PATCH'
    ? jsonResponse({ version: '2', md5Checksum: digest(changed) }) : jsonResponse(metadata()));
  assert.equal(await store.write(changed, '1'), '2');
  assert.equal(calls.length, 2);
  const upload = calls[1];
  assert.equal(upload.url.pathname, '/upload/drive/v3/files/test_private_file');
  assert.equal(upload.url.searchParams.get('uploadType'), 'media');
  assert.equal(upload.method, 'PATCH');
  assert.equal(upload.body, changed);
  assert.equal(upload.headers['Content-Type'], 'application/json; charset=utf-8');
});

test('stale version never uploads user data', async () => {
  const { store, calls } = fixture(() => jsonResponse(metadata(initial, '2')));
  await assert.rejects(store.write(changed, '1'), safeError('CONFLICT', false));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('a change during download fails instead of publishing an inconsistent snapshot', async () => {
  const { store } = fixture(({ url }, index) => url.searchParams.get('alt') === 'media'
    ? new Response(initial) : jsonResponse(metadata(initial, index === 1 ? '1' : '2')));
  await assert.rejects(store.read(), safeError('CONFLICT'));
});

test('bad downloaded checksum fails even when the version is unchanged', async () => {
  const { store } = fixture(({ url }) => url.searchParams.get('alt') === 'media'
    ? new Response(changed) : jsonResponse(metadata()));
  await assert.rejects(store.read(), safeError('CONFLICT'));
});

test('malformed remote JSON is rejected without exposing its content', async () => {
  const invalid = 'secret customer payload';
  const { store } = fixture(({ url }) => url.searchParams.get('alt') === 'media'
    ? new Response(invalid) : jsonResponse(metadata(invalid)));
  await assert.rejects(store.read(), (error) => {
    assert.equal(error.code, 'INVALID_DATA');
    assert.ok(!String(error).includes(invalid));
    return true;
  });
});

test('oversized metadata prevents downloading the blob', async () => {
  const { store, calls } = fixture(() => jsonResponse(metadata(initial, '1', { size: '5000001' })));
  await assert.rejects(store.read(), safeError('TOO_LARGE'));
  assert.equal(calls.length, 1);
});

test('streaming download enforces its limit even without Content-Length', async () => {
  const { store } = fixture(({ url }) => url.searchParams.get('alt') === 'media'
    ? new Response(' '.repeat(5_000_001)) : jsonResponse(metadata()));
  await assert.rejects(store.read(), safeError('TOO_LARGE'));
});

test('malformed or oversized local JSON never makes a request', async () => {
  const { store, calls } = fixture(() => { throw new Error('must not fetch'); });
  await assert.rejects(store.write('{', '1'), safeError('INVALID_DATA'));
  await assert.rejects(store.write(JSON.stringify('x'.repeat(5_000_000)), '1'), safeError('TOO_LARGE'));
  assert.equal(calls.length, 0);
});

test('missing file, permission failure and authentication failure are not retried', async () => {
  for (const [status, code] of [[404, 'NOT_FOUND'], [403, 'PERMISSION'], [401, 'AUTH']]) {
    const { store, calls } = fixture(() => jsonResponse({ error: 'private body secret' }, status), { retries: 3 });
    await assert.rejects(store.read(), (error) => {
      assert.equal(error.code, code);
      assert.ok(!String(error).includes('private body secret'));
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test('native Google documents, trash and read-only files are rejected', async () => {
  for (const [override, code] of [
    [{ mimeType: 'application/vnd.google-apps.document' }, 'INVALID_DATA'],
    [{ trashed: true }, 'INVALID_DATA'],
    [{ capabilities: { canEdit: false } }, 'PERMISSION'],
    [{ capabilities: {} }, 'PERMISSION'],
    [{ md5Checksum: null }, 'INVALID_DATA'],
  ]) {
    const { store } = fixture(() => jsonResponse(metadata(initial, '1', override)));
    await assert.rejects(store.read(), safeError(code));
  }
});

test('transient GET failure retries within its configured bound', async () => {
  const { store, calls } = fixture(({ url }, index) => {
    if (index === 1) return jsonResponse({}, 503);
    return url.searchParams.get('alt') === 'media' ? new Response(initial) : jsonResponse(metadata());
  }, { retries: 1 });
  assert.equal((await store.read()).content, initial);
  assert.equal(calls.length, 4);
  const unavailable = fixture(() => jsonResponse({}, 503), { retries: 2 });
  await assert.rejects(unavailable.store.read(), safeError('UNAVAILABLE'));
  assert.equal(unavailable.calls.length, 3);
});

test('upload quota rejection retries with a fresh version check', async () => {
  let patches = 0;
  const { store, calls } = fixture(({ method }) => {
    if (method !== 'PATCH') return jsonResponse(metadata());
    patches += 1;
    return patches === 1 ? jsonResponse({}, 429)
      : jsonResponse({ version: '2', md5Checksum: digest(changed) });
  }, { retries: 1 });
  assert.equal(await store.write(changed, '1'), '2');
  assert.equal(calls.length, 4);
  assert.equal(patches, 2);
});

test('lost upload response is reconciled when the committed checksum matches', async () => {
  let committed = false;
  const { store, calls } = fixture(({ method }) => {
    if (method === 'PATCH') {
      committed = true;
      throw new Error('connection contains private access token');
    }
    return jsonResponse(committed ? metadata(changed, '2') : metadata());
  });
  assert.equal(await store.write(changed, '1'), '2');
  assert.equal(calls.filter(({ method }) => method === 'PATCH').length, 1);
});

test('ambiguous upload is never replayed and reports uncertain state', async () => {
  const { store, calls } = fixture(({ method }) => {
    if (method === 'PATCH') throw new Error('private token');
    return jsonResponse(metadata());
  }, { retries: 3 });
  await assert.rejects(store.write(changed, '1'), (error) => {
    assert.equal(error.code, 'WRITE_UNCERTAIN');
    assert.equal(error.uncertain, true);
    assert.ok(!String(error).includes('private token'));
    return true;
  });
  assert.equal(calls.filter(({ method }) => method === 'PATCH').length, 1);
});

test('a server upload error followed by conflicting content fails closed', async () => {
  let attempted = false;
  const other = '{"accounts":[{"id":"other"}]}';
  const { store } = fixture(({ method }) => {
    if (method === 'PATCH') {
      attempted = true;
      return jsonResponse({}, 500);
    }
    return jsonResponse(attempted ? metadata(other, '2') : metadata());
  });
  await assert.rejects(store.write(changed, '1'), safeError('CONFLICT', true));
});

test('invalid upload confirmation is reconciled before success', async () => {
  let committed = false;
  const { store } = fixture(({ method }) => {
    if (method === 'PATCH') {
      committed = true;
      return new Response('broken upload response');
    }
    return jsonResponse(committed ? metadata(changed, '2') : metadata());
  });
  assert.equal(await store.write(changed, '1'), '2');
});

test('authentication errors are sanitized and never reach fetch', async () => {
  const { store, calls } = fixture(() => { throw new Error('must not fetch'); }, {
    auth: { getAccessToken: async () => { throw new Error('refresh-token-secret'); } },
  });
  await assert.rejects(store.read(), (error) => {
    assert.equal(error.code, 'AUTH');
    assert.ok(!String(error).includes('refresh-token-secret'));
    return true;
  });
  assert.equal(calls.length, 0);
});

test('authentication and transport both have a deadline', async () => {
  const hangingAuth = fixture(() => { throw new Error('must not fetch'); }, {
    auth: { getAccessToken: () => new Promise(() => {}) }, timeoutMs: 5,
  });
  await assert.rejects(hangingAuth.store.read(), safeError('UNAVAILABLE'));
  assert.equal(hangingAuth.calls.length, 0);
  const hangingFetch = fixture(() => new Promise(() => {}), { timeoutMs: 5 });
  await assert.rejects(hangingFetch.store.read(), safeError('UNAVAILABLE'));
});

test('malformed file IDs and retry settings are rejected at construction', () => {
  const auth = { getAccessToken: async () => 'token' };
  for (const fileId of ['', 'https://drive.google.com/file/d/abc', '../file', ' file ']) {
    assert.throws(() => new DriveJsonStore({ fileId, auth }), safeError('CONFIG'));
  }
  for (const options of [{ retries: -1 }, { retries: 6 }, { timeoutMs: 0 }, { retryDelayMs: -1 }]) {
    assert.throws(() => new DriveJsonStore({ fileId: 'file', auth, ...options }), safeError('CONFIG'));
  }
});

test('partial and mixed credential configuration fails closed', () => {
  const keys = ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(() => new DriveJsonStore({ fileId: 'file' }), safeError('CONFIG'));
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'id';
    assert.throws(() => new DriveJsonStore({ fileId: 'file' }), safeError('CONFIG'));
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'refresh';
    assert.doesNotThrow(() => new DriveJsonStore({ fileId: 'file' }));
    process.env.GOOGLE_APPLICATION_CREDENTIALS = 'credentials.json';
    assert.throws(() => new DriveJsonStore({ fileId: 'file' }), safeError('CONFIG'));
    for (const key of keys.slice(0, 3)) delete process.env[key];
    assert.doesNotThrow(() => new DriveJsonStore({ fileId: 'file' }));
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
