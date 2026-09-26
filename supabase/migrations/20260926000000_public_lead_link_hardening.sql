-- Canonical public lead links: business slugs are case-insensitive and must remain unique.
create unique index if not exists businesses_slug_lower_unique_idx on public.businesses (lower(slug));

-- Keep public lead links fast to resolve.
create index if not exists businesses_slug_idx on public.businesses(slug);

-- Lead inboxes are queried newest-first per business.
create index if not exists leads_business_status_created_idx on public.leads(business_id, status, created_at desc);
