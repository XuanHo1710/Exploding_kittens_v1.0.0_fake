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
  MK_EVT_CMD,
  MK_EVT_CONFIG,
  MK_EVT_HERO,
  EXP_EVT_LOAD_PROFILE,
  EXP_EVT_REACH_ANCHOR,
  EXP_EVT_OPEN_CHEST,
  EXP_EVT_WARP_REALM,
  EXP_EVT_BATTLE_START,
  EXP_EVT_BATTLE_RETREAT,
  EXP_EVT_BATTLE_COMMIT,
  EXP_EVT_SUMMON,
  EXP_EVT_UPDATE_PARTY,
  EXP_EVT_UPGRADE_HERO,
  EXP_EVT_ALLOCATE_STATS,
  EXP_EVT_EQUIP_ITEM,
  EXP_EVT_USE_ELIXIR,
  EXP_EVT_ITEM_SUMMON,
  EXP_EVT_WEAPON_SUMMON,
  EXP_EVT_REFINE_WEAPON,
  EXP_EVT_ENHANCE_ITEM,
  EXP_EVT_SALVAGE_ITEMS,
  EXP_EVT_FEED_EXP,
  EXP_EVT_EQUIP_CHARM,
  EXP_EVT_TREE_UNLOCK,
  EXP_EVT_TREE_RESET,
  EXP_EVT_STORY_SEEN,
  isValidAvatar,
  type AntsCommand,
  type BansungCommand,
  type LinkCommand,
  type PlayRequest,
  type ThapCommand,
  type TwCommand,
} from '../../../shared/src';
import { GameError, GameKickError } from './game';
import {
  BANSUNG_SEC_LIMITS,
  BansungRateLimiter,
  isSafePlainObject,
  isWithinJsonByteBudget,
} from './bansung/security';
import {
  MK_SEC_LIMITS,
  MkRateLimiter,
  isSafePlainObject as isMkSafePlainObject,
  isWithinJsonByteBudget as isMkWithinJsonByteBudget,
} from './mk/security';
import { RoomsService } from './rooms.service';
import { AccountsService } from '../store/accounts.service';
import { ExpeditionService } from './expedition/expedition.service';

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
  private readonly mkConfigLimiter = new MkRateLimiter();
  private readonly mkHeroLimiter = new MkRateLimiter();
  private readonly mkCmdViolationLimiter = new MkRateLimiter();

  @WebSocketServer() server: Server;

  constructor(
    private readonly rooms: RoomsService,
    private readonly accounts: AccountsService,
    private readonly expedition: ExpeditionService,
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
      this.mkConfigLimiter.clearPlayer(client.id);
      this.mkHeroLimiter.clearPlayer(client.id);
      this.mkCmdViolationLimiter.clearPlayer(client.id);
    }
    if (!playerId) return;
    const others = await this.server.in(`p:${playerId}`).fetchSockets();
    if (others.length === 0) {
      this.bansungConfigLimiter.clearPlayer(playerId);
      this.bansungHeroLimiter.clearPlayer(playerId);
      this.bansungCmdViolationLimiter.clearPlayer(playerId);
      this.mkConfigLimiter.clearPlayer(playerId);
      this.mkHeroLimiter.clearPlayer(playerId);
      this.mkCmdViolationLimiter.clearPlayer(playerId);
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

  // --- Miragine War (Thập Hùng) ---
  @SubscribeMessage('thap:cmd')
  thapCmd(@ConnectedSocket() c: Socket, @MessageBody() body: ThapCommand) {
    return this.handle(c, (me) => {
      const cmd = (body && typeof body === 'object' && 'cmd' in body ? (body as { cmd?: unknown }).cmd : body) as ThapCommand;
      if (!cmd || typeof cmd !== 'object' || typeof cmd.t !== 'string') throw new GameError('Lệnh không hợp lệ.');
      this.game(me).thapCommand(me.playerId, cmd);
    });
  }

  @SubscribeMessage('thap:config')
  thapConfig(@ConnectedSocket() c: Socket, @MessageBody() body: { config?: unknown }) {
    return this.handle(c, (me) => {
      const cfg = body && typeof body === 'object' && 'config' in body ? body.config : body;
      return this.rooms.setThapConfig(me.playerId, cfg);
    });
  }

  @SubscribeMessage('thap:start')
  thapStart(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.startGame(me.playerId));
  }

  @SubscribeMessage('thap:rematch')
  thapRematch(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.rooms.restartGame(me.playerId));
  }

  // --- Tam Quốc Toàn Chiến ---
  @SubscribeMessage('tw:cmd')
  twCmd(@ConnectedSocket() c: Socket, @MessageBody() body: TwCommand) {
    return this.handle(c, (me) => {
      const cmd = (body && typeof body === 'object' && 'cmd' in body ? (body as { cmd?: unknown }).cmd : body) as TwCommand;
      if (!cmd || typeof cmd !== 'object' || typeof cmd.t !== 'string') throw new GameError('Lệnh không hợp lệ.');
      return this.rooms.twCommand(me.playerId, cmd);
    });
  }

  @SubscribeMessage('tw:config')
  twConfig(@ConnectedSocket() c: Socket, @MessageBody() body: { config?: unknown }) {
    return this.handle(c, (me) => {
      const cfg = body && typeof body === 'object' && 'config' in body ? body.config : body;
      return this.rooms.setTwConfig(me.playerId, cfg);
    });
  }

  @SubscribeMessage('tw:faction')
  twFaction(@ConnectedSocket() c: Socket, @MessageBody() body: { faction?: unknown }) {
    return this.handle(c, (me) => {
      const faction = body && typeof body === 'object' && 'faction' in body ? body.faction : body;
      return this.rooms.setTwFaction(me.playerId, faction);
    });
  }

  @SubscribeMessage('tw:team')
  twTeam(@ConnectedSocket() c: Socket, @MessageBody() body: { team?: unknown }) {
    return this.handle(c, (me) => {
      const team = body && typeof body === 'object' && 'team' in body ? body.team : body;
      return this.rooms.setTwTeam(me.playerId, team);
    });
  }

  @SubscribeMessage('tw:loadout')
  twLoadout(@ConnectedSocket() c: Socket, @MessageBody() body: { loadout?: unknown }) {
    return this.handle(c, (me) => {
      const loadout = body && typeof body === 'object' && 'loadout' in body ? body.loadout : body;
      return this.rooms.setTwLoadout(me.playerId, loadout);
    });
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

  // --- Mighty Knight Co-op Endless ---
  @SubscribeMessage(MK_EVT_CMD)
  mkCmd(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      if (
        !isMkSafePlainObject(body, MK_SEC_LIMITS.MAX_CMD_KEYS) ||
        !isMkWithinJsonByteBudget(body, MK_SEC_LIMITS.MAX_CMD_JSON_BYTES) ||
        typeof (body as { t?: unknown }).t !== 'string'
      ) {
        this.rejectInvalidBansungPayload(
          this.mkCmdViolationLimiter,
          key,
          'Phát hiện gửi lệnh không hợp lệ quá nhanh, vui lòng chậm lại.',
          'invalid_command',
        );
      }
      const res = this.game(me).mkCommand(me.playerId, body);
      if (!res.ok) {
        throw new SilentRejectError(res.reason === 'rate_limit' ? 'rate_limited' : res.reason ?? 'invalid_command');
      }
    });
  }

  @SubscribeMessage(MK_EVT_CONFIG)
  mkConfig(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      const rl = this.mkConfigLimiter.consume(key, 'config');
      if (!rl.allowed) {
        if (rl.shouldKick) {
          throw new GameKickError('Bạn thay đổi cấu hình quá nhanh.');
        }
        throw new SilentRejectError('rate_limited');
      }
      if (
        !isMkSafePlainObject(body, MK_SEC_LIMITS.MAX_CONFIG_KEYS) ||
        !isMkWithinJsonByteBudget(body, MK_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)
      ) {
        this.rejectInvalidBansungPayload(this.mkConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
      }
      let raw: unknown = body;
      if (Object.hasOwn(body, 'config')) {
        if (Object.keys(body).length !== 1) {
          this.rejectInvalidBansungPayload(this.mkConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
        }
        raw = (body as { config: unknown }).config;
        if (
          !isMkSafePlainObject(raw, MK_SEC_LIMITS.MAX_CONFIG_KEYS) ||
          !isMkWithinJsonByteBudget(raw, MK_SEC_LIMITS.MAX_CONFIG_JSON_BYTES)
        ) {
          this.rejectInvalidBansungPayload(this.mkConfigLimiter, key, 'Cấu hình phòng không hợp lệ.');
        }
      }
      this.rooms.setMkConfig(me.playerId, raw);
    });
  }

  @SubscribeMessage(MK_EVT_HERO)
  mkHero(@ConnectedSocket() c: Socket, @MessageBody() body: unknown) {
    return this.handle(c, (me) => {
      const key = this.socketLimitKey(c, me.playerId);
      const rl = this.mkHeroLimiter.consume(key, 'config');
      if (!rl.allowed) {
        if (rl.shouldKick) {
          throw new GameKickError('Bạn đổi anh hùng quá nhanh.');
        }
        throw new SilentRejectError('rate_limited');
      }
      const isValidShape =
        typeof body === 'string' ||
        isMkSafePlainObject(body, MK_SEC_LIMITS.MAX_CMD_KEYS);
      if (!isValidShape || !isMkWithinJsonByteBudget(body, MK_SEC_LIMITS.MAX_CMD_JSON_BYTES)) {
        this.rejectInvalidBansungPayload(this.mkHeroLimiter, key, 'Anh hùng không hợp lệ.');
      }
      this.rooms.setMkHero(me.playerId, body);
    });
  }

  // --- Lô Tô Cân Đồ ---
  @SubscribeMessage('loto:pick')
  lotoPick(@ConnectedSocket() c: Socket, @MessageBody() body: { sheets?: unknown; colors?: unknown }) {
    return this.handle(c, (me) => this.rooms.setLotoPick(me.playerId, body?.sheets, body?.colors));
  }

  // --- Astral Expedition 33 Pixel ---
  @SubscribeMessage(EXP_EVT_LOAD_PROFILE)
  expLoadProfile(@ConnectedSocket() c: Socket) {
    return this.handle(c, (me) => this.expedition.getProfile(me.playerId));
  }

  @SubscribeMessage(EXP_EVT_REACH_ANCHOR)
  expReachAnchor(@ConnectedSocket() c: Socket, @MessageBody() body: { mapId?: unknown; anchorId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu trạm nghỉ không hợp lệ.');
      return this.expedition.reachAnchor(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_OPEN_CHEST)
  expOpenChest(@ConnectedSocket() c: Socket, @MessageBody() body: { mapId?: unknown; chestId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu rương không hợp lệ.');
      return this.expedition.openChest(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_WARP_REALM)
  expWarpRealm(@ConnectedSocket() c: Socket, @MessageBody() body: { fromMapId?: unknown; toMapId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu chuyển vùng không hợp lệ.');
      return this.expedition.warpRealm(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_BATTLE_START)
  expBattleStart(@ConnectedSocket() c: Socket, @MessageBody() body: { encounterKind?: unknown; targetId?: unknown; mapId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 4096)) throw new GameError('Dữ liệu bắt đầu trận đấu không hợp lệ.');
      return this.expedition.startBattle(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_BATTLE_COMMIT)
  expBattleCommit(@ConnectedSocket() c: Socket, @MessageBody() body: { battleId?: unknown; reqId?: unknown; actionLog?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 128_000)) throw new GameError('Nhật ký trận đấu vượt quá giới hạn.');
      return this.expedition.commitBattle(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_BATTLE_RETREAT)
  expBattleRetreat(@ConnectedSocket() c: Socket, @MessageBody() body: { battleId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 1024)) throw new GameError('Yêu cầu rút lui không hợp lệ.');
      return this.expedition.retreatBattle(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_SUMMON)
  expSummon(@ConnectedSocket() c: Socket, @MessageBody() body: { count?: unknown; reqId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Yêu cầu triệu hồi không hợp lệ.');
      return this.expedition.summon(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_UPDATE_PARTY)
  expUpdateParty(@ConnectedSocket() c: Socket, @MessageBody() body: { activeHeroIds?: unknown; reserveHeroIds?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Đội hình không hợp lệ.');
      return this.expedition.updateParty(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_UPGRADE_HERO)
  expUpgradeHero(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; kind?: unknown; skillId?: unknown; skillIds?: unknown; difficulty?: unknown; expectedRank?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Yêu cầu nâng cấp không hợp lệ.');
      return this.expedition.upgradeHero(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_ALLOCATE_STATS)
  expAllocateStats(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; alloc?: unknown; reset?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu cộng điểm không hợp lệ.');
      return this.expedition.allocateStats(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_EQUIP_ITEM)
  expEquipItem(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; slot?: unknown; itemUid?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu trang bị không hợp lệ.');
      return this.expedition.equipItem(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_USE_ELIXIR)
  expUseElixir(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; itemUid?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu thuốc không hợp lệ.');
      return this.expedition.useElixir(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_ITEM_SUMMON)
  expItemSummon(@ConnectedSocket() c: Socket, @MessageBody() body: { count?: unknown; reqId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Yêu cầu mở rương không hợp lệ.');
      return this.expedition.itemSummon(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_WEAPON_SUMMON)
  expWeaponSummon(@ConnectedSocket() c: Socket, @MessageBody() body: { count?: unknown; reqId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 1024)) throw new GameError('Yêu cầu triệu hồi vũ khí không hợp lệ.');
      return this.expedition.weaponSummon(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_ENHANCE_ITEM)
  expEnhanceItem(@ConnectedSocket() c: Socket, @MessageBody() body: { itemUid?: unknown; expectedLevel?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 1024)) throw new GameError('Yêu cầu cường hoá không hợp lệ.');
      return this.expedition.enhanceItem(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_REFINE_WEAPON)
  expRefineWeapon(@ConnectedSocket() c: Socket, @MessageBody() body: { itemUid?: unknown; expectedRank?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 1024)) throw new GameError('Yêu cầu tinh luyện không hợp lệ.');
      return this.expedition.refineWeapon(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_SALVAGE_ITEMS)
  expSalvageItems(@ConnectedSocket() c: Socket, @MessageBody() body: { itemUids?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 32_000)) throw new GameError('Danh sách phân rã không hợp lệ.');
      return this.expedition.salvageItems(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_FEED_EXP)
  expFeedExp(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; crystals?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu bón EXP không hợp lệ.');
      return this.expedition.feedExp(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_EQUIP_CHARM)
  expEquipCharm(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; slotIndex?: unknown; charmId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu bùa không hợp lệ.');
      return this.expedition.equipCharm(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_TREE_UNLOCK)
  expTreeUnlock(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown; nodeId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu cây kỹ năng không hợp lệ.');
      return this.expedition.unlockTreeNode(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_TREE_RESET)
  expTreeReset(@ConnectedSocket() c: Socket, @MessageBody() body: { heroId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 2048)) throw new GameError('Dữ liệu cây kỹ năng không hợp lệ.');
      return this.expedition.resetTree(me.playerId, body ?? {});
    });
  }

  @SubscribeMessage(EXP_EVT_STORY_SEEN)
  expStorySeen(@ConnectedSocket() c: Socket, @MessageBody() body: { sceneId?: unknown }) {
    return this.handle(c, (me) => {
      if (!isWithinJsonByteBudget(body, 1024)) throw new GameError('Dữ liệu cốt truyện không hợp lệ.');
      return this.expedition.markStorySeen(me.playerId, body ?? {});
    });
  }

  private rejectInvalidBansungPayload(
    limiter: { recordViolation(key: string): { shouldKick: boolean } },
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
