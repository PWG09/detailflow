-- Defense in depth: security_rate_limits is already revoked from anon and
-- authenticated; enabling RLS (with no policies) also satisfies Supabase's
-- security advisor. service_role bypasses RLS, so the limiter is unaffected.
alter table public.security_rate_limits enable row level security;
