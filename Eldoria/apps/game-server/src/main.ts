import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LocalMinioService } from './infrastructure/minio/local-minio.service';

export async function bootstrapGameServer(portOverride?: number) {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  });

  // Serve local assets/v1 fallback (and offline asset mode) with CORS + cache headers
  const minio = app.get(LocalMinioService);
  if (fs.existsSync(minio.localAssetsDir)) {
    app.use(
      '/assets',
      express.static(minio.localAssetsDir, {
        maxAge: '1h',
        setHeaders: (res) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
        },
      }),
    );
  }

  // Serve built React+Phaser client bundle if present (single-container local Docker deployment)
  const clientDistCandidates = [
    path.resolve(process.cwd(), 'apps/client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ];
  for (const distDir of clientDistCandidates) {
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      app.use(express.static(distDir));
      break;
    }
  }

  app.enableShutdownHooks();
  const port = portOverride ?? Number(process.env.PORT || 3001);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `Eldoria: Forgotten Wilds Game Server listening on http://127.0.0.1:${port} (JSON Primary DB + Local Redis/MinIO adapters)`,
    'Bootstrap',
  );
  return app;
}

if (require.main === module) {
  void bootstrapGameServer();
}
