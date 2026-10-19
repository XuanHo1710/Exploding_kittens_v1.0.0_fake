import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Coins, LogOut, MessageSquare, Play, RotateCcw, SkipForward, Smile, Trophy, UserX, X } from 'lucide-react';
import {
  EMOTES,
  QUICK_EMOTES,
  canBeatTienLenCombo,
  detectTienLenCombo,
  type Emote,
  type RoomView,
  PLAYING_CARD_BY_CODE,
} from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';
import { fmtCoins, Brand } from './Dock';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import Modal from './Modal';
import PlayingCardView from './PlayingCardView';
import { sfx } from '../sfx';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  emote: { id: number; e: Emote } | null;
  chat: RoomChat;
  dock: ReactNode;
}

export default function TienLenBoard({ view, meId, emit, emote, chat, dock }: Props) {
  const [sel, setSel] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [kickAsk, setKickAsk] = useState<{ id: string; name: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pops, setPops] = useState<Record<string, { emoji: string; key: number }>>({});

  const { typingNames, unread } = useChatState(chat, view.players, meId, chatOpen && chatTab === 'chat');
  const tl = view.tienLen;
  const me = view.players.find((p) => p.id === meId);
  const isHost = view.hostId === meId;
  const myTurn = view.phase === 'playing' && view.currentPlayerId === meId;
  const others = view.players.filter((p) => p.id !== meId);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!emote) return;
    const { from, emoji } = emote.e;
    setPops((p) => ({ ...p, [from]: { emoji, key: emote.id } }));
  }, [emote]);

  // Lọc bỏ các lá đã đánh khỏi danh sách đang chọn
  useEffect(() => {
    if (!tl) return;
    const handIds = new Set(tl.hand.map((c) => c.id));
    setSel((prev) => prev.filter((id) => handIds.has(id)));
  }, [tl?.hand]);

  const secs = (dl?: number) => (dl ? Math.max(0, Math.ceil((dl - now) / 1000)) : 0);
  const nameOf = (id?: string) => view.players.find((p) => p.id === id)?.name ?? '…';

  const sendEmote = (emoji: string) => {
    emit('room:emote', { emoji });
    setPickerOpen(false);
  };

  if (!tl) return null;

  const selectedCards = tl.hand.filter((c) => sel.includes(c.id));
  const combo = detectTienLenCombo(selectedCards);
  const beatCheck = combo ? canBeatTienLenCombo(tl.tableCombo, combo) : null;
  const isFourPairsInterrupt = combo?.kind === 'four_pairs' && !!tl.tableCombo && !!beatCheck?.ok;
  const canPlayCombo =
    view.phase === 'playing' &&
    !!combo &&
    !!beatCheck?.ok &&
    (myTurn || isFourPairsInterrupt) &&
    (!tl.firstTurnOfMatch || !tl.mustIncludeLowest || combo.cards.some((c) => c.code === tl.mustIncludeLowest));
  const canPass = view.phase === 'playing' && myTurn && !!tl.tableCombo && tl.lastActorId !== meId;

  const toggleCard = (id: string) => {
    sfx('select');
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const playSelected = () => {
    if (!canPlayCombo) return;
    sfx('play');
    emit('tienlen:play', { cardIds: sel });
    setSel([]);
  };

  return (
    <div className={`game tl-game${chatOpen ? ' with-chat' : ''}`}>
      <div className="arena">
        <div className="top-bar">
          <div className="top-left">
            <Brand code={view.code} />
            <span className="mode-pill">🎴 Tiến Lên Miền Nam (4 Người)</span>
            {view.pot > 0 && (
              <span className="pot-badge" title={`Mỗi người cược ${view.bet} xu`}>
                <Coins size={14} className="inline-icon" /> Hũ {fmtCoins(view.pot)} xu (Cược {fmtCoins(view.bet)})
              </span>
            )}
          </div>
          <div className="top-right">
            {dock}
            <button
              className={`icon-btn chat-btn${chatOpen ? ' on' : ''}`}
              onClick={() => setChatOpen((o) => !o)}
              title="Trò chuyện & Nhật ký"
            >
              <MessageSquare size={17} />
              {unread > 0 && <span className="chat-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <button
              className="icon-btn leave-btn"
              onClick={() => (view.phase === 'playing' ? setLeaveAsk(true) : emit('room:leave'))}
              title="Rời phòng"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        <div className="felt tl-felt" />

        {tl.chopLog && <div className="announce transfer">{tl.chopLog}</div>}

        {/* Ghế các đối thủ quanh bàn Tiến Lên */}
        <div className="seats">
          {others.map((p, i) => {
            const n = others.length;
            const t = n === 1 ? 0.5 : i / (n - 1);
            const deg = -160 + t * 140;
            const rad = (deg * Math.PI) / 180;
            const x = Math.cos(rad) * 40;
            const y = Math.sin(rad) * 35;
            const isTurn = view.phase === 'playing' && p.id === view.currentPlayerId;
            const passed = tl.passedIds.includes(p.id);
            const pop = pops[p.id];

            return (
              <div
                key={p.id}
                className={[
                  'seat',
                  'tl-seat',
                  isTurn && 'turn',
                  passed && 'passed',
                  !p.alive && 'dead',
                  !p.connected && 'offline',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--x' as string]: x, ['--y' as string]: y } as CSSProperties}
              >
                {isHost && !p.left && view.phase === 'lobby' && (
                  <button
                    type="button"
                    className="seat-kick-btn"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setKickAsk({ id: p.id, name: p.name });
                    }}
                    title={`Kích ${p.name} khỏi trận`}
                  >
                    <UserX size={13} />
                  </button>
                )}
                {isTurn && <span className="turn-badge">⚡ ĐANG ĐÁNH ({secs(view.turnDeadline)}s)</span>}
                <div className={`ring${isTurn ? ' active' : ''}`}>
                  <PlayerAvatar id={p.id} avatar={p.avatar} size={isTurn ? 76 : 56} />
                </div>
                {pop && (
                  <span key={pop.key} className="emote-pop">
                    {pop.emoji}
                  </span>
                )}
                <div className="seat-name">{p.name}</div>
                <div className="seat-cards">
                  <span className="seat-count">🎴 {p.handCount} lá</span>
                </div>
                {passed && <span className="tl-pass-tag">⏭️ Bỏ vòng</span>}
              </div>
            );
          })}
        </div>

        {/* Giữa bàn: Bộ bài vừa đánh ra */}
        <div className="table-center tl-center">
          {view.phase === 'ended' ? (
            <div className="ended-banner">
              <h2>
                <Trophy size={22} className="inline-icon" />{' '}
                {view.winnerId === meId ? 'Bạn đã VỀ NHẤT!' : `${nameOf(view.winnerId)} đã VỀ NHẤT!`}
              </h2>
              {tl.instantWinText && <p className="good-text">✨ {tl.instantWinText}</p>}
              {view.pot > 0 && view.winnerId && (
                <p className="pot-win">
                  <Coins size={16} className="inline-icon" /> {nameOf(view.winnerId)} ẵm trọn hũ{' '}
                  <b>{fmtCoins(view.pot)} xu</b>!
                </p>
              )}
              <div className="ended-actions">
                {isHost ? (
                  <button className="primary big" onClick={() => emit('game:restart')}>
                    <RotateCcw size={17} /> Về phòng chờ / Ván mới
                  </button>
                ) : (
                  <span className="muted">Chờ chủ phòng mở ván mới…</span>
                )}
              </div>
            </div>
          ) : tl.tableCombo ? (
            <div className="tl-table-combo">
              <div className="lp-head">
                <PlayerAvatar id={tl.lastActorId ?? ''} avatar={view.players.find((p) => p.id === tl.lastActorId)?.avatar} size={24} />
                <span>
                  <b>{nameOf(tl.lastActorId)}</b> đánh <b>{tl.tableCombo.labelVi}</b>
                </span>
              </div>
              <div className="tl-combo-cards">
                {tl.tableCombo.cards.map((c) => (
                  <PlayingCardView key={c.id} card={c} size="md" />
                ))}
              </div>
            </div>
          ) : (
            <div className="tl-empty-table">
              <h3>
                {myTurn
                  ? '✨ Bạn cầm cái mở vòng mới — Hãy chọn bộ bài bất kỳ để đánh!'
                  : `Đang chờ ${nameOf(view.currentPlayerId)} mở vòng mới…`}
              </h3>
              {tl.firstTurnOfMatch && tl.mustIncludeLowest && (
                <p className="muted small">
                  Lượt mở màn ván đầu tiên cần đánh bộ có chứa lá nhỏ nhất ({PLAYING_CARD_BY_CODE[tl.mustIncludeLowest] ? `${PLAYING_CARD_BY_CODE[tl.mustIncludeLowest].rank}${PLAYING_CARD_BY_CODE[tl.mustIncludeLowest].suitSymbol}` : tl.mustIncludeLowest}).
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Khu vực bài trên tay của bản thân */}
      <div className={`my-area${myTurn ? ' my-turn' : ''}`}>
        <div className="my-bar">
          <div className="my-status">
            <div className={`ring${myTurn ? ' active my-turn-avatar' : ''}`}>
              <PlayerAvatar id={meId} avatar={me?.avatar} size={myTurn ? 68 : 52} />
              {myTurn && <span className="my-turn-badge">⚡ LƯỢT BẠN</span>}
            </div>
            <div>
              <div className="my-name-row">
                <b>{me?.name}</b>
                <span className="seat-count">Còn {tl.hand.length} lá</span>
                {tl.passedIds.includes(meId) && <span className="tl-pass-tag">⏭️ Đã bỏ vòng</span>}
              </div>
              <span className="muted small">
                {sel.length > 0
                  ? combo
                    ? beatCheck?.ok
                      ? `✅ Bộ hợp lệ: ${combo.labelVi}`
                      : `⚠️ ${combo.labelVi} — ${beatCheck?.reason}`
                    : `⚠️ ${sel.length} lá đang chọn chưa tạo thành bộ Tiến Lên hợp lệ`
                  : myTurn
                    ? `Còn ${secs(view.turnDeadline)}s — Chọn các lá bài để đánh hoặc Bỏ lượt`
                    : `Đang chờ ${nameOf(view.currentPlayerId)}…`}
              </span>
            </div>
            <div className="quick-emotes">
              {QUICK_EMOTES.map((e) => (
                <button key={e} className="qe-btn" onClick={() => sendEmote(e)}>
                  {e}
                </button>
              ))}
              <button className={`qe-btn more${pickerOpen ? ' on' : ''}`} onClick={() => setPickerOpen((o) => !o)}>
                <Smile size={16} />
              </button>
            </div>
          </div>

          <div className="my-actions">
            {sel.length > 0 && (
              <button className="ghost" onClick={() => setSel([])}>
                <X size={15} /> Bỏ chọn ({sel.length})
              </button>
            )}
            <button className="primary big" disabled={!canPlayCombo} onClick={playSelected}>
              <Play size={16} /> {combo ? `Đánh ${combo.labelVi}` : 'Đánh bài'}
            </button>
            {canPass && (
              <button
                className="secondary big"
                onClick={() => {
                  sfx('tap');
                  emit('tienlen:pass');
                  setSel([]);
                }}
              >
                <SkipForward size={16} /> Bỏ lượt
              </button>
            )}
          </div>
        </div>

        {pickerOpen && (
          <div className="emote-picker" role="dialog" aria-label="Biểu cảm">
            <div className="emote-title">Thả biểu cảm</div>
            <div className="emote-grid">
              {EMOTES.map((e) => (
                <button key={e} onClick={() => sendEmote(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hand tl-hand">
          {tl.hand.map((c) => (
            <PlayingCardView
              key={c.id}
              card={c}
              size="lg"
              selected={sel.includes(c.id)}
              onClick={() => toggleCard(c.id)}
            />
          ))}
        </div>
      </div>

      {chatOpen && (
        <div className="chat-col">
          <ChatPanel
            messages={chat.messages}
            meId={meId}
            typingNames={typingNames}
            onSend={chat.send}
            onTyping={chat.onTyping}
            tab={chatTab}
            onTab={setChatTab}
            unread={unread}
            onClose={() => setChatOpen(false)}
            log={view.log}
            logTotal={view.logTotal}
          />
        </div>
      )}

      {leaveAsk && (
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Thoát trận Tiến Lên?</span>} width={420}>
          <p>
            Ván đang diễn ra, thoát bây giờ sẽ bị tính là <b>thua</b>
            {view.pot > 0 && <> và mất số xu đã cược</>}.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setLeaveAsk(false)}>
              Ở lại chơi
            </button>
            <button
              className="primary big danger"
              onClick={() => {
                setLeaveAsk(false);
                emit('room:leave');
              }}
            >
              Thoát trận
            </button>
          </div>
        </Modal>
      )}

      {kickAsk && (
        <Modal title={<span className="modal-title-icon"><UserX size={19} /> Kích {kickAsk.name} khỏi trận?</span>} width={420} onClose={() => setKickAsk(null)}>
          <p>
            Người chơi <b>{kickAsk.name}</b> sẽ bị loại khỏi ván hiện tại và buộc rời phòng ngay lập tức.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setKickAsk(null)}>
              Huỷ
            </button>
            <button
              className="primary big danger"
              onClick={() => {
                emit('room:kick', { targetId: kickAsk.id });
                setKickAsk(null);
              }}
            >
              <UserX size={16} /> Kích ngay
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
