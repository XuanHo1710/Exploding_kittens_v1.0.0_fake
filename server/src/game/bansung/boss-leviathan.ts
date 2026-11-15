/**
 * Boss 8: Thủy Quái Vực Thẳm Omega (`boss_abyssal_leviathan`) — 12x multi-bar apex sea-void leviathan.
 *
 * Designed around breaking its 4 anatomical parts (`abyss_maw`, `left_tentacle`,
 * `right_tentacle`, `abyssal_heart`) to stun the boss and unlock enraged abyss skills:
 *  - `leviathan_devour_wave`: relentless multi-wave void projectiles with dodge gaps
 *  - `abyss_tentacle_cross`: 4-way X-Cross abyssal hydro beams
 *  - `void_surge_ring`: accelerated abyssal bullet storm
 *  - `cataclysm_vortex`: deep-sea gravitational pull vortex + collapse nova
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BLAST_ABYSS_NOVA,
  BANSUNG_FX_BLAST_DESTROYER_METEOR,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BOSS_LEVIATHAN_CFG,
  FX_BEAM,
  FX_BLAST,
  getBossHpBars,
  type BansungBossFrame,
  type BansungEnemyId,
  type BansungTelegraph,
  type BansungUnitState,
} from '../../../../shared/src';
import { applyBansungDamage, type BansungCombatTarget, type BansungDamageContext } from './damage';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type LeviathanBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'meteor_windup'
  | 'tentacle_telegraph'
  | 'tentacle_fire'
  | 'ring_windup'
  | 'ring_fire'
  | 'vortex_pull'
  | 'devour_barrage'
  | 'summon'
  | 'dead';

export interface LeviathanMeteorHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
  label: string;
}

export interface LeviathanVortexHazard {
  id: number;
  x: number;
  y: number;
  pullR: number;
  burstR: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
}

export interface LeviathanPlayerTarget extends BansungCombatTarget {
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

export interface LeviathanBulletSpawn {
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
}

export interface LeviathanBossState {
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
  state: LeviathanBossFSMState;
  stateTick: number;
  stunTicks: number;
  patternIdx: number;
  actionCdTicks: number;
  summonCdTicks: number;
  ringWave: number;
  ringBaseAng: number;
  beamAngles: number[];
  beamFiredDamage: boolean;
  unlockedSkills: Set<string>;
  unlockedSkillList: string[];
  queuedEnragedSkills: string[];
  seq: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  meteors: LeviathanMeteorHazard[];
  vortices: LeviathanVortexHazard[];
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface LeviathanStepContext {
  tickNo: number;
  players: readonly LeviathanPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSpawnBullet: (b: LeviathanBulletSpawn) => void;
  onSummon: (kinds: readonly BansungEnemyId[], cx: number, cy: number) => void;
  onPullPlayer?: (playerId: string, dx: number, dy: number) => void;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

const GAP_SECTOR_SET = new Set<number>(BOSS_LEVIATHAN_CFG.ringGapSectors);
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

function nextId(boss: LeviathanBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function findNearestAlivePlayer(
  boss: LeviathanBossState,
  players: readonly LeviathanPlayerTarget[],
): LeviathanPlayerTarget | undefined {
  let best: LeviathanPlayerTarget | undefined;
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

export function createLeviathanBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  radiusScale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
}): LeviathanBossState {
  const spec = BANSUNG_ENEMIES.boss_abyssal_leviathan;
  const maxHp = Math.max(1500, Math.round(BOSS_LEVIATHAN_CFG.baseHp * (opts.hpMult ?? 1)));
  const scaledRadius = Math.max(26, Math.round(BOSS_LEVIATHAN_CFG.radius * clamp(opts.radiusScale ?? 1, 0.45, 2.0)));
  const idStr = `boss_abyssal_leviathan_${opts.id}`;
  const combatTarget: BansungCombatTarget = {
    id: idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: BOSS_LEVIATHAN_CFG.armor,
    damageReduction: BOSS_LEVIATHAN_CFG.baseDr,
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
    armor: BOSS_LEVIATHAN_CFG.armor,
    phase: 1,
    alive: true,
    aimRad: 0,
    state: 'patrol',
    stateTick: 0,
    stunTicks: 0,
    patternIdx: 0,
    actionCdTicks: 22,
    summonCdTicks: 140,
    ringWave: 0,
    ringBaseAng: 0,
    beamAngles: [0, Math.PI * 0.5],
    beamFiredDamage: false,
    unlockedSkills: new Set<string>(),
    unlockedSkillList: [],
    queuedEnragedSkills: [],
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    meteors: [],
    vortices: [],
    telegraphs: [],
    combatTarget,
  };
}

export function stunLeviathanBoss(boss: LeviathanBossState, durationMs: number, unlockedSkill?: string): void {
  if (!boss.alive) return;
  const ticks = Math.max(20, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
  boss.stunTicks = Math.max(boss.stunTicks, ticks);
  boss.combatTarget.stunMs = Math.max(boss.combatTarget.stunMs ?? 0, durationMs);
  boss.combatTarget.damageReduction = 0;
  boss.combatTarget.flatArmor = Math.round(boss.armor * 0.4);
  boss.state = 'stunned';
  boss.stateTick = 0;
  boss.beamFiredDamage = false;
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

function explodeLeviathanCircle(
  boss: LeviathanBossState,
  x: number,
  y: number,
  r: number,
  dmg: number,
  blastKind: number,
  ctx: LeviathanStepContext,
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

function enterLeviathanSkill(
  boss: LeviathanBossState,
  skillId: string,
  target: LeviathanPlayerTarget | undefined,
): void {
  const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
  if (skillId === 'leviathan_devour_wave') {
    boss.state = 'devour_barrage';
    boss.stateTick = 0;
    boss.ringWave = 0;
    return;
  }
  if (skillId === 'abyss_tentacle_cross') {
    boss.state = 'tentacle_telegraph';
    boss.stateTick = 0;
    boss.beamFiredDamage = false;
    boss.beamAngles = [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5];
    return;
  }
  if (skillId === 'void_surge_ring') {
    boss.state = 'ring_windup';
    boss.stateTick = 0;
    boss.ringWave = 0;
    boss.ringBaseAng = base;
    return;
  }
  if (skillId === 'cataclysm_vortex') {
    boss.state = 'vortex_pull';
    boss.stateTick = 0;
    return;
  }
  boss.state = 'meteor_windup';
  boss.stateTick = 0;
}

export function stepLeviathanBoss(boss: LeviathanBossState, ctx: LeviathanStepContext): void {
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

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_LEVIATHAN_CFG.phase2Ratio) {
    boss.phase = 2;
  }

  for (let i = boss.meteors.length - 1; i >= 0; i--) {
    const m = boss.meteors[i];
    m.ticksLeft -= 1;
    if (m.ticksLeft <= 0) {
      explodeLeviathanCircle(boss, m.x, m.y, m.r, m.dmg, BANSUNG_FX_BLAST_DESTROYER_METEOR, ctx);
      boss.meteors.splice(i, 1);
    }
  }

  for (let i = boss.vortices.length - 1; i >= 0; i--) {
    const vx = boss.vortices[i];
    vx.ticksLeft -= 1;
    for (const p of ctx.players) {
      if (!p.alive || p.downed || p.hp <= 0) continue;
      const dx = vx.x - p.x;
      const dy = vx.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 14 && dist <= vx.pullR) {
        const pullStep =
          (BOSS_LEVIATHAN_CFG.vortexPullForce / BANSUNG_TICK_HZ) * (1 - dist / (vx.pullR * 1.25));
        const pdx = (dx / dist) * pullStep;
        const pdy = (dy / dist) * pullStep;
        ctx.onPullPlayer?.(p.id, pdx, pdy);
      }
    }
    if (vx.ticksLeft <= 0) {
      explodeLeviathanCircle(boss, vx.x, vx.y, vx.burstR, vx.dmg, BANSUNG_FX_BLAST_ABYSS_NOVA, ctx);
      boss.vortices.splice(i, 1);
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
      boss.combatTarget.damageReduction = BOSS_LEVIATHAN_CFG.baseDr;
      boss.combatTarget.flatArmor = boss.armor;
      const queued = boss.queuedEnragedSkills.shift();
      if (queued) {
        enterLeviathanSkill(boss, queued, target);
      } else {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 12;
      }
    }
    rebuildLeviathanTelegraphs(boss);
    return;
  }

  if (target && boss.state === 'patrol') {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    boss.aimRad = Math.atan2(dy, dx);
    const speed = boss.phase === 2 ? BOSS_LEVIATHAN_CFG.speedP2 : BOSS_LEVIATHAN_CFG.speedP1;
    const desiredMove = dist > 290 ? 1 : dist < 165 ? -0.5 : 0.25;
    const nx = dist > 1e-3 ? dx / dist : 1;
    const ny = dist > 1e-3 ? dy / dist : 0;
    const strafe = Math.cos(ctx.tickNo * 0.048) * 0.7;
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
        enterLeviathanSkill(boss, queued, target);
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
        boss.state = 'tentacle_telegraph';
        boss.beamFiredDamage = false;
        const base = boss.aimRad;
        boss.beamAngles = boss.unlockedSkills.has('abyss_tentacle_cross')
          ? [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5]
          : [base - 0.36, base + 0.36];
      } else if (nextPattern === 2) {
        boss.state = boss.unlockedSkills.has('leviathan_devour_wave') ? 'devour_barrage' : 'ring_windup';
        boss.ringWave = 0;
        boss.ringBaseAng = boss.aimRad;
      } else {
        boss.state = 'vortex_pull';
      }
      boss.stateTick = 0;
      break;
    }

    case 'meteor_windup': {
      const count = BOSS_LEVIATHAN_CFG.meteorCount + (boss.phase === 2 ? 2 : 0);
      if (boss.stateTick >= 6 && boss.stateTick % 5 === 1 && boss.meteors.length < count) {
        const idx = boss.meteors.length;
        const alivePlayers = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
        const pick = alivePlayers.length > 0 ? alivePlayers[idx % alivePlayers.length] : target;
        const px = pick ? pick.x : boss.x + 210;
        const py = pick ? pick.y : boss.y;
        const ang = boss.aimRad + idx * 1.05;
        const dist = idx === 0 ? 15 : 95 + (idx % 3) * 50;
        boss.meteors.push({
          id: nextId(boss),
          x: clamp(px + Math.cos(ang) * dist, boss.arenaBounds.minX + 75, boss.arenaBounds.maxX - 75),
          y: clamp(py + Math.sin(ang) * dist, boss.arenaBounds.minY + 75, boss.arenaBounds.maxY - 75),
          r: BOSS_LEVIATHAN_CFG.meteorRadius,
          ticksLeft: BOSS_LEVIATHAN_CFG.meteorWarningTicks,
          maxTicks: BOSS_LEVIATHAN_CFG.meteorWarningTicks,
          dmg: BOSS_LEVIATHAN_CFG.meteorDmg,
          label: 'DANGER · SÓNG THẦN VỰC THẲM',
        });
        ctx.onSfx?.('sfx_bazooka_fire', boss.x, boss.y);
      }
      if (boss.stateTick >= 6 + count * 5 + 10) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 30;
      }
      break;
    }

    case 'tentacle_telegraph': {
      if (boss.stateTick <= 14 && target) {
        const base = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.aimRad = base;
        boss.beamAngles = boss.unlockedSkills.has('abyss_tentacle_cross')
          ? [base, base + Math.PI * 0.5, base + Math.PI, base + Math.PI * 1.5]
          : [base - 0.36, base + 0.36];
      }
      if (boss.stateTick >= BOSS_LEVIATHAN_CFG.tentacleCrossTelegraphTicks) {
        boss.state = 'tentacle_fire';
        boss.stateTick = 0;
        boss.beamFiredDamage = false;
      }
      break;
    }

    case 'tentacle_fire': {
      if (!boss.beamFiredDamage) {
        boss.beamFiredDamage = true;
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
        for (const ang of boss.beamAngles) {
          const x2 = boss.x + Math.cos(ang) * BOSS_LEVIATHAN_CFG.tentacleCrossLength;
          const y2 = boss.y + Math.sin(ang) * BOSS_LEVIATHAN_CFG.tentacleCrossLength;
          ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), BANSUNG_FX_BEAM_LASER_MAP);
          for (const p of ctx.players) {
            if (!p.alive || p.downed || p.hp <= 0) continue;
            const hitR = BOSS_LEVIATHAN_CFG.tentacleCrossHalfW + (p.radius ?? 13);
            if (distSqPointSegment(p.x, p.y, boss.x, boss.y, x2, y2) <= hitR * hitR) {
              applyBansungDamage(
                p,
                {
                  baseDmg: Math.round(BOSS_LEVIATHAN_CFG.tentacleCrossDmg * ctx.dmgMult),
                  dmgKind: 'energy',
                  attackerId: boss.idStr,
                },
                ctx.damageCtx,
              );
            }
          }
        }
      }
      if (boss.stateTick >= 16) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 30;
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
    case 'devour_barrage': {
      const isDevour = boss.state === 'devour_barrage';
      const hasVoidRing = boss.unlockedSkills.has('void_surge_ring');
      const maxWaves = (boss.phase === 2 ? 3 : 2) + (isDevour || hasVoidRing ? 1 : 0);
      if (boss.stateTick === 1 || (boss.stateTick % 12 === 1 && boss.ringWave < maxWaves)) {
        const sectors = BOSS_LEVIATHAN_CFG.ringBolts;
        const stepAng = TWO_PI / sectors;
        const waveOffset = boss.ringWave * 0.22;
        for (let s = 0; s < sectors; s++) {
          if (GAP_SECTOR_SET.has(s)) continue;
          const ang = boss.ringBaseAng + waveOffset + s * stepAng;
          ctx.onSpawnBullet({
            kind: isDevour && s % 3 === 0 ? 'zap' : 'plasma',
            x: boss.x + Math.cos(ang) * (boss.radius + 10),
            y: boss.y + Math.sin(ang) * (boss.radius + 10),
            vx: Math.cos(ang) * BOSS_LEVIATHAN_CFG.ringSpeed,
            vy: Math.sin(ang) * BOSS_LEVIATHAN_CFG.ringSpeed,
            r: 8,
            dmg: Math.round(BOSS_LEVIATHAN_CFG.ringDmg * ctx.dmgMult),
            dmgKind: 'energy',
            ttlTicks: 95,
            ownerId: boss.id,
          });
        }
        ctx.onSfx?.('sfx_wpn_void_cannon', boss.x, boss.y);
        boss.ringWave += 1;
      }
      if (boss.ringWave >= maxWaves && boss.stateTick >= maxWaves * 12 + 8) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 30;
      }
      break;
    }

    case 'vortex_pull': {
      if (boss.stateTick === 4) {
        const hasCataclysm = boss.unlockedSkills.has('cataclysm_vortex');
        const centerX = target ? (boss.x + target.x) * 0.5 : boss.x + 160;
        const centerY = target ? (boss.y + target.y) * 0.5 : boss.y;
        const bx = clamp(centerX, boss.arenaBounds.minX + 120, boss.arenaBounds.maxX - 120);
        const by = clamp(centerY, boss.arenaBounds.minY + 120, boss.arenaBounds.maxY - 120);
        boss.vortices.push({
          id: nextId(boss),
          x: bx,
          y: by,
          pullR: BOSS_LEVIATHAN_CFG.vortexPullRadius,
          burstR: BOSS_LEVIATHAN_CFG.vortexRadius + (hasCataclysm ? 24 : 0),
          ticksLeft: 46,
          maxTicks: 46,
          dmg: BOSS_LEVIATHAN_CFG.vortexBurstDmg + (hasCataclysm ? 10 : 0),
        });
        ctx.onSfx?.('sfx_wpn_gravity', bx, by);
      }
      if (boss.stateTick >= 52) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 24 : 32;
      }
      break;
    }

    case 'summon': {
      if (boss.stateTick === 12) {
        const kinds: BansungEnemyId[] =
          boss.phase === 2
            ? ['blight_bomber', 'volt_stalker', 'solar_priest', 'magma_brute']
            : ['blight_bomber', 'volt_stalker', 'magnet_drone'];
        ctx.onSummon(kinds, boss.x, boss.y);
        boss.summonCdTicks = BOSS_LEVIATHAN_CFG.summonCooldownTicks;
      }
      if (boss.stateTick >= 24) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 24;
      }
      break;
    }

    default:
      break;
  }

  rebuildLeviathanTelegraphs(boss);
}

function rebuildLeviathanTelegraphs(boss: LeviathanBossState): void {
  const outTel: BansungTelegraph[] = [];
  for (const m of boss.meteors) {
    const prog = clamp(Math.round(((m.maxTicks - m.ticksLeft) / Math.max(1, m.maxTicks)) * 255), 0, 255);
    outTel.push({
      id: m.id,
      kind: 1,
      shape: 'circle',
      phase: m.ticksLeft <= 14 ? 1 : 0,
      color: 2,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(m.x),
      y1: Math.round(m.y),
      r: m.r,
      danger: 1,
      label: m.label,
      sourceKind: 'boss_abyssal_leviathan',
    });
  }
  for (const vx of boss.vortices) {
    const prog = clamp(Math.round(((vx.maxTicks - vx.ticksLeft) / Math.max(1, vx.maxTicks)) * 255), 0, 255);
    const secStr = Math.max(0.1, (vx.ticksLeft * BANSUNG_TICK_EXACT_MS) / 1000).toFixed(1);
    outTel.push({
      id: vx.id,
      kind: 1,
      shape: 'circle',
      phase: vx.ticksLeft <= 15 ? 1 : 0,
      color: 1,
      prog,
      x0: Math.round(vx.x),
      y0: Math.round(vx.y),
      x1: Math.round(vx.x),
      y1: Math.round(vx.y),
      r: vx.burstR,
      danger: 1,
      label: `XOÁY VỰC THẲM ${secStr}s`,
      sourceKind: 'boss_abyssal_leviathan',
    });
  }
  if (boss.state === 'tentacle_telegraph' || boss.state === 'tentacle_fire') {
    const active = boss.state === 'tentacle_fire';
    const prog = active
      ? 255
      : clamp(Math.round((boss.stateTick / Math.max(1, BOSS_LEVIATHAN_CFG.tentacleCrossTelegraphTicks)) * 255), 0, 255);
    boss.beamAngles.forEach((ang, idx) => {
      const x2 = boss.x + Math.cos(ang) * BOSS_LEVIATHAN_CFG.tentacleCrossLength;
      const y2 = boss.y + Math.sin(ang) * BOSS_LEVIATHAN_CFG.tentacleCrossLength;
      outTel.push({
        id: boss.id * 100 + 90 + idx,
        kind: 0,
        shape: 'line',
        phase: active || boss.stateTick > 18 ? 1 : 0,
        color: 2,
        prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(x2),
        y1: Math.round(y2),
        r: BOSS_LEVIATHAN_CFG.tentacleCrossHalfW,
        halfW: BOSS_LEVIATHAN_CFG.tentacleCrossHalfW,
        active,
        danger: 1,
        label: active ? 'XÚC TU HỦY DIỆT!' : 'DANGER · TỨ XÚC TU',
        sourceKind: 'boss_abyssal_leviathan',
      });
    });
  }
  boss.telegraphs = outTel;
}

export function toLeviathanBossFrame(boss: LeviathanBossState, mini = false): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive || boss.hp <= 0) state = BANSUNG_STATE_DEAD;
  else if (boss.stunTicks > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state === 'patrol') state = Math.hypot(boss.vx, boss.vy) > 4 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
  else state = BANSUNG_STATE_ATK;

  return {
    id: boss.id,
    kind: 'boss_abyssal_leviathan',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    hpBars: getBossHpBars('boss_abyssal_leviathan', mini),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph: boss.telegraphs.length > 0 ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100)) : 0,
    telegraphs: boss.telegraphs,
    unlockedSkills: boss.unlockedSkillList.length > 0 ? [...boss.unlockedSkillList] : undefined,
    title: 'Thủy Quái Vực Thẳm Omega',
    subtitle: 'BOSS TỐI THƯỢNG · ×12 THANH MÁU · PHÁ HÀM & XÚC TU ĐỂ CHOÁNG',
    tier: 5,
  };
}
