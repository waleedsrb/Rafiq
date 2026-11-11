-- The people the end-to-end tests sign in as, loaded into the local database that
-- `supabase start` builds from supabase/migrations (see e2e/README.md).
--
-- Each person goes through the same steps the app and the admin site use (write your own
-- profile, send your ID, an admin approves), the way supabase/tests/first_ride.sql does,
-- so the tests start from a state real people can actually reach.
--
--   Dana Haddad   e2e-driver@rafiq.test   verified driver with a checked car
--   Amir Saleh    e2e-rider@rafiq.test    verified passenger
--   Admin         e2e-admin@rafiq.test    reviews the IDs (never signs in to the app)
--
-- Both sign in through the app with an emailed 6-digit code; the tests read the code from
-- the local mail catcher (Mailpit), so no password is needed.
begin;

-- The pilot's live settings: cash only, no fee, profile photo required.
update public.settings set value = 1 where key = 'cash_only';
update public.settings set value = 0 where key = 'service_fee_ils';
update public.settings set value = 1 where key = 'profile_photo_required';

-- Supabase Auth's own tables. The empty strings matter: Auth reads these token columns
-- as text and fails on NULL.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, '', now(),
       '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('00000000-0000-0000-0000-0000000e2e01'::uuid, 'e2e-driver@rafiq.test'),
    ('00000000-0000-0000-0000-0000000e2e02'::uuid, 'e2e-rider@rafiq.test'),
    ('00000000-0000-0000-0000-0000000e2ead'::uuid, 'e2e-admin@rafiq.test')
  ) as p (id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
  from auth.users where email like 'e2e-%@rafiq.test';

insert into public.profiles (id, full_name, language) values ('00000000-0000-0000-0000-0000000e2ead', 'E2E Admin', 'en');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000e2ead');

-- From here on, act as each person, through the same rules the app meets.
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- Dana: profile, photo, car, and her driver check (ID, licence, car).
select pg_temp.as_user('00000000-0000-0000-0000-0000000e2e01');
insert into public.profiles (id, full_name, gender, language) values (auth.uid(), 'Dana Haddad', 'f', 'en');
update public.profiles set avatar_path = auth.uid() || '/avatar-1.jpg' where id = auth.uid();
insert into public.driver_details (driver_id, car_model, car_color, plate)
values (auth.uid(), 'Kia Picanto', 'White', '7-1234-95');
insert into public.verifications (user_id, kind, photos) values (auth.uid(), 'driver',
  array[auth.uid() || '/id.jpg', auth.uid() || '/licence.jpg', auth.uid() || '/car.jpg']);

-- Amir: profile, photo and ID.
select pg_temp.as_user('00000000-0000-0000-0000-0000000e2e02');
insert into public.profiles (id, full_name, gender, language) values (auth.uid(), 'Amir Saleh', 'm', 'en');
update public.profiles set avatar_path = auth.uid() || '/avatar-1.jpg' where id = auth.uid();
insert into public.verifications (user_id, kind, photos) values (auth.uid(), 'passenger', array[auth.uid() || '/id.jpg']);

-- The admin approves both, as from the admin site.
select pg_temp.as_user('00000000-0000-0000-0000-0000000e2ead');
select public.review_verification(id, true, null, case when kind = 'driver' then 'f' else 'm' end)
  from public.verifications where status = 'pending';

reset role;

do $$
begin
  if (select verified_at from public.driver_details where driver_id = '00000000-0000-0000-0000-0000000e2e01') is null then
    raise exception 'seed: Dana should be a verified driver';
  end if;
  if (select id_verified_at from public.profiles where id = '00000000-0000-0000-0000-0000000e2e02') is null then
    raise exception 'seed: Amir should be verified';
  end if;
end $$;

commit;
