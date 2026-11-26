/**
 * shared/src/bansung/night.ts
 *
 * "Đêm Zombie" — hằng số & hàm ánh sáng dùng chung cho Client (render đèn pin)
 * và Server (lọc quái nằm trong bóng tối khỏi snapshot → chống wallhack + giảm băng thông).
 *
 * Mô hình ánh sáng (spec 007, d03-night-lighting):
 * - Mỗi người chơi còn đứng có 1 quầng sáng môi trường bán kính `AMBIENT_RADIUS`.
 * - Đèn pin gắn theo hướng ngắm (chuột / joystick): hình nón dài `CONE_RANGE`,
 *   nửa góc mở `CONE_HALF_ANGLE`. Xoay chuột tới đâu → ánh sáng quét tới đó.
 * - Người chơi bị gục (downed) chỉ còn đèn yếu `DOWNED_RANGE_MULT`.
 * - Quái ngoài vùng sáng KHÔNG được server gửi xuống (trừ Boss), client không thể thấy.
 */

export interface BansungNightLightSpec {
  /** Bán kính quầng sáng quanh người chơi (px thế giới). */
  readonly AMBIENT_RADIUS: number;
  /** Tầm xa đèn pin (px thế giới). */
  readonly CONE_RANGE: number;
  /** Nửa góc mở của nón đèn pin (radian). */
  readonly CONE_HALF_ANGLE: number;
  /** Viền mềm của nón, quái trong vùng này vẫn được gửi để client fade-in mượt. */
  readonly SERVER_REVEAL_PAD: number;
  /** Hệ số tầm sáng khi bị gục. */
  readonly DOWNED_RANGE_MULT: number;
  /** Độ đặc của bóng tối phủ màn hình (0..1). */
  readonly DARKNESS_ALPHA: number;
  /** Màu bóng tối (xanh đêm). */
  readonly DARKNESS_RGB: readonly [number, number, number];
  /** Số tia raycast cho đèn của người chơi local / đồng đội (đổ bóng vào tường). */
  readonly RAYS_LOCAL: number;
  readonly RAYS_REMOTE: number;
  /** Tia lửa đầu nòng / vụ nổ chiếu sáng tạm thời — hệ số nhân bán kính glow. */
  readonly DYNAMIC_LIGHT_SCALE: number;
  /**
   * Viền mềm của nón chỉ dùng khi RENDER (radian cộng thêm vào nửa góc, ánh sáng mờ dần về 0).
   * Server vẫn dùng `CONE_HALF_ANGLE + pad/dist` nên phần viền mềm nằm trong vùng pad gửi trước.
   */
  readonly CONE_SOFT_EDGE: number;
  /** Phần xuyên vào mặt chướng ngại (px) để mặt trước bức tường được đèn rọi sáng. */
  readonly OBSTACLE_FACE_BLEED: number;
}

export const BANSUNG_NIGHT: BansungNightLightSpec = {
  AMBIENT_RADIUS: 112,
  CONE_RANGE: 560,
  CONE_HALF_ANGLE: 0.44,
  SERVER_REVEAL_PAD: 72,
  DOWNED_RANGE_MULT: 0.45,
  DARKNESS_ALPHA: 0.93,
  DARKNESS_RGB: [4, 8, 20],
  RAYS_LOCAL: 72,
  RAYS_REMOTE: 32,
  DYNAMIC_LIGHT_SCALE: 2.4,
  CONE_SOFT_EDGE: 0.12,
  OBSTACLE_FACE_BLEED: 14,
};

export interface BansungLightSource {
  readonly x: number;
  readonly y: number;
  /** Hướng ngắm (radian). */
  readonly aim: number;
  /** 1 = bình thường, <1 = đèn yếu (gục / hết pin). */
  readonly power: number;
}

function wrapAngle(a: number): number {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

/**
 * Điểm (x, y) có nằm trong vùng sáng của nguồn `src` hay không.
 * `pad` nới rộng cả quầng sáng lẫn nón (dùng cho server để client kịp fade-in).
 * Không xét tường chắn (server chỉ cần xấp xỉ, client tự đổ bóng bằng raycast).
 */
export function isPointLitBy(src: BansungLightSource, x: number, y: number, pad = 0): boolean {
  const dx = x - src.x;
  const dy = y - src.y;
  const d2 = dx * dx + dy * dy;
  const power = Math.max(0.1, Math.min(1, src.power));
  const ambient = BANSUNG_NIGHT.AMBIENT_RADIUS * (0.6 + 0.4 * power) + pad;
  if (d2 <= ambient * ambient) return true;
  const range = BANSUNG_NIGHT.CONE_RANGE * power + pad;
  if (d2 > range * range) return false;
  const dist = Math.sqrt(d2);
  const ang = Math.atan2(dy, dx);
  const diff = Math.abs(wrapAngle(ang - src.aim));
  // Góc nới theo pad: pad / dist (xấp xỉ cung tròn)
  const halfAngle = BANSUNG_NIGHT.CONE_HALF_ANGLE + (dist > 1 ? pad / dist : 0);
  return diff <= halfAngle;
}

/** Điểm có nằm trong ánh sáng của BẤT KỲ nguồn nào. */
export function isPointLitByAny(
  sources: readonly BansungLightSource[],
  x: number,
  y: number,
  pad = 0,
): boolean {
  for (let i = 0; i < sources.length; i++) {
    if (isPointLitBy(sources[i], x, y, pad)) return true;
  }
  return false;
}

/** Night mode bật mặc định; chủ phòng có thể tắt bằng `config.nightMode = false`. */
export function isBansungNightEnabled(cfg?: { nightMode?: boolean } | null): boolean {
  return cfg?.nightMode !== false;
}

// ============================================================================
// Thời tiết theo wave (spec 007 §3.4): mưa nặng dần + sấm chớp ở các wave cuối.
// Hàm THUẦN, xác định (deterministic) theo (seed, thời gian trận) để client và server
// cùng biết lúc nào sét đánh → server có thể tạm ngừng lọc bóng tối trong lúc chớp sáng.
// ============================================================================

export interface BansungWeatherSpec {
  /** Tổng số wave của chế độ 10 Đợt (dùng để chuẩn hoá tiến độ). */
  readonly WAVES_REF: number;
  /** Từ mức bão này trở lên bắt đầu có sét. */
  readonly LIGHTNING_START_LEVEL: number;
  /** Độ dài 1 "ô thời gian" xét sét (ms). Mỗi ô tối đa 1 cú sét. */
  readonly LIGHTNING_SLOT_MS: number;
  /** Xác suất sét trong 1 ô ở mức bắt đầu → ở mức tối đa. */
  readonly LIGHTNING_P_MIN: number;
  readonly LIGHTNING_P_MAX: number;
  /** Ngưỡng độ sáng chớp mà server coi là "sáng toàn map" (gửi mọi quái trong viewport). */
  readonly LIGHTNING_REVEAL_THRESHOLD: number;
  /** Mưa nhẹ nhất khi vừa bắt đầu mưa (0..1). */
  readonly RAIN_MIN: number;
  /** Mức bão bắt đầu mưa. */
  readonly RAIN_START_LEVEL: number;
}

export const BANSUNG_WEATHER: BansungWeatherSpec = {
  WAVES_REF: 10,
  LIGHTNING_START_LEVEL: 0.6,
  LIGHTNING_SLOT_MS: 2200,
  LIGHTNING_P_MIN: 0.16,
  LIGHTNING_P_MAX: 0.55,
  LIGHTNING_REVEAL_THRESHOLD: 0.35,
  RAIN_MIN: 0.12,
  RAIN_START_LEVEL: 0.08,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Mức bão 0..1 theo tiến độ trận: wave (chế độ 10 Đợt / vô tận) hoặc stage của Sinh Tồn
 * (mỗi chu kỳ có 4 stage; sau 2 chu kỳ đạt tối đa). Lấy giá trị lớn hơn.
 */
export function getBansungStormLevel(wave: number, survivalCycle?: number, survivalStageIdx?: number): number {
  const w = Number.isFinite(wave) ? wave : 1;
  const wp = clamp01((w - 1) / Math.max(1, BANSUNG_WEATHER.WAVES_REF - 1));
  let sp = 0;
  if (survivalStageIdx !== undefined && Number.isFinite(survivalStageIdx)) {
    const cyc = Math.max(0, Number.isFinite(survivalCycle ?? 0) ? (survivalCycle ?? 0) : 0);
    sp = clamp01((cyc * 4 + survivalStageIdx) / 7);
  }
  return wp > sp ? wp : sp;
}

/** Cường độ mưa 0..1 (0 = khô ráo). Tăng dần theo mức bão, cong nhẹ để cuối trận mưa xối xả. */
export function getBansungRainIntensity(level: number): number {
  const l = clamp01(level);
  if (l < BANSUNG_WEATHER.RAIN_START_LEVEL) return 0;
  const t = (l - BANSUNG_WEATHER.RAIN_START_LEVEL) / (1 - BANSUNG_WEATHER.RAIN_START_LEVEL);
  return BANSUNG_WEATHER.RAIN_MIN + (1 - BANSUNG_WEATHER.RAIN_MIN) * Math.pow(t, 1.15);
}

/** Hash 32-bit (xorshift-multiply) — xác định, không cấp phát. */
function hash32(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * 4 mẫu chớp (flicker): bộ ba [startMs, durMs, peak] phẳng. Tối đa 3 nhịp, tổng < 700 ms
 * (tránh nhấp nháy quá mức — Art Bible). Peak nhân với cường độ bão.
 */
const LIGHTNING_PRESETS: readonly (readonly number[])[] = [
  [0, 140, 1.0],
  [0, 70, 0.75, 110, 180, 1.0],
  [0, 60, 0.6, 95, 60, 0.85, 200, 220, 1.0],
  [0, 110, 0.9, 260, 160, 0.55],
];

export interface BansungLightningStrike {
  /** Thời điểm (ms trận) bắt đầu cú sét hiện tại / gần nhất trong ô, -1 nếu ô không có sét. */
  startMs: number;
  /** Chỉ số mẫu chớp 0..3. */
  preset: number;
  /** Seed dùng để sinh hình tia sét (client). */
  boltSeed: number;
  /** Vị trí x tương đối 0..1 trên màn hình nơi tia sét giáng xuống (client). */
  boltU: number;
}

/**
 * Ghi thông tin cú sét của ô thời gian chứa `ms` vào `out` (không cấp phát) và trả về `out`.
 * `level` < LIGHTNING_START_LEVEL → không có sét (startMs = -1).
 */
export function getBansungLightningStrike(
  seed: number,
  ms: number,
  level: number,
  out: BansungLightningStrike,
): BansungLightningStrike {
  out.startMs = -1;
  out.preset = 0;
  out.boltSeed = 0;
  out.boltU = 0.5;
  const l = clamp01(level);
  if (l < BANSUNG_WEATHER.LIGHTNING_START_LEVEL || !Number.isFinite(ms) || ms < 0) return out;
  const t = (l - BANSUNG_WEATHER.LIGHTNING_START_LEVEL) / (1 - BANSUNG_WEATHER.LIGHTNING_START_LEVEL);
  const p = BANSUNG_WEATHER.LIGHTNING_P_MIN + (BANSUNG_WEATHER.LIGHTNING_P_MAX - BANSUNG_WEATHER.LIGHTNING_P_MIN) * t;
  const slotMs = BANSUNG_WEATHER.LIGHTNING_SLOT_MS;
  const slot = Math.floor(ms / slotMs);
  const h = hash32(seed ^ 0x5bd1e995, slot);
  if ((h & 0xffff) / 0xffff > p) return out;
  const offset = ((h >>> 16) & 0x3ff) / 0x3ff; // 0..1
  out.startMs = slot * slotMs + Math.floor(offset * (slotMs - 800));
  out.preset = (h >>> 26) & 3;
  out.boltSeed = hash32(h, 0x27d4eb2d);
  out.boltU = 0.12 + ((out.boltSeed & 0xff) / 0xff) * 0.76;
  return out;
}

/** Độ sáng chớp 0..1 tại thời điểm `ms` (0 khi không có sét). Hàm thuần dùng cho cả client & server. */
export function getBansungLightningFlash(seed: number, ms: number, level: number, scratch?: BansungLightningStrike): number {
  const s = getBansungLightningStrike(seed, ms, level, scratch ?? { startMs: -1, preset: 0, boltSeed: 0, boltU: 0.5 });
  if (s.startMs < 0 || ms < s.startMs) return 0;
  const age = ms - s.startMs;
  const pr = LIGHTNING_PRESETS[s.preset] ?? LIGHTNING_PRESETS[0];
  let best = 0;
  for (let i = 0; i + 2 < pr.length; i += 3) {
    const st = pr[i];
    const dur = pr[i + 1];
    if (age < st || age > st + dur) continue;
    const k = (age - st) / dur;
    // tấn công rất nhanh (8%) rồi tắt dần mũ
    const env = k < 0.08 ? k / 0.08 : Math.exp(-(k - 0.08) * 3.2);
    const v = pr[i + 2] * env;
    if (v > best) best = v;
  }
  return clamp01(best * (0.75 + 0.25 * clamp01((level - BANSUNG_WEATHER.LIGHTNING_START_LEVEL) / 0.4)));
}
