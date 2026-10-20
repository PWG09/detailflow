import { NextResponse } from 'next/server';
import { resolveOwnerWorkspace } from '@/lib/workspace';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST() {
  const resolved = await resolveOwnerWorkspace('Only the owner can cancel the membership.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_subscription_id')
    .eq('id', membership.business_id)
    .single();
  if (!business?.stripe_subscription_id) return NextResponse.json({ error: 'No active subscription was found.' }, { status: 400 });

  try {
    const subscription = await getStripe().subscriptions.update(
      business.stripe_subscription_id,
      { cancel_at_period_end: true },
      { idempotencyKey: `subscription-cancel:${business.stripe_subscription_id}:${Math.floor(Date.now() / 600000)}` },
    );
    // Billing periods live on the subscription item in current Stripe API versions.
    const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
    const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    const { error: syncError } = await createSupabaseAdminClient().from('subscriptions').update({
      cancel_at_period_end: true,
      status: subscription.status,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }).eq('business_id', membership.business_id);
    if (syncError) {
      // Stripe is the source of truth; the webhook will reconcile this row.
      console.error('Subscription cancellation sync failed:', syncError.code, syncError.message);
    }

    await writeAudit(membership.business_id, user.id, 'billing.cancel_scheduled', 'subscription', null, { currentPeriodEnd });
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: subscription.cancel_at_period_end, currentPeriodEnd });
  } catch (error) {
    console.error('Stripe subscription cancellation failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Unable to schedule cancellation. Please try again or use the billing portal.' }, { status: 502 });
  }
}
