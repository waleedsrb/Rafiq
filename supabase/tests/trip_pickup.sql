-- Checks the pickup point (20261109120000_trip_pickup.sql).
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

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000f1d1');
insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-00000000f1d1', 'Pia Driver');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000f1d1', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now() where driver_id = '00000000-0000-0000-0000-00000000f1d1';

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000f1d1');

-- 1. A one-off trip with a pickup, and one without (older clients) both post.
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, pickup_label, pickup_lat, pickup_lng)
values ('00000000-0000-0000-0000-00000000f1d1', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 3, 25,
        'Al-Manara Square', 31.9038, 35.2034);
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000f1d1', 'osm-n246843686', 'osm-n293546203', now() + interval '3 days', 3, 25);

-- 2. Half a pickup, or a one-letter label, is refused.
select pg_temp.expect_error($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, pickup_label)
  values ('00000000-0000-0000-0000-00000000f1d1', 'osm-n246843686', 'osm-n293546203', now() + interval '4 days', 3, 25, 'Here')$$, 'trips_pickup_complete');
select pg_temp.expect_error($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, pickup_label, pickup_lat, pickup_lng)
  values ('00000000-0000-0000-0000-00000000f1d1', 'osm-n246843686', 'osm-n293546203', now() + interval '4 days', 3, 25, 'x', 31.9, 35.2)$$, 'check constraint');

-- 3. A weekly pattern copies its pickup onto every trip it posts.
insert into public.trip_series (origin, destination, weekdays, depart_time, seats_total, price_ils, pickup_label, pickup_lat, pickup_lng)
values ('osm-n293546203', 'osm-n246843686', '{0,1,2,3,4,5,6}', '23:59', 3, 25, 'Martyrs Square', 32.2211, 35.2544);
do $$ declare n int; bad int; begin
  select count(*), count(*) filter (where pickup_label is distinct from 'Martyrs Square' or pickup_lat is null)
    into n, bad from public.trips where series_id is not null;
  if n < 6 then raise exception 'FAIL: expected a week of trips, got %', n; end if;
  if bad > 0 then raise exception 'FAIL: % generated trips lost the pickup', bad; end if;
end $$;

-- 4. Popular spots: the city's used spots, most used first; another city's never.
do $$ declare r record; begin
  select * into r from public.popular_pickups('osm-n293546203') limit 1;
  if r.label <> 'Martyrs Square' or r.uses < 6 then raise exception 'FAIL: popular nablus spot %', r; end if;
  select * into r from public.popular_pickups('osm-n246843686') limit 1;
  if r.label <> 'Al-Manara Square' or r.uses <> 1 then raise exception 'FAIL: popular ramallah spot %', r; end if;
end $$;

rollback;
