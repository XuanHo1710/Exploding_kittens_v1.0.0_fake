/**
 * Cột bên phải: Chat real-time + Diễn biến.
 * - Tin của mình bên phải, người khác bên trái kèm avatar
 * - Enter để gửi, bảng emoji chèn vào tin, 6 emoji gửi nhanh
 * - "… đang gõ", nút "Tin mới" khi đang cuộn lên xem tin cũ
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, MessageSquare, Pencil, ScrollText, Send, Smile, X } from 'lucide-react';
import { CHAT_MAX_LEN, QUICK_EMOTES, type ChatMessage } from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';

export type ChatTab = 'chat' | 'log';

interface Props {
  messages: ChatMessage[];
  meId: string;
  typingNames: string[];
  onSend: (text: string) => void;
  onTyping: () => void;
  tab: ChatTab;
  onTab: (t: ChatTab) => void;
  unread: number;
  onClose?: () => void;
  /** Có thì hiện tab Diễn biến */
  log?: string[];
  logTotal?: number;
}

const EMOJI_PICK = ['😀', '😂', '🤣', '😅', '🥲', '😎', '🤔', '🙄', '😬', '😱', '😭', '😤', '🤡', '💀', '🥳', '😴', '🤫', '🫵', '👍', '👎', '👏', '🙏', '🔥', '❤️', '💣', '🐱', '🙈', '💩'];
const STARTERS = ['Chào cả nhà', 'Ai cầm Nope vậy?', 'Sắp nổ rồi!', 'GG!'];

const time = (at: number) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const emojiOnly = (t: string) => /^(\p{Extended_Pictographic}|️|‍|\s)+$/u.test(t) && [...t.replace(/\s/g, '')].length <= 6;

export default function ChatPanel({ messages, meId, typingNames, onSend, onTyping, tab, onTab, unread, onClose, log, logTotal = 0 }: Props) {
  const [text, setText] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  /** Nhảy thẳng xuống tin mới nhất (không hiệu ứng trượt) */
  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  // mở chat / đổi tab: luôn đứng ở cuối
  useLayoutEffect(() => {
    if (tab === 'chat') {
      scrollToBottom();
      setAtBottom(true);
    }
  }, [tab]);
  // tin mới: đang ở cuối (hoặc mình gửi) thì giữ ở cuối, đang xem tin cũ thì hiện nút "Tin mới"
  useLayoutEffect(() => {
    const last = messages.at(-1);
    if (atBottom || last?.from === meId) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    onSend(v.slice(0, CHAT_MAX_LEN));
    setText('');
    setPickOpen(false);
    inputRef.current?.focus();
  };

  const insertEmoji = (e: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + e + text.slice(end)).slice(0, CHAT_MAX_LEN);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  };

  return (
    <aside className="chat-panel">
      <div className="chat-tabs">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => onTab('chat')}>
          <MessageSquare size={15} /> Chat {unread > 0 && tab !== 'chat' && <span className="badge">{unread}</span>}
        </button>
        {log && (
          <button className={tab === 'log' ? 'on' : ''} onClick={() => onTab('log')}>
            <ScrollText size={15} /> Diễn biến
          </button>
        )}
        {onClose && (
          <button className="chat-close" onClick={onClose} aria-label="Thu gọn" title="Thu gọn">
            <X size={16} />
          </button>
        )}
      </div>

      {tab === 'chat' ? (
        <>
          <div
            className="chat-list"
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
            }}
          >
            {!messages.length && (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <MessageSquare size={32} strokeWidth={1.6} />
                </div>
                <p>Chưa có tin nhắn nào. Mở lời trước đi!</p>
                <div className="chat-starters">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = m.from === meId;
              const prev = messages[i - 1];
              const grouped = prev && prev.from === m.from && m.at - prev.at < 120_000;
              const big = emojiOnly(m.text);
              return (
                <div key={m.id} className={`msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                  {!mine && <span className="msg-avatar">{!grouped && <PlayerAvatar id={m.from} avatar={m.avatar} size={30} />}</span>}
                  <div className="msg-body">
                    {!grouped && (
                      <div className="msg-meta">
                        {!mine && <b>{m.name}</b>} <span>{time(m.at)}</span>
                      </div>
                    )}
                    <div className={`msg-bubble${big ? ' big' : ''}`}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!atBottom && (
            <button className="chat-new" onClick={scrollToBottom}>
              <ArrowDown size={13} /> Tin mới
            </button>
          )}
          <div className="chat-typing">
            {typingNames.length > 0 && (
              <>
                <Pencil size={11} className="inline-icon" /> {typingNames.join(', ')} đang gõ…
              </>
            )}
          </div>

          <div className="chat-quick">
            {QUICK_EMOTES.map((e) => (
              <button key={e} onClick={() => send(e)} title={`Gửi ${e}`}>
                {e}
              </button>
            ))}
          </div>
          {pickOpen && (
            <div className="chat-emoji-grid">
              {EMOJI_PICK.map((e) => (
                <button key={e} onClick={() => insertEmoji(e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <button
              type="button"
              className={`chat-emoji-btn${pickOpen ? ' on' : ''}`}
              onClick={() => setPickOpen((o) => !o)}
              title="Chèn emoji"
              aria-label="Chèn emoji"
            >
              <Smile size={18} />
            </button>
            <input
              ref={inputRef}
              value={text}
              maxLength={CHAT_MAX_LEN}
              placeholder="Nhắn gì đó… (Enter để gửi)"
              onChange={(e) => {
                setText(e.target.value);
                const now = Date.now();
                if (now - lastTyping.current > 2000) {
                  lastTyping.current = now;
                  onTyping();
                }
              }}
            />
            <button type="submit" className="chat-send" disabled={!text.trim()} title="Gửi" aria-label="Gửi">
              <Send size={16} />
            </button>
          </form>
        </>
      ) : (
        <div className="log">
          {[...(log ?? [])].reverse().map((line, i) => (
            <div key={logTotal - i} className={/NỔ TUNG/.test(line) ? 'boom' : /GỠ BOM|thắng/.test(line) ? 'good' : ''}>
              {line}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export interface RoomChat {
  messages: ChatMessage[];
  /** playerId → hết hạn "đang gõ" (ms) */
  typing: Record<string, number>;
  send: (text: string) => void;
  onTyping: () => void;
}

/** Ai đang gõ + số tin chưa đọc (chỉ tính là đã đọc khi tab Chat đang hiện) */
export function useChatState(chat: RoomChat, players: { id: string; name: string }[], meId: string, visible: boolean) {
  const [, tick] = useState(0);
  const lastId = chat.messages.at(-1)?.id ?? 0;
  const [seen, setSeen] = useState(lastId);
  const typingIds = Object.entries(chat.typing).filter(([id, until]) => id !== meId && until > Date.now());
  useEffect(() => {
    if (!typingIds.length) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [typingIds.length]);
  useEffect(() => {
    if (visible) setSeen(lastId);
  }, [visible, lastId]);
  return {
    typingNames: typingIds.map(([id]) => players.find((p) => p.id === id)?.name ?? '?'),
    unread: chat.messages.filter((m) => m.id > seen && m.from !== meId).length,
  };
}
