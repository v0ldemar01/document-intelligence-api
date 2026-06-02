import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

interface TransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
}

type TryLockRow = { pg_try_advisory_lock: boolean };

// ─── FNV-1a 64-bit hash constants ────────────────────────────────────────────
// https://www.isthe.com/chongo/tech/comp/fnv/
const FNV1A_64_OFFSET_BASIS = 14695981039346656037n;
const FNV1A_64_PRIME = 1099511628211n;
const UINT64_MASK = (1n << 64n) - 1n; // 0xFFFF_FFFF_FFFF_FFFF

// PostgreSQL bigint is signed int64.
const INT64_MAX = (1n << 63n) - 1n; // 9_223_372_036_854_775_807
const UINT64_MODULUS = 1n << 64n; // 18_446_744_073_709_551_616

@Injectable()
class DatabaseService extends PrismaService {
  async withTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel:
        options.isolationLevel ??
        Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: options.maxWait ?? 2_000,
      timeout: options.timeout ?? 5_000,
    });
  }

  async withAdvisoryLock<T>(
    key: string | bigint,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = this.toLockKey(key);
    await this.$executeRaw`SELECT pg_advisory_lock(${lockKey})`;
    try {
      return await fn();
    } finally {
      await this.$executeRaw`SELECT pg_advisory_unlock(${lockKey})`;
    }
  }

  async tryWithAdvisoryLock<T>(
    key: string | bigint,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const lockKey = this.toLockKey(key);
    const [row] = await this.$queryRaw<TryLockRow[]>`
      SELECT pg_try_advisory_lock(${lockKey}) AS pg_try_advisory_lock
    `;

    if (!row.pg_try_advisory_lock) return null;

    try {
      return await fn();
    } finally {
      await this.$executeRaw`SELECT pg_advisory_unlock(${lockKey})`;
    }
  }

  async withAdvisoryXactLock<T>(
    tx: Prisma.TransactionClient,
    key: string | bigint,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockKey = this.toLockKey(key);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
    return fn();
  }

  toLockKey(key: string | bigint): bigint {
    const unsigned = typeof key === 'bigint' ? key : this.fnv1a64(key);
    return this.toSignedInt64(unsigned);
  }

  private fnv1a64(input: string): bigint {
    let hash = FNV1A_64_OFFSET_BASIS;
    for (let i = 0; i < input.length; i++) {
      hash ^= BigInt(input.charCodeAt(i));
      hash = (hash * FNV1A_64_PRIME) & UINT64_MASK;
    }
    return hash;
  }

  private toSignedInt64(unsigned: bigint): bigint {
    return unsigned > INT64_MAX ? unsigned - UINT64_MODULUS : unsigned;
  }
}

export { DatabaseService };
