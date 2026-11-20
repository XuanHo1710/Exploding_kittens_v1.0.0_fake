import { Body, Controller, Get, Inject, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RequestWithAuth } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('api/v1')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('auth/register')
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('auth/login')
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @Post('auth/refresh')
  refresh(@Body() body: { refreshToken?: string }) {
    return this.authService.refresh(body?.refreshToken || '');
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: RequestWithAuth) {
    return this.authService.logout(req.auth.sid);
  }

  @Get('account/preferences')
  @UseGuards(JwtAuthGuard)
  getPreferences(@Req() req: RequestWithAuth) {
    return this.authService.getPreferences(req.auth.sub);
  }

  @Put('account/preferences')
  @UseGuards(JwtAuthGuard)
  updatePreferences(@Req() req: RequestWithAuth, @Body() body: unknown) {
    return this.authService.updatePreferences(req.auth.sub, body);
  }
}
