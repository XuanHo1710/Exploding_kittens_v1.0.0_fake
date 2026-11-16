/**
 * Hợp đồng giao thức mạng (RoomView, Frame, Command, Stats) và hàm mã hóa/giải mã wire
 * cho chế độ Miragine War cổ điển (1P vs AI / 1v1 PvP).
 */

import {
  THAP_FLAG_ATK_START,
  THAP_FLAG_ATTACKING,
  THAP_FLAG_LEFT,
  THAP_FLAG_MOVING,
} from './constants';
import type { ThapConfig } from './modes';
import type { ThapUnitKind } from './units';

/** Thông tin một phe trong trận Miragine War (idx 0 = Phe Đỏ bên trái, idx 1 = Phe Xanh bên phải). */
export interface ThapPlayerInfo {
  idx: number;
  /** playerId; AI là "bot:thap<n>". */
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
}

/** Thống kê chi tiết cuối trận của từng phe. */
export interface ThapSideStats {
  idx: number;
  kills: number;
  lost: number;
  spawned: number;
  killsValue: number;
  roundIncome: number;
  totalEarned: number;
  damageToCrystal: number;
  baseHp: number;
}

/** Kết quả tổng kết trận đấu Miragine War. */
export interface ThapResult {
  winnerTeam: number;
  winnerIdxs: number[];
  reason: string;
  scores: number[];
  durationMs: number;
  waves: number;
  stats: ThapSideStats[];
}

/** Trạng thái phòng Miragine War gửi kèm `RoomView` (cấu hình phòng chờ + thông số đấu trường khi đang chơi). */
export interface ThapRoomView {
  config: ThapConfig;
  mapW?: number;
  mapH?: number;
  /** Tọa độ x, y phẳng của Pha Lê Chính theo idx phe (`[x0, y0, x1, y1]`). */
  bases?: number[];
  /** Tọa độ x, y phẳng của Cổng Triệu Hồi theo idx phe (`[x0, y0, x1, y1]`). */
  doors?: number[];
  lane?: { yMin: number; yMax: number };
  players?: ThapPlayerInfo[];
  /** Chỉ số phe của client hiện tại (`undefined` nếu là khán giả). */
  myIdx?: number;
  startedAt?: number;
  endsAt?: number;
  result?: ThapResult;
}

/** Trạng thái riêng tư gửi riêng cho từng người chơi trong `ThapFrame.me`. */
export interface ThapPrivate {
  gold: number;
  roundIncome: number;
  incomeLimit: number;
  roundLeft: number;
  pop: number;
  popCap: number;
  auto: ThapUnitKind;
  blocked?: 'pop';
  kills: number;
  lost: number;
  spawned: number;
}

/** Khung hình đồng bộ realtime 15 FPS (`thap:frame`) từ server gửi xuống client. */
export interface ThapFrame {
  tick: number;
  /** Thời gian đã trôi qua (ms). */
  elapsed: number;
  /** Mảng phẳng lính (`THAP_UNIT_FIELDS = 7` phần tử/lính): id, owner, kindIdx, x, y, hpPct, flags. */
  u: number[];
  /** % máu Pha Lê Chính theo từng phe (0..100). */
  bh: number[];
  /** Mảng phẳng đạn bay (`THAP_SHOT_FIELDS = 7` phần tử/đạn): x1, y1, x2, y2, type, targetId, travelMs. */
  s: number[];
  /** Mảng phẳng sự kiện chết (`THAP_DEATH_FIELDS = 3` phần tử/sự kiện): x, y, code. */
  d: number[];
  /** Điểm theo từng phe. */
  sc: number[];
  /** Trạng thái còn sống (1/0) theo từng phe. */
  al: number[];
  wave: number;
  roundLeft: number;
  roundTotalS: number;
  lastWaveUnits: [number, number];
  me?: ThapPrivate;
  full?: boolean;
}

/** Lệnh điều khiển từ client gửi lên server qua sự kiện `thap:cmd`. */
export type ThapCommand =
  | { t: 'auto'; kind: ThapUnitKind }
  | { t: 'select'; kind: ThapUnitKind }
  | { t: 'surrender' };

/** Mã hóa bit cờ trạng thái lính cho trường `flags` trong `ThapFrame.u`. */
export function encodeUnitFlags(opts: {
  atkStart?: boolean;
  attacking?: boolean;
  left?: boolean;
  moving?: boolean;
}): number {
  let flags = 0;
  if (opts.atkStart) flags |= THAP_FLAG_ATK_START;
  if (opts.attacking) flags |= THAP_FLAG_ATTACKING;
  if (opts.left) flags |= THAP_FLAG_LEFT;
  if (opts.moving) flags |= THAP_FLAG_MOVING;
  return flags;
}

/** Mã hóa mã chết của lính thành số nguyên âm khác 0 để truyền qua `ThapFrame.d`. */
export function encodeUnitDeath(kindIdx: number, owner: number, left: boolean): number {
  return -(1 + (((kindIdx * 16 + owner) << 1) | (left ? 1 : 0)));
}

/** Giải mã trường `code` trong `ThapFrame.d`: dương là Pha Lê (`owner + 1`), âm là lính chết. */
export function decodeDeathCode(
  code: number,
): { isBase: true; owner: number } | { isBase: false; kindIdx: number; owner: number; left: boolean } {
  if (code > 0) {
    return { isBase: true, owner: code - 1 };
  }
  const raw = -code - 1;
  const left = (raw & 1) === 1;
  const packed = raw >> 1;
  const owner = packed & 15;
  const kindIdx = packed >> 4;
  return { isBase: false, kindIdx, owner, left };
}
