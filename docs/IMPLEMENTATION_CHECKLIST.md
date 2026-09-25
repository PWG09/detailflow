# DetailFlow implementation checklist

This checklist reflects the current MVP state after the app, Supabase integration, and production-facing fixes completed in this workspace. A checked item is implemented and verified in code or configured in the live project environment.

## Foundation

- [x] Next.js App Router, TypeScript, responsive UI
- [x] Supabase browser and server clients
- [x] Supabase migration with core tables and tenant RLS
- [x] Environment template and secret separation
- [x] Apply the SQL migration to the Supabase project
- [x] Create the private `vehicle-photos` Storage bucket and policies
- [x] Add production and preview environment variables in Vercel

## Authentication and tenancy

- [x] Registration with email/password
- [x] Login and logout
- [x] Password reset and email verification
- [x] Protected dashboard routes
- [x] Create a business and owner membership during onboarding
- [ ] Staff invitations and owner-only permissions
- [ ] Test two users across two businesses

## Business operations

- [x] Business profile editor and validated unique slug
- [x] Services create, edit, archive, activate/deactivate, reorder
- [x] Business-defined pricing ranges
- [x] Dashboard metrics from real database queries
- [x] Leads list, filters, detail view, status updates
- [x] Customers list and duplicate matching
- [x] Quotes draft, send, view, accept, decline, expire

## Public quote funnel

- [x] Server-side validated public quote submission endpoint
- [x] Validate image count, size, MIME/content signature
- [x] Persist photo paths on the lead
- [x] Rate limit public submissions
- [ ] Confirmation email to customer and lead notification to business

## AI and integrations

- [x] Provider-agnostic AI interface
- [x] Zod validation for structured AI output
- [x] Timeout and fallback behavior
- [x] Stripe Checkout and webhook signature verification
- [ ] Stripe customer portal and production payment smoke test
- [ ] Server-side plan limits
- [ ] Transactional email provider
- [ ] Production-safe logging and optional Sentry

## Quality and launch

- [x] Lint, unit tests, typecheck, production build
- [x] Unit tests for authorization helpers and rate limits
- [ ] Playwright registration, login, service, public quote, upload, lead, quote tests
- [x] Security headers and CSP
- [ ] Privacy and terms reviewed by qualified counsel
- [ ] Backup/export and retention policy
- [ ] Production smoke test and monitoring

## Implementation notes

- The app now includes a working landing page, onboarding flow, protected dashboard routes, a public quote intake flow, and Supabase-backed storage and auth wiring.
- The most important runtime issues around business lookup, membership RLS, and service-role permissions were resolved in code and Supabase migration files.
- Remaining unchecked items require external provider credentials, a staging Supabase project, legal review, or deployment operations that cannot be verified from source code alone.

## Security/UX additions implemented
- Subscription cancellation endpoint with Stripe `cancel_at_period_end`.
- Account deletion workflow for workspace owners with confirmation and server-side authorization.
- Public quote privacy/terms consent validated by Zod on the server.
- Stripe Price amounts loaded server-side for accurate membership display.
- Stripe idempotency keys for subscription and quote Checkout creation.
- Pro → Business subscription change updates the existing Stripe subscription.
- Webhook handling for expired Checkout Sessions and payment disputes.
