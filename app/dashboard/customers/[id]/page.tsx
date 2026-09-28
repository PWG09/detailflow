import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, Mail, Phone, Repeat2, UserRound, ClipboardList, CarFront } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getDashboardContext } from '@/lib/dashboard-context';

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Lead = {
  id: string;
  status: string;
  vehicle: { year?: number; makeModel?: string; type?: string } | null;
  estimate: { minimum?: number; maximum?: number } | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEstimate(estimate: Lead['estimate']) {
  if (estimate?.minimum == null && estimate?.maximum == null) return 'Estimate pending';
  const minimum = estimate?.minimum ?? estimate?.maximum ?? 0;
  const maximum = estimate?.maximum ?? minimum;
  return minimum === maximum ? `$${minimum}` : `$${minimum}–$${maximum}`;
}

function customerInitials(customer: Customer) {
  return `${customer.first_name?.[0] ?? ''}${customer.last_name?.[0] ?? ''}`.toUpperCase() || 'C';
}

export default async function CustomerProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, business } = await getDashboardContext();

  if (!business) notFound();

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id,first_name,last_name,email,phone,notes,created_at,updated_at')
    .eq('business_id', business.id)
    .eq('id', id)
    .maybeSingle();

  if (customerError || !customer) notFound();

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('id,status,vehicle,estimate,created_at')
    .eq('business_id', business.id)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  const customerLeads: Lead[] = leadsError ? [] : (leads ?? []) as Lead[];
  const repeatOrders = Math.max(0, customerLeads.length - 1);
  const latestLead = customerLeads[0];

  return (
    <section className="dashboard-main customer-profile-page">
      <Link href="/dashboard/customers" className="button-secondary">
        <ArrowLeft size={15} /> Back to customers
      </Link>

      <div className="customer-profile-hero">
        <div className="customer-profile-heading">
          <div className="customer-avatar" aria-hidden="true">{customerInitials(customer)}</div>
          <div>
            <span className="mono eyebrow">Customer profile</span>
            <h1>{customer.first_name} {customer.last_name}</h1>
            <p>Customer history and every request tied to this business.</p>
          </div>
        </div>
        <div className="customer-profile-actions">
          <a className="button-secondary" href={`mailto:${customer.email}`}>
            <Mail size={15} /> Email customer
          </a>
          {customer.phone && (
            <a className="button-primary" href={`tel:${customer.phone}`}>
              <Phone size={15} /> Call
            </a>
          )}
        </div>
      </div>

      <div className="customer-summary-grid">
        <div className="customer-summary-card">
          <span className="mono">Total requests</span>
          <strong>{customerLeads.length}</strong>
          <small>Lead submissions from this customer</small>
        </div>
        <div className="customer-summary-card customer-summary-card-highlight">
          <span className="mono"><Repeat2 size={13} /> Repeat requests</span>
          <strong>{repeatOrders}</strong>
          <small>Times they came back after the first request</small>
        </div>
        <div className="customer-summary-card">
          <span className="mono">Last activity</span>
          <strong>{latestLead ? formatDate(latestLead.created_at) : '—'}</strong>
          <small>{latestLead ? 'Most recent lead' : 'No requests yet'}</small>
        </div>
      </div>

      <div className="customer-profile-grid">
        <section className="customer-history-card">
          <div className="customer-section-heading">
            <div>
              <span className="mono eyebrow">Request history</span>
              <h2>Past leads</h2>
            </div>
            <span className="customer-history-count">{customerLeads.length}</span>
          </div>

          {leadsError ? (
            <div className="customer-inline-error">
              <ClipboardList size={18} />
              <div>
                <strong>We couldn&apos;t load the request history.</strong>
                <span>The customer profile is available, but the lead history could not be read right now.</span>
              </div>
            </div>
          ) : customerLeads.length === 0 ? (
            <div className="customer-empty-history">
              <div className="empty-icon"><ClipboardList size={20} /></div>
              <h3>No past leads yet.</h3>
              <p>This customer has not submitted a request through your public lead form.</p>
            </div>
          ) : (
            <div className="customer-lead-history">
              {customerLeads.map((lead, index) => (
                <Link className="customer-lead-row" href={`/dashboard/leads/${lead.id}`} key={lead.id}>
                  <div className="customer-lead-icon"><CarFront size={17} /></div>
                  <div className="customer-lead-main">
                    <strong>{lead.vehicle?.year ?? 'Vehicle'} {lead.vehicle?.makeModel ?? 'details'}</strong>
                    <span>{lead.vehicle?.type ?? 'Vehicle'} · {formatDate(lead.created_at)}</span>
                  </div>
                  <div className="customer-lead-meta">
                    <b>{formatEstimate(lead.estimate)}</b>
                    <span className="customer-lead-status">{lead.status}</span>
                    {index === 0 && <small>Latest</small>}
                  </div>
                  <ArrowRight className="customer-lead-arrow" size={16} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="customer-info-card">
          <div className="customer-section-heading">
            <div>
              <span className="mono eyebrow">Contact</span>
              <h2>Customer details</h2>
            </div>
            <UserRound size={20} />
          </div>

          <div className="customer-contact-list">
            <div><Mail size={16} /><span><small>Email</small><strong>{customer.email}</strong></span></div>
            <div><Phone size={16} /><span><small>Phone</small><strong>{customer.phone || 'Not provided'}</strong></span></div>
            <div><CalendarDays size={16} /><span><small>Customer since</small><strong>{formatDate(customer.created_at)}</strong></span></div>
          </div>

          {customer.notes && (
            <div className="customer-notes">
              <span className="mono">Notes</span>
              <p>{customer.notes}</p>
            </div>
          )}

          <div className="customer-repeat-note">
            <Repeat2 size={17} />
            <p><strong>Repeat customer</strong> is calculated from this customer&apos;s lead history: every request after their first one counts as a return request.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
