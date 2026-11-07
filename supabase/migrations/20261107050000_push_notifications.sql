-- Slice 3b: push notifications.
--
-- 1. Each phone registers its Expo push token (register_push_token).
-- 2. Every booking_events row (requested / accepted / declined) triggers
--    notify_booking_event(), which builds a message in the recipient's
--    language and hands it to pg_net.
-- 3. pg_net sends the HTTP request to Expo's push service *after* the
--    transaction commits, so a rolled-back booking never sends anything,
--    and a slow or failing push service never slows down or blocks a booking.

-- pg_net exists on Supabase; plain Postgres in CI uses a stand-in (supabase_stub.sql).
do $$ begin
  if exists (select from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

create table public.push_tokens (
  token       text primary key check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- No policies = nobody reads or writes the table directly. Phones go through
-- the two functions below, which only ever act for the signed-in person.
alter table public.push_tokens enable row level security;

-- Upsert: if this phone was signed in as someone else before, it now belongs to you.
create or replace function public.register_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into push_tokens (token, user_id) values (p_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;

revoke execute on function public.register_push_token(text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text), public.unregister_push_token(text) to authenticated;

-- City names for messages (the app has the same in src/i18n/strings.ts).
create or replace function public.city_name(c public.city, lang text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when c = 'ramallah' then case when lang = 'ar' then 'رام الله' else 'Ramallah' end
    when c = 'nablus'   then case when lang = 'ar' then 'نابلس'    else 'Nablus'   end
    else c::text
  end;
$$;

create or replace function public.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  recipient  uuid;
  other      uuid;   -- the person who caused the event
  lang       text;
  other_name text;
  other_f    boolean;
  route      text;
  title      text;
  body       text;
  link       text;
  messages   jsonb;
begin
  select bk.passenger_id, t.id as trip_id, t.driver_id, t.origin, t.destination
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;

  if new.to_status = 'requested' then
    recipient := b.driver_id;    other := b.passenger_id;  link := '/trips/requests/' || b.trip_id;
  elsif new.to_status in ('accepted', 'declined') then
    recipient := b.passenger_id; other := b.driver_id;     link := '/trips/' || b.trip_id;
  else
    return null;
  end if;

  select jsonb_agg(jsonb_build_object('to', token)) into messages
    from push_tokens where user_id = recipient;
  if messages is null then
    return null; -- no phone registered, nothing to send
  end if;

  select language into lang from profiles where id = recipient;
  select split_part(full_name, ' ', 1), gender = 'f' into other_name, other_f from profiles where id = other;
  other_f := coalesce(other_f, false);
  route := city_name(b.origin, lang)
        || case when lang = 'ar' then ' ← ' else ' → ' end
        || city_name(b.destination, lang);

  if new.to_status = 'requested' then
    title := case when lang = 'ar' then 'طلب مقعد جديد' else 'New seat request' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' تريد ' else ' يريد ' end || 'مقعداً: ' || route
               else other_name || ' wants a seat: ' || route end;
  elsif new.to_status = 'accepted' then
    title := case when lang = 'ar' then 'تم تأكيد مقعدك' else 'Your seat is confirmed' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' قبلت' else ' قبل' end || ' طلبك: ' || route
               else other_name || ' accepted you: ' || route end;
  else
    title := case when lang = 'ar' then 'لم يتم قبول طلبك' else 'Request not accepted' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' لا تستطيع' else ' لا يستطيع' end
                    || ' أخذك هذه المرة. جرّب رحلة أخرى.'
               else other_name || ' can''t take you this time. Try another trip.' end;
  end if;

  -- One message per phone, same content.
  select jsonb_agg(m || jsonb_build_object(
           'title', title, 'body', body, 'sound', 'default', 'data', jsonb_build_object('url', link)))
    into messages
    from jsonb_array_elements(messages) m;

  -- A push problem must never undo a booking, so swallow errors here.
  begin
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := messages,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger booking_events_notify
after insert on public.booking_events
for each row execute function public.notify_booking_event();

revoke execute on function public.notify_booking_event() from public, anon, authenticated;
