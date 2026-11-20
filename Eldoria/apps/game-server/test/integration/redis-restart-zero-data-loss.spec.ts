import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonDatabaseEngine } from '../../src/database/json-database.engine';
import { LocalRedisService } from '../../src/infrastructure/redis/local-redis.service';
import {
  RedisIdempotencyService,
  RedisLockoutService,
  RedisPresenceService,
  RedisSessionCacheService,
} from '../../src/infrastructure/redis/redis-ephemeral.services';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('Local Redis Ephemeral Cache & Zero-Data-Loss after FLUSHALL/Restart (SC-005)', () => {
  it('preserves 100% of 50 consecutive WAL commits after complete Redis FLUSHALL', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'eldoria-redis-zdl-'));
    tempDirs.push(base);

    const db = new JsonDatabaseEngine(path.join(base, 'db'), path.join(base, 'backups'));
    db.initializeSync();

    process.env.REDIS_ENABLED = 'false';
    const redis = new LocalRedisService();
    await redis.onModuleInit();

    const sessCache = new RedisSessionCacheService(redis, db);
    const lockout = new RedisLockoutService(redis);
    const idempotency = new RedisIdempotencyService(redis, db);
    const presence = new RedisPresenceService(redis);

    // Persist session + 50 consecutive WAL ledger & character commits
    const session = { id: 'ses_test_1', accountId: 'acc_zdl', refreshTokenHash: 'abc', revokedAt: null };
    await db.writeEntity('sessions/ses_test_1.json', 'SESSION', 'ses_test_1', session);
    await sessCache.cacheSession(session.id, session);

    let gold = 1000;
    for (let i = 1; i <= 50; i++) {
      const before = gold;
      gold += 25;
      const txId = `tx_zdl_${i}`;
      await db.runTransaction(
        [
          { relPath: 'characters/char_zdl.json', op: 'UPSERT', entityType: 'CHARACTER', entityId: 'char_zdl', data: { id: 'char_zdl', gold, step: i } },
          db.buildLedgerMutation({
            entryId: `led_${i}`,
            txId,
            characterId: 'char_zdl',
            currency: 'GOLD',
            delta: 25,
            beforeBalance: before,
            afterBalance: gold,
            reason: `STEP_${i}`,
            createdAt: new Date().toISOString(),
          }),
        ],
        { txId },
      );
      await idempotency.recordResponse('acc_zdl', `idem_key_${i}`, { ok: true, step: i });
    }

    // Verify brute-force lockout (5 failures -> locked)
    for (let f = 0; f < 5; f++) await lockout.recordFailure('attacker@eldoria.local');
    expect(await lockout.isLocked('attacker@eldoria.local')).toBe(true);

    // Verify party invite in Redis
    await presence.createPartyInvite('inv_ephemeral', { partyId: 'pty_1' });
    expect((await presence.getPartyInvite('inv_ephemeral'))?.partyId).toBe('pty_1');

    // === SIMULATE REDIS FLUSHALL / CONTAINER RESTART ===
    await redis.flushEphemeralCache();
    db.clearCache();

    // Ephemeral Redis-only invite is gone, BUT 100% of persistent JSON DB + Idempotency + Session self-heal!
    expect(await presence.getPartyInvite('inv_ephemeral')).toBeNull();
    const charAfter = db.readEntity<any>('characters/char_zdl.json');
    expect(charAfter.gold).toBe(1000 + 50 * 25);
    expect(charAfter.step).toBe(50);

    const ledger = db.readEntity<any>(db.getLedgerRelPath('char_zdl'));
    expect(ledger.entries).toHaveLength(50);

    // Session transparently falls back to data/db/sessions/*.json
    const recoveredSession = await sessCache.getSession('ses_test_1');
    expect(recoveredSession?.accountId).toBe('acc_zdl');

    // Idempotency key transparently falls back to data/db/indexes/idempotency/<accountId>.json
    const replayed = await idempotency.getReplay('acc_zdl', 'idem_key_50');
    expect(replayed).toEqual({ ok: true, step: 50 });
  });
});
