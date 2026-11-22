import { existsSync, mkdirSync, promises as fs } from 'fs';
import { join, resolve } from 'path';
import {
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_REALMS_BY_ID,
  EXP_BALANCE,
  STARTER_HERO_IDS,
  normalizeProfile,
  type ExpeditionProfile,
  type HeroInstance,
} from '../../../../shared/src';

export function resolveExpeditionDataDir(overrideDir?: string): string {
  if (overrideDir) return resolve(overrideDir);
  if (process.env.EXPEDITION_DATA_DIR) return resolve(process.env.EXPEDITION_DATA_DIR);
  const candidates = [
    resolve(__dirname, '..', '..', '..', 'data', 'expedition'),
    resolve(__dirname, '..', '..', '..', '..', 'server', 'data', 'expedition'),
    resolve(process.cwd(), 'server', 'data', 'expedition'),
    resolve(process.cwd(), 'data', 'expedition'),
  ];
  const base = candidates.find((p) => existsSync(resolve(p, '..'))) ?? candidates[0];
  return base;
}

export function createStarterProfile(playerId: string, now = Date.now()): ExpeditionProfile {
  const startRealm = EXPEDITION_REALMS_BY_ID['01-dawn-meadow'];
  const heroes: Record<string, HeroInstance> = {};
  for (const heroId of STARTER_HERO_IDS) {
    const def = EXPEDITION_HEROES_BY_ID[heroId];
    heroes[heroId] = {
      heroId,
      level: 1,
      exp: 0,
      awakeningRank: 0,
      shards: 0,
      skillLevels: Object.fromEntries(def.skillIds.map((id) => [id, 1])),
      statAlloc: {},
      elixirBonus: {},
      elixirUses: 0,
      equipment: {},
    };
  }

  return {
    playerId,
    version: 1,
    currentMapId: '01-dawn-meadow',
    pos: { ...startRealm.spawn },
    lastRestAnchorId: startRealm.restAnchors[0].anchorId,
    unlockedMaps: ['01-dawn-meadow'],
    clearedGatekeepers: [],
    clearedBosses: [],
    openedChests: [],
    activeParty: [...STARTER_HERO_IDS],
    heroes,
    astralSeal: EXP_BALANCE.economy.starterSeal, // quà khởi đầu: đủ 1 lượt Triệu Hồi x10
    starlightToken: 0,
    expCrystal: EXP_BALANCE.economy.starterExpCrystal,
    inventory: [],
    itemSeq: 0,
    itemPity: 0,
    pity: {
      totalPulls: 0,
      ssrPityCount: 0,
      srPityCount: 0,
    },
    summonHistory: [],
    updatedAt: now,
  };
}

/**
 * Per-account atomic JSON file store (`write temp -> fsync -> rename`)
 * with per-player async serialization queue to prevent race corruption.
 */
export class ExpeditionProfileStore {
  private readonly dir: string;
  private readonly writeLocks = new Map<string, Promise<unknown>>();

  constructor(overrideDir?: string) {
    this.dir = resolveExpeditionDataDir(overrideDir);
    mkdirSync(this.dir, { recursive: true });
  }

  private safeFileOf(playerId: string): string {
    const clean = String(playerId ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!clean || clean.length < 4 || clean.length > 64) {
      throw new Error('Mã định danh người chơi không hợp lệ.');
    }
    return join(this.dir, `${clean}.json`);
  }

  async loadOrCreate(playerId: string): Promise<ExpeditionProfile> {
    const filePath = this.safeFileOf(playerId);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as ExpeditionProfile;
      if (parsed && parsed.playerId === playerId && parsed.heroes) {
        return normalizeProfile(parsed);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
    const fresh = createStarterProfile(playerId);
    await this.saveAtomic(fresh);
    return fresh;
  }

  async saveAtomic(profile: ExpeditionProfile): Promise<void> {
    const filePath = this.safeFileOf(profile.playerId);
    const prev = this.writeLocks.get(profile.playerId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        profile.version = (profile.version ?? 0) + 1;
        profile.updatedAt = Date.now();
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        const payload = JSON.stringify(profile, null, 2);
        const fh = await fs.open(tmpPath, 'w');
        try {
          await fh.writeFile(payload, 'utf8');
          await fh.sync();
        } finally {
          await fh.close();
        }
        await fs.rename(tmpPath, filePath);
      });
    this.writeLocks.set(profile.playerId, next);
    await next;
  }
}
