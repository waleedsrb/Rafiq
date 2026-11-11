-- Checks slice 10a: the inbox, the notification switches, and deleting an account.
begin;
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000010d', '970591111111'),
  ('00000000-0000-0000-0000-0000000001a1', '970592222222'),
  ('00000000-0000-0000-0000-0000000001a2', '970593333333');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000010d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000001a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000001a2', 'Aya Nasser', 'f', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000010d', 'Kia Picanto', 'White', '7-1234-95');
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-00000000010d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 3, 25);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000010d', true);
select public.register_push_token('ExponentPushToken[dana]');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);
select public.register_push_token('ExponentPushToken[amir10]');

-- 1. A seat request lands in the driver's inbox AND is pushed, same words.
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000001b1', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001a1');
do $$
declare n record; m jsonb;
begin
  select * into n from public.notifications
   where user_id = '00000000-0000-0000-0000-00000000010d' order by id desc limit 1;
  select body -> 0 into m from net.sent order by id desc limit 1;
  if n.kind <> 'requested' or n.body <> 'Amir wants a seat: Ramallah → Nablus'
     or n.url <> '/trips/requests/00000000-0000-0000-0000-0000000001c1' or n.read_at is not null then
    raise exception 'FAIL: inbox row was %', row_to_json(n);
  end if;
  if m ->> 'to' <> 'ExponentPushToken[dana]' or m ->> 'body' <> n.body then
    raise exception 'FAIL: push was %', m;
  end if;
end $$;

-- 2. Someone with no phone registered still gets the inbox row.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000010d', true);
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000001b1';
do $$ begin
  if not exists (select 1 from public.notifications
                  where user_id = '00000000-0000-0000-0000-0000000001a1' and kind = 'accepted'
                    and title = 'تم تأكيد مقعدك') then
    raise exception 'FAIL: accepted message missing from Amir''s inbox';
  end if;
end $$;

-- 3. Switching seat requests off: still in the inbox, no push.
update public.profiles set notify_trips = false where id = '00000000-0000-0000-0000-00000000010d';
do $$
declare before int;
begin
  select count(*) into before from net.sent;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a2', true);
  insert into public.bookings (trip_id, passenger_id)
  values ('00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001a2');
  if (select count(*) from net.sent) <> before then
    raise exception 'FAIL: pushed although seat requests are switched off';
  end if;
  if (select count(*) from public.notifications
       where user_id = '00000000-0000-0000-0000-00000000010d' and kind = 'requested') <> 2 then
    raise exception 'FAIL: switched-off message missing from the inbox';
  end if;
end $$;

-- 4. Essential messages ignore the switch (a trip cancelled always buzzes).
do $$ begin
  if not public.push_allowed('00000000-0000-0000-0000-00000000010d', 'trip_cancelled') then
    raise exception 'FAIL: essential message silenced';
  end if;
  if public.push_allowed('00000000-0000-0000-0000-00000000010d', 'accepted') then
    raise exception 'FAIL: switch ignored';
  end if;
end $$;

-- 5. You read only your own inbox, and can mark it read, but can't write to it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.notifications where user_id <> '00000000-0000-0000-0000-0000000001a1') then
    raise exception 'FAIL: someone else''s notifications are readable';
  end if;
  if not exists (select 1 from public.notifications) then
    raise exception 'FAIL: own notifications not readable';
  end if;
end $$;
select public.mark_notifications_read();
do $$ begin
  if exists (select 1 from public.notifications where read_at is null) then
    raise exception 'FAIL: not marked read';
  end if;
  begin
    insert into public.notifications (user_id, kind, title, body)
    values ('00000000-0000-0000-0000-0000000001a1', 'x', 'fake', 'fake');
    raise exception 'FAIL: wrote to the inbox directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_push('00000000-0000-0000-0000-0000000001a1', 'x', 'fake', 'fake');
    raise exception 'FAIL: called send_push from the app';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 6. Auto-share needs an emergency contact; the phone must look like a phone.
do $$ begin
  begin
    update public.profiles set auto_share = true where id = '00000000-0000-0000-0000-0000000001a1';
    raise exception 'FAIL: auto-share without a contact';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set emergency_name = 'Mum', emergency_phone = '0599' where id = '00000000-0000-0000-0000-0000000001a1';
    raise exception 'FAIL: bad emergency phone accepted';
  exception when check_violation then null;
  end;
end $$;
update public.profiles set emergency_name = 'Umm Amir', emergency_phone = '+970599000000', auto_share = true
 where id = '00000000-0000-0000-0000-0000000001a1';

-- 7. Amir deletes his account: his accepted seat is cancelled (Dana is told),
--    the sign-in is gone, the profile is anonymous, and Dana's trip keeps its history.
--    His gender was confirmed from his ID, which used to block the wipe (Nov 11 bug).
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set gender_verified_at = now() where id = '00000000-0000-0000-0000-0000000001a1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000001a1', true);
select public.delete_my_account();
do $$
declare p record;
begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000001a1') then
    raise exception 'FAIL: sign-in still there';
  end if;
  select * into p from public.profiles where id = '00000000-0000-0000-0000-0000000001a1';
  if p.deleted_at is null or p.full_name <> 'Former member' or p.emergency_phone is not null
     or p.gender is not null or p.auto_share then
    raise exception 'FAIL: profile not anonymised: %', row_to_json(p);
  end if;
  if (select status from public.bookings where id = '00000000-0000-0000-0000-0000000001b1') <> 'cancelled' then
    raise exception 'FAIL: open seat not cancelled';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = '00000000-0000-0000-0000-00000000010d' and kind = 'passenger_cancelled'
                    and body = 'Amir cancelled their seat: Ramallah → Nablus') then
    raise exception 'FAIL: driver not told about the cancelled seat';
  end if;
  if exists (select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-0000000001a1')
     or exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000001a1') then
    raise exception 'FAIL: tokens or inbox left behind';
  end if;
  if not exists (select 1 from public.booking_events where booking_id = '00000000-0000-0000-0000-0000000001b1') then
    raise exception 'FAIL: booking history removed';
  end if;
end $$;

-- 8. Not while driving: a started trip blocks deleting the account.
select set_config('request.jwt.claim.sub', '', true);
update public.trips set started_at = now() where id = '00000000-0000-0000-0000-0000000001c1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000010d', true);
do $$ begin
  perform public.delete_my_account();
  raise exception 'FAIL: deleted the account mid-trip';
exception when raise_exception then
  if sqlerrm <> 'Finish your trip first' then raise; end if;
end $$;
select set_config('request.jwt.claim.sub', '', true);
update public.trips set started_at = null where id = '00000000-0000-0000-0000-0000000001c1';

-- 9. A driver deleting their account cancels their upcoming trips.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000010d', true);
select public.delete_my_account();
do $$ begin
  if (select cancelled_at from public.trips where id = '00000000-0000-0000-0000-0000000001c1') is null then
    raise exception 'FAIL: upcoming trip not cancelled';
  end if;
  if exists (select 1 from public.driver_details where driver_id = '00000000-0000-0000-0000-00000000010d') then
    raise exception 'FAIL: car and plate left behind';
  end if;
end $$;

select 'All notifications inbox checks passed' as result;
rollback;
