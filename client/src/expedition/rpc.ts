/**
 * Client Socket.IO RPC helper for Astral Expedition Pixel (`exp:*` events).
 */

import type { Socket } from 'socket.io-client';
import {
  EXP_EVT_BATTLE_COMMIT,
  EXP_EVT_BATTLE_START,
  EXP_EVT_BATTLE_RETREAT,
  EXP_EVT_LOAD_PROFILE,
  EXP_EVT_OPEN_CHEST,
  EXP_EVT_REACH_ANCHOR,
  EXP_EVT_SUMMON,
  EXP_EVT_UPDATE_PARTY,
  EXP_EVT_UPGRADE_HERO,
  EXP_EVT_WARP_REALM,
  EXP_EVT_ALLOCATE_STATS,
  EXP_EVT_EQUIP_ITEM,
  EXP_EVT_USE_ELIXIR,
  EXP_EVT_ITEM_SUMMON,
  EXP_EVT_WEAPON_SUMMON,
  EXP_EVT_REFINE_WEAPON,
  EXP_EVT_ENHANCE_ITEM,
  EXP_EVT_SALVAGE_ITEMS,
  EXP_EVT_FEED_EXP,
  EXP_EVT_EQUIP_CHARM,
  EXP_EVT_TREE_UNLOCK,
  EXP_EVT_TREE_RESET,
  EXP_EVT_STORY_SEEN,
  type CharmGain,
  type EncounterKind,
  type BattleSessionState,
  type ExpeditionProfile,
  type ItemInstance,
  type LevelUpReport,
  type RealmMapId,
  type SummonResultItem,
  type TurnActionRecord,
} from '../../../shared/src';

type GatewayAck<T> = { ok: true; result: T } | { ok: false; error?: string };

export function makeReqId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function callGateway<T>(socket: Socket | null, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Đang kết nối máy chủ, vui lòng thử lại sau giây lát.'));
      return;
    }
    socket.timeout(15_000).emit(event, payload ?? {}, (err: Error | null, res?: GatewayAck<T>) => {
      if (err) {
        reject(new Error('Máy chủ phản hồi chậm, vui lòng thử lại.'));
      } else if (!res?.ok) {
        reject(new Error(res?.error || 'Yêu cầu không thành công.'));
      } else {
        resolve(res.result);
      }
    });
  });
}

export const expeditionApi = {
  loadProfile(socket: Socket | null) {
    return callGateway<{ profile: ExpeditionProfile; activeBattle: BattleSessionState | null }>(
      socket,
      EXP_EVT_LOAD_PROFILE,
    );
  },

  reachAnchor(socket: Socket | null, mapId: RealmMapId, anchorId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_REACH_ANCHOR, { mapId, anchorId });
  },

  openChest(socket: Socket | null, mapId: RealmMapId, chestId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_OPEN_CHEST, { mapId, chestId });
  },

  warpRealm(socket: Socket | null, fromMapId: RealmMapId, toMapId: RealmMapId) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_WARP_REALM, { fromMapId, toMapId });
  },

  startBattle(socket: Socket | null, encounterKind: EncounterKind, targetId: string, mapId: RealmMapId) {
    return callGateway<BattleSessionState>(socket, EXP_EVT_BATTLE_START, {
      encounterKind,
      targetId,
      mapId,
    });
  },

  commitBattle(socket: Socket | null, battleId: string, actionLog: readonly TurnActionRecord[]) {
    return callGateway<{
      outcome: 'victory' | 'defeat';
      firstClear: boolean;
      sealReward: number;
      expReward: number;
      unlockedMapId?: RealmMapId;
      drops: ItemInstance[];
      charms?: CharmGain[];
      materials?: Record<string, number>;
      levelUps: LevelUpReport[];
      profile: ExpeditionProfile;
    }>(socket, EXP_EVT_BATTLE_COMMIT, {
      battleId,
      reqId: makeReqId('bcommit'),
      actionLog,
    });
  },

  retreatBattle(socket: Socket | null, battleId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_BATTLE_RETREAT, { battleId });
  },

  summon(socket: Socket | null, count: 1 | 10) {
    return callGateway<{ pulls: SummonResultItem[]; profile: ExpeditionProfile }>(socket, EXP_EVT_SUMMON, {
      count,
      reqId: makeReqId(`sum${count}`),
    });
  },

  updateParty(socket: Socket | null, activeHeroIds: readonly string[], reserveHeroIds?: readonly string[]) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_UPDATE_PARTY, { activeHeroIds, reserveHeroIds });
  },

  upgradeHero(
    socket: Socket | null,
    params: { heroId: string; kind: 'level' | 'skill' | 'exchange_seal' | 'loadout' | 'difficulty' | 'awaken'; skillId?: string; skillIds?: string[]; difficulty?: string; expectedRank?: number },
  ) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_UPGRADE_HERO, params);
  },

  allocateStats(socket: Socket | null, heroId: string, alloc: Record<string, number> | null, reset = false) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_ALLOCATE_STATS, reset ? { heroId, reset: true } : { heroId, alloc });
  },

  equipItem(socket: Socket | null, heroId: string, slot: string, itemUid: string | null) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_EQUIP_ITEM, { heroId, slot, itemUid });
  },

  useElixir(socket: Socket | null, heroId: string, itemUid: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_USE_ELIXIR, { heroId, itemUid });
  },

  itemSummon(socket: Socket | null, count: 1 | 10) {
    return callGateway<{ items: ItemInstance[]; profile: ExpeditionProfile }>(socket, EXP_EVT_ITEM_SUMMON, {
      count,
      reqId: makeReqId(`itm${count}`),
    });
  },

  weaponSummon(socket: Socket | null, count: 1 | 10) {
    return callGateway<{ items: ItemInstance[]; profile: ExpeditionProfile }>(socket, EXP_EVT_WEAPON_SUMMON, {
      count, reqId: makeReqId(`weapon${count}`),
    });
  },

  enhanceItem(socket: Socket | null, itemUid: string, expectedLevel: number) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_ENHANCE_ITEM, { itemUid, expectedLevel });
  },
  refineWeapon(socket: Socket | null, itemUid: string, expectedRank: number) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_REFINE_WEAPON, { itemUid, expectedRank });
  },

  salvageItems(socket: Socket | null, itemUids: string[]) {
    return callGateway<{ gained: number; profile: ExpeditionProfile }>(socket, EXP_EVT_SALVAGE_ITEMS, { itemUids });
  },

  feedExp(socket: Socket | null, heroId: string, crystals: number) {
    return callGateway<{ levelUp: LevelUpReport | null; profile: ExpeditionProfile }>(socket, EXP_EVT_FEED_EXP, { heroId, crystals });
  },

  equipCharm(socket: Socket | null, heroId: string, slotIndex: number, charmId: string | null) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_EQUIP_CHARM, { heroId, slotIndex, charmId });
  },

  unlockTreeNode(socket: Socket | null, heroId: string, nodeId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_TREE_UNLOCK, { heroId, nodeId });
  },

  resetTree(socket: Socket | null, heroId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_TREE_RESET, { heroId });
  },

  markStorySeen(socket: Socket | null, sceneId: string) {
    return callGateway<ExpeditionProfile>(socket, EXP_EVT_STORY_SEEN, { sceneId });
  },
};
