import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { createRequestId, logEvent, logRequest } from '@/lib/logger';

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const allowed = new Set([request.nextUrl.origin, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean));
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}

export async function middleware(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = request.headers.get('x-request-id') || createRequestId();
  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

  const finish = (response: NextResponse, status?: number) => {
    response.headers.set('x-request-id', requestId);
    logRequest({ requestId, method, pathname, ip, status: status ?? response.status, durationMs: Date.now() - startedAt });
    return response;
  };

  logRequest({ requestId, method, pathname, ip });

  const isApi = pathname.startsWith('/api/');
  if (isApi && pathname !== '/api/stripe/webhook') {
    const isPublic = pathname.startsWith('/api/public/');
    const limit = isPublic ? 40 : 180;
    const rate = checkRateLimit(`api:${isPublic ? 'public' : 'private'}:${ip}`, limit, 60_000);
    if (!rate.allowed) {
      logEvent('warn', 'security.rate_limit_blocked', { requestId, pathname, method, ip, scope: isPublic ? 'public' : 'private' });
      return finish(NextResponse.json({ error: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfter / 1000))) },
      }), 429);
    }
  }

  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const protectedMutation = pathname.startsWith('/api/dashboard/') || pathname.startsWith('/api/onboarding/');
  if (isMutation && protectedMutation && !sameOrigin(request)) {
    logEvent('warn', 'security.cross_origin_blocked', { requestId, pathname, method, ip });
    return finish(NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 }), 403);
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return finish(response);

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const requiresUser = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  const billingProtected = (pathname.startsWith('/dashboard') && pathname !== '/dashboard/settings') || (pathname.startsWith('/api/dashboard/') && !pathname.startsWith('/api/dashboard/billing') && pathname !== '/api/dashboard/business');
  if (user && billingProtected) {
    const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', user.id).limit(1).maybeSingle();
    if (membership) {
      const { data: business } = await supabase.from('businesses').select('plan,trial_status,trial_ends_at').eq('id', membership.business_id).maybeSingle();
      const expired = business?.trial_status === 'blocked' ||
        business?.trial_status === 'expired' ||
        (business?.trial_status === 'active' && business.trial_ends_at && new Date(business.trial_ends_at).getTime() <= Date.now());
      if (expired) {
        // Keep the gate time-based so the trial cannot be extended simply by
        // waiting for the scheduled cleanup job.
        if (pathname.startsWith('/api/')) {
          return finish(NextResponse.json({ error: 'Your 14-day trial has ended. Upgrade your plan to continue.', code: 'TRIAL_EXPIRED' }, { status: 402 }), 402);
        }
        const upgradeUrl = request.nextUrl.clone();
        upgradeUrl.pathname = '/upgrade';
        upgradeUrl.searchParams.set('reason', 'trial-expired');
        return finish(NextResponse.redirect(upgradeUrl, 307), 307);
      }
    }
  }
  if (requiresUser && !user) {
    logEvent('info', 'auth.redirect_to_login', { requestId, pathname, method });
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return finish(NextResponse.redirect(loginUrl), 307);
  }
  if (user) logEvent('debug', 'auth.user_resolved', { requestId, pathname, userId: user.id });
  return finish(response);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
