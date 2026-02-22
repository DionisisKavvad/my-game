import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StructuredLogger } from '../common/logger/structured-logger';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GAME_CONFIG } from '@hero-wars/shared';
import { HeroesService } from '../heroes/heroes.service';

const BCRYPT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 900; // 15 minutes

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private heroesService: HeroesService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if username or email already exists
    const existing = await this.prisma.player.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });

    if (existing) {
      throw new ConflictException('Username or email already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const player = await this.prisma.$transaction(async (tx) => {
      const p = await tx.player.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash,
          gold: GAME_CONFIG.player.startingGold,
          gems: GAME_CONFIG.player.startingGems,
          energy: GAME_CONFIG.player.startingEnergy,
          maxEnergy: GAME_CONFIG.energy.maxEnergy,
        },
      });
      await this.heroesService.assignStarterHeroes(p.id, tx);
      return p;
    });

    const tokens = await this.generateTokens(player.id, player.username);
    StructuredLogger.info('auth.register.success', { userId: player.id, username: player.username });
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async login(dto: LoginDto) {
    const player = await this.prisma.player.findUnique({
      where: { username: dto.username },
    });

    if (!player) {
      StructuredLogger.warn('auth.login.failure', { username: dto.username, reason: 'user_not_found' });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check login lockout
    const lockoutKey = `login_failures:${dto.username}`;
    const failureCount = await this.redisService.get(lockoutKey);
    if (failureCount && parseInt(failureCount, 10) >= MAX_LOGIN_ATTEMPTS) {
      const remainingSeconds = await this.redisService.ttl(lockoutKey);
      StructuredLogger.warn('auth.login.lockout', { username: dto.username, remainingSeconds });
      throw new ForbiddenException(
        `Account temporarily locked. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`,
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, player.passwordHash);
    if (!isPasswordValid) {
      await this.redisService.incr(lockoutKey);
      await this.redisService.expire(lockoutKey, LOCKOUT_DURATION_SECONDS);
      StructuredLogger.warn('auth.login.failure', { username: dto.username, reason: 'invalid_password' });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Clear failure counter on successful login
    await this.redisService.del(lockoutKey);

    const tokens = await this.generateTokens(player.id, player.username);
    StructuredLogger.info('auth.login.success', { userId: player.id, username: player.username });
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async refreshByToken(refreshToken: string) {
    // Atomic: read and delete the lookup in one operation to prevent race conditions
    const userId = await this.redisService.getAndDelete(`refresh_lookup:${refreshToken}`);
    if (!userId) {
      throw new ForbiddenException('Invalid refresh token');
    }

    // Atomic: read and delete the stored token
    const storedToken = await this.redisService.getAndDelete(`refresh:${userId}`);
    if (!storedToken || storedToken !== refreshToken) {
      // Token was already used or doesn't match — potential replay attack
      throw new ForbiddenException('Invalid refresh token');
    }

    const player = await this.prisma.player.findUnique({
      where: { id: userId },
    });

    if (!player) {
      throw new ForbiddenException('Player not found');
    }

    const tokens = await this.generateTokens(player.id, player.username);
    StructuredLogger.info('auth.token.refresh', { userId: player.id });
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async logout(userId: string) {
    const refreshToken = await this.redisService.get(`refresh:${userId}`);
    if (refreshToken) {
      await this.redisService.del(`refresh_lookup:${refreshToken}`);
    }
    await this.redisService.del(`refresh:${userId}`);
    StructuredLogger.info('auth.logout', { userId });
    return { message: 'Logged out successfully' };
  }

  getRefreshTtl(): number {
    return this.configService.get<number>('JWT_REFRESH_TTL', 2592000);
  }

  private async generateTokens(userId: string, username: string) {
    const payload = { sub: userId, username };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m'),
    });

    const refreshToken = uuidv4();
    const refreshTtl = this.getRefreshTtl();

    // Store refresh token in Redis with TTL (both directions for lookup)
    await this.redisService.set(`refresh:${userId}`, refreshToken, refreshTtl);
    await this.redisService.set(`refresh_lookup:${refreshToken}`, userId, refreshTtl);

    return { accessToken, refreshToken };
  }

  private sanitizePlayer(player: {
    id: string;
    username: string;
    email: string;
    level: number;
    xp: number;
    gold: number;
    gems: number;
    energy: number;
    maxEnergy: number;
    energyRegenAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: player.id,
      username: player.username,
      email: player.email,
      level: player.level,
      xp: player.xp,
      gold: player.gold,
      gems: player.gems,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      energyRegenAt: player.energyRegenAt,
      createdAt: player.createdAt,
    };
  }
}
