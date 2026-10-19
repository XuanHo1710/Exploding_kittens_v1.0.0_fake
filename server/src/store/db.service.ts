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
  /**
   * Mã các thao tác xu đã áp dụng (thu cược, hoàn xu, trả thưởng) → thời điểm.
   * Thử lại sau lỗi "không rõ kết quả" sẽ không cộng/trừ lần thứ hai.
   */
  ops?: Record<string, number>;
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
  if (db.ops !== undefined) {
    if (!db.ops || typeof db.ops !== 'object' || Array.isArray(db.ops)) throw new Error('JSON chứa danh sách thao tác không hợp lệ.');
    for (const [id, at] of Object.entries(db.ops)) {
      if (!/^[\w:.-]{1,100}$/.test(id) || !Number.isSafeInteger(at) || at < 0) throw new Error('JSON chứa danh sách thao tác không hợp lệ.');
    }
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

  constructor(@Inject(ACCOUNT_STORE) private readonly store: AccountStore) {}

  private get cacheFile() {
    return this.store.cacheFile ?? DB_FILE;
  }

  async onModuleInit() {
    // Nest đợi hook hoàn thành trước app.listen(): không nhận đăng ký với DB chưa tải.
    const loaded = await this.store.read();
    this.data = parseDb(loaded.content);
    this.version = loaded.version;
    let keepLocalFile = false;
    if (this.store.kind === 'google-drive' && existsSync(this.cacheFile)) {
      keepLocalFile = await this.importLocalAccounts();
    }
    this.ready = true;
    if (!keepLocalFile) this.cache(JSON.stringify(this.data, null, 2), true);
    this.logger.log(`Đã tải ${Object.keys(this.data.accounts).length} tài khoản từ ${this.store.kind}.`);
  }

  /**
   * Bản JSON cục bộ có tài khoản chưa có trên Drive (vd: dữ liệu từ thời chạy chế độ local):
   * đưa lên Drive và CHỜ Drive xác nhận. Trả về true nếu phải giữ nguyên file cục bộ (chưa đưa lên được).
   */
  private async importLocalAccounts(): Promise<boolean> {
    let localDb: DbShape;
    try {
      localDb = parseDb(readFileSync(this.cacheFile, 'utf8'));
    } catch {
      this.logger.warn('Bản JSON cục bộ không hợp lệ, bỏ qua (file được giữ lại bản sao trước khi ghi đè).');
      return false;
    }
    const merged = structuredClone(this.data);
    const { added, skipped } = this.mergeAccounts(merged, localDb);
    if (skipped.length) this.logger.warn(`Không gộp ${skipped.length} tài khoản cục bộ vì trùng tên với tài khoản khác trên Drive: ${skipped.join(', ')}`);
    if (!added) return false;
    const content = JSON.stringify(merged, null, 2);
    try {
      this.version = await this.store.write(content, this.version);
      this.data = merged;
      this.logger.log(`Đã đưa ${added} tài khoản từ bản lưu cục bộ lên Google Drive.`);
      return false;
    } catch (error) {
      if ((error as { uncertain?: boolean }).uncertain) this.blocked = true;
      this.logger.warn('Chưa đưa được tài khoản cục bộ lên Google Drive; giữ nguyên file cục bộ, lần khởi động sau sẽ thử lại.');
      return true;
    }
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

  /**
   * Mọi thay đổi chỉ có hiệu lực SAU KHI nơi lưu chính (Google Drive hoặc file local) xác nhận.
   * Drive bị server khác ghi trước (CONFLICT): tải bản mới nhất rồi chạy lại thao tác trên đó,
   * nên các kiểm tra (trùng tên, đủ xu…) luôn dựa trên dữ liệu thật.
   */
  transaction<T>(mutate: (draft: DbShape) => T): Promise<T> {
    if (this.stopping) return Promise.reject(this.unavailable());
    const operation = this.queue.then(async () => {
      this.assertReady();
      if (this.blocked) await this.recover();
      for (let attempt = 0; ; attempt += 1) {
        const draft = structuredClone(this.data);
        const result = mutate(draft);
        const content = JSON.stringify(draft, null, 2);
        parseDb(content);
        if (content === JSON.stringify(this.data, null, 2)) return structuredClone(result);

        let nextVersion: string;
        try {
          nextVersion = await this.store.write(content, this.version);
        } catch (error) {
          const failure = error as { code?: string; uncertain?: boolean };
          if (this.store.kind === 'google-drive' && failure.code === 'CONFLICT' && !failure.uncertain && attempt < 2) {
            try {
              await this.reload();
              continue;
            } catch {
              // không tải lại được: rơi xuống nhánh khoá bên dưới
            }
          }
          if (failure.uncertain || failure.code === 'CONFLICT') this.blocked = true;
          this.logger.error(this.blocked
            ? 'Chưa xác định được dữ liệu trên nơi lưu chính; tạm khoá ghi, thao tác kế tiếp sẽ tải lại dữ liệu trước khi ghi.'
            : 'Không ghi được dữ liệu tài khoản. Thay đổi chưa được xác nhận.');
          throw this.unavailable();
        }
        this.version = nextVersion;
        this.data = draft;
        this.cache(content);
        return structuredClone(result);
      }
    });
    // Một thao tác bị từ chối không làm hỏng toàn bộ hàng đợi.
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  /** Tải lại dữ liệu đã xác nhận trên nơi lưu chính (bỏ mọi giả định trong RAM). */
  private async reload() {
    const remote = await this.store.read();
    this.data = parseDb(remote.content);
    this.version = remote.version;
    this.cache(JSON.stringify(this.data, null, 2));
  }

  /** Sau lỗi không rõ kết quả: Drive tự phục hồi bằng cách đọc lại; local giữ nguyên khoá (phải khởi động lại). */
  private async recover() {
    if (this.store.kind !== 'google-drive') throw this.unavailable();
    try {
      await this.reload();
      this.blocked = false;
      this.logger.log('Đã tải lại dữ liệu từ Google Drive, mở khoá ghi.');
    } catch {
      throw this.unavailable();
    }
  }

  private mergeAccounts(target: DbShape, incoming: DbShape): { added: number; skipped: string[] } {
    let added = 0;
    const skipped: string[] = [];
    const usedNames = new Map<string, string>();
    for (const [id, acc] of Object.entries(target.accounts)) usedNames.set(acc.nameKey, id);
    for (const [id, acc] of Object.entries(incoming.accounts)) {
      const existing = Object.hasOwn(target.accounts, id) ? target.accounts[id] : undefined;
      const nameOwner = usedNames.get(acc.nameKey);
      if (nameOwner && nameOwner !== id) {
        if (!existing || acc.updatedAt > existing.updatedAt) skipped.push(acc.name);
        continue;
      }
      if (!existing || acc.updatedAt > existing.updatedAt) {
        if (existing) usedNames.delete(existing.nameKey);
        target.accounts[id] = structuredClone(acc);
        usedNames.set(acc.nameKey, id);
        added += 1;
      }
    }
    return { added, skipped };
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
      mkdirSync(dirname(this.cacheFile), { recursive: true });
      if (preserveExisting && existsSync(this.cacheFile)) {
        const previous = readFileSync(this.cacheFile, 'utf8');
        if (previous !== content) {
          writeFileSync(`${this.cacheFile}.before-drive-${Date.now()}-${process.pid}.json`, previous, { mode: 0o600, flag: 'wx' });
          this.logger.warn('Đã giữ riêng bản JSON cục bộ trước khi tải dữ liệu Drive.');
        }
      }
      const tmp = `${this.cacheFile}.tmp`;
      writeFileSync(tmp, content, { mode: 0o600 });
      renameSync(tmp, this.cacheFile);
    } catch {
      // Drive đã xác nhận: lỗi bản sao cục bộ không biến một giao dịch đã ghi thành thất bại.
      this.logger.warn('Đã lưu nhưng không cập nhật được bản sao cục bộ.');
    }
  }

  async onModuleDestroy() {
    this.stopping = true;
    await this.queue;
  }
}
