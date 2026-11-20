import React, { useCallback, useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { gameUiBridge } from './bridge/GameUiBridge';
import { inputFocusManager } from './bridge/InputFocusManager';
import { retroSfxSynth } from './game/audio/RetroSfxSynth';
import { createEldoriaPhaserGame } from './game/PhaserGameFactory';
import { apiClient } from './network/ApiClient';
import { realtimeClient } from './network/RealtimeClient';
import {
  ModalScreenId,
  useAuthStore,
  useHomesteadStore,
  useHudStore,
  useInventoryStore,
  useProgressionStore,
  useSocialStore,
  useUiModalStore,
} from './stores/gameStores';
import { AuthAndLobbyScreens } from './ui/AuthAndLobbyScreens';
import { CharacterAndGearModals } from './ui/CharacterAndGearModals';
import { ForgeGachaAndWorldModals } from './ui/ForgeGachaAndWorldModals';
import { GameHudOverlay } from './ui/GameHudOverlay';
import { SocialQuestAndSystemModals } from './ui/SocialQuestAndSystemModals';

const KEY_TO_MODAL: Record<string, ModalScreenId> = {
  i: 'INVENTORY',
  c: 'EQUIPMENT',
  p: 'STATS',
  k: 'SKILL_TREE',
  h: 'HERO_COLLECTION',
  g: 'GACHA',
  r: 'BLACKSMITH',
  u: 'ENHANCEMENT',
  v: 'CRAFTING',
  b: 'BUILDING',
  n: 'FARMING',
  j: 'QUESTS',
  m: 'WORLD_MAP',
  o: 'PARTY',
};

export const App: React.FC = () => {
  const screen = useAuthStore((s) => s.screen);
  const setScreen = useAuthStore((s) => s.setScreen);
  const activeCharacterId = useAuthStore((s) => s.activeCharacterId);
  const setActiveCharacterId = useAuthStore((s) => s.setActiveCharacterId);
  const setWsConnected = useAuthStore((s) => s.setWsConnected);
  const preferences = useAuthStore((s) => s.preferences);

  const phaserMountRef = useRef<HTMLDivElement | null>(null);
  const phaserInstanceRef = useRef<Phaser.Game | null>(null);

  const refreshBundle = useCallback(async (charIdOverride?: string) => {
    const cid = charIdOverride || useAuthStore.getState().activeCharacterId;
    if (!cid) return;
    const bundle = await apiClient.request('GET', `/api/v1/characters/${cid}`);
    useProgressionStore.getState().setBundle(bundle);
    useInventoryStore.getState().setInventory(bundle.inventory);
    useHomesteadStore.getState().setHomestead(bundle.homestead);
    useSocialStore.getState().setSocial(bundle.social);
    try {
      const partyRes = await apiClient.request('GET', `/api/v1/characters/${cid}/party`);
      useSocialStore.getState().setParty(partyRes.party);
    } catch {
      // ignore
    }
  }, []);

  const enterWorld = useCallback(
    async (characterId: string) => {
      setActiveCharacterId(characterId);
      setScreen('LOADING');
      await refreshBundle(characterId);
      const char = useProgressionStore.getState().character;
      realtimeClient.connect(characterId, char?.position?.zoneId, (c) => setWsConnected(c));
    },
    [refreshBundle, setActiveCharacterId, setScreen, setWsConnected],
  );

  // Mount Phaser 3 engine during LOADING -> PLAYING
  useEffect(() => {
    if ((screen === 'LOADING' || screen === 'PLAYING') && phaserMountRef.current && !phaserInstanceRef.current) {
      phaserInstanceRef.current = createEldoriaPhaserGame(phaserMountRef.current);
    }
    if (screen === 'LOGIN' && phaserInstanceRef.current) {
      phaserInstanceRef.current.destroy(true);
      phaserInstanceRef.current = null;
      realtimeClient.disconnect();
    }
  }, [screen]);

  // Wire GameUiBridge <-> Zustand Stores
  useEffect(() => {
    const unsubs = [
      gameUiBridge.on('assets:progress', (p) => useHudStore.getState().setLoadProgress(p)),
      gameUiBridge.on('assets:ready', () => {
        if (useAuthStore.getState().screen === 'LOADING') setScreen('PLAYING');
      }),
      gameUiBridge.on('hud:update', (h) => useHudStore.getState().setHud(h)),
      gameUiBridge.on('minimap:update', (m) => useHudStore.getState().setMinimap(m)),
      gameUiBridge.on('chat:message', (msg) => useSocialStore.getState().pushChat(msg)),
      gameUiBridge.on('client:refreshBundle', () => void refreshBundle()),
      gameUiBridge.on('player:died', () => useUiModalStore.getState().openModal('DEATH_RESPAWN')),
      gameUiBridge.on('boss:defeated', (evt) => {
        useProgressionStore.getState().setLastBossReward(evt);
        useUiModalStore.getState().openModal('BOSS_REWARD');
      }),
      gameUiBridge.on('interact:npc', async ({ npcId }) => {
        const dlg = await apiClient.request('GET', `/api/v1/npcs/${npcId}/dialogue`);
        useSocialStore.getState().setActiveNpcDialogue(dlg);
        useUiModalStore.getState().openModal('NPC_DIALOGUE');
      }),
      gameUiBridge.on('build:mode', async (ev) => {
        if (!ev.active && ev.buildingId && ev.buildingId.includes('@')) {
          const [buildingId, coords] = ev.buildingId.split('@');
          const [tx, ty] = coords.split(',').map(Number);
          const cid = useAuthStore.getState().activeCharacterId;
          useHomesteadStore.getState().setPlacingBuildingId(null);
          if (cid) {
            try {
              await apiClient.request('POST', `/api/v1/characters/${cid}/homestead/buildings/place`, {
                buildingId,
                tileX: Math.max(0, Math.min(15, tx)),
                tileY: Math.max(0, Math.min(11, ty)),
              });
              await refreshBundle(cid);
              useHudStore.getState().showToast(`Đã xây dựng ${buildingId} thành công!`);
            } catch (err: any) {
              useHudStore.getState().showToast(`Không thể đặt công trình: ${err.message}`);
            }
          }
        }
      }),
    ];
    return () => {
      for (const u of unsubs) u();
    };
  }, [refreshBundle, setScreen]);

  // Global RPG Hotkeys & LIFO ESC via InputFocusManager (IME-safe!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape') {
        const res = inputFocusManager.handleEscapeKey({
          key: e.key,
          isComposing: e.isComposing,
          keyCode: e.keyCode,
          targetTagName: targetTag,
        });
        if (res.action === 'POPPED_MODAL') {
          const stack = inputFocusManager.getModalStack();
          useUiModalStore.setState({ activeModal: (stack[stack.length - 1] as ModalScreenId) || null });
        } else if (res.action === 'EXITED_BUILD') {
          useHomesteadStore.getState().setPlacingBuildingId(null);
        } else if (res.action === 'OPEN_SETTINGS' && useAuthStore.getState().screen === 'PLAYING') {
          useUiModalStore.getState().openModal('SETTINGS');
        }
        return;
      }

      if (!inputFocusManager.shouldForwardToPhaser({ key: e.key, isComposing: e.isComposing, keyCode: e.keyCode, targetTagName: targetTag })) {
        return;
      }

      const lower = e.key.toLowerCase();
      const modal = KEY_TO_MODAL[lower];
      if (modal) {
        useUiModalStore.getState().openModal(modal);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const scaleCss = preferences.uiScalePct / 100;
  useEffect(() => {
    retroSfxSynth.setVolumePct(preferences.sfxVolume);
  }, [preferences.sfxVolume]);

  return (
    <div
      className={preferences.reducedFlashing ? 'reduced-flashing' : ''}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      {/* Phaser 3 640x360 Pixel-Perfect Canvas Mount */}
      <div
        ref={phaserMountRef}
        id="phaser-canvas-root"
        style={{
          position: 'fixed',
          inset: 0,
          display: screen === 'PLAYING' ? 'block' : 'none',
        }}
      />

      {screen !== 'PLAYING' && <AuthAndLobbyScreens onEnterWorld={enterWorld} />}

      {screen === 'PLAYING' && activeCharacterId && (
        <div style={{ zoom: scaleCss }}>
          <GameHudOverlay />
          <CharacterAndGearModals refreshBundle={() => refreshBundle()} />
          <ForgeGachaAndWorldModals refreshBundle={() => refreshBundle()} />
          <SocialQuestAndSystemModals refreshBundle={() => refreshBundle()} />
        </div>
      )}
    </div>
  );
};
