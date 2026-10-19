import { Body, Controller, Post } from '@nestjs/common';
import { AccountsService } from './accounts.service';

/** Tài khoản bằng tên + PIN; chỉ trả thành công sau khi nơi lưu chính xác nhận. */
@Controller('api/account')
export class AccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('register')
  register(@Body() b: { playerId?: string; name?: string; pin?: string; avatar?: string }) {
    return this.accounts.register(b?.playerId, b?.name, b?.pin, b?.avatar);
  }

  @Post('login')
  login(@Body() b: { name?: string; pin?: string }) {
    return this.accounts.login(b?.name, b?.pin);
  }
}
