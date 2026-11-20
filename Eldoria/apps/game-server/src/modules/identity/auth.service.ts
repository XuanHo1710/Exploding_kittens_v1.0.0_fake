import crypto from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  LoginDto,
  LoginDtoSchema,
  RegisterDto,
  RegisterDtoSchema,
  UiPreferences,
  UiPreferencesSchema,
} from '@eldoria/shared';
import { JsonDatabaseEngine } from '../../database/json-database.engine';
import { AccountEntity, SessionEntity } from '../../domain/entities';
import {
  RedisLockoutService,
  RedisSessionCacheService,
} from '../../infrastructure/redis/redis-ephemeral.services';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: string[];
  sid: string;
  iat: number;
  exp: number;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function unbase64url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly accessTtlSec = 15 * 60; // 15 min
  private readonly refreshTtlSec = 7 * 24 * 3600; // 7 days

  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(RedisSessionCacheService) private readonly sessionCache: RedisSessionCacheService,
    @Inject(RedisLockoutService) private readonly lockout: RedisLockoutService,
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'eldoria_local_dev_jwt_secret_key_change_in_prod';
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  private verifyPassword(password: string, salt: string, storedHash: string): boolean {
    const candidate = crypto.scryptSync(password, salt, 64);
    const existing = Buffer.from(storedHash, 'hex');
    if (candidate.length !== existing.length) return false;
    return crypto.timingSafeEqual(candidate, existing);
  }

  private sha256(val: string): string {
    return crypto.createHash('sha256').update(val).digest('hex');
  }

  public signJwt(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + this.accessTtlSec;
    const fullPayload: AccessTokenPayload = { ...payload, iat, exp };
    const headerPart = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadPart = base64url(JSON.stringify(fullPayload));
    const sig = base64url(
      crypto.createHmac('sha256', this.jwtSecret).update(`${headerPart}.${payloadPart}`).digest(),
    );
    return `${headerPart}.${payloadPart}.${sig}`;
  }

  public verifyJwt(token: string): AccessTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Malformed access token');
    const [h, p, sig] = parts;
    const expected = base64url(
      crypto.createHmac('sha256', this.jwtSecret).update(`${h}.${p}`).digest(),
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid access token signature');
    }
    const decoded = JSON.parse(unbase64url(p).toString('utf8')) as AccessTokenPayload;
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token expired');
    }
    return decoded;
  }

  private sanitizeAccount(acc: AccountEntity) {
    return {
      id: acc.id,
      username: acc.username,
      email: acc.email,
      roles: acc.roles,
      preferences: acc.preferences,
      createdAt: acc.createdAt,
      lastLoginAt: acc.lastLoginAt,
    };
  }

  public async register(rawDto: unknown) {
    const parsed = RegisterDtoSchema.safeParse(rawDto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const dto: RegisterDto = parsed.data;
    const emailKey = dto.email.trim().toLowerCase();
    const userKey = dto.username.trim().toLowerCase();

    const byEmail = this.db.readIndex('accounts-by-email');
    const byUser = this.db.readIndex('accounts-by-username');
    if (byEmail[emailKey]) throw new ConflictException('Email is already registered');
    if (byUser[userKey]) throw new ConflictException('Username is already taken');

    const accountId = `acc_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const salt = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    const account: AccountEntity = {
      id: accountId,
      username: dto.username.trim(),
      email: emailKey,
      passwordSalt: salt,
      passwordHash: this.hashPassword(dto.password, salt),
      roles: ['PLAYER'],
      preferences: UiPreferencesSchema.parse({}),
      createdAt: now,
      lastLoginAt: now,
    };

    const { session, refreshToken } = this.createSessionObject(accountId);
    const nextByEmail = { ...byEmail, [emailKey]: accountId };
    const nextByUser = { ...byUser, [userKey]: accountId };
    const byToken = this.db.readIndex('sessions-by-token-hash');
    const nextByToken = { ...byToken, [session.refreshTokenHash]: session.id };

    await this.db.runTransaction([
      { relPath: `accounts/${accountId}.json`, op: 'UPSERT', entityType: 'ACCOUNT', entityId: accountId, data: account },
      { relPath: `sessions/${session.id}.json`, op: 'UPSERT', entityType: 'SESSION', entityId: session.id, data: session },
      { relPath: 'indexes/accounts-by-email.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'accounts-by-email', data: nextByEmail },
      { relPath: 'indexes/accounts-by-username.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'accounts-by-username', data: nextByUser },
      { relPath: 'indexes/sessions-by-token-hash.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'sessions-by-token-hash', data: nextByToken },
    ]);

    await this.sessionCache.cacheSession(session.id, session, this.refreshTtlSec);
    const accessToken = this.signJwt({
      sub: account.id,
      username: account.username,
      roles: account.roles,
      sid: session.id,
    });

    return {
      account: this.sanitizeAccount(account),
      accessToken,
      refreshToken,
      expiresInSec: this.accessTtlSec,
    };
  }

  public async login(rawDto: unknown) {
    const parsed = LoginDtoSchema.safeParse(rawDto);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const dto: LoginDto = parsed.data;
    const key = dto.identifier.trim().toLowerCase();

    if (await this.lockout.isLocked(key)) {
      throw new ForbiddenException('Account temporarily locked due to repeated failed logins. Try again in 15 minutes.');
    }

    const byEmail = this.db.readIndex('accounts-by-email');
    const byUser = this.db.readIndex('accounts-by-username');
    const accountId = byEmail[key] || byUser[key];
    if (!accountId) {
      await this.lockout.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    const account = this.db.readEntity<AccountEntity>(`accounts/${accountId}.json`);
    if (!account || !this.verifyPassword(dto.password, account.passwordSalt, account.passwordHash)) {
      await this.lockout.recordFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.lockout.clear(key);
    account.lastLoginAt = new Date().toISOString();
    const { session, refreshToken } = this.createSessionObject(account.id);
    const byToken = this.db.readIndex('sessions-by-token-hash');
    const nextByToken = { ...byToken, [session.refreshTokenHash]: session.id };

    await this.db.runTransaction([
      { relPath: `accounts/${account.id}.json`, op: 'UPSERT', entityType: 'ACCOUNT', entityId: account.id, data: account },
      { relPath: `sessions/${session.id}.json`, op: 'UPSERT', entityType: 'SESSION', entityId: session.id, data: session },
      { relPath: 'indexes/sessions-by-token-hash.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'sessions-by-token-hash', data: nextByToken },
    ]);

    await this.sessionCache.cacheSession(session.id, session, this.refreshTtlSec);
    const accessToken = this.signJwt({
      sub: account.id,
      username: account.username,
      roles: account.roles,
      sid: session.id,
    });

    return {
      account: this.sanitizeAccount(account),
      accessToken,
      refreshToken,
      expiresInSec: this.accessTtlSec,
    };
  }

  public async refresh(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokenHash = this.sha256(refreshToken);
    const byToken = this.db.readIndex('sessions-by-token-hash');
    const sessionId = byToken[tokenHash];
    if (!sessionId) throw new UnauthorizedException('Invalid or rotated refresh token');

    const oldSession = (await this.sessionCache.getSession(sessionId)) as SessionEntity | null;
    if (!oldSession || oldSession.revokedAt || new Date(oldSession.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const account = this.db.readEntity<AccountEntity>(`accounts/${oldSession.accountId}.json`);
    if (!account) throw new UnauthorizedException('Account not found');

    oldSession.revokedAt = new Date().toISOString();
    const { session: nextSession, refreshToken: nextRefreshToken } = this.createSessionObject(account.id);
    const nextByToken = { ...byToken };
    delete nextByToken[tokenHash];
    nextByToken[nextSession.refreshTokenHash] = nextSession.id;

    await this.db.runTransaction([
      { relPath: `sessions/${oldSession.id}.json`, op: 'UPSERT', entityType: 'SESSION', entityId: oldSession.id, data: oldSession },
      { relPath: `sessions/${nextSession.id}.json`, op: 'UPSERT', entityType: 'SESSION', entityId: nextSession.id, data: nextSession },
      { relPath: 'indexes/sessions-by-token-hash.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'sessions-by-token-hash', data: nextByToken },
    ]);

    await this.sessionCache.invalidateSession(oldSession.id);
    await this.sessionCache.cacheSession(nextSession.id, nextSession, this.refreshTtlSec);

    const accessToken = this.signJwt({
      sub: account.id,
      username: account.username,
      roles: account.roles,
      sid: nextSession.id,
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresInSec: this.accessTtlSec,
    };
  }

  public async logout(sessionId: string): Promise<{ ok: true }> {
    const session = this.db.readEntity<SessionEntity>(`sessions/${sessionId}.json`);
    if (session && !session.revokedAt) {
      session.revokedAt = new Date().toISOString();
      const byToken = this.db.readIndex('sessions-by-token-hash');
      const nextByToken = { ...byToken };
      delete nextByToken[session.refreshTokenHash];
      await this.db.runTransaction([
        { relPath: `sessions/${session.id}.json`, op: 'UPSERT', entityType: 'SESSION', entityId: session.id, data: session },
        { relPath: 'indexes/sessions-by-token-hash.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'sessions-by-token-hash', data: nextByToken },
      ]);
    }
    await this.sessionCache.invalidateSession(sessionId);
    return { ok: true };
  }

  public getPreferences(accountId: string): UiPreferences {
    const acc = this.db.readEntity<AccountEntity>(`accounts/${accountId}.json`);
    if (!acc) throw new UnauthorizedException('Account not found');
    return acc.preferences;
  }

  public async updatePreferences(accountId: string, raw: unknown): Promise<UiPreferences> {
    const acc = this.db.readEntity<AccountEntity>(`accounts/${accountId}.json`);
    if (!acc) throw new UnauthorizedException('Account not found');
    const merged = UiPreferencesSchema.parse({ ...acc.preferences, ...(raw as Record<string, unknown>) });
    acc.preferences = merged;
    await this.db.writeEntity(`accounts/${accountId}.json`, 'ACCOUNT', accountId, acc);
    return merged;
  }

  private createSessionObject(accountId: string): { session: SessionEntity; refreshToken: string } {
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const session: SessionEntity = {
      id: `ses_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      accountId,
      refreshTokenHash: this.sha256(refreshToken),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.refreshTtlSec * 1000).toISOString(),
      revokedAt: null,
    };
    return { session, refreshToken };
  }
}
