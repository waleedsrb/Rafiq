-- Minimal stand-ins for what a real Supabase database already has,
-- so CI can test our migrations on plain Postgres. Never run this on Supabase.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, phone text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase gives these roles table access by default and relies on RLS to filter.
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;

-- Stand-in for pg_net: instead of sending HTTP requests, remember them so tests can check.
create schema net;
create table net.sent (id bigint generated always as identity, url text, body jsonb);
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000
) returns bigint language sql as $$
  insert into net.sent (url, body) values (url, body) returning id
$$;
