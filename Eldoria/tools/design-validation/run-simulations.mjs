#!/usr/bin/env node
/**
 * Real Design-Time Balancing Simulation Suite for Eldoria: Forgotten Wilds
 * Runs deterministic seeded simulations against canonical game-data/*.json and docs/balancing/*.csv:
 *  1. Gacha Monte Carlo (100,000 pulls per banner) with Soft/Hard Pity, Epic 10-pity, and 50/50 Guarantee
 *  2. Weapon Enhancement (+0 -> +10) Farming Time & Gold/Material Audit (Casual, Regular, Hardcore)
 *  3. Combat DPS, TTK & Class/Rarity Parity Simulation (Lv 1, 15 [MVP Boss], 30, 60, 100)
 *  4. 30-Day Economy Faucet vs Sink Simulation (Gold & Starlight Shard inflation audit)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'game-data', f), 'utf8'));

// Deterministic PRNG (Mulberry32) so every simulation run is 100% reproducible
function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const charactersData = readJson('characters.json').characters;
const skillsData = readJson('skills.json').skills;
const monstersData = readJson('monsters.json').monsters;
const bossesData = readJson('bosses.json').bosses;
const itemsData = readJson('items.json').items;
const gachaJson = readJson('gacha-banners.json');

// ============================================================
// 1. GACHA MONTE CARLO SIMULATION (100,000 PULLS PER BANNER)
// ============================================================
function simulateBanner(banner, totalPulls, seed) {
  const rng = createRng(seed);
  const counts = { MYTHIC: 0, LEGENDARY: 0, EPIC: 0, RARE: 0, UNCOMMON: 0, COMMON: 0 };
  const baseTop = banner.baseRates.MYTHIC + banner.baseRates.LEGENDARY;
  const baseLowerSum = 1 - baseTop;
  const pityCfg = banner.pity;
  const mythSplit = pityCfg.pityConditionalSplit.MYTHIC;
  const has5050 = Boolean(pityCfg.featuredGuarantee);

  let pity = 0; // consecutive pulls without MYTHIC/LEGENDARY
  let epicPity = 0;
  let guaranteedFeatured = false;
  let topPullIntervals = [];
  let featuredTopCount = 0;
  let totalStarEssence = 0;

  const owned = new Set();
  const constellations = {};
  const dupRules = gachaJson.duplicateConversion[banner.rewardCategory];

  for (let i = 1; i <= totalPulls; i++) {
    pity++;
    epicPity++;

    let topRate = baseTop;
    if (pity >= pityCfg.hardPity) {
      topRate = 1.0;
    } else if (pity >= pityCfg.softPityStart) {
      topRate = Math.min(1.0, baseTop + (pity - pityCfg.softPityStart + 1) * pityCfg.softPitySlope);
    }

    const r = rng();
    let rarity;
    if (r < topRate) {
      rarity = rng() < mythSplit ? 'MYTHIC' : 'LEGENDARY';
    } else if (epicPity >= pityCfg.epicPity) {
      rarity = 'EPIC';
    } else {
      const rem = 1 - topRate;
      const scale = rem / baseLowerSum;
      const pEpic = banner.baseRates.EPIC * scale;
      const pRare = banner.baseRates.RARE * scale;
      const pUncommon = banner.baseRates.UNCOMMON * scale;
      const u = r - topRate;
      if (u < pEpic) rarity = 'EPIC';
      else if (u < pEpic + pRare) rarity = 'RARE';
      else if (u < pEpic + pRare + pUncommon) rarity = 'UNCOMMON';
      else rarity = 'COMMON';
    }

    counts[rarity]++;

    if (rarity === 'MYTHIC' || rarity === 'LEGENDARY') {
      topPullIntervals.push(pity);
      pity = 0;
      epicPity = 0;
      if (has5050) {
        if (guaranteedFeatured || rng() < 0.5) {
          featuredTopCount++;
          guaranteedFeatured = false;
        } else {
          guaranteedFeatured = true;
        }
      }
    } else if (rarity === 'EPIC') {
      epicPity = 0;
    }

    const pool = banner.pool[rarity];
    const pickedId = pool[Math.floor(rng() * pool.length)];
    if (banner.rewardCategory === 'CHARACTER') {
      if (owned.has(pickedId)) {
        const cLvl = constellations[pickedId] || 0;
        if (cLvl < 6) {
          constellations[pickedId] = cLvl + 1;
          totalStarEssence += dupRules[rarity].withinConstellationCap.starEssence;
        } else {
          totalStarEssence += dupRules[rarity].overflowBeyondC6.starEssence;
        }
      } else {
        owned.add(pickedId);
      }
    } else {
      totalStarEssence += dupRules[rarity].starEssence;
    }
  }

  const topTotal = counts.MYTHIC + counts.LEGENDARY;
  const avgPullsPerTop = topTotal > 0 ? totalPulls / topTotal : 0;
  const avgShardPerTop = avgPullsPerTop * banner.cost.singlePull;
  const sortedIntervals = [...topPullIntervals].sort((a, b) => a - b);
  const p50Interval = sortedIntervals[Math.floor(sortedIntervals.length * 0.5)] || 0;
  const p90Interval = sortedIntervals[Math.floor(sortedIntervals.length * 0.9)] || 0;

  return {
    bannerId: banner.id,
    totalPulls,
    seed,
    empiricalRatesPct: Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, Number(((v / totalPulls) * 100).toFixed(4))])
    ),
    baseRatesPct: Object.fromEntries(
      Object.entries(banner.baseRates).map(([k, v]) => [k, Number((v * 100).toFixed(4))])
    ),
    topTierCount: topTotal,
    effectiveTopRatePct: Number(((topTotal / totalPulls) * 100).toFixed(4)),
    avgPullsPerTop: Number(avgPullsPerTop.toFixed(2)),
    avgShardsPerTop: Math.round(avgShardPerTop),
    p50PullsToTop: p50Interval,
    p90PullsToTop: p90Interval,
    maxPullsObserved: sortedIntervals[sortedIntervals.length - 1] || 0,
    featuredTopRatePct: has5050 && topTotal > 0 ? Number(((featuredTopCount / topTotal) * 100).toFixed(2)) : null,
    avgStarEssencePer10Pull: Number(((totalStarEssence / totalPulls) * 10).toFixed(2)),
  };
}

const gachaResults = [
  simulateBanner(gachaJson.banners.find(b => b.id === 'bnr_perm_heroes'), 100000, 20261119),
  simulateBanner(gachaJson.banners.find(b => b.id === 'bnr_perm_arsenal'), 100000, 20261120),
  simulateBanner(gachaJson.banners.find(b => b.id === 'bnr_lim_storm_sovereign'), 100000, 20261121),
];

// ============================================================
// 2. WEAPON ENHANCEMENT (+0 -> +10) SIMULATION
// ============================================================
const csvLines = fs.readFileSync(path.join(ROOT, 'docs', 'balancing', 'weapon-upgrade-costs.csv'), 'utf8')
  .trim().split(/\r?\n/).slice(1);

const enhanceRows = csvLines.map(line => {
  const c = line.split(',');
  return {
    from: Number(c[0]),
    to: Number(c[1]),
    bsLv: Number(c[2]),
    atkPct: Number(c[6]),
    flatAtk: Number(c[7]),
    gold: Number(c[9]),
    hrsCasual: Number(c[17]),
    hrsRegular: Number(c[18]),
    hrsHardcore: Number(c[19]),
  };
});

const totalGoldTo10 = enhanceRows.reduce((s, r) => s + r.gold, 0);
const totalHrsCasual = Number(enhanceRows.reduce((s, r) => s + r.hrsCasual, 0).toFixed(2));
const totalHrsRegular = Number(enhanceRows.reduce((s, r) => s + r.hrsRegular, 0).toFixed(2));
const totalHrsHardcore = Number(enhanceRows.reduce((s, r) => s + r.hrsHardcore, 0).toFixed(2));

const sampleWeapon = itemsData.find(i => i.id === 'wpn_iron_longsword');
const sampleBaseAtk = sampleWeapon.baseStats.atk;
const enhancementCurve = enhanceRows.map(r => ({
  level: `+${r.to}`,
  blacksmithLv: r.bsLv,
  weaponAtk: Math.floor(sampleBaseAtk * (1 + r.atkPct / 100) + r.flatAtk),
  goldStep: r.gold,
}));

const enhancementResults = {
  sampleWeaponId: sampleWeapon.id,
  sampleBaseAtk,
  finalPlus10Atk: enhancementCurve[enhancementCurve.length - 1].weaponAtk,
  totalGold0To10: totalGoldTo10,
  archetypes: {
    casual_1h_day: { totalHours: totalHrsCasual, estimatedDays: Number((totalHrsCasual / 1.0).toFixed(1)) },
    regular_2_5h_day: { totalHours: totalHrsRegular, estimatedDays: Number((totalHrsRegular / 2.5).toFixed(1)) },
    hardcore_5h_day: { totalHours: totalHrsHardcore, estimatedDays: Number((totalHrsHardcore / 5.0).toFixed(1)) },
  },
  curve: enhancementCurve,
};

// ============================================================
// 3. COMBAT DPS, TTK & RARITY PARITY SIMULATION
// ============================================================
function computeHeroPower(hero, level, weaponBaseAtk, enhLevel, foodAtkPct = 0) {
  const g = hero.statGrowthPerLevel;
  const b = hero.baseStats;
  const enhRow = enhLevel > 0 ? enhanceRows[enhLevel - 1] : { atkPct: 0, flatAtk: 0 };
  const weaponAtk = Math.floor(weaponBaseAtk * (1 + enhRow.atkPct / 100) + enhRow.flatAtk);

  const str = b.str + g.str * (level - 1) + (hero.role === 'MELEE_DPS' || hero.role === 'HYBRID' ? (level - 1) * 3 : (level - 1) * 1);
  const dex = b.dex + g.dex * (level - 1) + (hero.role === 'RANGED_DPS' ? (level - 1) * 3 : (level - 1) * 1);
  const intel = b.int + g.int * (level - 1) + (hero.role === 'MAGIC_DPS' || hero.role === 'SUPPORT' ? (level - 1) * 3 : (level - 1) * 0.5);
  const vit = b.vit + g.vit * (level - 1) + (hero.role === 'TANK' ? (level - 1) * 3 : (level - 1) * 1.5);
  const agi = b.agi + g.agi * (level - 1) + (level - 1) * 0.5;
  const luk = b.luk + g.luk * (level - 1) + (level - 1) * 0.5;

  const isMagic = hero.role === 'MAGIC_DPS' || hero.role === 'SUPPORT';
  const asc = level >= 90 ? 5 : level >= 75 ? 4 : level >= 60 ? 3 : level >= 40 ? 2 : level >= 20 ? 1 : 0;
  const totalAtk = (b.atk + g.atk * (level - 1) + (isMagic ? 2.2 * intel : 2.4 * str + 1.4 * dex) + weaponAtk) * (1 + 0.06 * asc + foodAtkPct);
  const maxHp = Math.floor(b.hp + g.hp * (level - 1) + 18 * vit + 4 * str);
  const def = Math.floor(b.def + g.def * (level - 1) + 1.8 * vit + 0.6 * str);
  const critRate = Math.min(0.75, b.critRate + 0.0025 * dex + 0.0035 * luk + (enhLevel >= 5 ? 0.03 : 0));
  const critDmg = Math.min(2.50, b.critDamage + 0.004 * luk);
  const atkSpd = Math.min(1.60, b.attackSpeed + 0.003 * agi + 0.002 * dex);
  const cdr = Math.min(0.40, b.cdr + 0.0015 * intel);

  // Average DPS over a 20s rotation:
  // (a) rawBurstDps: unconstrained theoretical skill+basic sum
  // (b) sustainedDps: realistic action-combat rotation bounded by mana regen (4% MaxMP/s + 2 MP/s) and animation time budget (55% basic uptime during dodge/recovery)
  const heroSkills = skillsData.filter(s => s.characterId === hero.id && s.skillType !== 'PASSIVE');
  const maxMp = b.mp + g.mp * (level - 1) + 10 * intel + 2 * vit;
  const mpRegenPerSec = 2 + 0.04 * maxMp;
  let skillDpsUnconstrained = 0;
  let totalMpPerSecDemand = 0;
  for (const sk of heroSkills) {
    if ((sk.baseDamage || 0) <= 0 && (sk.scalingRatio || 0) <= 0) continue;
    const rank = Math.min(sk.maxRank || 10, Math.max(1, Math.floor(level / 4)));
    const upg = sk.upgradeScalingPerRank || {};
    const baseDmgAdd = (upg.baseDamageFlat || 0) * (rank - 1);
    const ratioAdd = (upg.scalingRatioAdd || 0) * (rank - 1);
    const cdRed = (upg.cooldownReductionMs || 0) * (rank - 1);
    const cdSec = Math.max(0.4, (Math.max(400, sk.cooldownMs - cdRed) / 1000) * (1 - cdr));
    const effRatio = (sk.scalingRatio + ratioAdd) * (enhLevel === 10 ? 1.05 : 1.0);
    const raw = (sk.baseDamage || 0) + baseDmgAdd + totalAtk * effRatio;
    skillDpsUnconstrained += raw / cdSec;
    totalMpPerSecDemand += (sk.manaCost || 0) / cdSec;
  }
  const mpThrottle = totalMpPerSecDemand > 0 ? Math.min(1.0, mpRegenPerSec / totalMpPerSecDemand) : 1.0;
  const basicDps = totalAtk * 0.95 * atkSpd;
  const expectedCritMult = 1 + critRate * (critDmg - 1);
  const rawDps = (basicDps * 0.65 + skillDpsUnconstrained * 0.85) * expectedCritMult;
  const sustainedDps = (basicDps * 0.50 + skillDpsUnconstrained * mpThrottle * 0.70) * expectedCritMult;

  return {
    heroId: hero.id,
    rarity: hero.rarity,
    role: hero.role,
    level,
    maxHp,
    maxMp: Math.round(maxMp),
    totalAtk: Math.round(totalAtk),
    def,
    critRatePct: Number((critRate * 100).toFixed(1)),
    cdrPct: Number((cdr * 100).toFixed(1)),
    mpThrottlePct: Number((mpThrottle * 100).toFixed(1)),
    rawDps: Math.round(rawDps),
    sustainedDps: Math.round(sustainedDps),
  };
}

// Parity check across all 12 heroes at Lv 15 (+5 weapon, baseAtk 32) and Lv 60 (+10 weapon, baseAtk 110)
const parityLv15 = charactersData.map(h => computeHeroPower(h, 15, 32, 5, 0.12));
const parityLv60 = charactersData.map(h => computeHeroPower(h, 60, 110, 10, 0.15));

// Boss TTK check across all 5 bosses using sustained mana-constrained DPS & 65% dodge/phase uptime
const kaelHero = charactersData.find(h => h.id === 'chr_kael_vanguard');
const bossTierGear = {
  boss_thornback_elder: { lv: 15, wpnAtk: 26, enh: 5 },
  boss_ignis_forgelord: { lv: 30, wpnAtk: 52, enh: 7 },
  boss_prism_leviathan: { lv: 50, wpnAtk: 85, enh: 8 },
  boss_boreas_frostking: { lv: 75, wpnAtk: 130, enh: 9 },
  boss_malakor_abyss: { lv: 100, wpnAtk: 185, enh: 10 },
};
const allBossTtk = bossesData.map(b => {
  const cfg = bossTierGear[b.id];
  const heroPow = computeHeroPower(kaelHero, cfg.lv, cfg.wpnAtk, cfg.enh, 0.12);
  const defConst = 100 + 12 * cfg.lv;
  const defMult = defConst / (defConst + b.baseStats.def);
  const soloSustainedDps = heroPow.sustainedDps * defMult * 0.65 * 1.07;
  const soloTtkSec = Math.round(b.baseStats.hp / soloSustainedDps);
  const p4Mult = b.partyScaling?.['4']?.hpMultiplier || b.partyScaling?.find?.(p => p.players === 4)?.hpMultiplier || 3.1;
  const party4Hp = Math.round(b.baseStats.hp * p4Mult);
  const party4TtkSec = Math.round(party4Hp / (soloSustainedDps * 2.85)); // 2 DPS + 1 Tank + 1 Healer ≈ 2.85x solo DPS
  return {
    bossId: b.id,
    level: b.level,
    bossHp: b.baseStats.hp,
    bossDef: b.baseStats.def,
    enrageSec: b.enrageMechanic.enrageTimerSeconds,
    soloSustainedDps: Math.round(soloSustainedDps),
    soloTtkSec,
    party4ScaledHp: party4Hp,
    party4TtkSec,
    recommendedPacingTargetSec: '120-210',
    pacingDiagnosis: soloTtkSec < 120 ? 'TOO_FAST_NEEDS_HP_OR_STAT_TUNING' : (soloTtkSec > b.enrageMechanic.enrageTimerSeconds ? 'TOO_SLOW_ENRAGE_RISK' : 'HEALTHY'),
  };
});

const combatResults = {
  allBossTtkCheck: allBossTtk,
  rarityParityLv15: parityLv15.map(p => ({ heroId: p.heroId, rarity: p.rarity, role: p.role, totalAtk: p.totalAtk, rawDps: p.rawDps, sustainedDps: p.sustainedDps })),
  rarityParityLv60: parityLv60.map(p => ({ heroId: p.heroId, rarity: p.rarity, role: p.role, totalAtk: p.totalAtk, rawDps: p.rawDps, sustainedDps: p.sustainedDps })),
};

// ============================================================
// 4. 30-DAY ECONOMY FAUCET VS SINK SIMULATION (GOLD & SHARDS)
// ============================================================
function simulateEconomy30Days(profileName, hoursPerDay) {
  let gold = 200; // starter
  let shards = 0;
  let totalGoldIn = 200;
  let totalGoldOut = 0;
  let totalShardsIn = 0;
  let totalShardsOut = 0;
  let totalPullsMade = 0;

  // Milestone sinks over 30 days
  const buildingUpgrades = [400, 900, 1500, 2200, 3500, 5000, 7500]; // House, Storage, Coop, Kitchen, Blacksmith Lv1..4
  let bIdx = 0;
  let enhanceIdx = 0;
  let respecDone = false;

  const dailySnapshots = [];
  for (let day = 1; day <= 30; day++) {
    // Faucets per day
    const mobGold = Math.round(hoursPerDay * 340);
    const farmGold = Math.round(Math.min(2.5, hoursPerDay) * 260);
    const questGold = day <= 12 ? 320 : 180; // daily/repeatable quests after onboarding
    const bossGold = day % 3 === 0 ? 650 : 0;
    const dayGoldIn = mobGold + farmGold + questGold + bossGold;
    gold += dayGoldIn;
    totalGoldIn += dayGoldIn;

    // Starlight Shards Faucets (100% in-game)
    let dayShards = 80; // daily exploration / quest baseline
    if (day <= 12) dayShards += 186; // 12 MVP quests -> ~2,240 shards
    if (day === 4) dayShards += 480; // Boss Thornback First Clear
    if (day % 7 === 0) dayShards += 240; // Weekly boss + achievements
    shards += dayShards;
    totalShardsIn += dayShards;

    // Routine Gold Sinks (seeds, animal feed, repair, crafting fees, food)
    const routineSink = Math.round(hoursPerDay * 210 + 120);
    const actualRoutine = Math.min(gold, routineSink);
    gold -= actualRoutine;
    totalGoldOut += actualRoutine;

    // Capital Sinks: Buildings & Weapon Enhancement +0 -> +10
    if (bIdx < buildingUpgrades.length && gold >= buildingUpgrades[bIdx] + 400) {
      gold -= buildingUpgrades[bIdx];
      totalGoldOut += buildingUpgrades[bIdx];
      bIdx++;
    }
    if (enhanceIdx < enhanceRows.length && gold >= enhanceRows[enhanceIdx].gold + 300) {
      gold -= enhanceRows[enhanceIdx].gold;
      totalGoldOut += enhanceRows[enhanceIdx].gold;
      enhanceIdx++;
    }
    if (!respecDone && day === 18 && gold >= 4000) {
      gold -= 3750;
      totalGoldOut += 3750;
      respecDone = true;
    }

    // Gacha 10-pulls whenever player accumulates 1600 Starlight Shards
    while (shards >= 1600) {
      shards -= 1600;
      totalShardsOut += 1600;
      totalPullsMade += 10;
    }

    if (day === 1 || day === 7 || day === 14 || day === 30) {
      dailySnapshots.push({
        day,
        goldBalance: gold,
        shardsBalance: shards,
        weaponEnhReached: `+${enhanceIdx}`,
        buildingsCompleted: bIdx,
        cumulativePulls: totalPullsMade,
      });
    }
  }

  return {
    profile: profileName,
    hoursPerDay,
    totalGoldIn,
    totalGoldOut,
    endingGold: gold,
    sinkToFaucetRatioPct: Number(((totalGoldOut / totalGoldIn) * 100).toFixed(1)),
    totalShardsIn,
    totalShardsOut,
    endingShards: shards,
    totalFreePulls30d: totalPullsMade,
    weaponEnhancementReached: `+${enhanceIdx}`,
    buildingsCompleted: `${bIdx}/${buildingUpgrades.length}`,
    snapshots: dailySnapshots,
  };
}

const economyResults = [
  simulateEconomy30Days('Casual (1.0h/ngày)', 1.0),
  simulateEconomy30Days('Regular (2.5h/ngày)', 2.5),
  simulateEconomy30Days('Hardcore (5.0h/ngày)', 5.0),
];

const report = {
  executedAt: new Date().toISOString(),
  nodeVersion: process.version,
  gachaMonteCarlo100k: gachaResults,
  weaponEnhancement: enhancementResults,
  combatAndParity: combatResults,
  economy30Days: economyResults,
};

console.log(JSON.stringify(report, null, 2));
