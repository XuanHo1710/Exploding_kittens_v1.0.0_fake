/**
 * Destructible Boss Body Parts Manager (`boss-parts.ts`).
 *
 * Every boss exposes 3-4 targetable anatomical parts (`BANSUNG_BOSS_BODY_PARTS`).
 * Players & bots can shoot any intact part directly (`auxTargets` `'boss_part'`).
 * Destroying a part:
 *  1) Inflicts a multi-second STUN (`2.4s-3.2s`) on the boss, cancelling active windups;
 *  2) Deals bonus shatter damage to the boss's main HP;
 *  3) Permanently unlocks and queues a new enraged boss skill.
 */
import {
  BANSUNG_BOSS_BODY_PARTS,
  type BansungBossBodyPartDef,
  type BansungBossPartView,
  type BansungEnemyId,
} from '../../../../shared/src';
import type { BansungCombatTarget } from './damage';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface BossBodyPartState {
  idx: number;
  id: string;
  name: string;
  vnName: string;
  hp: number;
  maxHp: number;
  offsetR: number;
  angleOffsetRad: number;
  x: number;
  y: number;
  radius: number;
  broken: boolean;
  stunMs: number;
  shatterBossHpRatio: number;
  unlocksSkill: string;
  unlocksSkillVn: string;
  combatTarget: BansungCombatTarget;
}

export interface BossPartGroupState {
  bossId: number;
  kind: BansungEnemyId | string;
  parts: BossBodyPartState[];
  unlockedSkills: string[];
  unlockedSkillVnNames: string[];
  pendingEnragedSkills: string[];
}

export interface BossPartBreakEvent {
  part: BossBodyPartState;
  shatterDmg: number;
  stunMs: number;
  unlockedSkill: string;
  unlockedSkillVn: string;
  x: number;
  y: number;
}

const DEG_TO_RAD = Math.PI / 180;

export function createBossPartGroup(opts: {
  bossId: number;
  kind: BansungEnemyId | string;
  bossMaxHp: number;
  bossX: number;
  bossY: number;
  bossAimRad?: number;
  scale?: number;
  armor?: number;
}): BossPartGroupState {
  const defs: readonly BansungBossBodyPartDef[] = BANSUNG_BOSS_BODY_PARTS[opts.kind] ?? [];
  const scale = clamp(opts.scale ?? 1, 0.5, 2.2);
  const aimRad = opts.bossAimRad ?? 0;
  const partArmor = Math.max(0, Math.round((opts.armor ?? 3) - 1));

  const parts: BossBodyPartState[] = defs.map((def, idx) => {
    const angleOffsetRad = def.angleOffsetDeg * DEG_TO_RAD;
    const dist = def.offsetR * scale;
    const px = opts.bossX + Math.cos(aimRad + angleOffsetRad) * dist;
    const py = opts.bossY + Math.sin(aimRad + angleOffsetRad) * dist;
    const maxHp = Math.max(80, Math.round(def.hpRatio * Math.max(100, opts.bossMaxHp)));
    const radius = Math.max(11, Math.round(def.radius * scale));
    const combatTarget: BansungCombatTarget = {
      id: `bp_${opts.bossId}_${def.id}`,
      x: px,
      y: py,
      tier: 'boss',
      armorType: 'armored',
      flatArmor: partArmor,
      alive: true,
      hp: maxHp,
      maxHp,
      shield: 0,
      maxShield: 0,
      ccImmune: true,
    };
    return {
      idx,
      id: def.id,
      name: def.name,
      vnName: def.vnName,
      hp: maxHp,
      maxHp,
      offsetR: dist,
      angleOffsetRad,
      x: px,
      y: py,
      radius,
      broken: false,
      stunMs: def.stunMs,
      shatterBossHpRatio: def.shatterBossHpRatio,
      unlocksSkill: def.unlocksSkill,
      unlocksSkillVn: def.unlocksSkillVn,
      combatTarget,
    };
  });

  return {
    bossId: opts.bossId,
    kind: opts.kind,
    parts,
    unlockedSkills: [],
    unlockedSkillVnNames: [],
    pendingEnragedSkills: [],
  };
}

export function syncBossPartsPositions(
  group: BossPartGroupState,
  bossX: number,
  bossY: number,
  bossAimRad: number,
): void {
  for (const part of group.parts) {
    const ang = bossAimRad + part.angleOffsetRad;
    const px = bossX + Math.cos(ang) * part.offsetR;
    const py = bossY + Math.sin(ang) * part.offsetR;
    part.x = px;
    part.y = py;
    part.combatTarget.x = px;
    part.combatTarget.y = py;
    if (!part.broken) {
      part.hp = clamp(Math.round(part.combatTarget.hp), 0, part.maxHp);
    } else {
      part.hp = 0;
      part.combatTarget.hp = 0;
      part.combatTarget.alive = false;
    }
  }
}

export function evaluateBossPartBreaks(
  group: BossPartGroupState,
  bossTarget: { hp: number; maxHp: number; alive: boolean; stunMs?: number },
): BossPartBreakEvent[] {
  const breaks: BossPartBreakEvent[] = [];
  for (const part of group.parts) {
    if (part.broken) continue;
    if (part.combatTarget.hp > 0 && part.combatTarget.alive) continue;

    part.broken = true;
    part.hp = 0;
    part.combatTarget.hp = 0;
    part.combatTarget.alive = false;

    if (!group.unlockedSkills.includes(part.unlocksSkill)) {
      group.unlockedSkills.push(part.unlocksSkill);
      group.unlockedSkillVnNames.push(part.unlocksSkillVn);
    }
    group.pendingEnragedSkills.push(part.unlocksSkill);

    const prevHp = Math.max(0, bossTarget.hp);
    const rawShatter = Math.max(30, Math.round(bossTarget.maxHp * part.shatterBossHpRatio));
    // Leave at least 1 HP if boss was >1 HP so stun state plays visibly before finishing blow.
    const shatterDmg = prevHp > 1 ? Math.min(prevHp - 1, rawShatter) : 0;
    bossTarget.hp = Math.max(0, prevHp - shatterDmg);
    bossTarget.stunMs = Math.max(bossTarget.stunMs ?? 0, part.stunMs);

    breaks.push({
      part,
      shatterDmg,
      stunMs: part.stunMs,
      unlockedSkill: part.unlocksSkill,
      unlockedSkillVn: part.unlocksSkillVn,
      x: part.x,
      y: part.y,
    });
  }
  return breaks;
}

export function toBossPartViews(group: BossPartGroupState | undefined): BansungBossPartView[] | undefined {
  if (!group || group.parts.length === 0) return undefined;
  return group.parts.map((p) => ({
    id: p.id,
    idx: p.idx,
    name: p.name,
    vnName: p.vnName,
    hp: Math.max(0, Math.round(p.hp)),
    maxHp: Math.max(1, Math.round(p.maxHp)),
    broken: p.broken,
    x: Math.round(p.x),
    y: Math.round(p.y),
    radius: Math.round(p.radius),
    unlocksSkill: p.unlocksSkill,
    unlocksSkillVn: p.unlocksSkillVn,
  }));
}
