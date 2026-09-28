import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashRiskValue } from '@/lib/trial-risk';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  token: z.string().min(32).max(128),
  userId: z.string().uuid(),
  email: z.string().email().max(320),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    console.error('Verification intent lookup failed:', intentError);
    return NextResponse.json({ error: 'Unable to verify signup session.' }, { status: 500 });
  }

  if (!intent || new Date(intent.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Verification session expired.' }, { status: 410 });
  }

  if (intent.email_hash && intent.email_hash !== emailHash) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  if (intent.user_id && intent.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  let lastUpdateError: unknown = null;

  // Supabase Auth can return the newly-created user before the transaction
  // behind auth.users is fully visible to the database connection used here.
  // Retry the FK-backed attachment briefly instead of failing the signup.
  for (const delay of [0, 250, 750, 1500, 2500]) {
    if (delay) await sleep(delay);

    const { error: updateError } = await admin
      .from('auth_verification_intents')
      .update({
        user_id: parsed.data.userId,
        email_hash: emailHash,
      })
      .eq('id', intent.id)
      .is('user_id', null);

    if (!updateError) {
      lastUpdateError = null;
      break;
    }

    lastUpdateError = updateError;
    console.error('Verification intent attachment attempt failed:', {
      message: updateError.message,
      code: updateError.code,
      details: updateError.details,
      hint: updateError.hint,
      attemptDelayMs: delay,
    });
  }

  if (lastUpdateError) {
    return NextResponse.json({ error: 'Unable to save verification session.' }, { status: 500 });
  }

  const { data: current, error: currentError } = await admin
    .from('auth_verification_intents')
    .select('user_id')
    .eq('id', intent.id)
    .maybeSingle();

  if (currentError) {
    console.error('Verification intent attachment check failed:', currentError);
    return NextResponse.json({ error: 'Unable to verify signup session.' }, { status: 500 });
  }

  if (current?.user_id !== parsed.data.userId) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
