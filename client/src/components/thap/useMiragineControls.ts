/**
 * React hook điều khiển toàn diện cho chế độ Miragine War cổ điển:
 * - Tự đo vùng đệm HUD trên/dưới bằng `ResizeObserver` (không hardcode pixel).
 * - Khởi tạo & điều khiển Camera (fit theo phe, kéo pan, zoom theo con trỏ, pinch 2 ngón, phím `[`/`]`/`+`/`-`/`Home`/`Space`).
 * - Điều hướng lưới binh chủng 2×8 bằng `W/A/S/D` & `Arrow` + phím tắt trực tiếp `1..9, 0, Q, E, F, G, V, B`.
 * - Điều phối BGM `gameLoop.mp3`, tiếng đếm ngược `SD_Timer.mp3` (3-2-1), tiếng thắng/thua và âm thanh chiến trường theo không gian.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTALS,
  THAP_LANE_CENTER_Y,
  type ThapUnitKind,
} from '../../../../shared/src';
import {
  clampCamera,
  computeSpatialVolume,
  fitCamera,
  focusCameraOn,
  panCameraBy,
  viewportSafeCenter,
  zoomCameraAt,
  type Camera,
} from '../../thap/camera';
import {
  playThap,
  preloadMiragineSfx,
  startMiragineBgm,
  stopMiragineBgm,
} from '../../thap/sound';
import { thapStore } from '../../thap/store';
import {
  DEFAULT_HUD_INSETS,
  moveGridSelection,
  resolveUnitHotkey,
  type HudInsets,
  type MiragineControlState,
  type MiragineViewportSize,
  type UseMiragineControlsOptions,
} from './miragineTypes';

const PAN_STEP_PX = 180;
const ZOOM_STEP_FACTOR = 1.2;
const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const WHEEL_DELTA_CLAMP = 180;

const GRID_MOVE_DELTAS: Readonly<Record<string, readonly [dr: number, dc: number]>> = {
  w: [-1, 0],
  arrowup: [-1, 0],
  s: [1, 0],
  arrowdown: [1, 0],
  a: [0, -1],
  arrowleft: [0, -1],
  d: [0, 1],
  arrowright: [0, 1],
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function resolveCrystalCoords(bases: readonly number[] | undefined, sideIdx: number): readonly [number, number] {
  if (bases && bases.length >= (sideIdx + 1) * 2) {
    return [bases[sideIdx * 2], bases[sideIdx * 2 + 1]];
  }
  return THAP_CRYSTALS[sideIdx] ?? THAP_CRYSTALS[0];
}

function getInitialFocusX(myIdx: number | undefined, bases: readonly number[] | undefined): number | undefined {
  if (myIdx === undefined) return undefined;
  return resolveCrystalCoords(bases, myIdx)[0];
}

function measureElementInsets(
  canvas: HTMLCanvasElement,
  topHud: HTMLElement | null | undefined,
  bottomHud: HTMLElement | null | undefined,
): { insets: HudInsets; width: number; height: number } | null {
  const cRect = canvas.getBoundingClientRect();
  const width = Math.round(cRect.width);
  const height = Math.round(cRect.height);
  if (width <= 0 || height <= 0) return null;

  let top = 0;
  if (topHud) {
    const tRect = topHud.getBoundingClientRect();
    if (tRect.height > 0) {
      top = Math.max(0, Math.ceil(tRect.bottom - cRect.top));
    }
  }

  let bottom = 0;
  if (bottomHud) {
    const bRect = bottomHud.getBoundingClientRect();
    if (bRect.height > 0) {
      bottom = Math.max(0, Math.ceil(cRect.bottom - bRect.top));
    }
  }

  top = Math.min(top, height);
  bottom = Math.min(bottom, Math.max(0, height - top));

  return {
    insets: { top, bottom, left: 0, right: 0 },
    width,
    height,
  };
}

/**
 * Hook quản lý Camera, HUD insets (`ResizeObserver`), phím điều khiển lưới quân 2×8
 * và toàn bộ âm thanh / BGM / Spatial SFX của Miragine War cổ điển.
 */
export function useMiragineControls(options: UseMiragineControlsOptions): MiragineControlState {
  const {
    roomCode,
    thap,
    playing,
    ended,
    myIdx,
    winnerTeam,
    result,
    myTeam,
    selectedUnit,
    inspectedUnit: inspectedUnitProp,
    onSelectUnit,
    onInspectUnit,
    emit,
    canvasRef,
    topHudRef,
    bottomHudRef,
  } = options;

  const arenaW = thap.mapW || THAP_ARENA_W;
  const arenaH = thap.mapH || THAP_ARENA_H;

  const camRef = useRef<Camera>({
    x: THAP_ARENA_W * 0.5,
    y: THAP_LANE_CENTER_Y,
    zoom: 1,
  });
  const hudInsetsRef = useRef<HudInsets>(DEFAULT_HUD_INSETS);
  const viewportRef = useRef<MiragineViewportSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const userMovedCamRef = useRef(false);

  const [hudInsets, setHudInsets] = useState<HudInsets>(DEFAULT_HUD_INSETS);
  const [viewportSize, setViewportSize] = useState<MiragineViewportSize>(viewportRef.current);
  const [isPanning, setIsPanning] = useState(false);
  const [internalInspected, setInternalInspected] = useState<ThapUnitKind>(selectedUnit);

  const inspectedUnit = inspectedUnitProp ?? internalInspected;

  // Refs giữ giá trị mới nhất để listener native & RAF loop không dùng closure cũ.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const endedRef = useRef(ended);
  endedRef.current = ended;
  const myIdxRef = useRef(myIdx);
  myIdxRef.current = myIdx;
  const arenaRef = useRef({ w: arenaW, h: arenaH });
  arenaRef.current = { w: arenaW, h: arenaH };
  const basesRef = useRef(thap.bases);
  basesRef.current = thap.bases;
  const selectedUnitRef = useRef(selectedUnit);
  selectedUnitRef.current = selectedUnit;
  const onSelectUnitRef = useRef(onSelectUnit);
  onSelectUnitRef.current = onSelectUnit;
  const onInspectUnitRef = useRef(onInspectUnit);
  onInspectUnitRef.current = onInspectUnit;
  const emitRef = useRef(emit);
  emitRef.current = emit;

  useEffect(() => {
    if (inspectedUnitProp === undefined) {
      setInternalInspected(selectedUnit);
    }
  }, [selectedUnit, inspectedUnitProp]);

  const getViewportMetrics = useCallback(() => {
    const el = canvasRef.current;
    const width = el?.clientWidth || viewportRef.current.width || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const height = el?.clientHeight || viewportRef.current.height || (typeof window !== 'undefined' ? window.innerHeight : 720);
    return { width, height };
  }, [canvasRef]);

  const inspectUnit = useCallback((kind: ThapUnitKind) => {
    if (inspectedUnitProp === undefined) {
      setInternalInspected(kind);
    }
    onInspectUnitRef.current?.(kind);
  }, [inspectedUnitProp]);

  const selectUnit = useCallback((kind: ThapUnitKind) => {
    if (endedRef.current || !playingRef.current || myIdxRef.current === undefined) return;
    selectedUnitRef.current = kind;
    inspectUnit(kind);
    onSelectUnitRef.current(kind);
    playThap('click');
    emitRef.current('thap:cmd', { t: 'auto', kind });
  }, [inspectUnit]);

  const panByScreen = useCallback((dxScreen: number, dyScreen: number) => {
    const { width, height } = getViewportMetrics();
    const { w, h } = arenaRef.current;
    userMovedCamRef.current = true;
    camRef.current = panCameraBy(
      camRef.current,
      dxScreen,
      dyScreen,
      width,
      height,
      w,
      h,
      hudInsetsRef.current,
    );
  }, [getViewportMetrics]);

  const panLeft = useCallback(() => {
    panByScreen(-PAN_STEP_PX, 0);
  }, [panByScreen]);

  const panRight = useCallback(() => {
    panByScreen(PAN_STEP_PX, 0);
  }, [panByScreen]);

  const focusWorldX = useCallback((wx: number) => {
    const { width, height } = getViewportMetrics();
    const { w, h } = arenaRef.current;
    userMovedCamRef.current = true;
    camRef.current = focusCameraOn(
      wx,
      THAP_LANE_CENTER_Y,
      camRef.current.zoom,
      width,
      height,
      w,
      h,
      hudInsetsRef.current,
    );
  }, [getViewportMetrics]);

  const focusCrystal = useCallback((sideIdx: number) => {
    const { width, height } = getViewportMetrics();
    const { w, h } = arenaRef.current;
    const [cx, cy] = resolveCrystalCoords(basesRef.current, sideIdx);
    userMovedCamRef.current = true;
    camRef.current = focusCameraOn(
      cx,
      cy,
      camRef.current.zoom,
      width,
      height,
      w,
      h,
      hudInsetsRef.current,
    );
  }, [getViewportMetrics]);

  const zoomByFactor = useCallback((factor: number, screenX?: number, screenY?: number) => {
    const { width, height } = getViewportMetrics();
    const { w, h } = arenaRef.current;
    const insets = hudInsetsRef.current;
    const anchor =
      screenX !== undefined && screenY !== undefined
        ? { x: screenX, y: screenY }
        : viewportSafeCenter(width, height, insets);

    userMovedCamRef.current = true;
    camRef.current = zoomCameraAt(
      camRef.current,
      anchor.x,
      anchor.y,
      factor,
      width,
      height,
      w,
      h,
      insets,
    );
  }, [getViewportMetrics]);

  const zoomIn = useCallback(() => {
    zoomByFactor(ZOOM_STEP_FACTOR);
  }, [zoomByFactor]);

  const zoomOut = useCallback(() => {
    zoomByFactor(1 / ZOOM_STEP_FACTOR);
  }, [zoomByFactor]);

  const applyDefaultCamera = useCallback((width: number, height: number, insets: HudInsets) => {
    const { w, h } = arenaRef.current;
    camRef.current = fitCamera(
      width,
      height,
      w,
      h,
      insets,
      getInitialFocusX(myIdxRef.current, basesRef.current),
    );
  }, []);

  const resetView = useCallback(() => {
    const { width, height } = getViewportMetrics();
    userMovedCamRef.current = false;
    applyDefaultCamera(width, height, hudInsetsRef.current);
  }, [getViewportMetrics, applyDefaultCamera]);

  // Reset trạng thái camera mặc định khi vào phòng mới, ván mới, đổi phe hoặc đổi kích thước sân.
  useEffect(() => {
    userMovedCamRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cRect = canvas.getBoundingClientRect();
    if (cRect.width > 0 && cRect.height > 0) {
      camRef.current = fitCamera(
        Math.round(cRect.width),
        Math.round(cRect.height),
        arenaW,
        arenaH,
        hudInsetsRef.current,
        getInitialFocusX(myIdx, basesRef.current),
      );
    }
  }, [roomCode, thap.startedAt, myIdx, playing, arenaW, arenaH, canvasRef]);

  // 1. Đo vùng đệm HUD trên/dưới động qua ResizeObserver + window resize.
  useEffect(() => {
    const measure = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const measured = measureElementInsets(canvas, topHudRef?.current, bottomHudRef?.current);
      if (!measured) return;

      const prevInsets = hudInsetsRef.current;
      if (
        prevInsets.top !== measured.insets.top ||
        prevInsets.bottom !== measured.insets.bottom ||
        prevInsets.left !== measured.insets.left ||
        prevInsets.right !== measured.insets.right
      ) {
        hudInsetsRef.current = measured.insets;
        setHudInsets(measured.insets);
      }

      const prevSize = viewportRef.current;
      if (prevSize.width !== measured.width || prevSize.height !== measured.height) {
        viewportRef.current = { width: measured.width, height: measured.height };
        setViewportSize({ width: measured.width, height: measured.height });
      }

      const { w, h } = arenaRef.current;
      if (!userMovedCamRef.current) {
        applyDefaultCamera(measured.width, measured.height, measured.insets);
      } else {
        camRef.current = clampCamera(
          camRef.current,
          measured.width,
          measured.height,
          w,
          h,
          measured.insets,
        );
      }
    };

    measure();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      if (canvasRef.current) ro.observe(canvasRef.current);
      if (topHudRef?.current) ro.observe(topHudRef.current);
      if (bottomHudRef?.current) ro.observe(bottomHudRef.current);
    }
    window.addEventListener('resize', measure);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canvasRef, topHudRef, bottomHudRef, playing, ended, myIdx, applyDefaultCamera]);

  // 2. Kéo chuột / cảm ứng 1-2 ngón & cuộn chuột thu phóng trực tiếp trên Canvas.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch: { dist: number; midX: number; midY: number } | null = null;

    const readPinch = () => {
      const [a, b] = [...pointers.values()];
      if (!a || !b) return null;
      return {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        midX: (a.x + b.x) * 0.5,
        midY: (a.y + b.y) * 0.5,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!playingRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;

      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore synthetic pointer events */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        lastPinch = readPinch();
      } else {
        lastPinch = null;
        setIsPanning(true);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        const nextPinch = readPinch();
        if (nextPinch && lastPinch) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const factor = nextPinch.dist / lastPinch.dist;
            const anchorX = nextPinch.midX - rect.left;
            const anchorY = nextPinch.midY - rect.top;
            const { w, h } = arenaRef.current;
            const insets = hudInsetsRef.current;
            userMovedCamRef.current = true;
            camRef.current = zoomCameraAt(
              camRef.current,
              anchorX,
              anchorY,
              factor,
              rect.width,
              rect.height,
              w,
              h,
              insets,
            );
            const moveX = nextPinch.midX - lastPinch.midX;
            const moveY = nextPinch.midY - lastPinch.midY;
            if (moveX !== 0 || moveY !== 0) {
              camRef.current = panCameraBy(
                camRef.current,
                -moveX,
                -moveY,
                rect.width,
                rect.height,
                w,
                h,
                insets,
              );
            }
          }
        }
        lastPinch = nextPinch;
        return;
      }

      const moveX = e.clientX - prev.x;
      const moveY = e.clientY - prev.y;
      if (moveX !== 0 || moveY !== 0) {
        panByScreen(-moveX, -moveY);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      try {
        if (el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      if (pointers.size < 2) lastPinch = null;
      if (pointers.size === 0) setIsPanning(false);
    };

    const onWheel = (e: WheelEvent) => {
      if (!playingRef.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const delta = Math.max(-WHEEL_DELTA_CLAMP, Math.min(WHEEL_DELTA_CLAMP, e.deltaY));
      const factor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
      zoomByFactor(factor, e.clientX - rect.left, e.clientY - rect.top);
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      setIsPanning(false);
    };
  }, [canvasRef, panByScreen, zoomByFactor, playing]);

  // 3. Bàn phím: Camera (`[`, `]`, `+`/`=`, `-`, `Home`/`Space`) + Lưới lính 2×8 (`W/A/S/D`, `Arrows`, `1..0,Q,E,F,G,V,B`).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!playingRef.current || endedRef.current) return;
      if (isEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Phím điều khiển camera hoạt động cho cả người chơi lẫn khán giả.
      if (e.key === '[') {
        e.preventDefault();
        panLeft();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        panRight();
        return;
      }
      if (e.key === '+' || e.key === '=' || (!e.shiftKey && e.code === 'NumpadAdd')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (e.key === '-' || (!e.shiftKey && e.code === 'NumpadSubtract')) {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (e.key === 'Home' || e.key === ' ') {
        e.preventDefault();
        focusCrystal(myIdxRef.current ?? 0);
        return;
      }

      // Điều khiển chọn quân chỉ dành cho người chơi đang tham chiến.
      if (myIdxRef.current === undefined || e.shiftKey || e.repeat) return;

      const lowerKey = e.key.toLowerCase();
      const moveDelta = GRID_MOVE_DELTAS[lowerKey];
      if (moveDelta) {
        if (lowerKey.startsWith('arrow')) e.preventDefault();
        const nextKind = moveGridSelection(selectedUnitRef.current, moveDelta[0], moveDelta[1]);
        selectUnit(nextKind);
        return;
      }

      const hotkeyKind = resolveUnitHotkey(e);
      if (hotkeyKind) {
        e.preventDefault();
        selectUnit(hotkeyKind);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panLeft, panRight, zoomIn, zoomOut, focusCrystal, selectUnit]);

  // 4a. Vòng đời BGM trận đấu (`gameLoop.mp3`) & preload toàn bộ SFX.
  const bgmActiveRef = useRef(false);
  useEffect(() => {
    if (playing && !ended) {
      void preloadMiragineSfx();
      startMiragineBgm('game');
      bgmActiveRef.current = true;
      return;
    }
    if (ended || bgmActiveRef.current) {
      stopMiragineBgm();
      bgmActiveRef.current = false;
    }
  }, [playing, ended]);

  useEffect(() => {
    return () => {
      stopMiragineBgm();
      bgmActiveRef.current = false;
    };
  }, []);

  // 4b. Tiếng đếm ngược `SD_Timer.mp3` đúng 1 lần mỗi mốc 3, 2, 1 trong từng đợt sóng.
  const lastWaveRef = useRef<number>(-1);
  const prevRoundLeftRef = useRef<number>(0);
  const triggeredTimerSecsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    lastWaveRef.current = -1;
    prevRoundLeftRef.current = 0;
    triggeredTimerSecsRef.current.clear();

    if (!playing || ended) return;

    const checkRoundCountdown = () => {
      if (!thapStore.frame || thapStore.wave < 0) return;

      const currentWave = thapStore.wave;
      const roundLeft = thapStore.roundLeft;
      if (currentWave !== lastWaveRef.current || roundLeft > prevRoundLeftRef.current + 1.5) {
        triggeredTimerSecsRef.current.clear();
      }
      lastWaveRef.current = currentWave;
      prevRoundLeftRef.current = roundLeft;

      const sec = Math.round(roundLeft);
      if ((sec === 3 || sec === 2 || sec === 1) && !triggeredTimerSecsRef.current.has(sec)) {
        triggeredTimerSecsRef.current.add(sec);
        playThap('timer');
      }
    };

    checkRoundCountdown();
    return thapStore.subscribe(checkRoundCountdown);
  }, [playing, ended, roomCode, thap.startedAt]);

  // 4c. Âm thanh kết thúc trận đấu (`SD_cheer.mp3` khi thắng, không bao giờ phát khi thua).
  const playedResultKeyRef = useRef('');
  const effectiveWinnerTeam = result?.winnerTeam ?? thap.result?.winnerTeam ?? winnerTeam;

  useEffect(() => {
    if (!ended) {
      playedResultKeyRef.current = '';
      return;
    }
    stopMiragineBgm();
    bgmActiveRef.current = false;

    if (effectiveWinnerTeam === undefined) return;
    const matchKey = `${roomCode}:${thap.startedAt ?? 0}:${effectiveWinnerTeam}`;
    if (playedResultKeyRef.current === matchKey) return;
    playedResultKeyRef.current = matchKey;

    if (myTeam !== undefined && effectiveWinnerTeam === myTeam) {
      playThap('win');
    } else if (myIdx !== undefined) {
      playThap('lose');
    }
  }, [ended, effectiveWinnerTeam, myTeam, myIdx, roomCode, thap.startedAt]);

  // 4d. Bộ phát SFX không gian (gọi trong vòng lặp RAF render).
  const flushSpatialAudio = useCallback((overrideW?: number, overrideH?: number) => {
    const events = thapStore.consumeAudioEvents();
    if (events.length === 0) return;

    const metrics = getViewportMetrics();
    const cssW = overrideW && overrideW > 0 ? overrideW : metrics.width;
    const cssH = overrideH && overrideH > 0 ? overrideH : metrics.height;
    const insets = hudInsetsRef.current;
    const cam = camRef.current;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const vol = computeSpatialVolume(ev.x, ev.y, cam, cssW, cssH, insets);
      if (vol > 0) {
        playThap(ev.type, vol);
      }
    }
  }, [getViewportMetrics]);

  return {
    camRef,
    hudInsets,
    hudInsetsRef,
    viewportSize,
    isPanning,
    selectedUnit,
    inspectedUnit,
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
  };
}
