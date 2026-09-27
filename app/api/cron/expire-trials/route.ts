import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin.from('businesses').update({ trial_status: 'expired', plan: 'free', updated_at: now })
    .eq('trial_status', 'active').eq('plan', 'pro').lte('trial_ends_at', now).select('id');

  if (error) {
    console.error('Trial expiry job failed:', error.message);
    return NextResponse.json({ error: 'Trial expiry job failed.' }, { status: 500 });
  }
  return NextResponse.json({ expired: data?.length ?? 0 });
}
