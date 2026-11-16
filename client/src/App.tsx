import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { DEFAULT_ROOM_RULES, type AccountInfo, type AntsFrame, type BansungFrame, type ChatMessage, type Emote, type GameFx, type Identity, type LinkState, type PrivateNotice, type RoomView, type ThapFrame, type TwFrame } from '../../shared/src';
import { RoomPlayerCountContext, RoomRulesContext } from './roomRulesContext';
import { clearIdentity, loadIdentity, updateIdentity } from './identity';
import { logoutAccount } from './api';
import { SettingsContext, useSettingsState } from './settings';
import Dock, { Brand } from './components/Dock';
import ProfileModal from './components/ProfileModal';
import Login from './components/Login';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import BlackjackBoard from './components/BlackjackBoard';
import TienLenBoard from './components/TienLenBoard';
import AntsBoard from './components/AntsBoard';
import { antsStore } from './ants/store';
import ThapBoard from './components/ThapBoard';
import { stopMiragineBgm, syncMiragineBgmMute } from './thap/sound';
import { thapStore } from './thap/store';
import TwBoard from './components/TwBoard';
import { twStore } from './tw/store';
import { linkStore } from './link/store';
import LinkBoard from './components/LinkBoard';
import LotoBoard from './components/LotoBoard';
import BansungBoard from './components/BansungBoard';
import { bansungStore } from './bansung/store';
import Rules from './components/Rules';
import Modal from './components/Modal';
import { CardPreviewLayer } from './components/CardPreview';
import { sfx } from './sfx';
import { readRoomParam, writeRoomParam } from './roomLink';

import { SERVER_URL } from './serverUrl';

type ProfileUpdateAck =
  | { ok: true; result: { name: string; avatar?: string } }
  | { ok: false; error: string };

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
  /** Mở link ?roomid=ABCD: kết nối xong (kể cả sau khi đăng nhập) thì tự vào phòng đó */
  const linkRoom = useRef(readRoomParam());

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
  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };
  /** Vào phòng theo link mời. Bàn đủ người / đang chơi thì vào xem. */
  const joinFromLink = (s: Socket, current: RoomView | null) => {
    const code = linkRoom.current;
    if (!code) return;
    linkRoom.current = '';
    if (current?.code === code) return;
    if (current && current.phase !== 'lobby') {
      showToast(`Bạn đang chơi ở phòng ${current.code}. Xong ván rồi mở lại link để vào phòng ${code}.`);
      return;
    }
    s.timeout(10_000).emit('room:join', { code }, (err: Error | null, res?: { ok: boolean; error?: string }) => {
      if (err || res?.ok) return;
      const why = res?.error ?? '';
      if (!/đang chơi|đủ/.test(why)) {
        writeRoomParam(null);
        return;
      }
      s.timeout(10_000).emit('room:watch', { code }, (err2: Error | null, res2?: { ok: boolean }) => {
        if (!err2 && res2?.ok) showToast(`Phòng ${code} ${/đang chơi/.test(why) ? 'đang chơi' : 'đã đủ người'}, bạn vào xem nhé 👀`);
      });
    });
  };
  // Thanh địa chỉ luôn là link của phòng đang ở: tải lại hay gửi link cho bạn đều vào đúng phòng
  useEffect(() => {
    if (view?.code) writeRoomParam(view.code);
    else if (!linkRoom.current) writeRoomParam(null);
  }, [view?.code]);

  // Dọn kho & nhạc nền Miragine War khi rời phòng hoặc chuyển sang trò chơi khác
  useEffect(() => {
    if (!view || view.gameMode !== 'thap_hung') {
      thapStore.reset('', 0);
      stopMiragineBgm();
    }
  }, [view?.code, view?.gameMode]);

  // Đồng bộ công tắc tắt tiếng Dock tới nhạc nền & SFX Miragine War xuyên suốt Menu/Game
  useEffect(() => {
    syncMiragineBgmMute();
  }, [settings.sound]);

  // Server chỉ nhận socket có token tài khoản: chưa đăng nhập bằng PIN thì chưa kết nối
  const hasToken = !!identity?.token;
  useEffect(() => {
    if (!identity?.token) return;
    const auth = (cb: (data: object) => void) => cb(identityRef.current ?? {});
    const s = SERVER_URL ? io(SERVER_URL, { auth }) : io({ auth });
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('state', (v: RoomView | null) => {
      setView(v);
      if (!v) setChat([]);
      if (!v || v.gameMode !== 'thap_hung' || v.phase === 'lobby') {
        thapStore.reset('', 0);
      }
      joinFromLink(s, v);
    });
    s.on('toast', showToast);
    s.on('ants:frame', (f: AntsFrame) => antsStore.push(f));
    s.on('thap:frame', (f: ThapFrame) => thapStore.push(f));
    s.on('bansung:frame', (f: BansungFrame) => {
      if (f && typeof f === 'object') bansungStore.push(f);
    });
    s.on('tw:frame', (f: TwFrame) => twStore.push(f));
    s.on('link:state', (st: LinkState) => linkStore.push(st));
    s.on('notice', (n: PrivateNotice) => (n.kind === 'future' ? setNotice(n) : setReveal({ ...n, key: Date.now() })));
    s.on('fx', (f: GameFx) => setFx({ id: ++fxSeq.current, fx: f }));
    s.on('emote', (e: Emote) => setEmote({ id: ++fxSeq.current, e }));
    s.on('chat:history', (list: ChatMessage[]) => setChat(list));
    s.on('chat', (m: ChatMessage) => {
      setChat((c) => [...c, m].slice(-100));
      setTyping((t) => ({ ...t, [m.from]: 0 }));
    });
    s.on('typing', ({ from }: { from: string }) => setTyping((t) => ({ ...t, [from]: Date.now() + 3500 })));
    s.on('account', (a: AccountInfo | null) => {
      const current = identityRef.current;
      if (a && a.playerId !== current?.playerId) return;
      setAccount(a);
      if (a && current && (a.name !== current.name || a.avatar !== current.avatar)) {
        const next = updateIdentity(current, { name: a.name, avatar: a.avatar });
        identityRef.current = next;
        setIdentity(next);
      }
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [identity?.playerId, hasToken]);

  // Vừa tạo tài khoản / đăng nhập (có token mới, cùng playerId): kết nối lại để server xác thực
  const lastToken = useRef(identity?.token);
  useEffect(() => {
    if (identity?.token === lastToken.current) return;
    lastToken.current = identity?.token;
    socket?.disconnect().connect();
  }, [identity?.token, socket]);

  const socketRef = useRef<Socket | null>(null);
  socketRef.current = socket;

  const emit = useCallback(
    (event: string, payload?: unknown) => {
      const s = socketRef.current;
      if (!s?.connected) {
        if (event !== 'room:typing') showToast('Đang kết nối lại máy chủ, vui lòng thử lại sau giây lát…');
        return;
      }
      s.emit(event, payload);
    },
    [showToast],
  );
  const emitConfirmed = useCallback(
    (event: string, payload: unknown): Promise<void> =>
      new Promise((resolve, reject) => {
        const s = socketRef.current;
        if (!s?.connected) {
          reject(new Error('Mất kết nối máy chủ. Vui lòng kết nối lại rồi thử lại.'));
          return;
        }
        s.timeout(15_000).emit(event, payload, (error: Error | null, response?: { ok: boolean; error?: string }) => {
          if (error) reject(new Error('Chưa nhận được xác nhận. Vui lòng kiểm tra kết nối rồi thử lại.'));
          else if (!response?.ok) reject(new Error(response?.error || 'Chưa thể lưu luật phòng. Vui lòng thử lại.'));
          else resolve();
        });
      }),
    [],
  );
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
      <RoomRulesContext.Provider value={view?.rules ?? DEFAULT_ROOM_RULES}>
      <RoomPlayerCountContext.Provider value={view?.players.length}>
      <div className="app">
        {!inGame && (
          <div className="floating-top">
            <Brand code={view?.code} />
            {dock}
          </div>
        )}

        {!loggedIn && <Login identity={identity} onAuth={setIdentity} />}
        {loggedIn && !view && (
          <Home
            onCreate={(rules, gameMode) => emitConfirmed('room:create', { rules, gameMode })}
            onJoin={(code) => emit('room:join', { code })}
            onWatch={(code) => emit('room:watch', { code })}
          />
        )}
        {loggedIn && view?.phase === 'lobby' && <Lobby view={view} meId={identity.playerId} emit={emit} chat={chatProps} account={account}
          onSaveRules={(rules) => emitConfirmed('room:rules', { rules })} />}
        {inGame && identity && view && (
          view.gameMode === 'ant_empire' && view.ants ? (
            <AntsBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'link_duel' && view.link ? (
            <LinkBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'thap_hung' && view.thap ? (
            <ThapBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'total_war' && view.tw ? (
            <TwBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'loto' && view.loto ? (
            <LotoBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'bansung' ? (
            <BansungBoard view={view} meId={identity.playerId} emit={emit} chat={chatProps} dock={dock} />
          ) : view.gameMode === 'blackjack_21' ? (
            <BlackjackBoard
              view={view}
              meId={identity.playerId}
              emit={emit}
              emote={emote}
              chat={chatProps}
              dock={dock}
            />
          ) : view.gameMode === 'tien_len' ? (
            <TienLenBoard
              view={view}
              meId={identity.playerId}
              emit={emit}
              emote={emote}
              chat={chatProps}
              dock={dock}
            />
          ) : (
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
          )
        )}

        {showRules && (
          <Modal title={<span className="modal-title-icon"><BookOpen size={19} /> Luật chơi</span>} onClose={() => setShowRules(false)} width={860}>
            <Rules rules={view?.rules} playerCount={view?.players.length} />
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
              if (identity.token) void logoutAccount(identity.playerId, identity.token);
              clearIdentity();
              setIdentity(null);
              setAccount(null);
              setView(null);
              setProfileOpen(false);
            }}
            onClose={() => setProfileOpen(false)}
            onSave={async (patch, closeAfter = false) => {
              if (!socket?.connected) throw new Error('Mất kết nối máy chủ. Vui lòng kết nối lại rồi lưu.');
              const confirmed = await new Promise<{ name: string; avatar?: string }>((resolve, reject) => {
                socket.timeout(65_000).emit('player:update', patch, (error: Error | null, response?: ProfileUpdateAck) => {
                  if (error) {
                    reject(new Error('Chưa nhận được xác nhận lưu. Vui lòng kiểm tra kết nối rồi thử lại.'));
                  } else if (!response?.ok) {
                    reject(new Error(response?.error || 'Không lưu được hồ sơ. Vui lòng thử lại.'));
                  } else {
                    resolve(response.result);
                  }
                });
              });
              const current = identityRef.current;
              if (!current || current.playerId !== identity.playerId || current.token !== identity.token) {
                throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
              }
              const next = updateIdentity(current, confirmed);
              identityRef.current = next;
              setIdentity(next);
              if (closeAfter) setProfileOpen(false);
            }}
          />
        )}

        {toast && (
          <div className="toast" role="status" onClick={() => setToast(null)} title="Bấm để đóng">
            {toast}
          </div>
        )}
      </div>
      </RoomPlayerCountContext.Provider>
      </RoomRulesContext.Provider>
    </SettingsContext.Provider>
  );
}
