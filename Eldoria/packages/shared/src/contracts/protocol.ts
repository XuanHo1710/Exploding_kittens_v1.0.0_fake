import { z } from 'zod';
import { AnimationDirectionEnum, AnimationStateEnum } from './assets-and-animation';

export const PROTOCOL_VERSION = '1.0.0';
export const CONSTITUTION_VERSION = '2.0.0';

export const ElementEnum = z.enum([
  'FIRE',
  'WATER',
  'EARTH',
  'WIND',
  'LIGHTNING',
  'FROST',
  'LIGHT',
  'SHADOW',
  'NEUTRAL',
]);
export type ElementType = z.infer<typeof ElementEnum>;

export const RarityEnum = z.enum([
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
  'MYTHIC',
]);
export type Rarity = z.infer<typeof RarityEnum>;

export const CurrencyTypeEnum = z.enum([
  'GOLD',
  'STARLIGHT_SHARD',
  'CRAFTING_TOKEN',
  'BOSS_TOKEN',
  'STAR_ESSENCE',
]);
export type CurrencyType = z.infer<typeof CurrencyTypeEnum>;

export const EquipmentSlotEnum = z.enum([
  'MAIN_WEAPON',
  'OFF_HAND',
  'HELMET',
  'CHEST',
  'GLOVES',
  'BOOTS',
  'RING_1',
  'RING_2',
  'NECKLACE',
  'ACCESSORY',
]);
export type EquipmentSlot = z.infer<typeof EquipmentSlotEnum>;

export const RegisterDtoSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,24}$/, 'Tên tài khoản cần 3-24 ký tự (chỉ gồm chữ, số và dấu _)'),
  email: z.string().trim().email('Email không hợp lệ').max(120, 'Email tối đa 120 ký tự'),
  password: z
    .string()
    .min(6, 'Mật khẩu cần tối thiểu 6 ký tự')
    .max(128, 'Mật khẩu tối đa 128 ký tự'),
});
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  identifier: z.string().trim().min(3, 'Nhập tên tài khoản hoặc email (tối thiểu 3 ký tự)').max(120),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(128),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const CreateCharacterDtoSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_ ]{3,20}$/, 'Tên nhân vật cần 3-20 ký tự (chữ không dấu, số, khoảng trắng hoặc _)'),
  starterHeroId: z.enum(['chr_kael_vanguard', 'chr_lyra_windrunner', 'chr_seraphina_dawn']),
});
export type CreateCharacterDto = z.infer<typeof CreateCharacterDtoSchema>;

export const AllocateStatsDtoSchema = z.object({
  str: z.number().int().min(0).default(0),
  agi: z.number().int().min(0).default(0),
  int: z.number().int().min(0).default(0),
  vit: z.number().int().min(0).default(0),
  dex: z.number().int().min(0).default(0),
  luk: z.number().int().min(0).default(0),
});
export type AllocateStatsDto = z.infer<typeof AllocateStatsDtoSchema>;

export const UiPreferencesSchema = z.object({
  cameraShakePct: z.union([z.literal(0), z.literal(50), z.literal(100)]).default(100),
  allyVfxOpacityPct: z.union([z.literal(25), z.literal(50), z.literal(70), z.literal(100)]).default(70),
  reducedFlashing: z.boolean().default(false),
  uiScalePct: z.union([z.literal(100), z.literal(115), z.literal(130)]).default(100),
  bgmVolume: z.number().min(0).max(100).default(65),
  sfxVolume: z.number().min(0).max(100).default(80),
  showDamageNumbers: z.boolean().default(true),
  showFootRing: z.boolean().default(true),
});
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;

export interface CurrencyWallet {
  gold: number;
  starlightShard: number;
  craftingToken: number;
  bossToken: number;
  starEssence: number;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  ownerCharacterId: string;
  quantity: number;
  slotIndex: number;
  enhancementLevel: number;
  durability: number | null;
  bonusRolls: Array<{ stat: string; value: number }>;
  sockets: string[];
  quality: 'NORMAL' | 'SILVER' | 'GOLD';
  bound: boolean;
  acquiredAt: string;
}

export interface WorldEntitySnapshot {
  id: string;
  kind: 'PLAYER' | 'MONSTER' | 'ELITE' | 'BOSS' | 'NPC' | 'RESOURCE_NODE' | 'LOOT';
  templateId: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: z.infer<typeof AnimationDirectionEnum>;
  animState: z.infer<typeof AnimationStateEnum>;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  stamina?: number;
  maxStamina?: number;
  poise?: number;
  maxPoise?: number;
  phase?: number;
  level: number;
  element?: ElementType;
  rarity?: Rarity;
  ownerCharacterId?: string;
  lootItemId?: string;
  lootQuantity?: number;
  resourceType?: string;
  depletedUntil?: number;
}

export interface BossTelegraphEvent {
  telegraphId: string;
  bossId: string;
  skillKey: string;
  shape: 'CIRCLE' | 'CONE' | 'LINE' | 'DONUT';
  x: number;
  y: number;
  radiusPx: number;
  angleRad?: number;
  telegraphMs: number;
  createdAtMs: number;
  kind: 'DAMAGE' | 'STACK' | 'KNOCKBACK' | 'INTERRUPTIBLE' | 'SAFE_ZONE';
}

export interface CombatDamageEvent {
  attackerId: string;
  targetId: string;
  skillId: string;
  damage: number;
  isCrit: boolean;
  isBlocked: boolean;
  isParried: boolean;
  element: ElementType;
  reaction?: string;
  targetHpAfter: number;
  targetPoiseAfter?: number;
  poiseBroken?: boolean;
  x: number;
  y: number;
}

export interface SkillCastVfxEvent {
  casterId: string;
  skillId: string;
  vfxKey: string;
  element: ElementType;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  facing: z.infer<typeof AnimationDirectionEnum>;
  radiusPx: number;
  durationMs: number;
}

export interface ChatMessagePayload {
  id: string;
  channel: 'ZONE' | 'PARTY' | 'SYSTEM';
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

export interface ZoneSnapshotPayload {
  tick: number;
  serverTimeMs: number;
  zoneId: string;
  regionId: string;
  timeOfDayPhase: 'DAWN' | 'DAY' | 'DUSK' | 'NIGHT';
  dayMinutes: number;
  weather: 'CLEAR' | 'RAIN' | 'STORM' | 'FOG';
  season: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';
  lastProcessedInputSeq?: number;
  entities: WorldEntitySnapshot[];
  activeTelegraphs: BossTelegraphEvent[];
}
