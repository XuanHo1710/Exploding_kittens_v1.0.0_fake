/**
 * Boss 5: Chúa Tể Bão Tố (`boss_tempest`) — 6x multi-bar storm & lightning sovereign.
 *
 * Skills:
 *  - `lightning_strikes`: targeted thunder circles with clear warning frames
 *  - `cyclone_ring`: rotating cyclone bullet ring leaving open escape sectors
 *  - `arc_beam`: high-voltage long-range storm beam with telegraph line
 *  - `summon`: summons thunder / stealth escorts
 * Enraged skills unlocked as destructible wings & crown break:
 *  - `chain_thunderstorm`, `cyclone_ring`, `supercell_judgment`
 */
import {
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BLAST_THUNDER_STORM,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BOSS_TEMPEST_CFG,
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
  emitRosePetalRing,
  emitSakuyaPauseLanceRing,
  type BossDanmakuSpawnInput,
  type DanmakuMotionSpec,
} from './danmaku';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type TempestBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'lightning_windup'
  | 'cyclone_windup'
  | 'cyclone_fire'
  | 'arc_telegraph'
  | 'arc_fire'
  | 'supercell_telegraph'
  | 'supercell_fire'
  | 'summon'
  | 'dead';

export interface TempestStrikeHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
  label: string;
}

export interface TempestPlayerTarget extends BansungCombatTarget {
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

export interface TempestBulletSpawn {
  kind: 'plasma' | 'zap';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  dmgKind: 'energy';
  ttlTicks: number;
  ownerId: number;
  danmaku?: DanmakuMotionSpec;
}

export interface TempestBossState {
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
  state: TempestBossFSMState;
  stateTick: number;
  stunTicks: number;
  patternIdx: number;
  actionCdTicks: number;
  summonCdTicks: number;
  ringWave: number;
  ringBaseAng: number;
  beamAngles: number[];
  beamSpinDir?: 1 | -1;
  beamFiredDamage: boolean;
  unlockedSkills: Set<string>;
  unlockedSkillList: string[];
  queuedEnragedSkills: string[];
  seq: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  strikes: TempestStrikeHazard[];
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface TempestStepContext {
  tickNo: number;
  players: readonly TempestPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSpawnBullet: (b: TempestBulletSpawn) => void;
  onSummon: (kinds: readonly BansungEnemyId[], cx: number, cy: number) => void;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

const CYCLONE_GAP_SET = new Set<number>(BOSS_TEMPEST_CFG.cycloneGapSectors);
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

function nextId(boss: TempestBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function findNearestAlivePlayer(
  boss: TempestBossState,
  players: readonly TempestPlayerTarget[],
): TempestPlayerTarget | undefined {
  let best: TempestPlayerTarget | undefined;
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

export function createTempestBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  radiusScale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
}): TempestBossState {
  const spec = BANSUNG_ENEMIES.boss_tempest;
  const maxHp = Math.max(800, Math.round(BOSS_TEMPEST_CFG.baseHp * (opts.hpMult ?? 1)));
  const scaledRadius = Math.max(20, Math.round(BOSS_TEMPEST_CFG.radius * clamp(opts.radiusScale ?? 1, 0.45, 2.0)));
  const idStr = `boss_tempest_${opts.id}`;
  const combatTarget: BansungCombatTarget = {
    id: idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: BOSS_TEMPEST_CFG.armor,
    damageReduction: BOSS_TEMPEST_CFG.baseDr,
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
    armor: BOSS_TEMPEST_CFG.armor,
    phase: 1,
    alive: true,
    aimRad: 0,
    state: 'patrol',
    stateTick: 0,
    stunTicks: 0,
    patternIdx: 0,
    actionCdTicks: 26,
    summonCdTicks: 150,
    ringWave: 0,
    ringBaseAng: 0,
    beamAngles: [0],
    beamFiredDamage: false,
    unlockedSkills: new Set<string>(),
    unlockedSkillList: [],
    queuedEnragedSkills: [],
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    strikes: [],
    telegraphs: [],
    combatTarget,
  };
}

export function stunTempestBoss(boss: TempestBossState, durationMs: number, unlockedSkill?: string): void {
  if (!boss.alive) return;
  const ticks = Math.max(18, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
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

function detonateStormStrike(boss: TempestBossState, s: TempestStrikeHazard, ctx: TempestStepContext): void {
  ctx.fx?.push(FX_BLAST, BANSUNG_FX_BLAST_THUNDER_STORM, Math.round(s.x), Math.round(s.y), Math.round(s.r), boss.id);
  ctx.onSfx?.('sfx_wpn_tesla', s.x, s.y);
  const r2 = s.r * s.r;
  for (const p of ctx.players) {
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const pr = s.r + (p.radius ?? 13);
    if (dx * dx + dy * dy <= pr * pr) {
      applyBansungDamage(
        p,
        {
          baseDmg: Math.round(s.dmg * ctx.dmgMult),
          dmgKind: 'energy',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
      if (p.alive && !p.downed) {
        p.slowPct = Math.max(p.slowPct ?? 0, 0.25);
        p.slowMs = Math.max(p.slowMs ?? 0, 900);
      }
    }
  }
}

function enterTempestSkill(boss: TempestBossState, skillId: string, target: TempestPlayerTarget | undefined): void {
  if (skillId === 'chain_thunderstorm') {
    boss.state = 'lightning_windup';
    boss.stateTick = 0;
    return;
  }
  if (skillId === 'cyclone_ring') {
    boss.state = 'cyclone_windup';
    boss.stateTick = 0;
    boss.ringWave = 0;
    boss.ringBaseAng = boss.aimRad;
    return;
  }
  if (skillId === 'supercell_judgment') {
    boss.state = 'supercell_telegraph';
    boss.stateTick = 0;
    boss.beamFiredDamage = false;
    boss.beamSpinDir = boss.beamSpinDir === 1 ? -1 : 1;
    const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
    boss.beamAngles = [base, base + TWO_PI / 3, base + (2 * TWO_PI) / 3];
    return;
  }
  boss.state = 'lightning_windup';
  boss.stateTick = 0;
}

function emitTempestDanmaku(
  boss: TempestBossState,
  ctx: TempestStepContext,
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
    dmgKind: 'energy',
    ttlTicks: b.ttlTicks,
    ownerId: boss.id,
    danmaku: b,
  });
}

export function stepTempestBoss(boss: TempestBossState, ctx: TempestStepContext): void {
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

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_TEMPEST_CFG.phase2Ratio) {
    boss.phase = 2;
  }

  for (let i = boss.strikes.length - 1; i >= 0; i--) {
    const s = boss.strikes[i];
    s.ticksLeft -= 1;
    if (s.ticksLeft <= 0) {
      detonateStormStrike(boss, s, ctx);
      boss.strikes.splice(i, 1);
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
      boss.combatTarget.damageReduction = BOSS_TEMPEST_CFG.baseDr;
      boss.combatTarget.flatArmor = boss.armor;
      const queued = boss.queuedEnragedSkills.shift();
      if (queued) {
        enterTempestSkill(boss, queued, target);
      } else {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 12;
      }
    }
    rebuildTempestTelegraphs(boss);
    return;
  }

  if (target && boss.state === 'patrol') {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    boss.aimRad = Math.atan2(dy, dx);
    const speed = boss.phase === 2 ? BOSS_TEMPEST_CFG.speedP2 : BOSS_TEMPEST_CFG.speedP1;
    const desiredMove = dist > 260 ? 1 : dist < 150 ? -0.55 : 0.2;
    const nx = dist > 1e-3 ? dx / dist : 1;
    const ny = dist > 1e-3 ? dy / dist : 0;
    const strafe = Math.sin(ctx.tickNo * 0.065) * 0.85;
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
        enterTempestSkill(boss, queued, target);
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
        boss.state = 'lightning_windup';
      } else if (nextPattern === 1) {
        boss.state = 'cyclone_windup';
        boss.ringWave = 0;
        boss.ringBaseAng = boss.aimRad;
      } else if (nextPattern === 2) {
        if (boss.unlockedSkills.has('supercell_judgment') || boss.phase === 2) {
          enterTempestSkill(boss, 'supercell_judgment', target);
          break;
        }
        boss.state = 'arc_telegraph';
        boss.beamFiredDamage = false;
        boss.beamSpinDir = boss.beamSpinDir === 1 ? -1 : 1;
        boss.beamAngles = [boss.aimRad - 0.44, boss.aimRad + 0.44];
      } else {
        boss.state = 'lightning_windup';
      }
      boss.stateTick = 0;
      break;
    }

    case 'lightning_windup': {
      const hasChain = boss.unlockedSkills.has('chain_thunderstorm');
      const totalStrikes =
        BOSS_TEMPEST_CFG.lightningCount + (boss.phase === 2 ? 2 : 0) + (hasChain ? 3 : 0);
      if (boss.stateTick >= 6 && boss.stateTick % 5 === 1 && boss.strikes.length < totalStrikes) {
        const idx = boss.strikes.length;
        const alivePlayers = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
        const pick = alivePlayers.length > 0 ? alivePlayers[idx % alivePlayers.length] : target;
        const px = pick ? pick.x : boss.x + 180;
        const py = pick ? pick.y : boss.y;
        const ringCount = Math.max(1, totalStrikes - 1);
        const ringR = Math.max(154, BOSS_TEMPEST_CFG.lightningRadius * 2.38);
        const ang = boss.aimRad + ((idx - 1) / ringCount) * TWO_PI;
        const offR = idx === 0 ? 0 : ringR;
        boss.strikes.push({
          id: nextId(boss),
          x: clamp(px + Math.cos(ang) * offR, boss.arenaBounds.minX + 70, boss.arenaBounds.maxX - 70),
          y: clamp(py + Math.sin(ang) * offR, boss.arenaBounds.minY + 70, boss.arenaBounds.maxY - 70),
          r: BOSS_TEMPEST_CFG.lightningRadius,
          ticksLeft: BOSS_TEMPEST_CFG.lightningWarningTicks,
          maxTicks: BOSS_TEMPEST_CFG.lightningWarningTicks,
          dmg: BOSS_TEMPEST_CFG.lightningDmg,
          label: '',
        });
        ctx.onSfx?.('sfx_wpn_zap', boss.x, boss.y);
      }
      if (boss.stateTick >= 6 + totalStrikes * 5 + 10) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 24 : 34;
      }
      break;
    }

    case 'cyclone_windup': {
      if (boss.stateTick >= 12) {
        boss.state = 'cyclone_fire';
        boss.stateTick = 0;
      }
      break;
    }

    case 'cyclone_fire': {
      const hasDouble = boss.unlockedSkills.has('cyclone_ring');
      const maxWaves = (boss.phase === 2 ? 3 : 2) + (hasDouble ? 1 : 0);
      if (boss.stateTick === 1 || (boss.stateTick % 12 === 1 && boss.ringWave < maxWaves)) {
        const scaledDmg = Math.max(1, Math.round(BOSS_TEMPEST_CFG.cycloneDmg * ctx.dmgMult));
        if (boss.ringWave === 1) {
          emitSakuyaPauseLanceRing((b) => emitTempestDanmaku(boss, ctx, b), {
            x: boss.x,
            y: boss.y,
            count: boss.phase === 2 ? 16 : 12,
            expandSpeed: 190,
            pauseAfterTicks: 13,
            pauseDurationTicks: 14,
            snapSpeed: 455,
            fanSpreadRad: 0.32,
            rotRad: boss.ringBaseAng + 0.28,
            damage: scaledDmg,
            expandPalette: BANSUNG_DANMAKU_PALETTE.CYAN,
            snapPalette: BANSUNG_DANMAKU_PALETTE.GOLD,
          });
        } else {
          emitRosePetalRing((b) => emitTempestDanmaku(boss, ctx, b), {
            x: boss.x,
            y: boss.y,
            count: 24,
            petals: boss.phase === 2 ? 8 : 6,
            baseSpeed: BOSS_TEMPEST_CFG.cycloneSpeed * 0.92,
            petalAmp: 82,
            rotRad: boss.ringBaseAng + boss.ringWave * 0.34,
            damage: scaledDmg,
            tipKind: 'danmaku_lance',
            valleyKind: 'danmaku_orb',
            tipPalette: BANSUNG_DANMAKU_PALETTE.GOLD,
            valleyPalette: BANSUNG_DANMAKU_PALETTE.CYAN,
            angVel: boss.ringWave % 2 === 0 ? 0.54 : -0.54,
          });
        }
        ctx.onSfx?.('sfx_wpn_tesla', boss.x, boss.y);
        boss.ringWave += 1;
      }
      if (boss.ringWave >= maxWaves && boss.stateTick >= maxWaves * 12 + 8) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 26 : 36;
      }
      break;
    }

    case 'arc_telegraph':
    case 'supercell_telegraph': {
      const isSuper = boss.state === 'supercell_telegraph';
      if (boss.stateTick <= 12 && target) {
        const base = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.aimRad = base;
        boss.beamAngles = isSuper
          ? [base, base + TWO_PI / 3, base + (2 * TWO_PI) / 3]
          : [base - 0.44, base + 0.44];
      }
      if (boss.stateTick >= BOSS_TEMPEST_CFG.arcBeamTelegraphTicks) {
        boss.state = isSuper ? 'supercell_fire' : 'arc_fire';
        boss.stateTick = 0;
        boss.beamFiredDamage = false;
      }
      break;
    }

    case 'arc_fire':
    case 'supercell_fire': {
      const isSuper = boss.state === 'supercell_fire';
      const spinDir = boss.beamSpinDir ?? 1;
      const fireDur = 38;
      if (boss.stateTick === 1) {
        boss.beamFiredDamage = true;
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
        const burstDmg = Math.max(1, Math.round(BOSS_TEMPEST_CFG.cycloneDmg * 0.85 * ctx.dmgMult));
        for (let k = 0; k < 8; k++) {
          const sa = boss.aimRad + (k / 8) * TWO_PI;
          emitTempestDanmaku(boss, ctx, {
            danmakuKind: 'danmaku_star',
            palette: BANSUNG_DANMAKU_PALETTE.GOLD,
            scaleTier: 0,
            x: boss.x + Math.cos(sa) * (boss.radius + 8),
            y: boss.y + Math.sin(sa) * (boss.radius + 8),
            vx: Math.cos(sa) * 250,
            vy: Math.sin(sa) * 250,
            radius: 6,
            damage: burstDmg,
            dmgKind: 'energy',
            ttlTicks: 54,
            angVel: spinDir * 0.65,
          });
        }
      }
      const rotStep = spinDir * (isSuper ? 0.024 : 0.021);
      for (let i = 0; i < boss.beamAngles.length; i++) {
        boss.beamAngles[i] += rotStep;
      }
      const emitFx = boss.stateTick === 1 || boss.stateTick % 2 === 0;
      const dealTickDmg = boss.stateTick === 1 || boss.stateTick % 6 === 0;
      const tickDmg = Math.max(1, Math.round(BOSS_TEMPEST_CFG.arcBeamDmg * 0.36 * ctx.dmgMult));
      for (const ang of boss.beamAngles) {
        const x2 = boss.x + Math.cos(ang) * BOSS_TEMPEST_CFG.arcBeamLength;
        const y2 = boss.y + Math.sin(ang) * BOSS_TEMPEST_CFG.arcBeamLength;
        if (emitFx) {
          ctx.fx?.push(
            FX_BEAM,
            Math.round(boss.x),
            Math.round(boss.y),
            Math.round(x2),
            Math.round(y2),
            boss.stateTick % 4 === 0 ? BANSUNG_FX_BEAM_LASER_MAP : BANSUNG_FX_BEAM_CHAIN,
          );
        }
        if (dealTickDmg) {
          for (const p of ctx.players) {
            if (!p.alive || p.downed || p.hp <= 0) continue;
            const hitR = BOSS_TEMPEST_CFG.arcBeamHalfW + (p.radius ?? 13);
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
        boss.actionCdTicks = boss.phase === 2 ? 26 : 36;
      }
      break;
    }

    case 'summon': {
      if (boss.stateTick === 12) {
        const kinds: BansungEnemyId[] =
          boss.phase === 2 ? ['thunder_mage', 'chrono_mage', 'shock_drone_mk2'] : ['thunder_mage', 'shock_drone_mk2'];
        ctx.onSummon(kinds, boss.x, boss.y);
        boss.summonCdTicks = BOSS_TEMPEST_CFG.summonCooldownTicks;
      }
      if (boss.stateTick >= 24) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 28;
      }
      break;
    }

    default:
      break;
  }

  rebuildTempestTelegraphs(boss);
}

function rebuildTempestTelegraphs(boss: TempestBossState): void {
  const outTel: BansungTelegraph[] = [];
  for (const s of boss.strikes) {
    const prog = clamp(Math.round(((s.maxTicks - s.ticksLeft) / Math.max(1, s.maxTicks)) * 255), 0, 255);
    outTel.push({
      id: s.id,
      kind: 1,
      shape: 'circle',
      phase: s.ticksLeft <= 14 ? 1 : 0,
      color: 2,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(s.x),
      y1: Math.round(s.y),
      r: s.r,
      danger: 1,
      sourceKind: 'boss_tempest',
    });
  }
  if (
    boss.state === 'arc_telegraph' ||
    boss.state === 'arc_fire' ||
    boss.state === 'supercell_telegraph' ||
    boss.state === 'supercell_fire'
  ) {
    const active = boss.state === 'arc_fire' || boss.state === 'supercell_fire';
    const prog = active
      ? boss.stateTick > 32
        ? clamp(Math.round(((38 - boss.stateTick) / 6) * 255), 45, 255)
        : 255
      : clamp(Math.round((boss.stateTick / Math.max(1, BOSS_TEMPEST_CFG.arcBeamTelegraphTicks)) * 255), 0, 255);
    boss.beamAngles.forEach((ang, idx) => {
      const x2 = boss.x + Math.cos(ang) * BOSS_TEMPEST_CFG.arcBeamLength;
      const y2 = boss.y + Math.sin(ang) * BOSS_TEMPEST_CFG.arcBeamLength;
      outTel.push({
        id: boss.id * 100 + 50 + idx,
        kind: 0,
        shape: 'line',
        phase: active || boss.stateTick > 16 ? 1 : 0,
        color: 2,
        prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(x2),
        y1: Math.round(y2),
        r: BOSS_TEMPEST_CFG.arcBeamHalfW,
        halfW: BOSS_TEMPEST_CFG.arcBeamHalfW,
        active,
        danger: 1,
        sourceKind: 'boss_tempest',
      });
    });
  }
  boss.telegraphs = outTel;
}

export function toTempestBossFrame(boss: TempestBossState, mini = false): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive || boss.hp <= 0) state = BANSUNG_STATE_DEAD;
  else if (boss.stunTicks > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state === 'patrol') state = Math.hypot(boss.vx, boss.vy) > 4 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
  else state = BANSUNG_STATE_ATK;

  return {
    id: boss.id,
    kind: 'boss_tempest',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    hpBars: getBossHpBars('boss_tempest', mini),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph: boss.telegraphs.length > 0 ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100)) : 0,
    telegraphs: boss.telegraphs,
    unlockedSkills: boss.unlockedSkillList.length > 0 ? [...boss.unlockedSkillList] : undefined,
    title: 'Chúa Tể Bão Tố',
    subtitle: 'BOSS V · ×6 THANH MÁU · PHÁ CÁNH & VƯƠNG MIỆN ĐỂ CHOÁNG',
    tier: 3,
  };
}
