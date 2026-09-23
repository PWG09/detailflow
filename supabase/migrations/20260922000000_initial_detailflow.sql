create extension if not exists "pgcrypto";

create type public.member_role as enum ('owner', 'staff');
create type public.lead_status as enum ('new', 'contacted', 'quoted', 'won', 'lost', 'archived');
create type public.quote_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
create type public.pricing_type as enum ('fixed', 'range', 'starting_at', 'custom');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  email text,
  phone text,
  currency text not null default 'USD',
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create or replace function public.add_business_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger business_owner_membership_after_insert
after insert on public.businesses
for each row execute function public.add_business_owner_membership();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text,
  pricing_type public.pricing_type not null default 'range',
  minimum_price numeric(10,2) not null default 0 check (minimum_price >= 0),
  maximum_price numeric(10,2) not null default 0 check (maximum_price >= minimum_price),
  active boolean not null default true,
  display_order integer not null default 0,
  requires_photos boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  normalized_email text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, normalized_email)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  status public.lead_status not null default 'new',
  vehicle jsonb not null default '{}'::jsonb,
  condition jsonb not null default '{}'::jsonb,
  estimate jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  notes text,
  source text not null default 'public_quote',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  quote_number text not null,
  services jsonb not null default '[]'::jsonb,
  adjustments jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status public.quote_status not null default 'draft',
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, quote_number)
);

create index leads_business_created_idx on public.leads (business_id, created_at desc);
create index quotes_business_status_idx on public.quotes (business_id, status, created_at desc);
create index services_business_order_idx on public.services (business_id, display_order);

create or replace function public.is_business_member(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = target_business_id and user_id = auth.uid());
$$;

create or replace function public.is_business_owner(target_business_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = target_business_id and user_id = auth.uid() and role = 'owner');
$$;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.quotes enable row level security;

create policy "members read businesses" on public.businesses for select using (public.is_business_member(id));
create policy "owners update businesses" on public.businesses for update using (public.is_business_owner(id));
create policy "authenticated create businesses" on public.businesses for insert to authenticated with check (owner_id = auth.uid());

create policy "members read memberships" on public.business_members for select using (public.is_business_member(business_id));
create policy "owners manage memberships" on public.business_members for all using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create policy "members manage services" on public.services for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy "members read customers" on public.customers for select using (public.is_business_member(business_id));
create policy "members manage customers" on public.customers for insert with check (public.is_business_member(business_id));
create policy "members update customers" on public.customers for update using (public.is_business_member(business_id));
create policy "members read leads" on public.leads for select using (public.is_business_member(business_id));
create policy "members update leads" on public.leads for update using (public.is_business_member(business_id));
create policy "members read quotes" on public.quotes for select using (public.is_business_member(business_id));
create policy "members manage quotes" on public.quotes for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.is_business_owner(uuid) from public;
grant execute on function public.is_business_member(uuid), public.is_business_owner(uuid) to authenticated;
