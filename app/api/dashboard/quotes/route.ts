import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decodeCursor, encodeCursor, pageSize } from '@/lib/keyset-pagination';

const quoteSchema = z.object({ leadId: z.string().uuid(), notes: z.string().max(2000).optional().default(''), expiresAt: z.string().datetime().optional() });

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, businessId: null };
  const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).limit(1).maybeSingle();
  return { supabase, businessId: membership?.business_id ?? null };
}

export async function GET(request: Request) {
  const { supabase, businessId } = await context();
  if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const url = new URL(request.url);
  const limit = pageSize(request);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const selectWithPayments = 'id,quote_number,status,payment_status,total,expires_at,created_at,lead_id,customers(first_name,last_name),leads(vehicle)';
  const selectBase = 'id,quote_number,status,total,expires_at,created_at,lead_id,customers(first_name,last_name),leads(vehicle)';

  async function run(select: string) {
    let q = supabase
      .from('quotes')
      .select(select)
      .eq('business_id', businessId);

    if (cursor) {
      q = q.or(
        `created_at.lt.${cursor.value},and(created_at.eq.${cursor.value},id.lt.${cursor.id})`
      );
    }

    return q.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
  }

  let { data, error } = await run(selectWithPayments);
  if (error) {
    console.error('[quotes] payment-aware query failed:', error.message);
    const fallback = await run(selectBase);
    if (fallback.error) return NextResponse.json({ error: 'Unable to load quotes.' }, { status: 500 });

    const fallbackRows = Array.isArray(fallback.data)
      ? fallback.data.map((quote) => ({
          ...quote,
          payment_status: 'unpaid',
        }))
      : [];

    data = fallbackRows as typeof data;
  }

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

export async function POST(request: Request) {
  const { supabase, businessId } = await context();
  if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid lead.' }, { status: 400 });

  const { data: lead } = await supabase
    .from('leads')
    .select('id,customer_id,service_id,estimate')
    .eq('id', parsed.data.leadId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const estimate = (lead.estimate ?? {}) as { minimum?: number; maximum?: number };
  const total = estimate.maximum ?? estimate.minimum ?? 0;
  const quoteNumber = `Q-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      business_id: businessId,
      lead_id: lead.id,
      customer_id: lead.customer_id,
      quote_number: quoteNumber,
      services: [{ service_id: lead.service_id, amount: total }],
      subtotal: total,
      total,
      status: 'draft',
      expires_at: parsed.data.expiresAt,
      notes: parsed.data.notes,
    })
    .select('id,quote_number,status,payment_status,total,expires_at,created_at,lead_id,customer_id')
    .single();

  if (error) return NextResponse.json({ error: 'Unable to create quote.' }, { status: 500 });
  await supabase.from('leads').update({ status: 'quoted' }).eq('id', lead.id).eq('business_id', businessId);
  return NextResponse.json(data, { status: 201 });
}
