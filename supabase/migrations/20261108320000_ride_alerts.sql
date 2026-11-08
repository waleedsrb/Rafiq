-- Slice 14b: ride alerts ("tell me when a trip like this is posted") and the driver nudge.
--
-- A passenger who finds no free seat taps "Alert me". That saves the search: route plus
-- the time window they were looking at (a day, or a part of a day). When a driver posts a
-- trip in that window (by hand or from a weekly pattern), the passenger gets one push and
-- the alert is done.
--
-- Every open alert is also a record of demand nobody met yet. When 3 people wait for the
-- same route on the same day, drivers who drove that route in the last 30 days get one
-- nudge for that day. Pushes go through send_push() (kinds 'alert_*' follow the
-- person's "Ride alerts" switch).

create table public.ride_alerts (
  id            uuid primary key default gen_random_uuid(),
  passenger_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  origin        public.city not null,
  destination   public.city not null,
  window_from   timestamptz not null,
  window_to     timestamptz not null,
  created_at    timestamptz not null default now(),
  matched_at    timestamptz,                -- set when a matching trip was posted
  matched_trip  uuid references public.trips (id) on delete set null,
  check (origin <> destination),
  check (window_to > window_from and window_to - window_from <= interval '1 day'),
  unique (passenger_id, origin, destination, window_from, window_to)
);
create index ride_alerts_open_idx on public.ride_alerts (origin, destination, window_from) where matched_at is null;

alter table public.ride_alerts enable row level security;
create policy ride_alerts_read   on public.ride_alerts for select to authenticated using (passenger_id = auth.uid());
create policy ride_alerts_insert on public.ride_alerts for insert to authenticated with check (passenger_id = auth.uid());
create policy ride_alerts_delete on public.ride_alerts for delete to authenticated using (passenger_id = auth.uid());

-- One nudge per driver, route and day, however many more people ask.
create table public.ride_alert_nudges (
  driver_id    uuid not null references public.profiles (id) on delete cascade,
  origin       public.city not null,
  destination  public.city not null,
  on_date      date not null,
  created_at   timestamptz not null default now(),
  primary key (driver_id, origin, destination, on_date)
);
alter table public.ride_alert_nudges enable row level security; -- server only

-- "today" / "tomorrow" / "12/11", in Palestine time.
create or replace function public.alert_day_label(p_at timestamptz, p_lang text)
returns text
language sql
stable
set search_path = public
as $$
  select case (p_at at time zone 'Asia/Hebron')::date - (now() at time zone 'Asia/Hebron')::date
    when 0 then case when p_lang = 'ar' then 'اليوم' else 'today' end
    when 1 then case when p_lang = 'ar' then 'غداً' else 'tomorrow' end
    else to_char(p_at at time zone 'Asia/Hebron', 'DD/MM')
  end;
$$;

create or replace function public.alert_route(p_origin public.city, p_destination public.city, p_lang text)
returns text
language sql
stable
set search_path = public
as $$
  select city_name(p_origin, p_lang) || case when p_lang = 'ar' then ' ← ' else ' → ' end || city_name(p_destination, p_lang);
$$;

-- New alerts: checks, then maybe nudge drivers.
create or replace function public.ride_alert_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.window_to <= now() then
    raise exception 'That time has already passed';
  end if;
  if (select count(*) from ride_alerts
       where passenger_id = new.passenger_id and matched_at is null and window_to > now()) >= 10 then
    raise exception 'You already have 10 alerts';
  end if;
  new.created_at := now();
  new.matched_at := null;
  new.matched_trip := null;
  return new;
end;
$$;
create trigger ride_alerts_guard before insert on public.ride_alerts
for each row execute function public.ride_alert_before_insert();

create or replace function public.ride_alert_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day     date := (new.window_from at time zone 'Asia/Hebron')::date;
  v_waiting int;
  d         record;
begin
  select count(distinct passenger_id) into v_waiting
    from ride_alerts
   where origin = new.origin and destination = new.destination and matched_at is null
     and window_to > now() and (window_from at time zone 'Asia/Hebron')::date = v_day;
  if v_waiting < 3 then
    return null;
  end if;
  -- Drivers who drove this route lately, are approved, and haven't been nudged for this day.
  for d in
    select distinct t.driver_id, p.language as lang, p.gender = 'f' as female
      from trips t
      join profiles p on p.id = t.driver_id
      join driver_details dd on dd.driver_id = t.driver_id and dd.verified_at is not null
     where t.origin = new.origin and t.destination = new.destination
       and t.departs_at > now() - interval '30 days'
       and t.driver_id <> new.passenger_id
       and not exists (select 1 from ride_alert_nudges n
                        where n.driver_id = t.driver_id and n.origin = new.origin
                          and n.destination = new.destination and n.on_date = v_day)
  loop
    insert into ride_alert_nudges (driver_id, origin, destination, on_date)
    values (d.driver_id, new.origin, new.destination, v_day);
    perform send_push(
      d.driver_id,
      'alert_driver_nudge',
      case when d.lang = 'ar' then 'ركاب ينتظرون رحلة' else 'Riders are waiting' end,
      case when d.lang = 'ar'
        then v_waiting || ' أشخاص يبحثون عن رحلة ' || alert_route(new.origin, new.destination, 'ar') || ' '
             || alert_day_label(new.window_from, 'ar') || '. ' || case when d.female then 'انشري' else 'انشر' end || ' رحلة؟'
        else v_waiting || ' people want a ride ' || alert_route(new.origin, new.destination, 'en') || ' '
             || alert_day_label(new.window_from, 'en') || '. Post a trip?'
      end,
      '/trips/new'
    );
  end loop;
  return null;
end;
$$;
create trigger ride_alerts_nudge after insert on public.ride_alerts
for each row execute function public.ride_alert_after_insert();

-- A trip is posted: tell everyone whose open alert it fits, once.
create or replace function public.match_ride_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  for a in
    update ride_alerts r set matched_at = now(), matched_trip = new.id
      from profiles p
     where p.id = r.passenger_id
       and r.matched_at is null and r.origin = new.origin and r.destination = new.destination
       and new.departs_at >= r.window_from and new.departs_at < r.window_to
       and r.passenger_id <> new.driver_id
       and (not new.women_only or is_verified_woman(r.passenger_id))  -- only trips they can book
    returning r.passenger_id, p.language as lang
  loop
    perform send_push(
      a.passenger_id,
      'alert_match',
      case when a.lang = 'ar' then 'رحلة جديدة كما طلبت' else 'A trip you asked for' end,
      alert_route(new.origin, new.destination, a.lang) || ' · ' || alert_day_label(new.departs_at, a.lang) || ' '
        || to_char(new.departs_at at time zone 'Asia/Hebron', 'HH24:MI'),
      '/trips/' || new.id
    );
  end loop;
  return null;
end;
$$;
create trigger trips_match_alerts after insert on public.trips
for each row execute function public.match_ride_alerts();

-- For the "Post a trip" screen: how many people wait for this route, per day, this week.
create or replace function public.alert_demand(p_origin public.city, p_destination public.city)
returns table (on_date date, waiting int)
language sql
stable
security definer
set search_path = public
as $$
  select (window_from at time zone 'Asia/Hebron')::date as on_date, count(distinct passenger_id)::int
    from ride_alerts
   where origin = p_origin and destination = p_destination and matched_at is null and window_to > now()
   group by 1
   order by 1
   limit 7;
$$;

revoke execute on function
  public.ride_alert_before_insert(), public.ride_alert_after_insert(), public.match_ride_alerts()
  from public, anon, authenticated;
revoke execute on function public.alert_demand(public.city, public.city) from public, anon;
grant execute on function public.alert_demand(public.city, public.city) to authenticated;
