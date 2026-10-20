import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspace } from '@/lib/workspace';
import { cursorFilter, decodeCursor, encodeCursor, pageSize } from '@/lib/keyset-pagination';
import { calculateQuoteTotals, validateQuoteAmount } from '@/lib/quote-math';
import { writeAudit } from '@/lib/audit';

const quoteSchema = z.object({
  leadId: z.string().uuid(),
  amount: z.coerce.number().finite(),
  notes: z.string().trim().max(2000).optional().default(''),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

const LIST_SELECT = 'id,quote_number,status,payment_status,subtotal,tax,total,expires_at,created_at,lead_id,customer_id,customers(first_name,last_name),leads(vehicle)';

export async function GET(request: Request) {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const url = new URL(request.url);
  const limit = pageSize(request);
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  let query = supabase.from('quotes').select(LIST_SELECT).eq('business_id', membership.business_id);
  if (cursor) query = query.or(cursorFilter('created_at', cursor));
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (error) {
    console.error('Quote list query failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to load quotes.' }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string }>;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ value: last.created_at, id: last.id }) : null;
  return NextResponse.json({ data: page, nextCursor, hasMore }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;
  const businessId = membership.business_id;

  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid lead and quote price.' }, { status: 400 });

  if (parsed.data.expiresAt && new Date(parsed.data.expiresAt).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'The expiry date must be in the future.' }, { status: 400 });
  }

  const [{ data: lead, error: leadError }, { data: business, error: businessError }] = await Promise.all([
    supabase.from('leads').select('id,customer_id,service_id,estimate,status').eq('id', parsed.data.leadId).eq('business_id', businessId).maybeSingle(),
    supabase.from('businesses').select('id,tax_rate,currency').eq('id', businessId).single(),
  ]);
  if (leadError || businessError || !business) {
    console.error('Quote creation lookup failed:', leadError?.message ?? businessError?.message);
    return NextResponse.json({ error: 'Unable to create quote.' }, { status: 500 });
  }
  if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
  if (['lost', 'archived'].includes(lead.status)) return NextResponse.json({ error: 'Reopen this lead before quoting it.' }, { status: 409 });

  const amountCheck = validateQuoteAmount(parsed.data.amount, (lead.estimate ?? {}) as { minimum?: unknown; maximum?: unknown });
  if (!amountCheck.ok) return NextResponse.json({ error: amountCheck.reason }, { status: 400 });

  let totals: ReturnType<typeof calculateQuoteTotals>;
  try {
    totals = calculateQuoteTotals(parsed.data.amount, Number(business.tax_rate ?? 0));
  } catch {
    return NextResponse.json({ error: 'The business tax configuration is invalid.' }, { status: 400 });
  }

  const quoteNumber = `Q-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await supabase.from('quotes').insert({
    business_id: businessId,
    lead_id: lead.id,
    customer_id: lead.customer_id,
    quote_number: quoteNumber,
    services: [{ service_id: lead.service_id, amount: totals.subtotal }],
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    status: 'draft',
    expires_at: parsed.data.expiresAt ?? null,
    notes: parsed.data.notes,
  }).select('id,quote_number,status,payment_status,subtotal,tax,total,expires_at,created_at,lead_id,customer_id').single();
  if (error) {
    console.error('Quote insert failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to create quote.' }, { status: 500 });
  }

  if (['new', 'contacted'].includes(lead.status)) {
    const now = new Date().toISOString();
    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update({ status: 'quoted', quoted_at: now, updated_at: now })
      .eq('id', lead.id)
      .eq('business_id', businessId);
    if (leadUpdateError) console.error('Lead status update after quote failed:', leadUpdateError.code, leadUpdateError.message);
  }

  await writeAudit(businessId, user.id, 'quote.created', 'quote', data.id, { total: totals.total });
  return NextResponse.json(data, { status: 201 });
}
