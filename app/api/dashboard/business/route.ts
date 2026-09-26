import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isReservedBusinessSlug, normalizeBusinessSlug } from '@/lib/slug';

const businessSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), email: z.string().email(), phone: z.string().trim().min(7).max(40), description: z.string().trim().min(10).max(500) });

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, businessId: null };
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle();
  return { supabase, businessId: membership?.business_id ?? null };
}

export async function GET() { const { supabase, businessId } = await context(); if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }); const { data, error } = await supabase.from('businesses').select('id,name,slug,email,phone,description,currency,tax_rate').eq('id', businessId).single(); if (error) return NextResponse.json({ error: 'Unable to load business profile.' }, { status: 500 }); return NextResponse.json({ ...data, leadUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app').replace(/\/+$/, '')}/${data.slug}/lead` }); }

export async function PATCH(request: Request) { const { supabase, businessId } = await context(); if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }); const parsed = businessSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid business profile.' }, { status: 400 }); const slug = normalizeBusinessSlug(parsed.data.slug); if (!slug || isReservedBusinessSlug(slug)) return NextResponse.json({ error: 'Choose another public link name.' }, { status: 400 }); const { data, error } = await supabase.from('businesses').update({ ...parsed.data, slug, updated_at: new Date().toISOString() }).eq('id', businessId).select('id,name,slug,email,phone,description,currency,tax_rate').single(); if (error) return NextResponse.json({ error: error.code === '23505' ? 'That public link is already taken.' : 'Unable to save business profile.' }, { status: 500 }); return NextResponse.json({ ...data, leadUrl: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://detailflow-two.vercel.app').replace(/\/+$/, '')}/${data.slug}/lead` }); }
