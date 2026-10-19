import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Coins, Crown, Eye, Hand, Layers, LogOut, MessageSquare, RotateCcw, Smile, Trophy, UserX } from 'lucide-react';
import { EMOTES, QUICK_EMOTES, type Emote, type RoomView } from '../../../shared/src';
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

export default function BlackjackBoard({ view, meId, emit, emote, chat, dock }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [kickAsk, setKickAsk] = useState<{ id: string; name: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [pops, setPops] = useState<Record<string, { emoji: string; key: number }>>({});

  const { typingNames, unread } = useChatState(chat, view.players, meId, chatOpen && chatTab === 'chat');
  const bj = view.blackjack;
  const me = view.players.find((p) => p.id === meId);
  const myBj = bj?.players.find((p) => p.playerId === meId);
  const isHost = view.hostId === meId;
  const isDealer = bj?.dealerId === meId;
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

  const secs = (dl?: number) => (dl ? Math.max(0, Math.ceil((dl - now) / 1000)) : 0);
  const nameOf = (id?: string) => view.players.find((p) => p.id === id)?.name ?? '…';

  const sendEmote = (emoji: string) => {
    emit('room:emote', { emoji });
    setPickerOpen(false);
  };

  if (!bj) return null;

  return (
    <div className={`game bj-game${chatOpen ? ' with-chat' : ''}`}>
      <div className="arena">
        <div className="top-bar">
          <div className="top-left">
            <Brand code={view.code} />
            <span className="mode-pill">🃏 Rút Bài 21 (Xì Dách)</span>
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

        <div className="felt bj-felt" />

        {/* Ghế các người chơi khác trên bàn */}
        <div className={`seats${others.length >= 6 ? ' crowded' : ''}`}>
          {others.map((p, i) => {
            const n = others.length;
            const t = n === 1 ? 0.5 : i / (n - 1);
            const deg = -160 + t * 140;
            const rad = (deg * Math.PI) / 180;
            const x = Math.cos(rad) * 40;
            const y = Math.sin(rad) * 35;
            const isTurn = view.phase === 'playing' && p.id === view.currentPlayerId;
            const pBj = bj.players.find((x) => x.playerId === p.id);
            const pop = pops[p.id];
            const canRevealOne =
              view.phase === 'playing' &&
              isDealer &&
              myTurn &&
              bj.myEval.canStand &&
              p.id !== bj.dealerId &&
              p.alive &&
              !p.left &&
              pBj?.status !== 'revealed';

            return (
              <div
                key={p.id}
                className={[
                  'seat',
                  'bj-seat',
                  isTurn && 'turn',
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
                {isTurn && <span className="turn-badge">⚡ ĐANG RÚT ({secs(view.turnDeadline)}s)</span>}
                {pBj?.isDealer && (
                  <span className="dealer-badge">
                    <Crown size={12} className="inline-icon" /> NHÀ CÁI
                  </span>
                )}
                <div className={`ring${isTurn ? ' active' : ''}`}>
                  <PlayerAvatar id={p.id} avatar={p.avatar} size={isTurn ? 76 : 56} />
                </div>
                {pop && (
                  <span key={pop.key} className="emote-pop">
                    {pop.emoji}
                  </span>
                )}
                <div className="seat-name">{p.name}</div>

                {/* Bài của người chơi này (úp hoặc ngửa khi đã mở bài) */}
                <div className="bj-seat-cards">
                  {pBj?.cards ? (
                    pBj.cards.map((c) => <PlayingCardView key={c.id} card={c} size="xs" />)
                  ) : (
                    Array.from({ length: pBj?.handCount ?? 2 }, (_, k) => (
                      <PlayingCardView key={k} faceDown size="xs" />
                    ))
                  )}
                </div>

                {/* Trạng thái điểm / kết quả */}
                {pBj?.eval ? (
                  <span className={`bj-eval-tag ${pBj.eval.kind}`}>{pBj.eval.labelVi}</span>
                ) : (
                  <span className="seat-count">
                    {pBj?.status === 'stood' ? '✋ Đã dừng' : `${pBj?.handCount ?? 0} lá`}
                  </span>
                )}

                {pBj?.outcome && (
                  <span className={`bj-outcome-tag ${pBj.outcome}`}>
                    {pBj.outcome === 'win' ? '🏆 Thắng' : pBj.outcome === 'lose' ? '💀 Thua' : '🤝 Hoà'}
                    {pBj.coinDelta !== undefined && view.bet > 0 && (
                      <> ({pBj.coinDelta >= 0 ? `+${fmtCoins(pBj.coinDelta)}` : fmtCoins(pBj.coinDelta)} xu)</>
                    )}
                  </span>
                )}

                {canRevealOne && (
                  <button
                    type="button"
                    className="primary small bj-reveal-btn"
                    onClick={() => {
                      sfx('play');
                      emit('blackjack:reveal_one', { targetId: p.id });
                    }}
                  >
                    <Eye size={13} /> Xét bài
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Giữa bàn: Chồng bài Tây 52 lá & Bảng kết quả */}
        <div className="table-center bj-center">
          <div className="bj-deck-wrap">
            <PlayingCardView faceDown count={bj.deckCount} size="md" />
            <span className="pile-label">Bộ bài Tây ({bj.deckCount} lá)</span>
          </div>

          <div className="bj-center-info">
            {view.phase === 'playing' ? (
              <div className="bj-turn-banner">
                <h3>
                  {myTurn
                    ? isDealer
                      ? '👑 Lượt Nhà Cái của bạn: Rút thêm hoặc Xét bài!'
                      : '⚡ Tới lượt bạn: Rút thêm hay Dừng?'
                    : `Đang chờ ${nameOf(view.currentPlayerId)} thao tác (${secs(view.turnDeadline)}s)…`}
                </h3>
                <p className="muted small">
                  Nhà con cần ≥ 16 điểm (Đủ tuổi) · Nhà cái cần ≥ 15 điểm · 5 lá ≤ 21 điểm = Ngũ Linh!
                </p>
              </div>
            ) : (
              <div className="ended-banner bj-ended">
                <h2>
                  <Trophy size={22} className="inline-icon" /> Kết quả ván Xì Dách 21
                </h2>
                <div className="bj-summary-list">
                  {bj.players.map((bp) => {
                    const pl = view.players.find((x) => x.id === bp.playerId);
                    return (
                      <div key={bp.playerId} className={`bj-summary-row ${bp.outcome ?? ''}`}>
                        <span>
                          <b>{pl?.name}</b> {bp.isDealer ? '(👑 Nhà Cái)' : ''}
                        </span>
                        <span>{bp.eval?.labelVi}</span>
                        <span>{bp.outcomeText}</span>
                        {view.bet > 0 && bp.coinDelta !== undefined && (
                          <b className={bp.coinDelta >= 0 ? 'good-text' : 'bad-text'}>
                            {bp.coinDelta >= 0 ? `+${fmtCoins(bp.coinDelta)}` : fmtCoins(bp.coinDelta)} xu
                          </b>
                        )}
                      </div>
                    );
                  })}
                </div>
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
            )}
          </div>
        </div>
      </div>

      {/* Khu vực bài của bản thân */}
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
                {isDealer && (
                  <span className="dealer-badge">
                    <Crown size={12} className="inline-icon" /> NHÀ CÁI
                  </span>
                )}
                <span className={`bj-eval-tag ${bj.myEval.kind}`}>{bj.myEval.labelVi}</span>
                {myBj?.outcome && (
                  <span className={`bj-outcome-tag ${myBj.outcome}`}>
                    {myBj.outcome === 'win' ? '🏆 Thắng' : myBj.outcome === 'lose' ? '💀 Thua' : '🤝 Hoà'}
                    {myBj.coinDelta !== undefined && view.bet > 0 && (
                      <> ({myBj.coinDelta >= 0 ? `+${fmtCoins(myBj.coinDelta)}` : fmtCoins(myBj.coinDelta)} xu)</>
                    )}
                  </span>
                )}
              </div>
              <span className="muted small">
                {myTurn
                  ? `Còn ${secs(view.turnDeadline)}s — Chọn Rút thêm bài hoặc Dừng bài`
                  : view.phase === 'playing'
                    ? `Đang chờ ${nameOf(view.currentPlayerId)}…`
                    : myBj?.outcomeText ?? 'Ván đã kết thúc'}
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
            {myTurn && (
              <>
                <button
                  className="primary big"
                  disabled={!bj.myEval.canHit}
                  onClick={() => {
                    sfx('draw');
                    emit('blackjack:hit');
                  }}
                >
                  <Layers size={17} /> Rút thêm bài (Hit)
                </button>
                <button
                  className="secondary big"
                  disabled={!bj.myEval.canStand}
                  onClick={() => {
                    sfx('play');
                    emit('blackjack:stand');
                  }}
                  title={!bj.myEval.canStand ? `Cần đủ ít nhất ${isDealer ? 15 : 16} điểm mới được dừng` : undefined}
                >
                  <Hand size={17} /> {isDealer ? 'Mở bài & So điểm tất cả' : `Dừng bài (${bj.myEval.points}đ)`}
                </button>
              </>
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

        <div className="hand bj-hand">
          {bj.hand.map((c) => (
            <PlayingCardView key={c.id} card={c} size="lg" />
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
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Thoát trận 21?</span>} width={420}>
          <p>
            Ván đang diễn ra, thoát bây giờ sẽ bị tính là <b>bỏ cuộc (Quắc)</b>
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
