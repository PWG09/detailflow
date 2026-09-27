import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const getDashboardContext = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, membership: null, business: null };

  const { data: membership } = await supabase
    .from('business_members')
    .select('business_id,role,businesses(id,name,slug,trial_status,trial_ends_at,plan)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const business = Array.isArray(membership?.businesses)
    ? membership.businesses[0] ?? null
    : membership?.businesses ?? null;

  return { supabase, user, membership, business };
});
