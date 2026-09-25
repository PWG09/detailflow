import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: membership } = await supabase.from('business_members')
    .select('business_id,role').eq('user_id', user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  if (membership.role !== 'owner') return NextResponse.json({ error: 'Only the owner can cancel the membership.' }, { status: 403 });

  const { data: business } = await supabase.from('businesses')
    .select('stripe_subscription_id,subscription_status,plan').eq('id', membership.business_id).single();
  if (!business?.stripe_subscription_id) return NextResponse.json({ error: 'No active Stripe subscription was found.' }, { status: 400 });

  try {
    const subscriptionResponse = await getStripe().subscriptions.update(business.stripe_subscription_id, { cancel_at_period_end: true });
    const subscription = subscriptionResponse.data;
    await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      status: subscription.status,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('business_id', membership.business_id);
    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Stripe subscription cancellation failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Unable to schedule cancellation in Stripe.' }, { status: 502 });
  }
}
