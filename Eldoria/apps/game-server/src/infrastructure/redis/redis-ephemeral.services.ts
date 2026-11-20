import { Inject, Injectable } from '@nestjs/common';
import { JsonDatabaseEngine } from '../../database/json-database.engine';
import { LocalRedisService } from './local-redis.service';

@Injectable()
export class RedisSessionCacheService {
  constructor(
    @Inject(LocalRedisService) private readonly redis: LocalRedisService,
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
  ) {}

  private key(sessionId: string): string {
    return `eldoria:sess:${sessionId}`;
  }

  public async cacheSession(sessionId: string, sessionData: any, ttlSeconds = 7 * 24 * 3600): Promise<void> {
    await this.redis.set(this.key(sessionId), JSON.stringify(sessionData), ttlSeconds);
  }

  public async getSession(sessionId: string): Promise<any | null> {
    const cached = await this.redis.get(this.key(sessionId));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback to JSON DB
      }
    }
    const persisted = this.db.readEntity<any>(`sessions/${sessionId}.json`);
    if (persisted && !persisted.revokedAt) {
      await this.cacheSession(sessionId, persisted);
    }
    return persisted;
  }

  public async invalidateSession(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }
}

@Injectable()
export class RedisLockoutService {
  private readonly MAX_FAILURES = 5;
  private readonly LOCKOUT_TTL_SEC = 900; // 15 minutes

  constructor(@Inject(LocalRedisService) private readonly redis: LocalRedisService) {}

  private key(identifier: string): string {
    return `eldoria:auth:lockout:${identifier.trim().toLowerCase()}`;
  }

  public async recordFailure(identifier: string): Promise<{ count: number; locked: boolean }> {
    const count = await this.redis.incrWithTtl(this.key(identifier), this.LOCKOUT_TTL_SEC);
    return { count, locked: count >= this.MAX_FAILURES };
  }

  public async isLocked(identifier: string): Promise<boolean> {
    const raw = await this.redis.get(this.key(identifier));
    return raw !== null && Number(raw) >= this.MAX_FAILURES;
  }

  public async clear(identifier: string): Promise<void> {
    await this.redis.del(this.key(identifier));
  }
}

@Injectable()
export class RedisIdempotencyService {
  private readonly TTL_SEC = 24 * 3600;

  constructor(
    @Inject(LocalRedisService) private readonly redis: LocalRedisService,
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
  ) {}

  private key(accountId: string, idemKey: string): string {
    return `eldoria:idem:${accountId}:${idemKey}`;
  }

  public async getReplay(accountId: string, idemKey: string): Promise<any | null> {
    const cached = await this.redis.get(this.key(accountId, idemKey));
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fallback to JSON
      }
    }
    const persisted = this.db.getPersistedIdempotency(accountId, idemKey);
    if (persisted) {
      await this.redis.set(this.key(accountId, idemKey), JSON.stringify(persisted), this.TTL_SEC);
    }
    return persisted;
  }

  public async recordResponse(accountId: string, idemKey: string, response: any): Promise<void> {
    await this.db.savePersistedIdempotency(accountId, idemKey, response, this.TTL_SEC * 1000);
    await this.redis.set(this.key(accountId, idemKey), JSON.stringify(response), this.TTL_SEC);
  }
}

@Injectable()
export class RedisPresenceService {
  constructor(@Inject(LocalRedisService) private readonly redis: LocalRedisService) {}

  public async joinZone(zoneId: string, characterId: string, summary: { name: string; heroId: string }): Promise<void> {
    await this.redis.sadd(`eldoria:presence:zone:${zoneId}`, characterId);
    await this.redis.set(
      `eldoria:presence:char:${characterId}`,
      JSON.stringify({ zoneId, ...summary, seenAt: Date.now() }),
      120,
    );
    await this.redis.publish(
      `eldoria:pubsub:zone:${zoneId}`,
      JSON.stringify({ type: 'JOIN', characterId, ...summary }),
    );
  }

  public async leaveZone(zoneId: string, characterId: string): Promise<void> {
    await this.redis.srem(`eldoria:presence:zone:${zoneId}`, characterId);
    await this.redis.del(`eldoria:presence:char:${characterId}`);
  }

  public async listZoneMembers(zoneId: string): Promise<string[]> {
    return this.redis.smembers(`eldoria:presence:zone:${zoneId}`);
  }

  public async createPartyInvite(inviteId: string, payload: any): Promise<void> {
    await this.redis.set(`eldoria:party:invite:${inviteId}`, JSON.stringify(payload), 60);
  }

  public async getPartyInvite(inviteId: string): Promise<any | null> {
    const raw = await this.redis.get(`eldoria:party:invite:${inviteId}`);
    return raw ? JSON.parse(raw) : null;
  }

  public async consumePartyInvite(inviteId: string): Promise<any | null> {
    const inv = await this.getPartyInvite(inviteId);
    if (inv) await this.redis.del(`eldoria:party:invite:${inviteId}`);
    return inv;
  }
}

@Injectable()
export class RedisRateLimitService {
  constructor(@Inject(LocalRedisService) private readonly redis: LocalRedisService) {}

  public async checkLimit(scope: string, identity: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
    const count = await this.redis.incrWithTtl(`eldoria:rl:${scope}:${identity}`, windowSeconds);
    return count <= maxRequests;
  }
}
