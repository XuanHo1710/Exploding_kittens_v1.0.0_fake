/**
 * 8 Enemy Archetypes (11–12 frames) + 4 Multi-Phase Bosses (15 frames)
 * strictly enforcing `10 <= frameCount <= 15`.
 */
import {
  MK_BIOMES,
  MK_BOSS_ANCHOR_X,
  MK_BOSS_ANCHOR_Y,
  MK_BOSS_CELL_PX,
  MK_ENEMY_ANCHOR_X,
  MK_ENEMY_ANCHOR_Y,
  MK_ENEMY_CELL_PX,
  MK_MAX_CHAR_FRAMES,
  MK_MIN_CHAR_FRAMES,
  type MkAnyEnemyId,
  type MkBiome,
  type MkBossId,
  type MkDifficulty,
  type MkEnemyId,
} from './types';

export interface MkEnemySpec {
  id: MkAnyEnemyId;
  nameVi: string;
  isBoss: boolean;
  isElite: boolean;
  frameCount: number;
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
  accentColor: string;
  radius: number;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
  expReward: number;
  goldReward: number;
  scoreReward: number;
  ranged?: boolean;
  healer?: boolean;
  frontShield?: boolean;
  bomber?: boolean;
  frostShot?: boolean;
  netherGhost?: boolean;
}

export const MK_ENEMIES: Record<MkAnyEnemyId, MkEnemySpec> = {
  skull_imp: {
    id: 'skull_imp',
    nameVi: 'Tiểu Yêu Mặt Nạ Tím',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#a855f7',
    radius: 14,
    baseHp: 65,
    baseAtk: 13,
    baseDef: 2,
    speed: 96,
    attackRange: 36,
    attackCooldownMs: 1050,
    expReward: 18,
    goldReward: 11,
    scoreReward: 50,
  },
  goblin_raider: {
    id: 'goblin_raider',
    nameVi: 'Goblin Đột Kích',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#4ade80',
    radius: 15,
    baseHp: 105,
    baseAtk: 17,
    baseDef: 4,
    speed: 86,
    attackRange: 44,
    attackCooldownMs: 1200,
    expReward: 26,
    goldReward: 15,
    scoreReward: 75,
  },
  shield_orc: {
    id: 'shield_orc',
    nameVi: 'Orc Khiên Sắt',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#94a3b8',
    radius: 17,
    baseHp: 165,
    baseAtk: 20,
    baseDef: 8,
    speed: 68,
    attackRange: 44,
    attackCooldownMs: 1400,
    expReward: 38,
    goldReward: 21,
    scoreReward: 120,
    frontShield: true,
  },
  bone_brute: {
    id: 'bone_brute',
    nameVi: 'Khổng Lồ Xương Đá',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#e2e8f0',
    radius: 20,
    baseHp: 240,
    baseAtk: 27,
    baseDef: 9,
    speed: 58,
    attackRange: 54,
    attackCooldownMs: 1600,
    expReward: 52,
    goldReward: 28,
    scoreReward: 180,
  },
  tribal_shaman: {
    id: 'tribal_shaman',
    nameVi: 'Pháp Sư Đầu Lâu Đỏ',
    isBoss: false,
    isElite: true,
    frameCount: 12,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#f43f5e',
    radius: 15,
    baseHp: 95,
    baseAtk: 21,
    baseDef: 3,
    speed: 66,
    attackRange: 210,
    attackCooldownMs: 1800,
    expReward: 36,
    goldReward: 20,
    scoreReward: 115,
    ranged: true,
    healer: true,
  },
  frost_archer: {
    id: 'frost_archer',
    nameVi: 'Cung Thủ Xương Băng',
    isBoss: false,
    isElite: true,
    frameCount: 12,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#38bdf8',
    radius: 15,
    baseHp: 90,
    baseAtk: 19,
    baseDef: 3,
    speed: 74,
    attackRange: 240,
    attackCooldownMs: 1700,
    expReward: 34,
    goldReward: 19,
    scoreReward: 110,
    ranged: true,
    frostShot: true,
  },
  bomber_imp: {
    id: 'bomber_imp',
    nameVi: 'Quỷ Ôm Bom Lửa',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#f97316',
    radius: 15,
    baseHp: 75,
    baseAtk: 34,
    baseDef: 2,
    speed: 108,
    attackRange: 38,
    attackCooldownMs: 900,
    expReward: 30,
    goldReward: 18,
    scoreReward: 100,
    bomber: true,
  },
  nether_ghost: {
    id: 'nether_ghost',
    nameVi: 'Hồn Ma Kho Báu',
    isBoss: false,
    isElite: false,
    frameCount: 11,
    cellW: MK_ENEMY_CELL_PX,
    cellH: MK_ENEMY_CELL_PX,
    anchorX: MK_ENEMY_ANCHOR_X,
    anchorY: MK_ENEMY_ANCHOR_Y,
    accentColor: '#fde047',
    radius: 16,
    baseHp: 85,
    baseAtk: 0,
    baseDef: 0,
    speed: 90,
    attackRange: 0,
    attackCooldownMs: 2000,
    expReward: 48,
    goldReward: 65,
    scoreReward: 260,
    netherGhost: true,
  },

  // --- 4 Multi-Phase Bosses (strictly 15 frames, 80x80) ---
  boss_elder_shaman: {
    id: 'boss_elder_shaman',
    nameVi: 'Đại Pháp Sư Đầu Lâu',
    isBoss: true,
    isElite: true,
    frameCount: 15,
    cellW: MK_BOSS_CELL_PX,
    cellH: MK_BOSS_CELL_PX,
    anchorX: MK_BOSS_ANCHOR_X,
    anchorY: MK_BOSS_ANCHOR_Y,
    accentColor: '#ef4444',
    radius: 28,
    baseHp: 1500,
    baseAtk: 32,
    baseDef: 10,
    speed: 62,
    attackRange: 230,
    attackCooldownMs: 1550,
    expReward: 280,
    goldReward: 180,
    scoreReward: 1400,
    ranged: true,
    healer: true,
  },
  boss_war_chieftain: {
    id: 'boss_war_chieftain',
    nameVi: 'Tù Trưởng Búa Chiến',
    isBoss: true,
    isElite: true,
    frameCount: 15,
    cellW: MK_BOSS_CELL_PX,
    cellH: MK_BOSS_CELL_PX,
    anchorX: MK_BOSS_ANCHOR_X,
    anchorY: MK_BOSS_ANCHOR_Y,
    accentColor: '#f59e0b',
    radius: 30,
    baseHp: 2200,
    baseAtk: 40,
    baseDef: 13,
    speed: 74,
    attackRange: 74,
    attackCooldownMs: 1400,
    expReward: 380,
    goldReward: 230,
    scoreReward: 1900,
  },
  boss_lava_golem: {
    id: 'boss_lava_golem',
    nameVi: 'Cự Thạch Dung Nham',
    isBoss: true,
    isElite: true,
    frameCount: 15,
    cellW: MK_BOSS_CELL_PX,
    cellH: MK_BOSS_CELL_PX,
    anchorX: MK_BOSS_ANCHOR_X,
    anchorY: MK_BOSS_ANCHOR_Y,
    accentColor: '#f97316',
    radius: 32,
    baseHp: 3000,
    baseAtk: 46,
    baseDef: 16,
    speed: 56,
    attackRange: 96,
    attackCooldownMs: 1700,
    expReward: 500,
    goldReward: 300,
    scoreReward: 2500,
    ranged: true,
  },
  boss_abyss_lord: {
    id: 'boss_abyss_lord',
    nameVi: 'Chúa Tể Hư Không',
    isBoss: true,
    isElite: true,
    frameCount: 15,
    cellW: MK_BOSS_CELL_PX,
    cellH: MK_BOSS_CELL_PX,
    anchorX: MK_BOSS_ANCHOR_X,
    anchorY: MK_BOSS_ANCHOR_Y,
    accentColor: '#c084fc',
    radius: 32,
    baseHp: 4000,
    baseAtk: 54,
    baseDef: 19,
    speed: 78,
    attackRange: 112,
    attackCooldownMs: 1350,
    expReward: 680,
    goldReward: 420,
    scoreReward: 3600,
    ranged: true,
  },
};

export function assertEnemyFrameBudget(): void {
  for (const spec of Object.values(MK_ENEMIES)) {
    if (spec.frameCount < MK_MIN_CHAR_FRAMES || spec.frameCount > MK_MAX_CHAR_FRAMES) {
      throw new Error(`Enemy ${spec.id} violates 10..15 frame budget: ${spec.frameCount}`);
    }
  }
}

export const MK_BIOME_LABELS: Record<MkBiome, string> = {
  grasslands: 'Đồng Cỏ Ngọc Bích',
  jungle: 'Rừng Cổ Mộ',
  volcano: 'Núi Lửa Nham Thạch',
  citadel: 'Thành Cổ Tinh Tú',
};

export function getMkBiomeForWave(wave: number, selected: MkBiome | 'auto'): MkBiome {
  if (selected !== 'auto') return selected;
  const idx = Math.floor((Math.max(1, wave) - 1) / 5) % MK_BIOMES.length;
  return MK_BIOMES[idx] ?? 'grasslands';
}

export function isMkBossWave(wave: number, playMode: 'endless' | 'boss_rush' = 'endless'): boolean {
  if (playMode === 'boss_rush') return wave >= 1 && wave <= 4;
  return wave >= 5 && wave % 5 === 0;
}

export function isMkMiniBossWave(wave: number, playMode: 'endless' | 'boss_rush' = 'endless'): boolean {
  if (playMode === 'boss_rush') return false;
  return wave >= 3 && wave % 5 === 3;
}

const BOSS_CYCLE: readonly MkBossId[] = [
  'boss_elder_shaman',
  'boss_war_chieftain',
  'boss_lava_golem',
  'boss_abyss_lord',
];

export function getMkBossForWave(wave: number, playMode: 'endless' | 'boss_rush' = 'endless'): MkBossId {
  if (playMode === 'boss_rush') {
    return BOSS_CYCLE[Math.max(0, Math.min(BOSS_CYCLE.length - 1, wave - 1))];
  }
  const idx = (Math.floor(Math.max(5, wave) / 5) - 1) % BOSS_CYCLE.length;
  return BOSS_CYCLE[idx] ?? 'boss_elder_shaman';
}

export function getMkDifficultyMult(diff: MkDifficulty): { hp: number; atk: number; reward: number } {
  if (diff === 'nightmare') return { hp: 1.55, atk: 1.45, reward: 1.4 };
  if (diff === 'hard') return { hp: 1.25, atk: 1.2, reward: 1.2 };
  return { hp: 1.0, atk: 1.0, reward: 1.0 };
}

export function getMkWaveScale(wave: number, partySize: number, diff: MkDifficulty) {
  const d = getMkDifficultyMult(diff);
  const w = Math.max(1, wave);
  const partyHpMult = 1 + Math.max(0, partySize - 1) * 0.28;
  return {
    hpMult: (1 + (w - 1) * 0.17) * d.hp * partyHpMult,
    atkMult: (1 + (w - 1) * 0.11) * d.atk,
    rewardMult: (1 + (w - 1) * 0.1) * d.reward,
  };
}

export function getMkRegularPoolForWave(wave: number): MkEnemyId[] {
  if (wave <= 1) return ['skull_imp', 'goblin_raider'];
  if (wave === 2) return ['skull_imp', 'goblin_raider', 'shield_orc'];
  if (wave <= 4) return ['skull_imp', 'goblin_raider', 'shield_orc', 'tribal_shaman', 'bomber_imp'];
  if (wave <= 7) {
    return ['skull_imp', 'goblin_raider', 'shield_orc', 'tribal_shaman', 'frost_archer', 'bomber_imp', 'bone_brute'];
  }
  return ['goblin_raider', 'shield_orc', 'tribal_shaman', 'frost_archer', 'bomber_imp', 'bone_brute'];
}
