-- check_rate_limit: atomic fixed-window counter used by _shared/ratelimit.ts.
-- The rate_limits table already exists (initial schema); this adds the RPC.
-- Returns TRUE = allowed (under limit), FALSE = reject (429).
-- SECURITY DEFINER so it can write the counter table regardless of caller RLS.

create or replace function public.check_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  -- Atomic fixed-window token counter. The upsert takes a row lock on conflict,
  -- so concurrent calls for the same key serialize on this row. If the stored
  -- window has expired, reset it (window_start=now, count=1); otherwise increment.
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
                  when rl.window_start < v_now - make_interval(secs => p_window_seconds)
                  then 1
                  else rl.count + 1
                end,
        window_start = case
                  when rl.window_start < v_now - make_interval(secs => p_window_seconds)
                  then v_now
                  else rl.window_start
                end
  returning rl.count into v_count;

  return v_count <= p_max_requests;
end $$;

alter function public.check_rate_limit(text, integer, integer) owner to postgres;
revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer)
  to authenticated, service_role;
