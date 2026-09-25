import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const paramsSchema = z.object({ quoteId: z.string().uuid() });

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) return NextResponse.json({ error: 'Invalid quote.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const { data: quote, error } = await supabase
    .from('quotes')
    .select('id, quote_number, total, status, payment_status, stripe_checkout_session_id, customers(email, first_name, last_name), businesses(name, currency)')
    .eq('id', parsedParams.data.quoteId)
    .eq('business_id', membership.business_id)
    .single();
  if (error || !quote) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
  if (quote.status !== 'accepted') return NextResponse.json({ error: 'Only accepted quotes can be paid.' }, { status: 400 });
  if (quote.payment_status === 'paid') return NextResponse.json({ error: 'This quote is already paid.' }, { status: 409 });
  if (quote.stripe_checkout_session_id) {
    try {
      const existingSession = await getStripe().checkout.sessions.retrieve(quote.stripe_checkout_session_id);
      if (existingSession.url) return NextResponse.json({ url: existingSession.url });
    } catch {
      // If the stored Stripe session no longer exists, create a fresh one below.
    }
  }

  const amount = Math.round(Number(quote.total) * 100);
  if (!Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: 'The quote must have a valid total.' }, { status: 400 });
  const business = Array.isArray(quote.businesses) ? quote.businesses[0] : quote.businesses;
  const customer = Array.isArray(quote.customers) ? quote.customers[0] : quote.customers;
  const currency = (business?.currency || 'USD').toLowerCase();
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe payments are not configured. Add STRIPE_SECRET_KEY to Vercel and redeploy.' }, { status: 503 });
  }

  const allowedCurrencies = new Set(['usd', 'cad', 'eur', 'gbp', 'aud', 'nzd']);
  if (!allowedCurrencies.has(currency)) {
    return NextResponse.json({ error: `Unsupported payment currency: ${currency.toUpperCase()}.` }, { status: 400 });
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: customer?.email || undefined,
      line_items: [{ price_data: { currency, product_data: { name: `Quote ${quote.quote_number}` }, unit_amount: amount }, quantity: 1 }],
      metadata: { quoteId: quote.id, businessId: membership.business_id },
      success_url: `${getAppUrl()}/quote/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppUrl()}/quote/payment/cancelled`,
    });

    if (!session.url) return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 });

    const { error: updateError } = await supabase.from('quotes').update({ payment_status: 'pending', stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', quote.id).eq('business_id', membership.business_id);
    if (updateError) return NextResponse.json({ error: 'Stripe checkout was created, but the quote could not be updated. Please do not create another payment yet.' }, { status: 500 });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe error.';
    console.error('Stripe quote checkout failed:', message);
    const safeMessage = message.toLowerCase().includes('api key') || message.toLowerCase().includes('authentication')
      ? 'Stripe is not authenticated. Check STRIPE_SECRET_KEY in Vercel and redeploy.'
      : 'Stripe could not start the payment. Check the Stripe configuration and try again.';
    return NextResponse.json({ error: safeMessage }, { status: 502 });
  }
}
