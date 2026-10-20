import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function authorized(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();

  // Businesses that paid in the meantime have trial_status = 'none' and are untouched.
  const { data, error } = await admin.from('businesses')
    .update({ trial_status: 'expired', plan: 'free', updated_at: now })
    .eq('trial_status', 'active').lte('trial_ends_at', now)
    .is('stripe_subscription_id', null)
    .select('id');
  if (error) {
    console.error('Trial expiry job failed:', error.code, error.message);
    return NextResponse.json({ error: 'Trial expiry job failed.' }, { status: 500 });
  }

  // Housekeeping is best-effort: a failure here must not hide the trial result.
  const { data: cleanup, error: cleanupError } = await admin.rpc('cleanup_security_state');
  if (cleanupError) console.error('Security state cleanup failed:', cleanupError.message);

  return NextResponse.json({ expired: data?.length ?? 0, cleanup: Array.isArray(cleanup) ? cleanup[0] ?? null : null });
}
