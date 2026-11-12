-- After flow 02: Amir has asked for a seat on Dana's trip, paying cash.
do $$
declare b record;
begin
  select b2.* into b from public.bookings b2 join public.trips t on t.id = b2.trip_id
   where b2.passenger_id = '00000000-0000-0000-0000-0000000e2e02' and t.driver_id = '00000000-0000-0000-0000-0000000e2e01';
  if not found then raise exception 'CHECK 02: Amir has no booking on Dana''s trip'; end if;
  if b.status::text <> 'requested' then raise exception 'CHECK 02: expected requested, got %', b.status; end if;
  if b.respond_by is null then raise exception 'CHECK 02: the request has no answer-by time'; end if;
  if exists (select 1 from public.payments) then raise exception 'CHECK 02: cash pilot should make no payment rows'; end if;
  raise notice 'CHECK 02 ok: booking % waits until %', b.id, b.respond_by;
end $$;
