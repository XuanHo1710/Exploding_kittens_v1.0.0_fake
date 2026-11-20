import {
  BossTelegraphEvent,
  ChatMessagePayload,
  CombatDamageEvent,
  SkillCastVfxEvent,
  ZoneSnapshotPayload,
} from '@eldoria/shared';

export interface HudFrameState {
  zoneId: string;
  regionId: string;
  timeOfDayPhase: string;
  weather: string;
  season: string;
  playerX: number;
  playerY: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
  nearbyPrompt: { kind: 'NPC' | 'NODE' | 'LOOT' | 'PORTAL'; id: string; label: string } | null;
  bossHud: { id: string; name: string; hp: number; maxHp: number; poise: number; maxPoise: number; phase: number } | null;
}

export interface MinimapFrameState {
  zoneId: string;
  playerX: number;
  playerY: number;
  entities: Array<{ id: string; kind: string; x: number; y: number }>;
}

export interface GameUiBridgeEvents {
  'hud:update': HudFrameState;
  'minimap:update': MinimapFrameState;
  'zone:snapshot': ZoneSnapshotPayload;
  'combat:damage': CombatDamageEvent;
  'combat:vfx': SkillCastVfxEvent;
  'boss:telegraph': BossTelegraphEvent;
  'boss:defeated': any;
  'chat:message': ChatMessagePayload;
  'interact:npc': { npcId: string };
  'player:died': { zoneId: string };
  'build:mode': { active: boolean; buildingId?: string };
  'client:triggerSkill': { skillId?: string; action: 'BASIC_ATTACK' | 'SKILL' | 'DODGE' | 'BLOCK' };
  'client:travelZone': { targetZoneId: string };
  'client:respawn': Record<string, never>;
  'client:refreshBundle': Record<string, never>;
  'assets:progress': { pct: number; label: string };
  'assets:ready': { clipCount: number };
}

type EventKey = keyof GameUiBridgeEvents;

/**
 * Decoupled Phaser <-> React Bridge with built-in 10 Hz HUD / 5 Hz Minimap throttling
 */
export class GameUiBridge {
  private readonly listeners = new Map<EventKey, Set<(payload: any) => void>>();
  private lastHudEmitMs = 0;
  private lastMinimapEmitMs = 0;

  public on<K extends EventKey>(event: K, handler: (payload: GameUiBridgeEvents[K]) => void): () => void {
    const set = this.listeners.get(event) || new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => set.delete(handler);
  }

  public emit<K extends EventKey>(event: K, payload: GameUiBridgeEvents[K]): void {
    const now = performance.now();
    if (event === 'hud:update') {
      if (now - this.lastHudEmitMs < 100) return; // <= 10 Hz
      this.lastHudEmitMs = now;
    } else if (event === 'minimap:update') {
      if (now - this.lastMinimapEmitMs < 200) return; // <= 5 Hz
      this.lastMinimapEmitMs = now;
    }
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const gameUiBridge = new GameUiBridge();
