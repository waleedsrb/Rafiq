-- Who wants to go when, half hour by half hour, for the time wheels on Post a trip (Nov 11).
--
-- The driver picks a day, and a small chart above the hour and minute wheels shows two things
-- for each half hour of that day on this route:
--   riders  = people with an open ride alert (not yet matched) covering that half hour,
--   drivers = other drivers who already posted a trip leaving in that half hour.
-- Bars go up for riders and down for drivers, so a driver can see a gap ("4 riders, nobody
-- driving") at a glance. Slot 0 is 00:00-00:30 Palestine time, slot 47 is 23:30-24:00.
-- Only slots with someone in them come back. Counts only, never who.
--
-- Replaces alert_demand_by_slot (riders only, from earlier the same day), which the app no
-- longer calls.

drop function if exists public.alert_demand_by_slot(public.city, public.city, date);

create or replace function public.demand_by_slot(p_origin public.city, p_destination public.city, p_day date)
returns table (slot int, riders int, drivers int)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select g.n as slot,
           (p_day::timestamp + g.n * interval '30 minutes') at time zone 'Asia/Hebron' as t0,
           (p_day::timestamp + (g.n + 1) * interval '30 minutes') at time zone 'Asia/Hebron' as t1
      from generate_series(0, 47) as g(n)
  ),
  r as (
    select s.slot, count(distinct a.passenger_id)::int as n
      from s
      join ride_alerts a
        on a.origin = p_origin
       and a.destination = p_destination
       and a.matched_at is null
       and a.window_to > now()
       and a.window_from < s.t1
       and a.window_to > s.t0
     group by s.slot
  ),
  d as (
    select s.slot, count(distinct t.driver_id)::int as n
      from s
      join trips t
        on t.origin = p_origin
       and t.destination = p_destination
       and t.cancelled_at is null
       and t.departs_at >= s.t0
       and t.departs_at < s.t1
       and t.driver_id is distinct from auth.uid()   -- my own trips aren't "other drivers"
     group by s.slot
  )
  select s.slot, coalesce(r.n, 0), coalesce(d.n, 0)
    from s
    left join r on r.slot = s.slot
    left join d on d.slot = s.slot
   where r.n is not null or d.n is not null
   order by s.slot;
$$;

revoke execute on function public.demand_by_slot(public.city, public.city, date) from public, anon;
grant execute on function public.demand_by_slot(public.city, public.city, date) to authenticated;
