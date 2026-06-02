/**
 * Centralised advisory lock key definitions.
 *
 * Each constant is a stable string identifier that PrismaService hashes to a
 * PostgreSQL-compatible int64 via FNV-1a. Using named constants here ensures
 * keys are never duplicated or typo'd across call sites.
 *
 * Naming convention:  <domain>:<operation>[:resource-id-suffix]
 */
const AdvisoryLocks = {
  /**
   * Distributed cron guard — only one instance runs the failed-job retry sweep
   * at a time. Uses tryWithAdvisoryLock (non-blocking); other instances skip.
   */
  RETRY_FAILED_JOBS_CRON: 'doc-intel:retry-failed-jobs-cron',

  /**
   * Catalog seeding guard — only one instance seeds the default catalog during
   * startup. Uses withAdvisoryLock (blocking) so all other instances wait and
   * then read the already-seeded data.
   */
  ENSURE_SEED_DATA: 'doc-intel:ensure-seed-data',

  /**
   * Per-checksum upload deduplication lock (transaction-scoped).
   * Prevents two simultaneous uploads of the same file from creating duplicate
   * document+job pairs.
   */
  uploadDedup: (checksum: string) => `doc-intel:upload-dedup:${checksum}`,

  /**
   * Per-job retry lock (transaction-scoped).
   * Prevents two concurrent POST /jobs/:id/retry calls from creating duplicate
   * retry jobs for the same original job.
   */
  retryJob: (jobId: string) => `doc-intel:retry-job:${jobId}`,
} as const;

export { AdvisoryLocks };
