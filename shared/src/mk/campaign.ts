import catalog from '../../../database-mighty-knight-pixel/campaign/campaign.json';

export const CAMPAIGN = catalog;
export const CAMPAIGN_LEVEL_CAP = catalog.progression.levelCap;
export const CAMPAIGN_RANK_CAP = catalog.progression.skillRankCap;
export const CAMPAIGN_EVT = 'mk:campaign';
export const CAMPAIGN_INPUT_EVT = 'mk:campaign:input';
export const CAMPAIGN_FRAME_EVT = 'mk:campaign:frame';
export const CAMPAIGN_RESULT_EVT = 'mk:campaign:result';
export const CAMPAIGN_ACTION = { attack: 1, active: 2, ultimate: 4, guard: 8, dodge: 16, switch: 32 } as const;
export const CAMPAIGN_STATS = ['vitality', 'force', 'defense'] as const;
export const CAMPAIGN_SKILLS = ['active', 'ultimate'] as const;
export const CAMPAIGN_BRANCHES = ['vitality', 'force', 'technique'] as const;
export type CampaignStat = typeof CAMPAIGN_STATS[number];
export type CampaignSkill = typeof CAMPAIGN_SKILLS[number];
export type CampaignBranch = typeof CAMPAIGN_BRANCHES[number];
export type CampaignHero = typeof catalog.heroes[number];

export interface CampaignHeroProgress {
  level: number;
  xp: number;
  statPoints: number;
  skillPoints: number;
  stats: Record<CampaignStat, number>;
  skills: Record<CampaignSkill, number>;
  branches: Record<CampaignBranch, number>;
}

export interface CampaignProgress {
  revision: number;
  version: number;
  crest: number;
  highestCleared: number;
  heroes: Record<string, CampaignHeroProgress>;
  lastAttempt?: string;
}

export interface CampaignInput {
  attemptId: string;
  seq: number;
  x: number;
  y: number;
  buttons: number;
}

export type CampaignUpgrade =
  | { kind: 'stat'; key: CampaignStat }
  | { kind: 'skill'; key: CampaignSkill }
  | { kind: 'crest'; key: CampaignBranch };

export type CampaignCommand =
  | { t: 'load' }
  | { t: 'deploy'; revision: number; wave: number; roster: string[]; controlled: string }
  | ({ t: 'upgrade'; revision: number; hero: string } & CampaignUpgrade)
  | { t: 'abandon'; attemptId: string };

export interface CampaignHazard {
  shape: 'band' | 'circle' | 'fan' | 'ring';
  x: number;
  y: number;
  radius: number;
  depth: number;
  facing: -1 | 1;
  impactAt: number;
}

export interface CampaignActorFrame {
  id: string;
  asset: string;
  side: 'hero' | 'enemy';
  x: number;
  y: number;
  facing: -1 | 1;
  hp: number;
  maxHp: number;
  pose: number;
  boss?: boolean;
  fury?: number;
  activeUntil?: number;
  ultimateUntil?: number;
}

export interface CampaignFx {
  id: number;
  asset: string;
  x: number;
  y: number;
  facing: -1 | 1;
  startedAt: number;
}

export interface CampaignFrame {
  attemptId: string;
  wave: number;
  time: number;
  phase: 'intro' | 'combat' | 'settling';
  controlled: string;
  actors: CampaignActorFrame[];
  remaining: number;
  groups: number;
  totalGroups: number;
  hazards: CampaignHazard[];
  spawn: { x: number; y: number }[];
  effects: CampaignFx[];
  bossPhase: number;
  bossBreak: number;
  bossStaggerUntil: number;
}

export interface CampaignReward {
  crest: number;
  xp: number;
  recruit?: string;
  levels: { id: string; from: number; to: number; unlocked: CampaignSkill[] }[];
}

export interface CampaignResult {
  attemptId: string;
  wave: number;
  outcome: 'win' | 'loss' | 'error';
  reward?: CampaignReward;
  progress?: CampaignProgress;
}

export interface CampaignState {
  progress: CampaignProgress;
  frame?: CampaignFrame;
}

export function campaignXpRequired(level: number): number {
  if (level >= CAMPAIGN_LEVEL_CAP) return 0;
  const n = level - 1;
  return 110 + 14 * n + Math.floor(n * n / 20);
}

export function campaignRankLevel(skill: CampaignSkill, rank: number): number {
  return CAMPAIGN.progression.unlockLevel[skill] + 3 * (rank - 1);
}

export function campaignStats(hero: CampaignHero, progress: CampaignHeroProgress) {
  const { branches } = CAMPAIGN.progression;
  return {
    hp: hero.hp + (progress.level - 1) * 3 + progress.stats.vitality * 8 + progress.branches.vitality * branches.vitality.maxHpPerBonus,
    atk: hero.atk + (progress.level - 1) + progress.stats.force * 2 + progress.branches.force * branches.force.atkPerBonus,
    defense: progress.stats.defense * 2,
    activeCooldown: Math.max(900, hero.active.cooldownMs - progress.branches.technique * branches.technique.activeCooldownMsPerBonus),
  };
}
