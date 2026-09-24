import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import LeadActions from './LeadActions';

type Lead = { id: string; status: string; notes?: string | null; vehicle: { year?: number; makeModel?: string; type?: string } | null; condition: { notes?: string } | null; estimate: { minimum?: number; maximum?: number } | null; created_at: string };

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('leads').select('id,status,notes,vehicle,condition,estimate,created_at').eq('id', leadId).maybeSingle();
  const lead = data as Lead | null;
  return <section className="dashboard-main"><Link href="/dashboard/leads" className="button-secondary"><ArrowLeft size={15} /> Back to leads</Link>{error || !lead ? <div className="empty-state"><div className="empty-icon"><ClipboardList size={22} /></div><h2>Lead not found.</h2><p>This lead may have been removed or belongs to another workspace.</p></div> : <><div className="dash-header" style={{ marginTop: 34 }}><div><span className="mono eyebrow">Lead detail</span><h1>{lead.vehicle?.year ?? 'Vehicle'} {lead.vehicle?.makeModel ?? 'request'}</h1><p>{lead.vehicle?.type ?? 'Vehicle'} · Received {new Date(lead.created_at).toLocaleDateString()}</p></div><span className="lead-card-right"><b>{lead.status}</b></span></div><div className="dashboard-metrics"><div><span>Estimate minimum</span><strong>${lead.estimate?.minimum ?? 0}</strong></div><div><span>Estimate maximum</span><strong>${lead.estimate?.maximum ?? 0}</strong></div><div><span>Status</span><strong style={{ fontSize: 25 }}>{lead.status}</strong></div></div><div className="empty-state"><h2>Assessment details</h2><p>{lead.condition?.notes || 'No condition notes were provided.'}</p></div><LeadActions leadId={lead.id} initialStatus={lead.status} initialNotes={lead.notes ?? ''} /></>}</section>;
}
