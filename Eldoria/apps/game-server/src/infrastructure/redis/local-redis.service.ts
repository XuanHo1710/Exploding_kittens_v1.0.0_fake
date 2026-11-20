import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

interface RamEntry {
  value: string;
  expiresAt: number | null;
}

@Injectable()
export class LocalRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocalRedisService.name);
  private client: Redis | null = null;
  private mode: 'CONNECTED' | 'RAM_FALLBACK' | 'DISABLED' = 'RAM_FALLBACK';
  private readonly ramStore = new Map<string, RamEntry>();
  private readonly ramSets = new Map<string, Set<string>>();
  private readonly pubSubHandlers = new Map<string, Set<(msg: string) => void>>();

  async onModuleInit(): Promise<void> {
    if (process.env.REDIS_ENABLED === 'false') {
      this.mode = 'DISABLED';
      this.logger.log('Local Redis disabled via REDIS_ENABLED=false; using RAM_FALLBACK');
      return;
    }
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      const redis = new Redis(url, {
        lazyConnect: true,
        connectTimeout: 800,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });
      redis.on('error', () => {
        if (this.mode === 'CONNECTED') {
          this.logger.warn('Local Redis disconnected; switching transparently to RAM_FALLBACK');
          this.mode = 'RAM_FALLBACK';
        }
      });
      await redis.connect();
      await redis.ping();
      this.client = redis;
      this.mode = 'CONNECTED';
      this.logger.log(`Connected to local Docker Redis at ${url}`);
      await this.checkMemoryBudget();
    } catch {
      this.mode = 'RAM_FALLBACK';
      this.logger.warn(`Local Docker Redis unavailable at ${url}; operating in degraded RAM_FALLBACK mode (Zero-Data-Loss JSON Primary DB unaffected)`);
      if (this.client) {
        try {
          this.client.disconnect();
        } catch {
          // ignore
        }
        this.client = null;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
      this.client = null;
    }
  }

  public getMode(): 'CONNECTED' | 'RAM_FALLBACK' | 'DISABLED' {
    return this.mode;
  }

  public async pingLatencyMs(): Promise<number | null> {
    if (this.mode !== 'CONNECTED' || !this.client) return null;
    const t0 = performance.now();
    try {
      await this.client.ping();
      return Number((performance.now() - t0).toFixed(2));
    } catch {
      this.mode = 'RAM_FALLBACK';
      return null;
    }
  }

  public async checkMemoryBudget(): Promise<{ usedBytes: number; maxBytes: number; ratio: number } | null> {
    if (this.mode !== 'CONNECTED' || !this.client) return null;
    try {
      const info = await this.client.info('memory');
      const usedMatch = info.match(/used_memory:(\d+)/);
      const maxMatch = info.match(/maxmemory:(\d+)/);
      const usedBytes = usedMatch ? Number(usedMatch[1]) : 0;
      const maxBytes = maxMatch && Number(maxMatch[1]) > 0 ? Number(maxMatch[1]) : 256 * 1024 * 1024;
      const ratio = usedBytes / maxBytes;
      if (ratio > 0.8) {
        this.logger.warn(`Local Redis memory usage ${(ratio * 100).toFixed(1)}% exceeds 80% threshold!`);
      }
      return { usedBytes, maxBytes, ratio };
    } catch {
      return null;
    }
  }

  private getRam(key: string): string | null {
    const e = this.ramStore.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.ramStore.delete(key);
      return null;
    }
    return e.value;
  }

  public async get(key: string): Promise<string | null> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    return this.getRam(key);
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.client.set(key, value, 'EX', Math.ceil(ttlSeconds));
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    this.ramStore.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  public async del(key: string): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        await this.client.del(key);
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    this.ramStore.delete(key);
  }

  public async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        const val = await this.client.incr(key);
        if (val === 1) {
          await this.client.expire(key, Math.ceil(ttlSeconds));
        }
        return val;
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    const existing = this.getRam(key);
    const next = (existing ? Number(existing) : 0) + 1;
    const prevEntry = this.ramStore.get(key);
    const expiresAt = prevEntry && prevEntry.expiresAt && prevEntry.expiresAt > Date.now()
      ? prevEntry.expiresAt
      : Date.now() + ttlSeconds * 1000;
    this.ramStore.set(key, { value: String(next), expiresAt });
    return next;
  }

  public async sadd(key: string, member: string): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        await this.client.sadd(key, member);
        return;
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    const s = this.ramSets.get(key) || new Set<string>();
    s.add(member);
    this.ramSets.set(key, s);
  }

  public async srem(key: string, member: string): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        await this.client.srem(key, member);
        return;
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    const s = this.ramSets.get(key);
    if (s) s.delete(member);
  }

  public async smembers(key: string): Promise<string[]> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        return await this.client.smembers(key);
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    return [...(this.ramSets.get(key) || [])];
  }

  public async publish(channel: string, payload: string): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        await this.client.publish(channel, payload);
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    const handlers = this.pubSubHandlers.get(channel);
    if (handlers) {
      for (const h of handlers) h(payload);
    }
  }

  public subscribeLocal(channel: string, handler: (msg: string) => void): () => void {
    const set = this.pubSubHandlers.get(channel) || new Set();
    set.add(handler);
    this.pubSubHandlers.set(channel, set);
    return () => set.delete(handler);
  }

  /**
   * Simulates Redis FLUSHALL / container restart — verifies Constitution v2.0.0 Zero-Data-Loss
   */
  public async flushEphemeralCache(): Promise<void> {
    if (this.mode === 'CONNECTED' && this.client) {
      try {
        await this.client.flushall();
      } catch {
        this.mode = 'RAM_FALLBACK';
      }
    }
    this.ramStore.clear();
    this.ramSets.clear();
  }
}
