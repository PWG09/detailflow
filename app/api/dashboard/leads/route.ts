import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';
import { cursorFilter, decodeCursor, encodeCursor, escapeLike, pageSize, sanitizeSearchTerm } from '@/lib/keyset-pagination';

const STATUSES = new Set(['new', 'contacted', 'quoted', 'won', 'lost', 'archived']);

export async function GET(request: Request) {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const url = new URL(request.url);
  const limit = pageSize(request, 50, 100);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const query = sanitizeSearchTerm(url.searchParams.get('q')).toLowerCase();
  const status = url.searchParams.get('status');

  let requestQuery = supabase
    .from('leads')
    .select('id,status,vehicle,estimate,created_at,customer_id,customers(first_name,last_name)')
    .eq('business_id', membership.business_id);

  if (status && STATUSES.has(status)) requestQuery = requestQuery.eq('status', status);
  if (query) requestQuery = requestQuery.ilike('search_text', `%${escapeLike(query)}%`);
  if (cursor) requestQuery = requestQuery.or(cursorFilter('created_at', cursor));

  const { data, error } = await requestQuery
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) {
    console.error('Lead list query failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to load leads.' }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ value: last.created_at, id: last.id }) : null;

  return NextResponse.json(
    { data: page, nextCursor, hasMore },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
