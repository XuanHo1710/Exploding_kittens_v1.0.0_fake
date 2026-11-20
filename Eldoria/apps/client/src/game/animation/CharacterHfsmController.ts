import { AnimationClipDefinition, AnimationDirection, AnimationState } from '@eldoria/shared';

export type HfsmSuperstate = 'LOCOMOTION' | 'COMBAT' | 'DEFENSIVE' | 'CROWD_CONTROL' | 'LIFESIM' | 'LIFE_CYCLE';

export const STATE_PRIORITY: Record<AnimationState, number> = {
  death: 11,
  respawn: 10,
  stun: 9,
  knockback: 9,
  ultimate: 8,
  hit: 7,
  dodge: 6,
  dash: 6,
  block: 5,
  skill: 4,
  cast: 4,
  attack_combo: 4,
  attack: 4,
  mining: 3,
  woodcutting: 3,
  farming: 3,
  fishing: 3,
  crafting: 3,
  building: 3,
  interact: 3,
  emote: 2,
  sprint: 2,
  run: 2,
  walk: 2,
  idle: 1,
};

export function superstateOf(state: AnimationState): HfsmSuperstate {
  if (state === 'death' || state === 'respawn') return 'LIFE_CYCLE';
  if (state === 'stun' || state === 'knockback' || state === 'hit') return 'CROWD_CONTROL';
  if (state === 'dodge' || state === 'dash' || state === 'block') return 'DEFENSIVE';
  if (state === 'attack' || state === 'attack_combo' || state === 'cast' || state === 'skill' || state === 'ultimate') return 'COMBAT';
  if (state === 'idle' || state === 'walk' || state === 'run' || state === 'sprint') return 'LOCOMOTION';
  return 'LIFESIM';
}

export interface WatchdogTelemetry {
  recoveries: number;
  fallbackClipPlays: number;
  lastRecoveredFrom: AnimationState | null;
}

/**
 * AnimationStuckWatchdog + CharacterHfsmController (Pure TS, deterministic & zero-stuck)
 * Ensures no character can EVER freeze in attack/skill/cast/stun/dodge/hit even on dropped frames or missing clips.
 */
export class CharacterHfsmController {
  private currentState: AnimationState = 'idle';
  private currentDirection: AnimationDirection = 'down';
  private stateElapsedMs = 0;
  private currentClipDurationMs = 0;
  private currentWatchdogMs = 0;
  private currentLoop = true;
  private currentCancelWindowMs: number | null = null;
  private hitFrameTriggered = false;
  private currentHitFrameMs: number | null = null;

  public readonly telemetry: WatchdogTelemetry = {
    recoveries: 0,
    fallbackClipPlays: 0,
    lastRecoveredFrom: null,
  };

  constructor(
    public readonly entityId: string,
    private readonly clipCatalog: Map<string, AnimationClipDefinition>,
    private readonly onClipChanged?: (clipKey: string, state: AnimationState, direction: AnimationDirection) => void,
    private readonly onVisualHitFrame?: (state: AnimationState, direction: AnimationDirection) => void,
  ) {
    this.enterState('idle', 'down', true);
  }

  public getState(): AnimationState {
    return this.currentState;
  }

  public getSuperstate(): HfsmSuperstate {
    return superstateOf(this.currentState);
  }

  public getDirection(): AnimationDirection {
    return this.currentDirection;
  }

  public getCurrentClipKey(): string {
    return this.resolveSafeClipKey(this.currentState, this.currentDirection);
  }

  public resolveSafeClipKey(state: AnimationState, direction: AnimationDirection): string {
    const exact = `${this.entityId}_${state}_${direction}`;
    if (this.clipCatalog.has(exact)) return exact;

    const dir4: AnimationDirection =
      direction.includes('left') ? 'left' : direction.includes('right') ? 'right' : direction.includes('up') ? 'up' : 'down';
    const reduced = `${this.entityId}_${state}_${dir4}`;
    if (this.clipCatalog.has(reduced)) return reduced;

    this.telemetry.fallbackClipPlays++;
    const idleDir = `${this.entityId}_idle_${dir4}`;
    if (this.clipCatalog.has(idleDir)) return idleDir;

    return `${this.entityId}_idle_down`;
  }

  public requestTransition(nextState: AnimationState, direction?: AnimationDirection, force = false): boolean {
    const nextDir = direction || this.currentDirection;
    if (nextState === this.currentState && nextDir === this.currentDirection && !force) {
      return false;
    }

    if (!force) {
      // Death can only transition to respawn
      if (this.currentState === 'death' && nextState !== 'respawn') return false;

      const curPrio = STATE_PRIORITY[this.currentState];
      const nextPrio = STATE_PRIORITY[nextState];

      // Allow same-tier or higher-tier interrupts, OR cancel window interrupts for lower-priority locomotion
      if (nextPrio < curPrio && !this.currentLoop) {
        const inCancelWindow =
          this.currentCancelWindowMs !== null && this.stateElapsedMs >= this.currentCancelWindowMs;
        const completed = this.stateElapsedMs >= this.currentClipDurationMs;
        if (!inCancelWindow && !completed) {
          return false;
        }
      }
    }

    this.enterState(nextState, nextDir, true);
    return true;
  }

  private enterState(state: AnimationState, direction: AnimationDirection, emit: boolean): void {
    this.currentState = state;
    this.currentDirection = direction;
    this.stateElapsedMs = 0;
    this.hitFrameTriggered = false;

    const key = this.resolveSafeClipKey(state, direction);
    const clip = this.clipCatalog.get(key);
    if (clip) {
      this.currentLoop = clip.loop;
      this.currentClipDurationMs = clip.frameDurationMs.reduce((a, b) => a + b, 0);
      this.currentWatchdogMs = clip.loop ? 0 : Math.max(clip.watchdogMaxDurationMs, this.currentClipDurationMs + 150);
      this.currentCancelWindowMs =
        clip.cancelWindowStartFrame !== null
          ? clip.frameDurationMs.slice(0, clip.cancelWindowStartFrame).reduce((a, b) => a + b, 0)
          : null;
      this.currentHitFrameMs =
        clip.hitFrameIndex !== null
          ? clip.frameDurationMs.slice(0, clip.hitFrameIndex).reduce((a, b) => a + b, 0)
          : null;
    } else {
      this.currentLoop = state === 'idle' || state === 'walk' || state === 'run' || state === 'sprint';
      this.currentClipDurationMs = this.currentLoop ? 0 : 400;
      this.currentWatchdogMs = this.currentLoop ? 0 : 550;
      this.currentCancelWindowMs = this.currentLoop ? 0 : 300;
      this.currentHitFrameMs = null;
    }

    if (emit) {
      this.onClipChanged?.(key, state, direction);
    }
  }

  /**
   * Advances state clock & enforces AnimationStuckWatchdog auto-recovery.
   */
  public tick(dtMs: number, isMoving = false): void {
    if (dtMs <= 0) return;
    this.stateElapsedMs += dtMs;

    if (!this.hitFrameTriggered && this.currentHitFrameMs !== null && this.stateElapsedMs >= this.currentHitFrameMs) {
      this.hitFrameTriggered = true;
      this.onVisualHitFrame?.(this.currentState, this.currentDirection);
    }

    // Never auto-recover out of death (waits for explicit respawn)
    if (this.currentLoop || this.currentState === 'death') return;

    // Normal completion
    if (this.stateElapsedMs >= this.currentClipDurationMs && this.stateElapsedMs < this.currentWatchdogMs) {
      this.enterState(isMoving ? 'run' : 'idle', this.currentDirection, true);
      return;
    }

    // Watchdog forced recovery (e.g. massive lag spike / dropped frame skipping normal completion)
    if (this.currentWatchdogMs > 0 && this.stateElapsedMs >= this.currentWatchdogMs) {
      this.telemetry.recoveries++;
      this.telemetry.lastRecoveredFrom = this.currentState;
      this.enterState(isMoving ? 'run' : 'idle', this.currentDirection, true);
    }
  }
}
