/**
 * Anti-cheat, input validation, token-bucket rate limiting, and server-side
 * cooldown/lockout guards for Bắn Súng Co-op (`bansung`, spec `d48`).
 *
 * Security invariants enforced at every boundary:
 *  - Strict plain-object checks & forbidden prototype keys (`__proto__`, `constructor`, `prototype`)
 *  - Hard JSON payload byte & key-count caps before normalization
 *  - Rejects `NaN`, `±Infinity`, wrong types; clamps bounded inputs to protocol limits
 *  - Token buckets per socket/player (`cmd`, `config`, `ping`) + sliding-window abuse kick tracking
 *  - Server-authoritative clocks (`simTimeMs` / `tickNo`) for weapon swap lockout, ping CD, interact distance, and single-claim pedestal locks
 */

import {
  BANSUNG_AIM_STEPS,
  BANSUNG_CMD_BURST,
  BANSUNG_CMD_REFILL,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_MAX_PLAYERS,
  BANSUNG_WEAPONS,
  getBansungPerk,
  normalizeBansungConfig,
  normalizeBansungHero,
  type BansungCommand,
  type BansungConfig,
  type BansungHeroId,
  type BansungPerkId,
  type BansungPingKind,
  type BansungWeaponId,
} from '../../../../shared/src';

// ============================================================================
// 1. Security Constants & Limits (d48)
// ============================================================================

export const BANSUNG_SEC_LIMITS = {
  MAX_CMD_JSON_BYTES: 512,
  MAX_CONFIG_JSON_BYTES: 1024,
  MAX_CMD_KEYS: 8,
  MAX_CONFIG_KEYS: 16,
  MAX_CMDS_PER_TICK: 8,
  CMD_BUCKET_CAP: BANSUNG_CMD_BURST,
  CMD_REFILL_PER_SEC: BANSUNG_CMD_REFILL,
  CONFIG_BUCKET_CAP: 5,
  CONFIG_REFILL_PER_SEC: 1,
  PING_BUCKET_CAP: 4,
  PING_REFILL_PER_SEC: 0.5,
  PING_MIN_INTERVAL_MS: 1000,
  VIOLATION_WINDOW_MS: 5000,
  VIOLATION_KICK_COUNT: 20,
  SWAP_LOCKOUT_MS: 150,
  MAX_INTERACT_DIST_PX: 76,
  MAX_WEAPON_SLOT_IDX: 4,
  MAX_SEQ: 0x7fffffff,
  MAX_PERK_ID_LEN: 48,
} as const;

export type BansungLifeState = 'alive' | 'downed' | 'dead';

export const DEAD_OR_DOWNED_ALLOWED_CMDS: ReadonlySet<BansungCommand['t']> = new Set([
  'in',
  'perk',
  'gacha',
  'ping',
  'spec',
]);

const FORBIDDEN_PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const SAFE_PERK_ID_RE = /^[a-z0-9_]+$/;
const AIM_MASK = BANSUNG_AIM_STEPS - 1;

// ============================================================================
// 2. Prototype-Safe Object & Numeric Helpers
// ============================================================================

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Checks that `raw` is a plain object (`Object.prototype` or `null` prototype),
 * owns no prototype-pollution keys (`__proto__`, `constructor`, `prototype`),
 * and has at most `maxKeys` enumerable own keys.
 */
export function isSafePlainObject(
  raw: unknown,
  maxKeys: number = BANSUNG_SEC_LIMITS.MAX_CMD_KEYS,
): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of FORBIDDEN_PROTO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  const keys = Object.keys(obj);
  if (keys.length > maxKeys) {
    return false;
  }
  return true;
}

/**
 * Verifies UTF-8 JSON payload size stays within `maxBytes`.
 * Rejects circular references, BigInt values, or non-serializable payloads.
 */
export function isWithinJsonByteBudget(raw: unknown, maxBytes: number): boolean {
  if (typeof raw === 'string') {
    return Buffer.byteLength(raw, 'utf8') <= maxBytes;
  }
  try {
    const encoded = JSON.stringify(raw);
    if (typeof encoded !== 'string') return false;
    return Buffer.byteLength(encoded, 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

/** Returns finite number or `null` (rejects `NaN`, `±Infinity`, non-number). */
export function finiteNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ============================================================================
// 3. Command, Config & Hero Validation (d48 §1, §3, §4)
// ============================================================================

export type BansungCommandValidationResult =
  | { ok: true; cmd: BansungCommand }
  | { ok: false; reason: string };

export interface ValidateCommandOptions {
  arenaW?: number;
  arenaH?: number;
  maxPlayers?: number;
}

/**
 * Validates and sanitizes an untrusted client `bansung:cmd` payload into a strict
 * `BansungCommand`, enforcing prototype safety, byte cap, finite numbers, and clamping.
 */
export function validateBansungCommand(
  raw: unknown,
  opts: ValidateCommandOptions = {},
): BansungCommandValidationResult {
  if (!isSafePlainObject(raw, BANSUNG_SEC_LIMITS.MAX_CMD_KEYS)) {
    return { ok: false, reason: 'invalid_object' };
  }
  if (!isWithinJsonByteBudget(raw, BANSUNG_SEC_LIMITS.MAX_CMD_JSON_BYTES)) {
    return { ok: false, reason: 'payload_too_large' };
  }

  const arenaW = opts.arenaW && opts.arenaW > 0 ? opts.arenaW : BANSUNG_MAP_W;
  const arenaH = opts.arenaH && opts.arenaH > 0 ? opts.arenaH : BANSUNG_MAP_H;
  const maxPlayers = Math.max(1, opts.maxPlayers ?? BANSUNG_MAX_PLAYERS);

  const t = raw.t;
  if (typeof t !== 'string') {
    return { ok: false, reason: 'missing_type' };
  }

  switch (t) {
    case 'in': {
      const seq = finiteNumberOrNull(raw.seq);
      const mx = finiteNumberOrNull(raw.mx);
      const my = finiteNumberOrNull(raw.my);
      const aim = finiteNumberOrNull(raw.aim);
      const fireRaw = raw.fire;
      if (seq === null || mx === null || my === null || aim === null) {
        return { ok: false, reason: 'non_finite_input' };
      }
      let fire: 0 | 1;
      if (fireRaw === 0 || fireRaw === 1) {
        fire = fireRaw;
      } else if (typeof fireRaw === 'number' && Number.isFinite(fireRaw)) {
        fire = fireRaw > 0 ? 1 : 0;
      } else {
        return { ok: false, reason: 'invalid_fire_flag' };
      }

      const safeSeq = Math.floor(clamp(seq, 0, BANSUNG_SEC_LIMITS.MAX_SEQ));
      const safeMx = clamp(mx, -100, 100);
      const safeMy = clamp(my, -100, 100);
      const safeAim = ((Math.round(aim) & AIM_MASK) + BANSUNG_AIM_STEPS) & AIM_MASK;

      return {
        ok: true,
        cmd: {
          t: 'in',
          seq: safeSeq,
          mx: safeMx,
          my: safeMy,
          aim: safeAim,
          fire,
        },
      };
    }

    case 'dash': {
      let dx: number | undefined;
      let dy: number | undefined;
      if (raw.dx !== undefined) {
        const n = finiteNumberOrNull(raw.dx);
        if (n === null) return { ok: false, reason: 'non_finite_dash' };
        dx = clamp(n, -100, 100);
      }
      if (raw.dy !== undefined) {
        const n = finiteNumberOrNull(raw.dy);
        if (n === null) return { ok: false, reason: 'non_finite_dash' };
        dy = clamp(n, -100, 100);
      }
      return {
        ok: true,
        cmd: dx !== undefined && dy !== undefined ? { t: 'dash', dx, dy } : { t: 'dash' },
      };
    }

    case 'slot': {
      const idx = finiteNumberOrNull(raw.idx);
      if (idx === null || !Number.isInteger(idx)) {
        return { ok: false, reason: 'invalid_slot' };
      }
      if (idx < 0 || idx > BANSUNG_SEC_LIMITS.MAX_WEAPON_SLOT_IDX) {
        return { ok: false, reason: 'slot_out_of_range' };
      }
      return { ok: true, cmd: { t: 'slot', idx } };
    }

    case 'reload': {
      return { ok: true, cmd: { t: 'reload' } };
    }

    case 'gadget': {
      if (raw.x === undefined && raw.y === undefined) {
        return { ok: true, cmd: { t: 'gadget' } };
      }
      const x = finiteNumberOrNull(raw.x);
      const y = finiteNumberOrNull(raw.y);
      if (x === null || y === null) {
        return { ok: false, reason: 'non_finite_gadget' };
      }
      return {
        ok: true,
        cmd: {
          t: 'gadget',
          x: clamp(x, 0, arenaW),
          y: clamp(y, 0, arenaH),
        },
      };
    }

    case 'use': {
      return { ok: true, cmd: { t: 'use' } };
    }

    case 'perk': {
      const id = raw.id;
      if (
        typeof id !== 'string' ||
        id.length === 0 ||
        id.length > BANSUNG_SEC_LIMITS.MAX_PERK_ID_LEN ||
        FORBIDDEN_PROTO_KEYS.has(id) ||
        !SAFE_PERK_ID_RE.test(id)
      ) {
        return { ok: false, reason: 'invalid_perk_id' };
      }
      if (!getBansungPerk(id)) {
        return { ok: false, reason: 'unknown_perk' };
      }
      return { ok: true, cmd: { t: 'perk', id: id as BansungPerkId } };
    }

    case 'gacha': {
      const pick = finiteNumberOrNull(raw.pick);
      if (pick === null || !Number.isInteger(pick) || pick < 0 || pick > 2) {
        return { ok: false, reason: 'invalid_gacha_pick' };
      }
      return { ok: true, cmd: { t: 'gacha', pick: pick as 0 | 1 | 2 } };
    }

    case 'shop': {
      const op = raw.op;
      if (op !== 'buy_weapon' && op !== 'upgrade_active' && op !== 'supply_heal') {
        return { ok: false, reason: 'invalid_shop_op' };
      }
      let weaponId: BansungWeaponId | undefined;
      if (op === 'buy_weapon') {
        const w = raw.weaponId;
        if (
          typeof w !== 'string' ||
          FORBIDDEN_PROTO_KEYS.has(w) ||
          !Object.prototype.hasOwnProperty.call(BANSUNG_WEAPONS, w)
        ) {
          return { ok: false, reason: 'invalid_shop_weapon' };
        }
        weaponId = w as BansungWeaponId;
      }
      let slotIdx: number | undefined;
      if (raw.slotIdx !== undefined) {
        const s = finiteNumberOrNull(raw.slotIdx);
        if (s === null || !Number.isInteger(s) || s < 0 || s > BANSUNG_SEC_LIMITS.MAX_WEAPON_SLOT_IDX) {
          return { ok: false, reason: 'invalid_shop_slot' };
        }
        slotIdx = s;
      }
      return {
        ok: true,
        cmd: {
          t: 'shop',
          op,
          ...(weaponId ? { weaponId } : {}),
          ...(slotIdx !== undefined ? { slotIdx } : {}),
        },
      };
    }

    case 'skill': {
      if (raw.x === undefined && raw.y === undefined) {
        return { ok: true, cmd: { t: 'skill' } };
      }
      const x = finiteNumberOrNull(raw.x);
      const y = finiteNumberOrNull(raw.y);
      if (x === null || y === null) {
        return { ok: false, reason: 'non_finite_skill' };
      }
      return {
        ok: true,
        cmd: {
          t: 'skill',
          x: clamp(x, 0, arenaW),
          y: clamp(y, 0, arenaH),
        },
      };
    }

    case 'wskill': {
      if (raw.x === undefined && raw.y === undefined) {
        return { ok: true, cmd: { t: 'wskill' } };
      }
      const wx = finiteNumberOrNull(raw.x);
      const wy = finiteNumberOrNull(raw.y);
      if (wx === null || wy === null) {
        return { ok: false, reason: 'non_finite_wskill' };
      }
      return {
        ok: true,
        cmd: {
          t: 'wskill',
          x: clamp(wx, 0, arenaW),
          y: clamp(wy, 0, arenaH),
        },
      };
    }

    case 'ping': {
      const kind = finiteNumberOrNull(raw.kind);
      const x = finiteNumberOrNull(raw.x);
      const y = finiteNumberOrNull(raw.y);
      if (kind === null || !Number.isInteger(kind) || kind < 0 || kind > 3) {
        return { ok: false, reason: 'invalid_ping_kind' };
      }
      if (x === null || y === null) {
        return { ok: false, reason: 'non_finite_ping' };
      }
      return {
        ok: true,
        cmd: {
          t: 'ping',
          kind: kind as BansungPingKind,
          x: clamp(x, 0, arenaW),
          y: clamp(y, 0, arenaH),
        },
      };
    }

    case 'spec': {
      const targetIdx = finiteNumberOrNull(raw.targetIdx);
      if (targetIdx === null || !Number.isInteger(targetIdx)) {
        return { ok: false, reason: 'invalid_spec_target' };
      }
      if (targetIdx < 0 || targetIdx >= maxPlayers) {
        return { ok: false, reason: 'spec_out_of_range' };
      }
      return { ok: true, cmd: { t: 'spec', targetIdx } };
    }

    default:
      return { ok: false, reason: 'unknown_command' };
  }
}

export type BansungConfigValidationResult =
  | { ok: true; config: BansungConfig }
  | { ok: false; reason: string };

/**
 * Safely validates untrusted lobby config JSON before passing to `normalizeBansungConfig`.
 */
export function validateBansungConfig(
  raw: unknown,
  humans = 1,
): BansungConfigValidationResult {
  if (!isSafePlainObject(raw, BANSUNG_SEC_LIMITS.MAX_CONFIG_KEYS)) {
    return { ok: false, reason: 'invalid_config_object' };
  }
  if (!isWithinJsonByteBudget(raw, BANSUNG_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)) {
    return { ok: false, reason: 'config_too_large' };
  }
  return { ok: true, config: normalizeBansungConfig(raw, humans) };
}

export type BansungHeroValidationResult =
  | { ok: true; heroId: BansungHeroId }
  | { ok: false; reason: string };

/** Validates an untrusted `bansung:hero` selection payload against canonical hero IDs. */
export function validateBansungHero(raw: unknown): BansungHeroValidationResult {
  const candidate =
    typeof raw === 'string'
      ? raw
      : isSafePlainObject(raw, 4) && typeof raw.hero === 'string'
        ? raw.hero
        : isSafePlainObject(raw, 4) && typeof raw.heroId === 'string'
          ? raw.heroId
          : null;
  if (!candidate || FORBIDDEN_PROTO_KEYS.has(candidate)) {
    return { ok: false, reason: 'invalid_hero' };
  }
  const normalized = normalizeBansungHero(candidate);
  if (normalized !== candidate) {
    return { ok: false, reason: 'unknown_hero' };
  }
  return { ok: true, heroId: normalized };
}

// ============================================================================
// 4. Token-Bucket Rate Limiter & Violation Window (d48 §2)
// ============================================================================

export type RateBucketKind = 'cmd' | 'config' | 'ping';

export interface TokenBucket {
  tokens: number;
  lastMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  shouldKick: boolean;
  violations: number;
  reason?: 'rate_limit' | 'tick_cap' | 'abuse_kick';
}

interface PlayerLimiterEntry {
  cmd: TokenBucket;
  config: TokenBucket;
  ping: TokenBucket;
  tickNo: number;
  tickCmdCount: number;
  violationWindowStartMs: number;
  violations: number;
}

/**
 * Per-player/socket token-bucket rate limiter (`cmd`: 45/35s, `config`: 5/1s, `ping`: 4/0.5s),
 * per-tick command cap (`<= 8`), and sliding-window kick detector (`20` violations in `5000ms`).
 */
export class BansungRateLimiter {
  private readonly entries = new Map<string, PlayerLimiterEntry>();

  private getOrCreate(key: string, nowMs: number): PlayerLimiterEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        cmd: { tokens: BANSUNG_SEC_LIMITS.CMD_BUCKET_CAP, lastMs: nowMs },
        config: { tokens: BANSUNG_SEC_LIMITS.CONFIG_BUCKET_CAP, lastMs: nowMs },
        ping: { tokens: BANSUNG_SEC_LIMITS.PING_BUCKET_CAP, lastMs: nowMs },
        tickNo: -1,
        tickCmdCount: 0,
        violationWindowStartMs: nowMs,
        violations: 0,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private getBucketSpec(kind: RateBucketKind): { cap: number; refillPerSec: number } {
    switch (kind) {
      case 'config':
        return {
          cap: BANSUNG_SEC_LIMITS.CONFIG_BUCKET_CAP,
          refillPerSec: BANSUNG_SEC_LIMITS.CONFIG_REFILL_PER_SEC,
        };
      case 'ping':
        return {
          cap: BANSUNG_SEC_LIMITS.PING_BUCKET_CAP,
          refillPerSec: BANSUNG_SEC_LIMITS.PING_REFILL_PER_SEC,
        };
      default:
        return {
          cap: BANSUNG_SEC_LIMITS.CMD_BUCKET_CAP,
          refillPerSec: BANSUNG_SEC_LIMITS.CMD_REFILL_PER_SEC,
        };
    }
  }

  private refillBucket(bucket: TokenBucket, cap: number, refillPerSec: number, nowMs: number): void {
    const dtMs = Math.max(0, nowMs - bucket.lastMs);
    bucket.lastMs = nowMs;
    if (dtMs > 0) {
      bucket.tokens = Math.min(cap, bucket.tokens + (dtMs / 1000) * refillPerSec);
    }
  }

  /** Consumes `cost` tokens from `kind` bucket and records a violation on overflow. */
  consume(
    playerKey: string,
    kind: RateBucketKind = 'cmd',
    nowMs = Date.now(),
    cost = 1,
  ): RateLimitDecision {
    const entry = this.getOrCreate(playerKey, nowMs);
    const { cap, refillPerSec } = this.getBucketSpec(kind);
    const bucket = entry[kind];
    this.refillBucket(bucket, cap, refillPerSec, nowMs);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return {
        allowed: true,
        remaining: bucket.tokens,
        shouldKick: false,
        violations: entry.violations,
      };
    }

    const v = this.recordViolation(playerKey, nowMs);
    return {
      allowed: false,
      remaining: bucket.tokens,
      shouldKick: v.shouldKick,
      violations: v.violations,
      reason: v.shouldKick ? 'abuse_kick' : 'rate_limit',
    };
  }

  /**
   * Checks both token bucket (`cmd`, plus `ping` when `cmdType === 'ping'`) AND per-tick cap
   * (`<= MAX_CMDS_PER_TICK = 8` commands processed for a player on a single `tickNo`).
   */
  consumeCommandGate(
    playerKey: string,
    cmdType: BansungCommand['t'],
    tickNo: number,
    nowMs = Date.now(),
  ): RateLimitDecision {
    const entry = this.getOrCreate(playerKey, nowMs);

    if (entry.tickNo !== tickNo) {
      entry.tickNo = tickNo;
      entry.tickCmdCount = 0;
    }

    if (entry.tickCmdCount >= BANSUNG_SEC_LIMITS.MAX_CMDS_PER_TICK) {
      const v = this.recordViolation(playerKey, nowMs);
      return {
        allowed: false,
        remaining: entry.cmd.tokens,
        shouldKick: v.shouldKick,
        violations: v.violations,
        reason: v.shouldKick ? 'abuse_kick' : 'tick_cap',
      };
    }

    const cmdGate = this.consume(playerKey, 'cmd', nowMs, 1);
    if (!cmdGate.allowed) {
      return cmdGate;
    }

    if (cmdType === 'ping') {
      const pingGate = this.consume(playerKey, 'ping', nowMs, 1);
      if (!pingGate.allowed) {
        return pingGate;
      }
    }

    entry.tickCmdCount += 1;
    return cmdGate;
  }

  /** Records a malformed/rate violation in the sliding 5s window and checks disconnect threshold. */
  recordViolation(
    playerKey: string,
    nowMs = Date.now(),
  ): { violations: number; shouldKick: boolean } {
    const entry = this.getOrCreate(playerKey, nowMs);
    if (nowMs - entry.violationWindowStartMs > BANSUNG_SEC_LIMITS.VIOLATION_WINDOW_MS) {
      entry.violationWindowStartMs = nowMs;
      entry.violations = 1;
    } else {
      entry.violations += 1;
    }
    return {
      violations: entry.violations,
      shouldKick: entry.violations >= BANSUNG_SEC_LIMITS.VIOLATION_KICK_COUNT,
    };
  }

  clearPlayer(playerKey: string): void {
    this.entries.delete(playerKey);
  }

  reset(): void {
    this.entries.clear();
  }
}

// ============================================================================
// 5. Server Cooldown, State & Interaction Guards (d48 §5)
// ============================================================================

export interface PlayerActionGuardState {
  lastWeaponSwapMs: number;
  lastPingMs: number;
  lastAckSeq: number;
}

export function createPlayerActionGuard(): PlayerActionGuardState {
  return {
    lastWeaponSwapMs: -BANSUNG_SEC_LIMITS.SWAP_LOCKOUT_MS,
    lastPingMs: -BANSUNG_SEC_LIMITS.PING_MIN_INTERVAL_MS,
    lastAckSeq: 0,
  };
}

/** Rejects discrete combat actions while `downed` or `dead` (`d48 §5`). */
export function isCmdAllowedInLifeState(
  cmdType: BansungCommand['t'],
  lifeState: BansungLifeState,
): boolean {
  if (lifeState === 'alive') {
    return cmdType !== 'spec';
  }
  return DEAD_OR_DOWNED_ALLOWED_CMDS.has(cmdType);
}

/** Enforces server-clock `150ms` weapon swap lockout against macro slot-toggle fire exploits. */
export function canSwapWeapon(guard: PlayerActionGuardState, simTimeMs: number): boolean {
  return simTimeMs - guard.lastWeaponSwapMs >= BANSUNG_SEC_LIMITS.SWAP_LOCKOUT_MS;
}

export function markWeaponSwap(guard: PlayerActionGuardState, simTimeMs: number): void {
  guard.lastWeaponSwapMs = simTimeMs;
}

/** Enforces minimum server-clock interval (`1000ms`) between tactical pings. */
export function canSendTacticalPing(guard: PlayerActionGuardState, simTimeMs: number): boolean {
  return simTimeMs - guard.lastPingMs >= BANSUNG_SEC_LIMITS.PING_MIN_INTERVAL_MS;
}

export function markTacticalPing(guard: PlayerActionGuardState, simTimeMs: number): void {
  guard.lastPingMs = simTimeMs;
}

/** Checks authoritative squared distance for pedestal `[E]` interaction (`<= 76px` coarse gate). */
export function isWithinInteractRadius(
  actorX: number,
  actorY: number,
  targetX: number,
  targetY: number,
  maxDistPx = BANSUNG_SEC_LIMITS.MAX_INTERACT_DIST_PX,
): boolean {
  if (
    !Number.isFinite(actorX) ||
    !Number.isFinite(actorY) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY)
  ) {
    return false;
  }
  const dx = targetX - actorX;
  const dy = targetY - actorY;
  return dx * dx + dy * dy <= maxDistPx * maxDistPx;
}

/**
 * Atomic single-claim lock ensuring two players interacting on the same 33ms tick
 * cannot duplicate or both swap the same weapon pedestal (`d48 §5`).
 */
export class EntityClaimLock {
  private readonly claimedThisTick = new Map<number, number>();

  tryClaim(entityId: number, tickNo: number): boolean {
    const prevTick = this.claimedThisTick.get(entityId);
    if (prevTick === tickNo) {
      return false;
    }
    this.claimedThisTick.set(entityId, tickNo);
    return true;
  }

  pruneBefore(minTickNo: number): void {
    for (const [id, t] of this.claimedThisTick) {
      if (t < minTickNo) {
        this.claimedThisTick.delete(id);
      }
    }
  }

  clear(): void {
    this.claimedThisTick.clear();
  }
}
