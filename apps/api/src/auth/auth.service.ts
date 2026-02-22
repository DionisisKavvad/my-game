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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GAME_CONFIG } from '@hero-wars/shared';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
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

    const player = await this.prisma.player.create({
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

    const tokens = await this.generateTokens(player.id, player.username);
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async login(dto: LoginDto) {
    const player = await this.prisma.player.findUnique({
      where: { username: dto.username },
    });

    if (!player) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, player.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(player.id, player.username);
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async refresh(userId: string, refreshToken: string) {
    const storedToken = await this.redisService.get(`refresh:${userId}`);

    if (!storedToken || storedToken !== refreshToken) {
      // Token rotation detected — possible token theft, invalidate all
      await this.redisService.del(`refresh:${userId}`);
      throw new ForbiddenException('Invalid refresh token');
    }

    const player = await this.prisma.player.findUnique({
      where: { id: userId },
    });

    if (!player) {
      throw new ForbiddenException('Player not found');
    }

    const tokens = await this.generateTokens(player.id, player.username);
    return { ...tokens, player: this.sanitizePlayer(player) };
  }

  async logout(userId: string) {
    await this.redisService.del(`refresh:${userId}`);
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(userId: string, username: string) {
    const payload = { sub: userId, username };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '15m'),
    });

    const refreshToken = uuidv4();
    const refreshTtl = this.configService.get<number>('JWT_REFRESH_TTL', 2592000);

    // Store refresh token in Redis with TTL
    await this.redisService.set(`refresh:${userId}`, refreshToken, refreshTtl);

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
