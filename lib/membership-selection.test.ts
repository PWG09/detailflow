import { describe, expect, it } from 'vitest';
import { pickPrimaryMembership } from './membership-selection';

describe('pickPrimaryMembership', () => {
  it('returns null when the user has no valid membership', () => {
    expect(pickPrimaryMembership([])).toBeNull();
    expect(pickPrimaryMembership([{ business_id: 'b1', role: 'admin' }])).toBeNull();
  });

  it('prefers an owner membership over staff memberships', () => {
    const rows = [
      { business_id: 'staff-biz', role: 'staff', created_at: '2026-01-01T00:00:00Z' },
      { business_id: 'own-biz', role: 'owner', created_at: '2026-06-01T00:00:00Z' },
    ];
    expect(pickPrimaryMembership(rows)).toEqual({ business_id: 'own-biz', role: 'owner' });
  });

  it('is deterministic regardless of row order', () => {
    const a = { business_id: 'aaa', role: 'staff', created_at: '2026-02-01T00:00:00Z' };
    const b = { business_id: 'bbb', role: 'staff', created_at: '2026-01-01T00:00:00Z' };
    expect(pickPrimaryMembership([a, b])).toEqual({ business_id: 'bbb', role: 'staff' });
    expect(pickPrimaryMembership([b, a])).toEqual({ business_id: 'bbb', role: 'staff' });
  });
});
