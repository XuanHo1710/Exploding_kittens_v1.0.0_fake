import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RequestWithAuth } from '../identity/auth.guard';
import { CharacterService } from './character.service';

@Controller('api/v1/characters')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(@Inject(CharacterService) private readonly characterService: CharacterService) {}

  @Get()
  list(@Req() req: RequestWithAuth) {
    return this.characterService.listCharactersForAccount(req.auth.sub);
  }

  @Post()
  create(@Req() req: RequestWithAuth, @Body() body: unknown) {
    return this.characterService.createCharacter(req.auth.sub, body);
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.characterService.getCharacterBundle(req.auth.sub, id);
  }

  @Post(':id/stats/allocate')
  allocateStats(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: unknown) {
    return this.characterService.allocateStats(req.auth.sub, id, body);
  }

  @Post(':id/skills/upgrade')
  upgradeSkill(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { skillId: string }) {
    return this.characterService.upgradeSkill(req.auth.sub, id, body?.skillId);
  }

  @Post(':id/hero/switch')
  switchHero(@Req() req: RequestWithAuth, @Param('id') id: string, @Body() body: { heroId: string }) {
    return this.characterService.switchActiveHero(req.auth.sub, id, body?.heroId);
  }
}
