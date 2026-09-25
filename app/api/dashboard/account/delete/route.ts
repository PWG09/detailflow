import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== 'DELETE') return NextResponse.json({ error: 'Type DELETE to confirm account deletion.' }, { status: 400 });

  const { data: membership } = await supabase.from('business_members')
    .select('business_id,role').eq('user_id', user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  if (membership.role !== 'owner') return NextResponse.json({ error: 'Only a business owner can delete this account. Transfer ownership first.' }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data: business, error: businessError } = await admin.from('businesses')
    .select('id,stripe_subscription_id,stripe_connected_account_id').eq('id', membership.business_id).single();
  if (businessError || !business) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  try {
    if (business.stripe_subscription_id) {
      try { await getStripe().subscriptions.cancel(business.stripe_subscription_id); } catch (error) {
        console.error('Stripe subscription cancellation during deletion failed:', error instanceof Error ? error.message : 'unknown');
      }
    }
    if (business.stripe_connected_account_id) {
      try { await getStripe().accounts.del(business.stripe_connected_account_id); } catch (error) {
        console.error('Stripe Connect account closure during deletion failed:', error instanceof Error ? error.message : 'unknown');
      }
    }

    const bucket = admin.storage.from('vehicle-photos');
    const paths: string[] = [];
    const { data: topLevel } = await bucket.list(`${business.id}`, { limit: 1000 });
    for (const item of topLevel ?? []) {
      const first = `${business.id}/${item.name}`;
      if (item.id === null) {
        const { data: nested } = await bucket.list(first, { limit: 1000 });
        for (const child of nested ?? []) paths.push(`${first}/${child.name}`);
      } else {
        paths.push(first);
      }
    }
    if (paths.length) await bucket.remove(paths);

    const { error: deleteBusinessError } = await admin.from('businesses').delete().eq('id', business.id).eq('owner_id', user.id);
    if (deleteBusinessError) throw deleteBusinessError;

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Account deletion failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Account deletion could not be completed. No partial deletion was reported as successful.' }, { status: 500 });
  }
}
