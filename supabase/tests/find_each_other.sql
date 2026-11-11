-- Checks slice 2: no car no trip; name and car after acceptance, phone and plate only
-- from an hour before the trip (contact_privacy, Nov 11).
begin;
-- Slice 6: these tests create bookings directly, as if each had gone through request_seat().
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000000a2', '970593333333');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser');

-- 1. Posting a trip without a car fails.
do $$ begin
  insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
  values ('00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 3, 25);
  raise exception 'FAIL: trip posted without a car';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if position('Add your car' in sqlerrm) = 0 then raise exception 'FAIL: wrong error: %', sqlerrm; end if;
end $$;

-- 2. With a car it works.
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
-- Slice 5: everyone in these tests is already verified (set as the server, no signed-in user).
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 3, 25);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1');

-- 3. Before acceptance: nothing is revealed, to either side.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ begin
  if exists (select 1 from public.trip_contact('00000000-0000-0000-0000-0000000000b1')) then
    raise exception 'FAIL: contact revealed before acceptance';
  end if;
end $$;

-- 4. The driver accepts. A day out, the passenger sees the driver's short name and car,
--    but not the phone or plate yet (they open an hour before the trip).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare r record;
begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000000b1');
  if r.phone is not null or r.plate is not null or r.name <> 'Dana H.' or r.first_name <> 'Dana'
     or r.car_model <> 'Kia Picanto' or r.car_color <> 'White'
     or r.opens_at is distinct from (select departs_at - interval '60 minutes' from public.trips where id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: passenger a day out got %', row_to_json(r);
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
declare r record;
begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000000b1');
  if r.phone is not null or r.name <> 'Amir S.' then
    raise exception 'FAIL: driver a day out got %', row_to_json(r);
  end if;
end $$;

-- 5. 45 minutes before: the passenger gets phone and plate, the driver gets the
--    passenger's phone and no car fields.
update public.trips set departs_at = now() + interval '45 minutes' where id = '00000000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$
declare r record;
begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000000b1');
  if r.phone is distinct from '970591111111' or r.plate is distinct from '7-1234-95' then
    raise exception 'FAIL: passenger 45 min before got %', row_to_json(r);
  end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$
declare r record;
begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000000b1');
  if r.phone is distinct from '970592222222' or r.plate is not null or r.car_model is not null then
    raise exception 'FAIL: driver 45 min before got %', row_to_json(r);
  end if;
end $$;

-- 6. A stranger sees nothing, even after acceptance.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
do $$ begin
  if exists (select 1 from public.trip_contact('00000000-0000-0000-0000-0000000000b1')) then
    raise exception 'FAIL: stranger saw the contact';
  end if;
end $$;

select 'All find-each-other checks passed' as result;
rollback;
