import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { isValidAvatar, type AccountInfo } from '../../../shared/src';
import { Account, DbService } from './db.service';

export const START_COINS = 1000;
export const DAILY_COINS = 500;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class AccountsService {
  /** chống dò PIN: sai 5 lần thì khoá 60 giây theo tên */
  private fails = new Map<string, { n: number; until: number }>();

  constructor(private readonly db: DbService) {}

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
  register(playerId: unknown, rawName: unknown, rawPin: unknown, avatar?: unknown) {
    if (typeof playerId !== 'string' || !/^[\w-]{8,64}$/.test(playerId)) throw new HttpException('playerId không hợp lệ', HttpStatus.BAD_REQUEST);
    const name = String(rawName ?? '').trim().slice(0, 20);
    if (!name) throw new HttpException('Nhập tên đã', HttpStatus.BAD_REQUEST);
    const pin = this.checkPin(rawPin);
    if (this.db.account(playerId)) throw new HttpException('Bạn đã có tài khoản, đăng nhập bằng PIN nhé', HttpStatus.CONFLICT);
    const taken = this.db.findByName(name);
    if (taken) throw new HttpException(`Tên "${name}" đã có người dùng. Đăng nhập bằng PIN hoặc chọn tên khác`, HttpStatus.CONFLICT);
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
    this.db.upsert(acc);
    return { token, account: this.info(acc) };
  }

  login(rawName: unknown, rawPin: unknown) {
    const name = String(rawName ?? '').trim();
    const key = name.toLowerCase();
    const f = this.fails.get(key);
    if (f && f.until > Date.now()) throw new HttpException(`Sai PIN nhiều lần, thử lại sau ${Math.ceil((f.until - Date.now()) / 1000)}s`, HttpStatus.TOO_MANY_REQUESTS);
    const pin = this.checkPin(rawPin);
    const acc = this.db.findByName(name);
    const ok = acc && timingSafeEqual(Buffer.from(hashPin(pin, acc.pinSalt), 'hex'), Buffer.from(acc.pinHash, 'hex'));
    if (!acc || !ok) {
      const n = (f?.n ?? 0) + 1;
      this.fails.set(key, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      throw new HttpException('Sai tên hoặc mã PIN', HttpStatus.UNAUTHORIZED);
    }
    this.fails.delete(key);
    const token = this.issueToken(acc);
    this.db.upsert(acc);
    return { token, account: this.info(acc) };
  }

  /** token gửi kèm socket → đúng thì người này "đã đăng nhập" (được dùng xu) */
  verify(playerId: string, token: unknown): Account | undefined {
    const acc = this.db.account(playerId);
    if (!acc || typeof token !== 'string' || !token) return undefined;
    return acc.tokens.includes(sha(token)) ? acc : undefined;
  }

  logout(playerId: string, token: string) {
    const acc = this.db.account(playerId);
    if (!acc) return;
    acc.tokens = acc.tokens.filter((t) => t !== sha(token));
    this.db.upsert(acc);
  }

  claimDaily(playerId: string) {
    const acc = this.db.account(playerId);
    if (!acc) throw new Error('no account');
    if (acc.lastDaily === today()) return false;
    acc.lastDaily = today();
    acc.coins += DAILY_COINS;
    this.db.upsert(acc);
    return true;
  }

  /** Đổi tên/avatar theo hồ sơ (tên trùng người khác thì giữ tên cũ trong tài khoản) */
  updateProfile(playerId: string, name: string, avatar?: string) {
    const acc = this.db.account(playerId);
    if (!acc) return;
    const other = this.db.findByName(name);
    if (!other || other.playerId === playerId) {
      acc.name = name;
      acc.nameKey = name.toLowerCase();
    }
    acc.avatar = avatar;
    this.db.upsert(acc);
  }

  /** Trừ / cộng xu (amount âm = trừ). Trả về false nếu không đủ xu */
  addCoins(playerId: string, amount: number, stat?: 'game' | 'win') {
    const acc = this.db.account(playerId);
    if (!acc || acc.coins + amount < 0) return false;
    acc.coins += amount;
    if (stat === 'game') acc.games++;
    if (stat === 'win') acc.wins++;
    this.db.upsert(acc);
    return true;
  }
}
