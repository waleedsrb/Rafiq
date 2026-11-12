-- After flow 04: Amir's answer is saved (the seat is decided when the trip settles), and
-- his share link for the trip exists.
do $$
declare b record;
begin
  select * into b from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000e2e02';
  if b.rider_answer is distinct from 'rode' then raise exception 'CHECK 04: expected rider_answer rode, got %', b.rider_answer; end if;
  if b.status::text <> 'accepted' then raise exception 'CHECK 04: the seat should stay accepted until the trip settles, got %', b.status; end if;
  if not exists (select 1 from public.trip_shares where trip_id = b.trip_id and created_by = b.passenger_id) then
    raise exception 'CHECK 04: Amir shared the trip but no share link was made';
  end if;
  raise notice 'CHECK 04 ok: Amir shared the trip and says he rode';
end $$;
