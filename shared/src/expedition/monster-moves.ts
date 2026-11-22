/**
 * Bộ 3 đòn tấn công riêng cho từng quái (quái nhỏ + Quái Gác Cổng).
 *
 * Mỗi con có 3 đòn khác nhịp, khác kiểu ra đòn (animation 3D khác nhau), xoay vòng theo tỉ lệ
 * 50% / 30% / 20% và không dùng một đòn quá 2 lượt liên tiếp. Người chơi phải đọc tên đòn + tư thế
 * để canh Đỡ / Né: đòn nhanh 1–2 nhịp, liên kích dồn dập, nhảy bổ trễ nhịp, đòn nhử, đòn diện rộng…
 * Tất định theo id quái (client và server sinh y hệt nhau).
 */

import { EXPEDITION_MONSTERS_BY_ID } from './bestiary';
import type { CombatantRuntime, EnemyAiStyle, EnemyMovePattern } from './types';

export type EnemyAttackAnim = 'lunge' | 'combo' | 'leap' | 'feint' | 'spin' | 'dash' | 'projectile' | 'barrage' | 'slam';

type Archetype = 'jab' | 'combo' | 'leap' | 'feint' | 'sweep' | 'pierce' | 'bolt' | 'barrage' | 'quake' | 'syncopate';

/** Tỉ lệ ra 3 đòn: đòn đặc trưng / đòn thứ hai / đòn hiểm. */
export const MONSTER_MOVE_WEIGHTS = [5, 3, 2] as const;

const POOLS: Record<EnemyAiStyle, readonly Archetype[]> = {
  brute: ['jab', 'leap', 'quake', 'combo', 'syncopate'],
  skirmisher: ['combo', 'feint', 'pierce', 'syncopate', 'jab'],
  caster: ['bolt', 'barrage', 'quake', 'sweep'],
  guardian: ['jab', 'quake', 'sweep', 'leap'],
  beast: ['jab', 'leap', 'pierce', 'combo'],
  swarm: ['jab', 'bolt', 'combo', 'feint'],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Biến thể nhịp theo id để hai con cùng kiểu không đánh giống nhau. */
function archetype(kind: Archetype, v: number): Omit<EnemyMovePattern, 'moveId' | 'weight'> & { anim: EnemyAttackAnim } {
  switch (kind) {
    case 'jab': {
      const beats = [[430], [400, 700], [460, 640]][v % 3];
      return { nameVi: 'Quick Pounce', telegraphVi: `lao tới — ${beats.length} nhịp nhanh!`, targetScope: 'single', hitBeatsMs: beats,
        powerMult: beats.length > 1 ? 1.1 : 1.0, beamStyle: 'slash', aim: 'random', anim: 'lunge' };
    }
    case 'combo': {
      const beats = [[380, 600, 820], [360, 560, 760, 960], [400, 580, 900]][v % 3];
      return { nameVi: 'Rush Combo', telegraphVi: `${beats.length} nhịp dồn dập — giữ nhịp đều tay!`, targetScope: 'single', hitBeatsMs: beats,
        powerMult: 1.35, beamStyle: 'slash', aim: 'lowest_hp', anim: 'combo' };
    }
    case 'syncopate':
      return { nameVi: 'Off-Beat', telegraphVi: 'hai nhát sát nhau rồi khựng lại — nhát cuối trễ!', targetScope: 'single',
        hitBeatsMs: [[400, 560, 1040], [420, 600, 1120]][v % 2], powerMult: 1.4, beamStyle: 'slash', aim: 'random', anim: 'combo' };
    case 'leap':
      return { nameVi: 'Sky Drop', telegraphVi: 'bật nhảy thật cao — nện xuống TRỄ, đừng bấm sớm!', targetScope: 'single',
        hitBeatsMs: [[820], [900]][v % 2], powerMult: 1.6, beamStyle: 'meteor', aim: 'highest_atk', anim: 'leap' };
    case 'feint':
      return { nameVi: 'Feint', telegraphVi: 'nhát đầu chỉ là nhử — đòn thật đến rất trễ!', targetScope: 'single',
        hitBeatsMs: [[420, 1120], [380, 1060]][v % 2], powerMult: 1.45, isDelayedFeint: true, beamStyle: 'slash', aim: 'random', anim: 'feint' };
    case 'sweep':
      return { nameVi: 'Spin Sweep', telegraphVi: 'xoay người quét cả đội — 2 nhịp!', targetScope: 'all',
        hitBeatsMs: [[560, 880], [520, 840]][v % 2], powerMult: 0.85, beamStyle: 'wave', anim: 'spin' };
    case 'pierce':
      return { nameVi: 'Pierce Dash', telegraphVi: 'lùi lấy đà rồi lao xuyên — 2 nhịp sát nhau!', targetScope: 'single',
        hitBeatsMs: [[640, 760], [600, 700]][v % 2], powerMult: 1.4, beamStyle: 'slash', aim: 'lowest_hp', anim: 'dash' };
    case 'bolt':
      return { nameVi: 'Element Shot', telegraphVi: 'tụ năng lượng — 1 phát bắn tầm xa!', targetScope: 'single',
        hitBeatsMs: [[660], [720]][v % 2], powerMult: 1.15, beamStyle: 'ray', aim: 'random', anim: 'projectile',
        applies: [{ status: 'element', stacks: 1, turns: 2, chance: 0.6 }] };
    case 'barrage':
      return { nameVi: 'Element Barrage', telegraphVi: '4 phát liên tiếp — nhịp đều!', targetScope: 'single',
        hitBeatsMs: [480, 680, 880, 1080], powerMult: 1.3, beamStyle: 'ray', aim: 'random', anim: 'barrage' };
    case 'quake':
      return { nameVi: 'Ground Stomp', telegraphVi: 'dậm mạnh — sóng chấn lan cả đội, 1 nhịp nặng!', targetScope: 'all',
        hitBeatsMs: [[760], [700]][v % 2], powerMult: 1.0, beamStyle: 'meteor', anim: 'slam' };
  }
}

const cache = new Map<string, EnemyMovePattern[]>();

/** Vùng bắt đầu có Tuyệt Kỹ (phím W phản đòn). */
export const SPECIAL_FROM_REALM = 3;
/** Trọng số ra Tuyệt Kỹ của quái thường / Gác Cổng (so với 5 / 3 / 2 của ba đòn thường ≈ 17%). */
export const SPECIAL_WEIGHT = 2;
/** Trọng số Tuyệt Kỹ đánh toàn đội của quái thường / Gác Cổng (≈ 8%). */
export const SPECIAL_AOE_WEIGHT = 1;

/** Tuyệt Kỹ diện rộng: đánh TOÀN ĐỘI người chơi; W counter → cả đội phản damage. */
export function monsterAoeSpecialMove(actor: Pick<CombatantRuntime, 'templateId' | 'aiStyle' | 'signatureMove'>): EnemyMovePattern {
  const key = monsterKeyOf(actor.templateId);
  const h = hash(key + ':aoe');
  const ranged = actor.aiStyle === 'caster' || actor.aiStyle === 'swarm';
  return {
    moveId: `${key}_special_aoe`,
    nameVi: `${['Blood Quake', 'Blizzard', 'Meteor Rain', 'Dark Tide'][h % 4]}`,
    telegraphVi: 'TUYỆT KỸ đánh TOÀN ĐỘI — W để counter, cả đội cùng phản damage!',
    targetScope: 'all',
    hitBeatsMs: [[1100], [1180]][h % 2],
    powerMult: actor.signatureMove ? 1.5 : 1.2,
    beamStyle: ranged ? 'wave' : 'meteor',
    weight: SPECIAL_AOE_WEIGHT,
    anim: ranged ? 'projectile' : 'slam',
    specialFrom: 0,
    specialPower: 1.5,
  };
}

/** Tuyệt Kỹ riêng của quái (chỉ W mới phản được). */
export function monsterSpecialMove(actor: Pick<CombatantRuntime, 'templateId' | 'aiStyle' | 'signatureMove' | 'nameVi'>): EnemyMovePattern {
  const key = monsterKeyOf(actor.templateId);
  const h = hash(key + ':sp');
  const elite = Boolean(actor.signatureMove);
  const ranged = actor.aiStyle === 'caster' || actor.aiStyle === 'swarm';
  const beats = elite ? [[620, 1180], [560, 1240]][h % 2] : [[1000], [1080], [940]][h % 3];
  return {
    moveId: `${key}_special`,
    nameVi: `${['Blood Moon', 'Skyfall', 'Void Strike', 'Black Flame', 'Doomsday'][h % 5]}`,
    telegraphVi: elite
      ? 'TUYỆT KỸ — nhát đầu là đòn thường (Đỡ/Né), nhát cuối bấm W để counter!'
      : 'TUYỆT KỸ — Đỡ / Né vô dụng, bấm W để counter!',
    targetScope: 'single',
    hitBeatsMs: beats,
    powerMult: elite ? 2.1 : 1.6,
    beamStyle: ranged ? 'ray' : 'meteor',
    aim: 'highest_atk',
    weight: SPECIAL_WEIGHT,
    anim: ranged ? 'projectile' : elite ? 'combo' : 'leap',
    specialFrom: beats.length - 1,
    specialPower: 1.6,
  };
}

/** id gốc của quái từ templateId (`wild_boar_t2` → `wild_boar`, `meadow_stag_lead` → `meadow_stag`). */
export function monsterKeyOf(templateId: string): string {
  return templateId.replace(/_t\d+$/, '').replace(/_lead$/, '');
}

/** 3 đòn tấn công của quái `actor` (đòn đặc trưng mang tên riêng của con đó). */
export function monsterAttackMoves(actor: Pick<CombatantRuntime, 'templateId' | 'aiStyle' | 'signatureMove'>): EnemyMovePattern[] {
  const key = monsterKeyOf(actor.templateId);
  const style = actor.aiStyle ?? 'brute';
  const cacheKey = `${key}|${style}|${actor.signatureMove?.nameVi ?? ''}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const h = hash(key);
  const pool = [...POOLS[style]];
  // xáo tất định theo id, lấy 3 kiểu khác nhau
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (h >>> (i * 3)) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  const sigName = actor.signatureMove?.nameVi ?? EXPEDITION_MONSTERS_BY_ID[key]?.attackNameVi;
  const moves = picked.map((kind, i): EnemyMovePattern => {
    const base = archetype(kind, (h >>> (i * 5)) & 7);
    const pct = Math.round((MONSTER_MOVE_WEIGHTS[i] / 10) * 100);
    const move: EnemyMovePattern = {
      ...base,
      moveId: `${key}_m${i + 1}_${kind}`,
      weight: MONSTER_MOVE_WEIGHTS[i],
      telegraphVi: `${base.telegraphVi} (tỉ lệ ${pct}%)`,
    };
    if (i === 0 && sigName) {
      move.nameVi = sigName;
      // Gác Cổng giữ nhịp đặc trưng của mình cho đòn số 1
      if (actor.signatureMove && kind !== 'sweep' && kind !== 'quake') {
        move.hitBeatsMs = actor.signatureMove.hitBeatsMs;
        move.powerMult = actor.signatureMove.powerMult;
        if (move.hitBeatsMs.length > 1 && (move.anim === 'leap' || move.anim === 'projectile')) move.anim = 'combo';
        move.telegraphVi = `đòn đặc trưng — ${move.hitBeatsMs.length} nhịp (tỉ lệ ${pct}%)`;
      }
    }
    return move;
  });
  cache.set(cacheKey, moves);
  return moves;
}
