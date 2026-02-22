import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GAME_CONFIG } from '@hero-wars/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/logger/structured-logger';

@Injectable()
export class ScheduledTasksService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reset daily quests at midnight UTC.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'daily-quest-reset' })
  async handleDailyQuestReset() {
    StructuredLogger.info('scheduled.dailyQuestReset.start');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.dailyQuest.updateMany({
      where: {
        resetDate: { lt: today },
      },
      data: {
        progress: 0,
        completed: false,
        claimed: false,
        resetDate: today,
      },
    });

    StructuredLogger.info('scheduled.dailyQuestReset.done', {
      questsReset: result.count,
    });
  }

  /**
   * Regenerate energy for all players every 5 minutes.
   * Adds GAME_CONFIG.energy.regenAmount per tick, capped at maxEnergy.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'energy-regeneration' })
  async handleEnergyRegeneration() {
    StructuredLogger.info('scheduled.energyRegen.start');

    const result = await this.prisma.player.updateMany({
      where: {
        energy: { lt: GAME_CONFIG.energy.maxEnergy },
      },
      data: {
        energy: {
          increment: GAME_CONFIG.energy.regenAmount,
        },
      },
    });

    // Clamp energy to maxEnergy for any players that exceeded the cap
    await this.prisma.player.updateMany({
      where: {
        energy: { gt: GAME_CONFIG.energy.maxEnergy },
      },
      data: {
        energy: GAME_CONFIG.energy.maxEnergy,
      },
    });

    StructuredLogger.info('scheduled.energyRegen.done', {
      playersUpdated: result.count,
    });
  }
}
