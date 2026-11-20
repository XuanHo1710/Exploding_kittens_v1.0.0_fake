import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetManifestSchema } from '@eldoria/shared';
import { AssetManifestService, LocalMinioService } from '../../src/infrastructure/minio/local-minio.service';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('Asset & Animation Preflight Validation Gate (013 T030 / SC-002)', () => {
  it('rejects manifest with missing/tampered PNG asset SHA-256 on server boot', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eldoria-bad-assets-'));
    tempDirs.push(tmp);
    const v1 = path.join(tmp, 'v1');
    fs.mkdirSync(path.join(v1, 'atlases'), { recursive: true });
    fs.writeFileSync(path.join(v1, 'atlases', 'tampered.png'), Buffer.from('not-matching-sha'));

    const badManifest = AssetManifestSchema.parse({
      manifestVersion: '1.0.0',
      generatedAt: '2026-11-20T00:00:00.000Z',
      pixelStandard: {
        baseTilePx: 32,
        heroFramePx: [48, 64],
        vfxMicroFramePx: [16, 16],
        viewportPx: [640, 360],
        paddingPx: 2,
        extrudePx: 1,
      },
      entries: [
        {
          assetKey: 'atlas_tampered',
          objectKey: 'v1/atlases/tampered.png',
          kind: 'ATLAS_PNG',
          loadingGroup: 'core_ui',
          sha256: 'a'.repeat(64),
          sizeBytes: 16,
        },
      ],
    });
    fs.writeFileSync(path.join(v1, 'manifest.json'), JSON.stringify(badManifest));

    const prevAssets = process.env.ASSETS_DIR;
    const prevMode = process.env.ASSET_STORAGE_MODE;
    process.env.ASSETS_DIR = tmp;
    process.env.ASSET_STORAGE_MODE = 'local_fs';
    try {
      const minio = new LocalMinioService();
      await minio.onModuleInit();
      const svc = new AssetManifestService(minio);
      await expect(svc.loadAndValidate()).rejects.toThrow(/SHA-256 mismatch/);
    } finally {
      if (prevAssets === undefined) delete process.env.ASSETS_DIR;
      else process.env.ASSETS_DIR = prevAssets;
      if (prevMode === undefined) delete process.env.ASSET_STORAGE_MODE;
      else process.env.ASSET_STORAGE_MODE = prevMode;
    }
  });
});
