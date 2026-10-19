import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { ACCOUNT_STORE, type AccountStore } from './json.store';

/** Tài khoản người chơi. PIN và token chỉ lưu dạng băm. */
export interface Account {
  playerId: string;
  name: string;
  nameKey: string;
  avatar?: string;
  pinHash: string;
  pinSalt: string;
  tokens: string[];
  coins: number;
  games: number;
  wins: number;
  lastDaily?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DbShape {
  version: 1;
  accounts: Record<string, Account>;
}

export const DB_FILE = join(__dirname, '..', '..', '..', '..', 'data', 'db.json');
export const emptyDb = (): DbShape => ({ version: 1, accounts: {} });

/** Từ chối file hỏng thay vì âm thầm tạo lại và làm mất tài khoản. */
export function parseDb(content: string): DbShape {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('File tài khoản không phải JSON hợp lệ; không ghi đè dữ liệu.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON tài khoản không hợp lệ.');
  const db = value as DbShape;
  if (db.version !== 1 || !db.accounts || typeof db.accounts !== 'object' || Array.isArray(db.accounts)) {
    throw new Error('Cần JSON dạng { "version": 1, "accounts": {} }.');
  }
  const names = new Set<string>();
  for (const [id, acc] of Object.entries(db.accounts)) {
    if (!acc || typeof acc !== 'object' || !/^[\w-]{8,64}$/.test(id) || acc.playerId !== id ||
      typeof acc.name !== 'string' || !acc.name.trim() || acc.name.length > 20 ||
      acc.nameKey !== acc.name.trim().toLowerCase() || names.has(acc.nameKey) ||
      typeof acc.pinHash !== 'string' || !/^[a-f\d]{64}$/i.test(acc.pinHash) ||
      typeof acc.pinSalt !== 'string' || !/^[a-f\d]{24}$/i.test(acc.pinSalt) ||
      !Array.isArray(acc.tokens) || acc.tokens.length > 5 || acc.tokens.some((t) => typeof t !== 'string' || !/^[a-f\d]{64}$/i.test(t)) ||
      [acc.coins, acc.games, acc.wins, acc.createdAt, acc.updatedAt].some((n) => !Number.isSafeInteger(n) || n < 0) ||
      (acc.avatar !== undefined && typeof acc.avatar !== 'string') ||
      (acc.lastDaily !== undefined && (typeof acc.lastDaily !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(acc.lastDaily)))) {
      throw new Error('JSON chứa tài khoản không hợp lệ; không ghi đè dữ liệu.');
    }
    names.add(acc.nameKey);
  }
  return db;
}

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private data = emptyDb();
  private version = '';
  private ready = false;
  private stopping = false;
  private blocked = false;
  private queue: Promise<void> = Promise.resolve();
  private driveDirty = false;
  private driveSyncing: Promise<void> | null = null;
  private driveRetryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject(ACCOUNT_STORE) private readonly store: AccountStore) {}

  async onModuleInit() {
    // Nest đợi hook hoàn thành trước app.listen(): không nhận đăng ký với DB chưa tải.
    const loaded = await this.store.read();
    this.data = parseDb(loaded.content);
    this.version = loaded.version;
    let mergedFromLocal = false;
    if (this.store.kind === 'google-drive' && existsSync(DB_FILE)) {
      try {
        const localDb = parseDb(readFileSync(DB_FILE, 'utf8'));
        mergedFromLocal = this.mergeAccounts(this.data, localDb);
      } catch {
        // Bỏ qua nếu bản cache cục bộ cũ không hợp lệ
      }
    }
    this.ready = true;
    const currentContent = JSON.stringify(this.data, null, 2);
    this.cache(currentContent, !mergedFromLocal);
    if (mergedFromLocal) {
      this.logger.log('Đã tự động gộp dữ liệu mới hơn từ bản lưu cục bộ và đồng bộ lên Google Drive.');
      this.scheduleDriveSync();
    }
    this.logger.log(`Đã tải ${Object.keys(this.data.accounts).length} tài khoản từ ${this.store.kind}.`);
  }

  account(playerId: string): Account | undefined {
    this.assertReady();
    const acc = Object.hasOwn(this.data.accounts, playerId) ? this.data.accounts[playerId] : undefined;
    return acc ? structuredClone(acc) : undefined;
  }

  findByName(name: string): Account | undefined {
    this.assertReady();
    const key = name.trim().toLowerCase();
    const acc = Object.values(this.data.accounts).find((a) => a.nameKey === key);
    return acc ? structuredClone(acc) : undefined;
  }

  /** Tự động lưu tức thì và đồng bộ nền lên Google Drive (hoặc ghi trực tiếp khi ở chế độ local). */
  transaction<T>(mutate: (draft: DbShape) => T): Promise<T> {
    if (this.stopping) return Promise.reject(this.unavailable());
    const operation = this.queue.then(async () => {
      this.assertReady();
      if (this.blocked) throw this.unavailable();
      const draft = structuredClone(this.data);
      const result = mutate(draft);
      const content = JSON.stringify(draft, null, 2);
      parseDb(content);
      if (content === JSON.stringify(this.data, null, 2)) return structuredClone(result);

      if (this.store.kind === 'google-drive') {
        // Tự động lưu ngay lập tức vào bộ nhớ + file cục bộ data/db.json và đồng bộ ngầm lên Google Drive
        this.data = draft;
        this.cache(content);
        this.scheduleDriveSync();
        return structuredClone(result);
      }

      let nextVersion: string;
      try {
        nextVersion = await this.store.write(content, this.version);
      } catch (error) {
        const failure = error as { code?: string; uncertain?: boolean };
        if (failure.uncertain || failure.code === 'CONFLICT') this.blocked = true;
        this.logger.error(this.blocked
          ? 'Đã khóa cập nhật tài khoản để tránh ghi đè dữ liệu chưa xác định. Hãy khởi động lại server sau khi kiểm tra dữ liệu.'
          : 'Không ghi được dữ liệu tài khoản. Thay đổi chưa được xác nhận.');
        throw this.unavailable();
      }
      this.version = nextVersion;
      this.data = draft;
      this.cache(content);
      return structuredClone(result);
    });
    // Một thao tác bị từ chối không làm hỏng toàn bộ hàng đợi.
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private mergeAccounts(target: DbShape, incoming: DbShape): boolean {
    let changed = false;
    const usedNames = new Map<string, string>();
    for (const [id, acc] of Object.entries(target.accounts)) {
      usedNames.set(acc.nameKey, id);
    }
    for (const [id, acc] of Object.entries(incoming.accounts)) {
      const existing = target.accounts[id];
      if (!existing) {
        if (!usedNames.has(acc.nameKey)) {
          target.accounts[id] = structuredClone(acc);
          usedNames.set(acc.nameKey, id);
          changed = true;
        }
      } else if (acc.updatedAt > existing.updatedAt) {
        const nameOwner = usedNames.get(acc.nameKey);
        if (!nameOwner || nameOwner === id) {
          usedNames.delete(existing.nameKey);
          target.accounts[id] = structuredClone(acc);
          usedNames.set(acc.nameKey, id);
          changed = true;
        }
      }
    }
    return changed;
  }

  private scheduleDriveSync() {
    if (this.store.kind !== 'google-drive') return;
    this.driveDirty = true;
    if (this.driveRetryTimer) {
      clearTimeout(this.driveRetryTimer);
      this.driveRetryTimer = null;
    }
    if (this.driveSyncing) return;
    this.driveSyncing = (async () => {
      while (this.driveDirty && !this.stopping) {
        this.driveDirty = false;
        const snapshot = JSON.stringify(this.data, null, 2);
        try {
          this.version = await this.store.write(snapshot, this.version);
        } catch (error) {
          const failure = error as { code?: string };
          if (failure.code === 'CONFLICT') {
            try {
              const remote = await this.store.read();
              const remoteDb = parseDb(remote.content);
              this.version = remote.version;
              this.mergeAccounts(this.data, remoteDb);
              const mergedContent = JSON.stringify(this.data, null, 2);
              this.cache(mergedContent);
              this.version = await this.store.write(mergedContent, this.version);
              continue;
            } catch (retryErr) {
              this.logger.warn('Tự động đồng bộ lại Google Drive chưa hoàn tất, sẽ thử lại sau.', retryErr);
            }
          } else {
            this.logger.warn('Tự động lưu lên Google Drive tạm hoãn, dữ liệu đã an toàn ở bản lưu cục bộ và sẽ tự thử lại.');
          }
          this.driveDirty = true;
          if (!this.stopping) {
            this.driveRetryTimer = setTimeout(() => {
              this.driveRetryTimer = null;
              this.scheduleDriveSync();
            }, 3000);
          }
          break;
        }
      }
    })().finally(() => {
      this.driveSyncing = null;
      if (this.driveDirty && !this.stopping && !this.driveRetryTimer) {
        this.scheduleDriveSync();
      }
    });
  }

  private assertReady() {
    if (!this.ready) throw this.unavailable();
  }

  private unavailable() {
    return new ServiceUnavailableException('Chưa thể lưu tài khoản. Vui lòng thử lại sau.');
  }

  private cache(content: string, preserveExisting = false) {
    if (this.store.kind !== 'google-drive') return;
    try {
      mkdirSync(dirname(DB_FILE), { recursive: true });
      if (preserveExisting && existsSync(DB_FILE)) {
        const previous = readFileSync(DB_FILE, 'utf8');
        if (previous !== content) {
          writeFileSync(`${DB_FILE}.before-drive-${Date.now()}-${process.pid}.json`, previous, { mode: 0o600, flag: 'wx' });
          this.logger.warn('Đã giữ riêng bản JSON cục bộ trước khi tải dữ liệu Drive.');
        }
      }
      const tmp = `${DB_FILE}.tmp`;
      writeFileSync(tmp, content, { mode: 0o600 });
      renameSync(tmp, DB_FILE);
    } catch {
      // Drive đã xác nhận: lỗi bản sao cục bộ không biến một giao dịch đã ghi thành thất bại.
      this.logger.warn('Đã lưu nhưng không cập nhật được bản sao cục bộ.');
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.driveRetryTimer) {
      clearTimeout(this.driveRetryTimer);
      this.driveRetryTimer = null;
    }
    await this.queue;
    if (this.driveSyncing) await this.driveSyncing;
  }
}
