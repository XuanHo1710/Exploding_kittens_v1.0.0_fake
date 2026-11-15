'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const shared = require('../dist/shared/src/index.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const MANIFEST_PATH = path.join(DB_ROOT, 'manifest.json');
const LICENSES_PATH = path.join(DB_ROOT, 'LICENSES.md');
const SOURCES_PATH = path.join(DB_ROOT, 'sources.json');
const VERIFY_SCRIPT = path.join(REPO_ROOT, 'scripts/bansung/verify-assets.mjs');
const LIB_PACK_SCRIPT = path.join(REPO_ROOT, 'scripts/bansung/lib-pack.mjs');
const CLIENT_SPRITES_TS = path.join(REPO_ROOT, 'client/src/bansung/sprites.ts');
const CLIENT_SOUND_TS = path.join(REPO_ROOT, 'client/src/bansung/sound.ts');

let verifyMod;
let libPack;
let manifest;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  out.sort();
  return out;
}

function createCleanFixture(lib, tmpDir) {
  const dbDir = path.join(tmpDir, 'database-ban-sung');
  fs.mkdirSync(path.join(dbDir, 'normalized/weapons'), { recursive: true });
  fs.mkdirSync(path.join(dbDir, 'audio/sfx/weapons'), { recursive: true });

  // 2 frames of 16x16 => 32x16 PNG strip
  const rgba = new Uint8Array(32 * 16 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 24;
    rgba[i + 1] = 20;
    rgba[i + 2] = 37;
    rgba[i + 3] = 255;
  }
  const pngBuf = lib.encodePng(32, 16, rgba);
  const spriteRel = 'normalized/weapons/test_pistol.png';
  fs.writeFileSync(path.join(dbDir, spriteRel), pngBuf);

  // Tiny 0.1s 44.1kHz mono PCM WAV
  const samples = new Float32Array(4410);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / 44100);
  }
  const wavBuf = lib.encodeWav(samples, { sampleRate: 44100 });
  const audioRel = 'audio/sfx/weapons/test_shot.wav';
  fs.writeFileSync(path.join(dbDir, audioRel), wavBuf);

  const manifestObj = {
    version: 1,
    generatedAt: '2026-11-14T00:00:00.000Z',
    defaults: { baseTilePx: 32, nativeFacing: 'right', simTickHz: 30 },
    sprites: {
      test_pistol: {
        path: spriteRel,
        category: 'weapon',
        frames: 2,
        cellW: 16,
        cellH: 16,
        offX: -8,
        offY: -8,
        fps: 10,
        loop: true,
        pivot: { anchorX: 4, anchorY: 8, muzzleX: 14, muzzleY: 7 },
        fallback: { shape: 'rect', color: '#8899aa', accent: '#ffffff' },
        sourceId: 'generated_synth',
      },
    },
    audio: {
      test_shot: {
        path: audioRel,
        kind: 'sfx',
        durationMs: 100,
        gain: 0.75,
        loop: false,
        synthFallback: 'shot_pistol',
        sourceId: 'generated_synth',
      },
    },
  };

  const licensesText = [
    '# Fixture Licenses',
    '',
    '## Source Packs',
    '',
    '| `sourceId` | Pack | URL | License |',
    '|---|---|---|---|',
    '| `generated_synth` | Generated Synth | internal://synth | `GENERATED-SYNTH` |',
    '',
    '## Asset Provenance',
    '',
    '| Asset Path | Source ID | Notes |',
    '|---|---|---|',
    `| \`${spriteRel}\` | \`generated_synth\` | Fixture sprite |`,
    `| \`${audioRel}\` | \`generated_synth\` | Fixture audio |`,
    '',
    '## Required Attributions',
    '',
    'None required for CC0/INTERNAL/GENERATED-SYNTH.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(dbDir, 'manifest.json'), JSON.stringify(manifestObj, null, 2));
  fs.writeFileSync(path.join(dbDir, 'LICENSES.md'), licensesText);
  return { dbDir, manifestObj, spriteRel, audioRel };
}

before(async () => {
  verifyMod = await import(pathToFileURL(VERIFY_SCRIPT).href);
  libPack = await import(pathToFileURL(LIB_PACK_SCRIPT).href);
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
});

describe('Ban Sung Asset Audit Suite', () => {
  it('passes full verifyBansungAssets() audit with zero errors across sprites, audio, licenses, and shared refs', () => {
    const sharedRefs = verifyMod.collectSharedBansungRefs(shared);
    const report = verifyMod.verifyBansungAssets({
      repoRoot: REPO_ROOT,
      sharedRefs,
    });

    assert.equal(report.passed, true, `Audit failed: ${JSON.stringify(report, null, 2)}`);
    assert.ok(report.spritesChecked >= 400, `Expected >=400 sprites, got ${report.spritesChecked}`);
    assert.ok(report.audioChecked >= 240, `Expected >=240 audio entries, got ${report.audioChecked}`);
    assert.ok(report.uniquePngFilesChecked >= 220);
    assert.ok(report.uniqueAudioFilesChecked >= 180);

    for (const bucket of [
      'missingFiles',
      'badPngHeaders',
      'badAudioHeaders',
      'unlicensedSources',
      'unreferencedFiles',
      'schemaErrors',
      'dimErrors',
      'pivotErrors',
      'fallbackErrors',
      'referenceErrors',
      'miragineBackupErrors',
    ]) {
      assert.deepEqual(report[bucket], [], `Expected ${bucket} to be empty`);
    }
  });

  it('runs verify-assets.mjs CLI directly and exits 0 with valid JSON summary', () => {
    const stdout = execFileSync(process.execPath, [VERIFY_SCRIPT, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.spritesChecked, Object.keys(manifest.sprites).length);
    assert.equal(parsed.audioChecked, Object.keys(manifest.audio).length);
  });

  it('verifies 100% PNG/WAV/OGG/MP3 magic bytes, non-zero file sizes, and deep PNG/WAV decoding on disk', () => {
    const seenPng = new Set();
    for (const [key, entry] of Object.entries(manifest.sprites)) {
      if (seenPng.has(entry.path)) continue;
      seenPng.add(entry.path);
      const full = path.join(DB_ROOT, entry.path);
      assert.ok(fs.existsSync(full), `Missing sprite file for ${key}: ${entry.path}`);
      const stat = fs.statSync(full);
      assert.ok(stat.size > 0, `Empty PNG file for ${key}: ${entry.path}`);

      const buf = fs.readFileSync(full);
      assert.equal(libPack.detectMagicFormat(buf), 'png', `Bad PNG magic for ${entry.path}`);
      const hdr = libPack.inspectPngHeader(buf);
      const decoded = libPack.decodePng(buf);
      assert.equal(decoded.width, hdr.width);
      assert.equal(decoded.height, hdr.height);
      assert.equal(decoded.data.length, hdr.width * hdr.height * 4);
    }

    const seenAudio = new Set();
    for (const [key, entry] of Object.entries(manifest.audio)) {
      const files = [
        entry.path,
        ...(entry.fallbackPath ? [entry.fallbackPath] : []),
        ...(Array.isArray(entry.variations) ? entry.variations : []),
      ];
      for (const rel of files) {
        if (seenAudio.has(rel)) continue;
        seenAudio.add(rel);
        const full = path.join(DB_ROOT, rel);
        assert.ok(fs.existsSync(full), `Missing audio file for ${key}: ${rel}`);
        const stat = fs.statSync(full);
        assert.ok(stat.size > 0, `Empty audio file for ${key}: ${rel}`);

        const buf = fs.readFileSync(full);
        const ext = path.extname(rel).slice(1).toLowerCase();
        assert.ok(['wav', 'ogg', 'mp3'].includes(ext), `Unexpected audio extension ${rel}`);
        assert.equal(libPack.detectMagicFormat(buf), ext, `Magic byte mismatch for ${rel}`);
        if (ext === 'wav') {
          const wav = libPack.parseWav(buf);
          assert.ok(wav.sampleRate >= 8000, `Unexpected sample rate on ${rel}`);
          assert.ok(wav.samplesPerChannel > 0 && wav.durationMs > 0, `Empty WAV PCM on ${rel}`);
        }
      }
    }
  });

  it('verifies zero missing files, zero unreferenced runtime/source files, and complete shared/client reference coverage', () => {
    assert.equal(fs.existsSync(path.join(DB_ROOT, '_cache')), false, '_cache must be absent');

    const refPaths = new Set();
    for (const s of Object.values(manifest.sprites)) refPaths.add(s.path);
    for (const a of Object.values(manifest.audio)) {
      refPaths.add(a.path);
      if (a.fallbackPath) refPaths.add(a.fallbackPath);
      if (Array.isArray(a.variations)) a.variations.forEach((v) => refPaths.add(v));
    }

    const allFiles = walkFiles(DB_ROOT).map((f) => path.relative(DB_ROOT, f).split(path.sep).join('/'));
    const normalizedDisk = allFiles.filter((r) => r.startsWith('normalized/'));
    const audioMediaDisk = allFiles.filter((r) => r.startsWith('audio/') && !r.endsWith('.json'));
    const unrefNorm = normalizedDisk.filter((r) => !refPaths.has(r));
    const unrefAudio = audioMediaDisk.filter((r) => !refPaths.has(r));
    assert.deepEqual(unrefNorm, [], 'Found unreferenced normalized sprites');
    assert.deepEqual(unrefAudio, [], 'Found unreferenced audio media');

    // Cross-check shared registries & client TIER1_CLIP_KEYS
    for (const id of shared.BANSUNG_HERO_IDS) {
      for (const state of Object.keys(shared.BANSUNG_HEROES[id].anims)) {
        assert.ok(manifest.sprites[`hero_${id}_${state}`], `Missing manifest hero sprite hero_${id}_${state}`);
      }
      const fb = shared.BANSUNG_HEROES[id].miragineFallback;
      if (fb) {
        const unitLower = fb.unitId.toLowerCase();
        for (const state of Object.keys(fb.anims)) {
          assert.ok(manifest.sprites[`miragine_${unitLower}_${state}`], `Missing Miragine fallback miragine_${unitLower}_${state}`);
        }
      }
    }
    for (const id of shared.BANSUNG_WEAPON_IDS) {
      const w = shared.BANSUNG_WEAPONS[id];
      assert.ok(manifest.sprites[w.spriteKey], `Missing weapon spriteKey ${w.spriteKey}`);
      assert.ok(manifest.sprites[w.hotbarIcon], `Missing weapon hotbarIcon ${w.hotbarIcon}`);
      assert.ok(manifest.audio[w.sfxFire], `Missing weapon sfxFire ${w.sfxFire}`);
      if (w.sfxReload) assert.ok(manifest.audio[w.sfxReload], `Missing weapon sfxReload ${w.sfxReload}`);
      if (w.sfxHit) assert.ok(manifest.audio[w.sfxHit], `Missing weapon sfxHit ${w.sfxHit}`);
    }
    for (const id of shared.BANSUNG_GADGET_IDS) {
      const g = shared.BANSUNG_GADGETS[id];
      assert.ok(manifest.sprites[g.spriteKey], `Missing gadget spriteKey ${g.spriteKey}`);
      assert.ok(manifest.audio[g.sfxDeploy], `Missing gadget sfxDeploy ${g.sfxDeploy}`);
      assert.ok(manifest.audio[g.sfxTrigger], `Missing gadget sfxTrigger ${g.sfxTrigger}`);
    }
    for (const biome of ['desert', 'crypt', 'cyber']) {
      const map = shared.generateArenaLayout(biome, 0);
      for (const prop of map.props) {
        assert.ok(manifest.sprites[prop.spriteId], `Missing map prop spriteId ${prop.spriteId}`);
      }
    }
    const tier1Keys = verifyMod.parseClientTier1SpriteKeys(fs.readFileSync(CLIENT_SPRITES_TS, 'utf8'));
    assert.ok(tier1Keys.length >= 60, `Expected >=60 Tier1 keys, got ${tier1Keys.length}`);
    for (const k of tier1Keys) {
      assert.ok(manifest.sprites[k], `Missing TIER1_CLIP_KEYS entry "${k}" in manifest.sprites`);
    }
  });

  it('verifies valid AnimMeta dims, anchor offsets, weapon pivots, and shared shadow/hero/pet parity', () => {
    assert.equal(manifest.version, 1);
    assert.deepEqual(manifest.defaults, { baseTilePx: 32, nativeFacing: 'right', simTickHz: 30 });

    for (const [key, s] of Object.entries(manifest.sprites)) {
      const hdr = libPack.inspectPngHeader(fs.readFileSync(path.join(DB_ROOT, s.path)));
      assert.equal(hdr.width, s.frames * s.cellW, `Sheet width mismatch on ${key}`);
      assert.equal(hdr.height, s.cellH, `Sheet height mismatch on ${key}`);
      assert.ok(Number.isInteger(s.offX) && Number.isInteger(s.offY), `Non-integer offsets on ${key}`);
      assert.ok(s.offX <= 0 && s.offY <= 0, `Positive offset on ${key}`);
      if (s.category === 'weapon') {
        assert.ok(s.pivot, `Weapon ${key} must have pivot`);
      }
      if (s.pivot) {
        assert.ok(
          s.pivot.anchorX >= 0 && s.pivot.anchorX <= s.cellW &&
          s.pivot.anchorY >= 0 && s.pivot.anchorY <= s.cellH,
          `Out-of-bounds pivot anchor on ${key}`,
        );
      }
    }

    // Shadow parity with shared BANSUNG_SHADOW_META [1, 38, 16, -19, -8]
    const sh = manifest.sprites.shadow;
    assert.ok(sh, 'Missing manifest.sprites.shadow');
    assert.deepEqual([sh.frames, sh.cellW, sh.cellH, sh.offX, sh.offY], [...shared.BANSUNG_SHADOW_META]);

    // Hero + Pet shared AnimMeta parity
    for (const id of shared.BANSUNG_HERO_IDS) {
      for (const [state, anim] of Object.entries(shared.BANSUNG_HEROES[id].anims)) {
        const m = manifest.sprites[`hero_${id}_${state}`];
        assert.equal(m.frames, anim.frames, `Hero frame count mismatch hero_${id}_${state}`);
        assert.equal(m.cellW, anim.cellW);
        assert.equal(m.cellH, anim.cellH);
      }
    }
    for (const [state, anim] of Object.entries(shared.BANSUNG_PET.anims)) {
      const key = `pet_tiger_${state}`;
      const m = manifest.sprites[key];
      assert.equal(`/database-ban-sung/${m.path}`, anim.sheetPath);
      assert.deepEqual([m.frames, m.cellW, m.cellH], anim.meta.slice(0, 3));
    }
  });

  it('verifies LICENSES.md coverage for every sourceId, provenance row, and sources.json consistency', () => {
    const md = fs.readFileSync(LICENSES_PATH, 'utf8');
    for (const sec of verifyMod.REQUIRED_LICENSE_SECTIONS) {
      assert.ok(md.includes(sec), `Missing LICENSES.md section ${sec}`);
    }

    const packIds = new Map();
    const packTable = md.split('## Source Packs')[1].split(/^## /m)[0];
    for (const m of packTable.matchAll(
      /^\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*`?([A-Z0-9._-]+)`?\s*\|/gm,
    )) {
      packIds.set(m[1], m[4].trim());
      assert.ok(verifyMod.ALLOWED_LICENSES.has(m[4].trim()), `Disallowed license ${m[4]} on ${m[1]}`);
      assert.equal(verifyMod.FORBIDDEN_LICENSE_RE.test(m[4]), false);
    }

    const usedSourceIds = new Set();
    for (const [k, s] of Object.entries(manifest.sprites)) {
      assert.ok(packIds.has(s.sourceId), `Sprite ${k} sourceId "${s.sourceId}" missing from LICENSES.md`);
      usedSourceIds.add(s.sourceId);
    }
    for (const [k, a] of Object.entries(manifest.audio)) {
      assert.ok(packIds.has(a.sourceId), `Audio ${k} sourceId "${a.sourceId}" missing from LICENSES.md`);
      usedSourceIds.add(a.sourceId);
    }

    // Active manifest relies solely on permissive/internal/generated sources (or attributed CC-BY)
    assert.ok(usedSourceIds.size >= 20, `Expected >=20 distinct sourceIds, got ${usedSourceIds.size}`);

    const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    for (const [groupName, group] of [
      ['spritePacks', sources.spritePacks],
      ['audioPacks', sources.audioPacks],
    ]) {
      const entries = Array.isArray(group)
        ? group.map((spec) => [spec.id ?? spec.sourceId, spec])
        : Object.entries(group || {});
      assert.ok(entries.length > 0, `sources.json ${groupName} must not be empty`);
      for (const [id, spec] of entries) {
        assert.ok(
          typeof id === 'string' && id.length > 0 && !/^\d+$/.test(id),
          `sources.json ${groupName} entry has invalid pack id "${id}"`,
        );
        assert.ok(verifyMod.ALLOWED_LICENSES.has(spec.license), `sources.json ${id} disallowed license ${spec.license}`);
        assert.ok(packIds.has(id), `sources.json ${groupName} pack "${id}" missing from LICENSES.md`);
        assert.equal(packIds.get(id), spec.license, `License mismatch for ${id}`);
      }
    }
  });

  it('verifies clean fallback coverage across sprites, audio .wav fallbacks, WebAudio synth keys, and Miragine backups', () => {
    for (const [key, s] of Object.entries(manifest.sprites)) {
      assert.ok(s.fallback, `Missing fallback on sprite ${key}`);
      assert.ok(verifyMod.VALID_FALLBACK_SHAPES.has(s.fallback.shape), `Invalid fallback shape on ${key}`);
      assert.match(s.fallback.color, /^#[0-9a-f]{3,8}$/i, `Invalid fallback color on ${key}`);
    }

    const soundContract = verifyMod.parseClientSoundContract(fs.readFileSync(CLIENT_SOUND_TS, 'utf8'));
    assert.ok(soundContract.canonicalKeys.size >= 55, `Expected >=55 canonical WebAudio synths`);
    assert.ok(soundContract.bgmFallbackPaths.length >= 25);
    for (const rel of soundContract.bgmFallbackPaths) {
      assert.ok(fs.existsSync(path.join(DB_ROOT, rel)), `Missing BGM_FALLBACK_PATHS asset ${rel}`);
    }

    for (const [key, a] of Object.entries(manifest.audio)) {
      assert.ok(a.synthFallback, `Missing synthFallback on audio ${key}`);
      const ext = path.extname(a.path).toLowerCase();
      if ((ext === '.ogg' || ext === '.mp3') && a.path.startsWith('audio/')) {
        assert.ok(a.fallbackPath && a.fallbackPath.endsWith('.wav'), `Expected WAV fallbackPath on ${key}`);
        assert.ok(fs.existsSync(path.join(DB_ROOT, a.fallbackPath)), `Missing fallbackPath file on ${key}`);
      }
    }

    const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    const miragineRoot = path.join(REPO_ROOT, sources.miragineReuse.sourceRoot);
    assert.ok(fs.existsSync(miragineRoot), 'Missing database-miraginewar root');
    for (const item of [...sources.miragineReuse.sprites, ...sources.miragineReuse.audio]) {
      const full = path.join(miragineRoot, item.src);
      assert.ok(fs.existsSync(full), `Missing Miragine backup ${item.src}`);
      assert.ok(fs.statSync(full).size > 0, `Empty Miragine backup ${item.src}`);
      const ext = path.extname(item.src).slice(1).toLowerCase();
      assert.equal(libPack.detectMagicFormat(fs.readFileSync(full)), ext, `Bad magic on Miragine backup ${item.src}`);
    }
  });

  it('detects corrupt headers, dimension mismatches, unreferenced files, missing licenses, and broken fallbacks in isolated fixtures', (t) => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'bansung-verify-test-'));
    t.after(() => fs.rmSync(tmpBase, { recursive: true, force: true }));

    // 0. Baseline isolated clean fixture passes
    const cleanDir = path.join(tmpBase, 'clean');
    const clean = createCleanFixture(libPack, cleanDir);
    const baseline = verifyMod.verifyBansungAssets({
      repoRoot: cleanDir,
      dbRoot: clean.dbDir,
      sourcesPath: false,
      miragineRoot: false,
      clientSoundSourcePath: CLIENT_SOUND_TS,
      clientSpritesSourcePath: false,
      checkBgmFallbackPaths: false,
    });
    assert.equal(baseline.passed, true, `Baseline fixture failed: ${JSON.stringify(baseline)}`);

    // 1. Corrupt PNG magic header
    const badPngDir = path.join(tmpBase, 'bad-png');
    const f1 = createCleanFixture(libPack, badPngDir);
    fs.writeFileSync(path.join(f1.dbDir, f1.spriteRel), Buffer.from('NOT_A_PNG_FILE'));
    const r1 = verifyMod.verifyBansungAssets({ repoRoot: badPngDir, dbRoot: f1.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: false, clientSpritesSourcePath: false });
    assert.equal(r1.passed, false);
    assert.ok(r1.badPngHeaders.length > 0);

    // 2. PNG dimension mismatch (frames * cellW !== pngWidth)
    const badDimDir = path.join(tmpBase, 'bad-dim');
    const f2 = createCleanFixture(libPack, badDimDir);
    f2.manifestObj.sprites.test_pistol.frames = 4;
    fs.writeFileSync(path.join(f2.dbDir, 'manifest.json'), JSON.stringify(f2.manifestObj));
    const r2 = verifyMod.verifyBansungAssets({ repoRoot: badDimDir, dbRoot: f2.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: false, clientSpritesSourcePath: false });
    assert.equal(r2.passed, false);
    assert.ok(r2.dimErrors.length > 0);

    // 3. Truncated / empty WAV audio file
    const badAudioDir = path.join(tmpBase, 'bad-audio');
    const f3 = createCleanFixture(libPack, badAudioDir);
    fs.writeFileSync(path.join(f3.dbDir, f3.audioRel), Buffer.alloc(0));
    const r3 = verifyMod.verifyBansungAssets({ repoRoot: badAudioDir, dbRoot: f3.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: false, clientSpritesSourcePath: false });
    assert.equal(r3.passed, false);
    assert.ok(r3.badAudioHeaders.length > 0);

    // 4. Unreferenced file on disk inside normalized/
    const unrefDir = path.join(tmpBase, 'unref');
    const f4 = createCleanFixture(libPack, unrefDir);
    fs.writeFileSync(path.join(f4.dbDir, 'normalized/weapons/orphan.png'), fs.readFileSync(path.join(f4.dbDir, f4.spriteRel)));
    const r4 = verifyMod.verifyBansungAssets({ repoRoot: unrefDir, dbRoot: f4.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: false, clientSpritesSourcePath: false });
    assert.equal(r4.passed, false);
    assert.ok(r4.unreferencedFiles.some((msg) => msg.includes('orphan.png')));

    // 5. Missing sourceId in LICENSES.md
    const noLicDir = path.join(tmpBase, 'no-lic');
    const f5 = createCleanFixture(libPack, noLicDir);
    f5.manifestObj.sprites.test_pistol.sourceId = 'unknown_pack_xyz';
    fs.writeFileSync(path.join(f5.dbDir, 'manifest.json'), JSON.stringify(f5.manifestObj));
    const r5 = verifyMod.verifyBansungAssets({ repoRoot: noLicDir, dbRoot: f5.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: false, clientSpritesSourcePath: false });
    assert.equal(r5.passed, false);
    assert.ok(r5.unlicensedSources.length > 0);

    // 6. Broken fallback metadata (missing sprite fallback, missing weapon pivot, unresolved synthFallback)
    const badFbDir = path.join(tmpBase, 'bad-fb');
    const f6 = createCleanFixture(libPack, badFbDir);
    delete f6.manifestObj.sprites.test_pistol.fallback;
    delete f6.manifestObj.sprites.test_pistol.pivot;
    f6.manifestObj.audio.test_shot.synthFallback = 'nonexistent_synth_key';
    fs.writeFileSync(path.join(f6.dbDir, 'manifest.json'), JSON.stringify(f6.manifestObj));
    const r6 = verifyMod.verifyBansungAssets({ repoRoot: badFbDir, dbRoot: f6.dbDir, sourcesPath: false, miragineRoot: false, clientSoundSourcePath: CLIENT_SOUND_TS, clientSpritesSourcePath: false, checkBgmFallbackPaths: false });
    assert.equal(r6.passed, false);
    assert.ok(r6.fallbackErrors.length >= 2);
    assert.ok(r6.pivotErrors.length >= 1);
  });
});
