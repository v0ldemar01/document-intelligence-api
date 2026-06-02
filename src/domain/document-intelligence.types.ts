export type JsonRecord = Record<string, unknown>;

export type JobStatus = 'created' | 'running' | 'completed' | 'failed';

export interface ProviderRecord {
  id: string;
  name: string;
  displayName: string;
  type: string;
  configuration: JsonRecord;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelRecord {
  id: string;
  providerId: string;
  name: string;
  displayName: string;
  version: string;
  configuration: JsonRecord;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowRecord {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  displayName: string;
  version: string;
  langflowFlowId: string;
  configuration: JsonRecord;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptRecord {
  id: string;
  flowId: string;
  name: string;
  displayName: string;
  version: string;
  template: string;
  outputSchema: JsonRecord;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentRecord {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  checksum: string;
  documentType: string;
  extractedText: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractionResultRecord {
  id: string;
  jobId: string;
  payload: JsonRecord;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  documentId: string;
  providerId: string;
  modelId: string;
  flowId: string;
  promptId: string;
  status: JobStatus;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  document?: DocumentRecord;
  provider?: ProviderRecord;
  model?: ModelRecord;
  flow?: FlowRecord;
  prompt?: PromptRecord;
  result?: ExtractionResultRecord | null;
}

export interface CatalogSeed {
  provider: Omit<ProviderRecord, 'id' | 'createdAt' | 'updatedAt'>;
  model: Omit<ModelRecord, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>;
  flow: Omit<
    FlowRecord,
    'id' | 'providerId' | 'modelId' | 'createdAt' | 'updatedAt'
  >;
  prompt: Omit<PromptRecord, 'id' | 'flowId' | 'createdAt' | 'updatedAt'>;
}

export interface CatalogBundle {
  provider: ProviderRecord;
  model: ModelRecord;
  flow: FlowRecord;
  prompt: PromptRecord;
}

export interface CreateDocumentInput {
  fileName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  checksum: string;
  documentType: string;
  extractedText: string;
}

export interface CreateJobInput {
  documentId: string;
  providerId: string;
  modelId: string;
  flowId: string;
  promptId: string;
}

export interface CreateResultInput {
  jobId: string;
  payload: JsonRecord;
  confidence: number;
}
