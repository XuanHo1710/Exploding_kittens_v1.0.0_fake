/**
 * Boss 1 — Arsenal Dread Gunner ("Boss Súng Hủy Diệt", spawns at 2:00).
 *
 * 30Hz authoritative FSM featuring 5 distinct, readable combat patterns:
 * 1. Frag Grenade Toss: 2.0s (60 ticks) countdown fuse with bomb timer telegraph.
 * 2. Red-Circle Missile Barrage: 4 staggered circles with explicit `DANGER` highlight.
 * 3. Red Aim-Line Laser Shot: tracks -> locks crimson aim line -> fires heavy laser beam.
 * 4. Gapped Bullet Curtain Ring: 360-degree gun ring deliberately leaving wide 54° safe corridors.
 * 5. Squad Summon: calls tactical escorts while regular wave spawns are paused.
 */
import {
  BOSS_ARSENAL_CFG,
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  FX_BEAM,
  FX_BLAST,
  type BansungBossFrame,
  type BansungEnemyId,
  type BansungTelegraph,
  type BansungUnitState,
} from '../../../../shared/src';
import { applyBansungDamage, type BansungCombatTarget, type BansungDamageContext } from './damage';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type ArsenalBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'grenade_windup'
  | 'missile_windup'
  | 'laser_telegraph'
  | 'laser_fire'
  | 'ring_windup'
  | 'ring_fire'
  | 'summon'
  | 'dead';

export interface ArsenalGrenadeHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
}

export interface ArsenalMissileHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
}

export interface ArsenalPlayerTarget extends BansungCombatTarget {
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

export interface ArsenalBulletSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  dmg: number;
  ttlTicks: number;
  kind: number;
}

export interface ArsenalBossState {
  id: number;
  idStr: string;
  kind: 'boss_arsenal';
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
  state: ArsenalBossFSMState;
  stateTick: number;
  stunTicks?: number;
  patternIdx: number;
  actionCdTicks: number;
  summonCdTicks: number;
  ringWave: number;
  ringBaseAng: number;
  laserX2: number;
  laserY2: number;
  laserFiredDamage: boolean;
  seq: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  grenades: ArsenalGrenadeHazard[];
  missiles: ArsenalMissileHazard[];
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface ArsenalStepContext {
  tickNo: number;
  players: readonly ArsenalPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSpawnBullet: (b: ArsenalBulletSpawn) => void;
  onSummon: (kinds: readonly BansungEnemyId[], cx: number, cy: number) => void;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

const GAP_SECTOR_SET = new Set<number>(BOSS_ARSENAL_CFG.ringGapSectors);
const TWO_PI = Math.PI * 2;
const AIM_QUANT_MAX = 255;

function quantizeAim8(rad: number): number {
  let n = rad % TWO_PI;
  if (n < 0) n += TWO_PI;
  return clamp(Math.round((n / TWO_PI) * AIM_QUANT_MAX), 0, AIM_QUANT_MAX);
}

function distSqPointSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
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

function nextId(boss: ArsenalBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function findNearestAlivePlayer(
  boss: ArsenalBossState,
  players: readonly ArsenalPlayerTarget[],
): ArsenalPlayerTarget | undefined {
  let best: ArsenalPlayerTarget | undefined;
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

export function createArsenalBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  scale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
}): ArsenalBossState {
  const spec = BANSUNG_ENEMIES.boss_arsenal;
  const scale = Math.max(0.45, Math.min(2.2, opts.scale ?? 1));
  const scaledRadius = Math.max(20, Math.round(spec.radius * scale));
  const maxHp = Math.max(400, Math.round(spec.hp * (opts.hpMult ?? 1)));
  const combatTarget: BansungCombatTarget = {
    id: `boss_${opts.id}`,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: spec.armor,
    damageReduction: BOSS_ARSENAL_CFG.baseDr,
    alive: true,
    hp: maxHp,
    maxHp,
    shield: 0,
    maxShield: 0,
  };
  return {
    id: opts.id,
    idStr: `boss_${opts.id}`,
    kind: 'boss_arsenal',
    x: opts.x,
    y: opts.y,
    vx: 0,
    vy: 0,
    radius: scaledRadius,
    hp: maxHp,
    maxHp,
    armor: spec.armor,
    phase: 1,
    alive: true,
    aimRad: 0,
    state: 'patrol',
    stateTick: 0,
    patternIdx: 0,
    actionCdTicks: 32,
    summonCdTicks: 165,
    ringWave: 0,
    ringBaseAng: 0,
    laserX2: opts.x + 600,
    laserY2: opts.y,
    laserFiredDamage: false,
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    grenades: [],
    missiles: [],
    telegraphs: [],
    combatTarget,
  };
}

function explodeCircleHazard(
  boss: ArsenalBossState,
  x: number,
  y: number,
  r: number,
  baseDmg: number,
  fxBlastKind: number,
  sfxKey: string,
  ctx: ArsenalStepContext,
): void {
  ctx.fx?.push(FX_BLAST, fxBlastKind, Math.round(x), Math.round(y), Math.round(r), boss.id);
  ctx.onSfx?.(sfxKey, x, y);
  const r2 = r * r;
  for (const p of ctx.players) {
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const pr = r + (p.radius ?? 13);
    if (dx * dx + dy * dy <= pr * pr) {
      applyBansungDamage(
        p,
        {
          baseDmg: Math.round(baseDmg * ctx.dmgMult),
          dmgKind: 'explosive',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
    }
  }
}

export function stunArsenalBoss(boss: ArsenalBossState, durationMs: number): void {
  if (!boss.alive) return;
  const ticks = Math.max(18, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
  boss.stunTicks = Math.max(boss.stunTicks ?? 0, ticks);
  boss.combatTarget.stunMs = Math.max(boss.combatTarget.stunMs ?? 0, durationMs);
  boss.combatTarget.damageReduction = 0;
  boss.combatTarget.flatArmor = Math.round(boss.armor * 0.4);
  boss.state = 'stunned';
  boss.stateTick = 0;
  boss.laserFiredDamage = false;
  boss.vx = 0;
  boss.vy = 0;
}

export function stepArsenalBoss(boss: ArsenalBossState, ctx: ArsenalStepContext): void {
  // Sync HP from external combatTarget
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

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_ARSENAL_CFG.phase2Ratio) {
    boss.phase = 2;
  }

  // Step active 2.0s frag grenades regardless of FSM state
  for (let i = boss.grenades.length - 1; i >= 0; i--) {
    const g = boss.grenades[i];
    g.ticksLeft -= 1;
    if (g.ticksLeft <= 0) {
      explodeCircleHazard(
        boss,
        g.x,
        g.y,
        g.r,
        g.dmg,
        BANSUNG_FX_BLAST_HE,
        'sfx_explode_he',
        ctx,
      );
      boss.grenades.splice(i, 1);
    }
  }

  // Step active DANGER missiles regardless of FSM state
  for (let i = boss.missiles.length - 1; i >= 0; i--) {
    const m = boss.missiles[i];
    m.ticksLeft -= 1;
    if (m.ticksLeft <= 0) {
      explodeCircleHazard(
        boss,
        m.x,
        m.y,
        m.r,
        m.dmg,
        BANSUNG_FX_BLAST_CLUSTER,
        'sfx_explode_cluster',
        ctx,
      );
      boss.missiles.splice(i, 1);
    }
  }

  if ((boss.stunTicks ?? 0) > 0 || boss.state === 'stunned') {
    boss.stunTicks = Math.max(0, (boss.stunTicks ?? 0) - 1);
    boss.vx = 0;
    boss.vy = 0;
    boss.stateTick += 1;
    if ((boss.stunTicks ?? 0) <= 0) {
      boss.combatTarget.stunMs = 0;
      boss.combatTarget.damageReduction = BOSS_ARSENAL_CFG.baseDr;
      boss.combatTarget.flatArmor = boss.armor;
      boss.state = 'patrol';
      boss.stateTick = 0;
      boss.actionCdTicks = 12;
    }
    return;
  }

  const target = findNearestAlivePlayer(boss, ctx.players);
  if (target) {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    if (boss.state === 'patrol') {
      boss.aimRad = Math.atan2(dy, dx);
      const speed = boss.phase === 2 ? BOSS_ARSENAL_CFG.speedP2 : BOSS_ARSENAL_CFG.speedP1;
      const desiredMove = dist > 260 ? 1 : dist < 150 ? -0.6 : 0.25;
      const nx = dist > 1e-3 ? dx / dist : 1;
      const ny = dist > 1e-3 ? dy / dist : 0;
      const strafe = Math.sin(ctx.tickNo * 0.05) * 0.65;
      boss.vx = (nx * desiredMove - ny * strafe) * speed;
      boss.vy = (ny * desiredMove + nx * strafe) * speed;
      boss.x = clamp(
        boss.x + boss.vx / 30,
        boss.arenaBounds.minX + boss.radius + 16,
        boss.arenaBounds.maxX - boss.radius - 16,
      );
      boss.y = clamp(
        boss.y + boss.vy / 30,
        boss.arenaBounds.minY + boss.radius + 16,
        boss.arenaBounds.maxY - boss.radius - 16,
      );
    } else {
      boss.vx = 0;
      boss.vy = 0;
    }
  }

  if (boss.summonCdTicks > 0) boss.summonCdTicks -= 1;
  boss.stateTick += 1;

  switch (boss.state) {
    case 'patrol': {
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
        boss.state = 'missile_windup';
      } else if (nextPattern === 1) {
        boss.state = 'laser_telegraph';
        boss.laserFiredDamage = false;
      } else if (nextPattern === 2) {
        boss.state = 'grenade_windup';
      } else {
        boss.state = 'ring_windup';
        boss.ringWave = 0;
        boss.ringBaseAng = boss.aimRad;
      }
      boss.stateTick = 0;
      break;
    }

    case 'grenade_windup': {
      // Throw 3 grenades with 2.0s (60-tick) fuse spaced so player can dodge out
      if (boss.stateTick === 12) {
        const count = boss.phase === 2 ? BOSS_ARSENAL_CFG.grenadeCount + 1 : BOSS_ARSENAL_CFG.grenadeCount;
        const baseX = target ? target.x : boss.x + Math.cos(boss.aimRad) * 220;
        const baseY = target ? target.y : boss.y + Math.sin(boss.aimRad) * 220;
        for (let i = 0; i < count; i++) {
          const ang = boss.aimRad + ((i - (count - 1) * 0.5) * 0.95);
          const offset = i === 0 ? 18 : 115 + i * 24;
          const gx = clamp(
            baseX + Math.cos(ang) * offset,
            boss.arenaBounds.minX + 70,
            boss.arenaBounds.maxX - 70,
          );
          const gy = clamp(
            baseY + Math.sin(ang) * offset,
            boss.arenaBounds.minY + 70,
            boss.arenaBounds.maxY - 70,
          );
          boss.grenades.push({
            id: nextId(boss),
            x: gx,
            y: gy,
            r: BOSS_ARSENAL_CFG.grenadeBlastR,
            ticksLeft: BOSS_ARSENAL_CFG.grenadeFuseTicks,
            maxTicks: BOSS_ARSENAL_CFG.grenadeFuseTicks,
            dmg: BOSS_ARSENAL_CFG.grenadeDmg,
          });
        }
        ctx.onSfx?.('wpn_grenade_launch', boss.x, boss.y);
      }
      if (boss.stateTick >= 22) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 32 : 44;
      }
      break;
    }

    case 'missile_windup': {
      // Drop staggered DANGER red missile target zones around players with escape gaps
      const salvoCount = boss.phase === 2 ? BOSS_ARSENAL_CFG.missileCount + 2 : BOSS_ARSENAL_CFG.missileCount;
      if (boss.stateTick >= 8 && boss.stateTick % 7 === 1 && boss.missiles.length < salvoCount) {
        const idx = boss.missiles.length;
        const px = target ? target.x : boss.x + 200;
        const py = target ? target.y : boss.y;
        const ringAng = boss.aimRad + idx * ((Math.PI * 2) / salvoCount);
        const dist = idx === 0 ? 0 : 125 + (idx % 2) * 55;
        const mx = clamp(
          px + Math.cos(ringAng) * dist,
          boss.arenaBounds.minX + 70,
          boss.arenaBounds.maxX - 70,
        );
        const my = clamp(
          py + Math.sin(ringAng) * dist,
          boss.arenaBounds.minY + 70,
          boss.arenaBounds.maxY - 70,
        );
        boss.missiles.push({
          id: nextId(boss),
          x: mx,
          y: my,
          r: BOSS_ARSENAL_CFG.missileRadius,
          ticksLeft: BOSS_ARSENAL_CFG.missileWarningTicks,
          maxTicks: BOSS_ARSENAL_CFG.missileWarningTicks,
          dmg: BOSS_ARSENAL_CFG.missileDmg,
        });
        ctx.onSfx?.('sfx_bazooka_fire', boss.x, boss.y);
      }
      if (boss.stateTick >= 8 + salvoCount * 7 + 12) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 30 : 42;
      }
      break;
    }

    case 'laser_telegraph': {
      // Track player during early charge (first 18t), then lock red aim line for remaining 20t so player can dodge!
      if (boss.stateTick <= 18 && target) {
        boss.aimRad = Math.atan2(target.y - boss.y, target.x - boss.x);
      }
      boss.laserX2 = boss.x + Math.cos(boss.aimRad) * BOSS_ARSENAL_CFG.laserLength;
      boss.laserY2 = boss.y + Math.sin(boss.aimRad) * BOSS_ARSENAL_CFG.laserLength;
      if (boss.stateTick >= BOSS_ARSENAL_CFG.laserTelegraphTicks) {
        boss.state = 'laser_fire';
        boss.stateTick = 0;
        boss.laserFiredDamage = false;
      }
      break;
    }

    case 'laser_fire': {
      if (!boss.laserFiredDamage) {
        boss.laserFiredDamage = true;
        ctx.fx?.push(
          FX_BEAM,
          Math.round(boss.x),
          Math.round(boss.y),
          Math.round(boss.laserX2),
          Math.round(boss.laserY2),
          BANSUNG_FX_BEAM_LASER_MAP,
        );
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
        for (const p of ctx.players) {
          if (!p.alive || p.downed || p.hp <= 0) continue;
          const hitR = BOSS_ARSENAL_CFG.laserHalfW + (p.radius ?? 13);
          const d2 = distSqPointSegment(p.x, p.y, boss.x, boss.y, boss.laserX2, boss.laserY2);
          if (d2 <= hitR * hitR) {
            applyBansungDamage(
              p,
              {
                baseDmg: Math.round(BOSS_ARSENAL_CFG.laserDmg * ctx.dmgMult),
                dmgKind: 'energy',
                attackerId: boss.idStr,
              },
              ctx.damageCtx,
            );
          }
        }
      }
      if (boss.stateTick >= BOSS_ARSENAL_CFG.laserFireTicks) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 28 : 40;
      }
      break;
    }

    case 'ring_windup': {
      if (boss.stateTick >= 14) {
        boss.state = 'ring_fire';
        boss.stateTick = 0;
      }
      break;
    }

    case 'ring_fire': {
      const maxWaves = boss.phase === 2 ? 3 : 2;
      if (boss.stateTick === 1 || (boss.stateTick % 14 === 1 && boss.ringWave < maxWaves)) {
        const sectors = BOSS_ARSENAL_CFG.ringTotalSectors;
        const waveOffset = boss.ringBaseAng + boss.ringWave * 0.42;
        for (let s = 0; s < sectors; s++) {
          // Deliberately leave wide opposite safe escape corridors so player can dodge cleanly!
          if (GAP_SECTOR_SET.has(s)) continue;
          const ang = waveOffset + (s * TWO_PI) / sectors;
          ctx.onSpawnBullet({
            x: boss.x + Math.cos(ang) * (boss.radius * 0.65),
            y: boss.y + Math.sin(ang) * (boss.radius * 0.65),
            vx: Math.cos(ang) * BOSS_ARSENAL_CFG.ringSpeed,
            vy: Math.sin(ang) * BOSS_ARSENAL_CFG.ringSpeed,
            radius: 6,
            dmg: Math.round(BOSS_ARSENAL_CFG.ringDmg * ctx.dmgMult),
            ttlTicks: 95,
            kind: 1,
          });
        }
        ctx.onSfx?.('sfx_rifle_fire', boss.x, boss.y);
        boss.ringWave += 1;
      }
      if (boss.ringWave >= maxWaves && boss.stateTick >= maxWaves * 14 + 8) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 28 : 38;
      }
      break;
    }

    case 'summon': {
      if (boss.stateTick === 16) {
        const squad: BansungEnemyId[] =
          boss.phase === 2
            ? ['skirmisher', 'cactus_spitter', 'iron_drone']
            : ['scarab', 'skirmisher', 'cactus_spitter'];
        ctx.onSummon(squad, boss.x, boss.y);
        ctx.onSfx?.('wpn_arcane_cast', boss.x, boss.y);
      }
      if (boss.stateTick >= 28) {
        boss.summonCdTicks = BOSS_ARSENAL_CFG.summonCooldownTicks;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 30;
      }
      break;
    }

    default:
      break;
  }

  // Rebuild active telegraphs for wire frame.tg
  const outTel: BansungTelegraph[] = [];
  for (const g of boss.grenades) {
    const prog = clamp(Math.round(((g.maxTicks - g.ticksLeft) / Math.max(1, g.maxTicks)) * 255), 0, 255);
    const secStr = Math.max(0.1, (g.ticksLeft * BANSUNG_TICK_EXACT_MS) / 1000).toFixed(1);
    outTel.push({
      id: g.id,
      kind: 1,
      shape: 'circle',
      phase: g.ticksLeft <= 15 ? 1 : 0,
      color: 1,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(g.x),
      y1: Math.round(g.y),
      r: g.r,
      danger: g.ticksLeft <= 24 ? 1 : 0,
      label: `LỰU ĐẠN ${secStr}s`,
      sourceKind: 'boss_arsenal',
    });
  }
  for (const m of boss.missiles) {
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
      label: 'DANGER',
      sourceKind: 'boss_arsenal',
    });
  }
  if (boss.state === 'laser_telegraph' || boss.state === 'laser_fire') {
    const active = boss.state === 'laser_fire';
    const prog = active
      ? 255
      : clamp(Math.round((boss.stateTick / Math.max(1, BOSS_ARSENAL_CFG.laserTelegraphTicks)) * 255), 0, 255);
    outTel.push({
      id: boss.id * 100 + 77,
      kind: 0,
      shape: 'line',
      phase: active || boss.stateTick > 18 ? 1 : 0,
      color: 0,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(boss.laserX2),
      y1: Math.round(boss.laserY2),
      r: BOSS_ARSENAL_CFG.laserHalfW,
      halfW: BOSS_ARSENAL_CFG.laserHalfW,
      active,
      danger: 1,
      label: active ? 'LASER!' : 'DANGER',
      sourceKind: 'boss_arsenal',
    });
  }
  boss.telegraphs = outTel;
}

export function toArsenalBossFrame(boss: ArsenalBossState): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive || boss.hp <= 0) state = BANSUNG_STATE_DEAD;
  else if ((boss.stunTicks ?? 0) > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state === 'patrol') state = Math.hypot(boss.vx, boss.vy) > 4 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
  else state = BANSUNG_STATE_ATK;

  return {
    id: boss.id,
    kind: 'boss_arsenal',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph: boss.telegraphs.length > 0 ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100)) : 0,
    telegraphs: boss.telegraphs,
    title: 'Arsenal Dread Gunner',
    subtitle: 'BOSS I · SÚNG HỦY DIỆT · LỰU ĐẠN / TÊN LỬA / LAZE',
    tier: 1,
  };
}
