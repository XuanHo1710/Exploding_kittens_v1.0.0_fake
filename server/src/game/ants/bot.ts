/**
 * Máy chơi Đế Chế Kiến. Nghĩ vài lần mỗi giây, ra lệnh qua đúng API như người (không gian lận vàng).
 * Dễ: ít quân, đánh muộn. Thường: cân bằng. Khó: gọi quân liên tục, đánh sớm, đông quân.
 */
import { ANT_UNITS, UNIT_KINDS, type AntUnitKind } from '../../../../shared/src';
import type { AntWorld, Empire, Tower, Unit } from './world';

export interface BotBrain {
  level: 'easy' | 'normal' | 'hard';
  waves: number;
  nextThink: number;
  attackTarget: number;
  /** khẩu vị chọn quân riêng của mỗi máy */
  mix: number;
}

const LEVEL = {
  easy: { think: 2.5, firstAttack: 300, wave: 8, waveGrow: 3, maxWave: 24, keepGold: 120, queue: 2 },
  normal: { think: 1.2, firstAttack: 200, wave: 12, waveGrow: 4, maxWave: 40, keepGold: 0, queue: 4 },
  hard: { think: 0.5, firstAttack: 150, wave: 14, waveGrow: 5, maxWave: 46, keepGold: 0, queue: 6 },
};

export function runBot(w: AntWorld, e: Empire) {
  const brain = e.brain!;
  const t = w.elapsed / 1000;
  if (t < brain.nextThink) return;
  const L = LEVEL[brain.level];
  brain.nextThink = t + L.think;

  const main = w.towers.get(e.mainId);
  if (!main) return;
  const army: Unit[] = [];
  for (const u of w.units.values()) if (u.owner === e.idx) army.push(u);
  const mine: Tower[] = [];
  for (const tw of w.towers.values()) if (tw.owner === e.idx) mine.push(tw);
  const cmd = (c: Parameters<AntWorld['command']>[1]) => {
    e.tokens = Math.max(e.tokens, 2);
    w.command(e.idx, c);
  };

  // 1) Gọi quân: giữ vài con trong hàng chờ khi có vàng (giàu thì gọi nhiều hơn)
  const wantQueue = e.gold > 600 ? L.queue + 3 : L.queue;
  const queuedCost = e.queue.filter((q) => !q.paid).reduce((s, q) => s + ANT_UNITS[q.kind].cost, 0);
  if (e.queue.length < wantQueue && e.gold - queuedCost - L.keepGold >= 50) {
    const kind = pickUnit(brain, army, e.gold - queuedCost - L.keepGold);
    if (kind) cmd({ t: 'train', kind });
  }

  // 2) Phòng thủ: chỉ khi có cả toán địch áp sát trụ; dùng quân đang ở nhà, không gọi đoàn đang đi đánh về
  let threat: Unit | undefined;
  let threatCount = 0;
  for (const tw of mine) {
    w.near(tw.x, tw.y, tw.r + 280, (o) => {
      if (o.owner === e.idx) return;
      threatCount++;
      threat ??= o;
    });
  }
  if (threat && threatCount >= 3) {
    const homeGuard = army.filter((u) => u.order.type !== 'attack' && Math.hypot(u.x - main.x, u.y - main.y) < 700);
    if (homeGuard.length) cmd({ t: 'move', ids: homeGuard.map((u) => u.id), x: threat.x, y: threat.y, attack: true });
    if (homeGuard.length >= army.length * 0.7) return;
  }

  // 3) Tấn công theo đợt vào trụ của đế chế gần nhất
  const waveSize = Math.min(L.maxWave, L.wave + brain.waves * L.waveGrow);
  const armyPop = army.reduce((s, u) => s + ANT_UNITS[u.kind].pop, 0);
  const home = army.filter((u) => Math.hypot(u.x - main.x, u.y - main.y) < 520);
  if (t > L.firstAttack && armyPop >= waveSize && home.length >= Math.ceil(waveSize * 0.6)) {
    const target = pickTarget(w, e, main);
    if (target) {
      brain.waves++;
      brain.attackTarget = target.id;
      cmd({ t: 'move', ids: home.map((u) => u.id), x: target.x, y: target.y, attack: true });
    }
    return;
  }
  // đoàn quân tới nơi mà trụ địch còn đứng: đánh thẳng vào trụ
  const tgt = w.towers.get(brain.attackTarget);
  if (tgt) {
    const arrived = army.filter((u) => u.order.type === 'idle' && !u.engage && Math.hypot(u.x - tgt.x, u.y - tgt.y) < 320);
    if (arrived.length) cmd({ t: 'target', ids: arrived.map((u) => u.id), target: tgt.id });
  } else if (brain.attackTarget !== -1) {
    // trụ đã đổ: nhắm trụ kế tiếp của đế chế đó
    brain.attackTarget = -1;
    const next = pickTarget(w, e, main);
    const far = army.filter((u) => u.order.type === 'idle' && Math.hypot(u.x - main.x, u.y - main.y) > 600);
    if (next && far.length) {
      brain.attackTarget = next.id;
      cmd({ t: 'move', ids: far.map((u) => u.id), x: next.x, y: next.y, attack: true });
    }
  }
}

function pickUnit(brain: BotBrain, army: Unit[], gold: number): AntUnitKind | undefined {
  const n = (k: AntUnitKind) => army.filter((u) => u.kind === k).length;
  const total = Math.max(1, army.length);
  const want: AntUnitKind[] = [];
  if (gold >= 900 && n('champion') < 2) want.push('champion');
  if (gold >= 700 && n('tank') < 6) want.push('tank');
  if (gold >= 450 && n('champion') < 1 && army.length >= 10 && brain.mix > 0.4) want.push('champion');
  if (n('tank') / total < 0.12 + brain.mix * 0.08 && army.length >= 5) want.push('tank');
  if (n('medic') < Math.floor(army.length / 8)) want.push('medic');
  if (n('shield') / total < 0.15) want.push('shield');
  if (n('spitter') / total < 0.2 + (1 - brain.mix) * 0.1) want.push('spitter');
  if (n('sniper') / total < 0.08) want.push('sniper');
  if (n('bomber') / total < 0.08 && army.length >= 6) want.push('bomber');
  want.push(Math.random() < 0.5 ? 'soldier' : 'fire');
  if (Math.random() < 0.08) want.unshift('flier');
  const affordable = want.filter((k) => ANT_UNITS[k].cost <= gold);
  return affordable[0] ?? (gold >= ANT_UNITS.soldier.cost ? UNIT_KINDS[0] : undefined);
}

/** Trụ địch gần nhất (Trụ Phụ trước, Trụ Chính sau); khó thì ưu tiên đế chế yếu */
function pickTarget(w: AntWorld, e: Empire, main: Tower) {
  let best: Tower | undefined;
  let bd = Infinity;
  for (const tw of w.towers.values()) {
    if (tw.owner === e.idx) continue;
    let d = Math.hypot(tw.x - main.x, tw.y - main.y);
    if (tw.kind === 'main') d += 150;
    if (e.brain!.level === 'hard') d *= 0.6 + (tw.hp / tw.maxHp) * 0.4;
    if (d < bd) { bd = d; best = tw; }
  }
  return best;
}
