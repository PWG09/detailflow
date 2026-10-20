export type MembershipRow = { business_id: string; role: string; created_at?: string | null };

/**
 * Pick the workspace a user acts in. Deterministic: owner memberships win over
 * staff memberships, and ties are broken by the oldest membership, then id.
 * Rows with an unknown role are ignored.
 */
export function pickPrimaryMembership(rows: MembershipRow[]): { business_id: string; role: 'owner' | 'staff' } | null {
  const valid = rows.filter(
    (row): row is MembershipRow & { role: 'owner' | 'staff' } =>
      typeof row?.business_id === 'string' && (row.role === 'owner' || row.role === 'staff'),
  );
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    if (at !== bt) return at - bt;
    return a.business_id < b.business_id ? -1 : a.business_id > b.business_id ? 1 : 0;
  });
  return { business_id: sorted[0].business_id, role: sorted[0].role };
}
