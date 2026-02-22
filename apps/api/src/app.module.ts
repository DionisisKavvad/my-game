import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { PlayersModule } from './players/players.module';
import { BattlesModule } from './battles/battles.module';
import { HeroesModule } from './heroes/heroes.module';
import { QuestsModule } from './quests/quests.module';
import { ScheduledModule } from './scheduled/scheduled.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
        JWT_REFRESH_TTL: Joi.number().default(2592000),
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    PlayersModule,
    BattlesModule,
    HeroesModule,
    QuestsModule,
    ScheduledModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
