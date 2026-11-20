import { Global, Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { JsonDatabaseEngine } from './json-database.engine';

@Global()
@Module({
  providers: [JsonDatabaseEngine, CatalogService],
  exports: [JsonDatabaseEngine, CatalogService],
})
export class DatabaseModule {}
