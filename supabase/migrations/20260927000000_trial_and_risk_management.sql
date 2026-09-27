-- 14-day trial + abuse/risk management
alter table public.businesses add column if not exists trial_status text not null default 'none'
  check (trial_status in ('none','active','expired','blocked'));
alter table public.businesses add column if not exists trial_started_at timestamptz;
alter table public.businesses add column if not exists trial_ends_at timestamptz;
alter table public.businesses add column if not exists trial_risk_score integer not null default 0
  check (trial_risk_score between 0 and 100);
alter table public.businesses add column if not exists trial_risk_level text not null default 'low'
  check (trial_risk_level in ('low','review','high'));
alter table public.businesses add column if not exists trial_risk_signals jsonb not null default '{}'::jsonb;

create table if not exists public.trial_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  email_hash text not null,
  ip_hash text not null,
  device_hash text not null,
  phone_hash text,
  payment_fingerprint_hash text,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  risk_level text not null check (risk_level in ('low','review','high')),
  risk_signals jsonb not null default '{}'::jsonb,
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists trial_claims_email_hash_idx on public.trial_claims(email_hash);
create index if not exists trial_claims_ip_hash_idx on public.trial_claims(ip_hash);
create index if not exists trial_claims_device_hash_idx on public.trial_claims(device_hash);
create index if not exists trial_claims_phone_hash_idx on public.trial_claims(phone_hash);
create index if not exists trial_claims_payment_hash_idx on public.trial_claims(payment_fingerprint_hash);

create table if not exists public.auth_verification_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists auth_verification_intents_user_idx on public.auth_verification_intents(user_id);
create index if not exists auth_verification_intents_expires_idx on public.auth_verification_intents(expires_at);

alter table public.trial_claims enable row level security;
alter table public.auth_verification_intents enable row level security;
revoke all on public.trial_claims from anon, authenticated;
revoke all on public.auth_verification_intents from anon, authenticated;
grant all on public.trial_claims to service_role;
grant all on public.auth_verification_intents to service_role;

create index if not exists businesses_trial_expiry_idx on public.businesses(trial_status, trial_ends_at);
