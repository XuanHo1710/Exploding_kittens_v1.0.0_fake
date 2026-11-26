/**
 * server/src/game/bansung/weapon-skills/kinetic.ts — logic skill chủ động + nội tại nhóm súng đạn thường
 * (spec 007 · C). Dữ liệu hiển thị: shared/src/bansung/weapon-skills/kinetic.ts.
 *
 * Mọi tác động lên thế giới đi qua WeaponSkillApi (server-authoritative). Sát thương truyền vào api
 * tự nhân hero.dmgScale (cấp Mk × perk × gacha). Ngân sách: tổng sát thương 1 lần dùng ≈ 3–6 giây DPS
 * duy trì của chính khẩu súng; skill khống chế / cơ động gây ít hơn.
 */
import {
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_HERO_NOVA,
  getWeaponSpec,
} from '../../../../../shared/src';
import type { BansungCombatTarget } from '../damage';
import type {
  WeaponSkillApi,
  WeaponSkillHandlerTable,
  WeaponSkillHero,
  WeaponSkillPassiveState,
  WeaponSkillTargetInfo,
} from './types';

const TWO_PI = Math.PI * 2;

function wrapAngle(a: number): number {
  let v = a;
  while (v > Math.PI) v -= TWO_PI;
  while (v < -Math.PI) v += TWO_PI;
  return v;
}

function magSizeOf(hero: WeaponSkillHero): number {
  return Math.max(0, getWeaponSpec(hero.weaponId).magSize);
}

/** Hoàn `n` viên đạn vào băng súng đang cầm (không vượt băng gốc). */
function refundAmmo(hero: WeaponSkillHero, n: number): void {
  const mag = magSizeOf(hero);
  if (mag <= 0) return;
  hero.slot.ammoInMag = Math.min(mag, Math.max(0, hero.slot.ammoInMag) + n);
}

/** Kẻ địch trong hình nón trước mặt (gần → xa), có tầm nhìn. Trả bản sao để an toàn khi gọi api tiếp. */
function enemiesInCone(
  hero: WeaponSkillHero,
  api: WeaponSkillApi,
  aim: number,
  halfAngle: number,
  range: number,
): WeaponSkillTargetInfo[] {
  const out: WeaponSkillTargetInfo[] = [];
  for (const info of api.queryEnemies(hero.x, hero.y, range)) {
    const da = Math.abs(wrapAngle(Math.atan2(info.y - hero.y, info.x - hero.x) - aim));
    const slack = info.dist > 1 ? Math.atan2(info.radius, info.dist) : Math.PI;
    if (da > halfAngle + slack) continue;
    if (!api.hasLineOfSight(hero.x, hero.y, info.x, info.y)) continue;
    out.push(info);
  }
  return out;
}

/** Ưu tiên Boss > Tinh anh > máu cao nhất. */
function threatScore(info: WeaponSkillTargetInfo): number {
  const t = info.target;
  return (info.isBoss ? 1e7 : 0) + (t.tier === 'elite' ? 1e6 : 0) + Math.max(0, t.hp);
}

/** Tìm lại actor theo id quanh người chơi (mục tiêu có thể đã di chuyển). */
function findActor(api: WeaponSkillApi, hero: WeaponSkillHero, actorId: number, range: number): WeaponSkillTargetInfo | null {
  for (const info of api.queryEnemies(hero.x, hero.y, range)) {
    if (info.actorId === actorId) return info;
  }
  return null;
}

/** Tìm WeaponSkillTargetInfo tương ứng với 1 BansungCombatTarget (cho nội tại onHit). */
function infoForTarget(
  api: WeaponSkillApi,
  hero: WeaponSkillHero,
  target: BansungCombatTarget,
): WeaponSkillTargetInfo | null {
  const known = typeof target.x === 'number' && typeof target.y === 'number';
  const list = known ? api.queryEnemies(target.x as number, target.y as number, 48) : api.queryEnemies(hero.x, hero.y, 1300);
  for (const info of list) {
    if (info.target === target) return info;
  }
  return null;
}

function muzzle(hero: WeaponSkillHero, ang: number, dist = 22): { x: number; y: number } {
  return { x: hero.x + Math.cos(ang) * dist, y: hero.y + Math.sin(ang) * dist };
}

/** Cộng dồn có giới hạn + ghi tick trúng gần nhất. */
function bumpStacks(ps: WeaponSkillPassiveState, api: WeaponSkillApi, max: number): void {
  ps.stacks = Math.min(max, ps.stacks + 1);
  ps.vars.lastHitTick = api.tickNo;
}

/** Giảm 1 cộng dồn mỗi `stepTicks` sau khi đã `graceTicks` không trúng. */
function decayStacks(ps: WeaponSkillPassiveState, api: WeaponSkillApi, graceTicks: number, stepTicks: number, resetAll = false): void {
  if (ps.stacks <= 0) return;
  const idle = api.tickNo - (ps.vars.lastHitTick ?? api.tickNo);
  if (idle < graceTicks) return;
  if (resetAll) {
    ps.stacks = 0;
    return;
  }
  if ((idle - graceTicks) % Math.max(1, stepTicks) === 0) ps.stacks = Math.max(0, ps.stacks - 1);
}

export const BANSUNG_KINETIC_SKILL_HANDLERS: WeaponSkillHandlerTable = {
  // ── Pistol · Quickdraw: 6 phát rút súng thần tốc vào 6 mục tiêu trong nón 70° ──────────
  pistol: {
    cast(hero, api, st) {
      const targets = enemiesInCone(hero, api, st.aim, 0.62, 650).slice(0, 6);
      if (targets.length === 0) return false;
      api.emitCast(hero.x, hero.y);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const m = muzzle(hero, Math.atan2(t.y - hero.y, t.x - hero.x));
        api.emitBeam(m.x, m.y, t.x, t.y, BANSUNG_FX_BEAM_RAIL);
        api.damageTarget(t, {
          baseDmg: 34,
          dmgKind: 'kinetic',
          armorPiercePct: 0.2,
          critChance: 0.35,
          critMult: 1.8,
          forceCrit: i === 0,
          knockback: 140,
        });
        api.emitImpact(t.x, t.y);
      }
      return true;
    },
    passive: {
      // Last Round: viên cuối cùng trong băng +60% sát thương
      mods(hero) {
        return hero.slot.ammoInMag === 1 ? { dmgMult: 1.6 } : undefined;
      },
    },
  },

  // ── Rifle · Suppressive Fire: buff tốc bắn, vô hạn đạn, +1 xuyên ─────────────────────────
  rifle: {
    cast(hero, api, st) {
      api.addBuff({ fireRateMult: 1.35, infiniteAmmo: true, extraPierce: 1 }, st.durationMs, 'rifle_suppressive');
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step() {
      return true;
    },
    passive: {
      // Marksman Rhythm: +2%/phát trúng (tối đa 10), mất sạch sau 1.5 s không trúng
      mods(_hero, ps) {
        return ps.stacks > 0 ? { dmgMult: 1 + 0.02 * ps.stacks } : undefined;
      },
      onHit(_hero, api, ps) {
        bumpStacks(ps, api, 10);
      },
      onTick(_hero, api, ps) {
        decayStacks(ps, api, 45, 1, true);
      },
    },
  },

  // ── SMG · Hornet Swarm: xoay người xả 36 viên ra mọi hướng trong 1.2 s ─────────────────
  smg: {
    cast(hero, api, st) {
      st.vars.rot = st.aim;
      st.vars.fired = 0;
      api.emitCast(hero.x, hero.y);
      // Cú xoay đầu tiên hất lùi zombie bám sát
      api.damageCircle(hero.x, hero.y, 90, { baseDmg: 10, dmgKind: 'kinetic', knockback: 360 }, { maxTargets: 12 });
      return true;
    },
    step(hero, api, st) {
      if ((st.vars.fired ?? 0) >= 36) return false;
      for (let k = 0; k < 2 && (st.vars.fired ?? 0) < 36; k++) {
        const ang = (st.vars.rot ?? 0) + k * Math.PI;
        const m = muzzle(hero, ang, 18);
        api.spawnProjectile({
          kind: 'kinetic_sm',
          x: m.x,
          y: m.y,
          vx: Math.cos(ang) * 820,
          vy: Math.sin(ang) * 820,
          baseDmg: 14,
          dmgKind: 'kinetic',
          critChance: 0.22,
          critMult: 1.5,
          knockback: 110,
          maxRange: 520,
        });
        st.vars.fired = (st.vars.fired ?? 0) + 1;
      }
      st.vars.rot = (st.vars.rot ?? 0) + TWO_PI / 18;
      return true;
    },
    passive: {
      // Adrenaline Rush: hạ zombie → +15% tốc bắn, +10% tốc chạy trong 2 s
      onKill(hero, api) {
        api.addBuff({ fireRateMult: 1.15, moveSpeedMult: 1.1 }, 2000, 'smg_adrenaline');
        api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Shotgun · Dragon Breath: phun lửa hình nón 320 px ──────────────────────────────────
  shotgun: {
    cast(hero, api, st) {
      api.emitCast(hero.x, hero.y);
      api.damageCone(
        hero.x,
        hero.y,
        st.aim,
        0.45,
        320,
        { baseDmg: 130, dmgKind: 'fire', dotKind: 'burn', critChance: 0.1, knockback: 420 },
        { edgeMult: 0.5, requireLos: true, maxTargets: 24 },
      );
      const reach = api.raycastWall(hero.x, hero.y, st.aim, 220);
      const fx = hero.x + Math.cos(st.aim) * reach;
      const fy = hero.y + Math.sin(st.aim) * reach;
      api.emitBlast(BANSUNG_FX_BLAST_FIREBALL, fx, fy, 70);
      api.emitImpact(fx, fy);
      return true;
    },
    passive: {
      // Pump Feed: hạ zombie hoàn 1 viên đạn
      onKill(hero, api) {
        refundAmmo(hero, 1);
        api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Sniper · Deadeye: khoá 3 mục tiêu mạnh nhất, 3 phát xuyên chí mạng ─────────────────
  sniper_rifle: {
    cast(hero, api, st) {
      const cands = api
        .queryEnemies(hero.x, hero.y, 1400)
        .filter((i) => api.hasLineOfSight(hero.x, hero.y, i.x, i.y))
        .slice();
      if (cands.length === 0) return false;
      cands.sort((a, b) => threatScore(b) - threatScore(a));
      const n = Math.min(3, cands.length);
      st.vars.n = n;
      for (let k = 0; k < 3; k++) st.vars['t' + k] = cands[k % n].actorId;
      api.emitCast(hero.x, hero.y);
      for (let k = 0; k < n; k++) api.emitImpact(cands[k].x, cands[k].y); // dấu khoá mục tiêu
      return true;
    },
    step(hero, api, st) {
      const shotTicks = [8, 18, 28];
      const k = shotTicks.indexOf(st.tick);
      if (k < 0) return st.tick < 30;
      const id = st.vars['t' + k] ?? -1;
      const tgt = findActor(api, hero, id, 1450) ?? api.nearestEnemy(hero.x, hero.y, 1400);
      if (!tgt) return st.tick < 30;
      const ang = Math.atan2(tgt.y - hero.y, tgt.x - hero.x);
      const len = api.raycastWall(hero.x, hero.y, ang, 1400);
      const m = muzzle(hero, ang);
      const ex = hero.x + Math.cos(ang) * len;
      const ey = hero.y + Math.sin(ang) * len;
      api.emitBeam(m.x, m.y, ex, ey, BANSUNG_FX_BEAM_RAIL);
      api.damageLine(
        m.x,
        m.y,
        ex,
        ey,
        10,
        { baseDmg: 150, dmgKind: 'pierce', armorPiercePct: 0.5, forceCrit: true, critMult: 2.0, knockback: 200 },
        { maxTargets: 4 },
      );
      api.emitImpact(tgt.x, tgt.y);
      return st.tick < 30;
    },
    passive: {
      // Executioner: hạ zombie hoàn 1 viên + 6 năng lượng
      onKill(hero, api) {
        refundAmmo(hero, 1);
        api.grantEnergy(6);
        api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Dual Pistols · Gun Kata: lướt bất tử rồi xả vòng đạn quanh người ──────────────────
  dual_pistols: {
    cast(hero, api, st) {
      api.emitCast(hero.x, hero.y);
      api.setInvuln(350);
      let pos = { x: hero.x, y: hero.y };
      const step = 170 / 5;
      for (let i = 0; i < 5; i++) pos = api.moveHero(Math.cos(st.aim) * step, Math.sin(st.aim) * step);
      api.refillMag();
      api.damageCircle(
        pos.x,
        pos.y,
        190,
        { baseDmg: 38, dmgKind: 'kinetic', critChance: 0.25, critMult: 1.65, knockback: 220 },
        { maxTargets: 12, requireLos: true },
      );
      for (let k = 0; k < 8; k++) {
        const ang = st.aim + (k / 8) * TWO_PI;
        api.spawnProjectile({
          kind: 'kinetic_sm',
          x: pos.x + Math.cos(ang) * 18,
          y: pos.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * 840,
          vy: Math.sin(ang) * 840,
          baseDmg: 16,
          dmgKind: 'kinetic',
          critChance: 0.22,
          critMult: 1.65,
          maxRange: 420,
        });
      }
      api.emitImpact(pos.x, pos.y);
      return true;
    },
    passive: {
      // Flow State: +3% tốc chạy mỗi phát trúng (tối đa +15%), mất dần sau 1 s không trúng
      mods(_hero, ps) {
        return ps.stacks > 0 ? { moveSpeedMult: 1 + 0.03 * ps.stacks } : undefined;
      },
      onHit(_hero, api, ps) {
        bumpStacks(ps, api, 5);
      },
      onTick(_hero, api, ps) {
        decayStacks(ps, api, 30, 10);
      },
    },
  },

  // ── Minigun · Bullet Storm: buff tốc bắn khủng, vô hạn đạn, +1 tia, chậm chân ─────────
  minigun: {
    cast(hero, api, st) {
      api.addBuff(
        { fireRateMult: 1.6, infiniteAmmo: true, extraMultishot: 1, moveSpeedMult: 0.75 },
        st.durationMs,
        'minigun_bullet_storm',
      );
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step() {
      return true;
    },
    passive: {
      // Spin Up: giữ cò → +3% tốc bắn mỗi 3 tick (tối đa +30%), nhả cò nguội 1 nấc / 2 tick
      mods(_hero, ps) {
        return ps.stacks > 0 ? { fireRateMult: 1 + 0.03 * ps.stacks } : undefined;
      },
      onTick(_hero, api, ps, firing) {
        if (firing) {
          if (api.tickNo % 3 === 0) ps.stacks = Math.min(10, ps.stacks + 1);
        } else if (ps.stacks > 0 && api.tickNo % 2 === 0) {
          ps.stacks -= 1;
        }
      },
    },
  },

  // ── Saw Launcher · Buzzsaw Orbit: 3 lưỡi cưa xoay quanh người ───────────────────────────
  saw_launcher: {
    cast(hero, api, st) {
      st.vars.ang = st.aim;
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      st.vars.ang = (st.vars.ang ?? 0) + 0.22;
      if (st.tick % 3 !== 0) return true;
      for (let k = 0; k < 3; k++) {
        const a = (st.vars.ang ?? 0) + (k / 3) * TWO_PI;
        api.damageCircle(
          hero.x + Math.cos(a) * 95,
          hero.y + Math.sin(a) * 95,
          24,
          { baseDmg: 16, dmgKind: 'kinetic', dotKind: 'bleed', knockback: 140 },
          { maxTargets: 4 },
        );
      }
      return true;
    },
    passive: {
      // Ripper: mỗi phát trúng thứ 4 xé thêm 25 sát thương + chảy máu
      onHit(hero, api, ps, target) {
        ps.vars.count = (ps.vars.count ?? 0) + 1;
        if (ps.vars.count % 4 !== 0) return;
        const info = infoForTarget(api, hero, target);
        if (!info) return;
        api.damageTarget(info, { baseDmg: 25, dmgKind: 'kinetic', dotKind: 'bleed' });
        api.emitPassive(info.x, info.y);
      },
    },
  },

  // ── Plasma Shotgun · Plasma Nova: nổ vòng plasma 210 px ────────────────────────────────
  plasma_shotgun: {
    cast(hero, api) {
      api.emitCast(hero.x, hero.y);
      api.emitBlast(BANSUNG_FX_BLAST_HERO_NOVA, hero.x, hero.y, 210);
      api.damageCircle(
        hero.x,
        hero.y,
        210,
        {
          baseDmg: 95,
          dmgKind: 'energy',
          armorPiercePct: 0.4,
          dotKind: 'burn',
          knockback: 480,
          slowPct: 0.3,
          slowMs: 1500,
        },
        { edgeMult: 0.6, maxTargets: 32, requireLos: true },
      );
      return true;
    },
    passive: {
      // Overcharge: hạ zombie hồi 4 năng lượng
      onKill(hero, api) {
        if (api.grantEnergy(4) > 0) api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Twin SMG · Crossfire: 2 luồng đạn chéo quét qua lại theo hướng ngắm ───────────────
  twin_smg: {
    cast(hero, api, st) {
      st.vars.fired = 0;
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      if ((st.vars.fired ?? 0) >= 44) return false;
      if (st.tick % 2 !== 0) return true;
      const sweep = 0.38 * Math.sin(st.tick * 0.28);
      for (const side of [-1, 1]) {
        const ang = hero.aimRad + side * (0.2 + sweep);
        const m = muzzle(hero, ang, 20);
        api.spawnProjectile({
          kind: 'twin_smg_bullet',
          x: m.x,
          y: m.y,
          vx: Math.cos(ang) * 980,
          vy: Math.sin(ang) * 980,
          baseDmg: 11,
          dmgKind: 'kinetic',
          critChance: 0.14,
          critMult: 1.6,
          maxRange: 540,
        });
        st.vars.fired = (st.vars.fired ?? 0) + 1;
      }
      return true;
    },
    passive: {
      // Last Stand: máu < 40% → +25% tốc bắn
      mods(hero) {
        return hero.maxHp > 0 && hero.hp / hero.maxHp < 0.4 ? { fireRateMult: 1.25 } : undefined;
      },
    },
  },

  // ── Ricochet Disc · Blade Storm: 8 lưỡi dao nảy 6 lần ra mọi hướng ───────────────────
  ricochet_disc: {
    cast(hero, api, st) {
      api.emitCast(hero.x, hero.y);
      for (let k = 0; k < 8; k++) {
        const ang = st.aim + (k / 8) * TWO_PI;
        const m = muzzle(hero, ang, 20);
        api.spawnProjectile({
          kind: 'ricochet_blade',
          x: m.x,
          y: m.y,
          vx: Math.cos(ang) * 900,
          vy: Math.sin(ang) * 900,
          baseDmg: 48,
          dmgKind: 'kinetic',
          bouncesLeft: 6,
          pierceLeft: 3,
          dotKind: 'bleed',
          dotDurMs: 3000,
          critChance: 0.28,
          critMult: 1.85,
        });
      }
      return true;
    },
    passive: {
      // Edge Master: +2% chí mạng mỗi phát trúng (tối đa +20%), mất dần sau 2 s
      mods(_hero, ps) {
        return ps.stacks > 0 ? { critChanceAdd: 0.02 * ps.stacks } : undefined;
      },
      onHit(_hero, api, ps) {
        bumpStacks(ps, api, 10);
      },
      onTick(_hero, api, ps) {
        decayStacks(ps, api, 60, 6);
      },
    },
  },

  // ── Phantom Bow · Spirit Volley: 5 mũi tên linh hồn tự tìm mục tiêu ──────────────────
  phantom_bow: {
    cast(hero, api, st) {
      const cands = enemiesInCone(hero, api, st.aim, 1.1, 1000);
      cands.sort((a, b) => threatScore(b) - threatScore(a));
      for (let k = 0; k < 5; k++) st.vars['t' + k] = cands.length > 0 ? cands[k % cands.length].actorId : -1;
      st.vars.fired = 0;
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      const fired = st.vars.fired ?? 0;
      if (fired >= 5) return false;
      if (st.tick % 5 !== 2) return true;
      const id = st.vars['t' + fired] ?? -1;
      const tgt = id >= 0 ? findActor(api, hero, id, 1100) : null;
      const ang = tgt ? Math.atan2(tgt.y - hero.y, tgt.x - hero.x) : st.aim + (fired - 2) * 0.12;
      const m = muzzle(hero, ang, 22);
      api.spawnProjectile({
        kind: 'phantom_arrow',
        x: m.x,
        y: m.y,
        vx: Math.cos(ang) * 1100,
        vy: Math.sin(ang) * 1100,
        baseDmg: 100,
        dmgKind: 'pierce',
        pierceLeft: 3,
        armorPiercePct: 0.45,
        critChance: 0.4,
        critMult: 2.3,
        isHoming: true,
        homingTurnRateRadPerS: 6,
        homingConeCos: 0.2,
        homingDetectRange: 600,
        maxRange: 1100,
      });
      st.vars.fired = fired + 1;
      return true;
    },
    passive: {
      // Split Arrow: mũi tên thứ 5 tách thành 3 (+2 tia)
      mods(_hero, ps) {
        return (ps.vars.count ?? 0) % 5 === 4 ? { extraMultishot: 2 } : undefined;
      },
      onShot(hero, api, ps) {
        const before = ps.vars.count ?? 0;
        ps.vars.count = before + 1;
        ps.stacks = (before + 1) % 5;
        if (before % 5 === 4) api.emitPassive(hero.x, hero.y);
      },
    },
  },
};
