/**
 * server/src/game/bansung/weapon-skills/melee.ts — logic skill chủ động + nội tại nhóm cận chiến
 * (spec 007 · C). Dữ liệu hiển thị: shared/src/bansung/weapon-skills/melee.ts.
 *
 *  crescent_blade · Moon Dash     — lướt 180px bất tử, chém xuyên đường lướt + nhát kết thúc
 *                 · Crescent Flow — mỗi nhát trúng +6% tốc chém (tối đa 5 tầng), mất dần
 *  reaper_scythe  · Death Whirl   — xoay 2s r=130 kéo zombie vào, hút máu theo số quái trúng
 *                 · Soul Harvest  — hạ zombie +1 linh hồn (tối đa 10) = +3% sát thương, hồi 1 máu
 *  shock_baton    · Tesla Dome    — vòm điện r=150 trong 3s: choáng ngắn, chậm 40%, +8 khiên
 *                 · Overcharge    — mỗi 5 nhát trúng phóng sét sang zombie gần nhất
 *
 * Mọi sát thương qua WeaponSkillApi (tự nhân hero.dmgScale = cấp Mk × perk × gacha).
 * Choáng boss đã được damage.ts giới hạn theo bậc (TIER_MAX_MS) và DR — skill chỉ xin ≤ 400ms.
 */
import {
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BLAST_HERO_NOVA,
  BANSUNG_FX_BLAST_STUN,
} from '../../../../../shared/src';
import type { WeaponSkillHandlerTable } from './types';

/** Thông số skill cận chiến (export để test & HUD tham chiếu). */
export const MELEE_SKILL_TUNING = {
  moonDash: {
    distancePx: 180,
    stepPx: 30,
    invulnMs: 350,
    halfWidthPx: 44,
    /** Sát thương mỗi zombie trên đường lướt (gốc Mk.I, ≈ x3 nhát chém thường). */
    pathDmg: 80,
    finisherRadius: 70,
    finisherDmg: 30,
    knockback: 140,
  },
  deathWhirl: {
    radius: 130,
    pulseEveryTicks: 5,
    pulseDmg: 38,
    /** Âm = hút zombie vào tâm (px/s). */
    pull: -90,
    healPerHit: 2,
    maxHealPerPulse: 10,
    moveSpeedMult: 0.85,
  },
  teslaDome: {
    radius: 150,
    castDmg: 22,
    castStunMs: 400,
    pulseEveryTicks: 10,
    pulseDmg: 18,
    pulseStunMs: 150,
    slowPct: 0.4,
    slowMs: 1200,
    shield: 8,
  },
  crescentFlow: { maxStacks: 5, fireRatePerStack: 0.06, holdTicks: 60, decayEveryTicks: 30 },
  soulHarvest: { maxStacks: 10, dmgPerStack: 0.03, healOnKill: 1, holdTicks: 150, decayEveryTicks: 90 },
  overcharge: { hitsPerArc: 5, arcRange: 140, arcDmg: 20, arcStunMs: 300 },
} as const;

const MD = MELEE_SKILL_TUNING.moonDash;
const DW = MELEE_SKILL_TUNING.deathWhirl;
const TD = MELEE_SKILL_TUNING.teslaDome;
const CF = MELEE_SKILL_TUNING.crescentFlow;
const SH = MELEE_SKILL_TUNING.soulHarvest;
const OC = MELEE_SKILL_TUNING.overcharge;

export const BANSUNG_MELEE_SKILL_HANDLERS: WeaponSkillHandlerTable = {
  // ------------------------------------------------------------------------
  crescent_blade: {
    cast(hero, api, st) {
      st.vars.dx = Math.cos(st.aim);
      st.vars.dy = Math.sin(st.aim);
      st.vars.x = hero.x;
      st.vars.y = hero.y;
      st.vars.moved = 0;
      api.setInvuln(MD.invulnMs);
      api.emitCast(hero.x, hero.y);
      api.sfx('dash_swipe', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      const left = MD.distancePx - st.vars.moved;
      if (left <= 0.5) return false;
      const stepPx = Math.min(MD.stepPx, left);
      const x0 = st.vars.x;
      const y0 = st.vars.y;
      const pos = api.moveHero(st.vars.dx * stepPx, st.vars.dy * stepPx);
      const actual = Math.hypot(pos.x - x0, pos.y - y0);
      st.vars.x = pos.x;
      st.vars.y = pos.y;
      st.vars.moved += stepPx;
      // Chém mọi zombie trên đoạn vừa lướt qua (mỗi con trúng 1 lần)
      api.damageLine(
        x0 - st.vars.dx * 12,
        y0 - st.vars.dy * 12,
        pos.x + st.vars.dx * 24,
        pos.y + st.vars.dy * 24,
        MD.halfWidthPx,
        {
          baseDmg: MD.pathDmg,
          dmgKind: 'melee',
          affinity: [1.3, 0.85],
          critChance: 0.25,
          critMult: 1.7,
          knockback: MD.knockback,
        },
        { exclude: st.hit },
      );
      // Đụng tường → dừng lướt
      if (actual < stepPx * 0.35) return false;
      return true;
    },
    end(hero, api, st) {
      const x = Number.isFinite(st.vars.x) ? st.vars.x : hero.x;
      const y = Number.isFinite(st.vars.y) ? st.vars.y : hero.y;
      api.damageCircle(
        x,
        y,
        MD.finisherRadius,
        { baseDmg: MD.finisherDmg, dmgKind: 'melee', affinity: [1.3, 0.85], knockback: MD.knockback },
        { exclude: st.hit },
      );
      api.emitImpact(x, y);
    },
    passive: {
      mods(_hero, ps) {
        return ps.stacks > 0 ? { fireRateMult: 1 + CF.fireRatePerStack * ps.stacks } : undefined;
      },
      onHit(_hero, api, ps) {
        // Tối đa +1 tầng mỗi tick (một nhát quét trúng cả bầy chỉ tính 1 lần)
        if (ps.vars.lastStackTick === api.tickNo) return;
        ps.vars.lastStackTick = api.tickNo;
        ps.vars.lastHit = api.tickNo;
        ps.stacks = Math.min(CF.maxStacks, ps.stacks + 1);
      },
      onTick(_hero, api, ps) {
        if (ps.stacks <= 0) return;
        const since = api.tickNo - (ps.vars.lastHit ?? api.tickNo);
        if (since > CF.holdTicks) {
          ps.stacks = Math.max(0, ps.stacks - 1);
          ps.vars.lastHit = api.tickNo - CF.holdTicks + CF.decayEveryTicks;
        }
      },
    },
  },

  // ------------------------------------------------------------------------
  reaper_scythe: {
    cast(hero, api, st) {
      api.addBuff({ moveSpeedMult: DW.moveSpeedMult }, st.durationMs, 'reaper_whirl');
      api.emitCast(hero.x, hero.y);
      api.sfx('dash_whoosh', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      if (st.tick % DW.pulseEveryTicks !== 1) return true;
      const hits = api.damageCircle(hero.x, hero.y, DW.radius, {
        baseDmg: DW.pulseDmg,
        dmgKind: 'melee',
        affinity: [1.2, 1.05],
        critChance: 0.12,
        critMult: 1.8,
        knockback: DW.pull,
      });
      if (hits > 0) {
        api.heal(Math.min(DW.maxHealPerPulse, hits * DW.healPerHit));
        api.emitImpact(hero.x, hero.y);
      }
      return true;
    },
    end(hero, api) {
      api.emitBlast(BANSUNG_FX_BLAST_HERO_NOVA, hero.x, hero.y, DW.radius);
    },
    passive: {
      mods(_hero, ps) {
        return ps.stacks > 0 ? { dmgMult: 1 + SH.dmgPerStack * ps.stacks } : undefined;
      },
      onKill(hero, api, ps) {
        ps.stacks = Math.min(SH.maxStacks, ps.stacks + 1);
        ps.vars.lastKill = api.tickNo;
        api.heal(SH.healOnKill);
        api.emitPassive(hero.x, hero.y);
      },
      onTick(_hero, api, ps) {
        if (ps.stacks <= 0) return;
        const since = api.tickNo - (ps.vars.lastKill ?? api.tickNo);
        if (since > SH.holdTicks) {
          ps.stacks = Math.max(0, ps.stacks - 1);
          ps.vars.lastKill = api.tickNo - SH.holdTicks + SH.decayEveryTicks;
        }
      },
    },
  },

  // ------------------------------------------------------------------------
  shock_baton: {
    cast(hero, api, st) {
      st.vars.cx = hero.x;
      st.vars.cy = hero.y;
      api.addShield(TD.shield);
      api.damageCircle(hero.x, hero.y, TD.radius, {
        baseDmg: TD.castDmg,
        dmgKind: 'energy',
        stunMs: TD.castStunMs,
        slowPct: TD.slowPct,
        slowMs: TD.slowMs,
      });
      api.emitBlast(BANSUNG_FX_BLAST_STUN, hero.x, hero.y, TD.radius);
      api.emitCast(hero.x, hero.y);
      api.sfx('stun_elec_arc', hero.x, hero.y);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % TD.pulseEveryTicks !== 0) return true;
      const cx = st.vars.cx;
      const cy = st.vars.cy;
      const hits = api.damageCircle(cx, cy, TD.radius, {
        baseDmg: TD.pulseDmg,
        dmgKind: 'energy',
        stunMs: TD.pulseStunMs,
        slowPct: TD.slowPct,
        slowMs: TD.slowMs,
      });
      if (hits > 0) {
        // Vài tia sét từ tâm vòm tới zombie gần nhất cho dễ đọc
        const near = api.queryEnemies(cx, cy, TD.radius);
        for (let i = 0; i < near.length && i < 3; i++) {
          api.emitBeam(cx, cy, near[i].x, near[i].y, BANSUNG_FX_BEAM_SHOCK);
        }
      }
      api.emitImpact(cx, cy);
      return true;
    },
    end(_hero, api, st) {
      api.emitBlast(BANSUNG_FX_BLAST_STUN, st.vars.cx, st.vars.cy, TD.radius * 0.6);
    },
    passive: {
      onHit(_hero, api, ps, target) {
        ps.vars.count = (ps.vars.count ?? 0) + 1;
        ps.stacks = ps.vars.count;
        if (ps.vars.count < OC.hitsPerArc) return;
        ps.vars.count = 0;
        ps.stacks = 0;
        const tx = target.x;
        const ty = target.y;
        if (tx === undefined || ty === undefined) return;
        const near = api.queryEnemies(tx, ty, OC.arcRange);
        for (let i = 0; i < near.length; i++) {
          const info = near[i];
          if (info.target === target) continue;
          api.damageTarget(info, { baseDmg: OC.arcDmg, dmgKind: 'energy', stunMs: OC.arcStunMs }, tx, ty);
          api.emitBeam(tx, ty, info.x, info.y, BANSUNG_FX_BEAM_CHAIN);
          api.emitPassive(info.x, info.y);
          break;
        }
      },
    },
  },
};
