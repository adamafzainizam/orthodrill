/**
 * A fixed-window rate limiter, held in memory.
 *
 * WHAT THIS PROTECTS. Design spec §7: the scoring endpoint must be rate
 * limited, because free-tier invocation limits are a real ceiling, and because
 * §5.1 accepts that useful feedback leaks the answer key — enough submissions
 * reconstruct it. Rate limiting is what bounds that leak, so it is a security
 * control here and not merely a cost control.
 *
 * WHAT IT DOES NOT PROTECT AGAINST, STATED PLAINLY. The state lives in one
 * process. On a serverless host each instance keeps its own counters, so the
 * effective limit is the configured one multiplied by the number of live
 * instances, and it resets on cold start. That is a real weakening, accepted
 * for v1 because the alternative is a shared store, which means a paid
 * dependency (AGENTS.md §2.1). If the leak in §5.1 ever needs a hard bound
 * rather than a soft one, this is the piece that has to change first.
 *
 * Tracked callers are capped and evicted least-recently-seen. Without that cap
 * a stream of unique keys is itself a memory-exhaustion vector — the limiter
 * would become the hole it exists to close.
 *
 * NO I/O, and no clock of its own: `now` is passed in, which is what makes the
 * window behaviour testable without waiting for real time to pass.
 */
export type RateLimitDecision = { allowed: boolean; retryAfterMs: number };

export type RateLimiter = {
  check(key: string, now: number): RateLimitDecision;
  /** Number of callers currently tracked. Exposed for tests and diagnostics. */
  size(): number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  /** Cap on tracked callers. Eviction is least-recently-seen. */
  maxKeys?: number;
};

type Entry = { count: number; windowStart: number };

export function createRateLimiter(opts: RateLimitOptions): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = opts;
  // Insertion order IS recency order: every touch deletes and re-inserts, so
  // the front of the map is always the least recently seen caller.
  const entries = new Map<string, Entry>();

  const expired = (e: Entry, now: number) => e.windowStart + windowMs <= now;

  /**
   * Drop expired callers from the front. Amortised O(1) rather than a full
   * sweep per request: the front is the least recently seen, so it is where
   * expired entries accumulate.
   */
  function purge(now: number): void {
    for (const [key, entry] of entries) {
      if (!expired(entry, now)) break;
      entries.delete(key);
    }
  }

  function touch(key: string, entry: Entry): void {
    entries.delete(key);
    entries.set(key, entry);
  }

  return {
    check(key, now) {
      purge(now);

      const existing = entries.get(key);
      if (existing !== undefined && !expired(existing, now)) {
        if (existing.count >= limit) {
          touch(key, existing); // refused requests still count as activity
          return { allowed: false, retryAfterMs: existing.windowStart + windowMs - now };
        }
        existing.count += 1;
        touch(key, existing);
        return { allowed: true, retryAfterMs: 0 };
      }

      if (existing === undefined && entries.size >= maxKeys) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      touch(key, { count: 1, windowStart: now });
      return { allowed: true, retryAfterMs: 0 };
    },
    size: () => entries.size,
  };
}
