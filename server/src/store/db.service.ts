import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/** Tài khoản người chơi (lưu trong server/data/db.json) */
export interface Account {
  playerId: string;
  name: string;
  /** tên viết thường để tìm khi đăng nhập */
  nameKey: string;
  avatar?: string;
  pinHash: string;
  pinSalt: string;
  /** sha256 của các token đăng nhập (mỗi thiết bị 1 token, giữ tối đa 5) */
  tokens: string[];
  coins: number;
  games: number;
  wins: number;
  /** ngày nhận xu miễn phí gần nhất (YYYY-MM-DD) */
  lastDaily?: string;
  createdAt: number;
  updatedAt: number;
}

interface DbShape {
  version: 1;
  accounts: Record<string, Account>;
}

/** server/data/db.json – "database" JSON cục bộ, ghi file sau mỗi thay đổi (gộp trong 300ms) */
export const DB_FILE = join(__dirname, '..', '..', '..', '..', 'data', 'db.json');

@Injectable()
export class DbService implements OnModuleDestroy {
  private data: DbShape = { version: 1, accounts: {} };
  private timer?: NodeJS.Timeout;

  constructor() {
    if (existsSync(DB_FILE)) {
      try {
        this.data = { version: 1, accounts: {}, ...JSON.parse(readFileSync(DB_FILE, 'utf8')) };
      } catch (e) {
        // file hỏng: giữ bản sao để không mất dữ liệu, chạy tiếp với db rỗng
        renameSync(DB_FILE, `${DB_FILE}.broken-${Date.now()}`);
        console.error('[db] db.json hỏng, đã đổi tên và tạo mới', e);
      }
    }
  }

  get accounts() {
    return this.data.accounts;
  }

  account(playerId: string): Account | undefined {
    return this.data.accounts[playerId];
  }

  findByName(name: string): Account | undefined {
    const key = name.trim().toLowerCase();
    return Object.values(this.data.accounts).find((a) => a.nameKey === key);
  }

  upsert(acc: Account) {
    acc.updatedAt = Date.now();
    this.data.accounts[acc.playerId] = acc;
    this.save();
  }

  /** Ghi file an toàn: ghi ra file tạm rồi đổi tên (không bị hỏng nếu tắt ngang) */
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    mkdirSync(dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, DB_FILE);
  }

  onModuleDestroy() {
    this.flush();
  }
}
