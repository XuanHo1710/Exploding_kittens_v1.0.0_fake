import { useState } from 'react';
import { Check, Coins, Copy, Crown, Gamepad2, LogOut, Play, Settings2, Trophy, UserPlus, UserX } from 'lucide-react';
import {
  BET_OPTIONS,
  GAME_MODES,
  MIN_PLAYERS,
  roomDeckSummary,
  type AccountInfo,
  type GameMode,
  type RoomRules,
  type RoomView,
} from '../../../shared/src';
import { copyTextSafe, fmtCoins } from './Dock';
import PlayerAvatar from '../art/PlayerAvatar';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import RoomSettings, { RoomRuleSummary } from './RoomSettings';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat?: RoomChat;
  account?: AccountInfo | null;
  onSaveRules?: (rules: RoomRules) => void | Promise<void>;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };

export default function Lobby({ view, meId, emit, chat = NO_CHAT, account, onSaveRules }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { typingNames, unread } = useChatState(chat, view.players, meId, true);
  const isHost = view.hostId === meId;
  const gameMode: GameMode = view.gameMode ?? 'exploding_kittens';
  const modeInfo = GAME_MODES[gameMode];
  const online = view.players.filter((p) => p.connected).length;
  const bet = view.bet;
  const poor = bet > 0 ? view.players.filter((p) => p.connected && (p.coins ?? 0) < bet) : [];
  const maxPlayers = Math.min(view.rules.maxPlayers, modeInfo.maxPlayers);
  const empty = Math.max(0, maxPlayers - view.players.length);
  const me = view.players.find((player) => player.id === meId);
  const awaitingReady = view.players.filter((player) => player.connected && player.id !== view.hostId && !player.ready);
  const deck = roomDeckSummary(view.rules, online);
  const deckOk = gameMode === 'exploding_kittens' ? deck.canStart : online <= modeInfo.maxPlayers;
  const canStart = online >= modeInfo.minPlayers && awaitingReady.length === 0 && deckOk && poor.length === 0;

  const copyRoomCode = () => {
    void copyTextSafe(view.code).then((ok) => setCopied(ok));
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="center-screen">
      <div className="lobby-wrap">
        <div className="panel lobby">
          <div className="lobby-head">
            <div>
              <p className="muted">Mã phòng, bấm để sao chép và gửi cho mọi người</p>
              <button type="button" className="room-code-btn" onClick={copyRoomCode} title="Sao chép mã phòng">
                <span className="room-code">{view.code}</span>
                <span className="room-code-copy">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <small>{copied ? 'Đã chép' : 'Sao chép'}</small>
                </span>
              </button>
            </div>
            <div className="lobby-count">
              {view.players.length}/{maxPlayers}
              <span className="muted">người ({modeInfo.shortName})</span>
            </div>
          </div>

          {/* Chọn chế độ chơi trong phòng chờ */}
          <div className="bet-box mode-box">
            <div className="bet-head">
              <b>
                <Gamepad2 size={15} className="inline-icon" /> Trò chơi trong phòng
              </b>
              <span className="muted small">{isHost ? 'Chủ phòng chọn trò chơi' : 'Chủ phòng đang chọn'}</span>
            </div>
            <div className="bet-chips mode-chips">
              {(Object.keys(GAME_MODES) as GameMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`bet-chip${m === gameMode ? ' on' : ''}`}
                  disabled={!isHost}
                  onClick={() => emit('room:mode', { gameMode: m })}
                >
                  {GAME_MODES[m].emoji} {GAME_MODES[m].name}
                </button>
              ))}
            </div>
            <p className="bet-note">{modeInfo.desc}</p>
          </div>

          <div className="lobby-seats">
            {view.players.map((p) => (
              <div key={p.id} className={`lobby-seat${p.connected ? '' : ' offline'}${p.id === meId ? ' me' : ''}`}>
                {isHost && p.id !== meId && (
                  <button
                    type="button"
                    className="seat-kick-btn"
                    onClick={() => emit('room:kick', { targetId: p.id })}
                    title={`Kích ${p.name} khỏi phòng`}
                    aria-label={`Kích ${p.name} khỏi phòng`}
                  >
                    <UserX size={13} />
                  </button>
                )}
                <PlayerAvatar id={p.id} avatar={p.avatar} size={64} />
                <span className="lobby-name">
                  {p.id === view.hostId && <Crown size={14} className="inline-icon host-crown" />}
                  {p.name}
                </span>
                <span className={`small seat-readiness${p.connected && (p.id === view.hostId || p.ready) ? ' ready' : ''}`}>
                  {!p.connected ? (
                    'Mất kết nối'
                  ) : p.id === view.hostId ? (
                    'Chủ phòng · đã chốt luật'
                  ) : p.ready ? (
                    <>
                      <Check size={12} className="inline-icon" /> Đã đồng ý luật
                    </>
                  ) : (
                    'Chờ đồng ý luật'
                  )}
                  {p.id === meId && ' · bạn'}
                </span>
                {p.coins !== undefined && (
                  <span className={`seat-coins${bet > 0 && p.coins < bet ? ' low' : ''}`}>
                    <Coins size={12} className="inline-icon" /> {fmtCoins(p.coins)}
                  </span>
                )}
              </div>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <div key={`e${i}`} className="lobby-seat empty">
                <span className="empty-avatar">
                  <UserPlus size={22} />
                </span>
                <span className="muted small">trống</span>
              </div>
            ))}
          </div>

          <div className="bet-box">
            <div className="bet-head">
              <b>
                <Coins size={15} className="inline-icon" /> Cược mỗi người
              </b>
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
              {bet === 0 ? (
                'Chơi vui, không mất xu.'
              ) : gameMode === 'blackjack_21' ? (
                <>
                  Tổng hũ cược {fmtCoins(bet * online)} xu – So điểm với Nhà Cái (Xì Bàng ×3, Xì Dách / Ngũ Linh ×2){' '}
                  <Trophy size={14} className="inline-icon" />
                </>
              ) : (
                <>
                  Hũ {fmtCoins(bet * online)} xu – người thắng ván ăn trọn hũ <Trophy size={14} className="inline-icon" />
                </>
              )}
              {bet > 0 && account && account.coins < bet && <span className="bad-text"> · Bạn thiếu xu, vào Hồ sơ nhận 500 xu/ngày nhé.</span>}
            </p>
            {poor.length > 0 && <p className="bad-text small">Không đủ xu: {poor.map((p) => p.name).join(', ')}</p>}
          </div>

          <div className="lobby-rules">
            <div className="lobby-rules-head">
              <div>
                <h3>Luật đã chốt của phòng ({modeInfo.name})</h3>
                <p className="muted small">Phiên bản {view.rulesVersion} · đổi luật hoặc đổi game sẽ yêu cầu mọi người xác nhận lại.</p>
              </div>
              {isHost && gameMode === 'exploding_kittens' && (
                <button className="secondary" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={15} /> Sửa luật
                </button>
              )}
            </div>
            {gameMode === 'exploding_kittens' ? (
              <>
                <RoomRuleSummary rules={view.rules} playerCount={online} />
                <p className="muted small">Nếu chữ trên ảnh lá bài khác luật ở đây, áp dụng luật phòng đã chốt.</p>
              </>
            ) : gameMode === 'blackjack_21' ? (
              <ul className="rule-summary-list">
                <li>Bộ bài Tây 52 lá chuẩn (lưu trong <code>database/playing-cards/</code>). Chủ phòng làm <b>Nhà Cái</b>.</li>
                <li>Chia mỗi người 2 lá. <b>Xì Bàng</b> (2 lá Át), <b>Xì Dách</b> (Át + 10/J/Q/K), <b>Ngũ Linh</b> (5 lá ≤ 21 điểm).</li>
                <li>Nhà con cần đủ tuổi <b>≥ 16 điểm</b> mới được dừng; Nhà Cái cần <b>≥ 15 điểm</b> và có quyền xét bài từng người.</li>
              </ul>
            ) : (
              <ul className="rule-summary-list">
                <li>Bộ bài Tây 52 lá chuẩn (2–4 người, chuẩn 4 người mỗi người <b>13 lá</b>). Thứ tự: <b>3 &lt; 4 &lt; … &lt; A &lt; 2 (Heo)</b>; chất <b>♠ &lt; ♣ &lt; ♦ &lt; ♥</b>.</li>
                <li>Ván đầu tiên: người có lá nhỏ nhất (<b>3♠</b> khi đủ 4 người) đi trước; các ván sau người thắng đi trước.</li>
                <li>Hỗ trợ đầy đủ: <b>Rác, Đôi, Sám cô, Sảnh, Tứ Quý, 3 Đôi Thông, 4 Đôi Thông</b> chặt Heo / Đôi Heo và <b>Tới Trắng</b>!</li>
              </ul>
            )}
            {awaitingReady.length > 0 && (
              <p className="muted small" role="status">
                Chờ xác nhận: {awaitingReady.map((player) => player.name).join(', ')}.
              </p>
            )}
          </div>

          <div className="lobby-actions">
            <button className="ghost" onClick={() => emit('room:leave')}>
              <LogOut size={16} /> Rời phòng
            </button>
            {isHost ? (
              <button className="primary big" disabled={!canStart} onClick={() => emit('game:start')}>
                {online < modeInfo.minPlayers ? (
                  `Cần ít nhất ${modeInfo.minPlayers} người`
                ) : !deckOk ? (
                  'Số người hoặc bộ bài chưa hợp lệ'
                ) : poor.length > 0 ? (
                  'Có người chưa đủ xu'
                ) : awaitingReady.length > 0 ? (
                  'Chờ mọi người đồng ý luật'
                ) : (
                  <>
                    <Play size={18} /> Bắt đầu {modeInfo.shortName}
                  </>
                )}
              </button>
            ) : (
              <button className={me?.ready ? 'secondary big' : 'primary big'} onClick={() => emit('room:ready', { ready: !me?.ready, rulesVersion: view.rulesVersion })}>
                {me?.ready ? (
                  <>
                    <Check size={16} /> Đã sẵn sàng · hủy
                  </>
                ) : (
                  'Đồng ý luật & sẵn sàng'
                )}
              </button>
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
      {settingsOpen && isHost && gameMode === 'exploding_kittens' && (
        <RoomSettings
          initialRules={view.rules}
          title="Chỉnh luật của phòng"
          confirmLabel="Lưu luật & yêu cầu xác nhận lại"
          minPlayers={Math.max(MIN_PLAYERS, view.players.length)}
          onClose={() => setSettingsOpen(false)}
          onConfirm={async (rules) => {
            if (onSaveRules) await onSaveRules(rules);
            else emit('room:rules', { rules });
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
