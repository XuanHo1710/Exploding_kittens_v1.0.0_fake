import { BET_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, type AccountInfo, type RoomView } from '../../../shared/src';
import { fmtCoins } from './Dock';
import PlayerAvatar from '../art/PlayerAvatar';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat?: RoomChat;
  account?: AccountInfo | null;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };

export default function Lobby({ view, meId, emit, chat = NO_CHAT, account }: Props) {
  const { typingNames, unread } = useChatState(chat, view.players, meId, true);
  const isHost = view.hostId === meId;
  const online = view.players.filter((p) => p.connected).length;
  const bet = view.bet;
  const poor = bet > 0 ? view.players.filter((p) => p.connected && (p.coins ?? 0) < bet) : [];
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
              {p.coins !== undefined && <span className={`seat-coins${bet > 0 && p.coins < bet ? ' low' : ''}`}>🪙 {fmtCoins(p.coins)}</span>}
            </div>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <div key={`e${i}`} className="lobby-seat empty">
              <span className="empty-avatar">?</span>
              <span className="muted small">trống</span>
            </div>
          ))}
        </div>
        <div className="bet-box">
          <div className="bet-head">
            <b>💰 Cược mỗi người</b>
            <span className="muted small">{isHost ? 'Chủ phòng chọn' : 'Chủ phòng đang chọn'}</span>
          </div>
          <div className="bet-chips">
            {BET_OPTIONS.map((b) => (
              <button key={b} className={`bet-chip${b === bet ? ' on' : ''}`} disabled={!isHost} onClick={() => emit('room:bet', { amount: b })}>
                {b === 0 ? 'Miễn phí' : `${fmtCoins(b)} xu`}
              </button>
            ))}
          </div>
          <p className="bet-note">
            {bet === 0
              ? 'Chơi vui, không mất xu.'
              : `Hũ ${fmtCoins(bet * online)} xu – người sống sót cuối cùng ăn hết 🏆`}
            {bet > 0 && account && account.coins < bet && <span className="bad-text"> · Bạn thiếu xu, vào Hồ sơ nhận 500 xu/ngày nhé.</span>}
          </p>
          {poor.length > 0 && <p className="bad-text small">Không đủ xu: {poor.map((p) => p.name).join(', ')}</p>}
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
