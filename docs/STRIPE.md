# Stripe

## Memberships

DetailFlow has three workspace plans:

- Free: no subscription.
- Pro: `STRIPE_PRO_PRICE_ID`.
- Business: `STRIPE_BUSINESS_PRICE_ID`.

Stripe Checkout creates the subscription. Stripe webhooks are authoritative for `businesses.plan` and `subscription_status`.

Required webhook events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `account.updated`

Webhook URL:

`https://detailflow-two.vercel.app/api/stripe/webhook`

## Stripe Connect

Each DetailFlow business connects an Express Stripe account from Settings.

Customer quote payments use a Stripe Checkout Session with a destination charge:

- The customer's full charge is processed by Stripe.
- `application_fee_amount` is retained by DetailFlow.
- The remaining funds are transferred to the business connected account.
- Stripe handles payout timing to the business bank account.

Default platform fee: `2.5%`. Configure with `STRIPE_APPLICATION_FEE_PERCENT` or the business `platform_fee_percent` value.

The business must have both `charges_enabled` and `payouts_enabled` before a customer can pay.

## Security

Never trust billing state from the browser. Verify webhook signatures and record event IDs in `stripe_events` so repeated events are ignored.

Never expose `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.

## Production verification

DetailFlow is configured for live Stripe processing in production. The production server rejects `sk_test_` keys.

1. Create the Pro and Business recurring Prices in Stripe **Live mode** and configure their live `price_...` IDs in Vercel.
2. Configure `STRIPE_SECRET_KEY` with the live `sk_live_...` key.
3. Configure `STRIPE_WEBHOOK_SECRET` from the **Live mode** webhook endpoint.
4. Configure Stripe Connect in Live mode and complete onboarding for each business that will receive customer payments.
5. Verify the connected account has charges and payouts enabled before sending a quote payment link.
6. Run a real low-value production payment and verify the quote changes to `paid`, the payment is visible in Stripe, and the connected business receives the expected payout after Stripe fees and the configured DetailFlow application fee.
7. Use the Stripe Billing Portal for subscription management and verify cancellation state is synchronized by webhooks.
8. Confirm failed payments, refunds, disputes, expired Checkout Sessions, and subscription status changes are reflected in DetailFlow.

Never place Stripe secret keys in browser code, Git, or public environment variables.
