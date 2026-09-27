import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashRiskValue } from '@/lib/trial-risk';
import { persistentRateLimit, getClientIp } from '@/lib/security';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ email: z.string().email().max(320) });

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = await persistentRateLimit(`verification-intent:${ip}`, 8, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many verification attempts. Please try again later.' }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  const token = randomBytes(32).toString('base64url');
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('auth_verification_intents').insert({
    token_hash: hashRiskValue(token),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error('Verification intent creation failed:', error.message);
    return NextResponse.json({ error: 'Unable to start email verification.' }, { status: 500 });
  }
  // Email is deliberately not returned or exposed through the token.
  // It is only used client-side to sign in after confirmation.
  return NextResponse.json({ token });
}