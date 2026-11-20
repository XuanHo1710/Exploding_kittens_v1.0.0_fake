/**
 * Smart AI COM Companion Controller (`server/src/game/mk/bot.ts`).
 *
 * Uses 3-hit combos, all 4 Active Skills, Awakening Ultimate at 100 Fury,
 * auto-dashes away from Boss red telegraph zones, and prioritizes reviving downed allies.
 */
import { MK_FURY_MAX, MK_HEROES } from '../../../../shared/src';
import { performBasicAttack, startGuardParry } from './combat';
import { executeHeroSkill, executeHeroUltimate } from './skills';
import { applyUpgradeCommand, type MkFighterSim, type MkSimContext } from './upgrades';

export function stepComBot(
  fighter: MkFighterSim,
  dtMs: number,
  ctx: MkSimContext,
  tryDash: (f: MkFighterSim, mx: number, my: number) => void,
): void {
  if (fighter.downed || fighter.left) return;

  // Auto-spend gold on unlocking skills 2..4 & upgrading stats
  if (fighter.gold >= 95 || fighter.sp > 0) {
    const order = ['s2', 's3', 's4', 's1', 'atk', 'hp', 'def', 'p1', 'p2'] as const;
    for (const target of order) {
      if (applyUpgradeCommand(fighter, target, ctx).ok) break;
    }
  }

  // 1. Dodge away from any active Boss/Bomber telegraph circle!
  for (const e of ctx.enemies) {
    if (e.telegraphMs > 0 && e.telegraphX !== undefined && e.telegraphY !== undefined) {
      const r = (e.telegraphR ?? 58) + 12;
      const dx = fighter.x - e.telegraphX;
      const dy = fighter.y - e.telegraphY;
      const d = Math.hypot(dx, dy);
      if (d <= r) {
        const mx = dx >= 0 ? 1 : -1;
        const my = dy >= 0 ? 0.6 : -0.6;
        if (fighter.dashCdMs <= 0) {
          tryDash(fighter, mx, my);
        } else if (fighter.guardCdMs <= 0 && e.telegraphMs <= 220) {
          startGuardParry(fighter, ctx);
        }
        fighter.inputMx = mx;
        fighter.inputMy = my;
        return;
      }
    }
  }

  // 2. Prioritize reviving nearest downed ally
  const downedAlly = ctx.fighters.find((a) => a.id !== fighter.id && a.downed && !a.left);
  if (downedAlly) {
    const dx = downedAlly.x - fighter.x;
    const dy = downedAlly.y - fighter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 24) {
      fighter.inputMx = dx / dist;
      fighter.inputMy = dy / dist;
      fighter.dir = dx >= 0 ? 1 : -1;
      return;
    }
    fighter.inputMx = 0;
    fighter.inputMy = 0;
    return;
  }

  // 3. Find nearest enemy
  let target = null as (typeof ctx.enemies)[number] | null;
  let bestDist = Infinity;
  for (const e of ctx.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - fighter.x, e.y - fighter.y);
    if (d < bestDist) {
      bestDist = d;
      target = e;
    }
  }

  if (!target) {
    // Regroup gently near human leader
    const leader = ctx.fighters.find((f) => !f.downed && !f.left && Boolean(f.ownerId));
    if (leader && Math.hypot(leader.x - fighter.x, leader.y - fighter.y) > 90) {
      const dx = leader.x - fighter.x;
      const dy = leader.y - fighter.y;
      const d = Math.hypot(dx, dy);
      fighter.inputMx = (dx / d) * 0.7;
      fighter.inputMy = (dy / d) * 0.7;
    } else {
      fighter.inputMx = 0;
      fighter.inputMy = 0;
    }
    return;
  }

  const dx = target.x - fighter.x;
  const dy = target.y - fighter.y;
  fighter.dir = dx >= 0 ? 1 : -1;

  const spec = MK_HEROES[fighter.heroId];
  const isRanged = fighter.heroId === 'archer' || fighter.heroId === 'mage';
  const desiredRange = isRanged ? Math.min(200, spec.attackRange * 0.72) : spec.attackRange - 6;

  // 4. Cast Ultimate when Fury is 100 and enemies are near
  if (fighter.fury >= MK_FURY_MAX && bestDist <= 220) {
    if (executeHeroUltimate(fighter, ctx)) {
      fighter.inputMx = 0;
      fighter.inputMy = 0;
      return;
    }
  }

  // 5. Cast available active skills (4 -> 3 -> 2 -> 1)
  if (bestDist <= (isRanged ? 240 : 125)) {
    for (const slot of [4, 3, 2, 1] as const) {
      if (executeHeroSkill(fighter, slot, ctx)) {
        fighter.inputMx = 0;
        fighter.inputMy = 0;
        return;
      }
    }
  }

  // 6. Position & 3-hit combo attack
  if (bestDist > desiredRange || Math.abs(dy) > (isRanged ? 54 : 26)) {
    const norm = Math.max(1, bestDist);
    fighter.inputMx = dx / norm;
    fighter.inputMy = dy / norm;
  } else if (isRanged && bestDist < 75) {
    fighter.inputMx = -fighter.dir;
    fighter.inputMy = dy > 0 ? -0.4 : 0.4;
  } else {
    fighter.inputMx = 0;
    fighter.inputMy = 0;
    performBasicAttack(fighter, ctx);
  }
  void dtMs;
}
