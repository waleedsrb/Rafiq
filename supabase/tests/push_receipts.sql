-- Checks push receipts (migration 20261111120000_push_receipts.sql): dead phones are dropped,
-- receipts are asked for after 15 minutes, and admins hear about drivers nobody can reach.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000040d'), ('00000000-0000-0000-0000-0000000004ad');
insert into public.profiles (id, full_name, gender, language) values
  ('00000000-0000-0000-0000-00000000040d', 'Dana Haddad', 'f', 'en'),
  ('00000000-0000-0000-0000-0000000004ad', 'Admin Waleed', 'm', 'en');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000004ad');
insert into public.push_tokens (token, user_id) values
  ('ExponentPushToken[phone-a]', '00000000-0000-0000-0000-00000000040d'),
  ('ExponentPushToken[phone-b]', '00000000-0000-0000-0000-00000000040d');

-- 1. Sending records which token each message went to.
select public.send_push('00000000-0000-0000-0000-00000000040d', 'trip_reminder', 'Hi', 'There', '/x');
do $$ declare s record; begin
  select * into s from public.push_sends where user_id = '00000000-0000-0000-0000-00000000040d';
  if s is null or cardinality(s.tokens) <> 2 then raise exception 'FAIL: send not recorded: %', row_to_json(s); end if;
end $$;

-- 2. Expo's tickets: phone A ok, phone B already unregistered -> B is dropped at once.
insert into net._http_response (id, status_code, content)
select ps.request_id, 200, json_build_object('data', (
         select json_agg(case when t = 'ExponentPushToken[phone-a]'
                              then json_build_object('status', 'ok', 'id', 'ticket-a')
                              else json_build_object('status', 'error', 'details', json_build_object('error', 'DeviceNotRegistered')) end
                         order by i)
           from unnest(ps.tokens) with ordinality u(t, i)))::text
  from public.push_sends ps;
do $$ declare dropped int; begin
  dropped := public.process_push_results();
  if dropped <> 1 then raise exception 'FAIL: expected 1 dead token, got %', dropped; end if;
  if exists (select 1 from public.push_tokens where token = 'ExponentPushToken[phone-b]') then
    raise exception 'FAIL: dead token B kept';
  end if;
  if not exists (select 1 from public.push_tickets where ticket_id = 'ticket-a' and token = 'ExponentPushToken[phone-a]') then
    raise exception 'FAIL: ticket for A not saved';
  end if;
  if exists (select 1 from public.push_sends where read_at is null) then raise exception 'FAIL: send left unread'; end if;
end $$;

-- 3. Too early for a receipt: nothing asked yet.
do $$ begin
  perform public.process_push_results();
  if exists (select 1 from net.sent where url like '%getReceipts') then raise exception 'FAIL: asked for receipts too early'; end if;
end $$;

-- 4. After 15 minutes the job asks Expo for the receipt.
update public.push_tickets set sent_at = now() - interval '20 minutes';
do $$ declare s record; begin
  perform public.process_push_results();
  select * into s from net.sent where url like '%getReceipts';
  if s is null or s.body <> '{"ids": ["ticket-a"]}'::jsonb then raise exception 'FAIL: receipt request was %', row_to_json(s); end if;
  if not exists (select 1 from public.push_receipt_checks where ticket_ids = '{ticket-a}') then
    raise exception 'FAIL: receipt check not recorded';
  end if;
end $$;

-- 5. The receipt says phone A is gone too -> A is dropped and the ticket is marked.
insert into net._http_response (id, status_code, content)
select request_id, 200, '{"data": {"ticket-a": {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}}}'
  from public.push_receipt_checks;
do $$ declare dropped int; t record; begin
  dropped := public.process_push_results();
  if dropped <> 1 then raise exception 'FAIL: expected receipt to drop 1 token, got %', dropped; end if;
  select * into t from public.push_tickets where ticket_id = 'ticket-a';
  if t.status <> 'error' or t.error <> 'DeviceNotRegistered' or t.checked_at is null then
    raise exception 'FAIL: ticket not updated: %', row_to_json(t);
  end if;
  if exists (select 1 from public.push_tokens where user_id = '00000000-0000-0000-0000-00000000040d') then
    raise exception 'FAIL: Dana still has a token';
  end if;
end $$;

-- 6. Dana now has no working phone and drives in 2 hours: the admin hears about it, once.
insert into public.driver_details (driver_id, car_model, car_color, plate)
values ('00000000-0000-0000-0000-00000000040d', 'Kia Picanto', 'White', '7-1234-95');
update public.driver_details set verified_at = now();
update public.profiles set id_verified_at = now();
insert into public.trips (driver_id, origin, destination, departs_at, seats_total, price_ils)
values ('00000000-0000-0000-0000-00000000040d', 'osm-n246843686', 'osm-n293546203', now() + interval '2 hours', 3, 25);
do $$ declare n record; begin
  perform public.process_push_results();
  select * into n from public.notifications
   where user_id = '00000000-0000-0000-0000-0000000004ad' and kind = 'admin_push_problem';
  if n is null or n.body not like 'Dana Haddad isn''t receiving Rafiq notifications and has a trip at %'
     or n.url <> '/people/00000000-0000-0000-0000-00000000040d' then
    raise exception 'FAIL: admin alert was %', row_to_json(n);
  end if;
  perform public.process_push_results();
  if (select count(*) from public.notifications where kind = 'admin_push_problem') <> 1 then
    raise exception 'FAIL: admin alerted twice in one day';
  end if;
end $$;

-- 7. Phones and signed-in people can't see any of this bookkeeping.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000040d', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.push_tickets) or exists (select 1 from public.push_sends) then
    raise exception 'FAIL: a user can read push bookkeeping';
  end if;
  begin
    perform public.process_push_results();
    raise exception 'FAIL: a user could run the push job';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'All push receipt checks passed' as result;
rollback;
