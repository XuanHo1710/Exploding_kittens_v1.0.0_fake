/**
 * Luật chiến đấu mở rộng (dùng chung client / server, tất cả tất định):
 *  - Hiệu ứng trạng thái có cộng dồn (buff / debuff / sát thương theo lượt / khống chế).
 *  - Tương khắc nguyên tố hai chiều (Khắc / Kháng) cho cả anh hùng và quái.
 *  - Tài nguyên "Cộng Hưởng" riêng của từng anh hùng (tích stack → bộc phát).
 *  - Bộ hiệu ứng kỹ năng (kit) của từng anh hùng: gây trạng thái, kích nổ stack, thanh tẩy.
 * Con số cân bằng lấy từ `EXP_BALANCE.status / affinity / charge`.
 */

import { EXP_BALANCE } from './balance';
import { ELEMENT_ADVANTAGE, type ElementType } from './types';

// ---------------------------------------------------------------- statuses

export const STATUS_IDS = [
  'atk_up',
  'def_up',
  'crit_up',
  'haste',
  'regen',
  'taunt',
  'atk_down',
  'def_down',
  'vuln',
  'slow',
  'burn',
  'bleed',
  'frostbite',
  'mark',
  'stun',
] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export interface StatusDef {
  id: StatusId;
  nameVi: string;
  icon: string;
  kind: 'buff' | 'debuff';
  maxStacks: number;
  color: string;
  descVi: string;
}

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  atk_up: { id: 'atk_up', nameVi: 'Cường Lực', icon: '⚔', kind: 'buff', maxStacks: 3, color: '#f97316', descVi: '+15% ATK mỗi tầng.' },
  def_up: { id: 'def_up', nameVi: 'Kiên Thủ', icon: '⛨', kind: 'buff', maxStacks: 3, color: '#60a5fa', descVi: '+20% DEF mỗi tầng.' },
  crit_up: { id: 'crit_up', nameVi: 'Tập Trung', icon: '✦', kind: 'buff', maxStacks: 3, color: '#facc15', descVi: '+12% Tỉ lệ chí mạng mỗi tầng.' },
  haste: { id: 'haste', nameVi: 'Gia Tốc', icon: '»', kind: 'buff', maxStacks: 1, color: '#22d3ee', descVi: '+25% Tốc độ, hành động sớm hơn.' },
  regen: { id: 'regen', nameVi: 'Tái Sinh', icon: '✚', kind: 'buff', maxStacks: 3, color: '#4ade80', descVi: 'Đầu lượt hồi 5% HP tối đa mỗi tầng.' },
  taunt: { id: 'taunt', nameVi: 'Khiêu Khích', icon: '☉', kind: 'buff', maxStacks: 1, color: '#fb7185', descVi: 'Địch buộc phải nhắm vào nhân vật này.' },
  atk_down: { id: 'atk_down', nameVi: 'Suy Yếu', icon: '↓', kind: 'debuff', maxStacks: 3, color: '#a78bfa', descVi: '-12% ATK mỗi tầng.' },
  def_down: { id: 'def_down', nameVi: 'Phá Giáp', icon: '⛉', kind: 'debuff', maxStacks: 3, color: '#f472b6', descVi: '-15% DEF mỗi tầng.' },
  vuln: { id: 'vuln', nameVi: 'Lộ Sơ Hở', icon: '◎', kind: 'debuff', maxStacks: 2, color: '#fde047', descVi: 'Nhận thêm 20% sát thương mỗi tầng.' },
  slow: { id: 'slow', nameVi: 'Trì Hoãn', icon: '⌛', kind: 'debuff', maxStacks: 2, color: '#94a3b8', descVi: '-15% Tốc độ mỗi tầng.' },
  burn: { id: 'burn', nameVi: 'Thiêu Đốt', icon: '🔥', kind: 'debuff', maxStacks: 5, color: '#fb923c', descVi: 'Đầu lượt mất máu theo số tầng (bỏ qua giáp).' },
  bleed: { id: 'bleed', nameVi: 'Xuất Huyết', icon: '🩸', kind: 'debuff', maxStacks: 5, color: '#ef4444', descVi: 'Đầu lượt mất máu, mỗi đòn trúng làm vết thương rỉ thêm.' },
  frostbite: { id: 'frostbite', nameVi: 'Tê Cóng', icon: '❄', kind: 'debuff', maxStacks: 3, color: '#7dd3fc', descVi: '-8% Tốc độ mỗi tầng; đủ 3 tầng sẽ Đóng Băng 1 lượt.' },
  mark: { id: 'mark', nameVi: 'Ấn Săn', icon: '✜', kind: 'debuff', maxStacks: 1, color: '#e879f9', descVi: 'Đòn kế tiếp nhận vào +35% sát thương rồi tiêu ấn.' },
  stun: { id: 'stun', nameVi: 'Đóng Băng / Choáng', icon: '✸', kind: 'debuff', maxStacks: 1, color: '#e2e8f0', descVi: 'Mất lượt kế tiếp. Đại Trùm miễn nhiễm (chuyển thành Trì Hoãn).' },
};

export interface StatusInstance {
  id: StatusId;
  stacks: number;
  turns: number;
  /** ATK của người gây hiệu ứng (để tính sát thương theo lượt), chốt lúc áp */
  power?: number;
}

/** Trạng thái do nguyên tố của đòn đánh quái / trùm gây ra khi trúng. */
export const ELEMENT_STATUS: Record<ElementType, StatusId> = {
  Pyre: 'burn',
  Frost: 'frostbite',
  Tide: 'slow',
  Verdant: 'bleed',
  Solar: 'def_down',
  Astral: 'atk_down',
};

// ---------------------------------------------------------------- affinity

export type Affinity = 'weak' | 'resist' | 'neutral';

/**
 * Đòn mang nguyên tố `attackEl` đánh vào mục tiêu:
 *  - Khắc (weak): đúng điểm yếu, hoặc nguyên tố tấn công khắc nguyên tố mục tiêu trên vòng tương khắc.
 *  - Kháng (resist): mục tiêu khắc ngược nguyên tố tấn công, hoặc nằm trong danh sách kháng riêng.
 */
export function affinityOf(
  attackEl: ElementType,
  defender: { element: ElementType; weakness?: ElementType; resists?: readonly ElementType[] },
): Affinity {
  if (defender.weakness === attackEl || ELEMENT_ADVANTAGE[attackEl] === defender.element) return 'weak';
  if (ELEMENT_ADVANTAGE[defender.element] === attackEl || defender.resists?.includes(attackEl)) return 'resist';
  return 'neutral';
}

export function affinityDamageMult(a: Affinity): number {
  const af = EXP_BALANCE.affinity;
  return a === 'weak' ? af.weakDamage : a === 'resist' ? af.resistDamage : 1;
}

export function affinityBreakMult(a: Affinity): number {
  const af = EXP_BALANCE.affinity;
  return a === 'weak' ? af.weakBreak : a === 'resist' ? af.resistBreak : 1;
}

export const AFFINITY_LABELS_VI: Record<Affinity, string> = {
  weak: 'KHẮC',
  resist: 'KHÁNG',
  neutral: '',
};

// ---------------------------------------------------------------- hero charge mechanics

export type ChargeFullBonus = 'crit' | 'break' | 'heal' | 'shield' | 'pierce' | 'ap';

export interface HeroMechanic {
  heroId: string;
  nameVi: string;
  descVi: string;
  max: number;
  gain: {
    basic?: number;
    perfectBeat?: number;
    parry?: number;
    dodge?: number;
    weakHit?: number;
    support?: number;
    crit?: number;
    statusApplied?: number;
    hurt?: number;
  };
  fullBonus: ChargeFullBonus;
  fullBonusVi: string;
}

const M = (
  heroId: string,
  nameVi: string,
  gain: HeroMechanic['gain'],
  fullBonus: ChargeFullBonus,
  fullBonusVi: string,
  descVi: string,
): HeroMechanic => ({ heroId, nameVi, gain, fullBonus, fullBonusVi, descVi, max: EXP_BALANCE.charge.defaultMax });

export const HERO_MECHANICS: Record<string, HeroMechanic> = {
  gustave_blade: M('gustave_blade', 'Kiếm Khí', { basic: 1, perfectBeat: 1 }, 'crit', 'đòn bộc phát chắc chắn Chí Mạng', 'Tích Kiếm Khí qua đòn thường và nhịp Hoàn Hảo; kỹ năng bộc phát xả toàn bộ Kiếm Khí.'),
  celine_prism: M('celine_prism', 'Sắc Màu', { basic: 1, support: 1 }, 'heal', 'hồi máu ×1.3 và thanh tẩy debuff', 'Mỗi nét cọ, mỗi lần chữa trị tích thêm Sắc Màu cho bức họa hồi sinh.'),
  bastian_aegis: M('bastian_aegis', 'Nham Giáp', { basic: 1, parry: 1, hurt: 1 }, 'shield', 'giáp ×1.3 và tự Khiêu Khích', 'Chịu đòn hoặc Đỡ thành công tích Nham Giáp; xả ra thành giáp lửa và đòn nện.'),
  lyra_frostbow: M('lyra_frostbow', 'Hàn Ấn', { basic: 1, weakHit: 1, statusApplied: 1 }, 'break', 'Phá Thế ×1.5', 'Mỗi lần đánh trúng điểm yếu hoặc gây Tê Cóng tích Hàn Ấn.'),
  kestrel_dune: M('kestrel_dune', 'Cát Tốc', { basic: 1, dodge: 1, crit: 1 }, 'ap', 'hoàn lại 2 AP', 'Né đòn và chí mạng tích Cát Tốc; bộc phát giúp liên hoàn kỹ năng.'),
  nereus_tide: M('nereus_tide', 'Thủy Âm', { basic: 1, support: 1, dodge: 1 }, 'heal', 'hồi máu ×1.3 và thanh tẩy debuff', 'Mỗi khúc nhạc tích Thủy Âm; bản thánh ca dùng toàn bộ để chữa lành.'),
  corvus_night: M('corvus_night', 'Nguyệt Ấn', { basic: 1, statusApplied: 1, weakHit: 1 }, 'pierce', 'xuyên 50% giáp', 'Đánh dấu con mồi tích Nguyệt Ấn; bộc phát xuyên thủng giáp.'),
  ignis_valkyrie: M('ignis_valkyrie', 'Hỏa Ý', { basic: 1, crit: 1, statusApplied: 1 }, 'crit', 'đòn bộc phát chắc chắn Chí Mạng', 'Thiêu đốt và chí mạng tích Hỏa Ý cho ngọn thương rực cháy.'),
  marina_abyss: M('marina_abyss', 'Áp Lực', { basic: 1, weakHit: 1 }, 'break', 'Phá Thế ×1.5', 'Đòn khắc hệ tích Áp Lực đáy biển; xả ra nghiền nát thế thủ.'),
  aurelia_eclipse: M('aurelia_eclipse', 'Nhật Quang', { basic: 1, perfectBeat: 1, crit: 1 }, 'crit', 'đòn bộc phát chắc chắn Chí Mạng', 'Mỗi nhịp kiếm hoàn hảo tích Nhật Quang cho đòn phán quyết.'),
  seraph_glacier: M('seraph_glacier', 'Băng Tâm', { basic: 1, parry: 1, hurt: 1 }, 'shield', 'giáp ×1.3 và tự Khiêu Khích', 'Đỡ đòn tích Băng Tâm; xả ra dựng thành lũy băng cho cả đội.'),
  jung_afterglow: M('jung_afterglow', 'Dư Quang', { basic: 1, crit: 1, dodge: 1, perfectBeat: 1 }, 'pierce', 'xuyên 50% giáp', 'Chí mạng, né đòn và nhịp hoàn hảo tích Dư Quang; xả ra thành nhát chém hừng đông xuyên giáp.'),
  lumina_chrono: M('lumina_chrono', 'Tinh Vận', { basic: 1, support: 1, perfectBeat: 1 }, 'ap', 'hoàn lại 2 AP', 'Giai điệu tinh hà tích Tinh Vận, bộc phát giúp cả đội xoay vòng AP.'),
};

export function heroMechanicOf(heroId: string): HeroMechanic {
  return HERO_MECHANICS[heroId] ?? M(heroId, 'Cộng Hưởng', { basic: 1 }, 'crit', 'đòn bộc phát chắc chắn Chí Mạng', 'Tích cộng hưởng qua đòn thường.');
}

// ---------------------------------------------------------------- skill kits

export type EffectTarget = 'target' | 'enemies' | 'self' | 'allies' | 'ally';

export type SkillEffect =
  | { kind: 'status'; status: StatusId; stacks: number; turns: number; to: EffectTarget; chance?: number }
  | { kind: 'cleanse'; to: 'allies' | 'self' | 'ally' }
  | { kind: 'dispel'; to: 'target' | 'enemies' }
  | { kind: 'detonate'; status: 'burn' | 'bleed' | 'frostbite'; mult: number };

export interface SkillKit {
  effects?: SkillEffect[];
  /** xả toàn bộ Cộng Hưởng để tăng uy lực */
  consume?: boolean;
}

const st = (status: StatusId, stacks: number, turns: number, to: EffectTarget, chance?: number): SkillEffect => ({
  kind: 'status',
  status,
  stacks,
  turns,
  to,
  chance,
});

/** Bộ hiệu ứng riêng theo kỹ năng (ghép thêm vào dữ liệu kỹ năng gốc ở catalog). */
export const SKILL_KITS: Record<string, SkillKit> = {
  // Lâm Phong — kiếm khách xuất huyết + bộc phát chí mạng
  gus_gale_lunge: { effects: [st('bleed', 2, 3, 'target')] },
  gus_overcharge: { effects: [st('def_down', 1, 2, 'target')], consume: true },
  gus_ult_tempest: { effects: [st('crit_up', 2, 2, 'self'), { kind: 'detonate', status: 'bleed', mult: 0.6 }], consume: true },
  // Minh Châu — hồi phục, tái sinh, buff tấn công
  cel_radiant_mend: { effects: [st('regen', 1, 3, 'allies')] },
  cel_sun_brand: { effects: [st('mark', 1, 3, 'target')] },
  cel_ult_aurora_canvas: { effects: [st('atk_up', 1, 3, 'allies'), { kind: 'cleanse', to: 'allies' }], consume: true },
  // Thạch Sơn — khiêu khích, giáp, thiêu đốt
  bas_bulwark: { effects: [st('taunt', 1, 2, 'self'), st('def_up', 1, 2, 'allies')] },
  bas_anvil_crush: { effects: [st('burn', 2, 3, 'target'), st('def_down', 1, 2, 'target')], consume: true },
  bas_ult_bastion: { effects: [st('burn', 1, 3, 'enemies'), st('def_up', 2, 3, 'allies')], consume: true },
  // Băng Tâm — tê cóng, đóng băng, phá thế
  lyr_basic: { effects: [st('frostbite', 1, 3, 'target', 0.5)] },
  lyr_triple_icicle: { effects: [st('frostbite', 2, 3, 'target')] },
  lyr_hail_volley: { effects: [st('slow', 1, 2, 'enemies')], consume: true },
  lyr_ult_zero_arrow: { effects: [st('frostbite', 3, 3, 'target'), { kind: 'detonate', status: 'frostbite', mult: 0.5 }], consume: true },
  // Sa Vũ — gia tốc, chí mạng, xuất huyết
  kes_mirage_step: { effects: [st('crit_up', 1, 3, 'allies')] },
  kes_sand_flurry: { effects: [st('bleed', 2, 3, 'target')], consume: true },
  kes_ult_golden_fang: { effects: [st('crit_up', 2, 2, 'self'), { kind: 'detonate', status: 'bleed', mult: 0.5 }], consume: true },
  // Hải Đăng — tái sinh, thanh tẩy, làm chậm
  ner_coral_grace: { effects: [st('regen', 2, 3, 'allies')] },
  ner_riptide_chord: { effects: [st('slow', 1, 2, 'enemies'), st('atk_down', 1, 2, 'enemies')] },
  ner_ult_leviathan_hymn: { effects: [{ kind: 'cleanse', to: 'allies' }, st('regen', 2, 3, 'allies')], consume: true },
  // Dạ Vũ — ấn săn, suy yếu, phá giáp
  cor_umbra_mark: { effects: [st('mark', 1, 3, 'target'), st('atk_down', 1, 2, 'target')] },
  cor_reaper_arc: { effects: [st('bleed', 1, 3, 'enemies')], consume: true },
  cor_ult_abyss_Bell: { effects: [st('def_down', 2, 3, 'target'), { kind: 'dispel', to: 'target' }], consume: true },
  // Hồng Liên — thiêu đốt cộng dồn, kích nổ
  ign_basic: { effects: [st('burn', 1, 3, 'target', 0.5)] },
  ign_magma_dive: { effects: [st('burn', 2, 3, 'target')] },
  ign_cinder_sweep: { effects: [st('burn', 1, 3, 'enemies')], consume: true },
  ign_ult_valkyrie_star: { effects: [{ kind: 'detonate', status: 'burn', mult: 0.9 }], consume: true },
  // Lam Ngọc — trói chân, áp lực, làm chậm
  mar_vortex_bind: { effects: [st('slow', 2, 2, 'target')] },
  mar_abyss_geyser: { effects: [st('atk_down', 1, 2, 'enemies')], consume: true },
  mar_ult_maelstrom: { effects: [st('slow', 2, 2, 'enemies'), st('def_down', 1, 2, 'enemies')], consume: true },
  // Nhật Hạ — phá giáp, thiêu đốt, cường lực
  aur_solar_cleave: { effects: [st('def_down', 2, 3, 'target')], consume: true },
  aur_eclipse_nova: { effects: [st('burn', 1, 3, 'enemies')] },
  aur_ult_judgement: { effects: [st('atk_up', 2, 3, 'self'), { kind: 'detonate', status: 'burn', mult: 0.6 }], consume: true },
  // Hàn Thiên — thành lũy băng, khiêu khích, tê cóng
  ser_glacier_crown: { effects: [st('taunt', 1, 2, 'self'), st('def_up', 1, 3, 'allies')] },
  ser_shatter_lance: { effects: [st('frostbite', 2, 3, 'target'), { kind: 'detonate', status: 'frostbite', mult: 0.4 }], consume: true },
  ser_ult_eternal_winter: { effects: [st('frostbite', 2, 3, 'enemies'), st('def_up', 2, 3, 'allies')], consume: true },
  // Tinh Hà — cường lực, tập trung, ấn săn diện rộng
  lum_astral_surge: { effects: [st('atk_up', 1, 3, 'allies'), st('crit_up', 1, 3, 'allies')] },
  lum_starfall_prism: { effects: [st('mark', 1, 2, 'enemies')], consume: true },
  lum_ult_symphony: { effects: [{ kind: 'cleanse', to: 'allies' }, st('atk_up', 2, 3, 'allies'), st('crit_up', 1, 3, 'allies')], consume: true },
};

export function describeEffect(e: SkillEffect): string {
  const who: Record<EffectTarget, string> = {
    target: 'mục tiêu',
    enemies: 'toàn phe địch',
    self: 'bản thân',
    allies: 'cả đội',
    ally: 'đồng minh',
  };
  if (e.kind === 'status') {
    const d = STATUS_DEFS[e.status];
    return `${d.icon} ${d.nameVi} ×${e.stacks} (${e.turns} lượt) → ${who[e.to]}${e.chance && e.chance < 1 ? ` · ${Math.round(e.chance * 100)}%` : ''}`;
  }
  if (e.kind === 'cleanse') return '✧ Thanh tẩy debuff';
  if (e.kind === 'dispel') return '✂ Xóa buff của địch';
  return `💥 Kích nổ ${STATUS_DEFS[e.status].nameVi} (×${e.mult}/tầng)`;
}
