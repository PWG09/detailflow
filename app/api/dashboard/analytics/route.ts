import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const { data: metrics, error } = await supabase
    .from('business_metrics')
    .select('leads_count,quotes_count,won_leads_count')
    .eq('business_id', membership.business_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to load analytics.' }, { status: 500 });

  const leads = Number(metrics?.leads_count ?? 0);
  const quotes = Number(metrics?.quotes_count ?? 0);
  const won = Number(metrics?.won_leads_count ?? 0);

  return NextResponse.json({
    leads,
    quotes,
    won,
    conversionRate: leads ? Math.round((won / leads) * 100) : 0,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
