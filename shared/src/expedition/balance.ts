/**
 * BẢNG CÂN BẰNG DUY NHẤT (single source of truth) cho Astral Expedition Pixel.
 *
 * Mọi tỉ lệ / con số có thể chỉnh nằm ở file này: gacha anh hùng, gacha trang bị, tỉ lệ rớt đồ sau trận,
 * điểm chỉ số mỗi cấp và giá trị từng điểm, đường cong EXP, mở khóa + nâng cấp kỹ năng, giới hạn chỉ số.
 * Client hiển thị đúng các số này (bảng tỉ lệ công khai) và server dùng đúng các số này để quay / thưởng,
 * nên đổi một giá trị ở đây là cả game đổi theo. Sau khi đổi: `npm run build` ở server + client.
 *
 * Quy ước:
 *  - Tỉ lệ (rate / chance / weight) là số thực 0..1 hoặc trọng số tương đối (tự chuẩn hóa).
 *  - Chỉ số % (critRate, critDmg, eva, acc) lưu dạng số thực: 0.05 = 5 %.
 */

export const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg', 'eva'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS_VI: Record<StatKey, string> = {
  hp: 'Sinh Lực (HP)',
  atk: 'Tấn Công (ATK)',
  def: 'Phòng Thủ (DEF)',
  spd: 'Tốc Độ (SPD)',
  critRate: 'Tỉ Lệ Chí Mạng',
  critDmg: 'Sát Thương Chí Mạng',
  eva: 'Né Tránh (EVA)',
};

export const ITEM_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_RARITY_LABELS_VI: Record<ItemRarity, string> = {
  common: 'Thường',
  rare: 'Hiếm',
  epic: 'Sử Thi',
  legendary: 'Huyền Thoại',
  mythic: 'Thần Thoại',
};

export const ITEM_RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#a8b0bd',
  rare: '#5fa8f0',
  epic: '#b57cf0',
  legendary: '#f0b44c',
  mythic: '#ff3b3b',
};

export const EQUIP_SLOTS = ['weapon', 'armor', 'charm'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const EQUIP_SLOT_LABELS_VI: Record<EquipSlot, string> = {
  weapon: 'Vũ Khí',
  armor: 'Giáp',
  charm: 'Phụ kiện',
};

export const EXP_BALANCE = {
  // ------------------------------------------------------------ cấp độ
  level: {
    max: 60,
    /** EXP cần để lên cấp kế tiếp = round(expBase * level ^ expExponent) */
    expBase: 110,
    expExponent: 1.18,
    /** Tinh Thể EXP: 1 tinh thể = expPerCrystal EXP khi bón trực tiếp cho anh hùng */
    expPerCrystal: 10,
    /** phần EXP trận đấu chia cho anh hùng dự bị (không ra trận) */
    benchExpShare: 0.3,
  },

  // ------------------------------------------------------------ điểm chỉ số
  statPoints: {
    /** số điểm nhận mỗi lần lên cấp (cấp 1 = 0 điểm) */
    perLevel: 3,
    /** điểm thưởng thêm ở các mốc cấp */
    milestoneBonus: { 10: 3, 20: 5, 30: 5, 40: 8, 50: 8, 60: 10 } as Record<number, number>,
    /** giá trị cộng thêm của 1 điểm cho từng chỉ số */
    valuePerPoint: {
      hp: 26,
      atk: 3.2,
      def: 2.6,
      spd: 1.0,
      critRate: 0.0045,
      critDmg: 0.014,
      eva: 0.0035,
    } as Record<StatKey, number>,
    /** chi phí Ấn Tinh Tú để tẩy điểm (đặt lại) */
    resetCostSeal: 120,
  },

  /** trần cứng sau khi cộng mọi nguồn (điểm, trang bị, thuốc, thức tỉnh) */
  statCaps: {
    critRate: 0.8,
    critDmg: 3.5,
    eva: 0.45,
    spd: 260,
  } as Partial<Record<StatKey, number>>,

  /** né tránh: xác suất né 1 nhịp đòn = eva - evaPierce của kẻ địch (kẻ địch thường có 0) */
  evasion: {
    enemyEvaPierceGatekeeper: 0.0,
    enemyEvaPierceBoss: 0.08,
  },

  /** thức tỉnh khi trùng anh hùng: +X % HP/ATK/DEF mỗi bậc */
  awakeningPerRank: 0.05,

  // ------------------------------------------------------------ kỹ năng
  skills: {
    maxLevel: 10,
    /** cấp anh hùng cần để mở khóa từng ô kỹ năng [đòn thường, kỹ năng 1, kỹ năng 2, tuyệt kỹ, nội tại] */
    unlockLevelBySlot: [1, 1, 8, 20, 12] as readonly number[],
    /** mỗi cấp kỹ năng tăng sức mạnh (sát thương / hồi máu / khiên) thêm X */
    powerPerLevel: 0.07,
    /** mỗi 3 cấp kỹ năng tăng thêm phá thế (break) X */
    breakPerTier: 0.1,
    /** cấp kỹ năng tối đa = min(maxLevel, 1 + floor(heroLevel / levelPerSkillRank)) */
    levelPerSkillRank: 6,
    /** chi phí nâng từ cấp k lên k+1 (index = k - 1) */
    upgradeCost: [
      { expCrystal: 60, starlight: 0, seal: 0 },
      { expCrystal: 120, starlight: 0, seal: 0 },
      { expCrystal: 200, starlight: 2, seal: 0 },
      { expCrystal: 320, starlight: 4, seal: 0 },
      { expCrystal: 480, starlight: 6, seal: 40 },
      { expCrystal: 680, starlight: 9, seal: 60 },
      { expCrystal: 920, starlight: 12, seal: 80 },
      { expCrystal: 1200, starlight: 16, seal: 120 },
      { expCrystal: 1600, starlight: 22, seal: 160 },
    ] as readonly { expCrystal: number; starlight: number; seal: number }[],
  },

  // ------------------------------------------------------------ gacha anh hùng
  heroGacha: {
    singleCostSeal: 160,
    tenCostSeal: 1600,
    rates: { SSR: 0.03, SR: 0.17, R: 0.8 },
    softPityStart: 65,
    softPityStepBonus: 0.05,
    hardPitySsr: 80,
    guaranteedSrEvery: 10,
    /** Tinh Huy nhận khi trùng: [đã thức tỉnh < 6, đã max A6] */
    dupStarlight: { SSS: [60, 200], SSR: [25, 100], SR: [5, 20], R: [1, 5] } as Record<'SSS' | 'SSR' | 'SR' | 'R', [number, number]>,
  },

  // ------------------------------------------------------------ gacha trang bị (Rương Thiên Văn)
  itemGacha: {
    nameVi: 'Rương Thiên Văn',
    singleCostSeal: 100,
    tenCostSeal: 900,
    rates: { mythic: 0.006, legendary: 0.034, epic: 0.12, rare: 0.32, common: 0.52 } as Record<ItemRarity, number>,
    /** bảo hiểm: tối đa N lượt chắc chắn có Huyền Thoại+ */
    hardPityLegendary: 50,
    /** mỗi gói 10 lượt chắc chắn có ít nhất 1 món Sử Thi+ */
    tenPullGuarantee: 'epic' as ItemRarity,
    /** tỉ lệ ra thuốc chỉ số (elixir) thay cho trang bị */
    elixirChance: 0.15,
  },

  // ------------------------------------------------------------ rớt đồ sau trận
  drops: {
    gatekeeper: {
      rolls: 1,
      chance: 0.55,
      rarity: { mythic: 0.002, legendary: 0.018, epic: 0.08, rare: 0.3, common: 0.6 } as Record<ItemRarity, number>,
      elixirChance: 0.12,
      sealRange: [15, 40] as [number, number],
    },
    boss: {
      rolls: 3,
      chance: 1.0,
      rarity: { mythic: 0.02, legendary: 0.1, epic: 0.3, rare: 0.4, common: 0.18 } as Record<ItemRarity, number>,
      elixirChance: 0.25,
      sealRange: [80, 160] as [number, number],
    },
    /** đánh lại chốt đã qua: nhân tỉ lệ rớt */
    repeatChanceMult: 0.6,
    /** đàn quái nhỏ dạo chơi: dùng bảng Gác Cổng nhân hệ số này */
    wildChanceMult: 0.35,
    /** mỗi vùng sau tăng cấp đồ (ilvl) thêm */
    itemLevelPerRealm: 8,
    /**
     * Vũ khí biến thể (không phải vũ khí riêng của anh hùng) rớt sau trận:
     *  - quái thường / Gác Cổng: 5%;  - Đại Trùm: chắc chắn 1 cây, 30% là hàng hiếm (Sử Thi trở lên).
     */
    weaponChance: { wild: 0.05, gatekeeper: 0.05, boss: 1 } as Record<'wild' | 'gatekeeper' | 'boss', number>,
    /** giáp biến thể: quái thường / Gác Cổng 10%, Trùm chắc chắn (cùng bảng độ hiếm với vũ khí) */
    armorChance: { wild: 0.1, gatekeeper: 0.1, boss: 1 } as Record<'wild' | 'gatekeeper' | 'boss', number>,
    weaponRarity: { common: 0.42, rare: 0.48, epic: 0.08, legendary: 0.018, mythic: 0.002 } as Record<ItemRarity, number>,
    bossWeaponRarity: { common: 0.25, rare: 0.45, epic: 0.22, legendary: 0.07, mythic: 0.01 } as Record<ItemRarity, number>,
  },

  // ------------------------------------------------------------ trang bị
  equipment: {
    /** chỉ số chính theo ô: (chỉ số, giá trị cơ bản ở ilvl 1, tăng mỗi ilvl) */
    mainStat: {
      weapon: [{ stat: 'atk', base: 12, perIlvl: 1.6 }, { stat: 'critDmg', base: 0.08, perIlvl: 0.004 }],
      armor: [{ stat: 'hp', base: 90, perIlvl: 12 }, { stat: 'def', base: 9, perIlvl: 1.2 }],
      charm: [{ stat: 'critRate', base: 0.03, perIlvl: 0.0012 }, { stat: 'spd', base: 4, perIlvl: 0.25 }, { stat: 'eva', base: 0.025, perIlvl: 0.001 }],
    } as Record<EquipSlot, readonly { stat: StatKey; base: number; perIlvl: number }[]>,
    /** nhân chỉ số chính theo độ hiếm */
    rarityMult: { common: 1.0, rare: 1.25, epic: 1.55, legendary: 1.95, mythic: 2.5 } as Record<ItemRarity, number>,
    /** số dòng phụ theo độ hiếm */
    subStatCount: { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 } as Record<ItemRarity, number>,
    /** biên độ dòng phụ: giá trị = (base + perIlvl * ilvl) * random(0.6 .. 1.0) */
    subStat: {
      hp: { base: 40, perIlvl: 5 },
      atk: { base: 5, perIlvl: 0.6 },
      def: { base: 4, perIlvl: 0.5 },
      spd: { base: 2, perIlvl: 0.12 },
      critRate: { base: 0.015, perIlvl: 0.0006 },
      critDmg: { base: 0.04, perIlvl: 0.0018 },
      eva: { base: 0.012, perIlvl: 0.0005 },
    } as Record<StatKey, { base: number; perIlvl: number }>,
    /** phân rã đồ: nhận Tinh Thể EXP theo độ hiếm */
    salvageExpCrystal: { common: 20, rare: 50, epic: 120, legendary: 300, mythic: 800 } as Record<ItemRarity, number>,
    inventoryLimit: 300,
  },

  // ------------------------------------------------------------ thuốc chỉ số (dùng vĩnh viễn cho 1 anh hùng)
  elixirs: {
    /** chỉ số được tăng và lượng tăng theo độ hiếm */
    value: {
      hp: { common: 30, rare: 60, epic: 110, legendary: 200, mythic: 360 },
      atk: { common: 3, rare: 6, epic: 11, legendary: 20, mythic: 36 },
      def: { common: 3, rare: 5, epic: 9, legendary: 16, mythic: 28 },
      spd: { common: 1, rare: 2, epic: 3, legendary: 5, mythic: 8 },
      critRate: { common: 0.004, rare: 0.008, epic: 0.014, legendary: 0.024, mythic: 0.04 },
      critDmg: { common: 0.01, rare: 0.02, epic: 0.035, legendary: 0.06, mythic: 0.1 },
      eva: { common: 0.003, rare: 0.006, epic: 0.01, legendary: 0.018, mythic: 0.03 },
    } as Record<StatKey, Record<ItemRarity, number>>,
    /** tối đa số bình dùng cho mỗi anh hùng */
    maxUsesPerHero: 40,
  },

  // ------------------------------------------------------------ kinh tế khác
  economy: {
    starterSeal: 1600,
    starterExpCrystal: 400,
    starterItemTickets: 0,
    /** Tinh Huy -> Ấn Tinh Tú */
    exchangeStarlight: 15,
    exchangeSealGain: 160,
    /** EXP trận = expReward (của chốt / trùm), đánh lại nhận tỉ lệ */
    repeatExpShare: 0.4,
    repeatSealBoss: 40,
  },

  // ------------------------------------------------------------ hiệu ứng trạng thái (mỗi tầng)
  status: {
    atkUp: 0.15,
    defUp: 0.2,
    critUp: 0.12,
    haste: 0.25,
    regenPct: 0.05,
    atkDown: 0.12,
    defDown: 0.15,
    vuln: 0.2,
    slow: 0.15,
    /** sát thương theo lượt = power (ATK người gây) × hệ số × số tầng */
    burnPerStack: 0.22,
    bleedPerStack: 0.16,
    /** mỗi đòn trúng mục tiêu đang Xuất Huyết gây thêm power × hệ số × tầng */
    bleedOnHitPerStack: 0.04,
    frostbiteSlow: 0.08,
    /** đủ số tầng Tê Cóng -> Đóng Băng 1 lượt rồi xóa tầng */
    freezeAtStacks: 3,
    markBonus: 0.35,
    /** đòn sát thương theo lượt lên Đại Trùm bị giảm */
    bossDotMult: 0.6,
  },

  // ------------------------------------------------------------ tương khắc nguyên tố
  affinity: {
    weakDamage: 1.5,
    weakBreak: 1.5,
    resistDamage: 0.7,
    resistBreak: 0.5,
    /** quái đánh anh hùng: nguyên tố quái khắc anh hùng / anh hùng khắc quái */
    heroWeakTaken: 1.25,
    heroResistTaken: 0.8,
  },

  // ------------------------------------------------------------ Cộng Hưởng (stack riêng của anh hùng)
  charge: {
    defaultMax: 5,
    /** mỗi tầng xả ra tăng sát thương / hồi máu / giáp của kỹ năng bộc phát */
    perStackDamage: 0.1,
    perStackSupport: 0.08,
  },

  // ------------------------------------------------------------ Bùa Hộ Mệnh (nhặt được khi hạ quái)
  charms: {
    /** số ô bùa mở theo cấp anh hùng */
    slotUnlockLevels: [1, 6, 14, 24, 40] as readonly number[],
    maxRank: 5,
    /** mỗi bậc bùa tăng giá trị thêm */
    perRank: 0.2,
    /** bùa trùng khi đã max bậc -> đổi Tinh Thể EXP */
    maxRankDupCrystal: 60,
    /** tỉ lệ độ hiếm khi rớt bùa */
    rarityWeights: { common: 0.58, rare: 0.3, epic: 0.1, legendary: 0.02 } as Record<'common' | 'rare' | 'epic' | 'legendary', number>,
    /** mỗi trận thắng chắc chắn nhận ít nhất N bùa */
    guaranteedPerBattle: 1,
    /** lần đầu hạ Quái Gác Cổng / Đại Trùm: thêm N bùa chắc chắn (Trùm tối thiểu Hiếm) */
    firstClearBonus: 0,
    /**
     * Hên: cơ hội nhận thêm bùa thứ 2, 3, 4 … — xét lần lượt, trượt một lần là dừng.
     * Mỗi nấc cộng thêm `encounterBonus` theo loại trận và `perMinionBonus` cho mỗi quái nhỏ bị hạ.
     */
    bonusChain: [0.05] as readonly number[],
    encounterBonus: { wild: 0, gatekeeper: 0.02, boss: 0.05 } as Record<'wild' | 'gatekeeper' | 'boss', number>,
    perMinionBonus: 0,
  },

  // ------------------------------------------------------------ cây kỹ năng
  skillTree: {
    /** điểm kỹ năng (SP) = floor(cấp × pointsPerLevel) + mốc thưởng */
    pointsPerLevel: 0.5,
    milestoneBonus: { 10: 1, 20: 1, 30: 1, 40: 1, 50: 1 } as Record<number, number>,
    tierLevels: [2, 5, 10, 15, 22, 30] as readonly number[],
    tierCosts: [1, 2, 2, 3, 3, 4] as readonly number[],
    /** mở nhánh thứ hai của cùng tầng: cần thêm cấp và tốn gấp đôi */
    secondBranchExtraLevel: 15,
    secondBranchCostMult: 2,
    resetCostSeal: 200,
  },

  // ------------------------------------------------------------ hệ số chiến đấu chung
  combat: {
    /** giáp = shieldRatio × HP tối đa người dựng × shieldScale */
    shieldScale: 0.45,
    /** đầu lượt của người được che chắn, giáp tan bớt phần này */
    shieldDecay: 0.5,
    /** hồi máu kỹ năng nhân thêm */
    healScale: 1,
  },

  // ------------------------------------------------------------ độ khó kẻ địch (nhân trên chỉ số trong catalog)
  enemy: {
    /** Quái Gác Cổng — mô phỏng: chơi trung bình thắng ~95%, bấm bừa thắng ~60% (vùng I) */
    gatekeeperHp: 2.8,
    gatekeeperAtk: 5.2,
    /** quái nhỏ (đàn dạo chơi + lính hộ vệ) — dễ, để farm EXP & Bùa */
    minionHp: 2.3,
    minionAtk: 5.4,
    /** Đại Trùm — chơi trung bình (55% đỡ/né đúng) thắng ~80–100% ở cấp đề xuất, bấm bừa ~10–50% */
    bossHp: 2.8,
    bossAtk: 4.5,
    /** nhân phòng thủ mọi kẻ địch */
    def: 1,
  },

  // ------------------------------------------------------------ Trạm Nghỉ (lửa trại): nghỉ = hồi quái (trừ Đại Trùm) + nạp lại vật phẩm
  rest: {
    /** sau khi nghỉ, túi vật phẩm trận được nạp lên tối thiểu mức này (không trừ nếu đang nhiều hơn) */
    supplyBaseline: { tonic: 2, spark: 1, revive: 1 } as Record<'tonic' | 'spark' | 'revive', number>,
  },

  // ------------------------------------------------------------ quái nhỏ dạo chơi (bị hạ thì biến mất tới lần nghỉ kế tiếp)
  wild: {
    expPerEnemyBase: 26,
    expPerEnemyPerRealm: 22,
    sealRange: [4, 14] as [number, number],
    crystalPerEnemy: 6,
    /** hệ số chỉ số quái nhỏ so với Gác Cổng cùng vùng */
    statScale: 0.42,
  },
} as const;

/** Số điểm cây kỹ năng (SP) có ở cấp `level`. */
export function treePointsAtLevel(level: number): number {
  const t = EXP_BALANCE.skillTree;
  let total = Math.floor(Math.max(1, level) * t.pointsPerLevel);
  for (const [lv, bonus] of Object.entries(t.milestoneBonus)) {
    if (level >= Number(lv)) total += bonus;
  }
  return total;
}

/** Số ô Bùa Hộ Mệnh mở ở cấp `level`. */
export function charmSlotsAtLevel(level: number): number {
  return EXP_BALANCE.charms.slotUnlockLevels.filter((lv) => level >= lv).length;
}

/** EXP cần để lên từ `level` lên `level + 1`. */
export function expToNextLevel(level: number): number {
  const b = EXP_BALANCE.level;
  return Math.round(b.expBase * Math.pow(Math.max(1, level), b.expExponent));
}

/** Tổng điểm chỉ số anh hùng có ở cấp `level`. */
export function statPointsAtLevel(level: number): number {
  const sp = EXP_BALANCE.statPoints;
  let total = Math.max(0, level - 1) * sp.perLevel;
  for (const [lv, bonus] of Object.entries(sp.milestoneBonus)) {
    if (level >= Number(lv)) total += bonus;
  }
  return total;
}

/** Cấp kỹ năng tối đa được phép ở cấp anh hùng hiện tại. */
export function skillLevelCap(heroLevel: number): number {
  const s = EXP_BALANCE.skills;
  return Math.min(s.maxLevel, 1 + Math.floor(heroLevel / s.levelPerSkillRank));
}

/** Hệ số sức mạnh kỹ năng theo cấp kỹ năng. */
export function skillPowerMult(skillLevel: number): number {
  return 1 + Math.max(0, skillLevel - 1) * EXP_BALANCE.skills.powerPerLevel;
}

export function skillBreakMult(skillLevel: number): number {
  return 1 + Math.floor(Math.max(0, skillLevel - 1) / 3) * EXP_BALANCE.skills.breakPerTier;
}

/** Chuẩn hóa một bảng trọng số {key: weight} rồi chọn theo số ngẫu nhiên r ∈ [0, 1). */
export function pickWeighted<K extends string>(weights: Record<K, number>, r: number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0) || 1;
  let acc = 0;
  for (const [k, w] of entries) {
    acc += Math.max(0, w) / total;
    if (r < acc) return k;
  }
  return entries[entries.length - 1][0];
}
