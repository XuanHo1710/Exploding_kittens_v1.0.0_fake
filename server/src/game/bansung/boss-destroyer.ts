/**
 * Boss 6: Trùm Hủy Diệt (`boss_destroyer`) — 10x multi-bar endgame titan.
 *
 * Designed around breaking its 4 armored components (`left_cannon`, `right_launcher`,
 * `rear_thruster`, `omega_core`) to stun the boss and unlock its enraged arsenal:
 *  - `doomsday_barrage` (rapid missile/plasma barrage)
 *  - `laser_cross` (4-way X-Cross annihilation lasers)
 *  - `meteor_apocalypse` (burning meteor showers across arena)
 *  - `blackhole_collapse` (singularity pull + collapse burst)
 */
import {
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BLAST_DESTROYER_METEOR,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BOSS_DESTROYER_CFG,
  FX_BEAM,
  FX_BLAST,
  getBossHpBars,
  type BansungBossFrame,
  type BansungEnemyId,
  type BansungTelegraph,
  type BansungUnitState,
} from '../../../../shared/src';
import { applyBansungDamage, type BansungCombatTarget, type BansungDamageContext } from './damage';
import {
  emitClusterSplitOrb,
  emitNierAlternatingCurtain,
  type BossDanmakuSpawnInput,
  type DanmakuMotionSpec,
} from './danmaku';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type DestroyerBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'meteor_windup'
  | 'laser_telegraph'
  | 'laser_fire'
  | 'ring_windup'
  | 'ring_fire'
  | 'blackhole_pull'
  | 'doomsday_barrage'
  | 'summon'
  | 'dead';

export interface DestroyerMeteorHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
  label: string;
}

export interface DestroyerBlackholeHazard {
  id: number;
  x: number;
  y: number;
  pullR: number;
  burstR: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
}

export interface DestroyerPlayerTarget extends BansungCombatTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  alive: boolean;
  downed?: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
}

export interface DestroyerBulletSpawn {
  kind: 'plasma' | 'zap';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  dmgKind: 'energy' | 'explosive';
  ttlTicks: number;
  ownerId: number;
  danmaku?: DanmakuMotionSpec;
}

export interface DestroyerBossState {
  id: number;
  idStr: string;
  numId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  armor: number;
  phase: 1 | 2;
  alive: boolean;
  aimRad: number;
  state: DestroyerBossFSMState;
  stateTick: number;
  stunTicks: number;
  patternIdx: number;
  actionCdTicks: number;
  summonCdTicks: number;
  ringWave: number;
  ringBaseAng: number;
  laserAngles: number[];
  laserSpinDir?: 1 | -1;
  laserFiredDamage: boolean;
  unlockedSkills: Set<string>;
  unlockedSkillList: string[];
  queuedEnragedSkills: string[];
  seq: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  meteors: DestroyerMeteorHazard[];
  blackholes: DestroyerBlackholeHazard[];
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface DestroyerStepContext {
  tickNo: number;
  players: readonly DestroyerPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSpawnBullet: (b: DestroyerBulletSpawn) => void;
  onSummon: (kinds: readonly BansungEnemyId[], cx: number, cy: number) => void;
  onPullPlayer?: (playerId: string, dx: number, dy: number) => void;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

const GAP_SECTOR_SET = new Set<number>(BOSS_DESTROYER_CFG.ringGapSectors);
const TWO_PI = Math.PI * 2;
const AIM_QUANT_MAX = 255;

function quantizeAim8(rad: number): number {
  let n = rad % TWO_PI;
  if (n < 0) n += TWO_PI;
  return clamp(Math.round((n / TWO_PI) * AIM_QUANT_MAX), 0, AIM_QUANT_MAX);
}

function distSqPointSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) {
    const dx = px - x1;
    const dy = py - y1;
    return dx * dx + dy * dy;
  }
  const t = clamp(((px - x1) * vx + (py - y1) * vy) / lenSq, 0, 1);
  const cx = x1 + vx * t;
  const cy = y1 + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function nextId(boss: DestroyerBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function findNearestAlivePlayer(
  boss: DestroyerBossState,
  players: readonly DestroyerPlayerTarget[],
): DestroyerPlayerTarget | undefined {
  let best: DestroyerPlayerTarget | undefined;
  let bestD2 = Infinity;
  for (const p of players) {
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const dx = p.x - boss.x;
    const dy = p.y - boss.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

export function createDestroyerBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  radiusScale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
}): DestroyerBossState {
  const spec = BANSUNG_ENEMIES.boss_destroyer;
  const maxHp = Math.max(1200, Math.round(BOSS_DESTROYER_CFG.baseHp * (opts.hpMult ?? 1)));
  const scaledRadius = Math.max(24, Math.round(BOSS_DESTROYER_CFG.radius * clamp(opts.radiusScale ?? 1, 0.45, 2.0)));
  const idStr = `boss_destroyer_${opts.id}`;
  const combatTarget: BansungCombatTarget = {
    id: idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: BOSS_DESTROYER_CFG.armor,
    damageReduction: BOSS_DESTROYER_CFG.baseDr,
    alive: true,
    hp: maxHp,
    maxHp,
    shield: 0,
    maxShield: 0,
  };
  return {
    id: opts.id,
    idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    vx: 0,
    vy: 0,
    radius: scaledRadius,
    hp: maxHp,
    maxHp,
    armor: BOSS_DESTROYER_CFG.armor,
    phase: 1,
    alive: true,
    aimRad: 0,
    state: 'patrol',
    stateTick: 0,
    stunTicks: 0,
    patternIdx: 0,
    actionCdTicks: 24,
    summonCdTicks: 145,
    ringWave: 0,
    ringBaseAng: 0,
    laserAngles: [0, Math.PI * 0.5],
    laserFiredDamage: false,
    unlockedSkills: new Set<string>(),
    unlockedSkillList: [],
    queuedEnragedSkills: [],
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    meteors: [],
    blackholes: [],
    telegraphs: [],
    combatTarget,
  };
}

export function stunDestroyerBoss(boss: DestroyerBossState, durationMs: number, unlockedSkill?: string): void {
  if (!boss.alive) return;
  const ticks = Math.max(20, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
  boss.stunTicks = Math.max(boss.stunTicks, ticks);
  boss.combatTarget.stunMs = Math.max(boss.combatTarget.stunMs ?? 0, durationMs);
  boss.combatTarget.damageReduction = 0;
  boss.combatTarget.flatArmor = Math.round(boss.armor * 0.4);
  boss.state = 'stunned';
  boss.stateTick = 0;
  boss.laserFiredDamage = false;
  boss.vx = 0;
  boss.vy = 0;
  if (unlockedSkill) {
    if (!boss.unlockedSkills.has(unlockedSkill)) {
      boss.unlockedSkills.add(unlockedSkill);
      boss.unlockedSkillList.push(unlockedSkill);
    }
    boss.queuedEnragedSkills.push(unlockedSkill);
  }
}

function explodeDestroyerCircle(
  boss: DestroyerBossState,
  x: number,
  y: number,
  r: number,
  dmg: number,
  blastKind: number,
  ctx: DestroyerStepContext,
): void {
  ctx.fx?.push(FX_BLAST, blastKind, Math.round(x), Math.round(y), Math.round(r), boss.id);
  ctx.onSfx?.('sfx_explode_cluster', x, y);
  for (const p of ctx.players) {
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const pr = r + (p.radius ?? 13);
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= pr * pr) {
      applyBansungDamage(
        p,
        {
          baseDmg: Math.round(dmg * ctx.dmgMult),
          dmgKind: 'explosive',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
    }
  }
}

function enterDestroyerSkill(boss: DestroyerBossState, skillId: string, target: DestroyerPlayerTarget | undefined): void {
  const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
  if (skillId === 'doomsday_barrage') {
    boss.state = 'doomsday_barrage';
    boss.stateTick = 0;
    boss.ringWave = 0;
    return;
  }
  if (skillId === 'laser_cross') {
    boss.state = 'laser_telegraph';
    boss.stateTick = 0;
    boss.laserFiredDamage = false;
    boss.laserSpinDir = boss.laserSpinDir === 1 ? -1 : 1;
    boss.laserAngles = [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5];
    return;
  }
  if (skillId === 'meteor_apocalypse') {
    boss.state = 'meteor_windup';
    boss.stateTick = 0;
    return;
  }
  if (skillId === 'blackhole_collapse') {
    boss.state = 'blackhole_pull';
    boss.stateTick = 0;
    return;
  }
  boss.state = 'meteor_windup';
  boss.stateTick = 0;
}

function emitDestroyerDanmaku(
  boss: DestroyerBossState,
  ctx: DestroyerStepContext,
  b: BossDanmakuSpawnInput,
): void {
  ctx.onSpawnBullet({
    kind: b.danmakuKind === 'danmaku_lance' ? 'zap' : 'plasma',
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    r: b.radius,
    dmg: b.damage,
    dmgKind: b.dmgKind === 'explosive' ? 'explosive' : 'energy',
    ttlTicks: b.ttlTicks,
    ownerId: boss.id,
    danmaku: b,
  });
}

export function stepDestroyerBoss(boss: DestroyerBossState, ctx: DestroyerStepContext): void {
  if (boss.combatTarget.hp < boss.hp) {
    boss.hp = Math.max(0, boss.combatTarget.hp);
  }
  if (!boss.alive || boss.hp <= 0 || !boss.combatTarget.alive) {
    boss.alive = false;
    boss.hp = 0;
    boss.state = 'dead';
    boss.telegraphs = [];
    return;
  }
  boss.combatTarget.x = boss.x;
  boss.combatTarget.y = boss.y;
  boss.combatTarget.hp = boss.hp;
  boss.combatTarget.maxHp = boss.maxHp;

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_DESTROYER_CFG.phase2Ratio) {
    boss.phase = 2;
  }

  for (let i = boss.meteors.length - 1; i >= 0; i--) {
    const m = boss.meteors[i];
    m.ticksLeft -= 1;
    if (m.ticksLeft <= 0) {
      explodeDestroyerCircle(boss, m.x, m.y, m.r, m.dmg, BANSUNG_FX_BLAST_DESTROYER_METEOR, ctx);
      boss.meteors.splice(i, 1);
    }
  }

  for (let i = boss.blackholes.length - 1; i >= 0; i--) {
    const bh = boss.blackholes[i];
    bh.ticksLeft -= 1;
    for (const p of ctx.players) {
      if (!p.alive || p.downed || p.hp <= 0) continue;
      const dx = bh.x - p.x;
      const dy = bh.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 14 && dist <= bh.pullR) {
        const pullStep = (BOSS_DESTROYER_CFG.blackholePullForce / BANSUNG_TICK_HZ) * (1 - dist / (bh.pullR * 1.25));
        const swirlStep = pullStep * 0.58;
        const pdx = (dx / dist) * pullStep + (-dy / dist) * swirlStep;
        const pdy = (dy / dist) * pullStep + (dx / dist) * swirlStep;
        if (ctx.onPullPlayer) {
          ctx.onPullPlayer(p.id, pdx, pdy);
        }
      }
    }
    if (bh.ticksLeft <= 0) {
      explodeDestroyerCircle(boss, bh.x, bh.y, bh.burstR, bh.dmg, BANSUNG_FX_BLAST_HE, ctx);
      const shardDmg = Math.max(1, Math.round(BOSS_DESTROYER_CFG.ringDmg * 0.9 * ctx.dmgMult));
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * TWO_PI;
        emitDestroyerDanmaku(boss, ctx, {
          danmakuKind: 'danmaku_crescent',
          palette: k % 2 === 0 ? BANSUNG_DANMAKU_PALETTE.VIOLET : BANSUNG_DANMAKU_PALETTE.CRIMSON,
          scaleTier: 1,
          x: bh.x + Math.cos(ang) * 18,
          y: bh.y + Math.sin(ang) * 18,
          vx: Math.cos(ang) * 265,
          vy: Math.sin(ang) * 265,
          radius: 7,
          damage: shardDmg,
          dmgKind: 'energy',
          ttlTicks: 76,
          angVel: k % 2 === 0 ? 0.85 : -0.85,
        });
      }
      boss.blackholes.splice(i, 1);
    }
  }

  const target = findNearestAlivePlayer(boss, ctx.players);

  if (boss.stunTicks > 0 || boss.state === 'stunned') {
    boss.stunTicks = Math.max(0, boss.stunTicks - 1);
    boss.vx = 0;
    boss.vy = 0;
    boss.stateTick += 1;
    if (boss.stunTicks <= 0) {
      boss.combatTarget.stunMs = 0;
      boss.combatTarget.damageReduction = BOSS_DESTROYER_CFG.baseDr;
      boss.combatTarget.flatArmor = boss.armor;
      const queued = boss.queuedEnragedSkills.shift();
      if (queued) {
        enterDestroyerSkill(boss, queued, target);
      } else {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 12;
      }
    }
    rebuildDestroyerTelegraphs(boss);
    return;
  }

  if (target && boss.state === 'patrol') {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    boss.aimRad = Math.atan2(dy, dx);
    const speed = boss.phase === 2 ? BOSS_DESTROYER_CFG.speedP2 : BOSS_DESTROYER_CFG.speedP1;
    const desiredMove = dist > 280 ? 1 : dist < 160 ? -0.5 : 0.25;
    const nx = dist > 1e-3 ? dx / dist : 1;
    const ny = dist > 1e-3 ? dy / dist : 0;
    const strafe = Math.cos(ctx.tickNo * 0.045) * 0.65;
    boss.vx = (nx * desiredMove - ny * strafe) * speed;
    boss.vy = (ny * desiredMove + nx * strafe) * speed;
    boss.x = clamp(
      boss.x + boss.vx / BANSUNG_TICK_HZ,
      boss.arenaBounds.minX + boss.radius + 16,
      boss.arenaBounds.maxX - boss.radius - 16,
    );
    boss.y = clamp(
      boss.y + boss.vy / BANSUNG_TICK_HZ,
      boss.arenaBounds.minY + boss.radius + 16,
      boss.arenaBounds.maxY - boss.radius - 16,
    );
  } else {
    boss.vx = 0;
    boss.vy = 0;
  }

  if (boss.summonCdTicks > 0) boss.summonCdTicks -= 1;
  boss.stateTick += 1;

  switch (boss.state) {
    case 'patrol': {
      if (boss.queuedEnragedSkills.length > 0) {
        const queued = boss.queuedEnragedSkills.shift()!;
        enterDestroyerSkill(boss, queued, target);
        break;
      }
      if (boss.actionCdTicks > 0) {
        boss.actionCdTicks -= 1;
        break;
      }
      if (boss.summonCdTicks <= 0) {
        boss.state = 'summon';
        boss.stateTick = 0;
        break;
      }
      const nextPattern = boss.patternIdx % 4;
      boss.patternIdx += 1;
      if (nextPattern === 0) {
        boss.state = 'meteor_windup';
      } else if (nextPattern === 1) {
        boss.state = 'laser_telegraph';
        boss.laserFiredDamage = false;
        boss.laserSpinDir = boss.laserSpinDir === 1 ? -1 : 1;
        const base = boss.aimRad;
        boss.laserAngles =
          boss.unlockedSkills.has('laser_cross') || boss.phase === 2
            ? [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5]
            : [base - 0.42, base + 0.42];
      } else if (nextPattern === 2) {
        boss.state = boss.unlockedSkills.has('doomsday_barrage') ? 'doomsday_barrage' : 'ring_windup';
        boss.ringWave = 0;
        boss.ringBaseAng = boss.aimRad;
      } else {
        boss.state = 'blackhole_pull';
      }
      boss.stateTick = 0;
      break;
    }

    case 'meteor_windup': {
      const hasApoc = boss.unlockedSkills.has('meteor_apocalypse');
      const count = BOSS_DESTROYER_CFG.meteorCount + (boss.phase === 2 ? 2 : 0) + (hasApoc ? 3 : 0);
      if (boss.stateTick >= 6 && boss.stateTick % 5 === 1 && boss.meteors.length < count) {
        const idx = boss.meteors.length;
        const alivePlayers = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
        const pick = alivePlayers.length > 0 ? alivePlayers[idx % alivePlayers.length] : target;
        const px = pick ? pick.x : boss.x + 210;
        const py = pick ? pick.y : boss.y;
        const ringCount = Math.max(1, count - 1);
        const ringR = Math.max(166, BOSS_DESTROYER_CFG.meteorRadius * 2.42);
        const ang = boss.aimRad + ((idx - 1) / ringCount) * TWO_PI;
        const dist = idx === 0 ? 0 : ringR;
        boss.meteors.push({
          id: nextId(boss),
          x: clamp(px + Math.cos(ang) * dist, boss.arenaBounds.minX + 75, boss.arenaBounds.maxX - 75),
          y: clamp(py + Math.sin(ang) * dist, boss.arenaBounds.minY + 75, boss.arenaBounds.maxY - 75),
          r: BOSS_DESTROYER_CFG.meteorRadius,
          ticksLeft: BOSS_DESTROYER_CFG.meteorWarningTicks,
          maxTicks: BOSS_DESTROYER_CFG.meteorWarningTicks,
          dmg: BOSS_DESTROYER_CFG.meteorDmg,
          label: '',
        });
        ctx.onSfx?.('sfx_bazooka_fire', boss.x, boss.y);
      }
      if (boss.stateTick >= 6 + count * 5 + 10) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 32;
      }
      break;
    }

    case 'laser_telegraph': {
      if (boss.stateTick <= 12 && target) {
        const base = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.aimRad = base;
        boss.laserAngles =
          boss.unlockedSkills.has('laser_cross') || boss.phase === 2
            ? [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5]
            : [base - 0.42, base + 0.42];
      }
      if (boss.stateTick >= BOSS_DESTROYER_CFG.laserCrossTelegraphTicks) {
        boss.state = 'laser_fire';
        boss.stateTick = 0;
        boss.laserFiredDamage = false;
      }
      break;
    }

    case 'laser_fire': {
      // Enter the Gungeon Lich 4-Spoke Accelerating + Mid-Cast Reversing Annihilation Wheel
      const spinDir = boss.laserSpinDir ?? 1;
      const fireDur = 48;
      if (boss.stateTick === 1) {
        boss.laserFiredDamage = true;
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
      }
      let angStep = 0;
      if (boss.stateTick <= 22) {
        angStep = spinDir * (0.012 + (boss.stateTick / 22) * 0.021);
      } else if (boss.stateTick >= 28) {
        angStep = -spinDir * 0.027;
      } else if (boss.stateTick === 24) {
        // Reversal warning shockwave: 12-way star burst
        ctx.onSfx?.('sfx_wpn_void_cannon', boss.x, boss.y);
        const starDmg = Math.max(1, Math.round(BOSS_DESTROYER_CFG.ringDmg * 0.85 * ctx.dmgMult));
        for (let k = 0; k < 12; k++) {
          const sa = boss.laserAngles[0] + (k / 12) * TWO_PI;
          emitDestroyerDanmaku(boss, ctx, {
            danmakuKind: 'danmaku_star',
            palette: k % 2 === 0 ? BANSUNG_DANMAKU_PALETTE.CRIMSON : BANSUNG_DANMAKU_PALETTE.VIOLET,
            scaleTier: 0,
            x: boss.x + Math.cos(sa) * (boss.radius + 10),
            y: boss.y + Math.sin(sa) * (boss.radius + 10),
            vx: Math.cos(sa) * 260,
            vy: Math.sin(sa) * 260,
            radius: 6,
            damage: starDmg,
            dmgKind: 'energy',
            ttlTicks: 58,
          });
        }
      }
      for (let i = 0; i < boss.laserAngles.length; i++) {
        boss.laserAngles[i] += angStep;
      }

      const emitFx = boss.stateTick === 1 || boss.stateTick % 2 === 0;
      const dealTickDmg = boss.stateTick === 1 || boss.stateTick % 5 === 0;
      const tickDmg = Math.max(1, Math.round(BOSS_DESTROYER_CFG.laserCrossDmg * 0.34 * ctx.dmgMult));
      for (const ang of boss.laserAngles) {
        const x2 = boss.x + Math.cos(ang) * BOSS_DESTROYER_CFG.laserCrossLength;
        const y2 = boss.y + Math.sin(ang) * BOSS_DESTROYER_CFG.laserCrossLength;
        if (emitFx) {
          ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), BANSUNG_FX_BEAM_LASER_MAP);
        }
        if (dealTickDmg) {
          for (const p of ctx.players) {
            if (!p.alive || p.downed || p.hp <= 0) continue;
            const hitR = BOSS_DESTROYER_CFG.laserCrossHalfW + (p.radius ?? 13);
            if (distSqPointSegment(p.x, p.y, boss.x, boss.y, x2, y2) <= hitR * hitR) {
              applyBansungDamage(
                p,
                {
                  baseDmg: tickDmg,
                  dmgKind: 'energy',
                  attackerId: boss.idStr,
                },
                ctx.damageCtx,
              );
            }
          }
        }
      }
      if (boss.stateTick >= fireDur) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 32;
      }
      break;
    }

    case 'ring_windup': {
      if (boss.stateTick >= 10) {
        boss.state = 'ring_fire';
        boss.stateTick = 0;
      }
      break;
    }

    case 'ring_fire':
    case 'doomsday_barrage': {
      const isDoom = boss.state === 'doomsday_barrage';
      const maxWaves = (boss.phase === 2 ? 3 : 2) + (isDoom ? 1 : 0);
      if (boss.stateTick === 1 || (boss.stateTick % 12 === 1 && boss.ringWave < maxWaves)) {
        const baseDmg = Math.max(
          1,
          Math.round((isDoom ? BOSS_DESTROYER_CFG.ringDmg * 1.12 : BOSS_DESTROYER_CFG.ringDmg) * ctx.dmgMult),
        );
        emitNierAlternatingCurtain((b) => emitDestroyerDanmaku(boss, ctx, b), {
          x: boss.x,
          y: boss.y,
          arms: isDoom ? 12 : 10,
          rotRad: boss.ringBaseAng + boss.ringWave * 0.27,
          ringSpeed: BOSS_DESTROYER_CFG.ringSpeed * 0.78,
          lanceSpeed: BOSS_DESTROYER_CFG.ringSpeed * 1.24,
          angVel: boss.ringWave % 2 === 0 ? 0.46 : -0.46,
          damage: baseDmg,
          ringPalette: BANSUNG_DANMAKU_PALETTE.CRIMSON,
          lancePalette: isDoom ? BANSUNG_DANMAKU_PALETTE.VIOLET : BANSUNG_DANMAKU_PALETTE.GOLD,
        });

        if (boss.ringWave === 0 || (isDoom && boss.ringWave === 2)) {
          const orbCount = isDoom ? 4 : 3;
          const aimBase = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
          for (let k = 0; k < orbCount; k++) {
            const oa = aimBase + (k / orbCount) * TWO_PI;
            emitClusterSplitOrb((b) => emitDestroyerDanmaku(boss, ctx, b), {
              x: boss.x,
              y: boss.y,
              aimRad: oa,
              speed: 205,
              splitAfterTicks: 22,
              splitMode: 'rose_flower',
              splitCount: 10,
              splitSpeed: 295,
              damage: baseDmg,
              dmgKind: 'explosive',
              parentPalette: BANSUNG_DANMAKU_PALETTE.VIOLET,
              childKind: 'danmaku_star',
              childPalette: BANSUNG_DANMAKU_PALETTE.CRIMSON,
            });
          }
        }
        ctx.onSfx?.('sfx_wpn_void_cannon', boss.x, boss.y);
        boss.ringWave += 1;
      }
      if (boss.ringWave >= maxWaves && boss.stateTick >= maxWaves * 12 + 8) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 24 : 34;
      }
      break;
    }

    case 'blackhole_pull': {
      if (boss.stateTick === 6) {
        const px = target ? target.x : boss.x + 170;
        const py = target ? target.y : boss.y;
        const cx = clamp((boss.x + px) * 0.5, boss.arenaBounds.minX + 120, boss.arenaBounds.maxX - 120);
        const cy = clamp((boss.y + py) * 0.5, boss.arenaBounds.minY + 120, boss.arenaBounds.maxY - 120);
        boss.blackholes.push({
          id: nextId(boss),
          x: cx,
          y: cy,
          pullR: BOSS_DESTROYER_CFG.blackholePullRadius,
          burstR: BOSS_DESTROYER_CFG.blackholeRadius,
          ticksLeft: 52,
          maxTicks: 52,
          dmg: BOSS_DESTROYER_CFG.blackholeBurstDmg,
        });
        ctx.onSfx?.('sfx_wpn_gravity', boss.x, boss.y);
      }
      if (boss.stateTick >= 28) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 28;
      }
      break;
    }

    case 'summon': {
      if (boss.stateTick === 12) {
        const kinds: BansungEnemyId[] =
          boss.phase === 2
            ? ['plasma_golem', 'chrono_mage', 'sniper_mech', 'void_reaper']
            : ['plasma_golem', 'chrono_mage', 'crimson_lancer'];
        ctx.onSummon(kinds, boss.x, boss.y);
        boss.summonCdTicks = BOSS_DESTROYER_CFG.summonCooldownTicks;
      }
      if (boss.stateTick >= 24) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 26;
      }
      break;
    }

    default:
      break;
  }

  rebuildDestroyerTelegraphs(boss);
}

function rebuildDestroyerTelegraphs(boss: DestroyerBossState): void {
  const outTel: BansungTelegraph[] = [];
  for (const m of boss.meteors) {
    const prog = clamp(Math.round(((m.maxTicks - m.ticksLeft) / Math.max(1, m.maxTicks)) * 255), 0, 255);
    outTel.push({
      id: m.id,
      kind: 1,
      shape: 'circle',
      phase: m.ticksLeft <= 14 ? 1 : 0,
      color: 0,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(m.x),
      y1: Math.round(m.y),
      r: m.r,
      danger: 1,
      sourceKind: 'boss_destroyer',
    });
  }
  for (const bh of boss.blackholes) {
    const prog = clamp(Math.round(((bh.maxTicks - bh.ticksLeft) / Math.max(1, bh.maxTicks)) * 255), 0, 255);
    outTel.push({
      id: bh.id,
      kind: 1,
      shape: 'circle',
      phase: bh.ticksLeft <= 15 ? 1 : 0,
      color: 3,
      prog,
      x0: Math.round(bh.x),
      y0: Math.round(bh.y),
      x1: Math.round(bh.x),
      y1: Math.round(bh.y),
      r: bh.burstR,
      danger: 1,
      sourceKind: 'boss_destroyer',
    });
  }
  if (boss.state === 'laser_telegraph' || boss.state === 'laser_fire') {
    const active = boss.state === 'laser_fire';
    const prog = active
      ? boss.stateTick > 42
        ? clamp(Math.round(((48 - boss.stateTick) / 6) * 255), 45, 255)
        : 255
      : clamp(Math.round((boss.stateTick / Math.max(1, BOSS_DESTROYER_CFG.laserCrossTelegraphTicks)) * 255), 0, 255);
    boss.laserAngles.forEach((ang, idx) => {
      const x2 = boss.x + Math.cos(ang) * BOSS_DESTROYER_CFG.laserCrossLength;
      const y2 = boss.y + Math.sin(ang) * BOSS_DESTROYER_CFG.laserCrossLength;
      outTel.push({
        id: boss.id * 100 + 80 + idx,
        kind: 0,
        shape: 'line',
        phase: active || boss.stateTick > 18 ? 1 : 0,
        color: 0,
        prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(x2),
        y1: Math.round(y2),
        r: BOSS_DESTROYER_CFG.laserCrossHalfW,
        halfW: BOSS_DESTROYER_CFG.laserCrossHalfW,
        active,
        danger: 1,
        sourceKind: 'boss_destroyer',
      });
    });
  }
  boss.telegraphs = outTel;
}

export function toDestroyerBossFrame(boss: DestroyerBossState, mini = false): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive || boss.hp <= 0) state = BANSUNG_STATE_DEAD;
  else if (boss.stunTicks > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state === 'patrol') state = Math.hypot(boss.vx, boss.vy) > 4 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
  else state = BANSUNG_STATE_ATK;

  return {
    id: boss.id,
    kind: 'boss_destroyer',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    hpBars: getBossHpBars('boss_destroyer', mini),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph: boss.telegraphs.length > 0 ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100)) : 0,
    telegraphs: boss.telegraphs,
    unlockedSkills: boss.unlockedSkillList.length > 0 ? [...boss.unlockedSkillList] : undefined,
    title: 'Trùm Hủy Diệt Omega',
    subtitle: 'BOSS TỐI THƯỢNG · ×10 THANH MÁU · PHÁ 4 BỘ PHẬN ĐỂ CHOÁNG',
    tier: 4,
  };
}
