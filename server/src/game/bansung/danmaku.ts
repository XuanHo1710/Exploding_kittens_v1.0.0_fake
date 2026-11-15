/**
 * Authoritative Boss Danmaku Trajectory & Pattern Engine (`danmaku.ts`)
 *
 * Implements zero-GC bullet-hell kinematics inspired by:
 * - Touhou Project (Sakuya Pause-and-Snap Lances, Cirno "Perfect Freeze",
 *   Raiko/Byakuren Polar Rose-Curve Blooming Flowers, Suwako DNA Twin-Helix)
 * - Enter the Gungeon (Gorgun Counter-Rotating Crescent Spirals, Lich Star-Split Orbs)
 * - Soul Knight (Zulan / Varkolyn Splitting Cluster Orbs & Pinwheel Volleys)
 * - NieR: Automata (Alternating Hollow Ring + Fast Lance Curtains)
 */

import {
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_FROST_SHATTER,
  BANSUNG_PROJECTILE_CONFIGS,
  FX_BLAST,
  type BansungDanmakuPaletteId,
} from '../../../../shared/src';
import type { BansungDamageKind } from './damage';

export type DanmakuSilhouetteKind =
  | 'danmaku_orb'
  | 'danmaku_lance'
  | 'danmaku_star'
  | 'danmaku_crescent'
  | 'danmaku_ring';

export type DanmakuSnapMode = 'aim_nearest' | 'radial_out' | 'fixed_angle' | 'starburst';
export type DanmakuSplitMode = 'ring' | 'aimed_fan' | 'rose_flower';

export interface DanmakuMotionSpec {
  danmakuKind?: DanmakuSilhouetteKind;
  palette?: BansungDanmakuPaletteId;
  scaleTier?: 0 | 1 | 2 | 3;

  // Curved spiral / radial acceleration
  angVel?: number;
  angAccel?: number;
  accel?: number;
  minSpeed?: number;
  maxSpeed?: number;

  // Sakuya / Cirno Pause-and-Snap state machine
  pauseAfterTicks?: number;
  pauseDurationTicks?: number;
  snapMode?: DanmakuSnapMode;
  snapAngleOffset?: number;
  snapFixedAngle?: number;
  snapSpeed?: number;
  snapKind?: DanmakuSilhouetteKind;
  snapPalette?: BansungDanmakuPaletteId;
  pausePalette?: BansungDanmakuPaletteId;

  // Drift-free finite-difference sinusoidal / DNA-helix weave
  waveAmp?: number;
  waveFreq?: number;
  wavePhase?: number;

  // Mid-air cluster split
  splitAfterTicks?: number;
  splitMode?: DanmakuSplitMode;
  splitCount?: number;
  splitSpeed?: number;
  splitChildKind?: DanmakuSilhouetteKind;
  splitChildPalette?: BansungDanmakuPaletteId;
  splitChildDamage?: number;

  // Optional chill / slow on hit
  slowPct?: number;
  slowMs?: number;
}

export interface BossDanmakuProjectile extends DanmakuMotionSpec {
  id: number;
  kindId: number;
  ownerActorId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  dmgKind: BansungDamageKind;
  ttlTicks: number;
  armored: boolean;

  // Runtime kinematic state
  ageTicks: number;
  paused: boolean;
  pauseTicksLeft: number;
  visAngleRad: number;
  originX: number;
  originY: number;
  baseAxisRad: number;
  prevWaveOffset: number;
}

export interface BossDanmakuSpawnInput extends DanmakuMotionSpec {
  ownerActorId?: number;
  kindId?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  dmgKind: BansungDamageKind;
  ttlTicks: number;
  armored?: boolean;
}

export interface DanmakuTargetView {
  x: number;
  y: number;
}

const TWO_PI = Math.PI * 2;

export function resolveDanmakuKindId(
  danmakuKind: DanmakuSilhouetteKind | undefined,
  fallbackKindId: number,
): number {
  if (!danmakuKind) return fallbackKindId;
  return BANSUNG_PROJECTILE_CONFIGS[danmakuKind]?.kindId ?? fallbackKindId;
}

function wrapAngleRad(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  else if (r < -Math.PI) r += TWO_PI;
  return r;
}

function lerpAngleRad(from: number, to: number, t: number): number {
  const diff = wrapAngleRad(to - from);
  return wrapAngleRad(from + diff * t);
}

function nearestTarget(
  x: number,
  y: number,
  targets: readonly DanmakuTargetView[],
): DanmakuTargetView | null {
  let best: DanmakuTargetView | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dx = t.x - x;
    const dy = t.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = t;
    }
  }
  return best;
}

export function initBossDanmakuProjectile(
  id: number,
  ownerActorId: number,
  fallbackKindId: number,
  spec: BossDanmakuSpawnInput,
): BossDanmakuProjectile {
  const kindId = resolveDanmakuKindId(spec.danmakuKind, spec.kindId ?? fallbackKindId);
  const axis = Math.atan2(spec.vy, spec.vx);
  const initPhase = spec.wavePhase ?? 0;
  const initWave = spec.waveAmp ? spec.waveAmp * Math.sin(initPhase) : 0;
  return {
    ...spec,
    id,
    ownerActorId: spec.ownerActorId ?? ownerActorId,
    kindId,
    armored: Boolean(spec.armored),
    ageTicks: 0,
    paused: false,
    pauseTicksLeft: 0,
    visAngleRad: axis,
    originX: spec.x,
    originY: spec.y,
    baseAxisRad: axis,
    prevWaveOffset: initWave,
  };
}

/**
 * Advances one boss projectile's kinematics for a single 30Hz tick (`dtS`).
 * Returns `'alive'`, `'split_consumed'` (parent burst into children), or `'expired'`.
 */
export function stepBossDanmakuKinematics(
  bp: BossDanmakuProjectile,
  dtS: number,
  targets: readonly DanmakuTargetView[],
  onSpawnChild: (child: BossDanmakuSpawnInput) => void,
  fxOut?: number[],
): { status: 'alive' | 'split_consumed'; dx: number; dy: number } {
  bp.ageTicks += 1;

  // 1. Mid-air Cluster Split check
  if (bp.splitAfterTicks !== undefined && bp.ageTicks === bp.splitAfterTicks) {
    const count = Math.max(3, bp.splitCount ?? 8);
    const spd = bp.splitSpeed ?? 310;
    const mode = bp.splitMode ?? 'ring';
    const childKind: DanmakuSilhouetteKind = bp.splitChildKind ?? 'danmaku_star';
    const childPal = bp.splitChildPalette ?? bp.palette ?? BANSUNG_DANMAKU_PALETTE.GOLD;
    const childDmg = bp.splitChildDamage ?? Math.max(4, Math.round(bp.damage * 0.72));
    const tgt = nearestTarget(bp.x, bp.y, targets);
    const aimBase = tgt ? Math.atan2(tgt.y - bp.y, tgt.x - bp.x) : bp.visAngleRad;

    fxOut?.push(
      FX_BLAST,
      childPal === BANSUNG_DANMAKU_PALETTE.CYAN ? BANSUNG_FX_BLAST_FROST_SHATTER : BANSUNG_FX_BLAST_CLUSTER,
      Math.round(bp.x),
      Math.round(bp.y),
      38,
      bp.ownerActorId,
    );

    if (mode === 'aimed_fan') {
      const fanArc = Math.min(1.35, 0.22 * (count - 1));
      for (let k = 0; k < count; k++) {
        const u = count === 1 ? 0 : k / (count - 1) - 0.5;
        const ang = aimBase + u * fanArc;
        onSpawnChild({
          ownerActorId: bp.ownerActorId,
          danmakuKind: childKind,
          palette: childPal,
          scaleTier: 0,
          x: bp.x,
          y: bp.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 6,
          damage: childDmg,
          dmgKind: bp.dmgKind,
          ttlTicks: 75,
          slowPct: bp.slowPct,
          slowMs: bp.slowMs,
        });
      }
    } else if (mode === 'rose_flower') {
      for (let k = 0; k < count; k++) {
        const ang = aimBase + (k / count) * TWO_PI;
        const petalSpd = spd * (0.78 + 0.34 * Math.cos(4 * (ang - aimBase)));
        onSpawnChild({
          ownerActorId: bp.ownerActorId,
          danmakuKind: childKind,
          palette: k % 2 === 0 ? childPal : (bp.palette ?? BANSUNG_DANMAKU_PALETTE.CYAN),
          scaleTier: k % 2 === 0 ? 1 : 3,
          x: bp.x,
          y: bp.y,
          vx: Math.cos(ang) * petalSpd,
          vy: Math.sin(ang) * petalSpd,
          radius: 6,
          damage: childDmg,
          dmgKind: bp.dmgKind,
          ttlTicks: 82,
          slowPct: bp.slowPct,
          slowMs: bp.slowMs,
        });
      }
    } else {
      for (let k = 0; k < count; k++) {
        const ang = aimBase + (k / count) * TWO_PI;
        onSpawnChild({
          ownerActorId: bp.ownerActorId,
          danmakuKind: childKind,
          palette: childPal,
          scaleTier: 0,
          x: bp.x,
          y: bp.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 6,
          damage: childDmg,
          dmgKind: bp.dmgKind,
          ttlTicks: 80,
          angVel: bp.angVel ? bp.angVel * 0.5 : 0,
          slowPct: bp.slowPct,
          slowMs: bp.slowMs,
        });
      }
    }
    return { status: 'split_consumed', dx: 0, dy: 0 };
  }

  // 2. Enter Sakuya / Cirno Pause Phase
  if (!bp.paused && bp.pauseAfterTicks !== undefined && bp.ageTicks === bp.pauseAfterTicks) {
    bp.paused = true;
    bp.pauseTicksLeft = Math.max(4, bp.pauseDurationTicks ?? 15);
    bp.vx = 0;
    bp.vy = 0;
    if (bp.pausePalette !== undefined) {
      bp.palette = bp.pausePalette;
    }
  }

  // 3. Step Active Pause Phase (hovering + live target slewing)
  if (bp.paused) {
    const mode = bp.snapMode ?? 'aim_nearest';
    let desiredAngle = bp.visAngleRad;
    if (mode === 'aim_nearest') {
      const tgt = nearestTarget(bp.x, bp.y, targets);
      if (tgt) {
        desiredAngle = Math.atan2(tgt.y - bp.y, tgt.x - bp.x) + (bp.snapAngleOffset ?? 0);
      }
    } else if (mode === 'radial_out') {
      desiredAngle = Math.atan2(bp.y - bp.originY, bp.x - bp.originX) + (bp.snapAngleOffset ?? 0);
    } else if (mode === 'fixed_angle' && bp.snapFixedAngle !== undefined) {
      desiredAngle = bp.snapFixedAngle + (bp.snapAngleOffset ?? 0);
    } else if (mode === 'starburst') {
      desiredAngle = bp.baseAxisRad + (bp.snapAngleOffset ?? 0);
    }
    bp.visAngleRad = lerpAngleRad(bp.visAngleRad, desiredAngle, 0.34);

    bp.pauseTicksLeft -= 1;
    if (bp.pauseTicksLeft <= 0) {
      bp.paused = false;
      bp.visAngleRad = desiredAngle;
      const launchSpd = bp.snapSpeed ?? 470;
      bp.vx = Math.cos(desiredAngle) * launchSpd;
      bp.vy = Math.sin(desiredAngle) * launchSpd;
      bp.baseAxisRad = desiredAngle;
      if (bp.snapKind) {
        bp.danmakuKind = bp.snapKind;
        bp.kindId = resolveDanmakuKindId(bp.snapKind, bp.kindId);
      }
      if (bp.snapPalette !== undefined) {
        bp.palette = bp.snapPalette;
      }
      // Clear angular spin after snap so lances fly razor-true on their telegraphed lock line
      bp.angVel = 0;
      bp.angAccel = 0;
    }
    return { status: 'alive', dx: 0, dy: 0 };
  }

  // 4. Curved Spiral & Radial Acceleration
  let spd = Math.hypot(bp.vx, bp.vy);
  let dir = spd > 1e-4 ? Math.atan2(bp.vy, bp.vx) : bp.visAngleRad;

  if (bp.angAccel) {
    bp.angVel = (bp.angVel ?? 0) + bp.angAccel * dtS;
  }
  if (bp.angVel) {
    dir = wrapAngleRad(dir + bp.angVel * dtS);
    bp.baseAxisRad = dir;
  }
  if (bp.accel) {
    spd += bp.accel * dtS;
  }
  if (bp.minSpeed !== undefined && spd < bp.minSpeed) spd = bp.minSpeed;
  if (bp.maxSpeed !== undefined && spd > bp.maxSpeed) spd = bp.maxSpeed;

  bp.vx = Math.cos(dir) * spd;
  bp.vy = Math.sin(dir) * spd;

  let dx = bp.vx * dtS;
  let dy = bp.vy * dtS;

  // 5. Drift-Free Finite-Difference Sinusoidal / Twin-Helix Weave
  if (bp.waveAmp && bp.waveFreq) {
    const tNow = bp.ageTicks * dtS;
    const nextWave = bp.waveAmp * Math.sin(bp.waveFreq * tNow + (bp.wavePhase ?? 0));
    const deltaPerp = nextWave - bp.prevWaveOffset;
    bp.prevWaveOffset = nextWave;
    const perpX = -Math.sin(dir);
    const perpY = Math.cos(dir);
    dx += perpX * deltaPerp;
    dy += perpY * deltaPerp;
  }

  bp.visAngleRad = Math.hypot(dx, dy) > 1e-4 ? Math.atan2(dy, dx) : dir;
  return { status: 'alive', dx, dy };
}

// ============================================================================
// Turnkey Iconic Boss Danmaku Emitters
// ============================================================================

/**
 * Polar Rose-Curve Blooming Flower (`v(theta) = baseSpeed + petalAmp * cos(petals * theta + rot)`).
 * Inspired by Touhou Raiko Horikawa & Byakuren Hijiri lotus spell cards.
 */
export function emitRosePetalRing(
  emit: (b: BossDanmakuSpawnInput) => void,
  opts: {
    x: number;
    y: number;
    count: number;
    petals: number;
    baseSpeed: number;
    petalAmp: number;
    rotRad: number;
    damage: number;
    dmgKind?: BansungDamageKind;
    ttlTicks?: number;
    tipKind?: DanmakuSilhouetteKind;
    valleyKind?: DanmakuSilhouetteKind;
    tipPalette: BansungDanmakuPaletteId;
    valleyPalette: BansungDanmakuPaletteId;
    angVel?: number;
  },
): void {
  const dmgKind = opts.dmgKind ?? 'energy';
  const ttl = opts.ttlTicks ?? 96;
  for (let i = 0; i < opts.count; i++) {
    const rel = (i / opts.count) * TWO_PI;
    const theta = opts.rotRad + rel;
    const petalFactor = Math.cos(opts.petals * rel);
    const spd = Math.max(120, opts.baseSpeed + opts.petalAmp * petalFactor);
    const isTip = petalFactor >= 0.15;
    emit({
      danmakuKind: isTip ? (opts.tipKind ?? 'danmaku_lance') : (opts.valleyKind ?? 'danmaku_orb'),
      palette: isTip ? opts.tipPalette : opts.valleyPalette,
      scaleTier: isTip ? 1 : 0,
      x: opts.x + Math.cos(theta) * 26,
      y: opts.y + Math.sin(theta) * 26,
      vx: Math.cos(theta) * spd,
      vy: Math.sin(theta) * spd,
      radius: isTip ? 7 : 6,
      damage: opts.damage,
      dmgKind,
      ttlTicks: ttl,
      angVel: opts.angVel ?? 0,
    });
  }
}

/**
 * Sakuya Izayoi / Zulan Pause-and-Snap Aimed Lance Ring.
 * Expands radially into a sacred circle, pauses mid-air while rotating spearheads to lock onto
 * the nearest hero, then snaps forward at high velocity with optional fan spread.
 */
export function emitSakuyaPauseLanceRing(
  emit: (b: BossDanmakuSpawnInput) => void,
  opts: {
    x: number;
    y: number;
    count: number;
    expandSpeed?: number;
    pauseAfterTicks?: number;
    pauseDurationTicks?: number;
    snapSpeed?: number;
    fanSpreadRad?: number;
    rotRad?: number;
    damage: number;
    dmgKind?: BansungDamageKind;
    expandPalette: BansungDanmakuPaletteId;
    snapPalette: BansungDanmakuPaletteId;
    slowPct?: number;
    slowMs?: number;
  },
): void {
  const expSpd = opts.expandSpeed ?? 185;
  const pAfter = opts.pauseAfterTicks ?? 14;
  const pDur = opts.pauseDurationTicks ?? 15;
  const sSpd = opts.snapSpeed ?? 465;
  const fan = opts.fanSpreadRad ?? 0.28;
  const rot = opts.rotRad ?? 0;
  for (let i = 0; i < opts.count; i++) {
    const ang = rot + (i / opts.count) * TWO_PI;
    // Slight deterministic fan offset per blade so all blades don't collapse into 1 pixel line
    const slotU = opts.count > 1 ? ((i % 5) / 4 - 0.5) * fan : 0;
    emit({
      danmakuKind: 'danmaku_lance',
      palette: opts.expandPalette,
      pausePalette: BANSUNG_DANMAKU_PALETTE.SILVER,
      snapPalette: opts.snapPalette,
      snapKind: 'danmaku_lance',
      scaleTier: 1,
      x: opts.x + Math.cos(ang) * 28,
      y: opts.y + Math.sin(ang) * 28,
      vx: Math.cos(ang) * expSpd,
      vy: Math.sin(ang) * expSpd,
      radius: 6,
      damage: opts.damage,
      dmgKind: opts.dmgKind ?? 'energy',
      ttlTicks: pAfter + pDur + 75,
      pauseAfterTicks: pAfter,
      pauseDurationTicks: pDur,
      snapMode: 'aim_nearest',
      snapAngleOffset: slotU,
      snapSpeed: sSpd,
      slowPct: opts.slowPct,
      slowMs: opts.slowMs,
    });
  }
}

/**
 * Suwako Moriya Drift-Free DNA Twin-Helix Stream Pair.
 * Emits two 180-degree phase-opposed sinusoidal bullets weaving around `aimRad`.
 */
export function emitDnaHelixPair(
  emit: (b: BossDanmakuSpawnInput) => void,
  opts: {
    x: number;
    y: number;
    aimRad: number;
    speed: number;
    waveAmp?: number;
    waveFreq?: number;
    phaseOffset?: number;
    damage: number;
    dmgKind?: BansungDamageKind;
    kindA?: DanmakuSilhouetteKind;
    kindB?: DanmakuSilhouetteKind;
    paletteA: BansungDanmakuPaletteId;
    paletteB: BansungDanmakuPaletteId;
    slowPct?: number;
    slowMs?: number;
  },
): void {
  const vx = Math.cos(opts.aimRad) * opts.speed;
  const vy = Math.sin(opts.aimRad) * opts.speed;
  const amp = opts.waveAmp ?? 34;
  const freq = opts.waveFreq ?? 8.5;
  const basePhase = opts.phaseOffset ?? 0;

  for (let strand = 0; strand < 2; strand++) {
    const isA = strand === 0;
    emit({
      danmakuKind: isA ? (opts.kindA ?? 'danmaku_orb') : (opts.kindB ?? 'danmaku_crescent'),
      palette: isA ? opts.paletteA : opts.paletteB,
      scaleTier: 1,
      x: opts.x + Math.cos(opts.aimRad) * 30,
      y: opts.y + Math.sin(opts.aimRad) * 30,
      vx,
      vy,
      radius: 7,
      damage: opts.damage,
      dmgKind: opts.dmgKind ?? 'energy',
      ttlTicks: 92,
      waveAmp: amp,
      waveFreq: freq,
      wavePhase: basePhase + (isA ? 0 : Math.PI),
      slowPct: opts.slowPct,
      slowMs: opts.slowMs,
    });
  }
}

/**
 * Varkolyn / Lich / Cryogen Mid-Air Splitting Cluster Orb.
 */
export function emitClusterSplitOrb(
  emit: (b: BossDanmakuSpawnInput) => void,
  opts: {
    x: number;
    y: number;
    aimRad: number;
    speed?: number;
    splitAfterTicks?: number;
    splitMode?: DanmakuSplitMode;
    splitCount?: number;
    splitSpeed?: number;
    damage: number;
    dmgKind?: BansungDamageKind;
    parentPalette: BansungDanmakuPaletteId;
    childKind?: DanmakuSilhouetteKind;
    childPalette: BansungDanmakuPaletteId;
    slowPct?: number;
    slowMs?: number;
  },
): void {
  const spd = opts.speed ?? 215;
  const splitAt = opts.splitAfterTicks ?? 24;
  emit({
    danmakuKind: 'danmaku_ring',
    palette: opts.parentPalette,
    scaleTier: 2,
    x: opts.x + Math.cos(opts.aimRad) * 32,
    y: opts.y + Math.sin(opts.aimRad) * 32,
    vx: Math.cos(opts.aimRad) * spd,
    vy: Math.sin(opts.aimRad) * spd,
    radius: 12,
    damage: Math.round(opts.damage * 1.25),
    dmgKind: opts.dmgKind ?? 'explosive',
    ttlTicks: splitAt + 20,
    armored: true,
    splitAfterTicks: splitAt,
    splitMode: opts.splitMode ?? 'ring',
    splitCount: opts.splitCount ?? 8,
    splitSpeed: opts.splitSpeed ?? 305,
    splitChildKind: opts.childKind ?? 'danmaku_star',
    splitChildPalette: opts.childPalette,
    splitChildDamage: opts.damage,
    slowPct: opts.slowPct,
    slowMs: opts.slowMs,
  });
}

/**
 * NieR: Automata Alternating Slow-Hollow-Ring & Fast-Lance Curtain.
 */
export function emitNierAlternatingCurtain(
  emit: (b: BossDanmakuSpawnInput) => void,
  opts: {
    x: number;
    y: number;
    arms: number;
    rotRad: number;
    ringSpeed?: number;
    lanceSpeed?: number;
    angVel?: number;
    damage: number;
    ringPalette?: BansungDanmakuPaletteId;
    lancePalette?: BansungDanmakuPaletteId;
  },
): void {
  const rSpd = opts.ringSpeed ?? 210;
  const lSpd = opts.lanceSpeed ?? 355;
  const rPal = opts.ringPalette ?? BANSUNG_DANMAKU_PALETTE.CRIMSON;
  const lPal = opts.lancePalette ?? BANSUNG_DANMAKU_PALETTE.GOLD;
  for (let k = 0; k < opts.arms * 2; k++) {
    const isLance = k % 2 === 1;
    const ang = opts.rotRad + (k / (opts.arms * 2)) * TWO_PI;
    const spd = isLance ? lSpd : rSpd;
    emit({
      danmakuKind: isLance ? 'danmaku_lance' : 'danmaku_ring',
      palette: isLance ? lPal : rPal,
      scaleTier: isLance ? 0 : 1,
      x: opts.x + Math.cos(ang) * 34,
      y: opts.y + Math.sin(ang) * 34,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      radius: isLance ? 6 : 8,
      damage: opts.damage,
      dmgKind: 'energy',
      ttlTicks: 96,
      angVel: isLance ? 0 : (opts.angVel ?? 0.38),
    });
  }
}
