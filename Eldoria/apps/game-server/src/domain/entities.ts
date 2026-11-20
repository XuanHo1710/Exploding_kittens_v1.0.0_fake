import { CurrencyWallet, EquipmentSlot, ItemInstance, UiPreferences } from '@eldoria/shared';

export interface AccountEntity {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  roles: string[];
  preferences: UiPreferences;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SessionEntity {
  id: string;
  accountId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CharacterHeroRosterEntry {
  heroId: string;
  constellationLevel: number;
  unlockedAt: string;
}

export interface CharacterQuestProgress {
  questId: string;
  status: 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'CLAIMED';
  progress: Record<string, number>;
  acceptedAt: string | null;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface GachaPityState {
  pullsSinceHighRarity: number;
  pullsSinceEpic: number;
  totalPulls: number;
}

export interface GachaHistoryEntry {
  pullId: string;
  bannerId: string;
  rewardType: 'CHARACTER' | 'WEAPON';
  rewardId: string;
  rarity: string;
  isDuplicate: boolean;
  starEssenceGranted: number;
  pityAtPull: number;
  pulledAt: string;
}

export interface UpgradeHistoryEntry {
  txId: string;
  itemInstanceId: string;
  itemId: string;
  fromLevel: number;
  toLevel: number;
  goldSpent: number;
  createdAt: string;
}

export interface CharacterEntity {
  id: string;
  accountId: string;
  name: string;
  activeHeroId: string;
  level: number;
  exp: number;
  unspentStatPoints: number;
  unspentSkillPoints: number;
  allocatedStats: {
    str: number;
    agi: number;
    int: number;
    vit: number;
    dex: number;
    luk: number;
  };
  skillRanks: Record<string, number>;
  wallet: CurrencyWallet;
  unlockedHeroes: CharacterHeroRosterEntry[];
  equippedSlots: Partial<Record<EquipmentSlot, string>>;
  position: {
    regionId: string;
    zoneId: string;
    x: number;
    y: number;
    facing: 'down' | 'up' | 'left' | 'right';
  };
  vitals: {
    hp: number;
    mp: number;
    stamina: number;
    hunger: number;
    foodBuffAtkPct: number;
    foodBuffExpiresAt: number;
  };
  pityByGroup: Record<string, GachaPityState>;
  gachaHistory: GachaHistoryEntry[];
  upgradeHistory: UpgradeHistoryEntry[];
  quests: CharacterQuestProgress[];
  discoveredRegions: string[];
  bossKillCounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryEntity {
  characterId: string;
  bagCapacity: number;
  storageCapacity: number;
  bagItems: ItemInstance[];
  storageItems: ItemInstance[];
}

export interface PlacedBuilding {
  instanceId: string;
  buildingId: string;
  level: number;
  tileX: number;
  tileY: number;
  rotation: number;
  builtAt: string;
}

export interface FarmPlot {
  plotId: string;
  tileX: number;
  tileY: number;
  state: 'UNTILLED' | 'TILLED' | 'PLANTED' | 'MATURE';
  cropId: string | null;
  plantedAtMs: number | null;
  lastWateredAtMs: number | null;
  wateredCount: number;
  fertilized: boolean;
  growthProgressMin: number;
}

export interface AnimalInstance {
  animalInstanceId: string;
  animalId: string;
  name: string;
  happiness: number;
  hunger: number;
  health: number;
  grownAtMs: number;
  lastFedAtMs: number;
  lastCollectedAtMs: number;
}

export interface HomesteadEntity {
  characterId: string;
  gridWidth: number;
  gridHeight: number;
  buildings: PlacedBuilding[];
  plots: FarmPlot[];
  animals: AnimalInstance[];
  lastSimulatedAtMs: number;
}

export interface SocialProfileEntity {
  characterId: string;
  friendIds: string[];
  blockedIds: string[];
  pendingRequests: Array<{ fromCharacterId: string; fromName: string; sentAt: string }>;
}

export interface PartyEntity {
  id: string;
  leaderId: string;
  members: Array<{
    characterId: string;
    name: string;
    heroId: string;
    level: number;
    ready: boolean;
  }>;
  createdAt: string;
}
