import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EquipmentSlot } from '@eldoria/shared';
import { JwtAuthGuard, RequestWithAuth } from '../identity/auth.guard';
import { EconomyInventoryService } from './economy-inventory.service';
import { GachaService } from './gacha.service';
import { HomesteadService } from './homestead.service';
import { QuestSocialService } from './quest-social.service';

@Controller('api/v1')
export class GameplayController {
  constructor(
    @Inject(EconomyInventoryService) private readonly economy: EconomyInventoryService,
    @Inject(HomesteadService) private readonly homestead: HomesteadService,
    @Inject(GachaService) private readonly gacha: GachaService,
    @Inject(QuestSocialService) private readonly questSocial: QuestSocialService,
  ) {}

  @Get('enhancement/table')
  getEnhancementTable() {
    return { maxLevel: 10, deterministicMvp: true, tiers: this.economy.getEnhancementTable() };
  }

  @Get('gacha/banners')
  getGachaBanners() {
    return this.gacha.getBannersCatalog();
  }

  @Get('npcs')
  listNpcs() {
    return this.questSocial.listNpcs();
  }

  @Get('npcs/:npcId/dialogue')
  getNpcDialogue(@Param('npcId') npcId: string) {
    return this.questSocial.getNpcDialogue(npcId);
  }

  @Post('characters/:id/inventory/equip')
  @UseGuards(JwtAuthGuard)
  equip(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { itemInstanceId: string }) {
    return this.economy.equipItem(req.auth.sub, id, body.itemInstanceId);
  }

  @Post('characters/:id/inventory/unequip')
  @UseGuards(JwtAuthGuard)
  unequip(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { slot: EquipmentSlot }) {
    return this.economy.unequipSlot(req.auth.sub, id, body.slot);
  }

  @Post('characters/:id/inventory/use')
  @UseGuards(JwtAuthGuard)
  useConsumable(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { itemInstanceId: string }) {
    return this.economy.useConsumable(req.auth.sub, id, body.itemInstanceId);
  }

  @Post('characters/:id/inventory/dismantle')
  @UseGuards(JwtAuthGuard)
  dismantle(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { itemInstanceId: string }) {
    return this.economy.dismantleItem(req.auth.sub, id, body.itemInstanceId);
  }

  @Post('characters/:id/crafting/craft')
  @UseGuards(JwtAuthGuard)
  craft(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { recipeId: string },
    @Headers('x-idempotency-key') idemKey?: string,
  ) {
    return this.economy.craftRecipe(req.auth.sub, id, body.recipeId, idemKey);
  }

  @Post('characters/:id/enhancement/upgrade')
  @UseGuards(JwtAuthGuard)
  enhance(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { itemInstanceId: string },
    @Headers('x-idempotency-key') idemKey?: string,
  ) {
    return this.economy.enhanceWeapon(req.auth.sub, id, body.itemInstanceId, idemKey);
  }

  @Get('characters/:id/homestead')
  @UseGuards(JwtAuthGuard)
  getHomestead(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.homestead.getHomestead(req.auth.sub, id);
  }

  @Post('characters/:id/homestead/buildings/place')
  @UseGuards(JwtAuthGuard)
  placeBuilding(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { buildingId: string; tileX: number; tileY: number; rotation?: number },
  ) {
    return this.homestead.placeBuilding(req.auth.sub, id, body);
  }

  @Post('characters/:id/homestead/buildings/upgrade')
  @UseGuards(JwtAuthGuard)
  upgradeBuilding(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { instanceId: string },
  ) {
    return this.homestead.upgradeBuilding(req.auth.sub, id, body.instanceId);
  }

  @Post('characters/:id/homestead/farm/:action')
  @UseGuards(JwtAuthGuard)
  farmAction(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Param('action') action: 'till' | 'plant' | 'water' | 'harvest',
    @Body() body: { plotId: string; cropId?: string },
  ) {
    return this.homestead.farmAction(req.auth.sub, id, action, body);
  }

  @Post('characters/:id/homestead/animals/:action')
  @UseGuards(JwtAuthGuard)
  animalAction(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Param('action') action: 'feed' | 'collect',
    @Body() body: { animalInstanceId: string },
  ) {
    return this.homestead.animalAction(req.auth.sub, id, action, body.animalInstanceId);
  }

  @Post('characters/:id/gacha/pull')
  @UseGuards(JwtAuthGuard)
  gachaPull(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { bannerId: string; count: 1 | 10 },
    @Headers('x-idempotency-key') idemKey?: string,
  ) {
    return this.gacha.pull(req.auth.sub, id, body.bannerId, body.count, idemKey);
  }

  @Post('characters/:id/gacha/exchange')
  @UseGuards(JwtAuthGuard)
  gachaExchange(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { offerId: string },
  ) {
    return this.gacha.exchangeStarEssence(req.auth.sub, id, body.offerId);
  }

  @Post('characters/:id/quests/:questId/accept')
  @UseGuards(JwtAuthGuard)
  acceptQuest(@Req() req: RequestWithAuth, @Param('id') id: string, @Param('questId') questId: string) {
    return this.questSocial.acceptQuest(req.auth.sub, id, questId);
  }

  @Post('characters/:id/quests/:questId/claim')
  @UseGuards(JwtAuthGuard)
  claimQuest(@Req() req: RequestWithAuth, @Param('id') id: string, @Param('questId') questId: string) {
    return this.questSocial.claimQuest(req.auth.sub, id, questId);
  }

  @Get('characters/:id/party')
  @UseGuards(JwtAuthGuard)
  getParty(@Param('id') id: string) {
    return { party: this.questSocial.findPartyForCharacter(id) };
  }

  @Post('characters/:id/party/create')
  @UseGuards(JwtAuthGuard)
  createParty(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.questSocial.createParty(req.auth.sub, id);
  }

  @Post('characters/:id/party/invite')
  @UseGuards(JwtAuthGuard)
  inviteParty(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { targetCharacterId: string }) {
    return this.questSocial.inviteToParty(req.auth.sub, id, body.targetCharacterId);
  }

  @Post('characters/:id/party/accept')
  @UseGuards(JwtAuthGuard)
  acceptParty(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { inviteId: string }) {
    return this.questSocial.acceptPartyInvite(req.auth.sub, id, body.inviteId);
  }

  @Post('characters/:id/party/ready')
  @UseGuards(JwtAuthGuard)
  toggleReady(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.questSocial.togglePartyReady(req.auth.sub, id);
  }

  @Post('characters/:id/party/leave')
  @UseGuards(JwtAuthGuard)
  leaveParty(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.questSocial.leaveParty(req.auth.sub, id);
  }

  @Post('characters/:id/social/:action')
  @UseGuards(JwtAuthGuard)
  socialAction(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Param('action') action: 'add_friend' | 'remove_friend' | 'block' | 'unblock',
    @Body() body: { targetCharacterId: string },
  ) {
    return this.questSocial.updateFriendOrBlock(req.auth.sub, id, action, body.targetCharacterId);
  }
}
