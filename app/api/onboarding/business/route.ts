import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isReservedBusinessSlug, normalizeBusinessSlug } from '@/lib/slug';
import { evaluateTrialRisk, getClientIp, recordTrialClaim } from '@/lib/trial-risk';
import { persistentRateLimit } from '@/lib/security';

const price = z.coerce.number().finite().min(0).max(1_000_000);

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Business name must be at least 2 characters.').max(120),
  slug: z.string().trim().min(3, 'Public link name must be at least 3 characters.').max(60),
  email: z.string().trim().email('Enter a valid business email.').max(254),
  phone: z.string().trim().min(7, 'Enter a valid phone number.').max(40),
  description: z.string().trim().min(10, 'Description must be at least 10 characters.').max(500),
  firstServiceName: z.string().trim().min(2, 'Service name must be at least 2 characters.').max(120),
  firstServiceMinimum: price,
  firstServiceMaximum: price,
  deviceFingerprint: z.string().min(16).max(256).optional(),
}).refine((value) => value.firstServiceMaximum >= value.firstServiceMinimum, { message: 'The maximum service price must be greater than or equal to the minimum.' });

const TRIAL_DAYS = 14;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  if (!user.email_confirmed_at) return NextResponse.json({ error: 'Confirm your email address before creating a workspace.' }, { status: 403 });

  const rate = await persistentRateLimit(`onboarding:${user.id}`, 10, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

  const parsed = businessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check your workspace details.' }, { status: 400 });
  const slug = normalizeBusinessSlug(parsed.data.slug);
  if (!slug || slug.length < 3 || isReservedBusinessSlug(slug)) return NextResponse.json({ error: 'Choose another public link name.' }, { status: 400 });

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    console.error('Onboarding configuration error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Workspace creation is temporarily unavailable.' }, { status: 503 });
  }

  // One workspace per account: an owner or an invited staff member never gets a second one.
  const { data: existingMembership, error: membershipError } = await admin
    .from('business_members').select('business_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (membershipError) {
    console.error('Onboarding membership lookup failed:', membershipError.code, membershipError.message);
    return NextResponse.json({ error: 'Unable to create the workspace right now.' }, { status: 500 });
  }
  if (existingMembership) {
    const { data: existing } = await admin.from('businesses').select('id,slug,trial_status,trial_ends_at').eq('id', existingMembership.business_id).maybeSingle();
    return NextResponse.json(existing ?? { id: existingMembership.business_id }, { status: 200 });
  }

  const { data: slugTaken } = await admin.from('businesses').select('id').ilike('slug', slug).limit(1).maybeSingle();
  if (slugTaken) return NextResponse.json({ error: 'That public link is already taken.' }, { status: 409 });

  let risk: Awaited<ReturnType<typeof evaluateTrialRisk>>;
  try {
    risk = await evaluateTrialRisk({ email: user.email || parsed.data.email, phone: parsed.data.phone, deviceFingerprint: parsed.data.deviceFingerprint, ip: getClientIp(request) });
  } catch (error) {
    console.error('Trial risk evaluation failed:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Unable to create the workspace right now.' }, { status: 500 });
  }
  if (risk.level === 'high' || risk.signals.email_reused.matched || risk.signals.device_reused.matched) {
    return NextResponse.json({ error: 'We could not start a new trial from this signup. If you already used a DetailFlow trial, sign in to that workspace or contact support.', code: 'TRIAL_NOT_ELIGIBLE' }, { status: 403 });
  }

  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const { data, error } = await admin.from('businesses').insert({
    owner_id: user.id,
    name: parsed.data.name,
    slug,
    email: parsed.data.email,
    phone: parsed.data.phone,
    description: parsed.data.description,
    plan: 'pro',
    trial_status: 'active',
    trial_started_at: trialStartedAt.toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
    trial_risk_score: risk.score,
    trial_risk_level: risk.level,
    trial_risk_signals: risk.signals,
  }).select('id,slug,trial_status,trial_started_at,trial_ends_at').single();
  if (error?.code === '23505') return NextResponse.json({ error: 'That public link is already taken.' }, { status: 409 });
  if (error || !data) {
    // PGRST204 means a column above is missing: the trial/risk migration is not applied.
    console.error('Business creation failed:', error?.code, error?.message);
    return NextResponse.json({ error: 'Unable to create the workspace right now.' }, { status: 500 });
  }

  const rollback = async () => {
    await admin.from('trial_claims').delete().eq('business_id', data.id);
    await admin.from('businesses').delete().eq('id', data.id).eq('owner_id', user.id);
  };

  // The owner membership is created by the businesses insert trigger. Verify it.
  const { data: ownerMembership } = await admin.from('business_members').select('role').eq('business_id', data.id).eq('user_id', user.id).maybeSingle();
  if (!ownerMembership) {
    const { error: memberError } = await admin.from('business_members').insert({ business_id: data.id, user_id: user.id, role: 'owner' });
    if (memberError) {
      console.error('Owner membership creation failed:', memberError.code, memberError.message);
      await rollback();
      return NextResponse.json({ error: 'Unable to create the workspace right now.' }, { status: 500 });
    }
  }

  try {
    await recordTrialClaim({ userId: user.id, businessId: data.id, risk, trialStartedAt: trialStartedAt.toISOString(), trialEndsAt: trialEndsAt.toISOString() });
  } catch (riskError) {
    console.error('Trial claim record failed:', riskError instanceof Error ? riskError.message : 'unknown');
    await rollback();
    return NextResponse.json({ error: 'We could not securely start the trial. Please try again.' }, { status: 500 });
  }

  const { error: serviceError } = await admin.from('services').insert({
    business_id: data.id,
    name: parsed.data.firstServiceName,
    pricing_type: parsed.data.firstServiceMinimum === parsed.data.firstServiceMaximum ? 'fixed' : 'range',
    minimum_price: parsed.data.firstServiceMinimum,
    maximum_price: parsed.data.firstServiceMaximum,
    display_order: 0,
  });
  if (serviceError) {
    console.error('Initial service creation failed:', serviceError.code, serviceError.message);
    await rollback();
    return NextResponse.json({ error: 'We could not finish your workspace setup. Please try again.' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
