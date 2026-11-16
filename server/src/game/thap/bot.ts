/**
 * AI cổ điển Miragine War (1P vs AI): phân tích đội hình địch trên chiến trường,
 * áp dụng bảng khắc chế Method 481 (`MIRAGINE_AI_COUNTERS`), hiệu quả giáp Method 493,
 * phòng thủ Pha Lê khẩn cấp và leo cấp lính trùm cuối trận.
 *
 * Tuyệt đối không đọc trạng thái riêng tư của đối thủ (như `enemy.auto` hoặc vàng địch).
 */

import {
  MIRAGINE_AI_COUNTERS,
  THAP_CRYSTALS,
  THAP_MAX_POP,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  miragineDamage,
  type ThapBotLevel,
  type ThapUnitKind,
} from '../../../../shared/src';
import { enemyOf, isUnitInPlay, type AiBrain, type SideState, type SimWorldState } from './types';

interface BotProfile {
  reactionTicks: number;
  counterAccuracy: number;
  openingPool: readonly ThapUnitKind[];
  canSaveForBoss: boolean;
  useArmorEfficiency: boolean;
}

interface BattlefieldIntel {
  myPop: number;
  popRoom: number;
  enemyPop: number;
  nearEnemyPop: number;
  enemyPopByKind: Partial<Record<ThapUnitKind, number>>;
  nearEnemyPopByKind: Partial<Record<ThapUnitKind, number>>;
  dominantEnemy: ThapUnitKind | undefined;
  nearDominantEnemy: ThapUnitKind | undefined;
  isEmergency: boolean;
}

interface BotDecision {
  kind: ThapUnitKind;
  reason: string;
}

const CRYSTAL_THREAT_RADIUS = 520;
const EMERGENCY_POP_MARGIN = 4;
const HARD_PREWAVE_WINDOW_FRAMES = 45;
const DREADLORD_SAVE_INCOME = 380;
const HIGHLORD_SAVE_INCOME = 650;

const EMERGENCY_FAST_POOL: readonly ThapUnitKind[] = ['cavalry', 'swordman', 'novice', 'newbie'];
const HIGH_TIER_POOL: readonly ThapUnitKind[] = ['ironknight', 'mage', 'immortal', 'cavalry', 'vampire', 'monk'];
const MID_TIER_POOL: readonly ThapUnitKind[] = [
  'cavalry',
  'vampire',
  'monk',
  'heavysword',
  'ninja',
  'novice',
  'swordman',
];
const LOW_TIER_POOL: readonly ThapUnitKind[] = [
  'heavysword',
  'ninja',
  'novice',
  'swordman',
  'samurai',
  'zombie',
  'veteran',
  'newbie',
];

const BOT_PROFILES: Record<ThapBotLevel, BotProfile> = {
  easy: {
    reactionTicks: 45,
    counterAccuracy: 0.5,
    openingPool: ['newbie', 'veteran'],
    canSaveForBoss: false,
    useArmorEfficiency: false,
  },
  normal: {
    reactionTicks: 25,
    counterAccuracy: 0.78,
    openingPool: ['samurai', 'swordman', 'novice', 'newbie'],
    canSaveForBoss: true,
    useArmorEfficiency: false,
  },
  hard: {
    reactionTicks: 12,
    counterAccuracy: 0.94,
    openingPool: ['samurai', 'swordman', 'novice', 'newbie'],
    canSaveForBoss: true,
    useArmorEfficiency: true,
  },
};

/** Khởi tạo bộ não AI mặc định cho một cấp độ khó Miragine War. */
export function createAiBrain(level: ThapBotLevel): AiBrain {
  return {
    personality: level,
    preferredCounter: 'newbie',
    counterReason: 'Opening',
    lastEvalWave: -1,
    emergencyTicks: 0,
  };
}

/**
 * Chạy một bước suy nghĩ của AI trên mô phỏng 30Hz.
 * Chỉ quan sát đơn vị địch hiện diện công khai trên `world.units` và phát lệnh qua `selectAuto`.
 */
export function runBot(
  world: SimWorldState,
  s: SideState,
  selectAuto: (kind: ThapUnitKind) => void,
  rng: () => number = Math.random,
): void {
  if (!s.alive || !s.bot) return;

  const brain = s.ai ?? (s.ai = createAiBrain(world.config.botLevel));
  const profile = BOT_PROFILES[brain.personality];
  const intel = gatherBattlefieldIntel(world, s);

  if (intel.isEmergency) {
    brain.emergencyTicks += 1;
  } else {
    brain.emergencyTicks = 0;
  }

  const onWaveChange = brain.lastEvalWave !== world.wave;
  const onReactionTick = world.simTick % profile.reactionTicks === 0;
  const onEmergencyStart = intel.isEmergency && brain.emergencyTicks === 1;
  const onHardLateWindow = brain.personality === 'hard' && world.roundFramesLeft <= HARD_PREWAVE_WINDOW_FRAMES;

  if (!onWaveChange && !onReactionTick && !onEmergencyStart && !onHardLateWindow) {
    return;
  }

  const nextWaveGold = s.gold + s.roundIncome;

  // Giữ ổn định lựa chọn khai cuộc trước khi đợt 1 xuất quân nếu chưa thấy quân địch.
  if (
    world.wave === 0 &&
    intel.enemyPop === 0 &&
    !onWaveChange &&
    brain.counterReason === 'Opening' &&
    THAP_UNITS[s.auto].cost <= nextWaveGold
  ) {
    return;
  }

  const frontlineStable = isFrontlineStable(s, intel);

  // Trong cửa sổ cuối đợt của Hard, tránh tung xúc xắc lại nếu cục diện không đổi; chỉ nâng cấp tất định khi đủ vàng/giải pháp tốt hơn.
  if (!onWaveChange && !onReactionTick && !onEmergencyStart && onHardLateWindow) {
    if (isReasonCurrent(brain, world, s, intel, nextWaveGold, frontlineStable)) {
      if (brain.counterReason.startsWith('Save ')) {
        const bossReady = pickBossSaveLateWindowUpgrade(s, intel, nextWaveGold);
        if (bossReady) {
          applyDecision(brain, s, world.wave, bossReady, selectAuto);
        }
        return;
      }
      const upgrade = pickDeterministicUpgrade(s, intel, nextWaveGold, frontlineStable);
      if (upgrade && upgrade.kind !== s.auto) {
        applyDecision(brain, s, world.wave, upgrade, selectAuto);
      }
      return;
    }
  }

  const decision = evaluateStrategy(world, s, profile, intel, nextWaveGold, frontlineStable, rng);
  applyDecision(brain, s, world.wave, decision, selectAuto);
}

/** Ghi nhận kết quả phân tích vào `AiBrain` và gọi `selectAuto` khi đổi loại quân. */
function applyDecision(
  brain: AiBrain,
  s: SideState,
  wave: number,
  decision: BotDecision,
  selectAuto: (kind: ThapUnitKind) => void,
): void {
  brain.preferredCounter = decision.kind;
  brain.counterReason = decision.reason;
  brain.lastEvalWave = wave;
  if (decision.kind !== s.auto) {
    selectAuto(decision.kind);
  }
}

/** Thu thập thông tin chiến trường công khai từ `world.units` quanh bản đồ và Pha Lê của bot. */
function gatherBattlefieldIntel(world: SimWorldState, s: SideState): BattlefieldIntel {
  const enemyIdx = enemyOf(s.idx);
  const [crystalX, crystalY] = THAP_CRYSTALS[s.idx];
  const threatDistSq = CRYSTAL_THREAT_RADIUS * CRYSTAL_THREAT_RADIUS;

  let myPop = 0;
  let enemyPop = 0;
  let nearEnemyPop = 0;
  const enemyPopByKind: Partial<Record<ThapUnitKind, number>> = {};
  const nearEnemyPopByKind: Partial<Record<ThapUnitKind, number>> = {};

  for (const u of world.units) {
    if (!isUnitInPlay(u)) continue;
    const pop = THAP_UNITS[u.kind].pop;
    if (u.owner === s.idx) {
      myPop += pop;
      continue;
    }
    if (u.owner !== enemyIdx) continue;

    enemyPop += pop;
    enemyPopByKind[u.kind] = (enemyPopByKind[u.kind] ?? 0) + pop;

    const dx = u.x - crystalX;
    const dy = u.y - crystalY;
    if (dx * dx + dy * dy < threatDistSq) {
      nearEnemyPop += pop;
      nearEnemyPopByKind[u.kind] = (nearEnemyPopByKind[u.kind] ?? 0) + pop;
    }
  }

  return {
    myPop,
    popRoom: Math.max(0, THAP_MAX_POP - myPop),
    enemyPop,
    nearEnemyPop,
    enemyPopByKind,
    nearEnemyPopByKind,
    dominantEnemy: topPopKind(enemyPopByKind),
    nearDominantEnemy: topPopKind(nearEnemyPopByKind),
    isEmergency: nearEnemyPop >= myPop + EMERGENCY_POP_MARGIN,
  };
}

/** Tìm loại lính chiếm dân số cao nhất trong bản đồ phân bố dân số. */
function topPopKind(popMap: Partial<Record<ThapUnitKind, number>>): ThapUnitKind | undefined {
  let bestKind: ThapUnitKind | undefined;
  let bestPop = 0;
  for (const kind of THAP_UNIT_KINDS) {
    const pop = popMap[kind] ?? 0;
    if (pop > bestPop) {
      bestPop = pop;
      bestKind = kind;
    }
  }
  return bestKind;
}

function isFrontlineStable(s: SideState, intel: BattlefieldIntel): boolean {
  return !intel.isEmergency && intel.myPop >= intel.enemyPop && s.baseHp >= s.baseMaxHp * 0.55;
}

function isReasonCurrent(
  brain: AiBrain,
  world: SimWorldState,
  s: SideState,
  intel: BattlefieldIntel,
  nextWaveGold: number,
  frontlineStable: boolean,
): boolean {
  if (brain.preferredCounter !== s.auto) return false;
  const stats = THAP_UNITS[s.auto];
  if (stats.pop > effectiveMaxPop(intel.popRoom)) return false;
  if (brain.counterReason.startsWith('Save ')) {
    return frontlineStable;
  }
  if (stats.cost > nextWaveGold) return false;
  if (intel.isEmergency) {
    const threat = intel.nearDominantEnemy ?? intel.dominantEnemy;
    return threat ? brain.counterReason === `Emergency vs ${threat}` : brain.counterReason.startsWith('Emergency');
  }
  if (brain.counterReason.startsWith('Boss ')) {
    return frontlineStable;
  }
  if (intel.dominantEnemy) {
    return brain.counterReason.includes(intel.dominantEnemy);
  }
  return brain.counterReason === 'Opening' || brain.counterReason === `Push wave ${world.wave}`;
}

/** Nếu đang tích vàng cho Trùm mà cuối đợt đã đủ vàng (hoặc đủ lên High Lord), xác nhận xuất Trùm thay vì hạ bậc. */
function pickBossSaveLateWindowUpgrade(
  s: SideState,
  intel: BattlefieldIntel,
  nextWaveGold: number,
): BotDecision | undefined {
  const maxPop = effectiveMaxPop(intel.popRoom);
  if (
    s.roundIncome >= HIGHLORD_SAVE_INCOME &&
    nextWaveGold >= THAP_UNITS.highlord.cost &&
    maxPop >= THAP_UNITS.highlord.pop
  ) {
    return { kind: 'highlord', reason: 'Boss highlord' };
  }
  const current = THAP_UNITS[s.auto];
  if (nextWaveGold >= current.cost && maxPop >= current.pop) {
    return { kind: s.auto, reason: `Boss ${s.auto}` };
  }
  return undefined;
}

/** Kiểm tra nâng cấp tất định trước thời điểm kết thúc đợt trên độ khó Hard. */
function pickDeterministicUpgrade(
  s: SideState,
  intel: BattlefieldIntel,
  nextWaveGold: number,
  frontlineStable: boolean,
): BotDecision | undefined {
  if (intel.isEmergency) {
    return pickEmergencyDefense(intel, nextWaveGold);
  }
  if (!intel.dominantEnemy) return undefined;

  if (frontlineStable && s.roundIncome >= HIGHLORD_SAVE_INCOME) {
    if (
      nextWaveGold >= THAP_UNITS.highlord.cost &&
      effectiveMaxPop(intel.popRoom) >= THAP_UNITS.highlord.pop
    ) {
      return { kind: 'highlord', reason: 'Boss highlord' };
    }
  }

  const counters = getAffordableCounters(intel.dominantEnemy, nextWaveGold, intel.popRoom);
  const pool = counters.length > 0 ? counters : getAllAffordable(nextWaveGold, intel.popRoom);
  if (pool.length === 0) return undefined;

  const best = rankByArmyScore(pool, intel.enemyPopByKind, nextWaveGold, intel.popRoom)[0];
  if (!best) return undefined;
  const currentScore = scoreUnitVsArmy(s.auto, intel.enemyPopByKind, nextWaveGold, intel.popRoom);
  if (best.score > currentScore * 1.12) {
    return {
      kind: best.kind,
      reason: counters.length > 0 ? `Counter ${intel.dominantEnemy} (Method 481)` : `Affordable vs ${intel.dominantEnemy}`,
    };
  }
  return undefined;
}

/** Đưa ra quyết định chọn quân chính dựa trên khẩn cấp, khai cuộc, trùm cuối và Method 481. */
function evaluateStrategy(
  world: SimWorldState,
  s: SideState,
  profile: BotProfile,
  intel: BattlefieldIntel,
  nextWaveGold: number,
  frontlineStable: boolean,
  rng: () => number,
): BotDecision {
  if (intel.isEmergency) {
    return pickEmergencyDefense(intel, nextWaveGold);
  }

  if (world.wave === 0 || intel.enemyPop === 0) {
    return pickNoEnemyOpeningOrPush(world.wave, s, profile, intel, nextWaveGold, frontlineStable, rng);
  }

  if (profile.canSaveForBoss && frontlineStable) {
    const bossDecision = pickBossDecision(s, intel.popRoom, nextWaveGold, rng);
    if (bossDecision) return bossDecision;
  }

  const dominantEnemy = intel.dominantEnemy!;
  if (rng() < profile.counterAccuracy) {
    return pickMethod481Counter(dominantEnemy, profile, intel, nextWaveGold, rng);
  }

  const fallbackKind = pickTierPoolUnit(nextWaveGold, intel.popRoom, rng);
  return { kind: fallbackKind, reason: `Adapt tier vs ${dominantEnemy}` };
}

/** Chọn quân phòng thủ khẩn cấp giá hợp lý/tốc độ cao khi địch áp sát Pha Lê. */
function pickEmergencyDefense(intel: BattlefieldIntel, nextWaveGold: number): BotDecision {
  const threat = intel.nearDominantEnemy ?? intel.dominantEnemy;
  const threatPopMap = Object.keys(intel.nearEnemyPopByKind).length > 0 ? intel.nearEnemyPopByKind : intel.enemyPopByKind;
  const method481 = threat ? getAffordableCounters(threat, nextWaveGold, intel.popRoom) : [];
  const fastImmediate = filterAffordable(EMERGENCY_FAST_POOL, nextWaveGold, intel.popRoom);

  const candidates = uniqueKinds([...method481, ...fastImmediate]);
  if (candidates.length === 0) {
    const anyAffordable = getAllAffordable(nextWaveGold, intel.popRoom);
    const kind = anyAffordable.length > 0 ? anyAffordable[0] : 'newbie';
    return { kind, reason: threat ? `Emergency vs ${threat}` : 'Emergency defense' };
  }

  const methodSet = new Set<ThapUnitKind>(method481);
  let bestKind = candidates[0];
  let bestScore = -1;

  for (const kind of candidates) {
    const baseScore = scoreUnitVsArmy(kind, threatPopMap, nextWaveGold, intel.popRoom);
    const counterBoost = methodSet.has(kind) ? 1.2 : 1;
    const speedBoost = THAP_UNITS[kind].moveSpeed >= 3.0 || THAP_UNITS[kind].rawRange >= 5 ? 1.12 : 1;
    const total = baseScore * counterBoost * speedBoost;
    if (total > bestScore) {
      bestScore = total;
      bestKind = kind;
    }
  }

  return { kind: bestKind, reason: threat ? `Emergency vs ${threat}` : 'Emergency defense' };
}

/** Chọn quân khai cuộc Round 0 (<= 100g) hoặc đẩy đợt mới khi chưa thấy quân địch trên sân. */
function pickNoEnemyOpeningOrPush(
  wave: number,
  s: SideState,
  profile: BotProfile,
  intel: BattlefieldIntel,
  nextWaveGold: number,
  frontlineStable: boolean,
  rng: () => number,
): BotDecision {
  if (wave === 0 || nextWaveGold <= 100) {
    const openingOptions = filterAffordable(profile.openingPool, nextWaveGold, intel.popRoom);
    const kind = openingOptions.length > 0 ? pickRandom(openingOptions, rng) : 'newbie';
    return { kind, reason: 'Opening' };
  }

  if (profile.canSaveForBoss && frontlineStable) {
    const bossDecision = pickBossDecision(s, intel.popRoom, nextWaveGold, rng);
    if (bossDecision) return bossDecision;
  }

  return {
    kind: pickTierPoolUnit(nextWaveGold, intel.popRoom, rng),
    reason: `Push wave ${wave}`,
  };
}

/** Quyết định tích lũy hoặc triệu hồi Dread Lord / High Lord khi thu nhập cao và tuyến đầu vững. */
function pickBossDecision(
  s: SideState,
  popRoom: number,
  nextWaveGold: number,
  rng: () => number,
): BotDecision | undefined {
  const maxUnitPop = effectiveMaxPop(popRoom);

  if (s.roundIncome >= HIGHLORD_SAVE_INCOME && maxUnitPop >= THAP_UNITS.highlord.pop) {
    if (nextWaveGold >= THAP_UNITS.highlord.cost) {
      if (rng() < 0.7) return { kind: 'highlord', reason: 'Boss highlord' };
    } else if (s.auto === 'highlord') {
      return { kind: 'highlord', reason: 'Save highlord' };
    } else if (nextWaveGold >= THAP_UNITS.highlord.cost * 0.43 && rng() < 0.45) {
      return { kind: 'highlord', reason: 'Save highlord' };
    }
  }

  if (s.roundIncome >= DREADLORD_SAVE_INCOME && maxUnitPop >= THAP_UNITS.dreadlord.pop) {
    if (nextWaveGold >= THAP_UNITS.dreadlord.cost) {
      if (rng() < 0.55) return { kind: 'dreadlord', reason: 'Boss dreadlord' };
    } else if (s.auto === 'dreadlord') {
      return { kind: 'dreadlord', reason: 'Save dreadlord' };
    } else if (nextWaveGold >= THAP_UNITS.dreadlord.cost * 0.45 && rng() < 0.35) {
      return { kind: 'dreadlord', reason: 'Save dreadlord' };
    }
  }

  return undefined;
}

/** Áp dụng bảng khắc chế Method 481 (`MIRAGINE_AI_COUNTERS`) kèm hiệu quả giáp ở mức Khó. */
function pickMethod481Counter(
  dominantEnemy: ThapUnitKind,
  profile: BotProfile,
  intel: BattlefieldIntel,
  nextWaveGold: number,
  rng: () => number,
): BotDecision {
  const affordableCounters = getAffordableCounters(dominantEnemy, nextWaveGold, intel.popRoom);

  if (affordableCounters.length > 0) {
    if (profile.useArmorEfficiency) {
      const ranked = rankByArmyScore(affordableCounters, intel.enemyPopByKind, nextWaveGold, intel.popRoom);
      const top = ranked[0];
      const second = ranked[1];
      const chosen =
        second && second.score >= top.score * 0.85 && rng() >= 0.75 ? second.kind : top.kind;
      return { kind: chosen, reason: `Counter ${dominantEnemy} (Method 481)` };
    }

    return {
      kind: pickRandom(affordableCounters, rng),
      reason: `Counter ${dominantEnemy} (Method 481)`,
    };
  }

  // Khi chưa đủ vàng/dân số cho các quân Method 481 của đối thủ đắt tiền, chọn khắc chế khả thi tốt nhất.
  if (profile.useArmorEfficiency || profile.canSaveForBoss) {
    const allAffordable = getAllAffordable(nextWaveGold, intel.popRoom);
    if (allAffordable.length > 0) {
      const ranked = rankByArmyScore(allAffordable, intel.enemyPopByKind, nextWaveGold, intel.popRoom);
      return { kind: ranked[0].kind, reason: `Affordable vs ${dominantEnemy}` };
    }
  }

  return {
    kind: pickTierPoolUnit(nextWaveGold, intel.popRoom, rng),
    reason: `Affordable vs ${dominantEnemy}`,
  };
}

function getAffordableCounters(
  enemyKind: ThapUnitKind,
  budget: number,
  popRoom: number,
): ThapUnitKind[] {
  const enemyId = THAP_UNITS[enemyKind].id;
  const counterIds = MIRAGINE_AI_COUNTERS[enemyId] ?? [4, 7, 8];
  const counterKinds = counterIds
    .map((id) => THAP_UNIT_KINDS[id])
    .filter((k): k is ThapUnitKind => Boolean(k));
  return filterAffordable(counterKinds, budget, popRoom);
}

function getAllAffordable(budget: number, popRoom: number): ThapUnitKind[] {
  return filterAffordable(THAP_UNIT_KINDS, budget, popRoom);
}

function filterAffordable(
  kinds: readonly ThapUnitKind[],
  budget: number,
  popRoom: number,
): ThapUnitKind[] {
  const maxUnitPop = effectiveMaxPop(popRoom);
  return kinds.filter((k) => {
    const stats = THAP_UNITS[k];
    return stats.cost <= budget && stats.pop <= maxUnitPop;
  });
}

function effectiveMaxPop(popRoom: number): number {
  return popRoom > 0 ? popRoom : 1;
}

function pickTierPoolUnit(budget: number, popRoom: number, rng: () => number): ThapUnitKind {
  const primaryPool =
    budget >= 220 ? HIGH_TIER_POOL : budget >= 100 ? MID_TIER_POOL : LOW_TIER_POOL;
  const primaryAffordable = filterAffordable(primaryPool, budget, popRoom);
  if (primaryAffordable.length > 0) {
    return pickRandom(primaryAffordable, rng);
  }
  const lowAffordable = filterAffordable(LOW_TIER_POOL, budget, popRoom);
  if (lowAffordable.length > 0) {
    return pickRandom(lowAffordable, rng);
  }
  return 'newbie';
}

function rankByArmyScore(
  candidates: readonly ThapUnitKind[],
  enemyPopByKind: Partial<Record<ThapUnitKind, number>>,
  budget: number,
  popRoom: number,
): Array<{ kind: ThapUnitKind; score: number }> {
  return candidates
    .map((kind) => ({
      kind,
      score: scoreUnitVsArmy(kind, enemyPopByKind, budget, popRoom),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Chấm điểm hiệu quả giao tranh thực tế của một loại quân trong đợt tới
 * dựa theo công thức sát thương giáp Method 493, máu chống chịu, sát thương lan và số lượng xuất quân.
 */
function scoreUnitVsArmy(
  candidate: ThapUnitKind,
  enemyPopByKind: Partial<Record<ThapUnitKind, number>>,
  budget: number,
  popRoom: number,
): number {
  const c = THAP_UNITS[candidate];
  const maxUnitPop = effectiveMaxPop(popRoom);
  if (c.cost > budget || c.pop > maxUnitPop) return -1;

  const waveCount = Math.max(1, Math.min(Math.floor(budget / c.cost), Math.floor(maxUnitPop / c.pop)));
  let totalWeight = 0;
  let weightedOutDps = 0;
  let weightedInDps = 0;

  for (const enemyKind of THAP_UNIT_KINDS) {
    const weight = enemyPopByKind[enemyKind] ?? 0;
    if (weight <= 0) continue;
    const e = THAP_UNITS[enemyKind];
    const outDmg = miragineDamage(candidate, enemyKind);
    const inDmg = miragineDamage(enemyKind, candidate);
    weightedOutDps += weight * (outDmg / Math.max(0.2, c.cd));
    weightedInDps += weight * (inDmg / Math.max(0.2, e.cd));
    totalWeight += weight;
  }

  const avgOutDps =
    totalWeight > 0 ? weightedOutDps / totalWeight : (c.damage[0] + c.damage[1]) / (2 * Math.max(0.2, c.cd));
  const avgInDps = totalWeight > 0 ? weightedInDps / totalWeight : 12;

  const splashMult = c.splash ? 1.4 : 1;
  const rangeMult = c.rawRange >= 4 ? 1.2 : 1;
  const speedMult = c.moveSpeed >= 3 ? 1.08 : 1;

  const singleUnitPower = (avgOutDps * splashMult * rangeMult * speedMult * c.hp) / Math.max(1, avgInDps);
  const wavePower = Math.pow(waveCount, 1.45) * singleUnitPower;
  const spendRatio = (waveCount * c.cost) / Math.max(1, budget);
  return wavePower * (0.9 + 0.1 * spendRatio);
}

function uniqueKinds(kinds: readonly ThapUnitKind[]): ThapUnitKind[] {
  const seen = new Set<ThapUnitKind>();
  const out: ThapUnitKind[] = [];
  for (const kind of kinds) {
    if (!seen.has(kind)) {
      seen.add(kind);
      out.push(kind);
    }
  }
  return out;
}

function pickRandom<T>(items: readonly T[], rng: () => number): T {
  const clamped = Math.min(0.999999, Math.max(0, rng()));
  return items[Math.floor(clamped * items.length)];
}
