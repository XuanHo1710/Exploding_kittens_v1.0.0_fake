import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  BackupObjectSnapshot,
  BackupObjectSnapshotSchema,
} from '@eldoria/shared';

export interface JsonEnvelope<T = unknown> {
  $schemaVersion: string;
  entityType: string;
  entityId: string;
  revision: number;
  updatedAt: string;
  checksumSha256: string;
  data: T;
}

export interface WalFileOperation {
  relPath: string;
  op: 'UPSERT' | 'DELETE';
  entityType: string;
  entityId: string;
  beforeRev: number;
  afterRev: number;
  envelope?: JsonEnvelope<any>;
}

export interface WalRecord {
  txId: string;
  status: 'PREPARED' | 'COMMITTED';
  createdAt: string;
  operations: WalFileOperation[];
}

export interface CurrencyLedgerEntry {
  entryId: string;
  txId: string;
  characterId: string;
  currency: string;
  delta: number;
  beforeBalance: number;
  afterBalance: number;
  reason: string;
  createdAt: string;
}

export class JsonIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonIntegrityError';
  }
}

export class LockTimeoutError extends Error {
  constructor(key: string) {
    super(`Timed out waiting for lock on ${key}`);
    this.name = 'LockTimeoutError';
  }
}

class AsyncLockManager {
  private readonly queues = new Map<string, Array<() => void>>();
  private readonly held = new Set<string>();

  async acquire(key: string, timeoutMs = 3000): Promise<() => void> {
    if (!this.held.has(key)) {
      this.held.add(key);
      return () => this.release(key);
    }
    return new Promise<() => void>((resolve, reject) => {
      const q = this.queues.get(key) || [];
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const arr = this.queues.get(key);
        if (arr) {
          const idx = arr.indexOf(grant);
          if (idx >= 0) arr.splice(idx, 1);
        }
        reject(new LockTimeoutError(key));
      }, timeoutMs);

      const grant = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.held.add(key);
        resolve(() => this.release(key));
      };
      q.push(grant);
      this.queues.set(key, q);
    });
  }

  private release(key: string): void {
    const q = this.queues.get(key);
    if (q && q.length > 0) {
      const next = q.shift()!;
      if (q.length === 0) this.queues.delete(key);
      next();
    } else {
      this.held.delete(key);
    }
  }

  async withLocks<T>(keys: string[], fn: () => Promise<T>, timeoutMs = 3000): Promise<T> {
    const sorted = [...new Set(keys)].sort();
    const releasers: Array<() => void> = [];
    try {
      for (const k of sorted) {
        releasers.push(await this.acquire(k, timeoutMs));
      }
      return await fn();
    } finally {
      for (let i = releasers.length - 1; i >= 0; i--) {
        releasers[i]();
      }
    }
  }
}

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // bounded short retry wait for Windows EPERM/EBUSY rename
  }
}

function formatBackupId(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

@Injectable()
export class JsonDatabaseEngine implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JsonDatabaseEngine.name);
  public readonly schemaVersion = '1.0.0';
  public readonly dataDir: string;
  public readonly backupsDir: string;
  private readonly walDir: string;
  private readonly locks = new AsyncLockManager();
  private readonly cache = new Map<string, JsonEnvelope<any>>();
  private readonly dirtyRelPaths = new Map<string, { entityType: string; entityId: string; data: any }>();
  private flushTimer: NodeJS.Timeout | null = null;
  private ready = false;

  constructor(
    @Optional() @Inject('ELDORIA_DATA_DB_DIR') dataDirOverride?: string,
    @Optional() @Inject('ELDORIA_DATA_BACKUPS_DIR') backupsDirOverride?: string,
  ) {
    const rootCwd = process.cwd();
    const defaultData = process.env.DATA_DB_DIR || path.resolve(rootCwd, 'data/db');
    const defaultBackups = process.env.DATA_BACKUPS_DIR || path.resolve(rootCwd, 'data/backups');
    this.dataDir = path.resolve(dataDirOverride || defaultData);
    this.backupsDir = path.resolve(backupsDirOverride || defaultBackups);
    this.walDir = path.join(this.dataDir, 'wal');
  }

  async onModuleInit(): Promise<void> {
    this.initializeSync();
    const recovery = await this.recoverFromWal();
    if (recovery.recoveredCount > 0) {
      this.logger.warn(`WAL crash recovery completed: ${JSON.stringify(recovery)}`);
    }
    this.ready = true;
    this.flushTimer = setInterval(() => {
      void this.flushAllDirty();
    }, 30_000);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushAllDirty();
  }

  public initializeSync(): void {
    const dirs = [
      this.dataDir,
      this.walDir,
      path.join(this.dataDir, 'accounts'),
      path.join(this.dataDir, 'sessions'),
      path.join(this.dataDir, 'characters'),
      path.join(this.dataDir, 'inventories'),
      path.join(this.dataDir, 'homesteads'),
      path.join(this.dataDir, 'social'),
      path.join(this.dataDir, 'parties'),
      path.join(this.dataDir, 'ledgers'),
      path.join(this.dataDir, 'indexes'),
      path.join(this.dataDir, 'indexes', 'idempotency'),
      this.backupsDir,
    ];
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
    }
    this.ready = true;
  }

  public isHealthy(): boolean {
    return this.ready && fs.existsSync(this.dataDir) && fs.existsSync(this.walDir);
  }

  public getPendingWalCount(): number {
    if (!fs.existsSync(this.walDir)) return 0;
    return fs.readdirSync(this.walDir).filter((f) => f.startsWith('tx-') && f.endsWith('.json')).length;
  }

  public resolveSafePath(relPath: string): string {
    if (!relPath || relPath.includes('\0')) {
      throw new Error(`Invalid relative DB path: ${relPath}`);
    }
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const full = path.resolve(this.dataDir, normalized);
    const rel = path.relative(this.dataDir, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Path traversal blocked: ${relPath}`);
    }
    return full;
  }

  private atomicWriteFileSync(absPath: string, content: string, tag: string): void {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const tmpPath = `${absPath}.tmp.${tag}`;
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        fs.renameSync(tmpPath, absPath);
        return;
      } catch (err: any) {
        lastErr = err;
        if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES')) {
          sleepSync(15 * (attempt + 1));
          continue;
        }
        break;
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    throw lastErr;
  }

  public buildEnvelope<T>(
    entityType: string,
    entityId: string,
    data: T,
    revision: number,
  ): JsonEnvelope<T> {
    const payload = JSON.stringify(data);
    return {
      $schemaVersion: this.schemaVersion,
      entityType,
      entityId,
      revision,
      updatedAt: new Date().toISOString(),
      checksumSha256: sha256Hex(payload),
      data,
    };
  }

  public verifyEnvelope<T>(env: JsonEnvelope<T>, relPath: string): JsonEnvelope<T> {
    if (!env || typeof env !== 'object' || typeof env.checksumSha256 !== 'string' || !('data' in env)) {
      throw new JsonIntegrityError(`Malformed JsonEnvelope at ${relPath}`);
    }
    const expected = sha256Hex(JSON.stringify(env.data));
    if (expected !== env.checksumSha256) {
      throw new JsonIntegrityError(
        `SHA-256 checksum mismatch at ${relPath}: expected ${expected}, found ${env.checksumSha256}`,
      );
    }
    return env;
  }

  public readEnvelopeSync<T>(relPath: string, bypassCache = false): JsonEnvelope<T> | null {
    const key = relPath.replace(/\\/g, '/');
    if (!bypassCache && this.cache.has(key)) {
      return structuredClone(this.cache.get(key)!) as JsonEnvelope<T>;
    }
    const abs = this.resolveSafePath(key);
    if (!fs.existsSync(abs)) return null;
    const raw = fs.readFileSync(abs, 'utf8');
    let parsed: JsonEnvelope<T>;
    try {
      parsed = JSON.parse(raw) as JsonEnvelope<T>;
    } catch (err) {
      throw new JsonIntegrityError(`Corrupt JSON syntax at ${key}: ${(err as Error).message}`);
    }
    this.verifyEnvelope(parsed, key);
    this.cache.set(key, structuredClone(parsed));
    return parsed;
  }

  public readEntity<T>(relPath: string, bypassCache = false): T | null {
    const env = this.readEnvelopeSync<T>(relPath, bypassCache);
    return env ? env.data : null;
  }

  public listEntities<T>(folderRelPath: string): Array<JsonEnvelope<T>> {
    const absDir = this.resolveSafePath(folderRelPath);
    if (!fs.existsSync(absDir)) return [];
    const results: Array<JsonEnvelope<T>> = [];
    for (const f of fs.readdirSync(absDir)) {
      if (!f.endsWith('.json') || f.includes('.tmp.')) continue;
      const env = this.readEnvelopeSync<T>(`${folderRelPath}/${f}`);
      if (env) results.push(env);
    }
    return results;
  }

  public async writeEntity<T>(
    relPath: string,
    entityType: string,
    entityId: string,
    data: T,
  ): Promise<JsonEnvelope<T>> {
    const res = await this.runTransaction([{ relPath, op: 'UPSERT', entityType, entityId, data }]);
    return res.envelopes.get(relPath.replace(/\\/g, '/')) as JsonEnvelope<T>;
  }

  public async deleteEntity(relPath: string, entityType: string, entityId: string): Promise<void> {
    await this.runTransaction([{ relPath, op: 'DELETE', entityType, entityId }]);
  }

  /**
   * Multi-File Atomic WAL 2PC Commit (Constitution v2.0.0 — JSON Primary DB)
   */
  public async runTransaction(
    mutations: Array<{
      relPath: string;
      op: 'UPSERT' | 'DELETE';
      entityType: string;
      entityId: string;
      data?: any;
    }>,
    options?: { txId?: string; simulateCrashAfterWalPrepare?: boolean },
  ): Promise<{ txId: string; envelopes: Map<string, JsonEnvelope<any>> }> {
    const txId = options?.txId || crypto.randomUUID();
    const normalizedPaths = mutations.map((m) => m.relPath.replace(/\\/g, '/'));
    const envelopes = new Map<string, JsonEnvelope<any>>();

    await this.locks.withLocks(normalizedPaths, async () => {
      const walOps: WalFileOperation[] = [];
      for (const m of mutations) {
        const key = m.relPath.replace(/\\/g, '/');
        const current = this.readEnvelopeSync(key, true);
        const beforeRev = current ? current.revision : 0;
        const afterRev = beforeRev + 1;
        if (m.op === 'UPSERT') {
          const env = this.buildEnvelope(m.entityType, m.entityId, m.data, afterRev);
          envelopes.set(key, env);
          walOps.push({
            relPath: key,
            op: 'UPSERT',
            entityType: m.entityType,
            entityId: m.entityId,
            beforeRev,
            afterRev,
            envelope: env,
          });
        } else {
          walOps.push({
            relPath: key,
            op: 'DELETE',
            entityType: m.entityType,
            entityId: m.entityId,
            beforeRev,
            afterRev,
          });
        }
      }

      const walPath = path.join(this.walDir, `tx-${txId}.json`);
      const walRecord: WalRecord = {
        txId,
        status: 'PREPARED',
        createdAt: new Date().toISOString(),
        operations: walOps,
      };
      this.atomicWriteFileSync(walPath, JSON.stringify(walRecord, null, 2), `wal-${txId}`);

      if (options?.simulateCrashAfterWalPrepare) {
        throw new Error(`SIMULATED_CRASH_AFTER_WAL_PREPARE:${txId}`);
      }

      for (const op of walOps) {
        const abs = this.resolveSafePath(op.relPath);
        if (op.op === 'UPSERT' && op.envelope) {
          this.atomicWriteFileSync(abs, JSON.stringify(op.envelope, null, 2), txId);
          this.cache.set(op.relPath, structuredClone(op.envelope));
          this.dirtyRelPaths.delete(op.relPath);
        } else if (op.op === 'DELETE') {
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
          this.cache.delete(op.relPath);
          this.dirtyRelPaths.delete(op.relPath);
        }
      }

      walRecord.status = 'COMMITTED';
      this.atomicWriteFileSync(walPath, JSON.stringify(walRecord, null, 2), `wal-commit-${txId}`);
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    });

    return { txId, envelopes };
  }

  /**
   * Idempotent WAL Roll-Forward Crash Recovery on Server Boot
   */
  public async recoverFromWal(): Promise<{
    recoveredCount: number;
    appliedOps: number;
    skippedOps: number;
  }> {
    this.initializeSync();
    const files = fs
      .readdirSync(this.walDir)
      .filter((f) => f.startsWith('tx-') && f.endsWith('.json'))
      .sort();

    let recoveredCount = 0;
    let appliedOps = 0;
    let skippedOps = 0;

    for (const file of files) {
      const walPath = path.join(this.walDir, file);
      const record = JSON.parse(fs.readFileSync(walPath, 'utf8')) as WalRecord;
      if (record.status === 'PREPARED') {
        for (const op of record.operations) {
          const abs = this.resolveSafePath(op.relPath);
          let currentRev = 0;
          if (fs.existsSync(abs)) {
            try {
              const cur = this.readEnvelopeSync(op.relPath, true);
              currentRev = cur ? cur.revision : 0;
            } catch {
              currentRev = 0;
            }
          }
          if (currentRev >= op.afterRev) {
            skippedOps++;
            continue;
          }
          if (op.op === 'UPSERT' && op.envelope) {
            this.atomicWriteFileSync(abs, JSON.stringify(op.envelope, null, 2), `rec-${record.txId}`);
            this.cache.set(op.relPath, structuredClone(op.envelope));
            appliedOps++;
          } else if (op.op === 'DELETE') {
            if (fs.existsSync(abs)) fs.unlinkSync(abs);
            this.cache.delete(op.relPath);
            appliedOps++;
          }
        }
        record.status = 'COMMITTED';
        this.atomicWriteFileSync(walPath, JSON.stringify(record, null, 2), `rec-done-${record.txId}`);
        recoveredCount++;
      }
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    }

    return { recoveredCount, appliedOps, skippedOps };
  }

  /**
   * Staggered Dirty Flusher for non-critical position/progress updates
   */
  public markDirty(relPath: string, entityType: string, entityId: string, data: any): void {
    const key = relPath.replace(/\\/g, '/');
    const prev = this.cache.get(key);
    const rev = prev ? prev.revision : 0;
    this.cache.set(key, this.buildEnvelope(entityType, entityId, data, rev));
    this.dirtyRelPaths.set(key, { entityType, entityId, data: structuredClone(data) });
  }

  public async flushAllDirty(): Promise<number> {
    const entries = [...this.dirtyRelPaths.entries()];
    if (entries.length === 0) return 0;
    this.dirtyRelPaths.clear();
    let count = 0;
    for (const [relPath, item] of entries) {
      try {
        await this.writeEntity(relPath, item.entityType, item.entityId, item.data);
        count++;
      } catch (err) {
        this.logger.error(`Dirty flush failed for ${relPath}: ${(err as Error).message}`);
      }
    }
    return count;
  }

  /**
   * Secondary Index Helpers
   */
  public readIndex(indexName: string): Record<string, any> {
    return this.readEntity<Record<string, any>>(`indexes/${indexName}.json`) || {};
  }

  public async updateIndexEntry(indexName: string, key: string, value: any): Promise<void> {
    const relPath = `indexes/${indexName}.json`;
    await this.locks.withLocks([relPath], async () => {
      const current = this.readEntity<Record<string, any>>(relPath, true) || {};
      if (value === undefined) {
        delete current[key];
      } else {
        current[key] = value;
      }
      const envCur = this.readEnvelopeSync(relPath, true);
      const rev = (envCur?.revision || 0) + 1;
      const env = this.buildEnvelope('INDEX', indexName, current, rev);
      this.atomicWriteFileSync(this.resolveSafePath(relPath), JSON.stringify(env, null, 2), `idx-${Date.now()}`);
      this.cache.set(relPath, structuredClone(env));
    });
  }

  /**
   * Per-Account Idempotency Store (Fallback & Persistent Mirror of Redis)
   */
  public getPersistedIdempotency(accountId: string, idempotencyKey: string): any | null {
    const relPath = `indexes/idempotency/${accountId}.json`;
    const map = this.readEntity<Record<string, { response: any; expiresAt: number }>>(relPath) || {};
    const entry = map[idempotencyKey];
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.response;
  }

  public async savePersistedIdempotency(
    accountId: string,
    idempotencyKey: string,
    response: any,
    ttlMs = 24 * 60 * 60 * 1000,
  ): Promise<void> {
    const relPath = `indexes/idempotency/${accountId}.json`;
    await this.locks.withLocks([relPath], async () => {
      const now = Date.now();
      const map = this.readEntity<Record<string, { response: any; expiresAt: number }>>(relPath, true) || {};
      for (const [k, v] of Object.entries(map)) {
        if (v.expiresAt < now) delete map[k];
      }
      map[idempotencyKey] = { response, expiresAt: now + ttlMs };
      const envCur = this.readEnvelopeSync(relPath, true);
      const env = this.buildEnvelope('IDEMPOTENCY_INDEX', accountId, map, (envCur?.revision || 0) + 1);
      this.atomicWriteFileSync(this.resolveSafePath(relPath), JSON.stringify(env, null, 2), `idem-${Date.now()}`);
      this.cache.set(relPath, structuredClone(env));
    });
  }

  /**
   * Per-Character Monthly Currency Ledger (Constitution v2.0.0)
   */
  public getLedgerRelPath(characterId: string, date = new Date()): string {
    const ym = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return `ledgers/currency-ledger-${characterId}-${ym}.json`;
  }

  public buildLedgerMutation(entry: CurrencyLedgerEntry): {
    relPath: string;
    op: 'UPSERT';
    entityType: string;
    entityId: string;
    data: { characterId: string; entries: CurrencyLedgerEntry[] };
  } {
    const relPath = this.getLedgerRelPath(entry.characterId);
    const existing = this.readEntity<{ characterId: string; entries: CurrencyLedgerEntry[] }>(relPath, true) || {
      characterId: entry.characterId,
      entries: [],
    };
    return {
      relPath,
      op: 'UPSERT',
      entityType: 'CURRENCY_LEDGER',
      entityId: `${entry.characterId}`,
      data: {
        characterId: entry.characterId,
        entries: [...existing.entries, entry],
      },
    };
  }

  /**
   * Rebuild all secondary indexes cleanly from canonical JSON entities
   */
  public async rebuildSecondaryIndexes(): Promise<{ accounts: number; characters: number; sessions: number }> {
    const accountsByEmail: Record<string, string> = {};
    const accountsByUsername: Record<string, string> = {};
    const charsByAccount: Record<string, string[]> = {};
    const charsByName: Record<string, string> = {};
    const sessionsByTokenHash: Record<string, string> = {};

    const accounts = this.listEntities<any>('accounts');
    for (const env of accounts) {
      if (env.data.email) accountsByEmail[String(env.data.email).toLowerCase()] = env.data.id;
      if (env.data.username) accountsByUsername[String(env.data.username).toLowerCase()] = env.data.id;
    }

    const characters = this.listEntities<any>('characters');
    for (const env of characters) {
      const accId = env.data.accountId;
      if (!charsByAccount[accId]) charsByAccount[accId] = [];
      charsByAccount[accId].push(env.data.id);
      if (env.data.name) charsByName[String(env.data.name).toLowerCase()] = env.data.id;
    }

    const sessions = this.listEntities<any>('sessions');
    for (const env of sessions) {
      if (env.data.refreshTokenHash && !env.data.revokedAt) {
        sessionsByTokenHash[env.data.refreshTokenHash] = env.data.id;
      }
    }

    await this.runTransaction([
      { relPath: 'indexes/accounts-by-email.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'accounts-by-email', data: accountsByEmail },
      { relPath: 'indexes/accounts-by-username.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'accounts-by-username', data: accountsByUsername },
      { relPath: 'indexes/characters-by-account.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'characters-by-account', data: charsByAccount },
      { relPath: 'indexes/characters-by-name.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'characters-by-name', data: charsByName },
      { relPath: 'indexes/sessions-by-token-hash.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'sessions-by-token-hash', data: sessionsByTokenHash },
    ]);

    return { accounts: accounts.length, characters: characters.length, sessions: sessions.length };
  }

  /**
   * Local Rotating JSON Snapshot Backup (pure zlib gzip + SHA-256 manifest)
   */
  public async createBackupSnapshot(
    reason: 'SCHEDULED_6H' | 'PRE_MIGRATION' | 'MANUAL_ADMIN' = 'MANUAL_ADMIN',
    retentionTier: 'HOURLY_6H' | 'DAILY_7D' = 'HOURLY_6H',
  ): Promise<{ archivePath: string; archiveBuffer: Buffer; snapshot: BackupObjectSnapshot }> {
    await this.flushAllDirty();
    const files: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(this.dataDir, full).replace(/\\/g, '/');
        if (rel === 'wal' || rel.startsWith('wal/')) continue;
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.json') && !entry.name.includes('.tmp.')) {
          files[rel] = fs.readFileSync(full, 'utf8');
        }
      }
    };
    walk(this.dataDir);

    const fileCount = Math.max(1, Object.keys(files).length);
    const now = new Date();
    const backupId = formatBackupId(now);
    const bundlePayload = JSON.stringify({
      backupId,
      schemaVersion: this.schemaVersion,
      createdAt: now.toISOString(),
      files,
    });
    const archiveBuffer = zlib.gzipSync(Buffer.from(bundlePayload, 'utf8'), { level: 6 });
    const archiveSha256 = sha256Hex(archiveBuffer);
    const snapshot = BackupObjectSnapshotSchema.parse({
      backupId,
      reason,
      sourceJsonFileCount: fileCount,
      archiveSha256,
      retentionTier,
      createdAt: now.toISOString(),
    });

    fs.mkdirSync(this.backupsDir, { recursive: true });
    const archivePath = path.join(this.backupsDir, `eldoria-db-${backupId}.json.gz`);
    fs.writeFileSync(archivePath, archiveBuffer);

    const manifestPath = path.join(this.backupsDir, 'backup-manifest.json');
    let history: BackupObjectSnapshot[] = [];
    if (fs.existsSync(manifestPath)) {
      try {
        history = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        history = [];
      }
    }
    history.unshift(snapshot);

    // Retention policy: keep up to 4 HOURLY_6H + 7 DAILY_7D snapshots locally
    const kept: BackupObjectSnapshot[] = [];
    let hourly = 0;
    let daily = 0;
    for (const s of history) {
      if (s.retentionTier === 'HOURLY_6H' && hourly < 4) {
        kept.push(s);
        hourly++;
      } else if (s.retentionTier === 'DAILY_7D' && daily < 7) {
        kept.push(s);
        daily++;
      } else {
        const staleFile = path.join(this.backupsDir, `eldoria-db-${s.backupId}.json.gz`);
        if (fs.existsSync(staleFile)) {
          try {
            fs.unlinkSync(staleFile);
          } catch {
            // ignore
          }
        }
      }
    }
    this.atomicWriteFileSync(manifestPath, JSON.stringify(kept, null, 2), `bkp-${backupId}`);
    return { archivePath, archiveBuffer, snapshot };
  }

  public static restoreBackupSnapshot(
    archiveBuffer: Buffer,
    expectedSha256: string,
    targetDataDir: string,
  ): { restoredFiles: number; backupId: string } {
    const actualSha = sha256Hex(archiveBuffer);
    if (actualSha !== expectedSha256) {
      throw new JsonIntegrityError(`Backup archive SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha}`);
    }
    const bundle = JSON.parse(zlib.gunzipSync(archiveBuffer).toString('utf8')) as {
      backupId: string;
      files: Record<string, string>;
    };
    const absTarget = path.resolve(targetDataDir);
    fs.mkdirSync(absTarget, { recursive: true });
    let count = 0;
    for (const [relPath, content] of Object.entries(bundle.files)) {
      const full = path.resolve(absTarget, relPath);
      const rel = path.relative(absTarget, full);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Unsafe backup path: ${relPath}`);
      }
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      count++;
    }
    return { restoredFiles: count, backupId: bundle.backupId };
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
