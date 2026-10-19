import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { clientIp, RateLimiter } from '../rate-limit';
import { AccountsService } from './accounts.service';

const TOO_FAST = () => new HttpException('Thao tác quá nhanh, thử lại sau ít phút nhé.', HttpStatus.TOO_MANY_REQUESTS);

/** Tài khoản bằng tên + PIN; chỉ trả thành công sau khi nơi lưu chính xác nhận. */
@Controller('api/account')
export class AccountController {
  /** Chống tạo tài khoản hàng loạt và dò PIN theo IP */
  private readonly registerLimit = new RateLimiter(5, 10 * 60_000);
  private readonly loginLimit = new RateLimiter(20, 60_000);

  constructor(private readonly accounts: AccountsService) {}

  @Post('register')
  register(@Req() req: IncomingMessage, @Body() b: { playerId?: string; name?: string; pin?: string; avatar?: string }) {
    if (!this.registerLimit.hit(clientIp(req))) throw TOO_FAST();
    return this.accounts.register(b?.playerId, b?.name, b?.pin, b?.avatar);
  }

  @Post('login')
  login(@Req() req: IncomingMessage, @Body() b: { name?: string; pin?: string }) {
    if (!this.loginLimit.hit(clientIp(req))) throw TOO_FAST();
    return this.accounts.login(b?.name, b?.pin);
  }

  /** Huỷ token của phiên này trên server (token cũ không dùng lại được nữa) */
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() b: { playerId?: string; token?: string }) {
    const playerId = typeof b?.playerId === 'string' ? b.playerId : '';
    const token = typeof b?.token === 'string' ? b.token.slice(0, 100) : '';
    if (this.accounts.verify(playerId, token)) await this.accounts.logout(playerId, token);
    return { ok: true };
  }
}
