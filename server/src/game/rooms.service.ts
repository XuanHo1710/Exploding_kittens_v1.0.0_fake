import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { Server } from 'socket.io';
import { CHAT_MAX_LEN, EMOTES, THROWABLES, type ChatMessage, type Emote } from '../../../shared/src';
import { Game, GameError, GameHooks } from './game';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Game>();
  /** playerId → mã phòng đang ở */
  private playerRoom = new Map<string, string>();
  private server: Server;

  private hooks: GameHooks = {
    changed: (game) => this.broadcast(game),
    notify: (playerId, notice) => this.server.to(`p:${playerId}`).emit('notice', notice),
    fx: (game, fx) => game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('fx', fx)),
    removed: (playerId, code) => {
      if (this.playerRoom.get(playerId) !== code) return;
      this.playerRoom.delete(playerId);
      this.server.to(`p:${playerId}`).emit('state', null);
    },
  };

  private lastEmote = new Map<string, number>();
  /** Chat theo phòng: giữ 100 tin gần nhất */
  private chats = new Map<string, ChatMessage[]>();
  private chatSeq = 0;
  private lastChat = new Map<string, number>();

  chat(playerId: string, raw: string) {
    const game = this.roomOf(playerId);
    const me = game?.players.find((p) => p.id === playerId);
    if (!game || !me) return;
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return;
    const now = Date.now();
    if (now - (this.lastChat.get(playerId) ?? 0) < 400) throw new GameError('Gõ chậm thôi nào 😅');
    this.lastChat.set(playerId, now);
    const msg: ChatMessage = { id: ++this.chatSeq, from: playerId, name: me.name, avatar: me.avatar, text, at: now };
    const list = [...(this.chats.get(game.code) ?? []), msg].slice(-100);
    this.chats.set(game.code, list);
    game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('chat', msg));
  }

  typing(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    game.players.filter((p) => p.id !== playerId).forEach((p) => this.server.to(`p:${p.id}`).emit('typing', { from: playerId }));
  }

  /** Gửi lịch sử chat khi vào phòng / kết nối lại */
  sendChatHistory(playerId: string) {
    const game = this.roomOf(playerId);
    this.server.to(`p:${playerId}`).emit('chat:history', game ? (this.chats.get(game.code) ?? []) : []);
  }

  /** Thả biểu cảm / ném đồ: không đổi trạng thái ván, chỉ phát cho cả phòng */
  emote(playerId: string, emoji: string, to?: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    const now = Date.now();
    if (now - (this.lastEmote.get(playerId) ?? 0) < 700) return;
    const isThrow = !!to;
    const allowed: readonly string[] = isThrow ? THROWABLES : EMOTES;
    if (!allowed.includes(emoji)) return;
    if (isThrow && (to === playerId || !game.players.some((p) => p.id === to))) return;
    this.lastEmote.set(playerId, now);
    const e: Emote = { from: playerId, emoji, to };
    game.players.forEach((p) => this.server.to(`p:${p.id}`).emit('emote', e));
  }

  bind(server: Server) {
    this.server = server;
  }

  roomOf(playerId: string) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  create(playerId: string, name: string, avatar?: string) {
    this.leave(playerId);
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const game = new Game(code, this.hooks);
    this.rooms.set(code, game);
    this.playerRoom.set(playerId, code);
    game.addPlayer(playerId, name, avatar);
    this.sendChatHistory(playerId);
  }

  join(rawCode: string, playerId: string, name: string, avatar?: string) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const game = this.rooms.get(code);
    if (!game) throw new GameError(`Không tìm thấy phòng ${code}.`);
    const prev = this.roomOf(playerId);
    game.addPlayer(playerId, name, avatar);
    this.playerRoom.set(playerId, code);
    this.sendChatHistory(playerId);
    if (prev && prev !== game) {
      prev.removePlayer(playerId);
      this.cleanup(prev);
    }
  }

  leave(playerId: string) {
    const game = this.roomOf(playerId);
    if (!game) return;
    game.removePlayer(playerId);
    this.playerRoom.delete(playerId);
    this.cleanup(game);
  }

  connected(playerId: string, name: string, avatar?: string) {
    const game = this.roomOf(playerId);
    if (!game) return false;
    game.addPlayer(playerId, name, avatar);
    this.sendChatHistory(playerId);
    return true;
  }

  updateProfile(playerId: string, name: string, avatar?: string) {
    this.roomOf(playerId)?.updateProfile(playerId, name, avatar);
  }

  disconnected(playerId: string) {
    this.roomOf(playerId)?.setConnected(playerId, false);
  }

  private broadcast(game: Game) {
    for (const p of game.players) {
      this.server.to(`p:${p.id}`).emit('state', game.viewFor(p.id));
    }
    this.cleanup(game);
  }

  private cleanup(game: Game) {
    const empty = game.players.every((p) => p.left) || game.players.length === 0;
    if (empty && this.rooms.get(game.code) === game) {
      game.dispose();
      this.rooms.delete(game.code);
      this.chats.delete(game.code);
    }
  }
}
