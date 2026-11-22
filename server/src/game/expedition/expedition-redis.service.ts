import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as net from 'net';

/**
 * Lightweight zero-dependency RESP2 client for local Docker `redis:7-alpine`
 * (`127.0.0.1:6379`) with automatic transparent fallback to bounded in-memory
 * storage when Docker Redis is offline or restarting.
 */
@Injectable()
export class ExpeditionRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpeditionRedisService.name);
  private readonly host = process.env.EXPEDITION_REDIS_HOST ?? '127.0.0.1';
  private readonly port = Number(process.env.EXPEDITION_REDIS_PORT ?? 6379);
  private readonly memFallback = new Map<string, { value: string; expiresAt: number }>();
  private redisAvailable = false;

  async onModuleInit(): Promise<void> {
    this.redisAvailable = await this.pingRedis();
    if (this.redisAvailable) {
      this.logger.log(`Connected to local Docker Redis at ${this.host}:${this.port}`);
    } else {
      this.logger.warn(`Local Redis at ${this.host}:${this.port} unreachable — using InMemoryCacheFallback`);
    }
  }

  onModuleDestroy(): void {
    this.memFallback.clear();
  }

  isRedisLive(): boolean {
    return this.redisAvailable;
  }

  private cleanupExpiredMemory(now = Date.now()): void {
    if (this.memFallback.size < 500) return;
    for (const [k, v] of this.memFallback.entries()) {
      if (v.expiresAt > 0 && v.expiresAt <= now) this.memFallback.delete(k);
    }
  }

  private sendRespCommand(args: string[], timeoutMs = 600): Promise<string | number | null> {
    if (process.env.EXPEDITION_FORCE_MEMORY_REDIS === '1') {
      return Promise.reject(new Error('Forced memory fallback'));
    }
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      let buf = Buffer.alloc(0);

      const finish = (err: Error | null, val?: string | number | null) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (err) reject(err);
        else resolve(val ?? null);
      };

      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => finish(new Error('Redis socket timeout')));
      socket.once('error', (err) => finish(err));

      socket.connect(this.port, this.host, () => {
        const chunks: Buffer[] = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
        for (const a of args) {
          const b = Buffer.from(a, 'utf8');
          chunks.push(Buffer.from(`$${b.length}\r\n`, 'utf8'), b, Buffer.from('\r\n', 'utf8'));
        }
        socket.write(Buffer.concat(chunks));
      });

      socket.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        const str = buf.toString('utf8');
        const firstCrLf = str.indexOf('\r\n');
        if (firstCrLf < 0) return;
        const prefix = str[0];
        const head = str.slice(1, firstCrLf);

        if (prefix === '+') {
          finish(null, head);
        } else if (prefix === '-') {
          finish(new Error(head));
        } else if (prefix === ':') {
          finish(null, Number(head));
        } else if (prefix === '$') {
          const byteLen = Number(head);
          if (byteLen < 0) {
            finish(null, null);
            return;
          }
          const headerBytes = Buffer.byteLength(`$${head}\r\n`, 'utf8');
          if (buf.length < headerBytes + byteLen + 2) return;
          const payload = buf.subarray(headerBytes, headerBytes + byteLen).toString('utf8');
          finish(null, payload);
        }
      });
    });
  }

  async pingRedis(): Promise<boolean> {
    try {
      const res = await this.sendRespCommand(['PING'], 450);
      this.redisAvailable = res === 'PONG';
      return this.redisAvailable;
    } catch {
      this.redisAvailable = false;
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.sendRespCommand(['GET', key]);
      this.redisAvailable = true;
      if (typeof raw === 'string') return JSON.parse(raw) as T;
    } catch {
      this.redisAvailable = false;
    }
    const entry = this.memFallback.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      this.memFallback.delete(key);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const now = Date.now();
    this.cleanupExpiredMemory(now);
    this.memFallback.set(key, {
      value: serialized,
      expiresAt: ttlSeconds > 0 ? now + ttlSeconds * 1000 : 0,
    });
    try {
      await this.sendRespCommand(['SET', key, serialized, 'EX', String(Math.max(1, Math.floor(ttlSeconds)))]);
      this.redisAvailable = true;
    } catch {
      this.redisAvailable = false;
    }
  }

  async del(key: string): Promise<void> {
    this.memFallback.delete(key);
    try {
      await this.sendRespCommand(['DEL', key]);
      this.redisAvailable = true;
    } catch {
      this.redisAvailable = false;
    }
  }

  async acquireLock(lockKey: string, ttlMs = 10_000): Promise<boolean> {
    try {
      const res = await this.sendRespCommand(['SET', lockKey, '1', 'NX', 'PX', String(Math.max(100, ttlMs))]);
      this.redisAvailable = true;
      return res === 'OK';
    } catch {
      this.redisAvailable = false;
      const now = Date.now();
      const existing = this.memFallback.get(lockKey);
      if (existing && existing.expiresAt > now) return false;
      this.memFallback.set(lockKey, { value: '1', expiresAt: now + ttlMs });
      return true;
    }
  }
}
