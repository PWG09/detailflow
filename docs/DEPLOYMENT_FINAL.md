# DetailFlow Security Audit — September 25, 2026

This review is focused on the common "vibe-coded app" failure modes raised in the supplied security checklist: IDOR/broken authorization, SQL injection, XSS, permissive CORS, CSRF, secret exposure, and unsafe file handling.

## Authorization / IDOR

- Dashboard routes derive the workspace from the authenticated user's `business_members` record rather than trusting a `business_id` supplied by the browser.
- Resource routes scope lookups and writes by both the resource ID and the authenticated workspace ID.
- Lead detail rendering explicitly scopes the query to the current workspace in addition to Supabase RLS.
- Supabase RLS policies use `is_business_member()` / `is_business_owner()` to isolate tenants.
- Public quote links use random 32-byte tokens; only SHA-256 token hashes are stored.
- Public quote access does not expose customer records outside the quote represented by the token.

## SQL injection

The application uses Supabase query builders and validated input rather than concatenating SQL strings. User-controlled identifiers such as slugs, UUIDs, status values, and service names are validated before use.

## XSS / HTML injection

- React renders user-controlled text as escaped text; no application page currently uses `dangerouslySetInnerHTML`.
- Email templates now HTML-escape user-controlled names, vehicle fields, service names, and identifiers before interpolation.
- AI output is rendered as React text rather than raw HTML.

## CORS

The application does not add `Access-Control-Allow-Origin: *` or other permissive CORS headers. Browser API calls are intended to be same-origin.

## CSRF / cross-origin mutations

Dashboard and onboarding mutation requests are blocked by middleware when a browser supplies an Origin that is not the current application origin or configured `NEXT_PUBLIC_APP_URL`. Server-to-server requests without an Origin remain possible.

## Headers

The application sends `nosniff`, frame protection, strict referrer policy, Permissions Policy, HSTS, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, and a restrictive Content Security Policy. `unsafe-eval` was removed from the CSP.

## File uploads

Public vehicle uploads are limited to 8 files and 10 MB per file. The server verifies JPEG/PNG magic bytes before storage and stores them in a private Supabase Storage bucket under the authenticated business namespace.

## Secrets

Supabase service-role, Stripe secret/webhook, NVIDIA, and Resend keys are server-side environment variables. They are not imported by client components. Never commit real values to Git or paste them into chat.

## Remaining launch verification

Static review reduces the risk of common authorization bugs but does not replace an integration security test. Before calling the service production-ready, test two separate businesses and verify that changing every visible UUID/token in URLs or request bodies returns 404/403 and never exposes another tenant's data. Also run dependency scanning, lint, typecheck, tests, production build, and a deployed smoke test.

## Abuse, Rate Limiting, CAPTCHA & Cost Controls

- All `/api/*` routes receive an IP-based request throttle in middleware; public routes are stricter than authenticated APIs.
- High-cost public quote, quote-payment, quote-access, and AI operations use persistent Supabase-backed atomic rate limiting when the security migration is installed.
- Public quote submissions support optional Cloudflare Turnstile. Enable it by setting both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel. If the secret is configured, the server requires a valid token.
- AI assessment is throttled per business/user and capped monthly. Pro defaults to 100 assessments/month; Business has a configurable hard cap via `BUSINESS_AI_MONTHLY_HARD_CAP` (default 5000) to prevent runaway AI spend.
- Public quote uploads are capped at 8 images, 10 MB each, and 30 MB total.
- Stripe webhooks are exempt from generic IP throttling so Stripe retries are not blocked.
- The persistent limiter stores only a SHA-256 key hash, not the raw IP/token.
- Apply `supabase/migrations/20260925040000_security_rate_limits.sql` before relying on persistent limiter state in production.


## Public lead-link tenant isolation

Each business receives a canonical public lead URL: `/{businessSlug}/lead`. The browser sends only the slug; the server resolves that slug to exactly one business and creates the lead with that server-derived `business_id`. The submitted service is also looked up with the same `business_id`. There is no client-controlled business ID in the lead creation request.

The resolver never falls back to another business when a slug is invalid. This prevents a broken link from silently sending a customer to the wrong business. Dashboard owners can copy/share their business-specific lead URL from Settings.

Authorization regression test: create two businesses, submit through Business A's `/business-a/lead`, then verify the resulting lead is visible to A and absent from B. Also request `/business-b/lead` while changing form fields and confirm the server still binds the lead to B.


## Canonical customer lead link

After onboarding, share `https://YOUR_DOMAIN/{business-slug}/lead`. The dashboard Settings page exposes the exact link with Copy, Share, and Open actions. Every submitted lead is assigned server-side to the business represented by that slug. Apply migration `20260926000000_public_lead_link_hardening.sql` before launch.


## Stripe production mode

Production deployments require a live Stripe secret (`sk_live_...`). Configure Live-mode Price IDs and the Live webhook signing secret in Vercel. Customer quote payments are Connect payments only; DetailFlow does not expose a direct platform test-payment path in production.

## Customer lead links

Customer leads are intentionally not discoverable from a public business directory. The `/quote` business chooser and legacy `/quote/{businessSlug}` lead route are removed. Each business owner shares the business-specific customer URL from Settings, for example `/{business-slug}/lead`. The customer form resolves the business server-side and writes the lead only to that business. Quote payment links under `/q/{token}` remain separate and are not lead-entry links.
