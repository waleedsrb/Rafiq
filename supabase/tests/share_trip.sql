-- Checks slice 12 part 2: share links and the car's position.
begin;
select set_config('rafiq.paying', 'on', false);
create or replace function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create or replace function pg_temp.expect_error(stmt text, fragment text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: expected error "%" from: %', fragment, stmt;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if position(fragment in sqlerrm) = 0 then
    raise exception 'FAIL: expected "%" but got "%"', fragment, sqlerrm;
  end if;
end;
$$;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000000a2', '970593333333');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.act_as(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '20 minutes', 3, 25);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.bookings (id, trip_id, passenger_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1');

-- 1. Before the driver accepts, the passenger can't share.
select pg_temp.expect_error($$ select public.share_trip('00000000-0000-0000-0000-0000000000c1') $$, 'Only people on this trip');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b1';

-- 2. Now Amir gets a link, the same one each time. Aya (not on the trip) can't.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table tok as select public.share_trip('00000000-0000-0000-0000-0000000000c1') as t;
do $$ begin
  if length((select t from tok)) <> 32 or (select t from tok) <> public.share_trip('00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: one stable 32-character link per person';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$ select public.share_trip('00000000-0000-0000-0000-0000000000c1') $$, 'Only people on this trip');

-- 3. Anyone with the link (not signed in) sees the trip, but no position yet.
select pg_temp.act_as(null);
do $$ begin
  if (select driver_name from public.shared_trip((select t from tok))) <> 'Dana'
     or (select sharer_name from public.shared_trip((select t from tok))) <> 'Amir'
     or (select lat from public.shared_trip((select t from tok))) is not null then
    raise exception 'FAIL: shared trip before start';
  end if;
  if exists (select 1 from public.shared_trip('not-a-token')) then
    raise exception 'FAIL: a wrong token shows nothing';
  end if;
end $$;

-- 4. Only the driver, only while underway, can send a position.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$ select public.report_position('00000000-0000-0000-0000-0000000000c1', 31.9, 35.2) $$, 'while the trip is underway');
select pg_temp.act_as(null);  -- the trip starts (trip-day rules are tested in trip_day.sql)
update public.trips set started_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.report_position('00000000-0000-0000-0000-0000000000c1', 31.985500, 35.196800, 15);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$ select public.report_position('00000000-0000-0000-0000-0000000000c1', 0, 0) $$, 'Only the driver');
select pg_temp.act_as(null);
do $$ begin
  if (select lat from public.shared_trip((select t from tok))) <> 31.985500 then
    raise exception 'FAIL: the link should show the position';
  end if;
end $$;

-- 5. Two hours after the trip ends, the link stops working.
update public.trips set finished_at = now() - interval '3 hours' where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if exists (select 1 from public.shared_trip((select t from tok))) then
    raise exception 'FAIL: link should expire 2h after the trip';
  end if;
end $$;

select 'All share-my-trip checks passed' as result;
rollback;
