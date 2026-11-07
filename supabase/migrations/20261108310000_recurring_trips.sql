-- Slice 14a: recurring trips ("every Sun to Thu at 7:00").
--
-- A driver saves a weekly pattern once (a trip_series row). The server turns it into
-- ordinary trips rows for the next 7 days, and tops that up every hour. So booking,
-- cancelling and the trip day all keep working per day, exactly as for a one-off trip:
-- a passenger books "Sunday 7:00", not "every Sunday".
--
-- Days use Postgres numbering (extract(dow)): 0 = Sunday ... 6 = Saturday.
-- Times are wall-clock times in Palestine (Asia/Hebron), so 7:00 stays 7:00 when the
-- clocks change for summer time.

create table public.trip_series (
  id           uuid primary key default gen_random_uuid(),
  driver_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  origin       public.city not null,
  destination  public.city not null,
  weekdays     smallint[] not null
               check (cardinality(weekdays) between 1 and 7 and weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  depart_time  time not null,
  seats_total  int not null check (seats_total between 1 and 6),
  price_ils    numeric(6, 2) not null check (price_ils >= 0),
  time_zone    text not null default 'Asia/Hebron',
  created_at   timestamptz not null default now(),
  stopped_at   timestamptz,               -- set when the driver stops repeating
  check (origin <> destination)
);
create index trip_series_active_idx on public.trip_series (driver_id) where stopped_at is null;

alter table public.trip_series enable row level security;
-- Anyone signed in may read a pattern (trip details shows "repeats every Sun, Mon").
create policy trip_series_read   on public.trip_series for select to authenticated using (true);
create policy trip_series_insert on public.trip_series for insert to authenticated with check (driver_id = auth.uid());
-- Changing a pattern = stop it and save a new one (see stop_trip_series), so no update policy.

alter table public.trips add column series_id uuid references public.trip_series (id) on delete set null;
-- One trip per series per departure: running the generator twice adds nothing.
create unique index trips_series_departure_uniq on public.trips (series_id, departs_at) where series_id is not null;

-- A driver can't attach their one-off trip to someone else's pattern.
create or replace function public.guard_trip_series_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.series_id is not null and auth.uid() is not null
     and not exists (select 1 from trip_series where id = new.series_id and driver_id = auth.uid()) then
    raise exception 'Not your repeating trip';
  end if;
  return new;
end;
$$;
create trigger trips_series_link
before insert or update of series_id on public.trips
for each row execute function public.guard_trip_series_link();
revoke execute on function public.guard_trip_series_link() from public, anon, authenticated;

-- Create the missing trips of one pattern (or all active ones) for the next p_days days.
-- Skips departures less than an hour away, and drivers whose check is no longer approved.
-- Returns how many trips it added.
create or replace function public.generate_series_trips(p_series_id uuid default null, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  d        date;
  v_at     timestamptz;
  v_added  int := 0;
  v_count  int;
begin
  for s in
    select ts.* from trip_series ts
      join driver_details dd on dd.driver_id = ts.driver_id and dd.verified_at is not null
     where ts.stopped_at is null and (p_series_id is null or ts.id = p_series_id)
  loop
    for d in
      select g::date from generate_series(
        (now() at time zone s.time_zone)::date,
        (now() at time zone s.time_zone)::date + (p_days - 1),
        interval '1 day') g
    loop
      continue when extract(dow from d)::smallint <> all (s.weekdays);
      v_at := (d + s.depart_time) at time zone s.time_zone;
      continue when v_at < now() + interval '1 hour';
      insert into trips (driver_id, origin, destination, departs_at, seats_total, price_ils, series_id)
      values (s.driver_id, s.origin, s.destination, v_at, s.seats_total, s.price_ils, s.id)
      on conflict (series_id, departs_at) where series_id is not null do nothing;
      get diagnostics v_count = row_count;
      v_added := v_added + v_count;
    end loop;
  end loop;
  return v_added;
end;
$$;
revoke execute on function public.generate_series_trips(uuid, int) from public, anon, authenticated;

-- Saving a pattern posts its first week straight away.
create or replace function public.trip_series_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform generate_series_trips(new.id);
  return null;
end;
$$;
create trigger trip_series_first_week
after insert on public.trip_series
for each row execute function public.trip_series_after_insert();
revoke execute on function public.trip_series_after_insert() from public, anon, authenticated;

-- Stop repeating. Upcoming trips nobody has asked for are taken down; trips with a
-- request or a booked seat stay, so nobody loses a seat (the driver can still cancel
-- one by one, with the usual rules). Returns how many trips were taken down.
create or replace function public.stop_trip_series(p_series_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed int;
begin
  update trip_series set stopped_at = now()
   where id = p_series_id and driver_id = auth.uid() and stopped_at is null;
  if not found then
    raise exception 'Not your repeating trip, or already stopped';
  end if;
  update trips t set cancelled_at = now()
   where t.series_id = p_series_id and t.cancelled_at is null and t.departs_at > now()
     and not exists (select 1 from bookings b where b.trip_id = t.id and b.status in ('requested', 'accepted'));
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;
revoke execute on function public.stop_trip_series(uuid) from public, anon;
grant execute on function public.stop_trip_series(uuid) to authenticated;

-- Keep a week of trips posted: every hour (pg_cron exists on Supabase, not in CI).
do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('generate-series-trips', '7 * * * *', 'select public.generate_series_trips()');
  end if;
end $$;
