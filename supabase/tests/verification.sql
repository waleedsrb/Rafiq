-- Checks slice 5: verification requests, admin review, and "verified before booking or driving".
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

-- d = driver, p = passenger, a = admin
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000000ad', 'Admin Person');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000000ad');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Nobody can mark themselves verified.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$update public.profiles set id_verified_at = now() where id = auth.uid()$$, 'set by a reviewer');
select pg_temp.expect_error($$update public.driver_details set verified_at = now() where driver_id = auth.uid()$$, 'set by a reviewer');

-- 2. Unverified driver can't post; unverified passenger can't book.
select pg_temp.expect_error($$insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
  values (auth.uid(), 'ramallah', 'nablus', now() + interval '1 day', 3, 25)$$, 'not approved');

-- 3. Requests: right photo count, own folder only, one pending at a time.
select pg_temp.expect_error($$insert into public.verifications (user_id, kind, photos)
  values (auth.uid(), 'driver', array['00000000-0000-0000-0000-00000000000d/id.jpg'])$$, 'ID, licence and car');
select pg_temp.expect_error($$insert into public.verifications (user_id, kind, photos)
  values (auth.uid(), 'driver', array['someone-else/id.jpg', '00000000-0000-0000-0000-00000000000d/l.jpg', '00000000-0000-0000-0000-00000000000d/c.jpg'])$$, 'your own');
insert into public.verifications (user_id, kind, photos, status) values (
  '00000000-0000-0000-0000-00000000000d', 'driver',
  array['00000000-0000-0000-0000-00000000000d/id.jpg', '00000000-0000-0000-0000-00000000000d/l.jpg', '00000000-0000-0000-0000-00000000000d/c.jpg'],
  'approved'  -- ignored: a new request is always pending
);
do $$ begin
  if (select status from public.verifications where user_id = auth.uid()) <> 'pending' then
    raise exception 'FAIL: new request should be pending';
  end if;
end $$;
select pg_temp.expect_error($$insert into public.verifications (user_id, kind, photos)
  values (auth.uid(), 'driver', array['00000000-0000-0000-0000-00000000000d/a.jpg', '00000000-0000-0000-0000-00000000000d/b.jpg', '00000000-0000-0000-0000-00000000000d/c.jpg'])$$, 'duplicate');

-- 4. Only admins review, and a rejection needs a reason.
select pg_temp.expect_error($$select public.review_verification((select id from public.verifications limit 1), true)$$, 'Only admins');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.verifications (user_id, kind, photos)
values (auth.uid(), 'passenger', array['00000000-0000-0000-0000-0000000000a1/id.jpg']);
do $$ begin
  if (select count(*) from public.verifications) <> 1 then
    raise exception 'FAIL: a passenger should only see their own requests';
  end if;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000ad');
do $$ begin
  if (select count(*) from public.verifications where status = 'pending') <> 2 then
    raise exception 'FAIL: admin should see both requests';
  end if;
end $$;
select pg_temp.expect_error($$select public.review_verification(
  (select id from public.verifications where kind = 'passenger'), false, '')$$, 'Say why');
select public.review_verification((select id from public.verifications where kind = 'passenger'), false, 'Photo is blurry');
select public.review_verification((select id from public.verifications where kind = 'driver'), true);
select pg_temp.expect_error($$select public.review_verification((select id from public.verifications where kind = 'driver'), true)$$, 'not waiting');

-- 5. The approved driver can post; the rejected passenger still can't book.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', auth.uid(), 'ramallah', 'nablus', now() + interval '1 day', 3, 25);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select reject_reason from public.verifications where user_id = auth.uid()) <> 'Photo is blurry' then
    raise exception 'FAIL: passenger should see the reason';
  end if;
  if not (select driver_verified from public.search_trips('ramallah', 'nablus', now(), now() + interval '2 days') limit 1) then
    raise exception 'FAIL: search should show the driver as verified';
  end if;
  if not public.is_verified_driver('00000000-0000-0000-0000-00000000000d') then
    raise exception 'FAIL: is_verified_driver should say yes';
  end if;
  if exists (select 1 from public.driver_details) then
    raise exception 'FAIL: a passenger must not read driver_details';
  end if;
end $$;
select pg_temp.expect_error($$insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', auth.uid())$$, 'Verify your ID');

-- 6. Changing the car takes the driver's verification away.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.driver_details set plate = '7-9999-95' where driver_id = auth.uid();
do $$ begin
  if (select verified_at from public.driver_details where driver_id = auth.uid()) is not null then
    raise exception 'FAIL: a new plate should need a new check';
  end if;
end $$;

reset role;
select 'All verification checks passed' as result;
rollback;
