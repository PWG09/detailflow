-- Production privilege hardening.
--
-- The browser holds the publishable key plus the user's JWT, so anything the
-- `authenticated` role may write through PostgREST can be written directly,
-- bypassing the Next.js API routes. Billing, plan, trial, Stripe and payment
-- state must therefore only be writable by the server (service_role).
-- Row Level Security still decides which rows a user can touch; these grants
-- decide which columns.

-- The anonymous role never reads or writes application tables directly:
-- every public flow goes through server routes that use the secret key.
revoke all on
  public.businesses, public.business_members, public.services, public.customers,
  public.leads, public.quotes, public.audit_logs, public.subscriptions,
  public.stripe_events, public.quote_public_access, public.security_rate_limits,
  public.trial_claims, public.auth_verification_intents, public.business_metrics
from anon;

-- businesses: workspaces are created by /api/onboarding/business (service
-- role) so plan/trial fields cannot be self-assigned. Owners may only edit
-- profile columns.
revoke insert, update, delete, truncate, references, trigger on public.businesses from authenticated;
grant select on public.businesses to authenticated;
grant update (name, slug, description, email, phone, currency, tax_rate, logo_url, brand_color, updated_at)
  on public.businesses to authenticated;
drop policy if exists "authenticated create businesses" on public.businesses;

-- business_members: team changes go through /api/dashboard/team (service
-- role) where plan seat limits are enforced.
revoke insert, update, delete, truncate, references, trigger on public.business_members from authenticated;
grant select on public.business_members to authenticated;

-- subscriptions: written only by the Stripe webhook and billing routes.
revoke insert, update, delete, truncate, references, trigger on public.subscriptions from authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists "owners manage subscriptions" on public.subscriptions;

-- audit_logs: written only by the server.
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;
drop policy if exists "members insert audit logs" on public.audit_logs;

-- business_metrics: maintained by triggers only.
revoke insert, update, delete, truncate, references, trigger on public.business_metrics from authenticated;
grant select on public.business_metrics to authenticated;

-- quotes: members manage quote content; payment state is owned by Stripe.
revoke insert, update, truncate, references, trigger on public.quotes from authenticated;
grant select, delete on public.quotes to authenticated;
grant insert (business_id, lead_id, customer_id, quote_number, services, adjustments, subtotal, tax, total, status, expires_at, notes)
  on public.quotes to authenticated;
grant update (services, adjustments, subtotal, tax, total, status, expires_at, notes, updated_at)
  on public.quotes to authenticated;

-- leads: members manage pipeline fields. AI results/usage counters and photo
-- paths are server-owned (they drive the monthly AI cost cap).
revoke insert, update, truncate, references, trigger on public.leads from authenticated;
grant select, delete on public.leads to authenticated;
grant update (status, notes, lost_reason, contacted_at, quoted_at, closed_at, updated_at)
  on public.leads to authenticated;

-- Trial abuse records must survive account/workspace deletion, otherwise a
-- user could delete their workspace and claim a fresh trial with the same
-- email/device. Only HMAC hashes are stored.
alter table public.trial_claims alter column business_id drop not null;
alter table public.trial_claims drop constraint if exists trial_claims_business_id_fkey;
alter table public.trial_claims
  add constraint trial_claims_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;
alter table public.trial_claims drop constraint if exists trial_claims_user_id_fkey;
alter table public.trial_claims
  add constraint trial_claims_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Vehicle photos: enforce the same limits as the upload route at the
-- storage layer.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'vehicle-photos';

-- Housekeeping for server-side security state, called by the daily cron.
create or replace function public.cleanup_security_state()
returns table(rate_limits_deleted integer, verification_intents_deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  limits_deleted integer := 0;
  intents_deleted integer := 0;
begin
  delete from public.security_rate_limits where reset_at < now() - interval '1 day';
  get diagnostics limits_deleted = row_count;

  delete from public.auth_verification_intents where expires_at < now() - interval '7 days';
  get diagnostics intents_deleted = row_count;

  return query select limits_deleted, intents_deleted;
end;
$$;

revoke all on function public.cleanup_security_state() from public, anon, authenticated;
grant execute on function public.cleanup_security_state() to service_role;

-- Internal helpers that should never be callable through the REST API.
revoke all on function public.purge_old_vehicle_photos(integer) from public, anon, authenticated;
revoke all on function public.add_business_owner_membership() from public, anon, authenticated;
