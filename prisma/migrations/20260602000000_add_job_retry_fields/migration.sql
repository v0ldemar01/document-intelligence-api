-- Add retry tracking fields to jobs table
ALTER TABLE "jobs"
  ADD COLUMN "retryCount"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3);

-- Index for the scheduler query:
-- WHERE status = 'failed' AND retryCount < maxRetries AND (nextRetryAt IS NULL OR nextRetryAt <= now)
CREATE INDEX "jobs_nextRetryAt_idx" ON "jobs"("nextRetryAt");
