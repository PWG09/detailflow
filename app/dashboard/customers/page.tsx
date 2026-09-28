'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Search, Users } from 'lucide-react';

type Customer = { id: string; first_name: string; last_name: string; email: string; phone: string | null; notes: string | null; updated_at: string };
type CustomerResponse = { data: Customer[]; nextCursor: string | null; hasMore: boolean };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  async function load(search: string, cursor: string | null, append: boolean) {
    const params = new URLSearchParams({ limit: '50' });
    if (search.trim()) params.set('q', search.trim());
    if (cursor) params.set('cursor', cursor);
    const response = await fetch('/api/dashboard/customers?' + params.toString(), { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Unable to load customers.');
    const page = result as CustomerResponse;
    setCustomers(current => append ? [...current, ...page.data] : page.data);
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { setLoading(true); setError(''); if (!cancelled) await load(query, null, false); }
      catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load customers.'); }
      finally { if (!cancelled) setLoading(false); }
    }, query ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { await load(query, nextCursor, true); }
    catch { setError('Unable to load more customers.'); }
    finally { setLoadingMore(false); }
  }

  return <section className="dashboard-main customers-page">
    <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to overview</Link>
    <div className="dash-header" style={{ marginTop: 34 }}><div><span className="mono eyebrow">Relationships</span><h1>Customers</h1><p>Open any customer to see their full request history and repeat activity.</p></div></div>
    <div className="leads-toolbar"><label className="lead-search"><Search size={15} /><input aria-label="Search customers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email" /></label><span className="mono lead-count">{customers.length} loaded</span></div>
    {error ? <div className="empty-state"><h2>{error}</h2><p>Refresh the page or check your workspace connection.</p></div>
      : loading ? <div className="loading-skeleton-list" aria-label="Loading customers"><div /><div /><div /><div /></div>
      : customers.length === 0 ? <div className="empty-state"><div className="empty-icon"><Users size={22} /></div><h2>{query ? 'No matching customers.' : 'No customers yet.'}</h2><p>{query ? 'Try another name or email.' : 'Customers will appear automatically when they submit the public quote form.'}</p></div>
      : <div className="lead-list customer-list">{customers.map(customer => <Link className="lead-card customer-card" href={'/dashboard/customers/' + customer.id} key={customer.id}><div className="customer-card-main"><div className="customer-card-avatar" aria-hidden="true">{((customer.first_name?.[0] ?? '') + (customer.last_name?.[0] ?? '')).toUpperCase() || 'C'}</div><div><strong>{customer.first_name} {customer.last_name}</strong><span>{customer.email}{customer.phone ? ' · ' + customer.phone : ''}</span></div></div><div className="customer-card-action"><small>Updated {new Date(customer.updated_at).toLocaleDateString()}</small><span>View profile <ArrowRight size={14} /></span></div></Link>)}</div>}
    {!loading && !error && hasMore && <div className="load-more"><button className="button-secondary" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
  </section>;
}
