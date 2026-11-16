/**
 * Bắn Súng Co-op (Soul-Knight Pixel Shooter) — Fullscreen Game Board Component.
 * Bridges the 60FPS pixel Canvas renderer (`renderBansungScene`), prediction/snapshot store
 * (`bansungStore`), spatial WebAudio engine (`sound.ts`), PC + Mobile twin-stick input
 * (`BansungInputController`), `HudBars`, `HotbarShop` (+ `PerkDraftModal`), `PostGameModal`,
 * spectator mode, Tab scoreboard, Chat drawer, Guide/Settings modal, and socket `bansung:cmd`/`bansung:frame`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Crosshair,
  Eye,
  Gamepad2,
  Hand,
  LogOut,
  RotateCw,
  Shield,
  SlidersHorizontal,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import {
  BANSUNG_BIOME_PALETTES,
  BANSUNG_HEROES,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_STAT_SCALE,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PICKUP_CONSTS,
  BANSUNG_PING_ENEMY,
  BANSUNG_PING_HELP,
  BANSUNG_PING_LOOT,
  BANSUNG_PING_REVIVE,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_TOTAL_WAVES,
  BANSUNG_WEAPON_TIERS,
  normalizeWeaponTier,
  resolveBansungGameMode,
  type BansungBiome,
  type BansungCommand,
  type BansungFrame,
  type BansungPingKind,
  type RoomView,
} from '../../../shared/src';
import { bansungStore, useBansungHud, type SnapPlayer } from '../bansung/store';
import { bansungInput, type BansungInputMode } from '../bansung/input';
import { clearBansungRenderCaches, getRenderDiagnostics, renderBansungScene, RENDER_CFG, type CameraState } from '../bansung/render';
import { getAssetLoadProgress, initBansungAssets, onBansungAssetLoad, preloadBiomeAssets } from '../bansung/sprites';
import {
  disposeBansungAudio,
  getAudioPrefs,
  initBansungAudio,
  playBansungSfx,
  setAudioPrefs,
  setBansungBgm,
  setListenerPos,
  stopBansungBgm,
  syncBansungMute,
  type BansungAudioPrefs,
  type BansungBgmId,
} from '../bansung/sound';
import { bansungMotion } from '../bansung/motion';
import { bansungFx } from '../bansung/particles';
import { bansungVfx } from '../bansung/vfx';
import { bansungHeroAnim } from '../bansung/anim';
import { useSettings } from '../settings';
import { setMuted } from '../sfx';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { roomPeople } from './Spectators';
import Modal from './Modal';
import { BANSUNG_PING_META, HudBars } from './bansung/HudBars';
import { findNearestWeaponPedestal, HotbarShop } from './bansung/HotbarShop';
import { PostGameModal } from './bansung/PostGameModal';
import '../bansung/bansung.css';

export interface BansungFrameSocketLike {
  on(event: string, listener: (frame: BansungFrame) => void): void;
  off(event: string, listener: (frame: BansungFrame) => void): void;
}

export interface BansungBoardProps {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
  /** Optional socket handle if parent does not centralize `bansung:frame` listener. */
  socket?: BansungFrameSocketLike | null;
}

const PING_QUICK_KINDS: readonly BansungPingKind[] = [
  BANSUNG_PING_HELP,
  BANSUNG_PING_ENEMY,
  BANSUNG_PING_LOOT,
  BANSUNG_PING_REVIVE,
];

const KEYBIND_HELP: ReadonlyArray<readonly [string, string]> = [
  ['Di chuyển', 'WASD / Phím mũi tên'],
  ['Ngắm & Bắn', 'Chuột & Giữ Chuột trái'],
  ['Lướt (Dash)', 'Space / Chuột phải'],
  ['Đổi vũ khí (1-5)', '1–5 hoặc Cuộn chuột'],
  ['Chọn thẻ Gacha khi lên cấp', '1 / 2 / 3'],
  ['Kỹ năng nhân vật', 'Q'],
  ['Nạp đạn / Active Reload', 'R (nhấn lại tại vùng vàng)'],
  ['Nhặt vũ khí / Tương tác', 'E'],
  ['Kho Vũ Khí / Cửa Hàng', 'B'],
  ['Ping chiến thuật', 'G hoặc Chuột giữa'],
  ['Bản đồ Radar / Toàn cảnh', 'M'],
  ['Bảng điểm / Chat / Telemetry', 'Tab / Enter / F3'],
];

function isTextInputEl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function getPreferredReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveLocalPlayer(myIdx: number | undefined, players: ReadonlyMap<number, SnapPlayer>): SnapPlayer | undefined {
  if (myIdx === undefined) return undefined;
  const direct = players.get(myIdx);
  if (direct) return direct;
  for (const p of players.values()) {
    if (p.idx === myIdx) return p;
  }
  return undefined;
}

function formatCdSec(cdMs: number): string {
  if (cdMs <= 0) return '';
  return cdMs >= 1000 ? `${(cdMs / 1000).toFixed(1)}` : `0.${Math.ceil(cdMs / 100)}`;
}

export function BansungBoard({ view, meId, emit, chat, dock, socket }: BansungBoardProps) {
  const settings = useSettings();
  const hudSnapshot = useBansungHud();

  const boardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const moveZoneRef = useRef<HTMLDivElement | null>(null);
  const aimZoneRef = useRef<HTMLDivElement | null>(null);
  const moveStickRef = useRef<HTMLDivElement | null>(null);
  const moveKnobRef = useRef<HTMLDivElement | null>(null);
  const aimStickRef = useRef<HTMLDivElement | null>(null);
  const aimKnobRef = useRef<HTMLDivElement | null>(null);
  const aimTagRef = useRef<HTMLSpanElement | null>(null);
  const telemetryRef = useRef<HTMLPreElement | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [guideOpen, setGuideOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [endModalHidden, setEndModalHidden] = useState(false);
  const [inputMode, setInputMode] = useState<BansungInputMode>(() => bansungInput.getTouchOverride());
  const [touchUi, setTouchUi] = useState(() => bansungInput.getViewState().touchUi);
  const [isAliveLocal, setIsAliveLocal] = useState(() => view.bansung?.myIdx !== undefined);
  const [isDownedLocal, setIsDownedLocal] = useState(false);
  const [audioPrefs, setAudioPrefsState] = useState<BansungAudioPrefs>(() => getAudioPrefs());
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => getPreferredReducedMotion());
  const [assetProgress, setAssetProgress] = useState(() => getAssetLoadProgress());

  const bsView = view.bansung;
  const result = bsView?.result;
  const ended = Boolean(result || view.phase === 'ended');
  const biome: BansungBiome = bsView?.config?.biome ?? hudSnapshot.biome ?? 'desert';
  const gameMode = hudSnapshot.survival?.mode ?? resolveBansungGameMode(bsView?.config);

  const { typingNames, unread } = useChatState(
    chat,
    roomPeople(view),
    meId,
    chatOpen && chatTab === 'chat',
  );

  // Refs synced inside rAF without triggering effect re-subscriptions
  const uiBlockRef = useRef(false);
  const endedRef = useRef(ended);
  const guideOpenRef = useRef(guideOpen);
  const shopOpenRef = useRef(shopOpen);
  const leaveOpenRef = useRef(leaveOpen);
  const chatOpenRef = useRef(chatOpen);
  const scoreboardOpenRef = useRef(scoreboardOpen);
  const inputModeRef = useRef(inputMode);
  const reducedMotionRef = useRef(reducedMotion);
  const telemetryOpenRef = useRef(telemetryOpen);
  const touchUiRef = useRef(touchUi);
  const aliveRef = useRef(isAliveLocal);
  const downedRef = useRef(isDownedLocal);
  const draftOverlayRef = useRef(false);
  const matchResetKeyRef = useRef<string>('');
  const lastBgmKeyRef = useRef<string>('');
  const lastSurvivalStageRef = useRef<string>('');

  endedRef.current = ended;
  guideOpenRef.current = guideOpen;
  shopOpenRef.current = shopOpen;
  leaveOpenRef.current = leaveOpen;
  chatOpenRef.current = chatOpen;
  scoreboardOpenRef.current = scoreboardOpen;
  inputModeRef.current = inputMode;
  reducedMotionRef.current = reducedMotion;
  telemetryOpenRef.current = telemetryOpen;
  uiBlockRef.current = ended || guideOpen || leaveOpen || shopOpen;

  const sendCmd = useCallback(
    (cmd: BansungCommand) => {
      emit('bansung:cmd', cmd);
    },
    [emit],
  );
  const sendCmdRef = useRef(sendCmd);
  sendCmdRef.current = sendCmd;

  // Optional direct socket `bansung:frame` subscription if App delegates it
  useEffect(() => {
    if (!socket) return undefined;
    const onFrame = (frame: BansungFrame) => {
      if (!frame || typeof frame !== 'object') return;
      bansungStore.push(frame);
    };
    socket.on('bansung:frame', onFrame);
    return () => {
      socket.off('bansung:frame', onFrame);
    };
  }, [socket]);

  // Reset store & client visual/FX pools cleanly whenever match identity changes
  useEffect(() => {
    const mapW = bsView?.mapW || BANSUNG_MAP_W;
    const mapH = bsView?.mapH || BANSUNG_MAP_H;
    const sessionKey = `${view.code}:${bsView?.startedAt ?? 0}:${bsView?.myIdx ?? 'spec'}:${mapW}x${mapH}:${biome}`;

    if (matchResetKeyRef.current !== sessionKey) {
      matchResetKeyRef.current = sessionKey;
      lastSurvivalStageRef.current = '';
      setEndModalHidden(false);
      bansungMotion.reset();
      bansungFx.reset(mapW, mapH);
      bansungVfx.reset();
      bansungHeroAnim.reset();
      clearBansungRenderCaches();
    }

    bansungStore.reset(view.code, bsView);
  }, [view.code, bsView, biome]);

  // Asset pipeline + audio graph lifecycle
  useEffect(() => {
    void initBansungAssets();
    const unsubAssets = onBansungAssetLoad(() => {
      setAssetProgress(getAssetLoadProgress());
    });
    void initBansungAudio().catch(() => {});
    syncBansungMute();

    return () => {
      unsubAssets();
      bansungInput.resetAll();
      stopBansungBgm(0.3);
      disposeBansungAudio(false);
      clearBansungRenderCaches();
      bansungMotion.reset();
      bansungVfx.reset();
      bansungHeroAnim.reset();
    };
  }, []);

  // Preload active biome tile/enemy atlases
  useEffect(() => {
    preloadBiomeAssets(biome);
  }, [biome]);

  // Sync global mute preference into shared SFX + Bansung WebAudio bus
  useEffect(() => {
    setMuted(!settings.sound);
    syncBansungMute();
  }, [settings.sound]);

  // Sync OS prefers-reduced-motion updates & propagate to store/motion controller
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  useEffect(() => {
    bansungStore.setReducedMotion(reducedMotion);
    bansungMotion.setReducedScreenShake(reducedMotion);
  }, [reducedMotion]);

  // Dynamic biome/boss/postgame BGM state machine + Survival stage cues
  useEffect(() => {
    let track: BansungBgmId = 'combat';
    let fadeSec = 1.2;
    const isSurvivalBoss = gameMode === 'survival' && hudSnapshot.survival?.stageId === 'boss_hunt';
    if (result) {
      track = result.victory ? 'victory' : 'defeat';
      fadeSec = 0.45;
    } else if (hudSnapshot.wavePhase === 'boss' || Boolean(hudSnapshot.boss) || isSurvivalBoss) {
      track = 'boss';
      fadeSec = 0.45;
    }

    const bgmKey = `${track}:${biome}`;
    if (lastBgmKeyRef.current !== bgmKey) {
      lastBgmKeyRef.current = bgmKey;
      setBansungBgm(track, fadeSec, biome);
    }
  }, [result, hudSnapshot.wavePhase, hudSnapshot.boss, hudSnapshot.survival?.stageId, gameMode, biome]);

  useEffect(() => {
    if (gameMode !== 'survival' || !hudSnapshot.survival || ended) return;
    const stageKey = `${matchResetKeyRef.current}:${hudSnapshot.survival.cycle}:${hudSnapshot.survival.stageId}`;
    if (!lastSurvivalStageRef.current) {
      lastSurvivalStageRef.current = stageKey;
      return;
    }
    if (lastSurvivalStageRef.current === stageKey) return;
    lastSurvivalStageRef.current = stageKey;

    if (hudSnapshot.survival.stageId === 'boss_hunt') {
      playBansungSfx('boss_roar', { local: true, vol: 0.9 });
    } else if (hudSnapshot.survival.stageId === 'evolved_horde') {
      playBansungSfx('wave_start', { local: true, vol: 0.9, pitchMul: 1.12 });
    }
  }, [gameMode, hudSnapshot.survival, ended]);

  // Input mode sync
  useEffect(() => {
    bansungInput.setTouchOverride(inputMode);
    const nextTouch = bansungInput.getViewState().touchUi;
    touchUiRef.current = nextTouch;
    setTouchUi(nextTouch);
  }, [inputMode]);

  // Attach unified desktop + mobile input controller + hotkeys (F3 telemetry, [ / ] spectate)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const stableEmit = (cmd: BansungCommand) => {
      sendCmdRef.current(cmd);
    };

    const detachCanvas = bansungInput.attach(canvas, stableEmit, {
      store: bansungStore,
      touchOverride: inputModeRef.current,
      onUiAction: (action, active) => {
        if (action === 'scoreboard') {
          setScoreboardOpen(Boolean(active));
        } else if (action === 'chat') {
          setChatOpen((open) => !open);
        } else if (action === 'escape') {
          if (guideOpenRef.current) setGuideOpen(false);
          else if (shopOpenRef.current) setShopOpen(false);
          else if (leaveOpenRef.current) setLeaveOpen(false);
          else if (chatOpenRef.current) setChatOpen(false);
          else if (scoreboardOpenRef.current) setScoreboardOpen(false);
          else if (!endedRef.current) setLeaveOpen(true);
        }
      },
    });

    const unbindMove = moveZoneRef.current
      ? bansungInput.bindTouchZone(moveZoneRef.current, 'move')
      : undefined;
    const unbindAim = aimZoneRef.current
      ? bansungInput.bindTouchZone(aimZoneRef.current, 'aim')
      : undefined;

    const onWindowKey = (e: KeyboardEvent) => {
      if (isTextInputEl(e.target) || e.repeat) return;
      if (e.code === 'KeyB' || e.key === 'b' || e.key === 'B') {
        if (!endedRef.current) {
          e.preventDefault();
          setShopOpen((v) => !v);
        }
      } else if (e.code === 'F3') {
        e.preventDefault();
        setTelemetryOpen((v) => !v);
      } else if (!aliveRef.current && (e.key === '[' || e.key === ']')) {
        const delta: 1 | -1 = e.key === ']' ? 1 : -1;
        const nextIdx = bansungStore.spectateCycle(delta);
        if (nextIdx !== null) stableEmit({ t: 'spec', targetIdx: nextIdx });
      }
    };

    window.addEventListener('keydown', onWindowKey);

    return () => {
      window.removeEventListener('keydown', onWindowKey);
      unbindMove?.();
      unbindAim?.();
      detachCanvas();
    };
  }, []);

  // Main 60FPS pixel Canvas loop + DPR sizing + spatial audio listener + touch stick DOM sync
  useEffect(() => {
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!board || !canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    let cssW = Math.max(1, board.clientWidth || window.innerWidth || 1280);
    let cssH = Math.max(1, board.clientHeight || window.innerHeight || 720);
    let dpr = Math.min(RENDER_CFG.DPR_CAP, Math.max(1, window.devicePixelRatio || 1));

    const resizeCanvas = () => {
      const rect = board.getBoundingClientRect();
      cssW = Math.max(1, Math.round(rect.width || window.innerWidth || 1280));
      cssH = Math.max(1, Math.round(rect.height || window.innerHeight || 720));
      dpr = Math.min(RENDER_CFG.DPR_CAP, Math.max(1, window.devicePixelRatio || 1));
      const targetW = Math.max(1, Math.round(cssW * dpr));
      const targetH = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      bansungStore.setViewport(cssW, cssH);
    };

    resizeCanvas();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resizeCanvas);
      ro.observe(board);
    }
    window.addEventListener('resize', resizeCanvas);

    let rafId = 0;
    let lastTelemetryMs = 0;

    const syncTouchDom = (
      stickEl: HTMLDivElement | null,
      knobEl: HTMLDivElement | null,
      stick: { active: boolean; ox: number; oy: number; kx: number; ky: number },
    ) => {
      if (!stickEl || !knobEl) return;
      if (stick.active) {
        if (!stickEl.classList.contains('is-active')) {
          stickEl.classList.add('is-active');
        }
        stickEl.style.left = `${stick.ox}px`;
        stickEl.style.top = `${stick.oy}px`;
        stickEl.style.right = 'auto';
        stickEl.style.bottom = 'auto';
        knobEl.style.transform = `translate3d(${stick.kx - stick.ox}px, ${stick.ky - stick.oy}px, 0)`;
      } else {
        if (stickEl.classList.contains('is-active')) {
          stickEl.classList.remove('is-active');
          stickEl.style.left = '';
          stickEl.style.top = '';
          stickEl.style.right = '';
          stickEl.style.bottom = '';
        }
        knobEl.style.transform = 'translate3d(0, 0, 0)';
      }
    };

    const tick = () => {
      const nowMs = performance.now();
      bansungStore.step(nowMs);

      const localPlayer = resolveLocalPlayer(bansungStore.myIdx, bansungStore.players);
      const localAlive =
        bansungStore.myIdx !== undefined &&
        Boolean(localPlayer) &&
        localPlayer?.state !== BANSUNG_STATE_DEAD;
      const localDowned = localAlive && localPlayer?.state === BANSUNG_STATE_DOWNED;

      if (aliveRef.current !== localAlive) {
        aliveRef.current = localAlive;
        setIsAliveLocal(localAlive);
      }
      if (downedRef.current !== localDowned) {
        downedRef.current = localDowned;
        setIsDownedLocal(localDowned);
      }

      const activeControls = localAlive && !endedRef.current;
      bansungInput.setAlive(activeControls, localDowned);
      bansungInput.setLocalOrigin(bansungStore.localDrawX, bansungStore.localDrawY, bansungStore.cam);

      if (!uiBlockRef.current) {
        bansungInput.flush(nowMs);
      }

      const iv = bansungInput.getViewState();
      if (touchUiRef.current !== iv.touchUi) {
        touchUiRef.current = iv.touchUi;
        setTouchUi(iv.touchUi);
      }

      const listenerX = localAlive ? bansungStore.localDrawX : bansungStore.cam.x;
      const listenerY = localAlive ? bansungStore.localDrawY : bansungStore.cam.y;
      setListenerPos(listenerX, listenerY);

      syncTouchDom(moveStickRef.current, moveKnobRef.current, iv.moveStick);
      syncTouchDom(aimStickRef.current, aimKnobRef.current, iv.aimStick);
      if (aimTagRef.current) {
        const isLocked = iv.autoAimTargetId !== null;
        aimTagRef.current.classList.toggle('is-lock', isLocked);
        aimTagRef.current.textContent = isLocked
          ? 'LOCK'
          : iv.aimStick.manual
            ? 'AIM'
            : 'AUTO';
      }

      const snapped = bansungStore.snappedCam(dpr);
      const cam: CameraState = {
        x: snapped.x,
        y: snapped.y,
        zoom: snapped.zoom,
        shakeX: snapped.shakeX,
        shakeY: snapped.shakeY,
        flashAlpha: 0,
        flashColor: '#ffffff',
      };

      const isBossDark =
        bansungStore.biome === 'crypt' &&
        (bansungStore.wavePhase === 'boss' || Boolean(bansungStore.boss));

      renderBansungScene(ctx, {
        w: cssW,
        h: cssH,
        dpr,
        cam,
        myPlayerId: localPlayer?.id ?? bansungStore.myIdx ?? -1,
        aimWorldX: iv.aimWorldX,
        aimWorldY: iv.aimWorldY,
        dark: isBossDark,
        store: bansungStore,
        nowMs,
        showCrosshair: activeControls && !localDowned && !iv.touchUi && !uiBlockRef.current && !draftOverlayRef.current,
        reducedFlash: reducedMotionRef.current,
        skipStoreStep: true,
        skipAudio: false,
      });

      if (telemetryOpenRef.current && telemetryRef.current && nowMs - lastTelemetryMs >= 180) {
        lastTelemetryMs = nowMs;
        const m = bansungStore.metrics;
        const diag = getRenderDiagnostics();
        telemetryRef.current.textContent =
          `FPS:${m.fps} Delay:${Math.round(m.interpDelayMs)}ms Jitter:${Math.round(m.jitterMs)}ms\n` +
          `Rx:${Math.round(m.rxBps / 1024)}KB/s Tx:${Math.round(m.txBps / 1024)}KB/s Ring:${m.ringCount} Pend:${m.pendingInputs}\n` +
          `Draws:${diag.drawCallsLastFrame} Sort:${diag.sortItemsLastFrame} Chunks:${diag.chunksCached}\n` +
          `Cam:(${Math.round(cam.x)},${Math.round(cam.y)}) z=${cam.zoom.toFixed(2)} ${bansungStore.cam.mode}`;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      ro?.disconnect();
    };
  }, []);

  // Handlers wired to HudBars, HotbarShop, Touch buttons & Spectator controls
  const handlePing = useCallback((kind: BansungPingKind, x: number, y: number) => {
    bansungInput.emitPing(kind, x, y);
  }, []);

  const handleSpectate = useCallback(
    (idx: number) => {
      if (bansungStore.spectatePlayer(idx)) {
        sendCmd({ t: 'spec', targetIdx: idx });
      }
    },
    [sendCmd],
  );

  const handleSpectateCycle = useCallback(
    (delta: 1 | -1) => {
      const nextIdx = bansungStore.spectateCycle(delta);
      if (nextIdx !== null) {
        sendCmd({ t: 'spec', targetIdx: nextIdx });
      }
    },
    [sendCmd],
  );

  const handleSpectateRelock = useCallback(() => {
    const targetIdx = bansungStore.spectateRelock();
    if (targetIdx !== null) {
      sendCmd({ t: 'spec', targetIdx });
    }
  }, [sendCmd]);

  const handleToggleChat = useCallback(() => {
    setChatOpen((v) => !v);
  }, []);

  const handleToggleGuide = useCallback(() => {
    setGuideOpen((v) => !v);
  }, []);

  const handleToggleShop = useCallback(() => {
    setShopOpen((v) => !v);
  }, []);

  const handleOpenLeave = useCallback(() => {
    setLeaveOpen(true);
  }, []);

  const updateAudioPref = useCallback((patch: Partial<BansungAudioPrefs>) => {
    setAudioPrefsState(setAudioPrefs(patch));
  }, []);

  // Nearby contextual interact state for touch [E] button glow
  const touchInteractReady = useMemo(() => {
    const lp = hudSnapshot.localPlayer;
    if (!lp || hudSnapshot.spectating.active || lp.state === BANSUNG_STATE_DEAD || lp.state === BANSUNG_STATE_DOWNED) {
      return false;
    }
    const px = bansungStore.localDrawX || lp.x;
    const py = bansungStore.localDrawY || lp.y;
    if (findNearestWeaponPedestal(bansungStore.pickups, px, py, BANSUNG_PICKUP_CONSTS.R_INTERACT)) {
      return true;
    }
    for (const ally of hudSnapshot.players) {
      if (ally.idx !== hudSnapshot.myIdx && ally.state === BANSUNG_STATE_DOWNED) {
        if (Math.hypot(ally.x - px, ally.y - py) <= BANSUNG_PICKUP_CONSTS.R_INTERACT + 16) {
          return true;
        }
      }
    }
    return false;
  }, [hudSnapshot]);

  const me = hudSnapshot.me;
  const activeWeapon = me?.slots?.[me.slotIdx];
  const canReloadActive = Boolean(activeWeapon && activeWeapon.maxClip > 0);
  const specInfo = hudSnapshot.spectating;
  const biomePalette = BANSUNG_BIOME_PALETTES[biome];
  // Gacha level-up dock lives in the bottom-right corner and NEVER blocks WASD / Aim / Dash / Fire.
  const hasDraftOverlay = Boolean(me?.perkChoices?.length);
  draftOverlayRef.current = hasDraftOverlay;

  // Reset held keys/buttons when modal/draft overlay or post-game ends active play
  useEffect(() => {
    if (ended && shopOpen) {
      setShopOpen(false);
    }
    if (ended || guideOpen || leaveOpen || shopOpen || hasDraftOverlay) {
      bansungInput.resetAll();
    }
  }, [ended, guideOpen, leaveOpen, shopOpen, hasDraftOverlay]);

  const rootClasses = [
    'bs-game',
    inputMode === 'touch' ? 'bs-game--touch' : inputMode === 'desktop' ? 'bs-game--desktop' : '',
    chatOpen ? 'bs-chat-open' : '',
    !ended && !guideOpen && !leaveOpen && !shopOpen && !hasDraftOverlay && isAliveLocal && !isDownedLocal && !touchUi
      ? 'bs-cursor-none'
      : specInfo.active && !ended
        ? 'bs-cursor-spec'
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={boardRef} className={rootClasses} data-biome={biome}>
      <canvas ref={canvasRef} className="bs-canvas" aria-label="Sân đấu Bắn Súng Co-op" />

      {/* Asset preloader progress bar while Tier-1 sprites hydrate */}
      {!assetProgress.ready && assetProgress.total > 0 && !ended && (
        <div className="bs-loading-pill" role="status" aria-live="polite">
          <span>Đang tải sprite ({assetProgress.loaded}/{assetProgress.total})</span>
          <span className="bs-loading-bar">
            <i style={{ width: `${Math.round((assetProgress.loaded / assetProgress.total) * 100)}%` }} />
          </span>
        </div>
      )}

      {/* Mobile Twin-Stick & Action Overlay (auto-hidden on desktop via CSS unless overridden) */}
      <div
        className="bs-touch-layer"
        aria-hidden={!(!ended && isAliveLocal && !specInfo.active && !hasDraftOverlay)}
        style={{
          display: ended || specInfo.active || !isAliveLocal || hasDraftOverlay ? 'none' : undefined,
        }}
      >
        <div ref={moveZoneRef} className="bs-touch-zone bs-touch-zone--move" />
        <div ref={aimZoneRef} className="bs-touch-zone bs-touch-zone--aim" />

        <div ref={moveStickRef} className="bs-touch-stick bs-touch-stick--move">
          <div ref={moveKnobRef} className="bs-touch-knob">
            <Compass size={16} />
          </div>
        </div>

        <div ref={aimStickRef} className="bs-touch-stick bs-touch-stick--aim">
          <div ref={aimKnobRef} className="bs-touch-knob">
            <Crosshair size={18} />
          </div>
          <span ref={aimTagRef} className="bs-touch-stick-tag">
            AUTO
          </span>
        </div>

        <div className="bs-touch-btns">
          <div className="bs-touch-ping-row" role="group" aria-label="Ping nhanh">
            {PING_QUICK_KINDS.map((kind) => {
              const meta = BANSUNG_PING_META[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  className="bs-ping-pill-btn"
                  style={{ color: meta.color }}
                  title={meta.label}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    bansungInput.emitPing(kind);
                  }}
                >
                  {meta.symbol}
                </button>
              );
            })}
          </div>

          {!isDownedLocal && (
            <div className="bs-touch-btns-grid">
              <button
                type="button"
                className="bs-touch-btn bs-touch-btn--skill"
                aria-label="Kỹ năng Q"
                disabled={!me || me.gadget.cdMs > 0 || me.gadget.charges <= 0}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  bansungInput.triggerSkill();
                }}
              >
                <Zap size={16} />
                <span>SKILL</span>
                {me && me.gadget.charges > 0 && (
                  <span className="bs-touch-btn-badge">{me.gadget.charges}</span>
                )}
                {me && me.gadget.cdMs > 0 && (
                  <span className="bs-touch-btn-cd">{formatCdSec(me.gadget.cdMs)}</span>
                )}
              </button>

              <button
                type="button"
                className="bs-touch-btn bs-touch-btn--dash"
                aria-label="Lướt Dash"
                disabled={!me || me.dashCdMs > 0}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  bansungInput.triggerDash();
                }}
              >
                <Wind size={16} />
                <span>DASH</span>
                {me && me.dashCdMs > 0 && (
                  <span className="bs-touch-btn-cd">{formatCdSec(me.dashCdMs)}</span>
                )}
              </button>

              <button
                type="button"
                className="bs-touch-btn bs-touch-btn--reload"
                aria-label="Nạp đạn"
                disabled={!canReloadActive}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  bansungInput.triggerReload();
                }}
              >
                <RotateCw size={15} />
                <span>NẠP</span>
              </button>

              <button
                type="button"
                className={`bs-touch-btn bs-touch-btn--use ${touchInteractReady ? 'is-ready' : ''}`}
                aria-label="Tương tác / Nhặt"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  bansungInput.triggerInteract();
                }}
              >
                <Hand size={15} />
                <span>NHẶT</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pixel HUD Overlay: Hero Card, Active Reload Bar, Squad Strip, Boss Bar, Minimap, Pings */}
      <HudBars
        view={bsView}
        meId={meId}
        dock={dock}
        unreadChat={unread}
        chatOpen={chatOpen}
        guideOpen={guideOpen}
        shopOpen={shopOpen}
        ended={ended}
        onToggleChat={handleToggleChat}
        onToggleGuide={handleToggleGuide}
        onToggleShop={handleToggleShop}
        onLeave={handleOpenLeave}
        onPing={handlePing}
        onSpectate={handleSpectate}
      />

      {/* Bottom 5-Slot Hotbar, Active Reload Strip, Pedestal Swap Prompt, Gacha & Perk Draft Modals */}
      {!ended && (
        <HotbarShop
          snapshot={hudSnapshot}
          input={bansungInput}
          onCommand={sendCmd}
          showReloadBar={false}
          showGachaModal={!ended}
          shopOpen={shopOpen}
          onToggleShop={handleToggleShop}
        />
      )}

      {/* Spectator Navigation Controls */}
      {specInfo.active && !ended && (
        <div className="bs-spec-controls" role="region" aria-label="Điều khiển Khán giả">
          <button
            type="button"
            className="bs-spec-btn"
            disabled={!specInfo.canCycle}
            onClick={() => handleSpectateCycle(-1)}
            title="Người chơi trước ([)"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="bs-spec-label">
            <Eye size={13} />
            <span>{specInfo.targetName || 'Khán giả'}</span>
            <span className="bs-spec-mode-pill">
              {specInfo.mode === 'free' ? 'Tự do' : 'Theo dõi'}
            </span>
          </span>
          {specInfo.mode === 'free' && (
            <button
              type="button"
              className="bs-spec-btn"
              onClick={handleSpectateRelock}
              title="Khóa lại mục tiêu (Space)"
            >
              Khóa lại
            </button>
          )}
          <button
            type="button"
            className="bs-spec-btn"
            disabled={!specInfo.canCycle}
            onClick={() => handleSpectateCycle(1)}
            title="Người chơi tiếp (])"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Chat & Match Log Drawer */}
      {chatOpen && (
        <div className="bs-chat">
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

      {/* F3 Live Network & Render Telemetry */}
      {telemetryOpen && <pre ref={telemetryRef} className="bs-telemetry" />}

      {/* Tab Live Scoreboard Overlay */}
      {scoreboardOpen && !ended && (
        <div
          className="bs-scoreboard-backdrop"
          onClick={() => setScoreboardOpen(false)}
          role="dialog"
          aria-label="Bảng điểm trực tiếp"
        >
          <div className="bs-scoreboard" onClick={(e) => e.stopPropagation()}>
            <div className="bs-scoreboard-head">
              <div className="bs-scoreboard-title">
                <Trophy size={15} />
                <span>
                  {gameMode === 'survival'
                    ? `SINH TỒN · WAVE ${Math.max(1, hudSnapshot.wave)} · LV ${me?.level ?? 1}`
                    : `BẮN SÚNG CO-OP · ĐỢT ${hudSnapshot.wave}/${BANSUNG_TOTAL_WAVES}`}
                </span>
              </div>
              <div className="bs-scoreboard-meta">
                <span className="bs-scoreboard-tag">{biomePalette.name}</span>
                <span className="bs-scoreboard-tag">FPS {hudSnapshot.metrics.fps}</span>
                <span className="bs-scoreboard-tag">
                  Delay {Math.round(hudSnapshot.metrics.interpDelayMs)}ms
                </span>
              </div>
            </div>

            <table className="bs-scoreboard-table">
              <thead>
                <tr>
                  <th>Chiến binh</th>
                  <th>Tướng</th>
                  <th className="num">HP</th>
                  <th className="num">Hạ</th>
                  <th className="num">ST</th>
                  <th className="num">Hồi sinh</th>
                  <th className="num">Xu</th>
                </tr>
              </thead>
              <tbody>
                {hudSnapshot.roster.map((info) => {
                  const snapP = hudSnapshot.players.find((p) => p.idx === info.idx);
                  const heroId = info.hero ?? BANSUNG_HERO_IDS[snapP?.heroIdx ?? 0] ?? 'mascot';
                  const hero = BANSUNG_HEROES[heroId];
                  const isMe = info.id === meId || info.idx === hudSnapshot.myIdx;
                  const dead = snapP?.state === BANSUNG_STATE_DEAD;
                  const downed = snapP?.state === BANSUNG_STATE_DOWNED;
                  const clickable = specInfo.active && !dead;
                  const rowCls = [
                    'bs-scoreboard-row',
                    isMe ? 'is-me' : '',
                    dead ? 'is-dead' : '',
                    downed ? 'is-downed' : '',
                    clickable ? 'is-clickable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <tr
                      key={info.id}
                      className={rowCls}
                      onClick={() => {
                        if (clickable) {
                          handleSpectate(info.idx);
                          setScoreboardOpen(false);
                        }
                      }}
                    >
                      <td>
                        <div className="bs-scoreboard-player">
                          <span
                            className="bs-scoreboard-dot"
                            style={{ background: hero.accentHex }}
                          />
                          <span className="bs-scoreboard-name">{info.name}</span>
                          {isMe && <span className="bs-scoreboard-badge bs-scoreboard-badge--me">Bạn</span>}
                          {info.bot && <span className="bs-scoreboard-badge bs-scoreboard-badge--bot">BOT</span>}
                          {downed && <span className="bs-scoreboard-badge bs-scoreboard-badge--downed">GỤC</span>}
                          {dead && <span className="bs-scoreboard-badge bs-scoreboard-badge--dead">HY SINH</span>}
                        </div>
                      </td>
                      <td>
                        {hero.name}
                        {snapP && snapP.weaponTier > 1 && (
                          <span
                            className="bs-scoreboard-tier"
                            style={{ color: BANSUNG_WEAPON_TIERS[normalizeWeaponTier(snapP.weaponTier)].auraColor }}
                          >
                            {BANSUNG_WEAPON_TIERS[normalizeWeaponTier(snapP.weaponTier)].badge}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {snapP
                          ? `${Math.max(0, Math.round(snapP.hp))}/${isMe && me ? me.maxHp : Math.max(hero.hp * BANSUNG_HERO_STAT_SCALE, Math.round(snapP.hp))}`
                          : '-'}
                      </td>
                      <td className="num">{isMe && me ? me.kills : '-'}</td>
                      <td className="num">{isMe && me ? Math.round(me.damage).toLocaleString('vi-VN') : '-'}</td>
                      <td className="num">{isMe && me ? me.revives : '-'}</td>
                      <td className="num">{isMe && me ? me.coins : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="bs-scoreboard-foot">
              <span>Giữ hoặc nhấn Tab để xem · Nhấn Esc để đóng</span>
              {specInfo.active && <span>Bấm vào đồng đội còn sống để theo dõi góc nhìn</span>}
            </div>
          </div>
        </div>
      )}

      {/* Re-open button when PostGameModal is temporarily dismissed */}
      {ended && endModalHidden && (
        <button
          type="button"
          className="bs-reopen-end-btn"
          onClick={() => setEndModalHidden(false)}
        >
          <Trophy size={15} />
          Xem tổng kết trận đấu
        </button>
      )}

      {/* Post-Game Summary Modal */}
      {ended && !endModalHidden && (
        <PostGameModal
          view={view}
          meId={meId}
          emit={emit}
          result={result}
          onLeave={() => emit('room:leave')}
          onClose={() => setEndModalHidden(true)}
        />
      )}

      {/* Guide, Controls, Audio Mixer & Accessibility Modal */}
      {guideOpen && (
        <Modal
          title="Hướng dẫn & Cài đặt · Bắn Súng Co-op"
          onClose={() => setGuideOpen(false)}
          width={560}
        >
          <div className="bs-guide-body">
            <section className="bs-guide-section">
              <div className="bs-guide-heading">
                <Trophy size={15} />
                <span>Sinh Tồn · Gacha Lên Cấp &amp; Tiến Hóa Súng</span>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Chiến trường mở rộng <b>{BANSUNG_MAP_W}×{BANSUNG_MAP_H}</b> với 5 Đền Vũ Khí và 12 cổng quái.
                Trụ vững qua các đợt quái và Boss leo thang sức mạnh theo thời gian sinh tồn.
              </p>
              <p className="muted small" style={{ margin: 0 }}>
                Nhặt ngọc <b>XP</b> để lên cấp mở <b>Hộp Gacha 3 Thẻ</b> (nhấn <kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd>) tăng sát thương, tốc độ bắn, đa đạn, hồi máu hoặc tiến hóa vũ khí <b>Mk.I → Mk.X</b>.
              </p>
            </section>

            <section className="bs-guide-section">
              <div className="bs-guide-heading">
                <Gamepad2 size={15} />
                <span>Điều khiển PC &amp; Mobile</span>
              </div>
              <div className="bs-guide-keys">
                {KEYBIND_HELP.map(([label, keys]) => (
                  <div key={label} className="bs-guide-key-row">
                    <span>{label}</span>
                    <kbd>{keys}</kbd>
                  </div>
                ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Trên điện thoại: cần trái di chuyển, cần phải giữ để ngắm/bắn kết hợp tự khóa mục tiêu gần nhất. Nhấn lại ô vũ khí đang cầm để nạp đạn nhanh.
              </p>
            </section>

            <section className="bs-guide-section">
              <div className="bs-guide-heading">
                <SlidersHorizontal size={15} />
                <span>Chế độ điều khiển</span>
              </div>
              <div className="bs-guide-seg">
                {(
                  [
                    ['auto', 'Tự động'],
                    ['desktop', 'PC (Chuột/Phím)'],
                    ['touch', 'Cảm ứng (Twin-Stick)'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`bs-guide-seg-btn ${inputMode === mode ? 'is-active' : ''}`}
                    onClick={() => setInputMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="bs-guide-section">
              <div className="bs-guide-heading">
                {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                <span>Âm thanh trận đấu</span>
              </div>
              <label className="bs-guide-slider-row">
                <span>Tổng</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(audioPrefs.master * 100)}
                  onChange={(e) => updateAudioPref({ master: Number(e.target.value) / 100 })}
                />
                <span>{Math.round(audioPrefs.master * 100)}%</span>
              </label>
              <label className="bs-guide-slider-row">
                <span>Hiệu ứng</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(audioPrefs.sfx * 100)}
                  onChange={(e) => updateAudioPref({ sfx: Number(e.target.value) / 100 })}
                />
                <span>{Math.round(audioPrefs.sfx * 100)}%</span>
              </label>
              <label className="bs-guide-slider-row">
                <span>Nhạc nền</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(audioPrefs.bgm * 100)}
                  onChange={(e) => updateAudioPref({ bgm: Number(e.target.value) / 100 })}
                />
                <span>{Math.round(audioPrefs.bgm * 100)}%</span>
              </label>
            </section>

            <section className="bs-guide-section">
              <div className="bs-guide-heading">
                <Shield size={15} />
                <span>Tiện ích & Trợ năng</span>
              </div>
              <label className="bs-guide-toggle-row">
                <span>Giảm rung màn hình & chớp sáng (Reduced Motion)</span>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => setReducedMotion(e.target.checked)}
                />
              </label>
              <label className="bs-guide-toggle-row">
                <span>Hiện thông số mạng / FPS (F3)</span>
                <input
                  type="checkbox"
                  checked={telemetryOpen}
                  onChange={(e) => setTelemetryOpen(e.target.checked)}
                />
              </label>
            </section>

            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setGuideOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Leave Match Confirmation Modal */}
      {leaveOpen && (
        <Modal title="Rời phòng chiến đấu?" onClose={() => setLeaveOpen(false)} width={400}>
          <p className="muted" style={{ marginTop: 0 }}>
            Trận đấu Bắn Súng Co-op vẫn đang diễn ra. Nếu rời phòng lúc này, nhân vật của bạn sẽ thoát khỏi đội hình hiện tại.
          </p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={() => setLeaveOpen(false)}>
              Ở lại chiến tiếp
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setLeaveOpen(false);
                emit('room:leave');
              }}
            >
              <LogOut size={15} /> Rời phòng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default BansungBoard;
