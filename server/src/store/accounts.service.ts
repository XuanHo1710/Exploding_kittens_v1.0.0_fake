import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { isValidAvatar, type AccountInfo } from '../../../shared/src';
import { Account, DbService, type DbShape } from './db.service';

export const START_COINS = 1000;
export const DAILY_COINS = 500;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);
const findByName = (db: DbShape, name: string) => Object.values(db.accounts).find((a) => a.nameKey === name.trim().toLowerCase());
const accountIn = (db: DbShape, id: string) => Object.hasOwn(db.accounts, id) ? db.accounts[id] : undefined;
const touch = (acc: Account) => { acc.updatedAt = Date.now(); };

@Injectable()
export class AccountsService {
  /** chống dò PIN: sai 5 lần thì khoá 60 giây theo tên */
  private fails = new Map<string, { n: number; until: number }>();

  constructor(private readonly db: DbService) {}

  get(playerId: string) {
    return this.db.account(playerId);
  }

  info(a: Account): AccountInfo {
    return { playerId: a.playerId, name: a.name, avatar: a.avatar, coins: a.coins, games: a.games, wins: a.wins, canClaimDaily: a.lastDaily !== today() };
  }

  private issueToken(a: Account) {
    const token = randomBytes(24).toString('hex');
    a.tokens = [sha(token), ...a.tokens].slice(0, 5);
    return token;
  }

  private checkPin(pin: unknown) {
    if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) throw new HttpException('Mã PIN gồm 4–6 chữ số', HttpStatus.BAD_REQUEST);
    return pin;
  }

  /** Tạo tài khoản (hoặc đặt PIN cho người chơi cũ chưa có tài khoản, giữ nguyên playerId) */
  async register(playerId: unknown, rawName: unknown, rawPin: unknown, avatar?: unknown) {
    if (typeof playerId !== 'string' || !/^[\w-]{8,64}$/.test(playerId) || ['__proto__', 'constructor', 'prototype'].includes(playerId)) throw new HttpException('playerId không hợp lệ', HttpStatus.BAD_REQUEST);
    const name = String(rawName ?? '').trim().slice(0, 20);
    if (!name) throw new HttpException('Nhập tên đã', HttpStatus.BAD_REQUEST);
    const pin = this.checkPin(rawPin);
    const salt = randomBytes(12).toString('hex');
    const now = Date.now();
    const acc: Account = {
      playerId,
      name,
      nameKey: name.toLowerCase(),
      avatar: isValidAvatar(avatar) ? avatar : undefined,
      pinSalt: salt,
      pinHash: hashPin(pin, salt),
      tokens: [],
      coins: START_COINS,
      games: 0,
      wins: 0,
      createdAt: now,
      updatedAt: now,
    };
    const token = this.issueToken(acc);
    return this.db.transaction((db) => {
      if (accountIn(db, playerId)) throw new HttpException('Bạn đã có tài khoản, đăng nhập bằng PIN nhé', HttpStatus.CONFLICT);
      if (findByName(db, name)) throw new HttpException(`Tên "${name}" đã có người dùng. Đăng nhập bằng PIN hoặc chọn tên khác`, HttpStatus.CONFLICT);
      db.accounts[playerId] = acc;
      return { token, account: this.info(acc) };
    });
  }

  async login(rawName: unknown, rawPin: unknown) {
    const name = String(rawName ?? '').trim();
    const key = name.toLowerCase();
    const pin = this.checkPin(rawPin);
    return this.db.transaction((db) => {
      const f = this.fails.get(key);
      if (f && f.until > Date.now()) throw new HttpException(`Sai PIN nhiều lần, thử lại sau ${Math.ceil((f.until - Date.now()) / 1000)}s`, HttpStatus.TOO_MANY_REQUESTS);
      const acc = findByName(db, name);
      const ok = acc && timingSafeEqual(Buffer.from(hashPin(pin, acc.pinSalt), 'hex'), Buffer.from(acc.pinHash, 'hex'));
      if (!acc || !ok) {
        const n = f?.until && f.until <= Date.now() ? 1 : (f?.n ?? 0) + 1;
        this.fails.set(key, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
        throw new HttpException('Sai tên hoặc mã PIN', HttpStatus.UNAUTHORIZED);
      }
      this.fails.delete(key);
      const token = this.issueToken(acc);
      touch(acc);
      return { token, account: this.info(acc) };
    });
  }

  /** token gửi kèm socket → đúng thì người này "đã đăng nhập" (được dùng xu) */
  verify(playerId: string, token: unknown): Account | undefined {
    const acc = this.db.account(playerId);
    if (!acc || typeof token !== 'string' || !token) return undefined;
    return acc.tokens.includes(sha(token)) ? acc : undefined;
  }

  async logout(playerId: string, token: string) {
    return this.db.transaction((db) => {
      const acc = accountIn(db, playerId);
      if (!acc) return;
      acc.tokens = acc.tokens.filter((t) => t !== sha(token));
      touch(acc);
    });
  }

  async claimDaily(playerId: string) {
    return this.db.transaction((db) => {
      const acc = accountIn(db, playerId);
      if (!acc) throw new HttpException('Tài khoản không tồn tại.', HttpStatus.NOT_FOUND);
      if (acc.lastDaily === today()) return false;
      acc.lastDaily = today();
      acc.coins += DAILY_COINS;
      touch(acc);
      return true;
    });
  }

  /** Đổi tên/avatar theo hồ sơ (tên trùng người khác thì giữ tên cũ trong tài khoản) */
  async updateProfile(playerId: string, rawName: string, avatar?: string) {
    const name = rawName.trim().slice(0, 20);
    if (!name || (avatar !== undefined && !isValidAvatar(avatar))) throw new HttpException('Hồ sơ không hợp lệ.', HttpStatus.BAD_REQUEST);
    return this.db.transaction((db) => {
      const acc = accountIn(db, playerId);
      if (!acc) return undefined;
      const other = findByName(db, name);
      if (other && other.playerId !== playerId) throw new HttpException('Tên này đã có người sử dụng.', HttpStatus.CONFLICT);
      acc.name = name;
      acc.nameKey = name.toLowerCase();
      acc.avatar = avatar;
      touch(acc);
      return this.info(acc);
    });
  }

  /** Trừ / cộng xu (amount âm = trừ). Trả về false nếu không đủ xu */
  async addCoins(playerId: string, amount: number, stat?: 'game' | 'win') {
    if (!Number.isSafeInteger(amount)) throw new HttpException('Số xu không hợp lệ.', HttpStatus.BAD_REQUEST);
    return this.db.transaction((db) => {
      const acc = accountIn(db, playerId);
      if (!acc || !Number.isSafeInteger(acc.coins + amount) || acc.coins + amount < 0) return false;
      acc.coins += amount;
      if (stat === 'game') acc.games++;
      if (stat === 'win') acc.wins++;
      touch(acc);
      return true;
    });
  }

  /** Trừ cược và tăng số ván cho cả bàn trong một lần ghi JSON. */
  async chargeGame(playerIds: string[], bet: number) {
    this.checkGameAmount(playerIds, bet);
    return this.db.transaction((db) => {
      const accounts = playerIds.map((id) => accountIn(db, id));
      for (const acc of accounts) {
        if (bet > 0 && !acc) throw new HttpException('Ván có cược cần tài khoản PIN.', HttpStatus.BAD_REQUEST);
        if (acc && acc.coins < bet) throw new HttpException(`${acc.name} không đủ ${bet} xu.`, HttpStatus.BAD_REQUEST);
      }
      for (const acc of accounts) {
        if (!acc) continue;
        acc.coins -= bet;
        acc.games++;
        touch(acc);
      }
    });
  }

  /** Hoàn tác cả bàn nếu chưa thể bắt đầu ván sau khi đã ghi khoản cược. */
  async refundGame(playerIds: string[], bet: number) {
    this.checkGameAmount(playerIds, bet);
    return this.db.transaction((db) => {
      for (const id of playerIds) {
        const acc = accountIn(db, id);
        if (!acc) continue;
        acc.coins += bet;
        acc.games = Math.max(0, acc.games - 1);
        touch(acc);
      }
    });
  }

  async rewardWinner(playerId: string, pot: number) {
    if (!Number.isSafeInteger(pot) || pot < 0) throw new HttpException('Hũ xu không hợp lệ.', HttpStatus.BAD_REQUEST);
    return this.addCoins(playerId, pot, 'win');
  }

  /** Trả thưởng cho một hoặc nhiều người chơi (dùng cho Xì Dách 21 và Tiến Lên). */
  async rewardPayouts(payouts: Record<string, number>, winnerIds: string[]) {
    return this.db.transaction((db) => {
      const winSet = new Set(winnerIds);
      for (const [playerId, amount] of Object.entries(payouts)) {
        if (!Number.isSafeInteger(amount) || amount < 0) continue;
        const acc = accountIn(db, playerId);
        if (!acc) continue;
        acc.coins += amount;
        if (winSet.has(playerId)) acc.wins++;
        touch(acc);
      }
      return true;
    });
  }

  private checkGameAmount(playerIds: string[], bet: number) {
    if (!Number.isSafeInteger(bet) || bet < 0 || new Set(playerIds).size !== playerIds.length) {
      throw new HttpException('Dữ liệu cược không hợp lệ.', HttpStatus.BAD_REQUEST);
    }
  }
}
