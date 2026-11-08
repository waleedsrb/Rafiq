-- Slice 12 (part 1): women-only trips and the late-cancel pause for drivers.
--
-- Women-only trips (product topic 4): only a woman can drive one, and only women can
-- ask for a seat. "Woman" means what the ID says, not what someone tapped at sign-up:
-- the admin confirms gender when approving an ID check, and after that it is locked.
-- People who aren't verified women never see these trips in search.
--
-- Late cancels (product topic 3): a driver who cancels a trip with booked passengers
-- less than 12 hours before departure gets a late cancel. Three in 30 days pause
-- posting for 7 days after the last one. A closed checkpoint reported on the road
-- right now is a fair excuse, so it doesn't count.
-- The app shows the same numbers from src/lib/rules.ts. Keep them in sync.

-- ─── Gender confirmed from the ID ────────────────────────────────────────────
alter table public.profiles add column gender_verified_at timestamptz;

-- Everyone already approved typed their gender before this existed. Trust it once
-- (today that is only the test accounts); new approvals confirm it from the photo.
update public.profiles
   set gender_verified_at = id_verified_at
 where id_verified_at is not null and gender is not null;

-- Same guard as slice 5, plus: gender_verified_at is set only by a reviewer, and a
-- confirmed gender can't be changed from the phone.
create or replace function public.guard_verified_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  reviewing boolean := coalesce(current_setting('rafiq.reviewing', true), '') = 'on';
  server    boolean := auth.uid() is null;   -- dashboard, cron, migrations
begin
  if reviewing or server then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if tg_op = 'INSERT' then
      new.id_verified_at := null;
      new.gender_verified_at := null;
    elsif new.id_verified_at is distinct from old.id_verified_at
       or new.gender_verified_at is distinct from old.gender_verified_at then
      raise exception 'Verification is set by a reviewer';
    elsif old.gender_verified_at is not null and new.gender is distinct from old.gender then
      raise exception 'Gender is confirmed from your ID';
    end if;
  else -- driver_details
    if tg_op = 'INSERT' then
      new.verified_at := null;
    elsif new.verified_at is distinct from old.verified_at then
      raise exception 'Verification is set by a reviewer';
    elsif new.car_model is distinct from old.car_model
       or new.car_color is distinct from old.car_color
       or new.plate     is distinct from old.plate then
      -- A different car needs a new look.
      new.verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- The admin's decision now also confirms gender from the ID (p_gender: 'm' or 'f').
-- Left out, the gender the person chose at sign-up is confirmed.
drop function public.review_verification(uuid, boolean, text);
create function public.review_verification(
  p_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_gender text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v        record;
  v_gender text;
begin
  if not is_admin() then
    raise exception 'Only admins can review';
  end if;
  select * into v from verifications where id = p_id for update;
  if not found or v.status <> 'pending' then
    raise exception 'This request is not waiting for review';
  end if;
  if not p_approve and (p_reason is null or length(trim(p_reason)) < 2) then
    raise exception 'Say why it was rejected';
  end if;
  if p_approve then
    select coalesce(p_gender, gender) into v_gender from profiles where id = v.user_id;
    if v_gender is null or v_gender not in ('m', 'f') then
      raise exception 'Choose the gender shown on the ID';
    end if;
  end if;

  perform set_config('rafiq.reviewing', 'on', true);
  update verifications
     set status = case when p_approve then 'approved' else 'rejected' end,
         reject_reason = case when p_approve then null else trim(p_reason) end,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id;
  if p_approve then
    update profiles
       set id_verified_at = coalesce(id_verified_at, now()),
           gender = v_gender,
           gender_verified_at = now()
     where id = v.user_id;
    if v.kind = 'driver' then
      update driver_details set verified_at = now() where driver_id = v.user_id;
    end if;
  end if;
  perform set_config('rafiq.reviewing', 'off', true);
end;
$$;
revoke execute on function public.review_verification(uuid, boolean, text, text) from public, anon;
grant execute on function public.review_verification(uuid, boolean, text, text) to authenticated;

create or replace function public.is_verified_woman(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = p_user and gender = 'f' and gender_verified_at is not null and id_verified_at is not null
  );
$$;
revoke execute on function public.is_verified_woman(uuid) from public, anon;
grant execute on function public.is_verified_woman(uuid) to authenticated;

-- ─── New trip columns ────────────────────────────────────────────────────────
alter table public.trips
  add column women_only     boolean not null default false,
  add column cancelled_late boolean,
  add column cancel_reason  text check (cancel_reason in ('checkpoint_closed'));

-- ─── Late cancels and the posting pause ──────────────────────────────────────
-- A driver's late cancels in the last 30 days: whole trips cancelled late, plus single
-- accepted seats the driver cancelled late on a trip that still runs.
create or replace function public.late_cancels(p_driver uuid, p_since timestamptz)
returns table (cancelled_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.cancelled_at
    from trips t
   where t.driver_id = p_driver and t.cancelled_late and t.cancelled_at >= p_since
  union all
  select e.created_at
    from bookings b
    join trips t on t.id = b.trip_id
    join booking_events e on e.booking_id = b.id and e.to_status = 'cancelled'
   where t.driver_id = p_driver
     and t.cancelled_at is null
     and b.cancelled_late
     and e.actor_id = p_driver
     and e.created_at >= p_since;
$$;
revoke execute on function public.late_cancels(uuid, timestamptz) from public, anon, authenticated;

-- When the pause ends, or null if the driver may post. 3 late cancels in 30 days
-- pause posting until 7 days after the last one.
create or replace function public.posting_paused_until(p_driver uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case when count(*) >= 3 and max(cancelled_at) + interval '7 days' > now()
              then max(cancelled_at) + interval '7 days' end
    from late_cancels(p_driver, now() - interval '30 days');
$$;
revoke execute on function public.posting_paused_until(uuid) from public, anon, authenticated;

-- For the app: my late cancels in the last 30 days, and the pause end if paused.
create or replace function public.my_driving_record()
returns table (late_cancels_30d int, paused_until timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::int from late_cancels(auth.uid(), now() - interval '30 days')),
         posting_paused_until(auth.uid());
$$;
revoke execute on function public.my_driving_record() from public, anon;
grant execute on function public.my_driving_record() to authenticated;

-- ─── Trip rules: women-only and the pause ────────────────────────────────────
create or replace function public.check_trip_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  if tg_op = 'INSERT' then
    -- Cancelling only happens through cancel_trip(). (The server may load history.)
    if auth.uid() is not null then
      new.cancelled_at := null;
      new.cancelled_late := null;
      new.cancel_reason := null;
    end if;
    v_until := posting_paused_until(new.driver_id);
    if v_until is not null then
      raise exception 'Posting is paused until %', to_char(v_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
  end if;

  if new.women_only and (tg_op = 'INSERT' or not old.women_only or new.driver_id <> old.driver_id) then
    if not is_verified_woman(new.driver_id) then
      raise exception 'Only women can drive women-only trips';
    end if;
  end if;

  -- Switching women-only on or off would change the rules for people already asking.
  if tg_op = 'UPDATE' and new.women_only <> old.women_only and exists (
    select 1 from bookings where trip_id = new.id and status in ('requested', 'accepted')
  ) then
    raise exception 'Women-only can''t change once someone has asked for a seat';
  end if;
  return new;
end;
$$;
create trigger trips_check_safety
before insert or update on public.trips
for each row execute function public.check_trip_safety();
revoke execute on function public.check_trip_safety() from public, anon, authenticated;

-- Slice 8's guard (start/finish only through trip-day functions, no route changes once
-- started), plus: only cancel_trip() may cancel, so the late flag can't be skipped.
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
       new.started_at is distinct from old.started_at or new.finished_at is distinct from old.finished_at) then
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

-- Women-only seats are for verified women.
create or replace function public.require_women_only_passenger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from trips where id = new.trip_id and women_only)
     and not is_verified_woman(new.passenger_id) then
    raise exception 'This trip is for women only';
  end if;
  return new;
end;
$$;
create trigger bookings_women_only
before insert on public.bookings
for each row execute function public.require_women_only_passenger();
revoke execute on function public.require_women_only_passenger() from public, anon, authenticated;

-- ─── Cancelling a trip, now with the late flag ──────────────────────────────
drop function public.cancel_trip(uuid);
create function public.cancel_trip(p_trip_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      record;
  v_late boolean;
begin
  select * into t from trips where id = p_trip_id for update;
  if not found or t.driver_id is distinct from auth.uid() or t.cancelled_at is not null
     or t.started_at is not null then
    raise exception 'Only the driver can cancel this trip, before it starts';
  end if;
  if p_reason is not null and p_reason <> 'checkpoint_closed' then
    raise exception 'Unknown reason';
  end if;
  if p_reason = 'checkpoint_closed' and not exists (
    select 1 from checkpoint_overview() where status = 'closed'
  ) then
    raise exception 'No closed checkpoint is reported right now';
  end if;

  -- Late: someone was counting on a seat and departure is less than 12 hours away.
  v_late := p_reason is null
        and now() > t.departs_at - interval '12 hours'
        and exists (select 1 from bookings where trip_id = p_trip_id and status = 'accepted');

  perform set_config('rafiq.cancelling', 'on', true);
  update trips
     set cancelled_at = now(), cancelled_late = v_late, cancel_reason = p_reason
   where id = p_trip_id;
  perform set_config('rafiq.cancelling', 'off', true);

  update bookings set status = 'cancelled'
   where trip_id = p_trip_id and status in ('requested', 'accepted');
end;
$$;
revoke execute on function public.cancel_trip(uuid, text) from public, anon;
grant execute on function public.cancel_trip(uuid, text) to authenticated;

-- ─── Search shows women-only trips only to verified women ───────────────────
drop function public.search_trips(public.city, public.city, timestamptz, timestamptz);
create function public.search_trips(
  p_origin public.city,
  p_destination public.city,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  id uuid,
  departs_at timestamptz,
  seats_total int,
  seats_left int,
  price_ils numeric,
  driver_first_name text,
  driver_last_initial text,
  car_model text,
  driver_verified boolean,
  women_only boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.departs_at,
    t.seats_total,
    t.seats_total - coalesce((
      select sum(b.seats)::int from bookings b
      where b.trip_id = t.id and b.status = 'accepted'
    ), 0) as seats_left,
    t.price_ils,
    split_part(p.full_name, ' ', 1) as driver_first_name,
    case when position(' ' in trim(p.full_name)) > 0
         then left(regexp_replace(trim(p.full_name), '^.*\s', ''), 1)
         else '' end as driver_last_initial,
    d.car_model,
    d.verified_at is not null as driver_verified,
    t.women_only
  from trips t
  join profiles p on p.id = t.driver_id
  left join driver_details d on d.driver_id = t.driver_id
  where t.origin = p_origin
    and t.destination = p_destination
    and t.departs_at >= greatest(p_from, now())
    and t.departs_at < p_to
    and t.cancelled_at is null
    and t.driver_id <> auth.uid()          -- don't show me my own trips
    and (not t.women_only or is_verified_woman(auth.uid()))
  order by t.departs_at;
$$;
revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;
