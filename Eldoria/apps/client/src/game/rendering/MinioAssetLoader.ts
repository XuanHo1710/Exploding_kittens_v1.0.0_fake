import Phaser from 'phaser';
import { AnimationClipDefinition, AssetManifest } from '@eldoria/shared';
import { gameUiBridge } from '../../bridge/GameUiBridge';

export interface LoadedAssetContext {
  manifest: AssetManifest & { assetBaseUrl: string; assetStorageMode: string };
  clips: AnimationClipDefinition[];
}

/**
 * Loads PNG/JSON Atlases, Extruded Tilesets & Tiled .tmj Maps from Local MinIO
 * (with transparent fallback to Game Server /assets local_fs endpoint).
 */
export class MinioAssetLoader {
  public static async fetchManifestAndClips(): Promise<LoadedAssetContext> {
    gameUiBridge.emit('assets:progress', { pct: 10, label: 'Đang tải Asset Manifest từ Local MinIO...' });
    const [mRes, cRes] = await Promise.all([
      fetch('/api/v1/assets/manifest'),
      fetch('/api/v1/assets/clips'),
    ]);
    if (!mRes.ok) throw new Error(`Failed to fetch asset manifest: HTTP ${mRes.status}`);
    const manifest = await mRes.json();
    const clipsPayload = cRes.ok ? await cRes.json() : { clips: [] };
    return { manifest, clips: clipsPayload.clips || [] };
  }

  public static queueManifestIntoPhaser(
    scene: Phaser.Scene,
    manifest: AssetManifest & { assetBaseUrl: string },
  ): void {
    const base = manifest.assetBaseUrl.replace(/\/+$/, '');
    const entriesByKey = new Map(manifest.entries.map((e) => [e.assetKey, e]));

    // Ensure fallback solid pixel texture exists so no sprite ever renders broken
    if (!scene.textures.exists('__pixel_fallback')) {
      const g = scene.add.graphics();
      g.fillStyle(0xf5c451, 1);
      g.fillRect(0, 0, 16, 16);
      g.lineStyle(1, 0x14111b, 1);
      g.strokeRect(0, 0, 16, 16);
      g.generateTexture('__pixel_fallback', 16, 16);
      g.destroy();
    }

    for (const entry of manifest.entries) {
      const url = `${base}/${entry.objectKey}`;
      if (entry.kind === 'ATLAS_PNG' || entry.kind === 'TILESET_EXTRUDED') {
        const jsonEntry = entriesByKey.get(`${entry.assetKey}_json`);
        if (jsonEntry) {
          scene.load.atlas(entry.assetKey, url, `${base}/${jsonEntry.objectKey}`);
        } else {
          scene.load.image(entry.assetKey, url);
        }
      } else if (entry.kind === 'TILED_MAP') {
        scene.load.json(entry.assetKey, url);
      }
    }
  }
}
