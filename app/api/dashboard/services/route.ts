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
}).refine((value) => value.maximumPrice >= value.minimumPrice, { message: 'Maximum price must be greater than or equal to minimum price.' });

async function getBusinessId() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, userId: null, businessId: null };
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle();
  return { supabase, userId: userData.user.id, businessId: membership?.business_id ?? null };
}

export async function GET() {
  const { supabase, userId, businessId } = await getBusinessId();
  if (!userId || !businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const { data, error } = await supabase.from('services').select('*').eq('business_id', businessId).order('display_order').order('created_at');
  if (error) return NextResponse.json({ error: 'Unable to load services.' }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { supabase, userId, businessId } = await getBusinessId();
  if (!userId || !businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const parsed = serviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid service.' }, { status: 400 });
  const { data: last } = await supabase.from('services').select('display_order').eq('business_id', businessId).order('display_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('services').insert({ business_id: businessId, name: parsed.data.name, description: parsed.data.description, pricing_type: parsed.data.pricingType, minimum_price: parsed.data.minimumPrice, maximum_price: parsed.data.maximumPrice, requires_photos: parsed.data.requiresPhotos, display_order: (last?.display_order ?? -1) + 1 }).select('*').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'A service with that name already exists.' : 'Unable to create service.' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
