import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  CONSTITUTION_VERSION,
  HealthCheckResponse,
  PROTOCOL_VERSION,
} from '@eldoria/shared';
import { CatalogService } from '../../database/catalog.service';
import { JsonDatabaseEngine } from '../../database/json-database.engine';
import { AssetManifestService, LocalMinioService } from '../../infrastructure/minio/local-minio.service';
import { LocalRedisService } from '../../infrastructure/redis/local-redis.service';

@Controller('api/v1')
export class HealthAndAssetsController {
  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(LocalRedisService) private readonly redis: LocalRedisService,
    @Inject(LocalMinioService) private readonly minio: LocalMinioService,
    @Inject(AssetManifestService) private readonly manifestService: AssetManifestService,
  ) {}

  @Get('health')
  async getHealth(@Res() res: Response): Promise<void> {
    const dbOk = this.db.isHealthy();
    const catOk = this.catalog.isLoaded();
    const redisMode = this.redis.getMode();
    const redisLatency = await this.redis.pingLatencyMs();
    const minioMode = this.minio.getMode();
    const manifestVer = this.manifestService.getVersion();

    const overallStatus: HealthCheckResponse['status'] =
      !dbOk || !catOk
        ? 'DOWN'
        : redisMode !== 'CONNECTED' || minioMode !== 'MINIO'
          ? 'DEGRADED'
          : 'OK';

    const payload: HealthCheckResponse = {
      status: overallStatus,
      protocolVersion: PROTOCOL_VERSION,
      constitutionVersion: CONSTITUTION_VERSION,
      serverTime: new Date().toISOString(),
      components: {
        jsonPrimaryDb: {
          status: dbOk ? 'UP' : 'DOWN',
          walPending: this.db.getPendingWalCount(),
          schemaVersion: this.db.schemaVersion,
        },
        gameCatalog: {
          status: catOk ? 'UP' : 'DOWN',
          filesLoaded: catOk ? this.catalog.catalog.filesLoaded : 0,
          manifestHash: catOk ? this.catalog.catalog.manifestHash : '',
        },
        localRedis: {
          status: redisMode === 'CONNECTED' ? 'UP' : 'DEGRADED',
          mode: redisMode,
          latencyMs: redisLatency,
        },
        localMinio: {
          status: minioMode === 'MINIO' ? 'UP' : 'DEGRADED',
          mode: minioMode,
          assetsBucket: this.minio.assetsBucket,
          backupsBucket: this.minio.backupsBucket,
          assetManifestVersion: manifestVer,
        },
      },
    };

    const httpCode = overallStatus === 'DOWN' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(httpCode).json(payload);
  }

  @Get('assets/manifest')
  getAssetManifest() {
    return this.manifestService.getManifestPayload();
  }

  @Get('assets/clips')
  getAnimationClips() {
    return {
      version: this.manifestService.getVersion(),
      totalClips: this.manifestService.getClips().length,
      clips: this.manifestService.getClips(),
    };
  }

  @Get('catalog')
  getCatalogSummary() {
    const c = this.catalog.catalog;
    return {
      manifestHash: c.manifestHash,
      characters: c.characters,
      skills: c.skills,
      monsters: c.monsters,
      bosses: c.bosses,
      items: c.items,
      equipmentSets: c.equipmentSets,
      recipes: c.recipes,
      crops: c.crops,
      animals: c.animals,
      buildings: c.buildings,
      quests: c.quests,
      gachaBanners: c.gachaBanners,
      gachaStarEssenceShop: c.gachaStarEssenceShop,
    };
  }
}
