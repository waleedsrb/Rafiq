-- Checks slice 14b: ride alerts and the driver nudge.
begin;

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

-- Dana drives; Amir (Arabic), Aya, Omar and Rami are passengers.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000020d'), ('00000000-0000-0000-0000-0000000002a1'),
  ('00000000-0000-0000-0000-0000000002a2'), ('00000000-0000-0000-0000-0000000002a3'),
  ('00000000-0000-0000-0000-0000000002a4');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000020d', 'Dana Haddad', 'f', 'ar'),
  ('00000000-0000-0000-0000-0000000002a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000002a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000002a3', 'Omar Khalil', 'm', 'en'),
  ('00000000-0000-0000-0000-0000000002a4', 'Rami Odeh', 'm', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000020d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
-- Dana drove Ramallah -> Nablus last week.
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000020d', 'ramallah', 'nablus', now() + interval '1 hour', 3, 25);
update public.trips set departs_at = now() - interval '7 days';

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Amir saves an alert for a window two days from now.
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a1');
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 5 hours');
-- Nobody else sees it.
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a2');
do $$ begin
  if exists (select 1 from public.ride_alerts) then raise exception 'FAIL: alerts are private'; end if;
end $$;
-- A past window and someone else's alert are refused.
select pg_temp.expect_error($$insert into public.ride_alerts (origin, destination, window_from, window_to)
  values ('ramallah', 'nablus', now() - interval '3 hours', now() - interval '1 hour')$$, 'already passed');
select pg_temp.expect_error($$insert into public.ride_alerts (passenger_id, origin, destination, window_from, window_to)
  values ('00000000-0000-0000-0000-0000000002a1', 'ramallah', 'nablus', now() + interval '1 day', now() + interval '1 day 1 hour')$$,
  'row-level security');

-- 2. Two more people for the same day: at 3, Dana gets one nudge (in Arabic, feminine).
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 2 hours');
reset role;
do $$ begin
  if exists (select 1 from public.notifications where kind = 'alert_driver_nudge') then
    raise exception 'FAIL: nudged before 3 people';
  end if;
end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a3');
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 2 hours');
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a4');
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 2 hours');
-- The demand count the Post a trip screen shows.
do $$ begin
  if (select waiting from public.alert_demand('ramallah', 'nablus') limit 1) <> 4 then
    raise exception 'FAIL: demand was %', (select json_agg(d) from public.alert_demand('ramallah', 'nablus') d);
  end if;
end $$;
reset role;
do $$ declare n record; begin
  if (select count(*) from public.notifications where kind = 'alert_driver_nudge') <> 1 then
    raise exception 'FAIL: expected exactly one nudge, got %', (select count(*) from public.notifications where kind = 'alert_driver_nudge');
  end if;
  select * into n from public.notifications where kind = 'alert_driver_nudge';
  if n.user_id <> '00000000-0000-0000-0000-00000000020d' or n.body not like '% انشري رحلة؟' or n.url <> '/trips/new' then
    raise exception 'FAIL: nudge was %', row_to_json(n);
  end if;
end $$;

-- 3. Dana posts a trip inside the windows: Amir, Aya, Omar and Rami each get one push.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000020d');
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000020d', 'ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days 1 hour', 3, 25);
reset role;
do $$ declare n record; begin
  if (select count(*) from public.notifications where kind = 'alert_match') <> 4 then
    raise exception 'FAIL: expected 4 matches, got %', (select count(*) from public.notifications where kind = 'alert_match');
  end if;
  select * into n from public.notifications where kind = 'alert_match' and user_id = '00000000-0000-0000-0000-0000000002a1';
  if n.title <> 'رحلة جديدة كما طلبت' or n.body not like 'رام الله%' or n.url not like '/trips/%' then
    raise exception 'FAIL: Amir''s alert push was %', row_to_json(n);
  end if;
  if exists (select 1 from public.ride_alerts where matched_at is null) then
    raise exception 'FAIL: alerts should be matched';
  end if;
end $$;

-- 4. A second trip in the same window doesn't ping again (an alert fires once).
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000020d', 'ramallah', 'nablus', date_trunc('hour', now()) + interval '2 days 30 minutes', 3, 25);
do $$ begin
  if (select count(*) from public.notifications where kind = 'alert_match') <> 4 then raise exception 'FAIL: alert fired twice'; end if;
end $$;

-- 5. Wrong direction or outside the window doesn't match.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a2');
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('nablus', 'ramallah', date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 3 hours');
reset role;
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-00000000020d', 'ramallah', 'nablus', date_trunc('hour', now()) + interval '3 days 1 hour', 3, 25),
  ('00000000-0000-0000-0000-00000000020d', 'nablus', 'ramallah', date_trunc('hour', now()) + interval '3 days 4 hours', 3, 25);
do $$ begin
  if exists (select 1 from public.ride_alerts where origin = 'nablus' and matched_at is not null) then
    raise exception 'FAIL: matched the wrong trip';
  end if;
end $$;

-- 6. A women-only trip doesn't ping a man's alert (he couldn't book it).
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a3');
insert into public.ride_alerts (origin, destination, window_from, window_to)
values ('ramallah', 'nablus', date_trunc('hour', now()) + interval '4 days', date_trunc('hour', now()) + interval '4 days 3 hours');
reset role;
select pg_temp.as_user(null);
update public.profiles set gender_verified_at = now(), id_verified_at = now() where id = '00000000-0000-0000-0000-00000000020d';
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils, women_only)
values ('00000000-0000-0000-0000-00000000020d', 'ramallah', 'nablus', date_trunc('hour', now()) + interval '4 days 1 hour', 3, 25, true);
do $$ begin
  if exists (select 1 from public.ride_alerts where passenger_id = '00000000-0000-0000-0000-0000000002a3'
              and window_from > now() + interval '3 days' and matched_at is not null) then
    raise exception 'FAIL: women-only trip matched a man''s alert';
  end if;
end $$;

select 'All ride alert checks passed' as result;
rollback;
