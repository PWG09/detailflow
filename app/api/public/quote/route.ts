import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publicQuoteSchema } from '@/lib/validation/public-quote';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
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
    const supabase = createSupabaseAdminClient();
    const { data: business, error: businessError } = await supabase.from('businesses').select('id').eq('slug', input.businessSlug).maybeSingle();
    if (businessError) throw businessError;
    if (!business) return NextResponse.json({ error: 'This business quote link is not available.' }, { status: 404 });

    const { data: service, error: serviceError } = await supabase.from('services').select('id, minimum_price, maximum_price').eq('business_id', business.id).eq('name', input.serviceName).eq('active', true).maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: 'The selected service is no longer available.' }, { status: 400 });

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
    if (customerError) throw customerError;

    const { data: lead, error: leadError } = await supabase.from('leads').insert({
      business_id: business.id,
      customer_id: customer.id,
      service_id: service.id,
      vehicle: { year: input.year, makeModel: input.makeModel, type: input.vehicleType },
      condition: { notes: input.condition },
      estimate: { minimum: service.minimum_price, maximum: service.maximum_price, currency: 'USD' },
      source: 'public_quote',
    }).select('id').single();
    if (leadError) throw leadError;

    return NextResponse.json({ leadId: lead.id, estimate: { minimum: service.minimum_price, maximum: service.maximum_price } }, { status: 201 });
  } catch (error) {
    console.error('Public quote submission failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'We could not submit your request. Please try again.' }, { status: 500 });
  }
}
