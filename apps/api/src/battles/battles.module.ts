import { Module } from '@nestjs/common';
import { BattlesController } from './battles.controller';
import { BattlesService } from './battles.service';
import { QuestsModule } from '../quests/quests.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [QuestsModule, LeaderboardModule],
  controllers: [BattlesController],
  providers: [BattlesService],
  exports: [BattlesService],
})
export class BattlesModule {}
