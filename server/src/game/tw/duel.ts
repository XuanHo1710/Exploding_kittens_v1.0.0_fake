/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) — Động cơ Đơn Đấu Diễn Nghĩa (Romance Mode Duels)
 * & Tuyệt Kỹ Ngũ Hành Danh Tướng (Active Wu Xing General Skills).
 *
 * Phụ trách:
 * 1. `TwActiveDuel`: trạng thái thời gian thực mở rộng từ `TwDuelFrame` cho vòng tròn Đơn Đấu 1v1.
 * 2. `tryStartGeneralDuel`: kiểm định điều kiện Diễn Nghĩa (`romanceMode`), cự ly khiêu chiến (`<= 420`, hoặc
 *    thúc ngựa truy kích `420 < dist <= 900` tự mở đấu khi vào `<= 220`), Mưu Sĩ hệ Thủy từ chối đấu võ trừ phi
 *    bị dồn sát (`dist < 110`), kéo hai danh tướng vào tâm võ đài và đẩy quân lính dạt ra ngoài bán kính `95`.
 * 3. `stepGeneralDuels`: mô phỏng vũ đạo quần thảo & tung đòn mỗi `1.2s` dựa trên `duelPower`, `meleeAtk`,
 *    `meleeDef`, `armor`, hệ Dũng Tướng (`champion`) và cường hóa `duel_buff` / `iron_evasion`; xử lý kết liễu
 *    (hồi `15%` máu tối đa, `+22` Sĩ khí đồng minh trong `500`, sốc `-28` Sĩ khí toàn quân chủ tướng bại trận)
 *    hoặc hòa danh dự khi hết `30s`.
 * 4. `castGeneralSkill`: thi triển 5 nhóm tuyệt kỹ Ngũ Hành (`aoe_smash`, `duel_buff`, `iron_evasion`,
 *    `rally_horn`, `fire_volley`) chuẩn phong cách Total War: Three Kingdoms.
 */

import {
  TW_CLASSES,
  TW_GENERALS,
  TW_UNITS,
  twRankFromKills,
  type TwDuelFrame,
  type TwDuelStance,
  type TwGeneralSpec,
  type TwMoraleState,
  type TwSfxEvent,
} from '../../../../shared/src/tw';
import {
  fatigueStateFromVal,
  normalizeAngle,
  recomputeRegimentDimensions,
  type TwSimRegiment,
} from './formations';

// ============================================================================
// 1. HẰNG SỐ ĐƠN ĐẤU & TUYỆT KỸ NGŨ HÀNH
// ============================================================================

/** Cự ly tối đa mở vòng Đơn Đấu ngay lập tức */
export const TW_DUEL_INITIATE_MAX_DIST = 420;
/** Cự ly tối đa nhận lệnh thúc ngựa áp sát để Đơn Đấu */
export const TW_DUEL_GALLOP_MAX_DIST = 900;
/** Cự ly tự động khai mở vòng Đơn Đấu khi tướng đang thúc ngựa truy kích */
export const TW_DUEL_GALLOP_TRIGGER_DIST = 220;
/** Cự ly bị dồn sát khiến Mưu Sĩ hệ Thủy (`strategist`) buộc phải tiếp chiêu */
export const TW_DUEL_STRATEGIST_CORNERED_DIST = 110;

/** Bán kính vòng tròn danh dự — binh sĩ hai bên tự dạt ra ngoài ("Soldiers make way!") */
export const TW_DUEL_RING_CLEAR_RADIUS = 95;
/** Bán kính quỹ đạo hai chiến mã quần thảo quanh tâm võ đài */
const DUEL_ORBIT_RADIUS = 26;
/** Bán kính lao sát vào nhau tại khoảnh khắc giao binh khí */
const DUEL_LUNGE_MIN_RADIUS = 10;
/** Tốc độ xoay vòng chiến mã trong võ đài (rad/giây) */
const DUEL_ORBIT_ANGULAR_SPEED = 1.38;
/** Thời lượng hiệu ứng lao vào chém nhau mỗi hiệp (giây) */
const DUEL_LUNGE_DURATION_SEC = 0.36;

/** Chu kỳ mỗi hiệp giao phong nảy lửa trong Đơn Đấu (giây) */
export const TW_DUEL_CLASH_INTERVAL_SEC = 1.2;
/** Thời lượng tối đa một trận Đơn Đấu trước khi bất phân thắng bại (giây) */
export const TW_DUEL_MAX_DURATION_SEC = 30;

/** Thưởng & phạt hậu quả Đơn Đấu sinh tử */
const DUEL_WINNER_HEAL_RATIO = 0.15;
const DUEL_ALLY_MORALE_RADIUS = 500;
const DUEL_ALLY_MORALE_SURGE = 22;
const DUEL_LOSER_ARMY_MORALE_SHOCK = -28;

/** Kích thước bản đồ tiêu chuẩn Tam Quốc Toàn Chiến để kẹp biên an toàn */
const DEFAULT_BATTLEFIELD_W = 3200;
const DEFAULT_BATTLEFIELD_H = 2200;
const DUEL_CENTER_MARGIN = 110;
const REGIMENT_BOUND_MARGIN = 36;

// ============================================================================
// 2. KIỂU DỮ LIỆU TRẠNG THÁI ĐƠN ĐẤU THỜI GIAN THỰC
// ============================================================================

export interface TwActiveDuel extends TwDuelFrame {
  stanceA: TwDuelStance;
  stanceB: TwDuelStance;
  /** Bộ đếm tích lũy thời gian chờ tới hiệp giao binh tiếp theo (`1.2s`) */
  clashTimerSec: number;
  /** Góc xoay hiện tại của cặp tướng quần thảo quanh tâm `(x, y)` (radian) */
  orbitAngle: number;
  /** Thời gian còn lại của pha thúc ngựa lao sát chém nhau sau mỗi `clashPhase` */
  lungeTimerSec: number;
  /** Bán kính vòng vây danh dự đẩy quân lính dạt ra ngoài (`95`) */
  ringRadius: number;
}

interface PendingDuelChallenge {
  targetRegId: number;
  nextDuelId: () => number;
  romanceMode: boolean;
}

/**
 * Lưu các lệnh khiêu chiến Đơn Đấu đang trong pha thúc ngựa áp sát (`420 < dist <= 900`)
 * để tự động khai mở võ đài ngay khi hai tướng rút ngắn khoảng cách xuống `<= 220`.
 */
const pendingDuelChallenges = new WeakMap<TwSimRegiment, PendingDuelChallenge>();

export function hasPendingDuelChallenge(reg: TwSimRegiment): boolean {
  return pendingDuelChallenges.has(reg);
}

// ============================================================================
// HÀM TIỆN ÍCH NỘI BỘ (TOÁN HỌC, SĨ KHÍ, SÁT THƯƠNG & VÒNG VÂY)
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function isAliveRegiment(reg: TwSimRegiment): boolean {
  return reg.men > 0 && reg.hp > 0 && reg.anim !== 'dead';
}

function isRoutingOrShattered(reg: TwSimRegiment): boolean {
  return reg.moraleState === 'routing' || reg.moraleState === 'shattered';
}

function isUnbreakableBuffActive(reg: TwSimRegiment): boolean {
  if (reg.guanxiState === 'enraged' || (reg.guanxiEnrageLeftSec ?? 0) > 0) return true;
  if (reg.activeBuffLeftSec <= 0) return false;
  return reg.activeBuff === 'iron_evasion' || reg.activeBuff === 'duel_buff';
}

/**
 * Cập nhật `morale` và đồng bộ `moraleState` chuẩn thang Sĩ khí Total War: Three Kingdoms.
 * Nếu `forceRally === true` (như hiệu lệnh `rally_horn`), trung đoàn đang `routing` sẽ lập tức
 * chỉnh đốn đội ngũ trở lại trạng thái chiến đấu (trừ phi đã `shattered`).
 */
function applyMoraleDelta(
  reg: TwSimRegiment,
  delta: number,
  forceRally = false,
  sfxOut?: Set<TwSfxEvent>,
): void {
  if (!isAliveRegiment(reg) || reg.moraleState === 'shattered') return;

  const prevState: TwMoraleState = reg.moraleState;
  let nextMorale = clamp(reg.morale + delta, 0, 100);

  if (delta < 0 && isUnbreakableBuffActive(reg)) {
    // Tướng/bộ tùy đang có Kim Thân Bất Khuất (`iron_evasion` / `duel_buff`) không bao giờ tụt xuống vỡ trận
    nextMorale = Math.max(45, nextMorale);
  }

  if (forceRally && prevState === 'routing') {
    nextMorale = Math.max(44, nextMorale);
  }

  reg.morale = Math.round(nextMorale * 10) / 10;

  if (reg.morale <= 4 && reg.men <= Math.max(2, Math.floor(reg.maxMen * 0.12)) && !reg.isGeneral) {
    reg.moraleState = 'shattered';
  } else if (reg.morale <= 18) {
    reg.moraleState = 'routing';
  } else if (reg.morale < 36) {
    // Đơn vị đang tháo chạy cần hồi đủ ngưỡng hoặc có hiệu lệnh `forceRally` mới dừng bỏ chạy
    reg.moraleState = prevState === 'routing' && !forceRally ? 'routing' : 'wavering';
  } else if (reg.morale < 72) {
    reg.moraleState = prevState === 'routing' && !forceRally && reg.morale < 42 ? 'routing' : 'steady';
  } else {
    reg.moraleState = 'eager';
  }

  if (
    prevState !== 'routing' &&
    (reg.moraleState === 'routing' || reg.moraleState === 'shattered')
  ) {
    if (reg.duelId === undefined) {
      reg.anim = 'rout';
      reg.lockedTargetId = undefined;
      reg.engagedWithId = undefined;
    }
    sfxOut?.add('rout');
  } else if (
    prevState === 'routing' &&
    reg.moraleState !== 'routing' &&
    reg.moraleState !== 'shattered'
  ) {
    if (reg.anim === 'rout') {
      reg.anim = 'idle';
      reg.vx = 0;
      reg.vy = 0;
    }
  }
}

/**
 * Đẩy nhẹ toàn bộ trung đoàn không tham gia Đơn Đấu ra ngoài bán kính `ringRadius` (`95` đơn vị)
 * quanh tâm võ đài `(cx, cy)` — tái hiện cảnh ba quân dạt sang hai bên nhường đất cho hai vị mãnh tướng!
 */
function clearDuelRingSpace(
  cx: number,
  cy: number,
  ringRadius: number,
  genAId: number,
  genBId: number,
  allRegs: TwSimRegiment[],
  instantSnap: boolean,
  dtSec: number,
): void {
  const targetClearDist = ringRadius + 6;

  for (let i = 0; i < allRegs.length; i++) {
    const reg = allRegs[i];
    if (
      reg.id === genAId ||
      reg.id === genBId ||
      !isAliveRegiment(reg) ||
      reg.duelId !== undefined
    ) {
      continue;
    }

    // Ngắt khóa mục tiêu / cận chiến nhắm vào hai tướng đang Đơn Đấu danh dự
    if (reg.engagedWithId === genAId || reg.engagedWithId === genBId) {
      reg.engagedWithId = undefined;
    }
    if (reg.lockedTargetId === genAId || reg.lockedTargetId === genBId) {
      reg.lockedTargetId = undefined;
    }

    const dx = reg.x - cx;
    const dy = reg.y - cy;
    if (Math.abs(dx) > targetClearDist || Math.abs(dy) > targetClearDist) continue;

    const dist = Math.hypot(dx, dy);
    if (dist >= ringRadius) continue;

    let ux: number;
    let uy: number;
    if (dist > 1e-3) {
      ux = dx / dist;
      uy = dy / dist;
    } else {
      const fallbackAngle = (reg.id * 2.399963) % (Math.PI * 2);
      ux = Math.cos(fallbackAngle);
      uy = Math.sin(fallbackAngle);
    }

    const neededPush = targetClearDist - dist;
    const pushStep = instantSnap ? neededPush : Math.min(neededPush, Math.max(18, 135 * dtSec));

    reg.x = clamp(
      reg.x + ux * pushStep,
      REGIMENT_BOUND_MARGIN,
      DEFAULT_BATTLEFIELD_W - REGIMENT_BOUND_MARGIN,
    );
    reg.y = clamp(
      reg.y + uy * pushStep,
      REGIMENT_BOUND_MARGIN,
      DEFAULT_BATTLEFIELD_H - REGIMENT_BOUND_MARGIN,
    );

    if (neededPush > 6) {
      reg.bracedTicks = 0;
    }
  }
}

/** Đồng bộ quân số hiển thị (`men`) và kích thước đội hình của đơn vị sau khi thay đổi `hp` */
function syncRegimentMenFromHp(reg: TwSimRegiment): number {
  const prevMen = reg.men;
  if (reg.hp <= 0) {
    reg.hp = 0;
    reg.men = 0;
    if (reg.duelId === undefined) {
      reg.anim = 'dead';
      reg.vx = 0;
      reg.vy = 0;
      reg.chargeTicks = 0;
      reg.bracedTicks = 0;
      reg.lockedTargetId = undefined;
      reg.engagedWithId = undefined;
      reg.moveTargetX = undefined;
      reg.moveTargetY = undefined;
      reg.moveTargetFacing = undefined;
    }
    return Math.max(0, prevMen);
  }

  if (reg.maxMen <= 1) {
    reg.men = 1;
    return 0;
  }

  const nextMen = clamp(
    Math.ceil((reg.hp / Math.max(1, reg.maxHp)) * reg.maxMen),
    1,
    reg.maxMen,
  );
  const slain = Math.max(0, prevMen - nextMen);
  if (nextMen !== prevMen) {
    reg.men = nextMen;
    recomputeRegimentDimensions(reg);
  }
  return slain;
}

/** Gây sát thương kỹ năng lên một trung đoàn địch và cộng số lính hạ gục cho tướng xuất chiêu */
function dealSkillDamageToRegiment(
  caster: TwSimRegiment,
  target: TwSimRegiment,
  rawDamage: number,
  armorPiercingRatio: number,
): number {
  if (!isAliveRegiment(target) || rawDamage <= 0) return 0;

  let armorVal = 0;
  if (target.isGeneral && target.generalId && TW_GENERALS[target.generalId]) {
    armorVal = TW_GENERALS[target.generalId].armor;
  } else {
    armorVal = TW_UNITS[target.kind].armor;
  }

  const armorPct = clamp(armorVal, 0, 85) / 100;
  const apRatio = clamp(armorPiercingRatio, 0, 1);
  const normalRatio = 1 - apRatio;
  const mitigation = apRatio + normalRatio * (1 - armorPct * 0.78);
  const finalDmg = Math.max(12, Math.round(rawDamage * mitigation));

  target.hp = Math.max(0, target.hp - finalDmg);
  const slain = syncRegimentMenFromHp(target);
  if (slain > 0) {
    caster.kills += slain;
    caster.rank = twRankFromKills(caster.kills);
  }
  return finalDmg;
}

/** Tính sát thương một chiêu xuất đao/thương trong hiệp Đơn Đấu (`1.2s`) có xét Thế Đấu & Cuồng Nộ Guanxi */
function computeDuelClashDamage(
  attacker: TwSimRegiment,
  atkSpec: TwGeneralSpec,
  defender: TwSimRegiment,
  defSpec: TwGeneralSpec,
  modeHpScale: number,
  attackerStance: TwDuelStance = 'balanced',
  defenderStance: TwDuelStance = 'balanced',
): number {
  const atkDuelBuff = attacker.activeBuff === 'duel_buff' && attacker.activeBuffLeftSec > 0;
  const defDuelBuff = defender.activeBuff === 'duel_buff' && defender.activeBuffLeftSec > 0;
  const defIronBuff = defender.activeBuff === 'iron_evasion' && defender.activeBuffLeftSec > 0;
  const atkEnraged =
    attacker.guanxiState === 'enraged' || (attacker.guanxiEnrageLeftSec ?? 0) > 0;

  // Dũng Tướng hệ Mộc (`champion`) có ưu thế võ đài bẩm sinh + cường hóa `duel_buff` + Cuồng Nộ Báo Thù (+16)
  const effAtkDuelPower =
    atkSpec.duelPower +
    (atkSpec.class === 'champion' ? 6 : 0) +
    (atkDuelBuff ? 18 : 0) +
    (atkEnraged ? 16 : 0);
  const effDefDuelPower =
    defSpec.duelPower +
    (defSpec.class === 'champion' ? 6 : 0) +
    (defDuelBuff ? 10 : 0) +
    (defIronBuff ? 8 : 0);

  const duelDelta = clamp(effAtkDuelPower - effDefDuelPower, -55, 55);
  const duelDominanceMul = Math.pow(1.0165, duelDelta);

  const rawAuraAtk =
    Number.isFinite(attacker.auraAtkMul) && attacker.auraAtkMul > 0 ? attacker.auraAtkMul : 1.0;
  const effAtkMul = atkDuelBuff ? Math.max(1.45, rawAuraAtk) : rawAuraAtk;
  const effMeleeAtk = atkSpec.meleeAtk * effAtkMul;

  const rawAuraDef = Number.isFinite(defender.auraDefAdd) ? defender.auraDefAdd : 0;
  const effDefAdd = defIronBuff ? Math.max(35, rawAuraDef) : rawAuraDef;
  const defStanceMod =
    defenderStance === 'guard' ? 24 : defenderStance === 'press' ? -12 : 0;
  const effMeleeDef = Math.max(6, defSpec.meleeDef + effDefAdd + defStanceMod);

  const meleeHitFactor = clamp(0.56 + (effMeleeAtk - effMeleeDef) * 0.0085, 0.26, 1.48);

  // Thần binh Danh tướng có tỷ lệ xuyên giáp cao (55% xuyên giáp + 45% giảm bởi giáp trụ)
  const defArmorPct = clamp(defSpec.armor, 0, 85) / 100;
  const armorFactor = 0.55 + 0.45 * (1 - defArmorPct * 0.75);

  const martialScale = 1 + effAtkDuelPower * 0.0034;
  const variance = 0.9 + Math.random() * 0.22;
  const critChance = (atkDuelBuff ? 0.24 : 0.14) + (attackerStance === 'press' ? 0.1 : 0);
  const critRiposte = Math.random() < critChance ? 1.26 : 1.0;

  // Hệ số Thế Đấu (Press +24% công; Guard 0.85x công nhưng Phản Đòn Riposte +35% khi địch Dồn Đòn Press!)
  let atkStanceMul = 1.0;
  if (attackerStance === 'press') {
    atkStanceMul = 1.24;
  } else if (attackerStance === 'guard') {
    atkStanceMul = defenderStance === 'press' ? 1.35 : 0.85;
  }
  const defStanceIncomingMul = defenderStance === 'guard' ? 0.8 : 1.0;
  const enrageDmgMul = atkEnraged ? 1.2 : 1.0;

  const baseStrike = 166 * modeHpScale * atkStanceMul;
  const dmg =
    baseStrike *
    duelDominanceMul *
    meleeHitFactor *
    armorFactor *
    martialScale *
    variance *
    critRiposte *
    defStanceIncomingMul *
    enrageDmgMul;

  return Math.max(18, Math.round(dmg));
}

function buildDuelVictoryLog(winnerSpec: TwGeneralSpec, loserSpec: TwGeneralSpec): string {
  switch (winnerSpec.id) {
    case 'lu_bu':
      return `⚔️ Chiến Thần Lữ Bố vung Phương Thiên Họa Kích chém gục ${loserSpec.vnName} trong trận Đơn Đấu! Toàn quân địch kinh hồn bạt vía!`;
    case 'guan_yu':
      return `⚔️ Võ Thánh Quan Vũ vung Thanh Long Yển Nguyệt Đao chém gục ${loserSpec.vnName} trong trận Đơn Đấu! Uy chấn Hoa Hạ!`;
    case 'zhang_fei':
      return `⚔️ Trương Phi thét vang như sấm, đâm gục ${loserSpec.vnName} bằng Bát Xà Mâu trong trận Đơn Đấu!`;
    case 'zhao_yun':
      return `⚔️ Thường Sơn Triệu Tử Long múa Long Đảm Thương hạ gục ${loserSpec.vnName} giữa vòng Đơn Đấu!`;
    case 'xiahou_dun':
      return `⚔️ Độc Nhãn Tướng Quân Hạ Hầu Đôn cuồng nộ chém gục ${loserSpec.vnName} trong trận Đơn Đấu!`;
    case 'sun_jian':
      return `⚔️ Mãnh Hổ Giang Đông Tôn Kiên vung Cổ Đĩnh Đao hạ gục ${loserSpec.vnName} trong trận Đơn Đấu!`;
    default:
      return `⚔️ ${winnerSpec.vnName} (${winnerSpec.courtesyName}) chém gục danh tướng ${loserSpec.vnName} trong trận Đơn Đấu!`;
  }
}

/** Trích xuất khung dữ liệu gọn nhẹ gửi qua mạng (`TwDuelFrame`) từ `TwActiveDuel` */
export function toDuelFrame(duel: TwActiveDuel): TwDuelFrame {
  return {
    id: duel.id,
    genARegId: duel.genARegId,
    genBRegId: duel.genBRegId,
    generalA: duel.generalA,
    generalB: duel.generalB,
    ownerA: duel.ownerA,
    ownerB: duel.ownerB,
    x: duel.x,
    y: duel.y,
    hpA: duel.hpA,
    maxHpA: duel.maxHpA,
    hpB: duel.hpB,
    maxHpB: duel.maxHpB,
    timerLeft: Math.round(duel.timerLeft * 10) / 10,
    clashPhase: duel.clashPhase,
    stanceA: duel.stanceA ?? 'balanced',
    stanceB: duel.stanceB ?? 'balanced',
  };
}

// ============================================================================
// 3. KHỞI TẠO ĐƠN ĐẤU VÕ TƯỚNG 1V1 (ROMANCE MODE SINGLE DUEL)
// ============================================================================

/**
 * Kiểm tra và khởi tạo trận Đơn Đấu 1v1 (`Đấu Tướng Đơn Đấu`) chuẩn Total War: Three Kingdoms:
 * - Bắt buộc `romanceMode === true`, cả hai đều là Danh tướng khác phe, còn sống, không tháo chạy, chưa ở trong vòng đấu.
 * - Nếu khoảng cách `420 < dist <= 900`: gán `challenger.lockedTargetId = target.id` để tướng thúc ngựa lao vào
 *   và tự động mở vòng Đơn Đấu ngay khi thu hẹp khoảng cách còn `<= 220`!
 * - Mưu Sĩ hệ Thủy (`class === 'strategist'`, vd: Gia Cát Lượng, Chu Du) khéo léo từ chối Đơn Đấu tay đôi
 *   trừ khi bị dồn sát cận kề (`dist < 110`).
 * - Khi khai chiến: kéo hai tướng vào tâm võ đài `(mx, my)`, khóa `duelId`, đặt `anim = 'duel'`,
 *   đẩy các trung đoàn xung quanh dạt ra ngoài bán kính `95` đơn vị và gióng chiêng `'duel_gong'`!
 */
export function tryStartGeneralDuel(
  challenger: TwSimRegiment,
  target: TwSimRegiment,
  allRegs: TwSimRegiment[],
  activeDuels: TwActiveDuel[],
  nextDuelId: () => number,
  romanceMode: boolean,
  sfxOut: Set<TwSfxEvent>,
): { ok: boolean; reason?: string; duel?: TwActiveDuel } {
  if (!romanceMode) {
    return {
      ok: false,
      reason: 'Chế độ Sử Gia (Records Mode) không mở Đơn Đấu 1v1 — chỉ khả dụng ở Chế độ Diễn Nghĩa!',
    };
  }

  if (!challenger || !target || challenger.id === target.id) {
    return { ok: false, reason: 'Mục tiêu khiêu chiến Đơn Đấu không hợp lệ.' };
  }

  if (!challenger.isGeneral || !challenger.generalId || !TW_GENERALS[challenger.generalId]) {
    return { ok: false, reason: 'Đơn vị phát lệnh khiêu chiến không phải là Danh Tướng.' };
  }

  if (!target.isGeneral || !target.generalId || !TW_GENERALS[target.generalId]) {
    return { ok: false, reason: 'Mục tiêu được chọn không phải là Danh Tướng đối phương.' };
  }

  if (challenger.team === target.team || challenger.ownerIdx === target.ownerIdx) {
    return { ok: false, reason: 'Không thể thách đấu Danh Tướng cùng Liên Minh!' };
  }

  if (!isAliveRegiment(challenger) || isRoutingOrShattered(challenger)) {
    return { ok: false, reason: 'Danh tướng phe ta đã trọng thương hoặc đang dao động tháo chạy.' };
  }

  if (!isAliveRegiment(target) || isRoutingOrShattered(target)) {
    return { ok: false, reason: 'Tướng địch đã gục ngã hoặc đang bỏ chạy tán loạn.' };
  }

  if (challenger.duelId !== undefined || target.duelId !== undefined) {
    return { ok: false, reason: 'Một trong hai vị tướng đang bận giao chiến trong vòng Đơn Đấu khác.' };
  }

  for (let i = 0; i < activeDuels.length; i++) {
    const d = activeDuels[i];
    if (
      d.genARegId === challenger.id ||
      d.genBRegId === challenger.id ||
      d.genARegId === target.id ||
      d.genBRegId === target.id
    ) {
      return { ok: false, reason: 'Danh tướng đã có mặt trong một trận Đơn Đấu đang diễn ra.' };
    }
  }

  const challengerSpec = TW_GENERALS[challenger.generalId];
  const targetSpec = TW_GENERALS[target.generalId];
  const dx = target.x - challenger.x;
  const dy = target.y - challenger.y;
  const dist = Math.hypot(dx, dy);

  if (dist > TW_DUEL_GALLOP_MAX_DIST) {
    return {
      ok: false,
      reason: `${targetSpec.vnName} ở quá xa tầm khiêu chiến (${Math.round(dist)} > ${TW_DUEL_GALLOP_MAX_DIST}).`,
    };
  }

  // Mưu Sĩ hệ Thủy (`strategist`) lịch thiệp từ chối đấu võ 1v1 trừ khi đã bị dồn sát (< 110)
  if (targetSpec.class === 'strategist' && dist >= TW_DUEL_STRATEGIST_CORNERED_DIST) {
    pendingDuelChallenges.delete(challenger);
    return {
      ok: false,
      reason: `${targetSpec.vnName} là Mưu Sĩ hệ Thủy, phe phẩy quạt lông từ chối Đơn Đấu võ biền!`,
    };
  }

  if (challengerSpec.class === 'strategist' && dist >= TW_DUEL_STRATEGIST_CORNERED_DIST) {
    pendingDuelChallenges.delete(challenger);
    return {
      ok: false,
      reason: `${challengerSpec.vnName} là Mưu Sĩ hệ Thủy, chỉ luận binh pháp chứ không đấu võ ở cự ly xa!`,
    };
  }

  // Khoảng cách trung bình (420 < dist <= 900): thúc chiến mã truy kích, tự mở Đơn Đấu khi vào <= 220!
  if (dist > TW_DUEL_INITIATE_MAX_DIST) {
    challenger.lockedTargetId = target.id;
    challenger.runOrder = true;
    challenger.moveTargetX = undefined;
    challenger.moveTargetY = undefined;
    challenger.moveTargetFacing = undefined;
    pendingDuelChallenges.set(challenger, {
      targetRegId: target.id,
      nextDuelId,
      romanceMode,
    });
    return {
      ok: false,
      reason: `${challengerSpec.vnName} đang thúc ngựa áp sát ${targetSpec.vnName} để mở vòng Đơn Đấu!`,
    };
  }

  pendingDuelChallenges.delete(challenger);
  pendingDuelChallenges.delete(target);

  // Xác định tâm võ đài danh dự (mx, my) và kéo hai vị tướng vào thế đối mặt giao phong
  const mx = clamp(
    (challenger.x + target.x) * 0.5,
    DUEL_CENTER_MARGIN,
    DEFAULT_BATTLEFIELD_W - DUEL_CENTER_MARGIN,
  );
  const my = clamp(
    (challenger.y + target.y) * 0.5,
    DUEL_CENTER_MARGIN,
    DEFAULT_BATTLEFIELD_H - DUEL_CENTER_MARGIN,
  );

  const initialAngle = dist > 1e-3 ? Math.atan2(dy, dx) : normalizeAngle(challenger.facing);
  const duelId = nextDuelId();

  challenger.x = Math.round((mx - Math.cos(initialAngle) * DUEL_ORBIT_RADIUS) * 10) / 10;
  challenger.y = Math.round((my - Math.sin(initialAngle) * DUEL_ORBIT_RADIUS) * 10) / 10;
  challenger.facing = normalizeAngle(initialAngle);
  challenger.vx = 0;
  challenger.vy = 0;
  challenger.chargeTicks = 0;
  challenger.bracedTicks = 0;
  challenger.lockedTargetId = undefined;
  challenger.engagedWithId = undefined;
  challenger.moveTargetX = undefined;
  challenger.moveTargetY = undefined;
  challenger.moveTargetFacing = undefined;
  challenger.duelId = duelId;
  challenger.anim = 'duel';

  target.x = Math.round((mx + Math.cos(initialAngle) * DUEL_ORBIT_RADIUS) * 10) / 10;
  target.y = Math.round((my + Math.sin(initialAngle) * DUEL_ORBIT_RADIUS) * 10) / 10;
  target.facing = normalizeAngle(initialAngle + Math.PI);
  target.vx = 0;
  target.vy = 0;
  target.chargeTicks = 0;
  target.bracedTicks = 0;
  target.lockedTargetId = undefined;
  target.engagedWithId = undefined;
  target.moveTargetX = undefined;
  target.moveTargetY = undefined;
  target.moveTargetFacing = undefined;
  target.duelId = duelId;
  target.anim = 'duel';

  // Ba quân hai bên dạt ra ngoài bán kính 95 đơn vị nhường võ đài cho hai vị Danh tướng
  clearDuelRingSpace(
    mx,
    my,
    TW_DUEL_RING_CLEAR_RADIUS,
    challenger.id,
    target.id,
    allRegs,
    true,
    0,
  );

  const duel: TwActiveDuel = {
    id: duelId,
    genARegId: challenger.id,
    genBRegId: target.id,
    generalA: challenger.generalId,
    generalB: target.generalId,
    ownerA: challenger.ownerIdx,
    ownerB: target.ownerIdx,
    x: Math.round(mx * 10) / 10,
    y: Math.round(my * 10) / 10,
    hpA: Math.round(challenger.hp),
    maxHpA: Math.round(challenger.maxHp),
    hpB: Math.round(target.hp),
    maxHpB: Math.round(target.maxHp),
    timerLeft: TW_DUEL_MAX_DURATION_SEC,
    clashPhase: 0,
    stanceA: 'balanced',
    stanceB: 'balanced',
    clashTimerSec: 0,
    orbitAngle: initialAngle,
    lungeTimerSec: 0,
    ringRadius: TW_DUEL_RING_CLEAR_RADIUS,
  };

  activeDuels.push(duel);
  sfxOut.add('duel_gong');

  return { ok: true, duel };
}

// ============================================================================
// 4. MÔ PHỎNG DIỄN BIẾN ĐƠN ĐẤU 15 HZ (CLASHES, VICTORY & MORALE SHOCK)
// ============================================================================

function resolveDuelFatality(
  duel: TwActiveDuel,
  winner: TwSimRegiment,
  loser: TwSimRegiment,
  allRegs: TwSimRegiment[],
  sfxOut: Set<TwSfxEvent>,
  logs: string[],
  duelWinners: { winner: TwSimRegiment; loser: TwSimRegiment }[],
): void {
  const winnerSpec = winner.generalId ? TW_GENERALS[winner.generalId] : undefined;
  const loserSpec = loser.generalId ? TW_GENERALS[loser.generalId] : undefined;

  // Xử lý tướng bại trận gục ngã trên võ đài
  const prevLoserMen = Math.max(1, loser.men);
  loser.duelId = undefined;
  loser.hp = 0;
  loser.men = 0;
  loser.vx = 0;
  loser.vy = 0;
  loser.chargeTicks = 0;
  loser.bracedTicks = 0;
  loser.lockedTargetId = undefined;
  loser.engagedWithId = undefined;
  loser.moveTargetX = undefined;
  loser.moveTargetY = undefined;
  loser.moveTargetFacing = undefined;
  loser.anim = 'dead';

  // Xử lý danh tướng chiến thắng: hồi 15% máu tối đa, cộng chiến công & trở lại chỉ huy đại quân
  winner.duelId = undefined;
  winner.anim = 'idle';
  winner.vx = 0;
  winner.vy = 0;
  winner.hp = Math.min(
    winner.maxHp,
    Math.max(1, Math.round(winner.hp + winner.maxHp * DUEL_WINNER_HEAL_RATIO)),
  );
  syncRegimentMenFromHp(winner);
  winner.kills += prevLoserMen;
  winner.rank = twRankFromKills(winner.kills);

  // Đồng minh trong bán kính 500 bùng nổ +22 Sĩ khí; TOÀN BỘ trung đoàn của chủ tướng bại trận chịu sốc -28 Sĩ khí!
  for (let i = 0; i < allRegs.length; i++) {
    const reg = allRegs[i];
    if (!isAliveRegiment(reg) || reg.id === loser.id) continue;

    if (reg.team === winner.team) {
      const distToDuel = Math.min(
        Math.hypot(reg.x - duel.x, reg.y - duel.y),
        Math.hypot(reg.x - winner.x, reg.y - winner.y),
      );
      if (distToDuel <= DUEL_ALLY_MORALE_RADIUS) {
        applyMoraleDelta(reg, DUEL_ALLY_MORALE_SURGE, false, sfxOut);
      }
    } else if (reg.ownerIdx === loser.ownerIdx) {
      applyMoraleDelta(reg, DUEL_LOSER_ARMY_MORALE_SHOCK, false, sfxOut);
    }
  }

  duel.hpA = duel.genARegId === winner.id ? Math.round(winner.hp) : 0;
  duel.hpB = duel.genBRegId === winner.id ? Math.round(winner.hp) : 0;

  sfxOut.add('cheer');
  sfxOut.add('clash');

  duelWinners.push({ winner, loser });
  if (winnerSpec && loserSpec) {
    logs.push(buildDuelVictoryLog(winnerSpec, loserSpec));
  } else {
    logs.push('⚔️ Danh tướng phe ta chém gục tướng địch trong trận Đơn Đấu sinh tử!');
  }
}

/**
 * Xử lý thao tác tương tác của người chơi / AI trong trận Đơn Đấu đang diễn ra:
 * - `'press'`: chuyển sang Thế Dồn Đòn (+24% Sát thương, +10% Chí mạng, -12 Thủ cận chiến).
 * - `'guard'`: chuyển sang Thế Phòng Thủ Phản Kích (+24 Thủ, -20% Sát thương nhận, phản đòn +35% nếu đối phương Press).
 * - `'retreat'` (`🏳️ Thu Quân Thoát Đấu`): hủy trận Đơn Đấu ngay lập tức, gây sốc hổ thẹn `-18` Sĩ khí đồng minh
 *   trong bán kính `380u`, khích lệ `+12` Sĩ khí quân đối phương trong `380u`, và phát SFX `'rout'`.
 */
export function applyDuelAction(
  duels: TwActiveDuel[],
  regsById: ReadonlyMap<number, TwSimRegiment>,
  allRegs: TwSimRegiment[],
  duelId: number,
  ownerIdx: number,
  action: 'press' | 'guard' | 'retreat',
  sfxOut: Set<TwSfxEvent>,
): { ok: boolean; reason?: string; log?: string } {
  const duelIdx = duels.findIndex(
    (d) => d.id === duelId && (d.ownerA === ownerIdx || d.ownerB === ownerIdx),
  );
  if (duelIdx < 0) {
    return { ok: false, reason: 'Không tìm thấy trận Đơn Đấu đang diễn ra của phe bạn.' };
  }

  const duel = duels[duelIdx];
  const isSideA = duel.ownerA === ownerIdx;
  const oppOwnerIdx = isSideA ? duel.ownerB : duel.ownerA;

  const genA = regsById.get(duel.genARegId);
  const genB = regsById.get(duel.genBRegId);
  const myGen = isSideA ? genA : genB;
  const oppGen = isSideA ? genB : genA;

  const mySpec = TW_GENERALS[isSideA ? duel.generalA : duel.generalB];
  const oppSpec = TW_GENERALS[isSideA ? duel.generalB : duel.generalA];
  const myName = mySpec?.vnName ?? 'Danh tướng';
  const oppName = oppSpec?.vnName ?? 'Tướng địch';

  if (action === 'press' || action === 'guard') {
    if (isSideA) {
      duel.stanceA = action;
    } else {
      duel.stanceB = action;
    }
    const log =
      action === 'press'
        ? `⚔️ ${myName} chuyển sang thế 【Dồn Đòn Công Kích】 trước ${oppName} (+24% Công, +10% Chí mạng)!`
        : `🛡️ ${myName} dựng binh khí 【Phòng Thủ Phản Kích】 trước ${oppName} (+24 Thủ, rình Phản đòn)!`;
    return { ok: true, log };
  }

  if (action === 'retreat') {
    if (genA) {
      genA.duelId = undefined;
      if (isAliveRegiment(genA)) {
        genA.anim = 'idle';
        genA.vx = 0;
        genA.vy = 0;
      }
    }
    if (genB) {
      genB.duelId = undefined;
      if (isAliveRegiment(genB)) {
        genB.anim = 'idle';
        genB.vx = 0;
        genB.vy = 0;
      }
    }
    duels.splice(duelIdx, 1);

    const myTeam = myGen?.team;
    const oppTeam = oppGen?.team;
    const retreatShockRadius = 380;

    for (let i = 0; i < allRegs.length; i++) {
      const reg = allRegs[i];
      if (!isAliveRegiment(reg)) continue;

      const dDuel = Math.hypot(reg.x - duel.x, reg.y - duel.y);
      if (dDuel > retreatShockRadius) continue;

      if (reg.ownerIdx === ownerIdx || (myTeam !== undefined && reg.team === myTeam)) {
        applyMoraleDelta(reg, -18, false, sfxOut);
      } else if (reg.ownerIdx === oppOwnerIdx || (oppTeam !== undefined && reg.team === oppTeam)) {
        applyMoraleDelta(reg, 12, false, sfxOut);
      }
    }

    sfxOut.add('rout');
    return {
      ok: true,
      log: `🏳️ Thu Quân Thoát Đấu! ${myName} quay ngựa rút lui khỏi võ đài trước ${oppName} — quân nhà hổ thẹn (-18 Sĩ khí), quân địch vang dậy (+12 Sĩ khí)!`,
    };
  }

  return { ok: false, reason: 'Thao tác Đơn Đấu không hợp lệ.' };
}

/**
 * Tiến hành một nhịp mô phỏng toàn bộ các trận Đơn Đấu đang diễn ra:
 * - Tự động kích hoạt Đơn Đấu cho các tướng đang thúc ngựa truy kích (`420 < dist <= 900`) khi vào tầm `<= 220`.
 * - Duy trì vòng tròn danh dự bán kính `95`, xoay chiến mã & thúc ngựa lao chém mỗi `1.2s` (`clashPhase++`).
 * - Xử lý kết liễu sinh tử (hồi `15%` maxHP, `+22` Sĩ khí đồng minh lân cận, `-28` Sĩ khí toàn quân bại tướng)
 *   hoặc khép lại hòa danh dự khi hết `30s`.
 */
export function stepGeneralDuels(
  activeDuels: TwActiveDuel[],
  regsById: ReadonlyMap<number, TwSimRegiment>,
  allRegs: TwSimRegiment[],
  dtSec: number,
  sfxOut: Set<TwSfxEvent>,
): { logs: string[]; duelWinners: { winner: TwSimRegiment; loser: TwSimRegiment }[] } {
  const logs: string[] = [];
  const duelWinners: { winner: TwSimRegiment; loser: TwSimRegiment }[] = [];

  if (!(dtSec > 0) || !Number.isFinite(dtSec)) {
    return { logs, duelWinners };
  }

  // 1. Kiểm tra các lệnh khiêu chiến đang thúc ngựa áp sát (420 < dist <= 900 -> vào <= 220 tự mở Đơn Đấu)
  for (let i = 0; i < allRegs.length; i++) {
    const challenger = allRegs[i];
    if (!challenger.isGeneral) continue;
    const pending = pendingDuelChallenges.get(challenger);
    if (!pending) continue;

    if (
      !isAliveRegiment(challenger) ||
      isRoutingOrShattered(challenger) ||
      challenger.duelId !== undefined ||
      challenger.lockedTargetId !== pending.targetRegId
    ) {
      pendingDuelChallenges.delete(challenger);
      continue;
    }

    const target = regsById.get(pending.targetRegId);
    if (!target || !isAliveRegiment(target) || isRoutingOrShattered(target) || target.duelId !== undefined) {
      pendingDuelChallenges.delete(challenger);
      continue;
    }

    const cSpec = challenger.generalId ? TW_GENERALS[challenger.generalId] : undefined;
    const tSpec = target.generalId ? TW_GENERALS[target.generalId] : undefined;
    if (!cSpec || !tSpec) {
      pendingDuelChallenges.delete(challenger);
      continue;
    }

    const dist = Math.hypot(target.x - challenger.x, target.y - challenger.y);
    const triggerDist =
      cSpec.class === 'strategist' || tSpec.class === 'strategist'
        ? TW_DUEL_STRATEGIST_CORNERED_DIST - 1
        : TW_DUEL_GALLOP_TRIGGER_DIST;

    if (dist <= triggerDist) {
      pendingDuelChallenges.delete(challenger);
      const started = tryStartGeneralDuel(
        challenger,
        target,
        allRegs,
        activeDuels,
        pending.nextDuelId,
        pending.romanceMode,
        sfxOut,
      );
      if (started.ok && started.duel) {
        logs.push(
          `🥁 Chiêng đồng vang rền! ${cSpec.vnName} thúc ngựa chặn đầu ${tSpec.vnName}, mở vòng Đơn Đấu sinh tử!`,
        );
      }
    }
  }

  // 2. Cập nhật từng vòng Đơn Đấu đang diễn ra
  for (let idx = 0; idx < activeDuels.length; ) {
    const duel = activeDuels[idx];
    const genA = regsById.get(duel.genARegId);
    const genB = regsById.get(duel.genBRegId);

    if (!genA || !genB || !genA.generalId || !genB.generalId) {
      if (genA && genA.duelId === duel.id) {
        genA.duelId = undefined;
        if (isAliveRegiment(genA)) genA.anim = 'idle';
      }
      if (genB && genB.duelId === duel.id) {
        genB.duelId = undefined;
        if (isAliveRegiment(genB)) genB.anim = 'idle';
      }
      activeDuels.splice(idx, 1);
      continue;
    }

    // Trường hợp một trong hai tướng vừa bị hạ gục (ví dụ trúng tuyệt kỹ ngay trước nhịp clash)
    if (genA.hp <= 0 || genB.hp <= 0) {
      const winner = genA.hp >= genB.hp ? genA : genB;
      const loser = winner === genA ? genB : genA;
      if (winner.hp <= 0) winner.hp = 1;
      resolveDuelFatality(duel, winner, loser, allRegs, sfxOut, logs, duelWinners);
      activeDuels.splice(idx, 1);
      continue;
    }

    const specA = TW_GENERALS[genA.generalId];
    const specB = TW_GENERALS[genB.generalId];

    // Duy trì khoảng trống vòng vây danh dự 95 đơn vị quanh tâm võ đài
    clearDuelRingSpace(
      duel.x,
      duel.y,
      duel.ringRadius || TW_DUEL_RING_CLEAR_RADIUS,
      genA.id,
      genB.id,
      allRegs,
      false,
      dtSec,
    );

    duel.timerLeft = Math.max(0, duel.timerLeft - dtSec);
    duel.clashTimerSec += dtSec;
    duel.orbitAngle = normalizeAngle(duel.orbitAngle + DUEL_ORBIT_ANGULAR_SPEED * dtSec);

    const modeHpScale = clamp(
      (genA.maxHp / Math.max(1, specA.hp) + genB.maxHp / Math.max(1, specB.hp)) * 0.5,
      0.5,
      3.5,
    );

    // Thực thi các hiệp giao binh nảy lửa mỗi 1.2 giây
    while (duel.clashTimerSec >= TW_DUEL_CLASH_INTERVAL_SEC && genA.hp > 0 && genB.hp > 0) {
      duel.clashTimerSec -= TW_DUEL_CLASH_INTERVAL_SEC;
      duel.clashPhase += 1;
      duel.lungeTimerSec = DUEL_LUNGE_DURATION_SEC;
      sfxOut.add('clash');

      const stA = duel.stanceA ?? 'balanced';
      const stB = duel.stanceB ?? 'balanced';
      const dmgAToB = computeDuelClashDamage(genA, specA, genB, specB, modeHpScale, stA, stB);
      const dmgBToA = computeDuelClashDamage(genB, specB, genA, specA, modeHpScale, stB, stA);

      // Ưu tiên người có thế thượng phong hoặc luân phiên ra đòn kết liễu trước để không bao giờ hòa xác kép
      const aStrikesFirst =
        specA.duelPower > specB.duelPower ||
        (specA.duelPower === specB.duelPower && duel.clashPhase % 2 === 1);

      if (aStrikesFirst) {
        genB.hp = Math.max(0, genB.hp - dmgAToB);
        if (genB.hp > 0) {
          genA.hp = Math.max(0, genA.hp - dmgBToA);
        }
      } else {
        genA.hp = Math.max(0, genA.hp - dmgBToA);
        if (genA.hp > 0) {
          genB.hp = Math.max(0, genB.hp - dmgAToB);
        }
      }

      syncRegimentMenFromHp(genA);
      syncRegimentMenFromHp(genB);
    }

    // Kiểm tra sinh tử sau hiệp giao phong
    if (genA.hp <= 0 || genB.hp <= 0) {
      const winner = genA.hp > 0 ? genA : genB;
      const loser = winner === genA ? genB : genA;
      resolveDuelFatality(duel, winner, loser, allRegs, sfxOut, logs, duelWinners);
      activeDuels.splice(idx, 1);
      continue;
    }

    // Hết 30 giây bất phân thắng bại: hai vị mãnh tướng thu đao chào nhau và trở lại điều binh!
    if (duel.timerLeft <= 0) {
      genA.duelId = undefined;
      genA.anim = 'idle';
      genA.vx = 0;
      genA.vy = 0;

      genB.duelId = undefined;
      genB.anim = 'idle';
      genB.vx = 0;
      genB.vy = 0;

      logs.push(
        `⚖️ ${specA.vnName} và ${specB.vnName} giao phong ${duel.clashPhase} hiệp bất phân thắng bại — thu binh tái chiến!`,
      );
      activeDuels.splice(idx, 1);
      continue;
    }

    // Cập nhật quỹ đạo chiến mã quần thảo & lao sát vào nhau tại tâm võ đài (duel.x, duel.y)
    if (duel.lungeTimerSec > 0) {
      duel.lungeTimerSec = Math.max(0, duel.lungeTimerSec - dtSec);
    }
    const lungeProgress =
      duel.lungeTimerSec > 0
        ? Math.sin((duel.lungeTimerSec / DUEL_LUNGE_DURATION_SEC) * Math.PI)
        : 0;
    const currentRadius =
      DUEL_ORBIT_RADIUS - (DUEL_ORBIT_RADIUS - DUEL_LUNGE_MIN_RADIUS) * lungeProgress;

    const cosA = Math.cos(duel.orbitAngle);
    const sinA = Math.sin(duel.orbitAngle);

    genA.x = Math.round((duel.x - cosA * currentRadius) * 10) / 10;
    genA.y = Math.round((duel.y - sinA * currentRadius) * 10) / 10;
    genA.facing = normalizeAngle(duel.orbitAngle + (1 - lungeProgress) * 0.28);
    genA.vx = 0;
    genA.vy = 0;
    genA.duelId = duel.id;
    genA.anim = 'duel';

    genB.x = Math.round((duel.x + cosA * currentRadius) * 10) / 10;
    genB.y = Math.round((duel.y + sinA * currentRadius) * 10) / 10;
    genB.facing = normalizeAngle(duel.orbitAngle + Math.PI + (1 - lungeProgress) * 0.28);
    genB.vx = 0;
    genB.vy = 0;
    genB.duelId = duel.id;
    genB.anim = 'duel';

    duel.hpA = Math.round(genA.hp);
    duel.maxHpA = Math.round(genA.maxHp);
    duel.hpB = Math.round(genB.hp);
    duel.maxHpB = Math.round(genB.maxHp);

    idx++;
  }

  return { logs, duelWinners };
}

// ============================================================================
// 5. THI TRIỂN TUYỆT KỸ NGŨ HÀNH DANH TƯỚNG (ACTIVE WU XING SKILLS ENGINE)
// ============================================================================

/**
 * Thi triển tuyệt kỹ chủ động Ngũ Hành (`TW_GENERALS[id].skill`) của Danh tướng:
 * - `'aoe_smash'`: xung chấn càn quét trong `skill.radius`, gây sát thương diện rộng cực mạnh + sốc `-22`..`-28` Sĩ khí địch.
 * - `'duel_buff'`: bộc phát huyết khí chiến thần (`auraAtkMul = 1.45`, kích hoạt `duel_buff` suốt `durationSec`) & chém mục tiêu địch áp sát.
 * - `'iron_evasion'`: kim thân hộ thể (`+35`..`+45` Thủ cận chiến) & Sĩ khí bất khuất cho bản thân cùng bộ tùy lân cận trong `durationSec`.
 * - `'rally_horn'`: gióng tù và hiệu triệu toàn bộ quân đồng minh dao động/tháo chạy trong `radius` (`+30` Sĩ khí, hồi thể lực, tăng tốc chạy, `'horn'` SFX).
 * - `'fire_volley'`: truyền Hỏa Tiễn (`fireArrowActive = true`), nạp đạn tức thì (`reloadLeftSec = 0`) & `+25%` sát thương tầm xa cho cung/nỏ/pháo đá đồng minh trong `durationSec`.
 */
export function castGeneralSkill(
  general: TwSimRegiment,
  allRegs: TwSimRegiment[],
  sfxOut: Set<TwSfxEvent>,
  targetX?: number,
  targetY?: number,
): { ok: boolean; log?: string; spawnFireAt?: { x: number; y: number; radius: number } } {
  if (
    !general ||
    !general.isGeneral ||
    !general.generalId ||
    general.skillCooldownLeft > 0 ||
    general.men <= 0 ||
    general.hp <= 0 ||
    general.anim === 'dead' ||
    general.moraleState === 'routing' ||
    general.moraleState === 'shattered'
  ) {
    return { ok: false };
  }

  const genSpec = TW_GENERALS[general.generalId];
  if (!genSpec) {
    return { ok: false };
  }

  const skill = genSpec.skill;
  general.skillCooldownLeft = skill.cooldownSec;

  switch (skill.effectKind) {
    // ------------------------------------------------------------------------
    // 1. AOE SMASH — Lữ Bố (Phương Thiên Vô Song), Trương Phi (Tiếng Thét Trường Bản), Quan Vũ (Thanh Long Trảm Nguyệt)
    // ------------------------------------------------------------------------
    case 'aoe_smash': {
      let enemiesHit = 0;
      const moraleShock = skill.id === 'changban_roar' ? -28 : -22;

      for (let i = 0; i < allRegs.length; i++) {
        const reg = allRegs[i];
        if (reg.team === general.team || !isAliveRegiment(reg)) continue;
        // Không can thiệp vào vòng Đơn Đấu riêng của cặp tướng khác
        if (reg.duelId !== undefined && reg.duelId !== general.duelId) continue;
        if (general.duelId !== undefined && reg.duelId !== general.duelId) continue;

        const dist = Math.hypot(reg.x - general.x, reg.y - general.y);
        if (dist > skill.radius) continue;

        const falloff = 1 - 0.32 * clamp(dist / Math.max(1, skill.radius), 0, 1);
        const rawDmg = reg.isGeneral
          ? (340 + genSpec.meleeAtk * 2.35) * falloff
          : (1680 + genSpec.meleeAtk * 16.5) * falloff;

        dealSkillDamageToRegiment(general, reg, rawDmg, 0.58);
        applyMoraleDelta(reg, moraleShock, false, sfxOut);
        enemiesHit++;
      }

      general.activeBuff = 'aoe_smash';
      general.activeBuffLeftSec = Math.max(general.activeBuffLeftSec, Math.min(skill.durationSec, 8));
      general.auraAtkMul = Math.max(general.auraAtkMul, 1.2);
      if (general.duelId === undefined) {
        general.anim = 'attack';
      }

      sfxOut.add('clash');
      sfxOut.add('charge');

      return {
        ok: true,
        log: `🔥 ${genSpec.vnName} tung tuyệt kỹ 【${skill.vnName}】 (${skill.enName}) — xung chấn càn quét ${enemiesHit} đơn vị địch!`,
      };
    }

    // ------------------------------------------------------------------------
    // 2. DUEL BUFF — Hạ Hầu Đôn (Độc Nhãn Cuồng Nộ), Tư Mã Tương An (Thiết Kỵ Đại Tấn)
    // ------------------------------------------------------------------------
    case 'duel_buff': {
      general.auraAtkMul = Math.max(general.auraAtkMul, 1.45);
      general.auraSpeedMul = Math.max(general.auraSpeedMul, 1.12);
      general.activeBuff = 'duel_buff';
      general.activeBuffLeftSec = Math.max(general.activeBuffLeftSec, skill.durationSec);
      applyMoraleDelta(general, 20, true);

      // Tăng thêm nhuệ khí xung phong cho kỵ binh / bộ tùy sát cánh trong bán kính kỹ năng
      for (let i = 0; i < allRegs.length; i++) {
        const ally = allRegs[i];
        if (
          ally.id === general.id ||
          ally.team !== general.team ||
          !isAliveRegiment(ally) ||
          isRoutingOrShattered(ally)
        ) {
          continue;
        }
        if (Math.hypot(ally.x - general.x, ally.y - general.y) <= skill.radius) {
          ally.auraAtkMul = Math.max(ally.auraAtkMul, 1.22);
          ally.auraSpeedMul = Math.max(ally.auraSpeedMul, 1.1);
          ally.activeBuff = 'duel_buff';
          ally.activeBuffLeftSec = Math.max(
            ally.activeBuffLeftSec,
            Math.round(skill.durationSec * 0.75),
          );
        }
      }

      // Tung đòn trảm kích trực tiếp lên kẻ địch áp sát cạnh bên (ưu tiên đối thủ Đơn Đấu / đang cận chiến)
      let strikeTarget: TwSimRegiment | undefined;
      let bestDist = Math.max(135, skill.radius);

      for (let i = 0; i < allRegs.length; i++) {
        const enemy = allRegs[i];
        if (enemy.team === general.team || !isAliveRegiment(enemy)) continue;
        if (general.duelId !== undefined) {
          if (enemy.duelId === general.duelId) {
            strikeTarget = enemy;
            break;
          }
          continue;
        }
        if (enemy.duelId !== undefined) continue;

        const d = Math.hypot(enemy.x - general.x, enemy.y - general.y);
        if (enemy.id === general.engagedWithId && d <= bestDist + 25) {
          strikeTarget = enemy;
          break;
        }
        if (d <= bestDist) {
          bestDist = d;
          strikeTarget = enemy;
        }
      }

      if (strikeTarget) {
        const cleaveDmg = strikeTarget.isGeneral
          ? 275 + genSpec.meleeAtk * 1.85
          : 1350 + genSpec.meleeAtk * 13;
        dealSkillDamageToRegiment(general, strikeTarget, cleaveDmg, 0.6);
        applyMoraleDelta(strikeTarget, -14, false, sfxOut);
        sfxOut.add('clash');
      }

      if (general.duelId === undefined && strikeTarget) {
        general.anim = 'attack';
      }
      sfxOut.add('horn');

      return {
        ok: true,
        log: `⚔️ ${genSpec.vnName} kích hoạt 【${skill.vnName}】 (${skill.enName}) — +45% Công cận chiến & uy thế Đấu Tướng suốt ${skill.durationSec}s!`,
      };
    }

    // ------------------------------------------------------------------------
    // 3. IRON EVASION — Triệu Vân (Đơn Kỵ Cứu Chúa), Tôn Kiên (Mãnh Hổ Giang Đông)
    // ------------------------------------------------------------------------
    case 'iron_evasion': {
      const selfDefBonus = skill.id === 'silver_dragon' ? 45 : 35;
      let protectedCount = 0;

      for (let i = 0; i < allRegs.length; i++) {
        const ally = allRegs[i];
        if (ally.team !== general.team || !isAliveRegiment(ally) || ally.moraleState === 'shattered') {
          continue;
        }

        const isSelf = ally.id === general.id;
        const dist = isSelf ? 0 : Math.hypot(ally.x - general.x, ally.y - general.y);
        if (!isSelf && dist > skill.radius) continue;

        ally.auraDefAdd = Math.max(ally.auraDefAdd, isSelf ? selfDefBonus : 35);
        ally.auraMoraleAdd = Math.max(ally.auraMoraleAdd, 30);
        if (isSelf) {
          ally.auraSpeedMul = Math.max(ally.auraSpeedMul, 1.15);
          ally.fatigueVal = Math.max(0, ally.fatigueVal - 35);
          ally.fatigue = fatigueStateFromVal(ally.fatigueVal);
        }

        ally.activeBuff = 'iron_evasion';
        ally.activeBuffLeftSec = Math.max(ally.activeBuffLeftSec, skill.durationSec);

        // Sĩ khí bất khuất (Unbreakable Morale)
        ally.morale = isSelf ? 100 : Math.max(ally.morale, 92);
        if (ally.moraleState === 'routing' && ally.anim === 'rout') {
          ally.anim = 'idle';
          ally.vx = 0;
          ally.vy = 0;
        }
        ally.moraleState = 'eager';
        protectedCount++;
      }

      sfxOut.add('horn');
      sfxOut.add('cheer');

      return {
        ok: true,
        log: `🛡️ ${genSpec.vnName} triển khai 【${skill.vnName}】 (${skill.enName}) — +${selfDefBonus} Thủ cận chiến & Sĩ khí bất khuất cho ${protectedCount} đơn vị trong ${skill.durationSec}s!`,
      };
    }

    // ------------------------------------------------------------------------
    // 4. RALLY HORN — Tào Tháo (Ngụy Võ Hiệu Lệnh), Lưu Bị (Nhân Nghĩa Hưng Hán), Viên Thiệu (Tứ Thế Tam Công)
    // ------------------------------------------------------------------------
    case 'rally_horn': {
      let ralliedCount = 0;
      let recoveredRouting = 0;

      for (let i = 0; i < allRegs.length; i++) {
        const ally = allRegs[i];
        if (ally.team !== general.team || !isAliveRegiment(ally) || ally.moraleState === 'shattered') {
          continue;
        }

        const isSelf = ally.id === general.id;
        const dist = isSelf ? 0 : Math.hypot(ally.x - general.x, ally.y - general.y);
        if (!isSelf && dist > skill.radius) continue;

        const wasWaveringOrRouting =
          ally.moraleState === 'routing' || ally.moraleState === 'wavering';
        if (wasWaveringOrRouting) {
          recoveredRouting++;
        }

        applyMoraleDelta(ally, 30, true);

        // Hồi phục thể lực hành quân & thúc tốc độ xung phong dưới bóng đại kỳ
        ally.fatigueVal = Math.max(0, ally.fatigueVal - 45);
        ally.fatigue = fatigueStateFromVal(ally.fatigueVal);
        ally.auraSpeedMul = Math.max(ally.auraSpeedMul, 1.15);
        ally.auraMoraleAdd = Math.max(ally.auraMoraleAdd, 18);

        if (skill.id === 'imperial_shadow') {
          ally.auraAtkMul = Math.max(ally.auraAtkMul, 1.18);
          ally.auraDefAdd = Math.max(ally.auraDefAdd, 18);
        } else if (skill.id === 'han_unity') {
          ally.auraDefAdd = Math.max(ally.auraDefAdd, 20);
        } else {
          ally.auraDefAdd = Math.max(ally.auraDefAdd, 16);
        }

        ally.activeBuff = 'rally_horn';
        ally.activeBuffLeftSec = Math.max(ally.activeBuffLeftSec, skill.durationSec);
        ralliedCount++;
      }

      sfxOut.add('horn');
      if (recoveredRouting > 0) {
        sfxOut.add('cheer');
      }

      return {
        ok: true,
        log: `📯 ${genSpec.vnName} gióng tù và 【${skill.vnName}】 (${skill.enName}) — khích lệ ${ralliedCount} đạo quân (+30 Sĩ khí, hồi thể lực & tăng tốc xung kích)!`,
      };
    }

    // ------------------------------------------------------------------------
    // 5. FIRE VOLLEY — Gia Cát Lượng (Kỳ Môn Hỏa Tiễn), Chu Du (Hỏa Thiêu Xích Bích)
    // ------------------------------------------------------------------------
    case 'fire_volley': {
      const imbueRadius = Math.max(skill.radius, TW_CLASSES.strategist.auraRadius);
      let imbuedRangedCount = 0;

      general.activeBuff = 'fire_volley';
      general.activeBuffLeftSec = Math.max(general.activeBuffLeftSec, skill.durationSec);

      for (let i = 0; i < allRegs.length; i++) {
        const ally = allRegs[i];
        if (
          ally.team !== general.team ||
          ally.isGeneral ||
          !isAliveRegiment(ally) ||
          isRoutingOrShattered(ally)
        ) {
          continue;
        }

        const unitSpec = TW_UNITS[ally.kind];
        const isMissileUnit =
          unitSpec.category === 'ranged_bow' ||
          unitSpec.category === 'ranged_crossbow' ||
          unitSpec.category === 'artillery' ||
          unitSpec.range > 0;
        if (!isMissileUnit) continue;

        const dist = Math.hypot(ally.x - general.x, ally.y - general.y);
        const isOwnRetinue =
          ally.ownerIdx === general.ownerIdx &&
          ally.generalSlot === general.generalSlot &&
          dist <= imbueRadius + 130;

        if (dist <= imbueRadius || isOwnRetinue) {
          ally.fireArrowActive = true;
          ally.reloadLeftSec = 0;
          ally.auraAtkMul = Math.max(ally.auraAtkMul, 1.25);
          ally.activeBuff = 'fire_volley';
          ally.activeBuffLeftSec = Math.max(ally.activeBuffLeftSec, skill.durationSec);
          if (ally.ammo <= 0 && ally.maxAmmo > 0) {
            // Tiếp tế khẩn cấp 4 loạt tên lửa nếu bộ cung vừa cạn tên
            ally.ammo = Math.min(ally.maxAmmo, 4);
          }
          applyMoraleDelta(ally, 10, false);
          imbuedRangedCount++;
        }
      }

      // Xác định tâm Hỏa Công (epicX, epicY): từ tọa độ chỉ định, hoặc quân địch gần nhất trong 620u, hoặc phía trước mặt tướng
      const maxCastRange = 620;
      let epicX: number;
      let epicY: number;

      if (
        targetX !== undefined &&
        targetY !== undefined &&
        Number.isFinite(targetX) &&
        Number.isFinite(targetY)
      ) {
        const dx = targetX - general.x;
        const dy = targetY - general.y;
        const castDist = Math.hypot(dx, dy);
        const strikeX =
          castDist > maxCastRange ? general.x + (dx / castDist) * maxCastRange : targetX;
        const strikeY =
          castDist > maxCastRange ? general.y + (dy / castDist) * maxCastRange : targetY;
        epicX = clamp(
          Math.round(strikeX * 10) / 10,
          REGIMENT_BOUND_MARGIN,
          DEFAULT_BATTLEFIELD_W - REGIMENT_BOUND_MARGIN,
        );
        epicY = clamp(
          Math.round(strikeY * 10) / 10,
          REGIMENT_BOUND_MARGIN,
          DEFAULT_BATTLEFIELD_H - REGIMENT_BOUND_MARGIN,
        );

        const burnRadius = skill.radius * 0.72;
        for (let i = 0; i < allRegs.length; i++) {
          const enemy = allRegs[i];
          if (enemy.team === general.team || !isAliveRegiment(enemy) || enemy.duelId !== undefined) {
            continue;
          }
          const d = Math.hypot(enemy.x - epicX, enemy.y - epicY);
          if (d <= burnRadius) {
            const burnFalloff = 1 - 0.35 * (d / Math.max(1, burnRadius));
            const burnDmg = (enemy.isGeneral ? 190 : 920) * burnFalloff;
            dealSkillDamageToRegiment(general, enemy, burnDmg, 0.45);
            applyMoraleDelta(enemy, -14, false, sfxOut);
          }
        }
      } else {
        let nearestEnemy: TwSimRegiment | undefined;
        let nearestDist = maxCastRange;
        for (let i = 0; i < allRegs.length; i++) {
          const enemy = allRegs[i];
          if (
            enemy.team === general.team ||
            !isAliveRegiment(enemy) ||
            enemy.hidden ||
            enemy.duelId !== undefined
          ) {
            continue;
          }
          const d = Math.hypot(enemy.x - general.x, enemy.y - general.y);
          if (d <= nearestDist) {
            nearestDist = d;
            nearestEnemy = enemy;
          }
        }
        const rawX = nearestEnemy ? nearestEnemy.x : general.x + Math.cos(general.facing) * 260;
        const rawY = nearestEnemy ? nearestEnemy.y : general.y + Math.sin(general.facing) * 260;
        epicX = clamp(
          Math.round(rawX * 10) / 10,
          REGIMENT_BOUND_MARGIN,
          DEFAULT_BATTLEFIELD_W - REGIMENT_BOUND_MARGIN,
        );
        epicY = clamp(
          Math.round(rawY * 10) / 10,
          REGIMENT_BOUND_MARGIN,
          DEFAULT_BATTLEFIELD_H - REGIMENT_BOUND_MARGIN,
        );
      }

      sfxOut.add('volley');
      sfxOut.add('drums');
      sfxOut.add('fire');

      return {
        ok: true,
        spawnFireAt: { x: epicX, y: epicY, radius: 92 },
        log: `🏹🔥 ${genSpec.vnName} phát lệnh 【${skill.vnName}】 (${skill.enName}) — ${imbuedRangedCount} đội cung nỏ & pháo đá rực cháy Hỏa Tiễn (+25% sát thương, nạp tên tức thì) suốt ${skill.durationSec}s!`,
      };
    }
  }
}
