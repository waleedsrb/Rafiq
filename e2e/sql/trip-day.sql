-- Between flows 03 and 04: it is now 50 minutes after the trip should have left, and
-- nobody tapped Start. Run the nudge job the way pg_cron does every 5 minutes.
update public.trips set departs_at = now() - interval '50 minutes'
 where driver_id = '00000000-0000-0000-0000-0000000e2e01';

select public.nudge_unstarted_trips() as nudges_sent;

do $$
begin
  if not exists (select 1 from public.notifications
                  where user_id = '00000000-0000-0000-0000-0000000e2e01' and kind = 'trip_overdue') then
    raise exception 'TRIP DAY: Dana was not nudged about her overdue trip';
  end if;
  if not exists (select 1 from public.notifications
                  where user_id = '00000000-0000-0000-0000-0000000e2e02' and kind = 'did_you_ride') then
    raise exception 'TRIP DAY: Amir was not asked "Did you ride?"';
  end if;
  raise notice 'TRIP DAY ok: both nudged';
end $$;
