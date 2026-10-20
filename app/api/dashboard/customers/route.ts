import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';
import { cursorFilter, decodeCursor, encodeCursor, escapeLike, pageSize, sanitizeSearchTerm } from '@/lib/keyset-pagination';

export async function GET(request: Request) {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const url = new URL(request.url);
  const limit = pageSize(request);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const query = sanitizeSearchTerm(url.searchParams.get('q'));

  let requestQuery = supabase
    .from('customers')
    .select('id,first_name,last_name,email,phone,notes,created_at,updated_at')
    .eq('business_id', membership.business_id);

  if (query) {
    const pattern = `%${escapeLike(query.toLowerCase())}%`;
    requestQuery = requestQuery.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`,
    );
  }
  if (cursor) requestQuery = requestQuery.or(cursorFilter('updated_at', cursor));

  const { data, error } = await requestQuery
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) {
    console.error('Customer list query failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to load customers.' }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ value: last.updated_at, id: last.id }) : null;

  return NextResponse.json(
    { data: page, nextCursor, hasMore },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
