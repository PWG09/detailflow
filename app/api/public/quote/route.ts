import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publicQuoteSchema } from '@/lib/validation/public-quote';

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
    const { data: business, error: businessError } = await supabase.from('businesses').select('id').eq('slug', input.businessSlug).maybeSingle();
    if (businessError) return databaseFailure('business lookup', businessError);
    if (!business) return NextResponse.json({ error: 'This business quote link is not available.' }, { status: 404 });

    stage = 'service';
    const { data: service, error: serviceError } = await supabase.from('services').select('id, minimum_price, maximum_price').eq('business_id', business.id).eq('name', input.serviceName).eq('active', true).maybeSingle();
    if (serviceError) return databaseFailure('service lookup', serviceError);
    if (!service) return NextResponse.json({ error: 'The selected service is no longer available.' }, { status: 400 });

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
    if (photoPaths.length > 0) {
      const { error: photoUpdateError } = await supabase.from('leads').update({ photo_paths: photoPaths }).eq('id', lead.id);
      if (photoUpdateError) return databaseFailure('photo path save', photoUpdateError);
    }

    return NextResponse.json({ leadId: lead.id, estimate: { minimum: service.minimum_price, maximum: service.maximum_price } }, { status: 201 });
  } catch (error) {
    console.error('Public quote submission failed', { stage, message: error instanceof Error ? error.message : 'unknown error' });
    return NextResponse.json({ error: `We could not submit your request (${stage}). Check the Supabase setup and try again.` }, { status: 500 });
  }
}
