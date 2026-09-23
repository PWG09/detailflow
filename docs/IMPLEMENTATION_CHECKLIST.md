# DetailFlow implementation checklist

This checklist distinguishes code that exists from production work that is complete. A checked item must be verified against the deployed Supabase/Vercel environment.

## Foundation

- [x] Next.js App Router, TypeScript, responsive UI
- [x] Supabase browser and server clients
- [x] Supabase migration with core tables and tenant RLS
- [x] Environment template and secret separation
- [ ] Apply the SQL migration to the Supabase project
- [ ] Create the private `vehicle-photos` Storage bucket and policies
- [ ] Add production and preview environment variables in Vercel

## Authentication and tenancy

- [ ] Registration with email/password
- [ ] Login and logout
- [ ] Password reset and email verification
- [ ] Protected dashboard routes
- [ ] Create a business and owner membership during onboarding
- [ ] Staff invitations and owner-only permissions
- [ ] Test two users across two businesses

## Business operations

- [ ] Business profile editor and validated unique slug
- [ ] Services create, edit, archive, activate/deactivate, reorder
- [ ] Business-defined pricing adjustments
- [ ] Dashboard metrics from real database queries
- [ ] Leads list, filters, detail view, status updates
- [ ] Customers list and duplicate matching
- [ ] Quotes draft, send, view, accept, decline, expire

## Public quote funnel

- [x] Server-side validated public quote submission endpoint
- [ ] Validate image count, size, MIME/content signature
- [ ] Persist photo paths on the lead
- [ ] Rate limit public submissions
- [ ] Confirmation email to customer and lead notification to business

## AI and integrations

- [ ] Provider-agnostic AI interface
- [ ] Zod validation for structured AI output
- [ ] Timeout, malformed response, rate-limit, and fallback behavior
- [ ] Stripe checkout, portal, webhook signature verification
- [ ] Server-side plan limits
- [ ] Transactional email provider
- [ ] Production-safe logging and optional Sentry

## Quality and launch

- [x] Lint, unit tests, typecheck, production build
- [ ] Unit tests for auth, authorization, quote creation, AI parsing, limits
- [ ] Playwright registration, login, service, public quote, upload, lead, quote tests
- [ ] Security headers and CSP
- [ ] Privacy and terms reviewed by qualified counsel
- [ ] Backup/export and retention policy
- [ ] Production smoke test and monitoring
