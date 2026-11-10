-- Checks checkpoints on the way (20261110100000_trip_checkpoints.sql).
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
  ('00000000-0000-0000-0000-0000000c0d01'), ('00000000-0000-0000-0000-0000000c0d02'),
  ('00000000-0000-0000-0000-0000000c0d03');
insert into public.profiles (id, full_name, language) values
  ('00000000-0000-0000-0000-0000000c0d01', 'Dana Driver', 'ar'),
  ('00000000-0000-0000-0000-0000000c0d02', 'Rami Rider', 'en'),
  ('00000000-0000-0000-0000-0000000c0d03', 'Other Driver', 'ar');
insert into public.driver_details (driver_id, car_model, car_color, plate) values
  ('00000000-0000-0000-0000-0000000c0d01', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0d01');

-- 1. A trip posts with its checkpoints; unknown or repeated ids are refused.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils, checkpoint_ids)
values ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c0d01', 'osm-n246843686', 'osm-n293546203',
        now() + interval '2 hours', 3, 25, '{atara,zaatara}');
select pg_temp.expect_error($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, checkpoint_ids)
  values ('00000000-0000-0000-0000-0000000c0d01', 'osm-n246843686', 'osm-n293546203', now() + interval '3 hours', 3, 25, '{nowhere}')$$, 'bad_checkpoints');
select pg_temp.expect_error($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, checkpoint_ids)
  values ('00000000-0000-0000-0000-0000000c0d01', 'osm-n246843686', 'osm-n293546203', now() + interval '3 hours', 3, 25, '{atara,atara}')$$, 'bad_checkpoints');

-- 2. A weekly pattern copies its checkpoints onto every trip it posts.
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils, checkpoint_ids)
values ('osm-n293546203', 'osm-n246843686', '{0,1,2,3,4,5,6}', '23:59', 3, 25, '{huwara,zaatara}');
do $$ begin
  if exists (select 1 from public.trips where series_id is not null and checkpoint_ids <> '{huwara,zaatara}')
     or not exists (select 1 from public.trips where series_id is not null) then
    raise exception 'FAIL: generated trips lost the checkpoints';
  end if;
end $$;

-- 3. Change my way: Rami (asked for a seat) hears about it, in English. Same list again: no message.
reset role;
select pg_temp.as_user(null);
insert into public.bookings (trip_id, passenger_id) values ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c0d02');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0d01');
select public.change_trip_way('00000000-0000-0000-0000-0000000c0c01', '{atara,uyun_haramiya,huwara}');
select public.change_trip_way('00000000-0000-0000-0000-0000000c0c01', '{atara,uyun_haramiya,huwara}');
reset role;
do $$ declare n record; begin
  if (select checkpoint_ids from public.trips where id = '00000000-0000-0000-0000-0000000c0c01') <> '{atara,uyun_haramiya,huwara}' then
    raise exception 'FAIL: way not changed';
  end if;
  if (select count(*) from public.notifications where kind = 'way_changed') <> 1 then
    raise exception 'FAIL: expected one way_changed message, got %', (select count(*) from public.notifications where kind = 'way_changed');
  end if;
  select * into n from public.notifications where kind = 'way_changed';
  if n.user_id <> '00000000-0000-0000-0000-0000000c0d02' or n.title <> 'Your trip''s way changed'
     or n.url <> '/trips/00000000-0000-0000-0000-0000000c0c01' then
    raise exception 'FAIL: message was %', row_to_json(n);
  end if;
end $$;

-- 4. Only the trip's driver can change its way.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0d03');
select pg_temp.expect_error($$select public.change_trip_way('00000000-0000-0000-0000-0000000c0c01', '{}')$$, 'not_your_trip');

-- 5. On the road, passing an unlisted checkpoint adds it (Zaatara, ~100 m away); far away adds nothing.
reset role;
select pg_temp.as_user(null);
insert into public.trip_positions (trip_id, lat, lng) values ('00000000-0000-0000-0000-0000000c0c01', 32.1158, 35.2566);
do $$ begin
  if exists (select 1 from public.trips where id = '00000000-0000-0000-0000-0000000c0c01' and 'zaatara' = any (checkpoint_ids)) then
    raise exception 'FAIL: added before the trip started';
  end if;
end $$;
update public.trips set started_at = now() where id = '00000000-0000-0000-0000-0000000c0c01';
update public.trip_positions set lat = 32.0717 where trip_id = '00000000-0000-0000-0000-0000000c0c01';
update public.trip_positions set lat = 32.1158 where trip_id = '00000000-0000-0000-0000-0000000c0c01';
update public.trip_positions set lat = 32.1160 where trip_id = '00000000-0000-0000-0000-0000000c0c01';
do $$ begin
  if (select checkpoint_ids from public.trips where id = '00000000-0000-0000-0000-0000000c0c01') <> '{atara,uyun_haramiya,huwara,zaatara}' then
    raise exception 'FAIL: passed checkpoint not added once: %', (select checkpoint_ids from public.trips where id = '00000000-0000-0000-0000-0000000c0c01');
  end if;
end $$;

-- 6. The drive is remembered as passed, and the next post on the route gets it.
do $$ begin
  if (select passed_checkpoint_ids from public.trips where id = '00000000-0000-0000-0000-0000000c0c01') <> '{zaatara}' then
    raise exception 'FAIL: passed list is %', (select passed_checkpoint_ids from public.trips where id = '00000000-0000-0000-0000-0000000c0c01');
  end if;
end $$;
update public.trips set finished_at = now() where id = '00000000-0000-0000-0000-0000000c0c01';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000c0d03');
do $$ begin
  if public.learned_checkpoints('osm-n246843686', 'osm-n293546203') <> '{zaatara}' then
    raise exception 'FAIL: learned %', public.learned_checkpoints('osm-n246843686', 'osm-n293546203');
  end if;
  if public.learned_checkpoints('osm-n293546203', 'osm-n246843686') <> '{}' then
    raise exception 'FAIL: the other direction has no drive yet';
  end if;
end $$;

rollback;
