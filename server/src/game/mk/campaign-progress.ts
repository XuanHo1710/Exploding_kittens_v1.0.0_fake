import { BadRequestException } from '@nestjs/common';
import {
  CAMPAIGN, CAMPAIGN_BRANCHES, CAMPAIGN_LEVEL_CAP, CAMPAIGN_RANK_CAP, CAMPAIGN_SKILLS, CAMPAIGN_STATS,
  campaignRankLevel, campaignXpRequired, type CampaignHeroProgress, type CampaignProgress,
  type CampaignReward, type CampaignSkill, type CampaignUpgrade,
} from '../../../../shared/src/mk/campaign';

const newHero = (): CampaignHeroProgress => ({
  level: 1, xp: 0, statPoints: 0, skillPoints: 0,
  stats: { vitality: 0, force: 0, defense: 0 },
  skills: { active: 0, ultimate: 0 },
  branches: { vitality: 0, force: 0, technique: 0 },
});
const totalCrest = CAMPAIGN.waves.reduce((sum, wave) => sum + wave.crest, 0);
const totalStatPoints = (CAMPAIGN_LEVEL_CAP - 1) * CAMPAIGN.progression.statPointsPerLevel;

export const initialCampaign = (): CampaignProgress => ({
  version: CAMPAIGN.version, revision: 0, crest: 0, highestCleared: 0,
  heroes: { [CAMPAIGN.progression.starter]: newHero() },
});

function awardHero(hero: CampaignHeroProgress, xp: number): CampaignSkill[] {
  hero.xp += xp;
  while (hero.level < CAMPAIGN_LEVEL_CAP && hero.xp >= campaignXpRequired(hero.level)) {
    hero.xp -= campaignXpRequired(hero.level++);
    hero.statPoints += CAMPAIGN.progression.statPointsPerLevel;
    hero.skillPoints += CAMPAIGN.progression.skillPointsPerLevel;
  }
  if (hero.level === CAMPAIGN_LEVEL_CAP) hero.xp = 0;
  const unlocked = CAMPAIGN_SKILLS.filter((s) => !hero.skills[s] && hero.level >= campaignRankLevel(s, 1));
  for (const skill of unlocked) hero.skills[skill] = 1;
  return unlocked;
}

/** Reward is calculated from server-owned attempt data and written in one transaction. */
export function awardWave(progress: CampaignProgress, wave: number, roster: string[], attempt: string): CampaignReward | undefined {
  if (attempt === progress.lastAttempt) return;
  const spec = CAMPAIGN.waves[wave - 1];
  if (!spec || wave > progress.highestCleared + 1) throw new BadRequestException('Wave này chưa mở.');
  const first = wave > progress.highestCleared;
  const xp = first ? spec.xp : Math.ceil(spec.xp * 0.35);
  const reward: CampaignReward = { xp, crest: first ? spec.crest : 0, levels: [] };
  for (const id of new Set(roster)) {
    const hero = progress.heroes[id];
    if (!hero) throw new BadRequestException('Tướng này chưa gia nhập.');
    const from = hero.level;
    const unlocked = awardHero(hero, xp);
    if (from !== hero.level) reward.levels.push({ id, from, to: hero.level, unlocked });
  }
  if (first) {
    progress.highestCleared = wave;
    progress.crest += reward.crest;
    if (!Object.hasOwn(progress.heroes, spec.recruit)) {
      reward.recruit = spec.recruit;
      progress.heroes[spec.recruit] = newHero();
    }
  }
  progress.lastAttempt = attempt;
  progress.revision++;
  return reward;
}

export function upgradeCampaign(
  progress: CampaignProgress, id: string, kind: CampaignUpgrade['kind'], key: string,
): CampaignProgress {
  const hero = Object.hasOwn(progress.heroes, id) ? progress.heroes[id] : undefined;
  if (!hero) throw new BadRequestException('Tướng này chưa gia nhập.');
  if (kind === 'stat' && CAMPAIGN_STATS.some((s) => s === key)) {
    const stat = key as keyof typeof hero.stats;
    if (!hero.statPoints) throw new BadRequestException('Hết điểm chỉ số.');
    hero.statPoints--;
    hero.stats[stat]++;
  } else if (kind === 'skill' && CAMPAIGN_SKILLS.some((s) => s === key)) {
    const skill = key as CampaignSkill;
    const rank = hero.skills[skill];
    if (!rank || rank >= CAMPAIGN_RANK_CAP || hero.level < campaignRankLevel(skill, rank + 1)) {
      throw new BadRequestException('Chưa đủ cấp hoặc kỹ năng đã đạt hạng tối đa.');
    }
    if (!hero.skillPoints) throw new BadRequestException('Hết điểm kỹ năng.');
    hero.skillPoints--;
    hero.skills[skill]++;
  } else if (kind === 'crest' && CAMPAIGN_BRANCHES.some((b) => b === key)) {
    const branch = key as keyof typeof hero.branches;
    const tier = CAMPAIGN.progression.upgradeTiers[hero.branches[branch]];
    if (!tier || progress.crest < tier.cost) throw new BadRequestException('Chưa đủ Crest hoặc đã nâng tối đa.');
    progress.crest -= tier.cost;
    hero.branches[branch]++;
  } else {
    throw new BadRequestException('Loại nâng cấp không hợp lệ.');
  }
  progress.revision++;
  return progress;
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validCampaignSave(value: unknown): value is CampaignProgress {
  if (!value || typeof value !== 'object') return false;
  const p = value as CampaignProgress;
  if (p.version !== CAMPAIGN.version || !integer(p.revision, 0) || !integer(p.crest, 0, totalCrest) ||
      !integer(p.highestCleared, 0, CAMPAIGN.waves.length) || !p.heroes ||
      typeof p.heroes !== 'object' || Array.isArray(p.heroes) ||
      (p.lastAttempt !== undefined && (typeof p.lastAttempt !== 'string' || p.lastAttempt.length > 64))) return false;
  const expected = [CAMPAIGN.progression.starter, ...CAMPAIGN.waves.slice(0, p.highestCleared).map((w) => w.recruit)];
  return Object.keys(p.heroes).length === expected.length && expected.every((id) => {
    const h = Object.hasOwn(p.heroes, id) ? p.heroes[id] : undefined;
    if (!h || !integer(h.level, 1, CAMPAIGN_LEVEL_CAP) ||
        !integer(h.xp, 0, Math.max(0, campaignXpRequired(h.level) - 1)) || !h.stats || !h.skills || !h.branches ||
        !integer(h.statPoints, 0) || !integer(h.skillPoints, 0)) return false;
    if (!CAMPAIGN_STATS.every((s) => integer(h.stats[s], 0, totalStatPoints)) ||
        !CAMPAIGN_SKILLS.every((s) => {
          const rank = h.skills[s];
          return integer(rank, 0, CAMPAIGN_RANK_CAP) &&
            (rank === 0 ? h.level < campaignRankLevel(s, 1) : h.level >= campaignRankLevel(s, rank));
        }) ||
        !CAMPAIGN_BRANCHES.every((b) => integer(h.branches[b], 0, CAMPAIGN.progression.upgradeTiers.length))) return false;
    return h.statPoints + CAMPAIGN_STATS.reduce((sum, s) => sum + h.stats[s], 0) ===
        (h.level - 1) * CAMPAIGN.progression.statPointsPerLevel &&
      h.skillPoints + CAMPAIGN_SKILLS.reduce((sum, s) => sum + Math.max(0, h.skills[s] - 1), 0) ===
        (h.level - 1) * CAMPAIGN.progression.skillPointsPerLevel;
  });
}
