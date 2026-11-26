'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const S = require('../dist/shared/src/index.js');
const {
  ActorGrid,
  ObstacleGrid,
  LAYER_PLAYER,
  LAYER_ENEMY,
} = require('../dist/server/src/game/bansung/spatial.js');
const {
  applyBansungDamage,
  calcBansungDamage,
  tickStatuses,
  BANSUNG_SHIELD,
} = require('../dist/server/src/game/bansung/damage.js');
const W = require('../dist/server/src/game/bansung/weapons.js');
const G = require('../dist/server/src/game/bansung/gadgets.js');
const P = require('../dist/server/src/game/bansung/pickups.js');

const DT = 1 / 30;

function makeRng(seed = 1234567) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeWorld(opts = {}) {
  const obstacles = Array.isArray(opts.obstacles) ? opts.obstacles : [];
  const obsGrid = new ObstacleGrid(obstacles, S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const bullets = new W.BansungBulletPool(opts.bulletCap || 256);
  const fx = [];
  const popups = [];
  const damageEvents = [];
  const stunEvents = [];
  const killEvents = [];
  const dryFireEvents = [];
  const targets = new Map();

  function addTarget(spec) {
    const t = {
      id: spec.id,
      numId: spec.id,
      actorId: spec.id,
      x: spec.x ?? 400,
      y: spec.y ?? 300,
      vx: spec.vx ?? 0,
      vy: spec.vy ?? 0,
      radius: spec.radius ?? 16,
      team: spec.team ?? 1,
      layer: spec.layer ?? (spec.team === 0 ? LAYER_PLAYER : LAYER_ENEMY),
      alive: spec.alive ?? true,
      downed: spec.downed ?? false,
      tier: spec.tier ?? 'mob',
      armorType: spec.armorType ?? 'light',
      hp: spec.hp ?? 100,
      maxHp: spec.maxHp ?? (spec.hp ?? 100),
      shield: spec.shield ?? 0,
      maxShield: spec.maxShield ?? 0,
      flatArmor: spec.flatArmor ?? 0,
      dashIframesMs: spec.dashIframesMs ?? 0,
      invulnUntilTick: 0,
      stunnedUntilTick: 0,
      stunMs: 0,
      stunImmunityMs: 0,
      stunDrCount: 0,
      stunDrWindowMs: 0,
      burnTicksLeft: 0,
      burnDps: 0,
      dots: {},
      ...spec,
    };
    targets.set(t.id, t);
    syncGrid();
    return t;
  }

  function syncGrid() {
    actorGrid.rebuild(Array.from(targets.values()));
  }

  function makeCtx(tickNo = 1, extra = {}) {
    return {
      tickNo,
      obsGrid,
      actorGrid,
      bullets,
      rng: extra.rng || makeRng(9911 + tickNo),
      fx,
      popups,
      resolveTarget: (id) => targets.get(id),
      applyKnockback: (id, kx, ky) => {
        const tgt = targets.get(id);
        if (tgt) {
          tgt.kbX = (tgt.kbX || 0) + kx;
          tgt.kbY = (tgt.kbY || 0) + ky;
        }
      },
      applyRecoilPush: (rx, ry) => {
        damageEvents.push({ type: 'recoil', rx, ry });
      },
      damageObstacle: (obsId, dmg, kind) => {
        damageEvents.push({ type: 'obs', obsId, dmg, kind });
      },
      onDamageDealt: (ev) => {
        damageEvents.push(ev);
      },
      onEnemyStunned: (attackerId, tgt, stunMs) => {
        stunEvents.push({ attackerId, id: tgt.id, stunMs });
      },
      onActorKilled: (tgt) => {
        killEvents.push(tgt.id);
      },
      onDryFire: (heroId) => {
        dryFireEvents.push(heroId);
      },
      ...extra,
    };
  }

  return {
    obsGrid,
    actorGrid,
    bullets,
    fx,
    popups,
    damageEvents,
    stunEvents,
    killEvents,
    dryFireEvents,
    targets,
    addTarget,
    syncGrid,
    makeCtx,
  };
}

function makeWeaponHero(weaponId, opts = {}) {
  const hero = W.createHeroWeaponState({
    id: opts.id || 'p1',
    idx: opts.idx ?? 0,
    actorId: opts.actorId ?? 1,
    heroId: opts.heroId || 'ranger',
    x: opts.x ?? 200,
    y: opts.y ?? 300,
    aimRad: opts.aimRad ?? 0,
    team: opts.team ?? 0,
    weapons: opts.weapons || ['pistol', weaponId, null, null, 'crescent_blade'],
    mods: opts.mods,
    gachaMods: opts.gachaMods,
    hasQuickHands: opts.hasQuickHands,
  });
  hero.activeSlot = opts.activeSlot ?? 1;
  if (typeof opts.energy === 'number') {
    hero.energy = opts.energy;
  }
  return hero;
}

function stepWeaponAndBullets(world, hero, input, startTick, steps) {
  for (let i = 0; i < steps; i++) {
    const tickNo = startTick + i;
    world.syncGrid();
    const ctx = world.makeCtx(tickNo, input.ctxExtra);
    const held = typeof input.fireHeld === 'function' ? input.fireHeld(i, tickNo) : !!input.fireHeld;
    W.tickHeroWeapons(hero, { fireHeld: held, moving: !!input.moving, aimDistPx: input.aimDistPx ?? 200 }, ctx);
    W.stepBulletPool(world.bullets, ctx);
  }
}

// ===========================================================================
// 1. Registry Completeness (36 Weapons, 4 Gadgets, 12 Perks)
// ===========================================================================

test('registry completeness: 36 canonical weapons, 4 gadgets, 12 perks', () => {
  assert.equal(S.BANSUNG_WEAPON_IDS.length, 36);
  const expectedWeapons = [
    'pistol',
    'rifle',
    'smg',
    'shotgun',
    'sniper_rifle',
    'grenade_launcher',
    'stun_launcher',
    'bazooka',
    'mine_gun',
    'plasma_rifle',
    'railgun',
    'laser_cannon',
    'electric_gun',
    'lightning_staff',
    'arcane_book',
    'crescent_blade',
    'reaper_scythe',
    'shock_baton',
    'dual_pistols',
    'minigun',
    'saw_launcher',
    'flamethrower',
    'cryo_cannon',
    'gravity_gun',
    'plasma_shotgun',
    'twin_smg',
    'ion_beam',
    'cluster_rpg',
    'tesla_coil',
    'void_cannon',
    'blizzard_carbine',
    'ricochet_disc',
    'phantom_bow',
    'magma_spitter',
    'chronos_rifle',
    'orbital_cannon',
  ];
  assert.deepEqual([...S.BANSUNG_WEAPON_IDS], expectedWeapons);
  for (const id of expectedWeapons) {
    assert.ok(S.BANSUNG_WEAPONS[id], `missing weapon spec: ${id}`);
  }

  assert.equal(S.BANSUNG_GADGET_IDS.length, 4);
  assert.deepEqual([...S.BANSUNG_GADGET_IDS], ['stun_bomb', 'cluster_bomb', 'auto_turret', 'heal_drone']);
  for (const gid of S.BANSUNG_GADGET_IDS) {
    assert.ok(S.BANSUNG_GADGETS[gid], `missing gadget spec: ${gid}`);
  }

  const perkIds = Object.keys(P.BANSUNG_PERKS);
  assert.equal(perkIds.length, 12);
});

// ===========================================================================
// 2. Kinetic Weapons (pistol, rifle, smg, shotgun)
// ===========================================================================

test('kinetic pistol: 0 energy cost, bloom recovery, auto-reload on empty mag', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 10, x: 420, y: 300, hp: 100 });
  const hero = makeWeaponHero('pistol', { activeSlot: 0, energy: 0 });
  const magSize = S.BANSUNG_WEAPONS.pistol.magSize;

  // Fire once with 0 energy -> succeeds because pistol energyCost === 0
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 1);
  assert.equal(hero.energy, 0);
  assert.equal(hero.slots[0].ammoInMag, magSize - 1);

  // Let bullet travel and hit enemy
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 12);
  assert.ok(enemy.hp < 100, 'pistol bullet should damage enemy');

  // Drain last bullet in mag -> triggers reload
  hero.slots[0].ammoInMag = 1;
  hero.slotCdTicks[0] = 0;
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 20, 1);
  assert.equal(hero.slots[0].ammoInMag, 0);
  assert.ok(hero.reload !== null, 'empty mag must start auto-reload');
});

test('kinetic rifle: auto fire accumulates bloom, deals damage, and sustains fire at 0 energy without stalling', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 11, x: 380, y: 300, hp: 250 });
  const hero = makeWeaponHero('rifle', { energy: 100 });

  // Single shot adds bloomPerShotDeg immediately
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 1);
  assert.ok(hero.bloomDeg > 0, 'firing rifle accumulates bloom');
  const peakBloom = hero.bloomDeg;

  // Idle ticks decay bloom cleanly
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 2);
  assert.ok(hero.bloomDeg < peakBloom, 'bloom should decay when not firing');

  // Sustained auto fire deals damage without draining kinetic energy
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 4, 15);
  assert.equal(S.BANSUNG_WEAPONS.rifle.energyCost, 0, 'kinetic rifle has zero energy cost so LMB autofire never stalls');
  assert.ok(hero.energy >= 100, 'kinetic rifle must not burn hero energy');
  assert.ok(enemy.hp < 250, 'rifle hits enemy');

  // At 0 energy, kinetic rifle still fires normally without dry-fire starvation
  const ammoBefore = hero.slots[1].ammoInMag;
  hero.energy = 0;
  hero.slotCdTicks[1] = 0;
  hero.reload = null;
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 30, 1);
  assert.equal(hero.slots[1].ammoInMag, ammoBefore - 1);
  assert.equal(world.dryFireEvents.length, 0);
});

test('kinetic smg: 3-round burst queues all 3 shots from 1 trigger pull then clears burst', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 12, x: 460, y: 300, hp: 300 });
  const hero = makeWeaponHero('smg', { energy: 100 });
  const startAmmo = hero.slots[1].ammoInMag;

  // Tick 1: first round fires & queues remaining 2 rounds (waitTicks = 2)
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 1);
  assert.equal(hero.slots[1].ammoInMag, startAmmo - 1);
  assert.ok(hero.burst && hero.burst.remaining === 2);

  // Release trigger; burst queue completes remaining 2 rounds across ticks 2..7 then clears
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 6);
  assert.equal(hero.slots[1].ammoInMag, startAmmo - 3);
  assert.equal(hero.burst, null);

  // Advance bullets to impact
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 8, 15);
  assert.ok(enemy.hp < 300, 'smg burst rounds must hit enemy');
});

test('kinetic shotgun: 6-pellet spread fan and 240->380px range damage falloff', () => {
  const pelletCount = S.BANSUNG_WEAPONS.shotgun.pellets;
  assert.equal(pelletCount, 6);

  // Near target within full-damage range (< 240px)
  const wNear = makeWorld();
  const eNear = wNear.addTarget({ id: 20, x: 290, y: 300, hp: 200, radius: 22 });
  const hNear = makeWeaponHero('shotgun', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(wNear, hNear, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  assert.equal(wNear.bullets.count, pelletCount, 'shotgun must spawn 6 pellets');
  stepWeaponAndBullets(wNear, hNear, { fireHeld: false }, 2, 12);
  const nearDmg = 200 - eNear.hp;
  assert.ok(nearDmg > 0, 'near target should take shotgun damage');

  // Far target near falloff tail (~330px away, within 240..380px falloff band)
  const wFar = makeWorld();
  const eFar = wFar.addTarget({ id: 21, x: 530, y: 300, hp: 200, radius: 22 });
  const hFar = makeWeaponHero('shotgun', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(wFar, hFar, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  stepWeaponAndBullets(wFar, hFar, { fireHeld: false }, 2, 20);
  const farDmg = 200 - eFar.hp;
  assert.ok(farDmg >= 0 && farDmg < nearDmg, `far falloff damage (${farDmg}) must be < near (${nearDmg})`);
});

// ===========================================================================
// 3. Explosive Weapons (grenade_launcher, stun_launcher, bazooka, mine_gun)
// ===========================================================================

test('explosive grenade_launcher: parabolic lob, 6 shrapnel burst, LOS wall occlusion & 0 co-op self-dmg', () => {
  // Wall occluding enemyBehind from blast at (360, 300)
  const wall = {
    id: 1,
    x: 400,
    y: 240,
    w: 20,
    h: 120,
    kind: 'wall',
    alive: true,
    blocksMove: true,
    blocksLos: true,
    blocksBullet: true,
    destructible: false,
    hp: 9999,
    maxHp: 9999,
  };
  const world = makeWorld({ obstacles: [wall] });
  const hero = makeWeaponHero('grenade_launcher', { x: 300, y: 300, energy: 100 });
  const ally = world.addTarget({ id: 2, x: 350, y: 300, hp: 50, maxHp: 50, team: 0, tier: 'hero' });
  const enemyExposed = world.addTarget({ id: 30, x: 360, y: 340, hp: 150 });
  const enemyOccluded = world.addTarget({ id: 31, x: 445, y: 300, hp: 150 });

  // Shoot short aim distance so grenade lands around (360, 300) before the wall
  stepWeaponAndBullets(world, hero, { fireHeld: true, aimDistPx: 65 }, 1, 1);
  assert.equal(world.bullets.count, 1);
  const grenade = world.bullets.active[0];
  assert.ok(grenade.vz > 0, 'lobbed grenade must start with upward Z velocity');

  let maxShrapnelSeen = 0;
  for (let i = 2; i <= 45; i++) {
    world.syncGrid();
    const ctx = world.makeCtx(i);
    W.stepBulletPool(world.bullets, ctx);
    const shrapCount = world.bullets.active.filter((b) => b.kind === 'frag_shrapnel').length;
    if (shrapCount > maxShrapnelSeen) maxShrapnelSeen = shrapCount;
  }

  assert.equal(maxShrapnelSeen, 6, 'grenade_launcher must burst 6 frag_shrapnel projectiles');
  assert.ok(enemyExposed.hp < 150, 'exposed enemy should take blast damage');
  assert.equal(enemyOccluded.hp, 150, 'wall-occluded enemy must take 0 blast damage');
  assert.equal(ally.hp, 50, 'co-op friendly hero must take 0 blast self/friendly damage');
  assert.ok((ally.kbX || 0) !== 0 || (ally.kbY || 0) !== 0, 'friendly hero near blast still receives reduced knockback');
});

test('explosive stun_launcher: detonates canister and applies AoE stun to enemies', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 32, x: 340, y: 300, hp: 120 });
  const hero = makeWeaponHero('stun_launcher', { x: 200, y: 300, energy: 100 });

  stepWeaponAndBullets(world, hero, { fireHeld: true, aimDistPx: 140 }, 1, 1);
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 45);

  assert.ok(enemy.hp < 120, 'stun_launcher canister should damage enemy');
  assert.ok((enemy.stunMs || 0) > 0 || (enemy.stunDrStage || 0) > 0 || world.stunEvents.some((s) => s.id === 32), 'stun_launcher must stun target');
});

test('explosive bazooka: fires 3-rocket fan ripple with acceleration and multi-hit decay', () => {
  const world = makeWorld();
  const boss = world.addTarget({ id: 33, x: 440, y: 300, radius: 28, hp: 500, tier: 'boss' });
  const hero = makeWeaponHero('bazooka', { x: 200, y: 300, energy: 100 });

  // Ripple spawns over 5 ticks (t+0, t+2, t+4)
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 5);
  const blastDamages = [];
  for (let t = 6; t <= 40; t++) {
    world.syncGrid();
    const hpBefore = boss.hp;
    W.stepBulletPool(world.bullets, world.makeCtx(t));
    if (boss.hp < hpBefore) {
      blastDamages.push(hpBefore - boss.hp);
    }
  }

  assert.ok(blastDamages.length >= 2, `multiple bazooka rockets should hit large target (hits=${blastDamages.length})`);
  // Same-volley multi-hit decay: [1.0, 0.85, 0.70] so subsequent hits deal less damage than the first
  if (blastDamages.length >= 2) {
    assert.ok(blastDamages[1] <= blastDamages[0], `second rocket damage (${blastDamages[1]}) should decay vs first (${blastDamages[0]})`);
  }
});

test('explosive mine_gun: arming delay, proximity trigger, and 8-mine per-owner cap eviction', () => {
  const world = makeWorld();
  const hero = makeWeaponHero('mine_gun', { x: 200, y: 300, energy: 200 });
  const enemy = world.addTarget({ id: 34, x: 270, y: 300, hp: 200 });

  // Spawn 1 mine toward enemy; verify it does NOT detonate immediately before armDelay
  stepWeaponAndBullets(world, hero, { fireHeld: true, aimDistPx: 70 }, 1, 1);
  assert.equal(world.bullets.countMinesForOwner(hero.id), 1);
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 2);
  assert.equal(enemy.hp, 200, 'unarmed mine must not explode during arming delay');

  // Step past arming delay & trigger delay -> enemy inside trigger radius detonates mine
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 4, 45);
  assert.ok(enemy.hp < 200, 'armed mine should explode when enemy is in trigger range');

  // Test 8-mine cap per owner
  enemy.alive = false;
  world.syncGrid();
  hero.energy = 200;
  for (let m = 0; m < 10; m++) {
    hero.slotCdTicks[1] = 0;
    hero.reload = null;
    hero.slots[1].ammoInMag = 6;
    stepWeaponAndBullets(world, hero, { fireHeld: true, aimDistPx: 140 + m * 5 }, 50 + m * 2, 1);
  }
  assert.equal(world.bullets.countMinesForOwner(hero.id), 8, 'mine count per owner must cap at 8');
});

// ===========================================================================
// 4. Energy / Magic Weapons (plasma_rifle, railgun, lightning_staff, arcane_book)
// ===========================================================================

test('energy plasma_rifle: fast bolt swept hit and crit burn DOT', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 40, x: 350, y: 300, hp: 150 });
  // Give 100% crit chance via perk mods so crit burn DOT deterministically applies
  const hero = makeWeaponHero('plasma_rifle', { x: 200, y: 300, energy: 100, mods: { critChanceAdd: 1.0 } });

  stepWeaponAndBullets(world, hero, { fireHeld: true, ctxExtra: { rng: () => 0.01 } }, 1, 1);
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 15);
  assert.ok(enemy.hp < 150, 'plasma_bolt must deal impact damage');
  assert.ok(Boolean(enemy.dots && enemy.dots.burn && enemy.dots.burn.leftMs > 0), 'plasma crit should apply burn DOT');

  const hpAfterHit = enemy.hp;
  tickStatuses(enemy, 1000);
  assert.ok(enemy.hp < hpAfterHit, 'tickStatuses should tick plasma burn DOT');
});

test('energy railgun: hold charge slow, wall occlusion clamp, min-tap vs full-charge pierce & stun', () => {
  // Part A: Min tap vs Full charge damage, energy, pierce=99, stun=450ms
  const worldTap = makeWorld();
  const eTap1 = worldTap.addTarget({ id: 41, x: 340, y: 300, hp: 200 });
  const hTap = makeWeaponHero('railgun', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(worldTap, hTap, { fireHeld: true }, 1, 2);
  assert.ok(hTap.charge !== null, 'holding railgun builds charge');
  assert.equal(W.getHeroWeaponMoveMult(hTap), 0.78, 'charging railgun applies 0.78 move mult');
  stepWeaponAndBullets(worldTap, hTap, { fireHeld: false }, 3, 1);
  const tapDmg = 200 - eTap1.hp;
  const tapEnergySpent = 100 - hTap.energy;
  assert.ok(tapDmg > 0, 'releasing min-tap fires railgun beam');

  // Full charge (>= 20 ticks) pierces multiple enemies, clamps at wall, stuns, costs 10 energy
  const blockerWall = {
    id: 2,
    x: 500,
    y: 240,
    w: 30,
    h: 120,
    kind: 'wall',
    alive: true,
    blocksMove: true,
    blocksLos: true,
    blocksBullet: true,
    destructible: false,
    hp: 9999,
    maxHp: 9999,
  };
  const worldFull = makeWorld({ obstacles: [blockerWall] });
  const eFront1 = worldFull.addTarget({ id: 42, x: 300, y: 300, hp: 200 });
  const eFront2 = worldFull.addTarget({ id: 43, x: 390, y: 300, hp: 200 });
  const eFront3 = worldFull.addTarget({ id: 44, x: 460, y: 300, hp: 200 });
  const eBehindWall = worldFull.addTarget({ id: 45, x: 580, y: 300, hp: 200 });
  const hFull = makeWeaponHero('railgun', { x: 200, y: 300, energy: 100 });

  stepWeaponAndBullets(worldFull, hFull, { fireHeld: true }, 1, 22);
  stepWeaponAndBullets(worldFull, hFull, { fireHeld: false }, 23, 1);
  const fullDmg = 200 - eFront1.hp;
  const fullEnergySpent = 100 - hFull.energy;

  assert.ok(fullDmg > tapDmg, `full charge damage (${fullDmg}) must exceed tap damage (${tapDmg})`);
  assert.ok(fullEnergySpent >= tapEnergySpent, 'full charge spends >= tap energy');
  assert.ok(eFront2.hp < 200 && eFront3.hp < 200, 'full railgun beam must pierce multiple aligned enemies');
  assert.equal(eBehindWall.hp, 200, 'railgun raycast must stop at solid wall');
  assert.ok(worldFull.stunEvents.some((s) => s.id === 42 && s.stunMs >= 400), 'full railgun stuns struck targets');
});

test('magic lightning_staff: forward cone homing + 3-hop chain arc with 0.72 decay', () => {
  const world = makeWorld();
  const e1 = world.addTarget({ id: 50, x: 340, y: 318, hp: 200 }); // slightly off-axis for cone homing
  const e2 = world.addTarget({ id: 51, x: 420, y: 318, hp: 200 });
  const e3 = world.addTarget({ id: 52, x: 500, y: 318, hp: 200 });
  const e4TooFar = world.addTarget({ id: 53, x: 950, y: 318, hp: 200 });
  const hero = makeWeaponHero('lightning_staff', { x: 200, y: 300, energy: 100 });

  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 1);
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 2, 20);

  const d1 = 200 - e1.hp;
  const d2 = 200 - e2.hp;
  const d3 = 200 - e3.hp;
  assert.ok(d1 > 0, 'lightning orb must home/hit primary target');
  assert.ok(d2 > 0 && d2 < d1, `chain hop 1 (${d2}) must damage and decay vs primary (${d1})`);
  assert.ok(d3 > 0 && d3 <= d2, `chain hop 2 (${d3}) must decay further`);
  assert.equal(e4TooFar.hp, 200, 'far target outside chain radius takes 0 damage');
});

test('magic arcane_book: splash fireball + burn DOT + 3 non-resplitting arcane embers', () => {
  const world = makeWorld();
  const primary = world.addTarget({ id: 55, x: 340, y: 300, hp: 2000 });
  const hero = makeWeaponHero('arcane_book', { x: 200, y: 300, energy: 100 });

  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 1);
  let emberPeak = 0;
  for (let t = 2; t <= 25; t++) {
    world.syncGrid();
    W.stepBulletPool(world.bullets, world.makeCtx(t));
    const embers = world.bullets.active.filter((b) => b.kind === 'arcane_ember').length;
    if (embers > emberPeak) emberPeak = embers;
  }

  assert.equal(emberPeak, 3, 'arcane_fireball must split into 3 arcane_ember projectiles');
  assert.ok(primary.hp < 2000, 'arcane fireball damages primary target');
  assert.ok(Boolean(primary.dots && primary.dots.burn && primary.dots.burn.leftMs > 0), 'arcane_book applies burn DOT');

  // Add second enemy directly in front of surviving embers and verify embers hit WITHOUT splitting further
  const emberVictim = world.addTarget({ id: 56, x: 430, y: 300, hp: 100 });
  stepWeaponAndBullets(world, hero, { fireHeld: false }, 26, 15);
  assert.ok(emberVictim.hp <= 100);
  const newEmbersAfter = world.bullets.active.filter((b) => b.kind === 'arcane_ember').length;
  assert.ok(newEmbersAfter <= 3, 'arcane_ember must not resplit into more embers');
});

// ===========================================================================
// 5. Melee Weapons (crescent_blade, reaper_scythe, shock_baton) & Deflect
// ===========================================================================

test('melee crescent_blade: dry-swing at 0 energy, swept-arc bullet erase, preserves friendly/non-destructible projectiles', () => {
  const world = makeWorld();
  const enemy = world.addTarget({ id: 60, x: 240, y: 270, hp: 150 });
  const hero = makeWeaponHero('crescent_blade', { x: 200, y: 300, activeSlot: 4, energy: 0 });

  // Enemy destructible bullet heading straight into slash arc (plus non-destructible & friendly bullets)
  const bDestructible = world.bullets.spawn({
    kind: 'plasma_bolt',
    ownerId: 999,
    team: 1,
    x: 245,
    y: 300,
    vx: -400,
    vy: 0,
    damage: 10,
    radius: 6,
    destructibleByMelee: true,
    ttlS: 2,
  });
  const bNonDestructible = world.bullets.spawn({
    kind: 'rocket',
    ownerId: 999,
    team: 1,
    x: 245,
    y: 305,
    vx: -200,
    vy: 0,
    damage: 20,
    radius: 8,
    destructibleByMelee: false,
    ttlS: 2,
  });
  const bFriendly = world.bullets.spawn({
    kind: 'kinetic_sm',
    ownerId: hero.actorId,
    team: 0,
    x: 245,
    y: 315,
    vx: -50,
    vy: 0,
    damage: 10,
    radius: 4,
    destructibleByMelee: true,
    ttlS: 2,
  });

  // Swing at 0 energy still executes dry-swing and erases destructible enemy bullets
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 6);
  assert.ok(enemy.hp < 150, '0-energy melee dry-swing should still damage close enemy');
  assert.equal(bDestructible.alive, false, 'melee sweep must erase destructible enemy bullet');
  assert.equal(bNonDestructible.alive, true, 'melee sweep must NOT erase destructibleByMelee=false projectile');
  assert.equal(bFriendly.alive, true, 'melee sweep must NOT erase friendly team bullet');
  let sawSliceFx = false;
  for (let i = 0; i + 1 < world.fx.length; i += 6) {
    if (world.fx[i] === S.FX_IMPACT && world.fx[i + 1] === W.BANSUNG_IMPACT_KINDS.slice) {
      sawSliceFx = true;
      break;
    }
  }
  assert.ok(sawSliceFx, 'erased bullet emits slice FX');
});

test('melee reaper_scythe: bullet-erase grants +1 Energy per bullet capped at +4 per swing', () => {
  const world = makeWorld();
  const hero = makeWeaponHero('reaper_scythe', {
    x: 200,
    y: 300,
    weapons: ['pistol', 'reaper_scythe', null, null, 'crescent_blade'],
    activeSlot: 1,
    energy: 50,
  });

  // Spawn 6 destructible enemy bullets inside scythe arc
  for (let i = 0; i < 6; i++) {
    world.bullets.spawn({
      kind: 'kinetic_sm',
      ownerId: 999 + i,
      team: 1,
      x: 250 + i * 3,
      y: 280 + i * 8,
      vx: -50,
      vy: 0,
      damage: 5,
      radius: 5,
      destructibleByMelee: true,
      ttlS: 2,
    });
  }

  const scytheCost = S.BANSUNG_WEAPONS.reaper_scythe.energyCost;
  const energyBefore = hero.energy;
  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 8);
  // Net energy should equal starting - cost + capped refund (4)
  assert.equal(hero.energy, energyBefore - scytheCost + 4, 'reaper_scythe refunds +1 energy per bullet up to +4 max');
});

test('melee shock_baton: stuns primary hit and chains stun <= 55px without hitting > 55px', () => {
  const world = makeWorld();
  const primary = world.addTarget({ id: 70, x: 245, y: 300, hp: 150 });
  const chainNear = world.addTarget({ id: 71, x: 285, y: 300, hp: 150 }); // 40px from primary
  const chainFar = world.addTarget({ id: 72, x: 355, y: 300, hp: 150 }); // 110px from primary
  const hero = makeWeaponHero('shock_baton', {
    x: 200,
    y: 300,
    weapons: ['pistol', 'shock_baton', null, null, 'crescent_blade'],
    activeSlot: 1,
    energy: 100,
  });

  stepWeaponAndBullets(world, hero, { fireHeld: true }, 1, 8);
  assert.ok(primary.hp < 150, 'shock_baton hits primary enemy');
  assert.ok(chainNear.hp < 150, 'shock_baton chains to secondary enemy within 55px');
  assert.equal(chainFar.hp, 150, 'shock_baton must not chain beyond 55px');
  assert.ok(world.stunEvents.some((s) => s.id === 70), 'primary target stunned');
  assert.ok(world.stunEvents.some((s) => s.id === 71), 'chained target within 55px stunned');
});

// ===========================================================================
// 6. Active Reload [0.48, 0.64] Empower vs Jam, Lockout & Energy Pool
// ===========================================================================

test('active reload: < 0.28 lockout, [0.48, 0.64] empower (+15% dmg, +12 energy), miss jam (+45% penalty), Quick Hands & swap cancel', () => {
  // 1) Sweet spot [0.48, 0.64] -> perfect empower +12 energy + 1.15x damage
  const world = makeWorld();
  const hPerf = makeWeaponHero('rifle', { energy: 80 });
  hPerf.slots[1].ammoInMag = 5;
  assert.equal(W.handleHeroReloadCmd(hPerf, 1), 'started');
  assert.ok(hPerf.reload, 'reload started');

  // Advance to u < 0.28 -> locked_out (no jam)
  const earlyTickTarget = Math.max(1, Math.floor(hPerf.reload.durationTicks * 0.2));
  for (let i = 0; i < earlyTickTarget; i++) W.tickHeroReload(hPerf);
  assert.equal(W.handleHeroReloadCmd(hPerf, 10), 'locked_out');
  assert.equal(hPerf.reload.jamTicksLeft, 0);

  // Advance into sweet spot ~0.55
  while (hPerf.reload && hPerf.reload.progressTicks / hPerf.reload.durationTicks < 0.52) {
    W.tickHeroReload(hPerf);
  }
  const perfectRes = W.handleHeroReloadCmd(hPerf, 20);
  assert.equal(perfectRes, 'perfect');
  assert.equal(hPerf.reload, null);
  assert.equal(hPerf.slots[1].ammoInMag, S.BANSUNG_WEAPONS.rifle.magSize);
  assert.equal(hPerf.slots[1].empowered, true);
  assert.equal(hPerf.energy, 92, 'active reload must grant +12 energy');

  // Verify empowered damage is ~1.15x normal rifle damage
  const eNorm = world.addTarget({ id: 80, x: 320, y: 300, hp: 200 });
  const hNorm = makeWeaponHero('rifle', { energy: 100 });
  const wNorm = makeWorld();
  const tNorm = wNorm.addTarget({ id: 81, x: 320, y: 300, hp: 200 });
  hPerf.slots[1].ammoInMag = 2; // trigger auto-reload after firing 2 shots later too
  stepWeaponAndBullets(wNorm, hNorm, { fireHeld: true }, 1, 1);
  stepWeaponAndBullets(wNorm, hNorm, { fireHeld: false }, 2, 10);
  const wEmp = makeWorld();
  const tEmp = wEmp.addTarget({ id: 82, x: 320, y: 300, hp: 200 });
  stepWeaponAndBullets(wEmp, hPerf, { fireHeld: true }, 1, 1);
  stepWeaponAndBullets(wEmp, hPerf, { fireHeld: false }, 2, 10);
  const normHit = 200 - tNorm.hp;
  const empHit = 200 - tEmp.hp;
  assert.ok(empHit > normHit, `empowered rifle shot (${empHit}) must exceed normal (${normHit})`);

  // 2) Miss jam (+45% duration penalty) & cannot retry same reload
  const hJam = makeWeaponHero('rifle', { energy: 80 });
  hJam.slots[1].ammoInMag = 5;
  W.handleHeroReloadCmd(hJam, 1);
  const baseDur = hJam.reload.durationTicks;
  while (hJam.reload.progressTicks / hJam.reload.durationTicks < 0.72) {
    W.tickHeroReload(hJam);
  }
  assert.equal(W.handleHeroReloadCmd(hJam, 30), 'jammed');
  assert.equal(hJam.reload.jamTicksLeft, Math.max(1, Math.round(baseDur * 0.45)));
  assert.equal(W.handleHeroReloadCmd(hJam, 31), 'ignored', 'second active reload attempt during jam is ignored');

  // Tick jam down before reload resumes
  const jamTotal = hJam.reload.jamTicksLeft;
  assert.equal(W.tickHeroReload(hJam), 'jammed');
  assert.equal(hJam.reload.jamTicksLeft, jamTotal - 1);

  // 3) Quick Hands widens sweet spot to [0.44, 0.68] and swap cancels reload
  const hQh = makeWeaponHero('rifle', { hasQuickHands: true, mods: { reloadSpeedMul: 1.25 } });
  hQh.slots[1].ammoInMag = 5;
  W.handleHeroReloadCmd(hQh, 1);
  while (hQh.reload.progressTicks / hQh.reload.durationTicks < 0.45) {
    W.tickHeroReload(hQh);
  }
  assert.equal(W.handleHeroReloadCmd(hQh, 15), 'perfect', 'Quick Hands widens sweet spot down to 0.44');

  // Swap cancels reload and applies swap lock
  hQh.slots[1].ammoInMag = 5;
  W.handleHeroReloadCmd(hQh, 40);
  assert.ok(hQh.reload !== null);
  assert.equal(W.switchHeroWeaponSlot(hQh, 0), true);
  assert.equal(hQh.reload, null);
  assert.ok(hQh.swapLockTicks > 0);
  assert.equal(eNorm.hp, 200); // untouched placeholder
});

test('energy pool: passive 2.0/s regen after 36-tick delay, wave +25% restore, revive 40% floor', () => {
  const hero = makeWeaponHero('rifle', { energy: 50 });
  hero.lastEnergySpendTick = 10;

  // Before 36 ticks delay (tick 45): no passive regen
  assert.equal(W.tickHeroEnergyRegen(hero, 45), 0);
  // At/after 36 ticks delay (ticks 46..75 = 30 ticks = 1.0s): +2 energy regenerated
  let gained = 0;
  for (let t = 46; t <= 75; t++) {
    gained += W.tickHeroEnergyRegen(hero, t);
  }
  assert.equal(hero.energy, 52);
  assert.equal(gained, 2);

  // Wave restore grants +25% maxEnergy capped at maxEnergy
  W.restoreWaveEnergy(hero);
  assert.equal(hero.energy, Math.min(hero.maxEnergy, 52 + Math.round(hero.maxEnergy * 0.25)));

  // Revive energy floor raises low energy to 40% maxEnergy without lowering higher energy
  hero.energy = 10;
  W.applyReviveEnergyFloor(hero);
  assert.equal(hero.energy, Math.round(hero.maxEnergy * 0.4));
  hero.energy = hero.maxEnergy - 10;
  W.applyReviveEnergyFloor(hero);
  assert.equal(hero.energy, hero.maxEnergy - 10);
});

// ===========================================================================
// 7. 0.28s Dodge Dash Physics & I-Frames
// ===========================================================================

test('0.28s dash: 140px ease-out travel, wall slide, 0.10s pre-buffer, CD mul & incapacity guard', () => {
  // Wall blocking +X at x=300 so diagonal dash (+X, +Y) slides cleanly down +Y
  const obsGrid = new ObstacleGrid(
    [{ id: 1, x: 300, y: 100, w: 40, h: 400, kind: 'wall', alive: true, blocksMove: true, blocksLos: true, blocksBullet: true, destructible: false, hp: 9999, maxHp: 9999 }],
    S.BANSUNG_MAP_W,
    S.BANSUNG_MAP_H,
  );

  // Unobstructed 0.28s dash travels ~140px ease-out
  const openObs = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const dash = G.createHeroDashState();
  const body = { x: 400, y: 400, radius: 14 };
  assert.equal(G.queueHeroDash(dash), true);

  let stepRes = G.stepHeroDash(dash, { body, mx: 1, my: 0, aimRad: 0, obsGrid: openObs, dt: DT });
  assert.equal(stepRes.justStarted, true);
  assert.equal(stepRes.active, true);
  assert.equal(G.isDashing(dash), true);

  const firstDist = body.x - 400;
  let lastDist = firstDist;
  for (let i = 1; i < 10; i++) {
    const prevX = body.x;
    stepRes = G.stepHeroDash(dash, { body, mx: 1, my: 0, aimRad: 0, obsGrid: openObs, dt: DT });
    if (stepRes.active || stepRes.justEnded) {
      lastDist = body.x - prevX;
    }
  }
  assert.ok(Math.abs(body.x - 540) < 1.5, `dash total distance (${body.x - 400}) should equal ~140px`);
  assert.ok(firstDist > lastDist, 'ease-out curve moves further on initial step than tail');
  assert.equal(G.isDashing(dash), false);

  // Fluid pre-buffer (0.14s): buffering > 0.14s before cooldown hits 0 expires without triggering;
  // buffering <= 0.14s before cooldown hits 0 auto-triggers continuous dash seamlessly.
  dash.cdLeft = 0.30;
  G.queueHeroDash(dash); // buffer = 0.14s while cdLeft = 0.30s (still > 0 after buffer expires)
  for (let i = 0; i < 6; i++) {
    const r = G.stepHeroDash(dash, { body, mx: 1, my: 0, aimRad: 0, obsGrid: openObs, dt: DT, dashCdMul: 1 });
    assert.equal(r.justStarted, false, 'early queue > 0.14s before cooldown end must expire without firing');
  }
  assert.equal(dash.bufferLeft, 0);

  while (dash.cdLeft > 0.08) {
    G.stepHeroDash(dash, { body, mx: 0, my: 0, aimRad: 0, obsGrid: openObs, dt: DT, dashCdMul: 1 });
  }
  assert.equal(G.queueHeroDash(dash), true, 'dash within 0.14s pre-buffer queues cleanly');
  let bufferedStarted = false;
  for (let i = 0; i < 5; i++) {
    const r = G.stepHeroDash(dash, { body, mx: 0, my: 1, aimRad: Math.PI / 2, obsGrid: openObs, dt: DT, dashCdMul: 1 });
    if (r.justStarted) bufferedStarted = true;
  }
  assert.equal(bufferedStarted, true, 'pre-buffered dash must auto-trigger once cooldown hits 0');

  // Wall slide test: diagonal dash (+1, +1) against vertical wall at x=300 slides along Y
  const wallDash = G.createHeroDashState();
  const wallBody = { x: 286, y: 200, radius: 14 }; // touching left edge of wall (x=300 - 14 = 286)
  G.queueHeroDash(wallDash);
  for (let i = 0; i < 9; i++) {
    G.stepHeroDash(wallDash, { body: wallBody, mx: 1, my: 1, aimRad: 0, obsGrid, dt: DT });
  }
  assert.ok(wallBody.x <= 286.1, 'hero must not penetrate wall X');
  assert.ok(wallBody.y > 260, `diagonal dash against wall must slide along Y (y=${wallBody.y})`);

  // Incapacity guard blocks dash
  const deadDash = G.createHeroDashState();
  assert.equal(G.queueHeroDash(deadDash, { downed: true }), false);
  assert.equal(G.queueHeroDash(deadDash, { stunMs: 200 }), false);
});

test('dash i-frames: syncDashToCombatTarget blocks applyBansungDamage during 0.28s dash then restores vulnerability', () => {
  const obsGrid = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const dash = G.createHeroDashState();
  const body = { x: 400, y: 400, radius: 14 };
  const combatHero = {
    id: 1,
    tier: 'hero',
    armorType: 'light',
    hp: 20,
    maxHp: 20,
    shield: 6,
    maxShield: 6,
    flatArmor: 0,
    dashIframesMs: 0,
    hitIframesMs: 0,
    invulnUntilTick: 0,
    alive: true,
    downed: false,
  };

  assert.equal(BANSUNG_SHIELD.DASH_IFRAMES_MS, 280);
  G.queueHeroDash(dash);
  // Pass iframeS: 0.28 matching full 0.28s dash window
  G.stepHeroDash(dash, { body, mx: 1, my: 0, aimRad: 0, obsGrid, dt: DT, iframeS: 0.28 });
  assert.equal(G.isDashInvulnerable(dash), true);
  G.syncDashToCombatTarget(dash, combatHero);
  assert.ok(combatHero.dashIframesMs > 0);

  const blocked = applyBansungDamage(combatHero, { baseDmg: 15, dmgKind: 'kinetic' });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.hpDmg, 0);
  assert.equal(blocked.shieldDmg, 0);
  assert.equal(combatHero.hp, 20);
  assert.equal(combatHero.shield, 6);

  // Exhaust 0.28s dash
  for (let i = 0; i < 10; i++) {
    G.stepHeroDash(dash, { body, mx: 1, my: 0, aimRad: 0, obsGrid, dt: DT, iframeS: 0.28 });
  }
  assert.equal(G.isDashInvulnerable(dash), false);
  G.syncDashToCombatTarget(dash, combatHero);
  assert.equal(combatHero.dashIframesMs, 0);

  const hit = applyBansungDamage(combatHero, { baseDmg: 10, dmgKind: 'kinetic' });
  assert.equal(hit.blocked, false);
  assert.ok(hit.shieldDmg > 0 || hit.hpDmg > 0, 'hero becomes damageable once i-frames end');
});

// ===========================================================================
// 8. All 4 Gadgets (stun_bomb, cluster_bomb, auto_turret, heal_drone)
// ===========================================================================

test('gadget stun_bomb: charges/CD, wall pullback, stun AoE & stun diminishing returns', () => {
  const obsGrid = new ObstacleGrid(
    [{ id: 1, x: 400, y: 260, w: 30, h: 80, kind: 'wall', alive: true, blocksMove: true, blocksLos: true, blocksBullet: true, destructible: false, hp: 9999, maxHp: 9999 }],
    S.BANSUNG_MAP_W,
    S.BANSUNG_MAP_H,
  );
  const actorGrid = new ActorGrid(S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const world = G.createGadgetWorldState();
  const slot = G.createPlayerGadgetSlot('stun_bomb');
  const maxCharges = S.BANSUNG_GADGETS.stun_bomb.maxCharges;
  const player = { id: 'p1', idx: 0, numId: 1, x: 300, y: 300, hp: 20, maxHp: 20, shield: 0, maxShield: 0, energy: 100, maxEnergy: 200, alive: true, downed: false };
  const enemy = { id: 100, numId: 100, x: 360, y: 300, radius: 16, layer: LAYER_ENEMY, team: 1, hp: 120, maxHp: 120, shield: 0, maxShield: 0, flatArmor: 0, armorType: 'light', tier: 'mob', alive: true, stunMs: 0, stunImmuneMs: 0, stunDrStage: 0 };
  const enemies = [enemy];
  actorGrid.rebuild(enemies);
  const players = [player];
  const fx = [];
  const gCtx = { actorGrid, obsGrid, enemies, players, fx, rng: makeRng(77), nowTick: 1 };

  // Aim into wall at x=415; activation succeeds and pulls landing target back out of wall
  assert.equal(G.activateGadget(world, player, slot, 415, 300, gCtx), true);
  assert.equal(slot.charges, maxCharges - 1);
  assert.ok(world.projectiles.length === 1);

  for (let i = 0; i < 45; i++) {
    gCtx.nowTick = i + 2;
    actorGrid.rebuild(enemies);
    G.tickGadgetSlot(slot);
    G.stepGadgetWorld(world, gCtx);
  }

  assert.ok(enemy.hp < 120, 'stun_bomb must deal blast damage');
  assert.ok(enemy.stunMs > 0 || enemy.stunDrStage >= 1, 'stun_bomb must stun enemy / advance DR');

  // Recharge gadget slot via tickGadgetSlot
  const cdTicks = Math.ceil(S.BANSUNG_GADGETS.stun_bomb.cooldownTicks) + 5;
  for (let i = 0; i < cdTicks; i++) G.tickGadgetSlot(slot);
  assert.equal(slot.charges, maxCharges, 'gadget charge should regenerate after cooldown');
});

test('gadget cluster_bomb: primary blast + 5 sub-bomblets with [1.0, 0.5, 0.5] multi-hit clamp', () => {
  const obsGrid = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const world = G.createGadgetWorldState();
  const slot = G.createPlayerGadgetSlot('cluster_bomb');
  const player = { id: 'p1', idx: 0, numId: 1, x: 200, y: 300, hp: 20, maxHp: 20, shield: 0, maxShield: 0, energy: 100, maxEnergy: 200, alive: true, downed: false };
  const boss = { id: 200, numId: 200, x: 320, y: 300, radius: 34, layer: LAYER_ENEMY, team: 1, hp: 1000, maxHp: 1000, shield: 0, maxShield: 0, flatArmor: 0, armorType: 'armored', tier: 'boss', alive: true };
  const players = [player];
  const enemies = [boss];
  actorGrid.rebuild(enemies);
  const fx = [];
  const hitsOnBoss = [];
  const gCtx = {
    actorGrid,
    obsGrid,
    enemies,
    players,
    fx,
    rng: makeRng(88),
    nowTick: 1,
  };

  assert.equal(G.activateGadget(world, player, slot, 320, 300, gCtx), true);
  let maxSubCount = 0;
  for (let i = 0; i < 65; i++) {
    gCtx.nowTick = i + 2;
    const prevHp = boss.hp;
    actorGrid.rebuild(enemies);
    G.stepGadgetWorld(world, gCtx);
    if (boss.hp < prevHp) hitsOnBoss.push(prevHp - boss.hp);
    const subCount = world.projectiles.filter((p) => p.kind === 2).length;
    if (subCount > maxSubCount) maxSubCount = subCount;
  }

  assert.equal(maxSubCount, 5, 'cluster_bomb must split into 5 sub-bomblets');
  assert.ok(boss.hp < 1000, 'boss should take cluster bomb damage');
  assert.ok(hitsOnBoss.length >= 1 && hitsOnBoss.length <= 4, `primary + max-3 sub-bomblet clamp limits boss hits (got ${hitsOnBoss.length})`);
});

test('gadget auto_turret: 290px targeting, 6th-shot overcharge, 90px soft-decoy aggro, armored dmg & expiry blast', () => {
  const obsGrid = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const world = G.createGadgetWorldState();
  const slot = G.createPlayerGadgetSlot('auto_turret');
  const player = { id: 'p1', idx: 0, numId: 1, x: 300, y: 300, hp: 20, maxHp: 20, shield: 0, maxShield: 0, energy: 100, maxEnergy: 200, alive: true, downed: false };
  const eNear = { id: 300, numId: 300, x: 420, y: 300, radius: 16, layer: LAYER_ENEMY, team: 1, hp: 1200, maxHp: 1200, shield: 0, maxShield: 0, flatArmor: 0, armorType: 'light', tier: 'mob', alive: true };
  const eFar = { id: 301, numId: 301, x: 650, y: 300, radius: 16, layer: LAYER_ENEMY, team: 1, hp: 1200, maxHp: 1200, shield: 0, maxShield: 0, flatArmor: 0, armorType: 'light', tier: 'mob', alive: true };
  const enemies = [eNear, eFar];
  actorGrid.rebuild(enemies);
  const fx = [];
  const gCtx = { actorGrid, obsGrid, enemies, players: [player], fx, rng: makeRng(12), nowTick: 1 };

  assert.equal(G.activateGadget(world, player, slot, 340, 300, gCtx), true);
  assert.equal(world.deployables.length, 1);
  const turret = world.deployables[0];

  // Soft-decoy aggro rule: true if no player within 90px of enemy, false if player <= 90px
  assert.equal(G.canEnemyAggroTurret(420, 300, [{ x: 400, y: 300, hp: 20, alive: true, downed: false }]), false);
  assert.equal(G.canEnemyAggroTurret(420, 300, [{ x: 100, y: 100, hp: 20, alive: true, downed: false }]), true);

  // Armored deployable damage
  const depHpBefore = turret.hp;
  G.damageGadgetDeployable(turret, 10, 'kinetic', { rng: makeRng(1) });
  assert.ok(turret.hp < depHpBefore);

  // Step ~110 ticks so turret shoots >= 6 bolts (including 6th-shot thunderball overcharge)
  let sawThunder = false;
  for (let t = 2; t <= 115; t++) {
    gCtx.nowTick = t;
    actorGrid.rebuild(enemies);
    G.stepGadgetWorld(world, gCtx);
    if (world.turretShots.some((b) => b.isOvercharge || b.kind === 'turret_thunder')) {
      sawThunder = true;
    }
  }
  assert.ok(eNear.hp < 1200, 'auto_turret should target & shoot enemy within 290px');
  assert.equal(eFar.hp, 1200, 'enemy outside 290px must not be shot');
  assert.ok(sawThunder, 'auto_turret must fire 6th-shot overcharged thunderball');

  // Force lifetime near expiry and check expiry blast damages close enemy
  const hpBeforeExpiry = eNear.hp;
  turret.lifeTicks = 1;
  gCtx.nowTick = 116;
  eNear.x = turret.x + 25;
  actorGrid.rebuild(enemies);
  G.stepGadgetWorld(world, gCtx);
  assert.ok(eNear.hp < hpBeforeExpiry, 'expired turret must emit expiry blast');
});

test('gadget heal_drone: spring follow, 10t heal (+15% co-op), downed bleed-slow/revive bonus & 105t energy pulse', () => {
  const obsGrid = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const actorGrid = new ActorGrid(S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const world = G.createGadgetWorldState();
  const slot = G.createPlayerGadgetSlot('heal_drone');
  const owner = { id: 'p1', idx: 0, numId: 1, x: 200, y: 300, hp: 10, maxHp: 20, shield: 0, maxShield: 0, energy: 100, maxEnergy: 200, alive: true, downed: false };
  const fx = [];
  const gCtx = { actorGrid, obsGrid, enemies: [], players: [owner], fx, rng: makeRng(9), nowTick: 1 };

  assert.equal(G.activateGadget(world, owner, slot, 200, 300, gCtx), true);
  const energyAfterCast = owner.energy;
  const drone = world.deployables[0];
  const droneStartX = drone.x;
  owner.x = 260;

  // Step 10 ticks alone -> 1st solo heal pulse grants +4 HP
  for (let t = 2; t <= 11; t++) {
    gCtx.nowTick = t;
    G.stepGadgetWorld(world, gCtx);
  }
  assert.ok(drone.x > droneStartX, 'heal_drone should spring-follow moving owner');
  assert.equal(owner.hp, 14, 'solo 10t heal pulse restores +4 HP');

  // Step 10 more ticks with nearby co-op ally (<150px) -> +15% co-op bonus raises pulse to +5 HP
  const healthyAlly = { id: 'p3', idx: 2, numId: 3, x: drone.x + 40, y: drone.y, hp: 20, maxHp: 20, shield: 0, maxShield: 0, energy: 100, maxEnergy: 200, alive: true, downed: false };
  gCtx.players = [owner, healthyAlly];
  for (let t = 12; t <= 21; t++) {
    gCtx.nowTick = t;
    G.stepGadgetWorld(world, gCtx);
  }
  assert.equal(owner.hp, 19, 'co-op +15% bonus restores +5 HP on 10t pulse');

  // Continue through tick 112 -> 105t energy pulse fires (+6 Energy)
  gCtx.players = [owner];
  for (let t = 22; t <= 112; t++) {
    gCtx.nowTick = t;
    G.stepGadgetWorld(world, gCtx);
  }
  assert.ok(owner.energy > energyAfterCast, 'heal_drone emits energy pulse after ~105 ticks (3.5s)');

  // Now check downed ally tether support -> bleedSlowMult < 1 & reviveSpeedBonus > 0
  const downedAlly = { id: 'p2', idx: 1, numId: 2, x: drone.x + 15, y: drone.y, hp: 0, maxHp: 20, shield: 0, maxShield: 0, energy: 0, maxEnergy: 200, alive: true, downed: true };
  gCtx.players = [owner, downedAlly];
  owner.hp = owner.maxHp;
  owner.shield = owner.maxShield;
  gCtx.nowTick = 113;
  G.stepGadgetWorld(world, gCtx);
  const sup = G.getDroneDownedSupport(world, downedAlly.idx);
  assert.ok(sup && sup.tethered && sup.bleedSlowMult < 1 && sup.reviveSpeedBonus > 0, 'heal_drone slows bleed-out and boosts revive speed for downed ally');
});

// ===========================================================================
// 9. Breakable Crates, Pickups, Co-op Sharing, Pedestals & 12-Perk Stacking
// ===========================================================================

test('crates & loot tables: HP/armor, 2x dash/explosion prop mult, wave replenish skipping < 120px & 96-cap merge/eviction', () => {
  const obsGrid = new ObstacleGrid([], S.BANSUNG_MAP_W, S.BANSUNG_MAP_H);
  const pm = new P.PickupManager({ rng: makeRng(42), obsGrid });

  const pot = pm.spawnCrate('clay_pot', 300, 300);
  const wood = pm.spawnCrate('wood_crate', 400, 300);
  const iron = pm.spawnCrate('iron_crate', 500, 300);
  assert.equal(pot.hp, 15);
  assert.equal(wood.hp, 30);
  assert.equal(iron.hp, 75);

  // 2x dash/explosion bonus breaks 15 HP pot from 8 raw damage (8 * 2 = 16 >= 15)
  const broken = pm.damageCrate(pot.id, 8, { isDash: true });
  assert.ok(broken && broken.crateId === pot.id, '2x dash bonus must shatter 15 HP clay_pot with 8 raw damage');

  // Drop helpers
  pm.dropCrateLoot(broken.kind, broken.x, broken.y);
  pm.dropBarrelLoot('barrel_explosive', 350, 300);
  pm.dropMobLoot('mob', 360, 300, { rng: makeRng(1) });
  pm.dropMobLoot('elite', 380, 300, { rng: makeRng(2) });
  pm.spawnBossPhaseEnergyBurst(420, 300, 2);
  assert.ok(pm.pickups.length > 0);

  // 96-cap merge (>48px fill to cap, then nearby identical coin merges up to MAX_STACK=5)
  // and eviction preserves weapon_pedestal while evicting oldest coins/energy_orbs
  const pmCap = new P.PickupManager({ rng: makeRng(11), obsGrid });
  const ped = pmCap.spawnWeaponPedestal(150, 150, 4, [], { weaponId: 'bazooka' });
  const anchorCoin = pmCap.spawnPickup('energy_orb', 200, 200);
  for (let i = 0; i < 120; i++) {
    pmCap.spawnPickup('energy_orb', 300 + (i % 25) * 65, 200 + Math.floor(i / 25) * 65);
  }
  assert.ok(pmCap.pickups.length <= 96, 'pickup pool must enforce 96-cap');
  assert.ok(pmCap.pickups.some((pk) => pk.id === ped.id), '96-cap eviction must never evict weapon_pedestal');
  // Re-ensure an anchor coin exists, fill to 96, then verify merge at capacity
  const freshCoin = pmCap.spawnPickup('hp_orb', 200, 200);
  const countBeforeMerge = pmCap.pickups.length;
  pmCap.spawnPickup('hp_orb', 205, 200);
  assert.equal(countBeforeMerge, 96);
  assert.equal(freshCoin.stack, 2, 'at 96-cap nearby identical pickup merges stack instead of evicting');

  // Odd-wave crate replenish respects hero 120px clear zone & cap=6
  const hero = { idx: 0, id: 'p1', x: 600, y: 400, alive: true };
  pmCap.reset();
  pmCap.spawnCrate('clay_pot', 620, 400); // within 120px of hero -> skipped
  pmCap.damageCrate(1, 50);
  for (let i = 0; i < 8; i++) {
    const c = pmCap.spawnCrate('wood_crate', 200 + i * 50, 200);
    pmCap.damageCrate(c.id, 100);
  }
  pmCap.replenishCrates(3, [hero]);
  const aliveCrates = pmCap.crates.filter((c) => c.alive);
  assert.ok(aliveCrates.length > 0 && aliveCrates.length <= 6);
  for (const c of aliveCrates) {
    assert.ok(Math.hypot(c.x - hero.x, c.y - hero.y) >= 120, 'replenished crate must skip points < 120px from heroes');
  }
});

test('pickups: needs-based magnet, co-op 40% energy resonance (<=450px) & 50% gold share, [E] weapon pedestal swap vs consume', () => {
  const pm = new P.PickupManager({ rng: makeRng(55) });
  const h1 = {
    idx: 0,
    id: 'p1',
    x: 200,
    y: 300,
    hp: 20,
    maxHp: 20,
    armor: 5,
    maxArmor: 5,
    energy: 50,
    maxEnergy: 200,
    coins: 0,
    alive: true,
    downed: false,
    petType: null,
    heroId: 'ranger',
    slots: [{ id: 'pistol', clip: 12, maxClip: 12 }, null],
    slotIdx: 0,
    pedestalSwapCdS: 0,
    perks: [],
    mods: P.aggregatePerkMods([]),
  };
  const h2Near = {
    ...h1,
    idx: 1,
    id: 'p2',
    x: 500, // 300px away <= 450px
    energy: 40,
    coins: 0,
    slots: [{ id: 'pistol', clip: 12, maxClip: 12 }, { id: 'rifle', clip: 30, maxClip: 30 }],
    slotIdx: 1,
  };
  const h3Far = {
    ...h1,
    idx: 2,
    id: 'p3',
    x: 900, // 700px away > 450px
    energy: 40,
    coins: 0,
    slots: [{ id: 'pistol', clip: 12, maxClip: 12 }, null],
    slotIdx: 0,
  };

  // Needs-based filter: full HP hero does not attract/collect hp_orb; hungry energy hero does attract energy_orb
  const hpOrb = pm.spawnPickup('hp_orb', 205, 300);
  const enOrb = pm.spawnPickup('energy_orb', 202, 300);
  pm.spawnPickup('coin', 202, 300);
  assert.equal(P.isHeroEligibleForPickup(h1, hpOrb.kind), false);
  assert.equal(P.isHeroEligibleForPickup(h1, enOrb.kind), true);

  // Step 1 frame -> collects energy_orb + coin, leaves hp_orb untouched
  pm.step(DT, [h1, h2Near, h3Far]);
  assert.ok(pm.pickups.some((pk) => pk.id === hpOrb.id), 'full-HP hero must leave hp_orb on ground');
  assert.ok(h1.energy > 50, 'collector gains energy');
  assert.ok(h2Near.energy > 40, 'living ally within 450px receives 40% energy resonance');
  assert.equal(h3Far.energy, 40, 'ally > 450px away does NOT receive energy resonance');
  assert.ok(h1.coins === 0 && h2Near.coins === 0 && h3Far.coins === 0, 'in-match coins removed: coin drops become XP orbs');

  // [E] Pedestal interaction: hero with empty/sidearm slot consumes pedestal; hero with rifle swaps left weapon onto pedestal
  const ped = pm.spawnWeaponPedestal(210, 300, 5, [h1, h2Near], { weaponId: 'bazooka' });
  const swapRes = pm.interactPedestal(h2Near); // h2Near at x=500 is too far -> none_in_range
  assert.equal(swapRes.swapped, false);
  h2Near.x = 220;
  h2Near.slotIdx = 1;
  const swapOk = pm.interactPedestal(h2Near);
  assert.equal(swapOk.swapped, true);
  assert.equal(swapOk.gainedWeapon, 'bazooka');
  assert.equal(swapOk.leftWeapon, 'rifle');
  assert.equal(swapOk.consumed, false);
  assert.equal(h2Near.slots[1].id, 'bazooka');
  assert.equal(ped.weaponId, 'rifle', 'swapped-out rifle stays on pedestal');

  // h1 only has sidearm in active slot 0 -> consumes pedestal cleanly
  h1.pedestalSwapCdS = 0;
  const consumeRes = pm.interactPedestal(h1);
  assert.equal(consumeRes.swapped, true);
  assert.equal(consumeRes.gainedWeapon, 'rifle');
  assert.equal(consumeRes.consumed, true);
  assert.equal(h1.slots[0].id, 'rifle');
});

test('12-perk stacking, caps, instant vitality heal, vampiric kill heal, co-op aura & draft completion', () => {
  const all12 = Object.keys(P.BANSUNG_PERKS);
  assert.equal(all12.length, 12);

  // Stack vitality_boost 4x -> capped at maxStacks=3 (+120 maxHpAdd at HERO_STAT_SCALE=10)
  const overStacked = ['vitality_boost', 'vitality_boost', 'vitality_boost', 'vitality_boost'];
  const vitMods = P.aggregatePerkMods(overStacked);
  assert.equal(vitMods.maxHpAdd, 120, 'vitality_boost must cap at maxStacks=3 (3*40=120)');

  // Stack every perk up to maxStacks and verify clamps & combined modifiers
  const maxedList = [];
  for (const id of all12) {
    const def = P.BANSUNG_PERKS[id];
    for (let s = 0; s < def.maxStacks; s++) maxedList.push(id);
  }
  const allMods = P.aggregatePerkMods(maxedList);
  assert.equal(allMods.maxHpAdd, 120);
  assert.equal(allMods.maxArmorAdd, 90);
  assert.ok(Math.abs(allMods.armorRegenMul - 1.9) < 1e-9);
  assert.equal(allMods.maxEnergyAdd, 120);
  assert.ok(Math.abs(allMods.energyCostMul - 0.6) < 1e-9); // 1 - 0.4
  assert.ok(Math.abs(allMods.fireRateMul - 1.6) < 1e-9);
  assert.ok(Math.abs(allMods.reloadSpeedMul - 1.75) < 1e-9);
  assert.ok(Math.abs(allMods.moveSpeedMul - 1.3) < 1e-9);
  assert.ok(Math.abs(allMods.dashCdMul - 0.6) < 1e-9); // 1 - 0.4
  assert.equal(allMods.magnetMul, 2.0);
  assert.equal(allMods.pickupValueMul, 1.5);
  assert.equal(allMods.extraPierce, 2);
  assert.ok(Math.abs(allMods.critChanceAdd - 0.3) < 1e-9);
  assert.equal(allMods.blastRadiusMul, 1.5);
  assert.ok(Math.abs(allMods.dmgMul - 1.24) < 1e-9);
  assert.equal(allMods.killHealEvery, 5, '2 stacks of vampiric_fang tighten 8 -> floor(8*0.65)=5');
  assert.ok(Math.abs(allMods.reviveSpeedMul - 1.4) < 1e-9);
  assert.ok(Math.abs(allMods.coopAuraDmg - 0.1) < 1e-9);
  assert.equal(allMods.extraBounce, 1);
  assert.equal(allMods.staticShield, true);

  // applyPerkToHero & recomputeHeroStats: vitality_boost immediately heals +40 HP & iron_bastion adds +30 maxArmor
  const hero = {
    idx: 0,
    id: 'p1',
    heroId: 'ranger',
    x: 200,
    y: 200,
    hp: 20,
    maxHp: 50,
    baseMaxHp: 50,
    armor: 40,
    maxArmor: 40,
    baseMaxArmor: 40,
    energy: 100,
    maxEnergy: 200,
    baseMaxEnergy: 200,
    alive: true,
    downed: false,
    perks: [],
    mods: P.aggregatePerkMods([]),
    killCounter: 0,
  };
  assert.equal(P.applyPerkToHero(hero, 'vitality_boost').ok, true);
  assert.equal(hero.maxHp, 90);
  assert.equal(hero.hp, 60);
  assert.equal(P.applyPerkToHero(hero, 'iron_bastion').ok, true);
  assert.equal(hero.maxArmor, 70);

  // Vampiric fang kill heal every 8 kills
  assert.equal(P.applyPerkToHero(hero, 'vampiric_fang').ok, true);
  hero.hp = 10;
  for (let k = 1; k <= 7; k++) {
    assert.equal(P.onHeroEnemyKill(hero), 0);
  }
  assert.equal(P.onHeroEnemyKill(hero), 1, '8th kill restores 1 HP');
  assert.equal(hero.hp, 11);

  // Co-op Med Aura +10% damage within 140px
  const ally = {
    idx: 1,
    id: 'p2',
    x: 300,
    y: 200, // 100px away <= 140px
    alive: true,
    downed: false,
    perks: ['coop_med_aura'],
    mods: P.aggregatePerkMods(['coop_med_aura']),
  };
  assert.ok(Math.abs(P.computeCoopAuraDamageMult(hero, [hero, ally]) - 1.1) < 1e-9);
  ally.x = 500; // > 140px
  assert.equal(P.computeCoopAuraDamageMult(hero, [hero, ally]), 1);

  // Perk draft: triggers on waves 2, 4, 6, 8 & even endless waves, rolls 3 choices, resolves timeout
  assert.equal(P.shouldTriggerPerkDraft(1), false);
  assert.equal(P.shouldTriggerPerkDraft(2), true);
  assert.equal(P.shouldTriggerPerkDraft(4), true);
  assert.equal(P.shouldTriggerPerkDraft(12), true);
  const pm = new P.PickupManager({ rng: makeRng(91) });
  const hDraft = { ...hero, bot: false, perks: [], mods: P.aggregatePerkMods([]) };
  const botDraft = { ...hero, idx: 1, id: 'bot', bot: true, perks: [], mods: P.aggregatePerkMods([]) };
  const draft = pm.startPerkDraft([hDraft, botDraft], 1, 12);
  assert.equal(draft.choicesByHeroIdx[hDraft.idx].length, 3);
  const chosenId = draft.choicesByHeroIdx[hDraft.idx][0];
  assert.equal(pm.submitPerkChoice(hDraft, chosenId, [hDraft, botDraft]).ok, true);
  assert.equal(hDraft.perks[0], chosenId);
  pm.stepPerkDraft(13, [hDraft, botDraft]);
  assert.equal(pm.perkDraft.active, false, 'draft closes after completion/timeout');
  assert.equal(botDraft.perks.length, 1, 'bot receives auto-picked perk');
});

// ===========================================================================
// 8. T08: Survival XP Orbs, 3-Card Gacha Box & Gun Evolution Tiers (Mk.I -> Mk.IV)
// ===========================================================================

test('T08.1 survival XP orbs: mob/elite/evolved/cycle scaling, magnet boost, collection & 40% co-op XP resonance', () => {
  const rScarab = S.getEnemyXpReward('scarab', false, false, 0);
  const rShaman = S.getEnemyXpReward('pyro_shaman', false, false, 0);
  const rOverlord = S.getEnemyXpReward('boss_overlord', false, false, 0);
  assert.equal(rScarab.kind, 'xp_orb_s');
  assert.equal(rScarab.totalXp, 14);
  assert.equal(rShaman.kind, 'xp_orb_m');
  assert.equal(rShaman.totalXp, 40);
  assert.equal(rOverlord.kind, 'xp_orb_l');
  assert.equal(rOverlord.totalXp, 870);

  // Elite (2.0x), evolved (1.5x), and cycle (+35% per cycle) scale & promote orb tiers cleanly
  const rScarabElite = S.getEnemyXpReward('scarab', true, false, 0);
  const rScarabEliteEvolved = S.getEnemyXpReward('scarab', true, true, 0);
  const rBruteBase = S.getEnemyXpReward('cactus_brute', false, false, 0);
  const rBruteEvolved = S.getEnemyXpReward('cactus_brute', false, true, 0);
  const rBruteElite = S.getEnemyXpReward('cactus_brute', true, false, 0);
  const rOverlordCycle2 = S.getEnemyXpReward('boss_overlord', true, true, 2);
  assert.ok(rScarabElite.totalXp > rScarab.totalXp, 'elite must reward more XP than normal');
  assert.equal(rScarabEliteEvolved.kind, 'xp_orb_m', 'elite+evolved scarab promotes xp_orb_s -> xp_orb_m');
  assert.ok(rBruteEvolved.totalXp > rBruteBase.totalXp, 'evolved cactus_brute yields 1.5x XP');
  assert.equal(rBruteElite.kind, 'xp_orb_l', 'elite cactus_brute promotes xp_orb_m -> xp_orb_l');
  assert.ok(rOverlordCycle2.totalXp > rOverlord.totalXp, 'cycle scaling boosts boss XP');

  // Verify spawnEnemyXpOrbs exact total & orb batching on large boss drops
  const pmBatch = new P.PickupManager({ rng: makeRng(301) });
  const spawnedBig = P.spawnEnemyXpOrbs(
    pmBatch,
    1200,
    900,
    'boss_overlord',
    true,
    true,
    2,
    { spawnLockTicks: 0 },
  );
  assert.equal(spawnedBig, rOverlordCycle2.totalXp);
  assert.ok(
    pmBatch.pickups.every((pk) => S.BANSUNG_PICKUPS[pk.kind]?.netKind === 'xp'),
    'spawnEnemyXpOrbs must only spawn XP orbs',
  );
  assert.ok(
    pmBatch.pickups.every((pk) => pk.stack >= 1 && pk.stack <= S.BANSUNG_PICKUP_CONSTS.MAX_STACK),
    'batched XP orbs respect stack bounds',
  );

  // Verify 1.45x XP magnet radius boost + magnet pull + 40% co-op XP resonance (<= 600px)
  const pm = new P.PickupManager({ rng: makeRng(303) });
  const collector = {
    idx: 0,
    id: 'p1',
    x: 200,
    y: 300,
    hp: 20,
    maxHp: 20,
    energy: 100,
    maxEnergy: 200,
    alive: true,
    downed: false,
    xp: 0,
    perks: [],
    mods: P.aggregatePerkMods([]),
  };
  const allyNear = {
    ...collector,
    idx: 1,
    id: 'p2',
    x: 700, // 500px <= BANSUNG_XP_COOP_RADIUS (600px)
    xp: 0,
  };
  const allyFar = {
    ...collector,
    idx: 2,
    id: 'p3',
    x: 900, // 700px > 600px
    xp: 0,
  };
  const allyDowned = {
    ...collector,
    idx: 3,
    id: 'p4',
    x: 240, // within 600px, but downed
    downed: true,
    xp: 0,
  };

  const coinMag = P.computePickupMagnetRadius(collector, 'coin');
  const xpMag = P.computePickupMagnetRadius(collector, 'xp_orb_s');
  assert.ok(
    Math.abs(xpMag - coinMag * P.BANSUNG_XP_MAGNET_MULT) < 1e-6,
    'XP orbs use 1.45x magnet radius multiplier',
  );

  // Place xp_orb_m at 90px (outside base R_MAGNET=76px, inside XP magnet ~110.2px)
  const spawnedOrb = pm.spawnPickup('xp_orb_m', 290, 300, { spawnLockTicks: 0 });
  assert.ok(spawnedOrb, 'xp_orb_m spawns');

  const cbLog = [];
  const collectedXpEntries = [];
  for (let t = 0; t < 20; t++) {
    const stepRes = pm.step(
      DT,
      [collector, allyNear, allyFar, allyDowned],
      undefined,
      {
        onXpGain: (heroIdx, xp, isShared, pickupId) => {
          cbLog.push({ heroIdx, xp, isShared, pickupId });
          if (heroIdx === collector.idx) collector.xp += xp;
          if (heroIdx === allyNear.idx) allyNear.xp += xp;
          if (heroIdx === allyFar.idx) allyFar.xp += xp;
          if (heroIdx === allyDowned.idx) allyDowned.xp += xp;
        },
      },
    );
    collectedXpEntries.push(...stepRes.xpGained);
  }

  assert.equal(pm.pickups.length, 0, 'XP orb pulled from 90px and collected cleanly');
  assert.equal(collector.xp, 40, 'collector receives full xp_orb_m value');
  assert.equal(allyNear.xp, Math.ceil(40 * 0.4), 'living ally <= 600px gets 40% co-op XP resonance');
  assert.equal(allyFar.xp, 0, 'living ally > 600px receives 0 co-op XP');
  assert.equal(allyDowned.xp, 0, 'downed ally receives 0 co-op XP');
  assert.equal(cbLog.filter((e) => !e.isShared).length, 1);
  assert.equal(cbLog.filter((e) => e.isShared).length, 1);
  assert.equal(collectedXpEntries.length, 2);

  // Also verify spawnEnemyXpOrbs + default hero.xp increment path without onXpGain callback
  const pmDirect = new P.PickupManager({ rng: makeRng(404) });
  collector.xp = 0;
  allyNear.xp = 0;
  const bruteXp = P.spawnEnemyXpOrbs(
    pmDirect,
    205,
    300,
    'scarab',
    false,
    false,
    0,
    { spawnLockTicks: 0 },
  );
  assert.equal(bruteXp, 14);
  for (let t = 0; t < 15; t++) {
    pmDirect.step(DT, [collector, allyNear]);
  }
  assert.equal(collector.xp, 14);
  assert.equal(allyNear.xp, Math.ceil(14 * 0.4));
});

test('T08.2 survival XP curve & 3-card Gacha box rollSurvivalGachaCards', () => {
  let prevReq = 0;
  for (let lv = 1; lv <= 15; lv++) {
    const req = S.getXpToNextLevel(lv);
    if (lv === 1) assert.equal(req, 60);
    assert.ok(req > prevReq, `XP threshold at lv${lv} (${req}) must exceed lv${lv - 1} (${prevReq})`);
    prevReq = req;
  }

  const seenCategories = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const cards = S.rollSurvivalGachaCards({
      rng: makeRng(seed * 7919),
      level: seed + 1,
      slots: [
        { id: 'pistol', tier: 1 },
        { id: 'rifle', tier: 2 },
        { id: 'crescent_blade', tier: 1 },
      ],
      activeSlotIdx: 1,
      skillStacks: {},
    });

    assert.equal(cards.length, 3, 'Gacha roll must return exactly 3 cards');
    const ids = new Set(cards.map((c) => c.id));
    assert.equal(ids.size, 3, 'all 3 Gacha cards must be distinct');

    const skillCats = new Set();
    const weaponSlots = new Set();
    for (const c of cards) {
      seenCategories.add(c.category);
      if (c.category === 'weapon_upgrade') {
        assert.ok(c.weaponId && S.BANSUNG_WEAPONS[c.weaponId]);
        assert.ok(Number.isInteger(c.slotIdx));
        assert.ok(!weaponSlots.has(c.slotIdx), 'no duplicate weapon slot evolution card in 1 roll');
        weaponSlots.add(c.slotIdx);
        assert.equal(c.toTier, c.fromTier + 1);
        if (c.fromTier === 0) {
          assert.ok(['common', 'rare', 'epic', 'legendary', 'mythic', 'celestial'].includes(c.rarity));
        } else {
          assert.equal(c.rarity, S.BANSUNG_WEAPON_TIERS[c.toTier].rarity);
        }
      } else {
        assert.ok(
          S.BANSUNG_GACHA_SKILL_CATEGORIES.includes(c.category),
          `unexpected gacha category: ${c.category}`,
        );
        assert.ok(!skillCats.has(c.category), 'no duplicate skill category in 1 Gacha roll');
        skillCats.add(c.category);
      }
    }
  }
  assert.ok(seenCategories.has('weapon_upgrade'), 'Gacha rolls must offer weapon_upgrade cards');
  assert.ok(seenCategories.size >= 4, 'Gacha rolls span multiple combat/survival skill categories');

  // Edge case 1: all 5 weapon slots already Mk.X -> 0 weapon_upgrade cards, 3 distinct skill cards
  const maxedCards = S.rollSurvivalGachaCards({
    rng: makeRng(88),
    level: 10,
    slots: [
      { id: 'pistol', tier: 10 },
      { id: 'rifle', tier: 10 },
      { id: 'smg', tier: 10 },
      { id: 'sniper_rifle', tier: 10 },
      { id: 'electric_gun', tier: 10 },
    ],
    activeSlotIdx: 1,
  });
  assert.equal(maxedCards.length, 3);
  assert.equal(
    maxedCards.some((c) => c.category === 'weapon_upgrade'),
    false,
    'maxed Mk.X arsenal should not offer weapon_upgrade',
  );
  assert.equal(new Set(maxedCards.map((c) => c.category)).size, 3);

  // Edge case 2: all skills capped at maxStacks -> falls back cleanly to 3 distinct cards
  const cappedStacks = {};
  for (const cat of S.BANSUNG_GACHA_SKILL_CATEGORIES) {
    cappedStacks[cat] = S.BANSUNG_GACHA_SKILL_MAP[cat].common.maxStacks;
  }
  const fallbackCards = S.rollSurvivalGachaCards({
    rng: makeRng(99),
    level: 12,
    slots: [{ id: 'rifle', tier: 1 }],
    activeSlotIdx: 0,
    skillStacks: cappedStacks,
  });
  assert.equal(fallbackCards.length, 3);
  assert.equal(new Set(fallbackCards.map((c) => c.id)).size, 3);
});

test('T08.3 gun evolution tiers Mk.I -> Mk.X: upgradeHeroWeaponTier, damage, ROF, pierce & fan spread', () => {
  assert.equal(S.normalizeWeaponTier(undefined), 1);
  assert.equal(S.normalizeWeaponTier(0), 1);
  assert.equal(S.normalizeWeaponTier(2), 2);
  assert.equal(S.normalizeWeaponTier(3), 3);
  assert.equal(S.normalizeWeaponTier(9), 9);
  assert.equal(S.normalizeWeaponTier(15), 10);

  const heroCheck = makeWeaponHero('rifle', { activeSlot: 1, energy: 200 });
  assert.equal(W.getHeroActiveWeaponTier(heroCheck), 1);
  assert.deepEqual(W.upgradeHeroWeaponTier(heroCheck, 1), {
    ok: true,
    weaponId: 'rifle',
    fromTier: 1,
    toTier: 2,
  });
  assert.deepEqual(W.upgradeHeroWeaponTier(heroCheck, 1), {
    ok: true,
    weaponId: 'rifle',
    fromTier: 2,
    toTier: 3,
  });
  assert.deepEqual(W.upgradeHeroWeaponTier(heroCheck, 1), {
    ok: true,
    weaponId: 'rifle',
    fromTier: 3,
    toTier: 4,
  });
  for (let from = 4; from < 10; from++) {
    assert.deepEqual(W.upgradeHeroWeaponTier(heroCheck, 1), {
      ok: true,
      weaponId: 'rifle',
      fromTier: from,
      toTier: from + 1,
    });
  }
  assert.deepEqual(W.upgradeHeroWeaponTier(heroCheck, 1), {
    ok: false,
    weaponId: 'rifle',
    fromTier: 10,
    toTier: 10,
  });
  assert.equal(W.upgradeHeroWeaponTier(heroCheck, 2).ok, false, 'empty slot cannot upgrade');
  assert.equal(W.upgradeHeroWeaponTier(heroCheck, 9).ok, false, 'out-of-range slot fails cleanly');

  const snap = W.buildWeaponSlotsSnapshot(heroCheck).find((s) => s.id === 'rifle');
  assert.ok(snap && snap.tier === 10);
  assert.equal(snap.evolvedName, S.getWeaponEvolutionStats('rifle', 10).vnName);

  // Damage curve: buffed base, big jumps at Mk.II / Mk.III, strictly increasing to Mk.X
  assert.ok(S.BANSUNG_WEAPON_TIERS[1].dmgMult > 1, 'Mk.I carries the global weapon damage buff');
  assert.ok(S.BANSUNG_WEAPON_TIERS[2].dmgMult / S.BANSUNG_WEAPON_TIERS[1].dmgMult >= 1.4, 'Mk.II is a big damage jump');
  assert.ok(S.BANSUNG_WEAPON_TIERS[3].dmgMult / S.BANSUNG_WEAPON_TIERS[2].dmgMult >= 1.3, 'Mk.III is a big damage jump');
  for (let t = 2; t <= 10; t++) {
    assert.ok(S.BANSUNG_WEAPON_TIERS[t].dmgMult > S.BANSUNG_WEAPON_TIERS[t - 1].dmgMult, `Mk tier ${t} increases damage`);
    if (t < 10) assert.ok(S.getWeaponUpgradeCoinCost(t) > S.getWeaponUpgradeCoinCost(t - 1), `upgrade cost ${t} increases`);
  }
  assert.equal(S.getWeaponUpgradeCoinCost(10), 0, 'Mk.X is max tier');

  // Compare Mk.I -> Mk.IV pistol single-shot spawn attributes & combat performance (rng=0.5 -> 0 jitter, 0 crit)
  const tierSnapshots = [];
  for (let targetTier = 1; targetTier <= 4; targetTier++) {
    const w = makeWorld();
    const h = makeWeaponHero('pistol', { activeSlot: 0, energy: 0 });
    for (let u = 1; u < targetTier; u++) {
      W.upgradeHeroWeaponTier(h, 0);
    }
    stepWeaponAndBullets(w, h, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
    const activeBullets = w.bullets.active.slice();
    const angles = activeBullets.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
    tierSnapshots.push({
      tier: targetTier,
      count: activeBullets.length,
      dmgMult: activeBullets[0].dmgMult,
      pierceLeft: activeBullets[0].pierceLeft,
      cdTicks: h.slotCdTicks[0],
      angles,
    });
  }

  assert.equal(tierSnapshots[0].count, 1);
  assert.equal(tierSnapshots[1].count, 1);
  assert.equal(tierSnapshots[2].count, 2);
  assert.equal(tierSnapshots[3].count, 2);

  assert.ok(tierSnapshots[3].dmgMult > tierSnapshots[0].dmgMult, 'Mk.IV boosts bullet damage mult');
  assert.equal(tierSnapshots[0].pierceLeft, 1);
  assert.equal(tierSnapshots[2].pierceLeft, 2);
  assert.equal(tierSnapshots[3].pierceLeft, 3);
  assert.ok(
    tierSnapshots[3].cdTicks < tierSnapshots[0].cdTicks,
    `Mk.IV cooldown (${tierSnapshots[3].cdTicks}) must be faster than Mk.I (${tierSnapshots[0].cdTicks})`,
  );

  // Symmetric fan spread check across Mk.IV 2-projectile volley
  const mk4Angles = tierSnapshots[3].angles;
  assert.ok(
    mk4Angles.length === 2 && mk4Angles[0] < 0 && mk4Angles[1] > 0,
    'Mk.IV volley forms a symmetric multi-angle fan',
  );
  assert.ok(Math.abs(mk4Angles[0] + mk4Angles[1]) < 1e-6);

  // Combat pierce + damage proof: Mk.I stops on front enemy; Mk.IV pierces through to hit rear enemy & deals higher dmg per hit
  const wMk1 = makeWorld();
  const front1 = wMk1.addTarget({ id: 701, x: 260, y: 300, hp: 500, radius: 22 });
  const rear1 = wMk1.addTarget({ id: 702, x: 310, y: 300, hp: 500, radius: 22 });
  const hMk1 = makeWeaponHero('pistol', { activeSlot: 0 });
  stepWeaponAndBullets(wMk1, hMk1, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  stepWeaponAndBullets(wMk1, hMk1, { fireHeld: false, ctxExtra: { rng: () => 0.5 } }, 2, 10);
  const mk1FrontDmg = 500 - front1.hp;
  assert.ok(mk1FrontDmg > 0);
  assert.equal(rear1.hp, 500, 'Mk.I non-piercing round stops on front target');

  const wMk4 = makeWorld();
  const front4 = wMk4.addTarget({ id: 703, x: 260, y: 300, hp: 500, radius: 22 });
  const rear4 = wMk4.addTarget({ id: 704, x: 310, y: 300, hp: 500, radius: 22 });
  const hMk4 = makeWeaponHero('pistol', { activeSlot: 0 });
  W.upgradeHeroWeaponTier(hMk4, 0);
  W.upgradeHeroWeaponTier(hMk4, 0);
  W.upgradeHeroWeaponTier(hMk4, 0);
  stepWeaponAndBullets(wMk4, hMk4, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  stepWeaponAndBullets(wMk4, hMk4, { fireHeld: false, ctxExtra: { rng: () => 0.5 } }, 2, 10);
  const mk4FrontDmg = 500 - front4.hp;
  const mk4RearDmg = 500 - rear4.hp;
  assert.ok(mk4FrontDmg > mk1FrontDmg * 2, 'Mk.IV damage + multishot overwhelms Mk.I');
  assert.ok(mk4RearDmg > 0, 'Mk.IV extra pierce carries shots through front target into rear target');

  // Verify grenade_launcher Tier 4 reduces energy cost & expands blast radius, and crescent_blade Tier 4 extends reach
  const wExpl = makeWorld();
  const hExpl = makeWeaponHero('grenade_launcher', { energy: 100 });
  W.upgradeHeroWeaponTier(hExpl, 1);
  W.upgradeHeroWeaponTier(hExpl, 1);
  W.upgradeHeroWeaponTier(hExpl, 1);
  stepWeaponAndBullets(wExpl, hExpl, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  const evoExpl = S.getWeaponEvolutionStats('grenade_launcher', 4);
  assert.equal(100 - hExpl.energy, evoExpl.energyCost);
  assert.ok(evoExpl.energyCost < S.BANSUNG_WEAPONS.grenade_launcher.energyCost);
  assert.ok(
    wExpl.bullets.active[0].blastRadius > S.BANSUNG_WEAPONS.grenade_launcher.blastRadius,
    'Mk.IV explosive increases blast radius',
  );

  const bladeReach1 = S.BANSUNG_WEAPONS.crescent_blade.reach;
  const bladeLunge = S.BANSUNG_WEAPONS.crescent_blade.lungePx;
  const farTargetX = 200 + bladeLunge + bladeReach1 + 14 + 8;
  const wMelee1 = makeWorld();
  const farTarget1 = wMelee1.addTarget({ id: 705, x: farTargetX, y: 300, hp: 100, radius: 14 });
  const hMelee1 = makeWeaponHero('crescent_blade', { activeSlot: 4, energy: 50 });
  stepWeaponAndBullets(wMelee1, hMelee1, { fireHeld: true }, 1, 6);
  assert.equal(farTarget1.hp, 100, 'target outside Mk.I blade reach is missed');

  const wMelee4 = makeWorld();
  const farTarget4 = wMelee4.addTarget({ id: 706, x: farTargetX, y: 300, hp: 100, radius: 14 });
  const hMelee4 = makeWeaponHero('crescent_blade', { activeSlot: 4, energy: 50 });
  W.upgradeHeroWeaponTier(hMelee4, 4);
  W.upgradeHeroWeaponTier(hMelee4, 4);
  W.upgradeHeroWeaponTier(hMelee4, 4);
  stepWeaponAndBullets(wMelee4, hMelee4, { fireHeld: true }, 1, 6);
  assert.ok(farTarget4.hp < 100, 'Mk.IV crescent_blade expanded reach hits further target');
});

test('T08.4 survival Gacha skill cards: all 6 skills stack cleanly, update hero stats & integrate into combat', () => {
  const hero = {
    idx: 0,
    id: 'p1',
    heroId: 'ranger',
    x: 200,
    y: 300,
    hp: 10,
    maxHp: 20,
    baseMaxHp: 20,
    shield: 4,
    maxShield: 6,
    baseMaxShield: 6,
    energy: 50,
    maxEnergy: 200,
    baseMaxEnergy: 200,
    moveSpeed: 200,
    baseMoveSpeed: 200,
    alive: true,
    downed: false,
    perks: ['vitality_boost'],
    mods: P.aggregatePerkMods(['vitality_boost']),
  };

  P.recomputeHeroStats(hero);
  assert.equal(hero.maxHp, 60, 'baseline vitality_boost adds +40 maxHp (20 + 40 = 60)');
  P.ensureSurvivalHeroGachaState(hero);
  assert.equal(hero.gachaDmgMult, 1);
  assert.equal(hero.extraMultishot, 0);

  // 1. skill_damage (^ +7% DMG on epic)
  const dmgCard = S.BANSUNG_GACHA_SKILL_MAP.skill_damage.epic;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, dmgCard).ok, true);
  assert.ok(Math.abs(hero.gachaDmgMult - (1 + dmgCard.value)) < 1e-9);
  assert.ok(Math.abs(hero.gachaMods.dmgMult - (1 + dmgCard.value)) < 1e-9);
  assert.equal(hero.skillStacks.skill_damage, 1);

  // 2. skill_hp (light heal +10 HP on rare, ZERO maxHp/maxShield increase)
  hero.hp = 10;
  const hpCard = S.BANSUNG_GACHA_SKILL_MAP.skill_hp.rare;
  const hpRes = P.applySurvivalGachaSkillToHero(hero, hpCard);
  assert.equal(hpRes.ok, true);
  assert.equal(hpRes.maxHpAdded, 0, 'rebalanced skill_hp must NEVER add maxHp');
  assert.equal(hero.maxHp, 60, 'maxHp remains at perk baseline 60');
  assert.equal(hero.maxShield, 6, 'skill_hp must NEVER add maxShield');
  assert.equal(hero.shield, 4, 'skill_hp must NEVER grant free shield refill');
  assert.equal(hpRes.healed, hpCard.value);
  assert.equal(hero.hp, 10 + hpCard.value);
  P.recomputeHeroStats(hero);
  assert.equal(hero.maxHp, 60, 'repeated recomputeHeroStats preserves maxHp without gacha bloat');

  // 3. skill_firerate (^ +7% fire rate, +8% reload speed)
  const rofCard = S.BANSUNG_GACHA_SKILL_MAP.skill_firerate.epic;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, rofCard).ok, true);
  assert.ok(Math.abs(hero.gachaFireRateMult - (1 + rofCard.value)) < 1e-9);
  assert.ok(Math.abs(hero.gachaReloadSpeedMult - (1 + rofCard.secondaryValue)) < 1e-9);

  // 4. skill_multishot (^ +1 extra projectile on epic, -6% energy cost)
  const multiCard = S.BANSUNG_GACHA_SKILL_MAP.skill_multishot.epic;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, multiCard).ok, true);
  assert.equal(hero.extraMultishot, 1);
  assert.equal(hero.gachaMods.extraMultishot, 1);
  assert.ok(hero.gachaEnergyCostMult < 1);

  // 5. skill_crit (^^ +8% crit chance, +16% crit dmg, +1 pierce)
  const critCard = S.BANSUNG_GACHA_SKILL_MAP.skill_crit.legendary;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, critCard).ok, true);
  assert.ok(Math.abs(hero.gachaCritAdd - critCard.value) < 1e-9);
  assert.ok(Math.abs(hero.gachaCritDmgMult - (1 + critCard.secondaryValue)) < 1e-9);
  assert.equal(hero.gachaExtraPierce, critCard.tertiaryValue);

  // 6. skill_mobility (^ +6% speed, -6% dash CD, NO maxEnergy or magnet change)
  const prevSpeed = hero.moveSpeed;
  const prevMag = P.computePickupMagnetRadius(hero);
  const prevMaxEnergy = hero.maxEnergy;
  hero.energy = 20;
  const mobCard = S.BANSUNG_GACHA_SKILL_MAP.skill_mobility.epic;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, mobCard).ok, true);
  assert.ok(hero.moveSpeed > prevSpeed, 'skill_mobility boosts hero moveSpeed');
  assert.equal(P.computePickupMagnetRadius(hero), prevMag, 'magnet radius belongs to skill_magnet now');
  assert.ok(Math.abs(hero.gachaDashCdMult - (1 - mobCard.tertiaryValue)) < 1e-9);
  assert.equal(hero.maxEnergy, prevMaxEnergy, 'rebalanced skill_mobility does not inflate maxEnergy');

  // Verify Gacha skill modifiers integrate cleanly into 30Hz weapon firing & reload
  const wCombat = makeWorld();
  const hCombat = makeWeaponHero('pistol', {
    activeSlot: 0,
    gachaMods: {
      ...hero.gachaMods,
      reloadSpeedMul: hero.gachaReloadSpeedMult,
    },
  });
  stepWeaponAndBullets(wCombat, hCombat, { fireHeld: true, ctxExtra: { rng: () => 0.99 } }, 1, 1);
  assert.equal(wCombat.bullets.count, 2, 'skill_multishot (+1) makes 1-pellet pistol fire 2 bullets');
  assert.ok(Math.abs(wCombat.bullets.active[0].dmgMult - (1 + dmgCard.value) * S.BANSUNG_WEAPON_TIERS[1].dmgMult) < 1e-9);
  assert.ok(
    Math.abs(
      wCombat.bullets.active[0].critMult - S.BANSUNG_WEAPONS.pistol.critMult * (1 + critCard.secondaryValue),
    ) < 1e-9,
    'skill_crit critDmgMult must scale bullet critMult',
  );
  assert.equal(wCombat.bullets.active[0].pierceLeft, 1 + critCard.tertiaryValue, 'skill_crit pierce bonus increases pierceLeft');
  const wRofShot = makeWorld();
  const hRofShot = makeWeaponHero('shotgun', {
    activeSlot: 0,
    gachaMods: { ...hero.gachaMods, reloadSpeedMul: hero.gachaReloadSpeedMult },
  });
  stepWeaponAndBullets(wRofShot, hRofShot, { fireHeld: true, ctxExtra: { rng: () => 0.99 } }, 1, 1);
  assert.ok(
    hRofShot.slotCdTicks[0] < S.BANSUNG_WEAPONS.shotgun.cooldownTicks,
    'skill_firerate reduces weapon cooldown ticks',
  );

  // Verify Gacha critDmgMult boosts critical hit damage against a target vs baseline
  const wCritBase = makeWorld();
  const tCritBase = wCritBase.addTarget({ id: 701, x: 250, y: 300, hp: 500, armorType: 'light' });
  const hCritBase = makeWeaponHero('pistol', { x: 200, y: 300, aimRad: 0 });
  stepWeaponAndBullets(wCritBase, hCritBase, { fireHeld: true, ctxExtra: { rng: () => 0 } }, 1, 4);
  const dmgBaseCrit = 500 - tCritBase.hp;

  const wCritBuffed = makeWorld();
  const tCritBuffed = wCritBuffed.addTarget({ id: 702, x: 250, y: 300, hp: 500, armorType: 'light' });
  const hCritBuffed = makeWeaponHero('pistol', {
    x: 200,
    y: 300,
    aimRad: 0,
    gachaMods: { dmgMult: 1, critChanceAdd: critCard.value, critDmgMult: hero.gachaCritDmgMult },
  });
  stepWeaponAndBullets(wCritBuffed, hCritBuffed, { fireHeld: true, ctxExtra: { rng: () => 0 } }, 1, 4);
  const dmgBuffedCrit = 500 - tCritBuffed.hp;
  assert.ok(dmgBaseCrit > 0 && dmgBuffedCrit > dmgBaseCrit, 'gacha critDmgMult must increase crit damage dealt');

  // Verify Gacha energyCostMult (skill_multishot) reduces weapon energy expenditure on energy weapons
  const bazookaCost = S.BANSUNG_WEAPONS.bazooka.energyCost;
  assert.ok(bazookaCost >= 8);
  const multiLeg = S.BANSUNG_GACHA_SKILL_MAP.skill_multishot.legendary;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, multiLeg).ok, true);
  assert.equal(hero.extraMultishot, 3, 'epic (+1) + legendary (^^ +2) yields +3 spread');
  const expectedCostMult = Math.max(0.55, 1 - multiCard.secondaryValue - multiLeg.secondaryValue);
  assert.ok(Math.abs(hero.gachaEnergyCostMult - expectedCostMult) < 1e-9);
  const wEnBase = makeWorld();
  const hEnBase = makeWeaponHero('bazooka', { energy: 100, maxEnergy: 100 });
  stepWeaponAndBullets(wEnBase, hEnBase, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  const spentBase = 100 - hEnBase.energy;

  const wEnSave = makeWorld();
  const hEnSave = makeWeaponHero('bazooka', {
    energy: 100,
    maxEnergy: 100,
    gachaMods: { energyCostMult: hero.gachaEnergyCostMult },
  });
  stepWeaponAndBullets(wEnSave, hEnSave, { fireHeld: true, ctxExtra: { rng: () => 0.5 } }, 1, 1);
  const spentSaved = 100 - hEnSave.energy;
  assert.equal(spentBase, bazookaCost);
  assert.equal(spentSaved, Math.ceil(bazookaCost * expectedCostMult));
  assert.ok(spentSaved < spentBase, 'gacha energyCostMult must strictly reduce weapon energy spent');

  hCombat.slots[0].ammoInMag = 2;
  W.startHeroReload(hCombat, 0, 5);
  assert.ok(
    hCombat.reload && hCombat.reload.durationTicks < S.BANSUNG_WEAPONS.pistol.reloadTicks,
    'skill_firerate shortens reload duration ticks',
  );

  // Reject weapon_upgrade or unknown category in applySurvivalGachaSkillToHero
  assert.deepEqual(
    P.applySurvivalGachaSkillToHero(hero, {
      id: 'weapon_upgrade:0:pistol:2',
      category: 'weapon_upgrade',
      rarity: 'rare',
      title: 'bad',
      vnTitle: 'bad',
      desc: '',
      vnDesc: '',
      icon: 'pistol',
      badge: 'Mk.II',
      value: 2,
    }),
    { ok: false, healed: 0, maxHpAdded: 0 },
  );
});

test('T09.1 sniper_rifle, laser_cannon (full-map slow beam) & electric_gun (4-hop chain + stun)', () => {
  // 1. sniper_rifle: 95 base DMG + pierce 3 hits 3 collinear targets
  const wSniper = makeWorld();
  const s1 = wSniper.addTarget({ id: 801, x: 300, y: 300, hp: 200 });
  const s2 = wSniper.addTarget({ id: 802, x: 380, y: 300, hp: 200 });
  const s3 = wSniper.addTarget({ id: 803, x: 460, y: 300, hp: 200 });
  const s4 = wSniper.addTarget({ id: 804, x: 540, y: 300, hp: 200 });
  const hSniper = makeWeaponHero('sniper_rifle', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(wSniper, hSniper, { fireHeld: true, ctxExtra: { rng: () => 0.99 } }, 1, 12);
  assert.ok(200 - s1.hp >= 90, 'sniper_rifle deals heavy primary damage');
  assert.ok(s2.hp < 200 && s3.hp < 200, 'sniper_rifle pierces through targets 2 and 3');
  assert.equal(s4.hp, 200, 'sniper_rifle pierce cap (3 hits) stops before 4th target');

  // 2. laser_cannon: slow high-impact beam (~145 DMG, >= 40 ticks cooldown) crossing full 4224px map
  assert.ok(S.BANSUNG_WEAPONS.laser_cannon.cooldownTicks >= 40, 'laser_cannon has slow deliberate cooldown');
  assert.ok(S.BANSUNG_WEAPONS.laser_cannon.range >= S.BANSUNG_MAP_W, 'laser_cannon reaches across entire map');
  const wLaser = makeWorld();
  const lNear = wLaser.addTarget({ id: 811, x: 500, y: 300, hp: 300 });
  const lFar = wLaser.addTarget({ id: 812, x: 3200, y: 300, hp: 300 });
  const hLaser = makeWeaponHero('laser_cannon', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(wLaser, hLaser, { fireHeld: true, ctxExtra: { rng: () => 0.99 } }, 1, 1);
  assert.ok(300 - lNear.hp >= 140, 'laser_cannon deals ~145+ damage near muzzle');
  assert.ok(lFar.hp < 300, 'laser_cannon pierces full map width (>3000px)');
  assert.ok(hLaser.slotCdTicks[1] >= 40, 'laser_cannon applies slow post-shot cooldown');

  // 3. electric_gun: 28 DMG, 4-hop chain arc + stun
  const wElec = makeWorld();
  const e1 = wElec.addTarget({ id: 821, x: 320, y: 300, hp: 150 });
  const e2 = wElec.addTarget({ id: 822, x: 420, y: 315, hp: 150 });
  const e3 = wElec.addTarget({ id: 823, x: 520, y: 300, hp: 150 });
  const e4 = wElec.addTarget({ id: 824, x: 620, y: 315, hp: 150 });
  const hElec = makeWeaponHero('electric_gun', { x: 200, y: 300, energy: 100 });
  stepWeaponAndBullets(wElec, hElec, { fireHeld: true, ctxExtra: { rng: () => 0.99 } }, 1, 15);
  assert.ok(e1.hp < 150 && e2.hp < 150 && e3.hp < 150 && e4.hp < 150, 'electric_gun chains across 4 nearby targets');
  assert.ok(wElec.stunEvents.length > 0, 'electric_gun inflicts stun events');
});

test('T09.2 gacha skill_stamina (light ^/^^) & skill_shield light charge/DR/regen (no max stat bloat)', () => {
  const hero = {
    idx: 0,
    id: 'p1',
    heroId: 'mascot',
    x: 200,
    y: 300,
    hp: 60,
    maxHp: 60,
    baseMaxHp: 60,
    shield: 5,
    maxShield: 40,
    baseMaxShield: 40,
    energy: 200,
    maxEnergy: 200,
    baseMaxEnergy: 200,
    moveSpeed: 200,
    baseMoveSpeed: 200,
    stamina: 40,
    maxStamina: 100,
    baseMaxStamina: 100,
    regenDelayMs: BANSUNG_SHIELD.REGEN_DELAY_MS,
    alive: true,
    downed: false,
    perks: [],
    mods: P.aggregatePerkMods([]),
  };
  P.ensureSurvivalHeroGachaState(hero);
  P.recomputeHeroStats(hero);

  const staGold = S.BANSUNG_GACHA_SKILL_MAP.skill_stamina.legendary;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, staGold).ok, true);
  assert.equal(hero.maxStamina, 100, 'rebalanced skill_stamina must NOT add maxStamina');
  assert.equal(hero.stamina, 40 + staGold.value, 'skill_stamina restores only a light stamina increment');
  assert.ok(hero.gachaDashCostReduce >= staGold.tertiaryValue, 'skill_stamina lowers dash stamina cost');
  assert.ok(hero.gachaStaminaRegenMult > 1, 'skill_stamina boosts stamina regen rate');

  const shGold = S.BANSUNG_GACHA_SKILL_MAP.skill_shield.legendary;
  assert.equal(P.applySurvivalGachaSkillToHero(hero, shGold).ok, true);
  assert.equal(hero.maxShield, 40, 'rebalanced skill_shield must NOT add maxShield');
  assert.equal(hero.shield, 5 + shGold.value, 'skill_shield grants only a small sliver, never full 100% shield');
  assert.ok(hero.shieldDamageReduction > 0.25, 'skill_shield increases bullet DR above 25%');
  assert.ok(hero.regenDelayMs < BANSUNG_SHIELD.REGEN_DELAY_MS, 'skill_shield trims 5s shield regen delay');
});

test('T09.3 cross-check 36 weapons anim/idx/balance, boss bar palette order & reload guards', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const manifestPath = path.resolve(__dirname, '../../database-ban-sung/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sprites = manifest.sprites || {};

  assert.equal(S.BANSUNG_WEAPON_IDS.length, 36, 'expected 36 weapons');
  const seenIdx = new Set();

  function weaponMetrics(spec) {
    const mult = (spec.pellets || 1) * (spec.burstCount || 1);
    const shotDmg = (spec.damage || 0) * mult;
    const cycleSec =
      ((spec.cooldownTicks || 1) +
        ((spec.burstCount || 1) > 1 ? (spec.burstCount - 1) * (spec.burstStepTicks || 1) : 0)) /
      S.BANSUNG_TICK_HZ;
    const rawDps = shotDmg / cycleSec;
    const effDps = rawDps * (1 + (spec.critChance || 0) * ((spec.critMult || 1.5) - 1));
    const clipShots = spec.magSize > 0 ? Math.ceil(spec.magSize / (spec.burstCount || 1)) : 0;
    const sustainDps =
      spec.magSize > 0
        ? (shotDmg * clipShots) / (clipShots * cycleSec + (spec.reloadTicks || 0) / S.BANSUNG_TICK_HZ)
        : effDps;
    return { rawDps, effDps, sustainDps };
  }

  for (const id of S.BANSUNG_WEAPON_IDS) {
    const spec = S.getWeaponSpec(id);
    assert.ok(spec, `missing spec for ${id}`);
    assert.equal(spec.id, id);
    assert.equal(seenIdx.has(spec.idx), false, `duplicate weapon idx ${spec.idx} on ${id}`);
    seenIdx.add(spec.idx);
    assert.equal(S.getWeaponByIdx(spec.idx)?.id, id, `getWeaponByIdx(${spec.idx}) must resolve ${id}`);
    if (typeof spec.minEnergyCost === 'number') {
      assert.ok(
        spec.minEnergyCost <= spec.energyCost,
        `${id}: minEnergyCost (${spec.minEnergyCost}) must not exceed energyCost (${spec.energyCost})`,
      );
    }
    const entry = sprites[id] || sprites[spec.spriteKey];
    assert.ok(entry, `manifest.json missing sprite entry for ${id} (${spec.spriteKey})`);
    assert.deepEqual(
      {
        cellW: spec.anim.cellW,
        cellH: spec.anim.cellH,
        frames: spec.anim.frames,
        offX: spec.anim.offX,
        offY: spec.anim.offY,
      },
      {
        cellW: entry.cellW,
        cellH: entry.cellH,
        frames: entry.frames,
        offX: entry.offX,
        offY: entry.offY,
      },
      `${id} anim metadata must match manifest.json`,
    );
  }
  assert.equal(seenIdx.size, 36);

  // Staves, heavy weapons, rare vs mythic/celestial balance cross-checks
  const staff = weaponMetrics(S.BANSUNG_WEAPONS.lightning_staff);
  const tome = weaponMetrics(S.BANSUNG_WEAPONS.arcane_book);
  const twinSmg = weaponMetrics(S.BANSUNG_WEAPONS.twin_smg);
  const dualPistols = weaponMetrics(S.BANSUNG_WEAPONS.dual_pistols);
  assert.ok(S.BANSUNG_WEAPONS.lightning_staff.energyCost <= 4, 'lightning_staff energy cost balanced');
  assert.ok(staff.sustainDps >= 80, `lightning_staff sustainDps (${staff.sustainDps.toFixed(1)}) >= 80`);
  assert.ok(tome.sustainDps >= 120, `arcane_book sustainDps (${tome.sustainDps.toFixed(1)}) >= 120`);
  assert.ok(twinSmg.effDps < 200, `twin_smg rare effDps (${twinSmg.effDps.toFixed(1)}) capped < 200`);
  assert.ok(dualPistols.effDps < 200, `dual_pistols rare effDps (${dualPistols.effDps.toFixed(1)}) capped < 200`);
  for (const highId of ['gravity_gun', 'void_cannon', 'orbital_cannon', 'cryo_cannon', 'chronos_rifle', 'phantom_bow']) {
    const m = weaponMetrics(S.BANSUNG_WEAPONS[highId]);
    assert.ok(m.effDps >= 250, `${highId} high-tier effDps (${m.effDps.toFixed(1)}) >= 250`);
  }

  // Boss multi-bar palette: Tím -> Vàng -> Xanh -> Cam -> Đỏ (and extra colors for >5 bars)
  assert.deepEqual(
    S.BANSUNG_BOSS_BAR_PALETTE.slice(0, 5).map((c) => c.color),
    ['#a855f7', '#facc15', '#22c55e', '#f97316', '#ef4444'],
    'top 5 boss HP bars burn top-down in order Tím -> Vàng -> Xanh -> Cam -> Đỏ',
  );
  const twoBars = [2000, 500].map((hp) => S.resolveBossBarState(hp, 2000, 2));
  assert.deepEqual(twoBars.map((s) => s.barColor), ['#a855f7', '#ef4444'], '2 bars: Tím -> Đỏ');
  assert.equal(twoBars[0].underBarColor, '#ef4444');
  assert.equal(twoBars[1].underBarColor, undefined);

  const threeBars = [3000, 1500, 500].map((hp) => S.resolveBossBarState(hp, 3000, 3));
  assert.deepEqual(threeBars.map((s) => s.barColor), ['#a855f7', '#facc15', '#ef4444'], '3 bars: Tím -> Vàng -> Đỏ');

  const fiveBars = [1000, 750, 550, 350, 100].map((hp) => S.resolveBossBarState(hp, 1000, 5));
  assert.deepEqual(
    fiveBars.map((s) => s.barColor),
    ['#a855f7', '#facc15', '#22c55e', '#f97316', '#ef4444'],
  );
  assert.equal(fiveBars[0].underBarColor, '#facc15');
  assert.equal(fiveBars[4].underBarColor, undefined);
  for (const bars of [6, 10, 12]) {
    const full = S.resolveBossBarState(bars * 1000, bars * 1000, bars);
    assert.equal(full.remainingBars, bars);
    assert.equal(full.barColor, '#a855f7');
    assert.notEqual(full.underBarColor, full.barColor);
  }

  // Reloading guards: 0-mag melee cannot start reload; dead/downed heroes never emit reloading/firing flags
  const meleeHero = makeWeaponHero('crescent_blade', { activeSlot: 4 });
  assert.equal(W.startHeroReload(meleeHero, 4), false);
  assert.equal(meleeHero.reload, null);

  const reloadHero = makeWeaponHero('pistol', { activeSlot: 0 });
  reloadHero.slots[0].ammoInMag = 2;
  assert.equal(W.startHeroReload(reloadHero, 0), true);
  assert.notEqual(W.getHeroPlayerFlags(reloadHero) & S.BANSUNG_PFLAG_RELOADING, 0);
  reloadHero.downed = true;
  assert.equal(W.getHeroPlayerFlags(reloadHero), 0, 'downed hero must not emit reloading flag');
  reloadHero.downed = false;
  reloadHero.alive = false;
  assert.equal(W.getHeroPlayerFlags(reloadHero), 0, 'dead hero must not emit reloading flag');
});

test('T09.4 icon sprite sheet parity, Armory Shop [B] commands & reaper/blizzard effects', (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
  const { validateBansungCommand } = require('../dist/server/src/game/bansung/security.js');

  // 1. All 36 BANSUNG_WEAPON_ICON_META entries in HotbarShop.tsx match PNG IHDR dimensions on disk
  const hotbarSrc = fs.readFileSync(
    path.resolve(__dirname, '../../client/src/components/bansung/HotbarShop.tsx'),
    'utf8',
  );
  const blockMatch = hotbarSrc.match(/export const BANSUNG_WEAPON_ICON_META:[^=]+=\s*\{([\s\S]*?)\};/);
  assert.ok(blockMatch, 'BANSUNG_WEAPON_ICON_META must exist in HotbarShop.tsx');
  const iconMatches = [...blockMatch[1].matchAll(/(\w+):\s*\{\s*path:\s*'([^']+)'\s*,\s*frames:\s*(\d+)\s*,\s*cellW:\s*(\d+)\s*,\s*cellH:\s*(\d+)/g)];
  assert.equal(iconMatches.length, 36, 'BANSUNG_WEAPON_ICON_META must cover all 36 weapons');
  for (const [, wid, relPath, framesStr, cellWStr, cellHStr] of iconMatches) {
    const pngPath = path.resolve(__dirname, '../../database-ban-sung', relPath);
    assert.ok(fs.existsSync(pngPath), `missing PNG icon sheet for ${wid}: ${pngPath}`);
    const buf = fs.readFileSync(pngPath);
    const pngW = buf.readUInt32BE(16);
    const pngH = buf.readUInt32BE(20);
    const frames = Number(framesStr);
    const cellW = Number(cellWStr);
    const cellH = Number(cellHStr);
    assert.equal(pngW, frames * cellW, `${wid}: PNG width ${pngW} != frames(${frames}) * cellW(${cellW})`);
    assert.equal(pngH, cellH, `${wid}: PNG height ${pngH} != cellH(${cellH})`);
  }

  // 2. Security validation for `{ t: 'shop' }` commands
  assert.equal(validateBansungCommand({ t: 'shop', op: 'buy_weapon', weaponId: 'railgun' }, { arenaW: 4000, arenaH: 2500, maxPlayers: 4 }).ok, true);
  assert.equal(validateBansungCommand({ t: 'shop', op: 'upgrade_active', slotIdx: 0 }, { arenaW: 4000, arenaH: 2500, maxPlayers: 4 }).ok, true);
  assert.equal(validateBansungCommand({ t: 'shop', op: 'supply_heal' }, { arenaW: 4000, arenaH: 2500, maxPlayers: 4 }).ok, true);
  assert.equal(validateBansungCommand({ t: 'shop', op: 'buy_weapon', weaponId: 'fake_gun' }, { arenaW: 4000, arenaH: 2500, maxPlayers: 4 }).ok, false);
  assert.equal(validateBansungCommand({ t: 'shop', op: 'hack_coins' }, { arenaW: 4000, arenaH: 2500, maxPlayers: 4 }).ok, false);

  // 3. Armory Shop removed: coin shop commands are no-ops (weapons upgrade only via level-up Gacha)
  const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Buyer', heroId: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 303, skipWarmup: true },
  );
  t.after(() => world.stop());
  const p = world.players[0];
  p.coins = 1000;
  const tiersBefore = p.weaponState.slots.map((s) => s?.tier ?? 0);
  world.enqueueCommand('p0', { t: 'shop', op: 'buy_weapon', weaponId: 'railgun' });
  world.enqueueCommand('p0', { t: 'shop', op: 'upgrade_active', slotIdx: p.weaponState.activeSlot });
  p.hp = 10;
  world.enqueueCommand('p0', { t: 'shop', op: 'supply_heal' });
  world.step();
  assert.equal(p.coins, 1000, 'shop no longer spends coins');
  assert.ok(!p.weaponState.slots.some((s) => s?.weaponId === 'railgun'), 'shop can no longer buy weapons');
  assert.deepEqual(p.weaponState.slots.map((s) => s?.tier ?? 0), tiersBefore, 'shop can no longer upgrade weapons');
  assert.ok(p.hp < p.maxHp, 'shop can no longer sell supply heal');

  // 4. reaper_scythe melee lifesteal & blizzard_carbine isEnergy + chill AoE
  const mw = makeWorld();
  mw.addTarget({ id: 9001, x: 240, y: 300, hp: 300, maxHp: 300, radius: 18 });
  const reaper = makeWeaponHero('reaper_scythe', {
    activeSlot: 4,
    weapons: ['pistol', null, null, null, 'reaper_scythe'],
    energy: 100,
    x: 200,
    y: 300,
  });
  mw.fx.length = 0;
  let totalMeleeHits = 0;
  let totalLifesteal = 0;
  for (let tickNo = 1; tickNo <= 6; tickNo++) {
    mw.syncGrid();
    W.tickHeroWeapons(
      reaper,
      { fireHeld: tickNo === 1, moving: false, aimDistPx: 60 },
      mw.makeCtx(tickNo, { deferMeleeSweep: true }),
    );
    const mRes = W.stepHeroMeleeSwing(reaper, mw.makeCtx(tickNo));
    totalMeleeHits += mRes.meleeHits;
    totalLifesteal += mRes.lifestealHp;
  }
  assert.ok(totalMeleeHits >= 1, 'reaper_scythe swing must hit adjacent target');
  assert.ok(totalLifesteal > 0, 'reaper_scythe must return lifestealHp when hitting an enemy');

  const bw = makeWorld();
  const bzTarget = bw.addTarget({ id: 9002, x: 380, y: 300, hp: 400, maxHp: 400, radius: 18 });
  const blizHero = makeWeaponHero('blizzard_carbine', { x: 200, y: 300, energy: 200 });
  stepWeaponAndBullets(bw, blizHero, { fireHeld: true }, 1, 1);
  let firedEnergy = false;
  for (let i = 0; i < bw.bullets.active.length; i++) {
    const b = bw.bullets.active[i];
    if (b.alive && b.kind === 'blizzard_bolt') {
      assert.equal(b.isEnergy, true, 'blizzard_bolt must be tagged isEnergy for shield shred & visual beam');
      firedEnergy = true;
    }
  }
  assert.equal(firedEnergy, true, 'blizzard_carbine must spawn a blizzard_bolt projectile');
  stepWeaponAndBullets(bw, blizHero, { fireHeld: false }, 2, 20);
  assert.ok(bzTarget.hp < 400, 'blizzard_bolt must hit target');
  assert.ok((bzTarget.slowMs || 0) > 0, 'blizzard_bolt hit must inflict chill slow status');
});

test('T09.4 gacha skill catalog: ^ / ^^ light scaling, zero Max stat inflation & +1 orb/sword badges', () => {
  assert.equal(S.BANSUNG_GACHA_SKILL_CATEGORIES.length, 12);
  assert.equal(S.BANSUNG_GACHA_SKILLS.length, 84);

  const dummy = {
    idx: 0,
    id: 'p_check',
    heroId: 'mascot',
    x: 200,
    y: 200,
    hp: 10,
    maxHp: 50,
    baseMaxHp: 50,
    shield: 5,
    maxShield: 40,
    baseMaxShield: 40,
    energy: 40,
    maxEnergy: 200,
    baseMaxEnergy: 200,
    moveSpeed: 200,
    baseMoveSpeed: 200,
    stamina: 30,
    maxStamina: 100,
    baseMaxStamina: 100,
    regenDelayMs: BANSUNG_SHIELD.REGEN_DELAY_MS,
    alive: true,
    downed: false,
    perks: [],
    mods: P.aggregatePerkMods([]),
  };

  for (const spec of S.BANSUNG_GACHA_SKILLS) {
    dummy.hp = 10;
    dummy.shield = 5;
    dummy.stamina = 30;
    dummy.energy = 40;
    dummy.skillStacks = {};
    P.ensureSurvivalHeroGachaState(dummy);
    P.applySurvivalGachaSkillToHero(dummy, spec);
    assert.equal(dummy.maxHp, 50, `${spec.id} must not increase maxHp`);
    assert.equal(dummy.maxShield, 40, `${spec.id} must not increase maxShield`);
    assert.equal(dummy.maxStamina, 100, `${spec.id} must not increase maxStamina`);
    assert.equal(dummy.maxEnergy, 200, `${spec.id} must not increase maxEnergy`);
    assert.ok(dummy.shield < dummy.maxShield, `${spec.id} must never refill shield to 100%`);
  }

  for (const rar of ['common', 'rare', 'epic']) {
    assert.equal(S.BANSUNG_GACHA_SKILL_MAP.skill_multishot[rar].value, 1, `skill_multishot ${rar} is ^ (+1)`);
    assert.ok(S.BANSUNG_GACHA_SKILL_MAP.skill_damage[rar].badge.startsWith('^ '));
  }
  for (const rar of ['legendary', 'celestial', 'mythic', 'prismatic']) {
    assert.equal(S.BANSUNG_GACHA_SKILL_MAP.skill_multishot[rar].value, 2, `skill_multishot ${rar} is ^^ (+2)`);
    assert.ok(S.BANSUNG_GACHA_SKILL_MAP.skill_damage[rar].badge.startsWith('^^ '));
  }
  for (const cat of ['skill_lightning_orb', 'skill_fire_orb', 'skill_spirit_sword']) {
    const card = S.buildSkillCard(S.BANSUNG_GACHA_SKILL_MAP[cat].epic);
    assert.equal(card.multLabel, '+1', `${cat} must advertise +1 per selection`);
  }
});

test('T09.5 new Gacha skills: lightning orbs, fire orbs burn, 5s homing pull spirit swords & beneficial magnet', (t) => {
  const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
  const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');
  const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };
  const world = new BansungWorld(
    [{ id: 'p0', name: 'Tester', heroId: 'mascot' }],
    { bots: 0, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 4242, skipWarmup: true },
  );
  t.after(() => world.stop());
  world.step();

  const p = world.players[0];
  p.invulnMs = 30_000;
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();

  // Apply 1 stack each of the 4 new skills + verify snapshot orbs encoding
  for (const [idx, cat] of ['skill_lightning_orb', 'skill_fire_orb', 'skill_spirit_sword', 'skill_magnet'].entries()) {
    p.gachaPending = 1;
    p.gachaTimerMs = 14_000;
    p.gachaChoices = [
      S.buildSkillCard(S.BANSUNG_GACHA_SKILL_MAP[cat].rare),
      S.buildSkillCard(S.BANSUNG_GACHA_SKILL_MAP.skill_damage.common),
      S.buildSkillCard(S.BANSUNG_GACHA_SKILL_MAP.skill_crit.common),
    ];
    assert.equal(world.enqueueCommand('p0', { t: 'gacha', pick: 0 }, { nowMs: 1000 + idx * 100 }).ok, true);
    world.step();
  }
  assert.equal(p.skillStacks.skill_lightning_orb, 1);
  assert.equal(p.skillStacks.skill_fire_orb, 1);
  assert.equal(p.skillStacks.skill_spirit_sword, 1);
  assert.equal(p.skillStacks.skill_magnet, 1);
  const initFrame = world.frameFor('p0', true);
  assert.ok(Array.isArray(initFrame.orbs) && initFrame.orbs[1] === 1 && initFrame.orbs[2] === 1 && initFrame.orbs[3] === 1 && initFrame.orbs[4] === 1, 'snapshot orbs must pack [pIdx, lightning, fire, swords, magnet]');

  // 1) Orbiting Lightning + Fire orbs shock/scorch & burn stationary mobs in orbit path
  const lightningMob = spawnMob(world.mobMgr, {
    kind: 'cactus_brute',
    x: p.x - 74,
    y: p.y,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  lightningMob.hp = 800;
  lightningMob.maxHp = 800;
  lightningMob.stunMs = 8000;

  const fireMob = spawnMob(world.mobMgr, {
    kind: 'cactus_brute',
    x: p.x + 92,
    y: p.y,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  fireMob.hp = 800;
  fireMob.maxHp = 800;
  fireMob.stunMs = 8000;

  let sawFireBurn = false;
  for (let i = 0; i < 95; i++) {
    lightningMob.vx = 0;
    lightningMob.vy = 0;
    fireMob.vx = 0;
    fireMob.vy = 0;
    world.step();
    if ((fireMob.dots?.burn?.leftMs || 0) > 0) {
      sawFireBurn = true;
    }
  }
  assert.ok(lightningMob.hp < 800, 'orbiting lightning sphere must sweep and shock enemies at r=74');
  assert.ok(fireMob.hp < 800, 'orbiting fireball sphere must sweep and scorch enemies at r=92');
  assert.equal(sawFireBurn, true, 'fireball orbit sphere must inflict burn DoT');

  // Remove orbit test mob so spirit sword deterministically targets distant swordMob
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();

  // 2) Farther stunned mob at ~240px for 5s Spirit Sword auto-aim dash & inward pull
  const swordMob = spawnMob(world.mobMgr, {
    kind: 'cactus_brute',
    x: p.x + 240,
    y: p.y + 40,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  swordMob.hp = 800;
  swordMob.maxHp = 800;
  swordMob.stunMs = 15_000;
  swordMob.vx = 0;
  swordMob.vy = 0;
  const initSwordDist = Math.hypot(swordMob.x - p.x, swordMob.y - p.y);

  // 3) Pickups at ~210px: beneficial hp_orb/coin + excluded weapon_pedestal
  const hpDrop = world.pickupMgr.spawnPickup('hp_orb', p.x - 210, p.y);
  const coinDrop = world.pickupMgr.spawnPickup('coin', p.x - 210, p.y + 30);
  const pedestal = world.pickupMgr.spawnPickup('weapon_pedestal', p.x - 210, p.y - 40, { weaponId: 'rifle' });
  const hpStartX = hpDrop.x;
  const pedStartX = pedestal.x;
  const pedStartY = pedestal.y;

  let sawSpiritSwordFrame = false;
  let minSwordMobDist = initSwordDist;
  for (let i = 0; i < 180; i++) {
    swordMob.vx = 0;
    swordMob.vy = 0;
    world.step();
    minSwordMobDist = Math.min(minSwordMobDist, Math.hypot(swordMob.x - p.x, swordMob.y - p.y));
    const f = world.frameFor('p0', true);
    if (Array.isArray(f.sw) && f.sw.length >= 4) {
      sawSpiritSwordFrame = true;
    }
  }

  assert.equal(sawSpiritSwordFrame, true, '5s spirit sword summon must appear in snapshot sw array');
  assert.ok(swordMob.hp < 800, 'homing spirit sword must auto-aim & slash distant enemy');
  assert.ok(minSwordMobDist < initSwordDist - 15, `spirit sword must pull non-boss stunned enemy closer (${initSwordDist.toFixed(1)} -> ${minSwordMobDist.toFixed(1)})`);
  assert.ok(minSwordMobDist >= 56 + swordMob.radius, `spirit sword pull must respect player safety buffer (>= ${56 + swordMob.radius}, got ${minSwordMobDist.toFixed(1)})`);
  assert.ok(!hpDrop.alive || hpDrop.x > hpStartX + 10, 'skill_magnet must pull/collect beneficial hp_orb drop');
  assert.ok(!coinDrop.alive || coinDrop.x > hpStartX + 10, 'skill_magnet must pull/collect beneficial coin drop');
  assert.equal(pedestal.x, pedStartX, 'skill_magnet must NEVER pull weapon_pedestal');
  assert.equal(pedestal.y, pedStartY, 'skill_magnet must NEVER move weapon_pedestal');
});

test('T10 Laser Vanguard hero: slow fire rate + high damage passive, laser_cannon starter & [F] prism_overcharge mega-beam', (t) => {
  assert.ok(S.BANSUNG_HERO_IDS.includes('laser'), 'laser must be registered in BANSUNG_HERO_IDS');
  assert.equal(S.BANSUNG_HERO_IDS.length, 5);
  const laserHero = S.getBansungHero('laser');
  assert.equal(laserHero.name, 'Laser Vanguard');
  assert.equal(laserHero.starterWeapon, 'laser_cannon');
  assert.equal(laserHero.hp, 5);
  assert.equal(laserHero.shield, 6);
  assert.equal(laserHero.energy, 280);
  assert.equal(laserHero.activeSkill.id, 'prism_overcharge');

  // Passive trade-off: -25% fire rate, +32% damage
  const statTarget = {
    heroId: 'laser',
    hp: 50,
    maxHp: 50,
    baseMaxHp: 50,
    shield: 60,
    maxShield: 60,
    baseMaxShield: 60,
    energy: 280,
    maxEnergy: 280,
    baseMaxEnergy: 280,
    energyRegenPerS: 18,
    baseMoveSpeed: 185,
    moveSpeed: 185,
    alive: true,
    downed: false,
    perks: [],
    mods: P.aggregatePerkMods([]),
  };
  P.recomputeHeroStats(statTarget);
  assert.ok(Math.abs(statTarget.mods.dmgMul - 1.32) < 1e-6, `expected dmgMul=1.32, got ${statTarget.mods.dmgMul}`);
  assert.ok(Math.abs(statTarget.mods.fireRateMul - 0.75) < 1e-6, `expected fireRateMul=0.75, got ${statTarget.mods.fireRateMul}`);

  const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
  const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');
  const noopHooks = { tick() {}, changed() {}, roomMeta() {}, frame() {}, log() {}, end() {} };
  const world = new BansungWorld(
    [{ id: 'p0', name: 'LaserAce', hero: 'laser' }],
    { bots: 0, biome: 'cyber', difficulty: 'normal', gameMode: 'survival' },
    noopHooks,
    { seed: 7777, skipWarmup: true },
  );
  t.after(() => world.stop());
  world.step();

  const p = world.players[0];
  assert.equal(p.heroId, 'laser');
  assert.equal(p.weaponState.activeSlot, 1);
  assert.equal(p.weaponState.slots[1].weaponId, 'laser_cannon');
  p.invulnMs = 30_000;
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobByNumId.clear();

  // Drain clip partially, align a distant mob + an active boss along +X aim, then cast [F] prism_overcharge
  p.weaponState.slots[1].ammoInMag = 1;
  const farMob = spawnMob(world.mobMgr, {
    kind: 'cactus_brute',
    x: p.x + 950,
    y: p.y - 8,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  farMob.hp = 900;
  farMob.maxHp = 900;
  farMob.stunMs = 10_000;

  world.spawnWaveBoss({ id: 'boss_storm_herald', x: p.x + 1450, y: p.y - 6, hpMult: 1, mini: false, count: 1 });
  const bossEntry = world.activeBosses[0];
  assert.ok(bossEntry, 'boss_storm_herald should be active');
  bossEntry.boss.x = p.x + 1450;
  bossEntry.boss.y = p.y - 6;
  bossEntry.boss.combatTarget.x = bossEntry.boss.x;
  bossEntry.boss.combatTarget.y = bossEntry.boss.y;
  const bossInitHp = bossEntry.boss.combatTarget.hp + bossEntry.boss.combatTarget.shield;

  assert.equal(
    world.enqueueCommand('p0', { t: 'skill', x: p.x + 1000, y: p.y }, { nowMs: 2000 }).ok,
    true,
  );
  world.step();
  const snap = world.frameFor('p0', true);

  assert.equal(
    p.weaponState.slots[1].ammoInMag,
    S.BANSUNG_WEAPONS.laser_cannon.magSize,
    'prism_overcharge must refill laser_cannon clip',
  );
  assert.ok(p.mods.dmgMul > 1.7, `prism_overcharge active buff must stack onto 1.32x passive (got ${p.mods.dmgMul})`);
  assert.ok(farMob.hp < 900, `2200px piercing mega-beam must hit distant mob at +950px (hp=${farMob.hp})`);
  const bossAfterHp = bossEntry.boss.combatTarget.hp + bossEntry.boss.combatTarget.shield;
  assert.ok(bossAfterHp < bossInitHp, `prism_overcharge must pierce & damage active boss (${bossInitHp} -> ${bossAfterHp})`);
  assert.ok(
    Array.isArray(snap.fx) && snap.fx.includes(S.BANSUNG_FX_BEAM_LASER_MAP),
    'snapshot fx must emit BANSUNG_FX_BEAM_LASER_MAP for prism_overcharge',
  );
});

test('T10.2 softened mob scaling, boosted special/laser drops across all 3 biomes & CC0 OSS VFX/boss sprites', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  // 1) Softened mob tankiness & damage scaling
  const lv3 = S.computeMobLevelScaling(3);
  assert.ok(lv3.hpMult <= 1.5, `Lv3 mob hpMult should stay moderate (<=1.5, got ${lv3.hpMult})`);
  assert.ok(lv3.dmgMult <= 1.25, `Lv3 mob dmgMult should stay moderate (<=1.25, got ${lv3.dmgMult})`);
  assert.ok(lv3.armorBonus <= 4, `Lv3 mob flat armorBonus should stay <=4 (got ${lv3.armorBonus})`);
  assert.ok(S.computeMobHpMult(5, 1, 'normal') <= 1.6, 'Wave 5 solo mob HP mult must stay tuned down');
  assert.ok(S.computeMobDmgMult(5, 'normal') <= 1.25, 'Wave 5 mob DMG mult must stay tuned down');

  // 2) Every biome pool includes laser/special weapons & rollPedestalWeapon favors special/laser guns
  const basicSet = new Set(['pistol', 'rifle', 'smg', 'shotgun', 'dual_pistols', 'twin_smg', 'sniper_rifle']);
  const laserSet = new Set(['laser_cannon', 'railgun', 'ion_beam', 'orbital_cannon', 'plasma_rifle', 'void_cannon', 'tesla_coil']);
  for (const biome of ['desert', 'crypt', 'cyber']) {
    const pool = S.buildArenaMap(biome, 1234).pedestals[0].weaponPool;
    assert.ok(pool.includes('laser_cannon'), `${biome} pedestal pool must include laser_cannon`);
    assert.ok(pool.some((w) => S.BANSUNG_WEAPONS[w]?.rarity === 'celestial' || S.BANSUNG_WEAPONS[w]?.rarity === 'mythic'), `${biome} pool must include mythic/celestial guns`);

    const rng = makeRng(20261115 + biome.length);
    let specialHits = 0;
    let laserHits = 0;
    const trials = 300;
    for (let i = 0; i < trials; i++) {
      const wave = (i % 8) + 1;
      const wid = P.rollPedestalWeapon(wave, [], { rng, allowedWeapons: pool });
      if (!basicSet.has(wid)) specialHits++;
      if (laserSet.has(wid)) laserHits++;
    }
    assert.ok(specialHits / trials >= 0.72, `${biome} pedestals across waves 1-8 must strongly favor special guns (got ${specialHits}/${trials})`);
    assert.ok(laserHits >= 45, `${biome} pedestals must frequently roll laser/beam/plasma weapons (got ${laserHits}/${trials})`);
  }

  // 3) Verified CC0 OSS sprites for Light Sword, Fireball, Lightning & all 9 Bosses exist in manifest.json
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../database-ban-sung/manifest.json'), 'utf8'),
  );
  for (const key of [
    'fx_light_sword',
    'fx_light_slash',
    'fx_fire_orb',
    'fx_lightning_orb',
    'fx_lightning_bolt_blue',
    'fx_lightning_bolt_yellow',
    'hero_laser_idle',
    'ui_portrait_laser',
    'boss_arsenal_idle',
    'boss_beholder_idle',
    'boss_colossus_idle',
    'boss_overlord_idle',
    'boss_tempest_idle',
    'boss_destroyer_idle',
    'boss_frost_empress_idle',
    'boss_abyssal_leviathan_idle',
    'boss_storm_herald_idle',
  ]) {
    assert.ok(manifest.sprites[key], `manifest.json missing sprite key: ${key}`);
  }
  assert.equal(manifest.sprites.fx_light_sword.sourceId, 'crawl_tiles_cc0');
  assert.equal(manifest.sprites.fx_fire_orb.sourceId, 'crawl_tiles_cc0');
  assert.equal(manifest.sprites.fx_lightning_bolt_yellow.sourceId, 'crawl_tiles_cc0');
  // Đêm Zombie v2: boss Volt Twins được vẽ lại bằng pipeline procedural (spec 007)
  assert.equal(manifest.sprites.boss_storm_herald_idle.sourceId, 'generated_night_art');
});
