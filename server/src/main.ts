import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { AVATAR_DIR } from './avatar/avatar.controller';

async function bootstrap() {
  mkdirSync(AVATAR_DIR, { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors();
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🐱💣 Mèo Nổ server chạy ở http://localhost:${port}`);
}
bootstrap();
