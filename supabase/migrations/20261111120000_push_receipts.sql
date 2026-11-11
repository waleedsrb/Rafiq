-- Push receipts: notice when a phone stops accepting Rafiq's notifications.
--
-- Until now we handed each push to Expo and never looked back. Expo answers in two steps:
--   1. Right away, a "ticket" per message: ok (with a ticket id) or an error.
--   2. About 15 minutes later, a "receipt" per ticket id, saying whether Apple/Google
--      actually took it. "DeviceNotRegistered" means the app was deleted or notifications
--      were switched off: that token will never work again.
-- pg_net stores Expo's answers in net._http_response for a few hours, so a job every
-- 5 minutes (process_push_results) reads them:
--   * drops dead tokens, so we stop pushing into the void;
--   * asks for receipts of tickets older than 15 minutes;
--   * tells admins when a driver with a trip in the next 24 hours has no working phone,
--     because their riders' requests would go unseen.

-- ─── What we sent, and what Expo said ─────────────────────────────────────────
create table public.push_sends (
  request_id bigint primary key,          -- pg_net request id = net._http_response.id
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tokens     text[] not null,             -- same order as the messages sent
  sent_at    timestamptz not null default now(),
  read_at    timestamptz                  -- when we processed Expo's answer
);

create table public.push_tickets (
  ticket_id            text primary key,
  token                text not null,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  sent_at              timestamptz not null default now(),
  receipt_requested_at timestamptz,
  status               text check (status in ('ok', 'error')),
  error                text,
  checked_at           timestamptz
);
create index push_tickets_waiting_idx on public.push_tickets (sent_at) where checked_at is null;

create table public.push_receipt_checks (
  request_id bigint primary key,
  ticket_ids text[] not null,
  sent_at    timestamptz not null default now(),
  read_at    timestamptz
);

-- One alert per driver per day, so admins aren't spammed every 5 minutes.
create table public.push_problem_alerts (
  driver_id  uuid not null references public.profiles (id) on delete cascade,
  alert_day  date not null,
  primary key (driver_id, alert_day)
);

-- Server-only bookkeeping: RLS on, no policies, so phones can't read or write any of it.
alter table public.push_sends enable row level security;
alter table public.push_tickets enable row level security;
alter table public.push_receipt_checks enable row level security;
alter table public.push_problem_alerts enable row level security;

-- ─── Sending: one place that talks to Expo ────────────────────────────────────
-- Posts the messages and remembers which token each one went to.
create or replace function public.deliver_push(p_user uuid, p_messages jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req bigint;
begin
  if p_messages is null or jsonb_array_length(p_messages) = 0 then
    return;
  end if;
  -- A push problem must never undo what caused it (a booking, a review...).
  begin
    req := net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := p_messages,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
    insert into push_sends (request_id, user_id, tokens)
    values (req, p_user,
            array(select m ->> 'to' from jsonb_array_elements(p_messages) with ordinality as e(m, i) order by i));
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end;
$$;
revoke execute on function public.deliver_push(uuid, jsonb) from public, anon, authenticated;

-- send_push (single language), same as notification_actions but through deliver_push.
create or replace function public.send_push(
  p_user  uuid,
  p_kind  text,
  p_title text,
  p_body  text,
  p_url   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  messages jsonb;
  notification_id bigint;
begin
  if p_user is null or p_title is null or p_body is null then
    return;
  end if;

  insert into notifications (user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, p_body, p_url)
  returning id into notification_id;

  if not coalesce(push_allowed(p_user, p_kind), false) then
    return; -- in the inbox, but no buzz
  end if;

  select jsonb_agg(jsonb_build_object(
           'to', token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'data', jsonb_build_object('url', p_url, 'kind', p_kind, 'notification_id', notification_id::text)))
    into messages
    from push_tokens where user_id = p_user;

  perform deliver_push(p_user, messages); -- no phone registered = nothing to send
end;
$$;
revoke execute on function public.send_push(uuid, text, text, text, text) from public, anon, authenticated;

-- send_push (both languages), same as notification_languages but through deliver_push.
create or replace function public.send_push(
  p_user     uuid,
  p_kind     text,
  p_title_ar text,
  p_body_ar  text,
  p_title_en text,
  p_body_en  text,
  p_url      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lang            text;
  v_title         text;
  v_body          text;
  messages        jsonb;
  notification_id bigint;
begin
  if p_user is null then
    return;
  end if;
  select language into lang from profiles where id = p_user;
  if lang = 'en' then
    v_title := coalesce(p_title_en, p_title_ar);
    v_body  := coalesce(p_body_en, p_body_ar);
  else
    v_title := coalesce(p_title_ar, p_title_en);
    v_body  := coalesce(p_body_ar, p_body_en);
  end if;
  if v_title is null or v_body is null then
    return;
  end if;

  insert into notifications (user_id, kind, title, body, url, title_ar, body_ar, title_en, body_en)
  values (p_user, p_kind, v_title, v_body, p_url, p_title_ar, p_body_ar, p_title_en, p_body_en)
  returning id into notification_id;

  if not coalesce(push_allowed(p_user, p_kind), false) then
    return; -- in the inbox, but no buzz
  end if;

  select jsonb_agg(jsonb_build_object(
           'to', token, 'title', v_title, 'body', v_body, 'sound', 'default',
           'data', jsonb_build_object('url', p_url, 'kind', p_kind, 'notification_id', notification_id::text)))
    into messages
    from push_tokens where user_id = p_user;

  perform deliver_push(p_user, messages);
end;
$$;
revoke execute on function public.send_push(uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- ─── Reading Expo's answers ───────────────────────────────────────────────────
-- Returns how many dead tokens it dropped (handy for tests and for a glance in SQL).
create or replace function public.process_push_results()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s        record;
  c        record;
  item     record;
  ids      text[];
  req      bigint;
  dead     int := 0;
  n        int;
  d        record;
  t_time   text;
begin
  -- 1. Tickets: one answer per message, in the order we sent them.
  for s in
    select ps.request_id, ps.user_id, ps.tokens, r.status_code, r.content
      from push_sends ps
      join net._http_response r on r.id = ps.request_id
     where ps.read_at is null
  loop
    if s.status_code = 200 then
      for item in
        select e.value as v, e.i
          from jsonb_array_elements(coalesce(s.content::jsonb -> 'data', '[]')) with ordinality as e(value, i)
      loop
        if item.v ->> 'status' = 'ok' and item.v ? 'id' then
          insert into push_tickets (ticket_id, token, user_id)
          values (item.v ->> 'id', s.tokens[item.i], s.user_id)
          on conflict do nothing;
        elsif item.v -> 'details' ->> 'error' = 'DeviceNotRegistered' then
          delete from push_tokens where token = s.tokens[item.i];
          get diagnostics n = row_count;
          dead := dead + n;
        end if;
      end loop;
    end if;
    update push_sends set read_at = now() where request_id = s.request_id;
  end loop;
  -- pg_net forgets answers after a few hours; stop waiting for ones that never came.
  update push_sends set read_at = now() where read_at is null and sent_at < now() - interval '6 hours';

  -- 2. Receipts we asked for: an object keyed by ticket id.
  for c in
    select rc.request_id, r.status_code, r.content
      from push_receipt_checks rc
      join net._http_response r on r.id = rc.request_id
     where rc.read_at is null
  loop
    if c.status_code = 200 then
      for item in
        select e.key as k, e.value as v from jsonb_each(coalesce(c.content::jsonb -> 'data', '{}')) e
      loop
        update push_tickets
           set status = item.v ->> 'status', error = item.v -> 'details' ->> 'error', checked_at = now()
         where ticket_id = item.k;
        if item.v -> 'details' ->> 'error' = 'DeviceNotRegistered' then
          delete from push_tokens where token = (select token from push_tickets where ticket_id = item.k);
          get diagnostics n = row_count;
          dead := dead + n;
        end if;
      end loop;
    end if;
    update push_receipt_checks set read_at = now() where request_id = c.request_id;
  end loop;
  update push_receipt_checks set read_at = now() where read_at is null and sent_at < now() - interval '6 hours';

  -- A receipt request that never came back: ask again (Expo keeps receipts for 24 hours).
  update push_tickets set receipt_requested_at = null
   where checked_at is null and receipt_requested_at < now() - interval '1 hour'
     and sent_at > now() - interval '23 hours';

  -- 3. Ask for receipts of tickets at least 15 minutes old (Expo takes up to 1,000 per call).
  ids := array(
    select ticket_id from push_tickets
     where checked_at is null and receipt_requested_at is null
       and sent_at < now() - interval '15 minutes' and sent_at > now() - interval '23 hours'
     order by sent_at
     limit 1000);
  if cardinality(ids) > 0 then
    begin
      req := net.http_post(
        url     := 'https://exp.host/--/api/v2/push/getReceipts',
        body    := jsonb_build_object('ids', to_jsonb(ids)),
        headers := jsonb_build_object('Content-Type', 'application/json')
      );
      insert into push_receipt_checks (request_id, ticket_ids) values (req, ids);
      update push_tickets set receipt_requested_at = now() where ticket_id = any (ids);
    exception when others then
      raise warning 'receipts not requested: %', sqlerrm;
    end;
  end if;

  -- 4. Drivers who can't be reached, with a trip in the next 24 hours: tell the admins once a day.
  for d in
    select distinct on (t.driver_id) t.driver_id, p.full_name, t.departs_at
      from trips t
      join profiles p on p.id = t.driver_id
     where t.departs_at between now() and now() + interval '24 hours'
       and t.cancelled_at is null
       and p.deleted_at is null
       and not exists (select 1 from push_tokens k where k.user_id = t.driver_id)
       and not exists (select 1 from push_problem_alerts a
                        where a.driver_id = t.driver_id and a.alert_day = current_date)
     order by t.driver_id, t.departs_at
  loop
    insert into push_problem_alerts (driver_id, alert_day) values (d.driver_id, current_date);
    t_time := to_char(d.departs_at at time zone 'Asia/Hebron', 'HH24:MI');
    perform send_push(a.user_id, 'admin_push_problem',
      'سائق لا تصله الإشعارات',
      d.full_name || ' لا تصله إشعارات رفيق، وعنده رحلة الساعة ' || t_time || '. تواصل معه ليفتح التطبيق ويسمح بالإشعارات.',
      'A driver can''t get notifications',
      d.full_name || ' isn''t receiving Rafiq notifications and has a trip at ' || t_time || '. Ask them to open the app and allow notifications.',
      '/people/' || d.driver_id)
      from admins a;
  end loop;

  -- 5. Tidy up: keep three days of history for looking into problems.
  delete from push_tickets where sent_at < now() - interval '3 days';
  delete from push_sends where sent_at < now() - interval '3 days';
  delete from push_receipt_checks where sent_at < now() - interval '3 days';
  delete from push_problem_alerts where alert_day < current_date - 7;

  return dead;
end;
$$;
revoke execute on function public.process_push_results() from public, anon, authenticated;

-- Every 5 minutes (pg_cron exists on Supabase, not in CI).
do $$
begin
  if exists (select from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('push-receipts', '*/5 * * * *', 'select public.process_push_results()');
  end if;
end $$;
