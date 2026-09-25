# DetailFlow production deployment

## Required environment variables
Set all values from `.env.example` in Vercel. Never commit `.env.local` or secrets.

## Supabase
Run every migration in `supabase/migrations` in order, including `20260925000000_production_completion.sql`.
Enable email invitations in Supabase Auth if using Team invites.

## Stripe
Create a recurring Pro price and set `STRIPE_PRO_PRICE_ID`.
Create a webhook for `/api/stripe/webhook` and subscribe to:
- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted

## Email
Configure Resend with a verified sending domain. Set `RESEND_API_KEY` and `EMAIL_FROM`.

## AI
DetailFlow uses an OpenAI-compatible vision endpoint. Set `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`. NVIDIA NIM or another compatible endpoint can be used without changing application code.
AI output is advisory only and never sets a final price automatically.

## Verification
Run locally from a clean install:
```bash
npm ci
npm run typecheck
npm test
npm run build
```
Then verify registration, onboarding, public quote, photo upload, lead creation, AI assessment, email notifications, Stripe subscription, Stripe quote payment, team invite, RLS isolation, export, password reset, privacy/terms and mobile layouts.


## NVIDIA AI configuration

DetailFlow's vehicle-photo assessment uses an OpenAI-compatible NVIDIA NIM endpoint. The current default is `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, an omni-modal model that accepts image input. NVIDIA documents the endpoint at `https://integrate.api.nvidia.com/v1/chat/completions`.

Set these Vercel Production environment variables:

- `AI_API_KEY` = your NVIDIA API key
- `AI_BASE_URL` = `https://integrate.api.nvidia.com/v1`
- `AI_MODEL` = `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`

The application also accepts `NVIDIA_API_KEY` instead of `AI_API_KEY`. Redeploy after changing production environment variables.
