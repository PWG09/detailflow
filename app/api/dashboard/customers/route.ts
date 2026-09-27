import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const url = new URL(request.url);
  const rawOffset = Number(url.searchParams.get('offset') || 0);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  const { data, error } = await supabase.from('customers')
    .select('id,first_name,last_name,email,phone,notes,created_at,updated_at')
    .eq('business_id', membership.business_id)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: 'Unable to load customers.' }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}
