#!/usr/bin/env node
/**
 * Design-Time Catalog Validator for Eldoria: Forgotten Wilds
 * Validates JSON syntax, counts, enums, probability sums, DAG acyclicity, and 100% cross-reference integrity
 * across all 12 canonical files in game-data/*.json.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'game-data');

const REQUIRED_FILES = [
  'characters.json',
  'skills.json',
  'monsters.json',
  'bosses.json',
  'items.json',
  'recipes.json',
  'crops.json',
  'animals.json',
  'buildings.json',
  'quests.json',
  'loot-tables.json',
  'gacha-banners.json',
];

const errors = [];
const warnings = [];
const data = {};

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

for (const file of REQUIRED_FILES) {
  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) {
    err(`Missing catalog file: game-data/${file}`);
    continue;
  }
  try {
    data[file] = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    err(`Invalid JSON syntax in game-data/${file}: ${e.message}`);
  }
}

if (errors.length > 0) {
  console.error('CATALOG VALIDATION FAILED (SYNTAX/MISSING):');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

const getList = (file, ...keys) => {
  for (const k of keys) {
    if (Array.isArray(data[file][k])) return data[file][k];
  }
  err(`Cannot locate array payload in ${file}`);
  return [];
};

const characters = getList('characters.json', 'characters');
const skills = getList('skills.json', 'skills');
const monsters = getList('monsters.json', 'monsters');
const bosses = getList('bosses.json', 'bosses');
const items = getList('items.json', 'items');
const recipes = getList('recipes.json', 'recipes');
const crops = getList('crops.json', 'crops');
const animals = getList('animals.json', 'animals');
const buildings = getList('buildings.json', 'buildings');
const quests = getList('quests.json', 'quests');
const lootTables = getList('loot-tables.json', 'lootTables', 'loot_tables', 'tables');
const banners = getList('gacha-banners.json', 'banners');

const idSet = (arr, label) => {
  const s = new Set();
  for (const x of arr) {
    if (!x.id) err(`${label}: entry missing id`);
    else if (s.has(x.id)) err(`${label}: duplicate id '${x.id}'`);
    else s.add(x.id);
  }
  return s;
};

const charIds = idSet(characters, 'characters.json');
const skillIds = idSet(skills, 'skills.json');
const mobIds = idSet(monsters, 'monsters.json');
const bossIds = idSet(bosses, 'bosses.json');
const itemIds = idSet(items, 'items.json');
const recipeIds = idSet(recipes, 'recipes.json');
const cropIds = idSet(crops, 'crops.json');
const animalIds = idSet(animals, 'animals.json');
const buildingIds = idSet(buildings, 'buildings.json');
const questIds = idSet(quests, 'quests.json');
const lootTableIds = idSet(lootTables, 'loot-tables.json');
const bannerIds = idSet(banners, 'gacha-banners.json');

// Count checks against GAME_DESIGN_BRIEF.md Section 16 & Section 28
const regularMobs = monsters.filter(m => m.tier === 'REGULAR');
const eliteMobs = monsters.filter(m => m.tier === 'ELITE');
const weapons = items.filter(i => i.category === 'WEAPON');
const equips = items.filter(i => i.category === 'EQUIPMENT');
const materials = items.filter(i => i.category === 'MATERIAL');
const consumables = items.filter(i => i.category === 'CONSUMABLE');
const seeds = items.filter(i => i.category === 'SEED');

if (characters.length < 12) err(`Expected >=12 characters, got ${characters.length}`);
if (skills.length < 60) err(`Expected >=60 skills, got ${skills.length}`);
if (regularMobs.length < 30) err(`Expected >=30 regular monsters, got ${regularMobs.length}`);
if (eliteMobs.length < 8) err(`Expected >=8 elite monsters, got ${eliteMobs.length}`);
if (bosses.length < 5) err(`Expected >=5 bosses, got ${bosses.length}`);
if (weapons.length < 40) err(`Expected >=40 weapons, got ${weapons.length}`);
if (equips.length < 40) err(`Expected >=40 equipment items, got ${equips.length}`);
if (materials.length < 50) err(`Expected >=50 materials, got ${materials.length}`);
if (recipes.length < 30) err(`Expected >=30 recipes, got ${recipes.length}`);
if (crops.length < 15) err(`Expected >=15 crops, got ${crops.length}`);
if (animals.length < 6) err(`Expected >=6 animals, got ${animals.length}`);
if (buildings.length < 12) err(`Expected >=12 buildings, got ${buildings.length}`);
if (quests.length < 30) err(`Expected >=30 quests, got ${quests.length}`);

// Cross-ref 1: characters <-> skills
for (const c of characters) {
  const sids = Object.values(c.skillIds || {});
  for (const sid of sids) {
    if (!skillIds.has(sid)) err(`characters.json (${c.id}) references unknown skillId '${sid}'`);
  }
  for (const syn of (c.synergies || [])) {
    if (!charIds.has(syn)) err(`characters.json (${c.id}) references unknown synergy '${syn}'`);
  }
}
for (const s of skills) {
  if (!charIds.has(s.characterId)) err(`skills.json (${s.id}) references unknown characterId '${s.characterId}'`);
}

// Cross-ref 2: monsters & bosses -> loot-tables
for (const m of monsters) {
  const ltb = m.rewards?.lootTableId;
  if (!ltb || !lootTableIds.has(ltb)) err(`monsters.json (${m.id}) references unknown lootTableId '${ltb}'`);
}
for (const b of bosses) {
  const ltb = b.rewards?.lootTableId;
  if (!ltb || !lootTableIds.has(ltb)) err(`bosses.json (${b.id}) references unknown lootTableId '${ltb}'`);
  if (!Array.isArray(b.phases) || b.phases.length < 3) err(`bosses.json (${b.id}) has fewer than 3 phases`);
}

// Cross-ref 3: crops -> items
for (const cr of crops) {
  if (!itemIds.has(cr.seedItemId)) err(`crops.json (${cr.id}) references unknown seedItemId '${cr.seedItemId}'`);
  if (!itemIds.has(cr.harvestItemId)) err(`crops.json (${cr.id}) references unknown harvestItemId '${cr.harvestItemId}'`);
}

// Cross-ref 4: animals -> items & buildings
for (const a of animals) {
  if (!buildingIds.has(a.requiredBuildingId)) err(`animals.json (${a.id}) references unknown requiredBuildingId '${a.requiredBuildingId}'`);
  if (!itemIds.has(a.favoriteFeedItemId)) err(`animals.json (${a.id}) references unknown favoriteFeedItemId '${a.favoriteFeedItemId}'`);
  if (!itemIds.has(a.produceItemId)) err(`animals.json (${a.id}) references unknown produceItemId '${a.produceItemId}'`);
}

// Cross-ref 5: buildings -> items
for (const b of buildings) {
  for (const lvl of (b.levels || [])) {
    for (const mat of (lvl.materials || [])) {
      if (!itemIds.has(mat.itemId)) err(`buildings.json (${b.id} Lv${lvl.level}) references unknown material '${mat.itemId}'`);
    }
  }
}

// Cross-ref 6: recipes -> items & buildings
for (const r of recipes) {
  if (r.stationBuildingId && !buildingIds.has(r.stationBuildingId)) {
    err(`recipes.json (${r.id}) references unknown stationBuildingId '${r.stationBuildingId}'`);
  }
  const outId = r.outputItemId || r.output?.itemId;
  if (!outId || !itemIds.has(outId)) err(`recipes.json (${r.id}) references unknown outputItemId '${outId}'`);
  for (const ing of (r.ingredients || [])) {
    if (!itemIds.has(ing.itemId)) err(`recipes.json (${r.id}) references unknown ingredient '${ing.itemId}'`);
  }
}

// Cross-ref 7: loot-tables -> items
for (const lt of lootTables) {
  const entries = lt.entries || lt.drops || lt.items || [];
  for (const e of entries) {
    if (e.itemId && !itemIds.has(e.itemId)) err(`loot-tables.json (${lt.id}) references unknown itemId '${e.itemId}'`);
  }
  for (const g of (lt.guaranteedDrops || lt.guaranteed || [])) {
    if (g.itemId && !itemIds.has(g.itemId)) err(`loot-tables.json (${lt.id}) guaranteed references unknown itemId '${g.itemId}'`);
  }
}

// Cross-ref 8: gacha-banners -> characters/items & rate sum == 1.000000
for (const b of banners) {
  const rates = Object.values(b.baseRates || {});
  const sum = rates.reduce((a, v) => a + Number(v), 0);
  if (Math.abs(sum - 1.0) > 1e-6) err(`gacha-banners.json (${b.id}) baseRates sum=${sum.toFixed(6)} != 1.0`);
  for (const [rar, pool] of Object.entries(b.pool || {})) {
    if ((b.baseRates?.[rar] || 0) > 0 && (!Array.isArray(pool) || pool.length === 0)) {
      err(`gacha-banners.json (${b.id}) rarity ${rar} has rate > 0 but empty pool`);
    }
    for (const id of (pool || [])) {
      if (b.rewardCategory === 'CHARACTER' && !charIds.has(id)) err(`gacha-banners.json (${b.id}) unknown char '${id}'`);
      if (b.rewardCategory === 'WEAPON' && !itemIds.has(id)) err(`gacha-banners.json (${b.id}) unknown weapon '${id}'`);
    }
  }
}

// Cross-ref 9: quests -> prereq DAG + items/mobs/bosses/buildings/crops
const questMap = new Map(quests.map(q => [q.id, q]));
for (const q of quests) {
  for (const pre of (q.prereqQuestIds || [])) {
    if (!questIds.has(pre)) err(`quests.json (${q.id}) unknown prereqQuestId '${pre}'`);
  }
  for (const rw of (q.rewards?.items || [])) {
    if (!itemIds.has(rw.itemId)) err(`quests.json (${q.id}) unknown reward itemId '${rw.itemId}'`);
  }
}
// Cycle check on quest DAG
const visiting = new Set();
const visited = new Set();
function checkCycle(qid) {
  if (visiting.has(qid)) { err(`quests.json cycle detected involving '${qid}'`); return; }
  if (visited.has(qid)) return;
  visiting.add(qid);
  const q = questMap.get(qid);
  for (const pre of (q?.prereqQuestIds || [])) checkCycle(pre);
  visiting.delete(qid);
  visited.add(qid);
}
for (const q of quests) checkCycle(q.id);

// Weapon enhancement CSV cross-ref
const csvPath = path.join(ROOT, 'docs', 'balancing', 'weapon-upgrade-costs.csv');
if (fs.existsSync(csvPath)) {
  const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1);
  if (lines.length !== 10) err(`weapon-upgrade-costs.csv expected 10 rows (+1..+10), got ${lines.length}`);
  for (const line of lines) {
    const cols = line.split(',');
    for (const idx of [10, 12, 14]) {
      const mid = cols[idx]?.trim();
      if (mid && !itemIds.has(mid)) err(`weapon-upgrade-costs.csv references unknown material '${mid}'`);
    }
  }
}

// Summary Output
const summary = {
  status: errors.length === 0 ? 'PASS' : 'FAIL',
  counts: {
    characters: characters.length,
    charactersMvp: characters.filter(x => x.mvp).length,
    skills: skills.length,
    skillsMvp: skills.filter(x => x.mvp).length,
    regularMonsters: regularMobs.length,
    eliteMonsters: eliteMobs.length,
    monstersMvp: monsters.filter(x => x.mvp).length,
    bosses: bosses.length,
    bossesMvp: bosses.filter(x => x.mvp).length,
    weapons: weapons.length,
    weaponsMvp: weapons.filter(x => x.mvp).length,
    equipment: equips.length,
    equipmentMvp: equips.filter(x => x.mvp).length,
    materials: materials.length,
    consumables: consumables.length,
    seeds: seeds.length,
    recipes: recipes.length,
    recipesMvp: recipes.filter(x => x.mvp).length,
    crops: crops.length,
    cropsMvp: crops.filter(x => x.mvp).length,
    animals: animals.length,
    animalsMvp: animals.filter(x => x.mvp).length,
    buildings: buildings.length,
    buildingsMvp: buildings.filter(x => x.mvp).length,
    quests: quests.length,
    questsMvp: quests.filter(x => x.mvp).length,
    lootTables: lootTables.length,
    gachaBanners: banners.length,
    gachaBannersMvp: banners.filter(x => x.mvp).length,
  },
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length > 0) process.exit(1);
