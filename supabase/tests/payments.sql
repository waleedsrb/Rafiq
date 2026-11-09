-- Checks slice 6: the card is held on request, charged on accept, released or refunded by the rules.
begin;
-- The card checks run with the fee as it was in slice 6 (the cash pilot sets it to 0).
update public.settings set value = 2 where key = 'service_fee_ils';

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
create function pg_temp.pay_status(p_booking uuid) returns text language sql as $$
  select status::text from public.payments where booking_id = p_booking;
$$;

-- d = driver, a1..a4 = passengers. Everyone verified (set as the server).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a4');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'), ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser'), ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil'),
  ('00000000-0000-0000-0000-0000000000a4', 'Lina Odeh');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
-- c1 leaves in 2 days (cancel in time is possible); c2 leaves in 3 hours (any cancel is late).
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 4, 25),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '3 hours', 4, 30);
-- The pretend gateway sees the PostgREST role; reading payments as that role needs these grants.
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. No booking without paying, and a declined card leaves nothing behind.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', auth.uid())$$, 'Pay for the seat');
select pg_temp.expect_error($$select public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_decline', 'visa', '0002')$$, 'declined');
select pg_temp.expect_error($$select public.request_seat('00000000-0000-0000-0000-0000000000c1', 'not-a-token', 'visa', '4242')$$, 'Unknown card');
do $$ begin
  if exists (select 1 from public.bookings) then raise exception 'FAIL: a declined card must not create a booking'; end if;
end $$;

-- 2. Request = hold fare + fee. Accept = charge.
create temp table ids (who text primary key, booking uuid);
grant all on ids to authenticated;
insert into ids values ('a1', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_4242', 'visa', '4242'));
do $$
declare p record;
begin
  select * into p from public.payments where booking_id = (select booking from ids where who = 'a1');
  if p.status <> 'held' or p.fare_ils <> 25 or p.fee_ils <> 2 or p.total_ils <> 27 or p.card_last4 <> '4242' then
    raise exception 'FAIL: hold was %', row_to_json(p);
  end if;
end $$;
select pg_temp.expect_error($$update public.payments set status = 'refunded'$$, 'permission denied');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into ids values ('a2', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_1881', 'visa', '1881'));
do $$ begin
  if (select count(*) from public.payments) <> 1 then raise exception 'FAIL: passengers see only their own payments'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into ids values ('a3', public.request_seat('00000000-0000-0000-0000-0000000000c2', 'tok_fake_5555', 'mastercard', '5555'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
insert into ids values ('a4', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_4444', 'visa', '4444'));

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id in (select booking from ids where who in ('a1', 'a3'));
update public.bookings set status = 'declined' where id = (select booking from ids where who = 'a2');

reset role;
do $$ begin
  if pg_temp.pay_status((select booking from ids where who = 'a1')) <> 'charged' then raise exception 'FAIL: accept should charge'; end if;
  if pg_temp.pay_status((select booking from ids where who = 'a2')) <> 'released' then raise exception 'FAIL: decline should release'; end if;
end $$;
set local role authenticated;

-- 3. Cancel in time: refund. Cancel late: stays charged. Withdraw a request: released.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.bookings set status = 'cancelled' where id = (select booking from ids where who = 'a1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
-- a3 was accepted moments ago, so the 15-minute grace applies: pretend it was accepted an hour ago.
reset role;
select pg_temp.as_user(null);
update public.bookings set accepted_at = now() - interval '1 hour' where id = (select booking from ids where who = 'a3');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
update public.bookings set status = 'cancelled' where id = (select booking from ids where who = 'a3');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
update public.bookings set status = 'cancelled' where id = (select booking from ids where who = 'a4');

reset role;
do $$ begin
  if pg_temp.pay_status((select booking from ids where who = 'a1')) <> 'refunded' then raise exception 'FAIL: cancel in time should refund'; end if;
  if pg_temp.pay_status((select booking from ids where who = 'a3')) <> 'charged' then raise exception 'FAIL: late cancel should stay charged'; end if;
  if pg_temp.pay_status((select booking from ids where who = 'a4')) <> 'released' then raise exception 'FAIL: withdrawing should release'; end if;
end $$;

-- 4. The driver cancels the whole trip: everyone accepted is refunded, even inside 12h.
select pg_temp.as_user(null);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2');
insert into public.payments (booking_id, passenger_id, provider_ref, card_brand, card_last4, fare_ils, fee_ils)
values ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a2', 'fake_x', 'visa', '1881', 30, 2);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b5';
select public.cancel_trip('00000000-0000-0000-0000-0000000000c2');
reset role;
do $$ begin
  if pg_temp.pay_status('00000000-0000-0000-0000-0000000000b5') <> 'refunded' then raise exception 'FAIL: driver cancel should refund'; end if;
  -- a3's late cancel happened before the trip was cancelled, so it stays charged.
  if pg_temp.pay_status((select booking from ids where who = 'a3')) <> 'charged' then raise exception 'FAIL: earlier late cancel changed'; end if;
end $$;

select 'All payment checks passed' as result;
rollback;
