import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decodeCursor, encodeCursor, escapeLike, pageSize } from '@/lib/keyset-pagination';

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const url = new URL(request.url);
  const limit = pageSize(request, 50, 100);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const query = url.searchParams.get('q')?.trim().slice(0, 80) || '';

  let requestQuery = supabase
    .from('leads')
    .select('id,status,vehicle,estimate,created_at')
    .eq('business_id', membership.business_id);

  if (query) requestQuery = requestQuery.ilike('search_text', `%${escapeLike(query)}%`);
  if (cursor) {
    requestQuery = requestQuery.or(
      `created_at.lt.${cursor.value},and(created_at.eq.${cursor.value},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await requestQuery
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) return NextResponse.json({ error: 'Unable to load leads.' }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ value: last.created_at, id: last.id }) : null;

  return NextResponse.json(
    { data: page, nextCursor, hasMore },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
