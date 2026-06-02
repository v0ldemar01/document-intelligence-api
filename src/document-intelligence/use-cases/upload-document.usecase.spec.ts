import { BadRequestException, Logger } from '@nestjs/common';
import { UploadDocumentUseCase } from './upload-document.usecase';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';
import type { DocumentRepository } from '../../domain/ports/document.repository';
import type { JobRepository } from '../../domain/ports/job.repository';
import type { DocumentStorage } from '../../domain/document-storage';
import type { DocumentJobDispatcher } from '../../domain/document-job-dispatcher';
import type { DocumentParserService } from '../../infrastructure/parsing/document-parser.service';
import type { CatalogService } from '../catalog/catalog.service';
import { UploadedDocumentFile } from '../types/types';

const now = new Date();

const baseDoc = {
  id: 'doc-1',
  fileName: 'invoice.txt',
  storagePath: 's3://bucket/doc',
  mimeType: 'text/plain',
  size: 100,
  checksum: 'abc',
  documentType: 'invoice',
  extractedText: 'test',
  createdAt: now,
  updatedAt: now,
};

const baseJob = {
  id: 'job-1',
  documentId: 'doc-1',
  providerId: 'p1',
  modelId: 'm1',
  flowId: 'f1',
  promptId: 'pr1',
  status: 'running' as const,
  errorMessage: null,
  retryCount: 0,
  nextRetryAt: null as Date | null,
  createdAt: now,
  updatedAt: now,
};

const catalog = {
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
};

const makeFile = (overrides = {}) => ({
  originalname: 'invoice.txt',
  mimetype: 'text/plain',
  size: 100,
  buffer: Buffer.from('Invoice Number: INV-001'),
  ...overrides,
});

const makeDeps = (overrides: Record<string, unknown> = {}) => ({
  catalogService: { getDefaultCatalog: jest.fn().mockReturnValue(catalog) },
  documentRepository: {
    atomicCreateDocumentAndJob: jest
      .fn()
      .mockResolvedValue({ document: baseDoc, job: baseJob }),
  },
  jobRepository: { updateJobStatus: jest.fn().mockResolvedValue(baseJob) },
  parser: {
    parse: jest.fn().mockResolvedValue({
      text: 'Invoice Number: INV-001',
      documentType: 'invoice',
    }),
  },
  documentStorage: { save: jest.fn().mockResolvedValue('s3://bucket/doc') },
  dispatcher: { dispatch: jest.fn().mockResolvedValue(undefined) },
  ...overrides,
});

function makeUseCase(deps: ReturnType<typeof makeDeps>): UploadDocumentUseCase {
  return new UploadDocumentUseCase(
    deps.catalogService as unknown as CatalogService,
    deps.documentRepository as unknown as DocumentRepository,
    deps.jobRepository as unknown as JobRepository,
    deps.parser as unknown as DocumentParserService,
    deps.documentStorage as unknown as DocumentStorage,
    deps.dispatcher as unknown as DocumentJobDispatcher,
  );
}

describe('UploadDocumentUseCase', () => {
  beforeAll(() =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
  );
  afterAll(() => jest.restoreAllMocks());

  it('parses, stores and creates document+job atomically', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);

    const result = await uc.execute(makeFile());

    expect(deps.parser.parse).toHaveBeenCalledWith(
      'invoice.txt',
      'text/plain',
      expect.any(Buffer),
    );
    expect(deps.documentStorage.save).toHaveBeenCalled();
    expect(
      deps.documentRepository.atomicCreateDocumentAndJob,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'invoice.txt',
        documentType: 'invoice',
      }),
      expect.objectContaining({ providerId: 'p1', flowId: 'f1' }),
      expect.stringContaining('doc-intel:upload-dedup:'),
    );
    expect(result.document).toBe(baseDoc);
    expect(result.job.status).toBe('running');
  });

  it('dispatches the job after creation', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);

    await uc.execute(makeFile());

    expect(deps.dispatcher.dispatch).toHaveBeenCalledWith('job-1');
  });

  it('applies custom flowId and promptId from options when they are valid IDs', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);
    // Must be ≥20 chars to pass the isValidId guard (real Prisma CUIDs are 25 chars)
    const validFlowId = 'clx12345678901234567890';
    const validPromptId = 'clx09876543210987654321';

    await uc.execute(makeFile(), {
      flowId: validFlowId,
      promptId: validPromptId,
    });

    expect(
      deps.documentRepository.atomicCreateDocumentAndJob,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flowId: validFlowId, promptId: validPromptId }),
      expect.any(String),
    );
  });

  it('ignores short/placeholder flowId and falls back to catalog default', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);

    // 'string' (Swagger placeholder, 6 chars) and 'custom-flow' (12 chars) are ignored
    await uc.execute(makeFile(), { flowId: 'string', promptId: 'custom-flow' });

    expect(
      deps.documentRepository.atomicCreateDocumentAndJob,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ flowId: 'f1', promptId: 'pr1' }),
      expect.any(String),
    );
  });

  it('sets job to failed and rethrows when dispatch throws', async () => {
    const dispatchError = new Error('Redis unavailable');
    const deps = makeDeps({
      dispatcher: { dispatch: jest.fn().mockRejectedValue(dispatchError) },
    });
    const uc = makeUseCase(deps);

    await expect(uc.execute(makeFile())).rejects.toThrow('Redis unavailable');
    expect(deps.jobRepository.updateJobStatus).toHaveBeenCalledWith(
      'job-1',
      'failed',
      'Redis unavailable',
    );
  });

  it('throws BadRequestException when no file is provided', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);

    await expect(
      uc.execute(undefined as unknown as UploadedDocumentFile),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses SHA-256 checksum of the file buffer', async () => {
    const deps = makeDeps();
    const uc = makeUseCase(deps);

    await uc.execute(makeFile());

    const callArgs = deps.documentRepository.atomicCreateDocumentAndJob.mock
      .calls[0] as unknown as Parameters<
      DocumentRepository['atomicCreateDocumentAndJob']
    >;
    expect(callArgs[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
