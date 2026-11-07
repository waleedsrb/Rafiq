-- Checks slice 3b: the right person gets the right message, in their language.
begin;
-- Slice 6: these tests create bookings directly, as if each had gone through request_seat().
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000d', '970591111111'),
  ('00000000-0000-0000-0000-0000000000a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000000a2', '970593333333');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'ar');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
-- Slice 5: everyone in these tests is already verified (set as the server, no signed-in user).
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'ramallah', 'nablus', now() + interval '1 day', 3, 25);

-- Phones register (each person for themselves).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
select public.register_push_token('ExponentPushToken[driver]');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.register_push_token('ExponentPushToken[amir]');

-- 1. A request notifies the driver, in English, naming the passenger.
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1');
do $$
declare m jsonb;
begin
  select body -> 0 into m from net.sent order by id desc limit 1;
  if m ->> 'to' <> 'ExponentPushToken[driver]' or m ->> 'body' <> 'Amir wants a seat: Ramallah → Nablus'
     or m -> 'data' ->> 'url' <> '/trips/requests/00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FAIL: request push was %', m;
  end if;
end $$;

-- 2. Accepting notifies the passenger, in Arabic, with the driver's gender.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000000b1';
do $$
declare m jsonb;
begin
  select body -> 0 into m from net.sent order by id desc limit 1;
  if m ->> 'to' <> 'ExponentPushToken[amir]' or m ->> 'title' <> 'تم تأكيد مقعدك'
     or m ->> 'body' <> 'Dana قبلت طلبك: رام الله ← نابلس' then
    raise exception 'FAIL: accept push was %', m;
  end if;
end $$;

-- 3. Someone with no registered phone: the booking still works, nothing is sent.
do $$
declare before int;
begin
  select count(*) into before from net.sent;
  -- The driver signs out on their phone.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
  perform public.unregister_push_token('ExponentPushToken[driver]');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2');
  if (select count(*) from net.sent) <> before then
    raise exception 'FAIL: sent a push to a signed-out phone';
  end if;
end $$;

-- 4. A phone that changes account moves to the new person; nobody can steal it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select public.register_push_token('ExponentPushToken[amir]');
do $$ begin
  if (select user_id from public.push_tokens where token = 'ExponentPushToken[amir]')
     <> '00000000-0000-0000-0000-0000000000a2' then
    raise exception 'FAIL: token did not move to the new account';
  end if;
end $$;
-- Amir can no longer unregister it (it isn't his any more).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.unregister_push_token('ExponentPushToken[amir]');
do $$ begin
  if not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[amir]') then
    raise exception 'FAIL: removed someone else''s token';
  end if;
end $$;

-- 5. Phones can't read the token table directly.
set local role authenticated;
do $$ begin
  if exists (select 1 from public.push_tokens) then
    raise exception 'FAIL: tokens readable';
  end if;
end $$;
reset role;

select 'All push notification checks passed' as result;
rollback;
