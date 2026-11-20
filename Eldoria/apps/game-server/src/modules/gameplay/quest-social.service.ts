import crypto from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogService } from '../../database/catalog.service';
import { CurrencyLedgerEntry, JsonDatabaseEngine } from '../../database/json-database.engine';
import { InventoryEntity, PartyEntity, SocialProfileEntity } from '../../domain/entities';
import { RedisPresenceService } from '../../infrastructure/redis/redis-ephemeral.services';
import { CharacterService } from '../character/character.service';
import { EconomyInventoryService } from './economy-inventory.service';

const NPC_DIALOGUES: Record<string, { npcId: string; name: string; roleVi: string; greetingVi: string; tipsVi: string[] }> = {
  npc_elder_rowan: {
    npcId: 'npc_elder_rowan',
    name: 'Elder Rowan',
    roleVi: 'Trưởng Làng Greenhaven',
    greetingVi: 'Chào nhà thám hiểm! Luống Sunwheat ngoài sân nhà đã chín rồi — thu hoạch và rèn vũ khí trước khi tiến vào Whispering Forest nhé!',
    tipsVi: [
      'Nhấn F để thu hoạch, nhặt chiến lợi phẩm hoặc vào cổng Whispering Forest.',
      'Hoàn thành nhiệm vụ để nhận miễn phí Starlight Shards quay Gacha công bằng!',
    ],
  },
  npc_smith_garrik: {
    npcId: 'npc_smith_garrik',
    name: 'Blacksmith Garrik',
    roleVi: 'Thợ Rèn Lão Luyện',
    greetingVi: 'Ở lò rèn của ta không có chuyện đập gãy vũ khí! Cứ đủ nguyên liệu và vàng là rèn chắc chắn 100% từ +0 đến +10!',
    tipsVi: [
      'Nung Quặng Đồng (Copper Ore) thành Copper Ingot để cường hóa +1..+3.',
      'Đánh Boss Thornback Elder ở Mossroot Hollow để săn Thorn Heartwood cho +6..+10.',
    ],
  },
  npc_herbalist_mira: {
    npcId: 'npc_herbalist_mira',
    name: 'Herbalist Mira',
    roleVi: 'Nhà Thảo Dược & Nông Sản',
    greetingVi: 'Cây trồng lớn ngay cả khi bạn rời game (tính bằng đồng hồ máy chủ). Đừng quên tưới nước và chăm gà ở chuồng nhé!',
    tipsVi: [
      'Nấu ăn từ nông sản giúp tăng Buff ATK và hồi phục Stamina nhanh chóng.',
    ],
  },
  npc_scout_talia: {
    npcId: 'npc_scout_talia',
    name: 'Scout Talia',
    roleVi: 'Trinh Sát Rừng Thì Thầm',
    greetingVi: 'Phía Đông là Whispering Forest và hầm ngục Mossroot Hollow. Thornback Elder rất sợ nguyên tố LỬA (FIRE) — hãy né vòng cảnh báo đỏ #FF3B3B!',
    tipsVi: [
      'Có thể lập tổ đội tối đa 4 người trước khi vào đấu trường Boss.',
      'Phá Poise của Boss để gây Stagger 6 giây và tăng +40% sát thương!',
    ],
  },
};

@Injectable()
export class QuestSocialService {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(EconomyInventoryService) private readonly economy: EconomyInventoryService,
    @Inject(RedisPresenceService) private readonly presence: RedisPresenceService,
  ) {}

  public getNpcDialogue(npcId: string) {
    return NPC_DIALOGUES[npcId] || NPC_DIALOGUES.npc_elder_rowan;
  }

  public listNpcs() {
    return Object.values(NPC_DIALOGUES);
  }

  public async acceptQuest(accountId: string, characterId: string, questId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const tmpl = this.catalog.catalog.byId.quests.get(questId);
    if (!tmpl) throw new NotFoundException(`Quest ${questId} not found`);
    let entry = ch.quests.find((q) => q.questId === questId);
    if (!entry) {
      entry = { questId, status: 'ACTIVE', progress: {}, acceptedAt: new Date().toISOString(), completedAt: null, claimedAt: null };
      ch.quests.push(entry);
    } else if (entry.status === 'AVAILABLE') {
      entry.status = 'ACTIVE';
      entry.acceptedAt = new Date().toISOString();
    } else {
      throw new BadRequestException(`Quest ${questId} is already ${entry.status}`);
    }
    await this.db.writeEntity(`characters/${characterId}.json`, 'CHARACTER', characterId, ch);
    return entry;
  }

  public async claimQuest(accountId: string, characterId: string, questId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`)!;
    const tmpl = this.catalog.catalog.byId.quests.get(questId);
    if (!tmpl) throw new NotFoundException(`Quest ${questId} not found`);
    const entry = ch.quests.find((q) => q.questId === questId);
    if (!entry) throw new NotFoundException('Quest entry not found');
    if (entry.status === 'CLAIMED') throw new BadRequestException('Quest reward already claimed');
    if (entry.status !== 'COMPLETED') throw new BadRequestException('Quest objectives are not yet complete');

    const rewards = tmpl.rewards || {};
    const goldGain = Number(rewards.gold || 0);
    const shardGain = Number(rewards.starlightShard || 0);
    const expGain = Number(rewards.exp || 0);
    const beforeGold = ch.wallet.gold;
    const beforeShards = ch.wallet.starlightShard;

    ch.wallet.gold += goldGain;
    ch.wallet.starlightShard += shardGain;
    ch.wallet.craftingToken += Number(rewards.craftingToken || 0);
    ch.wallet.bossToken += Number(rewards.bossToken || 0);
    this.characters.applyExp(ch, expGain);

    for (const ri of rewards.items || []) {
      this.economy.addItemToBag(inv, characterId, ri.itemId, Number(ri.qty || 1));
    }

    entry.status = 'CLAIMED';
    entry.claimedAt = new Date().toISOString();

    // Auto-unlock next available quest if prerequisite met
    for (const q of ch.quests) {
      if (q.status === 'AVAILABLE') {
        const qDef = this.catalog.catalog.byId.quests.get(q.questId);
        if (qDef?.prereqQuestIds?.includes(questId)) {
          q.status = 'ACTIVE';
          q.acceptedAt = entry.claimedAt;
        }
      }
    }

    const txId = crypto.randomUUID();
    const muts: any[] = [
      { relPath: `characters/${characterId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: characterId, data: ch },
      { relPath: `inventories/${characterId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: characterId, data: inv },
    ];
    if (goldGain > 0) {
      const le: CurrencyLedgerEntry = {
        entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        txId,
        characterId,
        currency: 'GOLD',
        delta: goldGain,
        beforeBalance: beforeGold,
        afterBalance: ch.wallet.gold,
        reason: `QUEST_CLAIM:${questId}`,
        createdAt: entry.claimedAt,
      };
      muts.push(this.db.buildLedgerMutation(le));
    }
    if (shardGain > 0) {
      const se: CurrencyLedgerEntry = {
        entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        txId,
        characterId,
        currency: 'STARLIGHT_SHARD',
        delta: shardGain,
        beforeBalance: beforeShards,
        afterBalance: ch.wallet.starlightShard,
        reason: `QUEST_CLAIM:${questId}`,
        createdAt: entry.claimedAt,
      };
      muts.push(this.db.buildLedgerMutation(se));
    }
    await this.db.runTransaction(muts, { txId });

    return { questId, rewards, wallet: ch.wallet, level: ch.level, exp: ch.exp };
  }

  public async createParty(accountId: string, characterId: string): Promise<PartyEntity> {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const existing = this.findPartyForCharacter(characterId);
    if (existing) return existing;

    const party: PartyEntity = {
      id: `pty_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      leaderId: characterId,
      members: [
        {
          characterId,
          name: ch.name,
          heroId: ch.activeHeroId,
          level: ch.level,
          ready: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    await this.db.writeEntity(`parties/${party.id}.json`, 'PARTY', party.id, party);
    return party;
  }

  public findPartyForCharacter(characterId: string): PartyEntity | null {
    const all = this.db.listEntities<PartyEntity>('parties');
    const found = all.find((e) => e.data.members.some((m) => m.characterId === characterId));
    return found ? found.data : null;
  }

  public async inviteToParty(accountId: string, leaderCharacterId: string, targetCharacterId: string) {
    const party = this.findPartyForCharacter(leaderCharacterId) || (await this.createParty(accountId, leaderCharacterId));
    if (party.leaderId !== leaderCharacterId) throw new ForbiddenException('Only party leader can invite');
    if (party.members.length >= 4) throw new BadRequestException('Party is already full (max 4)');
    const inviteId = `inv_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const payload = {
      inviteId,
      partyId: party.id,
      fromCharacterId: leaderCharacterId,
      toCharacterId: targetCharacterId,
      createdAt: new Date().toISOString(),
    };
    await this.presence.createPartyInvite(inviteId, payload);
    return payload;
  }

  public async acceptPartyInvite(accountId: string, characterId: string, inviteId: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const invite = await this.presence.consumePartyInvite(inviteId);
    if (!invite || invite.toCharacterId !== characterId) {
      throw new NotFoundException('Party invite expired or invalid');
    }
    const party = this.db.readEntity<PartyEntity>(`parties/${invite.partyId}.json`);
    if (!party) throw new NotFoundException('Party no longer exists');
    if (party.members.length >= 4) throw new BadRequestException('Party is full');
    if (!party.members.some((m) => m.characterId === characterId)) {
      party.members.push({
        characterId,
        name: ch.name,
        heroId: ch.activeHeroId,
        level: ch.level,
        ready: false,
      });
      await this.db.writeEntity(`parties/${party.id}.json`, 'PARTY', party.id, party);
    }
    return party;
  }

  public async togglePartyReady(accountId: string, characterId: string) {
    this.characters.getOwnedCharacter(accountId, characterId);
    const party = this.findPartyForCharacter(characterId);
    if (!party) throw new NotFoundException('Not currently in a party');
    const m = party.members.find((x) => x.characterId === characterId);
    if (m) m.ready = !m.ready;
    await this.db.writeEntity(`parties/${party.id}.json`, 'PARTY', party.id, party);
    return party;
  }

  public async leaveParty(accountId: string, characterId: string) {
    this.characters.getOwnedCharacter(accountId, characterId);
    const party = this.findPartyForCharacter(characterId);
    if (!party) return { ok: true };
    party.members = party.members.filter((m) => m.characterId !== characterId);
    if (party.members.length === 0) {
      await this.db.deleteEntity(`parties/${party.id}.json`, 'PARTY', party.id);
    } else {
      if (party.leaderId === characterId) party.leaderId = party.members[0].characterId;
      await this.db.writeEntity(`parties/${party.id}.json`, 'PARTY', party.id, party);
    }
    return { ok: true };
  }

  public async updateFriendOrBlock(
    accountId: string,
    characterId: string,
    action: 'add_friend' | 'remove_friend' | 'block' | 'unblock',
    targetCharacterId: string,
  ) {
    this.characters.getOwnedCharacter(accountId, characterId);
    const profile = this.db.readEntity<SocialProfileEntity>(`social/${characterId}.json`) || {
      characterId,
      friendIds: [],
      blockedIds: [],
      pendingRequests: [],
    };
    if (action === 'add_friend' && !profile.friendIds.includes(targetCharacterId)) {
      profile.friendIds.push(targetCharacterId);
    } else if (action === 'remove_friend') {
      profile.friendIds = profile.friendIds.filter((id) => id !== targetCharacterId);
    } else if (action === 'block' && !profile.blockedIds.includes(targetCharacterId)) {
      profile.blockedIds.push(targetCharacterId);
      profile.friendIds = profile.friendIds.filter((id) => id !== targetCharacterId);
    } else if (action === 'unblock') {
      profile.blockedIds = profile.blockedIds.filter((id) => id !== targetCharacterId);
    }
    await this.db.writeEntity(`social/${characterId}.json`, 'SOCIAL', characterId, profile);
    return profile;
  }
}
