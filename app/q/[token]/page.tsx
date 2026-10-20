'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Mail, Phone, X } from 'lucide-react';

type Data = {
  quote: { quoteNumber: string; subtotal: number; tax: number; total: number; status: string; paymentStatus: string; notes?: string | null; expiresAt?: string | null };
  business: { name: string; email?: string | null; phone?: string | null; currency: string };
  customer: { firstName: string; lastName: string };
  canPayOnline: boolean;
};

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(Number(value));
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'' | 'accept' | 'decline' | 'pay'>('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/public/quote-access/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Unable to load this quote.');
      setData(result as Data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load this quote.');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function act(action: 'accept' | 'decline' | 'pay') {
    if (action === 'decline' && !window.confirm('Decline this quote? The business will be notified in DetailFlow.')) return;
    setBusy(action);
    setNotice('');
    try {
      const response = await fetch(`/api/public/quote-access/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setNotice(result?.error || 'Something went wrong. Please try again.'); return; }
      if (action === 'pay' && result?.url) { window.location.assign(result.url); return; }
      setData(result as Data);
      setNotice(action === 'accept' ? 'Quote accepted.' : 'Quote declined.');
    } catch {
      setNotice('Network error. Please check your connection and try again.');
    } finally {
      setBusy('');
    }
  }

  if (error) return (
    <main className="quote-page"><div className="shell" style={{ maxWidth: 700, paddingTop: 100 }}>
      <span className="mono eyebrow">Secure quote</span>
      <h1 style={{ fontSize: 46 }}>Quote unavailable.</h1>
      <p className="form-intro">{error} If you were expecting a quote, ask the business to send you a new link.</p>
    </div></main>
  );

  if (!data) return (
    <main className="quote-page"><div className="shell" style={{ maxWidth: 700, paddingTop: 100 }} role="status" aria-live="polite">
      <Loader2 className="spin" aria-hidden="true" /><p>Loading secure quote…</p>
    </div></main>
  );

  const { quote, business, customer } = data;
  const paid = quote.paymentStatus === 'paid';
  const paymentHistory = ['refunded', 'partially_refunded', 'disputed'].includes(quote.paymentStatus);
  const canRespond = ['sent', 'viewed'].includes(quote.status);
  const canPay = quote.status === 'accepted' && !paid && !paymentHistory && data.canPayOnline;

  return (
    <main className="quote-page">
      <div className="shell" style={{ maxWidth: 760, paddingTop: 60, paddingBottom: 90 }}>
        <span className="mono eyebrow">Secure quote</span>
        <h1 style={{ fontSize: 'clamp(36px, 8vw, 56px)', marginBottom: 12 }}>{business.name}</h1>
        <p className="form-intro">Quote {quote.quoteNumber}{customer.firstName ? ` for ${customer.firstName} ${customer.lastName}` : ''}</p>

        <div className="empty-state">
          <div className="review-card" style={{ marginTop: 0 }}>
            {quote.tax > 0 && <div><span>Subtotal</span><strong>{money(quote.subtotal, business.currency)}</strong></div>}
            {quote.tax > 0 && <div><span>Tax</span><strong>{money(quote.tax, business.currency)}</strong></div>}
            <div><span>Total</span><strong style={{ fontSize: 22 }}>{money(quote.total, business.currency)}</strong></div>
            <div><span>Status</span><strong style={{ textTransform: 'capitalize' }}>{paid ? 'Paid' : quote.status}</strong></div>
            {quote.expiresAt && <div><span>Valid until</span><strong>{new Date(quote.expiresAt).toLocaleDateString()}</strong></div>}
          </div>
          {quote.notes && <p className="form-intro" style={{ marginTop: 20, whiteSpace: 'pre-wrap' }}>{quote.notes}</p>}

          {notice && <p className="auth-message" role="status" aria-live="polite">{notice}</p>}

          {paid ? (
            <p className="auth-message" role="status"><Check size={15} aria-hidden="true" /> Payment received. Thank you.</p>
          ) : quote.paymentStatus === 'pending' && quote.status === 'accepted' ? (
            <>
              <p className="auth-message">A payment was started for this quote. If you completed it, confirmation can take a moment.</p>
              {canPay && <button className="button-primary" onClick={() => void act('pay')} disabled={busy !== ''}><CreditCard size={16} aria-hidden="true" /> {busy === 'pay' ? 'Opening Stripe…' : 'Continue to payment'}</button>}
            </>
          ) : canRespond ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="button-primary" onClick={() => void act('accept')} disabled={busy !== ''}><Check size={16} aria-hidden="true" /> {busy === 'accept' ? 'Accepting…' : 'Accept quote'}</button>
              <button className="button-secondary" onClick={() => void act('decline')} disabled={busy !== ''}><X size={16} aria-hidden="true" /> {busy === 'decline' ? 'Declining…' : 'Decline'}</button>
            </div>
          ) : canPay ? (
            <button className="button-primary" onClick={() => void act('pay')} disabled={busy !== ''} style={{ marginTop: 16 }}><CreditCard size={16} aria-hidden="true" /> {busy === 'pay' ? 'Opening Stripe…' : 'Pay securely with Stripe'}</button>
          ) : quote.status === 'accepted' ? (
            <p className="auth-message">Quote accepted. {business.name} will contact you about payment.</p>
          ) : quote.status === 'declined' ? (
            <p className="auth-message">This quote was declined.</p>
          ) : quote.status === 'expired' ? (
            <p className="auth-message">This quote has expired. Contact {business.name} for an updated quote.</p>
          ) : (
            <p className="auth-message">This quote is not ready yet.</p>
          )}
        </div>

        {(business.email || business.phone) && (
          <p className="form-intro" style={{ marginTop: 24, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            Questions?
            {business.email && <a className="auth-switch" href={`mailto:${business.email}`}><Mail size={14} aria-hidden="true" /> {business.email}</a>}
            {business.phone && <a className="auth-switch" href={`tel:${business.phone.replace(/[^+\d]/g, '')}`}><Phone size={14} aria-hidden="true" /> {business.phone}</a>}
          </p>
        )}
      </div>
    </main>
  );
}
