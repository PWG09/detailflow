import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function QuoteIndexPage() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.from('businesses').select('slug').order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (data?.slug) {
      redirect(`/quote/${data.slug}`);
    }
  } catch {
    // Fall through to onboarding when the business catalog is unavailable.
  }

  redirect('/onboarding');
}
