import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(''),
  pricingType: z.enum(['fixed', 'range', 'starting_at', 'custom']),
  minimumPrice: z.coerce.number().min(0),
  maximumPrice: z.coerce.number().min(0),
  requiresPhotos: z.boolean().default(false),
  active: z.boolean().default(true),
});

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, businessId: null };
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle();
  return { supabase, businessId: membership?.business_id ?? null };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const { supabase, businessId } = await context();
  if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid service.' }, { status: 400 });
  const { data, error } = await supabase.from('services').update({ name: parsed.data.name, description: parsed.data.description, pricing_type: parsed.data.pricingType, minimum_price: parsed.data.minimumPrice, maximum_price: parsed.data.maximumPrice, requires_photos: parsed.data.requiresPhotos, active: parsed.data.active, updated_at: new Date().toISOString() }).eq('id', serviceId).eq('business_id', businessId).select('*').single();
  if (error) return NextResponse.json({ error: 'Unable to update service.' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const { supabase, businessId } = await context();
  if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const { error } = await supabase.from('services').update({ active: false, updated_at: new Date().toISOString() }).eq('id', serviceId).eq('business_id', businessId);
  if (error) return NextResponse.json({ error: 'Unable to archive service.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
