/**
2:  * Màn chơi Miragine War (Chế độ Solo 10 Người / Co-op / Lập Đội trên bản đồ rộng).
3:  * - Sao chép 100% cơ chế gameplay và đồ họa nguyên bản từ `/database-miraginewar/*`:
4:  *   + 16 binh chủng chuẩn Miragine War (2 hàng × 8 cột), chân dung `a0..a15.png`
5:  *   + Chu kỳ thu nhập (6s đợt đầu, 30s mỗi đợt tiếp theo), tự động triệu hồi lính từ Cổng (`door.png`) theo ô đang chọn
6:  *   + Nền chiến trường `terrain2.jpg` lặp vô hạn, nhạc nền `gameLoop.mp3` & `mainLoop.mp3`
7:  *   + Đúng 3 nút chỉ huy quân đội: **🎯 Tấn Công - Chỉ Định**, **🛡️ Phòng Thủ**, **🚩 Tập Kết**
8:  */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Crosshair, Flag, LogOut, MessageSquare, RotateCcw, Shield, Target, Trophy, Volume2 } from 'lucide-react';
import {
  THAP_COUNTER,
  THAP_TEAM_COLORS,
  THAP_TEAM_NAMES,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  type RoomView,
  type ThapCommand,
  type ThapPlayerInfo,
  type ThapUnitKind,
} from '../../../shared/src';
import { thapStore } from '../thap/store';
import { getPortraitUrl, preloadMiragineAssets } from '../thap/sprites';
import { renderMinimap, renderScene, type Camera, type MineInfo } from '../thap/render';
import { playThap, startMiragineBgm, syncMiragineBgmMute } from '../thap/sound';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { roomPeople } from './Spectators';
import { fmtCoins } from './Dock';
import Modal from './Modal';
import { useSettings } from '../settings';
import '../thap/thap.css';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

const MINI_W = 240;
/** Bố cục cốt lõi để inline: bản đồ luôn phủ kín màn hình kể cả khi CSS tải chậm */
const FULL_SCREEN = { position: 'fixed', inset: 0, zIndex: 20, overflow: 'hidden', background: '#1f3a18' } as const;
const FILL = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', cursor: 'grab' } as const;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 1.6;

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const KIND_SHORT: Record<ThapUnitKind, string> = {
  newbie: 'Tân Binh',
  veteran: 'Cựu Binh',
  zombie: 'Xác Sống',
  samurai: 'Võ Sĩ',
  swordman: 'Kiếm Sĩ',
  ninja: 'Ninja',
  novice: 'Pháp Đồ',
  heavysword: 'Trọng Kiếm',
  monk: 'Tu Sĩ',
  vampire: 'Huyết Quỷ',
  cavalry: 'Kỵ Binh',
  immortal: 'Bất Tử',
  mage: 'Pháp Sư',
  ironknight: 'Thiết Kỵ',
  dreadlord: 'Ác Ma',
  highlord: 'Thần Vương',
};

/** Dòng mô tả khắc chế cho tooltip */
function counterText(kind: ThapUnitKind) {
  const strong: string[] = [];
  const weak: string[] = [];
  for (const [t, m] of Object.entries(THAP_COUNTER[kind] ?? {})) {
    const u = THAP_UNITS[t as ThapUnitKind];
    if (!u) continue;
    if ((m ?? 1) > 1.15) strong.push(`${u.name}`);
    else if ((m ?? 1) < 0.85) weak.push(`${u.name}`);
  }
  return [
    strong.length ? `Khắc mạnh: ${strong.slice(0, 5).join(', ')}` : '',
    weak.length ? `Khó đánh: ${weak.slice(0, 4).join(', ')}` : '',
  ].filter(Boolean).join(' · ');
}

/** Chân dung lính Miragine War gốc từ `/database-miraginewar/portraits/a{id}.png` */
function UnitIcon({ kind, className = 'thap-slot-ico' }: { kind: ThapUnitKind; color?: string; className?: string }) {
  const spec = THAP_UNITS[kind] ?? THAP_UNITS.swordman;
  return (
    <img
      src={getPortraitUrl(spec.id, 'a')}
      alt={`${spec.vnName} (${spec.name})`}
      className={className}
      draggable={false}
    />
  );
}

export default function ThapBoard({ view, meId, emit, chat, dock }: Props) {
  const settings = useSettings();
  const thap = view.thap!;
  const myIdx = thap.myIdx;
  const mode = thap.config.mode;
  const isHost = view.hostId === meId;

  useEffect(() => {
    preloadMiragineAssets();
    startMiragineBgm('game');
  }, []);

  useEffect(() => {
    syncMiragineBgmMute();
  }, [settings.sound]);

  // dữ liệu tĩnh của bản đồ (theo idx phe)
  const players = useMemo(() => {
    const list: ThapPlayerInfo[] = [];
    for (const p of thap.players ?? []) list[p.idx] = p;
    return list;
  }, [thap.players]);
  const colors = useMemo(() => players.map((p) => p?.color ?? '#888888'), [players]);
  const names = useMemo(() => players.map((p) => p?.name ?? ''), [players]);
  const teams = useMemo(() => players.map((p) => p?.team ?? 0), [players]);
  const bases = useMemo(() => {
    const out: [number, number][] = [];
    const b = thap.bases ?? [];
    for (let i = 0; i + 1 < b.length; i += 2) out.push([b[i], b[i + 1]]);
    return out;
  }, [thap.bases]);
  const mines = useMemo(() => {
    const out: MineInfo[] = [];
    const m = thap.mines ?? [];
    for (let i = 0; i + 2 < m.length; i += 3) out.push({ x: m[i], y: m[i + 1], big: m[i + 2] === 1 });
    return out;
  }, [thap.mines]);
  const mapW = thap.mapW ?? 4000;
  const mapH = thap.mapH ?? 2240;
  const miniH = Math.round((MINI_W * mapH) / mapW);
  const myColor = (myIdx !== undefined && colors[myIdx]) || '#e8590c';
  const myTeam = myIdx !== undefined ? teams[myIdx] : undefined;
  const teamColors = mode === 'ffa' ? undefined : THAP_TEAM_COLORS;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ x: mapW / 2, y: mapH / 2, zoom: 0.5 });
  const centered = useRef(false);
  const keys = useRef(new Set<string>());
  const rallyMode = useRef(false);
  const targetMode = useRef(false);
  const hoverWorld = useRef<{ x: number; y: number } | null>(null);
  const [rallyPick, setRallyPick] = useState(false);
  const [hud, setHud] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [scoresOpen, setScoresOpen] = useState(() => window.innerWidth > 900);
  const [pickTarget, setPickTarget] = useState(false);
  const [hoverKind, setHoverKind] = useState<ThapUnitKind>('newbie');
  const [guideOpen, setGuideOpen] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');

  if (thap.mapW && thap.mapH && thap.startedAt) thapStore.reset(view.code, thap.startedAt, thap.mapW, thap.mapH, myIdx, bases);
  const frame = thapStore.frame;
  const me = frame?.me;
  const alive = myIdx !== undefined && (frame ? frame.al[myIdx] === 1 : players[myIdx]?.alive !== false);
  const ended = view.phase === 'ended';
  const result = thap.result;
  const canAct = alive && !ended && !!me;

  // camera ban đầu: Thành của mình, khán giả nhìn toàn bản đồ
  useEffect(() => {
    if (centered.current) return;
    const el = canvasRef.current;
    const w = el?.clientWidth || window.innerWidth, h = el?.clientHeight || window.innerHeight;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (myIdx !== undefined && bases[myIdx]) {
      const [bx, by] = bases[myIdx];
      cam.current = { x: bx + (mapW / 2 - bx) * 0.15, y: by + (mapH / 2 - by) * 0.15, zoom: coarse ? 0.55 : 0.7 };
      centered.current = true;
    } else if (bases.length) {
      cam.current = { x: mapW / 2, y: mapH / 2, zoom: Math.max(ZOOM_MIN, Math.min(w / mapW, h / mapH)) };
      centered.current = true;
    }
  }, [myIdx, bases, mapW, mapH]);

  // HUD cập nhật ~4 lần/giây + phát âm thanh Miragine War
  useEffect(() => {
    let last = 0;
    let pending: number | undefined;
    let lastAlertAt = 0;
    let falls = thapStore.baseFalls;
    let deaths = thapStore.unitDeaths;
    let hits = thapStore.combatHits;
    let prevRoundLeft = 30;
    const unsub = thapStore.subscribe(() => {
      const t = performance.now();
      const al = thapStore.alert;
      if (al && al.at !== lastAlertAt && t - al.at < 300) {
        lastAlertAt = al.at;
        setAlertText(al.text);
        playThap('alarm');
      }
      if (thapStore.baseFalls > falls) {
        falls = thapStore.baseFalls;
        playThap('fall');
      }
      if (thapStore.unitDeaths > deaths) {
        deaths = thapStore.unitDeaths;
        playThap('dead');
      }
      if (thapStore.combatHits > hits) {
        hits = thapStore.combatHits;
        playThap('hit');
      }
      const rl = thapStore.frame?.me?.roundLeft;
      if (rl !== undefined) {
        if (prevRoundLeft <= 3 && rl >= 27) playThap('timer');
        prevRoundLeft = rl;
      }
      if (t - last > 250) {
        last = t;
        setHud((x) => x + 1);
      } else if (pending === undefined) {
        pending = window.setTimeout(() => {
          pending = undefined;
          last = performance.now();
          setHud((x) => x + 1);
        }, 260);
      }
    });
    return () => {
      unsub();
      clearTimeout(pending);
    };
  }, []);

  useEffect(() => {
    if (!alertText) return;
    const t = window.setTimeout(() => setAlertText(null), 4500);
    return () => clearTimeout(t);
  }, [alertText]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // nhạc kết thúc
  const endedOnce = useRef(false);
  useEffect(() => {
    if (!ended || !result || endedOnce.current) return;
    endedOnce.current = true;
    if (myIdx !== undefined) playThap(result.winnerIdxs.includes(myIdx) ? 'win' : 'lose');
  }, [ended, result, myIdx]);
  useEffect(() => {
    rallyMode.current = rallyPick;
    targetMode.current = pickTarget;
    if (canvasRef.current) canvasRef.current.style.cursor = rallyPick || pickTarget ? 'crosshair' : 'grab';
  }, [rallyPick, pickTarget]);
  useEffect(() => {
    if (!canAct) {
      setRallyPick(false);
      setPickTarget(false);
    }
  }, [canAct]);

  const toWorld = (sx: number, sy: number) => {
    const c = cam.current;
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: c.x + (sx - r.left - r.width / 2) / c.zoom, y: c.y + (sy - r.top - r.height / 2) / c.zoom };
  };
  const send = (cmd: ThapCommand) => emit('thap:cmd', cmd);
  const centerOn = (x: number, y: number) => {
    cam.current.x = x;
    cam.current.y = y;
  };
  const goHome = () => {
    const al = thapStore.alert;
    if (al && performance.now() - al.at < 8000) return centerOn(al.x, al.y);
    if (myIdx !== undefined && bases[myIdx]) centerOn(bases[myIdx][0], bases[myIdx][1]);
  };
  const goTarget = () => {
    const t = thapStore.frame?.me?.target;
    if (t !== undefined && t >= 0 && bases[t]) centerOn(bases[t][0], bases[t][1]);
  };

  // ---------- lệnh chuẩn 100% Miragine War ----------
  const selectUnit = (kind: ThapUnitKind) => {
    if (!canAct) return;
    setHoverKind(kind);
    send({ t: 'auto', kind });
    playThap('buy');
  };
  const defend = () => {
    send({ t: 'stance', stance: 'defend' });
    setPickTarget(false);
    setRallyPick(false);
    playThap('click');
  };
  const attack = (target: number) => {
    send({ t: 'attack', target });
    setPickTarget(false);
    setRallyPick(false);
    playThap('horn');
  };
  const startRally = () => {
    setPickTarget(false);
    setRallyPick((v) => !v);
  };
  const placeRally = (x: number, y: number) => {
    send({ t: 'rally', x: Math.round(Math.max(0, Math.min(mapW, x))), y: Math.round(Math.max(0, Math.min(mapH, y))) });
    setRallyPick(false);
    playThap('horn');
  };
  const placeRallyRef = useRef(placeRally);
  placeRallyRef.current = placeRally;

  // Bấm trực tiếp vào Pha Lê địch trên bản đồ để Tấn Công - Chỉ Định
  const tryClickEnemyBase = (wx: number, wy: number) => {
    if (!canAct) return false;
    for (let i = 0; i < bases.length; i++) {
      if (i === myIdx) continue;
      if (myTeam !== undefined && teams[i] === myTeam) continue;
      const aliveBase = thapStore.frame ? thapStore.frame.al[i] === 1 : players[i]?.alive !== false;
      if (!aliveBase) continue;
      const [bx, by] = bases[i];
      if (Math.hypot(wx - bx, wy - by) <= 170) {
        attack(i);
        return true;
      }
    }
    return false;
  };
  const tryClickEnemyBaseRef = useRef(tryClickEnemyBase);
  tryClickEnemyBaseRef.current = tryClickEnemyBase;

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
      const sp = (900 / c.zoom) * dt;
      if (k.has('a') || k.has('arrowleft')) c.x -= sp;
      if (k.has('d') || k.has('arrowright')) c.x += sp;
      if (k.has('w') || k.has('arrowup')) c.y -= sp;
      if (k.has('s') || k.has('arrowdown')) c.y += sp;
      c.x = Math.max(0, Math.min(thapStore.mapW || mapW, c.x));
      c.y = Math.max(0, Math.min(thapStore.mapH || mapH, c.y));
      const ctx = el.getContext('2d');
      if (!ctx || !thapStore.mapW) return;
      const mine = thapStore.frame?.me;
      const stance = mine?.stance;
      const targetIdx = stance === 'attack' && mine && mine.target >= 0 ? mine.target : undefined;
      const opts = {
        w, h, dpr, cam: c, colors, names, teams, teamColors, bases, mines, myIdx,
        rally: mine?.rally, showRally: stance === 'rally', targetIdx,
        ghostRally: rallyMode.current && hoverWorld.current ? hoverWorld.current : undefined,
        dark: settings.theme === 'dark',
      };
      renderScene(ctx, opts);
      const m = miniRef.current;
      if (m) {
        const mh = Math.round((MINI_W * thapStore.mapH) / thapStore.mapW);
        if (m.width !== MINI_W * dpr || m.height !== mh * dpr) { m.width = MINI_W * dpr; m.height = mh * dpr; }
        const mctx = m.getContext('2d');
        if (mctx) renderMinimap(mctx, MINI_W, mh, dpr, c, w, h, opts);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, names, teams, teamColors, bases, mines, settings.theme, myIdx]);

  // ---------- chuột / cảm ứng ----------
  useEffect(() => {
    const el = canvasRef.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; cx: number; cy: number } | null = null;
    let pinch: { d: number; zoom: number; mx: number; my: number; cx: number; cy: number } | null = null;
    let tap: { x: number; y: number; id: number } | null = null;

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
        tap = null;
      } else if (pts.size === 1) {
        startDrag();
        tap = e.button === 0 || e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
        if (!rallyMode.current && !targetMode.current) el.style.cursor = 'grabbing';
      }
    };
    const move = (e: PointerEvent) => {
      if (rallyMode.current) hoverWorld.current = toWorld(e.clientX, e.clientY);
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
      const c = cam.current;
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        c.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
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
      if (tap && tap.id === e.pointerId && e.type === 'pointerup') {
        const wpt = toWorld(e.clientX, e.clientY);
        if (rallyMode.current) {
          placeRallyRef.current(wpt.x, wpt.y);
        } else {
          tryClickEnemyBaseRef.current(wpt.x, wpt.y);
        }
      }
      tap = null;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) startDrag();
      if (pts.size === 0) {
        drag = null;
        el.style.cursor = rallyMode.current || targetMode.current ? 'crosshair' : 'grab';
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const c = cam.current;
      const before = toWorld(e.clientX, e.clientY);
      c.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.clientX, e.clientY);
      c.x += before.x - after.x;
      c.y += before.y - after.y;
    };
    const leave = () => {
      hoverWorld.current = null;
    };
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
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
      if (k === 'escape') { setPickTarget(false); setRallyPick(false); return; }
      if (k === ' ') { e.preventDefault(); goHome(); return; }
      if (!canAct || e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 't') { setRallyPick(false); setPickTarget((v) => !v); return; }
      if (k === 'p') { defend(); return; }
      if (k === 'r') { startRally(); return; }
      const uk = THAP_UNIT_KINDS.find((u) => {
        const hk = THAP_UNITS[u].hotkey.toLowerCase();
        return e.code === `Digit${THAP_UNITS[u].hotkey}` || e.code === `Numpad${THAP_UNITS[u].hotkey}` || k === hk;
      });
      if (uk) { e.preventDefault(); selectUnit(uk); }
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
  }, [canAct, myIdx, bases]);

  const miniPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / (r.width || MINI_W)) * mapW, y: ((e.clientY - r.top) / (r.height || miniH)) * mapH };
  };

  // ---------- dữ liệu cho bảng điều khiển ----------
  void hud;
  const remaining = thap.endsAt ? thap.endsAt - now : undefined;
  const scores = frame?.sc ?? [];
  const isAliveIdx = (i: number) => (frame ? frame.al[i] === 1 : players[i]?.alive !== false);
  const ranking = players
    .filter(Boolean)
    .map((p) => ({ ...p, score: result?.scores[p.idx] ?? scores[p.idx] ?? 0, alive: isAliveIdx(p.idx), hp: thapStore.baseHp[p.idx] ?? 100 }))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
  const teamRanking = mode === 'ffa'
    ? []
    : [...new Set(ranking.map((r) => r.team))]
      .map((t) => ({ team: t, score: ranking.filter((r) => r.team === t).reduce((s, r) => s + r.score, 0), alive: ranking.some((r) => r.team === t && r.alive) }))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
  const teamName = (t: number) => (mode === 'coop' ? (t === 0 ? 'Liên quân người chơi' : 'Liên quân máy') : THAP_TEAM_NAMES[t] ?? `Đội ${t + 1}`);
  const myInfo = myIdx !== undefined ? players[myIdx] : undefined;
  let myArmy = 0;
  if (myIdx !== undefined) for (const u of thapStore.units.values()) if (u.owner === myIdx) myArmy++;
  const enemies = ranking.filter((r) => r.idx !== myIdx && r.alive && (myTeam === undefined || r.team !== myTeam));
  const stance = me?.stance ?? 'attack';
  const targetInfo = stance === 'attack' && me && me.target >= 0 ? players[me.target] : undefined;
  const myRank = ranking.findIndex((r) => r.idx === myIdx) + 1;
  const selectedKind: ThapUnitKind = me?.auto ?? 'newbie';
  const selectedSpec = THAP_UNITS[selectedKind] ?? THAP_UNITS.newbie;
  const inspectSpec = THAP_UNITS[hoverKind] ?? selectedSpec;
  const iWon = !!result && myIdx !== undefined && result.winnerIdxs.includes(myIdx);
  const winnerTitle = !result
    ? ''
    : iWon
      ? mode === 'ffa' ? 'Thành của bạn xưng bá Miragine War!' : `${teamName(result.winnerTeam)} của bạn chiến thắng!`
      : result.winnerTeam < 0 || !result.winnerIdxs.length
        ? 'Không ai chiến thắng'
        : mode === 'ffa'
          ? `${players[result.winnerIdxs[0]]?.name ?? 'Một phe'} chiến thắng!`
          : `${teamName(result.winnerTeam)} chiến thắng!`;

  const stanceLabel = stance === 'defend'
    ? <span className="thap-stance defend">🛡️ Đang Phòng Thủ quanh Pha Lê Chính</span>
    : stance === 'rally'
      ? <span className="thap-stance rally">🚩 Tập Kết tại cờ</span>
      : <><span className="thap-stance attack">🎯 Tấn Công - Chỉ Định</span>{targetInfo && <button className="link" onClick={goTarget} title="Nhìn tới Pha Lê địch đang đánh"><span className="dot" style={{ background: targetInfo.color }} /> {targetInfo.name}</button>}</>;

  return (
    <div className={`thap-game${chatOpen ? ' chat-on' : ''}${rallyPick || pickTarget ? ' picking' : ''}`} style={FULL_SCREEN}>
      <canvas ref={canvasRef} className="thap-canvas" style={FILL} />

      {/* thanh trên chuẩn 100% Miragine War */}
      <div className="thap-top">
        <div className="thap-res">
          {myInfo && (
            <button type="button" className="thap-me-dot-btn" onClick={goHome} title={`Nhìn về Pha Lê của ${myInfo.name} (Space)`}>
              <span className="thap-me-dot" style={{ background: myInfo.color }} />
            </button>
          )}
          {me && alive ? (
            <>
              <span className="thap-pill gold" title="Vàng hiện tại – tự động trừ khi Cổng Triệu Hồi xuất lính đang chọn">
                <img src="/database-miraginewar/ui/icon_money.png" alt="Money" className="thap-ui-ico" />
                <b>{fmtCoins(Math.floor(me.gold))}</b>
              </span>
              <span className="thap-pill income-pill" title="Thu nhập nhận mỗi đợt (tăng thêm khi triệu hồi lính, tối đa 8000)">
                <img src="/database-miraginewar/ui/icon_income.png" alt="Income" className="thap-ui-ico" />
                <b>+{fmtCoins(me.roundIncome ?? 100)}</b>
              </span>
              <span className="thap-pill time-pill" title="Đồng hồ đếm ngược đợt cấp vàng & xuất quân tiếp theo (đợt đầu 6s, các đợt sau 30s)">
                <span className="thap-round-clock">⏱ {me.roundLeft ?? 6}s</span>
              </span>
              <span className={`thap-pill${me.pop >= me.popCap ? ' warn' : ''}`} title="Dân số hiện tại / tối đa 60">
                <img src="/database-miraginewar/ui/icon_renli.png" alt="Population" className="thap-ui-ico" />
                <b>{me.pop}/{me.popCap}</b>
              </span>
              <span className="thap-pill" title="Đã hạ / đã mất"><Crosshair size={14} /><b>{me.kills}</b><span className="muted">/ {me.lost}</span></span>
            </>
          ) : (
            <span className="thap-pill">{myIdx === undefined ? '👀 Đang xem' : '💀 Pha Lê đã vỡ – đang xem'}</span>
          )}
          <span className="thap-pill" title={remaining !== undefined ? 'Thời gian còn lại' : 'Thời gian đã chơi'}>
            ⏳ <b className={remaining !== undefined && remaining < 60_000 ? 'bad-text' : ''}>{remaining !== undefined ? fmtTime(remaining) : fmtTime(frame?.elapsed ?? 0)}</b>
          </span>
          {view.pot > 0 && <span className="thap-pill" title={`Mỗi người cược ${view.bet} xu`}>🪙 <b>{fmtCoins(view.pot)}</b></span>}
        </div>
        <div className="thap-top-right">
          <button className={`thap-icon${guideOpen ? ' on' : ''}`} onClick={() => setGuideOpen(true)} title="Menu & Cẩm nang 16 binh chủng Miragine War">
            <BookOpen size={17} />
          </button>
          <button className={`thap-icon${scoresOpen ? ' on' : ''}`} onClick={() => setScoresOpen((v) => !v)} title="Bảng xếp hạng 10 Phe">
            <Trophy size={17} />
            {myRank > 0 && <span className="thap-badge plain">#{myRank}</span>}
          </button>
          <button className={`thap-icon${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)} title="Trò chuyện / nhật ký">
            <MessageSquare size={17} />
            {unread > 0 && !chatOpen && <span className="thap-badge">{unread}</span>}
          </button>
          <div className="thap-dock">{dock}</div>
          <button className="thap-icon" onClick={() => (ended || !alive ? emit('room:leave') : setLeaveAsk(true))} title="Rời trận">
            <LogOut size={17} />
          </button>
        </div>
      </div>

      {scoresOpen && !chatOpen && (
        <div className="thap-scores">
          {teamRanking.length > 0 && (
            <div className="thap-team-sum">
              {teamRanking.map((t) => (
                <span key={t.team} className={`thap-team-chip${t.alive ? '' : ' dead'}${t.team === myTeam ? ' me' : ''}`} style={{ borderColor: THAP_TEAM_COLORS[t.team] }}>
                  <i style={{ background: THAP_TEAM_COLORS[t.team] }} /> {teamName(t.team)} <b>{t.score}</b>
                </span>
              ))}
            </div>
          )}
          {ranking.map((r, i) => {
            const isEnemy = r.idx !== myIdx && r.alive && (myTeam === undefined || r.team !== myTeam);
            const isTargeted = stance === 'attack' && me?.target === r.idx;
            return (
              <div key={r.idx} className={`thap-score-row${r.idx === myIdx ? ' me' : ''}${r.alive ? '' : ' dead'}${isTargeted ? ' targeted' : ''}`}>
                <button
                  type="button"
                  className="thap-score-look"
                  onClick={() => bases[r.idx] && centerOn(bases[r.idx][0], bases[r.idx][1])}
                  title="Bấm để nhìn tới Pha Lê này"
                >
                  <span className="rank">{i + 1}</span>
                  <span className="dot" style={{ background: r.color }} />
                  <span className="name">{r.bot ? '🤖 ' : ''}{r.name.replace(/^🤖\s*/, '')}</span>
                  {mode !== 'ffa' && <span className="team" style={{ background: THAP_TEAM_COLORS[r.team] }} title={teamName(r.team)} />}
                  <span className="hp" title="Máu Pha Lê Chính">{r.alive ? <i style={{ width: `${r.hp}%` }} /> : '☠️'}</span>
                  <b>{r.score}</b>
                </button>
                {canAct && isEnemy && (
                  <button
                    type="button"
                    className={`thap-quick-atk${isTargeted ? ' on' : ''}`}
                    onClick={() => attack(r.idx)}
                    title={`Tấn Công - Chỉ Định vào ${r.name}`}
                  >
                    🎯 Đánh
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {alertText && <button className="thap-alert" onClick={goHome}>⚠️ {alertText} <span className="muted">(Space)</span></button>}
      {rallyPick && <div className="thap-hint">🚩 Chạm vào bản đồ để cắm cờ <b>Tập Kết</b> · kéo vẫn di chuyển được · <button className="link" onClick={() => setRallyPick(false)}>Huỷ (Esc)</button></div>}
      {pickTarget && <div className="thap-hint">🎯 Chọn Pha Lê địch bên dưới hoặc <b>chạm thẳng vào Pha Lê địch trên bản đồ</b> để <b>Tấn Công - Chỉ Định</b> · <button className="link" onClick={() => setPickTarget(false)}>Đóng (Esc)</button></div>}
      {!canAct && !ended && <div className="thap-spec-banner">{myIdx === undefined ? '👀 Bạn đang xem trận đấu' : '💀 Pha Lê Chính đã vỡ – đang xem'}</div>}

      {/* bản đồ nhỏ */}
      <div className="thap-mini">
        <canvas
          ref={miniRef}
          style={{ width: MINI_W, height: miniH }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
            const p = miniPoint(e);
            if (rallyPick && e.button === 0) return placeRally(p.x, p.y);
            if (pickTarget && e.button === 0 && tryClickEnemyBase(p.x, p.y)) return;
            centerOn(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1 || rallyPick || pickTarget) return;
            const p = miniPoint(e);
            centerOn(p.x, p.y);
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      {/* phía dưới: đúng 3 nút chỉ huy (Tấn Công - Chỉ Định, Phòng Thủ, Tập Kết) + Bảng 16 quân 2×8 chuẩn 100% Miragine War */}
      <div className="thap-bottom">
        {canAct && me && (
          <>
            {pickTarget && (
              <div className="thap-targets" role="dialog" aria-label="Chọn mục tiêu Tấn Công - Chỉ Định">
                <div className="thap-targets-head">
                  <b>🎯 Tấn Công - Chỉ Định Pha Lê nào?</b>
                  <span className="muted small">Toàn bộ đạo quân sẽ hành quân thẳng tới tiêu diệt Pha Lê địch được chỉ định (hoặc bấm trực tiếp vào Pha Lê địch trên bản đồ)</span>
                  <button className="ghost small" onClick={() => setPickTarget(false)}>Đóng</button>
                </div>
                <div className="thap-targets-list">
                  {enemies.length === 0 && <span className="muted small">Không còn Pha Lê địch nào.</span>}
                  {enemies.map((e) => (
                    <button key={e.idx} className={`thap-target${stance === 'attack' && me.target === e.idx ? ' on' : ''}`} onClick={() => attack(e.idx)}>
                      <span className="dot" style={{ background: e.color }} />
                      <b>{e.bot ? '🤖 ' : ''}{e.name.replace(/^🤖\s*/, '')}</b>
                      <span className="thap-target-hp"><i style={{ width: `${e.hp}%` }} /></span>
                      <span className="muted small">Máu {e.hp}% · {e.score} điểm{mode !== 'ffa' ? ` · ${teamName(e.team)}` : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="thap-orders">
              <div className="thap-orders-state">
                {stanceLabel}
                <span className="muted small">· {myArmy} lính trên chiến trường</span>
              </div>
              <div className="thap-orders-btns">
                <button
                  className={`thap-order attack${stance === 'attack' || pickTarget ? ' on' : ''}`}
                  onClick={() => { setRallyPick(false); setPickTarget((v) => !v); }}
                  title="Tấn Công - Chỉ Định: Chọn 1 Pha Lê địch trên danh sách hoặc bấm thẳng vào Pha Lê địch trên bản đồ (T)"
                >
                  <Target size={17} /> Tấn Công - Chỉ Định <kbd>T</kbd>
                </button>
                <button
                  className={`thap-order defend${stance === 'defend' ? ' on' : ''}`}
                  onClick={defend}
                  title="Phòng Thủ: Rút toàn bộ đạo quân về giữ quanh Pha Lê Chính & Cổng Triệu Hồi (P)"
                >
                  <Shield size={17} /> Phòng Thủ <kbd>P</kbd>
                </button>
                <button
                  className={`thap-order rally${stance === 'rally' || rallyPick ? ' on' : ''}`}
                  onClick={startRally}
                  title="Tập Kết: Chạm bản đồ để cắm cờ tập kết đại quân (R)"
                >
                  <Flag size={16} /> Tập Kết <kbd>R</kbd>
                </button>
              </div>
            </div>

            <div className="thap-army">
              {/* Thanh thông tin đơn vị & Trạng thái Cổng Triệu Hồi chuẩn Miragine War */}
              <div className="thap-info-bar">
                <div className="thap-unit-inspect">
                  <UnitIcon kind={hoverKind} className="thap-inspect-ico" />
                  <div className="thap-inspect-meta">
                    <div className="thap-inspect-title">
                      <b>{inspectSpec.vnName}</b>
                      <span className="muted small">({inspectSpec.name})</span>
                      <span className="thap-tag cost">💰 {inspectSpec.cost}</span>
                      <span className="thap-tag inc">📈 +{inspectSpec.incomeBonus} thu nhập</span>
                      <span className={`thap-tag armor ${inspectSpec.armorTypeID === 1 ? 'heavy' : 'light'}`}>
                        {inspectSpec.armorTypeID === 1 ? '🛡️ Giáp Nặng' : '🥋 Giáp Nhẹ'} (Giáp {inspectSpec.armor})
                      </span>
                      <span className="thap-tag hp">❤️ {inspectSpec.hp}</span>
                      <span className="thap-tag dmg">
                        ⚔️ {inspectSpec.damage[0]} vs Nhẹ / {inspectSpec.damage[1]} vs Nặng
                      </span>
                    </div>
                    <div className="thap-inspect-desc">
                      <span>{inspectSpec.desc}</span>
                      {counterText(hoverKind) && <span className="thap-counter-inline"> · {counterText(hoverKind)}</span>}
                    </div>
                  </div>
                </div>

                <div className="thap-portal-status">
                  <UnitIcon kind={selectedKind} className="thap-q-ico" />
                  <div className="thap-portal-text">
                    <b>Cổng đang triệu hồi: {selectedSpec.vnName} ({selectedSpec.name})</b>
                    <span className="small muted">
                      {me.blocked === 'pop'
                        ? '⛔ Đã đạt tối đa 60/60 dân số – chờ lính trống để xuất tiếp'
                        : me.gold >= selectedSpec.cost
                          ? `✨ Đủ vàng (${Math.floor(me.gold)}/${selectedSpec.cost}) – đang bước ra từ Cổng Triệu Hồi!`
                          : `⏳ Tích vàng triệu hồi (${Math.floor(me.gold)}/${selectedSpec.cost} vàng · đợt tới sau ${me.roundLeft ?? 30}s +${me.roundIncome} vàng)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Lưới 2 hàng × 8 cột = 16 binh chủng nguyên bản Miragine War */}
              <div className="thap-slots">
                {THAP_UNIT_KINDS.map((k) => {
                  const s = THAP_UNITS[k];
                  const isSelected = selectedKind === k;
                  const canAffordNow = me.gold >= s.cost;
                  return (
                    <div
                      key={k}
                      className={`thap-slot-wrap${isSelected ? ' auto' : ''}${hoverKind === k ? ' active' : ''}`}
                      onMouseEnter={() => setHoverKind(k)}
                    >
                      <button
                        type="button"
                        className={`thap-slot${!canAffordNow && !isSelected ? ' off' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => selectUnit(k)}
                        title={`${s.vnName} (${s.name}) – ${s.desc}\nGiá ${s.cost} vàng · Thu nhập +${s.incomeBonus}/vòng · Dân số ${s.pop}\nMáu ${s.hp} · ${s.armorTypeID === 1 ? 'Giáp Nặng' : 'Giáp Nhẹ'} (Giáp ${s.armor}) · Công [${s.damage[0]} vs Nhẹ / ${s.damage[1]} vs Nặng]\n${counterText(k)}\nBấm (${s.hotkey}): Chọn làm quân triệu hồi tại Cổng`}
                      >
                        <kbd>{s.hotkey}</kbd>
                        {isSelected && <span className="thap-slot-count">ĐANG CHỌN</span>}
                        <UnitIcon kind={k} color={myColor} />
                        <span className="thap-slot-name">{KIND_SHORT[k]}</span>
                        <span className="thap-slot-cost">
                          💰{s.cost} <small className="thap-slot-inc">+{s.incomeBonus}</small>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {chatOpen && (
        <div className="thap-chat">
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
        <div className="thap-end">
          <div className="thap-end-card">
            {myIdx !== undefined && (
              <div className="thap-end-banner">
                <img
                  src={iWon ? '/database-miraginewar/ui/win.png' : '/database-miraginewar/ui/lose.png'}
                  alt={iWon ? 'Victory' : 'Defeat'}
                  className="thap-end-img"
                />
              </div>
            )}
            <h2 className={iWon ? 'win' : ''}>
              <Trophy size={22} className="inline-icon" /> {winnerTitle}
            </h2>
            <p className="muted">{result.reason}</p>
            <ol className="thap-end-list">
              {[...ranking]
                .sort((a, b) => Number(result.winnerIdxs.includes(b.idx)) - Number(result.winnerIdxs.includes(a.idx)) || b.score - a.score)
                .map((r) => {
                  const human = view.players.find((p) => p.id === r.id);
                  const paid = view.payouts?.[r.id];
                  const won = result.winnerIdxs.includes(r.idx);
                  return (
                    <li key={r.idx} className={`${r.idx === myIdx ? 'me' : ''}${won ? ' won' : ''}`}>
                      <span className="dot" style={{ background: r.color }} />
                      <span className="name">
                        {won && '🏆 '}{r.bot ? '🤖 ' : ''}{r.name.replace(/^🤖\s*/, '')}{!r.alive && ' ☠️'}
                        {mode !== 'ffa' && <small className="muted"> · {teamName(r.team)}</small>}
                      </span>
                      <b>{r.score} điểm</b>
                      {view.pot > 0 && human && won && paid !== undefined && <span className="good-text">nhận {fmtCoins(paid)} xu</span>}
                      {view.pot > 0 && human && won && paid === undefined && view.winnerId === r.id && <span className="good-text">+{fmtCoins(view.pot - view.bet)} xu</span>}
                      {view.pot > 0 && human && !won && paid !== undefined && <span className="muted">hoàn {fmtCoins(paid)} xu</span>}
                      {!(view.pot > 0 && human && (won || paid !== undefined)) && <span />}
                    </li>
                  );
                })}
            </ol>
            <div className="thap-end-actions">
              <button className="ghost" onClick={() => emit('room:leave')}><LogOut size={15} /> Rời phòng</button>
              {isHost ? (
                <button className="primary big" onClick={() => emit('game:restart')}><RotateCcw size={17} /> Chơi lại</button>
              ) : (
                <span className="muted small">Chờ chủ phòng mở ván mới…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {guideOpen && (
        <Modal
          title={<span className="modal-title-icon"><Volume2 size={19} /> Menu & Cẩm Nang Miragine War (10 Người)</span>}
          onClose={() => setGuideOpen(false)}
          width={860}
        >
          <div className="miragine-menu-modal">
            <div className="miragine-menu-hero">
              <img src="/database-miraginewar/ui/title_bg.jpg" alt="Miragine War Title" className="miragine-title-img" />
              <div className="miragine-hero-overlay">
                <h3>⚔️ MIRAGINE WAR – FIRST CAMPAIGN (10 PLAYERS)</h3>
                <p>
                  Đợt đầu sau <b>6 giây</b> nhận <b>100 vàng</b>, các đợt tiếp theo mỗi <b>30 giây</b> nhận thêm vàng theo <b>Thu nhập (Income)</b>.
                  Chọn 1 trong <b>16 binh chủng</b> ở bảng 2×8 để Cổng Triệu Hồi tự động xuất quân và tăng Thu nhập mỗi vòng!
                </p>
              </div>
            </div>
            <div className="miragine-tutorial-box">
              <img src="/database-miraginewar/ui/tutorial_bg.jpg" alt="Miragine War Unit Guide" className="miragine-tutorial-img" />
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary big" onClick={() => setGuideOpen(false)}>Tiếp tục chiến đấu</button>
          </div>
        </Modal>
      )}

      {leaveAsk && (
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Rời trận Miragine War?</span>} width={420}>
          <p>
            Rời bây giờ là <b>đầu hàng</b>: Pha Lê Chính của bạn vỡ ngay, lính biến mất
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
