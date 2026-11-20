import { io, Socket } from 'socket.io-client';
import { gameUiBridge } from '../bridge/GameUiBridge';
import { apiClient } from './ApiClient';

class RealtimeClientImpl {
  private socket: Socket | null = null;
  private activeCharId: string | null = null;
  private activeZoneId: string | null = null;
  private onConnectionChange?: (connected: boolean) => void;

  public connect(characterId: string, zoneId?: string, onConn?: (c: boolean) => void): void {
    this.activeCharId = characterId;
    this.activeZoneId = zoneId || null;
    this.onConnectionChange = onConn;

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    const token = apiClient.getAccessToken();
    const sock = io('/game', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 15,
    });

    sock.on('connect', () => {
      this.onConnectionChange?.(true);
      if (this.activeCharId) {
        sock.emit(
          'C2S_JOIN_ZONE',
          { characterId: this.activeCharId, zoneId: this.activeZoneId || undefined },
          (ack: any) => {
            if (ack?.zoneId) this.activeZoneId = ack.zoneId;
            if (Array.isArray(ack?.chatHistory)) {
              for (const m of ack.chatHistory) gameUiBridge.emit('chat:message', m);
            }
          },
        );
      }
    });

    sock.on('disconnect', () => {
      this.onConnectionChange?.(false);
    });

    sock.on('S2C_ZONE_SNAPSHOT', (snap) => {
      this.activeZoneId = snap.zoneId;
      gameUiBridge.emit('zone:snapshot', snap);
    });

    sock.on('S2C_COMBAT_DAMAGE', (evt) => gameUiBridge.emit('combat:damage', evt));
    sock.on('S2C_SKILL_VFX', (evt) => gameUiBridge.emit('combat:vfx', evt));
    sock.on('S2C_BOSS_TELEGRAPH', (evt) => gameUiBridge.emit('boss:telegraph', evt));
    sock.on('S2C_BOSS_DEFEATED', (evt) => {
      gameUiBridge.emit('boss:defeated', evt);
      gameUiBridge.emit('client:refreshBundle', {});
    });
    sock.on('S2C_CHAT_MESSAGE', (msg) => gameUiBridge.emit('chat:message', msg));

    this.socket = sock;
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.onConnectionChange?.(false);
  }

  public sendMove(seq: number, dx: number, dy: number, sprint: boolean, dtMs: number): void {
    this.socket?.emit('C2S_MOVE_INPUT', { seq, dx, dy, sprint, dtMs });
  }

  public sendCombat(
    action: 'BASIC_ATTACK' | 'SKILL' | 'DODGE' | 'BLOCK',
    skillId?: string,
    targetX?: number,
    targetY?: number,
  ): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_COMBAT_ACTION', { action, skillId, targetX, targetY }, resolve);
    });
  }

  public sendGather(nodeId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_GATHER_NODE', { nodeId }, (res: any) => {
        if (res?.ok) gameUiBridge.emit('client:refreshBundle', {});
        resolve(res);
      });
    });
  }

  public sendLootPickup(lootId: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_LOOT_PICKUP', { lootId }, (res: any) => {
        if (res?.ok) gameUiBridge.emit('client:refreshBundle', {});
        resolve(res);
      });
    });
  }

  public sendPortalTravel(targetZoneId?: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_PORTAL_TRAVEL', { targetZoneId }, resolve);
    });
  }

  public sendChat(channel: 'ZONE' | 'PARTY', message: string): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_CHAT_SEND', { channel, message }, resolve);
    });
  }

  public sendRespawn(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false });
      this.socket.emit('C2S_RESPAWN', {}, resolve);
    });
  }
}

export const realtimeClient = new RealtimeClientImpl();
