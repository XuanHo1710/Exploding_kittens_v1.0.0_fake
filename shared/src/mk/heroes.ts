/**
 * 6 Playable Pixel Heroes — each with 15 master frames (0..14),
 * 3-Hit Basic Combo, 4 Active Skills (with Lv3/Lv5 VFX Evolution),
 * 1 Awakening Ultimate (100 Fury), and 2 Passives.
 */
import {
  MK_HERO_ANCHOR_X,
  MK_HERO_ANCHOR_Y,
  MK_HERO_CELL_PX,
  type MkHeroId,
  type MkPlayMode,
  type MkUpgradeLevels,
  type MkUpgradeTarget,
} from './types';

export const MK_HERO_MASTER_FRAMES = 15 as const;
export const MK_HERO_SPRITE_W = MK_HERO_CELL_PX;
export const MK_HERO_SPRITE_H = MK_HERO_CELL_PX;
export { MK_HERO_ANCHOR_X, MK_HERO_ANCHOR_Y };

export interface MkSkillSpec {
  id: string;
  slot: 1 | 2 | 3 | 4;
  name: string;
  nameVi: string;
  descVi: string;
  evoLv3Vi: string;
  evoLv5Vi: string;
  icon: string;
  cooldownMs: number;
  unlockCostGold: number;
  upgradeBaseGold: number;
  damageMult: number;
  radius: number;
  maxLevel: number;
}

export interface MkUltimateSpec {
  id: string;
  name: string;
  nameVi: string;
  descVi: string;
  icon: string;
  damageMult: number;
  radius: number;
}

export interface MkPassiveSpec {
  id: string;
  name: string;
  nameVi: string;
  descVi: string;
  unlockCostGold: number;
  upgradeBaseGold: number;
  maxLevel: number;
}

export interface MkHeroSpec {
  id: MkHeroId;
  codeName: string;
  titleVi: string;
  elementVi: string;
  roleVi: string;
  weaponType: 'sword' | 'bow' | 'daggers' | 'axe' | 'staff' | 'lance';
  weaponIcon: string;
  accentColor: string;
  secondaryColor: string;
  frameCount: typeof MK_HERO_MASTER_FRAMES;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpd: number;
  hpPerUpgrade: number;
  atkPerUpgrade: number;
  defPerUpgrade: number;
  spdPerUpgrade: number;
  attackCooldownMs: number;
  attackRange: number;
  baseCritChance: number;
  baseEvadeChance: number;
  dashCooldownMs: number;
  comboMults: readonly [number, number, number];
  skills: readonly [MkSkillSpec, MkSkillSpec, MkSkillSpec, MkSkillSpec];
  ultimate: MkUltimateSpec;
  p1: MkPassiveSpec;
  p2: MkPassiveSpec;
}

export const MK_HEROES: Record<MkHeroId, MkHeroSpec> = {
  knight: {
    id: 'knight',
    codeName: 'Aragon',
    titleVi: 'Hiệp Sĩ Lam',
    elementVi: 'Thánh Quang / Thép',
    roleVi: 'Đỡ đòn · Phản công & Kiếm khí',
    weaponType: 'sword',
    weaponIcon: 'weapon_sword',
    accentColor: '#3b82f6',
    secondaryColor: '#fde047',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 280,
    baseAtk: 28,
    baseDef: 15,
    baseSpd: 142,
    hpPerUpgrade: 46,
    atkPerUpgrade: 7,
    defPerUpgrade: 4,
    spdPerUpgrade: 6,
    attackCooldownMs: 300,
    attackRange: 56,
    baseCritChance: 0.12,
    baseEvadeChance: 0.14,
    dashCooldownMs: 1900,
    comboMults: [1.0, 1.15, 1.55],
    skills: [
      {
        id: 'twist_of_fury',
        slot: 1,
        name: 'Twist of Fury',
        nameVi: 'Cuồng Phong Kiếm',
        descVi: 'Xoay kiếm 360° bất tử 0.6s, chém liên hoàn đẩy lùi mọi quái xung quanh.',
        evoLv3Vi: 'Lv3: Mở rộng bán kính lốc kiếm +25%',
        evoLv5Vi: 'Lv5: Gọi thêm tia sét xanh quét vòng ngoài',
        icon: 'skill_knight_1',
        cooldownMs: 5000,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.35,
        radius: 82,
        maxLevel: 5,
      },
      {
        id: 'holy_judgment',
        slot: 2,
        name: 'Holy Judgment',
        nameVi: 'Thánh Kiếm Trừng Phạt',
        descVi: 'Nhảy bổ xuống tạo cột ánh sáng thánh, gây sát thương lớn và làm choáng 1.8s.',
        evoLv3Vi: 'Lv3: Nứt mặt đất gây thêm sóng chấn động',
        evoLv5Vi: 'Lv5: Nổ ánh sáng 2 đợt liên tiếp',
        icon: 'skill_knight_2',
        cooldownMs: 8000,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.25,
        radius: 105,
        maxLevel: 5,
      },
      {
        id: 'aegis_charge',
        slot: 3,
        name: 'Aegis Charge',
        nameVi: 'Hộ Thuẫn Xung Kích',
        descVi: 'Giơ khiên vàng húc xuyên hàng quái, đẩy lùi và tạo giáp ảo 15% HP cho cả đội.',
        evoLv3Vi: 'Lv3: Để lại vệt thánh quang thiêu đốt',
        evoLv5Vi: 'Lv5: Giáp ảo tăng lên 25% HP + phản 25% dmg',
        icon: 'skill_knight_3',
        cooldownMs: 8500,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 2.5,
        radius: 130,
        maxLevel: 5,
      },
      {
        id: 'radiant_wave',
        slot: 4,
        name: 'Radiant Wave',
        nameVi: 'Kiếm Khí Xuyên Phá',
        descVi: 'Chém bổ phóng 3 vệt kiếm khí lưỡi liềm xuyên hàng dọc đường chạy 2.5D.',
        evoLv3Vi: 'Lv3: Tăng lên 4 vệt kiếm khí',
        evoLv5Vi: 'Lv5: Phóng 5 kiếm khí thánh quang cháy sáng',
        icon: 'skill_knight_4',
        cooldownMs: 10000,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 2.9,
        radius: 260,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'excalibur_ascendant',
      name: 'Excalibur Ascendant',
      nameVi: 'Thánh Quang Phán Quyết',
      descVi: 'Triệu hồi Cự Kiếm Thánh giáng từ trời quét sạch chiến trường và hồi 25% HP cả đội.',
      icon: 'ult_knight',
      damageMult: 5.4,
      radius: 230,
    },
    p1: {
      id: 'aegis_guard',
      name: 'Aegis Guard',
      nameVi: 'Khiên Thần Hộ Mệnh',
      descVi: 'Tăng xác suất bật khiên EVADE né trọn đòn (+5%/cấp).',
      unlockCostGold: 60,
      upgradeBaseGold: 70,
      maxLevel: 5,
    },
    p2: {
      id: 'valor_aura',
      name: 'Valor Aura',
      nameVi: 'Hào Quang Dũng Sĩ',
      descVi: 'Cộng giáp DEF cho bản thân và đồng đội gần (+3 DEF/cấp).',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },

  archer: {
    id: 'archer',
    codeName: 'Varrick',
    titleVi: 'Cung Thủ Rừng Xanh',
    elementVi: 'Phong / Băng',
    roleVi: 'Tầm xa · Bắn tỉa & Khống chế',
    weaponType: 'bow',
    weaponIcon: 'weapon_bow',
    accentColor: '#22c55e',
    secondaryColor: '#38bdf8',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 200,
    baseAtk: 26,
    baseDef: 8,
    baseSpd: 158,
    hpPerUpgrade: 34,
    atkPerUpgrade: 8,
    defPerUpgrade: 2,
    spdPerUpgrade: 7,
    attackCooldownMs: 280,
    attackRange: 310,
    baseCritChance: 0.22,
    baseEvadeChance: 0.16,
    dashCooldownMs: 1700,
    comboMults: [0.95, 1.1, 1.45],
    skills: [
      {
        id: 'headshot_snipe',
        slot: 1,
        name: 'Headshot Snipe',
        nameVi: 'Mũi Tên Xuyên Thấu',
        descVi: 'Tụ lực bắn tên vàng xuyên toàn màn hình với tỷ lệ chí mạng +45%.',
        evoLv3Vi: 'Lv3: Kèm sóng gió xuyên giáp 40%',
        evoLv5Vi: 'Lv5: Bắn 2 tia tên xuyên song song',
        icon: 'skill_archer_1',
        cooldownMs: 4800,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.6,
        radius: 420,
        maxLevel: 5,
      },
      {
        id: 'frost_arrow_rain',
        slot: 2,
        name: 'Frost Arrow Rain',
        nameVi: 'Mưa Tên Băng Giá',
        descVi: 'Bắn lên trời dội mưa tên băng diện rộng làm chậm 50% mọi kẻ địch.',
        evoLv3Vi: 'Lv3: Đóng băng (choáng) 1s lúc rơi đợt đầu',
        evoLv5Vi: 'Lv5: Kéo dài bão tuyết thêm 2 đợt mưa tên',
        icon: 'skill_archer_2',
        cooldownMs: 7800,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.0,
        radius: 118,
        maxLevel: 5,
      },
      {
        id: 'gale_backflip',
        slot: 3,
        name: 'Gale Backflip',
        nameVi: 'Lốc Xoáy Lùi Bước',
        descVi: 'Nhào lộn nhảy lùi né đòn, bắn quạt 5 mũi tên và để lại lốc xoáy đẩy quái.',
        evoLv3Vi: 'Lv3: Tăng quạt lên 7 mũi tên',
        evoLv5Vi: 'Lv5: Lốc xoáy hút nhẹ và gây sát thương thêm',
        icon: 'skill_archer_3',
        cooldownMs: 8000,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 2.4,
        radius: 135,
        maxLevel: 5,
      },
      {
        id: 'storm_snare',
        slot: 4,
        name: 'Storm Snare',
        nameVi: 'Bẫy Dây Leo Sét',
        descVi: 'Gài cọc dây leo cổ thụ trói chân & giật sét 4 nhịp lên bầy quái.',
        evoLv3Vi: 'Lv3: Tăng lên 5 nhịp giật sét',
        evoLv5Vi: 'Lv5: Nổ lan sấm sét lớn khi hết bẫy',
        icon: 'skill_archer_4',
        cooldownMs: 10000,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 2.8,
        radius: 105,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'tempest_phoenix',
      name: 'Tempest Phoenix Volley',
      nameVi: 'Phượng Hoàng Tiễn',
      descVi: 'Nhảy lên không trung phóng Phượng Hoàng Phong-Hỏa khổng lồ quét sạch đường thẳng.',
      icon: 'ult_archer',
      damageMult: 5.5,
      radius: 360,
    },
    p1: {
      id: 'super_vision',
      name: 'Super Vision',
      nameVi: 'Ưng Nhãn',
      descVi: 'Tăng tầm bắn (+25px/cấp) và thêm xuyên mục tiêu cho tên thường.',
      unlockCostGold: 60,
      upgradeBaseGold: 70,
      maxLevel: 5,
    },
    p2: {
      id: 'frost_tip',
      name: 'Frost Tip',
      nameVi: 'Mũi Tên Băng Giá',
      descVi: 'Mọi mũi tên làm chậm kẻ địch (25% → 55%) trong 2 giây.',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },

  rogue: {
    id: 'rogue',
    codeName: 'Ramza',
    titleVi: 'Sát Thủ Song Kiếm',
    elementVi: 'Bóng Đêm / Lôi',
    roleVi: 'Tốc độ · Chí mạng & Ám sát Boss',
    weaponType: 'daggers',
    weaponIcon: 'weapon_daggers',
    accentColor: '#eab308',
    secondaryColor: '#c084fc',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 215,
    baseAtk: 25,
    baseDef: 9,
    baseSpd: 176,
    hpPerUpgrade: 36,
    atkPerUpgrade: 7,
    defPerUpgrade: 3,
    spdPerUpgrade: 8,
    attackCooldownMs: 210,
    attackRange: 48,
    baseCritChance: 0.28,
    baseEvadeChance: 0.24,
    dashCooldownMs: 1450,
    comboMults: [0.95, 1.1, 1.5],
    skills: [
      {
        id: 'swordplay_flurry',
        slot: 1,
        name: 'Swordplay Flurry',
        nameVi: 'Liên Hoàn Song Đoản',
        descVi: 'Chém 6 nhát tốc độ ánh sáng trước mặt với tỷ lệ chí mạng +35%.',
        evoLv3Vi: 'Lv3: Tăng lên 8 nhát liên hoàn',
        evoLv5Vi: 'Lv5: Kết thúc kèm tia sét tím lan diện rộng',
        icon: 'skill_rogue_1',
        cooldownMs: 4400,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.5,
        radius: 76,
        maxLevel: 5,
      },
      {
        id: 'shadow_raid',
        slot: 2,
        name: 'Shadow Raid',
        nameVi: 'Bóng Ma Ám Sát',
        descVi: 'Vô hình hóa thành 4 bóng ma lướt zíc-zắc chém chí mạng xuyên bầy quái.',
        evoLv3Vi: 'Lv3: Tăng lên 5 lần nhảy bóng ma',
        evoLv5Vi: 'Lv5: Kích nổ dấu ấn bóng đêm lên mọi mục tiêu',
        icon: 'skill_rogue_2',
        cooldownMs: 7500,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.4,
        radius: 170,
        maxLevel: 5,
      },
      {
        id: 'venom_shuriken',
        slot: 3,
        name: 'Venom Shuriken Fan',
        nameVi: 'Phi Tiêu Độc Tốc',
        descVi: 'Xoay người ném quạt 5 phi tiêu nảy giữa kẻ địch và gây Độc 4 giây.',
        evoLv3Vi: 'Lv3: Ném 7 phi tiêu xuyên nhanh hơn',
        evoLv5Vi: 'Lv5: Mục tiêu dính độc phát nổ khi hạ gục',
        icon: 'skill_rogue_3',
        cooldownMs: 7500,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 2.5,
        radius: 190,
        maxLevel: 5,
      },
      {
        id: 'mirage_decoy',
        slot: 4,
        name: 'Mirage Decoy',
        nameVi: 'Ảnh Phân Thân',
        descVi: 'Nhảy lùi để lại phân thân khói khiêu khích 1.5s rồi phát nổ; đòn kế 100% Crit.',
        evoLv3Vi: 'Lv3: Vụ nổ phân thân gây choáng 1.2s',
        evoLv5Vi: 'Lv5: Tạo 2 phân thân nổ liên hoàn',
        icon: 'skill_rogue_4',
        cooldownMs: 9500,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 2.85,
        radius: 95,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'eclipse_omnislash',
      name: 'Eclipse Omnislash',
      nameVi: 'Dạ Ảnh Trảm Không',
      descVi: 'Đan 8 đường kiếm tím cắt toàn bộ kẻ địch trong bán kính lớn cùng lúc.',
      icon: 'ult_rogue',
      damageMult: 5.8,
      radius: 210,
    },
    p1: {
      id: 'pickpocket',
      name: 'Pickpocket',
      nameVi: 'Móc Túi Thần Sầu',
      descVi: 'Mỗi đòn đánh có tỷ lệ rớt thẳng Vàng (+8%/cấp).',
      unlockCostGold: 55,
      upgradeBaseGold: 65,
      maxLevel: 5,
    },
    p2: {
      id: 'swordplay_mastery',
      name: 'Twin Swordplay',
      nameVi: 'Song Kích Bí Truyền',
      descVi: 'Tăng tỷ lệ đánh bồi thêm 1 nhát (+10%/cấp) và +4% EVADE/cấp.',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },

  barbarian: {
    id: 'barbarian',
    codeName: 'Conan',
    titleVi: 'Cuồng Chiến Rìu Đỏ',
    elementVi: 'Hỏa / Địa Chấn',
    roleVi: 'Bộc phá AoE · Hút máu & Hất tung',
    weaponType: 'axe',
    weaponIcon: 'weapon_axe',
    accentColor: '#ef4444',
    secondaryColor: '#fb923c',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 330,
    baseAtk: 35,
    baseDef: 12,
    baseSpd: 132,
    hpPerUpgrade: 56,
    atkPerUpgrade: 9,
    defPerUpgrade: 3,
    spdPerUpgrade: 5,
    attackCooldownMs: 360,
    attackRange: 66,
    baseCritChance: 0.16,
    baseEvadeChance: 0.1,
    dashCooldownMs: 2100,
    comboMults: [1.05, 1.2, 1.65],
    skills: [
      {
        id: 'tomahawk_whirl',
        slot: 1,
        name: 'Tomahawk Boomerang',
        nameVi: 'Ném Rìu Hủy Diệt',
        descVi: 'Phóng rìu lửa boomerang xoay xuyên qua hàng quái rồi bay ngược về tay.',
        evoLv3Vi: 'Lv3: Tăng bán kính rìu lửa +30%',
        evoLv5Vi: 'Lv5: Phóng song rìu lửa chéo nhau',
        icon: 'skill_barbarian_1',
        cooldownMs: 5200,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.55,
        radius: 260,
        maxLevel: 5,
      },
      {
        id: 'earthshaker',
        slot: 2,
        name: 'Earthshaker Slam',
        nameVi: 'Địa Chấn Cuồng Nộ',
        descVi: 'Nhảy nện rìu tạo 3 vòng nứt dung nham, gây sát thương cực đại và choáng 2s.',
        evoLv3Vi: 'Lv3: Thiêu đốt kẻ địch trong 3 giây',
        evoLv5Vi: 'Lv5: Hất tung toàn bộ quái lên không trung',
        icon: 'skill_barbarian_2',
        cooldownMs: 8500,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.6,
        radius: 120,
        maxLevel: 5,
      },
      {
        id: 'bloodlust_warcry',
        slot: 3,
        name: 'Bloodlust Warcry',
        nameVi: 'Hú Chiến Cuồng Huyết',
        descVi: 'Gầm lửa tăng +35% ATK, 12% hút máu và Siêu Giáp trong 6 giây.',
        evoLv3Vi: 'Lv3: Chia sẻ hào quang ATK cho cả đội',
        evoLv5Vi: 'Lv5: Nổ sóng lửa đẩy lùi + giảm CD đánh thường',
        icon: 'skill_barbarian_3',
        cooldownMs: 10000,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 1.8,
        radius: 125,
        maxLevel: 5,
      },
      {
        id: 'inferno_hook',
        slot: 4,
        name: 'Inferno Hook & Cleave',
        nameVi: 'Xích Hỏa Kéo Địch',
        descVi: 'Quăng xích lửa kéo quái từ xa vào sát mặt rồi bổ nhát rìu hủy diệt.',
        evoLv3Vi: 'Lv3: Mở rộng tầm kéo xích +40%',
        evoLv5Vi: 'Lv5: Tạo vụ nổ dung nham tại điểm bổ',
        icon: 'skill_barbarian_4',
        cooldownMs: 9500,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 3.1,
        radius: 175,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'volcanic_cataclysm',
      name: 'Volcanic Cataclysm',
      nameVi: 'Nham Thần Hàng Thế',
      descVi: 'Đập đất 2 nhịp kích hoạt 5 cột dung nham phun trào hất tung toàn chiến trường.',
      icon: 'ult_barbarian',
      damageMult: 5.9,
      radius: 240,
    },
    p1: {
      id: 'brutality',
      name: 'Brutality',
      nameVi: 'Cuồng Huyết',
      descVi: 'Máu càng thấp sát thương càng tăng (tối đa +60% ATK).',
      unlockCostGold: 60,
      upgradeBaseGold: 70,
      maxLevel: 5,
    },
    p2: {
      id: 'twist_blade',
      name: 'Twist Blade',
      nameVi: 'Phản Đòn Xoáy Rìu',
      descVi: 'Khi trúng đòn có cơ hội tự xoay rìu phản công xung quanh.',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },

  mage: {
    id: 'mage',
    codeName: 'Balthazar',
    titleVi: 'Pháp Sư Tử Tinh',
    elementVi: 'Hư Không / Thiên Thạch',
    roleVi: 'Phép diện rộng · Hố đen & Sét chuỗi',
    weaponType: 'staff',
    weaponIcon: 'weapon_staff',
    accentColor: '#a855f7',
    secondaryColor: '#f97316',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 190,
    baseAtk: 31,
    baseDef: 7,
    baseSpd: 142,
    hpPerUpgrade: 32,
    atkPerUpgrade: 9,
    defPerUpgrade: 2,
    spdPerUpgrade: 6,
    attackCooldownMs: 320,
    attackRange: 270,
    baseCritChance: 0.18,
    baseEvadeChance: 0.15,
    dashCooldownMs: 1850,
    comboMults: [1.0, 1.15, 1.5],
    skills: [
      {
        id: 'meteor_fireball',
        slot: 1,
        name: 'Meteor Strike',
        nameVi: 'Thiên Thạch Rực Lửa',
        descVi: 'Triệu hồi 3 thiên thạch giáng xuống bầy quái, gây nổ lan và thiêu đốt 3s.',
        evoLv3Vi: 'Lv3: Tăng lên 4 thiên thạch rực lửa',
        evoLv5Vi: 'Lv5: 5 thiên thạch để lại hồ dung nham cháy sàn',
        icon: 'skill_mage_1',
        cooldownMs: 5500,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.75,
        radius: 112,
        maxLevel: 5,
      },
      {
        id: 'thunder_tempest',
        slot: 2,
        name: 'Thunder Tempest',
        nameVi: 'Bão Sét Hỗn Nguyên',
        descVi: 'Giáng sét dây chuyền nhảy tối đa 8 mục tiêu, gây choáng 1.4s.',
        evoLv3Vi: 'Lv3: Sét nhảy tối đa 10 mục tiêu',
        evoLv5Vi: 'Lv5: Giáng thêm cột sét trừng phạt xuống mục tiêu chính',
        icon: 'skill_mage_2',
        cooldownMs: 8200,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.35,
        radius: 195,
        maxLevel: 5,
      },
      {
        id: 'gravity_singularity',
        slot: 3,
        name: 'Gravity Singularity',
        nameVi: 'Hố Đen Hút Quái',
        descVi: 'Mở hố đen tím hút tụ toàn bộ quái về tâm 2.5s để cả đội dồn combo.',
        evoLv3Vi: 'Lv3: Làm chậm 45% quái bị hút',
        evoLv5Vi: 'Lv5: Phát nổ vụ trụ gây sát thương lớn khi tan',
        icon: 'skill_mage_3',
        cooldownMs: 9500,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 2.4,
        radius: 135,
        maxLevel: 5,
      },
      {
        id: 'arcane_blink',
        slot: 4,
        name: 'Arcane Blink Nova',
        nameVi: 'Thuấn Di Phản Nổ',
        descVi: 'Dịch chuyển tức thời né nguy hiểm, để lại vòng nổ Băng-Bí Thuật làm chậm.',
        evoLv3Vi: 'Lv3: Tạo lớp giáp ma thuật 18% HP',
        evoLv5Vi: 'Lv5: Nổ vòng năng lượng ở cả điểm đi và điểm đến',
        icon: 'skill_mage_4',
        cooldownMs: 8500,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 2.8,
        radius: 100,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'astral_supernova',
      name: 'Astral Supernova',
      nameVi: 'Cửu Tinh Hủy Diệt',
      descVi: 'Bay lơ lửng mở Ngũ Mang Tinh khổng lồ, giáng cột tia Tinh Tú hủy diệt toàn sàn.',
      icon: 'ult_mage',
      damageMult: 5.7,
      radius: 260,
    },
    p1: {
      id: 'mana_surge',
      name: 'Mana Surge',
      nameVi: 'Dòng Chảy Ma Lực',
      descVi: 'Giảm thời gian hồi chiêu cho bản thân và đồng đội gần (+5%/cấp).',
      unlockCostGold: 60,
      upgradeBaseGold: 70,
      maxLevel: 5,
    },
    p2: {
      id: 'arcane_barrier',
      name: 'Arcane Barrier',
      nameVi: 'Kết Giới Bí Thuật',
      descVi: 'Tăng xác suất bật khiên EVADE ma thuật (+5%/cấp).',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },

  lancer: {
    id: 'lancer',
    codeName: 'Draco',
    titleVi: 'Thương Kỵ Rồng',
    elementVi: 'Băng Long / Xuyên Giáp',
    roleVi: 'Xuyên tuyến · Phá giáp & Phản kích',
    weaponType: 'lance',
    weaponIcon: 'weapon_lance',
    accentColor: '#06b6d4',
    secondaryColor: '#93c5fd',
    frameCount: MK_HERO_MASTER_FRAMES,
    baseHp: 260,
    baseAtk: 30,
    baseDef: 13,
    baseSpd: 152,
    hpPerUpgrade: 44,
    atkPerUpgrade: 8,
    defPerUpgrade: 3,
    spdPerUpgrade: 7,
    attackCooldownMs: 290,
    attackRange: 82,
    baseCritChance: 0.18,
    baseEvadeChance: 0.15,
    dashCooldownMs: 1750,
    comboMults: [1.0, 1.15, 1.55],
    skills: [
      {
        id: 'dragon_piercer',
        slot: 1,
        name: 'Dragon Piercer',
        nameVi: 'Thương Long Xuyên Giáp',
        descVi: 'Lao mũi thương Đầu Rồng xuyên hàng quái, bỏ qua 50% giáp địch.',
        evoLv3Vi: 'Lv3: Lao xa hơn +35% tầm xuyên',
        evoLv5Vi: 'Lv5: Để lại vệt băng long làm chậm & nổ trễ',
        icon: 'skill_lancer_1',
        cooldownMs: 4800,
        unlockCostGold: 0,
        upgradeBaseGold: 70,
        damageMult: 2.5,
        radius: 155,
        maxLevel: 5,
      },
      {
        id: 'trilance_nova',
        slot: 2,
        name: 'Trilance Nova',
        nameVi: 'Tam Thương Bộc Phá',
        descVi: 'Nhảy ném 3 mũi thương linh hồn cắm đất tạo vụ nổ rồng chấn động.',
        evoLv3Vi: 'Lv3: Phóng 4 mũi thương rồng',
        evoLv5Vi: 'Lv5: Phóng 5 mũi thương nổ băng liên hoàn',
        icon: 'skill_lancer_2',
        cooldownMs: 8000,
        unlockCostGold: 90,
        upgradeBaseGold: 90,
        damageMult: 3.3,
        radius: 130,
        maxLevel: 5,
      },
      {
        id: 'hundred_thrust',
        slot: 3,
        name: 'Hundred-Thrust Barrage',
        nameVi: 'Long Hồn Liên Kích',
        descVi: 'Đâm 7 mũi tốc độ siêu thanh phá 30% giáp kẻ địch và Boss trong 5 giây.',
        evoLv3Vi: 'Lv3: Tăng lên 9 mũi đâm liên hoàn',
        evoLv5Vi: 'Lv5: Kết liễu bằng sóng rồng xanh đẩy lùi',
        icon: 'skill_lancer_3',
        cooldownMs: 8000,
        unlockCostGold: 140,
        upgradeBaseGold: 105,
        damageMult: 2.75,
        radius: 108,
        maxLevel: 5,
      },
      {
        id: 'dragon_scale_counter',
        slot: 4,
        name: 'Dragon Scale Counter',
        nameVi: 'Long Lân Phản Chấn',
        descVi: 'Thủ thế 0.8s; nếu bị đánh lập tức bất tử và bật Long Quyền hất tung.',
        evoLv3Vi: 'Lv3: Tăng lớp giáp ảo +20% HP dù không bị đánh',
        evoLv5Vi: 'Lv5: Giảm 40% hồi chiêu nếu phản kích thành công',
        icon: 'skill_lancer_4',
        cooldownMs: 9500,
        unlockCostGold: 200,
        upgradeBaseGold: 120,
        damageMult: 3.2,
        radius: 115,
        maxLevel: 5,
      },
    ],
    ultimate: {
      id: 'azure_dragon_descent',
      name: 'Azure Dragon Descent',
      nameVi: 'Thanh Long Xuất Hải',
      descVi: 'Triệu hồi Thanh Long Pixel uốn lượn quét ngang toàn màn hình đóng băng mọi kẻ địch.',
      icon: 'ult_lancer',
      damageMult: 5.6,
      radius: 340,
    },
    p1: {
      id: 'dragon_scale',
      name: 'Dragon Scale',
      nameVi: 'Vảy Rồng Bất Hoại',
      descVi: 'Tăng giáp DEF (+3/cấp) và phản 15% sát thương cận chiến.',
      unlockCostGold: 60,
      upgradeBaseGold: 70,
      maxLevel: 5,
    },
    p2: {
      id: 'pierce_mastery',
      name: 'Pierce Mastery',
      nameVi: 'Xuyên Giáp Tinh Thông',
      descVi: 'Tăng sát thương chí mạng và tầm đâm thương (+5px/cấp).',
      unlockCostGold: 75,
      upgradeBaseGold: 80,
      maxLevel: 5,
    },
  },
};

export const MK_MAX_STAT_LEVEL = 15;
export const MK_MAX_SKILL_LEVEL = 5;

export function createInitialUpgrades(playMode: MkPlayMode = 'endless'): MkUpgradeLevels {
  const bossRush = playMode === 'boss_rush';
  return {
    atk: bossRush ? 3 : 1,
    hp: bossRush ? 3 : 1,
    def: bossRush ? 2 : 1,
    spd: bossRush ? 2 : 1,
    s1: 1,
    s2: bossRush ? 1 : 0,
    s3: bossRush ? 1 : 0,
    s4: bossRush ? 1 : 0,
    p1: bossRush ? 1 : 0,
    p2: 0,
  };
}

export function getMkSkillSpec(heroId: MkHeroId, slot: 1 | 2 | 3 | 4): MkSkillSpec {
  return MK_HEROES[heroId].skills[slot - 1];
}

export function getMkUpgradeCost(
  heroId: MkHeroId,
  target: MkUpgradeTarget,
  currentLevel: number,
): number {
  const spec = MK_HEROES[heroId];
  if (target === 'atk' || target === 'hp' || target === 'def' || target === 'spd') {
    return Math.round(35 + currentLevel * 22 + currentLevel * currentLevel * 4);
  }
  if (target === 's1' || target === 's2' || target === 's3' || target === 's4') {
    const idx = Number(target.slice(1)) - 1;
    const sk = spec.skills[idx];
    if (currentLevel <= 0) return sk.unlockCostGold;
    return Math.round(sk.upgradeBaseGold * Math.pow(1.42, currentLevel - 1));
  }
  const passive = spec[target];
  if (currentLevel <= 0) return passive.unlockCostGold;
  return Math.round(passive.upgradeBaseGold * Math.pow(1.42, currentLevel - 1));
}
