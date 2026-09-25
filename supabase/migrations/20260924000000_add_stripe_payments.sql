alter table public.quotes
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed')),
  add column if not exists stripe_checkout_session_id text unique,
  add column if not exists stripe_payment_intent_id text unique;

create index if not exists quotes_payment_status_idx
  on public.quotes (business_id, payment_status);
