'use strict';

require('reflect-metadata');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const {
  MIGHTY_KNIGHT_STATIC_PREFIX,
  MIGHTY_KNIGHT_ROOT,
  ALLOWED_MK_STATIC_EXT,
  guardMightyKnightStaticRequest,
} = require('../dist/server/src/app.module.js');

const {
  validateMkCommand,
  validateMkConfig,
  validateMkHero,
  MkRateLimiter,
  MK_SEC_LIMITS,
} = require('../dist/server/src/game/mk/security.js');

function makeTempDir(t, prefix = 'mk-pixel-sec-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeMockRes() {
  return {
    statusCode: 200,
    jsonBody: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

async function runGuard(req, rootDir) {
  const res = makeMockRes();
  let calledNext = false;
  await guardMightyKnightStaticRequest(req, res, () => {
    calledNext = true;
  }, rootDir);
  return { calledNext, status: res.statusCode, body: res.jsonBody };
}

describe('Mighty Knight 2.5D Pixel — Static & Input Security', () => {
  it('mounts /database-mighty-knight-pixel root with strict whitelisted extensions', () => {
    assert.equal(MIGHTY_KNIGHT_STATIC_PREFIX, '/database-mighty-knight-pixel');
    assert.ok(MIGHTY_KNIGHT_ROOT.endsWith('database-mighty-knight-pixel'));
    assert.ok(ALLOWED_MK_STATIC_EXT.has('.png'));
    assert.ok(ALLOWED_MK_STATIC_EXT.has('.wav'));
    assert.ok(ALLOWED_MK_STATIC_EXT.has('.json'));
    assert.ok(!ALLOWED_MK_STATIC_EXT.has('.js'));
    assert.ok(!ALLOWED_MK_STATIC_EXT.has('.md'));
  });

  it('allows valid GET/HEAD PNG/WAV/manifest.json and blocks non-GET, traversal, dotfiles, symlinks, extra JSON', async (t) => {
    const tmpRoot = makeTempDir(t);
    const outsideDir = makeTempDir(t, 'mk-outside-');
    fs.mkdirSync(path.join(tmpRoot, 'sprites', 'heroes'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'manifest.json'), '{"version":2}');
    fs.writeFileSync(path.join(tmpRoot, 'secret.json'), '{"secret":true}');
    fs.writeFileSync(path.join(tmpRoot, '.env'), 'SECRET=1');
    fs.writeFileSync(path.join(tmpRoot, 'sprites', 'heroes', 'knight.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(outsideDir, 'escape.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let escapeRequest = '/database-mighty-knight-pixel/sprites/heroes/link.png';
    try {
      fs.symlinkSync(path.join(outsideDir, 'escape.png'), path.join(tmpRoot, 'sprites', 'heroes', 'link.png'));
    } catch (error) {
      if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
      fs.symlinkSync(outsideDir, path.join(tmpRoot, 'sprites', 'heroes', 'outside'), 'junction');
      escapeRequest = '/database-mighty-knight-pixel/sprites/heroes/outside/escape.png';
    }

    // Valid GET / HEAD
    const okPng = await runGuard({ method: 'GET', originalUrl: '/database-mighty-knight-pixel/sprites/heroes/knight.png' }, tmpRoot);
    assert.equal(okPng.calledNext, true);
    const okManifest = await runGuard({ method: 'HEAD', originalUrl: '/database-mighty-knight-pixel/manifest.json' }, tmpRoot);
    assert.equal(okManifest.calledNext, true);

    // Non-GET/HEAD -> 405
    const postReq = await runGuard({ method: 'POST', originalUrl: '/database-mighty-knight-pixel/manifest.json' }, tmpRoot);
    assert.equal(postReq.calledNext, false);
    assert.equal(postReq.status, 405);

    // Path traversal / double encoding / null byte
    for (const badUrl of [
      '/database-mighty-knight-pixel/../package.json',
      '/database-mighty-knight-pixel/%2e%2e/package.json',
      '/database-mighty-knight-pixel/%252e%252e/package.json',
      '/database-mighty-knight-pixel/sprites/heroes/knight.png%00.txt',
      '/database-mighty-knight-pixel/.env',
      '/database-mighty-knight-pixel/secret.json',
      escapeRequest,
    ]) {
      const r = await runGuard({ method: 'GET', originalUrl: badUrl }, tmpRoot);
      assert.equal(r.calledNext, false, `Expected block for ${badUrl}`);
      assert.ok([400, 403, 404].includes(r.status), `Unexpected status ${r.status} for ${badUrl}`);
    }
  });

  it('validates all 11 MkCommand shapes and rejects prototype pollution / NaN / invalid slots & relics', () => {
    assert.equal(validateMkCommand({ t: 'move', mx: 1, my: -0.5, dir: 1 }).ok, true);
    assert.equal(validateMkCommand({ t: 'attack', hold: true }).ok, true);
    assert.equal(validateMkCommand({ t: 'skill', slot: 1 }).ok, true);
    assert.equal(validateMkCommand({ t: 'skill', slot: 4 }).ok, true);
    assert.equal(validateMkCommand({ t: 'ultimate' }).ok, true);
    assert.equal(validateMkCommand({ t: 'dash', mx: 1, my: 0 }).ok, true);
    assert.equal(validateMkCommand({ t: 'guard' }).ok, true);
    assert.equal(validateMkCommand({ t: 'switch_com', targetId: 'com:0' }).ok, true);
    assert.equal(validateMkCommand({ t: 'upgrade', target: 's4' }).ok, true);
    assert.equal(validateMkCommand({ t: 'pick_relic', relicId: 'vampiric_fang' }).ok, true);
    assert.equal(validateMkCommand({ t: 'skip_phase' }).ok, true);
    assert.equal(validateMkCommand({ t: 'resign' }).ok, true);

    // Invalid payloads
    assert.equal(validateMkCommand({ t: 'move', mx: NaN, my: 0 }).ok, false);
    assert.equal(validateMkCommand({ t: 'move', mx: Infinity, my: 0 }).ok, false);
    assert.equal(validateMkCommand({ t: 'skill', slot: 5 }).ok, false);
    assert.equal(validateMkCommand({ t: 'skill', slot: 0 }).ok, false);
    assert.equal(validateMkCommand({ t: 'pick_relic', relicId: 'fake_relic' }).ok, false);
    assert.equal(validateMkCommand({ t: 'upgrade', target: 'skill99' }).ok, false);
    assert.equal(validateMkCommand(JSON.parse('{"t":"guard","__proto__":{"x":1}}')).ok, false);
  });

  it('validates MkConfig (endless/boss_rush, 4 biomes) & MkHero and enforces 24 cmd/s rate limit', () => {
    const cfgOk = validateMkConfig({ playMode: 'boss_rush', comBots: 2, difficulty: 'nightmare', biome: 'citadel', allowSwitchCom: true }, 1);
    assert.equal(cfgOk.ok, true);
    assert.equal(cfgOk.config.playMode, 'boss_rush');
    assert.equal(cfgOk.config.biome, 'citadel');

    assert.equal(validateMkConfig({ playMode: 'invalid' }, 1).ok, false);
    assert.equal(validateMkConfig({ biome: 'space' }, 1).ok, false);
    assert.equal(validateMkHero({ heroId: 'lancer' }).ok, true);
    assert.equal(validateMkHero({ heroId: 'godmode' }).ok, false);

    const rl = new MkRateLimiter();
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 35; i++) {
      const r = rl.consume('p1', 'cmd', 1000);
      if (r.allowed) allowed++;
      else blocked++;
    }
    assert.equal(allowed, MK_SEC_LIMITS.CMD_BUCKET_CAP);
    assert.ok(blocked > 0);
  });
});
