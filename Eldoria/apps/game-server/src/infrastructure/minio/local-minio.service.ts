import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  AnimationClipDefinition,
  AnimationClipDefinitionSchema,
  AssetManifest,
  AssetManifestSchema,
  BackupObjectSnapshot,
} from '@eldoria/shared';
import { JsonDatabaseEngine } from '../../database/json-database.engine';

@Injectable()
export class LocalMinioService implements OnModuleInit {
  private readonly logger = new Logger(LocalMinioService.name);
  public readonly assetsBucket: string;
  public readonly backupsBucket: string;
  public readonly publicBaseUrl: string;
  public readonly localAssetsDir: string;
  private mode: 'MINIO' | 'LOCAL_FS_FALLBACK' = 'LOCAL_FS_FALLBACK';
  private s3: S3Client | null = null;

  constructor() {
    this.assetsBucket = process.env.MINIO_BUCKET_ASSETS || 'eldoria-assets';
    this.backupsBucket = process.env.MINIO_BUCKET_BACKUPS || 'eldoria-backups';
    this.publicBaseUrl = process.env.MINIO_PUBLIC_BASE_URL || `http://127.0.0.1:9000/${this.assetsBucket}`;
    this.localAssetsDir = this.resolveAssetsDir();
  }

  private resolveAssetsDir(): string {
    if (process.env.ASSETS_DIR && fs.existsSync(process.env.ASSETS_DIR)) {
      return path.resolve(process.env.ASSETS_DIR);
    }
    const candidates = [
      path.resolve(process.cwd(), 'assets'),
      path.resolve(process.cwd(), '../../assets'),
      path.resolve(__dirname, '../../../../assets'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'v1', 'manifest.json'))) return c;
    }
    return candidates[0];
  }

  async onModuleInit(): Promise<void> {
    if (process.env.ASSET_STORAGE_MODE === 'local_fs') {
      this.mode = 'LOCAL_FS_FALLBACK';
      this.logger.log(`Asset storage set to local_fs (${this.localAssetsDir})`);
      return;
    }
    const endpoint = process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000';
    try {
      const client = new S3Client({
        endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ROOT_USER || 'eldoria_minio_admin',
          secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'eldoria_local_secret_change_me',
        },
        requestHandler: {
          requestTimeout: 1000,
        } as any,
      });
      await client.send(new HeadBucketCommand({ Bucket: this.assetsBucket }));
      this.s3 = client;
      this.mode = 'MINIO';
      this.logger.log(`Connected to local Docker MinIO at ${endpoint} (buckets: ${this.assetsBucket}, ${this.backupsBucket})`);
    } catch {
      this.mode = 'LOCAL_FS_FALLBACK';
      this.s3 = null;
      this.logger.warn(
        `Local Docker MinIO unavailable at ${endpoint}; operating in LOCAL_FS_FALLBACK serving ${this.localAssetsDir} at /assets`,
      );
    }
  }

  public getMode(): 'MINIO' | 'LOCAL_FS_FALLBACK' {
    return this.mode;
  }

  public getClientAssetBaseUrl(): string {
    if (this.mode === 'MINIO') {
      return this.publicBaseUrl;
    }
    return '/assets';
  }

  public async objectExistsInAssets(objectKey: string): Promise<boolean> {
    if (this.mode === 'MINIO' && this.s3) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.assetsBucket, Key: objectKey }));
        return true;
      } catch {
        return false;
      }
    }
    const fp = path.join(this.localAssetsDir, objectKey);
    return fs.existsSync(fp);
  }

  public async putBackupObject(
    objectKey: string,
    buffer: Buffer,
    expectedSha256: string,
  ): Promise<{ storedAt: 'MINIO' | 'LOCAL_FS_FALLBACK'; objectKey: string; sha256: string }> {
    const actualSha = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualSha !== expectedSha256) {
      throw new Error(`Refusing to store corrupt backup object ${objectKey}: SHA-256 mismatch`);
    }
    if (this.mode === 'MINIO' && this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.backupsBucket,
          Key: objectKey,
          Body: buffer,
          ContentType: 'application/gzip',
          Metadata: { sha256: actualSha },
        }),
      );
      return { storedAt: 'MINIO', objectKey, sha256: actualSha };
    }
    return { storedAt: 'LOCAL_FS_FALLBACK', objectKey, sha256: actualSha };
  }

  public async getBackupObject(objectKey: string, localFallbackPath?: string): Promise<Buffer> {
    if (this.mode === 'MINIO' && this.s3) {
      const resp = await this.s3.send(new GetObjectCommand({ Bucket: this.backupsBucket, Key: objectKey }));
      const chunks: Buffer[] = [];
      for await (const c of resp.Body as AsyncIterable<Buffer>) {
        chunks.push(Buffer.from(c));
      }
      return Buffer.concat(chunks);
    }
    if (localFallbackPath && fs.existsSync(localFallbackPath)) {
      return fs.readFileSync(localFallbackPath);
    }
    throw new Error(`Backup object not found: ${objectKey}`);
  }
}

@Injectable()
export class AssetManifestService implements OnModuleInit {
  private readonly logger = new Logger(AssetManifestService.name);
  private manifest: AssetManifest | null = null;
  private clips: AnimationClipDefinition[] = [];

  constructor(@Inject(LocalMinioService) private readonly minio: LocalMinioService) {}

  async onModuleInit(): Promise<void> {
    await this.loadAndValidate();
  }

  public async loadAndValidate(): Promise<{ manifest: AssetManifest; clips: AnimationClipDefinition[] }> {
    const manifestPath = path.join(this.minio.localAssetsDir, 'v1', 'manifest.json');
    const clipsPath = path.join(this.minio.localAssetsDir, 'v1', 'animation-clips.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Missing required asset manifest at ${manifestPath}. Run npm run assets:generate first.`);
    }
    const parsedManifest = AssetManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));

    // Verify every entry exists and matches SHA-256 on disk (or MinIO HeadObject)
    for (const entry of parsedManifest.entries) {
      const localPath = path.join(this.minio.localAssetsDir, entry.objectKey);
      if (fs.existsSync(localPath)) {
        const buf = fs.readFileSync(localPath);
        const sha = crypto.createHash('sha256').update(buf).digest('hex');
        if (sha !== entry.sha256) {
          throw new Error(`Asset SHA-256 mismatch for ${entry.assetKey} (${entry.objectKey})`);
        }
      } else {
        const existsRemote = await this.minio.objectExistsInAssets(entry.objectKey);
        if (!existsRemote) {
          throw new Error(`Missing required asset object ${entry.objectKey}`);
        }
      }
    }

    let clips: AnimationClipDefinition[] = [];
    if (fs.existsSync(clipsPath)) {
      const rawClips = JSON.parse(fs.readFileSync(clipsPath, 'utf8'));
      clips = (rawClips.clips || []).map((c: unknown) => AnimationClipDefinitionSchema.parse(c));
    }

    this.manifest = parsedManifest;
    this.clips = clips;
    this.logger.log(
      `Validated AssetManifest v${parsedManifest.manifestVersion} (${parsedManifest.entries.length} entries, ${clips.length} animation clips, mode=${this.minio.getMode()})`,
    );
    return { manifest: parsedManifest, clips };
  }

  public getManifestPayload() {
    if (!this.manifest) {
      throw new Error('AssetManifest not initialized');
    }
    return {
      ...this.manifest,
      assetStorageMode: this.minio.getMode(),
      assetBaseUrl: this.minio.getClientAssetBaseUrl(),
      clipCount: this.clips.length,
    };
  }

  public getClips(): AnimationClipDefinition[] {
    return this.clips;
  }

  public getVersion(): string | null {
    return this.manifest ? this.manifest.manifestVersion : null;
  }
}

@Injectable()
export class BackupUploaderService {
  private readonly logger = new Logger(BackupUploaderService.name);

  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(LocalMinioService) private readonly minio: LocalMinioService,
  ) {}

  public checkLocalDiskFreePct(dirPath: string): { freePct: number; lowDiskWarning: boolean } {
    try {
      const stat = fs.statfsSync(dirPath);
      const total = Number(stat.blocks) * Number(stat.bsize);
      const free = Number(stat.bavail) * Number(stat.bsize);
      const freePct = total > 0 ? Number(((free / total) * 100).toFixed(2)) : 100;
      const lowDiskWarning = freePct < 15;
      if (lowDiskWarning) {
        this.logger.warn(`LOW DISK SPACE ALERT on ${dirPath}: only ${freePct}% free (< 15% threshold)`);
      }
      return { freePct, lowDiskWarning };
    } catch {
      return { freePct: 100, lowDiskWarning: false };
    }
  }

  public async runBackupAndUpload(
    reason: 'SCHEDULED_6H' | 'PRE_MIGRATION' | 'MANUAL_ADMIN' = 'MANUAL_ADMIN',
    retentionTier: 'HOURLY_6H' | 'DAILY_7D' = 'HOURLY_6H',
  ): Promise<{
    snapshot: BackupObjectSnapshot;
    archivePath: string;
    objectKey: string;
    storedAt: 'MINIO' | 'LOCAL_FS_FALLBACK';
    diskStatus: { freePct: number; lowDiskWarning: boolean };
  }> {
    const diskStatus = this.checkLocalDiskFreePct(this.db.backupsDir);
    const { archivePath, archiveBuffer, snapshot } = await this.db.createBackupSnapshot(reason, retentionTier);
    const objectKey = `${retentionTier.toLowerCase()}/eldoria-db-${snapshot.backupId}.json.gz`;
    const uploaded = await this.minio.putBackupObject(objectKey, archiveBuffer, snapshot.archiveSha256);
    return {
      snapshot,
      archivePath,
      objectKey,
      storedAt: uploaded.storedAt,
      diskStatus,
    };
  }
}
