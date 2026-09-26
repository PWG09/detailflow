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
