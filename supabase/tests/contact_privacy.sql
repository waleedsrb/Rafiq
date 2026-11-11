-- Who sees what about the other person (contact_privacy, Nov 11):
-- short names only, phone and plate from an hour before, car model and colour while booking.
begin;
select set_config('rafiq.paying', 'on', false);

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL (privacy): %', what; end if;
end $$;
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000031d0'), ('00000000-0000-0000-0000-0000000031a1'),
  ('00000000-0000-0000-0000-0000000031ad');
insert into public.profiles (id, full_name, gender, emergency_name, emergency_phone) values
  ('00000000-0000-0000-0000-0000000031d0', 'Dana Al Haddad', 'f', 'Mum', '+970599000000'),
  ('00000000-0000-0000-0000-0000000031a1', 'Amir Saleh', 'm', null, null),
  ('00000000-0000-0000-0000-0000000031ad', 'Waleed', 'm', null, null);
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000031ad');
insert into public.driver_details (driver_id, car_model, car_color, plate, verified_at)
values ('00000000-0000-0000-0000-0000000031d0', 'Kia Picanto', 'White', '7-1234-95', now());
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000031c1', '00000000-0000-0000-0000-0000000031d0',
        'osm-n246843686', 'osm-n293546203', now() + interval '1 day', 3, 25);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000031b1', '00000000-0000-0000-0000-0000000031c1', '00000000-0000-0000-0000-0000000031a1');
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000031b1';

-- The short name follows src/lib/names.ts: first word + first letter of the last word.
select pg_temp.check(public.short_name('  Dana  Al Haddad ') = 'Dana H.', 'short name of three words');
select pg_temp.check(public.short_name('وليد برغوثي') = 'وليد ب.', 'short name in Arabic');
select pg_temp.check(public.short_name('Waleed') = 'Waleed', 'one-word name stays');

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031a1', true);

-- 1. Another person's full name and emergency contact can't be read; the short name can.
select pg_temp.check(pg_temp.denied('select full_name from public.profiles'), 'full_name is not readable');
select pg_temp.check(pg_temp.denied('select emergency_phone from public.profiles'), 'emergency_phone is not readable');
select pg_temp.check(pg_temp.denied('select * from public.profiles'), 'select * is refused');
select pg_temp.check((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000031d0') = 'Dana H.',
  'others see the short name');
select pg_temp.check((select name from public.public_profile('00000000-0000-0000-0000-0000000031d0')) = 'Dana H.',
  'a person''s page shows the short name');

-- 2. You still read your own full profile, and can still change it.
select pg_temp.check((select full_name from public.my_profile()) = 'Amir Saleh', 'my_profile has my full name');
select pg_temp.check((select count(*) from public.my_profile()) = 1, 'my_profile is only me');
update public.profiles set emergency_name = 'Dad', emergency_phone = '+970599111111' where id = auth.uid();
select pg_temp.check((select emergency_name from public.my_profile()) = 'Dad', 'I can update my own row');

-- 3. Only admins get full names, to compare with the ID photo.
select pg_temp.check(pg_temp.denied($q$select public.admin_full_names(array['00000000-0000-0000-0000-0000000031d0'::uuid])$q$),
  'a rider can''t ask for full names');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031ad', true);
select pg_temp.check((select full_name from public.admin_full_names(array['00000000-0000-0000-0000-0000000031d0'::uuid])) = 'Dana Al Haddad',
  'an admin gets the full name');

-- 4. While booking, a rider sees the car's model and colour.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031a1', true);
select pg_temp.check((select car_model = 'Kia Picanto' and car_color = 'White' and driver_first_name = 'Dana' and driver_last_initial = 'H'
                        from public.search_trips('osm-n246843686', 'osm-n293546203', now(), now() + interval '2 days')
                       where id = '00000000-0000-0000-0000-0000000031c1'), 'search shows car model and colour');

-- 5. A day out, the share page for family shows the car but not the plate yet.
create temp table share_token (token text);
insert into share_token select public.share_trip('00000000-0000-0000-0000-0000000031c1');
select pg_temp.check((select plate is null and car_color = 'White' from public.shared_trip((select token from share_token))),
  'no plate on the share page a day out');
reset role;
update public.trips set departs_at = now() + interval '50 minutes' where id = '00000000-0000-0000-0000-0000000031c1';
select pg_temp.check((select plate = '7-1234-95' from public.shared_trip((select token from share_token))),
  'plate on the share page within the hour');

-- 6. The hour is a setting: at 30 minutes, 50 minutes out is still closed.
update public.settings set value = 30 where key = 'contact_reveal_minutes';
set local role authenticated;
select pg_temp.check((select phone is null and plate is null from public.trip_contact('00000000-0000-0000-0000-0000000031b1')),
  'reveal time follows the setting');

select 'All privacy checks passed' as result;
rollback;
