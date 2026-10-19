import type { IncomingMessage } from 'http';

/** Giới hạn tần suất trong bộ nhớ: mỗi khoá tối đa `limit` lần trong `windowMs`. Số khoá có giới hạn để không phình bộ nhớ. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** true = được phép, false = quá nhanh */
  hit(key: string, now = Date.now()): boolean {
    let e = this.hits.get(key);
    if (!e || e.reset <= now) {
      if (e) this.hits.delete(key);
      else if (this.hits.size >= this.maxKeys) this.prune(now);
      e = { n: 0, reset: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.n++;
    return e.n <= this.limit;
  }

  forget(key: string) {
    this.hits.delete(key);
  }

  get size() {
    return this.hits.size;
  }

  private prune(now: number) {
    for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k);
    // vẫn đầy: bỏ các khoá cũ nhất (Map giữ thứ tự thêm vào)
    for (const k of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** IP người gửi. Chỉ tin header của proxy (cloudflared / Vite) khi request đến từ chính máy này. */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket?.remoteAddress ?? '';
  if (LOOPBACK.has(remote)) {
    const cf = req.headers['cf-connecting-ip'];
    const fwd = req.headers['x-forwarded-for'];
    const forwarded = (typeof cf === 'string' && cf) || (typeof fwd === 'string' && fwd.split(',')[0].trim());
    if (forwarded) return forwarded.slice(0, 64);
  }
  return remote || 'unknown';
}
