import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';
import { isUuid } from '@/lib/keyset-pagination';
import { createQuoteCheckout } from '@/lib/quote-checkout';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!isUuid(quoteId)) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });

  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id,business_id,quote_number,total,status,payment_status,stripe_checkout_session_id,customer_id')
    .eq('id', quoteId)
    .eq('business_id', membership.business_id)
    .maybeSingle();
  if (quoteError) {
    console.error('Quote lookup failed:', quoteError.code, quoteError.message);
    return NextResponse.json({ error: 'Unable to load this quote.' }, { status: 500 });
  }
  if (!quote) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,currency,stripe_connected_account_id,stripe_charges_enabled,stripe_payouts_enabled,platform_fee_percent')
    .eq('id', membership.business_id)
    .single();
  if (businessError || !business) {
    console.error('Business payment configuration lookup failed:', businessError?.code, businessError?.message);
    return NextResponse.json({ error: 'Unable to load the business payment configuration.' }, { status: 500 });
  }

  let customerEmail: string | null = null;
  if (quote.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', quote.customer_id)
      .eq('business_id', membership.business_id)
      .maybeSingle();
    customerEmail = customer?.email ?? null;
  }

  const result = await createQuoteCheckout(quote, business, customerEmail);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url });
}
