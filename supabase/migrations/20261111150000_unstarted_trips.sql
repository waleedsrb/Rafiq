-- Trips that never start (Nov 11, Waleed picked option B).
--
-- Before this, a trip nobody tapped Start on was finished by the cron job 4 hours after
-- departure and every confirmed seat became "completed". Silence counted as a real ride:
-- rating prompts, +1 trip and better reliability for something that may never have happened.
--
-- Now silence counts for nothing. Times from the planned departure:
--
--   +15 min  push the driver: "Your trip was due at 12:00"
--   +45 min  push each rider who hasn't answered: "Did you ride with Ahmad?"
--   +60 min  last push to the driver: "We'll close this trip at 15:00"
--   +3 h     settle_unstarted_trips() decides every seat (or sooner, once everyone answered)
--
-- Answers:
--   rider  (answer_ride):        in_car (before it starts) · rode · driver_absent · didnt_go
--   driver (trip_did_not_happen): checkpoint_closed · nobody_came · couldnt_go
--   driver (start_trip_all_in):  ticks everyone still unmarked and starts, the normal flow
--
-- How each seat is decided (driver ticks count as "rode"):
--
--   driver says        rider says                 seat
--   ─────────────      ─────────────────────      ───────────────────────────
--   nothing            rode / in the car          completed (both can rate)
--   nothing            driver didn't come         cancelled, driver late cancel
--   nothing            I didn't go                no_show
--   nothing            nothing                    not_confirmed (counts for nobody)
--   nobody came        I didn't go / nothing      no_show
--   couldn't go        anything but rode          cancelled, driver late cancel
--   checkpoint closed  anything but rode          cancelled, excused
--   any reason         rode                       disputed (counts for nobody, admin sees it)
--   nobody came        driver didn't come         disputed
--   started / ticked   driver didn't come         disputed
--   one rider rode,    another says the driver
--   driver silent      didn't come                that other seat is disputed
--
-- The app mirrors these numbers in src/lib/trip-day.ts. Change both together.

-- ─── Two new seat outcomes ──────────────────────────────────────────────────
-- Only used inside plpgsql below, so this file also runs as a single transaction.
alter type public.booking_status add value if not exists 'not_confirmed';
alter type public.booking_status add value if not exists 'disputed';

-- ─── New columns ────────────────────────────────────────────────────────────
alter table public.bookings
  add column rider_answer    text check (rider_answer in ('in_car', 'rode', 'driver_absent', 'didnt_go')),
  add column rider_answer_at timestamptz;

alter table public.trips
  add column no_go_reason text check (no_go_reason in ('checkpoint_closed', 'nobody_came', 'couldnt_go')),
  add column no_go_at     timestamptz;

-- Why a trip was cancelled. Settling adds three new reasons beside the checkpoint excuse.
alter table public.trips drop constraint if exists trips_cancel_reason_check;
alter table public.trips add constraint trips_cancel_reason_check
  check (cancel_reason in ('checkpoint_closed', 'nobody_came', 'couldnt_go', 'driver_absent'));

-- Who was nudged about which trip, so nobody gets the same push twice.
create table public.trip_nudges (
  trip_id    uuid not null references public.trips (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id, kind)
);
alter table public.trip_nudges enable row level security; -- server only

-- ─── Booking rules: the new outcomes, and answers only through functions ─────
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
    new.respond_by      := respond_by(now(), v_departs);
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
    (old.status = 'requested' and new.status in ('accepted', 'declined', 'expired', 'cancelled')) or
    (old.status = 'accepted'  and new.status in ('completed', 'cancelled', 'no_show', 'not_confirmed', 'disputed'))
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

-- Trips: only the trip-day functions may record why a trip didn't happen.
create or replace function public.guard_trip()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cancelling boolean := coalesce(current_setting('rafiq.cancelling', true), '') = 'on';
begin
  if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'A cancelled trip stays cancelled';
  end if;
  if auth.uid() is not null and not in_trip_day() and (
       new.started_at is distinct from old.started_at or new.finished_at is distinct from old.finished_at
    or new.no_go_reason is distinct from old.no_go_reason or new.no_go_at is distinct from old.no_go_at) then
    raise exception 'Use Start trip and Arrived to change a trip''s state';
  end if;
  if old.started_at is not null and (new.departs_at <> old.departs_at or new.origin <> old.origin
       or new.destination <> old.destination) then
    raise exception 'A trip that has started can''t be changed';
  end if;
  if auth.uid() is not null and not cancelling and (
       new.cancelled_at   is distinct from old.cancelled_at
    or new.cancelled_late is distinct from old.cancelled_late
    or new.cancel_reason  is distinct from old.cancel_reason
  ) then
    raise exception 'Cancel a trip with cancel_trip()';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_trip() from public, anon, authenticated;

-- ─── Rider: answer from Home ────────────────────────────────────────────────
-- in_car:        from 30 min before departure until the trip starts. Ticks you on the
--                driver's pickup list, so the driver has one less thing to tap.
-- rode / driver_absent / didnt_go: from departure until the trip is settled, only while
--                the driver hasn't started. The seat is decided when the trip settles.
create or replace function public.answer_ride(p_booking_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
begin
  if p_answer not in ('in_car', 'rode', 'driver_absent', 'didnt_go') then
    raise exception 'Unknown answer';
  end if;
  select bk.status, bk.boarded_at, bk.rider_answer, bk.rider_answer_at,
         t.departs_at, t.started_at, t.cancelled_at, t.finished_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id and bk.passenger_id = auth.uid()
   for update of bk;
  if not found or b.status <> 'accepted' or b.cancelled_at is not null or b.finished_at is not null then
    raise exception 'No confirmed seat to answer for';
  end if;
  if b.started_at is not null then
    raise exception 'This trip has already started';
  end if;
  if p_answer = 'in_car' and now() < b.departs_at - interval '30 minutes' then
    raise exception 'Too early: pickup opens 30 minutes before departure';
  end if;
  if p_answer <> 'in_car' and now() < b.departs_at then
    raise exception 'Wait until the departure time';
  end if;

  perform set_config('rafiq.trip_day', 'on', true);
  update bookings
     set rider_answer    = p_answer,
         rider_answer_at = now(),
         here_at         = case when p_answer = 'in_car' then coalesce(here_at, now()) else here_at end,
         boarded_at      = case
                             when p_answer = 'in_car' then coalesce(boarded_at, now())
                             -- Taking back your own "in the car" also takes back the tick.
                             when b.rider_answer = 'in_car' and boarded_at = b.rider_answer_at then null
                             else boarded_at end
   where id = p_booking_id;
  perform set_config('rafiq.trip_day', 'off', true);
end;
$$;

-- ─── Driver: "All in · Start" from Home ─────────────────────────────────────
-- Ticks every confirmed rider who isn't marked yet, then starts as usual.
create or replace function public.start_trip_all_in(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from trips where id = p_trip_id and driver_id = auth.uid()) then
    raise exception 'Only the driver can start this trip';
  end if;
  if exists (select 1 from trips where id = p_trip_id and now() < departs_at - interval '30 minutes') then
    raise exception 'Too early: start from 30 minutes before departure';
  end if;
  perform set_config('rafiq.trip_day', 'on', true);
  update bookings set boarded_at = now()
   where trip_id = p_trip_id and status = 'accepted' and boarded_at is null;
  perform set_config('rafiq.trip_day', 'off', true);
  perform start_trip(p_trip_id);
end;
$$;

-- ─── Driver: "Didn't happen" ────────────────────────────────────────────────
-- From the departure time, before starting. Riders hear about it at once; the seats are
-- decided when the trip settles, so a rider who disagrees can still say so.
create or replace function public.trip_did_not_happen(p_trip_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      record;
  r      record;
  v_name text;
  v_f    boolean;
begin
  if p_reason not in ('checkpoint_closed', 'nobody_came', 'couldnt_go') then
    raise exception 'Unknown reason';
  end if;
  select * into t from trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() then
    raise exception 'Only the driver can say this trip didn''t happen';
  end if;
  if t.cancelled_at is not null or t.finished_at is not null then
    raise exception 'This trip is already closed';
  end if;
  if t.started_at is not null then
    raise exception 'This trip has already started';
  end if;
  if now() < t.departs_at then
    raise exception 'Before the departure time, cancel the trip instead';
  end if;
  if p_reason = 'checkpoint_closed' and not exists (
    select 1 from checkpoint_overview() where status = 'closed'
  ) then
    raise exception 'No closed checkpoint is reported right now';
  end if;
  if p_reason = 'nobody_came' and exists (
    select 1 from bookings where trip_id = p_trip_id and status = 'accepted'
       and boarded_at is not null and rider_answer is distinct from 'in_car'
  ) then
    raise exception 'You marked someone as in the car';
  end if;

  perform set_config('rafiq.trip_day', 'on', true);
  update trips set no_go_reason = p_reason, no_go_at = now() where id = p_trip_id;
  perform set_config('rafiq.trip_day', 'off', true);

  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into v_name, v_f
    from profiles where id = t.driver_id;
  for r in select passenger_id from bookings where trip_id = p_trip_id and status = 'accepted' loop
    perform send_push(r.passenger_id, 'trip_no_go',
      case p_reason
        when 'checkpoint_closed' then 'حاجز مغلق، لم تتم الرحلة'
        when 'nobody_came'       then 'لم تتم الرحلة'
        else v_name || case when v_f then ' لم تستطع الذهاب' else ' لم يستطع الذهاب' end end,
      case p_reason
        when 'checkpoint_closed' then v_name || ' ' || case when v_f then 'تقول' else 'يقول' end || ' إن حاجزاً كان مغلقاً. لا غرامة على أحد.'
        when 'nobody_came'       then v_name || ' ' || case when v_f then 'تقول' else 'يقول' end || ' إن أحداً لم يحضر. إن ركبت، أخبرنا.'
        else 'مقعدك أُلغي بدون أي أثر عليك.' end,
      case p_reason
        when 'checkpoint_closed' then 'Checkpoint closed, trip didn''t happen'
        when 'nobody_came'       then 'Trip didn''t happen'
        else v_name || ' couldn''t go' end,
      case p_reason
        when 'checkpoint_closed' then v_name || ' says a checkpoint was closed. No penalty for anyone.'
        when 'nobody_came'       then v_name || ' says nobody came. If you rode, tell us.'
        else 'Your seat is cancelled, with no effect on you.' end,
      '/home');
  end loop;
end;
$$;

-- ─── Nudges ─────────────────────────────────────────────────────────────────
-- Every 5 minutes. Each push goes once per person and trip (trip_nudges).
create or replace function public.nudge_unstarted_trips()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_sent  int := 0;
  v_time  text;
  v_close text;
begin
  for r in
    -- Drivers: +15 min (due) and +60 min (last call), until they answer.
    select t.id as trip_id, t.driver_id as user_id, t.departs_at, null::text as driver_name, null::boolean as driver_f,
           case when now() >= t.departs_at + interval '60 minutes' then 'driver_last' else 'driver_due' end as kind
      from trips t
     where t.started_at is null and t.cancelled_at is null and t.finished_at is null and t.no_go_reason is null
       and now() >= t.departs_at + interval '15 minutes' and now() < t.departs_at + interval '3 hours'
       and exists (select 1 from bookings b where b.trip_id = t.id and b.status = 'accepted')
    union all
    -- Riders: +45 min, if they haven't answered and the driver hasn't ticked them.
    select t.id, b.passenger_id, t.departs_at, split_part(p.full_name, ' ', 1), coalesce(p.gender = 'f', false),
           'rider_ask'
      from trips t
      join bookings b on b.trip_id = t.id and b.status = 'accepted'
      join profiles p on p.id = t.driver_id
     where t.started_at is null and t.cancelled_at is null and t.finished_at is null
       and b.rider_answer is null and b.boarded_at is null
       and now() >= t.departs_at + interval '45 minutes' and now() < t.departs_at + interval '3 hours'
  loop
    insert into trip_nudges (trip_id, user_id, kind) values (r.trip_id, r.user_id, r.kind)
    on conflict do nothing;
    continue when not found;  -- already nudged

    v_time  := to_char(r.departs_at at time zone 'Asia/Hebron', 'HH24:MI');
    v_close := to_char((r.departs_at + interval '3 hours') at time zone 'Asia/Hebron', 'HH24:MI');
    if r.kind = 'driver_due' then
      perform send_push(r.user_id, 'trip_overdue',
        'رحلتك كانت الساعة ' || v_time,
        'حدّد من ركب ثم ابدأ الرحلة، أو أخبرنا أنها لم تتم.',
        'Your trip was due at ' || v_time,
        'Mark who got in and start, or tell us it didn''t happen.',
        '/home');
    elsif r.kind = 'driver_last' then
      perform send_push(r.user_id, 'trip_overdue',
        'سنغلق رحلة ' || v_time || ' الساعة ' || v_close,
        'إن لم تُجب، لن تُحسب الرحلة لأحد.',
        'We''ll close your ' || v_time || ' trip at ' || v_close,
        'If nobody answers, it won''t count for anyone.',
        '/home');
    else
      perform send_push(r.user_id, 'did_you_ride',
        'هل ركبت مع ' || r.driver_name || '؟',
        'رحلة ' || v_time || ' لم تبدأ في التطبيق. أجب بلمسة واحدة.',
        'Did you ride with ' || r.driver_name || '?',
        'Your ' || v_time || ' trip hasn''t started in the app. Answer with one tap.',
        '/home');
    end if;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.nudge_unstarted_trips() from public, anon, authenticated;

-- ─── Settling ───────────────────────────────────────────────────────────────
-- Decides every confirmed seat of one trip that never started (table at the top).
-- Runs as the server (cron), so booking_events record no actor.
create or replace function public.settle_unstarted_trip(p_trip_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  t           record;
  s           record;
  v_rode      boolean;
  v_any_rode  boolean;
  v_absent    boolean := false;
  v_outcome   public.booking_status;
  v_done      int := 0;
  v_reason    text;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found or t.started_at is not null or t.cancelled_at is not null or t.finished_at is not null then
    return 0;
  end if;

  -- Did the trip happen for anyone? A driver tick or a rider's "rode"/"in the car" says yes.
  select coalesce(bool_or(boarded_at is not null or rider_answer in ('rode', 'in_car')), false)
    into v_any_rode
    from bookings where trip_id = p_trip_id and status = 'accepted';

  -- A trip that happened is finished first, so its seats can complete.
  perform set_config('rafiq.settling', 'on', true);
  perform set_config('rafiq.trip_day', 'on', true);
  if v_any_rode and t.no_go_reason is null then
    update trips set finished_at = now() where id = p_trip_id;
  end if;

  for s in select * from bookings where trip_id = p_trip_id and status = 'accepted' for update loop
    v_rode := s.boarded_at is not null or s.rider_answer in ('rode', 'in_car');
    v_outcome :=
      case
        when t.no_go_reason is null then
          case
            when s.rider_answer = 'driver_absent' and (v_any_rode) then 'disputed'
            when s.rider_answer = 'driver_absent' then 'cancelled'
            when s.rider_answer = 'didnt_go' and s.boarded_at is not null then 'disputed'
            when s.rider_answer = 'didnt_go' then 'no_show'
            when v_rode then 'completed'
            else 'not_confirmed' end
        when s.rider_answer in ('rode', 'in_car') then 'disputed'
        when t.no_go_reason = 'nobody_came' then
          case when s.rider_answer = 'driver_absent' then 'disputed' else 'no_show' end
        else 'cancelled'  -- checkpoint_closed, couldnt_go
      end;
    if v_outcome = 'cancelled' and t.no_go_reason is null then
      v_absent := true;
    end if;
    update bookings set status = v_outcome where id = s.id;
    v_done := v_done + 1;
  end loop;
  perform set_config('rafiq.trip_day', 'off', true);

  -- The trip itself: cancelled when it didn't happen, late when that's on the driver.
  v_reason := coalesce(t.no_go_reason, case when v_absent and not v_any_rode then 'driver_absent' end);
  if v_reason is not null and not (v_any_rode and t.no_go_reason is null) then
    perform set_config('rafiq.cancelling', 'on', true);
    update trips
       set cancelled_at = now(),
           cancelled_late = v_reason in ('couldnt_go', 'driver_absent'),
           cancel_reason = v_reason
     where id = p_trip_id;
    perform set_config('rafiq.cancelling', 'off', true);
  elsif not v_any_rode then
    -- Nobody answered anything: close it quietly so it leaves everyone's Home.
    perform set_config('rafiq.trip_day', 'on', true);
    update trips set finished_at = now() where id = p_trip_id;
    perform set_config('rafiq.trip_day', 'off', true);
  end if;

  perform set_config('rafiq.settling', 'off', true);

  if v_any_rode and t.no_go_reason is null then
    perform send_push(t.driver_id, 'rate_passengers',
      'انتهت الرحلة', 'شكراً لك. قيّم ركّابك.',
      'Trip finished', 'Thank you. Rate your passengers.',
      '/trips/requests/' || p_trip_id);
  end if;
  return v_done;
end;
$$;
revoke execute on function public.settle_unstarted_trip(uuid) from public, anon, authenticated;

-- Cron: settle trips 3 hours after departure, or sooner once the driver and every
-- rider have answered.
create or replace function public.settle_unstarted_trips()
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
    select t.id from trips t
     where t.started_at is null and t.cancelled_at is null and t.finished_at is null
       and t.departs_at < now()
       and (
         t.departs_at < now() - interval '3 hours'
         or (t.no_go_reason is not null and not exists (
               select 1 from bookings b where b.trip_id = t.id and b.status = 'accepted' and b.rider_answer is null))
       )
  loop
    total := total + settle_unstarted_trip(r.id);
  end loop;
  return total;
end;
$$;
revoke execute on function public.settle_unstarted_trips() from public, anon, authenticated;

-- Trips that did start still finish by themselves 4 hours after Start. Trips that never
-- started are no longer finished here: settle_unstarted_trips() decides them instead.
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
       and started_at is not null and started_at < now() - interval '4 hours'
  loop
    total := total + close_trip(r.id);
  end loop;
  return total;
end;
$$;
revoke execute on function public.finish_due_trips() from public, anon, authenticated;

-- A started trip: a rider who said the driver never came, but was ticked in, is disputed
-- instead of completed. Everything else as before.
create or replace function public.close_trip(p_trip_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
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
  update bookings set status = 'disputed'
   where trip_id = p_trip_id and status = 'accepted' and rider_answer = 'driver_absent';
  with done as (
    update bookings set status = 'completed'
     where trip_id = p_trip_id and status = 'accepted'
    returning 1
  )
  select count(*)::int into v_done from done;
  perform set_config('rafiq.trip_day', 'off', true);

  if v_done > 0 then
    perform send_push(v_driver, 'rate_passengers',
      'انتهت الرحلة', 'شكراً لك. قيّم ركّابك.',
      'Trip finished', 'Thank you. Rate your passengers.',
      '/trips/requests/' || p_trip_id);
  end if;
  return v_done;
end;
$$;
revoke execute on function public.close_trip(uuid) from public, anon, authenticated;

-- "You missed the trip" makes no sense to someone who told us they didn't go.
create or replace function public.notify_trip_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  drv_name   text;
  drv_f      boolean;
begin
  if new.to_status not in ('completed', 'no_show') then
    return null;
  end if;
  select bk.passenger_id, bk.rider_answer, t.id as trip_id, t.driver_id into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;
  if new.to_status = 'no_show' and b.rider_answer = 'didnt_go' then
    return null;
  end if;
  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into drv_name, drv_f
    from profiles where id = b.driver_id;

  if new.to_status = 'completed' then
    perform send_push(b.passenger_id, 'rate_driver',
      'وصلت بالسلامة',
      'كيف كانت رحلتك مع ' || drv_name || '؟ قيّم الرحلة.',
      'You''ve arrived',
      'How was your trip with ' || drv_name || '? Rate it.',
      '/trips/rate/' || new.booking_id);
  else
    perform send_push(b.passenger_id, 'no_show',
      'فاتتك الرحلة',
      drv_name || case when drv_f then ' انطلقت' else ' انطلق' end || ' بدونك. الغياب يؤثر على موثوقيتك.',
      'You missed the trip',
      drv_name || ' left without you. Missed trips lower your reliability.',
      '/trips/' || b.trip_id);
  end if;
  return null;
end;
$$;

-- ─── Quiet while settling ───────────────────────────────────────────────────
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
  if kind = 'passenger_cancelled' and new.from_status = 'requested' then
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

-- ─── Reliability: count each side only for what was their doing ─────────────
-- Two fixes found while mapping this: a driver's late cancel used to count against the
-- passengers whose seats it cancelled, and an excused cancel (closed checkpoint) used to
-- count against the driver. not_confirmed and disputed seats count for nobody.
create or replace function public.people_stats(p_people uuid[])
returns table (
  person_id        uuid,
  completed_trips  int,       -- as passenger + as driver
  rating_avg       numeric,   -- 1 decimal, null with no ratings
  rating_count     int,
  reliability      numeric,   -- 0..1, 2 decimals, null with no history
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select distinct unnest(p_people) as id
  ),
  as_passenger as (
    select b.passenger_id as id,
           count(*) filter (where b.status = 'completed') as good,
           count(*) filter (where b.status = 'no_show'
                              or (b.status = 'cancelled' and b.cancelled_late
                                  and exists (select 1 from booking_events e
                                               where e.booking_id = b.id and e.to_status = 'cancelled'
                                                 and e.actor_id = b.passenger_id))) as bad
      from bookings b
     where b.passenger_id in (select id from people)
     group by b.passenger_id
  ),
  as_driver as (
    select t.driver_id as id,
           count(*) filter (where t.finished_at is not null
                              and exists (select 1 from bookings b where b.trip_id = t.id and b.status = 'completed')) as good,
           count(*) filter (where t.cancelled_at is not null and t.cancelled_late
                              and exists (select 1 from bookings b join booking_events e on e.booking_id = b.id
                                           where b.trip_id = t.id and e.from_status = 'accepted'
                                             and e.to_status = 'cancelled')) as bad
      from trips t
     where t.driver_id in (select id from people)
     group by t.driver_id
  ),
  rated as (
    select ratee_id as id, round(avg(stars), 1) as avg_stars, count(*)::int as n
      from ratings
     where ratee_id in (select id from people)
     group by ratee_id
  )
  select p.id,
         (coalesce(ap.good, 0) + coalesce(ad.good, 0))::int,
         r.avg_stars,
         coalesce(r.n, 0),
         case when coalesce(ap.good, 0) + coalesce(ad.good, 0) + coalesce(ap.bad, 0) + coalesce(ad.bad, 0) = 0 then null
              else round((coalesce(ap.good, 0) + coalesce(ad.good, 0))::numeric
                   / (coalesce(ap.good, 0) + coalesce(ad.good, 0) + coalesce(ap.bad, 0) + coalesce(ad.bad, 0)), 2) end,
         exists (select 1 from driver_details d where d.driver_id = p.id and d.founding_at is not null)
    from people p
    left join as_passenger ap on ap.id = p.id
    left join as_driver ad on ad.id = p.id
    left join rated r on r.id = p.id;
$$;

-- ─── Admin: seats nobody agrees on ───────────────────────────────────────────
create or replace function public.admin_disputed_seats()
returns table (
  booking_id    uuid,
  trip_id       uuid,
  departs_at    timestamptz,
  origin        public.city,
  destination   public.city,
  driver_id     uuid,
  passenger_id  uuid,
  driver_says   text,
  rider_says    text,
  ticked_in     boolean,
  started       boolean,
  decided_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admins only';
  end if;
  return query
    select b.id, t.id, t.departs_at, t.origin, t.destination, t.driver_id, b.passenger_id,
           coalesce(t.no_go_reason, case when t.started_at is not null then 'started' end),
           b.rider_answer, b.boarded_at is not null, t.started_at is not null, b.updated_at
      from bookings b join trips t on t.id = b.trip_id
     where b.status = 'disputed'
     order by b.updated_at desc
     limit 200;
end;
$$;

revoke execute on function public.answer_ride(uuid, text), public.start_trip_all_in(uuid),
  public.trip_did_not_happen(uuid, text), public.admin_disputed_seats() from public, anon;
grant execute on function public.answer_ride(uuid, text), public.start_trip_all_in(uuid),
  public.trip_did_not_happen(uuid, text), public.admin_disputed_seats() to authenticated;

-- ─── Cron ───────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('nudge-unstarted-trips', '*/5 * * * *', 'select public.nudge_unstarted_trips()');
    perform cron.schedule('settle-unstarted-trips', '*/5 * * * *', 'select public.settle_unstarted_trips()');
  end if;
end $$;
