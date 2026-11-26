/**
 * shared/src/bansung/weapon-skills/melee.ts — dữ liệu skill + nội tại cho nhóm cận chiến
 * (3 khẩu: crescent_blade, reaper_scythe, shock_baton) — spec 007 · C.
 * Khung chung: ./types.ts. Logic server: server/src/game/bansung/weapon-skills/melee.ts.
 *
 * Triết lý: cận chiến rủi ro (phải áp sát zombie trong bóng tối) nên skill phải mạnh và
 * luôn có yếu tố sống sót: lướt bất tử (Nguyệt Đao), hút máu (Lưỡi Hái), khống chế (Dùi Cui).
 */
import type { BansungWeaponSkillTable } from './types';

export const BANSUNG_MELEE_WEAPON_SKILLS: BansungWeaponSkillTable = {
  crescent_blade: {
    weaponId: 'crescent_blade',
    id: 'crescent_moon_dash',
    name: 'Moon Dash',
    vnName: 'Nguyệt Ảnh Trảm',
    desc: 'Lướt 180px theo hướng ngắm, bất tử 0.35s, chém xuyên mọi zombie trên đường (x3 sát thương)',
    kind: 'dash',
    targeting: 'aim',
    cooldownMs: 7000,
    energyCost: 0,
    durationMs: 200,
    rangePx: 180,
    color: '#74c0fc',
    passive: {
      id: 'crescent_flow',
      name: 'Crescent Flow',
      vnName: 'Dòng Chảy Nguyệt',
      desc: 'Mỗi nhát trúng +6% tốc chém (tối đa +30%), mất dần sau 2s không trúng',
    },
  },
  reaper_scythe: {
    weaponId: 'reaper_scythe',
    id: 'reaper_death_whirl',
    name: 'Death Whirl',
    vnName: 'Vũ Điệu Tử Thần',
    desc: 'Xoay lưỡi hái 2s quanh mình (r=130), kéo zombie vào, mỗi nhịp hút máu theo số quái trúng',
    kind: 'zone',
    targeting: 'self',
    cooldownMs: 14000,
    energyCost: 20,
    durationMs: 2000,
    rangePx: 130,
    color: '#e64980',
    passive: {
      id: 'reaper_soul_harvest',
      name: 'Soul Harvest',
      vnName: 'Gặt Linh Hồn',
      desc: 'Mỗi zombie hạ được +1 linh hồn (tối đa 10): +3% sát thương/linh hồn, hồi 1 máu',
    },
  },
  shock_baton: {
    weaponId: 'shock_baton',
    id: 'baton_tesla_dome',
    name: 'Tesla Dome',
    vnName: 'Vòm Điện Tesla',
    desc: 'Tạo vòm điện r=150 trong 3s: choáng ngắn, làm chậm 40% và giật zombie bên trong, +8 khiên',
    kind: 'zone',
    targeting: 'self',
    cooldownMs: 16000,
    energyCost: 25,
    durationMs: 3000,
    rangePx: 150,
    color: '#3bc9db',
    passive: {
      id: 'baton_overcharge',
      name: 'Overcharge',
      vnName: 'Quá Tải Điện',
      desc: 'Cứ 5 nhát trúng, phóng 1 tia sét sang zombie gần nhất (r=140) gây choáng ngắn',
    },
  },
};
