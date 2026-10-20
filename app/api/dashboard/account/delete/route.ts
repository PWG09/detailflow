import { NextResponse } from 'next/server';
import { resolveOwnerWorkspace } from '@/lib/workspace';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';
import { removeAllObjects } from '@/lib/storage-cleanup';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const resolved = await resolveOwnerWorkspace('Only a business owner can delete this account. Transfer ownership first.');
  if (!resolved.ok) return resolved.response;
  const { user, membership } = resolved.workspace;

  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm account deletion.' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: business, error: businessError } = await admin.from('businesses')
    .select('id,owner_id,stripe_subscription_id,stripe_connected_account_id')
    .eq('id', membership.business_id)
    .single();
  if (businessError || !business) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  if (business.owner_id !== user.id) return NextResponse.json({ error: 'Only the account that created this workspace can delete it.' }, { status: 403 });

  // Stop billing first. A failure here aborts so nobody keeps being charged for a deleted workspace.
  if (business.stripe_subscription_id) {
    try {
      const subscription = await getStripe().subscriptions.retrieve(business.stripe_subscription_id);
      if (subscription.status !== 'canceled' && subscription.status !== 'incomplete_expired') {
        await getStripe().subscriptions.cancel(business.stripe_subscription_id);
      }
    } catch (error) {
      console.error('Subscription cancellation during deletion failed:', error instanceof Error ? error.message : 'unknown');
      return NextResponse.json({ error: 'We could not cancel your subscription, so nothing was deleted. Please try again or contact support.' }, { status: 502 });
    }
  }

  try {
    // Customer photos are personal data: remove them before the records that point to them.
    await removeAllObjects(admin, 'vehicle-photos', business.id);
  } catch (error) {
    console.error('Photo cleanup during deletion failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'We could not remove stored photos, so nothing else was deleted. Please try again.' }, { status: 500 });
  }

  const { error: deleteBusinessError } = await admin.from('businesses').delete().eq('id', business.id).eq('owner_id', user.id);
  if (deleteBusinessError) {
    console.error('Business deletion failed:', deleteBusinessError.code, deleteBusinessError.message);
    return NextResponse.json({ error: 'Your photos were removed, but the workspace could not be deleted. Please try again.' }, { status: 500 });
  }

  // The connected account may hold a balance owed to the business; Stripe refuses
  // to delete it in that case, which is the correct outcome. Never block on it.
  if (business.stripe_connected_account_id) {
    try { await getStripe().accounts.del(business.stripe_connected_account_id); } catch (error) {
      console.error('Connected account closure during deletion failed (manual follow-up needed):', business.stripe_connected_account_id, error instanceof Error ? error.message : 'unknown');
    }
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error('Auth user deletion failed:', deleteUserError.message);
    return NextResponse.json({ error: 'Your workspace was deleted, but your login could not be removed. Contact support to finish.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
