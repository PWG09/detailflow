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

  // The intent is created before Supabase Auth returns the new user id.
  // Validate the token against the normalized signup email, then bind the
  // freshly-created Auth user returned by signUp().
  if (intent.email_hash && intent.email_hash !== emailHash) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  if (intent.user_id && intent.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  // Do not request a representation from PostgREST here. The verification
  // table is server-only and some Supabase configurations can reject a
  // returning SELECT even when the UPDATE itself is authorized.
  const { error: updateError } = await admin
    .from('auth_verification_intents')
    .update({
      user_id: parsed.data.userId,
      email_hash: emailHash,
    })
    .eq('id', intent.id)
    .is('user_id', null);

  if (updateError) {
    console.error('Verification intent attachment failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to save verification session.' }, { status: 500 });
  }

  // Verify the attachment after the write. This also handles a concurrent
  // request that may have attached the intent first.
  const { data: current, error: currentError } = await admin
    .from('auth_verification_intents')
    .select('user_id')
    .eq('id', intent.id)
    .maybeSingle();

  if (currentError) {
    console.error('Verification intent attachment check failed:', currentError.message);
    return NextResponse.json({ error: 'Unable to verify signup session.' }, { status: 500 });
  }

  if (current?.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
