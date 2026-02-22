import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/logger/structured-logger';
import {
  GAME_CONFIG,
  QUEST_DEFINITIONS,
  QuestType,
  DailyQuestResponse,
} from '@hero-wars/shared';

@Injectable()
export class QuestsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Ensure the player has quests for today.
   * Self-healing: deletes stale quests and creates fresh ones if needed.
   */
  async ensurePlayerQuests(playerId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Delete stale quests (self-healing - handles missed cron)
    await this.prisma.dailyQuest.deleteMany({
      where: { playerId, resetDate: { lt: today } },
    });

    // Check if quests already exist for today
    const existing = await this.prisma.dailyQuest.findMany({
      where: { playerId, resetDate: today },
    });

    if (existing.length > 0) return;

    // Select random quests: always include daily_login, pick rest randomly
    const loginQuest = QUEST_DEFINITIONS.find(
      (q) => q.questId === GAME_CONFIG.quests.loginQuestId,
    );
    const otherDefinitions = QUEST_DEFINITIONS.filter(
      (q) => q.questId !== GAME_CONFIG.quests.loginQuestId,
    );

    // Shuffle and pick (dailyQuestCount - 1) from non-login quests
    const shuffled = [...otherDefinitions].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, GAME_CONFIG.quests.dailyQuestCount - 1);

    const questsToCreate = loginQuest ? [loginQuest, ...selected] : selected;

    await this.prisma.dailyQuest.createMany({
      data: questsToCreate.map((def) => ({
        playerId,
        questId: def.questId,
        progress: def.type === 'login' ? 1 : 0,
        target: def.target,
        completed: def.type === 'login',
        claimed: false,
        resetDate: today,
      })),
    });

    StructuredLogger.info('quests.ensured', {
      playerId,
      questCount: questsToCreate.length,
      questIds: questsToCreate.map((q) => q.questId),
    });
  }

  /**
   * Atomically increment quest progress using raw SQL to prevent race conditions.
   * Only increments uncompleted quests of the matching type for today.
   */
  async incrementQuestProgress(
    playerId: string,
    questType: QuestType,
    amount: number = 1,
  ): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Find quest IDs that match this type
    const matchingQuestIds = QUEST_DEFINITIONS.filter(
      (q) => q.type === questType,
    ).map((q) => q.questId);

    if (matchingQuestIds.length === 0) return;

    // Atomic increment + completion check in a single raw SQL statement
    await this.prisma.$executeRaw`
      UPDATE daily_quests
      SET progress = progress + ${amount},
          completed = CASE WHEN progress + ${amount} >= target THEN true ELSE completed END
      WHERE player_id = ${playerId}
        AND quest_id = ANY(${matchingQuestIds})
        AND completed = false
        AND reset_date = ${today}
    `;
  }

  async getPlayerQuests(playerId: string): Promise<DailyQuestResponse[]> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) {
      throw new NotFoundException('Player not found');
    }

    // Ensure quests exist for today (self-healing)
    await this.ensurePlayerQuests(playerId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const quests = await this.prisma.dailyQuest.findMany({
      where: { playerId, resetDate: today },
    });

    // Map DB rows to response with quest definition data
    return quests.map((quest) => {
      const def = QUEST_DEFINITIONS.find((d) => d.questId === quest.questId);
      return {
        questId: quest.questId,
        name: def?.name ?? quest.questId,
        description: def?.description ?? '',
        type: (def?.type ?? 'login') as QuestType,
        target: quest.target,
        progress: Math.min(quest.progress, quest.target),
        completed: quest.completed,
        claimed: quest.claimed,
        rewardGold: def?.rewardGold ?? 0,
        rewardXp: def?.rewardXp ?? 0,
        rewardGems: def?.rewardGems ?? 0,
      };
    });
  }

  async claimQuest(playerId: string, questId: string) {
    // Look up rewards from quest definitions
    const def = QUEST_DEFINITIONS.find((q) => q.questId === questId);
    if (!def) {
      throw new NotFoundException('Unknown quest');
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: only succeeds if quest is completed and not yet claimed
      const result = await tx.dailyQuest.updateMany({
        where: { playerId, questId, completed: true, claimed: false },
        data: { claimed: true },
      });

      if (result.count === 0) {
        throw new ConflictException('Quest already claimed or not completed');
      }

      const rewardGold = def.rewardGold;
      const rewardXp = def.rewardXp;
      const rewardGems = def.rewardGems;

      await tx.player.update({
        where: { id: playerId },
        data: {
          gold: { increment: rewardGold },
          xp: { increment: rewardXp },
          gems: { increment: rewardGems },
        },
      });

      StructuredLogger.info('quest.claimed', {
        playerId,
        questId,
        rewardGold,
        rewardXp,
        rewardGems,
      });

      return { questId, rewards: { gold: rewardGold, xp: rewardXp, gems: rewardGems } };
    });
  }
}
