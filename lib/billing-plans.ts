export type PaidPlan = 'pro' | 'business';

/**
 * Map a Stripe price id to a DetailFlow plan using server configuration.
 * Metadata is only used as a fallback for subscriptions created before the
 * price ids were configured, and only to choose between known paid plans.
 */
export function planForPrice(priceId: string | null | undefined, metadataPlan: string | null | undefined, env: { pro?: string; business?: string } = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  business: process.env.STRIPE_BUSINESS_PRICE_ID,
}): PaidPlan | null {
  if (priceId && env.business && priceId === env.business) return 'business';
  if (priceId && env.pro && priceId === env.pro) return 'pro';
  if (metadataPlan === 'business' || metadataPlan === 'pro') return metadataPlan;
  return null;
}

/** Subscription statuses that keep paid features enabled. */
export function subscriptionGrantsPlan(status: string | null | undefined) {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/** Statuses for which an existing subscription can be changed in place. */
export function subscriptionIsUpdatable(status: string | null | undefined) {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
