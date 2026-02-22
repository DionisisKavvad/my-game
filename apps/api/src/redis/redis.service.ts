import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { StructuredLogger } from '../common/logger/structured-logger';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private _isHealthy = false;

  get isHealthy(): boolean {
    return this._isHealthy;
  }

  constructor(private configService: ConfigService) {
    this.client = createClient({
      url: this.configService.get<string>('REDIS_URL'),
    });

    this.client.on('error', (err) => {
      this._isHealthy = false;
      StructuredLogger.error('redis.error', { message: err.message });
    });

    this.client.on('ready', () => {
      this._isHealthy = true;
      StructuredLogger.info('redis.ready');
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      StructuredLogger.error('redis.set.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      if (key.startsWith('refresh')) {
        throw err;
      }
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      StructuredLogger.error('redis.get.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      if (key.startsWith('refresh')) {
        throw err;
      }
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      StructuredLogger.error('redis.del.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      if (key.startsWith('refresh')) {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      StructuredLogger.error('redis.exists.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      if (key.startsWith('refresh')) {
        throw err;
      }
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      StructuredLogger.error('redis.incr.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (err) {
      StructuredLogger.error('redis.expire.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (err) {
      StructuredLogger.error('redis.ttl.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getAndDelete(key: string): Promise<string | null> {
    try {
      return await this.client.getDel(key);
    } catch (err) {
      StructuredLogger.error('redis.getAndDelete.failed', {
        key,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
