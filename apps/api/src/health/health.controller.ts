import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @Get()
  async check(@Res() res: Response) {
    let dbStatus = 'connected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    const redisStatus = this.redisService.isHealthy ? 'connected' : 'disconnected';
    const overallStatus = dbStatus === 'connected' && redisStatus === 'connected' ? 'ok' : 'degraded';
    const httpStatus = overallStatus === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    res.status(httpStatus).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      database: dbStatus,
      redis: redisStatus,
    });
  }
}
