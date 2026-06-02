import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { JOB_REPOSITORY } from '../../domain/tokens';
import type { JobRepository } from '../../domain/ports/job.repository';
import { ProcessDocumentJobUseCase } from '../../document-intelligence/use-cases/process-document-job.usecase';
import {
  DOCUMENT_INTELLIGENCE_QUEUE,
  WORKER_CONCURRENCY,
} from './queue.constants';

@Injectable()
class BullMqDocumentJobWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BullMqDocumentJobWorkerService.name);
  private readonly connection: IORedis;
  private worker?: Worker<{ jobId: string }>;

  constructor(
    private readonly config: ConfigService,
    private readonly processJobUseCase: ProcessDocumentJobUseCase,
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
  ) {
    this.connection = new IORedis(this.config.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: null,
    });
  }

  onModuleInit(): void {
    this.worker = new Worker<{ jobId: string }>(
      DOCUMENT_INTELLIGENCE_QUEUE,
      (job) => this.processJobUseCase.execute(job.data.jobId),
      { connection: this.connection, concurrency: WORKER_CONCURRENCY },
    );

    this.worker.on('failed', (job, err) => void this.onJobFailed(job, err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection.quit();
  }

  private async onJobFailed(
    job: Job<{ jobId: string }> | undefined,
    err: Error,
  ): Promise<void> {
    if (!job) return;

    const message = err.message ?? 'Unknown worker error';
    this.logger.error(`Job ${job.data.jobId} failed: ${message}`);

    try {
      await this.jobRepository.updateJobStatus(
        job.data.jobId,
        'failed',
        message,
      );
    } catch (dbErr) {
      this.logger.error(
        `Failed to persist failure status for job ${job.data.jobId}`,
        dbErr,
      );
    }
  }
}

export { BullMqDocumentJobWorkerService };
