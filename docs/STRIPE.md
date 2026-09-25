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

## Production/Test verification

### Memberships
1. Create the Pro recurring Price in Stripe and put its `price_...` ID in `STRIPE_PRO_PRICE_ID`.
2. Create the Business recurring Price and put its `price_...` ID in `STRIPE_BUSINESS_PRICE_ID`.
3. In Stripe Customer Portal settings, allow customers to update/cancel subscriptions and view invoices.
4. In Test mode, subscribe to Pro with Stripe test card `4242 4242 4242 4242` and any future expiry/CVC.
5. Confirm Stripe shows the Checkout Session and subscription, then confirm the DetailFlow workspace changes to `pro` only after the webhook is received.
6. Use the portal to cancel at period end. Confirm `cancel_at_period_end` is true in Stripe and the app continues showing the paid plan until Stripe reports the final cancellation.
7. Test Pro → Business using the app. The existing subscription should be updated instead of creating a second subscription.

### Customer quote payments / Connect
1. In Stripe Test mode, enable Connect and use Express connected accounts.
2. Complete onboarding for a DetailFlow business until `charges_enabled=true` and `payouts_enabled=true`.
3. Accept a quote and open the public payment flow.
4. Pay with `4242 4242 4242 4242`.
5. Confirm the PaymentIntent/Checkout Session contains the quote/business metadata and destination charge.
6. Confirm the platform application fee equals the configured `platform_fee_percent` and the connected account receives the remainder.
7. Confirm the Stripe webhook changes the quote to `paid` and creates a `stripe_events` record.
8. Send the same webhook event again and confirm the endpoint returns `duplicate:true` without changing the record twice.
9. Test a refund in Stripe and confirm the quote becomes `refunded`.
10. Test a dispute event in Test mode and confirm the quote becomes `disputed`.
11. Test an expired Checkout Session and confirm a pending quote returns to `failed`.

### Webhook endpoint
Production endpoint:
`https://detailflow-two.vercel.app/api/stripe/webhook`

Configure these event types on the **platform** webhook endpoint:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `account.updated`
- `charge.refunded`
- `charge.dispute.created`

For Connect, make sure the webhook endpoint is configured to receive events from connected accounts as required by your Stripe Connect setup.
