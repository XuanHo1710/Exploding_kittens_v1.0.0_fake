import { Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import {
  DEFAULT_SUMMON_BANNER,
  EXPEDITION_CHARMS_BY_ID,
  EXPEDITION_STORY_BY_ID,
  EXPEDITION_WILD_PACKS_BY_ID,
  TREE_NODES_BY_ID,
  canUnlockTreeNode,
  configuredSkillIds,
  charmSlotsAtLevel,
  rollCharmDrops,
  applyBonfireRest,
  isEncounterDefeated,
  type CharmGain,
  type EncounterKind,
  EXPEDITION_BOSSES_BY_ID,
  EXPEDITION_GATEKEEPERS_BY_ID,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_REALMS_BY_ID,
  EQUIP_SLOTS,
  EXP_BALANCE,
  STAT_KEYS,
  createBattleSession,
  distributeBattleExp,
  expToNextLevel,
  grantHeroExp,
  heroCombatSkillIds,
  normalizeProfile,
  replayAndVerifyBattle,
  resolveItemSummon,
  resolveSummonBatch,
  resolveWeaponSummon,
  weaponRefineCost,
  enhanceCost,
  rollBattleDrops,
  skillLevelCap,
  skillUnlockLevel,
  skillUpgradeCost,
  statPointsUnspent,
  unlockedSkillIds,
  type BattleSessionState,
  type BattleReceipt,
  type ExpeditionProfile,
  type ItemInstance,
  type LevelUpReport,
  type StatKey,
  type RealmMapId,
  type SummonResultItem,
  type TurnActionRecord,
} from '../../../../shared/src';
import { GameError } from '../game';
import { ExpeditionRedisService } from './expedition-redis.service';
import { ExpeditionProfileStore } from './expedition-store';

@Injectable()
export class ExpeditionService {
  private readonly store: ExpeditionProfileStore;
  private readonly perPlayerMutex = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: ExpeditionRedisService) {
    this.store = new ExpeditionProfileStore();
  }

  private async serializePlayer<T>(playerId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.perPlayerMutex.get(playerId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.perPlayerMutex.set(playerId, run);
    return run;
  }

  private profileKey(playerId: string): string {
    return `exp:profile:${playerId}`;
  }

  private battleKey(playerId: string): string {
    return `exp:battle:${playerId}`;
  }

  async getProfile(playerId: string): Promise<{ profile: ExpeditionProfile; activeBattle: BattleSessionState | null }> {
    const cached = await this.redis.getJson<ExpeditionProfile>(this.profileKey(playerId));
    const profile = normalizeProfile(cached ?? (await this.store.loadOrCreate(playerId)));
    if (!cached) {
      await this.redis.setJson(this.profileKey(playerId), profile, 1800);
    }
    const activeBattle = await this.redis.getJson<BattleSessionState>(this.battleKey(playerId));
    return { profile, activeBattle: activeBattle?.battleId === profile.lastBattleReceipt?.battleId ? null : activeBattle };
  }

  private async persistProfile(profile: ExpeditionProfile): Promise<void> {
    await this.store.saveAtomic(profile);
    await this.redis.setJson(this.profileKey(profile.playerId), profile, 1800);
  }

  async reachAnchor(playerId: string, raw: { mapId?: unknown; anchorId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const mapId = String(raw?.mapId ?? '') as RealmMapId;
      const anchorId = String(raw?.anchorId ?? '');
      const realm = EXPEDITION_REALMS_BY_ID[mapId];
      if (!realm) throw new GameError('Bản đồ không tồn tại.');
      const anchor = realm.restAnchors.find((a) => a.anchorId === anchorId);
      if (!anchor) throw new GameError('Cờ Trạm Nghỉ không hợp lệ.');

      const { profile, activeBattle } = await this.getProfile(playerId);
      if (activeBattle || profile.currentMapId !== mapId) {
        throw new GameError('Chỉ có thể nghỉ ở vùng hiện tại và ngoài trận.');
      }

      // Verify any gatekeeper lying strictly before this anchor X coordinate on the map is cleared
      for (const gkId of realm.gatekeeperIds) {
        const gk = EXPEDITION_GATEKEEPERS_BY_ID[gkId];
        if (gk && gk.x < anchor.x && !profile.clearedGatekeepers.includes(gkId)) {
          throw new GameError(`Cần đánh bại ${gk.nameVi} trước khi kích hoạt trạm nghỉ này.`);
        }
      }

      profile.currentMapId = mapId;
      profile.lastRestAnchorId = anchor.anchorId;
      profile.pos = { x: anchor.x, y: anchor.y };
      // nghỉ ở lửa trại: mọi quái đã hạ (trừ Đại Trùm) hồi sinh, vật phẩm trận được nạp lại
      applyBonfireRest(profile, anchor.anchorId);
      await this.persistProfile(profile);
      return profile;
    });
  }

  async openChest(playerId: string, raw: { mapId?: unknown; chestId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const mapId = String(raw?.mapId ?? '') as RealmMapId;
      const chestId = String(raw?.chestId ?? '');
      const realm = EXPEDITION_REALMS_BY_ID[mapId];
      const chest = realm?.chests.find((c) => c.chestId === chestId);
      if (!realm || !chest) throw new GameError('Rương báu không hợp lệ.');

      const { profile, activeBattle } = await this.getProfile(playerId);
      if (activeBattle || profile.currentMapId !== mapId) throw new GameError('Chỉ có thể mở rương ở vùng hiện tại và ngoài trận.');
      if (realm.gatekeeperIds.some((id) => EXPEDITION_GATEKEEPERS_BY_ID[id].x < chest.x && !profile.clearedGatekeepers.includes(id))) {
        throw new GameError('Cần đánh bại Quái Gác Cổng trên đường đến rương.');
      }
      if (profile.openedChests.includes(chestId)) return profile;

      profile.openedChests.push(chestId);
      profile.astralSeal += chest.astralSealReward;
      profile.expCrystal += chest.expCrystalReward;
      await this.persistProfile(profile);
      return profile;
    });
  }

  async warpRealm(playerId: string, raw: { fromMapId?: unknown; toMapId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const fromMapId = String(raw?.fromMapId ?? '') as RealmMapId;
      const toMapId = String(raw?.toMapId ?? '') as RealmMapId;
      const fromRealm = EXPEDITION_REALMS_BY_ID[fromMapId];
      const toRealm = EXPEDITION_REALMS_BY_ID[toMapId];
      if (!fromRealm || !toRealm) throw new GameError('Cổng dịch chuyển vùng không hợp lệ.');

      const { profile, activeBattle } = await this.getProfile(playerId);
      if (activeBattle || profile.currentMapId !== fromMapId) throw new GameError('Hãy dùng cổng của vùng hiện tại sau khi kết thúc trận.');
      const exit = fromRealm.exitPortal;
      if (exit?.toMapId === toMapId) {
        if (!profile.clearedBosses.includes(exit.requiresBossId)) {
          throw new GameError('Hãy đánh bại Đại Trùm canh giữ vùng hiện tại để mở cổng tiếp theo.');
        }
        if (!profile.unlockedMaps.includes(toMapId)) {
          profile.unlockedMaps.push(toMapId);
        }
      } else if (fromRealm.backPortal?.toMapId !== toMapId || !profile.unlockedMaps.includes(toMapId)) {
        throw new GameError('Cổng này không nối tới vùng đích.');
      }

      profile.currentMapId = toMapId;
      profile.pos = { ...toRealm.spawn };
      profile.lastRestAnchorId = toRealm.restAnchors[0].anchorId;
      await this.persistProfile(profile);
      return profile;
    });
  }

  async startBattle(
    playerId: string,
    raw: { encounterKind?: unknown; targetId?: unknown; mapId?: unknown },
  ): Promise<BattleSessionState> {
    return this.serializePlayer(playerId, async () => {
      const encounterKind: EncounterKind =
        raw?.encounterKind === 'boss' ? 'boss' : raw?.encounterKind === 'wild' ? 'wild' : 'gatekeeper';
      const targetId = String(raw?.targetId ?? '');
      const mapId = String(raw?.mapId ?? '') as RealmMapId;
      const realm = EXPEDITION_REALMS_BY_ID[mapId];
      if (!realm) throw new GameError('Bản đồ trận đấu không hợp lệ.');

      const { profile, activeBattle } = await this.getProfile(playerId);
      if (!profile.unlockedMaps.includes(mapId) || profile.currentMapId !== mapId) {
        throw new GameError('Hãy vào đúng vùng trước khi bắt đầu trận.');
      }
      if (activeBattle) {
        if (activeBattle.mapId === mapId && activeBattle.encounterKind === encounterKind && activeBattle.targetId === targetId) return activeBattle;
        throw new GameError('Hãy hoàn thành trận đang diễn ra trước.');
      }

      if (encounterKind === 'wild') {
        const pack = EXPEDITION_WILD_PACKS_BY_ID[targetId];
        if (!pack || pack.mapId !== mapId) throw new GameError('Đàn quái không tồn tại ở vùng này.');
        if (isEncounterDefeated(profile, targetId)) throw new GameError('Đàn quái này đã bị hạ. Hãy nghỉ ở Trạm lửa trại để quái hồi sinh.');
      }
      if (encounterKind === 'gatekeeper') {
        const gk = EXPEDITION_GATEKEEPERS_BY_ID[targetId];
        if (!gk || gk.mapId !== mapId) throw new GameError('Quái Gác Cổng không tồn tại ở vùng này.');
        if (isEncounterDefeated(profile, targetId)) throw new GameError(`${gk.nameVi} đã bị hạ. Hãy nghỉ ở Trạm lửa trại để nó hồi sinh.`);
      }
      if (encounterKind === 'boss') {
        for (const gkId of realm.gatekeeperIds) {
          if (!profile.clearedGatekeepers.includes(gkId)) {
            throw new GameError('Cần vượt qua toàn bộ Quái Gác Cổng trong vùng trước khi khiêu chiến Đại Trùm.');
          }
        }
      }

      const battleSeed = randomInt(1, 0x7fffffff);
      const session = createBattleSession({
        battleId: randomUUID(),
        battleSeed,
        profile,
        encounterKind,
        targetId,
        mapId,
      });

      await this.redis.setJson(this.battleKey(playerId), session, 7200);
      return session;
    });
  }

  async commitBattle(
    playerId: string,
    raw: { battleId?: unknown; reqId?: unknown; actionLog?: unknown },
  ): Promise<BattleReceipt & { profile: ExpeditionProfile }> {
    const reqId = String(raw?.reqId ?? '').slice(0, 80);
    if (!reqId) throw new GameError('Thiếu mã xác nhận giao dịch trận đấu.');
    return this.serializePlayer(playerId, async () => {
      const { profile, activeBattle: active } = await this.getProfile(playerId);
      if (profile.lastBattleReceipt && profile.lastBattleReceipt.battleId === raw?.battleId) {
        return { ...profile.lastBattleReceipt, profile };
      }
      if (!active || active.battleId !== raw?.battleId) {
        throw new GameError('Phiên trận đấu không tồn tại hoặc đã được quyết toán.');
      }
      const lockOk = await this.redis.acquireLock(`exp:lock:${playerId}:battle:${reqId}`, 10_000);
      if (!lockOk) throw new GameError('Đang xử lý kết quả trận đấu, vui lòng đợi.');

      let verified: { outcome: 'victory' | 'defeat'; finalSession: BattleSessionState };
      try {
        verified = replayAndVerifyBattle({
          battleId: active.battleId,
          battleSeed: active.battleSeed,
          profile,
          encounterKind: active.encounterKind,
          targetId: active.targetId,
          mapId: active.mapId,
          actionLog: raw?.actionLog as TurnActionRecord[],
          initialSession: active,
        });
      } catch (err) {
        throw new GameError((err as Error).message || 'Nhật ký trận đấu không hợp lệ.');
      }

      let firstClear = false;
      let sealReward = 0;
      let expReward = 0;
      let unlockedMapId: RealmMapId | undefined;
      let drops: ItemInstance[] = [];
      let levelUps: LevelUpReport[] = [];
      let charms: CharmGain[] = [];
      const realmOrder = EXPEDITION_REALMS_BY_ID[active.mapId]?.order ?? 1;
      const rand = () => randomInt(0, 1_000_000) / 1_000_000;
      profile.supplies = { ...verified.finalSession.supplies };

      if (verified.outcome === 'victory') {
        const reward = active.encounterKind === 'boss' ? 'revive' : rand() < .35 ? 'spark' : 'tonic';
        profile.supplies[reward] = Math.min(30, (profile.supplies[reward] ?? 0) + 1);
        const minionsKilled = verified.finalSession.combatants.filter((c) => c.side === 'enemy' && c.isMinion && !c.alive).length;
        if (active.encounterKind === 'wild') {
          const w = EXP_BALANCE.wild;
          const n = Math.max(1, minionsKilled);
          expReward = Math.round(n * (w.expPerEnemyBase + w.expPerEnemyPerRealm * realmOrder));
          profile.expCrystal += n * w.crystalPerEnemy;
          profile.wildWins = (profile.wildWins ?? 0) + 1;
          profile.defeatedSinceRest = [...new Set([...(profile.defeatedSinceRest ?? []), active.targetId])];
        } else if (active.encounterKind === 'gatekeeper') {
          const gk = EXPEDITION_GATEKEEPERS_BY_ID[active.targetId];
          if (gk) {
            firstClear = !profile.clearedGatekeepers.includes(gk.gkId);
            profile.defeatedSinceRest = [...new Set([...(profile.defeatedSinceRest ?? []), gk.gkId])];
            if (firstClear) {
              profile.clearedGatekeepers.push(gk.gkId);
              sealReward = gk.firstClearAstralSeal;
              expReward = gk.expReward;
            } else {
              expReward = Math.round(gk.expReward * EXP_BALANCE.economy.repeatExpShare);
            }
          }
        } else {
          const boss = EXPEDITION_BOSSES_BY_ID[active.targetId];
          if (boss) {
            firstClear = !profile.clearedBosses.includes(boss.bossId);
            if (firstClear) {
              profile.clearedBosses.push(boss.bossId);
              sealReward = boss.firstClearAstralSeal;
              expReward = boss.expReward;
              if (boss.unlocksMapId && !profile.unlockedMaps.includes(boss.unlocksMapId)) {
                profile.unlockedMaps.push(boss.unlocksMapId);
                unlockedMapId = boss.unlocksMapId;
              }
            } else {
              sealReward = EXP_BALANCE.economy.repeatSealBoss;
              expReward = Math.round(boss.expReward * EXP_BALANCE.economy.repeatExpShare);
            }
          }
        }

        // loot: items + bonus seals (rates in balance.ts -> EXP_BALANCE.drops)
        const loot = rollBattleDrops({
          profile,
          encounterKind: active.encounterKind,
          realmOrder,
          repeat: !firstClear,
          rand,
        });
        // Bùa Hộ Mệnh (rates in balance.ts -> EXP_BALANCE.charms)
        charms = rollCharmDrops({ profile, encounterKind: active.encounterKind, realmOrder, firstClear, minionsKilled, rand });
        const room = EXP_BALANCE.equipment.inventoryLimit - (profile.inventory?.length ?? 0);
        drops = loot.items.slice(0, Math.max(0, room));
        profile.inventory = [...(profile.inventory ?? []), ...drops];
        sealReward += loot.seal;

        profile.astralSeal += sealReward;
        profile.expCrystal += Math.round(expReward * 0.5);
        levelUps = distributeBattleExp(profile, expReward);
      } else {
        // Safe respawn at last RestAnchor (>= 6 tiles away from all Gatekeepers)
        const realm = EXPEDITION_REALMS_BY_ID[profile.currentMapId] ?? EXPEDITION_REALMS_BY_ID['01-dawn-meadow'];
        const anchor =
          realm.restAnchors.find((a) => a.anchorId === profile.lastRestAnchorId) ?? realm.restAnchors[0];
        profile.pos = { x: anchor.x, y: anchor.y };
        profile.lastRestAnchorId = anchor.anchorId;
      }

      const receipt: BattleReceipt = {
        battleId: active.battleId,
        outcome: verified.outcome,
        firstClear,
        sealReward,
        expReward,
        unlockedMapId,
        drops,
        charms,
        levelUps,
      };
      profile.lastBattleReceipt = receipt;
      await this.persistProfile(profile);
      await this.redis.del(this.battleKey(playerId));
      return { ...receipt, profile };
    });
  }

  // ------------------------------------------------------------ progression

  private heroOf(profile: ExpeditionProfile, heroId: string) {
    const hero = profile.heroes[heroId];
    const def = EXPEDITION_HEROES_BY_ID[heroId];
    if (!hero || !def) throw new GameError('Anh Hùng không tồn tại trong bộ sưu tập.');
    return { hero, def };
  }

  /** Cộng / tẩy điểm chỉ số. body: { heroId, alloc: {stat: +n}, reset?: true } */
  async allocateStats(playerId: string, raw: { heroId?: unknown; alloc?: unknown; reset?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      if (raw?.reset === true) {
        const cost = EXP_BALANCE.statPoints.resetCostSeal;
        if (profile.astralSeal < cost) throw new GameError(`Cần ${cost} Ấn Tinh Tú để tẩy điểm.`);
        profile.astralSeal -= cost;
        hero.statAlloc = {};
      } else {
        const alloc = (raw?.alloc ?? {}) as Record<string, unknown>;
        let total = 0;
        const add: Partial<Record<StatKey, number>> = {};
        for (const [k, v] of Object.entries(alloc)) {
          if (!(STAT_KEYS as readonly string[]).includes(k)) throw new GameError('Chỉ số không hợp lệ.');
          const n = Math.floor(Number(v));
          if (!Number.isFinite(n) || n < 0 || n > 999) throw new GameError('Số điểm không hợp lệ.');
          add[k as StatKey] = n;
          total += n;
        }
        if (total <= 0) throw new GameError('Chưa chọn điểm để cộng.');
        const free = statPointsUnspent(hero);
        if (total > free) throw new GameError(`Chỉ còn ${free} điểm chưa cộng.`);
        hero.statAlloc ??= {};
        for (const [k, n] of Object.entries(add)) {
          hero.statAlloc[k as StatKey] = (hero.statAlloc[k as StatKey] ?? 0) + (n ?? 0);
        }
      }
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Mặc / tháo trang bị. body: { heroId, slot, itemUid | null } */
  async equipItem(playerId: string, raw: { heroId?: unknown; slot?: unknown; itemUid?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      const slot = String(raw?.slot ?? '') as (typeof EQUIP_SLOTS)[number];
      if (!(EQUIP_SLOTS as readonly string[]).includes(slot)) throw new GameError('Ô trang bị không hợp lệ.');
      hero.equipment ??= {};
      const inv = profile.inventory ?? [];
      const item = raw?.itemUid ? inv.find((i) => i.uid === String(raw.itemUid)) : undefined;
      if (raw?.itemUid && (!item || item.kind !== 'equipment')) throw new GameError('Trang bị không tồn tại.');
      if (item && item.slot !== slot) throw new GameError('Trang bị không hợp với ô này.');
      if (item?.signatureId && item.signatureId !== hero.heroId) throw new GameError('Vũ khí trấn chỉ dùng được cho chủ nhân.');
      const prevUid = hero.equipment[slot];
      if (prevUid) {
        const prev = inv.find((i) => i.uid === prevUid);
        if (prev) delete prev.equippedBy;
        delete hero.equipment[slot];
      }
      if (item) {
        if (item.equippedBy && item.equippedBy !== hero.heroId) {
          const other = profile.heroes[item.equippedBy];
          if (other?.equipment) delete other.equipment[slot];
        }
        item.equippedBy = hero.heroId;
        hero.equipment[slot] = item.uid;
      }
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Dùng thuốc chỉ số (cộng vĩnh viễn). body: { heroId, itemUid } */
  async useElixir(playerId: string, raw: { heroId?: unknown; itemUid?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      const inv = profile.inventory ?? [];
      const idx = inv.findIndex((i) => i.uid === String(raw?.itemUid ?? ''));
      const item = inv[idx];
      if (!item || item.kind !== 'elixir' || !item.elixir) throw new GameError('Thuốc chỉ số không tồn tại.');
      if ((hero.elixirUses ?? 0) >= EXP_BALANCE.elixirs.maxUsesPerHero) {
        throw new GameError(`Anh Hùng đã dùng tối đa ${EXP_BALANCE.elixirs.maxUsesPerHero} bình thuốc.`);
      }
      hero.elixirBonus ??= {};
      const st = item.elixir.stat;
      hero.elixirBonus[st] = +((hero.elixirBonus[st] ?? 0) + item.elixir.value).toFixed(4);
      hero.elixirUses = (hero.elixirUses ?? 0) + 1;
      inv.splice(idx, 1);
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Phân rã đồ -> Tinh Thể EXP. body: { itemUids: string[] } */
  async salvageItems(playerId: string, raw: { itemUids?: unknown }): Promise<{ gained: number; profile: ExpeditionProfile }> {
    return this.serializePlayer(playerId, async () => {
      if (!Array.isArray(raw?.itemUids) || raw.itemUids.length === 0 || raw.itemUids.length > 300) {
        throw new GameError('Danh sách phân rã không hợp lệ.');
      }
      const uids = new Set(raw.itemUids.map(String));
      const { profile } = await this.getProfile(playerId);
      let gained = 0;
      profile.inventory = (profile.inventory ?? []).filter((it) => {
        if (!uids.has(it.uid) || it.equippedBy || it.locked || it.signatureId) return true;
        gained += EXP_BALANCE.equipment.salvageExpCrystal[it.rarity];
        return false;
      });
      profile.expCrystal += gained;
      await this.persistProfile(profile);
      return { gained, profile };
    });
  }

  /** Gacha trang bị (Rương Thiên Văn). body: { count: 1 | 10, reqId } */
  async itemSummon(playerId: string, raw: { count?: unknown; reqId?: unknown }): Promise<{ items: ItemInstance[]; profile: ExpeditionProfile }> {
    const count = raw?.count === 10 ? 10 : raw?.count === 1 ? 1 : null;
    if (!count) throw new GameError('Chỉ hỗ trợ mở 1 hoặc 10 rương.');
    const reqId = String(raw?.reqId ?? '').slice(0, 80);
    if (!reqId) throw new GameError('Thiếu mã chống trùng lượt mở rương.');
    const lockOk = await this.redis.acquireLock(`exp:lock:${playerId}:itemsum:${reqId}`, 10_000);
    if (!lockOk) throw new GameError('Lượt mở rương này đang được xử lý.');
    return this.serializePlayer(playerId, async () => {
      const { profile } = await this.getProfile(playerId);
      let items: ItemInstance[];
      try {
        items = resolveItemSummon(profile, count, () => randomInt(0, 1_000_000) / 1_000_000);
      } catch (err) {
        throw new GameError((err as Error).message);
      }
      profile.inventory = [...(profile.inventory ?? []), ...items];
      await this.persistProfile(profile);
      return { items, profile };
    });
  }

  /** Bón Tinh Thể EXP cho anh hùng. body: { heroId, crystals } */
  /** Cân bằng: EXP chỉ đến từ chiến đấu; Tinh Thể EXP dùng để nâng kỹ năng, không mua cấp. */
  async feedExp(_playerId: string, _raw: { heroId?: unknown; crystals?: unknown }): Promise<{ levelUp: LevelUpReport | null; profile: ExpeditionProfile }> {
    throw new GameError('Anh Hùng chỉ lên cấp bằng cách chiến đấu.');
  }

  async weaponSummon(playerId: string, raw: { count?: unknown; reqId?: unknown }): Promise<{ items: ItemInstance[]; profile: ExpeditionProfile }> {
    const count = raw.count === 1 || raw.count === 10 ? raw.count : null;
    if (!count || typeof raw.reqId !== 'string' || !/^[\w-]{1,80}$/.test(raw.reqId)) throw new GameError('Lượt triệu hồi vũ khí không hợp lệ.');
    const receipt = `weapon:${raw.reqId}`;
    return this.serializePlayer(playerId, async () => {
      const { profile } = await this.getProfile(playerId);
      if (profile.completedSummons?.includes(receipt)) throw new GameError('Lượt triệu hồi này đã xử lý.');
      let items: ItemInstance[];
      try {
        items = resolveWeaponSummon(profile, count, () => randomInt(0, 1_000_000) / 1_000_000);
      } catch (error) {
        throw new GameError((error as Error).message);
      }
      profile.completedSummons = [receipt, ...(profile.completedSummons ?? [])].slice(0, 256);
      await this.persistProfile(profile);
      return { items, profile };
    });
  }

  /** Cường hoá vũ khí / giáp +1 (tối đa +10): trừ Ấn Tinh Tú + Tinh Thể EXP, tăng 8% chỉ số mỗi cấp. */
  async enhanceItem(playerId: string, raw: { itemUid?: unknown; expectedLevel?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const item = profile.inventory?.find((it) => it.uid === raw?.itemUid);
      if (!item || item.kind !== 'equipment') throw new GameError('Không tìm thấy trang bị.');
      if ((item.enhance ?? 0) !== Number(raw?.expectedLevel ?? 0)) throw new GameError('Cấp cường hoá đã thay đổi.');
      const cost = enhanceCost(item);
      if (!cost) throw new GameError('Đã cường hoá tối đa +10.');
      if (profile.astralSeal < cost.seal || profile.expCrystal < cost.crystal) {
        throw new GameError(`Cần ${cost.seal} Ấn Tinh Tú và ${cost.crystal} Tinh Thể EXP.`);
      }
      profile.astralSeal -= cost.seal;
      profile.expCrystal -= cost.crystal;
      item.enhance = (item.enhance ?? 0) + 1;
      await this.persistProfile(profile);
      return profile;
    });
  }

  async refineWeapon(playerId: string, raw: { itemUid?: unknown; expectedRank?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const item = profile.inventory?.find((weapon) => weapon.uid === raw.itemUid);
      if (!item?.signatureId) throw new GameError('Chưa sở hữu vũ khí trấn này.');
      const rank = item.refineRank ?? 1;
      if (rank !== raw.expectedRank) throw new GameError('Bậc vũ khí đã thay đổi.');
      const cost = weaponRefineCost(item);
      if (!cost) throw new GameError('Vũ khí đã đạt bậc tối đa.');
      if ((item.weaponShards ?? 0) < cost) throw new GameError(`Cần ${cost} mảnh trùng vũ khí.`);
      item.weaponShards = (item.weaponShards ?? 0) - cost;
      item.refineRank = rank + 1;
      await this.persistProfile(profile);
      return profile;
    });
  }

  async summon(
    playerId: string,
    raw: { count?: unknown; reqId?: unknown },
  ): Promise<{ pulls: SummonResultItem[]; profile: ExpeditionProfile }> {
    const count = raw?.count === 10 ? 10 : raw?.count === 1 ? 1 : null;
    if (!count) throw new GameError('Số lượt Triệu Hồi chỉ hỗ trợ 1 hoặc 10.');
    const reqId = String(raw?.reqId ?? '').slice(0, 80);
    if (!reqId) throw new GameError('Thiếu mã chống trùng lượt Triệu Hồi.');

    const lockOk = await this.redis.acquireLock(`exp:lock:${playerId}:summon:${reqId}`, 10_000);
    if (!lockOk) throw new GameError('Lượt Triệu Hồi này đang được xử lý.');

    return this.serializePlayer(playerId, async () => {
      const { profile } = await this.getProfile(playerId);
      let pulls: SummonResultItem[];
      const receipt = `hero:${reqId}`;
      if (profile.completedSummons?.includes(receipt)) throw new GameError('Lượt Triệu Hồi này đã được xử lý.');
      try {
        pulls = resolveSummonBatch(
          profile,
          count,
          () => randomInt(0, 1_000_000) / 1_000_000,
          DEFAULT_SUMMON_BANNER,
        );
      } catch (err) {
        throw new GameError((err as Error).message);
      }
      profile.completedSummons = [receipt, ...(profile.completedSummons ?? [])].slice(0, 256);
      await this.persistProfile(profile);
      return { pulls, profile };
    });
  }

  async updateParty(playerId: string, raw: { activeHeroIds?: unknown; reserveHeroIds?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const activeBattle = await this.redis.getJson<BattleSessionState>(this.battleKey(playerId));
      if (activeBattle && activeBattle.state !== 'VICTORY' && activeBattle.state !== 'DEFEAT') {
        throw new GameError('Không thể đổi Đội Hình khi đang ở giữa trận giao tranh.');
      }
      if (!Array.isArray(raw?.activeHeroIds) || raw.activeHeroIds.length < 1 || raw.activeHeroIds.length > 4) {
        throw new GameError('Đội hình ra trận cần từ 1 đến 4 Anh Hùng.');
      }
      const ids = raw.activeHeroIds.map((x) => String(x));
      if (new Set(ids).size !== ids.length) {
        throw new GameError('Không thể xếp trùng 1 Anh Hùng ở nhiều vị trí.');
      }

      const { profile } = await this.getProfile(playerId);
      if (raw.reserveHeroIds !== undefined && (!Array.isArray(raw.reserveHeroIds) || raw.reserveHeroIds.length > 4)) {
        throw new GameError('Đội dự bị có tối đa 4 Anh Hùng.');
      }
      const reserves = Array.isArray(raw.reserveHeroIds) ? raw.reserveHeroIds.map(String) : (profile.reserveParty ?? []).filter((id) => !ids.includes(id));
      if (new Set([...ids, ...reserves]).size !== ids.length + reserves.length) throw new GameError('Một Anh Hùng chỉ có thể ở một đội.');
      for (const id of [...ids, ...reserves]) {
        if (!profile.heroes[id] || !EXPEDITION_HEROES_BY_ID[id]) {
          throw new GameError('Anh Hùng chưa được mở khóa trong bộ sưu tập.');
        }
      }
      profile.activeParty = ids;
      profile.reserveParty = reserves;
      await this.persistProfile(profile);
      return profile;
    });
  }

  async upgradeHero(
    playerId: string,
    raw: { heroId?: unknown; kind?: unknown; skillId?: unknown; skillIds?: unknown; difficulty?: unknown; expectedRank?: unknown },
  ): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const heroId = String(raw?.heroId ?? '');
      const kind = String(raw?.kind ?? '');
      const { profile } = await this.getProfile(playerId);
      const hero = profile.heroes[heroId];
      const def = EXPEDITION_HEROES_BY_ID[heroId];
      if (!hero || !def) throw new GameError('Anh Hùng không tồn tại trong bộ sưu tập.');

      if (kind === 'awaken') {
        await this.assertNotInBattle(playerId);
        if (hero.awakeningRank !== raw.expectedRank) throw new GameError('Bậc thức tỉnh đã thay đổi.');
        if (hero.awakeningRank >= 6) throw new GameError('Anh Hùng đã đạt A6.');
        if (hero.shards < 1) throw new GameError('Cần một mảnh của chính Anh Hùng này.');
        hero.shards -= 1;
        hero.awakeningRank += 1;
      } else if (kind === 'level') {
        // Cân bằng: chỉ lên cấp bằng EXP chiến đấu, không mua cấp bằng Tinh Thể.
        throw new GameError('Anh Hùng chỉ lên cấp bằng cách chiến đấu.');
      } else if (kind === 'loadout') {
        if (!Array.isArray(raw.skillIds) || raw.skillIds.length > 6) throw new GameError('Tối đa 6 kỹ năng.');
        const learned = unlockedSkillIds(def, hero.level);
        const requested = raw.skillIds.map(String);
        const equipped = configuredSkillIds(def, { ...hero, equippedSkillIds: requested }, learned);
        if (equipped.length !== requested.length) throw new GameError('Danh sách có kỹ năng trùng hoặc chưa mở.');
        hero.equippedSkillIds = equipped;
      } else if (kind === 'difficulty') {
        const difficulty = raw.difficulty;
        if (difficulty !== 'story' && difficulty !== 'standard' && difficulty !== 'hard') throw new GameError('Độ khó không hợp lệ.');
        profile.difficulty = difficulty;
      } else if (kind === 'skill') {
        const skillId = String(raw?.skillId ?? '');
        if (!def.skillIds.includes(skillId) && !heroCombatSkillIds(def).includes(skillId)) throw new GameError('Kỹ năng không thuộc Anh Hùng này.');
        const unlockAt = skillUnlockLevel(def, skillId);
        if (hero.level < unlockAt) throw new GameError(`Kỹ năng mở khóa ở cấp ${unlockAt}.`);
        const cur = hero.skillLevels[skillId] ?? 1;
        if (cur >= EXP_BALANCE.skills.maxLevel) {
          throw new GameError(`Kỹ năng đã đạt cấp tối đa (Lv.${EXP_BALANCE.skills.maxLevel}).`);
        }
        if (cur >= skillLevelCap(hero.level)) {
          throw new GameError(`Cần anh hùng cấp ${cur * EXP_BALANCE.skills.levelPerSkillRank} để nâng kỹ năng lên Lv.${cur + 1}.`);
        }
        const cost = skillUpgradeCost(cur);
        if (!cost) throw new GameError('Không có bảng chi phí cho cấp kỹ năng này.');
        if (profile.expCrystal < cost.expCrystal || profile.starlightToken < cost.starlight || profile.astralSeal < cost.seal) {
          throw new GameError(`Cần ${cost.expCrystal} Tinh Thể EXP, ${cost.starlight} Tinh Huy, ${cost.seal} Ấn Tinh Tú.`);
        }
        profile.expCrystal -= cost.expCrystal;
        profile.starlightToken -= cost.starlight;
        profile.astralSeal -= cost.seal;
        hero.skillLevels[skillId] = cur + 1;
      } else if (kind === 'exchange_seal') {
        const e = EXP_BALANCE.economy;
        if (profile.starlightToken < e.exchangeStarlight) {
          throw new GameError(`Cần ${e.exchangeStarlight} Tinh Huy Quang Phổ để đổi ${e.exchangeSealGain} Ấn Tinh Tú.`);
        }
        profile.starlightToken -= e.exchangeStarlight;
        profile.astralSeal += e.exchangeSealGain;
      } else {
        throw new GameError('Thao tác nâng cấp không hợp lệ.');
      }

      await this.persistProfile(profile);
      return profile;
    });
  }

  // ------------------------------------------------------------ charms / skill tree / story

  /** Gắn / tháo Bùa Hộ Mệnh vào ô `slotIndex`. body: { heroId, slotIndex, charmId | null } */
  async equipCharm(playerId: string, raw: { heroId?: unknown; slotIndex?: unknown; charmId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      const slots = charmSlotsAtLevel(hero.level);
      const idx = Math.floor(Number(raw?.slotIndex));
      if (!Number.isFinite(idx) || idx < 0 || idx >= slots) throw new GameError(`Ô bùa chưa mở (anh hùng có ${slots} ô).`);
      const cur: (string | null)[] = Array.from({ length: slots }, (_, i) => hero.charmIds?.[i] ?? null);
      if (raw?.charmId) {
        const cid = String(raw.charmId);
        if (!EXPEDITION_CHARMS_BY_ID[cid] || !profile.charms?.[cid]) throw new GameError('Chưa sở hữu Bùa Hộ Mệnh này.');
        // mỗi bùa chỉ 1 người đeo: gỡ khỏi anh hùng khác / ô khác
        for (const h of Object.values(profile.heroes)) {
          if (h.heroId !== hero.heroId && h.charmIds?.includes(cid)) h.charmIds = h.charmIds.filter((x) => x !== cid);
        }
        for (let i = 0; i < cur.length; i++) if (cur[i] === cid) cur[i] = null;
        cur[idx] = cid;
      } else {
        cur[idx] = null;
      }
      hero.charmIds = cur.filter((x): x is string => Boolean(x));
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Mở 1 nút cây kỹ năng. body: { heroId, nodeId } */
  async unlockTreeNode(playerId: string, raw: { heroId?: unknown; nodeId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      const nodeId = String(raw?.nodeId ?? '');
      if (!TREE_NODES_BY_ID[nodeId]) throw new GameError('Nút kỹ năng không tồn tại.');
      const chk = canUnlockTreeNode(hero, nodeId);
      if (!chk.ok) throw new GameError(chk.reason);
      hero.treeNodes = [...(hero.treeNodes ?? []), nodeId];
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Tẩy cây kỹ năng (hoàn toàn bộ SP). body: { heroId } */
  async resetTree(playerId: string, raw: { heroId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      await this.assertNotInBattle(playerId);
      const { profile } = await this.getProfile(playerId);
      const { hero } = this.heroOf(profile, String(raw?.heroId ?? ''));
      if (!hero.treeNodes?.length) throw new GameError('Cây kỹ năng đang trống.');
      const cost = EXP_BALANCE.skillTree.resetCostSeal;
      if (profile.astralSeal < cost) throw new GameError(`Cần ${cost} Ấn Tinh Tú để tẩy cây kỹ năng.`);
      profile.astralSeal -= cost;
      hero.treeNodes = [];
      await this.persistProfile(profile);
      return profile;
    });
  }

  /** Ghi nhận đã xem cảnh cốt truyện. body: { sceneId } */
  async markStorySeen(playerId: string, raw: { sceneId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const sceneId = String(raw?.sceneId ?? '').slice(0, 80);
      const scene = EXPEDITION_STORY_BY_ID[sceneId];
      if (!Object.hasOwn(EXPEDITION_STORY_BY_ID, sceneId) || !scene) throw new GameError('Cảnh cốt truyện không tồn tại.');
      const { profile } = await this.getProfile(playerId);
      profile.storySeen ??= [];
      if (!profile.storySeen.includes(sceneId)) {
        const trigger = scene.trigger;
        if (trigger.kind === 'enter' && profile.currentMapId !== trigger.mapId) {
          throw new GameError('Hãy đến vùng này để mở cảnh.');
        }
        if (trigger.kind === 'pre_boss') {
          const realm = EXPEDITION_REALMS_BY_ID[profile.currentMapId];
          if (realm.bossAltar.bossId !== trigger.bossId || realm.gatekeeperIds.some((id) => !profile.clearedGatekeepers.includes(id))) {
            throw new GameError('Cảnh Đại Trùm chưa mở.');
          }
        }
        if (trigger.kind === 'post_boss' && !profile.clearedBosses.includes(trigger.bossId)) {
          throw new GameError('Hãy hạ Đại Trùm để mở cảnh.');
        }
        profile.storySeen.push(sceneId);
        await this.persistProfile(profile);
      }
      return profile;
    });
  }

  /** Rút lui: hủy phiên trận đang mở, không thưởng, không phạt; vật phẩm dùng trong trận không bị trừ vì trận không được quyết toán. */
  async retreatBattle(playerId: string, raw: { battleId?: unknown }): Promise<ExpeditionProfile> {
    return this.serializePlayer(playerId, async () => {
      const { profile, activeBattle } = await this.getProfile(playerId);
      if (!activeBattle) return profile;
      if (activeBattle.battleId !== raw?.battleId) throw new GameError('Phiên trận đấu không khớp.');
      await this.redis.del(this.battleKey(playerId));
      return profile;
    });
  }

  private async assertNotInBattle(playerId: string): Promise<void> {
    const b = await this.redis.getJson<BattleSessionState>(this.battleKey(playerId));
    if (b && b.state !== 'VICTORY' && b.state !== 'DEFEAT') {
      throw new GameError('Không thể thay đổi khi đang ở giữa trận giao tranh.');
    }
  }
}
