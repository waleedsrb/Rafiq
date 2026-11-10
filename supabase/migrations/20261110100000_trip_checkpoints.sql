-- Checkpoints on the way (whole West Bank maps, step 3; Nov 10).
--
-- Until now only the Ramallah - Nablus road had checkpoints on a trip, and they came from a
-- fixed road order. Now the driver says which checkpoints the trip passes: when posting,
-- the app suggests the ones near the way and the driver confirms them (Post a trip, step 3
-- of 5). Later the driver can "Change my way" (a closed checkpoint, a detour), and the
-- riders are told. Drive mode adds a checkpoint the car passes that wasn't on the list.
--
-- Older trips keep an empty list; the app falls back to the old Ramallah - Nablus road.
-- Weekly patterns carry the list too, and copy it onto every trip they post.

alter table public.trips       add column checkpoint_ids text[] not null default '{}';
alter table public.trip_series add column checkpoint_ids text[] not null default '{}';

-- Every id must be a real checkpoint, none twice, and a sane number of them.
create or replace function public.check_trip_checkpoints()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if cardinality(new.checkpoint_ids) > 30 then
    raise exception 'too_many_checkpoints';
  end if;
  if cardinality(new.checkpoint_ids) <> (select count(distinct c) from unnest(new.checkpoint_ids) c)
     or exists (select 1 from unnest(new.checkpoint_ids) c where not exists (select 1 from checkpoints k where k.id = c)) then
    raise exception 'bad_checkpoints';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_trip_checkpoints() from public, anon, authenticated;

create trigger trips_checkpoints before insert or update of checkpoint_ids on public.trips
for each row execute function public.check_trip_checkpoints();
create trigger trip_series_checkpoints before insert or update of checkpoint_ids on public.trip_series
for each row execute function public.check_trip_checkpoints();

-- Same generator as before (20261109120000_trip_pickup.sql), now copying the checkpoints.
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
                           pickup_label, pickup_lat, pickup_lng, checkpoint_ids)
        values (s.driver_id, s.origin, s.destination, v_at, s.seats_total, s.price_ils, s.women_only, s.id,
                s.pickup_label, s.pickup_lat, s.pickup_lng, s.checkpoint_ids)
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

-- "Change my way": the driver sets the trip's checkpoints, and every rider who asked for a
-- seat or has one is told (in the inbox, and a push). Works until the trip is finished.
create or replace function public.change_trip_way(p_trip uuid, p_checkpoints text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips;
  r record;
begin
  select * into t from trips where id = p_trip and driver_id = auth.uid() for update;
  if not found then
    raise exception 'not_your_trip';
  end if;
  if t.cancelled_at is not null or t.finished_at is not null then
    raise exception 'trip_over';
  end if;
  if t.checkpoint_ids = coalesce(p_checkpoints, '{}') then
    return;
  end if;
  update trips set checkpoint_ids = coalesce(p_checkpoints, '{}') where id = p_trip;
  for r in
    select b.passenger_id, p.language
      from bookings b join profiles p on p.id = b.passenger_id
     where b.trip_id = p_trip and b.status in ('requested', 'accepted')
  loop
    perform send_push(
      r.passenger_id, 'way_changed',
      case when r.language = 'ar' then 'تغيّرت طريق رحلتك' else 'Your trip''s way changed' end,
      case when r.language = 'ar'
        then 'غيّر السائق الحواجز التي تمرّ بها الرحلة. افتح الرحلة لترى الطريق الجديدة.'
        else 'Your driver changed the checkpoints the trip goes through. Open the trip to see the new way.' end,
      '/trips/' || p_trip);
  end loop;
end;
$$;
revoke execute on function public.change_trip_way(uuid, text[]) from public, anon;
grant execute on function public.change_trip_way(uuid, text[]) to authenticated;

-- Drive mode: the car passed a checkpoint that wasn't on the list (within 200 m), so add it
-- quietly. No message to riders: they are in the car. Only while the trip is on the road.
create or replace function public.add_passed_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update trips t
     set checkpoint_ids = t.checkpoint_ids || array(
           -- Flat-earth distance is plenty at 200 m: 1° latitude ≈ 111 km, 1° longitude ≈ 94 km here.
           select k.id from checkpoints k
            where k.lat is not null and k.lng is not null
              and sqrt(power((k.lat - new.lat) * 111000, 2) + power((k.lng - new.lng) * 94000, 2)) < 200
              and not (k.id = any (t.checkpoint_ids))
            order by k.id)
   where t.id = new.trip_id
     and t.started_at is not null and t.finished_at is null and t.cancelled_at is null
     and cardinality(t.checkpoint_ids) < 30
     and exists (
       select 1 from checkpoints k
        where k.lat is not null and k.lng is not null
          and sqrt(power((k.lat - new.lat) * 111000, 2) + power((k.lng - new.lng) * 94000, 2)) < 200
          and not (k.id = any (t.checkpoint_ids)));
  return null;
end;
$$;
revoke execute on function public.add_passed_checkpoint() from public, anon, authenticated;
create trigger trip_positions_add_checkpoint
after insert or update on public.trip_positions
for each row execute function public.add_passed_checkpoint();
