import { BadRequestException, Body, Controller, HttpException, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RateLimiter } from '../rate-limit';
import { AccountsService } from '../store/accounts.service';

/** server/uploads/avatars – ảnh avatar người chơi tải lên */
export const AVATAR_DIR = join(__dirname, '..', '..', '..', '..', 'uploads', 'avatars');
const MAX_BYTES = 1024 * 1024;

@Controller('api')
export class AvatarController {
  private readonly uploadLimit = new RateLimiter(10, 10 * 60_000);

  constructor(private readonly accounts: AccountsService) {}

  /** Nhận ảnh (data URL, client đã thu nhỏ sẵn) → lưu file → trả đường dẫn /avatars/<file> */
  @Post('avatar')
  upload(@Body() body: { playerId?: string; token?: string; dataUrl?: string }) {
    const playerId = String(body?.playerId ?? '');
    if (!/^[\w-]{8,64}$/.test(playerId)) throw new BadRequestException('playerId không hợp lệ');
    // Chỉ chủ tài khoản mới được thay ảnh của mình
    if (!this.accounts.verify(playerId, typeof body?.token === 'string' ? body.token.slice(0, 100) : '')) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại bằng PIN.');
    }
    if (!this.uploadLimit.hit(playerId)) throw new HttpException('Đổi ảnh quá nhanh, thử lại sau ít phút nhé.', HttpStatus.TOO_MANY_REQUESTS);
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.dataUrl ?? ''));
    if (!m) throw new BadRequestException('Chỉ nhận ảnh png / jpeg / webp');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > MAX_BYTES) throw new BadRequestException('Ảnh tối đa 1MB');

    mkdirSync(AVATAR_DIR, { recursive: true });
    // mỗi người chỉ giữ 1 ảnh: xoá ảnh cũ (khớp đúng tên file của mình, không đụng id khác có cùng tiền tố)
    const own = new RegExp(`^${playerId}-\\d+\\.(png|jpg|webp)$`);
    for (const f of readdirSync(AVATAR_DIR)) if (own.test(f)) unlinkSync(join(AVATAR_DIR, f));
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = `${playerId}-${Date.now()}.${ext}`;
    writeFileSync(join(AVATAR_DIR, file), buf);
    return { url: `/avatars/${file}` };
  }
}
