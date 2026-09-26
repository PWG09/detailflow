import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const allowed = new Set([request.nextUrl.origin, process.env.NEXT_PUBLIC_APP_URL].filter(Boolean));
  try { return allowed.has(new URL(origin).origin); } catch { return false; }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith('/api/');
  if (isApi && pathname !== '/api/stripe/webhook') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const isPublic = pathname.startsWith('/api/public/');
    const limit = isPublic ? 40 : 180;
    const rate = checkRateLimit(`api:${isPublic ? 'public' : 'private'}:${ip}`, limit, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfter / 1000))) },
      });
    }
  }
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const protectedMutation = pathname.startsWith('/api/dashboard/') || pathname.startsWith('/api/onboarding/');
  if (isMutation && protectedMutation && !sameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

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
  const requiresUser = request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/onboarding');
  if (requiresUser && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
