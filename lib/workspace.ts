import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pickPrimaryMembership, type MembershipRow } from '@/lib/membership-selection';

export type Membership = { business_id: string; role: 'owner' | 'staff' };

export type Workspace = {
  supabase: SupabaseClient;
  user: User;
  membership: Membership;
};

/**
 * Resolve the signed-in user and their workspace from the session cookie.
 *
 * The business id is never taken from the client. A user who belongs to more
 * than one workspace always resolves to the same one (owner role first, then
 * the oldest membership), so every request in a session sees the same tenant.
 */
export async function resolveWorkspace(supabase?: SupabaseClient): Promise<
  | { ok: true; workspace: Workspace }
  | { ok: false; response: NextResponse }
> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: 'Not authenticated.' }, { status: 401 }) };

  const { data, error } = await client
    .from('business_members')
    .select('business_id,role,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    console.error('Workspace membership lookup failed:', error.code, error.message);
    return { ok: false, response: NextResponse.json({ error: 'Unable to load your workspace.' }, { status: 500 }) };
  }

  const membership = pickPrimaryMembership((data ?? []) as MembershipRow[]);
  if (!membership) return { ok: false, response: NextResponse.json({ error: 'Workspace not found.' }, { status: 404 }) };

  return { ok: true, workspace: { supabase: client, user, membership } };
}

/** Same as resolveWorkspace, but also requires the owner role. */
export async function resolveOwnerWorkspace(message = 'Only the business owner can do this.') {
  const result = await resolveWorkspace();
  if (!result.ok) return result;
  if (result.workspace.membership.role !== 'owner') {
    return { ok: false as const, response: NextResponse.json({ error: message }, { status: 403 }) };
  }
  return result;
}
