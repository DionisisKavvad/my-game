import { Injectable } from '@nestjs/common';
import { CAMPAIGN_STAGES, getStage } from '@hero-wars/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampaignService {
  constructor(private prisma: PrismaService) {}

  async getStages(playerId: string) {
    // Load all campaign progress for this player
    const progressRecords = await this.prisma.campaignProgress.findMany({
      where: { playerId },
    });

    const progressMap = new Map(
      progressRecords.map((p) => [p.stageId, p]),
    );

    return CAMPAIGN_STAGES.map((stage) => {
      const progress = progressMap.get(stage.id);
      return {
        ...stage,
        stars: progress?.stars ?? 0,
        completed: (progress?.stars ?? 0) > 0,
        unlocked: this.isStageUnlocked(stage.id, progressMap),
      };
    });
  }

  async getStageById(playerId: string, stageId: string) {
    const stage = getStage(stageId);
    if (!stage) return null;

    const progress = await this.prisma.campaignProgress.findUnique({
      where: {
        playerId_stageId: { playerId, stageId },
      },
    });

    const progressRecords = await this.prisma.campaignProgress.findMany({
      where: { playerId },
    });
    const progressMap = new Map(
      progressRecords.map((p) => [p.stageId, p]),
    );

    return {
      ...stage,
      stars: progress?.stars ?? 0,
      completed: (progress?.stars ?? 0) > 0,
      unlocked: this.isStageUnlocked(stageId, progressMap),
    };
  }

  private isStageUnlocked(
    stageId: string,
    progressMap: Map<string, { stars: number }>,
  ): boolean {
    if (stageId === '1-1') return true;

    const [chapterStr, stageStr] = stageId.split('-');
    const chapter = parseInt(chapterStr, 10);
    const stageNum = parseInt(stageStr, 10);

    let prevStageId: string;
    if (stageNum === 1) {
      prevStageId = `${chapter - 1}-3`;
    } else {
      prevStageId = `${chapter}-${stageNum - 1}`;
    }

    const prevProgress = progressMap.get(prevStageId);
    return (prevProgress?.stars ?? 0) > 0;
  }
}
