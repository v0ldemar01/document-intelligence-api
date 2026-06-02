# Database Concurrency — Transactions and Advisory Locks

This document describes the transaction and advisory lock patterns used in the Document Intelligence API, where each is applied, and the reasoning behind every decision.

## Overview

All database concurrency primitives are exposed through `PrismaService` (`src/infrastructure/persistence/prisma.service.ts`). Advisory lock key strings are centralised in `src/domain/advisory-lock-keys.ts`.

---

## Transactions

### API

```ts
await prisma.withTransaction(
  async (tx: Prisma.TransactionClient) => {
    await tx.document.create({ ... });
    await tx.job.create({ ... });
  },
  // optional:
  {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // default
    maxWait: 2_000,   // ms to wait for a connection slot
    timeout: 5_000,   // ms before the transaction is auto-aborted
  },
);
```

`tx` is a bound Prisma client — every operation on it participates in the same transaction. Pass `tx` instead of `this.prisma` to any query that must be part of the transaction.

### Isolation levels

PostgreSQL supports four isolation levels. The table below shows which scenarios call for each:

| Level | What it prevents | When to use |
|---|---|---|
| `ReadCommitted` **(default)** | Dirty reads | Standard multi-row writes that don't need consistent re-reads |
| `RepeatableRead` | Dirty reads + non-repeatable reads | When you read a row, do work, then read it again and need the same value |
| `Serializable` | All anomalies including phantoms | Financial operations; anything that must behave as if it ran sequentially |

All transactions in this app use the **default `ReadCommitted`**. The two multi-write operations (`completeJobWithResult`, `atomicCreateDocumentAndJob`) are straightforward inserts/updates that do not re-read rows mid-transaction, so `ReadCommitted` is sufficient and has the lowest overhead.

### Where transactions are used

#### `ensureSeedData` — catalog startup seeding
**File:** `src/infrastructure/persistence/prisma-document-intelligence.repository.ts`

```
withAdvisoryLock(ENSURE_SEED_DATA)          ← session lock (see below)
  └─ withTransaction(ReadCommitted)
       ├─ provider.upsert
       ├─ aiModel.upsert
       ├─ flow.upsert
       └─ prompt.upsert
```

**Why a transaction:** The four upserts have a dependency chain — model references the just-upserted provider ID, flow references both. A crash between any two upserts would leave a partial catalog (e.g., provider + model exist, flow does not). The transaction ensures all four succeed or none persist.

---

#### `atomicCreateDocumentAndJob` — upload path
**File:** `src/infrastructure/persistence/prisma-document-intelligence.repository.ts`

```
withTransaction(ReadCommitted)
  ├─ withAdvisoryXactLock(checksumLockKey)   ← xact lock (see below)
  ├─ document.create (status implicitly set)
  └─ job.create (status: 'running')
```

**Why a transaction:** If `job.create` throws after `document.create` commits, the document row has no corresponding job. It becomes an orphan — no job to process it, no way to discover it through the jobs API. The transaction ensures they are written together or not at all.

**Why `status: 'running'` in the transaction:** The job exits the transaction already in the correct dispatch state. No separate `updateJobStatus('running')` call is needed, eliminating a failure window where the job could be stranded in `'created'` if the status update failed.

---

#### `completeJobWithResult` — extraction completion
**File:** `src/infrastructure/persistence/prisma-document-intelligence.repository.ts`

```
withTransaction(ReadCommitted)
  ├─ extractionResult.create
  └─ job.update (status: 'completed')
```

**Why a transaction:** If the `job.update` fails after `extractionResult.create` commits, the extraction result row exists but the job stays in `'running'` indefinitely. The transaction makes the two writes atomic — either the job is marked `completed` with its result, or neither write persists.

---

#### `retryJob` — manual job retry
**File:** `src/document-intelligence/document-intelligence.service.ts`

```
withTransaction(ReadCommitted)
  └─ withAdvisoryXactLock(retryJob(jobId))   ← xact lock (see below)
       └─ jobRepository.createJob
```

**Why a transaction:** Wraps the `createJob` call so the advisory lock is automatically released on commit. Without a transaction, `pg_advisory_xact_lock` is a no-op (transaction-scoped locks only work inside a transaction).

---

## Advisory Locks

PostgreSQL advisory locks are application-level locks identified by a 64-bit integer key. Unlike row locks, they do not block DDL or interfere with regular queries — they are entirely opt-in.

### Lock scopes

| Scope | PostgreSQL function | Acquired by | Released by |
|---|---|---|---|
| **Session** | `pg_advisory_lock` / `pg_try_advisory_lock` | Any query | Explicit `pg_advisory_unlock` or session disconnect |
| **Transaction** | `pg_advisory_xact_lock` | Query inside a transaction | Automatic on transaction commit or rollback |

### Key generation

All keys are defined as human-readable strings in `src/domain/advisory-lock-keys.ts`. `PrismaService.toLockKey()` converts them to PostgreSQL `bigint` at runtime using FNV-1a 64-bit hash:

```
"doc-intel:upload-dedup:abc123..." → bigint (deterministic across restarts)
```

**Naming convention:** `<domain>:<operation>[:resource-id-suffix>`

| Key constant | String | Scope |
|---|---|---|
| `ENSURE_SEED_DATA` | `doc-intel:ensure-seed-data` | Session |
| `RETRY_FAILED_JOBS_CRON` | `doc-intel:retry-failed-jobs-cron` | Session |
| `uploadDedup(checksum)` | `doc-intel:upload-dedup:<sha256>` | Transaction |
| `retryJob(jobId)` | `doc-intel:retry-job:<cuid>` | Transaction |

### Session locks

#### Blocking — `withAdvisoryLock(key, fn)`

```ts
return await this.prisma.withAdvisoryLock(
  AdvisoryLocks.ENSURE_SEED_DATA,
  () => this.prisma.withTransaction(async (tx) => { ... }),
);
```

`pg_advisory_lock` blocks until the lock is available. All callers eventually run `fn`; they just queue up. Use when every caller must eventually complete the work (e.g. startup seeding — every pod must finish initialising before it can serve traffic).

**Used in:** `ensureSeedData` — catalog seeding on startup.

**Problem it solves:** In a multi-pod deployment all instances call `ensureSeedData` on startup simultaneously. Without a lock, all four pods interleave their upserts against the same rows. With the blocking lock, pod A seeds the catalog, pods B/C/D wait, then run their own upserts which are now all no-ops on already-correct data.

---

#### Non-blocking — `tryWithAdvisoryLock(key, fn)`

```ts
await this.prisma.tryWithAdvisoryLock(
  AdvisoryLocks.RETRY_FAILED_JOBS_CRON,
  async () => {
    const failedJobs = await this.jobRepository.findFailedJobsOlderThan(threshold);
    // re-queue each job ...
  },
);
// returns null if another instance holds the lock
```

`pg_try_advisory_lock` returns `false` immediately if another session holds the lock. `tryWithAdvisoryLock` returns `null` in that case. Use when it is acceptable to skip the run entirely — only one instance needs to do the work.

**Used in:** `RetryFailedJobsScheduler.retryFailedJobs`.

**Problem it solves:** Every API pod runs the cron independently. Without a lock, all pods find the same failed jobs and dispatch each one multiple times. With `tryWithAdvisoryLock`, the first pod acquires the lock and runs the sweep; every other pod returns `null` and skips silently.

### Transaction-scoped locks

#### `withAdvisoryXactLock(tx, key, fn)`

```ts
return this.prisma.withTransaction(async (tx) => {
  await this.prisma.withAdvisoryXactLock(tx, checksumLockKey, async () => {});
  // writes follow ...
});
```

`pg_advisory_xact_lock` acquires the lock for the duration of the current transaction. It is automatically released when the transaction commits or rolls back — no explicit unlock, no risk of a leaked lock on unhandled exceptions.

Must be called with a `TransactionClient` (`tx`), not the top-level `PrismaService` instance. Calling it outside a transaction has no effect.

**Used in two places:**

**1. `atomicCreateDocumentAndJob`** — keyed on `uploadDedup(sha256-checksum)`

**Problem it solves:** Two simultaneous uploads of the same file. Without the lock, both requests pass file validation, save to S3, start a transaction, and both create a document row. The second `document.create` succeeds (no unique constraint on content), and two identical documents with two jobs both get dispatched — the same file is extracted twice.

With the lock, the second request blocks at `pg_advisory_xact_lock` until the first transaction commits. It then proceeds with its own transaction, creating a second document row. This is acceptable — the lock prevents data races within a single concurrent burst, not idempotency across all time. If true deduplication is needed (e.g. reject re-uploads of the same file) a unique constraint on `checksum` is the right tool.

**2. `retryJob`** — keyed on `retryJob(jobId)`

**Problem it solves:** Two concurrent `POST /jobs/:id/retry` calls for the same job ID. Without the lock, both read the job, both call `createJob`, and two retry jobs are dispatched for the same original failure. With the lock, the second call blocks while the first creates the retry job and commits.

---

## Cross-system operations (DB + Redis)

Dispatch to BullMQ (`dispatcher.dispatch`) is a Redis write and cannot participate in a PostgreSQL transaction. Both places where a job is dispatched after a DB write protect against dispatch failure with a `try/catch`:

```ts
// UploadDocumentUseCase
try {
  await this.dispatcher.dispatch(job.id);
} catch (err) {
  await this.jobRepository.updateJobStatus(job.id, 'failed', err.message);
  throw err;
}

// DocumentIntelligenceService.retryJob — same pattern
```

If Redis is unavailable, the job is set to `'failed'` in the database. The `RetryFailedJobsScheduler` (runs every 5 minutes) will recover it automatically once Redis is back.

---

## Choosing the right pattern for new code

```
Need to write to multiple rows atomically?
  └─ withTransaction()

  Need to prevent concurrent access to the same logical resource?
    └─ Does the caller NEED to wait (startup, critical section)?
         YES → withAdvisoryLock()              (session, blocking)
         NO  → tryWithAdvisoryLock()           (session, non-blocking / skip)

    └─ Is the lock only needed for the duration of a transaction?
         YES → withAdvisoryXactLock(tx, ...)   (transaction-scoped, auto-released)
```

| Scenario | Pattern |
|---|---|
| Multi-row write that must be atomic | `withTransaction` |
| Startup initialization that only one pod should run first | `withAdvisoryLock` (blocking session) |
| Periodic background job in a multi-pod deployment | `tryWithAdvisoryLock` (non-blocking session) |
| Prevent duplicate writes from concurrent HTTP requests | `withTransaction` + `withAdvisoryXactLock` |
| Sequence: DB write then Redis/HTTP — protect against 2nd step failure | `try/catch` → `updateJobStatus('failed')` |

---

## Lock key reference

All keys are defined in `src/domain/advisory-lock-keys.ts`.

```ts
AdvisoryLocks.ENSURE_SEED_DATA               // startup seeding
AdvisoryLocks.RETRY_FAILED_JOBS_CRON         // cron deduplication
AdvisoryLocks.uploadDedup(checksum: string)  // per-upload deduplication
AdvisoryLocks.retryJob(jobId: string)        // per-job retry deduplication
```

Adding a new lock: add a constant to `AdvisoryLocks`, follow the `<domain>:<operation>[:id]` naming convention. The hash is computed automatically by `PrismaService.toLockKey()` at runtime.
