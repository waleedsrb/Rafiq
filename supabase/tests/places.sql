-- Checks places and place search (whole West Bank, step 1).
begin;

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
$$;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
do $$ begin execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace); end $$;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

do $$
declare r record; n int;
begin
  -- 1. Spellings fold together: hamza, taa marbuta, alif maqsura, case.
  if public.fold_name('أريحا') <> public.fold_name('اريحا') then raise exception 'FAIL: hamza not folded'; end if;
  if public.fold_name('البيرة') <> 'البيره' then raise exception 'FAIL: taa marbuta not folded'; end if;
  if public.fold_name('Al-Bireh') <> 'albireh' then raise exception 'FAIL: got %', public.fold_name('Al-Bireh'); end if;

  -- 2. The main cities are there and can be picked.
  select count(*) into n from public.places where region = 'west_bank' and name_en in ('Ramallah', 'Nablus', 'Jenin', 'Hebron', 'Jericho');
  if n < 5 then raise exception 'FAIL: expected the main cities, found %', n; end if;

  -- 3. Search in Arabic or English finds Nablus first.
  select * into r from public.search_places('نابلس') limit 1;
  if r.name_en <> 'Nablus' or r.region <> 'west_bank' then raise exception 'FAIL: arabic search gave %', row_to_json(r); end if;
  select * into r from public.search_places('nabl') limit 1;
  if r.name_en <> 'Nablus' then raise exception 'FAIL: english search gave %', row_to_json(r); end if;
  -- Typed with a plain alif, still finds أريحا.
  select * into r from public.search_places('اريحا') limit 1;
  if r.name_en <> 'Jericho' then raise exception 'FAIL: folded search gave %', row_to_json(r); end if;

  -- 4. Flagged places come after every West Bank place, at most 3 of them.
  select count(*) into n from (
    select region, row_number() over () as i from public.search_places('be', 31.9, 35.2, 12)
  ) x where region <> 'west_bank';
  if n > 3 then raise exception 'FAIL: % flagged results', n; end if;
  if exists (
    with s as (select region, row_number() over () as i from public.search_places('be', 31.9, 35.2, 12))
    select 1 from s a join s b on a.i < b.i where a.region <> 'west_bank' and b.region = 'west_bank'
  ) then raise exception 'FAIL: a flagged place came before a West Bank one'; end if;

  -- 5. Settlements and places outside are flagged, never west_bank.
  if exists (select 1 from public.places where name_en in ('Ariel', 'Beitar Ilit', 'Ma''ale Adumim') and region = 'west_bank') then
    raise exception 'FAIL: a settlement is pickable';
  end if;
  if (select region from public.places where name_en = 'Tel Aviv-Yafo' limit 1) is distinct from 'outside'
     and exists (select 1 from public.places where name_en = 'Tel Aviv-Yafo') then
    raise exception 'FAIL: Tel Aviv should be outside';
  end if;

  -- 6. "Use my location" in Al-Manara Square finds a Ramallah place.
  select * into r from public.place_near(31.9038, 35.2034);
  if r.region <> 'west_bank' or r.distance_km > 2 then raise exception 'FAIL: near gave %', row_to_json(r); end if;
end $$;

rollback;
