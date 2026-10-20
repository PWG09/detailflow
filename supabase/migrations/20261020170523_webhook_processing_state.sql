-- Stripe webhook processing state and partial refunds.
--
-- The privilege hardening this branch originally carried is already applied by
-- 20261017000000_production_privilege_hardening; this migration adds only what
-- the webhook and refund handling now rely on.
--
-- stripe_events: a row is claimed as 'processing' before handling and marked
-- 'processed' afterwards. A handler that crashes leaves a stale 'processing'
-- row, which the next Stripe retry takes over instead of being ignored as a
-- duplicate. Existing rows are already processed and keep that state.
--
-- Rollback: alter table public.stripe_events drop column status, drop column claimed_at;
--   restore the previous payment_status check without 'partially_refunded'
--   (only after confirming no quote uses it).

alter table public.stripe_events
  add column if not exists status text not null default 'processed',
  add column if not exists claimed_at timestamptz not null default now();
alter table public.stripe_events alter column processed_at drop not null;
alter table public.stripe_events alter column processed_at drop default;
alter table public.stripe_events drop constraint if exists stripe_events_status_check;
alter table public.stripe_events add constraint stripe_events_status_check
  check (status in ('processing', 'processed'));

alter table public.quotes drop constraint if exists quotes_payment_status_check;
alter table public.quotes add constraint quotes_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'disputed'));
