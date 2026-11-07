-- Checks slice 15a: checkpoint reports imported from public Telegram channels.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
create function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected an error containing "%" from: %', needle, sql;
exception when others then
  if sqlerrm not like '%' || needle || '%' then
    raise exception 'FAIL: expected "%", got "%" from: %', needle, sqlerrm, sql;
  end if;
end $$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh');

-- 1. The channel job (the server, no signed-in user) adds a report with the post's own time.
select pg_temp.as_user(null);
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref, created_at)
values ('huwara', 'closed', 'channel', 'roads_ps/101/huwara', now() - interval '40 minutes');
do $$ declare r record; begin
  select * into r from public.checkpoint_reports where channel_ref = 'roads_ps/101/huwara';
  if r.reporter_id is not null or r.created_at > now() - interval '39 minutes' then
    raise exception 'FAIL: channel report was %', row_to_json(r);
  end if;
end $$;

-- 2. The same post twice is ignored (what the job's "on conflict do nothing" relies on).
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref)
values ('huwara', 'closed', 'channel', 'roads_ps/101/huwara')
on conflict (channel_ref) do nothing;
do $$ begin
  if (select count(*) from public.checkpoint_reports where checkpoint_id = 'huwara') <> 1 then
    raise exception 'FAIL: duplicate channel post was counted';
  end if;
end $$;

-- 3. Times from the future or from long ago are clamped.
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref, created_at)
values ('atara', 'open', 'channel', 'roads_ps/102/atara', now() + interval '1 hour'),
       ('zaatara', 'open', 'channel', 'roads_ps/103/zaatara', now() - interval '1 day');
do $$ begin
  if (select created_at from public.checkpoint_reports where channel_ref = 'roads_ps/102/atara') > now() then
    raise exception 'FAIL: future time kept';
  end if;
  if (select created_at from public.checkpoint_reports where channel_ref = 'roads_ps/103/zaatara') < now() - interval '2 hours' then
    raise exception 'FAIL: old time kept';
  end if;
end $$;

-- 4. A channel report must name its post and nobody; a person's report must name them.
select pg_temp.expect_error($$insert into public.checkpoint_reports (checkpoint_id, status, source)
  values ('atara', 'open', 'channel')$$, 'checkpoint_reports_who');
select pg_temp.expect_error($$insert into public.checkpoint_reports (checkpoint_id, status)
  values ('atara', 'open')$$, 'checkpoint_reports_who');

-- 5. It shows up in the shared view as a public channel.
do $$ begin
  if (select status from public.checkpoint_overview() where id = 'huwara') <> 'closed' then
    raise exception 'FAIL: channel report not counted';
  end if;
  if (select source from public.checkpoint_recent('huwara') limit 1) <> 'channel' then
    raise exception 'FAIL: source should be channel';
  end if;
end $$;

-- 6. A signed-in person can't pretend to be a channel: source and ref are overwritten.
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref, created_at)
values ('huwara', 'open', 'channel', 'fake/1/huwara', now() - interval '1 hour');
reset role;
do $$ declare r record; begin
  select * into r from public.checkpoint_reports
   where reporter_id = '00000000-0000-0000-0000-0000000000a1';
  if r.source <> 'passenger' or r.channel_ref is not null or r.created_at < now() - interval '1 minute' then
    raise exception 'FAIL: person faked a channel report: %', row_to_json(r);
  end if;
end $$;

select 'All checkpoint channel checks passed' as result;
rollback;
