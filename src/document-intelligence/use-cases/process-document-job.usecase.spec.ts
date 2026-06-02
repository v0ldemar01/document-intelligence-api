import { BadRequestException } from '@nestjs/common';
import { ProcessDocumentJobUseCase } from './process-document-job.usecase';
import { MockExtractionEngine } from '../../infrastructure/extraction/mock-extraction.engine';
import { JobRecord } from '../../domain/document-intelligence.types';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';
import type { ExtractionEngine } from '../../domain/extraction-engine';
import type { JobRepository } from '../../domain/ports/job.repository';
import type { CatalogService } from '../catalog/catalog.service';

const now = new Date();

const baseJob: JobRecord = {
  id: 'job-1',
  documentId: 'doc-1',
  providerId: 'p1',
  modelId: 'm1',
  flowId: 'f1',
  promptId: 'pr1',
  status: 'running',
  errorMessage: null,
  retryCount: 0,
  nextRetryAt: null,
  createdAt: now,
  updatedAt: now,
  document: {
    id: 'doc-1',
    fileName: 'invoice.txt',
    storagePath: '/tmp/invoice.txt',
    mimeType: 'text/plain',
    size: 100,
    checksum: 'abc',
    documentType: 'invoice',
    extractedText: 'Invoice Number: INV-001\nVendor: ACME\nAmount: 100 EUR',
    createdAt: now,
    updatedAt: now,
  },
  provider: {
    id: 'p1',
    ...DEFAULT_CATALOG.provider,
    createdAt: now,
    updatedAt: now,
  },
  model: {
    id: 'm1',
    providerId: 'p1',
    ...DEFAULT_CATALOG.model,
    createdAt: now,
    updatedAt: now,
  },
  flow: {
    id: 'f1',
    providerId: 'p1',
    modelId: 'm1',
    ...DEFAULT_CATALOG.flow,
    createdAt: now,
    updatedAt: now,
  },
  prompt: {
    id: 'pr1',
    flowId: 'f1',
    ...DEFAULT_CATALOG.prompt,
    createdAt: now,
    updatedAt: now,
  },
  result: null,
};

const completedJob: JobRecord = { ...baseJob, status: 'completed' };

const makeRepo = (
  overrides: Partial<{
    findJob: jest.Mock;
    updateJobStatus: jest.Mock;
    completeJobWithResult: jest.Mock;
  }> = {},
) => ({
  findJob: jest.fn().mockResolvedValue(baseJob),
  updateJobStatus: jest
    .fn()
    .mockResolvedValue({ ...baseJob, status: 'failed' }),
  completeJobWithResult: jest.fn().mockResolvedValue(completedJob),
  ...overrides,
});

const makeCatalogService = () => ({
  getDefaultCatalog: jest.fn().mockReturnValue({
    provider: baseJob.provider,
    model: baseJob.model,
    flow: baseJob.flow,
    prompt: baseJob.prompt,
  }),
});

describe('ProcessDocumentJobUseCase', () => {
  let engine: MockExtractionEngine;

  beforeEach(() => {
    engine = new MockExtractionEngine();
  });

  it('calls extract with document text and catalog', async () => {
    const repo = makeRepo();
    const useCase = new ProcessDocumentJobUseCase(
      repo as unknown as JobRepository,
      engine,
      makeCatalogService() as unknown as CatalogService,
    );
    const spy = jest.spyOn(engine, 'extract');

    await useCase.execute('job-1');

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ text: baseJob.document!.extractedText }),
    );
  });

  it('persists the extraction result and returns completed job', async () => {
    const repo = makeRepo();
    const useCase = new ProcessDocumentJobUseCase(
      repo as unknown as JobRepository,
      engine,
      makeCatalogService() as unknown as CatalogService,
    );

    const result = await useCase.execute('job-1');

    expect(repo.completeJobWithResult).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-1', confidence: 0.91 }),
    );
    expect(result.status).toBe('completed');
  });

  it('sets job to failed and rethrows when extraction throws', async () => {
    const repo = makeRepo();
    const failingEngine = {
      extract: jest.fn().mockRejectedValue(new Error('LangFlow timeout')),
    };
    const useCase = new ProcessDocumentJobUseCase(
      repo as unknown as JobRepository,
      failingEngine as unknown as ExtractionEngine,
      makeCatalogService() as unknown as CatalogService,
    );

    await expect(useCase.execute('job-1')).rejects.toThrow('LangFlow timeout');
    expect(repo.updateJobStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      'LangFlow timeout',
    );
  });

  it('throws BadRequestException when job is not found', async () => {
    const repo = makeRepo({ findJob: jest.fn().mockResolvedValue(null) });
    const useCase = new ProcessDocumentJobUseCase(
      repo as unknown as JobRepository,
      engine,
      makeCatalogService() as unknown as CatalogService,
    );

    await expect(useCase.execute('missing-job')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when job is missing document relation', async () => {
    const repo = makeRepo({
      findJob: jest.fn().mockResolvedValue({ ...baseJob, document: undefined }),
    });
    const useCase = new ProcessDocumentJobUseCase(
      repo as unknown as JobRepository,
      engine,
      makeCatalogService() as unknown as CatalogService,
    );

    await expect(useCase.execute('job-1')).rejects.toThrow(BadRequestException);
  });
});
