import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { isValidAvatar, type PlayRequest } from '../../../shared/src';
import { GameError } from './game';
import { RoomsService } from './rooms.service';
import { AccountsService } from '../store/accounts.service';

interface SocketData {
  playerId: string;
  name: string;
  avatar?: string;
  token?: string;
}

/** Không có đăng nhập: client tự sinh playerId (lưu localStorage) và gửi kèm tên khi kết nối */
function parseIdentity(auth: unknown): SocketData | null {
  const a = (auth ?? {}) as Record<string, unknown>;
  const playerId = typeof a.playerId === 'string' ? a.playerId.trim() : '';
  const name = typeof a.name === 'string' ? a.name.trim().slice(0, 20) : '';
  if (!/^[\w-]{8,64}$/.test(playerId) || !name) return null;
  return { playerId, name, avatar: isValidAvatar(a.avatar) ? a.avatar : undefined, token: typeof a.token === 'string' ? a.token.slice(0, 100) : undefined };
}

@WebSocketGateway({ cors: { origin: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer() server: Server;

  constructor(
    private readonly rooms: RoomsService,
    private readonly accounts: AccountsService,
  ) {}

  afterInit(server: Server) {
    this.rooms.bind(server);
  }

  handleConnection(client: Socket) {
    const id = parseIdentity(client.handshake.auth);
    if (!id) {
      client.emit('toast', 'Thiếu tên hoặc ID người chơi.');
      client.disconnect(true);
      return;
    }
    client.data = id;
    client.join(`p:${id.playerId}`);
    // có tài khoản + token đúng → dùng tên/avatar trong tài khoản, được dùng xu
    const acc = this.accounts.verify(id.playerId, id.token);
    this.rooms.setVerified(id.playerId, !!acc);
    this.rooms.pushAccount(id.playerId);
    if (!this.rooms.connected(id.playerId, id.name, id.avatar)) client.emit('state', null);
  }

  async handleDisconnect(client: Socket) {
    const { playerId } = (client.data ?? {}) as Partial<SocketData>;
    if (!playerId) return;
    const others = await this.server.in(`p:${playerId}`).fetchSockets();
    if (others.length === 0) this.rooms.disconnected(playerId);
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.rooms.create(me.playerId, me.name, me.avatar));
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() c: Socket, @MessageBody() body: { code: string }) {
    this.handle(c, (me) => this.rooms.join(body?.code, me.playerId, me.name, me.avatar));
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.rooms.leave(me.playerId));
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.rooms.startGame(me.playerId));
  }

  @SubscribeMessage('room:bet')
  bet(@ConnectedSocket() c: Socket, @MessageBody() body: { amount: number }) {
    this.handle(c, (me) => this.rooms.setBet(me.playerId, Number(body?.amount)));
  }

  @SubscribeMessage('account:daily')
  daily(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.rooms.claimDaily(me.playerId));
  }

  @SubscribeMessage('game:restart')
  restart(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.game(me).restart(me.playerId));
  }

  @SubscribeMessage('game:play')
  play(@ConnectedSocket() c: Socket, @MessageBody() body: PlayRequest) {
    this.handle(c, (me) => {
      if (!Array.isArray(body?.cardIds)) throw new GameError('Dữ liệu không hợp lệ.');
      this.game(me).play(me.playerId, {
        cardIds: body.cardIds.map(String),
        targetId: body.targetId,
        namedType: body.namedType,
        discardType: body.discardType,
        shuffleStyle: body.shuffleStyle,
      });
    });
  }

  @SubscribeMessage('room:emote')
  emote(@ConnectedSocket() c: Socket, @MessageBody() body: { emoji: string; to?: string }) {
    this.handle(c, (me) => this.rooms.emote(me.playerId, String(body?.emoji ?? ''), body?.to ? String(body.to) : undefined));
  }

  @SubscribeMessage('player:update')
  updateProfile(@ConnectedSocket() c: Socket, @MessageBody() body: { name?: string; avatar?: string }) {
    this.handle(c, (me) => {
      const next = parseIdentity({ playerId: me.playerId, name: body?.name, avatar: body?.avatar, token: me.token });
      if (!next) throw new GameError('Tên không hợp lệ.');
      c.data = next;
      this.rooms.updateProfile(next.playerId, next.name, next.avatar);
    });
  }

  @SubscribeMessage('room:chat')
  chat(@ConnectedSocket() c: Socket, @MessageBody() body: { text: string }) {
    this.handle(c, (me) => this.rooms.chat(me.playerId, String(body?.text ?? '')));
  }

  @SubscribeMessage('room:typing')
  typing(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.rooms.typing(me.playerId));
  }

  @SubscribeMessage('game:draw')
  draw(@ConnectedSocket() c: Socket) {
    this.handle(c, (me) => this.game(me).draw(me.playerId));
  }

  @SubscribeMessage('game:place')
  place(@ConnectedSocket() c: Socket, @MessageBody() body: { position: number }) {
    this.handle(c, (me) => this.game(me).placeBomb(me.playerId, Number(body?.position)));
  }

  @SubscribeMessage('game:give')
  give(@ConnectedSocket() c: Socket, @MessageBody() body: { cardId: string }) {
    this.handle(c, (me) => this.game(me).giveFavor(me.playerId, String(body?.cardId)));
  }

  private game(me: SocketData) {
    const game = this.rooms.roomOf(me.playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    return game;
  }

  private handle(client: Socket, fn: (me: SocketData) => void) {
    try {
      fn(client.data as SocketData);
    } catch (e) {
      if (e instanceof GameError) {
        client.emit('toast', e.message);
      } else {
        this.logger.error(e);
        client.emit('toast', 'Có lỗi xảy ra trên server.');
      }
    }
  }
}
