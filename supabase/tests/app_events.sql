-- Checks that the app can add funnel events but never read or forge them.
begin;

set local role anon;

-- 1. Signed-out people can log a step.
insert into public.app_events (install_id, name) values (gen_random_uuid(), 'signup_started');

-- 2. ...but cannot read anyone's events.
do $$ begin
  perform 1 from public.app_events;
  raise exception 'FAIL: anon could read app_events';
exception when insufficient_privilege then null;
end $$;

-- 3. ...and cannot pretend to be a signed-in user.
do $$ begin
  insert into public.app_events (install_id, user_id, name)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000099', 'signup_started');
  raise exception 'FAIL: anon could attach a user_id';
exception when insufficient_privilege then null;
end $$;

-- 4. Event names must be snake_case.
do $$ begin
  insert into public.app_events (install_id, name) values (gen_random_uuid(), 'Bad Name!');
  raise exception 'FAIL: bad event name accepted';
exception when check_violation then null;
end $$;

reset role;
select 'All app_events checks passed' as result;
rollback;
