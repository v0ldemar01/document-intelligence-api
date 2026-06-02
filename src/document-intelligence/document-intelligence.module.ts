import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import {
  CATALOG_REPOSITORY,
  DOCUMENT_REPOSITORY,
  JOB_REPOSITORY,
  DOCUMENT_JOB_DISPATCHER,
  DOCUMENT_STORAGE,
  EXTRACTION_ENGINE,
  DEFAULT_MAX_UPLOAD_SIZE_BYTES,
} from '../domain/tokens';
import { MockExtractionEngine } from '../infrastructure/extraction/mock-extraction.engine';
import { LangFlowExtractionEngine } from '../infrastructure/extraction/langflow-extraction.engine';
import { LangFlowApiService } from '../infrastructure/extraction/langflow-api.service';
import { LangFlowSetupService } from '../infrastructure/extraction/langflow-setup.service';
import { DocumentParserService } from '../infrastructure/parsing/document-parser.service';
import { BullMqDocumentJobDispatcherService } from '../infrastructure/queue/bullmq-document-job-dispatcher.service';
import { BullMqDocumentJobWorkerService } from '../infrastructure/queue/bullmq-document-job-worker.service';
import { AwsS3Service } from '../infrastructure/storage/aws-s3.service';
import { S3DocumentStorageService } from '../infrastructure/storage/s3-document-storage.service';
import { PrismaDocumentIntelligenceRepository } from '../infrastructure/persistence/prisma-document-intelligence.repository';
import { DatabaseService } from '../infrastructure/database/database.service';
import { DocumentIntelligenceController } from './document-intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { CatalogService } from './catalog/catalog.service';
import { UploadDocumentUseCase } from './use-cases/upload-document.usecase';
import { ProcessDocumentJobUseCase } from './use-cases/process-document-job.usecase';
import { RetryFailedJobsScheduler } from './use-cases/retry-failed-jobs.scheduler';
import { DocumentUploadValidationPipe } from './pipes/document-upload-validation.pipe';

@Module({
  imports: [
    MulterModule.register({
      limits: { fileSize: DEFAULT_MAX_UPLOAD_SIZE_BYTES },
    }),
  ],
  controllers: [DocumentIntelligenceController],
  providers: [
    DocumentIntelligenceService,
    CatalogService,
    UploadDocumentUseCase,
    ProcessDocumentJobUseCase,
    RetryFailedJobsScheduler,
    BullMqDocumentJobWorkerService,
    DocumentParserService,
    MockExtractionEngine,
    LangFlowExtractionEngine,
    LangFlowApiService,
    LangFlowSetupService,
    DocumentUploadValidationPipe,
    DatabaseService,
    AwsS3Service,
    { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorageService },
    {
      provide: DOCUMENT_JOB_DISPATCHER,
      useClass: BullMqDocumentJobDispatcherService,
    },
    PrismaDocumentIntelligenceRepository,
    {
      provide: CATALOG_REPOSITORY,
      useExisting: PrismaDocumentIntelligenceRepository,
    },
    {
      provide: DOCUMENT_REPOSITORY,
      useExisting: PrismaDocumentIntelligenceRepository,
    },
    {
      provide: JOB_REPOSITORY,
      useExisting: PrismaDocumentIntelligenceRepository,
    },
    {
      provide: EXTRACTION_ENGINE,
      useFactory: (
        mock: MockExtractionEngine,
        langflow: LangFlowExtractionEngine,
      ) => (process.env.EXTRACTION_ENGINE === 'mock' ? mock : langflow),
      inject: [MockExtractionEngine, LangFlowExtractionEngine],
    },
  ],
})
export class DocumentIntelligenceModule {}
