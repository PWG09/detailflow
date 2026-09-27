type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

export function checkRateLimit(key: string, limit = 10, windowMs = 60 * 60 * 1000): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Keep the local fallback bounded. In serverless environments each instance
  // has its own map; this is a fast first-line guard, not the source of truth.
  if (now - lastCleanup > 60_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    lastCleanup = now;
  }
  if (buckets.size > 10_000) buckets.clear();

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: windowMs };
  }
  if (current.count >= limit) return { allowed: false, retryAfter: current.resetAt - now };
  current.count += 1;
  return { allowed: true, retryAfter: current.resetAt - now };
}
