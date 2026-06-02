import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdvisoryLocks } from '../../domain/advisory-lock-keys';
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
import { CatalogRepository } from '../../domain/ports/catalog.repository';
import { DocumentRepository } from '../../domain/ports/document.repository';
import { JobRepository } from '../../domain/ports/job.repository';
import { DatabaseService } from '../database/database.service';

const catalogInclude = {
  document: true,
  provider: true,
  model: true,
  flow: true,
  prompt: true,
  result: true,
} satisfies Prisma.JobInclude;

type ProviderRow = Prisma.ProviderGetPayload<Record<string, never>>;
type ModelRow = Prisma.AiModelGetPayload<Record<string, never>>;
type FlowRow = Prisma.FlowGetPayload<Record<string, never>>;
type PromptRow = Prisma.PromptGetPayload<Record<string, never>>;
type DocumentRow = Prisma.DocumentGetPayload<Record<string, never>>;
type JobRow = Prisma.JobGetPayload<{ include: typeof catalogInclude }>;

@Injectable()
class PrismaDocumentIntelligenceRepository
  implements CatalogRepository, DocumentRepository, JobRepository
{
  constructor(private readonly prisma: DatabaseService) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  async ensureSeedData(seed: CatalogSeed): Promise<CatalogBundle> {
    return this.prisma.withAdvisoryLock(AdvisoryLocks.ENSURE_SEED_DATA, () =>
      this.prisma.withTransaction(async (tx) => {
        const provider = await tx.provider.upsert({
          where: { name: seed.provider.name },
          update: {
            displayName: seed.provider.displayName,
            type: seed.provider.type,
            configuration: seed.provider.configuration as Prisma.InputJsonValue,
            isDefault: seed.provider.isDefault,
          },
          create: {
            ...seed.provider,
            configuration: seed.provider.configuration as Prisma.InputJsonValue,
          },
        });

        const model = await tx.aiModel.upsert({
          where: { name: seed.model.name },
          update: {
            providerId: provider.id,
            displayName: seed.model.displayName,
            version: seed.model.version,
            configuration: seed.model.configuration as Prisma.InputJsonValue,
            isDefault: seed.model.isDefault,
          },
          create: {
            ...seed.model,
            providerId: provider.id,
            configuration: seed.model.configuration as Prisma.InputJsonValue,
          },
        });

        const flow = await tx.flow.upsert({
          where: { name: seed.flow.name },
          update: {
            providerId: provider.id,
            modelId: model.id,
            displayName: seed.flow.displayName,
            version: seed.flow.version,
            langflowFlowId: seed.flow.langflowFlowId,
            configuration: seed.flow.configuration as Prisma.InputJsonValue,
            isDefault: seed.flow.isDefault,
          },
          create: {
            ...seed.flow,
            providerId: provider.id,
            modelId: model.id,
            configuration: seed.flow.configuration as Prisma.InputJsonValue,
          },
        });

        const prompt = await tx.prompt.upsert({
          where: { name: seed.prompt.name },
          update: {
            flowId: flow.id,
            displayName: seed.prompt.displayName,
            version: seed.prompt.version,
            template: seed.prompt.template,
            outputSchema: seed.prompt.outputSchema as Prisma.InputJsonValue,
            isDefault: seed.prompt.isDefault,
          },
          create: {
            ...seed.prompt,
            flowId: flow.id,
            outputSchema: seed.prompt.outputSchema as Prisma.InputJsonValue,
          },
        });

        return {
          provider: this.mapProvider(provider),
          model: this.mapModel(model),
          flow: this.mapFlow(flow),
          prompt: this.mapPrompt(prompt),
        };
      }),
    );
  }

  async findProvider(id: string): Promise<ProviderRecord | null> {
    const provider = await this.prisma.provider.findUnique({ where: { id } });
    return provider ? this.mapProvider(provider) : null;
  }

  async findModel(id: string): Promise<ModelRecord | null> {
    const model = await this.prisma.aiModel.findUnique({ where: { id } });
    return model ? this.mapModel(model) : null;
  }

  async findFlow(id: string): Promise<FlowRecord | null> {
    const flow = await this.prisma.flow.findUnique({ where: { id } });
    return flow ? this.mapFlow(flow) : null;
  }

  async findPrompt(id: string): Promise<PromptRecord | null> {
    const prompt = await this.prisma.prompt.findUnique({ where: { id } });
    return prompt ? this.mapPrompt(prompt) : null;
  }

  async listProviders(): Promise<ProviderRecord[]> {
    return (
      await this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' } })
    ).map((provider) => this.mapProvider(provider));
  }

  async listModels(): Promise<ModelRecord[]> {
    return (
      await this.prisma.aiModel.findMany({ orderBy: { createdAt: 'asc' } })
    ).map((model) => this.mapModel(model));
  }

  async listFlows(): Promise<FlowRecord[]> {
    return (
      await this.prisma.flow.findMany({ orderBy: { createdAt: 'asc' } })
    ).map((flow) => this.mapFlow(flow));
  }

  async listPrompts(): Promise<PromptRecord[]> {
    return (
      await this.prisma.prompt.findMany({ orderBy: { createdAt: 'asc' } })
    ).map((prompt) => this.mapPrompt(prompt));
  }

  async listDocuments(): Promise<DocumentRecord[]> {
    return (
      await this.prisma.document.findMany({ orderBy: { createdAt: 'desc' } })
    ).map((document) => this.mapDocument(document));
  }

  async listJobs(): Promise<JobRecord[]> {
    return (
      await this.prisma.job.findMany({
        include: catalogInclude,
        orderBy: { createdAt: 'desc' },
      })
    ).map((job) => this.mapJob(job));
  }

  async findDocument(id: string): Promise<DocumentRecord | null> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    return document ? this.mapDocument(document) : null;
  }

  async findJob(id: string): Promise<JobRecord | null> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: catalogInclude,
    });
    return job ? this.mapJob(job) : null;
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
    const document = await this.prisma.document.create({ data: input });
    return this.mapDocument(document);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
  }

  async atomicCreateDocumentAndJob(
    documentInput: CreateDocumentInput,
    jobInput: Omit<CreateJobInput, 'documentId'>,
    checksumLockKey: string,
  ): Promise<{ document: DocumentRecord; job: JobRecord }> {
    return this.prisma.withTransaction(async (tx) => {
      // Transaction-scoped advisory lock on the file checksum: if two identical
      // files are uploaded simultaneously, the second request blocks here until
      // the first transaction commits, then sees the already-created document.
      await this.prisma.withAdvisoryXactLock(
        tx,
        checksumLockKey,
        async () => {},
      );

      const docRow = await tx.document.create({ data: documentInput });
      const jobRow = await tx.job.create({
        data: {
          documentId: docRow.id,
          providerId: jobInput.providerId,
          modelId: jobInput.modelId,
          flowId: jobInput.flowId,
          promptId: jobInput.promptId,
          status: 'running',
        },
        include: catalogInclude,
      });

      return { document: this.mapDocument(docRow), job: this.mapJob(jobRow) };
    });
  }

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const job = await this.prisma.job.create({
      data: {
        documentId: input.documentId,
        providerId: input.providerId,
        modelId: input.modelId,
        flowId: input.flowId,
        promptId: input.promptId,
        status: 'created',
      },
      include: catalogInclude,
    });

    return this.mapJob(job);
  }

  async updateJobStatus(
    jobId: string,
    status: JobRecord['status'],
    errorMessage?: string | null,
  ): Promise<JobRecord> {
    const job = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status,
        errorMessage: errorMessage ?? null,
      },
      include: catalogInclude,
    });

    return this.mapJob(job);
  }

  async findFailedJobsReadyForRetry(
    maxRetries: number,
    now: Date,
  ): Promise<JobRecord[]> {
    const jobs = await this.prisma.job.findMany({
      where: {
        status: 'failed',
        retryCount: { lt: maxRetries },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      include: catalogInclude,
      orderBy: { nextRetryAt: 'asc' },
    });
    return jobs.map((job) => this.mapJob(job));
  }

  async scheduleJobRetry(jobId: string, nextRetryAt: Date): Promise<JobRecord> {
    const job = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'running',
        retryCount: { increment: 1 },
        nextRetryAt,
        errorMessage: null,
      },
      include: catalogInclude,
    });
    return this.mapJob(job);
  }

  async completeJobWithResult(input: CreateResultInput): Promise<JobRecord> {
    return this.prisma.withTransaction(async (tx) => {
      await tx.extractionResult.create({
        data: {
          jobId: input.jobId,
          payload: input.payload as Prisma.InputJsonValue,
          confidence: input.confidence,
        },
      });

      const job = await tx.job.update({
        where: { id: input.jobId },
        data: { status: 'completed', errorMessage: null },
        include: catalogInclude,
      });

      return this.mapJob(job);
    });
  }

  private mapProvider(provider: ProviderRow): ProviderRecord {
    return {
      ...provider,
      configuration: this.toRecord(provider.configuration),
    };
  }

  private mapModel(model: ModelRow): ModelRecord {
    return {
      ...model,
      configuration: this.toRecord(model.configuration),
    };
  }

  private mapFlow(flow: FlowRow): FlowRecord {
    return {
      ...flow,
      configuration: this.toRecord(flow.configuration),
    };
  }

  private mapPrompt(prompt: PromptRow): PromptRecord {
    return {
      ...prompt,
      outputSchema: this.toRecord(prompt.outputSchema),
    };
  }

  private mapDocument(document: DocumentRow): DocumentRecord {
    return document;
  }

  private mapJob(job: JobRow): JobRecord {
    return {
      id: job.id,
      documentId: job.documentId,
      providerId: job.providerId,
      modelId: job.modelId,
      flowId: job.flowId,
      promptId: job.promptId,
      status: job.status as JobRecord['status'],
      errorMessage: job.errorMessage,
      retryCount: job.retryCount,
      nextRetryAt: job.nextRetryAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      document: job.document ? this.mapDocument(job.document) : undefined,
      provider: job.provider ? this.mapProvider(job.provider) : undefined,
      model: job.model ? this.mapModel(job.model) : undefined,
      flow: job.flow ? this.mapFlow(job.flow) : undefined,
      prompt: job.prompt ? this.mapPrompt(job.prompt) : undefined,
      result: job.result
        ? {
            id: job.result.id,
            jobId: job.result.jobId,
            payload: this.toRecord(job.result.payload),
            confidence: job.result.confidence,
            createdAt: job.result.createdAt,
            updatedAt: job.result.updatedAt,
          }
        : null,
    };
  }

  private toRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}

export { PrismaDocumentIntelligenceRepository };
