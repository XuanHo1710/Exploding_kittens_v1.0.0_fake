'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../dist/shared/src/index.js');
const mobsMod = require('../dist/server/src/game/bansung/mobs.js');
const weaponsMod = require('../dist/server/src/game/bansung/weapons.js');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');

const {
  BANSUNG_ENEMY_IDS,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_FIELDS,
  BANSUNG_WEAPON_IDS,
  BANSUNG_PROJECTILE_KINDS,
  BANSUNG_BOSS_HP_BARS,
  BANSUNG_BOSS_BODY_PARTS,
  getBossHpBars,
  getBansungHero,
  computeMobLevelFromWave,
  computeMobLevelFromTimeS,
  computeMobLevelScaling,
  decodeEnemyMobLevelFromFlags,
  FX_STATUS,
  BANSUNG_FX_STATUS_BOSS_PART_BREAK,
  BANSUNG_FX_STATUS_HERO_SKILL,
} = shared;

const noHooks = { tick() {}, changed() {} };

function assertFinitePlayerState(player, label) {
  assert.ok(Number.isFinite(player.x) && Number.isFinite(player.y), `${label}: finite pos`);
  assert.ok(Number.isFinite(player.hp) && Number.isFinite(player.maxHp), `${label}: finite hp`);
  assert.ok(Number.isFinite(player.shield) && Number.isFinite(player.maxShield), `${label}: finite shield`);
  assert.ok(Number.isFinite(player.stamina) && Number.isFinite(player.maxStamina), `${label}: finite stamina`);
  assert.ok(Number.isFinite(player.energy) && Number.isFinite(player.maxEnergy), `${label}: finite energy`);
}

// ===========================================================================
// 1. Registry Counts & New Content Smoke Check
// ===========================================================================

test('4-bot coop expansion: 36 weapons, 37 projectiles, 37 enemies, boss bar table (x2..x12)', () => {
  assert.equal(BANSUNG_WEAPON_IDS.length, 36);
  assert.equal(BANSUNG_PROJECTILE_KINDS.length, 37);
  assert.equal(BANSUNG_ENEMY_IDS.length, 37);

  for (const wId of [
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
  ]) {
    assert.ok(BANSUNG_WEAPON_IDS.includes(wId), `missing weapon ${wId}`);
  }
  for (const mId of [
    'chrono_mage',
    'plasma_golem',
    'sniper_mech',
    'plague_bearer',
    'crimson_lancer',
    'void_reaper',
    'mirror_knight',
    'magnet_drone',
    'blight_bomber',
    'volt_stalker',
    'solar_priest',
    'magma_brute',
  ]) {
    assert.ok(BANSUNG_ENEMIES[mId], `missing mob ${mId}`);
  }
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_arsenal, 2);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_overlord, 3);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_colossus, 4);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_beholder, 5);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_tempest, 6);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_frost_empress, 7);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_destroyer, 10);
  assert.equal(BANSUNG_BOSS_HP_BARS.boss_abyssal_leviathan, 12);
  assert.equal(getBossHpBars('boss_destroyer', false), 10);
  assert.equal(getBossHpBars('boss_frost_empress', false), 7);
  assert.equal(getBossHpBars('boss_abyssal_leviathan', false), 12);
  assert.equal(getBossHpBars('boss_tempest', true), 3);
});

// ===========================================================================
// 2. Mob Level-Up Every 2/4/6/8/10/... Waves & Survival 2m Milestones + Snapshot Bit-Packing
// ===========================================================================

test('2/4/6/8/10 mob level scaling increases HP & armor and encodes cleanly in snapshot flags', (t) => {
  assert.equal(computeMobLevelFromWave(1), 1);
  assert.equal(computeMobLevelFromWave(2), 2);
  assert.equal(computeMobLevelFromWave(3), 2);
  assert.equal(computeMobLevelFromWave(4), 3);
  assert.equal(computeMobLevelFromWave(6), 4);
  assert.equal(computeMobLevelFromWave(8), 5);
  assert.equal(computeMobLevelFromWave(10), 6);

  assert.equal(computeMobLevelFromTimeS(0), 1);
  assert.equal(computeMobLevelFromTimeS(120), 2);
  assert.equal(computeMobLevelFromTimeS(240), 3);
  assert.equal(computeMobLevelFromTimeS(600), 6);

  const world = new BansungWorld(
    [
      { id: 'bot:0', name: 'Bot Mascot', hero: 'mascot', bot: true },
      { id: 'bot:1', name: 'Bot Ranger', hero: 'ranger', bot: true },
      { id: 'bot:2', name: 'Bot Pyro', hero: 'pyro', bot: true },
      { id: 'bot:3', name: 'Bot Knight', hero: 'knight', bot: true },
    ],
    { bots: 4, biome: 'cyber', difficulty: 'normal', gameMode: 'waves' },
    noHooks,
    { seed: 24680, skipWarmup: true },
  );
  t.after(() => world.stop());

  const anchor = world.players[0];
  const mobW1 = mobsMod.spawnMob(world.mobMgr, {
    kind: 'plasma_golem',
    x: anchor.x + 240,
    y: anchor.y,
    playerCount: 4,
    wave: 1,
    difficulty: 'normal',
  });
  const mobW4 = mobsMod.spawnMob(world.mobMgr, {
    kind: 'plasma_golem',
    x: anchor.x + 280,
    y: anchor.y + 40,
    playerCount: 4,
    wave: 4,
    difficulty: 'normal',
  });
  const mobW10 = mobsMod.spawnMob(world.mobMgr, {
    kind: 'plasma_golem',
    x: anchor.x + 320,
    y: anchor.y + 80,
    playerCount: 4,
    wave: 10,
    difficulty: 'normal',
  });

  assert.equal(mobW1.level, 1);
  assert.equal(mobW4.level, 3);
  assert.equal(mobW10.level, 6);

  const s1 = computeMobLevelScaling(1);
  const s3 = computeMobLevelScaling(3);
  const s6 = computeMobLevelScaling(6);
  assert.equal(s1.hpMult, 1);
  assert.equal(s1.armorBonus, 0);
  assert.ok(s3.armorBonus > s1.armorBonus && s6.armorBonus > s3.armorBonus, 'armor bonus must grow per level');
  assert.ok(mobW4.maxHp > mobW1.maxHp && mobW10.maxHp > mobW4.maxHp, 'HP must scale up at W4 and W10');
  assert.ok(mobW10.flatArmor > mobW4.flatArmor && mobW4.flatArmor > mobW1.flatArmor, 'flatArmor scales at 2/4/6/8/10');

  world.step();
  const frame = world.frameFor('bot:0', true);
  const levelsSeen = new Set();
  const enemiesArr = frame.e || [];
  const stride = Number(BANSUNG_ENEMY_FIELDS) || 8;
  for (let i = 0; i + 7 < enemiesArr.length; i += stride) {
    const lv = decodeEnemyMobLevelFromFlags(enemiesArr[i + 7]);
    levelsSeen.add(lv);
  }
  assert.ok(levelsSeen.has(1), 'frame must decode Lv1 mob');
  assert.ok(levelsSeen.has(3), 'frame must decode Lv3 mob at W4');
  assert.ok(levelsSeen.has(6), 'frame must decode Lv6 mob at W10');
});

// ===========================================================================
// 3. Full 4-Bot Co-op Simulation: 6 New Weapons, 6 New Mobs, 4 Hero [F] Skills & Pickups
// ===========================================================================

test('4-bot coop simulation: 4 AI bots fight 6 new mobs with 6 new weapons, hero [F] skills & boosted resources', (t) => {
  const world = new BansungWorld(
    [
      { id: 'bot:0', name: 'Bot Mascot', hero: 'mascot', bot: true },
      { id: 'bot:1', name: 'Bot Ranger', hero: 'ranger', bot: true },
      { id: 'bot:2', name: 'Bot Pyro', hero: 'pyro', bot: true },
      { id: 'bot:3', name: 'Bot Knight', hero: 'knight', bot: true },
    ],
    { bots: 4, biome: 'cyber', difficulty: 'normal', gameMode: 'survival' },
    noHooks,
    { seed: 42026, skipWarmup: true },
  );
  t.after(() => world.stop());

  assert.equal(world.players.length, 4);
  assert.equal(world.pickupMgr.maxPickups, 144);

  // Equip the 6 new weapons across the 4 bots so bots actually exercise them in combat
  const newWeaponLoadouts = [
    ['plasma_shotgun', 'twin_smg'],
    ['ion_beam', 'cluster_rpg'],
    ['tesla_coil', 'void_cannon'],
    ['plasma_shotgun', 'tesla_coil'],
  ];
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    p.energy = p.maxEnergy;
    weaponsMod.equipWeaponInSlot(p.weaponState, 1, newWeaponLoadouts[i][0]);
    weaponsMod.equipWeaponInSlot(p.weaponState, 2, newWeaponLoadouts[i][1]);
    weaponsMod.switchHeroWeaponSlot(p.weaponState, 1);
    p.slotIdx = 1;
    world.syncWeaponAndHeroState(p);
  }

  // Spawn all 6 new enemy archetypes around the center of the arena
  const cx = world.players[0].x;
  const cy = world.players[0].y;
  const newMobKinds = ['chrono_mage', 'plasma_golem', 'sniper_mech', 'plague_bearer', 'crimson_lancer', 'void_reaper'];
  for (let idx = 0; idx < newMobKinds.length; idx++) {
    const ang = (idx / newMobKinds.length) * Math.PI * 2;
    mobsMod.spawnMob(world.mobMgr, {
      kind: newMobKinds[idx],
      x: cx + Math.cos(ang) * 260,
      y: cy + Math.sin(ang) * 260,
      playerCount: 4,
      wave: 6,
      difficulty: 'normal',
    });
  }

  // Test explicit Hero [F] signature skill trigger for all 4 heroes
  let heroSkillFxCount = 0;
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    p.skillCdMs = 0;
    p.energy = p.maxEnergy;
    const res = world.enqueueCommand(p.id, { t: 'skill', x: p.x + 200, y: p.y });
    assert.equal(res.ok, true, `${p.heroId} skill command must validate`);
  }
  world.step();
  for (let j = 0; j < world.fx.length; j += 6) {
    if (world.fx[j] === FX_STATUS && world.fx[j + 2] === BANSUNG_FX_STATUS_HERO_SKILL) {
      heroSkillFxCount++;
    }
  }
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    const spec = getBansungHero(p.heroId);
    assert.ok(p.skillCdMs >= spec.activeSkill.cooldownMs - 200, `${p.heroId} cooldown armed`);
  }

  // Run 420 simulation ticks (14 seconds at 30 Hz) of 4-bot co-op combat
  let totalDamageDealt = 0;
  for (let stepIdx = 0; stepIdx < 420; stepIdx++) {
    // Keep second wind / resources flowing periodically and keep bots alive under heavy fire
    if (stepIdx % 120 === 60) {
      world.pickupMgr.spawnPickup('energy_orb', world.players[0].x + 40, world.players[0].y, { stack: 3 });
      world.pickupMgr.spawnPickup('xp_orb_l', world.players[1].x + 40, world.players[1].y, { stack: 2 });
    }
    world.clearPendingFx();
    world.clearTickDeltas();
    world.step();
    for (let j = 0; j < world.fx.length; j += 6) {
      if (world.fx[j] === FX_STATUS && world.fx[j + 2] === BANSUNG_FX_STATUS_HERO_SKILL) {
        heroSkillFxCount++;
      }
    }
    // Periodic switch between slot 1 and 2 so all 6 new weapons fire cleanly in combat
    if (stepIdx % 90 === 45) {
      for (let b = 0; b < world.players.length; b++) {
        const bp = world.players[b];
        if (bp.life === 'alive' && !bp.downed) {
          const nextSlot = bp.slotIdx === 1 ? 2 : 1;
          weaponsMod.switchHeroWeaponSlot(bp.weaponState, nextSlot);
          bp.slotIdx = nextSlot;
          world.syncWeaponAndHeroState(bp);
        }
      }
    }
  }

  for (const p of world.players) {
    assertFinitePlayerState(p, p.id);
    totalDamageDealt += p.stats.damageDealt || 0;
  }
  assert.ok(heroSkillFxCount >= 4, `expected >= 4 hero skill FX broadcasts, got ${heroSkillFxCount}`);
  assert.ok(totalDamageDealt > 0, `4 bots must deal damage during simulation, got ${totalDamageDealt}`);

  const snap = world.frameFor('bot:0', true);
  assert.ok(snap.me.skillName && snap.me.skillName.length > 0, 'snapshot.me must expose hero active skillName');
  assert.ok(snap.me.skillMaxMs > 0, 'snapshot.me must expose skillMaxMs');
});

// ===========================================================================
// 4. Multi-Bar Boss HP (x6 Tempest, x10 Destroyer) & Destructible Boss Body Parts
// ===========================================================================

test('multi-bar bosses (Tempest x6, Destroyer x10) & destructible body parts stun boss and unlock enraged skill', (t) => {
  const world = new BansungWorld(
    [
      { id: 'bot:0', name: 'Bot Mascot', hero: 'mascot', bot: true },
      { id: 'bot:1', name: 'Bot Ranger', hero: 'ranger', bot: true },
      { id: 'bot:2', name: 'Bot Pyro', hero: 'pyro', bot: true },
      { id: 'bot:3', name: 'Bot Knight', hero: 'knight', bot: true },
    ],
    { bots: 4, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noHooks,
    { seed: 77710, skipWarmup: true },
  );
  t.after(() => world.stop());

  // Make bots resilient while we inspect boss multi-bar & part-break behavior
  for (const p of world.players) {
    p.invulnTimer = 30;
  }

  // Spawn Destroyer Boss (x10 bars) via internal spawnWaveBoss path
  const anchor = world.players[0];
  world.spawnWaveBoss({
    id: 'boss_destroyer',
    x: anchor.x + 240,
    y: anchor.y,
    hpMult: 1,
    mini: false,
    count: 1,
  });

  assert.equal(world.activeBosses.length, 1);
  const destroyerEntry = world.activeBosses[0];
  assert.equal(destroyerEntry.kind, 'boss_destroyer');
  assert.ok(destroyerEntry.partGroup.parts.length >= 3, 'Destroyer must expose destructible body parts');

  world.step();
  const initialFrame = world.frameFor('bot:0', true);
  const initialBosses = [initialFrame.bs, ...(initialFrame.bs2 || [])].filter(Boolean);
  assert.equal(initialBosses.length, 1);
  const bossFrameBefore = initialBosses[0];
  assert.equal(bossFrameBefore.hpBars, 10, 'Destroyer boss frame must declare 10 HP bars');
  assert.ok(Array.isArray(bossFrameBefore.parts) && bossFrameBefore.parts.length >= 3, 'frame must include parts');
  assert.equal(bossFrameBefore.parts.every((pt) => !pt.broken), true);

  // Destroy first body part via combatTarget HP depletion (simulating concentrated focus fire)
  const hpBeforeBreak = destroyerEntry.boss.hp;
  const targetPart = destroyerEntry.partGroup.parts[0];
  targetPart.combatTarget.hp = 0;
  targetPart.combatTarget.alive = false;

  let sawPartBreakFx = false;
  world.clearPendingFx();
  world.step();
  for (let j = 0; j < world.fx.length; j += 6) {
    if (world.fx[j] === FX_STATUS && world.fx[j + 2] === BANSUNG_FX_STATUS_BOSS_PART_BREAK) {
      sawPartBreakFx = true;
    }
  }
  const logs = world.drainLogs();

  assert.equal(targetPart.broken, true, 'destroyed part must be marked broken');
  assert.ok(
    destroyerEntry.boss.stunTicks > 0 && destroyerEntry.boss.state === 'stunned',
    'breaking a part must stun Destroyer boss',
  );
  assert.ok(destroyerEntry.boss.hp < hpBeforeBreak, 'breaking a part must inflict shatter damage on boss HP');
  assert.ok(
    destroyerEntry.partGroup.unlockedSkills.includes(targetPart.unlocksSkill),
    `must unlock enraged skill ${targetPart.unlocksSkill}`,
  );
  assert.equal(sawPartBreakFx, true, 'must emit BANSUNG_FX_STATUS_BOSS_PART_BREAK status FX');
  assert.ok(
    logs.some((line) => line.includes('CHOÁNG')),
    'world log must announce part break & stun',
  );

  // Advance boss AI 180 ticks (6s) so stun expires and boss executes unlocked skill cleanly
  for (let k = 0; k < 180; k++) {
    world.step();
  }
  const afterFrame = world.frameFor('bot:0', true);
  const afterBosses = [afterFrame.bs, ...(afterFrame.bs2 || [])].filter(Boolean);
  assert.ok(
    Array.isArray(afterBosses[0]?.unlockedSkills) &&
      afterBosses[0].unlockedSkills.includes(targetPart.unlocksSkill),
    'snapshot must advertise unlockedSkills',
  );

  // Destroy second Destroyer body part via real Hero skill damage (Knight Aegis Slam within 180px)
  const secondPart = destroyerEntry.partGroup.parts[1];
  if (secondPart) {
    secondPart.combatTarget.hp = 15;
    const knight = world.players.find((pl) => pl.heroId === 'knight');
    knight.x = secondPart.x - 20;
    knight.y = secondPart.y;
    knight.skillCdMs = 0;
    knight.energy = knight.maxEnergy;
    world.enqueueCommand(knight.id, { t: 'skill', x: secondPart.x, y: secondPart.y });
    for (let k = 0; k < 4; k++) world.step();
    assert.equal(secondPart.broken, true, 'real hero active skill AoE must break weakened boss part');
    assert.ok(
      destroyerEntry.partGroup.unlockedSkills.includes(secondPart.unlocksSkill),
      'second unlocked skill registered after real damage part break',
    );
  }

  // Also test Tempest Lord (x6 HP bars) & Arsenal (x2 HP bars)
  world.spawnWaveBoss({
    id: 'boss_tempest',
    x: anchor.x - 260,
    y: anchor.y,
    hpMult: 1,
    mini: false,
    count: 1,
  });
  world.spawnWaveBoss({
    id: 'boss_arsenal',
    x: anchor.x + 260,
    y: anchor.y - 240,
    hpMult: 1,
    mini: false,
    count: 1,
  });
  const tempestEntry = world.activeBosses.find((b) => b.kind === 'boss_tempest');
  const arsenalEntry = world.activeBosses.find((b) => b.kind === 'boss_arsenal');
  assert.ok(tempestEntry && arsenalEntry, 'Tempest & Arsenal bosses must spawn cleanly');
  assert.equal(BANSUNG_BOSS_BODY_PARTS.boss_tempest.length >= 3, true);
  tempestEntry.partGroup.parts[0].combatTarget.hp = 0;
  tempestEntry.partGroup.parts[0].combatTarget.alive = false;

  for (let k = 0; k < 60; k++) {
    world.step();
  }
  assert.equal(tempestEntry.partGroup.parts[0].broken, true);
  const frameBoth = world.frameFor('bot:0', true);
  const allBossFrames = [frameBoth.bs, ...(frameBoth.bs2 || [])].filter(Boolean);
  const tempestFrame = allBossFrames.find((b) => b.kind === 'boss_tempest');
  const arsenalFrame = allBossFrames.find((b) => b.kind === 'boss_arsenal');
  assert.ok(tempestFrame && tempestFrame.hpBars === 6, 'Tempest boss frame must advertise 6 HP bars');
  assert.ok(arsenalFrame && arsenalFrame.hpBars === 2, 'Arsenal boss frame must advertise 2 HP bars');
  assert.ok(allBossFrames.some((b) => b.kind === 'boss_destroyer' && b.hpBars === 10));
});

// ===========================================================================
// 6. V2 Expansion 4-Bot Simulation: Frost Empress (x7), Leviathan (x12), 6 Mobs & 6 Weapons
// ===========================================================================

test('4-bot coop V2 expansion: Frost Empress (x7), Abyssal Leviathan (x12), 6 new mobs & 6 new weapons', (t) => {
  const world = new BansungWorld(
    [
      { id: 'bot:0', name: 'Bot Mascot', hero: 'mascot', bot: true },
      { id: 'bot:1', name: 'Bot Ranger', hero: 'ranger', bot: true },
      { id: 'bot:2', name: 'Bot Pyro', hero: 'pyro', bot: true },
      { id: 'bot:3', name: 'Bot Knight', hero: 'knight', bot: true },
    ],
    { bots: 4, biome: 'crypt', difficulty: 'normal', gameMode: 'survival' },
    noHooks,
    { seed: 72026, skipWarmup: true },
  );
  t.after(() => world.stop());

  const v2Loadouts = [
    ['blizzard_carbine', 'ricochet_disc'],
    ['phantom_bow', 'magma_spitter'],
    ['chronos_rifle', 'orbital_cannon'],
    ['blizzard_carbine', 'chronos_rifle'],
  ];
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i];
    p.energy = p.maxEnergy;
    weaponsMod.equipWeaponInSlot(p.weaponState, 1, v2Loadouts[i][0]);
    weaponsMod.equipWeaponInSlot(p.weaponState, 2, v2Loadouts[i][1]);
    weaponsMod.switchHeroWeaponSlot(p.weaponState, 1);
    p.slotIdx = 1;
    world.syncWeaponAndHeroState(p);
  }

  const cx = world.players[0].x;
  const cy = world.players[0].y;
  const v2Mobs = ['mirror_knight', 'magnet_drone', 'blight_bomber', 'volt_stalker', 'solar_priest', 'magma_brute'];
  for (let idx = 0; idx < v2Mobs.length; idx++) {
    const ang = (idx / v2Mobs.length) * Math.PI * 2;
    mobsMod.spawnMob(world.mobMgr, {
      kind: v2Mobs[idx],
      x: cx + Math.cos(ang) * 230,
      y: cy + Math.sin(ang) * 230,
      playerCount: 4,
      wave: 8,
      difficulty: 'normal',
    });
  }

  for (let stepIdx = 0; stepIdx < 240; stepIdx++) {
    if (stepIdx === 120) {
      for (const bp of world.players) {
        if (bp.life === 'alive' && !bp.downed) {
          weaponsMod.switchHeroWeaponSlot(bp.weaponState, 2);
          bp.slotIdx = 2;
          world.syncWeaponAndHeroState(bp);
        }
      }
    }
    world.step();
    for (const h of world.mobMgr.hazards) {
      assert.ok(h.ttlTicks <= 150, `hazard ttlTicks ${h.ttlTicks} must stay <= 5s (150t)`);
    }
  }

  const teamDmg = world.players.reduce((s, p) => s + p.stats.damageDealt, 0);
  assert.ok(teamDmg > 0, `4-bot V2 weapons must deal damage (got ${teamDmg})`);

  // Spawn Frost Empress (x7) & Abyssal Leviathan (x12) simultaneously
  world.spawnWaveBoss({ id: 'boss_frost_empress', x: cx + 240, y: cy, hpMult: 1, mini: false, count: 1 });
  world.spawnWaveBoss({ id: 'boss_abyssal_leviathan', x: cx - 240, y: cy, hpMult: 1, mini: false, count: 1 });

  const frostEntry = world.activeBosses.find((b) => b.kind === 'boss_frost_empress');
  const leviathanEntry = world.activeBosses.find((b) => b.kind === 'boss_abyssal_leviathan');
  assert.ok(frostEntry && leviathanEntry, 'Frost Empress & Abyssal Leviathan must spawn');
  assert.equal(frostEntry.partGroup.parts.length, 4);
  assert.equal(leviathanEntry.partGroup.parts.length, 4);

  const frostHpBefore = frostEntry.boss.hp;
  const levHpBefore = leviathanEntry.boss.hp;
  frostEntry.partGroup.parts[0].combatTarget.hp = 0;
  frostEntry.partGroup.parts[0].combatTarget.alive = false;
  leviathanEntry.partGroup.parts[0].combatTarget.hp = 0;
  leviathanEntry.partGroup.parts[0].combatTarget.alive = false;

  world.step();
  assert.equal(frostEntry.partGroup.parts[0].broken, true);
  assert.equal(leviathanEntry.partGroup.parts[0].broken, true);
  assert.ok(frostEntry.boss.stunTicks > 0 && frostEntry.boss.state === 'stunned');
  assert.ok(leviathanEntry.boss.stunTicks > 0 && leviathanEntry.boss.state === 'stunned');
  assert.ok(frostEntry.boss.hp < frostHpBefore, 'breaking Frost Empress part must deal shatter damage');
  assert.ok(leviathanEntry.boss.hp < levHpBefore, 'breaking Leviathan part must deal shatter damage');

  for (let k = 0; k < 120; k++) {
    world.step();
  }
  const f = world.frameFor('bot:0', true);
  const bf = [f.bs, ...(f.bs2 || [])].filter(Boolean);
  assert.ok(bf.some((b) => b.kind === 'boss_frost_empress' && b.hpBars === 7), 'Frost Empress must advertise 7 HP bars');
  assert.ok(bf.some((b) => b.kind === 'boss_abyssal_leviathan' && b.hpBars === 12), 'Leviathan must advertise 12 HP bars');
  for (const p of world.players) {
    assertFinitePlayerState(p, `V2 ${p.id}`);
  }
});
