-- Checks slice 12 part 1: women-only trips, gender confirmed from the ID, late cancels.
begin;
-- These tests create bookings directly, as if each had gone through request_seat().
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

-- Dana (driver, woman), Amir (man), Aya (woman), Rana (woman, not yet checked), Omar (driver, man).
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000000a2', '970593333333'),
  ('00000000-0000-0000-0000-0000000000a3', '970594444444'),
  ('00000000-0000-0000-0000-00000000000e', '970595555555'),
  ('00000000-0000-0000-0000-0000000000ad', '970596666666');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a3', 'Rana Odeh', 'f', 'ar'),
  ('00000000-0000-0000-0000-00000000000e', 'Omar Khalil', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Person', 'm', 'en');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');
insert into public.driver_details (driver_id, car_model, car_color, plate) values
  ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95'),
  ('00000000-0000-0000-0000-00000000000e', 'Skoda Octavia', 'Grey', '7-5678-95');

-- Everyone but Rana is already verified, gender included (as the server).
select pg_temp.act_as(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now(), gender_verified_at = now()
 where id <> '00000000-0000-0000-0000-0000000000a3';

-- 1. Nobody can confirm their own gender, or change it once confirmed.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select pg_temp.expect_error($$
  update public.profiles set gender_verified_at = now() where id = '00000000-0000-0000-0000-0000000000a3'
$$, 'set by a reviewer');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$
  update public.profiles set gender = 'f' where id = '00000000-0000-0000-0000-0000000000a1'
$$, 'confirmed from your ID');

-- 2. The admin confirms gender when approving: Rana typed 'f', the ID says so too.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into public.verifications (user_id, kind, photos)
values ('00000000-0000-0000-0000-0000000000a3', 'passenger', array['00000000-0000-0000-0000-0000000000a3/id.jpg']);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000ad');
select pg_temp.expect_error($$
  select public.review_verification((select id from public.verifications limit 1), true, null, 'x')
$$, 'gender shown on the ID');
select public.review_verification((select id from public.verifications limit 1), true, null, 'f');
do $$ begin
  if not public.is_verified_woman('00000000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL: Rana should be a verified woman';
  end if;
  if public.is_verified_woman('00000000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: Amir is not a verified woman';
  end if;
end $$;

-- 3. Only a verified woman can post a women-only trip.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect_error($$
  insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, women_only)
  values ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 3, 25, true)
$$, 'Only women');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils, women_only) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 3, 25, true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '1 day 1 hour', 3, 25, false);

-- 4. Men don't see it in search; verified women do.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select count(*) from public.search_trips('osm-n246843686', 'osm-n293546203', now(), now() + interval '2 days')) <> 1 then
    raise exception 'FAIL: a man should only see the open trip';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  if (select count(*) from public.search_trips('osm-n246843686', 'osm-n293546203', now(), now() + interval '2 days') where women_only) <> 1 then
    raise exception 'FAIL: a woman should see the women-only trip';
  end if;
end $$;

-- 5. Only women can ask for a seat on it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$
  insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1')
$$, 'women only');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into public.bookings (trip_id, passenger_id)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');

-- 6. Once someone asked, the driver can't switch women-only off (or on, on the other trip with requests).
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$
  update public.trips set women_only = false where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'can''t change');

-- 7. Cancelling only through cancel_trip().
select pg_temp.expect_error($$
  update public.trips set cancelled_at = now() where id = '00000000-0000-0000-0000-0000000000c2'
$$, 'cancel_trip');

-- 8. Late cancels: three trips tonight, each with an accepted seat.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '3 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '4 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '5 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '6 hours', 3, 25);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000a2');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where passenger_id = '00000000-0000-0000-0000-0000000000a2' and trip_id::text like '%d_';

-- The closed-checkpoint excuse only works when one is reported closed.
select pg_temp.expect_error($$
  select public.cancel_trip('00000000-0000-0000-0000-0000000000d4', 'checkpoint_closed')
$$, 'No closed checkpoint');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.checkpoint_reports (checkpoint_id, reporter_id, status)
values ('zaatara', '00000000-0000-0000-0000-0000000000a1', 'closed');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.cancel_trip('00000000-0000-0000-0000-0000000000d4', 'checkpoint_closed');
do $$ begin
  if (select cancelled_late from public.trips where id = '00000000-0000-0000-0000-0000000000d4') then
    raise exception 'FAIL: a closed checkpoint should excuse the cancel';
  end if;
end $$;

-- A trip with nobody booked is never late; the two-day trip isn't late either.
select public.cancel_trip('00000000-0000-0000-0000-0000000000c2');
select public.cancel_trip('00000000-0000-0000-0000-0000000000d1');
select public.cancel_trip('00000000-0000-0000-0000-0000000000d2');
do $$ begin
  if (select cancelled_late from public.trips where id = '00000000-0000-0000-0000-0000000000c2') then
    raise exception 'FAIL: cancelling a trip nobody booked is not late';
  end if;
  if (select late_cancels_30d from public.my_driving_record()) <> 2
     or (select paused_until from public.my_driving_record()) is not null then
    raise exception 'FAIL: two late cancels, no pause yet';
  end if;
end $$;

-- The third late cancel pauses posting for 7 days.
select public.cancel_trip('00000000-0000-0000-0000-0000000000d3');
do $$ begin
  if (select paused_until from public.my_driving_record()) < now() + interval '6 days 23 hours' then
    raise exception 'FAIL: three late cancels should pause posting for 7 days';
  end if;
end $$;
select pg_temp.expect_error($$
  insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
  values ('00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 3, 25)
$$, 'Posting is paused');

-- The passengers still got their money back (the driver cancelled).
do $$ begin
  if exists (select 1 from public.payments p join public.bookings b on b.id = p.booking_id
              where b.passenger_id = '00000000-0000-0000-0000-0000000000a2'
                and b.trip_id::text like '%d_' and p.status <> 'refunded') then
    raise exception 'FAIL: driver cancels must refund';
  end if;
end $$;

-- 9. Old late cancels (older than 30 days, or a pause that ended) don't block posting.
select pg_temp.act_as(null);
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, cancelled_at, cancelled_late) values
  ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() - interval '40 days', 3, 25, now() - interval '40 days', true),
  ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() - interval '20 days', 3, 25, now() - interval '20 days', true),
  ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() - interval '10 days', 3, 25, now() - interval '10 days', true),
  ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() - interval '9 days',  3, 25, now() - interval '9 days', true);
select pg_temp.act_as('00000000-0000-0000-0000-00000000000e');
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000000e', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 3, 25);

select 'All safety checks passed' as result;
rollback;
