import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { checkoutAmounts, normalizeCurrency } from '@/lib/quote-math';

export type CheckoutQuote = {
  id: string;
  business_id: string;
  quote_number: string;
  total: number | string;
  status: string;
  payment_status: string | null;
  stripe_checkout_session_id: string | null;
};

export type CheckoutBusiness = {
  id: string;
  currency: string | null;
  stripe_connected_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  platform_fee_percent: number | string | null;
};

export type CheckoutResult =
  | { ok: true; url: string; reused: boolean }
  | { ok: false; status: number; error: string };

/**
 * Create (or reuse) a Stripe Checkout Session for an accepted quote, charged on
 * the business's connected account. Amounts are always recomputed from the
 * stored quote; nothing from the browser is trusted. Payment success is only
 * ever recorded by the verified webhook, never here.
 */
export async function createQuoteCheckout(quote: CheckoutQuote, business: CheckoutBusiness, customerEmail: string | null): Promise<CheckoutResult> {
  if (quote.business_id !== business.id) return { ok: false, status: 404, error: 'Quote not found.' };
  if (quote.status !== 'accepted') return { ok: false, status: 409, error: 'The quote must be accepted before payment.' };
  if (quote.payment_status === 'paid') return { ok: false, status: 409, error: 'This quote has already been paid.' };
  if (['refunded', 'partially_refunded', 'disputed'].includes(quote.payment_status ?? '')) {
    return { ok: false, status: 409, error: 'This quote has a payment history and cannot be paid again. Contact the business.' };
  }
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, status: 503, error: 'Online payments are not configured.' };
  if (!business.stripe_connected_account_id || !business.stripe_charges_enabled || !business.stripe_payouts_enabled) {
    return { ok: false, status: 409, error: 'This business has not finished setting up Stripe payments.' };
  }

  const currency = normalizeCurrency(business.currency);
  if (!currency) return { ok: false, status: 400, error: 'This business uses a currency that online payments do not support.' };
  const amounts = checkoutAmounts(quote.total, business.platform_fee_percent ?? process.env.STRIPE_APPLICATION_FEE_PERCENT ?? 2.5);
  if (!amounts) return { ok: false, status: 400, error: 'The quote must have a valid total.' };

  const stripe = getStripe();

  // Reuse an open session only when it still charges exactly what is owed to
  // the same account; otherwise let it lapse and create a fresh one.
  if (quote.stripe_checkout_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(quote.stripe_checkout_session_id);
      if (existing.status === 'complete') {
        return { ok: false, status: 409, error: 'A payment for this quote was already completed and is being confirmed.' };
      }
      if (
        existing.status === 'open' && existing.url &&
        existing.amount_total === amounts.amount &&
        existing.currency === currency &&
        existing.metadata?.connectedAccountId === business.stripe_connected_account_id
      ) {
        return { ok: true, url: existing.url, reused: true };
      }
      if (existing.status === 'open') {
        try { await stripe.checkout.sessions.expire(existing.id); } catch { /* already closing */ }
      }
    } catch (error) {
      console.error('Existing checkout session lookup failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  // The idempotency key protects against double clicks. It changes whenever the
  // charged terms change and every 10 minutes, so an expired session is never
  // replayed and a changed amount never collides with an earlier request.
  const window = Math.floor(Date.now() / (10 * 60 * 1000));
  const idempotencyKey = [
    'quote-checkout', quote.id, amounts.amount, currency, amounts.fee,
    business.stripe_connected_account_id, quote.stripe_checkout_session_id ?? 'none', window,
  ].join(':');

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    customer_email: customerEmail || undefined,
    line_items: [{ price_data: { currency, product_data: { name: `Quote ${quote.quote_number}` }, unit_amount: amounts.amount }, quantity: 1 }],
    metadata: {
      quoteId: quote.id,
      businessId: business.id,
      connectedAccountId: business.stripe_connected_account_id,
      expectedAmount: String(amounts.amount),
      platformFeeAmount: String(amounts.fee),
    },
    payment_intent_data: {
      application_fee_amount: amounts.fee,
      transfer_data: { destination: business.stripe_connected_account_id },
      metadata: { quoteId: quote.id, businessId: business.id },
    },
    success_url: `${getAppUrl()}/quote/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getAppUrl()}/quote/payment/cancelled`,
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params, { idempotencyKey });
  } catch (error) {
    console.error('Stripe quote checkout creation failed:', error instanceof Error ? error.message : 'unknown');
    return { ok: false, status: 502, error: 'Unable to start secure payment. Please try again shortly.' };
  }
  if (!session.url) return { ok: false, status: 502, error: 'Stripe did not return a checkout link.' };

  const { error: updateError } = await createSupabaseAdminClient()
    .from('quotes')
    .update({ payment_status: 'pending', stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
    .eq('id', quote.id)
    .eq('business_id', business.id)
    .not('payment_status', 'eq', 'paid');
  if (updateError) {
    console.error('Quote payment state update failed:', updateError.code, updateError.message);
    try { await stripe.checkout.sessions.expire(session.id); } catch { /* best effort */ }
    return { ok: false, status: 500, error: 'Payment could not be started safely. Please try again.' };
  }

  return { ok: true, url: session.url, reused: false };
}
