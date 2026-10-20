import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getClientIp, persistentRateLimit } from '@/lib/security';
import { createQuoteCheckout } from '@/lib/quote-checkout';
import { canTransitionQuote } from '@/lib/quote-math';

export const runtime = 'nodejs';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const actionSchema = z.object({ action: z.enum(['accept', 'decline', 'pay']) });

type QuoteRow = {
  id: string; business_id: string; quote_number: string; subtotal: number | string; tax: number | string; total: number | string;
  status: string; payment_status: string | null; stripe_checkout_session_id: string | null; notes: string | null; expires_at: string | null;
  customers: { first_name: string | null; last_name: string | null; email: string | null } | null;
  businesses: { id: string; name: string; email: string | null; phone: string | null; currency: string | null; stripe_connected_account_id: string | null; stripe_charges_enabled: boolean | null; stripe_payouts_enabled: boolean | null; platform_fee_percent: number | string | null } | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

type Loaded = { admin: ReturnType<typeof createSupabaseAdminClient>; quote: QuoteRow | null; failed: boolean };

async function load(token: string): Promise<Loaded> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('quote_public_access')
    .select('id,quote_id,expires_at,revoked_at,quotes(id,business_id,quote_number,subtotal,tax,total,status,payment_status,stripe_checkout_session_id,notes,expires_at,customers(first_name,last_name,email),businesses(id,name,email,phone,currency,stripe_connected_account_id,stripe_charges_enabled,stripe_payouts_enabled,platform_fee_percent))')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();
  if (error) {
    console.error('Public quote lookup failed:', error.code, error.message);
    return { admin, quote: null, failed: true }
  }
  if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at).getTime() <= Date.now())) return { admin, quote: null, failed: false }
  const quote = one(data.quotes as unknown as QuoteRow | QuoteRow[]);
  if (!quote) return { admin, quote: null, failed: false }
  return { admin, quote: { ...quote, customers: one(quote.customers), businesses: one(quote.businesses) }, failed: false }
}

function quoteExpired(quote: QuoteRow) {
  return Boolean(quote.expires_at && new Date(quote.expires_at).getTime() <= Date.now());
}

function present(quote: QuoteRow) {
  return {
    quote: {
      quoteNumber: quote.quote_number,
      subtotal: Number(quote.subtotal),
      tax: Number(quote.tax),
      total: Number(quote.total),
      status: quoteExpired(quote) && !['accepted', 'declined'].includes(quote.status) ? 'expired' : quote.status,
      paymentStatus: quote.payment_status ?? 'unpaid',
      notes: quote.notes,
      expiresAt: quote.expires_at,
    },
    business: { name: quote.businesses?.name ?? 'Business', email: quote.businesses?.email ?? null, phone: quote.businesses?.phone ?? null, currency: quote.businesses?.currency ?? 'USD' },
    customer: { firstName: quote.customers?.first_name ?? '', lastName: quote.customers?.last_name ?? '' },
    canPayOnline: Boolean(quote.businesses?.stripe_connected_account_id && quote.businesses.stripe_charges_enabled && quote.businesses.stripe_payouts_enabled),
  };
}

const unavailable = () => NextResponse.json({ error: 'This quote link is invalid, expired, or revoked.' }, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) return unavailable();
  const rate = await persistentRateLimit(`public-quote-access:${getClientIp(request)}`, 60, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfter / 1000)) } });

  const { admin, quote, failed } = await load(token);
  if (failed) return NextResponse.json({ error: 'Unable to load this quote right now.' }, { status: 500 });
  if (!quote) return unavailable();

  if (quote.status === 'sent' && !quoteExpired(quote)) {
    const { error } = await admin.from('quotes').update({ status: 'viewed', updated_at: new Date().toISOString() }).eq('id', quote.id).eq('status', 'sent');
    if (error) console.error('Quote viewed update failed:', error.code, error.message);
    else quote.status = 'viewed';
  }

  return NextResponse.json(present(quote), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) return unavailable();
  const rate = await persistentRateLimit(`public-quote-action:${getClientIp(request)}`, 20, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfter / 1000)) } });

  // An empty body keeps the original "pay" behaviour for older clients.
  const body = await request.json().catch(() => ({}));
  const parsed = actionSchema.safeParse(body && typeof body === 'object' && 'action' in body ? body : { action: 'pay' });
  if (!parsed.success) return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });

  const { admin, quote, failed } = await load(token);
  if (failed) return NextResponse.json({ error: 'Unable to load this quote right now.' }, { status: 500 });
  if (!quote || !quote.businesses) return unavailable();

  if (parsed.data.action === 'accept' || parsed.data.action === 'decline') {
    if (quoteExpired(quote)) return NextResponse.json({ error: 'This quote has expired. Contact the business for an updated quote.' }, { status: 409 });
    if (!['sent', 'viewed'].includes(quote.status)) {
      return NextResponse.json({ error: quote.status === 'accepted' ? 'This quote is already accepted.' : 'This quote can no longer be changed.' }, { status: 409 });
    }
    const next = parsed.data.action === 'accept' ? 'accepted' : 'declined';
    const transition = canTransitionQuote(quote.status, next, quote.payment_status);
    if (!transition.ok) return NextResponse.json({ error: transition.reason }, { status: 409 });

    const { data, error } = await admin.from('quotes')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', quote.id).eq('status', quote.status)
      .select('id').maybeSingle();
    if (error) {
      console.error('Public quote status update failed:', error.code, error.message);
      return NextResponse.json({ error: 'Unable to update this quote right now.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'This quote was just updated. Refresh the page.' }, { status: 409 });
    const { error: auditError } = await admin.from('audit_logs').insert({ business_id: quote.business_id, actor_id: null, action: `quote.customer_${next}`, entity_type: 'quote', entity_id: quote.id, metadata: { via: 'public_link' } });
    if (auditError) console.error('Audit log write failed:', auditError.code, auditError.message);
    quote.status = next;
    return NextResponse.json(present(quote));
  }

  if (quoteExpired(quote)) return NextResponse.json({ error: 'This quote has expired. Contact the business for an updated quote.' }, { status: 409 });
  const result = await createQuoteCheckout(quote, quote.businesses, quote.customers?.email ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url });
}
