import { createHash, randomInt } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from '@hero-wars/shared';
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
    // Check for existing active battle (prevents double-starts)
    const existingLock = await this.redis.get(
      `${BATTLE_LOCK_PREFIX}${playerId}`,
    );
    if (existingLock) {
      throw new ConflictException('A battle is already in progress');
    }

    // Check energy if this is a campaign stage
    if (stageId) {
      const player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { energy: true },
      });
      if (!player) {
        throw new NotFoundException('Player not found');
      }
      if (player.energy < GAME_CONFIG.campaign.energyCostPerStage) {
        throw new ConflictException('Not enough energy');
      }
    }

    // Generate seed (32-bit positive int) using crypto.randomInt for security
    const seed = randomInt(1, 2147483647);
    const battleId = uuidv4();
    const seedHash = createHash('sha256')
      .update(seed.toString())
      .digest('hex');

    // Store seed in Redis (only server knows the actual value)
    await this.redis.set(
      `${BATTLE_SEED_PREFIX}${battleId}`,
      seed.toString(),
      BATTLE_TTL_SECONDS,
    );

    // Set battle lock with TTL matching baseTimeout
    await this.redis.set(
      `${BATTLE_LOCK_PREFIX}${playerId}`,
      battleId,
      BATTLE_TTL_SECONDS,
    );

    // Create battle record with pending result
    await this.prisma.battle.create({
      data: {
        id: battleId,
        playerId,
        stageId: stageId ?? null,
        rngSeed: seed,
        result: 'pending',
        battleLog: {},
      },
    });

    StructuredLogger.info('battle.started', {
      battleId,
      playerId,
      stageId: stageId ?? null,
    });

    return {
      battleId,
      seedHash,
    };
  }

  async completeBattle(
    playerId: string,
    battleId: string,
    clientLog: Record<string, unknown>,
  ) {
    // Retrieve the actual seed from Redis
    const seedStr = await this.redis.get(`${BATTLE_SEED_PREFIX}${battleId}`);
    if (!seedStr) {
      throw new NotFoundException('Battle expired or not found');
    }
    const seed = parseInt(seedStr, 10);

    // TODO: Server-side re-simulation with BattleSimulator using actual seed
    // For now, accept the client log and mark as validated=false

    const serverResult = (clientLog['result'] as string) ?? 'defeat';
    const validResults = ['victory', 'defeat', 'timeout'];
    const result = validResults.includes(serverResult) ? serverResult : 'defeat';

    const rewardGold = result === 'victory' ? GAME_CONFIG.player.startingGold : 0;
    const rewardXp = result === 'victory' ? 50 : 10;
    const durationMs = typeof clientLog['durationMs'] === 'number'
      ? clientLog['durationMs']
      : 0;

    // Atomic transaction: validate battle + grant rewards
    const updatedBattle = await this.prisma.$transaction(async (tx) => {
      const battle = await tx.battle.findUnique({ where: { id: battleId } });
      if (!battle || battle.playerId !== playerId) {
        throw new NotFoundException('Battle not found');
      }
      if (battle.result !== 'pending') {
        throw new ConflictException('Battle already completed');
      }

      const updated = await tx.battle.update({
        where: { id: battleId },
        data: {
          result,
          battleLog: clientLog as unknown as Prisma.InputJsonValue,
          validated: false,
          durationMs,
          rewardGold,
          rewardXp,
        },
      });

      // Grant rewards atomically within the same transaction
      if (result === 'victory') {
        await tx.player.update({
          where: { id: playerId },
          data: {
            gold: { increment: rewardGold },
            xp: { increment: rewardXp },
          },
        });
      }

      return updated;
    });

    // Clean up Redis keys after successful transaction
    await this.redis.del(`${BATTLE_SEED_PREFIX}${battleId}`);
    await this.redis.del(`${BATTLE_LOCK_PREFIX}${playerId}`);

    StructuredLogger.info('battle.completed', {
      battleId,
      playerId,
      result,
      rewardGold,
      rewardXp,
    });

    return {
      seed,
      result: updatedBattle.result,
      rewards: {
        gold: updatedBattle.rewardGold,
        xp: updatedBattle.rewardXp,
      },
    };
  }
}
