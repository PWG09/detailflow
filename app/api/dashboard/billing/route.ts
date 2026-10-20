import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { resolveOwnerWorkspace, resolveWorkspace } from '@/lib/workspace';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { subscriptionIsUpdatable } from '@/lib/billing-plans';
import { effectivePlan } from '@/lib/entitlements';

export const runtime = 'nodejs';

const planSchema = z.object({ plan: z.enum(['pro', 'business']) });

function priceFor(plan: 'pro' | 'business') {
  return plan === 'business' ? process.env.STRIPE_BUSINESS_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
}

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const { data: b, error } = await supabase
    .from('businesses')
    .select('id,name,plan,trial_status,trial_ends_at,subscription_status,stripe_customer_id,stripe_subscription_id,stripe_connected_account_id,stripe_connect_status,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted')
    .eq('id', membership.business_id)
    .single();
  if (error || !b) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const prices: { pro: number | null; business: number | null } = { pro: null, business: null };
  try {
    const stripe = getStripe();
    for (const [key, id] of [['pro', process.env.STRIPE_PRO_PRICE_ID], ['business', process.env.STRIPE_BUSINESS_PRICE_ID]] as const) {
      if (!id) continue;
      const price = await stripe.prices.retrieve(id);
      prices[key] = price.unit_amount === null ? null : Number(price.unit_amount) / 100;
    }
  } catch (priceError) {
    console.error('Unable to load Stripe price display:', priceError instanceof Error ? priceError.message : 'unknown');
  }

  const isOwner = membership.role === 'owner';
  return NextResponse.json({
    id: b.id,
    name: b.name,
    plan: b.plan,
    effectivePlan: effectivePlan({ plan: b.plan, trialStatus: b.trial_status, trialEndsAt: b.trial_ends_at }),
    trial_status: b.trial_status,
    trial_ends_at: b.trial_ends_at,
    subscription_status: b.subscription_status,
    stripe_customer_id: isOwner ? b.stripe_customer_id : null,
    stripe_subscription_id: isOwner ? b.stripe_subscription_id : null,
    stripe_connected_account_id: isOwner ? b.stripe_connected_account_id : null,
    stripe_connect_status: b.stripe_connect_status,
    stripe_charges_enabled: b.stripe_charges_enabled,
    stripe_payouts_enabled: b.stripe_payouts_enabled,
    stripe_details_submitted: b.stripe_details_submitted,
    prices,
    role: membership.role,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const resolved = await resolveOwnerWorkspace('Only the owner can manage billing.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid membership plan.' }, { status: 400 });
  const plan = parsed.data.plan;
  const price = priceFor(plan);
  if (!price) return NextResponse.json({ error: `The ${plan} plan is not available yet.` }, { status: 503 });

  const { data: b, error } = await supabase
    .from('businesses')
    .select('id,plan,subscription_status,stripe_customer_id,stripe_subscription_id')
    .eq('id', membership.business_id)
    .single();
  if (error || !b) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  // A trial sets plan=pro without a subscription; only a live paid
  // subscription on the requested plan means there is nothing to buy.
  const hasLiveSubscription = Boolean(b.stripe_subscription_id) && subscriptionIsUpdatable(b.subscription_status);
  if (hasLiveSubscription && b.plan === plan) return NextResponse.json({ error: `This workspace is already subscribed to ${plan}.` }, { status: 409 });

  try {
    const stripe = getStripe();
    if (hasLiveSubscription && b.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(b.stripe_subscription_id);
      const item = subscription.items.data[0];
      if (item && subscriptionIsUpdatable(subscription.status)) {
        await stripe.subscriptions.update(b.stripe_subscription_id, {
          items: [{ id: item.id, price }],
          proration_behavior: 'create_prorations',
          cancel_at_period_end: false,
          metadata: { businessId: membership.business_id, plan },
        }, { idempotencyKey: `subscription-change:${b.stripe_subscription_id}:${price}:${Math.floor(Date.now() / 600000)}` });
        // The verified webhook (customer.subscription.updated) records the new plan.
        return NextResponse.json({ changed: true, plan, pendingConfirmation: true });
      }
    }

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer: b.stripe_customer_id || undefined,
      customer_email: b.stripe_customer_id ? undefined : user.email || undefined,
      metadata: { businessId: membership.business_id, plan },
      subscription_data: { metadata: { businessId: membership.business_id, plan } },
      client_reference_id: membership.business_id,
      allow_promotion_codes: true,
      success_url: `${getAppUrl()}/dashboard/settings?billing=success`,
      cancel_url: `${getAppUrl()}/dashboard/settings?billing=cancelled`,
    }, { idempotencyKey: `subscription-checkout:${membership.business_id}:${price}:${Math.floor(Date.now() / 600000)}` });
    if (!session.url) return NextResponse.json({ error: 'Stripe did not return a checkout link.' }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (stripeError) {
    console.error('Subscription checkout failed:', stripeError instanceof Error ? stripeError.message : 'unknown');
    return NextResponse.json({ error: 'Unable to start membership checkout. Please try again shortly.' }, { status: 502 });
  }
}

export async function PATCH() {
  const resolved = await resolveOwnerWorkspace('Only the owner can manage billing.');
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const { data: b } = await supabase.from('businesses').select('stripe_customer_id').eq('id', membership.business_id).single();
  if (!b?.stripe_customer_id) return NextResponse.json({ error: 'No billing account exists yet. Choose a plan first.' }, { status: 400 });
  try {
    const session = await getStripe().billingPortal.sessions.create({ customer: b.stripe_customer_id, return_url: `${getAppUrl()}/dashboard/settings` });
    return NextResponse.json({ url: session.url });
  } catch (portalError) {
    console.error('Billing portal session failed:', portalError instanceof Error ? portalError.message : 'unknown');
    return NextResponse.json({ error: 'Unable to open the billing portal.' }, { status: 502 });
  }
}
