-- Slice 14c: a reminder one hour before departure.
--
-- Passengers with a confirmed seat get the time, the car and the plate, so they can walk
-- out and find it. The driver gets how many people are coming. Kind 'trip_reminder' is
-- about a confirmed trip, so send_push() always delivers it (no switch turns it off).
--
-- A job every 5 minutes picks trips that leave in the next 60 minutes and haven't started.
-- trip_reminders remembers who was reminded, so nobody gets two.

create table public.trip_reminders (
  trip_id  uuid not null references public.trips (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (trip_id, user_id)
);
alter table public.trip_reminders enable row level security; -- server only

create or replace function public.send_trip_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_sent   int := 0;
  v_time   text;
  v_route  text;
begin
  for r in
    -- Each passenger with a confirmed seat, and each driver who has at least one.
    select t.id as trip_id, t.departs_at, t.origin, t.destination, b.passenger_id as user_id,
           false as is_driver, null::int as riders,
           dd.car_model, dd.car_color, dd.plate
      from trips t
      join bookings b on b.trip_id = t.id and b.status = 'accepted'
      left join driver_details dd on dd.driver_id = t.driver_id
     where t.cancelled_at is null and t.started_at is null
       and t.departs_at > now() and t.departs_at <= now() + interval '60 minutes'
    union all
    select t.id, t.departs_at, t.origin, t.destination, t.driver_id,
           true, sum(b.seats)::int, null, null, null
      from trips t
      join bookings b on b.trip_id = t.id and b.status = 'accepted'
     where t.cancelled_at is null and t.started_at is null
       and t.departs_at > now() and t.departs_at <= now() + interval '60 minutes'
     group by t.id
  loop
    insert into trip_reminders (trip_id, user_id) values (r.trip_id, r.user_id)
    on conflict do nothing;
    continue when not found;  -- already reminded

    declare
      v_lang text := coalesce((select language from profiles where id = r.user_id), 'ar');
    begin
      v_time  := to_char(r.departs_at at time zone 'Asia/Hebron', 'HH24:MI');
      v_route := city_name(r.origin, v_lang)
                 || case when v_lang = 'ar' then ' ← ' else ' → ' end
                 || city_name(r.destination, v_lang);
      if r.is_driver then
        perform send_push(
          r.user_id, 'trip_reminder',
          case when v_lang = 'ar' then 'رحلتك تنطلق الساعة ' || v_time else 'Your trip leaves at ' || v_time end,
          case when v_lang = 'ar'
            then v_route || ' · مقاعد محجوزة: ' || r.riders
            else v_route || ' · ' || r.riders || case when r.riders = 1 then ' seat booked' else ' seats booked' end
          end,
          '/trips/requests/' || r.trip_id);
      else
        perform send_push(
          r.user_id, 'trip_reminder',
          case when v_lang = 'ar' then 'رحلتك تنطلق الساعة ' || v_time else 'Your ride leaves at ' || v_time end,
          v_route || coalesce(' · ' || r.car_model || ' ' || r.car_color, '') || coalesce(' · ' || r.plate, ''),
          '/trips/' || r.trip_id);
      end if;
    end;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.send_trip_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('send-trip-reminders', '*/5 * * * *', 'select public.send_trip_reminders()');
  end if;
end $$;
