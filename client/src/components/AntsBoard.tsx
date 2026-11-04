/**
 * Màn chơi Đế Chế Kiến (bản đồ 2D nhìn từ trên xuống).
 * - Bấm 1 ô kiến là trại TỰ RA QUÂN loại đó liên tục, từng con một: mỗi con trừ vàng lúc bắt đầu nở,
 *   hết vàng thì chờ lần cấp vàng kế tiếp rồi tự ra tiếp. Bấm lại ô đó (hoặc chuột phải) để dừng.
 * - Cả đạo quân dùng lệnh chung: TỔNG TẤN CÔNG (chọn mục tiêu) hoặc PHÒNG THỦ – quân tự di chuyển, tự đánh.
 * - Chuột / ngón tay trên bản đồ chỉ để xem: kéo để di chuyển, lăn chuột / chụm 2 ngón để phóng to.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Crosshair, LogOut, MessageSquare, RotateCcw, Shield, Swords, Trophy, Users } from 'lucide-react';
import { ANT_UNITS, UNIT_KINDS, type AntUnitKind, type AntsCommand, type RoomView } from '../../../shared/src';
import { antsStore } from '../ants/store';
import { drawAntIcon, renderMinimap, renderScene, type Camera } from '../ants/render';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { roomPeople } from './Spectators';
import { fmtCoins } from './Dock';
import Modal from './Modal';
import { useSettings } from '../settings';
import '../ants/ants.css';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

const MINI = 200;
/** Bố cục cốt lõi để inline: bản đồ luôn phủ kín màn hình kể cả khi CSS tải chậm */
const FULL_SCREEN = { position: 'fixed', inset: 0, zIndex: 20, overflow: 'hidden', background: '#2a1e14' } as const;
const FILL = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: 'grab' } as const;
const NO_SELECTION = new Set<number>();

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Tranh kiến vẽ bằng canvas (dùng trong ô gọi quân) */
function AntIcon({ kind, color }: { kind: AntUnitKind; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawAntIcon(ref.current, kind, color);
  }, [kind, color]);
  return <canvas ref={ref} className="ants-slot-ico" />;
}

export default function AntsBoard({ view, meId, emit, chat, dock }: Props) {
  const settings = useSettings();
  const ants = view.ants!;
  const myIdx = ants.myIdx;
  const empires = ants.empires ?? [];
  const colors = useMemo(() => empires.map((e) => e.color), [empires]);
  const rocks = ants.rocks ?? [];
  const isHost = view.hostId === meId;
  const myColor = (myIdx !== undefined && colors[myIdx]) || '#e8590c';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: (ants.mapW ?? 2000) / 2, y: (ants.mapH ?? 2000) / 2, zoom: window.matchMedia('(pointer: coarse)').matches ? 0.75 : 0.9 });
  const centered = useRef(false);
  const keys = useRef(new Set<string>());
  const [hud, setHud] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [scoresOpen, setScoresOpen] = useState(false);
  const [pickTarget, setPickTarget] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [goldFlash, setGoldFlash] = useState<number | null>(null);
  /** chữ "+1" bay lên ở ô vừa nở quân */
  const [pops, setPops] = useState<{ id: number; kind: AntUnitKind }[]>([]);
  const [now, setNow] = useState(Date.now());
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');

  const frame = antsStore.frame;
  const me = frame?.me;
  const alive = myIdx !== undefined && (frame ? frame.al[myIdx] === 1 : true);
  const ended = view.phase === 'ended';
  const result = ants.result;

  useEffect(() => {
    if (ants.mapW && ants.mapH && ants.startedAt) antsStore.reset(view.code, ants.startedAt, ants.mapW, ants.mapH, myIdx);
  }, [view.code, ants.startedAt, ants.mapW, ants.mapH, myIdx]);

  // HUD cập nhật ~4 lần/giây (canvas tự vẽ 60 hình/giây)
  useEffect(() => {
    let last = 0;
    let pending: number | undefined;
    let lastGold = -1;
    let lastHatched = -1;
    let lastHead: AntUnitKind | undefined;
    let popId = 0;
    const unsub = antsStore.subscribe(() => {
      const t = performance.now();
      if (!centered.current && myIdx !== undefined) {
        const main = [...antsStore.towers.values()].find((x) => x.owner === myIdx && x.kind === 'main');
        if (main) {
          const r = antsStore.frame?.me?.rally;
          cam.current.x = r ? (main.x + r[0]) / 2 : main.x;
          cam.current.y = r ? (main.y + r[1]) / 2 : main.y;
          centered.current = true;
        }
      }
      const g = antsStore.frame?.me?.gold;
      if (g !== undefined) {
        if (lastGold >= 0 && g - lastGold >= 150) setGoldFlash(g - lastGold);
        lastGold = g;
      }
      const mine = antsStore.frame?.me;
      if (mine) {
        if (lastHatched >= 0 && mine.hatched > lastHatched) {
          const kind = lastHead ?? mine.auto ?? undefined;
          if (kind) {
            const id = ++popId;
            setPops((p) => [...p.slice(-8), { id, kind }]);
            window.setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
          }
        }
        lastHatched = mine.hatched;
        lastHead = mine.queue[0]?.kind;
      }
      const al = antsStore.alert;
      if (al && t - al.at < 150) setAlertText(al.text);
      if (t - last > 250) {
        last = t;
        setHud((h) => h + 1);
      } else if (pending === undefined) {
        pending = window.setTimeout(() => {
          pending = undefined;
          last = performance.now();
          setHud((h) => h + 1);
        }, 260);
      }
    });
    return () => {
      unsub();
      clearTimeout(pending);
    };
  }, [myIdx]);

  useEffect(() => {
    if (!alertText) return;
    const t = window.setTimeout(() => setAlertText(null), 4000);
    return () => clearTimeout(t);
  }, [alertText]);
  useEffect(() => {
    if (goldFlash === null) return;
    const t = window.setTimeout(() => setGoldFlash(null), 2500);
    return () => clearTimeout(t);
  }, [goldFlash]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const toWorld = (sx: number, sy: number) => {
    const c = cam.current;
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: c.x + (sx - r.left - r.width / 2) / c.zoom, y: c.y + (sy - r.top - r.height / 2) / c.zoom };
  };
  const send = (cmd: AntsCommand) => emit('ants:cmd', cmd);
  const centerOn = (x: number, y: number) => {
    cam.current.x = x;
    cam.current.y = y;
  };
  const goHome = () => {
    const al = antsStore.alert;
    if (al && performance.now() - al.at < 8000) return centerOn(al.x, al.y);
    const main = [...antsStore.towers.values()].find((t) => t.owner === myIdx && t.kind === 'main');
    if (main) centerOn(main.x, main.y);
  };
  const goTarget = () => {
    const p = antsStore.frame?.me?.targetPos;
    if (p) centerOn(p[0], p[1]);
  };

  /** Bấm ô kiến: bật tự ra quân loại đó, bấm lại ô đang chạy thì dừng */
  const toggleAuto = (kind: AntUnitKind) => send({ t: 'auto', kind: antsStore.frame?.me?.auto === kind ? null : kind });
  const stopAuto = () => send({ t: 'auto', kind: null });
  const attack = (target: number) => {
    send({ t: 'stance', stance: 'attack', target });
    setPickTarget(false);
  };
  const defend = () => {
    send({ t: 'stance', stance: 'defend' });
    setPickTarget(false);
  };

  // ---------- vòng vẽ ----------
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = canvasRef.current;
      if (!el) return;
      const t = performance.now();
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      const c = cam.current;
      const k = keys.current;
      const sp = (750 / c.zoom) * dt;
      if (k.has('a') || k.has('arrowleft')) c.x -= sp;
      if (k.has('d') || k.has('arrowright')) c.x += sp;
      if (k.has('w') || k.has('arrowup')) c.y -= sp;
      if (k.has('s') || k.has('arrowdown')) c.y += sp;
      c.x = Math.max(0, Math.min(antsStore.mapW || 2000, c.x));
      c.y = Math.max(0, Math.min(antsStore.mapH || 2000, c.y));
      const ctx = el.getContext('2d');
      if (!ctx || !antsStore.mapW) return;
      const mine = antsStore.frame?.me;
      renderScene(ctx, {
        w, h, dpr, cam: c, rocks, colors, selected: NO_SELECTION,
        rally: mine?.rally, showRally: !!mine && mine.stance === 'defend',
        target: mine?.stance === 'attack' ? mine.targetPos : undefined,
        dark: settings.theme === 'dark',
      });
      const m = miniRef.current;
      if (m) {
        if (m.width !== MINI * dpr) { m.width = MINI * dpr; m.height = MINI * dpr; }
        const mctx = m.getContext('2d');
        if (mctx) renderMinimap(mctx, MINI, dpr, c, w, h, rocks, colors, mine?.stance === 'attack' ? mine.targetPos : undefined);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rocks, colors, settings.theme, myIdx]);

  // ---------- chuột / cảm ứng: chỉ để xem bản đồ ----------
  useEffect(() => {
    const el = canvasRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; cx: number; cy: number } | null = null;
    let pinch: { d: number; zoom: number; mx: number; my: number; cx: number; cy: number } | null = null;

    const startDrag = () => {
      const [p] = [...pts.values()];
      drag = p ? { x: p.x, y: p.y, cx: cam.current.x, cy: cam.current.y } : null;
    };
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: cam.current.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: cam.current.x, cy: cam.current.y };
        drag = null;
      } else if (pts.size === 1) {
        startDrag();
        el.style.cursor = 'grabbing';
      }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      const c = cam.current;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        c.zoom = Math.max(0.3, Math.min(2.2, pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
        c.x = pinch.cx - ((a.x + b.x) / 2 - pinch.mx) / c.zoom;
        c.y = pinch.cy - ((a.y + b.y) / 2 - pinch.my) / c.zoom;
        return;
      }
      if (drag) {
        c.x = drag.cx - (e.clientX - drag.x) / c.zoom;
        c.y = drag.cy - (e.clientY - drag.y) / c.zoom;
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) startDrag();
      if (pts.size === 0) {
        drag = null;
        el.style.cursor = 'grab';
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      const before = toWorld(e.clientX, e.clientY);
      c.zoom = Math.max(0.3, Math.min(2.2, c.zoom * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      c.x += before.x - after.x;
      c.y += before.y - after.y;
    };
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', noMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- bàn phím ----------
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        keys.current.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
        return;
      }
      if (myIdx === undefined || !alive || ended) return;
      if (k === ' ') { e.preventDefault(); goHome(); return; }
      if (k === 't') { setPickTarget((v) => !v); return; }
      if (k === 'escape') { setPickTarget(false); return; }
      if (k === 'p') { defend(); return; }
      const uk = UNIT_KINDS.find((u) => e.code === `Digit${ANT_UNITS[u].hotkey}` || e.code === `Numpad${ANT_UNITS[u].hotkey}`);
      if (uk) { e.preventDefault(); toggleAuto(uk); }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myIdx, alive, ended]);

  const miniPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const k = Math.max(antsStore.mapW, antsStore.mapH) / (r.width || MINI);
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  // ---------- dữ liệu cho bảng điều khiển ----------
  void hud;
  const remaining = ants.endsAt ? ants.endsAt - now : undefined;
  const scores = frame?.sc ?? [];
  const ranking = empires
    .map((e) => ({ ...e, score: result?.scores[e.idx] ?? scores[e.idx] ?? 0, alive: frame ? frame.al[e.idx] === 1 : e.alive }))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
  const myEmpire = myIdx !== undefined ? empires[myIdx] : undefined;
  const queue = me?.queue ?? [];
  const head = queue[0];
  const myTowers = [...antsStore.towers.values()].filter((t) => t.owner === myIdx);
  const myArmy = [...antsStore.units.values()].filter((u) => u.owner === myIdx).length;
  const enemies = empires.filter((e) => e.idx !== myIdx && (frame ? frame.al[e.idx] === 1 : e.alive));
  const attacking = me?.stance === 'attack';
  const targetEmpire = me?.targetIdx !== undefined ? empires[me.targetIdx] : undefined;
  const myRank = ranking.findIndex((r) => r.idx === myIdx) + 1;
  const winner = result ? empires[result.winnerIdx] : undefined;

  return (
    <div className={`ants-game${chatOpen ? ' chat-on' : ''}`} style={FULL_SCREEN}>
      <canvas ref={canvasRef} className="ants-canvas" style={FILL} />

      {/* thanh trên */}
      <div className="ants-top">
        <div className="ants-res">
          {myEmpire && <span className="ants-me-dot" style={{ background: myEmpire.color }} title={myEmpire.name} />}
          {me && alive ? (
            <>
              <span className="ants-pill gold" title="Vàng – dùng để gọi quân">
                <span>💰</span><b>{fmtCoins(me.gold)}</b>
                {goldFlash !== null && <span className="ants-gold-flash">+{fmtCoins(goldFlash)}</span>}
              </span>
              <span className="ants-pill income" title="Vàng được cấp mỗi 1 phút, càng về sau càng nhiều">
                ⏳ <b>+{fmtCoins(me.incomeAmount)}</b> sau <b>{fmtTime(me.incomeIn * 1000)}</b>
              </span>
              <span className={`ants-pill${me.pop >= me.popCap ? ' warn' : ''}`} title="Quân số / tối đa"><Users size={14} /><b>{me.pop}/{me.popCap}</b></span>
              <span className="ants-pill" title="Đã hạ"><Crosshair size={14} /><b>{me.kills}</b></span>
              <span className="ants-pill" title="Trụ còn đứng">🗼 <b>{myTowers.length}/3</b></span>
            </>
          ) : (
            <span className="ants-pill">{myIdx === undefined ? '👀 Đang xem' : '💀 Đế chế đã sụp – xem toàn bản đồ'}</span>
          )}
          <span className="ants-pill" title={remaining !== undefined ? 'Thời gian còn lại' : 'Thời gian đã chơi'}>
            ⏱ <b>{remaining !== undefined ? fmtTime(remaining) : fmtTime(frame?.elapsed ?? 0)}</b>
          </span>
          {view.pot > 0 && <span className="ants-pill" title={`Mỗi người cược ${view.bet} xu`}>🪙 <b>{fmtCoins(view.pot)}</b></span>}
        </div>
        <div className="ants-top-right">
          <button className={`ants-icon${scoresOpen ? ' on' : ''}`} onClick={() => setScoresOpen((v) => !v)} title="Bảng điểm">
            <Trophy size={17} />
            {myRank > 0 && <span className="ants-badge plain">#{myRank}</span>}
          </button>
          <button className={`ants-icon${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)} title="Trò chuyện">
            <MessageSquare size={17} />
            {unread > 0 && !chatOpen && <span className="ants-badge">{unread}</span>}
          </button>
          <div className="ants-dock">{dock}</div>
          <button className="ants-icon" onClick={() => (ended || !alive ? emit('room:leave') : setLeaveAsk(true))} title="Rời trận">
            <LogOut size={17} />
          </button>
        </div>
      </div>

      {scoresOpen && (
        <div className="ants-scores">
          {ranking.map((r, i) => (
            <div key={r.idx} className={`ants-score-row${r.idx === myIdx ? ' me' : ''}${r.alive ? '' : ' dead'}`}>
              <span className="rank">{i + 1}</span>
              <span className="dot" style={{ background: r.color }} />
              <span className="name">{r.name}</span>
              <b>{r.score}</b>
              {!r.alive && <span title="Đã bị loại">☠️</span>}
            </div>
          ))}
        </div>
      )}

      {alertText && <button className="ants-alert" onClick={goHome}>⚠️ {alertText} <span className="muted">(Space)</span></button>}

      {/* bản đồ nhỏ: bấm / kéo để nhìn tới chỗ đó */}
      <div className="ants-mini">
        <canvas
          ref={miniRef}
          style={{ width: MINI, height: MINI }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
            const p = miniPoint(e);
            centerOn(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            const p = miniPoint(e);
            centerOn(p.x, p.y);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* phía dưới: lệnh chung + danh sách quân */}
      <div className="ants-bottom">
        {alive && !ended && me && (
          <>
            {pickTarget && (
              <div className="ants-targets" role="dialog" aria-label="Chọn nơi tấn công">
                <div className="ants-targets-head">
                  <b>Chọn nơi tổng tấn công</b>
                  <span className="muted small">Quân tự hành quân tới, phá Trụ Phụ trước rồi tới Trụ Chính</span>
                </div>
                <div className="ants-targets-list">
                  <button className={`ants-target${attacking && me.target === -1 ? ' on' : ''}`} onClick={() => attack(-1)}>
                    🎯 <b>Đế chế gần nhất</b>
                  </button>
                  {enemies.map((e) => {
                    const towers = [...antsStore.towers.values()].filter((t) => t.owner === e.idx).length;
                    return (
                      <button key={e.idx} className={`ants-target${attacking && me.target === e.idx ? ' on' : ''}`} onClick={() => attack(e.idx)}>
                        <span className="dot" style={{ background: e.color }} />
                        <b>{e.name}</b>
                        <span className="muted small">{ranking.find((r) => r.idx === e.idx)?.score ?? 0} điểm{towers ? ` · thấy ${towers} trụ` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="ants-orders">
              <div className="ants-orders-state">
                {attacking ? (
                  <>
                    <span className="ants-stance attack">⚔️ Đang tổng tấn công</span>
                    {targetEmpire && (
                      <button className="link" onClick={goTarget} title="Nhìn tới trụ đang đánh">
                        <span className="dot" style={{ background: targetEmpire.color }} /> {targetEmpire.name}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="ants-stance defend">🛡️ Đang phòng thủ căn cứ</span>
                )}
                <span className="muted small">· {myArmy} kiến</span>
              </div>
              <div className="ants-orders-btns">
                <button className={`ants-order attack${attacking || pickTarget ? ' on' : ''}`} onClick={() => setPickTarget((v) => !v)} title="Chọn mục tiêu cho cả đạo quân (T)">
                  <Swords size={18} /> Tổng tấn công <kbd>T</kbd>
                </button>
                <button className={`ants-order defend${!attacking ? ' on' : ''}`} onClick={defend} title="Cả đạo quân về giữ căn cứ (P)">
                  <Shield size={18} /> Phòng thủ <kbd>P</kbd>
                </button>
                <button className="ants-order home" onClick={goHome} title="Nhìn về căn cứ (Space)">🏰</button>
              </div>
            </div>
            <div className="ants-roster">
              <div className="ants-roster-head">
                <span className="ants-roster-status">
                  {head && (head.paid || !me.waiting) ? (
                    <>
                      Đang nở: <b>{ANT_UNITS[head.kind].name}</b> <span className="good-text">{Math.ceil(head.left)}s</span>
                      {me.auto && me.auto !== head.kind && <span className="muted"> · tiếp theo: {ANT_UNITS[me.auto].name}</span>}
                    </>
                  ) : head && me.waiting === 'pop' ? (
                    // con đầu hàng chưa trả vàng và server báo đang chờ: hết chỗ quân hoặc hết vàng
                    <>
                      <b>{ANT_UNITS[head.kind].name}</b> <span className="bad-text">· đủ quân tối đa, chờ có chỗ</span>
                    </>
                  ) : head ? (
                    <>
                      <b>{ANT_UNITS[head.kind].name}</b> <span className="bad-text">· chờ vàng · còn {fmtTime(me.incomeIn * 1000)}</span>{' '}
                      <span className="muted">(+{me.incomeAmount} vàng)</span>
                    </>
                  ) : (
                    <span className="muted">Bấm 1 ô kiến để tự ra quân liên tục · mỗi con trừ vàng lúc bắt đầu nở · bấm lại để dừng</span>
                  )}
                </span>
              </div>
              <div className="ants-slots">
                {UNIT_KINDS.map((k) => {
                  const s = ANT_UNITS[k];
                  const isAuto = me.auto === k;
                  const training = head?.kind === k && head.paid;
                  const poor = me.gold < s.cost;
                  return (
                    <button
                      key={k}
                      className={`ants-slot${poor ? ' poor' : ''}${isAuto ? ' on' : ''}`}
                      onClick={() => toggleAuto(k)}
                      onContextMenu={(e) => { e.preventDefault(); stopAuto(); }}
                      title={`${s.name} – ${s.desc}\nGiá ${s.cost} vàng · nở ${s.time}s · Máu ${s.hp}${s.atk ? ` · Công ${s.atk}` : ''}${s.range ? ` · Tầm ${s.range}` : ''}${s.pop > 1 ? ` · Chiếm ${s.pop} chỗ` : ''}\nBấm: tự ra quân liên tục · Bấm lại / chuột phải: dừng`}
                    >
                      <kbd>{s.hotkey}</kbd>
                      {isAuto && <span className="ants-slot-count">TỰ RA</span>}
                      {pops.filter((p) => p.kind === k).map((p) => <i key={p.id} className="ants-plus">+1</i>)}
                      <AntIcon kind={k} color={myColor} />
                      <span className="ants-slot-name">{s.name.replace('Kiến ', '')}</span>
                      <span className="ants-slot-cost">💰{s.cost}</span>
                      {training && <i className="ants-slot-prog" style={{ width: `${(1 - head.left / head.total) * 100}%` }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {chatOpen && (
        <div className="ants-chat">
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

      {ended && result && (
        <div className="ants-end">
          <div className="ants-end-card">
            <h2>
              <Trophy size={22} className="inline-icon" />{' '}
              {result.winnerIdx === myIdx ? 'Đế chế của bạn thống trị!' : winner ? `${winner.name} chiến thắng!` : 'Không ai chiến thắng'}
            </h2>
            <p className="muted">{result.reason}</p>
            <ol className="ants-end-list">
              {ranking.map((r) => {
                const human = view.players.find((p) => p.id === r.id);
                const paid = view.payouts?.[r.id];
                return (
                  <li key={r.idx} className={r.idx === myIdx ? 'me' : ''}>
                    <span className="dot" style={{ background: r.color }} />
                    <span className="name">{r.name}{!r.alive && ' ☠️'}</span>
                    <b>{r.score} điểm</b>
                    {view.pot > 0 && human && r.idx === result.winnerIdx && <span className="good-text">+{fmtCoins(view.pot - view.bet)} xu</span>}
                    {view.pot > 0 && human && paid !== undefined && r.idx !== result.winnerIdx && <span className="muted">hoàn {fmtCoins(paid)} xu</span>}
                  </li>
                );
              })}
            </ol>
            <div className="ants-end-actions">
              <button className="ghost" onClick={() => emit('room:leave')}><LogOut size={15} /> Rời phòng</button>
              {isHost ? (
                <button className="primary big" onClick={() => emit('game:restart')}><RotateCcw size={17} /> Về phòng chờ</button>
              ) : (
                <span className="muted small">Chờ chủ phòng mở ván mới…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {leaveAsk && (
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Rời trận Đế Chế Kiến?</span>} width={420}>
          <p>
            Rời bây giờ là <b>đầu hàng</b>: Trụ Chính của bạn sụp đổ ngay
            {view.pot > 0 && <> và mất số xu đã cược</>}.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setLeaveAsk(false)}>Ở lại</button>
            <button className="primary big danger" onClick={() => { setLeaveAsk(false); emit('room:leave'); }}>Đầu hàng & rời</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
