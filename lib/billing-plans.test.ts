import { describe, expect, it } from 'vitest';
import { planForPrice, subscriptionGrantsPlan } from './billing-plans';
import { assertStripeKeyForEnvironment } from './stripe-env';

const env = { pro: 'price_pro', business: 'price_business' };

describe('planForPrice', () => {
  it('derives the plan from configured price ids before metadata', () => {
    expect(planForPrice('price_business', 'pro', env)).toBe('business');
    expect(planForPrice('price_pro', 'business', env)).toBe('pro');
  });
  it('falls back to known metadata plans only', () => {
    expect(planForPrice('price_unknown', 'business', env)).toBe('business');
    expect(planForPrice('price_unknown', 'enterprise', env)).toBeNull();
    expect(planForPrice(null, undefined, env)).toBeNull();
  });
});

describe('subscriptionGrantsPlan', () => {
  it('keeps paid features only for live subscriptions', () => {
    expect(subscriptionGrantsPlan('active')).toBe(true);
    expect(subscriptionGrantsPlan('past_due')).toBe(true);
    expect(subscriptionGrantsPlan('canceled')).toBe(false);
    expect(subscriptionGrantsPlan('incomplete_expired')).toBe(false);
    expect(subscriptionGrantsPlan(null)).toBe(false);
  });
});

describe('assertStripeKeyForEnvironment', () => {
  it('requires live keys on the production deployment only', () => {
    expect(() => assertStripeKeyForEnvironment('sk_test_123', 'production')).toThrow();
    expect(() => assertStripeKeyForEnvironment('sk_live_123', 'production')).not.toThrow();
    expect(() => assertStripeKeyForEnvironment('rk_live_123', 'production')).not.toThrow();
    expect(() => assertStripeKeyForEnvironment('sk_test_123', 'preview')).not.toThrow();
  });
});
