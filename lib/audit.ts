import { createSupabaseAdminClient } from '@/lib/supabase/admin';
export async function writeAudit(businessId: string, actorId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from('audit_logs').insert({ business_id: businessId, actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata });
}
