/**
 * server/src/game/bansung/weapon-skills/index.ts — KHUNG skill súng phía server (spec 007 · C).
 *
 *  - Hồi chiêu RIÊNG từng khẩu (đổi súng không reset hồi chiêu của súng kia).
 *  - Năng lượng do world trừ qua callback `spendEnergy`.
 *  - Skill chạy theo tick (cast → step… → end), tự kết thúc khi đổi súng / gục / chết.
 *  - Buff tạm thời + nội tại gộp thành `BansungWeaponBuffMods`, world nhân vào gachaMods của súng.
 *  - Nội tại nhận onTick / onShot / onHit / onKill; đòn do nội tại gây ra không gọi lại onHit (chống đệ quy).
 *
 * Handler từng súng nằm ở 4 file nhóm; súng chưa có handler dùng "Overdrive" mặc định.
 */
import {
  BANSUNG_FX_STATUS_WSKILL_CAST,
  BANSUNG_FX_STATUS_WSKILL_END,
  BANSUNG_FX_STATUS_WSKILL_IMPACT,
  BANSUNG_FX_STATUS_WSKILL_PASSIVE,
  FX_BEAM,
  FX_BLAST,
  FX_STATUS,
  getWeaponSkillSpec,
  getWeaponSkillTierCdMult,
  getWeaponSkillTierDurationMult,
  getWeaponSpec,
  type BansungWeaponBuffMods,
  type BansungWeaponId,
  type BansungWeaponSkillHud,
} from '../../../../../shared/src';
import type { BansungCombatTarget, BansungDamageContext, BansungDamageResult } from '../damage';
import {
  LAYER_ENEMY,
  hasLineOfSight,
  moveCircleWithSlide,
  raycastObstacles,
  type ObstacleGrid,
  type SpatialActor,
} from '../spatial';
import {
  applyCombatHitAndEvents,
  buildWeaponSlotsSnapshot,
  resolveActorTarget,
  type BansungWeaponWorldContext,
} from '../weapons';
import { BANSUNG_ENERGY_SKILL_HANDLERS } from './energy';
import { BANSUNG_EXPLOSIVE_SKILL_HANDLERS } from './explosive';
import { BANSUNG_KINETIC_SKILL_HANDLERS } from './kinetic';
import { BANSUNG_MELEE_SKILL_HANDLERS } from './melee';
import type {
  WeaponSkillAoeOpts,
  WeaponSkillApi,
  WeaponSkillCastState,
  WeaponSkillHandler,
  WeaponSkillHero,
  WeaponSkillHit,
  WeaponSkillPassiveState,
  WeaponSkillProjectile,
  WeaponSkillTargetInfo,
} from './types';

export * from './types';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Skill mặc định "Overdrive": +40% tốc bắn, +20% sát thương trong thời lượng skill. */
export const DEFAULT_WEAPON_SKILL_HANDLER: WeaponSkillHandler = {
  cast(hero, api, st) {
    api.addBuff({ fireRateMult: 1.4, dmgMult: 1.2 }, st.durationMs, 'overdrive');
    api.emitCast(hero.x, hero.y);
    return true;
  },
};

const HANDLERS: Partial<Record<BansungWeaponId, WeaponSkillHandler>> = {
  ...BANSUNG_KINETIC_SKILL_HANDLERS,
  ...BANSUNG_EXPLOSIVE_SKILL_HANDLERS,
  ...BANSUNG_ENERGY_SKILL_HANDLERS,
  ...BANSUNG_MELEE_SKILL_HANDLERS,
};

export function resolveWeaponSkillHandler(weaponId: BansungWeaponId): WeaponSkillHandler {
  return HANDLERS[weaponId] ?? DEFAULT_WEAPON_SKILL_HANDLER;
}

export function hasCustomWeaponSkillHandler(weaponId: BansungWeaponId): boolean {
  return Boolean(HANDLERS[weaponId]);
}

/** true nếu nội tại của súng có hook này (world dùng để tránh dựng api khi không cần). */
export function weaponHasPassiveHook(weaponId: BansungWeaponId, hook: 'onShot' | 'onHit' | 'onKill'): boolean {
  const ph = HANDLERS[weaponId]?.passive;
  return Boolean(ph && ph[hook]);
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

interface ActiveWeaponSkill {
  weaponId: BansungWeaponId;
  handler: WeaponSkillHandler;
  st: WeaponSkillCastState;
}

interface TimedBuff {
  mods: BansungWeaponBuffMods;
  ms: number;
  tag?: string;
}

export interface WeaponSkillRuntime {
  cdMs: Partial<Record<BansungWeaponId, number>>;
  maxMs: Partial<Record<BansungWeaponId, number>>;
  active: ActiveWeaponSkill | null;
  buffs: TimedBuff[];
  passive: Partial<Record<BansungWeaponId, WeaponSkillPassiveState>>;
  /** >0 khi đang xử lý đòn do nội tại gây ra (chặn onHit đệ quy). */
  procDepth: number;
}

export function createWeaponSkillRuntime(): WeaponSkillRuntime {
  return { cdMs: {}, maxMs: {}, active: null, buffs: [], passive: {}, procDepth: 0 };
}

function passiveStateOf(rt: WeaponSkillRuntime, weaponId: BansungWeaponId): WeaponSkillPassiveState {
  let ps = rt.passive[weaponId];
  if (!ps) {
    ps = { vars: {}, stacks: 0 };
    rt.passive[weaponId] = ps;
  }
  return ps;
}

export type WeaponSkillCastResult = 'ok' | 'cooldown' | 'energy' | 'busy' | 'refused';

/** Hồi chiêu thực tế (ms) của skill súng theo cấp Mk. */
export function getWeaponSkillCooldownMs(weaponId: BansungWeaponId, tier: number): number {
  return Math.round(getWeaponSkillSpec(weaponId).cooldownMs * getWeaponSkillTierCdMult(tier));
}

/** Thời lượng thực tế (ms) của skill súng theo cấp Mk. */
export function getWeaponSkillDurationMs(weaponId: BansungWeaponId, tier: number): number {
  return Math.round(getWeaponSkillSpec(weaponId).durationMs * getWeaponSkillTierDurationMult(tier));
}

export function tryCastWeaponSkill(
  rt: WeaponSkillRuntime,
  hero: WeaponSkillHero,
  api: WeaponSkillApi,
  spendEnergy: (cost: number) => void,
): WeaponSkillCastResult {
  if ((rt.cdMs[hero.weaponId] ?? 0) > 0) return 'cooldown';
  if (rt.active) return 'busy';
  const spec = hero.spec;
  if (spec.energyCost > 0 && hero.energy < spec.energyCost) return 'energy';
  const handler = resolveWeaponSkillHandler(hero.weaponId);
  const st: WeaponSkillCastState = {
    startTick: api.tickNo,
    tick: 0,
    elapsedMs: 0,
    durationMs: getWeaponSkillDurationMs(hero.weaponId, hero.tier),
    aim: hero.aimRad,
    tx: hero.targetX,
    ty: hero.targetY,
    vars: {},
    hit: new Set<number>(),
  };
  let ok = false;
  rt.procDepth += 1;
  try {
    ok = handler.cast(hero, api, st);
  } finally {
    rt.procDepth -= 1;
  }
  if (!ok) return 'refused';
  spendEnergy(spec.energyCost);
  const cd = getWeaponSkillCooldownMs(hero.weaponId, hero.tier);
  rt.cdMs[hero.weaponId] = cd;
  rt.maxMs[hero.weaponId] = cd;
  if (st.durationMs > 0 && (handler.step || handler.end)) {
    rt.active = { weaponId: hero.weaponId, handler, st };
  } else if (handler.end) {
    handler.end(hero, api, st);
  }
  return 'ok';
}

/** Kết thúc skill đang chạy (gục / chết / đổi súng). */
export function cancelWeaponSkill(rt: WeaponSkillRuntime, hero: WeaponSkillHero | null, api: WeaponSkillApi | null): void {
  const a = rt.active;
  rt.active = null;
  if (a && hero && api && a.weaponId === hero.weaponId) {
    rt.procDepth += 1;
    try {
      a.handler.end?.(hero, api, a.st);
    } finally {
      rt.procDepth -= 1;
    }
    api.emitEnd(hero.x, hero.y);
  }
}

/** Giảm hồi chiêu mọi súng + buff (gọi mỗi tick cho mọi người chơi còn trong trận). */
export function tickWeaponSkillTimers(rt: WeaponSkillRuntime, dtMs: number): void {
  for (const k of Object.keys(rt.cdMs) as BansungWeaponId[]) {
    const v = (rt.cdMs[k] ?? 0) - dtMs;
    if (v <= 0) delete rt.cdMs[k];
    else rt.cdMs[k] = v;
  }
  for (let i = rt.buffs.length - 1; i >= 0; i--) {
    rt.buffs[i].ms -= dtMs;
    if (rt.buffs[i].ms <= 0) rt.buffs.splice(i, 1);
  }
}

/** Chạy skill đang hoạt động + onTick nội tại của súng đang cầm. */
export function stepWeaponSkills(
  rt: WeaponSkillRuntime,
  hero: WeaponSkillHero,
  api: WeaponSkillApi,
  firing: boolean,
): void {
  const a = rt.active;
  if (a) {
    if (a.weaponId !== hero.weaponId) {
      rt.active = null;
    } else {
      a.st.tick += 1;
      a.st.elapsedMs += api.dtMs;
      let keep: boolean | void = true;
      rt.procDepth += 1;
      try {
        keep = a.handler.step ? a.handler.step(hero, api, a.st) : true;
      } finally {
        rt.procDepth -= 1;
      }
      if (keep === false || a.st.elapsedMs >= a.st.durationMs) {
        cancelWeaponSkill(rt, hero, api);
      }
    }
  }
  const ph = resolveWeaponSkillHandler(hero.weaponId).passive;
  if (ph?.onTick) {
    rt.procDepth += 1;
    try {
      ph.onTick(hero, api, passiveStateOf(rt, hero.weaponId), firing);
    } finally {
      rt.procDepth -= 1;
    }
  }
}

export function notifyWeaponSkillShot(rt: WeaponSkillRuntime, hero: WeaponSkillHero, api: WeaponSkillApi): void {
  const ph = resolveWeaponSkillHandler(hero.weaponId).passive;
  if (!ph?.onShot) return;
  rt.procDepth += 1;
  try {
    ph.onShot(hero, api, passiveStateOf(rt, hero.weaponId));
  } finally {
    rt.procDepth -= 1;
  }
}

export function notifyWeaponSkillHit(
  rt: WeaponSkillRuntime,
  hero: WeaponSkillHero,
  api: WeaponSkillApi,
  target: BansungCombatTarget,
  res: BansungDamageResult,
): void {
  if (rt.procDepth > 0) return;
  const ph = resolveWeaponSkillHandler(hero.weaponId).passive;
  if (!ph?.onHit) return;
  rt.procDepth += 1;
  try {
    ph.onHit(hero, api, passiveStateOf(rt, hero.weaponId), target, res);
  } finally {
    rt.procDepth -= 1;
  }
}

export function notifyWeaponSkillKill(
  rt: WeaponSkillRuntime,
  hero: WeaponSkillHero,
  api: WeaponSkillApi,
  target: BansungCombatTarget,
): void {
  const ph = resolveWeaponSkillHandler(hero.weaponId).passive;
  if (!ph?.onKill) return;
  rt.procDepth += 1;
  try {
    ph.onKill(hero, api, passiveStateOf(rt, hero.weaponId), target);
  } finally {
    rt.procDepth -= 1;
  }
}

/** Gộp buff tạm thời + nội tại (nhân cho hệ số, cộng cho số cộng thêm). */
export function getWeaponSkillMods(rt: WeaponSkillRuntime, hero: WeaponSkillHero | null): BansungWeaponBuffMods {
  const out: Required<Omit<BansungWeaponBuffMods, 'infiniteAmmo'>> & { infiniteAmmo: boolean } = {
    dmgMult: 1,
    fireRateMult: 1,
    extraMultishot: 0,
    critChanceAdd: 0,
    critDmgMult: 1,
    extraPierce: 0,
    blastRadiusMult: 1,
    reloadSpeedMul: 1,
    energyCostMult: 1,
    moveSpeedMult: 1,
    infiniteAmmo: false,
  };
  const merge = (m: BansungWeaponBuffMods | undefined): void => {
    if (!m) return;
    if (m.dmgMult !== undefined) out.dmgMult *= m.dmgMult;
    if (m.fireRateMult !== undefined) out.fireRateMult *= m.fireRateMult;
    if (m.extraMultishot !== undefined) out.extraMultishot += m.extraMultishot;
    if (m.critChanceAdd !== undefined) out.critChanceAdd += m.critChanceAdd;
    if (m.critDmgMult !== undefined) out.critDmgMult *= m.critDmgMult;
    if (m.extraPierce !== undefined) out.extraPierce += m.extraPierce;
    if (m.blastRadiusMult !== undefined) out.blastRadiusMult *= m.blastRadiusMult;
    if (m.reloadSpeedMul !== undefined) out.reloadSpeedMul *= m.reloadSpeedMul;
    if (m.energyCostMult !== undefined) out.energyCostMult *= m.energyCostMult;
    if (m.moveSpeedMult !== undefined) out.moveSpeedMult *= m.moveSpeedMult;
    if (m.infiniteAmmo) out.infiniteAmmo = true;
  };
  for (const b of rt.buffs) merge(b.mods);
  if (hero) {
    const ph = resolveWeaponSkillHandler(hero.weaponId).passive;
    if (ph?.mods) merge(ph.mods(hero, passiveStateOf(rt, hero.weaponId)));
  }
  // Kẹp an toàn chống cộng dồn vô hạn
  out.dmgMult = Math.min(4, Math.max(0.2, out.dmgMult));
  out.fireRateMult = Math.min(3, Math.max(0.3, out.fireRateMult));
  out.extraMultishot = Math.min(6, Math.max(0, Math.round(out.extraMultishot)));
  out.critChanceAdd = Math.min(0.8, Math.max(-0.5, out.critChanceAdd));
  out.critDmgMult = Math.min(3, Math.max(0.5, out.critDmgMult));
  out.extraPierce = Math.min(8, Math.max(0, Math.round(out.extraPierce)));
  out.blastRadiusMult = Math.min(2.5, Math.max(0.5, out.blastRadiusMult));
  out.reloadSpeedMul = Math.min(3, Math.max(0.3, out.reloadSpeedMul));
  out.energyCostMult = Math.min(3, Math.max(0, out.energyCostMult));
  out.moveSpeedMult = Math.min(1.8, Math.max(0.4, out.moveSpeedMult));
  return out;
}

export function buildWeaponSkillHud(
  rt: WeaponSkillRuntime,
  weaponId: BansungWeaponId,
  tier: number,
): BansungWeaponSkillHud {
  const spec = getWeaponSkillSpec(weaponId);
  const cd = Math.max(0, Math.round(rt.cdMs[weaponId] ?? 0));
  const maxMs = Math.max(1, Math.round(rt.maxMs[weaponId] ?? getWeaponSkillCooldownMs(weaponId, tier)));
  const active = rt.active && rt.active.weaponId === weaponId ? rt.active : null;
  const activeMs = active ? Math.max(0, Math.round(active.st.durationMs - active.st.elapsedMs)) : 0;
  const stacks = rt.passive[weaponId]?.stacks ?? 0;
  return {
    id: spec.id,
    weaponId,
    cdMs: cd,
    maxMs,
    ...(activeMs > 0 ? { activeMs } : {}),
    energyCost: spec.energyCost,
    ...(stacks > 0 ? { stacks: Math.round(stacks) } : {}),
  };
}

// ---------------------------------------------------------------------------
// API builder (world cung cấp các hàm phụ thuộc)
// ---------------------------------------------------------------------------

export interface WeaponSkillApiDeps {
  tickNo: number;
  dtMs: number;
  rng: () => number;
  fx: number[];
  weaponCtx: BansungWeaponWorldContext;
  damageCtx: BansungDamageContext;
  obsGrid: ObstacleGrid;
  hero: WeaponSkillHero;
  runtime: WeaponSkillRuntime;
  /** Di chuyển người chơi (trả vị trí mới) — world tự đồng bộ body. */
  moveHero: (dx: number, dy: number) => { x: number; y: number };
  setInvuln: (ms: number) => void;
  heal: (hp: number) => number;
  addShield: (amount: number) => number;
  grantEnergy: (amount: number) => number;
  sfx?: (key: string, x: number, y: number) => void;
}

const queryScratch: SpatialActor[] = [];

export function createWeaponSkillApi(deps: WeaponSkillApiDeps): WeaponSkillApi {
  const hero = deps.hero;
  const wctx = deps.weaponCtx;
  const weaponIdx = getWeaponSpec(hero.weaponId).idx;
  const infos: WeaponSkillTargetInfo[] = [];

  const scaleHit = (hit: WeaponSkillHit, mult = 1): Parameters<typeof applyCombatHitAndEvents>[2] => ({
    baseDmg: Math.max(0, hit.baseDmg * (hit.raw ? 1 : hero.dmgScale) * mult),
    dmgKind: hit.dmgKind,
    ...(hit.affinity ? { affinity: hit.affinity } : {}),
    ...(hit.armorPiercePct !== undefined ? { armorPiercePct: hit.armorPiercePct } : {}),
    ...(hit.critChance !== undefined ? { critChance: hit.critChance } : {}),
    ...(hit.critMult !== undefined ? { critMult: hit.critMult } : {}),
    ...(hit.forceCrit ? { forceCrit: true } : {}),
    ...(hit.stunMs ? { stunMs: hit.stunMs } : {}),
    ...(hit.dotKind ? { dotKind: hit.dotKind } : {}),
    attackerId: hero.id,
  });

  const api: WeaponSkillApi = {
    tickNo: deps.tickNo,
    dtMs: deps.dtMs,
    rng: deps.rng,
    fx(a, b, c, d, e, f) {
      deps.fx.push(a | 0, b | 0, Math.round(c), Math.round(d), Math.round(e), Math.round(f));
    },
    emitCast(x, y) {
      deps.fx.push(FX_STATUS, hero.idx, BANSUNG_FX_STATUS_WSKILL_CAST, weaponIdx, Math.round(x), Math.round(y));
    },
    emitImpact(x, y) {
      deps.fx.push(FX_STATUS, hero.idx, BANSUNG_FX_STATUS_WSKILL_IMPACT, weaponIdx, Math.round(x), Math.round(y));
    },
    emitEnd(x, y) {
      deps.fx.push(FX_STATUS, hero.idx, BANSUNG_FX_STATUS_WSKILL_END, weaponIdx, Math.round(x), Math.round(y));
    },
    emitPassive(x, y) {
      deps.fx.push(FX_STATUS, hero.idx, BANSUNG_FX_STATUS_WSKILL_PASSIVE, weaponIdx, Math.round(x), Math.round(y));
    },
    emitBeam(x0, y0, x1, y1, beamKind) {
      deps.fx.push(FX_BEAM, Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), beamKind | 0);
    },
    emitBlast(blastKind, x, y, r) {
      deps.fx.push(FX_BLAST, blastKind | 0, Math.round(x), Math.round(y), Math.round(r), hero.actorId);
    },
    sfx(key, x, y) {
      deps.sfx?.(key, x, y);
    },

    queryEnemies(x, y, r) {
      infos.length = 0;
      wctx.actorGrid.queryCircle(x, y, Math.max(0, r), LAYER_ENEMY, queryScratch);
      for (const actor of queryScratch) {
        if (!actor.alive) continue;
        const target = resolveActorTarget(actor, wctx);
        if (!target || !target.alive || target.hp <= 0) continue;
        infos.push({
          target,
          actorId: actor.id,
          x: actor.x,
          y: actor.y,
          radius: actor.radius,
          isBoss: target.tier === 'boss',
          dist: Math.hypot(actor.x - x, actor.y - y),
        });
      }
      infos.sort((a, b) => a.dist - b.dist);
      return infos;
    },
    nearestEnemy(x, y, r) {
      const list = api.queryEnemies(x, y, r);
      return list.length > 0 ? list[0] : null;
    },
    damageTarget(info, hit, fromX = hero.x, fromY = hero.y) {
      const res = applyCombatHitAndEvents(info.target, hero.id, scaleHit(hit), wctx, deps.damageCtx);
      if (res.blocked) return res;
      if (hit.knockback && !info.isBoss) {
        const dx = info.x - fromX;
        const dy = info.y - fromY;
        const d = Math.hypot(dx, dy) || 1;
        wctx.applyKnockback?.(info.actorId, (dx / d) * hit.knockback, (dy / d) * hit.knockback);
      }
      if (hit.slowPct && hit.slowMs && info.target.alive) {
        info.target.slowPct = Math.max(info.target.slowPct ?? 0, hit.slowPct);
        info.target.slowMs = Math.max(info.target.slowMs ?? 0, hit.slowMs);
      }
      return res;
    },
    damageCircle(x, y, r, hit, opts) {
      const list = api.queryEnemies(x, y, r).slice(0, opts?.maxTargets ?? 64);
      let n = 0;
      for (const info of list) {
        if (opts?.exclude?.has(info.actorId)) continue;
        if (opts?.requireLos && !hasLineOfSight(deps.obsGrid, x, y, info.x, info.y)) continue;
        const edge = opts?.edgeMult ?? 1;
        const u = r > 0 ? Math.min(1, Math.max(0, (info.dist - info.radius) / r)) : 0;
        const mult = 1 + (edge - 1) * u;
        const res = applyCombatHitAndEvents(info.target, hero.id, scaleHit(hit, mult), wctx, deps.damageCtx);
        opts?.exclude?.add(info.actorId);
        if (res.blocked) continue;
        n += 1;
        if (hit.knockback && !info.isBoss) {
          const dx = info.x - x;
          const dy = info.y - y;
          const d = Math.hypot(dx, dy) || 1;
          wctx.applyKnockback?.(info.actorId, (dx / d) * hit.knockback, (dy / d) * hit.knockback);
        }
        if (hit.slowPct && hit.slowMs && info.target.alive) {
          info.target.slowPct = Math.max(info.target.slowPct ?? 0, hit.slowPct);
          info.target.slowMs = Math.max(info.target.slowMs ?? 0, hit.slowMs);
        }
      }
      return n;
    },
    damageLine(x0, y0, x1, y1, halfW, hit, opts) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1) return 0;
      const ux = (x1 - x0) / len;
      const uy = (y1 - y0) / len;
      const cx = (x0 + x1) * 0.5;
      const cy = (y0 + y1) * 0.5;
      const cand = api.queryEnemies(cx, cy, len * 0.5 + halfW).slice();
      cand.sort((a, b) => (a.x - x0) * ux + (a.y - y0) * uy - ((b.x - x0) * ux + (b.y - y0) * uy));
      let n = 0;
      const maxT = opts?.maxTargets ?? 64;
      for (const info of cand) {
        if (n >= maxT) break;
        if (opts?.exclude?.has(info.actorId)) continue;
        const t = (info.x - x0) * ux + (info.y - y0) * uy;
        if (t < -info.radius || t > len + info.radius) continue;
        const perp = Math.abs((info.x - x0) * uy - (info.y - y0) * ux);
        if (perp > halfW + info.radius) continue;
        if (opts?.requireLos && !hasLineOfSight(deps.obsGrid, x0, y0, info.x, info.y)) continue;
        const edge = opts?.edgeMult ?? 1;
        const mult = 1 + (edge - 1) * Math.min(1, Math.max(0, t / len));
        const res = applyCombatHitAndEvents(info.target, hero.id, scaleHit(hit, mult), wctx, deps.damageCtx);
        opts?.exclude?.add(info.actorId);
        if (res.blocked) continue;
        n += 1;
        if (hit.knockback && !info.isBoss) {
          wctx.applyKnockback?.(info.actorId, ux * hit.knockback, uy * hit.knockback);
        }
        if (hit.slowPct && hit.slowMs && info.target.alive) {
          info.target.slowPct = Math.max(info.target.slowPct ?? 0, hit.slowPct);
          info.target.slowMs = Math.max(info.target.slowMs ?? 0, hit.slowMs);
        }
      }
      return n;
    },
    damageCone(x, y, angle, halfAngleRad, range, hit, opts) {
      const cand = api.queryEnemies(x, y, range).slice();
      let n = 0;
      const maxT = opts?.maxTargets ?? 64;
      for (const info of cand) {
        if (n >= maxT) break;
        if (opts?.exclude?.has(info.actorId)) continue;
        let da = Math.atan2(info.y - y, info.x - x) - angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const slack = info.dist > 1 ? Math.atan2(info.radius, info.dist) : Math.PI;
        if (Math.abs(da) > halfAngleRad + slack) continue;
        if (opts?.requireLos && !hasLineOfSight(deps.obsGrid, x, y, info.x, info.y)) continue;
        const edge = opts?.edgeMult ?? 1;
        const mult = 1 + (edge - 1) * Math.min(1, Math.max(0, info.dist / Math.max(1, range)));
        const res = applyCombatHitAndEvents(info.target, hero.id, scaleHit(hit, mult), wctx, deps.damageCtx);
        opts?.exclude?.add(info.actorId);
        if (res.blocked) continue;
        n += 1;
        if (hit.knockback && !info.isBoss) {
          const d = info.dist || 1;
          wctx.applyKnockback?.(info.actorId, ((info.x - x) / d) * hit.knockback, ((info.y - y) / d) * hit.knockback);
        }
        if (hit.slowPct && hit.slowMs && info.target.alive) {
          info.target.slowPct = Math.max(info.target.slowPct ?? 0, hit.slowPct);
          info.target.slowMs = Math.max(info.target.slowMs ?? 0, hit.slowMs);
        }
      }
      return n;
    },
    spawnProjectile(p: WeaponSkillProjectile) {
      const { raw, ...rest } = p;
      const proj = wctx.bullets.spawn({
        ...rest,
        team: hero.team,
        ownerId: hero.id,
        ownerIdx: hero.idx,
        weaponId: rest.weaponId ?? hero.weaponId,
        ...(rest.baseDmg !== undefined ? { baseDmg: rest.baseDmg * (raw ? 1 : hero.dmgScale) } : {}),
      });
      return proj !== null;
    },

    hasLineOfSight(x0, y0, x1, y1) {
      return hasLineOfSight(deps.obsGrid, x0, y0, x1, y1);
    },
    raycastWall(x0, y0, angle, maxDist) {
      const x1 = x0 + Math.cos(angle) * maxDist;
      const y1 = y0 + Math.sin(angle) * maxDist;
      const hit = raycastObstacles(deps.obsGrid, x0, y0, x1, y1, 0, 'bullet');
      // RayObstacleHit.t là tỉ lệ [0, 1] dọc đoạn truy vấn
      return hit ? Math.max(0, Math.min(maxDist, hit.t * maxDist)) : maxDist;
    },
    moveHero(dx, dy) {
      return deps.moveHero(dx, dy);
    },
    setInvuln(ms) {
      deps.setInvuln(ms);
    },
    heal(hp) {
      return deps.heal(hp);
    },
    addShield(amount) {
      return deps.addShield(amount);
    },
    grantEnergy(amount) {
      return deps.grantEnergy(amount);
    },
    refillMag() {
      const slotIdx = hero.weaponState.activeSlot;
      const snap = buildWeaponSlotsSnapshot(hero.weaponState)[slotIdx];
      const slot = hero.weaponState.slots[slotIdx];
      if (slot && snap && snap.maxClip > 0) slot.ammoInMag = snap.maxClip;
      if (hero.weaponState.reload && hero.weaponState.reload.slot === slotIdx) hero.weaponState.reload = null;
    },
    addBuff(mods, ms, tag) {
      if (!(ms > 0)) return;
      if (tag) {
        const ex = deps.runtime.buffs.find((b) => b.tag === tag);
        if (ex) {
          ex.mods = mods;
          ex.ms = Math.max(ex.ms, ms);
          return;
        }
      }
      if (deps.runtime.buffs.length >= 12) deps.runtime.buffs.shift();
      deps.runtime.buffs.push({ mods, ms, ...(tag ? { tag } : {}) });
    },
    pushActor(actorId, vx, vy) {
      wctx.applyKnockback?.(actorId, vx, vy);
    },
  };
  return api;
}

/** Tiện ích cho handler: di chuyển có kẹp tường bằng moveCircleWithSlide. */
export function slideBody(
  obsGrid: ObstacleGrid,
  x: number,
  y: number,
  radius: number,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const body = { x, y, radius };
  const out = moveCircleWithSlide(body, dx, dy, obsGrid);
  return { x: out.x, y: out.y };
}
