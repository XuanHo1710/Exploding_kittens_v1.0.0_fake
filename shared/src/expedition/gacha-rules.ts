/**
 * Authoritative Gacha Summon Resolver (`gacha-rules.ts`):
 * - 3 Rarities: SSR (3.0%), SR (17.0%), R (80.0%)
 * - Soft Pity from pull 65 (+5% SSR chance per pull)
 * - Hard Pity at pull 80 (100% guaranteed SSR)
 * - 10-Pull / srPityCount === 10 guaranteed SR+
 * - Duplicates bank a hero-specific shard for manual Awakening, then convert overflow to Starlight.
 */

import { EXP_BALANCE, expToNextLevel } from './balance';
import { grantHeroExp } from './progression';

/** Mảnh dư (đã A6 hoặc đầy mảnh) đổi thành EXP anh hùng: số cấp tương đương theo độ hiếm. */
export const DUP_EXP_LEVELS: Record<'SSS' | 'SSR' | 'SR' | 'R', number> = { SSS: 2, SSR: 1.5, SR: 1, R: 0.6 };

/**
 * Bảo hiểm SSS (Jung) — tách riêng khỏi bảo hiểm SSR:
 * - Mỗi lượt có tỉ lệ gốc `baseRate` ra Jung.
 * - Mỗi 100 lượt chạm mốc: nấc 0 → 1/3 ra Jung; trượt thì 100 lượt sau nấc 1 → 1/2; trượt nữa thì 100 lượt sau chắc chắn.
 * - Ra Jung (bằng tỉ lệ gốc hoặc mốc) thì đếm và nấc về 0. Tối đa 300 lượt chắc chắn có Jung.
 */
export const SSS_PITY = {
  heroId: 'jung_afterglow',
  every: 100,
  chances: [1 / 3, 1 / 2, 1] as const,
  baseRate: 0.003,
} as const;

/** Tỉ lệ ra Jung ở lượt kế tiếp (để hiển thị). */
export function nextSssChance(profile: ExpeditionProfile): { count: number; stage: number; milestoneChance: number } {
  const stage = Math.min(2, profile.pity.sssStage ?? 0);
  return { count: profile.pity.sssPityCount ?? 0, stage, milestoneChance: SSS_PITY.chances[stage] };
}
import { DEFAULT_SUMMON_BANNER, EXPEDITION_HEROES } from './catalog';
import type {
  ExpeditionProfile,
  HeroDefinition,
  HeroRarity,
  SummonBannerConfig,
  SummonResultItem,
} from './types';

const HEROES_BY_RARITY: Record<HeroRarity, readonly HeroDefinition[]> = {
  SSS: EXPEDITION_HEROES.filter((h) => h.rarity === 'SSS'),
  SSR: EXPEDITION_HEROES.filter((h) => h.rarity === 'SSR'),
  SR: EXPEDITION_HEROES.filter((h) => h.rarity === 'SR'),
  R: EXPEDITION_HEROES.filter((h) => h.rarity === 'R'),
};

export function computeEffectiveSsrRate(
  nextPullSsrPity: number,
  banner: SummonBannerConfig = DEFAULT_SUMMON_BANNER,
): number {
  if (nextPullSsrPity >= banner.hardPitySsr) return 1.0;
  if (nextPullSsrPity >= banner.softPityStart) {
    const extraSteps = nextPullSsrPity - banner.softPityStart + 1;
    return Math.min(1.0, banner.rates.SSR + extraSteps * banner.softPityStepBonus);
  }
  return banner.rates.SSR;
}

/**
 * Resolves 1 or 10 pulls deterministically given a float generator `[0, 1)`
 * (uses `crypto.randomInt` on the server).
 */
export function resolveSummonBatch(
  profile: ExpeditionProfile,
  count: 1 | 10,
  randomFloat: () => number,
  banner: SummonBannerConfig = DEFAULT_SUMMON_BANNER,
  now = Date.now(),
): SummonResultItem[] {
  const cost = count === 10 ? banner.tenCostSeal : banner.singleCostSeal;
  if (profile.astralSeal < cost) {
    throw new Error(`Không đủ Ấn Tinh Tú (cần ${cost}, hiện có ${profile.astralSeal}).`);
  }

  profile.astralSeal -= cost;
  const results: SummonResultItem[] = [];

  for (let i = 0; i < count; i++) {
    const nextSsrPity = profile.pity.ssrPityCount + 1;
    const nextSrPity = profile.pity.srPityCount + 1;
    const ssrRate = computeEffectiveSsrRate(nextSsrPity, banner);

    const roll = randomFloat();
    // --- bảo hiểm SSS: tỉ lệ gốc dùng vùng trên cùng của cùng số roll; chạm mốc 100 lượt mới rút thêm số
    const sssCount = (profile.pity.sssPityCount ?? 0) + 1;
    const sssStage = Math.min(2, profile.pity.sssStage ?? 0);
    let sssHit = roll >= 1 - SSS_PITY.baseRate;
    if (!sssHit && sssCount >= SSS_PITY.every) {
      sssHit = randomFloat() < SSS_PITY.chances[sssStage];
      if (!sssHit) {
        profile.pity.sssStage = Math.min(2, sssStage + 1);
        profile.pity.sssPityCount = 0;
      }
    } else if (!sssHit) {
      profile.pity.sssPityCount = sssCount;
    }
    if (sssHit) {
      profile.pity.sssPityCount = 0;
      profile.pity.sssStage = 0;
    }

    let rarity: HeroRarity;
    if (sssHit) {
      rarity = 'SSS';
      profile.pity.ssrPityCount = nextSsrPity;
      profile.pity.srPityCount = 0;
    } else if (roll < ssrRate) {
      rarity = 'SSR';
      profile.pity.ssrPityCount = 0;
      profile.pity.srPityCount = 0;
    } else if (nextSrPity >= banner.guaranteedSrEvery || roll < ssrRate + banner.rates.SR) {
      rarity = 'SR';
      profile.pity.ssrPityCount = nextSsrPity;
      profile.pity.srPityCount = 0;
    } else {
      rarity = 'R';
      profile.pity.ssrPityCount = nextSsrPity;
      profile.pity.srPityCount = nextSrPity;
    }

    profile.pity.totalPulls += 1;
    const pool = rarity === 'SSS' ? HEROES_BY_RARITY.SSS.filter((h) => h.heroId === SSS_PITY.heroId) : HEROES_BY_RARITY[rarity];
    const picked = pool[Math.min(pool.length - 1, Math.floor(randomFloat() * pool.length))];

    const existing = profile.heroes[picked.heroId];
    let isNew = false;
    let shardGained = 0;
    let starlightGained = 0;
    let expGained = 0;

    if (!existing) {
      isNew = true;
      profile.heroes[picked.heroId] = {
        heroId: picked.heroId,
        level: 1,
        exp: 0,
        awakeningRank: 0,
        shards: 0,
        skillLevels: Object.fromEntries(picked.skillIds.map((id) => [id, 1])),
        statAlloc: {},
        elixirBonus: {},
        elixirUses: 0,
        equipment: {},
      };
    } else if ((existing.shards ?? 0) < 6 - existing.awakeningRank) {
      existing.shards = (existing.shards ?? 0) + 1;
      shardGained = 1;
      starlightGained = EXP_BALANCE.heroGacha.dupStarlight[rarity][0];
      profile.starlightToken += starlightGained;
    } else {
      // mảnh dư thừa → EXP để anh hùng LÊN CẤP (không chỉ đổi tiền)
      expGained = Math.round(expToNextLevel(existing.level) * DUP_EXP_LEVELS[rarity]);
      grantHeroExp(existing, expGained);
    }

    const heroState = profile.heroes[picked.heroId];
    results.push({
      heroId: picked.heroId,
      nameVi: picked.nameVi,
      rarity,
      element: picked.element,
      isNew,
      awakeningAfter: heroState.awakeningRank,
      shardGained,
      starlightGained,
      expGained,
    });

    profile.summonHistory.unshift({
      pullIndex: profile.pity.totalPulls,
      heroId: picked.heroId,
      rarity,
      isNew,
      banner: 'hero',
      shardConverted: shardGained,
      starlightConverted: starlightGained,
      expConverted: expGained,
      at: now,
    });
  }

  if (profile.summonHistory.length > 100) {
    profile.summonHistory.length = 100;
  }
  profile.updatedAt = now;
  return results;
}
