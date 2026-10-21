import { Armchair, Eye, LogOut, UserX } from 'lucide-react';
import { GAME_MODES, MAX_SPECTATORS, type RoomView } from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';

/** Người này đang xem (không ngồi bàn) */
export const isSpectating = (view: RoomView, meId: string) => !view.players.some((p) => p.id === meId);

/** Danh sách tên để tra cứu người đang gõ chat (gồm cả khán giả) */
export const roomPeople = (view: RoomView) => [...view.players, ...(view.spectators ?? [])];

/** Chip nhỏ trên bàn: số khán giả đang xem */
export function SpectatorChip({ view }: { view: RoomView }) {
  const list = view.spectators ?? [];
  if (!list.length) return null;
  return (
    <span className="spectator-chip" title={`Đang xem: ${list.map((s) => s.name).join(', ')}`}>
      <Eye size={14} className="inline-icon" /> {list.length}
    </span>
  );
}

/** Khu dưới cùng của khán giả (thay cho bài trên tay) */
export function SpectatorArea({ view, emit }: { view: RoomView; emit: (event: string, payload?: unknown) => void }) {
  return (
    <div className="my-area spectator-area">
      <div className="my-bar">
        <div className="my-status">
          <span className="status-row">
            <Eye size={16} className="inline-icon" /> Bạn đang xem ván này
            {(view.spectators?.length ?? 0) > 1 && <span className="muted"> · cùng {view.spectators.length - 1} khán giả khác</span>}
          </span>
          <div className="muted small">
            {view.phase === 'playing' ? 'Hết ván, khi phòng quay lại phòng chờ, bạn có thể vào bàn chơi.' : 'Bạn chỉ thấy bài đã đánh ra, không thấy bài trên tay ai.'}
          </div>
        </div>
        <div className="my-actions">
          <button className="ghost" onClick={() => emit('room:leave')}>
            <LogOut size={15} /> Rời phòng
          </button>
        </div>
      </div>
    </div>
  );
}

/** Phòng chờ: danh sách khán giả + nút vào bàn / chuyển sang xem */
export function LobbySpectators({ view, meId, emit }: { view: RoomView; meId: string; emit: (event: string, payload?: unknown) => void }) {
  const list = view.spectators ?? [];
  const isHost = view.hostId === meId;
  const spectating = isSpectating(view, meId);
  const maxPlayers = Math.min(view.rules.maxPlayers, GAME_MODES[view.gameMode ?? 'exploding_kittens'].maxPlayers);
  const seatFree = view.players.length < maxPlayers;
  return (
    <div className="lobby-spectators">
      <div className="bet-head">
        <b>
          <Eye size={15} className="inline-icon" /> Khán giả ({list.length}/{MAX_SPECTATORS})
        </b>
        {spectating ? (
          <button className="primary" disabled={!seatFree} onClick={() => emit('room:join', { code: view.code })}>
            <Armchair size={15} /> {seatFree ? 'Vào bàn chơi' : 'Bàn đã đủ người'}
          </button>
        ) : (
          view.players.length > 1 && list.length < MAX_SPECTATORS && (
            <button className="ghost" onClick={() => emit('room:watch', { code: view.code })} title="Rời ghế, chỉ ngồi xem">
              <Eye size={15} /> Chuyển sang xem
            </button>
          )
        )}
      </div>
      {list.length ? (
        <div className="spectator-list">
          {list.map((s) => (
            <span key={s.id} className={`spectator-item${s.connected ? '' : ' offline'}${s.id === meId ? ' me' : ''}`}>
              <PlayerAvatar id={s.id} avatar={s.avatar} size={26} />
              {s.name}
              {s.id === meId && <span className="muted small"> · bạn</span>}
              {isHost && (
                <button type="button" className="spectator-kick" onClick={() => emit('room:kick', { targetId: s.id })} title={`Mời ${s.name} ra`} aria-label={`Mời ${s.name} ra`}>
                  <UserX size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted small">Chưa có ai xem. Gửi mã phòng {view.code} và bấm “Xem” để vào xem.</p>
      )}
    </div>
  );
}
