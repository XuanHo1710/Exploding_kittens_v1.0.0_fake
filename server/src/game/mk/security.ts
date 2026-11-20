/**
 * Anti-cheat, input validation, and token-bucket rate limiting for
 * Mighty Knight 2.5D Pixel (`mighty_knight`).
 */
import {
  MK_BIOMES,
  MK_DIFFICULTIES,
  MK_HERO_IDS,
  MK_MAX_PLAYERS,
  MK_PLAY_MODES,
  MK_RELIC_IDS,
  MK_UPGRADE_TARGETS,
  normalizeMkConfig,
  normalizeMkHero,
  type MkCommand,
  type MkConfig,
  type MkHeroId,
  type MkRelicId,
  type MkUpgradeTarget,
} from '../../../../shared/src';

export const MK_SEC_LIMITS = {
  MAX_CMD_JSON_BYTES: 512,
  MAX_CONFIG_JSON_BYTES: 1024,
  MAX_CMD_KEYS: 8,
  MAX_CONFIG_KEYS: 16,
  MAX_CMDS_PER_TICK: 10,
  /** Enforces <= 24 commands/sec sustained budget with short input-burst headroom. */
  CMD_BUCKET_CAP: 24,
  CMD_REFILL_PER_SEC: 24,
  CONFIG_BUCKET_CAP: 5,
  CONFIG_REFILL_PER_SEC: 1,
  VIOLATION_WINDOW_MS: 5000,
  VIOLATION_KICK_COUNT: 20,
  MAX_ID_LEN: 80,
} as const;

const FORBIDDEN_PROTO_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const VALID_UPGRADE_TARGETS: ReadonlySet<string> = new Set(MK_UPGRADE_TARGETS);
const VALID_RELIC_IDS: ReadonlySet<string> = new Set(MK_RELIC_IDS);
const VALID_BIOMES: ReadonlySet<string> = new Set(['auto', ...MK_BIOMES]);
const VALID_DIFFICULTIES: ReadonlySet<string> = new Set(MK_DIFFICULTIES);
const VALID_PLAY_MODES: ReadonlySet<string> = new Set(MK_PLAY_MODES);
const VALID_HEROES: ReadonlySet<string> = new Set(MK_HERO_IDS);
const SAFE_ID_RE = /^[\w:-]{1,80}$/;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function isSafePlainObject(
  raw: unknown,
  maxKeys: number = MK_SEC_LIMITS.MAX_CMD_KEYS,
): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return false;
  const obj = raw as Record<string, unknown>;
  for (const key of FORBIDDEN_PROTO_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return false;
  }
  return Object.keys(obj).length <= maxKeys;
}

export function isWithinJsonByteBudget(raw: unknown, maxBytes: number): boolean {
  if (typeof raw === 'string') return Buffer.byteLength(raw, 'utf8') <= maxBytes;
  try {
    const encoded = JSON.stringify(raw);
    if (typeof encoded !== 'string') return false;
    return Buffer.byteLength(encoded, 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

export function finiteNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseOptionalId(raw: unknown): { ok: true; id?: string } | { ok: false } {
  if (raw === undefined) return { ok: true, id: undefined };
  if (
    typeof raw !== 'string' ||
    raw.length === 0 ||
    raw.length > MK_SEC_LIMITS.MAX_ID_LEN ||
    FORBIDDEN_PROTO_KEYS.has(raw) ||
    !SAFE_ID_RE.test(raw)
  ) {
    return { ok: false };
  }
  return { ok: true, id: raw };
}

export type MkCommandValidationResult =
  | { ok: true; cmd: MkCommand }
  | { ok: false; reason: string };

export function validateMkCommand(raw: unknown): MkCommandValidationResult {
  if (!isSafePlainObject(raw, MK_SEC_LIMITS.MAX_CMD_KEYS)) {
    return { ok: false, reason: 'invalid_object' };
  }
  if (!isWithinJsonByteBudget(raw, MK_SEC_LIMITS.MAX_CMD_JSON_BYTES)) {
    return { ok: false, reason: 'payload_too_large' };
  }
  const t = raw.t;
  if (typeof t !== 'string') return { ok: false, reason: 'missing_type' };

  switch (t) {
    case 'move': {
      const mx = finiteNumberOrNull(raw.mx);
      const my = finiteNumberOrNull(raw.my);
      if (mx === null || my === null) return { ok: false, reason: 'non_finite_move' };
      if (raw.atk !== undefined && typeof raw.atk !== 'boolean') {
        return { ok: false, reason: 'invalid_atk_flag' };
      }
      let dir: 1 | -1 | undefined;
      if (raw.dir !== undefined) {
        if (raw.dir !== 1 && raw.dir !== -1) return { ok: false, reason: 'invalid_dir' };
        dir = raw.dir;
      }
      return {
        ok: true,
        cmd: {
          t: 'move',
          mx: clamp(mx, -1, 1),
          my: clamp(my, -1, 1),
          ...(dir !== undefined ? { dir } : {}),
          ...(raw.atk !== undefined ? { atk: raw.atk } : {}),
        },
      };
    }

    case 'attack': {
      let mx: number | undefined;
      let my: number | undefined;
      if (raw.mx !== undefined) {
        const n = finiteNumberOrNull(raw.mx);
        if (n === null) return { ok: false, reason: 'non_finite_attack' };
        mx = clamp(n, -1, 1);
      }
      if (raw.my !== undefined) {
        const n = finiteNumberOrNull(raw.my);
        if (n === null) return { ok: false, reason: 'non_finite_attack' };
        my = clamp(n, -1, 1);
      }
      if (raw.hold !== undefined && typeof raw.hold !== 'boolean') {
        return { ok: false, reason: 'invalid_hold_flag' };
      }
      return {
        ok: true,
        cmd: {
          t: 'attack',
          ...(raw.hold !== undefined ? { hold: raw.hold } : {}),
          ...(mx !== undefined ? { mx } : {}),
          ...(my !== undefined ? { my } : {}),
        },
      };
    }

    case 'skill': {
      const slot = raw.slot;
      if (slot !== 1 && slot !== 2 && slot !== 3 && slot !== 4) {
        return { ok: false, reason: 'invalid_skill_slot' };
      }
      return { ok: true, cmd: { t: 'skill', slot } };
    }

    case 'ultimate':
      return { ok: true, cmd: { t: 'ultimate' } };

    case 'dash': {
      let mx: number | undefined;
      let my: number | undefined;
      if (raw.mx !== undefined) {
        const n = finiteNumberOrNull(raw.mx);
        if (n === null) return { ok: false, reason: 'non_finite_dash' };
        mx = clamp(n, -1, 1);
      }
      if (raw.my !== undefined) {
        const n = finiteNumberOrNull(raw.my);
        if (n === null) return { ok: false, reason: 'non_finite_dash' };
        my = clamp(n, -1, 1);
      }
      return {
        ok: true,
        cmd: {
          t: 'dash',
          ...(mx !== undefined ? { mx } : {}),
          ...(my !== undefined ? { my } : {}),
        },
      };
    }

    case 'guard':
      return { ok: true, cmd: { t: 'guard' } };

    case 'switch_com': {
      const parsed = parseOptionalId(raw.targetId);
      if (!parsed.ok) return { ok: false, reason: 'invalid_target_fighter' };
      return {
        ok: true,
        cmd: parsed.id ? { t: 'switch_com', targetId: parsed.id } : { t: 'switch_com' },
      };
    }

    case 'upgrade': {
      const target = raw.target;
      if (
        typeof target !== 'string' ||
        FORBIDDEN_PROTO_KEYS.has(target) ||
        !VALID_UPGRADE_TARGETS.has(target)
      ) {
        return { ok: false, reason: 'invalid_upgrade_target' };
      }
      const parsed = parseOptionalId(raw.fighterId);
      if (!parsed.ok) return { ok: false, reason: 'invalid_fighter_id' };
      return {
        ok: true,
        cmd: {
          t: 'upgrade',
          target: target as MkUpgradeTarget,
          ...(parsed.id ? { fighterId: parsed.id } : {}),
        },
      };
    }

    case 'pick_relic': {
      const relicId = raw.relicId;
      if (
        typeof relicId !== 'string' ||
        FORBIDDEN_PROTO_KEYS.has(relicId) ||
        !VALID_RELIC_IDS.has(relicId)
      ) {
        return { ok: false, reason: 'invalid_relic_id' };
      }
      return { ok: true, cmd: { t: 'pick_relic', relicId: relicId as MkRelicId } };
    }

    case 'skip_phase':
      return { ok: true, cmd: { t: 'skip_phase' } };

    case 'resign':
      return { ok: true, cmd: { t: 'resign' } };

    default:
      return { ok: false, reason: 'unknown_command' };
  }
}

export type MkConfigValidationResult =
  | { ok: true; config: MkConfig }
  | { ok: false; reason: string };

export function validateMkConfig(raw: unknown, humans = 1): MkConfigValidationResult {
  if (!isSafePlainObject(raw, MK_SEC_LIMITS.MAX_CONFIG_KEYS)) {
    return { ok: false, reason: 'Cấu hình phòng không hợp lệ.' };
  }
  if (!isWithinJsonByteBudget(raw, MK_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)) {
    return { ok: false, reason: 'Cấu hình phòng quá lớn.' };
  }
  if (raw.playMode !== undefined && (typeof raw.playMode !== 'string' || !VALID_PLAY_MODES.has(raw.playMode))) {
    return { ok: false, reason: 'Chế độ chơi không hợp lệ.' };
  }
  if (raw.difficulty !== undefined && (typeof raw.difficulty !== 'string' || !VALID_DIFFICULTIES.has(raw.difficulty))) {
    return { ok: false, reason: 'Độ khó không hợp lệ.' };
  }
  if (raw.biome !== undefined && (typeof raw.biome !== 'string' || !VALID_BIOMES.has(raw.biome))) {
    return { ok: false, reason: 'Quần xã không hợp lệ.' };
  }
  if (raw.comBots !== undefined && (typeof raw.comBots !== 'number' || !Number.isFinite(raw.comBots))) {
    return { ok: false, reason: 'Số đồng đội COM không hợp lệ.' };
  }
  if (raw.allowSwitchCom !== undefined && typeof raw.allowSwitchCom !== 'boolean') {
    return { ok: false, reason: 'Tùy chọn đổi tướng không hợp lệ.' };
  }
  const safeHumans = clamp(Math.floor(humans || 1), 1, MK_MAX_PLAYERS);
  return { ok: true, config: normalizeMkConfig(raw, safeHumans) };
}

export type MkHeroValidationResult =
  | { ok: true; heroId: MkHeroId }
  | { ok: false; reason: string };

export function validateMkHero(raw: unknown): MkHeroValidationResult {
  let candidate: unknown = raw;
  if (isSafePlainObject(raw, MK_SEC_LIMITS.MAX_CMD_KEYS)) {
    if (!isWithinJsonByteBudget(raw, MK_SEC_LIMITS.MAX_CMD_JSON_BYTES)) {
      return { ok: false, reason: 'Anh hùng không hợp lệ.' };
    }
    candidate = raw.heroId;
  }
  if (typeof candidate !== 'string' || !VALID_HEROES.has(candidate)) {
    return { ok: false, reason: 'Anh hùng không hợp lệ.' };
  }
  return { ok: true, heroId: normalizeMkHero(candidate) };
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  violations: number[];
}

export class MkRateLimiter {
  private readonly buckets = new Map<string, BucketState>();

  consume(
    key: string,
    kind: 'cmd' | 'config' = 'cmd',
    nowMs = Date.now(),
  ): { allowed: boolean; shouldKick: boolean } {
    const cap = kind === 'config' ? MK_SEC_LIMITS.CONFIG_BUCKET_CAP : MK_SEC_LIMITS.CMD_BUCKET_CAP;
    const refill =
      kind === 'config' ? MK_SEC_LIMITS.CONFIG_REFILL_PER_SEC : MK_SEC_LIMITS.CMD_REFILL_PER_SEC;
    const mapKey = `${kind}:${key}`;
    let st = this.buckets.get(mapKey);
    if (!st) {
      st = { tokens: cap, lastRefillMs: nowMs, violations: [] };
      this.buckets.set(mapKey, st);
    }
    const elapsedSec = Math.max(0, (nowMs - st.lastRefillMs) / 1000);
    if (elapsedSec > 0) {
      st.tokens = Math.min(cap, st.tokens + elapsedSec * refill);
      st.lastRefillMs = nowMs;
    }
    if (st.tokens >= 1) {
      st.tokens -= 1;
      return { allowed: true, shouldKick: false };
    }
    const { shouldKick } = this.recordViolation(mapKey, nowMs);
    return { allowed: false, shouldKick };
  }

  recordViolation(key: string, nowMs = Date.now()): { shouldKick: boolean } {
    let st = this.buckets.get(key);
    if (!st) {
      st = { tokens: 0, lastRefillMs: nowMs, violations: [] };
      this.buckets.set(key, st);
    }
    const cutoff = nowMs - MK_SEC_LIMITS.VIOLATION_WINDOW_MS;
    st.violations = st.violations.filter((ts) => ts >= cutoff);
    st.violations.push(nowMs);
    return { shouldKick: st.violations.length >= MK_SEC_LIMITS.VIOLATION_KICK_COUNT };
  }

  clearPlayer(key: string): void {
    this.buckets.delete(`cmd:${key}`);
    this.buckets.delete(`config:${key}`);
    this.buckets.delete(key);
  }
}
