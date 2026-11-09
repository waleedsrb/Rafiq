-- Pickup point: where the driver meets riders (Nov 9, driver flow redesign).
--
-- Until now every trip started at one fixed square per city (src/lib/places.ts). A driver
-- now picks the spot when posting: a pin on the map plus a short label riders read
-- ("Al-Manara Square, in front of the bakery"). Older trips keep null and show the city square.
-- Weekly patterns carry the pickup too, and copy it onto every trip they post.

alter table public.trips
  add column pickup_label text check (pickup_label is null or char_length(btrim(pickup_label)) between 2 and 80),
  add column pickup_lat   double precision check (pickup_lat is null or pickup_lat between -90 and 90),
  add column pickup_lng   double precision check (pickup_lng is null or pickup_lng between -180 and 180),
  add constraint trips_pickup_complete check (
    (pickup_label is null and pickup_lat is null and pickup_lng is null)
    or (pickup_label is not null and pickup_lat is not null and pickup_lng is not null)
  );

alter table public.trip_series
  add column pickup_label text check (pickup_label is null or char_length(btrim(pickup_label)) between 2 and 80),
  add column pickup_lat   double precision check (pickup_lat is null or pickup_lat between -90 and 90),
  add column pickup_lng   double precision check (pickup_lng is null or pickup_lng between -180 and 180),
  add constraint trip_series_pickup_complete check (
    (pickup_label is null and pickup_lat is null and pickup_lng is null)
    or (pickup_label is not null and pickup_lat is not null and pickup_lng is not null)
  );

-- Same generator as before (20261108310000_recurring_trips.sql), now copying the pickup.
create or replace function public.generate_series_trips(p_series_id uuid default null, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  d        date;
  v_at     timestamptz;
  v_added  int := 0;
  v_count  int;
begin
  for s in
    select ts.* from trip_series ts
      join driver_details dd on dd.driver_id = ts.driver_id and dd.verified_at is not null
     where ts.stopped_at is null and (p_series_id is null or ts.id = p_series_id)
       and posting_paused_until(ts.driver_id) is null
  loop
    for d in
      select g::date from generate_series(
        (now() at time zone s.time_zone)::date,
        (now() at time zone s.time_zone)::date + (p_days - 1),
        interval '1 day') g
    loop
      continue when extract(dow from d)::smallint <> all (s.weekdays);
      v_at := (d + s.depart_time) at time zone s.time_zone;
      continue when v_at < now() + interval '1 hour';
      begin
        insert into trips (driver_id, origin, destination, departs_at, seats_total, price_ils, women_only, series_id,
                           pickup_label, pickup_lat, pickup_lng)
        values (s.driver_id, s.origin, s.destination, v_at, s.seats_total, s.price_ils, s.women_only, s.id,
                s.pickup_label, s.pickup_lat, s.pickup_lng)
        on conflict (series_id, departs_at) where series_id is not null do nothing;
        get diagnostics v_count = row_count;
        v_added := v_added + v_count;
      exception when others then
        raise warning 'series % skipped %: %', s.id, d, sqlerrm;
      end;
    end loop;
  end loop;
  return v_added;
end;
$$;
revoke execute on function public.generate_series_trips(uuid, int) from public, anon, authenticated;

-- Spots drivers often use in a city, most used first, for the "Where do you meet riders?"
-- step. Counted over the last 90 days of posted trips; spots within ~20 m count as one.
create or replace function public.popular_pickups(p_city public.city, p_limit int default 3)
returns table (label text, lat double precision, lng double precision, uses bigint)
language sql
stable
security definer
set search_path = public
as $$
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
