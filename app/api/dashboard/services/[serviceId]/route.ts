import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';
import { isUuid } from '@/lib/keyset-pagination';
import { serviceRow, serviceSchema } from '@/lib/validation/service';

const SELECT = 'id,name,description,pricing_type,minimum_price,maximum_price,active,requires_photos,display_order,created_at,updated_at';

export async function PATCH(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  if (!isUuid(serviceId)) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid service.' }, { status: 400 });

  const { data: duplicate } = await supabase.from('services').select('id').eq('business_id', membership.business_id).eq('name', parsed.data.name).eq('active', true).neq('id', serviceId).limit(1).maybeSingle();
  if (duplicate) return NextResponse.json({ error: 'An active service with that name already exists.' }, { status: 409 });

  const { data, error } = await supabase.from('services')
    .update({ ...serviceRow(parsed.data), updated_at: new Date().toISOString() })
    .eq('id', serviceId).eq('business_id', membership.business_id)
    .select(SELECT).maybeSingle();
  if (error) {
    console.error('Service update failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to update service.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  if (!isUuid(serviceId)) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  // Archive rather than delete: existing leads and quotes keep their service reference.
  const { data, error } = await supabase.from('services')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', serviceId).eq('business_id', membership.business_id)
    .select('id').maybeSingle();
  if (error) {
    console.error('Service archive failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to archive service.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
