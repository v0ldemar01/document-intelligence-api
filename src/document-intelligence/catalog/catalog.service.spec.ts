import { ConfigService } from '@nestjs/config';
import { CatalogService } from './catalog.service';
import type { CatalogRepository } from '../../domain/ports/catalog.repository';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';

const now = new Date();

const seededBundle = {
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

const makeRepo = () => ({
  ensureSeedData: jest.fn().mockResolvedValue(seededBundle),
  listProviders: jest.fn().mockResolvedValue([seededBundle.provider]),
  listModels: jest.fn().mockResolvedValue([seededBundle.model]),
  listFlows: jest.fn().mockResolvedValue([seededBundle.flow]),
  listPrompts: jest.fn().mockResolvedValue([seededBundle.prompt]),
  findProvider: jest.fn().mockResolvedValue(seededBundle.provider),
  findModel: jest.fn().mockResolvedValue(seededBundle.model),
  findFlow: jest.fn().mockResolvedValue(seededBundle.flow),
  findPrompt: jest.fn().mockResolvedValue(seededBundle.prompt),
});

function makeConfig(flowId?: string): ConfigService {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'langflow.flowId') return flowId;
      return undefined;
    }),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      throw new Error(`Config key "${key}" not found`);
    }),
  } as unknown as ConfigService;
}

function makeService(repo = makeRepo(), config = makeConfig()): CatalogService {
  return new CatalogService(config, repo as unknown as CatalogRepository);
}

describe('CatalogService', () => {
  describe('onModuleInit', () => {
    it('seeds catalog with DEFAULT_CATALOG when no LANGFLOW_FLOW_ID is set', async () => {
      const repo = makeRepo();
      const svc = makeService(repo, makeConfig(undefined));

      await svc.onModuleInit();

      expect(repo.ensureSeedData).toHaveBeenCalledWith(
        expect.objectContaining({
          flow: expect.objectContaining({ name: 'invoice-flow' }) as Record<
            string,
            unknown
          >,
        }),
      );
    });

    it('patches langflowFlowId in seed when LANGFLOW_FLOW_ID env is set', async () => {
      const repo = makeRepo();
      const svc = makeService(repo, makeConfig('real-flow-uuid'));

      await svc.onModuleInit();

      expect(repo.ensureSeedData).toHaveBeenCalledWith(
        expect.objectContaining({
          flow: expect.objectContaining({
            langflowFlowId: 'real-flow-uuid',
          }) as Record<string, unknown>,
        }),
      );
    });

    it('caches the catalog after seeding', async () => {
      const svc = makeService();
      await svc.onModuleInit();

      const catalog = svc.getDefaultCatalog();

      expect(catalog).toEqual(seededBundle);
    });
  });

  describe('getDefaultCatalog', () => {
    it('throws if called before onModuleInit', () => {
      const svc = makeService();

      expect(() => svc.getDefaultCatalog()).toThrow(
        'Catalog has not been initialized yet',
      );
    });
  });

  describe('list methods', () => {
    it('listProviders delegates to repository', async () => {
      const repo = makeRepo();
      const svc = makeService(repo);
      await svc.onModuleInit();

      const result = await svc.listProviders();

      expect(repo.listProviders).toHaveBeenCalled();
      expect(result[0].name).toBe(DEFAULT_CATALOG.provider.name);
    });

    it('listFlows delegates to repository', async () => {
      const repo = makeRepo();
      const svc = makeService(repo);
      await svc.onModuleInit();

      await svc.listFlows();

      expect(repo.listFlows).toHaveBeenCalled();
    });
  });

  describe('find methods', () => {
    it('findProvider returns provider by id', async () => {
      const repo = makeRepo();
      const svc = makeService(repo);

      await svc.findProvider('p1');

      expect(repo.findProvider).toHaveBeenCalledWith('p1');
    });
  });
});
