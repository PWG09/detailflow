import { NextResponse, after } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publicQuoteSchema } from '@/lib/validation/public-quote';
import { getClientIp, persistentRateLimit, verifyTurnstile } from '@/lib/security';
import { effectivePlan, monthlyLeadLimit, PLAN_LIMITS } from '@/lib/entitlements';
import { assessVehicle } from '@/lib/ai';
import { normalizeBusinessSlug } from '@/lib/slug';
import { MAX_LEAD_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES, sniffImage, type ImageKind } from '@/lib/uploads';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GENERIC_FAILURE = 'We could not submit your request right now. Please try again in a few minutes.';

function failure(stage: string, error: { code?: string; message?: string } | unknown) {
  const detail = error && typeof error === 'object' ? error as { code?: string; message?: string } : {};
  console.error('Public lead submission failed', { stage, code: detail.code, message: detail.message });
  return NextResponse.json({ error: GENERIC_FAILURE }, { status: 500 });
}

function monthStartIso() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rate = await persistentRateLimit(`public-quote:${ip}`, 12, 60 * 60);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfter / 1000)) } });
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'Please submit the request form.' }, { status: 400 });
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_TOTAL_PHOTO_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: 'Your photos are too large. Please keep the total upload under 30 MB.' }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'The request could not be read. Please try again.' }, { status: 400 });
  }

  const parsed = publicQuoteSchema.safeParse({
    businessSlug: normalizeBusinessSlug(String(formData.get('businessSlug') || '')),
    serviceName: formData.get('serviceName'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    year: formData.get('year'),
    makeModel: formData.get('makeModel'),
    vehicleType: formData.get('vehicleType'),
    condition: formData.get('condition') ?? '',
    consent: formData.get('consent') ?? 'false',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || 'Please review the request details.', field: issue?.path?.[0] ?? null }, { status: 400 });
  }
  const input = parsed.data;

  // Validate every photo before anything is written.
  const photos = formData.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0);
  if (photos.length > MAX_LEAD_PHOTOS) return NextResponse.json({ error: `Please upload no more than ${MAX_LEAD_PHOTOS} photos.` }, { status: 400 });
  const totalPhotoBytes = photos.reduce((sum, photo) => sum + photo.size, 0);
  if (totalPhotoBytes > MAX_TOTAL_PHOTO_BYTES) return NextResponse.json({ error: 'Your photos are too large. Please keep the total upload under 30 MB.' }, { status: 413 });
  const validatedPhotos: { bytes: Uint8Array; kind: ImageKind }[] = [];
  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'Each photo must be smaller than 10 MB.' }, { status: 413 });
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return NextResponse.json({ error: 'Only JPG and PNG photos are accepted.' }, { status: 400 });
    validatedPhotos.push({ bytes, kind });
  }

  const captcha = await verifyTurnstile(String(formData.get('captchaToken') || ''), ip);
  if (!captcha.success) return NextResponse.json({ error: captcha.error || 'Security verification failed. Please try again.', code: 'CAPTCHA_FAILED' }, { status: 400 });

  let supabase: ReturnType<typeof createSupabaseAdminClient>;
  try {
    supabase = createSupabaseAdminClient();
  } catch (error) {
    return failure('config', error);
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,slug,name,email,plan,currency,trial_status,trial_ends_at')
    .eq('slug', input.businessSlug)
    .maybeSingle();
  if (businessError) return failure('business', businessError);
  if (!business) return NextResponse.json({ error: 'This business lead link is not available.' }, { status: 404 });

  const normalizedEmail = input.email.toLowerCase();
  const emailRate = await persistentRateLimit(`public-quote-email:${business.id}:${normalizedEmail}`, 5, 60 * 60);
  if (!emailRate.allowed) return NextResponse.json({ error: 'Too many requests from this email address. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(emailRate.retryAfter / 1000)) } });

  const { data: service, error: serviceError } = await supabase
    .from('services')
    .select('id,name,minimum_price,maximum_price,requires_photos')
    .eq('business_id', business.id)
    .eq('name', input.serviceName)
    .eq('active', true)
    .order('display_order')
    .limit(1)
    .maybeSingle();
  if (serviceError) return failure('service', serviceError);
  if (!service) return NextResponse.json({ error: 'The selected service is no longer available.', field: 'serviceName' }, { status: 400 });
  if (service.requires_photos && validatedPhotos.length === 0) return NextResponse.json({ error: 'At least one vehicle photo is required for this service.', field: 'photos' }, { status: 400 });

  const plan = effectivePlan({ plan: business.plan, trialStatus: business.trial_status, trialEndsAt: business.trial_ends_at });
  const leadLimit = monthlyLeadLimit(plan);
  if (Number.isFinite(leadLimit)) {
    const { count, error: countError } = await supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('business_id', business.id).gte('created_at', monthStartIso());
    if (countError) return failure('lead-limit', countError);
    if ((count ?? 0) >= leadLimit) return NextResponse.json({ error: 'This business is not accepting online requests right now. Please contact them directly.' }, { status: 429 });
  }

  // Customers are matched by email within the business. An anonymous submitter
  // never overwrites an existing customer's name or phone; only empty fields
  // are filled in.
  let customerId: string;
  {
    const { data: existing, error: lookupError } = await supabase.from('customers')
      .select('id,phone').eq('business_id', business.id).eq('normalized_email', normalizedEmail).maybeSingle();
    if (lookupError) return failure('customer-lookup', lookupError);
    if (existing) {
      customerId = existing.id;
      if (!existing.phone) {
        const { error: phoneError } = await supabase.from('customers').update({ phone: input.phone, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (phoneError) console.error('Customer phone backfill failed:', phoneError.code, phoneError.message);
      }
    } else {
      const { data: created, error: insertError } = await supabase.from('customers').insert({
        business_id: business.id, first_name: input.firstName, last_name: input.lastName,
        email: input.email, normalized_email: normalizedEmail, phone: input.phone,
      }).select('id').single();
      if (insertError?.code === '23505') {
        const { data: raced, error: racedError } = await supabase.from('customers').select('id')
          .eq('business_id', business.id).eq('normalized_email', normalizedEmail).single();
        if (racedError || !raced) return failure('customer-race', racedError);
        customerId = raced.id;
      } else if (insertError || !created) {
        return failure('customer', insertError);
      } else {
        customerId = created.id;
      }
    }
  }

  const currency = (business.currency || 'USD').toUpperCase();
  const estimate = { minimum: Number(service.minimum_price), maximum: Number(service.maximum_price), currency };
  const { data: lead, error: leadError } = await supabase.from('leads').insert({
    business_id: business.id,
    customer_id: customerId,
    service_id: service.id,
    vehicle: { year: input.year, makeModel: input.makeModel, type: input.vehicleType },
    condition: { notes: input.condition },
    estimate,
    source: 'public_quote',
  }).select('id').single();
  if (leadError || !lead) return failure('lead', leadError);

  const photoPaths: string[] = [];
  for (const photo of validatedPhotos) {
    const extension = photo.kind === 'jpeg' ? 'jpg' : 'png';
    const path = `${business.id}/leads/${lead.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('vehicle-photos').upload(path, photo.bytes, {
      contentType: photo.kind === 'jpeg' ? 'image/jpeg' : 'image/png', upsert: false,
    });
    if (uploadError) {
      if (photoPaths.length) await supabase.storage.from('vehicle-photos').remove(photoPaths);
      await supabase.from('leads').delete().eq('id', lead.id).eq('business_id', business.id);
      return failure('photo-upload', uploadError);
    }
    photoPaths.push(path);
  }
  if (photoPaths.length) {
    const { error: pathError } = await supabase.from('leads')
      .update({ photo_paths: photoPaths, updated_at: new Date().toISOString() })
      .eq('id', lead.id).eq('business_id', business.id);
    if (pathError) {
      await supabase.storage.from('vehicle-photos').remove(photoPaths);
      await supabase.from('leads').delete().eq('id', lead.id).eq('business_id', business.id);
      return failure('photo-paths', pathError);
    }
  }

  // AI is assistive. It runs after the response is sent so a slow provider can
  // never make a saved request look failed. No transactional email provider is
  // configured: new leads surface in the dashboard; account emails go through
  // Supabase Auth SMTP.
  const aiPhotos = validatedPhotos.slice(0, 4).map((photo) => photo.bytes);
  after(async () => {
    const aiLimit = PLAN_LIMITS[plan].aiPerMonth;
    if (!aiPhotos.length || aiLimit <= 0) return;
    try {
      const cap = Number.isFinite(aiLimit) ? aiLimit : Number(process.env.BUSINESS_AI_MONTHLY_HARD_CAP || 5000);
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('business_id', business.id).gte('ai_assessed_at', monthStartIso());
      const aiRate = await persistentRateLimit(`public-ai:${business.id}`, 20, 60);
      if ((count ?? 0) >= cap || !aiRate.allowed) return;
      const assessment = await assessVehicle(aiPhotos);
      const { error } = await supabase.from('leads').update({ ai_assessment: assessment, ai_assessed_at: new Date().toISOString() })
        .eq('id', lead.id).eq('business_id', business.id);
      if (error) console.error('AI assessment save failed:', error.code, error.message);
    } catch (error) {
      console.error('AI assessment failed; lead kept without AI:', error instanceof Error ? error.message : 'unknown');
    }
  });

  return NextResponse.json({ leadId: lead.id, estimate }, { status: 201 });
}
