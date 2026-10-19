import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { DriveJsonStore } from './drive-json.store';

export const ACCOUNT_STORE = Symbol('ACCOUNT_STORE');

export interface AccountStore {
  readonly kind: 'local' | 'google-drive';
  /** Bản sao cục bộ khi dùng Drive (mặc định server/data/db.json); test truyền thư mục tạm */
  readonly cacheFile?: string;
  read(): Promise<{ content: string; version: string }>;
  write(content: string, expectedVersion: string): Promise<string>;
}

const digest = (content: string) => createHash('sha256').update(content).digest('hex');

/** Chế độ cục bộ dành cho dev; không tự chuyển sang chế độ này khi Drive lỗi. */
export class LocalJsonStore implements AccountStore {
  readonly kind = 'local';

  constructor(private readonly file: string) {}

  async read() {
    try {
      const content = readFileSync(this.file, 'utf8');
      return { content, version: digest(content) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { content: '{"version":1,"accounts":{}}', version: 'missing' };
    }
  }

  async write(content: string, expectedVersion: string) {
    const current = await this.read();
    if (current.version !== expectedVersion) {
      throw Object.assign(new Error('File tài khoản đã được tiến trình khác thay đổi.'), { code: 'CONFLICT' });
    }
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, content, { mode: 0o600 });
    renameSync(tmp, this.file);
    return digest(content);
  }
}

export function createAccountStore(localFile: string): AccountStore {
  // Có ID Drive nhưng quên chọn chế độ sẽ không âm thầm dùng DB local.
  const mode = process.env.ACCOUNT_STORAGE?.trim() || (process.env.GOOGLE_DRIVE_DB_FILE_ID ? 'google-drive' : 'local');
  if (mode === 'local') return new LocalJsonStore(localFile);
  if (mode === 'google-drive') {
    const drive = new DriveJsonStore();
    return { kind: 'google-drive', read: () => drive.read(), write: (content, version) => drive.write(content, version) };
  }
  throw new Error('ACCOUNT_STORAGE chỉ nhận local hoặc google-drive.');
}
