import { Global, Module } from '@nestjs/common';
import {
  AssetManifestService,
  BackupUploaderService,
  LocalMinioService,
} from './local-minio.service';

@Global()
@Module({
  providers: [LocalMinioService, AssetManifestService, BackupUploaderService],
  exports: [LocalMinioService, AssetManifestService, BackupUploaderService],
})
export class LocalMinioModule {}
