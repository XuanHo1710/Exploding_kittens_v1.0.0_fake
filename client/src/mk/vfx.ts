/**
 * Mighty Knight 2.5D Pixel — Zero-GC Modular Pixel VFX Pool (96 slots),
 * 4 Layers (ground / behind / front / screen), Pixel Projectiles, Pickups,
 * Active Zones (`MkZoneView`), Boss Telegraphs & Chain Lightning.
 */
import type {
  MkEnemyView,
  MkFxEvent,
  MkPickupKind,
  MkPickupView,
  MkProjectileKind,
  MkProjectileView,
  MkVfxId,
  MkVfxLayer,
  MkZoneView,
} from '../../../shared/src';
import { mkParticles } from './particles';
import { getMkSpriteImage, getMkTintedFrame, getMkVfxClip } from './sprites';

export const MK_FX_CAP = 96;
const SEEN_FX_CAP = 256;

interface FxSlot {
  active: boolean;
  vfxId: MkVfxId;
  layer: MkVfxLayer;
  x: number;
  y: number;
  z: number;
  dir: 1 | -1;
  radius: number;
  tint?: string;
  scale: number;
  ageMs: number;
  lifeMs: number;
  chainTargets?: Array<{ x: number; y: number }>;
}

const VFX_LIFETIME_MS: Record<MkVfxId, number> = {
  slash_crescent: 220,
  slash_cross_x: 280,
  whirlwind_360: 420,
  holy_pillar: 520,
  ground_fissure: 560,
  fire_meteor: 480,
  lightning_bolt: 360,
  frost_nova: 480,
  gravity_vortex: 520,
  dragon_spirit: 460,
  phoenix_flame: 520,
  magic_rune_25d: 540,
  parry_ring: 320,
  aura_fury: 400,
  hit_spark: 180,
  dust_puff: 260,
};

const PROJ_FRAME: Record<MkProjectileKind, number> = {
  arrow: 0,
  pierce_arrow: 1,
  frost_arrow: 2,
  sword_wave: 3,
  shuriken: 4,
  tomahawk: 5,
  arcane_bolt: 6,
  soul_lance: 7,
  phoenix_wave: 8,
  dragon_wave: 9,
  shaman_hex: 10,
  boss_shadow_blade: 10,
  boss_fireball: 11,
  boss_boulder: 11,
};

const PICKUP_BASE_FRAME: Record<MkPickupKind, number> = {
  gold: 0,
  exp: 2,
  potion: 4,
  fury: 6,
  relic_chest: 8,
};

class MkPixelVfxManager {
  private readonly pool: FxSlot[] = Array.from({ length: MK_FX_CAP }, () => ({
    active: false,
    vfxId: 'slash_crescent',
    layer: 'front',
    x: 0,
    y: 0,
    z: 0,
    dir: 1,
    radius: 40,
    scale: 1,
    ageMs: 0,
    lifeMs: 260,
  }));
  private cursor = 0;
  private readonly seenIds = new Int32Array(SEEN_FX_CAP).fill(-1);
  private readonly seenSet = new Set<number>();
  private seenCursor = 0;
  private shakeMag = 0;
  private shakeMs = 0;

  reset(): void {
    for (let i = 0; i < MK_FX_CAP; i++) this.pool[i].active = false;
    this.cursor = 0;
    this.seenIds.fill(-1);
    this.seenSet.clear();
    this.seenCursor = 0;
    this.shakeMag = 0;
    this.shakeMs = 0;
  }

  addShake(px: number, durationMs = 120): void {
    this.shakeMag = Math.min(3, Math.max(this.shakeMag, Math.round(px)));
    this.shakeMs = Math.max(this.shakeMs, durationMs);
  }

  getShakeOffset(nowMs: number): { sx: number; sy: number } {
    if (this.shakeMs <= 0 || this.shakeMag <= 0) return { sx: 0, sy: 0 };
    const phase = Math.floor(nowMs / 28);
    const sx = ((phase % 3) - 1) * this.shakeMag;
    const sy = (((phase >> 1) % 3) - 1) * Math.max(1, this.shakeMag - 1);
    return { sx, sy };
  }

  spawnLocal(
    vfxId: MkVfxId,
    layer: MkVfxLayer,
    x: number,
    y: number,
    z: number,
    dir: 1 | -1,
    tint?: string,
    scale = 1,
    chainTargets?: Array<{ x: number; y: number }>,
  ): void {
    const slot = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MK_FX_CAP;
    slot.active = true;
    slot.vfxId = vfxId;
    slot.layer = layer;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.dir = dir;
    slot.radius = 48 * scale;
    slot.tint = tint;
    slot.scale = scale;
    slot.ageMs = 0;
    slot.lifeMs = VFX_LIFETIME_MS[vfxId] ?? 320;
    slot.chainTargets = chainTargets;
  }

  ingestFxEvents(events: readonly MkFxEvent[]): number {
    let maxHitstop = 0;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (this.seenSet.has(ev.id)) continue;
      const evicted = this.seenIds[this.seenCursor];
      if (evicted >= 0) this.seenSet.delete(evicted);
      this.seenIds[this.seenCursor] = ev.id;
      this.seenSet.add(ev.id);
      this.seenCursor = (this.seenCursor + 1) % SEEN_FX_CAP;

      this.spawnLocal(
        ev.vfxId,
        ev.layer,
        ev.x,
        ev.y,
        ev.z ?? 0,
        ev.dir,
        ev.tint,
        ev.scale ?? 1,
        ev.chainTargets,
      );
      if (ev.hitstopMs && ev.hitstopMs > maxHitstop) maxHitstop = ev.hitstopMs;
      if (
        ev.vfxId === 'holy_pillar' ||
        ev.vfxId === 'ground_fissure' ||
        ev.vfxId === 'fire_meteor' ||
        ev.vfxId === 'parry_ring'
      ) {
        this.addShake(ev.scale && ev.scale >= 1.5 ? 3 : 2, 130);
        mkParticles.spawnBurst(ev.x, ev.y, (ev.z ?? 0) + 8, 8, ev.tint ?? '#fde047', 85, 2);
      }
    }
    return maxHitstop;
  }

  step(dtMs: number): void {
    if (this.shakeMs > 0) {
      this.shakeMs = Math.max(0, this.shakeMs - dtMs);
      if (this.shakeMs === 0) this.shakeMag = 0;
    }
    for (let i = 0; i < MK_FX_CAP; i++) {
      const s = this.pool[i];
      if (!s.active) continue;
      s.ageMs += dtMs;
      if (s.ageMs >= s.lifeMs) s.active = false;
    }
  }

  renderLayer(ctx: CanvasRenderingContext2D, layer: MkVfxLayer, camX: number): void {
    for (let i = 0; i < MK_FX_CAP; i++) {
      const s = this.pool[i];
      if (!s.active || s.layer !== layer) continue;
      const sx = Math.round(s.x - camX);
      const sy = Math.round(s.y - s.z);
      if (sx < -140 || sx > 780) continue;

      const clipKey = `vfx:${s.vfxId}`;
      const clip = getMkVfxClip(s.vfxId);
      const img = getMkSpriteImage(clipKey);
      const t = Math.min(0.999, s.ageMs / Math.max(1, s.lifeMs));

      if (s.chainTargets && s.chainTargets.length > 0) {
        this.drawPixelLightningChain(ctx, sx, sy - 18, s.chainTargets, camX, s.tint ?? '#c084fc');
      }

      if (clip && img) {
        const frameIdx = Math.min(clip.frames - 1, Math.floor(t * clip.frames));
        const tinted = s.tint ? getMkTintedFrame(clipKey, frameIdx, s.tint, 0.42) : null;
        const dw = Math.round(clip.cellW * s.scale);
        const dh = Math.round(clip.cellH * s.scale);
        const ax = Math.round(clip.anchorX * s.scale);
        const ay = Math.round(clip.anchorY * s.scale);
        ctx.save();
        ctx.translate(sx, sy);
        if (s.dir < 0) ctx.scale(-1, 1);
        if (tinted) {
          ctx.drawImage(tinted, 0, 0, clip.cellW, clip.cellH, -ax, -ay, dw, dh);
        } else {
          ctx.drawImage(img, frameIdx * clip.cellW, 0, clip.cellW, clip.cellH, -ax, -ay, dw, dh);
        }
        ctx.restore();
      } else {
        // Crisp pixel fallback ring
        const r = Math.round(s.radius * (0.4 + t * 0.6));
        ctx.strokeStyle = s.tint ?? '#fde047';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - r, sy - Math.round(r * 0.5), r * 2, r);
      }
    }
  }

  private drawPixelLightningChain(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    targets: ReadonlyArray<{ x: number; y: number }>,
    camX: number,
    color: string,
  ): void {
    let px = startX;
    let py = startY;
    for (let i = 0; i < targets.length; i++) {
      const tx = Math.round(targets[i].x - camX);
      const ty = Math.round(targets[i].y - 16);
      const midX = Math.round((px + tx) * 0.5);
      const midY = Math.round((py + ty) * 0.5 + (i % 2 === 0 ? -9 : 9));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(midX, midY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      px = tx;
      py = ty;
    }
  }

  renderZones(ctx: CanvasRenderingContext2D, zones: readonly MkZoneView[], camX: number, nowMs: number): void {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const sx = Math.round(z.x - camX);
      const sy = Math.round(z.y);
      if (sx < -160 || sx > 800) continue;
      const pulse = Math.floor(nowMs / 120) % 2;
      const rx = Math.round(z.radius);
      const ry = Math.round(z.radius * 0.44);
      const col =
        z.tint ??
        (z.kind === 'gravity_well'
          ? '#a855f7'
          : z.kind === 'arrow_rain'
            ? '#38bdf8'
            : z.kind === 'storm_snare'
              ? '#4ade80'
              : z.kind === 'decoy_clone'
                ? '#c084fc'
                : '#f97316');

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.22 + pulse * 0.08;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.restore();

      const vfxKey: MkVfxId =
        z.kind === 'gravity_well'
          ? 'gravity_vortex'
          : z.kind === 'arrow_rain'
            ? 'frost_nova'
            : z.kind === 'storm_snare'
              ? 'magic_rune_25d'
              : 'ground_fissure';
      const clip = getMkVfxClip(vfxKey);
      const img = getMkSpriteImage(`vfx:${vfxKey}`);
      if (clip && img) {
        const fi = Math.floor(nowMs / 90) % clip.frames;
        ctx.drawImage(
          img,
          fi * clip.cellW,
          0,
          clip.cellW,
          clip.cellH,
          sx - clip.anchorX,
          sy - clip.anchorY,
          clip.cellW,
          clip.cellH,
        );
      }
    }
  }

  renderBossTelegraphs(ctx: CanvasRenderingContext2D, enemies: readonly MkEnemyView[], camX: number, nowMs: number): void {
    const blink = Math.floor(nowMs / 90) % 2 === 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.telegraphMs <= 0 || e.telegraphX === undefined || e.telegraphY === undefined) continue;
      const sx = Math.round(e.telegraphX - camX);
      const sy = Math.round(e.telegraphY);
      const rx = Math.round(e.telegraphR ?? 52);
      const ry = Math.round(rx * 0.45);
      ctx.save();
      ctx.fillStyle = blink ? 'rgba(239, 68, 68, 0.34)' : 'rgba(250, 204, 21, 0.26)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = blink ? '#ef4444' : '#fde047';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  renderProjectiles(ctx: CanvasRenderingContext2D, projectiles: readonly MkProjectileView[], camX: number): void {
    const clip = getMkVfxClip('projectiles_sheet');
    const img = getMkSpriteImage('vfx:projectiles_sheet');
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y - p.z);
      if (sx < -48 || sx > 688) continue;
      if (clip && img) {
        const fi = PROJ_FRAME[p.kind] ?? 0;
        ctx.save();
        ctx.translate(sx, sy);
        if (p.dir < 0) ctx.scale(-1, 1);
        ctx.drawImage(
          img,
          fi * clip.cellW,
          0,
          clip.cellW,
          clip.cellH,
          -clip.anchorX,
          -clip.anchorY,
          clip.cellW,
          clip.cellH,
        );
        ctx.restore();
      } else {
        ctx.fillStyle = p.fromEnemy ? '#ef4444' : '#fde047';
        ctx.fillRect(sx - 4, sy - 2, 8, 4);
      }
    }
  }

  renderPickup(ctx: CanvasRenderingContext2D, p: MkPickupView, camX: number, nowMs: number): void {
    const sx = Math.round(p.x - camX);
    const bob = Math.round(Math.sin(nowMs * 0.008 + p.id) * 2);
    const sy = Math.round(p.y - p.z + bob);
    if (sx < -24 || sx > 664) return;
    // Crisp ground shadow
    ctx.fillStyle = 'rgba(20, 12, 28, 0.45)';
    ctx.fillRect(sx - 5, Math.round(p.y) - 1, 10, 3);
    const clip = getMkVfxClip('pickups_sheet');
    const img = getMkSpriteImage('vfx:pickups_sheet');
    if (clip && img) {
      const fi = (PICKUP_BASE_FRAME[p.kind] ?? 0) + (Math.floor(nowMs / 220 + p.id) % 2);
      ctx.drawImage(img, fi * 16, 0, 16, 16, sx - 8, sy - 13, 16, 16);
    } else {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx - 3, sy - 6, 6, 6);
    }
  }
}

export const mkVfx = new MkPixelVfxManager();
