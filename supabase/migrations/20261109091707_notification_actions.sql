-- Narrow inbox actions: no direct client UPDATE/DELETE grants on notifications.
-- Privileged implementations stay outside the exposed public API schema; wrappers
-- retain the app's RPC names. Both paths authenticate and filter by owner.
create schema if not exists rafiq_private;
revoke all on schema rafiq_private from public, anon;
grant usage on schema rafiq_private to authenticated;

create or replace function rafiq_private.mark_notification_read(p_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  marked_at timestamptz;
begin
  if me is null then raise exception 'Sign in first'; end if;
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_id and user_id = me
   returning read_at into marked_at;
  return marked_at; -- null for missing or someone else's row, without revealing which
end;
$$;

create or replace function rafiq_private.delete_notification(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  delete from public.notifications where id = p_id and user_id = me;
  return found;
end;
$$;

revoke all on function rafiq_private.mark_notification_read(bigint) from public, anon;
revoke all on function rafiq_private.delete_notification(bigint) from public, anon;
grant execute on function rafiq_private.mark_notification_read(bigint) to authenticated;
grant execute on function rafiq_private.delete_notification(bigint) to authenticated;

create or replace function public.mark_notification_read(p_id bigint)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select rafiq_private.mark_notification_read(p_id); $$;

create or replace function public.delete_notification(p_id bigint)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select rafiq_private.delete_notification(p_id); $$;

revoke all on function public.mark_notification_read(bigint) from public, anon;
revoke all on function public.delete_notification(bigint) from public, anon;
grant execute on function public.mark_notification_read(bigint) to authenticated;
grant execute on function public.delete_notification(bigint) to authenticated;

-- Push taps can mark exactly the inbox row that produced the push, even when
-- several messages link to the same trip. A string avoids numeric ID precision loss.
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
