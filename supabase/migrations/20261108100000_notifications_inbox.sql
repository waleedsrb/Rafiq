-- Slice 10a: the account hub. A notifications inbox, settings, an emergency contact,
-- and deleting your account.
--
-- 1. Every push now goes through ONE function, send_push(). It always writes a row to
--    the inbox (notifications), then sends the push unless the person switched that
--    kind of message off in Settings. Other slices (trip day, ride alerts) call it too.
-- 2. Settings live on the profile row: three notification switches, "ask me near
--    checkpoints", "share my trips automatically" and the emergency contact.
-- 3. delete_my_account(): cancels what is still open, removes everything that
--    identifies the person, and deletes the sign-in. Trips and payments stay, so the
--    other side keeps an honest history.

-- ─── Settings on the profile ────────────────────────────────────────────────
alter table public.profiles
  add column notify_trips          boolean not null default true,  -- seat requests and answers
  add column notify_checkpoints    boolean not null default true,  -- status changes on your routes
  add column notify_alerts         boolean not null default true,  -- ride alerts (slice 14)
  add column ask_near_checkpoints  boolean not null default true,  -- one question as you pass (slice 15)
  add column auto_share            boolean not null default false, -- share every trip with the emergency contact
  add column emergency_name        text check (length(trim(emergency_name)) between 2 and 60),
  add column emergency_phone       text check (emergency_phone ~ '^\+[0-9]{8,15}$'),
  add column deleted_at            timestamptz;

-- Auto-share needs someone to share with.
alter table public.profiles
  add constraint profiles_auto_share_needs_contact
  check (not auto_share or (emergency_name is not null and emergency_phone is not null));

-- ─── The inbox ──────────────────────────────────────────────────────────────
-- One row per message, written in the reader's language at the moment it was sent
-- (the same words as the push). `kind` says what happened, e.g. 'accepted' or
-- 'verification_approved'; `url` is the screen to open when tapped.
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  url         text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- You read your own. Nobody writes directly: send_push() adds rows and
-- mark_notifications_read() marks them.
alter table public.notifications enable row level security;
create policy notifications_read_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Live: the bell's dot appears the moment a row arrives.
alter publication supabase_realtime add table public.notifications;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
revoke execute on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- ─── One way to notify someone ──────────────────────────────────────────────
-- Which switch silences which kind. Anything not listed is essential (your trip was
-- cancelled, your ID was approved, rate your trip...) and always pushes.
create or replace function public.push_allowed(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_kind in ('requested', 'accepted', 'declined', 'expired', 'passenger_cancelled') then p.notify_trips
    when p_kind like 'checkpoint\_%' then p.notify_checkpoints
    when p_kind like 'alert\_%'      then p.notify_alerts
    else true
  end and p.deleted_at is null
  from profiles p where p.id = p_user;
$$;

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
begin
  if p_user is null or p_title is null or p_body is null then
    return;
  end if;

  insert into notifications (user_id, kind, title, body, url)
  values (p_user, p_kind, p_title, p_body, p_url);

  if not coalesce(push_allowed(p_user, p_kind), false) then
    return; -- in the inbox, but no buzz
  end if;

  select jsonb_agg(jsonb_build_object(
           'to', token, 'title', p_title, 'body', p_body, 'sound', 'default',
           'data', jsonb_build_object('url', p_url, 'kind', p_kind)))
    into messages
    from push_tokens where user_id = p_user;
  if messages is null then
    return; -- no phone registered; the inbox has it for next time
  end if;

  -- A push problem must never undo what caused it (a booking, a review...).
  begin
    perform net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      body    := messages,
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end;
$$;
revoke execute on function public.send_push(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.push_allowed(uuid, text) from public, anon, authenticated;

-- Trip day (slice 8) sends its pushes through trip_day_push(). Whichever of the two
-- migrations is applied last, it ends up here, in the inbox.
create or replace function public.trip_day_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.send_push(p_user, p_kind, p_title, p_body, p_url);
$$;
revoke execute on function public.trip_day_push(uuid, text, text, text, text) from public, anon, authenticated;

-- ─── Booking pushes, now through send_push ──────────────────────────────────
-- Same words as before (slice 4); only the sending changed.
create or replace function public.notify_booking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  recipient  uuid;
  other      uuid;   -- the other person in the booking
  lang       text;
  other_name text;
  other_f    boolean;
  route      text;
  title      text;
  body       text;
  link       text;
  kind       text;
begin
  select bk.passenger_id, t.id as trip_id, t.driver_id, t.origin, t.destination, t.cancelled_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;

  if new.to_status = 'requested' then
    kind := 'requested';
  elsif new.to_status in ('accepted', 'declined', 'expired') then
    kind := new.to_status::text;
  elsif new.to_status = 'cancelled' and new.actor_id = b.passenger_id then
    kind := 'passenger_cancelled';
  elsif new.to_status = 'cancelled' then
    kind := 'trip_cancelled';
  else
    return null;
  end if;

  if kind in ('requested', 'passenger_cancelled') then
    recipient := b.driver_id;    other := b.passenger_id;  link := '/trips/requests/' || b.trip_id;
  else
    recipient := b.passenger_id; other := b.driver_id;     link := '/trips/' || b.trip_id;
  end if;
  -- A passenger withdrawing a request the driver never saw is not worth a ping.
  if kind = 'passenger_cancelled' and new.from_status = 'requested' then
    return null;
  end if;

  select language into lang from profiles where id = recipient;
  select split_part(full_name, ' ', 1), gender = 'f' into other_name, other_f from profiles where id = other;
  other_f := coalesce(other_f, false);
  route := city_name(b.origin, lang)
        || case when lang = 'ar' then ' ← ' else ' → ' end
        || city_name(b.destination, lang);

  if kind = 'requested' then
    title := case when lang = 'ar' then 'طلب مقعد جديد' else 'New seat request' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' تريد ' else ' يريد ' end || 'مقعداً: ' || route
               else other_name || ' wants a seat: ' || route end;
  elsif kind = 'accepted' then
    title := case when lang = 'ar' then 'تم تأكيد مقعدك' else 'Your seat is confirmed' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' قبلت' else ' قبل' end || ' طلبك: ' || route
               else other_name || ' accepted you: ' || route end;
  elsif kind = 'declined' then
    title := case when lang = 'ar' then 'لم يتم قبول طلبك' else 'Request not accepted' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' لا تستطيع' else ' لا يستطيع' end
                    || ' أخذك هذه المرة. جرّب رحلة أخرى.'
               else other_name || ' can''t take you this time. Try another trip.' end;
  elsif kind = 'expired' then
    title := case when lang = 'ar' then 'انتهت مهلة طلبك' else 'Your request expired' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' لم تردّ' else ' لم يردّ' end
                    || ' في الوقت. جرّب رحلة أخرى: ' || route
               else other_name || ' didn''t answer in time. Try another trip: ' || route end;
  elsif kind = 'trip_cancelled' then
    title := case when lang = 'ar' then 'أُلغيت الرحلة' else 'Trip cancelled' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' ألغت' else ' ألغى' end
                    || ' الرحلة: ' || route || '. ابحث عن رحلة أخرى.'
               else other_name || ' cancelled the trip: ' || route || '. Find another one.' end;
  else -- passenger_cancelled (an accepted seat)
    title := case when lang = 'ar' then 'أُلغي حجز' else 'A seat was cancelled' end;
    body  := case when lang = 'ar'
               then other_name || case when other_f then ' ألغت مقعدها: ' else ' ألغى مقعده: ' end || route
               else other_name || ' cancelled their seat: ' || route end;
  end if;

  perform send_push(recipient, kind, title, body, link);
  return null;
end;
$$;

-- ─── ID check pushes, now through send_push ─────────────────────────────────
create or replace function public.notify_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lang    text;
  female  boolean;
  title   text;
  body    text;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return null;
  end if;

  select language, gender = 'f' into lang, female from profiles where id = new.user_id;
  female := coalesce(female, false);

  if new.status = 'approved' and new.kind = 'passenger' then
    title := case when lang = 'ar' then 'تم توثيق هويتك' else 'You''re verified' end;
    body  := case when lang = 'ar' then 'يمكنك حجز المقاعد الآن.' else 'You can book seats now.' end;
  elsif new.status = 'approved' then
    title := case when lang = 'ar' then 'تمت الموافقة على فحص السائق' else 'Your driver check is approved' end;
    body  := case when lang = 'ar' then 'يمكنك نشر الرحلات الآن.' else 'You can post trips now.' end;
  else
    title := case when lang = 'ar' then 'نحتاج صورًا جديدة' else 'We need new photos' end;
    body  := case when lang = 'ar'
               then 'السبب: ' || new.reject_reason || case when female then ' افتحي رفيق وأرسلي صورًا جديدة.' else ' افتح رفيق وأرسل صورًا جديدة.' end
               else 'Reason: ' || new.reject_reason || ' Open Rafiq to send new ones.' end;
  end if;

  perform send_push(new.user_id, 'verification_' || new.status, title, body, '/verify?kind=' || new.kind);
  return null;
end;
$$;

-- ─── Delete my account ──────────────────────────────────────────────────────
-- The profile row stays (trips, bookings and payments point at it) but keeps nothing
-- that identifies the person. The sign-in (auth.users, which holds the phone number)
-- is deleted, so the same number can sign up again as a new person.
-- Until now deleting a sign-in deleted the profile and, with it, the other side's
-- trip history; from now on it leaves the anonymous profile behind.
alter table public.profiles drop constraint profiles_id_fkey;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t  record;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;

  -- 1. Close what is still open, through the normal rules, so refunds and
  --    the other side's pushes happen exactly as if they had cancelled by hand.
  for t in select id from trips
            where driver_id = me and cancelled_at is null and departs_at > now() loop
    perform cancel_trip(t.id);
  end loop;
  update bookings b set status = 'cancelled'
   where b.passenger_id = me and b.status in ('requested', 'accepted')
     and exists (select 1 from trips tr where tr.id = b.trip_id and tr.departs_at > now());

  -- 2. Forget the person.
  delete from push_tokens    where user_id = me;
  delete from notifications  where user_id = me;
  delete from driver_details where driver_id = me;
  delete from admins         where user_id = me;
  -- ID checks: the app deletes the photo files from storage first (SQL may not delete
  -- stored files); here go the records, and the files' link to the sign-in.
  delete from verifications  where user_id = me;
  begin
    update storage.objects set owner = null where owner = me;
  exception when others then
    null; -- older/newer storage schemas differ; nothing to unlink then
  end;
  update profiles set
    full_name       = 'Former member',
    gender          = null,
    emergency_name  = null,
    emergency_phone = null,
    auto_share      = false,
    deleted_at      = now()
  where id = me;

  -- 3. Delete the sign-in. The app signs out right after.
  delete from auth.users where id = me;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
