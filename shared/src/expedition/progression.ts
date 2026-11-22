/**
 * Tiến trình nhân vật & vật phẩm (dùng chung server / client, mọi con số lấy từ `balance.ts`):
 *  - Chỉ số cuối = gốc + tăng trưởng theo cấp + thức tỉnh + điểm chỉ số + thuốc + trang bị (có trần).
 *  - Điểm chỉ số theo cấp, mở khóa kỹ năng theo cấp, cấp kỹ năng tối đa theo cấp.
 *  - Sinh trang bị / thuốc, rớt đồ sau trận, gacha trang bị (Rương Thiên Văn) có bảo hiểm.
 *  - Cộng EXP trận đấu + lên cấp nhiều bậc.
 */

import {
  EQUIP_SLOTS,
  charmSlotsAtLevel,
  EXP_BALANCE,
  ITEM_RARITIES,
  STAT_KEYS,
  expToNextLevel,
  pickWeighted,
  skillLevelCap,
  statPointsAtLevel,
  type EquipSlot,
  type ItemRarity,
  type StatKey,
} from './balance';
import { EXPEDITION_HEROES_BY_ID, heroCombatSkillIds } from './catalog';
import { buildCharmLoadout, charmStatsAt, EXPEDITION_CHARMS_BY_ID, grantCharm, rollCharm, type CharmGain } from './charms';
import { collectTreeBonuses, TREE_NODES_BY_ID } from './skill-tree';
import { itemStatValue, normalizeSignatureItems } from './weapons';
import type {
  EncounterKind,
  ExpeditionProfile,
  HeroDefinition,
  HeroInstance,
  HeroRole,
  ItemInstance,
  ItemStatLine,
  StatBlock,
} from './types';

export interface FullStatBlock {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;
  eva: number;
}

/** Né tránh gốc theo vai trò (anh hùng chưa cộng điểm vẫn có thể tự né). */
const ROLE_BASE_EVA: Record<HeroRole, number> = {
  Vanguard: 0.02,
  Striker: 0.05,
  Breaker: 0.04,
  Luminary: 0.03,
};

const PERCENT_STATS: ReadonlySet<StatKey> = new Set(['critRate', 'critDmg', 'eva']);

export function isPercentStat(stat: StatKey): boolean {
  return PERCENT_STATS.has(stat);
}

export function formatStatValue(stat: StatKey, value: number): string {
  if (isPercentStat(stat)) return `${(value * 100).toFixed(1)}%`;
  return `${Math.round(value)}`;
}

// ---------------------------------------------------------------- profile migration


/** Tên vật phẩm cũ (tiếng Việt) → tên tiếng Anh hiện tại, để túi đồ của hồ sơ cũ đồng bộ. */
const LEGACY_ITEM_WORDS: readonly (readonly [string, string])[] = [["Kiếm Lữ Hành","Traveler Sword"],["Thương Tinh Thiết","Steel Spear"],["Cung Gió Sớm","Dawnwind Bow"],["Trượng Quang Phổ","Prism Staff"],["Song Đao Cát Vàng","Goldsand Blades"],["Rìu Lò Rèn","Forge Axe"],["Lưỡi Hái Nguyệt Ảnh","Moon Scythe"],["Giáp Da Thảo Nguyên","Leather Armor"],["Áo Choàng Tuyết","Snow Cloak"],["Giáp Vảy Thủy Cung","Scale Armor"],["Giáp Bazan","Basalt Plate"],["Áo Dệt Sao Đêm","Starweave Robe"],["Hộ Tâm Kính Cực Quang","Aurora Breastplate"],["Bùa Lông Vũ","Feather Charm"],["Nhẫn Băng Tâm","Ice Ring"],["Mặt Dây Nhật Thực","Eclipse Pendant"],["Vỏ Ốc Thủy Triều","Tide Shell"],["Viên Than Hồng","Ember Stone"],["Mảnh Sao Băng","Meteor Shard"],["Thuốc Sinh Lực","HP Elixir"],["Thuốc Cuồng Lực","ATK Elixir"],["Thuốc Thạch Bì","DEF Elixir"],["Thuốc Phong Hành","SPD Elixir"],["Thuốc Ưng Nhãn","Crit Elixir"],["Thuốc Phá Giáp","Crit DMG Elixir"],["Thuốc Ảnh Bộ","EVA Elixir"],["Tinh Luyện ","Refined "],["Cổ Ngữ ","Ancient "],["Huyền Thoại ","Legendary "],["Thần Khí ","Mythic "]];

export function legacyItemName(name: string): string {
  let out = name;
  for (const [vi, en] of LEGACY_ITEM_WORDS) if (out.includes(vi)) out = out.split(vi).join(en);
  return out;
}

/** Bổ sung các trường mới cho hồ sơ cũ (gọi sau mỗi lần nạp). Trả về chính profile. */
export function normalizeProfile(profile: ExpeditionProfile): ExpeditionProfile {
  profile.inventory ??= [];
  profile.itemSeq ??= profile.inventory.length;
  profile.itemPity ??= 0;
  profile.charms ??= {};
  profile.charmPity ??= 0;
  profile.storySeen ??= [];
  profile.wildWins ??= 0;
  for (const it of profile.inventory) it.nameVi = legacyItemName(it.nameVi);
  normalizeSignatureItems(profile);
  // hồ sơ cũ: Gác Cổng đã hạ coi như đã bị hạ trong chu kỳ nghỉ hiện tại (nghỉ ở lửa trại sẽ hồi sinh)
  profile.defeatedSinceRest ??= [...profile.clearedGatekeepers];
  const charmOwner = new Map<string, string>();
  for (const [heroId, h] of Object.entries(profile.heroes)) {
    h.level = Math.max(1, Math.min(EXP_BALANCE.level.max, Math.floor(h.level || 1)));
    h.shards ??= 0;
    h.treeNodes = (h.treeNodes ?? []).filter((id) => TREE_NODES_BY_ID[id]?.heroId === heroId);
    // bùa: chỉ giữ bùa đang sở hữu, không trùng giữa các anh hùng
    const charms: string[] = [];
    for (const id of h.charmIds ?? []) {
      if (charms.length >= charmSlotsAtLevel(h.level)) break;
      if (!profile.charms![id] || !EXPEDITION_CHARMS_BY_ID[id] || charmOwner.has(id)) continue;
      charmOwner.set(id, heroId);
      charms.push(id);
    }
    h.charmIds = charms;
    const def = EXPEDITION_HEROES_BY_ID[heroId];
    h.statAlloc ??= {};
    h.elixirBonus ??= {};
    h.elixirUses ??= 0;
    h.equipment ??= {};
    h.skillLevels ??= {};
    if (def) {
      for (const sid of def.skillIds) h.skillLevels[sid] ??= 1;
    }
  }
  // drop dangling equipment references
  const byUid = new Map(profile.inventory.map((it) => [it.uid, it]));
  for (const h of Object.values(profile.heroes)) {
    for (const slot of EQUIP_SLOTS) {
      const uid = h.equipment?.[slot];
      if (uid && byUid.get(uid)?.equippedBy !== h.heroId) delete h.equipment![slot];
    }
  }
  return profile;
}

// ---------------------------------------------------------------- stats


export function statPointsSpent(inst: HeroInstance): number {
  return Object.values(inst.statAlloc ?? {}).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
}

export function statPointsUnspent(inst: HeroInstance): number {
  return Math.max(0, statPointsAtLevel(inst.level) - statPointsSpent(inst));
}

function baseStats(def: HeroDefinition, inst: HeroInstance): FullStatBlock {
  const lv = Math.max(1, Math.min(EXP_BALANCE.level.max, Math.floor(inst.level))) - 1;
  const aw = 1 + Math.max(0, Math.min(6, inst.awakeningRank)) * EXP_BALANCE.awakeningPerRank;
  const g = def.growthPerLevel;
  const b = def.baseStats;
  return {
    hp: (b.hp + g.hp * lv) * aw,
    atk: (b.atk + g.atk * lv) * aw,
    def: (b.def + g.def * lv) * aw,
    spd: b.spd + g.spd * lv,
    critRate: b.critRate + g.critRate * lv,
    critDmg: b.critDmg + g.critDmg * lv,
    eva: ROLE_BASE_EVA[def.role] ?? 0.03,
  };
}

/** Các dòng chỉ số đang mặc của 1 anh hùng. */
export function equippedItems(inst: HeroInstance, inventory: readonly ItemInstance[] | undefined): ItemInstance[] {
  if (!inventory?.length) return [];
  const out: ItemInstance[] = [];
  for (const slot of EQUIP_SLOTS) {
    const uid = inst.equipment?.[slot];
    const it = uid ? inventory.find((x) => x.uid === uid) : undefined;
    if (it && (!it.signatureId || it.signatureId === inst.heroId)) out.push(it);
  }
  return out;
}

/** Chỉ số cuối cùng dùng trong trận. */
export function computeHeroFinalStats(
  def: HeroDefinition,
  inst: HeroInstance,
  inventory?: readonly ItemInstance[],
  charms?: ExpeditionProfile['charms'],
): FullStatBlock {
  const st = baseStats(def, inst);
  const add = (stat: StatKey, v: number) => {
    st[stat] += v;
  };
  for (const k of STAT_KEYS) {
    const pts = Math.max(0, inst.statAlloc?.[k] ?? 0);
    if (pts) add(k, pts * EXP_BALANCE.statPoints.valuePerPoint[k]);
    const ex = inst.elixirBonus?.[k] ?? 0;
    if (ex) add(k, ex);
  }
  for (const it of equippedItems(inst, inventory)) {
    if (it.main) add(it.main.stat, itemStatValue(it, it.main, inst.level));
    for (const s of it.subs) add(s.stat, itemStatValue(it, s, inst.level));
  }
  // Bùa Hộ Mệnh: chỉ số theo bậc
  const charmsInSlots = [...new Set(inst.charmIds ?? [])].slice(0, charmSlotsAtLevel(inst.level));
  for (const cid of charmsInSlots) {
    const cdef = EXPEDITION_CHARMS_BY_ID[cid];
    const rank = charms?.[cid]?.rank ?? 0;
    if (!cdef || rank <= 0) continue;
    for (const [k, v] of Object.entries(charmStatsAt(cdef, rank))) add(k as StatKey, v ?? 0);
  }
  // Cây kỹ năng: % chỉ số (HP/ATK/DEF/SPD nhân, các chỉ số % cộng thẳng)
  const tree = collectTreeBonuses(inst);
  for (const [k, v] of Object.entries(tree.statPct)) {
    const key = k as StatKey;
    if (isPercentStat(key)) st[key] += v ?? 0;
    else st[key] *= 1 + (v ?? 0);
  }
  const caps = EXP_BALANCE.statCaps;
  const charmFx = buildCharmLoadout(charmsInSlots, charms).fx;
  return {
    hp: Math.round(st.hp),
    atk: Math.round(st.atk * (1 + (charmFx.atk_pct ?? 0))),
    def: Math.round(st.def * (1 + (charmFx.def_pct ?? 0))),
    spd: Math.round(Math.min(caps.spd ?? 999, st.spd)),
    critRate: +Math.max(0.05, Math.min(caps.critRate ?? 1, st.critRate)).toFixed(4),
    critDmg: +Math.min(caps.critDmg ?? 9, st.critDmg).toFixed(3),
    eva: +Math.max(0, Math.min(caps.eva ?? 0.5, st.eva)).toFixed(4),
  };
}

export function toStatBlock(f: FullStatBlock): StatBlock {
  return { ...f };
}

// ---------------------------------------------------------------- skills


/** Kỹ năng đã mở khóa theo cấp anh hùng (thứ tự: đòn thường, kỹ năng 1, kỹ năng 2, tuyệt kỹ, nội tại). */
export function unlockedSkillIds(def: HeroDefinition, level: number): string[] {
  return [...def.skillIds, ...heroCombatSkillIds(def).slice(3)].filter((id) => level >= skillUnlockLevel(def, id));
}

export function skillUnlockLevel(def: HeroDefinition, skillId: string): number {
  const idx = def.skillIds.indexOf(skillId);
  if (idx < 0) return [4, 14, 26][heroCombatSkillIds(def).indexOf(skillId) - 3] ?? Infinity;
  return EXP_BALANCE.skills.unlockLevelBySlot[idx] ?? 1;
}

export function skillUpgradeCost(currentLevel: number): { expCrystal: number; starlight: number; seal: number } | null {
  const table = EXP_BALANCE.skills.upgradeCost;
  if (currentLevel < 1 || currentLevel > table.length) return null;
  return table[currentLevel - 1];
}

export { skillLevelCap };

// ---------------------------------------------------------------- EXP / level


export interface LevelUpReport {
  heroId: string;
  fromLevel: number;
  toLevel: number;
  pointsGained: number;
  unlockedSkillIds: string[];
}

/** Cộng EXP cho 1 anh hùng, lên nhiều cấp nếu đủ. */
export function grantHeroExp(inst: HeroInstance, amount: number): LevelUpReport | null {
  const def = EXPEDITION_HEROES_BY_ID[inst.heroId];
  if (!def || amount <= 0) return null;
  const from = inst.level;
  const beforeUnlocked = new Set(unlockedSkillIds(def, from));
  inst.exp += Math.round(amount);
  while (inst.level < EXP_BALANCE.level.max && inst.exp >= expToNextLevel(inst.level)) {
    inst.exp -= expToNextLevel(inst.level);
    inst.level += 1;
  }
  if (inst.level >= EXP_BALANCE.level.max) inst.exp = 0;
  if (inst.level === from) return null;
  return {
    heroId: inst.heroId,
    fromLevel: from,
    toLevel: inst.level,
    pointsGained: statPointsAtLevel(inst.level) - statPointsAtLevel(from),
    unlockedSkillIds: unlockedSkillIds(def, inst.level).filter((s) => !beforeUnlocked.has(s)),
  };
}

/** EXP trận đấu: đội ra trận nhận đủ, anh hùng dự bị nhận phần chia. */
export function distributeBattleExp(profile: ExpeditionProfile, exp: number): LevelUpReport[] {
  const reports: LevelUpReport[] = [];
  for (const [heroId, h] of Object.entries(profile.heroes)) {
    const share = profile.activeParty.includes(heroId) ? 1 : EXP_BALANCE.level.benchExpShare;
    const r = grantHeroExp(h, exp * share);
    if (r) reports.push(r);
  }
  return reports;
}

// ---------------------------------------------------------------- items


const ITEM_NAMES: Record<EquipSlot, readonly string[]> = {
  weapon: ['Traveler Sword', 'Steel Spear', 'Dawnwind Bow', 'Prism Staff', 'Goldsand Blades', 'Forge Axe', 'Moon Scythe'],
  armor: ['Leather Armor', 'Snow Cloak', 'Scale Armor', 'Basalt Plate', 'Starweave Robe', 'Aurora Breastplate'],
  charm: ['Feather Charm', 'Ice Ring', 'Eclipse Pendant', 'Tide Shell', 'Ember Stone', 'Meteor Shard'],
};
const RARITY_PREFIX: Record<ItemRarity, string> = {
  common: '',
  rare: 'Refined ',
  epic: 'Ancient ',
  legendary: 'Legendary ',
  mythic: 'Mythic ',
};
const ELIXIR_NAMES: Record<StatKey, string> = {
  hp: 'HP Elixir',
  atk: 'ATK Elixir',
  def: 'DEF Elixir',
  spd: 'SPD Elixir',
  critRate: 'Crit Elixir',
  critDmg: 'Crit DMG Elixir',
  eva: 'EVA Elixir',
};

function roundStat(stat: StatKey, v: number): number {
  return isPercentStat(stat) ? +v.toFixed(4) : Math.max(1, Math.round(v));
}

/** Sinh 1 vật phẩm. `rand` trả về số ∈ [0, 1). */
export function generateItem(params: {
  rand: () => number;
  rarity: ItemRarity;
  ilvl: number;
  uid: string;
  elixir?: boolean;
  now?: number;
  /** ép ô trang bị (vd. chỉ rớt vũ khí) */
  slot?: EquipSlot;
}): ItemInstance {
  const { rand, rarity, ilvl, uid } = params;
  const now = params.now ?? Date.now();
  if (params.elixir) {
    const stat = STAT_KEYS[Math.floor(rand() * STAT_KEYS.length)];
    return {
      uid,
      kind: 'elixir',
      rarity,
      ilvl,
      nameVi: `${ELIXIR_NAMES[stat]}${rarity === 'common' ? '' : ' ' + ({ rare: 'II', epic: 'III', legendary: 'IV', mythic: 'V' } as Record<string, string>)[rarity]}`,
      subs: [],
      elixir: { stat, value: EXP_BALANCE.elixirs.value[stat][rarity] },
      obtainedAt: now,
    };
  }
  const eq = EXP_BALANCE.equipment;
  const slot = params.slot ?? EQUIP_SLOTS[Math.floor(rand() * EQUIP_SLOTS.length)];
  const mains = eq.mainStat[slot];
  const m = mains[Math.floor(rand() * mains.length)];
  const main: ItemStatLine = { stat: m.stat, value: roundStat(m.stat, (m.base + m.perIlvl * ilvl) * eq.rarityMult[rarity]) };
  const subs: ItemStatLine[] = [];
  const pool = STAT_KEYS.filter((k) => k !== m.stat);
  for (let i = 0; i < eq.subStatCount[rarity] && pool.length; i++) {
    const stat = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    const def = eq.subStat[stat];
    subs.push({ stat, value: roundStat(stat, (def.base + def.perIlvl * ilvl) * (0.6 + rand() * 0.4)) });
  }
  const names = ITEM_NAMES[slot];
  return {
    uid,
    kind: 'equipment',
    rarity,
    ilvl,
    slot,
    nameVi: `${RARITY_PREFIX[rarity]}${names[Math.floor(rand() * names.length)]}`,
    main,
    subs,
    obtainedAt: now,
  };
}

function nextUid(profile: ExpeditionProfile): string {
  profile.itemSeq = (profile.itemSeq ?? 0) + 1;
  return `it${profile.itemSeq.toString(36)}`;
}

function rarityRank(r: ItemRarity): number {
  return ITEM_RARITIES.indexOf(r);
}

export interface DropResult {
  items: ItemInstance[];
  seal: number;
}

/** Rớt đồ sau 1 trận thắng. `realmOrder` 1..7 tăng cấp đồ. */
export function rollBattleDrops(params: {
  profile: ExpeditionProfile;
  encounterKind: EncounterKind;
  realmOrder: number;
  repeat: boolean;
  rand: () => number;
}): DropResult {
  const { profile, encounterKind, realmOrder, repeat, rand } = params;
  const table = EXP_BALANCE.drops[encounterKind === 'boss' ? 'boss' : 'gatekeeper'];
  const ilvl = Math.max(1, realmOrder * EXP_BALANCE.drops.itemLevelPerRealm - 4 + Math.floor(rand() * 6));
  // chỉ rớt vũ khí biến thể: quái thường / Gác Cổng 5%, Trùm chắc chắn (30% hàng hiếm Sử Thi+)
  const d = EXP_BALANCE.drops;
  const items: ItemInstance[] = [];
  for (const [slot, chance] of [['weapon', d.weaponChance], ['armor', d.armorChance]] as const) {
    if (rand() >= chance[encounterKind]) continue;
    const rarity = pickWeighted(encounterKind === 'boss' ? d.bossWeaponRarity : d.weaponRarity, rand());
    items.push(generateItem({ rand, rarity, ilvl, uid: nextUid(profile), slot }));
  }
  const [lo, hi] = encounterKind === 'wild' ? EXP_BALANCE.wild.sealRange : table.sealRange;
  const seal = Math.round((lo + (hi - lo) * rand()) * (repeat && encounterKind !== 'wild' ? 0.5 : 1));
  return { items, seal };
}

/**
 * Rớt Bùa Hộ Mệnh sau trận thắng (tỉ lệ ở `EXP_BALANCE.charms`):
 *  - mọi trận thắng chắc chắn có `guaranteedPerBattle` bùa;
 *  - lần đầu hạ Gác Cổng / Đại Trùm có thêm `firstClearBonus` bùa (Trùm tối thiểu Hiếm);
 *  - "hên": chuỗi `bonusChain` cơ hội nhận thêm bùa (dừng ở lần trượt đầu tiên), cộng theo loại trận & số quái nhỏ bị hạ.
 */
export function rollCharmDrops(params: {
  profile: ExpeditionProfile;
  encounterKind: EncounterKind;
  realmOrder: number;
  firstClear: boolean;
  minionsKilled: number;
  rand: () => number;
}): CharmGain[] {
  const { profile, encounterKind, realmOrder, firstClear, minionsKilled, rand } = params;
  const c = EXP_BALANCE.charms;
  const out: CharmGain[] = [];
  const bossFloor = encounterKind === 'boss' ? 'rare' as const : undefined;
  for (let i = 0; i < c.guaranteedPerBattle; i++) out.push(grantCharm(profile, rollCharm(realmOrder, rand, i === 0 ? bossFloor : undefined)));
  if (firstClear && encounterKind !== 'wild') {
    for (let i = 0; i < c.firstClearBonus; i++) out.push(grantCharm(profile, rollCharm(realmOrder, rand, bossFloor)));
  }
  const bonus = (c.encounterBonus[encounterKind] ?? 0) + Math.max(0, minionsKilled) * c.perMinionBonus;
  for (const chance of c.bonusChain) {
    if (rand() >= Math.min(0.95, chance + bonus)) break;
    out.push(grantCharm(profile, rollCharm(realmOrder, rand)));
  }
  profile.charmPity = 0;
  return out;
}

/** Số bùa kỳ vọng của một trận thắng (để UI công khai). */
export function expectedCharmsPerBattle(encounterKind: EncounterKind, firstClear: boolean, minionsKilled = 0): number {
  const c = EXP_BALANCE.charms;
  const bonus = (c.encounterBonus[encounterKind] ?? 0) + Math.max(0, minionsKilled) * c.perMinionBonus;
  let expected = c.guaranteedPerBattle + (firstClear && encounterKind !== 'wild' ? c.firstClearBonus : 0);
  let reach = 1;
  for (const chance of c.bonusChain) {
    reach *= Math.min(0.95, chance + bonus);
    expected += reach;
  }
  return expected;
}

/** Nghỉ tại Trạm (lửa trại): hồi sinh mọi quái đã hạ (trừ Đại Trùm) và nạp vật phẩm trận lên mức tối thiểu. */
export function applyBonfireRest(profile: ExpeditionProfile, anchorId: string, now = Date.now()): { respawned: number } {
  // chỉ đàn quái nhỏ hồi sinh; Gác Cổng và Đại Trùm đã hạ thì hạ vĩnh viễn
  const respawned = (profile.defeatedSinceRest ?? []).filter((id) => !id.includes('_gk_')).length;
  profile.defeatedSinceRest = [];
  profile.supplies ??= {};
  for (const [k, min] of Object.entries(EXP_BALANCE.rest.supplyBaseline) as [keyof typeof EXP_BALANCE.rest.supplyBaseline, number][]) {
    profile.supplies[k] = Math.max(profile.supplies[k] ?? 0, min);
  }
  profile.lastRest = { at: now, anchorId, respawned };
  return { respawned };
}

/** Quái (đàn quái nhỏ / Gác Cổng) đã bị hạ kể từ lần nghỉ gần nhất → không còn trên bản đồ. */
export function isEncounterDefeated(profile: Pick<ExpeditionProfile, 'defeatedSinceRest'>, id: string): boolean {
  return Boolean(profile.defeatedSinceRest?.includes(id));
}

/** Gacha trang bị. Trừ phí, cập nhật bảo hiểm, trả về vật phẩm (chưa thêm vào túi). */
export function resolveItemSummon(profile: ExpeditionProfile, count: 1 | 10, rand: () => number): ItemInstance[] {
  const g = EXP_BALANCE.itemGacha;
  const cost = count === 10 ? g.tenCostSeal : g.singleCostSeal;
  if (profile.astralSeal < cost) {
    throw new Error(`Không đủ Ấn Tinh Tú (cần ${cost}, hiện có ${profile.astralSeal}).`);
  }
  const room = EXP_BALANCE.equipment.inventoryLimit - (profile.inventory?.length ?? 0);
  if (room < count) throw new Error('Túi đồ đã đầy. Hãy phân rã bớt vật phẩm.');
  profile.astralSeal -= cost;
  const highest = clampOrder(maxUnlockedRealmOrder(profile));
  const out: ItemInstance[] = [];
  for (let i = 0; i < count; i++) {
    profile.itemPity = (profile.itemPity ?? 0) + 1;
    let rarity = pickWeighted(g.rates, rand());
    if (profile.itemPity >= g.hardPityLegendary && rarityRank(rarity) < rarityRank('legendary')) rarity = 'legendary';
    if (rarityRank(rarity) >= rarityRank('legendary')) profile.itemPity = 0;
    out.push(generateItem({
      rand,
      rarity,
      ilvl: Math.max(1, highest * EXP_BALANCE.drops.itemLevelPerRealm - 2 + Math.floor(rand() * 5)),
      uid: nextUid(profile),
      elixir: rand() < g.elixirChance,
    }));
  }
  if (count === 10 && !out.some((it) => rarityRank(it.rarity) >= rarityRank(g.tenPullGuarantee))) {
    const worst = out.reduce((a, b) => (rarityRank(b.rarity) < rarityRank(a.rarity) ? b : a));
    const idx = out.indexOf(worst);
    out[idx] = generateItem({ rand, rarity: g.tenPullGuarantee, ilvl: worst.ilvl, uid: worst.uid, elixir: worst.kind === 'elixir' });
  }
  return out;
}

function clampOrder(n: number): number {
  return Math.max(1, Math.min(7, n));
}

function maxUnlockedRealmOrder(profile: ExpeditionProfile): number {
  return profile.unlockedMaps.reduce((m, id) => Math.max(m, Number(id.slice(0, 2)) || 1), 1);
}

/** Bảng tỉ lệ công khai (để UI hiển thị). */
export function publicRateTable() {
  return {
    heroGacha: EXP_BALANCE.heroGacha,
    itemGacha: EXP_BALANCE.itemGacha,
    drops: EXP_BALANCE.drops,
    charms: EXP_BALANCE.charms,
  };
}
