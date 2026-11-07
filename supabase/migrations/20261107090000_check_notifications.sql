-- Tell people when an admin decides on their ID check (approved or rejected).
-- Same pipeline as booking pushes (see push_notifications): a trigger builds the message in
-- the person's language and pg_net sends it after the transaction commits.

create or replace function public.notify_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lang      text;
  female    boolean;
  title     text;
  body      text;
  messages  jsonb;
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    return null;
  end if;

  select jsonb_agg(jsonb_build_object('to', token)) into messages
    from push_tokens where user_id = new.user_id;
  if messages is null then
    return null; -- no phone registered; they'll see it next time they open the app
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

  select jsonb_agg(m || jsonb_build_object(
           'title', title, 'body', body, 'sound', 'default',
           'data', jsonb_build_object('url', '/verify?kind=' || new.kind)))
    into messages
    from jsonb_array_elements(messages) m;

  -- A push problem must never undo the admin's decision.
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

create trigger verifications_notify
after update of status on public.verifications
for each row execute function public.notify_verification_decision();

revoke execute on function public.notify_verification_decision() from public, anon, authenticated;
