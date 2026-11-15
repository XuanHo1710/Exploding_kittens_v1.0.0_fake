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
import {
  BANSUNG_EVT_CMD,
  BANSUNG_EVT_CONFIG,
  BANSUNG_EVT_HERO,
  isValidAvatar,
  type AntsCommand,
  type BansungCommand,
  type LinkCommand,
  type PlayRequest,
  type ThapCommand,
} from '../../../shared/src';
import { GameError, GameKickError } from './game';
import {
  BANSUNG_SEC_LIMITS,
  BansungRateLimiter,
  isSafePlainObject,
  isWithinJsonByteBudget,
} from './bansung/security';
import { RoomsService } from './rooms.service';
import { AccountsService } from '../store/accounts.service';

class SilentRejectError extends Error {}

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

@WebSocketGateway({
  cors: { origin: true },
  perMessageDeflate: {
    threshold: 256,
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
  },
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  private readonly bansungConfigLimiter = new BansungRateLimiter();
  private readonly bansungHeroLimiter = new BansungRateLimiter();
  private readonly bansungCmdViolationLimiter = new BansungRateLimiter();

  @WebSocketServer() server: Server;

  constructor(
    private readonly rooms: RoomsService,
    private readonly accounts: AccountsService,
  ) {}

  private disconnectClient(client: Socket | undefined) {
    if (client && typeof (client as { disconnect?: unknown }).disconnect === 'function') {
      client.disconnect(true);
    }
  }

  private socketLimitKey(client: Socket, playerId: string): string {
    return typeof client?.id === 'string' && client.id.length > 0 ? client.id : playerId;
  }

  afterInit(server: Server) {
    this.rooms.bind(server);
  }

  handleConnection(client: Socket) {
    const id = parseIdentity(client.handshake.auth);
    if (!id) {
      client.emit('toast', 'Thiếu tên hoặc ID người chơi.');
      this.disconnectClient(client);
      return;
    }
    // Chỉ nhận socket có token tài khoản đúng: không ai mạo danh được playerId (công khai trong phòng) của người khác
    const acc = this.accounts.verify(id.playerId, id.token);
    if (!acc) {
      client.emit('toast', this.accounts.get(id.playerId) ? 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại bằng PIN.' : 'Đăng nhập bằng PIN để vào chơi nhé.');
      this.disconnectClient(client);
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
    if (typeof client?.id === 'string' && client.id.length > 0) {
      this.bansungConfigLimiter.clearPlayer(client.id);
      this.bansungHeroLimiter.clearPlayer(client.id);
      this.bansungCmdViolationLimiter.clearPlayer(client.id);
    }
    if (!playerId) return;
    const others = await this.server.in(`p:${playerId}`).fetchSockets();
    if (others.length === 0) {
      this.bansungConfigLimiter.clearPlayer(playerId);
      this.bansungHeroLimiter.clearPlayer(playerId);
      this.bansungCmdViolationLimiter.clearPlayer(playerId);
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

  // --- Đế Chế Kiến ---
  @SubscribeMessage('ants:cmd')
  antsCmd(@ConnectedSocket() c: Socket, @MessageBody() body: AntsCommand) {
    return this.handle(c, (me) => {
      if (!body || typeof body !== 'object' || typeof body.t !== 'string') throw new GameError('Lệnh không hợp lệ.');
      this.game(me).antsCommand(me.playerId, body);
    });
  }

  @SubscribeMessage('ants:config')
  antsConfig(@ConnectedSocket() c: Socket, @MessageBody() body: { config: unknown }) {
    return this.handle(c, (me) => this.rooms.setAntsConfig(me.playerId, body?.config));
  }

  // --- Nối Thú Đại Chiến ---
  @SubscribeMessage('link:cmd')
  linkCmd(@ConnectedSocket() c: Socket, @MessageBody() body: LinkCommand) {
    return this.handle(c, (me) => {
      if (!body || typeof body !== 'object' || typeof body.t !== 'string') throw new GameError('Lệnh không hợp lệ.');
      this.game(me).linkCommand(me.playerId, body);
    });
  }

  @SubscribeMessage('link:config')
  linkConfig(@ConnectedSocket() c: Socket, @MessageBody() body: { config: unknown }) {
    return this.handle(c, (me) => this.rooms.setLinkConfig(me.playerId, body?.config));
  }

  // --- Thập Hùng Tranh Bá ---
  @SubscribeMessage('thap:cmd')
  thapCmd(@ConnectedSocket() c: Socket, @MessageBody() body: ThapCommand) {
    return this.handle(c, (me) => {
      if (!body || typeof body !== 'object' || typeof body.t !== 'string') throw new GameError('Lệnh không hợp lệ.');
      this.game(me).thapCommand(me.playerId, body);
    });
  }

  @SubscribeMessage('thap:config')
  thapConfig(@ConnectedSocket() c: Socket, @MessageBody() body: { config: unknown }) {
    return this.handle(c, (me) => this.rooms.setThapConfig(me.playerId, body?.config));
  }

  @SubscribeMessage('thap:team')
  thapTeam(@ConnectedSocket() c: Socket, @MessageBody() body: { team?: unknown }) {
    return this.handle(c, (me) => this.rooms.setThapTeam(me.playerId, body?.team));
  }

  // --- Bắn Súng Co-op ---
  @SubscribeMessage(BANSUNG_EVT_CMD)
  bansungCmd(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      if (
        !isSafePlainObject(body, BANSUNG_SEC_LIMITS.MAX_CMD_KEYS) ||
        !isWithinJsonByteBudget(body, BANSUNG_SEC_LIMITS.MAX_CMD_JSON_BYTES) ||
        typeof (body as { t?: unknown }).t !== 'string'
      ) {
        this.rejectInvalidBansungPayload(
          this.bansungCmdViolationLimiter,
          key,
          'Phát hiện gửi lệnh không hợp lệ quá nhanh, vui lòng chậm lại.',
          'invalid_command',
        );
      }
      const res = this.game(me).bansungCommand(me.playerId, body);
      if (!res.ok) {
        throw new SilentRejectError(res.reason === 'rate_limit' ? 'rate_limited' : res.reason ?? 'invalid_command');
      }
    });
  }

  @SubscribeMessage(BANSUNG_EVT_CONFIG)
  bansungConfig(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      const rl = this.bansungConfigLimiter.consume(key, 'config');
      if (!rl.allowed) {
        if (rl.shouldKick) {
          throw new GameKickError('Bạn thay đổi cấu hình quá nhanh.');
        }
        throw new SilentRejectError('rate_limited');
      }
      if (
        !isSafePlainObject(body, BANSUNG_SEC_LIMITS.MAX_CONFIG_KEYS) ||
        !isWithinJsonByteBudget(body, BANSUNG_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)
      ) {
        this.rejectInvalidBansungPayload(this.bansungConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
      }
      let raw: unknown = body;
      if (Object.hasOwn(body, 'config')) {
        if (Object.keys(body).length !== 1) {
          this.rejectInvalidBansungPayload(this.bansungConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
        }
        raw = (body as { config: unknown }).config;
        if (
          !isSafePlainObject(raw, BANSUNG_SEC_LIMITS.MAX_CONFIG_KEYS) ||
          !isWithinJsonByteBudget(raw, BANSUNG_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)
        ) {
          this.rejectInvalidBansungPayload(this.bansungConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
        }
      }
      this.rooms.setBansungConfig(me.playerId, raw);
    });
  }

  @SubscribeMessage(BANSUNG_EVT_HERO)
  bansungHero(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      const rl = this.bansungHeroLimiter.consume(key, 'config');
      if (!rl.allowed) {
        if (rl.shouldKick) {
          throw new GameKickError('Bạn đổi nhân vật quá nhanh.');
        }
        throw new SilentRejectError('rate_limited');
      }
      const isValidShape =
        typeof body === 'string' ||
        isSafePlainObject(body, BANSUNG_SEC_LIMITS.MAX_CMD_KEYS);
      if (!isValidShape || !isWithinJsonByteBudget(body, BANSUNG_SEC_LIMITS.MAX_CMD_JSON_BYTES)) {
        this.rejectInvalidBansungPayload(this.bansungHeroLimiter, key, 'Nhân vật không hợp lệ.');
      }
      this.rooms.setBansungHero(me.playerId, body);
    });
  }

  // --- Lô Tô Cân Đồ ---
  @SubscribeMessage('loto:pick')
  lotoPick(@ConnectedSocket() c: Socket, @MessageBody() body: { sheets?: unknown; colors?: unknown }) {
    return this.handle(c, (me) => this.rooms.setLotoPick(me.playerId, body?.sheets, body?.colors));
  }

  private rejectInvalidBansungPayload(
    limiter: BansungRateLimiter,
    key: string,
    kickMessage: string,
    silentReason?: string,
  ): never {
    const v = limiter.recordViolation(key);
    if (v.shouldKick) {
      throw new GameKickError(kickMessage);
    }
    if (silentReason) {
      throw new SilentRejectError(silentReason);
    }
    throw new GameError(kickMessage);
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
        const error = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng PIN.';
        client.emit('toast', error);
        this.disconnectClient(client);
        return { ok: false, error };
      }
      return { ok: true, result: await fn(me) };
    } catch (e) {
      if (e instanceof GameKickError) {
        const who = (client.data as Partial<SocketData> | undefined)?.playerId ?? client?.id ?? 'unknown';
        this.logger.warn(`kicking ${who}: ${e.message}`);
        client.emit('toast', e.message);
        this.disconnectClient(client);
        return { ok: false, error: e.message };
      } else if (e instanceof SilentRejectError) {
        return { ok: false, error: e.message };
      } else if (e instanceof GameError) {
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
