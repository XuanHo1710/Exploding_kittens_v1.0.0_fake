import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { GameGateway } from './game/game.gateway';
import { RoomsService } from './game/rooms.service';
import { AVATAR_DIR, AvatarController } from './avatar/avatar.controller';
import { DbService } from './store/db.service';
import { AccountsService } from './store/accounts.service';
import { AccountController } from './store/account.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot(
      // Ảnh avatar người chơi đã tải lên
      { rootPath: AVATAR_DIR, serveRoot: '/avatars', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
      // Bản build của client (client/dist) được server phục vụ luôn, chỉ cần chạy 1 tiến trình
      { rootPath: join(__dirname, '..', '..', '..', '..', 'client', 'dist'), exclude: ['/api/{*path}', '/avatars/{*path}'] },
    ),
  ],
  controllers: [AvatarController, AccountController],
  providers: [DbService, AccountsService, RoomsService, GameGateway],
})
export class AppModule {}
