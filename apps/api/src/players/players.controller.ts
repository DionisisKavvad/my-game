import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private playersService: PlayersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: { user: { userId: string } }) {
    return this.playersService.getProfile(req.user.userId);
  }
}
