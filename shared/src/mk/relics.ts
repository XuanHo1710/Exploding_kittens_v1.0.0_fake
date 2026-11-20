/**
 * 12 Roguelite Pixel Relics (`MkRelicSpec`) awarded after Boss kills (choose 1 of 3).
 */
import { MK_RELIC_IDS, type MkRelicId } from './types';

export interface MkRelicSpec {
  id: MkRelicId;
  name: string;
  nameVi: string;
  descVi: string;
  color: string;
  icon: string;
  maxStacks: number;
}

export const MK_RELICS: Record<MkRelicId, MkRelicSpec> = {
  vampiric_fang: {
    id: 'vampiric_fang',
    name: 'Vampiric Fang',
    nameVi: 'Nanh Ma Cà Rồng',
    descVi: 'Hút 6% sát thương kỹ năng thành HP mỗi tầng.',
    color: '#e11d48',
    icon: 'relic_vampiric_fang',
    maxStacks: 4,
  },
  chrono_crystal: {
    id: 'chrono_crystal',
    name: 'Chrono Crystal',
    nameVi: 'Tinh Thể Thời Gian',
    descVi: 'Giảm 14% thời gian hồi mọi kỹ năng (tối đa 50%).',
    color: '#38bdf8',
    icon: 'relic_chrono_crystal',
    maxStacks: 4,
  },
  phantom_cloak: {
    id: 'phantom_cloak',
    name: 'Phantom Cloak',
    nameVi: 'Áo Choàng Dư Ảnh',
    descVi: 'Skill 1–4 tạo thêm bóng dư ảnh gây 25% sát thương trễ 0.2s.',
    color: '#a855f7',
    icon: 'relic_phantom_cloak',
    maxStacks: 3,
  },
  thunder_sigil: {
    id: 'thunder_sigil',
    name: 'Thunder Sigil',
    nameVi: 'Ấn Ký Lôi Thần',
    descVi: 'Đòn Combo thứ 3 giáng tia sét lan 2 kẻ địch gần nhất.',
    color: '#facc15',
    icon: 'relic_thunder_sigil',
    maxStacks: 4,
  },
  parry_emblem: {
    id: 'parry_emblem',
    name: 'Parry Emblem',
    nameVi: 'Huy Hiệu Phản Đòn',
    descVi: 'Mở rộng cửa sổ Perfect Parry +70 ms và nhân 2× sát thương phản.',
    color: '#fbbf24',
    icon: 'relic_parry_emblem',
    maxStacks: 3,
  },
  fury_core: {
    id: 'fury_core',
    name: 'Fury Core',
    nameVi: 'Lõi Cuồng Nộ',
    descVi: 'Tăng +35% tốc độ nạp thanh Fury cho Tuyệt kỹ Ultimate.',
    color: '#f97316',
    icon: 'relic_fury_core',
    maxStacks: 3,
  },
  giant_slayer: {
    id: 'giant_slayer',
    name: 'Giant Slayer',
    nameVi: 'Diệt Cự Nhân',
    descVi: 'Tăng +25% sát thương gây lên Mini-Boss và Đại Boss.',
    color: '#ef4444',
    icon: 'relic_giant_slayer',
    maxStacks: 4,
  },
  frost_brand: {
    id: 'frost_brand',
    name: 'Frost Brand',
    nameVi: 'Khắc Ấn Băng Giá',
    descVi: 'Đòn chí mạng làm chậm kẻ địch 35% trong 2 giây.',
    color: '#22d3ee',
    icon: 'relic_frost_brand',
    maxStacks: 3,
  },
  midas_coin: {
    id: 'midas_coin',
    name: 'Midas Coin',
    nameVi: 'Đồng Xu Midas',
    descVi: '+30% Vàng nhặt được & mỗi 500 Vàng cộng +5% ATK.',
    color: '#eab308',
    icon: 'relic_midas_coin',
    maxStacks: 3,
  },
  phoenix_feather: {
    id: 'phoenix_feather',
    name: 'Phoenix Feather',
    nameVi: 'Lông Phượng Hoàng',
    descVi: 'Tự hồi sinh 1 lần mỗi tầng với 60% HP + sóng đẩy lùi khi gục ngã.',
    color: '#fb923c',
    icon: 'relic_phoenix_feather',
    maxStacks: 2,
  },
  aegis_rune: {
    id: 'aegis_rune',
    name: 'Aegis Rune',
    nameVi: 'Cổ Ngữ Hộ Mệnh',
    descVi: 'Đầu mỗi Wave tạo lớp giáp ảo bằng 20% Max HP mỗi tầng.',
    color: '#60a5fa',
    icon: 'relic_aegis_rune',
    maxStacks: 3,
  },
  combo_master: {
    id: 'combo_master',
    name: 'Combo Master',
    nameVi: 'Bậc Thầy Liên Kích',
    descVi: 'Mỗi 15 chuỗi Combo tăng +4% sát thương (tối đa +40%).',
    color: '#4ade80',
    icon: 'relic_combo_master',
    maxStacks: 3,
  },
};

export function rollMkRelicChoices(
  existingStacks: ReadonlyMap<MkRelicId, number>,
  random: () => number,
  count = 3,
): MkRelicId[] {
  const pool = MK_RELIC_IDS.filter((id) => (existingStacks.get(id) ?? 0) < MK_RELICS[id].maxStacks);
  const src = pool.length >= count ? [...pool] : [...MK_RELIC_IDS];
  const picks: MkRelicId[] = [];
  while (picks.length < count && src.length > 0) {
    const idx = Math.floor(random() * src.length);
    const [chosen] = src.splice(idx, 1);
    if (chosen) picks.push(chosen);
  }
  return picks;
}
