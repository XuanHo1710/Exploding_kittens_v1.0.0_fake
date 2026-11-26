/**
 * shared/src/bansung/weapon-skills/index.ts — gộp bảng skill súng của 4 nhóm + skill mặc định.
 */
import { BANSUNG_WEAPON_IDS, type BansungWeaponId } from '../types';
import { BANSUNG_ENERGY_WEAPON_SKILLS } from './energy';
import { BANSUNG_EXPLOSIVE_WEAPON_SKILLS } from './explosive';
import { BANSUNG_KINETIC_WEAPON_SKILLS } from './kinetic';
import { BANSUNG_MELEE_WEAPON_SKILLS } from './melee';
import type { BansungWeaponSkillSpec, BansungWeaponSkillTable } from './types';

export * from './types';
export {
  BANSUNG_ENERGY_WEAPON_SKILLS,
  BANSUNG_EXPLOSIVE_WEAPON_SKILLS,
  BANSUNG_KINETIC_WEAPON_SKILLS,
  BANSUNG_MELEE_WEAPON_SKILLS,
};

/** Skill mặc định cho súng chưa có skill riêng: tăng tốc bắn & sát thương ngắn hạn. */
export function makeDefaultWeaponSkill(weaponId: BansungWeaponId): BansungWeaponSkillSpec {
  return {
    weaponId,
    id: `${weaponId}_overdrive`,
    name: 'Overdrive',
    vnName: 'Quá Tải',
    desc: '+40% tốc bắn, +20% sát thương trong 4 giây',
    kind: 'buff',
    targeting: 'self',
    cooldownMs: 14000,
    energyCost: 10,
    durationMs: 4000,
    rangePx: 0,
    color: '#fbbf24',
    passive: {
      id: `${weaponId}_steady`,
      name: 'Steady Hands',
      vnName: 'Tay Vững',
      desc: 'Không có nội tại đặc biệt',
    },
  };
}

const MERGED: BansungWeaponSkillTable = {
  ...BANSUNG_KINETIC_WEAPON_SKILLS,
  ...BANSUNG_EXPLOSIVE_WEAPON_SKILLS,
  ...BANSUNG_ENERGY_WEAPON_SKILLS,
  ...BANSUNG_MELEE_WEAPON_SKILLS,
};

/** Bảng đầy đủ 36 súng (súng thiếu dữ liệu tự nhận skill mặc định). */
export const BANSUNG_WEAPON_SKILLS: Readonly<Record<BansungWeaponId, BansungWeaponSkillSpec>> = (() => {
  const out = {} as Record<BansungWeaponId, BansungWeaponSkillSpec>;
  for (const id of BANSUNG_WEAPON_IDS) {
    const spec = MERGED[id];
    out[id] = spec && spec.weaponId === id ? spec : makeDefaultWeaponSkill(id);
  }
  return out;
})();

export function getWeaponSkillSpec(weaponId: BansungWeaponId): BansungWeaponSkillSpec {
  return BANSUNG_WEAPON_SKILLS[weaponId] ?? makeDefaultWeaponSkill(weaponId);
}

/** true nếu súng đã có skill riêng (không phải skill mặc định). */
export function hasCustomWeaponSkill(weaponId: BansungWeaponId): boolean {
  return Boolean(MERGED[weaponId]);
}
