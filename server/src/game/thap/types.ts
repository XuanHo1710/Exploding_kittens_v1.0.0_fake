/**
 * Mô hình dữ liệu mô phỏng phía server cho Miragine War cổ điển (1P vs AI / 1v1 PvP).
 */

import type { ThapBotLevel, ThapConfig, ThapUnitKind } from '../../../../shared/src';

/** Trạng thái đầy đủ của một đơn vị lính trên đấu trường ngang Miragine War. */
export interface Unit {
  id: number;
  owner: number;
  kind: ThapUnitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  cd: number;
  windupLeft: number;
  windupTargetId: number;
  windupTargetBase: number;
  radius: number;
  atkAt: number;
  atkStartPending: boolean;
  attacking: boolean;
  moving: boolean;
  left: boolean;
  spawnedOrder: number;
}

/** Bộ não AI đánh giá khắc chế theo từng đợt 30s và phản ứng phòng thủ khẩn cấp. */
export interface AiBrain {
  personality: ThapBotLevel;
  preferredCounter: ThapUnitKind;
  counterReason: string;
  lastEvalWave: number;
  emergencyTicks: number;
}

/** Trạng thái một phe trong trận (0 = Phe Đỏ bên trái, 1 = Phe Xanh bên phải). */
export interface SideState {
  idx: number;
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
  gold: number;
  roundIncome: number;
  totalEarned: number;
  auto: ThapUnitKind;
  baseHp: number;
  baseMaxHp: number;
  crystalCd: number;
  spawnPending: number;
  spawnUnitKind: ThapUnitKind;
  spawnTimer: number;
  lastWaveUnits: number;
  kills: number;
  lost: number;
  spawned: number;
  killsValue: number;
  damageToCrystal: number;
  blockedPop: boolean;
  ai?: AiBrain;
}

/** Trạng thái toàn bộ thế giới mô phỏng 30 FPS của một ván Miragine War. */
export interface SimWorldState {
  config: ThapConfig;
  mapW: number;
  mapH: number;
  simTick: number;
  netTick: number;
  wave: number;
  roundFramesLeft: number;
  roundTotalFrames: number;
  startedAt: number;
  sides: SideState[];
  units: Unit[];
  nextUnitId: number;
  pendingShots: number[];
  pendingDeaths: number[];
  winnerTeam?: number;
  winReason?: string;
  onEnd?: () => void;
}

/** Mục tiêu tấn công hoặc truy đuổi của một đơn vị lính kèm khoảng cách mép-tới-mép. */
export type HitTarget =
  | { kind: 'unit'; unit: Unit; dist: number }
  | { kind: 'base'; owner: number; dist: number };

/** Trả về chỉ số phe đối thủ trong đấu trường 2 phe (0 ↔ 1). */
export function enemyOf(idx: number): number {
  return idx === 0 ? 1 : 0;
}

/** Kiểm tra đơn vị lính còn sống trên chiến trường hay không. */
export function isUnitInPlay(u: Unit): boolean {
  return u.hp > 0;
}
