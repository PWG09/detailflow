import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function pagination(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') || 50);
  const rawOffset = Number(url.searchParams.get('offset') || 0);
  return { limit: Math.min(100, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50)), offset: Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0) };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const { limit, offset } = pagination(request);
  const { data, error } = await supabase.from('leads')
    .select('id,status,vehicle,estimate,created_at')
    .eq('business_id', membership.business_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: 'Unable to load leads.' }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}
