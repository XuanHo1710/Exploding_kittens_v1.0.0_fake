/**
 * client/src/bansung/boss-fx.ts
 *
 * Đêm Zombie (spec 007 / ws4): pooled, zero-GC VFX cho bộ skill boss mới & cũ:
 *  - Laser (master-spark / quét / xoay): lõi trắng + quầng màu + xung năng lượng chạy dọc tia
 *    + tia lửa bắn ra 2 mép + chớp sáng điểm cuối.
 *  - Tia sét bắn từ boss: zig-zag sinh lại mỗi 45 ms (nhấp nháy), 2 nhánh rẽ, đốm chạm đất.
 *  - Đạn xoắn ốc kiểu Chicken Invaders: vệt đuôi phát sáng theo màu palette danmaku.
 *  - Vòng tụ lực (charge-up): hạt hội tụ vào tâm + vòng co dần trước khi boss ra chiêu.
 *  - Lớp phủ telegraph: quả cầu tụ năng ở gốc tia laser theo `prog`, sét báo trước rơi
 *    xuống vòng cảnh báo khi sắp nổ.
 *
 * Mọi dữ liệu đến từ snapshot (bullets, telegraphs) & FX event (`FX_BEAM`) do server quyết định;
 * module này CHỈ vẽ, không ảnh hưởng gameplay. Không cấp phát đối tượng mới mỗi frame
 * (Float32Array pool cố định). Gọi `drawAdditive` bên trong pass `'lighter'` của render.ts.
 */
import {
  BANSUNG_FX_BEAM_BOSS_EYE,
  BANSUNG_FX_BEAM_BOSS_LASER,
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
  FX_BEAM,
  decodeDanmakuPalette,
} from '../../../shared/src';

// ---------------------------------------------------------------------------
// Constants & palette
// ---------------------------------------------------------------------------

/** Hex màu theo `BANSUNG_DANMAKU_PALETTE` (CRIMSON, CYAN, VIOLET, GOLD, EMERALD, FLAME, ROSE, SILVER). */
const DANMAKU_HEX: readonly string[] = [
  '#ff4d6d',
  '#66e3ff',
  '#b197fc',
  '#ffd43b',
  '#63e6be',
  '#ff922b',
  '#f783ac',
  '#dee2e6',
];

/** Màu theo loại tia (chỉ số = beam kind). */
const BEAM_HEX: readonly string[] = [
  '#e7f5ff', // RAIL
  '#74c0fc', // CHAIN
  '#9be7ff', // SHOCK
  '#ff922b', // BOSS_EYE
  '#ff4d6d', // BOSS_LASER
  '#e599f7', // LASER_MAP
  '#ffe066', // YELLOW_LIGHTNING
];

const DANMAKU_KIND_MIN = 37;
const DANMAKU_KIND_MAX = 41;

const MAX_BOLTS = 24;
const BOLT_PTS = 12;
const FORK_PTS = 5;
const MAX_BEAMS = 24;
const MAX_SPARKS = 320;
const MAX_CHARGES = 16;
const MAX_TRAILS = 256;
const TRAIL_LEN = 6;
const BOLT_RESEED_MS = 45;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hash01(a: number, b: number, c: number): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export interface BossFxViewRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface BossFxBullet {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly flags: number;
}

export interface BossFxTelegraph {
  readonly id?: number;
  readonly shape?: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly r?: number;
  readonly halfW?: number;
  readonly prog?: number;
  readonly active?: boolean;
  readonly color?: number;
  readonly danger?: number;
}

/** Màu telegraph theo `tg.color` (0 đỏ, 1 cam, 2 xanh, 3 tím, 4 lục, 5 vàng). */
const TELEGRAPH_HEX: readonly string[] = ['#ff4d6d', '#ff922b', '#74c0fc', '#b197fc', '#63e6be', '#ffe066'];

// ---------------------------------------------------------------------------
// Boss FX system
// ---------------------------------------------------------------------------

export class BossFxSystem {
  // Lightning bolts
  private readonly boltX0 = new Float32Array(MAX_BOLTS);
  private readonly boltY0 = new Float32Array(MAX_BOLTS);
  private readonly boltX1 = new Float32Array(MAX_BOLTS);
  private readonly boltY1 = new Float32Array(MAX_BOLTS);
  private readonly boltAge = new Float32Array(MAX_BOLTS);
  private readonly boltLife = new Float32Array(MAX_BOLTS);
  private readonly boltColor = new Uint8Array(MAX_BOLTS);
  private readonly boltSeed = new Uint32Array(MAX_BOLTS);
  private readonly boltForks = new Uint8Array(MAX_BOLTS);
  private readonly boltPx = new Float32Array(MAX_BOLTS * BOLT_PTS);
  private readonly boltPy = new Float32Array(MAX_BOLTS * BOLT_PTS);
  private readonly forkPx = new Float32Array(MAX_BOLTS * 2 * FORK_PTS);
  private readonly forkPy = new Float32Array(MAX_BOLTS * 2 * FORK_PTS);
  private readonly boltBucket = new Int32Array(MAX_BOLTS);
  private boltHead = 0;

  // Laser beam overlays
  private readonly beamX0 = new Float32Array(MAX_BEAMS);
  private readonly beamY0 = new Float32Array(MAX_BEAMS);
  private readonly beamX1 = new Float32Array(MAX_BEAMS);
  private readonly beamY1 = new Float32Array(MAX_BEAMS);
  private readonly beamAge = new Float32Array(MAX_BEAMS);
  private readonly beamLife = new Float32Array(MAX_BEAMS);
  private readonly beamKind = new Uint8Array(MAX_BEAMS);
  private readonly beamW = new Float32Array(MAX_BEAMS);
  private beamHead = 0;

  // Sparks
  private readonly spX = new Float32Array(MAX_SPARKS);
  private readonly spY = new Float32Array(MAX_SPARKS);
  private readonly spVx = new Float32Array(MAX_SPARKS);
  private readonly spVy = new Float32Array(MAX_SPARKS);
  private readonly spAge = new Float32Array(MAX_SPARKS);
  private readonly spLife = new Float32Array(MAX_SPARKS);
  private readonly spColor = new Uint8Array(MAX_SPARKS);
  private spHead = 0;

  // Charge-up rings
  private readonly chX = new Float32Array(MAX_CHARGES);
  private readonly chY = new Float32Array(MAX_CHARGES);
  private readonly chR = new Float32Array(MAX_CHARGES);
  private readonly chAge = new Float32Array(MAX_CHARGES);
  private readonly chLife = new Float32Array(MAX_CHARGES);
  private readonly chColor = new Uint8Array(MAX_CHARGES);
  private chHead = 0;

  // Danmaku trails (ring buffer per bullet slot)
  private readonly trId = new Int32Array(MAX_TRAILS).fill(-1);
  private readonly trX = new Float32Array(MAX_TRAILS * TRAIL_LEN);
  private readonly trY = new Float32Array(MAX_TRAILS * TRAIL_LEN);
  private readonly trCount = new Uint8Array(MAX_TRAILS);
  private readonly trHead = new Uint8Array(MAX_TRAILS);
  private readonly trPal = new Uint8Array(MAX_TRAILS);
  private readonly trSeen = new Uint8Array(MAX_TRAILS);
  private readonly trSlotById = new Map<number, number>();
  private trCursor = 0;
  private lastTrailMs = -1;

  private nowMs = 0;
  private reducedFlash = false;

  setReducedFlash(on: boolean): void {
    this.reducedFlash = on;
  }

  reset(): void {
    this.boltLife.fill(0);
    this.beamLife.fill(0);
    this.spLife.fill(0);
    this.chLife.fill(0);
    this.trId.fill(-1);
    this.trCount.fill(0);
    this.trSlotById.clear();
  }

  // -------------------------------------------------------------------------
  // Spawners
  // -------------------------------------------------------------------------

  /** Tia sét từ (x0,y0) → (x1,y1). `colorIdx` = chỉ số BEAM_HEX (1 xanh, 2 cyan, 6 vàng). */
  spawnLightning(x0: number, y0: number, x1: number, y1: number, colorIdx = 2, lifeMs = 220, forks = 2): void {
    const i = this.boltHead;
    this.boltHead = (this.boltHead + 1) % MAX_BOLTS;
    this.boltX0[i] = x0;
    this.boltY0[i] = y0;
    this.boltX1[i] = x1;
    this.boltY1[i] = y1;
    this.boltAge[i] = 0;
    this.boltLife[i] = Math.max(60, lifeMs);
    this.boltColor[i] = clamp(colorIdx | 0, 0, BEAM_HEX.length - 1);
    this.boltSeed[i] = (Math.floor(x0 * 7 + y1 * 13 + this.nowMs) >>> 0) || 1;
    this.boltForks[i] = clamp(forks | 0, 0, 2);
    this.boltBucket[i] = -1;
    // tia lửa tại điểm sét chạm
    this.burstSparks(x1, y1, 10, this.boltColor[i], 180);
  }

  /** Vòng tụ lực trước khi boss ra chiêu (vd. khi telegraph bắt đầu). */
  spawnChargeRing(x: number, y: number, radius: number, colorIdx: number, durationMs = 600): void {
    const i = this.chHead;
    this.chHead = (this.chHead + 1) % MAX_CHARGES;
    this.chX[i] = x;
    this.chY[i] = y;
    this.chR[i] = Math.max(16, radius);
    this.chAge[i] = 0;
    this.chLife[i] = Math.max(120, durationMs);
    this.chColor[i] = clamp(colorIdx | 0, 0, BEAM_HEX.length - 1);
  }

  burstSparks(x: number, y: number, count: number, colorIdx: number, speed = 160): void {
    const n = Math.min(40, Math.max(0, count | 0));
    for (let k = 0; k < n; k++) {
      const i = this.spHead;
      this.spHead = (this.spHead + 1) % MAX_SPARKS;
      const a = hash01(k, x | 0, y | 0) * Math.PI * 2;
      const s = speed * (0.35 + hash01(y | 0, k, 3) * 0.9);
      this.spX[i] = x;
      this.spY[i] = y;
      this.spVx[i] = Math.cos(a) * s;
      this.spVy[i] = Math.sin(a) * s - 40;
      this.spAge[i] = 0;
      this.spLife[i] = 220 + hash01(k, 9, x | 0) * 260;
      this.spColor[i] = colorIdx;
    }
  }

  /**
   * Nhận FX event từ snapshot. Gọi từ `processBansungFxEvents` cho mỗi event:
   * `bansungBossFx.onFxEvent(evt.type, evt.a, evt.b, evt.c, evt.d, evt.e)`.
   */
  onFxEvent(type: number, a: number, b: number, c: number, d: number, e: number): void {
    if (type !== FX_BEAM) return;
    const kind = e | 0;
    if (kind === BANSUNG_FX_BEAM_CHAIN || kind === BANSUNG_FX_BEAM_SHOCK || kind === BANSUNG_FX_BEAM_YELLOW_LIGHTNING) {
      const len = Math.hypot(c - a, d - b);
      if (len < 24) return;
      this.spawnLightning(a, b, c, d, kind, kind === BANSUNG_FX_BEAM_YELLOW_LIGHTNING ? 240 : 190, len > 220 ? 2 : 1);
      return;
    }
    if (kind === BANSUNG_FX_BEAM_LASER_MAP || kind === BANSUNG_FX_BEAM_BOSS_LASER || kind === BANSUNG_FX_BEAM_BOSS_EYE) {
      const i = this.beamHead;
      this.beamHead = (this.beamHead + 1) % MAX_BEAMS;
      this.beamX0[i] = a;
      this.beamY0[i] = b;
      this.beamX1[i] = c;
      this.beamY1[i] = d;
      this.beamAge[i] = 0;
      this.beamLife[i] = kind === BANSUNG_FX_BEAM_LASER_MAP ? 260 : 220;
      this.beamKind[i] = kind;
      this.beamW[i] = kind === BANSUNG_FX_BEAM_LASER_MAP ? 14 : kind === BANSUNG_FX_BEAM_BOSS_LASER ? 10 : 7;
      // tia lửa 2 mép + chớp đầu/cuối
      this.burstSparks(c, d, 6, kind, 210);
      if (hash01(a | 0, b | 0, 5) < 0.5) this.burstSparks(a, b, 3, kind, 120);
    }
  }

  /**
   * Ghi lại vị trí đạn danmaku của boss để vẽ vệt đuôi phát sáng.
   * Gọi 1 lần/frame trước `drawAdditive`, truyền danh sách bullets hiện tại.
   */
  trackDanmaku(bullets: readonly BossFxBullet[], nowMs: number): void {
    const sampleDue = this.lastTrailMs < 0 || nowMs - this.lastTrailMs >= 33;
    if (!sampleDue) return;
    this.lastTrailMs = nowMs;
    this.trSeen.fill(0);
    for (let i = 0; i < bullets.length; i++) {
      const bl = bullets[i];
      if (bl.kind < DANMAKU_KIND_MIN || bl.kind > DANMAKU_KIND_MAX) continue;
      let slot = this.trSlotById.get(bl.id);
      if (slot === undefined) {
        slot = this.allocTrailSlot();
        if (slot < 0) continue;
        this.trId[slot] = bl.id;
        this.trCount[slot] = 0;
        this.trHead[slot] = 0;
        this.trPal[slot] = clamp(decodeDanmakuPalette(bl.flags) | 0, 0, DANMAKU_HEX.length - 1);
        this.trSlotById.set(bl.id, slot);
      }
      this.trSeen[slot] = 1;
      const base = slot * TRAIL_LEN;
      const h = this.trHead[slot];
      this.trX[base + h] = bl.x;
      this.trY[base + h] = bl.y;
      this.trHead[slot] = (h + 1) % TRAIL_LEN;
      if (this.trCount[slot] < TRAIL_LEN) this.trCount[slot]++;
    }
    for (let s = 0; s < MAX_TRAILS; s++) {
      if (this.trId[s] >= 0 && this.trSeen[s] === 0) {
        this.trSlotById.delete(this.trId[s]);
        this.trId[s] = -1;
        this.trCount[s] = 0;
      }
    }
  }

  private allocTrailSlot(): number {
    for (let k = 0; k < MAX_TRAILS; k++) {
      const s = (this.trCursor + k) % MAX_TRAILS;
      if (this.trId[s] < 0) {
        this.trCursor = (s + 1) % MAX_TRAILS;
        return s;
      }
    }
    return -1;
  }

  // -------------------------------------------------------------------------
  // Step
  // -------------------------------------------------------------------------

  step(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    const dt = clamp(dtMs, 0, 50);
    const dts = dt * 0.001;
    for (let i = 0; i < MAX_BOLTS; i++) {
      if (this.boltLife[i] > 0) {
        this.boltAge[i] += dt;
        if (this.boltAge[i] >= this.boltLife[i]) this.boltLife[i] = 0;
      }
    }
    for (let i = 0; i < MAX_BEAMS; i++) {
      if (this.beamLife[i] > 0) {
        this.beamAge[i] += dt;
        if (this.beamAge[i] >= this.beamLife[i]) this.beamLife[i] = 0;
      }
    }
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.spLife[i] <= 0) continue;
      this.spAge[i] += dt;
      if (this.spAge[i] >= this.spLife[i]) {
        this.spLife[i] = 0;
        continue;
      }
      this.spVx[i] *= 0.92;
      this.spVy[i] = this.spVy[i] * 0.92 + 260 * dts;
      this.spX[i] += this.spVx[i] * dts;
      this.spY[i] += this.spVy[i] * dts;
    }
    for (let i = 0; i < MAX_CHARGES; i++) {
      if (this.chLife[i] > 0) {
        this.chAge[i] += dt;
        if (this.chAge[i] >= this.chLife[i]) this.chLife[i] = 0;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------

  /** Vẽ trong pass `'lighter'` (additive) của render.ts, toạ độ thế giới. */
  drawAdditive(ctx: CanvasRenderingContext2D, view: BossFxViewRect, nowMs: number): void {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawTrails(ctx, view);
    this.drawBeams(ctx, view, nowMs);
    this.drawBolts(ctx, view, nowMs);
    this.drawCharges(ctx, view, nowMs);
    this.drawSparks(ctx, view);
    ctx.restore();
  }

  private drawTrails(ctx: CanvasRenderingContext2D, view: BossFxViewRect): void {
    for (let s = 0; s < MAX_TRAILS; s++) {
      const n = this.trCount[s];
      if (this.trId[s] < 0 || n < 2) continue;
      const base = s * TRAIL_LEN;
      const newest = (this.trHead[s] + TRAIL_LEN - 1) % TRAIL_LEN;
      const hx = this.trX[base + newest];
      const hy = this.trY[base + newest];
      if (hx < view.x0 || hx > view.x1 || hy < view.y0 || hy > view.y1) continue;
      ctx.fillStyle = DANMAKU_HEX[this.trPal[s]];
      for (let k = 1; k < n; k++) {
        const idx = (newest - k + TRAIL_LEN) % TRAIL_LEN;
        const t = 1 - k / n;
        ctx.globalAlpha = 0.42 * t;
        const sz = Math.max(1, Math.round(4 * t));
        ctx.fillRect(Math.round(this.trX[base + idx] - sz / 2), Math.round(this.trY[base + idx] - sz / 2), sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBeams(ctx: CanvasRenderingContext2D, view: BossFxViewRect, nowMs: number): void {
    for (let i = 0; i < MAX_BEAMS; i++) {
      if (this.beamLife[i] <= 0) continue;
      const x0 = this.beamX0[i];
      const y0 = this.beamY0[i];
      const x1 = this.beamX1[i];
      const y1 = this.beamY1[i];
      if (Math.max(x0, x1) < view.x0 || Math.min(x0, x1) > view.x1 || Math.max(y0, y1) < view.y0 || Math.min(y0, y1) > view.y1) continue;
      const u = this.beamAge[i] / this.beamLife[i];
      const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      const w = this.beamW[i];
      const col = BEAM_HEX[this.beamKind[i]] ?? '#ffffff';
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;
      // xung năng lượng chạy dọc tia
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) {
        const t = ((nowMs * 0.0016 + k / 6) % 1);
        const px = x0 + dx * t;
        const py = y0 + dy * t;
        ctx.globalAlpha = 0.55 * fade;
        ctx.fillRect(Math.round(px - 2), Math.round(py - 2), 4, 4);
      }
      // gợn mép tia (sóng nhiễu)
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 * fade;
      ctx.beginPath();
      const segs = Math.min(40, Math.max(6, Math.round(len / 28)));
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k <= segs; k++) {
          const t = k / segs;
          const wob = Math.sin(t * 40 + nowMs * 0.02 + side) * 1.6;
          const px = x0 + dx * t + nx * side * (w * 0.9 + wob);
          const py = y0 + dy * t + ny * side * (w * 0.9 + wob);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      // chớp sáng điểm cuối
      const flare = (this.reducedFlash ? 0.35 : 0.7) * fade;
      ctx.globalAlpha = flare;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x1, y1, w * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x1, y1, w * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private rebuildBolt(i: number, bucket: number): void {
    const x0 = this.boltX0[i];
    const y0 = this.boltY0[i];
    const x1 = this.boltX1[i];
    const y1 = this.boltY1[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const amp = clamp(len * 0.08, 6, 34);
    const seed = this.boltSeed[i];
    const base = i * BOLT_PTS;
    for (let k = 0; k < BOLT_PTS; k++) {
      const t = k / (BOLT_PTS - 1);
      const taper = Math.sin(t * Math.PI);
      const off = (hash01(seed, k, bucket) * 2 - 1) * amp * taper;
      this.boltPx[base + k] = x0 + dx * t + nx * off;
      this.boltPy[base + k] = y0 + dy * t + ny * off;
    }
    const forks = this.boltForks[i];
    for (let f = 0; f < 2; f++) {
      const fb = (i * 2 + f) * FORK_PTS;
      if (f >= forks) {
        this.forkPx[fb] = Number.NaN;
        continue;
      }
      const startK = 3 + f * 4 + Math.floor(hash01(seed, f, bucket) * 2);
      const sx = this.boltPx[base + Math.min(BOLT_PTS - 2, startK)];
      const sy = this.boltPy[base + Math.min(BOLT_PTS - 2, startK)];
      const side = f === 0 ? 1 : -1;
      const flen = len * (0.22 + hash01(seed, f + 7, bucket) * 0.18);
      const ang = Math.atan2(dy, dx) + side * (0.5 + hash01(seed, f + 3, bucket) * 0.4);
      for (let k = 0; k < FORK_PTS; k++) {
        const t = k / (FORK_PTS - 1);
        const off = (hash01(seed + 11, k + f * 9, bucket) * 2 - 1) * amp * 0.5 * t;
        this.forkPx[fb + k] = sx + Math.cos(ang) * flen * t - Math.sin(ang) * off;
        this.forkPy[fb + k] = sy + Math.sin(ang) * flen * t + Math.cos(ang) * off;
      }
    }
  }

  private strokeBolt(ctx: CanvasRenderingContext2D, i: number): void {
    const base = i * BOLT_PTS;
    ctx.beginPath();
    ctx.moveTo(this.boltPx[base], this.boltPy[base]);
    for (let k = 1; k < BOLT_PTS; k++) ctx.lineTo(this.boltPx[base + k], this.boltPy[base + k]);
    for (let f = 0; f < 2; f++) {
      const fb = (i * 2 + f) * FORK_PTS;
      if (Number.isNaN(this.forkPx[fb])) continue;
      ctx.moveTo(this.forkPx[fb], this.forkPy[fb]);
      for (let k = 1; k < FORK_PTS; k++) ctx.lineTo(this.forkPx[fb + k], this.forkPy[fb + k]);
    }
    ctx.stroke();
  }

  private drawBolts(ctx: CanvasRenderingContext2D, view: BossFxViewRect, nowMs: number): void {
    const bucket = Math.floor(nowMs / BOLT_RESEED_MS);
    for (let i = 0; i < MAX_BOLTS; i++) {
      if (this.boltLife[i] <= 0) continue;
      const x0 = this.boltX0[i];
      const y0 = this.boltY0[i];
      const x1 = this.boltX1[i];
      const y1 = this.boltY1[i];
      if (Math.max(x0, x1) < view.x0 || Math.min(x0, x1) > view.x1 || Math.max(y0, y1) < view.y0 || Math.min(y0, y1) > view.y1) continue;
      if (this.boltBucket[i] !== bucket) {
        this.boltBucket[i] = bucket;
        this.rebuildBolt(i, bucket);
      }
      const u = this.boltAge[i] / this.boltLife[i];
      // nhấp nháy 2-3 nhịp rồi tắt (không chớp liên tục — Art Bible)
      const flick = u < 0.25 ? 1 : u < 0.4 ? 0.35 : u < 0.6 ? 0.9 : 1 - (u - 0.6) / 0.4;
      const a = clamp(flick, 0, 1) * (this.reducedFlash ? 0.6 : 1);
      const col = BEAM_HEX[this.boltColor[i]] ?? '#9be7ff';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.22 * a;
      ctx.lineWidth = 9;
      this.strokeBolt(ctx, i);
      ctx.globalAlpha = 0.6 * a;
      ctx.lineWidth = 3.5;
      this.strokeBolt(ctx, i);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.95 * a;
      ctx.lineWidth = 1.4;
      this.strokeBolt(ctx, i);
      // đốm chạm
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5 * a;
      ctx.beginPath();
      ctx.arc(x1, y1, 10 + 6 * (1 - u), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawCharges(ctx: CanvasRenderingContext2D, view: BossFxViewRect, nowMs: number): void {
    for (let i = 0; i < MAX_CHARGES; i++) {
      if (this.chLife[i] <= 0) continue;
      const x = this.chX[i];
      const y = this.chY[i];
      const r0 = this.chR[i];
      if (x + r0 < view.x0 || x - r0 > view.x1 || y + r0 < view.y0 || y - r0 > view.y1) continue;
      const u = this.chAge[i] / this.chLife[i];
      const col = BEAM_HEX[this.chColor[i]] ?? '#ffffff';
      const r = r0 * (1 - u * 0.85);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35 + 0.45 * u;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2 + nowMs * 0.004;
        const rr = r0 * (1 - ((u * 1.6 + k * 0.083) % 1));
        ctx.globalAlpha = 0.7;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr - 1), Math.round(y + Math.sin(a) * rr - 1), 3, 3);
      }
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4 + 0.6 * u;
      ctx.beginPath();
      ctx.arc(x, y, 3 + u * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, view: BossFxViewRect): void {
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.spLife[i] <= 0) continue;
      const x = this.spX[i];
      const y = this.spY[i];
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const u = this.spAge[i] / this.spLife[i];
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = u < 0.3 ? '#ffffff' : (BEAM_HEX[this.spColor[i]] ?? '#ffffff');
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Lớp phủ cho telegraph boss (vẽ sau `drawStandardTelegraphs`, trong pass additive):
   *  - line chưa active: quả cầu tụ năng ở gốc tia lớn dần theo `prog` + hạt hội tụ.
   *  - circle sắp nổ (prog > 200): tia sét báo trước nhấp nháy rơi từ trên xuống tâm.
   */
  drawTelegraphOverlay(ctx: CanvasRenderingContext2D, tg: BossFxTelegraph, nowMs: number): void {
    const prog = clamp((tg.prog ?? 0) / 255, 0, 1);
    const col = TELEGRAPH_HEX[clamp(tg.color ?? 0, 0, TELEGRAPH_HEX.length - 1)];
    ctx.save();
    if (tg.shape === 'line' && !tg.active) {
      const r = 4 + prog * 14;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25 + prog * 0.45;
      ctx.beginPath();
      ctx.arc(tg.x0, tg.y0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.5 + prog * 0.5;
      ctx.beginPath();
      ctx.arc(tg.x0, tg.y0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + nowMs * 0.006;
        const rr = 46 * (1 - ((nowMs * 0.002 + k * 0.1) % 1));
        ctx.globalAlpha = 0.6;
        ctx.fillRect(Math.round(tg.x0 + Math.cos(a) * rr - 1), Math.round(tg.y0 + Math.sin(a) * rr - 1), 2, 2);
      }
    } else if (tg.shape === 'circle' && prog > 0.78) {
      const bucket = Math.floor(nowMs / BOLT_RESEED_MS);
      const on = (bucket & 1) === 0 || prog > 0.92;
      if (on) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.globalAlpha = (prog - 0.78) / 0.22;
        ctx.beginPath();
        let px = tg.x1;
        let py = tg.y1 - 260;
        ctx.moveTo(px, py);
        for (let k = 1; k <= 7; k++) {
          px = tg.x1 + (hash01(tg.id ?? 0, k, bucket) * 2 - 1) * 14 * (1 - k / 7);
          py = tg.y1 - 260 + (260 * k) / 7;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  stats(): { bolts: number; beams: number; sparks: number; trails: number } {
    let bolts = 0;
    let beams = 0;
    let sparks = 0;
    for (let i = 0; i < MAX_BOLTS; i++) if (this.boltLife[i] > 0) bolts++;
    for (let i = 0; i < MAX_BEAMS; i++) if (this.beamLife[i] > 0) beams++;
    for (let i = 0; i < MAX_SPARKS; i++) if (this.spLife[i] > 0) sparks++;
    return { bolts, beams, sparks, trails: this.trSlotById.size };
  }
}

/** Singleton dùng chung cho renderer Bắn Súng. */
export const bansungBossFx = new BossFxSystem();
