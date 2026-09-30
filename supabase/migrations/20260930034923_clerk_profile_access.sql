-- Clerk users need an own-profile lookup that does not recurse through users RLS.
-- Keep the privileged, identity-scoped lookup outside the exposed API schemas.
create schema if not exists hb_private;
revoke all on schema hb_private from public;
grant usage on schema hb_private to anon, authenticated, service_role;

create or replace function hb_private.request_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case when nullif(auth.jwt()->>'sub', '') is null then false
    else exists (
      select 1 from public.users
      where clerk_id = auth.jwt()->>'sub' and is_admin = true
    ) end
$$;
revoke all on function hb_private.request_is_admin() from public;
grant execute on function hb_private.request_is_admin() to anon, authenticated, service_role;

-- Preserve callers of the existing helper; this wrapper does not bypass RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security invoker
set search_path = ''
as $$ select hb_private.request_is_admin() $$;

drop policy if exists users_select on public.users;
drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;

create policy users_select on public.users for select to authenticated
using (clerk_id = (select auth.jwt()->>'sub') or (select hb_private.request_is_admin()));

create policy users_insert on public.users for insert to authenticated
with check (clerk_id = (select auth.jwt()->>'sub') and role = 'customer' and not is_admin);

create policy users_update on public.users for update to authenticated
using (clerk_id = (select auth.jwt()->>'sub') or (select hb_private.request_is_admin()))
with check (
  (clerk_id = (select auth.jwt()->>'sub') and role in ('customer', 'seller', 'driver'))
  or (select hb_private.request_is_admin())
);

-- A signed-in client may create its identity and edit profile fields only.
-- Admin flags, Clerk IDs, payment identifiers, and timestamps remain server-owned.
revoke all on public.users from anon, authenticated;
grant select on public.users to anon, authenticated;
grant insert (clerk_id, email) on public.users to authenticated;
grant update (first_name, last_name, phone, role, avatar_url, default_address,
              default_location, expo_push_token) on public.users to authenticated;

notify pgrst, 'reload schema';
