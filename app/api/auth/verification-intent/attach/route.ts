import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashRiskValue } from '@/lib/trial-risk';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ token: z.string().min(32).max(128), userId: z.string().uuid(), email: z.string().email().max(320) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid verification session.' }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const tokenHash = hashRiskValue(parsed.data.token);
  const { data: intent, error: intentError } = await admin.from('auth_verification_intents')
    .select('id,expires_at,user_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (intentError || !intent || new Date(intent.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'Verification session expired.' }, { status: 410 });
  if (intent.user_id && intent.user_id !== parsed.data.userId) return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });

  const { data, error } = await admin.auth.admin.getUserById(parsed.data.userId);
  if (error || !data.user || data.user.email?.trim().toLowerCase() !== parsed.data.email.trim().toLowerCase()) {
    return NextResponse.json({ error: 'Verification session mismatch.' }, { status: 409 });
  }
  const { error: updateError } = await admin.from('auth_verification_intents').update({ user_id: parsed.data.userId }).eq('id', intent.id);
  if (updateError) {
    console.error('Verification intent attachment failed:', updateError.message);
    return NextResponse.json({ error: 'Unable to save verification session.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}