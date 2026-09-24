import { redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function QuoteIndexPage() {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from('businesses').select('slug').order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (data?.slug) {
      redirect(`/quote/${data.slug}`);
    }
  } catch {
    // Keep public quote routes safe and avoid redirect loops.
  }

  return (
    <main className="auth-page">
      <div className="auth-panel">
        <a className="brand" href="/"><span className="brand-mark">DF</span> detailflow</a>
        <div className="kicker"><span /> public quote</div>
        <h1>No public quote is available yet.</h1>
        <p className="auth-copy">This page is for customers. Create a business first or come back when a public quote link is live.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <a className="button-primary" href="/login">I have a business</a>
          <a className="button-secondary" href="/">Back home</a>
        </div>
      </div>
    </main>
  );
}
