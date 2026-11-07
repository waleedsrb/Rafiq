-- Checks slice 7: checkpoint reports and the status everyone sees.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected an error containing "%" from: %', needle, sql;
exception when others then
  if sqlerrm not like '%' || needle || '%' then
    raise exception 'FAIL: expected "%", got "%" from: %', needle, sqlerrm, sql;
  end if;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'), ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser'), ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil');
-- Dana drives a trip that left 20 minutes ago (set as the server).
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '1 hour', 3, 25);
update public.trips set departs_at = now() - interval '20 minutes';
-- Old reports: Huwara closed 90 minutes ago, Atara open 3 hours ago (too old to count).
insert into public.checkpoint_reports (checkpoint_id, reporter_id, status) values
  ('huwara', '00000000-0000-0000-0000-0000000000a3', 'closed'),
  ('atara',  '00000000-0000-0000-0000-0000000000a3', 'open');
alter table public.checkpoint_reports disable trigger checkpoint_reports_guard;
update public.checkpoint_reports set created_at = now() - interval '90 minutes' where checkpoint_id = 'huwara';
update public.checkpoint_reports set created_at = now() - interval '3 hours' where checkpoint_id = 'atara';
alter table public.checkpoint_reports enable trigger checkpoint_reports_guard;

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Zaatara: 2 crowded vs 1 open in the last 30 minutes -> crowded.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.checkpoint_reports (checkpoint_id, status) values ('zaatara', 'crowded');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.checkpoint_reports (checkpoint_id, status) values ('zaatara', 'open');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.checkpoint_reports (checkpoint_id, status) values ('zaatara', 'crowded');

do $$
declare z record; h record; a record;
begin
  select * into z from public.checkpoint_overview() where id = 'zaatara';
  if z.status <> 'crowded' or z.reports_30m <> 3 then raise exception 'FAIL: zaatara was %', row_to_json(z); end if;
  -- 2. Nothing recent at Huwara: fall back to the 90-minute-old report.
  select * into h from public.checkpoint_overview() where id = 'huwara';
  if h.status <> 'closed' or h.reports_30m <> 0 or h.last_report_at is null then raise exception 'FAIL: huwara was %', row_to_json(h); end if;
  -- 3. Atara's only report is 3 hours old: no status.
  select * into a from public.checkpoint_overview() where id = 'atara';
  if a.status is not null or a.last_report_at is not null then raise exception 'FAIL: atara was %', row_to_json(a); end if;
  if (select count(*) from public.checkpoint_overview()) <> 4 then raise exception 'FAIL: expected 4 checkpoints'; end if;
end $$;

-- 4. The detail list says who kind of person reported, never who; the driver on a trip shows as a driver.
do $$ begin
  if (select string_agg(source, ',' order by source) from public.checkpoint_recent('zaatara')) <> 'driver,passenger,passenger' then
    raise exception 'FAIL: sources were %', (select string_agg(source, ',') from public.checkpoint_recent('zaatara'));
  end if;
end $$;

-- 5. Reports are private, can't be faked for someone else, and can't flood.
select pg_temp.expect_error($$select count(*) from public.checkpoint_reports$$, 'permission denied');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$insert into public.checkpoint_reports (checkpoint_id, status) values ('zaatara', 'closed')$$, 'just reported');
select pg_temp.expect_error($$insert into public.checkpoint_reports (checkpoint_id, reporter_id, status)
  values ('atara', '00000000-0000-0000-0000-0000000000a2', 'closed')$$, 'row-level security');
-- A different checkpoint is fine.
insert into public.checkpoint_reports (checkpoint_id, status) values ('atara', 'open');

-- 6. A tie goes to the newest report.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.checkpoint_reports (checkpoint_id, status) values ('atara', 'closed');
do $$ begin
  if (select status from public.checkpoint_overview() where id = 'atara') <> 'closed' then raise exception 'FAIL: tie should go to newest'; end if;
end $$;

reset role;
select 'All checkpoint checks passed' as result;
rollback;
