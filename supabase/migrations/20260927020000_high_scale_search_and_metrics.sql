-- High-scale query optimization for DetailFlow.
-- The dashboard uses tenant-scoped keyset pagination and indexed search.
create extension if not exists pg_trgm;

-- Stable keyset pagination indexes. The id tie-breaker prevents skipped/duplicated
-- rows when multiple records share the same timestamp.
create index if not exists business_members_business_user_idx
  on public.business_members(business_id, user_id);

create index if not exists leads_business_created_id_idx
  on public.leads(business_id, created_at desc, id desc);

create index if not exists customers_business_updated_id_idx
  on public.customers(business_id, updated_at desc, id desc);

create index if not exists quotes_business_created_id_idx
  on public.quotes(business_id, created_at desc, id desc);

-- Fast customer search for ILIKE '%term%' without scanning the whole tenant.
create index if not exists customers_first_name_trgm_idx
  on public.customers using gin (lower(first_name) gin_trgm_ops);

create index if not exists customers_last_name_trgm_idx
  on public.customers using gin (lower(last_name) gin_trgm_ops);

create index if not exists customers_email_trgm_idx
  on public.customers using gin (lower(email) gin_trgm_ops);

-- Leads have structured vehicle data. Keep a small normalized search column so
-- search never needs to stringify/scan the entire JSON payload at read time.
alter table public.leads add column if not exists search_text text not null default '';

create or replace function public.refresh_lead_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text :=
    lower(
      trim(
        concat_ws(
          ' ',
          coalesce(new.status, ''),
          coalesce(to_jsonb(new.vehicle)::text, '')
        )
      )
    );
  return new;
end;
$$;

drop trigger if exists leads_refresh_search_text on public.leads;
create trigger leads_refresh_search_text
before insert or update of status, vehicle on public.leads
for each row execute function public.refresh_lead_search_text();

update public.leads
set search_text = lower(trim(concat_ws(' ', coalesce(status, ''), coalesce(to_jsonb(vehicle)::text, ''))))
where search_text = '';

create index if not exists leads_search_text_trgm_idx
  on public.leads using gin (search_text gin_trgm_ops);

create index if not exists leads_status_trgm_idx
  on public.leads using gin (lower(status) gin_trgm_ops);

-- Workspace counters avoid repeated exact COUNT scans on every dashboard load.
create table if not exists public.business_metrics (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  leads_count bigint not null default 0,
  quotes_count bigint not null default 0,
  customers_count bigint not null default 0,
  won_leads_count bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.ensure_business_metrics(p_business_id uuid)
returns void
language sql
as $$
  insert into public.business_metrics (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;
$$;

create or replace function public.sync_business_metrics_leads()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics
      set leads_count = leads_count + 1,
          won_leads_count = won_leads_count + case when new.status = 'won' then 1 else 0 end,
          updated_at = now()
    where business_id = new.business_id;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.ensure_business_metrics(old.business_id);
    update public.business_metrics
      set leads_count = greatest(0, leads_count - 1),
          won_leads_count = greatest(0, won_leads_count - case when old.status = 'won' then 1 else 0 end),
          updated_at = now()
    where business_id = old.business_id;
    return old;
  end if;

  if new.business_id is distinct from old.business_id then
    perform public.ensure_business_metrics(old.business_id);
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics
      set leads_count = greatest(0, leads_count - 1),
          won_leads_count = greatest(0, won_leads_count - case when old.status = 'won' then 1 else 0 end),
          updated_at = now()
    where business_id = old.business_id;
    update public.business_metrics
      set leads_count = leads_count + 1,
          won_leads_count = won_leads_count + case when new.status = 'won' then 1 else 0 end,
          updated_at = now()
    where business_id = new.business_id;
  elsif old.status is distinct from new.status then
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics
      set won_leads_count = greatest(0, won_leads_count
        - case when old.status = 'won' then 1 else 0 end
        + case when new.status = 'won' then 1 else 0 end),
          updated_at = now()
    where business_id = new.business_id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_business_metrics_quotes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics set quotes_count = quotes_count + 1, updated_at = now()
      where business_id = new.business_id;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.ensure_business_metrics(old.business_id);
    update public.business_metrics set quotes_count = greatest(0, quotes_count - 1), updated_at = now()
      where business_id = old.business_id;
    return old;
  end if;

  if new.business_id is distinct from old.business_id then
    perform public.ensure_business_metrics(old.business_id);
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics set quotes_count = greatest(0, quotes_count - 1), updated_at = now()
      where business_id = old.business_id;
    update public.business_metrics set quotes_count = quotes_count + 1, updated_at = now()
      where business_id = new.business_id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_business_metrics_customers()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics set customers_count = customers_count + 1, updated_at = now()
      where business_id = new.business_id;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.ensure_business_metrics(old.business_id);
    update public.business_metrics set customers_count = greatest(0, customers_count - 1), updated_at = now()
      where business_id = old.business_id;
    return old;
  end if;

  if new.business_id is distinct from old.business_id then
    perform public.ensure_business_metrics(old.business_id);
    perform public.ensure_business_metrics(new.business_id);
    update public.business_metrics set customers_count = greatest(0, customers_count - 1), updated_at = now()
      where business_id = old.business_id;
    update public.business_metrics set customers_count = customers_count + 1, updated_at = now()
      where business_id = new.business_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_sync_business_metrics on public.leads;
create trigger leads_sync_business_metrics
after insert or update of business_id, status or delete on public.leads
for each row execute function public.sync_business_metrics_leads();

drop trigger if exists quotes_sync_business_metrics on public.quotes;
create trigger quotes_sync_business_metrics
after insert or update of business_id or delete on public.quotes
for each row execute function public.sync_business_metrics_quotes();

drop trigger if exists customers_sync_business_metrics on public.customers;
create trigger customers_sync_business_metrics
after insert or update of business_id or delete on public.customers
for each row execute function public.sync_business_metrics_customers();

-- One-time backfill. Future reads use one indexed row per workspace.
with lead_stats as (
  select business_id, count(*)::bigint as leads_count,
    count(*) filter (where status = 'won')::bigint as won_leads_count
  from public.leads group by business_id
), quote_stats as (
  select business_id, count(*)::bigint as quotes_count
  from public.quotes group by business_id
), customer_stats as (
  select business_id, count(*)::bigint as customers_count
  from public.customers group by business_id
)
insert into public.business_metrics (business_id, leads_count, quotes_count, customers_count, won_leads_count)
select b.id,
  coalesce(ls.leads_count, 0),
  coalesce(qs.quotes_count, 0),
  coalesce(cs.customers_count, 0),
  coalesce(ls.won_leads_count, 0)
from public.businesses b
left join lead_stats ls on ls.business_id = b.id
left join quote_stats qs on qs.business_id = b.id
left join customer_stats cs on cs.business_id = b.id
on conflict (business_id) do update set
  leads_count = excluded.leads_count,
  quotes_count = excluded.quotes_count,
  customers_count = excluded.customers_count,
  won_leads_count = excluded.won_leads_count,
  updated_at = now();

alter table public.business_metrics enable row level security;
revoke all on public.business_metrics from anon;
grant select on public.business_metrics to authenticated;

create policy business_metrics_select_member
on public.business_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id = business_metrics.business_id
      and bm.user_id = auth.uid()
  )
);

-- Replace the team page's N+1 auth.admin.getUserById calls with one indexed SQL query.
create or replace function public.get_team_members(p_business_id uuid)
returns table (
  user_id uuid,
  role text,
  created_at timestamptz,
  email text,
  name text
)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select
    bm.user_id,
    bm.role,
    bm.created_at,
    u.email::text,
    nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), '') as name
  from public.business_members bm
  join auth.users u on u.id = bm.user_id
  where bm.business_id = p_business_id
    and exists (
      select 1
      from public.business_members viewer
      where viewer.business_id = p_business_id
        and viewer.user_id = auth.uid()
    )
  order by bm.created_at asc;
$$;

revoke all on function public.get_team_members(uuid) from public;
grant execute on function public.get_team_members(uuid) to authenticated;
