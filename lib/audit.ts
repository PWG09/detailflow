import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Best-effort audit trail. An audit failure is logged but never turns a
 * completed business action into an error response.
 */
export async function writeAudit(businessId: string, actorId: string | null, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}) {
  try {
    const { error } = await createSupabaseAdminClient()
      .from('audit_logs')
      .insert({ business_id: businessId, actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata });
    if (error) console.error('Audit log write failed:', action, error.code, error.message);
  } catch (error) {
    console.error('Audit log write failed:', action, error instanceof Error ? error.message : 'unknown');
  }
}
