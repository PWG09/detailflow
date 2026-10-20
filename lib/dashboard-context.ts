import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pickPrimaryMembership, type MembershipRow } from '@/lib/membership-selection';

type DashboardBusiness = { id: string; name: string; slug: string; trial_status: string | null; trial_ends_at: string | null; plan: string | null; currency: string | null };

export const getDashboardContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null, business: null };

  const { data: rows } = await supabase
    .from('business_members')
    .select('business_id,role,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(20);
  const membership = pickPrimaryMembership((rows ?? []) as MembershipRow[]);
  if (!membership) return { supabase, user, membership: null, business: null };

  const { data: business } = await supabase
    .from('businesses')
    .select('id,name,slug,trial_status,trial_ends_at,plan,currency')
    .eq('id', membership.business_id)
    .maybeSingle();

  return { supabase, user, membership, business: (business as DashboardBusiness | null) ?? null };
});
