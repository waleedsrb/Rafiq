-- Checks slice 15b: following a checkpoint, and the question as you pass one.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000040d'), ('00000000-0000-0000-0000-0000000004a1'),
  ('00000000-0000-0000-0000-0000000004a2'), ('00000000-0000-0000-0000-0000000004a3');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000040d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000004a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000004a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000004a3', 'Omar Khalil', 'm', 'en');

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Amir and Aya follow Huwara. Follows are private.
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a1');
insert into public.checkpoint_follows (checkpoint_id) values ('huwara');
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a2');
insert into public.checkpoint_follows (checkpoint_id) values ('huwara');
do $$ begin
  if (select count(*) from public.checkpoint_follows) <> 1 then raise exception 'FAIL: follows should be private'; end if;
end $$;

-- 2. Omar reports Huwara closed: both followers hear it (Amir in Arabic), Omar doesn't.
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a3');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'closed');
reset role;
do $$ declare a record; begin
  if (select count(*) from public.notifications where kind = 'checkpoint_status') <> 2 then
    raise exception 'FAIL: expected 2 status pushes, got %', (select count(*) from public.notifications where kind = 'checkpoint_status');
  end if;
  select * into a from public.notifications where kind = 'checkpoint_status' and user_id = '00000000-0000-0000-0000-0000000004a1';
  if a.title <> 'حوارة: مغلق' or a.url <> '/checkpoints/huwara' then raise exception 'FAIL: Amir got %', row_to_json(a); end if;
end $$;

-- 3. Aya confirms closed: same status, no new push. Amir reports open (tie -> newest = open),
--    but it's within 10 minutes of the last push: no push either.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a2');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'closed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000004a1');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'open');
reset role;
do $$ begin
  if (select count(*) from public.notifications where kind = 'checkpoint_status') <> 2 then
    raise exception 'FAIL: pushed again too soon or for the same status';
  end if;
end $$;

-- 4. After 10 minutes a real change goes out again: Omar now says open too (each person
--    counts once, so it's 2 open to 1 closed). Both followers hear; Omar doesn't follow.
update public.checkpoint_announcements set announced_at = now() - interval '11 minutes';
alter table public.checkpoint_reports disable trigger checkpoint_reports_guard;
insert into public.checkpoint_reports (checkpoint_id, reporter_id, status) values
  ('huwara', '00000000-0000-0000-0000-0000000004a3', 'open');
alter table public.checkpoint_reports enable trigger checkpoint_reports_guard;
do $$ begin
  if (select count(*) from public.notifications where kind = 'checkpoint_status') <> 4
     or not exists (select 1 from public.notifications where kind = 'checkpoint_status'
                     and user_id = '00000000-0000-0000-0000-0000000004a2' and title = 'Huwara: open') then
    raise exception 'FAIL: change after 10 minutes not announced to both followers';
  end if;
end $$;

-- 5. A trip underway passes Zaatara: its passengers get one question, the driver none.
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000040d', 'Kia Picanto', 'White', '7-1234-95');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-00000000040d', 'ramallah', 'nablus', now() + interval '2 hours', 3, 25);
insert into public.bookings (trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004a2'),
  ('00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004a3');
select pg_temp.as_user('00000000-0000-0000-0000-00000000040d');
update public.bookings set status = 'accepted' where trip_id = '00000000-0000-0000-0000-0000000004c1';
select pg_temp.as_user(null);
update public.profiles set ask_near_checkpoints = false where id = '00000000-0000-0000-0000-0000000004a3';
-- 5 km south of Zaatara: nothing. Then 300 m away, twice: one question for Aya only.
insert into public.trip_positions (trip_id, lat, lng) values ('00000000-0000-0000-0000-0000000004c1', 32.0717, 35.2566);
update public.trip_positions set lat = 32.1140 where trip_id = '00000000-0000-0000-0000-0000000004c1';
update public.trip_positions set lat = 32.1150 where trip_id = '00000000-0000-0000-0000-0000000004c1';
do $$ declare q record; begin
  if (select count(*) from public.notifications where kind = 'checkpoint_ask') <> 1 then
    raise exception 'FAIL: expected exactly one question, got %', (select count(*) from public.notifications where kind = 'checkpoint_ask');
  end if;
  select * into q from public.notifications where kind = 'checkpoint_ask';
  if q.user_id <> '00000000-0000-0000-0000-0000000004a2' or q.title <> 'Passing Zaatara?' or q.url <> '/checkpoints/zaatara' then
    raise exception 'FAIL: question was %', row_to_json(q);
  end if;
end $$;

select 'All checkpoint follow checks passed' as result;
rollback;
