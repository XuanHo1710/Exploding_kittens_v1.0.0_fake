/**
 * Mighty Knight 2.5D Pixel — Zero-GC Square Pixel Particle Pool (250 slots)
 * & Crisp Pixel Floating Combat Numbers.
 */
import type { MkDamageEvent, MkDmgKind } from '../../../shared/src';
import { MK_OUTLINE_INK } from './sprites';

const PARTICLE_CAP = 250;
const FLOAT_CAP = 72;
const SEEN_DMG_CAP = 256;

interface PixelParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  size: number;
  color: string;
  ageMs: number;
  lifeMs: number;
}

interface FloatingDmg {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vz: number;
  text: string;
  color: string;
  scale: number;
  ageMs: number;
  lifeMs: number;
}

const DMG_COLORS: Record<MkDmgKind, string> = {
  normal: '#f8fafc',
  crit: '#fde047',
  skill: '#60a5fa',
  parry: '#fef08a',
  burn: '#fb923c',
  poison: '#4ade80',
  shock: '#c084fc',
  heal: '#86efac',
  evade: '#38bdf8',
  block: '#cbd5e1',
};

class MkPixelParticles {
  private readonly parts: PixelParticle[] = Array.from({ length: PARTICLE_CAP }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    gravity: 220,
    size: 2,
    color: '#ffffff',
    ageMs: 0,
    lifeMs: 300,
  }));
  private partCursor = 0;

  private readonly floats: FloatingDmg[] = Array.from({ length: FLOAT_CAP }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vz: 36,
    text: '',
    color: '#ffffff',
    scale: 1,
    ageMs: 0,
    lifeMs: 650,
  }));
  private floatCursor = 0;

  private readonly seenIds = new Int32Array(SEEN_DMG_CAP).fill(-1);
  private readonly seenSet = new Set<number>();
  private seenCursor = 0;
  private rng = 0x9e3779b9;

  private rand(): number {
    let x = this.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return ((x >>> 0) % 10000) / 10000;
  }

  reset(): void {
    for (let i = 0; i < PARTICLE_CAP; i++) this.parts[i].active = false;
    for (let i = 0; i < FLOAT_CAP; i++) this.floats[i].active = false;
    this.seenIds.fill(-1);
    this.seenSet.clear();
    this.seenCursor = 0;
  }

  spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: string,
    speed = 70,
    size = 2,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.parts[this.partCursor];
      this.partCursor = (this.partCursor + 1) % PARTICLE_CAP;
      const a = this.rand() * Math.PI * 2;
      const sp = speed * (0.35 + this.rand() * 0.75);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(a) * sp;
      slot.vy = Math.sin(a) * sp * 0.45;
      slot.vz = 40 + this.rand() * 80;
      slot.gravity = 240;
      slot.size = this.rand() > 0.65 ? Math.min(3, size + 1) : size;
      slot.color = color;
      slot.ageMs = 0;
      slot.lifeMs = 220 + this.rand() * 240;
    }
  }

  ingestDamageEvents(events: readonly MkDamageEvent[]): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (this.seenSet.has(ev.id)) continue;
      const old = this.seenIds[this.seenCursor];
      if (old >= 0) this.seenSet.delete(old);
      this.seenIds[this.seenCursor] = ev.id;
      this.seenSet.add(ev.id);
      this.seenCursor = (this.seenCursor + 1) % SEEN_DMG_CAP;

      const slot = this.floats[this.floatCursor];
      this.floatCursor = (this.floatCursor + 1) % FLOAT_CAP;
      slot.active = true;
      slot.x = ev.x + (this.rand() - 0.5) * 14;
      slot.y = ev.y;
      slot.z = ev.z + 24;
      slot.vz = ev.kind === 'crit' || ev.kind === 'parry' ? 48 : 34;
      slot.text = ev.label
        ? ev.amount > 0
          ? `${ev.label} ${ev.amount}`
          : ev.label
        : ev.kind === 'heal'
          ? `+${ev.amount}`
          : String(ev.amount);
      slot.color = DMG_COLORS[ev.kind] ?? '#ffffff';
      slot.scale = ev.kind === 'crit' || ev.kind === 'parry' ? 1.25 : 1;
      slot.ageMs = 0;
      slot.lifeMs = ev.kind === 'crit' || ev.kind === 'parry' ? 820 : 620;

      if (ev.kind !== 'heal') {
        this.spawnBurst(
          ev.x,
          ev.y,
          ev.z + 14,
          ev.kind === 'crit' || ev.kind === 'parry' ? 8 : 4,
          slot.color,
          ev.kind === 'crit' ? 95 : 65,
          2,
        );
      }
    }
  }

  step(dtMs: number): void {
    const dt = dtMs * 0.001;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const p = this.parts[i];
      if (!p.active) continue;
      p.ageMs += dtMs;
      if (p.ageMs >= p.lifeMs) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.35;
        p.vx *= 0.6;
      }
    }
    for (let i = 0; i < FLOAT_CAP; i++) {
      const f = this.floats[i];
      if (!f.active) continue;
      f.ageMs += dtMs;
      if (f.ageMs >= f.lifeMs) {
        f.active = false;
        continue;
      }
      f.z += f.vz * dt;
      f.vz *= Math.max(0, 1 - dt * 2.5);
    }
  }

  renderParticles(ctx: CanvasRenderingContext2D, camX: number): void {
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const p = this.parts[i];
      if (!p.active) continue;
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y - p.z);
      if (sx < -8 || sx > 648) continue;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, sy, p.size, p.size);
    }
  }

  renderNumbers(ctx: CanvasRenderingContext2D, camX: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < FLOAT_CAP; i++) {
      const f = this.floats[i];
      if (!f.active) continue;
      const sx = Math.round(f.x - camX);
      const sy = Math.round(f.y - f.z);
      if (sx < -40 || sx > 680) continue;
      const px = f.scale > 1.1 ? 11 : 9;
      ctx.font = `900 ${px}px monospace`;
      ctx.globalAlpha = f.ageMs > f.lifeMs * 0.72 ? Math.max(0, 1 - (f.ageMs - f.lifeMs * 0.72) / (f.lifeMs * 0.28)) : 1;
      ctx.fillStyle = MK_OUTLINE_INK;
      ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillText(f.text, sx - 1, sy);
      ctx.fillText(f.text, sx, sy - 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.restore();
  }
}

export const mkParticles = new MkPixelParticles();
