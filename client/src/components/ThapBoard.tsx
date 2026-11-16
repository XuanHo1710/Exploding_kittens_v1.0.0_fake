/**
 * Bảng trận đấu Miragine War cổ điển (1P vs AI / 1v1 PvP):
 * điều phối Canvas 2D HiDPI (`renderScene`), âm thanh không gian (`useMiragineControls`),
 * thanh HUD trên (`MiragineTopHud`), thanh cuộn chiến trường ngang (`MiragineLaneBar`),
 * khung soi binh chủng (`MiragineUnitInfo`), lưới chọn 16 quân 2×8 (`MiragineUnitGrid`),
 * hộp thoại Hướng dẫn / Bách khoa (`MiragineTutorialModal`), Tổng kết (`MiragineResultModal`) và Chat.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTALS,
  THAP_DOORS,
  THAP_SIDE_NAMES,
  type RoomView,
  type ThapPlayerInfo,
  type ThapUnitKind,
} from '../../../shared/src';
import { useSettings } from '../settings';
import { renderScene } from '../thap/render';
import { playThap, syncMiragineBgmMute } from '../thap/sound';
import { preloadMiragineAssets } from '../thap/sprites';
import { thapStore } from '../thap/store';
import '../thap/thap.css';
import ChatPanel, { type ChatTab, type RoomChat, useChatState } from './ChatPanel';
import { roomPeople } from './Spectators';
import { MiragineLaneBar } from './thap/MiragineLaneBar';
import MiragineResultModal from './thap/MiragineResultModal';
import { MiragineTopHud } from './thap/MiragineTopHud';
import MiragineTutorialModal from './thap/MiragineTutorialModal';
import { MiragineUnitGrid } from './thap/MiragineUnitGrid';
import { MiragineUnitInfo } from './thap/MiragineUnitInfo';
import { useMiragineControls } from './thap/useMiragineControls';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

const DEFAULT_UNIT: ThapUnitKind = 'newbie';
const HUD_THROTTLE_MS = 100;
const ALERT_BANNER_MS = 2600;
const PENDING_AUTO_GRACE_MS = 600;

/** Chuyển mảng phẳng `[x0, y0, x1, y1]` sang danh sách cặp tọa độ `[x, y][]`, fallback an toàn khi thiếu. */
function toCoordPairs(
  flat: readonly number[] | undefined,
  fallback: readonly (readonly [number, number])[],
): [number, number][] {
  const out: [number, number][] = [];
  if (flat) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const x = flat[i];
      const y = flat[i + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push([x, y]);
      }
    }
  }
  return out.length > 0 ? out : fallback.map(([x, y]) => [x, y] as [number, number]);
}

/** Chuẩn hóa danh sách phe theo `idx` tăng dần, không để lỗ trống `undefined`. */
function normalizePlayers(raw: readonly ThapPlayerInfo[] | undefined): ThapPlayerInfo[] {
  if (!raw || raw.length === 0) return [];
  return raw.filter((p): p is ThapPlayerInfo => Boolean(p)).sort((a, b) => a.idx - b.idx);
}

/** Màn hình trận đấu Miragine War cổ điển 2 phe (Phe Đỏ trái vs Phe Xanh phải). */
export default function ThapBoard({ view, meId, emit, chat, dock }: Props) {
  const settings = useSettings();
  const thap = view.thap!;
  const myIdx = thap.myIdx;
  const startedAt = thap.startedAt ?? 0;
  const mapW = thap.mapW ?? THAP_ARENA_W;
  const mapH = thap.mapH ?? THAP_ARENA_H;

  const players = useMemo(() => normalizePlayers(thap.players), [thap.players]);
  const basesPairs = useMemo(() => toCoordPairs(thap.bases, THAP_CRYSTALS), [thap.bases]);
  const doorsPairs = useMemo(() => toCoordPairs(thap.doors, THAP_DOORS), [thap.doors]);
  const playerNames = useMemo(
    () => [0, 1].map((idx) => players.find((p) => p.idx === idx)?.name ?? THAP_SIDE_NAMES[idx]),
    [players],
  );

  // Đồng bộ kho khung hình ngay trước khi đọc state và gọi hook điều khiển.
  thapStore.reset(view.code, startedAt, mapW, mapH, myIdx, basesPairs);

  const [selectedUnit, setSelectedUnit] = useState<ThapUnitKind>(DEFAULT_UNIT);
  const [inspectedUnit, setInspectedUnit] = useState<ThapUnitKind>(DEFAULT_UNIT);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>('chat');
  const [, setHudTick] = useState(0);
  const [, setNowMs] = useState(() => Date.now());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topHudRef = useRef<HTMLElement>(null);
  const bottomHudRef = useRef<HTMLDivElement>(null);
  const pendingAutoRef = useRef<{ kind: ThapUnitKind; at: number } | null>(null);
  const lastAlertAtRef = useRef(0);

  const playing = view.phase === 'playing';
  const ended = view.phase === 'ended' || Boolean(thap.result);
  const winnerTeam = thap.result?.winnerTeam;
  const myPlayer = myIdx !== undefined ? players.find((p) => p.idx === myIdx) : undefined;
  const myTeam = myPlayer?.team;

  const { typingNames, unread } = useChatState(
    chat,
    roomPeople(view),
    meId,
    chatOpen && chatTab === 'chat',
  );

  const handleSelectUnit = useCallback((kind: ThapUnitKind) => {
    pendingAutoRef.current = { kind, at: performance.now() };
    setSelectedUnit(kind);
  }, []);

  const handleInspectUnit = useCallback((kind: ThapUnitKind) => {
    setInspectedUnit(kind);
  }, []);

  const {
    camRef,
    hudInsets,
    hudInsetsRef,
    viewportSize,
    isPanning,
    selectUnit,
    inspectUnit,
    panLeft,
    panRight,
    focusWorldX,
    focusCrystal,
    zoomIn,
    zoomOut,
    resetView,
    flushSpatialAudio,
  } = useMiragineControls({
    roomCode: view.code,
    thap,
    playing,
    ended,
    myIdx,
    winnerTeam,
    result: thap.result,
    myTeam,
    selectedUnit,
    inspectedUnit,
    onSelectUnit: handleSelectUnit,
    onInspectUnit: handleInspectUnit,
    emit,
    canvasRef,
    topHudRef,
    bottomHudRef,
  });

  // Nạp trước toàn bộ sprite/chân dung & giữ mute âm thanh đồng bộ với cài đặt.
  useEffect(() => {
    preloadMiragineAssets();
  }, []);

  useEffect(() => {
    syncMiragineBgmMute();
  }, [settings.sound]);

  // Đặt lại trạng thái ván mới & đồng bộ lựa chọn auto từ server nếu vừa reconnect.
  useEffect(() => {
    thapStore.reset(view.code, startedAt, mapW, mapH, myIdx, basesPairs);
  }, [view.code, startedAt, mapW, mapH, myIdx, basesPairs]);

  useEffect(() => {
    pendingAutoRef.current = null;
    lastAlertAtRef.current = 0;
    const serverAuto = thapStore.frame?.me?.auto;
    setSelectedUnit(serverAuto ?? DEFAULT_UNIT);
    setInspectedUnit(serverAuto ?? DEFAULT_UNIT);
  }, [view.code, startedAt, myIdx]);

  // Đồng hồ 1000ms khi trận đấu có giới hạn thời gian `endsAt`.
  useEffect(() => {
    if (thap.endsAt === undefined || ended) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [thap.endsAt, ended]);

  // Lắng nghe `thapStore` có tiết lưu (~100ms) cho thanh tiến trình đợt sóng, máu Pha Lê & đồng bộ reconnect.
  useEffect(() => {
    let lastEmitAt = 0;
    let throttleTimer: number | undefined;
    let alertClearTimer: number | undefined;

    const flushHud = () => {
      lastEmitAt = performance.now();
      setHudTick((n) => n + 1);
    };

    const scheduleHud = () => {
      const now = performance.now();
      const elapsed = now - lastEmitAt;
      if (elapsed >= HUD_THROTTLE_MS) {
        if (throttleTimer !== undefined) {
          window.clearTimeout(throttleTimer);
          throttleTimer = undefined;
        }
        flushHud();
        return;
      }
      if (throttleTimer === undefined) {
        throttleTimer = window.setTimeout(() => {
          throttleTimer = undefined;
          flushHud();
        }, HUD_THROTTLE_MS - elapsed);
      }
    };

    const syncServerAuto = () => {
      const serverAuto = thapStore.frame?.me?.auto;
      if (!serverAuto) return;
      const pending = pendingAutoRef.current;
      if (pending) {
        if (serverAuto === pending.kind) {
          pendingAutoRef.current = null;
          return;
        }
        if (performance.now() - pending.at <= PENDING_AUTO_GRACE_MS) {
          return;
        }
        pendingAutoRef.current = null;
      }
      setSelectedUnit((prev) => (prev === serverAuto ? prev : serverAuto));
    };

    const handleAlert = () => {
      const al = thapStore.alert;
      if (!al || al.at === lastAlertAtRef.current) return;
      lastAlertAtRef.current = al.at;
      if (performance.now() - al.at < 500) {
        playThap('alarm');
      }
      if (alertClearTimer !== undefined) window.clearTimeout(alertClearTimer);
      alertClearTimer = window.setTimeout(() => {
        alertClearTimer = undefined;
        setHudTick((n) => n + 1);
      }, ALERT_BANNER_MS + 40);
    };

    const unsub = thapStore.subscribe(() => {
      syncServerAuto();
      handleAlert();
      scheduleHud();
    });

    return () => {
      unsub();
      if (throttleTimer !== undefined) window.clearTimeout(throttleTimer);
      if (alertClearTimer !== undefined) window.clearTimeout(alertClearTimer);
    };
  }, []);

  // Giữ tham chiếu mới nhất cho vòng lặp RAF 60 FPS không cần khởi động lại theo HUD tick.
  const renderDataRef = useRef({
    bases: basesPairs,
    doors: doorsPairs,
    names: playerNames,
    myIdx,
    camRef,
    hudInsetsRef,
    flushSpatialAudio,
  });
  renderDataRef.current = {
    bases: basesPairs,
    doors: doorsPairs,
    names: playerNames,
    myIdx,
    camRef,
    hudInsetsRef,
    flushSpatialAudio,
  };

  // Vòng lặp vẽ Canvas 2D HiDPI + âm thanh không gian.
  useEffect(() => {
    let rafId = 0;
    let lastRenderedCam = renderDataRef.current.camRef.current;
    let camSyncPending = false;
    let lastCamSyncAt = 0;

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      if (cssW <= 0 || cssH <= 0) return;

      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const data = renderDataRef.current;
      data.flushSpatialAudio(cssW, cssH);
      renderScene(ctx, {
        w: cssW,
        h: cssH,
        dpr,
        cam: data.camRef.current,
        pad: data.hudInsetsRef.current,
        bases: data.bases,
        doors: data.doors,
        names: data.names,
        myIdx: data.myIdx,
        showAlert: false,
      });

      const liveCam = data.camRef.current;
      if (liveCam !== lastRenderedCam) {
        lastRenderedCam = liveCam;
        camSyncPending = true;
      }
      if (camSyncPending) {
        const nowMs = performance.now();
        if (nowMs - lastCamSyncAt >= 16) {
          camSyncPending = false;
          lastCamSyncAt = nowMs;
          setHudTick((n) => (n + 1) & 0x7fffffff);
        }
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const frame = thapStore.frame;
  const me = frame?.me;
  const alive = myIdx !== undefined && (frame ? frame.al[myIdx] === 1 : myPlayer?.alive !== false);
  const freshAlert =
    thapStore.alert && performance.now() - thapStore.alert.at < ALERT_BANNER_MS
      ? thapStore.alert
      : undefined;

  const handleOpenTutorial = useCallback(() => setTutorialOpen(true), []);
  const handleCloseTutorial = useCallback(() => setTutorialOpen(false), []);
  const handleToggleChat = useCallback(() => setChatOpen((o) => !o), []);
  const handleLeave = useCallback(() => emit('room:leave'), [emit]);
  const handleRestart = useCallback(() => emit('game:restart'), [emit]);

  return (
    <div className="thap-game">
      <canvas
        ref={canvasRef}
        className="thap-canvas"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      />

      <MiragineTopHud
        ref={topHudRef}
        players={players}
        myIdx={myIdx}
        me={me}
        baseHp={thapStore.baseHp}
        wave={thapStore.wave}
        roundLeft={thapStore.roundLeft}
        roundTotalS={thapStore.roundTotalS}
        lastWaveUnits={thapStore.lastWaveUnits}
        elapsedMs={frame?.elapsed ?? 0}
        endsAt={thap.endsAt}
        alive={alive}
        ended={ended}
        pot={view.pot}
        bet={view.bet}
        tutorialOpen={tutorialOpen}
        chatOpen={chatOpen}
        unreadCount={unread}
        dock={dock}
        onFocusCrystal={focusCrystal}
        onOpenTutorial={handleOpenTutorial}
        onToggleChat={handleToggleChat}
        onLeave={handleLeave}
      />

      {freshAlert && (
        <button
          type="button"
          className="thap-alert"
          style={{ top: Math.max(72, hudInsets.top + 8) }}
          onClick={() => focusCrystal(myIdx ?? 0)}
          title="Nhấp để đưa camera về Pha Lê Chính (Space)"
        >
          ⚠️ {freshAlert.text}
        </button>
      )}

      {myIdx === undefined && !ended && (
        <div
          className="thap-hint"
          style={{ top: Math.max(108, hudInsets.top + (freshAlert ? 46 : 8)) }}
        >
          👀 Bạn đang xem trận đấu · Kéo bản đồ hoặc dùng thanh trượt dưới để theo dõi chiến trường
        </div>
      )}

      <div ref={bottomHudRef} className="thap-bottom">
        <MiragineLaneBar
          mapW={mapW}
          mapH={mapH}
          cam={camRef.current}
          viewportSize={viewportSize}
          hudInsets={hudInsets}
          bases={basesPairs}
          myIdx={myIdx}
          onFocusWorldX={focusWorldX}
          onPanLeft={panLeft}
          onPanRight={panRight}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetView}
        />

        <div className="thap-army">
          <MiragineUnitInfo
            owner={myIdx ?? 0}
            unitKind={inspectedUnit}
            selectedUnit={selectedUnit}
            gold={me?.gold}
            pop={me?.pop}
            popCap={me?.popCap}
          />

          <MiragineUnitGrid
            owner={myIdx ?? 0}
            selectedUnit={selectedUnit}
            inspectedUnit={inspectedUnit}
            gold={me?.gold}
            pop={me?.pop}
            popCap={me?.popCap}
            disabled={ended || !alive || myIdx === undefined}
            onSelectUnit={selectUnit}
            onInspectUnit={inspectUnit}
          />
        </div>
      </div>

      {chatOpen && (
        <div className="thap-chat" style={{ top: Math.max(64, hudInsets.top + 6) }}>
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

      <MiragineTutorialModal
        open={tutorialOpen}
        initialUnit={inspectedUnit}
        onClose={handleCloseTutorial}
      />

      {ended && thap.result && (
        <MiragineResultModal
          result={thap.result}
          players={players}
          myIdx={myIdx}
          myTeam={myTeam}
          isHost={view.hostId === meId}
          pot={view.pot}
          bet={view.bet}
          payouts={view.payouts}
          winnerId={view.winnerId}
          onRestart={handleRestart}
          onLeave={handleLeave}
        />
      )}
    </div>
  );
}
