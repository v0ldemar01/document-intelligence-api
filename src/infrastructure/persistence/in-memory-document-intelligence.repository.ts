import { Injectable } from '@nestjs/common';
import {
  CatalogBundle,
  CatalogSeed,
  CreateDocumentInput,
  CreateJobInput,
  CreateResultInput,
  DocumentRecord,
  FlowRecord,
  JobRecord,
  ModelRecord,
  PromptRecord,
  ProviderRecord,
} from '../../domain/document-intelligence.types';
import { randomUUID } from 'crypto';
import { DocumentIntelligenceRepository } from '../../domain/document-intelligence.repository';

function now(): Date {
  return new Date();
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

@Injectable()
class InMemoryDocumentIntelligenceRepository
  implements DocumentIntelligenceRepository
{
  private providerRecords: ProviderRecord[] = [];
  private modelRecords: ModelRecord[] = [];
  private flowRecords: FlowRecord[] = [];
  private promptRecords: PromptRecord[] = [];
  private documentRecords: DocumentRecord[] = [];
  private jobRecords: JobRecord[] = [];

  async ping(): Promise<void> {
    return Promise.resolve();
  }

  ensureSeedData(seed: CatalogSeed): Promise<CatalogBundle> {
    const provider = this.upsertProvider(seed.provider.name, seed.provider);
    const model = this.upsertModel(seed.model.name, provider.id, seed.model);
    const flow = this.upsertFlow(
      seed.flow.name,
      provider.id,
      model.id,
      seed.flow,
    );
    const prompt = this.upsertPrompt(seed.prompt.name, flow.id, seed.prompt);

    return Promise.resolve({ provider, model, flow, prompt });
  }

  findProvider(idValue: string): Promise<ProviderRecord | null> {
    return Promise.resolve(
      this.providerRecords.find((r) => r.id === idValue) ?? null,
    );
  }

  findModel(idValue: string): Promise<ModelRecord | null> {
    return Promise.resolve(
      this.modelRecords.find((r) => r.id === idValue) ?? null,
    );
  }

  findFlow(idValue: string): Promise<FlowRecord | null> {
    return Promise.resolve(
      this.flowRecords.find((r) => r.id === idValue) ?? null,
    );
  }

  findPrompt(idValue: string): Promise<PromptRecord | null> {
    return Promise.resolve(
      this.promptRecords.find((r) => r.id === idValue) ?? null,
    );
  }

  listProviders(): Promise<ProviderRecord[]> {
    return Promise.resolve(this.providerRecords);
  }

  listModels(): Promise<ModelRecord[]> {
    return Promise.resolve(this.modelRecords);
  }

  listFlows(): Promise<FlowRecord[]> {
    return Promise.resolve(this.flowRecords);
  }

  listPrompts(): Promise<PromptRecord[]> {
    return Promise.resolve(this.promptRecords);
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return Promise.resolve(this.documentRecords);
  }

  listJobs(): Promise<JobRecord[]> {
    return Promise.resolve(this.jobRecords);
  }

  findDocument(idValue: string): Promise<DocumentRecord | null> {
    return Promise.resolve(
      this.documentRecords.find((document) => document.id === idValue) ?? null,
    );
  }

  findJob(idValue: string): Promise<JobRecord | null> {
    return Promise.resolve(
      this.jobRecords.find((job) => job.id === idValue) ?? null,
    );
  }

  async deleteDocument(idValue: string): Promise<void> {
    this.documentRecords = this.documentRecords.filter((r) => r.id !== idValue);
    this.jobRecords = this.jobRecords.filter((r) => r.documentId !== idValue);

    return Promise.resolve();
  }

  async atomicCreateDocumentAndJob(
    documentInput: CreateDocumentInput,
    jobInput: Omit<CreateJobInput, 'documentId'>,
  ): Promise<{ document: DocumentRecord; job: JobRecord }> {
    const document = await this.createDocument(documentInput);
    const job = await this.createJob({ ...jobInput, documentId: document.id });

    job.status = 'running';
    return { document, job };
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    const document: DocumentRecord = {
      id: id('document'),
      ...input,
      createdAt: now(),
      updatedAt: now(),
    };

    this.documentRecords.unshift(document);
    return Promise.resolve(document);
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const job: JobRecord = {
      id: id('job'),
      ...input,
      status: 'created',
      errorMessage: null,
      retryCount: 0,
      nextRetryAt: null,
      createdAt: now(),
      updatedAt: now(),
      document: this.documentRecords.find(
        (document) => document.id === input.documentId,
      ),
      provider: this.providerRecords.find(
        (provider) => provider.id === input.providerId,
      ),
      model: this.modelRecords.find((model) => model.id === input.modelId),
      flow: this.flowRecords.find((flow) => flow.id === input.flowId),
      prompt: this.promptRecords.find((prompt) => prompt.id === input.promptId),
      result: null,
    };

    this.jobRecords.unshift(job);
    return Promise.resolve(job);
  }

  async updateJobStatus(
    jobId: string,
    status: JobRecord['status'],
    errorMessage?: string | null,
  ): Promise<JobRecord> {
    const job = this.requireJob(jobId);
    job.status = status;
    job.errorMessage = errorMessage ?? null;
    job.updatedAt = now();
    return Promise.resolve(job);
  }

  findFailedJobsReadyForRetry(
    maxRetries: number,
    asOf: Date,
  ): Promise<JobRecord[]> {
    return Promise.resolve(
      this.jobRecords.filter(
        (j) =>
          j.status === 'failed' &&
          j.retryCount < maxRetries &&
          (j.nextRetryAt === null || j.nextRetryAt <= asOf),
      ),
    );
  }

  scheduleJobRetry(jobId: string, nextRetryAt: Date): Promise<JobRecord> {
    const job = this.requireJob(jobId);
    job.status = 'running';
    job.retryCount += 1;
    job.nextRetryAt = nextRetryAt;
    job.errorMessage = null;
    job.updatedAt = new Date();
    return Promise.resolve(job);
  }

  async completeJobWithResult(input: CreateResultInput): Promise<JobRecord> {
    const job = this.requireJob(input.jobId);
    job.result = {
      id: id('result'),
      jobId: input.jobId,
      payload: input.payload,
      confidence: input.confidence,
      createdAt: now(),
      updatedAt: now(),
    };
    job.status = 'completed';
    job.errorMessage = null;
    job.updatedAt = now();
    return Promise.resolve(job);
  }

  private requireJob(jobId: string): JobRecord {
    const job = this.jobRecords.find((record) => record.id === jobId);
    if (!job) {
      throw new Error(`Job ${jobId} was not found`);
    }

    return job;
  }

  private upsertProvider(
    name: string,
    value: Omit<ProviderRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): ProviderRecord {
    const existing = this.providerRecords.find(
      (record) => record.name === name,
    );
    if (existing) {
      Object.assign(existing, value, { updatedAt: now() });
      return existing;
    }

    const provider: ProviderRecord = {
      id: id('provider'),
      ...value,
      createdAt: now(),
      updatedAt: now(),
    };
    this.providerRecords.push(provider);
    return provider;
  }

  private upsertModel(
    name: string,
    providerId: string,
    value: Omit<ModelRecord, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>,
  ): ModelRecord {
    const existing = this.modelRecords.find((record) => record.name === name);
    if (existing) {
      Object.assign(existing, value, { providerId, updatedAt: now() });
      return existing;
    }

    const model: ModelRecord = {
      id: id('model'),
      providerId,
      ...value,
      createdAt: now(),
      updatedAt: now(),
    };
    this.modelRecords.push(model);
    return model;
  }

  private upsertFlow(
    name: string,
    providerId: string,
    modelId: string,
    value: Omit<
      FlowRecord,
      'id' | 'providerId' | 'modelId' | 'createdAt' | 'updatedAt'
    >,
  ): FlowRecord {
    const existing = this.flowRecords.find((record) => record.name === name);
    if (existing) {
      Object.assign(existing, value, { providerId, modelId, updatedAt: now() });
      return existing;
    }

    const flow: FlowRecord = {
      id: id('flow'),
      providerId,
      modelId,
      ...value,
      createdAt: now(),
      updatedAt: now(),
    };
    this.flowRecords.push(flow);
    return flow;
  }

  private upsertPrompt(
    name: string,
    flowId: string,
    value: Omit<PromptRecord, 'id' | 'flowId' | 'createdAt' | 'updatedAt'>,
  ): PromptRecord {
    const existing = this.promptRecords.find((record) => record.name === name);
    if (existing) {
      Object.assign(existing, value, { flowId, updatedAt: now() });
      return existing;
    }

    const prompt: PromptRecord = {
      id: id('prompt'),
      flowId,
      ...value,
      createdAt: now(),
      updatedAt: now(),
    };
    this.promptRecords.push(prompt);
    return prompt;
  }
}

export { InMemoryDocumentIntelligenceRepository };
