/**
 * server/src/game/bansung/weapon-skills/energy.ts — logic skill chủ động + nội tại nhóm năng lượng / phép
 * (spec 007 · C). Dữ liệu hiển thị: shared/src/bansung/weapon-skills/energy.ts. Khung + API: ./types.ts, ./index.ts.
 *
 * Nguyên tắc: chỉ thay đổi thế giới qua WeaponSkillApi. Sát thương truyền vào api tự nhân hero.dmgScale
 * (cấp Mk × perk × gacha). Boss không bị kéo / đẩy, chỉ làm chậm hoặc choáng ≤ 400 ms.
 * Lưu ý: api.queryEnemies trả MẢNG TÁI SỬ DỤNG — không gọi query khác khi đang duyệt mảng đó.
 */
import {
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
  BANSUNG_FX_BLAST_ABYSS_NOVA,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_FROST_SHATTER,
  BANSUNG_FX_BLAST_STEAM,
  BANSUNG_FX_BLAST_THUNDER_STORM,
} from '../../../../../shared/src';
import type { BansungCombatTarget } from '../damage';
import type {
  WeaponSkillApi,
  WeaponSkillCastState,
  WeaponSkillHandlerTable,
  WeaponSkillHero,
  WeaponSkillTargetInfo,
} from './types';

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

/** Kẹp điểm trỏ chuột vào tầm skill (tính từ người chơi). */
function clampCursor(hero: WeaponSkillHero, st: WeaponSkillCastState, maxRange: number): { x: number; y: number } {
  const dx = st.tx - hero.x;
  const dy = st.ty - hero.y;
  const d = Math.hypot(dx, dy);
  if (d <= maxRange || d < 1) return { x: st.tx, y: st.ty };
  return { x: hero.x + (dx / d) * maxRange, y: hero.y + (dy / d) * maxRange };
}

/** Chụp danh sách mục tiêu (bản sao, an toàn khi gọi query khác trong vòng lặp). */
function snapshotEnemies(api: WeaponSkillApi, x: number, y: number, r: number): WeaponSkillTargetInfo[] {
  return api.queryEnemies(x, y, r).slice();
}

/** Hút / đẩy mọi zombie (không phải boss) về phía (cx, cy) với tốc độ px/s. */
function pullEnemies(api: WeaponSkillApi, cx: number, cy: number, r: number, speed: number): void {
  const list = api.queryEnemies(cx, cy, r);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.isBoss) continue;
    const dx = cx - t.x;
    const dy = cy - t.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) continue;
    const k = speed * Math.min(1, d / 60);
    api.pushActor(t.actorId, (dx / d) * k, (dy / d) * k);
  }
}

function isArmoredTarget(t: BansungCombatTarget): boolean {
  return t.armorType === 'armored' || t.tier === 'boss' || t.tier === 'elite';
}

function targetPos(t: BansungCombatTarget, fallbackX: number, fallbackY: number): { x: number; y: number } {
  return {
    x: typeof t.x === 'number' && Number.isFinite(t.x) ? t.x : fallbackX,
    y: typeof t.y === 'number' && Number.isFinite(t.y) ? t.y : fallbackY,
  };
}

/** Sét nhảy chuỗi từ (x, y): mỗi bước tới kẻ địch gần nhất chưa trúng trong `hopR`. */
function chainLightning(
  api: WeaponSkillApi,
  startX: number,
  startY: number,
  hops: number,
  hopR: number,
  baseDmg: number,
  decay: number,
  stunMs: number,
  hit: Set<number>,
  beamKind: number,
): number {
  let cx = startX;
  let cy = startY;
  let dmg = baseDmg;
  let n = 0;
  for (let h = 0; h < hops; h++) {
    const list = api.queryEnemies(cx, cy, hopR);
    let next: WeaponSkillTargetInfo | null = null;
    for (let i = 0; i < list.length; i++) {
      if (!hit.has(list[i].actorId)) {
        next = list[i];
        break;
      }
    }
    if (!next) break;
    hit.add(next.actorId);
    api.emitBeam(cx, cy, next.x, next.y, beamKind);
    api.damageTarget(next, {
      baseDmg: dmg,
      dmgKind: 'energy',
      affinity: [1.1, 1.4],
      stunMs: next.isBoss ? Math.min(150, stunMs) : stunMs,
    }, cx, cy);
    cx = next.x;
    cy = next.y;
    dmg *= decay;
    n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const BANSUNG_ENERGY_SKILL_HANDLERS: WeaponSkillHandlerTable = {
  // ── Plasma Rifle · Plasma Overload (buff) ─────────────────────────────────
  plasma_rifle: {
    cast(hero, api, st) {
      api.addBuff({ fireRateMult: 1.5, extraPierce: 1, infiniteAmmo: true }, st.durationMs, 'plasma_overload');
      api.refillMag();
      api.emitCast(hero.x, hero.y);
      api.sfx('sfx_wpn_plasma', hero.x, hero.y);
      return true;
    },
    passive: {
      onShot(hero, api, ps) {
        ps.vars.shots = (ps.vars.shots ?? 0) + 1;
        ps.stacks = ps.vars.shots;
        if (ps.vars.shots >= 12) {
          ps.vars.shots = 0;
          ps.stacks = 0;
          api.grantEnergy(3);
          api.emitPassive(hero.x, hero.y);
        }
      },
    },
  },

  // ── Railgun · Rail Barrage (barrage) ─────────────────────────────────────
  railgun: {
    cast(hero, api, st) {
      st.vars.fired = 0;
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      // 3 tia ở tick 1, 13, 25 (~0.4 s mỗi tia), lệch nhẹ ±3° để quét rộng hơn
      if (st.tick !== 1 && st.tick !== 13 && st.tick !== 25) return true;
      const idx = st.vars.fired ?? 0;
      st.vars.fired = idx + 1;
      const ang = st.aim + (idx === 0 ? 0 : idx === 1 ? -0.05 : 0.05);
      const len = api.raycastWall(hero.x, hero.y, ang, 1100);
      const x1 = hero.x + Math.cos(ang) * len;
      const y1 = hero.y + Math.sin(ang) * len;
      api.emitBeam(hero.x, hero.y, x1, y1, BANSUNG_FX_BEAM_RAIL);
      api.damageLine(hero.x, hero.y, x1, y1, 14, {
        baseDmg: 160,
        dmgKind: 'energy',
        affinity: [0.8, 1.35],
        armorPiercePct: 0.5,
        stunMs: 300,
        knockback: 220,
      });
      api.emitImpact(x1, y1);
      api.sfx('sfx_wpn_railgun', hero.x, hero.y);
      return idx + 1 < 3;
    },
    passive: {
      onKill(hero, api) {
        api.grantEnergy(3);
        api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Lightning Staff · Thunderstorm (zone) ────────────────────────────────
  lightning_staff: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 600);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      api.emitCast(c.x, c.y);
      api.emitBlast(BANSUNG_FX_BLAST_THUNDER_STORM, c.x, c.y, 180);
      return true;
    },
    step(hero, api, st) {
      if (st.tick % 15 !== 0) return true;
      const cx = st.vars.cx;
      const cy = st.vars.cy;
      const list = snapshotEnemies(api, cx, cy, 180);
      if (list.length === 0) return true;
      const pick = list[Math.floor(api.rng() * list.length)];
      api.emitBeam(pick.x, pick.y - 320, pick.x, pick.y, BANSUNG_FX_BEAM_YELLOW_LIGHTNING);
      api.damageTarget(pick, {
        baseDmg: 60,
        dmgKind: 'energy',
        affinity: [1.2, 1.6],
        stunMs: pick.isBoss ? 120 : 250,
      }, pick.x, pick.y);
      // Lan sét: kẻ địch quanh điểm giáng chịu 40%
      api.damageCircle(pick.x, pick.y, 70, { baseDmg: 24, dmgKind: 'energy' });
      api.emitImpact(pick.x, pick.y);
      return true;
    },
    passive: {
      onHit(hero, api, ps, target) {
        ps.vars.hits = (ps.vars.hits ?? 0) + 1;
        ps.stacks = ps.vars.hits;
        if (ps.vars.hits < 5) return;
        ps.vars.hits = 0;
        ps.stacks = 0;
        const p = targetPos(target, hero.x, hero.y);
        const list = api.queryEnemies(p.x, p.y, 200);
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (t.target === target) continue;
          api.emitBeam(p.x, p.y, t.x, t.y, BANSUNG_FX_BEAM_CHAIN);
          api.damageTarget(t, { baseDmg: 25, dmgKind: 'energy', affinity: [1.2, 1.6] }, p.x, p.y);
          api.emitPassive(t.x, t.y);
          break;
        }
      },
    },
  },

  // ── Arcane Book · Meteor Rite (burst có độ trễ) ──────────────────────────
  arcane_book: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 560);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      st.vars.done = 0;
      api.emitCast(c.x, c.y); // client vẽ vòng cảnh báo 0.8 s
      return true;
    },
    step(hero, api, st) {
      if (st.tick < 24 || st.vars.done) return true;
      st.vars.done = 1;
      const cx = st.vars.cx;
      const cy = st.vars.cy;
      api.emitBlast(BANSUNG_FX_BLAST_FIREBALL, cx, cy, 140);
      api.damageCircle(cx, cy, 140, {
        baseDmg: 300,
        dmgKind: 'fire',
        affinity: [1.15, 0.9],
        dotKind: 'burn',
        knockback: 260,
      }, { edgeMult: 0.5 });
      api.emitImpact(cx, cy);
      api.sfx('expl_heavy', cx, cy);
      return false;
    },
    passive: {
      onKill(hero, api, _ps, target) {
        const p = targetPos(target, hero.x, hero.y);
        api.damageCircle(p.x, p.y, 70, { baseDmg: 30, dmgKind: 'fire', dotKind: 'burn' }, { maxTargets: 6 });
        api.emitPassive(p.x, p.y);
      },
    },
  },

  // ── Laser Cannon · Prism Sweep (beam quét) ───────────────────────────────
  laser_cannon: {
    cast(hero, api, st) {
      st.vars.half = 0.61; // ~35° mỗi bên → cung 70°
      api.emitCast(hero.x, hero.y);
      api.sfx('sfx_laser_beam', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      const u = Math.min(1, st.elapsedMs / Math.max(1, st.durationMs));
      const ang = st.aim - st.vars.half + 2 * st.vars.half * u;
      const len = 2200;
      const x1 = hero.x + Math.cos(ang) * len;
      const y1 = hero.y + Math.sin(ang) * len;
      if (st.tick % 2 === 1) api.emitBeam(hero.x, hero.y, x1, y1, BANSUNG_FX_BEAM_LASER_MAP);
      // Mỗi zombie chỉ trúng 1 lần trong cả lượt quét
      api.damageLine(hero.x, hero.y, x1, y1, 22, {
        baseDmg: 260,
        dmgKind: 'energy',
        affinity: [1.05, 1.35],
        armorPiercePct: 0.6,
      }, { exclude: st.hit });
      return true;
    },
    passive: {
      onTick(hero, api, ps, firing) {
        if (firing) {
          ps.vars.idle = 0;
          return;
        }
        ps.vars.idle = (ps.vars.idle ?? 0) + 1;
        if (ps.vars.idle < 60) return;
        // Đã ngừng bắn ≥ 2 s: giữ buff hội tụ (làm mới mỗi 10 tick, thời lượng 1.2 s < 1 nhịp bắn 1.33 s
        // nên chỉ phát kế tiếp được hưởng).
        if (!ps.vars.ready) {
          ps.vars.ready = 1;
          ps.stacks = 1;
          api.emitPassive(hero.x, hero.y);
        }
        if (ps.vars.idle % 10 === 0 || ps.vars.idle === 60) {
          api.addBuff({ dmgMult: 1.3 }, 1200, 'focus_lens');
        }
      },
      onShot(_hero, _api, ps) {
        ps.vars.ready = 0;
        ps.vars.idle = 0;
        ps.stacks = 0;
      },
    },
  },

  // ── Electric Gun · Arc Net (burst) ───────────────────────────────────────
  electric_gun: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 700);
      const first = api.nearestEnemy(c.x, c.y, 260);
      if (!first) return false; // không có mục tiêu → không tốn hồi chiêu
      // Chụp lại trước khi gọi query khác (mảng tái sử dụng)
      const fx = first.x;
      const fy = first.y;
      const firstInfo: WeaponSkillTargetInfo = { ...first };
      api.emitCast(hero.x, hero.y);
      st.hit.clear();
      st.hit.add(firstInfo.actorId);
      api.emitBeam(hero.x, hero.y - 10, fx, fy, BANSUNG_FX_BEAM_SHOCK);
      api.damageTarget(firstInfo, { baseDmg: 70, dmgKind: 'energy', affinity: [1.1, 1.4], stunMs: firstInfo.isBoss ? 150 : 250 });
      chainLightning(api, fx, fy, 7, 220, 63, 0.9, 250, st.hit, BANSUNG_FX_BEAM_SHOCK);
      api.sfx('sfx_shock_zap', fx, fy);
      return true;
    },
    passive: {
      onHit(hero, api, ps) {
        if ((ps.vars.cdTicks ?? 0) > api.tickNo) return;
        ps.vars.hits = (ps.vars.hits ?? 0) + 1;
        ps.stacks = ps.vars.hits;
        if (ps.vars.hits >= 10) {
          ps.vars.hits = 0;
          ps.stacks = 0;
          ps.vars.cdTicks = api.tickNo + 90;
          api.addBuff({ fireRateMult: 1.3 }, 3000, 'overcharge');
          api.emitPassive(hero.x, hero.y);
        }
      },
    },
  },

  // ── Flamethrower · Napalm Wave (cone + thảm lửa) ─────────────────────────
  flamethrower: {
    cast(hero, api, st) {
      api.emitCast(hero.x, hero.y);
      api.damageCone(hero.x, hero.y, st.aim, 0.36, 340, {
        baseDmg: 90,
        dmgKind: 'fire',
        affinity: [1.3, 0.75],
        dotKind: 'burn',
        knockback: 180,
      }, { requireLos: true });
      const reach = api.raycastWall(hero.x, hero.y, st.aim, 220);
      st.vars.cx = hero.x + Math.cos(st.aim) * reach;
      st.vars.cy = hero.y + Math.sin(st.aim) * reach;
      api.emitBlast(BANSUNG_FX_BLAST_FIREBALL, st.vars.cx, st.vars.cy, 90);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % 10 !== 0) return true;
      api.damageCircle(st.vars.cx, st.vars.cy, 90, { baseDmg: 25, dmgKind: 'fire', dotKind: 'burn' });
      return true;
    },
    end(_hero, api, st) {
      api.emitEnd(st.vars.cx, st.vars.cy);
    },
    passive: {
      onKill(hero, api) {
        if (api.heal(2) > 0) api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Cryo Cannon · Glacial Prison (zone khống chế) ────────────────────────
  cryo_cannon: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 640);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      st.vars.done = 0;
      api.emitCast(c.x, c.y);
      api.emitBlast(BANSUNG_FX_BLAST_FROST_SHATTER, c.x, c.y, 160);
      api.damageCircle(c.x, c.y, 160, {
        baseDmg: 120,
        dmgKind: 'energy',
        affinity: [1.1, 1.15],
        stunMs: 400,
        slowPct: 0.8,
        slowMs: 2500,
      });
      return true;
    },
    step(_hero, api, st) {
      // Giữ băng: kẻ địch đi vào vùng cũng bị chậm
      if (st.tick % 10 === 0) {
        const list = api.queryEnemies(st.vars.cx, st.vars.cy, 160);
        for (let i = 0; i < list.length; i++) {
          const t = list[i].target;
          const pct = list[i].isBoss ? 0.35 : 0.8;
          t.slowPct = Math.max(t.slowPct ?? 0, pct);
          t.slowMs = Math.max(t.slowMs ?? 0, 600);
        }
      }
      return true;
    },
    end(_hero, api, st) {
      if (st.vars.done) return;
      st.vars.done = 1;
      api.emitBlast(BANSUNG_FX_BLAST_FROST_SHATTER, st.vars.cx, st.vars.cy, 170);
      api.damageCircle(st.vars.cx, st.vars.cy, 170, {
        baseDmg: 180,
        dmgKind: 'energy',
        affinity: [1.1, 1.2],
        critChance: 0.35,
        critMult: 1.8,
      });
      api.emitImpact(st.vars.cx, st.vars.cy);
    },
    passive: {
      onHit(_hero, _api, _ps, target) {
        const pct = target.tier === 'boss' ? 0.1 : 0.25;
        target.slowPct = Math.max(target.slowPct ?? 0, pct);
        target.slowMs = Math.max(target.slowMs ?? 0, 1000);
      },
    },
  },

  // ── Gravity Gun · Singularity (zone hút) ─────────────────────────────────
  gravity_gun: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 760);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      api.emitCast(c.x, c.y);
      return true;
    },
    step(_hero, api, st) {
      const cx = st.vars.cx;
      const cy = st.vars.cy;
      if (st.tick % 3 === 0) pullEnemies(api, cx, cy, 260, 300);
      if (st.tick % 10 === 0) {
        api.damageCircle(cx, cy, 120, { baseDmg: 35, dmgKind: 'energy', affinity: [1.1, 1.15] });
      }
      return true;
    },
    end(_hero, api, st) {
      api.emitBlast(BANSUNG_FX_BLAST_ABYSS_NOVA, st.vars.cx, st.vars.cy, 160);
      api.damageCircle(st.vars.cx, st.vars.cy, 160, {
        baseDmg: 220,
        dmgKind: 'energy',
        affinity: [1.1, 1.2],
        knockback: 320,
      }, { edgeMult: 0.6 });
      api.emitImpact(st.vars.cx, st.vars.cy);
    },
    passive: {
      onKill(hero, api, _ps, target) {
        const p = targetPos(target, hero.x, hero.y);
        pullEnemies(api, p.x, p.y, 150, 260);
        api.emitPassive(p.x, p.y);
      },
    },
  },

  // ── Ion Beam · Ion Cannon (beam duy trì) ─────────────────────────────────
  ion_beam: {
    cast(hero, api) {
      api.emitCast(hero.x, hero.y);
      api.sfx('sfx_laser_beam', hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      // Tia bám theo hướng ngắm hiện tại của người chơi
      const ang = hero.aimRad;
      const len = api.raycastWall(hero.x, hero.y, ang, 900);
      const x1 = hero.x + Math.cos(ang) * len;
      const y1 = hero.y + Math.sin(ang) * len;
      if (st.tick % 2 === 1) api.emitBeam(hero.x, hero.y, x1, y1, BANSUNG_FX_BEAM_RAIL);
      if (st.tick % 5 === 0) {
        api.damageLine(hero.x, hero.y, x1, y1, 16, {
          baseDmg: 40,
          dmgKind: 'energy',
          affinity: [0.85, 1.6],
          armorPiercePct: 0.6,
        }, { maxTargets: 8 });
      }
      return true;
    },
    passive: {
      onHit(hero, api, ps, target) {
        if (!isArmoredTarget(target)) return;
        ps.vars.hits = (ps.vars.hits ?? 0) + 1;
        ps.stacks = ps.vars.hits;
        if (ps.vars.hits >= 3) {
          ps.vars.hits = 0;
          ps.stacks = 0;
          api.grantEnergy(2);
          api.emitPassive(hero.x, hero.y);
        }
      },
    },
  },

  // ── Tesla Coil · Tesla Tower (summon) ────────────────────────────────────
  tesla_coil: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 500);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      api.emitCast(c.x, c.y);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % 15 !== 0) return true;
      const cx = st.vars.cx;
      const cy = st.vars.cy;
      const list = snapshotEnemies(api, cx, cy, 260);
      const n = Math.min(4, list.length);
      for (let i = 0; i < n; i++) {
        const t = list[i];
        api.emitBeam(cx, cy - 30, t.x, t.y, BANSUNG_FX_BEAM_CHAIN);
        api.damageTarget(t, {
          baseDmg: 45,
          dmgKind: 'energy',
          affinity: [1.2, 1.6],
          stunMs: t.isBoss ? 0 : 150,
        }, cx, cy);
      }
      return true;
    },
    end(_hero, api, st) {
      api.emitEnd(st.vars.cx, st.vars.cy);
    },
    passive: {
      onTick(hero, api, ps, firing) {
        if (!firing || api.tickNo % 10 !== 0) return;
        const n = api.damageCircle(hero.x, hero.y, 90, { baseDmg: 6, dmgKind: 'energy', affinity: [1.2, 1.4] }, { maxTargets: 6 });
        ps.stacks = n;
        if (n > 0) api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Void Cannon · Void Rift (zone dạng đường) ────────────────────────────
  void_cannon: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 700);
      const ang = Math.atan2(c.y - hero.y, c.x - hero.x);
      const len = api.raycastWall(hero.x, hero.y, ang, Math.hypot(c.x - hero.x, c.y - hero.y));
      st.vars.x0 = hero.x;
      st.vars.y0 = hero.y;
      st.vars.x1 = hero.x + Math.cos(ang) * len;
      st.vars.y1 = hero.y + Math.sin(ang) * len;
      api.emitCast(st.vars.x1, st.vars.y1);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % 2 === 1) api.emitBeam(st.vars.x0, st.vars.y0, st.vars.x1, st.vars.y1, BANSUNG_FX_BEAM_SHOCK);
      if (st.tick % 10 === 0) {
        api.damageLine(st.vars.x0, st.vars.y0, st.vars.x1, st.vars.y1, 30, {
          baseDmg: 50,
          dmgKind: 'energy',
          affinity: [1.2, 1.35],
          slowPct: 0.4,
          slowMs: 700,
        });
      }
      return true;
    },
    end(_hero, api, st) {
      api.emitBlast(BANSUNG_FX_BLAST_ABYSS_NOVA, st.vars.x1, st.vars.y1, 130);
      api.damageCircle(st.vars.x1, st.vars.y1, 130, { baseDmg: 200, dmgKind: 'energy', affinity: [1.2, 1.35] }, { edgeMult: 0.6 });
      api.emitImpact(st.vars.x1, st.vars.y1);
    },
    passive: {
      onKill(hero, api, ps) {
        const now = api.tickNo;
        if ((ps.vars.until ?? 0) < now) ps.vars.n = 0;
        ps.vars.n = Math.min(5, (ps.vars.n ?? 0) + 1);
        ps.vars.until = now + 180;
        ps.stacks = ps.vars.n;
        api.addBuff({ dmgMult: 1 + 0.04 * ps.vars.n }, 6000, 'hungering_void');
        api.emitPassive(hero.x, hero.y);
      },
    },
  },

  // ── Blizzard Carbine · Whiteout (aura quanh người chơi) ──────────────────
  blizzard_carbine: {
    cast(hero, api, st) {
      api.addBuff({ fireRateMult: 1.3 }, st.durationMs, 'whiteout');
      api.emitCast(hero.x, hero.y);
      return true;
    },
    step(hero, api, st) {
      if (st.tick % 10 !== 0) return true;
      api.damageCircle(hero.x, hero.y, 220, {
        baseDmg: 20,
        dmgKind: 'energy',
        affinity: [1.05, 1.2],
        slowPct: 0.5,
        slowMs: 1000,
      });
      return true;
    },
    end(hero, api) {
      api.emitEnd(hero.x, hero.y);
    },
    passive: {
      onHit(hero, api, ps, target) {
        const id = Number(target.numId ?? target.id) || 0;
        if (ps.vars.last === id) ps.vars.n = (ps.vars.n ?? 0) + 1;
        else {
          ps.vars.last = id;
          ps.vars.n = 1;
        }
        ps.stacks = ps.vars.n;
        if (ps.vars.n >= 5) {
          ps.vars.n = 0;
          ps.stacks = 0;
          const pct = target.tier === 'boss' ? 0.25 : 0.6;
          target.slowPct = Math.max(target.slowPct ?? 0, pct);
          target.slowMs = Math.max(target.slowMs ?? 0, 1200);
          const p = targetPos(target, hero.x, hero.y);
          api.emitPassive(p.x, p.y);
        }
      },
    },
  },

  // ── Magma Spitter · Lava Flood (3 vũng dung nham) ────────────────────────
  magma_spitter: {
    cast(hero, api, st) {
      const reach = api.raycastWall(hero.x, hero.y, st.aim, 380);
      const dists = [130, 250, 370];
      for (let i = 0; i < 3; i++) {
        const d = Math.min(dists[i], reach);
        st.vars['x' + i] = hero.x + Math.cos(st.aim) * d;
        st.vars['y' + i] = hero.y + Math.sin(st.aim) * d;
        api.emitBlast(BANSUNG_FX_BLAST_STEAM, st.vars['x' + i], st.vars['y' + i], 80);
      }
      api.emitCast(st.vars.x1, st.vars.y1);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % 10 !== 0) return true;
      const ex = new Set<number>();
      for (let i = 0; i < 3; i++) {
        api.damageCircle(st.vars['x' + i], st.vars['y' + i], 80, {
          baseDmg: 22,
          dmgKind: 'fire',
          affinity: [1.0, 1.2],
          dotKind: 'burn',
          slowPct: 0.2,
          slowMs: 400,
        }, { exclude: ex });
      }
      return true;
    },
    end(_hero, api, st) {
      api.emitEnd(st.vars.x1, st.vars.y1);
    },
    passive: {
      onShot(hero, api, ps) {
        ps.vars.shots = (ps.vars.shots ?? 0) + 1;
        ps.stacks = ps.vars.shots;
        if (ps.vars.shots < 8) return;
        ps.vars.shots = 0;
        ps.stacks = 0;
        const t = api.nearestEnemy(hero.x, hero.y, 600);
        if (!t) return;
        api.damageCircle(t.x, t.y, 60, { baseDmg: 30, dmgKind: 'fire', dotKind: 'burn' }, { maxTargets: 5 });
        api.emitBlast(BANSUNG_FX_BLAST_FIREBALL, t.x, t.y, 60);
        api.emitPassive(t.x, t.y);
      },
    },
  },

  // ── Chronos Rifle · Chrono Field (zone làm chậm + buff người chơi) ───────
  chronos_rifle: {
    cast(hero, api, st) {
      const c = clampCursor(hero, st, 780);
      st.vars.cx = c.x;
      st.vars.cy = c.y;
      api.addBuff({ fireRateMult: 1.25, critChanceAdd: 0.15 }, st.durationMs, 'chrono_field');
      api.emitCast(c.x, c.y);
      return true;
    },
    step(_hero, api, st) {
      if (st.tick % 5 === 0) {
        const list = api.queryEnemies(st.vars.cx, st.vars.cy, 220);
        for (let i = 0; i < list.length; i++) {
          const t = list[i].target;
          const pct = list[i].isBoss ? 0.3 : 0.7;
          t.slowPct = Math.max(t.slowPct ?? 0, pct);
          t.slowMs = Math.max(t.slowMs ?? 0, 400);
        }
      }
      if (st.tick % 15 === 0) {
        api.damageCircle(st.vars.cx, st.vars.cy, 220, { baseDmg: 15, dmgKind: 'energy', affinity: [1.05, 1.35] });
      }
      return true;
    },
    end(_hero, api, st) {
      api.emitEnd(st.vars.cx, st.vars.cy);
    },
    passive: {
      onHit(hero, api, ps, _target, res) {
        if (!res.isCrit) return;
        if ((ps.vars.cd ?? 0) > api.tickNo) return;
        ps.vars.cd = api.tickNo + 3; // tối đa ~10 năng lượng / giây
        if (api.grantEnergy(1) > 0) api.emitPassive(hero.x, hero.y);
      },
    },
  },
};
