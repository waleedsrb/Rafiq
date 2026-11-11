-- Who sees what about the other person (Waleed, Nov 11):
--   1. A full name is never shown to other people: they see "Dana H." (first name + last
--      initial). Only you, and admins checking your ID, see your full name.
--   2. Phone number and plate appear shortly before the trip (contact_reveal_minutes,
--      60 = the hour-before reminder), not from the moment the seat is accepted.
--   3. Car model and colour are shown while booking, so a rider knows what they'd ride in.
--
-- Until now any signed-in phone could read every column of every profile (the app only
-- *displayed* the short name). That included full names and emergency contacts. Now the
-- database itself hides them: other people's rows only expose the public columns below.

-- ─── 1. Names ────────────────────────────────────────────────────────────────
-- Same rule as shortName() in src/lib/names.ts: first word + first letter of the last word.
create or replace function public.short_name(p_full text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_full is null or btrim(p_full) = '' then ''
    when btrim(p_full) !~ '\s' then btrim(p_full)
    else split_part(btrim(p_full), ' ', 1) || ' ' || left(regexp_replace(btrim(p_full), '^.*\s', ''), 1) || '.'
  end;
$$;

alter table public.profiles
  add column display_name text generated always as (public.short_name(full_name)) stored;

-- Column-level read rights. Public: what a trip card, a request or a review needs.
-- Private (yours only, through my_profile()): full name, emergency contact, notification
-- switches. NOTE: a column added to profiles later is private until it is granted here.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, gender, language, created_at, id_verified_at, gender_verified_at,
              deleted_at, avatar_path)
  on public.profiles to authenticated;

-- Your own profile, every column.
create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid();
$$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Admins compare the full name with the ID photo.
create or replace function public.admin_full_names(p_ids uuid[])
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query select p.id, p.full_name from profiles p where p.id = any (p_ids);
end;
$$;
revoke execute on function public.admin_full_names(uuid[]) from public, anon;
grant execute on function public.admin_full_names(uuid[]) to authenticated;

-- A person's page: short name instead of full name (the column is renamed, so drop first).
drop function public.public_profile(uuid);
create function public.public_profile(p_person uuid)
returns table (
  name             text,
  id_verified      boolean,
  member_since     timestamptz,
  deleted          boolean,
  car_model        text,
  car_color        text,
  driver_verified  boolean,
  driving_since    timestamptz,
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name,
         p.id_verified_at is not null,
         p.created_at,
         p.deleted_at is not null,
         d.car_model,
         d.car_color,
         d.verified_at is not null,
         coalesce((select min(t.departs_at) from trips t where t.driver_id = p.id and t.cancelled_at is null), d.verified_at),
         d.founding_at is not null
    from profiles p
    left join driver_details d on d.driver_id = p.id
   where p.id = p_person;
$$;
revoke execute on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;

-- ─── 2. Phone and plate shortly before the trip ──────────────────────────────
insert into public.settings (key, value) values ('contact_reveal_minutes', 60)
on conflict (key) do nothing;

-- When phone and plate open up for a trip.
create or replace function public.contact_opens_at(p_departs timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select p_departs - make_interval(mins => coalesce((select value from settings where key = 'contact_reveal_minutes'), 60)::int);
$$;
revoke execute on function public.contact_opens_at(timestamptz) from public, anon, authenticated;

-- The other person on an accepted booking. Name and car straight away; phone and plate
-- from opens_at on (the app shows "Phone and plate appear at 6:00" until then).
drop function public.trip_contact(uuid);
create function public.trip_contact(p_booking_id uuid)
returns table (
  first_name text,
  name       text,
  phone      text,
  car_model  text,
  car_color  text,
  plate      text,
  opens_at   timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    split_part(p.display_name, ' ', 1),
    p.display_name,
    case when x.open then reach_phone(p.id) end,
    case when x.me_is_passenger then d.car_model end,
    case when x.me_is_passenger then d.car_color end,
    case when x.me_is_passenger and x.open then d.plate end,
    x.opens_at
  from (
    select
      t.driver_id,
      b.passenger_id,
      (b.passenger_id = auth.uid()) as me_is_passenger,
      contact_opens_at(t.departs_at) as opens_at,
      -- a trip that already started is open whatever its planned time
      (now() >= contact_opens_at(t.departs_at) or t.started_at is not null) as open
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

-- The share page (for a rider's family) follows the same clock for the plate.
create or replace function public.shared_trip(p_token text)
returns table (
  origin public.city, destination public.city, departs_at timestamptz, started_at timestamptz, finished_at timestamptz,
  cancelled_at timestamptz, sharer_name text, driver_name text, car_model text, car_color text, plate text,
  lat numeric, lng numeric, position_at timestamptz,
  origin_ar text, origin_en text, destination_ar text, destination_en text
)
language sql stable security definer set search_path = public as $$
  select t.origin, t.destination, t.departs_at, t.started_at, t.finished_at, t.cancelled_at,
         split_part(sp.full_name, ' ', 1),
         split_part(dp.full_name, ' ', 1),
         d.car_model, d.car_color,
         case when now() >= contact_opens_at(t.departs_at) or t.started_at is not null then d.plate end,
         pos.lat, pos.lng, pos.recorded_at,
         city_name(t.origin, 'ar'), city_name(t.origin, 'en'),
         city_name(t.destination, 'ar'), city_name(t.destination, 'en')
    from trip_shares s
    join trips t on t.id = s.trip_id
    join profiles sp on sp.id = s.created_by
    join profiles dp on dp.id = t.driver_id
    left join driver_details d on d.driver_id = t.driver_id
    left join trip_positions pos on pos.trip_id = t.id
   where s.token = p_token
     and coalesce(t.finished_at, t.cancelled_at, 'infinity'::timestamptz) > now() - interval '2 hours';
$$;

-- ─── 3. Car model and colour while booking ───────────────────────────────────
drop function public.search_trips(public.city, public.city, timestamptz, timestamptz);
create function public.search_trips(p_origin public.city, p_destination public.city, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, departs_at timestamptz, seats_total int, seats_left int, price_ils numeric,
  driver_first_name text, driver_last_initial text, car_model text, driver_verified boolean, women_only boolean,
  origin public.city, destination public.city, origin_km numeric, destination_km numeric,
  car_color text
)
language sql stable security definer set search_path = public as $$
  with near as (
    select t.*, place_km(p_origin, t.origin) as o_km, place_km(p_destination, t.destination) as d_km
      from trips t
     where t.departs_at >= greatest(p_from, now())
       and t.departs_at < p_to
       and t.cancelled_at is null
       and t.driver_id <> auth.uid()          -- don't show me my own trips
       and (not t.women_only or is_verified_woman(auth.uid()))
  )
  select
    t.id,
    t.departs_at,
    t.seats_total,
    t.seats_total - coalesce((
      select sum(b.seats)::int from bookings b
      where b.trip_id = t.id and b.status = 'accepted'
    ), 0) as seats_left,
    t.price_ils,
    split_part(p.display_name, ' ', 1) as driver_first_name,
    case when position(' ' in p.display_name) > 0
         then left(regexp_replace(p.display_name, '^.*\s', ''), 1)
         else '' end as driver_last_initial,
    d.car_model,
    d.verified_at is not null as driver_verified,
    t.women_only,
    t.origin, t.destination, t.o_km, t.d_km,
    d.car_color
  from near t
  join profiles p on p.id = t.driver_id
  left join driver_details d on d.driver_id = t.driver_id
  where t.o_km <= 15 and t.d_km <= 15
  order by (t.o_km = 0 and t.d_km = 0) desc, t.departs_at;
$$;
revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;
