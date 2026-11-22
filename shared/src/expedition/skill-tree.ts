/**
 * Cây Kỹ Năng (Skill Tree) của từng anh hùng — 6 tầng, mỗi tầng (trừ gốc) có 3 nhánh A / B / C để chọn.
 *  - Tầng mở theo cấp anh hùng (`EXP_BALANCE.skillTree.tierLevels`), tốn Điểm Kỹ Năng (SP).
 *  - Muốn mở tầng t phải có ít nhất 1 nút ở tầng t-1.
 *  - Nhánh thứ 2 của cùng một tầng mở được về sau (cần thêm cấp và tốn gấp đôi) -> lựa chọn sớm có ý nghĩa.
 *  - Nút thay đổi trực tiếp kỹ năng: uy lực, Phá Thế, AP, thêm nhịp đánh, thêm hiệu ứng, chỉ số %, Cộng Hưởng.
 */

import { EXP_BALANCE, treePointsAtLevel, type StatKey } from './balance';
import { EXPEDITION_HEROES, EXPEDITION_SKILLS_BY_ID } from './catalog';
import { ELEMENT_STATUS, STATUS_DEFS, heroMechanicOf, type SkillEffect } from './combat-rules';
import type { CombatSkillDefinition, HeroDefinition, HeroInstance } from './types';

export type TreeMod =
  | { kind: 'skill_power'; skillId: string; value: number }
  | { kind: 'skill_break'; skillId: string; value: number }
  | { kind: 'skill_ap'; skillId: string; value: number }
  | { kind: 'skill_hit'; skillId: string; value: number }
  | { kind: 'skill_effect'; skillId: string; effect: SkillEffect }
  | { kind: 'stat_pct'; stat: StatKey; value: number }
  | { kind: 'charge_max'; value: number }
  | { kind: 'charge_power'; value: number }
  | { kind: 'charge_basic'; value: number }
  | { kind: 'start_charge'; value: number };

export interface TreeNode {
  nodeId: string;
  heroId: string;
  tier: number; // 1..6
  branch: 'R' | 'A' | 'B' | 'C';
  nameVi: string;
  descVi: string;
  icon: string;
  mods: TreeMod[];
}

function isOffensive(s: CombatSkillDefinition): boolean {
  return s.targetScope === 'single_enemy' || s.targetScope === 'all_enemies';
}

function buildTree(def: HeroDefinition): TreeNode[] {
  const [bId, a1Id, a2Id, uId] = def.skillIds;
  const b = EXPEDITION_SKILLS_BY_ID[bId];
  const a1 = EXPEDITION_SKILLS_BY_ID[a1Id];
  const a2 = EXPEDITION_SKILLS_BY_ID[a2Id];
  const u = EXPEDITION_SKILLS_BY_ID[uId];
  const mech = heroMechanicOf(def.heroId);
  const elemStatus = ELEMENT_STATUS[def.element];
  const sName = STATUS_DEFS[elemStatus].nameVi;
  const id = (t: number, br: string) => `${def.heroId}:t${t}${br}`;
  const nodes: TreeNode[] = [];

  nodes.push({
    nodeId: id(1, 'R'),
    heroId: def.heroId,
    tier: 1,
    branch: 'R',
    icon: '◆',
    nameVi: `Căn Cơ · ${b.nameVi}`,
    descVi: `${b.nameVi}: +15% uy lực và +15% Phá Thế.`,
    mods: [
      { kind: 'skill_power', skillId: bId, value: 0.15 },
      { kind: 'skill_break', skillId: bId, value: 0.15 },
    ],
  });

  // tier 2 — active 1
  nodes.push({
    nodeId: id(2, 'A'),
    heroId: def.heroId,
    tier: 2,
    branch: 'A',
    icon: '▲',
    nameVi: `Cường Hóa · ${a1.nameVi}`,
    descVi: `${a1.nameVi}: +25% uy lực${isOffensive(a1) ? '' : ' (hồi máu / giáp)'}.`,
    mods: [{ kind: 'skill_power', skillId: a1Id, value: 0.25 }],
  });
  nodes.push({
    nodeId: id(2, 'B'),
    heroId: def.heroId,
    tier: 2,
    branch: 'B',
    icon: '▼',
    nameVi: `Tinh Giản · ${a1.nameVi}`,
    descVi: `${a1.nameVi}: giảm 1 AP tiêu hao.`,
    mods: [{ kind: 'skill_ap', skillId: a1Id, value: -1 }],
  });

  // tier 3 — active 2
  if (isOffensive(a2)) {
    nodes.push({
      nodeId: id(3, 'A'),
      heroId: def.heroId,
      tier: 3,
      branch: 'A',
      icon: '✚',
      nameVi: `Liên Kích · ${a2.nameVi}`,
      descVi: `${a2.nameVi}: thêm 1 nhịp đánh (Timed Hit) với 30% uy lực gốc.`,
      mods: [{ kind: 'skill_hit', skillId: a2Id, value: 0.3 }],
    });
    nodes.push({
      nodeId: id(3, 'B'),
      heroId: def.heroId,
      tier: 3,
      branch: 'B',
      icon: '☄',
      nameVi: `Nguyên Tố · ${a2.nameVi}`,
      descVi: `${a2.nameVi}: gây thêm ${sName} ×2 (3 lượt).`,
      mods: [
        {
          kind: 'skill_effect',
          skillId: a2Id,
          effect: { kind: 'status', status: elemStatus, stacks: 2, turns: 3, to: a2.targetScope === 'all_enemies' ? 'enemies' : 'target' },
        },
      ],
    });
  } else {
    nodes.push({
      nodeId: id(3, 'A'),
      heroId: def.heroId,
      tier: 3,
      branch: 'A',
      icon: '✚',
      nameVi: `Ân Điển · ${a2.nameVi}`,
      descVi: `${a2.nameVi}: +30% hiệu quả.`,
      mods: [{ kind: 'skill_power', skillId: a2Id, value: 0.3 }],
    });
    nodes.push({
      nodeId: id(3, 'B'),
      heroId: def.heroId,
      tier: 3,
      branch: 'B',
      icon: '⚔',
      nameVi: `Hiệu Triệu · ${a2.nameVi}`,
      descVi: `${a2.nameVi}: thêm Cường Lực ×1 cho cả đội (2 lượt).`,
      mods: [{ kind: 'skill_effect', skillId: a2Id, effect: { kind: 'status', status: 'atk_up', stacks: 1, turns: 2, to: 'allies' } }],
    });
  }

  // tier 4 — stats
  nodes.push({
    nodeId: id(4, 'A'),
    heroId: def.heroId,
    tier: 4,
    branch: 'A',
    icon: '⚔',
    nameVi: 'Sát Ý',
    descVi: '+8% ATK, +5% Tỉ lệ chí mạng, +10% ST chí mạng.',
    mods: [
      { kind: 'stat_pct', stat: 'atk', value: 0.08 },
      { kind: 'stat_pct', stat: 'critRate', value: 0.05 },
      { kind: 'stat_pct', stat: 'critDmg', value: 0.1 },
    ],
  });
  nodes.push({
    nodeId: id(4, 'B'),
    heroId: def.heroId,
    tier: 4,
    branch: 'B',
    icon: '⛨',
    nameVi: 'Kiên Định',
    descVi: '+12% HP, +12% DEF, +3% Né tránh.',
    mods: [
      { kind: 'stat_pct', stat: 'hp', value: 0.12 },
      { kind: 'stat_pct', stat: 'def', value: 0.12 },
      { kind: 'stat_pct', stat: 'eva', value: 0.03 },
    ],
  });

  // tier 5 — ultimate
  nodes.push({
    nodeId: id(5, 'A'),
    heroId: def.heroId,
    tier: 5,
    branch: 'A',
    icon: '✸',
    nameVi: `Khai Thiên · ${u.nameVi}`,
    descVi: `${u.nameVi}: +30% uy lực.`,
    mods: [{ kind: 'skill_power', skillId: uId, value: 0.3 }],
  });
  nodes.push({
    nodeId: id(5, 'B'),
    heroId: def.heroId,
    tier: 5,
    branch: 'B',
    icon: '⌁',
    nameVi: `Tốc Thành · ${u.nameVi}`,
    descVi: `${u.nameVi}: giảm 1 AP và +25% Phá Thế.`,
    mods: [
      { kind: 'skill_ap', skillId: uId, value: -1 },
      { kind: 'skill_break', skillId: uId, value: 0.25 },
    ],
  });

  // tier 6 — mechanic capstone
  nodes.push({
    nodeId: id(6, 'A'),
    heroId: def.heroId,
    tier: 6,
    branch: 'A',
    icon: '❖',
    nameVi: `Đại Thành · ${mech.nameVi}`,
    descVi: `${mech.nameVi}: tối đa +2 tầng, mỗi tầng bộc phát mạnh thêm 4%.`,
    mods: [
      { kind: 'charge_max', value: 2 },
      { kind: 'charge_power', value: 0.04 },
    ],
  });
  nodes.push({
    nodeId: id(6, 'B'),
    heroId: def.heroId,
    tier: 6,
    branch: 'B',
    icon: '✺',
    nameVi: `Dòng Chảy · ${mech.nameVi}`,
    descVi: `Đòn thường tích thêm +1 ${mech.nameVi}; vào trận với 2 tầng.`,
    mods: [
      { kind: 'charge_basic', value: 1 },
      { kind: 'start_charge', value: 2 },
    ],
  });
  // nhánh C — lối chơi thứ ba cho mỗi tầng (nhịp, phá thế, thân pháp, dư chấn, khai mở)
  nodes.push({
    nodeId: id(2, 'C'),
    heroId: def.heroId,
    tier: 2,
    branch: 'C',
    icon: '◇',
    nameVi: `Phá Phong · ${a1.nameVi}`,
    descVi: `${a1.nameVi}: +35% Phá Thế.`,
    mods: [{ kind: 'skill_break', skillId: a1Id, value: 0.35 }],
  });
  nodes.push({
    nodeId: id(3, 'C'),
    heroId: def.heroId,
    tier: 3,
    branch: 'C',
    icon: '✦',
    nameVi: `Thuần Thục · ${a2.nameVi}`,
    descVi: isOffensive(a2) ? `${a2.nameVi}: +20% uy lực và +20% Phá Thế.` : `${a2.nameVi}: giảm 1 AP tiêu hao.`,
    mods: isOffensive(a2)
      ? [{ kind: 'skill_power', skillId: a2Id, value: 0.2 }, { kind: 'skill_break', skillId: a2Id, value: 0.2 }]
      : [{ kind: 'skill_ap', skillId: a2Id, value: -1 }],
  });
  nodes.push({
    nodeId: id(4, 'C'),
    heroId: def.heroId,
    tier: 4,
    branch: 'C',
    icon: '➶',
    nameVi: 'Thân Pháp',
    descVi: '+8% Tốc độ, +4% Né tránh.',
    mods: [
      { kind: 'stat_pct', stat: 'spd', value: 0.08 },
      { kind: 'stat_pct', stat: 'eva', value: 0.04 },
    ],
  });
  nodes.push({
    nodeId: id(5, 'C'),
    heroId: def.heroId,
    tier: 5,
    branch: 'C',
    icon: '✹',
    nameVi: `Dư Chấn · ${u.nameVi}`,
    descVi: isOffensive(u) ? `${u.nameVi}: thêm 1 nhịp đánh với 25% uy lực gốc.` : `${u.nameVi}: +25% hiệu quả.`,
    mods: [isOffensive(u) ? { kind: 'skill_hit', skillId: uId, value: 0.25 } : { kind: 'skill_power', skillId: uId, value: 0.25 }],
  });
  nodes.push({
    nodeId: id(6, 'C'),
    heroId: def.heroId,
    tier: 6,
    branch: 'C',
    icon: '❂',
    nameVi: `Khai Mở · ${mech.nameVi}`,
    descVi: `${mech.nameVi}: tối đa +1 tầng; vào trận với 1 tầng; mỗi tầng mạnh thêm 2%.`,
    mods: [
      { kind: 'charge_max', value: 1 },
      { kind: 'start_charge', value: 1 },
      { kind: 'charge_power', value: 0.02 },
    ],
  });
  return nodes;
}

export const EXPEDITION_SKILL_TREES: Readonly<Record<string, readonly TreeNode[]>> = Object.fromEntries(
  EXPEDITION_HEROES.map((h) => [h.heroId, buildTree(h)]),
);

export const TREE_NODES_BY_ID: Readonly<Record<string, TreeNode>> = Object.fromEntries(
  Object.values(EXPEDITION_SKILL_TREES)
    .flat()
    .map((n) => [n.nodeId, n]),
);

export function treePointsSpent(inst: HeroInstance): number {
  return (inst.treeNodes ?? []).reduce((s, id) => {
    const n = TREE_NODES_BY_ID[id];
    return n ? s + treeNodeCost(inst, n, true) : s;
  }, 0);
}

export function treePointsUnspent(inst: HeroInstance): number {
  return Math.max(0, treePointsAtLevel(inst.level) - treePointsSpent(inst));
}

/** Nút này có phải nhánh thứ 2 của tầng không (đã có nút khác cùng tầng được mở trước). */
function isSecondBranch(inst: HeroInstance, node: TreeNode): boolean {
  if (node.branch === 'R') return false;
  const owned = inst.treeNodes ?? [];
  const idx = owned.indexOf(node.nodeId);
  const sameTier = owned.filter((id) => TREE_NODES_BY_ID[id]?.tier === node.tier && id !== node.nodeId);
  if (!sameTier.length) return false;
  if (idx < 0) return true;
  // đã sở hữu: là nhánh 2 nếu nút cùng tầng kia được mở trước
  return sameTier.some((id) => owned.indexOf(id) < idx);
}

export function treeNodeCost(inst: HeroInstance, node: TreeNode, owned = false): number {
  const t = EXP_BALANCE.skillTree;
  const base = t.tierCosts[node.tier - 1] ?? 1;
  const second = owned ? isSecondBranch(inst, node) : isSecondBranch(inst, node);
  return second ? base * t.secondBranchCostMult : base;
}

export function treeNodeReqLevel(inst: HeroInstance, node: TreeNode): number {
  const t = EXP_BALANCE.skillTree;
  const base = t.tierLevels[node.tier - 1] ?? 1;
  return isSecondBranch(inst, node) ? base + t.secondBranchExtraLevel : base;
}

/** Kiểm tra mở được nút không; trả về lý do nếu không. */
export function canUnlockTreeNode(inst: HeroInstance, nodeId: string): { ok: true; cost: number } | { ok: false; reason: string } {
  const node = TREE_NODES_BY_ID[nodeId];
  if (!node || node.heroId !== inst.heroId) return { ok: false, reason: 'Nút kỹ năng không thuộc anh hùng này.' };
  const owned = inst.treeNodes ?? [];
  if (owned.includes(nodeId)) return { ok: false, reason: 'Đã mở nút này.' };
  if (node.tier > 1) {
    const prev = owned.some((id) => TREE_NODES_BY_ID[id]?.tier === node.tier - 1);
    if (!prev) return { ok: false, reason: `Cần mở 1 nút ở tầng ${node.tier - 1} trước.` };
  }
  const req = treeNodeReqLevel(inst, node);
  if (inst.level < req) return { ok: false, reason: `Cần anh hùng cấp ${req}.` };
  const cost = treeNodeCost(inst, node);
  const free = treePointsUnspent(inst);
  if (free < cost) return { ok: false, reason: `Cần ${cost} SP (đang có ${free}).` };
  return { ok: true, cost };
}

/** Các sửa đổi kỹ năng đã gộp — engine lưu vào combatant để client và server tính giống nhau. */
export interface ResolvedSkillMod {
  power: number;
  brk: number;
  ap: number;
  extraHit: number;
  effects: SkillEffect[];
}

export interface HeroTreeBonuses {
  skillMods: Record<string, ResolvedSkillMod>;
  statPct: Partial<Record<StatKey, number>>;
  chargeMax: number;
  chargePower: number;
  chargeBasic: number;
  startCharge: number;
}

export function collectTreeBonuses(inst: Pick<HeroInstance, 'treeNodes'>): HeroTreeBonuses {
  const out: HeroTreeBonuses = { skillMods: {}, statPct: {}, chargeMax: 0, chargePower: 0, chargeBasic: 0, startCharge: 0 };
  const mod = (sid: string) => (out.skillMods[sid] ??= { power: 0, brk: 0, ap: 0, extraHit: 0, effects: [] });
  for (const nid of inst.treeNodes ?? []) {
    const n = TREE_NODES_BY_ID[nid];
    if (!n) continue;
    for (const m of n.mods) {
      if (m.kind === 'skill_power') mod(m.skillId).power += m.value;
      else if (m.kind === 'skill_break') mod(m.skillId).brk += m.value;
      else if (m.kind === 'skill_ap') mod(m.skillId).ap += m.value;
      else if (m.kind === 'skill_hit') mod(m.skillId).extraHit += m.value;
      else if (m.kind === 'skill_effect') mod(m.skillId).effects.push(m.effect);
      else if (m.kind === 'stat_pct') out.statPct[m.stat] = (out.statPct[m.stat] ?? 0) + m.value;
      else if (m.kind === 'charge_max') out.chargeMax += m.value;
      else if (m.kind === 'charge_power') out.chargePower += m.value;
      else if (m.kind === 'charge_basic') out.chargeBasic += m.value;
      else if (m.kind === 'start_charge') out.startCharge += m.value;
    }
  }
  return out;
}
