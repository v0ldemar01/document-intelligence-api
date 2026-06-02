import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  DOCUMENT_REPOSITORY,
  JOB_REPOSITORY,
  DOCUMENT_STORAGE,
  DOCUMENT_JOB_DISPATCHER,
} from '../../domain/tokens';
import type { DocumentRepository } from '../../domain/ports/document.repository';
import type { JobRepository } from '../../domain/ports/job.repository';
import type { DocumentStorage } from '../../domain/document-storage';
import type { DocumentJobDispatcher } from '../../domain/document-job-dispatcher';
import { AdvisoryLocks } from '../../domain/advisory-lock-keys';
import { DocumentParserService } from '../../infrastructure/parsing/document-parser.service';
import { CatalogService } from '../catalog/catalog.service';
import { UploadDocumentResponseDto } from '../dtos/dtos';
import type { UploadedDocumentFile } from '../types/types';

const isValidId = (id?: string): id is string => {
  return typeof id === 'string' && id.trim().length >= 20;
};

@Injectable()
class UploadDocumentUseCase {
  private readonly logger = new Logger(UploadDocumentUseCase.name);

  constructor(
    private readonly catalogService: CatalogService,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: DocumentRepository,
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
    private readonly parser: DocumentParserService,
    @Inject(DOCUMENT_STORAGE)
    private readonly documentStorage: DocumentStorage,
    @Inject(DOCUMENT_JOB_DISPATCHER)
    private readonly dispatcher: DocumentJobDispatcher,
  ) {}

  async execute(
    file: UploadedDocumentFile,
    options: { flowId?: string; promptId?: string } = {},
  ): Promise<UploadDocumentResponseDto> {
    if (!file) {
      throw new BadRequestException('A document file is required');
    }

    const parsedDocument = await this.parser.parse(
      file.originalname,
      file.mimetype,
      file.buffer,
    );
    const storagePath = await this.documentStorage.save(file);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const catalog = this.catalogService.getDefaultCatalog();

    const { document, job } =
      await this.documentRepository.atomicCreateDocumentAndJob(
        {
          fileName: file.originalname,
          storagePath,
          mimeType: file.mimetype,
          size: file.size,
          checksum,
          documentType: parsedDocument.documentType,
          extractedText: parsedDocument.text,
        },
        {
          providerId: catalog.provider.id,
          modelId: catalog.model.id,
          flowId: isValidId(options.flowId) ? options.flowId : catalog.flow.id,
          promptId: isValidId(options.promptId)
            ? options.promptId
            : catalog.prompt.id,
        },
        AdvisoryLocks.uploadDedup(checksum),
      );

    try {
      await this.dispatcher.dispatch(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dispatch failed';
      this.logger.error(`Failed to dispatch job ${job.id}: ${message}`);
      await this.jobRepository.updateJobStatus(job.id, 'failed', message);
      throw err;
    }

    return { document, job };
  }
}

export { UploadDocumentUseCase };
