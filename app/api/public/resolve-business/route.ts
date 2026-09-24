import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedSlug = (searchParams.get('slug') ?? '').trim().toLowerCase();

  if (!requestedSlug) {
    return NextResponse.json({ error: 'Missing business slug.' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: exactMatch, error: exactMatchError } = await supabase
    .from('businesses')
    .select('id, slug, name')
    .eq('slug', requestedSlug)
    .maybeSingle();

  if (exactMatchError) {
    console.error('Business lookup failed', exactMatchError);
    return NextResponse.json({ error: 'Unable to resolve business.' }, { status: 500 });
  }

  if (exactMatch) {
    const { data: services } = await supabase.from('services').select('name, minimum_price, maximum_price').eq('business_id', exactMatch.id).eq('active', true).order('display_order');
    return NextResponse.json({ slug: exactMatch.slug, name: exactMatch.name, services: services ?? [], redirect: false });
  }

  const { data: fallbackBusiness, error: fallbackError } = await supabase
    .from('businesses')
    .select('id, slug, name')
    .limit(1)
    .maybeSingle();

  if (fallbackError) {
    console.error('Fallback business lookup failed', fallbackError);
    return NextResponse.json({ error: 'No matching business found.' }, { status: 404 });
  }

  if (!fallbackBusiness) {
    return NextResponse.json({ error: 'No businesses are available yet.' }, { status: 404 });
  }

  const { data: services } = await supabase.from('services').select('name, minimum_price, maximum_price').eq('business_id', fallbackBusiness.id).eq('active', true).order('display_order');
  return NextResponse.json({ slug: fallbackBusiness.slug, name: fallbackBusiness.name, services: services ?? [], redirect: true, requestedSlug });
}
