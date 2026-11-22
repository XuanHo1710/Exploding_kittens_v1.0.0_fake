/**
 * Bùa Hộ Mệnh — vật phẩm nội tại nhặt được khi hạ quái (ưu tiên quái nhỏ dạo chơi).
 *  - Mỗi bùa là 1 bản sở hữu duy nhất có bậc (rank 1..maxRank); nhặt trùng -> lên bậc.
 *  - Mỗi anh hùng gắn tối đa N bùa (số ô mở theo cấp, xem `EXP_BALANCE.charms.slotUnlockLevels`).
 *  - 1 bùa chỉ gắn cho 1 anh hùng tại một thời điểm.
 *  - Bùa = chỉ số cộng thêm + một hiệu ứng chiến đấu được engine đọc trực tiếp.
 */

import { EXP_BALANCE, pickWeighted, type StatKey } from './balance';
import type { StatusId } from './combat-rules';
import type { ElementType, ExpeditionProfile } from './types';

export type CharmRarity = 'common' | 'rare' | 'epic' | 'legendary';
export const CHARM_RARITIES: readonly CharmRarity[] = ['common', 'rare', 'epic', 'legendary'];
export const CHARM_RARITY_LABELS_VI: Record<CharmRarity, string> = {
  common: 'Thường',
  rare: 'Hiếm',
  epic: 'Sử Thi',
  legendary: 'Huyền Thoại',
};
export const CHARM_RARITY_COLORS: Record<CharmRarity, string> = {
  common: '#a8b0bd',
  rare: '#5fa8f0',
  epic: '#b57cf0',
  legendary: '#f0b44c',
};

export type CharmEffectKind =
  | 'start_ap'
  | 'parry_ap'
  | 'perfect_crit'
  | 'lifesteal'
  | 'basic_status'
  | 'imbue'
  | 'dodge_heal'
  | 'counter_power'
  | 'low_hp_power'
  | 'break_power'
  | 'first_strike'
  | 'start_shield'
  | 'last_stand'
  | 'weak_power'
  | 'stagger_power'
  | 'kill_ap'
  | 'debuff_power'
  | 'status_turns'
  | 'start_regen'
  | 'heal_power'
  | 'start_charge'
  | 'ult_power'
  | 'evade_ap'
  | 'dot_power'
  | 'thorns'
  | 'parry_charge' | 'dodge_shield' | 'stagger_ap' | 'break_heal' | 'weak_ap' | 'burn_power'
  | 'atk_pct' | 'def_pct' | 'opening_extra' | 'parry_heal' | 'revive_once'
  | 'fall_ward' | 'low_ward' | 'opening_ward' | 'low_atk_60' | 'low_crit_30';

export interface CharmDef {
  charmId: string;
  nameVi: string;
  descVi: string;
  rarity: CharmRarity;
  /** vùng sớm nhất có thể rớt (thứ tự vùng 1..7) */
  tier: number;
  stats?: Partial<Record<StatKey, number>>;
  effect?: {
    kind: CharmEffectKind;
    value: number;
    /** có tăng theo bậc bùa không (các hiệu ứng dạng "+1 AP" thì không) */
    scales: boolean;
    status?: StatusId;
    element?: ElementType;
  };
}

const C = (
  charmId: string,
  nameVi: string,
  rarity: CharmRarity,
  tier: number,
  descVi: string,
  stats?: CharmDef['stats'],
  effect?: CharmDef['effect'],
): CharmDef => ({ charmId, nameVi, rarity, tier, descVi, stats, effect });

export const EXPEDITION_CHARMS: readonly CharmDef[] = [
  C('ch_iron_edge', 'Iron Edge', 'common', 1, '+5% ATK.', undefined, { kind: 'atk_pct', value: .05, scales: false }),
  C('ch_guard_plate', 'Plate Guard', 'common', 1, '+5% DEF.', undefined, { kind: 'def_pct', value: .05, scales: false }),
  C('ch_sharp_glass', 'Glass Shard', 'common', 1, '+2% sát thương chí mạng.', { critDmg: .02 }),
  C('ch_echo_turn', 'Reverb', 'epic', 2, 'Thêm một lượt sau hành động đầu.', undefined, { kind: 'opening_extra', value: 1, scales: false }),
  C('ch_soft_parry', 'Echo', 'rare', 1, 'Mỗi nhịp đỡ hồi 1% HP.', undefined, { kind: 'parry_heal', value: .01, scales: false }),
  C('ch_last_light', 'Fading Light', 'legendary', 1, 'Hồi sinh một lần với 30% HP.', undefined, { kind: 'revive_once', value: .30, scales: false }),
  C('ch_fall_ward', 'Guardian', 'epic', 1, 'Đồng đội gục: nhận khiên một đòn.', undefined, { kind: 'fall_ward', value: 1, scales: false }),
  C('ch_low_ward', 'Brink', 'rare', 1, 'Dưới 30% HP: khiên một đòn, một lần.', undefined, { kind: 'low_ward', value: 1, scales: false }),
  C('ch_rally_ap', 'Relay', 'rare', 1, '+2 AP khi vào trận.', undefined, { kind: 'start_ap', value: 2, scales: false }),
  C('ch_courage', 'Resolve', 'rare', 1, '+15% ATK dưới 60% HP.', undefined, { kind: 'low_atk_60', value: .15, scales: false }),
  C('ch_critical_edge', 'Cracked Steel', 'epic', 2, '+20% sát thương chí mạng dưới 30% HP.', undefined, { kind: 'low_crit_30', value: .2, scales: false }),
  C('ch_opening_ward', 'Opener', 'rare', 1, 'Vào trận có khiên chặn một đòn.', undefined, { kind: 'opening_ward', value: 1, scales: false }),
  // ---- chỉ số thuần
  C('ch_vigor', 'Vitality Charm', 'common', 1, '+HP tối đa.', { hp: 120 }),
  C('ch_edge', 'Sharp Edge Charm', 'common', 1, '+ATK.', { atk: 10 }),
  C('ch_bark', 'Bark Charm', 'common', 1, '+DEF.', { def: 9 }),
  C('ch_feather', 'Feather Charm', 'common', 1, '+Tốc độ và Né tránh.', { spd: 5, eva: 0.02 }),
  C('ch_hawk', 'Hawkeye Charm', 'rare', 2, '+Tỉ lệ & Sát thương chí mạng.', { critRate: 0.05, critDmg: 0.12 }),
  C('ch_titan', 'Titan Charm', 'epic', 4, '+HP, +DEF lớn.', { hp: 320, def: 22 }),
  // ---- khởi đầu trận
  C('ch_dawn_ap', 'Dawn Charm', 'rare', 1, 'Vào trận với +1 AP.', undefined, { kind: 'start_ap', value: 1, scales: false }),
  C('ch_first_strike', 'First Strike Charm', 'rare', 2, 'Hành động sớm hơn ở lượt đầu (thanh lượt -40%).', { spd: 3 }, { kind: 'first_strike', value: 0.4, scales: true }),
  C('ch_ward', 'Barrier Charm', 'common', 1, 'Vào trận có giáp = 12% HP tối đa.', undefined, { kind: 'start_shield', value: 0.12, scales: true }),
  C('ch_sprout', 'Sprout Charm', 'common', 1, 'Vào trận với Tái Sinh 2 lượt.', undefined, { kind: 'start_regen', value: 2, scales: false }),
  C('ch_resonance', 'Resonance Charm', 'rare', 2, 'Vào trận với +2 Cộng Hưởng.', undefined, { kind: 'start_charge', value: 2, scales: false }),
  // ---- phòng thủ chủ động
  C('ch_parry_ap', 'Ringing Steel Charm', 'rare', 1, 'Mỗi nhịp Đỡ thành công nhận thêm +1 AP (tối đa 1 lần/lượt địch).', undefined, { kind: 'parry_ap', value: 1, scales: false }),
  C('ch_riposte', 'Riposte Charm', 'epic', 3, 'Sát thương Phản Kích +35%.', undefined, { kind: 'counter_power', value: 0.35, scales: true }),
  C('ch_dodge_heal', 'Tailwind Charm', 'common', 1, 'Né thành công hồi 4% HP.', undefined, { kind: 'dodge_heal', value: 0.04, scales: true }),
  C('ch_evade_ap', 'Shadowstep Charm', 'rare', 3, 'Tự né (EVA) nhận +1 AP.', { eva: 0.03 }, { kind: 'evade_ap', value: 1, scales: false }),
  C('ch_thorns', 'Rose Thorn Charm', 'rare', 2, 'Phản lại 18% sát thương nhận vào.', undefined, { kind: 'thorns', value: 0.18, scales: true }),
  C('ch_last_stand', 'Unbroken Charm', 'legendary', 4, 'Một lần mỗi trận: chịu đòn chí tử còn 1 HP.', undefined, { kind: 'last_stand', value: 1, scales: false }),
  // ---- tấn công
  C('ch_perfect_crit', 'Perfect Beat Charm', 'epic', 3, 'Nhịp Hoàn Hảo luôn Chí Mạng.', undefined, { kind: 'perfect_crit', value: 1, scales: false }),
  C('ch_lifesteal', 'Blood Moon Charm', 'rare', 2, 'Hút 8% sát thương gây ra thành HP.', undefined, { kind: 'lifesteal', value: 0.08, scales: true }),
  C('ch_low_hp', 'Berserk Charm', 'rare', 2, 'Dưới 50% HP: +25% sát thương.', undefined, { kind: 'low_hp_power', value: 0.25, scales: true }),
  C('ch_breaker', 'Rockbreaker Charm', 'common', 1, '+20% sát thương Phá Thế.', undefined, { kind: 'break_power', value: 0.2, scales: true }),
  C('ch_weak_power', 'Element Pierce Charm', 'rare', 2, 'Đánh trúng điểm yếu: thêm +15% sát thương.', undefined, { kind: 'weak_power', value: 0.15, scales: true }),
  C('ch_stagger', 'Pursuit Charm', 'epic', 3, 'Đánh mục tiêu đang Choáng Phá Thế: +30% sát thương.', undefined, { kind: 'stagger_power', value: 0.3, scales: true }),
  C('ch_kill_ap', 'Hunter Charm', 'rare', 2, 'Hạ gục kẻ địch nhận +1 AP.', undefined, { kind: 'kill_ap', value: 1, scales: false }),
  C('ch_debuff_power', 'Venom Charm', 'epic', 3, '+8% sát thương mỗi debuff trên mục tiêu (tối đa 4).', undefined, { kind: 'debuff_power', value: 0.08, scales: true }),
  C('ch_ult_power', 'Finisher Charm', 'epic', 4, 'Tuyệt kỹ +25% sát thương.', undefined, { kind: 'ult_power', value: 0.25, scales: true }),
  C('ch_heal_power', 'Holy Water Charm', 'rare', 2, 'Hồi máu & giáp +20%.', undefined, { kind: 'heal_power', value: 0.2, scales: true }),
  C('ch_status_turns', 'Long Seal Charm', 'legendary', 5, 'Mọi hiệu ứng bạn gây ra kéo dài thêm 1 lượt.', undefined, { kind: 'status_turns', value: 1, scales: false }),
  C('ch_dot_power', 'Smolder Charm', 'epic', 4, 'Sát thương Thiêu Đốt / Xuất Huyết của bạn +35%.', undefined, { kind: 'dot_power', value: 0.35, scales: true }),
  // ---- đòn thường gây hiệu ứng
  C('ch_ember_touch', 'Cinder Charm', 'common', 1, 'Đòn thường gây Thiêu Đốt ×1.', undefined, { kind: 'basic_status', value: 1, scales: false, status: 'burn' }),
  C('ch_thorn_touch', 'Spike Charm', 'common', 1, 'Đòn thường gây Xuất Huyết ×1.', undefined, { kind: 'basic_status', value: 1, scales: false, status: 'bleed' }),
  C('ch_frost_touch', 'Hoarfrost Charm', 'rare', 2, 'Đòn thường gây Tê Cóng ×1.', undefined, { kind: 'basic_status', value: 1, scales: false, status: 'frostbite' }),
  C('ch_hunter_touch', 'Hunt Mark Charm', 'epic', 5, 'Đòn thường đặt Ấn Săn.', undefined, { kind: 'basic_status', value: 1, scales: false, status: 'mark' }),
  // ---- đổi nguyên tố đòn thường (chiến thuật khắc hệ)
  C('ch_imbue_pyre', 'Fire Core Charm', 'rare', 1, 'Đòn thường mang hệ Dung Nham.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Pyre' }),
  C('ch_imbue_frost', 'Ice Core Charm', 'rare', 2, 'Đòn thường mang hệ Hàn Băng.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Frost' }),
  C('ch_imbue_tide', 'Water Core Charm', 'rare', 3, 'Đòn thường mang hệ Thủy Triều.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Tide' }),
  C('ch_imbue_verdant', 'Wood Core Charm', 'rare', 4, 'Đòn thường mang hệ Phong Mộc.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Verdant' }),
  C('ch_imbue_solar', 'Sun Core Charm', 'rare', 5, 'Đòn thường mang hệ Nhật Quang.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Solar' }),
  C('ch_imbue_astral', 'Star Core Charm', 'epic', 6, 'Đòn thường mang hệ Tinh Quang.', undefined, { kind: 'imbue', value: 1, scales: false, element: 'Astral' }),
  C('ch_guard_mend', 'Rebound Arrow Charm', 'rare', 2, 'Nhịp Đỡ thành công đầu tiên mỗi lượt địch cộng 1 Cộng Hưởng.', undefined, { kind: 'parry_charge', value: 1, scales: false }),
  C('ch_quiet_guard', 'Wind Shield Charm', 'rare', 2, 'Lần Né chủ động đầu tiên mỗi lượt địch tạo giáp bằng 6% HP tối đa.', undefined, { kind: 'dodge_shield', value: .06, scales: true }),
  C('ch_rupture_charge', 'Fault Line Charm', 'epic', 4, 'Đánh trúng địch đang Choáng Phá Thế nhận 1 AP, tối đa một lần mỗi hành động.', undefined, { kind: 'stagger_ap', value: 1, scales: false }),
  C('ch_chainbreak', 'Chainbreaker Charm', 'epic', 3, 'Khi gây Choáng Phá Thế, hồi 6% HP tối đa, tối đa một lần mỗi hành động.', undefined, { kind: 'break_heal', value: .06, scales: true }),
  C('ch_windstep', 'Cloud Mark Charm', 'common', 1, '+3 tốc độ và +3% Né tránh.', { spd: 3, eva: .03 }),
  C('ch_crimson_mortar', 'Bloodstone Charm', 'rare', 3, '+90 HP tối đa. Phản lại 12% sát thương nhận vào.', { hp: 90 }, { kind: 'thorns', value: .12, scales: true }),
  C('ch_quartz_fuse', 'Lightning Vein Charm', 'epic', 4, 'Đánh trúng điểm yếu nhận 1 AP, tối đa một lần mỗi hành động.', undefined, { kind: 'weak_ap', value: 1, scales: false }),
  C('ch_ember_petals', 'Ash Wing Charm', 'legendary', 5, 'Gây thêm 15% sát thương lên mục tiêu đang Thiêu Đốt.', undefined, { kind: 'burn_power', value: .15, scales: true }),
  C('ch_heart_knot', 'Heart Knot Charm', 'common', 2, '+7 DEF. Vào trận có Tái Sinh 1 lượt.', { def: 7 }, { kind: 'start_regen', value: 1, scales: false }),
];

export const EXPEDITION_CHARMS_BY_ID: Readonly<Record<string, CharmDef>> = Object.fromEntries(
  EXPEDITION_CHARMS.map((c) => [c.charmId, c]),
);

export function charmRankMult(rank: number): number {
  return 1 + Math.max(0, Math.min(EXP_BALANCE.charms.maxRank, rank) - 1) * EXP_BALANCE.charms.perRank;
}

export function charmStatsAt(def: CharmDef, rank: number): Partial<Record<StatKey, number>> {
  const m = charmRankMult(rank);
  const out: Partial<Record<StatKey, number>> = {};
  for (const [k, v] of Object.entries(def.stats ?? {})) out[k as StatKey] = (v ?? 0) * m;
  return out;
}

export function charmEffectValueAt(def: CharmDef, rank: number): number {
  if (!def.effect) return 0;
  return def.effect.scales ? +(def.effect.value * charmRankMult(rank)).toFixed(4) : def.effect.value;
}

/** Hiệu ứng bùa gộp lại cho 1 anh hùng (engine đọc). */
export interface CharmLoadout {
  fx: Partial<Record<CharmEffectKind, number>>;
  basicStatuses: StatusId[];
  imbue?: ElementType;
}

export function buildCharmLoadout(charmIds: readonly string[], owned: ExpeditionProfile['charms']): CharmLoadout {
  const out: CharmLoadout = { fx: {}, basicStatuses: [] };
  for (const id of charmIds) {
    const def = EXPEDITION_CHARMS_BY_ID[id];
    const rank = owned?.[id]?.rank ?? 0;
    if (!def?.effect || rank <= 0) continue;
    const v = charmEffectValueAt(def, rank);
    if (def.effect.kind === 'basic_status' && def.effect.status) out.basicStatuses.push(def.effect.status);
    else if (def.effect.kind === 'imbue' && def.effect.element) out.imbue = def.effect.element;
    else out.fx[def.effect.kind] = (out.fx[def.effect.kind] ?? 0) + v;
  }
  return out;
}

/** Chọn 1 bùa ngẫu nhiên trong các bùa có tier <= vùng. */
export function rollCharm(realmOrder: number, rand: () => number, minRarity?: CharmRarity): CharmDef {
  const weights = { ...EXP_BALANCE.charms.rarityWeights };
  if (minRarity) {
    for (const r of CHARM_RARITIES) if (CHARM_RARITIES.indexOf(r) < CHARM_RARITIES.indexOf(minRarity)) weights[r] = 0;
  }
  let rarity = pickWeighted(weights, rand());
  const eligible = EXPEDITION_CHARMS.filter((c) => c.tier <= realmOrder && (c.charmId !== 'ch_last_light' || minRarity !== undefined));
  let pool = eligible.filter((c) => c.rarity === rarity);
  while (!pool.length) {
    const idx = Math.max(0, CHARM_RARITIES.indexOf(rarity) - 1);
    rarity = CHARM_RARITIES[idx];
    pool = eligible.filter((c) => c.rarity === rarity);
    if (idx === 0 && !pool.length) pool = EXPEDITION_CHARMS.filter((c) => c.rarity === 'common');
  }
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

export interface CharmGain {
  charmId: string;
  nameVi: string;
  rarity: CharmRarity;
  rankAfter: number;
  isNew: boolean;
  convertedCrystal: number;
}

/** Thêm bùa vào bộ sưu tập (lên bậc nếu trùng). Trả về mô tả để hiện cho người chơi. */
export function grantCharm(profile: ExpeditionProfile, def: CharmDef): CharmGain {
  profile.charms ??= {};
  const cur = profile.charms[def.charmId];
  if (!cur) {
    profile.charms[def.charmId] = { rank: 1, obtainedAt: Date.now() };
    return { charmId: def.charmId, nameVi: def.nameVi, rarity: def.rarity, rankAfter: 1, isNew: true, convertedCrystal: 0 };
  }
  if (cur.rank >= EXP_BALANCE.charms.maxRank) {
    const c = EXP_BALANCE.charms.maxRankDupCrystal * (1 + CHARM_RARITIES.indexOf(def.rarity));
    profile.expCrystal += c;
    return { charmId: def.charmId, nameVi: def.nameVi, rarity: def.rarity, rankAfter: cur.rank, isNew: false, convertedCrystal: c };
  }
  cur.rank += 1;
  return { charmId: def.charmId, nameVi: def.nameVi, rarity: def.rarity, rankAfter: cur.rank, isNew: false, convertedCrystal: 0 };
}
