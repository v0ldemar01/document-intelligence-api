import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CATALOG } from '../../domain/default-catalog';
import { CATALOG_REPOSITORY } from '../../domain/tokens';
import type { CatalogRepository } from '../../domain/ports/catalog.repository';
import {
  CatalogBundle,
  FlowRecord,
  ModelRecord,
  PromptRecord,
  ProviderRecord,
} from '../../domain/document-intelligence.types';

@Injectable()
class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private catalog: CatalogBundle | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(CATALOG_REPOSITORY)
    private readonly repository: CatalogRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const flowId = this.config.get<string>('langflow.flowId')?.trim();
    const seed = flowId
      ? {
          ...DEFAULT_CATALOG,
          flow: { ...DEFAULT_CATALOG.flow, langflowFlowId: flowId },
        }
      : DEFAULT_CATALOG;

    this.catalog = await this.repository.ensureSeedData(seed);
    this.logger.log(
      `Catalog initialized: provider=${this.catalog.provider.name}, flow=${this.catalog.flow.name}`,
    );
  }

  getDefaultCatalog(): CatalogBundle {
    if (!this.catalog) {
      throw new Error('Catalog has not been initialized yet');
    }
    return this.catalog;
  }

  listProviders(): Promise<ProviderRecord[]> {
    return this.repository.listProviders();
  }

  listModels(): Promise<ModelRecord[]> {
    return this.repository.listModels();
  }

  listFlows(): Promise<FlowRecord[]> {
    return this.repository.listFlows();
  }

  listPrompts(): Promise<PromptRecord[]> {
    return this.repository.listPrompts();
  }

  findProvider(id: string): Promise<ProviderRecord | null> {
    return this.repository.findProvider(id);
  }

  findModel(id: string): Promise<ModelRecord | null> {
    return this.repository.findModel(id);
  }

  findFlow(id: string): Promise<FlowRecord | null> {
    return this.repository.findFlow(id);
  }

  findPrompt(id: string): Promise<PromptRecord | null> {
    return this.repository.findPrompt(id);
  }
}

export { CatalogService };
