-- Checks slice 14a: recurring trips.
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
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e'),
  ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'), ('00000000-0000-0000-0000-00000000000e', 'Eyad Taha'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh');
insert into public.driver_details (driver_id, car_model, car_color, plate) values
  ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95'),
  ('00000000-0000-0000-0000-00000000000e', 'Skoda Octavia', 'Grey', '7-5678-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now() where driver_id = '00000000-0000-0000-0000-00000000000d';

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Dana repeats every day at 23:59 Palestine time: the first week appears at once.
--    (Every day, so the test doesn't depend on which weekday CI runs on. 23:59 so that
--    today's trip is more than an hour away unless CI runs very late; we allow 6 or 7.)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
values ('ramallah', 'nablus', '{0,1,2,3,4,5,6}', '23:59', 3, 25);
do $$ declare n int; bad int; begin
  select count(*) into n from public.trips where series_id is not null;
  if n not between 6 and 7 then raise exception 'FAIL: expected a week of trips, got %', n; end if;
  -- Every one at 23:59 local time, owned by Dana, with the pattern's seats and price.
  select count(*) into bad from public.trips
   where series_id is not null and (
     to_char(departs_at at time zone 'Asia/Hebron', 'HH24:MI') <> '23:59'
     or driver_id <> '00000000-0000-0000-0000-00000000000d' or seats_total <> 3 or price_ils <> 25);
  if bad > 0 then raise exception 'FAIL: % generated trips look wrong', bad; end if;
end $$;

-- 2. Weekdays only: Sun-Thu gives 5 trips (or 4/5 depending on today's hour), never Fri or Sat.
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
values ('nablus', 'ramallah', '{0,1,2,3,4}', '23:30', 2, 20);
do $$ declare n int; begin
  select count(*) into n from public.trips t join public.trip_series s on s.id = t.series_id
   where s.origin = 'nablus' and extract(dow from t.departs_at at time zone 'Asia/Hebron') in (5, 6);
  if n > 0 then raise exception 'FAIL: % trips on Fri/Sat', n; end if;
  select count(*) into n from public.trips t join public.trip_series s on s.id = t.series_id where s.origin = 'nablus';
  if n not between 4 and 5 then raise exception 'FAIL: expected 4-5 weekday trips, got %', n; end if;
end $$;

-- 3. Running the hourly job again adds nothing.
reset role;
do $$ begin
  if public.generate_series_trips() <> 0 then raise exception 'FAIL: generator not idempotent'; end if;
end $$;
set local role authenticated;

-- 4. Bad patterns are refused.
select pg_temp.expect_error($$insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
  values ('ramallah', 'nablus', '{}', '07:00', 3, 25)$$, 'check constraint');
select pg_temp.expect_error($$insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
  values ('ramallah', 'nablus', '{7}', '07:00', 3, 25)$$, 'check constraint');

-- 5. An unapproved driver can save a pattern but gets no trips until approved.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
values ('ramallah', 'nablus', '{0,1,2,3,4,5,6}', '23:45', 4, 25);
do $$ begin
  if exists (select 1 from public.trips where driver_id = '00000000-0000-0000-0000-00000000000e') then
    raise exception 'FAIL: unapproved driver got trips';
  end if;
end $$;
-- ...and once approved, can't hang a trip on Dana's pattern.
reset role;
select pg_temp.as_user(null);
update public.driver_details set verified_at = now() where driver_id = '00000000-0000-0000-0000-00000000000e';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error(format($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, series_id)
  values ('00000000-0000-0000-0000-00000000000e', 'ramallah', 'nablus', now() + interval '3 days', 3, 25, %L)$$,
  (select id from public.trip_series where driver_id = '00000000-0000-0000-0000-00000000000d' and origin = 'ramallah')),
  'Not your repeating trip');
-- ...nor stop it.
select pg_temp.expect_error(format($$select public.stop_trip_series(%L)$$,
  (select id from public.trip_series where driver_id = '00000000-0000-0000-0000-00000000000d' and origin = 'ramallah')),
  'Not your repeating trip');

-- 6. Stopping: trips with a request stay, empty ones are taken down, no new ones appear.
reset role;
select pg_temp.as_user(null);
update public.profiles set id_verified_at = now() where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.bookings (trip_id, passenger_id)
select id, '00000000-0000-0000-0000-0000000000a1' from public.trips
 where series_id = (select id from public.trip_series where driver_id = '00000000-0000-0000-0000-00000000000d' and origin = 'ramallah')
 order by departs_at desc limit 1;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ declare sid uuid; removed int; kept int; begin
  select id into sid from public.trip_series where driver_id = '00000000-0000-0000-0000-00000000000d' and origin = 'ramallah';
  removed := public.stop_trip_series(sid);
  select count(*) into kept from public.trips where series_id = sid and cancelled_at is null;
  if kept <> 1 or removed < 5 then raise exception 'FAIL: stop kept % and removed %', kept, removed; end if;
end $$;
reset role;
do $$ begin
  if public.generate_series_trips((select id from public.trip_series where driver_id = '00000000-0000-0000-0000-00000000000d' and origin = 'ramallah')) <> 0 then
    raise exception 'FAIL: stopped pattern still generates';
  end if;
end $$;

-- 7. Women-only patterns: only a verified woman can save one, and it carries onto every trip.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils, women_only)
  values ('ramallah', 'nablus', '{0,1,2,3,4,5,6}', '23:15', 3, 25, true)$$, 'Only women');
reset role;
select pg_temp.as_user(null);
update public.profiles set gender = 'f', gender_verified_at = now(), id_verified_at = now()
 where id = '00000000-0000-0000-0000-00000000000d';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils, women_only)
values ('ramallah', 'nablus', '{0,1,2,3,4,5,6}', '23:15', 3, 25, true);
reset role;
do $$ begin
  if exists (select 1 from public.trips t join public.trip_series s on s.id = t.series_id
              where s.women_only and not t.women_only) or not exists (
         select 1 from public.trips t join public.trip_series s on s.id = t.series_id where s.women_only) then
    raise exception 'FAIL: women-only not carried onto the trips';
  end if;
end $$;

-- 8. A driver whose posting is paused (3 late cancels) can't save a pattern, and their
--    existing pattern quietly posts nothing (the hourly job doesn't fail).
select pg_temp.as_user(null);
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, cancelled_at, cancelled_late)
select '00000000-0000-0000-0000-00000000000e', 'ramallah', 'nablus', now() + (g || ' days')::interval, 3, 25, now(), true
  from generate_series(10, 12) g;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils)
  values ('nablus', 'ramallah', '{0}', '08:00', 3, 25)$$, 'Posting is paused');
reset role;
do $$ begin
  perform public.generate_series_trips();
  if exists (select 1 from public.trips where driver_id = '00000000-0000-0000-0000-00000000000e' and cancelled_at is null) then
    raise exception 'FAIL: paused driver got trips';
  end if;
end $$;

select 'All recurring trip checks passed' as result;
rollback;
