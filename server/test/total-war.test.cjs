'use strict';

// Tam Quốc Toàn Chiến (Total War: Three Kingdoms — Chế độ Chiến Thuật Đại Quân Thời Gian Thực 15 Hz):
// Kiểm tra toàn diện cơ sở dữ liệu tài nguyên & mã nguồn mở database-total-war/, hợp đồng dữ liệu shared/src/tw.ts,
// triển khai 2–8 Chư hầu & đối thoại Danh tướng khai chiến, kéo chuột phải dàn trận tuyến (move_line),
// 6 Trận hình chiến thuật (set_formation), ẩn quân phục kích Rừng Thông & tán rừng chắn 45% tên,
// Đồi Cao (+20% tầm bắn & +25% xung kích đổ dốc), Thương Lâm phản xung kích Kỵ binh, đánh sườn/bọc hậu,
// Đơn Đấu 1v1 chế độ Diễn Nghĩa & Mưu Sĩ từ chối đấu võ, 5 nhóm Tuyệt kỹ Ngũ Hành (use_skill),
// Sĩ khí tháo chạy / tan rã / chỉnh đốn dưới cờ Thống Soái, chiếm Đài Hiệu Lệnh thắng chiến lược,
// AI Chư Hầu tự động điều binh và vòng đời phòng chơi Game / RoomsService trả thưởng xu.
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Logger } = require('@nestjs/common');

const { TwWorld } = require('../dist/server/src/game/tw/world.js');
const {
  TW_FOREST_SPOT_RADIUS,
  sampleTerrainAt,
  isRegimentHidden,
  stepCapturePoints,
} = require('../dist/server/src/game/tw/terrain.js');
const {
  computeFlankZone,
  computeMultiRegimentLineTargets,
  recomputeRegimentDimensions,
} = require('../dist/server/src/game/tw/formations.js');
const {
  stepMeleeAndCharges,
  stepRangedAndProjectiles,
  stepMoraleAndAuras,
} = require('../dist/server/src/game/tw/combat.js');
const { Game } = require('../dist/server/src/game/game.js');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const S = require('../dist/shared/src/index.js');

Logger.overrideLogger(false);

const {
  GAME_MODES,
  TW_MAX_PLAYERS,
  TW_MAX_TEAMS,
  TW_TICK_HZ,
  TW_FACTION_IDS,
  TW_FACTIONS,
  TW_GENERAL_IDS,
  TW_GENERALS,
  TW_GENERAL_CLASSES,
  TW_CLASSES,
  TW_FORMATION_IDS,
  TW_FORMATIONS,
  TW_UNIT_KINDS,
  TW_UNITS,
  TW_MAP_IDS,
  TW_MAPS,
  TW_COLORS,
  DEFAULT_TW_CONFIG,
  normalizeTwConfig,
  normalizeTwFaction,
  normalizeTwTeam,
  assignTwTeams,
  twScaledMaxMen,
} = S;

const noHooks = { tick() {}, changed() {} };

function makeCfg(over = {}) {
  return {
    mode: 'historical_2teams',
    mapId: 'pingyuan',
    bots: 0,
    durationMin: 15,
    romanceMode: true,
    armyScale: 'normal',
    ...over,
  };
}

function makeSeats(n = 2, opts = {}) {
  const defaultFactions = ['jin', 'yuan', 'wei', 'shu', 'wu', 'lubu'];
  return Array.from({ length: n }, (_, i) => {
    const faction = opts.factions ? opts.factions[i] : defaultFactions[i % defaultFactions.length];
    const team = opts.teams ? opts.teams[i] : opts.mode === 'ffa' ? i : i % 2;
    const bot = opts.bots ? Boolean(opts.bots[i]) : false;
    return {
      id: bot ? `bot:tw${i}` : `p${i}`,
      name: bot ? `🤖 Chư Hầu ${i}` : `Chư Hầu ${i}`,
      faction,
      color: TW_FACTIONS[faction]?.color ?? TW_COLORS[i % TW_COLORS.length],
      team,
      bot,
    };
  });
}

function makeWorld(n = 2, cfgOver = {}, seatOpts = {}, hooks = noHooks) {
  const cfg = makeCfg(cfgOver);
  const seats = makeSeats(n, { mode: cfg.mode, ...seatOpts });
  return new TwWorld(seats, cfg, hooks);
}

function steps(w, count) {
  for (let i = 0; i < count; i++) {
    w.step();
  }
}

function regsOf(w, ownerIdx) {
  return w.regiments.filter((r) => r.ownerIdx === ownerIdx);
}

function aliveRegsOf(w, ownerIdx) {
  return w.regiments.filter((r) => r.ownerIdx === ownerIdx && r.men > 0 && r.hp > 0 && r.anim !== 'dead');
}

/**
 * Cô lập bài kiểm tra chiến thuật trên bản đồ: chỉ giữ lại danh sách `keepIds`
 * cộng thêm 1 Tướng dự bị mỗi phe đứng ở góc bản đồ xa nhau để không kích hoạt loại phe sớm.
 */
function isolateRegiments(w, keepIds) {
  const keepSet = new Set(keepIds);
  const anchorForSide = [
    [180, 2020],
    [3020, 180],
    [180, 180],
    [3020, 2020],
  ];

  for (let sIdx = 0; sIdx < w.sides.length; sIdx++) {
    const hasSideKeep = w.regiments.some((r) => r.ownerIdx === sIdx && keepSet.has(r.id));
    if (!hasSideKeep) {
      const reserveGen = w.regiments.find((r) => r.ownerIdx === sIdx && r.isGeneral);
      if (reserveGen) {
        keepSet.add(reserveGen.id);
        const [ax, ay] = anchorForSide[sIdx % anchorForSide.length];
        reserveGen.x = ax;
        reserveGen.y = ay;
        reserveGen.vx = 0;
        reserveGen.vy = 0;
        reserveGen.morale = 95;
        reserveGen.moraleState = 'eager';
        reserveGen.lockedTargetId = undefined;
        reserveGen.moveTargetX = undefined;
        reserveGen.moveTargetY = undefined;
      }
    }
  }

  for (const r of w.regiments) {
    if (!keepSet.has(r.id)) {
      r.hp = 0;
      r.men = 0;
      r.anim = 'dead';
      r.vx = 0;
      r.vy = 0;
      r.lockedTargetId = undefined;
      r.engagedWithId = undefined;
      r.moveTargetX = undefined;
      r.moveTargetY = undefined;
    }
  }
}

function assertNonEmptyFile(filePath, label) {
  assert.ok(fs.existsSync(filePath), `thiếu tệp ${label || filePath}`);
  const st = fs.statSync(filePath);
  assert.ok(st.isFile() && st.size > 0, `tệp rỗng ${label || filePath}`);
  return st.size;
}

// ============================================================================
// 1. KIỂM ĐỊNH TÀI NGUYÊN & CƠ SỞ DỮ LIỆU MÃ NGUỒN MỞ (database-total-war/)
// ============================================================================

test('database-total-war (1/3): mapping.json, SOURCES.md và opensource/tw3k_historical_db.json đầy đủ và hợp lệ', () => {
  const dbDir = path.resolve(__dirname, '../../database-total-war');
  assertNonEmptyFile(path.join(dbDir, 'mapping.json'), 'mapping.json');

  const sourcesPath = fs.existsSync(path.join(dbDir, 'SOURCES.md'))
    ? path.join(dbDir, 'SOURCES.md')
    : path.join(dbDir, 'opensource', 'SOURCES.md');
  assertNonEmptyFile(sourcesPath, 'SOURCES.md');

  const histDbPath = path.join(dbDir, 'opensource', 'tw3k_historical_db.json');
  assertNonEmptyFile(histDbPath, 'opensource/tw3k_historical_db.json');

  const mapping = JSON.parse(fs.readFileSync(path.join(dbDir, 'mapping.json'), 'utf8'));
  assert.equal(mapping.meta.gameMode, 'total_war');
  assert.equal(mapping.meta.counts.portraits, 24);
  assert.equal(mapping.meta.counts.units, 18);
  assert.equal(mapping.meta.counts.sheets, 23);
  assert.equal(mapping.meta.counts.extractedFrames, 552);
  assert.equal(mapping.meta.counts.terrains, 6);
  assert.equal(mapping.meta.counts.structures, 11);
  assert.equal(mapping.meta.counts.projectiles, 6);
  assert.equal(mapping.meta.counts.ui, 22);
  assert.equal(mapping.meta.counts.audio, 12);

  const histDb = JSON.parse(fs.readFileSync(histDbPath, 'utf8'));
  assert.equal(histDb.campaigns.length, 4, 'đủ 4 mốc niên đại Tam Quốc');
  assert.ok(histDb.featuredBattlefields.length >= 4, 'có dữ liệu các chiến trường lịch sử');
  assert.ok(histDb.warlords.length >= 30, 'có dữ liệu chư hầu lịch sử');
  assert.ok(histDb.regions.length >= 180, 'có dữ liệu quận huyện Tam Quốc');
});

test('database-total-war (2/3): đủ 24 chân dung Danh tướng, 18 thẻ binh chủng, 23 sprite sheet và 552 frame trích xuất', () => {
  const dbDir = path.resolve(__dirname, '../../database-total-war');

  // 12 Danh tướng x 2 (card + token) = 24 ảnh chân dung
  assert.equal(TW_GENERAL_IDS.length, 12);
  for (const genId of TW_GENERAL_IDS) {
    assertNonEmptyFile(path.join(dbDir, 'portraits', `${genId}_card.png`), `${genId}_card.png`);
    assertNonEmptyFile(path.join(dbDir, 'portraits', `${genId}_token.png`), `${genId}_token.png`);
  }
  const portraitPngs = fs.readdirSync(path.join(dbDir, 'portraits')).filter((f) => f.endsWith('.png'));
  assert.equal(portraitPngs.length, 24, 'đúng 24 tệp chân dung Danh tướng');

  // 18 thẻ Binh chủng bộ tùy
  assert.equal(TW_UNIT_KINDS.length, 18);
  for (const kind of TW_UNIT_KINDS) {
    assertNonEmptyFile(path.join(dbDir, 'units', `${kind}.png`), `units/${kind}.png`);
    const sheetPrefix = TW_UNITS[kind].spritePrefix;
    assertNonEmptyFile(path.join(dbDir, 'sheets', `${sheetPrefix}.png`), `sheets/${sheetPrefix}.png`);
  }
  const unitCards = fs.readdirSync(path.join(dbDir, 'units')).filter((f) => f.endsWith('.png'));
  assert.equal(unitCards.length, 18, 'đúng 18 thẻ binh chủng');

  // 23 Sprite sheets (18 binh chủng + 5 hệ tướng Ngũ Hành)
  for (const cls of TW_GENERAL_CLASSES) {
    assertNonEmptyFile(path.join(dbDir, 'sheets', `hero_${cls}.png`), `sheets/hero_${cls}.png`);
  }
  const sheetFiles = fs.readdirSync(path.join(dbDir, 'sheets')).filter((f) => f.endsWith('.png'));
  assert.equal(sheetFiles.length, 23, 'đúng 23 sprite sheets');

  // 552 frame hoạt ảnh trích xuất (23 sheets x 6 động tác x 4 khung hình)
  const frameDir = path.join(dbDir, 'frames');
  const frameFiles = fs.readdirSync(frameDir).filter((f) => f.endsWith('.png'));
  assert.equal(frameFiles.length, 552, 'đúng 552 frame trích xuất');
  for (const fname of frameFiles) {
    assertNonEmptyFile(path.join(frameDir, fname), `frames/${fname}`);
  }
});

test('database-total-war (3/3): đủ 6 địa hình, 11 công trình, 6 đạn đạo, 22 tài nguyên UI và 12 tệp âm thanh .wav', () => {
  const dbDir = path.resolve(__dirname, '../../database-total-war');

  const checkFolderCount = (subDir, extRegex, expectedCount) => {
    const fullDir = path.join(dbDir, subDir);
    assert.ok(fs.existsSync(fullDir), `có thư mục ${subDir}`);
    const files = fs.readdirSync(fullDir).filter((f) => extRegex.test(f));
    assert.equal(files.length, expectedCount, `${subDir} phải có đúng ${expectedCount} tệp`);
    for (const f of files) {
      assertNonEmptyFile(path.join(fullDir, f), `${subDir}/${f}`);
    }
  };

  checkFolderCount('terrains', /\.(jpg|png)$/i, 6);
  checkFolderCount('structures', /\.png$/i, 11);
  checkFolderCount('projectiles', /\.png$/i, 6);
  checkFolderCount('ui', /\.(png|jpg)$/i, 22);
  checkFolderCount('audio', /\.wav$/i, 12);
});

// ============================================================================
// 2. HỢP ĐỒNG DỮ LIỆU DÙNG CHUNG & CHUẨN HÓA CẤU HÌNH (shared/src/tw.ts)
// ============================================================================

test('hợp đồng dữ liệu dùng chung: GAME_MODES.total_war (1–8 người), 6 Chư hầu, 12 Danh tướng, 18 Binh chủng, 6 Trận hình, 4 Bản đồ', () => {
  assert.ok(GAME_MODES.total_war, 'có chế độ total_war trong GAME_MODES');
  assert.equal(GAME_MODES.total_war.minPlayers, 1);
  assert.equal(GAME_MODES.total_war.maxPlayers, 8);
  assert.equal(TW_MAX_PLAYERS, 8);
  assert.equal(TW_MAX_TEAMS, 4);
  assert.equal(TW_TICK_HZ, 15);

  assert.equal(TW_FACTION_IDS.length, 6);
  for (const fid of TW_FACTION_IDS) {
    assert.equal(TW_FACTIONS[fid].defaultGenerals.length, 3);
  }

  assert.equal(TW_GENERAL_CLASSES.length, 5);
  for (const cls of TW_GENERAL_CLASSES) {
    assert.ok(TW_CLASSES[cls].auraRadius > 0);
  }

  assert.equal(TW_FORMATION_IDS.length, 6);
  assert.equal(TW_FORMATIONS.spearwall.chargeReflect, true);
  assert.equal(TW_FORMATIONS.circle.antiFlank, true);

  assert.equal(TW_MAP_IDS.length, 4);
  for (const mid of TW_MAP_IDS) {
    const m = TW_MAPS[mid];
    assert.equal(m.width, 3200);
    assert.equal(m.height, 2200);
    assert.equal(m.capturePoints.length, 3, `bản đồ ${mid} có đúng 3 Đài Hiệu Lệnh`);
    assert.ok(m.terrainZones.length >= 4);
  }
});

test('chuẩn hóa cấu hình & phe: normalizeTwConfig, normalizeTwFaction, normalizeTwTeam an toàn với mọi đầu vào lạ', () => {
  // Giới hạn số máy theo chỗ trống tối đa 8 người chơi
  assert.deepEqual(
    normalizeTwConfig(
      { mode: 'invalid', mapId: 'unknown', bots: 99, botDifficulty: 'insane', durationMin: 999, romanceMode: 'yes', armyScale: 'huge' },
      5,
    ),
    {
      mode: DEFAULT_TW_CONFIG.mode,
      mapId: DEFAULT_TW_CONFIG.mapId,
      bots: 3, // 8 - 5 = 3 chỗ trống
      botDifficulty: 'normal',
      durationMin: DEFAULT_TW_CONFIG.durationMin,
      romanceMode: DEFAULT_TW_CONFIG.romanceMode,
      armyScale: DEFAULT_TW_CONFIG.armyScale,
    },
  );
  assert.equal(normalizeTwConfig({ bots: -4 }, 2).bots, 0);
  assert.deepEqual(
    normalizeTwConfig({ mode: 'ffa', mapId: 'chibi', bots: 2, botDifficulty: 'hard', durationMin: 20, romanceMode: false, armyScale: 'grand' }, 2),
    { mode: 'ffa', mapId: 'chibi', bots: 2, botDifficulty: 'hard', durationMin: 20, romanceMode: false, armyScale: 'grand' },
  );

  // Chuẩn hóa thế lực Chư hầu
  assert.equal(normalizeTwFaction('jin', 0), 'jin');
  assert.equal(normalizeTwFaction('shu', 4), 'shu');
  assert.equal(normalizeTwFaction('invalid_faction', 0), TW_FACTION_IDS[0]);
  assert.equal(normalizeTwFaction(null, 3), TW_FACTION_IDS[3]);

  // Chuẩn hóa Liên minh (0..3)
  assert.equal(normalizeTwTeam(0), 0);
  assert.equal(normalizeTwTeam(1), 1);
  assert.equal(normalizeTwTeam(3), 3);
  assert.equal(normalizeTwTeam(-1), 0);
  assert.equal(normalizeTwTeam(99), 0);
  assert.equal(normalizeTwTeam('bad'), 0);
});

test('chia Liên Minh & quy mô đại quân: assignTwTeams (historical_2teams vs ffa) và twScaledMaxMen (normal vs grand)', () => {
  // Hỗn chiến Quần Hùng Trục Lộc (FFA): mỗi chư hầu 1 phe độc lập
  assert.deepEqual(assignTwTeams([0, 0], 3, 'ffa'), [0, 1, 2, 3, 4]);

  // Lịch sử đối kháng 2 Liên Minh: người giữ phe đã chọn, máy tự cân bằng sang bên ít người hơn
  assert.deepEqual(assignTwTeams([0, 0], 2, 'historical_2teams'), [0, 0, 1, 1]);
  assert.deepEqual(assignTwTeams([1], 3, 'historical_2teams'), [1, 0, 0, 1]);
  // Không có máy mà toàn bộ người chơi chọn trùng 1 bên -> tự tách chẵn/lẻ để khai chiến được
  assert.deepEqual(assignTwTeams([1, 1, 1, 1], 0, 'historical_2teams'), [0, 1, 0, 1]);

  // Quy mô quân số trung đoàn: Tiêu chuẩn ('normal') vs Đại Quân ('grand' ~ 1.25x làm tròn bội số 4)
  assert.equal(twScaledMaxMen('ji_militia', 'normal'), 120);
  assert.equal(twScaledMaxMen('ji_militia', 'grand'), 152);
  assert.equal(twScaledMaxMen('azure_dragons', 'normal'), 96);
  assert.equal(twScaledMaxMen('azure_dragons', 'grand'), 120);
  assert.equal(twScaledMaxMen('jade_dragons', 'normal'), 36);
  assert.equal(twScaledMaxMen('jade_dragons', 'grand'), 44);
  assert.equal(twScaledMaxMen('trebuchet', 'normal'), 16);
  assert.equal(twScaledMaxMen('trebuchet', 'grand'), 20);
});

// ============================================================================
// 3. TRIỂN KHAI ĐẠI QUÂN CHƯ HẦU & ĐỐI THOẠI KHAI CHIẾN (TwWorld)
// ============================================================================

test('triển khai đại quân Trận Bình Nguyên 2 Chư hầu (Tư Mã Tấn vs Viên Thiệu, quy mô Đại Quân): 15 đạo/phe, >1.200 quân/phe & đối thoại khai chiến ở nhịp 5', () => {
  const w = makeWorld(
    2,
    { mode: 'historical_2teams', mapId: 'pingyuan', armyScale: 'grand', romanceMode: true },
    { factions: ['jin', 'yuan'], teams: [0, 1] },
  );

  assert.equal(w.sides.length, 2);
  assert.equal(w.regiments.length, 30, '2 phe x 15 đạo quân = 30 trung đoàn');

  for (let idx = 0; idx < 2; idx++) {
    const sRegs = regsOf(w, idx);
    assert.equal(sRegs.length, 15, `phe ${idx} có đủ 15 trung đoàn`);
    assert.equal(sRegs.filter((r) => r.isGeneral).length, 3, 'đúng 3 Danh tướng Ngũ Hành');
    assert.equal(sRegs.filter((r) => !r.isGeneral).length, 12, 'đúng 12 trung đoàn Bộ tùy');
    assert.ok(w.sides[idx].initialMen > 1200, `quy mô Đại Quân > 1.200 binh sĩ/phe (thực tế: ${w.sides[idx].initialMen})`);
  }

  // Nhịp 1 phát tù và & trống trận; trước nhịp 5 chưa xuất hiện đối thoại mở màn
  w.step();
  assert.equal(w.tick, 1);
  const f1 = w.frameFor(0);
  assert.ok(f1.sfxEvents.includes('horn') && f1.sfxEvents.includes('drums'), 'nhịp 1 nổi tù và & trống trận');
  assert.equal(w.banters.length, 0);

  steps(w, 3);
  assert.equal(w.tick, 4);
  assert.equal(w.banters.length, 0);

  // Đúng nhịp 5: phát sự kiện đối thoại kinh điển Tư Mã Tương An vs Viên Thiệu
  w.step();
  assert.equal(w.tick, 5);
  assert.equal(w.banters.length, 1, 'phát đối thoại Danh tướng khai chiến tại nhịp 5');
  const banter = w.banters[0];
  assert.equal(banter.atTick, 5);
  const pair = new Set([banter.leftGeneral, banter.rightGeneral]);
  assert.ok(pair.has('sima_xiangan') && pair.has('yuan_shao'), 'cặp đối thoại Tư Mã Tương An & Viên Thiệu');
  assert.match(banter.leftLine, /Viên Bản Sơ|Thiết Kỵ Đại Tấn|Tư Mã/i);
  assert.match(banter.rightLine, /Hà Bắc|Tư Mã|Thiết Kỵ Đại Tấn/i);
});

test('triển khai 6 Chư hầu rút gọn (12 đạo/phe = 72 đạo tổng): mô phỏng 40 nhịp mượt mà không phát sinh tọa độ NaN', () => {
  const w = makeWorld(
    6,
    { mode: 'ffa', mapId: 'guandu', armyScale: 'normal' },
    { factions: ['wei', 'shu', 'wu', 'yuan', 'lubu', 'jin'] },
  );

  assert.equal(w.sides.length, 6);
  assert.equal(w.regiments.length, 72, '6 phe (> 4 chư hầu) x 12 đạo/phe = 72 trung đoàn');
  for (let i = 0; i < 6; i++) {
    const sRegs = regsOf(w, i);
    assert.equal(sRegs.length, 12);
    assert.equal(sRegs.filter((r) => r.isGeneral).length, 3);
    assert.equal(sRegs.filter((r) => !r.isGeneral).length, 9);
  }

  steps(w, 40);
  for (const r of w.regiments) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), `tọa độ hữu hạn cho reg #${r.id}`);
    assert.ok(Number.isFinite(r.vx) && Number.isFinite(r.vy) && Number.isFinite(r.facing));
    assert.ok(Number.isFinite(r.width) && Number.isFinite(r.depth) && r.cols >= 1);
    assert.ok(r.x >= 0 && r.x <= w.W && r.y >= 0 && r.y <= w.H, 'nằm gọn trong biên chiến trường 3200x2200');
  }
  const bopSum = w.frameFor(undefined).balanceOfPower.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(bopSum - 1) < 0.01, 'tổng cán cân quân lực chuẩn hóa bằng 1.0');
});

// ============================================================================
// 4. DÀN TRẬN TUYẾN KÉO CHUỘT PHẢI (move_line) & 6 TRẬN HÌNH (set_formation)
// ============================================================================

test('kéo chuột phải dàn trận tuyến (move_line) với width & facing tùy chỉnh: rải đều đa trung đoàn không chồng lấn, chuyển anim march và xung kích charge', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['wei', 'shu'] });
  const infRegs = regsOf(w, 0).filter((r) => !r.isGeneral && TW_UNITS[r.kind].range === 0 && TW_UNITS[r.kind].speed < 100);
  assert.ok(infRegs.length >= 4);
  const picked = infRegs.slice(0, 4);
  const regIds = picked.map((r) => r.id);

  // Kéo trận tuyến hướng Đông (facing = 0 -> trục ngang đội hình nằm dọc theo trục Y), chiều rộng 720
  const err = w.command(0, {
    t: 'move_line',
    regIds,
    x: 1500,
    y: 1100,
    facing: 0,
    width: 720,
    run: true,
  });
  assert.equal(err, undefined);

  // Kiểm tra các điểm đích nằm dọc trục Y không chồng lấn nhau
  const sortedByY = [...picked].sort((a, b) => a.moveTargetY - b.moveTargetY);
  for (let i = 0; i < sortedByY.length; i++) {
    const r = sortedByY[i];
    assert.equal(r.moveTargetX, 1500);
    assert.equal(r.moveTargetFacing, 0);
    if (i > 0) {
      const prev = sortedByY[i - 1];
      const gapCenter = r.moveTargetY - prev.moveTargetY;
      const minNoOverlap = (r.width + prev.width) * 0.5;
      assert.ok(
        gapCenter >= minNoOverlap + 10,
        `hai trung đoàn liền kề cách nhau ${gapCenter.toFixed(1)} >= ${minNoOverlap.toFixed(1)} (không chồng lấn)`,
      );
    }
  }

  // Bước 1 nhịp: toàn bộ trung đoàn được điều động chuyển sang hoạt ảnh 'march'
  w.step();
  for (const r of picked) {
    assert.equal(r.anim, 'march', 'đơn vị nhận lệnh move_line chuyển sang hành quân (march)');
  }

  // Kiểm tra chuyển sang hoạt ảnh xung phong ('charge') khi ra lệnh attack_target ở cự ly <= 190
  const charger = picked[0];
  const enemyInf = regsOf(w, 1).find((r) => !r.isGeneral);
  charger.x = 1400;
  charger.y = 1100;
  charger.facing = 0;
  enemyInf.x = 1550; // cách 150 <= 190 (CHARGE_TRIGGER_DIST)
  enemyInf.y = 1100;
  enemyInf.hidden = false;

  assert.equal(w.command(0, { t: 'attack_target', regIds: [charger.id], targetRegId: enemyInf.id }), undefined);
  w.step();
  assert.equal(charger.anim, 'charge', 'áp sát mục tiêu <= 190 đơn vị bật hoạt ảnh xung kích (charge)');
  assert.ok(charger.chargeTicks >= 1, 'tích lũy động năng xung kích (chargeTicks)');
});

test('biến hóa 6 Trận hình (set_formation): kiểm định allowedFormations từng chủng loại, cập nhật cols/width/depth và dựng thương (brace)', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'jin'] });
  const allRegs = w.regiments;

  const spearGuard = allRegs.find((r) => !r.isGeneral && r.kind === 'spear_guards');
  const swordGuard = allRegs.find((r) => !r.isGeneral && r.kind === 'jian_sword_guards');
  const shockCav = allRegs.find((r) => !r.isGeneral && (r.kind === 'jade_dragons' || r.kind === 'imperial_cataphracts'));
  const bowUnit = allRegs.find((r) => !r.isGeneral && (r.kind === 'yi_archers' || r.kind === 'crossbowmen'));
  const heroGen = allRegs.find((r) => r.isGeneral);

  assert.ok(spearGuard && swordGuard && shockCav && bowUnit && heroGen);

  // 1. Thuẫn Thương Hộ Vệ: đổi sang Thương Lâm (spearwall) hợp lệ, từ chối Phong Thỉ Chùy (wedge)
  const initSpearWidth = spearGuard.width;
  w.command(spearGuard.ownerIdx, { t: 'set_formation', regIds: [spearGuard.id], formation: 'spearwall' });
  assert.equal(spearGuard.formation, 'spearwall');
  assert.notEqual(spearGuard.width, initSpearWidth, 'cập nhật lại chiều rộng đội hình Thương Lâm');
  w.command(spearGuard.ownerIdx, { t: 'set_formation', regIds: [spearGuard.id], formation: 'wedge' });
  assert.equal(spearGuard.formation, 'spearwall', 'bộ binh trường thương không được kết Phong Thỉ Chùy của kỵ binh');

  // Đứng yên giữ trận Thương Lâm -> anim === 'brace' và tăng bracedTicks
  steps(w, 10);
  assert.equal(spearGuard.anim, 'brace');
  assert.ok(spearGuard.bracedTicks >= 8);

  // 2. Trường Kiếm Cấm Vệ: đổi sang Thuẫn Tường (shieldwall) & Viên Trận (circle), từ chối Thương Lâm (spearwall)
  w.command(swordGuard.ownerIdx, { t: 'set_formation', regIds: [swordGuard.id], formation: 'shieldwall' });
  assert.equal(swordGuard.formation, 'shieldwall');
  w.command(swordGuard.ownerIdx, { t: 'set_formation', regIds: [swordGuard.id], formation: 'spearwall' });
  assert.equal(swordGuard.formation, 'shieldwall', 'bộ binh kiếm khiên không thể lập Thương Lâm');
  w.command(swordGuard.ownerIdx, { t: 'set_formation', regIds: [swordGuard.id], formation: 'circle' });
  assert.equal(swordGuard.formation, 'circle');
  assert.ok(Math.abs(swordGuard.width - swordGuard.depth) <= 20, 'Viên Trận thu gọn kích thước đồng tâm');

  // 3. Xung Kỵ: đổi sang Tản Trận -> Trận Ngang -> Phong Thỉ Chùy (wedge) thu hẹp bề ngang & tăng chiều sâu mũi nhọn; từ chối Thuẫn Tường
  w.command(shockCav.ownerIdx, { t: 'set_formation', regIds: [shockCav.id], formation: 'loose' });
  w.command(shockCav.ownerIdx, { t: 'set_formation', regIds: [shockCav.id], formation: 'line' });
  const lineCols = shockCav.cols;
  const lineWidth = shockCav.width;
  const lineDepth = shockCav.depth;
  w.command(shockCav.ownerIdx, { t: 'set_formation', regIds: [shockCav.id], formation: 'wedge' });
  assert.equal(shockCav.formation, 'wedge');
  assert.ok(
    shockCav.cols < lineCols && shockCav.width < lineWidth && shockCav.depth > lineDepth,
    'Phong Thỉ Chùy thu hẹp hàng ngang, tăng chiều sâu mũi nhọn',
  );
  w.command(shockCav.ownerIdx, { t: 'set_formation', regIds: [shockCav.id], formation: 'shieldwall' });
  assert.equal(shockCav.formation, 'wedge');

  // 4. Cung Nỏ: đổi sang Tản Trận (loose) giãn rộng cự ly chống tên/pháo; từ chối Viên Trận
  w.command(bowUnit.ownerIdx, { t: 'set_formation', regIds: [bowUnit.id], formation: 'line' });
  const compactBowWidth = bowUnit.width;
  w.command(bowUnit.ownerIdx, { t: 'set_formation', regIds: [bowUnit.id], formation: 'loose' });
  assert.equal(bowUnit.formation, 'loose');
  assert.ok(bowUnit.width > compactBowWidth * 1.35, 'Tản Trận giãn rộng cự ly binh sĩ');
  w.command(bowUnit.ownerIdx, { t: 'set_formation', regIds: [bowUnit.id], formation: 'circle' });
  assert.equal(bowUnit.formation, 'loose');

  // 5. Danh Tướng đơn độc chỉ giữ đội hình 'line'
  w.command(heroGen.ownerIdx, { t: 'set_formation', regIds: [heroGen.id], formation: 'wedge' });
  assert.equal(heroGen.formation, 'line');
});

// ============================================================================
// 5. PHỤC KÍCH RỪNG THÔNG (FOREST STEALTH), CHẮN 45% TÊN & ĐỒI CAO (+20% TẦM)
// ============================================================================

test('phục kích Rừng Thông (Forest Stealth): ẩn quân ngoài tầm 280, lọc khỏi frameFor địch, hiện cho đồng minh & khán giả, lộ diện khi địch vào <= 280', () => {
  // Tạo trận 3 phe (Phe 0 & Phe 1 cùng Liên Minh 0; Phe 2 thuộc Liên Minh 1 đối địch)
  const w = makeWorld(
    3,
    { mode: 'historical_2teams', mapId: 'pingyuan' },
    { factions: ['shu', 'wu', 'wei'], teams: [0, 0, 1] },
  );

  // Rừng Thông Tây Bắc của Bình Nguyên có tâm tại (680, 520)
  const forestSample = sampleTerrainAt(w.map, 680, 520);
  assert.equal(forestSample.inForest, true);
  assert.equal(forestSample.missileBlockBonus, 0.45);

  const ambusher = regsOf(w, 0).find((r) => !r.isGeneral && TW_UNITS[r.kind].category !== 'artillery');
  const trebuchet = regsOf(w, 0).find((r) => r.kind === 'trebuchet');
  const allyWatcher = regsOf(w, 1).find((r) => r.isGeneral);
  const enemyScout = regsOf(w, 2).find((r) => !r.isGeneral && TW_UNITS[r.kind].range === 0);

  assert.ok(ambusher && trebuchet && allyWatcher && enemyScout);
  isolateRegiments(w, [ambusher.id, trebuchet.id, allyWatcher.id, enemyScout.id]);

  // Đặt phục binh và Pháo đá cùng vào giữa Rừng Thông (680, 520); quân địch đứng xa (2200, 1500) > 280
  ambusher.x = 680;
  ambusher.y = 520;
  ambusher.anim = 'idle';
  trebuchet.x = 700;
  trebuchet.y = 540;
  trebuchet.anim = 'idle';
  allyWatcher.x = 500;
  allyWatcher.y = 1800;
  enemyScout.x = 2200;
  enemyScout.y = 1500;

  w.step();
  assert.equal(ambusher.inForest, true);
  assert.equal(ambusher.hidden, true, 'trung đoàn trong rừng ngoài tầm 280 được ẩn mình (hidden = true)');
  assert.equal(trebuchet.inForest, true);
  assert.equal(trebuchet.hidden, false, 'Pháo Đá Uy Viễn cồng kềnh không thể ẩn mình trong rừng');

  // Kiểm tra sương mù chiến tranh qua frameFor:
  const enemyFrame = w.frameFor(2);
  const allyFrame = w.frameFor(1);
  const ownerFrame = w.frameFor(0);
  const specFrame = w.frameFor(undefined);

  assert.equal(
    enemyFrame.regiments.some((r) => r.id === ambusher.id),
    false,
    'frameFor của quân địch lọc bỏ hoàn toàn trung đoàn đang phục kích',
  );
  assert.equal(
    enemyFrame.regiments.some((r) => r.id === trebuchet.id),
    true,
    'Pháo đá không ẩn được nên địch vẫn nhìn thấy',
  );
  assert.equal(
    allyFrame.regiments.some((r) => r.id === ambusher.id && r.hidden === true),
    true,
    'đồng minh cùng Liên Minh thấy rõ phục binh phe mình',
  );
  assert.equal(ownerFrame.regiments.some((r) => r.id === ambusher.id), true);
  assert.equal(
    specFrame.regiments.some((r) => r.id === ambusher.id && r.hidden === true),
    true,
    'khán giả (frameFor(undefined)) quan sát được toàn bộ phục binh',
  );

  // Quân trinh sát địch tiến sát vào bán kính phát hiện (khoảng cách 210 <= TW_FOREST_SPOT_RADIUS = 280)
  assert.equal(TW_FOREST_SPOT_RADIUS, 280);
  enemyScout.x = 680 + 210;
  enemyScout.y = 520;
  w.step();

  assert.equal(ambusher.hidden, false, 'phục binh lập tức lộ diện khi địch tiến vào <= 280 đơn vị');
  assert.equal(
    w.frameFor(2).regiments.some((r) => r.id === ambusher.id && r.hidden === false),
    true,
    'quân địch nhìn thấy trung đoàn sau khi phát hiện phục kích',
  );
});

test('tán Rừng Thông chắn 45% sát thương tên nỏ (inForest) so với đồng bằng trống trải', () => {
  // So sánh định lượng 2 trung đoàn Dân Binh Trường Kích (shieldMissileBlock = 0) chịu cùng chùm tên:
  // một đội đứng giữa đồng trống (inForest = false), một đội đứng dưới tán rừng thông (inForest = true)
  const wOpen = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'yuan'] });
  const wForest = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'yuan'] });

  const setupTargetAndVolley = (w, inForest) => {
    const target = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'ji_militia');
    const shooter = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'crossbowmen');
    assert.ok(target && shooter);
    target.x = 1200;
    target.y = 1100;
    target.facing = 0;
    target.formation = 'line';
    target.inForest = inForest;
    target.activeBuff = undefined;
    target.activeBuffLeftSec = 0;

    const startHp = target.hp;
    const projs = [
      {
        id: 1,
        kind: 'arrow',
        shooterRegId: shooter.id,
        ownerIdx: 1,
        team: 1,
        x0: 1500,
        y0: 1100,
        x1: 1200,
        y1: 1100,
        elapsed: 0.98,
        flightDur: 1.0,
        normalDmg: 1400,
        apDmg: 400,
        aoeRadius: 32,
        moraleShock: 2,
      },
    ];
    stepRangedAndProjectiles([target], projs, () => 99, 0.05, new Set());
    return startHp - target.hp;
  };

  const dmgOpen = setupTargetAndVolley(wOpen, false);
  const dmgForest = setupTargetAndVolley(wForest, true);

  assert.ok(dmgOpen > 0 && dmgForest > 0);
  const ratio = dmgForest / dmgOpen;
  // Tán rừng thông hấp thụ đúng 45% sát thương tên -> còn lại 55% (0.55)
  assert.ok(
    Math.abs(ratio - 0.55) < 0.01,
    `tán rừng thông giảm 45% sát thương tên (tỷ lệ thực tế: ${ratio.toFixed(4)})`,
  );
});

test('chiếm lĩnh Đồi Cao (ridge / onHighGround): cộng +20% tầm bắn cung nỏ và +25% sát thương xung kích đổ dốc', () => {
  const ridgeSample = sampleTerrainAt(TW_MAPS.pingyuan, 2460, 540);
  assert.equal(ridgeSample.onHighGround, true);
  assert.equal(ridgeSample.rangeMul, 1.2);
  assert.equal(ridgeSample.chargeElevationBonus, 0.25);

  // 1. Kiểm chứng +20% tầm bắn trên Đồi Cao: Dân Binh Cung Thủ có tầm gốc 350 -> lên đồi đạt 420
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['wu', 'wei'] });
  const archer = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'archer_militia');
  const dummyTarget = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
  assert.ok(archer && dummyTarget);
  isolateRegiments(w, [archer.id, dummyTarget.id]);

  // Đặt mục tiêu cách 395 đơn vị (> 350 tầm thường, nhưng <= 420 tầm Đồi Cao)
  archer.vx = 0;
  archer.vy = 0;
  archer.fireAtWill = true;
  archer.reloadLeftSec = 0;
  dummyTarget.hidden = false;

  // Ở đồng bằng (1400, 1100): cách 395 -> ngoài tầm 350, không thể bắn
  archer.x = 1400;
  archer.y = 1100;
  dummyTarget.x = 1400 + 395;
  dummyTarget.y = 1100;
  w.step();
  assert.equal(archer.onHighGround, false);
  assert.equal(w.projectiles.length, 0, 'đứng đồng bằng không bắn tới mục tiêu ở cự ly 395 (> 350)');

  // Đưa cung thủ lên Đồi Cao Đông Bắc (2460, 540), mục tiêu cách đúng 395 đơn vị
  archer.x = 2460;
  archer.y = 540;
  dummyTarget.x = 2460 - 395;
  dummyTarget.y = 540;
  w.step();
  assert.equal(archer.onHighGround, true);
  assert.ok(w.projectiles.length > 0, 'chiếm Đồi Cao (+20% tầm = 420) lập tức phóng loạt tên vào mục tiêu cách 395');

  // 2. Kiểm chứng +25% xung kích đổ dốc (downhill charge bonus)
  const measureChargeDmg = (highGround) => {
    const wTest = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['lubu', 'wei'] });
    const cav = regsOf(wTest, 0).find((r) => !r.isGeneral && r.kind === 'lance_cavalry');
    const victim = regsOf(wTest, 1).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
    cav.x = 1500;
    cav.y = 1100;
    cav.facing = 0;
    cav.chargeTicks = 14;
    cav.onHighGround = highGround;

    victim.x = 1540;
    victim.y = 1100;
    victim.facing = Math.PI;
    victim.bracedTicks = 0;
    const beforeHp = victim.hp;
    stepMeleeAndCharges([cav, victim], 1 / 15, new Set());
    return beforeHp - victim.hp;
  };

  const flatChargeDmg = measureChargeDmg(false);
  const downhillChargeDmg = measureChargeDmg(true);
  assert.ok(
    downhillChargeDmg > flatChargeDmg * 1.15,
    `xung kích từ Đồi Cao (${Math.round(downhillChargeDmg)}) mạnh hơn rõ rệt so với đồng bằng (${Math.round(flatChargeDmg)})`,
  );
});

// ============================================================================
// 6. THƯƠNG LÂM PHẢN XUNG KÍCH KỴ BINH & ĐÁNH TẠT SƯỜN / BỌC HẬU
// ============================================================================

test('Thương Lâm (spearwall) cắm trụ phản xung kích Kỵ binh Xung kích trực diện: bẻ gãy Ngọc Long Kỵ và gây thương vong nặng', () => {
  // Đối chứng A: Bộ binh kiếm khiên chưa cắm trụ (Trận Ngang) bị Thiết kỵ húc trực diện chịu thiệt hại nặng, kỵ binh nguyên vẹn
  const wOpen = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'jin'] });
  const unbracedInf = regsOf(wOpen, 0).find((r) => !r.isGeneral && r.kind === 'sabre_infantry')
    || regsOf(wOpen, 0).find((r) => !r.isGeneral && r.kind === 'jian_sword_guards');
  const openCav = regsOf(wOpen, 1).find((r) => !r.isGeneral && (r.kind === 'imperial_cataphracts' || r.kind === 'jade_dragons'));
  assert.ok(unbracedInf && openCav);
  unbracedInf.formation = 'line';
  unbracedInf.customWidth = undefined;
  recomputeRegimentDimensions(unbracedInf);
  unbracedInf.x = 1500;
  unbracedInf.y = 1100;
  unbracedInf.facing = 0;
  unbracedInf.bracedTicks = 0;

  openCav.formation = 'wedge';
  openCav.customWidth = undefined;
  recomputeRegimentDimensions(openCav);
  openCav.x = 1542;
  openCav.y = 1100;
  openCav.facing = Math.PI;
  openCav.vx = -140;
  openCav.chargeTicks = 16;
  const openInfInitMen = unbracedInf.men;
  stepMeleeAndCharges([unbracedInf, openCav], 1 / 15, new Set());
  const unbracedLoss = openInfInitMen - unbracedInf.men;
  assert.ok(unbracedLoss >= 8, `bộ binh không lập Thương Lâm mất nhiều binh sĩ trước cú húc kỵ binh (${unbracedLoss})`);

  // Đối chứng B: Dựng Thương Lâm cắm thương vững vàng hướng mặt sang phải (facing = 0) phản ngược cú húc kỵ binh
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'jin'] });
  const spearmen = regsOf(w, 0).find((r) => !r.isGeneral && (r.kind === 'azure_dragons' || r.kind === 'spear_guards'));
  const shockCav = regsOf(w, 1).find((r) => !r.isGeneral && (r.kind === 'imperial_cataphracts' || r.kind === 'jade_dragons'));
  assert.ok(spearmen && shockCav);

  spearmen.formation = 'spearwall';
  spearmen.customWidth = undefined;
  recomputeRegimentDimensions(spearmen);
  spearmen.x = 1500;
  spearmen.y = 1100;
  spearmen.facing = 0;
  spearmen.bracedTicks = 16; // >= MIN_BRACED_TICKS (8)

  // Thiết kỵ lao trực diện từ phía trước mặt (x = 1542, facing = PI) với đà húc tối đa
  shockCav.formation = 'wedge';
  shockCav.customWidth = undefined;
  recomputeRegimentDimensions(shockCav);
  shockCav.x = 1542;
  shockCav.y = 1100;
  shockCav.facing = Math.PI;
  shockCav.vx = -140;
  shockCav.chargeTicks = 16;

  const cavInitMen = shockCav.men;
  const cavInitHp = shockCav.hp;
  const cavInitMorale = shockCav.morale;
  const spearInitMen = spearmen.men;

  const sfx = new Set();
  const { casualtiesByOwner } = stepMeleeAndCharges([spearmen, shockCav], 1 / 15, sfx);

  assert.ok(shockCav.hp < cavInitHp * 0.78, 'kỵ binh lao vào Thương Lâm chịu phản sát thương cực nặng (>22% tổng máu ngay nhịp chạm)');
  assert.ok(shockCav.men < cavInitMen && casualtiesByOwner[1] >= 6, `nhiều kỵ sĩ tử trận ngay cú húc đầu (${casualtiesByOwner[1]} kỵ sĩ)`);
  assert.ok(shockCav.morale <= cavInitMorale - 18, 'kỵ binh bị choáng sĩ khí (-18) khi dội ngược trước rừng thương');
  assert.equal(shockCav.vx, 0, 'quán tính xung phong của kỵ binh bị chặn đứng hoàn toàn');
  assert.ok(spearmen.men >= spearInitMen - 1, 'bộ binh Thương Lâm giữ vững hàng ngũ trước cú húc trực diện');
  assert.ok(spearmen.kills >= casualtiesByOwner[1], 'công trạng hạ kỵ tính cho đội Thương Lâm');
});

test('Kỵ binh đánh tạt sườn & bọc hậu (flank / rear): khuếch đại sát thương xung kích, gây sốc Sĩ khí nặng nề, và Viên Trận (circle) miễn nhiễm đánh lén', () => {
  // Kiểm tra phân vùng tiếp chiến hình học computeFlankZone
  const dummyDef = { x: 1500, y: 1100, facing: 0, formation: 'line' };
  assert.equal(computeFlankZone(1600, 1100, dummyDef), 'front');
  assert.equal(computeFlankZone(1500, 1200, dummyDef), 'flank');
  assert.equal(computeFlankZone(1400, 1100, dummyDef), 'rear');
  assert.equal(
    computeFlankZone(1400, 1100, { ...dummyDef, formation: 'circle' }),
    'front',
    'Viên Trận (antiFlank = true) biến mọi hướng đánh lén thành chính diện',
  );

  // So sánh sát thương & sốc sĩ khí khi Đột Kích Khinh Kỵ / Trường Thương Xung Kỵ húc Chính diện vs Tạt sườn vs Bọc hậu
  const runCavStrike = (zone) => {
    const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['lubu', 'wei'] });
    const cav = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'lance_cavalry');
    const inf = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
    inf.x = 1500;
    inf.y = 1100;
    inf.facing = 0; // nhìn về +X (Đông)
    inf.formation = 'shieldwall';
    recomputeRegimentDimensions(inf);
    inf.bracedTicks = 12;
    inf.morale = 75;

    if (zone === 'front') {
      cav.x = 1542;
      cav.y = 1100;
      cav.facing = Math.PI;
    } else if (zone === 'flank') {
      cav.x = 1500;
      cav.y = 1142;
      cav.facing = -Math.PI / 2;
    } else {
      cav.x = 1458; // sau lưng (-X)
      cav.y = 1100;
      cav.facing = 0;
    }
    cav.chargeTicks = 14;

    const startHp = inf.hp;
    const startMorale = inf.morale;
    stepMeleeAndCharges([cav, inf], 1 / 15, new Set());
    return {
      hpLost: startHp - inf.hp,
      moraleDrop: startMorale - inf.morale,
      bracedAfter: inf.bracedTicks,
    };
  };

  const frontRes = runCavStrike('front');
  const flankRes = runCavStrike('flank');
  const rearRes = runCavStrike('rear');

  assert.ok(
    rearRes.hpLost > flankRes.hpLost && flankRes.hpLost > frontRes.hpLost * 2,
    `sát thương Bọc hậu (${Math.round(rearRes.hpLost)}) > Tạt sườn (${Math.round(flankRes.hpLost)}) >> Chính diện Thuẫn Tường (${Math.round(frontRes.hpLost)})`,
  );
  assert.equal(frontRes.moraleDrop, 0, 'Thuẫn Tường cắm trụ trực diện không bị sốc sĩ khí');
  assert.equal(flankRes.moraleDrop, 12, 'tạt sườn gây sốc -12 Sĩ khí');
  assert.equal(rearRes.moraleDrop, 24, 'bọc hậu gây sốc -24 Sĩ khí kinh hoàng');
  assert.equal(rearRes.bracedAfter, 0, 'cú húc bọc hậu phá vỡ hoàn toàn trạng thái cắm trụ (bracedTicks = 0)');
});

// ============================================================================
// 7. ĐƠN ĐẤU DANH TƯỚNG 1V1 DIỄN NGHĨA & MƯU SĨ TỪ CHỐI ĐẤU VÕ (duel.ts)
// ============================================================================

test('Đơn Đấu Danh Tướng 1v1 chế độ Diễn Nghĩa (Quan Vũ vs Hạ Hầu Đôn): mở võ đài TwDuelFrame, ba quân dạt ra không can thiệp, giao phong định thắng bại', () => {
  const w = makeWorld(2, { mapId: 'pingyuan', romanceMode: true }, { factions: ['shu', 'wei'] });
  const guanYu = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'guan_yu');
  const xiahouDun = regsOf(w, 1).find((r) => r.isGeneral && r.generalId === 'xiahou_dun');
  const bystanderAlly = regsOf(w, 0).find((r) => !r.isGeneral);
  const bystanderEnemy = regsOf(w, 1).find((r) => !r.isGeneral);

  assert.ok(guanYu && xiahouDun && bystanderAlly && bystanderEnemy);
  isolateRegiments(w, [guanYu.id, xiahouDun.id, bystanderAlly.id, bystanderEnemy.id]);

  // Đặt Quan Vũ và Hạ Hầu Đôn cách nhau 120 đơn vị (<= 420), kèm lính hai bên đứng sát tâm võ đài (1600, 1100)
  guanYu.x = 1540;
  guanYu.y = 1100;
  xiahouDun.x = 1660;
  xiahouDun.y = 1100;
  xiahouDun.hidden = false;

  bystanderAlly.x = 1595;
  bystanderAlly.y = 1105;
  bystanderAlly.lockedTargetId = xiahouDun.id;
  bystanderEnemy.x = 1605;
  bystanderEnemy.y = 1095;
  bystanderEnemy.lockedTargetId = guanYu.id;
  bystanderEnemy.morale = 80;

  const err = w.command(0, {
    t: 'challenge_duel',
    generalRegId: guanYu.id,
    targetGeneralRegId: xiahouDun.id,
  });
  assert.equal(err, undefined, 'khai mở Đơn Đấu thành công');
  assert.equal(w.duels.length, 1);

  const duel = w.duels[0];
  assert.equal(guanYu.duelId, duel.id);
  assert.equal(xiahouDun.duelId, duel.id);
  assert.equal(guanYu.anim, 'duel');
  assert.equal(xiahouDun.anim, 'duel');

  // Ba quân xung quanh tự động dạt ra ngoài bán kính 95 và ngắt khóa mục tiêu vào tướng đang đấu
  assert.ok(Math.hypot(bystanderAlly.x - duel.x, bystanderAlly.y - duel.y) >= 95, 'quân đồng minh dạt ra ngoài vòng vây 95');
  assert.ok(Math.hypot(bystanderEnemy.x - duel.x, bystanderEnemy.y - duel.y) >= 95, 'quân địch dạt ra ngoài vòng vây 95');
  assert.equal(bystanderAlly.lockedTargetId, undefined);
  assert.equal(bystanderEnemy.lockedTargetId, undefined);

  // Lệnh công kích bên ngoài nhắm vào tướng đang Đơn Đấu bị từ chối danh dự
  const interfereErr = w.command(1, {
    t: 'attack_target',
    regIds: [bystanderEnemy.id],
    targetRegId: guanYu.id,
  });
  assert.match(interfereErr, /Đơn Đấu/);

  // Kiểm tra TwDuelFrame được đóng gói đầy đủ gửi tới client
  w.step();
  const fDuel = w.frameFor(0).duels[0];
  assert.ok(fDuel, 'có TwDuelFrame trong gói tin khung hình');
  assert.equal(fDuel.generalA, 'guan_yu');
  assert.equal(fDuel.generalB, 'xiahou_dun');

  // Mô phỏng liên tiếp cho đến khi phân định sinh tử trên võ đài
  const enemyMoraleBeforeFinish = bystanderEnemy.morale;
  let ticksGuard = 0;
  while (w.duels.length > 0 && ticksGuard < 480) {
    w.step();
    ticksGuard++;
  }

  assert.equal(w.duels.length, 0, 'trận Đơn Đấu kết thúc phân thắng bại');
  assert.ok(guanYu.hp === 0 || xiahouDun.hp === 0, 'một trong hai mãnh tướng ngã ngựa trên võ đài');
  const winner = guanYu.hp > 0 ? guanYu : xiahouDun;
  const loser = winner === guanYu ? xiahouDun : guanYu;
  assert.equal(loser.anim, 'dead');
  assert.equal(winner.duelId, undefined);
  assert.ok(winner.kills >= 1, 'tướng thắng được ghi nhận chiến công trảm tướng');
  if (loser === xiahouDun) {
    assert.ok(bystanderEnemy.morale < enemyMoraleBeforeFinish - 15, 'toàn quân của bại tướng bị sốc Sĩ khí nặng (-28)');
  }
});

test('Mưu Sĩ hệ Thủy (Gia Cát Lượng / Chu Du) từ chối Đơn Đấu 1v1 và Chế độ Sử Gia (romanceMode=false) khóa Đơn Đấu', () => {
  // 1. Mưu Sĩ hệ Thủy phe phẩy quạt lông từ chối đấu võ tay đôi
  const wRomance = makeWorld(2, { mapId: 'pingyuan', romanceMode: true }, { factions: ['lubu', 'shu'] });
  const luBu = regsOf(wRomance, 0).find((r) => r.isGeneral && r.generalId === 'lu_bu');
  const zhugeLiang = regsOf(wRomance, 1).find((r) => r.isGeneral && r.generalId === 'zhuge_liang');
  const zhouYu = regsOf(wRomance, 0).find((r) => r.isGeneral && r.generalId === 'zhou_yu');
  const guanYu = regsOf(wRomance, 1).find((r) => r.isGeneral && r.generalId === 'guan_yu');
  assert.ok(luBu && zhugeLiang && zhouYu && guanYu);

  luBu.x = 1500;
  luBu.y = 1100;
  zhugeLiang.x = 1720; // khoảng cách 220 (>= 110 và <= 420)
  zhugeLiang.y = 1100;
  zhugeLiang.hidden = false;

  const refuseMsg1 = wRomance.command(0, {
    t: 'challenge_duel',
    generalRegId: luBu.id,
    targetGeneralRegId: zhugeLiang.id,
  });
  assert.match(refuseMsg1, /Gia Cát Lượng.*Mưu Sĩ.*từ chối Đơn Đấu/i);
  assert.equal(wRomance.duels.length, 0);

  // Chu Du (Mưu Sĩ) chủ động thách đấu Quan Vũ ở cự ly 220 cũng từ chối đấu võ
  zhouYu.x = 1500;
  zhouYu.y = 1300;
  guanYu.x = 1720;
  guanYu.y = 1300;
  guanYu.hidden = false;
  const refuseMsg2 = wRomance.command(0, {
    t: 'challenge_duel',
    generalRegId: zhouYu.id,
    targetGeneralRegId: guanYu.id,
  });
  assert.match(refuseMsg2, /Chu Du.*Mưu Sĩ/i);
  assert.equal(wRomance.duels.length, 0);

  // 2. Chế độ Sử Gia (romanceMode = false) không mở Đơn Đấu 1v1
  const wRecords = makeWorld(2, { mapId: 'pingyuan', romanceMode: false }, { factions: ['lubu', 'shu'] });
  const rLuBu = regsOf(wRecords, 0).find((r) => r.isGeneral && r.generalId === 'lu_bu');
  const rGuanYu = regsOf(wRecords, 1).find((r) => r.isGeneral && r.generalId === 'guan_yu');
  rLuBu.x = 1550;
  rLuBu.y = 1100;
  rGuanYu.x = 1650;
  rGuanYu.y = 1100;
  rGuanYu.hidden = false;

  const recordsErr = wRecords.command(0, {
    t: 'challenge_duel',
    generalRegId: rLuBu.id,
    targetGeneralRegId: rGuanYu.id,
  });
  assert.match(recordsErr, /Chế độ Sử Gia|Diễn Nghĩa/i);
  assert.equal(wRecords.duels.length, 0);
});

// ============================================================================
// 8. 5 NHÓM TUYỆT KỸ NGŨ HÀNH CHỦ ĐỘNG (use_skill) & HỒI CHIÊU
// ============================================================================

test('Tuyệt kỹ Ngũ Hành (1/3): Xung Chấn Diện Rộng (aoe_smash: Trương Phi / Lữ Bố) & Độc Nhãn Đơn Trảm (duel_buff: Hạ Hầu Đôn) kèm hồi chiêu', () => {
  const w = makeWorld(2, { mapId: 'pingyuan', romanceMode: true }, { factions: ['lubu', 'wei'] });
  const zhangFei = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'zhang_fei'); // aoe_smash
  const xiahouDun = regsOf(w, 1).find((r) => r.isGeneral && r.generalId === 'xiahou_dun'); // duel_buff
  const weiVictim = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
  const lubuVictim = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
  assert.ok(zhangFei && xiahouDun && weiVictim && lubuVictim);

  // 1. Tiếng Thét Trường Bản (aoe_smash): sát thương diện rộng + trấn áp -28 Sĩ khí quân địch xung quanh
  zhangFei.x = 1400;
  zhangFei.y = 1100;
  weiVictim.x = 1480; // trong bán kính 175
  weiVictim.y = 1100;
  weiVictim.morale = 75;
  const victimHpBefore = weiVictim.hp;

  assert.equal(w.command(0, { t: 'use_skill', generalRegId: zhangFei.id }), undefined);
  assert.ok(weiVictim.hp < victimHpBefore - 1500, 'aoe_smash gây sát thương xung chấn lớn lên trung đoàn địch');
  assert.ok(weiVictim.morale <= 47.1, 'Tiếng Thét Trường Bản trừ thẳng -28 Sĩ khí địch');
  assert.equal(zhangFei.skillCooldownLeft, TW_GENERALS.zhang_fei.skill.cooldownSec);

  // Bấm lại ngay lập tức khi đang hồi chiêu -> báo lỗi từ chối
  assert.match(w.command(0, { t: 'use_skill', generalRegId: zhangFei.id }), /hồi chiêu/);

  // 2. Độc Nhãn Cuồng Nộ (duel_buff): cường hóa +45% Công cận chiến & trảm kích đơn mục tiêu áp sát
  xiahouDun.x = 1800;
  xiahouDun.y = 1100;
  lubuVictim.x = 1860;
  lubuVictim.y = 1100;
  lubuVictim.morale = 70;
  const lubuHpBefore = lubuVictim.hp;

  assert.equal(w.command(1, { t: 'use_skill', generalRegId: xiahouDun.id }), undefined);
  assert.equal(xiahouDun.activeBuff, 'duel_buff');
  assert.ok(xiahouDun.auraAtkMul >= 1.45, 'tăng +45% Công cận chiến');
  assert.ok(lubuVictim.hp < lubuHpBefore - 1000, 'tung đòn trảm kích trực tiếp vào kẻ địch cạnh bên');
  assert.ok(lubuVictim.morale <= 56.1, 'gây sụt giảm -14 Sĩ khí lên mục tiêu bị chém');
  assert.equal(xiahouDun.skillCooldownLeft, TW_GENERALS.xiahou_dun.skill.cooldownSec);
});

test('Tuyệt kỹ Ngũ Hành (2/3): Kim Thân Hộ Thể (iron_evasion: Triệu Vân) & Tù Và Hiệu Lệnh (rally_horn: Tào Tháo) tăng thủ/tốc chạy/sĩ khí', () => {
  const w = makeWorld(2, { mapId: 'pingyuan', romanceMode: true }, { factions: ['wu', 'wei'] });
  const zhaoYun = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'zhao_yun'); // iron_evasion
  const wuAlly = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'spear_guards');
  const caoCao = regsOf(w, 1).find((r) => r.isGeneral && r.generalId === 'cao_cao'); // rally_horn
  const weiRoutingAlly = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'jian_sword_guards');
  assert.ok(zhaoYun && wuAlly && caoCao && weiRoutingAlly);

  // 1. Đơn Kỵ Cứu Chúa (iron_evasion — ally_defense_buff): +45 Thủ cận chiến & Sĩ khí bất khuất
  zhaoYun.x = 1100;
  zhaoYun.y = 1100;
  wuAlly.x = 1160; // trong bán kính 150
  wuAlly.y = 1100;
  wuAlly.morale = 40;

  assert.equal(w.command(0, { t: 'use_skill', generalRegId: zhaoYun.id }), undefined);
  assert.equal(zhaoYun.activeBuff, 'iron_evasion');
  assert.equal(wuAlly.activeBuff, 'iron_evasion');
  assert.ok(zhaoYun.auraDefAdd >= 45 && wuAlly.auraDefAdd >= 35, 'cộng mạnh Thủ cận chiến cho bản thân & đồng minh');
  assert.ok(wuAlly.morale >= 92 && wuAlly.moraleState === 'eager', 'đưa đồng minh lên trạng thái Sĩ khí bất khuất');
  assert.equal(zhaoYun.skillCooldownLeft, TW_GENERALS.zhao_yun.skill.cooldownSec);

  // 2. Ngụy Võ Hiệu Lệnh (rally_horn — ally_speed_charge_buff): chấn chỉnh quân tháo chạy, hồi thể lực & +15% tốc chạy
  caoCao.x = 2100;
  caoCao.y = 1100;
  weiRoutingAlly.x = 2180; // trong bán kính 240
  weiRoutingAlly.y = 1100;
  weiRoutingAlly.morale = 14;
  weiRoutingAlly.moraleState = 'routing';
  weiRoutingAlly.anim = 'rout';
  weiRoutingAlly.fatigueVal = 70;
  weiRoutingAlly.fatigue = 'winded';

  assert.equal(w.command(1, { t: 'use_skill', generalRegId: caoCao.id }), undefined);
  assert.equal(weiRoutingAlly.activeBuff, 'rally_horn');
  assert.notEqual(weiRoutingAlly.moraleState, 'routing', 'tù và Thống Soái lập tức gọi quân đang tháo chạy quay lại chiến đấu');
  assert.ok(weiRoutingAlly.auraSpeedMul >= 1.15 && weiRoutingAlly.auraAtkMul >= 1.18, 'tăng tốc độ xung phong & công cận chiến');
  assert.ok(weiRoutingAlly.fatigueVal <= 25, 'hồi phục mạnh thể lực hành quân');
  assert.equal(caoCao.skillCooldownLeft, TW_GENERALS.cao_cao.skill.cooldownSec);

  // Kiểm tra bộ đếm hồi chiêu giảm dần sau mỗi nhịp mô phỏng
  w.step();
  assert.ok(caoCao.skillCooldownLeft < TW_GENERALS.cao_cao.skill.cooldownSec);
});

test('Tuyệt kỹ Ngũ Hành (3/3): Kỳ Môn Hỏa Tiễn (fire_volley: Gia Cát Lượng) truyền tên lửa, nạp đạn tức thì và thiêu đốt trừ Sĩ khí địch', () => {
  const w = makeWorld(2, { mapId: 'pingyuan', romanceMode: true }, { factions: ['shu', 'wei'] });
  const zhugeLiang = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'zhuge_liang'); // fire_volley
  const shuCrossbow = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'crossbowmen');
  const weiTarget = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'heavy_ji_infantry');
  assert.ok(zhugeLiang && shuCrossbow && weiTarget);

  zhugeLiang.x = 1300;
  zhugeLiang.y = 1100;
  shuCrossbow.x = 1360;
  shuCrossbow.y = 1120;
  shuCrossbow.reloadLeftSec = 4.5;
  shuCrossbow.fireArrowActive = false;

  weiTarget.x = 1650; // cách 350 <= maxCastRange (620)
  weiTarget.y = 1100;
  weiTarget.morale = 72;
  weiTarget.hidden = false;
  const enemyHpBefore = weiTarget.hp;

  const err = w.command(0, {
    t: 'use_skill',
    generalRegId: zhugeLiang.id,
    targetX: weiTarget.x,
    targetY: weiTarget.y,
  });
  assert.equal(err, undefined);

  assert.equal(shuCrossbow.fireArrowActive, true, 'truyền hiệu ứng Hỏa Tiễn cho bộ cung/nỏ lân cận');
  assert.equal(shuCrossbow.reloadLeftSec, 0, 'nạp tên tức thì (reloadLeftSec = 0)');
  assert.ok(shuCrossbow.auraAtkMul >= 1.25, '+25% sát thương tầm xa');
  assert.ok(weiTarget.hp < enemyHpBefore - 500, 'bão lửa thiêu đốt trực tiếp quân địch tại vùng chỉ định');
  assert.ok(weiTarget.morale <= 58.1, 'hỏa công rút -14 Sĩ khí quân địch');
  assert.equal(zhugeLiang.skillCooldownLeft, TW_GENERALS.zhuge_liang.skill.cooldownSec);
});

// ============================================================================
// 9. SĨ KHÍ THÁO CHẠY (ROUTING), TAN RÃ (SHATTERED) & THỐNG SOÁI CHỈNH ĐỐN
// ============================================================================

test('cơ chế Sĩ khí Vỡ trận (routing) và Tan rã vĩnh viễn (shattered) khi quân số tổn thất nặng (< 12% maxMen)', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['wei', 'yuan'] });
  const routReg = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'sabre_infantry');
  const shatterReg = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'heavy_ji_infantry');
  const commanderGen = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'cao_cao');
  const enemyReg = regsOf(w, 1).find((r) => !r.isGeneral);
  assert.ok(routReg && shatterReg && commanderGen && enemyReg);

  isolateRegiments(w, [routReg.id, shatterReg.id, commanderGen.id, enemyReg.id]);

  // Đặt Tào Tháo ở rất xa để không cộng hào quang giữ sĩ khí
  commanderGen.x = 200;
  commanderGen.y = 2000;

  // 1. Hạ Sĩ khí xuống dưới ngưỡng 20 -> chuyển sang 'routing' & hoạt ảnh 'rout' bỏ chạy
  routReg.x = 1500;
  routReg.y = 1100;
  routReg.morale = 15;
  enemyReg.x = 1545;
  enemyReg.y = 1100;

  // 2. Thương vong thảm khốc (< 12% quân số: 10/120 lính) và sĩ khí cạn kiệt -> 'shattered' vĩnh viễn
  shatterReg.x = 1500;
  shatterReg.y = 1220;
  shatterReg.men = Math.floor(shatterReg.maxMen * 0.08); // ~9/120 (< 12%)
  shatterReg.hp = shatterReg.men * TW_UNITS[shatterReg.kind].hpPerMan;
  shatterReg.morale = 4;

  steps(w, 2);
  assert.equal(routReg.moraleState, 'routing', 'sĩ khí < 20 kích hoạt tháo chạy (routing)');
  assert.equal(routReg.anim, 'rout', 'chuyển hoạt ảnh tháo chạy (anim === rout)');

  assert.equal(shatterReg.moraleState, 'shattered', 'tổn thất > 88% quân số kèm kiệt quệ sĩ khí gây Tan rã vĩnh viễn');
  assert.equal(shatterReg.morale, 0);
  assert.equal(shatterReg.anim, 'rout');

  // Kể cả khi kéo đơn vị đã 'shattered' về đứng sát cạnh Thống Soái Tào Tháo an toàn, đơn vị đó KHÔNG bao giờ hồi phục
  shatterReg.x = commanderGen.x + 20;
  shatterReg.y = commanderGen.y;
  steps(w, 60);
  assert.equal(shatterReg.moraleState, 'shattered', 'quân đã shattered không thể chỉnh đốn trở lại');
});

test('hào quang Thống Soái (Commander Aura) chỉnh đốn (Rally) quân đang tháo chạy quay lại hàng ngũ chiến đấu', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'wei'] });
  const liuBei = regsOf(w, 0).find((r) => r.isGeneral && r.generalId === 'liu_bei'); // class === 'commander'
  const routingUnit = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'jian_sword_guards');
  const distantEnemy = regsOf(w, 1).find((r) => r.isGeneral);
  assert.ok(liuBei && routingUnit && distantEnemy);

  isolateRegiments(w, [liuBei.id, routingUnit.id, distantEnemy.id]);

  // Đưa trung đoàn đang tháo chạy (còn đông quân 110/120) về dưới bóng đại kỳ Lưu Bị, cách xa quân địch (> 260)
  liuBei.x = 900;
  liuBei.y = 1100;
  routingUnit.x = 940;
  routingUnit.y = 1100;
  routingUnit.men = 110;
  routingUnit.hp = 110 * TW_UNITS.jian_sword_guards.hpPerMan;
  routingUnit.morale = 17;
  routingUnit.moraleState = 'routing';
  routingUnit.anim = 'rout';

  distantEnemy.x = 2600;
  distantEnemy.y = 1100;

  // Chạy mô phỏng để hào quang Thống Soái (+16 Sĩ khí + thưởng an toàn) nâng Sĩ khí vượt ngưỡng Rally (36)
  steps(w, 60);
  assert.ok(routingUnit.morale >= 36, `sĩ khí hồi phục vượt ngưỡng 36 (thực tế: ${routingUnit.morale})`);
  assert.ok(
    routingUnit.moraleState === 'steady' || routingUnit.moraleState === 'eager',
    `chỉnh đốn thành công về trạng thái chiến đấu (${routingUnit.moraleState})`,
  );
  assert.notEqual(routingUnit.anim, 'rout', 'dừng tháo chạy và sẵn sàng nhận lệnh mới');
});

// ============================================================================
// 10. CHIẾM ĐÀI HIỆU LỆNH, AI CHƯ HẦU & PHÒNG CHƠI GAME / ROOMSSERVICE CƯỢC XU
// ============================================================================

test('tranh chấp Đài Hiệu Lệnh & Chiến thắng Chiến lược: giữ vững >= 2/3 Đài Hiệu Lệnh ở mức 100% suốt 45 giây (675 nhịp) định đoạt bá nghiệp', () => {
  const w = makeWorld(2, { mapId: 'pingyuan', durationMin: 20 }, { factions: ['jin', 'yuan'], teams: [0, 1] });
  const cp0 = w.map.capturePoints[0]; // (1600, 1100)
  const cp2 = w.map.capturePoints[2]; // (740, 560)

  const team0RegA = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'yellow_dragons');
  const team0RegB = regsOf(w, 0).find((r) => !r.isGeneral && r.kind === 'jian_sword_guards');
  const team1Contester = regsOf(w, 1).find((r) => !r.isGeneral && r.kind === 'yellow_dragons');
  const team1Reserve = regsOf(w, 1).find((r) => r.isGeneral);
  assert.ok(team0RegA && team0RegB && team1Contester && team1Reserve);

  isolateRegiments(w, [team0RegA.id, team0RegB.id, team1Contester.id, team1Reserve.id]);

  // 1. Khi hai phe ngang sức cùng đứng trong vòng Đài Hiệu Lệnh -> điểm bị khóa giằng co (Contested, progress giữ nguyên 0)
  team0RegA.x = cp0.x;
  team0RegA.y = cp0.y;
  team1Contester.x = cp0.x + 30;
  team1Contester.y = cp0.y;
  team1Reserve.x = 2900;
  team1Reserve.y = 1900;

  stepCapturePoints(w.map, w.captures, [team0RegA, team1Contester], 1.0);
  assert.equal(w.captures[0].progress, 0, 'hai phe cân sức trong vòng chiếm điểm -> khóa thanh tiến độ');

  // 2. Rút quân địch ra xa, cho Liên Minh 0 đứng chiếm trọn CP #0 và CP #2 lên 100%
  team1Contester.x = 2850;
  team1Contester.y = 1850;
  team0RegB.x = cp2.x;
  team0RegB.y = cp2.y;

  // Chạy cho tới khi cả 2 Đài Hiệu Lệnh đều đạt 100% thuộc team 0 (~10 giây = 150 nhịp)
  let capTicks = 0;
  while ((w.captures[0].ownerTeam !== 0 || w.captures[2].ownerTeam !== 0) && capTicks < 220) {
    w.step();
    capTicks++;
  }
  assert.equal(w.captures[0].ownerTeam, 0);
  assert.equal(w.captures[0].progress, 100);
  assert.equal(w.captures[2].ownerTeam, 0);
  assert.equal(w.captures[2].progress, 100);
  assert.equal(w.result, undefined, 'mới vừa chiếm xong 2/3 đài, chưa hết 45s đếm ngược');

  // 3. Giữ vững >= 2/3 Đài Hiệu Lệnh suốt 675 nhịp (45 giây ở 15 Hz) -> kích hoạt Chiến thắng Chiến lược!
  steps(w, 675);
  assert.ok(w.result, 'đủ 45 giây (675 nhịp) nắm giữ >= 2/3 Đài Hiệu Lệnh phải thắng chiến lược');
  assert.equal(w.result.winnerTeam, 0);
  assert.deepEqual(w.result.winnerIdxs, [0]);
  assert.match(w.result.reason, /Đài Hiệu Lệnh.*45 giây.*Chiến Thắng Chiến Lược/);
  assert.equal(w.running, false);
});

test('Trí tuệ nhân tạo Chư hầu (Bot AI Commander): điều binh tác chiến suốt 180 nhịp mượt mà 0 lỗi', () => {
  const w = makeWorld(
    2,
    { mode: 'historical_2teams', mapId: 'pingyuan', romanceMode: true },
    { factions: ['jin', 'yuan'], teams: [0, 1], bots: [true, true] },
  );

  const initialPositions = new Map(w.regiments.map((r) => [r.id, { x: r.x, y: r.y }]));

  // Chạy 180 nhịp (12 giây thực tế = 15 chu kỳ suy nghĩ của Warlord AI)
  steps(w, 180);

  let movedCount = 0;
  for (const r of w.regiments) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y), `tọa độ hữu hạn cho reg #${r.id}`);
    const init = initialPositions.get(r.id);
    if (init && Math.hypot(r.x - init.x, r.y - init.y) > 25) {
      movedCount++;
    }
  }
  assert.ok(movedCount >= 12, `AI chủ động điều động đại quân hành quân chiếm điểm (${movedCount} trung đoàn di chuyển)`);
});

function createTwGame(n = 3) {
  const frames = [];
  const hooks = {
    changed() {},
    removed() {},
    fx() {},
    notify() {},
    antsFrame() {},
    linkState() {},
    thapFrame() {},
    twFrame(_g, id, f) {
      frames.push([id, f]);
    },
  };
  const g = new Game('TW3K', hooks, {}, 'exploding_kittens');
  for (let i = 0; i < n; i++) {
    g.addPlayer(`p${i}`, `Chúa Công ${i}`);
  }
  return { g, frames };
}

function readyAll(g) {
  for (const p of g.players) {
    if (p.id !== g.hostId) {
      g.setReady(p.id, true, g.rulesVersion);
    }
  }
}

test('phòng chờ Game (total_war): setGameMode, setTwConfig, setTwFaction, setTwTeam và kiểm tra điều kiện khai chiến', () => {
  const { g } = createTwGame(2);
  try {
    // Chuyển sang chế độ Tam Quốc Toàn Chiến từ phòng chờ
    assert.throws(() => g.setGameMode('p1', 'total_war'), /chủ phòng/i);
    g.setGameMode('p0', 'total_war');
    assert.equal(g.gameMode, 'total_war');
    assert.equal(g.seatLimit(), 8);

    // Chỉ chủ phòng được chỉnh chiến dịch
    assert.throws(() => g.setTwConfig('p1', { mapId: 'chibi' }), /chủ phòng/i);
    g.setTwConfig('p0', { mode: 'historical_2teams', mapId: 'chibi', bots: 0, durationMin: 15, armyScale: 'grand' });

    // Người chơi tự chọn thế lực Chư hầu & Liên Minh
    g.setTwFaction('p0', 'jin');
    g.setTwFaction('p1', 'yuan');
    g.setTwTeam('p0', 0);
    g.setTwTeam('p1', 1);

    const lobbyView = g.viewFor('p0').tw;
    assert.equal(lobbyView.config.mapId, 'chibi');
    assert.equal(lobbyView.config.armyScale, 'grand');
    assert.deepEqual(lobbyView.factions, { p0: 'jin', p1: 'yuan' });
    assert.deepEqual(lobbyView.teams, { p0: 0, p1: 1 });

    // Chưa xác nhận luật (ready) -> chặn bắt đầu
    assert.throws(() => g.validateStart('p0'), /Chờ xác nhận luật/i);
    readyAll(g);
    g.validateStart('p0');

    // Chuyển sang Hỗn chiến (ffa) -> không cho phép chọn Liên Minh cố định
    g.setTwConfig('p0', { mode: 'ffa', mapId: 'guandu', bots: 0, durationMin: 10 });
    assert.throws(() => g.setTwTeam('p0', 1), /Lịch Sử Đối Kháng/i);

    // Nếu chỉ còn 1 người và 0 Máy AI -> không đủ 2 thế lực để khai chiến
    g.removePlayer('p1');
    assert.throws(() => g.validateStart('p0'), /ít nhất 2 thế lực Chư Hầu/i);
  } finally {
    g.dispose();
  }
});

test('vòng đời trận đấu Game: phát khung hình realtime, lệnh twCommand giữa trận, xin hàng (resign) và chia hũ xu Liên Minh thắng', () => {
  const { g, frames } = createTwGame(3);
  try {
    g.setGameMode('p0', 'total_war');
    g.setTwConfig('p0', { mode: 'historical_2teams', mapId: 'pingyuan', bots: 0, durationMin: 15, romanceMode: true });
    g.setTwFaction('p0', 'jin');
    g.setTwFaction('p1', 'shu');
    g.setTwFaction('p2', 'yuan');
    g.setTwTeam('p0', 0);
    g.setTwTeam('p1', 0);
    g.setTwTeam('p2', 1);
    g.addSpectator('spec1', 'Khán Giả Tam Quốc');

    readyAll(g);
    g.bet = 100;
    g.pot = 301; // hũ lẻ để kiểm tra chia dư chính xác cho người đầu Liên Minh

    g.start('p0');
    const w = g['tw'];
    assert.ok(w, 'khởi tạo TwWorld');
    w.stop(); // dừng bộ hẹn giờ tự động để bước từng nhịp kiểm định chính xác

    assert.equal(g.phase, 'playing');
    const v0 = g.viewFor('p0').tw;
    assert.equal(v0.mapId, 'pingyuan');
    assert.equal(v0.mapW, 3200);
    assert.equal(v0.mapH, 2200);
    assert.equal(v0.players.length, 3);
    assert.equal(v0.myIdx, 0);
    assert.ok(frames.some(([id]) => id === 'p0') && frames.some(([id]) => id === 'spec1'), 'gửi twFrame cho cả người chơi & khán giả');

    // Khán giả gửi lệnh điều quân -> từ chối
    assert.throws(() => g.twCommand('spec1', { t: 'halt', regIds: [1] }), /đang xem/i);

    // Người chơi p0 gửi lệnh dàn quân hợp lệ giữa trận
    const p0Inf = regsOf(w, 0).filter((r) => !r.isGeneral).map((r) => r.id);
    g.twCommand('p0', { t: 'move_line', regIds: p0Inf.slice(0, 3), x: 1400, y: 1100, facing: 0, width: 420 });
    w.step();
    assert.equal(regsOf(w, 0).find((r) => r.id === p0Inf[0]).anim, 'march');

    // Chư hầu đối phương p2 hạ kỳ xin hàng -> Liên Minh 0 (p0 & p1) toàn thắng và chia đều hũ 301 xu!
    g.twCommand('p2', { t: 'resign' });
    assert.equal(g.phase, 'ended');
    assert.deepEqual(g.winners(), ['p0', 'p1']);
    assert.equal(g.payouts.p0, 151);
    assert.equal(g.payouts.p1, 150);
    assert.equal(g.payouts.p0 + g.payouts.p1, 301);
    assert.equal(g.payouts.p2, undefined);
    assert.equal(g.viewFor('p0').tw.result.winnerTeam, 0);

    // Chơi lại ván mới từ trạng thái ended -> quay về phòng chờ sạch sẽ
    g.restart('p0');
    assert.equal(g.phase, 'lobby');
    assert.equal(g['tw'], undefined);
  } finally {
    g.dispose();
  }
});

test('máy AI thắng trận hoàn lại tiền cược cho người chơi ở lại, rời phòng giữa trận tính xin hàng, và dispose() dọn sạch bộ hẹn giờ', () => {
  // Kịch bản A: 1 Người đấu 1 Máy AI — người xin hàng -> Máy thắng -> hoàn cược cho người ở lại
  const { g: gRefund } = createTwGame(1);
  try {
    gRefund.setGameMode('p0', 'total_war');
    gRefund.setTwConfig('p0', { mode: 'historical_2teams', mapId: 'pingyuan', bots: 1, durationMin: 10 });
    gRefund.bet = 100;
    gRefund.pot = 100;
    gRefund.start('p0');
    assert.equal(gRefund['tw'].running, true);

    gRefund.twCommand('p0', { t: 'resign' });
    assert.equal(gRefund.phase, 'ended');
    assert.equal(gRefund.winners().length, 0, 'máy thắng nên danh sách người thắng rỗng');
    assert.equal(gRefund.payouts.p0, 100, 'người chơi còn ở lại phòng được hoàn đủ 100 xu cược');
  } finally {
    gRefund.dispose();
  }

  // Kịch bản B: 2 Người (p0, p1) cùng phe đấu 1 Máy AI — p0 thoát phòng (removePlayer -> left=true), p1 xin hàng -> chỉ hoàn cược cho p1 ở lại, và kiểm tra dispose() tắt sạch timer
  const { g: gLeave } = createTwGame(2);
  try {
    gLeave.setGameMode('p0', 'total_war');
    gLeave.setTwConfig('p0', { mode: 'historical_2teams', mapId: 'guandu', bots: 1, durationMin: 10 });
    gLeave.setTwTeam('p0', 0);
    gLeave.setTwTeam('p1', 0);
    readyAll(gLeave);
    gLeave.bet = 200;
    gLeave.pot = 400;
    gLeave.start('p0');

    const worldRef = gLeave['tw'];
    assert.equal(worldRef.running, true);

    // p0 rời phòng giữa trận -> tự động xin hàng cho đạo quân p0, trận vẫn tiếp diễn vì còn đồng minh p1
    gLeave.removePlayer('p0');
    assert.equal(gLeave.phase, 'playing');
    assert.equal(worldRef.sideById('p0').alive, false);

    // p1 xin hàng nốt -> Máy AI thắng -> chỉ hoàn 200 xu cho p1 (người ở lại), p0 bỏ phòng không nhận hoàn cược
    gLeave.twCommand('p1', { t: 'resign' });
    assert.equal(gLeave.phase, 'ended');
    assert.equal(gLeave.payouts.p1, 200);
    assert.equal(gLeave.payouts.p0, undefined);
  } finally {
    gLeave.dispose();
  }

  // Kịch bản C: Kiểm tra trực tiếp dispose() dừng hẳn setInterval của TwWorld đang chạy
  const { g: gTimer } = createTwGame(1);
  gTimer.setGameMode('p0', 'total_war');
  gTimer.setTwConfig('p0', { bots: 1 });
  gTimer.start('p0');
  const activeWorld = gTimer['tw'];
  assert.equal(activeWorld.running, true);
  gTimer.dispose();
  assert.equal(activeWorld.running, false, 'dispose() dừng hoàn toàn bộ đếm nhịp 15 Hz của TwWorld');
});

class InMemoryAccountStore {
  kind = 'local';
  content = '{"version":1,"accounts":{}}';
  version = '0';
  async read() {
    return { content: this.content, version: this.version };
  }
  async write(content, version) {
    assert.equal(version, this.version);
    this.content = content;
    this.version = String(Number(this.version) + 1);
    return this.version;
  }
}

test('tích hợp RoomsService & AccountsService: trừ xu đặt cược vào hũ (pot), chia thưởng xu cho Liên Minh thắng và hoàn xu khi Máy AI thắng', async () => {
  const db = new DbService(new InMemoryAccountStore());
  await db.onModuleInit();
  const accounts = new AccountsService(db);

  const pJin = 'player_jin_01';
  const pShu = 'player_shu_02';
  const pYuan = 'player_yuan_03';

  await accounts.register(pJin, 'Tư Mã Trọng Hòa', '1234', 'cat:1');
  await accounts.register(pShu, 'Lưu Huyền Đức', '1234', 'cat:2');
  await accounts.register(pYuan, 'Viên Bản Sơ', '1234', 'cat:3');

  const emittedFrames = [];
  const rooms = new RoomsService(accounts);
  rooms.bind({
    to(channel) {
      return {
        volatile: {
          emit(ev, payload) {
            if (ev === 'tw:frame') emittedFrames.push([channel, payload]);
          },
        },
        emit(ev, payload) {
          if (ev === 'tw:frame') emittedFrames.push([channel, payload]);
        },
      };
    },
    in() {
      return { fetchSockets: async () => [] };
    },
  });

  rooms.setVerified(pJin, true);
  rooms.setVerified(pShu, true);
  rooms.setVerified(pYuan, true);

  // Tạo phòng Tam Quốc Toàn Chiến, cược 200 xu/người (3 người = hũ 600 xu)
  rooms.create(pJin, 'Tư Mã Trọng Hòa', 'cat:1', {}, 'total_war');
  const room = rooms.roomOf(pJin);
  assert.ok(room);

  try {
    rooms.join(room.code, pShu, 'Lưu Huyền Đức', 'cat:2');
    rooms.join(room.code, pYuan, 'Viên Bản Sơ', 'cat:3');

    rooms.setTwConfig(pJin, { mode: 'historical_2teams', mapId: 'pingyuan', bots: 0, durationMin: 15 });
    rooms.setTwFaction(pJin, 'jin');
    rooms.setTwFaction(pShu, 'shu');
    rooms.setTwFaction(pYuan, 'yuan');
    rooms.setTwTeam(pJin, 0);
    rooms.setTwTeam(pShu, 0);
    rooms.setTwTeam(pYuan, 1);
    rooms.setBet(pJin, 200);

    rooms.setReady(pShu, true, room.rulesVersion);
    rooms.setReady(pYuan, true, room.rulesVersion);

    await rooms.startGame(pJin);
    room['tw'].stop();

    // Đã trừ đúng 200 xu mỗi người (1000 -> 800), tổng hũ 600 xu
    assert.equal(room.pot, 600);
    assert.equal(accounts.get(pJin).coins, 800);
    assert.equal(accounts.get(pShu).coins, 800);
    assert.equal(accounts.get(pYuan).coins, 800);
    assert.ok(emittedFrames.length >= 3, 'phát sự kiện tw:frame tới các người chơi qua Socket');

    // pYuan xin hàng -> Liên Minh 0 (pJin & pShu) thắng, mỗi người nhận +300 xu (800 + 300 = 1100 xu)
    rooms.twCommand(pYuan, { t: 'resign' });
    await rooms.restartGame(pJin);

    assert.equal(accounts.get(pJin).coins, 1100);
    assert.equal(accounts.get(pShu).coins, 1100);
    assert.equal(accounts.get(pYuan).coins, 800);
    assert.equal(accounts.get(pJin).wins, 1);
    assert.equal(accounts.get(pShu).wins, 1);
    assert.equal(accounts.get(pYuan).wins, 0);

    // Ván 2: pShu và pYuan rời phòng, pJin đấu 1v1 với Máy AI cược 200 xu; Máy thắng -> hoàn đủ 200 xu về 1100!
    rooms.leave(pShu);
    rooms.leave(pYuan);
    rooms.setTwConfig(pJin, { mode: 'historical_2teams', mapId: 'chibi', bots: 1, durationMin: 10 });
    rooms.setBet(pJin, 200);

    await rooms.startGame(pJin);
    room['tw'].stop();
    assert.equal(accounts.get(pJin).coins, 900);

    rooms.twCommand(pJin, { t: 'resign' });
    await rooms.restartGame(pJin);
    assert.equal(accounts.get(pJin).coins, 1100, 'Máy AI thắng trận hoàn trả nguyên vẹn 200 xu cược cho người chơi');
  } finally {
    room.dispose();
  }
});

// ============================================================================
// PHASE II: 10 CƠ CHẾ CHIẾN THUẬT CHUYÊN SÂU TOTAL WAR: THREE KINGDOMS & 0 A.D. / YUKA
// ============================================================================

test('Chiêu Mộ Danh Tướng & Bộ Tùy (setTwLoadout, TW_BATTLE_FUNDS = 12.500): tự chọn 3 Tướng + 12 đạo quân, kiểm tra ngân quỹ và sinh đúng quân vào trận', () => {
  const { g } = createTwGame(1);
  try {
    g.setGameMode('p0', 'total_war');
    g.setTwConfig('p0', { mode: 'historical_2teams', mapId: 'pingyuan', bots: 1, durationMin: 15 });
    g.setTwFaction('p0', 'shu');

    // Khai báo đạo quân tùy chỉnh hợp lệ trong ngân quỹ 12.500 Lượng (Lưu Bị, Quan Vũ, Gia Cát Lượng)
    const customLoadout = {
      generals: ['liu_bei', 'guan_yu', 'zhuge_liang'],
      retinues: [
        ['yi_archers', 'spear_guards', 'sabre_cavalry', 'sword_guards'],
        ['azure_dragons', 'heavy_ji_infantry', 'spear_guards', 'ji_militia'],
        ['onyx_dragons', 'crossbowmen', 'trebuchet', 'archer_militia'],
      ],
    };
    const cost = S.twLoadoutCost(customLoadout);
    assert.ok(cost > 0 && cost <= S.TW_BATTLE_FUNDS, `ngân quỹ hợp lệ ${cost} <= ${S.TW_BATTLE_FUNDS}`);

    g.setTwLoadout('p0', customLoadout);
    const lobbyTw = g.viewFor('p0').tw;
    assert.deepEqual(lobbyTw.loadouts.p0.generals, ['liu_bei', 'guan_yu', 'zhuge_liang']);

    // Vượt quá 12.500 Lượng (12 đạo Thiết Giáp Trọng Kỵ / Ngọc Long Kỵ / Pháo Đá đắt đỏ) -> tự động chuẩn hóa về trong ngân quỹ
    const overBudget = S.normalizeTwLoadout(
      {
        generals: ['lu_bu', 'cao_cao', 'zhuge_liang'],
        retinues: [
          ['imperial_cataphracts', 'jade_dragons', 'jade_dragons', 'jade_dragons'],
          ['imperial_cataphracts', 'imperial_cataphracts', 'imperial_cataphracts', 'imperial_cataphracts'],
          ['trebuchet', 'trebuchet', 'trebuchet', 'onyx_dragons'],
        ],
      },
      'wei',
    );
    assert.ok(
      S.twLoadoutCost(overBudget) <= S.TW_BATTLE_FUNDS,
      'normalizeTwLoadout ép các đạo vượt trần ngân quỹ về dân binh hợp lệ <= 12.500 Lượng',
    );

    // Khai chiến -> kiểm tra TwWorld triển khai đúng 3 Danh tướng và 12 Bộ tùy đã chiêu mộ
    g.start('p0');
    const w = g['tw'];
    w.stop();
    const mySide = w.sides[0];
    assert.deepEqual(mySide.generals, ['liu_bei', 'guan_yu', 'zhuge_liang']);
    const myGenIds = regsOf(w, 0).filter((r) => r.isGeneral).map((r) => r.generalId);
    assert.deepEqual(myGenIds, ['liu_bei', 'guan_yu', 'zhuge_liang']);
    const myRetKinds = regsOf(w, 0).filter((r) => !r.isGeneral).map((r) => r.kind);
    assert.ok(myRetKinds.includes('onyx_dragons') && myRetKinds.includes('trebuchet') && myRetKinds.includes('azure_dragons'));
  } finally {
    g.dispose();
  }
});

test('Pha Bố Trận Tiền Chiến (deploymentPhase: true), Sương Mù Bố Trận, Tiên Phong Phục Kích Rừng Thông (vanguardDeploy) & Khai Chiến (ready_deploy)', () => {
  const w = makeWorld(
    2,
    { mapId: 'pingyuan', deploymentPhase: true },
    { factions: ['shu', 'wei'], bots: [false, true] },
  );
  assert.equal(w.battlePhase, 'deployment');
  assert.ok(w.deploymentLeftSec > 20);

  // Sương mù Bố Trận: người chơi p0 (idx=0) chưa nhìn thấy bất kỳ trung đoàn địch nào trước giờ Khai Chiến
  const f0Before = w.frameFor(0);
  assert.equal(f0Before.battlePhase, 'deployment');
  assert.ok(f0Before.myDeployZone, 'cung cấp elip vùng Bố Trận cho người chơi');
  assert.equal(
    f0Before.regiments.filter((r) => r.ownerIdx === 1).length,
    0,
    'Sương mù Bố Trận ẩn hoàn toàn đội hình phe địch trước khi khai chiến',
  );

  // Tìm một vùng Rừng Thông ở xa doanh trại địch (>= 620) nhưng nằm ngoài elip xuất quân mặc định của phe 0
  const mapSpec = TW_MAPS.pingyuan;
  const enemyPose = w.spawnPoses[1];
  const forestZone = mapSpec.terrainZones.find(
    (z) =>
      z.kind === 'forest' &&
      Math.hypot(z.x - enemyPose.x, z.y - enemyPose.y) >= 700 &&
      Math.hypot(z.x - f0Before.myDeployZone.x, z.y - f0Before.myDeployZone.y) > f0Before.myDeployZone.rx + 80,
  );
  assert.ok(forestZone, 'tìm thấy Rừng Thông tiền phương hợp lệ trên bản đồ Bình Nguyên');

  // Đơn vị Tiên Phong (yi_archers / sabre_cavalry / raider_cavalry có vanguardDeploy=true) dịch chuyển tức thì vào Rừng Thông tiền phương!
  const vanguardReg = regsOf(w, 0).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.vanguardDeploy);
  const regularInf = regsOf(w, 0).find((r) => !r.isGeneral && !TW_UNITS[r.kind]?.vanguardDeploy);
  assert.ok(vanguardReg && regularInf, 'có cả đạo Tiên Phong và bộ binh thường');

  w.command('p0', {
    t: 'move_line',
    regIds: [vanguardReg.id],
    x: forestZone.x,
    y: forestZone.y,
    facing: 0,
    width: 120,
  });
  assert.ok(
    Math.hypot(vanguardReg.x - forestZone.x, vanguardReg.y - forestZone.y) < 35,
    'đạo Tiên Phong dịch chuyển tức thì vào Rừng Thông phục kích tiền phương trong Pha Bố Trận',
  );

  // Bộ binh thường không có đặc quyền Tiên Phong -> bị kẹp ngược về bên trong vùng Bố Trận nhà!
  w.command('p0', {
    t: 'move_line',
    regIds: [regularInf.id],
    x: forestZone.x,
    y: forestZone.y,
    facing: 0,
    width: 120,
  });
  assert.ok(
    Math.hypot(regularInf.x - forestZone.x, regularInf.y - forestZone.y) > 80,
    'bộ binh thường không thể nhảy cóc ra ngoài vùng Bố Trận',
  );

  // Cho chạy vài nhịp để Máy AI tự bố trí bẫy/phục kích và bấm sẵn sàng, sau đó người chơi bấm Khai Chiến (`ready_deploy`)
  steps(w, 10);
  assert.equal(w.sides[1].readyDeploy, true, 'Máy AI Chư hầu tự hoàn tất bố trận & báo sẵn sàng');
  assert.ok(
    w.deployables.some((d) => d.ownerIdx === 1),
    'Máy AI tự động dựng công sự dã chiến (chông gỗ / bẫy dầu) trước giờ khai chiến',
  );

  w.command('p0', { t: 'ready_deploy' });
  assert.equal(w.battlePhase, 'battle', 'cả 2 phe sẵn sàng -> chuyển sang Pha Giao Chiến thực thụ');

  const f0Battle = w.frameFor(0);
  assert.equal(f0Battle.battlePhase, 'battle');
  assert.ok(
    f0Battle.regiments.some((r) => r.ownerIdx === 1),
    'bước vào Pha Giao Chiến mở tầm nhìn thấy đại quân địch ngoài rừng',
  );
});

test('Núm Tốc Độ Thời Gian Thực TW3K (set_speed: 0× Tạm Dừng Chiến Thuật · 0.5× · 1× · 2× · 3×) & khóa đổi tốc độ trong PvP', () => {
  // Solo 1 người vs Máy AI: được toàn quyền điều chỉnh tốc độ trận đấu
  const wSolo = makeWorld(2, { mapId: 'pingyuan' }, { bots: [false, true] });
  const inf = regsOf(wSolo, 0).find((r) => !r.isGeneral);

  // Tạm dừng chiến thuật (0x): stepTimerTick không tăng tick, nhưng người chơi vẫn ra lệnh điều quân & đổi trận hình bình thường!
  assert.equal(wSolo.command('p0', { t: 'set_speed', speed: 0 }), undefined);
  assert.equal(wSolo.battleSpeed, 0);
  const tickPaused = wSolo.tick;
  wSolo.stepTimerTick();
  wSolo.stepTimerTick();
  assert.equal(wSolo.tick, tickPaused, 'tốc độ 0x giữ nguyên nhịp mô phỏng');

  wSolo.command('p0', { t: 'move_line', regIds: [inf.id], x: inf.x + 220, y: inf.y, facing: 0, width: 120 });
  assert.equal(inf.moveTargetX, Math.round((inf.x + 220) * 10) / 10, 'nhận lệnh dàn quân ngay trong lúc Tạm dừng Chiến thuật');

  // Chậm 0.5x: 2 nhịp đồng hồ mới nhích 1 nhịp mô phỏng
  wSolo.command('p0', { t: 'set_speed', speed: 0.5 });
  wSolo.stepTimerTick();
  assert.equal(wSolo.tick, tickPaused);
  wSolo.stepTimerTick();
  assert.equal(wSolo.tick, tickPaused + 1);

  // Tua nhanh 3x: 1 nhịp đồng hồ chạy 3 nhịp mô phỏng liên tiếp
  wSolo.command('p0', { t: 'set_speed', speed: 3 });
  wSolo.stepTimerTick();
  assert.equal(wSolo.tick, tickPaused + 4);

  // PvP nhiều người chơi thực: khách mời không phải Chủ Phòng không được tự ý bấm dừng / tua nhanh trận đấu
  const wPvp = makeWorld(2, { mapId: 'pingyuan' }, { bots: [false, false] });
  const err = wPvp.command('p1', { t: 'set_speed', speed: 0 });
  assert.match(String(err), /Chủ Phòng/i);
  assert.equal(wPvp.battleSpeed, 1);
});

test('Hỏa Công Đốt Rừng, Tên Lửa (toggle_fire_arrows), Bẫy Dầu nổ biển lửa, cháy rừng tước ẩn nấp & lan xuôi Hướng Gió', () => {
  const w = makeWorld(2, { mapId: 'chibi' }, { factions: ['wu', 'wei'] });
  const mapSpec = TW_MAPS.chibi;
  const forest = mapSpec.terrainZones.find((z) => z.kind === 'forest');
  assert.ok(forest, 'bản đồ Xích Bích có Rừng Thông ven sông');

  const wuBow = regsOf(w, 0).find((r) => TW_UNITS[r.kind]?.category === 'ranged_bow');
  const weiTarget = regsOf(w, 1).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.range === 0);
  assert.ok(wuBow && weiTarget);
  isolateRegiments(w, [wuBow.id, weiTarget.id]);

  // Đặt mục tiêu Ngụy nấp trong Rừng Thông kèm 1 Bẫy Dầu Hỏa ngay dưới chân
  weiTarget.x = forest.x;
  weiTarget.y = forest.y;
  weiTarget.inForest = true;
  wuBow.x = forest.x - 300;
  wuBow.y = forest.y;
  wuBow.facing = 0;
  wuBow.ammo = 20;

  // Đặt hướng gió thổi thẳng về phía Đông (windAngle = 0) mạnh để kiểm tra lan đám cháy xuôi gió
  w.windAngle = 0;
  w.windStrength = 1.0;

  // Rải Bẫy Dầu tại vị trí mục tiêu
  w.deployables.push({
    id: 901,
    ownerIdx: 0,
    team: 0,
    kind: 'oil',
    x: forest.x,
    y: forest.y,
    facing: 0,
    radius: 74,
    hp: 360,
    maxHp: 360,
    hidden: false,
    revealed: true,
  });

  // Bật Tên Lửa cho cung thủ Đông Ngô & khóa bắn vào quân Ngụy
  assert.equal(w.command('p0', { t: 'toggle_fire_arrows', regIds: [wuBow.id], value: true }), undefined);
  assert.equal(wuBow.fireArrowActive, true);
  wuBow.lockedTargetId = weiTarget.id;
  weiTarget.hidden = false;

  const hpBefore = weiTarget.hp;
  const moraleBefore = weiTarget.morale;

  // Mô phỏng tới khi loạt Tên Lửa bay trúng Bẫy Dầu & Rừng Thông -> bùng nổ thành Biển Lửa!
  steps(w, 45);
  assert.ok(w.fires.length >= 1, 'Tên Lửa kích nổ Bẫy Dầu / Rừng Thông tạo vùng Biển Lửa TwFireZone');
  assert.equal(
    w.deployables.some((d) => d.id === 901),
    false,
    'Bẫy Dầu Hỏa đã phát nổ tiêu hao thành biển lửa',
  );

  // Cho đám cháy thiêu đốt thêm vài giây (~7.5 giây để qua mốc 45% thời lượng kích hoạt lan cháy xuôi gió):
  // mục tiêu mất máu, tụt sĩ khí, gắn cờ burning=true và mất hoàn toàn ẩn nấp trong rừng!
  steps(w, 120);
  assert.ok(weiTarget.hp < hpBefore, 'Biển lửa & Tên Lửa gây sát thương thiêu đốt liên tục');
  assert.ok(weiTarget.morale < moraleBefore, 'Hỏa Công gây hoảng loạn tụt Sĩ khí quân địch');
  assert.equal(weiTarget.burning, true, 'đơn vị đứng giữa biển lửa mang trạng thái burning');
  assert.equal(
    isRegimentHidden(weiTarget, w.regiments, mapSpec),
    false,
    'trung đoàn đang bốc cháy rừng rực bị tước hoàn toàn trạng thái tàng hình phục kích rừng!',
  );
  assert.ok(
    w.fires.some((f) => Math.hypot(f.x - forest.x, f.y - forest.y) > 50),
    'biển lửa trong rừng Xích Bích mượn Gió Đông Nam lan thêm đám cháy con theo chiều Hướng Gió',
  );
});

test('Đạo Cụ Chiến Trường (place_deployable: Chông Gỗ phản Kỵ, Chông Sắt tàng hình làm chậm) & Hệ Lái Né Chướng Ngại Yuka', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['shu', 'lubu'] });
  const shuSpear = regsOf(w, 0).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.category === 'infantry_polearm');
  const lubuCav = regsOf(w, 1).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.category === 'cavalry_shock');
  const lubuInf = regsOf(w, 1).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.range === 0 && r.id !== lubuCav?.id);
  assert.ok(shuSpear && lubuCav && lubuInf);
  isolateRegiments(w, [shuSpear.id, lubuCav.id, lubuInf.id]);

  // 1) Đặt Chông Gỗ Phản Kỵ (`stakes`) ngay trước mặt đội hình Thục Hán và cho Thiết Kỵ Lữ Bố xung kích lao thẳng vào chông!
  shuSpear.x = 1200;
  shuSpear.y = 1100;
  shuSpear.facing = 0;
  const stakesInit = w.sides[0].deployablesLeft.stakes;
  assert.equal(
    w.command('p0', { t: 'place_deployable', kind: 'stakes', x: 1290, y: 1100, facing: 0 }),
    undefined,
  );
  assert.equal(w.sides[0].deployablesLeft.stakes, stakesInit - 1, 'trừ 1 lượt Chông Gỗ trong kho đạo cụ');

  // Đặt thêm Chông Sắt Ám Khí (`caltrops`) ở (1200, 1300) (cách bộ binh Thục 200 <= 265) -> kiểm tra tàng hình với phe địch từ xa
  assert.equal(
    w.command('p0', { t: 'place_deployable', kind: 'caltrops', x: 1200, y: 1300, facing: 0 }),
    undefined,
  );
  lubuCav.x = 1320;
  lubuCav.y = 1100;
  lubuCav.vx = -125;
  lubuCav.vy = 0;
  lubuCav.chargeTicks = 25;
  lubuInf.x = 2000;
  lubuInf.y = 1300;

  // Khung hình của đối phương (idx=1) chưa thấy Chông Sắt ở khoảng cách 800 (> stealthUntilDist=165)
  const f1Far = w.frameFor(1);
  assert.equal(
    f1Far.deployables.some((d) => d.kind === 'caltrops'),
    false,
    'Chông Sắt tàng hình hoàn toàn trên màn hình quân địch khi chưa áp sát',
  );

  const cavHpBefore = lubuCav.hp;
  steps(w, 6);
  assert.ok(lubuCav.hp < cavHpBefore - 200, 'Kỵ binh lao tốc độ cao vào Chông Gỗ bị xiên ngược mất lượng máu lớn');
  assert.equal(lubuCav.chargeTicks, 0, 'Chông Gỗ bẻ gãy hoàn toàn đà xung kích của Kỵ binh');

  // 2) Bộ binh địch dẫm lên Chông Sắt -> lộ diện vĩnh viễn, giảm 55% tốc độ (deploySlowMul <= 0.45) và rỉ máu
  lubuInf.x = 1205;
  lubuInf.y = 1300;
  const infHpBefore = lubuInf.hp;
  steps(w, 6);
  assert.ok(lubuInf.hp < infHpBefore, 'Chông Sắt gây sát thương chảy máu khi bộ binh giẫm qua');
  assert.ok((lubuInf.deploySlowMul ?? 1) <= 0.46, 'Chông Sắt ghim chân làm chậm 55% tốc độ di chuyển');
  assert.equal(
    w.frameFor(1).deployables.some((d) => d.kind === 'caltrops'),
    true,
    'Chông Sắt lộ diện trên màn hình đối phương sau khi bị giẫm phải',
  );

  // 3) Hệ lái Yuka ObstacleAvoidance: bộ binh hành quân ngang qua một Biển Lửa ở chính giữa đường sẽ tự đánh lái lách sang bên!
  shuSpear.x = 900;
  shuSpear.y = 700;
  shuSpear.vx = 0;
  shuSpear.vy = 0;
  w.fires.push({
    id: 999,
    x: 1030,
    y: 700,
    radius: 75,
    intensity: 1,
    leftSec: 15,
    maxSec: 15,
    ownerIdx: 1,
    team: 1,
  });
  w.command('p0', { t: 'move_line', regIds: [shuSpear.id], x: 1260, y: 700, facing: 0, width: 120 });
  steps(w, 25);
  assert.ok(
    Math.abs(shuSpear.y - 700) > 8,
    `hệ lái Yuka ObstacleAvoidance tự bẻ hướng né ngang qua rìa biển lửa (y=${shuSpear.y.toFixed(1)} != 700)`,
  );
});

test('Tháp Tiễn Đài Hiệu Lệnh (0 A.D. Han Defense Tower): tự bắn tên bảo vệ đài đã chiếm và bị Pháo Đá chế áp (suppress)', () => {
  const w = makeWorld(2, { mapId: 'pingyuan' }, { factions: ['jin', 'yuan'] });
  const capSpec = TW_MAPS.pingyuan.capturePoints[0];
  const capState = w.captures[0];
  assert.ok(capSpec && capState);

  const jinAnchor = regsOf(w, 0).find((r) => r.isGeneral);
  const yuanTarget = regsOf(w, 1).find((r) => !r.isGeneral && TW_UNITS[r.kind]?.range === 0);
  assert.ok(jinAnchor && yuanTarget);
  isolateRegiments(w, [jinAnchor.id, yuanTarget.id]);

  // Đặt Tướng Tấn giữ ở xa để không tự đánh, Đài Hiệu Lệnh 0 đã thuộc Liên Minh 0 (progress = 100)
  jinAnchor.x = 300;
  jinAnchor.y = 300;
  capState.ownerTeam = 0;
  capState.progress = 100;

  // Đưa bộ binh Viên Thiệu vào tầm 260 quanh Đài Hiệu Lệnh (< 420 tầm Tháp Tiễn)
  yuanTarget.x = capSpec.x + 220;
  yuanTarget.y = capSpec.y;
  yuanTarget.vx = 0;
  yuanTarget.vy = 0;

  const hpBefore = yuanTarget.hp;
  steps(w, 55); // ~3.6 giây -> Tháp Tiễn khai hỏa ít nhất 1 loạt tên phòng thủ!
  assert.ok(
    yuanTarget.hp < hpBefore,
    'Tháp Tiễn Đài Hiệu Lệnh tự động bắn tên tiêu hao quân địch xâm phạm vùng đài đã chiếm',
  );

  // Tảng đá lửa từ Pháo Đá Uy Viễn (team 1) nện trúng Đài Hiệu Lệnh -> sụt tiến độ & chế áp Tháp Tiễn suốt 7 giây!
  const { suppressBastionTowerAt } = require('../dist/server/src/game/tw/terrain.js');
  suppressBastionTowerAt(TW_MAPS.pingyuan, w.captures, capSpec.x + 10, capSpec.y - 10, 1);
  assert.ok(capState.progress < 100, 'tảng đá lửa Pháo Đá đập sụt tiến độ chiếm đóng Đài Hiệu Lệnh');
  capState.progress = 100; // giữ progress = 100 để kiểm chứng riêng trạng thái bị choáng chế áp (suppressedSec)
  w.projectiles.length = 0;
  const hpAfterSuppress = yuanTarget.hp;
  steps(w, 45); // 3 giây trong thời gian bị chế áp -> không có loạt tên mới nào bắn ra
  assert.equal(yuanTarget.hp, hpAfterSuppress, 'Tháp Tiễn bị Pháo Đá đập choáng ngưng bắn hoàn toàn trong thời gian chế áp');
});

test('Thăng Cấp Tinh Nhuệ (rank 0..9), Quan Hệ Guanxi (Kết Nghĩa Đào Viên -> Cuồng Nộ Báo Thù) & Chiêu Thức Đơn Đấu (duel_action)', () => {
  // 1) Kiểm tra bậc Tinh nhuệ 0..9 theo chiến công (twRankFromKills & twVeterancyBonuses)
  assert.equal(S.twRankFromKills(0), 0);
  assert.equal(S.twRankFromKills(15), 1);
  assert.equal(S.twRankFromKills(110), 5);
  assert.equal(S.twRankFromKills(300), 9);
  const goldBonus = S.twVeterancyBonuses(9);
  assert.ok(goldBonus.meleeAtkAdd >= 12 && goldBonus.moraleAdd >= 18 && goldBonus.reloadMul < 0.8);

  // 2) Kết Nghĩa Đào Viên (Lưu Bị, Quan Vũ, Trương Phi): Đồng Tâm hiệp lực & bùng nổ Cuồng Nộ Báo Thù khi huynh đệ ngã xuống!
  const seats = makeSeats(2, { factions: ['shu', 'lubu'] });
  seats[0].loadout = S.normalizeTwLoadout(
    {
      generals: ['liu_bei', 'guan_yu', 'zhang_fei'],
      retinues: [
        ['ji_militia', 'ji_militia', 'archer_militia', 'sabre_militia'],
        ['spear_guards', 'ji_militia', 'sabre_militia', 'archer_militia'],
        ['sabre_infantry', 'ji_militia', 'sabre_militia', 'raider_cavalry'],
      ],
    },
    'shu',
  );
  const w = new TwWorld(seats, makeCfg({ mapId: 'pingyuan', romanceMode: true }), noHooks);
  const liuBei = regsOf(w, 0).find((r) => r.generalId === 'liu_bei');
  const guanYu = regsOf(w, 0).find((r) => r.generalId === 'guan_yu');
  const zhangFei = regsOf(w, 0).find((r) => r.generalId === 'zhang_fei');
  const luBu = regsOf(w, 1).find((r) => r.generalId === 'lu_bu');
  const diaoFoe = regsOf(w, 1).find((r) => r.isGeneral && r.id !== luBu?.id);
  assert.ok(liuBei && guanYu && zhangFei && luBu && diaoFoe);
  isolateRegiments(w, [liuBei.id, guanYu.id, zhangFei.id, luBu.id, diaoFoe.id]);

  // Đặt Lưu Bị & Quan Vũ đứng kề vai sát cánh -> kích hoạt ấn Quan Hệ `harmony`
  liuBei.x = 900;
  liuBei.y = 1100;
  guanYu.x = 960;
  guanYu.y = 1100;
  zhangFei.x = 1020;
  zhangFei.y = 1100;
  luBu.x = 2200;
  luBu.y = 1100;
  diaoFoe.x = 2400;
  diaoFoe.y = 1100;

  steps(w, 5);
  assert.equal(guanYu.guanxiState, 'harmony', 'Huynh đệ Kết Nghĩa đứng gần nhau kích hoạt hào quang Đồng Tâm (harmony)');

  // Trương Phi tử trận trên sa trường -> Lưu Bị & Quan Vũ lập tức hóa Cuồng Nộ Báo Thù (`enraged` +45% công & Tử Chiến)!
  zhangFei.hp = 0;
  zhangFei.men = 0;
  zhangFei.anim = 'dead';
  steps(w, 3);
  assert.equal(guanYu.guanxiState, 'enraged', 'Quan Vũ bùng nổ Cuồng Nộ Báo Thù khi huynh đệ Trương Phi tử trận');
  assert.equal(liuBei.guanxiState, 'enraged', 'Lưu Bị bùng nổ Cuồng Nộ Báo Thù khi huynh đệ Trương Phi tử trận');
  assert.ok((guanYu.guanxiEnrageLeftSec ?? 0) > 15);

  // 3) Tương tác Chiêu Thức Đơn Đấu (`duel_action`: Cường Công `press`, Thủ Kín `guard`, Thoái Đấu `retreat`)
  guanYu.x = 1500;
  guanYu.y = 1100;
  luBu.x = 1580;
  luBu.y = 1100;
  diaoFoe.x = 1780;
  diaoFoe.y = 1100;
  assert.equal(
    w.command('p0', { t: 'challenge_duel', generalRegId: guanYu.id, targetGeneralRegId: luBu.id }),
    undefined,
  );
  steps(w, 12);
  assert.equal(w.duels.length, 1, 'mở võ đài Đơn Đấu Quan Vũ vs Lữ Bố');
  const duelId = w.duels[0].id;

  // Chuyển sang Cường Công (`press`) rồi Thủ Kín (`guard`)
  assert.equal(w.command('p0', { t: 'duel_action', duelId, action: 'press' }), undefined);
  assert.equal(w.frameFor(0).duels[0].stanceA, 'press');
  assert.equal(w.command('p1', { t: 'duel_action', duelId, action: 'guard' }), undefined);
  assert.equal(w.frameFor(0).duels[0].stanceB, 'guard');

  // Lữ Bố bấm Thoái Đấu (`retreat`) bỏ chạy giữa hiệp -> hủy võ đài ngay lập tức và quân Lữ Bố lân cận chịu sốc trừ Sĩ khí nhục nhã!
  const foeMoraleBefore = diaoFoe.morale;
  assert.equal(w.command('p1', { t: 'duel_action', duelId, action: 'retreat' }), undefined);
  assert.equal(w.duels.length, 0, 'Thoái Đấu kết thúc võ đài ngay lập tức, cứu mạng Võ tướng rút lui');
  assert.ok(diaoFoe.morale < foeMoraleBefore - 10, 'phe bỏ chạy khỏi Đơn Đấu chịu sốc trừ Sĩ khí lân cận');
});

