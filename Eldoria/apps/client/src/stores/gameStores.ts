import { create } from 'zustand';
import {
  ChatMessagePayload,
  UiPreferences,
  UiPreferencesSchema,
} from '@eldoria/shared';
import { HudFrameState, MinimapFrameState } from '../bridge/GameUiBridge';
import { inputFocusManager } from '../bridge/InputFocusManager';

export type ScreenFlow = 'LOGIN' | 'CHAR_SELECT' | 'CHAR_CREATE' | 'LOADING' | 'PLAYING';

export type ModalScreenId =
  | 'INVENTORY'
  | 'EQUIPMENT'
  | 'STATS'
  | 'SKILL_TREE'
  | 'HERO_COLLECTION'
  | 'GACHA'
  | 'BLACKSMITH'
  | 'ENHANCEMENT'
  | 'CRAFTING'
  | 'BUILDING'
  | 'FARMING'
  | 'WORLD_MAP'
  | 'QUESTS'
  | 'NPC_DIALOGUE'
  | 'PARTY'
  | 'BOSS_REWARD'
  | 'SETTINGS'
  | 'DEATH_RESPAWN';

// 1. Auth Store
export const useAuthStore = create<{
  screen: ScreenFlow;
  account: any | null;
  characters: any[];
  activeCharacterId: string | null;
  preferences: UiPreferences;
  wsConnected: boolean;
  setScreen: (s: ScreenFlow) => void;
  setAccount: (acc: any | null) => void;
  setCharacters: (chars: any[]) => void;
  setActiveCharacterId: (id: string | null) => void;
  setPreferences: (p: UiPreferences) => void;
  setWsConnected: (c: boolean) => void;
}>((set) => ({
  screen: 'LOGIN',
  account: null,
  characters: [],
  activeCharacterId: null,
  preferences: UiPreferencesSchema.parse({}),
  wsConnected: false,
  setScreen: (screen) => {
    inputFocusManager.setAuthActive(screen !== 'PLAYING');
    set({ screen });
  },
  setAccount: (account) => set({ account }),
  setCharacters: (characters) => set({ characters }),
  setActiveCharacterId: (activeCharacterId) => set({ activeCharacterId }),
  setPreferences: (preferences) => set({ preferences }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
}));

// 2. HUD & Minimap Store
export const useHudStore = create<{
  hud: HudFrameState;
  minimap: MinimapFrameState;
  loadProgress: { pct: number; label: string };
  skillCooldowns: Record<string, number>;
  toast: string | null;
  setHud: (h: HudFrameState) => void;
  setMinimap: (m: MinimapFrameState) => void;
  setLoadProgress: (p: { pct: number; label: string }) => void;
  setSkillCooldown: (skillId: string, readyAtMs: number) => void;
  showToast: (msg: string) => void;
}>((set) => ({
  hud: {
    zoneId: 'reg_greenhaven_village',
    regionId: 'reg_greenhaven_village',
    timeOfDayPhase: 'DAY',
    weather: 'CLEAR',
    season: 'SPRING',
    playerX: 320,
    playerY: 384,
    hp: 300,
    maxHp: 300,
    mp: 120,
    maxMp: 120,
    stamina: 130,
    maxStamina: 130,
    nearbyPrompt: null,
    bossHud: null,
  },
  minimap: { zoneId: 'reg_greenhaven_village', playerX: 320, playerY: 384, entities: [] },
  loadProgress: { pct: 0, label: 'Đang khởi tạo thế giới pixel Eldoria...' },
  skillCooldowns: {},
  toast: null,
  setHud: (hud) => set({ hud }),
  setMinimap: (minimap) => set({ minimap }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setSkillCooldown: (skillId, readyAtMs) =>
    set((st) => ({ skillCooldowns: { ...st.skillCooldowns, [skillId]: readyAtMs } })),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => {
      set((s) => (s.toast === msg ? { toast: null } : s));
    }, 3200);
  },
}));

// 3. Inventory & Catalog Store
export const useInventoryStore = create<{
  inventory: any | null;
  catalog: any | null;
  enhancementTable: any[];
  setInventory: (inv: any) => void;
  setCatalog: (cat: any) => void;
  setEnhancementTable: (tiers: any[]) => void;
}>((set) => ({
  inventory: null,
  catalog: null,
  enhancementTable: [],
  setInventory: (inventory) => set({ inventory }),
  setCatalog: (catalog) => set({ catalog }),
  setEnhancementTable: (enhancementTable) => set({ enhancementTable }),
}));

// 4. Character Progression & Hero Store
export const useProgressionStore = create<{
  character: any | null;
  computedStats: any | null;
  nextLevelExp: number;
  heroTemplate: any | null;
  activeSkills: any[];
  gachaCatalog: any | null;
  lastBossReward: any | null;
  setBundle: (b: any) => void;
  setGachaCatalog: (g: any) => void;
  setLastBossReward: (r: any) => void;
}>((set) => ({
  character: null,
  computedStats: null,
  nextLevelExp: 145,
  heroTemplate: null,
  activeSkills: [],
  gachaCatalog: null,
  lastBossReward: null,
  setBundle: (b) =>
    set({
      character: b.character,
      computedStats: b.computedStats,
      nextLevelExp: b.nextLevelExp,
      heroTemplate: b.heroTemplate,
      activeSkills: b.activeSkills || [],
    }),
  setGachaCatalog: (gachaCatalog) => set({ gachaCatalog }),
  setLastBossReward: (lastBossReward) => set({ lastBossReward }),
}));

// 5. Homestead & Farming Store
export const useHomesteadStore = create<{
  homestead: any | null;
  placingBuildingId: string | null;
  setHomestead: (h: any) => void;
  setPlacingBuildingId: (id: string | null) => void;
}>((set) => ({
  homestead: null,
  placingBuildingId: null,
  setHomestead: (homestead) => set({ homestead }),
  setPlacingBuildingId: (placingBuildingId) => {
    inputFocusManager.setBuildMode(Boolean(placingBuildingId));
    set({ placingBuildingId });
  },
}));

// 6. Social, Party & Chat Store
export const useSocialStore = create<{
  social: any | null;
  party: any | null;
  chatMessages: ChatMessagePayload[];
  activeNpcDialogue: any | null;
  setSocial: (s: any) => void;
  setParty: (p: any) => void;
  pushChat: (m: ChatMessagePayload) => void;
  setActiveNpcDialogue: (d: any) => void;
}>((set) => ({
  social: null,
  party: null,
  chatMessages: [],
  activeNpcDialogue: null,
  setSocial: (social) => set({ social }),
  setParty: (party) => set({ party }),
  pushChat: (m) =>
    set((st) => {
      if (st.chatMessages.some((x) => x.id === m.id)) return st;
      return { chatMessages: [...st.chatMessages.slice(-49), m] };
    }),
  setActiveNpcDialogue: (activeNpcDialogue) => set({ activeNpcDialogue }),
}));

// 7. UI Modal Stack Store (synced with InputFocusManager)
export const useUiModalStore = create<{
  activeModal: ModalScreenId | null;
  openModal: (m: ModalScreenId) => void;
  closeTopModal: () => void;
  closeAll: () => void;
}>((set) => ({
  activeModal: null,
  openModal: (m) => {
    inputFocusManager.pushModal(m);
    set({ activeModal: m });
  },
  closeTopModal: () => {
    inputFocusManager.popModal();
    const stack = inputFocusManager.getModalStack();
    set({ activeModal: (stack[stack.length - 1] as ModalScreenId) || null });
  },
  closeAll: () => {
    inputFocusManager.clearModals();
    set({ activeModal: null });
  },
}));
