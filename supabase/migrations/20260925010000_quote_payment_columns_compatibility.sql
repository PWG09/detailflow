-- Ensures the quote payment fields exist before the dashboard or Stripe checkout uses them.
-- Safe to run even if the Stripe migration was already applied.
alter table public.quotes
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id text unique;

create index if not exists quotes_payment_status_idx
  on public.quotes (business_id, payment_status);
