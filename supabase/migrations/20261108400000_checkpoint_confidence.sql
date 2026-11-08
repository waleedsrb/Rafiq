-- Slice 15c: hold to report, trusted reporters, and confirmed vs unconfirmed.
--
-- In the app, reporting is now press-and-hold (1 second), so a stray tap sends nothing.
-- Here in the database, two things change about the status everyone sees:
--
--   1. Track record. Each report gets a weight when it arrives, frozen from that moment:
--      1 for most people. A report "backed up" means someone else reported the same
--      status at the same checkpoint within 15 minutes of it. After 3 backed-up reports
--      in the last 90 days (and at least 3 backed up for every 1 that was contradicted
--      and never backed up), your reports weigh 1 + backed/10, up to 2 at 10.
--      Channel posts weigh 1.
--
--   2. Confirmed. The shown status is the weighted majority of the last 30 minutes, with
--      each person's newest report counted once. It is "confirmed" when at least 2
--      different reporters (a public channel counts as one) said that status in the last
--      30 minutes. One report on its own, or the 2-hour fallback, is "unconfirmed".
--
-- Weight never confirms on its own: a trusted reporter alone is still one voice.

alter table public.checkpoint_reports
  add column weight numeric(3, 2) not null default 1 check (weight between 1 and 2);

-- How much a person's next report counts, from their last 90 days of reports.
create or replace function public.reporter_weight(p_user uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      exists (select 1 from checkpoint_reports o
               where o.checkpoint_id = r.checkpoint_id and o.status = r.status and o.id <> r.id
                 and o.reporter_id is distinct from r.reporter_id
                 and o.created_at between r.created_at - interval '15 minutes' and r.created_at + interval '15 minutes'
      ) as backed,
      exists (select 1 from checkpoint_reports o
               where o.checkpoint_id = r.checkpoint_id and o.status <> r.status
                 and o.reporter_id is distinct from r.reporter_id
                 and o.created_at between r.created_at - interval '15 minutes' and r.created_at + interval '15 minutes'
      ) as contradicted
      from checkpoint_reports r
     where r.reporter_id = p_user
       and r.created_at > now() - interval '90 days'
       and r.created_at < now() - interval '15 minutes'  -- others had time to back it up
  ), tally as (
    select count(*) filter (where backed) as backed,
           count(*) filter (where contradicted and not backed) as wrong
      from mine
  )
  select case when backed >= 3 and backed >= 3 * wrong
              then least(2, 1 + backed / 10.0)
              else 1 end::numeric(3, 2)
    from tally;
$$;
revoke execute on function public.reporter_weight(uuid) from public, anon, authenticated;

create or replace function public.guard_checkpoint_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- The server (the channel job): keep the post's time, but never in the future
    -- and never older than 2 hours (older reports don't count anyway).
    new.created_at := least(greatest(coalesce(new.created_at, now()), now() - interval '2 hours'), now());
    new.weight := 1;
    return new;
  end if;
  new.created_at := now();
  new.channel_ref := null;
  -- One report per person per checkpoint every 5 minutes, so one phone can't flood it.
  if exists (
    select 1 from checkpoint_reports
     where reporter_id = new.reporter_id and checkpoint_id = new.checkpoint_id
       and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'You just reported this checkpoint';
  end if;
  -- A driver whose trip is underway (left up to 3 hours ago, or leaves within the hour).
  new.source := case when exists (
      select 1 from trips
       where driver_id = new.reporter_id and cancelled_at is null
         and departs_at between now() - interval '3 hours' and now() + interval '1 hour'
    ) then 'driver' else 'passenger' end;
  -- Set here, never by the phone.
  new.weight := reporter_weight(new.reporter_id);
  return new;
end;
$$;
revoke execute on function public.guard_checkpoint_report() from public, anon, authenticated;

-- The overview gains two columns, so it is dropped and made again (nothing is stored in it).
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
  agreeing_30m    int                        -- how many different reporters said the shown status
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
    select c.id, c.name_ar, c.name_en, c.road_order,
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
  )
  select
    sh.id, sh.name_ar, sh.name_en, sh.road_order, sh.status,
    (select count(*)::int from recent s
      where s.checkpoint_id = sh.id and s.created_at > now() - interval '30 minutes') as reports_30m,
    (select max(s.created_at) from recent s where s.checkpoint_id = sh.id) as last_report_at,
    (select count(*) from voices v where v.checkpoint_id = sh.id and v.status = sh.status) >= 2 as confirmed,
    (select count(*)::int from voices v where v.checkpoint_id = sh.id and v.status = sh.status) as agreeing_30m
  from shown sh
  order by sh.road_order;
$$;
revoke execute on function public.checkpoint_overview() from public, anon;
grant execute on function public.checkpoint_overview() to authenticated;
