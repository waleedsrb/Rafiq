-- Checks slice 15c: trusted reporters weigh more, and confirmed vs unconfirmed.
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Amir Saleh'), ('00000000-0000-0000-0000-0000000000a2', 'Aya Nasser'),
  ('00000000-0000-0000-0000-0000000000a3', 'Omar Khalil');

-- Amir's track record: 3 reports last week, each backed up by Aya within 10 minutes.
alter table public.checkpoint_reports disable trigger checkpoint_reports_guard;
alter table public.checkpoint_reports disable trigger checkpoint_reports_announce;
insert into public.checkpoint_reports (checkpoint_id, reporter_id, status, created_at) values
  ('huwara',  '00000000-0000-0000-0000-0000000000a1', 'closed',  now() - interval '7 days'),
  ('huwara',  '00000000-0000-0000-0000-0000000000a2', 'closed',  now() - interval '7 days' + interval '10 minutes'),
  ('zaatara', '00000000-0000-0000-0000-0000000000a1', 'open',    now() - interval '6 days'),
  ('zaatara', '00000000-0000-0000-0000-0000000000a2', 'open',    now() - interval '6 days' + interval '5 minutes'),
  ('atara',   '00000000-0000-0000-0000-0000000000a1', 'crowded', now() - interval '5 days'),
  ('atara',   '00000000-0000-0000-0000-0000000000a2', 'crowded', now() - interval '5 days' - interval '5 minutes');
alter table public.checkpoint_reports enable trigger checkpoint_reports_guard;
alter table public.checkpoint_reports enable trigger checkpoint_reports_announce;

-- 1. The weight comes from the track record: Amir 1.3, Omar (new) 1.
do $$ begin
  if public.reporter_weight('00000000-0000-0000-0000-0000000000a1') <> 1.3 then
    raise exception 'FAIL: Amir weight %', public.reporter_weight('00000000-0000-0000-0000-0000000000a1');
  end if;
  if public.reporter_weight('00000000-0000-0000-0000-0000000000a3') <> 1 then
    raise exception 'FAIL: Omar weight %', public.reporter_weight('00000000-0000-0000-0000-0000000000a3');
  end if;
end $$;

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 2. One report: shown, but unconfirmed. The phone can't pick its own weight.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into public.checkpoint_reports (checkpoint_id, status, weight) values ('uyun_haramiya', 'open', 2);
do $$ declare u record; begin
  select * into u from public.checkpoint_overview() where id = 'uyun_haramiya';
  if u.status <> 'open' or u.confirmed or u.agreeing_30m <> 1 then raise exception 'FAIL: one report was %', row_to_json(u); end if;
end $$;

-- 3. A second person agrees: confirmed.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.checkpoint_reports (checkpoint_id, status) values ('uyun_haramiya', 'open');
do $$ declare u record; begin
  select * into u from public.checkpoint_overview() where id = 'uyun_haramiya';
  if u.status <> 'open' or not u.confirmed or u.agreeing_30m <> 2 then raise exception 'FAIL: two reports were %', row_to_json(u); end if;
end $$;

-- 4. Trusted outweighs new: Amir (1.3) says closed, then Omar (1) says open. Equal weights
--    would give the newest (open); Amir's record tips it to closed, still unconfirmed.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'closed');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'open');
do $$ declare h record; begin
  select * into h from public.checkpoint_overview() where id = 'huwara';
  if h.status <> 'closed' or h.confirmed or h.reports_30m <> 2 then raise exception 'FAIL: weighted huwara was %', row_to_json(h); end if;
end $$;

reset role;
do $$ begin
  if (select weight from public.checkpoint_reports where checkpoint_id = 'uyun_haramiya'
        and reporter_id = '00000000-0000-0000-0000-0000000000a3') <> 1 then
    raise exception 'FAIL: the phone set its own weight';
  end if;
end $$;

-- 5. One person reporting twice is still one voice (their newest counts).
alter table public.checkpoint_reports disable trigger checkpoint_reports_guard;
update public.checkpoint_reports set created_at = now() - interval '10 minutes'
 where checkpoint_id = 'huwara' and reporter_id = '00000000-0000-0000-0000-0000000000a3';
alter table public.checkpoint_reports enable trigger checkpoint_reports_guard;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
insert into public.checkpoint_reports (checkpoint_id, status) values ('huwara', 'open');
do $$ declare h record; begin
  select * into h from public.checkpoint_overview() where id = 'huwara';
  if h.status <> 'closed' or h.confirmed or h.reports_30m <> 3 then raise exception 'FAIL: repeat voice huwara was %', row_to_json(h); end if;
end $$;
reset role;

-- 6. Two posts from the same public channel are one voice, not a confirmation.
select pg_temp.as_user(null);
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref) values
  ('zaatara', 'crowded', 'channel', 'roads_ps/201/zaatara'),
  ('zaatara', 'crowded', 'channel', 'roads_ps/202/zaatara');
do $$ declare z record; begin
  select * into z from public.checkpoint_overview() where id = 'zaatara';
  if z.status <> 'crowded' or z.confirmed or z.agreeing_30m <> 1 then raise exception 'FAIL: one channel was %', row_to_json(z); end if;
end $$;
-- ...but a different channel agreeing confirms it.
insert into public.checkpoint_reports (checkpoint_id, status, source, channel_ref)
values ('zaatara', 'crowded', 'channel', 'nablus_roads/9/zaatara');
do $$ begin
  if not (select confirmed from public.checkpoint_overview() where id = 'zaatara') then raise exception 'FAIL: two channels not confirmed'; end if;
end $$;

select 'All checkpoint confidence checks passed' as result;
rollback;
