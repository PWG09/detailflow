-- DetailFlow billing hardening: Stripe Connect payouts + full membership model.
alter table public.businesses drop constraint if exists businesses_plan_check;
alter table public.businesses add constraint businesses_plan_check check (plan in ('free','pro','business'));

alter table public.businesses add column if not exists stripe_connected_account_id text unique;
alter table public.businesses add column if not exists stripe_connect_status text not null default 'not_connected';
alter table public.businesses add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.businesses add column if not exists stripe_payouts_enabled boolean not null default false;
alter table public.businesses add column if not exists stripe_details_submitted boolean not null default false;
alter table public.businesses add column if not exists platform_fee_percent numeric(5,2) not null default 2.50 check (platform_fee_percent >= 0 and platform_fee_percent <= 100);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null check (plan in ('pro','business')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists public.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create table if not exists public.quote_public_access (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_public_access_quote_idx on public.quote_public_access(quote_id);

alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.quote_public_access enable row level security;

create policy "members read subscriptions" on public.subscriptions for select using (public.is_business_member(business_id));
create policy "owners manage subscriptions" on public.subscriptions for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- Stripe events and public quote access are server-managed. No browser access is granted.
revoke all on public.stripe_events from anon, authenticated;
revoke all on public.quote_public_access from anon, authenticated;
grant all on public.subscriptions to service_role;
grant all on public.stripe_events to service_role;
grant all on public.quote_public_access to service_role;

grant select, insert, update on public.subscriptions to authenticated;

-- Allow Stripe-originated refunds to be represented in quote payment state.
alter table public.quotes drop constraint if exists quotes_payment_status_check;
alter table public.quotes add constraint quotes_payment_status_check check (payment_status in ('unpaid','pending','paid','failed','refunded'));
