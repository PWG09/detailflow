create extension if not exists pg_trgm;

-- Query paths used by the dashboard/public lead flow.
-- business_members is keyed by (business_id, user_id), while most server
-- lookups start from user_id.
create index if not exists business_members_user_business_idx
  on public.business_members (user_id, business_id);

create index if not exists customers_business_updated_idx
  on public.customers (business_id, updated_at desc, id desc);

create index if not exists leads_business_updated_idx
  on public.leads (business_id, updated_at desc, id desc);

create index if not exists leads_business_customer_idx
  on public.leads (business_id, customer_id);

create index if not exists leads_business_service_idx
  on public.leads (business_id, service_id);

create index if not exists quotes_business_created_idx
  on public.quotes (business_id, created_at desc, id desc);

create index if not exists quotes_business_lead_idx
  on public.quotes (business_id, lead_id);

create index if not exists quotes_business_customer_idx
  on public.quotes (business_id, customer_id);

-- Search is performed with a contains/ILIKE query. A trigram index avoids
-- scanning every lead as the workspace grows.
alter table public.leads
  add column if not exists search_text text
  generated always as (
    lower(
      coalesce(status::text, '') || ' ' ||
      coalesce(vehicle::text, '') || ' ' ||
      coalesce(condition::text, '') || ' ' ||
      coalesce(notes, '')
    )
  ) stored;

create index if not exists leads_search_text_trgm_idx
  on public.leads using gin (search_text gin_trgm_ops);

-- Helpful for the monthly lead-cap count used during public submissions.
create index if not exists leads_business_created_status_idx
  on public.leads (business_id, created_at desc, status);

-- Helpful for public service resolution.
create index if not exists services_business_active_order_idx
  on public.services (business_id, active, display_order);
