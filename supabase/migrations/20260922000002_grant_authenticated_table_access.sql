-- Grant table-level access to authenticated users.
-- Row Level Security remains the authority for which rows are visible or mutable.

grant usage on schema public to authenticated;
grant select, insert, update on public.businesses to authenticated;
grant select, insert, update, delete on public.business_members to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.quotes to authenticated;
