import Link from 'next/link';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export default async function QuoteIndexPage() {
  let businesses: { name: string; slug: string; description: string | null }[] = [];
  try { const { data } = await createSupabaseAdminClient().from('businesses').select('name,slug,description').order('name'); businesses = data ?? []; } catch { businesses = []; }
  return <main className="auth-page"><div className="auth-panel"><Link className="brand" href="/"><span className="brand-mark">DF</span> detailflow</Link><div className="kicker"><span /> public quote</div><h1>Choose a business.</h1><p className="auth-copy">Select the business you want to request a quote from.</p>{businesses.length === 0 ? <><p className="auth-message">No public quote links are available yet.</p><Link className="button-primary" href="/login">Create a business</Link></> : <div style={{ display: 'grid', gap: 12 }}>{businesses.map((business) => <Link className="button-secondary" href={`/quote/${business.slug}`} key={business.slug}><strong>{business.name}</strong><span>{business.description || 'Request a quote'}</span></Link>)}</div>}</div></main>;
}
