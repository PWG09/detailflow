import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const updateSchema = z.object({ status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost', 'archived']), notes: z.string().max(2000).optional() });
export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params; const supabase = await createSupabaseServerClient(); const { data: userData } = await supabase.auth.getUser(); if (!userData.user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid lead update.' }, { status: 400 });
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle(); if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const { data, error } = await supabase.from('leads').update({ status: parsed.data.status, notes: parsed.data.notes, updated_at: new Date().toISOString() }).eq('id', leadId).eq('business_id', membership.business_id).select('id,status,notes').single(); if (error) return NextResponse.json({ error: 'Unable to update lead.' }, { status: 500 }); return NextResponse.json(data);
}
