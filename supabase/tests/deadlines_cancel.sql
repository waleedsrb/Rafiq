-- Checks slice 4: response deadlines, expiry, and the cancel rules.
begin;

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

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000000a2', '970593333333');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');

-- Three trips: in 2 days, in 10 hours, in 3 hours.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '2 days', 3, 25),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '10 hours', 3, 25),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000d', 'nablus', 'ramallah', now() + interval '3 hours', 3, 25);

-- 1. The deadline depends on how far away the trip is (6h / 2h / 30 min).
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select respond_by - now() from public.bookings where id = '00000000-0000-0000-0000-0000000000b1') <> interval '6 hours'
  or (select respond_by - now() from public.bookings where id = '00000000-0000-0000-0000-0000000000b2') <> interval '2 hours'
  or (select respond_by - now() from public.bookings where id = '00000000-0000-0000-0000-0000000000b3') <> interval '30 minutes' then
    raise exception 'FAIL: wrong deadlines';
  end if;
end $$;

-- 2. A phone can't move its own deadline.
update public.bookings set respond_by = now() + interval '1 year' where id = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  if (select respond_by - now() from public.bookings where id = '00000000-0000-0000-0000-0000000000b1') <> interval '6 hours' then
    raise exception 'FAIL: passenger changed the deadline';
  end if;
end $$;

-- 3. Past the deadline the driver can't accept, and the job marks it expired.
select pg_temp.act_as(null);  -- the server, pretending time has passed
update public.bookings set respond_by = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$
  update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b3'
$$, 'expired');
select pg_temp.act_as(null);
do $$ begin
  if public.expire_requests() <> 1 then raise exception 'FAIL: expiry job count'; end if;
  if (select status from public.bookings where id = '00000000-0000-0000-0000-0000000000b3') <> 'expired' then
    raise exception 'FAIL: not expired';
  end if;
end $$;

-- 4. Cancelling 2 days ahead is free; 10 hours ahead it is late, unless just accepted.
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted'
 where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000b1';
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000b2';
do $$ begin
  if (select cancelled_late from public.bookings where id = '00000000-0000-0000-0000-0000000000b1') is distinct from false then
    raise exception 'FAIL: 2-day cancel should be free';
  end if;
  -- b2 was accepted seconds ago (a late booking), so the 15-minute grace applies.
  if (select cancelled_late from public.bookings where id = '00000000-0000-0000-0000-0000000000b2') is distinct from false then
    raise exception 'FAIL: grace period not applied';
  end if;
end $$;

-- Same, but accepted 20 minutes ago: now it is late.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b4';
select pg_temp.act_as(null);
update public.bookings set accepted_at = now() - interval '20 minutes' where id = '00000000-0000-0000-0000-0000000000b4';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000b4';
do $$ begin
  if (select cancelled_late from public.bookings where id = '00000000-0000-0000-0000-0000000000b4') is distinct from true then
    raise exception 'FAIL: should be a late cancel';
  end if;
end $$;

-- 5. The driver cancels a trip: open bookings are cancelled, search hides it, no new requests.
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');
select public.register_push_token('ExponentPushToken[aya]');
select pg_temp.expect_error($$ select public.cancel_trip('00000000-0000-0000-0000-0000000000c1') $$, 'Only the driver');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select public.cancel_trip('00000000-0000-0000-0000-0000000000c1');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  if (select status from public.bookings where id = '00000000-0000-0000-0000-0000000000b5') <> 'cancelled' then
    raise exception 'FAIL: booking not cancelled with the trip';
  end if;
  if (select body -> 0 ->> 'body' from net.sent order by id desc limit 1)
     <> 'Dana cancelled the trip: Ramallah → Nablus. Find another one.' then
    raise exception 'FAIL: trip-cancel push was %', (select body from net.sent order by id desc limit 1);
  end if;
  if exists (select 1 from public.search_trips('ramallah', 'nablus', now(), now() + interval '7 days')
             where id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: cancelled trip still in search';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$
  update public.trips set cancelled_at = null where id = '00000000-0000-0000-0000-0000000000c1'
$$, 'stays cancelled');

select 'All deadline and cancel checks passed' as result;
rollback;
