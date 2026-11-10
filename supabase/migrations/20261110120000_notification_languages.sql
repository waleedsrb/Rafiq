-- Notifications in both languages.
--
-- Until now every message was written once, in the reader's language at the moment it
-- was sent, so switching the app to Arabic left older messages in English (and the other
-- way round). Now each message keeps its Arabic AND English words, and the inbox shows
-- the ones that match the app. The push itself still goes out in the reader's language.
--
-- Messages sent before this change only have one language (title/body); the app falls
-- back to those.
--
-- The message builders below are the same as before, word for word: instead of picking
-- one language with `case when lang = 'ar'`, they hand both to send_push().

alter table public.notifications
  add column if not exists title_ar text,
  add column if not exists body_ar  text,
  add column if not exists title_en text,
  add column if not exists body_en  text;

-- ─── send_push, bilingual ─────────────────────────────────────────────────────
-- Same as send_push(user, kind, title, body, url), but takes both languages.
-- title/body (and the push) are in the reader's language; all four are kept.
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
revoke execute on function public.send_push(uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- ─── Bookings: request, accepted, declined, expired, cancelled ────────────────
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
  other_name text;
  other_f    boolean;
  route_ar   text;
  route_en   text;
  t_ar text; b_ar text; t_en text; b_en text;
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

  select split_part(full_name, ' ', 1), gender = 'f' into other_name, other_f from profiles where id = other;
  other_f := coalesce(other_f, false);
  route_ar := city_name(b.origin, 'ar') || ' ← ' || city_name(b.destination, 'ar');
  route_en := city_name(b.origin, 'en') || ' → ' || city_name(b.destination, 'en');

  if kind = 'requested' then
    t_ar := 'طلب مقعد جديد';
    b_ar := other_name || case when other_f then ' تريد ' else ' يريد ' end || 'مقعداً: ' || route_ar;
    t_en := 'New seat request';
    b_en := other_name || ' wants a seat: ' || route_en;
  elsif kind = 'accepted' then
    t_ar := 'تم تأكيد مقعدك';
    b_ar := other_name || case when other_f then ' قبلت' else ' قبل' end || ' طلبك: ' || route_ar;
    t_en := 'Your seat is confirmed';
    b_en := other_name || ' accepted you: ' || route_en;
  elsif kind = 'declined' then
    t_ar := 'لم يتم قبول طلبك';
    b_ar := other_name || case when other_f then ' لا تستطيع' else ' لا يستطيع' end
            || ' أخذك هذه المرة. جرّب رحلة أخرى.';
    t_en := 'Request not accepted';
    b_en := other_name || ' can''t take you this time. Try another trip.';
  elsif kind = 'expired' then
    t_ar := 'انتهت مهلة طلبك';
    b_ar := other_name || case when other_f then ' لم تردّ' else ' لم يردّ' end
            || ' في الوقت. جرّب رحلة أخرى: ' || route_ar;
    t_en := 'Your request expired';
    b_en := other_name || ' didn''t answer in time. Try another trip: ' || route_en;
  elsif kind = 'trip_cancelled' then
    t_ar := 'أُلغيت الرحلة';
    b_ar := other_name || case when other_f then ' ألغت' else ' ألغى' end
            || ' الرحلة: ' || route_ar || '. ابحث عن رحلة أخرى.';
    t_en := 'Trip cancelled';
    b_en := other_name || ' cancelled the trip: ' || route_en || '. Find another one.';
  else -- passenger_cancelled (an accepted seat)
    t_ar := 'أُلغي حجز';
    b_ar := other_name || case when other_f then ' ألغت مقعدها: ' else ' ألغى مقعده: ' end || route_ar;
    t_en := 'A seat was cancelled';
    b_en := other_name || ' cancelled their seat: ' || route_en;
  end if;

  perform send_push(recipient, kind, t_ar, b_ar, t_en, b_en, link);
  return null;
end;
$$;

-- ─── ID / driver check decisions ──────────────────────────────────────────────
create or replace function public.notify_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  female  boolean;
  t_ar text; b_ar text; t_en text; b_en text;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return null;
  end if;

  select gender = 'f' into female from profiles where id = new.user_id;
  female := coalesce(female, false);

  if new.status = 'approved' and new.kind = 'passenger' then
    t_ar := 'تم توثيق هويتك';              b_ar := 'يمكنك حجز المقاعد الآن.';
    t_en := 'You''re verified';            b_en := 'You can book seats now.';
  elsif new.status = 'approved' then
    t_ar := 'تمت الموافقة على فحص السائق'; b_ar := 'يمكنك نشر الرحلات الآن.';
    t_en := 'Your driver check is approved'; b_en := 'You can post trips now.';
  else
    t_ar := 'نحتاج صورًا جديدة';
    b_ar := 'السبب: ' || new.reject_reason || case when female then ' افتحي رفيق وأرسلي صورًا جديدة.' else ' افتح رفيق وأرسل صورًا جديدة.' end;
    t_en := 'We need new photos';
    b_en := 'Reason: ' || new.reject_reason || ' Open Rafiq to send new ones.';
  end if;

  perform send_push(new.user_id, 'verification_' || new.status, t_ar, b_ar, t_en, b_en, '/verify?kind=' || new.kind);
  return null;
end;
$$;

-- ─── Trip day: arrived / missed, "I'm here", trip finished ────────────────────
create or replace function public.notify_trip_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b          record;
  drv_name   text;
  drv_f      boolean;
begin
  if new.to_status not in ('completed', 'no_show') then
    return null;
  end if;
  select bk.passenger_id, t.id as trip_id, t.driver_id into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = new.booking_id;
  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into drv_name, drv_f
    from profiles where id = b.driver_id;

  if new.to_status = 'completed' then
    perform send_push(b.passenger_id, 'rate_driver',
      'وصلت بالسلامة',
      'كيف كانت رحلتك مع ' || drv_name || '؟ قيّم الرحلة.',
      'You''ve arrived',
      'How was your trip with ' || drv_name || '? Rate it.',
      '/trips/rate/' || new.booking_id);
  else
    perform send_push(b.passenger_id, 'no_show',
      'فاتتك الرحلة',
      drv_name || case when drv_f then ' انطلقت' else ' انطلق' end || ' بدونك. الغياب يؤثر على موثوقيتك.',
      'You missed the trip',
      drv_name || ' left without you. Missed trips lower your reliability.',
      '/trips/' || b.trip_id);
  end if;
  return null;
end;
$$;

create or replace function public.im_here(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b        record;
  p_name   text;
  p_f      boolean;
begin
  select bk.id, bk.status, bk.passenger_id, bk.here_at, t.id as trip_id, t.driver_id, t.departs_at, t.started_at, t.cancelled_at
    into b
    from bookings bk join trips t on t.id = bk.trip_id
   where bk.id = p_booking_id and bk.passenger_id = auth.uid();
  if not found or b.status <> 'accepted' or b.cancelled_at is not null then
    raise exception 'No confirmed seat to check in for';
  end if;
  if b.started_at is not null then
    raise exception 'This trip has already started';
  end if;
  if now() < b.departs_at - interval '30 minutes' then
    raise exception 'Too early: check in from 30 minutes before departure';
  end if;
  if b.here_at is not null then
    return; -- already told the driver
  end if;

  perform set_config('rafiq.trip_day', 'on', true);
  update bookings set here_at = now() where id = p_booking_id;
  perform set_config('rafiq.trip_day', 'off', true);

  select split_part(full_name, ' ', 1), coalesce(gender = 'f', false) into p_name, p_f
    from profiles where id = b.passenger_id;
  perform send_push(b.driver_id, 'passenger_here',
    p_name || case when p_f then ' وصلت' else ' وصل' end,
    'عند نقطة الانطلاق.',
    p_name || ' is here',
    'At the pickup point.',
    '/trips/requests/' || b.trip_id);
end;
$$;

create or replace function public.close_trip(p_trip_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_done   int;
begin
  perform set_config('rafiq.trip_day', 'on', true);
  update trips set finished_at = now()
   where id = p_trip_id and finished_at is null and cancelled_at is null
  returning driver_id into v_driver;
  if v_driver is null then
    perform set_config('rafiq.trip_day', 'off', true);
    return 0;
  end if;
  with done as (
    update bookings set status = 'completed'
     where trip_id = p_trip_id and status = 'accepted'
    returning 1
  )
  select count(*)::int into v_done from done;
  perform set_config('rafiq.trip_day', 'off', true);

  if v_done > 0 then
    perform send_push(v_driver, 'rate_passengers',
      'انتهت الرحلة', 'شكراً لك. قيّم ركّابك.',
      'Trip finished', 'Thank you. Rate your passengers.',
      '/trips/requests/' || p_trip_id);
  end if;
  return v_done;
end;
$$;

-- ─── Ride alerts ──────────────────────────────────────────────────────────────
create or replace function public.ride_alert_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day     date := (new.window_from at time zone 'Asia/Hebron')::date;
  v_waiting int;
  d         record;
begin
  select count(distinct passenger_id) into v_waiting
    from ride_alerts
   where origin = new.origin and destination = new.destination and matched_at is null
     and window_to > now() and (window_from at time zone 'Asia/Hebron')::date = v_day;
  if v_waiting < 3 then
    return null;
  end if;
  -- Drivers who drove this route lately, are approved, and haven't been nudged for this day.
  for d in
    select distinct t.driver_id, p.gender = 'f' as female
      from trips t
      join profiles p on p.id = t.driver_id
      join driver_details dd on dd.driver_id = t.driver_id and dd.verified_at is not null
     where t.origin = new.origin and t.destination = new.destination
       and t.departs_at > now() - interval '30 days'
       and t.driver_id <> new.passenger_id
       and not exists (select 1 from ride_alert_nudges n
                        where n.driver_id = t.driver_id and n.origin = new.origin
                          and n.destination = new.destination and n.on_date = v_day)
  loop
    insert into ride_alert_nudges (driver_id, origin, destination, on_date)
    values (d.driver_id, new.origin, new.destination, v_day);
    perform send_push(
      d.driver_id,
      'alert_driver_nudge',
      'ركاب ينتظرون رحلة',
      v_waiting || ' أشخاص يبحثون عن رحلة ' || alert_route(new.origin, new.destination, 'ar') || ' '
        || alert_day_label(new.window_from, 'ar') || '. ' || case when d.female then 'انشري' else 'انشر' end || ' رحلة؟',
      'Riders are waiting',
      v_waiting || ' people want a ride ' || alert_route(new.origin, new.destination, 'en') || ' '
        || alert_day_label(new.window_from, 'en') || '. Post a trip?',
      '/trips/new'
    );
  end loop;
  return null;
end;
$$;

create or replace function public.match_ride_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_time text := to_char(new.departs_at at time zone 'Asia/Hebron', 'HH24:MI');
begin
  for a in
    update ride_alerts r set matched_at = now(), matched_trip = new.id
      from profiles p
     where p.id = r.passenger_id
       and r.matched_at is null and r.origin = new.origin and r.destination = new.destination
       and new.departs_at >= r.window_from and new.departs_at < r.window_to
       and r.passenger_id <> new.driver_id
       and (not new.women_only or is_verified_woman(r.passenger_id))  -- only trips they can book
    returning r.passenger_id
  loop
    perform send_push(
      a.passenger_id,
      'alert_match',
      'رحلة جديدة كما طلبت',
      alert_route(new.origin, new.destination, 'ar') || ' · ' || alert_day_label(new.departs_at, 'ar') || ' ' || v_time,
      'A trip you asked for',
      alert_route(new.origin, new.destination, 'en') || ' · ' || alert_day_label(new.departs_at, 'en') || ' ' || v_time,
      '/trips/' || new.id
    );
  end loop;
  return null;
end;
$$;

-- ─── Trip reminders (an hour before) ──────────────────────────────────────────
create or replace function public.send_trip_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_sent     int := 0;
  v_time     text;
  v_route_ar text;
  v_route_en text;
  v_car      text;
begin
  for r in
    -- Each passenger with a confirmed seat, and each driver who has at least one.
    select t.id as trip_id, t.departs_at, t.origin, t.destination, b.passenger_id as user_id,
           false as is_driver, null::int as riders,
           dd.car_model, dd.car_color, dd.plate
      from trips t
      join bookings b on b.trip_id = t.id and b.status = 'accepted'
      left join driver_details dd on dd.driver_id = t.driver_id
     where t.cancelled_at is null and t.started_at is null
       and t.departs_at > now() and t.departs_at <= now() + interval '60 minutes'
    union all
    select t.id, t.departs_at, t.origin, t.destination, t.driver_id,
           true, sum(b.seats)::int, null, null, null
      from trips t
      join bookings b on b.trip_id = t.id and b.status = 'accepted'
     where t.cancelled_at is null and t.started_at is null
       and t.departs_at > now() and t.departs_at <= now() + interval '60 minutes'
     group by t.id
  loop
    insert into trip_reminders (trip_id, user_id) values (r.trip_id, r.user_id)
    on conflict do nothing;
    continue when not found;  -- already reminded

    v_time     := to_char(r.departs_at at time zone 'Asia/Hebron', 'HH24:MI');
    v_route_ar := city_name(r.origin, 'ar') || ' ← ' || city_name(r.destination, 'ar');
    v_route_en := city_name(r.origin, 'en') || ' → ' || city_name(r.destination, 'en');
    if r.is_driver then
      perform send_push(
        r.user_id, 'trip_reminder',
        'رحلتك تنطلق الساعة ' || v_time,
        v_route_ar || ' · مقاعد محجوزة: ' || r.riders,
        'Your trip leaves at ' || v_time,
        v_route_en || ' · ' || r.riders || case when r.riders = 1 then ' seat booked' else ' seats booked' end,
        '/trips/requests/' || r.trip_id);
    else
      v_car := coalesce(' · ' || r.car_model || ' ' || r.car_color, '') || coalesce(' · ' || r.plate, '');
      perform send_push(
        r.user_id, 'trip_reminder',
        'رحلتك تنطلق الساعة ' || v_time,
        v_route_ar || v_car,
        'Your ride leaves at ' || v_time,
        v_route_en || v_car,
        '/trips/' || r.trip_id);
    end if;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- ─── Checkpoints: followed status changed, "passing X?" ───────────────────────
create or replace function public.announce_checkpoint_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   public.checkpoint_status;
  v_last  checkpoint_announcements%rowtype;
  v_cp    checkpoints%rowtype;
  f       record;
begin
  select status into v_now from checkpoint_overview() where id = new.checkpoint_id;
  if v_now is null then
    return null;
  end if;
  select * into v_last from checkpoint_announcements where checkpoint_id = new.checkpoint_id;
  if found and (v_last.status = v_now or v_last.announced_at > now() - interval '10 minutes') then
    return null;  -- nothing new, or we told people very recently
  end if;
  insert into checkpoint_announcements (checkpoint_id, status, announced_at)
  values (new.checkpoint_id, v_now, now())
  on conflict (checkpoint_id) do update set status = excluded.status, announced_at = excluded.announced_at;

  select * into v_cp from checkpoints where id = new.checkpoint_id;
  for f in
    select cf.user_id
      from checkpoint_follows cf
     where cf.checkpoint_id = new.checkpoint_id
       and cf.user_id is distinct from new.reporter_id  -- they know, they just said it
  loop
    perform send_push(
      f.user_id, 'checkpoint_status',
      v_cp.name_ar || ': ' || checkpoint_status_word(v_now, 'ar'),
      'حسب آخر التقارير. اضغط لترى التفاصيل.',
      v_cp.name_en || ': ' || checkpoint_status_word(v_now, 'en'),
      'From the latest reports. Tap for details.',
      '/checkpoints/' || new.checkpoint_id);
  end loop;
  return null;
end;
$$;

create or replace function public.ask_near_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c  record;
  p  record;
begin
  for c in
    -- Flat-earth distance is plenty at 800 m: 1° latitude ≈ 111 km, 1° longitude ≈ 94 km here.
    select * from checkpoints k
     where k.lat is not null and k.lng is not null
       and sqrt(power((k.lat - new.lat) * 111000, 2) + power((k.lng - new.lng) * 94000, 2)) < 800
       and (select count(*) from checkpoint_reports r
             where r.checkpoint_id = k.id and r.created_at > now() - interval '15 minutes') < 3
  loop
    for p in
      select b.passenger_id
        from bookings b join profiles pr on pr.id = b.passenger_id
       where b.trip_id = new.trip_id and b.status = 'accepted'
         and pr.ask_near_checkpoints
    loop
      insert into checkpoint_asks (trip_id, user_id, checkpoint_id) values (new.trip_id, p.passenger_id, c.id)
      on conflict do nothing;
      continue when not found;
      perform send_push(
        p.passenger_id, 'checkpoint_ask',
        'تمرّون من ' || c.name_ar || '؟',
        'كيف الوضع الآن؟ ضغطة واحدة تساعد الجميع.',
        'Passing ' || c.name_en || '?',
        'How is it now? One tap helps everyone.',
        '/checkpoints/' || c.id);
    end loop;
  end loop;
  return null;
end;
$$;

-- ─── Driver changed the trip's way ────────────────────────────────────────────
create or replace function public.change_trip_way(p_trip uuid, p_checkpoints text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trips;
  r record;
begin
  select * into t from trips where id = p_trip and driver_id = auth.uid() for update;
  if not found then
    raise exception 'not_your_trip';
  end if;
  if t.cancelled_at is not null or t.finished_at is not null then
    raise exception 'trip_over';
  end if;
  if t.checkpoint_ids = coalesce(p_checkpoints, '{}') then
    return;
  end if;
  update trips set checkpoint_ids = coalesce(p_checkpoints, '{}') where id = p_trip;
  for r in
    select b.passenger_id
      from bookings b
     where b.trip_id = p_trip and b.status in ('requested', 'accepted')
  loop
    perform send_push(
      r.passenger_id, 'way_changed',
      'تغيّرت طريق رحلتك',
      'غيّر السائق الحواجز التي تمرّ بها الرحلة. افتح الرحلة لترى الطريق الجديدة.',
      'Your trip''s way changed',
      'Your driver changed the checkpoints the trip goes through. Open the trip to see the new way.',
      '/trips/' || p_trip);
  end loop;
end;
$$;
