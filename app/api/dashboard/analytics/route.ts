import { NextResponse } from 'next/server';
import { resolveWorkspace } from '@/lib/workspace';

export async function GET() {
  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, membership } = resolved.workspace;

  const { data: metrics, error } = await supabase
    .from('business_metrics')
    .select('leads_count,quotes_count,won_leads_count')
    .eq('business_id', membership.business_id)
    .maybeSingle();
  if (error) {
    console.error('Analytics query failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to load analytics.' }, { status: 500 });
  }

  const { data: paid, error: paidError } = await supabase
    .from('quotes')
    .select('total')
    .eq('business_id', membership.business_id)
    .eq('payment_status', 'paid')
    .limit(10_000);
  if (paidError) console.error('Paid revenue query failed:', paidError.code, paidError.message);

  const leads = Number(metrics?.leads_count ?? 0);
  const quotes = Number(metrics?.quotes_count ?? 0);
  const won = Number(metrics?.won_leads_count ?? 0);
  const paidRevenue = (paid ?? []).reduce((sum, row) => sum + Math.round(Number(row.total) * 100), 0) / 100;

  return NextResponse.json({
    leads,
    quotes,
    won,
    paidQuotes: paid?.length ?? 0,
    paidRevenue,
    conversionRate: leads ? Math.round((won / leads) * 100) : 0,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
