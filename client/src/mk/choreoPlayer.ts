/**
 * Mighty Knight 2.5D Pixel — 60 FPS Choreography Player (`choreoPlayer.ts`).
 *
 * Maps authoritative `(actionId, actionTick)` onto the shared 10–15 frame
 * `MkChoreoTimeline` with:
 * - Zero-blur integer pixel root-motion offsets `(dx, dz)`
 * - Dynamic `flipX` mirroring for 360° spin & flurry moves
 * - Pixel afterimage spawning triggers
 * - Client-side micro-hitstop freeze (35–85 ms) on crisp skill/parry impact
 * - Step-synchronized Modular Pixel VFX cue emission filtered by `minSkillLevel`
 */
import {
  MK_ENEMIES,
  MK_HEROES,
  MK_TICK_EXACT_MS,
  getEnemyChoreoTimeline,
  getHeroChoreoTimeline,
  resolveChoreoStepAtMs,
  type MkChoreoStep,
  type MkEnemyView,
  type MkFighterView,
  type MkVfxSpawnCue,
} from '../../../shared/src';

export interface MkResolvedPose {
  clipKey: string;
  frameIdx: number;
  drawDir: 1 | -1;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  afterimage: boolean;
  flashColor?: string;
  accentColor: string;
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
  hitstopMs: number;
  stepVfx: readonly MkVfxSpawnCue[];
  stepSfx?: string;
  stepChanged: boolean;
}

interface EntityTrack {
  actionId: string;
  lastActionTick: number;
  enteredAtMs: number;
  lastStepIndex: number;
  hitstopUntilMs: number;
  lastSeenMs: number;
}

const TRACKS = new Map<string, EntityTrack>();

export function resetMkChoreoCache(): void {
  TRACKS.clear();
}

export function pruneMkChoreoCache(nowMs: number): void {
  for (const [k, tr] of TRACKS) {
    if (nowMs - tr.lastSeenMs > 5000) TRACKS.delete(k);
  }
}

export function triggerMkHitstop(unitKey: string, durationMs: number, nowMs: number): void {
  if (durationMs <= 0) return;
  const tr = TRACKS.get(unitKey);
  if (tr) {
    tr.hitstopUntilMs = Math.max(tr.hitstopUntilMs, nowMs + Math.min(90, durationMs));
  }
}

function getTrack(key: string, actionId: string, actionTick: number, nowMs: number): EntityTrack {
  let tr = TRACKS.get(key);
  if (!tr) {
    tr = {
      actionId,
      lastActionTick: actionTick,
      enteredAtMs: nowMs - Math.max(0, actionTick) * MK_TICK_EXACT_MS,
      lastStepIndex: -1,
      hitstopUntilMs: 0,
      lastSeenMs: nowMs,
    };
    TRACKS.set(key, tr);
    return tr;
  }

  if (tr.actionId !== actionId || actionTick < tr.lastActionTick) {
    tr.actionId = actionId;
    tr.enteredAtMs = nowMs - Math.max(0, actionTick) * MK_TICK_EXACT_MS;
    tr.lastStepIndex = -1;
  } else {
    const expectedStart = nowMs - Math.max(0, actionTick) * MK_TICK_EXACT_MS;
    const drift = expectedStart - tr.enteredAtMs;
    if (Math.abs(drift) > 55) {
      tr.enteredAtMs += drift * 0.4;
    }
  }
  tr.lastActionTick = actionTick;
  tr.lastSeenMs = nowMs;
  return tr;
}

function skillLevelForAction(fighter: MkFighterView): number {
  if (fighter.actionId === 'skill1') return Math.max(1, fighter.upgrades.s1);
  if (fighter.actionId === 'skill2') return Math.max(1, fighter.upgrades.s2);
  if (fighter.actionId === 'skill3') return Math.max(1, fighter.upgrades.s3);
  if (fighter.actionId === 'skill4') return Math.max(1, fighter.upgrades.s4);
  if (fighter.actionId === 'ultimate') return 5;
  return 1;
}

export function resolveHeroChoreoPose(fighter: MkFighterView, nowMs: number): MkResolvedPose {
  const key = `H:${fighter.id}`;
  const tr = getTrack(key, fighter.actionId, fighter.actionTick, nowMs);
  const timeline = getHeroChoreoTimeline(fighter.heroId, fighter.actionId);

  const effectiveNow = nowMs < tr.hitstopUntilMs ? tr.hitstopUntilMs - 45 : nowMs;
  const elapsedMs = Math.max(0, effectiveNow - tr.enteredAtMs);
  const resolved = resolveChoreoStepAtMs(timeline, elapsedMs);
  const step: MkChoreoStep = resolved.step;

  const stepChanged = resolved.stepIndex !== tr.lastStepIndex;
  if (stepChanged) tr.lastStepIndex = resolved.stepIndex;

  const skLv = skillLevelForAction(fighter);
  const stepVfx =
    stepChanged && step.vfx
      ? step.vfx.filter((cue) => !cue.minSkillLevel || skLv >= cue.minSkillLevel)
      : [];

  const spec = MK_HEROES[fighter.heroId];
  const drawDir: 1 | -1 = step.flipX ? (fighter.dir === 1 ? -1 : 1) : fighter.dir;
  const flashColor =
    step.flashColor ??
    (fighter.superArmorMs > 0 && fighter.actionId !== 'idle' && fighter.actionId !== 'walk'
      ? '#fde047'
      : undefined);

  return {
    clipKey: `hero:${fighter.heroId}`,
    frameIdx: step.frame,
    drawDir,
    offsetX: Math.round((step.dx ?? 0) * fighter.dir),
    offsetY: 0,
    offsetZ: Math.round(step.dz ?? 0),
    afterimage: Boolean(step.afterimage || fighter.actionId === 'dash'),
    flashColor,
    accentColor: spec.accentColor,
    cellW: 48,
    cellH: 48,
    anchorX: 24,
    anchorY: 44,
    hitstopMs: stepChanged ? (step.hitstopMs ?? 0) : 0,
    stepVfx,
    stepSfx: stepChanged ? step.sfx : undefined,
    stepChanged,
  };
}

export function resolveEnemyChoreoPose(enemy: MkEnemyView, nowMs: number): MkResolvedPose {
  const key = `E:${enemy.id}`;
  const tr = getTrack(key, enemy.actionId, enemy.actionTick, nowMs);
  const timeline = getEnemyChoreoTimeline(enemy.kind, enemy.actionId);

  const elapsedMs = Math.max(0, nowMs - tr.enteredAtMs);
  const resolved = resolveChoreoStepAtMs(timeline, elapsedMs);
  const step = resolved.step;
  const stepChanged = resolved.stepIndex !== tr.lastStepIndex;
  if (stepChanged) tr.lastStepIndex = resolved.stepIndex;

  const spec = MK_ENEMIES[enemy.kind];
  const drawDir: 1 | -1 = step.flipX ? (enemy.dir === 1 ? -1 : 1) : enemy.dir;
  let flashColor = step.flashColor;
  if (enemy.hitFlashMs > 0) flashColor = '#ffffff';
  else if (enemy.stunMs > 0) flashColor = '#fde047';
  else if (enemy.slowMs > 0) flashColor = '#38bdf8';
  else if (enemy.burnMs > 0) flashColor = '#fb923c';
  else if (enemy.poisonMs > 0) flashColor = '#4ade80';

  return {
    clipKey: spec.isBoss ? `boss:${enemy.kind}` : `enemy:${enemy.kind}`,
    frameIdx: step.frame,
    drawDir,
    offsetX: Math.round((step.dx ?? 0) * enemy.dir),
    offsetY: 0,
    offsetZ: Math.round(step.dz ?? 0),
    afterimage: Boolean(step.afterimage),
    flashColor,
    accentColor: spec.accentColor,
    cellW: spec.cellW,
    cellH: spec.cellH,
    anchorX: spec.anchorX,
    anchorY: spec.anchorY,
    hitstopMs: 0,
    stepVfx: [],
    stepChanged,
  };
}
