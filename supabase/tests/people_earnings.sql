-- Checks slice 10b: a person's public page and a driver's earnings.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
end $$;
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000020d'), ('00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000002a2'), ('00000000-0000-0000-0000-0000000002a3');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000020d', 'Dana Haddad'), ('00000000-0000-0000-0000-0000000002a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000002a2', 'Aya Nasser'), ('00000000-0000-0000-0000-0000000002a3', 'Omar Khalil');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000020d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();

-- Trip c1 (2 seats each for a1, 1 for a2 who doesn't come), finished. Trip c2 not finished yet.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-00000000020d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 4, 25),
  ('00000000-0000-0000-0000-0000000002c2', '00000000-0000-0000-0000-00000000020d', 'osm-n293546203', 'osm-n246843686', now() + interval '3 days', 4, 25);
insert into public.bookings (id, trip_id, passenger_id, seats) values
  ('00000000-0000-0000-0000-0000000002b1', '00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002a1', 2),
  ('00000000-0000-0000-0000-0000000002b2', '00000000-0000-0000-0000-0000000002c1', '00000000-0000-0000-0000-0000000002a2', 1),
  ('00000000-0000-0000-0000-0000000002b3', '00000000-0000-0000-0000-0000000002c2', '00000000-0000-0000-0000-0000000002a3', 1);
update public.bookings set status = 'accepted';
update public.trips set departs_at = now() - interval '20 minutes' where id = '00000000-0000-0000-0000-0000000002c1';
select set_config('rafiq.trip_day', 'on', true);
update public.bookings set status = 'no_show' where id = '00000000-0000-0000-0000-0000000002b2';
update public.trips set started_at = now() - interval '20 minutes' where id = '00000000-0000-0000-0000-0000000002c1';
select set_config('rafiq.trip_day', 'off', true);
select public.close_trip('00000000-0000-0000-0000-0000000002c1');

set local role authenticated;

-- 1. Someone else sees the driver's public page: car, badges, never the plate.
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a3');
do $$
declare p record;
begin
  select * into p from public.public_profile('00000000-0000-0000-0000-00000000020d');
  perform pg_temp.check(p.name = 'Dana H.' and p.id_verified and p.driver_verified and p.founding_driver
                        and p.car_model = 'Kia Picanto' and not p.deleted and p.driving_since is not null,
                        'public profile: ' || row_to_json(p)::text);
  perform pg_temp.check(not exists (select 1 from information_schema.routines r
                                     join information_schema.parameters x using (specific_name)
                                    where r.routine_name = 'public_profile' and x.parameter_name = 'plate'),
                        'public_profile has no plate column');
end $$;

-- 2. Earnings: cash pilot counts riders' seats only (2 × 25), not the no-show, not the unfinished trip.
select pg_temp.as_user('00000000-0000-0000-0000-00000000020d');
do $$
declare e record; n int;
begin
  select count(*) into n from public.my_earnings(now() - interval '30 days', now() + interval '30 days');
  perform pg_temp.check(n = 1, 'only finished trips are listed, got ' || n);
  select * into e from public.my_earnings(now() - interval '30 days', now() + interval '30 days');
  perform pg_temp.check(e.riders = 2 and e.no_shows = 1 and e.earned_ils = 50, 'earnings row: ' || row_to_json(e)::text);
end $$;

-- 3. Nobody sees another driver's earnings.
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a1');
select pg_temp.check((select count(*) from public.my_earnings(now() - interval '30 days', now() + interval '30 days')) = 0,
                     'someone else''s earnings visible');

select 'All people and earnings checks passed' as result;
rollback;
