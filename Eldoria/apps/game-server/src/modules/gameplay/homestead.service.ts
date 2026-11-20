import crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../../database/catalog.service';
import { CurrencyLedgerEntry, JsonDatabaseEngine } from '../../database/json-database.engine';
import { HomesteadEntity, InventoryEntity } from '../../domain/entities';
import { CharacterService } from '../character/character.service';
import { EconomyInventoryService } from './economy-inventory.service';

const MAX_OFFLINE_GROWTH_HOURS = 24;

@Injectable()
export class HomesteadService {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(EconomyInventoryService) private readonly economy: EconomyInventoryService,
  ) {}

  public simulateServerTimeProgress(homestead: HomesteadEntity): HomesteadEntity {
    const now = Date.now();
    const elapsedMs = Math.max(0, Math.min(MAX_OFFLINE_GROWTH_HOURS * 3600_000, now - homestead.lastSimulatedAtMs));
    const elapsedMin = elapsedMs / 60_000;
    const elapsedHours = elapsedMs / 3600_000;

    if (elapsedMin > 0.01) {
      for (const plot of homestead.plots) {
        if (plot.state === 'PLANTED' && plot.cropId) {
          const crop = this.catalog.catalog.byId.crops.get(plot.cropId);
          const totalMin = Number(crop?.totalGrowthMinutes || 12);
          const wateredRecently = plot.lastWateredAtMs !== null && now - plot.lastWateredAtMs < 6 * 3600_000;
          const mult = (wateredRecently ? 1.5 : 0.6) * (plot.fertilized ? 1.25 : 1.0);
          plot.growthProgressMin = Math.min(totalMin, plot.growthProgressMin + elapsedMin * mult);
          if (plot.growthProgressMin >= totalMin) {
            plot.state = 'MATURE';
          }
        }
      }
      for (const anm of homestead.animals) {
        anm.hunger = Math.max(0, Math.round(anm.hunger - elapsedHours * 4));
        if (anm.hunger < 20) {
          anm.happiness = Math.max(10, Math.round(anm.happiness - elapsedHours * 2));
        }
      }
      homestead.lastSimulatedAtMs = now;
    }
    return homestead;
  }

  public async getHomestead(accountId: string, characterId: string): Promise<HomesteadEntity> {
    this.characters.getOwnedCharacter(accountId, characterId);
    const homestead = this.db.readEntity<HomesteadEntity>(`homesteads/${characterId}.json`);
    if (!homestead) throw new NotFoundException('Homestead not found');
    return this.simulateServerTimeProgress(homestead);
  }

  public async placeBuilding(
    accountId: string,
    characterId: string,
    body: { buildingId: string; tileX: number; tileY: number; rotation?: number },
  ) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const homestead = await this.getHomestead(accountId, characterId);
    const tmpl = this.catalog.catalog.byId.buildings.get(body.buildingId);
    if (!tmpl) throw new NotFoundException(`Building ${body.buildingId} not found`);

    const fw = Number(tmpl.footprintTiles?.width || 3);
    const fh = Number(tmpl.footprintTiles?.height || 3);
    const tx = Math.floor(body.tileX);
    const ty = Math.floor(body.tileY);

    if (tx < 0 || ty < 0 || tx + fw > homestead.gridWidth || ty + fh > homestead.gridHeight) {
      throw new BadRequestException('Building placement out of homestead bounds');
    }
    for (const existing of homestead.buildings) {
      const et = this.catalog.catalog.byId.buildings.get(existing.buildingId);
      const ew = Number(et?.footprintTiles?.width || 3);
      const eh = Number(et?.footprintTiles?.height || 3);
      const overlaps = tx < existing.tileX + ew && tx + fw > existing.tileX && ty < existing.tileY + eh && ty + fh > existing.tileY;
      if (overlaps) throw new BadRequestException('Building footprint overlaps an existing structure');
    }

    const lv1 = tmpl.levels?.[0] || { goldCost: 100, materials: [] };
    const goldCost = Number(lv1.goldCost || 0);
    if (ch.wallet.gold < goldCost) throw new BadRequestException(`Insufficient Gold (need ${goldCost})`);
    this.economy.consumeItemsFromBag(inv, lv1.materials || []);

    const beforeGold = ch.wallet.gold;
    ch.wallet.gold -= goldCost;
    const placed = {
      instanceId: `bld_inst_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
      buildingId: body.buildingId,
      level: 1,
      tileX: tx,
      tileY: ty,
      rotation: body.rotation || 0,
      builtAt: new Date().toISOString(),
    };
    homestead.buildings.push(placed);
    this.economy.incrementQuestProgress(ch, 'BUILD_STRUCTURE', body.buildingId, 1);

    const txId = crypto.randomUUID();
    const muts: any[] = [
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
      { relPath: `homesteads/${characterId}.json`, op: 'UPSERT', entityType: 'HOMESTEAD', entityId: characterId, data: homestead },
    ];
    if (goldCost > 0) {
      const entry: CurrencyLedgerEntry = {
        entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        txId,
        characterId,
        currency: 'GOLD',
        delta: -goldCost,
        beforeBalance: beforeGold,
        afterBalance: ch.wallet.gold,
        reason: `BUILD:${body.buildingId}`,
        createdAt: new Date().toISOString(),
      };
      muts.push(this.db.buildLedgerMutation(entry));
    }
    await this.db.runTransaction(muts, { txId });
    return { placed, homestead, wallet: ch.wallet };
  }

  public async upgradeBuilding(accountId: string, characterId: string, instanceId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const homestead = await this.getHomestead(accountId, characterId);
    const bld = homestead.buildings.find((b) => b.instanceId === instanceId);
    if (!bld) throw new NotFoundException('Building instance not found');
    const tmpl = this.catalog.catalog.byId.buildings.get(bld.buildingId);
    const maxLv = Number(tmpl?.maxLevel || 4);
    if (bld.level >= maxLv) throw new BadRequestException('Building already at max level');

    const nextLvDef = tmpl?.levels?.find((l: any) => l.level === bld.level + 1) || { goldCost: 250 * bld.level, materials: [] };
    const goldCost = Number(nextLvDef.goldCost || 0);
    if (ch.wallet.gold < goldCost) throw new BadRequestException(`Insufficient Gold (need ${goldCost})`);
    this.economy.consumeItemsFromBag(inv, nextLvDef.materials || []);

    const beforeGold = ch.wallet.gold;
    ch.wallet.gold -= goldCost;
    bld.level += 1;

    const txId = crypto.randomUUID();
    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
      { relPath: `homesteads/${characterId}.json`, op: 'UPSERT', entityType: 'HOMESTEAD', entityId: characterId, data: homestead },
      this.db.buildLedgerMutation({
        entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        txId,
        characterId,
        currency: 'GOLD',
        delta: -goldCost,
        beforeBalance: beforeGold,
        afterBalance: ch.wallet.gold,
        reason: `UPGRADE_BUILDING:${bld.buildingId}:Lv${bld.level}`,
        createdAt: new Date().toISOString(),
      }),
    ], { txId });
    return { building: bld, wallet: ch.wallet };
  }

  public async farmAction(
    accountId: string,
    characterId: string,
    action: 'till' | 'plant' | 'water' | 'harvest',
    body: { plotId: string; cropId?: string; instantGrowForDev?: boolean },
  ) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const homestead = await this.getHomestead(accountId, characterId);
    const plot = homestead.plots.find((p) => p.plotId === body.plotId);
    if (!plot) throw new NotFoundException(`Plot ${body.plotId} not found`);
    const now = Date.now();

    let harvested: { itemId: string; qty: number; quality: 'NORMAL' | 'SILVER' | 'GOLD' } | null = null;

    if (action === 'till') {
      if (plot.state !== 'UNTILLED') throw new BadRequestException('Plot is already tilled or planted');
      plot.state = 'TILLED';
    } else if (action === 'plant') {
      if (plot.state !== 'TILLED') throw new BadRequestException('Plot must be TILLED before planting');
      const cropId = body.cropId || 'crp_sunwheat';
      const crop = this.catalog.catalog.byId.crops.get(cropId);
      if (!crop) throw new NotFoundException(`Crop ${cropId} not found`);
      this.economy.consumeItemsFromBag(inv, [{ itemId: crop.seedItemId, qty: 1 }]);
      plot.state = 'PLANTED';
      plot.cropId = cropId;
      plot.plantedAtMs = now;
      plot.lastWateredAtMs = null;
      plot.wateredCount = 0;
      plot.growthProgressMin = 0;
      this.economy.incrementQuestProgress(ch, 'PLANT_CROP', cropId, 1);
    } else if (action === 'water') {
      if (plot.state !== 'PLANTED' || !plot.cropId) throw new BadRequestException('Only planted plots can be watered');
      plot.lastWateredAtMs = now;
      plot.wateredCount += 1;
      const crop = this.catalog.catalog.byId.crops.get(plot.cropId);
      const totalMin = Number(crop?.totalGrowthMinutes || 12);
      plot.growthProgressMin = Math.min(totalMin, plot.growthProgressMin + Math.max(4, totalMin * 0.5));
      if (plot.growthProgressMin >= totalMin) {
        plot.state = 'MATURE';
      }
    } else if (action === 'harvest') {
      if (plot.state !== 'MATURE' || !plot.cropId) {
        throw new BadRequestException('Crop is not mature yet');
      }
      const crop = this.catalog.catalog.byId.crops.get(plot.cropId);
      const minY = Number(crop?.yieldMin || 2);
      const maxY = Number(crop?.yieldMax || 4);
      const qty = crypto.randomInt(minY, maxY + 1);
      const roll = crypto.randomInt(0, 100);
      const quality: 'NORMAL' | 'SILVER' | 'GOLD' = roll < 10 ? 'GOLD' : roll < 32 ? 'SILVER' : 'NORMAL';
      const harvestItemId = crop?.harvestItemId || 'mat_sunwheat_grain';
      this.economy.addItemToBag(inv, characterId, harvestItemId, qty, quality);
      this.characters.applyExp(ch, 18);
      this.economy.incrementQuestProgress(ch, 'HARVEST_CROP', plot.cropId, 1);
      harvested = { itemId: harvestItemId, qty, quality };

      plot.state = 'TILLED';
      plot.cropId = null;
      plot.plantedAtMs = null;
      plot.lastWateredAtMs = null;
      plot.wateredCount = 0;
      plot.growthProgressMin = 0;
    }

    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
      { relPath: `homesteads/${characterId}.json`, op: 'UPSERT', entityType: 'HOMESTEAD', entityId: characterId, data: homestead },
    ]);

    return { plot, harvested, homestead, inventory: inv };
  }

  public async animalAction(
    accountId: string,
    characterId: string,
    action: 'feed' | 'collect',
    animalInstanceId: string,
  ) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const homestead = await this.getHomestead(accountId, characterId);
    const anm = homestead.animals.find((a) => a.animalInstanceId === animalInstanceId);
    if (!anm) throw new NotFoundException('Animal not found');
    const tmpl = this.catalog.catalog.byId.animals.get(anm.animalId);
    const now = Date.now();
    let collected: { itemId: string; qty: number } | null = null;

    if (action === 'feed') {
      anm.hunger = 100;
      anm.happiness = Math.min(100, anm.happiness + 15);
      anm.lastFedAtMs = now;
    } else {
      const prodItemId = tmpl?.product?.itemId || (anm.animalId === 'anm_dairy_cow' ? 'mat_fresh_milk' : 'mat_meadow_egg');
      const qty = anm.happiness >= 85 ? 2 : 1;
      this.economy.addItemToBag(inv, characterId, prodItemId, qty);
      anm.lastCollectedAtMs = now;
      this.characters.applyExp(ch, 12);
      collected = { itemId: prodItemId, qty };
    }

    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
      { relPath: `homesteads/${characterId}.json`, op: 'UPSERT', entityType: 'HOMESTEAD', entityId: characterId, data: homestead },
    ]);
    return { animal: anm, collected, homestead };
  }
}
