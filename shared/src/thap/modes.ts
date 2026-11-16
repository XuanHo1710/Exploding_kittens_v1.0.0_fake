/**
 * Chế độ chơi, cấu hình phòng và bố cục đấu trường ngang Miragine War (1v1 / Solo AI).
 */

import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTALS,
  THAP_DOORS,
  THAP_LANE_Y_MAX,
  THAP_LANE_Y_MIN,
} from './constants';

/** Chế độ chơi cổ điển: đấu với máy (solo) hoặc 2 người đối kháng (pvp). */
export type ThapMode = 'solo' | 'pvp';

/** Độ khó của AI Phe Xanh trong chế độ solo. */
export type ThapBotLevel = 'easy' | 'normal' | 'hard';

/** Nhãn hiển thị tiếng Việt cho từng chế độ chơi. */
export const THAP_MODE_LABEL: Record<ThapMode, string> = {
  solo: 'Solo Cổ Điển (1P vs AI)',
  pvp: 'Đấu Đôi (1v1 PvP)',
};

/** Cấu hình trận đấu Miragine War trong phòng chờ. */
export interface ThapConfig {
  bots: number;
  botLevel: ThapBotLevel;
  mode: ThapMode;
  minutes: number;
}

/** Cấu hình mặc định khi tạo phòng Miragine War. */
export const DEFAULT_THAP_CONFIG: ThapConfig = {
  bots: 1,
  botLevel: 'normal',
  mode: 'solo',
  minutes: 0,
};

/** Các mốc thời gian trận đấu hợp lệ (0 = đánh tới khi vỡ Pha Lê). */
export const THAP_MINUTE_OPTIONS = [0, 10, 15, 20, 30] as const;

/** Chuẩn hóa cấu hình phòng dựa trên dữ liệu người dùng gửi và số người chơi thực tế. */
export function normalizeThapConfig(raw: unknown, humans: number): ThapConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const botLevel: ThapBotLevel =
    r.botLevel === 'easy' || r.botLevel === 'normal' || r.botLevel === 'hard'
      ? r.botLevel
      : DEFAULT_THAP_CONFIG.botLevel;
  const parsedMin =
    typeof r.minutes === 'number' || (typeof r.minutes === 'string' && r.minutes.trim() !== '')
      ? Number(r.minutes)
      : NaN;
  const minutes = (THAP_MINUTE_OPTIONS as readonly number[]).includes(parsedMin)
    ? parsedMin
    : DEFAULT_THAP_CONFIG.minutes;

  if (humans >= 2) {
    return { bots: 0, botLevel, mode: 'pvp', minutes };
  }
  return { bots: 1, botLevel, mode: 'solo', minutes };
}

/** Trả về bố cục đấu trường ngang 2 phe cổ điển (Pha Lê, Cổng Triệu Hồi và giới hạn làn đường). */
export function thapLayout(): {
  W: number;
  H: number;
  bases: [number, number][];
  doors: [number, number][];
  laneYMin: number;
  laneYMax: number;
} {
  return {
    W: THAP_ARENA_W,
    H: THAP_ARENA_H,
    bases: THAP_CRYSTALS.map(([x, y]) => [x, y] as [number, number]),
    doors: THAP_DOORS.map(([x, y]) => [x, y] as [number, number]),
    laneYMin: THAP_LANE_Y_MIN,
    laneYMax: THAP_LANE_Y_MAX,
  };
}
