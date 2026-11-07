-- Slice 15a: checkpoint reports from public Telegram channels.
--
-- A small Python job (bot/) reads public channels, finds lines like "حوارة سالك ✅",
-- and adds them as reports with source 'channel'. They count like any other report
-- (one vote each), so the status everyone sees still comes from checkpoint_overview().
--
-- What changes here:
--   * a channel report has no person behind it, so reporter_id may be empty for it;
--   * channel_ref remembers which post (and which checkpoint in it) a report came from,
--     so running the job twice never counts the same post twice;
--   * the server may keep the post's own time, so a post from 40 minutes ago is not
--     counted as "just now". People's reports still always get now().

alter table public.checkpoint_reports alter column reporter_id drop not null;
alter table public.checkpoint_reports
  add column channel_ref text unique,   -- e.g. 'some_channel/1234/huwara'
  add constraint checkpoint_reports_who check (
    case when source = 'channel'
      then reporter_id is null and channel_ref is not null
      else reporter_id is not null and channel_ref is null
    end
  );

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
  return new;
end;
$$;
revoke execute on function public.guard_checkpoint_report() from public, anon, authenticated;
