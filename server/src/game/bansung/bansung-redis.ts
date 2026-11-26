/**
 * server/src/game/bansung/bansung-redis.ts
 *
 * Lớp Redis cho Bắn Súng Co-op "Đêm Zombie" (spec 007 / d06-redis-architecture).
 *
 * NGUYÊN TẮC VÀNG: Redis KHÔNG BAO GIỜ nằm trên đường nóng 30 Hz.
 * Vòng tick mô phỏng chạy hoàn toàn trong RAM của tiến trình Node; mọi lệnh Redis
 * là fire-and-forget, được gom (pipeline) trên MỘT kết nối TCP bền, có hàng đợi giới hạn.
 * Redis chết / chậm → game vẫn chạy bình thường (fallback bộ nhớ), không giật lag.
 *
 * Redis dùng để:
 *  1. Session routing  `bansung:session:<playerId>` → mã phòng (TTL 15') — vào lại đúng phòng
 *     sau khi rớt mạng / F5, kể cả khi chạy nhiều instance sau load balancer.
 *  2. Checkpoint phòng `bansung:room:<code>` (mỗi 2 s, TTL 15') — wave, thời gian, đội hình;
 *     dùng cho trang theo dõi / khôi phục thông tin sau sự cố.
 *  3. Bảng xếp hạng    `bansung:lb:<mode>:<difficulty>` (ZSET) — điểm cao nhất mỗi người.
 *  4. Thống kê realtime `bansung:stats` (HINCRBY) — số trận, zombie bị hạ, boss bị hạ.
 *
 * Kích hoạt bằng biến môi trường: `BANSUNG_REDIS_URL=redis://127.0.0.1:6379` (có thể kèm
 * `redis://:password@host:port/db`). Không đặt biến → module ở chế độ bộ nhớ (no-op an toàn).
 * Không phụ thuộc package ngoài: client RESP2 tối giản dựng trên `net`.
 */
import * as net from 'net';

type RespValue = string | number | null | RespValue[];

interface PendingReply {
  resolve: (v: RespValue) => void;
  reject: (e: Error) => void;
}

const MAX_QUEUE = 512;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15_000;
const CMD_TIMEOUT_MS = 1500;

export const BANSUNG_REDIS_KEYS = {
  session: (playerId: string) => `bansung:session:${playerId}`,
  room: (code: string) => `bansung:room:${code}`,
  leaderboard: (mode: string, difficulty: string) => `bansung:lb:${mode}:${difficulty}`,
  leaderboardNames: 'bansung:lb:names',
  stats: 'bansung:stats',
} as const;

function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const b = Buffer.from(String(a), 'utf8');
    parts.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n'));
  }
  return Buffer.concat(parts);
}

/** Parser RESP2 tăng dần: trả [value, bytesConsumed] hoặc null nếu chưa đủ dữ liệu. */
function parseResp(buf: Buffer, offset: number): [RespValue | Error, number] | null {
  if (offset >= buf.length) return null;
  const lineEnd = buf.indexOf('\r\n', offset);
  if (lineEnd < 0) return null;
  const prefix = String.fromCharCode(buf[offset]);
  const head = buf.toString('utf8', offset + 1, lineEnd);
  const next = lineEnd + 2;
  switch (prefix) {
    case '+':
      return [head, next];
    case '-':
      return [new Error(head), next];
    case ':':
      return [Number(head), next];
    case '$': {
      const len = Number(head);
      if (len < 0) return [null, next];
      if (buf.length < next + len + 2) return null;
      return [buf.toString('utf8', next, next + len), next + len + 2];
    }
    case '*': {
      const count = Number(head);
      if (count < 0) return [null, next];
      const out: RespValue[] = [];
      let cur = next;
      for (let i = 0; i < count; i++) {
        const r = parseResp(buf, cur);
        if (!r) return null;
        const [v, n] = r;
        out.push(v instanceof Error ? null : v);
        cur = n;
      }
      return [out, cur];
    }
    default:
      return [new Error(`RESP: prefix lạ ${prefix}`), next];
  }
}

export interface BansungMatchRecord {
  readonly mode: string;
  readonly difficulty: string;
  readonly victory: boolean;
  readonly wave: number;
  readonly elapsedMs: number;
  readonly players: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly score: number;
    readonly kills?: number;
    readonly bot?: boolean;
  }>;
  readonly bossKills?: number;
}

export class BansungRedis {
  private socket: net.Socket | null = null;
  private connected = false;
  private connecting = false;
  private rx: Buffer = Buffer.alloc(0);
  private readonly pending: PendingReply[] = [];
  private readonly outbox: Buffer[] = [];
  private reconnectMs = RECONNECT_MIN_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly lastRoomCheckpointAt = new Map<string, number>();
  /** Fallback khi Redis tắt: bảng xếp hạng trong RAM (giới hạn 200 dòng / bảng). */
  private readonly memLeaderboard = new Map<string, Map<string, { name: string; score: number }>>();

  constructor(
    private readonly host: string | null,
    private readonly port: number,
    private readonly password: string | null,
    private readonly db: number,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): BansungRedis {
    const raw = env.BANSUNG_REDIS_URL?.trim();
    if (!raw) return new BansungRedis(null, 0, null, 0);
    try {
      const u = new URL(raw);
      const db = Number((u.pathname || '/0').slice(1)) || 0;
      return new BansungRedis(u.hostname || '127.0.0.1', Number(u.port) || 6379, u.password || null, db);
    } catch {
      console.warn('[bansung-redis] BANSUNG_REDIS_URL không hợp lệ — dùng chế độ bộ nhớ.');
      return new BansungRedis(null, 0, null, 0);
    }
  }

  get enabled(): boolean {
    return this.host !== null;
  }

  get live(): boolean {
    return this.connected;
  }

  // ------------------------------------------------------------------------
  // Kết nối bền + pipeline
  // ------------------------------------------------------------------------

  private ensureConnected(): void {
    if (!this.enabled || this.connected || this.connecting || this.reconnectTimer) return;
    this.connecting = true;
    const sock = new net.Socket();
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 10_000);
    this.socket = sock;
    sock.on('data', (chunk: Buffer) => this.onData(chunk));
    sock.on('error', () => undefined);
    sock.on('close', () => this.onClose());
    sock.connect(this.port, this.host as string, () => {
      this.connecting = false;
      this.connected = true;
      this.reconnectMs = RECONNECT_MIN_MS;
      // AUTH/SELECT phải đi TRƯỚC mọi lệnh đang chờ trong outbox → chèn handler lên đầu hàng `pending`.
      const preamble: (string | number)[][] = [];
      if (this.password) preamble.push(['AUTH', this.password]);
      if (this.db) preamble.push(['SELECT', this.db]);
      for (let i = preamble.length - 1; i >= 0; i--) {
        this.pending.unshift({ resolve: () => undefined, reject: () => undefined });
      }
      for (const cmd of preamble) sock.write(encodeCommand(cmd));
      while (this.outbox.length > 0) sock.write(this.outbox.shift() as Buffer);
    });
  }

  private onClose(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.connecting = false;
    this.socket = null;
    this.rx = Buffer.alloc(0);
    // Bỏ các frame chưa gửi: handler của chúng bị reject ngay dưới đây, gửi lại sẽ lệch thứ tự reply.
    this.outbox.length = 0;
    while (this.pending.length > 0) this.pending.shift()?.reject(new Error('Redis đóng kết nối'));
    if (wasConnected) console.warn('[bansung-redis] mất kết nối, sẽ thử lại…');
    if (!this.enabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, this.reconnectMs);
    this.reconnectTimer.unref?.();
    this.reconnectMs = Math.min(RECONNECT_MAX_MS, this.reconnectMs * 2);
  }

  private onData(chunk: Buffer): void {
    this.rx = this.rx.length === 0 ? chunk : Buffer.concat([this.rx, chunk]);
    let off = 0;
    for (;;) {
      const r = parseResp(this.rx, off);
      if (!r) break;
      const [val, next] = r;
      off = next;
      const p = this.pending.shift();
      if (!p) continue;
      if (val instanceof Error) p.reject(val);
      else p.resolve(val);
    }
    this.rx = off >= this.rx.length ? Buffer.alloc(0) : this.rx.subarray(off);
  }

  private rawSend(args: readonly (string | number)[]): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      if (!this.enabled) {
        reject(new Error('Redis tắt'));
        return;
      }
      if (this.pending.length + this.outbox.length >= MAX_QUEUE) {
        reject(new Error('Hàng đợi Redis đầy — bỏ lệnh để bảo vệ game loop'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('Redis timeout')), CMD_TIMEOUT_MS);
      timer.unref?.();
      this.pending.push({
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      const frame = encodeCommand(args);
      if (this.connected && this.socket) this.socket.write(frame);
      else {
        this.outbox.push(frame);
        this.ensureConnected();
      }
    });
  }

  /** Gửi lệnh không chờ (fire-and-forget) — dùng trong game loop. */
  fire(args: readonly (string | number)[]): void {
    if (!this.enabled) return;
    this.rawSend(args).catch(() => undefined);
  }

  async call(args: readonly (string | number)[]): Promise<RespValue | undefined> {
    if (!this.enabled) return undefined;
    try {
      return await this.rawSend(args);
    } catch {
      return undefined;
    }
  }

  // ------------------------------------------------------------------------
  // API nghiệp vụ
  // ------------------------------------------------------------------------

  /** Ghi phòng hiện tại của người chơi để vào lại đúng phòng/instance (TTL 15 phút). */
  rememberSession(playerId: string, roomCode: string): void {
    this.fire(['SET', BANSUNG_REDIS_KEYS.session(playerId), roomCode, 'EX', 900]);
  }

  forgetSession(playerId: string): void {
    this.fire(['DEL', BANSUNG_REDIS_KEYS.session(playerId)]);
  }

  async lookupSession(playerId: string): Promise<string | null> {
    const v = await this.call(['GET', BANSUNG_REDIS_KEYS.session(playerId)]);
    return typeof v === 'string' ? v : null;
  }

  /** Checkpoint phòng — tự throttle 2 s/phòng nên gọi được từ callback tick. */
  checkpointRoom(roomCode: string, data: Record<string, unknown>, nowMs = Date.now()): void {
    if (!this.enabled) return;
    const last = this.lastRoomCheckpointAt.get(roomCode) ?? 0;
    if (nowMs - last < 2000) return;
    this.lastRoomCheckpointAt.set(roomCode, nowMs);
    this.fire(['SET', BANSUNG_REDIS_KEYS.room(roomCode), JSON.stringify({ ...data, at: nowMs }), 'EX', 900]);
  }

  clearRoom(roomCode: string): void {
    this.lastRoomCheckpointAt.delete(roomCode);
    this.fire(['DEL', BANSUNG_REDIS_KEYS.room(roomCode)]);
  }

  /** Lưu kết quả trận: ZADD GT (chỉ giữ điểm cao nhất) + thống kê tổng. */
  recordMatch(rec: BansungMatchRecord): void {
    const lbKey = BANSUNG_REDIS_KEYS.leaderboard(rec.mode, rec.difficulty);
    let mem = this.memLeaderboard.get(lbKey);
    if (!mem) {
      mem = new Map();
      this.memLeaderboard.set(lbKey, mem);
    }
    let kills = 0;
    for (const p of rec.players) {
      kills += Math.max(0, p.kills ?? 0);
      if (p.bot) continue;
      const score = Math.max(0, Math.round(p.score));
      const prev = mem.get(p.id);
      if (!prev || prev.score < score) mem.set(p.id, { name: p.name, score });
      this.fire(['ZADD', lbKey, 'GT', score, p.id]);
      this.fire(['HSET', BANSUNG_REDIS_KEYS.leaderboardNames, p.id, p.name.slice(0, 32)]);
    }
    if (mem.size > 200) {
      const sorted = [...mem.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 200);
      this.memLeaderboard.set(lbKey, new Map(sorted));
    }
    this.fire(['HINCRBY', BANSUNG_REDIS_KEYS.stats, 'matches', 1]);
    if (rec.victory) this.fire(['HINCRBY', BANSUNG_REDIS_KEYS.stats, 'victories', 1]);
    if (kills > 0) this.fire(['HINCRBY', BANSUNG_REDIS_KEYS.stats, 'zombiesKilled', kills]);
    if (rec.bossKills) this.fire(['HINCRBY', BANSUNG_REDIS_KEYS.stats, 'bossesKilled', rec.bossKills]);
  }

  async topScores(
    mode: string,
    difficulty: string,
    limit = 10,
  ): Promise<Array<{ id: string; name: string; score: number }>> {
    const lbKey = BANSUNG_REDIS_KEYS.leaderboard(mode, difficulty);
    const n = Math.max(1, Math.min(100, limit));
    const raw = await this.call(['ZREVRANGE', lbKey, 0, n - 1, 'WITHSCORES']);
    if (Array.isArray(raw) && raw.length > 0) {
      const ids: string[] = [];
      const scores: number[] = [];
      for (let i = 0; i + 1 < raw.length; i += 2) {
        ids.push(String(raw[i]));
        scores.push(Number(raw[i + 1]) || 0);
      }
      const names = await this.call(['HMGET', BANSUNG_REDIS_KEYS.leaderboardNames, ...ids]);
      return ids.map((id, i) => ({
        id,
        name: Array.isArray(names) && typeof names[i] === 'string' ? (names[i] as string) : id,
        score: scores[i],
      }));
    }
    const mem = this.memLeaderboard.get(lbKey);
    if (!mem) return [];
    return [...mem.entries()]
      .map(([id, v]) => ({ id, name: v.name, score: v.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  close(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }
}

/** Singleton dùng chung cho mọi phòng Bắn Súng trong tiến trình. */
export const bansungRedis = BansungRedis.fromEnv();
