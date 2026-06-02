import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JOB_REPOSITORY, EXTRACTION_ENGINE } from '../../domain/tokens';
import type { JobRepository } from '../../domain/ports/job.repository';
import type {
  ExtractionEngine,
  ExtractionRequest,
} from '../../domain/extraction-engine';
import {
  CatalogBundle,
  JobRecord,
} from '../../domain/document-intelligence.types';
import { CatalogService } from '../catalog/catalog.service';

@Injectable()
class ProcessDocumentJobUseCase {
  private readonly logger = new Logger(ProcessDocumentJobUseCase.name);

  constructor(
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
    @Inject(EXTRACTION_ENGINE)
    private readonly extractionEngine: ExtractionEngine,
    private readonly catalogService: CatalogService,
  ) {}

  async execute(jobId: string): Promise<JobRecord> {
    const job = await this.jobRepository.findJob(jobId);

    if (
      !job ||
      !job.document ||
      !job.provider ||
      !job.model ||
      !job.flow ||
      !job.prompt
    ) {
      throw new BadRequestException(
        `Job ${jobId} is missing catalog or document data`,
      );
    }

    try {
      const catalog = this.catalogFromJob(job);
      const extractionRequest: ExtractionRequest = {
        text: job.document.extractedText,
        documentType: job.document.documentType,
        catalog,
      };

      const extraction = await this.extractionEngine.extract(extractionRequest);

      const completedJob = await this.jobRepository.completeJobWithResult({
        jobId,
        payload: extraction.payload,
        confidence: extraction.confidence,
      });

      this.logger.log(`Job ${jobId} completed for document ${job.document.id}`);
      return completedJob;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown extraction failure';
      await this.jobRepository.updateJobStatus(jobId, 'failed', message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  private catalogFromJob(job: JobRecord): CatalogBundle {
    if (job.provider && job.model && job.flow && job.prompt) {
      return {
        provider: job.provider,
        model: job.model,
        flow: job.flow,
        prompt: job.prompt,
      };
    }
    return this.catalogService.getDefaultCatalog();
  }
}

export { ProcessDocumentJobUseCase };
