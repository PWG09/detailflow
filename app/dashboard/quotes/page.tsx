'use client';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CarFront, Copy, CreditCard, Plus } from 'lucide-react';

type Quote = {
  id: string; quote_number: string; status: string; payment_status: string | null; subtotal?: number; tax?: number; total: number; created_at: string;
  customers?: { first_name?: string; last_name?: string } | null;
};
type Lead = {
  id: string; status: string;
  vehicle: { year?: number | string; makeModel?: string } | null;
  estimate: { minimum?: number; maximum?: number; currency?: string } | null;
  customers?: { first_name?: string; last_name?: string } | null;
};
type Page<T> = { data: T[]; nextCursor: string | null; hasMore: boolean };

const STATUS_OPTIONS = [['draft', 'Draft'], ['sent', 'Sent'], ['viewed', 'Viewed'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired']] as const;
const LOCKED_PAYMENTS = new Set(['pending', 'paid', 'refunded', 'partially_refunded', 'disputed']);

function formatAmount(value: number | undefined | null, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value ?? 0));
  } catch {
    return `$${Number(value ?? 0).toFixed(2)}`;
  }
}

function leadLabel(lead: Lead) {
  const name = [lead.customers?.first_name, lead.customers?.last_name].filter(Boolean).join(' ');
  const vehicle = `${lead.vehicle?.year ?? ''} ${lead.vehicle?.makeModel ?? 'Vehicle request'}`.trim();
  return name ? `${name} — ${vehicle}` : vehicle;
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const money = (value: number | undefined | null) => formatAmount(value, currency);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === leadId) ?? null, [leads, leadId]);
  const minimum = selectedLead?.estimate?.minimum;
  const maximum = selectedLead?.estimate?.maximum;

  const choose = useCallback((next: string, source: Lead[]) => {
    setLeadId(next);
    const lead = source.find((item) => item.id === next);
    const suggested = lead?.estimate?.maximum ?? lead?.estimate?.minimum;
    setPrice(suggested != null ? String(suggested) : '');
  }, []);

  async function loadQuotes(nextCursor: string | null = null, append = false) {
    const params = new URLSearchParams({ limit: '50' });
    if (nextCursor) params.set('cursor', nextCursor);
    const response = await fetch(`/api/dashboard/quotes?${params}`, { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'Unable to load quotes.');
    const page = result as Page<Quote>;
    setQuotes((current) => append ? [...current, ...page.data] : page.data);
    setCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, leadResponse, businessResponse] = await Promise.all([
          loadQuotes(),
          fetch('/api/dashboard/leads?limit=100', { cache: 'no-store' }),
          fetch('/api/dashboard/business', { cache: 'no-store' }),
        ]);
        const businessResult = await businessResponse.json().catch(() => null);
        if (businessResponse.ok && typeof businessResult?.currency === 'string' && !cancelled) setCurrency(businessResult.currency.toUpperCase());
        const leadResult = await leadResponse.json().catch(() => null);
        if (!leadResponse.ok) throw new Error(leadResult?.error || 'Unable to load leads.');
        const open = (leadResult as Page<Lead>).data.filter((lead) => !['lost', 'archived'].includes(lead.status));
        if (cancelled) return;
        setLeads(open);
        const requested = new URLSearchParams(window.location.search).get('leadId');
        if (requested && open.some((lead) => lead.id === requested)) choose(requested, open);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to load quotes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [choose]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Enter a price greater than zero.'); return; }
    if (minimum != null && amount < minimum) { setMessage(`The price cannot be below the service minimum (${money(minimum)}).`); return; }
    if (maximum != null && maximum > 0 && amount > maximum) { setMessage(`The price cannot be above the service maximum (${money(maximum)}).`); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/dashboard/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, amount, notes }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setMessage(result?.error ?? 'Unable to create quote.'); return; }
      setMessage(`Draft ${result.quote_number} created. Share the secure link to send it.`);
      setLeadId(''); setPrice(''); setNotes('');
      await loadQuotes();
    } catch {
      setMessage('Network error. The quote was not created.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setRowBusy(id);
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard/quotes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) setMessage(result?.error ?? 'Unable to update the quote.');
      await loadQuotes();
    } catch {
      setMessage('Network error. The quote was not updated.');
    } finally {
      setRowBusy(null);
    }
  }

  async function shareQuote(id: string) {
    setRowBusy(id);
    setMessage('');
    try {
      const response = await fetch(`/api/dashboard/quotes/${id}/share`, { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.url) { setMessage(result?.error ?? 'Unable to create quote link.'); return; }
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage('Secure quote link copied. Sharing again creates a new link and disables the old one.');
      } catch {
        setMessage(`Secure quote link: ${result.url}`);
      }
      await loadQuotes();
    } finally {
      setRowBusy(null);
    }
  }

  async function startPayment(id: string) {
    setRowBusy(id);
    setMessage('Opening secure Stripe checkout…');
    try {
      const response = await fetch(`/api/dashboard/quotes/${id}/checkout`, { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.url) { window.location.assign(result.url); return; }
      setMessage(result?.error ?? 'Unable to start payment.');
    } catch {
      setMessage('Network error. Payment was not started.');
    } finally {
      setRowBusy(null);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try { await loadQuotes(cursor, true); } catch { setMessage('Unable to load more quotes.'); } finally { setLoadingMore(false); }
  }

  return (
    <section className="dashboard-main">
      <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to overview</Link>
      <div className="dash-header" style={{ marginTop: 34 }}>
        <div><span className="mono eyebrow">Revenue</span><h1>Quotes</h1><p>Create a draft from a lead, share the secure link, and the customer can accept and pay online.</p></div>
      </div>

      <form className="empty-state" onSubmit={create}>
        <h2>Create a draft quote</h2>
        <div className="field">
          <label htmlFor="quoteLead">Lead</label>
          <select id="quoteLead" value={leadId} onChange={(event) => { choose(event.target.value, leads); setMessage(''); }} required>
            <option value="">{leads.length ? 'Choose a lead' : 'No open leads yet'}</option>
            {leads.map((lead) => <option value={lead.id} key={lead.id}>{leadLabel(lead)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="quotePrice">Price to charge (before tax)</label>
          <input id="quotePrice" type="number" inputMode="decimal" min={minimum ?? 0.01} max={maximum && maximum > 0 ? maximum : undefined} step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required disabled={!leadId} />
          {leadId && (minimum != null || maximum != null) && <small className="field-help">Service range: {money(minimum ?? 0)} – {money(maximum ?? minimum ?? 0)}. Tax from your business settings is added automatically.</small>}
        </div>
        <div className="field">
          <label htmlFor="quoteNotes">Notes for the customer</label>
          <textarea id="quoteNotes" rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {message && <p role="status" aria-live="polite" className="auth-message">{message}</p>}
        <button className="button-primary" type="submit" disabled={busy || !leadId}><Plus size={15} /> {busy ? 'Creating…' : 'Create draft'}</button>
      </form>

      {loading ? (
        <div className="loading-skeleton-list" aria-label="Loading quotes"><div /><div /><div /><div /></div>
      ) : quotes.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><CarFront size={22} /></div><h2>No quotes yet.</h2><p>Create a draft from a lead to begin the quote lifecycle.</p></div>
      ) : (
        <div className="lead-list">
          {quotes.map((quote) => {
            const locked = LOCKED_PAYMENTS.has(quote.payment_status ?? 'unpaid');
            const customer = quote.customers ? `${quote.customers.first_name ?? ''} ${quote.customers.last_name ?? ''}`.trim() : '';
            return (
              <div className="lead-card" key={quote.id}>
                <div>
                  <strong>{quote.quote_number}</strong>
                  <span>{customer || 'Customer'} · {money(quote.total)}{quote.tax ? ` (incl. ${money(quote.tax)} tax)` : ''}</span>
                  <small>Payment: {(quote.payment_status ?? 'unpaid').replace('_', ' ')}</small>
                </div>
                <div className="lead-card-right">
                  <select aria-label={`Status for ${quote.quote_number}`} value={quote.status} onChange={(event) => void updateStatus(quote.id, event.target.value)} disabled={locked || rowBusy === quote.id}>
                    {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  {!['declined', 'expired'].includes(quote.status) && !locked && (
                    <button className="button-secondary" type="button" onClick={() => void shareQuote(quote.id)} disabled={rowBusy === quote.id}><Copy size={14} /> Share secure link</button>
                  )}
                  {quote.status === 'accepted' && !['paid', 'refunded', 'partially_refunded', 'disputed'].includes(quote.payment_status ?? '') && (
                    <button className="button-secondary" type="button" onClick={() => void startPayment(quote.id)} disabled={rowBusy === quote.id}><CreditCard size={14} /> Take payment</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && hasMore && <div className="load-more"><button className="button-secondary" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more quotes'}</button></div>}
    </section>
  );
}
