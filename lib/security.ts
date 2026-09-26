import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';

export function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function requestRateLimit(request: Request, scope: string, limit = 30, windowSeconds = 60) {
  const ip = getClientIp(request);
  return checkRateLimit(`${scope}:${ip}`, limit, windowSeconds * 1000);
}

/**
 * Persistent rate limiting for expensive operations. It uses the Supabase
 * security function when the migration is installed and falls back to the
 * local limiter during migrations/degraded states.
 */
export async function persistentRateLimit(key: string, limit: number, windowSeconds: number) {
  const keyHash = createHash('sha256').update(key).digest('hex');
  try {
    const { data, error } = await createSupabaseAdminClient().rpc('consume_rate_limit', {
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (!error && Array.isArray(data) && data[0]) {
      return {
        allowed: Boolean(data[0].allowed),
        retryAfter: Number(data[0].retry_after ?? windowSeconds * 1000),
      };
    }
  } catch (error) {
    console.error('Persistent rate limiter unavailable:', error instanceof Error ? error.message : 'unknown');
  }
  return checkRateLimit(keyHash, limit, windowSeconds * 1000);
}

export async function verifyTurnstile(token: string | null | undefined, remoteip?: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { enabled: false, success: true };
  if (!token) return { enabled: true, success: false, error: 'Missing CAPTCHA verification.' };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip && remoteip !== 'unknown') body.set('remoteip', remoteip);
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const result = await response.json() as { success?: boolean; 'error-codes'?: string[] };
    return result.success
      ? { enabled: true, success: true }
      : { enabled: true, success: false, error: 'CAPTCHA verification failed.' };
  } catch (error) {
    console.error('Turnstile verification failed:', error instanceof Error ? error.message : 'unknown');
    return { enabled: true, success: false, error: 'CAPTCHA verification is temporarily unavailable.' };
  }
}

export function monthlyUsageLimit(plan: string | null | undefined, freeLimit: number, proLimit: number, businessHardCap: number) {
  if (plan === 'business') return businessHardCap;
  if (plan === 'pro') return proLimit;
  return freeLimit;
}
