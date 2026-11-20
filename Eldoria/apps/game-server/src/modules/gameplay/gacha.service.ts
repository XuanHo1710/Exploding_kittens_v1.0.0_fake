import crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../../database/catalog.service';
import { CurrencyLedgerEntry, JsonDatabaseEngine } from '../../database/json-database.engine';
import { GachaHistoryEntry, InventoryEntity } from '../../domain/entities';
import { RedisIdempotencyService } from '../../infrastructure/redis/redis-ephemeral.services';
import { CharacterService } from '../character/character.service';
import { EconomyInventoryService } from './economy-inventory.service';

@Injectable()
export class GachaService {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(EconomyInventoryService) private readonly economy: EconomyInventoryService,
    @Inject(RedisIdempotencyService) private readonly idempotency: RedisIdempotencyService,
  ) {}

  private csprngFloat(): number {
    return crypto.randomInt(0, 1_000_000) / 1_000_000;
  }

  public getBannersCatalog() {
    return {
      banners: this.catalog.catalog.gachaBanners,
      globalRules: this.catalog.catalog.gachaGlobalRules,
      duplicateConversion: this.catalog.catalog.gachaDuplicateConversion,
      starEssenceShop: this.catalog.catalog.gachaStarEssenceShop,
    };
  }

  public async pull(
    accountId: string,
    characterId: string,
    bannerId: string,
    count: 1 | 10,
    idemKey?: string,
  ) {
    if (count !== 1 && count !== 10) {
      throw new BadRequestException('Gacha pull count must be 1 or 10');
    }
    if (idemKey) {
      const replay = await this.idempotency.getReplay(accountId, idemKey);
      if (replay) return replay;
    }

    const banner = this.catalog.catalog.byId.gachaBanners.get(bannerId);
    if (!banner || !banner.active) {
      throw new NotFoundException(`Active banner ${bannerId} not found`);
    }

    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const cost = count === 10 ? Number(banner.cost.tenPull) : Number(banner.cost.singlePull);
    if (ch.wallet.starlightShard < cost) {
      throw new BadRequestException(
        `Insufficient STARLIGHT_SHARD (need ${cost}, have ${ch.wallet.starlightShard})`,
      );
    }

    const group = banner.sharedPityGroup || banner.bannerType;
    if (!ch.pityByGroup[group]) {
      ch.pityByGroup[group] = { pullsSinceHighRarity: 0, pullsSinceEpic: 0, totalPulls: 0 };
    }
    const pity = ch.pityByGroup[group];
    const beforeShards = ch.wallet.starlightShard;
    ch.wallet.starlightShard -= cost;

    const hardPity = Number(banner.pity?.hardPity || 80);
    const softPityStart = Number(banner.pity?.softPityStart || 65);
    const softSlope = Number(banner.pity?.softPitySlope || 0.06);
    const epicPity = Number(banner.pity?.epicPity || 10);
    const mythicSplit = Number(banner.pity?.pityConditionalSplit?.MYTHIC || 0.25);
    const rates = banner.baseRates;
    const baseHigh = Number(rates.MYTHIC || 0) + Number(rates.LEGENDARY || 0);

    const results: GachaHistoryEntry[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < count; i++) {
      pity.pullsSinceHighRarity += 1;
      pity.pullsSinceEpic += 1;
      pity.totalPulls += 1;

      let chosenRarity: string;
      const effectiveHigh =
        pity.pullsSinceHighRarity >= hardPity
          ? 1.0
          : pity.pullsSinceHighRarity >= softPityStart
            ? Math.min(1.0, baseHigh + (pity.pullsSinceHighRarity - softPityStart + 1) * softSlope)
            : baseHigh;

      const r = this.csprngFloat();
      if (r < effectiveHigh) {
        chosenRarity = this.csprngFloat() < mythicSplit ? 'MYTHIC' : 'LEGENDARY';
      } else if (pity.pullsSinceEpic >= epicPity) {
        chosenRarity = 'EPIC';
      } else {
        const rem = (r - effectiveHigh) / Math.max(1e-6, 1 - effectiveHigh);
        const epicNorm = Number(rates.EPIC || 0) / Math.max(1e-6, 1 - baseHigh);
        const rareNorm = Number(rates.RARE || 0) / Math.max(1e-6, 1 - baseHigh);
        const uncomNorm = Number(rates.UNCOMMON || 0) / Math.max(1e-6, 1 - baseHigh);
        if (rem < epicNorm) chosenRarity = 'EPIC';
        else if (rem < epicNorm + rareNorm) chosenRarity = 'RARE';
        else if (rem < epicNorm + rareNorm + uncomNorm) chosenRarity = 'UNCOMMON';
        else chosenRarity = 'COMMON';
      }

      if (chosenRarity === 'MYTHIC' || chosenRarity === 'LEGENDARY') {
        pity.pullsSinceHighRarity = 0;
        pity.pullsSinceEpic = 0;
      } else if (chosenRarity === 'EPIC') {
        pity.pullsSinceEpic = 0;
      }

      const poolArr: string[] = banner.pool?.[chosenRarity] || banner.pool?.RARE || [];
      const rewardId = poolArr[crypto.randomInt(0, Math.max(1, poolArr.length))];

      let isDuplicate = false;
      let starEssenceGranted = 0;

      if (banner.rewardCategory === 'CHARACTER') {
        const existingHero = ch.unlockedHeroes.find((h) => h.heroId === rewardId);
        if (existingHero) {
          isDuplicate = true;
          const conv = this.catalog.catalog.gachaDuplicateConversion?.CHARACTER?.[chosenRarity];
          if (existingHero.constellationLevel < 6) {
            existingHero.constellationLevel += 1;
            starEssenceGranted = Number(conv?.withinConstellationCap?.starEssence || 10);
          } else {
            starEssenceGranted = Number(conv?.overflowBeyondC6?.starEssence || 20);
            if (conv?.overflowBeyondC6?.bonusItemId) {
              this.economy.addItemToBag(inv, characterId, conv.overflowBeyondC6.bonusItemId, Number(conv.overflowBeyondC6.bonusItemQty || 1));
            }
          }
          ch.wallet.starEssence += starEssenceGranted;
        } else {
          ch.unlockedHeroes.push({ heroId: rewardId, constellationLevel: 0, unlockedAt: now });
        }
      } else {
        const alreadyHas = inv.bagItems.some((item) => item.itemId === rewardId);
        this.economy.addItemToBag(inv, characterId, rewardId, 1);
        if (alreadyHas) {
          isDuplicate = true;
          const conv = this.catalog.catalog.gachaDuplicateConversion?.WEAPON?.[chosenRarity];
          starEssenceGranted = Number(conv?.starEssence || 5);
          ch.wallet.starEssence += starEssenceGranted;
          ch.wallet.craftingToken += Number(conv?.craftingToken || 2);
        }
      }

      const entry: GachaHistoryEntry = {
        pullId: `pul_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        bannerId,
        rewardType: banner.rewardCategory === 'CHARACTER' ? 'CHARACTER' : 'WEAPON',
        rewardId,
        rarity: chosenRarity,
        isDuplicate,
        starEssenceGranted,
        pityAtPull: pity.pullsSinceHighRarity,
        pulledAt: now,
      };
      results.push(entry);
      ch.gachaHistory.unshift(entry);
    }

    if (ch.gachaHistory.length > 200) ch.gachaHistory.length = 200;
    ch.updatedAt = now;

    const txId = crypto.randomUUID();
    const ledgerEntry: CurrencyLedgerEntry = {
      entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      txId,
      characterId,
      currency: 'STARLIGHT_SHARD',
      delta: -cost,
      beforeBalance: beforeShards,
      afterBalance: ch.wallet.starlightShard,
      reason: `GACHA_PULL:${bannerId}:x${count}`,
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

    const response = {
      txId,
      bannerId,
      count,
      results,
      pityState: pity,
      wallet: ch.wallet,
      unlockedHeroes: ch.unlockedHeroes,
    };
    if (idemKey) await this.idempotency.recordResponse(accountId, idemKey, response);
    return response;
  }

  public async exchangeStarEssence(accountId: string, characterId: string, offerId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const offer = this.catalog.catalog.gachaStarEssenceShop.find((o) => o.offerId === offerId);
    if (!offer) throw new NotFoundException(`Star Essence offer ${offerId} not found`);

    const cost = Number(offer.costStarEssence);
    if (ch.wallet.starEssence < cost) {
      throw new BadRequestException(`Insufficient STAR_ESSENCE (need ${cost}, have ${ch.wallet.starEssence})`);
    }
    const before = ch.wallet.starEssence;
    ch.wallet.starEssence -= cost;
    const now = new Date().toISOString();

    if (offer.rewardType === 'CHARACTER') {
      const existing = ch.unlockedHeroes.find((h) => h.heroId === offer.rewardId);
      if (existing) existing.constellationLevel = Math.min(6, existing.constellationLevel + 1);
      else ch.unlockedHeroes.push({ heroId: offer.rewardId, constellationLevel: 0, unlockedAt: now });
    } else {
      this.economy.addItemToBag(inv, characterId, offer.rewardId, Number(offer.qty || 1));
    }

    const txId = crypto.randomUUID();
    await this.db.runTransaction(
      [
        { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
        { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
        this.db.buildLedgerMutation({
          entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          txId,
          characterId,
          currency: 'STAR_ESSENCE',
          delta: -cost,
          beforeBalance: before,
          afterBalance: ch.wallet.starEssence,
          reason: `ESSENCE_SHOP:${offerId}`,
          createdAt: now,
        }),
      ],
      { txId },
    );

    return { offerId, rewardId: offer.rewardId, wallet: ch.wallet, unlockedHeroes: ch.unlockedHeroes };
  }
}
