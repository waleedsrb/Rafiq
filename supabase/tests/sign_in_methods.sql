-- Checks slice 13: people who signed in by email/Apple/Google are reachable on
-- the number they typed, only after acceptance, and nobody else can read it.
begin;
select set_config('rafiq.paying', 'on', false);

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000013d', '970591111111'),   -- driver, phone sign in
  ('00000000-0000-0000-0000-0000000013a1', null),             -- passenger, email sign in
  ('00000000-0000-0000-0000-0000000013a2', null);             -- stranger
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-00000000013d', 'Dana Haddad'),
  ('00000000-0000-0000-0000-0000000013a1', 'Amir Saleh'),
  ('00000000-0000-0000-0000-0000000013a2', 'Aya Nasser');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000013d', 'Kia Picanto', 'White', '7-1234-95');
select set_config('request.jwt.claim.sub', '', true);
update public.driver_details set verified_at = now() where driver_id = '00000000-0000-0000-0000-00000000013d';
update public.profiles set id_verified_at = now() where id::text like '00000000-0000-0000-0000-0000000013%' or id = '00000000-0000-0000-0000-00000000013d';

-- 1. The passenger saves their number; a bad number is refused.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013a1', true);
do $$ begin
  insert into public.contact_phones (user_id, phone) values ('00000000-0000-0000-0000-0000000013a1', '12345');
  raise exception 'FAIL: bad number saved';
exception when check_violation then null;
end $$;
insert into public.contact_phones (user_id, phone) values ('00000000-0000-0000-0000-0000000013a1', '970592222222');

-- 2. Nobody can save a number for someone else.
do $$ begin
  insert into public.contact_phones (user_id, phone) values ('00000000-0000-0000-0000-0000000013a2', '970593333333');
  raise exception 'FAIL: saved a number for someone else';
exception when insufficient_privilege then null;
end $$;

-- 3. The stranger cannot read it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013a2', true);
do $$ begin
  if exists (select 1 from public.contact_phones) then raise exception 'FAIL: stranger read a number'; end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '', true);
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-0000000013c1', '00000000-0000-0000-0000-00000000013d', 'ramallah', 'nablus', now() + interval '1 day', 3, 25);
insert into public.bookings (id, trip_id, passenger_id) values
  ('00000000-0000-0000-0000-0000000013b1', '00000000-0000-0000-0000-0000000013c1', '00000000-0000-0000-0000-0000000013a1');

-- 4. Before acceptance the driver sees nothing.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000013d', true);
do $$ begin
  if exists (select 1 from public.trip_contact('00000000-0000-0000-0000-0000000013b1')) then
    raise exception 'FAIL: contact before acceptance';
  end if;
end $$;

-- 5. After acceptance the driver gets the typed number, the passenger the sign-in one.
update public.bookings set status = 'accepted' where id = '00000000-0000-0000-0000-0000000013b1';
do $$ declare r record; begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000013b1');
  if r.phone is distinct from '970592222222' then raise exception 'FAIL: driver got %', row_to_json(r); end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013a1', true);
do $$ declare r record; begin
  select * into r from public.trip_contact('00000000-0000-0000-0000-0000000013b1');
  if r.phone is distinct from '970591111111' then raise exception 'FAIL: passenger got %', row_to_json(r); end if;
end $$;

-- 6. Deleting the account forgets the typed number.
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set deleted_at = now() where id = '00000000-0000-0000-0000-0000000013a1';
do $$ begin
  if exists (select 1 from public.contact_phones where user_id = '00000000-0000-0000-0000-0000000013a1') then
    raise exception 'FAIL: number kept after delete';
  end if;
end $$;

rollback;
