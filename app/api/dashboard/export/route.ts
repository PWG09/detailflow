import { NextResponse } from 'next/server';
import { resolveOwnerWorkspace } from '@/lib/workspace';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const MAX_ROWS = 10_000;

export async function GET() {
  const resolved = await resolveOwnerWorkspace('Only the business owner can export workspace data.');
  if (!resolved.ok) return resolved.response;
  const { supabase, user, membership } = resolved.workspace;
  const id = membership.business_id;

  const [business, services, customers, leads, quotes] = await Promise.all([
    supabase.from('businesses').select('id,name,slug,email,phone,description,currency,tax_rate,plan,created_at').eq('id', id).single(),
    supabase.from('services').select('id,name,description,pricing_type,minimum_price,maximum_price,active,requires_photos,created_at').eq('business_id', id).limit(MAX_ROWS),
    supabase.from('customers').select('id,first_name,last_name,email,phone,notes,created_at,updated_at').eq('business_id', id).limit(MAX_ROWS),
    supabase.from('leads').select('id,customer_id,service_id,status,vehicle,condition,estimate,notes,lost_reason,created_at,updated_at').eq('business_id', id).limit(MAX_ROWS),
    supabase.from('quotes').select('id,lead_id,customer_id,quote_number,subtotal,tax,total,status,payment_status,expires_at,notes,created_at,updated_at').eq('business_id', id).limit(MAX_ROWS),
  ]);
  const failed = [business, services, customers, leads, quotes].find((result) => result.error);
  if (failed?.error) {
    console.error('Workspace export failed:', failed.error.code, failed.error.message);
    return NextResponse.json({ error: 'The export could not be completed. Nothing was downloaded.' }, { status: 500 });
  }

  await writeAudit(id, user.id, 'workspace.exported', 'business', id, {});
  return new Response(JSON.stringify({
    exportedAt: new Date().toISOString(),
    business: business.data,
    services: services.data,
    customers: customers.data,
    leads: leads.data,
    quotes: quotes.data,
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="detailflow-export-${id}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
