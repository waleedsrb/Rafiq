-- Checks slice 9: people_stats / person_stats / person_reviews and the Founding driver badge.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
end $$;
-- These tests create bookings directly, as if each had gone through request_seat().
select set_config('rafiq.paying', 'on', false);

-- d = driver, a1 = good passenger, a2 = no-show, a3 = new (no history).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'), ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser'), ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
select pg_temp.check((select founding_at is null from public.driver_details), 'no badge before approval');
update public.driver_details set verified_at = now();
select pg_temp.check((select founding_at is not null from public.driver_details), 'first approved driver is a founding driver');
update public.profiles set id_verified_at = now();

-- Phones can't take the badge away or give it to themselves.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.driver_details set founding_at = null;
select pg_temp.check((select founding_at is not null from public.driver_details), 'founding_at ignores direct edits');

-- Trip c1: a1 and a2 booked; a1 rides, a2 doesn't come. Then the trip finishes.
select pg_temp.as_user(null);
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 4, 25);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');
update public.bookings set status = 'accepted';
update public.trips set departs_at = now() - interval '20 minutes';
select set_config('rafiq.trip_day', 'on', true);
update public.bookings set status = 'no_show' where id = '00000000-0000-0000-0000-0000000000b2';
update public.trips set started_at = now() - interval '20 minutes';
select set_config('rafiq.trip_day', 'off', true);
select public.close_trip('00000000-0000-0000-0000-0000000000c1');

-- Ratings: a1 gives the driver 5 with a note; the driver gives a1 4.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.rate_trip('00000000-0000-0000-0000-0000000000b1', 5, array['on_time'], 'Great music');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.rate_trip('00000000-0000-0000-0000-0000000000b1', 4);

-- Stats, as seen by someone else (a3).
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
do $$
declare s record;
begin
  select * into s from public.person_stats('00000000-0000-0000-0000-00000000000d');
  perform pg_temp.check(s.completed_trips = 1 and s.rating_avg = 5.0 and s.rating_count = 1
                        and s.reliability = 1.00 and s.founding_driver, 'driver stats: ' || row_to_json(s)::text);
  select * into s from public.person_stats('00000000-0000-0000-0000-0000000000a1');
  perform pg_temp.check(s.completed_trips = 1 and s.rating_avg = 4.0 and s.reliability = 1.00
                        and not s.founding_driver, 'a1 stats: ' || row_to_json(s)::text);
  select * into s from public.person_stats('00000000-0000-0000-0000-0000000000a2');
  perform pg_temp.check(s.completed_trips = 0 and s.reliability = 0.00 and s.rating_avg is null, 'no-show stats: ' || row_to_json(s)::text);
  select * into s from public.person_stats('00000000-0000-0000-0000-0000000000a3');
  perform pg_temp.check(s.completed_trips = 0 and s.reliability is null and s.rating_count = 0, 'new person stats: ' || row_to_json(s)::text);
end $$;
select pg_temp.check((select count(*) from public.people_stats(array[
  '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d']::uuid[])) = 2,
  'people_stats: one row per distinct person');

select pg_temp.check((select rating_avg = 5.0 and founding_driver from public.trips_driver_stats(
  array['00000000-0000-0000-0000-0000000000c1']::uuid[])), 'stats by trip for search results');

-- Reviews: others see stars and tags, not the note. The driver sees the note.
select pg_temp.check((select note is null and stars = 5 and rater_first_name = 'Amir'
                        from public.person_reviews('00000000-0000-0000-0000-00000000000d')), 'note hidden from others');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select note = 'Great music' from public.person_reviews('00000000-0000-0000-0000-00000000000d')),
  'the driver sees their own notes');

-- A late cancel by the driver counts against them.
reset role;
select pg_temp.as_user(null);
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '3 hours', 4, 25);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b3';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.cancel_trip('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check((select reliability = 0.50 from public.person_stats('00000000-0000-0000-0000-00000000000d')),
  'late trip cancel halves the driver''s reliability');

select 'All trust checks passed' as result;
rollback;
