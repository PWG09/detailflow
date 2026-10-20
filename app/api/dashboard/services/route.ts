import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';
import { serviceRow, serviceSchema } from '@/lib/validation/service';

const SELECT = 'id,name,description,pricing_type,minimum_price,maximum_price,active,requires_photos,display_order,created_at,updated_at';

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;
  const { data, error } = await supabase.from('services').select(SELECT).eq('business_id', membership.business_id).order('display_order').order('created_at');
  if (error) return NextResponse.json({ error: 'Unable to load services.' }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;
  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid service.' }, { status: 400 });

  const { data: duplicate } = await supabase.from('services').select('id').eq('business_id', membership.business_id).eq('name', parsed.data.name).eq('active', true).limit(1).maybeSingle();
  if (duplicate) return NextResponse.json({ error: 'An active service with that name already exists.' }, { status: 409 });

  const { data: last } = await supabase.from('services').select('display_order').eq('business_id', membership.business_id).order('display_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('services')
    .insert({ business_id: membership.business_id, ...serviceRow(parsed.data), display_order: (last?.display_order ?? -1) + 1 })
    .select(SELECT).single();
  if (error?.code === '23505') return NextResponse.json({ error: 'A service with that name already exists.' }, { status: 409 });
  if (error) {
    console.error('Service create failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to create service.' }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
