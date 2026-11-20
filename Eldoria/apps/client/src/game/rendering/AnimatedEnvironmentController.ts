import Phaser from 'phaser';
import { DepthLayerManager } from './DepthLayerManager';

/**
 * Drives 16x16 animated micro-environment effects (water ripples, fire embers, loot sparkles, hit sparks)
 * Capped strictly at <= 120 active sprites for smooth 60 FPS even on modest laptops.
 */
export class AnimatedEnvironmentController {
  private readonly activePool: Phaser.GameObjects.Sprite[] = [];
  private readonly MAX_PARTICLES = 120;

  constructor(private readonly scene: Phaser.Scene) {}

  public spawnAmbientLoop(clipKey: string, x: number, y: number, depth = DepthLayerManager.allyDecal(5), alpha = 0.85): Phaser.GameObjects.Sprite | null {
    if (this.activePool.length >= this.MAX_PARTICLES) return null;
    if (!this.scene.textures.exists('atlas_vfx_16x16')) return null;
    const sp = this.scene.add.sprite(Math.round(x), Math.round(y), 'atlas_vfx_16x16');
    sp.setDepth(depth);
    sp.setAlpha(alpha);
    if (this.scene.anims.exists(clipKey)) {
      sp.play(clipKey);
    }
    this.activePool.push(sp);
    return sp;
  }

  public spawnBurst16(clipKey: string, x: number, y: number, durationMs = 300): void {
    if (this.activePool.length >= this.MAX_PARTICLES) {
      const oldest = this.activePool.shift();
      oldest?.destroy();
    }
    if (!this.scene.textures.exists('atlas_vfx_16x16')) return;
    const sp = this.scene.add.sprite(Math.round(x), Math.round(y), 'atlas_vfx_16x16');
    sp.setDepth(DepthLayerManager.airVfx());
    if (this.scene.anims.exists(clipKey)) {
      sp.play(clipKey);
    }
    this.activePool.push(sp);
    this.scene.time.delayedCall(durationMs, () => {
      const idx = this.activePool.indexOf(sp);
      if (idx >= 0) this.activePool.splice(idx, 1);
      sp.destroy();
    });
  }

  public clearAll(): void {
    for (const sp of this.activePool) sp.destroy();
    this.activePool.length = 0;
  }
}
