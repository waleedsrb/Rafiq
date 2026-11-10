-- Checkpoints for the whole West Bank (maps step 4, Nov 10).
--
-- 1. Admins add, fix and hide checkpoints from the admin site (admin_save_checkpoint,
--    admin_hide_checkpoint). Hidden ones keep their reports and follows, and stay on trips
--    that already list them, but disappear from the app's lists, maps and suggestions.
-- 2. checkpoint_overview() also returns where each checkpoint is (lat, lng, governorate,
--    kind), so the Checkpoints tab can group the whole West Bank and the map can show it.
-- 3. Checkpoints on the way become automatic (Waleed, Nov 10): no posting step. Drive mode
--    already notes each checkpoint the car really passes; that now also goes in
--    trips.passed_checkpoint_ids, and learned_checkpoints() hands the last real drive's list
--    to the next post on the same route (yours first, else anyone's).

alter table public.checkpoints add column hidden_at timestamptz;

create or replace function public.admin_save_checkpoint(
  p_id          text,     -- null: a new checkpoint
  p_name_ar     text,
  p_name_en     text,
  p_kind        text,
  p_lat         double precision,
  p_lng         double precision,
  p_governorate text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := nullif(btrim(coalesce(p_id, '')), '');
begin
  if not is_admin() then
    raise exception 'admins_only';
  end if;
  if char_length(btrim(coalesce(p_name_ar, ''))) < 2 or char_length(btrim(coalesce(p_name_en, ''))) < 2 then
    raise exception 'name_needed';
  end if;
  -- Roughly the West Bank, so a swapped lat/lng can't land a checkpoint in the sea.
  if p_lat is null or p_lng is null or p_lat not between 31.2 and 32.7 or p_lng not between 34.8 and 35.7 then
    raise exception 'place_outside';
  end if;
  if v_id is null then
    v_id := 'admin-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    insert into checkpoints (id, name_ar, name_en, kind, lat, lng, governorate, source)
    values (v_id, btrim(p_name_ar), btrim(p_name_en), p_kind, p_lat, p_lng, nullif(btrim(coalesce(p_governorate, '')), ''), 'admin');
  else
    update checkpoints
       set name_ar = btrim(p_name_ar), name_en = btrim(p_name_en), kind = p_kind, lat = p_lat, lng = p_lng,
           governorate = coalesce(nullif(btrim(coalesce(p_governorate, '')), ''), governorate)
     where id = v_id;
    if not found then
      raise exception 'not_found';
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.admin_save_checkpoint(text, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.admin_save_checkpoint(text, text, text, text, double precision, double precision, text) to authenticated;

create or replace function public.admin_hide_checkpoint(p_id text, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'admins_only';
  end if;
  update checkpoints set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;
revoke execute on function public.admin_hide_checkpoint(text, boolean) from public, anon;
grant execute on function public.admin_hide_checkpoint(text, boolean) to authenticated;

-- Same overview as before (20261108400000_checkpoint_confidence.sql), plus where each one is,
-- and without hidden ones. New columns change the return type, so it is dropped and made again.
drop function public.checkpoint_overview();
create function public.checkpoint_overview()
returns table (
  id              text,
  name_ar         text,
  name_en         text,
  road_order      int,
  status          public.checkpoint_status,  -- null: no report in the last 2 hours
  reports_30m     int,
  last_report_at  timestamptz,
  confirmed       boolean,                   -- 2+ different reporters agree in the last 30 minutes
  agreeing_30m    int,                       -- how many different reporters said the shown status
  kind            text,
  governorate     text,
  lat             double precision,
  lng             double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select r.id, r.checkpoint_id, r.status, r.weight, r.created_at,
           coalesce(r.reporter_id::text, 'channel:' || split_part(r.channel_ref, '/', 1)) as who
      from checkpoint_reports r
     where r.created_at > now() - interval '2 hours'
  ),
  -- Each reporter's newest report of the last 30 minutes: one voice each.
  voices as (
    select distinct on (checkpoint_id, who) *
      from recent
     where created_at > now() - interval '30 minutes'
     order by checkpoint_id, who, created_at desc, id desc
  ),
  shown as (
    select c.id, c.name_ar, c.name_en, c.road_order, c.kind, c.governorate, c.lat, c.lng,
      coalesce(
        -- Weighted majority of the last 30 minutes; a tie goes to the status reported last.
        (select v.status from voices v where v.checkpoint_id = c.id
          group by v.status
          order by sum(v.weight) desc, max(v.created_at) desc, max(v.id) desc
          limit 1),
        -- Otherwise the newest report of the last 2 hours.
        (select s.status from recent s where s.checkpoint_id = c.id
          order by s.created_at desc, s.id desc
          limit 1)
      ) as status
      from checkpoints c
     where c.hidden_at is null
  )
  select
    sh.id, sh.name_ar, sh.name_en, sh.road_order, sh.status,
    (select count(*)::int from recent s
      where s.checkpoint_id = sh.id and s.created_at > now() - interval '30 minutes') as reports_30m,
    (select max(s.created_at) from recent s where s.checkpoint_id = sh.id) as last_report_at,
    (select count(*) from voices v where v.checkpoint_id = sh.id and v.status = sh.status) >= 2 as confirmed,
    (select count(*)::int from voices v where v.checkpoint_id = sh.id and v.status = sh.status) as agreeing_30m,
    sh.kind, sh.governorate, sh.lat::double precision, sh.lng::double precision
  from shown sh
  order by sh.road_order nulls last, sh.name_en;
$$;
revoke execute on function public.checkpoint_overview() from public, anon;
grant execute on function public.checkpoint_overview() to authenticated;

alter table public.trips add column passed_checkpoint_ids text[] not null default '{}';

-- Drive mode: a checkpoint the car passes (within 200 m) is noted as passed, and added to the
-- trip's list if it wasn't on it (quietly: the riders are in the car). Hidden ones are skipped.
create or replace function public.add_passed_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_near text[];
begin
  -- Flat-earth distance is plenty at 200 m: 1° latitude ≈ 111 km, 1° longitude ≈ 94 km here.
  select coalesce(array_agg(k.id order by k.id), '{}') into v_near
    from checkpoints k
   where k.lat is not null and k.lng is not null and k.hidden_at is null
     and sqrt(power((k.lat - new.lat) * 111000, 2) + power((k.lng - new.lng) * 94000, 2)) < 200;
  if cardinality(v_near) = 0 then
    return null;
  end if;
  update trips t
     set passed_checkpoint_ids = t.passed_checkpoint_ids
           || array(select c from unnest(v_near) c where not (c = any (t.passed_checkpoint_ids))),
         checkpoint_ids = case when cardinality(t.checkpoint_ids) >= 30 then t.checkpoint_ids
           else t.checkpoint_ids || array(select c from unnest(v_near) c where not (c = any (t.checkpoint_ids))) end
   where t.id = new.trip_id
     and t.started_at is not null and t.finished_at is null and t.cancelled_at is null
     and exists (select 1 from unnest(v_near) c where not (c = any (t.passed_checkpoint_ids)));
  return null;
end;
$$;
revoke execute on function public.add_passed_checkpoint() from public, anon, authenticated;

-- The checkpoints a real drive on this route went through, for the next post: your own
-- latest finished trip on the route first, else anyone's. Empty when nobody has driven it yet
-- (the app then suggests the ones near the way). Hidden checkpoints are left out.
create or replace function public.learned_checkpoints(p_origin public.city, p_destination public.city)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select array(select c from unnest(t.passed_checkpoint_ids) c
                  where exists (select 1 from checkpoints k where k.id = c and k.hidden_at is null))
      from trips t
     where t.origin = p_origin and t.destination = p_destination
       and t.finished_at is not null and cardinality(t.passed_checkpoint_ids) > 0
     order by (t.driver_id = auth.uid()) desc, t.finished_at desc
     limit 1), '{}');
$$;
revoke execute on function public.learned_checkpoints(public.city, public.city) from public, anon;
grant execute on function public.learned_checkpoints(public.city, public.city) to authenticated;
