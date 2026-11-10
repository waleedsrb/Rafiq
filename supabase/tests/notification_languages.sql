-- Notifications keep both languages, so the inbox can follow the app's language.
begin;
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000007d1', '970597000001'),
  ('00000000-0000-0000-0000-0000000007a1', '970597000002');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-0000000007d1', 'Lina Odeh', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000007a1', 'Omar Zaid', 'm', 'ar');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-0000000007d1', 'Kia Picanto', 'White', '7-7777-95');
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now() where driver_id = '00000000-0000-0000-0000-0000000007d1';
update public.profiles set id_verified_at = now() where id in ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007a1');
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007d1', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 3, 25);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007d1', true);
select public.register_push_token('ExponentPushToken[lina]');

-- 1. Omar asks for a seat: Lina (English) gets it in English, and the Arabic words are kept too.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', true);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007a1');
do $$
declare n record; m jsonb;
begin
  select * into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000007d1' order by id desc limit 1;
  select body -> 0 into m from net.sent order by id desc limit 1;
  if n.title <> 'New seat request' or n.body <> 'Omar wants a seat: Ramallah → Nablus'
     or n.title_en <> n.title or n.body_en <> n.body
     or n.title_ar <> 'طلب مقعد جديد' or n.body_ar <> 'Omar يريد مقعداً: رام الله ← نابلس' then
    raise exception 'FAIL: request row was %', row_to_json(n);
  end if;
  if m ->> 'title' <> 'New seat request' or m ->> 'body' <> n.body then
    raise exception 'FAIL: push was %', m;
  end if;
end $$;

-- 2. Lina accepts: Omar (Arabic) gets Arabic title/body, English kept beside it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007d1', true);
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000007b1';
do $$
declare n record;
begin
  select * into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000007a1' and kind = 'accepted';
  if n.title <> 'تم تأكيد مقعدك' or n.title_ar <> n.title or n.body_ar <> n.body
     or n.title_en <> 'Your seat is confirmed' or n.body_en <> 'Lina accepted you: Ramallah → Nablus' then
    raise exception 'FAIL: accepted row was %', row_to_json(n);
  end if;
end $$;

-- 3. The old five-argument send_push still works (one language only).
do $$
begin
  perform public.send_push('00000000-0000-0000-0000-0000000007a1', 'test', 'Hello', 'World', null);
  if not exists (select 1 from public.notifications
                  where user_id = '00000000-0000-0000-0000-0000000007a1' and kind = 'test'
                    and title = 'Hello' and title_ar is null and title_en is null) then
    raise exception 'FAIL: one-language send_push';
  end if;
end $$;

-- 4. Nobody can call the bilingual send_push from the app.
do $$ begin
  if has_function_privilege('authenticated', 'public.send_push(uuid, text, text, text, text, text, text)', 'execute') then
    raise exception 'FAIL: app users can send pushes';
  end if;
end $$;

rollback;
\echo 'notification_languages: all checks passed'
