import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import Stripe from 'stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    const quoteId = session.metadata?.quoteId;
    if (quoteId && session.payment_status === 'paid') {
      const supabase = createSupabaseAdminClient();
      await supabase.from('quotes').update({ payment_status: 'paid', stripe_checkout_session_id: session.id, stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null, updated_at: new Date().toISOString() }).eq('id', quoteId);
    }
  }


  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    const businessId = subscription.metadata?.businessId;
    if (businessId) {
      const status = subscription.status;
      const plan = event.type === 'customer.subscription.deleted' || status === 'canceled' || status === 'unpaid' ? 'free' : 'pro';
      await createSupabaseAdminClient().from('businesses').update({ plan, stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null, stripe_subscription_id: subscription.id, subscription_status: status, updated_at: new Date().toISOString() }).eq('id', businessId);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const quoteId = session.metadata?.quoteId;
    if (quoteId) await createSupabaseAdminClient().from('quotes').update({ payment_status: 'failed', updated_at: new Date().toISOString() }).eq('id', quoteId);
  }

  return NextResponse.json({ received: true });
}
