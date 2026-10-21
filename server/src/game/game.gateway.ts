import { HttpException, Logger } from '@nestjs/common';
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

/** Client gửi ID và token đăng nhập; tên/avatar được lấy lại từ tài khoản. */
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
    // Chỉ nhận socket có token tài khoản đúng: không ai mạo danh được playerId (công khai trong phòng) của người khác
    const acc = this.accounts.verify(id.playerId, id.token);
    if (!acc) {
      client.emit('toast', this.accounts.get(id.playerId) ? 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại bằng PIN.' : 'Đăng nhập bằng PIN để vào chơi nhé.');
      client.disconnect(true);
      return;
    }
    id.name = acc.name;
    id.avatar = acc.avatar;
    client.data = id;
    client.join(`p:${id.playerId}`);
    this.rooms.setVerified(id.playerId, true);
    this.rooms.pushAccount(id.playerId);
    try {
      if (!this.rooms.connected(id.playerId, id.name, id.avatar)) client.emit('state', null);
    } catch (error) {
      // Lỗi khi khôi phục phòng không được làm sập cả server
      this.logger.error('Không khôi phục được phòng khi kết nối lại', error);
      client.emit('state', null);
    }
  }

  async handleDisconnect(client: Socket) {
    const { playerId } = (client.data ?? {}) as Partial<SocketData>;
    if (!playerId) return;
    const others = await this.server.in(`p:${playerId}`).fetchSockets();
    if (others.length === 0) {
      this.rooms.disconnected(playerId);
      this.rooms.forget(playerId);
    }
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() c: Socket, @MessageBody() body?: { rules?: unknown; gameMode?: string }) {
    return this.handle(c, (me) => {
      if (
        body !== undefined &&
        (!body ||
          typeof body !== 'object' ||
          Array.isArray(body) ||
          Object.keys(body).some((key) => key !== 'rules' && key !== 'gameMode'))
      ) {
        throw new GameError('Cấu hình tạo phòng không hợp lệ.');
      }
      return this.rooms.create(me.playerId, me.name, me.avatar, body?.rules, body?.gameMode);
    });
  }

  @SubscribeMessage('room:mode')
  mode(@ConnectedSocket() c: Socket, @MessageBody() body: { gameMode: string }) {
    return this.handle(c, (me) => this.rooms.setGameMode(me.playerId, String(body?.gameMode ?? '')));
  }

  @SubscribeMessage('room:rules')
  rules(@ConnectedSocket() c: Socket, @MessageBody() body: { rules: unknown }) {
    return this.handle(c, (me) => {
      if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(body, 'rules') || Object.keys(body).some((key) => key !== 'rules')) {
        throw new GameError('Luật phòng không hợp lệ.');
      }
      return this.rooms.setRules(me.playerId, body.rules);
    });
  }

  @SubscribeMessage('room:ready')
  ready(@ConnectedSocket() c: Socket, @MessageBody() body: { ready: boolean; rulesVersion: number }) {
    return this.handle(c, (me) => {
      if (!body || typeof body.ready !== 'boolean' || !Number.isInteger(body.rulesVersion) || Object.keys(body).some((key) => key !== 'ready' && key !== 'rulesVersion')) {
        throw new GameError('Xác nhận luật không hợp lệ.');
      }
      return this.rooms.setReady(me.playerId, body.ready, body.rulesVersion);
    });
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() c: Socket, @MessageBody() body: { code: string }) {
    return this.handle(c, (me) => this.rooms.join(body?.code, me.playerId, me.name, me.avatar));
  }

  @SubscribeMessage('room:watch')
  watch(@ConnectedSocket() c: Socket, @MessageBody() body: { code: string }) {
    return this.handle(c, (me) => this.rooms.watch(body?.code, me.playerId, me.name, me.avatar));
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.leave(me.playerId));
  }

  @SubscribeMessage('room:kick')
  kick(@ConnectedSocket() c: Socket, @MessageBody() body: { targetId: string }) {
    return this.handle(c, (me) => this.rooms.kick(me.playerId, String(body?.targetId ?? '')));
  }

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.startGame(me.playerId));
  }

  @SubscribeMessage('room:bet')
  bet(@ConnectedSocket() c: Socket, @MessageBody() body: { amount: number }) {
    return this.handle(c, (me) => this.rooms.setBet(me.playerId, Number(body?.amount)));
  }

  @SubscribeMessage('account:daily')
  daily(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.claimDaily(me.playerId));
  }

  @SubscribeMessage('game:restart')
  restart(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.restartGame(me.playerId));
  }

  @SubscribeMessage('game:play')
  play(@ConnectedSocket() c: Socket, @MessageBody() body: PlayRequest) {
    return this.handle(c, (me) => {
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
    return this.handle(c, (me) => this.rooms.emote(me.playerId, String(body?.emoji ?? ''), body?.to ? String(body.to) : undefined));
  }

  @SubscribeMessage('player:update')
  updateProfile(@ConnectedSocket() c: Socket, @MessageBody() body: { name?: string; avatar?: string }) {
    return this.handle(c, async (me) => {
      const next = parseIdentity({ playerId: me.playerId, name: body?.name, avatar: body?.avatar, token: me.token });
      if (!next) throw new GameError('Tên không hợp lệ.');
      const profile = await this.rooms.updateProfile(next.playerId, next.name, next.avatar);
      c.data = { ...next, name: profile.name, avatar: profile.avatar };
      return profile;
    });
  }

  @SubscribeMessage('room:chat')
  chat(@ConnectedSocket() c: Socket, @MessageBody() body: { text: string }) {
    return this.handle(c, (me) => this.rooms.chat(me.playerId, String(body?.text ?? '')));
  }

  @SubscribeMessage('room:typing')
  typing(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.typing(me.playerId));
  }

  @SubscribeMessage('game:draw')
  draw(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.game(me).draw(me.playerId));
  }

  @SubscribeMessage('game:place')
  place(@ConnectedSocket() c: Socket, @MessageBody() body: { position: number }) {
    return this.handle(c, (me) => this.game(me).placeBomb(me.playerId, Number(body?.position)));
  }

  @SubscribeMessage('game:give')
  give(@ConnectedSocket() c: Socket, @MessageBody() body: { cardId: string }) {
    return this.handle(c, (me) => this.game(me).giveFavor(me.playerId, String(body?.cardId)));
  }

  @SubscribeMessage('game:dig')
  dig(@ConnectedSocket() c: Socket, @MessageBody() body: { keep: boolean }) {
    return this.handle(c, (me) => this.game(me).digChoice(me.playerId, body?.keep));
  }

  @SubscribeMessage('game:return')
  returnCard(@ConnectedSocket() c: Socket, @MessageBody() body: { cardId: string }) {
    return this.handle(c, (me) => this.game(me).returnCard(me.playerId, String(body?.cardId ?? '')));
  }

  @SubscribeMessage('game:steal')
  steal(@ConnectedSocket() c: Socket, @MessageBody() body: { index: number }) {
    return this.handle(c, (me) => this.game(me).pickSteal(me.playerId, Number(body?.index)));
  }

    @SubscribeMessage('game:alter')
  alter(@ConnectedSocket() c: Socket, @MessageBody() body: { cardIds: string[] }) {
    return this.handle(c, (me) => {
      if (!Array.isArray(body?.cardIds)) throw new GameError('Thứ tự lá bài không hợp lệ.');
      this.game(me).alterFuture(me.playerId, body.cardIds.map(String));
    });
  }

  // --- Sự kiện Rút Bài 21 (Xì Dách) ---
  @SubscribeMessage('blackjack:hit')
  blackjackHit(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.game(me).blackjackHit(me.playerId));
  }

  @SubscribeMessage('blackjack:stand')
  blackjackStand(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.game(me).blackjackStand(me.playerId));
  }

  @SubscribeMessage('blackjack:reveal_one')
  blackjackRevealOne(@ConnectedSocket() c: Socket, @MessageBody() body: { targetId: string }) {
    return this.handle(c, (me) => this.game(me).blackjackRevealOne(me.playerId, String(body?.targetId ?? '')));
  }

  // --- Sự kiện Tiến Lên Miền Nam (4 người) ---
  @SubscribeMessage('tienlen:play')
  tienLenPlay(@ConnectedSocket() c: Socket, @MessageBody() body: { cardIds: string[] }) {
    return this.handle(c, (me) => {
      if (!Array.isArray(body?.cardIds)) throw new GameError('Danh sách lá bài không hợp lệ.');
      this.game(me).tienLenPlay(me.playerId, body.cardIds.map(String));
    });
  }

  @SubscribeMessage('tienlen:pass')
  tienLenPass(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.game(me).tienLenPass(me.playerId));
  }

  private game(me: SocketData) {
    const game = this.rooms.roomOf(me.playerId);
    if (!game) throw new GameError('Bạn chưa ở trong phòng nào.');
    this.rooms.assertReady(game);
    return game;
  }

  private async handle(client: Socket, fn: (me: SocketData) => unknown | Promise<unknown>) {
    try {
      const me = client.data as SocketData;
      if (!me?.playerId) throw new GameError('Thiếu thông tin người chơi.');
      if (!this.accounts.verify(me.playerId, me.token)) {
        client.emit('toast', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng PIN.');
        client.disconnect(true);
        return;
      }
      return { ok: true, result: await fn(me) };
    } catch (e) {
      if (e instanceof GameError) {
        client.emit('toast', e.message);
        return { ok: false, error: e.message };
      } else if (e instanceof HttpException && e.getStatus() === 503) {
        const error = 'Chưa lưu được dữ liệu tài khoản. Vui lòng thử lại sau.';
        client.emit('toast', error);
        return { ok: false, error };
      } else if (e instanceof HttpException && e.getStatus() < 500) {
        client.emit('toast', e.message);
        return { ok: false, error: e.message };
      } else {
        this.logger.error(e);
        const error = 'Có lỗi xảy ra trên server.';
        client.emit('toast', error);
        return { ok: false, error };
      }
    }
  }
}
