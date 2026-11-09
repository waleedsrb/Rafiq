-- Checks search_trips(): right route, future only, seats left, never your own trips.
begin;
-- Slice 6: these tests create bookings directly, as if each had gone through request_seat().
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh');

insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');

-- Slice 5: everyone in these tests is already verified (set as the server, no signed-in user).
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '2 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() - interval '1 hour', 3, 25);

insert into public.bookings (trip_id, passenger_id, seats)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 2);
update public.bookings set status = 'accepted';

-- As the passenger: only c1 (right direction, future), with 1 seat left.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare r record; n int;
begin
  select count(*) into n from public.search_trips('osm-n246843686', 'osm-n293546203', now() - interval '1 day', now() + interval '1 day');
  if n <> 1 then raise exception 'FAIL: expected 1 trip, got %', n; end if;
  select * into r from public.search_trips('osm-n246843686', 'osm-n293546203', now() - interval '1 day', now() + interval '1 day');
  if r.seats_left <> 1 then raise exception 'FAIL: expected 1 seat left, got %', r.seats_left; end if;
  if r.driver_first_name <> 'Dana' then raise exception 'FAIL: expected first name only, got %', r.driver_first_name; end if;
  if r.driver_last_initial <> 'H' then raise exception 'FAIL: expected last initial H, got %', r.driver_last_initial; end if;
  if r.car_model <> 'Kia Picanto' then raise exception 'FAIL: expected the car model, got %', r.car_model; end if;
end $$;

-- As the driver: their own trips are hidden.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
declare n int;
begin
  select count(*) into n from public.search_trips('osm-n246843686', 'osm-n293546203', now() - interval '1 day', now() + interval '1 day');
  if n <> 0 then raise exception 'FAIL: driver should not see own trips, got %', n; end if;
end $$;

-- Whole West Bank: nearby towns count, exact ones come first, flagged places are refused.
select set_config('request.jwt.claim.sub', '', true);
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000000d', 'osm-n246843682', 'osm-n293546203', now() + interval '1 hour', 3, 25),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-00000000000d', 'osm-n332780054', 'osm-n246843686', now() + interval '3 hours', 3, 25);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare ids uuid[]; r record;
begin
  -- Ramallah -> Nablus: c1 (exact) first even though c4 (Bitunia, next door) leaves earlier.
  select array_agg(s.id order by ord) into ids
    from public.search_trips('osm-n246843686', 'osm-n293546203', now() - interval '1 day', now() + interval '1 day')
         with ordinality as s(id, a, b, c, d, e, f, g, h, i, j, k, l, m, ord);
  if ids <> array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4']::uuid[] then
    raise exception 'FAIL: expected exact then nearby, got %', ids;
  end if;
  select * into r from public.search_trips('osm-n246843686', 'osm-n293546203', now() - interval '1 day', now() + interval '1 day') s
   where s.id = '00000000-0000-0000-0000-0000000000c4';
  if r.origin_km <= 0 or r.origin_km > 5 or r.destination_km <> 0 then
    raise exception 'FAIL: Bitunia should be a few km from Ramallah, got % / %', r.origin_km, r.destination_km;
  end if;
  -- Huwara is about 8 km from Nablus: shows for Nablus -> Ramallah, after the exact trip.
  select array_agg(s.id order by ord) into ids
    from public.search_trips('osm-n293546203', 'osm-n246843686', now() - interval '1 day', now() + interval '1 day')
         with ordinality as s(id, a, b, c, d, e, f, g, h, i, j, k, l, m, ord);
  if ids <> array['00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c5']::uuid[] then
    raise exception 'FAIL: expected Huwara trip after the exact one, got %', ids;
  end if;
end $$;

select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
    values ('00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n1695006618', now() + interval '1 hour', 3, 25);
    raise exception 'FAIL: a trip to a settlement was allowed';
  exception when others then
    if sqlerrm <> 'place_not_allowed' then raise; end if;
  end;
  if public.city_name('osm-n293546203', 'ar') <> 'نابلس' or public.city_name('osm-n293546203', 'en') <> 'Nablus' then
    raise exception 'FAIL: city_name should read the places table';
  end if;
end $$;

select 'All search_trips checks passed' as result;
rollback;
