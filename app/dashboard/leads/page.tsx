'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Search } from 'lucide-react';

type Lead = { id: string; status: string; vehicle: { year?: number; makeModel?: string; type?: string } | null; estimate: { minimum?: number; maximum?: number } | null; created_at: string };

function formatEstimate(estimate: Lead['estimate']) {
  if (estimate?.minimum == null && estimate?.maximum == null) return 'Estimate pending';
  return `$${estimate?.minimum ?? 0}-${estimate?.maximum ?? estimate?.minimum ?? 0}`;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    void fetch('/api/dashboard/leads?limit=50&offset=0', { cache: 'no-store' })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || 'Unable to load your leads.');
        return result as Lead[];
      })
      .then(result => { setLeads(result); setOffset(result.length); setHasMore(result.length === 50); })
      .catch(error => setError(error instanceof Error ? error.message : 'Unable to load your leads.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter(lead => `${lead.vehicle?.year ?? ''} ${lead.vehicle?.makeModel ?? ''} ${lead.vehicle?.type ?? ''} ${lead.status}`.toLowerCase().includes(term));
  }, [leads, query]);

  async function loadMore() {
    const response = await fetch(`/api/dashboard/leads?limit=50&offset=${offset}`, { cache: 'no-store' });
    const result = await response.json().catch(() => []);
    if (!response.ok) return;
    setLeads(current => [...current, ...result]);
    setOffset(current => current + result.length);
    setHasMore(result.length === 50);
  }

  return <section className="dashboard-main leads-page">
    <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15}/> Back to overview</Link>
    <div className="dash-header" style={{marginTop:24}}>
      <div><span className="mono eyebrow">Lead inbox</span><h1>Your leads.</h1><p>Every request, organized and ready for a reply.</p></div>
      <Link className="button-primary" href="/dashboard/settings">Share your lead link <Plus size={15}/></Link>
    </div>
    <div className="leads-toolbar">
      <label className="lead-search"><Search size={15}/><input aria-label="Search leads" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search vehicle or status" /></label>
      <span className="mono lead-count">{filtered.length} {filtered.length === 1 ? 'lead' : 'leads'}</span>
    </div>
    {error ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><h2>{error}</h2><p>Refresh the page or check your workspace connection.</p></div>
      : loading ? <div className="empty-state"><p>Loading your lead inbox…</p></div>
      : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22}/></div><h2>{query ? 'No matching leads.' : 'No leads yet.'}</h2><p>{query ? 'Try another vehicle, status, or customer search.' : 'When a customer submits your public lead form, their request will appear here.'}</p>{!query&&<Link className="button-primary" href="/dashboard/settings">Share your lead link <Plus size={15}/></Link>}</div>
      : <div className="lead-list">{filtered.map(lead => <Link className="lead-card" href={`/dashboard/leads/${lead.id}`} key={lead.id}><div><strong>{lead.vehicle?.year ?? 'Vehicle'} {lead.vehicle?.makeModel ?? 'details'}</strong><span>{lead.vehicle?.type ?? 'Vehicle'} · {new Date(lead.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div><div className="lead-card-right"><b>{formatEstimate(lead.estimate)}</b><small>{lead.status}</small></div></Link>)}</div>}
    {!loading && !error && hasMore && <div className="load-more"><button className="button-secondary" type="button" onClick={()=>void loadMore()}>Load more</button></div>}
  </section>;
}
