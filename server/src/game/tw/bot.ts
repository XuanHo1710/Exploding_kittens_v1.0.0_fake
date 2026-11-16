/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) — Trí Tuệ Nhân Tạo Chư Hầu Chiến Thuật (Server Warlord AI).
 *
 * Điều phối đại quân máy (`stepTwBotSide`) theo nhịp so le mỗi `12` ticks (~0.8 giây ở 15 Hz, chi phí CPU < 0.5ms):
 * 1. Phân loại Binh chủng & Vai trò Tác chiến (`polearms`, `swords`, `ranged`, `artillery`, `cavalry`, `generals`).
 * 2. Biến hóa Trận hình Thông minh:
 *    - Bộ binh trường thương/kích (`polearms`) lập tức kết `Thương Lâm` (`spearwall`) và đứng trụ (`brace`) khi kỵ binh địch áp sát <= 320.
 *    - Bộ binh đao kiếm (`swords`) khép `Thuẫn Tường` (`shieldwall`) khi chịu hỏa lực cung nỏ / pháo đá địch.
 *    - Xung kỵ (`cavalry_shock`) chuyển `Phong Thỉ Chùy` (`wedge`) trước khi tung cú húc sườn / hậu tuyến.
 * 3. Dàn Trận Tuyến, Chiếm Đồi Cao & Phục Kích Rừng Thông:
 *    - Tiến bộ binh thành chiến tuyến đồng bộ hướng về Đài Hiệu Lệnh tranh chấp hoặc trung tâm trận tuyến địch.
 *    - Bố trí cung nỏ & pháo đá lùi `140–220` đơn vị sau lưng bộ binh (ưu tiên chiếm lĩnh đồi cao `'ridge'` trong tầm `450`)
 *      và tập trung hỏa lực vào mục tiêu lộ diện giá trị cao.
 *    - Điều kỵ binh vòng rộng hai cánh (ưu tiên luồn qua rừng `'forest'` ẩn mình phục kích!) tập kích cung/pháo hoặc bọc hậu bộ binh địch đang giao chiến.
 * 4. Tuyệt Kỹ Danh Tướng & Đấu Tướng Tam Quốc (Romance Mode):
 *    - Tự động tung `use_skill` đúng thời cơ (`rally_horn` cứu quân dao động, `fire_volley` bão lửa cung nỏ, `aoe_smash` giữa vòng vây, `duel_buff`, `iron_evasion`).
 *    - Mãnh tướng Tiên Phong / Dũng Tướng (`duelPower >= 78`, HP > 55%) chủ động khiêu chiến `challenge_duel` với Dũng Tướng / Tiên Phong địch lân cận.
 * 5. An toàn tuyệt đối ngay cả khi 0 quân địch lộ diện (toàn bộ địch ẩn trong rừng -> cử kỵ binh & đại quân tiến chiếm Đài Hiệu Lệnh, sục sạo phát hiện phục binh).
 */

import {
  TW_GENERALS,
  TW_UNITS,
  twPointInTerrainZone,
  type TwBattlePhase,
  type TwCapturePointSpec,
  type TwCaptureState,
  type TwCommand,
  type TwDeployZoneSpec,
  type TwDeployableFrame,
  type TwDeployableKind,
  type TwDuelFrame,
  type TwDuelStance,
  type TwFireZoneFrame,
  type TwFormation,
  type TwGeneralSpec,
  type TwMapSpec,
  type TwTerrainZone,
} from '../../../../shared/src/tw';
import { shortestAngleDiff, type TwSimRegiment } from './formations';
import { clampToBattlefield } from './terrain';

// ============================================================================
// HẰNG SỐ CHIẾN THUẬT WARLORD AI
// ============================================================================

/** Chu kỳ đánh giá chiến thuật mỗi AI Warlord: 12 ticks = 0.8s ở 15 Hz */
export const TW_BOT_THINK_INTERVAL_TICKS = 12;

/** Bán kính cảnh báo kỵ binh địch để bộ binh trường thương dựng Thương Lâm */
const SPEARWALL_CAV_ALERT_DIST = 320;
const SPEARWALL_CAV_BRACE_DIST = 235;
const SPEARWALL_RELAX_DIST = 380;

/** Khoảng cách tối đa kết Phong Thỉ Chùy trước khi kỵ binh xung kích lao vào mục tiêu */
const WEDGE_CHARGE_STAGE_DIST = 620;

/** Khoảng cách lùi chuẩn của tuyến Cung Nỏ và Pháo Đá phía sau màn chắn bộ binh (140..220) */
const RANGED_BEHIND_SCREEN_DIST = 162;
const ARTILLERY_BEHIND_SCREEN_DIST = 205;

/** Bán kính tìm kiếm đồi cao ('ridge') ưu tiên cho Cung Nỏ & Pháo Đá */
const RIDGE_SEARCH_MAX_DIST = 450;

/** Khoảng cách mở biên kỵ binh đi vòng hai cánh */
const CAVALRY_FLANK_OFFSET_MIN = 340;
const CAVALRY_FLANK_OFFSET_MAX = 470;

/** Ngưỡng Đấu Tướng cho Tiên Phong / Dũng Tướng AI */
const DUEL_MIN_POWER = 78;
const DUEL_MIN_HP_RATIO = 0.55;
const DUEL_CHALLENGE_RANGE = 420;

/** Ngưỡng sai số vị trí & góc để tránh gửi lại lệnh di chuyển gây ngắt brace/charge */
const MOVE_REISSUE_POS_EPS = 34;
const MOVE_REISSUE_ANGLE_EPS = 0.22;

/** Trần lệnh tối đa mỗi chu kỳ 0.8s để bảo toàn ngân sách TW_CMD_REFILL */
const MAX_CMDS_PER_THINK = 15;

// ============================================================================
// PHÂN LOẠI VAI TRÒ QUÂN ĐOÀN & TRẠNG THÁI CHIẾN TRƯỜNG
// ============================================================================

interface BotArmyRoles {
  polearms: TwSimRegiment[];
  swords: TwSimRegiment[];
  ranged: TwSimRegiment[];
  artillery: TwSimRegiment[];
  cavalry: TwSimRegiment[];
  generals: TwSimRegiment[];
}

interface EnemyIntel {
  visibleActive: TwSimRegiment[];
  infantry: TwSimRegiment[];
  ranged: TwSimRegiment[];
  artillery: TwSimRegiment[];
  cavalry: TwSimRegiment[];
  generals: TwSimRegiment[];
}

interface Vec2 {
  x: number;
  y: number;
}

// ============================================================================
// HÀM TIỆN ÍCH HÌNH HỌC & KIỂM TRA TRẠNG THÁI
// ============================================================================

function distBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function isAlive(r: TwSimRegiment): boolean {
  return r.men > 0 && r.hp > 0 && r.anim !== 'dead';
}

function isRouting(r: TwSimRegiment): boolean {
  return r.moraleState === 'routing' || r.moraleState === 'shattered' || r.anim === 'rout';
}

function isDueling(r: TwSimRegiment): boolean {
  return r.duelId !== undefined || r.anim === 'duel';
}

function canUseFormation(reg: TwSimRegiment, formation: TwFormation): boolean {
  if (reg.isGeneral) return formation === 'line';
  const spec = TW_UNITS[reg.kind];
  return spec.allowedFormations.includes(formation);
}

function computeCentroid(regs: ReadonlyArray<TwSimRegiment>, fallback: Vec2): Vec2 {
  if (regs.length === 0) return fallback;
  let sx = 0;
  let sy = 0;
  let totalWeight = 0;
  for (let i = 0; i < regs.length; i++) {
    const r = regs[i];
    const w = r.isGeneral ? 1.4 : Math.max(0.6, r.men / 80);
    sx += r.x * w;
    sy += r.y * w;
    totalWeight += w;
  }
  if (totalWeight <= 1e-5) return fallback;
  return { x: sx / totalWeight, y: sy / totalWeight };
}

function shouldIssueGroupMove(
  regs: ReadonlyArray<TwSimRegiment>,
  destX: number,
  destY: number,
  facing: number,
  posEps: number = MOVE_REISSUE_POS_EPS,
): boolean {
  if (regs.length === 0) return false;

  let txSum = 0;
  let tySum = 0;
  let hasUnassigned = false;

  for (let i = 0; i < regs.length; i++) {
    const r = regs[i];
    if (r.lockedTargetId !== undefined) {
      hasUnassigned = true;
    }
    const rx = r.moveTargetX ?? r.x;
    const ry = r.moveTargetY ?? r.y;
    txSum += rx;
    tySum += ry;

    const targetFace = r.moveTargetFacing ?? r.facing;
    if (Math.abs(shortestAngleDiff(targetFace, facing)) > MOVE_REISSUE_ANGLE_EPS) {
      hasUnassigned = true;
    }
  }

  if (hasUnassigned) return true;
  const avgTx = txSum / regs.length;
  const avgTy = tySum / regs.length;
  return distBetween(avgTx, avgTy, destX, destY) > posEps;
}

/** Kiểm tra tọa độ có nằm trong sông cạn hoặc đầm lầy gây phạt phòng thủ hay không */
function isPointInPenaltyWaterOrMud(map: TwMapSpec, x: number, y: number): boolean {
  const zones = map.terrainZones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (z.kind !== 'river' && z.kind !== 'mud') continue;
    if (twPointInTerrainZone(x, y, z)) return true;
  }
  return false;
}

/**
 * Chiếu một điểm tham chiếu vào bên trong vùng địa hình elip xoay (tỉ lệ bán kính an toàn `innerScale`)
 * để toàn bộ đội hình trung đoàn được hưởng trọn hiệu ứng Đồi Cao (`ridge`) hoặc Rừng Phục Kích (`forest`).
 */
function projectPointIntoZone(
  px: number,
  py: number,
  zone: TwTerrainZone,
  innerScale: number = 0.68,
): Vec2 {
  const dx = px - zone.x;
  const dy = py - zone.y;
  const c = Math.cos(zone.rot);
  const s = Math.sin(zone.rot);
  let lx = dx * c + dy * s;
  let ly = -dx * s + dy * c;

  const safeRx = Math.max(24, zone.rx * innerScale);
  const safeRy = Math.max(24, zone.ry * innerScale);
  const norm = Math.hypot(lx / safeRx, ly / safeRy);
  if (norm > 1) {
    lx /= norm;
    ly /= norm;
  }

  return {
    x: zone.x + lx * c - ly * s,
    y: zone.y + lx * s + ly * c,
  };
}

// ============================================================================
// 1. PHÂN LOẠI QUÂN ĐOÀN & TÌNH BÁO ĐỊCH LỘ DIỆN (FOG OF WAR FAIRNESS)
// ============================================================================

function classifyBotAndEnemyArmies(
  ownerIdx: number,
  team: number,
  allRegs: ReadonlyArray<TwSimRegiment>,
): {
  roles: BotArmyRoles;
  myActiveAll: TwSimRegiment[];
  myDuelingGenerals: TwSimRegiment[];
  alliedActive: TwSimRegiment[];
  enemy: EnemyIntel;
} {
  const roles: BotArmyRoles = {
    polearms: [],
    swords: [],
    ranged: [],
    artillery: [],
    cavalry: [],
    generals: [],
  };
  const myActiveAll: TwSimRegiment[] = [];
  const myDuelingGenerals: TwSimRegiment[] = [];
  const alliedActive: TwSimRegiment[] = [];

  const enemy: EnemyIntel = {
    visibleActive: [],
    infantry: [],
    ranged: [],
    artillery: [],
    cavalry: [],
    generals: [],
  };

  for (let i = 0; i < allRegs.length; i++) {
    const r = allRegs[i];
    if (!isAlive(r)) continue;

    if (r.team === team) {
      if (!isRouting(r)) {
        alliedActive.push(r);
      }
      if (r.ownerIdx === ownerIdx && r.isGeneral && !isRouting(r) && isDueling(r)) {
        myDuelingGenerals.push(r);
      }
      if (r.ownerIdx === ownerIdx && !isRouting(r) && !isDueling(r)) {
        myActiveAll.push(r);
        if (r.isGeneral) {
          roles.generals.push(r);
        } else {
          const cat = TW_UNITS[r.kind].category;
          switch (cat) {
            case 'infantry_polearm':
              roles.polearms.push(r);
              break;
            case 'infantry_sword':
              roles.swords.push(r);
              break;
            case 'ranged_bow':
            case 'ranged_crossbow':
              roles.ranged.push(r);
              break;
            case 'artillery':
              roles.artillery.push(r);
              break;
            case 'cavalry_shock':
            case 'cavalry_melee':
              roles.cavalry.push(r);
              break;
          }
        }
      }
      continue;
    }

    // Tuyệt đối tôn trọng sương mù rừng thông: không đọc mục tiêu đang ẩn (r.hidden === true)
    if (r.hidden || isRouting(r)) continue;

    enemy.visibleActive.push(r);
    if (r.isGeneral) {
      enemy.generals.push(r);
      continue;
    }

    const eCat = TW_UNITS[r.kind].category;
    switch (eCat) {
      case 'infantry_polearm':
      case 'infantry_sword':
        enemy.infantry.push(r);
        break;
      case 'ranged_bow':
      case 'ranged_crossbow':
        enemy.ranged.push(r);
        break;
      case 'artillery':
        enemy.artillery.push(r);
        break;
      case 'cavalry_shock':
      case 'cavalry_melee':
        enemy.cavalry.push(r);
        break;
    }
  }

  return { roles, myActiveAll, myDuelingGenerals, alliedActive, enemy };
}

// ============================================================================
// 2. ĐÁNH GIÁ ĐÀI HIỆU LỆNH & TRỤC CHIẾN TUYẾN CHÍNH
// ============================================================================

function pickCaptureObjectives(
  team: number,
  map: TwMapSpec,
  captures: ReadonlyArray<TwCaptureState>,
  armyCenter: Vec2,
): { primary: Vec2; secondary: Vec2[] } {
  const fallbackCenter: Vec2 = { x: map.width * 0.5, y: map.height * 0.5 };
  if (map.capturePoints.length === 0) {
    return { primary: fallbackCenter, secondary: [] };
  }

  const stateById = new Map<number, TwCaptureState>();
  for (let i = 0; i < captures.length; i++) {
    stateById.set(captures[i].id, captures[i]);
  }

  const scored: { cp: TwCapturePointSpec; score: number }[] = [];
  for (let i = 0; i < map.capturePoints.length; i++) {
    const cp = map.capturePoints[i];
    const st = stateById.get(cp.id);
    const ownerTeam = st ? st.ownerTeam : -1;
    const progress = st ? st.progress : 0;
    const d = distBetween(armyCenter.x, armyCenter.y, cp.x, cp.y);

    let priority = 1000 - d * 0.28;
    if (cp.id === 0) {
      // Đài Hiệu Lệnh trung tâm luôn là huyết mạch chiến lược
      priority += 210;
    }
    if (ownerTeam === -1) {
      priority += 340 + (100 - progress) * 0.6;
    } else if (ownerTeam !== team) {
      priority += 390;
    } else if (progress < 100) {
      // Điểm phe mình đang bị địch kéo tụt thanh chiếm giữ -> ưu tiên cứu viện
      priority += 360 + (100 - progress) * 1.2;
    } else {
      priority -= 180;
    }

    scored.push({ cp, score: priority });
  }

  scored.sort((a, b) => b.score - a.score);
  const primary: Vec2 = { x: scored[0].cp.x, y: scored[0].cp.y };
  const secondary: Vec2[] = [];
  for (let i = 1; i < scored.length; i++) {
    secondary.push({ x: scored[i].cp.x, y: scored[i].cp.y });
  }
  return { primary, secondary };
}

// ============================================================================
// 3. KIỂM TRA ÁP LỰC HỎA LỰC TẦM XA & MỐI ĐE DỌA KỴ BINH
// ============================================================================

function isRegimentUnderRangedThreat(
  reg: TwSimRegiment,
  enemy: EnemyIntel,
  extraMargin: number = 35,
): boolean {
  const shooters = enemy.ranged.length + enemy.artillery.length;
  if (shooters === 0) return false;

  for (let i = 0; i < enemy.ranged.length; i++) {
    const er = enemy.ranged[i];
    if (er.ammo <= 0 || er.engagedWithId !== undefined) continue;
    const effRange = TW_UNITS[er.kind].range * (er.onHighGround ? 1.2 : 1.0) + extraMargin;
    if (distSq(reg.x, reg.y, er.x, er.y) <= effRange * effRange) {
      return true;
    }
  }

  for (let i = 0; i < enemy.artillery.length; i++) {
    const ea = enemy.artillery[i];
    if (ea.ammo <= 0 || ea.engagedWithId !== undefined) continue;
    if (ea.lockedTargetId === reg.id || ea.anim === 'shoot') {
      const effRange = TW_UNITS[ea.kind].range * (ea.onHighGround ? 1.2 : 1.0) + extraMargin;
      if (distSq(reg.x, reg.y, ea.x, ea.y) <= effRange * effRange) {
        return true;
      }
    }
  }

  return false;
}

function findNearestEnemyCavalry(
  reg: TwSimRegiment,
  enemy: EnemyIntel,
): { target: TwSimRegiment | undefined; dist: number } {
  let best: TwSimRegiment | undefined;
  let bestDist = Infinity;

  for (let i = 0; i < enemy.cavalry.length; i++) {
    const ec = enemy.cavalry[i];
    const d = distBetween(reg.x, reg.y, ec.x, ec.y);
    if (d < bestDist) {
      bestDist = d;
      best = ec;
    }
  }

  // Các danh tướng Tiên Phong cưỡi chiến mã xung kích (như Lữ Bố, Trương Phi, Tư Mã Tương An) cũng là mối đe dọa kỵ kích lớn
  for (let i = 0; i < enemy.generals.length; i++) {
    const eg = enemy.generals[i];
    if (isDueling(eg)) continue;
    const gSpec = eg.generalId ? TW_GENERALS[eg.generalId] : undefined;
    if (gSpec && (gSpec.class === 'vanguard' || gSpec.chargeBonus >= 75)) {
      const d = distBetween(reg.x, reg.y, eg.x, eg.y);
      if (d < bestDist) {
        bestDist = d;
        best = eg;
      }
    }
  }

  return { target: best, dist: bestDist };
}

function findNearestEnemy(
  x: number,
  y: number,
  candidates: ReadonlyArray<TwSimRegiment>,
): { target: TwSimRegiment | undefined; dist: number } {
  let best: TwSimRegiment | undefined;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const d = distBetween(x, y, c.x, c.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return { target: best, dist: bestDist };
}

// ============================================================================
// 4. CHỌN ĐỒI CAO ('RIDGE') & MỤC TIÊU TẬP TRUNG HỎA LỰC TẦM XA
// ============================================================================

function resolveHighGroundSupportAnchor(
  map: TwMapSpec,
  baseAnchor: Vec2,
  groupCenter: Vec2,
  screenCenter: Vec2,
  fwdX: number,
  fwdY: number,
  enemy: EnemyIntel,
): Vec2 {
  let bestRidgePt: Vec2 | undefined;
  let bestScore = Infinity;

  for (let i = 0; i < map.terrainZones.length; i++) {
    const zone = map.terrainZones[i];
    if (zone.kind !== 'ridge') continue;

    const candidateRaw = projectPointIntoZone(baseAnchor.x, baseAnchor.y, zone, 0.68);
    const candidate = clampToBattlefield(map, candidateRaw.x, candidateRaw.y, 75);
    if (!twPointInTerrainZone(candidate.x, candidate.y, zone)) continue;

    const distFromBase = distBetween(baseAnchor.x, baseAnchor.y, candidate.x, candidate.y);
    const distFromGroup = distBetween(groupCenter.x, groupCenter.y, candidate.x, candidate.y);
    if (distFromBase > RIDGE_SEARCH_MAX_DIST && distFromGroup > RIDGE_SEARCH_MAX_DIST) {
      continue;
    }

    // Không bao giờ đẩy cung nỏ / pháo đá vượt lên trước màn chắn bộ binh vào miệng gươm địch
    const relFwd = (candidate.x - screenCenter.x) * fwdX + (candidate.y - screenCenter.y) * fwdY;
    if (enemy.visibleActive.length > 0 && relFwd > 35) {
      continue;
    }

    // Tránh đồi cao đang bị kỵ binh / bộ binh địch chiếm đóng sát bên
    let unsafe = false;
    for (let k = 0; k < enemy.visibleActive.length; k++) {
      const e = enemy.visibleActive[k];
      const isMeleeThreat = e.isGeneral || TW_UNITS[e.kind].range === 0;
      if (isMeleeThreat && distSq(candidate.x, candidate.y, e.x, e.y) < 235 * 235) {
        unsafe = true;
        break;
      }
    }
    if (unsafe) continue;

    const score = distFromBase * 0.65 + distFromGroup * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestRidgePt = candidate;
    }
  }

  return bestRidgePt ?? clampToBattlefield(map, baseAnchor.x, baseAnchor.y, 75);
}

/**
 * Chấm điểm mục tiêu ưu tiên bắn cho Cung Nỏ (`isArtillery = false`) hoặc Pháo Đá (`isArtillery = true`).
 * Lưu ý: chỉ chọn mục tiêu trong `unitRange * 0.91` để `stepRegimentMovement` giữ vững vị trí trên đồi / sau bộ binh
 * thay vì tự ý hành quân rời khỏi tuyến bảo vệ!
 */
function pickBestRangedFocusTarget(
  shooter: TwSimRegiment,
  enemy: EnemyIntel,
  isArtillery: boolean,
): TwSimRegiment | undefined {
  const unitSpec = TW_UNITS[shooter.kind];
  const holdFireRange = unitSpec.range * (shooter.onHighGround ? 1.2 : 1.0) * 0.91;
  const apHeavy = unitSpec.armorPiercingDmg >= 14;

  let best: TwSimRegiment | undefined;
  let bestScore = -Infinity;

  for (let i = 0; i < enemy.visibleActive.length; i++) {
    const e = enemy.visibleActive[i];
    if (isDueling(e)) continue;

    const d = distBetween(shooter.x, shooter.y, e.x, e.y);
    if (d > holdFireRange) continue;

    const eSpec = TW_UNITS[e.kind];
    let score = 120 - d * 0.08;

    if (isArtillery) {
      // Pháo đá Uy Viễn ưu tiên đập tan khối bộ binh / cung thủ đông đặc hoặc phản pháo
      score += Math.min(90, e.men * 0.65);
      if (!e.isGeneral && eSpec.category === 'artillery') score += 65;
      if (!e.isGeneral && (eSpec.category === 'ranged_bow' || eSpec.category === 'ranged_crossbow')) {
        score += 48;
      }
      if (e.formation === 'shieldwall' || e.formation === 'spearwall') score += 32;
      // Hạn chế ném đá vào đám cận chiến đang cài răng lược với quân mình nếu còn mục tiêu ngoài
      if (e.engagedWithId !== undefined) score -= 55;
    } else {
      // Cung & Nỏ ưu tiên xạ kích kỵ binh xung kích, cung thủ địch, đơn vị ít khiên và quân đang dao động
      if (e.moraleState === 'wavering') score += 45;
      if (e.isGeneral) {
        score += apHeavy ? 42 : 18;
      } else {
        const cat = eSpec.category;
        if (cat === 'cavalry_shock') score += 58;
        else if (cat === 'ranged_bow' || cat === 'ranged_crossbow') score += 52;
        else if (cat === 'cavalry_melee') score += apHeavy ? 40 : 20;
        else if (cat === 'artillery') score += 35;

        if (apHeavy) {
          score += eSpec.armor * 0.45;
        } else {
          const missileBlock =
            eSpec.shieldMissileBlock + (e.formation === 'shieldwall' ? 30 : 0);
          score -= missileBlock * 0.65;
        }
      }

      if (e.inForest) score -= 32;
      // Giữ mục tiêu đang bắn dở để dồn sát thương gãy sĩ khí nhanh
      if (shooter.lockedTargetId === e.id) score += 18;
    }

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  return best;
}

// ============================================================================
// 5. ĐỊNH TUYẾN KỴ BINH BỌC SƯỜN & PHỤC KÍCH RỪNG THÔNG ('FOREST')
// ============================================================================

function findFlankForestAmbushZone(
  map: TwMapSpec,
  infCenter: Vec2,
  enemyCenter: Vec2,
  fwdX: number,
  fwdY: number,
  latX: number,
  latY: number,
  flankSign: -1 | 1,
): { zone: TwTerrainZone; waypoint: Vec2 } | undefined {
  const axisDist = distBetween(infCenter.x, infCenter.y, enemyCenter.x, enemyCenter.y);
  let bestZone: TwTerrainZone | undefined;
  let bestWp: Vec2 | undefined;
  let bestScore = -Infinity;

  for (let i = 0; i < map.terrainZones.length; i++) {
    const z = map.terrainZones[i];
    if (z.kind !== 'forest') continue;

    const relX = z.x - infCenter.x;
    const relY = z.y - infCenter.y;
    const fwdProj = relX * fwdX + relY * fwdY;
    const latProj = relX * latX + relY * latY;

    // Rừng phải nằm lệch về phía cánh đang xét và nằm trên hành lang tiếp cận trận tuyến địch
    if (latProj * flankSign < 85 || Math.abs(latProj) > 1200) continue;
    if (fwdProj < -200 || fwdProj > axisDist + 380) continue;

    const advanceBiasX = z.x + fwdX * Math.min(z.rx, z.ry) * 0.3 + latX * flankSign * 25;
    const advanceBiasY = z.y + fwdY * Math.min(z.rx, z.ry) * 0.3 + latY * flankSign * 25;
    const wpRaw = projectPointIntoZone(advanceBiasX, advanceBiasY, z, 0.66);
    const wp = clampToBattlefield(map, wpRaw.x, wpRaw.y, 80);
    if (!twPointInTerrainZone(wp.x, wp.y, z)) continue;

    const sizeBonus = Math.min(180, (z.rx + z.ry) * 0.25);
    const distPenalty = distBetween(infCenter.x, infCenter.y, wp.x, wp.y) * 0.18;
    const score = sizeBonus + Math.min(220, Math.abs(latProj) * 0.35) - distPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestZone = z;
      bestWp = wp;
    }
  }

  return bestZone && bestWp ? { zone: bestZone, waypoint: bestWp } : undefined;
}

function isProtectedByNearbySpearwall(target: TwSimRegiment, enemy: EnemyIntel): boolean {
  for (let i = 0; i < enemy.infantry.length; i++) {
    const ei = enemy.infantry[i];
    if (ei.id === target.id) continue;
    if (TW_UNITS[ei.kind].category !== 'infantry_polearm') continue;
    const braceDanger = ei.formation === 'spearwall' ? 135 : 85;
    if (ei.engagedWithId === undefined && distSq(target.x, target.y, ei.x, ei.y) <= braceDanger * braceDanger) {
      return true;
    }
  }
  return false;
}

function doesPathCrossEnemySpearFront(
  cav: TwSimRegiment,
  target: TwSimRegiment,
  enemy: EnemyIntel,
): boolean {
  const dx = target.x - cav.x;
  const dy = target.y - cav.y;
  const segLen = Math.hypot(dx, dy);
  if (segLen < 1e-3) return false;
  const ux = dx / segLen;
  const uy = dy / segLen;

  for (let i = 0; i < enemy.infantry.length; i++) {
    const sp = enemy.infantry[i];
    if (sp.id === target.id) continue;
    if (TW_UNITS[sp.kind].category !== 'infantry_polearm') continue;

    const px = sp.x - cav.x;
    const py = sp.y - cav.y;
    const proj = px * ux + py * uy;
    if (proj <= 20 || proj >= segLen - 25) continue;

    const perp = Math.abs(px * -uy + py * ux);
    const dangerRadius = sp.formation === 'spearwall' ? 155 : 115;
    if (perp <= dangerRadius) {
      return true;
    }
  }
  return false;
}

function pickCavalryStrikeTarget(
  wingCenter: Vec2,
  rearScreenCenter: Vec2,
  enemy: EnemyIntel,
): TwSimRegiment | undefined {
  // Ưu tiên khẩn cấp: đánh chặn kỵ binh/bộ binh địch đang lao vào phá tuyến cung pháo hậu phương của ta
  let emergencyTarget: TwSimRegiment | undefined;
  let emergencyDist = 290;
  for (let i = 0; i < enemy.visibleActive.length; i++) {
    const e = enemy.visibleActive[i];
    if (isDueling(e)) continue;
    const isMeleeOrCav = e.isGeneral || TW_UNITS[e.kind].range === 0;
    if (!isMeleeOrCav) continue;
    const dRear = distBetween(rearScreenCenter.x, rearScreenCenter.y, e.x, e.y);
    const dCav = distBetween(wingCenter.x, wingCenter.y, e.x, e.y);
    if (dRear < emergencyDist && dCav < 520) {
      emergencyDist = dRear;
      emergencyTarget = e;
    }
  }
  if (emergencyTarget) return emergencyTarget;

  let best: TwSimRegiment | undefined;
  let bestScore = -Infinity;

  for (let i = 0; i < enemy.visibleActive.length; i++) {
    const e = enemy.visibleActive[i];
    if (isDueling(e)) continue;

    const d = distBetween(wingCenter.x, wingCenter.y, e.x, e.y);
    let score = 300 - d * 0.22;

    if (e.isGeneral) {
      const gSpec = e.generalId ? TW_GENERALS[e.generalId] : undefined;
      if (gSpec?.class === 'strategist') {
        score += 210;
      } else if (gSpec?.class === 'commander') {
        score += 95;
      } else {
        score -= 20;
      }
    } else {
      const cat = TW_UNITS[e.kind].category;
      if (cat === 'artillery') {
        score += 260;
      } else if (cat === 'ranged_bow' || cat === 'ranged_crossbow') {
        score += 225;
      } else if (cat === 'infantry_sword') {
        // Bọc hậu bộ binh đao kiếm địch đang mải giao chiến chính diện ("Thiết Chùy Đập Đe")
        score += e.engagedWithId !== undefined ? 155 : 45;
      } else if (cat === 'cavalry_shock' || cat === 'cavalry_melee') {
        score += 70;
      } else if (cat === 'infantry_polearm') {
        if (e.formation === 'spearwall' && e.engagedWithId === undefined) {
          score -= 280;
        } else if (e.engagedWithId !== undefined) {
          // Chỉ húc sau lưng trường thương khi chúng đã khóa mặt trước
          const faceX = Math.cos(e.facing);
          const faceY = Math.sin(e.facing);
          const toCavX = wingCenter.x - e.x;
          const toCavY = wingCenter.y - e.y;
          const len = Math.hypot(toCavX, toCavY) || 1;
          const dot = (toCavX / len) * faceX + (toCavY / len) * faceY;
          score += dot <= -0.35 ? 110 : -140;
        } else {
          score -= 170;
        }
      }
    }

    if (e.moraleState === 'wavering') score += 55;
    if (isProtectedByNearbySpearwall(e, enemy)) score -= 115;

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }

  return best;
}

// ============================================================================
// 6. TUYỆT KỸ DANH TƯỚNG & ĐẤU TƯỚNG (ROMANCE HEROIC SKILLS & DUELS)
// ============================================================================

function evaluateGeneralSkillsAndDuels(
  generals: ReadonlyArray<TwSimRegiment>,
  alliedActive: ReadonlyArray<TwSimRegiment>,
  myRangedAndArtilleryCount: number,
  enemy: EnemyIntel,
  romanceMode: boolean,
  emit: (cmd: TwCommand) => boolean,
): Set<number> {
  const challengedThisTick = new Set<number>();
  const generalsIssuedOrder = new Set<number>();

  for (let gIdx = 0; gIdx < generals.length; gIdx++) {
    const gen = generals[gIdx];
    const genSpec: TwGeneralSpec | undefined = gen.generalId
      ? TW_GENERALS[gen.generalId]
      : undefined;
    if (!genSpec) continue;

    // ------------------------------------------------------------------------
    // A. ĐẤU TƯỚNG TAM QUỐC (SINGLE DUEL): Tiên Phong / Dũng Tướng (duelPower >= 78, HP > 55%)
    // ------------------------------------------------------------------------
    const isDuelistClass = genSpec.class === 'vanguard' || genSpec.class === 'champion';
    if (
      romanceMode &&
      isDuelistClass &&
      genSpec.duelPower >= DUEL_MIN_POWER &&
      gen.hp > gen.maxHp * DUEL_MIN_HP_RATIO &&
      !isDueling(gen)
    ) {
      let bestRival: TwSimRegiment | undefined;
      let bestDuelScore = -Infinity;

      for (let eIdx = 0; eIdx < enemy.generals.length; eIdx++) {
        const rival = enemy.generals[eIdx];
        if (isDueling(rival) || challengedThisTick.has(rival.id)) continue;
        const rivalSpec = rival.generalId ? TW_GENERALS[rival.generalId] : undefined;
        if (!rivalSpec) continue;
        if (rivalSpec.class !== 'champion' && rivalSpec.class !== 'vanguard') continue;

        const d = distBetween(gen.x, gen.y, rival.x, rival.y);
        if (d > DUEL_CHALLENGE_RANGE) continue;

        const myHpPct = gen.hp / Math.max(1, gen.maxHp);
        const rivalHpPct = rival.hp / Math.max(1, rival.maxHp);
        const powerEdge = genSpec.duelPower - rivalSpec.duelPower + (myHpPct - rivalHpPct) * 28;
        // Tránh tự sát nếu chênh lệch võ lực quá xa trừ phi tướng địch đã trọng thương
        if (powerEdge < -20) continue;

        const score = 200 - d * 0.35 + powerEdge * 2.2;
        if (score > bestDuelScore) {
          bestDuelScore = score;
          bestRival = rival;
        }
      }

      if (bestRival) {
        // Nếu có tuyệt kỹ cường hóa Đấu Tướng (Độc Nhãn Cuồng Nộ / Thiết Kỵ Đại Tấn), kích hoạt ngay trước khi gõ chiêng!
        if (gen.skillCooldownLeft <= 0 && genSpec.skill.effectKind === 'duel_buff') {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: gen.x,
            targetY: gen.y,
            targetRegId: bestRival.id,
          });
        }
        if (
          emit({
            t: 'challenge_duel',
            generalRegId: gen.id,
            targetGeneralRegId: bestRival.id,
          })
        ) {
          challengedThisTick.add(bestRival.id);
          generalsIssuedOrder.add(gen.id);
          continue;
        }
      }
    }

    // ------------------------------------------------------------------------
    // B. TUYỆT KỸ DANH TƯỚNG (HEROIC ACTIVE SKILLS)
    // ------------------------------------------------------------------------
    if (gen.skillCooldownLeft > 0) continue;

    const skill = genSpec.skill;
    switch (skill.effectKind) {
      case 'rally_horn': {
        // Thổi tù và khích lệ khi có >= 1 trung đoàn đồng minh đang dao động ('wavering')
        // hoặc >= 3 trung đoàn đồng minh đang kịch chiến giảm sĩ khí trong bán kính đại kỳ
        let waveringCount = 0;
        let engagedLowMoraleCount = 0;
        const rSq = (skill.radius * 1.05) * (skill.radius * 1.05);

        for (let i = 0; i < alliedActive.length; i++) {
          const ally = alliedActive[i];
          if (distSq(gen.x, gen.y, ally.x, ally.y) > rSq) continue;
          if (ally.moraleState === 'wavering' || ally.morale < 42) {
            waveringCount++;
          } else if (ally.engagedWithId !== undefined && ally.morale < 64) {
            engagedLowMoraleCount++;
          }
        }

        if (waveringCount >= 1 || engagedLowMoraleCount >= 3) {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: gen.x,
            targetY: gen.y,
          });
        }
        break;
      }

      case 'fire_volley': {
        // Gia Cát Lượng / Chu Du gọi bão Hỏa Tiễn khi cung nỏ đang khai hỏa hoặc quân địch tụ cụm trong tầm 540
        if (enemy.visibleActive.length === 0) break;
        const archersShooting = alliedActive.some(
          (a) =>
            a.anim === 'shoot' ||
            (!a.isGeneral && TW_UNITS[a.kind].range > 0 && a.ammo > 0 && a.lockedTargetId !== undefined),
        );
        const maxCastDist = archersShooting || myRangedAndArtilleryCount > 0 ? 560 : 420;

        let bestClusterTarget: TwSimRegiment | undefined;
        let bestClusterScore = -Infinity;
        const splashSq = (skill.radius * 0.85) * (skill.radius * 0.85);

        for (let i = 0; i < enemy.visibleActive.length; i++) {
          const cand = enemy.visibleActive[i];
          if (isDueling(cand)) continue;
          const d = distBetween(gen.x, gen.y, cand.x, cand.y);
          if (d > maxCastDist) continue;

          let clusterMen = cand.men;
          let neighborRegs = 0;
          for (let j = 0; j < enemy.visibleActive.length; j++) {
            if (i === j) continue;
            const other = enemy.visibleActive[j];
            if (distSq(cand.x, cand.y, other.x, other.y) <= splashSq) {
              clusterMen += other.men;
              neighborRegs++;
            }
          }

          const score = clusterMen * 1.1 + neighborRegs * 45 + (archersShooting ? 40 : 0) - d * 0.08;
          if (score > bestClusterScore) {
            bestClusterScore = score;
            bestClusterTarget = cand;
          }
        }

        if (bestClusterTarget && (archersShooting || bestClusterScore >= 85)) {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: bestClusterTarget.x,
            targetY: bestClusterTarget.y,
            targetRegId: bestClusterTarget.id,
          });
        }
        break;
      }

      case 'aoe_smash': {
        // Quan Vũ / Trương Phi / Lữ Bố tung đòn quét sấm sét ngay giữa cận chiến
        const hitRadius = Math.max(95, skill.radius * 0.92);
        const hitSq = hitRadius * hitRadius;
        let nearbyEnemies = 0;
        let primaryHit: TwSimRegiment | undefined;

        for (let i = 0; i < enemy.visibleActive.length; i++) {
          const e = enemy.visibleActive[i];
          if (isDueling(e)) continue;
          if (distSq(gen.x, gen.y, e.x, e.y) <= hitSq) {
            nearbyEnemies++;
            if (!primaryHit || e.men > primaryHit.men) {
              primaryHit = e;
            }
          }
        }

        if (primaryHit && (gen.engagedWithId !== undefined || nearbyEnemies >= 1)) {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: primaryHit.x,
            targetY: primaryHit.y,
            targetRegId: primaryHit.id,
          });
        }
        break;
      }

      case 'duel_buff': {
        const { target: nearE, dist: nearD } = findNearestEnemy(
          gen.x,
          gen.y,
          enemy.visibleActive,
        );
        if (
          nearE &&
          (gen.engagedWithId !== undefined || gen.anim === 'charge' || nearD <= 175)
        ) {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: gen.x,
            targetY: gen.y,
            targetRegId: nearE.id,
          });
        }
        break;
      }

      case 'iron_evasion': {
        // Triệu Vân / Tôn Kiên bật giáp hộ thể khi giáp lá cà hoặc chịu mưa tên
        const { target: nearE, dist: nearD } = findNearestEnemy(
          gen.x,
          gen.y,
          enemy.visibleActive,
        );
        const underArrows =
          gen.hp < gen.maxHp * 0.9 && isRegimentUnderRangedThreat(gen, enemy, 20);
        if (
          gen.engagedWithId !== undefined ||
          (nearE !== undefined && nearD <= 165) ||
          underArrows
        ) {
          emit({
            t: 'use_skill',
            generalRegId: gen.id,
            targetX: gen.x,
            targetY: gen.y,
            targetRegId: nearE?.id,
          });
        }
        break;
      }
    }
  }

  return generalsIssuedOrder;
}

// ============================================================================
// 6.5. HỎA CÔNG, ĐẠO CỤ CHIẾN TRƯỜNG, PHA BỐ TRẬN & ĐẤU TƯỚNG TƯƠNG TÁC
// ============================================================================

function shiftOutOfActiveFires(
  map: TwMapSpec,
  pt: Vec2,
  fires: ReadonlyArray<TwFireZoneFrame> | undefined,
  latX: number,
  latY: number,
  fwdX: number,
  fwdY: number,
): Vec2 {
  if (!fires || fires.length === 0) return pt;
  let x = pt.x;
  let y = pt.y;
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i];
    const safeR = f.radius + 54;
    const dx = x - f.x;
    const dy = y - f.y;
    const d = Math.hypot(dx, dy);
    if (d < safeR) {
      if (d > 8) {
        const push = safeR - d;
        x += (dx / d) * push;
        y += (dy / d) * push;
      } else {
        x += latX * safeR - fwdX * 45;
        y += latY * safeR - fwdY * 45;
      }
    }
  }
  return clampToBattlefield(map, x, y, 75);
}

function clampToDeployZone(pt: Vec2, zone: TwDeployZoneSpec, innerScale: number = 0.82): Vec2 {
  return projectPointIntoZone(
    pt.x,
    pt.y,
    { id: 'deploy', kind: 'ridge', x: zone.x, y: zone.y, rx: zone.rx, ry: zone.ry, rot: zone.rot },
    innerScale,
  );
}

function stepBotDeploymentPhase(
  map: TwMapSpec,
  roles: BotArmyRoles,
  myActiveAll: ReadonlyArray<TwSimRegiment>,
  opts: TwBotStepOptions | undefined,
  difficulty: 'easy' | 'normal' | 'hard',
  emit: (cmd: TwCommand) => boolean,
): void {
  if (opts?.readyDeploy) return;

  const mapCenter: Vec2 = { x: map.width * 0.5, y: map.height * 0.5 };
  const armyCenter = computeCentroid(myActiveAll, mapCenter);
  const facing = Math.atan2(mapCenter.y - armyCenter.y, mapCenter.x - armyCenter.x);
  const fwdX = Math.cos(facing);
  const fwdY = Math.sin(facing);
  const latX = -fwdY;
  const latY = fwdX;

  // 1. Phục kích Tiên Phong (Vanguard Deployment) vào Rừng Thông gần cánh quân AI
  if (difficulty !== 'easy') {
    const vanguardUnits = myActiveAll.filter((r) => {
      if (r.isGeneral) {
        const g = r.generalId ? TW_GENERALS[r.generalId] : undefined;
        return g?.class === 'vanguard';
      }
      return Boolean(TW_UNITS[r.kind].vanguardDeploy);
    });

    if (vanguardUnits.length > 0) {
      let bestForest: TwTerrainZone | undefined;
      let bestScore = -Infinity;
      for (let i = 0; i < map.terrainZones.length; i++) {
        const z = map.terrainZones[i];
        if (z.kind !== 'forest') continue;
        const dArmy = distBetween(armyCenter.x, armyCenter.y, z.x, z.y);
        const dCenter = distBetween(mapCenter.x, mapCenter.y, z.x, z.y);
        // Chọn rừng nằm ở nửa sân của AI hoặc vùng đệm trung lập, không lấn sang hậu cứ đối phương
        if (dArmy > map.width * 0.54) continue;
        const score = 600 - dCenter * 0.35 - Math.abs(dArmy - 420) * 0.45;
        if (score > bestScore) {
          bestScore = score;
          bestForest = z;
        }
      }

      if (bestForest) {
        const ambushPt = clampToBattlefield(map, bestForest.x, bestForest.y, 85);
        const ambushFacing = Math.atan2(mapCenter.y - ambushPt.y, mapCenter.x - ambushPt.x);
        const chosen = vanguardUnits.slice(0, 2);
        emit({
          t: 'move_line',
          regIds: chosen.map((u) => u.id),
          x: ambushPt.x,
          y: ambushPt.y,
          facing: ambushFacing,
          run: false,
        });
      }
    }
  }

  // 2. Dựng sẵn Chông Gỗ bảo vệ Cung Nỏ & Bẫy Dầu Hỏa đón lõng tiền tuyến trong Vùng Bố Trận
  const left = opts?.deployablesLeft;
  const dz = opts?.deployZone;
  if (difficulty !== 'easy' && left && dz) {
    const supportPool = [...roles.ranged, ...roles.artillery];
    const supportCenter = supportPool.length > 0 ? computeCentroid(supportPool, armyCenter) : armyCenter;

    if ((left.stakes ?? 0) > 0) {
      const stakePt = clampToDeployZone(
        {
          x: supportCenter.x + fwdX * 72 + latX * 85,
          y: supportCenter.y + fwdY * 72 + latY * 85,
        },
        dz,
      );
      emit({
        t: 'place_deployable',
        kind: 'stakes',
        x: Math.round(stakePt.x * 10) / 10,
        y: Math.round(stakePt.y * 10) / 10,
        facing,
      });
    }

    const hasFireSource =
      roles.ranged.some((r) => TW_UNITS[r.kind].category === 'ranged_bow') ||
      roles.generals.some((g) => g.generalId && TW_GENERALS[g.generalId]?.skill.effectKind === 'fire_volley');
    if (hasFireSource && (left.oil ?? 0) > 0) {
      const oilPt = clampToDeployZone(
        {
          x: armyCenter.x + fwdX * 155,
          y: armyCenter.y + fwdY * 155,
        },
        dz,
      );
      emit({
        t: 'place_deployable',
        kind: 'oil',
        x: Math.round(oilPt.x * 10) / 10,
        y: Math.round(oilPt.y * 10) / 10,
        facing,
      });
    }
  }

  // 3. Chốt đội hình sẵn sàng khai chiến ngay lập tức!
  emit({ t: 'ready_deploy', ready: true });
}

function evaluateActiveDuelStances(
  myDuelingGenerals: ReadonlyArray<TwSimRegiment>,
  allRegs: ReadonlyArray<TwSimRegiment>,
  duels: ReadonlyArray<TwDuelFrame> | undefined,
  difficulty: 'easy' | 'normal' | 'hard',
  emit: (cmd: TwCommand) => boolean,
): void {
  if (!duels || duels.length === 0 || myDuelingGenerals.length === 0) return;

  for (let i = 0; i < duels.length; i++) {
    const duel = duels[i];
    if (duel.timerLeft <= 0) continue;

    const myGen = myDuelingGenerals.find(
      (g) => g.id === duel.genARegId || g.id === duel.genBRegId,
    );
    if (!myGen) continue;

    const isSideA = myGen.id === duel.genARegId;
    const foeId = isSideA ? duel.genBRegId : duel.genARegId;
    const currentStance: TwDuelStance = (isSideA ? duel.stanceA : duel.stanceB) ?? 'balanced';
    const foeStance: TwDuelStance = (isSideA ? duel.stanceB : duel.stanceA) ?? 'balanced';
    const foeGen = allRegs.find((r) => r.id === foeId);
    if (!foeGen) continue;

    const mySpec = myGen.generalId ? TW_GENERALS[myGen.generalId] : undefined;
    const foeSpec = foeGen.generalId ? TW_GENERALS[foeGen.generalId] : undefined;
    const myHpPct = myGen.hp / Math.max(1, myGen.maxHp);
    const foeHpPct = foeGen.hp / Math.max(1, foeGen.maxHp);
    const powerEdge = (mySpec?.duelPower ?? 75) - (foeSpec?.duelPower ?? 75);

    // Ở độ khó Khó: nếu Quân Sư / Thống Soái hoặc tướng chủ lực sắp tử trận (< 18% máu & thua thiệt nặng) -> Thoái Đấu bảo toàn tính mạng!
    const highValueLeader = mySpec?.class === 'strategist' || mySpec?.class === 'commander';
    if (
      difficulty === 'hard' &&
      duel.clashPhase > 0 &&
      myHpPct < 0.18 &&
      foeHpPct > myHpPct + 0.28 &&
      (highValueLeader || powerEdge <= -12)
    ) {
      emit({ t: 'duel_action', duelId: duel.id, action: 'retreat' });
      continue;
    }

    let desired: 'press' | 'guard' | undefined;
    if (myHpPct < 0.46 || (foeStance === 'press' && powerEdge < 4 && myHpPct < 0.72)) {
      desired = 'guard';
    } else if (myHpPct >= 0.56 && (powerEdge >= 5 || foeHpPct < 0.38)) {
      desired = 'press';
    }

    if (desired && desired !== currentStance) {
      emit({ t: 'duel_action', duelId: duel.id, action: desired });
    }
  }
}

function evaluateFireArrowsAndFortifications(
  team: number,
  map: TwMapSpec,
  roles: BotArmyRoles,
  enemy: EnemyIntel,
  screenAnchor: Vec2,
  baseRangedRear: Vec2,
  fwdX: number,
  fwdY: number,
  battleFacing: number,
  difficulty: 'easy' | 'normal' | 'hard',
  opts: TwBotStepOptions | undefined,
  emit: (cmd: TwCommand) => boolean,
): void {
  const fires = opts?.fires ?? [];
  const deployables = opts?.deployables ?? [];

  // 1. Điều khiển Hỏa Tiễn (`toggle_fire_arrows`) thông minh cho Cung Thủ (`ranged_bow`)
  const enableFireArrowIds: number[] = [];
  const disableFireArrowIds: number[] = [];

  for (let i = 0; i < roles.ranged.length; i++) {
    const r = roles.ranged[i];
    if (TW_UNITS[r.kind].category !== 'ranged_bow') continue;
    const currentlyFire = Boolean((r as { fireArrowActive?: boolean }).fireArrowActive);

    if (r.ammo <= 3 || enemy.visibleActive.length === 0) {
      if (currentlyFire) disableFireArrowIds.push(r.id);
      continue;
    }

    const lockedFoe =
      r.lockedTargetId !== undefined
        ? enemy.visibleActive.find((e) => e.id === r.lockedTargetId)
        : undefined;
    const targetFoe = lockedFoe ?? findNearestEnemy(r.x, r.y, enemy.visibleActive).target;

    let wantFire = false;
    if (targetFoe) {
      // A. Địch đang đứng trên hoặc sát Bẫy Dầu Hỏa -> bắn Tên Lửa kích nổ biển lửa!
      const nearOil = deployables.some(
        (d) => d.kind === 'oil' && distBetween(targetFoe.x, targetFoe.y, d.x, d.y) <= d.radius + 75,
      );
      // B. Địch đang đứng trong hoặc sát Rừng Thông chưa bốc cháy -> Hỏa Công Đốt Rừng!
      let inUnlitForest = false;
      for (let zIdx = 0; zIdx < map.terrainZones.length; zIdx++) {
        const z = map.terrainZones[zIdx];
        if (z.kind !== 'forest') continue;
        if (!twPointInTerrainZone(targetFoe.x, targetFoe.y, z)) continue;
        const alreadyBurning = fires.some((f) => distBetween(f.x, f.y, targetFoe.x, targetFoe.y) <= f.radius);
        if (!alreadyBurning) {
          inUnlitForest = true;
          break;
        }
      }
      // C. Địch là Kỵ Binh (ngựa sợ lửa) hoặc đang dao động sĩ khí (< 50)
      const isCavOrWavering =
        (!targetFoe.isGeneral &&
          (TW_UNITS[targetFoe.kind].category === 'cavalry_shock' ||
            TW_UNITS[targetFoe.kind].category === 'cavalry_melee')) ||
        targetFoe.morale < 50;

      wantFire = nearOil || inUnlitForest || isCavOrWavering;
    }

    if (wantFire && !currentlyFire) {
      enableFireArrowIds.push(r.id);
    } else if (!wantFire && currentlyFire) {
      disableFireArrowIds.push(r.id);
    }
  }

  if (enableFireArrowIds.length > 0) {
    emit({ t: 'toggle_fire_arrows', regIds: enableFireArrowIds, value: true });
  }
  if (disableFireArrowIds.length > 0) {
    emit({ t: 'toggle_fire_arrows', regIds: disableFireArrowIds, value: false });
  }

  // 2. Đặt Đạo Cụ Chiến Trường (`stakes`, `oil`, `caltrops`) giữa trận chiến
  const left = opts?.deployablesLeft;
  if (difficulty === 'easy' || !left || enemy.visibleActive.length === 0) return;

  const hasNearbyDeployable = (x: number, y: number, minDist: number): boolean =>
    deployables.some((d) => d.team === team && distBetween(d.x, d.y, x, y) < minDist);

  const findUnengagedAnchorNear = (x: number, y: number, maxDist: number): TwSimRegiment | undefined => {
    const pool = [...roles.polearms, ...roles.swords, ...roles.ranged, ...roles.generals];
    let best: TwSimRegiment | undefined;
    let bestD = maxDist;
    for (let i = 0; i < pool.length; i++) {
      const u = pool[i];
      if (u.engagedWithId !== undefined) continue;
      const d = distBetween(u.x, u.y, x, y);
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  };

  // A. Dựng Chông Gỗ (`stakes`) chắn trước Cung Nỏ khi Kỵ Binh địch lao vào trong bán kính 460u
  if ((left.stakes ?? 0) > 0 && (roles.ranged.length > 0 || roles.artillery.length > 0)) {
    let closestCav: TwSimRegiment | undefined;
    let closestCavD = 460;
    for (let i = 0; i < enemy.cavalry.length; i++) {
      const c = enemy.cavalry[i];
      const d = distBetween(baseRangedRear.x, baseRangedRear.y, c.x, c.y);
      if (d < closestCavD) {
        closestCavD = d;
        closestCav = c;
      }
    }
    if (closestCav) {
      const dirAngle = Math.atan2(closestCav.y - baseRangedRear.y, closestCav.x - baseRangedRear.x);
      const cand = clampToBattlefield(
        map,
        baseRangedRear.x + Math.cos(dirAngle) * 72,
        baseRangedRear.y + Math.sin(dirAngle) * 72,
        65,
      );
      if (!hasNearbyDeployable(cand.x, cand.y, 135) && findUnengagedAnchorNear(cand.x, cand.y, 215)) {
        emit({
          t: 'place_deployable',
          kind: 'stakes',
          x: Math.round(cand.x * 10) / 10,
          y: Math.round(cand.y * 10) / 10,
          facing: dirAngle,
        });
        return;
      }
    }
  }

  // B. Đổ Bẫy Dầu Hỏa (`oil`) đón đầu đại quân địch cách 180..420u khi có Cung Tên Lửa
  const hasBowAmmo = roles.ranged.some((r) => TW_UNITS[r.kind].category === 'ranged_bow' && r.ammo >= 4);
  if ((left.oil ?? 0) > 0 && hasBowAmmo) {
    const { target: nearFoe, dist: foeD } = findNearestEnemy(
      screenAnchor.x,
      screenAnchor.y,
      enemy.visibleActive,
    );
    if (nearFoe && foeD >= 175 && foeD <= 420) {
      const cand = clampToBattlefield(
        map,
        screenAnchor.x + fwdX * Math.min(145, foeD * 0.55),
        screenAnchor.y + fwdY * Math.min(145, foeD * 0.55),
        65,
      );
      const alreadyBurning = fires.some((f) => distBetween(f.x, f.y, cand.x, cand.y) < f.radius + 40);
      if (
        !alreadyBurning &&
        !hasNearbyDeployable(cand.x, cand.y, 150) &&
        findUnengagedAnchorNear(cand.x, cand.y, 215)
      ) {
        emit({
          t: 'place_deployable',
          kind: 'oil',
          x: Math.round(cand.x * 10) / 10,
          y: Math.round(cand.y * 10) / 10,
          facing: battleFacing,
        });
        return;
      }
    }
  }

  // C. Rải Chông Sắt (`caltrops`) làm chậm -55% & rỉ máu đội hình xung kích địch áp sát <= 275u
  if ((left.caltrops ?? 0) > 0) {
    const { target: nearFoe, dist: foeD } = findNearestEnemy(
      screenAnchor.x,
      screenAnchor.y,
      enemy.visibleActive,
    );
    if (nearFoe && foeD >= 95 && foeD <= 275) {
      const cand = clampToBattlefield(
        map,
        screenAnchor.x + fwdX * 68,
        screenAnchor.y + fwdY * 68,
        65,
      );
      if (!hasNearbyDeployable(cand.x, cand.y, 130) && findUnengagedAnchorNear(cand.x, cand.y, 215)) {
        emit({
          t: 'place_deployable',
          kind: 'caltrops',
          x: Math.round(cand.x * 10) / 10,
          y: Math.round(cand.y * 10) / 10,
          facing: battleFacing,
        });
      }
    }
  }
}

// ============================================================================
// 7. HÀM CHÍNH ĐIỀU HÀNH AI CHƯ HẦU (`stepTwBotSide`)
// ============================================================================

export interface TwBotStepOptions {
  romanceMode?: boolean;
  botDifficulty?: 'easy' | 'normal' | 'hard';
  battlePhase?: TwBattlePhase;
  deployZone?: TwDeployZoneSpec;
  fires?: ReadonlyArray<TwFireZoneFrame>;
  deployables?: ReadonlyArray<TwDeployableFrame>;
  duels?: ReadonlyArray<TwDuelFrame>;
  deployablesLeft?: Record<TwDeployableKind, number>;
  readyDeploy?: boolean;
}

export function stepTwBotSide(
  ownerIdx: number,
  team: number,
  map: TwMapSpec,
  allRegs: ReadonlyArray<TwSimRegiment>,
  captures: ReadonlyArray<TwCaptureState>,
  tick: number,
  emitCmd: (cmd: TwCommand) => void,
  opts?: TwBotStepOptions,
): void {
  const romanceMode = opts?.romanceMode !== false;
  const difficulty = opts?.botDifficulty ?? 'normal';
  const thinkInterval =
    difficulty === 'easy'
      ? 20
      : difficulty === 'hard'
        ? 9
        : TW_BOT_THINK_INTERVAL_TICKS;
  const maxCmdsBudget =
    difficulty === 'easy' ? 4 : difficulty === 'hard' ? 10 : MAX_CMDS_PER_THINK;

  // Phân tán nhịp suy nghĩ lệch pha giữa các ownerIdx (0..7)
  const safeTick = Math.max(0, Math.floor(tick));
  const staggerOffset = (Math.abs(Math.floor(ownerIdx)) * 5) % thinkInterval;
  if ((safeTick + staggerOffset) % thinkInterval !== 0) {
    return;
  }

  let cmdCount = 0;
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  const r3 = (n: number): number => Math.round(n * 1000) / 1000;
  const emit = (cmd: TwCommand): boolean => {
    if (cmdCount >= maxCmdsBudget) return false;
    cmdCount++;
    if (cmd.t === 'move_line') {
      emitCmd({
        ...cmd,
        x: r1(cmd.x),
        y: r1(cmd.y),
        facing: r3(cmd.facing),
      });
    } else if (cmd.t === 'use_skill') {
      emitCmd({
        ...cmd,
        targetX: cmd.targetX !== undefined ? r1(cmd.targetX) : undefined,
        targetY: cmd.targetY !== undefined ? r1(cmd.targetY) : undefined,
      });
    } else if (cmd.t === 'place_deployable') {
      emitCmd({
        ...cmd,
        x: r1(cmd.x),
        y: r1(cmd.y),
        facing: cmd.facing !== undefined ? r3(cmd.facing) : undefined,
      });
    } else {
      emitCmd(cmd);
    }
    return true;
  };

  // --------------------------------------------------------------------------
  // BƯỚC 1: PHÂN LOẠI ĐẠI QUÂN & TÌNH BÁO CHIẾN TRƯỜNG
  // --------------------------------------------------------------------------
  const { roles, myActiveAll, myDuelingGenerals, alliedActive, enemy } = classifyBotAndEnemyArmies(
    ownerIdx,
    team,
    allRegs,
  );
  if (myActiveAll.length === 0 && myDuelingGenerals.length === 0) return;

  // Xử lý Pha Bố Trận Tiền Chiến (`deployment`): giấu phục binh rừng thông, gài bẫy & bấm Khai Chiến!
  if (opts?.battlePhase === 'deployment') {
    stepBotDeploymentPhase(map, roles, myActiveAll, opts, difficulty, emit);
    return;
  }

  // Điều chỉnh thế Đấu Tướng tương tác (`press` / `guard` / `retreat`) ngay cả khi đại quân đang giao tranh
  evaluateActiveDuelStances(myDuelingGenerals, allRegs, opts?.duels, difficulty, emit);
  if (myActiveAll.length === 0) return;

  const mapCenter: Vec2 = { x: map.width * 0.5, y: map.height * 0.5 };
  const armyCenter = computeCentroid(myActiveAll, mapCenter);

  const meleeInfantry: TwSimRegiment[] = [...roles.polearms, ...roles.swords];
  const screenRegs: TwSimRegiment[] =
    meleeInfantry.length > 0
      ? meleeInfantry
      : roles.generals.length > 0
        ? roles.generals
        : myActiveAll;
  const infCenter = computeCentroid(screenRegs, armyCenter);

  const { primary: primaryCap, secondary: secondaryCaps } = pickCaptureObjectives(
    team,
    map,
    captures,
    infCenter,
  );

  const hasMeleeScreen = meleeInfantry.length > 0;
  const hasVisibleEnemies = enemy.visibleActive.length > 0;
  const enemyMainPool =
    enemy.infantry.length + enemy.generals.length > 0
      ? [...enemy.infantry, ...enemy.generals]
      : enemy.visibleActive;

  // Trong FFA nhiều phe, chọn cụm đại quân của 1 phe địch gần nhất / đang tranh chấp Đài Hiệu Lệnh
  // thay vì lấy trung bình cộng tọa độ tất cả các phe vào khoảng đất trống giữa bản đồ.
  let chosenEnemyCluster = enemyMainPool;
  if (enemyMainPool.length > 1) {
    const byTeam = new Map<number, TwSimRegiment[]>();
    for (let i = 0; i < enemyMainPool.length; i++) {
      const er = enemyMainPool[i];
      let arr = byTeam.get(er.team);
      if (!arr) {
        arr = [];
        byTeam.set(er.team, arr);
      }
      arr.push(er);
    }
    if (byTeam.size > 1) {
      let bestScore = Infinity;
      for (const cluster of byTeam.values()) {
        const c = computeCentroid(cluster, primaryCap);
        const dArmy = distBetween(infCenter.x, infCenter.y, c.x, c.y);
        const dCap = distBetween(primaryCap.x, primaryCap.y, c.x, c.y);
        const score = dArmy * 0.7 + dCap * 0.3;
        if (score < bestScore) {
          bestScore = score;
          chosenEnemyCluster = cluster;
        }
      }
    }
  }

  const enemyMainCenter = hasVisibleEnemies
    ? computeCentroid(chosenEnemyCluster, primaryCap)
    : primaryCap;

  // Xác định hướng mặt đại quân (facing) và mục tiêu tiến công của tuyến bộ binh chính
  let battleDest: Vec2;
  let battleFacing: number;

  if (hasVisibleEnemies) {
    const distToEnemyMain = distBetween(infCenter.x, infCenter.y, enemyMainCenter.x, enemyMainCenter.y);
    const distEnemyToCap = distBetween(enemyMainCenter.x, enemyMainCenter.y, primaryCap.x, primaryCap.y);
    battleFacing = Math.atan2(enemyMainCenter.y - infCenter.y, enemyMainCenter.x - infCenter.x);

    if (distToEnemyMain <= 920 || distEnemyToCap <= 620) {
      // Địch trong tầm giao chiến hoặc đang tranh chấp mục tiêu -> tiến thẳng ép tuyến địch
      battleDest = {
        x: enemyMainCenter.x * 0.78 + primaryCap.x * 0.22,
        y: enemyMainCenter.y * 0.78 + primaryCap.y * 0.22,
      };
    } else {
      // Địch ở rất xa -> chiếm giữ Đài Hiệu Lệnh trước đồng thời quay chính diện đề phòng địch
      battleDest = primaryCap;
    }
  } else {
    // 0 quân địch lộ diện (toàn bộ ẩn trong rừng sâu hoặc chưa chạm mặt): tiến chiếm Đài Hiệu Lệnh!
    battleDest = primaryCap;
    const distToCap = distBetween(infCenter.x, infCenter.y, primaryCap.x, primaryCap.y);
    battleFacing =
      distToCap > 45
        ? Math.atan2(primaryCap.y - infCenter.y, primaryCap.x - infCenter.x)
        : Math.atan2(mapCenter.y - infCenter.y, mapCenter.x - infCenter.x);
  }

  const fwdX = Math.cos(battleFacing);
  const fwdY = Math.sin(battleFacing);
  const latX = -fwdY;
  const latY = fwdX;

  // Nếu điểm tập kết tuyến bộ binh rơi vào lòng sông cạn hoặc bùn lầy (không trùng tâm Đài Hiệu Lệnh),
  // lùi nhẹ 115 đơn vị lên bờ khô ráo để nhử địch lội sông chịu phạt -8 Thủ cận chiến!
  if (
    distBetween(battleDest.x, battleDest.y, primaryCap.x, primaryCap.y) > 135 &&
    isPointInPenaltyWaterOrMud(map, battleDest.x, battleDest.y)
  ) {
    battleDest = clampToBattlefield(
      map,
      battleDest.x - fwdX * 115,
      battleDest.y - fwdY * 115,
      80,
    );
  } else {
    battleDest = clampToBattlefield(map, battleDest.x, battleDest.y, 80);
  }
  battleDest = shiftOutOfActiveFires(map, battleDest, opts?.fires, latX, latY, fwdX, fwdY);

  const activeRanged = roles.ranged.filter((r) => r.ammo > 0);
  const activeArtillery = roles.artillery.filter((r) => r.ammo > 0);

  // Neo màn chắn thực tế & hậu tuyến Cung Nỏ / Pháo Đá
  const distScreenToDest = distBetween(infCenter.x, infCenter.y, battleDest.x, battleDest.y);
  const screenLead = !hasVisibleEnemies && distScreenToDest > 240 ? 0.28 : 0.0;
  const screenAnchor: Vec2 = {
    x: infCenter.x * (1 - screenLead) + battleDest.x * screenLead,
    y: infCenter.y * (1 - screenLead) + battleDest.y * screenLead,
  };

  const baseRangedRear: Vec2 = hasMeleeScreen
    ? {
        x: screenAnchor.x - fwdX * RANGED_BEHIND_SCREEN_DIST,
        y: screenAnchor.y - fwdY * RANGED_BEHIND_SCREEN_DIST,
      }
    : screenAnchor;
  const baseArtilleryRear: Vec2 = hasMeleeScreen
    ? {
        x: screenAnchor.x - fwdX * ARTILLERY_BEHIND_SCREEN_DIST,
        y: screenAnchor.y - fwdY * ARTILLERY_BEHIND_SCREEN_DIST,
      }
    : {
        x: screenAnchor.x - fwdX * 42,
        y: screenAnchor.y - fwdY * 42,
      };

  // --------------------------------------------------------------------------
  // BƯỚC 2: TUYỆT KỸ DANH TƯỚNG & ĐẤU TƯỚNG (ƯU TIÊN NGÂN SÁCH LỆNH SỐ 1)
  // --------------------------------------------------------------------------
  const duelingInitiatedIds = evaluateGeneralSkillsAndDuels(
    roles.generals,
    alliedActive,
    roles.ranged.length + roles.artillery.length,
    enemy,
    romanceMode,
    emit,
  );

  // --------------------------------------------------------------------------
  // BƯỚC 2.5: HỎA TIỄN ĐỐT RỪNG & ĐẠO CỤ CHIẾN TRƯỜNG (`fireArrows`, `stakes`, `oil`, `caltrops`)
  // --------------------------------------------------------------------------
  evaluateFireArrowsAndFortifications(
    team,
    map,
    roles,
    enemy,
    screenAnchor,
    baseRangedRear,
    fwdX,
    fwdY,
    battleFacing,
    difficulty,
    opts,
    emit,
  );

  // --------------------------------------------------------------------------
  // BƯỚC 3: BIẾN HÓA TRẬN HÌNH THÔNG MINH (GOM NHÓM LỆNH SET_FORMATION)
  // --------------------------------------------------------------------------
  const formationBuckets = new Map<TwFormation, number[]>();
  const queueFormation = (reg: TwSimRegiment, desired: TwFormation): void => {
    if (reg.formation === desired || !canUseFormation(reg, desired)) return;
    let bucket = formationBuckets.get(desired);
    if (!bucket) {
      bucket = [];
      formationBuckets.set(desired, bucket);
    }
    bucket.push(reg.id);
  };

  const bracingPolearmIds: number[] = [];

  // 3.1 Bộ binh Trường Thương / Kích (`polearms`) -> Thương Lâm (`spearwall`) khi kỵ binh địch trong 320
  for (let i = 0; i < roles.polearms.length; i++) {
    const p = roles.polearms[i];
    const { target: nearCav, dist: cavDist } = findNearestEnemyCavalry(p, enemy);

    if (nearCav && cavDist <= SPEARWALL_CAV_ALERT_DIST && canUseFormation(p, 'spearwall')) {
      queueFormation(p, 'spearwall');
      // Kỵ binh địch đã vào tầm xung phong <= 235: ghìm chân đứng trụ để tích `bracedTicks` phản sát thương húc!
      if (cavDist <= SPEARWALL_CAV_BRACE_DIST && p.engagedWithId === undefined) {
        bracingPolearmIds.push(p.id);
      }
    } else if (p.formation === 'spearwall' && cavDist > SPEARWALL_RELAX_DIST) {
      queueFormation(p, 'line');
    } else if (!canUseFormation(p, 'spearwall')) {
      // Dân binh trường kích (ji_militia) giãn Tản Trận nếu bị pháo/cung bắn rát từ xa
      const underFire = isRegimentUnderRangedThreat(p, enemy, 25);
      const { dist: nearEnemyD } = findNearestEnemy(p.x, p.y, enemy.visibleActive);
      if (underFire && nearEnemyD > 210 && canUseFormation(p, 'loose')) {
        queueFormation(p, 'loose');
      } else if (p.formation === 'loose' && (!underFire || nearEnemyD <= 185)) {
        queueFormation(p, 'line');
      }
    }
  }

  // 3.2 Bộ binh Đao Kiếm Khiên (`swords`) -> Thuẫn Tường (`shieldwall`) khi chịu hỏa lực tầm xa
  for (let i = 0; i < roles.swords.length; i++) {
    const sw = roles.swords[i];
    const underFire = isRegimentUnderRangedThreat(sw, enemy, 35);
    const stillUnderFireRelax = isRegimentUnderRangedThreat(sw, enemy, 75);

    if (underFire && canUseFormation(sw, 'shieldwall')) {
      queueFormation(sw, 'shieldwall');
    } else if (sw.formation === 'shieldwall' && !stillUnderFireRelax && sw.engagedWithId === undefined) {
      queueFormation(sw, 'line');
    } else if (!canUseFormation(sw, 'shieldwall')) {
      const { dist: nearEnemyD } = findNearestEnemy(sw.x, sw.y, enemy.visibleActive);
      if (underFire && nearEnemyD > 210 && canUseFormation(sw, 'loose')) {
        queueFormation(sw, 'loose');
      } else if (sw.formation === 'loose' && (!underFire || nearEnemyD <= 185)) {
        queueFormation(sw, 'line');
      }
    }
  }

  // 3.3 Cung Nỏ & Pháo Đá: bật Tự Động Bắn (`fire_at_will`) & Tản Trận khi đấu tên tầm xa
  const enableFireAtWillIds: number[] = [];
  const enableSkirmishIds: number[] = [];
  const disableSkirmishIds: number[] = [];

  for (let i = 0; i < roles.ranged.length; i++) {
    const r = roles.ranged[i];
    if (!r.fireAtWill) enableFireAtWillIds.push(r.id);
    if (r.ammo > 0 && !r.skirmishMode) enableSkirmishIds.push(r.id);
    if (r.ammo <= 0 && r.skirmishMode) disableSkirmishIds.push(r.id);

    const { dist: nearMeleeD } = findNearestEnemy(
      r.x,
      r.y,
      [...enemy.infantry, ...enemy.cavalry, ...enemy.generals],
    );
    const underCounterBattery = isRegimentUnderRangedThreat(r, enemy, 25);
    if (underCounterBattery && nearMeleeD > 230 && canUseFormation(r, 'loose')) {
      queueFormation(r, 'loose');
    } else if (r.formation === 'loose' && (!underCounterBattery || nearMeleeD <= 190)) {
      queueFormation(r, 'line');
    }
  }

  for (let i = 0; i < roles.artillery.length; i++) {
    const art = roles.artillery[i];
    if (!art.fireAtWill) enableFireAtWillIds.push(art.id);
    if (art.skirmishMode) disableSkirmishIds.push(art.id);
  }

  if (enableFireAtWillIds.length > 0) {
    emit({ t: 'toggle_stance', regIds: enableFireAtWillIds, stance: 'fire_at_will', value: true });
  }
  if (enableSkirmishIds.length > 0) {
    emit({ t: 'toggle_stance', regIds: enableSkirmishIds, stance: 'skirmish', value: true });
  }
  if (disableSkirmishIds.length > 0) {
    emit({ t: 'toggle_stance', regIds: disableSkirmishIds, stance: 'skirmish', value: false });
  }

  // --------------------------------------------------------------------------
  // BƯỚC 4: ĐIỀU PHỐI TUYẾN BỘ BINH CHỦ LỰC (`polearms` + `swords`)
  // --------------------------------------------------------------------------
  const haltForBraceIds: number[] = [];
  for (let i = 0; i < bracingPolearmIds.length; i++) {
    const id = bracingPolearmIds[i];
    const reg = roles.polearms.find((r) => r.id === id);
    if (reg && (reg.moveTargetX !== undefined || reg.lockedTargetId !== undefined)) {
      haltForBraceIds.push(id);
    }
  }
  if (haltForBraceIds.length > 0) {
    emit({ t: 'halt', regIds: haltForBraceIds });
  }

  const bracingSet = new Set<number>(bracingPolearmIds);
  const marchingInfantry: TwSimRegiment[] = [];
  const meleeTargetBuckets = new Map<number, number[]>();

  // Thê đội Dự Bị Chiến Thuật (Tactical Reserve Echelon — chống đánh cục / bảo vệ hậu phương Cung Pháo):
  // Giữ 1 trung đoàn bộ binh (ưu tiên Trường Thương nếu địch có kỵ binh) lùi 125u bọc lót Cung/Pháo!
  let reserveReg: TwSimRegiment | undefined;
  if (
    difficulty !== 'easy' &&
    meleeInfantry.length >= 4 &&
    activeRanged.length + activeArtillery.length > 0
  ) {
    const reservePool =
      enemy.cavalry.length > 0 && roles.polearms.length > 0 ? roles.polearms : meleeInfantry;
    for (let i = reservePool.length - 1; i >= 0; i--) {
      const cand = reservePool[i];
      if (!bracingSet.has(cand.id) && cand.engagedWithId === undefined) {
        reserveReg = cand;
        break;
      }
    }
  }

  for (let i = 0; i < meleeInfantry.length; i++) {
    const inf = meleeInfantry[i];
    if (bracingSet.has(inf.id) || (reserveReg && inf.id === reserveReg.id)) continue;

    if (hasVisibleEnemies) {
      const isPolearm = TW_UNITS[inf.kind].category === 'infantry_polearm';
      const { target: nearCav, dist: cavDist } = findNearestEnemyCavalry(inf, enemy);

      // Trường thương chủ động đâm chặn kỵ binh địch lảng vảng rất gần (< 165)
      if (isPolearm && nearCav && cavDist <= 165) {
        if (inf.lockedTargetId !== nearCav.id) {
          const list = meleeTargetBuckets.get(nearCav.id) ?? [];
          list.push(inf.id);
          meleeTargetBuckets.set(nearCav.id, list);
        }
        continue;
      }

      // Khi đã áp sát chiến tuyến địch (<= 215 đơn vị), khóa mục tiêu đối diện để phát động Charge!
      const frontlinePool =
        enemy.infantry.length > 0 ? enemy.infantry : enemy.visibleActive;
      const { target: nearFoe, dist: foeDist } = findNearestEnemy(inf.x, inf.y, frontlinePool);
      if (nearFoe && foeDist <= 215) {
        if (inf.engagedWithId === undefined && inf.lockedTargetId !== nearFoe.id) {
          const list = meleeTargetBuckets.get(nearFoe.id) ?? [];
          list.push(inf.id);
          meleeTargetBuckets.set(nearFoe.id, list);
        }
        continue;
      }
    }

    if (inf.engagedWithId === undefined) {
      marchingInfantry.push(inf);
    }
  }

  // Điều hành Thê đội Dự Bị: nếu có kỵ binh / bộ binh địch thọc hậu Cung Pháo (<= 295u) -> lập tức lao ra chặn đánh!
  if (reserveReg) {
    const { target: rearFlanker, dist: flankerDist } = findNearestEnemy(
      baseRangedRear.x,
      baseRangedRear.y,
      enemy.visibleActive,
    );
    if (rearFlanker && flankerDist <= 295) {
      if (reserveReg.lockedTargetId !== rearFlanker.id) {
        const list = meleeTargetBuckets.get(rearFlanker.id) ?? [];
        list.push(reserveReg.id);
        meleeTargetBuckets.set(rearFlanker.id, list);
      }
    } else {
      const reserveAnchor = shiftOutOfActiveFires(
        map,
        clampToBattlefield(
          map,
          baseRangedRear.x + fwdX * 36,
          baseRangedRear.y + fwdY * 36,
          80,
        ),
        opts?.fires,
        latX,
        latY,
        fwdX,
        fwdY,
      );
      if (shouldIssueGroupMove([reserveReg], reserveAnchor.x, reserveAnchor.y, battleFacing, 38)) {
        emit({
          t: 'move_line',
          regIds: [reserveReg.id],
          x: reserveAnchor.x,
          y: reserveAnchor.y,
          facing: battleFacing,
          run: reserveReg.fatigue !== 'exhausted',
        });
      }
    }
  }

  // Cộng thêm cung thủ đã bắn hết sạch tên vào lực lượng giữ đất nếu cần
  for (let i = 0; i < roles.ranged.length; i++) {
    const r = roles.ranged[i];
    if (r.ammo <= 0 && r.engagedWithId === undefined) {
      marchingInfantry.push(r);
    }
  }

  for (const [targetId, regIds] of meleeTargetBuckets.entries()) {
    emit({ t: 'attack_target', regIds, targetRegId: targetId });
  }

  if (marchingInfantry.length > 0) {
    const avgFatigueExhausted = marchingInfantry.some(
      (r) => r.fatigue === 'exhausted' || r.fatigue === 'winded',
    );
    const distLine = distBetween(infCenter.x, infCenter.y, battleDest.x, battleDest.y);
    const shouldRun = !avgFatigueExhausted && distLine > 160;

    if (shouldIssueGroupMove(marchingInfantry, battleDest.x, battleDest.y, battleFacing)) {
      emit({
        t: 'move_line',
        regIds: marchingInfantry.map((r) => r.id),
        x: battleDest.x,
        y: battleDest.y,
        facing: battleFacing,
        run: shouldRun,
      });
    }
  }

  // --------------------------------------------------------------------------
  // BƯỚC 5: CUNG NỎ & PHÁO ĐÁ (`140–220` SAU LƯNG BỘ BINH + ĐỒI CAO 'RIDGE' + DỒN BẮN)
  // --------------------------------------------------------------------------
  if (activeRanged.length > 0) {
    const rangedCenter = computeCentroid(activeRanged, baseRangedRear);
    const rawRangedAnchor = resolveHighGroundSupportAnchor(
      map,
      baseRangedRear,
      rangedCenter,
      screenAnchor,
      fwdX,
      fwdY,
      enemy,
    );
    let rangedAnchor = shiftOutOfActiveFires(
      map,
      rawRangedAnchor,
      opts?.fires,
      latX,
      latY,
      fwdX,
      fwdY,
    );

    // Giả Bại Nhử Địch (Feigned Retreat): nếu địch áp sát Cung Nỏ (<= 225u) mà ta có Chông Gỗ hoặc Thương Lâm trụ sẵn,
    // kéo Cung Nỏ lùi đúng sau lưng Chông Gỗ / Thương Lâm để dụ địch lao đầu vào bẫy!
    const { dist: pressureDist } = findNearestEnemy(
      rangedCenter.x,
      rangedCenter.y,
      [...enemy.cavalry, ...enemy.infantry],
    );
    if (pressureDist <= 225) {
      const friendlyStakes = (opts?.deployables ?? []).find(
        (d) => d.team === team && (d.kind === 'stakes' || d.kind === 'caltrops') && distBetween(d.x, d.y, rangedCenter.x, rangedCenter.y) <= 260,
      );
      if (friendlyStakes) {
        rangedAnchor = shiftOutOfActiveFires(
          map,
          clampToBattlefield(
            map,
            friendlyStakes.x - fwdX * 92,
            friendlyStakes.y - fwdY * 92,
            80,
          ),
          opts?.fires,
          latX,
          latY,
          fwdX,
          fwdY,
        );
      }
    }

    const rangedFocusBuckets = new Map<number, number[]>();
    const repositionRanged: TwSimRegiment[] = [];

    for (let i = 0; i < activeRanged.length; i++) {
      const r = activeRanged[i];
      const relAhead = (r.x - screenAnchor.x) * fwdX + (r.y - screenAnchor.y) * fwdY;
      const inBurningZone = (opts?.fires ?? []).some(
        (f) => distBetween(r.x, r.y, f.x, f.y) < f.radius + 32,
      );
      const exposedInFront =
        inBurningZone || (meleeInfantry.length > 0 && hasVisibleEnemies && relAhead > 25);
      const focusTarget = exposedInFront
        ? undefined
        : pickBestRangedFocusTarget(r, enemy, false);

      // Nếu có đồi cao chưa lên tới nơi và không bị địch áp sát, ưu tiên chiếm lĩnh đồi cao trước
      const distToAnchor = distBetween(r.x, r.y, rangedAnchor.x, rangedAnchor.y);
      const anchorIsHighGround =
        !r.onHighGround &&
        distBetween(rangedAnchor.x, rangedAnchor.y, baseRangedRear.x, baseRangedRear.y) > 25 &&
        distToAnchor > 55;

      if (focusTarget && !anchorIsHighGround) {
        if (r.lockedTargetId !== focusTarget.id) {
          const list = rangedFocusBuckets.get(focusTarget.id) ?? [];
          list.push(r.id);
          rangedFocusBuckets.set(focusTarget.id, list);
        }
      } else {
        repositionRanged.push(r);
      }
    }

    for (const [targetId, regIds] of rangedFocusBuckets.entries()) {
      emit({ t: 'attack_target', regIds, targetRegId: targetId });
    }

    if (
      repositionRanged.length > 0 &&
      shouldIssueGroupMove(repositionRanged, rangedAnchor.x, rangedAnchor.y, battleFacing, 38)
    ) {
      emit({
        t: 'move_line',
        regIds: repositionRanged.map((r) => r.id),
        x: rangedAnchor.x,
        y: rangedAnchor.y,
        facing: battleFacing,
        run: repositionRanged.every((r) => r.fatigue !== 'exhausted'),
      });
    }
  }

  if (activeArtillery.length > 0) {
    const artCenter = computeCentroid(activeArtillery, baseArtilleryRear);
    const artAnchor = shiftOutOfActiveFires(
      map,
      resolveHighGroundSupportAnchor(
        map,
        baseArtilleryRear,
        artCenter,
        screenAnchor,
        fwdX,
        fwdY,
        enemy,
      ),
      opts?.fires,
      latX,
      latY,
      fwdX,
      fwdY,
    );

    const artFocusBuckets = new Map<number, number[]>();
    const repositionArt: TwSimRegiment[] = [];

    for (let i = 0; i < activeArtillery.length; i++) {
      const art = activeArtillery[i];
      const focusTarget = pickBestRangedFocusTarget(art, enemy, true);
      if (focusTarget) {
        if (art.lockedTargetId !== focusTarget.id) {
          const list = artFocusBuckets.get(focusTarget.id) ?? [];
          list.push(art.id);
          artFocusBuckets.set(focusTarget.id, list);
        }
      } else {
        repositionArt.push(art);
      }
    }

    for (const [targetId, regIds] of artFocusBuckets.entries()) {
      emit({ t: 'attack_target', regIds, targetRegId: targetId });
    }

    if (
      repositionArt.length > 0 &&
      shouldIssueGroupMove(repositionArt, artAnchor.x, artAnchor.y, battleFacing, 42)
    ) {
      emit({
        t: 'move_line',
        regIds: repositionArt.map((r) => r.id),
        x: artAnchor.x,
        y: artAnchor.y,
        facing: battleFacing,
        run: false,
      });
    }
  }

  // --------------------------------------------------------------------------
  // BƯỚC 6: KỴ BINH LƯỠNG DỰC BỌC SƯỜN & PHỤC KÍCH RỪNG THÔNG ('FOREST')
  // --------------------------------------------------------------------------
  if (roles.cavalry.length > 0) {
    if (!hasVisibleEnemies) {
      // Toàn bộ quân địch đang ẩn nấp hoặc chưa lộ diện -> tung kỵ binh tuần tiễu Đài Hiệu Lệnh phụ & bìa rừng
      const scoutTargets: Vec2[] = [...secondaryCaps, primaryCap];
      for (let i = 0; i < map.terrainZones.length; i++) {
        const z = map.terrainZones[i];
        if (z.kind === 'forest') {
          scoutTargets.push({ x: z.x, y: z.y });
        }
      }

      for (let i = 0; i < roles.cavalry.length; i++) {
        const cav = roles.cavalry[i];
        if (cav.formation !== 'line') queueFormation(cav, 'line');
        const dest = clampToBattlefield(
          map,
          scoutTargets[i % scoutTargets.length].x,
          scoutTargets[i % scoutTargets.length].y,
          85,
        );
        const scoutFacing = Math.atan2(dest.y - cav.y, dest.x - cav.x);
        if (shouldIssueGroupMove([cav], dest.x, dest.y, scoutFacing, 48)) {
          emit({
            t: 'move_line',
            regIds: [cav.id],
            x: dest.x,
            y: dest.y,
            facing: scoutFacing,
            run: cav.fatigue !== 'exhausted',
          });
        }
      }
    } else {
      const leftForest = findFlankForestAmbushZone(
        map,
        infCenter,
        enemyMainCenter,
        fwdX,
        fwdY,
        latX,
        latY,
        -1,
      );
      const rightForest = findFlankForestAmbushZone(
        map,
        infCenter,
        enemyMainCenter,
        fwdX,
        fwdY,
        latX,
        latY,
        1,
      );

      // Phân bổ kỵ binh ra hai cánh Trái (-1) và Phải (+1), ưu tiên cánh có Rừng Thông phục kích!
      const sortedCav = [...roles.cavalry].sort((a, b) => {
        const pa = (a.x - infCenter.x) * latX + (a.y - infCenter.y) * latY;
        const pb = (b.x - infCenter.x) * latX + (b.y - infCenter.y) * latY;
        return pa - pb;
      });

      const leftWing: TwSimRegiment[] = [];
      const rightWing: TwSimRegiment[] = [];

      if (sortedCav.length === 1) {
        if (leftForest && !rightForest) {
          leftWing.push(sortedCav[0]);
        } else if (rightForest && !leftForest) {
          rightWing.push(sortedCav[0]);
        } else {
          const latProj =
            (sortedCav[0].x - infCenter.x) * latX + (sortedCav[0].y - infCenter.y) * latY;
          if (latProj <= 0) leftWing.push(sortedCav[0]);
          else rightWing.push(sortedCav[0]);
        }
      } else {
        const splitIdx = Math.ceil(sortedCav.length * 0.5);
        for (let i = 0; i < sortedCav.length; i++) {
          if (i < splitIdx) leftWing.push(sortedCav[i]);
          else rightWing.push(sortedCav[i]);
        }
      }

      const commandCavalryWing = (
        wing: TwSimRegiment[],
        flankSign: -1 | 1,
        forestAmbush: { zone: TwTerrainZone; waypoint: Vec2 } | undefined,
      ): void => {
        if (wing.length === 0) return;

        // Tách riêng xung kỵ đang sa lầy trước trường thương địch để rút ra lấy đà Cycle-Charge
        const activeWing: TwSimRegiment[] = [];
        for (let i = 0; i < wing.length; i++) {
          const cav = wing[i];
          const isShock = TW_UNITS[cav.kind].category === 'cavalry_shock';
          if (isShock && cav.engagedWithId !== undefined && cav.chargeTicks === 0) {
            const engagedFoe = enemy.visibleActive.find((e) => e.id === cav.engagedWithId);
            if (engagedFoe && !engagedFoe.isGeneral && TW_UNITS[engagedFoe.kind].antiCavalryBonus >= 18) {
              queueFormation(cav, 'line');
              const retreatPt = clampToBattlefield(
                map,
                cav.x - fwdX * 190 + latX * flankSign * 140,
                cav.y - fwdY * 190 + latY * flankSign * 140,
                80,
              );
              const retreatFace = Math.atan2(retreatPt.y - cav.y, retreatPt.x - cav.x);
              emit({
                t: 'move_line',
                regIds: [cav.id],
                x: retreatPt.x,
                y: retreatPt.y,
                facing: retreatFace,
                run: true,
              });
              continue;
            }
          }
          activeWing.push(cav);
        }
        if (activeWing.length === 0) return;

        const wingCenter = computeCentroid(activeWing, infCenter);
        const strikeTarget = pickCavalryStrikeTarget(wingCenter, baseRangedRear, enemy);

        const relEnemyFwd =
          (wingCenter.x - enemyMainCenter.x) * fwdX + (wingCenter.y - enemyMainCenter.y) * fwdY;
        const relEnemyLat =
          ((wingCenter.x - enemyMainCenter.x) * latX +
            (wingCenter.y - enemyMainCenter.y) * latY) *
          flankSign;

        const defendingOwnRear =
          strikeTarget !== undefined &&
          distBetween(strikeTarget.x, strikeTarget.y, baseRangedRear.x, baseRangedRear.y) < 300;

        const blockedBySpears =
          strikeTarget !== undefined &&
          !defendingOwnRear &&
          doesPathCrossEnemySpearFront(activeWing[0], strikeTarget, enemy);

        const distToStrike = strikeTarget
          ? distBetween(wingCenter.x, wingCenter.y, strikeTarget.x, strikeTarget.y)
          : Infinity;

        // Điều kiện đã luồn ra sau cánh hoặc sườn hở để phát lệnh Xung Kích!
        const readyToStrike =
          strikeTarget !== undefined &&
          (defendingOwnRear ||
            (!blockedBySpears &&
              (distToStrike <= 340 || (relEnemyLat >= 220 && relEnemyFwd >= -95))));

        if (readyToStrike && strikeTarget) {
          for (let i = 0; i < activeWing.length; i++) {
            const cav = activeWing[i];
            const isShock = TW_UNITS[cav.kind].category === 'cavalry_shock';
            const dTarget = distBetween(cav.x, cav.y, strikeTarget.x, strikeTarget.y);
            if (isShock && dTarget <= WEDGE_CHARGE_STAGE_DIST && canUseFormation(cav, 'wedge')) {
              queueFormation(cav, 'wedge');
            }
          }

          const needLock = activeWing.filter((c) => c.lockedTargetId !== strikeTarget.id);
          if (needLock.length > 0) {
            emit({
              t: 'attack_target',
              regIds: needLock.map((c) => c.id),
              targetRegId: strikeTarget.id,
            });
          }
          return;
        }

        // Chưa vào thế đánh bọc hậu -> hành quân vòng rộng qua Rừng Thông phục kích (nếu có) rồi vòng sau lưng địch
        for (let i = 0; i < activeWing.length; i++) {
          const cav = activeWing[i];
          if (cav.formation === 'wedge') queueFormation(cav, 'line');
        }

        let waypoint: Vec2;
        if (forestAmbush) {
          const progressPastForest =
            (wingCenter.x - forestAmbush.waypoint.x) * fwdX +
            (wingCenter.y - forestAmbush.waypoint.y) * fwdY;
          if (progressPastForest < 75 && distBetween(wingCenter.x, wingCenter.y, forestAmbush.waypoint.x, forestAmbush.waypoint.y) > 95) {
            waypoint = forestAmbush.waypoint;
          } else {
            waypoint = clampToBattlefield(
              map,
              enemyMainCenter.x + fwdX * 110 + latX * flankSign * CAVALRY_FLANK_OFFSET_MAX,
              enemyMainCenter.y + fwdY * 110 + latY * flankSign * CAVALRY_FLANK_OFFSET_MAX,
              85,
            );
          }
        } else {
          const flankDist =
            relEnemyFwd < -120 ? CAVALRY_FLANK_OFFSET_MIN : CAVALRY_FLANK_OFFSET_MAX;
          waypoint = clampToBattlefield(
            map,
            enemyMainCenter.x + fwdX * 95 + latX * flankSign * flankDist,
            enemyMainCenter.y + fwdY * 95 + latY * flankSign * flankDist,
            85,
          );
        }

        const flankFacing = strikeTarget
          ? Math.atan2(strikeTarget.y - waypoint.y, strikeTarget.x - waypoint.x)
          : battleFacing;

        if (shouldIssueGroupMove(activeWing, waypoint.x, waypoint.y, flankFacing, 42)) {
          emit({
            t: 'move_line',
            regIds: activeWing.map((c) => c.id),
            x: waypoint.x,
            y: waypoint.y,
            facing: flankFacing,
            run: activeWing.every((c) => c.fatigue !== 'exhausted'),
          });
        }
      };

      commandCavalryWing(leftWing, -1, leftForest);
      commandCavalryWing(rightWing, 1, rightForest);
    }
  }

  // Phát toàn bộ lệnh đổi trận hình đã gom nhóm (bao gồm cả Phong Thỉ Chùy của Kỵ Binh)
  for (const [formation, regIds] of formationBuckets.entries()) {
    if (regIds.length > 0) {
      emit({ t: 'set_formation', regIds, formation });
    }
  }

  // --------------------------------------------------------------------------
  // BƯỚC 7: ĐIỀU ĐỘNG VỊ TRÍ DANH TƯỚNG THEO NGŨ HÀNH Hào Quang (WU XING AURA)
  // --------------------------------------------------------------------------
  const supportRegs = [...activeRanged, ...activeArtillery];
  const supportCenter =
    supportRegs.length > 0 ? computeCentroid(supportRegs, baseRangedRear) : baseRangedRear;

  for (let i = 0; i < roles.generals.length; i++) {
    const gen = roles.generals[i];
    if (duelingInitiatedIds.has(gen.id)) continue;

    const genSpec = gen.generalId ? TW_GENERALS[gen.generalId] : undefined;
    const gClass = genSpec?.class ?? 'commander';

    if (gClass === 'strategist') {
      // Thủy Mưu Sĩ (Gia Cát Lượng, Chu Du): luôn đứng cạnh Cung Nỏ & Pháo Đá để cộng +20% đạn & +12% tốc bắn
      const stratPos = clampToBattlefield(
        map,
        supportCenter.x - fwdX * 18,
        supportCenter.y - fwdY * 18,
        75,
      );
      if (shouldIssueGroupMove([gen], stratPos.x, stratPos.y, battleFacing, 36)) {
        emit({
          t: 'move_line',
          regIds: [gen.id],
          x: stratPos.x,
          y: stratPos.y,
          facing: battleFacing,
          run: gen.fatigue !== 'exhausted',
        });
      }
      continue;
    }

    if (gClass === 'commander') {
      // Thổ Thống Soái (Tào Tháo, Lưu Bị, Viên Thiệu): bọc lót sát sau trung quân (+14 Sĩ khí hào quang 245)
      if (hasVisibleEnemies) {
        const { target: closeThreat, dist: threatD } = findNearestEnemy(
          gen.x,
          gen.y,
          enemy.visibleActive,
        );
        if (closeThreat && threatD <= 135 && gen.hp > gen.maxHp * 0.45) {
          if (gen.lockedTargetId !== closeThreat.id && gen.engagedWithId === undefined) {
            emit({ t: 'attack_target', regIds: [gen.id], targetRegId: closeThreat.id });
          }
          continue;
        }
      }
      const cmdOffset = hasMeleeScreen ? 65 : 0;
      const cmdAnchor = clampToBattlefield(
        map,
        screenAnchor.x - fwdX * cmdOffset,
        screenAnchor.y - fwdY * cmdOffset,
        75,
      );
      if (shouldIssueGroupMove([gen], cmdAnchor.x, cmdAnchor.y, battleFacing, 38)) {
        emit({
          t: 'move_line',
          regIds: [gen.id],
          x: cmdAnchor.x,
          y: cmdAnchor.y,
          facing: battleFacing,
          run: gen.fatigue !== 'exhausted',
        });
      }
      continue;
    }

    // Hỏa Tiên Phong, Mộc Dũng Tướng, Kim Hộ Vệ: dẫn đầu trận tiền!
    if (hasVisibleEnemies && gen.hp > gen.maxHp * 0.32) {
      const frontlinePool =
        enemy.infantry.length + enemy.generals.length > 0
          ? [...enemy.infantry, ...enemy.generals]
          : enemy.visibleActive;
      const { target: foe, dist: foeDist } = findNearestEnemy(gen.x, gen.y, frontlinePool);
      const engageThreshold = gClass === 'sentinel' ? 195 : 245;

      if (foe && foeDist <= engageThreshold) {
        if (gen.lockedTargetId !== foe.id && gen.engagedWithId === undefined) {
          emit({ t: 'attack_target', regIds: [gen.id], targetRegId: foe.id });
        }
        continue;
      }
    }

    // Hành quân hộ tống trung tâm tuyến bộ binh (Kim Hộ Vệ cộng +15 Thủ & +15% Chắn tên cho toàn hàng đầu)
    const vanguardOffset = gClass === 'sentinel' ? -15 : 18;
    const heroAnchor = clampToBattlefield(
      map,
      battleDest.x + fwdX * vanguardOffset,
      battleDest.y + fwdY * vanguardOffset,
      75,
    );
    if (shouldIssueGroupMove([gen], heroAnchor.x, heroAnchor.y, battleFacing, 38)) {
      emit({
        t: 'move_line',
        regIds: [gen.id],
        x: heroAnchor.x,
        y: heroAnchor.y,
        facing: battleFacing,
        run: gen.fatigue !== 'exhausted',
      });
    }
  }
}
