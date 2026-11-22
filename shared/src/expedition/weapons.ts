import { EXP_BALANCE, type ItemRarity } from './balance';
import { generateItem } from './progression';
import type { EncounterKind, ExpeditionProfile, ItemInstance, ItemStatLine } from './types';

type SignatureRarity = Extract<ItemRarity, 'epic' | 'legendary' | 'mythic'>;

interface SignatureWeapon {
  heroId: string;
  nameVi: string;
  rarity: SignatureRarity;
  bonus: ItemStatLine;
}

export const SIGNATURE_WEAPONS: readonly SignatureWeapon[] = [
  { heroId: 'gustave_blade', nameVi: 'Thornwind Sword', rarity: 'legendary', bonus: { stat: 'critRate', value: .035 } },
  { heroId: 'celine_prism', nameVi: 'Sunbrush', rarity: 'legendary', bonus: { stat: 'hp', value: 85 } },
  { heroId: 'bastian_aegis', nameVi: 'Ember Hammer', rarity: 'epic', bonus: { stat: 'def', value: 12 } },
  { heroId: 'lyra_frostbow', nameVi: 'Greysnow Bow', rarity: 'mythic', bonus: { stat: 'critRate', value: .06 } },
  { heroId: 'kestrel_dune', nameVi: 'Dune Twin Blades', rarity: 'epic', bonus: { stat: 'critDmg', value: .1 } },
  { heroId: 'nereus_tide', nameVi: 'Azure Shell Staff', rarity: 'epic', bonus: { stat: 'hp', value: 70 } },
  { heroId: 'corvus_night', nameVi: 'Dead Star Sickle', rarity: 'legendary', bonus: { stat: 'critDmg', value: .15 } },
  { heroId: 'ignis_valkyrie', nameVi: 'Flamewing Spear', rarity: 'legendary', bonus: { stat: 'spd', value: 7 } },
  { heroId: 'marina_abyss', nameVi: 'Abyss Chain', rarity: 'legendary', bonus: { stat: 'eva', value: .04 } },
  { heroId: 'aurelia_eclipse', nameVi: 'Sunflare Greatsword', rarity: 'mythic', bonus: { stat: 'critDmg', value: .25 } },
  { heroId: 'seraph_glacier', nameVi: 'Blueline Ice Sword', rarity: 'mythic', bonus: { stat: 'def', value: 24 } },
  { heroId: 'lumina_chrono', nameVi: 'Orbit Staff', rarity: 'mythic', bonus: { stat: 'spd', value: 12 } },
  { heroId: 'jung_afterglow', nameVi: 'Hanbit Edge', rarity: 'mythic', bonus: { stat: 'critDmg', value: .3 } },
];

export const SIGNATURE_WEAPONS_BY_HERO: Readonly<Record<string, SignatureWeapon>> = Object.fromEntries(
  SIGNATURE_WEAPONS.map((weapon) => [weapon.heroId, weapon]),
);

export const WEAPON_BANNER = {
  singleCost: 120,
  tenCost: 1200,
  /** Thần Thoại 0,5% — vũ khí biến thể cấp cao nhất, bảo hiểm ở lượt `mythicPity` */
  rates: { rare: .695, epic: .25, legendary: .05, mythic: .005 },
  mythicPity: 160,
  legendaryPity: 40,
  epicPity: 10,
  refineCosts: [1, 1, 2, 2],
  attackGrowth: 1.15,
  perRank: .08,
} as const;

/** Cường hoá: tối đa +10, mỗi cấp +8% mọi chỉ số của món đồ. */
export const ENHANCE_MAX = 15;
export const ENHANCE_PER_LEVEL = 0.08;
const ENHANCE_RARITY_MULT: Record<ItemRarity, number> = { common: 1, rare: 1.3, epic: 1.7, legendary: 2.2, mythic: 3 };

// ---------------------------------------------------------------- nguyên liệu cường hoá (rơi sau trận, chương sau mới có)
export type MaterialId = 'ore_iron' | 'ore_mithril' | 'ore_adamant' | 'aurora_shard';
export const MATERIALS: Record<MaterialId, { nameVi: string; color: string; fromRealm: number; descVi: string }> = {
  ore_iron: { nameVi: 'Iron Ore', color: '#b9c1cc', fromRealm: 1, descVi: 'Cường hoá +1 → +7. Rơi từ Chương I.' },
  ore_mithril: { nameVi: 'Mithril Ore', color: '#7fd3ff', fromRealm: 3, descVi: 'Phá giới hạn +7, cường hoá +8 → +10. Rơi từ Chương III.' },
  ore_adamant: { nameVi: 'Adamantite', color: '#c58bff', fromRealm: 5, descVi: 'Phá giới hạn +10, cường hoá +11 → +15. Rơi từ Chương V.' },
  aurora_shard: { nameVi: 'Aurora Shard', color: '#7dffc4', fromRealm: 7, descVi: 'Phá giới hạn cuối +15. Chỉ rơi ở Chương VII.' },
};
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

/** Mốc phá giới hạn: chỉ số tăng vọt + buff mới trong trận. */
export const LIMIT_BREAKS = [7, 10, 15] as const;
const BREAK_BONUS: Record<number, number> = { 7: 0.15, 10: 0.2, 15: 0.3 };

/** Buff trong trận mở khoá ở từng mốc (cộng dồn). key = hiệu ứng engine (giống Bùa). */
export const LIMIT_BREAK_FX: Record<'weapon' | 'armor', Record<number, { key: string; value: number; nameVi: string; descVi: string }[]>> = {
  weapon: {
    7: [{ key: 'lifesteal', value: 0.06, nameVi: 'Huyết Nhận', descVi: 'Hút 6% sát thương gây ra thành HP.' }],
    10: [{ key: 'start_ap', value: 1, nameVi: 'Tiên Phong', descVi: '+1 AP khi vào trận.' }],
    15: [{ key: 'ult_power', value: 0.2, nameVi: 'Thần Binh', descVi: 'Tuyệt kỹ +20% sát thương.' },
      { key: 'kill_ap', value: 1, nameVi: 'Truy Sát', descVi: 'Hạ gục kẻ địch +1 AP.' }],
  },
  armor: {
    7: [{ key: 'start_shield', value: 0.08, nameVi: 'Hộ Thể', descVi: 'Khiên 8% HP tối đa khi vào trận.' }],
    10: [{ key: 'parry_heal', value: 0.04, nameVi: 'Hồi Giáp', descVi: 'Đỡ trúng hồi 4% HP.' }],
    15: [{ key: 'revive_once', value: 0.3, nameVi: 'Bất Diệt', descVi: 'Hồi sinh 1 lần với 30% HP.' }],
  },
};

/** Hệ số chỉ số theo cấp cường hoá: +8% mỗi cấp + thưởng phá giới hạn ở +7 / +10 / +15. */
export function enhanceMultiplier(level: number): number {
  const lv = Math.max(0, Math.min(ENHANCE_MAX, level));
  let m = 1 + lv * ENHANCE_PER_LEVEL;
  for (const b of LIMIT_BREAKS) if (lv >= b) m += BREAK_BONUS[b];
  return m;
}

/** Buff phá giới hạn đang có của một món trang bị. */
export function itemLimitBreakFx(item: ItemInstance): { key: string; value: number; nameVi: string; descVi: string; at: number }[] {
  if (item.kind !== 'equipment' || (item.slot !== 'weapon' && item.slot !== 'armor')) return [];
  const lv = item.enhance ?? 0;
  return LIMIT_BREAKS.filter((b) => lv >= b).flatMap((b) => LIMIT_BREAK_FX[item.slot as 'weapon' | 'armor'][b].map((f) => ({ ...f, at: b })));
}

/** Gộp buff phá giới hạn của mọi trang bị anh hùng đang mặc. */
export function equipmentLimitFx(heroId: string, inventory: readonly ItemInstance[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of inventory ?? []) {
    if (it.equippedBy !== heroId) continue;
    for (const f of itemLimitBreakFx(it)) out[f.key] = (out[f.key] ?? 0) + f.value;
  }
  return out;
}

/** Chi phí lên cấp kế (undefined = đã tối đa / không cường hoá được). */
export function enhanceCost(item: ItemInstance): { seal: number; crystal: number; mats: Partial<Record<MaterialId, number>> } | undefined {
  if (item.kind !== 'equipment') return undefined;
  const lv = item.enhance ?? 0;
  if (lv >= ENHANCE_MAX) return undefined;
  const k = ENHANCE_RARITY_MULT[item.rarity] ?? 1;
  const mats: Partial<Record<MaterialId, number>> =
    lv < 7 ? { ore_iron: 2 + lv }
      : lv < 10 ? { ore_mithril: 2 + (lv - 7) * 2 }
        : { ore_adamant: 2 + (lv - 10) * 2, ...(lv === 14 ? { aurora_shard: 3 } : {}) };
  return { seal: Math.round((40 + 30 * lv) * k), crystal: Math.round((60 + 45 * lv) * k), mats };
}

/** Nguyên liệu rơi sau trận thắng (theo chương). */
export function rollMaterialDrops(params: { encounterKind: EncounterKind; realmOrder: number; rand: () => number }): Partial<Record<MaterialId, number>> {
  const { encounterKind: kind, realmOrder: r, rand } = params;
  const out: Partial<Record<MaterialId, number>> = {};
  const add = (id: MaterialId, n: number) => { if (n > 0) out[id] = (out[id] ?? 0) + n; };
  const range = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  add('ore_iron', kind === 'boss' ? range(5, 7) : kind === 'gatekeeper' ? range(2, 3) : range(1, 2));
  if (r >= 3) add('ore_mithril', kind === 'boss' ? range(3, 4) : kind === 'gatekeeper' ? range(1, 2) : rand() < 0.45 ? 1 : 0);
  if (r >= 5) add('ore_adamant', kind === 'boss' ? range(2, 3) : kind === 'gatekeeper' ? 1 : rand() < 0.3 ? 1 : 0);
  if (r >= 7) add('aurora_shard', kind === 'boss' ? 2 : kind === 'gatekeeper' ? (rand() < 0.45 ? 1 : 0) : rand() < 0.15 ? 1 : 0);
  return out;
}

export function itemStatValue(item: ItemInstance, line: ItemStatLine, heroLevel: number): number {
  const enh = enhanceMultiplier(item.enhance ?? 0);
  if (!item.signatureId) return line.value * enh;
  const growth = line.stat === 'atk' ? Math.max(0, heroLevel - 1) * WEAPON_BANNER.attackGrowth : 0;
  return (line.value + growth) * (1 + Math.max(0, (item.refineRank ?? 1) - 1) * WEAPON_BANNER.perRank) * enh;
}

export function weaponRefineCost(item: ItemInstance): number | undefined {
  return item.signatureId ? WEAPON_BANNER.refineCosts[(item.refineRank ?? 1) - 1] : undefined;
}

const BASE_ATTACK: Record<SignatureRarity, number> = { epic: 26, legendary: 30, mythic: 36 };
const OVERFLOW: Record<SignatureRarity, number> = { epic: 12, legendary: 32, mythic: 64 };

/** Đồng bộ vũ khí trấn đã sở hữu với bậc hiếm hiện tại (sau khi xếp lại độ hiếm). */
export function normalizeSignatureItems(profile: ExpeditionProfile): void {
  // bộ đếm bảo hiểm Thần Thoại cho hồ sơ đã quay trước khi có bậc Thần Thoại: tính từ tổng lượt đã quay
  if (profile.weaponPity && profile.weaponPity.mythic === undefined) {
    profile.weaponPity.mythic = (profile.weaponPity.pulls ?? 0) % WEAPON_BANNER.mythicPity;
  }
  for (const it of profile.inventory ?? []) {
    const def = it.signatureId ? SIGNATURE_WEAPONS_BY_HERO[it.signatureId] : undefined;
    if (!def || it.rarity === def.rarity) continue;
    it.rarity = def.rarity;
    it.nameVi = def.nameVi;
    if (it.main) it.main = { stat: 'atk', value: BASE_ATTACK[def.rarity] };
    it.subs = [{ ...def.bonus }];
  }
}

export function resolveWeaponSummon(profile: ExpeditionProfile, count: 1 | 10, rand: () => number, now = Date.now()): ItemInstance[] {
  const cost = count === 10 ? WEAPON_BANNER.tenCost : WEAPON_BANNER.singleCost;
  if (profile.astralSeal < cost) throw new Error(`Cần ${cost} Ấn Tinh Tú.`);
  const pity = { legendary: 0, epic: 0, pulls: 0, mythic: 0, ...profile.weaponPity };
  const topRealm = profile.unlockedMaps.reduce((m, id) => Math.max(m, Number(id.slice(0, 2)) || 1), 1);
  const inventory = [...(profile.inventory ?? [])];
  let starlight = 0;
  const pulls: ItemInstance[] = [];
  for (let index = 0; index < count; index++) {
    // Thần Thoại 0,5% (bảo hiểm ở lượt mythicPity): vũ khí biến thể Thần Thoại, cấp đồ theo vùng cao nhất đã mở
    pity.mythic = (pity.mythic ?? 0) + 1;
    const roll = rand();
    const rarity: SignatureRarity | 'rare' = pity.mythic >= WEAPON_BANNER.mythicPity || roll >= 1 - WEAPON_BANNER.rates.mythic ? 'mythic'
      : ++pity.legendary >= WEAPON_BANNER.legendaryPity || roll < WEAPON_BANNER.rates.legendary ? 'legendary'
      : pity.epic + 1 >= WEAPON_BANNER.epicPity || roll < WEAPON_BANNER.rates.legendary + WEAPON_BANNER.rates.epic ? 'epic' : 'rare';
    if (rarity === 'mythic') pity.mythic = 0;
    if (rarity === 'legendary' || rarity === 'mythic') pity.legendary = 0;
    pity.epic = rarity === 'rare' ? pity.epic + 1 : 0;
    pity.pulls++;
    if (rarity === 'rare') {
      // bậc Hiếm: vũ khí biến thể thường (hàng lót), không phải vũ khí trấn
      if (inventory.length >= EXP_BALANCE.equipment.inventoryLimit) throw new Error('Túi đồ đầy.');
      const filler = generateItem({ rand, rarity: 'rare', slot: 'weapon', ilvl: topRealm * EXP_BALANCE.drops.itemLevelPerRealm,
        uid: `wb_${now.toString(36)}_${index}_${Math.floor(rand() * 1e6).toString(36)}`, now });
      inventory.push(filler);
      pulls.push(filler);
      continue;
    }
    const pool = SIGNATURE_WEAPONS.filter((weapon) => weapon.rarity === rarity);
    const picked = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    const existingIndex = inventory.findIndex((item) => item.signatureId === picked.heroId);
    const existing = inventory[existingIndex];
    if (existing) {
      const room = WEAPON_BANNER.refineCosts.slice((existing.refineRank ?? 1) - 1).reduce((a, b) => a + b, 0);
      const shards = (existing.weaponShards ?? 0) < room ? 1 : 0;
      const overflow = shards ? 0 : OVERFLOW[rarity];
      const updated = { ...existing, weaponShards: (existing.weaponShards ?? 0) + shards };
      inventory[existingIndex] = updated;
      starlight += overflow;
      pulls.push({ ...updated, duplicateYield: { shards, starlight: overflow } });
      continue;
    }
    if (inventory.length >= EXP_BALANCE.equipment.inventoryLimit) throw new Error('Túi đồ đầy.');
    const item: ItemInstance = {
      uid: `signature_${picked.heroId}`, signatureId: picked.heroId, slot: 'weapon', kind: 'equipment',
      nameVi: picked.nameVi, rarity, ilvl: 1, main: { stat: 'atk', value: BASE_ATTACK[rarity] },
      subs: [{ ...picked.bonus }], refineRank: 1, weaponShards: 0, obtainedAt: now, locked: true,
    };
    inventory.push(item);
    pulls.push(item);
  }
  profile.astralSeal -= cost;
  profile.starlightToken += starlight;
  profile.weaponPity = pity;
  profile.inventory = inventory;
  profile.updatedAt = now;
  return pulls;
}
