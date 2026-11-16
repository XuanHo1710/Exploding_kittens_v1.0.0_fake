/**
 * Hằng số mô phỏng, bản đồ và giao thức wire của Miragine War 1:1.
 * Tham số khớp hoàn toàn với thông số gốc trong `database-miraginewar/mapping.json`.
 */

/** Nhịp mô phỏng logic (30 FPS) và nhịp gửi khung hình mạng (15 FPS). */
export const THAP_SIM_FPS = 30;
export const THAP_NET_FPS = 15;
export const THAP_NET_DIV = 2;
export const THAP_SIM_MS = 1000 / 30;
export const THAP_TICK_MS = 1000 / 15;

/** Chế độ cổ điển 2 phe (Phe Đỏ bên trái, Phe Xanh bên phải). */
export const THAP_MAX_PLAYERS = 2;

/** Chu kỳ vòng vàng & nhịp xuất quân từ Cổng Triệu Hồi (theo khung hình 30 FPS). */
export const THAP_FIRST_ROUND_S = 6;
export const THAP_FIRST_ROUND_FRAMES = 180;
export const THAP_ROUND_S = 30;
export const THAP_ROUND_FRAMES = 900;
export const THAP_SPAWN_INTERVAL_FRAMES = 4;

/** Kinh tế, dân số và các hệ số quy đổi từ dữ liệu gốc Miragine War. */
export const THAP_START_GOLD = 0;
export const THAP_START_ROUND_INCOME = 100;
export const THAP_INCOME_LIMIT = 8000;
export const THAP_MAX_POP = 60;
export const THAP_MOVE_SPEED_MULT = 1.3;
export const THAP_RANGE_MULT = 60;
export const THAP_WEAPON_SPEED_MULT = 20;
export const THAP_SPLASH_FACTOR = 0.5;

/** Giới hạn chống spam lệnh từ client (túi 40 lệnh, hồi 15 lệnh/giây). */
export const THAP_CMD_BURST = 40;
export const THAP_CMD_REFILL = 15;

/** Đấu trường ngang cổ điển: ghép 3x1 tấm `terrain2.jpg` (680x800). */
export const THAP_ARENA_W = 2040;
export const THAP_ARENA_H = 800;
export const THAP_LANE_Y_MIN = 310;
export const THAP_LANE_Y_MAX = 630;
export const THAP_LANE_CENTER_Y = 470;
export const THAP_DOORS: readonly [readonly [number, number], readonly [number, number]] = [
  [75, 470],
  [1965, 470],
];
export const THAP_CRYSTALS: readonly [readonly [number, number], readonly [number, number]] = [
  [210, 470],
  [1830, 470],
];
export const THAP_SPAWN_X: readonly [number, number] = [135, 1905];
export const THAP_CRYSTAL_HALF_W = 48;

/** Thông số Trụ Pha Lê Chính (`A_crystal` / `B_crystal` trong `mapping.json`). */
export const THAP_BASE = {
  name: 'Pha Lê Chính',
  hp: 3500,
  radius: 48,
  atk: 100,
  damage: [100, 100] as const,
  range: 600,
  weaponSpeedFrames: 30,
  cd: 1.0,
  armorTypeID: 1 as const,
  armor: 0,
} as const;
export const THAP_CRYSTAL_PROJECTILE: readonly ['fb', 'tb'] = ['fb', 'tb'];

/** Mã loại đạn trên wire `ThapFrame.s`. */
export const THAP_SHOT_FB = 0;
export const THAP_SHOT_TB = 1;
export const THAP_SHOT_STORM = 2;
export const THAP_SHOT_CRYSTAL_FLAG = 4;

/** Bit cờ trạng thái lính trên wire `ThapFrame.u`. */
export const THAP_FLAG_ATK_START = 1;
export const THAP_FLAG_ATTACKING = 2;
export const THAP_FLAG_LEFT = 4;
export const THAP_FLAG_MOVING = 8;

/** Số phần tử mỗi thực thể trong mảng phẳng wire & kích thước bảng chọn lính 2x8. */
export const THAP_UNIT_FIELDS = 7;
export const THAP_SHOT_FIELDS = 7;
export const THAP_DEATH_FIELDS = 3;
export const THAP_UNIT_GRID_ROWS = 2;
export const THAP_UNIT_GRID_COLS = 8;

/** Màu sắc và tên hiển thị cho 2 phe & cấp độ AI. */
export const THAP_COLORS = ['#e03131', '#1971c2'] as const;
export const THAP_SIDE_NAMES = ['Phe Đỏ (P1)', 'Phe Xanh (AI)'] as const;
export const THAP_BOT_NAMES = ['Miragine AI', 'Rồng Xanh AI'] as const;
export const THAP_BOT_LABEL = { easy: 'Dễ', normal: 'Thường', hard: 'Khó' } as const;
