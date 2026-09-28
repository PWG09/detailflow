import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { hashRiskValue } from '@/lib/trial-risk';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')?.trim();
  if (!token || token.length < 32 || token.length > 200) {
    return NextResponse.json({ error: 'Invalid verification session.' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const tokenHash = hashRiskValue(token);
  const { data: intent, error } = await admin
    .from('auth_verification_intents')
    .select('user_id,expires_at,verified_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !intent) {
    return NextResponse.json({ verified: false }, { status: 404 });
  }

  if (!intent.user_id) {
    // The browser may briefly poll before the attach request completes.
    return NextResponse.json({ verified: false });
  }

  if (new Date(intent.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ verified: false, expired: true }, { status: 410 });
  }

  if (intent.verified_at) {
    return NextResponse.json({ verified: true });
  }

  const { data, error: userError } = await admin.auth.admin.getUserById(intent.user_id);
  if (userError || !data.user) {
    return NextResponse.json({ verified: false });
  }

  if (!data.user.email_confirmed_at) {
    return NextResponse.json({ verified: false });
  }

  await admin
    .from('auth_verification_intents')
    .update({ verified_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('verified_at', null);

  return NextResponse.json({ verified: true });
}
