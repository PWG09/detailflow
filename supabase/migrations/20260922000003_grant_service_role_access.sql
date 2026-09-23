-- The public quote API uses the server-only service role key.
-- These grants are explicit; they do not expose data to anon/authenticated roles.

grant usage on schema public to service_role;
grant select, insert, update, delete on public.businesses to service_role;
grant select, insert, update, delete on public.business_members to service_role;
grant select, insert, update, delete on public.services to service_role;
grant select, insert, update, delete on public.customers to service_role;
grant select, insert, update, delete on public.leads to service_role;
grant select, insert, update, delete on public.quotes to service_role;
