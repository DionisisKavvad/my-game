import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GAME_CONFIG,
  PlayerProfileResponse,
  calculateHeroStats,
  HeroTemplate,
  HeroSkill,
} from '@hero-wars/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string): Promise<PlayerProfileResponse> {
    const player = await this.prisma.player.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        level: true,
        xp: true,
        gold: true,
        gems: true,
        energy: true,
        maxEnergy: true,
        createdAt: true,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    // Aggregate stats in parallel
    const [battleStats, victoryCount, campaignStats, heroStats, questsClaimed, heroes] =
      await Promise.all([
        this.prisma.battle.count({
          where: { playerId: userId, validated: true },
        }),
        this.prisma.battle.count({
          where: { playerId: userId, validated: true, result: 'victory' },
        }),
        this.prisma.campaignProgress.aggregate({
          where: { playerId: userId },
          _sum: { stars: true },
          _count: true,
        }),
        this.prisma.playerHero.aggregate({
          where: { playerId: userId },
          _count: true,
          _max: { level: true },
        }),
        this.prisma.dailyQuest.count({
          where: { playerId: userId, claimed: true },
        }),
        this.prisma.playerHero.findMany({
          where: { playerId: userId },
          include: { template: true },
        }),
      ]);

    // Calculate power score
    let powerScore = 0;
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
      powerScore += stats.hp + stats.attack + stats.defense + stats.speed;
    }

    const totalBattles = battleStats;
    const battlesWon = victoryCount;
    const battlesLost = totalBattles - battlesWon;
    const winRate = totalBattles > 0 ? (battlesWon / totalBattles) * 100 : 0;

    return {
      id: player.id,
      username: player.username,
      level: player.level,
      xp: player.xp,
      xpToNextLevel: GAME_CONFIG.xp.playerXpPerLevel(player.level),
      gold: player.gold,
      gems: player.gems,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      createdAt: player.createdAt,
      stats: {
        totalBattles,
        battlesWon,
        battlesLost,
        winRate,
        campaignStarsTotal: campaignStats._sum.stars ?? 0,
        campaignStagesCompleted: campaignStats._count,
        totalHeroes: heroStats._count,
        highestHeroLevel: heroStats._max.level ?? 0,
        totalQuestsClaimed: questsClaimed,
        powerScore,
      },
    };
  }
}
