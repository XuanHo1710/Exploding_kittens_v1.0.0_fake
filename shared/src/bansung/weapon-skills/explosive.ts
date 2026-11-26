/**
 * shared/src/bansung/weapon-skills/explosive.ts — dữ liệu skill + nội tại cho nhóm chất nổ
 * (6 khẩu: grenade_launcher, stun_launcher, bazooka, mine_gun, cluster_rpg, orbital_cannon).
 * Khung chung: ./types.ts. Logic server: server/src/game/bansung/weapon-skills/explosive.ts.
 *
 * Vai trò trong nhóm (spec 007 · C):
 *   grenade_launcher  dọn bầy tầm trung      · Frag Barrage   (rải 5 lựu quạt)
 *   stun_launcher     khống chế / hỗ trợ     · Concussion Dome (vòm chấn động có cảnh báo)
 *   bazooka           diệt Tank / Boss       · Tank Buster    (1 rocket HEAT xuyên giáp)
 *   mine_gun          gài bẫy chặn đường     · Minefield      (6 mìn vòng tròn tại con trỏ)
 *   cluster_rpg       truy đuổi nhiều mục tiêu · Hydra Swarm  (8 tên lửa tự dẫn)
 *   orbital_cannon    huỷ diệt diện rộng     · Orbital Strike (5 phát pháo quỹ đạo có cảnh báo)
 */
import type { BansungWeaponSkillTable } from './types';

export const BANSUNG_EXPLOSIVE_WEAPON_SKILLS: BansungWeaponSkillTable = {
  grenade_launcher: {
    weaponId: 'grenade_launcher',
    id: 'gl_frag_barrage',
    name: 'Frag Barrage',
    vnName: 'Mưa Lựu Đạn',
    desc: 'Rải nhanh 5 quả lựu hình quạt về phía con trỏ, mỗi quả nổ kèm mảnh đạn',
    kind: 'barrage',
    targeting: 'cursor',
    cooldownMs: 11000,
    energyCost: 14,
    durationMs: 700,
    rangePx: 420,
    color: '#f97316',
    passive: {
      id: 'gl_demolition',
      name: 'Demolition',
      vnName: 'Phá Huỷ',
      desc: 'Mỗi zombie hạ bằng nổ: +4% sát thương (tối đa 5 lần, 4 giây)',
    },
  },
  stun_launcher: {
    weaponId: 'stun_launcher',
    id: 'sl_concussion_dome',
    name: 'Concussion Dome',
    vnName: 'Vòm Chấn Động',
    desc: 'Đánh dấu vùng tại con trỏ, sau 0.8s nổ chấn động: choáng 1.2s, đẩy lùi (boss chỉ choáng 0.3s)',
    kind: 'zone',
    targeting: 'cursor',
    cooldownMs: 14000,
    energyCost: 16,
    durationMs: 900,
    rangePx: 180,
    color: '#38bdf8',
    passive: {
      id: 'sl_shock_plating',
      name: 'Shock Plating',
      vnName: 'Giáp Xung Kích',
      desc: 'Mỗi lần làm choáng zombie: +2 khiên (tối đa 2 lần mỗi giây)',
    },
  },
  bazooka: {
    weaponId: 'bazooka',
    id: 'bz_tank_buster',
    name: 'Tank Buster',
    vnName: 'Diệt Xe Tăng',
    desc: 'Bắn 1 rocket HEAT khổng lồ: sát thương cực lớn, xuyên 50% giáp, nổ bán kính 120',
    kind: 'burst',
    targeting: 'aim',
    cooldownMs: 13000,
    energyCost: 18,
    durationMs: 0,
    rangePx: 900,
    color: '#ef4444',
    passive: {
      id: 'bz_siege_lock',
      name: 'Siege Lock',
      vnName: 'Khoá Vị Trí',
      desc: 'Đứng yên 1 giây: +15% sát thương và +10% bán kính nổ',
    },
  },
  mine_gun: {
    weaponId: 'mine_gun',
    id: 'mg_minefield',
    name: 'Minefield',
    vnName: 'Bãi Mìn',
    desc: 'Gài 6 mìn quanh con trỏ, tự nổ khi zombie lại gần (tối đa 6 giây) và làm chậm',
    kind: 'zone',
    targeting: 'cursor',
    cooldownMs: 15000,
    energyCost: 15,
    durationMs: 6000,
    rangePx: 420,
    color: '#a3e635',
    passive: {
      id: 'mg_tripwire',
      name: 'Tripwire',
      vnName: 'Dây Bẫy',
      desc: 'Mìn thường nổ trúng sẽ làm chậm zombie 35% trong 1.2 giây',
    },
  },
  cluster_rpg: {
    weaponId: 'cluster_rpg',
    id: 'cr_hydra_swarm',
    name: 'Hydra Swarm',
    vnName: 'Bầy Tên Lửa Hydra',
    desc: 'Phóng liên tiếp 8 tên lửa tự dẫn, mỗi quả tự tìm zombie gần con trỏ',
    kind: 'barrage',
    targeting: 'cursor',
    cooldownMs: 12000,
    energyCost: 18,
    durationMs: 1000,
    rangePx: 860,
    color: '#fb923c',
    passive: {
      id: 'cr_split_payload',
      name: 'Split Payload',
      vnName: 'Đầu Đạn Tách',
      desc: 'Cứ mỗi phát thứ 4 bắn thêm 1 tên lửa phụ',
    },
  },
  orbital_cannon: {
    weaponId: 'orbital_cannon',
    id: 'oc_orbital_strike',
    name: 'Orbital Strike',
    vnName: 'Oanh Tạc Quỹ Đạo',
    desc: 'Gọi 5 phát pháo quỹ đạo xuống quanh con trỏ sau 1 giây cảnh báo, mỗi phát nổ rộng 120',
    kind: 'zone',
    targeting: 'cursor',
    cooldownMs: 18000,
    energyCost: 24,
    durationMs: 2600,
    rangePx: 220,
    color: '#facc15',
    passive: {
      id: 'oc_target_uplink',
      name: 'Target Uplink',
      vnName: 'Liên Kết Mục Tiêu',
      desc: 'Mỗi lần hạ zombie: +2% chí mạng (tối đa 10 lần, mất dần sau 6 giây)',
    },
  },
};
