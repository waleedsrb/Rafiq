-- Slice 4: deadlines and cancelling (rules from product topic 3).
--
-- * Every request gets a respond_by time. Window by time to departure:
--   more than 24h: 6h, 6 to 24h: 2h, under 6h: 30 min (never past departure).
-- * Unanswered requests expire: a pg_cron job runs expire_requests() every minute,
--   and an accept after the deadline is refused even if the job hasn't run yet.
-- * Passengers can withdraw a request, or cancel an accepted seat. Cancelling is
--   free until 12h before departure (or within 15 min of a late acceptance);
--   after that it is recorded as late, which payments will use later.
-- * Drivers cancel a whole trip (cancel_trip). Every open booking is cancelled
--   and late cancels are recorded, for the reliability score later.
-- The app shows the same rules from src/lib/rules.ts. Keep the numbers in sync.

alter table public.bookings
  add column respond_by     timestamptz,
  add column accepted_at    timestamptz,
  add column cancelled_late boolean;

alter table public.trips
  add column cancelled_at timestamptz;

-- Existing open requests get a deadline counted from when they were made.
update public.bookings b
   set respond_by = least(
         b.created_at + case
           when t.departs_at - b.created_at > interval '24 hours' then interval '6 hours'
           when t.departs_at - b.created_at > interval '6 hours'  then interval '2 hours'
           else interval '30 minutes' end,
         t.departs_at)
  from public.trips t
 where t.id = b.trip_id;

create or replace function public.respond_by(p_requested_at timestamptz, p_departs_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select least(
    p_requested_at + case
      when p_departs_at - p_requested_at > interval '24 hours' then interval '6 hours'
      when p_departs_at - p_requested_at > interval '6 hours'  then interval '2 hours'
      else interval '30 minutes' end,
    p_departs_at);
$$;

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
  v_taken      int;
  v_actor      uuid := auth.uid();       -- null when the server acts (cron, admin)
begin
  select driver_id, seats_total, departs_at, cancelled_at
    into v_driver, v_total, v_departs, v_cancelled
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
    if v_departs <= now() then
      raise exception 'This trip has already left';
    end if;
    new.respond_by     := respond_by(now(), v_departs);
    new.accepted_at    := null;
    new.cancelled_late := null;
    return new;
  end if;

  -- UPDATE: only status may change, and only along allowed paths.
  if new.trip_id <> old.trip_id or new.passenger_id <> old.passenger_id or new.seats <> old.seats then
    raise exception 'Only the status of a booking can change';
  end if;
  -- The timing columns belong to this trigger. Phones can't edit them.
  if v_actor is not null then
    new.respond_by     := old.respond_by;
    new.accepted_at    := old.accepted_at;
    new.cancelled_late := old.cancelled_late;
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

-- Requests past their deadline become 'expired'. Runs as the server (no actor).
create or replace function public.expire_requests()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update bookings set status = 'expired'
    where status = 'requested' and respond_by < now()
    returning 1
  )
  select count(*)::int from done;
$$;
revoke execute on function public.expire_requests() from public, anon, authenticated;

-- The driver cancels a trip: no new requests, and every open booking is cancelled
-- (each one logged and notified by the existing triggers).
create or replace function public.cancel_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update trips set cancelled_at = now()
  where id = p_trip_id and driver_id = auth.uid() and cancelled_at is null;
  if not found then
    raise exception 'Only the driver can cancel this trip';
  end if;
  update bookings set status = 'cancelled'
  where trip_id = p_trip_id and status in ('requested', 'accepted');
end;
$$;
revoke execute on function public.cancel_trip(uuid) from public, anon;
grant execute on function public.cancel_trip(uuid) to authenticated;

-- Drivers can't un-cancel a trip by editing it directly.
create or replace function public.guard_trip()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.cancelled_at is not null and new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'A cancelled trip stays cancelled';
  end if;
  return new;
end;
$$;
create trigger trips_guard before update on public.trips
for each row execute function public.guard_trip();
revoke execute on function public.guard_trip() from public, anon, authenticated;

-- Search no longer shows cancelled trips.
create or replace function public.search_trips(
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
  driver_first_name text
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
    split_part(p.full_name, ' ', 1) as driver_first_name
  from trips t
  join profiles p on p.id = t.driver_id
  where t.origin = p_origin
    and t.destination = p_destination
    and t.departs_at >= greatest(p_from, now())
    and t.departs_at < p_to
    and t.cancelled_at is null
    and t.driver_id <> auth.uid()          -- don't show me my own trips
  order by t.departs_at;
$$;

-- Notifications for the new events (adds expired and cancelled to slice 3's function).
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
  lang       text;
  other_name text;
  other_f    boolean;
  route      text;
  title      text;
  body       text;
  link       text;
  messages   jsonb;
  kind       text;
begin
  select bk.passenger_id, t.id as trip_id, t.driver_id, t.origin, t.destination, t.cancelled_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;

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

  select jsonb_agg(jsonb_build_object('to', token)) into messages
    from push_tokens where user_id = recipient;
  if messages is null then
    return null; -- no phone registered, nothing to send
  end if;

  select language into lang from profiles where id = recipient;
  select split_part(full_name, ' ', 1), gender = 'f' into other_name, other_f from profiles where id = other;
  other_f := coalesce(other_f, false);
  route := city_name(b.origin, lang)
        || case when lang = 'ar' then ' ← ' else ' → ' end
        || city_name(b.destination, lang);

  if kind = 'requested' then
    title := case when lang = 'ar' then 'طلب مقعد جديد' else 'New seat request' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' تريد ' else ' يريد ' end || 'مقعداً: ' || route
               else other_name || ' wants a seat: ' || route end;
  elsif kind = 'accepted' then
    title := case when lang = 'ar' then 'تم تأكيد مقعدك' else 'Your seat is confirmed' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' قبلت' else ' قبل' end || ' طلبك: ' || route
               else other_name || ' accepted you: ' || route end;
  elsif kind = 'declined' then
    title := case when lang = 'ar' then 'لم يتم قبول طلبك' else 'Request not accepted' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' لا تستطيع' else ' لا يستطيع' end
                    || ' أخذك هذه المرة. جرّب رحلة أخرى.'
               else other_name || ' can''t take you this time. Try another trip.' end;
  elsif kind = 'expired' then
    title := case when lang = 'ar' then 'انتهت مهلة طلبك' else 'Your request expired' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' لم تردّ' else ' لم يردّ' end
                    || ' في الوقت. جرّب رحلة أخرى: ' || route
               else other_name || ' didn''t answer in time. Try another trip: ' || route end;
  elsif kind = 'trip_cancelled' then
    title := case when lang = 'ar' then 'أُلغيت الرحلة' else 'Trip cancelled' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' ألغت' else ' ألغى' end
                    || ' الرحلة: ' || route || '. ابحث عن رحلة أخرى.'
               else other_name || ' cancelled the trip: ' || route || '. Find another one.' end;
  else -- passenger_cancelled (an accepted seat)
    title := case when lang = 'ar' then 'أُلغي حجز' else 'A seat was cancelled' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' ألغت مقعدها: ' else ' ألغى مقعده: ' end || route
               else other_name || ' cancelled their seat: ' || route end;
  end if;

  -- One message per phone, same content.
  select jsonb_agg(m || jsonb_build_object(
           'title', title, 'body', body, 'sound', 'default', 'data', jsonb_build_object('url', link)))
    into messages
    from jsonb_array_elements(messages) m;

  -- A push problem must never undo a booking, so swallow errors here.
  begin
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := messages,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
  return null;
end;
$$;

-- Run the expiry job every minute (pg_cron exists on Supabase, not in CI).
do $$ begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-requests', '* * * * *', 'select public.expire_requests()');
  end if;
end $$;
