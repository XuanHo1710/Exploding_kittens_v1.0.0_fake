/**
 * Canonical shared types, constants, and validation helpers for
 * Astral Expedition Pixel (`006-astral-expedition-pixel`).
 */

import type { CharmGain } from './charms';
import type { LevelUpReport } from './progression';

export const ASTRAL_EXPEDITION_STATIC_ROOT = '/database-astral-expedition';

export const EXP_EVT_LOAD_PROFILE = 'exp:load_profile';
export const EXP_EVT_REACH_ANCHOR = 'exp:reach_anchor';
export const EXP_EVT_OPEN_CHEST = 'exp:open_chest';
export const EXP_EVT_WARP_REALM = 'exp:warp_realm';
export const EXP_EVT_BATTLE_START = 'exp:battle_start';
export const EXP_EVT_BATTLE_COMMIT = 'exp:battle_commit';
export const EXP_EVT_BATTLE_RETREAT = 'exp:battle_retreat';
export const EXP_EVT_SUMMON = 'exp:summon';
export const EXP_EVT_UPDATE_PARTY = 'exp:update_party';
export const EXP_EVT_UPGRADE_HERO = 'exp:upgrade_hero';
export const EXP_EVT_ALLOCATE_STATS = 'exp:allocate_stats';
export const EXP_EVT_EQUIP_ITEM = 'exp:equip_item';
export const EXP_EVT_USE_ELIXIR = 'exp:use_elixir';
export const EXP_EVT_ITEM_SUMMON = 'exp:item_summon';
export const EXP_EVT_WEAPON_SUMMON = 'exp:weapon_summon';
export const EXP_EVT_REFINE_WEAPON = 'exp:refine_weapon';
export const EXP_EVT_ENHANCE_ITEM = 'exp:enhance_item';
export const EXP_EVT_SALVAGE_ITEMS = 'exp:salvage_items';
export const EXP_EVT_FEED_EXP = 'exp:feed_exp';
export const EXP_EVT_EQUIP_CHARM = 'exp:equip_charm';
export const EXP_EVT_TREE_UNLOCK = 'exp:tree_unlock';
export const EXP_EVT_TREE_RESET = 'exp:tree_reset';
export const EXP_EVT_STORY_SEEN = 'exp:story_seen';

export type EncounterKind = 'gatekeeper' | 'boss' | 'wild';
export type EnemyAiStyle = 'brute' | 'skirmisher' | 'caster' | 'guardian' | 'beast' | 'swarm';

export const EXPEDITION_ELEMENTS = ['Verdant', 'Frost', 'Solar', 'Tide', 'Pyre', 'Astral'] as const;
export type ElementType = (typeof EXPEDITION_ELEMENTS)[number];

export const EXPEDITION_ROLES = ['Vanguard', 'Striker', 'Breaker', 'Luminary'] as const;
export type HeroRole = (typeof EXPEDITION_ROLES)[number];

export const EXPEDITION_RARITIES = ['R', 'SR', 'SSR', 'SSS'] as const;
export type HeroRarity = (typeof EXPEDITION_RARITIES)[number];

export const EXPEDITION_REALM_IDS = [
  '01-dawn-meadow',
  '02-everfrost-peaks',
  '03-sunken-dunes',
  '04-abyssal-sanctum',
  '05-cinder-caldera',
  '06-nocturne-veil',
  '07-aurora-zenith',
] as const;
export type RealmMapId = (typeof EXPEDITION_REALM_IDS)[number];

export const ELEMENT_LABELS_VI: Record<ElementType, string> = {
  Verdant: 'Phong Mộc',
  Frost: 'Hàn Băng',
  Solar: 'Nhật Quang',
  Tide: 'Thủy Triều',
  Pyre: 'Dung Nham',
  Astral: 'Tinh Quang',
};

export const ROLE_LABELS_VI: Record<HeroRole, string> = {
  Vanguard: 'Thiết Vệ Phản Đòn',
  Striker: 'Tấn Công Chủ Lực',
  Breaker: 'Phá Thế Khống Chế',
  Luminary: 'Hỗ Trợ Ánh Sáng',
};

/** Elemental advantage ring: Verdant -> Tide -> Pyre -> Frost -> Solar -> Verdant, Astral <-> Solar/Nocturne */
export const ELEMENT_ADVANTAGE: Record<ElementType, ElementType> = {
  Verdant: 'Tide',
  Tide: 'Pyre',
  Pyre: 'Frost',
  Frost: 'Solar',
  Solar: 'Astral',
  Astral: 'Verdant',
};

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;
  /** Né tránh: xác suất tự né 1 nhịp đòn của địch (0..1). Không bắt buộc ở bảng chỉ số gốc. */
  eva?: number;
}

export type StatKeyName = 'hp' | 'atk' | 'def' | 'spd' | 'critRate' | 'critDmg' | 'eva';

export interface ItemStatLine {
  stat: StatKeyName;
  value: number;
}

export interface ItemInstance {
  signatureId?: string;
  refineRank?: number;
  /** cấp cường hoá +0..+10 (mọi vũ khí / giáp) */
  enhance?: number;
  weaponShards?: number;
  /** Chỉ dùng trên thẻ kết quả của lượt triệu hồi. */
  duplicateYield?: { shards: number; starlight: number };
  uid: string;
  kind: 'equipment' | 'elixir';
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  nameVi: string;
  ilvl: number;
  slot?: 'weapon' | 'armor' | 'charm';
  main?: ItemStatLine;
  subs: ItemStatLine[];
  /** thuốc: cộng vĩnh viễn chỉ số này cho 1 anh hùng */
  elixir?: ItemStatLine;
  equippedBy?: string;
  locked?: boolean;
  obtainedAt: number;
}

export interface BattleSpriteContract {
  cellSize: 192 | 256;
  cols: 6;
  rows: 4 | 6;
  movementCellSize: 64 | 192;
  movementCols: 6;
  movementDirs: 4;
  movementLoops: readonly ('idle' | 'walk')[];
}

export interface HeroDefinition {
  heroId: string;
  nameVi: string;
  titleVi: string;
  rarity: HeroRarity;
  element: ElementType;
  role: HeroRole;
  starter: boolean;
  weaponVi: string;
  loreVi: string;
  accentHex: string;
  baseStats: StatBlock;
  growthPerLevel: StatBlock;
  skillIds: readonly [string, string, string, string, string];
  spriteSpec: BattleSpriteContract;
}

export interface HeroInstance {
  heroId: string;
  level: number; // [1..60]
  exp: number;
  awakeningRank: number; // [0..6]
  shards: number;
  skillLevels: Record<string, number>; // [1..EXP_BALANCE.skills.maxLevel]
  /** điểm chỉ số đã cộng (mỗi cấp nhận EXP_BALANCE.statPoints.perLevel điểm) */
  statAlloc?: Partial<Record<StatKeyName, number>>;
  /** chỉ số cộng vĩnh viễn từ thuốc */
  elixirBonus?: Partial<Record<StatKeyName, number>>;
  elixirUses?: number;
  /** uid trang bị theo ô */
  equipment?: Partial<Record<'weapon' | 'armor' | 'charm', string>>;
  /** nút cây kỹ năng đã mở (theo thứ tự mở) */
  treeNodes?: string[];
  /** Bùa Hộ Mệnh đang gắn (charmId) */
  charmIds?: string[];
  equippedSkillIds?: string[];
}

export type SkillSlotKind = 'basic' | 'active' | 'ultimate' | 'passive';
export type SkillTargetScope = 'single_enemy' | 'all_enemies' | 'single_ally' | 'all_allies' | 'self';

export interface SkillHitBeat {
  powerMult: number;
  breakDamage: number;
  timedHitOffsetMs: number;
}

export interface SkillVfxSpec {
  castId: string;
  effectId: string;
  beamStyle?: 'slash' | 'ray' | 'meteor' | 'wave' | 'sigil';
}

export interface CombatSkillDefinition {
  skillId: string;
  heroId: string;
  slotKind: SkillSlotKind;
  nameVi: string;
  summaryVi: string;
  element: ElementType;
  apCost: number;
  apGain: number;
  targetScope: SkillTargetScope;
  hits: readonly SkillHitBeat[];
  canTriggerBreak: boolean;
  healRatio?: number;
  shieldRatio?: number;
  apGrantAlly?: number;
  speedBuffTurns?: number;
  vulnDebuffTurns?: number;
  vfxSpec: SkillVfxSpec;
}

export interface RestAnchorSpec {
  anchorId: string;
  nameVi: string;
  x: number;
  y: number;
}

export interface RealmChestSpec {
  chestId: string;
  x: number;
  y: number;
  astralSealReward: number;
  expCrystalReward: number;
}

export interface EnemyUnitTemplate {
  enemyId: string;
  nameVi: string;
  element: ElementType;
  weakness: ElementType;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  maxBreak: number;
  spriteKey: string;
  cellSize: 192 | 256;
  rows: 4 | 6;
  attackNameVi: string;
  hitBeatsMs: readonly number[];
  hitPowerMult: number;
  /** thư mục sprite trong units/ (mặc định gatekeepers) */
  spriteDir?: 'gatekeepers' | 'monsters' | 'animals';
  aiStyle?: EnemyAiStyle;
  isMinion?: boolean;
  resists?: readonly ElementType[];
}

/** Đòn của quái / trùm (mở rộng từ BossMovePattern với AI, hiệu ứng, tụ lực). */
export interface EnemyMovePattern {
  moveId: string;
  nameVi: string;
  telegraphVi: string;
  targetScope: 'single' | 'all' | 'self' | 'allies';
  hitBeatsMs: readonly number[];
  powerMult: number;
  apDrain?: number;
  isDelayedFeint?: boolean;
  beamStyle: 'slash' | 'ray' | 'meteor' | 'wave';
  /** trạng thái gây lên anh hùng trúng đòn ('element' = theo nguyên tố của quái) */
  applies?: readonly { status: string; stacks: number; turns: number; chance?: number }[];
  /** trạng thái tự buff (targetScope self) / buff đồng minh (allies) */
  selfApplies?: readonly { status: string; stacks: number; turns: number }[];
  /** hồi máu đồng minh yếu nhất theo % HP tối đa */
  healRatio?: number;
  weight?: number;
  cooldown?: number;
  /** đòn tụ lực: lượt này tụ, lượt sau tung (Phá Thế / Choáng sẽ ngắt) */
  charge?: boolean;
  when?: 'always' | 'hp_low' | 'ally_low' | 'has_allies' | 'no_buff';
  aim?: 'random' | 'lowest_hp' | 'highest_atk';
  /** kiểu ra đòn 3D phía client (lunge / combo / leap / feint / spin / dash / projectile / barrage / slam) */
  anim?: 'lunge' | 'combo' | 'leap' | 'feint' | 'spin' | 'dash' | 'projectile' | 'barrage' | 'slam';
  /**
   * Tuyệt Kỹ: từ nhịp thứ `specialFrom` trở đi là đòn đặc biệt — Đỡ / Né vô dụng, CHỈ phím W (counter) mới phản được.
   * Trúng đòn Tuyệt Kỹ nhận sát thương × `specialPower`.
   */
  specialFrom?: number;
  specialPower?: number;
}

export interface EnemyIntent {
  actorUid: string;
  move: EnemyMovePattern;
  targetUids: string[];
  /** lượt tụ lực (không gây sát thương) */
  charging?: boolean;
}

export interface GatekeeperEncounter {
  gkId: string;
  mapId: RealmMapId;
  nameVi: string;
  archetype: string;
  x: number;
  y: number;
  patrolWaypoints: readonly (readonly [number, number])[];
  aggroRadius: number;
  gateBarrierTiles: readonly (readonly [number, number])[];
  enemies: readonly EnemyUnitTemplate[];
  firstClearAstralSeal: number;
  expReward: number;
}

export interface BossMovePattern {
  moveId: string;
  nameVi: string;
  telegraphVi: string;
  targetScope: 'single' | 'all';
  hitBeatsMs: readonly number[];
  powerMult: number;
  apDrain?: number;
  isDelayedFeint?: boolean;
  beamStyle: 'slash' | 'ray' | 'meteor' | 'wave';
}

export interface BossPhaseSpec {
  phaseIndex: 1 | 2 | 3;
  hpThresholdRatio: number; // 1.0, 0.65, 0.30
  phaseTitleVi: string;
  auraHex: string;
  atkMult: number;
  spdBonus: number;
  breakShieldActive?: boolean;
  shiftElement?: ElementType;
  moves: readonly BossMovePattern[];
}

export interface BossDefinition {
  bossId: string;
  mapId: RealmMapId;
  nameVi: string;
  titleVi: string;
  isFinalBoss: boolean;
  element: ElementType;
  weakness: ElementType;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  maxBreak: number;
  spriteKey: string;
  battleSceneId: RealmMapId;
  phases: readonly BossPhaseSpec[];
  firstClearAstralSeal: number;
  expReward: number;
  unlocksMapId?: RealmMapId;
}

export interface RealmMapSpec {
  mapId: RealmMapId;
  order: number;
  nameVi: string;
  subtitleVi: string;
  theme: 'meadow' | 'snow' | 'desert' | 'underwater' | 'volcano' | 'night' | 'aurora';
  ambientDescVi: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  exitPortal?: { x: number; y: number; toMapId: RealmMapId; requiresBossId: string };
  backPortal?: { x: number; y: number; toMapId: RealmMapId };
  bossAltar: { x: number; y: number; bossId: string };
  restAnchors: readonly RestAnchorSpec[];
  chests: readonly RealmChestSpec[];
  gatekeeperIds: readonly string[];
}

export interface PityLedger {
  totalPulls: number;
  ssrPityCount: number; // [0..80], guaranteed SSR at 80
  srPityCount: number;  // [0..10], guaranteed SR+ at 10
  /** Bảo hiểm SSS (Jung): số lượt từ mốc trước [0..100) */
  sssPityCount?: number;
  /** Nấc bảo hiểm SSS: 0 → tỉ lệ 1/3, 1 → 1/2, 2 → chắc chắn */
  sssStage?: number;
}

export interface SummonHistoryEntry {
  /** nhánh triệu hồi (mặc định 'hero' cho bản ghi cũ) */
  banner?: 'hero' | 'weapon' | 'item';
  /** tên + độ hiếm món đồ (nhánh vũ khí / rương) */
  itemName?: string;
  itemRarity?: string;
  /** EXP anh hùng nhận từ mảnh dư */
  expConverted?: number;
  pullIndex: number;
  heroId: string;
  rarity: HeroRarity;
  isNew: boolean;
  shardConverted: number;
  starlightConverted: number;
  at: number;
}

export interface SummonBannerConfig {
  bannerId: string;
  nameVi: string;
  singleCostSeal: number;
  tenCostSeal: number;
  rates: {
    SSR: number;
    SR: number;
    R: number;
  };
  softPityStart: number;
  softPityStepBonus: number;
  hardPitySsr: number;
  guaranteedSrEvery: number;
  featuredSsrIds: readonly string[];
}

export interface ExpeditionProfile {
  playerId: string;
  version: number;
  currentMapId: RealmMapId;
  pos: { x: number; y: number };
  lastRestAnchorId: string;
  unlockedMaps: RealmMapId[];
  clearedGatekeepers: string[];
  clearedBosses: string[];
  openedChests: string[];
  activeParty: string[];
  reserveParty?: string[];
  supplies?: Partial<Record<BattleSupply, number>>;
  difficulty?: ExpeditionDifficulty;
  heroes: Record<string, HeroInstance>;
  astralSeal: number;
  starlightToken: number;
  expCrystal: number;
  pity: PityLedger;
  summonHistory: SummonHistoryEntry[];
  /** túi đồ: trang bị + thuốc chỉ số */
  inventory?: ItemInstance[];
  itemSeq?: number;
  /** số lượt Rương Thiên Văn kể từ lần cuối ra Huyền Thoại+ */
  itemPity?: number;
  weaponPity?: { legendary: number; epic: number; pulls: number; mythic?: number };
  completedSummons?: string[];
  /** Bùa Hộ Mệnh sở hữu: charmId -> bậc */
  charms?: Record<string, { rank: number; obtainedAt: number }>;
  /** (cũ, không còn dùng: mỗi trận đã chắc chắn rớt bùa) */
  charmPity?: number;
  /**
   * Quái đã bị hạ kể từ lần nghỉ lửa trại gần nhất (wildId của đàn quái nhỏ + gkId của Gác Cổng).
   * Bị hạ thì biến mất khỏi bản đồ; nghỉ tại Trạm (phím E) sẽ xoá danh sách → quái hồi sinh. Đại Trùm không nằm ở đây.
   */
  defeatedSinceRest?: string[];
  /** nguyên liệu cường hoá: materialId -> số lượng */
  materials?: Record<string, number>;
  /** lần nghỉ gần nhất (để màn hình nghỉ ngơi hiển thị) */
  lastRest?: { at: number; anchorId: string; respawned: number };
  /** cảnh cốt truyện đã xem */
  storySeen?: string[];
  wildWins?: number;
  lastBattleReceipt?: BattleReceipt;
  updatedAt: number;
}

export type BattleSupply = 'tonic' | 'spark' | 'revive';
export type ExpeditionDifficulty = 'story' | 'standard' | 'hard';
export const BATTLE_SUPPLIES: Record<BattleSupply, { nameVi: string; descriptionVi: string }> = {
  tonic: { nameVi: 'Potion', descriptionVi: 'Hồi 40% HP cho một đồng đội.' },
  spark: { nameVi: 'AP Crystal', descriptionVi: 'Cộng 3 AP.' },
  revive: { nameVi: 'Revive Seal', descriptionVi: 'Hồi sinh một đồng đội với 40% HP.' },
};

export interface BattleReceipt {
  battleId: string;
  outcome: 'victory' | 'defeat';
  firstClear: boolean;
  sealReward: number;
  expReward: number;
  unlockedMapId?: RealmMapId;
  drops: ItemInstance[];
  charms: CharmGain[];
  levelUps: LevelUpReport[];
  /** nguyên liệu cường hoá nhận được */
  materials?: Record<string, number>;
}

export type TimedHitGrade = 'perfect' | 'good' | 'miss';
/** 'counter' = phím W phản Tuyệt Kỹ (chỉ có tác dụng với nhịp Tuyệt Kỹ, từ vùng III trở đi) */
export type DefenseGrade = 'parry' | 'dodge' | 'hit' | 'counter';

export type BattlePhaseState =
  | 'INIT_SCENE'
  | 'TURN_QUEUE_EVAL'
  | 'PLAYER_MENU_SELECT'
  | 'PLAYER_TIMED_HIT_EXEC'
  | 'ENEMY_TELEGRAPH'
  | 'DEFENSE_DODGE_PARRY_WINDOW'
  | 'CHECK_BREAK_AND_PHASE'
  | 'VICTORY'
  | 'DEFEAT';

export interface CombatantRuntime {
  unitUid: string;
  side: 'party' | 'enemy';
  templateId: string;
  nameVi: string;
  element: ElementType;
  weakness?: ElementType;
  role?: HeroRole;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;
  /** né tránh tự động (0..1) */
  eva?: number;
  /** cấp từng kỹ năng của anh hùng (để nhân sức mạnh) */
  skillLevels?: Record<string, number>;
  /** kỹ năng đã mở khóa theo cấp */
  unlockedSkillIds?: string[];
  ap: number; // [0..9] for party
  breakGauge: number;
  maxBreak: number;
  staggerTurns: number;
  shieldHp: number;
  spdBuffTurns: number;
  vulnDebuffTurns: number;
  actionValue: number; // CTB gauge
  phaseIndex: 1 | 2 | 3;
  breakShieldActive: boolean;
  alive: boolean;
  // ---- mở rộng chiến đấu
  statuses?: { id: string; stacks: number; turns: number; power?: number; fresh?: boolean }[];
  resists?: readonly ElementType[];
  /** Cộng Hưởng (stack riêng của anh hùng) */
  charge?: number;
  chargeMax?: number;
  chargePower?: number;
  chargeBasic?: number;
  /** sửa đổi kỹ năng từ cây kỹ năng */
  skillMods?: Record<string, { power: number; brk: number; ap: number; extraHit: number; effects: unknown[] }>;
  /** hiệu ứng Bùa Hộ Mệnh gộp */
  charmFx?: Record<string, number>;
  basicStatuses?: string[];
  imbue?: ElementType;
  lastStandUsed?: boolean;
  wardHits?: number;
  lowWardUsed?: boolean;
  openingExtraUsed?: boolean;
  reviveCharmUsed?: boolean;
  equippedSkillIds?: string[];
  spriteRef?: string;
  isBoss?: boolean;
  isMinion?: boolean;
  aiStyle?: EnemyAiStyle;
  aiCooldowns?: Record<string, number>;
  /** 2 đòn tấn công gần nhất (chống lặp một đòn quá 2 lượt liền) */
  aiHistory?: string[];
  aiCharging?: string;
  /** đòn đặc trưng (Gác Cổng) */
  signatureMove?: { nameVi: string; hitBeatsMs: readonly number[]; powerMult: number };
}

export interface TurnActionRecord {
  stepIndex: number;
  actorUid: string;
  kind: 'player_skill' | 'player_item' | 'enemy_turn';
  itemId?: BattleSupply;
  skillId?: string;
  targetUid?: string;
  timedHitGrades?: TimedHitGrade[];
  defenseGrades?: Record<string, DefenseGrade[]>; // heroUid -> per-beat defense result
}

export interface BattleSessionState {
  battleId: string;
  battleSeed: number;
  mapId: RealmMapId;
  encounterKind: EncounterKind;
  targetId: string;
  state: BattlePhaseState;
  round: number;
  combatants: CombatantRuntime[];
  reserves?: CombatantRuntime[];
  supplies?: Partial<Record<BattleSupply, number>>;
  turnOrderPreview: string[]; // next 8 unitUids
  activeActorUid: string;
  bossMoveCursor: number;
  createdAt: number;
  /** ý đồ của quái đang tới lượt (chọn tất định trước khi người chơi phòng thủ) */
  enemyIntent?: EnemyIntent | null;
}

export interface SummonResultItem {
  heroId: string;
  nameVi: string;
  rarity: HeroRarity;
  element: ElementType;
  isNew: boolean;
  awakeningAfter: number;
  shardGained: number;
  starlightGained: number;
  /** mảnh dư → EXP anh hùng */
  expGained?: number;
}

export function computeHeroStats(def: HeroDefinition, inst: HeroInstance): StatBlock {
  const lv = Math.max(1, Math.min(60, Math.floor(inst.level))) - 1;
  const awakenMult = 1 + Math.max(0, Math.min(6, inst.awakeningRank)) * 0.05;
  return {
    hp: Math.round((def.baseStats.hp + def.growthPerLevel.hp * lv) * awakenMult),
    atk: Math.round((def.baseStats.atk + def.growthPerLevel.atk * lv) * awakenMult),
    def: Math.round((def.baseStats.def + def.growthPerLevel.def * lv) * awakenMult),
    spd: Math.round(def.baseStats.spd + def.growthPerLevel.spd * lv),
    critRate: Math.min(1.0, Math.max(0.05, +(def.baseStats.critRate + def.growthPerLevel.critRate * lv).toFixed(3))),
    critDmg: +(def.baseStats.critDmg + def.growthPerLevel.critDmg * lv).toFixed(2),
  };
}

