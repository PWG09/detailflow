-- Production abuse/cost controls: atomic, server-side rate limits.
create table if not exists public.security_rate_limits (
  key_hash text primary key,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

revoke all on public.security_rate_limits from anon, authenticated;
grant all on public.security_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  row_data public.security_rate_limits%rowtype;
  next_reset timestamptz;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return query select false, p_window_seconds * 1000;
    return;
  end if;

  select * into row_data
  from public.security_rate_limits
  where key_hash = p_key_hash
  for update;

  if not found or row_data.reset_at <= now_ts then
    next_reset := now_ts + make_interval(secs => p_window_seconds);
    insert into public.security_rate_limits(key_hash, count, reset_at, updated_at)
    values (p_key_hash, 1, next_reset, now_ts)
    on conflict (key_hash) do update
      set count = 1, reset_at = excluded.reset_at, updated_at = excluded.updated_at;
    return query select true, p_window_seconds * 1000;
    return;
  end if;

  if row_data.count >= p_limit then
    return query select false, greatest(1, floor(extract(epoch from (row_data.reset_at - now_ts)) * 1000)::integer);
    return;
  end if;

  update public.security_rate_limits
  set count = count + 1, updated_at = now_ts
  where key_hash = p_key_hash;

  return query select true, greatest(1, floor(extract(epoch from (row_data.reset_at - now_ts)) * 1000)::integer);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- Remove stale limiter rows periodically from an operator/cron job. Keeping this
-- index makes that cleanup inexpensive without exposing the table to clients.
create index if not exists security_rate_limits_reset_at_idx
  on public.security_rate_limits(reset_at);
