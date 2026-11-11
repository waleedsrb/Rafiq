-- Checks slice 8: trip day (I'm here, got in, no-show, start, finish, auto-finish) and ratings.
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

-- d = driver (Dana, f, en), a1 = Amir (m, ar), a2 = Aya, a3 = Omar. Everyone verified.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000000d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh', 'm', 'ar'),
  ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil', 'm', 'en');
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000000d', 'Kia Picanto', 'White', '7-1234-95');
insert into public.push_tokens (token, user_id) values
  ('ExponentPushToken[dana]', '00000000-0000-0000-0000-00000000000d'),
  ('ExponentPushToken[amir]', '00000000-0000-0000-0000-0000000000a1'),
  ('ExponentPushToken[aya]',  '00000000-0000-0000-0000-0000000000a2');
select pg_temp.as_user(null);
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (id, driver_id, origin, destination, departs_at, seats_total, price_ils) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 days', 4, 25),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000d', 'osm-n293546203', 'osm-n246843686', now() + interval '2 days', 4, 25);
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
create temp table ids (who text primary key, booking uuid);
grant all on ids to authenticated;
create function pg_temp.bk(who text) returns uuid language sql as $$ select booking from ids where who = $1 $$;
create function pg_temp.st(who text) returns text language sql as $$
  select status::text from public.bookings where id = (select booking from ids where who = $1) $$;
create function pg_temp.pay(who text) returns text language sql as $$
  select status::text from public.payments where booking_id = (select booking from ids where who = $1) $$;
create function pg_temp.pushes(kind text) returns int language sql as $$
  select count(*)::int from net.sent, jsonb_array_elements(body) m where m->'data'->>'kind' = kind $$;
set local role authenticated;

-- Three requests on c1, one on c2. The driver accepts a1 and a2 on c1, and a1 on c2.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into ids values ('a1', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_4242', 'visa', '4242'));
insert into ids values ('a1c2', public.request_seat('00000000-0000-0000-0000-0000000000c2', 'tok_fake_4242', 'visa', '4242'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into ids values ('a2', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_1881', 'visa', '1881'));
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into ids values ('a3', public.request_seat('00000000-0000-0000-0000-0000000000c1', 'tok_fake_5555', 'visa', '5555'));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
update public.bookings set status = 'accepted' where id in (pg_temp.bk('a1'), pg_temp.bk('a2'), pg_temp.bk('a1c2'));

-- 1. Phones can't fake trip day by editing rows.
select pg_temp.expect_error($$update public.trips set started_at = now() where id = '00000000-0000-0000-0000-0000000000c1'$$, 'Use Start trip');
select pg_temp.expect_error($$update public.bookings set status = 'completed' where id = pg_temp.bk('a1')$$, 'Only the system');
select pg_temp.expect_error($$update public.bookings set status = 'no_show' where id = pg_temp.bk('a1')$$, 'Only the system');
update public.bookings set boarded_at = now(), here_at = now() where id = pg_temp.bk('a1');
select pg_temp.check((select boarded_at is null and here_at is null from public.bookings where id = pg_temp.bk('a1')),
  'boarded_at/here_at must ignore direct edits');

-- 2. Too early: two days before departure nothing opens yet.
select pg_temp.expect_error($$select public.start_trip('00000000-0000-0000-0000-0000000000c1')$$, 'Too early');
select pg_temp.expect_error($$select public.mark_boarded(pg_temp.bk('a1'))$$, 'Too early');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.im_here(pg_temp.bk('a1'))$$, 'Too early');

-- 3. Twenty minutes before departure: "I'm here" tells the driver (once).
reset role;
select pg_temp.as_user(null);
update public.trips set departs_at = now() + interval '20 minutes' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.im_here(pg_temp.bk('a1'));
select public.im_here(pg_temp.bk('a1'));
select pg_temp.check((select here_at is not null from public.bookings where id = pg_temp.bk('a1')), 'im_here sets here_at');
reset role;
select pg_temp.check(pg_temp.pushes('passenger_here') = 1, 'one passenger_here push to the driver');
select pg_temp.check((select m->>'title' from net.sent, jsonb_array_elements(body) m
                       where m->'data'->>'kind' = 'passenger_here') = 'Amir is here', 'push in the driver''s language');
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$select public.im_here(pg_temp.bk('a1'))$$, 'No confirmed seat');

-- 4. Driver at pickup: tick a1. Can't start while a2 is unaccounted for, and
--    can't call a2 a no-show before 10 minutes after departure.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.mark_boarded(pg_temp.bk('a1'))$$, 'Only the driver');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.mark_boarded(pg_temp.bk('a1'));
select pg_temp.expect_error($$select public.start_trip('00000000-0000-0000-0000-0000000000c1')$$, 'Mark every passenger');
select pg_temp.expect_error($$select public.mark_no_show(pg_temp.bk('a2'))$$, 'Wait until 10 minutes');
select public.mark_boarded(pg_temp.bk('a2'));
select public.mark_boarded(pg_temp.bk('a2'), false);   -- untick: a mistake
select pg_temp.check((select boarded_at is null from public.bookings where id = pg_temp.bk('a2')), 'untick clears boarded_at');

-- 5. Fifteen minutes after departure: a2 is a no-show and stays charged; a1 (got in) can't be.
reset role;
select pg_temp.as_user(null);
update public.trips set departs_at = now() - interval '15 minutes' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.mark_no_show(pg_temp.bk('a1'))$$, 'got in');
select public.mark_no_show(pg_temp.bk('a2'));
select pg_temp.check(pg_temp.st('a2') = 'no_show', 'a2 is a no-show');
reset role;
select pg_temp.check(pg_temp.pay('a2') = 'charged', 'a no-show keeps the charge');
select pg_temp.check(pg_temp.pushes('no_show') = 1, 'the no-show passenger is told');

-- 6. Start: only the driver; open requests expire and their holds are released.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.start_trip('00000000-0000-0000-0000-0000000000c1')$$, 'Only the driver');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.start_trip('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check((select started_at is not null from public.trips where id = '00000000-0000-0000-0000-0000000000c1'), 'trip started');
select pg_temp.check(pg_temp.st('a3') = 'expired', 'open request expires at start');
select pg_temp.expect_error($$select public.cancel_trip('00000000-0000-0000-0000-0000000000c1')$$, 'before it starts');
select pg_temp.expect_error($$update public.trips set departs_at = now() where id = '00000000-0000-0000-0000-0000000000c1'$$, 'has started');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$update public.bookings set status = 'cancelled' where id = pg_temp.bk('a1')$$, 'already started');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a1'), 5)$$, 'Only finished trips');
reset role;
select pg_temp.check(pg_temp.pay('a3') = 'released', 'expired request is released');

-- 7. Arrived: a1 completes (still charged), both sides are asked to rate.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.finish_trip('00000000-0000-0000-0000-0000000000c1');
select pg_temp.check(pg_temp.st('a1') = 'completed', 'a1 completed');
select pg_temp.check(pg_temp.st('a2') = 'no_show', 'a no-show stays a no-show');
reset role;
select pg_temp.check(pg_temp.pay('a1') = 'charged', 'completed keeps the charge');
select pg_temp.check(pg_temp.pushes('rate_driver') = 1, 'passenger asked to rate');
select pg_temp.check(pg_temp.pushes('rate_passengers') = 1, 'driver asked to rate');
select pg_temp.check((select m->>'title' from net.sent, jsonb_array_elements(body) m
                       where m->'data'->>'kind' = 'rate_driver') = 'وصلت بالسلامة', 'Arabic for Amir');

-- 8. Ratings: each side once; the no-show can't rate; tags are checked.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.rate_trip(pg_temp.bk('a1'), 5, array['on_time', 'safe_driving'], '  Thank you!  ');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a1'), 4)$$, 'already rated');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a2'), 1)$$, 'Only finished trips');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a1'), 1)$$, 'not on this trip');
select pg_temp.check((select count(*) from public.ratings) = 0, 'others don''t see ratings rows');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a1'), 6)$$, 'ratings_stars_check');
select pg_temp.expect_error($$select public.rate_trip(pg_temp.bk('a1'), 4, array['Bad Tag'])$$, 'Unknown tag');
select public.rate_trip(pg_temp.bk('a1'), 4, array['friendly']);
select pg_temp.expect_error($$insert into public.ratings (booking_id, rater_id, ratee_id, ratee_role, stars)
  values (pg_temp.bk('a1'), auth.uid(), auth.uid(), 'driver', 5)$$, 'row-level security');
select pg_temp.check((select count(*) from public.ratings) = 2, 'driver sees both ratings of the trip');
select pg_temp.check((select ratee_role = 'driver' and note = 'Thank you!' from public.ratings
                       where rater_id = '00000000-0000-0000-0000-0000000000a1'), 'note is trimmed, roles right');

-- 9. Nobody tapped Start on c2: the 4-hour job leaves it alone now. Trips that never
-- start are settled by settle_unstarted_trips() (tests in unstarted_trips.sql).
reset role;
select pg_temp.as_user(null);
update public.trips set departs_at = now() - interval '5 hours' where id = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check(public.finish_due_trips() = 0, 'never-started trips are not auto-finished');
select pg_temp.check(pg_temp.st('a1c2') = 'accepted', 'seat untouched by finish_due_trips');
select pg_temp.check(public.settle_unstarted_trips() = 1, 'settled instead');
select pg_temp.check(pg_temp.st('a1c2') = 'not_confirmed', 'silence counts for nobody');
select pg_temp.check((select finished_at is not null and started_at is null and cancelled_at is null
                        from public.trips where id = '00000000-0000-0000-0000-0000000000c2'), 'closed quietly');
select pg_temp.check(public.settle_unstarted_trips() = 0, 'settling is done once');

select 'All trip day checks passed' as result;
rollback;
