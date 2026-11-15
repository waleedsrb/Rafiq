-- STAGING ONLY. Run by .github/workflows/staging-database.yml (never point this at live).
-- Starts clean: removes earlier test trips first (bookings, reminders etc. cascade).
delete from trips where pickup_label like 'Test · %';

-- TEST DATA: trips and bookings in every state, built around Waleed's account.
-- Run once. Every test trip's pickup starts with "Test · " so they are easy to find and remove
-- (see cleanup-test-trips.sql). Written as the server, so it goes through the same rules
-- (seat counts, status moves) the app uses, but skips the payment and photo checks.

-- Test accounts
--   A = Ahmad  71443aaf-e54d-44b9-9e7e-8ce3728c07de
--   W = Waleed 7493831f-8353-4072-89a3-eb5eef6f4d9f
--   M = Manar  bf9efa01-e6ca-40dc-92c0-8adb52676158 (woman)
--   S = Sara   50c08146-76e0-4958-bbdd-124844886957 (woman)

-- A time in Palestine: days from today at a clock time.
create or replace function pg_temp.at(p_days int, p_time time) returns timestamptz
language sql as $f$
  select ((now() at time zone 'Asia/Hebron')::date + p_days + p_time) at time zone 'Asia/Hebron'
$f$;

-- Place ids by English name.
create or replace function pg_temp.place(p_name text) returns text language sql as $f$
  select case p_name
    when 'Ramallah' then 'osm-n246843686' when 'Nablus' then 'osm-n293546203'
    when 'Hebron' then 'osm-n299937114' when 'Jenin' then 'osm-n300254767'
    when 'Bethlehem' then 'osm-a13519431' when 'Tulkarm' then 'osm-n2418943009'
    when 'Qalqilya' then 'osm-n1567046521' when 'Jericho' then 'osm-n432335269' end
$f$;

-- A new trip, always posted for the future first (later steps move it into the past).
create or replace function pg_temp.trip(
  p_driver uuid, p_from text, p_to text, p_departs timestamptz, p_seats int, p_price numeric,
  p_pickup text, p_women boolean default false)
returns uuid language plpgsql as $f$
declare
  v_id uuid;
  v_from text := pg_temp.place(p_from);
  v_to text := pg_temp.place(p_to);
  v_cps text[] := case
    when p_from = 'Ramallah' and p_to = 'Nablus' then array['atara', 'uyun_haramiya', 'zaatara', 'huwara']
    when p_from = 'Nablus' and p_to = 'Ramallah' then array['huwara', 'zaatara', 'uyun_haramiya', 'atara']
    else '{}' end;
begin
  insert into trips (driver_id, origin, destination, departs_at, seats_total, price_ils, women_only,
                     pickup_label, pickup_lat, pickup_lng, checkpoint_ids)
  select p_driver, v_from, v_to, p_departs, p_seats, p_price, p_women,
         'Test · ' || p_pickup, p.lat + 0.002, p.lng + 0.002, v_cps
    from places p where p.id = v_from
  returning id into v_id;
  return v_id;
end $f$;

create or replace function pg_temp.book(p_trip uuid, p_passenger uuid, p_status text default 'requested', p_seats int default 1)
returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  insert into bookings (trip_id, passenger_id, seats) values (p_trip, p_passenger, p_seats) returning id into v_id;
  if p_status in ('accepted', 'completed', 'no_show') then
    update bookings set status = 'accepted' where id = v_id;
  end if;
  if p_status in ('declined', 'expired') then
    update bookings set status = p_status::booking_status where id = v_id;
  end if;
  return v_id;
end $f$;

do $$
declare
  A uuid := '71443aaf-e54d-44b9-9e7e-8ce3728c07de';
  W uuid := '7493831f-8353-4072-89a3-eb5eef6f4d9f';
  M uuid := 'bf9efa01-e6ca-40dc-92c0-8adb52676158';
  S uuid := '50c08146-76e0-4958-bbdd-124844886957';
  t uuid;
  b uuid;
begin
  ---------------------------------------------------------------- Waleed as a PASSENGER
  -- 1. Accepted, leaves in about 2 hours (trip day: plate, contact, "I'm here").
  t := pg_temp.trip(A, 'Ramallah', 'Nablus', now() + interval '2 hours 10 minutes', 3, 25, 'Al-Manara Square');
  perform pg_temp.book(t, W, 'accepted');
  perform pg_temp.book(t, S, 'accepted');

  -- 2. Waiting for the driver to answer (requested), tomorrow morning.
  t := pg_temp.trip(M, 'Nablus', 'Ramallah', pg_temp.at(1, '07:30'), 3, 25, 'Martyrs'' Square');
  perform pg_temp.book(t, W, 'requested');

  -- 3. Declined by the driver.
  t := pg_temp.trip(S, 'Ramallah', 'Bethlehem', pg_temp.at(1, '16:00'), 3, 20, 'Al-Manara Square');
  perform pg_temp.book(t, W, 'declined');

  -- 4. Request that ran out of time (expired).
  t := pg_temp.trip(A, 'Ramallah', 'Jericho', pg_temp.at(2, '09:00'), 3, 25, 'Al-Bireh municipality');
  perform pg_temp.book(t, W, 'expired');

  -- 5. Driver cancelled the whole trip after accepting Waleed.
  t := pg_temp.trip(M, 'Ramallah', 'Jenin', pg_temp.at(3, '08:00'), 3, 35, 'Al-Manara Square');
  b := pg_temp.book(t, W, 'accepted');
  update trips set cancelled_at = now(), cancelled_late = false where id = t;
  update bookings set status = 'cancelled' where id = b;

  -- 6. Finished yesterday, not rated yet (rating prompt).
  t := pg_temp.trip(A, 'Hebron', 'Ramallah', now() + interval '3 hours', 3, 30, 'Ras al-Jora');
  b := pg_temp.book(t, W, 'accepted');
  perform pg_temp.book(t, M, 'accepted');
  update trips set departs_at = pg_temp.at(-1, '07:00'), started_at = pg_temp.at(-1, '07:04'),
                   finished_at = pg_temp.at(-1, '08:20') where id = t;
  update bookings set status = 'completed' where trip_id = t and status = 'accepted';

  -- 7. Finished three days ago, also unrated (history list).
  t := pg_temp.trip(S, 'Nablus', 'Ramallah', now() + interval '3 hours', 3, 25, 'Martyrs'' Square');
  perform pg_temp.book(t, W, 'accepted');
  update trips set departs_at = pg_temp.at(-3, '17:00'), started_at = pg_temp.at(-3, '17:06'),
                   finished_at = pg_temp.at(-3, '18:15') where id = t;
  update bookings set status = 'completed' where trip_id = t and status = 'accepted';

  ---------------------------------------------------------------- Waleed as a DRIVER
  -- 8. Tomorrow, 3 seats: 2 requests to answer, 1 already accepted.
  t := pg_temp.trip(W, 'Ramallah', 'Nablus', pg_temp.at(1, '07:00'), 3, 25, 'Al-Manara Square');
  perform pg_temp.book(t, M, 'accepted');
  perform pg_temp.book(t, A, 'requested');
  perform pg_temp.book(t, S, 'requested');

  -- 9. Full trip in 2 days (every seat accepted).
  t := pg_temp.trip(W, 'Nablus', 'Tulkarm', pg_temp.at(2, '15:30'), 2, 15, 'Martyrs'' Square');
  perform pg_temp.book(t, A, 'accepted');
  perform pg_temp.book(t, S, 'accepted');

  -- 10. Posted, nobody asked yet.
  t := pg_temp.trip(W, 'Ramallah', 'Jericho', pg_temp.at(4, '10:00'), 4, 25, 'Al-Manara Square');

  -- 11. Drove yesterday evening with two riders (finished, rate your riders).
  t := pg_temp.trip(W, 'Nablus', 'Ramallah', now() + interval '3 hours', 3, 25, 'Martyrs'' Square');
  perform pg_temp.book(t, A, 'accepted');
  perform pg_temp.book(t, M, 'accepted');
  update trips set departs_at = pg_temp.at(-1, '17:30'), started_at = pg_temp.at(-1, '17:33'),
                   finished_at = pg_temp.at(-1, '18:40') where id = t;
  update bookings set status = 'completed' where trip_id = t and status = 'accepted';

  ---------------------------------------------------------------- Other people's trips (Search)
  -- Ramallah to Nablus: several times so the results list has a spread.
  t := pg_temp.trip(A, 'Ramallah', 'Nablus', pg_temp.at(0, '16:30'), 4, 25, 'Al-Manara Square');
  perform pg_temp.book(t, S, 'accepted');                                 -- 3 seats left
  t := pg_temp.trip(S, 'Ramallah', 'Nablus', pg_temp.at(1, '08:00'), 3, 25, 'Al-Bireh municipality', true);  -- women only
  t := pg_temp.trip(A, 'Ramallah', 'Nablus', pg_temp.at(1, '12:00'), 2, 25, 'Al-Manara Square');
  perform pg_temp.book(t, M, 'accepted');
  perform pg_temp.book(t, S, 'accepted');                                 -- full
  t := pg_temp.trip(M, 'Ramallah', 'Nablus', pg_temp.at(1, '17:15'), 3, 22, 'Al-Manara Square');
  perform pg_temp.book(t, S, 'requested');                                -- someone else waiting
  t := pg_temp.trip(A, 'Ramallah', 'Nablus', pg_temp.at(2, '07:00'), 3, 25, 'Al-Manara Square');

  -- Nablus to Ramallah.
  t := pg_temp.trip(A, 'Nablus', 'Ramallah', pg_temp.at(1, '17:00'), 3, 25, 'Martyrs'' Square');
  perform pg_temp.book(t, M, 'accepted');
  perform pg_temp.book(t, S, 'accepted');                                 -- 1 seat left
  t := pg_temp.trip(S, 'Nablus', 'Ramallah', pg_temp.at(2, '06:45'), 3, 25, 'Martyrs'' Square');

  -- Other routes across the West Bank.
  t := pg_temp.trip(S, 'Bethlehem', 'Ramallah', pg_temp.at(1, '07:15'), 3, 20, 'Bab al-Zqaq');
  t := pg_temp.trip(A, 'Hebron', 'Bethlehem', pg_temp.at(1, '09:00'), 4, 15, 'Ras al-Jora');
  t := pg_temp.trip(M, 'Jenin', 'Nablus', pg_temp.at(2, '08:30'), 3, 15, 'Jenin bus station');
  t := pg_temp.trip(S, 'Qalqilya', 'Nablus', pg_temp.at(2, '07:40'), 3, 15, 'Main roundabout');
  t := pg_temp.trip(A, 'Tulkarm', 'Ramallah', pg_temp.at(1, '06:45'), 3, 30, 'Tulkarm municipality');
  t := pg_temp.trip(M, 'Hebron', 'Ramallah', pg_temp.at(1, '06:30'), 3, 30, 'Ras al-Jora', true);  -- women only
end $$;

select count(*) as test_trips,
       (select count(*) from bookings b join trips t on t.id = b.trip_id where t.pickup_label like 'Test · %') as test_bookings
  from trips where pickup_label like 'Test · %';
