import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashRiskValue } from '@/lib/trial-risk';
import { planForPrice, subscriptionGrantsPlan } from '@/lib/billing-plans';
import { refundPaymentStatus } from '@/lib/quote-math';

export const runtime = 'nodejs';

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const STALE_CLAIM_MS = 5 * 60 * 1000;

/** Supabase returns errors instead of throwing; turn them into exceptions so a failed write is retried by Stripe. */
function must<T extends { error: { code?: string; message: string } | null }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what} failed (${result.error.code ?? 'db'}): ${result.error.message}`);
  return result;
}

function secrets() {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((value): value is string => Boolean(value));
}

function verify(payload: string, signature: string): Stripe.Event | null {
  const stripe = getStripe();
  for (const secret of secrets()) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      // try the next configured endpoint secret
    }
  }
  return null;
}

async function claim(supabase: Admin, event: Stripe.Event): Promise<'claimed' | 'duplicate' | 'busy'> {
  const insert = await supabase.from('stripe_events').insert({ stripe_event_id: event.id, event_type: event.type, status: 'processing', claimed_at: new Date().toISOString() });
  if (!insert.error) return 'claimed';
  if (insert.error.code !== '23505') throw new Error(`Event claim failed: ${insert.error.message}`);

  const { data: existing } = must(await supabase.from('stripe_events').select('status,claimed_at').eq('stripe_event_id', event.id).maybeSingle(), 'Event lookup');
  if (!existing || existing.status === 'processed') return 'duplicate';
  // A handler that crashed or timed out leaves a stale "processing" row. Take it over.
  if (existing.claimed_at && Date.now() - new Date(existing.claimed_at).getTime() > STALE_CLAIM_MS) {
    const { data: taken } = must(await supabase.from('stripe_events')
      .update({ claimed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id).eq('status', 'processing').eq('claimed_at', existing.claimed_at)
      .select('stripe_event_id').maybeSingle(), 'Event takeover');
    return taken ? 'claimed' : 'busy';
  }
  return 'busy';
}

async function handleQuoteCheckoutCompleted(supabase: Admin, session: Stripe.Checkout.Session) {
  const quoteId = session.metadata?.quoteId;
  if (!quoteId || session.mode !== 'payment') return;
  if (session.payment_status !== 'paid') return; // async methods complete later via async_payment_succeeded

  const { data: quote } = must(await supabase.from('quotes').select('id,business_id,total,payment_status,stripe_checkout_session_id').eq('id', quoteId).maybeSingle(), 'Quote lookup');
  if (!quote) { console.error('Paid checkout references unknown quote', { quoteId, sessionId: session.id }); return; }
  if (session.metadata?.businessId && session.metadata.businessId !== quote.business_id) {
    console.error('Paid checkout business mismatch', { quoteId, sessionId: session.id });
    return;
  }
  const expected = Number(session.metadata?.expectedAmount ?? Math.round(Number(quote.total) * 100));
  if (session.amount_total !== expected) {
    // Money was collected; record it but flag the discrepancy loudly.
    console.error('Paid checkout amount differs from quote', { quoteId, sessionId: session.id, amountTotal: session.amount_total, expected });
  }
  must(await supabase.from('quotes').update({
    payment_status: 'paid',
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', quoteId), 'Quote paid update');
}

async function syncSubscription(supabase: Admin, subscriptionId: string, eventType: string) {
  // Always read the current object so out-of-order events cannot regress state.
  const stripe = getStripe();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (eventType === 'customer.subscription.deleted') return; // already gone; deletion handled below by caller payload
    throw error;
  }
  await applySubscription(supabase, subscription, eventType);
}

async function applySubscription(supabase: Admin, subscription: Stripe.Subscription, eventType: string) {
  const businessId = subscription.metadata?.businessId;
  if (!businessId) { console.warn('Subscription without businessId metadata', { subscriptionId: subscription.id }); return; }

  const item = subscription.items?.data?.[0];
  const plan = planForPrice(item?.price?.id, subscription.metadata?.plan);
  if (!plan) { console.error('Subscription price is not a configured DetailFlow plan', { subscriptionId: subscription.id, priceId: item?.price?.id }); return; }

  const status = eventType === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
  const effective = subscriptionGrantsPlan(status) ? plan : 'free';
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
  const periodStart = item?.current_period_start ?? null;
  const periodEnd = item?.current_period_end ?? null;
  const now = new Date().toISOString();

  // Ignore a stale subscription for a business that has since moved to another one.
  const { data: business } = must(await supabase.from('businesses').select('id,stripe_subscription_id').eq('id', businessId).maybeSingle(), 'Business lookup');
  if (!business) { console.error('Subscription references unknown business', { businessId, subscriptionId: subscription.id }); return; }
  if (business.stripe_subscription_id && business.stripe_subscription_id !== subscription.id && !subscriptionGrantsPlan(status)) return;

  must(await supabase.from('businesses').update({
    plan: effective,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: status,
    ...(subscriptionGrantsPlan(status) ? { trial_status: 'none' } : {}),
    updated_at: now,
  }).eq('id', businessId), 'Business plan update');

  must(await supabase.from('subscriptions').upsert({
    business_id: businessId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id ?? null,
    plan,
    status,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: now,
  }, { onConflict: 'business_id' }), 'Subscription upsert');

  // Payment fingerprint is an abuse signal only; failure here must not block billing.
  try {
    const pm = typeof subscription.default_payment_method === 'string' ? subscription.default_payment_method : subscription.default_payment_method?.id;
    if (pm) {
      const method = await getStripe().paymentMethods.retrieve(pm);
      const shape = method as unknown as { card?: { fingerprint?: string | null } | null; us_bank_account?: { fingerprint?: string | null } | null };
      const fingerprint = shape.card?.fingerprint ?? shape.us_bank_account?.fingerprint ?? null;
      if (fingerprint) {
        const { error } = await supabase.from('trial_claims').update({ payment_fingerprint_hash: hashRiskValue(fingerprint) }).eq('business_id', businessId);
        if (error) console.error('Trial claim fingerprint update failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Unable to resolve subscription payment fingerprint:', error instanceof Error ? error.message : 'unknown');
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const shape = invoice as unknown as { subscription?: string | { id: string } | null; parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null };
  const raw = shape.parent?.subscription_details?.subscription ?? shape.subscription ?? null;
  return typeof raw === 'string' ? raw : raw?.id ?? null;
}

async function handle(supabase: Admin, event: Stripe.Event) {
  const now = new Date().toISOString();
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'payment') await handleQuoteCheckoutCompleted(supabase, session);
      if (session.mode === 'subscription') {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subscriptionId) await syncSubscription(supabase, subscriptionId, event.type);
      }
      return;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const quoteId = session.metadata?.quoteId;
      if (!quoteId) return;
      // Only clear the session that expired; a newer session may already be attached.
      must(await supabase.from('quotes')
        .update({ payment_status: event.type === 'checkout.session.expired' ? 'unpaid' : 'failed', stripe_checkout_session_id: null, updated_at: now })
        .eq('id', quoteId).eq('stripe_checkout_session_id', session.id).eq('payment_status', 'pending'), 'Quote payment reset');
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(supabase, subscription.id, event.type);
      return;
    }
    case 'customer.subscription.deleted': {
      await applySubscription(supabase, event.data.object as Stripe.Subscription, event.type);
      return;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subscriptionId) await syncSubscription(supabase, subscriptionId, event.type);
      return;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const next = refundPaymentStatus(charge.amount_captured, charge.amount_refunded);
      if (!next) return;
      const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      const quoteId = charge.metadata?.quoteId;
      if (paymentIntent) {
        must(await supabase.from('quotes').update({ payment_status: next, updated_at: now }).eq('stripe_payment_intent_id', paymentIntent), 'Quote refund update');
      } else if (quoteId) {
        must(await supabase.from('quotes').update({ payment_status: next, updated_at: now }).eq('id', quoteId), 'Quote refund update');
      }
      return;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntent = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
      if (paymentIntent) must(await supabase.from('quotes').update({ payment_status: 'disputed', updated_at: now }).eq('stripe_payment_intent_id', paymentIntent), 'Quote dispute update');
      return;
    }
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      // Match by the stored account id, never by metadata alone.
      must(await supabase.from('businesses').update({
        stripe_connect_status: account.charges_enabled && account.payouts_enabled ? 'connected' : 'incomplete',
        stripe_charges_enabled: account.charges_enabled === true,
        stripe_payouts_enabled: account.payouts_enabled === true,
        stripe_details_submitted: account.details_submitted === true,
        updated_at: now,
      }).eq('stripe_connected_account_id', account.id), 'Connect account update');
      return;
    }
    default:
      return;
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature || secrets().length === 0) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 400 });

  const event = verify(await request.text(), signature);
  if (!event) return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  let claimState: Awaited<ReturnType<typeof claim>>;
  try {
    claimState = await claim(supabase, event);
  } catch (error) {
    console.error('Unable to claim Stripe event:', event.id, error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Webhook processing unavailable.' }, { status: 500 });
  }
  if (claimState === 'duplicate') return NextResponse.json({ received: true, duplicate: true });
  if (claimState === 'busy') return NextResponse.json({ error: 'Event is being processed.' }, { status: 409 });

  try {
    await handle(supabase, event);
    must(await supabase.from('stripe_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('stripe_event_id', event.id), 'Event completion');
  } catch (error) {
    console.error('Stripe webhook processing failed:', event.type, event.id, error instanceof Error ? error.message : 'unknown');
    const { error: releaseError } = await supabase.from('stripe_events').delete().eq('stripe_event_id', event.id).eq('status', 'processing');
    if (releaseError) console.error('Unable to release Stripe event claim:', releaseError.message);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
