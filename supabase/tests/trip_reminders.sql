-- Checks slice 14c: one reminder an hour before departure.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000030d'), ('00000000-0000-0000-0000-0000000003a1'),
  ('00000000-0000-0000-0000-0000000003a2'), ('00000000-0000-0000-0000-0000000003a3');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000030d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000003a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000003a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000003a3', 'Omar Khalil', 'm', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000030d', 'Kia Picanto', 'White', '7-1234-95');
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();

-- Trip 1 leaves in 40 minutes: Amir accepted, Aya still waiting for an answer.
-- Trip 2 leaves in 3 hours: Omar accepted (too early to remind).
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-00000000030d', 'osm-n246843686', 'osm-n293546203', now() + interval '40 minutes', 3, 25),
  ('00000000-0000-0000-0000-0000000003c2', '00000000-0000-0000-0000-00000000030d', 'osm-n293546203', 'osm-n246843686', now() + interval '3 hours', 3, 25);
insert into public.bookings (trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003a1'),
  ('00000000-0000-0000-0000-0000000003c1', '00000000-0000-0000-0000-0000000003a2'),
  ('00000000-0000-0000-0000-0000000003c2', '00000000-0000-0000-0000-0000000003a3');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000030d', true);
update public.bookings set status = 'accepted'
 where passenger_id in ('00000000-0000-0000-0000-0000000003a1', '00000000-0000-0000-0000-0000000003a3');
select set_config('request.jwt.claim.sub', '', true);

-- 1. The job reminds Amir (Arabic, with the car and plate) and Dana (1 seat booked). Not Aya, not Omar.
do $$ declare n int; a record; d record; begin
  n := public.send_trip_reminders();
  if n <> 2 then raise exception 'FAIL: expected 2 reminders, sent %', n; end if;
  select * into a from public.notifications where kind = 'trip_reminder' and user_id = '00000000-0000-0000-0000-0000000003a1';
  if a.title not like 'رحلتك تنطلق الساعة %' or a.body not like '%Kia Picanto White · 7-1234-95'
     or a.url <> '/trips/00000000-0000-0000-0000-0000000003c1' then
    raise exception 'FAIL: Amir''s reminder was %', row_to_json(a);
  end if;
  select * into d from public.notifications where kind = 'trip_reminder' and user_id = '00000000-0000-0000-0000-00000000030d';
  if d.title not like 'Your trip leaves at %' or d.body <> 'Ramallah → Nablus · 1 seat booked'
     or d.url <> '/trips/requests/00000000-0000-0000-0000-0000000003c1' then
    raise exception 'FAIL: Dana''s reminder was %', row_to_json(d);
  end if;
  if exists (select 1 from public.notifications where kind = 'trip_reminder'
              and user_id in ('00000000-0000-0000-0000-0000000003a2', '00000000-0000-0000-0000-0000000003a3')) then
    raise exception 'FAIL: reminded someone without a confirmed seat soon';
  end if;
end $$;

-- 2. Running again sends nothing new.
do $$ begin
  if public.send_trip_reminders() <> 0 then raise exception 'FAIL: reminded twice'; end if;
end $$;

select 'All trip reminder checks passed' as result;
rollback;
