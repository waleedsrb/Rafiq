-- Slice 8: trip day. A trip can now start, finish, and be rated.
--
-- Before this, a booked seat stayed "accepted" forever. Now:
--
--   trip:     scheduled ──Start trip──▶ underway ──Arrived──▶ finished
--             (started_at null)        (started_at set)      (finished_at set)
--
--   booking:  accepted ──trip finishes──▶ completed
--                      └─driver marks, 10+ min after departure──▶ no_show
--
-- At pickup the passenger can tap "I'm here" (here_at, tells the driver) and the
-- driver ticks each passenger who got in (boarded_at). The driver can only start
-- once every passenger is either boarded or marked no-show, so nobody becomes a
-- no-show by accident. A cron job finishes trips nobody finished by hand.
--
-- Money: completed and no_show both keep the charge (settle_payment is unchanged).
-- Ratings: after a completed trip each side rates the other once, 1-5 stars + tags.
--
-- The app mirrors the numbers below in src/lib/trip-day.ts. Keep them in sync:
--   start from 30 min before departure, no-show from 10 min after departure,
--   auto-finish 4 hours after start (or after departure if never started),
--   ratings open for 7 days after the trip finishes.

-- ─── New columns ────────────────────────────────────────────────────────────
alter table public.trips
  add column started_at  timestamptz,
  add column finished_at timestamptz;

alter table public.bookings
  add column here_at    timestamptz,   -- passenger tapped "I'm here"
  add column boarded_at timestamptz;   -- driver ticked "got in"

-- The trip-day functions below set this flag while they work. Phones editing a
-- row directly never have it, so they can't fake a start, a finish or a no-show.
create or replace function public.in_trip_day()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_setting('rafiq.trip_day', true), '') = 'on';
$$;

-- ─── Booking rules, now with trip day ───────────────────────────────────────
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
    new.respond_by     := respond_by(now(), v_departs);
    new.accepted_at    := null;
    new.cancelled_late := null;
    new.here_at        := null;
    new.boarded_at     := null;
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
      new.here_at    := old.here_at;
      new.boarded_at := old.boarded_at;
    end if;
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
    if new.status in ('expired', 'completed', 'no_show') and not in_trip_day() then
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

-- ─── Trip rules ─────────────────────────────────────────────────────────────
-- Drivers can't un-cancel a trip, and can't set start/finish by editing the row.
create or replace function public.guard_trip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'A cancelled trip stays cancelled';
  end if;
  if auth.uid() is not null and not in_trip_day() and (
       new.started_at is distinct from old.started_at or new.finished_at is distinct from old.finished_at) then
    raise exception 'Use Start trip and Arrived to change a trip''s state';
  end if;
  if old.started_at is not null and (new.departs_at <> old.departs_at or new.origin <> old.origin
       or new.destination <> old.destination) then
    raise exception 'A trip that has started can''t be changed';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_trip() from public, anon, authenticated;

-- A trip can't be cancelled once it is on the road.
create or replace function public.cancel_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update trips set cancelled_at = now()
  where id = p_trip_id and driver_id = auth.uid() and cancelled_at is null and started_at is null;
  if not found then
    raise exception 'Only the driver can cancel this trip, before it starts';
  end if;
  update bookings set status = 'cancelled'
  where trip_id = p_trip_id and status in ('requested', 'accepted');
end;
$$;

-- ─── Pushes for trip day ────────────────────────────────────────────────────
-- Every trip-day push goes through this one helper. Slice 10 (notifications inbox)
-- redefines it to call send_push(), so these also land in the inbox.
create or replace function public.trip_day_push(p_user uuid, p_kind text, p_title text, p_body text, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  messages jsonb;
begin
  -- Once the inbox exists (slice 10), hand over to it. Checked at run time, so it
  -- doesn't matter which SQL file was pasted first.
  if to_regprocedure('public.send_push(uuid,text,text,text,text)') is not null then
    execute 'select public.send_push($1, $2, $3, $4, $5)' using p_user, p_kind, p_title, p_body, p_url;
    return;
  end if;
  select jsonb_agg(jsonb_build_object(
           'to', token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'data', jsonb_build_object('url', p_url, 'kind', p_kind)))
    into messages
    from push_tokens where user_id = p_user;
  if messages is null then
    return;
  end if;
  -- A push problem must never undo a trip change, so swallow errors here.
  begin
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := messages,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end;
$$;
revoke execute on function public.trip_day_push(uuid, text, text, text, text) from public, anon, authenticated;

-- completed -> ask the passenger to rate the driver. no_show -> tell the passenger.
-- (The driver gets one "rate your passengers" push per trip, from finish_trip.)
create or replace function public.notify_trip_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  lang       text;
  drv_name   text;
  drv_f      boolean;
begin
  if new.to_status not in ('completed', 'no_show') then
    return null;
  end if;
  select bk.passenger_id, t.id as trip_id, t.driver_id into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;
  select language into lang from profiles where id = b.passenger_id;
  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into drv_name, drv_f
    from profiles where id = b.driver_id;

  if new.to_status = 'completed' then
    perform trip_day_push(b.passenger_id, 'rate_driver',
      case when lang = 'ar' then 'وصلت بالسلامة' else 'You''ve arrived' end,
      case when lang = 'ar' then 'كيف كانت رحلتك مع ' || drv_name || '؟ قيّم الرحلة.'
           else 'How was your trip with ' || drv_name || '? Rate it.' end,
      '/trips/rate/' || new.booking_id);
  else
    perform trip_day_push(b.passenger_id, 'no_show',
      case when lang = 'ar' then 'فاتتك الرحلة' else 'You missed the trip' end,
      case when lang = 'ar'
           then drv_name || case when drv_f then ' انطلقت' else ' انطلق' end
                || ' بدونك. لا يُسترد ثمن المقعد.'
           else drv_name || ' left without you. The seat is not refunded.' end,
      '/trips/' || b.trip_id);
  end if;
  return null;
end;
$$;
create trigger booking_events_notify_trip_day
after insert on public.booking_events
for each row execute function public.notify_trip_day();
revoke execute on function public.notify_trip_day() from public, anon, authenticated;

-- ─── At the pickup ──────────────────────────────────────────────────────────
-- Passenger: "I'm here". Tells the driver; open from 30 min before departure.
create or replace function public.im_here(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b        record;
  lang     text;
  p_name   text;
  p_f      boolean;
begin
  select bk.id, bk.status, bk.passenger_id, bk.here_at, t.id as trip_id, t.driver_id, t.departs_at, t.started_at, t.cancelled_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id and bk.passenger_id = auth.uid();
  if not found or b.status <> 'accepted' or b.cancelled_at is not null then
    raise exception 'No confirmed seat to check in for';
  end if;
  if b.started_at is not null then
    raise exception 'This trip has already started';
  end if;
  if now() < b.departs_at - interval '30 minutes' then
    raise exception 'Too early: check in from 30 minutes before departure';
  end if;
  if b.here_at is not null then
    return; -- already told the driver
  end if;

  perform set_config('rafiq.trip_day', 'on', true);
  update bookings set here_at = now() where id = p_booking_id;
  perform set_config('rafiq.trip_day', 'off', true);

  select language into lang from profiles where id = b.driver_id;
  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into p_name, p_f
    from profiles where id = b.passenger_id;
  perform trip_day_push(b.driver_id, 'passenger_here',
    case when lang = 'ar' then p_name || case when p_f then ' وصلت' else ' وصل' end
         else p_name || ' is here' end,
    case when lang = 'ar' then 'عند نقطة الانطلاق.' else 'At the pickup point.' end,
    '/trips/requests/' || b.trip_id);
end;
$$;

-- Driver: tick (or untick) a passenger who got in.
create or replace function public.mark_boarded(p_booking_id uuid, p_boarded boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  select bk.status, t.driver_id, t.departs_at, t.started_at into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id;
  if not found or b.driver_id is distinct from auth.uid() then
    raise exception 'Only the driver can mark who got in';
  end if;
  if b.status <> 'accepted' then
    raise exception 'This seat is not confirmed';
  end if;
  if b.started_at is not null then
    raise exception 'This trip has already started';
  end if;
  if now() < b.departs_at - interval '60 minutes' then
    raise exception 'Too early: pickup opens an hour before departure';
  end if;
  perform set_config('rafiq.trip_day', 'on', true);
  update bookings set boarded_at = case when p_boarded then now() end where id = p_booking_id;
  perform set_config('rafiq.trip_day', 'off', true);
end;
$$;

-- Driver: the passenger didn't come. Only from 10 minutes after departure, and
-- never for someone ticked as got in. The charge stays (settle_payment).
create or replace function public.mark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  select bk.status, bk.boarded_at, t.driver_id, t.departs_at, t.started_at into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id;
  if not found or b.driver_id is distinct from auth.uid() then
    raise exception 'Only the driver can mark a no-show';
  end if;
  if b.status <> 'accepted' then
    raise exception 'This seat is not confirmed';
  end if;
  if b.boarded_at is not null then
    raise exception 'This passenger got in';
  end if;
  if now() < b.departs_at + interval '10 minutes' then
    raise exception 'Wait until 10 minutes after departure';
  end if;
  perform set_config('rafiq.trip_day', 'on', true);
  update bookings set status = 'no_show' where id = p_booking_id;
  perform set_config('rafiq.trip_day', 'off', true);
end;
$$;

-- ─── Start and finish ───────────────────────────────────────────────────────
-- Driver: Start trip. From 30 min before departure, once every confirmed passenger
-- is ticked as got in or marked no-show. Unanswered requests expire.
create or replace function public.start_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select driver_id, departs_at, cancelled_at, started_at into t
    from trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() then
    raise exception 'Only the driver can start this trip';
  end if;
  if t.cancelled_at is not null then
    raise exception 'This trip was cancelled';
  end if;
  if t.started_at is not null then
    return; -- already on the road
  end if;
  if now() < t.departs_at - interval '30 minutes' then
    raise exception 'Too early: start from 30 minutes before departure';
  end if;
  if exists (select 1 from bookings where trip_id = p_trip_id and status = 'accepted' and boarded_at is null) then
    raise exception 'Mark every passenger as got in or no-show first';
  end if;

  perform set_config('rafiq.trip_day', 'on', true);
  -- Nobody can be accepted any more: open requests expire (their holds are released).
  update bookings set status = 'expired' where trip_id = p_trip_id and status = 'requested';
  update trips set started_at = now() where id = p_trip_id;
  perform set_config('rafiq.trip_day', 'off', true);
end;
$$;

-- The shared ending: mark the trip finished and complete every confirmed seat.
-- Used by the driver's "Arrived" and by the cron job.
create or replace function public.close_trip(p_trip_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_lang   text;
  v_done   int;
begin
  perform set_config('rafiq.trip_day', 'on', true);
  update trips set finished_at = now()
   where id = p_trip_id and finished_at is null and cancelled_at is null
  returning driver_id into v_driver;
  if v_driver is null then
    perform set_config('rafiq.trip_day', 'off', true);
    return 0;
  end if;
  with done as (
    update bookings set status = 'completed'
     where trip_id = p_trip_id and status = 'accepted'
    returning 1
  )
  select count(*)::int into v_done from done;
  perform set_config('rafiq.trip_day', 'off', true);

  if v_done > 0 then
    select language into v_lang from profiles where id = v_driver;
    perform trip_day_push(v_driver, 'rate_passengers',
      case when v_lang = 'ar' then 'انتهت الرحلة' else 'Trip finished' end,
      case when v_lang = 'ar' then 'شكراً لك. قيّم ركّابك.' else 'Thank you. Rate your passengers.' end,
      '/trips/requests/' || p_trip_id);
  end if;
  return v_done;
end;
$$;
revoke execute on function public.close_trip(uuid) from public, anon, authenticated;

-- Driver: Arrived. Only for a trip that has started.
create or replace function public.finish_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select driver_id, started_at, finished_at into t from trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() then
    raise exception 'Only the driver can finish this trip';
  end if;
  if t.started_at is null then
    raise exception 'Start the trip first';
  end if;
  if t.finished_at is not null then
    return;
  end if;
  perform close_trip(p_trip_id);
end;
$$;

-- Cron: finish trips nobody finished by hand, 4 hours after start, or 4 hours
-- after departure if the driver never tapped Start. Runs as the server.
create or replace function public.finish_due_trips()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  total int := 0;
begin
  for r in
    select id from trips
     where finished_at is null and cancelled_at is null
       and coalesce(started_at, departs_at) < now() - interval '4 hours'
  loop
    total := total + close_trip(r.id);
  end loop;
  return total;
end;
$$;
revoke execute on function public.finish_due_trips() from public, anon, authenticated;

revoke execute on function public.im_here(uuid), public.mark_boarded(uuid, boolean),
  public.mark_no_show(uuid), public.start_trip(uuid), public.finish_trip(uuid) from public, anon;
grant execute on function public.im_here(uuid), public.mark_boarded(uuid, boolean),
  public.mark_no_show(uuid), public.start_trip(uuid), public.finish_trip(uuid) to authenticated;

-- ─── Ratings ────────────────────────────────────────────────────────────────
-- One row per person per booking: the passenger rates the driver, the driver
-- rates each passenger. Stars 1-5 plus a few tags and an optional note.
create table public.ratings (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  rater_id    uuid not null references public.profiles (id) on delete cascade,
  ratee_id    uuid not null references public.profiles (id) on delete cascade,
  ratee_role  text not null check (ratee_role in ('driver', 'passenger')),
  stars       int  not null check (stars between 1 and 5),
  tags        text[] not null default '{}' check (cardinality(tags) <= 6),
  note        text check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (booking_id, rater_id)
);
create index ratings_ratee_idx on public.ratings (ratee_id, created_at desc);

-- You see the ratings you gave and the ones about you. Writing goes through rate_trip().
-- Averages for everyone else come from person_stats() (slice 9).
alter table public.ratings enable row level security;
create policy ratings_read_own on public.ratings for select to authenticated
  using (rater_id = auth.uid() or ratee_id = auth.uid());

create or replace function public.rate_trip(
  p_booking_id uuid,
  p_stars      int,
  p_tags       text[] default '{}',
  p_note       text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b       record;
  v_ratee uuid;
  v_role  text;
begin
  select bk.status, bk.passenger_id, t.driver_id, t.finished_at into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id;
  if not found or auth.uid() not in (b.passenger_id, b.driver_id) then
    raise exception 'You were not on this trip';
  end if;
  if b.status <> 'completed' then
    raise exception 'Only finished trips can be rated';
  end if;
  if b.finished_at < now() - interval '7 days' then
    raise exception 'Ratings close 7 days after the trip';
  end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}')) tag where tag !~ '^[a-z_]{2,30}$') then
    raise exception 'Unknown tag';
  end if;
  if auth.uid() = b.passenger_id then
    v_ratee := b.driver_id;    v_role := 'driver';
  else
    v_ratee := b.passenger_id; v_role := 'passenger';
  end if;
  insert into ratings (booking_id, rater_id, ratee_id, ratee_role, stars, tags, note)
  values (p_booking_id, auth.uid(), v_ratee, v_role, p_stars, coalesce(p_tags, '{}'), nullif(trim(p_note), ''));
exception when unique_violation then
  raise exception 'You already rated this trip';
end;
$$;
revoke execute on function public.rate_trip(uuid, int, text[], text) from public, anon;
grant execute on function public.rate_trip(uuid, int, text[], text) to authenticated;

-- ─── Live updates and the cron job ──────────────────────────────────────────
-- Passengers see "on the road" the moment the driver taps Start.
alter publication supabase_realtime add table public.trips;

do $$ begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('finish-due-trips', '*/10 * * * *', 'select public.finish_due_trips()');
  end if;
end $$;
