import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GAME_CONFIG } from '@hero-wars/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/logger/structured-logger';

@Injectable()
export class ScheduledTasksService {
  constructor(private prisma: PrismaService) {}

  /**
   * Clean up old daily quests at midnight UTC.
   * Keeps yesterday's quests for a grace period (in-flight battles).
   * ensurePlayerQuests() self-heals any remaining stale quests on access.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'daily-quest-reset' })
  async handleDailyQuestReset() {
    StructuredLogger.info('scheduled.dailyQuestReset.start');

    const yesterday = new Date();
    yesterday.setUTCHours(0, 0, 0, 0);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const result = await this.prisma.dailyQuest.deleteMany({
      where: {
        resetDate: { lt: yesterday },
      },
    });

    StructuredLogger.info('scheduled.dailyQuestReset.done', {
      questsDeleted: result.count,
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
