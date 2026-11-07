-- Slice 12 (part 2): Share my trip.
--
-- Anyone on a trip (the driver, or a passenger with a seat) can make a secret link
-- and send it to family. The link opens a small web page (admin site, share.html)
-- that shows the route, the driver and car, and where the car was last seen.
--
-- Position: while a trip is underway (Start trip pressed, not finished), the driver's
-- phone sends where it is about once a minute. Only the latest point is kept, and it
-- is only shown through a link, never to other app users. A link stops working 2 hours
-- after the trip ends or is cancelled.

-- ─── Where the car is ───────────────────────────────────────────────────────
create table public.trip_positions (
  trip_id      uuid primary key references public.trips (id) on delete cascade,
  lat          numeric(9, 6) not null check (lat between -90 and 90),
  lng          numeric(9, 6) not null check (lng between -180 and 180),
  accuracy_m   int check (accuracy_m >= 0),
  recorded_at  timestamptz not null default now()
);
-- No policies: written by report_position(), read by shared_trip().
alter table public.trip_positions enable row level security;

create or replace function public.report_position(p_trip_id uuid, p_lat numeric, p_lng numeric, p_accuracy_m int default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from trips
     where id = p_trip_id and driver_id = auth.uid()
       and started_at is not null and finished_at is null and cancelled_at is null
  ) then
    raise exception 'Only the driver shares the position, while the trip is underway';
  end if;
  insert into trip_positions (trip_id, lat, lng, accuracy_m, recorded_at)
  values (p_trip_id, p_lat, p_lng, p_accuracy_m, now())
  on conflict (trip_id) do update
     set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m, recorded_at = now()
   -- A phone that sends too often only costs battery: keep one point per 20 seconds.
   where trip_positions.recorded_at < now() - interval '20 seconds';
end;
$$;
revoke execute on function public.report_position(uuid, numeric, numeric, int) from public, anon;
grant execute on function public.report_position(uuid, numeric, numeric, int) to authenticated;

-- ─── Share links ────────────────────────────────────────────────────────────
create table public.trip_shares (
  -- 32 random hex characters: long enough that nobody can guess one.
  token       text primary key default replace(gen_random_uuid()::text, '-', ''),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (trip_id, created_by)
);
alter table public.trip_shares enable row level security;
create policy trip_shares_read_own on public.trip_shares for select to authenticated
  using (created_by = auth.uid());

-- My link for this trip (made once, then the same link every time).
create or replace function public.share_trip(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (select 1 from trips where id = p_trip_id and driver_id = auth.uid())
     and not exists (
       select 1 from bookings
        where trip_id = p_trip_id and passenger_id = auth.uid() and status in ('accepted', 'completed')
     ) then
    raise exception 'Only people on this trip can share it';
  end if;
  insert into trip_shares (trip_id, created_by) values (p_trip_id, auth.uid())
  on conflict (trip_id, created_by) do nothing;
  select token into v_token from trip_shares where trip_id = p_trip_id and created_by = auth.uid();
  return v_token;
end;
$$;
revoke execute on function public.share_trip(uuid) from public, anon;
grant execute on function public.share_trip(uuid) to authenticated;

-- What the link shows. Open to anyone who has the token (the web page isn't signed in).
create or replace function public.shared_trip(p_token text)
returns table (
  origin            public.city,
  destination       public.city,
  departs_at        timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  cancelled_at      timestamptz,
  sharer_name       text,
  driver_name       text,
  car_model         text,
  car_color         text,
  plate             text,
  lat               numeric,
  lng               numeric,
  position_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.origin, t.destination, t.departs_at, t.started_at, t.finished_at, t.cancelled_at,
         split_part(sp.full_name, ' ', 1),
         split_part(dp.full_name, ' ', 1),
         d.car_model, d.car_color, d.plate,
         pos.lat, pos.lng, pos.recorded_at
    from trip_shares s
    join trips t on t.id = s.trip_id
    join profiles sp on sp.id = s.created_by
    join profiles dp on dp.id = t.driver_id
    left join driver_details d on d.driver_id = t.driver_id
    left join trip_positions pos on pos.trip_id = t.id
   where s.token = p_token
     and coalesce(t.finished_at, t.cancelled_at, 'infinity'::timestamptz) > now() - interval '2 hours';
$$;
revoke execute on function public.shared_trip(text) from public;
grant execute on function public.shared_trip(text) to anon, authenticated;
