-- A verification intent is created before Supabase Auth returns the new user id.
-- The user id is attached immediately after signUp(), so it must be nullable
-- during the initial verification-intent creation step.
alter table public.auth_verification_intents
  alter column user_id drop not null;

-- Keep service-role-only access; clients must never read or write these records.
revoke all on public.auth_verification_intents from anon, authenticated;
grant all on public.auth_verification_intents to service_role;
