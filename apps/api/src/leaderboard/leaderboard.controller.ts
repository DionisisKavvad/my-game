import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardType, LeaderboardResponse } from '@hero-wars/shared';

const VALID_LEADERBOARD_TYPES = ['power', 'campaign', 'battles'];

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get(':type')
  getLeaderboard(
    @Param('type') type: string,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Req() req: { user: { userId: string } },
  ): Promise<LeaderboardResponse> {
    if (!VALID_LEADERBOARD_TYPES.includes(type)) {
      throw new BadRequestException(
        `Invalid leaderboard type. Must be one of: ${VALID_LEADERBOARD_TYPES.join(', ')}`,
      );
    }

    return this.leaderboardService.getLeaderboard(
      type as LeaderboardType,
      req.user.userId,
      offset,
      limit,
    );
  }
}
