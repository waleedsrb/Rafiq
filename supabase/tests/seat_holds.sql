-- Seat holds and the waiting line (20261112000100_seat_holds.sql).
-- Runs inside a transaction and rolls back, so it leaves no data behind.

begin;
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
create or replace function pg_temp.status_of(b uuid) returns text language sql as $$
  select status::text from public.bookings where id = b;
$$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
end;
$$;

-- A driver and five riders.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000a5');
insert into public.profiles (id, full_name, gender) values
  ('00000000-0000-0000-0000-00000000000d', 'Driver Dana', 'f'),
  ('00000000-0000-0000-0000-0000000000a1', 'Rider One', 'm'),
  ('00000000-0000-0000-0000-0000000000a2', 'Rider Two', 'f'),
  ('00000000-0000-0000-0000-0000000000a3', 'Rider Three', 'm'),
  ('00000000-0000-0000-0000-0000000000a4', 'Rider Four', 'f'),
  ('00000000-0000-0000-0000-0000000000a5', 'Rider Five', 'm');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();

-- A trip with TWO seats.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d',
        'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 2, 25);

select pg_temp.check((select confirmed + waiting + in_line = 0 and line_room = 2
                        from public.trip_seat_counts where trip_id = '00000000-0000-0000-0000-0000000000c1'),
                     'a new trip has an empty counts row');

-- Riders ask one after another (created_at decides the line order).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.bookings (id, trip_id, passenger_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', now() - interval '5 min');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into public.bookings (id, trip_id, passenger_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', now() - interval '4 min');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into public.bookings (id, trip_id, passenger_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', now() - interval '3 min');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a4');
insert into public.bookings (id, trip_id, passenger_id, created_at) values
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', now() - interval '2 min');

select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b1') = 'requested', 'first ask holds a seat');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b2') = 'requested', 'second ask holds a seat');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b3') = 'queued', 'third rider waits in line');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b4') = 'queued', 'fourth rider waits in line');
select pg_temp.check((select respond_by is null from public.bookings where id = '00000000-0000-0000-0000-0000000000b3'),
                     'no answer clock while in line');
select pg_temp.check(public.seats_left('00000000-0000-0000-0000-0000000000c1') = 0, 'held seats are not free');
select pg_temp.check((select waiting = 2 and in_line = 2 and line_room = 0
                        from public.trip_seat_counts where trip_id = '00000000-0000-0000-0000-0000000000c1'),
                     'counts show 2 waiting and 2 in line');

-- The line is full too: the fifth rider can't ask.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
select pg_temp.expect_error($$
  insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a5')
$$, 'This trip is full');

-- Nobody in line can push themselves up.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
select pg_temp.expect_error($$
  update public.bookings set status = 'requested' where id = '00000000-0000-0000-0000-0000000000b3'
$$, 'Only the system');

-- The driver says no to the first: the first in line moves up and gets a fresh clock.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'declined' where id = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b3') = 'requested', 'line moved up after a no');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b4') = 'queued', 'second in line still waits');
select pg_temp.check((select respond_by > now() from public.bookings where id = '00000000-0000-0000-0000-0000000000b3'),
                     'moved-up rider gets an answer clock');
select pg_temp.check(exists (select 1 from public.notifications
                              where user_id = '00000000-0000-0000-0000-0000000000a3' and kind = 'line_moved'),
                     'moved-up rider is told');
-- Driver heard of the two first asks and the moved-up one, never of the line itself.
select pg_temp.check((select count(*) = 3 from public.notifications
                       where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'requested'),
                     'driver hears about asks, not the line');

-- The driver accepts one; an unanswered ask runs out of time: the line moves again.
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.act_as(null);
update public.bookings set respond_by = now() - interval '1 min' where id = '00000000-0000-0000-0000-0000000000b3';
select public.expire_requests();
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b3') = 'expired', 'late ask expired');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b4') = 'requested', 'line moved up after expiry');
select pg_temp.check((select confirmed = 1 and waiting = 1 and in_line = 0 and line_room = 2
                        from public.trip_seat_counts where trip_id = '00000000-0000-0000-0000-0000000000c1'),
                     'counts follow every change');

-- Withdrawing from the line is free and quiet: the driver never saw it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a5');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a5');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000b5') = 'queued', 'fifth rider now fits in line');
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000b5';
select pg_temp.check(not exists (select 1 from public.notifications
                                  where user_id = '00000000-0000-0000-0000-00000000000d' and kind = 'passenger_cancelled'),
                     'no ping for leaving the line');

-- A second trip: the driver cancels it, and the line is cancelled with it.
select pg_temp.act_as(null);
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d',
        'osm-n246843686', 'osm-n293546203', now() + interval '3 days', 1, 25);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000e2') = 'queued', 'one seat: second waits');

-- More seats move the line.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.trips set seats_total = 2 where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000e2') = 'requested', 'an added seat moves the line');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a3');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a3');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.cancel_trip('00000000-0000-0000-0000-0000000000c2', null);
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000e1') = 'cancelled', 'held ask cancelled with trip');
select pg_temp.check(pg_temp.status_of('00000000-0000-0000-0000-0000000000e3') = 'cancelled', 'line cancelled with trip');

select 'All seat hold checks passed' as result;
rollback;
