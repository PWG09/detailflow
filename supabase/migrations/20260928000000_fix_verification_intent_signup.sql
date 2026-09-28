-- Repair verification-intent schema for databases where the trial/risk migration
-- was not applied or was deployed before the signup flow was corrected.
create table if not exists public.auth_verification_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email_hash text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.auth_verification_intents
  alter column user_id drop not null;

alter table public.auth_verification_intents
  add column if not exists email_hash text;

create index if not exists auth_verification_intents_user_idx
  on public.auth_verification_intents(user_id);

create index if not exists auth_verification_intents_expires_idx
  on public.auth_verification_intents(expires_at);

alter table public.auth_verification_intents enable row level security;
revoke all on public.auth_verification_intents from anon, authenticated;
grant all on public.auth_verification_intents to service_role;
