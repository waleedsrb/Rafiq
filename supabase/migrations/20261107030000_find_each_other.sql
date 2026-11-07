-- Slice 2: "Find each other".
-- Drivers register their car. Once a booking is accepted, driver and passenger
-- can see each other's phone number (and the passenger sees the car). Before
-- that, both stay hidden: nobody can collect phone numbers by browsing trips.

-- ─── Car details (one per driver for now) ───────────────────────────────────
create table public.driver_details (
  driver_id    uuid primary key references public.profiles (id) on delete cascade,
  car_model    text not null check (length(trim(car_model)) between 2 and 60),   -- "Kia Picanto"
  car_color    text not null check (length(trim(car_color)) between 2 and 30),
  plate        text not null check (plate ~ '^[0-9A-Z-]{4,12}$'),                -- normalized by the app
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.driver_details enable row level security;

-- Only you can see or edit your own car row directly.
-- Other people see it only through trip_contact() below, after acceptance.
create policy driver_details_own_read   on public.driver_details for select to authenticated using (driver_id = auth.uid());
create policy driver_details_own_insert on public.driver_details for insert to authenticated with check (driver_id = auth.uid());
create policy driver_details_own_update on public.driver_details for update to authenticated using (driver_id = auth.uid());

-- ─── No car, no trip ────────────────────────────────────────────────────────
-- A passenger must always be able to find the car, so posting a trip requires one.
create or replace function public.require_car()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from driver_details where driver_id = new.driver_id) then
    raise exception 'Add your car before posting a trip';
  end if;
  return new;
end;
$$;

create trigger trips_require_car
before insert on public.trips
for each row execute function public.require_car();

revoke execute on function public.require_car() from public, anon, authenticated;

-- ─── Contact reveal ─────────────────────────────────────────────────────────
-- Returns the OTHER person on an accepted booking: their first name and phone,
-- plus the car when you are the passenger. Returns no row if the booking is not
-- accepted or you are not part of it.
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
    u.phone,
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
  join auth.users u on u.id = p.id
  left join driver_details d on d.driver_id = x.driver_id;
$$;

revoke execute on function public.trip_contact(uuid) from public, anon;
grant execute on function public.trip_contact(uuid) to authenticated;
