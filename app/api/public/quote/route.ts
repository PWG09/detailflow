import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publicQuoteSchema } from '@/lib/validation/public-quote';
import { checkRateLimit } from '@/lib/rate-limit';
import { FREE_LEAD_LIMIT, isPro } from '@/lib/entitlements';
import { assessVehicle } from '@/lib/ai';
import { sendEmail, emailShell } from '@/lib/email';

export const runtime = 'nodejs';

function databaseFailure(stage: string, error: { code?: string }) {
  const code = error.code || 'database';
  if (code === 'PGRST301' || code === '401') return NextResponse.json({ error: 'The server Supabase key is invalid or expired. Update SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy.' }, { status: 500 });
  if (code === '42P01') return NextResponse.json({ error: `The Supabase table needed for ${stage} does not exist. Run the database migrations.` }, { status: 500 });
  if (code === '42501') return NextResponse.json({ error: `Supabase denied the ${stage} query. Check the database grants and RLS policies.` }, { status: 500 });
  return NextResponse.json({ error: `Supabase failed during ${stage} (${code}).` }, { status: 500 });
}

export async function POST(request: Request) {
  let stage = 'request';
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const rate = checkRateLimit(`public-quote:${ip}`);
    if (!rate.allowed) return NextResponse.json({ error: 'Too many quote requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.retryAfter / 1000)) } });
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return NextResponse.json({ error: 'Please submit the quote form with its fields and photos.' }, { status: 400 });
    stage = 'form';
    const formData = await request.formData();
    const parsed = publicQuoteSchema.safeParse({
      businessSlug: formData.get('businessSlug'),
      serviceName: formData.get('serviceName'),
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      year: formData.get('year'),
      makeModel: formData.get('makeModel'),
      vehicleType: formData.get('vehicleType'),
      condition: formData.get('condition') ?? '',
    });
    if (!parsed.success) return NextResponse.json({ error: 'Please review the required quote details.' }, { status: 400 });

    const input = parsed.data;
    stage = 'config';
    const supabase = createSupabaseAdminClient();
    stage = 'business';
    const requestedSlug = input.businessSlug.trim();
    const { data: business, error: businessError } = await supabase.from('businesses').select('id, slug, name, email, plan').eq('slug', requestedSlug).maybeSingle();
    if (businessError) return databaseFailure('business lookup', businessError);
    if (!business) {
      const { data: nearbyBusinesses, error: lookupDebugError } = await supabase.from('businesses').select('slug, name').limit(20);
      console.error('Public quote slug mismatch', {
        requestedSlug,
        nearbyBusinesses,
        lookupDebugError: lookupDebugError?.message,
      });
      return NextResponse.json({ error: `This business quote link is not available for "${requestedSlug}". Check the public link slug in Supabase.` }, { status: 404 });
    }

    stage = 'service';
    const { data: service, error: serviceError } = await supabase.from('services').select('id, minimum_price, maximum_price').eq('business_id', business.id).eq('name', input.serviceName).eq('active', true).maybeSingle();
    if (serviceError) return databaseFailure('service lookup', serviceError);
    if (!service) return NextResponse.json({ error: 'The selected service is no longer available.' }, { status: 400 });

    if (!isPro(business.plan)) {
      const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', monthStart.toISOString()).neq('status', 'archived');
      if ((count ?? 0) >= FREE_LEAD_LIMIT) return NextResponse.json({ error: 'This business has reached its monthly quote-request limit. Please contact the business directly.' }, { status: 429 });
    }

    stage = 'customer';
    const normalizedEmail = input.email.toLowerCase();
    const { data: customer, error: customerError } = await supabase.from('customers').upsert({
      business_id: business.id,
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      normalized_email: normalizedEmail,
      phone: input.phone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,normalized_email' }).select('id').single();
    if (customerError) return databaseFailure('customer save', customerError);

    const photos = formData.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0);
    if (photos.length > 8) return NextResponse.json({ error: 'Please upload no more than 8 photos.' }, { status: 400 });
    const validatedPhotos: { bytes: Uint8Array; isJpeg: boolean }[] = [];
    for (const photo of photos) {
      if (photo.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Each photo must be smaller than 10 MB.' }, { status: 400 });
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      if (!isJpeg && !isPng) return NextResponse.json({ error: 'Only valid JPG and PNG photos are accepted.' }, { status: 400 });
      validatedPhotos.push({ bytes, isJpeg });
    }

    stage = 'lead';
    const { data: lead, error: leadError } = await supabase.from('leads').insert({
      business_id: business.id,
      customer_id: customer.id,
      service_id: service.id,
      vehicle: { year: input.year, makeModel: input.makeModel, type: input.vehicleType },
      condition: { notes: input.condition },
      estimate: { minimum: service.minimum_price, maximum: service.maximum_price, currency: 'USD' },
      source: 'public_quote',
    }).select('id').single();
    if (leadError) return databaseFailure('lead save', leadError);

    stage = 'storage';
    const photoPaths: string[] = [];
    for (const photo of validatedPhotos) {
      const extension = photo.isJpeg ? 'jpg' : 'png';
      const path = `${business.id}/leads/${lead.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('vehicle-photos').upload(path, photo.bytes, { contentType: photo.isJpeg ? 'image/jpeg' : 'image/png', upsert: false });
      if (uploadError) return databaseFailure('photo upload', { code: 'storage' });
      photoPaths.push(path);
    }

    // Persist the uploaded storage paths on the lead. The AI dashboard route
    // reads leads.photo_paths later; without this update, the photos exist in
    // Storage but the lead appears to have no photos.
    if (photoPaths.length > 0) {
      const { data: savedLead, error: photoPathError } = await supabase
        .from('leads')
        .update({ photo_paths: photoPaths, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('business_id', business.id)
        .select('id,photo_paths')
        .single();
      if (photoPathError) {
        console.error('Lead photo path save failed', { leadId: lead.id, photoPaths, code: photoPathError.code, message: photoPathError.message });
        return databaseFailure('photo path save', photoPathError);
      }
      if (!savedLead?.photo_paths?.length) {
        console.error('Lead photo path save returned no paths', { leadId: lead.id, photoPaths });
        return NextResponse.json({ error: 'Photos uploaded but could not be attached to the lead.' }, { status: 500 });
      }
    }

    let aiAssessment = null;
    if (photoPaths.length > 0 && isPro(business.plan)) {
      aiAssessment = await assessVehicle(validatedPhotos.map((photo) => photo.bytes));
      await supabase.from('leads').update({ ai_assessment: aiAssessment, ai_assessed_at: new Date().toISOString() }).eq('id', lead.id);
    }

    const estimate = { minimum: service.minimum_price, maximum: service.maximum_price, currency: 'USD' };
    const businessEmail = business.email;
    if (input.email) {
      try { await sendEmail({ to: input.email, subject: `Quote request received — ${business.name}`, html: emailShell('Request received', `<p>Hi ${input.firstName},</p><p>Your quote request for <strong>${input.year} ${input.makeModel}</strong> was sent to ${business.name}.</p><p>Estimated range: <strong>$${service.minimum_price}–$${service.maximum_price}</strong>.</p><p>The business will review your request and contact you with the next step.</p>`) }); } catch (error) { console.error('Customer confirmation email failed', error); }
    }
    if (businessEmail) {
      try { await sendEmail({ to: businessEmail, subject: `New quote request — ${input.firstName} ${input.lastName}`, html: emailShell('New quote request', `<p><strong>${input.firstName} ${input.lastName}</strong> requested ${input.serviceName} for ${input.year} ${input.makeModel}.</p><p>Estimated range: <strong>$${service.minimum_price}–$${service.maximum_price}</strong>.</p><p>Lead ID: ${lead.id}</p>`) }); } catch (error) { console.error('Lead notification email failed', error); }
    }

    return NextResponse.json({ leadId: lead.id, estimate, aiAssessment }, { status: 201 });
  } catch (error) {
    console.error('Public quote submission failed', { stage, message: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: `We could not submit your request (${stage}). Check the Supabase setup and try again.` }, { status: 500 });
  }
}
