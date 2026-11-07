-- Checks search_trips(): right route, future only, seats left, never your own trips.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh');

insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '2 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'nablus', 'ramallah', now() + interval '2 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() - interval '1 hour', 3, 25);

insert into public.bookings (trip_id, passenger_id, seats)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 2);
update public.bookings set status = 'accepted';

-- As the passenger: only c1 (right direction, future), with 1 seat left.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare r record; n int;
begin
  select count(*) into n from public.search_trips('ramallah', 'nablus', now() - interval '1 day', now() + interval '1 day');
  if n <> 1 then raise exception 'FAIL: expected 1 trip, got %', n; end if;
  select * into r from public.search_trips('ramallah', 'nablus', now() - interval '1 day', now() + interval '1 day');
  if r.seats_left <> 1 then raise exception 'FAIL: expected 1 seat left, got %', r.seats_left; end if;
  if r.driver_first_name <> 'Dana' then raise exception 'FAIL: expected first name only, got %', r.driver_first_name; end if;
end $$;

-- As the driver: their own trips are hidden.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
declare n int;
begin
  select count(*) into n from public.search_trips('ramallah', 'nablus', now() - interval '1 day', now() + interval '1 day');
  if n <> 0 then raise exception 'FAIL: driver should not see own trips, got %', n; end if;
end $$;

select 'All search_trips checks passed' as result;
rollback;
