-- Slice 7: checkpoint status, crowdsourced.
--
-- Riders and drivers report a checkpoint as open, crowded or closed. The status shown
-- is the majority of the last 30 minutes (ties go to the newest report). With nothing
-- in the last 30 minutes we show the newest report of the last 2 hours, with its age,
-- so people can judge how fresh it is. Older than that: "no recent reports".
--
-- Reports are anonymous to other users: they only see when, what, and whether it came
-- from a passenger or a driver on a trip. Later: pings near checkpoints, Telegram channels.

create type public.checkpoint_status as enum ('open', 'crowded', 'closed');

create table public.checkpoints (
  id          text primary key,
  name_ar     text not null,
  name_en     text not null,
  road_order  int  not null,           -- position on the road, Ramallah first
  lat         numeric(9, 6),
  lng         numeric(9, 6)
);
alter table public.checkpoints enable row level security;
create policy checkpoints_read on public.checkpoints for select to authenticated using (true);

-- The Ramallah - Nablus road (Route 60), south to north. Coordinates are approximate.
insert into public.checkpoints (id, name_ar, name_en, road_order, lat, lng) values
  ('atara',        'عطارة',           'Atara',            1, 31.9855, 35.1968),
  ('uyun_haramiya','عيون الحرامية',   'Uyun al-Haramiya', 2, 32.0340, 35.2370),
  ('zaatara',      'زعترة',           'Zaatara',          3, 32.1167, 35.2566),
  ('huwara',       'حوارة',           'Huwara',           4, 32.1530, 35.2560);

create table public.checkpoint_reports (
  id             bigint generated always as identity primary key,
  checkpoint_id  text not null references public.checkpoints (id) on delete cascade,
  reporter_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status         public.checkpoint_status not null,
  source         text not null default 'passenger' check (source in ('passenger', 'driver', 'channel')),
  created_at     timestamptz not null default now()
);
create index checkpoint_reports_recent_idx on public.checkpoint_reports (checkpoint_id, created_at desc);

-- People add their own reports. Nobody reads the table directly (it would show who
-- reported): the two functions below give the shared view.
alter table public.checkpoint_reports enable row level security;
create policy checkpoint_reports_insert on public.checkpoint_reports for insert to authenticated
  with check (reporter_id = auth.uid());

create or replace function public.guard_checkpoint_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  if auth.uid() is null then
    return new; -- the server (e.g. a channel importer) sets source itself
  end if;
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
  return new;
end;
$$;
create trigger checkpoint_reports_guard
before insert on public.checkpoint_reports
for each row execute function public.guard_checkpoint_report();
revoke execute on function public.guard_checkpoint_report() from public, anon, authenticated;

-- Every checkpoint with its current status.
create or replace function public.checkpoint_overview()
returns table (
  id              text,
  name_ar         text,
  name_en         text,
  road_order      int,
  status          public.checkpoint_status,  -- null: no report in the last 2 hours
  reports_30m     int,
  last_report_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name_ar, c.name_en, c.road_order,
    coalesce(
      -- Majority of the last 30 minutes; a tie goes to whichever status was reported last.
      (select r.status from checkpoint_reports r
        where r.checkpoint_id = c.id and r.created_at > now() - interval '30 minutes'
        group by r.status
        order by count(*) desc, max(r.created_at) desc, max(r.id) desc
        limit 1),
      -- Otherwise the newest report of the last 2 hours.
      (select r.status from checkpoint_reports r
        where r.checkpoint_id = c.id and r.created_at > now() - interval '2 hours'
        order by r.created_at desc, r.id desc
        limit 1)
    ) as status,
    (select count(*)::int from checkpoint_reports r
      where r.checkpoint_id = c.id and r.created_at > now() - interval '30 minutes') as reports_30m,
    (select max(r.created_at) from checkpoint_reports r
      where r.checkpoint_id = c.id and r.created_at > now() - interval '2 hours') as last_report_at
  from checkpoints c
  order by c.road_order;
$$;

-- The last hour of reports for one checkpoint, without who sent them.
create or replace function public.checkpoint_recent(p_checkpoint_id text)
returns table (created_at timestamptz, status public.checkpoint_status, source text)
language sql
stable
security definer
set search_path = public
as $$
  select r.created_at, r.status, r.source
    from checkpoint_reports r
   where r.checkpoint_id = p_checkpoint_id and r.created_at > now() - interval '1 hour'
   order by r.created_at desc, r.id desc
   limit 30;
$$;

revoke execute on function public.checkpoint_overview(), public.checkpoint_recent(text) from public, anon;
grant execute on function public.checkpoint_overview(), public.checkpoint_recent(text) to authenticated;
