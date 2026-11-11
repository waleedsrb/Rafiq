-- The first real ride, end to end, the way the pilot runs it (cash, photos required).
--
-- Every other file tests one step on its own. This one walks a single ride through all of
-- them, in order, as the real people would: sign up, get verified, post, request, accept,
-- see each other's details, trip day, arrive, rate. If one step stops handing over to the
-- next (a renamed status, a trigger that now refuses), this is the test that notices.
-- Runs inside a transaction and rolls back.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL (first ride): %', what; end if;
end $$;
create function pg_temp.pushed(who uuid, kind text) returns boolean language sql as $$
  select exists (select 1 from public.notifications n where n.user_id = who and n.kind = $2)
$$;

-- The pilot's live settings (checked Nov 10): cash only, no fee, profile photo required.
update public.settings set value = 1 where key = 'cash_only';
update public.settings set value = 0 where key = 'service_fee_ils';
update public.settings set value = 1 where key = 'profile_photo_required';

-- Supabase Auth creates the accounts: Dana drives, Amir rides, Waleed reviews IDs.
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000f00d', '970591111111'), ('00000000-0000-0000-0000-00000000f0a1', '970592222222'),
  ('00000000-0000-0000-0000-00000000f0ad', null);
insert into public.profiles (id, full_name, language) values ('00000000-0000-0000-0000-00000000f0ad', 'Admin Waleed', 'en');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000f0ad');

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
create temp table ride (k text primary key, v uuid);
grant all on ride to authenticated;
set local role authenticated;

-- 1. Sign up: each person writes their own profile, photo and phone token.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f00d');
insert into public.profiles (id, full_name, gender, language)
values (auth.uid(), 'Dana Haddad', 'f', 'en');
update public.profiles set avatar_path = auth.uid() || '/avatar-1.jpg' where id = auth.uid();
select public.register_push_token('ExponentPushToken[dana]');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values (auth.uid(), 'Kia Picanto', 'White', '7-1234-95');
insert into public.verifications (user_id, kind, photos) values (auth.uid(), 'driver',
  array[auth.uid() || '/id.jpg', auth.uid() || '/licence.jpg', auth.uid() || '/car.jpg']);

select pg_temp.as_user('00000000-0000-0000-0000-00000000f0a1');
insert into public.profiles (id, full_name, gender, language)
values (auth.uid(), 'Amir Saleh', 'm', 'ar');
update public.profiles set avatar_path = auth.uid() || '/avatar-1.jpg' where id = auth.uid();
select public.register_push_token('ExponentPushToken[amir]');
insert into public.verifications (user_id, kind, photos) values (auth.uid(), 'passenger', array[auth.uid() || '/id.jpg']);

-- 2. The admin approves both from the admin site; both hear about it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f0ad');
select public.review_verification(id, true, null, case when kind = 'driver' then 'f' else 'm' end)
  from public.verifications where status = 'pending';
reset role;
select pg_temp.check((select verified_at is not null from public.driver_details where driver_id = '00000000-0000-0000-0000-00000000f00d'), 'Dana is a verified driver');
select pg_temp.check((select id_verified_at is not null from public.profiles where id = '00000000-0000-0000-0000-00000000f0a1'), 'Amir is verified');
select pg_temp.check(pg_temp.pushed('00000000-0000-0000-0000-00000000f0a1', 'verification_approved'), 'Amir told he is verified');
set local role authenticated;

-- 3. Dana posts Ramallah -> Nablus tomorrow at 7, 3 seats, 25 NIS.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f00d');
with t as (
  insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
  values (auth.uid(), 'osm-n246843686', 'osm-n293546203', date_trunc('day', now()) + interval '1 day 7 hours', 3, 25)
  returning id)
insert into ride select 'trip', id from t;

-- 4. Amir finds it and asks for a seat (cash); Dana gets the request.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.check(exists (
  select 1 from public.search_trips('osm-n246843686', 'osm-n293546203', now(), now() + interval '2 days') s
   where s.id = (select v from ride where k = 'trip')), 'Amir finds the trip in search');
insert into ride values ('booking', public.request_seat_cash((select v from ride where k = 'trip')));
select pg_temp.check((select status::text from public.bookings where id = (select v from ride where k = 'booking')) = 'requested', 'request is waiting for Dana');
select pg_temp.check((select count(*) from public.trip_contact((select v from ride where k = 'booking'))) = 0, 'no contact details before acceptance');

-- 5. Dana accepts; Amir hears and sees "Dana H." and her car. Phone and plate wait for
--    the hour before the trip.
select pg_temp.as_user('00000000-0000-0000-0000-00000000f00d');
update public.bookings set status = 'accepted' where id = (select v from ride where k = 'booking');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.check((select name = 'Dana H.' and car_model = 'Kia Picanto' and phone is null and plate is null
                        from public.trip_contact((select v from ride where k = 'booking'))),
  'after acceptance: short name and car, no phone or plate yet');
reset role;
select pg_temp.check(pg_temp.pushed('00000000-0000-0000-0000-00000000f00d', 'requested'), 'Dana was told about the request');
select pg_temp.check(pg_temp.pushed('00000000-0000-0000-0000-00000000f0a1', 'accepted'), 'Amir was told he is accepted');
select pg_temp.check(public.seats_left((select v from ride where k = 'trip')) = 2, 'one seat taken, two left');

-- 6. Trip day: 20 minutes before, Amir says he's here; Dana ticks him in and starts.
update public.trips set departs_at = now() + interval '20 minutes' where id = (select v from ride where k = 'trip');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000f0a1');
select pg_temp.check((select plate = '7-1234-95' and phone is not null from public.trip_contact((select v from ride where k = 'booking'))),
  'within the hour: phone and plate');
select public.im_here((select v from ride where k = 'booking'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000f00d');
select public.mark_boarded((select v from ride where k = 'booking'));
select public.start_trip((select v from ride where k = 'trip'));
select public.report_position((select v from ride where k = 'trip'), 31.95, 35.22, 20);

-- 7. Arrived: the booking completes, both are asked to rate, and they do.
select public.finish_trip((select v from ride where k = 'trip'));
select pg_temp.check((select status::text from public.bookings where id = (select v from ride where k = 'booking')) = 'completed', 'booking completed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f0a1');
select public.rate_trip((select v from ride where k = 'booking'), 5, array['on_time'], 'Thank you');
select pg_temp.as_user('00000000-0000-0000-0000-00000000f00d');
select public.rate_trip((select v from ride where k = 'booking'), 5);
reset role;
select pg_temp.check(pg_temp.pushed('00000000-0000-0000-0000-00000000f00d', 'passenger_here'), 'Dana told Amir is here');
select pg_temp.check(pg_temp.pushed('00000000-0000-0000-0000-00000000f0a1', 'rate_driver'), 'Amir asked to rate');
select pg_temp.check((select count(*) from public.ratings where booking_id = (select v from ride where k = 'booking')) = 2, 'both ratings saved');
select pg_temp.check(not exists (select 1 from public.payments), 'cash pilot: no payment rows at all');

-- 8. Every step left its mark in the booking history (we record step times from day one).
select pg_temp.check((select array_agg(to_status::text order by id) from public.booking_events
                       where booking_id = (select v from ride where k = 'booking'))
                     = array['requested', 'accepted', 'completed'], 'booking history is requested -> accepted -> completed');

select 'The first ride works end to end' as result;
rollback;
