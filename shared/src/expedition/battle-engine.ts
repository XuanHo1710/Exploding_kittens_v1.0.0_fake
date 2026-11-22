/**
 * Deterministic Active Turn-Based Combat Engine (`ExpeditionBattleEngine`):
 * - CTB Action Value turn order (`10000 / effectiveSpeed`), AP 0..9, vertical skill menu.
 * - Offensive Timed Hit (perfect / good / miss) + defensive Parry / Dodge, full-parry Counter Riposte.
 * - Break / Stagger gauge, multi-phase bosses, break shields.
 * - Statuses with stacks (buff / debuff / DoT / control), two-way elemental affinity (weak / resist).
 * - Per-hero "Resonance" charge stacks consumed by burst skills (role-specific full-charge bonus).
 * - Skill tree modifiers (power / break / AP / extra beat / extra effects) and Charm effects.
 * - Enemy AI intents planned deterministically before each enemy turn (telegraph, targets, charge-up).
 * - Authoritative server replay verification (`replayAndVerifyBattle`).
 */

import { EXPEDITION_BOSSES_BY_ID, EXPEDITION_GATEKEEPERS_BY_ID, EXPEDITION_HEROES_BY_ID, EXPEDITION_SKILLS_BY_ID } from './catalog';
import { EXP_BALANCE, skillBreakMult, skillPowerMult } from './balance';
import { EXPEDITION_REALMS_BY_ID } from './catalog';
import { EXPEDITION_WILD_PACKS_BY_ID, makeMonsterTemplate } from './bestiary';
import { buildCharmLoadout } from './charms';
import {
  STATUS_DEFS,
  SKILL_KITS,
  affinityBreakMult,
  affinityDamageMult,
  affinityOf,
  heroMechanicOf,
  type Affinity,
  type SkillEffect,
  type StatusId,
} from './combat-rules';
import { planEnemyIntent, resolveAppliedStatus } from './enemy-ai';
import { computeHeroFinalStats, normalizeProfile, unlockedSkillIds } from './progression';
import { Mulberry32 } from './rng';
import { collectTreeBonuses } from './skill-tree';
import {
  ELEMENT_ADVANTAGE,
  type BattleSessionState,
  type CombatSkillDefinition,
  type CombatantRuntime,
  type DefenseGrade,
  type ElementType,
  type EncounterKind,
  type EnemyMovePattern,
  type EnemyUnitTemplate,
  type ExpeditionProfile,
  type RealmMapId,
  type SkillHitBeat,
  type TimedHitGrade,
  type TurnActionRecord,
} from './types';

export { Mulberry32 };

export interface TurnResolutionEvent {
  kind:
    | 'skill_cast'
    | 'hit'
    | 'heal'
    | 'shield'
    | 'ap_grant'
    | 'dodge'
    | 'parry'
    | 'parry_counter'
    | 'break_stagger'
    | 'boss_phase_shift'
    | 'stagger_skip'
    | 'evade'
    | 'status_apply'
    | 'status_tick'
    | 'cleanse'
    | 'dispel'
    | 'detonate'
    | 'charge_gain'
    | 'charge_burst'
    | 'freeze'
    | 'charging'
    | 'charge_interrupt'
    | 'last_stand'
    | 'thorns'
    | 'death';
  actorUid: string;
  targetUid?: string;
  skillNameVi?: string;
  amount?: number;
  breakAdded?: number;
  grade?: TimedHitGrade | DefenseGrade;
  isWeakness?: boolean;
  isCrit?: boolean;
  affinity?: Affinity;
  phaseTitleVi?: string;
  statusId?: string;
  stacks?: number;
}

const S = EXP_BALANCE.status;

export function clampAp(ap: number): number {
  return Math.max(0, Math.min(9, Math.round(ap)));
}

// ---------------------------------------------------------------- status helpers

export function stacksOf(u: CombatantRuntime, id: StatusId): number {
  return u.statuses?.find((s) => s.id === id)?.stacks ?? 0;
}

function removeStatus(u: CombatantRuntime, id: StatusId): void {
  if (u.statuses) u.statuses = u.statuses.filter((s) => s.id !== id);
}

function fx(u: CombatantRuntime, key: string): number {
  return u.charmFx?.[key] ?? 0;
}

export function effAtk(u: CombatantRuntime): number {
  const m = 1 + S.atkUp * stacksOf(u, 'atk_up') - S.atkDown * stacksOf(u, 'atk_down');
  return u.atk * Math.max(0.4, m) * (u.hp < u.maxHp * .6 ? 1 + fx(u, 'low_atk_60') : 1);
}

export function effDef(u: CombatantRuntime): number {
  const m = 1 + S.defUp * stacksOf(u, 'def_up') - S.defDown * stacksOf(u, 'def_down');
  return Math.max(0, u.def * Math.max(0.2, m));
}

export function effectiveSpeed(u: CombatantRuntime): number {
  let mult = u.spdBuffTurns > 0 ? 1.25 : 1.0;
  mult += S.haste * stacksOf(u, 'haste') - S.slow * stacksOf(u, 'slow') - S.frostbiteSlow * stacksOf(u, 'frostbite');
  return Math.max(20, Math.round(u.spd * Math.max(0.4, mult)));
}

function debuffCount(u: CombatantRuntime): number {
  return (u.statuses ?? []).filter((s) => STATUS_DEFS[s.id as StatusId]?.kind === 'debuff').length;
}

export function computeTurnOrderPreview(combatants: readonly CombatantRuntime[], count = 8): string[] {
  const alive = combatants.filter((c) => c.alive);
  if (!alive.length) return [];
  const sim = alive.map((c) => ({ uid: c.unitUid, av: c.actionValue, spd: effectiveSpeed(c) }));
  const order: string[] = [];
  for (let i = 0; i < count; i++) {
    sim.sort((a, b) => a.av - b.av || b.spd - a.spd || a.uid.localeCompare(b.uid));
    const next = sim[0];
    const elapsed = Math.max(0, next.av);
    for (const s of sim) s.av = Math.max(0, s.av - elapsed);
    order.push(next.uid);
    next.av = Math.round(10000 / next.spd);
  }
  return order;
}

function advanceToNextActor(session: BattleSessionState): CombatantRuntime | undefined {
  const alive = session.combatants.filter((c) => c.alive);
  if (!alive.length) return undefined;
  alive.sort((a, b) => a.actionValue - b.actionValue || effectiveSpeed(b) - effectiveSpeed(a));
  const actor = alive[0];
  const delta = Math.max(0, actor.actionValue);
  for (const c of alive) {
    c.actionValue = Math.max(0, c.actionValue - delta);
  }
  session.activeActorUid = actor.unitUid;
  session.turnOrderPreview = computeTurnOrderPreview(session.combatants, 8);
  session.state = actor.side === 'party' ? 'PLAYER_MENU_SELECT' : 'ENEMY_TELEGRAPH';
  session.enemyIntent = actor.side === 'enemy' ? planEnemyIntent(session, actor) : null;
  return actor;
}

// ---------------------------------------------------------------- session creation

function enemyUnit(e: EnemyUnitTemplate, idx: number, prefix = 'enemy'): CombatantRuntime {
  const dir = e.spriteDir ?? 'gatekeepers';
  const k = EXP_BALANCE.enemy;
  const hp = Math.round(e.maxHp * (e.isMinion ? k.minionHp : k.gatekeeperHp));
  const atk = Math.round(e.atk * (e.isMinion ? k.minionAtk : k.gatekeeperAtk));
  return {
    unitUid: `${prefix}_${idx}_${e.enemyId}`,
    side: 'enemy',
    templateId: e.enemyId,
    nameVi: e.nameVi,
    element: e.element,
    weakness: e.weakness,
    resists: e.resists,
    hp,
    maxHp: hp,
    atk,
    def: Math.round(e.def * k.def),
    spd: e.spd,
    critRate: 0.08,
    critDmg: 1.4,
    ap: 0,
    breakGauge: 0,
    maxBreak: e.maxBreak,
    staggerTurns: 0,
    shieldHp: 0,
    spdBuffTurns: 0,
    vulnDebuffTurns: 0,
    actionValue: Math.round(10000 / e.spd) + idx * 37,
    phaseIndex: 1,
    breakShieldActive: false,
    alive: true,
    statuses: [],
    spriteRef: `units/${dir}/${e.spriteKey}-battle.png`,
    isMinion: Boolean(e.isMinion),
    aiStyle: e.aiStyle ?? 'brute',
    aiCooldowns: {},
    signatureMove: e.isMinion ? undefined : { nameVi: e.attackNameVi, hitBeatsMs: e.hitBeatsMs, powerMult: e.hitPowerMult },
  };
}

export function createBattleSession(params: {
  battleId: string;
  battleSeed: number;
  profile: ExpeditionProfile;
  encounterKind: EncounterKind;
  targetId: string;
  mapId: RealmMapId;
}): BattleSessionState {
  const { battleId, battleSeed, encounterKind, targetId, mapId } = params;
  const profile = normalizeProfile(params.profile);
  const partyIds = [...new Set(profile.activeParty)].filter((id) => profile.heroes[id] && EXPEDITION_HEROES_BY_ID[id]).slice(0, 4);
  const reserveIds = [...new Set(profile.reserveParty ?? [])].filter((id) => !partyIds.includes(id) && profile.heroes[id] && EXPEDITION_HEROES_BY_ID[id]).slice(0, 4);
  if (!partyIds.length) throw new Error('Đội hình ra trận phải có ít nhất 1 Anh Hùng.');

  const hasCelinePassive = partyIds.includes('celine_prism');
  const startAp = clampAp(3 + (hasCelinePassive ? 1 : 0));

  const partyUnits: CombatantRuntime[] = [...partyIds, ...reserveIds].map((heroId, idx) => {
    const def = EXPEDITION_HEROES_BY_ID[heroId];
    const inst = profile.heroes[heroId];
    const st = computeHeroFinalStats(def, inst, profile.inventory, profile.charms);
    const spdBonus = heroId === 'kestrel_dune' ? 12 : 0;
    const finalSpd = st.spd + spdBonus;
    const tree = collectTreeBonuses(inst);
    const charms = buildCharmLoadout(inst.charmIds ?? [], profile.charms);
    const mech = heroMechanicOf(heroId);
    const chargeMax = mech.max + tree.chargeMax;
    const u: CombatantRuntime = {
      unitUid: `hero_${idx}_${heroId}`,
      side: 'party',
      templateId: heroId,
      nameVi: def.nameVi,
      element: def.element,
      role: def.role,
      hp: st.hp,
      maxHp: st.hp,
      atk: st.atk,
      def: st.def,
      spd: finalSpd,
      critRate: st.critRate,
      critDmg: st.critDmg,
      eva: st.eva,
      skillLevels: { ...inst.skillLevels },
      unlockedSkillIds: unlockedSkillIds(def, inst.level),
      equippedSkillIds: inst.equippedSkillIds,
      ap: clampAp(startAp + (charms.fx.start_ap ?? 0)),
      breakGauge: 0,
      maxBreak: 100,
      staggerTurns: 0,
      shieldHp: Math.round(st.hp * (charms.fx.start_shield ?? 0)),
      wardHits: charms.fx.opening_ward ?? 0,
      spdBuffTurns: 0,
      vulnDebuffTurns: 0,
      actionValue: Math.round((10000 / finalSpd) * (1 - Math.min(0.8, charms.fx.first_strike ?? 0))),
      phaseIndex: 1,
      breakShieldActive: false,
      alive: true,
      statuses: [],
      charge: Math.min(chargeMax, tree.startCharge + (charms.fx.start_charge ?? 0)),
      chargeMax,
      chargePower: tree.chargePower,
      chargeBasic: tree.chargeBasic,
      skillMods: tree.skillMods,
      charmFx: charms.fx as Record<string, number>,
      basicStatuses: charms.basicStatuses,
      imbue: charms.imbue,
      lastStandUsed: false,
      spriteRef: `units/heroes/${heroId}-battle.png`,
    };
    if (charms.fx.start_regen) u.statuses!.push({ id: 'regen', stacks: 1, turns: Math.round(charms.fx.start_regen) });
    return u;
  });

  const enemyUnits: CombatantRuntime[] = [];
  if (encounterKind === 'gatekeeper') {
    const gk = EXPEDITION_GATEKEEPERS_BY_ID[targetId];
    if (!gk || gk.mapId !== mapId) throw new Error('Chốt Quái Gác Cổng không hợp lệ.');
    gk.enemies.forEach((e, idx) => enemyUnits.push(enemyUnit(e, idx)));
  } else if (encounterKind === 'wild') {
    const pack = EXPEDITION_WILD_PACKS_BY_ID[targetId];
    if (!pack || pack.mapId !== mapId) throw new Error('Đàn quái không hợp lệ.');
    const tier = EXPEDITION_REALMS_BY_ID[mapId]?.order ?? 1;
    pack.monsterIds.forEach((mid, idx) => enemyUnits.push(enemyUnit(makeMonsterTemplate(mid, tier), idx, 'wild')));
  } else {
    const boss = EXPEDITION_BOSSES_BY_ID[targetId];
    if (!boss || boss.mapId !== mapId) throw new Error('Đại Trùm không hợp lệ.');
    const p1 = boss.phases[0];
    const k = EXP_BALANCE.enemy;
    const bossHp = Math.round(boss.maxHp * k.bossHp);
    enemyUnits.push({
      unitUid: `boss_0_${boss.bossId}`,
      side: 'enemy',
      templateId: boss.bossId,
      nameVi: boss.nameVi,
      element: boss.element,
      weakness: boss.weakness,
      resists: [boss.element],
      hp: bossHp,
      maxHp: bossHp,
      atk: Math.round(boss.atk * k.bossAtk),
      def: Math.round(boss.def * k.def),
      spd: boss.spd,
      critRate: 0.12,
      critDmg: 1.5,
      ap: 0,
      breakGauge: 0,
      maxBreak: boss.maxBreak,
      staggerTurns: 0,
      shieldHp: 0,
      spdBuffTurns: 0,
      vulnDebuffTurns: 0,
      actionValue: Math.round(10000 / boss.spd),
      phaseIndex: 1,
      breakShieldActive: Boolean(p1?.breakShieldActive),
      alive: true,
      statuses: [],
      spriteRef: `units/bosses/${boss.spriteKey}-battle.png`,
      isBoss: true,
      aiStyle: 'brute',
      aiCooldowns: {},
    });
  }

  const difficulty = profile.difficulty === 'story' ? .8 : profile.difficulty === 'hard' ? 1.2 : 1;
  for (const enemy of enemyUnits) {
    enemy.atk = Math.round(enemy.atk * difficulty);
    enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * difficulty));
    enemy.hp = enemy.maxHp;
  }
  const session: BattleSessionState = {
    battleId,
    battleSeed,
    mapId,
    encounterKind,
    targetId,
    state: 'INIT_SCENE',
    round: 1,
    combatants: [...partyUnits.slice(0, partyIds.length), ...enemyUnits],
    reserves: partyUnits.slice(partyIds.length),
    supplies: { ...(profile.supplies ?? { tonic: 2, spark: 1, revive: 1 }) },
    turnOrderPreview: [],
    activeActorUid: '',
    bossMoveCursor: 0,
    createdAt: Date.now(),
    enemyIntent: null,
  };

  advanceToNextActor(session);
  return session;
}

// ---------------------------------------------------------------- skill resolution (shared with client UI)

export interface ResolvedSkill {
  skill: CombatSkillDefinition;
  apCost: number;
  power: number;
  brk: number;
  hits: SkillHitBeat[];
  effects: SkillEffect[];
  consume: boolean;
  element: ElementType;
}

/** Kỹ năng sau khi áp cây kỹ năng + bùa (AP, nhịp đánh, hiệu ứng) cho 1 anh hùng trong trận. */
export function resolveSkillFor(actor: CombatantRuntime, skill: CombatSkillDefinition): ResolvedSkill {
  const mod = actor.skillMods?.[skill.skillId];
  const kit = SKILL_KITS[skill.skillId];
  const hits: SkillHitBeat[] = skill.hits.map((h) => ({ ...h }));
  const offensive = skill.targetScope === 'single_enemy' || skill.targetScope === 'all_enemies';
  if (mod?.extraHit && offensive && hits.length) {
    const totalPow = hits.reduce((s, h) => s + h.powerMult, 0);
    const avgBrk = hits.reduce((s, h) => s + h.breakDamage, 0) / hits.length;
    const last = hits[hits.length - 1];
    hits.push({ powerMult: +(totalPow * mod.extraHit).toFixed(2), breakDamage: Math.round(avgBrk), timedHitOffsetMs: last.timedHitOffsetMs + 240 });
  }
  const apCost = skill.apCost > 0 ? Math.max(1, skill.apCost + (mod?.ap ?? 0)) : 0;
  return {
    skill,
    apCost,
    power: 1 + (mod?.power ?? 0),
    brk: 1 + (mod?.brk ?? 0),
    hits,
    effects: [...(kit?.effects ?? []), ...((mod?.effects as SkillEffect[] | undefined) ?? [])],
    consume: Boolean(kit?.consume || skill.slotKind === 'ultimate'),
    element: skill.slotKind === 'basic' && actor.imbue ? actor.imbue : skill.element,
  };
}

// ---------------------------------------------------------------- core helpers

function applyDamageToUnit(target: CombatantRuntime, rawDmg: number, events?: TurnResolutionEvent[]): number {
  if ((target.wardHits ?? 0) > 0) {
    target.wardHits = (target.wardHits ?? 0) - 1;
    return 0;
  }
  let dmg = Math.max(1, Math.round(rawDmg));
  if (target.shieldHp > 0) {
    const absorbed = Math.min(target.shieldHp, dmg);
    target.shieldHp -= absorbed;
    dmg -= absorbed;
  }
  if (target.side === 'party' && target.hp - dmg <= 0 && fx(target, 'last_stand') > 0 && !target.lastStandUsed) {
    target.lastStandUsed = true;
    const dealt = target.hp - 1;
    target.hp = 1;
    events?.push({ kind: 'last_stand', actorUid: target.unitUid, targetUid: target.unitUid });
    return dealt;
  }
  target.hp = Math.max(0, target.hp - dmg);
  if (target.hp === 0 && target.alive && fx(target, 'revive_once') && !target.reviveCharmUsed) {
    target.hp = Math.max(1, Math.round(target.maxHp * fx(target, 'revive_once')));
    target.reviveCharmUsed = true;
    events?.push({ kind: 'last_stand', actorUid: target.unitUid, targetUid: target.unitUid });
    return dmg;
  }
  if (target.hp > 0 && target.hp < target.maxHp * .3 && fx(target, 'low_ward') && !target.lowWardUsed) {
    target.wardHits = (target.wardHits ?? 0) + 1;
    target.lowWardUsed = true;
  }
  if (target.hp === 0 && target.alive) {
    target.alive = false;
    target.statuses = [];
    events?.push({ kind: 'death', actorUid: target.unitUid, targetUid: target.unitUid });
  }
  return dmg;
}

function wardAfterFall(session: BattleSessionState, fallen: CombatantRuntime): void {
  if (fallen.side !== 'party' || fallen.alive) return;
  for (const ally of session.combatants) {
    if (ally.side === 'party' && ally.alive && fx(ally, 'fall_ward')) ally.wardHits = (ally.wardHits ?? 0) + 1;
  }
}

function gainCharge(u: CombatantRuntime, n: number, events: TurnResolutionEvent[]): void {
  if (u.side !== 'party' || n <= 0 || !u.alive) return;
  const max = u.chargeMax ?? EXP_BALANCE.charge.defaultMax;
  const before = u.charge ?? 0;
  u.charge = Math.min(max, before + n);
  if (u.charge > before) events.push({ kind: 'charge_gain', actorUid: u.unitUid, amount: u.charge - before, stacks: u.charge });
}

/** Áp một trạng thái (có cộng dồn). Trả về true nếu áp thành công. */
function applyStatus(
  session: BattleSessionState,
  target: CombatantRuntime,
  id: StatusId,
  stacks: number,
  turns: number,
  source: CombatantRuntime,
  events: TurnResolutionEvent[],
): boolean {
  if (!target.alive) return false;
  let sid: StatusId = id;
  let st = stacks;
  if (sid === 'stun' && target.isBoss) {
    sid = 'slow';
    st = 2;
  }
  const def = STATUS_DEFS[sid];
  if (!def) return false;
  target.statuses ??= [];
  const extraTurns = source.side === 'party' ? Math.round(fx(source, 'status_turns')) : 0;
  const t = Math.max(1, turns + extraTurns);
  let power = effAtk(source) * (1 + fx(source, 'dot_power'));
  if (sid === 'burn' || sid === 'bleed') power = Math.round(power);
  const fresh = target.unitUid === session.activeActorUid;
  const cur = target.statuses.find((s) => s.id === sid);
  if (cur) {
    cur.stacks = Math.min(def.maxStacks, cur.stacks + st);
    cur.turns = Math.max(cur.turns, t);
    cur.power = Math.max(cur.power ?? 0, power);
    if (fresh) cur.fresh = true;
  } else {
    target.statuses.push({ id: sid, stacks: Math.min(def.maxStacks, st), turns: t, power, ...(fresh ? { fresh: true } : {}) });
  }
  events.push({ kind: 'status_apply', actorUid: source.unitUid, targetUid: target.unitUid, statusId: sid, stacks: stacksOf(target, sid) });

  // Tê Cóng đủ tầng -> Đóng Băng
  if (sid === 'frostbite' && stacksOf(target, 'frostbite') >= S.freezeAtStacks) {
    removeStatus(target, 'frostbite');
    if (target.isBoss) {
      applyStatus(session, target, 'slow', 2, 2, source, events);
    } else {
      target.statuses.push({ id: 'stun', stacks: 1, turns: 1 });
      if (target.aiCharging) {
        target.aiCharging = undefined;
        events.push({ kind: 'charge_interrupt', actorUid: source.unitUid, targetUid: target.unitUid });
      }
    }
    events.push({ kind: 'freeze', actorUid: source.unitUid, targetUid: target.unitUid });
  }
  if (sid === 'stun' && target.aiCharging) {
    target.aiCharging = undefined;
    events.push({ kind: 'charge_interrupt', actorUid: source.unitUid, targetUid: target.unitUid });
  }
  return true;
}

function triggerStagger(session: BattleSessionState, tgt: CombatantRuntime, by: CombatantRuntime, events: TurnResolutionEvent[]): void {
  tgt.staggerTurns = 1;
  tgt.breakShieldActive = false;
  tgt.actionValue += Math.round(5000 / effectiveSpeed(tgt));
  events.push({ kind: 'break_stagger', actorUid: by.unitUid, targetUid: tgt.unitUid });
  if (tgt.aiCharging) {
    tgt.aiCharging = undefined;
    events.push({ kind: 'charge_interrupt', actorUid: by.unitUid, targetUid: tgt.unitUid });
  }
}

function checkBossPhaseTransitions(session: BattleSessionState, events: TurnResolutionEvent[]): void {
  if (session.encounterKind !== 'boss') return;
  const bossDef = EXPEDITION_BOSSES_BY_ID[session.targetId];
  const bossUnit = session.combatants.find((c) => c.side === 'enemy' && c.alive);
  if (!bossDef || !bossUnit) return;

  const hpRatio = bossUnit.hp / bossUnit.maxHp;
  for (const ph of bossDef.phases) {
    if (ph.phaseIndex > bossUnit.phaseIndex && hpRatio <= ph.hpThresholdRatio) {
      bossUnit.phaseIndex = ph.phaseIndex;
      bossUnit.atk = Math.round(bossDef.atk * ph.atkMult * EXP_BALANCE.enemy.bossAtk);
      bossUnit.spd = bossDef.spd + ph.spdBonus;
      bossUnit.breakShieldActive = Boolean(ph.breakShieldActive);
      if (ph.shiftElement) {
        bossUnit.element = ph.shiftElement;
        bossUnit.resists = [ph.shiftElement];
      }
      events.push({
        kind: 'boss_phase_shift',
        actorUid: bossUnit.unitUid,
        phaseTitleVi: ph.phaseTitleVi,
      });
    }
  }
}

function evaluateEndState(session: BattleSessionState): void {
  const anyPartyAlive = session.combatants.some((c) => c.side === 'party' && c.alive);
  const anyEnemyAlive = session.combatants.some((c) => c.side === 'enemy' && c.alive);
  if (!anyEnemyAlive) {
    session.state = 'VICTORY';
    session.enemyIntent = null;
  } else if (!anyPartyAlive) {
    const substitutes = session.reserves?.splice(0) ?? [];
    if (!substitutes.length) {
      session.state = 'DEFEAT';
      session.enemyIntent = null;
    } else {
      session.combatants = [...substitutes, ...session.combatants.filter((unit) => unit.side === 'enemy')];
      session.round += 1;
      advanceToNextActor(session);
    }
  } else {
    session.round += 1;
    advanceToNextActor(session);
  }
}

/** Đòn kẻ địch đang tới lượt sẽ dùng (đã chốt ý đồ). */
export function getActiveEnemyMove(session: BattleSessionState): EnemyMovePattern {
  const actor = session.combatants.find((c) => c.unitUid === session.activeActorUid);
  if (session.enemyIntent && session.enemyIntent.actorUid === session.activeActorUid) return session.enemyIntent.move;
  if (actor && actor.side === 'enemy') {
    session.enemyIntent = planEnemyIntent(session, actor);
    return session.enemyIntent.move;
  }
  return { moveId: 'none', nameVi: '—', telegraphVi: '', targetScope: 'single', hitBeatsMs: [], powerMult: 0, beamStyle: 'slash' };
}

/** Ai đang bị nhắm trong lượt địch hiện tại. */
export function getEnemyIntentTargets(session: BattleSessionState): string[] {
  getActiveEnemyMove(session);
  return session.enemyIntent?.targetUids ?? [];
}

/** A party slot can be swapped only with an ally whose turn also precedes the next enemy. */
export function selectablePartyActors(session: BattleSessionState): CombatantRuntime[] {
  const scheduled = session.combatants.find((unit) => unit.unitUid === session.activeActorUid && unit.alive);
  if (session.state !== 'PLAYER_MENU_SELECT' || scheduled?.side !== 'party') return [];
  const enemyTime = Math.min(...session.combatants.filter((unit) => unit.side === 'enemy' && unit.alive).map((unit) => unit.actionValue));
  return [scheduled, ...session.combatants.filter((unit) => unit !== scheduled && unit.side === 'party' && unit.alive
    && unit.actionValue < enemyTime && unit.staggerTurns === 0 && stacksOf(unit, 'stun') === 0)];
}

function endOfTurnTick(actor: CombatantRuntime): void {
  if (actor.spdBuffTurns > 0) actor.spdBuffTurns -= 1;
  if (actor.vulnDebuffTurns > 0) actor.vulnDebuffTurns -= 1;
  if (actor.statuses?.length) {
    for (const s of actor.statuses) {
      if (s.fresh) delete s.fresh;
      else s.turns -= 1;
    }
    actor.statuses = actor.statuses.filter((s) => s.turns > 0 && s.stacks > 0);
  }
  if (actor.aiCooldowns) {
    for (const k of Object.keys(actor.aiCooldowns)) {
      actor.aiCooldowns[k] = Math.max(0, actor.aiCooldowns[k] - 1);
    }
  }
  actor.actionValue = Math.round(10000 / effectiveSpeed(actor));
}

/** Đầu lượt: hồi Tái Sinh, sát thương Thiêu Đốt / Xuất Huyết. */
function startOfTurnTick(session: BattleSessionState, actor: CombatantRuntime, events: TurnResolutionEvent[]): void {
  if (actor.shieldHp > 0) actor.shieldHp = Math.floor(actor.shieldHp * (1 - EXP_BALANCE.combat.shieldDecay));
  const regen = stacksOf(actor, 'regen');
  if (regen > 0 && actor.hp < actor.maxHp) {
    const amt = Math.round(actor.maxHp * S.regenPct * regen);
    actor.hp = Math.min(actor.maxHp, actor.hp + amt);
    events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: actor.unitUid, amount: amt, statusId: 'regen' });
  }
  for (const id of ['burn', 'bleed'] as const) {
    const s = actor.statuses?.find((x) => x.id === id);
    if (!s || !actor.alive) continue;
    const per = id === 'burn' ? S.burnPerStack : S.bleedPerStack;
    const dmg = (s.power ?? 50) * per * s.stacks * (actor.isBoss ? S.bossDotMult : 1);
    const dealt = applyDamageToUnit(actor, dmg, events);
    wardAfterFall(session, actor);
    events.push({ kind: 'status_tick', actorUid: actor.unitUid, targetUid: actor.unitUid, amount: dealt, statusId: id, stacks: s.stacks });
  }
}

// ---------------------------------------------------------------- turn execution

export function executeTurnAction(
  session: BattleSessionState,
  action: TurnActionRecord,
  rng: Mulberry32,
): TurnResolutionEvent[] {
  if (session.state === 'VICTORY' || session.state === 'DEFEAT') {
    throw new Error('Trận đấu đã kết thúc.');
  }
  const scheduled = session.combatants.find((c) => c.unitUid === session.activeActorUid && c.alive);
  const actor = scheduled?.unitUid === action.actorUid ? scheduled
    : (action.kind === 'player_skill' || action.kind === 'player_item') ? selectablePartyActors(session).find((unit) => unit.unitUid === action.actorUid) : undefined;
  if (!scheduled || !actor) {
    throw new Error(`Sai thứ tự lượt hành động (kỳ vọng ${session.activeActorUid}).`);
  }
  if (actor !== scheduled) {
    [actor.actionValue, scheduled.actionValue] = [scheduled.actionValue, actor.actionValue];
    session.activeActorUid = actor.unitUid;
  }

  const events: TurnResolutionEvent[] = [];

  // Tick passive start-of-turn for Lumina
  if (actor.side === 'party' && actor.templateId === 'lumina_chrono') {
    for (const ally of session.combatants.filter((c) => c.side === 'party' && c.alive)) {
      const heal = Math.round(ally.maxHp * 0.06);
      ally.hp = Math.min(ally.maxHp, ally.hp + heal);
      events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: ally.unitUid, amount: heal });
    }
  }

  startOfTurnTick(session, actor, events);
  if (!actor.alive) {
    session.state = 'CHECK_BREAK_AND_PHASE';
    checkBossPhaseTransitions(session, events);
    evaluateEndState(session);
    return events;
  }

  // Đóng Băng / Choáng: mất lượt
  if (stacksOf(actor, 'stun') > 0) {
    removeStatus(actor, 'stun');
    events.push({ kind: 'stagger_skip', actorUid: actor.unitUid, statusId: 'stun' });
    endOfTurnTick(actor);
    session.state = 'CHECK_BREAK_AND_PHASE';
    checkBossPhaseTransitions(session, events);
    evaluateEndState(session);
    return events;
  }

  // Staggered unit skips turn cleanly
  if (actor.staggerTurns > 0) {
    actor.staggerTurns -= 1;
    if (actor.staggerTurns === 0) actor.breakGauge = 0;
    actor.aiCharging = undefined;
    events.push({ kind: 'stagger_skip', actorUid: actor.unitUid });
    endOfTurnTick(actor);
    checkBossPhaseTransitions(session, events);
    evaluateEndState(session);
    return events;
  }

  if (actor.side === 'party') {
    if (action.kind === 'player_item') {
      const item = action.itemId;
      if (item !== 'tonic' && item !== 'spark' && item !== 'revive') throw new Error('Vật phẩm không hợp lệ.');
      if (!session.supplies?.[item]) throw new Error('Đã hết vật phẩm.');
      const target = action.targetUid ? session.combatants.find((unit) => unit.side === 'party' && unit.unitUid === action.targetUid) : actor;
      if (!target || (item === 'revive' ? target.alive : !target.alive)) throw new Error('Mục tiêu không hợp lệ.');
      session.supplies[item] = (session.supplies[item] ?? 0) - 1;
      if (item === 'spark') target.ap = clampAp(target.ap + 3);
      else {
        const previous = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + Math.max(1, Math.round(target.maxHp * .4)));
        if (!target.alive) target.actionValue = 10000 / target.spd;
        target.alive = true;
        events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: target.unitUid, amount: target.hp - previous });
      }
    } else executeHeroSkill(session, actor, action, rng, events);
  } else {
    executeEnemyTurn(session, actor, action, rng, events);
  }

  endOfTurnTick(actor);
  session.state = 'CHECK_BREAK_AND_PHASE';
  if (actor.side === 'party' && actor.alive && fx(actor, 'opening_extra') && !actor.openingExtraUsed) {
    actor.openingExtraUsed = true;
    actor.actionValue = -1;
  }
  checkBossPhaseTransitions(session, events);
  evaluateEndState(session);
  return events;
}

function executeHeroSkill(
  session: BattleSessionState,
  actor: CombatantRuntime,
  action: TurnActionRecord,
  rng: Mulberry32,
  events: TurnResolutionEvent[],
): void {
  if (action.kind !== 'player_skill' || !action.skillId) {
    throw new Error('Lượt Anh Hùng bắt buộc chọn một kỹ năng hợp lệ.');
  }
  const skill: CombatSkillDefinition | undefined = EXPEDITION_SKILLS_BY_ID[action.skillId];
  if (!skill || skill.heroId !== actor.templateId || skill.slotKind === 'passive') {
    throw new Error(`Kỹ năng ${action.skillId} không thuộc về ${actor.nameVi}.`);
  }
  if (actor.unlockedSkillIds && !actor.unlockedSkillIds.includes(skill.skillId)) {
    throw new Error(`Kỹ năng ${skill.nameVi} chưa được mở khóa.`);
  }
  if (skill.slotKind !== 'basic' && actor.equippedSkillIds && !actor.equippedSkillIds.includes(skill.skillId)) {
    throw new Error('Kỹ năng chưa được gắn.');
  }
  const rs = resolveSkillFor(actor, skill);
  const sLv = actor.skillLevels?.[skill.skillId] ?? 1;
  const sPow = skillPowerMult(sLv) * rs.power;
  const sBrk = skillBreakMult(sLv) * rs.brk;
  if (actor.ap < rs.apCost) {
    throw new Error(`Không đủ AP (cần ${rs.apCost}, hiện có ${actor.ap}).`);
  }
  const mech = heroMechanicOf(actor.templateId);

  session.state = 'PLAYER_TIMED_HIT_EXEC';
  const apBefore = actor.ap;
  actor.ap = clampAp(actor.ap - rs.apCost + skill.apGain);

  const grades = action.timedHitGrades ?? [];

  events.push({ kind: 'skill_cast', actorUid: actor.unitUid, skillNameVi: skill.nameVi });

  // ---- Cộng Hưởng: xả stack
  let burstStacks = 0;
  let full = false;
  if (rs.consume && (actor.charge ?? 0) > 0) {
    burstStacks = actor.charge ?? 0;
    full = burstStacks >= (actor.chargeMax ?? mech.max);
    actor.charge = 0;
    events.push({ kind: 'charge_burst', actorUid: actor.unitUid, amount: burstStacks, stacks: full ? 1 : 0 });
  }
  const burstDmg = 1 + burstStacks * (EXP_BALANCE.charge.perStackDamage + (actor.chargePower ?? 0));
  const burstSup = 1 + burstStacks * EXP_BALANCE.charge.perStackSupport;
  if (full && mech.fullBonus === 'ap') actor.ap = clampAp(actor.ap + 2);

  const partyAlive = () => session.combatants.filter((c) => c.side === 'party' && c.alive);
  const enemiesAlive = () => session.combatants.filter((c) => c.side === 'enemy' && c.alive);

  // Support / Heal / Shield / AP grant effects
  const allies =
    skill.targetScope === 'all_allies'
      ? partyAlive()
      : skill.targetScope === 'single_ally'
        ? partyAlive().filter((c) => !action.targetUid || c.unitUid === action.targetUid).slice(0, 1)
        : skill.targetScope === 'self'
          ? [actor]
          : [];
  const supportTargets = allies.length ? allies : partyAlive();
  let supported = false;
  const healMult = (1 + fx(actor, 'heal_power')) * burstSup * (full && mech.fullBonus === 'heal' ? 1.3 : 1);
  if (skill.healRatio) {
    const bonus = grades[0] === 'perfect' ? 1.2 : grades[0] === 'good' ? 1.1 : 1.0;
    for (const ally of supportTargets) {
      const amt = Math.round(effAtk(actor) * skill.healRatio * bonus * sPow * healMult * EXP_BALANCE.combat.healScale);
      ally.hp = Math.min(ally.maxHp, ally.hp + amt);
      events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: ally.unitUid, amount: amt, grade: grades[0] });
    }
    supported = true;
  }
  if (skill.shieldRatio) {
    const shMult = (1 + fx(actor, 'heal_power')) * burstSup * (full && mech.fullBonus === 'shield' ? 1.3 : 1);
    for (const ally of partyAlive()) {
      const sh = Math.round(actor.maxHp * skill.shieldRatio * sPow * shMult * EXP_BALANCE.combat.shieldScale);
      ally.shieldHp = Math.max(ally.shieldHp, sh);
      events.push({ kind: 'shield', actorUid: actor.unitUid, targetUid: ally.unitUid, amount: sh });
    }
    supported = true;
  }
  if (full && mech.fullBonus === 'shield') applyStatus(session, actor, 'taunt', 1, 2, actor, events);
  if (full && mech.fullBonus === 'heal') {
    for (const ally of partyAlive()) cleanseUnit(ally, actor, events);
  }
  if (skill.apGrantAlly) {
    for (const ally of partyAlive().filter((c) => c.unitUid !== actor.unitUid)) {
      ally.ap = clampAp(ally.ap + skill.apGrantAlly);
      events.push({ kind: 'ap_grant', actorUid: actor.unitUid, targetUid: ally.unitUid, amount: skill.apGrantAlly });
    }
    supported = true;
  }
  if (skill.speedBuffTurns) {
    for (const ally of partyAlive()) applyStatus(session, ally, 'haste', 1, skill.speedBuffTurns, actor, events);
    supported = true;
  }

  // ---- Offensive hits
  const offensive = skill.targetScope === 'single_enemy' || skill.targetScope === 'all_enemies';
  let primaryTargets: CombatantRuntime[] = [];
  let anyWeak = false;
  let anyCrit = false;
  let anyStaggeredHit = false;
  let causedBreak = false;
  let perfectBeats = 0;
  if (offensive) {
    const aliveEnemies = enemiesAlive();
    primaryTargets =
      skill.targetScope === 'all_enemies'
        ? aliveEnemies
        : [aliveEnemies.find((e) => e.unitUid === action.targetUid) ?? aliveEnemies[0]].filter(Boolean);

    rs.hits.forEach((beat, beatIdx) => {
      if (beat.powerMult <= 0) return;
      const g: TimedHitGrade = grades[beatIdx] ?? 'miss';
      if (g === 'perfect') perfectBeats += 1;
      const timedDmgMult =
        g === 'perfect' ? (actor.templateId === 'gustave_blade' ? 1.4 : 1.25) : g === 'good' ? 1.12 : 1.0;
      const timedBreakMult = g === 'perfect' ? 1.3 : g === 'good' ? 1.1 : 1.0;

      for (const tgt of primaryTargets) {
        if (!tgt.alive) continue;
        const aff = affinityOf(rs.element, tgt);
        const weak = aff === 'weak';
        if (weak) anyWeak = true;
        if (weak && actor.templateId === 'marina_abyss' && beatIdx === 0) {
          actor.ap = clampAp(actor.ap + 1);
        }
        const critBonus = (actor.templateId === 'ignis_valkyrie' && apBefore >= 5 ? 0.2 : 0) + S.critUp * stacksOf(actor, 'crit_up');
        const critRoll = rng.next() < Math.min(1.0, actor.critRate + critBonus);
        const isCrit =
          critRoll || (g === 'perfect' && fx(actor, 'perfect_crit') > 0) || (full && mech.fullBonus === 'crit' && burstStacks > 0);
        if (isCrit) anyCrit = true;
        const staggerMult =
          tgt.staggerTurns > 0 ? (actor.templateId === 'corvus_night' ? 1.85 : 1.5) + fx(actor, 'stagger_power') : 1.0;
        const vulnMult = 1 + S.vuln * stacksOf(tgt, 'vuln') + (tgt.vulnDebuffTurns > 0 ? 0.25 : 0);
        const markMult = stacksOf(tgt, 'mark') > 0 ? 1 + S.markBonus : 1;
        if (markMult > 1) removeStatus(tgt, 'mark');
        const shieldDampen = tgt.breakShieldActive && tgt.staggerTurns === 0 ? 0.55 : 1.0;
        const elemMult = affinityDamageMult(aff) + (weak ? fx(actor, 'weak_power') : 0);
        const pierce = full && mech.fullBonus === 'pierce' ? 0.5 : 1;
        const defMitigation = 100 / (100 + effDef(tgt) * pierce);
        const lowHp = actor.hp / actor.maxHp < 0.5 ? fx(actor, 'low_hp_power') : 0;
        const situational =
          1 + lowHp + fx(actor, 'debuff_power') * Math.min(4, debuffCount(tgt)) + (skill.slotKind === 'ultimate' ? fx(actor, 'ult_power') : 0);
        const critMult = isCrit ? actor.critDmg + (actor.templateId === 'aurelia_eclipse' ? 0.25 : 0)
          + (actor.hp < actor.maxHp * .3 ? fx(actor, 'low_crit_30') : 0) : 1.0;

        let raw =
          effAtk(actor) *
          beat.powerMult *
          sPow *
          timedDmgMult *
          elemMult *
          staggerMult *
          vulnMult *
          markMult *
          shieldDampen *
          critMult *
          situational *
          burstDmg *
          defMitigation;
        const bleed = tgt.statuses?.find((s) => s.id === 'bleed');
        if (bleed) raw += (bleed.power ?? 0) * S.bleedOnHitPerStack * bleed.stacks;

        if (tgt.staggerTurns > 0) anyStaggeredHit = true;
        if (tgt.statuses?.some((status) => status.id === 'burn')) raw *= 1 + fx(actor, 'burn_power');
        const dealt = applyDamageToUnit(tgt, raw, events);
        const roleBreakMult = actor.templateId === 'lyra_frostbow' ? 1.3 : 1.0;
        const brkAdd =
          tgt.staggerTurns > 0
            ? 0
            : Math.round(
                beat.breakDamage *
                  timedBreakMult *
                  affinityBreakMult(aff) *
                  roleBreakMult *
                  sBrk *
                  (1 + fx(actor, 'break_power')) *
                  (full && mech.fullBonus === 'break' ? 1.5 : 1),
              );
        tgt.breakGauge = Math.min(tgt.maxBreak, tgt.breakGauge + brkAdd);

        events.push({
          kind: 'hit',
          actorUid: actor.unitUid,
          targetUid: tgt.unitUid,
          amount: dealt,
          breakAdded: brkAdd,
          grade: g,
          isWeakness: weak,
          affinity: aff,
          isCrit,
        });

        const ls = fx(actor, 'lifesteal');
        if (ls > 0 && dealt > 0) {
          const heal = Math.round(dealt * ls);
          actor.hp = Math.min(actor.maxHp, actor.hp + heal);
          events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: actor.unitUid, amount: heal });
        }

        if (tgt.alive && tgt.staggerTurns === 0 && tgt.breakGauge >= tgt.maxBreak && skill.canTriggerBreak) {
          triggerStagger(session, tgt, actor, events);
          causedBreak = true;
          if (actor.templateId === 'aurelia_eclipse') actor.ap = clampAp(actor.ap + 1);
        } else if (!tgt.alive) {
          if (actor.templateId === 'aurelia_eclipse') actor.ap = clampAp(actor.ap + 1);
          if (fx(actor, 'kill_ap') > 0) actor.ap = clampAp(actor.ap + fx(actor, 'kill_ap'));
        }
      }
    });
  }

  // ---- Hiệu ứng kỹ năng (trạng thái, thanh tẩy, kích nổ)
  let appliedDebuff = false;
  const effectList: SkillEffect[] = [...rs.effects];
  if (skill.vulnDebuffTurns) effectList.push({ kind: 'status', status: 'vuln', stacks: 1, turns: skill.vulnDebuffTurns, to: offensive ? 'target' : 'enemies' });
  if (skill.slotKind === 'basic') {
    for (const sid of actor.basicStatuses ?? []) effectList.push({ kind: 'status', status: sid as StatusId, stacks: 1, turns: 3, to: 'target' });
  }
  const resolveTargets = (to: string): CombatantRuntime[] => {
    switch (to) {
      case 'target':
        return (primaryTargets.length ? primaryTargets : enemiesAlive().slice(0, 1)).filter((t) => t.alive);
      case 'enemies':
        return enemiesAlive();
      case 'self':
        return [actor];
      case 'allies':
        return partyAlive();
      case 'ally': {
        const sel = partyAlive().find((p) => p.unitUid === action.targetUid);
        return [sel ?? [...partyAlive()].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]].filter(Boolean);
      }
      default:
        return [];
    }
  };
  for (const e of effectList) {
    if (e.kind === 'status') {
      if (e.chance !== undefined && e.chance < 1 && rng.next() >= e.chance) continue;
      for (const t of resolveTargets(e.to)) {
        if (applyStatus(session, t, e.status, e.stacks, e.turns, actor, events) && t.side === 'enemy') appliedDebuff = true;
      }
    } else if (e.kind === 'cleanse') {
      for (const t of resolveTargets(e.to)) cleanseUnit(t, actor, events);
      supported = true;
    } else if (e.kind === 'dispel') {
      for (const t of resolveTargets(e.to)) {
        const before = t.statuses?.length ?? 0;
        t.statuses = (t.statuses ?? []).filter((s) => STATUS_DEFS[s.id as StatusId]?.kind !== 'buff');
        if ((t.statuses.length ?? 0) < before) events.push({ kind: 'dispel', actorUid: actor.unitUid, targetUid: t.unitUid });
      }
    } else if (e.kind === 'detonate') {
      const pool = primaryTargets.length ? primaryTargets : enemiesAlive();
      for (const t of pool) {
        const s = t.statuses?.find((x) => x.id === e.status);
        if (!s || !t.alive) continue;
        const dmg = Math.max(effAtk(actor), s.power ?? 0) * e.mult * s.stacks * (t.isBoss ? 0.8 : 1);
        removeStatus(t, e.status);
        const dealt = applyDamageToUnit(t, dmg, events);
        events.push({ kind: 'detonate', actorUid: actor.unitUid, targetUid: t.unitUid, amount: dealt, statusId: e.status, stacks: s.stacks });
      }
    }
  }

  // ---- Cộng Hưởng: tích stack
  const g = mech.gain;
  let gain = 0;
  if (skill.slotKind === 'basic') gain += (g.basic ?? 0) + (actor.chargeBasic ?? 0);
  gain += (g.perfectBeat ?? 0) * perfectBeats;
  if (anyWeak) gain += g.weakHit ?? 0;
  const charmAp = (anyWeak ? fx(actor, 'weak_ap') : 0) + (anyStaggeredHit ? fx(actor, 'stagger_ap') : 0);
  if (charmAp > 0) {
    const oldAp = actor.ap;
    actor.ap = clampAp(actor.ap + charmAp);
    if (actor.ap > oldAp) events.push({ kind: 'ap_grant', actorUid: actor.unitUid, targetUid: actor.unitUid, amount: actor.ap - oldAp });
  }
  if (causedBreak && actor.alive && fx(actor, 'break_heal') > 0) {
    const heal = Math.min(actor.maxHp - actor.hp, Math.round(actor.maxHp * fx(actor, 'break_heal')));
    actor.hp += heal;
    if (heal > 0) events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: actor.unitUid, amount: heal });
  }
  if (anyCrit) gain += g.crit ?? 0;
  if (supported) gain += g.support ?? 0;
  if (appliedDebuff) gain += g.statusApplied ?? 0;
  if (!rs.consume || burstStacks === 0) gainCharge(actor, gain, events);
  else gainCharge(actor, Math.min(gain, 1), events);
}

function cleanseUnit(t: CombatantRuntime, by: CombatantRuntime, events: TurnResolutionEvent[]): void {
  const before = t.statuses?.length ?? 0;
  t.statuses = (t.statuses ?? []).filter((s) => STATUS_DEFS[s.id as StatusId]?.kind !== 'debuff');
  t.vulnDebuffTurns = 0;
  if ((t.statuses.length ?? 0) < before) events.push({ kind: 'cleanse', actorUid: by.unitUid, targetUid: t.unitUid });
}

function executeEnemyTurn(
  session: BattleSessionState,
  actor: CombatantRuntime,
  action: TurnActionRecord,
  rng: Mulberry32,
  events: TurnResolutionEvent[],
): void {
  session.state = 'DEFENSE_DODGE_PARRY_WINDOW';
  const intent =
    session.enemyIntent && session.enemyIntent.actorUid === actor.unitUid ? session.enemyIntent : planEnemyIntent(session, actor);
  const move = intent.move;
  if (actor.isBoss) session.bossMoveCursor += 1;
  if (move.cooldown) {
    actor.aiCooldowns ??= {};
    actor.aiCooldowns[move.moveId] = move.cooldown + 1;
  }
  if (!actor.isBoss && move.hitBeatsMs.length) actor.aiHistory = [...(actor.aiHistory ?? []).slice(-1), move.moveId];

  events.push({ kind: 'skill_cast', actorUid: actor.unitUid, skillNameVi: move.nameVi });

  if (intent.charging) {
    actor.aiCharging = move.moveId;
    events.push({ kind: 'charging', actorUid: actor.unitUid, skillNameVi: move.nameVi });
    return;
  }
  actor.aiCharging = undefined;

  // Đòn hỗ trợ (buff bản thân / đồng minh, hồi máu)
  if (move.targetScope === 'self' || move.targetScope === 'allies') {
    const mates = session.combatants.filter((c) => c.side === 'enemy' && c.alive);
    const recips = move.targetScope === 'self' ? [actor] : mates;
    for (const s of move.selfApplies ?? []) {
      for (const r of recips) applyStatus(session, r, s.status as StatusId, s.stacks, s.turns, actor, events);
    }
    if (move.healRatio) {
      const weakest = [...mates].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (weakest) {
        const amt = Math.round(weakest.maxHp * move.healRatio);
        weakest.hp = Math.min(weakest.maxHp, weakest.hp + amt);
        events.push({ kind: 'heal', actorUid: actor.unitUid, targetUid: weakest.unitUid, amount: amt });
      }
    }
    return;
  }

  const aliveParty = session.combatants.filter((c) => c.side === 'party' && c.alive);
  let targets = intent.targetUids
    .map((uid) => aliveParty.find((p) => p.unitUid === uid))
    .filter((x): x is CombatantRuntime => Boolean(x));
  if (!targets.length) {
    targets = move.targetScope === 'all' ? aliveParty : [aliveParty[Math.floor(rng.next() * aliveParty.length)]].filter(Boolean);
  }

  for (const hero of targets) {
    const heroDefenses = action.defenseGrades?.[hero.unitUid] ?? [];
    let parriedAllBeats = move.hitBeatsMs.length > 0;
    let landed = 0;
    let parryApGiven = false;
    let evadeApGiven = false;
    let parryChargeGiven = false;
    let dodgeShieldGiven = false;

    move.hitBeatsMs.forEach((_, beatIdx) => {
      if (!hero.alive || !actor.alive) return;
      const raw: DefenseGrade = heroDefenses[beatIdx] ?? 'hit';
      const special = move.specialFrom !== undefined && beatIdx >= move.specialFrom;
      // Tuyệt Kỹ: chỉ 'counter' (phím W) có tác dụng; nhịp thường: 'counter' coi như bấm sai (trúng đòn)
      const dGrade: DefenseGrade = special ? (raw === 'counter' ? 'counter' : 'hit') : raw === 'counter' ? 'hit' : raw;
      if (dGrade === 'counter') {
        // PHẢN DAMAGE: không mất máu, trả ngược sát thương Tuyệt Kỹ (× 1,25) lên chính con quái + lực tay của anh hùng.
        // Tuyệt Kỹ đánh toàn đội: mỗi anh hùng counter đều phản damage riêng → cả đội cùng phản.
        hero.ap = clampAp(hero.ap + 2);
        const aff = affinityOf(hero.element, actor);
        const defMitC = 100 / (100 + effDef(actor));
        const incoming = effAtk(actor) * (move.powerMult / Math.max(1, move.hitBeatsMs.length)) * (move.specialPower ?? 1.6);
        const dmg = applyDamageToUnit(actor, (incoming * 1.25 + effAtk(hero) * 0.6 * affinityDamageMult(aff)) * defMitC, events);
        events.push({ kind: 'parry_counter', actorUid: hero.unitUid, targetUid: actor.unitUid, amount: dmg, affinity: aff });
        return;
      }
      if (dGrade === 'parry') {
        const recovery = fx(hero, 'parry_heal');
        if (recovery > 0) hero.hp = Math.min(hero.maxHp, hero.hp + Math.max(1, Math.round(hero.maxHp * recovery)));
        hero.ap = clampAp(hero.ap + 1);
        if (!parryApGiven && fx(hero, 'parry_ap') > 0) {
          hero.ap = clampAp(hero.ap + fx(hero, 'parry_ap'));
          parryApGiven = true;
        }
        gainCharge(hero, heroMechanicOf(hero.templateId).gain.parry ?? 0, events);
        if (!parryChargeGiven && fx(hero, 'parry_charge') > 0) {
          gainCharge(hero, fx(hero, 'parry_charge'), events);
          parryChargeGiven = true;
        }
        events.push({ kind: 'parry', actorUid: hero.unitUid, targetUid: actor.unitUid, grade: 'parry' });
      } else if (dGrade === 'dodge') {
        parriedAllBeats = false;
        if (hero.templateId === 'nereus_tide') {
          hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * 0.08));
        }
        const dh = fx(hero, 'dodge_heal');
        if (dh > 0) hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * dh));
        if (!dodgeShieldGiven && fx(hero, 'dodge_shield') > 0) {
          const shield = Math.min(hero.maxHp - hero.shieldHp, Math.round(hero.maxHp * fx(hero, 'dodge_shield')));
          if (shield > 0) {
            hero.shieldHp += shield;
            events.push({ kind: 'shield', actorUid: hero.unitUid, targetUid: hero.unitUid, amount: shield });
          }
          dodgeShieldGiven = true;
        }
        gainCharge(hero, heroMechanicOf(hero.templateId).gain.dodge ?? 0, events);
        events.push({ kind: 'dodge', actorUid: hero.unitUid, targetUid: actor.unitUid, grade: 'dodge' });
      } else {
        parriedAllBeats = false;
        // automatic evasion (EVA stat) on beats the player did not defend
        const pierce =
          session.encounterKind === 'boss' ? EXP_BALANCE.evasion.enemyEvaPierceBoss : EXP_BALANCE.evasion.enemyEvaPierceGatekeeper;
        if (rng.next() < Math.max(0, (hero.eva ?? 0) - pierce)) {
          if (!evadeApGiven && fx(hero, 'evade_ap') > 0) {
            hero.ap = clampAp(hero.ap + fx(hero, 'evade_ap'));
            evadeApGiven = true;
          }
          events.push({ kind: 'evade', actorUid: hero.unitUid, targetUid: actor.unitUid, grade: 'dodge' });
          return;
        }
        const perBeatMult = (move.powerMult / Math.max(1, move.hitBeatsMs.length)) * (special ? move.specialPower ?? 1.6 : 1);
        const defMit = 100 / (100 + effDef(hero));
        const af = EXP_BALANCE.affinity;
        const elemTaken =
          ELEMENT_ADVANTAGE[actor.element] === hero.element ? af.heroWeakTaken : ELEMENT_ADVANTAGE[hero.element] === actor.element ? af.heroResistTaken : 1;
        const vulnMult = 1 + S.vuln * stacksOf(hero, 'vuln');
        const shielded = (hero.wardHits ?? 0) > 0;
        const dealt = applyDamageToUnit(hero, effAtk(actor) * perBeatMult * defMit * elemTaken * vulnMult, events);
        wardAfterFall(session, hero);
        if (shielded) {
          events.push({ kind: 'shield', actorUid: hero.unitUid, targetUid: hero.unitUid });
          return;
        }
        landed += 1;
        if (move.apDrain) hero.ap = clampAp(hero.ap - move.apDrain);
        events.push({ kind: 'hit', actorUid: actor.unitUid, targetUid: hero.unitUid, amount: dealt, grade: 'hit' });
        const th = fx(hero, 'thorns');
        if (th > 0 && dealt > 0 && actor.alive) {
          const back = applyDamageToUnit(actor, dealt * th, events);
          events.push({ kind: 'thorns', actorUid: hero.unitUid, targetUid: actor.unitUid, amount: back });
        }
      }
    });

    if (landed > 0 && hero.alive) {
      gainCharge(hero, heroMechanicOf(hero.templateId).gain.hurt ?? 0, events);
      for (const ap of move.applies ?? []) {
        if (ap.chance !== undefined && ap.chance < 1 && rng.next() >= ap.chance) continue;
        applyStatus(session, hero, resolveAppliedStatus(ap.status, actor) as StatusId, ap.stacks, ap.turns, actor, events);
      }
    }

    // Full-combo Parry Counter Riposte
    if (parriedAllBeats && hero.alive && actor.alive) {
      const riposteMult =
        (hero.templateId === 'seraph_glacier' ? 1.95 : hero.templateId === 'bastian_aegis' ? 1.65 : 1.35) * (1 + fx(hero, 'counter_power'));
      const aff = affinityOf(hero.element, actor);
      const defMit = 100 / (100 + effDef(actor));
      const counterDmg = applyDamageToUnit(actor, effAtk(hero) * riposteMult * affinityDamageMult(aff) * defMit, events);
      const counterBrk = Math.round((aff === 'weak' ? 52 : 38) * (aff === 'resist' ? 0.6 : 1));
      actor.breakGauge = Math.min(actor.maxBreak, actor.breakGauge + counterBrk);
      events.push({
        kind: 'parry_counter',
        actorUid: hero.unitUid,
        targetUid: actor.unitUid,
        amount: counterDmg,
        breakAdded: counterBrk,
        affinity: aff,
      });
      if (actor.alive && actor.staggerTurns === 0 && actor.breakGauge >= actor.maxBreak) {
        triggerStagger(session, actor, hero, events);
      }
    }
  }
}

export function replayAndVerifyBattle(params: {
  battleId: string;
  battleSeed: number;
  profile: ExpeditionProfile;
  encounterKind: EncounterKind;
  targetId: string;
  mapId: RealmMapId;
  actionLog: readonly TurnActionRecord[];
  /** Ảnh chụp phiên do server tạo lúc bắt đầu trận. Phát lại từ đây để kết quả không đổi khi hồ sơ hoặc số liệu cân bằng đổi giữa trận. */
  initialSession?: BattleSessionState;
}): { outcome: 'victory' | 'defeat'; finalSession: BattleSessionState } {
  const { actionLog, initialSession, ...init } = params;
  if (!Array.isArray(actionLog) || actionLog.length === 0 || actionLog.length > 400) {
    throw new Error('Nhật ký lượt đánh không hợp lệ.');
  }
  const session = initialSession && initialSession.battleId === init.battleId && initialSession.battleSeed === init.battleSeed
    ? structuredClone(initialSession)
    : createBattleSession(init);
  const rng = new Mulberry32(init.battleSeed);

  for (let i = 0; i < actionLog.length; i++) {
    const rec = actionLog[i];
    if (rec.stepIndex !== i) throw new Error(`Thứ tự bước hành động bị lệch tại bước ${i}.`);
    executeTurnAction(session, rec, rng);
    if (session.state === 'VICTORY' || session.state === 'DEFEAT') break;
  }

  if (session.state !== 'VICTORY' && session.state !== 'DEFEAT') {
    throw new Error('Trận đấu chưa đi tới kết quả cuối cùng.');
  }
  return {
    outcome: session.state === 'VICTORY' ? 'victory' : 'defeat',
    finalSession: session,
  };
}
