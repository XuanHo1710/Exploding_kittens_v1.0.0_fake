/**
 * server/src/game/bansung/weapon-skills/explosive.ts — logic skill chủ động + nội tại nhóm chất nổ
 * (spec 007 · C). Dữ liệu hiển thị: shared/src/bansung/weapon-skills/explosive.ts.
 *
 * Nguyên tắc: không gây sát thương đồng đội (mọi đòn đi qua WeaponSkillApi chỉ nhắm kẻ địch),
 * boss chỉ bị choáng ngắn (≤ 300 ms), mọi vùng nổ đều có cảnh báo trước qua emitCast (client vẽ vòng).
 * Sát thương truyền vào api được tự nhân hero.dmgScale (cấp Mk × perk × gacha).
 */
import {
  BANSUNG_EXPLOSIVE_COOP_RULES,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_MINE,
  BANSUNG_FX_BLAST_ORBITAL,
  BANSUNG_FX_BLAST_STUN,
  getWeaponSpec,
  type BansungExplosiveWeaponSpec,
} from '../../../../../shared/src';
import type { WeaponSkillApi, WeaponSkillHandlerTable, WeaponSkillHero, WeaponSkillProjectile } from './types';

const TICK_MS = 1000 / 30;

function ticksOfMs(ms: number): number {
  return ms <= 0 ? 0 : Math.ceil(ms / TICK_MS);
}

function explosiveSpec(hero: WeaponSkillHero): BansungExplosiveWeaponSpec | null {
  const spec = getWeaponSpec(hero.weaponId);
  return spec.category === 'explosive' ? (spec as BansungExplosiveWeaponSpec) : null;
}

/** Kẹp điểm trỏ chuột trong tầm `maxDist` tính từ người chơi. */
function clampTarget(hero: WeaponSkillHero, tx: number, ty: number, maxDist: number): { x: number; y: number } {
  const dx = tx - hero.x;
  const dy = ty - hero.y;
  const d = Math.hypot(dx, dy);
  if (!(d > maxDist)) return { x: tx, y: ty };
  const k = maxDist / Math.max(1, d);
  return { x: hero.x + dx * k, y: hero.y + dy * k };
}

/** Điểm nòng súng gần đúng (vai người chơi + chiều dài nòng theo hướng bắn). */
function muzzleOf(hero: WeaponSkillHero, ang: number, dist = 24): { x: number; y: number } {
  return { x: hero.x + Math.cos(ang) * dist, y: hero.y - 10 + Math.sin(ang) * dist };
}

/** Tốc độ ngang để lựu bay vòng cầu đáp đúng khoảng cách `dist` (công thức như spawnExplosiveShot). */
function lobSpeedFor(spec: BansungExplosiveWeaponSpec, dist: number): number {
  const z = BANSUNG_EXPLOSIVE_COOP_RULES.lobSpawnZ;
  const g = Math.max(1, spec.gravityZ);
  const tFlight = (spec.initVZ + Math.sqrt(spec.initVZ * spec.initVZ + 2 * g * z)) / g;
  const d = Math.max(BANSUNG_EXPLOSIVE_COOP_RULES.lobAimMinPx, Math.min(spec.range, dist));
  return Math.max(140, Math.min(spec.projSpeed, d / Math.max(0.15, tFlight)));
}

/** Đạn nổ dựng từ thông số súng gốc, cho phép ghi đè. Sát thương = baseDmg × hero.dmgScale. */
function explosiveProjectile(
  spec: BansungExplosiveWeaponSpec,
  x: number,
  y: number,
  ang: number,
  speed: number,
  over: Partial<WeaponSkillProjectile> = {},
): WeaponSkillProjectile {
  const isLob = spec.fireMode === 'lob' || spec.fireMode === 'mine';
  return {
    kind: spec.projKind,
    weaponId: spec.id,
    x,
    y,
    z: isLob ? BANSUNG_EXPLOSIVE_COOP_RULES.lobSpawnZ : BANSUNG_EXPLOSIVE_COOP_RULES.rocketSpawnZ,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    vz: spec.initVZ,
    radius: spec.projRadius,
    maxRange: spec.range,
    ttlTicks: spec.fuseTicks,
    bouncesLeft: spec.bouncesMax,
    pierceLeft: 1,
    dmgKind: 'explosive',
    baseDmg: spec.damage,
    affinity: spec.armorMult,
    critChance: spec.critChance,
    critMult: spec.critMult,
    knockback: spec.knockbackSpeed,
    stunMs: spec.stunMs,
    isExplosive: true,
    blastRadius: spec.blastRadius,
    coreRadius: spec.coreRadius,
    outerFalloffMin: spec.outerFalloffMin,
    stunFalloffMin: spec.stunFalloffMin ?? spec.outerFalloffMin,
    shrapnelCount: spec.shrapnelCount,
    shrapnelDamage: spec.shrapnelDamage,
    shrapnelSpeed: spec.shrapnelSpeed,
    shrapnelTtlTicks: ticksOfMs(spec.shrapnelTtlMs),
    ...over,
  };
}

/** Nổ diện rộng chỉ trúng kẻ địch; boss nhận choáng tối đa 300 ms, không bị đẩy. */
function blastAt(
  api: WeaponSkillApi,
  x: number,
  y: number,
  r: number,
  baseDmg: number,
  opts: {
    affinity?: readonly [number, number];
    stunMs?: number;
    knockback?: number;
    slowPct?: number;
    slowMs?: number;
    critChance?: number;
    critMult?: number;
    armorPiercePct?: number;
    edgeMult?: number;
  } = {},
): number {
  const list = api.queryEnemies(x, y, r).slice(0, 64);
  const edge = opts.edgeMult ?? 0.5;
  let n = 0;
  for (const info of list) {
    const u = r > 0 ? Math.min(1, Math.max(0, (info.dist - info.radius) / r)) : 0;
    const mult = 1 + (edge - 1) * u;
    const stun = opts.stunMs ? (info.isBoss ? Math.min(300, opts.stunMs) : opts.stunMs) : 0;
    const res = api.damageTarget(
      info,
      {
        baseDmg: baseDmg * mult,
        dmgKind: 'explosive',
        ...(opts.affinity ? { affinity: opts.affinity } : {}),
        ...(stun ? { stunMs: stun } : {}),
        ...(opts.knockback && !info.isBoss ? { knockback: opts.knockback } : {}),
        ...(opts.slowPct && opts.slowMs ? { slowPct: opts.slowPct, slowMs: opts.slowMs } : {}),
        ...(opts.critChance !== undefined ? { critChance: opts.critChance } : {}),
        ...(opts.critMult !== undefined ? { critMult: opts.critMult } : {}),
        ...(opts.armorPiercePct !== undefined ? { armorPiercePct: opts.armorPiercePct } : {}),
      },
      x,
      y,
    );
    if (res && !res.blocked) n += 1;
  }
  return n;
}

const GL_FAN = [-0.28, -0.14, 0, 0.14, 0.28] as const;
const MINEFIELD_COUNT = 6;
const ORBITAL_STRIKE_TICKS = [30, 36, 42, 48, 58] as const;

export const BANSUNG_EXPLOSIVE_SKILL_HANDLERS: WeaponSkillHandlerTable = {
  // ------------------------------------------------------------------------
  // Frag Barrage — 5 lựu hình quạt, mỗi 3 tick 1 quả
  // ------------------------------------------------------------------------
  grenade_launcher: {
    cast(hero, api, st) {
      if (!explosiveSpec(hero)) return false;
      const p = clampTarget(hero, st.tx, st.ty, 420);
      st.vars.dist = Math.max(90, Math.hypot(p.x - hero.x, p.y - hero.y));
      st.vars.aim = Math.atan2(p.y - hero.y, p.x - hero.x);
      st.vars.fired = 0;
      api.emitCast(p.x, p.y);
      api.sfx('sfx_gl_fire', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      const spec = explosiveSpec(hero);
      if (!spec) return false;
      const n = st.vars.fired ?? 0;
      if (n >= GL_FAN.length) return st.tick < 22;
      if ((st.tick - 1) % 3 !== 0) return true;
      const ang = (st.vars.aim ?? hero.aimRad) + GL_FAN[n];
      const dist = (st.vars.dist ?? 260) * (n % 2 === 0 ? 1 : 0.82);
      const m = muzzleOf(hero, ang);
      api.spawnProjectile(
        explosiveProjectile(spec, m.x, m.y, ang, lobSpeedFor(spec, dist), {
          baseDmg: spec.damage * 0.9,
        }),
      );
      st.vars.fired = n + 1;
      return true;
    },
    passive: {
      onTick(_hero, api, ps) {
        if (ps.stacks > 0 && api.tickNo > (ps.vars.until ?? 0)) ps.stacks = 0;
      },
      onKill(hero, api, ps) {
        ps.stacks = Math.min(5, ps.stacks + 1);
        ps.vars.until = api.tickNo + 120;
        api.addBuff({ dmgMult: 1 + 0.04 * ps.stacks }, 4000, 'gl_demolition');
        if (ps.stacks === 5) api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ------------------------------------------------------------------------
  // Concussion Dome — cảnh báo 0.8 s rồi nổ chấn động tại con trỏ
  // ------------------------------------------------------------------------
  stun_launcher: {
    cast(hero, api, st) {
      const p = clampTarget(hero, st.tx, st.ty, 480);
      st.vars.cx = p.x;
      st.vars.cy = p.y;
      api.emitCast(p.x, p.y);
      api.sfx('sfx_stun_fire', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      if (st.tick !== 24) return true;
      const cx = st.vars.cx ?? hero.x;
      const cy = st.vars.cy ?? hero.y;
      blastAt(api, cx, cy, 180, 55, {
        affinity: [0.9, 1.0],
        stunMs: 1200,
        knockback: 420,
        edgeMult: 0.7,
      });
      api.emitBlast(BANSUNG_FX_BLAST_STUN, cx, cy, 180);
      api.emitImpact(cx, cy);
      api.sfx('sfx_stun_burst', cx, cy);
      return true;
    },
    passive: {
      onHit(hero, api, ps, _target, res) {
        if (!(res.stunAppliedMs > 0)) return;
        if (api.tickNo - (ps.vars.lastTick ?? -999) < 15) return;
        ps.vars.lastTick = api.tickNo;
        if (api.addShield(2) > 0) api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ------------------------------------------------------------------------
  // Tank Buster — 1 rocket HEAT lớn, xuyên giáp
  // ------------------------------------------------------------------------
  bazooka: {
    cast(hero, api, st) {
      const spec = explosiveSpec(hero);
      if (!spec) return false;
      const ang = st.aim;
      const m = muzzleOf(hero, ang, 28);
      const ok = api.spawnProjectile(
        explosiveProjectile(spec, m.x, m.y, ang, 380, {
          kind: 'rocket',
          radius: 11,
          maxRange: 900,
          ttlTicks: 60,
          baseDmg: 300,
          affinity: [0.8, 1.6],
          armorPiercePct: 0.5,
          critChance: 0.15,
          knockback: 520,
          stunMs: 250,
          blastRadius: 120,
          coreRadius: 50,
          outerFalloffMin: 0.5,
          shrapnelCount: 0,
        }),
      );
      if (!ok) return false;
      // Giật lùi mạnh (có trượt tường)
      api.moveHero(-Math.cos(ang) * 18, -Math.sin(ang) * 18);
      api.emitCast(m.x, m.y);
      api.sfx('sfx_bazooka_fire', hero.x, hero.y);
      return true;
    },
    passive: {
      onTick(hero, _api, ps) {
        const lx = ps.vars.lx ?? hero.x;
        const ly = ps.vars.ly ?? hero.y;
        const moved = Math.hypot(hero.x - lx, hero.y - ly) > 1.5;
        ps.vars.lx = hero.x;
        ps.vars.ly = hero.y;
        ps.vars.still = moved ? 0 : Math.min(600, (ps.vars.still ?? 0) + 1);
        ps.stacks = (ps.vars.still ?? 0) >= 30 ? 1 : 0;
      },
      mods(_hero, ps) {
        return (ps.vars.still ?? 0) >= 30 ? { dmgMult: 1.15, blastRadiusMult: 1.1 } : undefined;
      },
    },
  },

  // ------------------------------------------------------------------------
  // Minefield — 6 mìn vòng tròn, nổ khi zombie lại gần, kích nổ hết khi hết giờ
  // (logic tự quản lý trong skill — không dùng pool mìn nên không vượt trần 8 mìn/người)
  // ------------------------------------------------------------------------
  mine_gun: {
    cast(hero, api, st) {
      const p = clampTarget(hero, st.tx, st.ty, 420);
      st.vars.cx = p.x;
      st.vars.cy = p.y;
      const rot = api.rng() * Math.PI * 2;
      for (let i = 0; i < MINEFIELD_COUNT; i++) {
        const a = rot + (i / MINEFIELD_COUNT) * Math.PI * 2;
        st.vars[`m${i}x`] = p.x + Math.cos(a) * 90;
        st.vars[`m${i}y`] = p.y + Math.sin(a) * 90;
        st.vars[`m${i}a`] = 1;
      }
      api.emitCast(p.x, p.y);
      api.sfx('sfx_mine_deploy', hero.x, hero.y);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick < 15) return true; // 0.5 s gài mìn
      let alive = 0;
      for (let i = 0; i < MINEFIELD_COUNT; i++) {
        if (!st.vars[`m${i}a`]) continue;
        const mx = st.vars[`m${i}x`];
        const my = st.vars[`m${i}y`];
        if (api.nearestEnemy(mx, my, 48)) {
          detonateMine(api, st.vars, i);
        } else {
          alive += 1;
        }
      }
      return alive > 0;
    },
    end(_hero, api, st) {
      for (let i = 0; i < MINEFIELD_COUNT; i++) {
        if (st.vars[`m${i}a`]) detonateMine(api, st.vars, i);
      }
    },
    passive: {
      onHit(_hero, _api, _ps, target) {
        if (!target.alive) return;
        target.slowPct = Math.max(target.slowPct ?? 0, 0.35);
        target.slowMs = Math.max(target.slowMs ?? 0, 1200);
      },
    },
  },

  // ------------------------------------------------------------------------
  // Hydra Swarm — 8 tên lửa tự dẫn, mỗi 3 tick 1 quả, toả hai bên
  // ------------------------------------------------------------------------
  cluster_rpg: {
    cast(hero, api, st) {
      if (!explosiveSpec(hero)) return false;
      const p = clampTarget(hero, st.tx, st.ty, 860);
      st.vars.aim = Math.atan2(p.y - hero.y, p.x - hero.x);
      st.vars.fired = 0;
      api.emitCast(p.x, p.y);
      api.sfx('sfx_bazooka_fire', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      const spec = explosiveSpec(hero);
      if (!spec) return false;
      const n = st.vars.fired ?? 0;
      if (n >= 8) return st.tick < 26;
      if ((st.tick - 1) % 3 !== 0) return true;
      const side = n % 2 === 0 ? 1 : -1;
      const ang = (st.vars.aim ?? hero.aimRad) + side * (0.35 + 0.08 * Math.floor(n / 2));
      const m = muzzleOf(hero, ang, 26);
      api.spawnProjectile(
        explosiveProjectile(spec, m.x, m.y, ang, 360, {
          kind: 'cluster_rocket',
          baseDmg: 55,
          blastRadius: 70,
          coreRadius: 26,
          shrapnelCount: 0,
          stunMs: 0,
          knockback: 200,
          maxRange: 900,
          ttlTicks: 60,
          isHoming: true,
          homingTurnRateRadPerS: 5,
          homingConeCos: 0.1,
          homingDetectRange: 520,
        }),
      );
      st.vars.fired = n + 1;
      return true;
    },
    passive: {
      onShot(hero, api, ps) {
        const n = (ps.vars.n ?? 0) + 1;
        ps.vars.n = n;
        ps.stacks = n % 4;
        if (n % 4 === 3) {
          // Phát kế tiếp (phát thứ 4) bắn thêm 1 tên lửa phụ
          api.addBuff({ extraMultishot: 1 }, 700, 'cr_split_payload');
          api.emitPassive(hero.x, hero.y);
        }
      },
    },
  },

  // ------------------------------------------------------------------------
  // Orbital Strike — cảnh báo 1 s, rồi 5 phát pháo quanh con trỏ
  // ------------------------------------------------------------------------
  orbital_cannon: {
    cast(hero, api, st) {
      const p = clampTarget(hero, st.tx, st.ty, 700);
      st.vars.cx = p.x;
      st.vars.cy = p.y;
      const rot = api.rng() * Math.PI * 2;
      for (let i = 0; i < 4; i++) {
        const a = rot + (i / 4) * Math.PI * 2;
        st.vars[`s${i}x`] = p.x + Math.cos(a) * 110;
        st.vars[`s${i}y`] = p.y + Math.sin(a) * 110;
      }
      st.vars.s4x = p.x;
      st.vars.s4y = p.y;
      api.emitCast(p.x, p.y);
      api.sfx('sfx_laser_charge', p.x, p.y);
      return true;
    },
    step(_hero, api, st) {
      const idx = ORBITAL_STRIKE_TICKS.indexOf(st.tick as (typeof ORBITAL_STRIKE_TICKS)[number]);
      if (idx < 0) return st.tick <= ORBITAL_STRIKE_TICKS[ORBITAL_STRIKE_TICKS.length - 1] + 6;
      const sx = st.vars[`s${idx}x`];
      const sy = st.vars[`s${idx}y`];
      const isFinal = idx === 4;
      blastAt(api, sx, sy, isFinal ? 140 : 120, isFinal ? 180 : 140, {
        affinity: [1.1, 1.35],
        critChance: 0.22,
        critMult: 1.9,
        knockback: 380,
        stunMs: isFinal ? 400 : 0,
        edgeMult: 0.5,
      });
      api.emitBeam(sx, sy - 320, sx, sy, BANSUNG_FX_BEAM_RAIL);
      api.emitBlast(BANSUNG_FX_BLAST_ORBITAL, sx, sy, isFinal ? 140 : 120);
      api.emitImpact(sx, sy);
      api.sfx('sfx_boom_heavy', sx, sy);
      return true;
    },
    passive: {
      onTick(_hero, api, ps) {
        if (ps.stacks > 0 && api.tickNo > (ps.vars.until ?? 0)) {
          ps.stacks -= 1;
          ps.vars.until = api.tickNo + 15; // mất 1 lần cộng dồn mỗi 0.5 s
        }
      },
      onKill(hero, api, ps) {
        ps.stacks = Math.min(10, ps.stacks + 1);
        ps.vars.until = api.tickNo + 180;
        if (ps.stacks === 10) api.emitPassive(hero.x, hero.y);
      },
      mods(_hero, ps) {
        return ps.stacks > 0 ? { critChanceAdd: 0.02 * ps.stacks } : undefined;
      },
    },
  },
};

function detonateMine(api: WeaponSkillApi, vars: Record<string, number>, i: number): void {
  vars[`m${i}a`] = 0;
  const mx = vars[`m${i}x`];
  const my = vars[`m${i}y`];
  blastAt(api, mx, my, 100, 70, {
    affinity: [1.1, 1.25],
    knockback: 300,
    slowPct: 0.35,
    slowMs: 1500,
    edgeMult: 0.5,
  });
  api.emitBlast(BANSUNG_FX_BLAST_MINE, mx, my, 100);
  api.emitImpact(mx, my);
  api.sfx('sfx_boom_heavy', mx, my);
}

/** Dùng cho test: các hằng số nội bộ của nhóm. */
export const EXPLOSIVE_SKILL_TUNING = {
  GL_FAN,
  MINEFIELD_COUNT,
  ORBITAL_STRIKE_TICKS,
  BLAST_KINDS: { he: BANSUNG_FX_BLAST_HE, cluster: BANSUNG_FX_BLAST_CLUSTER },
} as const;
