export function isMembershipForUser(
  membership: { user_id?: string | null; business_id?: string | null } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!membership || !userId) return false;
  return membership.user_id === userId;
}
