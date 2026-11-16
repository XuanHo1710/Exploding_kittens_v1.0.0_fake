'use strict';

// Kiểm tra đối chiếu 100% tài nguyên Miragine War gốc giữa database-miraginewar/mapping.json,
// các file ảnh/âm thanh trên đĩa (header PNG IHDR, JPEG, MP3), metadata trong shared/src/thap,
// logic tự sửa lỗi màu B0_idle.png trong client/src/thap/sprites.ts và bộ lọc frames/ ở client/vite.config.ts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ts = require(require.resolve('typescript', { paths: [__dirname, path.resolve(__dirname, '..')] }));

const S = require('../dist/shared/src/index.js');

const {
  GAME_MODES,
  MIRAGINE_ANIMS,
  MIRAGINE_AUDIO_ASSETS,
  MIRAGINE_AI_COUNTERS,
  MIRAGINE_PROJECTILES,
  MIRAGINE_STRUCTURES,
  MIRAGINE_TERRAINS,
  MIRAGINE_UI_ASSETS,
  THAP_BASE,
  THAP_COUNTER,
  THAP_CRYSTAL_PROJECTILE,
  THAP_FIRST_ROUND_S,
  THAP_INCOME_LIMIT,
  THAP_MAX_POP,
  THAP_MOVE_SPEED_MULT,
  THAP_RANGE_MULT,
  THAP_ROUND_FRAMES,
  THAP_ROUND_S,
  THAP_SHOT_FB,
  THAP_SHOT_STORM,
  THAP_SHOT_TB,
  THAP_SIM_FPS,
  THAP_SPAWN_INTERVAL_FRAMES,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  THAP_WEAPON_SPEED_MULT,
  animKey,
  portraitUrl,
} = S;

const REPO_ROOT = path.resolve(__dirname, '../..');
const DB_DIR = path.join(REPO_ROOT, 'database-miraginewar');
const ACTS = ['idle', 'run', 'attack', 'dead'];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Đọc và parse database-miraginewar/mapping.json. */
function loadMapping() {
  const mappingPath = path.join(DB_DIR, 'mapping.json');
  assertNonEmptyFile(mappingPath, 'mapping.json');
  return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
}

/** Chuyển đường dẫn URL `/database-miraginewar/...` thành đường dẫn file tuyệt đối trên đĩa. */
function dbPathFromUrl(assetUrl) {
  assert.equal(typeof assetUrl, 'string', `URL tài nguyên phải là chuỗi: ${assetUrl}`);
  assert.ok(assetUrl.startsWith('/database-miraginewar/'), `URL phải bắt đầu bằng /database-miraginewar/: ${assetUrl}`);
  return path.join(REPO_ROOT, assetUrl.slice(1));
}

/** Kiểm tra file tồn tại trên đĩa, là file thường và có dung lượng khác 0. */
function assertNonEmptyFile(filePath, label = filePath) {
  assert.ok(fs.existsSync(filePath), `Thiếu file ${label}: ${filePath}`);
  const stat = fs.statSync(filePath);
  assert.ok(stat.isFile(), `${label} không phải file thường: ${filePath}`);
  assert.ok(stat.size > 0, `File rỗng (0 byte) ${label}: ${filePath}`);
  return stat.size;
}

/** Đọc trực tiếp chunk IHDR của file PNG để lấy kích thước thật (width, height). */
function readPngDimensions(filePath) {
  assertNonEmptyFile(filePath, path.basename(filePath));
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length >= 26, `File PNG quá ngắn: ${filePath}`);
  assert.ok(buf.subarray(0, 8).equals(PNG_SIGNATURE), `Sai chữ ký PNG ở ${filePath}`);
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR', `Thiếu chunk IHDR ở ${filePath}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `Kích thước PNG không hợp lệ (${width}x${height}) ở ${filePath}`);
  return { width, height, bitDepth: buf[24], colorType: buf[25], buf };
}

/** Kiểm tra chữ ký đầu file JPEG (FF D8 FF). */
function assertJpegFile(filePath, label) {
  assertNonEmptyFile(filePath, label);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff, `Sai header JPEG ở ${label}`);
}

/** Giải mã tối giản ảnh PNG RGBA 8-bit (colorType=6) bằng zlib để kiểm tra pixel B0_idle. */
function decodePngRgba(filePath) {
  const { width, height, bitDepth, colorType, buf } = readPngDimensions(filePath);
  assert.equal(bitDepth, 8, `Cần PNG 8-bit tại ${filePath}`);
  assert.equal(colorType, 6, `Cần PNG RGBA (colorType 6) tại ${filePath}`);

  const idatChunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    if (type === 'IDAT') idatChunks.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const stride = width * bpp;
  const out = new Uint8ClampedArray(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      const val = raw[rowStart + 1 + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let rec;
      if (filter === 0) rec = val;
      else if (filter === 1) rec = (val + a) & 0xff;
      else if (filter === 2) rec = (val + b) & 0xff;
      else if (filter === 3) rec = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) rec = (val + paeth(a, b, c)) & 0xff;
      else throw new Error(`Bộ lọc PNG không hỗ trợ: ${filter}`);
      out[y * stride + x] = rec;
    }
  }
  return { width, height, data: out };
}

/** Biên dịch động file TypeScript phía client sang CommonJS trong bộ nhớ để kiểm thử logic thực tế. */
function loadClientTsModule(filePath, mocks, transformSource = (s) => s) {
  const source = transformSource(fs.readFileSync(filePath, 'utf8'));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const wrapper = new vm.Script(
    `(function(exports, require, module, __filename, __dirname) {\n${outputText}\n})`,
  ).runInThisContext();
  wrapper(
    mod.exports,
    (spec) => {
      if (Object.prototype.hasOwnProperty.call(mocks, spec)) return mocks[spec];
      throw new Error(`Import chưa được mock trong test: ${spec}`);
    },
    mod,
    filePath,
    path.dirname(filePath),
  );
  return mod.exports;
}

test('mapping.json & đĩa: đủ 16 binh chủng, 32 chân dung, 128 sprite sheet, 4 công trình, 3 đạn, 2 nền, 12 UI, 13 âm thanh và hằng số engine', () => {
  const mapping = loadMapping();
  assert.equal(mapping.units.length, 16, 'mapping.json phải có đúng 16 binh chủng');
  assert.equal(THAP_UNIT_KINDS.length, 16, 'THAP_UNIT_KINDS phải có đủ 16 binh chủng');

  // Kiểm tra 32 chân dung (a0..a15, b0..b15) và 128 sheet (A0..A15, B0..B15 x 4 hành động)
  const seenSs = new Set();
  for (let i = 0; i < 16; i++) {
    const unit = mapping.units[i];
    assert.equal(unit.id, i, `unit.id phải theo thứ tự 0..15 tại index ${i}`);
    seenSs.add(unit.ss);

    assert.equal(unit.portraitRed, portraitUrl(i, 'a'));
    assert.equal(unit.portraitBlue, portraitUrl(i, 'b'));
    assertNonEmptyFile(path.join(DB_DIR, 'portraits', `a${i}.png`), `a${i}.png`);
    assertNonEmptyFile(path.join(DB_DIR, 'portraits', `b${i}.png`), `b${i}.png`);

    for (const act of ACTS) {
      assert.equal(unit.spritesRed[act].sheet, `/database-miraginewar/sheets/A${unit.ss}_${act}.png`);
      assert.equal(unit.spritesBlue[act].sheet, `/database-miraginewar/sheets/B${unit.ss}_${act}.png`);
      assertNonEmptyFile(path.join(DB_DIR, 'sheets', `A${i}_${act}.png`), `A${i}_${act}.png`);
      assertNonEmptyFile(path.join(DB_DIR, 'sheets', `B${i}_${act}.png`), `B${i}_${act}.png`);
    }
  }
  assert.deepEqual([...seenSs].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i), 'ss phải là hoán vị đủ 0..15');

  // Công trình (4 file)
  for (const key of ['A_crystal', 'B_crystal', 'door', 'shadow']) {
    assert.ok(mapping.structures[key], `mapping.json thiếu structure ${key}`);
    assert.equal(MIRAGINE_STRUCTURES[key].file, mapping.structures[key].file);
    assertNonEmptyFile(dbPathFromUrl(MIRAGINE_STRUCTURES[key].file), `structure:${key}`);
  }

  // Đạn phép (3 file)
  for (const key of ['fb', 'tb', 'storm']) {
    assert.ok(mapping.projectiles[key], `mapping.json thiếu projectile ${key}`);
    assert.equal(MIRAGINE_PROJECTILES[key].file, mapping.projectiles[key].sheet);
    assertNonEmptyFile(dbPathFromUrl(MIRAGINE_PROJECTILES[key].file), `projectile:${key}`);
  }

  // Địa hình (2 file JPG)
  assert.deepEqual(MIRAGINE_TERRAINS, mapping.terrains);
  for (const [key, terrainUrl] of Object.entries(MIRAGINE_TERRAINS)) {
    assertJpegFile(dbPathFromUrl(terrainUrl), `terrain:${key}`);
  }

  // UI (12 file trong MIRAGINE_UI_ASSETS, gồm 10 file có mặt trong mapping.ui + bar_frame + cursor_p1)
  assert.equal(Object.keys(MIRAGINE_UI_ASSETS).length, 12, 'MIRAGINE_UI_ASSETS phải có đúng 12 tài nguyên UI');
  for (const [key, uiUrl] of Object.entries(mapping.ui)) {
    assert.equal(MIRAGINE_UI_ASSETS[key], uiUrl, `MIRAGINE_UI_ASSETS.${key} phải khớp mapping.ui.${key}`);
  }
  for (const [key, uiUrl] of Object.entries(MIRAGINE_UI_ASSETS)) {
    const filePath = dbPathFromUrl(uiUrl);
    if (uiUrl.endsWith('.jpg')) assertJpegFile(filePath, `ui:${key}`);
    else assertNonEmptyFile(filePath, `ui:${key}`);
  }

  // Âm thanh (13 file MP3 trong MIRAGINE_AUDIO_ASSETS và mapping.audio)
  assert.equal(Object.keys(MIRAGINE_AUDIO_ASSETS).length, 13, 'MIRAGINE_AUDIO_ASSETS phải có đúng 13 file MP3');
  assert.deepEqual(MIRAGINE_AUDIO_ASSETS, mapping.audio);
  for (const [key, audioUrl] of Object.entries(MIRAGINE_AUDIO_ASSETS)) {
    assert.ok(audioUrl.endsWith('.mp3'), `Âm thanh ${key} phải là .mp3`);
    assertNonEmptyFile(dbPathFromUrl(audioUrl), `audio:${key}`);
  }

  // Hằng số engine giữa mapping.json và shared/src/thap/constants.ts
  assert.equal(THAP_SIM_FPS, mapping.engine.fps);
  assert.equal(THAP_ROUND_FRAMES, mapping.engine.roundFrames);
  assert.equal(THAP_ROUND_S, mapping.engine.roundSeconds);
  assert.equal(THAP_FIRST_ROUND_S, mapping.engine.firstRoundSeconds);
  assert.equal(THAP_SPAWN_INTERVAL_FRAMES, mapping.engine.spawnIntervalFrames);
  assert.equal(THAP_START_GOLD, mapping.engine.startMoney);
  assert.equal(THAP_START_ROUND_INCOME, mapping.engine.startIncome);
  assert.equal(THAP_INCOME_LIMIT, mapping.engine.incomeLimit);
  assert.equal(THAP_MAX_POP, mapping.engine.populationLimit);
  assert.equal(THAP_MOVE_SPEED_MULT, mapping.engine.moveSpeedMultiplier);
  assert.equal(THAP_RANGE_MULT, mapping.engine.rangeMultiplier);
  assert.equal(THAP_WEAPON_SPEED_MULT, mapping.engine.weaponSpeedMultiplier);
});

test('MIRAGINE_ANIMS & PNG IHDR: toàn bộ 128 sheet lính khớp cellW * frames === pngW, cellH === pngH và mapping.json', () => {
  const mapping = loadMapping();
  assert.equal(Object.keys(MIRAGINE_ANIMS).length, 131, 'MIRAGINE_ANIMS gồm 128 sheet lính + 3 đạn phép');

  const unitBySs = new Map(mapping.units.map((u) => [u.ss, u]));
  for (let ss = 0; ss < 16; ss++) {
    const unit = unitBySs.get(ss);
    assert.ok(unit, `Thiếu unit có ss=${ss}`);

    for (const [side, spritesObj] of [['A', unit.spritesRed], ['B', unit.spritesBlue]]) {
      for (const act of ACTS) {
        const key = animKey(side, ss, act);
        const anim = MIRAGINE_ANIMS[key];
        assert.ok(Array.isArray(anim) && anim.length === 5, `MIRAGINE_ANIMS[${key}] phải là tuple 5 phần tử`);
        const [frames, cellW, cellH, offX, offY] = anim;
        const sp = spritesObj[act];

        assert.deepEqual(
          [frames, cellW, cellH, offX, offY],
          [sp.frames, sp.cellW, sp.cellH, sp.offX, sp.offY],
          `MIRAGINE_ANIMS[${key}] lệch metadata so với mapping.json`,
        );

        const pngPath = path.join(DB_DIR, 'sheets', `${key}.png`);
        const { width: pngW, height: pngH } = readPngDimensions(pngPath);
        assert.equal(cellW * frames, pngW, `${key}.png: cellW(${cellW}) * frames(${frames}) !== pngW(${pngW})`);
        assert.equal(cellH, pngH, `${key}.png: cellH(${cellH}) !== pngH(${pngH})`);
      }
    }
  }
});

test('MIRAGINE_STRUCTURES, MIRAGINE_PROJECTILES & UI PNG: khớp kích thước thật trên đĩa và mapping.json', () => {
  const mapping = loadMapping();

  // Kiểm tra 4 công trình
  const expectedStructures = {
    A_crystal: [96, 144],
    B_crystal: [96, 144],
    door: [150, 296],
    shadow: [38, 16],
  };
  for (const [key, [expW, expH]] of Object.entries(expectedStructures)) {
    const meta = MIRAGINE_STRUCTURES[key];
    const m = mapping.structures[key];
    assert.equal(meta.w, expW, `${key}.w phải là ${expW}`);
    assert.equal(meta.h, expH, `${key}.h phải là ${expH}`);
    assert.equal(meta.w, m.w);
    assert.equal(meta.h, m.h);
    assert.equal(meta.offX, m.offX);
    assert.equal(meta.offY, m.offY);
    const { width, height } = readPngDimensions(dbPathFromUrl(meta.file));
    assert.equal(width, expW, `${key} PNG width !== ${expW}`);
    assert.equal(height, expH, `${key} PNG height !== ${expH}`);
  }

  // Kiểm tra thông số Pha Lê Chính giữa mapping.json và THAP_BASE
  for (const [idx, crystalKey] of ['A_crystal', 'B_crystal'].entries()) {
    const c = mapping.structures[crystalKey];
    assert.equal(THAP_BASE.hp, c.hp);
    assert.deepEqual([...THAP_BASE.damage], c.damage);
    assert.equal(THAP_BASE.range, c.range);
    assert.equal(THAP_BASE.weaponSpeedFrames, c.weaponSpeed);
    assert.equal(MIRAGINE_PROJECTILES[THAP_CRYSTAL_PROJECTILE[idx]].key, c.projectile);
  }

  // Kiểm tra 3 đạn phép
  const expectedProjectiles = {
    fb: { key: 'fireball', frames: 3, cellW: 32, cellH: 32, pngW: 96, pngH: 32 },
    tb: { key: 'thunderball', frames: 16, cellW: 128, cellH: 128, pngW: 2048, pngH: 128 },
    storm: { key: 'storm', frames: 9, cellW: 153, cellH: 261, pngW: 1377, pngH: 261 },
  };
  for (const [pKey, exp] of Object.entries(expectedProjectiles)) {
    const meta = MIRAGINE_PROJECTILES[pKey];
    const m = mapping.projectiles[pKey];
    assert.equal(meta.key, exp.key);
    assert.equal(meta.frames, exp.frames);
    assert.equal(meta.cellW, exp.cellW);
    assert.equal(meta.cellH, exp.cellH);
    assert.equal(meta.frames, m.frames);
    assert.equal(meta.cellW, m.cellW);
    assert.equal(meta.cellH, m.cellH);
    assert.equal(meta.mappingOffX, m.offX);
    assert.equal(meta.mappingOffY, m.offY);

    const anim = MIRAGINE_ANIMS[meta.key];
    assert.ok(anim, `Thiếu MIRAGINE_ANIMS.${meta.key}`);
    assert.equal(anim[0], exp.frames);
    assert.equal(anim[1], exp.cellW);
    assert.equal(anim[2], exp.cellH);

    const { width, height } = readPngDimensions(dbPathFromUrl(meta.file));
    assert.equal(width, exp.pngW, `${meta.key}.png width !== ${exp.pngW}`);
    assert.equal(height, exp.pngH, `${meta.key}.png height !== ${exp.pngH}`);
    assert.equal(meta.cellW * meta.frames, width);
    assert.equal(meta.cellH, height);
  }

  // Kiểm tra kích thước PNG UI quan trọng & tính hợp lệ mọi file PNG UI
  const expectedUiDims = {
    bar_frame: [285, 18],
    cursor_p1: [39, 38],
    timebg: [64, 32],
    win: [114, 161],
    lose: [114, 161],
  };
  for (const [uiKey, uiUrl] of Object.entries(MIRAGINE_UI_ASSETS)) {
    if (!uiUrl.endsWith('.png')) continue;
    const { width, height } = readPngDimensions(dbPathFromUrl(uiUrl));
    if (expectedUiDims[uiKey]) {
      assert.deepEqual([width, height], expectedUiDims[uiKey], `UI ${uiKey}.png sai kích thước`);
    }
  }
});

test('THAP_UNITS, THAP_COUNTER, MIRAGINE_AI_COUNTERS & GAME_MODES.thap_hung: khớp 100% 16 binh chủng mapping.json', () => {
  const mapping = loadMapping();
  const expectedRadii = [9, 9, 10, 10, 10, 9, 9, 11, 11, 10, 12, 12, 10, 13, 15, 16];
  const expectedHotkeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'E', 'F', 'G', 'V', 'B'];
  const expectedSplash = { vampire: 38, mage: 45 };
  const expectedShot = { novice: THAP_SHOT_TB, vampire: THAP_SHOT_STORM, mage: THAP_SHOT_FB };

  assert.equal(Object.keys(THAP_UNITS).length, 16);
  assert.equal(new Set(expectedHotkeys).size, 16);

  for (let i = 0; i < 16; i++) {
    const mu = mapping.units[i];
    const kind = THAP_UNIT_KINDS[i];
    assert.equal(kind, mu.key, `THAP_UNIT_KINDS[${i}] phải là ${mu.key}`);

    const su = THAP_UNITS[kind];
    assert.ok(su, `Thiếu THAP_UNITS.${kind}`);
    assert.equal(su.id, mu.id);
    assert.equal(su.name, mu.name);
    assert.equal(su.vnName, mu.vnName);
    assert.equal(su.cost, mu.cost);
    assert.equal(su.pop, mu.population);
    assert.equal(su.incomeBonus, mu.income);
    assert.equal(su.hp, mu.hp);
    assert.equal(su.armorTypeID, mu.armorTypeID);
    assert.equal(su.armorType, mu.armorType);
    assert.equal(su.armor, mu.armor);
    assert.deepEqual(su.damage, mu.damage);
    assert.equal(su.weaponSpeed, mu.weaponSpeed);
    assert.equal(su.delayAttack, mu.delayAttack);
    assert.equal(su.rawRange, mu.range);
    assert.equal(su.moveSpeed, mu.moveSpeed);
    assert.equal(su.radius, expectedRadii[i]);
    assert.equal(su.hotkey, expectedHotkeys[i]);
    assert.equal(su.ss, mu.ss);
    assert.equal(su.wss ?? null, mu.wss);
    assert.equal(su.splash, expectedSplash[kind]);
    assert.equal(su.shot, expectedShot[kind]);
    assert.equal(su.weaponFrames, Math.round(mu.weaponSpeed * THAP_WEAPON_SPEED_MULT));
    assert.equal(su.cd, (mu.weaponSpeed * THAP_WEAPON_SPEED_MULT) / 30);
    assert.equal(su.range, Math.round(mu.range * THAP_RANGE_MULT));
    assert.equal(su.speed, Number((mu.moveSpeed * THAP_MOVE_SPEED_MULT * 30).toFixed(2)));
  }

  // Kiểm tra bảng THAP_COUNTER khớp công thức tỉ lệ sát thương Giáp Nhẹ / Giáp Nặng
  assert.deepEqual(Object.keys(THAP_COUNTER), THAP_UNIT_KINDS);
  for (const ak of THAP_UNIT_KINDS) {
    const a = THAP_UNITS[ak];
    const base = (a.damage[0] + a.damage[1]) / 2;
    const expectedRow = {};
    for (const tk of THAP_UNIT_KINDS) {
      const d = a.damage[THAP_UNITS[tk].armorTypeID];
      if (d > base * 1.15 || d < base * 0.85) {
        expectedRow[tk] = Number((d / base).toFixed(2));
      }
    }
    assert.deepEqual(THAP_COUNTER[ak], expectedRow, `THAP_COUNTER[${ak}] sai lệch`);
  }

  // Kiểm tra bảng MIRAGINE_AI_COUNTERS (Method 481) cho cả 16 unit ID 0..15
  const expectedAiCounters = {
    0: [3, 5, 6, 7],
    1: [3, 5, 6, 7],
    2: [4, 6, 7, 8, 9],
    3: [4, 7, 8],
    4: [7, 8, 9],
    5: [3, 7, 8],
    6: [5, 10, 13],
    7: [4, 8, 9, 11],
    8: [5, 10, 12],
    9: [5, 10, 12, 13],
    10: [8, 11, 13],
    11: [8, 9, 12, 14],
    12: [10, 13, 14],
    13: [9, 11, 14, 15],
    14: [9, 11, 15],
    15: [9, 11, 14, 15],
  };
  assert.deepEqual(Object.keys(MIRAGINE_AI_COUNTERS).map(Number).sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
  assert.deepEqual(MIRAGINE_AI_COUNTERS, expectedAiCounters);

  // Kiểm tra GAME_MODES.thap_hung hỗ trợ chế độ solo 1P vs AI và 1v1 PvP
  assert.equal(GAME_MODES.thap_hung.minPlayers, 1);
  assert.equal(GAME_MODES.thap_hung.maxPlayers, 2);
});

test('B0_idle.png: phát hiện trùng byte với A0_idle.png trên đĩa và client/src/thap/sprites.ts đổi màu đỏ sang xanh lam đúng', () => {
  const a0Path = path.join(DB_DIR, 'sheets', 'A0_idle.png');
  const b0Path = path.join(DB_DIR, 'sheets', 'B0_idle.png');
  const a0Bytes = fs.readFileSync(a0Path);
  const b0Bytes = fs.readFileSync(b0Path);
  assert.ok(a0Bytes.equals(b0Bytes), 'B0_idle.png trên đĩa phải trùng byte với A0_idle.png (khiếm khuyết asset gốc)');

  // Mọi cặp sheet khác (63 cặp còn lại) phải khác nhau giữa Phe Đỏ (A) và Phe Xanh (B)
  const equalPairs = [];
  for (let ss = 0; ss < 16; ss++) {
    for (const act of ACTS) {
      const a = fs.readFileSync(path.join(DB_DIR, 'sheets', `A${ss}_${act}.png`));
      const b = fs.readFileSync(path.join(DB_DIR, 'sheets', `B${ss}_${act}.png`));
      if (a.equals(b)) equalPairs.push(`${ss}_${act}`);
    }
  }
  assert.deepEqual(equalPairs, ['0_idle'], 'Chỉ duy nhất cặp 0_idle bị trùng byte trên đĩa');

  // Xác minh mã nguồn client/src/thap/sprites.ts chứa logic sửa màu B0_idle
  const spritesPath = path.join(REPO_ROOT, 'client', 'src', 'thap', 'sprites.ts');
  const animMetaPath = path.join(REPO_ROOT, 'client', 'src', 'thap', 'animMeta.ts');
  const spritesSrc = fs.readFileSync(spritesPath, 'utf8');
  assert.match(spritesSrc, /B0_IDLE_KEY\s*=\s*'B0_idle'/);
  assert.match(spritesSrc, /function remapRedPixelToBlue/);
  assert.match(spritesSrc, /function recolorRedSheetToBlue/);
  assert.match(spritesSrc, /function ensureB0IdleRecolored/);
  assert.match(spritesSrc, /targetH\s*=\s*210/);

  // Nạp và chạy thật sprites.ts để kiểm tra remapRedPixelToBlue, recolorRedSheetToBlue và getSheetImage('B0_idle')
  const animMetaMod = loadClientTsModule(animMetaPath, { '../../../shared/src': S });
  const pngPixels = decodePngRgba(b0Path);

  const prevDoc = globalThis.document;
  const prevImg = globalThis.Image;
  try {
    class MockCanvas {
      constructor() {
        this.width = 0;
        this.height = 0;
        this._pixels = null;
      }
      getContext(kind) {
        if (kind !== '2d') return null;
        const canvas = this;
        return {
          imageSmoothingEnabled: true,
          drawImage() {},
          getImageData() {
            return { data: new Uint8ClampedArray(pngPixels.data) };
          },
          putImageData(imageData) {
            canvas._pixels = imageData.data;
          },
        };
      }
    }
    class MockImage {
      constructor() {
        this.complete = false;
        this.naturalWidth = 0;
        this.width = 0;
        this.height = 0;
        this.onload = null;
        this._src = '';
      }
      set src(v) {
        this._src = v;
        this.complete = true;
        this.naturalWidth = pngPixels.width;
        this.width = pngPixels.width;
        this.height = pngPixels.height;
        if (this.onload) this.onload();
      }
      get src() {
        return this._src;
      }
    }

    globalThis.document = { createElement: (tag) => (tag === 'canvas' ? new MockCanvas() : null) };
    globalThis.Image = MockImage;

    const spritesMod = loadClientTsModule(spritesPath, {
      '../../../shared/src': S,
      './animMeta': animMetaMod,
    });

    // Kiểm tra từng loại pixel qua remapRedPixelToBlue
    const [br, bg, bb, ba] = spritesMod.remapRedPixelToBlue(220, 30, 30, 255);
    assert.ok(bb > br && bb > bg, `Pixel đỏ (220,30,30) phải đổi sang xanh lam, nhận (${br},${bg},${bb})`);
    assert.equal(ba, 255);
    const [hBlue] = spritesMod.rgbToHsv(br, bg, bb);
    assert.ok(Math.abs(hBlue - 210) <= 2, `Hue sau đổi màu phải gần 210°, nhận ${hBlue}`);

    assert.deepEqual(spritesMod.remapRedPixelToBlue(220, 30, 30, 0), [220, 30, 30, 0], 'Giữ nguyên pixel trong suốt');
    assert.deepEqual(spritesMod.remapRedPixelToBlue(128, 128, 128, 255), [128, 128, 128, 255], 'Giữ nguyên màu xám trung tính');
    assert.deepEqual(spritesMod.remapRedPixelToBlue(235, 200, 170, 255), [235, 200, 170, 255], 'Giữ nguyên màu da');
    assert.deepEqual(spritesMod.remapRedPixelToBlue(30, 100, 220, 255), [30, 100, 220, 255], 'Giữ nguyên pixel đã là xanh lam');

    // Kiểm tra getSheetImage('A0_idle') giữ nguyên ảnh gốc còn getSheetImage('B0_idle') trả về canvas đã đổi màu trên pixel thật
    const a0Drawable = spritesMod.getSheetImage('A0_idle');
    const b0Drawable = spritesMod.getSheetImage('B0_idle');
    assert.ok(a0Drawable instanceof MockImage, 'A0_idle phải dùng HTMLImageElement gốc');
    assert.ok(b0Drawable instanceof MockCanvas, 'B0_idle phải trả về canvas đã đổi màu');
    assert.ok(b0Drawable._pixels instanceof Uint8ClampedArray);

    const isTargetRed = (r, g, b) => {
      if (r - Math.max(g, b) < 6) return false;
      const [hDeg, s] = spritesMod.rgbToHsv(r, g, b);
      return (hDeg >= 325 || hDeg <= 12) && s >= 0.14;
    };

    let redBefore = 0;
    let redAfter = 0;
    let blueAdded = 0;
    for (let i = 0; i < pngPixels.data.length; i += 4) {
      const [r0, g0, b0, a0] = [pngPixels.data[i], pngPixels.data[i + 1], pngPixels.data[i + 2], pngPixels.data[i + 3]];
      const [r1, g1, b1, a1] = [b0Drawable._pixels[i], b0Drawable._pixels[i + 1], b0Drawable._pixels[i + 2], b0Drawable._pixels[i + 3]];
      assert.equal(a1, a0, 'Kênh alpha không được đổi');
      if (a0 <= 0) continue;
      if (isTargetRed(r0, g0, b0)) {
        redBefore++;
        if (b1 > r1 && b1 > g1) blueAdded++;
      }
      if (isTargetRed(r1, g1, b1)) redAfter++;
    }
    assert.ok(redBefore > 500, `B0_idle.png gốc phải có nhiều pixel đỏ (${redBefore})`);
    assert.equal(redAfter, 0, 'Sau recolorRedSheetToBlue không còn pixel viền giáp đỏ nào');
    assert.equal(blueAdded, redBefore, 'Toàn bộ pixel giáp đỏ đều chuyển thành xanh lam');
  } finally {
    globalThis.document = prevDoc;
    globalThis.Image = prevImg;
  }
});

test('client/vite.config.ts: plugin databaseMiragineWarPlugin lọc bỏ thư mục frames/ khi copy vào dist', () => {
  const viteConfigPath = path.join(REPO_ROOT, 'client', 'vite.config.ts');
  const viteSrc = fs.readFileSync(viteConfigPath, 'utf8');
  assert.match(viteSrc, /databaseMiragineWarPlugin/);
  assert.match(viteSrc, /FRAMES_DIR\s*=\s*join\(MIRAGINE_DIR,\s*'frames'\)/);
  assert.match(viteSrc, /src\s*!==\s*FRAMES_DIR\s*&&\s*!src\.startsWith\(FRAMES_PREFIX\)/);

  const viteFileUrl = url.pathToFileURL(viteConfigPath).href;
  const capturedCopies = [];
  const viteMod = loadClientTsModule(
    viteConfigPath,
    {
      vite: { defineConfig: (fn) => fn, loadEnv: () => ({}) },
      '@vitejs/plugin-react': () => ({ name: 'react' }),
      'node:fs': {
        ...fs,
        cpSync: (...args) => capturedCopies.push(args),
      },
      'node:path': path,
      'node:url': url,
    },
    (src) => src.replace(/import\.meta\.url/g, JSON.stringify(viteFileUrl)),
  );

  const config = viteMod.default({ mode: 'production' });
  const plugin = config.plugins.find((p) => p && p.name === 'database-miraginewar-static');
  assert.ok(plugin, 'Phải đăng ký plugin database-miraginewar-static');
  plugin.closeBundle();

  assert.equal(capturedCopies.length, 1, 'closeBundle phải gọi cpSync một lần cho database-miraginewar');
  const [srcDir, dstDir, options] = capturedCopies[0];
  assert.equal(srcDir, DB_DIR);
  assert.equal(dstDir, path.join(REPO_ROOT, 'client', 'dist', 'database-miraginewar'));
  assert.equal(options.recursive, true);
  assert.equal(typeof options.filter, 'function');

  // Kiểm tra hành vi filter thực tế trên frames/ và các thư mục runtime
  assert.equal(options.filter(DB_DIR), true);
  assert.equal(options.filter(path.join(DB_DIR, 'frames')), false, 'Thư mục frames/ phải bị loại');
  assert.equal(options.filter(path.join(DB_DIR, 'frames', 'A0_idle_0.png')), false, 'File bên trong frames/ phải bị loại');
  assert.equal(options.filter(path.join(DB_DIR, 'sheets')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'sheets', 'A0_idle.png')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'portraits', 'a0.png')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'structures', 'door.png')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'projectiles', 'fireball.png')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'terrains', 'terrain2.jpg')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'ui', 'bar_frame.png')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'audio', 'gameLoop.mp3')), true);
  assert.equal(options.filter(path.join(DB_DIR, 'mapping.json')), true);

  // Nếu bản build client/dist/database-miraginewar đã tồn tại, xác nhận không có frames/ ở dist
  if (fs.existsSync(dstDir)) {
    assert.equal(fs.existsSync(path.join(dstDir, 'frames')), false, 'client/dist/database-miraginewar không được chứa frames/');
  }
});
