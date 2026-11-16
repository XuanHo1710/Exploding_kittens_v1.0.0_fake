/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) — Động cơ Giao chiến Cận chiến,
 * Xung kích & Phản Xung kích Thương Lâm, Đạn đạo Cung Nỏ / Pháo Đá & Sĩ khí Ngũ Hành.
 *
 * Phụ trách 4 trụ cột chiến đấu cốt lõi ở nhịp máy chủ 15 Hz:
 * 1. `TwLiveProjectile`: trạng thái đạn bay thời gian thực (tên thường, hỏa tiễn, tên nỏ xuyên giáp, đá lửa công thành).
 * 2. `stepMeleeAndCharges`: phát hiện tiếp xúc cận chiến theo diện tích đội hình, tính Xung kích (Charge Impact)
 *    theo tỷ lệ khối lượng / cao điểm / tạt sườn / bọc hậu, Phản xung kích Thương Lâm (Charge Reflect) bẻ gãy kỵ binh,
 *    và giao tranh cận chiến duy trì (Sustained Melee Clash) quy đổi sát thương sang quân số thiệt mạng chính xác.
 * 3. `stepRangedAndProjectiles`: tự động khóa mục tiêu hoặc xạ kích tự do (`fireAtWill`), tính tầm cao điểm (+20%),
 *    tán xạ đạn đạo, rừng chắn tên (45%), mộc thuẫn + trận hình chắn đạn trực diện, Tản Trận giảm thương vong
 *    và Pháo Đá Uy Viễn gây nổ diện rộng kèm chấn áp sĩ khí (-10).
 * 4. `stepMoraleAndAuras`: hào quang Ngũ Hành Tướng Lĩnh (`TW_CLASSES`) và máy trạng thái Sĩ khí
 *    (`eager` -> `steady` -> `wavering` -> `routing` / `shattered`, cùng cơ chế Chỉnh Đốn / Rally khi thoát hiểm).
 */

import {
  TW_CLASSES,
  TW_DEPLOYABLES,
  TW_FORMATIONS,
  TW_GENERALS,
  TW_MAX_PLAYERS,
  TW_UNITS,
  findTwGuanxiBond,
  twRankFromKills,
  twVeterancyBonuses,
  type TwDeployableFrame,
  type TwFatigueState,
  type TwFireZoneFrame,
  type TwGeneralClass,
  type TwMapSpec,
  type TwMoraleState,
  type TwProjectileFrame,
  type TwProjectileKind,
  type TwSfxEvent,
} from '../../../../shared/src/tw';
import {
  computeFlankZone,
  recomputeRegimentDimensions,
  type TwFlankZone,
  type TwSimRegiment,
} from './formations';
import { sampleTerrainAt } from './terrain';

// ============================================================================
// 1. KIỂU ĐẠN ĐẠO, CÔNG SỰ DÃ CHIẾN, HỎA CÔNG & XUNG KÍCH THỜI GIAN THỰC
// ============================================================================

export interface TwLiveProjectile {
  id: number;
  kind: TwProjectileKind;
  shooterRegId: number;
  ownerIdx: number;
  team: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  elapsed: number;
  flightDur: number;
  normalDmg: number;
  apDmg: number;
  aoeRadius: number;
  moraleShock: number;
}

export interface TwLiveDeployable extends TwDeployableFrame {
  /** Đánh dấu bẫy ngầm (chông sắt / dầu) đã từng bị quân địch dẫm/phát hiện vĩnh viễn */
  revealed?: boolean;
}

export interface TwLiveFireZone extends TwFireZoneFrame {
  maxSec: number;
  team: number;
  ageSec?: number;
  spreadDone?: boolean;
}

export interface TwRangedEnv {
  windAngle?: number;
  windStrength?: number;
  onFireImpact?: (x: number, y: number, ownerIdx: number, team: number, radius: number) => void;
  onBoulderImpact?: (x: number, y: number, ownerIdx: number, team: number) => void;
}

export interface TwMajorChargeEvent {
  attacker: TwSimRegiment;
  defender: TwSimRegiment;
}

// ============================================================================
// HẰNG SỐ CÂN BẰNG CHIẾN ĐẤU TOTAL WAR: THREE KINGDOMS
// ============================================================================

/** Khoảng cách tiếp xúc cận chiến tối thiểu (đảm bảo Tướng đơn độc và đội hình hẹp luôn chạm kiếm) */
const MIN_MELEE_CONTACT_DIST = 52;
/** Trần khoảng cách tiếp xúc cận chiến để đơn vị xung phong từ 190 đơn vị kịp tích đủ >= 6 nhịp húc */
const MAX_MELEE_CONTACT_DIST = 104;

/** Số nhịp xung phong tối thiểu để kích hoạt sát thương Charge Impact */
const MIN_CHARGE_TICKS = 6;
/** Số nhịp đứng yên dựng thương/khiên tối thiểu để kích hoạt Braced / Phản xung kích */
const MIN_BRACED_TICKS = 8;

/** Hệ số giảm sát thương tên/nỏ khi mục tiêu ẩn mình dưới tán rừng (45%) */
const FOREST_ARROW_BLOCK_RATIO = 0.45;

/** Tốc độ bay của từng loại đạn trên bản đồ 3200x2200 (đơn vị/giây) */
const SPEED_ARROW = 310;
const SPEED_FIRE_ARROW = 305;
const SPEED_BOLT = 425;
const SPEED_BOULDER = 235;

/** Khoảng cách an toàn tối thiểu tính từ quân địch để quân đang vỡ trận có thể Chỉnh đốn (Rally) */
const RALLY_SAFE_ENEMY_DIST = 260;
const RALLY_MORALE_THRESHOLD = 42;

/** Khối lượng và sĩ khí nền mặc định cho Danh Tướng cưỡi chiến mã trên chiến trường */
const GENERAL_DEFAULT_MASS = 325;
const GENERAL_MORALE_BASE = 88;

// ============================================================================
// HÀM TIỆN ÍCH NỘI BỘ & TRA CỨU CHỈ SỐ CHIẾN ĐẤU
// ============================================================================

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function isAlive(reg: TwSimRegiment): boolean {
  return reg.men > 0 && reg.hp > 0 && reg.anim !== 'dead';
}

function isRoutingOrShattered(reg: TwSimRegiment): boolean {
  return reg.moraleState === 'routing' || reg.moraleState === 'shattered';
}

function isCavalryRegiment(reg: TwSimRegiment): boolean {
  if (reg.isGeneral) return false;
  const cat = TW_UNITS[reg.kind].category;
  return cat === 'cavalry_shock' || cat === 'cavalry_melee';
}

function isMountedTarget(reg: TwSimRegiment): boolean {
  return reg.isGeneral || isCavalryRegiment(reg);
}

interface ActiveBuffCombatMods {
  atkMul: number;
  speedMul: number;
  atkAdd: number;
  defAdd: number;
  armorAdd: number;
  chargeAdd: number;
  missileBlockAdd: number;
  moraleAdd: number;
  unbreakable: boolean;
  fireVolley: boolean;
}

const ZERO_BUFF_MODS: ActiveBuffCombatMods = {
  atkMul: 1,
  speedMul: 1,
  atkAdd: 0,
  defAdd: 0,
  armorAdd: 0,
  chargeAdd: 0,
  missileBlockAdd: 0,
  moraleAdd: 0,
  unbreakable: false,
  fireVolley: false,
};

/**
 * Đọc hiệu ứng kỹ năng chủ động của Danh Tướng (hỗ trợ cả mã `skill.id` lẫn nhóm `effectKind`).
 */
function getActiveBuffMods(reg: TwSimRegiment): ActiveBuffCombatMods {
  if (!reg.activeBuff || (reg.activeBuffLeftSec !== undefined && reg.activeBuffLeftSec <= 0)) {
    return ZERO_BUFF_MODS;
  }
  const resolvedKey =
    reg.isGeneral &&
    reg.generalId &&
    TW_GENERALS[reg.generalId]?.skill.effectKind === reg.activeBuff
      ? TW_GENERALS[reg.generalId].skill.id
      : reg.activeBuff;

  switch (resolvedKey) {
    case 'rage_of_lu_bu':
    case 'changban_roar':
    case 'green_dragon_crescent':
    case 'aoe_smash':
      return {
        ...ZERO_BUFF_MODS,
        atkMul: 1.2,
        speedMul: 1.06,
      };
    case 'imperial_shadow':
    case 'rally_horn':
      return {
        ...ZERO_BUFF_MODS,
        speedMul: 1.15,
        atkAdd: 18,
        defAdd: 18,
        moraleAdd: 25,
      };
    case 'han_unity':
      return {
        ...ZERO_BUFF_MODS,
        speedMul: 1.15,
        defAdd: 20,
        moraleAdd: 30,
      };
    case 'noble_lineage':
      return {
        ...ZERO_BUFF_MODS,
        speedMul: 1.15,
        armorAdd: 16,
        moraleAdd: 24,
      };
    case 'vengeful_eye':
    case 'duel_buff':
      return {
        ...ZERO_BUFF_MODS,
        atkMul: reg.isGeneral ? 1.45 : 1.22,
        speedMul: reg.isGeneral ? 1.12 : 1.1,
        unbreakable: true,
      };
    case 'jin_iron_decree':
      return {
        ...ZERO_BUFF_MODS,
        atkMul: 1.4,
        speedMul: 1.12,
        chargeAdd: 30,
        unbreakable: true,
      };
    case 'silver_dragon':
    case 'iron_evasion':
      return {
        ...ZERO_BUFF_MODS,
        speedMul: reg.isGeneral ? 1.15 : 1.0,
        defAdd: reg.isGeneral ? 45 : 35,
        missileBlockAdd: 40,
        moraleAdd: 30,
        unbreakable: true,
      };
    case 'tiger_of_jiangdong':
      return {
        ...ZERO_BUFF_MODS,
        speedMul: 1.15,
        defAdd: 35,
        armorAdd: 18,
        moraleAdd: 30,
        unbreakable: true,
      };
    case 'southeast_wind':
    case 'red_cliffs_flame':
    case 'fire_volley':
      return {
        ...ZERO_BUFF_MODS,
        atkMul: 1.25,
        fireVolley: true,
      };
    default:
      return ZERO_BUFF_MODS;
  }
}

function getRegimentMass(reg: TwSimRegiment): number {
  if (reg.isGeneral) return GENERAL_DEFAULT_MASS;
  return TW_UNITS[reg.kind].mass;
}

function getRegimentChargeBonus(reg: TwSimRegiment, buff: ActiveBuffCombatMods): number {
  const base =
    reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]
      ? TW_GENERALS[reg.generalId].chargeBonus
      : TW_UNITS[reg.kind].chargeBonus;
  return Math.max(0, base + buff.chargeAdd);
}

function getRegimentBaseMeleeAtk(reg: TwSimRegiment): number {
  if (reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]) {
    return TW_GENERALS[reg.generalId].meleeAtk;
  }
  return TW_UNITS[reg.kind].meleeAtk;
}

function getRegimentBaseMeleeDef(reg: TwSimRegiment): number {
  if (reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]) {
    return TW_GENERALS[reg.generalId].meleeDef;
  }
  return TW_UNITS[reg.kind].meleeDef;
}

function getRegimentArmor(reg: TwSimRegiment, buff: ActiveBuffCombatMods): number {
  const base =
    reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]
      ? TW_GENERALS[reg.generalId].armor
      : TW_UNITS[reg.kind].armor;
  return clamp(base + buff.armorAdd, 0, 92);
}

function getRegimentAntiCavBonus(reg: TwSimRegiment): number {
  if (reg.isGeneral) return 0;
  return TW_UNITS[reg.kind].antiCavalryBonus;
}

function fatigueMeleeMul(fatigue: TwFatigueState): number {
  switch (fatigue) {
    case 'fresh':
      return 1.0;
    case 'active':
      return 0.95;
    case 'winded':
      return 0.82;
    case 'exhausted':
      return 0.65;
  }
}

function fatigueMoralePenalty(fatigue: TwFatigueState): number {
  switch (fatigue) {
    case 'fresh':
      return 0;
    case 'active':
      return 3;
    case 'winded':
      return 8;
    case 'exhausted':
      return 15;
  }
}

/**
 * Bán kính tiếp xúc theo hướng đơn vị `(ux, uy)` tính từ tâm trung đoàn,
 * kết hợp bề ngang `width * 0.42` và chiều sâu đội hình `depth * 0.46`.
 */
function directionalFootprintRadius(
  reg: Pick<TwSimRegiment, 'width' | 'depth' | 'facing'>,
  ux: number,
  uy: number,
): number {
  const fx = Math.cos(reg.facing);
  const fy = Math.sin(reg.facing);
  const lx = -fy;
  const ly = fx;
  const projF = Math.abs(ux * fx + uy * fy);
  const projL = Math.abs(ux * lx + uy * ly);
  const hd = Math.max(18, reg.depth * 0.46);
  const hw = Math.max(18, reg.width * 0.42);
  const denom = Math.hypot(projF / hd, projL / hw);
  return denom > 1e-6 ? 1 / denom : hd;
}

/**
 * Kiểm tra hai trung đoàn đối phương có đang giáp lá cà cận chiến hay không:
 * - Lọc nhanh hộp bao theo `(regA.width * 0.42 + regB.width * 0.42)` (tối thiểu `52`).
 * - Kiểm tra khoảng cách `< 52` hoặc nằm trong tổng bán kính hình học có hướng (giới hạn trần `104`
 *   để khớp hoàn hảo với ngưỡng dừng truy kích `contactDist` của `formations.ts`).
 */
function areRegimentsInMeleeContact(regA: TwSimRegiment, regB: TwSimRegiment): boolean {
  const dx = regB.x - regA.x;
  const dy = regB.y - regA.y;
  const broadRadius = Math.max(
    MIN_MELEE_CONTACT_DIST,
    regA.width * 0.42 + regB.width * 0.42,
  );
  if (Math.abs(dx) > broadRadius || Math.abs(dy) > broadRadius) {
    return false;
  }

  const dist = Math.hypot(dx, dy);
  if (dist < MIN_MELEE_CONTACT_DIST) {
    return true;
  }
  if (dist > broadRadius) {
    return false;
  }

  const ux = dx / dist;
  const uy = dy / dist;
  const dirThreshold = clamp(
    directionalFootprintRadius(regA, ux, uy) + directionalFootprintRadius(regB, -ux, -uy),
    MIN_MELEE_CONTACT_DIST,
    MAX_MELEE_CONTACT_DIST,
  );
  return dist <= dirThreshold;
}

/**
 * Quy đổi sát thương máu (`dmg`) sang quân số hi sinh chính xác, cập nhật `men`, `anim`,
 * kích thước hình học trung đoàn và trả về số lính vừa tử trận (`menSlain`).
 */
function applyDamageAndCountSlain(target: TwSimRegiment, dmg: number): number {
  if (!(dmg > 0) || !Number.isFinite(dmg) || !isAlive(target)) {
    return 0;
  }

  const prevMen = target.men;
  const nextHp = target.hp - dmg;
  target.hp = nextHp > 0.05 ? nextHp : 0;

  if (target.isGeneral) {
    target.men = target.hp > 0 ? 1 : 0;
  } else if (target.hp <= 0) {
    target.men = 0;
  } else {
    const hpPerMan =
      target.maxMen > 0 && target.maxHp > 0
        ? target.maxHp / target.maxMen
        : TW_UNITS[target.kind].hpPerMan;
    target.men = Math.min(target.maxMen, Math.ceil(target.hp / Math.max(1, hpPerMan)));
  }

  const menSlain = Math.max(0, prevMen - target.men);

  if (target.men <= 0 || target.hp <= 0) {
    target.hp = 0;
    target.men = 0;
    target.anim = 'dead';
    target.engagedWithId = undefined;
    target.chargeTicks = 0;
    target.bracedTicks = 0;
    target.vx = 0;
    target.vy = 0;
  } else if (menSlain > 0 && !target.isGeneral) {
    recomputeRegimentDimensions(target);
  }

  return menSlain;
}

function recordCasualties(
  casualtiesByOwner: number[],
  ownerIdx: number,
  menSlain: number,
): void {
  if (menSlain <= 0 || ownerIdx < 0) return;
  while (casualtiesByOwner.length <= ownerIdx) {
    casualtiesByOwner.push(0);
  }
  casualtiesByOwner[ownerIdx] += menSlain;
}

/** Đồng bộ cấp Tinh nhuệ (0..9) từ chiến công hạ địch và trả về thưởng chỉ số 0 A.D. / TW3K */
function syncRegimentVeterancy(reg: TwSimRegiment): {
  meleeAtkAdd: number;
  meleeDefAdd: number;
  moraleAdd: number;
  reloadMul: number;
} {
  reg.rank = twRankFromKills(reg.kills);
  return twVeterancyBonuses(reg.rank ?? 0);
}

function addKillsAndSyncRank(reg: TwSimRegiment, slain: number): void {
  if (slain <= 0) return;
  reg.kills += slain;
  reg.rank = twRankFromKills(reg.kills);
}

function isRegimentUnbreakable(reg: TwSimRegiment, buff?: ActiveBuffCombatMods): boolean {
  const b = buff ?? getActiveBuffMods(reg);
  return (
    b.unbreakable ||
    reg.guanxiState === 'enraged' ||
    (reg.guanxiEnrageLeftSec !== undefined && reg.guanxiEnrageLeftSec > 0)
  );
}

// ============================================================================
// 2. CẬN CHIẾN, XUNG KÍCH & PHẢN XUNG KÍCH THƯƠNG LÂM (MELEE & CHARGES)
// ============================================================================

/**
 * Mô phỏng va chạm Xung kích (Charge Impact), Phản xung kích Thương Lâm (Spearwall Charge Reflection),
 * Thiết Kỵ Đạp Trận Xuyên Tuyến (Heavy Cavalry Mass Trample) và giao tranh cận chiến duy trì (Sustained Melee Clash).
 */
export function stepMeleeAndCharges(
  regs: TwSimRegiment[],
  dtSec: number,
  sfxOut: Set<TwSfxEvent>,
): {
  casualtiesByOwner: number[];
  majorChargeEvents: { attacker: TwSimRegiment; defender: TwSimRegiment }[];
} {
  let maxOwnerIdx = TW_MAX_PLAYERS - 1;
  for (let i = 0; i < regs.length; i++) {
    syncRegimentVeterancy(regs[i]);
    if (regs[i].ownerIdx > maxOwnerIdx) {
      maxOwnerIdx = regs[i].ownerIdx;
    }
  }
  const casualtiesByOwner = new Array<number>(maxOwnerIdx + 1).fill(0);
  const majorChargeEvents: { attacker: TwSimRegiment; defender: TwSimRegiment }[] = [];

  if (!(dtSec > 0) || !Number.isFinite(dtSec) || regs.length === 0) {
    return { casualtiesByOwner, majorChargeEvents };
  }

  // Lập danh sách đối phương đang tiếp xúc cận chiến cho từng trung đoàn đủ điều kiện
  const contactsByIdx: TwSimRegiment[][] = regs.map(() => []);

  for (let i = 0; i < regs.length; i++) {
    const regA = regs[i];
    if (regA.duelId !== undefined || !isAlive(regA)) continue;

    for (let j = i + 1; j < regs.length; j++) {
      const regB = regs[j];
      if (regB.team === regA.team || regB.duelId !== undefined || !isAlive(regB)) {
        continue;
      }

      if (areRegimentsInMeleeContact(regA, regB)) {
        contactsByIdx[i].push(regB);
        contactsByIdx[j].push(regA);
      }
    }
  }

  // --------------------------------------------------------------------------
  // PHA A: GIẢI QUYẾT VA CHẠM XUNG KÍCH & PHẢN XUNG KÍCH THƯƠNG LÂM
  // --------------------------------------------------------------------------
  for (let i = 0; i < regs.length; i++) {
    const attacker = regs[i];
    if (
      attacker.duelId !== undefined ||
      !isAlive(attacker) ||
      isRoutingOrShattered(attacker) ||
      attacker.chargeTicks < MIN_CHARGE_TICKS
    ) {
      continue;
    }

    const contacts = contactsByIdx[i];
    if (contacts.length === 0) continue;

    // Ưu tiên mục tiêu khóa (`lockedTargetId`) nếu đã chạm mặt, bằng không chọn địch gần nhất
    let defender: TwSimRegiment | undefined;
    let bestDist = Infinity;
    for (let c = 0; c < contacts.length; c++) {
      const cand = contacts[c];
      if (!isAlive(cand) || cand.duelId !== undefined) continue;
      if (attacker.lockedTargetId !== undefined && cand.id === attacker.lockedTargetId) {
        defender = cand;
        break;
      }
      const d = Math.hypot(cand.x - attacker.x, cand.y - attacker.y);
      if (d < bestDist) {
        bestDist = d;
        defender = cand;
      }
    }

    if (!defender) continue;

    // Tiêu thụ động năng xung kích ngay khi chạm mục tiêu để không lặp lại ở nhịp kế tiếp
    const accumulatedChargeTicks = attacker.chargeTicks;
    attacker.chargeTicks = 0;

    const flankZone: TwFlankZone = computeFlankZone(attacker.x, attacker.y, defender);
    const defenderForm = TW_FORMATIONS[defender.formation] ?? TW_FORMATIONS.line;
    const defenderAntiCav = getRegimentAntiCavBonus(defender);
    const defenderBraced =
      !isRoutingOrShattered(defender) && defender.bracedTicks >= MIN_BRACED_TICKS;
    const canReflectCav =
      defenderBraced && (defenderForm.chargeReflect || defenderAntiCav >= 20);

    // 1. PHẢN XUNG KÍCH THƯƠNG LÂM (SPEARWALL CHARGE REFLECTION)
    if (canReflectCav && isCavalryRegiment(attacker) && flankZone === 'front') {
      const atkBuff = getActiveBuffMods(attacker);
      const attackerCharge = getRegimentChargeBonus(attacker, atkBuff);
      const attackerArmor = getRegimentArmor(attacker, atkBuff);
      const armorMitigation = clamp((attackerArmor / 100) * 0.72, 0, 0.68);

      const bracedSpearmen = Math.min(defender.men, Math.max(8, defender.cols));
      const reflectFormMul = defenderForm.chargeReflect ? 1.25 : 1.05;
      const rawCounterPike =
        bracedSpearmen * (attackerCharge * 0.55 + defenderAntiCav * 1.35) * reflectFormMul;
      // Mũi trường thương xuyên giáp phần lớn nhờ chính quán tính lao tới của chiến mã
      const counterDmg = rawCounterPike * (0.65 + 0.35 * (1 - armorMitigation));

      attacker.vx = 0;
      attacker.vy = 0;
      if (!isRegimentUnbreakable(attacker, atkBuff)) {
        attacker.morale = clamp(attacker.morale - 18, 0, 100);
      }

      const cavSlain = applyDamageAndCountSlain(attacker, counterDmg);
      if (cavSlain > 0) {
        addKillsAndSyncRank(defender, cavSlain);
        recordCasualties(casualtiesByOwner, attacker.ownerIdx, cavSlain);
      }

      if (isAlive(attacker)) {
        attacker.engagedWithId = defender.id;
        attacker.anim = 'attack';
      }
      if (isAlive(defender) && defender.engagedWithId === undefined) {
        defender.engagedWithId = attacker.id;
      }

      majorChargeEvents.push({ attacker, defender });
      sfxOut.add('charge');
      sfxOut.add('clash');
      continue;
    }

    // 2. XUNG KÍCH HỦY DIỆT (DEVASTATING CHARGE IMPACT)
    const atkBuff = getActiveBuffMods(attacker);
    const defBuff = getActiveBuffMods(defender);
    const attackerMass = getRegimentMass(attacker);
    const defenderMass = Math.max(40, getRegimentMass(defender));
    const massRatio = clamp(attackerMass / defenderMass, 0.45, 3.2);

    const chargeBonus = getRegimentChargeBonus(attacker, atkBuff);
    const attackerForm = TW_FORMATIONS[attacker.formation] ?? TW_FORMATIONS.line;
    const highGroundMul = attacker.onHighGround && !defender.onHighGround ? 1.25 : 1.0;
    const terrainChargeMul = attacker.inRiver ? 0.65 : attacker.inMud ? 0.72 : 1.0;
    const auraAtkMul =
      (Number.isFinite(attacker.auraAtkMul) && attacker.auraAtkMul > 0
        ? attacker.auraAtkMul
        : 1.0) * atkBuff.atkMul;
    const momentumScale = clamp(0.82 + Math.min(accumulatedChargeTicks, 24) * 0.012, 0.85, 1.12);

    let flankImpactMul = 1.0;
    let moraleShock = isCavalryRegiment(attacker) || attacker.isGeneral ? 6 : 3;
    if (flankZone === 'flank') {
      flankImpactMul = 1.4;
      moraleShock = 12;
    } else if (flankZone === 'rear') {
      flankImpactMul = 1.85;
      moraleShock = 24;
    } else if (defenderBraced) {
      // Đâm trực diện vào Thuẫn Tường / Viên Trận đang cắm trụ làm giảm lực xung kích
      flankImpactMul = 0.55;
      moraleShock = 0;
    }

    const strengthRatio = attacker.isGeneral
      ? clamp(0.55 + (attacker.hp / Math.max(1, attacker.maxHp)) * 0.45, 0.5, 1.0)
      : clamp(attacker.men / Math.max(1, attacker.maxMen), 0.22, 1.0);

    const coreChargeProduct =
      massRatio *
      chargeBonus *
      attackerForm.chargeMul *
      auraAtkMul *
      flankImpactMul *
      momentumScale;

    const infantryFrontageImpact = attacker.isGeneral
      ? 0
      : Math.min(attacker.men, attacker.cols) * 14 * attackerForm.chargeMul * flankImpactMul;

    const rawImpactDmg =
      (coreChargeProduct * 5.1 + infantryFrontageImpact) *
      highGroundMul *
      terrainChargeMul *
      strengthRatio;

    const defenderArmor = getRegimentArmor(defender, defBuff);
    const armorMitigation = clamp((defenderArmor / 100) * 0.75, 0, 0.7);
    // Sát thương húc có 42% xuyên giáp do chấn động khối lượng, 58% chịu giảm trừ bởi giáp trụ
    let finalChargeDmg = rawImpactDmg * (0.42 + 0.58 * (1 - armorMitigation));

    if (defender.isGeneral) {
      // Tướng đơn độc chỉ bị tối đa vài kỵ sĩ/bộ binh tiếp cận cùng lúc
      finalChargeDmg = Math.min(finalChargeDmg * 0.28, defender.maxHp * 0.22);
    }

    const impDx = defender.x - attacker.x;
    const impDy = defender.y - attacker.y;
    const impDist = Math.hypot(impDx, impDy);
    const ux = impDist > 1e-4 ? impDx / impDist : Math.cos(attacker.facing);
    const uy = impDist > 1e-4 ? impDy / impDist : Math.sin(attacker.facing);

    const menSlain = applyDamageAndCountSlain(defender, finalChargeDmg);
    if (menSlain > 0) {
      addKillsAndSyncRank(attacker, menSlain);
      recordCasualties(casualtiesByOwner, defender.ownerIdx, menSlain);
    }

    if (moraleShock > 0 && isAlive(defender) && !isRegimentUnbreakable(defender, defBuff)) {
      defender.morale = clamp(defender.morale - moraleShock, 0, 100);
    }

    // 2B. THIẾT KỴ ĐẠP TRẬN & MŨI NHỌN PHONG THỈ CHÙY XUYÊN THỦNG TUYẾN BỘ BINH
    if (
      (isCavalryRegiment(attacker) || attacker.formation === 'wedge') &&
      massRatio >= 1.55 &&
      !defender.isGeneral &&
      !defenderBraced
    ) {
      const pushDist = clamp((massRatio - 1.2) * 11, 6, 20);
      defender.x = clamp(defender.x + ux * pushDist, 42, 3158);
      defender.y = clamp(defender.y + uy * pushDist, 42, 2158);
      defender.bracedTicks = 0;

      if (Math.hypot(attacker.vx, attacker.vy) > 1e-3) {
        attacker.vx *= 0.35;
        attacker.vy *= 0.35;
      } else {
        const rawSpd =
          attacker.isGeneral && attacker.generalId && TW_GENERALS[attacker.generalId]
            ? TW_GENERALS[attacker.generalId].speed
            : TW_UNITS[attacker.kind].speed;
        attacker.vx = ux * rawSpd * 0.35;
        attacker.vy = uy * rawSpd * 0.35;
      }
    }

    if (isAlive(attacker)) {
      attacker.engagedWithId = isAlive(defender) ? defender.id : undefined;
      attacker.anim = 'attack';
    }
    if (isAlive(defender) && !isRoutingOrShattered(defender)) {
      if (defender.engagedWithId === undefined) {
        defender.engagedWithId = attacker.id;
      }
      // Húc mạnh từ sườn hoặc sau lưng phá vỡ thế cắm thương đứng yên của mục tiêu
      if (flankZone !== 'front') {
        defender.bracedTicks = 0;
      }
    }

    if (chargeBonus >= 16 || flankZone !== 'front' || attacker.isGeneral) {
      majorChargeEvents.push({ attacker, defender });
    }
    sfxOut.add('charge');
  }

  // --------------------------------------------------------------------------
  // PHA B: GIAO TRANH CẬN CHIẾN DUY TRÌ (SUSTAINED MELEE CLASH)
  // --------------------------------------------------------------------------
  // Gom sát thương cận chiến đồng thời trong nhịp để hai bên chém trả công bằng không thiên vị thứ tự mảng
  const pendingMeleeDmg = new Float64Array(regs.length);
  const attackerCreditList: { attackerIdx: number; targetIdx: number; dmg: number }[] = [];
  const indexById = new Map<number, number>();
  for (let i = 0; i < regs.length; i++) {
    indexById.set(regs[i].id, i);
  }

  let anyMeleeClash = false;

  for (let i = 0; i < regs.length; i++) {
    const attacker = regs[i];
    if (attacker.duelId !== undefined || !isAlive(attacker) || isRoutingOrShattered(attacker)) {
      continue;
    }

    const aliveContacts = contactsByIdx[i].filter(
      (cand) => isAlive(cand) && cand.duelId === undefined,
    );

    if (aliveContacts.length === 0) {
      attacker.engagedWithId = undefined;
      continue;
    }

    // Xác định mục tiêu cận chiến chính (ưu tiên `lockedTargetId`, kế đến `engagedWithId`, rồi gần nhất)
    aliveContacts.sort((a, b) => {
      if (attacker.lockedTargetId !== undefined) {
        if (a.id === attacker.lockedTargetId) return -1;
        if (b.id === attacker.lockedTargetId) return 1;
      }
      if (attacker.engagedWithId !== undefined) {
        if (a.id === attacker.engagedWithId) return -1;
        if (b.id === attacker.engagedWithId) return 1;
      }
      // Ưu tiên đánh địch còn chiến đấu hơn là địch đã vỡ trận tháo chạy
      const aRout = isRoutingOrShattered(a) ? 1 : 0;
      const bRout = isRoutingOrShattered(b) ? 1 : 0;
      if (aRout !== bRout) return aRout - bRout;
      const da = Math.hypot(a.x - attacker.x, a.y - attacker.y);
      const db = Math.hypot(b.x - attacker.x, b.y - attacker.y);
      return da - db;
    });

    const activeTargets = aliveContacts.slice(0, 2);
    attacker.engagedWithId = activeTargets[0].id;
    attacker.anim = 'attack';
    anyMeleeClash = true;

    const atkBuff = getActiveBuffMods(attacker);
    const atkVet = syncRegimentVeterancy(attacker);
    const auraAtkMul =
      (Number.isFinite(attacker.auraAtkMul) && attacker.auraAtkMul > 0
        ? attacker.auraAtkMul
        : 1.0) * atkBuff.atkMul;
    const atkFatigueMul = fatigueMeleeMul(attacker.fatigue);
    const baseMeleeAtk =
      getRegimentBaseMeleeAtk(attacker) + atkBuff.atkAdd + atkVet.meleeAtkAdd;
    const antiCav = getRegimentAntiCavBonus(attacker);

    const sharePerTarget =
      activeTargets.length === 1
        ? 1.0
        : attacker.formation === 'circle'
          ? 0.58
          : 0.52;

    for (let t = 0; t < activeTargets.length; t++) {
      const defender = activeTargets[t];
      const defIdx = indexById.get(defender.id);
      if (defIdx === undefined) continue;

      const defBuff = getActiveBuffMods(defender);
      const defVet = syncRegimentVeterancy(defender);
      const defenderMounted = isMountedTarget(defender);
      const highGroundAtkAdd = attacker.onHighGround && !defender.onHighGround ? 5 : 0;

      const effectiveAtk =
        (baseMeleeAtk + (defenderMounted ? antiCav : 0) + highGroundAtkAdd) *
        auraAtkMul *
        atkFatigueMul;

      const defForm = TW_FORMATIONS[defender.formation] ?? TW_FORMATIONS.line;
      const terrainDefAdd =
        (defender.onHighGround ? 6 : 0) +
        (defender.inRiver ? -8 : 0) +
        (defender.inMud ? -4 : 0);
      const auraDefAdd = Number.isFinite(defender.auraDefAdd) ? defender.auraDefAdd : 0;

      let rawDef =
        (getRegimentBaseMeleeDef(defender) +
          defForm.meleeDefAdd +
          auraDefAdd +
          defBuff.defAdd +
          defVet.meleeDefAdd +
          terrainDefAdd) *
        fatigueMeleeMul(defender.fatigue);
      rawDef = Math.max(0, rawDef);

      const flankZone = computeFlankZone(attacker.x, attacker.y, defender);
      let effectiveDef = rawDef * (defender.inRiver ? 0.8 : 1.0);
      if (isRoutingOrShattered(defender)) {
        effectiveDef *= 0.2;
      } else if (flankZone === 'flank') {
        effectiveDef *= 0.6;
      } else if (flankZone === 'rear') {
        effectiveDef *= 0.25;
      }

      // Công thức xác suất trúng đòn chuẩn Total War
      const hitChance = clamp(0.35 + (effectiveAtk - effectiveDef) * 0.01, 0.12, 0.88);

      const defenderArmor = getRegimentArmor(defender, defBuff);
      const armorMitigation = clamp((defenderArmor / 100) * 0.78, 0, 0.72);

      let dps: number;
      if (attacker.isGeneral) {
        const heroNormal = (32 + baseMeleeAtk * 0.45) * auraAtkMul;
        const heroAp = (24 + baseMeleeAtk * 0.28) * auraAtkMul;
        const dmgPerSwing = heroNormal * (1 - armorMitigation) + heroAp;
        const heroCleave = defender.isGeneral ? 2.4 : 6.8;
        dps = heroCleave * 0.68 * hitChance * dmgPerSwing;
      } else {
        const unitSpec = TW_UNITS[attacker.kind];
        const isPolearm = unitSpec.category === 'infantry_polearm';
        const isCav = isCavalryRegiment(attacker);
        const rankDepthFactor = isPolearm ? 1.65 : isCav ? 1.35 : 1.4;
        let engagedCombatants = Math.min(
          attacker.men,
          Math.max(1, Math.round(attacker.cols * rankDepthFactor)),
        );
        if (defender.isGeneral) {
          // Giới hạn số lính có thể vây chém cùng lúc quanh một Danh Tướng
          engagedCombatants = Math.min(engagedCombatants, 9);
        }

        const cavSwingMul = isCav ? 1.75 : 1.0;
        const normalPerHit = (18 + baseMeleeAtk * 0.28) * cavSwingMul * auraAtkMul;
        const apPerHit =
          (unitSpec.armorPiercingDmg * cavSwingMul +
            (defenderMounted ? antiCav * 0.55 : 0)) *
          auraAtkMul;

        const dmgPerHit = normalPerHit * (1 - armorMitigation) + apPerHit;
        dps = engagedCombatants * 0.68 * hitChance * dmgPerHit;
      }

      const stepDmg = dps * sharePerTarget * dtSec;
      if (stepDmg > 0) {
        pendingMeleeDmg[defIdx] += stepDmg;
        attackerCreditList.push({ attackerIdx: i, targetIdx: defIdx, dmg: stepDmg });
      }
    }
  }

  // Áp dụng sát thương cận chiến đồng loạt và phân bổ công trạng (`kills`) chính xác
  for (let defIdx = 0; defIdx < regs.length; defIdx++) {
    const totalDmg = pendingMeleeDmg[defIdx];
    if (!(totalDmg > 0)) continue;

    const defender = regs[defIdx];
    const menSlain = applyDamageAndCountSlain(defender, totalDmg);
    if (menSlain <= 0) continue;

    recordCasualties(casualtiesByOwner, defender.ownerIdx, menSlain);

    // Chia số quân tiêu diệt cho các trung đoàn vừa gây sát thương lên `defender` trong nhịp này
    const contributors = attackerCreditList.filter((c) => c.targetIdx === defIdx);
    if (contributors.length === 1) {
      addKillsAndSyncRank(regs[contributors[0].attackerIdx], menSlain);
    } else if (contributors.length > 1) {
      contributors.sort((a, b) => b.dmg - a.dmg);
      let remainingKills = menSlain;
      for (let k = 0; k < contributors.length; k++) {
        const share =
          k === contributors.length - 1
            ? remainingKills
            : Math.min(remainingKills, Math.round((menSlain * contributors[k].dmg) / totalDmg));
        addKillsAndSyncRank(regs[contributors[k].attackerIdx], share);
        remainingKills -= share;
      }
    }
  }

  if (anyMeleeClash) {
    sfxOut.add('clash');
  }

  return { casualtiesByOwner, majorChargeEvents };
}

// ============================================================================
// 3. XẠ KÍCH CUNG NỎ, PHÁO ĐÁ UY VIỄN & ĐẠN ĐẠO (RANGED & PROJECTILES)
// ============================================================================

/**
 * Kiểm tra nhanh trung đoàn `reg` có đang được Mưu Sĩ (`strategist`) đồng minh còn sống,
 * không vỡ trận đứng chỉ huy trong bán kính `TW_CLASSES.strategist.auraRadius` hay không.
 */
function hasAlliedStrategistAura(
  reg: TwSimRegiment,
  allRegs: ReadonlyArray<TwSimRegiment>,
): boolean {
  const radius = TW_CLASSES.strategist.auraRadius;
  const radiusSq = radius * radius;
  for (let i = 0; i < allRegs.length; i++) {
    const other = allRegs[i];
    if (
      !other.isGeneral ||
      other.team !== reg.team ||
      !other.generalId ||
      !isAlive(other) ||
      isRoutingOrShattered(other)
    ) {
      continue;
    }
    const genSpec = TW_GENERALS[other.generalId];
    if (!genSpec || genSpec.class !== 'strategist') continue;
    const dx = reg.x - other.x;
    const dy = reg.y - other.y;
    if (dx * dx + dy * dy <= radiusSq) {
      return true;
    }
  }
  return false;
}

/**
 * Tính khoảng cách từ điểm nổ `(px, py)` tới hình chữ nhật đội hình có hướng của `reg`
 * (bằng `0` nếu `(px, py)` rơi trực tiếp vào bên trong diện tích đội hình).
 */
function distancePointToRegimentFootprint(
  px: number,
  py: number,
  reg: Pick<TwSimRegiment, 'x' | 'y' | 'width' | 'depth' | 'facing'>,
): number {
  const dx = px - reg.x;
  const dy = py - reg.y;
  const fx = Math.cos(reg.facing);
  const fy = Math.sin(reg.facing);
  const localF = Math.abs(dx * fx + dy * fy);
  const localL = Math.abs(-dx * fy + dy * fx);

  const halfDepth = Math.max(14, reg.depth * 0.5);
  const halfWidth = Math.max(14, reg.width * 0.5);

  const overF = Math.max(0, localF - halfDepth);
  const overL = Math.max(0, localL - halfWidth);
  return Math.hypot(overF, overL);
}

/** Chuyển đổi đạn mô phỏng máy chủ sang khung dữ liệu truyền về Client */
export function toProjectileFrame(proj: TwLiveProjectile): TwProjectileFrame {
  const progress =
    proj.flightDur > 1e-4 ? clamp(proj.elapsed / proj.flightDur, 0, 1) : 1;
  return {
    id: proj.id,
    kind: proj.kind,
    x0: proj.x0,
    y0: proj.y0,
    x1: proj.x1,
    y1: proj.y1,
    progress: Math.round(progress * 1000) / 1000,
    ownerIdx: proj.ownerIdx,
  };
}

/**
 * Phóng loạt tên canh gác từ Tháp Tiễn Thành Lũy (0 A.D. Han Defense Tower / TW3K Bastion Watchtower)
 * nhắm vào trung đoàn địch đang xâm phạm trong bán kính 420 đơn vị.
 */
export function spawnBastionTowerProjectile(
  projectiles: TwLiveProjectile[],
  nextProjId: () => number,
  x0: number,
  y0: number,
  target: TwSimRegiment,
  ownerTeam: number,
  ownerIdx: number,
  sfxOut: Set<TwSfxEvent>,
): void {
  if (!isAlive(target)) return;

  const dist = Math.hypot(target.x - x0, target.y - y0);
  const towerProjSpeed = 365;
  const estFlight = clamp(dist / towerProjSpeed, 0.16, 1.8);
  const leadX = target.x + target.vx * estFlight * 0.55;
  const leadY = target.y + target.vy * estFlight * 0.55;

  const volleyCount = 2;
  const totalNormal = 210;
  const totalAp = 110;

  for (let c = 0; c < volleyCount; c++) {
    const jitterAng = Math.random() * Math.PI * 2;
    const jitterR = 6 + Math.random() * 14;
    const x1 = round1(leadX + Math.cos(jitterAng) * jitterR);
    const y1 = round1(leadY + Math.sin(jitterAng) * jitterR);
    const ox = round1(x0 + (c === 0 ? -7 : 7));
    const oy = round1(y0 + (c === 0 ? -5 : 5));
    const flightDist = Math.hypot(x1 - ox, y1 - oy);
    const flightDur = clamp(flightDist / towerProjSpeed, 0.16, 2.0);

    projectiles.push({
      id: nextProjId(),
      kind: 'arrow',
      shooterRegId: -1,
      ownerIdx,
      team: ownerTeam,
      x0: ox,
      y0: oy,
      x1,
      y1,
      elapsed: 0,
      flightDur,
      normalDmg: totalNormal / volleyCount,
      apDmg: totalAp / volleyCount,
      aoeRadius: 28,
      moraleShock: 1.5,
    });
  }

  sfxOut.add('volley');
}

/**
 * Mô phỏng xạ kích của các trung đoàn Cung / Nỏ / Pháo Đá Uy Viễn và cập nhật quỹ đạo đạn bay:
 * - Tầm bắn cộng +20% khi chiếm lĩnh Đồi Cao (`onHighGround`) và biến thiên theo chiều Gió Chiến Trường (`windAngle` / `windStrength`).
 * - Hỗ trợ Tên Lửa (`fire_arrow`: nạp chậm hơn 1.08x trừ phi có `fire_volley`, gây thêm -4 Sĩ khí & đốt cháy Rừng/Dầu).
 * - Khi chạm đất: xét rừng rậm chắn 45% tên/nỏ, mộc thuẫn + trận hình chắn đạn trực diện,
 *   Tản Trận (`loose`) giảm thương vong và đá lửa công thành (`boulder`) nổ AoE xuyên giáp, chấn áp Tháp Tiễn & châm lửa.
 */
export function stepRangedAndProjectiles(
  regs: TwSimRegiment[],
  projectiles: TwLiveProjectile[],
  nextProjId: () => number,
  dtSec: number,
  sfxOut: Set<TwSfxEvent>,
  env?: TwRangedEnv,
): void {
  if (!(dtSec > 0) || !Number.isFinite(dtSec)) return;

  const regById = new Map<number, TwSimRegiment>();
  for (let i = 0; i < regs.length; i++) {
    regById.set(regs[i].id, regs[i]);
  }

  const windStrength =
    env?.windStrength !== undefined && Number.isFinite(env.windStrength) && env.windStrength > 0
      ? env.windStrength
      : 0;
  const windAngle = env?.windAngle ?? 0;

  // --------------------------------------------------------------------------
  // 1. CẬP NHẬT NẠP ĐẠN & KHAI HỎA CỦA TRUNG ĐOÀN CUNG NỎ / PHÁO ĐÁ
  // --------------------------------------------------------------------------
  for (let i = 0; i < regs.length; i++) {
    const shooter = regs[i];
    if (shooter.isGeneral || shooter.duelId !== undefined || !isAlive(shooter)) {
      continue;
    }

    const shooterVet = syncRegimentVeterancy(shooter);
    const unitSpec = TW_UNITS[shooter.kind];
    if (unitSpec.range <= 0 || shooter.ammo <= 0) {
      continue;
    }

    // Luôn giảm thời gian hồi nạp đạn ngay cả khi trung đoàn đang cơ động đổi vị trí
    if (shooter.reloadLeftSec > 0) {
      shooter.reloadLeftSec = Math.max(0, shooter.reloadLeftSec - dtSec);
    }

    if (
      shooter.engagedWithId !== undefined ||
      shooter.anim === 'attack' ||
      isRoutingOrShattered(shooter) ||
      (!shooter.guardMode && !shooter.fireAtWill && shooter.lockedTargetId === undefined)
    ) {
      continue;
    }

    // Bộ cung, nỏ và pháo đá cần dừng chân ổn định đội hình để giương cung / kéo cần phóng
    if (Math.hypot(shooter.vx, shooter.vy) > 12) {
      continue;
    }

    const baseRange = unitSpec.range * (shooter.onHighGround ? 1.2 : 1.0);
    const effectiveRangeTo = (tx: number, ty: number): number => {
      if (windStrength <= 0) return baseRange;
      const windAlign =
        Math.cos(Math.atan2(ty - shooter.y, tx - shooter.x) - windAngle) * windStrength;
      return baseRange * clamp(1 + windAlign * 0.08, 0.94, 1.09);
    };

    let target: TwSimRegiment | undefined;
    let targetDist = Infinity;

    // Ưu tiên 1: Mục tiêu khóa chỉ định (`lockedTargetId`) nếu nằm trong tầm bắn và nhìn thấy
    if (shooter.lockedTargetId !== undefined) {
      const locked = regById.get(shooter.lockedTargetId);
      if (
        locked &&
        locked.team !== shooter.team &&
        locked.duelId === undefined &&
        isAlive(locked) &&
        locked.moraleState !== 'shattered' &&
        !locked.hidden
      ) {
        const d = Math.hypot(locked.x - shooter.x, locked.y - shooter.y);
        if (d <= effectiveRangeTo(locked.x, locked.y)) {
          target = locked;
          targetDist = d;
        }
      }
    }

    // Ưu tiên 2: Tự động chọn địch lộ diện (`!hidden`), chưa tan rã gần nhất khi bật `fireAtWill`
    if (!target && shooter.fireAtWill) {
      let bestRoutingCand: TwSimRegiment | undefined;
      let bestRoutingDist = Infinity;

      for (let j = 0; j < regs.length; j++) {
        const enemy = regs[j];
        if (
          enemy.team === shooter.team ||
          enemy.duelId !== undefined ||
          !isAlive(enemy) ||
          enemy.hidden ||
          enemy.moraleState === 'shattered'
        ) {
          continue;
        }
        const d = Math.hypot(enemy.x - shooter.x, enemy.y - shooter.y);
        if (d > effectiveRangeTo(enemy.x, enemy.y)) continue;

        if (enemy.moraleState === 'routing') {
          if (!shooter.guardMode && d < bestRoutingDist) {
            bestRoutingDist = d;
            bestRoutingCand = enemy;
          }
          continue;
        }

        if (d < targetDist) {
          targetDist = d;
          target = enemy;
        }
      }

      if (!target && bestRoutingCand) {
        target = bestRoutingCand;
        targetDist = bestRoutingDist;
      }
    }

    if (!target || shooter.reloadLeftSec > 0) {
      continue;
    }

    const shooterBuff = getActiveBuffMods(shooter);
    const hasFireVolleyBuff =
      shooter.activeBuff === 'fire_volley' || shooterBuff.fireVolley;
    const useFireArrows = shooter.fireArrowActive || hasFireVolleyBuff;

    // Xác định loại đạn phóng theo binh chủng và hiệu ứng Hỏa Tiễn
    const projKind: TwProjectileKind =
      unitSpec.category === 'artillery'
        ? 'boulder'
        : useFireArrows
          ? 'fire_arrow'
          : unitSpec.category === 'ranged_crossbow'
            ? 'bolt'
            : 'arrow';

    const projSpeed =
      projKind === 'boulder'
        ? SPEED_BOULDER
        : projKind === 'bolt'
          ? SPEED_BOLT
          : projKind === 'fire_arrow'
            ? SPEED_FIRE_ARROW
            : SPEED_ARROW;

    // Đón đầu nhẹ hướng di chuyển mục tiêu
    const estFlight = clamp(targetDist / projSpeed, 0.2, 3.2);
    const leadX = target.x + target.vx * estFlight * 0.55;
    const leadY = target.y + target.vy * estFlight * 0.55;

    // Xoay mặt đội hình xạ thủ về hướng mục tiêu khi đứng yên bắn tự do
    if (shooter.moveTargetX === undefined && shooter.moveTargetY === undefined) {
      shooter.facing = Math.atan2(leadY - shooter.y, leadX - shooter.x);
    }

    const auraAtkMul =
      (Number.isFinite(shooter.auraAtkMul) && shooter.auraAtkMul > 0
        ? shooter.auraAtkMul
        : 1.0) * shooterBuff.atkMul;
    const strategistBuffed =
      hasAlliedStrategistAura(shooter, regs) || hasFireVolleyBuff;
    const fireArrowReloadMul =
      projKind === 'fire_arrow' && !hasFireVolleyBuff ? 1.08 : 1.0;

    shooter.ammo = Math.max(0, shooter.ammo - 1);
    shooter.reloadLeftSec =
      unitSpec.reloadSec *
      (strategistBuffed ? 0.8 : 1.0) *
      shooterVet.reloadMul *
      fireArrowReloadMul;
    shooter.anim = 'shoot';

    if (projKind === 'boulder') {
      // Pháo Đá Uy Viễn: phóng tảng đá lửa khổng lồ nổ lan xuyên giáp và trấn áp -10 Sĩ khí
      const scatterR = (16 + targetDist * 0.045) * Math.sqrt(Math.random());
      const scatterAng = Math.random() * Math.PI * 2;
      const x1 = round1(leadX + Math.cos(scatterAng) * scatterR);
      const y1 = round1(leadY + Math.sin(scatterAng) * scatterR);
      const actualDist = Math.hypot(x1 - shooter.x, y1 - shooter.y);
      const flightDur = clamp(actualDist / projSpeed, 0.28, 3.6);

      const crewScale = shooter.men * 0.62 * auraAtkMul;
      projectiles.push({
        id: nextProjId(),
        kind: 'boulder',
        shooterRegId: shooter.id,
        ownerIdx: shooter.ownerIdx,
        team: shooter.team,
        x0: round1(shooter.x),
        y0: round1(shooter.y),
        x1,
        y1,
        elapsed: 0,
        flightDur,
        normalDmg: unitSpec.missileDmg * crewScale,
        apDmg: unitSpec.armorPiercingDmg * crewScale,
        aoeRadius: 62,
        moraleShock: 10,
      });
      sfxOut.add('boulder');
    } else {
      // Cung & Nỏ: tạo chùm loạt tên trải dọc theo chiều ngang đội hình xạ thủ
      const volleyClusters = clamp(Math.ceil(shooter.men / 30), 2, 4);
      const fireBonusMul = projKind === 'fire_arrow' ? 1.15 : 1.0;
      const totalNormal = shooter.men * unitSpec.missileDmg * 0.3 * auraAtkMul * fireBonusMul;
      const totalAp = shooter.men * unitSpec.armorPiercingDmg * 0.3 * auraAtkMul * fireBonusMul;

      const latX = -Math.sin(shooter.facing);
      const latY = Math.cos(shooter.facing);
      const tgtLatX = -Math.sin(target.facing);
      const tgtLatY = Math.cos(target.facing);

      const depthScatterMax =
        (projKind === 'bolt' ? 10 : 14) + targetDist * (projKind === 'bolt' ? 0.03 : 0.042);
      const perClusterShock = 1.2 / volleyClusters;

      for (let c = 0; c < volleyClusters; c++) {
        const bandFrac =
          volleyClusters === 1 ? 0 : (c / (volleyClusters - 1) - 0.5) * 0.72;
        const originOffset = bandFrac * shooter.width;
        const x0 = round1(shooter.x + latX * originOffset);
        const y0 = round1(shooter.y + latY * originOffset);

        const tgtSpan = Math.min(target.width * 0.36, 75);
        const jitterDepth = (Math.random() * 2 - 1) * depthScatterMax;
        const jitterLat =
          bandFrac * tgtSpan + (Math.random() * 2 - 1) * Math.max(10, tgtSpan * 0.35);

        const fwdTgtX = Math.cos(target.facing);
        const fwdTgtY = Math.sin(target.facing);
        const x1 = round1(leadX + tgtLatX * jitterLat + fwdTgtX * jitterDepth);
        const y1 = round1(leadY + tgtLatY * jitterLat + fwdTgtY * jitterDepth);

        const flightDist = Math.hypot(x1 - x0, y1 - y0);
        const flightDur = clamp(flightDist / projSpeed, 0.18, 3.0);

        projectiles.push({
          id: nextProjId(),
          kind: projKind,
          shooterRegId: shooter.id,
          ownerIdx: shooter.ownerIdx,
          team: shooter.team,
          x0,
          y0,
          x1,
          y1,
          elapsed: 0,
          flightDur,
          normalDmg: totalNormal / volleyClusters,
          apDmg: totalAp / volleyClusters,
          aoeRadius: 28,
          moraleShock: perClusterShock,
        });
      }
      sfxOut.add('volley');
    }
  }

  // --------------------------------------------------------------------------
  // 2. TIẾN TRIỂN ĐẠN BAY & TÍNH SÁT THƯƠNG KHI CHẠM ĐẤT
  // --------------------------------------------------------------------------
  let writeIdx = 0;
  for (let p = 0; p < projectiles.length; p++) {
    const proj = projectiles[p];
    proj.elapsed += dtSec;

    if (proj.elapsed < proj.flightDur) {
      projectiles[writeIdx++] = proj;
      continue;
    }

    const shooterReg = regById.get(proj.shooterRegId);
    const hitRadius = Math.max(24, proj.aoeRadius);

    if (proj.kind === 'boulder') {
      env?.onBoulderImpact?.(proj.x1, proj.y1, proj.ownerIdx, proj.team);
      env?.onFireImpact?.(proj.x1, proj.y1, proj.ownerIdx, proj.team, 58);

      // Pháo Đá Uy Viễn: sát thương nổ diện rộng lên mọi trung đoàn địch nằm trong vùng va chạm
      for (let r = 0; r < regs.length; r++) {
        const victim = regs[r];
        if (
          victim.team === proj.team ||
          victim.duelId !== undefined ||
          !isAlive(victim)
        ) {
          continue;
        }

        const fpDist = distancePointToRegimentFootprint(proj.x1, proj.y1, victim);
        if (fpDist > hitRadius) continue;

        const falloff = clamp(1.12 - fpDist / (hitRadius * 1.35), 0.45, 1.0);
        const vicBuff = getActiveBuffMods(victim);
        const armor = getRegimentArmor(victim, vicBuff);
        const armorMitigation = clamp((armor / 100) * 0.75, 0, 0.7);
        const looseMul =
          victim.formation === 'loose'
            ? 1 / (TW_FORMATIONS.loose.spreadMul * 1.15)
            : 1.0;

        const boulderForestMul = victim.inForest ? 0.78 : 1.0;
        let dmg =
          (proj.normalDmg * (1 - armorMitigation) + proj.apDmg) *
          falloff *
          looseMul *
          boulderForestMul;
        if (victim.isGeneral) {
          dmg = Math.min(dmg * 0.32, victim.maxHp * 0.14);
        }

        const slain = applyDamageAndCountSlain(victim, dmg);
        if (slain > 0 && shooterReg) {
          addKillsAndSyncRank(shooterReg, slain);
        }

        if (proj.moraleShock > 0 && isAlive(victim) && !isRegimentUnbreakable(victim, vicBuff)) {
          victim.morale = clamp(victim.morale - proj.moraleShock, 0, 100);
        }
      }
    } else {
      if (proj.kind === 'fire_arrow') {
        env?.onFireImpact?.(proj.x1, proj.y1, proj.ownerIdx, proj.team, 64);
      }

      // Tên thường / Hỏa tiễn / Tên nỏ: trúng trung đoàn địch gần điểm rơi `(x1, y1)` nhất
      let bestVictim: TwSimRegiment | undefined;
      let bestFpDist = Infinity;

      for (let r = 0; r < regs.length; r++) {
        const cand = regs[r];
        if (cand.team === proj.team || cand.duelId !== undefined || !isAlive(cand)) {
          continue;
        }
        const fpDist = distancePointToRegimentFootprint(proj.x1, proj.y1, cand);
        if (fpDist <= hitRadius && fpDist < bestFpDist) {
          bestFpDist = fpDist;
          bestVictim = cand;
        }
      }

      if (bestVictim) {
        const vicBuff = getActiveBuffMods(bestVictim);

        // 1) Tán rừng thông chắn 45% tên và nỏ
        const forestMul = bestVictim.inForest ? 1 - FOREST_ARROW_BLOCK_RATIO : 1.0;

        // 2) Mộc thuẫn + Trận hình chắn tên khi hứng đạn từ chính diện ('front')
        const hitZone = computeFlankZone(proj.x0, proj.y0, bestVictim);
        let shieldMul = 1.0;
        if (hitZone === 'front' && !isRoutingOrShattered(bestVictim)) {
          const baseShield = bestVictim.isGeneral
            ? 25
            : TW_UNITS[bestVictim.kind].shieldMissileBlock;
          const formBlockAdd =
            (TW_FORMATIONS[bestVictim.formation] ?? TW_FORMATIONS.line).missileBlockAdd;
          const totalBlockPct = clamp(
            baseShield + formBlockAdd + vicBuff.missileBlockAdd,
            0,
            90,
          );
          shieldMul = 1 - totalBlockPct / 100;
        }

        // 3) Tản Trận ('loose') giãn thưa cự ly binh sĩ giúp giảm mạnh thương vong dưới mưa tên
        const looseMul =
          bestVictim.formation === 'loose'
            ? 1 / (TW_FORMATIONS.loose.spreadMul * 1.15)
            : 1.0;

        // 4) Giáp trụ giảm sát thương thường (không giảm sát thương xuyên giáp AP của Liên Châu Nỏ)
        const armor = getRegimentArmor(bestVictim, vicBuff);
        const armorMitigation = clamp((armor / 100) * 0.78, 0, 0.72);

        let dmg =
          (proj.normalDmg * (1 - armorMitigation) + proj.apDmg) *
          forestMul *
          shieldMul *
          looseMul;

        if (bestVictim.isGeneral) {
          dmg = Math.min(dmg * 0.35, bestVictim.maxHp * 0.06);
        }

        const slain = applyDamageAndCountSlain(bestVictim, dmg);
        if (slain > 0 && shooterReg) {
          addKillsAndSyncRank(shooterReg, slain);
        }

        const totalMoraleShock = proj.moraleShock + (proj.kind === 'fire_arrow' ? 4 : 0);
        if (totalMoraleShock > 0 && isAlive(bestVictim) && !isRegimentUnbreakable(bestVictim, vicBuff)) {
          bestVictim.morale = clamp(bestVictim.morale - totalMoraleShock, 0, 100);
        }
      }
    }
  }

  projectiles.length = writeIdx;
}

// ============================================================================
// 4. HÀO QUANG NGŨ HÀNH TƯỚNG LĨNH & ĐỘNG CƠ SĨ KHÍ (MORALE & WU XING AURAS)
// ============================================================================

function approachValue(current: number, target: number, maxDelta: number): number {
  if (current < target) {
    return Math.min(target, current + maxDelta);
  }
  if (current > target) {
    return Math.max(target, current - maxDelta);
  }
  return current;
}

/**
 * Cập nhật Hào quang Ngũ Hành Tướng Lĩnh (`TW_CLASSES`), Quan Hệ Tướng Lĩnh (`Guanxi`)
 * và tính toán Sĩ khí động cho toàn quân:
 * - Hào quang Ngũ Hành:
 *   + Hỏa Tiên Phong (`vanguard`): +15% Công/Xung kích & +8% Tốc chạy
 *   + Mộc Dũng Tướng (`champion`): +12% Công cận chiến
 *   + Kim Hộ Vệ (`sentinel`): +14 Thủ cận chiến
 *   + Thổ Thống Soái (`commander`): +16 Sĩ khí & +10% Tốc chạy
 *   + Thủy Mưu Sĩ (`strategist`): -20% Thời gian nạp đạn & kích hoạt Hỏa Tiễn khi dùng tuyệt kỹ
 * - Quan Hệ Tướng Lĩnh (`Guanxi`):
 *   + Cuồng Nộ Báo Thù (`enraged`): x1.38 Công, Bất Khuất >= 50 Sĩ khí
 *   + Đồng Tâm Hiệp Lực (`harmony` — Kết nghĩa / Thân quyến trong 320u): +0.08 Công & +8 Sĩ khí cho tướng và đồng minh trong 185u
 *   + Kình Địch Truyền Kiếp (`rival` trong 320u): +0.10 Công
 * - Chuỗi trạng thái Sĩ khí: `eager` (>=75), `steady` (42..74), `wavering` (20..41),
 *   `routing` (<20, phát SFX `'rout'`), `shattered` (<8 và quân số <12% `maxMen`),
 *   cùng cơ chế Chỉnh đốn (`Rally`) trở lại `'steady'` khi rút lui an toàn >260 đơn vị và hồi >=42 Sĩ khí.
 */
export function stepMoraleAndAuras(
  regs: TwSimRegiment[],
  dtSec: number,
  sfxOut: Set<TwSfxEvent>,
): void {
  if (!(dtSec > 0) || !Number.isFinite(dtSec) || regs.length === 0) return;

  // --------------------------------------------------------------------------
  // BƯỚC 1: ĐẶT LẠI & ÁP DỤNG HÀO QUANG NGŨ HÀNH TƯỚNG LĨNH (WU XING AURAS)
  // --------------------------------------------------------------------------
  for (let i = 0; i < regs.length; i++) {
    const reg = regs[i];
    syncRegimentVeterancy(reg);
    if (reg.guanxiEnrageLeftSec !== undefined) {
      reg.guanxiEnrageLeftSec = Math.max(0, (reg.guanxiEnrageLeftSec ?? 0) - dtSec);
    }
    if (!isAlive(reg) || !reg.isGeneral) {
      reg.guanxiState = undefined;
    }

    const selfBuff = getActiveBuffMods(reg);
    reg.auraAtkMul = 1.0;
    reg.auraDefAdd = 0;
    reg.auraSpeedMul = selfBuff.speedMul;
    reg.auraMoraleAdd = 0;

    const isMissileUnit =
      !reg.isGeneral &&
      (TW_UNITS[reg.kind].category === 'ranged_bow' ||
        TW_UNITS[reg.kind].category === 'ranged_crossbow' ||
        TW_UNITS[reg.kind].category === 'artillery');
    if (!isMissileUnit) {
      reg.fireArrowActive = false;
    } else if (selfBuff.fireVolley) {
      reg.fireArrowActive = true;
    }
  }

  // Thu thập các Danh Tướng đang sống và không tháo chạy
  const activeGenerals: {
    gen: TwSimRegiment;
    cls: TwGeneralClass;
    radiusSq: number;
    hasActiveSkillBuff: boolean;
  }[] = [];

  // Theo dõi phe sở hữu (`ownerIdx`) có Tướng chỉ huy đã tử trận hay chưa
  const fallenGeneralOwners = new Set<number>();
  const aliveGenerals: TwSimRegiment[] = [];

  for (let i = 0; i < regs.length; i++) {
    const reg = regs[i];
    if (!reg.isGeneral) continue;

    if (!isAlive(reg)) {
      fallenGeneralOwners.add(reg.ownerIdx);
      continue;
    }

    aliveGenerals.push(reg);

    if (isRoutingOrShattered(reg) || !reg.generalId) {
      continue;
    }

    const genSpec = TW_GENERALS[reg.generalId];
    if (!genSpec) continue;
    const classSpec = TW_CLASSES[genSpec.class];
    const r = classSpec.auraRadius;
    activeGenerals.push({
      gen: reg,
      cls: genSpec.class,
      radiusSq: r * r,
      hasActiveSkillBuff:
        Boolean(reg.activeBuff) &&
        (reg.activeBuffLeftSec === undefined || reg.activeBuffLeftSec > 0),
    });
  }

  // Theo dõi trung đoàn nào đang đứng dưới đại kỳ Thống Soái (`commander`) hoặc bất kỳ Danh tướng đồng minh nào để hưởng nhuệ khí chỉ huy
  const underCommanderAura = new Uint8Array(regs.length);
  const underAnyGeneralAura = new Uint8Array(regs.length);

  for (let i = 0; i < regs.length; i++) {
    const ally = regs[i];
    if (!isAlive(ally)) continue;

    let hasVanguard = false;
    let hasChampion = false;
    let hasSentinel = false;
    let hasCommander = false;
    let hasStrategist = false;
    let strategistSkillBuffed = false;

    for (let g = 0; g < activeGenerals.length; g++) {
      const auraGen = activeGenerals[g];
      if (auraGen.gen.team !== ally.team) continue;

      const dx = ally.x - auraGen.gen.x;
      const dy = ally.y - auraGen.gen.y;
      if (dx * dx + dy * dy > auraGen.radiusSq) continue;

      underAnyGeneralAura[i] = 1;
      switch (auraGen.cls) {
        case 'vanguard':
          hasVanguard = true;
          break;
        case 'champion':
          hasChampion = true;
          break;
        case 'sentinel':
          hasSentinel = true;
          break;
        case 'commander':
          hasCommander = true;
          break;
        case 'strategist':
          hasStrategist = true;
          if (auraGen.hasActiveSkillBuff) {
            strategistSkillBuffed = true;
          }
          break;
      }
    }

    if (hasVanguard) {
      ally.auraAtkMul *= 1.15;
      ally.auraSpeedMul *= 1.08;
    }
    if (hasChampion) {
      ally.auraAtkMul *= 1.12;
    }
    if (hasSentinel) {
      ally.auraDefAdd += 14;
    }
    if (hasCommander) {
      ally.auraMoraleAdd += 16;
      ally.auraSpeedMul *= 1.1;
      underCommanderAura[i] = 1;
    } else if (underAnyGeneralAura[i] === 1) {
      // Danh tướng các hệ khác (Tiên Phong / Dũng Tướng / Hộ Vệ / Mưu Sĩ) vẫn khích lệ +8 Sĩ khí dưới bóng cờ tướng
      ally.auraMoraleAdd += 8;
    }
    if (hasStrategist && !ally.isGeneral) {
      const cat = TW_UNITS[ally.kind].category;
      const allyBuffed =
        strategistSkillBuffed ||
        (Boolean(ally.activeBuff) &&
          (ally.activeBuffLeftSec === undefined || ally.activeBuffLeftSec > 0));
      if (
        allyBuffed &&
        (cat === 'ranged_bow' || cat === 'ranged_crossbow' || cat === 'artillery')
      ) {
        ally.fireArrowActive = true;
      }
    }
  }

  // --------------------------------------------------------------------------
  // BƯỚC 1B: QUAN HỆ NGŨ HÀNH TƯỚNG LĨNH (GUANXI BONDS & ENRAGE)
  // --------------------------------------------------------------------------
  const harmonyGenerals: TwSimRegiment[] = [];
  const guanxiDetectSq = 320 * 320;
  const harmonyAuraSq = 185 * 185;

  for (let g = 0; g < aliveGenerals.length; g++) {
    const gen = aliveGenerals[g];
    if ((gen.guanxiEnrageLeftSec ?? 0) > 0) {
      gen.guanxiState = 'enraged';
      gen.auraAtkMul *= 1.38;
      gen.auraMoraleAdd += 18;
      continue;
    }

    let hasHarmony = false;
    let hasRival = false;
    if (gen.generalId) {
      for (let o = 0; o < aliveGenerals.length; o++) {
        const other = aliveGenerals[o];
        if (other.id === gen.id || !other.generalId) continue;
        const dx = other.x - gen.x;
        const dy = other.y - gen.y;
        if (dx * dx + dy * dy > guanxiDetectSq) continue;

        const bond = findTwGuanxiBond(gen.generalId, other.generalId);
        if (!bond) continue;

        if (other.team === gen.team && (bond.kind === 'oath' || bond.kind === 'kin')) {
          hasHarmony = true;
        } else if (other.team !== gen.team && bond.kind === 'rival') {
          hasRival = true;
        }
      }
    }

    if (hasHarmony) {
      gen.guanxiState = 'harmony';
      harmonyGenerals.push(gen);
    } else if (hasRival) {
      gen.guanxiState = 'rival';
      gen.auraAtkMul = Math.round((gen.auraAtkMul + 0.1) * 1000) / 1000;
    } else {
      gen.guanxiState = undefined;
    }
  }

  if (harmonyGenerals.length > 0) {
    for (let i = 0; i < regs.length; i++) {
      const ally = regs[i];
      if (!isAlive(ally)) continue;
      for (let h = 0; h < harmonyGenerals.length; h++) {
        const hGen = harmonyGenerals[h];
        if (hGen.team !== ally.team) continue;
        const dx = ally.x - hGen.x;
        const dy = ally.y - hGen.y;
        if (dx * dx + dy * dy <= harmonyAuraSq) {
          ally.auraAtkMul = Math.round((ally.auraAtkMul + 0.08) * 1000) / 1000;
          ally.auraMoraleAdd += 8;
          break;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // BƯỚC 2: TÍNH SĨ KHÍ ĐỘNG, VỠ TRẬN THÁO CHẠY & CHỈNH ĐỐN (RALLY)
  // --------------------------------------------------------------------------
  for (let i = 0; i < regs.length; i++) {
    const reg = regs[i];
    if (!isAlive(reg)) continue;

    if (reg.moraleState === 'shattered') {
      reg.morale = 0;
      reg.anim = 'rout';
      continue;
    }

    // Đo khoảng cách tới quân địch còn sống gần nhất & kiểm tra bị đánh tạt sườn / bọc hậu
    let nearestEnemyDist = Infinity;
    let underFlankOrRear = false;

    for (let j = 0; j < regs.length; j++) {
      const other = regs[j];
      if (other.team === reg.team || !isAlive(other)) continue;

      const dx = other.x - reg.x;
      const dy = other.y - reg.y;
      const dist = Math.hypot(dx, dy);
      if (dist < nearestEnemyDist) {
        nearestEnemyDist = dist;
      }

      if (
        !underFlankOrRear &&
        !isRoutingOrShattered(other) &&
        other.duelId === undefined &&
        areRegimentsInMeleeContact(other, reg)
      ) {
        const zone = computeFlankZone(other.x, other.y, reg);
        if (zone === 'flank' || zone === 'rear') {
          underFlankOrRear = true;
        }
      }
    }

    const buffMods = getActiveBuffMods(reg);
    const vetMods = twVeterancyBonuses(reg.rank ?? 0);
    const enragedGeneral =
      reg.isGeneral &&
      (reg.guanxiState === 'enraged' || (reg.guanxiEnrageLeftSec ?? 0) > 0);
    const moraleBase = reg.isGeneral
      ? GENERAL_MORALE_BASE
      : TW_UNITS[reg.kind].moraleBase;
    const casualtyRatio = reg.isGeneral
      ? 1 - clamp(reg.hp / Math.max(1, reg.maxHp), 0, 1)
      : 1 - clamp(reg.men / Math.max(1, reg.maxMen), 0, 1);

    const fatiguePen = fatigueMoralePenalty(reg.fatigue);
    const alliedGeneralFell = fallenGeneralOwners.has(reg.ownerIdx);
    const safeFromEnemies = nearestEnemyDist > RALLY_SAFE_ENEMY_DIST;

    let targetMorale =
      moraleBase +
      reg.auraMoraleAdd +
      buffMods.moraleAdd +
      vetMods.moraleAdd -
      casualtyRatio * 55 -
      fatiguePen -
      (underFlankOrRear ? 15 : 0) -
      (alliedGeneralFell ? 18 : 0) -
      (reg.burning ? 22 : 0) +
      (reg.onHighGround ? 6 : 0) +
      (safeFromEnemies ? 12 : 0);

    if (buffMods.unbreakable) {
      targetMorale = Math.max(targetMorale, 80);
    }
    if (enragedGeneral) {
      targetMorale = Math.max(targetMorale, 86);
    }

    const nearCommander = underCommanderAura[i] === 1;
    const nearAnyGeneral = underAnyGeneralAura[i] === 1;

    // Xử lý riêng cho trung đoàn đang tháo chạy (`routing`)
    if (reg.moraleState === 'routing') {
      if (enragedGeneral) {
        reg.morale = Math.max(50, reg.morale);
        reg.moraleState = reg.morale >= 75 ? 'eager' : 'steady';
        if (reg.anim === 'rout') {
          reg.anim = 'idle';
          reg.vx = 0;
          reg.vy = 0;
        }
        continue;
      }

      if (safeFromEnemies) {
        // Đã rút xa khỏi lưỡi đao truy kích (> 260 đơn vị): nhận điểm hồi tâm để Chỉnh đốn hàng ngũ
        targetMorale += 6 + (nearCommander ? 10 : nearAnyGeneral ? 5 : 0);
      } else {
        // Đang bị địch áp sát truy kích: kìm hãm hồi phục sĩ khí
        targetMorale = Math.min(targetMorale, 30);
      }

      const clampedTarget = clamp(targetMorale, 0, 100);
      const rate =
        clampedTarget >= reg.morale
          ? nearCommander
            ? 9.5
            : nearAnyGeneral
              ? 7.2
              : 5.8
          : 9.0;
      reg.morale = clamp(approachValue(reg.morale, clampedTarget, rate * dtSec), 0, 100);

      // Tan rã vĩnh viễn (`shattered`) nếu sĩ khí cạn kiệt < 8 và quân số tổn thất quá nặng (< 12%)
      if (reg.morale < 8 && reg.men < reg.maxMen * 0.12 && !reg.isGeneral) {
        reg.moraleState = 'shattered';
        reg.morale = 0;
        reg.anim = 'rout';
        continue;
      }

      // Chỉnh đốn (Rally) trở lại hàng ngũ chiến đấu khi đã an toàn và hồi Sĩ khí >= 42
      if (safeFromEnemies && reg.morale >= RALLY_MORALE_THRESHOLD) {
        reg.moraleState = reg.morale >= 75 ? 'eager' : 'steady';
        if (reg.anim === 'rout') {
          reg.anim = 'idle';
          reg.vx = 0;
          reg.vy = 0;
        }
      }
      continue;
    }

    // Trung đoàn đang giữ hàng ngũ (`eager` | `steady` | `wavering`)
    const clampedTarget = clamp(targetMorale, 0, 100);
    const convergenceRate =
      clampedTarget < reg.morale
        ? 11.0
        : nearCommander
          ? 9.0
          : 6.2;

    reg.morale = clamp(
      approachValue(reg.morale, clampedTarget, convergenceRate * dtSec),
      0,
      100,
    );

    if (enragedGeneral && reg.morale < 50) {
      reg.morale = 50;
    } else if (buffMods.unbreakable && reg.morale < 42) {
      reg.morale = 42;
    }

    let nextState: TwMoraleState;
    if (reg.morale < 8 && reg.men < reg.maxMen * 0.12 && !reg.isGeneral) {
      nextState = 'shattered';
      reg.morale = 0;
    } else if (reg.morale < 20) {
      nextState = 'routing';
    } else if (reg.morale < 42) {
      nextState = 'wavering';
    } else if (reg.morale < 75) {
      nextState = 'steady';
    } else {
      nextState = 'eager';
    }

    const wasRouting = false;
    reg.moraleState = nextState;
    if (!wasRouting && (nextState === 'routing' || nextState === 'shattered')) {
      sfxOut.add('rout');
    }
  }
}

/**
 * Kích hoạt biến cố Quan Hệ Tướng Lĩnh (`Guanxi`) khi một Danh Tướng tử trận lần đầu:
 * - Mọi Danh Tướng đồng minh còn sống có mối gắn kết Kết Nghĩa / Thân Quyến (`'oath'` | `'kin'`)
 *   với tướng ngã xuống lập tức bộc phát Cuồng Nộ Báo Thù (`22s`, `+38%` Công, hồi `8%` HP, Sĩ khí `100` Bất Khuất).
 * - Nếu người ngã xuống là Chủ Tướng (`generalSlot === 0` — Chúa Công), toàn quân không bất khuất
 *   của `slainGen.ownerIdx` bị sốc `-14` Sĩ khí (`Chúa Công Tử Trận`).
 */
export function triggerGuanxiOnGeneralDeath(
  slainGen: TwSimRegiment,
  allRegs: TwSimRegiment[],
  sfxOut: Set<TwSfxEvent>,
): string[] {
  const logs: string[] = [];
  if (!slainGen || !slainGen.isGeneral) return logs;

  const slainName =
    (slainGen.generalId && TW_GENERALS[slainGen.generalId]?.vnName) || 'Danh tướng';

  // 1. Huynh đệ Kết nghĩa / Thân quyến bộc phát Cuồng Nộ Báo Thù!
  if (slainGen.generalId) {
    for (let i = 0; i < allRegs.length; i++) {
      const ally = allRegs[i];
      if (
        ally.id === slainGen.id ||
        !ally.isGeneral ||
        ally.team !== slainGen.team ||
        !isAlive(ally) ||
        !ally.generalId
      ) {
        continue;
      }

      const bond = findTwGuanxiBond(slainGen.generalId, ally.generalId);
      if (!bond || (bond.kind !== 'oath' && bond.kind !== 'kin')) continue;

      ally.guanxiEnrageLeftSec = 22;
      ally.guanxiState = 'enraged';
      ally.hp = Math.min(ally.maxHp, ally.hp + Math.round(ally.maxHp * 0.08));
      ally.morale = 100;
      if (ally.moraleState === 'routing' && ally.anim === 'rout') {
        ally.anim = 'idle';
        ally.vx = 0;
        ally.vy = 0;
      }
      ally.moraleState = 'eager';
      ally.auraAtkMul = Math.max(ally.auraAtkMul, 1.38);
      sfxOut.add('horn');

      const aliveName = TW_GENERALS[ally.generalId]?.vnName ?? 'Danh tướng';
      logs.push(
        `🔥 Huynh đệ ngã xuống! ${aliveName} gầm vang trời đất khóc ${slainName} — bộc phát Cuồng Nộ Báo Thù (+38% Công, Bất Khuất 22s)!`,
      );
    }
  }

  // 2. Sốc Sĩ khí Chúa Công Tử Trận (-14) lên toàn bộ trung đoàn không bất khuất của chư hầu đó
  if (slainGen.generalSlot === 0) {
    for (let i = 0; i < allRegs.length; i++) {
      const reg = allRegs[i];
      if (
        reg.id === slainGen.id ||
        reg.ownerIdx !== slainGen.ownerIdx ||
        !isAlive(reg) ||
        reg.moraleState === 'shattered' ||
        isRegimentUnbreakable(reg)
      ) {
        continue;
      }

      const prevState = reg.moraleState;
      reg.morale = clamp(reg.morale - 14, 0, 100);
      if (reg.morale < 20 && prevState !== 'routing') {
        reg.moraleState = 'routing';
        if (reg.duelId === undefined) {
          reg.anim = 'rout';
          reg.lockedTargetId = undefined;
          reg.engagedWithId = undefined;
        }
        sfxOut.add('rout');
      } else if (reg.morale < 42 && prevState !== 'routing') {
        reg.moraleState = 'wavering';
      } else if (reg.morale < 75 && prevState === 'eager') {
        reg.moraleState = 'steady';
      }
    }

    logs.push(
      `💀 Chúa Công Tử Trận! Đại kỳ của ${slainName} gãy gập — toàn quân chủ lực chấn động (-14 Sĩ khí)!`,
    );
  }

  return logs;
}

// ============================================================================
// 5. ĐẠO CỤ CHIẾN THUẬT DÃ CHIẾN & HỎA CÔNG LAN THEO GIÓ (DEPLOYABLES & WILDFIRES)
// ============================================================================

function creditEnvironmentalKills(
  regs: TwSimRegiment[],
  killerOwnerIdx: number,
  killerTeam: number,
  victim: TwSimRegiment,
  slain: number,
): void {
  if (slain <= 0 || victim.team === killerTeam || killerOwnerIdx < 0) return;

  let creditReg: TwSimRegiment | undefined;
  for (let i = 0; i < regs.length; i++) {
    const cand = regs[i];
    if (cand.ownerIdx !== killerOwnerIdx || !isAlive(cand)) continue;
    if (
      cand.isGeneral &&
      cand.generalId &&
      TW_GENERALS[cand.generalId]?.class === 'strategist'
    ) {
      creditReg = cand;
      break;
    }
    if (cand.isGeneral && !creditReg) {
      creditReg = cand;
    } else if (!creditReg) {
      creditReg = cand;
    }
  }

  if (creditReg) {
    addKillsAndSyncRank(creditReg, slain);
  }
}

/**
 * Thử châm ngòi một vùng Hỏa Công (`TwLiveFireZone`) tại `(x, y)`:
 * - Bắt lửa nếu `forceIgnite === true`, hoặc điểm rơi nằm trong Rừng (`inForest`),
 *   hoặc có Bẫy Dầu (`'oil'`) nằm trong bán kính `radius + 55`!
 * - Giới hạn tối đa `12` vùng lửa hoạt động đồng thời (làm mới `leftSec` nếu có đám cháy trong `55u`).
 */
export function tryIgniteWildfireAt(
  map: TwMapSpec,
  fires: TwLiveFireZone[],
  deployables: TwLiveDeployable[],
  x: number,
  y: number,
  radius: number,
  ownerIdx: number,
  team: number,
  nextFireId: () => number,
  forceIgnite: boolean,
  sfxOut: Set<TwSfxEvent>,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  const cx = clamp(x, 36, Math.max(72, map.width - 36));
  const cy = clamp(y, 36, Math.max(72, map.height - 36));
  const safeRadius = clamp(Number.isFinite(radius) ? radius : 72, 36, 150);

  const inForest = sampleTerrainAt(map, cx, cy).inForest;
  let matchedOilIdx = -1;
  let bestOilDist = safeRadius + 55;

  for (let i = 0; i < deployables.length; i++) {
    const dep = deployables[i];
    if (dep.kind !== 'oil' || dep.hp <= 0) continue;
    const d = Math.hypot(dep.x - cx, dep.y - cy);
    if (d <= bestOilDist) {
      bestOilDist = d;
      matchedOilIdx = i;
    }
  }

  const matchedOil = matchedOilIdx >= 0 ? deployables[matchedOilIdx] : undefined;
  if (!forceIgnite && !inForest && !matchedOil) {
    return false;
  }

  let fireX = cx;
  let fireY = cy;
  let fireRadius = safeRadius;
  let durationSec = forceIgnite ? 15 : 14;

  if (matchedOil) {
    fireX = matchedOil.x;
    fireY = matchedOil.y;
    fireRadius = Math.max(safeRadius, 92);
    durationSec = 16;
    matchedOil.hp = 0;
    matchedOil.hidden = false;
    matchedOil.revealed = true;
    deployables.splice(matchedOilIdx, 1);
  }

  // Làm mới đám cháy sẵn có nếu điểm châm lửa cách tâm đám cháy cũ <= 55 đơn vị
  for (let i = 0; i < fires.length; i++) {
    const existing = fires[i];
    if (existing.leftSec > 0 && Math.hypot(existing.x - fireX, existing.y - fireY) <= 55) {
      existing.leftSec = Math.max(existing.leftSec, durationSec);
      existing.maxSec = Math.max(existing.maxSec, durationSec);
      existing.radius = Math.max(existing.radius, fireRadius);
      existing.intensity = 1;
      existing.ownerIdx = ownerIdx;
      existing.team = team;
      sfxOut.add('fire');
      return true;
    }
  }

  if (fires.length >= 12) {
    let oldestIdx = 0;
    for (let i = 1; i < fires.length; i++) {
      if (fires[i].leftSec < fires[oldestIdx].leftSec) {
        oldestIdx = i;
      }
    }
    fires.splice(oldestIdx, 1);
  }

  fires.push({
    id: nextFireId(),
    x: round1(fireX),
    y: round1(fireY),
    radius: fireRadius,
    intensity: 1,
    leftSec: durationSec,
    maxSec: durationSec,
    ownerIdx,
    team,
    spreadDone: false,
  });

  sfxOut.add('fire');
  return true;
}

/**
 * Mô phỏng Công sự Dã chiến (`stakes`, `caltrops`, `oil`) và Biển Lửa Hỏa Công (`fires`) ở nhịp 15 Hz:
 * - Bẫy ngầm `caltrops` & `oil` tàng hình (`hidden = true`) cho tới khi địch tiến vào `stealthUntilDist`.
 * - Cự mã Chông Gỗ (`stakes`) xiên thủng Kỵ binh lao vào, nhưng bị Bộ binh phá dỡ dần và cháy rụi khi gặp lửa.
 * - Bẫy Dầu (`oil`) làm trơn trượt và bùng nổ thành biển lửa bán kính `92` suốt `16s` ngay khi chạm lửa.
 * - Đám cháy rừng tự động lan xuôi chiều Gió Đông Nam (`windAngle`) sang các tán rừng kế cận!
 */
export function stepFieldFortificationsAndFires(
  map: TwMapSpec,
  regs: TwSimRegiment[],
  deployables: TwLiveDeployable[],
  fires: TwLiveFireZone[],
  windAngle: number,
  windStrength: number,
  nextFireId: () => number,
  dtSec: number,
  sfxOut: Set<TwSfxEvent>,
): { logs: string[]; casualtiesByOwner: number[] } {
  const logs: string[] = [];
  let maxOwnerIdx = TW_MAX_PLAYERS - 1;
  for (let i = 0; i < regs.length; i++) {
    if (regs[i].ownerIdx > maxOwnerIdx) {
      maxOwnerIdx = regs[i].ownerIdx;
    }
  }
  const casualtiesByOwner = new Array<number>(maxOwnerIdx + 1).fill(0);

  if (!(dtSec > 0) || !Number.isFinite(dtSec)) {
    return { logs, casualtiesByOwner };
  }

  for (let i = 0; i < regs.length; i++) {
    regs[i].burning = false;
    regs[i].deploySlowMul = 1.0;
  }

  // --------------------------------------------------------------------------
  // 1. CẬP NHẬT CÔNG SỰ & BẪY DÃ CHIẾN (`deployables`)
  // --------------------------------------------------------------------------
  let depWriteIdx = 0;
  for (let d = 0; d < deployables.length; d++) {
    const dep = deployables[d];
    const spec = TW_DEPLOYABLES[dep.kind];
    if (!spec || dep.hp <= 0) continue;

    // Ẩn bẫy Chông Sắt & Bẫy Dầu cho tới khi địch áp sát vào `stealthUntilDist`
    if (dep.kind === 'stakes') {
      dep.hidden = false;
      dep.revealed = true;
    } else if (!dep.revealed) {
      if (dep.hidden === false) {
        dep.revealed = true;
      } else {
        dep.hidden = true;
        for (let r = 0; r < regs.length; r++) {
          const cand = regs[r];
          if (cand.team === dep.team || !isAlive(cand)) continue;
          if (Math.hypot(cand.x - dep.x, cand.y - dep.y) <= spec.stealthUntilDist) {
            dep.hidden = false;
            dep.revealed = true;
            break;
          }
        }
      }
    } else {
      dep.hidden = false;
    }

    // Kiểm tra va chạm với các trung đoàn địch
    for (let r = 0; r < regs.length; r++) {
      const reg = regs[r];
      if (reg.team === dep.team || !isAlive(reg) || reg.duelId !== undefined) continue;

      const dist = Math.hypot(reg.x - dep.x, reg.y - dep.y);
      const overlapRadius = dep.radius + Math.min(34, reg.width * 0.28);
      if (dist > overlapRadius) continue;

      dep.hidden = false;
      dep.revealed = true;
      reg.deploySlowMul = Math.min(reg.deploySlowMul ?? 1, spec.slowMul);

      if (dep.kind === 'stakes') {
        if (isMountedTarget(reg)) {
          const speed = Math.hypot(reg.vx, reg.vy);
          if (speed > 38 || reg.chargeTicks > 0) {
            const impaleDmg = (reg.isGeneral ? 260 : 980) * dtSec * 4.5;
            const slain = applyDamageAndCountSlain(reg, impaleDmg);
            if (slain > 0) {
              recordCasualties(casualtiesByOwner, reg.ownerIdx, slain);
              creditEnvironmentalKills(regs, dep.ownerIdx, dep.team, reg, slain);
            }
            reg.chargeTicks = 0;
            reg.vx *= 0.2;
            reg.vy *= 0.2;
            if (isAlive(reg) && !isRegimentUnbreakable(reg)) {
              reg.morale = clamp(reg.morale - 18 * dtSec * 3, 0, 100);
            }
            dep.hp -= 165 * dtSec * 3;
            sfxOut.add('clash');
          } else {
            const sustainedDmg = 140 * dtSec;
            const slain = applyDamageAndCountSlain(reg, sustainedDmg);
            if (slain > 0) {
              recordCasualties(casualtiesByOwner, reg.ownerIdx, slain);
              creditEnvironmentalKills(regs, dep.ownerIdx, dep.team, reg, slain);
            }
            dep.hp -= 45 * dtSec;
          }
        } else {
          // Bộ binh địch tiếp cận chặt phá dần hàng rào chông gỗ
          dep.hp -= 55 * dtSec;
        }
      } else if (dep.kind === 'caltrops') {
        reg.chargeTicks = 0;
        const bleedDmg = 68 * dtSec;
        const slain = applyDamageAndCountSlain(reg, bleedDmg);
        if (slain > 0) {
          recordCasualties(casualtiesByOwner, reg.ownerIdx, slain);
          creditEnvironmentalKills(regs, dep.ownerIdx, dep.team, reg, slain);
        }
        if (isAlive(reg) && !isRegimentUnbreakable(reg)) {
          reg.morale = clamp(reg.morale - 5 * dtSec, 0, 100);
        }
        dep.hp -= 38 * dtSec;
      } else if (dep.kind === 'oil') {
        reg.deploySlowMul = Math.min(reg.deploySlowMul ?? 1, 0.75);
      }

      if (dep.hp <= 0) break;
    }

    // Tương tác giữa Đạo cụ dễ cháy (`oil`, `stakes`) và các vùng Biển Lửa đang hoạt động
    if (dep.hp > 0 && fires.length > 0) {
      if (dep.kind === 'oil') {
        for (let f = 0; f < fires.length; f++) {
          const fire = fires[f];
          if (fire.leftSec <= 0) continue;
          if (Math.hypot(dep.x - fire.x, dep.y - fire.y) <= dep.radius + fire.radius) {
            if (fires.length < 12) {
              fires.push({
                id: nextFireId(),
                x: round1(dep.x),
                y: round1(dep.y),
                radius: 92,
                intensity: 1,
                leftSec: 16,
                maxSec: 16,
                ownerIdx: fire.ownerIdx,
                team: fire.team,
                spreadDone: false,
              });
            } else {
              fire.leftSec = Math.max(fire.leftSec, 16);
              fire.maxSec = Math.max(fire.maxSec, 16);
              fire.radius = Math.max(fire.radius, 92);
            }
            dep.hp = 0;
            sfxOut.add('fire');
            logs.push('🛢️🔥 Bẫy Dầu Hỏa Công bén lửa bùng nổ dữ dội thành biển lửa rực trời!');
            break;
          }
        }
      } else if (dep.kind === 'stakes') {
        for (let f = 0; f < fires.length; f++) {
          const fire = fires[f];
          if (fire.leftSec <= 0) continue;
          if (Math.hypot(dep.x - fire.x, dep.y - fire.y) <= dep.radius + fire.radius) {
            dep.hp -= 140 * dtSec;
            break;
          }
        }
      }
    }

    if (dep.hp > 0) {
      dep.hp = Math.round(dep.hp * 10) / 10;
      deployables[depWriteIdx++] = dep;
    }
  }
  deployables.length = depWriteIdx;

  // --------------------------------------------------------------------------
  // 2. CẬP NHẬT BIỂN LỬA HỎA CÔNG & LAN CHÁY RỪNG THEO GIÓ (`fires`)
  // --------------------------------------------------------------------------
  const spawnedChildFires: TwLiveFireZone[] = [];
  const safeWindAngle = Number.isFinite(windAngle) ? windAngle : 0;
  void windStrength;

  let fireWriteIdx = 0;
  for (let f = 0; f < fires.length; f++) {
    const fire = fires[f];
    fire.leftSec -= dtSec;
    fire.ageSec = (fire.ageSec ?? 0) + dtSec;
    if (fire.leftSec <= 0) {
      continue;
    }

    fire.intensity =
      Math.round(clamp(fire.leftSec / Math.max(4, fire.maxSec * 0.65), 0.2, 1) * 100) / 100;

    for (let r = 0; r < regs.length; r++) {
      const reg = regs[r];
      if (!isAlive(reg) || reg.duelId !== undefined) continue;

      const dist = Math.hypot(reg.x - fire.x, reg.y - fire.y);
      if (dist > fire.radius + 22) continue;

      reg.burning = true;
      const fireDmg = (reg.isGeneral ? 58 : 135) * fire.intensity * dtSec;
      const slain = applyDamageAndCountSlain(reg, fireDmg);
      if (slain > 0) {
        recordCasualties(casualtiesByOwner, reg.ownerIdx, slain);
        creditEnvironmentalKills(regs, fire.ownerIdx, fire.team, reg, slain);
      }

      if (isAlive(reg) && !isRegimentUnbreakable(reg)) {
        reg.morale = clamp(reg.morale - 9 * dtSec, 0, 100);
      }
    }

    // Hỏa Công Mượn Gió Lan Rừng (Downwind Forest Propagation)
    if (
      !fire.spreadDone &&
      ((fire.ageSec ?? 0) >= 3.5 || fire.leftSec <= fire.maxSec * 0.55) &&
      fires.length + spawnedChildFires.length < 10
    ) {
      fire.spreadDone = true;
      const spreadDist = Math.max(84, fire.radius * 1.22);
      const nx = fire.x + Math.cos(safeWindAngle) * spreadDist;
      const ny = fire.y + Math.sin(safeWindAngle) * spreadDist;

      if (
        nx >= 36 &&
        nx <= map.width - 36 &&
        ny >= 36 &&
        ny <= map.height - 36 &&
        sampleTerrainAt(map, nx, ny).inForest
      ) {
        let tooClose = false;
        for (let k = 0; k < fires.length; k++) {
          if (k === f) continue;
          if (fires[k].leftSec > 0 && Math.hypot(fires[k].x - nx, fires[k].y - ny) < 68) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          for (let k = 0; k < spawnedChildFires.length; k++) {
            if (Math.hypot(spawnedChildFires[k].x - nx, spawnedChildFires[k].y - ny) < 75) {
              tooClose = true;
              break;
            }
          }
        }

        if (!tooClose) {
          spawnedChildFires.push({
            id: nextFireId(),
            x: round1(nx),
            y: round1(ny),
            radius: 78,
            intensity: 1,
            leftSec: 13,
            maxSec: 13,
            ownerIdx: fire.ownerIdx,
            team: fire.team,
            spreadDone: false,
          });
          sfxOut.add('fire');
        }
      }
    }

    fires[fireWriteIdx++] = fire;
  }

  fires.length = fireWriteIdx;
  for (let i = 0; i < spawnedChildFires.length; i++) {
    if (fires.length >= 10) break;
    fires.push(spawnedChildFires[i]);
  }

  return { logs, casualtiesByOwner };
}
