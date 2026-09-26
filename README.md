# DetailFlow

DetailFlow is a quote funnel and lead workspace for automotive detailers. The first workflow is intentionally narrow: configure a business, publish a public quote link, collect vehicle details and photos, calculate a business-controlled estimate, and follow up from a lead inbox.

## Current implementation

- Next.js App Router + TypeScript + React
- Responsive marketing page, public quote flow, and dashboard shell
- Deterministic pricing engine in `lib/pricing.ts`
- Supabase Auth, PostgreSQL, Storage, and Row Level Security
- Vitest pricing coverage
- Configuration-first environment variables in `.env.example`

The core application is connected to Supabase: authentication, business onboarding, services, public quote submission, private photos, customers, leads, and quote lifecycle management. External billing, email, AI, monitoring, and backup providers still require their production credentials and provider configuration.

## Requirements

- Node.js 20 LTS or newer
- npm 10+
- Supabase project on the Free plan
- Vercel account for the primary deployment
- Stripe, Resend/Postmark, and an AI provider only when those features are enabled

## Local development

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`, `http://localhost:3000/quote`, and `http://localhost:3000/dashboard` after signing in.

Validation commands:

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` runs ESLint and `npm run build` performs the production compilation and type validation.

## Supabase setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). The Free plan is enough for local development and an early MVP, although inactive projects may be paused.
2. In **Project Settings > API**, copy **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the **publishable/anon key** into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It may be used in the browser because Row Level Security protects the database.
4. Copy the **service_role key** into `SUPABASE_SERVICE_ROLE_KEY` only in local `.env.local` and Vercel server-only variables. Never commit or expose it.
5. In **Authentication > Providers**, enable Email and configure the site URL as `http://localhost:3000` during development.
6. In **Authentication > URL Configuration**, add the production Vercel domain and allowed redirect URLs before deploying.
7. Create a private Storage bucket named `vehicle-photos`. Do not make it public; the app must use authenticated access or signed URLs.
8. Run the database schema and Row Level Security migration from `supabase/migrations/` in the Supabase SQL Editor.
9. Add these values to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The application uses Supabase Auth, PostgreSQL, Storage, and RLS. Firebase is not part of the active backend architecture.

For the exact external setup and Foundation smoke test, read [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Data and authorization

The data model is documented in [docs/DATABASE.md](docs/DATABASE.md). Every operational row contains a `business_id` and is protected by Supabase Row Level Security. Customer photos are private Storage objects under the business and lead path.

Do not place the Supabase service-role key in `NEXT_PUBLIC_*` variables. Browser queries use the anon key and RLS; server actions may use the service-role key only after verifying the authenticated user and business membership.

## External services checklist

| SERVICE | REQUIRED? | WHY | ACCOUNT | CONFIGURATION | ENV VARS | PRODUCTION STEPS |
|---|---|---|---|---|---|---|
| Supabase Auth | Required | Account identity | Supabase Dashboard | Email provider, authorized domains | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enable email auth, test verification/reset flows |
| Supabase PostgreSQL | Required | Tenant data | Supabase Dashboard | SQL schema and RLS policies | `SUPABASE_SERVICE_ROLE_KEY` server-side | Run migrations, test tenant isolation |
| Supabase Storage | Required | Vehicle photos | Supabase Dashboard | Private bucket and Storage policies | `NEXT_PUBLIC_SUPABASE_URL`, server key | Create private bucket, test signed URLs and denied cross-tenant reads |
| AI provider | Optional for fallback | Photo assessment | Chosen provider | Structured JSON + timeout | `AI_PROVIDER_API_KEY` | Validate schema, rate-limit, monitor failure fallback |
| Stripe | Required for paid plans | Billing | Stripe Dashboard | Products, prices, webhook | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key | Verify signatures and subscription state |
| Transactional email | Required before launch | Lead/quote notices | Resend or Postmark | Verified sender/domain | `EMAIL_PROVIDER_API_KEY` | Verify domain and SPF/DKIM |
| Vercel | Required deployment | Web hosting | Vercel | GitHub project and env vars | `NEXT_PUBLIC_APP_URL` | Deploy production branch and smoke test |
| Sentry | Optional | Error visibility | Sentry | DSN and source maps | `SENTRY_DSN` | Confirm PII scrubbing |

## Stripe

Create products for Free, Pro, and Business in Stripe. Store price IDs in environment variables rather than source code. Implement a server-only checkout route and a webhook route that verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`; Stripe events are authoritative for plan state. Never store card data.

For local webhook testing, use the Stripe CLI and forward to the deployed route. Add events for checkout completion, subscription updates, cancellation, and invoice payment failures.

## Email and AI

Choose one provider, verify a sending domain, and keep API calls server-side. AI output must be parsed by a Zod schema and treated as advisory. A provider timeout or malformed response must leave the deterministic pricing flow usable.

## Vercel deployment

1. Push this repository to GitHub.
2. Import it into Vercel with the root directory set to this project.
3. Add every variable from `.env.example` in Preview and Production separately.
4. Set the production branch and `NEXT_PUBLIC_APP_URL` to the final domain.
5. Add the Vercel domain to Supabase Authentication redirect URLs.
6. Configure the Stripe webhook URL and email sending domain.
7. Run the smoke checks in [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

Vercel is the deployment target described above; Supabase hosts the backend services.

## Security checklist

- [ ] Server-side ID token verification for every protected mutation
- [ ] Supabase SQL migrations and RLS policies deployed from source control
- [ ] Business membership checked by RLS on every tenant read/write
- [ ] Zod validation on auth, profile, services, leads, AI output, and webhooks
- [ ] Upload size, extension, MIME sniffing, count, and Storage path validation
- [ ] Rate limits on public submissions, AI requests, auth-sensitive routes, and webhooks
- [ ] Stripe signatures verified before processing events
- [ ] Secrets kept outside client bundles and logs
- [ ] Security headers, CSP, and frame protection enabled in production
- [ ] Customer photo retention and privacy language reviewed by counsel

## Before you can launch

- [x] Replace the demo quote submit with a server-side Supabase service-role route.
- [ ] Create the Supabase project, run migrations, and test tenant isolation with two accounts.
- [ ] Connect real email, Stripe, AI, and rate-limit providers.
- [x] Finish password reset and server session verification for the dashboard.
- [ ] Run Playwright flows against a staging Supabase project.
- [ ] Review [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) end to end.

## Production completion notes

The completed build includes production-oriented billing entitlements, Stripe subscription lifecycle handling, customer/business email notifications through Resend, configurable OpenAI-compatible vision AI, Pro AI limits, team invitations, audit logs, data export, cookie consent, lead lifecycle timestamps, stronger upload validation, and deployment documentation.

See `docs/DEPLOYMENT_FINAL.md` before deploying. Secrets are intentionally excluded from the project archive.

## Production abuse protection

Apply the migration `supabase/migrations/20260925040000_security_rate_limits.sql`.

Optional Cloudflare Turnstile for public quote submissions:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Cost-control default:
- Pro AI: 100 assessments/month
- Business AI hard cap: 5000/month unless `BUSINESS_AI_MONTHLY_HARD_CAP` is set

The API also applies global request throttling and stricter persistent limits to expensive public/payment/AI operations.
