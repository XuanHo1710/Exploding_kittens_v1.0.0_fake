import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { LocalMinioModule } from './infrastructure/minio/local-minio.module';
import { LocalRedisModule } from './infrastructure/redis/local-redis.module';
import { CharacterController } from './modules/character/character.controller';
import { CharacterService } from './modules/character/character.service';
import { EconomyInventoryService } from './modules/gameplay/economy-inventory.service';
import { GachaService } from './modules/gameplay/gacha.service';
import { GameGateway } from './modules/gameplay/game.gateway';
import { GameplayController } from './modules/gameplay/gameplay.controller';
import { HomesteadService } from './modules/gameplay/homestead.service';
import { QuestSocialService } from './modules/gameplay/quest-social.service';
import { WorldSimulationService } from './modules/gameplay/world-simulation.service';
import { HealthAndAssetsController } from './modules/health/health.controller';
import { AuthController } from './modules/identity/auth.controller';
import { JwtAuthGuard } from './modules/identity/auth.guard';
import { AuthService } from './modules/identity/auth.service';

@Module({
  imports: [DatabaseModule, LocalRedisModule, LocalMinioModule],
  controllers: [
    HealthAndAssetsController,
    AuthController,
    CharacterController,
    GameplayController,
  ],
  providers: [
    AuthService,
    JwtAuthGuard,
    CharacterService,
    EconomyInventoryService,
    HomesteadService,
    GachaService,
    QuestSocialService,
    WorldSimulationService,
    GameGateway,
  ],
})
export class AppModule {}
