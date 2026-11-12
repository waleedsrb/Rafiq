-- After flow 05: "All in · Start" ticked Amir in and started the trip.
do $$
declare t record;
begin
  select * into t from public.trips where driver_id = '00000000-0000-0000-0000-0000000e2e01';
  if t.started_at is null then raise exception 'CHECK 05: the trip did not start'; end if;
  if exists (select 1 from public.bookings where trip_id = t.id and status = 'accepted' and boarded_at is null) then
    raise exception 'CHECK 05: an accepted rider was not ticked in';
  end if;
  raise notice 'CHECK 05 ok: trip % started at %', t.id, t.started_at;
end $$;
