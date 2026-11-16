'use strict';

/**
 * Unit & integration tests for Miragine War Solo Mode (1P vs AI), Method 481 counter AI,
 * difficulty scaling, emergency crystal defense, anti-cheat isolation, and simulation stability.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const { ThapWorld } = require('../dist/server/src/game/thap/world.js');
const { createAiBrain, runBot } = require('../dist/server/src/game/thap/bot.js');
const { createInitialSides, sidePop } = require('../dist/server/src/game/thap/economy.js');

const {
  DEFAULT_THAP_CONFIG,
  MIRAGINE_AI_COUNTERS,
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_BASE,
  THAP_CRYSTALS,
  THAP_FIRST_ROUND_FRAMES,
  THAP_MAX_POP,
  THAP_ROUND_FRAMES,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_UNIT_FIELDS,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  decodeDeathCode,
  normalizeThapConfig,
} = S;

/** Creates silent hooks while recording frame/change notifications. */
function makeHooks() {
  const frames = [];
  let changes = 0;
  return {
    hooks: {
      tick() {
        frames.push(true);
      },
      changed() {
        changes += 1;
      },
    },
    get tickCount() {
      return frames.length;
    },
    get changeCount() {
      return changes;
    },
  };
}

/** Creates an isolated unit object matching `Unit` shape in `server/src/game/thap/types.ts`. */
function makeUnit(id, owner, kind, x, y, hpOverride) {
  const stats = THAP_UNITS[kind];
  const hp = hpOverride === undefined ? stats.hp : hpOverride;
  return {
    id,
    owner,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    hp,
    maxHp: stats.hp,
    cd: 0,
    windupLeft: 0,
    windupTargetId: 0,
    windupTargetBase: -1,
    radius: stats.radius,
    atkAt: 0,
    atkStartPending: false,
    attacking: false,
    moving: false,
    left: owner === 1,
    spawnedOrder: id,
  };
}

/**
 * Wraps an enemy SideState in a strict ES6 Proxy that throws immediately if `runBot`
 * reads `auto` or any private field (gold, income, spawn queue, ai state, etc.).
 */
function makeStrictEnemySideProxy(side) {
  const trap = (op, prop) => {
    throw new Error(`Anti-cheat leak: bot accessed enemy SideState (${op} ${String(prop)})`);
  };
  return new Proxy(side, {
    get(_target, prop) {
      return trap('get', prop);
    },
    set(_target, prop) {
      return trap('set', prop);
    },
    has(_target, prop) {
      return trap('has', prop);
    },
    ownKeys() {
      return trap('ownKeys', '*');
    },
    getOwnPropertyDescriptor(_target, prop) {
      return trap('getOwnPropertyDescriptor', prop);
    },
  });
}

/** Builds a clean `SimWorldState` and bot `SideState` for deterministic `runBot` tests. */
function makeBotHarness(opts = {}) {
  const botLevel = opts.botLevel ?? 'hard';
  const config = normalizeThapConfig({ mode: 'solo', botLevel, minutes: 0 }, 1);
  const rawSides = createInitialSides(
    [{ id: 'human-1', name: 'P1', bot: false }],
    config,
  );
  const enemyRaw = rawSides[0];
  if (opts.enemyAuto) enemyRaw.auto = opts.enemyAuto;
  if (opts.enemyGold !== undefined) enemyRaw.gold = opts.enemyGold;

  const botSide = rawSides[1];
  botSide.gold = opts.gold ?? 0;
  botSide.roundIncome = opts.roundIncome ?? THAP_START_ROUND_INCOME;
  botSide.auto = opts.botAuto ?? 'newbie';
  botSide.baseHp = opts.botBaseHp ?? THAP_BASE.hp;
  botSide.ai = createAiBrain(botLevel);
  if (opts.aiOverrides) {
    Object.assign(botSide.ai, opts.aiOverrides);
  }

  const protectedEnemy = opts.strictEnemyProxy ? makeStrictEnemySideProxy(enemyRaw) : enemyRaw;
  const world = {
    config,
    mapW: THAP_ARENA_W,
    mapH: THAP_ARENA_H,
    simTick: opts.simTick ?? 0,
    netTick: 0,
    wave: opts.wave ?? 0,
    roundFramesLeft: opts.roundFramesLeft ?? THAP_ROUND_FRAMES,
    roundTotalFrames: THAP_ROUND_FRAMES,
    startedAt: 0,
    sides: [protectedEnemy, botSide],
    units: opts.units ?? [],
    nextUnitId: 1000,
    pendingShots: [],
    pendingDeaths: [],
  };

  const selections = [];
  const selectAuto = (kind) => {
    botSide.auto = kind;
    selections.push(kind);
  };

  return { world, botSide, enemyRaw, selections, selectAuto };
}

/** Returns allowed `ThapUnitKind` counters from `MIRAGINE_AI_COUNTERS` for a given enemy kind. */
function countersOf(enemyKind) {
  const enemyId = THAP_UNITS[enemyKind].id;
  return MIRAGINE_AI_COUNTERS[enemyId].map((id) => THAP_UNIT_KINDS[id]);
}

/** Asserts all units and side stats inside a `ThapWorld` have finite, non-NaN values. */
function assertWorldInvariants(w) {
  for (const u of w.sim.units) {
    assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), `unit ${u.id} coords must be finite`);
    assert.ok(Number.isFinite(u.vx) && Number.isFinite(u.vy), `unit ${u.id} velocity must be finite`);
    assert.ok(Number.isFinite(u.hp) && Number.isFinite(u.maxHp), `unit ${u.id} hp must be finite`);
    assert.ok(u.x >= 0 && u.x <= w.W, `unit ${u.id} x=${u.x} within arena`);
    assert.ok(u.y >= 0 && u.y <= w.H, `unit ${u.id} y=${u.y} within arena`);
  }
  for (const s of w.sides) {
    assert.ok(Number.isFinite(s.gold) && s.gold >= 0, `side ${s.idx} gold finite`);
    assert.ok(Number.isFinite(s.roundIncome) && s.roundIncome >= THAP_START_ROUND_INCOME);
    assert.ok(Number.isFinite(s.baseHp) && s.baseHp >= 0);
    assert.ok(Number.isFinite(s.kills) && Number.isFinite(s.lost) && Number.isFinite(s.spawned));
  }
}

test('1. createInitialSides & normalizeThapConfig handle Solo vs PvP modes and sanitize unknown inputs', () => {
  const soloDefault = normalizeThapConfig({}, 1);
  assert.deepEqual(soloDefault, {
    bots: 1,
    botLevel: DEFAULT_THAP_CONFIG.botLevel,
    mode: 'solo',
    minutes: 0,
  });

  const soloSanitized = normalizeThapConfig(
    { bots: 99, botLevel: 'nightmare', mode: 'pvp', minutes: 42 },
    1,
  );
  assert.deepEqual(soloSanitized, {
    bots: 1,
    botLevel: 'normal',
    mode: 'solo',
    minutes: 0,
  });

  const soloZeroHumans = normalizeThapConfig({ botLevel: 'hard', minutes: '15' }, 0);
  assert.deepEqual(soloZeroHumans, {
    bots: 1,
    botLevel: 'hard',
    mode: 'solo',
    minutes: 15,
  });

  const pvpConfig = normalizeThapConfig(
    { bots: 5, botLevel: 'easy', mode: 'solo', minutes: 20 },
    2,
  );
  assert.deepEqual(pvpConfig, {
    bots: 0,
    botLevel: 'easy',
    mode: 'pvp',
    minutes: 20,
  });

  const pvpBadMinutes = normalizeThapConfig({ minutes: '' }, 2);
  assert.equal(pvpBadMinutes.mode, 'pvp');
  assert.equal(pvpBadMinutes.bots, 0);
  assert.equal(pvpBadMinutes.minutes, 0);

  const soloSides = createInitialSides([{ id: 'u1', name: 'Alice', bot: false }], soloSanitized);
  assert.equal(soloSides.length, 2);
  assert.equal(soloSides[0].id, 'u1');
  assert.equal(soloSides[0].bot, false);
  assert.equal(soloSides[0].team, 0);
  assert.equal(soloSides[0].gold, THAP_START_GOLD);
  assert.equal(soloSides[0].roundIncome, THAP_START_ROUND_INCOME);
  assert.equal(soloSides[1].bot, true);
  assert.equal(soloSides[1].id, 'bot:thap0');
  assert.equal(soloSides[1].team, 1);
  assert.equal(soloSides[1].auto, 'newbie');
  assert.equal(soloSides[1].baseHp, THAP_BASE.hp);

  const pvpSides = createInitialSides(
    [
      { id: 'u1', name: 'Alice', bot: false },
      { id: 'u2', name: 'Bob', bot: false },
    ],
    pvpConfig,
  );
  assert.equal(pvpSides.length, 2);
  assert.equal(pvpSides[0].bot, false);
  assert.equal(pvpSides[1].bot, false);
  assert.equal(pvpSides[1].id, 'u2');

  const pvpFallbackSides = createInitialSides([], pvpConfig);
  assert.equal(pvpFallbackSides[0].bot, false);
  assert.equal(pvpFallbackSides[1].bot, false);
});

test('2. Zero anti-cheat leak: strict Proxy trap proves runBot never accesses enemy SideState.auto or private fields', () => {
  // Enemy secretly queues highlord/mage, while battlefield is empty or contains swordmen.
  const openingHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 0,
    simTick: 0,
    gold: 0,
    roundIncome: 100,
    enemyAuto: 'highlord',
    enemyGold: 9999,
    strictEnemyProxy: true,
    units: [],
  });
  assert.doesNotThrow(() => {
    runBot(openingHarness.world, openingHarness.botSide, openingHarness.selectAuto, () => 0);
  });

  // Deployed units are swordmen, while enemy secret auto is mage; bot must counter swordman only.
  const counterHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 3,
    simTick: 12,
    gold: 100,
    roundIncome: 150,
    enemyAuto: 'mage',
    enemyGold: 5000,
    strictEnemyProxy: true,
    units: [
      makeUnit(1, 0, 'swordman', 900, 470),
      makeUnit(2, 0, 'swordman', 910, 490),
      makeUnit(3, 0, 'swordman', 920, 450),
    ],
  });
  assert.doesNotThrow(() => {
    runBot(counterHarness.world, counterHarness.botSide, counterHarness.selectAuto, () => 0);
  });
  assert.ok(
    countersOf('swordman').includes(counterHarness.botSide.auto),
    `Expected counter vs deployed swordman, got ${counterHarness.botSide.auto}`,
  );

  // High-income + emergency scenario must also never inspect enemy SideState.
  const emergencyHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 8,
    simTick: 5,
    gold: 0,
    roundIncome: 700,
    botAuto: 'highlord',
    enemyAuto: 'ironknight',
    strictEnemyProxy: true,
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Save highlord',
      lastEvalWave: 8,
    },
    units: [
      makeUnit(10, 0, 'cavalry', 1500, 470),
      makeUnit(11, 0, 'cavalry', 1510, 460),
    ],
  });
  assert.doesNotThrow(() => {
    runBot(emergencyHarness.world, emergencyHarness.botSide, emergencyHarness.selectAuto, () => 0);
  });
  assert.notEqual(emergencyHarness.botSide.auto, 'highlord');

  // Hard pre-wave late window & boss scaling branch must also never inspect enemy SideState.
  const lateBossHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 7,
    roundFramesLeft: 30,
    gold: 1000,
    roundIncome: 700,
    botAuto: 'newbie',
    enemyAuto: 'highlord',
    strictEnemyProxy: true,
    aiOverrides: {
      preferredCounter: 'newbie',
      counterReason: 'Counter swordman (Method 481)',
      lastEvalWave: 10,
    },
    units: [
      makeUnit(20, 1, 'ironknight', 1100, 470),
      makeUnit(21, 0, 'swordman', 900, 470),
    ],
  });
  assert.doesNotThrow(() => {
    runBot(lateBossHarness.world, lateBossHarness.botSide, lateBossHarness.selectAuto, () => 0.1);
  });
  assert.equal(lateBossHarness.botSide.auto, 'highlord');
});

test('3. Round 1 affordable opening: at wave 0 (roundIncome 100, gold 0) every bot level picks cost <= 100 starter', () => {
  for (const botLevel of ['easy', 'normal', 'hard']) {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      const h = makeBotHarness({
        botLevel,
        wave: 0,
        simTick: 0,
        gold: THAP_START_GOLD,
        roundIncome: THAP_START_ROUND_INCOME,
        units: [],
      });
      runBot(h.world, h.botSide, h.selectAuto, () => r);
      const chosen = h.botSide.auto;
      assert.ok(
        THAP_UNITS[chosen].cost <= 100,
        `[${botLevel}] rng=${r} picked ${chosen} costing ${THAP_UNITS[chosen].cost} > 100`,
      );
      assert.equal(h.botSide.ai.counterReason, 'Opening');
      assert.equal(h.botSide.ai.preferredCounter, chosen);

      // Subsequent ticks in wave 0 with no enemies keep the chosen starter stable.
      h.world.simTick = 60;
      const before = h.botSide.auto;
      runBot(h.world, h.botSide, h.selectAuto, () => 0.99);
      assert.equal(h.botSide.auto, before);
    }
  }
});

test('4. Method 481 counter adaptation: hard AI counters live enemy stacks within budget/pop and ignores hp===0 dead units', () => {
  const scenarios = [
    { enemy: 'swordman', count: 4, roundIncome: 150, gold: 0, expectedWithinBudget: ['heavysword', 'monk', 'vampire'] },
    { enemy: 'swordman', count: 4, roundIncome: 50, gold: 0, expectedWithinBudget: ['heavysword'] },
    { enemy: 'novice', count: 4, roundIncome: 300, gold: 0, expectedWithinBudget: ['ninja', 'cavalry', 'ironknight'] },
    { enemy: 'novice', count: 4, roundIncome: 100, gold: 0, expectedWithinBudget: ['ninja'] },
    { enemy: 'cavalry', count: 3, roundIncome: 200, gold: 0, expectedWithinBudget: ['monk', 'immortal'] },
    { enemy: 'samurai', count: 4, roundIncome: 150, gold: 0, expectedWithinBudget: ['swordman', 'heavysword', 'monk'] },
    { enemy: 'mage', count: 3, roundIncome: 350, gold: 0, expectedWithinBudget: ['cavalry', 'ironknight'] },
  ];

  for (const sc of scenarios) {
    const units = Array.from({ length: sc.count }, (_, i) =>
      makeUnit(i + 1, 0, sc.enemy, 900 + i * 10, 460 + i * 8),
    );
    const h = makeBotHarness({
      botLevel: 'hard',
      wave: 4,
      simTick: 12,
      gold: sc.gold,
      roundIncome: sc.roundIncome,
      units,
    });
    runBot(h.world, h.botSide, h.selectAuto, () => 0);

    const chosen = h.botSide.auto;
    const budget = sc.gold + sc.roundIncome;
    assert.ok(
      countersOf(sc.enemy).includes(chosen),
      `Expected Method 481 counter for ${sc.enemy}, got ${chosen}`,
    );
    assert.ok(
      sc.expectedWithinBudget.includes(chosen),
      `Expected counter in ${sc.expectedWithinBudget.join(',')} for budget ${budget}, got ${chosen}`,
    );
    assert.ok(THAP_UNITS[chosen].cost <= budget, `${chosen} cost exceeds budget ${budget}`);
    assert.match(h.botSide.ai.counterReason, new RegExp(`Method 481`));
  }

  // Pop headroom constraint: when popRoom === 1 (59 friendly pop vs 60 enemy pop),
  // cavalry counters (monk/immortal/ironknight all pop=2) cannot fit, so bot picks pop=1 unit.
  const tightPopUnits = [];
  let nextId = 1;
  for (let i = 0; i < 59; i++) {
    tightPopUnits.push(makeUnit(nextId++, 1, 'newbie', 1100, 400 + (i % 10) * 15));
  }
  for (let i = 0; i < 30; i++) {
    tightPopUnits.push(makeUnit(nextId++, 0, 'cavalry', 800, 400 + (i % 10) * 15));
  }
  const popLimited = makeBotHarness({
    botLevel: 'hard',
    wave: 6,
    simTick: 12,
    gold: 250,
    roundIncome: 250,
    units: tightPopUnits,
  });
  runBot(popLimited.world, popLimited.botSide, popLimited.selectAuto, () => 0);
  const popChosen = popLimited.botSide.auto;
  assert.equal(THAP_UNITS[popChosen].pop, 1, `Expected pop=1 unit when popRoom=1, got ${popChosen}`);
  assert.ok(THAP_UNITS[popChosen].cost <= 500);

  // Dead units (hp === 0) must be completely ignored, even if stacked next to bot Crystal.
  const deadIgnoreUnits = [
    ...Array.from({ length: 12 }, (_, i) => makeUnit(i + 1, 0, 'highlord', 1800, 470, 0)),
    makeUnit(50, 0, 'swordman', 900, 470),
    makeUnit(51, 0, 'swordman', 910, 480),
  ];
  const deadTest = makeBotHarness({
    botLevel: 'hard',
    wave: 5,
    simTick: 12,
    gold: 0,
    roundIncome: 150,
    units: deadIgnoreUnits,
  });
  runBot(deadTest.world, deadTest.botSide, deadTest.selectAuto, () => 0);
  assert.ok(
    countersOf('swordman').includes(deadTest.botSide.auto),
    `Expected bot to ignore hp===0 highlords and counter swordman, got ${deadTest.botSide.auto}`,
  );
  assert.equal(deadTest.botSide.ai.emergencyTicks, 0);

  // If ALL enemy units on the battlefield are dead (hp === 0), bot treats enemyPop as 0 and pushes.
  const allDeadTest = makeBotHarness({
    botLevel: 'hard',
    wave: 5,
    simTick: 12,
    gold: 0,
    roundIncome: 150,
    units: [
      makeUnit(60, 0, 'mage', 900, 470, 0),
      makeUnit(61, 0, 'cavalry', 1800, 470, 0),
    ],
  });
  runBot(allDeadTest.world, allDeadTest.botSide, allDeadTest.selectAuto, () => 0);
  assert.equal(allDeadTest.botSide.ai.counterReason, 'Push wave 5');
});

test('5. Difficulty profiles: easy misses counters at rng=0.6 & never saves for boss, while normal/hard counter & scale', () => {
  const swordmen = [
    makeUnit(1, 0, 'swordman', 900, 470),
    makeUnit(2, 0, 'swordman', 910, 470),
  ];

  // At rng=0.6: easy (counterAccuracy 0.5) falls back to tier pool; normal (0.78) & hard (0.94) counter via Method 481.
  const easyMiss = makeBotHarness({
    botLevel: 'easy',
    wave: 2,
    simTick: 45,
    gold: 0,
    roundIncome: 150,
    units: swordmen,
  });
  runBot(easyMiss.world, easyMiss.botSide, easyMiss.selectAuto, () => 0.6);
  assert.match(easyMiss.botSide.ai.counterReason, /^Adapt tier vs swordman/);

  const normalHit = makeBotHarness({
    botLevel: 'normal',
    wave: 2,
    simTick: 25,
    gold: 0,
    roundIncome: 150,
    units: swordmen,
  });
  runBot(normalHit.world, normalHit.botSide, normalHit.selectAuto, () => 0.6);
  assert.ok(countersOf('swordman').includes(normalHit.botSide.auto));
  assert.match(normalHit.botSide.ai.counterReason, /Method 481/);

  // Easy never saves for or picks highlord even with huge income & stable frontline.
  const easyNoBoss = makeBotHarness({
    botLevel: 'easy',
    wave: 10,
    simTick: 45,
    gold: 2000,
    roundIncome: 900,
    units: [makeUnit(1, 1, 'swordman', 1100, 470), makeUnit(2, 0, 'swordman', 900, 470)],
  });
  runBot(easyNoBoss.world, easyNoBoss.botSide, easyNoBoss.selectAuto, () => 0.05);
  assert.notEqual(easyNoBoss.botSide.auto, 'highlord');
  assert.notEqual(easyNoBoss.botSide.auto, 'dreadlord');
});

test('6. Boss scaling (dreadlord/highlord) & emergency crystal defense switches off highlord stall within 520px', () => {
  // High-income stable bot picks dreadlord at >= 380 income when affordable.
  const dreadHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 7,
    simTick: 12,
    gold: 400,
    roundIncome: 420,
    units: [
      makeUnit(1, 1, 'heavysword', 1050, 470),
      makeUnit(2, 1, 'heavysword', 1060, 480),
      makeUnit(3, 0, 'swordman', 900, 470),
    ],
  });
  runBot(dreadHarness.world, dreadHarness.botSide, dreadHarness.selectAuto, () => 0.1);
  assert.equal(dreadHarness.botSide.auto, 'dreadlord');
  assert.equal(dreadHarness.botSide.ai.counterReason, 'Boss dreadlord');

  // High-income stable bot (>= 650 income) can buy highlord when gold+income >= 1500.
  const highlordBuy = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 12,
    gold: 900,
    roundIncome: 700,
    units: [
      makeUnit(1, 1, 'ironknight', 1050, 470),
      makeUnit(2, 0, 'cavalry', 900, 470),
    ],
  });
  runBot(highlordBuy.world, highlordBuy.botSide, highlordBuy.selectAuto, () => 0.1);
  assert.equal(highlordBuy.botSide.auto, 'highlord');
  assert.equal(highlordBuy.botSide.ai.counterReason, 'Boss highlord');

  // High-income stable bot (>= 650 income) stalls/saves for highlord at gold=0 (nextWaveGold=700 >= 645).
  const highlordStall = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 12,
    gold: 0,
    roundIncome: 700,
    units: [
      makeUnit(1, 1, 'newbie', 1200, 470),
      makeUnit(2, 1, 'newbie', 1210, 470),
      makeUnit(3, 0, 'samurai', 1300, 470), // 530px from bot crystal (1830, 470) -> outside 520px
    ],
  });
  runBot(highlordStall.world, highlordStall.botSide, highlordStall.selectAuto, () => 0.1);
  assert.equal(highlordStall.botSide.auto, 'highlord');
  assert.equal(highlordStall.botSide.ai.counterReason, 'Save highlord');

  // Check exact 520px crystal threat radius & emergency pop margin (enemyPop >= myPop + 4):
  // myPop = 2; placing 5 samurai (nearEnemyPop = 5 < 2 + 4 = 6) at 400px does NOT trigger emergency.
  const [crystalX, crystalY] = THAP_CRYSTALS[1];
  const belowMarginHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 5, // Not a reactionTick (12) and not wave change
    gold: 0,
    roundIncome: 700,
    botAuto: 'highlord',
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Save highlord',
      lastEvalWave: 10,
      emergencyTicks: 0,
    },
    units: [
      makeUnit(1, 1, 'newbie', 1200, crystalY),
      makeUnit(2, 1, 'newbie', 1210, crystalY),
      ...Array.from({ length: 5 }, (_, i) => makeUnit(10 + i, 0, 'samurai', crystalX - 400, crystalY)),
    ],
  });
  runBot(belowMarginHarness.world, belowMarginHarness.botSide, belowMarginHarness.selectAuto, () => 0);
  assert.equal(belowMarginHarness.botSide.auto, 'highlord', 'Should keep Save highlord when nearEnemyPop < myPop + 4');
  assert.equal(belowMarginHarness.botSide.ai.emergencyTicks, 0);

  // Placing 6 samurai (nearEnemyPop = 6 >= myPop + 4) OUTSIDE 520px (530px away) must not trigger emergency.
  const outsideRadiusHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 5,
    gold: 0,
    roundIncome: 700,
    botAuto: 'highlord',
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Save highlord',
      lastEvalWave: 10,
      emergencyTicks: 0,
    },
    units: [
      makeUnit(1, 1, 'newbie', 1200, crystalY),
      makeUnit(2, 1, 'newbie', 1210, crystalY),
      ...Array.from({ length: 6 }, (_, i) => makeUnit(10 + i, 0, 'samurai', crystalX - 530, crystalY)),
    ],
  });
  runBot(outsideRadiusHarness.world, outsideRadiusHarness.botSide, outsideRadiusHarness.selectAuto, () => 0);
  assert.equal(outsideRadiusHarness.botSide.auto, 'highlord');
  assert.equal(outsideRadiusHarness.botSide.ai.emergencyTicks, 0);

  // Moving those 6 samurai INSIDE 520px (450px away) triggers emergency reaction on tick 5 immediately,
  // switching off `highlord` stall back to an immediate affordable counter!
  const emergencyTriggerHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 5,
    gold: 0,
    roundIncome: 700,
    botAuto: 'highlord',
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Save highlord',
      lastEvalWave: 10,
      emergencyTicks: 0,
    },
    units: [
      makeUnit(1, 1, 'newbie', 1200, crystalY),
      makeUnit(2, 1, 'newbie', 1210, crystalY),
      ...Array.from({ length: 6 }, (_, i) => makeUnit(10 + i, 0, 'samurai', crystalX - 450, crystalY)),
    ],
  });
  runBot(emergencyTriggerHarness.world, emergencyTriggerHarness.botSide, emergencyTriggerHarness.selectAuto, () => 0);
  const emergencyChoice = emergencyTriggerHarness.botSide.auto;
  assert.notEqual(emergencyChoice, 'highlord', 'Emergency defense must abort highlord stall');
  assert.ok(THAP_UNITS[emergencyChoice].cost <= 700, `Emergency choice ${emergencyChoice} must be immediately affordable`);
  assert.equal(emergencyTriggerHarness.botSide.ai.emergencyTicks, 1);
  assert.equal(emergencyTriggerHarness.botSide.ai.counterReason, 'Emergency vs samurai');

  // Late-wave boss save persistence: Hard AI saving for High Lord at roundFramesLeft <= 45
  // must NOT downgrade to a cheaper unit when frontline is stable.
  const bossSaveLateHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 5,
    roundFramesLeft: 30,
    gold: 250,
    roundIncome: 400,
    botAuto: 'highlord',
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Save highlord',
      lastEvalWave: 10,
      emergencyTicks: 0,
    },
    units: [
      makeUnit(1, 1, 'swordman', 1100, crystalY),
      makeUnit(2, 1, 'swordman', 1110, crystalY),
      makeUnit(3, 0, 'newbie', 900, crystalY),
    ],
  });
  runBot(bossSaveLateHarness.world, bossSaveLateHarness.botSide, bossSaveLateHarness.selectAuto, () => 0);
  assert.equal(bossSaveLateHarness.botSide.auto, 'highlord', 'Hard AI must preserve Save highlord in late wave window');
  assert.equal(bossSaveLateHarness.botSide.ai.counterReason, 'Save highlord');

  // At pop cap (myPop = 60 -> popRoom = 0), AI must switch from pop-6 highlord to a pop-1 unit.
  const capPopHarness = makeBotHarness({
    botLevel: 'hard',
    wave: 10,
    simTick: 5,
    roundFramesLeft: 30,
    gold: 800,
    roundIncome: 600,
    botAuto: 'highlord',
    aiOverrides: {
      preferredCounter: 'highlord',
      counterReason: 'Boss highlord',
      lastEvalWave: 10,
      emergencyTicks: 0,
    },
    units: [
      ...Array.from({ length: 10 }, (_, i) => makeUnit(100 + i, 1, 'highlord', 1200 + i, crystalY)),
      makeUnit(200, 0, 'newbie', 900, crystalY),
    ],
  });
  runBot(capPopHarness.world, capPopHarness.botSide, capPopHarness.selectAuto, () => 0);
  assert.equal(THAP_UNITS[capPopHarness.botSide.auto].pop, 1, 'At popRoom = 0 AI prepares a 1-pop unit');
});

test('7. Full Solo simulation stability: 2400 ticks (80s) vs Hard AI has zero NaNs, valid frames, and wave updates', () => {
  const hookTracker = makeHooks();
  const config = normalizeThapConfig({ mode: 'solo', botLevel: 'hard', minutes: 0 }, 1);
  const inits = [{ id: 'player-1', name: 'Hero', color: '#e03131', team: 0, bot: false }];
  const world = new ThapWorld(inits, config, hookTracker.hooks);

  const f0Init = world.frameFor(0, true);
  assert.equal(f0Init.wave, 0);
  assert.deepEqual(f0Init.lastWaveUnits, [-1, -1]);
  assert.ok(f0Init.me, 'Human player frame must include private state');
  assert.equal(f0Init.me.auto, 'newbie');

  const specInit = world.frameFor(undefined);
  assert.equal(specInit.me, undefined, 'Spectator frame must never include private me state');

  // Human switches to swordman before wave 1, then samurai in wave 2.
  assert.equal(world.command(0, { t: 'auto', kind: 'swordman' }), undefined);

  // Step right before wave 1 (179 ticks): still wave 0 and no spawned units yet.
  for (let i = 0; i < THAP_FIRST_ROUND_FRAMES - 1; i++) {
    world.step();
    assertWorldInvariants(world);
  }
  assert.equal(world.sim.wave, 0);
  assert.deepEqual(world.frameFor(0).lastWaveUnits, [-1, -1]);

  // Tick 180 triggers Wave 1.
  world.step();
  assert.equal(world.sim.wave, 1);
  const afterWave1 = world.frameFor(0);
  assert.ok(afterWave1.lastWaveUnits[0] > 0, 'Human lastWaveUnits must update > 0 after Wave 1');
  assert.ok(afterWave1.lastWaveUnits[1] > 0, 'AI lastWaveUnits must update > 0 after Wave 1');
  assert.ok(afterWave1.me && afterWave1.me.auto === 'swordman');

  // Complete full 2400 ticks (80s at 30 FPS), periodically changing human troop composition.
  for (let tick = THAP_FIRST_ROUND_FRAMES + 1; tick <= 2400; tick++) {
    if (tick === THAP_FIRST_ROUND_FRAMES + THAP_ROUND_FRAMES - 60) {
      assert.equal(world.command(0, { t: 'select', kind: 'samurai' }), undefined);
    }
    if (tick === THAP_FIRST_ROUND_FRAMES + THAP_ROUND_FRAMES * 2 - 60) {
      assert.equal(world.command(0, { t: 'auto', kind: 'cavalry' }), undefined);
    }
    world.step();
    assertWorldInvariants(world);

    if (tick % 30 === 0) {
      const pFrame = world.frameFor(0);
      const sFrame = world.frameFor(undefined);
      assert.equal(pFrame.u.length % THAP_UNIT_FIELDS, 0);
      assert.equal(sFrame.me, undefined);
      for (const n of pFrame.u) assert.ok(Number.isFinite(n));
      for (const n of pFrame.bh) assert.ok(Number.isFinite(n) && n >= 0 && n <= 100);
      if (world.sides[0].alive) {
        assert.ok(pFrame.me, 'Alive human gets private frame');
        assert.equal(pFrame.me.pop, sidePop(world.sim, 0));
        assert.equal(pFrame.me.popCap, THAP_MAX_POP);
      }
    }
  }

  assert.ok(world.sim.wave >= 3, `Expected at least 3 waves in 2400 ticks, got ${world.sim.wave}`);
  assert.equal(world.result, undefined, 'Match should remain active across full 2400 ticks');
  assert.ok(hookTracker.tickCount > 0, 'Hooks should emit network frames');
  assert.ok(world.sides[0].spawned > 0 && world.sides[1].spawned > 0);
  assert.ok(world.sides[0].totalEarned > 0 && world.sides[1].totalEarned > 0);
  assert.equal(world.frameFor(0).me.auto, 'cavalry');
  assert.equal(world.frameFor(undefined).me, undefined);

  // Terminate via human surrender and validate ThapResult & post-end guards.
  assert.equal(world.command(0, { t: 'surrender' }), undefined);
  assert.ok(world.result, 'Match must have a ThapResult after surrender');
  assert.equal(world.running, false);
  assert.equal(world.result.winnerTeam, 1);
  assert.deepEqual(world.result.winnerIdxs, [1]);
  assert.equal(world.result.reason, 'surrender');
  assert.equal(world.result.scores.length, 2);
  assert.equal(world.result.stats.length, 2);
  assert.ok(world.result.durationMs >= 80_000);
  assert.equal(world.result.stats[0].baseHp, 0);
  assert.equal(world.sides[0].alive, false);
  assert.equal(world.frameFor(0).me, undefined, 'Defeated side receives no private state');
  assert.match(world.command(0, { t: 'auto', kind: 'newbie' }), /không còn nữa/);
});

test('8. Natural crystal-destruction termination in Solo mode produces valid ThapResult stats and death event', () => {
  const hookTracker = makeHooks();
  const config = normalizeThapConfig({ mode: 'solo', botLevel: 'hard', minutes: 0 }, 1);
  const inits = [{ id: 'player-1', name: 'Champion', color: '#e03131', team: 0, bot: false }];
  const world = new ThapWorld(inits, config, hookTracker.hooks);

  // Lower bot Crystal HP to realistic endgame health and deploy attackers right in front of it.
  world.sides[1].baseHp = 350;
  const [crystalX, crystalY] = THAP_CRYSTALS[1];
  world.addUnit(0, 'highlord', crystalX - 85, crystalY - 10);
  world.addUnit(0, 'highlord', crystalX - 85, crystalY + 10);
  world.addUnit(0, 'highlord', crystalX - 90, crystalY);

  let steps = 0;
  while (!world.result && steps < 300) {
    world.step();
    steps += 1;
    assertWorldInvariants(world);
  }

  assert.ok(world.result, 'Crystal should be destroyed cleanly within 300 ticks');
  assert.equal(world.result.reason, 'crystal');
  assert.equal(world.result.winnerTeam, 0);
  assert.deepEqual(world.result.winnerIdxs, [0]);
  assert.equal(world.running, false);
  assert.equal(world.sides[1].alive, false);
  assert.equal(world.sides[1].baseHp, 0);
  assert.equal(world.result.stats[1].baseHp, 0);
  assert.ok(world.result.stats[0].damageToCrystal >= 350);
  assert.ok(world.result.scores[0] > world.result.scores[1]);

  const finalFrame = world.frameFor(0);
  assert.deepEqual(finalFrame.al, [1, 0]);
  assert.equal(finalFrame.bh[1], 0);
  assert.ok(finalFrame.d.length >= 3, 'Final frame should include crystal destruction death event');
  let foundCrystalDeath = false;
  for (let i = 0; i < finalFrame.d.length; i += 3) {
    const decoded = decodeDeathCode(finalFrame.d[i + 2]);
    if (decoded.isBase && decoded.owner === 1) {
      foundCrystalDeath = true;
    }
  }
  assert.ok(foundCrystalDeath, 'Final frame death buffer must decode bot crystal destruction');
});
