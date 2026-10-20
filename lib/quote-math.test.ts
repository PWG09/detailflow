import { describe, expect, it } from 'vitest';
import { calculateQuoteTotals, canTransitionQuote, checkoutAmounts, normalizeCurrency, refundPaymentStatus, validateQuoteAmount } from './quote-math';

describe('quote lifecycle', () => {
  it('allows the normal send → accept path', () => {
    expect(canTransitionQuote('draft', 'sent', 'unpaid').ok).toBe(true);
    expect(canTransitionQuote('sent', 'viewed', 'unpaid').ok).toBe(true);
    expect(canTransitionQuote('viewed', 'accepted', 'unpaid').ok).toBe(true);
  });

  it('locks status while a payment is pending or recorded', () => {
    expect(canTransitionQuote('accepted', 'draft', 'pending').ok).toBe(false);
    expect(canTransitionQuote('accepted', 'declined', 'paid').ok).toBe(false);
    expect(canTransitionQuote('accepted', 'expired', 'refunded').ok).toBe(false);
  });

  it('rejects unknown and disallowed transitions', () => {
    expect(canTransitionQuote('draft', 'viewed', 'unpaid').ok).toBe(false);
    expect(canTransitionQuote('declined', 'accepted', 'unpaid').ok).toBe(false);
    expect(canTransitionQuote('draft', 'paid', 'unpaid').ok).toBe(false);
  });

  it('allows a failed payment to be retried or the quote reworked', () => {
    expect(canTransitionQuote('accepted', 'draft', 'failed').ok).toBe(true);
  });
});

describe('calculateQuoteTotals', () => {
  it('adds tax rounded to the cent', () => {
    expect(calculateQuoteTotals(199.99, 13)).toEqual({ subtotal: 199.99, tax: 26, total: 225.99 });
    expect(calculateQuoteTotals(100, 14.975)).toEqual({ subtotal: 100, tax: 14.98, total: 114.98 });
    expect(calculateQuoteTotals(250, 0)).toEqual({ subtotal: 250, tax: 0, total: 250 });
  });

  it('rejects invalid input', () => {
    expect(() => calculateQuoteTotals(-1, 5)).toThrow();
    expect(() => calculateQuoteTotals(10, 101)).toThrow();
  });
});

describe('validateQuoteAmount', () => {
  const estimate = { minimum: 200, maximum: 350 };
  it('accepts an exact price within the lead range', () => {
    expect(validateQuoteAmount(275.5, estimate).ok).toBe(true);
    expect(validateQuoteAmount(200, estimate).ok).toBe(true);
    expect(validateQuoteAmount(350, estimate).ok).toBe(true);
  });
  it('rejects prices outside the range, zero, and sub-cent precision', () => {
    expect(validateQuoteAmount(199.99, estimate).ok).toBe(false);
    expect(validateQuoteAmount(350.01, estimate).ok).toBe(false);
    expect(validateQuoteAmount(0, estimate).ok).toBe(false);
    expect(validateQuoteAmount(210.555, estimate).ok).toBe(false);
  });
  it('treats a zero maximum (custom pricing) as open-ended', () => {
    expect(validateQuoteAmount(500, { minimum: 0, maximum: 0 }).ok).toBe(true);
  });
});

describe('checkoutAmounts', () => {
  it('computes cents and the platform fee', () => {
    expect(checkoutAmounts('225.99', 2.5)).toEqual({ amount: 22599, fee: 565, feePercent: 2.5 });
    expect(checkoutAmounts(100, 150)).toEqual({ amount: 10000, fee: 10000, feePercent: 100 });
  });
  it('refuses non-positive totals', () => {
    expect(checkoutAmounts(0, 2.5)).toBeNull();
    expect(checkoutAmounts('abc', 2.5)).toBeNull();
  });
});

describe('payment helpers', () => {
  it('distinguishes full and partial refunds', () => {
    expect(refundPaymentStatus(10000, 10000)).toBe('refunded');
    expect(refundPaymentStatus(10000, 2500)).toBe('partially_refunded');
    expect(refundPaymentStatus(10000, 0)).toBeNull();
  });
  it('only allows supported currencies', () => {
    expect(normalizeCurrency('CAD')).toBe('cad');
    expect(normalizeCurrency(null)).toBe('usd');
    expect(normalizeCurrency('JPY')).toBeNull();
  });
});
