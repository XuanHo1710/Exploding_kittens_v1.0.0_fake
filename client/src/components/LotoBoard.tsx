/**
 * Màn chơi Lô Tô Cân Đồ: máy gọi 1 số mỗi 5 giây (có đọc số), số trúng tự đóng dấu trên tờ của mình,
 * hàng còn thiếu 1 số sáng "CHỜ", ai đủ 5 số một hàng ngang trước là KINH.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LogOut, MessageSquare, RotateCcw, Trophy } from 'lucide-react';
import {
  LOTO_CALL_MS,
  LOTO_COLORS,
  LOTO_MAX,
  lotoRowHits,
  type LotoSheet,
  type RoomView,
} from '../../../shared/src';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { isSpectating, roomPeople } from './Spectators';
import { fmtCoins } from './Dock';
import Modal from './Modal';
import { isMuted, sfx } from '../sfx';
import '../loto.css';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

/** Màu quả bóng theo chục */
const BALL_COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#7048e8', '#c2255c', '#0c8599', '#e8590c', '#5f3dc4'];
const ballColor = (n: number) => BALL_COLORS[n >= 80 ? 8 : Math.floor(n / 10)];

/** Đọc số bằng giọng tiếng Việt của trình duyệt (nếu có) */
function speak(text: string) {
  if (isMuted()) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const vi = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    u.rate = 1.02;
    u.pitch = 1.05;
    synth.speak(u);
  } catch {
    /* trình duyệt không hỗ trợ đọc */
  }
}

/** Câu rao số kiểu lô tô hội chợ */
function callText(n: number) {
  const special: Record<number, string> = {
    1: 'Số một, con gà mái đẻ trứng một',
    9: 'Chín, chín nút, lên chùa thắp hương',
    10: 'Mười, mười phân vẹn mười',
    11: 'Mười một, hai cây gậy đứng chung',
    22: 'Hai mươi hai, hai con vịt bầu',
    33: 'Ba mươi ba, ba ba ba ba',
    44: 'Bốn mươi bốn, bốn bốn tứ tứ',
    55: 'Năm mươi lăm, năm năm năm năm',
    66: 'Sáu mươi sáu, lộc lộc phát tài',
    77: 'Bảy mươi bảy, hai cây cuốc chim',
    88: 'Tám mươi tám, phát phát phát tài',
    90: 'Chín mươi, số cuối ông ba mươi',
  };
  return special[n] ?? `Số ${n}`;
}

function SheetView({ sheet, called, last, winRows, idx }: { sheet: LotoSheet; called: Set<number>; last?: number; winRows: Set<number>; idx: number }) {
  const col = LOTO_COLORS[sheet.color];
  return (
    <div className={`loto-sheet c-${sheet.color}`} style={{ ['--sheet' as string]: col.main, ['--sheet-soft' as string]: col.soft, ['--sheet-deep' as string]: col.deep }}>
      <div className="loto-sheet-head">
        <span>✿ LÔ TÔ ✿</span>
        <b>Tờ {idx + 1} · {col.name}</b>
      </div>
      {[0, 1, 2].map((block) => (
        <div key={block} className="loto-block">
          {sheet.rows.slice(block * 3, block * 3 + 3).map((row, k) => {
            const r = block * 3 + k;
            const hits = lotoRowHits(row, called);
            const state = winRows.has(r) ? ' win' : hits === 4 ? ' wait' : '';
            return (
              <div key={r} className={`loto-row${state}`}>
                {row.map((n, c) => (
                  <span key={c} className={`loto-cell${n ? '' : ' blank'}${n && called.has(n) ? ' hit' : ''}${n && n === last ? ' fresh' : ''}`}>
                    {n || ''}
                  </span>
                ))}
                {state === ' wait' && <i className="loto-row-tag">CHỜ</i>}
                {state === ' win' && <i className="loto-row-tag win">KINH</i>}
              </div>
            );
          })}
          {block < 2 && <div className="loto-strip">❀ ❀ ❀ Tấn tài tấn lộc ❀ ❀ ❀</div>}
        </div>
      ))}
    </div>
  );
}

export default function LotoBoard({ view, meId, emit, chat, dock }: Props) {
  const loto = view.loto!;
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');
  const spectating = isSpectating(view, meId);
  const ended = view.phase === 'ended';
  const isHost = view.hostId === meId;

  const called = useMemo(() => new Set(loto.called), [loto.called]);
  const last = loto.called.at(-1);
  const recent = loto.called.slice(-7, -1).reverse();
  const mine = loto.mine ?? [];

  // thời điểm gọi số kế tiếp theo đồng hồ máy mình
  const nextAt = useRef(0);
  useEffect(() => {
    nextAt.current = loto.nextIn !== undefined ? Date.now() + loto.nextIn : 0;
  }, [loto.nextIn, loto.called.length]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const nextLeft = nextAt.current ? Math.max(0, nextAt.current - now) : 0;

  // số mới: rao + tiếng bóng; hàng của mình vừa thành CHỜ: báo chuông
  const seenLen = useRef(loto.called.length);
  const myWaiting = mine.reduce((s, sh) => s + sh.rows.filter((row) => lotoRowHits(row, called) === 4).length, 0);
  const seenWaiting = useRef(myWaiting);
  useEffect(() => {
    if (loto.called.length > seenLen.current && last !== undefined) {
      sfx('draw');
      if (!ended) speak(callText(last));
    }
    seenLen.current = loto.called.length;
    if (myWaiting > seenWaiting.current && !ended) window.setTimeout(() => sfx('turn'), 450);
    seenWaiting.current = myWaiting;
  }, [loto.called.length, last, myWaiting, ended]);

  const wins = loto.wins ?? [];
  const winnerIds = [...new Set(wins.map((w) => w.playerId))];
  const iWon = winnerIds.includes(meId);
  const seenEnd = useRef(false);
  useEffect(() => {
    if (!ended || seenEnd.current || !wins.length) return;
    seenEnd.current = true;
    sfx('win');
    const names = winnerIds.map((id) => view.players.find((p) => p.id === id)?.name ?? '').join(' và ');
    window.setTimeout(() => speak(`Kinh! ${names} kinh rồi!`), 700);
  }, [ended, wins.length]);

  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '…';
  const winRowsOf = (sheet: number) => new Set(wins.filter((w) => w.playerId === meId && w.sheet === sheet).map((w) => w.row));
  const players = [...(loto.players ?? [])].sort((a, b) => b.best - a.best || b.waiting - a.waiting);

  return (
    <div className="loto-game">
      <header className="loto-top">
        <div className="loto-brand">
          🎱 <b>LÔ TÔ CÂN ĐỒ</b>
        </div>
        <div className="loto-top-mid">
          {view.pot > 0 && <span className="loto-pot">🪙 Hũ {fmtCoins(view.pot)} xu</span>}
          <span className="loto-count">Đã gọi <b>{loto.called.length}</b>/{LOTO_MAX}</span>
        </div>
        <div className="loto-top-right">
          <button className={`loto-icon${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)} title="Trò chuyện">
            <MessageSquare size={17} />
            {unread > 0 && !chatOpen && <span className="loto-badge">{unread}</span>}
          </button>
          <div className="loto-dock">{dock}</div>
          <button className="loto-icon" onClick={() => (ended || spectating ? emit('room:leave') : setLeaveAsk(true))} title="Rời ván">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <section className="loto-caller">
        <div className="loto-ball-wrap">
          {last !== undefined ? (
            <div key={last} className="loto-ball big" style={{ ['--ball' as string]: ballColor(last) }}>
              <span>{last}</span>
            </div>
          ) : (
            <div className="loto-ball big idle"><span>?</span></div>
          )}
          {!ended && (
            <svg className="loto-timer" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="46" />
              <circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: `${289 * (1 - nextLeft / LOTO_CALL_MS)}` }} />
            </svg>
          )}
        </div>
        <div className="loto-caller-info">
          <div className="loto-call-text">{last !== undefined ? callText(last) : 'Chuẩn bị gọi số…'}</div>
          <div className="muted small">{ended ? 'Ván đã kết thúc' : `Số kế tiếp sau ${Math.ceil(nextLeft / 1000)} giây`}</div>
          <div className="loto-recent">
            {recent.map((n) => (
              <span key={n} className="loto-ball small" style={{ ['--ball' as string]: ballColor(n) }}><span>{n}</span></span>
            ))}
          </div>
        </div>
      </section>

      <main className="loto-main">
        <div className="loto-sheets">
          {spectating || !mine.length ? (
            <p className="muted loto-empty">Bạn đang xem ván này – theo dõi bảng số bên cạnh nhé.</p>
          ) : (
            mine.map((sheet, i) => <SheetView key={i} idx={i} sheet={sheet} called={called} last={last} winRows={winRowsOf(i)} />)
          )}
        </div>
        <aside className="loto-side">
          <div className="loto-board90" aria-label="Bảng 90 số">
            {Array.from({ length: LOTO_MAX }, (_, i) => i + 1).map((n) => (
              <span key={n} className={`${called.has(n) ? 'on' : ''}${n === last ? ' last' : ''}`} style={called.has(n) ? { ['--ball' as string]: ballColor(n) } : undefined}>
                {n}
              </span>
            ))}
          </div>
          <ul className="loto-players">
            {players.map((p) => (
              <li key={p.id} className={`${p.id === meId ? 'me' : ''}${winnerIds.includes(p.id) ? ' won' : ''}${p.waiting ? ' waiting' : ''}`}>
                <span className="name">{p.name}{p.id === meId ? ' (bạn)' : ''}</span>
                <span className="muted small">{p.sheets} tờ</span>
                {winnerIds.includes(p.id) ? (
                  <b className="tag win">KINH!</b>
                ) : p.waiting ? (
                  <b className="tag wait">CHỜ {p.waiting > 1 ? `${p.waiting} hàng` : ''}</b>
                ) : (
                  <span className="muted small">{p.best}/5</span>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </main>

      {ended && (
        <div className="loto-overlay">
          <div className="loto-card">
            <h2 className={iWon ? 'win' : ''}>
              <Trophy size={24} className="inline-icon" /> {wins.length ? (iWon ? 'BẠN KINH RỒI!' : `${winnerIds.map(nameOf).join(', ')} KINH!`) : 'HẾT SỐ'}
            </h2>
            {wins.map((w, i) => (
              <div key={i} className="loto-win-row">
                <span className="muted small">{nameOf(w.playerId)} · tờ {LOTO_COLORS[w.color].name}</span>
                <div>
                  {w.numbers.map((n) => (
                    <span key={n} className={`loto-ball small${n === last ? ' pulse' : ''}`} style={{ ['--ball' as string]: ballColor(n) }}><span>{n}</span></span>
                  ))}
                </div>
              </div>
            ))}
            {view.pot > 0 && (
              <p className="loto-prize">
                {winnerIds.length > 1 ? `Chia đều hũ ${fmtCoins(view.pot)} xu` : `Ăn trọn hũ ${fmtCoins(view.pot)} xu`} 🪙
              </p>
            )}
            <p className="muted small">Số chốt: {last} · đã gọi {loto.called.length} số</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => emit('room:leave')}><LogOut size={16} /> Rời phòng</button>
              {isHost ? (
                <button className="primary big" onClick={() => emit('game:restart')}><RotateCcw size={17} /> Về phòng chờ</button>
              ) : (
                <span className="muted small">Chờ chủ phòng mở ván mới…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="loto-chat">
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
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Rời ván Lô Tô?</span>} width={420}>
          <p>
            Rời bây giờ thì tờ của bạn <b>không được tính KINH</b> nữa
            {view.pot > 0 && <> và bạn mất số xu đã mua tờ</>}.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setLeaveAsk(false)}>Ở lại</button>
            <button className="primary big danger" onClick={() => { setLeaveAsk(false); emit('room:leave'); }}>Rời ván</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
