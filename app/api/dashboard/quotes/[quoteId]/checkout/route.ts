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
    const existingSession = await getStripe().checkout.sessions.retrieve(quote.stripe_checkout_session_id);
    if (existingSession.url) return NextResponse.json({ url: existingSession.url });
  }

  const amount = Math.round(Number(quote.total) * 100);
  if (!Number.isInteger(amount) || amount <= 0) return NextResponse.json({ error: 'The quote must have a valid total.' }, { status: 400 });
  const business = Array.isArray(quote.businesses) ? quote.businesses[0] : quote.businesses;
  const customer = Array.isArray(quote.customers) ? quote.customers[0] : quote.customers;
  const currency = (business?.currency || 'USD').toLowerCase();
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: customer?.email || undefined,
    line_items: [{ price_data: { currency, product_data: { name: `Quote ${quote.quote_number}` }, unit_amount: amount }, quantity: 1 }],
    metadata: { quoteId: quote.id, businessId: membership.business_id },
    success_url: `${getAppUrl()}/quote/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/quote/payment/cancelled`,
  });

  await supabase.from('quotes').update({ payment_status: 'pending', stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() }).eq('id', quote.id).eq('business_id', membership.business_id);
  return NextResponse.json({ url: session.url });
}
