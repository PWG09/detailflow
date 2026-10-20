/**
 * Live keys are required only on the production deployment. Preview and local
 * builds also run with NODE_ENV=production, so VERCEL_ENV decides. Restricted
 * live keys (rk_live_) are accepted.
 */
export function assertStripeKeyForEnvironment(secretKey: string, vercelEnv = process.env.VERCEL_ENV) {
  if (vercelEnv === 'production' && !/^(sk|rk)_live_/.test(secretKey)) {
    throw new Error('The production deployment requires a live Stripe secret key.');
  }
}
