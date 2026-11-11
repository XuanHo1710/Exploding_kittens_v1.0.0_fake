/**
 * Máy chơi Miragine War (Thập Hùng Tranh Bá).
 * Sử dụng bảng khắc chế 16 loại lính nguyên bản từ Method 481 của Miragine War (MIRAGINE_AI_COUNTERS)
 * và 3 lệnh chỉ huy: Tấn Công Chỉ Định, Phòng Thủ, Tập Kết.
 */
import {
  MIRAGINE_AI_COUNTERS,
  THAP_BASE,
  THAP_MAX_POP,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  type ThapCommand,
  type ThapUnitKind,
} from '../../../../shared/src';
import type { ThapSide, ThapUnit, ThapWorld } from './world';

export interface ThapBrain {
  level: 'easy' | 'normal' | 'hard';
  nextThink: number;
  /** số đợt tấn công đã tung ra */
  waves: number;
  attackTarget: number;
  /** khẩu vị chọn quân riêng của mỗi máy (0..1) */
  mix: number;
  attacking: boolean;
}

const LEVEL = {
  easy: { think: 2.5, counterChance: 0.45 },
  normal: { think: 1.5, counterChance: 0.72 },
  hard: { think: 0.8, counterChance: 0.92 },
};

export function runBot(w: ThapWorld, s: ThapSide) {
  const brain = s.brain!;
  const t = w.elapsed / 1000;
  if (t < brain.nextThink) return;
  const L = LEVEL[brain.level];
  brain.nextThink = t + L.think;
  const cmd = (c: ThapCommand) => {
    s.tokens = Math.max(s.tokens, 2);
    return w.command(s.idx, c);
  };
  const [hx, hy] = w.bases[s.idx];
  const army: ThapUnit[] = [];
  for (const u of w.units.values()) if (u.owner === s.idx) army.push(u);
  const armyPop = army.reduce((n, u) => n + THAP_UNITS[u.kind].pop, 0);

  // 1) Chọn ô lính tự xuất quân tại Cổng Triệu Hồi (door.png) theo bảng khắc chế Method 481 của Miragine War gốc
  if (armyPop < THAP_MAX_POP) {
    const kind = pickUnit(w, s, L.counterChance);
    if (kind && s.auto !== kind) {
      cmd({ t: 'auto', kind });
    }
  }

  // 2) Có toán địch áp sát Pha Lê Chính mà quân nhà đang mỏng: chuyển sang Phòng Thủ
  let threats = 0;
  w.near(hx, hy, 520, (o) => {
    if (o.team !== s.team) threats++;
  });
  if (threats >= 4 && army.length < threats + 2) {
    if (s.stance !== 'defend') cmd({ t: 'stance', stance: 'defend' });
    brain.attacking = false;
    return;
  }

  // 3) Mặc định Tấn Công Chỉ Định vào Căn cứ Pha Lê của đối thủ
  const cur = w.sides[brain.attackTarget];
  if (!brain.attacking || !cur || !cur.alive || cur.team === s.team || s.stance !== 'attack' || s.target !== brain.attackTarget) {
    const target = pickTarget(w, s);
    if (target >= 0) {
      if (!brain.attacking) brain.waves++;
      brain.attacking = true;
      brain.attackTarget = target;
      cmd({ t: 'attack', target });
    }
  }
}

function pickUnit(w: ThapWorld, s: ThapSide, counterChance: number): ThapUnitKind {
  const [hx, hy] = w.bases[s.idx];
  const enemy = s.target >= 0 && w.sides[s.target]?.alive ? s.target : w.nearestEnemyBase(s, hx, hy);

  // Ngân sách chọn quân tính theo lượng vàng hiện có hoặc thu nhập mỗi vòng 30s của Miragine War
  const budget = Math.max(s.gold, Math.round(s.roundIncome * 0.65));

  // Nếu đang tích vàng cho Chúa Tể (Dread Lord) hoặc Thánh Chiến Vương (High Lord) khi thu nhập cao
  if (s.auto === 'highlord' && s.roundIncome >= 600 && s.gold < THAP_UNITS.highlord.cost) return 'highlord';
  if (s.auto === 'dreadlord' && s.roundIncome >= 350 && s.gold < THAP_UNITS.dreadlord.cost) return 'dreadlord';

  if ( (s.gold >= THAP_UNITS.highlord.cost || s.roundIncome >= 900) && Math.random() < 0.55) return 'highlord';
  if ( (s.gold >= THAP_UNITS.dreadlord.cost || s.roundIncome >= 480) && Math.random() < 0.5) return 'dreadlord';

  // Khắc chế đạo quân đông nhất của địch theo bảng Method 481 của Miragine War gốc
  if (enemy >= 0 && Math.random() < counterChance) {
    const counts = new Map<ThapUnitKind, number>();
    for (const u of w.units.values()) if (u.owner === enemy) counts.set(u.kind, (counts.get(u.kind) ?? 0) + THAP_UNITS[u.kind].pop);
    let top: ThapUnitKind | undefined, tn = 0;
    for (const [k, c] of counts) if (c > tn) { tn = c; top = k; }
    if (top) {
      const topId = THAP_UNITS[top].id;
      const counterIds = MIRAGINE_AI_COUNTERS[topId] ?? [4, 7, 8];
      const affordable = counterIds
        .map((id) => THAP_UNIT_KINDS[id])
        .filter((k) => k && THAP_UNITS[k].cost <= budget);
      if (affordable.length) {
        const idx = Math.min(affordable.length - 1, Math.floor(Math.random() * affordable.length));
        return affordable[idx];
      }
    }
  }

  // Chọn quân chủ lực theo ngưỡng thu nhập vòng của Miragine War
  const pool: ThapUnitKind[] =
    budget >= 220
      ? ['ironknight', 'mage', 'immortal', 'cavalry', 'vampire', 'monk']
      : budget >= 100
        ? ['cavalry', 'vampire', 'monk', 'heavysword', 'ninja', 'novice', 'swordman']
        : ['heavysword', 'ninja', 'novice', 'swordman', 'samurai', 'zombie', 'veteran', 'newbie'];
  const affordable = pool.filter((k) => THAP_UNITS[k].cost <= budget);
  if (affordable.length) {
    return affordable[Math.floor((Math.random() * 0.7 + s.brain!.mix * 0.3) * affordable.length) % affordable.length];
  }
  return 'newbie';
}

function pickTarget(w: ThapWorld, s: ThapSide): number {
  const [hx, hy] = w.bases[s.idx];
  let best = -1, bd = Infinity;
  for (const o of w.sides) {
    if (!o.alive || o.team === s.team) continue;
    const [bx, by] = w.bases[o.idx];
    let d = Math.hypot(bx - hx, by - hy);
    if (s.brain!.level === 'hard') d *= 0.5 + (o.baseHp / THAP_BASE.hp) * 0.5;
    if (d < bd) { bd = d; best = o.idx; }
  }
  return best;
}
