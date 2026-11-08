-- Slice 13: more ways to sign in (email code, Apple, Google) besides the SMS code.
--
-- Until now every account came from a phone number, so trip_contact() could read
-- the number straight from auth.users. People who sign in with email, Apple or
-- Google have no phone there, but the driver and passenger still need to call
-- each other once a seat is accepted. So those people type their mobile number
-- in the profile step, and it is kept here.
--
-- Why a separate table and not a column on profiles: every signed-in person can
-- read every profile (names on trip cards), and a phone number must stay hidden
-- until a booking is accepted. This table is readable only by its owner; the
-- other side gets the number through trip_contact(), like before.
--
-- The number is NOT checked by SMS (the pilot has no SMS provider yet). The ID
-- check by an admin is what makes an account trustworthy.

create table public.contact_phones (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  -- Same form auth.users uses for phone sign in: digits only, no plus.
  phone      text not null check (phone ~ '^(970|972)5[0-9]{8}$'),
  updated_at timestamptz not null default now()
);

alter table public.contact_phones enable row level security;

create policy contact_phones_read on public.contact_phones
  for select to authenticated using (user_id = auth.uid());
create policy contact_phones_insert on public.contact_phones
  for insert to authenticated with check (user_id = auth.uid());
create policy contact_phones_update on public.contact_phones
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.contact_phones to authenticated;

-- The number a person can be reached on: the one they signed in with, else the
-- one they typed. Server side only.
create or replace function public.reach_phone(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select nullif(u.phone, '') from auth.users u where u.id = p_user),
    (select c.phone from contact_phones c where c.user_id = p_user)
  );
$$;

revoke execute on function public.reach_phone(uuid) from public, anon, authenticated;

-- Same as slice 2, but the phone now comes from reach_phone().
create or replace function public.trip_contact(p_booking_id uuid)
returns table (
  first_name text,
  phone      text,
  car_model  text,
  car_color  text,
  plate      text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    split_part(p.full_name, ' ', 1),
    reach_phone(p.id),
    case when me_is_passenger then d.car_model end,
    case when me_is_passenger then d.car_color end,
    case when me_is_passenger then d.plate end
  from (
    select
      b.id,
      t.driver_id,
      b.passenger_id,
      (b.passenger_id = auth.uid()) as me_is_passenger
    from bookings b
    join trips t on t.id = b.trip_id
    where b.id = p_booking_id
      and b.status = 'accepted'
      and auth.uid() in (b.passenger_id, t.driver_id)
  ) x
  join profiles p
    on p.id = case when x.me_is_passenger then x.driver_id else x.passenger_id end
  left join driver_details d on d.driver_id = x.driver_id;
$$;

revoke execute on function public.trip_contact(uuid) from public, anon;
grant execute on function public.trip_contact(uuid) to authenticated;

-- Delete account (slice 10) keeps an anonymous profile row, so remove the typed
-- number the moment the profile is marked deleted.
create or replace function public.forget_contact_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from contact_phones where user_id = new.id;
  return new;
end;
$$;

revoke execute on function public.forget_contact_phone() from public, anon, authenticated;

create trigger profiles_forget_contact_phone
after update of deleted_at on public.profiles
for each row when (new.deleted_at is not null and old.deleted_at is null)
execute function public.forget_contact_phone();
