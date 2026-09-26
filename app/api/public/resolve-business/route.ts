import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSlug = (searchParams.get('slug') ?? '').trim().toLowerCase();

  if (!requestedSlug) return NextResponse.json({ error: 'Missing business slug.' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,slug,name,description')
    .eq('slug', requestedSlug)
    .maybeSingle();

  if (businessError) {
    console.error('Business lookup failed', businessError.message);
    return NextResponse.json({ error: 'Unable to resolve this business right now.' }, { status: 500 });
  }
  if (!business) return NextResponse.json({ error: 'This business lead link is not available.' }, { status: 404 });

  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('name,minimum_price,maximum_price,requires_photos')
    .eq('business_id', business.id)
    .eq('active', true)
    .order('display_order');

  if (servicesError) {
    console.error('Business services lookup failed', servicesError.message);
    return NextResponse.json({ error: 'Unable to load this business services.' }, { status: 500 });
  }

  return NextResponse.json({
    slug: business.slug,
    name: business.name,
    description: business.description,
    services: services ?? [],
    leadUrl: `/${business.slug}/lead`,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
