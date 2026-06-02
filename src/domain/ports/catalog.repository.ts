import {
  CatalogBundle,
  CatalogSeed,
  FlowRecord,
  ModelRecord,
  PromptRecord,
  ProviderRecord,
} from '../document-intelligence.types';

export interface CatalogRepository {
  ping(): Promise<void>;
  ensureSeedData(seed: CatalogSeed): Promise<CatalogBundle>;
  listProviders(): Promise<ProviderRecord[]>;
  listModels(): Promise<ModelRecord[]>;
  listFlows(): Promise<FlowRecord[]>;
  listPrompts(): Promise<PromptRecord[]>;
  findProvider(id: string): Promise<ProviderRecord | null>;
  findModel(id: string): Promise<ModelRecord | null>;
  findFlow(id: string): Promise<FlowRecord | null>;
  findPrompt(id: string): Promise<PromptRecord | null>;
}
