-- Seat holds, part 2 of 2 (paste part 1, 20261112000000_seat_line_status.sql, first).
--
-- Waleed, Nov 11: asking for a seat should hold it, and everyone should see it live.
--   * Asking holds a seat ('requested'). The driver still says yes or no to each rider,
--     but never sees more asks than free seats, so there's no picking from a crowd.
--   * When every seat is held, new riders join a short line ('queued', setting
--     seat_line_size, 2). The driver doesn't see the line.
--   * When a held seat opens (declined, expired, withdrawn, cancelled), the first
--     rider in line moves up to 'requested' and the driver's answer clock starts.
--   * Line and holds end with the trip: cancelled trip = line cancelled, departure =
--     line expired.
--   * trip_seat_counts: confirmed / waiting / in line per trip, readable by everyone
--     signed in and sent live (Realtime), because riders can't read other bookings.

insert into public.settings (key, value) values ('seat_line_size', 2)
on conflict (key) do nothing;

create or replace function public.seat_line_size()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from settings where key = 'seat_line_size'), 2)::int;
$$;
revoke execute on function public.seat_line_size() from public, anon;
grant execute on function public.seat_line_size() to authenticated;

-- ─── The booking guard: holds, the line, and moving up ─────────────────────
create or replace function public.guard_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver     uuid;
  v_total      int;
  v_departs    timestamptz;
  v_cancelled  timestamptz;
  v_started    timestamptz;
  v_finished   timestamptz;
  v_taken      int;
  v_held       int;
  v_line       int;
  v_actor      uuid := auth.uid();       -- null when the server acts (cron, admin)
begin
  select driver_id, seats_total, departs_at, cancelled_at, started_at, finished_at
    into v_driver, v_total, v_departs, v_cancelled, v_started, v_finished
  from trips where id = new.trip_id
  for update;                        -- lock the trip so two accepts can't race

  if tg_op = 'INSERT' then
    if new.status <> 'requested' then
      raise exception 'A booking must start as requested';
    end if;
    if new.passenger_id = v_driver then
      raise exception 'Drivers cannot book their own trip';
    end if;
    if v_cancelled is not null then
      raise exception 'This trip was cancelled';
    end if;
    if v_departs <= now() or v_started is not null then
      raise exception 'This trip has already left';
    end if;
    -- Asking holds a seat. When every seat is held (asked for or confirmed), the rider
    -- joins a short line instead, and when the line is full too the trip is full.
    select coalesce(sum(seats) filter (where status in ('requested', 'accepted')), 0)::int,
           count(*) filter (where status = 'queued')::int
      into v_held, v_line
      from bookings where trip_id = new.trip_id;
    if v_held + new.seats <= v_total then
      new.respond_by := respond_by(now(), v_departs);
    elsif v_line < seat_line_size() then
      new.status     := 'queued';
      new.respond_by := null;    -- the driver's clock starts when they move up
    else
      raise exception 'This trip is full';
    end if;
    new.accepted_at     := null;
    new.cancelled_late  := null;
    new.here_at         := null;
    new.boarded_at      := null;
    new.rider_answer    := null;
    new.rider_answer_at := null;
    return new;
  end if;

  -- UPDATE: only status may change, and only along allowed paths.
  if new.trip_id <> old.trip_id or new.passenger_id <> old.passenger_id or new.seats <> old.seats then
    raise exception 'Only the status of a booking can change';
  end if;
  -- The timing columns belong to the server. Phones can't edit them.
  if v_actor is not null then
    new.respond_by     := old.respond_by;
    new.accepted_at    := old.accepted_at;
    new.cancelled_late := old.cancelled_late;
    if not in_trip_day() then
      new.here_at         := old.here_at;
      new.boarded_at      := old.boarded_at;
      new.rider_answer    := old.rider_answer;
      new.rider_answer_at := old.rider_answer_at;
    end if;
  end if;
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'queued'    and new.status in ('requested', 'cancelled', 'expired')) or
    (old.status = 'requested' and new.status in ('accepted', 'declined', 'expired', 'cancelled')) or
    (old.status = 'accepted'  and new.status in ('completed', 'cancelled', 'no_show', 'not_confirmed', 'disputed'))
  ) then
    raise exception 'Cannot move a booking from % to %', old.status, new.status;
  end if;

  -- Who may do what. A null actor is the server, which may do anything allowed above.
  if v_actor is not null then
    if new.status = 'requested' and coalesce(current_setting('rafiq.line', true), '') <> 'on' then
      raise exception 'Only the system can move the line';
    end if;
    if new.status in ('accepted', 'declined') and v_actor <> v_driver then
      raise exception 'Only the driver can accept or decline';
    end if;
    if new.status = 'cancelled' and v_actor not in (v_driver, old.passenger_id) then
      raise exception 'Only the driver or passenger can cancel';
    end if;
    if new.status in ('expired', 'completed', 'no_show', 'not_confirmed', 'disputed') and not in_trip_day() then
      raise exception 'Only the system can set %', new.status;
    end if;
  end if;

  -- Once the car has left, a seat can't be accepted or cancelled any more.
  if new.status in ('accepted', 'cancelled') and v_started is not null then
    raise exception 'This trip has already started';
  end if;
  -- A seat completes only with its trip.
  if new.status = 'completed' and v_finished is null then
    raise exception 'The trip has not finished yet';
  end if;

  -- Moving up from the line: the driver's answer window starts now.
  if new.status = 'requested' then
    select coalesce(sum(seats), 0)::int into v_held
      from bookings where trip_id = new.trip_id and status in ('requested', 'accepted') and id <> new.id;
    if v_held + new.seats > v_total then
      raise exception 'No seat is free yet';
    end if;
    new.respond_by := respond_by(now(), v_departs);
  end if;

  if new.status = 'accepted' then
    if old.respond_by is not null and now() > old.respond_by then
      raise exception 'This request has expired';
    end if;
    select coalesce(sum(seats), 0) into v_taken
    from bookings
    where trip_id = new.trip_id and status = 'accepted' and id <> new.id;
    if v_taken + new.seats > v_total then
      raise exception 'Not enough seats left';
    end if;
    new.accepted_at := now();
  end if;

  -- Withdrawing a request is always free. Cancelling an accepted seat is late
  -- after the 12h line, unless the driver accepted less than 15 minutes ago.
  if new.status = 'cancelled' and old.status = 'accepted' then
    new.cancelled_late := not (
      now() <= v_departs - interval '12 hours'
      or (old.accepted_at is not null and now() <= old.accepted_at + interval '15 minutes')
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ─── Moving the line ────────────────────────────────────────────────────────
-- While seats are free and someone waits, the first in line (oldest ask) moves up.
-- Not on trip day: the car is about to leave, so nobody new can be accepted.
create or replace function public.move_line(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_held  int;
  v_next  record;
begin
  if in_trip_day() then
    return;
  end if;
  select seats_total into v_total
    from trips
   where id = p_trip_id and cancelled_at is null and started_at is null and departs_at > now()
   for update;
  if not found then
    return;
  end if;
  loop
    select coalesce(sum(seats), 0)::int into v_held
      from bookings where trip_id = p_trip_id and status in ('requested', 'accepted');
    select id, seats into v_next
      from bookings where trip_id = p_trip_id and status = 'queued'
     order by created_at, id
     limit 1;
    exit when v_next.id is null or v_held + v_next.seats > v_total;
    perform set_config('rafiq.line', 'on', true);
    update bookings set status = 'requested' where id = v_next.id;
    perform set_config('rafiq.line', 'off', true);
  end loop;
end;
$$;
revoke execute on function public.move_line(uuid) from public, anon, authenticated;

-- A held seat opened: let the line move.
create or replace function public.booking_frees_seat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('requested', 'accepted') and new.status not in ('requested', 'accepted') then
    perform move_line(new.trip_id);
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_free_seat on public.bookings;
create trigger bookings_free_seat
after update of status on public.bookings
for each row execute function public.booking_frees_seat();

-- The trip changed: more seats move the line; a cancelled trip cancels the line;
-- a trip that left expires it.
create or replace function public.trip_moves_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_day text := coalesce(current_setting('rafiq.trip_day', true), '');
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    update bookings set status = 'cancelled' where trip_id = new.id and status = 'queued';
  elsif new.started_at is not null and old.started_at is null then
    perform set_config('rafiq.trip_day', 'on', true);
    update bookings set status = 'expired' where trip_id = new.id and status = 'queued';
    perform set_config('rafiq.trip_day', v_trip_day, true);
  elsif new.seats_total > old.seats_total then
    perform move_line(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trips_move_line on public.trips;
create trigger trips_move_line
after update of cancelled_at, started_at, seats_total on public.trips
for each row execute function public.trip_moves_line();

-- The every-minute job: late requests expire as before, and a line whose trip has
-- already left (nobody tapped Start) expires too.
create or replace function public.expire_requests()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update bookings b set status = 'expired'
    where (b.status = 'requested' and b.respond_by < now())
       or (b.status = 'queued' and exists (
             select 1 from trips t where t.id = b.trip_id and t.departs_at <= now()))
    returning 1
  )
  select count(*)::int from done;
$$;
revoke execute on function public.expire_requests() from public, anon, authenticated;

-- ─── Live seat counts ───────────────────────────────────────────────────────
create table if not exists public.trip_seat_counts (
  trip_id    uuid primary key references public.trips (id) on delete cascade,
  confirmed  int not null default 0,   -- seats the driver accepted
  waiting    int not null default 0,   -- seats held by a rider waiting for the driver
  in_line    int not null default 0,   -- riders waiting in line (all seats held)
  line_room  int not null default 0,   -- places left in the line
  updated_at timestamptz not null default now()
);
alter table public.trip_seat_counts enable row level security;
drop policy if exists trip_seat_counts_read on public.trip_seat_counts;
create policy trip_seat_counts_read on public.trip_seat_counts for select to authenticated using (true);
grant select on public.trip_seat_counts to authenticated;

create or replace function public.refresh_seat_counts(p_trip_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into trip_seat_counts (trip_id, confirmed, waiting, in_line, line_room, updated_at)
  select p_trip_id,
         coalesce(sum(b.seats) filter (where b.status = 'accepted'), 0)::int,
         coalesce(sum(b.seats) filter (where b.status = 'requested'), 0)::int,
         count(b.id) filter (where b.status = 'queued')::int,
         greatest(seat_line_size() - count(b.id) filter (where b.status = 'queued'), 0)::int,
         now()
    from (select p_trip_id as id) t
    left join bookings b on b.trip_id = t.id
  on conflict (trip_id) do update
     set confirmed = excluded.confirmed, waiting = excluded.waiting, in_line = excluded.in_line,
         line_room = excluded.line_room, updated_at = excluded.updated_at;
$$;
revoke execute on function public.refresh_seat_counts(uuid) from public, anon, authenticated;

create or replace function public.booking_counts_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_seat_counts(new.trip_id);
  return null;
end;
$$;

drop trigger if exists bookings_seat_counts on public.bookings;
create trigger bookings_seat_counts
after insert or update of status on public.bookings
for each row execute function public.booking_counts_changed();

-- Every trip has a row from the start, so phones can always read and follow it.
create or replace function public.trip_counts_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform refresh_seat_counts(new.id);
  return null;
end;
$$;

drop trigger if exists trips_seat_counts on public.trips;
create trigger trips_seat_counts
after insert on public.trips
for each row execute function public.trip_counts_row();

select public.refresh_seat_counts(id) from public.trips;

do $$ begin
  alter publication supabase_realtime add table public.trip_seat_counts;
exception when duplicate_object then null;
end $$;

-- ─── "Seats free" now means not held ────────────────────────────────────────
create or replace function public.seats_left(p_trip_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select t.seats_total - coalesce((
    select sum(b.seats)::int from bookings b
    where b.trip_id = t.id and b.status in ('requested', 'accepted')
  ), 0)
  from trips t
  where t.id = p_trip_id;
$$;

create or replace function public.search_trips(p_origin public.city, p_destination public.city, p_from timestamptz, p_to timestamptz)
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
      where b.trip_id = t.id and b.status in ('requested', 'accepted')
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

-- ─── Pushes: moving up, and a line that never moved ─────────────────────────
create or replace function public.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  recipient  uuid;
  other      uuid;   -- the other person in the booking
  other_name text;
  other_f    boolean;
  route_ar   text;
  route_en   text;
  t_ar text; b_ar text; t_en text; b_en text;
  link       text;
  kind       text;
begin
  select bk.passenger_id, t.id as trip_id, t.driver_id, t.origin, t.destination, t.cancelled_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;

  -- Settling a trip that never started: riders already heard from the driver or answered
  -- themselves, so a late "trip cancelled, find another one" would only confuse.
  if coalesce(current_setting('rafiq.settling', true), '') = 'on' then
    return null;
  end if;

  if new.to_status = 'requested' then
    kind := 'requested';
    -- A seat opened and the first rider in line moved up: tell them their request
    -- went to the driver. The driver hears about it below like any new request.
    if new.from_status = 'queued' then
      select city_name(t.origin, 'ar') || ' ← ' || city_name(t.destination, 'ar'),
             city_name(t.origin, 'en') || ' → ' || city_name(t.destination, 'en')
        into route_ar, route_en
        from trips t where t.id = b.trip_id;
      perform send_push(b.passenger_id, 'line_moved',
        'فُتح مقعد لك', 'وصل دورك وأُرسل طلبك إلى السائق: ' || route_ar,
        'A seat opened for you', 'You were next in line. Your request went to the driver: ' || route_en,
        '/trips/' || b.trip_id);
    end if;
  elsif new.to_status in ('accepted', 'declined', 'expired') then
    kind := new.to_status::text;
  elsif new.to_status = 'cancelled' and new.actor_id = b.passenger_id then
    kind := 'passenger_cancelled';
  elsif new.to_status = 'cancelled' then
    kind := 'trip_cancelled';
  else
    return null;
  end if;

  if kind in ('requested', 'passenger_cancelled') then
    recipient := b.driver_id;    other := b.passenger_id;  link := '/trips/requests/' || b.trip_id;
  else
    recipient := b.passenger_id; other := b.driver_id;     link := '/trips/' || b.trip_id;
  end if;
  -- A passenger withdrawing a request the driver never saw is not worth a ping.
  if kind = 'passenger_cancelled' and new.from_status in ('requested', 'queued') then
    return null;
  end if;

  select split_part(full_name, ' ', 1), gender = 'f' into other_name, other_f from profiles where id = other;
  other_f := coalesce(other_f, false);
  route_ar := city_name(b.origin, 'ar') || ' ← ' || city_name(b.destination, 'ar');
  route_en := city_name(b.origin, 'en') || ' → ' || city_name(b.destination, 'en');

  if kind = 'requested' then
    t_ar := 'طلب مقعد جديد';
    b_ar := other_name || case when other_f then ' تريد ' else ' يريد ' end || 'مقعداً: ' || route_ar;
    t_en := 'New seat request';
    b_en := other_name || ' wants a seat: ' || route_en;
  elsif kind = 'accepted' then
    t_ar := 'تم تأكيد مقعدك';
    b_ar := other_name || case when other_f then ' قبلت' else ' قبل' end || ' طلبك: ' || route_ar;
    t_en := 'Your seat is confirmed';
    b_en := other_name || ' accepted you: ' || route_en;
  elsif kind = 'declined' then
    t_ar := 'لم يتم قبول طلبك';
    b_ar := other_name || case when other_f then ' لا تستطيع' else ' لا يستطيع' end
            || ' أخذك هذه المرة. جرّب رحلة أخرى.';
    t_en := 'Request not accepted';
    b_en := other_name || ' can''t take you this time. Try another trip.';
  elsif kind = 'expired' and new.from_status = 'queued' then
    t_ar := 'لم يُفتح مقعد';
    b_ar := 'انطلقت الرحلة قبل أن يصل دورك. جرّب رحلة أخرى: ' || route_ar;
    t_en := 'No seat opened';
    b_en := 'The trip left before your turn came. Try another trip: ' || route_en;
  elsif kind = 'expired' then
    t_ar := 'انتهت مهلة طلبك';
    b_ar := other_name || case when other_f then ' لم تردّ' else ' لم يردّ' end
            || ' في الوقت. جرّب رحلة أخرى: ' || route_ar;
    t_en := 'Your request expired';
    b_en := other_name || ' didn''t answer in time. Try another trip: ' || route_en;
  elsif kind = 'trip_cancelled' then
    t_ar := 'أُلغيت الرحلة';
    b_ar := other_name || case when other_f then ' ألغت' else ' ألغى' end
            || ' الرحلة: ' || route_ar || '. ابحث عن رحلة أخرى.';
    t_en := 'Trip cancelled';
    b_en := other_name || ' cancelled the trip: ' || route_en || '. Find another one.';
  else -- passenger_cancelled (an accepted seat)
    t_ar := 'أُلغي حجز';
    b_ar := other_name || case when other_f then ' ألغت مقعدها: ' else ' ألغى مقعده: ' end || route_ar;
    t_en := 'A seat was cancelled';
    b_en := other_name || ' cancelled their seat: ' || route_en;
  end if;

  perform send_push(recipient, kind, t_ar, b_ar, t_en, b_en, link);
  return null;
end;
$$;
