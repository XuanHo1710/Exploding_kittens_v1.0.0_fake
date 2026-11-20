import Phaser from 'phaser';
import { gameUiBridge } from '../../bridge/GameUiBridge';
import { PixelAnimationRegistry } from '../animation/PixelAnimationRegistry';
import { MinioAssetLoader } from '../rendering/MinioAssetLoader';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    void this.loadAllAssets();
  }

  private async loadAllAssets(): Promise<void> {
    try {
      const { manifest, clips } = await MinioAssetLoader.fetchManifestAndClips();
      MinioAssetLoader.queueManifestIntoPhaser(this, manifest);

      this.load.on('progress', (val: number) => {
        gameUiBridge.emit('assets:progress', {
          pct: Math.round(20 + val * 75),
          label: `Đang tải Pixel Art PNG & Animation Atlas (${Math.round(val * 100)}%)...`,
        });
      });

      this.load.once('complete', () => {
        const registry = new PixelAnimationRegistry();
        const registered = registry.registerClips(this, clips);
        this.registry.set('animRegistry', registry);
        this.registry.set('assetManifest', manifest);
        gameUiBridge.emit('assets:progress', { pct: 100, label: `Sẵn sàng (${registered} hoạt ảnh pixel đã nạp)!` });
        gameUiBridge.emit('assets:ready', { clipCount: registered });
        this.scene.start('WorldScene');
      });

      this.load.start();
    } catch (err) {
      console.error('BootScene asset load failed:', err);
      const registry = new PixelAnimationRegistry();
      this.registry.set('animRegistry', registry);
      gameUiBridge.emit('assets:ready', { clipCount: 0 });
      this.scene.start('WorldScene');
    }
  }
}
