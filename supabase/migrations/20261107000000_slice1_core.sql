-- Slice 1: the tables behind "sign up -> post trip -> request seat -> driver accepts".
-- Read top to bottom: types, tables, rules (triggers), then who can see what (RLS).

-- ─── Types ──────────────────────────────────────────────────────────────────
-- An enum is a fixed list of allowed values. Postgres rejects anything else,
-- so a typo like 'acepted' can never reach the database.
create type public.booking_status as enum (
  'requested', 'accepted', 'declined', 'expired', 'cancelled', 'completed', 'no_show'
);

create type public.city as enum ('ramallah', 'nablus');

-- ─── Tables ─────────────────────────────────────────────────────────────────
-- One row per person. auth.users (managed by Supabase) holds the phone number;
-- profiles holds what the app needs. Same id in both tables.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 80),
  gender      text check (gender in ('m', 'f')),        -- drives ar_m / ar_f strings
  language    text not null default 'ar' check (language in ('ar', 'en')),
  created_at  timestamptz not null default now()
);

create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  origin       public.city not null,
  destination  public.city not null,
  departs_at   timestamptz not null,
  seats_total  int not null check (seats_total between 1 and 6),
  price_ils    numeric(6, 2) not null check (price_ils >= 0),
  created_at   timestamptz not null default now(),
  check (origin <> destination)
);
create index trips_search_idx on public.trips (origin, destination, departs_at);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips (id) on delete cascade,
  passenger_id  uuid not null references public.profiles (id) on delete cascade,
  seats         int not null default 1 check (seats between 1 and 4),
  status        public.booking_status not null default 'requested',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (trip_id, passenger_id)                          -- one booking per person per trip
);
create index bookings_passenger_idx on public.bookings (passenger_id);

-- The funnel log. Every status change adds a row here and nothing ever edits or
-- deletes one, so later you can ask questions like
-- "how long do drivers take to accept?" with plain SQL.
create table public.booking_events (
  id           bigint generated always as identity primary key,
  booking_id   uuid not null references public.bookings (id) on delete cascade,
  from_status  public.booking_status,                     -- null for the first event
  to_status    public.booking_status not null,
  actor_id     uuid,                                      -- who did it (null = system)
  created_at   timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, created_at);

-- ─── Rules ──────────────────────────────────────────────────────────────────
-- Guard every booking change: is the move allowed, is this person allowed to
-- make it, and (on accept) are there enough seats left?
-- Rules live in the database, not only in the app, so no client can skip them.
create or replace function public.guard_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver  uuid;
  v_total   int;
  v_taken   int;
  v_actor   uuid := auth.uid();       -- null when the server (service role) acts
begin
  select driver_id, seats_total into v_driver, v_total
  from trips where id = new.trip_id
  for update;                        -- lock the trip so two accepts can't race

  if tg_op = 'INSERT' then
    if new.status <> 'requested' then
      raise exception 'A booking must start as requested';
    end if;
    if new.passenger_id = v_driver then
      raise exception 'Drivers cannot book their own trip';
    end if;
    return new;
  end if;

  -- UPDATE: only status may change, and only along allowed paths.
  if new.trip_id <> old.trip_id or new.passenger_id <> old.passenger_id or new.seats <> old.seats then
    raise exception 'Only the status of a booking can change';
  end if;
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'requested' and new.status in ('accepted', 'declined', 'expired', 'cancelled')) or
    (old.status = 'accepted'  and new.status in ('completed', 'cancelled', 'no_show'))
  ) then
    raise exception 'Cannot move a booking from % to %', old.status, new.status;
  end if;

  -- Who may do what. A null actor is the server, which may do anything allowed above.
  if v_actor is not null then
    if new.status in ('accepted', 'declined') and v_actor <> v_driver then
      raise exception 'Only the driver can accept or decline';
    end if;
    if new.status = 'cancelled' and v_actor not in (v_driver, old.passenger_id) then
      raise exception 'Only the driver or passenger can cancel';
    end if;
    if new.status in ('expired', 'completed', 'no_show') then
      raise exception 'Only the system can set %', new.status;
    end if;
  end if;

  if new.status = 'accepted' then
    select coalesce(sum(seats), 0) into v_taken
    from bookings
    where trip_id = new.trip_id and status = 'accepted' and id <> new.id;
    if v_taken + new.seats > v_total then
      raise exception 'Not enough seats left';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_guard
before insert or update on public.bookings
for each row execute function public.guard_booking();

-- After a booking is created or its status changes, write the funnel event.
create or replace function public.log_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into booking_events (booking_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into booking_events (booking_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return null;
end;
$$;

create trigger bookings_log
after insert or update on public.bookings
for each row execute function public.log_booking_event();

-- ─── Who can see and change what (Row Level Security) ───────────────────────
-- With RLS on, every query is filtered by these policies. No policy = no access.
alter table public.profiles       enable row level security;
alter table public.trips          enable row level security;
alter table public.bookings       enable row level security;
alter table public.booking_events enable row level security;

-- Profiles: signed-in users can read names (to see who's driving); edit only your own.
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- Trips: anyone signed in can search; only the driver can create or edit theirs.
create policy trips_read   on public.trips for select to authenticated using (true);
create policy trips_insert on public.trips for insert to authenticated with check (driver_id = auth.uid());
create policy trips_update on public.trips for update to authenticated using (driver_id = auth.uid());

-- Bookings: visible to the passenger and to the trip's driver, nobody else.
create policy bookings_read on public.bookings for select to authenticated using (
  passenger_id = auth.uid()
  or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = auth.uid())
);
create policy bookings_insert on public.bookings for insert to authenticated
  with check (passenger_id = auth.uid());
-- Both sides may update; guard_booking() decides which status changes each may make.
create policy bookings_update on public.bookings for update to authenticated using (
  passenger_id = auth.uid()
  or exists (select 1 from public.trips t where t.id = trip_id and t.driver_id = auth.uid())
);

-- Events: readable by whoever can read the booking. Only the trigger writes them.
create policy booking_events_read on public.booking_events for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id)
);

-- ─── Helper ─────────────────────────────────────────────────────────────────
-- Seats left on a trip, for the search screen. A passenger can't see other
-- passengers' bookings (RLS above), so this function runs as its owner
-- (security definer) and returns only a number, never who booked.
create or replace function public.seats_left(p_trip_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select t.seats_total - coalesce((
    select sum(b.seats)::int from bookings b
    where b.trip_id = t.id and b.status = 'accepted'
  ), 0)
  from trips t
  where t.id = p_trip_id;
$$;

revoke execute on function public.seats_left(uuid) from public, anon;
grant execute on function public.seats_left(uuid) to authenticated;
