alter table public.businesses add column if not exists plan text not null default 'free' check (plan in ('free','pro'));
alter table public.businesses add column if not exists stripe_customer_id text unique;
alter table public.businesses add column if not exists stripe_subscription_id text unique;
alter table public.businesses add column if not exists subscription_status text;
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists brand_color text;

alter table public.leads add column if not exists ai_assessment jsonb;
alter table public.leads add column if not exists ai_assessed_at timestamptz;
alter table public.leads add column if not exists contacted_at timestamptz;
alter table public.leads add column if not exists quoted_at timestamptz;
alter table public.leads add column if not exists closed_at timestamptz;
alter table public.leads add column if not exists lost_reason text;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null, action text not null, entity_type text not null,
  entity_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_logs_business_created_idx on public.audit_logs(business_id, created_at desc);
alter table public.audit_logs enable row level security;
create policy "members read audit logs" on public.audit_logs for select using (public.is_business_member(business_id));
create policy "members insert audit logs" on public.audit_logs for insert with check (public.is_business_member(business_id));

drop policy if exists "owners manage memberships" on public.business_members;
create policy "owners manage memberships" on public.business_members for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create or replace function public.purge_old_vehicle_photos(retention_days integer default 180)
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer := 0;
begin
  -- Storage objects are intentionally left for the scheduled job to remove after this query identifies them.
  select count(*) into removed from public.leads where updated_at < now() - make_interval(days => retention_days) and cardinality(photo_paths) > 0;
  return removed;
end;
$$;
revoke all on function public.purge_old_vehicle_photos(integer) from public;
