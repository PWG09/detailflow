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
  const limit = pageSize(request);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const query = url.searchParams.get('q')?.trim().slice(0, 80) || '';

  let requestQuery = supabase
    .from('customers')
    .select('id,first_name,last_name,email,phone,notes,created_at,updated_at')
    .eq('business_id', membership.business_id);

  if (query) {
    const pattern = `%${escapeLike(query.toLowerCase())}%`;
    requestQuery = requestQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
    );
  }
  if (cursor) {
    requestQuery = requestQuery.or(
      `updated_at.lt.${cursor.value},and(updated_at.eq.${cursor.value},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await requestQuery
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) return NextResponse.json({ error: 'Unable to load customers.' }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ value: last.updated_at, id: last.id }) : null;

  return NextResponse.json(
    { data: page, nextCursor, hasMore },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
