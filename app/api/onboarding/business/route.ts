import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isReservedBusinessSlug, normalizeBusinessSlug } from '@/lib/slug';
import { evaluateTrialRisk, getClientIp, recordTrialClaim } from '@/lib/trial-risk';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(40),
  description: z.string().trim().min(10).max(500),
  firstServiceName: z.string().trim().min(2).max(120),
  firstServiceMinimum: z.coerce.number().min(0),
  firstServiceMaximum: z.coerce.number().min(0),
  deviceFingerprint: z.string().min(16).max(256).optional(),
}).refine((value) => value.firstServiceMaximum >= value.firstServiceMinimum, { message: 'The maximum service price must be greater than or equal to the minimum.' });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const parsed = businessSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Use a valid business name and public link.' }, { status: 400 });
    const slug = normalizeBusinessSlug(parsed.data.slug);
    if (!slug || isReservedBusinessSlug(slug)) return NextResponse.json({ error: 'Choose another public link name.' }, { status: 400 });
    const { data: existing } = await supabase.from('businesses').select('id, slug, trial_status, trial_ends_at').eq('owner_id', user.id).limit(1).maybeSingle();
    if (existing) return NextResponse.json(existing, { status: 200 });

    const risk = await evaluateTrialRisk({ email: user.email || parsed.data.email, phone: parsed.data.phone, deviceFingerprint: parsed.data.deviceFingerprint, ip: getClientIp(request) });
    const emailReused = risk.signals.email_reused.matched;
    const deviceReused = risk.signals.device_reused.matched;
    if (risk.level === 'high' || emailReused || deviceReused) {
      return NextResponse.json({ error: 'We could not start a new trial from this signup. If you already used a DetailFlow trial, please upgrade your existing workspace or contact support.', code: 'TRIAL_NOT_ELIGIBLE' }, { status: 403 });
    }

    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { data, error } = await supabase.from('businesses').insert({ owner_id: user.id, name: parsed.data.name, slug, email: parsed.data.email, phone: parsed.data.phone, description: parsed.data.description }).select('id, slug, trial_status, trial_started_at, trial_ends_at').single();
    if (error?.code === '23505') return NextResponse.json({ error: 'That public link is already taken.' }, { status: 409 });
    if (error) { console.error('Business creation failed', error.message); return NextResponse.json({ error: 'Unable to create the workspace (' + (error.code || 'database') + ').' }, { status: 500 }); }
    try {
      await recordTrialClaim({ userId: user.id, businessId: data.id, risk, trialStartedAt: trialStartedAt.toISOString(), trialEndsAt: trialEndsAt.toISOString() });
    } catch (riskError) {
      await createSupabaseAdminClient().from('businesses').delete().eq('id', data.id).eq('owner_id', user.id);
      console.error('Trial risk record failed:', riskError instanceof Error ? riskError.message : 'unknown');
      return NextResponse.json({ error: 'We could not securely start the trial. Please try again.' }, { status: 500 });
    }
    const { error: serviceError } = await supabase.from('services').insert({ business_id: data.id, name: parsed.data.firstServiceName, pricing_type: 'range', minimum_price: parsed.data.firstServiceMinimum, maximum_price: parsed.data.firstServiceMaximum, display_order: 0 });
    if (serviceError) return NextResponse.json({ error: 'Business created, but the first service could not be saved. Add it from Services.' }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Business onboarding failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Unable to create the workspace. Check that the Supabase migration is applied.' }, { status: 500 });
  }
}
