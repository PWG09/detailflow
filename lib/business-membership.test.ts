import { describe, expect, it } from 'vitest';
import { isMembershipForUser } from './business-membership';

describe('isMembershipForUser', () => {
  it('accepts the signed-in user membership and rejects foreign rows', () => {
    expect(isMembershipForUser({ user_id: 'owner-1', business_id: 'biz-1' }, 'owner-1')).toBe(true);
    expect(isMembershipForUser({ user_id: 'owner-2', business_id: 'biz-2' }, 'owner-1')).toBe(false);
    expect(isMembershipForUser(null, 'owner-1')).toBe(false);
  });
});
