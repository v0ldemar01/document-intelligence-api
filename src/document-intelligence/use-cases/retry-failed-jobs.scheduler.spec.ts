import { ConfigService } from '@nestjs/config';
import { RetryFailedJobsScheduler } from './retry-failed-jobs.scheduler';
import type { JobRepository } from '../../domain/ports/job.repository';
import type { DocumentJobDispatcher } from '../../domain/document-job-dispatcher';
import type { DatabaseService } from '../../infrastructure/database/database.service';

const now = new Date();

const makeJob = (jobId: string, retryCount = 0) => ({
  id: jobId,
  documentId: 'doc-1',
  providerId: 'p1',
  modelId: 'm1',
  flowId: 'f1',
  promptId: 'pr1',
  status: 'failed' as const,
  errorMessage: 'LangFlow timeout',
  retryCount,
  nextRetryAt: null as Date | null,
  createdAt: now,
  updatedAt: new Date(Date.now() - 10 * 60_000),
});

function makeConfig(retryBaseMs = 5 * 60_000, maxRetries = 3): ConfigService {
  return {
    get: jest.fn(),
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'processing.failedJobRetryBaseMs') return retryBaseMs;
      if (key === 'processing.maxSchedulerRetries') return maxRetries;
      throw new Error(`Config key "${key}" not found`);
    }),
  } as unknown as ConfigService;
}

function makeDb(): jest.Mocked<DatabaseService> {
  return {
    tryWithAdvisoryLock: jest
      .fn()
      .mockImplementation((_key: unknown, fn: () => Promise<unknown>) => fn()),
  } as unknown as jest.Mocked<DatabaseService>;
}

function makeJobRepo(
  overrides: Partial<jest.Mocked<JobRepository>> = {},
): jest.Mocked<JobRepository> {
  return {
    findFailedJobsReadyForRetry: jest.fn().mockResolvedValue([]),
    updateJobStatus: jest.fn().mockResolvedValue(undefined),
    scheduleJobRetry: jest.fn().mockImplementation((id: string) => ({
      ...makeJob(id),
      status: 'running',
      retryCount: 1,
    })),
    ...overrides,
  } as unknown as jest.Mocked<JobRepository>;
}

function makeDispatcher(): jest.Mocked<DocumentJobDispatcher> {
  return {
    dispatch: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<DocumentJobDispatcher>;
}

function makeScheduler(
  config = makeConfig(),
  db = makeDb(),
  repo = makeJobRepo(),
  dispatcher = makeDispatcher(),
): RetryFailedJobsScheduler {
  return new RetryFailedJobsScheduler(config, db, repo, dispatcher);
}

describe('RetryFailedJobsScheduler', () => {
  it('acquires distributed advisory lock before running', async () => {
    const db = makeDb();
    await makeScheduler(makeConfig(), db).retryFailedJobs();

    expect(db.tryWithAdvisoryLock).toHaveBeenCalledWith(
      'doc-intel:retry-failed-jobs-cron',
      expect.any(Function),
    );
  });

  it('does nothing when no failed jobs are found', async () => {
    const repo = makeJobRepo();
    const dispatcher = makeDispatcher();
    await makeScheduler(
      makeConfig(),
      makeDb(),
      repo,
      dispatcher,
    ).retryFailedJobs();

    expect(repo.scheduleJobRetry).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('calls scheduleJobRetry and dispatches each ready job', async () => {
    const jobs = [makeJob('job-1'), makeJob('job-2', 1)];
    const repo = makeJobRepo({
      findFailedJobsReadyForRetry: jest.fn().mockResolvedValue(jobs),
    });
    const dispatcher = makeDispatcher();
    await makeScheduler(
      makeConfig(),
      makeDb(),
      repo,
      dispatcher,
    ).retryFailedJobs();

    expect(repo.scheduleJobRetry).toHaveBeenCalledWith(
      'job-1',
      expect.any(Date),
    );
    expect(repo.scheduleJobRetry).toHaveBeenCalledWith(
      'job-2',
      expect.any(Date),
    );
    expect(dispatcher.dispatch).toHaveBeenCalledWith('job-1');
    expect(dispatcher.dispatch).toHaveBeenCalledWith('job-2');
  });

  it('applies exponential backoff — each retry doubles the delay', async () => {
    const baseMs = 5 * 60_000;
    const jobs = [makeJob('j0', 0), makeJob('j1', 1), makeJob('j2', 2)];
    const captured: Date[] = [];

    const repo = makeJobRepo({
      findFailedJobsReadyForRetry: jest.fn().mockResolvedValue(jobs),
      scheduleJobRetry: jest.fn().mockImplementation((id: string, d: Date) => {
        captured.push(d);
        return Promise.resolve({ ...makeJob(id), status: 'running' });
      }),
    });

    const before = Date.now();
    await makeScheduler(makeConfig(baseMs), makeDb(), repo).retryFailedJobs();

    expect(captured).toHaveLength(3);
    const delays = captured.map((d) => d.getTime() - before);
    expect(delays[1] / delays[0]).toBeCloseTo(2, 0);
    expect(delays[2] / delays[0]).toBeCloseTo(4, 0);
  });

  it('passes maxRetries and now to findFailedJobsReadyForRetry', async () => {
    const repo = makeJobRepo();
    const before = Date.now();
    await makeScheduler(
      makeConfig(5 * 60_000, 3),
      makeDb(),
      repo,
    ).retryFailedJobs();
    const after = Date.now();

    expect(repo.findFailedJobsReadyForRetry).toHaveBeenCalledWith(
      3,
      expect.any(Date),
    );
    const [, nowArg] = repo.findFailedJobsReadyForRetry.mock.calls[0] as [
      number,
      Date,
    ];
    expect(nowArg.getTime()).toBeGreaterThanOrEqual(before);
    expect(nowArg.getTime()).toBeLessThanOrEqual(after);
  });

  it('falls back to updateJobStatus(failed) when dispatch throws', async () => {
    const repo = makeJobRepo({
      findFailedJobsReadyForRetry: jest
        .fn()
        .mockResolvedValue([makeJob('job-fail')]),
    });
    const dispatcher = makeDispatcher();
    dispatcher.dispatch.mockRejectedValueOnce(new Error('Redis down'));

    await makeScheduler(
      makeConfig(),
      makeDb(),
      repo,
      dispatcher,
    ).retryFailedJobs();

    expect(repo.updateJobStatus).toHaveBeenCalledWith(
      'job-fail',
      'failed',
      'Redis down',
    );
  });

  it('skips when tryWithAdvisoryLock returns null (lock held elsewhere)', async () => {
    const db = makeDb();
    db.tryWithAdvisoryLock.mockResolvedValueOnce(null);
    const repo = makeJobRepo();

    await makeScheduler(makeConfig(), db, repo).retryFailedJobs();

    expect(repo.findFailedJobsReadyForRetry).not.toHaveBeenCalled();
  });
});
