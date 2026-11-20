import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonDatabaseEngine, JsonIntegrityError } from '../../src/database/json-database.engine';

const tempDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const d = tempDirs.pop()!;
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('JsonDatabaseEngine — Multi-File WAL 2PC, Crash Recovery & Integrity (Constitution v2.0.0)', () => {
  it('recovers PREPARED WAL transactions idempotently after simulated mid-commit crash', async () => {
    const base = makeTmpDir('eldoria-wal-');
    const dataDir = path.join(base, 'db');
    const bkpDir = path.join(base, 'backups');

    const db1 = new JsonDatabaseEngine(dataDir, bkpDir);
    db1.initializeSync();

    await expect(
      db1.runTransaction(
        [
          { relPath: 'characters/char_crash.json', op: 'UPSERT', entityType: 'CHARACTER', entityId: 'char_crash', data: { id: 'char_crash', gold: 999 } },
          { relPath: 'inventories/char_crash.json', op: 'UPSERT', entityType: 'INVENTORY', entityId: 'char_crash', data: { characterId: 'char_crash', bagItems: [{ id: 'sword_1' }] } },
        ],
        { simulateCrashAfterWalPrepare: true },
      ),
    ).rejects.toThrow(/SIMULATED_CRASH_AFTER_WAL_PREPARE/);

    // Target files not written yet, WAL entry pending
    expect(db1.getPendingWalCount()).toBe(1);
    expect(db1.readEntity('characters/char_crash.json', true)).toBeNull();

    // Boot fresh instance -> WAL Roll-Forward Recovery
    const db2 = new JsonDatabaseEngine(dataDir, bkpDir);
    const rec1 = await db2.recoverFromWal();
    expect(rec1.recoveredCount).toBe(1);
    expect(rec1.appliedOps).toBe(2);
    expect(db2.getPendingWalCount()).toBe(0);

    expect(db2.readEntity<any>('characters/char_crash.json')?.gold).toBe(999);
    expect(db2.readEntity<any>('inventories/char_crash.json')?.bagItems).toHaveLength(1);

    // Calling recovery a second time is strictly idempotent
    const rec2 = await db2.recoverFromWal();
    expect(rec2.recoveredCount).toBe(0);
    expect(rec2.appliedOps).toBe(0);
  });

  it('detects SHA-256 tampering and blocks path traversal attacks', async () => {
    const base = makeTmpDir('eldoria-integrity-');
    const db = new JsonDatabaseEngine(path.join(base, 'db'), path.join(base, 'backups'));
    db.initializeSync();

    await db.writeEntity('accounts/acc_1.json', 'ACCOUNT', 'acc_1', { id: 'acc_1', username: 'hero' });
    expect(() => db.resolveSafePath('../../etc/passwd')).toThrow(/Path traversal blocked/);

    // Tamper 1 byte inside persisted JSON data
    const abs = db.resolveSafePath('accounts/acc_1.json');
    const raw = fs.readFileSync(abs, 'utf8').replace('"hero"', '"evil"');
    fs.writeFileSync(abs, raw, 'utf8');
    db.clearCache();

    expect(() => db.readEntity('accounts/acc_1.json')).toThrow(JsonIntegrityError);
  });

  it('rebuilds secondary indexes cleanly from canonical entity JSON files', async () => {
    const base = makeTmpDir('eldoria-idx-');
    const db = new JsonDatabaseEngine(path.join(base, 'db'), path.join(base, 'backups'));
    db.initializeSync();

    await db.writeEntity('accounts/acc_a.json', 'ACCOUNT', 'acc_a', { id: 'acc_a', username: 'Alice', email: 'alice@eldoria.local' });
    await db.writeEntity('characters/char_a.json', 'CHARACTER', 'char_a', { id: 'char_a', accountId: 'acc_a', name: 'KaelHero' });

    const counts = await db.rebuildSecondaryIndexes();
    expect(counts.accounts).toBe(1);
    expect(counts.characters).toBe(1);
    expect(db.readIndex('accounts-by-email')['alice@eldoria.local']).toBe('acc_a');
    expect(db.readIndex('characters-by-name')['kaelhero']).toBe('char_a');
  });
});
