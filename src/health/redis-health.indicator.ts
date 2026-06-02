import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import IORedis from 'ioredis';

@Injectable()
class RedisHealthIndicator implements OnModuleDestroy {
  private readonly client: IORedis;

  constructor(
    private readonly config: ConfigService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {
    this.client = new IORedis(
      this.config.get<string>('redis.url') ?? 'redis://localhost:6379',
      { maxRetriesPerRequest: 1, connectTimeout: 3000, lazyConnect: true },
    );
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.client.ping();
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

export { RedisHealthIndicator };
