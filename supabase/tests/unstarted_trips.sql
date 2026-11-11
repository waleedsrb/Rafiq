-- Checks trips that never start: rider answers, the driver's "didn't happen", nudges,
-- and how settle_unstarted_trips() decides every combination.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected an error containing "%" from: %', needle, sql;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
  if sqlerrm not like '%' || needle || '%' then
    raise exception 'FAIL: expected "%", got "%" from: %', needle, sqlerrm, sql;
  end if;
end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
end $$;

-- d = driver Dana (f). Riders r1..r4.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a4');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil', 'm', 'en'),
  ('00000000-0000-0000-0000-0000000000a4', 'Lina Odeh', 'f', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
insert into public.push_tokens (token, user_id) values
  ('ExponentPushToken[dana]', '00000000-0000-0000-0000-00000000000d'),
  ('ExponentPushToken[amir]', '00000000-0000-0000-0000-0000000000a1'),
  ('ExponentPushToken[aya]',  '00000000-0000-0000-0000-0000000000a2'),
  ('ExponentPushToken[omar]', '00000000-0000-0000-0000-0000000000a3'),
  ('ExponentPushToken[lina]', '00000000-0000-0000-0000-0000000000a4');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();

-- Trips t1..t7, two days ahead so seats can be requested.
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils)
select ('00000000-0000-0000-0000-0000000000f' || n)::uuid, '00000000-0000-0000-0000-00000000000d',
       'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 4, 25
  from generate_series(1, 7) n;

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
create temp table ids (trip int, rider int, booking uuid, primary key (trip, rider));
grant all on ids to authenticated;
create function pg_temp.trip(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000f' || n)::uuid $$;
create function pg_temp.rider(n int) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000a' || n)::uuid $$;
create function pg_temp.bk(t int, r int) returns uuid language sql as $$
  select booking from ids where trip = t and rider = r $$;
create function pg_temp.st(t int, r int) returns text language sql as $$
  select status::text from public.bookings where id = pg_temp.bk(t, r) $$;
create function pg_temp.pushes(kind text) returns int language sql as $$
  select count(*)::int from net.sent, jsonb_array_elements(body) m where m->'data'->>'kind' = kind $$;
create function pg_temp.answer(t int, r int, a text) returns void language plpgsql as $$
begin
  perform pg_temp.as_user(pg_temp.rider(r));
  perform public.answer_ride(pg_temp.bk(t, r), a);
end $$;
set local role authenticated;

-- Seats: t1 r1-r4, t2 r1-r2, t3 r1-r2, t4 r1, t5 r1, t6 r1-r3, t7 r1-r2. All accepted.
do $$
declare p record;
begin
  for p in select * from (values (1,1),(1,2),(1,3),(1,4),(2,1),(2,2),(3,1),(3,2),(4,1),(5,1),
                                 (6,1),(6,2),(6,3),(7,1),(7,2)) v(t, r) loop
    perform pg_temp.as_user(pg_temp.rider(p.r));
    insert into ids values (p.t, p.r, public.request_seat(pg_temp.trip(p.t), 'tok_fake_4242', 'visa', '4242'));
  end loop;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id in (select booking from ids);

-- 1. Phones can't write answers or reasons directly, and can't set the new outcomes.
select pg_temp.as_user(pg_temp.rider(1));
update public.bookings set rider_answer = 'rode' where id = pg_temp.bk(1, 1);
select pg_temp.check((select rider_answer is null from public.bookings where id = pg_temp.bk(1, 1)), 'answer ignores direct edits');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$update public.bookings set status = 'not_confirmed' where id = pg_temp.bk(1, 1)$$, 'Only the system');
select pg_temp.expect_error($$update public.trips set no_go_reason = 'nobody_came' where id = pg_temp.trip(1)$$, 'Use Start trip');

-- 2. Too early, two days ahead.
select pg_temp.expect_error($$select pg_temp.answer(1, 1, 'rode')$$, 'Wait until the departure');
select pg_temp.expect_error($$select pg_temp.answer(1, 1, 'in_car')$$, 'Too early');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.trip_did_not_happen(pg_temp.trip(1), 'nobody_came')$$, 'cancel the trip instead');
select pg_temp.as_user(pg_temp.rider(2));
select pg_temp.expect_error($$select public.answer_ride(pg_temp.bk(1, 1), 'rode')$$, 'No confirmed seat');
select pg_temp.expect_error($$select pg_temp.answer(1, 2, 'maybe')$$, 'Unknown answer');

-- Every trip left an hour ago. Nobody tapped Start.
reset role;
select pg_temp.as_user(null);
update public.trips set departs_at = now() - interval '50 minutes' where id in (select pg_temp.trip(n) from generate_series(1, 7) n);
set local role authenticated;

-- 3. Nudges: drivers at +15 min, riders at +45 min, once each.
reset role;
select pg_temp.as_user(null);
select pg_temp.check(public.nudge_unstarted_trips() = 7 + 15, 'seven driver nudges and fifteen rider questions');
select pg_temp.check(public.nudge_unstarted_trips() = 0, 'nobody is nudged twice');
select pg_temp.check(pg_temp.pushes('did_you_ride') = 15, 'riders asked');
select pg_temp.check((select m->>'title' from net.sent, jsonb_array_elements(body) m
                       where m->'data'->>'kind' = 'did_you_ride' and m->>'to' = 'ExponentPushToken[amir]' limit 1)
                     = 'هل ركبت مع Dana؟', 'Arabic for Amir');
set local role authenticated;

-- 4. t1: driver silent. r1 rode, r2 says the driver didn't come, r3 didn't go, r4 silent.
select pg_temp.answer(1, 1, 'rode');
select pg_temp.answer(1, 2, 'driver_absent');
select pg_temp.answer(1, 3, 'didnt_go');
-- 5. t2: driver silent. r1 says the driver didn't come, r2 silent.
select pg_temp.answer(2, 1, 'driver_absent');
-- 6. t3: nobody came, but r1 says they rode; r2 silent.
select pg_temp.answer(3, 1, 'rode');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.trip_did_not_happen(pg_temp.trip(3), 'nobody_came');
select pg_temp.expect_error($$select public.trip_did_not_happen(pg_temp.trip(3), 'whatever')$$, 'Unknown reason');
-- 7. t4: couldn't go, and the only rider agrees (says the driver didn't come): settles early.
select public.trip_did_not_happen(pg_temp.trip(4), 'couldnt_go');
select pg_temp.answer(4, 1, 'driver_absent');
-- 8. t5: checkpoint closed (needs a closed report).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.trip_did_not_happen(pg_temp.trip(5), 'checkpoint_closed')$$, 'No closed checkpoint');
select pg_temp.as_user(pg_temp.rider(1));
insert into public.checkpoint_reports (checkpoint_id, reporter_id, status)
values ('zaatara', '00000000-0000-0000-0000-0000000000a1', 'closed');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.trip_did_not_happen(pg_temp.trip(5), 'checkpoint_closed');
reset role;
select pg_temp.check(pg_temp.pushes('trip_no_go') = 4, 'riders told at once (t3 x2, t4, t5)');
set local role authenticated;
-- 9. t6: r1 says "in the car", r2 says the driver didn't come; the driver taps All in · Start.
select pg_temp.answer(6, 1, 'in_car');
select pg_temp.check((select boarded_at is not null and here_at is not null from public.bookings where id = pg_temp.bk(6, 1)),
  'in the car ticks you on the pickup list');
select pg_temp.answer(6, 2, 'driver_absent');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.trip_did_not_happen(pg_temp.trip(7), 'nobody_came')$$, 'marked someone')
  from (select public.mark_boarded(pg_temp.bk(7, 1))) x;
select public.start_trip_all_in(pg_temp.trip(6));
select pg_temp.check((select started_at is not null from public.trips where id = pg_temp.trip(6)), 'all in starts the trip');
select pg_temp.as_user(pg_temp.rider(3));
select pg_temp.expect_error($$select pg_temp.answer(6, 3, 'rode')$$, 'already started');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.finish_trip(pg_temp.trip(6));
select pg_temp.check(pg_temp.st(6, 1) = 'completed' and pg_temp.st(6, 3) = 'completed', 't6 riders completed');
select pg_temp.check(pg_temp.st(6, 2) = 'disputed', 'ticked in but says the driver never came: disputed');

-- 10. Settle: only t4 is ready (driver and every rider answered); the rest wait for +3 h.
reset role;
select pg_temp.as_user(null);
select pg_temp.check(public.settle_unstarted_trips() = 1, 'only t4 settles early');
select pg_temp.check(pg_temp.st(4, 1) = 'cancelled', 't4 seat cancelled');
select pg_temp.check((select cancelled_late and cancel_reason = 'couldnt_go' from public.trips where id = pg_temp.trip(4)),
  'couldn''t go is a late cancel');
update public.trips set departs_at = now() - interval '3 hours 5 minutes' where id in (select pg_temp.trip(n) from generate_series(1, 7) n) and started_at is null;
select pg_temp.check(public.settle_unstarted_trips() = 4 + 2 + 2 + 1 + 2, 't1, t2, t3, t5, t7 settle');

-- t1
select pg_temp.check(pg_temp.st(1, 1) = 'completed', 't1 r1 rode: completed');
select pg_temp.check(pg_temp.st(1, 2) = 'disputed', 't1 r2 driver absent while r1 rode: disputed');
select pg_temp.check(pg_temp.st(1, 3) = 'no_show', 't1 r3 didn''t go: no-show');
select pg_temp.check(pg_temp.st(1, 4) = 'not_confirmed', 't1 r4 silent: not confirmed');
select pg_temp.check((select finished_at is not null and cancelled_at is null from public.trips where id = pg_temp.trip(1)), 't1 happened');
-- t2
select pg_temp.check(pg_temp.st(2, 1) = 'cancelled' and pg_temp.st(2, 2) = 'not_confirmed', 't2 seats');
select pg_temp.check((select cancelled_late and cancel_reason = 'driver_absent' from public.trips where id = pg_temp.trip(2)),
  't2 is the driver''s late cancel');
-- t3
select pg_temp.check(pg_temp.st(3, 1) = 'disputed' and pg_temp.st(3, 2) = 'no_show', 't3 seats');
select pg_temp.check((select not cancelled_late and cancel_reason = 'nobody_came' from public.trips where id = pg_temp.trip(3)), 't3 not late');
-- t5
select pg_temp.check(pg_temp.st(5, 1) = 'cancelled', 't5 seat cancelled');
select pg_temp.check((select not cancelled_late and cancel_reason = 'checkpoint_closed' from public.trips where id = pg_temp.trip(5)), 't5 excused');
-- t7: the driver ticked r1, r2 silent.
select pg_temp.check(pg_temp.st(7, 1) = 'completed' and pg_temp.st(7, 2) = 'not_confirmed', 't7 seats');

-- 11. Nobody hears "trip cancelled, find another one" hours later, and r3 isn't told they missed it.
select pg_temp.check(pg_temp.pushes('trip_cancelled') = 0, 'no late cancel pushes from settling');
select pg_temp.check((select count(*) from net.sent, jsonb_array_elements(body) m
                       where m->'data'->>'kind' = 'no_show' and m->>'to' = 'ExponentPushToken[omar]') = 0,
  'no "you missed the trip" for someone who said they didn''t go');

-- 12. Reliability: Amir rode t1, t6 and t7, didn't get penalised for the driver's cancels (t2, t4).
select pg_temp.check((select reliability = 1 and completed_trips = 3 from public.person_stats('00000000-0000-0000-0000-0000000000a1')),
  'passengers aren''t blamed for the driver''s cancels');
-- Dana: good t1, t6, t7; bad t2, t4 (late). t3 and t5 count for nobody.
select pg_temp.check((select reliability = 0.60 from public.person_stats('00000000-0000-0000-0000-00000000000d')),
  'driver: 3 good, 2 late cancels');
select pg_temp.check((select count(*) from public.late_cancels('00000000-0000-0000-0000-00000000000d', now() - interval '1 day')) = 2,
  'two late cancels count toward the posting pause');

-- 13. Rating opens for completed seats only.
set local role authenticated;
select pg_temp.as_user(pg_temp.rider(1));
select public.rate_trip(pg_temp.bk(1, 1), 5);
select pg_temp.as_user(pg_temp.rider(4));
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk(1, 4), 5)$$, 'Only finished trips');

-- 14. Admins see disputed seats; others can't.
select pg_temp.expect_error($$select * from public.admin_disputed_seats()$$, 'Admins only');
reset role;
insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000d');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select count(*) from public.admin_disputed_seats()) = 3, 'three disputed seats (t1, t3, t6)');

select 'All unstarted trip checks passed' as result;
rollback;
