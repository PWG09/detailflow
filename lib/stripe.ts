import Stripe from 'stripe';

let stripeClient: Stripe | undefined;

export function getStripe() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error('Missing STRIPE_SECRET_KEY');
    if (process.env.NODE_ENV === 'production' && !secretKey.startsWith('sk_live_')) {
      throw new Error('Production requires a live Stripe secret key (sk_live_).');
    }
    stripeClient = new Stripe(secretKey);
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
