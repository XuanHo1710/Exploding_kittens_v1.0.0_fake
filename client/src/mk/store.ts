/**
 * Mighty Knight 2.5D Pixel — Client Frame Buffer, 60 FPS Interpolator & Throttled React HUD Store.
 */
import { useSyncExternalStore } from 'react';
import type {
  MkBiome,
  MkBossHudView,
  MkCommand,
  MkDamageEvent,
  MkEnemyView,
  MkFighterView,
  MkFrame,
  MkFxEvent,
  MkPickupView,
  MkPlayMode,
  MkProjectileView,
  MkUltCutInEvent,
  MkWorldPhase,
  MkZoneView,
} from '../../../shared/src';
import { MK_EVT_CMD, MK_TICK_EXACT_MS } from '../../../shared/src';

export interface MkRenderView extends MkFrame {
  myFighterId?: string;
}

export interface MkHudSnapshot {
  connected: boolean;
  tick: number;
  phase: MkWorldPhase;
  playMode: MkPlayMode;
  wave: number;
  biome: MkBiome;
  phaseLeftMs: number;
  enemiesRemaining: number;
  totalWaveEnemies: number;
  partyGold: number;
  partyScore: number;
  totalKills: number;
  elapsedMs: number;
  boss?: MkBossHudView;
  fighters: MkFighterView[];
  meFighter?: MkFighterView;
  activeCutIn?: MkUltCutInEvent & { expiresAt: number };
  banner?: string;
}

const EMPTY_HUD: MkHudSnapshot = {
  connected: false,
  tick: 0,
  phase: 'wave_intro',
  playMode: 'endless',
  wave: 1,
  biome: 'grasslands',
  phaseLeftMs: 0,
  enemiesRemaining: 0,
  totalWaveEnemies: 0,
  partyGold: 0,
  partyScore: 0,
  totalKills: 0,
  elapsedMs: 0,
  fighters: [],
};

class MkClientStore {
  private prevFrame: MkFrame | null = null;
  private currFrame: MkFrame | null = null;
  private currAtMs = 0;
  private meId = '';
  private hud: MkHudSnapshot = EMPTY_HUD;
  private lastHudEmitMs = 0;
  private activeCutIn?: MkUltCutInEvent & { expiresAt: number };
  private seenCutInId = 0;
  private readonly listeners = new Set<() => void>();

  setMeId(id: string): void {
    this.meId = id;
    if (this.currFrame) this.refreshHud(performance.now(), true);
  }

  reset(): void {
    this.prevFrame = null;
    this.currFrame = null;
    this.currAtMs = 0;
    this.activeCutIn = undefined;
    this.seenCutInId = 0;
    this.hud = EMPTY_HUD;
    this.emitHud();
  }

  pushFrame(frame: MkFrame, nowMs = performance.now()): void {
    this.prevFrame = this.currFrame;
    this.currFrame = frame;
    this.currAtMs = nowMs;

    if (frame.ultCutIns.length > 0) {
      const latest = frame.ultCutIns[frame.ultCutIns.length - 1];
      if (latest.id > this.seenCutInId) {
        this.seenCutInId = latest.id;
        this.activeCutIn = { ...latest, expiresAt: nowMs + 520 };
        this.refreshHud(nowMs, true);
        return;
      }
    }
    this.refreshHud(nowMs, frame.phase !== this.hud.phase || frame.wave !== this.hud.wave);
  }

  private refreshHud(nowMs: number, force = false): void {
    const f = this.currFrame;
    if (!f) return;
    if (this.activeCutIn && nowMs >= this.activeCutIn.expiresAt) {
      this.activeCutIn = undefined;
      force = true;
    }
    if (!force && nowMs - this.lastHudEmitMs < 65) return;
    this.lastHudEmitMs = nowMs;

    const meFighter =
      f.fighters.find((u) => u.ownerId === this.meId) ??
      f.fighters.find((u) => u.id === this.meId);

    this.hud = {
      connected: true,
      tick: f.tick,
      phase: f.phase,
      playMode: f.playMode,
      wave: f.wave,
      biome: f.biome,
      phaseLeftMs: f.phaseLeftMs,
      enemiesRemaining: f.enemiesRemaining,
      totalWaveEnemies: f.totalWaveEnemies,
      partyGold: f.partyGold,
      partyScore: f.partyScore,
      totalKills: f.totalKills,
      elapsedMs: f.elapsedMs,
      boss: f.boss,
      fighters: f.fighters,
      meFighter,
      activeCutIn: this.activeCutIn,
      banner: f.banner,
    };
    this.emitHud();
  }

  getRenderView(nowMs = performance.now()): MkRenderView | null {
    const curr = this.currFrame;
    if (!curr) return null;
    if (this.activeCutIn && nowMs >= this.activeCutIn.expiresAt) {
      this.activeCutIn = undefined;
      this.refreshHud(nowMs, true);
    }

    const prev = this.prevFrame;
    const alpha = prev
      ? Math.max(0, Math.min(1, (nowMs - this.currAtMs) / MK_TICK_EXACT_MS))
      : 1;

    const prevFighters = prev ? new Map(prev.fighters.map((u) => [u.id, u])) : null;
    const prevEnemies = prev ? new Map(prev.enemies.map((e) => [e.id, e])) : null;
    const prevProjs = prev ? new Map(prev.projectiles.map((p) => [p.id, p])) : null;

    const fighters: MkFighterView[] = curr.fighters.map((u) => {
      const pu = prevFighters?.get(u.id);
      if (!pu || Math.hypot(u.x - pu.x, u.y - pu.y) > 95) return u;
      return {
        ...u,
        x: pu.x + (u.x - pu.x) * alpha,
        y: pu.y + (u.y - pu.y) * alpha,
        z: pu.z + (u.z - pu.z) * alpha,
      };
    });

    const enemies: MkEnemyView[] = curr.enemies.map((e) => {
      const pe = prevEnemies?.get(e.id);
      if (!pe || Math.hypot(e.x - pe.x, e.y - pe.y) > 95) return e;
      return {
        ...e,
        x: pe.x + (e.x - pe.x) * alpha,
        y: pe.y + (e.y - pe.y) * alpha,
        z: pe.z + (e.z - pe.z) * alpha,
      };
    });

    const projectiles: MkProjectileView[] = curr.projectiles.map((p) => {
      const pp = prevProjs?.get(p.id);
      if (!pp) return p;
      return {
        ...p,
        x: pp.x + (p.x - pp.x) * alpha,
        y: pp.y + (p.y - pp.y) * alpha,
      };
    });

    const myFighter =
      fighters.find((u) => u.ownerId === this.meId) ?? fighters.find((u) => u.id === this.meId);

    return {
      ...curr,
      fighters,
      enemies,
      projectiles,
      zones: curr.zones as MkZoneView[],
      pickups: curr.pickups as MkPickupView[],
      fx: curr.fx as MkFxEvent[],
      damages: curr.damages as MkDamageEvent[],
      myFighterId: myFighter?.id,
    };
  }

  sendCmd(emit: (event: string, payload?: unknown) => void, cmd: MkCommand): void {
    emit(MK_EVT_CMD, cmd);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): MkHudSnapshot => this.hud;

  private emitHud(): void {
    for (const fn of this.listeners) fn();
  }
}

export const mkStore = new MkClientStore();

export function useMkHud(): MkHudSnapshot {
  return useSyncExternalStore(mkStore.subscribe, mkStore.getSnapshot, mkStore.getSnapshot);
}
