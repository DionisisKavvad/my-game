import { Controller, Post, Body, UseGuards, Req, Res, ForbiddenException } from '@nestjs/common';
import { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private setRefreshCookie(res: Response, refreshToken: string, maxAge: number) {
    res.cookie('hw_refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
      maxAge: maxAge * 1000, // convert seconds to ms
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie('hw_refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth',
    });
  }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken, this.authService.getRefreshTtl());
    const { refreshToken, ...body } = result;
    return body;
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refreshToken, this.authService.getRefreshTtl());
    const { refreshToken, ...body } = result;
    return body;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['hw_refresh_token'];
    if (!refreshToken) {
      throw new ForbiddenException('No refresh token');
    }
    const result = await this.authService.refreshByToken(refreshToken);
    this.setRefreshCookie(res, result.refreshToken, this.authService.getRefreshTtl());
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: { user: { userId: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    this.clearRefreshCookie(res);
    return this.authService.logout(req.user.userId);
  }
}
