/**
 * Boss 9: Lôi Thần Bão Sét (`boss_storm_herald`) — x8 multi-bar Twin-Volt Storm Boss.
 *
 * Strictly casts ONLY Yellow Lightning Storms (`Bão Sét Vàng`, color `5` / `storm_yellow`)
 * and Blue Lightning Storms (`Bão Sét Xanh`, color `2` / `storm_blue`).
 * Never fires bullet projectiles, lasers, or non-storm minion spawns.
 *
 * Skills:
 *  - `yellow_storm_windup`: Targeted golden thunder strikes -> bursts + lingering yellow storm fields
 *  - `blue_storm_windup`: Sweeping/ring azure storm vortices -> bursts + electric slow + lingering blue storm fields
 *  - `twin_storm_windup`: Synchronized alternating yellow + blue dual lightning storms
 * Enraged skills unlocked as destructible condensers & crown break:
 *  - `golden_tempest_overload`, `azure_storm_vortex`, `dual_storm_cataclysm`
 * Đêm Zombie v2 (spec 007 · B4b) — vẫn KHÔNG bắn đạn, chỉ sét vàng/xanh:
 *  - `thunder_lance_windup` (Thunder Lance): khoá 1–3 tia sét thẳng vào người chơi, giáng sét
 *    dọc tia, sét nhảy chuỗi sang đồng đội đứng gần, để lại 2 vũng bão xanh dọc đường sét.
 *  - `volt_carousel` (Volt Carousel, chỉ pha 2): 8 tia sét vàng/xanh xoay vòng tăng tốc kiểu
 *    Chicken Invaders + sét giáng xuống vị trí người chơi.
 */
import {
  BANSUNG_ENEMIES,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
  BANSUNG_FX_BLAST_STORM_YELLOW,
  BANSUNG_FX_BLAST_THUNDER_STORM,
  BANSUNG_STATE_ATK,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_IDLE,
  BANSUNG_STATE_RUN,
  BANSUNG_STATE_STUN,
  BANSUNG_TICK_EXACT_MS,
  BANSUNG_TICK_HZ,
  BOSS_STORM_HERALD_CFG,
  FX_BEAM,
  FX_BLAST,
  getBossHpBars,
  type BansungBossFrame,
  type BansungHazard,
  type BansungTelegraph,
  type BansungUnitState,
} from '../../../../shared/src';
import { applyBansungDamage, type BansungCombatTarget, type BansungDamageContext } from './damage';
import { resolveZombieSkillTune, zombieFirstUseTicks, type ZombieSkillTune } from './boss-zombie-skills';

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export type StormColorVariant = 'yellow' | 'blue';

export type StormHeraldBossFSMState =
  | 'patrol'
  | 'stunned'
  | 'yellow_storm_windup'
  | 'blue_storm_windup'
  | 'twin_storm_windup'
  | 'thunder_lance_windup'
  | 'volt_carousel'
  | 'dead';

export interface PendingLightningStormStrike {
  id: number;
  variant: StormColorVariant;
  x: number;
  y: number;
  r: number;
  ticksLeft: number;
  maxTicks: number;
  burstDmg: number;
  hazardDps: number;
  hazardTtlTicks: number;
  label: string;
}

export interface ActiveLightningStormHazard {
  id: number;
  variant: StormColorVariant;
  kind: 'storm_yellow' | 'storm_blue';
  x: number;
  y: number;
  r: number;
  ttlTicks: number;
  dps: number;
  tickCd: number;
}

export interface StormHeraldPlayerTarget extends BansungCombatTarget {
  id: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  radius: number;
  alive: boolean;
  downed?: boolean;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
}

export interface StormLightningBeamRay {
  variant: StormColorVariant;
  angle: number;
  spinVel: number;
  active: boolean;
  prog: number;
}

/** Đêm Zombie v2: tia sét thẳng (Thunder Lance) bắn từ boss vào người chơi. */
export interface StormThunderLance {
  angle: number;
  len: number;
}

export interface StormHeraldBossState {
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
  state: StormHeraldBossFSMState;
  stateTick: number;
  stunTicks: number;
  patternIdx: number;
  actionCdTicks: number;
  unlockedSkills: Set<string>;
  unlockedSkillList: string[];
  queuedEnragedSkills: string[];
  seq: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  strikes: PendingLightningStormStrike[];
  activeStorms: ActiveLightningStormHazard[];
  stormBeams?: StormLightningBeamRay[];
  lances?: StormThunderLance[];
  /** Spec 007 · B4c: hệ số độ khó cho skill mới (sát thương đã nhân sẵn qua ctx.dmgMult). */
  skillTune: ZombieSkillTune;
  /** Số tick giao tranh — Thunder Lance / Volt Carousel chỉ mở sau `zombieFirstUseTicks`. */
  skillClockTicks: number;
  telegraphs: BansungTelegraph[];
  combatTarget: BansungCombatTarget;
}

export interface StormHeraldStepContext {
  tickNo: number;
  players: readonly StormHeraldPlayerTarget[];
  dmgMult: number;
  damageCtx: BansungDamageContext;
  onSfx?: (sfx: string, x: number, y: number) => void;
  fx?: number[];
}

interface StormVariantStyle {
  telegraphColor: 2 | 5;
  hazardKind: 'storm_yellow' | 'storm_blue';
  beamKind: number;
  blastKind: number;
  slowPct: number;
  slowMs: number;
  label: string;
}

const STORM_VARIANT_STYLE: Readonly<Record<StormColorVariant, StormVariantStyle>> = {
  yellow: {
    telegraphColor: 5,
    hazardKind: 'storm_yellow',
    beamKind: BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
    blastKind: BANSUNG_FX_BLAST_STORM_YELLOW,
    slowPct: 0.16,
    slowMs: 700,
    label: 'BÃO SÉT VÀNG',
  },
  blue: {
    telegraphColor: 2,
    hazardKind: 'storm_blue',
    beamKind: BANSUNG_FX_BEAM_SHOCK,
    blastKind: BANSUNG_FX_BLAST_THUNDER_STORM,
    slowPct: 0.34,
    slowMs: 1150,
    label: 'BÃO SÉT XANH',
  },
};

const AIM_QUANT_MAX = 255;
const TWO_PI = Math.PI * 2;
const MAX_ACTIVE_STORMS = 8;
const STORM_BEAM_LENGTH = 680;
const STORM_BEAM_HALF_W = 16;
const LANCE_WINDUP_TICKS = 20;
const LANCE_TOTAL_TICKS = 32;
const LANCE_HALF_W = 14;
const LANCE_CHAIN_RANGE = 240;
const CAROUSEL_WINDUP_TICKS = 16;
const CAROUSEL_TOTAL_TICKS = 70;

/** Độ dày skill theo độ khó, kẹp trong [min, max]. */
function tunedCount(boss: StormHeraldBossState, base: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(base * boss.skillTune.density)));
}

/** Telegraph Thunder Lance ngắn hơn ở độ khó cao (đạn/sét nhanh hơn), tối thiểu 14 tick (~0.47 s). */
function lanceWindupTicks(boss: StormHeraldBossState): number {
  return Math.max(14, Math.round(LANCE_WINDUP_TICKS / boss.skillTune.speed));
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

function quantizeAim8(rad: number): number {
  let n = rad % TWO_PI;
  if (n < 0) n += TWO_PI;
  return clamp(Math.round((n / TWO_PI) * AIM_QUANT_MAX), 0, AIM_QUANT_MAX);
}

function nextId(boss: StormHeraldBossState): number {
  boss.seq = (boss.seq + 1) | 0;
  return boss.id * 1000 + (boss.seq & 1023);
}

function clampArena(boss: StormHeraldBossState, x: number, y: number, pad = 70): { x: number; y: number } {
  return {
    x: clamp(x, boss.arenaBounds.minX + pad, boss.arenaBounds.maxX - pad),
    y: clamp(y, boss.arenaBounds.minY + pad, boss.arenaBounds.maxY - pad),
  };
}

function findNearestAlivePlayer(
  boss: StormHeraldBossState,
  players: readonly StormHeraldPlayerTarget[],
): StormHeraldPlayerTarget | undefined {
  let best: StormHeraldPlayerTarget | undefined;
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

/** Creates a `boss_storm_herald` instance anchored inside `arenaBounds`. */
export function createStormHeraldBoss(opts: {
  id: number;
  x: number;
  y: number;
  hpMult?: number;
  radiusScale?: number;
  arenaBounds: { minX: number; minY: number; maxX: number; maxY: number };
  difficulty?: string;
}): StormHeraldBossState {
  const spec = BANSUNG_ENEMIES.boss_storm_herald;
  const maxHp = Math.max(1200, Math.round(BOSS_STORM_HERALD_CFG.baseHp * (opts.hpMult ?? 1)));
  const scaledRadius = Math.max(
    24,
    Math.round(BOSS_STORM_HERALD_CFG.radius * clamp(opts.radiusScale ?? 1, 0.45, 2.0)),
  );
  const idStr = `boss_storm_herald_${opts.id}`;
  const combatTarget: BansungCombatTarget = {
    id: idStr,
    numId: opts.id,
    x: opts.x,
    y: opts.y,
    tier: 'boss',
    armorType: spec.armorType,
    flatArmor: BOSS_STORM_HERALD_CFG.armor,
    damageReduction: BOSS_STORM_HERALD_CFG.baseDr,
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
    armor: BOSS_STORM_HERALD_CFG.armor,
    phase: 1,
    alive: true,
    aimRad: 0,
    state: 'patrol',
    stateTick: 0,
    stunTicks: 0,
    patternIdx: 0,
    actionCdTicks: 24,
    unlockedSkills: new Set<string>(),
    unlockedSkillList: [],
    queuedEnragedSkills: [],
    seq: 0,
    arenaBounds: { ...opts.arenaBounds },
    strikes: [],
    activeStorms: [],
    skillTune: resolveZombieSkillTune(opts.difficulty),
    skillClockTicks: 0,
    telegraphs: [],
    combatTarget,
  };
}

/** Stuns Lôi Thần Bão Sét when a destructible condenser/crown part breaks. */
export function stunStormHeraldBoss(
  boss: StormHeraldBossState,
  durationMs: number,
  unlockedSkill?: string,
): void {
  if (!boss.alive) return;
  const ticks = Math.max(18, Math.round(durationMs / BANSUNG_TICK_EXACT_MS));
  boss.stunTicks = Math.max(boss.stunTicks, ticks);
  boss.combatTarget.stunMs = Math.max(boss.combatTarget.stunMs ?? 0, durationMs);
  boss.combatTarget.damageReduction = 0;
  boss.combatTarget.flatArmor = Math.round(boss.armor * 0.4);
  boss.state = 'stunned';
  boss.stateTick = 0;
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

function applyStormStrikeDamage(
  boss: StormHeraldBossState,
  x: number,
  y: number,
  r: number,
  rawDmg: number,
  style: StormVariantStyle,
  ctx: StormHeraldStepContext,
): void {
  const scaledDmg = Math.max(1, Math.round(rawDmg * ctx.dmgMult));
  for (const p of ctx.players) {
    if (!p.alive || p.downed || p.hp <= 0) continue;
    const pr = r + (p.radius ?? 13);
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy <= pr * pr) {
      applyBansungDamage(
        p,
        {
          baseDmg: scaledDmg,
          dmgKind: 'energy',
          attackerId: boss.idStr,
        },
        ctx.damageCtx,
      );
      if (p.alive && !p.downed && style.slowPct > 0) {
        p.slowPct = Math.max(p.slowPct ?? 0, style.slowPct);
        p.slowMs = Math.max(p.slowMs ?? 0, style.slowMs);
      }
    }
  }
}

function detonateStormStrike(
  boss: StormHeraldBossState,
  strike: PendingLightningStormStrike,
  ctx: StormHeraldStepContext,
): void {
  const style = STORM_VARIANT_STYLE[strike.variant];
  const rx = Math.round(strike.x);
  const ry = Math.round(strike.y);
  // Sky-to-ground lightning bolt beam + colored storm blast (tuple: FX_BEAM, x0, y0, x1, y1, beamKind)
  ctx.fx?.push(FX_BEAM, rx, Math.max(0, ry - 260), rx, ry, style.beamKind);
  ctx.fx?.push(FX_BLAST, style.blastKind, rx, ry, Math.round(strike.r), boss.id);
  ctx.onSfx?.('sfx_wpn_tesla', strike.x, strike.y);

  applyStormStrikeDamage(boss, strike.x, strike.y, strike.r, strike.burstDmg, style, ctx);

  if (boss.activeStorms.length >= MAX_ACTIVE_STORMS) {
    boss.activeStorms.shift();
  }
  boss.activeStorms.push({
    id: strike.id,
    variant: strike.variant,
    kind: style.hazardKind,
    x: strike.x,
    y: strike.y,
    r: strike.r,
    ttlTicks: strike.hazardTtlTicks,
    dps: strike.hazardDps,
    tickCd: 10,
  });
}

function queueStormCell(
  boss: StormHeraldBossState,
  variant: StormColorVariant,
  rawX: number,
  rawY: number,
  delayTicks: number,
  radiusScale = 1,
): void {
  const pos = clampArena(boss, rawX, rawY, 64);
  const isYellow = variant === 'yellow';
  const baseR = isYellow ? BOSS_STORM_HERALD_CFG.yellowRadius : BOSS_STORM_HERALD_CFG.blueRadius;
  const r = Math.round(baseR * radiusScale);
  const warnTicks = isYellow
    ? BOSS_STORM_HERALD_CFG.yellowWarningTicks
    : BOSS_STORM_HERALD_CFG.blueWarningTicks;
  const burstDmg = isYellow
    ? BOSS_STORM_HERALD_CFG.yellowBurstDmg
    : BOSS_STORM_HERALD_CFG.blueBurstDmg;
  const hazardDps = isYellow
    ? BOSS_STORM_HERALD_CFG.yellowHazardDps
    : BOSS_STORM_HERALD_CFG.blueHazardDps;
  const hazardTtlMs = isYellow
    ? BOSS_STORM_HERALD_CFG.yellowHazardTtlMs
    : BOSS_STORM_HERALD_CFG.blueHazardTtlMs;
  const totalWait = Math.max(12, warnTicks + delayTicks);

  boss.strikes.push({
    id: nextId(boss),
    variant,
    x: pos.x,
    y: pos.y,
    r,
    ticksLeft: totalWait,
    maxTicks: totalWait,
    burstDmg,
    hazardDps,
    hazardTtlTicks: Math.max(30, Math.round(hazardTtlMs / BANSUNG_TICK_EXACT_MS)),
    label: STORM_VARIANT_STYLE[variant].label,
  });
}

function enterStormSkill(boss: StormHeraldBossState, skillId: string): void {
  boss.stateTick = 0;
  if (skillId === 'golden_tempest_overload') {
    boss.state = 'yellow_storm_windup';
    return;
  }
  if (skillId === 'azure_storm_vortex') {
    boss.state = 'blue_storm_windup';
    return;
  }
  boss.state = 'twin_storm_windup';
}

function stepActiveStormHazards(boss: StormHeraldBossState, ctx: StormHeraldStepContext): void {
  for (let i = boss.activeStorms.length - 1; i >= 0; i--) {
    const h = boss.activeStorms[i];
    h.ttlTicks -= 1;
    h.tickCd -= 1;
    if (h.tickCd <= 0) {
      h.tickCd = 10; // ~3 shocks/sec inside lingering storm cloud
      const tickDmg = Math.max(2, Math.round(h.dps * (10 / BANSUNG_TICK_HZ)));
      applyStormStrikeDamage(boss, h.x, h.y, h.r, tickDmg, STORM_VARIANT_STYLE[h.variant], ctx);
    }
    if (h.ttlTicks <= 0) {
      boss.activeStorms.splice(i, 1);
    }
  }
}

function spawnYellowStormWave(boss: StormHeraldBossState, ctx: StormHeraldStepContext): void {
  const overloaded = boss.phase === 2 || boss.unlockedSkills.has('golden_tempest_overload');
  const count = BOSS_STORM_HERALD_CFG.yellowStormCount + (overloaded ? 2 : 0);
  const aliveTargets = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
  const rScale = overloaded ? 1.08 : 1.0;
  const ringCount = Math.max(1, count - 1);
  const ringR = Math.max(162, BOSS_STORM_HERALD_CFG.yellowRadius * 2.38);

  for (let k = 0; k < count; k++) {
    const p = aliveTargets[k % Math.max(1, aliveTargets.length)];
    const anchorX = p ? p.x + (p.vx ?? 0) * 0.25 : boss.x + Math.cos(boss.aimRad) * 180;
    const anchorY = p ? p.y + (p.vy ?? 0) * 0.25 : boss.y + Math.sin(boss.aimRad) * 180;
    const ang = boss.aimRad + ((k - 1) / ringCount) * TWO_PI + (ctx.tickNo % 7) * 0.08;
    const offR = k === 0 ? 0 : ringR;
    queueStormCell(
      boss,
      'yellow',
      anchorX + Math.cos(ang) * offR,
      anchorY + Math.sin(ang) * offR,
      k * 3,
      rScale,
    );
  }
}

function spawnBlueStormWave(
  boss: StormHeraldBossState,
  target: StormHeraldPlayerTarget | undefined,
  ctx: StormHeraldStepContext,
): void {
  const vortexed = boss.phase === 2 || boss.unlockedSkills.has('azure_storm_vortex');
  const count = BOSS_STORM_HERALD_CFG.blueStormCount + (vortexed ? 2 : 0);
  const anchorX = target ? (boss.x * 0.35 + target.x * 0.65) : boss.x;
  const anchorY = target ? (boss.y * 0.35 + target.y * 0.65) : boss.y;
  const ringR = Math.max(164, BOSS_STORM_HERALD_CFG.blueRadius * 2.38);
  const ringCount = Math.max(1, count - 1);
  const baseAng = boss.aimRad + (ctx.tickNo % 12) * 0.12;
  const rScale = vortexed ? 1.08 : 1.0;

  for (let k = 0; k < count; k++) {
    const ang = baseAng + ((k - 1) / ringCount) * TWO_PI;
    const spread = k === 0 ? 0 : ringR;
    queueStormCell(
      boss,
      'blue',
      anchorX + Math.cos(ang) * spread,
      anchorY + Math.sin(ang) * spread,
      k * 3,
      rScale,
    );
  }
}

function spawnTwinStormWave(
  boss: StormHeraldBossState,
  target: StormHeraldPlayerTarget | undefined,
  ctx: StormHeraldStepContext,
): void {
  const cataclysm = boss.phase === 2 || boss.unlockedSkills.has('dual_storm_cataclysm');
  const pairs = cataclysm ? 4 : 3;
  const cx = target ? target.x : boss.x + Math.cos(boss.aimRad) * 170;
  const cy = target ? target.y : boss.y + Math.sin(boss.aimRad) * 170;
  const baseAng = boss.aimRad + ctx.tickNo * 0.05;
  const radY = Math.max(154, BOSS_STORM_HERALD_CFG.yellowRadius * 2.3);
  const radB = Math.max(208, BOSS_STORM_HERALD_CFG.blueRadius * 2.95);

  for (let i = 0; i < pairs; i++) {
    const angY = baseAng + (i / pairs) * TWO_PI;
    const angB = angY + Math.PI / pairs;
    queueStormCell(
      boss,
      'yellow',
      cx + Math.cos(angY) * (i === 0 ? 0 : radY),
      cy + Math.sin(angY) * (i === 0 ? 0 : radY),
      i * 3,
      cataclysm ? 1.08 : 1,
    );
    queueStormCell(
      boss,
      'blue',
      cx + Math.cos(angB) * radB,
      cy + Math.sin(angB) * radB,
      i * 3 + 2,
      cataclysm ? 1.08 : 1,
    );
  }
}

function stepStormLightningBeams(
  boss: StormHeraldBossState,
  windupTicks: number,
  totalTicks: number,
  ctx: StormHeraldStepContext,
): void {
  const rays = boss.stormBeams;
  if (!rays || rays.length === 0) return;
  const isActive = boss.stateTick > windupTicks;
  const prog = isActive
    ? boss.stateTick > totalTicks - 5
      ? clamp(Math.round(((totalTicks - boss.stateTick) / 5) * 255), 45, 255)
      : 255
    : clamp(Math.round((boss.stateTick / Math.max(1, windupTicks)) * 255), 0, 255);

  if (boss.stateTick === windupTicks + 1) {
    ctx.onSfx?.('sfx_wpn_tesla', boss.x, boss.y);
  }

  const emitFx = isActive && (boss.stateTick === windupTicks + 1 || boss.stateTick % 2 === 0);
  const dealTickDmg = isActive && (boss.stateTick === windupTicks + 1 || boss.stateTick % 5 === 0);

  for (const ray of rays) {
    ray.active = isActive;
    ray.prog = prog;
    if (isActive) {
      ray.angle += ray.spinVel;
    }
    const x2 = boss.x + Math.cos(ray.angle) * STORM_BEAM_LENGTH;
    const y2 = boss.y + Math.sin(ray.angle) * STORM_BEAM_LENGTH;
    const style = STORM_VARIANT_STYLE[ray.variant];
    if (emitFx) {
      ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), style.beamKind);
    }
    if (dealTickDmg) {
      const baseBeamDmg =
        ray.variant === 'yellow' ? BOSS_STORM_HERALD_CFG.yellowBurstDmg : BOSS_STORM_HERALD_CFG.blueBurstDmg;
      const scaledDmg = Math.max(1, Math.round(baseBeamDmg * 0.34 * ctx.dmgMult));
      for (const p of ctx.players) {
        if (!p.alive || p.downed || p.hp <= 0) continue;
        const hitR = STORM_BEAM_HALF_W + (p.radius ?? 13);
        if (distSqPointSegment(p.x, p.y, boss.x, boss.y, x2, y2) <= hitR * hitR) {
          applyBansungDamage(
            p,
            {
              baseDmg: scaledDmg,
              dmgKind: 'energy',
              attackerId: boss.idStr,
            },
            ctx.damageCtx,
          );
          if (p.alive && !p.downed && style.slowPct > 0) {
            p.slowPct = Math.max(p.slowPct ?? 0, style.slowPct);
            p.slowMs = Math.max(p.slowMs ?? 0, style.slowMs);
          }
        }
      }
    }
  }
}

/** Thunder Lance: khoá tia sét thẳng vào tối đa 3 người chơi (hoặc quạt 3 tia quanh mục tiêu chính). */
function lockThunderLances(
  boss: StormHeraldBossState,
  target: StormHeraldPlayerTarget | undefined,
  ctx: StormHeraldStepContext,
): void {
  const alive = ctx.players.filter((p) => p.alive && !p.downed && p.hp > 0);
  const lances: StormThunderLance[] = [];
  const count = tunedCount(boss, boss.phase === 2 ? 3 : Math.min(3, Math.max(1, alive.length)), 1, 5);
  for (let k = 0; k < count; k++) {
    const p = alive[k];
    let ang: number;
    let dist: number;
    if (p) {
      ang = Math.atan2(p.y - boss.y, p.x - boss.x);
      dist = Math.hypot(p.x - boss.x, p.y - boss.y);
    } else {
      const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
      ang = base + (k - (count - 1) / 2) * 0.42;
      dist = target ? Math.hypot(target.x - boss.x, target.y - boss.y) : 420;
    }
    lances.push({ angle: ang, len: clamp(dist + 140, 360, 780) });
  }
  boss.lances = lances;
}

function strikeThunderLances(boss: StormHeraldBossState, ctx: StormHeraldStepContext): void {
  const lances = boss.lances;
  if (!lances || lances.length === 0) return;
  const yellow = STORM_VARIANT_STYLE.yellow;
  const blue = STORM_VARIANT_STYLE.blue;
  const baseDmg = Math.max(1, Math.round(BOSS_STORM_HERALD_CFG.yellowBurstDmg * 0.9 * ctx.dmgMult));
  const chainDmg = Math.max(1, Math.round(baseDmg * 0.6));
  const hit = new Set<string>();
  ctx.onSfx?.('sfx_wpn_tesla', boss.x, boss.y);
  for (const lance of lances) {
    const x2 = boss.x + Math.cos(lance.angle) * lance.len;
    const y2 = boss.y + Math.sin(lance.angle) * lance.len;
    // 2 tia chồng nhau cho cảm giác sét dày + 1 tia xanh lệch nhẹ
    ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), yellow.beamKind);
    ctx.fx?.push(FX_BEAM, Math.round(boss.x), Math.round(boss.y), Math.round(x2), Math.round(y2), yellow.beamKind);
    ctx.fx?.push(FX_BLAST, yellow.blastKind, Math.round(x2), Math.round(y2), 46, boss.id);
    for (const p of ctx.players) {
      if (!p.alive || p.downed || p.hp <= 0 || hit.has(p.id)) continue;
      const hitR = LANCE_HALF_W + (p.radius ?? 13);
      if (distSqPointSegment(p.x, p.y, boss.x, boss.y, x2, y2) > hitR * hitR) continue;
      hit.add(p.id);
      applyBansungDamage(p, { baseDmg, dmgKind: 'energy', attackerId: boss.idStr }, ctx.damageCtx);
      if (p.alive && !p.downed) {
        p.slowPct = Math.max(p.slowPct ?? 0, yellow.slowPct);
        p.slowMs = Math.max(p.slowMs ?? 0, yellow.slowMs);
      }
      // Sét nhảy chuỗi sang đồng đội đứng gần (≤ 240px)
      let best: StormHeraldPlayerTarget | undefined;
      let bestD2 = LANCE_CHAIN_RANGE * LANCE_CHAIN_RANGE;
      for (const q of ctx.players) {
        if (q === p || hit.has(q.id) || !q.alive || q.downed || q.hp <= 0) continue;
        const d2 = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y);
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = q;
        }
      }
      if (best) {
        hit.add(best.id);
        ctx.fx?.push(FX_BEAM, Math.round(p.x), Math.round(p.y), Math.round(best.x), Math.round(best.y), blue.beamKind);
        applyBansungDamage(best, { baseDmg: chainDmg, dmgKind: 'energy', attackerId: boss.idStr }, ctx.damageCtx);
        if (best.alive && !best.downed) {
          best.slowPct = Math.max(best.slowPct ?? 0, blue.slowPct);
          best.slowMs = Math.max(best.slowMs ?? 0, blue.slowMs);
        }
      }
    }
    // Đường sét để lại 2 vũng bão xanh nhỏ (có telegraph xanh như mọi bão khác)
    for (const u of [0.45, 0.85]) {
      queueStormCell(
        boss,
        'blue',
        boss.x + Math.cos(lance.angle) * lance.len * u,
        boss.y + Math.sin(lance.angle) * lance.len * u,
        0,
        0.7,
      );
    }
  }
}

/** Advances `boss_storm_herald` for 1 authoritative tick (`1 / 30s`). */
export function stepStormHeraldBoss(boss: StormHeraldBossState, ctx: StormHeraldStepContext): void {
  if (boss.combatTarget.hp < boss.hp) {
    boss.hp = Math.max(0, boss.combatTarget.hp);
  }
  if (!boss.alive || boss.hp <= 0 || !boss.combatTarget.alive) {
    boss.alive = false;
    boss.hp = 0;
    boss.state = 'dead';
    boss.telegraphs = [];
    boss.strikes = [];
    boss.activeStorms = [];
    return;
  }
  boss.combatTarget.x = boss.x;
  boss.combatTarget.y = boss.y;
  boss.combatTarget.hp = boss.hp;
  boss.combatTarget.maxHp = boss.maxHp;
  boss.skillClockTicks += 1;

  if (boss.phase === 1 && boss.hp <= boss.maxHp * BOSS_STORM_HERALD_CFG.phase2Ratio) {
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
  stepActiveStormHazards(boss, ctx);

  const target = findNearestAlivePlayer(boss, ctx.players);

  if (boss.stunTicks > 0 || boss.state === 'stunned') {
    boss.stunTicks = Math.max(0, boss.stunTicks - 1);
    boss.vx = 0;
    boss.vy = 0;
    boss.stormBeams = undefined;
    boss.lances = undefined;
    boss.stateTick += 1;
    if (boss.stunTicks <= 0) {
      boss.combatTarget.stunMs = 0;
      boss.combatTarget.damageReduction = BOSS_STORM_HERALD_CFG.baseDr;
      boss.combatTarget.flatArmor = boss.armor;
      const queued = boss.queuedEnragedSkills.shift();
      if (queued) {
        enterStormSkill(boss, queued);
      } else {
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = 12;
      }
    }
    rebuildStormHeraldTelegraphs(boss);
    return;
  }

  if (target && boss.state === 'patrol') {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const dist = Math.hypot(dx, dy);
    boss.aimRad = Math.atan2(dy, dx);
    const speed = boss.phase === 2 ? BOSS_STORM_HERALD_CFG.speedP2 : BOSS_STORM_HERALD_CFG.speedP1;
    const desiredMove = dist > 280 ? 1 : dist < 160 ? -0.5 : 0.25;
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

  boss.stateTick += 1;

  switch (boss.state) {
    case 'patrol': {
      boss.stormBeams = undefined;
      if (boss.queuedEnragedSkills.length > 0) {
        enterStormSkill(boss, boss.queuedEnragedSkills.shift()!);
        break;
      }
      if (boss.actionCdTicks > 0) {
        boss.actionCdTicks -= 1;
        break;
      }
      // Đêm Zombie v2: thêm Thunder Lance (mọi pha) và Volt Carousel (pha 2) vào vòng xoay chiêu
      const rawPattern = boss.patternIdx % (boss.phase === 2 ? 5 : 4);
      // Skill mới chỉ mở sau thời điểm dùng lần đầu theo độ khó (Thường 20 s / Khó 15 s / Địa Ngục 10 s)
      const newSkillsReady = boss.skillClockTicks >= zombieFirstUseTicks(boss.skillTune);
      const nextPattern = rawPattern >= 3 && !newSkillsReady ? rawPattern % 3 : rawPattern;
      boss.patternIdx += 1;
      boss.stateTick = 0;
      if (nextPattern === 0) {
        boss.state = 'yellow_storm_windup';
      } else if (nextPattern === 1) {
        boss.state = 'blue_storm_windup';
      } else if (nextPattern === 2) {
        boss.state = 'twin_storm_windup';
      } else if (nextPattern === 3) {
        boss.state = 'thunder_lance_windup';
      } else {
        boss.state = 'volt_carousel';
      }
      break;
    }

    case 'yellow_storm_windup': {
      if (boss.stateTick === 1) {
        const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
        boss.stormBeams = [0, 1, 2, 3].map((k) => ({
          variant: 'yellow',
          angle: base + k * (Math.PI * 0.5) + 0.35,
          spinVel: 0.023,
          active: false,
          prog: 0,
        }));
      }
      if (boss.stateTick === 6) {
        spawnYellowStormWave(boss, ctx);
      }
      stepStormLightningBeams(boss, 14, 34, ctx);
      if (boss.stateTick >= 34) {
        boss.stormBeams = undefined;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 18 : 22;
      }
      break;
    }

    case 'blue_storm_windup': {
      if (boss.stateTick === 1) {
        const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
        boss.stormBeams = [0, 1, 2].map((k) => ({
          variant: 'blue',
          angle: base + (k / 3) * TWO_PI,
          spinVel: -0.025,
          active: false,
          prog: 0,
        }));
      }
      if (boss.stateTick === 6) {
        spawnBlueStormWave(boss, target, ctx);
      }
      stepStormLightningBeams(boss, 14, 34, ctx);
      if (boss.stateTick >= 34) {
        boss.stormBeams = undefined;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 18 : 22;
      }
      break;
    }

    case 'twin_storm_windup': {
      if (boss.stateTick === 1) {
        const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
        boss.stormBeams = [
          { variant: 'yellow', angle: base - 0.58, spinVel: 0.021, active: false, prog: 0 },
          { variant: 'yellow', angle: base + Math.PI - 0.58, spinVel: 0.021, active: false, prog: 0 },
          { variant: 'blue', angle: base + 0.58, spinVel: -0.021, active: false, prog: 0 },
          { variant: 'blue', angle: base + Math.PI + 0.58, spinVel: -0.021, active: false, prog: 0 },
        ];
      }
      if (boss.stateTick === 6) {
        spawnTwinStormWave(boss, target, ctx);
      }
      stepStormLightningBeams(boss, 15, 38, ctx);
      if (boss.stateTick >= 38) {
        boss.stormBeams = undefined;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = boss.phase === 2 ? 20 : 26;
      }
      break;
    }

    case 'thunder_lance_windup': {
      if (boss.stateTick === 1) {
        lockThunderLances(boss, target, ctx);
        ctx.onSfx?.('sfx_wpn_laser', boss.x, boss.y);
      }
      const lanceWindup = lanceWindupTicks(boss);
      if (boss.stateTick === lanceWindup) {
        strikeThunderLances(boss, ctx);
      }
      if (boss.stateTick >= lanceWindup + (LANCE_TOTAL_TICKS - LANCE_WINDUP_TICKS)) {
        boss.lances = undefined;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = Math.round((boss.phase === 2 ? 20 : 24) * boss.skillTune.cd);
      }
      break;
    }

    case 'volt_carousel': {
      if (boss.stateTick === 1) {
        const base = target ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.aimRad;
        const dir = (boss.patternIdx & 1) === 0 ? 1 : -1;
        // Số tia theo độ khó: Thường 8 · Khó 10 · Địa Ngục 12 (luôn chẵn để xen kẽ vàng/xanh)
        const rayCount = 2 * tunedCount(boss, 4, 3, 6);
        boss.stormBeams = [];
        for (let k = 0; k < rayCount; k++) {
          boss.stormBeams.push({
            variant: (k & 1) === 0 ? 'yellow' : 'blue',
            angle: base + (k / rayCount) * TWO_PI,
            spinVel: dir * 0.012 * boss.skillTune.spin,
            active: false,
            prog: 0,
          });
        }
      }
      // Xoay tăng tốc dần như vòng đạn Chicken Invaders
      if (boss.stormBeams && boss.stateTick > CAROUSEL_WINDUP_TICKS) {
        const k = clamp((boss.stateTick - CAROUSEL_WINDUP_TICKS) / 50, 0, 1);
        for (const ray of boss.stormBeams) {
          const sign = ray.spinVel >= 0 ? 1 : -1;
          ray.spinVel = sign * (0.012 + 0.03 * k) * boss.skillTune.spin;
        }
      }
      if (boss.stateTick === 30 || boss.stateTick === 50 || (boss.stateTick === 40 && boss.skillTune.density >= 1.25)) {
        for (const p of ctx.players) {
          if (!p.alive || p.downed || p.hp <= 0) continue;
          queueStormCell(boss, 'yellow', p.x + (p.vx ?? 0) * 0.3, p.y + (p.vy ?? 0) * 0.3, 0, 0.85);
        }
      }
      stepStormLightningBeams(boss, CAROUSEL_WINDUP_TICKS, CAROUSEL_TOTAL_TICKS, ctx);
      if (boss.stateTick >= CAROUSEL_TOTAL_TICKS) {
        boss.stormBeams = undefined;
        boss.state = 'patrol';
        boss.stateTick = 0;
        boss.actionCdTicks = Math.round(26 * boss.skillTune.cd);
      }
      break;
    }

    default:
      break;
  }

  rebuildStormHeraldTelegraphs(boss);
}

function rebuildStormHeraldTelegraphs(boss: StormHeraldBossState): void {
  const outTel: BansungTelegraph[] = [];
  for (const s of boss.strikes) {
    const prog = clamp(
      Math.round(((s.maxTicks - s.ticksLeft) / Math.max(1, s.maxTicks)) * 255),
      0,
      255,
    );
    outTel.push({
      id: s.id,
      kind: 1,
      shape: 'circle',
      phase: s.ticksLeft <= 12 ? 1 : 0,
      color: STORM_VARIANT_STYLE[s.variant].telegraphColor,
      prog,
      x0: Math.round(boss.x),
      y0: Math.round(boss.y),
      x1: Math.round(s.x),
      y1: Math.round(s.y),
      r: s.r,
      danger: 1,
      sourceKind: 'boss_storm_herald',
    });
  }
  if (boss.lances && boss.lances.length > 0 && boss.state === 'thunder_lance_windup') {
    const lanceWindup = lanceWindupTicks(boss);
    const locked = boss.stateTick >= lanceWindup;
    const prog = locked ? 255 : clamp(Math.round((boss.stateTick / lanceWindup) * 255), 0, 255);
    boss.lances.forEach((lance, idx) => {
      outTel.push({
        id: boss.id * 100 + 60 + idx,
        kind: 0,
        shape: 'line',
        phase: prog >= 180 ? 1 : 0,
        color: STORM_VARIANT_STYLE.yellow.telegraphColor,
        prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(boss.x + Math.cos(lance.angle) * lance.len),
        y1: Math.round(boss.y + Math.sin(lance.angle) * lance.len),
        r: LANCE_HALF_W,
        halfW: LANCE_HALF_W,
        active: locked,
        danger: 1,
        ...(idx === 0 ? { label: 'THUNDER LANCE' } : {}),
        sourceKind: 'boss_storm_herald',
      });
    });
  }
  if (boss.stormBeams && boss.stormBeams.length > 0) {
    boss.stormBeams.forEach((ray, idx) => {
      const x2 = boss.x + Math.cos(ray.angle) * STORM_BEAM_LENGTH;
      const y2 = boss.y + Math.sin(ray.angle) * STORM_BEAM_LENGTH;
      outTel.push({
        id: boss.id * 100 + 70 + idx,
        kind: 0,
        shape: 'line',
        phase: ray.active || ray.prog >= 180 ? 1 : 0,
        color: STORM_VARIANT_STYLE[ray.variant].telegraphColor,
        prog: ray.prog,
        x0: Math.round(boss.x),
        y0: Math.round(boss.y),
        x1: Math.round(x2),
        y1: Math.round(y2),
        r: STORM_BEAM_HALF_W,
        halfW: STORM_BEAM_HALF_W,
        active: ray.active,
        danger: 1,
        sourceKind: 'boss_storm_herald',
      });
    });
  }
  boss.telegraphs = outTel;
}

/** Exports active yellow & blue lightning storm ground zones for snapshot transmission. */
export function getStormHeraldHazards(boss: StormHeraldBossState): BansungHazard[] {
  if (!boss.alive || boss.activeStorms.length === 0) return [];
  return boss.activeStorms.map((h) => ({
    id: h.id,
    kind: h.kind,
    x: Math.round(h.x),
    y: Math.round(h.y),
    r: h.r,
    ttlTicks: h.ttlTicks,
  }));
}

/** Serializes `boss_storm_herald` into the network `BansungBossFrame`. */
export function toStormHeraldBossFrame(
  boss: StormHeraldBossState,
  mini = false,
): BansungBossFrame {
  let state: BansungUnitState = BANSUNG_STATE_IDLE;
  if (!boss.alive) state = BANSUNG_STATE_DEAD;
  else if (boss.stunTicks > 0 || boss.state === 'stunned') state = BANSUNG_STATE_STUN;
  else if (boss.state !== 'patrol') state = BANSUNG_STATE_ATK;
  else if (Math.hypot(boss.vx, boss.vy) > 8) state = BANSUNG_STATE_RUN;

  return {
    id: boss.id,
    kind: 'boss_storm_herald',
    x: Math.round(boss.x),
    y: Math.round(boss.y),
    hp: Math.round(boss.hp),
    maxHp: Math.round(boss.maxHp),
    hpBars: getBossHpBars('boss_storm_herald', mini),
    phase: boss.phase,
    state,
    aimQ: quantizeAim8(boss.aimRad),
    telegraph:
      boss.telegraphs.length > 0
        ? Math.min(100, Math.round((boss.telegraphs[0].prog / 255) * 100))
        : 0,
    telegraphs: boss.telegraphs,
    unlockedSkills: boss.unlockedSkillList.length > 0 ? [...boss.unlockedSkillList] : undefined,
    title: 'Volt Twins',
    subtitle: 'BÃO SÉT VÀNG & BÃO SÉT XANH · ×8 THANH MÁU',
    tier: 4,
  };
}
