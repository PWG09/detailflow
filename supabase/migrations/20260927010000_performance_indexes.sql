-- Performance indexes for the high-volume workspace access patterns.
-- These complement the existing business_created indexes and keep tenant-scoped
-- lists/counts fast as each business grows.
create index if not exists business_members_user_business_idx
  on public.business_members(user_id, business_id);

create index if not exists customers_business_updated_idx
  on public.customers(business_id, updated_at desc);

create index if not exists leads_business_status_created_idx
  on public.leads(business_id, status, created_at desc);

create index if not exists leads_business_customer_idx
  on public.leads(business_id, customer_id);

create index if not exists quotes_business_created_idx
  on public.quotes(business_id, created_at desc);

create index if not exists quotes_business_customer_idx
  on public.quotes(business_id, customer_id);

create index if not exists quotes_business_payment_status_idx
  on public.quotes(business_id, payment_status, created_at desc);

create index if not exists services_business_active_order_idx
  on public.services(business_id, active, display_order);

create index if not exists audit_logs_business_action_created_idx
  on public.audit_logs(business_id, action, created_at desc);
