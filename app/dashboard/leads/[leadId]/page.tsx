import Link from 'next/link';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
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

type Lead = {
  id: string;
  status: string;
  notes?: string | null;
  vehicle: { year?: number; makeModel?: string; type?: string } | null;
  condition: { notes?: string } | null;
  estimate: { minimum?: number; maximum?: number } | null;
  created_at: string;
};

function safeJsonObject<T extends object>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as T;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const supabase = await createSupabaseServerClient();

  // Keep the primary query limited to columns that exist in the original schema.
  // This makes the lead detail page resilient if the optional production migration
  // has not been applied yet.
  const { data, error } = await supabase
    .from('leads')
    .select('id,status,notes,vehicle,condition,estimate,created_at')
    .eq('id', leadId)
    .maybeSingle();

  if (error || !data) {
    return (
      <section className="dashboard-main">
        <Link href="/dashboard/leads" className="button-secondary">
          <ArrowLeft size={15} /> Back to leads
        </Link>
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon"><ClipboardList size={22} /></div>
          <h2>Lead not found.</h2>
          <p>This lead may have been removed, belongs to another workspace, or is no longer accessible.</p>
        </div>
      </section>
    );
  }

  const lead = data as Lead;
  let aiAssessment: AiAssessment = null;

  // ai_assessment was added by the production migration. If that migration is
  // not present yet, Supabase returns an error for this optional query; simply
  // render the lead without the AI section instead of crashing the Server Component.
  try {
    const aiResult = await supabase
      .from('leads')
      .select('ai_assessment')
      .eq('id', leadId)
      .maybeSingle();
    if (!aiResult.error) {
      aiAssessment = safeJsonObject<NonNullable<AiAssessment>>(aiResult.data?.ai_assessment) as AiAssessment;
    }
  } catch {
    aiAssessment = null;
  }

  const vehicle = safeJsonObject<NonNullable<Lead['vehicle']>>(lead.vehicle);
  const condition = safeJsonObject<NonNullable<Lead['condition']>>(lead.condition);
  const estimate = safeJsonObject<NonNullable<Lead['estimate']>>(lead.estimate);

  return (
    <section className="dashboard-main">
      <Link href="/dashboard/leads" className="button-secondary">
        <ArrowLeft size={15} /> Back to leads
      </Link>

      <div className="dash-header" style={{ marginTop: 34 }}>
        <div>
          <span className="mono eyebrow">Lead detail</span>
          <h1>{vehicle?.year ?? 'Vehicle'} {vehicle?.makeModel ?? 'request'}</h1>
          <p>{vehicle?.type ?? 'Vehicle'} · Received {formatDate(lead.created_at)}</p>
        </div>
        <span className="lead-card-right"><b>{lead.status}</b></span>
      </div>

      <div className="dashboard-metrics">
        <div>
          <span>Estimate minimum</span>
          <strong>${estimate?.minimum ?? 0}</strong>
        </div>
        <div>
          <span>Estimate maximum</span>
          <strong>${estimate?.maximum ?? 0}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong style={{ fontSize: 25 }}>{lead.status}</strong>
        </div>
      </div>

      <div className="empty-state">
        <h2>Assessment details</h2>
        <p>{condition?.notes || 'No condition notes were provided.'}</p>

        {aiAssessment ? (
          <div style={{ marginTop: 18 }}>
            <p>
              <strong>AI severity:</strong> {aiAssessment.severity || 'Unknown'} ·{' '}
              <strong>Confidence:</strong> {Math.round((aiAssessment.confidence || 0) * 100)}%
            </p>
            {aiAssessment.paintCondition && <p><strong>Paint:</strong> {aiAssessment.paintCondition}</p>}
            {aiAssessment.interiorCondition && <p><strong>Interior:</strong> {aiAssessment.interiorCondition}</p>}
            {aiAssessment.notes && <p>{aiAssessment.notes}</p>}
            {aiAssessment.recommendedChecks?.length ? (
              <ul>{aiAssessment.recommendedChecks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            ) : null}
          </div>
        ) : null}

        <AiAssessmentButton leadId={lead.id} hasAssessment={Boolean(aiAssessment)} />
      </div>

      <LeadActions leadId={lead.id} initialStatus={lead.status} initialNotes={lead.notes ?? ''} />
    </section>
  );
}
