-- After flow 03: Dana accepted Amir, and both steps are in the booking history.
do $$
declare b record;
begin
  select * into b from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000e2e02';
  if b.status::text <> 'accepted' then raise exception 'CHECK 03: expected accepted, got %', b.status; end if;
  if (select array_agg(to_status::text order by id) from public.booking_events where booking_id = b.id)
     <> array['requested', 'accepted'] then
    raise exception 'CHECK 03: booking history should be requested -> accepted';
  end if;
  if not exists (select 1 from public.notifications where user_id = b.passenger_id and kind = 'accepted') then
    raise exception 'CHECK 03: Amir was not told he is accepted';
  end if;
  raise notice 'CHECK 03 ok: booking % accepted', b.id;
end $$;
