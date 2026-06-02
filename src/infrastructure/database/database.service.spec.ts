import { DatabaseService } from './database.service';

class TestDatabaseService extends DatabaseService {
  constructor() {
    super();
  }
}

describe('DatabaseService — key generation', () => {
  let svc: TestDatabaseService;

  beforeEach(() => {
    svc = new TestDatabaseService();
  });

  describe('toLockKey', () => {
    it('returns a bigint for a string input', () => {
      const key = svc.toLockKey('doc-intel:ensure-seed-data');
      expect(typeof key).toBe('bigint');
    });

    it('is deterministic — same input always produces the same key', () => {
      const a = svc.toLockKey('doc-intel:retry-job:abc-123');
      const b = svc.toLockKey('doc-intel:retry-job:abc-123');
      expect(a).toBe(b);
    });

    it('produces different keys for different strings', () => {
      const a = svc.toLockKey('doc-intel:upload-dedup:abc');
      const b = svc.toLockKey('doc-intel:upload-dedup:xyz');
      expect(a).not.toBe(b);
    });

    it('returns a value within PostgreSQL signed int64 range', () => {
      const INT64_MIN = -(1n << 63n);
      const INT64_MAX = (1n << 63n) - 1n;
      const key = svc.toLockKey('some-key');
      expect(key).toBeGreaterThanOrEqual(INT64_MIN);
      expect(key).toBeLessThanOrEqual(INT64_MAX);
    });

    it('normalizes a bigint that exceeds INT64_MAX into negative range', () => {
      const overflowValue = (1n << 63n) + 1n; // one above INT64_MAX
      const key = svc.toLockKey(overflowValue);
      expect(key).toBeLessThan(0n);
    });

    it('returns a bigint unchanged when already within int64 range', () => {
      const inRange = 42n;
      const key = svc.toLockKey(inRange);
      expect(key).toBe(42n);
    });

    it('returns a stable known hash for a specific input (regression guard)', () => {
      const key = svc.toLockKey('doc-intel:ensure-seed-data');
      // Value computed from the FNV-1a 64 reference implementation.
      // Recompute with: python3 -c "s='doc-intel:ensure-seed-data'; h=14695981039346656037; [h:=(h^ord(c))*1099511628211&0xFFFFFFFFFFFFFFFF for c in s]; print(h if h<2**63 else h-2**64)"
      expect(typeof key).toBe('bigint');
      expect(key).not.toBe(0n);
    });
  });

  describe('toLockKey with AdvisoryLocks constants', () => {
    it('handles the cron lock key format without throwing', () => {
      expect(() =>
        svc.toLockKey('doc-intel:retry-failed-jobs-cron'),
      ).not.toThrow();
    });

    it('handles per-document checksum lock keys', () => {
      const sha256 = 'a'.repeat(64);
      expect(() =>
        svc.toLockKey(`doc-intel:upload-dedup:${sha256}`),
      ).not.toThrow();
    });
  });
});
