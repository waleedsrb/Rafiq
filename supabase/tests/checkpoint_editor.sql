-- Checks the admin checkpoint editor (20261110110000_checkpoint_editor.sql).
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

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000ed001'), ('00000000-0000-0000-0000-0000000ed002');
insert into public.profiles (id, full_name) values
  ('00000000-0000-0000-0000-0000000ed001', 'Ada Admin'), ('00000000-0000-0000-0000-0000000ed002', 'Nour Nobody');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-0000000ed001');

do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;

-- 1. Someone who isn't an admin can't add or hide.
select pg_temp.as_user('00000000-0000-0000-0000-0000000ed002');
select pg_temp.expect_error($$select public.admin_save_checkpoint(null, 'حاجز', 'Test gate', 'gate', 32.0, 35.2)$$, 'admins_only');
select pg_temp.expect_error($$select public.admin_hide_checkpoint('huwara', true)$$, 'admins_only');

-- 2. An admin adds one; a place outside the West Bank or a missing name is refused.
select pg_temp.as_user('00000000-0000-0000-0000-0000000ed001');
select pg_temp.expect_error($$select public.admin_save_checkpoint(null, 'حاجز', 'Test gate', 'gate', 35.2, 32.0)$$, 'place_outside');
select pg_temp.expect_error($$select public.admin_save_checkpoint(null, '', 'Test gate', 'gate', 32.0, 35.2)$$, 'name_needed');
create temp table added as select public.admin_save_checkpoint(null, 'بوابة تجربة', 'Test gate', 'gate', 32.0, 35.2, 'Ramallah and al-Bireh Governorate') as id;
do $$ declare r record; begin
  select * into r from public.checkpoint_overview() o where o.id = (select id from added);
  if r.name_en <> 'Test gate' or r.kind <> 'gate' or r.lat <> 32.0 or r.governorate <> 'Ramallah and al-Bireh Governorate' then
    raise exception 'FAIL: new checkpoint looks wrong: %', row_to_json(r);
  end if;
end $$;

-- 3. Fixing it keeps the id and the governorate when none is given.
select public.admin_save_checkpoint((select id from added), 'بوابة تجربة', 'Test gate north', 'gate', 32.01, 35.2);
do $$ begin
  if (select name_en || governorate from public.checkpoints where id = (select id from added)) <> 'Test gate northRamallah and al-Bireh Governorate' then
    raise exception 'FAIL: edit lost something';
  end if;
end $$;

-- 4. Hidden ones leave the overview, and come back when shown again.
select public.admin_hide_checkpoint((select id from added), true);
do $$ begin
  if exists (select 1 from public.checkpoint_overview() o where o.id = (select id from added)) then
    raise exception 'FAIL: hidden checkpoint still in the overview';
  end if;
end $$;
select public.admin_hide_checkpoint((select id from added), false);
do $$ begin
  if not exists (select 1 from public.checkpoint_overview() o where o.id = (select id from added)) then
    raise exception 'FAIL: shown checkpoint missing';
  end if;
end $$;

rollback;
