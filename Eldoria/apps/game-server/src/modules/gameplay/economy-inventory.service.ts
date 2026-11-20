import crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  enhancedWeaponAtk,
  EquipmentSlot,
  ItemInstance,
} from '@eldoria/shared';
import { CatalogService } from '../../database/catalog.service';
import { CurrencyLedgerEntry, JsonDatabaseEngine } from '../../database/json-database.engine';
import { CharacterEntity, HomesteadEntity, InventoryEntity } from '../../domain/entities';
import { RedisIdempotencyService } from '../../infrastructure/redis/redis-ephemeral.services';
import { CharacterService } from '../character/character.service';

export interface EnhancementTierCost {
  toLevel: number;
  goldCost: number;
  requiredBlacksmithLevel: number;
  materials: Array<{ itemId: string; qty: number }>;
}

export const ENHANCEMENT_TABLE_1_TO_10: EnhancementTierCost[] = [
  { toLevel: 1, goldCost: 60, requiredBlacksmithLevel: 1, materials: [{ itemId: 'mat_copper_ingot', qty: 2 }] },
  { toLevel: 2, goldCost: 110, requiredBlacksmithLevel: 1, materials: [{ itemId: 'mat_copper_ingot', qty: 3 }, { itemId: 'mat_slime_gel', qty: 2 }] },
  { toLevel: 3, goldCost: 180, requiredBlacksmithLevel: 1, materials: [{ itemId: 'mat_copper_ingot', qty: 4 }, { itemId: 'mat_oak_wood', qty: 4 }] },
  { toLevel: 4, goldCost: 280, requiredBlacksmithLevel: 2, materials: [{ itemId: 'mat_iron_ingot', qty: 3 }, { itemId: 'mat_wolf_fang', qty: 2 }] },
  { toLevel: 5, goldCost: 420, requiredBlacksmithLevel: 2, materials: [{ itemId: 'mat_iron_ingot', qty: 4 }, { itemId: 'mat_ancient_bark', qty: 2 }] },
  { toLevel: 6, goldCost: 620, requiredBlacksmithLevel: 2, materials: [{ itemId: 'mat_iron_ingot', qty: 5 }, { itemId: 'mat_thorn_heartwood', qty: 1 }] },
  { toLevel: 7, goldCost: 900, requiredBlacksmithLevel: 3, materials: [{ itemId: 'mat_silver_ingot', qty: 4 }, { itemId: 'mat_thorn_heartwood', qty: 2 }] },
  { toLevel: 8, goldCost: 1250, requiredBlacksmithLevel: 3, materials: [{ itemId: 'mat_silver_ingot', qty: 6 }, { itemId: 'mat_thorn_heartwood', qty: 3 }] },
  { toLevel: 9, goldCost: 1700, requiredBlacksmithLevel: 4, materials: [{ itemId: 'mat_mythril_ingot', qty: 4 }, { itemId: 'mat_thorn_heartwood', qty: 4 }] },
  { toLevel: 10, goldCost: 2400, requiredBlacksmithLevel: 4, materials: [{ itemId: 'mat_mythril_ingot', qty: 6 }, { itemId: 'mat_thorn_heartwood', qty: 5 }] },
];

const STACKABLE_CATEGORIES = new Set(['MATERIAL', 'CONSUMABLE', 'SEED', 'FOOD', 'CURRENCY_TOKEN']);

@Injectable()
export class EconomyInventoryService {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(RedisIdempotencyService) private readonly idempotency: RedisIdempotencyService,
  ) {}

  public addItemToBag(
    inv: InventoryEntity,
    characterId: string,
    itemId: string,
    quantity: number,
    quality: 'NORMAL' | 'SILVER' | 'GOLD' = 'NORMAL',
  ): ItemInstance {
    if (quantity <= 0) throw new BadRequestException('Quantity must be > 0');
    const tmpl = this.catalog.catalog.byId.items.get(itemId);
    const isStackable = !tmpl || STACKABLE_CATEGORIES.has(tmpl.category);

    if (isStackable) {
      const existing = inv.bagItems.find((i) => i.itemId === itemId && i.quality === quality);
      if (existing) {
        existing.quantity += quantity;
        return existing;
      }
    }
    if (inv.bagItems.length >= inv.bagCapacity) {
      throw new BadRequestException('Inventory bag is full');
    }
    const usedSlots = new Set(inv.bagItems.map((i) => i.slotIndex));
    let nextSlot = 0;
    while (usedSlots.has(nextSlot)) nextSlot++;

    const created: ItemInstance = {
      instanceId: `itm_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
      itemId,
      ownerCharacterId: characterId,
      quantity,
      slotIndex: nextSlot,
      enhancementLevel: 0,
      durability: tmpl && (tmpl.category === 'WEAPON' || tmpl.category === 'EQUIPMENT') ? 100 : null,
      bonusRolls: [],
      sockets: [],
      quality,
      bound: false,
      acquiredAt: new Date().toISOString(),
    };
    inv.bagItems.push(created);
    return created;
  }

  public countItemInBag(inv: InventoryEntity, itemId: string): number {
    return inv.bagItems
      .filter((i) => i.itemId === itemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  public consumeItemsFromBag(inv: InventoryEntity, reqs: Array<{ itemId: string; qty: number }>): void {
    for (const req of reqs) {
      if (this.countItemInBag(inv, req.itemId) < req.qty) {
        throw new BadRequestException(`Insufficient material ${req.itemId} (need ${req.qty})`);
      }
    }
    for (const req of reqs) {
      let remaining = req.qty;
      for (let i = inv.bagItems.length - 1; i >= 0 && remaining > 0; i--) {
        const slot = inv.bagItems[i];
        if (slot.itemId !== req.itemId) continue;
        if (slot.quantity <= remaining) {
          remaining -= slot.quantity;
          inv.bagItems.splice(i, 1);
        } else {
          slot.quantity -= remaining;
          remaining = 0;
        }
      }
    }
  }

  public async equipItem(accountId: string, characterId: string, itemInstanceId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    if (!inv) throw new NotFoundException('Inventory not found');
    const inst = inv.bagItems.find((i) => i.instanceId === itemInstanceId);
    if (!inst) throw new NotFoundException('Item instance not found in bag');
    const tmpl = this.catalog.catalog.byId.items.get(inst.itemId);
    if (!tmpl || (tmpl.category !== 'WEAPON' && tmpl.category !== 'EQUIPMENT')) {
      throw new BadRequestException('Only weapons and equipment can be equipped');
    }
    const rawSlot = String(tmpl.slot || 'MAIN_WEAPON').toUpperCase();
    const slotMap: Record<string, EquipmentSlot> = {
      MAIN_HAND: 'MAIN_WEAPON',
      MAIN_WEAPON: 'MAIN_WEAPON',
      OFF_HAND: 'OFF_HAND',
      HELMET: 'HELMET',
      CHEST: 'CHEST',
      GLOVES: 'GLOVES',
      BOOTS: 'BOOTS',
      RING: 'RING_1',
      RING_1: 'RING_1',
      RING_2: 'RING_2',
      NECKLACE: 'NECKLACE',
      ACCESSORY: 'ACCESSORY',
    };
    const slot = slotMap[rawSlot] || 'MAIN_WEAPON';
    ch.equippedSlots[slot] = inst.instanceId;
    ch.updatedAt = new Date().toISOString();
    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return this.characters.getCharacterBundle(accountId, characterId);
  }

  public async unequipSlot(accountId: string, characterId: string, slot: EquipmentSlot) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    delete ch.equippedSlots[slot];
    ch.updatedAt = new Date().toISOString();
    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return this.characters.getCharacterBundle(accountId, characterId);
  }

  public async useConsumable(accountId: string, characterId: string, itemInstanceId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    if (!inv) throw new NotFoundException('Inventory not found');
    const idx = inv.bagItems.findIndex((i) => i.instanceId === itemInstanceId);
    if (idx < 0) throw new NotFoundException('Consumable not found');
    const inst = inv.bagItems[idx];
    const tmpl = this.catalog.catalog.byId.items.get(inst.itemId);
    if (!tmpl || (tmpl.category !== 'CONSUMABLE' && tmpl.category !== 'FOOD')) {
      throw new BadRequestException('Item is not consumable');
    }

    const stats = this.characters.computeStats(ch, inv);
    const eff = tmpl.effects || {};
    const hpHeal = Number(eff.hpRestore || eff.healHp || 80);
    const mpHeal = Number(eff.mpRestore || 25);
    const staminaHeal = Number(eff.staminaRestore || 35);
    const hungerHeal = Number(eff.hungerRestore || 30);

    ch.vitals.hp = Math.min(stats.hp, ch.vitals.hp + hpHeal);
    ch.vitals.mp = Math.min(stats.mp, ch.vitals.mp + mpHeal);
    ch.vitals.stamina = Math.min(stats.stamina, ch.vitals.stamina + staminaHeal);
    ch.vitals.hunger = Math.min(100, ch.vitals.hunger + hungerHeal);
    if (eff.atkPctBuff) {
      ch.vitals.foodBuffAtkPct = Number(eff.atkPctBuff);
      ch.vitals.foodBuffExpiresAt = Date.now() + Number(eff.durationSec || 600) * 1000;
    }

    if (inst.quantity > 1) inst.quantity -= 1;
    else inv.bagItems.splice(idx, 1);

    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
    ]);
    return { vitals: ch.vitals, consumedItemId: inst.itemId };
  }

  public async craftRecipe(
    accountId: string,
    characterId: string,
    recipeId: string,
    idemKey?: string,
  ) {
    if (idemKey) {
      const replay = await this.idempotency.getReplay(accountId, idemKey);
      if (replay) return replay;
    }

    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    if (!inv) throw new NotFoundException('Inventory not found');
    const recipe = this.catalog.catalog.byId.recipes.get(recipeId);
    if (!recipe) throw new NotFoundException(`Recipe ${recipeId} not found`);

    const goldCost = Number(recipe.goldCost || 0);
    if (ch.wallet.gold < goldCost) {
      throw new BadRequestException(`Insufficient Gold (need ${goldCost}, have ${ch.wallet.gold})`);
    }
    const ingredients: Array<{ itemId: string; qty: number }> = (recipe.ingredients || []).map((i: any) => ({
      itemId: i.itemId,
      qty: Number(i.qty || 1),
    }));
    this.consumeItemsFromBag(inv, ingredients);

    const beforeGold = ch.wallet.gold;
    ch.wallet.gold -= goldCost;
    if (recipe.craftingTokenReward) {
      ch.wallet.craftingToken += Number(recipe.craftingTokenReward);
    }
    const createdItem = this.addItemToBag(inv, characterId, recipe.outputItemId, Number(recipe.outputQty || 1));
    this.characters.applyExp(ch, Number(recipe.expReward || 15));
    this.incrementQuestProgress(ch, 'CRAFT_ITEM', recipe.outputItemId, Number(recipe.outputQty || 1));
    ch.updatedAt = new Date().toISOString();

    const txId = crypto.randomUUID();
    const mutations: any[] = [
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
    ];
    if (goldCost > 0) {
      const ledgerEntry: CurrencyLedgerEntry = {
        entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        txId,
        characterId,
        currency: 'GOLD',
        delta: -goldCost,
        beforeBalance: beforeGold,
        afterBalance: ch.wallet.gold,
        reason: `CRAFT:${recipeId}`,
        createdAt: new Date().toISOString(),
      };
      mutations.push(this.db.buildLedgerMutation(ledgerEntry));
    }

    await this.db.runTransaction(mutations, { txId });
    const result = {
      txId,
      recipeId,
      createdItem,
      wallet: ch.wallet,
      level: ch.level,
      exp: ch.exp,
    };
    if (idemKey) await this.idempotency.recordResponse(accountId, idemKey, result);
    return result;
  }

  /**
   * 100% Deterministic Weapon Enhancement (+0 -> +10, NO breakage/downgrade in MVP)
   */
  public async enhanceWeapon(
    accountId: string,
    characterId: string,
    itemInstanceId: string,
    idemKey?: string,
  ) {
    if (idemKey) {
      const replay = await this.idempotency.getReplay(accountId, idemKey);
      if (replay) return replay;
    }

    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    const homestead = this.db.readEntity<HomesteadEntity>(`homesteads/${characterId}.json`);
    if (!inv) throw new NotFoundException('Inventory not found');

    const inst = inv.bagItems.find((i) => i.instanceId === itemInstanceId);
    if (!inst) throw new NotFoundException('Weapon instance not found');
    const tmpl = this.catalog.catalog.byId.items.get(inst.itemId);
    if (!tmpl || tmpl.category !== 'WEAPON') {
      throw new BadRequestException('Only weapons can be enhanced');
    }
    if (inst.enhancementLevel >= 10) {
      throw new BadRequestException('Weapon is already at maximum enhancement +10');
    }

    const nextLevel = inst.enhancementLevel + 1;
    const tier = ENHANCEMENT_TABLE_1_TO_10[nextLevel - 1];
    const blacksmithLv = Math.max(
      1,
      ...(homestead?.buildings.filter((b) => b.buildingId === 'bld_blacksmith').map((b) => b.level) || [1]),
    );
    if (blacksmithLv < tier.requiredBlacksmithLevel) {
      throw new BadRequestException(
        `Enhancement +${nextLevel} requires Blacksmith Level ${tier.requiredBlacksmithLevel} (current Lv ${blacksmithLv})`,
      );
    }
    if (ch.wallet.gold < tier.goldCost) {
      throw new BadRequestException(`Insufficient Gold (need ${tier.goldCost}, have ${ch.wallet.gold})`);
    }
    this.consumeItemsFromBag(inv, tier.materials);

    const beforeGold = ch.wallet.gold;
    const fromLevel = inst.enhancementLevel;
    ch.wallet.gold -= tier.goldCost;
    inst.enhancementLevel = nextLevel;
    const txId = crypto.randomUUID();
    const now = new Date().toISOString();

    ch.upgradeHistory.unshift({
      txId,
      itemInstanceId: inst.instanceId,
      itemId: inst.itemId,
      fromLevel,
      toLevel: nextLevel,
      goldSpent: tier.goldCost,
      createdAt: now,
    });
    if (ch.upgradeHistory.length > 50) ch.upgradeHistory.length = 50;

    this.incrementQuestProgress(ch, 'ENHANCE_WEAPON', inst.itemId, 1);
    ch.updatedAt = now;

    const ledgerEntry: CurrencyLedgerEntry = {
      entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      txId,
      characterId,
      currency: 'GOLD',
      delta: -tier.goldCost,
      beforeBalance: beforeGold,
      afterBalance: ch.wallet.gold,
      reason: `ENHANCE:${inst.itemId}:+${fromLevel}->+${nextLevel}`,
      createdAt: now,
    };

    await this.db.runTransaction(
      [
        { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
        { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
        this.db.buildLedgerMutation(ledgerEntry),
      ],
      { txId },
    );

    const baseAtk = Number(tmpl.baseStats?.atk || 20);
    const result = {
      txId,
      itemInstanceId: inst.instanceId,
      itemId: inst.itemId,
      fromLevel,
      toLevel: nextLevel,
      newWeaponAtk: enhancedWeaponAtk(baseAtk, nextLevel),
      goldSpent: tier.goldCost,
      wallet: ch.wallet,
      computedStats: this.characters.computeStats(ch, inv),
    };
    if (idemKey) await this.idempotency.recordResponse(accountId, idemKey, result);
    return result;
  }

  public async dismantleItem(accountId: string, characterId: string, itemInstanceId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    if (!inv) throw new NotFoundException('Inventory not found');
    const equippedValues = Object.values(ch.equippedSlots || {});
    if (equippedValues.includes(itemInstanceId)) {
      throw new BadRequestException('Unequip the item before dismantling');
    }
    const idx = inv.bagItems.findIndex((i) => i.instanceId === itemInstanceId);
    if (idx < 0) throw new NotFoundException('Item not found in bag');
    const inst = inv.bagItems[idx];
    inv.bagItems.splice(idx, 1);

    const rewardQty = Math.max(1, 1 + inst.enhancementLevel);
    this.addItemToBag(inv, characterId, 'mat_copper_ingot', rewardQty);
    ch.wallet.craftingToken += 2;

    await this.db.runTransaction([
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
    ]);
    return { dismantledInstanceId: itemInstanceId, refundedMat: 'mat_copper_ingot', refundedQty: rewardQty, wallet: ch.wallet };
  }

  public getEnhancementTable() {
    return ENHANCEMENT_TABLE_1_TO_10;
  }

  public incrementQuestProgress(ch: CharacterEntity, type: string, targetId: string, qty: number): void {
    for (const qp of ch.quests) {
      if (qp.status !== 'ACTIVE') continue;
      const tmpl = this.catalog.catalog.byId.quests.get(qp.questId);
      if (!tmpl?.objectives) continue;
      let allDone = true;
      for (const obj of tmpl.objectives) {
        const matchesType = obj.type === type || (type === 'GATHER_ITEM' && obj.type === 'COLLECT_ITEM');
        const matchesTarget = !obj.targetId || obj.targetId === targetId || obj.targetId === 'ANY';
        if (matchesType && matchesTarget) {
          const cur = qp.progress[obj.objectiveId] || 0;
          qp.progress[obj.objectiveId] = Math.min(obj.requiredQty, cur + qty);
        }
        if ((qp.progress[obj.objectiveId] || 0) < obj.requiredQty) {
          allDone = false;
        }
      }
      if (allDone) {
        qp.status = 'COMPLETED';
        qp.completedAt = new Date().toISOString();
      }
    }
  }
}
