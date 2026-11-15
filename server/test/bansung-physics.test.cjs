'use strict';

// Bắn Súng Co-op (Soul & Steel) — Physics, Arena, Props & Combat Unit Suites (T01-T04):
// Kiểm tra Arena/SpatialHash chống xuyên tường (zero tunneling), trượt AABB + thoát kẹt,
// Amanatides-Woo DDA & che khuất AoE LOS, chuỗi nổ thùng phi + hồi sinh vật cản,
// khắc chế Giáp Nhẹ/Nặng Miragine, giáp Soul Knight, giảm dần choáng (Stun DR) & 4 loại DOT.
const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const spatial = require('../dist/server/src/game/bansung/spatial.js');
const mapMod = require('../dist/server/src/game/bansung/map.js');
const damage = require('../dist/server/src/game/bansung/damage.js');

const {
  GAME_MODES,
  BANSUNG_MODE_ID,
  BANSUNG_BIOMES,
  BANSUNG_GAME_MODES,
  BANSUNG_MAP_W,
  BANSUNG_MAP_H,
  BANSUNG_ARENA_W,
  BANSUNG_ARENA_H,
  BANSUNG_ARENA_CX,
  BANSUNG_ARENA_CY,
  BANSUNG_PLAYABLE_BOUNDS,
  BANSUNG_MAX_BOTS,
  BANSUNG_MAX_PLAYERS,
  BANSUNG_PICKUP_IDS,
  BANSUNG_PLAYER_FIELDS,
  BANSUNG_EFLAG_EVOLVED,
  BANSUNG_DMG_CRIT,
  BANSUNG_DMG_ARMOR,
  BANSUNG_DMG_STUN,
  BANSUNG_DMG_BURN,
  BANSUNG_DMG_SHOCK,
  BANSUNG_STATUS_CRATE,
  BANSUNG_FX_FIELDS,
  FX_BLAST,
  FX_DMG,
  FX_STATUS,
  normalizeBansungConfig,
  resolveBansungGameMode,
  quantizeAim,
  dequantizeAim,
  generateArenaLayout,
} = S;

const {
  GRID_CELL,
  MAX_MOVE_SUBSTEP_PX,
  MAX_BOUNCES_PER_TICK,
  AOE_MIN_FALLOFF,
  LAYER_PLAYER,
  LAYER_ENEMY,
  LAYER_PET,
  ActorGrid,
  ObstacleGrid,
  mergeCollinearWalls,
  resolveObstacles,
  moveCircleWithSlide,
  raycastObstacles,
  hasLineOfSight,
  checkMuzzleWallGuard,
  sweepCircleSegment,
  stepSweptBullet,
  queryAoeTargets,
  queryAoeObstacles,
  distCircleToAabbSq,
} = spatial;

const {
  BARREL_CHAIN_DELAY_TICKS,
  BARREL_MAX_CHAIN_DEPTH,
  BARREL_PLAYER_SHIELD_CHIP,
  BARREL_KNOCKBACK_PLAYER,
  BARREL_BLAST_KIND_EXPLOSIVE,
  BARREL_BLAST_KIND_EMP,
  CACTUS_THORN_KNOCKBACK,
  PROP_HIT_FLASH_MS,
  PROP_RESPAWN_CLEAR_PAD_PX,
  buildServerArena,
  damageProp,
  damagePropByObstacleId,
  detonateBarrel,
  stepBarrelDetonations,
  flushBarrelDetonations,
  isPropAreaClear,
  respawnWaveProps,
  checkCactusThornContact,
  isPointBlocked,
} = mapMod;

const {
  BANSUNG_AFFINITY,
  BANSUNG_SHIELD,
  BANSUNG_STUN_DR,
  BANSUNG_DOTS,
  BANSUNG_DMG_FLAG_CRIT,
  BANSUNG_DMG_FLAG_SHIELD,
  BANSUNG_DMG_FLAG_BREAK,
  BANSUNG_DMG_FLAG_IMMUNE,
  BANSUNG_DMG_FLAG_DOT,
  BANSUNG_POISON_VULN_MULT,
  BANSUNG_SHOCK_CHAIN_RADIUS_PX,
  calcBansungDamage,
  applyBansungDamage,
  tickHeroShield,
  applyStunWithDR,
  applyDot,
  tickStatuses,
} = damage;

function makeObs(id, x, y, w, h, kind = 'wall', extra = {}) {
  const isPit = kind === 'pit';
  const blocksLos =
    extra.blocksLos !== undefined
      ? extra.blocksLos
      : kind === 'wall' || kind === 'pillar' || kind === 'rock';
  return {
    id,
    x,
    y,
    w,
    h,
    kind,
    blocksMove: extra.blocksMove ?? true,
    blocksBullet: extra.blocksBullet ?? !isPit,
    blocksLos,
    destructible: extra.destructible ?? (kind === 'crate' || kind === 'barrel' || kind === 'cactus'),
    hp: extra.hp ?? (kind === 'crate' ? 30 : kind === 'barrel' ? 40 : 0),
    alive: extra.alive ?? true,
  };
}

function makeTarget(over = {}) {
  return {
    id: 1,
    numId: 1,
    x: 500,
    y: 500,
    tier: 'mob',
    armorType: 'light',
    flatArmor: 0,
    alive: true,
    downed: false,
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 0,
    ...over,
  };
}

function makeHero(over = {}) {
  return makeTarget({
    id: 'p0',
    numId: 0,
    tier: 'hero',
    hp: 70,
    maxHp: 70,
    shield: 50,
    maxShield: 50,
    shieldDelayMs: 0,
    shieldRegenAccMs: 0,
    ...over,
  });
}

function makeSpatialActor(id, x, y, over = {}) {
  return {
    id,
    x,
    y,
    radius: 13,
    team: 1,
    layer: LAYER_ENEMY,
    alive: true,
    ...over,
  };
}

function findFxTuple(fx, fxType) {
  for (let i = 0; i + BANSUNG_FX_FIELDS <= fx.length; i += BANSUNG_FX_FIELDS) {
    if (fx[i] === fxType) return fx.slice(i, i + BANSUNG_FX_FIELDS);
  }
  return null;
}

// ============================================================================
// T01 — Arena Layout, Config Normalization & SpatialHash Zero-Tunneling
// ============================================================================

test('T01.1: shared mode/config normalization, aim quantization & 3-biome arena layouts (6336x4032)', () => {
  assert.equal(BANSUNG_MODE_ID, 'bansung');
  assert.equal(GAME_MODES.bansung.minPlayers, 1);
  assert.equal(GAME_MODES.bansung.maxPlayers, 4);
  assert.equal(BANSUNG_MAP_W, 6336);
  assert.equal(BANSUNG_MAP_H, 4032);
  assert.equal(BANSUNG_ARENA_W, 6336);
  assert.equal(BANSUNG_ARENA_H, 4032);
  assert.equal(BANSUNG_ARENA_CX, 3168);
  assert.equal(BANSUNG_ARENA_CY, 2016);
  assert.deepEqual(BANSUNG_PLAYABLE_BOUNDS, { x0: 48, y0: 96, x1: 6288, y1: 3984 });
  assert.deepEqual(BANSUNG_GAME_MODES, ['survival', 'waves']);
  assert.equal(resolveBansungGameMode(), 'survival');
  assert.equal(resolveBansungGameMode({ gameMode: 'waves' }), 'waves');
  assert.ok(BANSUNG_PICKUP_IDS.includes('xp'));
  assert.equal(BANSUNG_PLAYER_FIELDS, 12);
  assert.equal(BANSUNG_EFLAG_EVOLVED, 256);

  const norm = normalizeBansungConfig(
    { biome: 'invalid', difficulty: 'bad', bots: 99, botLevel: 'x', reviveMode: 'nope' },
    2,
  );
  assert.deepEqual(norm, {
    biome: 'desert',
    difficulty: 'normal',
    bots: Math.min(BANSUNG_MAX_BOTS, BANSUNG_MAX_PLAYERS - 2),
    botLevel: 'normal',
    reviveMode: 'coop',
  });
  assert.equal(normalizeBansungConfig({ bots: -5 }, 1).bots, 0);
  assert.equal(normalizeBansungConfig({ biome: 'cyber', difficulty: 'hell', bots: 3, endless: 1 }, 4).bots, 3);
  assert.equal(normalizeBansungConfig({ gameMode: 'waves' }, 1).gameMode, 'waves');

  for (const ang of [0, 0.37, Math.PI * 0.5, Math.PI, 4.91, Math.PI * 2 - 0.002]) {
    const q = quantizeAim(ang);
    assert.ok(q >= 0 && q < 4096);
    const back = dequantizeAim(q);
    const diff = Math.abs(Math.atan2(Math.sin(back - ang), Math.cos(back - ang)));
    assert.ok(diff <= (Math.PI * 2) / 4096 + 1e-6, `quantize round-trip err=${diff}`);
  }

  for (const biome of BANSUNG_BIOMES) {
    const a0 = buildServerArena(biome, 0);
    const a0Again = buildServerArena(biome, 0);
    const aSeeded = buildServerArena(biome, 424242);

    assert.equal(a0.w, 6336);
    assert.equal(a0.h, 4032);
    assert.deepEqual(a0.playable, BANSUNG_PLAYABLE_BOUNDS);
    assert.equal(a0.playerSpawns.length, 8);
    assert.equal(a0.enemyGates.length, 12);
    assert.equal(a0.pedestals.length, 5);
    assert.deepEqual(a0.bossPad, [BANSUNG_ARENA_CX, BANSUNG_ARENA_CY]);

    // Boss pad, 8 player spawns, 12 outer gates & 5 shrines must remain clear of solid cover/props
    assert.equal(isPointBlocked(a0, a0.bossPad[0], a0.bossPad[1], 34, 'move'), false);
    for (const [sx, sy] of a0.playerSpawns) {
      assert.equal(isPointBlocked(a0, sx, sy, 14, 'move'), false, `${biome} spawn (${sx},${sy}) clear`);
    }
    for (const gate of a0.enemyGates) {
      assert.equal(isPointBlocked(a0, gate.x, gate.y, 14, 'move'), false, `${biome} gate (${gate.x},${gate.y}) clear`);
    }
    for (const ped of a0.pedestals) {
      assert.equal(isPointBlocked(a0, ped.x, ped.y, 14, 'move'), false, `${biome} pedestal (${ped.x},${ped.y}) clear`);
    }

    // Deterministic canonical seed=0 vs seeded variation
    assert.deepEqual(
      a0.props.map((p) => [p.kind, p.x, p.y]),
      a0Again.props.map((p) => [p.kind, p.x, p.y]),
    );
    assert.notDeepEqual(
      a0.props.map((p) => [p.x, p.y]),
      aSeeded.props.map((p) => [p.x, p.y]),
    );

    if (biome === 'desert') {
      assert.equal(a0.cacti.length, 24);
      assert.equal(a0.barrels.filter((b) => b.kind === 'barrel_explosive').length, 20);
      assert.equal(a0.crates.length, 28);
    } else if (biome === 'crypt') {
      assert.equal(a0.barrels.filter((b) => b.kind === 'barrel_explosive').length, 24);
      assert.equal(a0.crates.length, 48);
    } else if (biome === 'cyber') {
      assert.equal(a0.barrels.filter((b) => b.kind === 'barrel_emp').length, 26);
      assert.equal(a0.crates.length, 46);
    }
  }

  // Raw shared map generator also matches 6336x4032 server arena dimensions
  const gen = generateArenaLayout('desert', 0);
  assert.equal(gen.w, BANSUNG_MAP_W);
  assert.equal(gen.h, BANSUNG_MAP_H);
  assert.equal(gen.pedestals.length, 5);
  assert.equal(gen.enemyGates.length, 12);
  assert.equal(gen.obstacles.length > 0, true);
});

test('T01.2: ActorGrid & ObstacleGrid 64px spatial indexing, capacity growth, epoch dedup & in-place toggle', () => {
  const actorGrid = new ActorGrid(BANSUNG_MAP_W, BANSUNG_MAP_H, GRID_CELL);
  const actors = [];
  // Exceed initial 512 next-buffer capacity + include dead/NaN, a large boss, and a far SE quadrant unit
  for (let i = 0; i < 650; i++) {
    const x = i === 649 ? 3900 : 100 + (i % 30) * 60;
    const y = i === 649 ? 2400 : 140 + Math.floor(i / 30) * 48;
    actors.push(
      makeSpatialActor(i + 1, x, y, {
        radius: i === 0 ? 44 : 12,
        layer: i % 5 === 0 ? LAYER_PLAYER : LAYER_ENEMY,
        team: i % 5 === 0 ? 0 : 1,
      }),
    );
  }
  actors.push(makeSpatialActor(9999, 250, 250, { alive: false }));
  actors.push(makeSpatialActor(9998, NaN, 250, { alive: true }));

  actorGrid.rebuild(actors);
  assert.equal(actorGrid.items.length, 650);
  assert.equal(actorGrid.maxRadius, 44);

  // Query adjacent to large boss radius=44 in neighboring cell
  const circleOut = [];
  actorGrid.queryCircle(actors[0].x + 48, actors[0].y, 6, LAYER_PLAYER, circleOut);
  assert.ok(circleOut.some((a) => a.id === 1), 'large-radius actor found across cell boundary');
  assert.ok(!circleOut.some((a) => a.id === 9999 || a.id === 9998));

  // Query far SE quadrant of 4224x2688 arena
  const seOut = [];
  actorGrid.queryCircle(3910, 2405, 24, LAYER_ENEMY, seOut);
  assert.ok(seOut.some((a) => a.id === 650), 'far 4224x2688 SE quadrant actor indexed & queried');

  // querySegmentCells deduplicates across padded DDA cells
  const segOut = [];
  actorGrid.querySegmentCells(80, 140, 1200, 140, 20, LAYER_ENEMY | LAYER_PLAYER, segOut);
  const seenIds = new Set(segOut.map((a) => a.id));
  assert.equal(seenIds.size, segOut.length, 'segment query must not duplicate multi-cell actors');

  // queryEnemies honors maxCount and excludeId
  const enemyIds = new Int32Array(4);
  const cnt = actorGrid.queryEnemies(actors[1].x, actors[1].y, 120, enemyIds, 4, actors[1].id);
  assert.ok(cnt >= 1 && cnt <= 4);
  assert.ok(![...enemyIds.subarray(0, cnt)].includes(actors[1].id));

  // ObstacleGrid collinear wall merge + multi-cell epoch deduplication + setAlive
  const wallTiles = [
    makeObs(1, 200, 200, 48, 48, 'wall'),
    makeObs(2, 248, 200, 48, 48, 'wall'),
    makeObs(3, 296, 200, 48, 48, 'wall'),
    makeObs(4, 400, 200, 36, 36, 'crate'),
  ];
  const merged = mergeCollinearWalls(wallTiles);
  assert.equal(merged.length, 2, '3 flush static walls merge into 1 AABB while crate remains separate');
  const mergedWall = merged.find((o) => o.kind === 'wall');
  assert.equal(mergedWall.w, 144);

  const obsGrid = new ObstacleGrid(wallTiles, BANSUNG_MAP_W, BANSUNG_MAP_H, GRID_CELL, true);
  const aabbOut = [];
  obsGrid.queryAabb(190, 190, 450, 260, aabbOut);
  assert.equal(aabbOut.length, 2, 'multi-cell merged wall returned once via seenEpoch');

  assert.equal(obsGrid.setAlive(4, false), true);
  obsGrid.queryAabb(190, 190, 450, 260, aabbOut);
  assert.equal(aabbOut.length, 1, 'setAlive(false) removes obstacle in-place without rebuild');
});

test('T01.3: swept bullet zero-tunneling at 2400 px/s & 900px beam against thin 16px pillar and small actors', () => {
  const obsGrid = new ObstacleGrid([makeObs(1, 300, 100, 16, 200, 'pillar')], BANSUNG_MAP_W, BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(BANSUNG_MAP_W, BANSUNG_MAP_H);

  // Enemy stands directly behind the 16px pillar; bullet moves 80px in 1/30s (2400 px/s)
  const shieldedEnemy = makeSpatialActor(10, 332, 200, { radius: 12 });
  actorGrid.rebuild([shieldedEnemy]);

  const fastBullet = {
    x: 270,
    y: 200,
    vx: 2400,
    vy: 0,
    radius: 4,
    team: 0,
    maxHits: 1,
    bouncesLeft: 0,
  };
  const res = stepSweptBullet(obsGrid, actorGrid, fastBullet, 1 / 30);
  assert.equal(res.stopped, true);
  assert.equal(res.stoppedBy, 'obstacle');
  assert.equal(res.actorHits.length, 0, 'must not tunnel through 16px pillar to hit shielded enemy');
  assert.equal(res.obstacleHits.length, 1);
  assert.ok(Math.abs(res.endX - 296) < 1e-5, `expected stop at x=296 (300 - radius 4), got ${res.endX}`);
  assert.equal(res.obstacleHits[0].nx, -1);
  assert.equal(res.obstacleHits[0].ny, 0);

  // Open lane: 2400 px/s bullet and 900px railgun beam must hit thin radius=10 scarab without tunneling
  const emptyGrid = new ObstacleGrid([], BANSUNG_MAP_W, BANSUNG_MAP_H);
  const smallScarab = makeSpatialActor(11, 315, 200, { radius: 10 });
  actorGrid.rebuild([smallScarab]);

  const fastHit = stepSweptBullet(emptyGrid, actorGrid, {
    x: 260,
    y: 200,
    vx: 2400,
    vy: 0,
    radius: 3,
    team: 0,
  }, 1 / 30);
  assert.equal(fastHit.stoppedBy, 'actor');
  assert.equal(fastHit.actorHits.length, 1);
  assert.equal(fastHit.actorHits[0].actor.id, 11);
  // Entry point: 315 - (10 + 3) = 302
  assert.ok(Math.abs(fastHit.endX - 302) < 1e-5, `expected entry x=302, got ${fastHit.endX}`);

  // Long 900px segment (>128px DDA branch) hitting tiny enemy
  const farEnemy = makeSpatialActor(12, 950, 200, { radius: 10 });
  actorGrid.rebuild([farEnemy]);
  const longHit = stepSweptBullet(emptyGrid, actorGrid, {
    x: 100,
    y: 200,
    vx: 27000,
    vy: 0,
    radius: 2,
    team: 0,
  }, 1 / 30);
  assert.equal(longHit.stoppedBy, 'actor');
  assert.equal(longHit.actorHits[0].actor.id, 12);

  // Wall-hug muzzle guard prevents spawning bullets across a thin 16px wall
  const guardHit = checkMuzzleWallGuard(obsGrid, 290, 200, 326, 200, 4, 'bullet');
  assert.ok(guardHit !== null, 'wall-hug muzzle guard catches muzzle extending past 16px wall');
  assert.equal(guardHit.obstacle.id, 1);
  assert.ok(guardHit.x <= 296 + 1e-6);

  // Axis-aligned (dx=0, dy=0) DDA raycast checks
  assert.ok(raycastObstacles(obsGrid, 308, 40, 308, 250, 0, 'bullet') !== null);
  assert.ok(raycastObstacles(obsGrid, 200, 200, 350, 200, 0, 'bullet') !== null);
  assert.equal(sweepCircleSegment(0, 0, 100, 0, 4, 50, 30, 10), -1);
});

test('T01.4: swept piercing shots, ricochet bounces (max 3/tick), team filtering & pit pass-through', () => {
  const wallObs = makeObs(1, 200, 100, 300, 16, 'wall');
  const pitObs = makeObs(2, 260, 260, 48, 48, 'pit');
  const obsGrid = new ObstacleGrid([wallObs, pitObs], BANSUNG_MAP_W, BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(BANSUNG_MAP_W, BANSUNG_MAP_H);

  // Friendly actor + 3 lined-up enemies; piercing bullet skips ally & hits up to maxHits=2
  const ally = makeSpatialActor(1, 140, 200, { team: 0, layer: LAYER_PLAYER, radius: 13 });
  const e1 = makeSpatialActor(2, 180, 200, { radius: 12 });
  const e2 = makeSpatialActor(3, 240, 200, { radius: 12 });
  const e3 = makeSpatialActor(4, 300, 200, { radius: 12 });
  actorGrid.rebuild([ally, e1, e2, e3]);

  const hitIds = new Set();
  const pierceRes = stepSweptBullet(obsGrid, actorGrid, {
    x: 110,
    y: 200,
    vx: 10000,
    vy: 0,
    radius: 4,
    team: 0,
    maxHits: 2,
    hitIds,
  }, 1 / 30);
  assert.equal(pierceRes.stoppedBy, 'actor');
  assert.deepEqual(pierceRes.actorHits.map((h) => h.actor.id), [2, 3]);
  assert.ok(hitIds.has(2) && hitIds.has(3) && !hitIds.has(4));

  // Bullets pass right over 'pit' obstacles
  const pitRay = raycastObstacles(obsGrid, 220, 284, 360, 284, 4, 'bullet');
  assert.equal(pitRay, null, 'bullets pass over pit');
  assert.equal(hasLineOfSight(obsGrid, 220, 284, 360, 284, 'los'), true, 'LOS passes over pit');

  // Ricochet off horizontal wall y=116 into enemy below:
  // (240, 170) -> hits wall at (340, 120) -> reflects to (440, 170.5)
  const targetAroundWall = makeSpatialActor(5, 440, 170, { radius: 14 });
  actorGrid.rebuild([targetAroundWall]);
  const bounceBullet = {
    x: 240,
    y: 170,
    vx: 1800,
    vy: -900,
    radius: 4,
    team: 0,
    bouncesLeft: MAX_BOUNCES_PER_TICK,
  };
  const bounceRes = stepSweptBullet(obsGrid, actorGrid, bounceBullet, 0.2);
  assert.ok(bounceRes.bouncesUsed >= 1, 'ricocheted off top wall');
  assert.equal(bounceRes.stoppedBy, 'actor');
  assert.equal(bounceRes.actorHits[0].actor.id, 5);
  assert.ok(bounceBullet.vy > 0, 'vy reflected downward after wall bounce');
});

// ============================================================================
// T02 — Circle-vs-AABB Slide, Inside-Escape & Amanatides-Woo DDA AoE LOS
// ============================================================================

test('T02.1: moveCircleWithSlide <=8px substeps prevent dash/knockback tunneling & preserve tangent slide', () => {
  assert.equal(MAX_MOVE_SUBSTEP_PX, 8);
  // North wall (0..96), thin 16px vertical wall & collinear horizontal tiles to verify zero seam snag
  const obsGrid = new ObstacleGrid(
    [
      makeObs(0, 0, 0, BANSUNG_MAP_W, 96, 'wall'),
      makeObs(1, 300, 150, 16, 200, 'wall'),
      makeObs(2, 100, 400, 48, 48, 'wall'),
      makeObs(3, 148, 400, 48, 48, 'wall'),
      makeObs(4, 196, 400, 48, 48, 'wall'),
    ],
    BANSUNG_MAP_W,
    BANSUNG_MAP_H,
  );

  // Dash diagonally into thin 16px wall (32px move > 16px wall thickness, solved via <=8px substeps)
  const hero = { x: 280, y: 240, radius: 13 };
  moveCircleWithSlide(hero, 32, 24, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 48);
  assert.ok(hero.x <= 300 - hero.radius + 1e-6, `did not tunnel through 16px wall: x=${hero.x}`);
  assert.ok(hero.y > 258, `preserved vertical tangent slide: y=${hero.y}`);

  // Slide cleanly across collinear wall seam at x=148 without snagging
  const slider = { x: 130, y: 387, radius: 13 };
  for (let i = 0; i < 6; i++) {
    moveCircleWithSlide(slider, 16, 4, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 48);
    assert.ok(slider.y <= 400 - slider.radius + 1e-6);
  }
  assert.ok(slider.x > 210, `slid smoothly across x=148 seam to x=${slider.x}`);

  // Arena boundary clamp (x >= margin + r = 61) & North wall clamp (y >= 96 + r = 109)
  const edgeBody = { x: 60, y: 120, radius: 13 };
  moveCircleWithSlide(edgeBody, -100, -100, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 48);
  assert.ok(edgeBody.x >= 48 + 13 - 1e-6 && edgeBody.y >= 96 + 13 - 1e-6);
});

test('T02.2: 2-pass deepest-overlap corner resolution, inside-AABB escape & pit move block', () => {
  const obsGrid = new ObstacleGrid(
    [
      makeObs(1, 300, 200, 48, 120, 'wall'),
      makeObs(2, 200, 300, 148, 48, 'wall'),
      makeObs(3, 500, 500, 48, 48, 'pit'),
    ],
    BANSUNG_MAP_W,
    BANSUNG_MAP_H,
  );

  // Corner overlap against two perpendicular walls
  const cornerBody = { x: 294, y: 295, radius: 14 };
  resolveObstacles(cornerBody, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 0);
  assert.ok(
    distCircleToAabbSq(cornerBody.x, cornerBody.y, obsGrid.getById(1)) >= 14 * 14 - 1e-4,
    'clear of vertical wall',
  );
  assert.ok(
    distCircleToAabbSq(cornerBody.x, cornerBody.y, obsGrid.getById(2)) >= 14 * 14 - 1e-4,
    'clear of horizontal wall',
  );

  // Inside-AABB escape (center dead inside horizontal wall closer to top face y=300)
  const trapped = { x: 230, y: 312, radius: 14 };
  resolveObstacles(trapped, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 0);
  assert.ok(trapped.y <= 300 - 14 + 1e-5, `escaped through nearest face y=${trapped.y}`);

  // Pit blocks walking movement
  const walker = { x: 486, y: 524, radius: 14 };
  moveCircleWithSlide(walker, 24, 0, obsGrid, BANSUNG_MAP_W, BANSUNG_MAP_H, 0);
  assert.ok(walker.x <= 500 - 14 + 1e-5, 'pit blocks walking');
});

test('T02.3: Amanatides-Woo DDA LOS & queryAoeTargets cover occlusion, falloff & boss lateral probe', () => {
  const pillar = makeObs(1, 568, 492, 20, 16, 'pillar'); // blocksLos=true
  const crate = makeObs(2, 434, 482, 36, 36, 'crate');   // blocksLos=false (between 500 and 400)
  const obsGrid = new ObstacleGrid([pillar, crate], BANSUNG_MAP_W, BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(BANSUNG_MAP_W, BANSUNG_MAP_H);

  // Blast center (500, 500), radius 160
  const exposedCenter = makeSpatialActor(1, 500, 500, { radius: 12 });
  const behindCrate = makeSpatialActor(2, 400, 500, { radius: 12 });      // edgeDist = 100 - 12 = 88 -> falloff = 0.45
  const occludedMob = makeSpatialActor(3, 620, 500, { radius: 12 });      // directly behind pillar
  const outerRim = makeSpatialActor(4, 500, 665, { radius: 12 });         // centerDist=165 <= 172, edgeDist=153 -> clamped to AOE_MIN_FALLOFF
  const outOfRange = makeSpatialActor(5, 500, 690, { radius: 12 });
  // Boss behind narrow 16px pillar: center blocked at y=502, but radius=36 >= 28 probes +-0.6*36 = +-21.6px past pillar edge!
  const bossHalfCover = makeSpatialActor(6, 640, 504, { radius: 36 });

  assert.equal(hasLineOfSight(obsGrid, 500, 500, 400, 500, 'los'), true, 'crate does not block LOS');
  assert.equal(hasLineOfSight(obsGrid, 500, 500, 620, 500, 'los'), false, 'pillar blocks LOS');

  actorGrid.rebuild([exposedCenter, behindCrate, occludedMob, outerRim, outOfRange, bossHalfCover]);
  const aoeOut = [];
  queryAoeTargets(actorGrid, obsGrid, 500, 500, 160, 'los', LAYER_ENEMY, aoeOut);
  const hitMap = new Map(aoeOut.map((t) => [t.actor.id, t]));

  assert.equal(hitMap.get(1).falloff, 1);
  assert.ok(hitMap.has(2), 'target behind non-LOS-blocking crate is hit');
  assert.ok(Math.abs(hitMap.get(2).falloff - (1 - 88 / 160)) < 1e-6);
  assert.equal(hitMap.has(3), false, 'small mob behind pillar is occluded');
  assert.ok(Math.abs(hitMap.get(4).falloff - AOE_MIN_FALLOFF) < 1e-6, 'falloff floored at 0.35');
  assert.equal(hitMap.has(5), false);
  assert.equal(hitMap.has(6), true, 'boss >= 28px radius hit via lateral +-0.6*r probe');

  // With losMode='none', occluded mob is also hit
  queryAoeTargets(actorGrid, obsGrid, 500, 500, 160, 'none', LAYER_ENEMY, aoeOut);
  assert.equal(aoeOut.length, 5);
});

test('T02.4: queryAoeObstacles checks LOS occlusion & reflects in-place obstacle destruction', () => {
  const wall = makeObs(1, 560, 460, 24, 80, 'wall');
  const exposedBarrel = makeObs(2, 420, 482, 36, 36, 'barrel');
  const shieldedBarrel = makeObs(3, 610, 482, 36, 36, 'barrel');
  const obsGrid = new ObstacleGrid([wall, exposedBarrel, shieldedBarrel], BANSUNG_MAP_W, BANSUNG_MAP_H);

  const obOut = [];
  queryAoeObstacles(obsGrid, 500, 500, 160, 'los', obOut);
  assert.deepEqual(obOut.map((o) => o.obstacle.id), [2]);

  // Removing wall in-place opens LOS to shielded barrel without rebuilding ObstacleGrid
  obsGrid.setAlive(1, false);
  queryAoeObstacles(obsGrid, 500, 500, 160, 'los', obOut);
  assert.deepEqual(obOut.map((o) => o.obstacle.id).sort(), [2, 3]);
});

// ============================================================================
// T03 — Explosive Barrel Chain Reaction & Arena Destructible Props
// ============================================================================

function clearAllBarrels(arena) {
  for (const b of arena.barrels) {
    b.alive = false;
    b.hp = 0;
    if (b.obstacleId >= 0) arena.obsGrid.setAlive(b.obstacleId, false);
  }
}

function repurposeBarrels(arena, specs) {
  clearAllBarrels(arena);
  assert.ok(specs.length <= arena.barrels.length);
  const placed = [];
  for (let i = 0; i < specs.length; i++) {
    const b = arena.barrels[i];
    const s = specs[i];
    b.x = s.x;
    b.y = s.y;
    b.hp = s.hp ?? b.maxHp;
    b.alive = true;
    b.detonated = false;
    b.kind = s.kind ?? b.kind;
    b.blastDmg = s.blastDmg ?? (b.kind === 'barrel_emp' ? 120 : 140);
    b.blastRadius = s.blastRadius ?? (b.kind === 'barrel_emp' ? 170 : 160);
    b.stunMs = s.stunMs ?? (b.kind === 'barrel_emp' ? 1200 : 0);

    const obs = arena.obsGrid.getById(b.obstacleId);
    obs.x = b.x - b.w * 0.5;
    obs.y = b.y - b.h * 0.5;
    obs.hp = b.hp;
    obs.alive = true;
    // Also place obstacle into cells overlapping new coordinates
    const c0 = Math.floor(obs.x / arena.obsGrid.cellSize);
    const c1 = Math.floor((obs.x + obs.w) / arena.obsGrid.cellSize);
    const r0 = Math.floor(obs.y / arena.obsGrid.cellSize);
    const r1 = Math.floor((obs.y + obs.h) / arena.obsGrid.cellSize);
    const obsIdx = arena.obsGrid.obstacles.indexOf(obs);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const cell = arena.obsGrid.cells[cy * arena.obsGrid.cols + cx];
        if (cell && !cell.includes(obsIdx)) cell.push(obsIdx);
      }
    }
    placed.push(b);
  }
  return placed;
}

test('T03.1: prop damage, ObstacleGrid clear on break, FX_STATUS & crate/urn loot break events', () => {
  const arena = buildServerArena('desert', 0);
  const crate = arena.crates.find((c) => c.kind === 'crate');
  const urn = arena.crates.find((c) => c.kind === 'urn');
  assert.ok(crate && urn);

  // Partial hit updates HP & hitFlashMs without breaking
  const partial = damageProp(arena, crate.idx, 10, 0);
  assert.equal(partial.hit, true);
  assert.equal(partial.broken, false);
  assert.equal(partial.remainingHp, crate.maxHp - 10);
  assert.equal(crate.hitFlashMs, PROP_HIT_FLASH_MS);
  assert.equal(arena.obsGrid.getById(crate.obstacleId).alive, true);

  // Lethal hit via obstacleId frees ObstacleGrid, emits FX_STATUS crate break, fires loot callback
  const breaks = [];
  const fx = [];
  const brokenCrate = damagePropByObstacleId(arena, crate.obstacleId, 999, 0, {
    ownerIdx: 0,
    attackerId: 'p0',
    fx,
    onPropBreak: (e) => breaks.push(e),
  });
  assert.equal(brokenCrate.broken, true);
  assert.equal(crate.alive, false);
  assert.equal(arena.obsGrid.getById(crate.obstacleId).alive, false);
  assert.equal(fx[0], FX_STATUS);
  assert.equal(fx[2], BANSUNG_STATUS_CRATE);
  assert.equal(breaks.length, 1);
  assert.equal(breaks[0].shouldDropLoot, true);
  assert.equal(breaks[0].lootTable, 'common');

  const brokenUrn = damageProp(arena, urn.idx, 999, 0, { onPropBreak: (e) => breaks.push(e) });
  assert.equal(brokenUrn.broken, true);
  assert.equal(breaks[1].lootTable, 'pot');
});

test('T03.2: explosive barrel 4-tick staggered chain reaction, LOS cover guard & chainDepth <= 8 cap', () => {
  const arena = buildServerArena('desert', 0);
  // Desert inner ruin pillar [2376..2472, 1512..1584] blocks LOS between b0 (2344, 1548) and bShielded (2492, 1548, dist=148 < 160)
  repurposeBarrels(arena, [
    { x: 2344, y: 1548 }, // b0
    { x: 2344, y: 1668 }, // b1 (dist 120 from b0)
    { x: 2344, y: 1788 }, // b2 (dist 120 from b1, 240 from b0)
    { x: 2492, y: 1548 }, // bShielded (within blastRadius=160 of b0, occluded by pillar)
  ]);

  const fx = [];
  const initHit = damageProp(arena, arena.barrels[0].idx, 100, 0, { nowTick: 10, ownerIdx: 0, fx });
  assert.equal(initHit.broken, true);
  assert.equal(initHit.queuedBarrel, true);
  assert.equal(arena.pendingBarrels.length, 1);
  assert.equal(arena.pendingBarrels[0].triggerTick, 10);

  // Tick 10: B0 detonates, chains B1 at tick 14 (+4 ticks); B3 behind pillar survives!
  const ev10 = stepBarrelDetonations(arena, 10, { fx });
  assert.equal(ev10.length, 1);
  assert.equal(ev10[0].chainedBarrels, 1);
  assert.equal(arena.barrels[1].alive, false);
  assert.equal(arena.barrels[2].alive, true);
  assert.equal(arena.barrels[3].alive, true, 'LOS-occluded barrel behind pillar must NOT detonate');
  assert.equal(arena.pendingBarrels[0].triggerTick, 10 + BARREL_CHAIN_DELAY_TICKS);

  // Tick 13: stagger not elapsed yet -> zero detonations
  assert.equal(stepBarrelDetonations(arena, 13, { fx }).length, 0);

  // Tick 14: B1 detonates, chains B2 at tick 18
  const ev14 = stepBarrelDetonations(arena, 14, { fx });
  assert.equal(ev14.length, 1);
  assert.equal(arena.barrels[2].alive, false);
  assert.equal(arena.pendingBarrels[0].triggerTick, 14 + BARREL_CHAIN_DELAY_TICKS);

  // Tick 18: B2 detonates
  const ev18 = stepBarrelDetonations(arena, 18, { fx });
  assert.equal(ev18.length, 1);
  assert.equal(arena.pendingBarrels.length, 0);

  // Verify BARREL_MAX_CHAIN_DEPTH = 8 cap using 10-barrel line in cyber arena
  const cyber = buildServerArena('cyber', 0);
  const lineSpecs = Array.from({ length: 10 }, (_, i) => ({
    x: 240 + i * 110,
    y: 240,
    kind: 'barrel_emp',
  }));
  repurposeBarrels(cyber, lineSpecs);
  damageProp(cyber, cyber.barrels[0].idx, 999, 0, { nowTick: 0 });
  const cascade = flushBarrelDetonations(cyber, { losMode: 'none' }, 20);
  // Depths 0..8 = 9 detonations; barrel[9] breaks at depth 9 without queuing another blast!
  assert.equal(cascade.length, BARREL_MAX_CHAIN_DEPTH + 1);
  assert.equal(cascade[cascade.length - 1].detonation.chainDepth, BARREL_MAX_CHAIN_DEPTH);
  assert.equal(cyber.barrels[9].alive, false);
  assert.equal(cyber.pendingBarrels.length, 0);
});

test('T03.3: explosive & EMP barrel damage, stun DR, knockback & zero player environmental damage', () => {
  assert.equal(BARREL_PLAYER_SHIELD_CHIP, 0, 'barrel environmental player chip must be 0');
  assert.equal(BARREL_KNOCKBACK_PLAYER, 0, 'barrel environmental player knockback must be 0');

  const desert = buildServerArena('desert', 0);
  const [explBarrel] = repurposeBarrels(desert, [{ x: 1056, y: 696, kind: 'barrel_explosive' }]);

  const armoredMob = makeTarget({
    id: 10,
    numId: 10,
    x: 1096,
    y: 696,
    tier: 'mob',
    armorType: 'armored',
    flatArmor: 2,
    hp: 300,
    maxHp: 300,
  });
  const player = makeHero({
    id: 'p0',
    numId: 0,
    x: 1056,
    y: 746,
    hp: 60,
    maxHp: 60,
    shield: 10,
    maxShield: 50,
  });

  const actorGrid = new ActorGrid(desert.w, desert.h);
  const spatialActors = [
    makeSpatialActor(10, armoredMob.x, armoredMob.y, { radius: 16, team: 1, layer: LAYER_ENEMY }),
    makeSpatialActor(0, player.x, player.y, { radius: 13, team: 0, layer: LAYER_PLAYER }),
  ];
  actorGrid.rebuild(spatialActors);
  const byId = new Map([
    [10, armoredMob],
    [0, player],
  ]);
  const kbLog = [];
  const fx = [];

  const hitRes = damageProp(desert, explBarrel.idx, 999, 0, {
    autoDetonate: true,
    fx,
    blastCtx: {
      actorGrid,
      resolveActor: (a) => byId.get(a.id),
      onKnockback: (a, kx, ky) => kbLog.push([a.id, kx, ky]),
    },
  });

  assert.ok(hitRes.detonation);
  // Barrels must deal ZERO environmental damage and ZERO knockback to players while still hitting mobs
  assert.equal(player.shield, 10, 'barrel blast deals zero shield damage to players');
  assert.equal(player.hp, 60, 'barrel blast deals zero HP damage to players');
  assert.equal(player.shieldDelayMs, 0, 'barrel blast must not reset player shield regen delay');
  // Armored mob takes explosive 1.3x affinity minus flatArmor=2 and receives knockback
  assert.ok(armoredMob.hp < 300);
  assert.ok(kbLog.some(([id, kx]) => id === 10 && kx > 100));
  assert.equal(
    kbLog.find(([id]) => id === 0),
    undefined,
    'barrel blast must deal zero knockback to players',
  );
  assert.equal(
    hitRes.detonation.actorHits.some((h) => h.actor.id === 0),
    false,
    'player must not receive any hit entry from barrel detonation',
  );

  // FX_BLAST emitted
  const blastTuple = findFxTuple(fx, FX_BLAST);
  assert.ok(blastTuple !== null);
  assert.equal(blastTuple[1], BARREL_BLAST_KIND_EXPLOSIVE);

  // EMP barrel applies 1200ms stun & BARREL_BLAST_KIND_EMP
  const cyber = buildServerArena('cyber', 0);
  const [empBarrel] = repurposeBarrels(cyber, [{ x: 1056, y: 696, kind: 'barrel_emp' }]);
  const mob2 = makeTarget({ id: 20, numId: 20, x: 1086, y: 696, hp: 300, maxHp: 300 });
  actorGrid.rebuild([makeSpatialActor(20, mob2.x, mob2.y, { radius: 14, team: 1, layer: LAYER_ENEMY })]);
  const fxEmp = [];
  damageProp(cyber, empBarrel.idx, 999, 0, {
    autoDetonate: true,
    fx: fxEmp,
    blastCtx: {
      actorGrid,
      resolveActor: () => mob2,
    },
  });
  assert.equal(mob2.stunMs, 1200);
  const empBlastTuple = findFxTuple(fxEmp, FX_BLAST);
  assert.ok(empBlastTuple !== null);
  assert.equal(empBlastTuple[1], BARREL_BLAST_KIND_EMP);
});

test('T03.4: zero cactus thorn environmental contact & wave checkpoint (4, 7, 10) prop respawn clearance', () => {
  const arena = buildServerArena('desert', 0);
  const cactus = arena.cacti[0];
  assert.ok(cactus, 'desert arena must contain cactus props');
  assert.equal(cactus.thornDmg, 0, 'desert cactus must have thornDmg = 0');
  assert.equal(CACTUS_THORN_KNOCKBACK, 0, 'cactus thorn knockback must be 0');
  const cactusObs = arena.obsGrid.getById(cactus.obstacleId);
  assert.ok(cactusObs && cactusObs.alive && cactusObs.blocksMove, 'cactus remains a solid move obstacle');

  const heroX = cactus.x + cactus.w * 0.5 + 14; // just touching right face
  assert.equal(
    checkCactusThornContact(arena, heroX, cactus.y, 13),
    null,
    'cactus thorn contact must return null (zero environmental player damage/knockback)',
  );
  assert.equal(checkCactusThornContact(arena, cactus.x + 120, cactus.y, 13), null);

  // Break all barrels and crates
  for (const b of arena.barrels) damageProp(arena, b.idx, 999, 0);
  for (const c of arena.crates) damageProp(arena, c.idx, 999, 0);
  assert.equal(arena.barrels.filter((b) => b.alive).length, 0);
  assert.equal(arena.crates.filter((c) => c.alive).length, 0);

  // Wave 3 is NOT a checkpoint
  const w3 = respawnWaveProps(arena, 3);
  assert.equal(w3.triggered, false);
  assert.equal(w3.barrelsRestored, 0);

  // Occupy barrel[0] spot so isPropAreaClear returns false for barrel[0]
  const blocker = [{ x: arena.barrels[0].x, y: arena.barrels[0].y + arena.barrels[0].h * 0.5 + 14 + PROP_RESPAWN_CLEAR_PAD_PX - 1, radius: 14, alive: true }];
  assert.equal(isPropAreaClear(arena, arena.barrels[0], blocker), false);

  const w4 = respawnWaveProps(arena, 4, { entities: blocker, rng: () => 0.25 });
  assert.equal(w4.triggered, true);
  assert.equal(arena.barrels[0].alive, false, 'occupied barrel must NOT respawn on top of actor');
  assert.equal(w4.barrelsRestored, arena.barrels.length - 1);
  assert.equal(arena.obsGrid.getById(arena.barrels[1].obstacleId).alive, true);
  assert.equal(w4.cratesRestored, Math.round(arena.crates.length * 0.5), '50% of clear broken crates restored');
});

// ============================================================================
// T04 — Miragine Affinity, Soul Knight Armor Soak, Crits, Stun DR & DOTs
// ============================================================================

test('T04.1: Miragine Light/Armored affinity matrix, flatArmor, pierce/true bypass & kinetic crit pen', () => {
  assert.deepEqual(BANSUNG_AFFINITY.kinetic, [1.0, 0.85]);
  assert.deepEqual(BANSUNG_AFFINITY.pierce, [0.9, 1.25]);
  assert.deepEqual(BANSUNG_AFFINITY.explosive, [1.0, 1.3]);
  assert.deepEqual(BANSUNG_AFFINITY.energy, [1.1, 1.15]);
  assert.deepEqual(BANSUNG_AFFINITY.fire, [1.25, 0.8]);
  assert.deepEqual(BANSUNG_AFFINITY.melee, [1.15, 0.95]);
  assert.deepEqual(BANSUNG_AFFINITY.true, [1.0, 1.0]);

  // Zero/invalid baseDmg -> 0; tiny positive -> clamped >= 1
  assert.equal(calcBansungDamage(0, 'kinetic', 'light', 0), 0);
  assert.equal(calcBansungDamage(1, 'fire', 'armored', 10), 1);

  // Fire shreds light (100*1.25=125) vs weak against armored (100*0.80 - 4 = 76)
  assert.equal(calcBansungDamage(100, 'fire', 'light', 0), 125);
  assert.equal(calcBansungDamage(100, 'fire', 'armored', 4), 76);

  // Pierce (1.25 vs armored, ignores 100% flatArmor) & True (1.0, ignores 100% flatArmor)
  assert.equal(calcBansungDamage(100, 'pierce', 'armored', 4), 125);
  assert.equal(calcBansungDamage(100, 'pierce', 'light', 4), 90);
  assert.equal(calcBansungDamage(40, 'true', 'armored', 99), 40);

  // Kinetic vs armored: non-crit subtracts full flatArmor=4; crit adds +2 armor pen
  assert.equal(calcBansungDamage(100, 'kinetic', 'armored', 4), 81); // 85 - 4
  assert.equal(
    calcBansungDamage(100, 'kinetic', 'armored', 4, { critMult: 1.5, isCrit: true }),
    126, // round(100 * 0.85 * 1.5) - (4 - 2) = 128 - 2 = 126
  );

  // Fractional armorPiercePct (e.g. sniper 0.25 on flatArmor=4 -> scaledArmor=3)
  assert.equal(calcBansungDamage(100, 'kinetic', 'armored', 4, { armorPiercePct: 0.25 }), 82);
});

test('T04.2: Crit cap (0.85), Soul Knight shield soak, 1.25x energy/explosive bonus, Strong Shield, i-frames & regen', () => {
  // Crit chance capped at 0.85: rng=0.90 must NOT crit even if critChance=1.5
  const mob = makeTarget({ hp: 500, maxHp: 500 });
  const nonCrit = applyBansungDamage(
    mob,
    { baseDmg: 20, dmgKind: 'kinetic', critChance: 1.5 },
    { rng: () => 0.9 },
  );
  assert.equal(nonCrit.isCrit, false);
  assert.equal(nonCrit.hpDmg, 20);

  const yesCrit = applyBansungDamage(
    mob,
    { baseDmg: 20, dmgKind: 'kinetic', critChance: 1.5 },
    { rng: () => 0.84, atkCritDmgBonus: 0.5 },
  );
  assert.equal(yesCrit.isCrit, true);
  assert.equal(yesCrit.hpDmg, 40); // 20 * (1.5 + 0.5) = 40

  // Soul Knight shield soak: full absorb with kinetic
  const hero = makeHero({ hp: 70, maxHp: 70, shield: 50, maxShield: 50 });
  const popups = [];
  const fx = [];
  const r1 = applyBansungDamage(hero, { baseDmg: 30, dmgKind: 'kinetic' }, { popups, fx });
  assert.equal(r1.shieldDmg, 30);
  assert.equal(r1.hpDmg, 0);
  assert.equal(r1.brokeShield, false);
  assert.equal(hero.shield, 20);
  assert.equal(hero.hp, 70);
  assert.equal(hero.shieldDelayMs, BANSUNG_SHIELD.REGEN_DELAY_MS);
  assert.ok((r1.flags & BANSUNG_DMG_FLAG_SHIELD) !== 0);
  assert.ok((r1.fxFlags & BANSUNG_DMG_ARMOR) !== 0);

  // Energy 1.25x bonus vs shield + partial overflow to HP:
  // energy 36 * 1.1 (light) = 40 raw -> 40 * 1.25 = 50 effAgainstShield; shield=20 breaks -> rem = 40 * (1 - 20/50) = 24
  hero.shield = 20;
  hero.hp = 70;
  const r2 = applyBansungDamage(hero, { baseDmg: 36, dmgKind: 'energy' }, { popups, fx });
  assert.equal(r2.shieldDmg, 20);
  assert.equal(r2.brokeShield, true);
  assert.equal(r2.hpDmg, 24);
  assert.equal(hero.shield, 0);
  assert.equal(hero.hp, 46);
  assert.equal(hero.hitIframesMs, BANSUNG_SHIELD.HERO_HP_IFRAMES_MS);
  assert.ok((r2.flags & BANSUNG_DMG_FLAG_BREAK) !== 0);

  // 250ms post-HP i-frames block immediate follow-up non-DOT hit
  const rBlockedHp = applyBansungDamage(hero, { baseDmg: 50, dmgKind: 'kinetic' });
  assert.equal(rBlockedHp.blocked, true);
  assert.equal(hero.hp, 46);

  // Strong Shield guard (Soul Knight Blue Shield perk): overflow on break is clamped to 0
  const strongHero = makeHero({ hp: 70, maxHp: 70, shield: 5, maxShield: 50, strongShield: true });
  const rStrong = applyBansungDamage(strongHero, { baseDmg: 100, dmgKind: 'explosive' });
  assert.equal(rStrong.shieldDmg, 5);
  assert.equal(rStrong.brokeShield, true);
  assert.equal(rStrong.hpDmg, 0);
  assert.equal(strongHero.hp, 70);

  // 280ms Dash i-frames block non-DOT hit while DOT still ticks through
  const dashingHero = makeHero({ dashIframesMs: BANSUNG_SHIELD.DASH_IFRAMES_MS, hp: 70, shield: 0 });
  assert.equal(applyBansungDamage(dashingHero, { baseDmg: 50, dmgKind: 'kinetic' }).blocked, true);
  assert.equal(applyBansungDamage(dashingHero, { baseDmg: 5, dmgKind: 'true', isDot: true }).blocked, false);
  assert.equal(dashingHero.hp, 65);

  // Shield regen: 3200ms delay (or 2200ms fastShield), then +10 every 750ms
  const regenHero = makeHero({ shield: 0, maxShield: 30, fastShield: true });
  applyBansungDamage(regenHero, { baseDmg: 1, dmgKind: 'kinetic' });
  assert.equal(regenHero.shieldDelayMs, BANSUNG_SHIELD.FAST_REGEN_DELAY_MS);
  assert.equal(tickHeroShield(regenHero, 2199), 0);
  assert.equal(tickHeroShield(regenHero, 1), 0); // delay just reached 0
  assert.equal(tickHeroShield(regenHero, 749), 0);
  assert.equal(tickHeroShield(regenHero, 1), 10);
  assert.equal(tickHeroShield(regenHero, 1500), 20);
  assert.equal(regenHero.shield, 30);
});

test('T04.3: Stun Diminishing Returns (1.0 -> 0.5 -> 0.25 -> 4000ms immune), tier caps, hero post-stun & reset', () => {
  const mob = makeTarget({ tier: 'mob', hp: 200, maxHp: 200 });
  const popups = [];

  assert.equal(applyStunWithDR(mob, 1000, { popups }), 1000);
  assert.equal(mob.stunDrStage, 1);
  assert.equal(mob.stunDrResetMs, BANSUNG_STUN_DR.RESET_MS);

  assert.equal(applyStunWithDR(mob, 1000, { popups }), 500);
  assert.equal(mob.stunDrStage, 2);

  assert.equal(applyStunWithDR(mob, 1000, { popups }), 250);
  assert.equal(mob.stunDrStage, 3);

  // Stage 3 -> immune 4000ms + IMMUNE popup
  assert.equal(applyStunWithDR(mob, 1000, { popups }), 0);
  assert.equal(mob.stunImmuneMs, BANSUNG_STUN_DR.IMMUNE_MS);
  assert.equal(popups[0][2], BANSUNG_DMG_FLAG_IMMUNE);

  // Sub-150ms scaled stun triggers immunity immediately
  const subMob = makeTarget({ id: 2, tier: 'mob', stunDrStage: 2 });
  assert.equal(applyStunWithDR(subMob, 500), 0); // 500 * 0.25 = 125 < 150
  assert.equal(subMob.stunImmuneMs, BANSUNG_STUN_DR.IMMUNE_MS);

  // Tier caps & multipliers: elite (0.65x, cap 1200) & boss (0.35x, cap 900, 12000ms reset)
  const elite = makeTarget({ id: 3, tier: 'elite' });
  assert.equal(applyStunWithDR(elite, 5000), BANSUNG_STUN_DR.TIER_MAX_MS.elite);
  const boss = makeTarget({ id: 4, tier: 'boss' });
  assert.equal(applyStunWithDR(boss, 5000), BANSUNG_STUN_DR.TIER_MAX_MS.boss);
  assert.equal(boss.stunDrResetMs, BANSUNG_STUN_DR.BOSS_RESET_MS);

  // ccImmune blocks stun completely
  const ccImmune = makeTarget({ id: 5, tier: 'boss', ccImmune: true });
  assert.equal(applyStunWithDR(ccImmune, 1000, { popups }), 0);

  // Hero stun expiry auto-grants 2500ms post-stun immunity; resetting DR timer restores 1.0x stage
  const hero = makeHero();
  assert.equal(applyStunWithDR(hero, 1000), 700); // 1000 * 0.70
  const expRes = tickStatuses(hero, 700);
  assert.equal(expRes.stunExpired, true);
  assert.equal(hero.stunMs, 0);
  assert.equal(hero.stunImmuneMs, BANSUNG_STUN_DR.HERO_POST_STUN_IMMUNE_MS);

  tickStatuses(hero, BANSUNG_STUN_DR.RESET_MS);
  assert.equal(hero.stunDrStage, 0);
  assert.equal(hero.stunImmuneMs, 0);
  assert.equal(applyStunWithDR(hero, 1000), 700);
});

test('T04.4: 500ms DOT ticks (burn/poison/shock/bleed), poison +15% vuln, moving bleed, <=96px shock chain & wards', () => {
  const dt30Hz = 1000 / 30;
  const fx = [];

  // 1) Burn stacking (max 3 stacks -> 6/8/10 * 1.25 fire vs light) at exact 30Hz 500ms boundaries
  const burnTarget = makeTarget({ id: 1, numId: 1, hp: 500, maxHp: 500, armorType: 'light' });
  assert.equal(applyDot(burnTarget, 'burn', 'p0'), true);
  assert.equal(applyDot(burnTarget, 'burn', 'p0'), true);
  assert.equal(applyDot(burnTarget, 'burn', 'p0'), true);
  assert.equal(applyDot(burnTarget, 'burn', 'p0'), true); // capped at 3 stacks
  assert.equal(burnTarget.dots.burn.stacks, 3);

  // 14 steps (~467ms): no DOT tick yet; 15th step (500ms): 1st tick = round(10 * 1.25) = 13
  let burnTotal = 0;
  for (let i = 0; i < 14; i++) burnTotal += tickStatuses(burnTarget, dt30Hz, { fx }).dotDmg;
  assert.equal(burnTotal, 0);
  burnTotal += tickStatuses(burnTarget, dt30Hz, { fx }).dotDmg;
  assert.equal(burnTotal, 13);
  assert.ok((fx[4] & BANSUNG_DMG_BURN) !== 0);
  // Run remaining 75 steps (total 90 steps = 3000ms) -> 6 ticks * 13 = 78 total, then expires
  for (let i = 0; i < 75; i++) burnTotal += tickStatuses(burnTarget, dt30Hz).dotDmg;
  assert.equal(burnTotal, 78);
  assert.equal(burnTarget.dots.burn, undefined);

  // 2) Poison true damage bypasses flatArmor & adds +15% vulnerability (even on its own tick: round(5 * 1.15) = 6)
  const armoredPoisoned = makeTarget({ id: 2, hp: 500, maxHp: 500, armorType: 'armored', flatArmor: 10 });
  applyDot(armoredPoisoned, 'poison', 'p0');
  const poisonTick = tickStatuses(armoredPoisoned, 500);
  assert.equal(
    poisonTick.dotDmg,
    Math.round(BANSUNG_DOTS.poison.baseDmg * BANSUNG_POISON_VULN_MULT),
    'poison true dmg bypasses flatArmor and reflects +15% poison vulnerability',
  );
  const kineticHit = applyBansungDamage(armoredPoisoned, { baseDmg: 100, dmgKind: 'kinetic' });
  // 100 * 0.85 * 1.15 - 10 = 97.75 - 10 = 88
  assert.equal(
    kineticHit.hpDmg,
    Math.round(100 * BANSUNG_AFFINITY.kinetic[1] * BANSUNG_POISON_VULN_MULT - 10),
  );

  // 3) Bleed +50% damage when moving (speed > 20)
  const stillBleed = makeTarget({ id: 3, hp: 100, maxHp: 100, speed: 0 });
  const movingBleed = makeTarget({ id: 4, hp: 100, maxHp: 100, speed: 30 });
  applyDot(stillBleed, 'bleed');
  applyDot(movingBleed, 'bleed');
  assert.equal(tickStatuses(stillBleed, 500).dotDmg, 5);
  assert.equal(tickStatuses(movingBleed, 500).dotDmg, 8); // round(5 * 1.5) = 8

  // 4) Shock chains 50% energy dmg to 1 nearest same-faction foe <= 96px (not recursive, ignores >96px & heroes)
  const shockSrc = makeTarget({ id: 10, x: 100, y: 100, hp: 200, maxHp: 200 });
  const shockNear = makeTarget({ id: 11, x: 160, y: 100, hp: 200, maxHp: 200 }); // dist 60 <= 96
  const shockMid = makeTarget({ id: 12, x: 185, y: 100, hp: 200, maxHp: 200 });  // dist 85 <= 96 (farther than 11)
  const shockFar = makeTarget({ id: 13, x: 220, y: 100, hp: 200, maxHp: 200 });  // dist 120 > 96
  const shockHero = makeHero({ id: 'h0', x: 110, y: 100, hp: 70, shield: 50 });  // different faction
  applyDot(shockSrc, 'shock');
  const shockArcs = [];
  const shockFx = [];
  const shockRes = tickStatuses(shockSrc, 500, {
    nearbyTargets: [shockSrc, shockNear, shockMid, shockFar, shockHero],
    shockArcs,
    fx: shockFx,
  });
  assert.equal(shockRes.shockChains, 1);
  assert.equal(shockArcs.length, 1);
  assert.equal(shockArcs[0].toId, 11);
  assert.equal(shockNear.hp, 198, 'chain deals round(4*0.5)*1.1 = 2 dmg');
  assert.equal(shockMid.hp, 200, 'only 1 nearest target hit');
  assert.equal(shockFar.hp, 200, '>96px target ignored');
  assert.equal(shockHero.shield, 50, 'opposite faction ignored');
  assert.equal(shockNear.dots, undefined, 'shock chain is single-hop (no recursive DOT)');
  assert.ok((shockFx[4] & BANSUNG_DMG_SHOCK) !== 0);

  // 5) Ward perks (fire_ward & toxin_ward) grant immunity
  const wardHero = makeHero({ perks: ['fire_ward', 'toxin_ward'] });
  const wardPopups = [];
  assert.equal(applyDot(wardHero, 'burn', 'm1', { popups: wardPopups }), false);
  assert.equal(applyDot(wardHero, 'poison', 'm1', { popups: wardPopups }), false);
  assert.equal(wardPopups.length, 2);
  assert.equal(wardPopups[0][2], BANSUNG_DMG_FLAG_IMMUNE);
  assert.equal(wardPopups[1][2], BANSUNG_DMG_FLAG_IMMUNE);
});
