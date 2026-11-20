import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../identity/auth.service';
import { WorldSimulationService } from './world-simulation.service';

@WebSocketGateway({
  namespace: '/game',
  cors: { origin: true, credentials: true },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(WorldSimulationService) private readonly world: WorldSimulationService,
  ) {}

  onModuleInit(): void {
    this.world.setBroadcastHooks({
      emitToZone: (zoneId, event, payload) => {
        if (this.server) this.server.to(zoneId).emit(event, payload);
      },
      emitToSocket: (socketId, event, payload) => {
        if (this.server) this.server.to(socketId).emit(event, payload);
      },
    });
  }

  handleConnection(client: Socket): void {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        String(client.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) {
        client.emit('S2C_ERROR', { code: 'UNAUTHORIZED', message: 'Missing auth token' });
        client.disconnect(true);
        return;
      }
      const verified = this.auth.verifyJwt(token);
      client.data.auth = verified;
      this.logger.debug(`WS connected: ${verified.username} (${client.id})`);
    } catch {
      client.emit('S2C_ERROR', { code: 'UNAUTHORIZED', message: 'Invalid auth token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    await this.world.disconnectSocket(client.id);
  }

  @SubscribeMessage('C2S_JOIN_ZONE')
  async onJoinZone(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { characterId: string; zoneId?: string },
  ) {
    const accountId = client.data.auth?.sub;
    if (!accountId || !body?.characterId) return { ok: false, reason: 'UNAUTHORIZED' };
    for (const room of client.rooms) {
      if (room !== client.id) await client.leave(room);
    }
    const res = await this.world.joinPlayer(client.id, accountId, body.characterId, body.zoneId);
    await client.join(res.zoneId);
    client.emit('S2C_ZONE_SNAPSHOT', res.snapshot);
    return { ok: true, zoneId: res.zoneId, chatHistory: res.chatHistory };
  }

  @SubscribeMessage('C2S_PORTAL_TRAVEL')
  async onPortalTravel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { targetZoneId?: string },
  ) {
    for (const room of client.rooms) {
      if (room !== client.id) await client.leave(room);
    }
    const res = await this.world.handlePortalTravel(client.id, body?.targetZoneId);
    if (!res) return { ok: false };
    await client.join(res.zoneId);
    client.emit('S2C_ZONE_SNAPSHOT', res.snapshot);
    return { ok: true, zoneId: res.zoneId, chatHistory: res.chatHistory };
  }

  @SubscribeMessage('C2S_MOVE_INPUT')
  onMoveInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { seq: number; dx: number; dy: number; sprint?: boolean; dtMs?: number },
  ) {
    return this.world.handleMoveInput(client.id, body);
  }

  @SubscribeMessage('C2S_COMBAT_ACTION')
  onCombatAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { action: 'BASIC_ATTACK' | 'SKILL' | 'DODGE' | 'BLOCK'; skillId?: string; targetX?: number; targetY?: number },
  ) {
    return this.world.handleCombatAction(client.id, body);
  }

  @SubscribeMessage('C2S_GATHER_NODE')
  onGatherNode(@ConnectedSocket() client: Socket, @MessageBody() body: { nodeId: string }) {
    return this.world.handleGatherNode(client.id, body?.nodeId);
  }

  @SubscribeMessage('C2S_LOOT_PICKUP')
  onLootPickup(@ConnectedSocket() client: Socket, @MessageBody() body: { lootId: string }) {
    return this.world.handleLootPickup(client.id, body?.lootId);
  }

  @SubscribeMessage('C2S_CHAT_SEND')
  onChatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channel?: 'ZONE' | 'PARTY'; message: string },
  ) {
    return this.world.handleChat(client.id, body?.channel || 'ZONE', body?.message || '');
  }

  @SubscribeMessage('C2S_RESPAWN')
  async onRespawn(@ConnectedSocket() client: Socket) {
    for (const room of client.rooms) {
      if (room !== client.id) await client.leave(room);
    }
    const res = await this.world.handleRespawn(client.id);
    if (!res) return { ok: false };
    await client.join(res.zoneId);
    client.emit('S2C_ZONE_SNAPSHOT', res.snapshot);
    return { ok: true, zoneId: res.zoneId };
  }
}
