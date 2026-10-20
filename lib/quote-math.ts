/**
 * Pure quote/payment rules. No I/O so they can be unit tested and shared by the
 * dashboard routes, the public quote routes and the Stripe webhook.
 */

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'disputed';

export const QUOTE_STATUSES: readonly QuoteStatus[] = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'];

/** Payment states in which the quote's commercial terms must not change. */
const LOCKING_PAYMENT_STATES = new Set<string>(['pending', 'paid', 'refunded', 'partially_refunded', 'disputed']);

const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  draft: ['sent', 'accepted', 'declined', 'expired'],
  sent: ['draft', 'viewed', 'accepted', 'declined', 'expired'],
  viewed: ['draft', 'sent', 'accepted', 'declined', 'expired'],
  accepted: ['draft', 'sent', 'declined', 'expired'],
  declined: ['draft'],
  expired: ['draft'],
};

export function isPaymentLocked(paymentStatus: string | null | undefined) {
  return LOCKING_PAYMENT_STATES.has(paymentStatus ?? 'unpaid');
}

export function canTransitionQuote(from: string, to: string, paymentStatus: string | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };
  if (!QUOTE_STATUSES.includes(to as QuoteStatus)) return { ok: false, reason: 'Unknown quote status.' };
  if (isPaymentLocked(paymentStatus)) {
    return { ok: false, reason: paymentStatus === 'pending'
      ? 'A payment for this quote is in progress. Wait for it to finish or expire before changing the quote.'
      : 'This quote has a recorded payment and can no longer change status.' };
  }
  const allowed = TRANSITIONS[from as QuoteStatus];
  if (!allowed || !allowed.includes(to as QuoteStatus)) return { ok: false, reason: `A ${from} quote cannot be moved to ${to}.` };
  return { ok: true };
}

export function toCents(amount: number) {
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

export function fromCents(cents: number) {
  return Math.round(cents) / 100;
}

/** Tax is a percentage (0-100) applied to the subtotal, rounded to the cent. */
export function calculateQuoteTotals(subtotal: number, taxRatePercent: number | null | undefined) {
  const rate = Number(taxRatePercent ?? 0);
  if (!Number.isFinite(subtotal) || subtotal < 0) throw new Error('Invalid subtotal.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Invalid tax rate.');
  const subtotalCents = toCents(subtotal);
  // Work in integer thousandths of a percent so rates like 14.975% round exactly.
  const taxCents = Math.round((subtotalCents * Math.round(rate * 1000)) / 100_000);
  return { subtotal: fromCents(subtotalCents), tax: fromCents(taxCents), total: fromCents(subtotalCents + taxCents) };
}

/** Check a quoted pre-tax amount against the lead's stored service range. */
export function validateQuoteAmount(amount: number, estimate: { minimum?: unknown; maximum?: unknown } | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'Enter a price greater than zero.' };
  if (amount > 1_000_000) return { ok: false, reason: 'The quote price is too large.' };
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return { ok: false, reason: 'Use at most two decimal places.' };
  }
  const minimum = Number(estimate?.minimum);
  const maximum = Number(estimate?.maximum);
  if (estimate?.minimum != null && Number.isFinite(minimum) && amount < minimum) return { ok: false, reason: `Quote price must be at least ${minimum}.` };
  if (estimate?.maximum != null && Number.isFinite(maximum) && maximum > 0 && amount > maximum) return { ok: false, reason: `Quote price cannot exceed ${maximum}.` };
  return { ok: true };
}

export const SUPPORTED_CURRENCIES = new Set(['usd', 'cad', 'eur', 'gbp', 'aud', 'nzd']);

export function normalizeCurrency(currency: string | null | undefined) {
  const value = (currency || 'USD').trim().toLowerCase();
  return SUPPORTED_CURRENCIES.has(value) ? value : null;
}

/** Amount and platform fee in the smallest currency unit for Stripe Checkout. */
export function checkoutAmounts(total: number | string, feePercent: number | string | null | undefined) {
  const amount = toCents(Number(total));
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const parsedFee = Number(feePercent);
  const percent = Number.isFinite(parsedFee) ? Math.min(100, Math.max(0, parsedFee)) : 0;
  const fee = Math.min(amount, Math.round((amount * Math.round(percent * 1000)) / 100_000));
  return { amount, fee, feePercent: percent };
}

/** Full refund only when the refunded amount covers the captured amount. */
export function refundPaymentStatus(amountCaptured: number, amountRefunded: number): PaymentStatus | null {
  if (!(amountRefunded > 0)) return null;
  return amountRefunded >= amountCaptured ? 'refunded' : 'partially_refunded';
}

export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined, locale = 'en-US') {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  }
}
