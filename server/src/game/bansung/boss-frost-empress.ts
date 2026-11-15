/**
 * Boss 7: Nữ Hoàng Băng Tuyết (`boss_frost_empress`) — 7x multi-bar cryo sovereign.
 *
 * Skills:
 *  - `icicle_windup`: targeted icicle rain circles with clear telegraph frames
 *  - `cyclone_fire`: rotating frost cyclone ring leaving open escape sectors
 *  - `cryo_telegraph` -> `cryo_fire`: long-range glacier laser beam (triple-fan on glacier_nova)
 *  - `summon`: summons frost/shield/magnet escorts (`permafrost_summon`)
 * Enraged skills unlocked as destructible scepter, crown & crystal wings break:
 *  - `blizzard_ring`, `glacier_nova`, `ice_shard_barrage`, `permafrost_summon`
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BLAST_FROST_SHATTER,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BOSS_FROST_EMPRESS_CFG,
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

export type FrostEmpressBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'icicle_windup'
  | 'cyclone_windup'
  | 'cyclone_fire'
  | 'cryo_telegraph'
  | 'cryo_fire'
  | 'glacier_telegraph'
  | 'glacier_fire'
  | 'summon'
  | 'dead';

export interface FrostIcicleHazard {
  id: number;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  dmg: number;
  label: string;
}

export interface FrostEmpressPlayerTarget extends BansungCombatTarget {
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

export interface FrostEmpressBulletSpawn {
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
}

export interface FrostEmpressBossState {
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
  state: FrostEmpressBossFSMState;
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
  icicles: FrostIcicleHazard[];
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface FrostEmpressStepContext {
  tickNo: number;
  players: readonly FrostEmpressPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSpawnBullet: (b: FrostEmpressBulletSpawn) => void;
  onSummon: (kinds: readonly BansungEnemyId[], cx: number, cy: number) => void;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

const CYCLONE_GAP_SET = new Set<number>(BOSS_FROST_EMPRESS_CFG.cycloneGapSectors);
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

function nextId(boss: FrostEmpressBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function findNearestAlivePlayer(
  boss: FrostEmpressBossState,
  players: readonly FrostEmpressPlayerTarget[],
): FrostEmpressPlayerTarget | undefined {
  let best: FrostEmpressPlayerTarget | undefined;
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

export function createFrostEmpressBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  radiusScale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
}): FrostEmpressBossState {
  const spec = BANSUNG_ENEMIES.boss_frost_empress;
  const maxHp = Math.max(1000, Math.round(BOSS_FROST_EMPRESS_CFG.baseHp * (opts.hpMult ?? 1)));
  const scaledRadius = Math.max(22, Math.round(BOSS_FROST_EMPRESS_CFG.radius * clamp(opts.radiusScale ?? 1, 0.45, 2.0)));
  const idStr = `boss_frost_empress_${opts.id}`;
  const combatTarget: BansungCombatTarget = {
    id: idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: BOSS_FROST_EMPRESS_CFG.armor,
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
    armor: BOSS_FROST_EMPRESS_CFG.armor,
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
    beamAngles: [0],
    beamFiredDamage: false,
    unlockedSkills: new Set<string>(),
    unlockedSkillList: [],
    queuedEnragedSkills: [],
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    icicles: [],
    telegraphs: [],
    combatTarget,
  };
}

export function stunFrostEmpressBoss(boss: FrostEmpressBossState, durationMs: number, unlockedSkill?: string): void {
  if (!boss.alive) return;
  const ticks = Math.max(18, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
  boss.stunTicks = Math.max(boss.stunTicks, ticks);
  boss.combatTarget.stunMs = Math.max(boss.combatTarget.stunMs ?? 0, durationMs);
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

function detonateIcicle(boss: FrostEmpressBossState, s: FrostIcicleHazard, ctx: FrostEmpressStepContext): void {
  ctx.fx?.push(FX_BLAST, BANSUNG_FX_BLAST_FROST_SHATTER, Math.round(s.x), Math.round(s.y), Math.round(s.r), boss.id);
  ctx.onSfx?.('fx_plasma_spark', s.x, s.y);
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
        p.slowPct = Math.max(p.slowPct ?? 0, 0.35);
        p.slowMs = Math.max(p.slowMs ?? 0, 1300);
      }
    }
  }
}

function enterFrostSkill(
  boss: FrostEmpressBossState,
  skillId: string,
  target: FrostEmpressPlayerTarget | undefined,
): void {
  if (skillId === 'blizzard_ring') {
    boss.state = 'cyclone_windup';
    boss.stateTick = 0;
    boss.ringWave = 0;
    boss.ringBaseAng = boss.aimRad;
    return;
  }
  if (skillId === 'glacier_nova') {
    boss.state = 'glacier_telegraph';
    boss.stateTick = 0;
    boss.beamFiredDamage = false;
    const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
    boss.beamAngles = [base - 0.38, base, base + 0.38];
    return;
  }
  if (skillId === 'permafrost_summon') {
    boss.state = 'summon';
    boss.stateTick = 0;
    return;
  }
  boss.state = 'icicle_windup';
  boss.stateTick = 0;
}

export function stepFrostEmpressBoss(boss: FrostEmpressBossState, ctx: FrostEmpressStepContext): void {
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

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_FROST_EMPRESS_CFG.phase2Ratio) {
    boss.phase = 2;
  }

  for (let i = boss.icicles.length - 1; i >= 0; i--) {
    const s = boss.icicles[i];
    s.ticksLeft -= 1;
    if (s.ticksLeft <= 0) {
      detonateIcicle(boss, s, ctx);
      boss.icicles.splice(i, 1);
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
      const queued = boss.queuedEnragedSkills.shift();
      if (queued) {
        enterFrostSkill(boss, queued, target);
      } else {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 12;
      }
    }
    rebuildFrostTelegraphs(boss);
    return;
  }

  if (target && boss.state === 'patrol') {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    boss.aimRad = Math.atan2(dy, dx);
    const speed = boss.phase === 2 ? BOSS_FROST_EMPRESS_CFG.speedP2 : BOSS_FROST_EMPRESS_CFG.speedP1;
    const desiredMove = dist > 270 ? 1 : dist < 155 ? -0.55 : 0.2;
    const nx = dist > 1e-3 ? dx / dist : 1;
    const ny = dist > 1e-3 ? dy / dist : 0;
    const strafe = Math.sin(ctx.tickNo * 0.06) * 0.85;
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
        enterFrostSkill(boss, queued, target);
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
      if (nextPattern === 0 || nextPattern === 3) {
        boss.state = 'icicle_windup';
      } else if (nextPattern === 1) {
        boss.state = 'cyclone_windup';
        boss.ringWave = 0;
        boss.ringBaseAng = boss.aimRad;
      } else {
        if (boss.unlockedSkills.has('glacier_nova')) {
          enterFrostSkill(boss, 'glacier_nova', target);
          break;
        }
        boss.state = 'cryo_telegraph';
        boss.beamFiredDamage = false;
        boss.beamAngles = [boss.aimRad];
      }
      boss.stateTick = 0;
      break;
    }

    case 'icicle_windup': {
      const hasBarrage = boss.unlockedSkills.has('ice_shard_barrage');
      const totalIcicles =
        BOSS_FROST_EMPRESS_CFG.icicleCount + (boss.phase === 2 ? 2 : 0) + (hasBarrage ? 3 : 0);
      if (boss.stateTick >= 6 && boss.stateTick % 5 === 1 && boss.icicles.length < totalIcicles) {
        const idx = boss.icicles.length;
        const alivePlayers = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
        const pick = alivePlayers.length > 0 ? alivePlayers[idx % alivePlayers.length] : target;
        const px = pick ? pick.x : boss.x + 190;
        const py = pick ? pick.y : boss.y;
        const ang = boss.aimRad + idx * 1.1;
        const offR = idx === 0 ? 12 : 88 + (idx % 3) * 44;
        boss.icicles.push({
          id: nextId(boss),
          x: clamp(px + Math.cos(ang) * offR, boss.arenaBounds.minX + 70, boss.arenaBounds.maxX - 70),
          y: clamp(py + Math.sin(ang) * offR, boss.arenaBounds.minY + 70, boss.arenaBounds.maxY - 70),
          r: BOSS_FROST_EMPRESS_CFG.icicleRadius,
          ticksLeft: BOSS_FROST_EMPRESS_CFG.icicleWarningTicks,
          maxTicks: BOSS_FROST_EMPRESS_CFG.icicleWarningTicks,
          dmg: BOSS_FROST_EMPRESS_CFG.icicleDmg,
          label: hasBarrage ? 'MƯA MẢNH BĂNG!' : 'DANGER · BĂNG GIÁ!',
        });
        ctx.onSfx?.('wpn_plasma_fire', boss.x, boss.y);
      }
      if (boss.stateTick >= 6 + totalIcicles * 5 + 10) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 22 : 32;
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
      const hasBlizz = boss.unlockedSkills.has('blizzard_ring');
      const maxWaves = (boss.phase === 2 ? 3 : 2) + (hasBlizz ? 1 : 0);
      if (boss.stateTick === 1 || (boss.stateTick % 12 === 1 && boss.ringWave < maxWaves)) {
        const sectors = BOSS_FROST_EMPRESS_CFG.cycloneBolts;
        const stepAng = TWO_PI / sectors;
        const waveOffset = boss.ringWave * 0.25;
        for (let s = 0; s < sectors; s++) {
          if (CYCLONE_GAP_SET.has(s)) continue;
          const ang = boss.ringBaseAng + waveOffset + s * stepAng;
          ctx.onSpawnBullet({
            kind: s % 2 === 0 ? 'plasma' : 'zap',
            x: boss.x + Math.cos(ang) * (boss.radius + 8),
            y: boss.y + Math.sin(ang) * (boss.radius + 8),
            vx: Math.cos(ang) * BOSS_FROST_EMPRESS_CFG.cycloneSpeed,
            vy: Math.sin(ang) * BOSS_FROST_EMPRESS_CFG.cycloneSpeed,
            r: 8,
            dmg: Math.round(BOSS_FROST_EMPRESS_CFG.cycloneDmg * ctx.dmgMult),
            dmgKind: 'energy',
            ttlTicks: 88,
            ownerId: boss.id,
          });
        }
        ctx.onSfx?.('wpn_plasma_fire', boss.x, boss.y);
        boss.ringWave += 1;
      }
      if (boss.ringWave >= maxWaves && boss.stateTick >= maxWaves * 12 + 8) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 24 : 34;
      }
      break;
    }

    case 'cryo_telegraph':
    case 'glacier_telegraph': {
      const isGlacier = boss.state === 'glacier_telegraph';
      if (boss.stateTick <= 14 && target) {
        const base = Math.atan2(target.y - boss.y, target.x - boss.x);
        boss.aimRad = base;
        boss.beamAngles = isGlacier ? [base - 0.38, base, base + 0.38] : [base];
      }
      if (boss.stateTick >= BOSS_FROST_EMPRESS_CFG.cryoBeamTelegraphTicks) {
        boss.state = isGlacier ? 'glacier_fire' : 'cryo_fire';
        boss.stateTick = 0;
        boss.beamFiredDamage = false;
      }
      break;
    }

    case 'cryo_fire':
    case 'glacier_fire': {
      if (!boss.beamFiredDamage) {
        boss.beamFiredDamage = true;
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
        for (const ang of boss.beamAngles) {
          const x2 = boss.x + Math.cos(ang) * BOSS_FROST_EMPRESS_CFG.cryoBeamLength;
          const y2 = boss.y + Math.sin(ang) * BOSS_FROST_EMPRESS_CFG.cryoBeamLength;
          ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), BANSUNG_FX_BEAM_LASER_MAP);
          for (const p of ctx.players) {
            if (!p.alive || p.downed || p.hp <= 0) continue;
            const hitR = BOSS_FROST_EMPRESS_CFG.cryoBeamHalfW + (p.radius ?? 13);
            if (distSqPointSegment(p.x, p.y, boss.x, boss.y, x2, y2) <= hitR * hitR) {
              applyBansungDamage(
                p,
                {
                  baseDmg: Math.round(BOSS_FROST_EMPRESS_CFG.cryoBeamDmg * ctx.dmgMult),
                  dmgKind: 'energy',
                  attackerId: boss.idStr,
                },
                ctx.damageCtx,
              );
              if (p.alive && !p.downed) {
                p.slowPct = Math.max(p.slowPct ?? 0, 0.32);
                p.slowMs = Math.max(p.slowMs ?? 0, 1200);
              }
            }
          }
        }
      }
      if (boss.stateTick >= 16) {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 24 : 34;
      }
      break;
    }

    case 'summon': {
      if (boss.stateTick === 12) {
        const hasPerm = boss.unlockedSkills.has('permafrost_summon');
        const kinds: BansungEnemyId[] =
          boss.phase === 2 || hasPerm
            ? ['frost_mage', 'mirror_knight', 'magnet_drone']
            : ['frost_mage', 'mirror_knight'];
        ctx.onSummon(kinds, boss.x, boss.y);
        boss.summonCdTicks = BOSS_FROST_EMPRESS_CFG.summonCooldownTicks;
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

  rebuildFrostTelegraphs(boss);
}

function rebuildFrostTelegraphs(boss: FrostEmpressBossState): void {
  const outTel: BansungTelegraph[] = [];
  for (const s of boss.icicles) {
    const prog = clamp(Math.round(((s.maxTicks - s.ticksLeft) / Math.max(1, s.maxTicks)) * 255), 0, 255);
    outTel.push({
      id: s.id,
      kind: 1,
      shape: 'circle',
      phase: s.ticksLeft <= 14 ? 1 : 0,
      color: 1,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(s.x),
      y1: Math.round(s.y),
      r: s.r,
      danger: 1,
      label: s.label,
      sourceKind: 'boss_frost_empress',
    });
  }
  if (
    boss.state === 'cryo_telegraph' ||
    boss.state === 'cryo_fire' ||
    boss.state === 'glacier_telegraph' ||
    boss.state === 'glacier_fire'
  ) {
    const active = boss.state === 'cryo_fire' || boss.state === 'glacier_fire';
    const prog = active
      ? 255
      : clamp(Math.round((boss.stateTick / Math.max(1, BOSS_FROST_EMPRESS_CFG.cryoBeamTelegraphTicks)) * 255), 0, 255);
    boss.beamAngles.forEach((ang, idx) => {
      const x2 = boss.x + Math.cos(ang) * BOSS_FROST_EMPRESS_CFG.cryoBeamLength;
      const y2 = boss.y + Math.sin(ang) * BOSS_FROST_EMPRESS_CFG.cryoBeamLength;
      outTel.push({
        id: boss.id * 100 + 60 + idx,
        kind: 0,
        shape: 'line',
        phase: active || boss.stateTick > 16 ? 1 : 0,
        color: 1,
        prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(x2),
        y1: Math.round(y2),
        r: BOSS_FROST_EMPRESS_CFG.cryoBeamHalfW,
        halfW: BOSS_FROST_EMPRESS_CFG.cryoBeamHalfW,
        active,
        danger: 1,
        label: active ? 'TIA BĂNG CỰC HÀN!' : 'DANGER · TIA BĂNG!',
        sourceKind: 'boss_frost_empress',
      });
    });
  }
  boss.telegraphs = outTel;
}

export function toFrostEmpressBossFrame(boss: FrostEmpressBossState, mini = false): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive || boss.hp <= 0) state = BANSUNG_STATE_DEAD;
  else if (boss.stunTicks > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state === 'patrol') state = Math.hypot(boss.vx, boss.vy) > 4 ? BANSUNG_STATE_RUN : BANSUNG_STATE_IDLE;
  else state = BANSUNG_STATE_ATK;

  return {
    id: boss.id,
    kind: 'boss_frost_empress',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    hpBars: getBossHpBars('boss_frost_empress', mini),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph: boss.telegraphs.length > 0 ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100)) : 0,
    telegraphs: boss.telegraphs,
    unlockedSkills: boss.unlockedSkillList.length > 0 ? [...boss.unlockedSkillList] : undefined,
    title: 'Nữ Hoàng Băng Tuyết',
    subtitle: 'BOSS VI · ×7 THANH MÁU · PHÁ QUYỀN TRƯỢNG & CÁNH ĐỂ CHOÁNG',
    tier: 4,
  };
}
