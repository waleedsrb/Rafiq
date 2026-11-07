-- Checks the booking rules in the slice 1 migration.
-- Runs inside a transaction and rolls back, so it leaves no data behind.
-- Run against a local Supabase database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_rules.sql
-- Any failed check raises an error and stops the script.

begin;

-- Pretend to be a signed-in user: Supabase's auth.uid() reads this setting.
create or replace function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;

-- expect_error('sql', 'message fragment'): the statement must fail with that message.
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

-- Three people: a driver and two passengers.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');
insert into public.profiles (id, full_name, gender) values
  ('00000000-0000-0000-0000-00000000000d', 'Driver Dana', 'f'),
  ('00000000-0000-0000-0000-0000000000a1', 'Passenger Amir', 'm'),
  ('00000000-0000-0000-0000-0000000000a2', 'Passenger Aya', 'f');

insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');

-- A trip with ONE seat, so the second accept must fail.
-- Slice 5: everyone in these tests is already verified (set as the server, no signed-in user).
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d',
        'ramallah', 'nablus', now() + interval '1 day', 1, 25);

-- Same city both ways is rejected.
select pg_temp.expect_error($$
  insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
  values ('00000000-0000-0000-0000-00000000000d', 'nablus', 'nablus', now(), 2, 20)
$$, 'trips_check');

-- Driver can't book their own trip.
select pg_temp.expect_error($$
  insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d')
$$, 'own trip');

-- Two passengers request.
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');

-- A passenger can't accept their own request.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$
  update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b1'
$$, 'Only the driver');

-- The driver accepts the first; the second no longer fits.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect_error($$
  update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'Not enough seats');
update public.bookings set status = 'declined' where id = '00000000-0000-0000-0000-0000000000b2';

-- Declined is final.
select pg_temp.expect_error($$
  update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b2'
$$, 'Cannot move');

-- No seats left.
do $$ begin
  if public.seats_left('00000000-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'FAIL: seats_left should be 0';
  end if;
end $$;

-- The funnel log has every step, with who did it.
do $$
declare n int;
begin
  select count(*) into n from public.booking_events;
  if n <> 4 then raise exception 'FAIL: expected 4 booking events, got %', n; end if;

  perform 1 from public.booking_events
  where booking_id = '00000000-0000-0000-0000-0000000000b1'
    and from_status = 'requested' and to_status = 'accepted'
    and actor_id = '00000000-0000-0000-0000-00000000000d';
  if not found then raise exception 'FAIL: accept event missing or wrong actor'; end if;
end $$;

select 'All booking rule checks passed' as result;
rollback;
