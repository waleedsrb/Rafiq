-- STAGING ONLY: the four test people, ready to ride. Run by
-- .github/workflows/staging-database.yml (never point this at live).
--
-- Same ids as the test accounts on live, so the trip and checkpoint scripts work on both.
-- Everyone signs in with a phone test number and the code 123456 (set once in the staging
-- dashboard: Authentication -> Sign In / Providers -> Phone -> Test phone numbers).
--
--   Waleed  +970591111111  7493831f-8353-4072-89a3-eb5eef6f4d9f  admin, man
--   Ahmad   +970592222222  71443aaf-e54d-44b9-9e7e-8ce3728c07de  man
--   Manar   +970593333333  bf9efa01-e6ca-40dc-92c0-8adb52676158  woman
--   Sara    +970594444444  50c08146-76e0-4958-bbdd-124844886957  woman
--
-- Each person goes through the same steps the app uses (profile, photo, car, driver check)
-- and Waleed approves them as admin, like e2e/seed.sql. Safe to run again: people who
-- already exist are skipped.
begin;

-- The pilot's settings: cash only, no fee, profile photo required.
update public.settings set value = 1 where key = 'cash_only';
update public.settings set value = 0 where key = 'service_fee_ils';
update public.settings set value = 1 where key = 'profile_photo_required';

create temp table seed_people (id uuid, phone text, full_name text, gender text, car text, color text, plate text)
  on commit drop;
insert into seed_people values
  ('7493831f-8353-4072-89a3-eb5eef6f4d9f', '970591111111', 'Waleed Barghouthi', 'm', 'Hyundai i10',   'Silver', '7-4521-95'),
  ('71443aaf-e54d-44b9-9e7e-8ce3728c07de', '970592222222', 'Ahmad Nasser',      'm', 'Kia Picanto',   'White',  '7-1234-95'),
  ('bf9efa01-e6ca-40dc-92c0-8adb52676158', '970593333333', 'Manar Khalil',      'f', 'Skoda Fabia',   'Blue',   '7-8810-95'),
  ('50c08146-76e0-4958-bbdd-124844886957', '970594444444', 'Sara Odeh',         'f', 'Toyota Yaris',  'Red',    '7-3307-95');
delete from seed_people s where exists (select 1 from auth.users u where u.id = s.id);
grant select on seed_people to authenticated;

-- Supabase Auth's own tables. The empty strings matter: Auth reads these token columns
-- as text and fails on NULL.
insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', phone, now(), '',
       '{"provider": "phone", "providers": ["phone"]}', '{}', now(), now(),
       '', '', '', '', '', '', '', ''
  from seed_people;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'phone',
       jsonb_build_object('sub', id::text, 'phone', phone, 'phone_verified', true), now(), now(), now()
  from seed_people;

-- Waleed is the admin (needs a profile first).
insert into public.profiles (id, full_name, gender, language)
select id, full_name, gender, 'en' from seed_people where phone = '970591111111';
insert into public.admins (user_id)
select id from seed_people where phone = '970591111111' on conflict do nothing;

-- From here on, act as each person, through the same rules the app meets.
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;

do $$
declare p record;
begin
  for p in select * from seed_people loop
    perform pg_temp.as_user(p.id);
    set local role authenticated;
    if p.phone <> '970591111111' then
      insert into public.profiles (id, full_name, gender, language) values (p.id, p.full_name, p.gender, 'en');
    end if;
    update public.profiles set avatar_path = p.id || '/avatar-1.jpg' where id = p.id;
    insert into public.driver_details (driver_id, car_model, car_color, plate) values (p.id, p.car, p.color, p.plate);
    insert into public.verifications (user_id, kind, photos)
    values (p.id, 'driver', array[p.id || '/id.jpg', p.id || '/licence.jpg', p.id || '/car.jpg']);
    reset role;
  end loop;
end $$;

-- Waleed approves everyone, as from the admin site.
select pg_temp.as_user('7493831f-8353-4072-89a3-eb5eef6f4d9f');
set local role authenticated;
select public.review_verification(v.id, true, null, s.gender)
  from public.verifications v join seed_people s on s.id = v.user_id
 where v.status = 'pending';
reset role;

do $$
begin
  if (select count(*) from public.driver_details
       where verified_at is not null
         and driver_id in ('7493831f-8353-4072-89a3-eb5eef6f4d9f', '71443aaf-e54d-44b9-9e7e-8ce3728c07de',
                           'bf9efa01-e6ca-40dc-92c0-8adb52676158', '50c08146-76e0-4958-bbdd-124844886957')) <> 4 then
    raise exception 'staging seed: all four test people should be verified drivers';
  end if;
end $$;

commit;
