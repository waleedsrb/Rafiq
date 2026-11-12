-- After flow 04: Amir's answer is saved; the seat is decided when the trip settles.
do $$
declare b record;
begin
  select * into b from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000e2e02';
  if b.rider_answer is distinct from 'rode' then raise exception 'CHECK 04: expected rider_answer rode, got %', b.rider_answer; end if;
  if b.status::text <> 'accepted' then raise exception 'CHECK 04: the seat should stay accepted until the trip settles, got %', b.status; end if;
  raise notice 'CHECK 04 ok: Amir says he rode';
end $$;
