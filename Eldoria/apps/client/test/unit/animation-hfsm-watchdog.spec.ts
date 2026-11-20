import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AnimationClipDefinition,
  AnimationDirection,
  AnimationState,
  CANONICAL_25_ANIMATION_STATES,
} from '@eldoria/shared';
import { CharacterHfsmController } from '../../src/game/animation/CharacterHfsmController';
import { DepthLayerManager } from '../../src/game/rendering/DepthLayerManager';

describe('CharacterHfsmController & AnimationStuckWatchdog — 1,000-Transition Zero-Stuck Stress Test (SC-003)', () => {
  it('completes 1,000 rapid state transitions + lag spikes with 0% stuck states and 0 crashes', () => {
    const clipsPath = path.resolve(__dirname, '../../../../assets/v1/animation-clips.json');
    const raw = JSON.parse(fs.readFileSync(clipsPath, 'utf8'));
    const clipMap = new Map<string, AnimationClipDefinition>(
      (raw.clips as AnimationClipDefinition[]).map((c) => [c.clipKey, c]),
    );
    expect(clipMap.size).toBeGreaterThanOrEqual(300);

    const playedClips: string[] = [];
    const hfsm = new CharacterHfsmController('chr_kael_vanguard', clipMap, (clipKey) => {
      playedClips.push(clipKey);
    });

    const dirs: AnimationDirection[] = ['down', 'up', 'left', 'right', 'down_left', 'up_right'];
    const states: AnimationState[] = [...CANONICAL_25_ANIMATION_STATES];

    // 1,000 rapid deterministic pseudo-random transitions including death/respawn & dropped frames
    let seed = 42;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    for (let i = 0; i < 1000; i++) {
      const s = states[Math.floor(nextRand() * states.length)];
      const d = dirs[Math.floor(nextRand() * dirs.length)];
      if (hfsm.getState() === 'death') {
        hfsm.requestTransition('respawn', d, true);
      } else {
        hfsm.requestTransition(s, d);
      }

      // Periodically inject massive 1200ms frame drop to verify Watchdog recovery!
      const dtMs = i % 25 === 0 ? 1200 : Math.floor(16 + nextRand() * 140);
      hfsm.tick(dtMs, i % 2 === 0);

      // Every resolved clip key must be non-empty and valid in clipMap
      const currentKey = hfsm.getCurrentClipKey();
      expect(clipMap.has(currentKey)).toBe(true);
    }

    // After settling 2000ms (unless dead), hero MUST return to locomotion (idle/run) — ZERO stuck states!
    if (hfsm.getState() === 'death') {
      hfsm.requestTransition('respawn', 'down', true);
    }
    hfsm.tick(2000, false);
    expect(['idle', 'walk', 'run', 'sprint']).toContain(hfsm.getState());
    expect(hfsm.telemetry.recoveries).toBeGreaterThan(0);
    expect(playedClips.length).toBeGreaterThan(100);
  });

  it('enforces unified Depth Stack invariant: Boss Telegraph UNLIT < Y-Sort < Air VFX < Telegraph Rim Echo < Lighting < Nameplates', () => {
    expect(DepthLayerManager.bossTelegraphUnlit(5)).toBeGreaterThanOrEqual(180);
    expect(DepthLayerManager.bossTelegraphUnlit(5)).toBeLessThanOrEqual(199);
    expect(DepthLayerManager.ySort(320)).toBe(1320);
    expect(DepthLayerManager.airVfx()).toBe(105000);
    expect(DepthLayerManager.telegraphRimEcho()).toBe(109500);
    expect(DepthLayerManager.telegraphRimEcho()).toBeGreaterThan(DepthLayerManager.airVfx());
    expect(DepthLayerManager.lighting()).toBeGreaterThan(DepthLayerManager.telegraphRimEcho());
    expect(DepthLayerManager.nameplate()).toBeGreaterThan(DepthLayerManager.lighting());
    expect(DepthLayerManager.computeCanopyAlpha(100, 100, 100, 95)).toBe(0.55);
    expect(DepthLayerManager.computeCanopyAlpha(100, 100, 300, 300)).toBe(1.0);
  });
});
