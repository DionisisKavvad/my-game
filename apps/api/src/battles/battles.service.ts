import { createHash, randomInt } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  GAME_CONFIG,
  BattleHero,
  BattleLog,
  BattleValidationResult,
  calculateHeroStats,
  getStage,
} from '@hero-wars/shared';
import {
  BattleSimulator,
  playerHeroToBattleHero,
  campaignEnemyToBattleHero,
} from '@hero-wars/battle-engine';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StructuredLogger } from '../common/logger/structured-logger';

const BATTLE_SEED_PREFIX = 'battle:seed:';
const BATTLE_LOCK_PREFIX = 'battle:lock:';
const BATTLE_TTL_SECONDS = Math.ceil(GAME_CONFIG.battle.baseTimeout / 1000);

@Injectable()
export class BattlesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async startBattle(playerId: string, stageId?: string) {
    // Validate stage exists
    let stage;
    if (stageId) {
      stage = getStage(stageId);
      if (!stage) {
        throw new NotFoundException(`Stage ${stageId} not found`);
      }
    }

    // Validate campaign progression (before energy deduction)
    if (stageId && stage) {
      await this.validateStageUnlocked(playerId, stageId);
    }

    // Load player's team from DB (R7: use PrismaService directly)
    const playerHeroes = await this.prisma.playerHero.findMany({
      where: { playerId, isInTeam: true },
      include: { template: true },
      orderBy: { teamPosition: 'asc' },
    });

    if (playerHeroes.length === 0) {
      throw new ConflictException('No heroes in team. Set up your team first.');
    }

    // Check and deduct energy if this is a campaign stage (after all validations)
    if (stageId) {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { energy: true },
      });
      if (!player) {
        throw new NotFoundException('Player not found');
      }
      const energyCost = stage?.energyCost ?? GAME_CONFIG.campaign.energyCostPerStage;
      if (player.energy < energyCost) {
        throw new ConflictException('Not enough energy');
      }
      await this.prisma.player.update({
        where: { id: playerId },
        data: { energy: { decrement: energyCost } },
      });
    }

    // Acquire battle lock atomically (SET NX prevents race condition)
    const battleId = uuidv4();
    const lockAcquired = await this.redis.setNx(
      `${BATTLE_LOCK_PREFIX}${playerId}`,
      battleId,
      BATTLE_TTL_SECONDS,
    );
    if (!lockAcquired) {
      throw new ConflictException('A battle is already in progress');
    }

    try {
      // Convert player heroes to BattleHero[]
      const playerTeam: BattleHero[] = playerHeroes.map((ph) => {
        const template = {
          id: ph.template.id,
          name: ph.template.name,
          class: ph.template.class as 'warrior' | 'mage' | 'healer' | 'archer' | 'tank',
          rarity: ph.template.rarity as 'common' | 'rare' | 'epic' | 'legendary',
          baseHp: ph.template.baseHp,
          baseAttack: ph.template.baseAttack,
          baseDefense: ph.template.baseDefense,
          baseSpeed: ph.template.baseSpeed,
          skills: ph.template.skills as unknown as import('@hero-wars/shared').HeroSkill[],
          spriteKey: ph.template.spriteKey,
        };
        return playerHeroToBattleHero(
          {
            id: ph.id,
            playerId: ph.playerId,
            templateId: ph.templateId,
            template,
            level: ph.level,
            stars: ph.stars,
            xp: ph.xp,
            equipment: ph.equipment as Record<string, string>,
            isInTeam: ph.isInTeam,
            teamPosition: ph.teamPosition,
          },
          'player',
        );
      });

      // Build enemy team from campaign stage or default
      let enemyTeam: BattleHero[] = [];
      if (stage) {
        // Load hero templates for enemies
        const templateIds = [...new Set(stage.enemyTeam.map((e) => e.templateId))];
        const templates = await this.prisma.heroTemplate.findMany({
          where: { id: { in: templateIds } },
        });
        const templateMap = new Map(templates.map((t) => [t.id, t]));

        enemyTeam = stage.enemyTeam.map((enemy, index) => {
          const t = templateMap.get(enemy.templateId);
          if (!t) {
            throw new NotFoundException(`Enemy template ${enemy.templateId} not found`);
          }
          const template = {
            id: t.id,
            name: t.name,
            class: t.class as 'warrior' | 'mage' | 'healer' | 'archer' | 'tank',
            rarity: t.rarity as 'common' | 'rare' | 'epic' | 'legendary',
            baseHp: t.baseHp,
            baseAttack: t.baseAttack,
            baseDefense: t.baseDefense,
            baseSpeed: t.baseSpeed,
            skills: t.skills as unknown as import('@hero-wars/shared').HeroSkill[],
            spriteKey: t.spriteKey,
          };
          return campaignEnemyToBattleHero(enemy, template, index);
        });
      }

      // Generate seed (32-bit positive int) using crypto.randomInt for security
      const seed = randomInt(1, 2147483647);
      const seedHash = createHash('sha256')
        .update(seed.toString())
        .digest('hex');

      // Store seed in Redis (only server knows the actual value)
      await this.redis.set(
        `${BATTLE_SEED_PREFIX}${battleId}`,
        seed.toString(),
        BATTLE_TTL_SECONDS,
      );

      // Create battle record with initial state stored for re-simulation
      await this.prisma.battle.create({
        data: {
          id: battleId,
          playerId,
          stageId: stageId ?? null,
          rngSeed: seed,
          result: 'pending',
          battleLog: {
            initialState: {
              playerTeam,
              enemyTeam,
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });

      StructuredLogger.info('battle.started', {
        battleId,
        playerId,
        stageId: stageId ?? null,
      });

      return {
        battleId,
        seed,
        seedHash,
        enemyTeam,
      };
    } catch (error) {
      // Clean up Redis lock and seed on failure
      await this.redis.del(`${BATTLE_LOCK_PREFIX}${playerId}`);
      await this.redis.del(`${BATTLE_SEED_PREFIX}${battleId}`);
      throw error;
    }
  }

  async completeBattle(
    playerId: string,
    battleId: string,
    clientLog: BattleLog,
  ) {
    // Retrieve the actual seed from Redis
    const seedStr = await this.redis.get(`${BATTLE_SEED_PREFIX}${battleId}`);
    if (!seedStr) {
      throw new NotFoundException('Battle expired or not found');
    }
    const seed = parseInt(seedStr, 10);

    // Load battle record from DB
    const battle = await this.prisma.battle.findUnique({ where: { id: battleId } });
    if (!battle || battle.playerId !== playerId) {
      throw new NotFoundException('Battle not found');
    }
    if (battle.result !== 'pending') {
      throw new ConflictException('Battle already completed');
    }

    // Reconstruct teams from stored initial state
    const battleData = battle.battleLog as unknown as {
      initialState: { playerTeam: BattleHero[]; enemyTeam: BattleHero[] };
    };
    const { playerTeam, enemyTeam } = battleData.initialState;

    // Server-side re-simulation
    const simulator = new BattleSimulator({
      playerTeam,
      enemyTeam,
      seed,
    });
    const serverLog = simulator.run();

    // Compare server log vs client log (R6: exclude durationMs)
    const validation = compareBattleLogs(serverLog, clientLog);

    const result = serverLog.result;
    const validated = validation.valid;

    // Calculate rewards
    let rewardGold = 0;
    let rewardXp = 0;
    let heroXp = 0;
    let starsEarned = 0;

    if (validated && result === 'victory' && battle.stageId) {
      const stage = getStage(battle.stageId);
      if (stage) {
        rewardGold = stage.rewards.gold;
        rewardXp = stage.rewards.xp;
        heroXp = GAME_CONFIG.rewards.heroXpPerBattle;

        // Calculate stars based on surviving heroes
        const alivePlayerCount = Object.entries(serverLog.turns[serverLog.turns.length - 1]?.resultHp ?? {})
          .filter(([id]) => playerTeam.some((h) => h.id === id))
          .filter(([, hp]) => hp > 0).length;
        const totalPlayers = playerTeam.length;
        const survivalRatio = totalPlayers > 0 ? alivePlayerCount / totalPlayers : 0;

        if (alivePlayerCount === totalPlayers) {
          starsEarned = 3;
        } else if (survivalRatio >= GAME_CONFIG.rewards.victoryStar2Threshold) {
          starsEarned = 2;
        } else {
          starsEarned = 1;
        }
      }
    } else if (validated && result === 'victory') {
      // Non-campaign battle
      rewardGold = 50;
      rewardXp = 50;
    }

    // Atomic transaction: validate battle + grant rewards
    await this.prisma.$transaction(async (tx) => {
      await tx.battle.update({
        where: { id: battleId },
        data: {
          result,
          battleLog: {
            initialState: battleData.initialState,
            clientLog: clientLog as unknown as Prisma.InputJsonValue,
            serverLog: serverLog as unknown as Prisma.InputJsonValue,
            validated,
            mismatchDetails: validation.valid
              ? undefined
              : { turn: validation.mismatchTurn, reason: validation.reason },
          } as unknown as Prisma.InputJsonValue,
          validated,
          durationMs: clientLog.durationMs ?? 0,
          rewardGold,
          rewardXp,
        },
      });

      // Grant rewards on validated victory
      if (validated && result === 'victory') {
        await tx.player.update({
          where: { id: playerId },
          data: {
            gold: { increment: rewardGold },
            xp: { increment: rewardXp },
          },
        });

        // Grant hero XP to all team members
        if (heroXp > 0) {
          const heroIds = playerTeam.map((h) => h.id);
          await tx.playerHero.updateMany({
            where: { id: { in: heroIds } },
            data: { xp: { increment: heroXp } },
          });
        }

        // Update campaign progress
        if (battle.stageId && starsEarned > 0) {
          const existingProgress = await tx.campaignProgress.findUnique({
            where: {
              playerId_stageId: { playerId, stageId: battle.stageId },
            },
          });

          await tx.campaignProgress.upsert({
            where: {
              playerId_stageId: { playerId, stageId: battle.stageId },
            },
            create: {
              playerId,
              stageId: battle.stageId,
              stars: starsEarned,
              bestTimeMs: clientLog.durationMs,
              completedAt: new Date(),
            },
            update: {
              stars: Math.max(existingProgress?.stars ?? 0, starsEarned),
              bestTimeMs: existingProgress?.bestTimeMs
                ? Math.min(existingProgress.bestTimeMs, clientLog.durationMs)
                : clientLog.durationMs,
              completedAt: new Date(),
            },
          });

          // Grant hero shards if stage has shard rewards
          const stage = getStage(battle.stageId);
          if (stage?.rewards.heroShards) {
            const { templateId, count } = stage.rewards.heroShards;
            await tx.playerHeroShard.upsert({
              where: {
                playerId_templateId: { playerId, templateId },
              },
              create: { playerId, templateId, count },
              update: { count: { increment: count } },
            });
          }
        }
      }
    });

    // Clean up Redis keys after successful transaction
    await this.redis.del(`${BATTLE_SEED_PREFIX}${battleId}`);
    await this.redis.del(`${BATTLE_LOCK_PREFIX}${playerId}`);

    StructuredLogger.info('battle.completed', {
      battleId,
      playerId,
      result,
      validated,
      rewardGold,
      rewardXp,
    });

    return {
      seed,
      result,
      validated,
      rewards: {
        gold: rewardGold,
        xp: rewardXp,
        heroXp,
      },
      starsEarned,
    };
  }

  private async validateStageUnlocked(
    playerId: string,
    stageId: string,
  ): Promise<void> {
    // Stage 1-1 is always unlocked
    if (stageId === '1-1') return;

    // Parse chapter and stage from ID (format: "chapter-stage")
    const [chapterStr, stageStr] = stageId.split('-');
    const chapter = parseInt(chapterStr, 10);
    const stageNum = parseInt(stageStr, 10);

    // Determine the previous stage ID
    let prevStageId: string;
    if (stageNum === 1) {
      // First stage of a chapter -- previous is last stage of previous chapter
      prevStageId = `${chapter - 1}-3`;
    } else {
      prevStageId = `${chapter}-${stageNum - 1}`;
    }

    const progress = await this.prisma.campaignProgress.findUnique({
      where: {
        playerId_stageId: { playerId, stageId: prevStageId },
      },
    });

    if (!progress || progress.stars <= 0) {
      throw new ForbiddenException(
        `Stage ${stageId} is locked. Complete stage ${prevStageId} first.`,
      );
    }
  }
}

/**
 * Compares server-generated battle log with client-submitted log.
 * R6: Excludes durationMs from comparison.
 */
function compareBattleLogs(
  serverLog: BattleLog,
  clientLog: BattleLog,
): BattleValidationResult {
  if (serverLog.result !== clientLog.result) {
    return {
      valid: false,
      mismatchTurn: 0,
      reason: `Result mismatch: server=${serverLog.result}, client=${clientLog.result}`,
    };
  }

  if (serverLog.totalTurns !== clientLog.totalTurns) {
    return {
      valid: false,
      mismatchTurn: 0,
      reason: `Total turns mismatch: server=${serverLog.totalTurns}, client=${clientLog.totalTurns}`,
    };
  }

  if (serverLog.turns.length !== clientLog.turns.length) {
    return {
      valid: false,
      mismatchTurn: 0,
      reason: `Turn count mismatch: server=${serverLog.turns.length}, client=${clientLog.turns.length}`,
    };
  }

  for (let i = 0; i < serverLog.turns.length; i++) {
    const st = serverLog.turns[i];
    const ct = clientLog.turns[i];

    if (st.actorId !== ct.actorId) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: actorId mismatch: server=${st.actorId}, client=${ct.actorId}`,
      };
    }

    if (st.skillId !== ct.skillId) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: skillId mismatch: server=${st.skillId}, client=${ct.skillId}`,
      };
    }

    if (JSON.stringify(st.targetIds.sort()) !== JSON.stringify(ct.targetIds.sort())) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: targetIds mismatch`,
      };
    }

    if (st.damage !== ct.damage) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: damage mismatch: server=${st.damage}, client=${ct.damage}`,
      };
    }

    if (st.healing !== ct.healing) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: healing mismatch: server=${st.healing}, client=${ct.healing}`,
      };
    }

    // Compare resultHp snapshot
    const serverHpKeys = Object.keys(st.resultHp).sort();
    const clientHpKeys = Object.keys(ct.resultHp).sort();
    if (JSON.stringify(serverHpKeys) !== JSON.stringify(clientHpKeys)) {
      return {
        valid: false,
        mismatchTurn: st.turn,
        reason: `Turn ${i}: resultHp keys mismatch`,
      };
    }

    for (const key of serverHpKeys) {
      if (st.resultHp[key] !== ct.resultHp[key]) {
        return {
          valid: false,
          mismatchTurn: st.turn,
          reason: `Turn ${i}: resultHp[${key}] mismatch: server=${st.resultHp[key]}, client=${ct.resultHp[key]}`,
        };
      }
    }
  }

  return { valid: true };
}
