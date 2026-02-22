import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  LeaderboardType,
  LeaderboardResponse,
  LeaderboardEntry,
  GAME_CONFIG,
  calculateHeroStats,
  HeroTemplate,
  HeroSkill,
} from '@hero-wars/shared';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLogger } from '../common/logger/structured-logger';

@Injectable()
export class LeaderboardService implements OnModuleInit {
  private readonly POWER_KEY = 'leaderboard:power';
  private readonly CAMPAIGN_KEY = 'leaderboard:campaign';
  private readonly BATTLES_KEY = 'leaderboard:battles';

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Rebuild leaderboards on startup if Redis is empty
    try {
      const powerCount = await this.redis.zCard(this.POWER_KEY);
      if (powerCount === 0) {
        StructuredLogger.info('leaderboard.rebuild.start');
        await this.rebuildAllLeaderboards();
        StructuredLogger.info('leaderboard.rebuild.done');
      }
    } catch (err) {
      StructuredLogger.error('leaderboard.rebuild.failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private getKey(type: LeaderboardType): string {
    switch (type) {
      case 'power':
        return this.POWER_KEY;
      case 'campaign':
        return this.CAMPAIGN_KEY;
      case 'battles':
        return this.BATTLES_KEY;
    }
  }

  async updateScore(
    playerId: string,
    type: LeaderboardType,
    score: number,
  ): Promise<void> {
    await this.redis.zAdd(this.getKey(type), score, playerId);
  }

  async getLeaderboard(
    type: LeaderboardType,
    playerId: string,
    offset: number,
    limit: number,
  ): Promise<LeaderboardResponse> {
    const key = this.getKey(type);

    // Clamp limit
    limit = Math.min(Math.max(limit, 1), GAME_CONFIG.leaderboard.pageSize);
    offset = Math.max(offset, 0);

    // Get entries from Redis sorted set (descending by score)
    const entries = await this.redis.zRevRange(key, offset, offset + limit - 1);
    const total = await this.redis.zCard(key);

    // Batch lookup player details
    const playerIds = entries.map((e) => e.value);
    const players =
      playerIds.length > 0
        ? await this.prisma.player.findMany({
            where: { id: { in: playerIds } },
            select: { id: true, username: true, level: true },
          })
        : [];

    const playerMap = new Map(players.map((p) => [p.id, p]));

    const leaderboard: LeaderboardEntry[] = entries.map((entry, index) => {
      const player = playerMap.get(entry.value);
      return {
        rank: offset + index + 1,
        playerId: entry.value,
        username: player?.username ?? 'Unknown',
        score: entry.score,
        level: player?.level ?? 0,
      };
    });

    // Get current player's rank
    let playerRank: LeaderboardEntry | null = null;
    const rank = await this.redis.zRevRank(key, playerId);
    if (rank !== null) {
      const score = await this.redis.zScore(key, playerId);
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { username: true, level: true },
      });
      playerRank = {
        rank: rank + 1,
        playerId,
        username: player?.username ?? 'Unknown',
        score: score ?? 0,
        level: player?.level ?? 0,
      };
    }

    return { leaderboard, playerRank, total };
  }

  async calculatePowerScore(playerId: string): Promise<number> {
    const heroes = await this.prisma.playerHero.findMany({
      where: { playerId },
      include: { template: true },
    });

    let totalPower = 0;
    for (const hero of heroes) {
      const template: HeroTemplate = {
        id: hero.template.id,
        name: hero.template.name,
        class: hero.template.class as HeroTemplate['class'],
        rarity: hero.template.rarity as HeroTemplate['rarity'],
        baseHp: hero.template.baseHp,
        baseAttack: hero.template.baseAttack,
        baseDefense: hero.template.baseDefense,
        baseSpeed: hero.template.baseSpeed,
        skills: hero.template.skills as unknown as HeroSkill[],
        spriteKey: hero.template.spriteKey,
      };
      const stats = calculateHeroStats(template, hero.level, hero.stars);
      totalPower += stats.hp + stats.attack + stats.defense + stats.speed;
    }

    return totalPower;
  }

  async calculateCampaignScore(playerId: string): Promise<number> {
    const result = await this.prisma.campaignProgress.aggregate({
      where: { playerId },
      _sum: { stars: true },
    });
    return result._sum.stars ?? 0;
  }

  async calculateBattleScore(playerId: string): Promise<number> {
    const result = await this.prisma.battle.count({
      where: { playerId, validated: true, result: 'victory' },
    });
    return result;
  }

  async refreshPlayerScores(playerId: string): Promise<void> {
    const [power, campaign, battles] = await Promise.all([
      this.calculatePowerScore(playerId),
      this.calculateCampaignScore(playerId),
      this.calculateBattleScore(playerId),
    ]);

    await Promise.all([
      this.updateScore(playerId, 'power', power),
      this.updateScore(playerId, 'campaign', campaign),
      this.updateScore(playerId, 'battles', battles),
    ]);
  }

  private async rebuildAllLeaderboards(): Promise<void> {
    const players = await this.prisma.player.findMany({
      select: { id: true },
    });

    for (const player of players) {
      try {
        await this.refreshPlayerScores(player.id);
      } catch (err) {
        StructuredLogger.error('leaderboard.rebuild.player.failed', {
          playerId: player.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
