import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuestsService } from './quests.service';

@Controller('quests')
@UseGuards(JwtAuthGuard)
export class QuestsController {
  constructor(private questsService: QuestsService) {}

  @Get()
  getQuests(@Req() req: { user: { userId: string } }) {
    return this.questsService.getPlayerQuests(req.user.userId);
  }

  @Post(':questId/claim')
  claimQuest(
    @Req() req: { user: { userId: string } },
    @Param('questId') questId: string,
  ) {
    return this.questsService.claimQuest(req.user.userId, questId);
  }
}
