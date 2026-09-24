type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit = 10, windowMs = 60 * 60 * 1000): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return { allowed: true, retryAfter: windowMs }; }
  if (current.count >= limit) return { allowed: false, retryAfter: current.resetAt - now };
  current.count += 1;
  return { allowed: true, retryAfter: current.resetAt - now };
}
