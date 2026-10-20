-- Supabase advisor cleanup.

-- Membership helpers and the team RPC are only meaningful for signed-in users.
revoke execute on function public.is_business_member(uuid) from anon;
revoke execute on function public.is_business_owner(uuid) from anon;
revoke execute on function public.get_team_members(uuid) from anon;

-- Identical indexes created by two overlapping performance migrations.
drop index if exists public.customers_business_updated_idx;
drop index if exists public.quotes_business_created_idx;

-- Evaluate auth.uid() once per query instead of once per row.
drop policy if exists "users read owned or member businesses" on public.businesses;
create policy "users read owned or member businesses"
on public.businesses for select to authenticated
using (owner_id = (select auth.uid()) or public.is_business_member(id));

drop policy if exists "users read own memberships" on public.business_members;
create policy "users read own memberships"
on public.business_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_business_owner(business_id));

drop policy if exists business_metrics_select_member on public.business_metrics;
create policy business_metrics_select_member
on public.business_metrics for select to authenticated
using (public.is_business_member(business_id));

-- "members manage quotes" (FOR ALL) already covers SELECT.
drop policy if exists "members read quotes" on public.quotes;
