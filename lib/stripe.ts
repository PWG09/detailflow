import Stripe from 'stripe';

let stripeClient: Stripe | undefined;

export function getStripe() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error('Missing STRIPE_SECRET_KEY');
    stripeClient = new Stripe(secretKey);
  }
  return stripeClient;
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
