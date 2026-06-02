import {
  CreateJobInput,
  CreateResultInput,
  JobRecord,
} from '../document-intelligence.types';

interface JobRepository {
  createJob(input: CreateJobInput): Promise<JobRecord>;
  findJob(id: string): Promise<JobRecord | null>;
  listJobs(): Promise<JobRecord[]>;
  updateJobStatus(
    jobId: string,
    status: JobRecord['status'],
    errorMessage?: string | null,
  ): Promise<JobRecord>;
  completeJobWithResult(input: CreateResultInput): Promise<JobRecord>;
  findFailedJobsReadyForRetry(
    maxRetries: number,
    now: Date,
  ): Promise<JobRecord[]>;
  scheduleJobRetry(jobId: string, nextRetryAt: Date): Promise<JobRecord>;
}

export { type JobRepository };
