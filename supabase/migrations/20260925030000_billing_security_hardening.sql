-- Billing/security hardening: represent expired checkout sessions and disputes explicitly.
alter table public.quotes drop constraint if exists quotes_payment_status_check;
alter table public.quotes add constraint quotes_payment_status_check
  check (payment_status in ('unpaid','pending','paid','failed','refunded','disputed'));
create index if not exists quotes_stripe_checkout_session_idx on public.quotes(stripe_checkout_session_id);
create index if not exists quotes_stripe_payment_intent_idx on public.quotes(stripe_payment_intent_id);
create index if not exists stripe_events_type_processed_idx on public.stripe_events(event_type, processed_at desc);
