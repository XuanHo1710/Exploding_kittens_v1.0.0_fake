import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonDatabaseEngine } from '../../src/database/json-database.engine';
import {
  AssetManifestService,
  BackupUploaderService,
  LocalMinioService,
} from '../../src/infrastructure/minio/local-minio.service';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('Local MinIO Asset Manifest Preflight & JSON Backup/Restore Drill (SC-002, SC-006)', () => {
  it('validates all generated MVP PNG atlases, extruded tileset, maps & 369 animation clips on boot', async () => {
    process.env.ASSET_STORAGE_MODE = 'local_fs';
    const minio = new LocalMinioService();
    await minio.onModuleInit();

    const manifestSvc = new AssetManifestService(minio);
    const { manifest, clips } = await manifestSvc.loadAndValidate();

    expect(manifest.entries.length).toBeGreaterThanOrEqual(20);
    expect(manifest.pixelStandard.baseTilePx).toBe(32);
    expect(manifest.pixelStandard.heroFramePx).toEqual([48, 64]);
    expect(manifest.pixelStandard.vfxMicroFramePx).toEqual([16, 16]);
    expect(clips.length).toBeGreaterThanOrEqual(300);
  });

  it('rejects corrupt backup SHA-256 and restores verified JSON backup in < 5 seconds', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'eldoria-bkp-'));
    tempDirs.push(base);

    const dbDir = path.join(base, 'db');
    const bkpDir = path.join(base, 'backups');
    const restoreDir = path.join(base, 'restored-db');

    const db = new JsonDatabaseEngine(dbDir, bkpDir);
    db.initializeSync();
    await db.writeEntity('accounts/acc_bkp.json', 'ACCOUNT', 'acc_bkp', { id: 'acc_bkp', username: 'BackupTester' });
    await db.writeEntity('characters/char_bkp.json', 'CHARACTER', 'char_bkp', { id: 'char_bkp', name: 'KaelBkp', level: 12, gold: 4500 });

    process.env.ASSET_STORAGE_MODE = 'local_fs';
    const minio = new LocalMinioService();
    await minio.onModuleInit();
    const uploader = new BackupUploaderService(db, minio);

    // Corrupt buffer MUST be rejected
    await expect(
      minio.putBackupObject('corrupt.json.gz', Buffer.from('corrupt-bytes'), '0'.repeat(64)),
    ).rejects.toThrow(/SHA-256 mismatch/);

    // Real backup & restore drill timed
    const t0 = performance.now();
    const res = await uploader.runBackupAndUpload('MANUAL_ADMIN', 'HOURLY_6H');
    expect(res.snapshot.sourceJsonFileCount).toBeGreaterThanOrEqual(2);
    expect(res.diskStatus.freePct).toBeGreaterThan(0);

    const buf = fs.readFileSync(res.archivePath);
    const restored = JsonDatabaseEngine.restoreBackupSnapshot(buf, res.snapshot.archiveSha256, restoreDir);
    const elapsedMs = performance.now() - t0;

    expect(restored.restoredFiles).toBeGreaterThanOrEqual(2);
    expect(elapsedMs).toBeLessThan(5000); // far below 5-minute RTO!

    // Verify restored data integrity via fresh engine
    const dbRestored = new JsonDatabaseEngine(restoreDir, bkpDir);
    dbRestored.initializeSync();
    expect(dbRestored.readEntity<any>('characters/char_bkp.json')?.gold).toBe(4500);
  });
});
