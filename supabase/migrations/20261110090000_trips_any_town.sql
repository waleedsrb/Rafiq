-- Whole West Bank, step 2: a trip can go between any two West Bank towns, not just Ramallah
-- and Nablus. (Step 1, 20261109180000_places.sql, added the places table.)
--
-- Until now public.city was an enum with two values. It becomes a text domain that holds a
-- place id ('osm-n246843686' is Ramallah). Keeping the name "city" means every column and
-- function keeps its meaning; only what goes inside changes.
--
-- This one changes column types, so it is not additive: paste it in the SQL Editor.
--
-- Mentor note: why a domain and not plain text? A domain is a named type built on another
-- one. It documents intent ("this text is a place id") and lets function signatures stay
-- the same, so the app's calls keep working.

-- 1. Functions whose arguments or results use the enum must go before the type can change.
drop function if exists public.alert_route(public.city, public.city, text);
drop function if exists public.alert_demand(public.city, public.city);
drop function if exists public.search_trips(public.city, public.city, timestamptz, timestamptz);
drop function if exists public.popular_pickups(public.city, int);
drop function if exists public.my_earnings(timestamptz, timestamptz);
drop function if exists public.shared_trip(text);
drop function if exists public.city_name(public.city, text);

-- 2. Swap the type: old enum aside, new domain in.
alter type public.city rename to city_v1;
create domain public.city as text;

-- The two old values map to their OpenStreetMap places.
create function pg_temp.place_of(c public.city_v1) returns text language sql immutable as $$
  select case c::text when 'ramallah' then 'osm-n246843686' when 'nablus' then 'osm-n293546203' else c::text end
$$;

alter table public.trips
  alter column origin type public.city using pg_temp.place_of(origin),
  alter column destination type public.city using pg_temp.place_of(destination);
alter table public.trip_series
  alter column origin type public.city using pg_temp.place_of(origin),
  alter column destination type public.city using pg_temp.place_of(destination);
alter table public.ride_alerts
  alter column origin type public.city using pg_temp.place_of(origin),
  alter column destination type public.city using pg_temp.place_of(destination);
alter table public.ride_alert_nudges
  alter column origin type public.city using pg_temp.place_of(origin),
  alter column destination type public.city using pg_temp.place_of(destination);

drop function pg_temp.place_of(public.city_v1);
drop type public.city_v1;

-- Every origin and destination must be a real place...
alter table public.trips
  add constraint trips_origin_place foreign key (origin) references public.places (id),
  add constraint trips_destination_place foreign key (destination) references public.places (id);
alter table public.trip_series
  add constraint trip_series_origin_place foreign key (origin) references public.places (id),
  add constraint trip_series_destination_place foreign key (destination) references public.places (id);
alter table public.ride_alerts
  add constraint ride_alerts_origin_place foreign key (origin) references public.places (id),
  add constraint ride_alerts_destination_place foreign key (destination) references public.places (id);

-- ...and a West Bank one. Settlements, East Jerusalem and places outside show up in search,
-- flagged, but nobody can post, book or ask for a trip to them.
create or replace function public.check_trip_places()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from places where id = new.origin and region = 'west_bank')
     or not exists (select 1 from places where id = new.destination and region = 'west_bank') then
    raise exception 'place_not_allowed' using hint = 'Trips start and end in West Bank towns.';
  end if;
  return new;
end $$;
create trigger trips_places_check before insert or update of origin, destination on public.trips
  for each row execute function public.check_trip_places();
create trigger trip_series_places_check before insert or update of origin, destination on public.trip_series
  for each row execute function public.check_trip_places();
create trigger ride_alerts_places_check before insert or update of origin, destination on public.ride_alerts
  for each row execute function public.check_trip_places();

-- 3. The functions again.

-- A place's name in a language, for push messages and the share page.
create function public.city_name(c public.city, lang text)
returns text language sql stable set search_path = public as $$
  select coalesce((select case when lang = 'ar' then p.name_ar else p.name_en end from places p where p.id = c), c::text)
$$;

-- Straight-line distance in km between two places (same flat-earth sum as search_places:
-- good to a few hundred metres at this size).
create or replace function public.place_km(a public.city, b public.city)
returns numeric language sql stable set search_path = public as $$
  select round((sqrt(power((pa.lat - pb.lat) * 111.0, 2) + power((pa.lng - pb.lng) * 94.5, 2)))::numeric, 1)
    from places pa, places pb where pa.id = a and pb.id = b
$$;

create function public.alert_route(p_origin public.city, p_destination public.city, p_lang text)
returns text language sql stable set search_path = public as $$
  select city_name(p_origin, p_lang) || case when p_lang = 'ar' then ' ← ' else ' → ' end || city_name(p_destination, p_lang);
$$;

create function public.alert_demand(p_origin public.city, p_destination public.city)
returns table (on_date date, waiting int)
language sql stable security definer set search_path = public as $$
  select (window_from at time zone 'Asia/Hebron')::date as on_date, count(distinct passenger_id)::int
    from ride_alerts
   where origin = p_origin and destination = p_destination and matched_at is null and window_to > now()
   group by 1
   order by 1
   limit 7;
$$;
revoke execute on function public.alert_demand(public.city, public.city) from public, anon;
grant execute on function public.alert_demand(public.city, public.city) to authenticated;

-- Search: the exact towns first, then trips that start and end near them (within 15 km
-- each), with how far. Adds origin, destination and both distances to each row.
create function public.search_trips(p_origin public.city, p_destination public.city, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, departs_at timestamptz, seats_total int, seats_left int, price_ils numeric,
  driver_first_name text, driver_last_initial text, car_model text, driver_verified boolean, women_only boolean,
  origin public.city, destination public.city, origin_km numeric, destination_km numeric
)
language sql stable security definer set search_path = public as $$
  with near as (
    select t.*, place_km(p_origin, t.origin) as o_km, place_km(p_destination, t.destination) as d_km
      from trips t
     where t.departs_at >= greatest(p_from, now())
       and t.departs_at < p_to
       and t.cancelled_at is null
       and t.driver_id <> auth.uid()          -- don't show me my own trips
       and (not t.women_only or is_verified_woman(auth.uid()))
  )
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
    t.women_only,
    t.origin, t.destination, t.o_km, t.d_km
  from near t
  join profiles p on p.id = t.driver_id
  left join driver_details d on d.driver_id = t.driver_id
  where t.o_km <= 15 and t.d_km <= 15
  order by (t.o_km = 0 and t.d_km = 0) desc, t.departs_at;
$$;
revoke execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_trips(public.city, public.city, timestamptz, timestamptz) to authenticated;

create function public.popular_pickups(p_city public.city, p_limit int default 3)
returns table (label text, lat double precision, lng double precision, uses bigint)
language sql stable security definer set search_path = public as $$
  select (array_agg(btrim(t.pickup_label) order by t.created_at desc))[1] as label,
         avg(t.pickup_lat) as lat,
         avg(t.pickup_lng) as lng,
         count(*) as uses
    from trips t
   where t.origin = p_city
     and t.pickup_lat is not null
     and t.created_at > now() - interval '90 days'
   group by round(t.pickup_lat::numeric, 4), round(t.pickup_lng::numeric, 4)
   order by count(*) desc, max(t.created_at) desc
   limit least(greatest(p_limit, 1), 10);
$$;
revoke execute on function public.popular_pickups(public.city, int) from public, anon;
grant execute on function public.popular_pickups(public.city, int) to authenticated;

create function public.my_earnings(p_from timestamptz, p_to timestamptz)
returns table (trip_id uuid, origin public.city, destination public.city, departs_at timestamptz, riders int, no_shows int, earned_ils numeric)
language sql stable security definer set search_path = public as $$
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

-- The share page also gets the place names, so it no longer needs its own list of cities.
create function public.shared_trip(p_token text)
returns table (
  origin public.city, destination public.city, departs_at timestamptz, started_at timestamptz, finished_at timestamptz,
  cancelled_at timestamptz, sharer_name text, driver_name text, car_model text, car_color text, plate text,
  lat numeric, lng numeric, position_at timestamptz,
  origin_ar text, origin_en text, destination_ar text, destination_en text
)
language sql stable security definer set search_path = public as $$
  select t.origin, t.destination, t.departs_at, t.started_at, t.finished_at, t.cancelled_at,
         split_part(sp.full_name, ' ', 1),
         split_part(dp.full_name, ' ', 1),
         d.car_model, d.car_color, d.plate,
         pos.lat, pos.lng, pos.recorded_at,
         city_name(t.origin, 'ar'), city_name(t.origin, 'en'),
         city_name(t.destination, 'ar'), city_name(t.destination, 'en')
    from trip_shares s
    join trips t on t.id = s.trip_id
    join profiles sp on sp.id = s.created_by
    join profiles dp on dp.id = t.driver_id
    left join driver_details d on d.driver_id = t.driver_id
    left join trip_positions pos on pos.trip_id = t.id
   where s.token = p_token
     and coalesce(t.finished_at, t.cancelled_at, 'infinity'::timestamptz) > now() - interval '2 hours';
$$;
revoke execute on function public.shared_trip(text) from public;
grant execute on function public.shared_trip(text) to anon, authenticated;
