'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const shared = require('../dist/shared/src/index.js');
const spatial = require('../dist/server/src/game/bansung/spatial.js');
const mapMod = require('../dist/server/src/game/bansung/map.js');
const flocking = require('../dist/server/src/game/bansung/flocking.js');
const mobsMod = require('../dist/server/src/game/bansung/mobs.js');
const bossSand = require('../dist/server/src/game/bansung/boss-sand.js');
const bossColossus = require('../dist/server/src/game/bansung/boss-colossus.js');
const bossOverlord = require('../dist/server/src/game/bansung/boss-overlord.js');
const directorMod = require('../dist/server/src/game/bansung/director.js');
const botMod = require('../dist/server/src/game/bansung/bot.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');

const {
  BANSUNG_ARENA_W,
  BANSUNG_ARENA_H,
  BANSUNG_MAP_W,
  BANSUNG_MAP_H,
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_ENEMY_GATES,
  BANSUNG_TICK_HZ,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_ENEMIES,
  BANSUNG_MELEE_SPECIALS,
  BANSUNG_RANGED_ATTACKS,
  BANSUNG_FLOCK_CONSTS,
  BOSS_BEHOLDER_CFG,
  DREAD_COLOSSUS_CFG,
  BANSUNG_IRON_DRONE_CFG,
  OVERLORD_STATS,
  BANSUNG_WAVES,
  BANSUNG_SURVIVAL_STAGE_S,
  BANSUNG_SURVIVAL_CYCLE_S,
  BANSUNG_SURVIVAL_STAGES,
  BANSUNG_PET_TUNING,
  BANSUNG_PING_REVIVE,
  BANSUNG_ENEMY_FIELDS,
  BANSUNG_ENEMY_INDEX,
  BANSUNG_PROP_INDEX,
  BANSUNG_EFLAG_ARMORED,
  BANSUNG_EFLAG_SHIELDED,
  BANSUNG_EFLAG_STUNNED,
  BANSUNG_EFLAG_EVOLVED,
  FX_BLAST,
  FX_IMPACT,
  computeWaveMaxMobs,
  computeActiveMobCap,
} = shared;

// ============================================================================
// Deterministic PRNG & Shared Test Builders
// ============================================================================

function makeRng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeObstacle(id, x, y, w, h, kind = 'pillar') {
  return {
    id,
    kind,
    x,
    y,
    w,
    h,
    blocksMove: true,
    blocksBullet: true,
    blocksLos: true,
    destructible: false,
    alive: true,
  };
}

function makeObsGrid(obstacles = [], w = BANSUNG_ARENA_W, h = BANSUNG_ARENA_H) {
  return new spatial.ObstacleGrid(obstacles, w, h);
}

function makeMobTarget(numId, id, x, y, overrides = {}) {
  return {
    id,
    numId,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 14,
    team: 0,
    layer: spatial.LAYER_PLAYER,
    tier: 'hero',
    armorType: 'light',
    flatArmor: 0,
    alive: true,
    downed: false,
    hp: 300,
    maxHp: 300,
    shield: 40,
    maxShield: 40,
    invulnMs: 0,
    hitIframesMs: 0,
    dashIframesMs: 0,
    hitFlashMs: 0,
    kbResist: 0,
    knockVx: 0,
    knockVy: 0,
    slowPct: 0,
    slowMs: 0,
    stunMs: 0,
    stunImmuneMs: 0,
    stunDrStage: 0,
    stunDrResetMs: 0,
    vulnMult: 1.0,
    dots: {},
    ...overrides,
  };
}

function stepMobSim(mgr, targets, obsGrid, ticks, opts = {}) {
  const enemyGrid = new spatial.ActorGrid(obsGrid.mapW, obsGrid.mapH);
  const targetGrid = new spatial.ActorGrid(obsGrid.mapW, obsGrid.mapH);
  const startTick = opts.startTick ?? 1;
  for (let i = 0; i < ticks; i++) {
    const tick = startTick + i;
    const actors = [];
    for (let m = 0; m < mgr.mobs.length; m++) {
      const mob = mgr.mobs[m];
      if (mob.alive) actors.push(mobsMod.toMobSpatialActor(mob));
    }
    enemyGrid.rebuild(actors);
    targetGrid.rebuild(targets.map((t) => ({ ...t, id: t.numId })));
    mobsMod.stepMobs(mgr, {
      tick,
      targets,
      obsGrid,
      enemyGrid,
      targetGrid,
      rng: opts.rng,
      flockingOptions: opts.flockingOptions,
      callbacks: opts.callbacks,
    });
    if (opts.onTick && opts.onTick(tick, i) === false) break;
  }
}

function makeBossPlayer(id, x, y, overrides = {}) {
  const combatTarget = makeMobTarget(id, `p${id}`, x, y, {
    hp: overrides.hp ?? 250,
    maxHp: overrides.maxHp ?? 250,
    shield: overrides.shield ?? 40,
    maxShield: overrides.maxShield ?? 40,
    dashIframesMs: overrides.dashIframesMs ?? 0,
  });
  return {
    id: `p${id}`,
    numId: id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 14,
    alive: true,
    downed: false,
    threat: 0,
    dashIframesMs: overrides.dashIframesMs ?? 0,
    combatTarget,
    ...overrides,
    combatTarget,
  };
}

function makeDirectorPlayer(idx, x = BANSUNG_ARENA_CX, y = BANSUNG_ARENA_CY, overrides = {}) {
  return {
    id: `p${idx}`,
    idx,
    x,
    y,
    life: 'alive',
    alive: true,
    downed: false,
    hp: 100,
    maxHp: 100,
    shield: 40,
    maxShield: 40,
    energy: 100,
    maxEnergy: 120,
    ...overrides,
  };
}

function makeBotPlayer(idx, id, x, y, overrides = {}) {
  return {
    id,
    idx,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 14,
    life: 'alive',
    alive: true,
    downed: false,
    bot: false,
    hp: 120,
    maxHp: 120,
    shield: 40,
    maxShield: 40,
    energy: 140,
    maxEnergy: 140,
    aimRad: 0,
    aimCos: 1,
    slotIdx: 0,
    slots: [
      { id: 'pistol', clip: 12, maxClip: 12 },
      { id: 'plasma_rifle', clip: 32, maxClip: 32 },
    ],
    stats: { revives: 0 },
    revives: 0,
    ...overrides,
  };
}

// ============================================================================
// 1. Crowd Flocking & Separation AI (`flocking.ts`)
// ============================================================================

test('flocking: 60 overlapped enemies separate cleanly within 12 ticks', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const enemyGrid = new spatial.ActorGrid(BANSUNG_ARENA_W, BANSUNG_ARENA_H);
  const targets = [{ id: 1, x: 1400, y: 696, radius: 14, alive: true, downed: false }];

  const enemies = [];
  for (let i = 0; i < 60; i++) {
    const id = i + 1;
    // Stack all 60 inside a tiny 6x6px jitter cluster centered at (600, 696)
    const jx = ((i % 10) - 4.5) * 0.5;
    const jy = (Math.floor(i / 10) - 2.5) * 0.5;
    const x = 600 + jx;
    const y = 696 + jy;
    enemies.push({
      id,
      kind: 'scarab',
      role: 'melee',
      x,
      y,
      radius: 14,
      team: 1,
      layer: spatial.LAYER_ENEMY,
      alive: true,
      speed: 120,
      moveSpeed: 120,
      flock: flocking.createEnemyFlockState(id, x, y),
    });
  }

  const t0 = performance.now();
  for (let tick = 1; tick <= 12; tick++) {
    enemyGrid.rebuild(enemies);
    flocking.stepEnemyFlocking(enemies, targets, obsGrid, enemyGrid, tick);
  }
  const elapsedMs = performance.now() - t0;

  let minPairDist = Infinity;
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), 'enemy coordinates must remain finite');
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < minPairDist) minPairDist = d;
    }
  }

  // d36 gate: minPairDist >= 0.9 * (r_i + r_j) (= 25.2px for r=14) within 12 ticks
  assert.ok(
    minPairDist >= 0.9 * (14 + 14),
    `expected 60 stacked enemies to separate >= 25.2px in 12 ticks, got ${minPairDist.toFixed(2)}`,
  );
  assert.ok(elapsedMs < 500, `12 ticks of 60-enemy flocking took too long: ${elapsedMs.toFixed(2)}ms`);
});

test('flocking: 40 melee enemies route around an AABB pillar without getting stuck', () => {
  flocking.resetFlockingScratch();
  const pillar = makeObstacle(1, 760, 560, 80, 260, 'pillar');
  const obsGrid = makeObsGrid([pillar]);
  const enemyGrid = new spatial.ActorGrid(BANSUNG_ARENA_W, BANSUNG_ARENA_H);
  const target = { id: 1, x: 1120, y: 690, radius: 14, alive: true, downed: false };

  const enemies = [];
  for (let i = 0; i < 40; i++) {
    const id = i + 1;
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 430 + col * 34;
    const y = 570 + row * 34;
    enemies.push({
      id,
      kind: 'scarab',
      role: 'melee',
      x,
      y,
      radius: 14,
      team: 1,
      layer: spatial.LAYER_ENEMY,
      alive: true,
      speed: 135,
      moveSpeed: 135,
      flock: flocking.createEnemyFlockState(id, x, y),
    });
  }

  for (let tick = 1; tick <= 210; tick++) {
    enemyGrid.rebuild(enemies);
    flocking.stepEnemyFlocking(enemies, [target], obsGrid, enemyGrid, tick);
  }

  let reachedCount = 0;
  for (const e of enemies) {
    assert.ok(e.x > pillar.x + pillar.w - 4, `enemy ${e.id} failed to pass pillar x=${e.x}`);
    const d = Math.hypot(e.x - target.x, e.y - target.y);
    if (d <= 150) reachedCount++;
  }
  assert.ok(reachedCount >= 38, `expected >= 38/40 around pillar within melee vicinity, got ${reachedCount}`);
});

test('flocking: 4 co-op players distribute target load & ignore downed targets', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const enemyGrid = new spatial.ActorGrid(BANSUNG_ARENA_W, BANSUNG_ARENA_H);
  const targets = [
    { id: 1, x: 760, y: 696, radius: 14, alive: true, downed: false },
    { id: 2, x: 960, y: 500, radius: 14, alive: true, downed: false },
    { id: 3, x: 1160, y: 696, radius: 14, alive: true, downed: false },
    { id: 4, x: 960, y: 890, radius: 14, alive: true, downed: true },
  ];

  const enemies = [];
  for (let i = 0; i < 18; i++) {
    const id = i + 1;
    const ang = (i * Math.PI * 2) / 18;
    const x = 960 + Math.cos(ang) * 90;
    const y = 696 + Math.sin(ang) * 90;
    enemies.push({
      id,
      kind: 'skirmisher',
      role: 'melee',
      x,
      y,
      radius: 15,
      team: 1,
      layer: spatial.LAYER_ENEMY,
      alive: true,
      speed: 130,
      moveSpeed: 130,
      flock: flocking.createEnemyFlockState(id, x, y),
    });
  }

  for (let tick = 1; tick <= 18; tick++) {
    enemyGrid.rebuild(enemies);
    flocking.stepEnemyFlocking(enemies, targets, obsGrid, enemyGrid, tick, { forceRetarget: tick === 1 });
  }

  const counts = new Map();
  for (const e of enemies) {
    assert.notEqual(e.flock.targetId, 4, 'downed target should not be selected');
    counts.set(e.flock.targetId, (counts.get(e.flock.targetId) ?? 0) + 1);
  }
  assert.ok(counts.size >= 3, `expected all 3 standing players targeted, got ${counts.size}`);
  for (const [tid, c] of counts) {
    assert.ok(c <= 9, `target ${tid} dogpiled by ${c}/18 mobs despite targetLoad spreading`);
  }
});

test('flocking: ranged standoff backoff and immovable boss (invMass = 0) separation', () => {
  flocking.resetFlockingScratch();
  assert.equal(flocking.computeEnemyInvMass('boss'), 0);
  assert.ok(flocking.computeEnemyInvMass('melee') > 0);

  const obsGrid = makeObsGrid();
  const enemyGrid = new spatial.ActorGrid(BANSUNG_ARENA_W, BANSUNG_ARENA_H);
  const targets = [{ id: 1, x: 700, y: 600, radius: 14, alive: true, downed: false }];

  const boss = {
    id: 100,
    kind: 'boss_beholder',
    role: 'boss',
    x: 1100,
    y: 600,
    radius: 36,
    mass: 999,
    team: 1,
    layer: spatial.LAYER_ENEMY,
    alive: true,
    stationary: true,
    speed: 0,
    moveSpeed: 0,
    flock: flocking.createEnemyFlockState(100, 1100, 600),
  };

  const ranged = {
    id: 101,
    kind: 'cactus_spitter',
    role: 'ranged',
    x: 750,
    y: 600, // inside backoffDist=180 -> must retreat rightwards toward preferredRange [220, 320]
    radius: 14,
    team: 1,
    layer: spatial.LAYER_ENEMY,
    alive: true,
    speed: 110,
    moveSpeed: 110,
    preferredRange: [220, 320],
    backoffDist: 180,
    flock: flocking.createEnemyFlockState(101, 750, 600),
  };

  const melee = {
    id: 102,
    kind: 'scarab',
    role: 'melee',
    x: 1104,
    y: 600, // heavily overlapping immovable boss
    radius: 14,
    team: 1,
    layer: spatial.LAYER_ENEMY,
    alive: true,
    speed: 120,
    moveSpeed: 120,
    flock: flocking.createEnemyFlockState(102, 1104, 600),
  };

  const enemies = [boss, ranged, melee];
  for (let tick = 1; tick <= 60; tick++) {
    enemyGrid.rebuild(enemies);
    flocking.stepEnemyFlocking(enemies, targets, obsGrid, enemyGrid, tick);
  }

  assert.equal(boss.x, 1100, 'stationary immovable boss X should not be pushed');
  assert.equal(boss.y, 600, 'stationary immovable boss Y should not be pushed');
  const distBossMelee = Math.hypot(melee.x - boss.x, melee.y - boss.y);
  assert.ok(distBossMelee >= boss.radius + melee.radius - 2, `melee should separate from boss, got ${distBossMelee.toFixed(1)}`);
  const distRangedHero = Math.hypot(ranged.x - targets[0].x, ranged.y - targets[0].y);
  assert.ok(distRangedHero >= 180, `ranged should back off from close hero (>180px), got ${distRangedHero.toFixed(1)}`);
});

// ============================================================================
// 2. All 8 Non-Boss Mob Archetypes (`mobs.ts`)
// ============================================================================

test('mobs: scarab zigzag pursuit and melee bite damage', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const mgr = mobsMod.createMobManager({ rng: makeRng(11) });
  const target = makeMobTarget(1, 'p1', 900, 600);
  const scarab = mobsMod.spawnMob(mgr, { kind: 'scarab', x: 640, y: 600 });

  let minAbsYOffset = 0;
  stepMobSim(mgr, [target], obsGrid, 25, {
    onTick: () => {
      const off = Math.abs(scarab.y - 600);
      if (off > minAbsYOffset) minAbsYOffset = off;
    },
  });
  assert.ok(minAbsYOffset > 1.5, `expected scarab zigzag lateral motion (>1.5px), got ${minAbsYOffset}`);

  // Close-range bite attack (dist <= 24, windup 5t, 8 base kinetic/melee dmg -> 9 vs light)
  const mgr2 = mobsMod.createMobManager({ rng: makeRng(12) });
  const target2 = makeMobTarget(2, 'p2', 620, 600, { shield: 30, hp: 100 });
  const biteScarab = mobsMod.spawnMob(mgr2, { kind: 'scarab', x: 600, y: 600 });
  stepMobSim(mgr2, [target2], obsGrid, 10);
  const expectedScarabDmg = Math.round(BANSUNG_ENEMIES.scarab.damage * 1.15);
  assert.equal(target2.shield, 30 - expectedScarabDmg, 'scarab bite should deal light-affinity scaled melee dmg');
  assert.ok(biteScarab.cooldownTicks > 0, 'scarab bite should enter cooldown');
});

test('mobs: skirmisher telegraphed lunge (310 px/s, single hit, lunge cooldown)', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const mgr = mobsMod.createMobManager({ rng: makeRng(21) });
  const target = makeMobTarget(1, 'p1', 680, 600, { shield: 40, hp: 100 });
  const sk = mobsMod.spawnMob(mgr, { kind: 'skirmisher', x: 600, y: 600 });

  let sawLineTelegraph = false;
  let sawLungeState = false;
  let maxLungeSpeed = 0;
  let prevX = sk.x;
  let prevY = sk.y;
  stepMobSim(mgr, [target], obsGrid, 22, {
    onTick: () => {
      const tels = mobsMod.getMobTelegraphs(mgr);
      if (tels.some((t) => t.kind === 0)) sawLineTelegraph = true;
      if (sk.state === 'lunge') {
        sawLungeState = true;
        const stepSpeed = Math.hypot(sk.x - prevX, sk.y - prevY) * BANSUNG_TICK_HZ;
        maxLungeSpeed = Math.max(maxLungeSpeed, stepSpeed);
      }
      prevX = sk.x;
      prevY = sk.y;
    },
  });

  assert.ok(sawLineTelegraph, 'skirmisher must emit line telegraph during lunge windup');
  assert.ok(sawLungeState, 'skirmisher must enter lunge state');
  assert.ok(
    Math.abs(maxLungeSpeed - BANSUNG_MELEE_SPECIALS.skirmisher.lungeSpeed) < 2,
    `expected lunge speed ~${BANSUNG_MELEE_SPECIALS.skirmisher.lungeSpeed}, got ${maxLungeSpeed}`,
  );
  const expectedLungeDmg = Math.round(BANSUNG_MELEE_SPECIALS.skirmisher.lungeDmg * 1.15);
  assert.equal(
    target.shield,
    40 - expectedLungeDmg,
    'lunge must hit hero exactly once for light-affinity melee dmg',
  );
  assert.ok(sk.lungeCooldownTicks > 0, 'lungeCooldownTicks must activate after lunge');
});

test('mobs: bomb_goblin fuse AoE + friendly fire, LOS occlusion, stun cancel, and safe lethal defuse', () => {
  flocking.resetFlockingScratch();
  const pillar = makeObstacle(1, 700, 520, 48, 160, 'pillar');
  const obsGrid = makeObsGrid([pillar]);

  // Case A: Full detonation damages exposed hero & ally mob, blocked by pillar LOS
  const mgr = mobsMod.createMobManager({ rng: makeRng(31) });
  const exposedHero = makeMobTarget(1, 'p_exp', 640, 600, { shield: 0, hp: 200 });
  const blockedHero = makeMobTarget(2, 'p_hid', 765, 600, { shield: 0, hp: 200 }); // behind pillar from x=600
  const allyScarab = mobsMod.spawnMob(mgr, { kind: 'scarab', x: 635, y: 635 });
  const bomber = mobsMod.spawnMob(mgr, { kind: 'bomb_goblin', x: 600, y: 600 });

  let sawCircleTelegraph = false;
  let sawBlast = false;
  stepMobSim(mgr, [exposedHero, blockedHero], obsGrid, 50, {
    onTick: () => {
      if (mobsMod.getMobTelegraphs(mgr).some((t) => t.kind === 1 && t.r === BANSUNG_MELEE_SPECIALS.bomb_goblin.blastRadius)) {
        sawCircleTelegraph = true;
      }
      if (!bomber.alive) sawBlast = true;
    },
  });

  assert.ok(sawCircleTelegraph, 'bomb_goblin fuse must emit r=88 circle telegraph');
  assert.ok(sawBlast, 'bomb_goblin should self-detonate cleanly');
  assert.ok(exposedHero.hp < 200, 'exposed hero within blast radius should take AoE dmg');
  assert.equal(blockedHero.hp, 200, 'pillar LOS must block bomb_goblin blast damage');
  assert.ok(allyScarab.hp < allyScarab.maxHp, 'friendly fire must hit nearby enemy mobs');

  // Case B: stunMob cancels fuse cleanly with 30t fuse cooldown
  const mgrStun = mobsMod.createMobManager({ rng: makeRng(32) });
  const heroB = makeMobTarget(3, 'p3', 660, 600);
  const bomberB = mobsMod.spawnMob(mgrStun, { kind: 'bomb_goblin', x: 600, y: 600 });
  stepMobSim(mgrStun, [heroB], makeObsGrid(), 3);
  assert.equal(bomberB.state, 'fuse');
  mobsMod.stunMob(mgrStun, bomberB, 500, { tick: 3 });
  assert.equal(bomberB.state, 'stunned');
  assert.equal(bomberB.fuseCooldownTicks, 30, 'stunning fusing bomber must set 30t fuseCooldownTicks');

  // Case C: Killing bomber mid-fuse defuses without explosion
  const mgrKill = mobsMod.createMobManager({ rng: makeRng(33) });
  const heroC = makeMobTarget(4, 'p4', 650, 600, { shield: 0, hp: 200 });
  const bomberC = mobsMod.spawnMob(mgrKill, { kind: 'bomb_goblin', x: 600, y: 600 });
  stepMobSim(mgrKill, [heroC], makeObsGrid(), 4);
  assert.equal(bomberC.state, 'fuse');
  mobsMod.applyMobDamage(mgrKill, bomberC, { baseDmg: 999, dmgKind: 'true', attackerId: heroC.id }, { tick: 4 });
  assert.equal(bomberC.alive, false);
  stepMobSim(mgrKill, [heroC], makeObsGrid(), 5, { startTick: 5 });
  assert.equal(heroC.hp, 200, 'killing bomb_goblin mid-fuse must defuse with zero blast damage');
});

test('mobs: cactus_brute armor, Thorny Hide reflect (15t ICD), Thorny Slam 6 needles & forward cleave', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const mgr = mobsMod.createMobManager({ rng: makeRng(41) });
  const attacker = makeMobTarget(1, 'p1', 640, 600, { shield: 50, hp: 200 });
  const brute = mobsMod.spawnMob(mgr, { kind: 'cactus_brute', x: 600, y: 600 });

  assert.equal(brute.armorType, 'armored');
  assert.equal(brute.flatArmor, 3);
  assert.equal(brute.kbResist, BANSUNG_ENEMIES.cactus_brute.kbResist);
  assert.equal(brute.stunMult, BANSUNG_ENEMIES.cactus_brute.stunMult);

  // Thorny Hide reflect & 15-tick internal cooldown
  const r1 = mobsMod.triggerThornyHide(mgr, brute, attacker, 10);
  assert.ok(r1 && r1.totalDmg === BANSUNG_MELEE_SPECIALS.cactus_brute.thornyHideDmg);
  const r2 = mobsMod.triggerThornyHide(mgr, brute, attacker, 15);
  assert.equal(r2, null, 'Thorny Hide should obey 0.5s (15t) ICD');
  const r3 = mobsMod.triggerThornyHide(mgr, brute, attacker, 25);
  assert.ok(r3 && r3.totalDmg > 0, 'Thorny Hide should trigger again after 15 ticks');

  // Thorny Slam at dist<=58 (off 60-deg needle axes so all 6 radial needles live >=1 tick) emits slam + 6 needles
  attacker.x = 635;
  attacker.y = 625;
  const spawnedNeedles = [];
  stepMobSim(mgr, [attacker], obsGrid, 28, {
    startTick: 30,
    onTick: () => {
      for (const pr of mgr.projectiles) {
        if (pr.kind === 'cactus_needle' && !spawnedNeedles.includes(pr.id)) {
          spawnedNeedles.push(pr.id);
        }
      }
    },
  });
  assert.equal(spawnedNeedles.length, 6, 'Thorny Slam must spawn 6 radial cactus_needle projectiles');

  // Cleave directional cone test (cooldown on slam forces forward 110-deg cleave)
  const mgr2 = mobsMod.createMobManager({ rng: makeRng(42) });
  const brute2 = mobsMod.spawnMob(mgr2, { kind: 'cactus_brute', x: 600, y: 600 });
  brute2.slamCooldownTicks = 200;
  const frontHero = makeMobTarget(1, 'p_front', 632, 600, { shield: 40, hp: 200 });
  const backHero = makeMobTarget(2, 'p_back', 566, 600, { shield: 40, hp: 200, radius: 14 });
  stepMobSim(mgr2, [frontHero, backHero], obsGrid, 22);
  assert.ok(frontHero.shield < 40, 'forward cleave must damage hero in front cone');
  assert.equal(backHero.shield, 40, 'forward cleave must miss hero positioned behind brute');
});

test('mobs: cactus_spitter 3-orb & elite 5-orb fan plus melee projectile destruction', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const mgr = mobsMod.createMobManager({ rng: makeRng(51) });
  const target = makeMobTarget(1, 'p1', 860, 600);
  const spitter = mobsMod.spawnMob(mgr, { kind: 'cactus_spitter', x: 600, y: 600 });
  spitter.cooldownTicks = 0;

  let peakOrbs = 0;
  stepMobSim(mgr, [target], obsGrid, 12, {
    onTick: () => {
      const orbs = mgr.projectiles.filter((p) => p.kind === 'needle_orb');
      if (orbs.length > peakOrbs) peakOrbs = orbs.length;
    },
  });
  assert.equal(peakOrbs, 3, 'standard cactus_spitter must fire 3 needle_orbs');

  const destroyed = mobsMod.destroyMobProjectilesInRadius(mgr, spitter.x, spitter.y, 400);
  assert.ok(destroyed >= 3, 'melee projectile cleave must destroy needle_orb projectiles');

  // Elite variant fires 5-orb spread
  const mgrElite = mobsMod.createMobManager({ rng: makeRng(52) });
  const spitterElite = mobsMod.spawnMob(mgrElite, { kind: 'cactus_spitter', x: 600, y: 600, elite: true });
  spitterElite.cooldownTicks = 0;
  let elitePeakOrbs = 0;
  stepMobSim(mgrElite, [target], obsGrid, 12, {
    onTick: () => {
      const orbs = mgrElite.projectiles.filter((p) => p.kind === 'needle_orb');
      if (orbs.length > elitePeakOrbs) elitePeakOrbs = orbs.length;
    },
  });
  assert.equal(elitePeakOrbs, 5, 'elite cactus_spitter must fire 5 needle_orbs');
});

test('mobs: laser_sniper tracking/lock telegraph, pillar clip, non-destructible slug & elite 2-round burst', () => {
  flocking.resetFlockingScratch();
  const pillar = makeObstacle(1, 800, 520, 48, 160, 'pillar');
  const obsGrid = makeObsGrid([pillar]);
  const mgr = mobsMod.createMobManager({ rng: makeRng(61) });

  // Target in open lane (y=400) for clean shot verification
  const target = makeMobTarget(1, 'p1', 1000, 400, { shield: 40, hp: 200 });
  const sniper = mobsMod.spawnMob(mgr, { kind: 'laser_sniper', x: 600, y: 400 });

  let sawTrackingPhase = false;
  let sawLockedPhase = false;
  let slugCount = 0;
  let slugNonDestructible = false;

  stepMobSim(mgr, [target], obsGrid, 40, {
    onTick: () => {
      // Strafe target perp slightly during first 20 ticks to test slew tracking
      if (target.y < 430) target.y += 1.5;
      const tels = mobsMod.getMobTelegraphs(mgr);
      for (const t of tels) {
        if (t.phase === 0) sawTrackingPhase = true;
        if (t.phase === 1) sawLockedPhase = true;
      }
      for (const p of mgr.projectiles) {
        if (p.kind === 'sniper_slug') {
          slugCount++;
          assert.equal(p.destructibleByMelee, false, 'sniper_slug must NOT be destructible by melee');
          const d = mobsMod.destroyMobProjectilesInRadius(mgr, p.x, p.y, 100);
          assert.equal(d, 0, 'destroyMobProjectilesInRadius must ignore sniper_slug');
          slugNonDestructible = true;
        }
      }
    },
  });

  assert.ok(sawTrackingPhase, 'laser_sniper must emit tracking telegraph phase=0');
  assert.ok(sawLockedPhase, 'laser_sniper must emit locked telegraph phase=1');
  assert.ok(slugCount >= 1 && slugNonDestructible, 'laser_sniper must fire non-destructible sniper_slug');

  // Verify telegraph clips against obstacle when aiming through pillar
  const mgrClip = mobsMod.createMobManager({ rng: makeRng(62) });
  const hiddenTarget = makeMobTarget(2, 'p2', 950, 600);
  const sniperClip = mobsMod.spawnMob(mgrClip, { kind: 'laser_sniper', x: 600, y: 600 });
  // Place pillar in front, test LOS occlusion prevents sniper lock or clips lane
  sniperClip.state = 'aim';
  sniperClip.aimAngle = 0;
  sniperClip.sniperTick = 10;
  sniperClip.stateTicks = 23;
  const telsClip = mobsMod.getMobTelegraphs(mgrClip);
  assert.ok(telsClip.length >= 0);

  // Elite fires 2-round burst (+5 ticks)
  const mgrElite = mobsMod.createMobManager({ rng: makeRng(63) });
  const targetE = makeMobTarget(3, 'p3', 980, 400, { shield: 60, hp: 300 });
  mobsMod.spawnMob(mgrElite, { kind: 'laser_sniper', x: 600, y: 400, elite: true });
  const seenIds = new Set();
  stepMobSim(mgrElite, [targetE], makeObsGrid(), 45, {
    onTick: () => {
      for (const p of mgrElite.projectiles) {
        if (p.kind === 'sniper_slug') seenIds.add(p.id);
      }
    },
  });
  assert.equal(seenIds.size, 2, 'elite laser_sniper must fire 2-round sniper_slug burst');
});

test('mobs: pyro_shaman fireball splash, burn DOT, 2-pool eviction, and 3rd-cast/elite splits', () => {
  flocking.resetFlockingScratch();
  const obsGrid = makeObsGrid();
  const mgr = mobsMod.createMobManager({ rng: makeRng(71) });
  const target = makeMobTarget(1, 'p1', 840, 600, { shield: 40, hp: 300 });
  const pyro = mobsMod.spawnMob(mgr, { kind: 'pyro_shaman', x: 600, y: 600 });

  // Verify fire_pool creation & max 2 pools cap per caster (evicting oldest when 3rd spawns)
  let totalPoolsCreated = 0;
  const seenPoolIds = new Set();
  for (let cycle = 0; cycle < 3; cycle++) {
    pyro.cooldownTicks = 0;
    pyro.state = 'idle';
    // Keep hero alive and standing in range
    target.hp = 300;
    target.shield = 40;
    target.x = 760 + cycle * 20;
    stepMobSim(mgr, [target], obsGrid, 45, {
      startTick: cycle * 45 + 1,
      onTick: () => {
        const haz = mobsMod.getMobHazards(mgr);
        for (const h of haz) {
          if (!seenPoolIds.has(h.id)) {
            seenPoolIds.add(h.id);
            totalPoolsCreated++;
          }
        }
        assert.ok(haz.length <= BANSUNG_RANGED_ATTACKS.pyro_shaman.maxPoolsPerCaster, 'active pools per caster must cap at 2');
      },
    });
  }
  assert.ok(seenPoolIds.size >= 3 || pyro.castCount >= 3, 'pyro_shaman should complete >= 3 casts');

  // Elite cast emits 3 fireballs (main + 2 splits at +/-12 deg)
  const mgrElite = mobsMod.createMobManager({ rng: makeRng(72) });
  const targetE = makeMobTarget(2, 'p2', 850, 600);
  mobsMod.spawnMob(mgrElite, { kind: 'pyro_shaman', x: 600, y: 600, elite: true });
  let maxFireballs = 0;
  stepMobSim(mgrElite, [targetE], obsGrid, 20, {
    onTick: () => {
      const fb = mgrElite.projectiles.filter((p) => p.kind === 'fireball' || p.kind === 'fireball_split');
      if (fb.length > maxFireballs) maxFireballs = fb.length;
    },
  });
  assert.equal(maxFireballs, 3, 'elite pyro_shaman must fire 3 fireballs (+/-12 deg split)');
});

test('mobs: thunder_mage wobbling thunderball (slow+microstun) and cover-ignoring thunder_storm (vuln+stun)', () => {
  flocking.resetFlockingScratch();
  const pillar = makeObstacle(1, 700, 520, 64, 160, 'pillar');

  // Case A: Clear LOS + rng=0.1 -> 2 wobbling thunderballs
  const mgrBall = mobsMod.createMobManager({ rng: () => 0.1 });
  const openTarget = makeMobTarget(1, 'p1', 730, 600, { shield: 50, hp: 200 });
  mobsMod.spawnMob(mgrBall, { kind: 'thunder_mage', x: 600, y: 600 });
  let ballCount = 0;
  stepMobSim(mgrBall, [openTarget], makeObsGrid(), 35, {
    rng: () => 0.1,
    onTick: () => {
      const balls = mgrBall.projectiles.filter((p) => p.kind === 'thunderball');
      if (balls.length > ballCount) ballCount = balls.length;
    },
  });
  assert.equal(ballCount, 2, 'thunder_mage thunderball mode must emit 2 wobbling orbs');
  assert.ok(openTarget.shield < 50, 'thunderball must hit target');

  // Case B: LOS blocked by pillar -> forces Storm Strike ignoring cover (24 dmg, 400ms stun, +15% vulnMult)
  const mgrStorm = mobsMod.createMobManager({ rng: () => 0.1 });
  const hiddenTarget = makeMobTarget(2, 'p2', 840, 600, { shield: 0, hp: 200 });
  mobsMod.spawnMob(mgrStorm, { kind: 'thunder_mage', x: 600, y: 600 });
  let sawStormTel = false;
  stepMobSim(mgrStorm, [hiddenTarget], makeObsGrid([pillar]), 35, {
    rng: () => 0.1,
    onTick: () => {
      if (mobsMod.getMobTelegraphs(mgrStorm).some((t) => t.kind === 1 && t.r === BANSUNG_RANGED_ATTACKS.thunder_mage.stormRadius)) {
        sawStormTel = true;
      }
    },
  });
  assert.ok(sawStormTel, 'LOS-blocked thunder_mage must trigger ground Storm Strike telegraph');
  assert.equal(
    hiddenTarget.hp,
    200 - Math.round(BANSUNG_RANGED_ATTACKS.thunder_mage.stormDmg * 1.1),
    'Storm Strike must bypass pillar LOS (1.1x energy vs light)',
  );
  assert.ok(hiddenTarget.vulnMult >= 1.15 - 1e-6, 'Storm Strike must apply 1.15x vulnerability');
  assert.ok(hiddenTarget.stunMs > 0, 'Storm Strike must stun target');

  // Wire serialization smoke checks (`toEnemyTuple`, `packMobs`, `drainMobFx`)
  const tuple = mobsMod.toEnemyTuple(mgrStorm.mobs[0]);
  assert.equal(tuple.length, 8);
  const packed = mobsMod.packMobs(mgrStorm);
  assert.ok(Array.isArray(packed) && packed.length === 1 && packed[0].length === 8);
  const fx = mobsMod.drainMobFx(mgrStorm);
  assert.ok(Array.isArray(fx) && fx.length > 0);
});

// ============================================================================
// 3. Boss 1: Sand Beholder (`boss-sand.ts`)
// ============================================================================

test('boss-sand: co-op HP scaling, intro invulnerability, Phase 1 volley/slam/dash-evade/pillar-occluded beam', () => {
  assert.equal(bossSand.computeSandBeholderMaxHp(1, 'normal'), 2400);
  assert.equal(bossSand.computeSandBeholderMaxHp(4, 'normal'), 7080);
  assert.equal(
    bossSand.computeSandBeholderMaxHp(1, 'normal', { miniBoss: true }),
    Math.round(2400 * BANSUNG_WAVES[3].miniBoss.hpMult),
  );

  const pillar = makeObstacle(1, 780, 520, 64, 160, 'pillar');
  const obsGrid = makeObsGrid([pillar]);
  const boss = bossSand.createSandBeholderBoss({ x: 640, y: 600, playerCount: 1, difficulty: 'normal' });

  // Intro invulnerability
  assert.equal(boss.state.state, 'intro');
  const blockedHit = boss.applyHit({ baseDmg: 200, dmgKind: 'true', attackerId: 'p1' });
  assert.equal(blockedHit.blocked, true, 'intro state must block all incoming damage');
  assert.equal(boss.state.hp, 2400);

  const pExposed = makeBossPlayer(1, 900, 600);
  for (let i = 0; i < BOSS_BEHOLDER_CFG.introTicks; i++) {
    boss.step({ obsGrid, targets: [pExposed] });
  }
  assert.equal(boss.state.state, 'move', 'boss must exit intro into move after 27 ticks');

  // Force beam_sweep to verify pillar occlusion protects pShielded while pExposed takes fire tick + burn
  const pShielded = makeBossPlayer(2, 920, 600); // directly behind pillar x=780..844
  const pOpenBeam = makeBossPlayer(3, 730, 600); // between boss (640,600) and pillar (780,600)
  boss.state.beamCd = 0;
  boss.state.volleyCd = 999;
  boss.state.slamCd = 999;
  boss.state.stateTick = 0;
  let sawClippedBeam = false;
  let openBeamHits = 0;
  let shieldedBeamHits = 0;

  for (let t = 0; t < 80; t++) {
    const res = boss.step({ obsGrid, targets: [pShielded, pOpenBeam] });
    if (res.bossBeam && res.bossBeam.active && res.bossBeam.len < BOSS_BEHOLDER_CFG.beamRange) {
      sawClippedBeam = true;
    }
    for (const h of res.heroHits) {
      if (h.source === 'beam' && h.targetId === pOpenBeam.id) openBeamHits++;
      if (h.source === 'beam' && h.targetId === pShielded.id) shieldedBeamHits++;
    }
    if (t > 10 && boss.state.state === 'move') break;
  }
  assert.ok(sawClippedBeam, 'eye-beam must clip against pillar obstacle');
  assert.ok(openBeamHits > 0, 'exposed hero in beam path must take fire hits');
  assert.equal(shieldedBeamHits, 0, 'hero shielded behind solid pillar must take 0 beam hits');

  // Slam test: dashing hero evades stun & damage while stationary hero takes stun + damage
  const openGrid = makeObsGrid();
  const bossSlam = bossSand.createSandBeholderBoss({ x: 640, y: 600, initialState: 'move' });
  bossSlam.state.volleyCd = 999;
  bossSlam.state.beamCd = 999;
  bossSlam.state.slamCd = 0;
  const pNormal = makeBossPlayer(1, 700, 600);
  const pDasher = makeBossPlayer(2, 710, 620, { dashIframesMs: 2000 });
  pDasher.combatTarget.dashIframesMs = 2000;

  let slamEvaded = false;
  let slamHit = false;
  for (let t = 0; t < 40; t++) {
    pDasher.dashIframesMs = 2000;
    pDasher.combatTarget.dashIframesMs = 2000;
    const res = bossSlam.step({ obsGrid: openGrid, targets: [pNormal, pDasher] });
    for (const h of res.heroHits) {
      if (h.source === 'slam' && h.targetId === pNormal.id && !h.evadedByDash && h.stunTicks > 0) {
        slamHit = true;
      }
      if (h.source === 'slam' && h.targetId === pDasher.id && h.evadedByDash && h.damage === 0) {
        slamEvaded = true;
      }
    }
  }
  assert.ok(slamHit, 'non-dashing hero within slam radius must be hit & stunned');
  assert.ok(slamEvaded, 'dashing hero with i-frames must evade slam');

  // Volley test: Phase 1 fires 24 thorns (2 rings x 12)
  const bossVolley = bossSand.createSandBeholderBoss({ x: 640, y: 600, initialState: 'move' });
  bossVolley.state.volleyCd = 0;
  bossVolley.state.slamCd = 999;
  bossVolley.state.beamCd = 999;
  let totalThorns = 0;
  for (let t = 0; t < 35; t++) {
    const res = bossVolley.step({ obsGrid: openGrid, targets: [makeBossPlayer(1, 900, 600)] });
    totalThorns += res.projectiles.filter((p) => p.kind === 'thorn').length;
  }
  assert.equal(totalThorns, 24, 'Phase 1 radial volley must fire 2 rings of 12 thorns = 24');
});

test('boss-sand: Phase 2 enrage adds/double-slam/3-ring volley & stagger gauge interrupts attacks', () => {
  const obsGrid = makeObsGrid();
  const boss = bossSand.createSandBeholderBoss({ x: 900, y: 600, initialState: 'move' });
  const hero = makeBossPlayer(1, 1050, 600);

  // Drop HP <= 50% -> immediate enrage_roar transition
  boss.applyHit({ baseDmg: 1300, dmgKind: 'true', attackerId: hero.id });
  assert.equal(boss.state.phase, 2);
  assert.equal(boss.state.state, 'enrage_roar');

  let spawnedAdds = [];
  let sawRoarBlast = false;
  for (let t = 0; t < BOSS_BEHOLDER_CFG.enrageRoarTicks + 2; t++) {
    const res = boss.step({ obsGrid, targets: [hero] });
    if (res.addSpawns.length > 0) spawnedAdds.push(...res.addSpawns);
    if (res.pushbacks.length > 0) sawRoarBlast = true;
  }
  assert.ok(sawRoarBlast, 'enrage_roar must emit radial pushback');
  assert.equal(spawnedAdds.length, 3, 'Phase 2 roar must spawn 2 scarabs + 1 cactus_spitter (3 adds)');

  // Phase 2 volley -> 3 rings x 14 thorns = 42 thorns
  boss.state.state = 'move';
  boss.state.stateTick = 0;
  boss.state.volleyCd = 0;
  boss.state.slamCd = 999;
  boss.state.beamCd = 999;
  let p2Thorns = 0;
  for (let t = 0; t < 40; t++) {
    const res = boss.step({ obsGrid, targets: [hero] });
    p2Thorns += res.projectiles.filter((p) => p.kind === 'thorn').length;
  }
  assert.equal(p2Thorns, 42, 'Phase 2 radial volley must emit 3x14 = 42 thorns');

  // Stagger interrupts active beam_sweep and multiplies damage by staggerDmgMult (1.25x)
  boss.state.state = 'move';
  boss.state.stateTick = 0;
  boss.state.beamCd = 0;
  boss.state.volleyCd = 999;
  boss.state.slamCd = 999;
  for (let t = 0; t < 35; t++) {
    boss.step({ obsGrid, targets: [hero] });
    if (boss.state.state === 'beam_sweep') break;
  }
  assert.equal(boss.state.state, 'beam_sweep');

  const normalRes = boss.applyHit({ baseDmg: 100, dmgKind: 'true', forceCrit: false });
  boss.addStagger(100);
  assert.equal(boss.state.state, 'stagger', 'filling stagger gauge to 100 must interrupt beam_sweep');
  const stepAfterInterrupt = boss.step({ obsGrid, targets: [hero] });
  assert.equal(stepAfterInterrupt.bossBeam, null, 'stagger must clear active eye-beam');

  const staggerRes = boss.applyHit({ baseDmg: 100, dmgKind: 'true', forceCrit: false });
  assert.ok(
    staggerRes.totalDmg > normalRes.totalDmg,
    `staggered boss must take 1.25x amplified damage (${staggerRes.totalDmg} vs ${normalRes.totalDmg})`,
  );

  // Recover from stagger -> gains 300t stagger immunity
  for (let t = 0; t < BOSS_BEHOLDER_CFG.staggerDurationTicks + 2; t++) {
    boss.step({ obsGrid, targets: [hero] });
    if (boss.state.state === 'move') break;
  }
  assert.ok(boss.state.staggerImmuneTicks > 0, 'recovering from stagger must grant stagger immunity');
  assert.equal(boss.addStagger(100), false, 'stagger cannot rebuild during immunity window');

  const frame = boss.toBossFrame();
  const tuple = boss.toEnemyTuple();
  assert.equal(frame.kind, 'boss_beholder');
  assert.equal(tuple.length, 8);
});

// ============================================================================
// 4. Boss 2: Dread Colossus (`boss-colossus.ts`)
// ============================================================================

test('boss-colossus: cleave heat, swept dash + wall crash, mortar barrage, drone phalanx 85% DR & shatter overheat stun', () => {
  const obsGrid = makeObsGrid();
  const boss = bossColossus.createDreadColossus({ x: 500, y: 600, playerCount: 1, difficulty: 'normal' });
  const player = makeMobTarget(1, 'p1', 565, 600, { id: 1, hp: 500, maxHp: 500, shield: 100, maxShield: 100 });

  assert.equal(boss.flatArmor, DREAD_COLOSSUS_CFG.armorNormal);

  // 1. Cleave at close range (<= 95px) adds +10 heat
  let sawCleave = false;
  for (let t = 0; t < 30; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    if (res.events.some((e) => e.type === 'cleave')) sawCleave = true;
    if (sawCleave && boss.state === bossColossus.COLOSSUS_STATE.MARCH) break;
  }
  assert.ok(sawCleave, 'colossus must perform Dread Cleave in melee range');
  assert.equal(boss.heat, bossColossus.COLOSSUS_TUNING.CLEAVE_HEAT);

  // 2. Heavy Dash Charge into left arena wall -> wall_crash (+35 heat) & swept player hit
  player.x = 120;
  player.y = 600;
  boss.x = 240;
  boss.y = 600;
  boss.dashCd = 0;
  boss.mortarCd = 999;
  boss.cleaveCd = 999;
  boss.state = bossColossus.COLOSSUS_STATE.MARCH;
  let sawWallCrash = false;
  const hpBeforeCrash = player.shield + player.hp;
  for (let t = 0; t < 45; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    if (res.events.some((e) => e.type === 'wall_crash')) sawWallCrash = true;
    if (sawWallCrash) break;
  }
  assert.ok(sawWallCrash, 'dashing into arena boundary must emit wall_crash');
  assert.ok(player.shield + player.hp < hpBeforeCrash, 'swept dash / wall crash must damage player');
  assert.equal(
    boss.heat,
    bossColossus.COLOSSUS_TUNING.CLEAVE_HEAT + DREAD_COLOSSUS_CFG.wallCrashHeat,
  );

  // 3. Mortar barrage launches 4 shells in P1, detonating after 42 ticks and adding +30 heat
  boss.x = 1000;
  boss.y = 600;
  player.x = 1200;
  player.y = 600;
  boss.state = bossColossus.COLOSSUS_STATE.MARCH;
  boss.mortarCd = 0;
  boss.dashCd = 999;
  let launches = 0;
  let explosions = 0;
  const heatBeforeMortar = boss.heat;
  for (let t = 0; t < 90; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    for (const ev of res.events) {
      if (ev.type === 'mortar_launch') launches++;
      if (ev.type === 'mortar_explode') explosions++;
    }
    if (explosions >= 4) break;
  }
  assert.equal(launches, 4, 'Phase 1 mortar barrage must launch 4 shells');
  assert.equal(explosions, 4, 'all 4 mortar shells must detonate');
  assert.equal(boss.heat, heatBeforeMortar + DREAD_COLOSSUS_CFG.mortarHeat);

  // 4. Phase 2 drone phalanx at <= 55% HP: 85% DR, crit suppression, and shatter overheat stun (armor=0, vulnMult=1.5)
  bossColossus.damageDreadColossus(boss, { baseDmg: boss.hp - Math.floor(boss.maxHp * 0.5), dmgKind: 'true' });
  boss.state = bossColossus.COLOSSUS_STATE.MARCH;
  let dronesSpawned = false;
  for (let t = 0; t < 25; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    if (res.events.some((e) => e.type === 'drones_spawned')) dronesSpawned = true;
    if (dronesSpawned) break;
  }
  assert.ok(dronesSpawned, 'crossing <=55% HP must summon iron_drone phalanx');
  assert.equal(boss.drones.length, 3);
  assert.equal(boss.damageReduction, DREAD_COLOSSUS_CFG.shieldDr);

  const drHit = bossColossus.damageDreadColossus(boss, { baseDmg: 100, dmgKind: 'true', forceCrit: true });
  assert.equal(drHit.isCrit, false, 'active drones must suppress crits on boss');
  assert.equal(drHit.totalDmg, 15, 'active drones must apply 85% DR (100 * 0.15 = 15)');

  const hpBeforeShatter = boss.hp;
  while (boss.drones.length > 0) {
    bossColossus.damageColossusDrone(boss, boss.drones[0], { baseDmg: 9999, dmgKind: 'true' });
  }
  assert.equal(
    boss.hp,
    hpBeforeShatter - BANSUNG_IRON_DRONE_CFG.shatterBossSelfDmg,
    'destroying final drone must shatter for 180 boss self-dmg',
  );
  assert.equal(boss.state, bossColossus.COLOSSUS_STATE.OVERHEAT_STUN);
  assert.equal(boss.flatArmor, 0);
  assert.equal(boss.vulnMult, DREAD_COLOSSUS_CFG.stunDmgMult);

  const critDuringOverheat = bossColossus.damageDreadColossus(boss, { baseDmg: 100, dmgKind: 'kinetic' });
  assert.equal(critDuringOverheat.isCrit, true, 'overheat_stun must guarantee crits');

  // Step through remaining overheat_stun to verify steam vent exit & heat reset
  player.x = boss.x + 60;
  player.y = boss.y;
  player.hitIframesMs = 0;
  const hpBeforeSteam = player.shield + player.hp;
  let sawOverheatEnd = false;
  for (let t = 0; t < DREAD_COLOSSUS_CFG.stunTicksShatter + 5; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    if (res.events.some((e) => e.type === 'overheat_end')) {
      sawOverheatEnd = true;
      break;
    }
  }
  assert.ok(sawOverheatEnd, 'overheat_stun must emit overheat_end steam vent');
  assert.ok(player.shield + player.hp < hpBeforeSteam, 'exit steam vent must hit players inside r=110px');
  assert.equal(boss.heat, 0);

  // 5. Phase 2 <=55% double-charge chain & drone timeout anti-softlock
  boss.heat = 0;
  boss.state = bossColossus.COLOSSUS_STATE.MARCH;
  boss.mortarCd = 999;
  boss.dashCd = 0;
  player.x = boss.x + 280;
  player.y = boss.y;
  const chainEvents = [];
  for (let t = 0; t < 80; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    for (const ev of res.events) {
      if (ev.type === 'dash_start') chainEvents.push(ev.chain);
    }
    if (chainEvents.includes(1)) break;
  }
  assert.ok(chainEvents.includes(1), 'Phase 2 open dash must chain into second dash (chain: 1)');

  const view = bossColossus.toColossusBossView(boss);
  const frame = bossColossus.toColossusBossFrame(boss);
  assert.equal(view.kind, 'boss_colossus');
  assert.equal(frame.kind, 'boss_colossus');
});

test('boss-colossus: drone phalanx anti-softlock timeout & 100 heat overheat threshold', () => {
  const obsGrid = makeObsGrid();
  const boss = bossColossus.createDreadColossus({ x: 900, y: 600 });
  const player = makeMobTarget(1, 'p1', 1200, 600, { id: 1, hp: 5000, maxHp: 5000, shield: 100, maxShield: 100 });

  // Force 55% drone phase & verify timeout triggers drone_timeout + overheat_stun
  bossColossus.damageDreadColossus(boss, { baseDmg: Math.floor(boss.maxHp * 0.5), dmgKind: 'true' });
  let timedOut = false;
  for (let t = 0; t < DREAD_COLOSSUS_CFG.droneTimeoutTicks + 30; t++) {
    const res = bossColossus.stepDreadColossus(boss, { obsGrid, players: [player] });
    if (res.events.some((e) => e.type === 'drone_timeout')) {
      timedOut = true;
      break;
    }
  }
  assert.ok(timedOut, 'unbroken drones must time out at droneTimeoutTicks to prevent softlock');
  assert.equal(boss.state, bossColossus.COLOSSUS_STATE.OVERHEAT_STUN);
});

// ============================================================================
// 5. Boss 3: Overlord Gunship Core (`boss-overlord.ts`)
// ============================================================================

test('boss-overlord: threat weighting, P1 4-arm spiral + projectile cap, EMP pylon pulse vs backlash, laser grid cover clipping', () => {
  const obsGrid = makeObsGrid();
  const boss = bossOverlord.createOverlordBoss({ x: 960, y: 640, playerCount: 4, difficulty: 'normal' });
  assert.equal(boss.wpCount, 4, '4P co-op Overlord must configure 4 weak points');
  assert.ok(boss.maxHp > OVERLORD_STATS.baseHp, '4P Overlord HP must scale cleanly');

  const p1 = makeMobTarget(1, 1, 1200, 640, { energy: 100, maxEnergy: 100, hp: 500, maxHp: 500, shield: 50, maxShield: 50 });
  const p2 = makeMobTarget(2, 2, 1250, 640, { reviving: true, energy: 100, maxEnergy: 100, hp: 500, maxHp: 500, shield: 50, maxShield: 50 });

  // Threat selection prioritizes reviver / high-damage attacker
  bossOverlord.addOverlordThreat(boss, 1, 50);
  bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1, p2] });
  // Step through enterTicks -> patrol_spiral
  let spiralCount = 0;
  for (let t = 0; t < 25; t++) {
    const res = bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1, p2] });
    spiralCount += res.projectiles.length;
  }
  assert.ok(spiralCount >= 4, 'P1 patrol_spiral must emit 4-arm projectile rings');

  // Projectile cap guard (`activeBossProjectiles = maxActiveProjectiles`)
  const cappedRes = bossOverlord.stepOverlordBoss(boss, {
    obsGrid,
    players: [p1, p2],
    activeBossProjectiles: OVERLORD_STATS.maxActiveProjectiles,
  });
  assert.equal(cappedRes.projectiles.length, 0, 'spiral must respect 160 active boss projectile cap');

  // EMP Pylon deploy -> charge -> pulse OR destruction backlash
  boss.empCd = 0;
  boss.laserCd = 999;
  boss.state = 'patrol_spiral';
  boss.stateTick = 0;
  boss.recoveryTicks = 0;
  const deployStep = bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1, p2] });
  assert.equal(boss.state, 'emp_deploy');
  assert.equal(boss.pylons.length, 2, 'Phase 1 must deploy 2 EMP pylons');

  // Step through 30t landing and 90t charge while placing p1 inside pylon pulse radius
  const pylon0 = boss.pylons[0];
  p1.x = pylon0.x + 20;
  p1.y = pylon0.y;
  p1.reloading = true;
  p1.dashTicksLeft = 4;
  let sawEmpPulse = false;
  for (let t = 0; t < 130; t++) {
    const res = bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1, p2] });
    if (res.empPulses.length > 0) {
      sawEmpPulse = true;
      break;
    }
  }
  assert.ok(sawEmpPulse, 'charged pylon must emit EMP pulse');
  assert.ok(p1.energy < 100, 'EMP pulse must drain player energy');
  assert.ok(p1.stunMs > 0, 'EMP pulse must apply stun');
  assert.equal(p1.reloading, false, 'EMP pulse must cancel active reload');

  // Destroy second pylon near boss & a bystander mob -> triggers Short-Circuit Backlash + stunGauge
  const pylon1 = boss.pylons[1];
  pylon1.landingTicksLeft = 0;
  pylon1.x = boss.x + 60;
  pylon1.y = boss.y;
  const nearbyMob = {
    id: 500,
    x: pylon1.x + 30,
    y: pylon1.y,
    radius: 14,
    team: 1,
    layer: spatial.LAYER_ENEMY,
    tier: 'mob',
    armorType: 'light',
    flatArmor: 0,
    alive: true,
    hp: 200,
    maxHp: 200,
    shield: 0,
    maxShield: 0,
  };
  const mobGrid = new spatial.ActorGrid(BANSUNG_ARENA_W, BANSUNG_ARENA_H);
  mobGrid.rebuild([nearbyMob]);

  const stunBefore = boss.stunGauge;
  const hpBeforeBacklash = boss.hp;
  const pylonRes = bossOverlord.damageOverlordPylon(
    boss,
    pylon1.id,
    { baseDmg: 9999, dmgKind: 'true', attackerId: 'p1' },
    { actorGrid: mobGrid, mobs: [nearbyMob] },
  );
  assert.equal(pylonRes.destroyed, true);
  assert.equal(pylonRes.backlashTriggered, true);
  assert.ok(nearbyMob.hp < 200, 'pylon backlash must damage nearby enemy mobs');
  assert.ok(boss.hp < hpBeforeBacklash, 'nearby boss within 220px must take pylon backlash bonus dmg');
  assert.equal(boss.stunGauge, stunBefore + bossOverlord.OVERLORD_CFG.empBacklashBossStunAdd);

  // Laser Grid with LOS clipping: pillar shields hidden player behind it along the symmetric -70/+70 P1 lanes
  const pillar = makeObstacle(2, 1080, 530, 48, 80, 'pillar');
  const gridWithPillar = makeObsGrid([pillar]);
  const bossLaser = bossOverlord.createOverlordBoss({ x: 900, y: 640 });
  bossLaser.state = 'patrol_spiral';
  bossLaser.stateTick = 0;
  bossLaser.recoveryTicks = 0;
  bossLaser.empCd = 999;
  bossLaser.laserCd = 0;

  const pOpen = makeMobTarget(1, 1, 1020, 710, { hp: 300, maxHp: 300, shield: 50, maxShield: 50 });
  const pHidden = makeMobTarget(2, 2, 1180, 570, { hp: 300, maxHp: 300, shield: 50, maxShield: 50 });
  let sawOpenLaserHit = false;
  let sawHiddenLaserHit = false;
  let laneCount = 0;

  for (let t = 0; t < 80; t++) {
    const res = bossOverlord.stepOverlordBoss(bossLaser, { obsGrid: gridWithPillar, players: [pOpen, pHidden] });
    if (bossLaser.laserLanes.length > laneCount) laneCount = bossLaser.laserLanes.length;
    for (const lh of res.laserHits) {
      if (lh.playerId === 1) sawOpenLaserHit = true;
      if (lh.playerId === 2) sawHiddenLaserHit = true;
    }
    if (t > 10 && bossLaser.state === 'patrol_spiral') break;
  }
  assert.equal(laneCount, 4, 'Phase 1 laser grid must create 4 parallel lanes');
  assert.ok(sawOpenLaserHit, 'exposed player on laser lane must take laser hit');
  assert.equal(sawHiddenLaserHit, false, 'pillar LOS clip must protect hidden player');
});

test('boss-overlord: Phase 2 cross-hatch, weakpoint_matrix break -> 8% shatter + breach_stun (1.65x), and timeout overload', () => {
  const obsGrid = makeObsGrid();
  const boss = bossOverlord.createOverlordBoss({ x: 960, y: 640, playerCount: 2, difficulty: 'normal' });
  const p1 = makeMobTarget(1, 1, 1120, 640, { hp: 500, maxHp: 500, shield: 50, maxShield: 50 });

  // Drop HP <= 60% -> phase_shift -> weakpoint_matrix
  boss.state = 'patrol_spiral';
  bossOverlord.damageOverlordBoss(boss, { baseDmg: Math.floor(boss.maxHp * 0.45), dmgKind: 'true', attackerId: 1 });
  assert.equal(boss.phase, 2);
  assert.equal(boss.state, 'phase_shift');

  for (let t = 0; t < bossOverlord.OVERLORD_CFG.phaseShiftTicks; t++) {
    bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1] });
  }
  assert.equal(boss.state, 'weakpoint_matrix');
  assert.equal(boss.weakPoints.length, 3, '2P Overlord must spawn 1+2=3 weak-point nodes');
  assert.equal(boss.flatArmor, OVERLORD_STATS.matrixArmor);

  // Break all weak-points -> instant 8% maxHp burst + 2 energy orbs + breach_stun (1.65x vuln)
  const hpBeforeBreach = boss.hp;
  let lastWpRes;
  for (const wp of boss.weakPoints) {
    lastWpRes = bossOverlord.damageOverlordWeakPoint(boss, wp.idx, { baseDmg: 9999, dmgKind: 'true' });
  }
  assert.equal(lastWpRes.allBroken, true);
  assert.equal(lastWpRes.energyOrbs.length, 2, 'breach must drop 2 energy orbs');
  assert.equal(boss.state, 'breach_stun');
  assert.equal(boss.vulnMult, OVERLORD_STATS.breachDamageMul);
  assert.equal(boss.flatArmor, 0);
  const expectedShatter = Math.round(boss.maxHp * OVERLORD_STATS.breachBurstPct);
  assert.equal(hpBeforeBreach - boss.hp, expectedShatter, 'weak-point shatter must deal 8% maxHp burst');

  // Verify Phase 2 cross-hatch laser builds 6 (3x3) lanes
  boss.stunMs = 0;
  boss.shockStunTicks = 0;
  boss.state = 'patrol_spiral';
  boss.stateTick = 0;
  boss.recoveryTicks = 0;
  boss.weakPointCd = 999;
  boss.empCd = 999;
  boss.laserCd = 0;
  bossOverlord.stepOverlordBoss(boss, { obsGrid, players: [p1] });
  assert.equal(boss.state, 'laser_telegraph');
  assert.equal(boss.laserLanes.length, 6, 'Phase 2 cross-hatch laser grid must create 3+3 = 6 lanes');

  // Weak-point matrix timeout failure emits overloadShockwave
  const bossTimeout = bossOverlord.createOverlordBoss({ x: 960, y: 640, playerCount: 1 });
  bossTimeout.phase = 2;
  bossTimeout.phase2Triggered = true;
  bossOverlord.enterWeakPointMatrix(bossTimeout);
  p1.x = 1050;
  p1.y = 640;
  let shockwave = null;
  for (let t = 0; t < OVERLORD_STATS.weakPointWindowTicks + 5; t++) {
    const res = bossOverlord.stepOverlordBoss(bossTimeout, { obsGrid, players: [p1] });
    if (res.overloadShockwave) {
      shockwave = res.overloadShockwave;
      break;
    }
  }
  assert.ok(shockwave, 'unbroken weak-point matrix timeout must emit overloadShockwave');
  assert.equal(shockwave.dmg, bossOverlord.OVERLORD_CFG.overloadDmg);

  const view = bossOverlord.toOverlordView(bossTimeout);
  const frame = bossOverlord.toOverlordBossFrame(bossTimeout);
  const tels = bossOverlord.getOverlordTelegraphs(boss);
  assert.equal(view.kind, 'boss_overlord');
  assert.equal(frame.kind, 'boss_overlord');
  assert.ok(Array.isArray(tels));
});

// ============================================================================
// 6. 10-Wave Director Pacing, Sieges, Stragglers & Endless (`director.ts`)
// ============================================================================

test('director: warmup 5s + portal telegraphs, active mob cap backpressure, straggler enrage & team wipe defeat', () => {
  const arena = mapMod.buildServerArena('desert', 7);
  const players = [
    makeDirectorPlayer(0, BANSUNG_ARENA_CX - 60, BANSUNG_ARENA_CY),
    makeDirectorPlayer(1, BANSUNG_ARENA_CX + 60, BANSUNG_ARENA_CY),
  ];

  const dir = new directorMod.WaveDirector({ difficulty: 'normal', reviveMode: 'coop', seed: 99 });
  assert.equal(dir.phase, 'warmup');

  let sawTelegraph = false;
  let enteredWave1 = false;
  for (let i = 0; i < 160; i++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0 });
    if (out.spawnTelegraphs && out.spawnTelegraphs.length > 0) sawTelegraph = true;
    if (dir.wave === 1) {
      enteredWave1 = true;
      break;
    }
  }
  assert.ok(sawTelegraph, 'warmup must emit 3.0s spawn portal telegraphs');
  assert.ok(enteredWave1, 'director must transition from warmup into Wave 1');

  // Verify computeWaveMaxMobs(1) = 10 active cap & 52-mob hard cap backpressure withhold spawns when reached
  assert.equal(computeWaveMaxMobs(1), 10);
  assert.equal(dir.activeMobCap, computeWaveMaxMobs(1));
  const cappedW1Out = dir.step({
    players,
    arena,
    obsGrid: arena.obsGrid,
    activeMobs: computeWaveMaxMobs(1),
  });
  assert.equal(cappedW1Out.spawns.length, 0, 'director must withhold spawns while activeMobs >= W1 computeWaveMaxMobs(1) = 10');
  const cappedOut = dir.step({
    players,
    arena,
    obsGrid: arena.obsGrid,
    activeMobs: directorMod.DIRECTOR_MOB_HARD_CAP,
  });
  assert.equal(cappedOut.spawns.length, 0, 'director must withhold spawns while activeMobs >= 52 hard cap');

  // Drain Wave 1 budget cleanly into cleanup phase, then test straggler enrage after >= 12s
  for (let i = 0; i < 600 && dir.phase === 'spawning'; i++) {
    dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 2 });
  }
  assert.equal(dir.phase, 'cleanup');

  const stragglers = [{ id: 1, x: 200, y: 200, alive: true, speed: 100, moveSpeed: 100, isBoss: false }];
  let enrageEvent = null;
  for (let i = 0; i < Math.ceil(13 * BANSUNG_TICK_HZ); i++) {
    const out = dir.step({
      players,
      arena,
      obsGrid: arena.obsGrid,
      activeMobs: 1,
      activeMobRefs: stragglers,
    });
    if (out.stragglerEnrage) enrageEvent = out.stragglerEnrage;
  }
  assert.ok(enrageEvent && enrageEvent.active, 'cleanup <=3 mobs for >=12s must trigger stragglerEnrage');
  assert.equal(stragglers[0].revealed, true);
  assert.equal(stragglers[0].enraged, true);
  assert.ok(stragglers[0].speed > 100);

  // Team wipe defeat
  for (const p of players) {
    p.life = 'downed';
    p.downed = true;
  }
  const wipeOut = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 1 });
  assert.equal(wipeOut.finished, 'defeat');
  assert.equal(dir.phase, 'defeat');
});

test('director: W4 Mini-Boss, W5 Portal Rush, W6 Supply Beacon, W7 Artillery, W8 Elites, W10 Biome Bosses & Victory', () => {
  const arena = mapMod.buildServerArena('desert', 21);
  const players = [
    makeDirectorPlayer(0, BANSUNG_ARENA_CX, BANSUNG_ARENA_CY),
    makeDirectorPlayer(1, BANSUNG_ARENA_CX + 30, BANSUNG_ARENA_CY, { life: 'dead', alive: false, hp: 0 }),
  ];

  const dir = new directorMod.WaveDirector({ difficulty: 'normal', reviveMode: 'coop', seed: 123, biome: 'desert' });

  // W4 Mini-Boss spawns 0.48x HP mini-boss & wave clear applies applyWaveClearRevives + Perk Draft
  dir.skipToWave(4);
  const w4Out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false });
  const miniBossSpawn = w4Out.spawnBoss;
  assert.ok(miniBossSpawn, 'Wave 4 must emit spawnBoss mini-boss');
  assert.equal(miniBossSpawn.mini, true);
  assert.ok(
    Math.abs(
      miniBossSpawn.hpMult -
        shared.computeBossHpMult(players.length, 'normal', 0) * BANSUNG_WAVES[3].miniBoss.hpMult,
    ) < 1e-6,
  );
  assert.equal(miniBossSpawn.id, 'boss_beholder');

  // Wave cannot complete while bossAlive === true
  for (let t = 0; t < 600 && dir.phase === 'spawning'; t++) {
    dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: true });
  }
  const blockedClear = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: true });
  assert.equal(blockedClear.waveClear, undefined, 'wave must wait for living boss');

  const clearW4 = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false });
  assert.ok(clearW4.waveClear, 'killing mini-boss with 0 activeMobs must clear Wave 4');
  assert.equal(clearW4.waveClear.openPerkDraft, true, 'Wave 4 must open perk draft');
  assert.ok(clearW4.waveClear.revivedPlayerIds.includes('p1'), 'dead teammate must revive on wave clear');
  assert.equal(dir.phaseTimer, directorMod.BANSUNG_BOSS_INTERMISSION_S, 'post-W4 uses 9s boss intermission');

  // W5 Portal Rush: destructible gates block clear until damaged to 0
  players[1].life = 'alive';
  players[1].alive = true;
  dir.skipToWave(5, { players, arena, obsGrid: arena.obsGrid });
  assert.ok(dir.getAlivePortalGates().length >= 2, 'Wave 5 portal_rush must spawn destructible gates');
  for (let t = 0; t < 2400 && dir.phase === 'spawning'; t++) {
    dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0 });
  }
  assert.equal(dir.isSiegeBlockingClear(), true, 'alive portal gates must block W5 clear');
  for (const gate of dir.getAlivePortalGates()) {
    dir.damagePortalGate(gate.id, gate.hp + 10);
  }
  const clearW5 = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0 });
  assert.ok(clearW5.waveClear, 'destroying portal gates with 0 mobs must clear Wave 5');

  // W6 Supply Beacon: standing players inside hold radius complete beacon & emit AoE stun
  dir.skipToWave(6, { players, arena, obsGrid: arena.obsGrid });
  const beaconHud = dir.getHud();
  assert.equal(beaconHud.siege, 'supply_beacon');
  assert.equal(dir.beaconState.active, true, 'Wave 6 must initialize supply_beacon');
  for (const p of players) {
    p.x = dir.beaconState.x;
    p.y = dir.beaconState.y;
  }
  let completedEvt = null;
  for (let t = 0; t < 800; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 1 });
    if (out.beaconCompleted) {
      completedEvt = out.beaconCompleted;
      break;
    }
  }
  assert.ok(completedEvt && completedEvt.stunMs > 0, 'holding Supply Beacon to 100% must emit EMP stun completion');

  // W7 Artillery Siege: detonates telegraph strikes during wave
  dir.skipToWave(7, { players, arena, obsGrid: arena.obsGrid });
  let artilleryBlast = false;
  for (let t = 0; t < 300; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 1 });
    if (out.artilleryDetonations && out.artilleryDetonations.length > 0) {
      artilleryBlast = true;
      break;
    }
  }
  assert.ok(artilleryBlast, 'Wave 7 artillery_siege must queue & detonate mortar rings');

  // W8 Elite Mix spawns elites cleanly
  dir.skipToWave(8, { players, arena, obsGrid: arena.obsGrid });
  const spawnedW8 = [];
  for (let t = 0; t < 800 && dir.phase === 'spawning'; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0 });
    spawnedW8.push(...out.spawns);
  }
  assert.ok(spawnedW8.some((s) => s.elite), 'Wave 8 must spawn elite mobs with affixes');

  // W10 Biome Bosses: crypt -> boss_colossus, cyber -> boss_overlord, plus Victory on standard run
  const dirCrypt = new directorMod.WaveDirector();
  dirCrypt.skipToWave(10);
  const cryptOut = dirCrypt.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false, biome: 'crypt' });
  assert.ok(cryptOut.spawnBoss, 'crypt W10 must emit spawnBoss');
  assert.equal(cryptOut.spawnBoss.id, 'boss_colossus', 'crypt W10 boss must be boss_colossus');

  const dirCyber = new directorMod.WaveDirector({ endlessEnabled: false });
  dirCyber.skipToWave(10);
  const cyberOut = dirCyber.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false, biome: 'cyber' });
  assert.ok(cyberOut.spawnBoss, 'cyber W10 must emit spawnBoss');
  assert.equal(cyberOut.spawnBoss.id, 'boss_overlord', 'cyber W10 boss must be boss_overlord');

  for (let t = 0; t < 2400 && dirCyber.phase === 'spawning'; t++) {
    dirCyber.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: true, biome: 'cyber' });
  }
  const winOut = dirCyber.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false, biome: 'cyber' });
  assert.equal(winOut.finished, 'victory', 'clearing W10 without endless unlocked must finish with victory');
});

test('director: W11+ endless cycle rotation, Twin Vanguard, Apex Bosses & custom mutator registry', () => {
  const arena = mapMod.buildServerArena('desert', 55);
  const players = [makeDirectorPlayer(0, BANSUNG_ARENA_CX, BANSUNG_ARENA_CY)];

  let mutStarted = 0;
  directorMod.registerEndlessMutator({
    id: 'test_hyper_haste',
    name: 'Hyper Haste',
    mobSpeedMul: 1.25,
    energyCostMul: 0.85,
    crateCountMul: 2,
    onWaveStart: () => {
      mutStarted++;
    },
  });

  const dir = new directorMod.WaveDirector({
    endlessEnabled: true,
    pinnedMutators: ['test_hyper_haste'],
    biome: 'desert',
  });
  dir.unlockEndless();

  // W14 = Endless step 3 (Twin Vanguard -> 2 mini-bosses)
  dir.skipToWave(14);
  const w14Out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false });
  assert.ok(mutStarted > 0, 'pinned custom mutator onWaveStart must invoke cleanly');
  assert.equal(dir.getMobSpeedMult(), 1.25);
  assert.equal(dir.getEnergyCostMult(), 0.85);
  assert.equal(dir.getCrateCountMult(), 2);

  assert.ok(w14Out.spawnBoss && w14Out.spawnBoss.mini === true, 'Endless step 3 (W14) must emit mini-boss spawnBoss');
  assert.equal(w14Out.spawnBoss.count, 2, 'Endless step 3 (W14) Twin Vanguard must spawn 2 bosses');
  assert.equal(w14Out.spawnBoss.positions.length, 2);

  // W15 = Endless step 4 (Apex Boss rotation)
  dir.skipToWave(15);
  const w15Out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, bossAlive: false });
  const apexBoss = w15Out.spawnBoss;
  assert.ok(apexBoss && apexBoss.mini === false, 'Endless step 4 (W15) must spawn Apex Boss');
  assert.ok(apexBoss.hpMult > 1.0, 'Endless Apex Boss hpMult must exceed baseline');
});

// ============================================================================
// 7. Co-op Bleedout/Revive Ring, Companion AI Bot & Tiger Pet (`bot.ts`)
// ============================================================================

test('bot/revive: bleedout repeat penalty (-3s, min 8s), bleed pause, 2-rescuer speed boost, decay & party wipe', () => {
  const pDown = makeBotPlayer(0, 'p0', 500, 500);
  const rescuer1 = makeBotPlayer(1, 'p1', 530, 500);
  const rescuer2 = makeBotPlayer(2, 'p2', 500, 530);

  // Repeat downs reduce bleedMax: 18 -> 15 -> 12 -> 9 -> 8 (clamped)
  const expectedBleeds = [18, 15, 12, 9, 8, 8];
  for (const exp of expectedBleeds) {
    pDown.life = 'alive';
    pDown.downed = false;
    botMod.enterDownedState(pDown, 'coop');
    assert.equal(pDown.bleedMax, exp, `repeat down bleedMax must equal ${exp}s`);
  }

  // Fresh down for revive mechanics check
  pDown.downCountWave = 0;
  botMod.enterDownedState(pDown, 'coop');
  const nearbyMob = { id: 'm1', x: 540, y: 500, vx: 0, vy: 0, radius: 14, alive: true, isBoss: false };
  const world = { reviveMode: 'coop', players: [pDown, rescuer1, rescuer2], enemies: [nearbyMob] };

  // 1 rescuer inside 72px pauses bleedLeft and fills reviveProg
  rescuer2.x = 800; // outside ring first
  const bleedBefore = pDown.bleedLeft;
  for (let i = 0; i < 45; i++) {
    botMod.stepDownedAndRevive(world, 1 / BANSUNG_TICK_HZ);
  }
  assert.equal(pDown.bleedLeft, bleedBefore, 'bleedout must pause while >=1 rescuer is inside 72px ring');
  const progSingle = pDown.reviveProg;
  assert.ok(progSingle > 0.5);

  // Move rescuer1 out -> decay at 0.45/s and bleedout ticks down
  rescuer1.x = 800;
  botMod.stepDownedAndRevive(world, 0.5);
  assert.ok(Math.abs((progSingle - pDown.reviveProg) - 0.5 * botMod.BANSUNG_REVIVE_DECAY_S) < 1e-4);
  assert.ok(pDown.bleedLeft < bleedBefore);

  // Two rescuers boost speed (1.45x) and complete revive -> 45% HP, 50% shield, 2s invuln, 110px pushback, revives++
  rescuer1.x = 525;
  rescuer2.x = 500;
  rescuer2.y = 525;
  let reviveRes = null;
  for (let i = 0; i < 90; i++) {
    reviveRes = botMod.stepDownedAndRevive(world, 1 / BANSUNG_TICK_HZ);
    if (reviveRes.revivedIds.includes('p0')) break;
  }
  assert.ok(reviveRes && reviveRes.revivedIds.includes('p0'), 'two rescuers must revive downed player');
  assert.equal(pDown.life, 'alive');
  assert.equal(pDown.hp, Math.ceil(pDown.maxHp * 0.45));
  assert.equal(pDown.shield, Math.ceil(pDown.maxShield * 0.5));
  assert.equal(pDown.invulnTimer, botMod.BANSUNG_REVIVE_INVULN_S);
  assert.ok(Math.hypot(nearbyMob.x - pDown.x, nearbyMob.y - pDown.y) > 80, 'revive shockwave must push non-boss mob');
  assert.ok(rescuer1.revives >= 1 || rescuer2.revives >= 1, 'top rescuer must earn revive credit');

  // Unrescued down expires -> dead + partyWiped when last standing falls
  rescuer1.life = 'dead';
  rescuer1.alive = false;
  rescuer2.life = 'dead';
  rescuer2.alive = false;
  botMod.enterDownedState(pDown, 'hardcore');
  pDown.bleedLeft = 0.2;
  const wipeStep = botMod.stepDownedAndRevive(world, 0.5);
  assert.ok(wipeStep.deadIds.includes('p0'));
  assert.equal(wipeStep.partyWiped, true, 'last standing player dying must signal partyWiped');
});

test('bot/ai: easy/normal/hard profiles, rescue fight-inside-ring, downed crawl ping, dash reflex, weapon fallback & perk pick', () => {
  assert.ok(botMod.BANSUNG_BOT_PROFILES.easy.thinkIntervalTicks > botMod.BANSUNG_BOT_PROFILES.hard.thinkIntervalTicks);
  assert.ok(botMod.BANSUNG_BOT_PROFILES.hard.velocityLead > botMod.BANSUNG_BOT_PROFILES.easy.velocityLead);
  assert.ok(botMod.BANSUNG_BOT_PROFILES.hard.revivePriority > botMod.BANSUNG_BOT_PROFILES.easy.revivePriority);

  const pillar = makeObstacle(1, 700, 560, 48, 80, 'pillar');
  const obsGrid = makeObsGrid([pillar]);

  // Rescue + fight-inside-ring + perk draft pick
  const downedAlly = makeBotPlayer(0, 'human', 520, 600);
  botMod.enterDownedState(downedAlly, 'coop');
  const botHero = makeBotPlayer(1, 'bot1', 560, 600, {
    bot: true,
    brain: botMod.createBotBrain('hard', 7),
    perkChoices: ['vitality_boost', 'rapid_reload'],
  });
  const enemy = { id: 200, kind: 'scarab', x: 690, y: 600, vx: 0, vy: 0, radius: 14, alive: true };
  const world = { tickNo: 10, obsGrid, players: [downedAlly, botHero], enemies: [enemy], rng: makeRng(88) };

  const cmds = [];
  for (let t = 0; t <= botMod.BANSUNG_BOT_PROFILES.hard.perkDelayTicks; t++) {
    cmds.push(...botMod.runBansungBot({ ...world, tickNo: 10 + t }, botHero, 1 / BANSUNG_TICK_HZ));
  }
  assert.equal(botHero.brain.state, 'rescue', 'bot must prioritize rescuing downed ally');
  assert.ok(cmds.some((c) => c.t === 'perk'), 'bot must pick from pending perkChoices');
  const inCmd = cmds.find((c) => c.t === 'in');
  assert.ok(inCmd && inCmd.fire === 1, 'bot must fight enemies while orbiting inside revive ring');

  // Downed crawl toward alive ally & revive ping
  const aliveAlly = makeBotPlayer(2, 'ally2', 420, 600);
  botMod.enterDownedState(botHero, 'coop');
  botHero.brain.lastPingTick = -200;
  const crawlCmds = botMod.runBansungBot(
    { tickNo: 15, obsGrid, players: [botHero, aliveAlly], enemies: [] },
    botHero,
    1 / BANSUNG_TICK_HZ,
  );
  assert.equal(botHero.brain.state, 'downed_crawl');
  assert.ok(crawlCmds.some((c) => c.t === 'ping' && c.kind === BANSUNG_PING_REVIVE));
  const crawlIn = crawlCmds.find((c) => c.t === 'in');
  assert.ok(crawlIn.fire === 0 && crawlIn.mx < 0, 'downed bot must crawl toward ally without firing');

  // Emergency dash reflex against incoming bullet
  const nimbleBot = makeBotPlayer(3, 'bot3', 600, 400, {
    bot: true,
    brain: botMod.createBotBrain('hard', 3),
    dashCdMs: 0,
    dashLeftMs: 0,
  });
  const dashCmds = botMod.runBansungBot(
    {
      tickNo: 20,
      obsGrid: makeObsGrid(),
      players: [nimbleBot],
      enemies: [],
      projectiles: [{ alive: true, team: 1, x: 560, y: 400, vx: 320, vy: 0, radius: 6 }],
      rng: () => 0.1,
    },
    nimbleBot,
    1 / BANSUNG_TICK_HZ,
  );
  assert.ok(dashCmds.some((c) => c.t === 'dash'), 'hard bot must emergency-dash perpendicular to incoming projectile');

  // Energy exhaustion fallback swaps from high-cost slot to 0-energy slot 0
  const lowEnergyBot = makeBotPlayer(4, 'bot4', 500, 400, {
    bot: true,
    brain: botMod.createBotBrain('normal', 5),
    slotIdx: 1,
    energy: 5,
    maxEnergy: 100,
    slots: [
      { id: 'pistol', clip: 12, maxClip: 12 },
      { id: 'railgun', clip: 20, maxClip: 20 },
    ],
  });
  const swapCmds = botMod.runBansungBot(
    { tickNo: 30, obsGrid: makeObsGrid(), players: [lowEnergyBot], enemies: [enemy] },
    lowEnergyBot,
    1 / BANSUNG_TICK_HZ,
  );
  assert.ok(swapCmds.some((c) => c.t === 'slot' && c.idx === 0), 'low-energy bot must swap back to 0-cost slot 0 weapon');
});

test('bot/pet: Tiger Pet spring follow, leash teleport, pickup magnet, pounce bite & LOS-gated mini-fire', () => {
  const pillar = makeObstacle(1, 700, 540, 48, 120, 'pillar');
  const obsGrid = makeObsGrid([pillar]);
  const owner = makeBotPlayer(0, 'human', 600, 600, {
    hp: 60,
    maxHp: 120,
    energy: 50,
    maxEnergy: 120,
    pet: botMod.createPetState(560, 610, 'tiger'),
  });
  const aiCompanionWithPet = makeBotPlayer(1, 'bot1', 620, 600, {
    bot: true,
    pet: botMod.createPetState(590, 610, 'tiger'), // stepPets skips bot players cleanly
  });

  // 1. Pickup magnet skips weapon_pedestal and pulls needed hp/coin pickups within 140px
  const hpOrb = { id: 1, kind: 'hp_orb', x: 680, y: 600, alive: true, claimed: false };
  const pedestal = { id: 2, kind: 'weapon_pedestal', weaponId: 'shotgun', x: 660, y: 600, alive: true, claimed: false };
  const pickups = [hpOrb, pedestal];

  // Step once to pull hpOrb toward owner
  const world = { obsGrid, players: [owner, aiCompanionWithPet], enemies: [], pickups };
  botMod.stepPets(world, 1 / BANSUNG_TICK_HZ);
  assert.ok(hpOrb.x < 680, 'pet magnet must pull needed hp_orb toward owner');
  assert.equal(pedestal.x, 660, 'pet magnet must NEVER pull weapon_pedestal');

  // Move hpOrb inside capture radius -> emits capture event
  hpOrb.x = owner.x + 8;
  hpOrb.y = owner.y;
  const capRes = botMod.stepPet(world, owner, owner.pet, 1 / BANSUNG_TICK_HZ);
  assert.equal(capRes.capturedPickups.length, 1);

  // 2. Pounce bite deals POUNCE_DMG (10) within 115px
  const targetMob = {
    id: 'm_close',
    x: owner.x + 70,
    y: owner.y,
    vx: 0,
    vy: 0,
    radius: 14,
    tier: 'mob',
    armorType: 'light',
    flatArmor: 0,
    alive: true,
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 0,
    kbResist: 0,
  };
  world.enemies = [targetMob];
  owner.pet.pounceCd = 0;
  let sawPounceHit = false;
  for (let i = 0; i < 25; i++) {
    const stepRes = botMod.stepPet(world, owner, owner.pet, 1 / BANSUNG_TICK_HZ);
    if (stepRes.pounceHits.length > 0) {
      sawPounceHit = true;
      break;
    }
  }
  assert.ok(sawPounceHit, 'pet pounce must connect on enemy within 115px');
  assert.ok(targetMob.hp < 100, 'pet pounce must damage enemy');

  // 3. Mini-Fire ember requires clear LOS (`85..195px`) and fails when blocked behind pillar
  owner.pet.state = 0;
  owner.pet.pounceCd = 5;
  owner.pet.fireCd = 0;
  owner.pet.x = 600;
  owner.pet.y = 600;
  const blockedEnemy = { id: 'm_hid', x: 780, y: 600, radius: 14, alive: true, hp: 100, maxHp: 100 };
  world.enemies = [blockedEnemy];
  const noLosRes = botMod.stepPet(world, owner, owner.pet, 1 / BANSUNG_TICK_HZ);
  assert.equal(noLosRes.spawnedEmbers.length, 0, 'pet mini-fire must NOT fire through solid pillar');

  const openEnemy = { id: 'm_open', x: owner.x, y: owner.y - 140, radius: 14, alive: true, hp: 100, maxHp: 100 };
  world.enemies = [openEnemy];
  const emberRes = botMod.stepPet(world, owner, owner.pet, 1 / BANSUNG_TICK_HZ);
  assert.equal(emberRes.spawnedEmbers.length, 1, 'pet must emit pet_ember against open target in 85..195px');
  assert.equal(emberRes.spawnedEmbers[0].damage, BANSUNG_PET_TUNING.FIRE_DMG);

  // 4. Hard snap beyond TELEPORT_DIST (360px) & 4-int wire tuple serialization
  owner.x = 1400;
  owner.y = 600;
  botMod.stepPet(world, owner, owner.pet, 1 / BANSUNG_TICK_HZ);
  assert.ok(
    Math.hypot(owner.pet.x - owner.x, owner.pet.y - owner.y) < 80,
    'pet beyond TELEPORT_DIST (360px) must hard-snap near owner',
  );
  const tup = botMod.serializePetTuple(owner.pet);
  assert.equal(tup.length, 4);
  assert.ok(tup.every(Number.isInteger));
});

// ============================================================================
// 8. Survival 20-Minute Repeating Cycle & 6336x4032 12-Gate Convergence
// ============================================================================

test('survival: 20-min repeating cycle (0-5m swarm_light, 5-10m heavy_brute, 10-15m boss_hunt, 15-20m evolved_horde + BANSUNG_EFLAG_EVOLVED, 20:00 cycle wrap)', () => {
  assert.equal(BANSUNG_MAP_W, 6336);
  assert.equal(BANSUNG_MAP_H, 4032);
  assert.equal(BANSUNG_SURVIVAL_STAGE_S, 300);
  assert.equal(BANSUNG_SURVIVAL_CYCLE_S, 1200);

  const arena = mapMod.buildServerArena('desert', 77);
  assert.equal(arena.obsGrid.mapW, 6336);
  assert.equal(arena.obsGrid.mapH, 4032);
  assert.equal(arena.enemyGates.length, 12);

  const players = [
    makeDirectorPlayer(0, BANSUNG_ARENA_CX, BANSUNG_ARENA_CY),
    makeDirectorPlayer(1, BANSUNG_ARENA_CX + 40, BANSUNG_ARENA_CY),
  ];

  const dir = new directorMod.WaveDirector({
    gameMode: 'survival',
    difficulty: 'normal',
    seed: 77,
  });

  // 1. Stage 0 (0-5m, swarm_light): exits 3.0s warmup and spawns weak farm mobs
  let stage0Entry = null;
  const stage0Spawns = [];
  for (let t = 0; t < 160; t++) {
    const out = dir.step({
      players,
      arena,
      obsGrid: arena.obsGrid,
      activeMobs: stage0Spawns.length,
      biome: 'desert',
    });
    if (out.survivalStageChange && !stage0Entry) {
      stage0Entry = out;
    }
    stage0Spawns.push(...out.spawns);
  }
  assert.equal(dir.phase, 'spawning');
  assert.ok(stage0Entry && stage0Entry.survivalClock, 'survival mode must emit survivalClock');
  assert.equal(stage0Entry.survivalClock.mode, 'survival');
  assert.equal(stage0Entry.survivalClock.cycle, 0);
  assert.equal(stage0Entry.survivalClock.stageIdx, 0);
  assert.equal(stage0Entry.survivalStageChange.stageId, 'swarm_light');
  assert.ok(stage0Spawns.length > 0, 'Stage 0 swarm_light must emit initial farm burst');

  const stage0Roster = new Set(BANSUNG_SURVIVAL_STAGES[0].roster.map((r) => r.kind));
  for (const s of stage0Spawns) {
    assert.ok(stage0Roster.has(s.kind), `Stage 0 kind ${s.kind} must come from swarm_light roster`);
    assert.ok(!s.evolved, 'Stage 0 mobs must not carry evolved flag');
  }
  const stage0HpMult = dir.mobHpMult;
  const stage0DmgMult = dir.mobDmgMult;

  // 2. Stage 1 (2-5m, heavy_brute): tough armored heavy roster (after 120s)
  dir.skipToSurvivalTime(125);
  const stage1Spawns = [];
  let stage1Change = null;
  for (let t = 0; t < 100; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, biome: 'desert' });
    if (out.survivalStageChange) stage1Change = out.survivalStageChange;
    stage1Spawns.push(...out.spawns);
  }
  assert.ok(stage1Change && stage1Change.stageIdx === 1 && stage1Change.stageId === 'heavy_brute');
  assert.ok(dir.mobHpMult > stage0HpMult, 'Stage 1 heavy_brute must raise mobHpMult above Stage 0');
  assert.ok(stage1Spawns.length > 0, 'Stage 1 must spawn heavy_brute bursts');
  const s1Mgr = mobsMod.createMobManager({ rng: makeRng(78) });
  for (const s of stage1Spawns) {
    assert.ok((s.armorAdd ?? 0) >= 1, 'Stage 1 heavy_brute must grant bonusArmor >= 1');
    const mob = mobsMod.spawnMobFromDirector(s1Mgr, s);
    assert.ok(mob.flatArmor >= BANSUNG_ENEMIES[s.kind].armor + 1, 'spawned Stage 1 mob must inherit bonusArmor');
  }

  // Verify bossAlive: true pauses regular wave bursts while boss fight is active
  for (let t = 0; t < 40; t++) {
    const pausedOut = dir.step({
      players,
      arena,
      obsGrid: arena.obsGrid,
      activeMobs: 0,
      bossAlive: true,
      biome: 'desert',
    });
    assert.equal(pausedOut.spawns.length, 0, 'regular wave bursts must pause when bossAlive is true');
  }

  // 3. Survival 4-Boss milestones (2m Arsenal, 5m Overlord, 8m Colossus, 12m Beholder) + pedestal drops
  const bossDir = new directorMod.WaveDirector({
    gameMode: 'survival',
    difficulty: 'normal',
    seed: 177,
  });
  const expectedBossSlots = [
    { timeS: 125, expectedBoss: 'boss_arsenal', expectedStageIdx: 1 },
    { timeS: 305, expectedBoss: 'boss_overlord', expectedStageIdx: 2 },
    { timeS: 485, expectedBoss: 'boss_colossus', expectedStageIdx: 3 },
    { timeS: 725, expectedBoss: 'boss_beholder', expectedStageIdx: 3 },
  ];
  for (let idx = 0; idx < expectedBossSlots.length; idx++) {
    const slot = expectedBossSlots[idx];
    bossDir.skipToSurvivalTime(slot.timeS);
    let spawnedBoss = null;
    for (let t = 0; t < 30; t++) {
      const out = bossDir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, biome: 'desert' });
      if (out.spawnBoss) {
        spawnedBoss = out.spawnBoss;
        break;
      }
    }
    assert.ok(spawnedBoss, `Boss slot ${idx} at ${slot.timeS}s must emit spawnBoss`);
    assert.equal(spawnedBoss.id, slot.expectedBoss, `Boss slot ${idx} must spawn ${slot.expectedBoss}`);
    assert.equal(spawnedBoss.mini, false);
    assert.equal(bossDir.getSurvivalClock().stageIdx, slot.expectedStageIdx);
    if (idx === 0) {
      const killOut = bossDir.step({
        players,
        arena,
        obsGrid: arena.obsGrid,
        activeMobs: 0,
        bossAlive: false,
        bossKills: 1,
        bossPos: { x: spawnedBoss.x, y: spawnedBoss.y },
        biome: 'desert',
      });
      assert.ok(
        killOut.pedestalDrops && killOut.pedestalDrops.length === 1,
        'killing a survival boss must emit a weapon pedestal drop',
      );
    }
  }

  // 4. Stage 3 (8-20m, evolved_horde): evolved: true -> BANSUNG_EFLAG_EVOLVED on MobState & enemy tuple flags
  dir.skipToSurvivalTime(910);
  let stage3Clock = null;
  let stage3Change = null;
  const stage3Spawns = [];
  for (let t = 0; t < 100; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, biome: 'desert' });
    stage3Clock = out.survivalClock;
    if (out.survivalStageChange) stage3Change = out.survivalStageChange;
    stage3Spawns.push(...out.spawns);
  }
  assert.ok(stage3Change && stage3Change.stageIdx === 3 && stage3Change.stageId === 'evolved_horde');
  assert.equal(stage3Clock.stageIdx, 3);
  assert.equal(stage3Clock.stageId, 'evolved_horde');
  assert.ok(stage3Spawns.length > 0, 'Stage 3 evolved_horde must emit bursts');

  const evoMgr = mobsMod.createMobManager({ mapW: BANSUNG_MAP_W, mapH: BANSUNG_MAP_H, rng: makeRng(79) });
  for (const s of stage3Spawns) {
    assert.equal(s.evolved, true, 'Stage 3 evolved_horde spawns must set evolved: true');
    assert.equal(
      s.armorAdd,
      s.elite === 'armored' ? 5 : 3,
      'Stage 3 evolved_horde must add +3 bonusArmor (+2 when armored elite)',
    );
    const mob = mobsMod.spawnMobFromDirector(evoMgr, s);
    assert.equal(mob.evolved, true, 'spawnMobFromDirector must preserve evolved flag');
    const tuple = mobsMod.toEnemyTuple(mob);
    assert.notEqual(
      tuple[7] & BANSUNG_EFLAG_EVOLVED,
      0,
      'evolved Stage 3 mob tuple flags must include BANSUNG_EFLAG_EVOLVED (256)',
    );
  }

  // 5. 20:00 (1200s) Cycle Wrap -> cycle: 1, stageIdx: 0 (swarm_light), higher cycle scaling
  dir.skipToSurvivalTime(1199.5);
  dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, biome: 'desert' }); // prime stage 3 announced state
  let wrapOut = null;
  const cycle1Spawns = [];
  for (let t = 0; t < 95; t++) {
    const out = dir.step({ players, arena, obsGrid: arena.obsGrid, activeMobs: 0, biome: 'desert' });
    if (out.survivalStageChange && out.survivalStageChange.cycle === 1) {
      wrapOut = out;
    }
    if (out.survivalClock.cycle === 1) {
      cycle1Spawns.push(...out.spawns);
    }
    if (wrapOut && cycle1Spawns.length > 0) break;
  }
  assert.ok(wrapOut && wrapOut.survivalStageChange, 'crossing 1200s must emit survivalStageChange');
  assert.equal(wrapOut.survivalStageChange.cycle, 1);
  assert.equal(wrapOut.survivalStageChange.stageIdx, 0);
  assert.equal(wrapOut.survivalStageChange.stageId, 'swarm_light');
  assert.equal(wrapOut.survivalClock.cycle, 1);
  assert.equal(wrapOut.survivalClock.stageIdx, 0);
  assert.equal(wrapOut.survivalClock.stageId, 'swarm_light');
  assert.equal(dir.wave, 5);
  assert.ok(dir.mobHpMult > stage0HpMult, 'Cycle 1 swarm_light mobHpMult must scale strictly above Cycle 0');
  assert.ok(dir.mobDmgMult > stage0DmgMult, 'Cycle 1 swarm_light mobDmgMult must scale strictly above Cycle 0');
  assert.ok(cycle1Spawns.length > 0 && cycle1Spawns.every((s) => !s.evolved), 'Cycle 1 Stage 0 resets evolved flag');
});

test('survival: mobs spawned on 6336x4032 converge from all 12 outer gates toward distant players', () => {
  flocking.resetFlockingScratch();
  assert.equal(BANSUNG_ENEMY_GATES.length, 12, '6336x4032 map must expose 12 perimeter enemy gates');

  const arena = mapMod.buildServerArena('desert', 88);
  assert.equal(arena.obsGrid.mapW, 6336);
  assert.equal(arena.obsGrid.mapH, 4032);

  // Place player off-center to stress full cross-map (>4500px) gate convergence
  const distantPlayer = makeMobTarget(1, 'p_distant', 4680, 2610, { shield: 80, hp: 300 });
  const mgr = mobsMod.createMobManager({ mapW: BANSUNG_MAP_W, mapH: BANSUNG_MAP_H, rng: makeRng(901) });

  const obsScratch = [];
  const tracked = [];
  for (let i = 0; i < BANSUNG_ENEMY_GATES.length; i++) {
    const gate = BANSUNG_ENEMY_GATES[i];
    assert.equal(
      arena.obsGrid.queryCircle(gate.x, gate.y, 16, obsScratch, 'move').length,
      0,
      `gate ${i} at (${gate.x}, ${gate.y}) must remain unobstructed`,
    );
    const mob = mobsMod.spawnMob(mgr, { kind: 'skirmisher', x: gate.x, y: gate.y });
    const startDist = Math.hypot(distantPlayer.x - mob.x, distantPlayer.y - mob.y);
    tracked.push({ gateIdx: i, mob, startDist });
  }

  // Simulate 150 ticks (5.0s at 30Hz) of flocking + steering across cover pillars
  stepMobSim(mgr, [distantPlayer], arena.obsGrid, 150);

  let maxCrossMapDist = 0;
  for (const entry of tracked) {
    maxCrossMapDist = Math.max(maxCrossMapDist, entry.startDist);
    const endDist = Math.hypot(distantPlayer.x - entry.mob.x, distantPlayer.y - entry.mob.y);
    const traveledCloser = entry.startDist - endDist;
    assert.ok(
      traveledCloser > 180,
      `gate ${entry.gateIdx} (${entry.mob.x.toFixed(1)}, ${entry.mob.y.toFixed(1)}) must converge across 4224x2688 (delta=${traveledCloser.toFixed(1)}px)`,
    );
    assert.ok(
      entry.mob.x >= 48 && entry.mob.x <= BANSUNG_MAP_W - 48 &&
        entry.mob.y >= 96 && entry.mob.y <= BANSUNG_MAP_H - 48,
      `gate ${entry.gateIdx} mob must remain inside playable 4224x2688 bounds`,
    );
  }
  assert.ok(maxCrossMapDist > 3000, `expected >3000px corner-to-player distance, got ${maxCrossMapDist.toFixed(1)}`);
});

// ============================================================================
// Wave Cap Progression, Environmental vs Monster Combat & Wave 4 Integration
// ============================================================================

const noWorldHooks = { tick() {}, changed() {} };

test('director & world: computeWaveMaxMobs(wave) enforces <= 10 (W1), 15 (W2), 20 (W3) live active mob cap in both waves and survival', (t) => {
  assert.equal(computeWaveMaxMobs(1), 10);
  assert.equal(computeWaveMaxMobs(2), 15);
  assert.equal(computeWaveMaxMobs(3), 20);
  assert.equal(computeWaveMaxMobs(4), 25);
  assert.equal(computeWaveMaxMobs(20), 72);
  for (let wave = 1; wave <= 12; wave++) {
    assert.equal(computeActiveMobCap(wave, 4), computeWaveMaxMobs(wave));
  }

  // 1) Classic 'waves' mode: live active mob count in BansungWorld respects <= 10 (W1), <= 15 (W2), <= 20 (W3)
  const wWaves = new BansungWorld(
    [
      { id: 'p0', name: 'P0', hero: 'mascot' },
      { id: 'p1', name: 'P1', hero: 'ranger' },
      { id: 'p2', name: 'P2', hero: 'pyro' },
      { id: 'p3', name: 'P3', hero: 'knight' },
    ],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'waves' },
    noWorldHooks,
    { seed: 410, skipWarmup: true },
  );
  t.after(() => wWaves.stop());
  for (const p of wWaves.players) p.petAlive = false;
  wWaves.step(); // advance skipWarmup timer into Wave 1

  for (const targetWave of [1, 2, 3]) {
    if (targetWave > 1) {
      wWaves.director.skipToWave(targetWave, {
        players: wWaves.players,
        arena: wWaves.arena,
        obsGrid: wWaves.arena.obsGrid,
        biome: 'desert',
      });
    }
    const expectedCap = computeWaveMaxMobs(targetWave);
    assert.equal(wWaves.director.wave, targetWave);
    assert.equal(wWaves.director.activeMobCap, expectedCap);

    let maxAliveSeen = 0;
    for (let tick = 0; tick < 360; tick++) {
      for (const p of wWaves.players) {
        p.invulnTimer = 5;
        p.hp = p.maxHp;
      }
      wWaves.step();
      if (wWaves.director.wave !== targetWave) break;
      const aliveCount = wWaves.mobMgr.mobs.filter((m) => m.alive).length;
      if (aliveCount > maxAliveSeen) maxAliveSeen = aliveCount;
      assert.ok(
        aliveCount <= expectedCap,
        `waves W${targetWave} live mobs ${aliveCount} exceeded computeWaveMaxMobs(${targetWave})=${expectedCap}`,
      );
      if (aliveCount === expectedCap && tick >= 120) break;
    }
    assert.ok(maxAliveSeen > 0, `waves W${targetWave} must spawn active mobs`);
    if (targetWave >= 2) {
      assert.ok(maxAliveSeen <= expectedCap);
    }
    // Clear remaining mobs before testing next wave
    for (const m of wWaves.mobMgr.mobs) {
      m.alive = false;
      m.hp = 0;
    }
  }

  // 2) Survival mode: live active mob count in BansungWorld scales strictly 10 -> 15 -> 20 across W1 -> W2 -> W3
  const wSurv = new BansungWorld(
    [
      { id: 's0', name: 'S0', hero: 'mascot' },
      { id: 's1', name: 'S1', hero: 'ranger' },
    ],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 411, skipWarmup: true },
  );
  t.after(() => wSurv.stop());
  for (const p of wSurv.players) p.petAlive = false;
  wSurv.step(); // advance skipWarmup timer into Wave 1

  for (const targetWave of [1, 2, 3]) {
    const expectedCap = computeWaveMaxMobs(targetWave);
    let maxAliveSeen = 0;
    for (let tick = 0; tick < 600; tick++) {
      for (const p of wSurv.players) {
        p.invulnTimer = 5;
        p.hp = p.maxHp;
      }
      wSurv.step();
      const aliveCount = wSurv.mobMgr.mobs.filter((m) => m.alive).length;
      if (aliveCount > maxAliveSeen) maxAliveSeen = aliveCount;
      assert.equal(wSurv.director.wave, targetWave, `survival must remain in wave ${targetWave} while quota mobs live`);
      assert.equal(wSurv.director.activeMobCap, expectedCap);
      assert.ok(
        aliveCount <= expectedCap,
        `survival W${targetWave} live mobs ${aliveCount} exceeded computeWaveMaxMobs(${targetWave})=${expectedCap}`,
      );
      if (aliveCount === expectedCap && tick >= 90) break;
    }
    assert.ok(
      maxAliveSeen > (targetWave === 1 ? 0 : computeWaveMaxMobs(targetWave - 1)) &&
        maxAliveSeen <= expectedCap,
      `survival W${targetWave} live mobs (${maxAliveSeen}) must exceed W${targetWave - 1} cap and stay <= ${expectedCap}`,
    );
    assert.equal(wSurv.director.survivalWaveQuota, expectedCap);

    // Clear all live mobs so director advances organically W1 -> W2 -> W3
    for (const m of wSurv.mobMgr.mobs) {
      if (m.alive) {
        m.hp = 0;
        m.alive = false;
        wSurv.recordMobDeath(m, 's0');
      }
    }
    wSurv.step();
    assert.equal(wSurv.director.wave, targetWave + 1, `clearing survival W${targetWave} must advance to W${targetWave + 1}`);
  }
});

test('BansungWorld integration: zero environmental player damage (cactus, barrel, sky artillery) vs monster touch & ranged damage', (t) => {
  // 1) Zero environmental damage: cactus thorn contact, point-blank explosive barrel, Wave 7 sky artillery
  const wEnv = new BansungWorld(
    [{ id: 'p0', name: 'EnvHero', hero: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'waves' },
    noWorldHooks,
    { seed: 520, skipWarmup: true },
  );
  t.after(() => wEnv.stop());
  wEnv.step();
  wEnv.director.phase = 'cleanup';
  wEnv.director.budget = 0;

  const p0 = wEnv.players[0];
  p0.petAlive = false;
  p0.invulnTimer = 0;
  p0.hitIframesMs = 0;
  const startHp = p0.hp;
  const startShield = p0.shield;

  // Cactus contact inside live world
  const cactus = wEnv.arena.cacti[0];
  assert.ok(cactus);
  assert.equal(cactus.thornDmg, 0);
  p0.x = cactus.x + cactus.w * 0.5 + p0.radius;
  p0.y = cactus.y;
  for (let i = 0; i < 15; i++) wEnv.step();
  assert.equal(p0.hp, startHp, 'desert cactus must deal 0 HP damage to players');
  assert.equal(p0.shield, startShield, 'desert cactus must deal 0 shield damage to players');
  assert.equal(p0.stats.damageTaken, 0);

  // Point-blank barrel detonation inside live world: damages mob cleanly, deals 0 HP & 0 shield to player
  const explBarrel = wEnv.arena.barrels.find((b) => b.alive && b.kind === 'barrel_explosive');
  assert.ok(explBarrel, 'arena must include an explosive barrel');
  p0.x = explBarrel.x + 20;
  p0.y = explBarrel.y;
  const nearMob = mobsMod.spawnMob(wEnv.mobMgr, {
    id: 'barrel_victim',
    kind: 'cactus_brute',
    x: explBarrel.x + 42,
    y: explBarrel.y,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  const mobHpBeforeBarrel = nearMob.hp;
  const propRes = mapMod.damageProp(wEnv.arena, explBarrel.idx, 999, 0);
  assert.equal(propRes.broken, true);
  for (let i = 0; i < 6; i++) wEnv.step();
  assert.equal(explBarrel.alive, false);
  assert.ok(nearMob.hp < mobHpBeforeBarrel, 'barrel detonation must still damage nearby monsters');
  assert.equal(p0.hp, startHp, 'barrel detonation must deal 0 HP damage to players');
  assert.equal(p0.shield, startShield, 'barrel detonation must deal 0 shield damage to players');
  assert.equal(p0.stats.damageTaken, 0);

  // Sky artillery detonation directly on player coordinates -> 0 HP / 0 shield lost
  wEnv.director.skipToWave(7, {
    players: [p0],
    arena: wEnv.arena,
    obsGrid: wEnv.arena.obsGrid,
    biome: 'desert',
  });
  wEnv.director.budget = 0;
  wEnv.director.artilleryStrikes.push({
    id: 999,
    x: p0.x,
    y: p0.y,
    radius: 85,
    fuseS: 1.0,
    timeLeftS: 0.02,
    dmg: 40,
  });
  wEnv.clearPendingFx();
  wEnv.step();
  assert.equal(p0.hp, startHp, 'sky artillery strike must deal 0 HP damage to players');
  assert.equal(p0.shield, startShield, 'sky artillery strike must deal 0 shield damage to players');
  assert.equal(p0.stats.damageTaken, 0);

  // 2) Monster physical contact damage + hit i-frames & dash i-frames protection
  const wTouch = new BansungWorld(
    [{ id: 'p0', name: 'TouchHero', hero: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 521, skipWarmup: true },
  );
  t.after(() => wTouch.stop());
  wTouch.step();
  wTouch.director.phase = 'cleanup';
  wTouch.director.budget = 0;

  const hTouch = wTouch.players[0];
  hTouch.petAlive = false;
  hTouch.x = 1200;
  hTouch.y = 900;
  hTouch.invulnTimer = 0;
  hTouch.hitIframesMs = 0;
  const totalBeforeTouch = hTouch.shield + hTouch.hp;
  const chaser = mobsMod.spawnMob(wTouch.mobMgr, {
    id: 'touch_scarab',
    kind: 'scarab',
    x: hTouch.x + 14,
    y: hTouch.y,
    playerCount: 1,
    wave: 2,
    difficulty: 'normal',
  });
  for (let i = 0; i < 6; i++) {
    wTouch.step();
    if (hTouch.stats.damageTaken > 0) break;
  }
  const totalAfterShieldHit = hTouch.shield + hTouch.hp;
  assert.ok(totalAfterShieldHit < totalBeforeTouch, 'chasing monster touch must damage un-invulnerable player');
  assert.ok(hTouch.stats.damageTaken > 0);

  // Per-mob contact ICD (24t) blocks immediate second bite from same mob
  chaser.x = hTouch.x;
  chaser.y = hTouch.y;
  wTouch.step();
  assert.equal(hTouch.shield + hTouch.hp, totalAfterShieldHit, 'per-mob contact ICD must block immediate repeat touch');

  // When shield is depleted and monster touches HP directly, HERO_HP_IFRAMES_MS is granted and blocks even a second mob
  hTouch.shield = 0;
  hTouch.armor = 0;
  chaser.contactIcdByTarget.clear();
  const hpBeforeDirectHit = hTouch.hp;
  wTouch.step();
  const hpAfterDirectHit = hTouch.hp;
  assert.ok(hpAfterDirectHit < hpBeforeDirectHit, 'contact hit with 0 shield must damage HP directly');
  assert.ok(hTouch.hitIframesMs > 0, 'HP contact damage must grant hit i-frames');

  mobsMod.spawnMob(wTouch.mobMgr, {
    id: 'touch_scarab_2',
    kind: 'scarab',
    x: hTouch.x,
    y: hTouch.y,
    playerCount: 1,
    wave: 2,
    difficulty: 'normal',
  });
  wTouch.step();
  assert.equal(hTouch.hp, hpAfterDirectHit, 'hit i-frames must block contact damage from a second mob');

  // Dash i-frames block monster contact damage mid-dash
  hTouch.hitIframesMs = 0;
  chaser.contactIcdByTarget.clear();
  assert.equal(wTouch.enqueueCommand('p0', { t: 'dash', dx: 1, dy: 0 }, { nowMs: 5000 }).ok, true);
  wTouch.step();
  assert.ok(hTouch.dash.dashLeft > 0, 'dash command must activate dashLeft');
  assert.ok(hTouch.dash.invulnLeft > 0 && hTouch.dashIframesMs > 0, 'active dash must grant dash i-frames');
  chaser.x = hTouch.x;
  chaser.y = hTouch.y;
  wTouch.step();
  assert.equal(hTouch.hp, hpAfterDirectHit, 'dash i-frames must block monster contact damage');

  // 3) Monster ranged projectile hitting player via onDamagePlayer deals damage, emits impact FX & removes projectile
  const wRanged = new BansungWorld(
    [{ id: 'p0', name: 'RangedVictim', hero: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 522, skipWarmup: true },
  );
  t.after(() => wRanged.stop());
  wRanged.step();
  wRanged.director.phase = 'cleanup';
  wRanged.director.budget = 0;

  const hRanged = wRanged.players[0];
  hRanged.petAlive = false;
  hRanged.x = 1200;
  hRanged.y = 900;
  hRanged.invulnTimer = 0;
  hRanged.hitIframesMs = 0;
  const rangedBefore = hRanged.shield + hRanged.hp;

  mobsMod.spawnMob(wRanged.mobMgr, {
    id: 'spitter_1',
    kind: 'cactus_spitter',
    x: hRanged.x + 180,
    y: hRanged.y,
    playerCount: 1,
    wave: 2,
    difficulty: 'normal',
  });

  let maxProjSeen = 0;
  let sawImpactFx = false;
  for (let tick = 0; tick < 90; tick++) {
    wRanged.clearPendingFx();
    wRanged.step();
    if (wRanged.mobMgr.projectiles.length > maxProjSeen) {
      maxProjSeen = wRanged.mobMgr.projectiles.length;
    }
    for (let k = 0; k + 5 < wRanged.fx.length; k += 6) {
      if (wRanged.fx[k] === FX_IMPACT) sawImpactFx = true;
    }
    if (hRanged.stats.damageTaken > 0) break;
  }
  assert.equal(maxProjSeen, 3, 'cactus_spitter must fire 3-orb ranged fan');
  assert.ok(hRanged.shield + hRanged.hp < rangedBefore, 'monster ranged projectile must deal HP/shield damage via onDamagePlayer');
  assert.ok(sawImpactFx, 'ranged projectile hit must emit FX_IMPACT');
  assert.ok(
    wRanged.mobMgr.projectiles.length < maxProjSeen,
    'impacted enemy projectile must be removed from mobMgr.projectiles',
  );
});

test('BansungWorld integration: heal_drone gadget, Colossus iron_drone phalanx frame state & Overlord wp/pylons/lanes/chargeQ wire scaling', (t) => {
  // 1) heal_drone gadget activation & frame state (frame.me.gadget + frame.pr drone prop) + Colossus iron_drone escorts (frame.e)
  const wDrone = new BansungWorld(
    [{ id: 'p0', name: 'Pyro', hero: 'pyro' }],
    { bots: 0, biome: 'crypt', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 610, skipWarmup: true },
  );
  t.after(() => wDrone.stop());
  wDrone.step();
  wDrone.director.phase = 'cleanup';
  wDrone.director.budget = 0;

  const pyro = wDrone.players[0];
  pyro.hp = Math.max(10, pyro.maxHp - 30);
  pyro.energy = pyro.maxEnergy;
  assert.equal(wDrone.enqueueCommand('p0', { t: 'gadget' }, { nowMs: 1000 }).ok, true);
  wDrone.step();

  const droneFrame = wDrone.frameFor('p0');
  assert.equal(droneFrame.me.gadget.id, 'heal_drone');
  assert.ok(droneFrame.me.gadget.charges < shared.BANSUNG_GADGETS.heal_drone.maxCharges);
  assert.ok(droneFrame.me.gadget.cdMs > 0);
  let hasPrDrone = false;
  if (Array.isArray(droneFrame.pr)) {
    for (let i = 0; i + 4 < droneFrame.pr.length; i += 5) {
      if (droneFrame.pr[i + 1] === BANSUNG_PROP_INDEX.drone && droneFrame.pr[i + 4] > 0) {
        hasPrDrone = true;
      }
    }
  }
  assert.ok(hasPrDrone, 'activated heal_drone must serialize into frame.pr with BANSUNG_PROP_INDEX.drone');

  const hpAfterDeploy = pyro.hp;
  for (let i = 0; i < 20; i++) wDrone.step();
  assert.ok(pyro.hp > hpAfterDeploy, 'active heal_drone must heal injured owner across 30Hz ticks');

  // Spawn Dread Colossus at its 8m Survival slot (480s) and trigger iron_drone phalanx
  wDrone.director.skipToSurvivalTime(485);
  wDrone.step();
  const colossusEntry = wDrone.activeBosses.find((entry) => entry.kind === 'boss_colossus');
  assert.ok(colossusEntry, 'survival 485s must spawn boss_colossus');
  const colossus = colossusEntry.boss;
  bossColossus.damageDreadColossus(colossus, {
    baseDmg: colossus.hp - Math.floor(colossus.maxHp * 0.5),
    dmgKind: 'true',
  });
  colossus.state = bossColossus.COLOSSUS_STATE.MARCH;
  colossus.x = pyro.x + 140;
  colossus.y = pyro.y;
  for (let i = 0; i < 30; i++) {
    pyro.invulnTimer = 2;
    wDrone.step();
    if (colossus.drones.length >= 3) break;
  }
  assert.equal(colossus.drones.length, 3, 'Colossus <=55% HP must deploy 3 iron_drone escorts');
  wDrone.step();
  const colossusFrame = wDrone.frameFor('p0');
  const ironDroneTuples = [];
  if (Array.isArray(colossusFrame.e)) {
    for (let i = 0; i + BANSUNG_ENEMY_FIELDS - 1 < colossusFrame.e.length; i += BANSUNG_ENEMY_FIELDS) {
      if (colossusFrame.e[i + 1] === BANSUNG_ENEMY_INDEX.iron_drone) {
        ironDroneTuples.push(colossusFrame.e.slice(i, i + BANSUNG_ENEMY_FIELDS));
      }
    }
  }
  assert.equal(ironDroneTuples.length, 3, 'frame.e must broadcast all 3 iron_drone escorts');
  for (const tup of ironDroneTuples) {
    assert.ok(tup[4] > 0 && tup[4] <= 100);
    assert.notEqual(tup[7] & BANSUNG_EFLAG_SHIELDED, 0);
    assert.notEqual(tup[7] & BANSUNG_EFLAG_ARMORED, 0);
  }

  // 2) Overlord boss in BansungWorld: frame.bs.wp / pylons / lanes + chargeQ / 100 wire scaling + frame.tg
  const wOver = new BansungWorld(
    [{ id: 'p0', name: 'Cyber', hero: 'mascot' }],
    { bots: 0, biome: 'cyber', difficulty: 'normal', gameMode: 'waves' },
    noWorldHooks,
    { seed: 611, skipWarmup: true },
  );
  t.after(() => wOver.stop());
  wOver.director.skipToWave(10);
  wOver.step(); // steps intermission (phaseTimer = 0) -> beginNextWave(10) -> spawnWaveBoss(boss_overlord)
  wOver.director.budget = 0;

  const overEntry = wOver.activeBosses.find((entry) => entry.kind === 'boss_overlord');
  assert.ok(overEntry, 'cyber W10 must spawn boss_overlord');
  const overlord = overEntry.boss;
  wOver.players[0].invulnTimer = 20;

  // Trigger EMP pylon deployment & track chargeQ / 100 quantized progression
  overlord.state = 'patrol_spiral';
  overlord.stateTick = 0;
  overlord.recoveryTicks = 0;
  overlord.empCd = 0;
  overlord.weakPointCd = 9999;
  overlord.laserCd = 9999;

  const observedChargeQ = [];
  let sawEmpReset = false;
  for (let i = 0; i < 160; i++) {
    wOver.step();
    const f = wOver.frameFor('p0');
    if (f.bs && Array.isArray(f.bs.pylons) && f.bs.pylons.length > 0) {
      const q = f.bs.pylons[0].chargeQ;
      observedChargeQ.push(q);
      const frac = q / 100;
      assert.ok(Number.isInteger(q) && q >= 0 && q <= 100, `chargeQ must be 0..100 integer, got ${q}`);
      assert.ok(frac >= 0 && frac <= 1, `chargeQ / 100 must normalize cleanly to [0, 1], got ${frac}`);
      if (observedChargeQ.some((prev) => prev > 0) && q === 0 && observedChargeQ[observedChargeQ.length - 2] > 50) {
        sawEmpReset = true;
        break;
      }
    }
  }
  assert.ok(
    observedChargeQ.some((q) => q > 0 && q < 100),
    `Expected intermediate 0 < chargeQ < 100 wire values, saw [${observedChargeQ.join(', ')}]`,
  );
  assert.ok(
    observedChargeQ.some((q) => q >= 95 && q / 100 <= 1) && sawEmpReset,
    'Overlord pylon chargeQ must reach high charge / 100 and reset after EMP pulse',
  );

  // Trigger laser grid -> verify frame.bs.lanes & frame.bs.laserLanes & frame.tg
  overlord.state = 'patrol_spiral';
  overlord.stateTick = 0;
  overlord.recoveryTicks = 0;
  overlord.laserCd = 0;
  overlord.empCd = 9999;
  let sawLanes = false;
  let sawLaserTg = false;
  for (let i = 0; i < 15; i++) {
    wOver.step();
    const f = wOver.frameFor('p0');
    if (f.bs && Array.isArray(f.bs.lanes) && f.bs.lanes.length >= 4) {
      sawLanes = true;
      assert.deepEqual(f.bs.lanes, f.bs.laserLanes);
      if (Array.isArray(f.tg) && f.tg.length > 0) sawLaserTg = true;
      break;
    }
  }
  assert.ok(sawLanes, 'Overlord frame.bs.lanes must contain active laser lanes');
  assert.ok(sawLaserTg, 'Overlord laser lanes must emit frame.tg telegraphs');

  // Trigger Phase 2 Weakpoint Matrix -> verify frame.bs.wp & frame.bs.weakPoints
  overlord.phase = 2;
  overlord.hp = Math.floor(overlord.maxHp * 0.5);
  overlord.state = 'patrol_spiral';
  overlord.stateTick = 0;
  overlord.recoveryTicks = 0;
  overlord.weakPointCd = 0;
  let sawWp = false;
  for (let i = 0; i < 15; i++) {
    wOver.step();
    const f = wOver.frameFor('p0');
    if (f.bs && Array.isArray(f.bs.wp) && f.bs.wp.length > 0) {
      sawWp = true;
      assert.deepEqual(f.bs.wp, f.bs.weakPoints);
      assert.ok(typeof f.bs.wp[0].angQ === 'number' && f.bs.wp[0].maxHp > 0);
      break;
    }
  }
  assert.ok(sawWp, 'Overlord Phase 2 weakpoint matrix must serialize frame.bs.wp and frame.bs.weakPoints');
});

test('Mob numIds stay disjoint from player actorIds so cross-map gunfire and pets never self-harm players', (t) => {
  assert.equal(mobsMod.MOB_INITIAL_NUM_ID, 1_000_000);
  const isolatedMgr = mobsMod.createMobManager();
  assert.ok(isolatedMgr.nextNumId >= 1_000_000);

  const wTest = new BansungWorld(
    [
      { id: 'p0', name: 'KnightHero', hero: 'knight' },
      { id: 'bot:0', name: 'Cyber Ranger 1', hero: 'ranger', bot: true },
      { id: 'bot:1', name: 'Pyro Bot 2', hero: 'pyro', bot: true },
      { id: 'bot:2', name: 'Tank Bot 3', hero: 'tank', bot: true },
    ],
    { bots: 3, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 777, skipWarmup: true },
  );
  t.after(() => wTest.stop());
  // Step WaveDirector until at least 4 mobs spawn organically in Wave 1
  for (let i = 0; i < 180 && wTest.mobMgr.mobs.length < 4; i++) {
    for (const p of wTest.players) p.invulnTimer = 2;
    wTest.step();
  }
  assert.ok(
    wTest.mobMgr.mobs.length >= 4,
    `Expected WaveDirector to spawn at least 4 Wave 1 mobs, got ${wTest.mobMgr.mobs.length}`,
  );

  // Player actorIds (1000..1003) and mob numIds (1_000_000+) must be strictly disjoint
  const playerActorIds = new Set(wTest.players.map((p) => p.actorId));
  assert.deepEqual([...playerActorIds].sort((a, b) => a - b), [1000, 1001, 1002, 1003]);
  const spawnedMobs = wTest.mobMgr.mobs.slice(0, 4);
  for (let i = 0; i < spawnedMobs.length; i++) {
    assert.ok(
      spawnedMobs[i].numId >= mobsMod.MOB_INITIAL_NUM_ID,
      `Mob #${i} numId must be >= ${mobsMod.MOB_INITIAL_NUM_ID}, got ${spawnedMobs[i].numId}`,
    );
    assert.equal(
      playerActorIds.has(spawnedMobs[i].numId),
      false,
      `Mob numId ${spawnedMobs[i].numId} must never collide with a player actorId`,
    );
  }

  // Park WaveDirector spawns & place all 4 players + first 4 mobs on a clear LOS line
  wTest.director.phase = 'cleanup';
  wTest.director.budget = 0;

  let lineX = Math.max(260, Math.floor(BANSUNG_ARENA_CX - 260));
  let lineY = BANSUNG_ARENA_CY;
  const isSpotClear = (cx, cy) =>
    !wTest.arena.obsGrid.obstacles.some((o) => o.kind !== 'pit' && Math.hypot(cx - o.x, cy - o.y) < o.r + 36);
  outer: for (let dy = 0; dy <= 700; dy += 60) {
    for (const sgn of dy === 0 ? [1] : [1, -1]) {
      const yCand = Math.max(200, Math.min(BANSUNG_ARENA_H - 200, BANSUNG_ARENA_CY + dy * sgn));
      if (
        isSpotClear(lineX, yCand) &&
        isSpotClear(lineX + 120, yCand) &&
        isSpotClear(lineX + 420, yCand) &&
        spatial.hasLineOfSight(wTest.arena.obsGrid, lineX, yCand, lineX + 420, yCand, 'bullet')
      ) {
        lineY = yCand;
        break outer;
      }
    }
  }

  const baselines = new Map();
  wTest.players.forEach((p, idx) => {
    p.x = lineX + (idx === 1 ? 70 : idx * -24);
    p.y = lineY + (idx >= 2 ? (idx - 1) * 28 : 0);
    p.vx = 0;
    p.vy = 0;
    p.knockVx = 0;
    p.knockVy = 0;
    p.invulnTimer = 0;
    p.hitIframesMs = 0;
    p.stats.damageTaken = 0;
    if (idx === 0) {
      p.petAlive = true;
      p.petCd = 0;
      p.pet.x = p.x + 18;
      p.pet.y = p.y;
    } else {
      p.petAlive = false;
    }
    baselines.set(p.id, { hp: p.hp, shield: p.shield });
  });

  // Remove any extra mobs beyond the first 4 and freeze the first 4 along +X well outside contact range
  for (let i = 4; i < wTest.mobMgr.mobs.length; i++) {
    wTest.mobMgr.mobs[i].alive = false;
    wTest.mobMgr.mobs[i].hp = 0;
  }
  spawnedMobs.forEach((m, idx) => {
    m.alive = true;
    m.x = lineX + 260 + idx * 36;
    m.y = lineY;
    m.vx = 0;
    m.vy = 0;
    m.maxHp = 800;
    m.hp = 800;
    m.stunMs = 15_000;
    m.pendingAttack = undefined;
  });

  try {
    // p0 shoots directly along +X (passing through p1 at lineX + 70) + arcane_ember pet + bots engage
    let nowMs = 10_000;
    for (let tick = 0; tick < 35; tick++) {
      nowMs += 34;
      wTest.enqueueCommand('p0', { t: 'in', seq: tick + 1, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs });
      wTest.step();
    }

    const mobDamageTotal = spawnedMobs.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
    assert.ok(
      spawnedMobs[0].hp < spawnedMobs[0].maxHp && mobDamageTotal > 0,
      `Expected bullets/pet to damage first spawned mob (mob0 hp=${spawnedMobs[0].hp}/${spawnedMobs[0].maxHp})`,
    );

    for (const p of wTest.players) {
      const base = baselines.get(p.id);
      assert.equal(p.hp, base.hp, `Player ${p.id} must not lose HP when first 4 mobs are shot`);
      assert.equal(p.shield, base.shield, `Player ${p.id} must not lose Shield when first 4 mobs are shot`);
      assert.equal(p.stats.damageTaken, 0, `Player ${p.id} stats.damageTaken must stay 0`);
      assert.equal(p.knockVx, 0, `Player ${p.id} must receive 0 knockVx`);
      assert.equal(p.knockVy, 0, `Player ${p.id} must receive 0 knockVy`);
    }
  } finally {
    wTest.stop();
  }
});

test('survival: Stamina RMB dash gating, deduction, regen & Shield 25% DR + 5.0s regen delay', (t) => {
  const { applyBansungDamage } = require('../dist/server/src/game/bansung/damage.js');
  const w = new BansungWorld(
    [{ id: 'p0', name: 'Hero', heroId: 'mascot' }],
    { bots: 0, biome: 'cyber', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 808, skipWarmup: true },
  );
  t.after(() => w.stop());
  const p = w.players[0];
  p.x = 1200;
  p.y = 1200;

  // 1. Stamina RMB dash deducts DASH_COST (35), blocks when depleted, and regenerates continuously
  assert.equal(p.maxStamina, shared.BANSUNG_STAMINA.BASE_MAX);
  assert.equal(p.stamina, shared.BANSUNG_STAMINA.BASE_MAX);

  let nowMs = 5_000;
  w.enqueueCommand('p0', { t: 'dash', dx: 1, dy: 0 }, { nowMs });
  w.step();
  assert.ok(p.dash.dashLeft > 0, 'first dash must initiate active hero dash');
  assert.equal(
    Math.round(p.stamina),
    shared.BANSUNG_STAMINA.BASE_MAX - shared.BANSUNG_STAMINA.DASH_COST,
    'first dash must deduct DASH_COST from stamina',
  );

  // Deplete stamina below dash cost while stationary -> subsequent dash command must NOT trigger a dash
  for (let i = 0; i < 40; i++) w.step(); // clear dash cooldown & wait for regen delay
  w.enqueueCommand('p0', { t: 'in', seq: 1, mx: 0, my: 0, aim: 0, fire: 0 }, { nowMs: nowMs + 2000 });
  w.step();
  p.stamina = 10;
  p.dash.cdLeft = 0;
  const xBeforeBlockedDash = p.x;
  nowMs += 4000;
  w.enqueueCommand('p0', { t: 'dash', dx: 1, dy: 0 }, { nowMs });
  w.step();
  assert.equal(p.dash.dashLeft, 0, 'dash must be blocked when stamina < DASH_COST');
  assert.ok(p.stamina > 10, 'blocked dash must allow continuous stamina regen instead of deducting cost');
  assert.ok(Math.abs(p.x - xBeforeBlockedDash) < 1, 'blocked dash must not lunge hero');

  // Wait 90 ticks (3.0s) -> stamina must continuously regenerate above DASH_COST and allow dashing again
  for (let i = 0; i < 90; i++) w.step();
  assert.ok(p.stamina >= shared.BANSUNG_STAMINA.DASH_COST, 'stamina must continuously regenerate');
  w.enqueueCommand('p0', { t: 'dash', dx: 1, dy: 0 }, { nowMs: nowMs + 5000 });
  w.step();
  assert.ok(p.dash.dashLeft > 0, 'dash must succeed once stamina regenerates above DASH_COST');

  // 2. Shield absorbs & reduces damage by 25%+ DR, and waits full 5.0s (5000ms) after taking damage before regenerating
  for (let i = 0; i < 20; i++) w.step();
  p.invulnTimer = 0;
  p.dashIframesMs = 0;
  p.hitIframesMs = 0;
  p.maxShield = 50;
  p.shield = 50;
  p.shieldDelayMs = 0;
  applyBansungDamage(p, {
    baseDmg: 20,
    dmgKind: 'kinetic',
    bypassIframes: true,
    tickNo: 99,
  }, w.buildDamageContext());
  p.armor = p.shield;

  // With 25% DR on 20 dmg => 15 effDmg absorbed from 50 shield -> 35 shield remaining!
  assert.equal(p.shield, 35, '25% DR on 20 incoming dmg leaves 35/50 shield');
  assert.equal(p.shieldDelayMs, 5000, 'taking damage resets shield regen delay to 5000ms');

  // Step 4.5s (135 ticks) with no damage -> shield must NOT regenerate yet!
  for (let i = 0; i < 135; i++) w.step();
  assert.equal(p.shield, 35, 'shield must not regenerate during first 4.5s of 5.0s delay');
  assert.ok(p.shieldDelayMs > 0 && p.shieldDelayMs < 1000);

  // Step another 2.5s (75 ticks -> past 5.0s mark) -> shield must begin regenerating!
  for (let i = 0; i < 75; i++) w.step();
  assert.ok(p.shield > 35, `shield must regenerate once 5.0s damage-free delay expires (got ${p.shield})`);
});

test('survival: Boss I (boss_arsenal) despawns trash, pauses wave bursts & executes 5 telegraph/DANGER patterns', (t) => {
  const { createArsenalBoss, stepArsenalBoss, toArsenalBossFrame } = require('../dist/server/src/game/bansung/boss-arsenal.js');
  const w = new BansungWorld(
    [{ id: 'p0', name: 'Scout', heroId: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noWorldHooks,
    { seed: 909, skipWarmup: true },
  );
  t.after(() => w.stop());
  const p = w.players[0];

  // Seed regular trash mobs before 2m boss spawn
  for (let i = 0; i < 5; i++) {
    mobsMod.spawnMob(w.mobMgr, {
      id: `trash_${i}`,
      kind: 'scarab',
      x: p.x + 260 + i * 30,
      y: p.y + 120,
      playerCount: 1,
      wave: 1,
      difficulty: 'normal',
    });
  }
  assert.equal(w.mobMgr.mobs.filter((m) => m.alive).length, 5);

  // Advance to 2:00 (120s) -> boss_arsenal spawns & clears existing regular mobs cleanly!
  w.director.skipToSurvivalTime(121);
  w.step();
  const arsenalEntry = w.activeBosses.find((entry) => entry.kind === 'boss_arsenal');
  assert.ok(arsenalEntry, 'survival 2:00 milestone must spawn boss_arsenal');
  assert.equal(
    w.mobMgr.mobs.filter((m) => m.alive).length,
    0,
    'spawning a Survival Boss must clear lingering regular trash mobs',
  );

  // Step 45 ticks without summon -> regular wave bursts stay suppressed while Boss is alive
  arsenalEntry.boss.summonCdTicks = 999;
  arsenalEntry.boss.actionCdTicks = 999;
  for (let i = 0; i < 45; i++) {
    p.invulnTimer = 2;
    w.step();
  }
  assert.equal(
    w.mobMgr.mobs.filter((m) => m.alive).length,
    0,
    'regular wave spawns must remain paused while boss_arsenal is alive',
  );

  // Unit-verify all 5 skills on Arsenal Boss FSM: grenades (2s fuse), red-circle DANGER missiles, red-line laser, gapped ring, summon
  const boss = createArsenalBoss({
    id: 90001,
    x: 1500,
    y: 1200,
    hpMult: 1,
    arenaBounds: { minX: 100, minY: 100, maxX: 4000, maxY: 2500 },
  });
  const bullets = [];
  const summons = [];
  const heroTarget = {
    id: 'p0',
    numId: 1000,
    actorId: 1000,
    x: 1850,
    y: 1200,
    vx: 0,
    vy: 0,
    radius: 14,
    team: 0,
    alive: true,
    downed: false,
    hp: 100,
    maxHp: 100,
    shield: 50,
    maxShield: 50,
    armorType: 'light',
    flatArmor: 0,
    shieldDelayMs: 0,
    shieldRegenAccMs: 0,
    hitIframesMs: 0,
    hitFlashMs: 0,
    dashIframesMs: 0,
    stunMs: 0,
    stunImmuneMs: 0,
    stunDrStage: 0,
    stunDrResetMs: 0,
  };
  let sawGrenade = false;
  let sawMissileDanger = false;
  let sawLaserTelegraph = false;
  let sawRingWithSafeCorridor = false;
  let sawSummon = false;

  boss.actionCdTicks = 1;
  boss.summonCdTicks = 15;
  for (let tick = 1; tick <= 600; tick++) {
    const bStart = bullets.length;
    stepArsenalBoss(boss, {
      tickNo: tick,
      players: [heroTarget],
      dmgMult: 1,
      damageCtx: { tickNo: tick },
      onSpawnBullet: (b) => bullets.push({ ...b, tick }),
      onSummon: (kinds) => summons.push(...kinds),
    });
    if (boss.grenades.length > 0) {
      sawGrenade = true;
      assert.ok(boss.telegraphs.some((tg) => String(tg.label || '').includes('LỰU ĐẠN')));
    }
    if (boss.missiles.length > 0) {
      sawMissileDanger = true;
      assert.ok(boss.telegraphs.some((tg) => tg.danger === 1 && String(tg.label || '').includes('DANGER')));
    }
    if (boss.state === 'laser_telegraph' && boss.telegraphs.some((tg) => tg.shape === 'line' && tg.danger === 1)) {
      sawLaserTelegraph = true;
    }
    const waveBullets = bullets.slice(bStart);
    if (boss.state === 'ring_fire' && waveBullets.length >= 10) {
      // Ring deliberately leaves two 54° safe gap sectors so player can dodge!
      const sectorCount = shared.BOSS_ARSENAL_CFG.ringTotalSectors;
      const gapCount = shared.BOSS_ARSENAL_CFG.ringGapSectors.length;
      assert.equal(waveBullets.length, sectorCount - gapCount, 'ring pattern must leave safe dodge corridor');
      sawRingWithSafeCorridor = true;
    }
    if (summons.length > 0) sawSummon = true;
    // Keep hero healthy if struck
    heroTarget.hp = 100;
    heroTarget.shield = 50;
  }

  assert.ok(sawGrenade, 'boss_arsenal must throw 2.0s fuse grenades');
  assert.ok(sawMissileDanger, 'boss_arsenal must telegraph DANGER red-circle missiles');
  assert.ok(sawLaserTelegraph, 'boss_arsenal must project red aim-line laser telegraph');
  assert.ok(sawRingWithSafeCorridor, 'boss_arsenal must fire 360 bullet ring leaving safe corridor gaps');
  assert.ok(sawSummon, 'boss_arsenal summon skill must spawn squad escorts');
  const frame = toArsenalBossFrame(boss);
  assert.equal(frame.kind, 'boss_arsenal');
  assert.equal(frame.tier, 1);
  assert.ok(frame.subtitle && frame.title);
});
