/**
 * Authoritative 30Hz Simulation for Active Survival Gacha Skills:
 *  - `skill_lightning_orb`: Orbiting lightning spheres (+1 orb/stack) dealing periodic shock damage
 *  - `skill_fire_orb`: Counter-rotating fireball spheres (+1 orb/stack) dealing fire damage + burn DoT
 *  - `skill_spirit_sword`: Summons +1 homing sword around the hero every 5s; auto-aims, slices & pulls non-boss foes
 */
import { quantizeAim } from '../../../../shared/src';
import type { BansungDamageKind } from './damage';

export const GACHA_LIGHTNING_ORBIT_R = 74;
export const GACHA_FIRE_ORBIT_R = 92;
export const GACHA_LIGHTNING_OMEGA = 2.7;
export const GACHA_FIRE_OMEGA = -2.2;
export const GACHA_ORB_HIT_R = 20;
export const GACHA_LIGHTNING_ICD_MS = 420;
export const GACHA_FIRE_ICD_MS = 450;

export const GACHA_SWORD_COOLDOWN_MS = 5000;
export const GACHA_SWORD_HOVER_MS = 350;
export const GACHA_SWORD_DETECT_R = 620;
export const GACHA_SWORD_SPEED = 700;
export const GACHA_SWORD_PULL_MS = 280;
export const GACHA_SWORD_SAFE_BUFFER_R = 58;
const MAX_ACTIVE_SWORDS_PER_HERO = 6;
const MAX_PULL_STEP_PX = 24;

export interface GachaSkillHeroRef {
  id: string;
  idx: number;
  x: number;
  y: number;
  alive: boolean;
  downed?: boolean;
  dmgMul: number;
  skillStacks: Record<string, number>;
}

export interface GachaSkillEnemyRef {
  id: number;
  x: number;
  y: number;
  radius: number;
  isBoss: boolean;
  alive: boolean;
}

export interface GachaSkillHitEvent {
  ownerId: string;
  ownerIdx: number;
  targetId: number;
  damage: number;
  dmgKind: BansungDamageKind;
  applyBurn?: boolean;
  fxKind: 'lightning_orb' | 'fire_orb' | 'spirit_sword';
  x: number;
  y: number;
  pullDx?: number;
  pullDy?: number;
  isBossTarget: boolean;
}

export interface SpiritSwordInstance {
  id: number;
  ownerId: string;
  ownerIdx: number;
  x: number;
  y: number;
  aimRad: number;
  hoverAngle: number;
  state: 'hover' | 'dash' | 'pull';
  stateMs: number;
  targetId: number;
  damage: number;
  hitDone: boolean;
}

export interface GachaSkillsWorldState {
  nextSwordId: number;
  /** Periodic ICD timestamps per `${heroIdx}:${targetId}:l|f` */
  orbHitUntilMs: Map<string, number>;
  /** Remaining cooldown (ms) until next 5s Spirit Sword summon wave */
  swordCdMs: Map<string, number>;
  swords: SpiritSwordInstance[];
}

export function createGachaSkillsState(): GachaSkillsWorldState {
  return {
    nextSwordId: 1,
    orbHitUntilMs: new Map(),
    swordCdMs: new Map(),
    swords: [],
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function findNearestTargetsInRange(
  hx: number,
  hy: number,
  enemies: readonly GachaSkillEnemyRef[],
  maxRange: number,
  limit: number,
): GachaSkillEnemyRef[] {
  const maxR2 = maxRange * maxRange;
  const scored: { enemy: GachaSkillEnemyRef; d2: number }[] = [];
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const dx = e.x - hx;
    const dy = e.y - hy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxR2) {
      scored.push({ enemy: e, d2 });
    }
  }
  scored.sort((a, b) => a.d2 - b.d2);
  return scored.slice(0, limit).map((s) => s.enemy);
}

interface OrbitRingSpec {
  stackKey: 'skill_lightning_orb' | 'skill_fire_orb';
  tag: 'l' | 'f';
  fxKind: 'lightning_orb' | 'fire_orb';
  orbitR: number;
  omega: number;
  phaseOffset: number;
  icdMs: number;
  baseDmg: number;
  dmgKind: BansungDamageKind;
  applyBurn?: boolean;
}

const ORBIT_RING_SPECS: readonly OrbitRingSpec[] = [
  {
    stackKey: 'skill_lightning_orb',
    tag: 'l',
    fxKind: 'lightning_orb',
    orbitR: GACHA_LIGHTNING_ORBIT_R,
    omega: GACHA_LIGHTNING_OMEGA,
    phaseOffset: 0,
    icdMs: GACHA_LIGHTNING_ICD_MS,
    baseDmg: 16,
    dmgKind: 'energy',
  },
  {
    stackKey: 'skill_fire_orb',
    tag: 'f',
    fxKind: 'fire_orb',
    orbitR: GACHA_FIRE_ORBIT_R,
    omega: GACHA_FIRE_OMEGA,
    phaseOffset: Math.PI / 6,
    icdMs: GACHA_FIRE_ICD_MS,
    baseDmg: 14,
    dmgKind: 'fire',
    applyBurn: true,
  },
] as const;

function stepOrbitRingsForHero(
  state: GachaSkillsWorldState,
  hero: GachaSkillHeroRef,
  enemies: readonly GachaSkillEnemyRef[],
  nowMs: number,
  onHit: (ev: GachaSkillHitEvent) => void,
): void {
  const timeS = nowMs / 1000;
  for (const ring of ORBIT_RING_SPECS) {
    const count = Math.min(6, Math.max(0, Math.floor(hero.skillStacks[ring.stackKey] ?? 0)));
    if (count <= 0) continue;

    const hitDamage = Math.max(1, Math.round(ring.baseDmg * hero.dmgMul * (1 + (count - 1) * 0.08)));
    for (let k = 0; k < count; k++) {
      const ang = timeS * ring.omega + ring.phaseOffset + (k / count) * Math.PI * 2;
      const ox = hero.x + Math.cos(ang) * ring.orbitR;
      const oy = hero.y + Math.sin(ang) * ring.orbitR;

      for (let ei = 0; ei < enemies.length; ei++) {
        const enemy = enemies[ei];
        if (!enemy.alive) continue;
        const reach = GACHA_ORB_HIT_R + enemy.radius;
        const dx = enemy.x - ox;
        const dy = enemy.y - oy;
        if (dx * dx + dy * dy > reach * reach) continue;

        const key = `${hero.idx}:${enemy.id}:${ring.tag}`;
        const busyUntil = state.orbHitUntilMs.get(key) ?? 0;
        if (nowMs < busyUntil) continue;

        state.orbHitUntilMs.set(key, nowMs + ring.icdMs);
        onHit({
          ownerId: hero.id,
          ownerIdx: hero.idx,
          targetId: enemy.id,
          damage: hitDamage,
          dmgKind: ring.dmgKind,
          applyBurn: ring.applyBurn,
          fxKind: ring.fxKind,
          x: ox,
          y: oy,
          isBossTarget: enemy.isBoss,
        });
      }
    }
  }
}

function stepSpiritSwordSpawns(
  state: GachaSkillsWorldState,
  hero: GachaSkillHeroRef,
  enemies: readonly GachaSkillEnemyRef[],
  dtMs: number,
): void {
  const count = Math.min(
    MAX_ACTIVE_SWORDS_PER_HERO,
    Math.max(0, Math.floor(hero.skillStacks.skill_spirit_sword ?? 0)),
  );
  if (count <= 0) return;

  const prevCd = state.swordCdMs.get(hero.id) ?? 0;
  const remCd = Math.max(0, prevCd - dtMs);
  state.swordCdMs.set(hero.id, remCd);
  if (remCd > 0) return;

  const targets = findNearestTargetsInRange(hero.x, hero.y, enemies, GACHA_SWORD_DETECT_R, count);
  if (targets.length === 0) return; // Hold ready until an enemy enters auto-aim range

  state.swordCdMs.set(hero.id, GACHA_SWORD_COOLDOWN_MS);
  const dmg = Math.max(2, Math.round(28 * hero.dmgMul));
  for (let i = 0; i < count; i++) {
    const t = targets[i % targets.length];
    const hoverAngle = (i / count) * Math.PI * 2;
    const sx = hero.x + Math.cos(hoverAngle) * 44;
    const sy = hero.y + Math.sin(hoverAngle) * 44;
    state.swords.push({
      id: state.nextSwordId++,
      ownerId: hero.id,
      ownerIdx: hero.idx,
      x: sx,
      y: sy,
      aimRad: Math.atan2(t.y - sy, t.x - sx),
      hoverAngle,
      state: 'hover',
      stateMs: GACHA_SWORD_HOVER_MS,
      targetId: t.id,
      damage: dmg,
      hitDone: false,
    });
  }
}

function stepActiveSpiritSwords(
  state: GachaSkillsWorldState,
  heroById: Map<string, GachaSkillHeroRef>,
  enemyById: Map<number, GachaSkillEnemyRef>,
  enemies: readonly GachaSkillEnemyRef[],
  dtMs: number,
  dtS: number,
  onHit: (ev: GachaSkillHitEvent) => void,
): void {
  for (let i = state.swords.length - 1; i >= 0; i--) {
    const sw = state.swords[i];
    const hero = heroById.get(sw.ownerId);
    if (!hero || !hero.alive || hero.downed) {
      state.swords.splice(i, 1);
      continue;
    }

    let target = enemyById.get(sw.targetId);
    if (!target || !target.alive) {
      const reacquire = findNearestTargetsInRange(sw.x, sw.y, enemies, GACHA_SWORD_DETECT_R, 1);
      target = reacquire[0];
      if (!target) {
        state.swords.splice(i, 1);
        continue;
      }
      sw.targetId = target.id;
    }

    if (sw.state === 'hover') {
      sw.hoverAngle += 3.2 * dtS;
      sw.x = hero.x + Math.cos(sw.hoverAngle) * 44;
      sw.y = hero.y + Math.sin(sw.hoverAngle) * 44;
      sw.aimRad = Math.atan2(target.y - sw.y, target.x - sw.x);
      sw.stateMs -= dtMs;
      if (sw.stateMs <= 0) {
        sw.state = 'dash';
        sw.stateMs = 1100;
      }
      continue;
    }

    if (sw.state === 'dash') {
      sw.stateMs -= dtMs;
      const dx = target.x - sw.x;
      const dy = target.y - sw.y;
      const dist = Math.hypot(dx, dy);
      sw.aimRad = Math.atan2(dy, dx);
      const step = GACHA_SWORD_SPEED * dtS;
      if (dist > 1e-3) {
        const move = Math.min(dist, step);
        sw.x += (dx / dist) * move;
        sw.y += (dy / dist) * move;
      }

      const hitR = 26 + target.radius;
      if (Math.hypot(target.x - sw.x, target.y - sw.y) <= hitR) {
        sw.hitDone = true;
        sw.state = 'pull';
        sw.stateMs = GACHA_SWORD_PULL_MS;
        onHit({
          ownerId: hero.id,
          ownerIdx: hero.idx,
          targetId: target.id,
          damage: sw.damage,
          dmgKind: 'kinetic',
          fxKind: 'spirit_sword',
          x: target.x,
          y: target.y,
          isBossTarget: target.isBoss,
        });
      } else if (sw.stateMs <= 0) {
        state.swords.splice(i, 1);
      }
      continue;
    }

    // 'pull' phase: drag non-boss target toward hero stopping cleanly at safe buffer radius
    sw.stateMs -= dtMs;
    if (!target.isBoss && target.alive) {
      const toHeroX = hero.x - target.x;
      const toHeroY = hero.y - target.y;
      const distToHero = Math.hypot(toHeroX, toHeroY);
      const stopRadius = GACHA_SWORD_SAFE_BUFFER_R + target.radius;
      if (distToHero > stopRadius + 2) {
        const pullStep = clamp(distToHero - stopRadius, 0, MAX_PULL_STEP_PX);
        const pullDx = (toHeroX / distToHero) * pullStep;
        const pullDy = (toHeroY / distToHero) * pullStep;
        sw.aimRad = Math.atan2(toHeroY, toHeroX);
        onHit({
          ownerId: hero.id,
          ownerIdx: hero.idx,
          targetId: target.id,
          damage: 0,
          dmgKind: 'kinetic',
          fxKind: 'spirit_sword',
          x: target.x,
          y: target.y,
          pullDx,
          pullDy,
          isBossTarget: false,
        });
      }
    }
    sw.x = target.x;
    sw.y = target.y;
    if (sw.stateMs <= 0) {
      state.swords.splice(i, 1);
    }
  }
}

/** Advances Lightning Orbs, Fire Orbs & 5s Auto-Aim Pull Spirit Swords for all heroes. */
export function stepGachaSkills(
  state: GachaSkillsWorldState,
  heroes: readonly GachaSkillHeroRef[],
  enemies: readonly GachaSkillEnemyRef[],
  nowMs: number,
  dtMs: number,
  onHit: (ev: GachaSkillHitEvent) => void,
): void {
  const dtS = dtMs / 1000;
  // Prune stale ICD entries occasionally
  if (state.orbHitUntilMs.size > 256) {
    for (const [k, exp] of state.orbHitUntilMs) {
      if (nowMs >= exp) state.orbHitUntilMs.delete(k);
    }
  }

  const heroById = new Map<string, GachaSkillHeroRef>();
  for (const h of heroes) {
    heroById.set(h.id, h);
    if (!h.alive || h.downed) continue;
    stepOrbitRingsForHero(state, h, enemies, nowMs, onHit);
    stepSpiritSwordSpawns(state, h, enemies, dtMs);
  }

  const enemyById = new Map<number, GachaSkillEnemyRef>();
  for (const e of enemies) {
    enemyById.set(e.id, e);
  }
  stepActiveSpiritSwords(state, heroById, enemyById, enemies, dtMs, dtS, onHit);
}

/** Packs active orbital/magnet skill counts per player (`[playerIdx, lOrb, fOrb, sword, magnet]`). */
export function packPlayerGachaOrbs(heroes: readonly GachaSkillHeroRef[]): number[] {
  const out: number[] = [];
  for (const h of heroes) {
    if (!h.alive || h.downed) continue;
    const lOrb = Math.min(6, Math.max(0, Math.floor(h.skillStacks.skill_lightning_orb ?? 0)));
    const fOrb = Math.min(6, Math.max(0, Math.floor(h.skillStacks.skill_fire_orb ?? 0)));
    const sword = Math.min(6, Math.max(0, Math.floor(h.skillStacks.skill_spirit_sword ?? 0)));
    const mag = Math.min(6, Math.max(0, Math.floor(h.skillStacks.skill_magnet ?? 0)));
    if (lOrb > 0 || fOrb > 0 || sword > 0 || mag > 0) {
      out.push(h.idx, lOrb, fOrb, sword, mag);
    }
  }
  return out;
}

/** Packs summoned flying/hovering Spirit Swords inside viewport (`[id, x, y, aimQ, stateFlag]`). */
export function packSpiritSwords(
  state: GachaSkillsWorldState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  const out: number[] = [];
  for (const sw of state.swords) {
    if (sw.x < x0 - 96 || sw.x > x1 + 96 || sw.y < y0 - 96 || sw.y > y1 + 96) continue;
    const stateFlag = sw.state === 'hover' ? 0 : sw.state === 'dash' ? 1 : 2;
    out.push(sw.id, Math.round(sw.x), Math.round(sw.y), quantizeAim(sw.aimRad), stateFlag);
  }
  return out;
}
