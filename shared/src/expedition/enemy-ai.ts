/**
 * AI theo lượt của quái / Gác Cổng / Đại Trùm (tất định — client và server chọn giống hệt nhau).
 *
 * Mỗi khi tới lượt một kẻ địch, engine gọi `planEnemyIntent` để chốt trước "ý đồ":
 *   đòn nào, đánh ai, có tụ lực không. Client đọc ý đồ này để hiện cảnh báo (telegraph) và
 *   mở cửa sổ Đỡ / Né đúng nhịp; server phát lại dùng đúng ý đồ đó nên không thể gian lận.
 *
 * - Quái thường chọn đòn theo trọng số + điều kiện (máu thấp, đồng minh yếu, chưa buff) + hồi chiêu.
 * - Đòn "tụ lực": lượt 1 gồng (cảnh báo), lượt 2 tung đòn rất mạnh — Phá Thế hoặc Đóng Băng sẽ NGẮT.
 * - Mục tiêu: Khiêu Khích > chính sách của đòn (máu thấp nhất / ATK cao nhất / ngẫu nhiên).
 * - Đại Trùm: xoay vòng bộ chiêu theo giai đoạn, đòn trúng gây trạng thái theo nguyên tố.
 */

import { EXPEDITION_BOSSES_BY_ID, EXPEDITION_REALMS_BY_ID } from './catalog';
import { ELEMENT_STATUS } from './combat-rules';
import { monsterAoeSpecialMove, monsterAttackMoves, monsterSpecialMove, SPECIAL_FROM_REALM } from './monster-moves';
import { Mulberry32 } from './rng';
import type { BattleSessionState, CombatantRuntime, EnemyAiStyle, EnemyIntent, EnemyMovePattern } from './types';

const EL = 'element';

export const ENEMY_MOVE_KITS: Record<EnemyAiStyle, readonly EnemyMovePattern[]> = {
  brute: [
    { moveId: 'brute_smash', nameVi: 'Smash', telegraphVi: 'giơ cao vũ khí — 2 nhịp nặng nề!', targetScope: 'single', hitBeatsMs: [520, 900], powerMult: 1.3, beamStyle: 'slash', weight: 4, aim: 'random' },
    { moveId: 'brute_rampage', nameVi: 'Rampage', telegraphVi: 'đang GỒNG SỨC — lượt sau giáng 3 nhịp cực mạnh! Phá Thế để ngắt!', targetScope: 'single', hitBeatsMs: [420, 760, 1100], powerMult: 2.4, beamStyle: 'meteor', weight: 2, cooldown: 4, charge: true, aim: 'highest_atk' },
    { moveId: 'brute_roar', nameVi: 'War Roar', telegraphVi: 'gầm lên — tăng Cường Lực!', targetScope: 'self', hitBeatsMs: [], powerMult: 0, beamStyle: 'wave', weight: 2, cooldown: 4, when: 'no_buff', selfApplies: [{ status: 'atk_up', stacks: 1, turns: 3 }] },
    { moveId: 'brute_chain', nameVi: '4-Hit Pound', telegraphVi: 'nện liên tiếp, nhịp cuối chậm hơn.', targetScope: 'single', hitBeatsMs: [480, 810, 1140, 1610], powerMult: 1.65, beamStyle: 'slash', weight: 2, cooldown: 3, aim: 'highest_atk' },
  ],
  skirmisher: [
    { moveId: 'skr_flurry', nameVi: 'Rapid Slash', telegraphVi: 'lướt tới chém 3 nhịp nhanh vào kẻ yếu nhất!', targetScope: 'single', hitBeatsMs: [380, 640, 900], powerMult: 1.2, beamStyle: 'slash', weight: 4, aim: 'lowest_hp', applies: [{ status: 'bleed', stacks: 1, turns: 3, chance: 0.7 }] },
    { moveId: 'skr_feint', nameVi: 'Delayed Feint', telegraphVi: 'nhịp đầu là đòn nhử — đòn thật đến trễ!', targetScope: 'single', hitBeatsMs: [420, 1080], powerMult: 1.4, isDelayedFeint: true, beamStyle: 'slash', weight: 2, aim: 'random' },
    { moveId: 'skr_smoke', nameVi: 'Smoke Bomb', telegraphVi: 'tung khói — tăng Gia Tốc!', targetScope: 'self', hitBeatsMs: [], powerMult: 0, beamStyle: 'wave', weight: 1, cooldown: 4, when: 'no_buff', selfApplies: [{ status: 'haste', stacks: 1, turns: 2 }] },
    { moveId: 'skr_chain', nameVi: '5-Hit Slash', telegraphVi: 'bốn nhát nhanh rồi chậm một nhịp.', targetScope: 'single', hitBeatsMs: [425, 710, 995, 1280, 1710], powerMult: 1.55, beamStyle: 'slash', weight: 2, cooldown: 4, aim: 'lowest_hp' },
  ],
  caster: [
    { moveId: 'cst_bolt', nameVi: 'Element Bolt', telegraphVi: 'niệm chú — 1 tia nguyên tố!', targetScope: 'single', hitBeatsMs: [640], powerMult: 1.15, beamStyle: 'ray', weight: 4, aim: 'random', applies: [{ status: EL, stacks: 1, turns: 3 }] },
    { moveId: 'cst_nova', nameVi: 'Element Nova', telegraphVi: 'vòng phép lan toàn đội — 2 nhịp!', targetScope: 'all', hitBeatsMs: [520, 920], powerMult: 0.9, beamStyle: 'wave', weight: 2, cooldown: 2, applies: [{ status: EL, stacks: 1, turns: 2, chance: 0.6 }] },
    { moveId: 'cst_hex', nameVi: 'Curse Mark', telegraphVi: 'khắc ấn nguyền — Phá Giáp & Lộ Sơ Hở!', targetScope: 'single', hitBeatsMs: [600], powerMult: 0.5, beamStyle: 'ray', weight: 2, cooldown: 3, aim: 'highest_atk', applies: [{ status: 'def_down', stacks: 1, turns: 2 }, { status: 'vuln', stacks: 1, turns: 2 }] },
  ],
  guardian: [
    { moveId: 'grd_bash', nameVi: 'Shield Bash', telegraphVi: 'dồn trọng lượng đập 2 nhịp — làm Trì Hoãn!', targetScope: 'single', hitBeatsMs: [480, 840], powerMult: 1.1, beamStyle: 'slash', weight: 4, aim: 'random', applies: [{ status: 'slow', stacks: 1, turns: 2, chance: 0.7 }] },
    { moveId: 'grd_fortify', nameVi: 'Fortify', telegraphVi: 'dựng trận thủ — đồng minh Kiên Thủ!', targetScope: 'allies', hitBeatsMs: [], powerMult: 0, beamStyle: 'wave', weight: 2, cooldown: 3, when: 'has_allies', selfApplies: [{ status: 'def_up', stacks: 1, turns: 3 }] },
    { moveId: 'grd_mend', nameVi: 'Mend', telegraphVi: 'truyền sinh lực cho đồng minh yếu nhất!', targetScope: 'allies', hitBeatsMs: [], powerMult: 0, beamStyle: 'wave', weight: 4, cooldown: 3, when: 'ally_low', healRatio: 0.2 },
  ],
  beast: [
    { moveId: 'bst_bite', nameVi: 'Maul', telegraphVi: 'nhe nanh vồ 2 nhịp!', targetScope: 'single', hitBeatsMs: [400, 720], powerMult: 1.15, beamStyle: 'slash', weight: 4, aim: 'random', applies: [{ status: 'bleed', stacks: 1, turns: 3, chance: 0.6 }] },
    { moveId: 'bst_pounce', nameVi: 'Pounce', telegraphVi: 'thủ thế rồi phóng thẳng vào kẻ yếu nhất!', targetScope: 'single', hitBeatsMs: [700], powerMult: 1.5, beamStyle: 'meteor', weight: 2, cooldown: 2, aim: 'lowest_hp' },
    { moveId: 'bst_howl', nameVi: 'Pack Howl', telegraphVi: 'tru lên — cả bầy Cường Lực!', targetScope: 'allies', hitBeatsMs: [], powerMult: 0, beamStyle: 'wave', weight: 1, cooldown: 4, when: 'no_buff', selfApplies: [{ status: 'atk_up', stacks: 1, turns: 2 }] },
  ],
  swarm: [
    { moveId: 'swm_nibble', nameVi: 'Nibble', telegraphVi: 'lao tới cắn 1 nhịp!', targetScope: 'single', hitBeatsMs: [560], powerMult: 0.9, beamStyle: 'slash', weight: 4, aim: 'random' },
    { moveId: 'swm_sting', nameVi: 'Sting', telegraphVi: 'chích 1 nhịp mang nguyên tố!', targetScope: 'single', hitBeatsMs: [500], powerMult: 0.75, beamStyle: 'ray', weight: 3, aim: 'lowest_hp', applies: [{ status: EL, stacks: 1, turns: 2 }] },
  ],
};

export function resolveAppliedStatus(status: string, actor: CombatantRuntime): string {
  return status === EL ? ELEMENT_STATUS[actor.element] : status;
}

function hasBuff(u: CombatantRuntime): boolean {
  return (u.statuses ?? []).some((s) => ['atk_up', 'def_up', 'haste', 'crit_up'].includes(s.id));
}

function intentRng(session: BattleSessionState): Mulberry32 {
  return new Mulberry32((session.battleSeed ^ Math.imul(session.round + 7, 0x9e3779b1)) >>> 0);
}

function pickTargets(session: BattleSessionState, move: EnemyMovePattern, rng: Mulberry32): string[] {
  const party = session.combatants.filter((c) => c.side === 'party' && c.alive);
  if (!party.length) return [];
  if (move.targetScope === 'all') return party.map((p) => p.unitUid);
  if (move.targetScope === 'self' || move.targetScope === 'allies') return [];
  const taunter = party.find((p) => (p.statuses ?? []).some((s) => s.id === 'taunt'));
  if (taunter) return [taunter.unitUid];
  if (move.aim === 'lowest_hp' && rng.next() < 0.75) {
    return [[...party].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0].unitUid];
  }
  if (move.aim === 'highest_atk' && rng.next() < 0.75) {
    return [[...party].sort((a, b) => b.atk - a.atk)[0].unitUid];
  }
  return [party[Math.floor(rng.next() * party.length) % party.length].unitUid];
}

function bossMove(session: BattleSessionState, actor: CombatantRuntime): EnemyMovePattern | undefined {
  const bossDef = EXPEDITION_BOSSES_BY_ID[session.targetId];
  const phase = bossDef?.phases.find((p) => p.phaseIndex === actor.phaseIndex) ?? bossDef?.phases[0];
  const moves = phase?.moves ?? [];
  if (!moves.length) return undefined;
  const m = moves[session.bossMoveCursor % moves.length];
  // vũ đạo 3D theo loại chiêu: chém → áp sát liên kích, thiên thạch → nhảy bổ, sóng → dậm chấn, tia → bắn liên hoàn
  const BOSS_ANIM = { slash: 'combo', meteor: 'leap', wave: 'slam', ray: 'barrage' } as const;
  const base: EnemyMovePattern = { ...m, anim: BOSS_ANIM[m.beamStyle], applies: [{ status: EL, stacks: 1, turns: 2, chance: 0.75 }] };
  // từ vùng III: cứ mỗi đòn thứ hai, Trùm đánh combo thường rồi CHỐT bằng một nhát Tuyệt Kỹ (chỉ W phản được)
  const order = EXPEDITION_REALMS_BY_ID[session.mapId]?.order ?? 1;
  if (order >= SPECIAL_FROM_REALM && m.hitBeatsMs.length > 0 && session.bossMoveCursor % 2 === 1) {
    const last = m.hitBeatsMs[m.hitBeatsMs.length - 1];
    // Trùm ra Tuyệt Kỹ ĐÁNH TOÀN ĐỘI thường xuyên hơn quái thường (~65% số đòn chốt)
    const aoe = m.targetScope === 'all' || ((session.battleSeed >>> 3) + session.bossMoveCursor * 7) % 20 < 13;
    return {
      ...base,
      targetScope: aoe ? 'all' : base.targetScope,
      moveId: `${m.moveId}_finisher${aoe ? '_aoe' : ''}`,
      // không báo trước: lời nhắc W chỉ hiện khi nhát Tuyệt Kỹ sắp đánh tới
      nameVi: m.nameVi,
      telegraphVi: m.telegraphVi,
      hitBeatsMs: [...m.hitBeatsMs, last + 760],
      specialFrom: m.hitBeatsMs.length,
      specialPower: 2.2,
    };
  }
  return base;
}

/** Chốt ý đồ của kẻ địch `actor` cho lượt sắp tới (gọi khi lượt chuyển sang kẻ địch). */
export function planEnemyIntent(session: BattleSessionState, actor: CombatantRuntime): EnemyIntent {
  const rng = intentRng(session);

  // đang tụ lực -> tung đòn đã gồng
  if (actor.aiCharging) {
    const kit = ENEMY_MOVE_KITS[actor.aiStyle ?? 'brute'];
    const m = kit.find((k) => k.moveId === actor.aiCharging);
    if (m) {
      const release: EnemyMovePattern = { ...m, charge: false, telegraphVi: `TUNG ĐÒN ĐÃ GỒNG: ${m.nameVi}!` };
      return { actorUid: actor.unitUid, move: release, targetUids: pickTargets(session, release, rng) };
    }
  }

  if (actor.isBoss && session.encounterKind === 'boss') {
    const m = bossMove(session, actor);
    if (m) return { actorUid: actor.unitUid, move: m, targetUids: pickTargets(session, m, rng) };
  }

  // 3 đòn tấn công riêng của con quái + các chiêu hỗ trợ (buff / hồi máu) theo kiểu AI
  const realmOrder = EXPEDITION_REALMS_BY_ID[session.mapId]?.order ?? 1;
  const kit = [
    ...monsterAttackMoves(actor),
    ...(realmOrder >= SPECIAL_FROM_REALM ? [monsterSpecialMove(actor), monsterAoeSpecialMove(actor)] : []),
    ...ENEMY_MOVE_KITS[actor.aiStyle ?? 'brute'].filter((m) => m.hitBeatsMs.length === 0 && !m.charge),
  ];
  const hist = actor.aiHistory ?? [];
  const repeated = hist.length >= 2 && hist[hist.length - 1] === hist[hist.length - 2] ? hist[hist.length - 1] : undefined;
  const allies = session.combatants.filter((c) => c.side === 'enemy' && c.alive && c.unitUid !== actor.unitUid);
  const allAllies = [actor, ...allies];
  const candidates = kit.filter((m) => {
    if ((actor.aiCooldowns?.[m.moveId] ?? 0) > 0) return false;
    if (m.moveId === repeated) return false;
    switch (m.when) {
      case 'hp_low':
        return actor.hp / actor.maxHp < 0.5;
      case 'ally_low':
        return allAllies.some((a) => a.hp / a.maxHp < 0.55);
      case 'has_allies':
        return allies.length > 0;
      case 'no_buff':
        return !hasBuff(actor);
      default:
        return true;
    }
  });
  const pool = candidates.length ? candidates : [kit[0]];
  const total = pool.reduce((s, m) => s + (m.weight ?? 1), 0);
  let r = rng.next() * total;
  let chosen = pool[0];
  for (const m of pool) {
    r -= m.weight ?? 1;
    if (r < 0) {
      chosen = m;
      break;
    }
  }

  if (chosen.charge) {
    const stub: EnemyMovePattern = {
      moveId: chosen.moveId,
      nameVi: `Charging · ${chosen.nameVi}`,
      telegraphVi: chosen.telegraphVi,
      targetScope: 'self',
      hitBeatsMs: [],
      powerMult: 0,
      beamStyle: chosen.beamStyle,
      cooldown: chosen.cooldown,
    };
    return { actorUid: actor.unitUid, move: stub, targetUids: [], charging: true };
  }
  return { actorUid: actor.unitUid, move: chosen, targetUids: pickTargets(session, chosen, rng) };
}

export const AI_STYLE_LABELS_VI: Record<EnemyAiStyle, string> = {
  brute: 'Cuồng Chiến (gồng đòn nặng)',
  skirmisher: 'Du Kích (đánh kẻ yếu, đòn nhử)',
  caster: 'Pháp Sư (gây hiệu ứng nguyên tố)',
  guardian: 'Hộ Vệ (buff thủ, hồi máu đồng đội)',
  beast: 'Mãnh Thú (cắn xé, vồ kẻ yếu)',
  swarm: 'Bầy Đàn (đòn nhỏ, nọc độc)',
};
