import { describe, expect, it } from 'vitest';
import { calculateEstimate } from './pricing';

describe('calculateEstimate', () => {
  it('reproducibly adds business-defined adjustments', () => {
    expect(calculateEstimate(200, 250, [{ label: 'SUV', minimum: 30, maximum: 50 }, { label: 'Pet hair', minimum: 20, maximum: 30 }])).toMatchObject({ finalMinimum: 250, finalMaximum: 330 });
  });
});
