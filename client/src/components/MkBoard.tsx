/**
 * Mighty Knight 2.5D Pixel — Fullscreen Game Board Component (`MkBoard.tsx`).
 * Connects 60 FPS Zero-Blur 640×360 Pixel Renderer, 3-Tier Choreography Engine,
 * 16-Bit Audio, HUD, 4-Skill + Ultimate + Parry Controls, Relic Draft & Upgrade Modals.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_MK_CONFIG,
  normalizeMkConfig,
  type MkCommand,
  type MkRelicId,
  type MkUpgradeTarget,
  type RoomView,
} from '../../../shared/src';
import { resetMkChoreoCache } from '../mk/choreoPlayer';
import { mkInput } from '../mk/input';
import { mkRenderer } from '../mk/render';
import { disposeMkAudio, initMkAudio, stopMkBgm, syncMkMute } from '../mk/sound';
import { getMkAssetProgress, initMkAssets, onMkAssetLoad, preloadMkBiome } from '../mk/sprites';
import { mkStore, useMkHud } from '../mk/store';
import '../mk/mk.css';
import { useSettings } from '../settings';
import { isMuted, setMuted } from '../sfx';
import ChatPanel, { useChatState, type ChatTab, type RoomChat } from './ChatPanel';
import Modal from './Modal';
import { isSpectating, roomPeople } from './Spectators';
import { MkControls } from './mk/MkControls';
import { MkHudTop } from './mk/MkHudTop';
import { MkPartyBar } from './mk/MkPartyBar';
import { MkRelicModal } from './mk/MkRelicModal';
import { MkResultModal } from './mk/MkResultModal';
import { MkUltCutIn } from './mk/MkUltCutIn';
import { MkUpgradeModal, countAffordableMkUpgrades } from './mk/MkUpgradeModal';

export interface MkBoardProps {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

const KEYBIND_HELP: ReadonlyArray<readonly [string, string]> = [
  ['Di chuyển 2.5D', 'WASD / Phím mũi tên / Joystick trái'],
  ['Combo 3 nhịp / Dash-Atk', 'J hoặc Z (Nhấn liên tiếp nối chuỗi 3 đòn)'],
  ['4 Kỹ năng chủ động', 'K · L · I · O (hoặc phím 1 · 2 · 3 · 4)'],
  ['Tuyệt kỹ Ultimate (100% Fury)', 'R (Hiệu ứng Cut-In + Đại chiêu toàn sàn)'],
  ['Đỡ đòn / Perfect Parry', 'E hoặc H (180ms đầu phản sát thương +20 Fury -30% CD!)'],
  ['Lướt né đòn (Dash)', 'Space / Shift (Bất tử 280ms + Dư ảnh pixel)'],
  ['Đổi tướng sang COM', 'Q / Tab hoặc chạm trực tiếp thẻ COM'],
  ['Mở bảng Nâng cấp', 'U (Xem mốc Tiến hóa VFX Lv3 & Lv5)'],
];

export function MkBoard({ view, meId, emit, chat }: MkBoardProps) {
  const settings = useSettings();
  const hud = useMkHud();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTab>('chat');
  const [mutedLocal, setMutedLocal] = useState(() => !settings.sound || isMuted());
  const [resultHidden, setResultHidden] = useState(false);
  const [assetProgress, setAssetProgress] = useState(() => getMkAssetProgress());
  const [kbVec, setKbVec] = useState({ mx: 0, my: 0 });
  const [kbAtk, setKbAtk] = useState(false);

  const spectating = isSpectating(view, meId);
  const ended = view.phase === 'ended' || Boolean(view.mk?.result);
  const isHost = view.hostId === meId;
  const mkCfg = normalizeMkConfig(view.mk?.config ?? DEFAULT_MK_CONFIG, view.players.length);
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');

  const sendCmd = useCallback((cmd: MkCommand) => mkStore.sendCmd(emit, cmd), [emit]);
  const sendCmdRef = useRef(sendCmd);
  sendCmdRef.current = sendCmd;

  const hasRelicDraft = Boolean(!spectating && hud.meFighter?.pendingRelicChoices?.length);
  const uiBlocked = ended || upgradeOpen || guideOpen || leaveOpen || hasRelicDraft;
  const blockedRef = useRef(uiBlocked);
  blockedRef.current = uiBlocked || spectating;

  useEffect(() => {
    mkStore.setMeId(meId);
  }, [meId]);

  useEffect(() => {
    initMkAssets(hud.biome);
    void initMkAudio();
    syncMkMute(!settings.sound);
    const unsub = onMkAssetLoad(() => setAssetProgress(getMkAssetProgress()));
    return () => {
      unsub();
      stopMkBgm();
      disposeMkAudio();
      mkRenderer.reset();
      resetMkChoreoCache();
    };
  }, []);

  useEffect(() => {
    preloadMkBiome(hud.biome);
  }, [hud.biome]);

  useEffect(() => {
    const nextMuted = !settings.sound;
    setMutedLocal(nextMuted);
    syncMkMute(nextMuted);
  }, [settings.sound]);

  useEffect(() => {
    if (ended) setResultHidden(false);
  }, [ended]);

  // 60 FPS Zero-Blur Pixel Render Loop
  useEffect(() => {
    let rafId = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        mkRenderer.render(canvas, mkStore.getRenderView(now), now);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Keyboard & Touch Input Bridge
  useEffect(() => {
    if (spectating) return;
    return mkInput.attach({
      sendCmd: (cmd) => sendCmdRef.current(cmd),
      onToggleUpgrade: () => setUpgradeOpen((v) => !v),
      onVectorChange: (mx, my) => setKbVec({ mx, my }),
      onAttackHoldChange: (holding) => setKbAtk(holding),
      isBlocked: () => blockedRef.current,
    });
  }, [spectating]);

  const affordableCount = useMemo(
    () => countAffordableMkUpgrades(hud.meFighter),
    [hud.meFighter],
  );

  const handleUpgrade = useCallback(
    (target: MkUpgradeTarget) => {
      sendCmd({ t: 'upgrade', target });
    },
    [sendCmd],
  );

  const handlePickRelic = useCallback(
    (relicId: MkRelicId) => {
      sendCmd({ t: 'pick_relic', relicId });
    },
    [sendCmd],
  );

  const handleSwitchCom = useCallback(
    (targetId: string) => {
      sendCmd({ t: 'switch_com', targetId });
    },
    [sendCmd],
  );

  const toggleMute = () => {
    const next = !mutedLocal;
    setMutedLocal(next);
    setMuted(next);
    syncMkMute(next);
  };

  return (
    <div className="mk-board-root">
      <canvas ref={canvasRef} className="mk-canvas mk-pixel" />

      <MkHudTop
        hud={hud}
        affordableCount={affordableCount}
        muted={mutedLocal}
        unreadChat={unread}
        spectating={spectating}
        onToggleUpgrade={() => setUpgradeOpen((v) => !v)}
        onToggleMute={toggleMute}
        onToggleChat={() => setChatOpen((v) => !v)}
        onOpenGuide={() => setGuideOpen(true)}
        onOpenLeave={() => setLeaveOpen(true)}
      />

      <MkPartyBar
        fighters={hud.fighters}
        meFighterId={hud.meFighter?.id}
        allowSwitchCom={mkCfg.allowSwitchCom}
        spectating={spectating}
        onSwitchCom={handleSwitchCom}
      />

      <MkUltCutIn cutIn={hud.activeCutIn} />

      {!assetProgress.ready && (
        <div className="mk-loading-pill">
          Đang tải Pixel Atlas ({assetProgress.loaded}/{assetProgress.total})…
        </div>
      )}

      {!spectating && !ended && (
        <MkControls
          fighter={hud.meFighter}
          disabled={uiBlocked}
          kbVec={kbVec}
          kbAtk={kbAtk}
          onCmd={sendCmd}
        />
      )}

      <MkUpgradeModal
        open={upgradeOpen && !ended}
        fighter={hud.meFighter}
        onUpgrade={handleUpgrade}
        onClose={() => setUpgradeOpen(false)}
      />

      {hasRelicDraft && (
        <MkRelicModal
          fighter={hud.meFighter}
          timeLeftMs={hud.phaseLeftMs}
          onPick={handlePickRelic}
        />
      )}

      {ended && !resultHidden && view.mk?.result && (
        <MkResultModal
          result={view.mk.result}
          isHost={isHost}
          onRestart={() => emit('game:restart')}
          onClose={() => setResultHidden(true)}
        />
      )}

      {chatOpen && (
        <div className="mk-chat-drawer">
          <ChatPanel
            messages={chat.messages}
            meId={meId}
            typingNames={typingNames}
            onSend={chat.send}
            onTyping={chat.onTyping}
            tab={chatTab}
            onTab={setChatTab}
            unread={unread}
            log={view.log}
            logTotal={view.logTotal}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}

      {guideOpen && (
        <Modal title="⚔️ Hướng Dẫn Mighty Knight 2.5D Pixel" onClose={() => setGuideOpen(false)}>
          <div className="mk-guide-list">
            {KEYBIND_HELP.map(([k, v]) => (
              <div key={k} className="mk-guide-row">
                <strong>{k}</strong>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {leaveOpen && (
        <Modal title="Rời khỏi trận đấu?" onClose={() => setLeaveOpen(false)}>
          <p>Bạn có chắc muốn rời khỏi phòng Mighty Knight 2.5D Pixel không?</p>
          <div className="mk-modal-footer">
            <button type="button" className="secondary" onClick={() => setLeaveOpen(false)}>
              Ở lại
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                setLeaveOpen(false);
                emit('room:leave');
              }}
            >
              Rời phòng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default MkBoard;
