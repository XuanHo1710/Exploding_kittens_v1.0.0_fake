import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CANONICAL_CATALOG_FILES = [
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
] as const;

export interface CatalogBundle {
  manifestHash: string;
  loadedAt: string;
  filesLoaded: number;
  characters: any[];
  skills: any[];
  monsters: any[];
  bosses: any[];
  items: any[];
  equipmentSets: any[];
  recipes: any[];
  crops: any[];
  animals: any[];
  buildings: any[];
  quests: any[];
  lootTables: any[];
  gachaBanners: any[];
  gachaGlobalRules: any;
  gachaDuplicateConversion: any;
  gachaStarEssenceShop: any[];
  byId: {
    characters: Map<string, any>;
    skills: Map<string, any>;
    monsters: Map<string, any>;
    bosses: Map<string, any>;
    items: Map<string, any>;
    recipes: Map<string, any>;
    crops: Map<string, any>;
    animals: Map<string, any>;
    buildings: Map<string, any>;
    quests: Map<string, any>;
    lootTables: Map<string, any>;
    gachaBanners: Map<string, any>;
  };
}

function indexArray(arr: any[], label: string): Map<string, any> {
  const m = new Map<string, any>();
  for (const item of arr) {
    if (!item || typeof item.id !== 'string' || !item.id) {
      throw new Error(`Catalog validation failed (${label}): missing string id`);
    }
    if (m.has(item.id)) {
      throw new Error(`Catalog validation failed (${label}): duplicate id ${item.id}`);
    }
    m.set(item.id, item);
  }
  return m;
}

export function loadCanonicalCatalog(gameDataDir: string): CatalogBundle {
  const absDir = path.resolve(gameDataDir);
  const hash = crypto.createHash('sha256');
  const raw: Record<string, any> = {};

  for (const file of CANONICAL_CATALOG_FILES) {
    const fp = path.join(absDir, file);
    if (!fs.existsSync(fp)) {
      throw new Error(`Missing canonical catalog file: ${fp}`);
    }
    const content = fs.readFileSync(fp, 'utf8');
    hash.update(file);
    hash.update(content);
    raw[file] = JSON.parse(content);
  }

  const characters = raw['characters.json'].characters || [];
  const skills = raw['skills.json'].skills || [];
  const monsters = raw['monsters.json'].monsters || [];
  const bosses = raw['bosses.json'].bosses || [];
  const itemsDoc = raw['items.json'];
  const items = Array.isArray(itemsDoc.items)
    ? itemsDoc.items
    : [
        ...(itemsDoc.weapons || []),
        ...(itemsDoc.equipment || []),
        ...(itemsDoc.materials || []),
        ...(itemsDoc.consumables || []),
        ...(itemsDoc.seeds || []),
      ];
  const equipmentSets = itemsDoc.equipmentSets || [];
  const recipes = raw['recipes.json'].recipes || [];
  const crops = raw['crops.json'].crops || [];
  const animals = raw['animals.json'].animals || [];
  const buildings = raw['buildings.json'].buildings || [];
  const quests = raw['quests.json'].quests || [];
  const lootTables = raw['loot-tables.json'].lootTables || [];
  const gachaDoc = raw['gacha-banners.json'];
  const gachaBanners = gachaDoc.banners || [];
  const gachaGlobalRules = gachaDoc.globalRules || {};
  const gachaDuplicateConversion = gachaDoc.duplicateConversion || {};
  const gachaStarEssenceShop = gachaDoc.starEssenceShop?.offers || [];

  const byId = {
    characters: indexArray(characters, 'characters'),
    skills: indexArray(skills, 'skills'),
    monsters: indexArray(monsters, 'monsters'),
    bosses: indexArray(bosses, 'bosses'),
    items: indexArray(items, 'items'),
    recipes: indexArray(recipes, 'recipes'),
    crops: indexArray(crops, 'crops'),
    animals: indexArray(animals, 'animals'),
    buildings: indexArray(buildings, 'buildings'),
    quests: indexArray(quests, 'quests'),
    lootTables: indexArray(lootTables, 'lootTables'),
    gachaBanners: indexArray(gachaBanners, 'gachaBanners'),
  };

  // Fail-fast cross-reference sanity checks
  for (const sk of skills) {
    if (sk.characterId && !byId.characters.has(sk.characterId)) {
      throw new Error(`Skill ${sk.id} references unknown characterId ${sk.characterId}`);
    }
  }
  for (const bnr of gachaBanners) {
    const rates = Object.values(bnr.baseRates || {}) as number[];
    const sum = rates.reduce((a, b) => a + Number(b), 0);
    if (Math.abs(sum - 1) > 1e-5) {
      throw new Error(`Gacha banner ${bnr.id} baseRates sum=${sum} !== 1.0`);
    }
  }

  return Object.freeze({
    manifestHash: hash.digest('hex'),
    loadedAt: new Date().toISOString(),
    filesLoaded: CANONICAL_CATALOG_FILES.length,
    characters,
    skills,
    monsters,
    bosses,
    items,
    equipmentSets,
    recipes,
    crops,
    animals,
    buildings,
    quests,
    lootTables,
    gachaBanners,
    gachaGlobalRules,
    gachaDuplicateConversion,
    gachaStarEssenceShop,
    byId,
  });
}
