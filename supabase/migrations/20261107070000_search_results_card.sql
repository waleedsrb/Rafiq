-- Search results show what the mockups show before booking:
-- the driver's first name + last initial ("Mohammad A.") and the car model.
-- The plate, the colour and the phone number still appear only after acceptance (trip_contact()).
--
-- A function's return columns can't be changed in place, so drop and recreate it.

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
  car_model text
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
    -- First letter of the last word of the name ('' when there is only one word).
    case when position(' ' in trim(p.full_name)) > 0
         then left(regexp_replace(trim(p.full_name), '^.*\s', ''), 1)
         else '' end as driver_last_initial,
    d.car_model
  from trips t
  join profiles p on p.id = t.driver_id
  left join driver_details d on d.driver_id = t.driver_id
  where t.origin = p_origin
    and t.destination = p_destination
    and t.departs_at >= greatest(p_from, now())
    and t.departs_at < p_to
    and t.cancelled_at is null
    and t.driver_id <> auth.uid()          -- don't show me my own trips
  order by t.departs_at;
$$;

revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;
