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

-- Supabase Realtime broadcasts changes for the tables in this publication.
create publication supabase_realtime;

-- Stand-in for pg_net: instead of sending HTTP requests, remember them so tests can check.
create schema net;
create table net.sent (id bigint generated always as identity, url text, body jsonb);
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000
) returns bigint language sql as $$
  insert into net.sent (url, body) values (url, body) returning id
$$;

-- Stand-in for Supabase Storage: just the tables and helper our policies use.
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
-- Folder parts of a path: 'a/b/c.jpg' -> {a,b}
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated;
