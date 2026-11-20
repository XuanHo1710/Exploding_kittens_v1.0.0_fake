import { AnimationClipDefinition, AnimationState } from '@eldoria/shared';

export interface WatchdogSnapshot {
  recoveries: number;
  lastRecoveredFrom: AnimationState | null;
}

/**
 * Standalone AnimationStuckWatchdog (013 T017)
 * Monitors non-looping clip elapsed duration against clip.watchdogMaxDurationMs
 * and guarantees deterministic recovery to fallbackState (default 'idle').
 */
export class AnimationStuckWatchdog {
  private recoveries = 0;
  private lastRecoveredFrom: AnimationState | null = null;

  public evaluate(
    state: AnimationState,
    elapsedMs: number,
    clip?: AnimationClipDefinition | null,
  ): { shouldRecover: boolean; fallbackState: AnimationState } {
    if (state === 'death') return { shouldRecover: false, fallbackState: 'death' };
    if (clip?.loop) return { shouldRecover: false, fallbackState: state };

    const maxMs = clip ? clip.watchdogMaxDurationMs : 550;
    if (maxMs > 0 && elapsedMs >= maxMs) {
      this.recoveries++;
      this.lastRecoveredFrom = state;
      return { shouldRecover: true, fallbackState: clip?.fallbackState || 'idle' };
    }
    return { shouldRecover: false, fallbackState: state };
  }

  public getStats(): WatchdogSnapshot {
    return { recoveries: this.recoveries, lastRecoveredFrom: this.lastRecoveredFrom };
  }
}
