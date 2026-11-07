-- Search for trips on a route within a time window, with seats left and the
-- driver's first name. One call instead of one call per trip.
--
-- security definer because seats_left needs to count other people's bookings,
-- which RLS hides from the caller. It returns only counts and first names.
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
    and t.driver_id <> auth.uid()          -- don't show me my own trips
  order by t.departs_at;
$$;

revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;
