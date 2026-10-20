import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveWorkspace } from '@/lib/workspace';
import { isUuid } from '@/lib/keyset-pagination';
import { canTransitionQuote, QUOTE_STATUSES } from '@/lib/quote-math';
import { writeAudit } from '@/lib/audit';

const schema = z.object({
  status: z.enum(QUOTE_STATUSES as unknown as [string, ...string[]]),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!isUuid(quoteId)) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });

  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid quote update.' }, { status: 400 });

  const { data: current, error: currentError } = await supabase
    .from('quotes')
    .select('id,status,payment_status')
    .eq('id', quoteId)
    .eq('business_id', membership.business_id)
    .maybeSingle();
  if (currentError) {
    console.error('Quote lookup failed:', currentError.code, currentError.message);
    return NextResponse.json({ error: 'Unable to update quote.' }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });

  const transition = canTransitionQuote(current.status, parsed.data.status, current.payment_status);
  if (!transition.ok) return NextResponse.json({ error: transition.reason }, { status: 409 });

  const update: { status: string; updated_at: string; notes?: string } = { status: parsed.data.status, updated_at: new Date().toISOString() };
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;

  const { data, error } = await supabase
    .from('quotes')
    .update(update)
    .eq('id', quoteId)
    .eq('business_id', membership.business_id)
    .eq('status', current.status)
    .select('id,quote_number,status,payment_status,total,expires_at,created_at,lead_id,customer_id,notes')
    .maybeSingle();
  if (error) {
    console.error('Quote update failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to update quote.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'The quote changed while you were editing it. Refresh and try again.' }, { status: 409 });

  // Declining or expiring a quote also disables its public links.
  if (['declined', 'expired', 'draft'].includes(parsed.data.status)) {
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');
    const { error: revokeError } = await createSupabaseAdminClient()
      .from('quote_public_access')
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('quote_id', quoteId)
      .is('revoked_at', null);
    if (revokeError) console.error('Public quote link revocation failed:', revokeError.code, revokeError.message);
  }

  await writeAudit(membership.business_id, user.id, `quote.${parsed.data.status}`, 'quote', quoteId, { from: current.status });
  return NextResponse.json(data);
}
