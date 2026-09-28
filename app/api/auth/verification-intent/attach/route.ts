import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashRiskValue } from '@/lib/trial-risk';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  token: z.string().min(32).max(128),
  userId: z.string().uuid(),
  email: z.string().email().max(320),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid verification session.' }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const tokenHash = hashRiskValue(parsed.data.token);
  const emailHash = hashRiskValue(email);
  const admin = createSupabaseAdminClient();

  const { data: intent, error: intentError } = await admin
    .from('auth_verification_intents')
    .select('id,expires_at,user_id,email_hash,verified_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (intentError) {
    console.error('Verification intent lookup failed:', intentError.message);
    return NextResponse.json({ error: 'Unable to verify signup session.' }, { status: 500 });
  }

  if (!intent || new Date(intent.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Verification session expired.' }, { status: 410 });
  }

  // The intent is created before Supabase Auth creates the account. At this
  // point the browser has the user id returned by a successful signUp call.
  // Bind the intent to the normalized email that originally created the token.
  // We intentionally do not call auth.admin.getUserById here because that
  // endpoint can reject a freshly-created auth user during this short window,
  // even though the signup itself succeeded.
  if (intent.email_hash && intent.email_hash !== emailHash) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  if (intent.user_id && intent.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  const { data: attached, error: updateError } = await admin
    .from('auth_verification_intents')
    .update({
      user_id: parsed.data.userId,
      email_hash: emailHash,
    })
    .eq('id', intent.id)
    .is('user_id', null)
    .select('id,user_id')
    .maybeSingle();

  if (updateError) {
    console.error('Verification intent attachment failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to save verification session.' }, { status: 500 });
  }

  // Another request may have attached the same intent between the lookup and
  // update. Treat an already-correct attachment as success, but never allow
  // it to be rebound to another account.
  if (!attached) {
    const { data: current, error: currentError } = await admin
      .from('auth_verification_intents')
      .select('user_id')
      .eq('id', intent.id)
      .maybeSingle();

    if (currentError) {
      console.error('Verification intent recheck failed:', currentError.message);
      return NextResponse.json({ error: 'Unable to verify signup session.' }, { status: 500 });
    }

    if (current?.user_id !== parsed.data.userId) {
      return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true });
}
