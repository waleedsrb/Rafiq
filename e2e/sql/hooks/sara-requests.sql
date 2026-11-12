-- Run from flow 03 while Dana is looking at Home: Sara asks for a seat on Dana's trip, the
-- way the app does (request_seat_cash, as Sara). Dana's Home should show it without a
-- refresh (src/lib/live.ts).
begin;
create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000e2e03');
select public.request_seat_cash(
  (select id from public.trips where driver_id = '00000000-0000-0000-0000-0000000e2e01' order by created_at desc limit 1));
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
-- Home shows the request that must be answered first. Keep that Amir's, so the flow knows
-- who it is accepting (near a response-window boundary Sara's could otherwise come first).
-- As the server (no signed-in person), which may set the timing columns.
update public.bookings b set respond_by = a.respond_by + interval '1 minute'
  from public.bookings a
 where b.passenger_id = '00000000-0000-0000-0000-0000000e2e03'
   and a.passenger_id = '00000000-0000-0000-0000-0000000e2e02' and a.trip_id = b.trip_id;
commit;
