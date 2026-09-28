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

  // Bind the token to the email that originally requested the verification.
  // This prevents a valid token from being attached to another account.
  if (intent.email_hash && intent.email_hash !== emailHash) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  if (intent.user_id && intent.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  const { data, error } = await admin.auth.admin.getUserById(parsed.data.userId);
  const userEmail = data.user?.email?.trim().toLowerCase();

  if (error || !data.user || userEmail !== email) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

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

  return NextResponse.json({ ok: true });
}
