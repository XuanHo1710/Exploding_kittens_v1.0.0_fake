/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) – Bàn Chiến Trường 2.5D & Bộ Điều Khiển RTS
 *
 * Tính năng cốt lõi:
 * - Vòng lặp dựng hình Canvas 2.5D toàn màn hình 60/120/144 FPS theo đúng 9 lớp chiều sâu Total War:
 *   Địa hình -> Vòng Đấu Tướng -> Chỉ báo mặt đất & Chấm dàn quân -> Binh sĩ hoạt ảnh ->
 *   Tia lửa Đấu Tướng -> Tán Rừng Thông (tự mờ khi zoom cận cảnh) -> Vòm tên đỏ 3D ->
 *   Mưa tên & Đá lửa Uy Viễn -> Huy hiệu Danh Tướng & Binh chủng.
 * - Điều khiển RTS chuẩn Total War: Three Kingdoms:
 *   + Chuột trái chọn / Shift chọn gộp / Nhấp đúp chọn toàn bộ trung đoàn cùng binh chủng / Kéo khung chọn quân.
 *   + Chuột phải vào địch: Công kích hoặc Thách Đấu Tướng 1v1 (Chế độ Diễn Nghĩa).
 *   + Giữ & Kéo chuột phải trên mặt đất: Dàn hàng quân tùy biến bề ngang & hướng mặt trực quan từng người lính!
 *   + Lăn chuột thu phóng neo theo con trỏ; WASD / Phím mũi tên / Kéo chuột giữa / Cảm ứng đa điểm di chuyển ống kính.
 *   + Phím tắt: Space (giữ hiện chấm chiến thuật & đường đạn / nhấp đúp về Chủ Tướng), Ctrl+A, Ctrl+1..9 & 1..9,
 *     H/Backspace (Dừng), G (Phòng thủ), F (Tự bắn), K (Du kích), Q (Tuyệt kỹ Ngũ Hành), V (Thách Đấu Tướng).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  BookOpen,
  Eye,
  LogOut,
  MessageSquare,
  RotateCcw,
  Shield,
  Swords,
  Trophy,
} from 'lucide-react';
import type { RoomView } from '../../../shared/src/protocol';
import {
  DEFAULT_TW_CONFIG,
  TW_CLASSES,
  TW_DEPLOYABLES,
  TW_FACTIONS,
  TW_GENERALS,
  TW_GENERAL_CLASSES,
  TW_MAPS,
  TW_MODE_LABEL,
  TW_TEAM_COLORS,
  TW_TEAM_NAMES,
  TW_UNITS,
  normalizeTwConfig,
  type TwBanterEvent,
  type TwBattleSpeed,
  type TwCommand,
  type TwDeployableKind,
  type TwDuelFrame,
  type TwDuelStance,
  type TwFrame,
  type TwGeneralClass,
  type TwGeneralId,
  type TwMapId,
  type TwMapSpec,
  type TwRegimentFrame,
  type TwRoomView,
  type TwSideSummary,
} from '../../../shared/src/tw';
import {
  TW_DEFAULT_ZOOM,
  TW_ISO_TILT,
  clampTwCamera,
  computeDragLinePreview,
  createTwCamera,
  screenToWorld,
  worldToScreen,
  zoomTwCameraAt,
  type TwCamera,
  type TwDragLinePreview,
} from '../tw/camera';
import { twStore } from '../tw/store';
import { onTwAssetLoad, preloadTwAssets } from '../tw/sprites';
import { playTwSfx, startTwBgm, stopTwBgm, syncTwBgmMute } from '../tw/sound';
import { TW_BATTLE_LORE, pickOrderCallout } from '../tw/banter';
import { renderTwForestCanopy, renderTwTerrain } from '../tw/renderTerrain';
import { renderTwRedTrajectories, renderTwTacticalUnderlays } from '../tw/renderTactical';
import {
  hitTestTwRegiment,
  isTwRegimentAllied,
  isTwRegimentVisibleToViewer,
  renderTwDuelArenasGround,
  renderTwDuelArenasSparks,
  renderTwOverheadBadges,
  renderTwProjectiles,
  renderTwRegimentSoldiers,
  type TwRenderUnitsOptions,
} from '../tw/renderUnits';
import TwBanterOverlay from '../tw/hud/TwBanterOverlay';
import TwRetinueHud from '../tw/hud/TwRetinueHud';
import TwMinimap from '../tw/hud/TwMinimap';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { roomPeople } from './Spectators';
import { fmtCoins } from './Dock';
import Modal from './Modal';
import { useSettings } from '../settings';
import '../tw/tw.css';

export interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LeftPointerSession {
  pointerId: number;
  startSx: number;
  startSy: number;
  curSx: number;
  curSy: number;
  panMode: boolean;
  marqueeActive: boolean;
  shiftKey: boolean;
  ctrlOrMeta: boolean;
}

interface RightPointerSession {
  pointerId: number;
  startSx: number;
  startSy: number;
  startWx: number;
  startWy: number;
  curSx: number;
  curSy: number;
  draggingLine: boolean;
  initialEnemyRegId: number | null;
}

const SCREEN_FALLBACK_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  overflow: 'hidden',
  background: '#141815',
};

const CANVAS_FALLBACK_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
};

const WUXING_ICON_BY_CLASS: Record<TwGeneralClass, string> = {
  vanguard: '/database-total-war/ui/el_fire.png',
  champion: '/database-total-war/ui/el_wood.png',
  sentinel: '/database-total-war/ui/el_metal.png',
  commander: '/database-total-war/ui/el_earth.png',
  strategist: '/database-total-war/ui/el_water.png',
};

const VICTORY_LABELS: Record<
  NonNullable<NonNullable<TwRoomView['result']>['victoryKind']>,
  { vn: string; en: string }
> = {
  heroic: { vn: 'Đại Thắng Huyền Thoại', en: 'Heroic Victory' },
  decisive: { vn: 'Toàn Thắng Áp Đảo', en: 'Decisive Victory' },
  close: { vn: 'Thắng Sát Nút', en: 'Close Victory' },
  pyrrhic: { vn: 'Thảm Thắng Bi Tráng', en: 'Pyrrhic Victory' },
  draw: { vn: 'Bất Phân Thắng Bại', en: 'Battlefield Draw' },
};

function getTwRoomView(view: RoomView): TwRoomView | undefined {
  return (view as RoomView & { tw?: TwRoomView }).tw;
}

function clampNum(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function isRegimentAlive(reg: TwRegimentFrame): boolean {
  return (
    reg.men > 0 &&
    reg.hp > 0 &&
    reg.anim !== 'dead' &&
    reg.moraleState !== 'shattered'
  );
}

function isRegimentWiped(reg: TwRegimentFrame): boolean {
  return reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead';
}

function isTypingInEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function formatDurationSec(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.max(0, Math.round(sec));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}p${String(ss).padStart(2, '0')}s`;
}

function makeTokenFallbackSvg(label: string, color: string): string {
  const safe = encodeURIComponent(label.slice(0, 2));
  const safeColor = encodeURIComponent(color);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="%23141618" stroke="${safeColor}" stroke-width="3"/><text x="32" y="39" text-anchor="middle" font-family="serif" font-size="22" font-weight="bold" fill="%23f2ece1">${safe}</text></svg>`;
}

function computeDeployableFacing(
  wx: number,
  wy: number,
  regs: ReadonlyArray<TwRegimentFrame>,
  ownerIdx: number | undefined,
  ms: TwMapSpec,
): number {
  if (ownerIdx !== undefined) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < regs.length; i++) {
      const r = regs[i];
      if (r.ownerIdx === ownerIdx && !isRegimentWiped(r)) {
        sx += r.x;
        sy += r.y;
        n++;
      }
    }
    if (n > 0) {
      const cx = sx / n;
      const cy = sy / n;
      if (Math.hypot(wx - cx, wy - cy) > 20) {
        return Number(Math.atan2(wy - cy, wx - cx).toFixed(4));
      }
    }
  }
  return Number(Math.atan2(ms.height * 0.5 - wy, ms.width * 0.5 - wx).toFixed(4));
}

export default function TwBoard({ view, meId, emit, chat, dock }: Props) {
  const settings = useSettings();
  const tw = getTwRoomView(view);
  const isHost = view.hostId === meId;
  const ended = view.phase === 'ended' || Boolean(tw?.result);

  const config = useMemo(
    () => normalizeTwConfig(tw?.config ?? DEFAULT_TW_CONFIG, view.players.length),
    [tw?.config, view.players.length],
  );

  const resolvedMapId: TwMapId = tw?.mapId ?? config.mapId ?? 'pingyuan';
  const mapSpec = TW_MAPS[resolvedMapId] ?? TW_MAPS.pingyuan;

  const myIdx = useMemo(() => {
    if (tw?.myIdx !== undefined) return tw.myIdx;
    const found = tw?.players?.find((p) => p.id === meId);
    return found?.idx;
  }, [tw?.myIdx, tw?.players, meId]);

  // ---------- Trạng thái HUD & Ngăn kéo Giao diện ----------
  const [hudTick, setHudTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [hoveredRegId, setHoveredRegId] = useState<number | null>(null);
  const [showTacticalDots, setShowTacticalDots] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeRect | null>(null);
  const [isPanningUi, setIsPanningUi] = useState(false);
  const [isRightDraggingUi, setIsRightDraggingUi] = useState(false);
  const [activeBanter, setActiveBanter] = useState<TwBanterEvent | null>(null);
  const [calloutToast, setCalloutToast] = useState<string | null>(null);
  const [activeDeployableKind, setActiveDeployableKind] = useState<TwDeployableKind | null>(null);

  const [guideOpen, setGuideOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > 1080,
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [leaveAsk, setLeaveAsk] = useState(false);

  const { typingNames, unread } = useChatState(
    chat,
    roomPeople(view),
    meId,
    chatOpen && chatTab === 'chat',
  );

  // ---------- Refs hiệu năng cao cho vòng lặp 60 FPS ----------
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camRef = useRef<TwCamera>(
    createTwCamera(
      mapSpec.width,
      mapSpec.height,
      typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280,
      typeof window !== 'undefined' ? window.innerHeight || 720 : 720,
      TW_DEFAULT_ZOOM,
    ),
  );

  const centeredRef = useRef(false);
  const autoSelectedRef = useRef(false);
  const prevStartedAtRef = useRef<number | undefined>(tw?.startedAt);
  const endedSfxPlayedRef = useRef(false);

  const selectedIdsRef = useRef<Set<number>>(selectedIds);
  selectedIdsRef.current = selectedIds;

  const hoveredRegIdRef = useRef<number | null>(hoveredRegId);
  hoveredRegIdRef.current = hoveredRegId;

  const activeDeployableKindRef = useRef<TwDeployableKind | null>(activeDeployableKind);
  activeDeployableKindRef.current = activeDeployableKind;

  const hoverWorldRef = useRef<{ wx: number; wy: number } | null>(null);
  const dragPreviewRef = useRef<TwDragLinePreview | null>(null);

  const keysHeldRef = useRef<Set<string>>(new Set());
  const spaceHeldRef = useRef(false);
  const controlGroupsRef = useRef<Map<number, Set<number>>>(new Map());

  const leftPointerRef = useRef<LeftPointerSession | null>(null);
  const rightPointerRef = useRef<RightPointerSession | null>(null);
  const middlePanRef = useRef<{ pointerId: number; lastSx: number; lastSy: number } | null>(null);
  const activeTouchesRef = useRef<Map<number, { sx: number; sy: number }>>(new Map());
  const pinchStateRef = useRef<{ lastDist: number; lastMidSx: number; lastMidSy: number } | null>(
    null,
  );

  const lastLeftClickRef = useRef<{ at: number; regId: number }>({ at: 0, regId: -1 });
  const lastTouchEmptyTapRef = useRef<{ at: number; wx: number; wy: number }>({
    at: 0,
    wx: 0,
    wy: 0,
  });
  const lastSpaceTapRef = useRef<{
    downAt: number;
    prevTapAt: number;
    savedDots: boolean;
    savedTraj: boolean;
  }>({
    downAt: 0,
    prevTapAt: 0,
    savedDots: true,
    savedTraj: true,
  });
  const lastGroupTapRef = useRef<{ at: number; group: number }>({ at: 0, group: -1 });
  const activeBanterIdRef = useRef<number | null>(null);

  // ---------- Vòng đời: Nạp tài nguyên, BGM & Lắng nghe Store ----------
  useEffect(() => {
    preloadTwAssets();
    twStore.reset();
    startTwBgm('game');
    syncTwBgmMute();

    let lastHudUpdate = 0;
    let pendingTimer: number | undefined;

    const bumpHud = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const bNow = twStore.currentBanter(now);
      const nextBanterId = bNow ? bNow.id : null;
      if (nextBanterId !== activeBanterIdRef.current) {
        activeBanterIdRef.current = nextBanterId;
        setActiveBanter(bNow);
      }

      if (now - lastHudUpdate >= 110) {
        lastHudUpdate = now;
        setHudTick((n) => n + 1);
      } else if (pendingTimer === undefined) {
        pendingTimer = window.setTimeout(() => {
          pendingTimer = undefined;
          lastHudUpdate = typeof performance !== 'undefined' ? performance.now() : Date.now();
          const latestBanter = twStore.currentBanter(lastHudUpdate);
          const latestId = latestBanter ? latestBanter.id : null;
          if (latestId !== activeBanterIdRef.current) {
            activeBanterIdRef.current = latestId;
            setActiveBanter(latestBanter);
          }
          setHudTick((n) => n + 1);
        }, 115);
      }
    };

    const unsubAssets = onTwAssetLoad(() => {
      setHudTick((n) => n + 1);
    });
    const unsubStore = twStore.subscribe(bumpHud);

    return () => {
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
      unsubAssets();
      unsubStore();
      stopTwBgm();
    };
  }, []);

  useEffect(() => {
    syncTwBgmMute();
  }, [settings.sound]);

  // Làm sạch trạng thái khi chủ phòng mở ván mới ngay trong cùng phòng
  useEffect(() => {
    if (tw?.startedAt !== undefined && tw.startedAt !== prevStartedAtRef.current) {
      prevStartedAtRef.current = tw.startedAt;
      twStore.reset();
      centeredRef.current = false;
      autoSelectedRef.current = false;
      endedSfxPlayedRef.current = false;
      controlGroupsRef.current.clear();
      dragPreviewRef.current = null;
      setSelectedIds(new Set());
      setHoveredRegId(null);
      setActiveBanter(null);
      setActiveDeployableKind(null);
      activeDeployableKindRef.current = null;
      activeBanterIdRef.current = null;
    }
  }, [tw?.startedAt]);

  // Tự ẩn khẩu lệnh điều quân sau 2.8 giây
  useEffect(() => {
    if (!calloutToast) return;
    const timer = window.setTimeout(() => setCalloutToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [calloutToast]);

  // ---------- Khung hình hiện tại & Dữ liệu dẫn xuất cho HUD ----------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frame: TwFrame | null = useMemo(() => twStore.currFrame, [hudTick]);

  const fallbackSides = useMemo<TwSideSummary[]>(() => {
    if (frame && frame.sides.length > 0) return frame.sides;
    return (tw?.players ?? []).map((p) => ({
      idx: p.idx,
      id: p.id,
      name: p.name,
      bot: p.bot,
      faction: p.faction,
      team: p.team,
      color: p.color,
      alive: p.alive,
      totalMen: 0,
      initialMen: 0,
      regimentsAlive: 0,
      kills: 0,
      score: 0,
    }));
  }, [frame, tw?.players]);

  const mySide = useMemo(
    () => (myIdx !== undefined ? fallbackSides.find((s) => s.idx === myIdx) : undefined),
    [fallbackSides, myIdx],
  );

  const myTeam = useMemo(() => {
    if (mySide !== undefined) return mySide.team;
    if (myIdx !== undefined) {
      const p = tw?.players?.find((pl) => pl.idx === myIdx);
      if (p) return p.team;
    }
    return undefined;
  }, [mySide, myIdx, tw?.players]);

  const myAlive = useMemo(() => {
    if (myIdx === undefined) return false;
    if (mySide) return mySide.alive;
    const p = tw?.players?.find((pl) => pl.idx === myIdx);
    return p ? p.alive : false;
  }, [myIdx, mySide, tw?.players]);

  const canControl = myIdx !== undefined && myAlive && !ended;

  const humanAliveCount = useMemo(
    () => fallbackSides.filter((s) => !s.bot && s.alive).length,
    [fallbackSides],
  );
  const canControlSpeed = canControl && (humanAliveCount <= 1 || view.players.length <= 1 || isHost);

  // Tự thoát chế độ đặt bẫy nếu hết lượt đặt hoặc không còn quyền điều quân
  useEffect(() => {
    if (!activeDeployableKind) return;
    if (!canControl) {
      setActiveDeployableKind(null);
      return;
    }
    if (mySide?.deployablesLeft && (mySide.deployablesLeft[activeDeployableKind] ?? 0) <= 0) {
      setActiveDeployableKind(null);
    }
  }, [activeDeployableKind, canControl, mySide]);

  const myRegiments = useMemo(() => {
    if (!frame || myIdx === undefined) return [];
    return frame.regiments.filter((r) => r.ownerIdx === myIdx);
  }, [frame, myIdx]);

  const visibleEnemyGenerals = useMemo(() => {
    if (!frame) return [];
    return frame.regiments.filter(
      (r) =>
        r.isGeneral &&
        !isRegimentWiped(r) &&
        !isTwRegimentAllied(r, myIdx, frame.sides, myTeam) &&
        isTwRegimentVisibleToViewer(r, myIdx, frame.sides, myIdx === undefined || ended, myTeam),
    );
  }, [frame, myIdx, myTeam, ended]);

  const hoveredReg = useMemo(() => {
    if (!frame || hoveredRegId === null) return null;
    const hit = frame.regiments.find((r) => r.id === hoveredRegId);
    if (!hit || isRegimentWiped(hit)) return null;
    if (
      !isTwRegimentVisibleToViewer(hit, myIdx, frame.sides, myIdx === undefined || ended, myTeam)
    ) {
      return null;
    }
    return hit;
  }, [frame, hoveredRegId, myIdx, myTeam, ended]);

  // Căn ống kính vào đạo quân của mình & tự chọn Chủ Tướng ngay khi khung hình đầu tiên tới
  useEffect(() => {
    if (!frame) return;

    if (!centeredRef.current) {
      const canvas = canvasRef.current;
      const vw = canvas?.clientWidth || window.innerWidth || 1280;
      const vh = canvas?.clientHeight || window.innerHeight || 720;
      const coarse =
        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

      camRef.current.viewW = vw;
      camRef.current.viewH = vh;

      const ownAlive =
        myIdx !== undefined
          ? frame.regiments.filter((r) => r.ownerIdx === myIdx && !isRegimentWiped(r))
          : [];

      if (ownAlive.length > 0) {
        let sumX = 0;
        let sumY = 0;
        for (const r of ownAlive) {
          sumX += r.x;
          sumY += r.y;
        }
        const cx = sumX / ownAlive.length;
        const cy = sumY / ownAlive.length;
        // Hướng nhẹ tầm nhìn về phía trung tâm chiến trường trước mặt đại quân
        camRef.current.x = cx + (mapSpec.width * 0.5 - cx) * 0.16;
        camRef.current.y = cy + (mapSpec.height * 0.5 - cy) * 0.16;
        camRef.current.zoom = coarse ? 0.56 : TW_DEFAULT_ZOOM;
      } else {
        camRef.current.x = mapSpec.width * 0.5;
        camRef.current.y = mapSpec.height * 0.5;
        camRef.current.zoom = coarse ? 0.46 : 0.54;
      }
      clampTwCamera(camRef.current, mapSpec.width, mapSpec.height);
      centeredRef.current = true;
    }

    if (!autoSelectedRef.current && myIdx !== undefined) {
      const ownAlive = frame.regiments.filter(
        (r) => r.ownerIdx === myIdx && !isRegimentWiped(r),
      );
      if (ownAlive.length > 0) {
        autoSelectedRef.current = true;
        if (selectedIdsRef.current.size === 0) {
          const leadGeneral =
            ownAlive
              .filter((r) => r.isGeneral)
              .sort((a, b) => a.generalSlot - b.generalSlot || a.id - b.id)[0] ?? ownAlive[0];
          setSelectedIds(new Set([leadGeneral.id]));
        }
      }
    }

    // Gỡ bỏ các trung đoàn đã bị tiêu diệt khỏi tập đang chọn
    if (selectedIdsRef.current.size > 0 && myIdx !== undefined) {
      const aliveMySet = new Set<number>();
      for (const r of frame.regiments) {
        if (r.ownerIdx === myIdx && !isRegimentWiped(r)) {
          aliveMySet.add(r.id);
        }
      }
      let changed = false;
      const pruned = new Set<number>();
      for (const id of selectedIdsRef.current) {
        if (aliveMySet.has(id)) pruned.add(id);
        else changed = true;
      }
      if (changed) setSelectedIds(pruned);
    }
  }, [frame, myIdx, mapSpec.width, mapSpec.height]);

  // Phát âm thanh Khải Hoàn / Bại Trận khi kết thúc chiến cuộc
  useEffect(() => {
    const res = tw?.result;
    if (!ended || !res || endedSfxPlayedRef.current) return;
    endedSfxPlayedRef.current = true;
    if (myIdx !== undefined) {
      const won = res.winnerIdxs.includes(myIdx) || (myTeam !== undefined && res.winnerTeam === myTeam);
      playTwSfx(won ? 'cheer' : 'rout');
    } else {
      playTwSfx('horn');
    }
  }, [ended, tw?.result, myIdx, myTeam]);

  // ---------- Các hàm điều hướng Camera & Phát lệnh Chiến thuật ----------
  const focusWorld = useCallback(
    (wx: number, wy: number, minZoom?: number) => {
      const cam = camRef.current;
      cam.x = wx;
      cam.y = wy;
      if (minZoom !== undefined && cam.zoom < minZoom) {
        cam.zoom = minZoom;
      }
      clampTwCamera(cam, mapSpec.width, mapSpec.height);
    },
    [mapSpec.width, mapSpec.height],
  );

  const resetCameraHome = useCallback(() => {
    const f = twStore.currFrame;
    if (f && myIdx !== undefined) {
      const ownAlive = f.regiments.filter((r) => r.ownerIdx === myIdx && !isRegimentWiped(r));
      const leadGen = ownAlive
        .filter((r) => r.isGeneral)
        .sort((a, b) => a.generalSlot - b.generalSlot || a.id - b.id)[0];
      if (leadGen) {
        focusWorld(leadGen.x, leadGen.y);
        playTwSfx('click');
        return;
      }
      if (ownAlive.length > 0) {
        const cx = ownAlive.reduce((acc, r) => acc + r.x, 0) / ownAlive.length;
        const cy = ownAlive.reduce((acc, r) => acc + r.y, 0) / ownAlive.length;
        focusWorld(cx, cy);
        playTwSfx('click');
        return;
      }
    }
    focusWorld(mapSpec.width * 0.5, mapSpec.height * 0.5);
    playTwSfx('click');
  }, [focusWorld, mapSpec.width, mapSpec.height, myIdx]);

  const announceCallout = useCallback((key: string, seed?: number) => {
    setCalloutToast(pickOrderCallout(key, seed));
  }, []);

  const emitCommand = useCallback(
    (cmd: TwCommand) => {
      emit('tw:cmd', cmd);
    },
    [emit],
  );

  const handleHudCommand = useCallback(
    (cmd: TwCommand) => {
      if (!canControl && cmd.t !== 'resign') return;
      emitCommand(cmd);
      switch (cmd.t) {
        case 'challenge_duel':
          playTwSfx('duel_gong');
          announceCallout('duel');
          break;
        case 'use_skill':
          playTwSfx('horn');
          announceCallout('skill');
          break;
        case 'set_formation':
          playTwSfx('order');
          if (cmd.formation === 'spearwall') announceCallout('spearwall');
          else if (cmd.formation === 'shieldwall' || cmd.formation === 'circle') {
            announceCallout('hold');
          }
          break;
        case 'halt':
          playTwSfx('order');
          announceCallout('hold');
          break;
        case 'toggle_stance':
        case 'toggle_fire_arrows':
        case 'set_speed':
          playTwSfx('click');
          break;
        case 'ready_deploy':
          playTwSfx('horn');
          break;
        case 'duel_action':
          playTwSfx(cmd.action === 'retreat' ? 'order' : 'clash');
          break;
        case 'place_deployable':
          playTwSfx('order');
          break;
        default:
          playTwSfx('order');
          break;
      }
    },
    [canControl, emitCommand, announceCallout],
  );

  const handleSetSpeed = useCallback(
    (speed: TwBattleSpeed) => {
      if (!canControlSpeed) return;
      emitCommand({ t: 'set_speed', speed });
      playTwSfx('click');
    },
    [canControlSpeed, emitCommand],
  );

  const handleSelectDeployableKind = useCallback(
    (kind: TwDeployableKind | null) => {
      if (!canControl) {
        setActiveDeployableKind(null);
        return;
      }
      setActiveDeployableKind(kind);
      playTwSfx('click');
    },
    [canControl],
  );

  const getSelectedLivingRegs = useCallback((): TwRegimentFrame[] => {
    const f = twStore.currFrame;
    if (!f || myIdx === undefined) return [];
    const sel = selectedIdsRef.current;
    if (sel.size === 0) return [];
    return f.regiments.filter((r) => r.ownerIdx === myIdx && !isRegimentWiped(r) && sel.has(r.id));
  }, [myIdx]);

  const selectAllMyArmy = useCallback(() => {
    const f = twStore.currFrame;
    if (!f || myIdx === undefined) return;
    const aliveIds = f.regiments
      .filter((r) => r.ownerIdx === myIdx && !isRegimentWiped(r))
      .map((r) => r.id);
    if (aliveIds.length === 0) return;
    setSelectedIds(new Set(aliveIds));
    playTwSfx('click');
    announceCallout('select');
  }, [myIdx, announceCallout]);

  const handleSelectRegimentFromHud = useCallback(
    (regId: number, multi: boolean, selectSameKind?: boolean) => {
      const f = twStore.currFrame;
      if (!f || myIdx === undefined) return;
      const target = f.regiments.find((r) => r.id === regId && r.ownerIdx === myIdx);
      if (!target || isRegimentWiped(target)) return;

      if (selectSameKind) {
        const sameKindIds = f.regiments
          .filter(
            (r) =>
              r.ownerIdx === myIdx &&
              !isRegimentWiped(r) &&
              r.kind === target.kind &&
              r.isGeneral === target.isGeneral,
          )
          .map((r) => r.id);
        setSelectedIds((prev) => {
          if (!multi) return new Set(sameKindIds);
          const next = new Set(prev);
          for (const id of sameKindIds) next.add(id);
          return next;
        });
      } else {
        setSelectedIds((prev) => {
          if (!multi) return new Set([regId]);
          const next = new Set(prev);
          if (next.has(regId)) next.delete(regId);
          else next.add(regId);
          return next;
        });
      }

      playTwSfx('click');
      if (target.isGeneral) announceCallout('select_general', target.id);
      else {
        const cat = TW_UNITS[target.kind]?.category;
        if (cat === 'infantry_polearm') announceCallout('select_spearmen', target.id);
        else if (cat === 'infantry_sword') announceCallout('select_infantry', target.id);
        else if (cat === 'ranged_bow' || cat === 'ranged_crossbow') {
          announceCallout('select_archers', target.id);
        } else if (cat === 'artillery') announceCallout('select_artillery', target.id);
        else announceCallout('select_cavalry', target.id);
      }
    },
    [myIdx, announceCallout],
  );

  const handleFocusRegiment = useCallback(
    (reg: TwRegimentFrame) => {
      focusWorld(reg.x, reg.y, Math.max(camRef.current.zoom, 0.82));
      playTwSfx('click');
    },
    [focusWorld],
  );

  const isRegimentCurrentlyDueling = useCallback((reg: TwRegimentFrame, f: TwFrame): boolean => {
    if (reg.anim === 'duel') return true;
    return f.duels.some((d) => d.genARegId === reg.id || d.genBRegId === reg.id);
  }, []);

  const canChallengeEnemyGeneralToDuel = useCallback(
    (myGen: TwRegimentFrame, enemyReg: TwRegimentFrame, f: TwFrame): boolean => {
      if (!config.romanceMode) return false;
      if (!myGen.isGeneral || !myGen.generalId || isRegimentWiped(myGen)) return false;
      if (!enemyReg.isGeneral || !enemyReg.generalId || !isRegimentAlive(enemyReg)) return false;
      if (isRegimentCurrentlyDueling(myGen, f) || isRegimentCurrentlyDueling(enemyReg, f)) {
        return false;
      }
      const enemySpec = TW_GENERALS[enemyReg.generalId];
      if (!enemySpec || enemySpec.class === 'strategist') return false;
      const mySpec = TW_GENERALS[myGen.generalId];
      if (!mySpec || mySpec.class === 'strategist') return false;
      return true;
    },
    [config.romanceMode, isRegimentCurrentlyDueling],
  );

  const castSelectedGeneralSkill = useCallback(() => {
    if (!canControl) return;
    const f = twStore.currFrame;
    if (!f) return;
    const selRegs = getSelectedLivingRegs();
    const selGens = selRegs.filter((r) => r.isGeneral && r.generalId && TW_GENERALS[r.generalId]);
    if (selGens.length === 0) return;

    const genReg =
      selGens.find((g) => (g.skillCooldownLeft ?? 0) <= 0.05) ?? selGens[0];
    if (!genReg.generalId || (genReg.skillCooldownLeft ?? 0) > 0.05) return;

    const spec = TW_GENERALS[genReg.generalId];
    if (!spec) return;

    let targetX = Math.round(genReg.x);
    let targetY = Math.round(genReg.y);
    let targetRegId: number | undefined;

    if (spec.skill.effectKind === 'fire_volley') {
      const hover = hoverWorldRef.current;
      const hoveredEnemy =
        hoveredRegIdRef.current !== null
          ? f.regiments.find(
              (r) =>
                r.id === hoveredRegIdRef.current &&
                !isRegimentWiped(r) &&
                !isTwRegimentAllied(r, myIdx, f.sides, myTeam),
            )
          : undefined;

      if (hoveredEnemy) {
        targetX = Math.round(hoveredEnemy.x);
        targetY = Math.round(hoveredEnemy.y);
        targetRegId = hoveredEnemy.id;
      } else if (genReg.lockedTargetId !== undefined) {
        const locked = f.regiments.find((r) => r.id === genReg.lockedTargetId);
        if (locked) {
          targetX = Math.round(locked.x);
          targetY = Math.round(locked.y);
          targetRegId = locked.id;
        }
      } else if (hover) {
        targetX = Math.round(clampNum(hover.wx, 48, mapSpec.width - 48));
        targetY = Math.round(clampNum(hover.wy, 48, mapSpec.height - 48));
      } else {
        targetX = Math.round(genReg.x + Math.cos(genReg.facing) * 240);
        targetY = Math.round(genReg.y + Math.sin(genReg.facing) * 240);
      }
    }

    emitCommand({
      t: 'use_skill',
      generalRegId: genReg.id,
      targetX,
      targetY,
      targetRegId,
    });
    playTwSfx('horn');
    announceCallout('skill', genReg.id);
  }, [
    canControl,
    getSelectedLivingRegs,
    myIdx,
    myTeam,
    mapSpec.width,
    mapSpec.height,
    emitCommand,
    announceCallout,
  ]);

  const challengeNearestEnemyGeneral = useCallback(() => {
    if (!canControl || !config.romanceMode) return;
    const f = twStore.currFrame;
    if (!f) return;

    const selRegs = getSelectedLivingRegs();
    const selGens = selRegs.filter(
      (r) =>
        r.isGeneral &&
        r.generalId &&
        TW_GENERALS[r.generalId]?.class !== 'strategist' &&
        !isRegimentCurrentlyDueling(r, f),
    );
    if (selGens.length === 0) return;
    const myGen = selGens[0];

    const eligibleEnemies = f.regiments
      .filter(
        (r) =>
          !isTwRegimentAllied(r, myIdx, f.sides, myTeam) &&
          isTwRegimentVisibleToViewer(r, myIdx, f.sides, false, myTeam) &&
          canChallengeEnemyGeneralToDuel(myGen, r, f),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - myGen.x, a.y - myGen.y) -
          Math.hypot(b.x - myGen.x, b.y - myGen.y),
      );

    if (eligibleEnemies.length === 0) return;

    emitCommand({
      t: 'challenge_duel',
      generalRegId: myGen.id,
      targetGeneralRegId: eligibleEnemies[0].id,
    });
    playTwSfx('duel_gong');
    announceCallout('duel', myGen.id);
  }, [
    canControl,
    config.romanceMode,
    getSelectedLivingRegs,
    isRegimentCurrentlyDueling,
    myIdx,
    myTeam,
    canChallengeEnemyGeneralToDuel,
    emitCommand,
    announceCallout,
  ]);

  // ---------- Phím tắt RTS Toàn Chiến ----------
  useEffect(() => {
    const anyModalOpen = guideOpen || leaveAsk || ended;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingInEditable(e.target) || anyModalOpen) return;

      const code = e.code;
      const keyLower = e.key.toLowerCase();

      // Escape: Hủy chế độ đặt Đạo cụ Công binh đang chọn
      if (code === 'Escape' && activeDeployableKindRef.current !== null) {
        e.preventDefault();
        setActiveDeployableKind(null);
        playTwSfx('click');
        return;
      }

      // KeyP: Bật/tắt Tạm dừng Chiến thuật (Tactical Pause 0 <-> 1)
      if (code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (canControlSpeed) {
          e.preventDefault();
          const curSpeed = twStore.currFrame?.battleSpeed ?? 1;
          handleSetSpeed(curSpeed === 0 ? 1 : 0);
        }
        return;
      }

      // WASD / Mũi tên di chuyển camera
      if (
        code === 'KeyW' ||
        code === 'KeyA' ||
        code === 'KeyS' ||
        code === 'KeyD' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        keysHeldRef.current.add(code);
        return;
      }

      // Phím Space: giữ để bật sáng chấm chiến thuật & đường đạn; nhấn nhanh để bật/tắt; nhấp đúp về Chủ Tướng
      if (code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          const now = performance.now();
          if (now - lastSpaceTapRef.current.prevTapAt < 320) {
            setShowTacticalDots(lastSpaceTapRef.current.savedDots);
            setShowTrajectories(lastSpaceTapRef.current.savedTraj);
            lastSpaceTapRef.current.prevTapAt = 0;
            lastSpaceTapRef.current.downAt = 0;
            resetCameraHome();
          } else {
            lastSpaceTapRef.current = {
              downAt: now,
              prevTapAt: now,
              savedDots: showTacticalDots,
              savedTraj: showTrajectories,
            };
          }
        }
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          setSpaceHeld(true);
        }
        return;
      }

      // Ctrl+A: Chọn toàn bộ đại quân còn sống
      if ((e.ctrlKey || e.metaKey) && keyLower === 'a') {
        e.preventDefault();
        selectAllMyArmy();
        return;
      }

      // Nhóm điều quân Ctrl+1..9 và gọi nhanh 1..9 (nhấp đúp đưa camera tới trung tâm nhóm)
      if (/^Digit[1-9]$/.test(code)) {
        const groupNum = Number(code.slice(5));
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const selRegs = getSelectedLivingRegs();
          if (selRegs.length > 0) {
            controlGroupsRef.current.set(
              groupNum,
              new Set(selRegs.map((r) => r.id)),
            );
            playTwSfx('click');
            setCalloutToast(`Đã lập Đạo Quân số ${groupNum} (${selRegs.length} trung đoàn)`);
          }
          return;
        }

        const saved = controlGroupsRef.current.get(groupNum);
        const f = twStore.currFrame;
        if (saved && f && myIdx !== undefined) {
          const aliveGroupRegs = f.regiments.filter(
            (r) => r.ownerIdx === myIdx && !isRegimentWiped(r) && saved.has(r.id),
          );
          if (aliveGroupRegs.length > 0) {
            e.preventDefault();
            setSelectedIds(new Set(aliveGroupRegs.map((r) => r.id)));
            playTwSfx('click');
            const now = performance.now();
            if (
              lastGroupTapRef.current.group === groupNum &&
              now - lastGroupTapRef.current.at < 340
            ) {
              const cx =
                aliveGroupRegs.reduce((acc, r) => acc + r.x, 0) / aliveGroupRegs.length;
              const cy =
                aliveGroupRegs.reduce((acc, r) => acc + r.y, 0) / aliveGroupRegs.length;
              focusWorld(cx, cy);
              lastGroupTapRef.current = { at: 0, group: -1 };
            } else {
              lastGroupTapRef.current = { at: now, group: groupNum };
            }
          }
        }
        return;
      }

      if (!canControl) return;

      // H hoặc Backspace: Dừng quân tại chỗ
      if (keyLower === 'h' || code === 'Backspace') {
        const selRegs = getSelectedLivingRegs();
        if (selRegs.length > 0) {
          e.preventDefault();
          emitCommand({ t: 'halt', regIds: selRegs.map((r) => r.id) });
          playTwSfx('order');
          announceCallout('hold');
        }
        return;
      }

      // G: Bật/tắt Chế độ Phòng thủ (Guard Mode)
      if (keyLower === 'g') {
        const selRegs = getSelectedLivingRegs();
        if (selRegs.length > 0) {
          e.preventDefault();
          const allGuard = selRegs.every((r) => r.guardMode);
          emitCommand({
            t: 'toggle_stance',
            regIds: selRegs.map((r) => r.id),
            stance: 'guard',
            value: !allGuard,
          });
          playTwSfx('click');
        }
        return;
      }

      // F: Bật/tắt Tự do Xạ kích (Fire-at-Will)
      if (keyLower === 'f') {
        const rangedRegs = getSelectedLivingRegs().filter(
          (r) => !r.isGeneral && (r.maxAmmo > 0 || (TW_UNITS[r.kind]?.range ?? 0) > 0),
        );
        if (rangedRegs.length > 0) {
          e.preventDefault();
          const allFaw = rangedRegs.every((r) => r.fireAtWill);
          emitCommand({
            t: 'toggle_stance',
            regIds: rangedRegs.map((r) => r.id),
            stance: 'fire_at_will',
            value: !allFaw,
          });
          playTwSfx('click');
        }
        return;
      }

      // K: Bật/tắt Du kích giữ khoảng cách (Skirmish Mode — chỉ dành cho cung/nỏ cơ động, loại trừ pháo đá)
      if (keyLower === 'k') {
        const rangedRegs = getSelectedLivingRegs().filter(
          (r) =>
            !r.isGeneral &&
            TW_UNITS[r.kind]?.category !== 'artillery' &&
            (r.maxAmmo > 0 || (TW_UNITS[r.kind]?.range ?? 0) > 0),
        );
        if (rangedRegs.length > 0) {
          e.preventDefault();
          const allSkirmish = rangedRegs.every((r) => r.skirmishMode);
          emitCommand({
            t: 'toggle_stance',
            regIds: rangedRegs.map((r) => r.id),
            stance: 'skirmish',
            value: !allSkirmish,
          });
          playTwSfx('click');
        }
        return;
      }

      // R: Bật/tắt Tên Lửa (Fire Arrows) cho cung thủ đang chọn
      if (keyLower === 'r' && !e.ctrlKey && !e.metaKey) {
        const bowRegs = getSelectedLivingRegs().filter(
          (r) => !r.isGeneral && TW_UNITS[r.kind]?.category === 'ranged_bow',
        );
        if (bowRegs.length > 0) {
          e.preventDefault();
          const allFire = bowRegs.every((r) => Boolean(r.fireArrows));
          emitCommand({
            t: 'toggle_fire_arrows',
            regIds: bowRegs.map((r) => r.id),
            value: !allFire,
          });
          playTwSfx('click');
        }
        return;
      }

      // Q: Tung Tuyệt Kỹ Ngũ Hành của Danh Tướng đang chọn
      if (keyLower === 'q') {
        e.preventDefault();
        castSelectedGeneralSkill();
        return;
      }

      // V: Thách Đấu Tướng 1v1 gần nhất (Romance Mode)
      if (keyLower === 'v') {
        e.preventDefault();
        challengeNearestEnemyGeneral();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
      if (e.code === 'Space') {
        const heldMs =
          lastSpaceTapRef.current.downAt > 0
            ? performance.now() - lastSpaceTapRef.current.downAt
            : 999;
        spaceHeldRef.current = false;
        setSpaceHeld(false);
        // Nhấn nhẹ Space (< 220ms): nếu đang Tạm dừng Chiến thuật thì tiếp tục 1×; ngược lại đảo chấm chiến thuật & đường đạn
        if (heldMs < 220) {
          if (canControlSpeed && (twStore.currFrame?.battleSpeed ?? 1) === 0) {
            handleSetSpeed(1);
          } else {
            const nextOn = !(
              lastSpaceTapRef.current.savedDots && lastSpaceTapRef.current.savedTraj
            );
            setShowTacticalDots(nextOn);
            setShowTrajectories(nextOn);
          }
        }
      }
    };

    const onWindowBlur = () => {
      keysHeldRef.current.clear();
      if (spaceHeldRef.current) {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [
    guideOpen,
    leaveAsk,
    ended,
    canControl,
    canControlSpeed,
    handleSetSpeed,
    myIdx,
    showTacticalDots,
    showTrajectories,
    resetCameraHome,
    selectAllMyArmy,
    getSelectedLivingRegs,
    focusWorld,
    emitCommand,
    announceCallout,
    castSelectedGeneralSkill,
    challengeNearestEnemyGeneral,
  ]);

  // ---------- Lăn chuột thu phóng mượt neo theo vị trí con trỏ ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const delta = clampNum(e.deltaY, -180, 180);
      const factor = Math.exp(-delta * 0.00125);
      zoomTwCameraAt(
        camRef.current,
        camRef.current.zoom * factor,
        sx,
        sy,
        mapSpec.width,
        mapSpec.height,
      );
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [mapSpec.width, mapSpec.height]);

  // ---------- Vòng lặp dựng hình chiến trường 60/120/144 FPS ----------
  const liveRenderOptsRef = useRef({
    mapSpec,
    myIdx,
    myTeam,
    ended,
    showDotsEffective: showTacticalDots || spaceHeld,
    showTrajEffective: showTrajectories || spaceHeld,
  });
  liveRenderOptsRef.current = {
    mapSpec,
    myIdx,
    myTeam,
    ended,
    showDotsEffective: showTacticalDots || spaceHeld,
    showTrajEffective: showTrajectories || spaceHeld,
  };

  useEffect(() => {
    let rafId = 0;
    let prevNow = performance.now();

    const renderLoop = (now: number) => {
      rafId = window.requestAnimationFrame(renderLoop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dt = Math.min(0.05, Math.max(0, (now - prevNow) / 1000));
      prevNow = now;

      const {
        mapSpec: ms,
        myIdx: viewerIdx,
        myTeam: viewerTeam,
        ended: isEnded,
        showDotsEffective,
        showTrajEffective,
      } = liveRenderOptsRef.current;

      const cam = camRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || window.innerWidth || 1280;
      const cssH = canvas.clientHeight || window.innerHeight || 720;

      if (cam.viewW !== cssW || cam.viewH !== cssH) {
        cam.viewW = cssW;
        cam.viewH = cssH;
        clampTwCamera(cam, ms.width, ms.height);
      }

      const targetPxW = Math.max(1, Math.round(cssW * dpr));
      const targetPxH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== targetPxW || canvas.height !== targetPxH) {
        canvas.width = targetPxW;
        canvas.height = targetPxH;
      }

      // 1. Di chuyển Camera mượt bằng phím WASD / Mũi tên & Rìa màn hình khi đang kéo chuột
      let panVx = 0;
      let panVy = 0;
      const keys = keysHeldRef.current;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) panVx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) panVx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) panVy -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) panVy += 1;

      const activeDragPos = leftPointerRef.current?.marqueeActive
        ? { sx: leftPointerRef.current.curSx, sy: leftPointerRef.current.curSy }
        : rightPointerRef.current?.draggingLine
          ? { sx: rightPointerRef.current.curSx, sy: rightPointerRef.current.curSy }
          : null;

      if (activeDragPos) {
        const edgeMargin = 34;
        if (activeDragPos.sx < edgeMargin) panVx -= 0.72;
        else if (activeDragPos.sx > cssW - edgeMargin) panVx += 0.72;
        if (activeDragPos.sy < edgeMargin) panVy -= 0.72;
        else if (activeDragPos.sy > cssH - edgeMargin) panVy += 0.72;
      }

      if (panVx !== 0 || panVy !== 0) {
        const mag = Math.hypot(panVx, panVy) || 1;
        const speedWorld = (820 / Math.max(0.34, cam.zoom)) * dt;
        cam.x += (panVx / mag) * speedWorld;
        cam.y += ((panVy / mag) * speedWorld) / TW_ISO_TILT;
        clampTwCamera(cam, ms.width, ms.height);
      }

      // 2. Xả hàng đợi âm thanh chiến trường từ Server
      const sfxBatch = twStore.drainSfx();
      for (let i = 0; i < sfxBatch.length; i++) {
        playTwSfx(sfxBatch[i]);
      }

      // 3. Đọc khung hình nội suy 60fps & đối thoại võ tướng đang hiển thị
      const interp = twStore.interpolatedFrame(now);
      const banterNow = twStore.currentBanter(now);
      const nextBanterId = banterNow ? banterNow.id : null;
      if (nextBanterId !== activeBanterIdRef.current) {
        activeBanterIdRef.current = nextBanterId;
        setActiveBanter(banterNow);
      }

      const timeSec = now * 0.001;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!interp) {
        renderTwTerrain(ctx, ms, [], cam, timeSec);
        renderTwForestCanopy(ctx, ms, cam, timeSec);
        return;
      }

      const { frame: f, regiments: interpRegs, projectiles: interpProjs } = interp;
      const speakingGenerals: TwGeneralId[] = banterNow
        ? [banterNow.leftGeneral, banterNow.rightGeneral]
        : [];

      const unitOpts: TwRenderUnitsOptions = {
        cam,
        regiments: interpRegs,
        projectiles: interpProjs,
        duels: f.duels,
        sides: f.sides,
        myIdx: viewerIdx,
        myTeam: viewerTeam,
        selectedRegIds: selectedIdsRef.current,
        hoveredRegId: hoveredRegIdRef.current,
        activeBanterGeneralIds: speakingGenerals,
        timeSec,
        showTacticalDots: showDotsEffective,
        showOrderLines: false,
        dragPreview: null,
        revealHiddenEnemies: viewerIdx === undefined || isEnded,
        fires: f.fires,
        deployables: f.deployables,
        windAngle: f.windAngle,
        windStrength: f.windStrength,
        tick: f.tick,
      };

      let hasVanguardSelected = false;
      if (selectedIdsRef.current.size > 0 && viewerIdx !== undefined) {
        for (let i = 0; i < interpRegs.length; i++) {
          const r = interpRegs[i];
          if (
            r.ownerIdx === viewerIdx &&
            selectedIdsRef.current.has(r.id) &&
            !isRegimentWiped(r) &&
            Boolean(TW_UNITS[r.kind]?.vanguardDeploy)
          ) {
            hasVanguardSelected = true;
            break;
          }
        }
      }

      const placingKind = activeDeployableKindRef.current;
      const hoverWorldNow = hoverWorldRef.current;

      // Thứ tự dựng hình 9 lớp chiều sâu 2.5D chuẩn Total War: Three Kingdoms
      // (1) Mặt đất, sông cạn, đầm lầy, đồi cao, vòng chiếm điểm & Đài Hiệu Lệnh
      renderTwTerrain(ctx, ms, f.captures, cam, timeSec, {
        fires: f.fires,
        windAngle: f.windAngle,
        windStrength: f.windStrength,
      });

      // (2) Ấn chú võ đài Quyết Đấu 1v1 xoay dưới mặt đất
      renderTwDuelArenasGround(ctx, f.duels, cam, timeSec);

      // (3) Hào quang Ngũ Hành, vùng Bố Trận, bóng ma Đặt Bẫy, vòng tầm bắn trắng & chấm lính kéo chuột phải
      renderTwTacticalUnderlays(
        ctx,
        interpRegs,
        selectedIdsRef.current,
        viewerIdx,
        viewerTeam,
        dragPreviewRef.current,
        showTrajEffective,
        cam,
        timeSec,
        {
          battlePhase: f.battlePhase,
          myDeployZone: f.myDeployZone,
          mapSpec: ms,
          hasVanguardSelected,
          placementKind: placingKind,
          hoverWorld: hoverWorldNow,
          hoveredRegId: hoveredRegIdRef.current,
          placementFacing:
            placingKind && hoverWorldNow
              ? computeDeployableFacing(
                  hoverWorldNow.wx,
                  hoverWorldNow.wy,
                  interpRegs,
                  viewerIdx,
                  ms,
                )
              : undefined,
        },
      );

      // (4) Chấm quân số chiến thuật 100% & từng binh sĩ hoạt ảnh sắp xếp độ sâu Y
      renderTwRegimentSoldiers(ctx, unitOpts);

      // (5) Tia lửa giao kích giữa hai Võ Tướng & ấn song kiếm trên cao
      renderTwDuelArenasSparks(ctx, f.duels, interpRegs, cam, timeSec);

      // (6) Tán Rừng Thông & Rừng Trúc (tự bán trong suốt khi zoom sát giao tranh)
      renderTwForestCanopy(ctx, ms, cam, timeSec, f.fires);

      // (7) Vòm quỹ đạo khai hỏa & xung kích cong 3D đỏ thẫm biểu tượng TW3K
      renderTwRedTrajectories(
        ctx,
        interpRegs,
        f.sides,
        selectedIdsRef.current,
        viewerTeam,
        showTrajEffective,
        cam,
        timeSec,
      );

      // (8) Mưa tên cầu vồng, hỏa tiễn, nỏ sắt & tảng đá lửa Pháo Đá Uy Viễn
      renderTwProjectiles(ctx, interpProjs, cam, timeSec);

      // (9) Huy hiệu Chân dung Danh Tướng (42x42) & Huy hiệu Binh Chủng (26x26)
      renderTwOverheadBadges(ctx, unitOpts);
    };

    rafId = window.requestAnimationFrame(renderLoop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // ---------- Xử lý Chuột & Cảm ứng Chiến thuật trên Canvas ----------
  const getCanvasLocalCoords = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
    };
  };

  const computeDragMinWidth = (regs: TwRegimentFrame[]): number => {
    if (regs.length === 0) return 80;
    const totalDefaultWidth = regs.reduce((acc, r) => acc + Math.max(44, r.width * 0.72), 0);
    return Math.max(76, Math.min(520, totalDefaultWidth));
  };

  const issueRightClickPointOrder = (wx: number, wy: number) => {
    if (!canControl) return;
    const f = twStore.currFrame;
    if (!f) return;
    const selRegs = getSelectedLivingRegs();
    if (selRegs.length === 0) return;

    const interpRegs = twStore.interpolatedFrame()?.regiments ?? f.regiments;
    const hitReg = hitTestTwRegiment(wx, wy, interpRegs, {
      cam: camRef.current,
      myIdx,
      myTeam,
      sides: f.sides,
      revealHiddenEnemies: false,
    });

    if (hitReg && !isTwRegimentAllied(hitReg, myIdx, f.sides, myTeam)) {
      if (selRegs.length === 1 && canChallengeEnemyGeneralToDuel(selRegs[0], hitReg, f)) {
        emitCommand({
          t: 'challenge_duel',
          generalRegId: selRegs[0].id,
          targetGeneralRegId: hitReg.id,
        });
        playTwSfx('duel_gong');
        announceCallout('duel', selRegs[0].id);
        return;
      }

      emitCommand({
        t: 'attack_target',
        regIds: selRegs.map((r) => r.id),
        targetRegId: hitReg.id,
      });
      playTwSfx('order');
      const anyCavalry = selRegs.some((r) => TW_UNITS[r.kind]?.category.startsWith('cavalry'));
      const allRanged = selRegs.every((r) => (TW_UNITS[r.kind]?.range ?? 0) > 0);
      if (anyCavalry) announceCallout('charge');
      else if (allRanged) announceCallout('attack_ranged');
      else announceCallout('attack');
      return;
    }

    // Nhấp chuột phải lên mặt đất trống: hành quân theo hướng từ tâm đội quân tới điểm đích
    const cx = selRegs.reduce((acc, r) => acc + r.x, 0) / selRegs.length;
    const cy = selRegs.reduce((acc, r) => acc + r.y, 0) / selRegs.length;
    const facing = Math.atan2(wy - cy, wx - cx);

    emitCommand({
      t: 'move_line',
      regIds: selRegs.map((r) => r.id),
      x: Math.round(clampNum(wx, 48, mapSpec.width - 48)),
      y: Math.round(clampNum(wy, 48, mapSpec.height - 48)),
      facing: Number(facing.toFixed(4)),
      run: true,
    });
    playTwSfx('order');
    announceCallout('run');
  };

  const handleCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getCanvasLocalCoords(e);
    const cam = camRef.current;
    const worldPt = screenToWorld(sx, sy, cam);
    hoverWorldRef.current = worldPt;

    // 1. Tương tác Cảm ứng (1 ngón kéo bản đồ / chạm chọn; 2 ngón chụm thu phóng)
    if (e.pointerType === 'touch') {
      e.currentTarget.setPointerCapture(e.pointerId);
      activeTouchesRef.current.set(e.pointerId, { sx, sy });

      if (activeTouchesRef.current.size === 2) {
        const pts = [...activeTouchesRef.current.values()];
        const dist = Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy);
        const midSx = (pts[0].sx + pts[1].sx) * 0.5;
        const midSy = (pts[0].sy + pts[1].sy) * 0.5;
        pinchStateRef.current = { lastDist: Math.max(12, dist), lastMidSx: midSx, lastMidSy: midSy };
        leftPointerRef.current = null;
        setMarqueeBox(null);
        setIsPanningUi(true);
        return;
      }

      if (activeTouchesRef.current.size === 1) {
        leftPointerRef.current = {
          pointerId: e.pointerId,
          startSx: sx,
          startSy: sy,
          curSx: sx,
          curSy: sy,
          panMode: true,
          marqueeActive: false,
          shiftKey: false,
          ctrlOrMeta: false,
        };
      }
      return;
    }

    // 2. Chuột giữa hoặc Alt + Chuột trái: Kéo trượt Camera
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      middlePanRef.current = { pointerId: e.pointerId, lastSx: sx, lastSy: sy };
      setIsPanningUi(true);
      return;
    }

    // 3. Chuột phải: Hủy đặt bẫy (nếu đang chọn Đạo cụ) hoặc Công kích địch / Thách Đấu Tướng / Kéo dàn hàng quân Total War
    if (e.button === 2) {
      e.preventDefault();
      if (activeDeployableKindRef.current !== null) {
        setActiveDeployableKind(null);
        playTwSfx('click');
        return;
      }
      if (!canControl) return;
      const selRegs = getSelectedLivingRegs();
      if (selRegs.length === 0) return;

      const f = twStore.currFrame;
      const interpRegs = twStore.interpolatedFrame()?.regiments ?? f?.regiments ?? [];
      const hitReg =
        f && interpRegs.length > 0
          ? hitTestTwRegiment(worldPt.wx, worldPt.wy, interpRegs, {
              cam,
              myIdx,
              myTeam,
              sides: f.sides,
              revealHiddenEnemies: false,
            })
          : null;

      const enemyHit =
        hitReg && f && !isTwRegimentAllied(hitReg, myIdx, f.sides, myTeam) ? hitReg : null;

      e.currentTarget.setPointerCapture(e.pointerId);
      rightPointerRef.current = {
        pointerId: e.pointerId,
        startSx: sx,
        startSy: sy,
        startWx: worldPt.wx,
        startWy: worldPt.wy,
        curSx: sx,
        curSy: sy,
        draggingLine: false,
        initialEnemyRegId: enemyHit ? enemyHit.id : null,
      };
      return;
    }

    // 4. Chuột trái: Chọn trung đoàn hoặc kéo khung quét chọn đại quân
    if (e.button === 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      leftPointerRef.current = {
        pointerId: e.pointerId,
        startSx: sx,
        startSy: sy,
        curSx: sx,
        curSy: sy,
        panMode: false,
        marqueeActive: false,
        shiftKey: e.shiftKey,
        ctrlOrMeta: e.ctrlKey || e.metaKey,
      };
    }
  };

  const handleCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = getCanvasLocalCoords(e);
    const cam = camRef.current;
    const worldPt = screenToWorld(sx, sy, cam);
    hoverWorldRef.current = worldPt;

    // 1. Cảm ứng đa điểm (Pinch Zoom + Pan)
    if (e.pointerType === 'touch' && activeTouchesRef.current.has(e.pointerId)) {
      const prevTouch = activeTouchesRef.current.get(e.pointerId)!;
      activeTouchesRef.current.set(e.pointerId, { sx, sy });

      if (activeTouchesRef.current.size >= 2 && pinchStateRef.current) {
        const pts = [...activeTouchesRef.current.values()];
        const dist = Math.max(12, Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy));
        const midSx = (pts[0].sx + pts[1].sx) * 0.5;
        const midSy = (pts[0].sy + pts[1].sy) * 0.5;

        const scaleFactor = dist / pinchStateRef.current.lastDist;
        zoomTwCameraAt(cam, cam.zoom * scaleFactor, midSx, midSy, mapSpec.width, mapSpec.height);

        const dMidX = midSx - pinchStateRef.current.lastMidSx;
        const dMidY = midSy - pinchStateRef.current.lastMidSy;
        cam.x -= dMidX / cam.zoom;
        cam.y -= dMidY / (cam.zoom * TW_ISO_TILT);
        clampTwCamera(cam, mapSpec.width, mapSpec.height);

        pinchStateRef.current = { lastDist: dist, lastMidSx: midSx, lastMidSy: midSy };
        return;
      }

      const lp = leftPointerRef.current;
      if (lp && lp.pointerId === e.pointerId && lp.panMode) {
        const moved = Math.hypot(sx - lp.startSx, sy - lp.startSy);
        if (moved > 8 || lp.marqueeActive) {
          lp.marqueeActive = true;
          setIsPanningUi(true);
          const dx = sx - prevTouch.sx;
          const dy = sy - prevTouch.sy;
          cam.x -= dx / cam.zoom;
          cam.y -= dy / (cam.zoom * TW_ISO_TILT);
          clampTwCamera(cam, mapSpec.width, mapSpec.height);
        }
        lp.curSx = sx;
        lp.curSy = sy;
      }
      return;
    }

    // 2. Kéo trượt Camera bằng chuột giữa / Alt+Chuột trái
    if (middlePanRef.current && middlePanRef.current.pointerId === e.pointerId) {
      const dx = sx - middlePanRef.current.lastSx;
      const dy = sy - middlePanRef.current.lastSy;
      middlePanRef.current.lastSx = sx;
      middlePanRef.current.lastSy = sy;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / (cam.zoom * TW_ISO_TILT);
      clampTwCamera(cam, mapSpec.width, mapSpec.height);
      return;
    }

    // 3. Kéo chuột phải dàn hàng quân chuẩn Total War (> 14px)
    if (rightPointerRef.current && rightPointerRef.current.pointerId === e.pointerId) {
      const rp = rightPointerRef.current;
      rp.curSx = sx;
      rp.curSy = sy;
      const dragPx = Math.hypot(sx - rp.startSx, sy - rp.startSy);
      if (dragPx > 14 || rp.draggingLine) {
        if (!rp.draggingLine) {
          rp.draggingLine = true;
          setIsRightDraggingUi(true);
        }
        const selRegs = getSelectedLivingRegs();
        const minW = computeDragMinWidth(selRegs);
        dragPreviewRef.current = computeDragLinePreview(
          rp.startWx,
          rp.startWy,
          worldPt.wx,
          worldPt.wy,
          minW,
        );
      }
      return;
    }

    // 4. Kéo chuột trái quét khung chọn nhiều trung đoàn (> 8px, bỏ qua khi đang chọn Đạo cụ đặt bẫy)
    if (leftPointerRef.current && leftPointerRef.current.pointerId === e.pointerId) {
      const lp = leftPointerRef.current;
      lp.curSx = sx;
      lp.curSy = sy;
      const dragPx = Math.hypot(sx - lp.startSx, sy - lp.startSy);
      if (
        !lp.panMode &&
        activeDeployableKindRef.current === null &&
        (dragPx > 8 || lp.marqueeActive)
      ) {
        lp.marqueeActive = true;
        setMarqueeBox({
          left: Math.min(lp.startSx, sx),
          top: Math.min(lp.startSy, sy),
          width: Math.abs(sx - lp.startSx),
          height: Math.abs(sy - lp.startSy),
        });
      }
      return;
    }

    // 5. Cập nhật trung đoàn đang trỏ chuột (chỉ setState khi ID thực sự thay đổi)
    const interp = twStore.interpolatedFrame();
    if (interp) {
      const hit = hitTestTwRegiment(worldPt.wx, worldPt.wy, interp.regiments, {
        cam,
        myIdx,
        myTeam,
        sides: interp.frame.sides,
        revealHiddenEnemies: myIdx === undefined || ended,
      });
      const nextId = hit ? hit.id : null;
      if (nextId !== hoveredRegIdRef.current) {
        hoveredRegIdRef.current = nextId;
        setHoveredRegId(nextId);
      }
    }
  };

  const handleCanvasPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const { sx, sy } = getCanvasLocalCoords(e);
    const cam = camRef.current;
    const endWorld = screenToWorld(sx, sy, cam);

    // 1. Kết thúc chạm Cảm ứng
    if (e.pointerType === 'touch') {
      activeTouchesRef.current.delete(e.pointerId);
      if (activeTouchesRef.current.size < 2) {
        pinchStateRef.current = null;
      }
      if (activeTouchesRef.current.size === 0) {
        setIsPanningUi(false);
      }

      const lp = leftPointerRef.current;
      if (lp && lp.pointerId === e.pointerId) {
        leftPointerRef.current = null;
        if (!lp.marqueeActive) {
          if (activeDeployableKindRef.current !== null && canControl) {
            const kind = activeDeployableKindRef.current;
            const regsNow =
              twStore.interpolatedFrame()?.regiments ?? twStore.currFrame?.regiments ?? [];
            const placeX = Math.round(clampNum(endWorld.wx, 48, mapSpec.width - 48));
            const placeY = Math.round(clampNum(endWorld.wy, 48, mapSpec.height - 48));
            const facing = computeDeployableFacing(placeX, placeY, regsNow, myIdx, mapSpec);
            emitCommand({ t: 'place_deployable', kind, x: placeX, y: placeY, facing });
            playTwSfx('order');
            setActiveDeployableKind(null);
            return;
          }
          // Chạm nhẹ trên màn hình cảm ứng: chọn quân ta, công kích quân địch, hoặc chạm đúp mặt đất để điều quân
          const interp = twStore.interpolatedFrame();
          if (interp && myIdx !== undefined) {
            const hit = hitTestTwRegiment(endWorld.wx, endWorld.wy, interp.regiments, {
              cam,
              myIdx,
              myTeam,
              sides: interp.frame.sides,
              revealHiddenEnemies: ended,
            });
            if (hit && hit.ownerIdx === myIdx && !isRegimentWiped(hit)) {
              const now = performance.now();
              const isDouble =
                lastLeftClickRef.current.regId === hit.id &&
                now - lastLeftClickRef.current.at < 360;
              lastLeftClickRef.current = { at: now, regId: hit.id };
              handleSelectRegimentFromHud(hit.id, false, isDouble);
            } else if (
              hit &&
              canControl &&
              selectedIdsRef.current.size > 0 &&
              !isTwRegimentAllied(hit, myIdx, interp.frame.sides, myTeam)
            ) {
              issueRightClickPointOrder(endWorld.wx, endWorld.wy);
            } else if (canControl && selectedIdsRef.current.size > 0) {
              const now = performance.now();
              const prevTap = lastTouchEmptyTapRef.current;
              if (
                now - prevTap.at < 360 &&
                Math.hypot(endWorld.wx - prevTap.wx, endWorld.wy - prevTap.wy) < 140
              ) {
                lastTouchEmptyTapRef.current = { at: 0, wx: 0, wy: 0 };
                issueRightClickPointOrder(endWorld.wx, endWorld.wy);
              } else {
                lastTouchEmptyTapRef.current = {
                  at: now,
                  wx: endWorld.wx,
                  wy: endWorld.wy,
                };
              }
            }
          }
        }
      }
      return;
    }

    // 2. Kết thúc kéo chuột giữa / Alt+Chuột trái
    if (middlePanRef.current && middlePanRef.current.pointerId === e.pointerId) {
      middlePanRef.current = null;
      setIsPanningUi(false);
      return;
    }

    // 3. Kết thúc Chuột phải (Thả đường kéo dàn hàng quân hoặc Nhấp phải công kích/hành quân)
    if (rightPointerRef.current && rightPointerRef.current.pointerId === e.pointerId) {
      const rp = rightPointerRef.current;
      rightPointerRef.current = null;
      dragPreviewRef.current = null;
      setIsRightDraggingUi(false);

      if (!canControl) return;
      const selRegs = getSelectedLivingRegs();
      if (selRegs.length === 0) return;

      if (rp.draggingLine) {
        const minW = computeDragMinWidth(selRegs);
        const preview = computeDragLinePreview(
          rp.startWx,
          rp.startWy,
          endWorld.wx,
          endWorld.wy,
          minW,
        );
        emitCommand({
          t: 'move_line',
          regIds: selRegs.map((r) => r.id),
          x: Math.round(clampNum(preview.centerX, 48, mapSpec.width - 48)),
          y: Math.round(clampNum(preview.centerY, 48, mapSpec.height - 48)),
          facing: Number(preview.facing.toFixed(4)),
          width: Math.round(preview.width),
          run: !e.ctrlKey,
        });
        playTwSfx('order');
        announceCallout('move');
      } else {
        issueRightClickPointOrder(endWorld.wx, endWorld.wy);
      }
      return;
    }

    // 4. Kết thúc Chuột trái (Quét khung chọn hoặc Nhấp chọn đơn lẻ / Nhấp đúp cùng loại)
    if (leftPointerRef.current && leftPointerRef.current.pointerId === e.pointerId) {
      const lp = leftPointerRef.current;
      leftPointerRef.current = null;
      setMarqueeBox(null);

      // Nếu đang trong chế độ đặt Đạo cụ Công binh: Chuột trái đặt bẫy xuống mặt đất!
      if (activeDeployableKindRef.current !== null && canControl) {
        const kind = activeDeployableKindRef.current;
        const regsNow =
          twStore.interpolatedFrame()?.regiments ?? twStore.currFrame?.regiments ?? [];
        const placeX = Math.round(clampNum(endWorld.wx, 48, mapSpec.width - 48));
        const placeY = Math.round(clampNum(endWorld.wy, 48, mapSpec.height - 48));
        const facing = computeDeployableFacing(placeX, placeY, regsNow, myIdx, mapSpec);
        emitCommand({ t: 'place_deployable', kind, x: placeX, y: placeY, facing });
        playTwSfx('order');
        if (!e.shiftKey && !lp.shiftKey) {
          setActiveDeployableKind(null);
        }
        return;
      }

      const interp = twStore.interpolatedFrame();
      if (!interp || myIdx === undefined) return;

      if (lp.marqueeActive) {
        const minX = Math.min(lp.startSx, sx);
        const maxX = Math.max(lp.startSx, sx);
        const minY = Math.min(lp.startSy, sy);
        const maxY = Math.max(lp.startSy, sy);

        const boxedIds: number[] = [];
        for (const reg of interp.regiments) {
          if (reg.ownerIdx !== myIdx || isRegimentWiped(reg)) continue;
          const scr = worldToScreen(reg.x, reg.y, cam);
          const padX = Math.max(10, reg.width * 0.3 * cam.zoom);
          const padTop = Math.max(18, 34 * cam.zoom);
          const padBottom = Math.max(8, reg.depth * 0.3 * cam.zoom * TW_ISO_TILT);
          if (
            scr.sx + padX >= minX &&
            scr.sx - padX <= maxX &&
            scr.sy + padBottom >= minY &&
            scr.sy - padTop <= maxY
          ) {
            boxedIds.push(reg.id);
          }
        }

        if (boxedIds.length > 0) {
          setSelectedIds((prev) => {
            if (!e.shiftKey && !lp.shiftKey) return new Set(boxedIds);
            const next = new Set(prev);
            for (const id of boxedIds) next.add(id);
            return next;
          });
          playTwSfx('click');
          announceCallout('select', boxedIds[0]);
        } else if (!e.shiftKey && !lp.shiftKey) {
          setSelectedIds(new Set());
        }
        return;
      }

      // Nhấp chuột trái đơn / đúp
      const hit = hitTestTwRegiment(endWorld.wx, endWorld.wy, interp.regiments, {
        cam,
        myIdx,
        myTeam,
        sides: interp.frame.sides,
        revealHiddenEnemies: ended,
      });

      if (hit && hit.ownerIdx === myIdx && !isRegimentWiped(hit)) {
        const now = performance.now();
        const isDouble =
          lastLeftClickRef.current.regId === hit.id &&
          now - lastLeftClickRef.current.at < 340;
        lastLeftClickRef.current = { at: now, regId: hit.id };

        if (isDouble) {
          const sameKindIds = interp.regiments
            .filter(
              (r) =>
                r.ownerIdx === myIdx &&
                !isRegimentWiped(r) &&
                r.kind === hit.kind,
            )
            .map((r) => r.id);
          setSelectedIds((prev) => {
            if (!e.shiftKey && !lp.shiftKey) return new Set(sameKindIds);
            const next = new Set(prev);
            for (const id of sameKindIds) next.add(id);
            return next;
          });
          playTwSfx('click');
          announceCallout('select', hit.id);
        } else {
          handleSelectRegimentFromHud(
            hit.id,
            e.shiftKey || lp.shiftKey || e.ctrlKey || e.metaKey || lp.ctrlOrMeta,
            false,
          );
        }
      } else if (!e.shiftKey && !lp.shiftKey) {
        setSelectedIds(new Set());
      }
    }
  };

  const handleCanvasPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    activeTouchesRef.current.delete(e.pointerId);
    if (activeTouchesRef.current.size < 2) pinchStateRef.current = null;
    if (leftPointerRef.current?.pointerId === e.pointerId) {
      leftPointerRef.current = null;
      setMarqueeBox(null);
    }
    if (rightPointerRef.current?.pointerId === e.pointerId) {
      rightPointerRef.current = null;
      dragPreviewRef.current = null;
      setIsRightDraggingUi(false);
    }
    if (middlePanRef.current?.pointerId === e.pointerId) {
      middlePanRef.current = null;
    }
    if (activeTouchesRef.current.size === 0 && !middlePanRef.current) {
      setIsPanningUi(false);
    }
  };

  // ---------- Con trỏ chuột ngữ cảnh thông minh ----------
  const canvasCursor = useMemo(() => {
    if (isPanningUi) return 'grabbing';
    if (isRightDraggingUi || activeDeployableKind !== null) return 'crosshair';
    if (!hoveredReg) return 'default';
    if (myIdx !== undefined && hoveredReg.ownerIdx === myIdx) return 'pointer';
    if (
      canControl &&
      selectedIds.size > 0 &&
      !isTwRegimentAllied(hoveredReg, myIdx, fallbackSides, myTeam)
    ) {
      return 'crosshair';
    }
    return 'default';
  }, [
    isPanningUi,
    isRightDraggingUi,
    activeDeployableKind,
    hoveredReg,
    myIdx,
    canControl,
    selectedIds.size,
    fallbackSides,
    myTeam,
  ]);

  // ---------- Nhảy camera tới Đại quân của 1 Chư hầu trên Bảng Chiến Công ----------
  const jumpToWarlordArmy = (sideIdx: number) => {
    const f = twStore.currFrame;
    if (!f) return;
    const visibleRegs = f.regiments.filter(
      (r) =>
        r.ownerIdx === sideIdx &&
        !isRegimentWiped(r) &&
        isTwRegimentVisibleToViewer(r, myIdx, f.sides, myIdx === undefined || ended, myTeam),
    );
    if (visibleRegs.length === 0) return;
    const lead =
      visibleRegs.find((r) => r.isGeneral) ?? visibleRegs[0];
    focusWorld(lead.x, lead.y);
    playTwSfx('click');
  };

  // ---------- Thống kê Đài Chiếm Đóng & Bảng Chiến Công ----------
  const captureSummary = useMemo(() => {
    const total = mapSpec.capturePoints.length;
    if (!frame || total === 0) return { ally: 0, enemy: 0, total };
    let ally = 0;
    let enemy = 0;
    const refTeam = myTeam ?? 0;
    for (const c of frame.captures) {
      if (c.ownerTeam === -1) continue;
      if (c.ownerTeam === refTeam) ally += 1;
      else enemy += 1;
    }
    return { ally, enemy, total };
  }, [frame, mapSpec.capturePoints.length, myTeam]);

  const sortedSides = useMemo(
    () =>
      [...fallbackSides].sort(
        (a, b) =>
          Number(b.alive) - Number(a.alive) ||
          b.score - a.score ||
          b.totalMen - a.totalMen ||
          a.idx - b.idx,
      ),
    [fallbackSides],
  );

  const coalitionTotals = useMemo(() => {
    if (config.mode !== 'historical_2teams') return [];
    const buckets = new Map<
      number,
      { team: number; men: number; kills: number; alive: boolean; isMine: boolean }
    >();
    for (const s of fallbackSides) {
      const cur = buckets.get(s.team) ?? {
        team: s.team,
        men: 0,
        kills: 0,
        alive: false,
        isMine: false,
      };
      cur.men += Math.max(0, s.totalMen);
      cur.kills += Math.max(0, s.kills);
      if (s.alive) cur.alive = true;
      if (myTeam !== undefined && s.team === myTeam) cur.isMine = true;
      buckets.set(s.team, cur);
    }
    return [...buckets.values()].sort((a, b) => a.team - b.team);
  }, [config.mode, fallbackSides, myTeam]);

  // ---------- Thanh Quyết Đấu Tướng (Top-Center Romance Duel Banner) ----------
  const activeDuels = frame?.duels ?? [];
  const primaryDuel: TwDuelFrame | null = activeDuels[0] ?? null;

  const duelBannerData = useMemo(() => {
    if (!primaryDuel) return null;
    const sideA = fallbackSides.find((s) => s.idx === primaryDuel.ownerA);
    const sideB = fallbackSides.find((s) => s.idx === primaryDuel.ownerB);
    const isBAlly =
      (myIdx !== undefined && primaryDuel.ownerB === myIdx) ||
      (myTeam !== undefined && sideB?.team === myTeam && sideA?.team !== myTeam);

    const leftGenId = isBAlly ? primaryDuel.generalB : primaryDuel.generalA;
    const rightGenId = isBAlly ? primaryDuel.generalA : primaryDuel.generalB;
    const leftHp = isBAlly ? primaryDuel.hpB : primaryDuel.hpA;
    const leftMaxHp = Math.max(1, isBAlly ? primaryDuel.maxHpB : primaryDuel.maxHpA);
    const rightHp = isBAlly ? primaryDuel.hpA : primaryDuel.hpB;
    const rightMaxHp = Math.max(1, isBAlly ? primaryDuel.maxHpA : primaryDuel.maxHpB);

    const leftGen = TW_GENERALS[leftGenId] ?? TW_GENERALS.guan_yu;
    const rightGen = TW_GENERALS[rightGenId] ?? TW_GENERALS.lu_bu;
    const leftPct = clampNum(Math.round((leftHp / leftMaxHp) * 100), 0, 100);
    const rightPct = clampNum(Math.round((rightHp / rightMaxHp) * 100), 0, 100);

    const isParticipant =
      canControl &&
      myIdx !== undefined &&
      (primaryDuel.ownerA === myIdx || primaryDuel.ownerB === myIdx);
    const myDuelStance: TwDuelStance | undefined =
      myIdx !== undefined
        ? primaryDuel.ownerA === myIdx
          ? primaryDuel.stanceA
          : primaryDuel.ownerB === myIdx
            ? primaryDuel.stanceB
            : undefined
        : undefined;

    return {
      duel: primaryDuel,
      leftGen,
      rightGen,
      leftHp: Math.max(0, Math.ceil(leftHp)),
      leftMaxHp,
      leftPct,
      rightHp: Math.max(0, Math.ceil(rightHp)),
      rightMaxHp,
      rightPct,
      extraCount: Math.max(0, activeDuels.length - 1),
      isParticipant,
      myDuelStance,
    };
  }, [primaryDuel, activeDuels.length, fallbackSides, myIdx, myTeam, canControl]);

  // ---------- Tổng kết Chiến cuộc (Grand End-of-Battle Scroll) ----------
  const result = tw?.result;
  const endSummary = useMemo(() => {
    if (!ended) return null;
    const winnerIdxs = result?.winnerIdxs ?? [];
    const winnerTeam = result?.winnerTeam ?? -1;

    const iWon =
      myIdx !== undefined
        ? winnerIdxs.includes(myIdx) || (myTeam !== undefined && winnerTeam === myTeam)
        : winnerTeam !== -1 || winnerIdxs.length > 0;

    // Phân loại Chiến thắng chuẩn Total War
    let vKind = result?.victoryKind;
    if (!vKind) {
      let winRem = 0;
      let winInit = 0;
      for (const s of fallbackSides) {
        if (winnerIdxs.includes(s.idx) || (winnerTeam !== -1 && s.team === winnerTeam)) {
          winRem += result?.remainingMen?.[s.idx] ?? s.totalMen;
          winInit += s.initialMen;
        }
      }
      const ratio = winInit > 0 ? winRem / winInit : 0.6;
      if (winnerIdxs.length === 0 && winnerTeam === -1) vKind = 'draw';
      else if (ratio >= 0.78) vKind = 'heroic';
      else if (ratio >= 0.55) vKind = 'decisive';
      else if (ratio >= 0.32) vKind = 'close';
      else vKind = 'pyrrhic';
    }

    const vLabel = VICTORY_LABELS[vKind] ?? VICTORY_LABELS.decisive;
    const rows = [...fallbackSides]
      .map((s) => {
        const won =
          winnerIdxs.includes(s.idx) || (winnerTeam !== -1 && s.team === winnerTeam);
        const remMen = result?.remainingMen?.[s.idx] ?? s.totalMen;
        const initMen = Math.max(remMen, s.initialMen);
        const casualties = Math.max(0, initMen - remMen);
        const kills = result?.kills?.[s.idx] ?? s.kills;
        const score = result?.scores?.[s.idx] ?? s.score;
        const human = view.players.find((p) => p.id === s.id);
        const paid = view.payouts?.[s.id];
        return {
          side: s,
          won,
          remMen,
          initMen,
          casualties,
          kills,
          score,
          human,
          paid,
        };
      })
      .sort((a, b) => Number(b.won) - Number(a.won) || b.score - a.score || b.kills - a.kills);

    const myRow = myIdx !== undefined ? rows.find((r) => r.side.idx === myIdx) : undefined;

    return {
      iWon,
      vKind,
      vLabel,
      reason: result?.reason ?? 'Đại cuộc Tam Quốc đã phân định thắng bại trên sa trường.',
      durationText: formatDurationSec(result?.durationSec),
      rows,
      myRow,
    };
  }, [ended, result, myIdx, myTeam, fallbackSides, view.players, view.payouts]);

  const lore = TW_BATTLE_LORE[mapSpec.id] ?? TW_BATTLE_LORE.pingyuan;
  const showDotsEffective = showTacticalDots || spaceHeld;
  const showTrajEffective = showTrajectories || spaceHeld;

  const rootClasses = [
    'tw-game',
    'tw-screen',
    isPanningUi ? 'panning' : '',
    isRightDraggingUi ? 'targeting' : '',
    activeDeployableKind !== null ? 'picking' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleLeaveButton = () => {
    if (ended || myIdx === undefined || !myAlive) {
      emit('room:leave');
      return;
    }
    setLeaveAsk(true);
  };

  return (
    <div
      className={rootClasses}
      style={SCREEN_FALLBACK_STYLE}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Màn hình Chiến trường 2.5D Toàn cảnh */}
      <canvas
        ref={canvasRef}
        className="tw-canvas"
        style={{ ...CANVAS_FALLBACK_STYLE, cursor: canvasCursor }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerCancel}
      />

      {/* Khung viền Vàng Đồng khi kéo chuột trái quét chọn đại quân */}
      {marqueeBox && (
        <div
          className="tw-selection-box"
          style={{
            left: marqueeBox.left,
            top: marqueeBox.top,
            width: marqueeBox.width,
            height: marqueeBox.height,
          }}
        />
      )}

      {/* 2. Thanh Công Cụ Đỉnh Màn Hình (Trạng thái Đài Hiệu Lệnh & Tiện ích Góc Phải) */}
      <div className="tw-top">
        <div className="tw-top-left">
          {mySide ? (
            <span
              className="tw-pill"
              title={`Thế lực ${TW_FACTIONS[mySide.faction].vnName} (${TW_FACTIONS[mySide.faction].name})`}
            >
              <span
                style={{
                  display: 'inline-grid',
                  placeItems: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: TW_FACTIONS[mySide.faction].color,
                  color: mySide.faction === 'yuan' ? '#181a20' : '#fff',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {TW_FACTIONS[mySide.faction].emblemText}
              </span>
              <span>{TW_FACTIONS[mySide.faction].vnName}</span>
              {config.mode === 'historical_2teams' && (
                <span className="muted">· Phe {mySide.team + 1}</span>
              )}
            </span>
          ) : (
            <span className="tw-pill">
              <Eye size={14} className="gold-text" />
              <span>Quan Chiến · Spectator</span>
            </span>
          )}

          {captureSummary.total > 0 && (
            <span
              className="tw-pill tabular"
              title="Số Đài Hiệu Lệnh chiến lược đang nắm giữ trên bản đồ"
            >
              <span>🏯 Đài Hiệu Lệnh:</span>
              <span className="good-text">{captureSummary.ally}</span>
              <span className="muted">/</span>
              <span className="bad-text">{captureSummary.enemy}</span>
              <span className="muted">({captureSummary.total})</span>
            </span>
          )}

          {calloutToast && (
            <span className="tw-pill" role="status">
              <Swords size={13} className="gold-text" />
              <span>{calloutToast}</span>
            </span>
          )}
        </div>

        <div className="tw-top-right">
          {dock && <div className="tw-dock">{dock}</div>}

          <button
            type="button"
            className={`tw-util-btn${guideOpen ? ' on' : ''}`}
            onClick={() => {
              playTwSfx('click');
              setGuideOpen(true);
            }}
            title="Cẩm Nang Tam Quốc · Battle Encyclopedia"
            aria-label="Cẩm Nang Tam Quốc"
          >
            <BookOpen size={16} />
          </button>

          <button
            type="button"
            className={`tw-util-btn${scoresOpen ? ' on' : ''}`}
            onClick={() => {
              playTwSfx('click');
              setScoresOpen((v) => !v);
            }}
            title="Bảng Chiến Công Chư Hầu · Warlord Leaderboard"
            aria-label="Bảng Chiến Công"
          >
            <Trophy size={16} />
          </button>

          <button
            type="button"
            className={`tw-util-btn${chatOpen ? ' on' : ''}`}
            onClick={() => {
              playTwSfx('click');
              setChatOpen((v) => !v);
            }}
            title="Truyền Tin Chiến Trường · Battle Chat"
            aria-label="Truyền Tin Chiến Trường"
          >
            <MessageSquare size={16} />
            {unread > 0 && (
              <span className="tw-badge">{unread > 9 ? '9+' : unread}</span>
            )}
          </button>

          <button
            type="button"
            className="tw-util-btn leave"
            onClick={handleLeaveButton}
            title={
              myIdx !== undefined && myAlive && !ended
                ? 'Xin Hàng / Rời Chiến Trường · Resign or Leave'
                : 'Rời Phòng · Leave Room'
            }
            aria-label="Rời Trận / Xin Hàng"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* 3. Cụm Đại Kỳ Giữa Đỉnh Màn Hình: Bố Trận Khai Chiến, Tạm Dừng Chiến Thuật & Quyết Đấu Võ Tướng */}
      <div className="tw-center-banners">
        {!ended && frame?.battlePhase === 'deployment' && (
          <div className="tw-deploy-banner" role="region" aria-label="Pha Bố Trận Khai Chiến">
            <div className="tw-deploy-banner-body">
              <div className="tw-deploy-banner-title">
                <span>
                  🛡️ PHA BỐ TRẬN &amp; ĐẶT BẪY KHAI CHIẾN — Kéo chuột phải trong vùng bố trận (hoặc Rừng Thông cho quân Tiên Phong) để bày binh bố trận!
                </span>
              </div>
              <div className="tw-deploy-banner-actions">
                <span className="tw-deploy-countdown tabular" title="Thời gian bố trận còn lại">
                  ⏳ {Math.max(0, Math.ceil(frame.deploymentLeftSec ?? 0))}s
                </span>
                {canControl && (
                  <button
                    type="button"
                    className={`tw-deploy-ready-btn${mySide?.readyDeploy ? ' ready' : ''}`}
                    onClick={() =>
                      handleHudCommand({
                        t: 'ready_deploy',
                        ready: !mySide?.readyDeploy,
                      })
                    }
                  >
                    {mySide?.readyDeploy
                      ? '✓ Đã Sẵn Sàng (Chờ đối phương...)'
                      : '⚔️ KHAI CHIẾN'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!ended && frame?.battleSpeed === 0 && (
          <div className="tw-pause-banner" role="status">
            <span>
              ⏸ TẠM DỪNG CHIẾN THUẬT — Ra lệnh điều quân, đổi trận hình hoặc bấm P / Space để tiếp tục
            </span>
            {canControlSpeed && (
              <button
                type="button"
                className="tw-pause-resume-btn"
                onClick={() => handleSetSpeed(1)}
              >
                ▶ Tiếp Tục
              </button>
            )}
          </div>
        )}

        {!ended && activeDeployableKind !== null && (
          <div className="tw-place-hint" role="status">
            <span>
              {TW_DEPLOYABLES[activeDeployableKind].glyph} Đang chọn đặt{' '}
              <b>{TW_DEPLOYABLES[activeDeployableKind].vnName}</b> — Nhấp chuột trái lên mặt đất để đặt (Giữ Shift đặt tiếp)
            </span>
            <button
              type="button"
              className="tw-place-cancel-btn"
              onClick={() => setActiveDeployableKind(null)}
            >
              ✕ Hủy
            </button>
          </div>
        )}

        {duelBannerData && (
          <div
            className={`tw-duel-banner${duelBannerData.isParticipant ? ' has-actions' : ''}`}
            role="region"
            aria-label="Võ Đài Quyết Đấu Tướng 1v1"
          >
            <div
              className="tw-duel-main"
              role="button"
              tabIndex={0}
              onClick={() => {
                focusWorld(duelBannerData.duel.x, duelBannerData.duel.y, 0.96);
                playTwSfx('click');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  focusWorld(duelBannerData.duel.x, duelBannerData.duel.y, 0.96);
                  playTwSfx('click');
                }
              }}
              title="Nhấp để đưa ống kính tới Võ Đài Đấu Tướng 1v1"
            >
              <div className="tw-duel-fighter">
                <img
                  className="tw-duel-token"
                  src={duelBannerData.leftGen.tokenPortrait}
                  alt={duelBannerData.leftGen.vnName}
                  draggable={false}
                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (img.dataset.fb === '1') return;
                    img.dataset.fb = '1';
                    img.src = makeTokenFallbackSvg(duelBannerData.leftGen.vnName, '#37b24d');
                  }}
                />
                <div className="tw-duel-info">
                  <span className="tw-duel-name">
                    {duelBannerData.leftGen.vnName}{' '}
                    <small className="muted tabular">({duelBannerData.leftHp})</small>
                  </span>
                  <div className="tw-duel-hp">
                    <i style={{ width: `${duelBannerData.leftPct}%` }} />
                  </div>
                </div>
              </div>

              <div className="tw-duel-vs">
                <b>⚔️ HIỆP {Math.max(1, duelBannerData.duel.clashPhase)}</b>
                <span className="tw-duel-timer">
                  {Math.max(0, Math.ceil(duelBannerData.duel.timerLeft))}s
                  {duelBannerData.extraCount > 0 ? ` · +${duelBannerData.extraCount}` : ''}
                </span>
              </div>

              <div className="tw-duel-fighter right">
                <img
                  className="tw-duel-token enemy"
                  src={duelBannerData.rightGen.tokenPortrait}
                  alt={duelBannerData.rightGen.vnName}
                  draggable={false}
                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (img.dataset.fb === '1') return;
                    img.dataset.fb = '1';
                    img.src = makeTokenFallbackSvg(duelBannerData.rightGen.vnName, '#e03131');
                  }}
                />
                <div className="tw-duel-info">
                  <span className="tw-duel-name">
                    <small className="muted tabular">({duelBannerData.rightHp})</small>{' '}
                    {duelBannerData.rightGen.vnName}
                  </span>
                  <div className="tw-duel-hp enemy">
                    <i style={{ width: `${duelBannerData.rightPct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {duelBannerData.isParticipant && (
              <div className="tw-duel-actions" role="group" aria-label="Chiến pháp Đơn Đấu">
                <button
                  type="button"
                  className={`tw-duel-act-btn press${
                    duelBannerData.myDuelStance === 'press' ? ' on' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHudCommand({
                      t: 'duel_action',
                      duelId: duelBannerData.duel.id,
                      action: 'press',
                    });
                  }}
                  title="Cường Công: Đánh dồn dập tăng mạnh sát thương mỗi hiệp nhưng lộ sơ hở phòng ngự"
                >
                  ⚡ Cường Công
                </button>
                <button
                  type="button"
                  className={`tw-duel-act-btn guard${
                    duelBannerData.myDuelStance === 'guard' ? ' on' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHudCommand({
                      t: 'duel_action',
                      duelId: duelBannerData.duel.id,
                      action: 'guard',
                    });
                  }}
                  title="Thủ Kín: Giữ thế phòng thủ vững chắc, giảm mạnh sát thương nhận vào từ đòn bổ của địch"
                >
                  🛡️ Thủ Kín
                </button>
                <button
                  type="button"
                  className="tw-duel-act-btn retreat"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleHudCommand({
                      t: 'duel_action',
                      duelId: duelBannerData.duel.id,
                      action: 'retreat',
                    });
                  }}
                  title="Thoái Đấu: Rút tướng khỏi võ đài đơn đấu (chịu phạt giảm sĩ khí toàn quân dưới trướng)"
                >
                  🏳️ Thoái Đấu
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Hộp Thoại Đối Đáp Khiêu Khích Hai Bên Cánh (Left & Right General Banter) */}
      <TwBanterOverlay banter={activeBanter} sides={fallbackSides} />

      {/* 5. Bảng Chiến Công Chư Hầu (.tw-scores) */}
      {scoresOpen && !ended && (
        <aside className="tw-scores" aria-label="Bảng Chiến Công Chư Hầu">
          {coalitionTotals.length > 0 && (
            <div className="tw-coalition-sum">
              {coalitionTotals.map((ct) => (
                <span
                  key={ct.team}
                  className={`tw-coalition-chip${ct.isMine ? ' me' : ''}${
                    !ct.alive ? ' dead' : ''
                  }`}
                >
                  <i
                    style={{
                      background: TW_TEAM_COLORS[ct.team % TW_TEAM_COLORS.length],
                    }}
                  />
                  <span>{TW_TEAM_NAMES[ct.team] ?? `Liên Minh ${ct.team + 1}`}</span>
                  <b className="gold-text tabular">{ct.men.toLocaleString('en-US')}</b>
                </span>
              ))}
            </div>
          )}

          {sortedSides.map((s, rankIdx) => {
            const fac = TW_FACTIONS[s.faction] ?? TW_FACTIONS.wei;
            const menRatio =
              s.initialMen > 0
                ? clampNum(Math.round((s.totalMen / s.initialMen) * 100), 0, 100)
                : s.alive
                  ? 100
                  : 0;
            return (
              <div
                key={s.idx}
                className={`tw-score-row${s.idx === myIdx ? ' me' : ''}${
                  !s.alive ? ' dead' : ''
                }`}
              >
                <button
                  type="button"
                  className="tw-score-look"
                  onClick={() => jumpToWarlordArmy(s.idx)}
                  title={`${s.name} — ${fac.vnName} (${fac.name})\nQuân số: ${s.totalMen}/${s.initialMen} · Diệt địch: ${s.kills} · Điểm: ${s.score}\nNhấp để đưa máy quay tới đạo quân`}
                >
                  <span className="rank">{rankIdx + 1}</span>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="name">
                    <span style={{ color: fac.color, fontWeight: 800, marginRight: 4 }}>
                      [{fac.emblemText}]
                    </span>
                    {s.name}
                    <small className="muted" style={{ marginLeft: 5 }}>
                      · ⚔️{s.kills}
                    </small>
                  </span>
                  <span className="hp" title={`Quân lực còn ${s.totalMen} người (${menRatio}%)`}>
                    <i style={{ width: `${menRatio}%` }} />
                  </span>
                  <b>{s.score}</b>
                </button>
              </div>
            );
          })}
        </aside>
      )}

      {/* 6. Ngăn Kéo Truyền Tin Chiến Trường (.tw-chat) */}
      {chatOpen && (
        <div className="tw-chat">
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

      {/* 7. Khay Thẻ Bài Bộ Tùy & Lệnh Chiến Thuật Góc Trái Dưới (TwRetinueHud) */}
      <TwRetinueHud
        mapSpec={mapSpec}
        mySide={mySide}
        myRegiments={myRegiments}
        enemyGenerals={visibleEnemyGenerals}
        selectedIds={selectedIds}
        hoveredReg={hoveredReg}
        showTacticalDots={showDotsEffective}
        showTrajectories={showTrajEffective}
        romanceMode={config.romanceMode}
        activeDeployableKind={activeDeployableKind}
        onSelectDeployableKind={handleSelectDeployableKind}
        onSelectRegiment={handleSelectRegimentFromHud}
        onSelectAll={selectAllMyArmy}
        onFocusRegiment={handleFocusRegiment}
        onCommand={handleHudCommand}
        onToggleDots={() => {
          playTwSfx('click');
          setShowTacticalDots((v) => !v);
        }}
        onToggleTrajectories={() => {
          playTwSfx('click');
          setShowTrajectories((v) => !v);
        }}
      />

      {/* 8. Sa Bàn Địa Hình Đẳng Cao + Đồng Hồ + Tốc Độ + Hướng Gió + Thanh Cân Bằng Lực Lượng */}
      <TwMinimap
        mapSpec={mapSpec}
        frame={frame}
        myTeam={myTeam}
        cam={camRef.current}
        battleSpeed={frame?.battleSpeed}
        canControlSpeed={canControlSpeed}
        onSetSpeed={handleSetSpeed}
        windAngle={frame?.windAngle}
        windStrength={frame?.windStrength}
        onJumpTo={(wx, wy) => focusWorld(wx, wy)}
        onResetHome={resetCameraHome}
      />

      {/* 9. Chiếu Thư Tổng Kết Chiến Cuộc (.tw-end) */}
      {ended && endSummary && (
        <div className="tw-end" role="dialog" aria-modal="true" aria-label="Tổng Kết Chiến Trận">
          <div className="tw-end-card">
            <div className={`tw-end-banner ${endSummary.iWon ? 'win' : 'lose'}`}>
              <img
                src={
                  endSummary.iWon
                    ? '/database-total-war/ui/banner_victory.png'
                    : '/database-total-war/ui/banner_defeat.png'
                }
                alt={endSummary.iWon ? 'Khải Hoàn Đại Thắng' : 'Bại Trận Sa Trường'}
                style={{
                  width: 'min(360px, 100%)',
                  maxHeight: 112,
                  objectFit: 'contain',
                  borderRadius: 4,
                  marginBottom: 4,
                }}
                draggable={false}
                onError={(e: SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="tw-end-seal">
                {endSummary.vLabel.vn} · {endSummary.vLabel.en}
              </span>
              <h2 className={endSummary.iWon ? 'win' : 'lose'}>
                {myIdx === undefined
                  ? endSummary.vLabel.vn
                  : endSummary.vKind === 'draw'
                    ? 'Bất Phân Thắng Bại'
                    : endSummary.iWon
                      ? endSummary.vLabel.vn
                      : 'Thất Thủ Sa Trường'}
              </h2>
              <div className="tw-end-sub">
                {endSummary.reason}
                {endSummary.durationText ? ` · Thời gian giao chiến: ${endSummary.durationText}` : ''}
              </div>
            </div>

            {view.pot > 0 && endSummary.myRow && endSummary.myRow.paid !== undefined && (
              <div className="tw-end-payout">
                <span>💰 Chiến lợi phẩm kho ngân lượng:</span>
                <span>
                  {endSummary.myRow.won
                    ? `Nhận +${fmtCoins(endSummary.myRow.paid)} xu`
                    : `Hoàn ${fmtCoins(endSummary.myRow.paid)} xu`}
                </span>
              </div>
            )}

            <table className="tw-end-table">
              <thead>
                <tr>
                  <th>Chư Hầu · Thế Lực</th>
                  <th>Còn Sống</th>
                  <th>Thương Vong</th>
                  <th>Diệt Địch</th>
                  <th>Điểm</th>
                  {view.pot > 0 && <th>Thưởng Xu</th>}
                </tr>
              </thead>
              <tbody>
                {endSummary.rows.map((r) => {
                  const fac = TW_FACTIONS[r.side.faction] ?? TW_FACTIONS.wei;
                  return (
                    <tr
                      key={r.side.idx}
                      className={`${r.side.idx === myIdx ? 'me ' : ''}${r.won ? 'won' : ''}`}
                    >
                      <td>
                        <span style={{ color: fac.color, fontWeight: 800, marginRight: 5 }}>
                          [{fac.emblemText}]
                        </span>
                        {r.won ? '🏆 ' : ''}
                        {r.side.name}
                        {config.mode === 'historical_2teams' && (
                          <small className="muted" style={{ marginLeft: 5 }}>
                            (Phe {r.side.team + 1})
                          </small>
                        )}
                      </td>
                      <td>{r.remMen.toLocaleString('en-US')}</td>
                      <td className="bad-text">{r.casualties.toLocaleString('en-US')}</td>
                      <td className="good-text">{r.kills.toLocaleString('en-US')}</td>
                      <td>
                        <b className="gold-text">{r.score}</b>
                      </td>
                      {view.pot > 0 && (
                        <td>
                          {r.human && r.paid !== undefined ? (
                            <span className={r.won ? 'good-text' : 'muted'}>
                              {r.won ? `+${fmtCoins(r.paid)}` : fmtCoins(r.paid)} xu
                            </span>
                          ) : r.human && r.won && view.winnerId === r.side.id ? (
                            <span className="good-text">
                              +{fmtCoins(Math.max(0, view.pot - view.bet))} xu
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="tw-end-actions">
              <button
                type="button"
                className="secondary"
                style={{
                  padding: '8px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={() => emit('room:leave')}
              >
                <LogOut size={15} /> Rời Phòng
              </button>

              {isHost ? (
                <button
                  type="button"
                  className="primary"
                  style={{
                    padding: '9px 18px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                  onClick={() => emit('game:restart')}
                >
                  <RotateCcw size={16} /> Tái Chiến Phòng Chờ
                </button>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>
                  Chờ chủ phòng mở chiến dịch mới…
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 10. Cẩm Nang Binh Pháp Tam Quốc Toàn Chiến (Illustrated Encyclopedia Modal) */}
      {guideOpen && (
        <Modal
          title={
            <span className="modal-title-icon">
              <BookOpen size={19} /> Cẩm Nang Binh Pháp Tam Quốc Toàn Chiến
            </span>
          }
          onClose={() => setGuideOpen(false)}
          width={880}
        >
          <div className="tw-guide-modal">
            <div className="tw-lobby-hero">
              <img
                src="/database-total-war/ui/title_bg.jpg"
                alt={lore.title}
                style={{
                  width: '100%',
                  maxHeight: 175,
                  objectFit: 'cover',
                  display: 'block',
                }}
                draggable={false}
                onError={(e: SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="tw-lobby-overlay">
                <div>
                  <b>
                    ⚔️ {lore.title} ({lore.subtitle})
                  </b>
                  <div style={{ fontSize: 12.5, opacity: 0.88, marginTop: 2 }}>
                    📍 {lore.location} · {lore.year} · Chế độ:{' '}
                    {TW_MODE_LABEL[config.mode]}
                  </div>
                </div>
              </div>
            </div>

            <div className="tw-guide-card">
              <p style={{ margin: '0 0 6px', lineHeight: 1.5 }}>{lore.summary}</p>
              <em style={{ opacity: 0.86, fontSize: 12.5 }}>{lore.historicalQuote}</em>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px' }}>
                🌲 Tứ Trụ Địa Hình & Chiến Thuật Chiến Trường (Total War: Three Kingdoms)
              </h4>
              <div className="tw-guide-grid">
                <div className="tw-guide-card">
                  <b>🌲 Rừng Thông Phục Kích & Chắn Tên</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    {lore.tacticalGuide.pineForestAmbush} Tán tùng dày đặc còn cản{' '}
                    <b>45% sát thương tên đạn</b> cho quân trú đóng bên trong.
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>⛰️ Đồi Cao & Đài Hiệu Lệnh</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    {lore.tacticalGuide.highGroundRanged} Đứng trên cao điểm cộng{' '}
                    <b>+20% tầm bắn</b> và <b>+25% uy lực xung kích</b> khi đổ dốc.
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>🔱 Thương Lâm Khắc Chế Thiết Kỵ</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    {lore.tacticalGuide.spearwallVsCavalry} Phản dội ngược toàn bộ lực húc
                    Charge Bonus của Xung Kỵ địch!
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>⚔️ Đơn Đấu Võ Tướng Diễn Nghĩa</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    {lore.tacticalGuide.romanceGeneralDuel} (Mưu Sĩ hệ Thủy không tham gia
                    đơn đấu trực diện).
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px' }}>☯️ Hệ Ngũ Hành Danh Tướng (Wu Xing 5 Classes)</h4>
              <div className="tw-guide-grid">
                {TW_GENERAL_CLASSES.map((clsKey) => {
                  const cls = TW_CLASSES[clsKey];
                  return (
                    <div key={clsKey} className="tw-guide-card">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 7,
                          marginBottom: 4,
                        }}
                      >
                        <img
                          src={WUXING_ICON_BY_CLASS[clsKey]}
                          alt={cls.element}
                          style={{ width: 22, height: 22, objectFit: 'contain' }}
                          onError={(e: SyntheticEvent<HTMLImageElement>) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <b style={{ color: cls.color }}>
                          Hệ {cls.element} · {cls.vnName} ({cls.enName})
                        </b>
                      </div>
                      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.42 }}>
                        {cls.auraDesc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px' }}>
                🔥 Hỏa Công, Bẫy Công Binh, Bố Trận &amp; Quan Hệ Tướng Lĩnh (TW3K Nâng Cao)
              </h4>
              <div className="tw-guide-grid">
                <div className="tw-guide-card">
                  <b>🛡️ Pha Bố Trận &amp; Quân Tiên Phong (🌲)</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    Trước khi khai chiến 25 giây, kéo chuột phải bày binh trong vùng bố trận. Quân có huy hiệu{' '}
                    <b>🌲 Tiên Phong</b> (Khinh kỵ / Cung thủ trinh sát) có thể phục kích sẵn trong Rừng Thông ngoài vùng chính!
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>🔥 Tên Lửa, Hướng Gió &amp; Hỏa Công</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    Bật <b>🔥 Tên Lửa (phím R)</b> cho cung thủ để đốt cháy Rừng Thông và kích nổ <b>🛢️ Bẫy Dầu</b>. Gió thuận chiều tăng <b>+8% tầm tên</b> và thổi biển lửa lan nhanh thiêu rụi địch!
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>🪵 Đạo Cụ Bẫy &amp; 🏯 Vọng Lâu Bắn Tên</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    Đặt <b>🪵 Chông Gỗ</b> phản sát thương Xung Kỵ, <b>✴️ Chông Sắt</b> tàng hình làm chậm -55%, và <b>🛢️ Dầu Hỏa</b>. Chiếm giữ <b>🏯 Đài Hiệu Lệnh</b> để Vọng Lâu tự động bắn tên yểm trợ!
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>🏅 Cấp Tinh Nhuệ &amp; 🤝 Quan Hệ Guanxi</b>
                  <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    Trung đoàn lập công thăng cấp <b>1–9 (Đồng · Bạc · Vàng)</b> tăng Công, Thủ &amp; Sĩ khí. Huynh đệ kết nghĩa kích hoạt <b>🤝 Đồng Tâm</b>, hoặc bùng nổ <b>🔥 Cuồng Nộ</b> khi đồng đội ngã xuống!
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 8px' }}>🖱️ Điều Khiển Chuột & Phím Tắt Điều Quân</h4>
              <div className="tw-guide-grid">
                <div className="tw-guide-card">
                  <b>Chọn & Lập Đạo Quân</b>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    • <b>Chuột trái</b>: Chọn trung đoàn (giữ <b>Shift</b> chọn gộp,{' '}
                    <b>Nhấp đúp</b> chọn toàn bộ cùng binh chủng).
                    <br />• <b>Kéo Chuột trái</b>: Quét khung chọn nhiều trung đoàn.
                    <br />• <b>Ctrl+A</b>: Chọn toàn quân · <b>Ctrl+1..9</b> / <b>1..9</b>: Lưu & gọi nhóm.
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>Dàn Trận Tuyến, Đặt Bẫy &amp; Đấu Tướng</b>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    • <b>Giữ &amp; Kéo Chuột phải</b>: Dàn hàng quân theo bề ngang &amp; hướng mặt.
                    <br />• <b>Đặt Bẫy (🪵/✴️/🛢️)</b>: Chọn đạo cụ rồi nhấp Chuột trái lên đất (Chuột phải / Esc để hủy).
                    <br />• <b>Đơn Đấu 1v1</b>: Chọn <b>⚡ Cường Công</b>, <b>🛡️ Thủ Kín</b> hoặc <b>🏳️ Thoái Đấu</b> ngay trên kỳ đài!
                  </p>
                </div>

                <div className="tw-guide-card">
                  <b>Tốc Độ Chiến Trận &amp; Phím Tắt</b>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
                    • <b>P</b>: Tạm dừng chiến thuật (ra lệnh khi dừng!) · Thanh <b>½× / 1× / 2× / 3×</b> trên bản đồ nhỏ.
                    <br />• <b>Space</b>: Tiếp tục khi đang dừng, giữ để sáng rõ chấm quân &amp; đường đạn.
                    <br />• <b>H</b> Dừng · <b>G</b> Thủ · <b>F</b> Tự bắn · <b>K</b> Du kích · <b>R</b> Tên Lửa · <b>Q</b> Tuyệt kỹ · <b>V</b> Đấu Tướng.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="primary big"
              onClick={() => setGuideOpen(false)}
            >
              Trở Lại Sa Trường
            </button>
          </div>
        </Modal>
      )}

      {/* 11. Hộp Thoại Xác Nhận Hạ Vũ Khí Xin Hàng / Rời Chiến Trường */}
      {leaveAsk && (
        <Modal
          title={
            <span className="modal-title-icon">
              <Shield size={19} /> Hạ Cờ Xin Hàng hay Rời Trận?
            </span>
          }
          onClose={() => setLeaveAsk(false)}
          width={460}
        >
          <p style={{ lineHeight: 1.5 }}>
            Đại quân của bạn vẫn đang giao chiến trên sa trường. Nếu <b>Xin Hàng</b> hoặc{' '}
            <b>Rời Phòng</b> lúc này, toàn bộ trung đoàn dưới trướng sẽ lập tức tan rã
            {view.pot > 0 && <> và bạn mất phần xu đã đặt cược</>}.
          </p>
          <div className="modal-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ghost"
              onClick={() => setLeaveAsk(false)}
            >
              Ở Lại Chiến Đấu
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setLeaveAsk(false);
                emitCommand({ t: 'resign' });
                playTwSfx('rout');
              }}
            >
              Xin Hàng & Quan Chiến
            </button>
            <button
              type="button"
              className="primary danger"
              onClick={() => {
                setLeaveAsk(false);
                emitCommand({ t: 'resign' });
                emit('room:leave');
              }}
            >
              Xin Hàng & Rời Phòng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
