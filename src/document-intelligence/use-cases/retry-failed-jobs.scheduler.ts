import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JOB_REPOSITORY, DOCUMENT_JOB_DISPATCHER } from '../../domain/tokens';
import { AdvisoryLocks } from '../../domain/advisory-lock-keys';
import type { JobRecord } from '../../domain/document-intelligence.types';
import type { JobRepository } from '../../domain/ports/job.repository';
import type { DocumentJobDispatcher } from '../../domain/document-job-dispatcher';
import { DatabaseService } from '../../infrastructure/database/database.service';

@Injectable()
class RetryFailedJobsScheduler {
  private readonly logger = new Logger(RetryFailedJobsScheduler.name);
  private readonly retryBaseMs: number;
  private readonly maxSchedulerRetries: number;

  constructor(
    private readonly config: ConfigService,
    private readonly databaseService: DatabaseService,
    @Inject(JOB_REPOSITORY)
    private readonly jobRepository: JobRepository,
    @Inject(DOCUMENT_JOB_DISPATCHER)
    private readonly dispatcher: DocumentJobDispatcher,
  ) {
    this.retryBaseMs = this.config.getOrThrow<number>(
      'processing.failedJobRetryBaseMs',
    );
    this.maxSchedulerRetries = this.config.getOrThrow<number>(
      'processing.maxSchedulerRetries',
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedJobs(): Promise<void> {
    await this.databaseService.tryWithAdvisoryLock(
      AdvisoryLocks.RETRY_FAILED_JOBS_CRON,
      async () => {
        const now = new Date();
        const readyJobs = await this.jobRepository.findFailedJobsReadyForRetry(
          this.maxSchedulerRetries,
          now,
        );

        if (readyJobs.length === 0) return;

        this.logger.log(`Retrying ${readyJobs.length} failed job(s)`);

        const results = await Promise.allSettled(
          readyJobs.map((job) => this.retryOne(job)),
        );

        const failedCount = results.filter(
          (r) => r.status === 'rejected',
        ).length;
        if (failedCount > 0) {
          this.logger.warn(`${failedCount} job(s) could not be re-queued`);
        }
      },
    );
  }

  private async retryOne(job: JobRecord): Promise<void> {
    const nextRetryAt = new Date(
      Date.now() + this.retryBaseMs * Math.pow(2, job.retryCount),
    );

    await this.jobRepository.scheduleJobRetry(job.id, nextRetryAt);

    try {
      await this.dispatcher.dispatch(job.id);
      this.logger.log(
        `Job ${job.id} re-queued (attempt ${job.retryCount + 1}/${this.maxSchedulerRetries}, next window: ${nextRetryAt.toISOString()})`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Dispatch failed during retry';
      this.logger.error(
        `Failed to dispatch retry for job ${job.id}: ${message}`,
      );
      await this.jobRepository.updateJobStatus(job.id, 'failed', message);
    }
  }
}

export { RetryFailedJobsScheduler };
