import { MAX_PLAYERS, MIN_PLAYERS, type RoomView } from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat?: RoomChat;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };

export default function Lobby({ view, meId, emit, chat = NO_CHAT }: Props) {
  const { typingNames, unread } = useChatState(chat, view.players, meId, true);
  const isHost = view.hostId === meId;
  const online = view.players.filter((p) => p.connected).length;
  const empty = Math.max(0, MAX_PLAYERS - view.players.length);
  return (
    <div className="center-screen">
      <div className="lobby-wrap">
      <div className="panel lobby">
        <div className="lobby-head">
          <div>
            <p className="muted">Mã phòng, gửi cho mọi người</p>
            <div className="room-code">{view.code}</div>
          </div>
          <div className="lobby-count">
            {view.players.length}/{MAX_PLAYERS}
            <span className="muted">người</span>
          </div>
        </div>
        <div className="lobby-seats">
          {view.players.map((p) => (
            <div key={p.id} className={`lobby-seat${p.connected ? '' : ' offline'}${p.id === meId ? ' me' : ''}`}>
              <PlayerAvatar id={p.id} avatar={p.avatar} size={64} />
              <span className="lobby-name">
                {p.id === view.hostId && '👑 '}
                {p.name}
              </span>
              <span className="muted small">{p.id === meId ? 'bạn' : p.connected ? 'sẵn sàng' : 'mất kết nối'}</span>
            </div>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <div key={`e${i}`} className="lobby-seat empty">
              <span className="empty-avatar">?</span>
              <span className="muted small">trống</span>
            </div>
          ))}
        </div>
        <div className="lobby-actions">
          <button className="ghost" onClick={() => emit('room:leave')}>
            Rời phòng
          </button>
          {isHost ? (
            <button className="primary big" disabled={online < MIN_PLAYERS} onClick={() => emit('game:start')}>
              {online < MIN_PLAYERS ? `Cần ít nhất ${MIN_PLAYERS} người` : '▶ Bắt đầu'}
            </button>
          ) : (
            <span className="muted">Đợi chủ phòng bắt đầu…</span>
          )}
        </div>
      </div>
      <div className="lobby-chat">
        <ChatPanel
          messages={chat.messages}
          meId={meId}
          typingNames={typingNames}
          onSend={chat.send}
          onTyping={chat.onTyping}
          tab="chat"
          onTab={() => {}}
          unread={unread}
        />
      </div>
      </div>
    </div>
  );
}
