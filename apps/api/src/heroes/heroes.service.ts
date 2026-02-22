import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  GAME_CONFIG,
  HeroTemplateResponse,
  PlayerHeroResponse,
  UpgradeResult,
  TeamResponse,
  HeroSkill,
  HeroTemplate,
  calculateHeroStats,
} from '@hero-wars/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuestsService } from '../quests/quests.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { StructuredLogger } from '../common/logger/structured-logger';
import { UpgradeHeroDto } from './dto/upgrade-hero.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

type PrismaTransactionClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class HeroesService {
  constructor(
    private prisma: PrismaService,
    private questsService: QuestsService,
    private leaderboardService: LeaderboardService,
  ) {}

  async getTemplates(): Promise<HeroTemplateResponse[]> {
    const templates = await this.prisma.heroTemplate.findMany();
    return templates.map((t) => this.mapTemplate(t));
  }

  async getTemplate(id: string): Promise<HeroTemplateResponse> {
    const template = await this.prisma.heroTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException('Hero template not found');
    }
    return this.mapTemplate(template);
  }

  async getPlayerHeroes(playerId: string): Promise<PlayerHeroResponse[]> {
    const heroes = await this.prisma.playerHero.findMany({
      where: { playerId },
      include: { template: true },
    });
    return heroes.map((h) => this.mapPlayerHero(h));
  }

  async getPlayerHero(playerId: string, heroId: string): Promise<PlayerHeroResponse> {
    const hero = await this.prisma.playerHero.findUnique({
      where: { id: heroId },
      include: { template: true },
    });
    if (!hero || hero.playerId !== playerId) {
      throw new NotFoundException('Hero not found');
    }
    return this.mapPlayerHero(hero);
  }

  async assignStarterHeroes(playerId: string, tx?: PrismaTransactionClient): Promise<void> {
    const db = tx ?? this.prisma;

    // Guard against duplicate assignment
    const existing = await db.playerHero.findFirst({ where: { playerId } });
    if (existing) {
      return;
    }

    const templateIds = GAME_CONFIG.hero.starterHeroTemplateIds;

    await db.playerHero.createMany({
      data: templateIds.map((templateId, i) => ({
        playerId,
        templateId,
        level: 1,
        stars: 1,
        xp: 0,
        equipment: {},
        isInTeam: true,
        teamPosition: i,
      })),
    });

    StructuredLogger.info('heroes.starter.assigned', { playerId, heroCount: templateIds.length });
  }

  async upgradeHero(playerId: string, heroId: string, dto: UpgradeHeroDto): Promise<UpgradeResult> {
    if (dto.type === 'level') {
      return this.levelUpHero(playerId, heroId);
    }
    return this.starUpHero(playerId, heroId);
  }

  async updateTeam(playerId: string, dto: UpdateTeamDto): Promise<TeamResponse> {
    const { heroPositions } = dto;

    // Validate max team size
    if (heroPositions.length > GAME_CONFIG.hero.maxTeamSize) {
      throw new BadRequestException(`Team cannot exceed ${GAME_CONFIG.hero.maxTeamSize} heroes`);
    }

    // Validate unique positions
    const positions = heroPositions.map((hp) => hp.position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Duplicate positions are not allowed');
    }

    // Validate unique heroIds
    const heroIds = heroPositions.map((hp) => hp.heroId);
    if (new Set(heroIds).size !== heroIds.length) {
      throw new BadRequestException('Duplicate heroes are not allowed');
    }

    // Validate all heroes belong to player
    if (heroIds.length > 0) {
      const ownedHeroes = await this.prisma.playerHero.findMany({
        where: { id: { in: heroIds }, playerId },
        select: { id: true },
      });
      if (ownedHeroes.length !== heroIds.length) {
        throw new NotFoundException('One or more heroes not found');
      }
    }

    // Atomic transaction: reset then set
    await this.prisma.$transaction(async (tx) => {
      // Reset all team assignments for this player
      await tx.playerHero.updateMany({
        where: { playerId },
        data: { isInTeam: false, teamPosition: null },
      });

      // Set new team assignments
      for (const hp of heroPositions) {
        await tx.playerHero.update({
          where: { id: hp.heroId },
          data: { isInTeam: true, teamPosition: hp.position },
        });
      }
    });

    StructuredLogger.info('heroes.team.updated', { playerId, teamSize: heroPositions.length });

    return this.getTeam(playerId);
  }

  async getTeam(playerId: string): Promise<TeamResponse> {
    const heroes = await this.prisma.playerHero.findMany({
      where: { playerId, isInTeam: true },
      include: { template: true },
      orderBy: { teamPosition: 'asc' },
    });
    return { heroes: heroes.map((h) => this.mapPlayerHero(h)) };
  }

  async addXp(playerId: string, heroId: string, amount: number): Promise<PlayerHeroResponse> {
    if (amount <= 0) {
      throw new BadRequestException('XP amount must be positive');
    }

    const hero = await this.prisma.playerHero.findUnique({
      where: { id: heroId },
      include: { template: true },
    });
    if (!hero || hero.playerId !== playerId) {
      throw new NotFoundException('Hero not found');
    }

    const updated = await this.prisma.playerHero.update({
      where: { id: heroId },
      data: { xp: { increment: amount } },
      include: { template: true },
    });

    StructuredLogger.info('heroes.xp.added', { playerId, heroId, amount, newXp: updated.xp });

    return this.mapPlayerHero(updated);
  }

  private async levelUpHero(playerId: string, heroId: string): Promise<UpgradeResult> {
    const hero = await this.prisma.playerHero.findUnique({
      where: { id: heroId },
      include: { template: true },
    });
    if (!hero || hero.playerId !== playerId) {
      throw new NotFoundException('Hero not found');
    }

    if (hero.level >= GAME_CONFIG.hero.maxLevel) {
      throw new BadRequestException('Hero is already at max level');
    }

    const xpRequired = GAME_CONFIG.hero.xpPerLevel(hero.level);
    if (hero.xp < xpRequired) {
      throw new BadRequestException('Insufficient XP for level up');
    }

    const goldCost = GAME_CONFIG.hero.goldCostPerLevel(hero.level);
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { gold: true },
    });
    if (!player || player.gold < goldCost) {
      throw new BadRequestException('Insufficient gold for level up');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedHero = await tx.playerHero.update({
        where: { id: heroId },
        data: {
          level: { increment: 1 },
          xp: { decrement: xpRequired },
        },
        include: { template: true },
      });

      const updatedPlayer = await tx.player.update({
        where: { id: playerId },
        data: { gold: { decrement: goldCost } },
        select: { gold: true },
      });

      return { updatedHero, playerGold: updatedPlayer.gold };
    });

    StructuredLogger.info('heroes.upgrade.level', {
      playerId,
      heroId,
      newLevel: result.updatedHero.level,
      goldCost,
    });

    // Fire-and-forget: quest progress + leaderboard
    this.questsService.incrementQuestProgress(playerId, 'upgrade_hero', 1).catch((err) =>
      StructuredLogger.error('heroes.questProgress.failed', {
        playerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    this.leaderboardService
      .calculatePowerScore(playerId)
      .then((score) => this.leaderboardService.updateScore(playerId, 'power', score))
      .catch((err) =>
        StructuredLogger.error('heroes.leaderboard.power.failed', {
          playerId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    return {
      hero: this.mapPlayerHero(result.updatedHero),
      goldSpent: goldCost,
      playerGoldRemaining: result.playerGold,
      levelsGained: 1,
      starsGained: 0,
    };
  }

  private async starUpHero(playerId: string, heroId: string): Promise<UpgradeResult> {
    const hero = await this.prisma.playerHero.findUnique({
      where: { id: heroId },
      include: { template: true },
    });
    if (!hero || hero.playerId !== playerId) {
      throw new NotFoundException('Hero not found');
    }

    if (hero.stars >= GAME_CONFIG.hero.maxStars) {
      throw new BadRequestException('Hero is already at max stars');
    }

    const targetStars = hero.stars + 1;
    const levelReq = GAME_CONFIG.hero.starUpgradeLevelRequirement(targetStars);
    if (hero.level < levelReq) {
      throw new BadRequestException(`Hero must be level ${levelReq} to upgrade to ${targetStars} stars`);
    }

    const goldCost = GAME_CONFIG.hero.starUpgradeGoldCost(hero.stars);
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { gold: true },
    });
    if (!player || player.gold < goldCost) {
      throw new BadRequestException('Insufficient gold for star upgrade');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedHero = await tx.playerHero.update({
        where: { id: heroId },
        data: { stars: { increment: 1 } },
        include: { template: true },
      });

      const updatedPlayer = await tx.player.update({
        where: { id: playerId },
        data: { gold: { decrement: goldCost } },
        select: { gold: true },
      });

      return { updatedHero, playerGold: updatedPlayer.gold };
    });

    StructuredLogger.info('heroes.upgrade.star', {
      playerId,
      heroId,
      newStars: result.updatedHero.stars,
      goldCost,
    });

    // Fire-and-forget: quest progress + leaderboard
    this.questsService.incrementQuestProgress(playerId, 'upgrade_hero', 1).catch((err) =>
      StructuredLogger.error('heroes.questProgress.failed', {
        playerId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    this.leaderboardService
      .calculatePowerScore(playerId)
      .then((score) => this.leaderboardService.updateScore(playerId, 'power', score))
      .catch((err) =>
        StructuredLogger.error('heroes.leaderboard.power.failed', {
          playerId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );

    return {
      hero: this.mapPlayerHero(result.updatedHero),
      goldSpent: goldCost,
      playerGoldRemaining: result.playerGold,
      levelsGained: 0,
      starsGained: 1,
    };
  }

  private mapTemplate(t: {
    id: string;
    name: string;
    class: string;
    rarity: string;
    baseHp: number;
    baseAttack: number;
    baseDefense: number;
    baseSpeed: number;
    skills: unknown;
    spriteKey: string;
  }): HeroTemplateResponse {
    return {
      id: t.id,
      name: t.name,
      class: t.class as HeroTemplateResponse['class'],
      rarity: t.rarity as HeroTemplateResponse['rarity'],
      baseHp: t.baseHp,
      baseAttack: t.baseAttack,
      baseDefense: t.baseDefense,
      baseSpeed: t.baseSpeed,
      skills: t.skills as unknown as HeroSkill[],
      spriteKey: t.spriteKey,
    };
  }

  private mapPlayerHero(h: {
    id: string;
    templateId: string;
    template: {
      id: string;
      name: string;
      class: string;
      rarity: string;
      baseHp: number;
      baseAttack: number;
      baseDefense: number;
      baseSpeed: number;
      skills: unknown;
      spriteKey: string;
    };
    level: number;
    stars: number;
    xp: number;
    equipment: unknown;
    isInTeam: boolean;
    teamPosition: number | null;
  }): PlayerHeroResponse {
    const template = this.mapTemplate(h.template);
    const computedStats = calculateHeroStats(template as HeroTemplate, h.level, h.stars);
    const xpToNextLevel = GAME_CONFIG.hero.xpPerLevel(h.level);

    return {
      id: h.id,
      templateId: h.templateId,
      template,
      level: h.level,
      stars: h.stars,
      xp: h.xp,
      xpToNextLevel,
      equipment: h.equipment as Record<string, string>,
      isInTeam: h.isInTeam,
      teamPosition: h.teamPosition,
      computedStats,
    };
  }
}
