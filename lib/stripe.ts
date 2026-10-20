import Stripe from 'stripe';
import { assertStripeKeyForEnvironment } from '@/lib/stripe-env';

export { assertStripeKeyForEnvironment };

let stripeClient: Stripe | undefined;

export function getStripe() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error('Missing STRIPE_SECRET_KEY');
    assertStripeKeyForEnvironment(secretKey);
    stripeClient = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }
  return stripeClient;
}

export function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing NEXT_PUBLIC_APP_URL in production.');
  }
  return 'http://localhost:3000';
}
