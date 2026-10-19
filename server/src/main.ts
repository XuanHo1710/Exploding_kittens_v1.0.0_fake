import 'reflect-metadata';
import './config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { AVATAR_DIR } from './avatar/avatar.controller';

// Promise bị từ chối mà không ai bắt: ghi log thay vì để Node dừng cả server (mất mọi phòng đang chơi)
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

async function bootstrap() {
  mkdirSync(AVATAR_DIR, { recursive: true });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });
  // Đợi các giao dịch tài khoản đang ghi trước khi tắt server.
  app.enableShutdownHooks();
  app.enableCors();
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🐱💣 Mèo Nổ server chạy ở http://localhost:${port}`);
}
bootstrap().catch(() => {
  console.error('Không khởi động được backend. Kiểm tra cấu hình và kết nối nơi lưu tài khoản.');
  process.exitCode = 1;
});
