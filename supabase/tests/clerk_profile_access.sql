-- Integration checks for Clerk profile creation and row/column authorization.
-- Run as postgres after the migration. All fixtures are rolled back.
begin;
set local statement_timeout = '10s';
do $$
declare
  owner_sub text := 'user_hb_rls_' || gen_random_uuid()::text;
  other_sub text := 'user_hb_rls_' || gen_random_uuid()::text;
  admin_sub text := 'user_hb_rls_' || gen_random_uuid()::text;
  profile_id uuid;
  changed integer;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_sub,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.users (clerk_id, email) values (owner_sub, 'auth-check@example.invalid') returning id into profile_id;
  if public.current_user_id() is distinct from profile_id then raise exception 'Own profile lookup failed'; end if;
  if public.is_admin() then raise exception 'New account became admin'; end if;
  update public.users set first_name='Auth check', last_name='Fixture', phone='0000000000' where id=profile_id;
  if not exists(select 1 from public.users where id=profile_id and first_name='Auth check') then raise exception 'Profile save failed'; end if;
  -- A webhook racing the client is handled as a unique violation, not a second row.
  begin
    insert into public.users (clerk_id, email) values (owner_sub, 'auth-check@example.invalid');
    raise exception 'Duplicate Clerk identity was accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.users (clerk_id) values (other_sub);
    raise exception 'Foreign identity was accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.users set is_admin=true where id=profile_id;
    raise exception 'Client changed its admin flag';
  exception when insufficient_privilege then null; end;
  begin
    update public.users set role='admin' where id=profile_id;
    raise exception 'Client assigned itself the admin role';
  exception when insufficient_privilege then null; end;
  begin
    update public.users set clerk_id=other_sub where id=profile_id;
    raise exception 'Client reassigned its identity';
  exception when insufficient_privilege then null; end;
  begin
    update public.users set stripe_customer_id='cus_test_forbidden' where id=profile_id;
    raise exception 'Client changed a payment identifier';
  exception when insufficient_privilege then null; end;
  perform count(*) from public.sellers;
  perform count(*) from public.drivers;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',other_sub,'role','authenticated')::text, true);
  if exists(select 1 from public.users where id=profile_id) then raise exception 'Another user read the profile'; end if;
  update public.users set first_name='Forbidden' where id=profile_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Another user edited the profile'; end if;

  set local role anon;
  perform set_config('request.jwt.claims','{}',true);
  if exists(select 1 from public.users) then raise exception 'Anonymous profile read succeeded'; end if;
  if public.is_admin() then raise exception 'Anonymous request became admin'; end if;
  begin
    insert into public.users (clerk_id) values (other_sub);
    raise exception 'Anonymous profile creation succeeded';
  exception when insufficient_privilege then null; end;

  set local role postgres;
  insert into public.users (clerk_id, is_admin, role) values (admin_sub,true,'admin');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_sub,'role','authenticated')::text,true);
  set local role authenticated;
  if not public.is_admin() then raise exception 'Server-assigned admin lost access'; end if;
  if not exists(select 1 from public.users where id=profile_id) then raise exception 'Admin profile read failed'; end if;
  set local role postgres;
end $$;
select 'PASS: own profile creation/read/save, duplicate handling, seller/driver reads, cross-user isolation, anonymous denial, admin/identity/payment protection, server-assigned admin access. Fixtures rolled back.' as result;
rollback;
