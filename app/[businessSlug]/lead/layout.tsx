import type { Metadata } from 'next';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function generateMetadata({ params }: { params: Promise<{ businessSlug: string }> }): Promise<Metadata> {
  const { businessSlug } = await params;
  try {
    const { data: business } = await createSupabaseAdminClient()
      .from('businesses')
      .select('name,description')
      .eq('slug', businessSlug)
      .maybeSingle();
    if (!business) return { title: 'Business lead form | DetailFlow', robots: { index: false, follow: false } };
    return {
      title: `Contact ${business.name} | DetailFlow`,
      description: business.description || `Send a vehicle service request directly to ${business.name}.`,
      robots: { index: false, follow: false },
      openGraph: { title: `Contact ${business.name}`, description: business.description || `Send a vehicle service request directly to ${business.name}.`, type: 'website' },
    };
  } catch {
    return { title: 'Business lead form | DetailFlow', robots: { index: false, follow: false } };
  }
}

export default function BusinessLeadLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
