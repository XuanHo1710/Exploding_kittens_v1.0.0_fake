/**
 * Mighty Knight 2.5D Pixel — Zero-Blur 640×360 Internal Pixel Buffer Renderer.
 *
 * Pipeline:
 * 1. Renders strictly at native 640×360 virtual pixels (`imageSmoothingEnabled = false`).
 * 2. 5-layer Biome Parallax (`bg_sky 0.18x`, `bg_far 0.42x`, `bg_mid 0.72x`,
 *    `ground_arena 1.0x`, `fg_silhouette 1.22x`).
 * 3. Ground zones, Boss 2.5D telegraphs & `ground` layer VFX.
 * 4. Y-sorted entities (`footY`): discrete pixel ground shadows (shrinking with Z),
 *    up to 4 colored pixel afterimage ghosts, crisp 10–15 frame sprites with
 *    choreography `(dx, dz, flipX, flashColor)`, `behind` & `front` pixel VFX.
 * 5. Projectiles, square pixel particles, crisp floating combat numbers & HP/Shield/Fury bars.
 * 6. Blits crisp pixel buffer onto viewport canvas with integer pixel camera shake.
 */
import {
  MK_ARENA_W,
  MK_ENEMIES,
  MK_FURY_MAX,
  MK_LANE_BOTTOM,
  MK_LANE_TOP,
  MK_VIEW_H,
  MK_VIEW_W,
  type MkBiome,
  type MkEnemyView,
  type MkFighterView,
  type MkPickupView,
} from '../../../shared/src';
import {
  pruneMkChoreoCache,
  resetMkChoreoCache,
  resolveEnemyChoreoPose,
  resolveHeroChoreoPose,
  triggerMkHitstop,
} from './choreoPlayer';
import { mkParticles } from './particles';
import { consumeMkFrameAudio, playMkSfx } from './sound';
import {
  MK_OUTLINE_INK,
  drawMkEnemyFallback,
  drawMkHeroFallback,
  getMkSpriteImage,
  getMkTintedFrame,
  preloadMkBiome,
} from './sprites';
import type { MkRenderView } from './store';
import { mkVfx } from './vfx';

interface SortItem {
  sortY: number;
  kind: 0 | 1 | 2;
  pickup?: MkPickupView;
  enemy?: MkEnemyView;
  fighter?: MkFighterView;
}

interface AfterimageGhost {
  active: boolean;
  clipKey: string;
  frameIdx: number;
  x: number;
  y: number;
  z: number;
  drawDir: 1 | -1;
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
  tint: string;
  ageMs: number;
  lifeMs: number;
}

const GHOST_CAP = 32;

const TERRAIN_FALLBACK: Record<MkBiome, { sky: string; ground: string; path: string }> = {
  grasslands: { sky: '#355f91', ground: '#3e7c47', path: '#8e7552' },
  jungle: { sky: '#1e3a4c', ground: '#2c543e', path: '#59564e' },
  volcano: { sky: '#4a1b24', ground: '#42303a', path: '#633834' },
  citadel: { sky: '#241b4e', ground: '#3c3b5e', path: '#625e85' },
};

export class MkRenderer {
  private buffer: HTMLCanvasElement | null = null;
  private bctx: CanvasRenderingContext2D | null = null;
  private camX = 120;
  private lookAhead = 0;
  private lastNowMs = 0;
  private lastBiome: MkBiome | null = null;
  private lastPruneMs = 0;
  private readonly sortPool: SortItem[] = [];
  private sortCount = 0;
  private readonly lastGhostAt = new Map<string, number>();
  private readonly ghosts: AfterimageGhost[] = Array.from({ length: GHOST_CAP }, () => ({
    active: false,
    clipKey: '',
    frameIdx: 0,
    x: 0,
    y: 0,
    z: 0,
    drawDir: 1,
    cellW: 48,
    cellH: 48,
    anchorX: 24,
    anchorY: 44,
    tint: '#60a5fa',
    ageMs: 0,
    lifeMs: 160,
  }));
  private ghostCursor = 0;

  private ensureBuffer(): CanvasRenderingContext2D | null {
    if (this.bctx) return this.bctx;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = MK_VIEW_W;
    c.height = MK_VIEW_H;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    this.buffer = c;
    this.bctx = ctx;
    return ctx;
  }

  reset(): void {
    this.camX = 120;
    this.lookAhead = 0;
    this.lastNowMs = 0;
    this.lastBiome = null;
    this.lastGhostAt.clear();
    for (let i = 0; i < GHOST_CAP; i++) this.ghosts[i].active = false;
    resetMkChoreoCache();
    mkParticles.reset();
    mkVfx.reset();
  }

  private spawnGhost(
    unitKey: string,
    nowMs: number,
    clipKey: string,
    frameIdx: number,
    x: number,
    y: number,
    z: number,
    drawDir: 1 | -1,
    cellW: number,
    cellH: number,
    anchorX: number,
    anchorY: number,
    tint: string,
  ): void {
    const prev = this.lastGhostAt.get(unitKey) ?? 0;
    if (nowMs - prev < 48) return;
    this.lastGhostAt.set(unitKey, nowMs);
    const g = this.ghosts[this.ghostCursor];
    this.ghostCursor = (this.ghostCursor + 1) % GHOST_CAP;
    g.active = true;
    g.clipKey = clipKey;
    g.frameIdx = frameIdx;
    g.x = x;
    g.y = y;
    g.z = z;
    g.drawDir = drawDir;
    g.cellW = cellW;
    g.cellH = cellH;
    g.anchorX = anchorX;
    g.anchorY = anchorY;
    g.tint = tint;
    g.ageMs = 0;
    g.lifeMs = 155;
  }

  render(canvas: HTMLCanvasElement, view: MkRenderView | null, nowMs = performance.now()): void {
    const outCtx = canvas.getContext('2d');
    const ctx = this.ensureBuffer();
    if (!outCtx || !ctx || !this.buffer) return;

    const dtMs = this.lastNowMs > 0 ? Math.min(50, Math.max(0, nowMs - this.lastNowMs)) : 16.67;
    this.lastNowMs = nowMs;

    // Fit outer canvas cleanly to display rect
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(320, Math.round(rect.width || canvas.clientWidth || 1280));
    const cssH = Math.max(180, Math.round(rect.height || canvas.clientHeight || 720));
    if (canvas.width !== cssW || canvas.height !== cssH) {
      canvas.width = cssW;
      canvas.height = cssH;
    }

    if (!view) {
      outCtx.imageSmoothingEnabled = false;
      outCtx.fillStyle = '#140c1c';
      outCtx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (view.biome !== this.lastBiome) {
      this.lastBiome = view.biome;
      preloadMkBiome(view.biome);
    }

    // Ingest authoritative events once
    consumeMkFrameAudio(view);
    const hitstop = mkVfx.ingestFxEvents(view.fx);
    mkParticles.ingestDamageEvents(view.damages);
    if (hitstop > 0 && view.myFighterId) {
      triggerMkHitstop(`H:${view.myFighterId}`, hitstop, nowMs);
    }

    mkVfx.step(dtMs);
    mkParticles.step(dtMs);
    for (let i = 0; i < GHOST_CAP; i++) {
      const g = this.ghosts[i];
      if (!g.active) continue;
      g.ageMs += dtMs;
      if (g.ageMs >= g.lifeMs) g.active = false;
    }

    if (nowMs - this.lastPruneMs > 2500) {
      this.lastPruneMs = nowMs;
      pruneMkChoreoCache(nowMs);
    }

    // Smooth camera tracking with directional look-ahead
    const focus =
      view.fighters.find((f) => f.id === view.myFighterId) ??
      view.fighters.find((f) => !f.downed) ??
      view.fighters[0];
    if (focus) {
      const targetLook = focus.dir * 34;
      this.lookAhead += (targetLook - this.lookAhead) * Math.min(1, dtMs * 0.008);
      const targetCam = Math.max(0, Math.min(MK_ARENA_W - MK_VIEW_W, focus.x + this.lookAhead - MK_VIEW_W * 0.5));
      this.camX += (targetCam - this.camX) * Math.min(1, dtMs * 0.012);
    }

    const shake = mkVfx.getShakeOffset(nowMs);
    const camX = Math.max(0, Math.min(MK_ARENA_W - MK_VIEW_W, Math.round(this.camX) + shake.sx));

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(0, shake.sy);

    // 1. Parallax backgrounds & 2.5D ground arena
    this.drawParallax(ctx, view.biome, camX);

    // 2. Ground zones, Boss telegraphs & ground VFX layer
    mkVfx.renderZones(ctx, view.zones, camX, nowMs);
    mkVfx.renderBossTelegraphs(ctx, view.enemies, camX, nowMs);
    mkVfx.renderLayer(ctx, 'ground', camX);
    mkVfx.renderLayer(ctx, 'behind', camX);

    // 3. Afterimage pixel ghosts
    this.drawAfterimages(ctx, camX);

    // 4. Y-sorted entities (pickups, enemies, bosses, heroes)
    this.sortCount = 0;
    for (let i = 0; i < view.pickups.length; i++) {
      this.pushSort(view.pickups[i].y, 0, view.pickups[i]);
    }
    for (let i = 0; i < view.enemies.length; i++) {
      this.pushSort(view.enemies[i].y, 1, undefined, view.enemies[i]);
    }
    for (let i = 0; i < view.fighters.length; i++) {
      this.pushSort(view.fighters[i].y, 2, undefined, undefined, view.fighters[i]);
    }
    const items = this.sortPool.slice(0, this.sortCount);
    items.sort((a, b) => a.sortY - b.sortY);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 0 && it.pickup) {
        mkVfx.renderPickup(ctx, it.pickup, camX, nowMs);
      } else if (it.kind === 1 && it.enemy) {
        this.drawEnemy(ctx, it.enemy, camX, nowMs);
      } else if (it.kind === 2 && it.fighter) {
        this.drawFighter(ctx, it.fighter, it.fighter.id === view.myFighterId, camX, nowMs);
      }
    }

    // 5. Projectiles, front VFX, particles & crisp pixel damage numbers
    mkVfx.renderProjectiles(ctx, view.projectiles, camX);
    mkVfx.renderLayer(ctx, 'front', camX);
    mkVfx.renderLayer(ctx, 'screen', camX);
    mkParticles.renderParticles(ctx, camX);
    mkParticles.renderNumbers(ctx, camX);

    // 6. Foreground parallax silhouette along bottom edge
    this.drawWrappedLayer(ctx, `terrain:${view.biome}:fg_silhouette`, camX * 1.22, MK_VIEW_H - 44, MK_VIEW_W, 44);

    // 7. Crisp Wave/Phase banner
    if (view.banner) {
      this.drawPixelBanner(ctx, view.banner);
    }

    ctx.restore();

    // Blit virtual 640×360 buffer to output display canvas (letterbox-free cover/contain crisp scale)
    outCtx.imageSmoothingEnabled = false;
    outCtx.fillStyle = '#0d0914';
    outCtx.fillRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / MK_VIEW_W;
    const scaleY = canvas.height / MK_VIEW_H;
    const scale = Math.min(scaleX, scaleY);
    const drawW = Math.round(MK_VIEW_W * scale);
    const drawH = Math.round(MK_VIEW_H * scale);
    const dx = Math.floor((canvas.width - drawW) * 0.5);
    const dy = Math.floor((canvas.height - drawH) * 0.5);
    outCtx.drawImage(this.buffer, 0, 0, MK_VIEW_W, MK_VIEW_H, dx, dy, drawW, drawH);
  }

  private pushSort(
    sortY: number,
    kind: 0 | 1 | 2,
    pickup?: MkPickupView,
    enemy?: MkEnemyView,
    fighter?: MkFighterView,
  ): void {
    let slot = this.sortPool[this.sortCount];
    if (!slot) {
      slot = { sortY: 0, kind: 0 };
      this.sortPool.push(slot);
    }
    slot.sortY = sortY;
    slot.kind = kind;
    slot.pickup = pickup;
    slot.enemy = enemy;
    slot.fighter = fighter;
    this.sortCount++;
  }

  private drawWrappedLayer(
    ctx: CanvasRenderingContext2D,
    clipKey: string,
    scrollPx: number,
    destY: number,
    layerW: number,
    layerH: number,
  ): boolean {
    const img = getMkSpriteImage(clipKey);
    if (!img) return false;
    const shift = ((Math.round(scrollPx) % layerW) + layerW) % layerW;
    ctx.drawImage(img, 0, 0, layerW, layerH, -shift, destY, layerW, layerH);
    if (shift > 0) {
      ctx.drawImage(img, 0, 0, layerW, layerH, layerW - shift, destY, layerW, layerH);
    }
    return true;
  }

  private drawParallax(ctx: CanvasRenderingContext2D, biome: MkBiome, camX: number): void {
    const fb = TERRAIN_FALLBACK[biome];
    if (!this.drawWrappedLayer(ctx, `terrain:${biome}:bg_sky`, camX * 0.18, 0, MK_VIEW_W, 168)) {
      ctx.fillStyle = fb.sky;
      ctx.fillRect(0, 0, MK_VIEW_W, 168);
    }
    this.drawWrappedLayer(ctx, `terrain:${biome}:bg_far`, camX * 0.42, 60, MK_VIEW_W, 112);
    this.drawWrappedLayer(ctx, `terrain:${biome}:bg_mid`, camX * 0.72, 72, MK_VIEW_W, 96);

    const groundImg = getMkSpriteImage(`terrain:${biome}:ground_arena`);
    if (groundImg) {
      ctx.drawImage(groundImg, camX, 0, MK_VIEW_W, 204, 0, MK_LANE_TOP, MK_VIEW_W, 204);
    } else {
      ctx.fillStyle = fb.ground;
      ctx.fillRect(0, MK_LANE_TOP, MK_VIEW_W, MK_VIEW_H - MK_LANE_TOP);
      ctx.fillStyle = fb.path;
      ctx.fillRect(0, MK_LANE_TOP + 54, MK_VIEW_W, MK_LANE_BOTTOM - MK_LANE_TOP - 88);
    }
  }

  private drawPixelShadow(ctx: CanvasRenderingContext2D, sx: number, sy: number, baseRx: number, z: number): void {
    const shrink = Math.max(0.42, 1 - z / 90);
    const rx = Math.max(4, Math.round(baseRx * shrink));
    const ry = Math.max(2, Math.round(rx * 0.38));
    ctx.fillStyle = 'rgba(20, 12, 28, 0.42)';
    ctx.fillRect(sx - rx, sy - ry, rx * 2, ry * 2);
    ctx.fillRect(sx - rx + 2, sy - ry - 1, Math.max(2, rx * 2 - 4), ry * 2 + 2);
  }

  private drawAfterimages(ctx: CanvasRenderingContext2D, camX: number): void {
    for (let i = 0; i < GHOST_CAP; i++) {
      const g = this.ghosts[i];
      if (!g.active) continue;
      const sx = Math.round(g.x - camX);
      const sy = Math.round(g.y - g.z);
      const tinted = getMkTintedFrame(g.clipKey, g.frameIdx, g.tint, 0.85);
      if (!tinted) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, (1 - g.ageMs / g.lifeMs) * 0.55);
      ctx.translate(sx, sy);
      if (g.drawDir < 0) ctx.scale(-1, 1);
      ctx.drawImage(tinted, -g.anchorX, -g.anchorY);
      ctx.restore();
    }
  }

  private drawFighter(
    ctx: CanvasRenderingContext2D,
    f: MkFighterView,
    isMe: boolean,
    camX: number,
    nowMs: number,
  ): void {
    const pose = resolveHeroChoreoPose(f, nowMs);
    const worldX = f.x + pose.offsetX;
    const worldZ = Math.max(0, f.z + pose.offsetZ);
    const sx = Math.round(worldX - camX);
    const footY = Math.round(f.y);
    const sy = Math.round(f.y - worldZ);

    if (pose.hitstopMs > 0) {
      triggerMkHitstop(`H:${f.id}`, pose.hitstopMs, nowMs);
    }
    if (pose.stepSfx) playMkSfx(pose.stepSfx);
    for (let i = 0; i < pose.stepVfx.length; i++) {
      const cue = pose.stepVfx[i];
      mkVfx.spawnLocal(
        cue.vfxId,
        cue.layer,
        worldX + cue.offsetX * f.dir,
        f.y + cue.offsetY,
        worldZ + cue.offsetZ,
        f.dir,
        cue.tint,
        cue.scale ?? 1,
      );
    }
    if (pose.afterimage && !f.downed) {
      this.spawnGhost(
        `H:${f.id}`,
        nowMs,
        pose.clipKey,
        pose.frameIdx,
        worldX,
        f.y,
        worldZ,
        pose.drawDir,
        pose.cellW,
        pose.cellH,
        pose.anchorX,
        pose.anchorY,
        pose.accentColor,
      );
    }

    if (sx < -64 || sx > MK_VIEW_W + 64) return;

    // Ground shadow & player indicator ring
    this.drawPixelShadow(ctx, sx, footY, 11, worldZ);
    if (isMe) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 12, footY - 4, 24, 8);
    }

    // Co-op Revive progress ring when downed
    if (f.downed) {
      ctx.strokeStyle = f.reviveProgress > 0 ? '#4ade80' : '#f87171';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, footY, 22, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (f.reviveProgress > 0) {
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(sx - 16, footY + 8, Math.round(32 * f.reviveProgress), 3);
      }
    }

    // Draw crisp 10–15 frame sprite
    const img = getMkSpriteImage(pose.clipKey);
    ctx.save();
    ctx.translate(sx, sy);
    if (pose.drawDir < 0) ctx.scale(-1, 1);
    if (img) {
      const tinted = pose.flashColor ? getMkTintedFrame(pose.clipKey, pose.frameIdx, pose.flashColor, 0.55) : null;
      if (tinted) {
        ctx.drawImage(tinted, -pose.anchorX, -pose.anchorY);
      } else {
        ctx.drawImage(
          img,
          pose.frameIdx * pose.cellW,
          0,
          pose.cellW,
          pose.cellH,
          -pose.anchorX,
          -pose.anchorY,
          pose.cellW,
          pose.cellH,
        );
      }
    } else {
      drawMkHeroFallback(ctx, f.heroId, 0, 0, 1);
    }
    ctx.restore();

    // EVADE / Guard shield overlay
    if (f.evadeVisMs > 0 || f.guardMs > 0 || f.counterReadyMs > 0) {
      ctx.strokeStyle = f.guardMs > 0 ? '#fde047' : '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 14, sy - 34, 28, 34);
    }

    // Crisp Pixel HP + Shield + Fury mini bar above hero
    const bw = 28;
    const bx = sx - 14;
    const by = sy - 44;
    ctx.fillStyle = MK_OUTLINE_INK;
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(bx, by, bw, 3);
    const hpRatio = Math.max(0, Math.min(1, f.hp / Math.max(1, f.maxHp)));
    ctx.fillStyle = f.downed ? '#ef4444' : isMe ? '#4ade80' : '#38bdf8';
    ctx.fillRect(bx, by, Math.round(bw * hpRatio), 3);
    if (f.shieldHp > 0) {
      const shRatio = Math.min(1, f.shieldHp / Math.max(1, f.maxHp));
      ctx.fillStyle = '#fde047';
      ctx.fillRect(bx, by, Math.round(bw * shRatio), 1);
    }
    // Mini Fury bar
    ctx.fillStyle = '#334155';
    ctx.fillRect(bx, by + 4, bw, 1);
    ctx.fillStyle = f.fury >= MK_FURY_MAX ? '#fb923c' : '#facc15';
    ctx.fillRect(bx, by + 4, Math.round(bw * Math.min(1, f.fury / MK_FURY_MAX)), 1);

    // Badge tag (P1 / COM)
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = MK_OUTLINE_INK;
    ctx.fillText(f.badge, sx + 1, by - 2);
    ctx.fillStyle = isMe ? '#fde047' : '#e2e8f0';
    ctx.fillText(f.badge, sx, by - 3);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: MkEnemyView, camX: number, nowMs: number): void {
    const pose = resolveEnemyChoreoPose(e, nowMs);
    const worldX = e.x + pose.offsetX;
    const worldZ = Math.max(0, e.z + pose.offsetZ);
    const sx = Math.round(worldX - camX);
    const footY = Math.round(e.y);
    const sy = Math.round(e.y - worldZ);

    if (pose.afterimage) {
      this.spawnGhost(
        `E:${e.id}`,
        nowMs,
        pose.clipKey,
        pose.frameIdx,
        worldX,
        e.y,
        worldZ,
        pose.drawDir,
        pose.cellW,
        pose.cellH,
        pose.anchorX,
        pose.anchorY,
        pose.accentColor,
      );
    }
    if (sx < -96 || sx > MK_VIEW_W + 96) return;

    const spec = MK_ENEMIES[e.kind];
    this.drawPixelShadow(ctx, sx, footY, spec.isBoss ? 22 : 10, worldZ);

    const img = getMkSpriteImage(pose.clipKey);
    ctx.save();
    ctx.translate(sx, sy);
    if (pose.drawDir < 0) ctx.scale(-1, 1);
    if (img) {
      const tinted = pose.flashColor ? getMkTintedFrame(pose.clipKey, pose.frameIdx, pose.flashColor, 0.52) : null;
      if (tinted) {
        ctx.drawImage(tinted, -pose.anchorX, -pose.anchorY);
      } else {
        ctx.drawImage(
          img,
          pose.frameIdx * pose.cellW,
          0,
          pose.cellW,
          pose.cellH,
          -pose.anchorX,
          -pose.anchorY,
          pose.cellW,
          pose.cellH,
        );
      }
    } else {
      drawMkEnemyFallback(ctx, e.kind, 0, 0);
    }
    ctx.restore();

    if (e.hp > 0 && !spec.isBoss) {
      const bw = e.isElite ? 30 : 22;
      const bx = sx - Math.floor(bw / 2);
      const by = sy - 42;
      ctx.fillStyle = MK_OUTLINE_INK;
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = '#3f1d2e';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = e.isElite ? '#f59e0b' : '#ef4444';
      ctx.fillRect(bx, by, Math.round(bw * Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)))), 3);
    }
  }

  private drawPixelBanner(ctx: CanvasRenderingContext2D, text: string): void {
    ctx.save();
    ctx.fillStyle = 'rgba(20, 12, 28, 0.78)';
    ctx.fillRect(140, 82, 360, 28);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.strokeRect(140, 82, 360, 28);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fde047';
    ctx.fillText(text, MK_VIEW_W / 2, 96);
    ctx.restore();
  }
}

export const mkRenderer = new MkRenderer();
