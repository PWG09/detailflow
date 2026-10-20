import Link from 'next/link';
import { ArrowLeft, ClipboardList, FileText, Mail, Phone } from 'lucide-react';
import { getDashboardContext } from '@/lib/dashboard-context';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/keyset-pagination';
import { isLeadPhotoPath } from '@/lib/uploads';
import { formatMoney } from '@/lib/quote-math';
import LeadActions from './LeadActions';
import AiAssessmentButton from './AiAssessmentButton';

type AiAssessment = {
  severity?: string;
  paintCondition?: string;
  interiorCondition?: string;
  notes?: string;
  recommendedChecks?: string[];
  confidence?: number;
} | null;

type LeadRow = {
  id: string;
  status: string;
  notes: string | null;
  vehicle: { year?: number; makeModel?: string; type?: string } | null;
  condition: { notes?: string } | null;
  estimate: { minimum?: number; maximum?: number; currency?: string } | null;
  photo_paths: string[] | null;
  ai_assessment: unknown;
  created_at: string;
  customer_id: string | null;
  customers: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | { id: string; first_name: string; last_name: string; email: string; phone: string | null }[] | null;
  services: { name: string } | { name: string }[] | null;
};

type QuoteRow = { id: string; quote_number: string; status: string; payment_status: string | null; total: number; created_at: string };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safeObject<T extends object>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function NotFound() {
  return (
    <section className="dashboard-main">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to dashboard</Link>
        <Link href="/dashboard/leads" className="button-secondary"><ArrowLeft size={15} /> Back to leads</Link>
      </div>
      <div className="empty-state" style={{ marginTop: 24 }}>
        <div className="empty-icon"><ClipboardList size={22} /></div>
        <h2>Lead not found.</h2>
        <p>This lead may have been removed or belongs to another workspace.</p>
      </div>
    </section>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!isUuid(leadId)) return <NotFound />;

  const { supabase, business } = await getDashboardContext();
  if (!business) return <NotFound />;

  // Tenant check happens here, with the user's own session and RLS.
  const { data, error } = await supabase
    .from('leads')
    .select('id,status,notes,vehicle,condition,estimate,photo_paths,ai_assessment,created_at,customer_id,customers(id,first_name,last_name,email,phone),services(name)')
    .eq('id', leadId)
    .eq('business_id', business.id)
    .maybeSingle();
  if (error || !data) return <NotFound />;

  const lead = data as unknown as LeadRow;
  const customer = one(lead.customers);
  const service = one(lead.services);
  const vehicle = safeObject<NonNullable<LeadRow['vehicle']>>(lead.vehicle);
  const condition = safeObject<NonNullable<LeadRow['condition']>>(lead.condition);
  const estimate = safeObject<NonNullable<LeadRow['estimate']>>(lead.estimate);
  const aiAssessment = safeObject<NonNullable<AiAssessment>>(lead.ai_assessment) as AiAssessment;
  const currency = estimate?.currency ?? 'USD';

  const { data: quoteRows } = await supabase
    .from('quotes')
    .select('id,quote_number,status,payment_status,total,created_at')
    .eq('business_id', business.id)
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false });
  const quotes = (quoteRows ?? []) as QuoteRow[];

  // Photos are private. Only paths inside this business/lead folder are signed,
  // and the links expire after ten minutes.
  let photos: { path: string; url: string }[] = [];
  const photoPaths = (lead.photo_paths ?? []).filter((path) => isLeadPhotoPath(path, business.id, lead.id)).slice(0, 8);
  if (photoPaths.length) {
    try {
      const { data: signed } = await createSupabaseAdminClient().storage.from('vehicle-photos').createSignedUrls(photoPaths, 600);
      photos = (signed ?? []).filter((item) => item.signedUrl && !item.error).map((item) => ({ path: item.path ?? '', url: item.signedUrl }));
    } catch (photoError) {
      console.error('Lead photo signing failed:', photoError instanceof Error ? photoError.message : 'unknown');
    }
  }

  const canQuote = !['lost', 'archived'].includes(lead.status);

  return (
    <section className="dashboard-main">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to dashboard</Link>
        <Link href="/dashboard/leads" className="button-secondary"><ArrowLeft size={15} /> Back to leads</Link>
      </div>

      <div className="dash-header" style={{ marginTop: 24 }}>
        <div>
          <span className="mono eyebrow">Lead detail</span>
          <h1>{vehicle?.year ?? 'Vehicle'} {vehicle?.makeModel ?? 'request'}</h1>
          <p>{vehicle?.type ?? 'Vehicle'} · {service?.name ?? 'Service not specified'} · Received {formatDate(lead.created_at)}</p>
        </div>
        {canQuote && (
          <Link href={`/dashboard/quotes?leadId=${lead.id}`} className="button-primary"><FileText size={15} /> Create quote</Link>
        )}
      </div>

      <div className="dashboard-metrics">
        <div><span>Estimate range</span><strong style={{ fontSize: 25 }}>{formatMoney(estimate?.minimum ?? 0, currency)} – {formatMoney(estimate?.maximum ?? 0, currency)}</strong></div>
        <div><span>Status</span><strong style={{ fontSize: 25, textTransform: 'capitalize' }}>{lead.status}</strong></div>
        <div><span>Quotes</span><strong style={{ fontSize: 25 }}>{quotes.length}</strong></div>
      </div>

      <div className="empty-state">
        <h2>Customer</h2>
        {customer ? (
          <>
            <p><strong>{customer.first_name} {customer.last_name}</strong></p>
            <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a href={`mailto:${customer.email}`} className="auth-switch"><Mail size={14} /> {customer.email}</a>
              {customer.phone && <a href={`tel:${customer.phone.replace(/[^+\d]/g, '')}`} className="auth-switch"><Phone size={14} /> {customer.phone}</a>}
            </p>
            <Link href={`/dashboard/customers/${customer.id}`} className="button-secondary" style={{ marginTop: 12 }}>View customer history</Link>
          </>
        ) : <p>No customer record is linked to this lead.</p>}
      </div>

      <div className="empty-state">
        <h2>Vehicle and condition</h2>
        <p>{condition?.notes || 'No condition notes were provided.'}</p>
        {photos.length > 0 ? (
          <div className="lead-photo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 16 }}>
            {photos.map((photo, index) => (
              <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '4 / 3', overflow: 'hidden', border: '1px solid var(--line)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs cannot go through the image optimizer */}
                <img src={photo.url} alt={`Vehicle photo ${index + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </a>
            ))}
          </div>
        ) : <p style={{ color: 'var(--muted)' }}>No photos were uploaded.</p>}

        {aiAssessment ? (
          <div style={{ marginTop: 18 }}>
            <p><strong>AI severity:</strong> {aiAssessment.severity || 'Unknown'} · <strong>Confidence:</strong> {Math.round((aiAssessment.confidence || 0) * 100)}%</p>
            {aiAssessment.paintCondition && <p><strong>Paint:</strong> {aiAssessment.paintCondition}</p>}
            {aiAssessment.interiorCondition && <p><strong>Interior:</strong> {aiAssessment.interiorCondition}</p>}
            {aiAssessment.notes && <p>{aiAssessment.notes}</p>}
            {aiAssessment.recommendedChecks?.length ? <ul>{aiAssessment.recommendedChecks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
            <p style={{ color: 'var(--muted)', fontSize: 12 }}>AI notes are a starting point. Confirm the vehicle condition in person before pricing.</p>
          </div>
        ) : null}
        {photos.length > 0 && <AiAssessmentButton leadId={lead.id} hasAssessment={Boolean(aiAssessment)} />}
      </div>

      {quotes.length > 0 && (
        <div className="empty-state">
          <h2>Quotes for this lead</h2>
          <div className="lead-list">
            {quotes.map((quote) => (
              <div className="lead-card" key={quote.id}>
                <div><strong>{quote.quote_number}</strong><span>{formatMoney(quote.total, currency)} · {formatDate(quote.created_at)}</span></div>
                <div className="lead-card-right"><b style={{ textTransform: 'capitalize' }}>{quote.status}</b><small>Payment: {(quote.payment_status ?? 'unpaid').replace('_', ' ')}</small></div>
              </div>
            ))}
          </div>
          <Link href="/dashboard/quotes" className="button-secondary" style={{ marginTop: 12 }}>Manage quotes</Link>
        </div>
      )}

      <LeadActions leadId={lead.id} initialStatus={lead.status} initialNotes={lead.notes ?? ''} />
    </section>
  );
}
