# DetailFlow Launch Checklist

## Platform and deployment
- [ ] Supabase project
- [ ] Supabase Auth and email verification
- [ ] All migrations deployed, including Stripe Connect and public quote access
- [ ] Supabase Storage private bucket
- [ ] RLS enabled and cross-tenant tests pass
- [ ] Vercel production deployment
- [ ] Production environment variables configured separately from Preview
- [ ] Custom domain and DNS, if used

## Authentication and accounts
- [ ] Registration works
- [ ] Email verification works
- [ ] Password reset works
- [ ] Session refresh works
- [ ] Account deletion workflow reviewed
- [ ] Shared business data is preserved when a member leaves

## Quotes and customer flow
- [ ] Customer lead request works
- [ ] Photo upload validates MIME, size, extension, and count
- [ ] AI assessment works for eligible plans
- [ ] Quote creation and calculations are server-authoritative
- [ ] Quote status transitions are validated
- [ ] Secure public quote token is random, hashed, expirable, and revocable
- [ ] Public quote page works
- [ ] Accepted quote can open Stripe Checkout
- [ ] Declined/expired/revoked quotes cannot be paid
- [ ] Payment success updates quote to paid via webhook

## Stripe memberships
- [ ] Stripe products and prices created for Pro and Business
- [ ] `STRIPE_PRO_PRICE_ID` configured
- [ ] `STRIPE_BUSINESS_PRICE_ID` configured
- [ ] Customer Portal configured
- [ ] Subscription webhook signature verification works
- [ ] Stripe event idempotency works
- [ ] `invoice.paid` and `invoice.payment_failed` handled
- [ ] Subscription status is server-authoritative

## Stripe Connect payouts
- [ ] Connect Express enabled on the Stripe platform account
- [ ] Detailer can complete Connect onboarding
- [ ] `account.updated` webhook is configured for connected accounts
- [ ] Connected account has `charges_enabled`
- [ ] Connected account has `payouts_enabled`
- [ ] Platform fee percentage is configured and documented
- [ ] Test payment reaches the connected account
- [ ] Test refund/dispute behavior is reviewed
- [ ] Test payout timing is reviewed in Stripe

## AI
- [ ] NVIDIA API configured
- [ ] API key is server-only
- [ ] AI output is validated
- [ ] AI errors do not break quote creation
- [ ] AI rate limiting is production-compatible
- [ ] AI usage limits are enforced server-side

## Email
- [ ] Resend account and verified sender
- [ ] SPF/DKIM configured
- [ ] Quote emails tested
- [ ] Email failures do not falsely mark a quote as sent

## Security
- [ ] RLS cross-tenant isolation tested
- [ ] API authorization tested
- [ ] Zod validation for external input
- [ ] Rate limiting for public quote and AI endpoints
- [ ] Security headers reviewed
- [ ] No secrets in source, Git history, or client bundles
- [ ] Service-role key is server-only
- [ ] Stripe secret and webhook secret are server-only
- [ ] NVIDIA secret is server-only
- [ ] Structured server logging does not contain tokens or secrets

## Privacy / legal
- [ ] Privacy Policy reviewed
- [ ] Terms reviewed
- [ ] Refund/Cancellation Policy reviewed
- [ ] Cookie Policy reviewed
- [ ] Cookie consent used where legally applicable
- [ ] Form consent reviewed
- [ ] Data minimization reviewed
- [ ] Third-party SDK audit completed
- [ ] Tracking/analytics intentionally configured or disabled
- [ ] Data retention reviewed
- [ ] Account deletion reviewed
- [ ] User data export reviewed where required

## Accessibility and UX
- [ ] Keyboard navigation reviewed
- [ ] Focus states reviewed
- [ ] Labels and form errors reviewed
- [ ] Color contrast reviewed
- [ ] Mobile quote flow tested
- [ ] Dashboard mobile layout tested
- [ ] Loading, success, empty, and error states tested

## Quality gates
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] End-to-end smoke test
- [ ] Production smoke test after Vercel deployment

## Required production smoke test

Register → verify email → create business → create service → receive lead → upload photos → AI assessment → create quote → accept quote → create public link → open public quote → pay with Stripe → webhook marks quote paid → connected account receives funds → subscription billing works → Customer Portal works.

Do not label the application production-ready until the relevant items above have actually been verified.

## Added hardening from the security review
- [ ] Test the visible subscription cancel control and confirm cancellation is scheduled in Stripe, not just hidden in the UI.
- [ ] Test the account deletion flow with a disposable workspace; confirm application data and the auth user are removed and storage cleanup is verified.
- [ ] Confirm public quote forms require privacy/terms consent and the consent is validated server-side.
- [ ] Confirm Pro/Business prices displayed in the dashboard are read from Stripe Price objects rather than hardcoded values.
- [ ] Confirm upgrading Pro → Business updates the existing Stripe subscription rather than creating a second subscription.
- [ ] Confirm Stripe Checkout creation uses idempotency keys for membership and quote payments.
- [ ] Test `checkout.session.expired` and dispute/refund webhook behavior.
- [ ] Confirm no marketing email system is enabled without an explicit opt-in/unsubscribe workflow. Current DetailFlow emails are transactional only.
- [ ] Age-gating is not enabled by default because DetailFlow is not currently an age-restricted product; add an age gate only if the final product/legal requirements require one.
- [ ] Finalize legal copy with qualified counsel before launch; the included Privacy/Terms pages are implementation templates, not legal advice.

## Vibe-code security hardening
- [ ] Attempt IDOR against every dashboard resource by replacing UUIDs with an ID from a second test business; expect 404/403 and no data leakage.
- [ ] Verify all dashboard mutations derive `business_id` from the authenticated membership rather than request JSON.
- [ ] Verify no `Access-Control-Allow-Origin: *` header exists on application APIs.
- [ ] Verify cross-origin dashboard POST/PATCH/DELETE requests are rejected.
- [ ] Verify no `dangerouslySetInnerHTML`, raw `innerHTML`, or unsafe HTML rendering is used for user/AI content.
- [ ] Verify uploaded files are size/count/type/magic-byte validated and stored privately.
- [ ] Verify SQL is never built by string concatenation from user input.
- [ ] Verify secret values never appear in client bundles, source, logs, or error responses.
- [ ] Verify production uses `sk_live_...`, Live-mode Price IDs, the Live webhook secret, and Stripe Connect for customer payouts.

## Product realism checklist
- [x] Custom 404 page
- [x] Primary CTA above the fold
- [x] Per-route metadata for public pages and noindex metadata for authenticated/private pages
- [x] Open Graph image
- [x] Favicon
- [x] robots.txt
- [x] sitemap.xml
- [x] Text content rendered with accessible labels and no raw HTML injection
- [x] Mobile breakpoints plus sticky public quote CTA
- [x] Loading states
- [x] Form error/success states
- [x] Quote request thank-you state
- [x] Privacy Policy page
- [x] Terms page
- [x] Cookie banner and Cookie Policy
- [x] Analytics is intentionally disabled until consent/analytics configuration is finalized
- [ ] Configure a real public contact email/address before launch (`NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_CONTACT_ADDRESS`)
