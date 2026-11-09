-- Read/delete must affect one owned message, preserve read time and never expose
-- another user's row, including when two notifications point at the same trip.
begin;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-000000000a01', '970599000101'),
 ('00000000-0000-0000-0000-000000000a02', '970599000102');
insert into public.profiles (id, full_name, gender, language) values
 ('00000000-0000-0000-0000-000000000a01', 'Amir Saleh', 'm', 'en'),
 ('00000000-0000-0000-0000-000000000a02', 'Dana Haddad', 'f', 'en');
insert into public.notifications (id, user_id, kind, title, body, url) overriding system value values
 (-101, '00000000-0000-0000-0000-000000000a01', 'accepted', 'First', 'First', '/trips/shared'),
 (-102, '00000000-0000-0000-0000-000000000a01', 'accepted', 'Second', 'Second', '/trips/shared'),
 (-103, '00000000-0000-0000-0000-000000000a02', 'accepted', 'Other', 'Other', '/trips/shared');

-- A historical read time catches accidental rewrites even though now() is
-- constant throughout this transaction.
insert into public.notifications (id, user_id, kind, title, body, read_at) overriding system value values
 (-104, '00000000-0000-0000-0000-000000000a01', 'accepted', 'Read before', 'Read before', '2026-01-01T10:00:00Z');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);
set local role authenticated;
do $$
declare marked timestamptz;
begin
 if public.mark_notification_read(-104) is distinct from '2026-01-01T10:00:00Z'::timestamptz
    or (select read_at from public.notifications where id = -104) is distinct from '2026-01-01T10:00:00Z'::timestamptz then
   raise exception 'FAIL: historical read time was replaced';
 end if;
 marked := public.mark_notification_read(-101);
 if marked is null then raise exception 'FAIL: own message not marked'; end if;
 if public.mark_notification_read(-101) is distinct from marked then
   raise exception 'FAIL: read timestamp changed on a repeat';
 end if;
 if (select read_at from public.notifications where id = -102) is not null then
   raise exception 'FAIL: another message at the same URL marked read';
 end if;
 if public.mark_notification_read(-103) is not null or public.mark_notification_read(-999) is not null then
   raise exception 'FAIL: foreign/missing read revealed or changed a row';
 end if;
 if public.delete_notification(-103) or public.delete_notification(-999) then
   raise exception 'FAIL: foreign/missing delete succeeded';
 end if;
 if not public.delete_notification(-101) or public.delete_notification(-101) then
   raise exception 'FAIL: owned deletion or repeated deletion result incorrect';
 end if;
 if exists(select 1 from public.notifications where id = -101) then raise exception 'FAIL: deleted row remains'; end if;
 if not exists(select 1 from public.notifications where id = -102) then raise exception 'FAIL: sibling deleted'; end if;
 -- Even if default table ACLs include writes, RLS must deny content edits/deletes.
 begin
   update public.notifications set title = 'forged' where id = -102;
 exception when insufficient_privilege then null;
 end;
 if exists(select 1 from public.notifications where title = 'forged') then raise exception 'FAIL: direct content edit'; end if;
 begin
   delete from public.notifications where id = -102;
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from public.notifications where id = -102) then raise exception 'FAIL: direct delete'; end if;
end $$;
reset role;
do $$ begin
 if (select read_at from public.notifications where id = -103) is not null then raise exception 'FAIL: foreign read changed'; end if;
 if not exists(select 1 from public.notifications where id = -103) then raise exception 'FAIL: foreign message deleted'; end if;
end $$;

-- A session with no subject cannot use the privileged helpers.
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
do $$ begin
 begin
   perform public.mark_notification_read(-102);
   raise exception 'FAIL: subjectless read';
 exception when raise_exception then
   if sqlerrm <> 'Sign in first' then raise; end if;
 end;
 begin
   perform public.delete_notification(-102);
   raise exception 'FAIL: subjectless delete';
 exception when raise_exception then
   if sqlerrm <> 'Sign in first' then raise; end if;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
   perform public.mark_notification_read(-102);
   raise exception 'FAIL: anon can mark read';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.delete_notification(-102);
   raise exception 'FAIL: anon can delete';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

-- Delivery includes an exact string ID; old pushes without this field remain
-- navigable, but clients deliberately avoid guessing which rows to mark read.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);
select public.register_push_token('ExponentPushToken[inbox-actions]');
select public.send_push('00000000-0000-0000-0000-000000000a01', 'accepted', 'Latest', 'Latest', '/trips/shared');
do $$
declare payload jsonb; inbox_id bigint;
begin
 select body -> 0 -> 'data' into payload from net.sent order by id desc limit 1;
 select id into inbox_id from public.notifications where title = 'Latest' order by id desc limit 1;
 if payload ->> 'notification_id' is distinct from inbox_id::text
    or jsonb_typeof(payload -> 'notification_id') <> 'string'
    or payload ->> 'url' <> '/trips/shared' or payload ->> 'kind' <> 'accepted' then
   raise exception 'FAIL: notification push payload %', payload;
 end if;
end $$;
select 'All notification action checks passed' as result;
rollback;
