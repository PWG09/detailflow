import Link from 'next/link';
import { ArrowLeft, ClipboardList, Plus, Search } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Lead = { id: string; status: string; vehicle: { year?: number; makeModel?: string; type?: string } | null; estimate: { minimum?: number; maximum?: number } | null; created_at: string };

function formatEstimate(estimate: Lead['estimate']) {
  if (!estimate?.minimum && !estimate?.maximum) return 'Estimate pending';
  return `$${estimate.minimum ?? 0}-${estimate.maximum ?? estimate.minimum ?? 0}`;
}

export default async function LeadsPage() {
  let leads: Lead[] = [];
  let error = '';
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: membership } = user ? await supabase.from('business_members').select('business_id').eq('user_id', user.id).maybeSingle() : { data: null };
    if (!membership) { error = 'Workspace not found.'; }
    else {
      const result = await supabase.from('leads').select('id,status,vehicle,estimate,created_at').eq('business_id', membership.business_id).order('created_at', { ascending: false });
      if (result.error) error = 'We could not load your leads right now.';
      else leads = (result.data ?? []) as Lead[];
    }
  } catch {
    error = 'Connect Supabase to load your leads.';
  }

  return <section className="dashboard-main leads-page"><Link href="/dashboard" className="button-secondary"><ArrowLeft size={15} /> Back to dashboard</Link><div className="dash-header" style={{ marginTop: 24 }}><div><span className="mono eyebrow">Lead inbox</span><h1>Your leads.</h1><p>Every request, organized and ready for a reply.</p></div><Link className="button-primary" href="/onboarding"><Plus size={15} /> Create public flow</Link></div><div className="leads-toolbar"><div className="lead-search"><Search size={15} /><input aria-label="Search leads" placeholder="Search vehicle or customer" /></div><span className="mono lead-count">{leads.length} {leads.length === 1 ? 'lead' : 'leads'}</span></div>{error ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22} /></div><h2>{error}</h2><p>Check your Supabase migration, environment variables, and authenticated account.</p></div> : leads.length === 0 ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22} /></div><h2>No leads yet.</h2><p>When a customer submits the public quote form, their request will appear here.</p><Link className="button-primary" href="/onboarding">Create public quote <Plus size={15} /></Link></div> : <div className="lead-list">{leads.map((lead) => <Link className="lead-card" href={`/dashboard/leads/${lead.id}`} key={lead.id}><div><strong>{lead.vehicle?.year ?? 'Vehicle'} {lead.vehicle?.makeModel ?? 'details'}</strong><span>{lead.vehicle?.type ?? 'Vehicle'} · {new Date(lead.created_at).toLocaleDateString()}</span></div><div className="lead-card-right"><b>{formatEstimate(lead.estimate)}</b><small>{lead.status}</small></div></Link>)}</div>}</section>;
}
