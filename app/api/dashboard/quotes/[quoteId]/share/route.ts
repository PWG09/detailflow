import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { resolveWorkspace } from '@/lib/workspace';
import { isUuid } from '@/lib/keyset-pagination';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/stripe';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const DEFAULT_LINK_DAYS = 14;

export async function POST(_request: Request, { params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;
  if (!isUuid(quoteId)) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });

  const resolved = await resolveWorkspace();
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id,status,expires_at')
    .eq('id', quoteId)
    .eq('business_id', membership.business_id)
    .maybeSingle();
  if (quoteError) {
    console.error('Quote lookup failed:', quoteError.code, quoteError.message);
    return NextResponse.json({ error: 'Unable to share this quote.' }, { status: 500 });
  }
  if (!quote) return NextResponse.json({ error: 'Quote not found.' }, { status: 404 });
  if (['declined', 'expired'].includes(quote.status)) return NextResponse.json({ error: 'Declined or expired quotes cannot be shared.' }, { status: 409 });

  const now = Date.now();
  if (quote.expires_at && new Date(quote.expires_at).getTime() <= now) {
    return NextResponse.json({ error: 'This quote has passed its expiry date. Update the quote before sharing it.' }, { status: 409 });
  }
  const linkExpiresAt = quote.expires_at ?? new Date(now + DEFAULT_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Only the SHA-256 hash of the token is stored. Sharing again rotates the link.
  const raw = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const admin = createSupabaseAdminClient();
  const timestamp = new Date().toISOString();

  const { error: revokeError } = await admin
    .from('quote_public_access')
    .update({ revoked_at: timestamp, updated_at: timestamp })
    .eq('quote_id', quote.id)
    .is('revoked_at', null);
  if (revokeError) {
    console.error('Previous quote link revocation failed:', revokeError.code, revokeError.message);
    return NextResponse.json({ error: 'Unable to create a secure quote link.' }, { status: 500 });
  }

  const { error } = await admin.from('quote_public_access').insert({ quote_id: quote.id, token_hash: hash, expires_at: linkExpiresAt });
  if (error) {
    console.error('Quote link creation failed:', error.code, error.message);
    return NextResponse.json({ error: 'Unable to create a secure quote link.' }, { status: 500 });
  }

  if (quote.status === 'draft') {
    const { error: statusError } = await supabase
      .from('quotes')
      .update({ status: 'sent', updated_at: timestamp })
      .eq('id', quote.id)
      .eq('business_id', membership.business_id)
      .eq('status', 'draft');
    if (statusError) console.error('Quote status update after share failed:', statusError.code, statusError.message);
  }

  await writeAudit(membership.business_id, user.id, 'quote.link_created', 'quote', quote.id, { expiresAt: linkExpiresAt });
  return NextResponse.json({ url: `${getAppUrl()}/q/${raw}`, expiresAt: linkExpiresAt });
}
