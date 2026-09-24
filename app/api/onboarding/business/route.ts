import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const businessSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  email: z.string().email(),
  phone: z.string().trim().min(7).max(40),
  description: z.string().trim().min(10).max(500),
  firstServiceName: z.string().trim().min(2).max(120),
  firstServiceMinimum: z.coerce.number().min(0),
  firstServiceMaximum: z.coerce.number().min(0),
}).refine((value) => value.firstServiceMaximum >= value.firstServiceMinimum, { message: 'The maximum service price must be greater than or equal to the minimum.' });

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    const parsed = businessSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Use a valid business name and public link.' }, { status: 400 });
    const { data: existing } = await supabase.from('businesses').select('id, slug').eq('owner_id', user.id).limit(1).maybeSingle();
    if (existing) return NextResponse.json(existing, { status: 200 });
    const { data, error } = await supabase.from('businesses').insert({ owner_id: user.id, name: parsed.data.name, slug: parsed.data.slug, email: parsed.data.email, phone: parsed.data.phone, description: parsed.data.description }).select('id, slug').single();
    if (error?.code === '23505') return NextResponse.json({ error: 'That public link is already taken.' }, { status: 409 });
    if (error) { console.error('Business creation failed', error.message); return NextResponse.json({ error: `Unable to create the workspace (${error.code || 'database'}).` }, { status: 500 }); }
    const { error: serviceError } = await supabase.from('services').insert({ business_id: data.id, name: parsed.data.firstServiceName, pricing_type: 'range', minimum_price: parsed.data.firstServiceMinimum, maximum_price: parsed.data.firstServiceMaximum, display_order: 0 });
    if (serviceError) return NextResponse.json({ error: 'Business created, but the first service could not be saved. Add it from Services.' }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Business onboarding failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Unable to create the workspace. Check that the Supabase migration is applied.' }, { status: 500 });
  }
}
