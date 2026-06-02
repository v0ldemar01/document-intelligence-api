import { Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  JOB_REPOSITORY,
  DOCUMENT_JOB_DISPATCHER,
} from '../domain/tokens';
import { AdvisoryLocks } from '../domain/advisory-lock-keys';
import { DatabaseService } from '../infrastructure/database/database.service';
import type { DocumentRepository } from '../domain/ports/document.repository';
import type { JobRepository } from '../domain/ports/job.repository';
import type { DocumentJobDispatcher } from '../domain/document-job-dispatcher';
import {
  DocumentRecord,
  FlowRecord,
  JobRecord,
  ModelRecord,
  PromptRecord,
  ProviderRecord,
} from '../domain/document-intelligence.types';
import { CatalogService } from './catalog/catalog.service';
import { UploadDocumentUseCase } from './use-cases/upload-document.usecase';
import { ProcessDocumentJobUseCase } from './use-cases/process-document-job.usecase';
import { UploadDocumentResponseDto } from './dtos/dtos';
import type { UploadedDocumentFile } from './types/types';

@Injectable()
class DocumentIntelligenceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly catalogService: CatalogService,
    private readonly uploadDocumentUseCase: UploadDocumentUseCase,
    private readonly processDocumentJobUseCase: ProcessDocumentJobUseCase,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
    @Inject(DOCUMENT_JOB_DISPATCHER)
    private readonly dispatcher: DocumentJobDispatcher,
  ) {}

  listProviders(): Promise<ProviderRecord[]> {
    return this.catalogService.listProviders();
  }

  listModels(): Promise<ModelRecord[]> {
    return this.catalogService.listModels();
  }

  listFlows(): Promise<FlowRecord[]> {
    return this.catalogService.listFlows();
  }

  listPrompts(): Promise<PromptRecord[]> {
    return this.catalogService.listPrompts();
  }

  listDocuments(): Promise<DocumentRecord[]> {
    return this.documentRepository.listDocuments();
  }

  listJobs(): Promise<JobRecord[]> {
    return this.jobRepository.listJobs();
  }

  getDocument(id: string): Promise<DocumentRecord | null> {
    return this.documentRepository.findDocument(id);
  }

  getJob(id: string): Promise<JobRecord | null> {
    return this.jobRepository.findJob(id);
  }

  deleteDocument(id: string): Promise<void> {
    return this.documentRepository.deleteDocument(id);
  }

  async retryJob(jobId: string): Promise<JobRecord> {
    const original = await this.jobRepository.findJob(jobId);
    if (!original) throw new Error(`Job ${jobId} not found`);

    const newJob = await this.databaseService.withTransaction((tx) =>
      this.databaseService.withAdvisoryXactLock(
        tx,
        AdvisoryLocks.retryJob(jobId),
        () => {
          return this.jobRepository.createJob({
            documentId: original.documentId,
            providerId: original.providerId,
            modelId: original.modelId,
            flowId: original.flowId,
            promptId: original.promptId,
          });
        },
      ),
    );

    await this.jobRepository.updateJobStatus(newJob.id, 'running');

    try {
      await this.dispatcher.dispatch(newJob.id);
    } catch (err) {
      await this.jobRepository.updateJobStatus(
        newJob.id,
        'failed',
        err instanceof Error ? err.message : 'Dispatch failed',
      );
      throw err;
    }

    return this.jobRepository.findJob(newJob.id) as Promise<JobRecord>;
  }

  uploadDocument(
    file: UploadedDocumentFile,
    options: { flowId?: string; promptId?: string } = {},
  ): Promise<UploadDocumentResponseDto> {
    return this.uploadDocumentUseCase.execute(file, options);
  }

  processDocumentJob(jobId: string): Promise<JobRecord> {
    return this.processDocumentJobUseCase.execute(jobId);
  }
}

export { DocumentIntelligenceService };
