-- Fixes membership lookup policies and backfills owner memberships for businesses
-- created before the owner-membership trigger was installed.

insert into public.business_members (business_id, user_id, role)
select id, owner_id, 'owner'::public.member_role
from public.businesses
where not exists (
  select 1 from public.business_members
  where business_id = businesses.id and user_id = businesses.owner_id
)
on conflict (business_id, user_id) do nothing;

drop policy if exists "members read businesses" on public.businesses;
drop policy if exists "members read memberships" on public.business_members;
drop policy if exists "owners manage memberships" on public.business_members;

create policy "users read owned or member businesses"
on public.businesses for select to authenticated
using (owner_id = auth.uid() or public.is_business_member(id));

create policy "users read own memberships"
on public.business_members for select to authenticated
using (user_id = auth.uid() or public.is_business_owner(business_id));

create policy "owners manage memberships"
on public.business_members for all to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));
