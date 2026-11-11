-- When riders want to go, half hour by half hour, for the time ruler on Post a trip.
--
-- The driver picks a day and slides a ruler to choose the leaving time. Small bars above the
-- ruler show how many people have an open ride alert (not yet matched) that covers each half
-- hour of that day on this route. Slot 0 is 00:00-00:30 Palestine time, slot 47 is 23:30-24:00.
-- Only slots with someone waiting come back, so an empty answer means "no bars".
-- Counts only, never who: the alerts themselves stay private to the rider.

create or replace function public.alert_demand_by_slot(p_origin public.city, p_destination public.city, p_day date)
returns table (slot int, riders int)
language sql
stable
security definer
set search_path = public
as $$
  select s.slot, count(distinct a.passenger_id)::int
    from generate_series(0, 47) as s(slot)
    join ride_alerts a
      on a.origin = p_origin
     and a.destination = p_destination
     and a.matched_at is null
     and a.window_to > now()
     and a.window_from < ((p_day::timestamp + (s.slot + 1) * interval '30 minutes') at time zone 'Asia/Hebron')
     and a.window_to > ((p_day::timestamp + s.slot * interval '30 minutes') at time zone 'Asia/Hebron')
   group by s.slot
   order by s.slot;
$$;

revoke execute on function public.alert_demand_by_slot(public.city, public.city, date) from public, anon;
grant execute on function public.alert_demand_by_slot(public.city, public.city, date) to authenticated;
