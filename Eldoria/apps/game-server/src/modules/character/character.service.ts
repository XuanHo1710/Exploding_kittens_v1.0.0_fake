import crypto from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AllocateStatsDtoSchema,
  computeCharacterStats,
  ComputedStats,
  CreateCharacterDtoSchema,
  enhancedWeaponAtk,
  EquipmentSlot,
  expRequiredForNextLevel,
  ItemInstance,
  RawHeroStats,
} from '@eldoria/shared';
import { CatalogService } from '../../database/catalog.service';
import { JsonDatabaseEngine } from '../../database/json-database.engine';
import {
  CharacterEntity,
  HomesteadEntity,
  InventoryEntity,
  SocialProfileEntity,
} from '../../domain/entities';

const STARTER_WEAPON_BY_HERO: Record<string, string> = {
  chr_kael_vanguard: 'wpn_iron_longsword',
  chr_lyra_windrunner: 'wpn_ashwood_shortbow',
  chr_seraphina_dawn: 'wpn_apprentice_oak_staff',
};

@Injectable()
export class CharacterService {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  public listCharactersForAccount(accountId: string) {
    const idx = this.db.readIndex('characters-by-account');
    const ids: string[] = idx[accountId] || [];
    const results = [];
    for (const id of ids) {
      const ch = this.db.readEntity<CharacterEntity>(`characters/${id}.json`);
      if (ch) {
        const inv = this.db.readEntity<InventoryEntity>(`inventories/${id}.json`);
        results.push({
          ...ch,
          computedStats: this.computeStats(ch, inv),
        });
      }
    }
    return results;
  }

  public getOwnedCharacter(accountId: string, characterId: string): CharacterEntity {
    const ch = this.db.readEntity<CharacterEntity>(`characters/${characterId}.json`);
    if (!ch) throw new NotFoundException(`Character ${characterId} not found`);
    if (ch.accountId !== accountId) throw new ForbiddenException('Character does not belong to this account');
    return ch;
  }

  public getCharacterBundle(accountId: string, characterId: string) {
    const ch = this.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`) || {
      characterId,
      bagCapacity: 40,
      storageCapacity: 60,
      bagItems: [],
      storageItems: [],
    };
    const homestead = this.db.readEntity<HomesteadEntity>(`homesteads/${characterId}.json`);
    const social = this.db.readEntity<SocialProfileEntity>(`social/${characterId}.json`);
    const computedStats = this.computeStats(ch, inv);
    const heroTemplate = this.catalog.catalog.byId.characters.get(ch.activeHeroId);
    const activeSkills = this.catalog.catalog.skills.filter((s) => s.characterId === ch.activeHeroId);
    return {
      character: ch,
      computedStats,
      nextLevelExp: expRequiredForNextLevel(ch.level),
      heroTemplate,
      activeSkills,
      inventory: inv,
      homestead,
      social,
    };
  }

  public computeStats(ch: CharacterEntity, inv?: InventoryEntity | null): ComputedStats {
    const hero = this.catalog.catalog.byId.characters.get(ch.activeHeroId) || this.catalog.catalog.characters[0];
    const baseStats: RawHeroStats = {
      hp: hero.baseStats.hp,
      mp: hero.baseStats.mp,
      stamina: hero.baseStats.stamina,
      atk: hero.baseStats.atk,
      def: hero.baseStats.def,
      str: hero.baseStats.str,
      agi: hero.baseStats.agi,
      int: hero.baseStats.int,
      vit: hero.baseStats.vit,
      dex: hero.baseStats.dex,
      luk: hero.baseStats.luk,
      critRate: hero.baseStats.critRate,
      critDamage: hero.baseStats.critDamage,
      attackSpeed: hero.baseStats.attackSpeed,
      moveSpeed: hero.baseStats.moveSpeed,
      cdr: hero.baseStats.cdr,
    };

    const equipmentBonus: Partial<RawHeroStats> = {};
    const equippedItemIds: string[] = [];
    const itemsList = inv ? inv.bagItems : [];

    for (const [, instId] of Object.entries(ch.equippedSlots || {})) {
      if (!instId) continue;
      const inst = itemsList.find((i) => i.instanceId === instId);
      if (!inst) continue;
      equippedItemIds.push(inst.itemId);
      const tmpl = this.catalog.catalog.byId.items.get(inst.itemId);
      if (!tmpl?.baseStats) continue;
      for (const [k, rawVal] of Object.entries(tmpl.baseStats)) {
        const val = Number(rawVal);
        if (Number.isNaN(val)) continue;
        if (k === 'atk' && tmpl.category === 'WEAPON') {
          equipmentBonus.atk = (equipmentBonus.atk || 0) + enhancedWeaponAtk(val, inst.enhancementLevel);
        } else {
          (equipmentBonus as any)[k] = ((equipmentBonus as any)[k] || 0) + val;
        }
      }
    }

    // Apply Equipment Set 2-piece / 4-piece bonuses
    for (const setDef of this.catalog.catalog.equipmentSets) {
      const pieceIds: string[] = setDef.pieceIds || [];
      const count = pieceIds.filter((pid) => equippedItemIds.includes(pid)).length;
      for (const threshold of ['2', '4']) {
        if (count >= Number(threshold) && setDef.bonuses?.[threshold]?.stats) {
          for (const [k, v] of Object.entries(setDef.bonuses[threshold].stats)) {
            (equipmentBonus as any)[k] = ((equipmentBonus as any)[k] || 0) + Number(v);
          }
        }
      }
    }

    const foodActive = ch.vitals.foodBuffExpiresAt > Date.now() ? ch.vitals.foodBuffAtkPct : 0;
    const isMagic = hero.class === 'MAGE' || hero.class === 'HEALER' || hero.class === 'SUMMONER';

    return computeCharacterStats({
      baseStats,
      growthPerLevel: hero.statGrowthPerLevel || {},
      level: ch.level,
      allocatedPoints: ch.allocatedStats,
      equipmentBonus,
      foodAtkPct: foodActive,
      isMagicClass: isMagic,
    });
  }

  public async createCharacter(accountId: string, rawDto: unknown) {
    const parsed = CreateCharacterDtoSchema.safeParse(rawDto);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message = parsed.error.issues.map((i) => i.message).join(' • ') || 'Tên nhân vật không hợp lệ';
      throw new BadRequestException({ message, ...flat });
    }
    const dto = parsed.data;
    const byAcc = this.db.readIndex('characters-by-account');
    const existingIds: string[] = byAcc[accountId] || [];
    if (existingIds.length >= 4) {
      throw new BadRequestException('Maximum of 4 characters per account reached');
    }

    const byName = this.db.readIndex('characters-by-name');
    const nameKey = dto.name.trim().toLowerCase();
    if (byName[nameKey]) {
      throw new ConflictException('Character name is already in use');
    }

    const characterId = `char_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const nowMs = Date.now();

    const starterWeaponId = STARTER_WEAPON_BY_HERO[dto.starterHeroId] || 'wpn_iron_longsword';
    const makeItem = (itemId: string, quantity: number, slotIndex: number): ItemInstance => ({
      instanceId: `itm_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
      itemId,
      ownerCharacterId: characterId,
      quantity,
      slotIndex,
      enhancementLevel: 0,
      durability: 100,
      bonusRolls: [],
      sockets: [],
      quality: 'NORMAL',
      bound: false,
      acquiredAt: now,
    });

    const starterWeapon = makeItem(starterWeaponId, 1, 0);
    const starterArmor = makeItem('eqp_novice_linen_tunic', 1, 1);
    const starterBoots = makeItem('eqp_novice_traveler_boots', 1, 2);

    const bagItems: ItemInstance[] = [
      starterWeapon,
      starterArmor,
      starterBoots,
      makeItem('csm_minor_health_potion', 5, 3),
      makeItem('sed_sunwheat', 6, 4),
      makeItem('mat_oak_wood', 20, 5),
      makeItem('mat_rough_stone', 15, 6),
      makeItem('mat_copper_ore', 12, 7),
      makeItem('mat_coal', 8, 8),
      makeItem('mat_copper_ingot', 4, 9),
      makeItem('mat_slime_gel', 4, 10),
    ];

    const mvpQuests = this.catalog.catalog.quests
      .filter((q) => q.mvp)
      .map((q, idx) => ({
        questId: q.id,
        status: (idx === 0 ? 'ACTIVE' : 'AVAILABLE') as 'ACTIVE' | 'AVAILABLE',
        progress: {},
        acceptedAt: idx === 0 ? now : null,
        completedAt: null,
        claimedAt: null,
      }));

    const character: CharacterEntity = {
      id: characterId,
      accountId,
      name: dto.name.trim(),
      activeHeroId: dto.starterHeroId,
      level: 1,
      exp: 0,
      unspentStatPoints: 5,
      unspentSkillPoints: 2,
      allocatedStats: { str: 0, agi: 0, int: 0, vit: 0, dex: 0, luk: 0 },
      skillRanks: {},
      wallet: {
        gold: 650,
        starlightShard: 1600, // Starter welcome shards so user can immediately test a 10-pull or save!
        craftingToken: 10,
        bossToken: 0,
        starEssence: 0,
      },
      unlockedHeroes: [
        { heroId: dto.starterHeroId, constellationLevel: 0, unlockedAt: now },
      ],
      equippedSlots: {
        MAIN_WEAPON: starterWeapon.instanceId,
        CHEST: starterArmor.instanceId,
        BOOTS: starterBoots.instanceId,
      } as Partial<Record<EquipmentSlot, string>>,
      position: {
        regionId: 'reg_greenhaven_village',
        zoneId: 'reg_greenhaven_village',
        x: 10 * 32,
        y: 12 * 32,
        facing: 'down',
      },
      vitals: {
        hp: 300,
        mp: 120,
        stamina: 130,
        hunger: 100,
        foodBuffAtkPct: 0,
        foodBuffExpiresAt: 0,
      },
      pityByGroup: {
        PERMANENT_CHARACTER: { pullsSinceHighRarity: 0, pullsSinceEpic: 0, totalPulls: 0 },
        PERMANENT_WEAPON: { pullsSinceHighRarity: 0, pullsSinceEpic: 0, totalPulls: 0 },
      },
      gachaHistory: [],
      upgradeHistory: [],
      quests: mvpQuests,
      discoveredRegions: ['reg_greenhaven_village', 'reg_whispering_forest'],
      bossKillCounts: {},
      createdAt: now,
      updatedAt: now,
    };

    const inventory: InventoryEntity = {
      characterId,
      bagCapacity: 40,
      storageCapacity: 60,
      bagItems,
      storageItems: [],
    };

    const computed = this.computeStats(character, inventory);
    character.vitals.hp = computed.hp;
    character.vitals.mp = computed.mp;
    character.vitals.stamina = computed.stamina;

    const homestead: HomesteadEntity = {
      characterId,
      gridWidth: 20,
      gridHeight: 16,
      buildings: [
        {
          instanceId: 'bld_inst_house',
          buildingId: 'bld_player_house',
          level: 1,
          tileX: 2,
          tileY: 2,
          rotation: 0,
          builtAt: now,
        },
        {
          instanceId: 'bld_inst_blacksmith',
          buildingId: 'bld_blacksmith',
          level: 1,
          tileX: 9,
          tileY: 2,
          rotation: 0,
          builtAt: now,
        },
        {
          instanceId: 'bld_inst_coop',
          buildingId: 'bld_chicken_coop',
          level: 1,
          tileX: 14,
          tileY: 2,
          rotation: 0,
          builtAt: now,
        },
      ],
      plots: [
        // 3 mature Sunwheat plots ready for instant OB-1 harvest + 3 tilled plots ready for planting!
        { plotId: 'plot_1', tileX: 2, tileY: 8, state: 'MATURE', cropId: 'crp_sunwheat', plantedAtMs: nowMs - 900_000, lastWateredAtMs: nowMs - 300_000, wateredCount: 2, fertilized: false, growthProgressMin: 12 },
        { plotId: 'plot_2', tileX: 3, tileY: 8, state: 'MATURE', cropId: 'crp_sunwheat', plantedAtMs: nowMs - 900_000, lastWateredAtMs: nowMs - 300_000, wateredCount: 2, fertilized: false, growthProgressMin: 12 },
        { plotId: 'plot_3', tileX: 4, tileY: 8, state: 'MATURE', cropId: 'crp_sunwheat', plantedAtMs: nowMs - 900_000, lastWateredAtMs: nowMs - 300_000, wateredCount: 2, fertilized: false, growthProgressMin: 12 },
        { plotId: 'plot_4', tileX: 5, tileY: 8, state: 'TILLED', cropId: null, plantedAtMs: null, lastWateredAtMs: null, wateredCount: 0, fertilized: false, growthProgressMin: 0 },
        { plotId: 'plot_5', tileX: 6, tileY: 8, state: 'TILLED', cropId: null, plantedAtMs: null, lastWateredAtMs: null, wateredCount: 0, fertilized: false, growthProgressMin: 0 },
        { plotId: 'plot_6', tileX: 7, tileY: 8, state: 'UNTILLED', cropId: null, plantedAtMs: null, lastWateredAtMs: null, wateredCount: 0, fertilized: false, growthProgressMin: 0 },
      ],
      animals: [
        {
          animalInstanceId: 'anm_inst_chicken_1',
          animalId: 'anm_meadow_chicken',
          name: 'Clucky',
          happiness: 80,
          hunger: 75,
          health: 100,
          grownAtMs: nowMs - 10_000,
          lastFedAtMs: nowMs - 3600_000,
          lastCollectedAtMs: nowMs - 86_400_000,
        },
      ],
      lastSimulatedAtMs: nowMs,
    };

    const social: SocialProfileEntity = {
      characterId,
      friendIds: [],
      blockedIds: [],
      pendingRequests: [],
    };

    const nextByAcc = { ...byAcc, [accountId]: [...existingIds, characterId] };
    const nextByName = { ...byName, [nameKey]: characterId };

    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: character },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inventory },
      { relPath: `homesteads/${characterId}.json`, op: 'UPSERT', entityType: 'HOMESTEAD', entityId: characterId, data: homestead },
      { relPath: `social/${characterId}.json`, op: 'UPSERT', entityType: 'SOCIAL', entityId: characterId, data: social },
      { relPath: 'indexes/characters-by-account.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'characters-by-account', data: nextByAcc },
      { relPath: 'indexes/characters-by-name.json', op: 'UPSERT', entityType: 'INDEX', entityId: 'characters-by-name', data: nextByName },
    ]);

    return this.getCharacterBundle(accountId, characterId);
  }

  public async allocateStats(accountId: string, characterId: string, rawDto: unknown) {
    const parsed = AllocateStatsDtoSchema.safeParse(rawDto);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const ch = this.getOwnedCharacter(accountId, characterId);
    const d = parsed.data;
    const total = d.str + d.agi + d.int + d.vit + d.dex + d.luk;
    if (total <= 0) throw new BadRequestException('Must allocate at least 1 stat point');
    if (total > ch.unspentStatPoints) {
      throw new BadRequestException(`Insufficient unspent stat points (${ch.unspentStatPoints} available)`);
    }
    ch.unspentStatPoints -= total;
    ch.allocatedStats.str += d.str;
    ch.allocatedStats.agi += d.agi;
    ch.allocatedStats.int += d.int;
    ch.allocatedStats.vit += d.vit;
    ch.allocatedStats.dex += d.dex;
    ch.allocatedStats.luk += d.luk;
    ch.updatedAt = new Date().toISOString();

    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return this.getCharacterBundle(accountId, characterId);
  }

  public async upgradeSkill(accountId: string, characterId: string, skillId: string) {
    const ch = this.getOwnedCharacter(accountId, characterId);
    const sk = this.catalog.catalog.byId.skills.get(skillId);
    if (!sk) throw new NotFoundException(`Skill ${skillId} not found`);
    if (ch.unspentSkillPoints < 1) throw new BadRequestException('No unspent skill points available');
    const curRank = ch.skillRanks[skillId] || 1;
    const maxRank = sk.maxRank || 5;
    if (curRank >= maxRank) throw new BadRequestException(`Skill ${skillId} is already at max rank ${maxRank}`);
    ch.unspentSkillPoints -= 1;
    ch.skillRanks[skillId] = curRank + 1;
    ch.updatedAt = new Date().toISOString();
    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return { skillId, newRank: ch.skillRanks[skillId], unspentSkillPoints: ch.unspentSkillPoints };
  }

  public async switchActiveHero(accountId: string, characterId: string, heroId: string) {
    const ch = this.getOwnedCharacter(accountId, characterId);
    const owned = ch.unlockedHeroes.some((h) => h.heroId === heroId);
    if (!owned) throw new ForbiddenException(`Hero ${heroId} is not unlocked on this character`);
    ch.activeHeroId = heroId;
    ch.updatedAt = new Date().toISOString();
    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return this.getCharacterBundle(accountId, characterId);
  }

  public applyExp(ch: CharacterEntity, expDelta: number): { leveledUp: boolean; levelsGained: number } {
    if (expDelta <= 0 || ch.level >= 100) return { leveledUp: false, levelsGained: 0 };
    ch.exp += expDelta;
    let levelsGained = 0;
    while (ch.level < 100) {
      const req = expRequiredForNextLevel(ch.level);
      if (ch.exp < req) break;
      ch.exp -= req;
      ch.level += 1;
      ch.unspentStatPoints += 5;
      ch.unspentSkillPoints += 1;
      levelsGained += 1;
    }
    return { leveledUp: levelsGained > 0, levelsGained };
  }
}
