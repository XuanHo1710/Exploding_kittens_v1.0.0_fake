/**
 * client/src/bansung/gore.ts — Hệ thống máu / xác "Đêm Zombie" (spec 007, WS2).
 *
 * Pool cố định, ZERO cấp phát mỗi frame:
 *  - Giọt máu / mảnh thịt / sương máu bay theo vật lý 2.5D (x, y mặt đất + z độ cao, trọng lực).
 *  - Tia máu động mạch (jet) phun theo nhịp tim trong ~0.5 s sau khi zombie chết.
 *  - Vệt máu trên đất (decal) — stamp pixel bake sẵn theo nguyên tố, vũng máu loang dần,
 *    mờ dần sau ~22 s, ring-buffer ghi đè cái cũ nhất khi đầy.
 *  - Máu "ichor" phát sáng cho zombie nguyên tố (toxic / void / volt / frost) — lớp glow riêng.
 *
 * Chỉ là hiệu ứng hình ảnh phía client: không ảnh hưởng gameplay / server.
 *
 * Wiring vào render.ts (do parent thực hiện):
 *  - FX_DEATH  → spawnZombieDeathGore(x, y, dirRad, size, kindIdx)
 *  - FX_IMPACT (FLESH/SLASH/SLICE) → spawnBloodHit(x, y, dirRad, 1, -1)
 *  - mỗi frame: stepGore(effDtMs)
 *  - PASS 1 (sau decal sàn): drawGoreGround(ctx, vx0, vy0, vx1, vy1)
 *  - PASS 4 (sau particles World): drawGoreAir(ctx, vx0, vy0, vx1, vy1)
 *  - PASS 5 (additive 'lighter'): drawGoreGlow(ctx, vx0, vy0, vx1, vy1)
 */
import { BANSUNG_ENEMY_IDS } from '../../../shared/src';

// ============================================================================
// 1. Palette theo nguyên tố
// ============================================================================

export type GoreElement = 'blood' | 'rot' | 'fire' | 'frost' | 'volt' | 'void' | 'toxic';

interface GorePalette {
  readonly dark: string;
  readonly mid: string;
  readonly light: string;
  /** Máu phát sáng (ichor) → vẽ thêm lớp glow additive. */
  readonly glow: string | null;
}

const PALETTES: Readonly<Record<GoreElement, GorePalette>> = {
  blood: { dark: '#3f0a0d', mid: '#7f1d1d', light: '#b91c1c', glow: null },
  rot: { dark: '#2f0d0a', mid: '#6b1d14', light: '#9f3a1e', glow: null },
  fire: { dark: '#2a0a06', mid: '#5c1010', light: '#c2410c', glow: '#fb923c' },
  frost: { dark: '#172554', mid: '#1e3a8a', light: '#60a5fa', glow: '#93c5fd' },
  volt: { dark: '#422006', mid: '#854d0e', light: '#eab308', glow: '#fde047' },
  void: { dark: '#2e1065', mid: '#5b21b6', light: '#8b5cf6', glow: '#c4b5fd' },
  toxic: { dark: '#1a2e05', mid: '#3f6212', light: '#65a30d', glow: '#bef264' },
};

const ELEMENT_ORDER: readonly GoreElement[] = ['blood', 'rot', 'fire', 'frost', 'volt', 'void', 'toxic'];

const ENEMY_ELEMENT: Readonly<Record<string, GoreElement>> = {
  scarab: 'rot',
  mortar_beetle: 'fire',
  skirmisher: 'blood',
  venom_stalker: 'toxic',
  volt_stalker: 'volt',
  void_reaper: 'void',
  crimson_lancer: 'blood',
  saw_berserker: 'blood',
  mirror_knight: 'blood',
  bomb_goblin: 'fire',
  blight_bomber: 'toxic',
  plague_bearer: 'toxic',
  cactus_brute: 'rot',
  magma_brute: 'fire',
  plasma_golem: 'void',
  shield_warden: 'blood',
  cactus_spitter: 'toxic',
  pyro_shaman: 'fire',
  thunder_mage: 'volt',
  frost_mage: 'frost',
  void_acolyte: 'void',
  healing_priest: 'blood',
  chrono_mage: 'void',
  solar_priest: 'fire',
  laser_sniper: 'blood',
  sniper_mech: 'blood',
  iron_drone: 'blood',
  shock_drone_mk2: 'volt',
  magnet_drone: 'blood',
  boss_frost_empress: 'frost',
  boss_storm_herald: 'volt',
  boss_tempest: 'volt',
  boss_abyssal_leviathan: 'void',
  boss_overlord: 'toxic',
};

/** Nguyên tố máu theo kindIdx trong `BANSUNG_ENEMY_IDS` (−1 / không rõ → 'blood'). */
export function goreElementForEnemyKind(kindIdx: number): GoreElement {
  if (kindIdx < 0 || kindIdx >= BANSUNG_ENEMY_IDS.length) return 'blood';
  const id = BANSUNG_ENEMY_IDS[kindIdx];
  return ENEMY_ELEMENT[id] ?? 'blood';
}

/** Hệ số kích thước gore theo loại (Tank/Boss phun nhiều hơn). */
export function goreSizeForEnemyKind(kindIdx: number): number {
  if (kindIdx < 0 || kindIdx >= BANSUNG_ENEMY_IDS.length) return 1;
  const id: string = BANSUNG_ENEMY_IDS[kindIdx];
  if (id.startsWith('boss_')) return 3;
  if (id === 'cactus_brute' || id === 'magma_brute' || id === 'plasma_golem' || id === 'shield_warden') return 1.8;
  if (id === 'bomb_goblin' || id === 'blight_bomber' || id === 'plague_bearer') return 2.2;
  if (id === 'scarab' || id.endsWith('_drone') || id === 'shock_drone_mk2') return 0.7;
  return 1;
}

// ============================================================================
// 2. Cấu hình & pool (Structure-of-Arrays)
// ============================================================================

export const GORE_CFG = {
  MAX_DROPS: 900,
  MAX_JETS: 40,
  MAX_DECALS: 260,
  GRAVITY: 520, // px/s² theo trục z
  DECAL_LIFE_MS: 22_000,
  DECAL_FADE_MS: 6_000,
  POOL_GROW_MS: 1_400,
  JET_LIFE_MS: 520,
  MAX_LANDING_DECALS_PER_FRAME: 6,
} as const;

const KIND_DROP = 0;
const KIND_CHUNK = 1;
const KIND_MIST = 2;

const D = GORE_CFG.MAX_DROPS;
const dActive = new Uint8Array(D);
const dKind = new Uint8Array(D);
const dElem = new Uint8Array(D);
const dX = new Float32Array(D);
const dY = new Float32Array(D);
const dZ = new Float32Array(D);
const dVx = new Float32Array(D);
const dVy = new Float32Array(D);
const dVz = new Float32Array(D);
const dAge = new Float32Array(D);
const dLife = new Float32Array(D);
const dSize = new Float32Array(D);
const dBounced = new Uint8Array(D);
let dCursor = 0;
let dCount = 0;

const J = GORE_CFG.MAX_JETS;
const jActive = new Uint8Array(J);
const jElem = new Uint8Array(J);
const jX = new Float32Array(J);
const jY = new Float32Array(J);
const jZ = new Float32Array(J);
const jDir = new Float32Array(J);
const jAge = new Float32Array(J);
const jLife = new Float32Array(J);
const jPower = new Float32Array(J);
const jAcc = new Float32Array(J);
let jCursor = 0;

const K = GORE_CFG.MAX_DECALS;
const kActive = new Uint8Array(K);
const kElem = new Uint8Array(K);
const kVariant = new Uint8Array(K);
const kX = new Float32Array(K);
const kY = new Float32Array(K);
const kScale = new Float32Array(K);
const kAge = new Float32Array(K);
const kGrowMs = new Float32Array(K);
const kAlpha = new Float32Array(K);
let kCursor = 0;

let intensity = 1;
let landingDecalsThisFrame = 0;
let rngState = 0x9e3779b9 | 0;

function rand(): number {
  // xorshift32 — xác định, không cấp phát
  let x = rngState;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  rngState = x | 0;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
}

function elemIndex(e: GoreElement): number {
  const i = ELEMENT_ORDER.indexOf(e);
  return i < 0 ? 0 : i;
}

/** 0 = tắt máu, 0.5 = nhẹ, 1 = đầy đủ (mặc định). */
export function setGoreIntensity(level: number): void {
  intensity = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1));
}

export function clearGore(): void {
  dActive.fill(0);
  jActive.fill(0);
  kActive.fill(0);
  dCount = 0;
}

export function getGoreStats(): { drops: number; jets: number; decals: number } {
  let jets = 0;
  let decals = 0;
  for (let i = 0; i < J; i++) jets += jActive[i];
  for (let i = 0; i < K; i++) decals += kActive[i];
  return { drops: dCount, jets, decals };
}

// ============================================================================
// 3. Spawn
// ============================================================================

function spawnDrop(
  kind: number,
  elem: number,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  lifeMs: number,
  size: number,
): void {
  const i = dCursor;
  dCursor = (dCursor + 1) % D;
  if (!dActive[i]) dCount++;
  dActive[i] = 1;
  dKind[i] = kind;
  dElem[i] = elem;
  dX[i] = x;
  dY[i] = y;
  dZ[i] = z;
  dVx[i] = vx;
  dVy[i] = vy;
  dVz[i] = vz;
  dAge[i] = 0;
  dLife[i] = lifeMs;
  dSize[i] = size;
  dBounced[i] = 0;
}

function spawnDecal(elem: number, x: number, y: number, scale: number, growMs: number, variant: number): void {
  const i = kCursor;
  kCursor = (kCursor + 1) % K;
  kActive[i] = 1;
  kElem[i] = elem;
  kVariant[i] = variant;
  kX[i] = x;
  kY[i] = y;
  kScale[i] = scale;
  kAge[i] = 0;
  kGrowMs[i] = growMs;
  kAlpha[i] = 0.92;
}

/**
 * Zombie chết: nổ máu theo hướng đạn (`dirRad` = hướng từ người bắn tới zombie),
 * tia động mạch phun theo nhịp, mảnh thịt, sương máu và vũng máu loang dưới xác.
 */
export function spawnZombieDeathGore(
  x: number,
  y: number,
  dirRad: number,
  size: number,
  kindIdx: number,
): void {
  if (intensity <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const elem = elemIndex(goreElementForEnemyKind(kindIdx));
  const s = Math.max(0.5, Math.min(3.5, size || 1));
  const dir = Number.isFinite(dirRad) ? dirRad : rand() * Math.PI * 2;
  const chestZ = 14 + 6 * s;

  // 1) bùng nổ hình nón theo hướng đạn
  const burst = Math.round((26 + 18 * s) * intensity);
  for (let n = 0; n < burst; n++) {
    const spread = (rand() - 0.5) * (n % 3 === 0 ? 2.6 : 1.3);
    const a = dir + spread;
    const sp = 60 + rand() * 170 * (0.7 + s * 0.3);
    spawnDrop(
      KIND_DROP,
      elem,
      x + (rand() - 0.5) * 6,
      y + (rand() - 0.5) * 3,
      chestZ * (0.6 + rand() * 0.5),
      Math.cos(a) * sp,
      Math.sin(a) * sp * 0.55,
      40 + rand() * 160,
      900 + rand() * 600,
      rand() < 0.25 ? 2 : 1,
    );
  }
  // 2) mảnh thịt / xương văng
  const chunks = Math.round((3 + 3 * s) * intensity);
  for (let n = 0; n < chunks; n++) {
    const a = dir + (rand() - 0.5) * 2.2;
    const sp = 50 + rand() * 120;
    spawnDrop(KIND_CHUNK, elem, x, y, chestZ, Math.cos(a) * sp, Math.sin(a) * sp * 0.55, 90 + rand() * 140, 1600, 2 + Math.round(rand() * s));
  }
  // 3) sương máu tại chỗ
  const mist = Math.round((5 + 3 * s) * intensity);
  for (let n = 0; n < mist; n++) {
    const a = rand() * Math.PI * 2;
    spawnDrop(KIND_MIST, elem, x, y, chestZ, Math.cos(a) * 22, Math.sin(a) * 12, 10 + rand() * 20, 380 + rand() * 220, 3 + s);
  }
  // 4) tia động mạch phun 2 hướng lệch (sau lưng & cổ)
  const jets = s >= 1.5 ? 3 : 2;
  for (let n = 0; n < jets; n++) {
    const i = jCursor;
    jCursor = (jCursor + 1) % J;
    jActive[i] = 1;
    jElem[i] = elem;
    jX[i] = x + (n - 0.5) * 4;
    jY[i] = y;
    jZ[i] = chestZ + n * 3;
    jDir[i] = dir + (n === 0 ? 0.35 : -0.55) + (rand() - 0.5) * 0.4;
    jAge[i] = 0;
    jLife[i] = GORE_CFG.JET_LIFE_MS * (0.8 + 0.3 * s);
    jPower[i] = 120 + 50 * s;
    jAcc[i] = 0;
  }
  // 5) vũng máu loang dưới xác + vệt văng theo hướng đạn
  spawnDecal(elem, x, y + 1, 0.9 + 0.35 * s, GORE_CFG.POOL_GROW_MS, 0);
  spawnDecal(elem, x + Math.cos(dir) * 16 * s, y + Math.sin(dir) * 8 * s, 0.7 + 0.2 * s, 220, 1 + Math.floor(rand() * 3));
}

/** Trúng đạn: tia máu nhỏ bắn ra phía sau mục tiêu + vài giọt rơi. */
export function spawnBloodHit(x: number, y: number, dirRad: number, amount: number, kindIdx: number): void {
  if (intensity <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const elem = elemIndex(goreElementForEnemyKind(kindIdx));
  const dir = Number.isFinite(dirRad) ? dirRad : rand() * Math.PI * 2;
  const n = Math.round(Math.max(3, Math.min(14, 5 + (amount || 1) * 3)) * intensity);
  for (let k = 0; k < n; k++) {
    const a = dir + (rand() - 0.5) * 0.9;
    const sp = 50 + rand() * 130;
    spawnDrop(KIND_DROP, elem, x, y, 12 + rand() * 10, Math.cos(a) * sp, Math.sin(a) * sp * 0.55, 30 + rand() * 90, 700, 1);
  }
  spawnDrop(KIND_MIST, elem, x, y, 16, Math.cos(dir) * 18, Math.sin(dir) * 9, 8, 260, 3);
}

// ============================================================================
// 4. Step
// ============================================================================

export function stepGore(dtMs: number): void {
  const dt = Math.max(0, Math.min(50, dtMs || 0));
  if (dt <= 0) return;
  const dts = dt * 0.001;
  const g = GORE_CFG.GRAVITY;
  landingDecalsThisFrame = 0;

  // tia động mạch: phun giọt theo nhịp tim (3 nhịp / ~0.5 s), yếu dần
  for (let i = 0; i < J; i++) {
    if (!jActive[i]) continue;
    jAge[i] += dt;
    if (jAge[i] >= jLife[i]) {
      jActive[i] = 0;
      continue;
    }
    const u = jAge[i] / jLife[i];
    const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(u * Math.PI * 6));
    const rate = (90 * (1 - u) * pulse + 10) * intensity; // giọt / giây
    jAcc[i] += rate * dts;
    while (jAcc[i] >= 1) {
      jAcc[i] -= 1;
      const a = jDir[i] + (rand() - 0.5) * 0.25;
      const sp = jPower[i] * (1 - u * 0.6) * (0.75 + rand() * 0.4);
      spawnDrop(KIND_DROP, jElem[i], jX[i], jY[i], jZ[i] * (1 - u * 0.5), Math.cos(a) * sp, Math.sin(a) * sp * 0.55, 70 + rand() * 60, 900, 1);
    }
  }

  // giọt / mảnh / sương
  let count = 0;
  for (let i = 0; i < D; i++) {
    if (!dActive[i]) continue;
    dAge[i] += dt;
    if (dAge[i] >= dLife[i]) {
      dActive[i] = 0;
      continue;
    }
    const kind = dKind[i];
    if (kind === KIND_MIST) {
      dX[i] += dVx[i] * dts;
      dY[i] += dVy[i] * dts;
      dZ[i] += dVz[i] * dts;
      dVx[i] *= 0.92;
      dVy[i] *= 0.92;
      count++;
      continue;
    }
    dVz[i] -= g * dts;
    dX[i] += dVx[i] * dts;
    dY[i] += dVy[i] * dts;
    dZ[i] += dVz[i] * dts;
    if (dZ[i] <= 0) {
      dZ[i] = 0;
      if (kind === KIND_CHUNK && !dBounced[i]) {
        // mảnh thịt nảy 1 lần rồi lăn
        dBounced[i] = 1;
        dVz[i] = -dVz[i] * 0.3;
        dVx[i] *= 0.45;
        dVy[i] *= 0.45;
        if (landingDecalsThisFrame < GORE_CFG.MAX_LANDING_DECALS_PER_FRAME) {
          landingDecalsThisFrame++;
          spawnDecal(dElem[i], dX[i], dY[i], 0.35, 0, 4 + (i % 2));
        }
      } else if (kind === KIND_CHUNK) {
        dVz[i] = 0;
        dVx[i] *= 0.8;
        dVy[i] *= 0.8;
        if (Math.abs(dVx[i]) + Math.abs(dVy[i]) < 4) {
          // nằm lại → thành decal nhỏ
          spawnDecal(dElem[i], dX[i], dY[i], 0.3, 0, 5);
          dActive[i] = 0;
          continue;
        }
      } else {
        // giọt chạm đất → vệt nhỏ (giới hạn/khung hình để không ngập decal)
        if ((i & 3) === 0 && landingDecalsThisFrame < GORE_CFG.MAX_LANDING_DECALS_PER_FRAME) {
          landingDecalsThisFrame++;
          spawnDecal(dElem[i], dX[i], dY[i], 0.22 + dSize[i] * 0.08, 0, 4 + (i % 2));
        }
        dActive[i] = 0;
        continue;
      }
    }
    count++;
  }
  dCount = count;

  // decal: vũng loang & mờ dần
  const lifeMs = GORE_CFG.DECAL_LIFE_MS;
  const fadeMs = GORE_CFG.DECAL_FADE_MS;
  for (let i = 0; i < K; i++) {
    if (!kActive[i]) continue;
    kAge[i] += dt;
    if (kAge[i] > lifeMs) {
      const f = 1 - (kAge[i] - lifeMs) / fadeMs;
      if (f <= 0) {
        kActive[i] = 0;
        continue;
      }
      kAlpha[i] = 0.92 * f;
    }
  }
}

// ============================================================================
// 5. Stamp pixel bake sẵn (lazy, 1 lần / nguyên tố × biến thể)
// ============================================================================

const STAMP_VARIANTS = 6;
const STAMP_SIZE = 40;
const stamps: (HTMLCanvasElement | null)[] = new Array(ELEMENT_ORDER.length * STAMP_VARIANTS).fill(null);
const glowStamps: (HTMLCanvasElement | null)[] = new Array(ELEMENT_ORDER.length).fill(null);

function bakeStamp(elem: number, variant: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = STAMP_SIZE;
  c.height = STAMP_SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const pal = PALETTES[ELEMENT_ORDER[elem]];
  const saved = rngState;
  rngState = (0x5bd1e995 ^ (elem * 7919 + variant * 104729)) | 0;
  const cx = STAMP_SIZE / 2;
  const cy = STAMP_SIZE / 2;
  const put = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const blob = (bx: number, by: number, rx: number, ry: number, col: string) => {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d <= 1 + (rand() - 0.5) * 0.35) put(bx + x, by + y, col);
      }
    }
  };
  if (variant === 0) {
    // vũng máu lớn: nhiều blob chồng nhau, viền tối, lõi sáng ướt
    for (let n = 0; n < 6; n++) {
      blob(cx + (rand() - 0.5) * 14, cy + (rand() - 0.5) * 6, 5 + rand() * 6, 2.5 + rand() * 2.5, pal.dark);
    }
    for (let n = 0; n < 4; n++) {
      blob(cx + (rand() - 0.5) * 10, cy + (rand() - 0.5) * 4, 3 + rand() * 4, 1.5 + rand() * 1.5, pal.mid);
    }
    blob(cx - 2, cy - 1, 2.5, 1, pal.light);
    put(cx - 3, cy - 2, '#f8fafc'); // phản chiếu ướt
  } else if (variant <= 3) {
    // vệt văng: lõi + tia + giọt vệ tinh
    blob(cx, cy, 3 + rand() * 2, 2 + rand(), pal.mid);
    const rays = 5 + Math.floor(rand() * 4);
    for (let r = 0; r < rays; r++) {
      const a = rand() * Math.PI * 2;
      const len = 5 + rand() * 12;
      for (let t = 0; t < len; t++) {
        put(cx + Math.cos(a) * t, cy + Math.sin(a) * t * 0.55, t < len * 0.6 ? pal.mid : pal.dark);
      }
      blob(cx + Math.cos(a) * (len + 1.5), cy + Math.sin(a) * (len + 1.5) * 0.55, 1.2, 0.9, pal.dark);
    }
    put(cx - 1, cy - 1, pal.light);
  } else {
    // giọt nhỏ
    blob(cx, cy, 1.6 + rand(), 1 + rand() * 0.5, pal.mid);
    put(cx + 2, cy + 1, pal.dark);
    if (variant === 5) put(cx - 2, cy, pal.dark);
  }
  rngState = saved;
  return c;
}

function getStamp(elem: number, variant: number): HTMLCanvasElement | null {
  const idx = elem * STAMP_VARIANTS + (variant % STAMP_VARIANTS);
  let s = stamps[idx];
  if (!s) {
    s = bakeStamp(elem, variant % STAMP_VARIANTS);
    stamps[idx] = s;
  }
  return s;
}

function getGlowStamp(elem: number): HTMLCanvasElement | null {
  let s = glowStamps[elem];
  if (s || typeof document === 'undefined') return s;
  const pal = PALETTES[ELEMENT_ORDER[elem]];
  if (!pal.glow) return null;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, pal.glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  s = c;
  glowStamps[elem] = s;
  return s;
}

// ============================================================================
// 6. Draw (gọi trong world transform của render.ts)
// ============================================================================

/** Vệt máu trên đất — gọi ở PASS 1 (dưới mọi sprite). */
export function drawGoreGround(
  ctx: CanvasRenderingContext2D,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
): void {
  const prevAlpha = ctx.globalAlpha;
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const half = STAMP_SIZE / 2;
  for (let i = 0; i < K; i++) {
    if (!kActive[i]) continue;
    const x = kX[i];
    const y = kY[i];
    if (x < vx0 - 60 || x > vx1 + 60 || y < vy0 - 40 || y > vy1 + 40) continue;
    const stamp = getStamp(kElem[i], kVariant[i]);
    if (!stamp) continue;
    let sc = kScale[i];
    if (kGrowMs[i] > 0 && kAge[i] < kGrowMs[i]) {
      const u = kAge[i] / kGrowMs[i];
      sc *= 0.25 + 0.75 * (1 - (1 - u) * (1 - u));
    }
    // scale theo bước 0.25 để giữ pixel đều
    sc = Math.max(0.25, Math.round(sc * 4) / 4);
    const w = STAMP_SIZE * sc;
    ctx.globalAlpha = kAlpha[i];
    ctx.drawImage(stamp, Math.round(x - half * sc), Math.round(y - half * sc), Math.round(w), Math.round(w));
  }
  ctx.globalAlpha = prevAlpha;
  ctx.imageSmoothingEnabled = prevSmooth;
}

/** Giọt / mảnh / sương đang bay — gọi ở PASS 4 (trên sprite). */
export function drawGoreAir(
  ctx: CanvasRenderingContext2D,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
): void {
  if (dCount === 0) return;
  const prevAlpha = ctx.globalAlpha;
  for (let i = 0; i < D; i++) {
    if (!dActive[i]) continue;
    const x = dX[i];
    const y = dY[i] - dZ[i];
    if (x < vx0 || x > vx1 || y < vy0 - 40 || y > vy1) continue;
    const pal = PALETTES[ELEMENT_ORDER[dElem[i]]];
    const kind = dKind[i];
    const u = dAge[i] / dLife[i];
    if (kind === KIND_MIST) {
      // sương máu: chùm pixel thưa toả ra (không vẽ khối vuông)
      const a = 0.45 * (1 - u);
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = pal.mid;
      const r = Math.max(1, Math.round(dSize[i] * (0.6 + u * 1.4)));
      const mx = Math.round(x);
      const my = Math.round(y);
      ctx.fillRect(mx, my, 1, 1);
      ctx.fillRect(mx - r, my, 1, 1);
      ctx.fillRect(mx + r, my - 1, 1, 1);
      ctx.fillRect(mx, my - r, 1, 1);
      ctx.fillRect(mx + 1, my + Math.max(1, r >> 1), 1, 1);
      continue;
    }
    ctx.globalAlpha = 1;
    const sz = Math.max(1, Math.round(dSize[i]));
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (kind === KIND_CHUNK) {
      ctx.fillStyle = pal.dark;
      ctx.fillRect(rx - 1, ry - 1, sz + 2, sz + 1);
      ctx.fillStyle = pal.mid;
      ctx.fillRect(rx, ry - 1, sz, sz);
      ctx.fillStyle = '#e9e4d0';
      ctx.fillRect(rx, ry - 1, 1, 1); // mẩu xương
    } else {
      // giọt kéo vệt theo vận tốc (motion streak 1–2px)
      ctx.fillStyle = pal.light;
      ctx.fillRect(rx, ry, sz, sz);
      ctx.fillStyle = pal.mid;
      const sx = dVx[i] > 0 ? -1 : 1;
      ctx.fillRect(rx + sx, ry + (dVz[i] > 0 ? 1 : -1), 1, 1);
    }
    // bóng giọt trên mặt đất khi bay cao
    if (dZ[i] > 6) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#05060a';
      ctx.fillRect(rx, Math.round(dY[i]), 1, 1);
    }
  }
  ctx.globalAlpha = prevAlpha;
}

/** Ichor phát sáng (toxic/void/volt/frost/fire) — gọi trong pass additive ('lighter'). */
export function drawGoreGlow(
  ctx: CanvasRenderingContext2D,
  vx0: number,
  vy0: number,
  vx1: number,
  vy1: number,
): void {
  if (dCount === 0) return;
  const prevAlpha = ctx.globalAlpha;
  for (let i = 0; i < D; i += 2) {
    if (!dActive[i]) continue;
    const pal = PALETTES[ELEMENT_ORDER[dElem[i]]];
    if (!pal.glow) continue;
    const x = dX[i];
    const y = dY[i] - dZ[i];
    if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
    const stamp = getGlowStamp(dElem[i]);
    if (!stamp) continue;
    ctx.globalAlpha = 0.45 * (1 - dAge[i] / dLife[i]);
    ctx.drawImage(stamp, Math.round(x - 6), Math.round(y - 6), 12, 12);
  }
  ctx.globalAlpha = prevAlpha;
}
