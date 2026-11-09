-- Profile photos: who may open whose photo, and the "photo required" switch.
begin;
select set_config('rafiq.paying', 'on', false);

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
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
end $$;

-- d = driver, p = passenger, s = stranger
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, full_name, gender, language, id_verified_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'Driver One', 'm', 'en', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'Passenger One', 'f', 'en', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'Stranger One', 'm', 'en', now());
insert into public.driver_details (driver_id, car_model, car_color, plate, verified_at)
values ('00000000-0000-0000-0000-0000000000d1', 'Kia', 'White', '7-1111-95', now());
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000d1', 'ramallah', 'nablus', now() + interval '2 days', 3, 25);
insert into public.bookings (id, trip_id, passenger_id)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000b1');
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. The path must be in your own folder.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($$update public.profiles set avatar_path = 'someone/avatar.jpg' where id = auth.uid()$$, 'check');
update public.profiles set avatar_path = '00000000-0000-0000-0000-0000000000b1/avatar-1.jpg' where id = auth.uid();

-- 2. Before acceptance: only you see your photo.
select pg_temp.check(public.can_see_avatar(auth.uid()), 'you see your own photo');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check(not public.can_see_avatar('00000000-0000-0000-0000-0000000000b1'), 'driver does not see a requester yet');

-- 3. After acceptance: the driver and passenger see each other; a stranger still doesn't.
reset role;
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-00000000b001';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.check(public.can_see_avatar('00000000-0000-0000-0000-0000000000b1'), 'driver sees accepted passenger');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check(public.can_see_avatar('00000000-0000-0000-0000-0000000000d1'), 'passenger sees their driver');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(not public.can_see_avatar('00000000-0000-0000-0000-0000000000b1'), 'stranger does not');

-- 4. "Photo required": the stranger (no photo) can't book or post; the passenger (photo) can book.
reset role;
update public.settings set value = 1 where key = 'profile_photo_required';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-00000000f001', auth.uid())$$, 'profile photo');

rollback;
