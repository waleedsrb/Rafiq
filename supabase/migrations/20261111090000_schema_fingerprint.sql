-- Drift check: a short "fingerprint" of the database's shape, so we can prove that the live
-- database matches supabase/migrations/.
--
-- Database changes reach Supabase by hand (pasted into the SQL Editor), so a slice can be
-- missed or half-applied. A nightly GitHub Action (.github/workflows/drift-check.yml) builds a
-- fresh database from the migrations, asks both databases for this fingerprint, and opens an
-- issue listing every difference.
--
-- One key per object, like "function request_seat(p_trip uuid)" -> hash. It covers tables,
-- columns, constraints, indexes, RLS switches, policies (public and storage), functions with
-- their grants, triggers and views. The hash is an md5 of the object's definition, so a
-- function that exists but still holds old code shows up too.
-- Objects that belong to extensions are left out. Only the server key may call it.

create or replace function public.schema_fingerprint()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f.kind || ' ' || f.name, f.hash), '{}'::jsonb)
  from (
  with
  ext_objects as (
    select objid from pg_catalog.pg_depend where deptype = 'e'
  ),
  rels as (
    select c.oid, c.relname, c.relkind, c.relrowsecurity
    from pg_catalog.pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'v', 'm', 'p')
      and c.oid not in (select objid from ext_objects)
  )
  -- Tables and views (a view's hash is its query)
  select case r.relkind when 'v' then 'view' when 'm' then 'view' else 'table' end,
         r.relname::text,
         md5(case when r.relkind in ('v', 'm') then pg_catalog.pg_get_viewdef(r.oid) else r.relkind::text end)
  from rels r
  union all
  -- Row level security switched on or off
  select 'rls', r.relname::text, md5(r.relrowsecurity::text)
  from rels r where r.relkind in ('r', 'p')
  union all
  -- Columns: type, not null, default
  select 'column', r.relname || '.' || a.attname,
         md5(concat_ws('|', pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
                       pg_catalog.pg_get_expr(d.adbin, d.adrelid), a.attgenerated))
  from rels r
  join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_catalog.pg_attrdef d on d.adrelid = r.oid and d.adnum = a.attnum
  where r.relkind in ('r', 'p')
  union all
  -- Constraints: primary keys, foreign keys, checks, unique
  select 'constraint', r.relname || '.' || con.conname,
         md5(pg_catalog.pg_get_constraintdef(con.oid))
  from rels r join pg_catalog.pg_constraint con on con.conrelid = r.oid
  union all
  -- Indexes
  select 'index', i.relname::text, md5(pg_catalog.pg_get_indexdef(i.oid))
  from pg_catalog.pg_index x
  join pg_catalog.pg_class i on i.oid = x.indexrelid
  join rels r on r.oid = x.indrelid
  union all
  -- Policies (also on storage.objects, where the ID and profile photo rules live)
  select 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
         md5(concat_ws('|', p.permissive, p.roles::text, p.cmd, p.qual, p.with_check))
  from pg_catalog.pg_policies p
  where p.schemaname in ('public', 'storage')
  union all
  -- Functions: full definition, plus who may call them
  select 'function', p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         -- The body is compared without comments and spacing, so a copy pasted from a slightly
         -- different file (same code, other comments) still counts as the same.
         md5(concat_ws('|',
           pg_catalog.pg_get_function_result(p.oid), p.prosecdef, p.provolatile, p.proconfig::text,
           regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')) || '|' || coalesce(
           (select string_agg(g.who || ':' || g.privilege_type, ',' order by 1)
            from (select case acl.grantee when 0 then 'PUBLIC' else acl.grantee::regrole::text end as who,
                         acl.privilege_type
                  from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl) g
            where g.who in ('PUBLIC', 'anon', 'authenticated', 'service_role')), ''))
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prokind in ('f', 'p')
    and p.oid not in (select objid from ext_objects)
  union all
  -- Triggers
  select 'trigger', r.relname || '.' || t.tgname, md5(pg_catalog.pg_get_triggerdef(t.oid))
  from rels r join pg_catalog.pg_trigger t on t.tgrelid = r.oid and not t.tgisinternal
  union all
  -- Triggers on auth.users (new sign-ups create a profile row)
  select 'trigger', 'auth.users.' || t.tgname, md5(pg_catalog.pg_get_triggerdef(t.oid))
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
    and t.tgfoid in (select oid from pg_catalog.pg_proc where pronamespace = 'public'::regnamespace)
  ) f (kind, name, hash)
$$;

revoke all on function public.schema_fingerprint() from public, anon, authenticated;
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.schema_fingerprint() to service_role;
  end if;
end $$;

-- pg_cron jobs live outside public, and CI has no pg_cron, so they get their own small list.
-- The drift check compares it with the cron.schedule(...) calls in the migrations.
create or replace function public.cron_fingerprint()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if to_regclass('cron.job') is null then
    return '{}'::jsonb;
  end if;
  -- One key per job: name -> "schedule | command", plus " | paused" if switched off
  execute $q$
    select coalesce(jsonb_object_agg(jobname, schedule || ' | ' || command
      || case when active then '' else ' | paused' end), '{}'::jsonb) from cron.job
  $q$ into result;
  return result;
end;
$$;

revoke all on function public.cron_fingerprint() from public, anon, authenticated;
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.cron_fingerprint() to service_role;
  end if;
end $$;
