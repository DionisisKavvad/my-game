import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/logger/structured-logger';

@Injectable()
export class QuestsService {
  constructor(private prisma: PrismaService) {}

  async claimQuest(playerId: string, questId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: only succeeds if quest is completed and not yet claimed
      const result = await tx.dailyQuest.updateMany({
        where: { playerId, questId, completed: true, claimed: false },
        data: { claimed: true },
      });

      if (result.count === 0) {
        throw new ConflictException('Quest already claimed or not completed');
      }

      // TODO: Define quest reward amounts per quest type in Sprint 3
      const rewardGold = 100;
      const rewardGems = 10;

      await tx.player.update({
        where: { id: playerId },
        data: {
          gold: { increment: rewardGold },
          gems: { increment: rewardGems },
        },
      });

      StructuredLogger.info('quest.claimed', {
        playerId,
        questId,
        rewardGold,
        rewardGems,
      });

      return { questId, rewards: { gold: rewardGold, gems: rewardGems } };
    });
  }

  async getPlayerQuests(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return this.prisma.dailyQuest.findMany({
      where: { playerId },
      orderBy: { resetDate: 'desc' },
    });
  }
}
