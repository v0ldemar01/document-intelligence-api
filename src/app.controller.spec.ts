import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health/health.controller';
import { PrismaHealthIndicator } from './health/prisma-health.indicator';
import { RedisHealthIndicator } from './health/redis-health.indicator';

const healthCheckServiceMock = {
  check: jest
    .fn()
    .mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} }),
};
const prismaHealthMock = {
  pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
};
const redisHealthMock = {
  pingCheck: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckServiceMock },
        { provide: PrismaHealthIndicator, useValue: prismaHealthMock },
        { provide: RedisHealthIndicator, useValue: redisHealthMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns health check result', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
  });
});
