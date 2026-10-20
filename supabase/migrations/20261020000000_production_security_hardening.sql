-- DetailFlow production hardening.
--
-- Goals
--   1. Billing, Stripe, trial and payment columns become server-authoritative.
--      Browser sessions (anon / authenticated) can no longer write them through
--      the public Supabase REST API. All such writes go through server routes
--      that use the secret key.
--   2. Lead photo paths and AI fields can no longer be rewritten by members, so
--      a member cannot point a lead at another tenant's Storage objects.
--   3. Metrics triggers run with the privileges they need (previously they ran
--      as the invoking user, who has no write access to business_metrics).
--   4. Repair the lead search trigger / team function from 20260927020000,
--      which contained statements that cannot succeed as written.
--   5. Stripe webhook events get an explicit processing state so a crashed
--      handler is retried instead of being treated as a duplicate.
--
-- Every statement is idempotent and safe to re-run. No data is deleted.
--
-- Rollback (if a regression is found): re-grant the previous broad privileges
--   grant select, insert, update on public.businesses to authenticated;
--   grant select, insert, update, delete on public.quotes, public.leads,
--     public.customers, public.business_members to authenticated;
--   grant select, insert, update on public.subscriptions to authenticated;
-- Note that rolling back re-opens the privilege-escalation issue fixed here.

begin;

-- ---------------------------------------------------------------------------
-- 1. Table privileges. RLS remains in force; these grants narrow what columns
--    an authenticated session may touch at all.
-- ---------------------------------------------------------------------------

-- Public (anon) traffic never reads tenant tables directly; the public lead and
-- quote routes use the server key.
revoke all on public.businesses, public.business_members, public.services,
  public.customers, public.leads, public.quotes
  from anon;

-- businesses: read via RLS; profile fields editable by owners (RLS policy
-- "owners update businesses"). Creation and deletion are server-only.
revoke all on public.businesses from authenticated;
grant select on public.businesses to authenticated;
grant update (name, slug, description, email, phone, currency, tax_rate,
  logo_url, brand_color, updated_at) on public.businesses to authenticated;

-- business_members: membership changes are server-only (team route).
revoke all on public.business_members from authenticated;
grant select on public.business_members to authenticated;

-- services: members manage their own catalogue (RLS "members manage services").
revoke all on public.services from authenticated;
grant select, insert, update, delete on public.services to authenticated;

-- customers: profile fields only; normalized_email and business_id stay fixed.
revoke all on public.customers from authenticated;
grant select on public.customers to authenticated;
grant update (first_name, last_name, phone, notes, updated_at)
  on public.customers to authenticated;

-- leads: workflow fields only. Photo paths, AI output, estimate and source are
-- written by the server.
revoke all on public.leads from authenticated;
grant select on public.leads to authenticated;
grant update (status, notes, lost_reason, contacted_at, quoted_at, closed_at, updated_at)
  on public.leads to authenticated;

-- quotes: members create drafts and move status; payment fields are
-- server-only (Stripe webhook / checkout routes).
revoke all on public.quotes from authenticated;
grant select on public.quotes to authenticated;
grant insert (business_id, lead_id, customer_id, quote_number, services,
  adjustments, subtotal, tax, total, status, expires_at, notes)
  on public.quotes to authenticated;
grant update (status, notes, expires_at, updated_at) on public.quotes to authenticated;

-- subscriptions, audit logs and metrics are written by the server only. These
-- tables come from later migrations, so guard for databases where they are absent.
do $$
declare
  t text;
begin
  foreach t in array array['subscriptions', 'audit_logs', 'business_metrics'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('grant select on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Metrics triggers. They must write business_metrics regardless of who
--    changed the lead/quote/customer row. Only NEW/OLD business ids are used.
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.ensure_business_metrics(uuid)',
    'public.sync_business_metrics_leads()',
    'public.sync_business_metrics_quotes()',
    'public.sync_business_metrics_customers()'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s security definer set search_path = public', fn);
    end if;
  end loop;
  if to_regprocedure('public.ensure_business_metrics(uuid)') is not null then
    revoke all on function public.ensure_business_metrics(uuid) from public, anon, authenticated;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Lead search text. 20260927000000_performance_indexes may have created
--    search_text as a GENERATED column, in which case the trigger from
--    20260927020000 cannot write it. Reconcile both possible states.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_lead_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_text := lower(trim(concat_ws(' ',
    coalesce(new.status::text, ''),
    coalesce(new.vehicle::text, ''),
    coalesce(new.condition::text, ''),
    coalesce(new.notes, '')
  )));
  return new;
end;
$$;

do $$
declare
  generated_kind "char";
begin
  select a.attgenerated into generated_kind
  from pg_attribute a
  where a.attrelid = 'public.leads'::regclass
    and a.attname = 'search_text'
    and not a.attisdropped;

  if not found then
    alter table public.leads add column search_text text not null default '';
    generated_kind := '';
  end if;

  if generated_kind = 's' then
    -- The generated column already maintains itself.
    drop trigger if exists leads_refresh_search_text on public.leads;
  else
    drop trigger if exists leads_refresh_search_text on public.leads;
    create trigger leads_refresh_search_text
      before insert or update of status, vehicle, condition, notes on public.leads
      for each row execute function public.refresh_lead_search_text();
    update public.leads set search_text = lower(trim(concat_ws(' ',
      coalesce(status::text, ''), coalesce(vehicle::text, ''),
      coalesce(condition::text, ''), coalesce(notes, ''))));
  end if;
end;
$$;

create extension if not exists pg_trgm;
create index if not exists leads_search_text_trgm_idx
  on public.leads using gin (search_text gin_trgm_ops);
-- lower() is not defined for the lead_status enum; this index could never be built.
drop index if exists public.leads_status_trgm_idx;

-- ---------------------------------------------------------------------------
-- 4. Team listing: return role as text explicitly.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_members(p_business_id uuid)
returns table (user_id uuid, role text, created_at timestamptz, email text, name text)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select bm.user_id, bm.role::text, bm.created_at, u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), '')
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  where bm.business_id = p_business_id
    and exists (
      select 1 from public.business_members viewer
      where viewer.business_id = p_business_id and viewer.user_id = auth.uid()
    )
  order by bm.created_at asc;
$$;
revoke all on function public.get_team_members(uuid) from public, anon;
grant execute on function public.get_team_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Stripe webhook processing state.
-- ---------------------------------------------------------------------------
alter table public.stripe_events
  add column if not exists status text not null default 'processed',
  add column if not exists claimed_at timestamptz not null default now();
alter table public.stripe_events alter column processed_at drop not null;
alter table public.stripe_events alter column processed_at drop default;
alter table public.stripe_events drop constraint if exists stripe_events_status_check;
alter table public.stripe_events add constraint stripe_events_status_check
  check (status in ('processing', 'processed'));

-- ---------------------------------------------------------------------------
-- 6. Payment states: represent partial refunds without claiming a full refund.
-- ---------------------------------------------------------------------------
alter table public.quotes drop constraint if exists quotes_payment_status_check;
alter table public.quotes add constraint quotes_payment_status_check
  check (payment_status in ('unpaid','pending','paid','failed','refunded','partially_refunded','disputed'));

-- ---------------------------------------------------------------------------
-- 7. Trial abuse signals must outlive account deletion; otherwise deleting a
--    workspace erases the record that a trial was used. Only hashes are kept.
-- ---------------------------------------------------------------------------
do $$
declare
  fk record;
begin
  if to_regclass('public.trial_claims') is not null then
    alter table public.trial_claims alter column business_id drop not null;
    -- Drop whatever the existing foreign keys are called, then recreate them.
    for fk in
      select conname from pg_constraint
      where conrelid = 'public.trial_claims'::regclass and contype = 'f'
        and confrelid in ('public.businesses'::regclass, 'auth.users'::regclass)
    loop
      execute format('alter table public.trial_claims drop constraint %I', fk.conname);
    end loop;
    alter table public.trial_claims add constraint trial_claims_business_id_fkey
      foreign key (business_id) references public.businesses(id) on delete set null;
    alter table public.trial_claims add constraint trial_claims_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end;
$$;

-- Deterministic membership resolution (owner first, then oldest).
create index if not exists business_members_user_created_idx
  on public.business_members (user_id, created_at);

commit;
