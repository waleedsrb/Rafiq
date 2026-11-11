-- Checks the drift-check fingerprint (migration 20261111090000_schema_fingerprint.sql).
-- Runs inside a transaction and rolls back, so it leaves nothing behind.
begin;

do $$
declare
  fp jsonb := public.schema_fingerprint();
begin
  -- It sees each kind of object we care about.
  if not fp ? 'table trips' then raise exception 'FAIL: table trips missing from fingerprint'; end if;
  if not fp ? 'rls bookings' then raise exception 'FAIL: rls bookings missing'; end if;
  if not exists (select from jsonb_object_keys(fp) k where k like 'function request_seat(%') then
    raise exception 'FAIL: function request_seat missing';
  end if;
  if not exists (select from jsonb_object_keys(fp) k where k like 'policy public.bookings.%') then
    raise exception 'FAIL: bookings policies missing';
  end if;
  if not exists (select from jsonb_object_keys(fp) k where k like 'policy storage.objects.%') then
    raise exception 'FAIL: storage policies missing';
  end if;
  if not exists (select from jsonb_object_keys(fp) k where k like 'column trips.%') then
    raise exception 'FAIL: trip columns missing';
  end if;
end $$;

-- Same code with different comments and spacing gives the same hash...
create function public.fp_probe() returns int language sql as $$ select 1 $$;
create temp table before_fp as select public.schema_fingerprint() -> 'function fp_probe()' as h;
create or replace function public.fp_probe() returns int language sql as $$
  -- a comment that should not matter
  select   1
$$;
do $$ begin
  if (select h from before_fp) is distinct from public.schema_fingerprint() -> 'function fp_probe()' then
    raise exception 'FAIL: comments or spacing changed the hash';
  end if;
end $$;

-- ...but different code, or a different grant, changes it.
create or replace function public.fp_probe() returns int language sql as $$ select 2 $$;
do $$ begin
  if (select h from before_fp) = public.schema_fingerprint() -> 'function fp_probe()' then
    raise exception 'FAIL: new function body kept the same hash';
  end if;
end $$;
update before_fp set h = public.schema_fingerprint() -> 'function fp_probe()';
revoke execute on function public.fp_probe() from anon;
do $$ begin
  if (select h from before_fp) = public.schema_fingerprint() -> 'function fp_probe()' then
    raise exception 'FAIL: revoking a grant kept the same hash';
  end if;
end $$;

-- Only the server key may read the fingerprint: it describes every rule in the database.
set local role anon;
do $$ begin
  perform public.schema_fingerprint();
  raise exception 'FAIL: anon could read the fingerprint';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role authenticated;
do $$ begin
  perform public.cron_fingerprint();
  raise exception 'FAIL: a signed-in user could read the cron list';
exception when insufficient_privilege then null;
end $$;
reset role;
set local role service_role;
select public.schema_fingerprint(), public.cron_fingerprint();
reset role;

rollback;
