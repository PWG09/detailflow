# DetailFlow

DetailFlow is a quote funnel and lead workspace for automotive detailers. The first workflow is intentionally narrow: configure a business, publish a public quote link, collect vehicle details and photos, calculate a business-controlled estimate, and follow up from a lead inbox.

## Current implementation

- Next.js App Router + TypeScript + React
- Responsive marketing page, public quote flow, and dashboard shell
- Deterministic pricing engine in `lib/pricing.ts`
- Firebase client boundary in `lib/firebase/client.ts`
- Firestore and Storage rules with business membership isolation
- Vitest pricing coverage
- Configuration-first environment variables in `.env.example`

The UI is deployable, but external production services are intentionally not claimed as connected until their real credentials are supplied. The public demo route is a UI flow and should be connected to a server-side Firestore submission action before launch.

## Requirements

- Node.js 20 LTS or newer
- npm 10+
- Firebase project
- Vercel account for the primary deployment
- Stripe, Resend/Postmark, and an AI provider only when those features are enabled

## Local development

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`, `http://localhost:3000/quote/demo-detailing`, and `http://localhost:3000/dashboard`.

Validation commands:

```bash
npm run typecheck
npm test
npm run build
```

`npm run lint` should be wired to the chosen ESLint flat-config command before production launch. Next build currently performs its own lint/type validation.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. Enable Email/Password in Authentication.
3. Create Firestore in production mode and Storage in the region closest to the business.
4. Copy the web app values into the `NEXT_PUBLIC_FIREBASE_*` variables.
5. Install the Firebase CLI, run `firebase login`, and select the project with `firebase use --add`.
6. Deploy boundaries from the repository root:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Read the complete sequence in [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).

## Data and authorization

The data model is documented in [docs/DATABASE.md](docs/DATABASE.md). Every operational document is nested below a business and checked against `businesses/{businessId}/members/{uid}`. Customer photos are private Storage objects; public business assets are a separate path.

Do not place Admin SDK credentials in `NEXT_PUBLIC_*` variables. For server actions or route handlers, use a server-only Admin module and verify the Firebase ID token before reading or mutating tenant data.

## External services checklist

| SERVICE | REQUIRED? | WHY | ACCOUNT | CONFIGURATION | ENV VARS | PRODUCTION STEPS |
|---|---|---|---|---|---|---|
| Firebase Auth | Required | Account identity | Firebase Console | Email/password, authorized domains | `NEXT_PUBLIC_FIREBASE_*` | Enable provider, test verification/reset flows |
| Firestore | Required | Tenant data | Firebase Console | Rules and indexes in repo | `FIREBASE_ADMIN_*` server-side | Deploy rules, test tenant isolation |
| Firebase Storage | Required | Vehicle photos | Firebase Console | Private lead paths, size/type limits | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Deploy Storage rules, test denied cross-tenant reads |
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
5. Add the Vercel domain to Firebase Authentication authorized domains.
6. Configure the Stripe webhook URL and email sending domain.
7. Run the smoke checks in [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

Firebase Hosting is an optional alternative, not a requirement for the Vercel deployment described above.

## Security checklist

- [ ] Server-side ID token verification for every protected mutation
- [ ] Firestore and Storage rules deployed from source control
- [ ] Business membership checked on every tenant read/write
- [ ] Zod validation on auth, profile, services, leads, AI output, and webhooks
- [ ] Upload size, extension, MIME sniffing, count, and Storage path validation
- [ ] Rate limits on public submissions, AI requests, auth-sensitive routes, and webhooks
- [ ] Stripe signatures verified before processing events
- [ ] Secrets kept outside client bundles and logs
- [ ] Security headers, CSP, and frame protection enabled in production
- [ ] Customer photo retention and privacy language reviewed by counsel

## Before you can launch

- [ ] Replace the demo quote submit with an authenticated server route/Cloud Function.
- [ ] Create the Firebase project, deploy rules, and test tenant isolation with two accounts.
- [ ] Connect real email, Stripe, AI, and rate-limit providers.
- [ ] Finish auth screens and server session verification for the dashboard.
- [ ] Run Playwright flows against a staging Firebase project.
- [ ] Review [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) end to end.
