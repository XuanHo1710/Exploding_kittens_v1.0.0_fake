import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ChatMessage, Emote, GameFx, Identity, PrivateNotice, RoomView } from '../../shared/src';
import { loadIdentity, saveIdentity, updateIdentity } from './identity';
import { SettingsContext, useSettingsState } from './settings';
import PlayerAvatar from './art/PlayerAvatar';
import ProfileModal from './components/ProfileModal';
import Login from './components/Login';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import Rules from './components/Rules';
import Modal from './components/Modal';
import { CardPreviewLayer } from './components/CardPreview';
import { sfx } from './sfx';

const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

export default function App() {
  const [settings, updateSettings] = useSettingsState();
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [editingName, setEditingName] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [online, setOnline] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<PrivateNotice | null>(null);
  // Lá vừa lấy được / bị mất: hiện hẳn lá bài cho rõ
  const [reveal, setReveal] = useState<(PrivateNotice & { key: number }) | null>(null);
  const [fx, setFx] = useState<{ id: number; fx: GameFx } | null>(null);
  const [emote, setEmote] = useState<{ id: number; e: Emote } | null>(null);
  // Chat real-time của phòng
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const fxSeq = useRef(0);
  const [showRules, setShowRules] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  // Tiếng "tách" nhẹ cho mọi nút chính
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn && !btn.disabled && btn.matches('.primary, .secondary, .icon-btn, .seg button, .tabs button')) sfx('tap');
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  // Luôn dùng tên/avatar mới nhất khi socket tự kết nối lại
  const identityRef = useRef(identity);
  identityRef.current = identity;
  useEffect(() => {
    if (!identity) return;
    const auth = (cb: (data: object) => void) => cb(identityRef.current ?? {});
    const s = SERVER_URL ? io(SERVER_URL, { auth }) : io({ auth });
    const showToast = (msg: string) => {
      setToast(msg);
      clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 3500);
    };
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('state', (v: RoomView | null) => {
      setView(v);
      if (!v) setChat([]);
    });
    s.on('toast', showToast);
    s.on('notice', (n: PrivateNotice) => (n.kind === 'future' ? setNotice(n) : setReveal({ ...n, key: Date.now() })));
    s.on('fx', (f: GameFx) => setFx({ id: ++fxSeq.current, fx: f }));
    s.on('emote', (e: Emote) => setEmote({ id: ++fxSeq.current, e }));
    s.on('chat:history', (list: ChatMessage[]) => setChat(list));
    s.on('chat', (m: ChatMessage) => {
      setChat((c) => [...c, m].slice(-100));
      setTyping((t) => ({ ...t, [m.from]: 0 }));
    });
    s.on('typing', ({ from }: { from: string }) => setTyping((t) => ({ ...t, [from]: Date.now() + 3500 })));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [identity?.playerId]);

  const emit = (event: string, payload?: unknown) => socket?.emit(event, payload);
  const chatProps = {
    messages: chat,
    typing,
    send: (text: string) => emit('room:chat', { text }),
    onTyping: () => emit('room:typing'),
  };
  const loggedIn = identity && !editingName;

  return (
    <SettingsContext.Provider value={settings}>
      <div className="app">
        <header className="topbar">
          <span className="logo">
            <span className="logo-bomb">💣</span> Mèo Nổ
          </span>
          {view && <span className="room-tag">Phòng {view.code}</span>}
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => setShowRules(true)} title="Luật chơi">
              📖 <span className="hide-sm">Luật chơi</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => updateSettings({ cardStyle: settings.cardStyle === 'vector' ? 'photo' : 'vector' })}
              title="Đổi kiểu hình lá bài"
            >
              🃏 <span className="hide-sm">{settings.cardStyle === 'vector' ? 'Bài vẽ' : 'Ảnh gốc'}</span>
            </button>
            <button
              className="icon-btn"
              onClick={() => updateSettings({ sound: !settings.sound })}
              title={settings.sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
            >
              {settings.sound ? '🔊' : '🔇'}
            </button>
            <button
              className="icon-btn"
              onClick={() => updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
              title="Nền sáng / tối"
            >
              {settings.theme === 'light' ? '🌙' : '☀️'}
            </button>
            {identity && (
              <button className="me-tag" onClick={() => setProfileOpen(true)} title="Đổi tên / avatar">
                <PlayerAvatar id={identity.playerId} avatar={identity.avatar} size={30} />
                <span className="hide-sm">{identity.name}</span>
                <span className={online ? 'dot on' : 'dot'} title={online ? 'Đã kết nối' : 'Mất kết nối'} />
                <span className="me-edit" aria-hidden="true">✎</span>
              </button>
            )}
          </div>
        </header>

        {!loggedIn && (
          <Login
            initialName={identity?.name ?? ''}
            onSubmit={(name) => {
              setIdentity(saveIdentity(name, identity));
              setEditingName(false);
            }}
          />
        )}
        {loggedIn && !view && <Home onCreate={() => emit('room:create')} onJoin={(code) => emit('room:join', { code })} />}
        {loggedIn && view?.phase === 'lobby' && <Lobby view={view} meId={identity.playerId} emit={emit} chat={chatProps} />}
        {loggedIn && view && view.phase !== 'lobby' && (
          <GameBoard
            view={view}
            meId={identity.playerId}
            emit={emit}
            notice={notice}
            onCloseNotice={() => setNotice(null)}
            reveal={reveal}
            onCloseReveal={() => setReveal(null)}
            fx={fx}
            emote={emote}
            chat={chatProps}
          />
        )}

        {showRules && (
          <Modal title="📖 Luật chơi" onClose={() => setShowRules(false)} width={860}>
            <Rules />
            <div className="modal-actions">
              <button className="primary big" onClick={() => setShowRules(false)}>
                Đã hiểu
              </button>
            </div>
          </Modal>
        )}

        <CardPreviewLayer />
        {profileOpen && identity && (
          <ProfileModal
            identity={identity}
            onClose={() => setProfileOpen(false)}
            onSave={(patch) => {
              // lưu localStorage + báo server (không cần kết nối lại) → cả phòng thấy tên/avatar mới
              const next = updateIdentity(identity, patch);
              setIdentity(next);
              socket?.emit('player:update', { name: next.name, avatar: next.avatar });
              setProfileOpen(false);
            }}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </SettingsContext.Provider>
  );
}
