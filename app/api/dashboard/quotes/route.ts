import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const quoteSchema = z.object({ leadId: z.string().uuid(), notes: z.string().max(2000).optional().default(''), expiresAt: z.string().datetime().optional() });
async function context() { const supabase = await createSupabaseServerClient(); const { data: userData } = await supabase.auth.getUser(); if (!userData.user) return { supabase, businessId: null }; const { data: membership } = await supabase.from('business_members').select('business_id').eq('user_id', userData.user.id).maybeSingle(); return { supabase, businessId: membership?.business_id ?? null }; }
export async function GET() {
  const { supabase, businessId } = await context();
  if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const selectWithPayments = 'id,quote_number,status,payment_status,total,expires_at,created_at,lead_id,customers(first_name,last_name),leads(vehicle)';
  const selectBase = 'id,quote_number,status,total,expires_at,created_at,lead_id,customers(first_name,last_name),leads(vehicle)';

  let { data, error } = await supabase
    .from('quotes')
    .select(selectWithPayments)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  // Older databases may not have the Stripe payment columns yet. The quote
  // itself is still valid, so fall back to the original schema instead of
  // returning a generic 500 and making the whole Quotes page disappear.
  if (error) {
    console.error('[quotes] payment-aware query failed:', error.message);
    const fallback = await supabase
      .from('quotes')
      .select(selectBase)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });

    if (fallback.error) {
      console.error('[quotes] fallback query failed:', fallback.error.message);
      return NextResponse.json({ error: 'Unable to load quotes.', details: fallback.error.message }, { status: 500 });
    }

    data = (fallback.data ?? []).map((quote) => ({ ...quote, payment_status: 'unpaid' }));
  }

  return NextResponse.json(data ?? []);
}
export async function POST(request: Request) { const { supabase, businessId } = await context(); if (!businessId) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }); const parsed = quoteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Choose a valid lead.' }, { status: 400 }); const { data: lead } = await supabase.from('leads').select('id,customer_id,service_id,estimate').eq('id', parsed.data.leadId).eq('business_id', businessId).maybeSingle(); if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 }); const estimate = (lead.estimate ?? {}) as { minimum?: number; maximum?: number }; const total = estimate.maximum ?? estimate.minimum ?? 0; const quoteNumber = `Q-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`; const { data, error } = await supabase.from('quotes').insert({ business_id: businessId, lead_id: lead.id, customer_id: lead.customer_id, quote_number: quoteNumber, services: [{ service_id: lead.service_id, amount: total }], subtotal: total, total, status: 'draft', expires_at: parsed.data.expiresAt, notes: parsed.data.notes }).select('*').single(); if (error) return NextResponse.json({ error: 'Unable to create quote.' }, { status: 500 }); await supabase.from('leads').update({ status: 'quoted' }).eq('id', lead.id); return NextResponse.json(data, { status: 201 }); }
