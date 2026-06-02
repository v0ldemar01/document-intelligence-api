import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { DocumentJobDispatcher } from '../../domain/document-job-dispatcher';
import {
  DOCUMENT_INTELLIGENCE_QUEUE,
  JOB_BACKOFF_DELAY_MS,
  JOB_MAX_ATTEMPTS,
  PROCESS_DOCUMENT_JOB,
} from './queue.constants';

@Injectable()
class BullMqDocumentJobDispatcherService
  implements DocumentJobDispatcher, OnModuleDestroy
{
  private readonly connection: IORedis;
  private readonly queue: Queue;

  constructor(private readonly config: ConfigService) {
    this.connection = new IORedis(this.config.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(DOCUMENT_INTELLIGENCE_QUEUE, {
      connection: this.connection,
    });
  }

  async dispatch(jobId: string): Promise<void> {
    await this.queue.add(
      PROCESS_DOCUMENT_JOB,
      { jobId },
      {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY_MS },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}

export { BullMqDocumentJobDispatcherService };
