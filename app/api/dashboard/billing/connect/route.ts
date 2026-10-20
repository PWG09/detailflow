import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { resolveOwnerWorkspace } from '@/lib/workspace';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

function connectState(account: Stripe.Account) {
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  return {
    status: chargesEnabled && payoutsEnabled ? 'connected' : 'incomplete',
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDue: account.requirements?.currently_due?.length ?? 0,
  };
}

async function saveState(businessId: string, accountId: string, state: ReturnType<typeof connectState>) {
  const { error } = await createSupabaseAdminClient().from('businesses').update({
    stripe_connected_account_id: accountId,
    stripe_connect_status: state.status,
    stripe_charges_enabled: state.chargesEnabled,
    stripe_payouts_enabled: state.payoutsEnabled,
    stripe_details_submitted: state.detailsSubmitted,
    updated_at: new Date().toISOString(),
  }).eq('id', businessId);
  return error;
}

function stripeMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  return error instanceof Error ? error.message : 'Unknown Stripe error';
}

export async function GET() {
  const resolved = await resolveOwnerWorkspace('Only the owner can manage Stripe payouts.');
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const { data: b, error } = await supabase.from('businesses').select('stripe_connected_account_id').eq('id', membership.business_id).single();
  if (error) return NextResponse.json({ error: 'Unable to read the Stripe connection.' }, { status: 500 });
  if (!b?.stripe_connected_account_id) return NextResponse.json({ connected: false, status: 'not_connected', chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false });

  try {
    const account = await getStripe().accounts.retrieve(b.stripe_connected_account_id);
    const state = connectState(account);
    const saveError = await saveState(membership.business_id, account.id, state);
    if (saveError) console.error('Connect status sync failed:', saveError.code, saveError.message);
    return NextResponse.json({ connected: state.status === 'connected', ...state });
  } catch (stripeError) {
    console.error('Connect status lookup failed:', stripeMessage(stripeError));
    return NextResponse.json({ connected: false, status: 'error', chargesEnabled: false, payoutsEnabled: false, error: 'Unable to reach Stripe right now.' }, { status: 502 });
  }
}

export async function POST() {
  const resolved = await resolveOwnerWorkspace('Only the owner can connect Stripe.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const { data: b } = await supabase.from('businesses').select('id,name,email,stripe_connected_account_id').eq('id', membership.business_id).single();
  if (!b) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (configError) {
    console.error('Stripe configuration error:', stripeMessage(configError));
    return NextResponse.json({ error: 'Stripe is not configured for this deployment.' }, { status: 503 });
  }

  let accountId = b.stripe_connected_account_id;
  try {
    if (accountId) {
      const existing = await stripe.accounts.retrieve(accountId);
      if (existing.charges_enabled && existing.payouts_enabled) {
        const saveError = await saveState(b.id, existing.id, connectState(existing));
        if (saveError) console.error('Connect status sync failed:', saveError.code, saveError.message);
        // Already onboarded: send the owner to their Express dashboard instead.
        const login = await stripe.accounts.createLoginLink(existing.id);
        return NextResponse.json({ url: login.url, connected: true });
      }
    } else {
      const email = (b.email || user.email || '').trim() || undefined;
      const account = await stripe.accounts.create({
        type: 'express',
        ...(email ? { email } : {}),
        metadata: { businessId: b.id },
        business_profile: { name: String(b.name || 'DetailFlow business').trim().slice(0, 100) },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      }, { idempotencyKey: `connect-account:${b.id}` });
      accountId = account.id;
      const saveError = await saveState(b.id, account.id, connectState(account));
      if (saveError) {
        console.error('Failed to save Stripe connected account:', saveError.code, saveError.message);
        return NextResponse.json({ error: 'Stripe account was created but could not be linked. Please try again; the same account will be reused.' }, { status: 500 });
      }
      await writeAudit(b.id, user.id, 'stripe.connect_account_created', 'business', b.id, {});
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${getAppUrl()}/dashboard/settings?stripe=refresh`,
      return_url: `${getAppUrl()}/dashboard/settings?stripe=return`,
      type: 'account_onboarding',
    });
    return NextResponse.json({ url: link.url });
  } catch (stripeError) {
    const message = stripeMessage(stripeError);
    console.error('Stripe Connect onboarding failed:', message);
    return NextResponse.json({ error: `Stripe could not start onboarding: ${message}` }, { status: 502 });
  }
}
