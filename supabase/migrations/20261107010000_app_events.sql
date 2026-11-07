-- Funnel steps outside of bookings (sign up first, more later).
-- One row per step. install_id is a random id the app makes on first launch,
-- so we can link steps that happen before someone is signed in to the ones after.
--
-- Example question this answers:
--   "Of the people who typed a phone number, how many finished their profile?"

create table public.app_events (
  id          bigint generated always as identity primary key,
  install_id  uuid not null,
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null check (name ~ '^[a-z_]{3,60}$'),
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index app_events_name_time_idx on public.app_events (name, created_at);

alter table public.app_events enable row level security;

-- The app may only ADD events, never read, change or delete them.
-- A signed-in person may only attach their own user id.
create policy app_events_insert on public.app_events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Supabase grants every role full table access by default and relies on RLS.
-- Here we go further and take away everything except INSERT.
revoke all on public.app_events from anon, authenticated;
grant insert on public.app_events to anon, authenticated;
