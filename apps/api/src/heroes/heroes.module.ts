import { Module } from '@nestjs/common';
import { HeroesController } from './heroes.controller';
import { HeroesService } from './heroes.service';
import { QuestsModule } from '../quests/quests.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [QuestsModule, LeaderboardModule],
  controllers: [HeroesController],
  providers: [HeroesService],
  exports: [HeroesService],
})
export class HeroesModule {}
