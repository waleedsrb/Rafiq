-- After flow 03: Dana accepted Amir and declined Sara, both steps are in each booking's
-- history, and each of them was told.
do $$
declare b record; s record;
begin
  select * into b from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000e2e02';
  if b.status::text <> 'accepted' then raise exception 'CHECK 03: expected Amir accepted, got %', b.status; end if;
  if (select array_agg(to_status::text order by id) from public.booking_events where booking_id = b.id)
     <> array['requested', 'accepted'] then
    raise exception 'CHECK 03: Amir''s history should be requested -> accepted';
  end if;
  if not exists (select 1 from public.notifications where user_id = b.passenger_id and kind = 'accepted') then
    raise exception 'CHECK 03: Amir was not told he is accepted';
  end if;
  select * into s from public.bookings where passenger_id = '00000000-0000-0000-0000-0000000e2e03';
  if s.status::text <> 'declined' then raise exception 'CHECK 03: expected Sara declined, got %', s.status; end if;
  if not exists (select 1 from public.notifications where user_id = s.passenger_id and kind = 'declined') then
    raise exception 'CHECK 03: Sara was not told';
  end if;
  raise notice 'CHECK 03 ok: Amir accepted, Sara declined';
end $$;
