import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspace } from '@/lib/workspace';
import { writeAudit } from '@/lib/audit';
import { isUuid } from '@/lib/keyset-pagination';

const updateSchema = z.object({
  status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost', 'archived']),
  notes: z.string().max(2000).optional(),
  lostReason: z.string().max(500).optional(),
});

type LeadUpdate = {
  status: string;
  updated_at: string;
  notes?: string;
  lost_reason?: string;
  contacted_at?: string;
  quoted_at?: string;
  closed_at?: string | null;
};

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  if (!isUuid(leadId)) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lead update.' }, { status: 400 });

  const now = new Date().toISOString();
  const update: LeadUpdate = { status: parsed.data.status, updated_at: now };
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  if (parsed.data.lostReason !== undefined) update.lost_reason = parsed.data.lostReason;
  if (parsed.data.status === 'contacted') update.contacted_at = now;
  if (parsed.data.status === 'quoted') update.quoted_at = now;
  if (['won', 'lost', 'archived'].includes(parsed.data.status)) update.closed_at = now;
  else update.closed_at = null;

  const { data, error } = await supabase
    .from('leads')
    .update(update)
    .eq('id', leadId)
    .eq('business_id', membership.business_id)
    .select('id,status,notes,lost_reason,contacted_at,quoted_at,closed_at')
    .maybeSingle();
  if (error) {
    console.error('Lead update failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to update lead.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  await writeAudit(membership.business_id, user.id, `lead.${parsed.data.status}`, 'lead', leadId, { status: parsed.data.status });
  return NextResponse.json(data);
}
