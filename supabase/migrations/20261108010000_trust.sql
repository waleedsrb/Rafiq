-- Slice 9: trust you can see. Ratings, trip counts, reliability and the Founding
-- driver badge, computed in one place so every screen shows the same numbers.
--
-- Reliability = of the trips you committed to, the share you showed up for.
--   counts for you:     seats you completed as a passenger, trips you finished as a driver
--   counts against you: passenger no-shows, passenger late cancels (inside 12h),
--                       driver trips cancelled inside 12h of departure with confirmed seats
-- Null until there is at least one of those, so new people aren't shown as 0%.
--
-- Founding driver: the first 100 drivers approved by the admin keep the badge for good.

-- ─── Founding driver ────────────────────────────────────────────────────────
alter table public.driver_details add column founding_at timestamptz;

-- Drivers already approved, in approval order.
update public.driver_details d
   set founding_at = d.verified_at
  from (select driver_id from public.driver_details where verified_at is not null
         order by verified_at limit 100) first
 where first.driver_id = d.driver_id;

create or replace function public.set_founding_driver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.founding_at := old.founding_at;   -- nobody edits it directly, and it is never lost
  else
    new.founding_at := null;
  end if;
  if new.founding_at is null and new.verified_at is not null
     and (select count(*) from driver_details where founding_at is not null) < 100 then
    new.founding_at := now();
  end if;
  return new;
end;
$$;
create trigger driver_details_founding
before insert or update on public.driver_details
for each row execute function public.set_founding_driver();
revoke execute on function public.set_founding_driver() from public, anon, authenticated;

-- ─── Stats for many people at once (Results lists several drivers) ──────────
create or replace function public.people_stats(p_people uuid[])
returns table (
  person_id        uuid,
  completed_trips  int,       -- as passenger + as driver
  rating_avg       numeric,   -- 1 decimal, null with no ratings
  rating_count     int,
  reliability      numeric,   -- 0..1, 2 decimals, null with no history
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select distinct unnest(p_people) as id
  ),
  as_passenger as (
    select b.passenger_id as id,
           count(*) filter (where b.status = 'completed') as good,
           count(*) filter (where b.status = 'no_show' or (b.status = 'cancelled' and b.cancelled_late)) as bad
      from bookings b
     where b.passenger_id in (select id from people)
     group by b.passenger_id
  ),
  as_driver as (
    select t.driver_id as id,
           count(*) filter (where t.finished_at is not null
                              and exists (select 1 from bookings b where b.trip_id = t.id and b.status = 'completed')) as good,
           count(*) filter (where t.cancelled_at is not null and t.cancelled_at > t.departs_at - interval '12 hours'
                              and exists (select 1 from bookings b join booking_events e on e.booking_id = b.id
                                           where b.trip_id = t.id and e.from_status = 'accepted'
                                             and e.to_status = 'cancelled')) as bad
      from trips t
     where t.driver_id in (select id from people)
     group by t.driver_id
  ),
  rated as (
    select ratee_id as id, round(avg(stars), 1) as avg_stars, count(*)::int as n
      from ratings
     where ratee_id in (select id from people)
     group by ratee_id
  )
  select p.id,
         (coalesce(ap.good, 0) + coalesce(ad.good, 0))::int,
         r.avg_stars,
         coalesce(r.n, 0),
         case when coalesce(ap.good, 0) + coalesce(ad.good, 0) + coalesce(ap.bad, 0) + coalesce(ad.bad, 0) = 0 then null
              else round((coalesce(ap.good, 0) + coalesce(ad.good, 0))::numeric
                   / (coalesce(ap.good, 0) + coalesce(ad.good, 0) + coalesce(ap.bad, 0) + coalesce(ad.bad, 0)), 2) end,
         exists (select 1 from driver_details d where d.driver_id = p.id and d.founding_at is not null)
    from people p
    left join as_passenger ap on ap.id = p.id
    left join as_driver ad on ad.id = p.id
    left join rated r on r.id = p.id;
$$;

-- One person (profile pages). Same numbers.
create or replace function public.person_stats(p_person uuid)
returns table (
  completed_trips  int,
  rating_avg       numeric,
  rating_count     int,
  reliability      numeric,
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select completed_trips, rating_avg, rating_count, reliability, founding_driver
    from people_stats(array[p_person]);
$$;

-- Recent reviews of a person. Notes were written "only for" the person rated,
-- so other people get the stars and tags, never the note.
create or replace function public.person_reviews(p_person uuid, p_limit int default 10)
returns table (
  stars             int,
  tags              text[],
  note              text,
  created_at        timestamptz,
  rater_first_name  text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.stars, r.tags,
         case when p_person = auth.uid() then r.note end,
         r.created_at,
         split_part(p.full_name, ' ', 1)
    from ratings r
    join profiles p on p.id = r.rater_id
   where r.ratee_id = p_person
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Search results know trips, not drivers (search_trips hides driver ids), so this
-- gives each listed trip its driver's stats.
create or replace function public.trips_driver_stats(p_trip_ids uuid[])
returns table (
  trip_id          uuid,
  completed_trips  int,
  rating_avg       numeric,
  rating_count     int,
  reliability      numeric,
  founding_driver  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, s.completed_trips, s.rating_avg, s.rating_count, s.reliability, s.founding_driver
    from trips t
    join people_stats(array(select driver_id from trips where id = any(p_trip_ids))) s on s.person_id = t.driver_id
   where t.id = any(p_trip_ids);
$$;

revoke execute on function public.people_stats(uuid[]), public.person_stats(uuid), public.person_reviews(uuid, int),
  public.trips_driver_stats(uuid[]) from public, anon;
grant execute on function public.people_stats(uuid[]), public.person_stats(uuid), public.person_reviews(uuid, int),
  public.trips_driver_stats(uuid[]) to authenticated;
