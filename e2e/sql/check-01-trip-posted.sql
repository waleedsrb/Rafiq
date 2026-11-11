-- After flow 01: Dana's trip is in the database as she posted it.
do $$
declare t record;
begin
  select * into t from public.trips where driver_id = '00000000-0000-0000-0000-0000000e2e01';
  if not found then raise exception 'CHECK 01: no trip posted by Dana'; end if;
  if t.origin <> 'osm-n246843686' or t.destination <> 'osm-n293546203' then
    raise exception 'CHECK 01: expected Ramallah -> Nablus, got % -> %', t.origin, t.destination;
  end if;
  if t.departs_at <= now() then raise exception 'CHECK 01: the trip should leave in the future'; end if;
  if coalesce(t.pickup_label, '') = '' then raise exception 'CHECK 01: the trip has no pickup point'; end if;
  if t.seats_total < 1 or t.price_ils <= 0 then raise exception 'CHECK 01: seats or price missing'; end if;
  raise notice 'CHECK 01 ok: trip % leaves %', t.id, t.departs_at;
end $$;
