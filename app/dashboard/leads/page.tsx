'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Search } from 'lucide-react';

type Lead = { id: string; status: string; vehicle: { year?: number; makeModel?: string; type?: string } | null; estimate: { minimum?: number; maximum?: number } | null; created_at: string };
type LeadResponse = { data: Lead[]; nextCursor: string | null; hasMore: boolean };

function formatEstimate(estimate: Lead['estimate']) {
  if (estimate?.minimum == null && estimate?.maximum == null) return 'Estimate pending';
  return '$' + (estimate?.minimum ?? 0) + '-' + (estimate?.maximum ?? estimate?.minimum ?? 0);
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
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
    const response = await fetch('/api/dashboard/leads?' + params.toString(), { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Unable to load your leads.');
    const page = result as LeadResponse;
    setLeads(current => append ? [...current, ...page.data] : page.data);
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { setLoading(true); setError(''); if (!cancelled) await load(query, null, false); }
      catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load your leads.'); }
      finally { if (!cancelled) setLoading(false); }
    }, query ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try { await load(query, nextCursor, true); } catch { setError('Unable to load more leads.'); } finally { setLoadingMore(false); }
  }

  return <section className="dashboard-main leads-page">
    <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15}/> Back to overview</Link>
    <div className="dash-header" style={{marginTop:24}}><div><span className="mono eyebrow">Lead inbox</span><h1>Your leads.</h1><p>Every request, organized and ready for a reply.</p></div><Link className="button-primary" href="/dashboard/settings">Share your lead link <Plus size={15}/></Link></div>
    <div className="leads-toolbar"><label className="lead-search"><Search size={15}/><input aria-label="Search leads" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search vehicle or status" /></label><span className="mono lead-count">{leads.length} loaded</span></div>
    {error ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><h2>{error}</h2><p>Refresh the page or check your workspace connection.</p></div>
      : loading ? <div className="loading-skeleton-list" aria-label="Loading leads"><div/><div/><div/><div/></div>
      : leads.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><h2>{query ? 'No matching leads.' : 'No leads yet.'}</h2><p>{query ? 'Try another vehicle, status, or customer search.' : 'When a customer submits your public lead form, their request will appear here.'}</p>{!query&&<Link className="button-primary" href="/dashboard/settings">Share your lead link <Plus size={15}/></Link>}</div>
      : <div className="lead-list">{leads.map(lead => <Link className="lead-card" href={'/dashboard/leads/' + lead.id} key={lead.id}><div><strong>{lead.vehicle?.year ?? 'Vehicle'} {lead.vehicle?.makeModel ?? 'details'}</strong><span>{lead.vehicle?.type ?? 'Vehicle'} · {new Date(lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div><div className="lead-card-right"><b>{formatEstimate(lead.estimate)}</b><small>{lead.status}</small></div></Link>)}</div>}
    {!loading && !error && hasMore && <div className="load-more"><button className="button-secondary" type="button" onClick={()=>void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button></div>}
  </section>;
}