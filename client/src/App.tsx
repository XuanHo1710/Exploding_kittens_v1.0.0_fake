import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { AccountInfo, ChatMessage, Emote, GameFx, Identity, PrivateNotice, RoomView } from '../../shared/src';
import { clearIdentity, loadIdentity, updateIdentity } from './identity';
import { SettingsContext, useSettingsState } from './settings';
import Dock, { Brand } from './components/Dock';
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
  const [account, setAccount] = useState<AccountInfo | null>(null);
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
    s.on('account', (a: AccountInfo | null) => setAccount(a));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [identity?.playerId]);

  // Vừa tạo tài khoản / đăng nhập (có token mới, cùng playerId): kết nối lại để server xác thực
  const lastToken = useRef(identity?.token);
  useEffect(() => {
    if (identity?.token === lastToken.current) return;
    lastToken.current = identity?.token;
    socket?.disconnect().connect();
  }, [identity?.token, socket]);

  const emit = (event: string, payload?: unknown) => socket?.emit(event, payload);
  const chatProps = {
    messages: chat,
    typing,
    send: (text: string) => emit('room:chat', { text }),
    onTyping: () => emit('room:typing'),
  };
  // Chỉ vào được khi đã có tài khoản PIN (người chơi cũ được giữ id + tên, chỉ cần đặt PIN)
  const loggedIn = !!identity?.token;
  const inGame = loggedIn && !!view && view.phase !== 'lobby';
  const dock = (
    <Dock
      settings={settings}
      update={updateSettings}
      identity={identity}
      account={account}
      online={online}
      onRules={() => setShowRules(true)}
      onProfile={() => setProfileOpen(true)}
    />
  );

  return (
    <SettingsContext.Provider value={settings}>
      <div className="app">
        {!inGame && (
          <div className="floating-top">
            <Brand code={view?.code} />
            {dock}
          </div>
        )}

        {!loggedIn && <Login identity={identity} onAuth={setIdentity} />}
        {loggedIn && !view && <Home onCreate={() => emit('room:create')} onJoin={(code) => emit('room:join', { code })} />}
        {loggedIn && view?.phase === 'lobby' && <Lobby view={view} meId={identity.playerId} emit={emit} chat={chatProps} account={account} />}
        {inGame && identity && view && (
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
            dock={dock}
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
            account={account}
            onDaily={() => emit('account:daily')}
            onLogout={() => {
              clearIdentity();
              setIdentity(null);
              setAccount(null);
              setView(null);
              setProfileOpen(false);
            }}
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
