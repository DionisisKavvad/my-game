import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BattlesService } from './battles.service';
import { StartBattleDto } from './dto/start-battle.dto';
import { CompleteBattleDto } from './dto/complete-battle.dto';

@Controller('battles')
@UseGuards(JwtAuthGuard)
export class BattlesController {
  constructor(private battlesService: BattlesService) {}

  @Post('start')
  startBattle(
    @Req() req: { user: { userId: string } },
    @Body() dto: StartBattleDto,
  ) {
    return this.battlesService.startBattle(req.user.userId, dto.stageId);
  }

  @Post('complete')
  completeBattle(
    @Req() req: { user: { userId: string } },
    @Body() dto: CompleteBattleDto,
  ) {
    return this.battlesService.completeBattle(
      req.user.userId,
      dto.battleId,
      dto.clientLog,
    );
  }
}
