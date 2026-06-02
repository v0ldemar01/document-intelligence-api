/// <reference types="jest" />

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  CATALOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
  JOB_REPOSITORY,
  DOCUMENT_JOB_DISPATCHER,
  DOCUMENT_STORAGE,
  EXTRACTION_ENGINE as DOCUMENT_EXTRACTION_ENGINE,
} from '../src/domain/tokens';
import { InMemoryDocumentIntelligenceRepository } from '../src/infrastructure/persistence/in-memory-document-intelligence.repository';
import { MockExtractionEngine } from '../src/infrastructure/extraction/mock-extraction.engine';
import { DatabaseService } from '../src/infrastructure/database/database.service';
import { BullMqDocumentJobWorkerService } from '../src/infrastructure/queue/bullmq-document-job-worker.service';
import { AwsS3Service } from '../src/infrastructure/storage/aws-s3.service';
import { LangFlowSetupService } from '../src/infrastructure/extraction/langflow-setup.service';
import { PrismaHealthIndicator } from '../src/health/prisma-health.indicator';
import { RedisHealthIndicator } from '../src/health/redis-health.indicator';

const prismaServiceMock = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  onModuleDestroy: jest.fn(),
  withTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
    fn(prismaServiceMock),
  ),
  withAdvisoryLock: jest.fn((_key: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
  tryWithAdvisoryLock: jest.fn((_key: unknown, fn: () => Promise<unknown>) =>
    fn(),
  ),
  withAdvisoryXactLock: jest.fn(
    (_tx: unknown, _key: unknown, fn: () => Promise<unknown>) => fn(),
  ),
  toLockKey: jest.fn().mockReturnValue(BigInt(1)),
  flow: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
};

const prismaHealthMock = {
  pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
};

const redisHealthMock = {
  pingCheck: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
  onModuleDestroy: jest.fn(),
};

// No-op worker — prevents IORedis connection attempts in tests.
const workerMock = {
  onModuleInit: jest.fn().mockResolvedValue(undefined),
  onModuleDestroy: jest.fn().mockResolvedValue(undefined),
};

describe('Document Intelligence API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // One shared instance so writes and reads cross-token are consistent.
    const sharedRepo = new InMemoryDocumentIntelligenceRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CATALOG_REPOSITORY)
      .useValue(sharedRepo)
      .overrideProvider(DOCUMENT_REPOSITORY)
      .useValue(sharedRepo)
      .overrideProvider(JOB_REPOSITORY)
      .useValue(sharedRepo)
      .overrideProvider(DOCUMENT_EXTRACTION_ENGINE)
      .useClass(MockExtractionEngine)
      .overrideProvider(DOCUMENT_STORAGE)
      .useValue({ save: async () => '/tmp/invoice.txt' })
      .overrideProvider(DOCUMENT_JOB_DISPATCHER)
      .useValue({ dispatch: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(BullMqDocumentJobWorkerService)
      .useValue(workerMock)
      .overrideProvider(AwsS3Service)
      .useValue({
        onModuleInit: jest.fn(),
        putObject: jest.fn(),
        objectUri: jest.fn().mockReturnValue('s3://test/file'),
        bucket: 'test',
      })
      .overrideProvider(LangFlowSetupService)
      .useValue({ onApplicationBootstrap: jest.fn() })
      .overrideProvider(DatabaseService)
      .useValue(prismaServiceMock)
      .overrideProvider(PrismaHealthIndicator)
      .useValue(prismaHealthMock)
      .overrideProvider(RedisHealthIndicator)
      .useValue(redisHealthMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns health status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('lists seeded providers', async () => {
    const response = await request(app.getHttpServer())
      .get('/providers')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'mock-provider',
          displayName: 'Mock Provider',
        }),
      ]),
    );
  });

  describe('POST /documents', () => {
    it('uploads a document and enqueues an extraction job', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents')
        .attach(
          'file',
          Buffer.from(
            'Invoice Number: INV-2026-001\nVendor: SpheraX Ltd\nAmount: 499.90 USD\nDate: 2026-05-31',
          ),
          'invoice.txt',
        )
        .expect(201);

      expect(res.body.document).toEqual(
        expect.objectContaining({
          fileName: 'invoice.txt',
          documentType: 'invoice',
        }),
      );
      expect(res.body.job).toEqual(
        expect.objectContaining({ status: 'running' }),
      );
      expect(res.body.job.id).toBeDefined();
      expect(res.body.document.id).toBeDefined();
    });

    it('returns 400 for an unsupported file type', async () => {
      const res = await request(app.getHttpServer())
        .post('/documents')
        .attach('file', Buffer.from('data'), 'report.exe')
        .expect(400);

      expect(res.body.message).toMatch(/unsupported file type/i);
    });

    it('returns 400 when no file is attached', async () => {
      await request(app.getHttpServer()).post('/documents').expect(400);
    });
  });

  describe('GET /documents/:id', () => {
    it('returns 404 for unknown document id', async () => {
      await request(app.getHttpServer())
        .get('/documents/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /jobs/:id', () => {
    it('returns 404 for unknown job id', async () => {
      await request(app.getHttpServer())
        .get('/jobs/non-existent-id')
        .expect(404);
    });
  });

  describe('GET /jobs/:id/result', () => {
    it('returns 404 when job has no result yet', async () => {
      // Upload a document to create a job in 'running' status
      const uploadRes = await request(app.getHttpServer())
        .post('/documents')
        .attach('file', Buffer.from('Invoice: TEST-001'), 'test.txt');

      const jobId = uploadRes.body.job.id;
      const res = await request(app.getHttpServer())
        .get(`/jobs/${jobId}/result`)
        .expect(404);
      expect(res.body.message).toMatch(/no result yet/i);
    });
  });

  describe('Catalog endpoints', () => {
    it('GET /models returns seeded models', async () => {
      const res = await request(app.getHttpServer()).get('/models').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /flows returns seeded flows', async () => {
      const res = await request(app.getHttpServer()).get('/flows').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /prompts returns seeded prompts', async () => {
      const res = await request(app.getHttpServer())
        .get('/prompts')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
