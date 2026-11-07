-- Slice 10b: a person's public page, and a driver's earnings.
--
-- public_profile(): what anyone signed in may see about a driver or passenger before
-- riding with them. Never the phone or the plate (those appear only after acceptance,
-- see trip_contact()). driver_details stays private; this function picks the safe columns.
--
-- my_earnings(): the signed-in driver's finished trips in a period, with what they earned.
-- During the cash pilot (settings.cash_only = 1) that is price × seats for every passenger
-- who rode: the money changed hands in the car, and a no-show paid nothing.
-- With a card gateway it is the fare actually charged, so a no-show's fare counts too.

create or replace function public.public_profile(p_person uuid)
returns table (
  full_name        text,
  id_verified      boolean,
  member_since     timestamptz,
  deleted          boolean,
  car_model        text,
  car_color        text,
  driver_verified  boolean,
  driving_since    timestamptz,
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.full_name,
         p.id_verified_at is not null,
         p.created_at,
         p.deleted_at is not null,
         d.car_model,
         d.car_color,
         d.verified_at is not null,
         -- "Driving since" = their first trip, or when the driver check was approved.
         coalesce((select min(t.departs_at) from trips t where t.driver_id = p.id and t.cancelled_at is null), d.verified_at),
         d.founding_at is not null
    from profiles p
    left join driver_details d on d.driver_id = p.id
   where p.id = p_person;
$$;
revoke execute on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;

create or replace function public.my_earnings(p_from timestamptz, p_to timestamptz)
returns table (
  trip_id      uuid,
  origin       public.city,
  destination  public.city,
  departs_at   timestamptz,
  riders       int,      -- passengers who rode
  no_shows     int,
  earned_ils   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.origin, t.destination, t.departs_at,
         coalesce(sum(b.seats) filter (where b.status = 'completed'), 0)::int,
         count(*) filter (where b.status = 'no_show')::int,
         case when coalesce((select s.value = 1 from settings s where s.key = 'cash_only'), false)
           then coalesce(sum(t.price_ils * b.seats) filter (where b.status = 'completed'), 0)
           else coalesce(sum(pay.fare_ils) filter (where pay.status = 'charged' and b.status in ('completed', 'no_show')), 0)
         end
    from trips t
    join bookings b on b.trip_id = t.id and b.status in ('completed', 'no_show')
    left join payments pay on pay.booking_id = b.id
   where t.driver_id = auth.uid()
     and t.finished_at is not null
     and t.departs_at >= p_from and t.departs_at < p_to
   group by t.id
   order by t.departs_at desc;
$$;
revoke execute on function public.my_earnings(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_earnings(timestamptz, timestamptz) to authenticated;
